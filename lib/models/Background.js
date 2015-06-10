var mongoose = require('mongoose');
var Background = mongoose.Schema({
	description:{type:'string'},
	width:{type:'number', required:true},
	height:{type:'number', required:true},
	file:{type:'string', required:true},
	file_size:{type:'number', required:true},
	date_added:{type:'date', default:Date.now},
	ip:{type:'string', required:true}
});

mongoose.model('Background', Background);