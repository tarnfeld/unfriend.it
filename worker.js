
/**
 * Resque Worker
 */

var graph = require('fbgraph')
		, resque = require('coffee-resque')
		, crypto = require('crypto')

var redis = require('redis').createClient();

// Connect to resque
var queue = resque.connect({
	host: '127.0.0.1'
	, port: '6379'
});

// Jobs
var jobs = {
	generate_friends: function(access_token, callback) {
		graph.setAccessToken(access_token);
		
		graph.get('me/friends', function(err, res) {
			if (res.data) {
				var friends = res.data;
				var friends_list = 'friends_cache_' + crypto.createHash('md5').update(access_token).digest("hex");
				
				redis.del(friends_list);
				for (var k in friends) {
					redis.rpush(friends_list, JSON.stringify(friends[k]));
				}
			}
		});
		
		var key = "generating_" + access_token;
		redis.del(key);
		
		callback();
	}
};

// Setup the worker
var worker = queue.worker('fb', jobs);

// Events
worker.on('job', function(worker, queue, job) {
	console.log("Processing job: " + job.class);
});

worker.on('poll', function(worker, queue) {
	console.log("Polling for job on queue: " + queue);
});

// Start the worker
worker.start();
