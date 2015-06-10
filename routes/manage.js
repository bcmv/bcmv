var express = require('express');
var mongoose = require('mongoose');

require('../lib/models/Media.js');
var Media = mongoose.models.Media;

var router = express.Router();

router.get('/', function(req, res) {
	Media
	.find({},function(err, docs){
		res.json(docs);
	})
});

module.exports = router; 

   