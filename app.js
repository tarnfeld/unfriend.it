
/**
 * Load everything in
 */

var express = require('express')
    , connect_redis = require('connect-redis')(express)
    , redis = require('redis')
    , ejs = require('ejs')
    , graph = require('fbgraph')
    , resque = require('coffee-resque')
    , crypto = require('crypto')
    , conf = require('./config')
    , socketio = require('socket.io');

var app = module.exports = express.createServer();
var resque = require('coffee-resque').connect(conf.redis);

var db_users = redis.createClient(conf.redis.port, conf.redis.host)
  , db_friends = redis.createClient(conf.redis.port, conf.redis.host)
  , db_notifications = redis.createClient(conf.redis.port, conf.redis.host)
  , db_session = redis.createClient(conf.redis.port, conf.redis.host)

if (conf.redis.password) {
  db_users.auth(conf.redis.password);
  db_friends.auth(conf.redis.password);
  db_notifications.auth(conf.redis.password);
  db_session.auth(conf.redis.password);
}

db_users.select(0);
db_friends.select(1);
db_notifications.select(2);
db_session.select(3);

/**
 * Webapp
 */

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');

  app.use(express.cookieParser());

  var session = new connect_redis({
    client: db_session
  });
  app.use(express.session({ store: session, secret: 'keyboard cat' }));

  app.helpers({
    _: require('underscore')
  });

  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);

  app.use(express.static(__dirname + '/public'));
});

// Environment based configuration

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  app.use(express.logger());
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Middleware

function auth_require(req, res, next) {
  if (req.session.user) {
    db_users.get(req.session.user.hash, function(err, reply) {
      if (reply) {
        req.user = JSON.parse(reply);
        next();
      } else {
        res.redirect("/");
      }
    });
  } else {
    res.redirect("/");
  }
}

function auth_check(req, res, next) {
  if (req.session.user) {
    db_users.get(req.session.user.hash, function(err, reply) {
      if (reply) {
        res.redirect("/friends");
      } else {
        next();
      }
    });
  } else {
    next();
  }
}

// Routes

app.get('/', auth_check, function(req, res) {

  res.render('index', {
    layout: "layout-mini"
  });
});

app.get('/auth/facebook', function(req, res) {
  req.session.user = false;
  if (!req.query.code) {

    var authUrl = graph.getOauthUrl(conf.fb);
    if (!req.query.error) {
      res.redirect(authUrl);
    } else {
      res.render('auth/denied', {
        layout: "layout-mini"
      });
    }
    return;
  }

  graph.authorize({
      "client_id":      conf.fb.client_id
    , "redirect_uri":   conf.fb.redirect_uri
    , "client_secret":  conf.fb.client_secret
    , "code":           req.query.code
    , "scope":          conf.fb.scope
  }, function (err, facebookRes) {
    if (facebookRes.access_token) {
      var hashed_token = crypto.createHash('md5').update(facebookRes.access_token).digest("hex");

      graph.get('me', function(err, data) {
        if (data) {
          var user = {
            hash: hashed_token,
            access_token: facebookRes.access_token,
            email: data.email,
            name: data.name,
            link: data.link
          };

          db_users.set(hashed_token, JSON.stringify(user));
          req.session.user = user;

          db_friends.get("generating:" + user.hash, function(err, reply) {
            if (!reply) {
              db_friends.del(user.hash);
              resque.enqueue('fb', 'generate', [user.hash]);
              db_friends.set("generating:" + user.hash, true);
            }
          });

          res.redirect('/friends');
          return;
        } else {
          res.redirect('/');
          return;
        }
      });
    }
  });
});

app.get('/auth/logout', function(req, res) {
  req.session.user = null;
  res.redirect("/");
});

app.get('/friends', auth_require, function(req, res) {
  db_friends.get(req.user.hash, function(err, reply) {
    // resque.enqueue('fb', 'generate', [req.user.hash]);
    if (reply) {
      db_friends.get(req.user.hash + '_lists', function(err, data) {
        if (data) {
          var friends = JSON.parse(reply),
              lists = JSON.parse(data);

          if (friends) {
            res.render('friends', {
              friends: friends,
              user: req.user,
              lists: lists
            });
          } else {
            res.render('friends', {
              friends: [],
              user: req.user
            });
          }
        } else {
          res.render('friends', {
            friends: [],
            user: req.user
          });
        }
      })
    } else {
      res.render('friends', {
        friends: [],
        user: req.user
      });
    }
  });
});

app.get('/friends_list', auth_require, function(req, res) {
  db_friends.get(req.user.hash, function(err, reply) {
    if (reply) {
      var friends = JSON.parse(reply);
      if (friends) {
        res.render('friends', {
          friends: friends,
          layout: false
        });
      } else {
        res.send("");
      }
    } else {
      res.send("");
    }
  });
});

// Listen on port 8080
app.listen(8080);

/**
 * Socket.io
 */
var io = socketio.listen(app);

/**
 * Redis pubsub
 */
db_notifications.on("message", function (channel, message) {
  var message = JSON.parse(message);
  var n = {
    identifier: message.identifier,
    payload: message.payload
  };
  io.sockets.emit(message.channel, JSON.stringify(n));
});
db_notifications.subscribe('notifications:socketio');
