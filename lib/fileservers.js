var redis = require('redis');
var client = redis.createClient();
var SSH = require('simple-ssh');
var async = require("async");
var fs = require('fs');
var request = require('request');
exports.statServers = function(){
	var mongoose = require('mongoose');
	mongoose.connect('mongodb://127.0.0.1:27017/v2h');
	require('./models/Log')
	var Log = mongoose.models.Log;
	
	console.log('fileserver monitor up');
	fs.readFile('./config.json', 'utf8', function (err, data) {
		var data = JSON.parse(data);
		var servers = data.fileservers;
		async.eachLimit(servers, servers.length, function doSSH(server, done){
			async.forever(function(done){
				if(!server.enabled || !server.tcp_out){
					return setTimeout(function(){ return done() }, 2000);

				}

				var info = {
					connections:-1,
					transfer_rate:-1
				};
				var url = "http://" + server.host + ":3092/?p=" + server.tcp_out;
				request({
					json:true,
					url:url
				}, function(err, resp, body){
					if(err){
						return client.set("vod:fileserver:" + server.host, JSON.stringify(info), function(err, p){
							setTimeout(done, 5000);
						});					
					}
					info.connections = body.open_connections;
					info.transfer_rate = body.transfer_rate;
					new Log({
						key:"fileserver:monitor",
						value:server.host,
						metadata:info,
						time:new Date()						
					}).save();
					client.set("vod:fileserver:" + server.host, JSON.stringify(info), function(err, p){
						done();
					});					
				});

			},function(err){
				done();
			});
		});
	});
}
exports.getServers = function(fn){
	client.keys("vod:fileserver:*", function(err, res){
		if(err){
			return fn(err);
		}
		var r = [];
		async.each(res, function(server, done){
			client.get(server, function(err, res){
				if(err) fn(err);
				var s = {}
				s.host = server.replace("vod:fileserver:",'');
				s.status = JSON.parse(res);
				r.push(s);
				done();
			})
		}, function(err){
			if(fn){
				fn(err, r);
			}
		});
	})
}