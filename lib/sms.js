var request = require('request');
var validator = require('validator');
var conf = require('../config');

exports.send = function(obj, fn){
	var query = {};
	if(!arguments.length){
		throw Error("no arguments passed")
	}
	if(typeof obj != "object"){
		throw Error("no object here");
	}
	if(!obj.recipient || !obj.message){
		return fn("Missing parameter");
	}
	var query = {
		action:"sendmessage",
		username:conf.sms_user,
		password:conf.sms_password,
		recipient:obj.recipient,
		messagedata:obj.message,
		messagetype:"SMS:TEXT"
	}
	request.get({
		url:conf.sms_url,
		qs:query
	}, fn);
}