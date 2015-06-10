//stat file servers
var servers = require('./lib/fileservers');
servers.statServers();
var express = require('express');
var clusterMaster = require("cluster-master")
var conf = require('./config');
var fs = require('fs');
var mongoose = require('mongoose');

var spawn = require('child_process').spawn; 
var harv = spawn('node',['lib/harvester.js']);
harv.stdout.on('data', function(d){
	console.log(d.toString())
})
harv.stderr.on('data', function(d){
	console.log('harvester error:', d.toString())
})

//check for path
for(var i=0; i<conf.fs_location.length; i++){
	if(!fs.existsSync(conf.fs_location[i])){
		throw Error("Write directory \""+conf.fs_location[i]+"\" not found");
		process.exit();
	}
}
if(!fs.existsSync(conf.fs_poster_location)){
	throw Error("Write directory \""+conf.fs_poster_location +"\" not found");
}
if(!fs.existsSync(conf.fs_ads_location)){
	throw Error("Write directory \""+conf.fs_ads_location +"\" not found");
}

clusterMaster('./vod.js')