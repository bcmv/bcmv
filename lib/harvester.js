var request = require('request');
var h = require('../harvest.json');
var async = require('async');
var mongoose = require('mongoose');
var conf = require('../config');
var Transmission = require('transmission');
var console = require('tracer').console();
transmission = new Transmission({
	host:'localhost',
	port:9091,
	username:'transmission',
	password:'hello'
});

mongoose.connect('mongodb://127.0.0.1:27017/' + conf.db,{server:{poolSize:5}});
require('../lib/models/Harvest')

var Harvest = mongoose.models.Harvest;
//youtube queue
async.forever(function(next){
	Harvest
	.find({download_type:'youtube', status:/error|pending/})
	//.lean()
	.exec(function(err, harvs){
		async.eachSeries(harvs, function(h, done){
			Harvest.download(h, done);
		}, function(err){
			if(err){
				console.log(err);
			}
			setTimeout(function(){
				next();
			},5000);
			
		})
	})
}, function(err){
	
});

//torrent download
async.forever(function(next){
	Harvest
	.find({download_type:'torrent', status:/error|pending/})
	//.lean()
	.exec(function(err, harvs){
		async.eachSeries(harvs, function(h, done){
			Harvest.download(h, done);
		}, function(err){
			if(err){
				console.log(err);
			}
			setTimeout(function(){
				next();
			},1000);
		})
	})
}, function(err){
	
});

//torrent update
async.forever(function(next){
	transmission.get(function(err, ts){
		if(err){
			console.log(err);
			return setTimeout(function(){
				next();
			},2000)
		}
		trans = ts ? ts.torrents : [];
		async.each(trans, function(item, done){
			var size = item.totalSize;
			var percent_done =  item.percentDone*100;
			var update = {
				size:size,
				percent_done:percent_done,
				torrent_transmission_data:item
			}
			if(percent_done == 100){
				update.status == 'completed';
			}
			Harvest.update({torrent_hash:item.hashString},update, done);
		}, function(err){
			next();
		})
	});
}, function(err){
	
});
