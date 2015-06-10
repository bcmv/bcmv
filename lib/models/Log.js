var mongoose = require('mongoose');
var Log = mongoose.Schema({
	key:{type:"string"},
	value:{type:"string"},
	metadata:{},
	user:{type:"string"},
	ip:{type:"string"},
	time:{type:"date", required: true},
});

mongoose.model('Log', Log);