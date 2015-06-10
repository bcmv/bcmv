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
var Device = mongoose.models.Device;
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
_.str = require('underscore.string');

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
				var ads = ads.map(function(a){
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
router.post('/add', function(req, res, next) {
	var file;
	var filename;
	async.waterfall([
		function validateTempKey(fn){
			if(!req.body.key == "CC6B565B2A47F"){
				return fn('invalid key');
			}
			return fn();
		},
		function moveFile(fn){
			file = req.files.file;
			if(!file){
				fn("no file");
			}
			filename = "v2h_" + rndm(5) +'-' + _.str.slugify(file.originalname) + '.' + file.extension;
			fse.move(file.path, path.join(__dirname, '../public/devices/', filename),fn)			
		},
		function createfile(fn){
			req.body.ip = req.ip;
			req.body.file_size = file.size;
			req.body.file = filename;
			var dev = new Device(req.body)
			dev.save(fn);
		}
	], function(err, r){
		if(err){
			return next(err);
		}
		r = r.toJSON();
		res.json(filter(r));
	})
});
router.get('/list', function(req, res, next) {
	Device
	.find()
	.sort({_id:1})
	.lean()
	.exec(function(err, d){
		res.json(filter(d));
	})
})
router.get('/latest', function(req, res, next) {
	Device
	.findOne()
	.sort({version_numeric:1})
	.lean()
	.exec(function(err, d){
		res.json(filter(d));
	})
})
router.get('/latest/:release', function(req, res, next) {
	if("stable dev".indexOf(req.params.release) == -1){
		return res.json({error:'invalid release type'});
	}
	Device
	.findOne({release:req.params.release})
	.sort({version_numeric:1})
	.lean()
	.exec(function(err, d){
		res.json(filter(d));
	})
})
function filter(obj){
	if(!obj){
		return [];
	}
	if(!obj.length){
		obj = [obj]
	};
	var ret = obj.map(function(r){
		if(!r){
			return
		}
		r.url = 'http://video2home.net/devices/' + r.file;
		delete r.ip;
		delete r.__v;
		return r;
	});
	return ret;
}

module.exports = router;

