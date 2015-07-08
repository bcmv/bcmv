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
var crypto = require('crypto');
var filterMedia = require('../lib/util').filterMedia;

_.str = require('underscore.string');

require('../lib/models/Media.js');

var Media = mongoose.models.Media;
var User = mongoose.models.User; 
var Ad = mongoose.models.Ad; 
var renderPage = require('../lib/render_page').renderPage;

var authenticate = require('./authenticate').authenticate;
var authenticateAdmin = require('./authenticate').authenticateAdmin;

var router = express.Router();

router.get('/',  function(req, res) {
	res.redirect('/');
});
router.get('/new/:type', function(req, res) {
	var type = req.params.type.toLowerCase();
	if(type == "movies"){
		type = "Movie";
	}else if(type == "series"){
		type = "Series";
	}else if(type == "apps"){
		type = "Application"
	}
	//type = new RegExp(type, 'i');\
	var q = {type:type, published:true};
	if(req.query.since){
		q.last_updated_time = {$lt:req.query.since};
	}
	var limit = req.query.limit ? parseInt (req.query.limit) : 10;
	Media
	.find(q)
	.limit(limit)
	.sort({last_updated_time:-1})
	.lean()
	.exec(function(err, medias){
		if(req.query.nf){
			res.json(medias);
		}else{
			filterMedia(req, medias,true, function(medias){
				res.json(medias);
			})
		}
	});
});

router.post('/set-price', authenticateAdmin, function(req,res, next){
	var fid = req.body.fid;
	var price = req.body.price;
	var q = {'files._id':fid};
	Media.update(q, {$set:{'files.$.price':parseInt(price)}}, function(err, c){
		if(err){
			return next(err);
		}
		res.end();
	})
});
router.get('/top/:type', function(req, res) {
	var type = req.params.type.toLowerCase();
	var q = {};
	if(type == "recent"){
		q['$lte'] = new Date();
		q['$gte'] = moment().subtract(1, 'days').toDate();
	}else if(type == "week"){
		q['$lte'] = new Date();
		q['$gte'] = moment().subtract(1, 'weeks').toDate();
	}else if(type == "month"){
		q['$lte'] = new Date();
		q['$gte'] = moment().subtract(1, 'months').toDate();
	}
	var query = {
		last_updated_time:q,
		'files.time':q,
		published:true
	}
	//type*/-** = new RegExp(type, 'i');
	Media
	.find(query,{'files.$':1, title:1, plot:1, description:1, time:1, quality:1, type:1, year:1})
	.sort({'files.downloads':-1})
	.lean()
	.limit(40)
	.exec(function(err, medias){
		medias = _.sortBy(medias, function(m){
			return _.max(m.files, function(file){return file.downloads;}).downloads;
		}).reverse();
		medias = medias.slice(0,10);
		filterMedia(req, medias,true, function(medias){
			res.json(medias);
		})
	});
});
router.post('/request', authenticate, function(req,res, next){
	var body = req.body;
	var title = body.title;
	var details = body.details;
	async.waterfall([
		function validate(fn){
			if(!title || title == ""){
				fn("Invalid request");
			}else{
				fn();
			}
		},
		function findUser(fn){
			var id = req.user._id;
			User.findOne({_id:id}, {requests:1}, fn);
		}, 
		function checkForSpam(user, fn){
			var id = req.user._id;
			var requests = user.requests || [];
			var now = new Date();
			var requestsInLast30Minutes = _.filter(requests, function(r){
				var t = (now - new Date(r.time) < 1000 * 60 * 30);
				console.log(now - new Date(r.time));
				return t;
			}).length;
			if(requestsInLast30Minutes > 10){
				fn("Too many requests, please try again later.");
			}else{
				fn(null, id);
			}
		},
		function addRequest(id, fn){
			var r = {
				title:title,
				details:details,
				time: new Date()
			}
			User.update({_id:id},{$push:{requests:r}}, function(err, changed){
				if(err){
					fn(err);
				}else{
					if(changed == 0){
						fn("Unable to complete your request.");
					}else{
						fn(null, "We've got your request.");
					}
				}
			});
		}
	], function(err, msg){
		if(err){
			res.json({error:err});
		}else{
			res.json({message:msg});
		}
	});
});
router.get('/requests', authenticateAdmin, function(req, res) {
	renderPage(req,res,function(err,page){
		User
		.find({'requests.status':'pending'},{requests:1, username:1, name:1})
		.lean()
		.exec(function(err, users){
			page.user_requests = users;
			res.render('requests', page);
		});
	});
});
router.post('/request/:rid', authenticateAdmin, function(req,res){
	var id = req.body.id;
	var rid = req.params.rid;
	var status = req.body.status;
	var remarks = req.body.remarks;
	async.waterfall([
		function validateFields(fn){
			if(!status || status == '' || !id){
				return fn("Invalid fields");
			}
			remarks = remarks || '';
			fn();
		},
		function update(fn){
			var update = {
				'requests.$.status':status,
				'requests.$.updated_time': new Date(),
				'requests.$.updated_user': req.user.username
			}
			User.update({_id:id, 'requests._id':rid},{$set:update}, function(err, changed){
				if(err){
					return fn(err);
				}
				if(changed == 0){
					return fn("Nothing updated");
				}
				fn();
			});
		},
		function asyncNotifyUser(fn){
			fn();
			User.findOne({_id:id}, {phone_number:1, email:1, verified:1}, function(err, user){
				if(err){
					return console.log(user);
				}
				//TODO: send sms
			});
		}
	], function(err){
		if(err){
			return res.json({error:err});
		}
		res.json({message:'Request updated and user notified.'});
	});
});
router.get('/flagged', authenticateAdmin, function(req, res) {
	renderPage(req,res,function(err,page){
		Media
		.find({'files.flags.solved':false})
		.lean()
		.exec(function(err, medias){
			Media
			.find({'files.flags.solved':false})
			.lean()
			.exec(function(err, medias){
				page.flagged = medias;
				res.render('flagged', page);
			});
		});
	});
});
router.post('/flag', authenticate, function(req, res) {
	var id = req.body.id;
	var reason = req.body.reason;
	var p = {
		_id:mongoose.Types.ObjectId(),
		reason:reason
	}
	Media.update({'files._id':id},{$push:{'files.$.flags':p}}, function(err, changed){
		console.log(arguments);
	})
});
router.post('/delete-file', authenticateAdmin, function(req, res, next) {
	var fid = req.body.id;
	async.waterfall([
		function findMedia(fn){
			Media
			.findOne({'files._id':fid},{'files.$':1})
			.lean()
			.exec(function(err, obj){
				if(err||!obj){
					err = err || "file not found";
					return fn(err);
				}
				var file = obj.files.pop();
				//if()
				fn(null, file);
			});
		},
		function removeFromFileSystem(file,fn){
			//check if migrated(if directory key in file)
			if(file.directory){
				var dir = file.location.split("/");
				dir.pop();
				dir = dir.join("/");
				fse.remove(dir, function(err){
					if(err){
						return fn(err);
					}
					fn();
				});
			}else{

			}
		},
		function removeFromDB(fn){
			Media
			.update({'files._id':fid},{$pull:{files:{_id:fid}}}, function(err, changed){
				if(err){
					return fn(err);
				}
				fn();
			})
		},
	], function(err){
		if(err){
			console.log(err);
			return next({error:err});
		}
		res.json({success:1});
	})
});
router.post('/flag/solve', authenticateAdmin, function(req, res) {
	var id = req.body.id;
	var fid = req.body.fid;
	if(!id){
		return res.json({error:'no id supplied'});
	}
	Media
		.findOne({'files._id':fid},{"files.$":1})
		.lean()
		.exec(function(err, f){
			var file = f.files[0];
			var flag = file.flags.map(function(fl){
				if(fl._id.toString() == id){
					fl.solved = true;
				}
				return fl;
			});
			Media.update({"files._id":fid},{$set:{'files.$.flags':flag}},function(err, c){
				res.json({success:1});
			})
		})
});
router.get('/pipe', function(req, res, next){
	if(!req.query.url){
		return next("No URL supplied");
	}
	if(!validUrl.isWebUri(req.query.url)){
		return next("Not a valid URL");
	}
	request(req.query.url).pipe(res);
});
router.post('/retrieve-data', function(req, res, next) {
	var data = {};
	async.waterfall([
		function validateURL(fn){
			var url = req.body.url;
			if(url){
				url = url.trim();
				var url = url.substr(0,4).toLowerCase() == "http" ? url : "http://" + url;
				if(validUrl.isWebUri(url)){
					fn(null, url);
				}else{
					fn("Invalid URL");
				}
			}else{
				fn("URL not supplied");
			}
		},
		function getData(url, fn){
			request(url, fn);
		},
		function scrapeData(raw, body, fn){
			var $ = cheerio.load(body);
			data.title = $("h1 .itemprop").text().trim();
			if(!data.title){
				return fn("cannot find data");
			}
			data.year = $("h1 .nobr a").text();
			data.description = $("p[itemprop='description']").text().trim();
			data.duration = $("#overview-top [itemprop='duration']").text().trim();

			var genre = $("span[itemprop='genre']");
			data.genre = _.map(genre, function(i){return $(i).text();});

			var languages = $('a[href*="/language"]');
			data.languages = _.map(languages, function(i){return $(i).text();});

			data.director = $("#overview-top [itemprop='director'] a span").text();
			//data.poster = $("#img_primary img").attr("src");
			data.rating_imdb = $(".star-box-giga-star").text().trim();
			var rotten_url = "http://api.rottentomatoes.com/api/public/v1.0/movies.json?apikey="+conf.rotten_tomatoes_key+"&q="+data.title+"&page_limit=1"
			async.auto({
				rating_rt:function(cb){
					request(rotten_url, function(err, raw, body){
						var body = body.trim();
						try{
							var info = JSON.parse(body);
							if(info.movies && info.movies.length > 0){
								var movie = info.movies[0];
								cb(null, movie.ratings.critics_score);
							}else{
								cb(null, -1);
							}
						}catch(e){
							cb(e);
						}
					});				
				},
				poster:function(cb){
					var poster_container = $("#img_primary .image a");
					if(poster_container.length > 0){
						var href = poster_container.attr('href');
						var media_url = "http://www.imdb.com/" + href;
						request(media_url, function(err, raw, body){
							var $ = cheerio.load(body);
							var img = $("#primary-img");
							img = img.attr("src");
							cb(null, img);
						})
					}else{
						cb();
					}
				},
				directory:function(cb){
					var folder_name = data.title.match(/[a-zA-Z]/g).join('')
					//var directory = '/d2/media/' + (data.year || new Date().getUTCFullYear()) + "/" + folder_name;
					var directory = '/d2/media/';
					cb(null, directory);
				}
			},fn);
		}
	],
	function(err, obj){
		if(err){
			throw err;
			return next(err);
		}
		data.rating_rt = obj.rating_rt;
		data.poster = obj.poster;
		data.directory = obj.directory;
		res.json(data);		
	});
});

router.get('/new', authenticate, function(req, res) {
	renderPage(req,res, function(err, page){
		res.render('new-media',page);
	})
});
router.post('/new', authenticateAdmin, function(req, res,next) {
		var media = new Media(req.body);
		media._id = mongoose.Types.ObjectId();
		media.user = req.user.username;
		media.ip = req.ip;
		media.time = new Date();
		media.last_updated_time = new Date();
		async.waterfall([
			function getPosterImage(cb){
				var poster_img = req.body.poster;
				if(poster_img){
					//TODO resize image
					var poster = request(poster_img);
					var extension;
					var raw_path;
					var poster_path;
					poster
					.on('response', function(res){
						extension = mime.extension(res.headers['content-type']);
						if(extension == "jpeg"){
							extension = 'jpg';
						}
						raw_path = path.join(conf.fs_poster_location, media._id.toString());
						poster_path = raw_path + "." + extension;
						res.pipe(fs.createWriteStream(poster_path));
					})
					.on('end', function(e){
						cb();
					});
				}else{
					cb();
				}
			}
		],function(err,r){
			media.save(function(err, doc){
				if(err){
					return next({error:err, status:200});
				}
				Media.resizeImage(doc._id, "poster", {simulate:false}, function(){});
				res.json(doc);
			});
		})

});

router.get('/download/:id', function(req, res){
	res.redirect('/media/' + req.params.id);
});

router.get('/download/:id/:fid', authenticate, function(req, res){
	var id = req.params.id;
	var fid = req.params.fid;
	renderPage(req,res,function(err,page){
		var time = new Date();
		time.setSeconds(time.getSeconds() + 5);
		//encrypt time
		var cipher = crypto.createCipher('aes-256-cbc','water crisis')
		var crypted = cipher.update(time.toString() + "," + req.params.fid + "," + req.user.username,'utf8','hex')
		crypted += cipher.final('hex');
		page.token = crypted;
		page.url = '/media/download/' + req.params.id + '/' + req.params.fid;
		Media.findOne({_id:id, 'files._id':fid}, {'files.$':1, converted:1, migrated:1, title:1}, function(err, doc){
			if(err || !doc){
				console.log(err);
				return res.redirect('/');
			}
			var title = doc.title;
			var file = doc.files.pop();
			if(file.season && file.episode){
				title = title + " Season " + file.season + " Episode " + file.episode;
			}
			page.title = title;
			Ad
			.find({type:"download page", effective_to:{$gt:new Date()}})
			.lean()
			.exec(function(err, ads){
				//select random ad
				var ad = ads[~~(Math.random()*ads.length)];
				page.ad = ad;
				res.render('download', page);
			});			
		})

	});		
});
router.get('/download/:id/:fid/serve', authenticate, function(req, res){
	if(!req.query.token){
		return res.end('invalid');
	}
	var id = req.params.id;
	var fid = req.params.fid;
	var decipher = crypto.createDecipher('aes-256-cbc','water crisis')
	var dec = decipher.update(req.query.token,'hex','utf8')
	dec += decipher.final('utf8');
	dec = dec.split(',');
	if(!dec || !dec.length || dec.length != 3){
		return res.end('error');
	}
	var dec_time = dec[0];
	var dec_fid = dec[1];
	var dec_user = dec[2];
	var a = new Date();
	var b = new Date(dec_time);
	if(a>=b && dec_fid == fid && dec_user == req.user.username){
		Media.findOne({_id:id, 'files._id':fid}, {'files.$':1, converted:1, migrated:1}, function(err, doc){
			if(err || !doc){
				console.log(err);
				return res.redirect('/');
			}
			//load balancing
			//find most available server
			servers.getServers(function(err, servers){
				if(err){
					console.log(err);
					return res.redirect('/');
				}
				servers = servers.filter(function(s){
					return s.status.connections != '-1';
				});
				servers = servers.sort(function(a,b){
					//console.log(a,b);
					var v = parseInt(a.status.connections);
					var x = parseInt(b.status.connections);
					return v < x;
				});
				var url;
				var file = doc.files.pop();
				var least_connected = servers.pop();
				var file_location = file.location;
				if((!doc.converted && !doc.migrated) || (doc.converted && doc.migrated)){
					//url = least_connected.host + "/d2/media/" + file.directory + "/" + file.name;
					url = least_connected.host + file_location;
				}else{
					url = least_connected.host + file_location;
				}
				if(!servers.length){
					//TODO no server to serve file
					url = 'fileserver1.video2home.net' + file_location;
				}
				
				//temporary fix
				//url = 'fileserver1.video2home.net' + file_location;


				//increment downloads
				Media.update({_id:id, 'files._id':fid},{$inc:{'files.$.downloads':1, downloads:1}},function(err,c){});
				//add to user and pull from User.to_watch
				User.update({_id:req.user._id},{$push:{downloads:fid},$pull:{to_watch:fid}},function(err,c){});

				//redirect
				res.json({file:'http://' + url});		
			});

		});
	}else{
		res.end('invalid');
	}
});

router.post('/:id', function(req, res,next) {
	var id = req.params.id;
	if(req.body.genre){
		req.body.genre = req.body.genre.split(",");
	}
	Media.update({_id:id},{$set:req.body}, function(err, media){
		if(err) throw err;
		res.end();
	});
});
router.get('/search', function(req, res) {
	var query = req.query;
	var search_query = {};

	if(query.query){
		//tokenize
		var tokens = query.query.split(" ");
		var title = [];
		tokens.forEach(function(t){
			//determine token filters
			if(t.indexOf(':') != -1){
				//get key, value
				var obj = t.split(':');
				var key = obj[0];
				var val = obj[1]

				//property filter
				switch (key){
					case "genre":
						search_query.genre = new RegExp("^"+val+"$",'i');
						break;					
					case "language":
						if(val.toLowerCase() != "all"){
							search_query.languages = new RegExp("^"+val+"$",'i');
						}
						break;					
					case "type":
						search_query.type = new RegExp("^"+val+"$",'i');
						break;
					case "quality":
						if(val == "hd"){
							val = "hd|bd";
						}
						search_query.quality = new RegExp(val,'i');
						break;
					case "time":
						if(val == "recent"){
							search_query.year = {
								$lte:new Date().getFullYear(),
								$gte:new Date().getFullYear()-1
							}
						}else{
							search_query.year = parseInt(val);
						}
						break;

				}
			}else{
				title.push(t);
			}
		});
		if(title.length){
			search_query.title = new RegExp(title.join(' '),'i');
		}
	}
	if(query.type){
		search_query.type = new RegExp("^" + query.type + "$", 'i');
	}	
	if(query.since){
		search_query._id = {$lt:query.since};
	}
	var limit = query.limit || 10;
	var fields = {};
	if(query.fields){
		var f = query.fields.split(",");
		f.forEach(function(f){
			fields[f] = 1;
		})
	}
	if(query.skipfiles){
		fields.files = 0;
	}
	if(!query.include_unpublished){
		search_query.published = true;
	}
	search_query['files._id'] = {$exists:true};
	Media
	.find(search_query, fields)
	.limit(limit)
	.sort({_id:-1})
	.lean()
	.exec(function(err, docs){
		console.log(docs);
		if(query.include_unpublished){
			filterMedia(req, docs, function(docs){
				res.json(docs);
			});
		}else{
			filterMedia(req, docs, true, function(docs){
				res.json(docs);
			});			
		}
	});
});

router.get('/:id',function(req,res){
	renderPage(req,res,function(err,page){
		var id = req.params.id;
		Media.findById(id)
		.lean()
		.exec(function(err, media){
			if(!media){
				res.status(404).json({});
			}else{
				if(req.xhr){
					return res.json(media);
				}
				media.files =_.map(media.files,function(f){
					f.location = '/media/download/' + media._id + '/' + f._id;
					f.size = prettyBytes(f.size || 0);
					f.time_format = moment(f.time).format("DD/MM/YY");
					return f;
				});
				media.formatted = _.groupBy(media.files,'season');
				for(var i in media.formatted){
					var files = media.formatted[i];
					media.formatted[i] = _.groupBy(files,'episode')
				}
				res.render('display_media',_.extend(page,media));
			}
		})
	});
});
router.get('/:id/delete', authenticateAdmin, function(req,res){
	var a = jade.renderFile('views/evals/media-delete.jade',{id:req.params.id});
	res.json({html:a});
});
router.post('/:id/delete', authenticateAdmin, function(req,res){
	var id = req.params.id;
	async.waterfall([
		function getMedia(fn){
			Media
			.findOne({_id:id},{files:1})
			.lean()
			.exec(function(err, media){
				if(err){
					return fn(err);
				}
				fn(null, media);
			});
		},
		function removeFiles(media, fn){
			var files = media.files;
			if(!files.length){
				return fn();
			}
			files.forEach(function(file){
				var loc = file.fs_location;
				if(!loc){
					return;
				}
				var ext = loc.split('.');
				if(ext.length == 1){
					console.log("WARNING: skipping because a directory was requested to be deleted");
					return;
				}
				fs.unlink(file.fs_location);
			});
			fn();
		},
		function removeFromDb(fn){
			Media.remove({_id:id}, fn);
		}
	], function(err){
		var a = jade.renderFile('views/evals/media-delete-done.jade');
		res.json({html:a});
	});
});
router.get('/:id/health', authenticateAdmin, function(req,res){
	var a = jade.renderFile('views/evals/media-health.jade');
	res.json({html:a});
});
router.get('/:id/screenshots', authenticateAdmin, function(req,res){
	var a = jade.renderFile('views/evals/media-screenshots.jade');
	res.json({html:a});
});
router.get('/:id/:season', authenticateAdmin, function(req, res) {
	var id = req.params.id;
	var season = parseInt(req.params.season.replace( /^\D+/g, ''));
	Media.find({_id:id, 'files.season':season})
	.lean()
	.exec(function(err, media){
		if(err) throw err;
		if(!media.length){
			res.json([]);
		}else{
			media = media[0];
			var eps = [];
			_.each(media.files, function(file){
				if(file.season && file.season == season){
					eps.push(file);
				}
			});
			res.json(eps);
		}
	})
});

router.post('/:id/:season/:episode/plot', authenticateAdmin, function(req, res, next) {
	var u = {
		_id:req.params.id,
		'files.season':parseInt(req.params.season),
		'files.episode':parseInt(req.params.episode)
	};
	console.log(u);
	Media.update(u,{
		$set:{'files.$.plot':req.body.plot}
	}, function(err, changed){
		if(err){
			return next(err);
		}
		console.log(changed);
		res.end();
	});
});

router.get('/:id/:season/:episode', authenticateAdmin, function(req, res) {
	var id = req.params.id;
	var season = parseInt(req.params.season.replace( /^\D+/g, ''));
	var episode = parseInt(req.params.episode.replace( /^\D+/g, ''));
	Media.find({_id:id, 'files.season':season, 'files.episode':episode})
	.lean()
	.exec(function(err, media){
		if(!media.length){
			res.json([]);
		}else{
			media = media[0];
			var files =[];
			_.each(media.files, function(file){
				if(file.season && file.season == season && file.episode && file.episode == episode){
					files.push(file);
				}
			});
			res.json(files);
		}
	})
});

router.post('/:id/upload', authenticateAdmin, function(req, res, next) {
	var id = req.params.id;
	var uploaded_season, uploaded_episode;
	var price = JSON.parse(req.body.prices);
	//find media
	async.waterfall([
		function findMedia(fn){
			Media.findById(id,function(err, media){
				if(err){
					return fn(err);
				}
				if(!media){
					return fn("media not found");
				}
				fn(null, media);
			});
		},
		function collectFiles(media, fn){
			var files = [];
			for(var file in req.files){
				var f = req.files[file];
				var slug = req.body.season && req.body.episode ? media.title + "-S" + req.body.season + "E" + req.body.episode : media.title;
				var filename = "DataZone" + '-' + _.str.slugify(slug) + '.' + f.extension;
				var directory = rndm(60);
				//TODO: put file to the hard disk with most space
				var newFile = {
					_id: mongoose.Types.ObjectId(),
					name:filename,
					orginal_name:f.originalname,
					extension:f.extension,
					size:f.size,
					ip:req.ip,
					time:new Date(),
					user:req.user.username,
					directory:directory,
					path:f.path,
					url: conf.fs_location['local'].uri +  '/media/' + directory + '/' + filename,
					location: path.join(conf.fs_location['local'].parent, '/media/',directory,filename),
					location_parent: conf.fs_location['local'].parent,
					migrated:false,
					price: parseInt(price[file])
				}
				newFile.fs_location = newFile.location;

				if(req.body.season && req.body.episode){
					newFile.season = uploaded_season = parseInt(req.body.season);
					newFile.episode = uploaded_episode = parseInt(req.body.episode);
				}
				files.push(newFile);
			}
			fn(null, media, files);
		},
		function processFiles(media, files, fn){
			async.eachSeries(files, function(item, done){
				var put = conf.fs_location['local'];
				//var file_dir = path.join(put.parent, put.directory, item.directory);
				console.log(item.path, item.fs_location)
				async.waterfall([
					function move(fn){
						fse.move(item.path, item.fs_location, fn);
					}
				], done);
			}, function(err){
				if(err){
					return fn(err);
				}
				return fn(null, media, files);
			});
		},
		function sendNotifications(media, files, fn){
			//async
			fn(null, media, files);
			if(media.type != "Series"){
				return;
			}
			var current_files = media.files;
			//check if a file for current episode exists
			var found = _.find(current_files, function(f){return (f.season == uploaded_season && f.episode == uploaded_episode)});
			if(found){
				//no need to send notifications if a file for the
				//episode already exists
				return;
			}
			var id = req.params.id;			
			//find everyone subscribed to this series
			User
			.find({subscriptions:id, verified:true},{password:0})
			.lean()
			.exec(function(err, users){
				if(err){
					return console.log(err);
				}
				async.eachLimit(
					users,
					50,
					function sendsms(user, done){
						var recipient = user.phone_number;
						var message = "Hello "+user.name+"\nNew episode (season "+uploaded_season+" episode "+uploaded_episode+") of " + media.title + " is available to download on V2H.\n\n http://video2home.net";
						sms.send({
							recipient:recipient,
							message:message
						}, done);
					}
				);
			});
			//push User.to_watch[]
			var files_id = files.map(function(f){return f._id.toString();});
			User.update({subscriptions:id},{$addToSet:{to_watch:{$each:files_id}}},{multi:true}, function(err, c){});
		},
		function updateDB(media, files, fn){
			var last_updated_time = new Date();
			Media.update({_id:id},{$addToSet:{files:{$each:files}}, $set:{published:true, last_updated_time:last_updated_time}},function(err, doc){
				if(err){
					return fn(err);
				}
				Media.findById(id, function(err, media){
					fn(null, media, files);
				});
			});
		}
	], function(err, data){
		if(err){
			console.log(err);
			return next(err);
		}
		res.json(data);
	});
});


module.exports = router;
