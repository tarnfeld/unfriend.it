
/**
 * Resque Worker
 */

var graph = require('fbgraph')
	, resque = require('coffee-resque')
	, crypto = require('crypto')
	, _ = require('underscore')
	, redis = require('redis')
	, conf = require('./config')
	, db_users = redis.createClient(conf.redis.port, conf.redis.host)
	, db_friends = redis.createClient(conf.redis.port, conf.redis.host)
	, db_notifications = redis.createClient(conf.redis.port, conf.redis.host)

if (conf.redis.password) {
  db_users.auth(conf.redis.password);
  db_friends.auth(conf.redis.password);
  db_notifications.auth(conf.redis.password);
}

db_users.select(0);
db_friends.select(1);
db_notifications.select(2);

// Connect to resque
var queue = resque.connect(conf.redis);

// Jobs
var jobs = {
	generate_friends: function(user_hash, callback) {

		db_users.get(user_hash, function(err, reply) {
			if (reply) {
				var user = JSON.parse(reply)
				, friends = {}
				, friend;

				// Grab the friends from the facebook graph api
				graph.setAccessToken(user.access_token);
				graph.get('me/friends', function(err, res) {
					if (res.data) {
						for (var i = res.data.length - 1; i >= 0; i--) {
							friend = res.data[i];
							friends[friend.id] = friend;
						};
					}

					// Save the friends to redis
					db_friends.set(user.hash, JSON.stringify(_.values(friends)));
					
					// Delete the generating flag
					db_friends.del("generating:" + user.hash);
					
					// Send the notification into redis
					var event = {
						channel: "generated_friends",
						identifier: user.hash,
						payload: _.values(friends)
					};
					db_notifications.publish("notifications:socketio", JSON.stringify(event));

					// Finish up
					callback();
				});
			} else {
				// Throw an error
				console.log("Couldn't find user with hash " + user_hash);
				callback();
			}
		});
	}
};

// Setup the worker
var worker = queue.worker('fb', jobs);

// Events
worker.on('job', function(worker, queue, job) {
	console.log("Processing job: " + job.class);
});

// Start the worker
worker.start();
