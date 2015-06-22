var express = require('express');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');
var conf = require('../config');
var fs = require('fs');
var prettyBytes = require('pretty-bytes');
var validator = require('validator');
var sms = require('../lib/sms');
var Media = mongoose.models.Media;
var User = mongoose.models.User;
var UserGroup = mongoose.models.UserGroup;
var Log = mongoose.models.Log;
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
var filterMedia = require('../lib/util').filterMedia;

var smtpTransport = require('nodemailer-smtp-transport');
var transporter = nodemailer.createTransport(smtpTransport({
	host: conf.email_host,
	port: 25,
	auth: {
		user: conf.email,
		pass: conf.email_password
	},
	secure:false,
	maxConnections: 5,
	maxMessages: 10
})); 

var router = express.Router();

router.get('/', authenticateAdmin, function(req, res) {
	renderPage(req,res, function(err, page){
		res.render('user',page);
	});
});
router.delete('/:id', authenticate, access('admin'), function(req, res, next) {
	var id = req.params.id;
	User.remove({_id:req.params.id}, function(err, d){
		if(err){
			return next(err);
		}
		res.json({message:"user removed"});
	})
});
router.get('/:id/edit', authenticate, access('admin'), function(req, res) {
	async.waterfall([
		function getUserDetails(fn){
			var filter = {
				name:1,
				username:1,
				email:1,
				phone_number:1,
				status:1
			}
			User.findOne({_id:req.params.id}, filter, fn);
		}
	], function(err, data){
		var a = jade.renderFile('views/evals/user-edit.jade', data);
		res.json({html:a});
	});	

});
router.post('/:id/activate', authenticate, access('admin'), function(req,res){
	var id = req.params.id;
	User.update({_id:id},{$set:{status:"activated"}}, function(err, changed){
		if(err){
			return next(err);
		}
		var a = jade.renderFile('views/evals/success.jade', {message:'Successfully activated'});
		res.json({html:a});
	})
})
router.get('/:id/groups', authenticate, access('admin'), function(req, res) {
	var id = req.params.id;
	async.waterfall([
		function getUserGroups(fn){
			UserGroup
			.find()
			.lean()
			.exec(fn);
		},
		function getUser(usergroups, fn){
			User.findOne({_id:id}, function(err, user){
				fn(null, usergroups, user);
			});
		}
	], function(err, usergroups, user){
		if(err){
			return res.json({error:err});
		}
		if(!user){
			return res.json({error:"invalid request"});
		}
		usergroups.map(function(grp){
			grp.added = _.find(user.groups, function(g){ return g.name == grp.name; }) ? true: false;
			return grp;
		});
		var html = jade.renderFile('views/evals/user-usergroups-show.jade', {user:user, usergroups:usergroups});
		res.json({html:html});
	});		
});
router.post('/:id/groups/toggle', authenticate, access('admin'), function(req, res) {
	var gid = req.body.id;
	var uid = req.params.id;
	async.waterfall([
		function getUser(fn){
			User
			.findOne({_id:uid})
			.lean()
			.exec(fn);
		},
		function getUsergroup(user, fn){
			UserGroup.findOne({_id:gid}, function(err, grp){
				if(err){
					return fn(err);
				}
				fn(null, user, grp);
			});
		},
		function toggle(user, group, fn){
			var group_exists = _.find(user.groups, function(g){ return g.name == group.name; }) ? true:false;
			if(!group_exists){
				user.groups = user.groups || [];
				user.groups.push({name:group.name});
			}else{
				//remove group
				user.groups = user.groups.filter(function(g){ return g.name != group.name; });
			}
			User
			.update({_id:uid},{$set:{groups:user.groups}})
			.exec(fn)
		}
	], function(err, changed){
		if(err){
			return res.json({error:err});
		}
		if(changed == 0){
			return res.json({error:"nothing updated"});
		}
		res.json({message:'changed'});
	});
});
router.post('/reset-password', function(req, res) {
	var q = req.body;
	async.waterfall([
		function fieldsExist(fn){
			if(!q.email && !q.code || q.code == '' || !q.password){
				return fn("Invalid request");
			}
			if(q.password.length < 6){
				return fn("Use a longer password");
			}
			fn();
		},
		function find(fn){
			User
			.findOne({email:q.email, reset_code:q.code},{email:1})
			.lean()
			.exec(function(err, user){
				if(err){
					return fn("An error occured");
				}
				if(!user){
					return fn("Incorrect code");
				}
				fn();
			})
		},
		function updateUser(fn){
			var update = {
				$set:{
					reset_code:null, 
					password: crypto.createHash("md5").update(q.password).digest("hex")
				}
			}
			User
			.update({email:q.email, reset_code:q.code}, update, function(err, changed){
				if(err){
					return fn('An error occured');
				}
				if(changed == 0){
					fn('Invalid request');
				}else{
					fn();
				}
			});
		}
	],function(err){
		if(err){
			return res.json({error:err});
		}
		res.json({message:"Successfully updated your details. Please log in to continue."});
	});
});

router.post('/reset', function(req, res) {
	var email = req.body.email;
	async.waterfall([
		function validEmail(fn){
			if(!email || email.length == 0){
				fn('Please provide an email.');
			}else if(!validator.isEmail(email)){
				fn('Invalid email');
			}else{
				fn();
			}
		},
		function getUser(fn){
			var r = new RegExp(email,'i');
			User
			.findOne({email:r},{email:1, reset_code_last_sent:1, reset_code:1})
			.lean()
			.exec(function(err, user){
				if(err){
					fn(err)
				}else{
					if(!user){
						fn("Email address doesn't exist");
					}else{
						fn(null, user);
					}
				}
			})
		},
		function sendEmail(user, fn){
			var reset_code = rndm(10);
			transporter.sendMail({
				from: "noreply <noreply@video2home.net>",
				to:user.email,
				subject:"Reset your Video2Home account",
				//text:"test",
				html:'<p> Your reset code is <strong>'+reset_code+'</strong></p>'
			});
			User.update({_id:user._id},{$set:{reset_code:reset_code, reset_code_last_sent: new Date()}}, function(e,c){})
			fn(null, 'You will recieve an email to reset your password.');
		}
	],function(err, msg){
		if(err){
			return res.json({error:err});
		}
		res.json({message:msg});
	});
});
router.get('/details', authenticate, function(req, res) {
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
		var a = jade.renderFile('views/evals/user-edit-settings.jade', data);
		res.json({html:a});
	});	
});
router.post('/details', authenticate, function(req, res) {
	var data = req.body;
	async.waterfall([
		function validatePhoneNumber(fn){
			if(!validator.isNumeric(data.phone_number) || !validator.isLength(data.phone_number, 7)){
				return fn("Invalid phone number!");
			}
			return fn();
		},
		function validatePassword(fn){
			if(data.password == "" || !data.password || data.password != data['password-confirm']){
				return fn("Password doesn't match!");
			}
			if(data.password.length < 6){
				return fn("Password too short.");
			}
			return fn();
		},
		function duplicatePhoneNumber(fn){
			User.findOne({phone_number:data.phone_number}, function(err, found){
				if(err){
					return fn(err);
				}
				if(found){
					if(found._id.toString() != req.user._id.toString()){
						fn('Phone number already registered!')
					}else{
						fn(null, false);
					}
				}else{
					fn(null, true);
				}
			});
		},
		function updateUser(shouldVerify, fn){
			var update = {
				$set:{
					reset_code:null, 
					password: crypto.createHash("md5").update(data.password).digest("hex")
				}
			}
			if(shouldVerify){
				update['$set']['verification_code'] = null;
				update['$set']['verified'] = false;
				update['$set']['phone_number'] = data.phone_number;
			}
			User
			.update({_id:req.user._id}, update, function(err, changed){
				console.log(changed);
				if(err){
					return fn('An error occured');
				}
				if(changed == 0){
					fn('Nothing updated');
				}else{
					fn(null, shouldVerify);
				}
			});

		},
	], function(err, shouldVerify){
		console.log(arguments);
		var template = err ? 'views/evals/error.jade' : 'views/evals/user-edit-settings-done.jade';
		var a = jade.renderFile(template, {error:err, shouldVerify:shouldVerify});
		res.json({html:a});
	});	
});
router.get('/info', authenticate, function(req, res){
	if(req.xhr){
		res.json({
			name:req.user.name,
			username:req.user.username,
			phone_number:req.user.phone_number,
			verified:req.user.verified
		})		
	}else{
		res.redirect('/');
	}
})
router.get('/watchlist', authenticate, function(req, res) {
	renderPage(req,res, function(err, page){
		User
		.findOne({_id:req.user._id},{downloads:0})
		.lean()
		.exec(function(err, u){
			if(!u.subscriptions || !u.subscriptions.length){
				u.subscriptions = [];
			}
			if(!u.subscriptions.length){
				return res.redirect('/');
			}
			//find all series
			async.map(u.subscriptions, function(item, done){
				var show = {
					_id:1,
					title:1,
					imdb_id:1,
					migrated:1,
					'files.time':1,
					'files.season':1,
					'files.episode':1,
					'files._id':1
				}
				Media
				.findOne({_id:item}, show)
				.lean()
				.exec(done);
			}, function(err,medias){
				var m = [];
				medias.forEach(function(media){
					var files = media.files;
					files.forEach(function(file){
						file.time_str = moment(file.time).fromNow();
						file.series = media.title;
						if(req.xhr == false){
							file.series_imdb_id = media.imdb_id;
							file.series_migrated = media.migrated || false;
						}
						file.series_id = media._id;
						file.to_watch = true;
						if(u.to_watch && file._id && u.to_watch.indexOf(file._id.toString()) == -1){
							file.to_watch = false;
						}
						m.push(file);
					})
				});
				m.sort(function(a,b){
					a = new Date(a.time);
					b = new Date(b.time);
					return a>b ? -1 : a<b ? 1 : 0;
				})
				//m = m.splice(0,4);
				page._watchlist = m;
				if(req.xhr){
					res.json(m)
				}else{
					res.render('watchlist',page);
				}
			});
		});
	});
});
router.get('/subscriptions', authenticate, function(req, res) {
	User
	.findOne({_id:req.user._id},{subscriptions:1})
	.lean()
	.exec(function(err, u){
		async.mapSeries(u.subscriptions, function(item, done){
			Media
			.findOne({_id:item})
			.lean()
			.exec(function(err, m){
				done(null,m);
			})
		}, function(err, m){
			if(req.xhr){
				filterMedia(req, m, function(medias){
					res.json(medias);
				})
			}else{
				res.redirect('/');
			}
		})
	})
});
router.get('/search', authenticate, function(req, res) {
	var q = {};
	if(req.query.query){
		var query = new RegExp(req.query.query, 'gi');
		q['$or'] = [{username:query},{name:query},{email:query}];
	}
	console.log(q);
	User
		.find(q,{password:0})
		.lean()
		.limit(20)
		.sort({date_registered:-1})
		.exec(function(err, users){
			if(err){
				console.log(err);
				return res.json({error:"unable to search"});
			}
			res.json(users);
		})
});
router.post('/register', function(req, res) {
	var data = req.body;
	async.waterfall([
		function verifyFields(fn){
			var fields = "username password".split(" ");
			for(var i=0;i<fields.length;i++){
				if(typeof fields[i] == "undefined"){
					return fn("Field for "+i+" not found");
				}
			}
			fn();
		},
		function checkEmpty(fn){
			for(var i in data){
				if(data[i] == ""){
					data[i] = data[i].trim();
					return fn("Empty field " + i);
				}
			}
			fn();
		},
		function checkUsernameEmail(fn){
			User
			.findOne({$or:[{username:new RegExp("^" + data.username + "$",'i')}]})
			.lean()
			.exec(function(err, u){
				if(u){
					return fn("Username already registered!");
				}
				fn();
			})
		},
		function register(fn){
			data.phone_number = data.mobile;
			var user = new User(data);
			user.groups = [{name:'user'}];
			user.date_registered = new Date();
			user.status = "activated";
			user.verified = true;
			user.save(function(err, doc){
				if(err){
					console.log(err);
					return fn("Unable to register");
				}
				fn();
			})
		}
	], function(err, result){
		if(err){
			if(typeof err == "string"){
				return res.json({error:err});
			}
			console.log(err);
			return res.end();
		}
		res.redirect('/');
	})
});

//subscriptions
//router.get('/subscriptions');
router.post('/send-verification-sms', authenticate, function(req, res, next){
	User.findById(req.user._id, function(err, user){
		if(err){
			return next(err);
		}
		if(user.verified == true){
			return next({status:200, verified:true});
		}
		if(user.verification_code_last_sent){
			var then = new Date(user.verification_code_last_sent);
			var now  = new Date();
			var diff = now - then;
			console.log(diff);
			if(diff  < 60000){ //1min
				return next({status: 200, message: "try again shortly"});
			}
		}
		var code = _.random(1000, 9999);
		User.update({_id:req.user._id},{$set:{verification_code:code,verification_code_last_sent:new Date()}}, function(err,c){});
		sms.send({
			recipient:user.phone_number,
			message: "Verification code for V2H is " + code
		});
		res.end();
	});
});
router.post('/verify', authenticate, function(req,res,next){
	var code = req.body.code;
	if(!code || !validator.isNumeric(code)){
		return next({status:200, message:"no code supplied"});
	}
	User.count({_id:req.user._id, verification_code:parseInt(code)}, function(err, count){
		if(err){
			return next(err);
		}
		if(count == 1){
			User.update({_id:req.user._id},{$set:{verified:true}}, function(err,d){})
			res.json({success:1});
		}else{
			res.json({error:"invalid code!"});
		}
	})
});
router.post('/subscription-toggle', authenticate, function(req,res, next){
	var id = req.body.id;
	var uid = req.user._id;
	if(!id){
		return res({error:"no id"});
	}
	User.findOne({_id:uid}, function(err, u){
		if(err){
			return next(err);
		}
		if(!u.verified){
			return next({status:200, verified:0, correctnum:(validator.isNumeric(u.phone_number) && u.phone_number.length == 7)});
		}
		var s = u.subscriptions || [];
		var index = s.indexOf(id.toString());
		var watchlisted = index == -1;
		var msg;
		if(index == -1){
			s.push(id);
			msg = "added to watchlist";
		}else{
			s.splice(index,1);
			msg = "removed from watchlist";
		}
		User.update({_id:uid},{$set:{subscriptions:s}}, function(err, changed){
			res.json({message: msg, watchlisted:watchlisted});
		})
	})

});

router.get('/activate', function(req,res){
	var token = req.query.token;
	var user = req.query.user;
	if(!token || !user || req.isAuthenticated()){
		return res.redirect('/');
	}
	User.findOne({username:user, password:new RegExp(token,'g')}, function(err, u){
		console.log(u);
		if(err){
			console.log(err);
			return res.redirect('/');
		}
		res.redirect('/login?activated=1&token=0')		
		if(err || !u){
			console.log(err);
			return res.redirect('/');
		}
		User.update({_id:u._id},{$set:{status:"activated"}}, function(err, changed){
			var con = new Pool(5, {
				host:conf.mysql_host,
				user:conf.mysql_user,
				password:conf.mysql_pass,
				database:conf.mysql_db,
				insecureAuth:true
			}); 
			var query = "UPDATE `forhtaccess` SET `status` = '1' WHERE `forhtaccess`.`user` = '"+user+"' LIMIT 1;";
			con.query(query, function(err, result){
				con.dispose();
			});			
		});
	})
})

router.post('/:id/type', authenticateAdmin, function(req,res){
	var type = req.body.type;
	var id = req.params.id;
	if(!type || 'user uploader admin'.indexOf(type) == -1){
		return res.json({error:"no type"});
	}
	User.update({_id:id}, {$set:{type:type}}, function(err, changed){
		if(err){
			console.log(err);
			return res.json({error:""});
		}
		res.json({success:1});
	})
})
module.exports = router;