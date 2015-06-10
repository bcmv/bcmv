var express = require('express');
var mongoose = require('mongoose');
var async = require('async');
var request = require('request');
var cheerio = require('cheerio');
var _ = require('underscore');
var conf = require('../config');
var fs = require('fs');
var prettyBytes = require('pretty-bytes');
var servers = require('../lib/fileservers');
var rndm = require('rndm');
var path = require('path');
var mv = require('mv');
var fse = require('fs-extra');
var validUrl = require('valid-url');
var sms = require('../lib/sms');
var path = require('path');
var gm = require('gm');
var mime = require('mime');
var jade = require('jade');
var moment = require('moment');
var df = require('node-df');

_.str = require('underscore.string');

require('../lib/models/Media.js');

var Media = mongoose.models.Media;
var User = mongoose.models.User; 
var renderPage = require('../lib/render_page').renderPage;

var authenticate = require('./authenticate').authenticate;
var authenticateAdmin = require('./authenticate').authenticateAdmin;

var router = express.Router();

router.get('/', function(req, res) {
	renderPage(req,res,function(err,page){
		res.render('insight', page);
	});
});

router.get('/:type', function(req, res, next) {
	var type = req.params.type;
	if(!Insight[type] || typeof Insight[type] == "undefined"){
		return next(new Error("invalid request"));
	}
	Insight[type](function(err, data){
		var a = jade.renderFile('views/evals/insight-'+type+'.jade',{data:data});
		res.json({html:a});
	})
});

var Insight = {
	media: function(fn){
		var agg = [
			{
				$group:{
					_id:'$type', 
					count: { $sum: 1 },
				}
			}
		];
		Media
		.aggregate(agg)
		.exec(fn);
	},
	users: function(fn){
		async.auto({
			total: function(fn){
				User.count({}, fn)
			},
			verified: function(fn){
				User.count({verified:true}, fn)
			},
			subscribed: function(fn){
				User.count({'subscriptions.0':{$exists:true}}, fn)
			},
			stat: function(fn){
				var agg = [
					{ $match: { date_registered: { $exists: true } } },
					{
						$project:{
							year:{$year:"$date_registered"},
							month:{$month:"$date_registered"}
						}
					},
					{$group : {
						_id : {month: "$month", year : "$year"}, 
						count : {$sum : 1}
					}}					
				];
				User
				.aggregate(agg)
				.exec(fn);				
			}
		}, fn);
	},
	files: function(fn){
		var agg = [
			{$unwind:'$files'},
			{
				$project:{'files.size':1}
			},
			{
				$group:{
					_id:'files',
					total_files:{$sum:1},
					total_size:{$sum:'$files.size'}
				}
			}
		]
		Media
		.aggregate(agg)
		.exec(fn);		
	},
	disk: function(fn){
		df(function(err, res){
			if(err){
				return fn(err);
			}
			res = res.filter(function(r){
				return r.filesystem.indexOf('172.19.51.1') != -1;
			});
			fn(null, res);
		});
	},
	issues: function(fn){
		request({
			url:'http://202.21.176.107/api/v3/projects/1/issues?private_token=K6LQG-2_8F_vCj-DtzF8&per_page=5000',
			json:true
		}, function(err, response, body){
			if(err){
				return fn(err);
			}
			if(response.statusCode == 200){
				var data = _.countBy(body, function(issue){
					return issue.state;
				});
				fn(null, data);
			}else{
				fn("invalid json");
			}
		});
	}
}
module.exports = router;
