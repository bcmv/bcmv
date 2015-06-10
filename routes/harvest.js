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
var Harvest = mongoose.models.Harvest;
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

router.get('/', authenticateAdmin, function(req, res, next) {
	Harvest.find()
	.lean()
	.exec(function(err, harvs){
		console.log(harvs);
		renderPage(req,res, function(err, page){
			res.render('harvest', page)
		});
	});
});
router.post('/add', authenticateAdmin, function(req, res, next) {
	var download_type = req.body.type;
	var d;
	async.waterfall([
		function validate(fn){
			d = new Harvest({
				url:req.body.url,
				download_type:download_type,
				media_id:req.body.media_id
			});
			if(!req.body.media_id){
				return fn("media id not provided");
			}
			if(download_type == "youtube" || download_type == "direct download"){
				d.file_location = conf.temp_download_dir;
			}
			if(download_type == "direct download" || req.body.username && req.body.password){
				d.username = req.body.username;
				d.password = req.body.password;
			}
			if(download_type == 'torrent'){
				Harvest.addTorrent(req.body.url, function(err, torrent){
					d.torrent_hash = torrent.hashString;
					d.torrent_transmission_id = torrent.id;
					fn();
				});
			}else{
				fn();
			}
		},
		function save(fn){
			d.save(fn);
		}
	], function(err, r){
		if(err){
			return next(err);
		}
		res.json({success:1});
	})
});
router.get('/torrent/:id', authenticateAdmin, function(req,res,next){
	transmission.get(parseInt(req.params.id), function(err, ts){
		if(err){
			throw (err);
		};
		res.json(ts.torrents.pop());
	});
});
router.get('/status', authenticateAdmin, function(req,res,next){
	Harvest
	.find()
	.lean()
	.exec(function(err, harvs){
		if(err){
			throw err;
		}
		res.json(harvs);
	})
});

module.exports = router;

