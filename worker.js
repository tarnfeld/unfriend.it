
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
	generate: function(user_hash, callback) {

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

					graph.get('me/friendlists', function(err, res) {
						if (res.data) {
							var lists = res.data,
								x = 0;
							_.each(lists, function(list) {
								graph.get(list.id + '/members', function(err, res) {
									x++;
									if (res.data) {
										list.members = res.data;
										if (x == lists.length) {
											// Save the lists
											db_friends.set(user.hash + '_lists', JSON.stringify(_.values(lists)))

											// Enqueue the sort
											queue.enqueue('fb', 'sort', [user.hash]);

											// Finish up
											callback();
										}
									}
								});
							});
						}
					});
				});
			} else {
				// Throw an error
				console.log("Couldn't find user with hash " + user_hash);
				callback();
			}
		});
	},
	sort: function(user_hash, callback) {
		var friends, lists;

		db_friends.get(user_hash, function(err, reply) {
			if (reply) {

				friends = JSON.parse(reply);
				friends.sort(function(l, r) {
					if (l.name < r.name) return -1;
					if (l.name > r.name) return 1;
					return 0;
				});

				db_friends.set(user_hash, JSON.stringify(_.values(friends)));

				db_friends.get(user_hash + '_lists', function(err, reply) {
					if (reply) {

						lists = JSON.parse(reply);
						lists.sort(function(l, r) {
							if (l.name < r.name) return -1;
							if (l.name > r.name) return 1;
							return 0;
						});

						db_friends.set(user_hash + '_lists', JSON.stringify(_.values(lists)));

						// Delete the generating flag
						db_friends.del("generating:" + user_hash);
						
						// Send the notification into redis
						var event = {
							channel: "generated_friends",
							identifier: user_hash,
							payload: "updated_friends"
						};
						db_notifications.publish("notifications:socketio", JSON.stringify(event));

						// Finish up here
						callback();	
					} else {
						console.log("Couldn't load friend lists from key " + user_hash + "_lists");
						callback();
					}
				});
			} else {
				console.log("Couldn't load friends from key: " + key);
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
