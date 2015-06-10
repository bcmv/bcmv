var express = require('express');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');
var conf = require('../config');
var fs = require('fs');
var fse = require('fs-extra');
var prettyBytes = require('pretty-bytes');
var validator = require('validator');
var sms = require('../lib/sms');
//var Media = mongoose.models.Media;
var User = mongoose.models.User;
var UserGroup = mongoose.models.UserGroup;
var Log = mongoose.models.Log;
var Ad = mongoose.models.Ad;
var Pool = require('mysql-simple-pool');
var nodemailer = require('nodemailer');
var renderPage = require('../lib/render_page').renderPage;
var moment = require('moment');
var rndm = require('rndm');
var crypto = require('crypto');
var jade = require('jade');
var authenticate = require('./authenticate').authenticate;
var authenticateAdmin = require('./authenticate').authenticateAdmin;
var access = require('../lib/access').access;
var _str = require('underscore.string');
var router = express.Router();
var path = require('path');

router.get('/', authenticate, access('marketing'), function(req, res, next) {
	async.auto({
		ads:function getAds(fn){
			Ad.find({}, fn);
		},
	}, function(err, data){
		renderPage(req,res, function(err, page){
			if(!req.xhr){
				res.render('ad',page);
			}else{
				var ads = data.ads.map(function(a){
					return {
						type:a.type,
						image:'http://img-cdn.video2home.net:8020/ads/' + a.file_name
					}
				})
				res.json(ads);
			}
		});
	});
});
router.get('/list', function(req, res, next) {
	async.auto({
		ads:function getAds(fn){
			Ad.find({}, fn);
		},
	}, function(err, data){
		var ads = data.ads.map(function(a){
			return {
				type:a.type,
				image:'http://img-cdn.video2home.net:8020/ads/' + a.file_name
			}
		})
		res.json(ads);
	});
});
router.post('/tick', function(req, res, next) {
	res.end('');
	var ids = req.body.ids;
	if(!ids){
		return;
	}
	ids.forEach(function(id){
		Ad.update({_id:id},{$inc:{views:1}}, function(err, c){});
	});
});
router.get('/ongoing', authenticate, access('marketing'), function(req, res, next) {
	Ad
	.find({effective_to:{$gt: new Date()}})
	.lean()
	.exec(function(err, ads){
		res.json(ads);
	})
});
router.get('/expired', authenticate, access('marketing'), function(req, res, next) {
	Ad
	.find({effective_to:{$lt: new Date()}})
	.lean()
	.exec(function(err, ads){
		res.json(ads);
	})
});
router.post('/', authenticate, access('marketing'), function(req, res, next) {
	var action;
	async.waterfall([
		function preCheck(fn){
			if(!req.body){
				return fn("invalid request");
			}
			if(req.body.id){
				action = "update";
			}else{
				action = "create";
			}
			fn();
		},
		function validateFields(fn){
			var id = validator.isMongoId(req.body.id) ? req.body.id : mongoose.Types.ObjectId();
			var type = req.body.type; 
			var size = req.body.size;
			var title = req.body.title;
			var payment_type = _str.trim(req.body.payment_type.toLowerCase());
			var payment_amount = validator.toFloat(req.body.payment_amount);
			var effective_from = req.body.effective_from;
			var effective_to = req.body.effective_to;
			var priority = req.body.priority;
			var url = req.body.url;
			if(!Object.keys(req.files).length && action == 'create'){
				return fn("no file selected");
			}
			if(effective_from && effective_from != ""){
				effective_from = effective_from.split("-").reverse();
				effective_from = new Date(effective_from[0], effective_from[1] -1, effective_from[2].substr(0,2));
			}else{
				return fn("invalid date");
			}
			if(effective_to && effective_to != ""){
				effective_to = effective_to.split("-").reverse();
				effective_to = new Date(effective_to[0], effective_to[1] -1, effective_to[2].substr(0,2));
			}else{
				return fn("invalid date");
			}
			if(effective_from > effective_to){
				return fn("End date cannot be greater than starting date");
			}
			if(!validator.isIn(payment_type, ["fixed", "per view"])){
				return fn("invalid payment type");
			}
			if(!validator.isFloat(payment_amount)){
				return fn("invalid payment amount");					
			}
			if(!type || type == ""){
				return fn("invalid type");
			}
			if(!title || title == ""){
				return fn("invalid title");
			}
			if(!size || title == ""){
				return fn("invalid title");
			}
			size = size.split(",");
			console.log(size)
			if(size.length != 2){
				return fn("invalid size");
			}
			if(!validator.isNumeric(size[0]) ||!validator.isNumeric(size[1])){
				return fn("invalid size");
			}
			size[0] = validator.toInt(size[0]);
			size[1] = validator.toInt(size[1]);
			console.log(id);
			var q = {
				_id:id,
				type:type, 
				size:size,
				title:title,
				payment_type:payment_type,
				payment_amount:payment_amount,
				effective_from:effective_from,
				effective_to:effective_to,
				priority:priority,

			};
			fn(null, q);
		},
		function copyFile(q, fn){
			if(!Object.keys(req.files).length){
				return fn(null, q);
			}
			var file
			for(var f in req.files){
				file = req.files[f];
				break;
			}
			q.file_name = file.name;
			q.file_extension = file.extension;
			q.file_size = file.size;
			q.file_location = path.join(conf.fs_ads_location, q.file_name);
			fse.move(file.path, q.file_location, function(err){
				if(err){
					fn(err);
				}else{
					fn(null, q);
				}
			});
		},
		function save(q, fn){
			if(action == 'create'){
				q.views = 0;
				q.time = new Date();
				q.user = req.user.username;
				q.ip = req.ip;
				new Ad(q).save(fn);
			}else{
				Ad.update({_id:q._id}, {$set:q}, fn);
			}
		}
	], function(err, resp){
		if(err){
			return res.json({error:err, message:err});
		}
		console.log(resp);
		res.json(resp);
	})
});
module.exports = router;