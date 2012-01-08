
/**
 * Module dependencies.
 */

var express = require('express')
    , redis_session = require('connect-redis')(express)
    , ejs = require('ejs')
    , graph = require('fbgraph')
    , resque = require('coffee-resque')
    , crypto = require('crypto')

var app = module.exports = express.createServer();
var redis = require('redis').createClient();
var resque = require('coffee-resque').connect({
  host: '127.0.0.1'
  , port: '6379'
});

var conf = { 
    client_id:      '187633658000500'
  , client_secret:  '081e28539779f49de75a313f87a9c6f9'
  , scope:          'email'
  , redirect_uri:   'http://localhost:8080/auth/facebook'
};

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');

  app.use(express.cookieParser());
  app.use(express.session({ store: new redis_session, secret: 'keyboard cat' }));
  
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

// Routes

app.get('/', function(req, res) {
  if (req.session.fb && req.session.fb.access_token) {
    res.redirect('/friends');
    return;
  }
  
  res.render('index', {
    layout: "layout-mini"
  });
});

app.get('/auth/facebook', function(req, res) {
  req.session.fb = false;
  
  if (!req.query.code) {
    
    var authUrl = graph.getOauthUrl({
        "client_id":     conf.client_id
      , "redirect_uri":  conf.redirect_uri
    });

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
      "client_id":      conf.client_id
    , "redirect_uri":   conf.redirect_uri
    , "client_secret":  conf.client_secret
    , "code":           req.query.code
  }, function (err, facebookRes) {
    if (facebookRes.access_token) {
      req.session.fb = facebookRes;
    }
    res.redirect('/friends');
  });
});

app.get('/friends', function(req, res) {
  
  if (!req.session.fb || !req.session.fb.access_token) {
    res.redirect('/');
    return;
  }
  
  var key = "generating_" + req.session.fb.access_token;
  redis.get(key, function(err, reply) {
    if (!reply) {
      resque.enqueue('fb', 'generate_friends', [req.session.fb.access_token]);
      redis.set(key, true);
    }
  });
  
  var length = "not generated";
  var friends_key = 'friends_cache_' + crypto.createHash('md5').update(req.session.fb.access_token).digest("hex");
  redis.llen(friends_key, function(err, reply) {
    if (reply) {
      res.render('friends', {
        length: reply
      });
    }
  });
  
//  res.render('friends', {
  //  length: length
//  });
});

// Listen on port 8080

app.listen(8080);
