var mongoose = require('mongoose');
var File = require('./File').File;
var request = require('request');
var cheerio = require('cheerio');
var gm = require('gm');
var conf = require('../../config');
var async = require('async');
var fse = require('fs-extra');
var path = require('path');
var rndm = require('rndm');

var Media = new mongoose.Schema({
	title:{type:"string", required: true},
	type:{type:"string", required: true},
	category:{type:"string"},
	imdb_id:{type:"string", set:verifyIMDB},
	year:{type:"number"},
	description:{type:"string"},
	duration:{type:"number", set:verifyDuration, default:0},
	languages:{type:"array"},
	genre:{type:"array", set:divideStr},
	rating_imdb:{type:"number"},
	rating_rt:{type:"number"},
	quality:{type:"string"},
	directory:{type:"string"},
	files:[File],
	views:{type:"number", default:0},
	downloads:{type:"number", default:0},
	user:{type:"string"},
	ip:{type:"string"},
	time:{type:"date"},
	last_updated_time:{type:"date"},
	migrated:{type:'boolean'}, //if data is migrated from old vod
	migrated_id:{type:'number'},
	converted:{type:'boolean', default:false}, // if files has been moved from old dir to new one
	migrated_data:{},
	published:{type:'boolean', default:false}
},{strict:false});

Media.pre('save', function(next){
	if(this.imdb_id == '' || this.type == "Application"){
		return next();
	}
	model
	.count({imdb_id:this.imdb_id}, function(err, count){
		if(count>0){
			var err = new Error("IMDB id already exists");
			return next(err);
		}
		next();
	});
})

Media.statics.retrieveEpisodeDetails = function retrieveEpisodeDetails(tt, season, episode, fn){
	if(arguments.length != 4){
		throw Error('No arguments');
	}
	request('/')
}

Media.statics.moveFiles = function resize(id, options, fn){
	var args = arguments;
	async.waterfall([
		function sudoAccess(fn){
			if(!process.env.SUDO_UID){
				return fn("need sudo access!");
			}
			fn();
		},
		function verifyArguments(fn){
			if(args.length != 3){
				fn("invalid arguments provided");
			}else{
				options = options || {};
				fn();
			}		
		},
		function mediaExists(fn){
			model
			.findOne({_id:id})
			.lean()
			.exec(function(err, media){
				if(err){
					return fn(err);
				}
				if(!media){
					return fn("no media found");
				}
				if(media.converted){
					return fn("files already moved");
				}
				return fn(null, media);
			});
		},
		function validateFiles(media, fn){
			var files = media.files;
			if(!files.length){
				return fn("nothing to move");
			}
			fn(null, media);
		},
		function moveFilesAndUpdateDB(media, fn){
			var files = media.files;
			var id = media._id;
			async.eachSeries(files, function(file, done){
				var fid = file._id;
				var filename = rndm(60) + '.' + file.extension;
				var directory = rndm(60);
				var fs_location = file.fs_location;
				var new_location =  path.join(directory, filename);
				var new_location_path = path.join(file.migrated_location_parent || location_parent, conf.fs_location[file.location_parent].directory, new_location);
				console.log("copying:", id, fid, fs_location, "=>", new_location_path);
				if(options.simulate){
					console.log("file moved (simulate):", id, fid, fs_location, "=>", new_location_path);
					return done();
				}
				fse.move(fs_location, new_location_path, function(err){
					if(err){
						return done(err);
					}
					//update db
					file.directory = directory;
					file.name = filename;
					file.location = path.join(conf.fs_location[file.location_parent].uri, new_location);
					file.fs_location = new_location_path;
					model.update({
						_id:id, 
						'files._id':fid
					},{$set:{'files.$':file, converted:true}}, function(err, changed){
						if(err){
							return done(err);
						}
						if(changed == 0){
							return done("nothing updated");
						}
						console.log("file moved:", id, fid, fs_location, "=>", new_location_path);
						done();
					})
				});
			},fn);
		}
	],fn)
}
Media.statics.resizeImage = function resize(id, template, options, fn){
	var args = arguments;
	async.waterfall([
		function sudoAccess(fn){
			if(!process.env.SUDO_UID){
				return fn("need sudo access!");
			}
			fn();
		},
		function verifyArguments(fn){
			if(args.length != 4){
				fn("invalid arguments provided");
			}else{
				fn();
			}		
		},
		function templateExists(fn){
			if(typeof template == "string"){
				if(conf && conf.resize && conf.resize[template]){
					fn(null, conf.resize[template]);
				}else{
					fn("template does not exist");
				}
			}else{
				fn(null, template);
			}
		},
		function validateTemplate(template, fn){
			if(!template.length){
				return fn("no data in template");
			}
			var res = template.every(function correctFormatted(el){
				
				if(!el.label){
					return false;
				}
				if((el.width && !el.height) ||  (!el.width && el.height)){
					return true
				}
				return false;
			});
			if(!res){
				return fn("error in resize template");
			}
			return fn(null, template);
		},
		function mediaExists(template, fn){
			model.count({_id:id}, function(err, count){
				if(err){
					return fn(err);
				}
				if(count == 0){
					return fn("no id found");
				}
				return fn(null, template);
			});
		},
		function fileExists(template, fn){
			var extension = 'jpg';
			var filename = id;
			var file = filename + "." + extension;
			var filepath = path.join(conf.fs_poster_location, id + ".jpg");
			fse.exists(filepath, function(exists){
				if(!exists){
					return fn("file doesn't exist to crop");
				}
				fn(null, file, filename, extension, filepath, template)
			});
		},
		function resize(file, filename, extension, filepath, template, fn){
			if(options.simulate){
				return fn();
			}
			async.each(template, function(item, done){
				var label = item.label;
				var newfile_name = label.replace("%file",filename).replace('%extension',extension);
				var newfile_path = path.join(conf.fs_poster_location, newfile_name);
				gm(filepath)
				.resize(item.width || null, item.height || null)
				.noProfile()
				.write(newfile_path, function (err) {
					if (err){
						done(err);
					}else{
						done();
					}
				});
			},fn);
		}
	],fn);
}

function divideStr(val){
	if(!val) return '';
	if(typeof val == 'string')
		return val.split(',');
	else
		return val[0].split(',');
}

function verifyDuration(val){
	if(val == ""){
		return 0;
	}else{
		return parseInt(val);
	}
}

function verifyIMDB(val){

	if(!val || val=='') return '';
	var v = val.match(/tt\d.*\//g);
	if(v && v.length){
		v = v.pop().replace(/tt/gi,'').replace('/','');
		return v;
	}

	return val;
}
function IsNumeric(input)
{
    return (input - 0) == input && (''+input).replace(/^\s+|\s+$/g, "").length > 0;
}
var model = mongoose.model('Media',Media);