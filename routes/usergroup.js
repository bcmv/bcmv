var express = require('express');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');
var conf = require('../config');
var fs = require('fs');
var User = mongoose.models.User;
var UserGroup = mongoose.models.UserGroup;
var Log = mongoose.models.Log;
var moment = require('moment');
var jade = require('jade');
var access = require('../lib/access').access;
var authenticate = require('./authenticate').authenticate;


var router = express.Router();

router.get('/', authenticate, access('admin'), function(req, res) {
	async.waterfall([
		function getUserDetails(fn){
			var filter = {
				name:1,
				username:1,
				email:1,
				phone_number:1
			}
			User.findOne({_id:req.user._id}, filter, fn);
		}
	], function(err, data){
		var a = jade.renderFile('views/evals/usergroup-new.jade', data);
		res.json({html:a});
	});	
});

router.post('/', authenticate, access('admin'), function(req, res) {
	async.waterfall([
		function checkFields(fn){
			if(!req.body.name || req.body.name == ""){
				return fn("invalid name")
			}
			req.body.name = req.body.name.toLowerCase();
			fn();
		},
		function checkDuplicate(fn){
			UserGroup
			.count({name:req.body.name})
			.exec(function(err, count){
				var exists = count == 1;
				if(exists){
					fn("User group already exists");
				}else{
					fn();
				}
			});
		},
		function save(fn){
			new UserGroup({
				name:req.body.name, 
				description:req.body.description
			}).save(fn);
		}
	], function(err, data){
		if(err){
			return res.json({error:err});
		}
		var html = jade.renderFile('views/evals/usergroup-new-done.jade', data);
		res.json({html:html});
	});	
});

module.exports = router;