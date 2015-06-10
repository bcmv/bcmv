var mongoose = require('mongoose');
var crypto = require('crypto');
var conf = require("../../config");
var fs = require('fs');

var user_types = 'user uploader admin'.split(' ');
var user_status = 'registered activated banned'.split(' ');

var UserGroup = new mongoose.Schema({
	name:"string",
	description:"string",
	time: 'date'
});

mongoose.model('UserGroup', UserGroup);