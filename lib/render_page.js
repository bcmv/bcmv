var async = require('async');
var mongoose = require('mongoose');
var User = mongoose.models.User;
var Media = mongoose.models.Media;
var Ad = mongoose.models.Ad;
var servers = require('./fileservers');
var _ = require('underscore');
exports.renderPage = function(req,res,fn){
	async.auto({
		to_watch:function(cb){
			if(req.isAuthenticated()){
				User
				.findOne({_id:req.user._id},{to_watch:1})
				.lean()
				.exec(function(err, u){
					if(!u.to_watch || !u.to_watch.length){
						return cb();
					}
					//find all series
					var group = {};
					async.each(u.to_watch, function(item, done){
						Media
						.findOne({'files._id':item}, {title:1, imdb_id:1, migrated:1, 'files.$':1})
						.lean()
						.exec(function(err, media){
							if(err) return fn(err);
							if(!media){
								return done();
							}
							var id = media._id;
							if(!group[id]){
								group[id] = media;
							}
							if(!group[id].files){
								group[id].files = [];
							}
							group[id].files.push(media.files.pop());
							done();
						});
					}, function(err){
						var medias = [];
						for(var i in group){
							medias.push(group[i]);
						}
						var m = [];
						medias.forEach(function(media){
							var files = media.files;
							files.forEach(function(file){
								file.series = media.title;
								file.series_imdb_id = media.imdb_id;
								file.series_id = media._id;
								file.series_migrated = media.migrated || false;
								m.push(file);
							})
						});
						m.sort(function(a,b){
							a = new Date(a.time);
							b = new Date(b.time);
							return a>b ? -1 : a<b ? 1 : 0;
						})
						var latest = m.splice(0,4);
						return cb(null,latest);
					});
				})
			}else{
				cb();
			}
		},
		admin_flagged_count:function(cb){
			if(req.user && req.user.level < 1){
				return cb();
			}
			Media
			.find({'files.flags.solved':false},{'files.$':1})
			.lean()
			.exec(function(err, medias){
				Media
				.find({'files.flags.solved':false})
				.lean()
				.exec(function(err, medias){
					var f = 0;
					medias.forEach(function(doc){
						doc.files.forEach(function(file){
							if(!file.flags || !file.flags.length){
								return;
							}
							file.flags.forEach(function(flag){
								if(flag.solved == false){
									f++;
								}
							});
						});
					});
					cb(null, f);
				});
			});
		},
		admin_request_count:function(cb){
			if(req.user && req.user.level < 1){
				return cb();
			}
			User
			.find({'requests.status':'pending'},{'requests.$':1})
			.lean()
			.exec(function(err, users){
				var c = 0;
				users.forEach(function(u){
					c = c+u.requests.length;
				});
				cb(null, c);
			});
		},
		ads	:function(cb){
			Ad
			.find({effective_to:{$gt:new Date()}})
			.lean()
			.exec(function(err, ads){
				//select random ad from each type
				var ads = _.groupBy(ads, function(ad){return ad.type});
				for(var i in  ads){
					ads[i] = ads[i][~~(Math.random()*ads[i].length)]
				}
				console.log(ads)
				cb(err, ads)
			});			
		},
		stat_servers:servers.getServers
	}, fn);
}

