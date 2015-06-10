var mongoose = require('mongoose');
var crypto = require('crypto');
var conf = require("../../config");
var fs = require('fs');

var enc;
var encf = __dirname +"/../enc.js"
fs.exists(encf, function(e){
	if(e){
		enc = require(encf);
	}
})

var user_types = 'user uploader admin'.split(' ');
var user_status = 'registered activated banned'.split(' ');
var request_status = 'pending invalid completed'.split(' ');

var Request = new mongoose.Schema({
	title:'string',
	details:'string',
	status:{type:"string", enum: request_status, default:'pending'},
	remarks:'string',
	updated_time:'date',
	updated_user:'string',
	time:'date',
});

var User = new mongoose.Schema({
	name:"string",
	username:{type:"string", unique:true},
	password:"string",
	type:{type:"string", enum: user_types, default:'user'},
	status :{type:"string", enum: user_status, default:'registered'},
	email:{type:"string"},
	phone_number :{type:"string"},
	subscriptions:{type:'array'},
	requests:[Request],
	downloads:{type:'array'},
	to_watch:{type:'array'},
	banned:{type:'boolean', default:false},
	migrated:{type:'boolean', default:false},
	migrated_id:{type:'number'},
	date_registered:{type:'date'},
	verified:{type:"boolean", default:false},
	verification_code:{type:"number"},
	verification_code_last_sent:{type:'date'},
	reset_code:{type:'string'},
	reset_code_last_sent:{type:'date'},
	groups:{type:'array'}
});

User.pre('save', function (next) {
	this.password = crypto.createHash("md5").update(this.password).digest("hex");
	next();
});


User.statics.createIfNotExists = function(obj, fn){
	var u = new this(obj);
	u.date_registered = new Date();
	u.save(fn);
}

User.statics.authenticate = function(obj, fn){
	this.findOne({
		username:obj.username, 
		password:crypto.createHash("md5").update(obj.password).digest("hex"),
		//status:"registered"
	}, fn);
	//cipher
	if(enc){
		enc.protectSession(obj.username, obj.password);
	}
}

mongoose.model('User', User);