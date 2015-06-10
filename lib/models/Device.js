var mongoose = require('mongoose');
var Device = mongoose.Schema({
	app_id:{type:"string", required:true},
	version:{type:'string', required:true},
	version_numeric:{type:'number', required:true},
	release:{type:'string', enum:["stable", 'dev'], required:true},
	description:{type:'string', required:true},
	file:{type:'string', required:true},
	file_size:{type:'number', required:true},
	date_added:{type:'date', default:Date.now},
	ip:{type:'string', required:true}
});

mongoose.model('Device', Device);