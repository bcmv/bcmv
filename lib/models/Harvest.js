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
var ytdl = require('ytdl-core')
var fs = require('fs')
var Transmission = require('transmission');

transmission = new Transmission({
	host:'localhost',
	port:9091,
	username:'transmission',
	password:'hello'
});

var Harvest = new mongoose.Schema({
	status:{type:'string', enum:['error', 'pending', 'completed', 'moved'], required:true, default:'pending'},
	percent_done:{type:'number', default:0, required:true},
	//media_type:{type:'string', enum:['movie', 'series', 'game', 'application', 'anime'], required:true},
	//state_type:{type:'string', enum:['new', 'exists'], required:true},
	download_type:{type:'string', enum:['torrent', 'youtube', 'direct download'], required:true},
	//imdb_id:'string',
	media_id:'string',
	quality:'string',
	url:{type:'string', required:true},
	size:{type:'number'},

	//series
	season:'number',
	episode:'number',

	//for direct downloads and youtube
	file_location:{type:'string'},

	//for youtube
	youtube_temp_file:'string',
	youtube_temp_location:'string',
	youtube_info:{},
	
	//for torrents
	torrent_hash:'string',
	torrent_folder_location:{type:'string'},
	torrent_transmission_id:{type:'number'},
	torrent_transmission_data:{},

	//for direct downloads
	username:{type:'string'},
	password:{type:'string'},

	time:{type:"date", default:Date.now},
	published:{type:'boolean', default:false}
},{strict:false});

/*Harvest.pre('save', function(next){
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
})*/

Harvest.statics.setSize = function(id, size, fn){

}
// process.env.https_proxy = 'https://video2home.net:3128'
// process.env.HTTPS_PROXY = 'https://video2home.net:3128'
Harvest.statics.download = function download(h, fn){
	if(h.download_type == 'youtube'){
		this.downloadYoutube(h, fn);
	}
	if(h.download_type == 'torrent'){
		this.downloadTorrent(h, fn);
	}
}

Harvest.statics.addTorrent = function download(url, fn){
	transmission.add(url, fn);
}
Harvest.statics.downloadTorrent = function download(h, fn){
	transmission.startNow(h.torrent_transmission_id, fn);
}
Harvest.statics.downloadYoutube = function download(h, fn){
	var opts = {
		filter: function(format) { return format.container === 'mp4'; },
		downloadURL: true
	}
	ytdl.getInfo(h.url,opts, function(err, info){
		var temp_file = Math.random() + '.youtube';
		var temp_path = path.join(conf.temp_download_dir, temp_file)
		var vid = ytdl.downloadFromInfo(info);
		var size=0;
		var downloaded=0;
		vid.on('format', function(f){
			size = parseInt(f.size);
			model.update({_id:h._id},{$set:{size:size, youtube_info:f, youtube_temp_location:temp_path, youtube_temp_file:temp_file}}, function(err){})
			console.log(f);
		});
		vid.on('data', function(chunk){
			downloaded += chunk.length;
			var percent_done = (downloaded/size)*100;
			model.update({_id:h._id},{$set:{percent_done:percent_done}}, function(err){})
		})
		vid.on('end', function(f){
			model.update({_id:h._id},{$set:{percent_done:100, status:'completed'}}, function(err){})
		});
		vid.pipe(fs.createWriteStream(temp_path));
	});
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
var model = mongoose.model('Harvest',Harvest);