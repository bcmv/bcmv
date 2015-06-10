var redis = require('redis');
var validator = require('validator');
var mongoose = require('mongoose');
var conf = require('../config');
var _ = require('underscore');
var async = require('async');
require('./models/Media')
var Media = mongoose.models.Media;
