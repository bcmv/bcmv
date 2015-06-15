var express = require('express');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('underscore');
var conf = require('../config');
var fs = require('fs');
var fse = require('fs-extra');
var prettyBytes = require('pretty-bytes');
var validator = require('validator');
var sms = require('../lib/sms');
//var Media = mongoose.models.Media;
var Media = mongoose.models.Media;
var User = mongoose.models.User;
var Cart = mongoose.models.Cart;
var Log = mongoose.models.Log;
var Device = mongoose.models.Device;
var Pool = require('mysql-simple-pool');
var nodemailer = require('nodemailer');
var renderPage = require('../lib/render_page').renderPage;
var moment = require('moment');
var rndm = require('rndm');
var crypto = require('crypto');
var jade = require('jade');
var authenticate = require('./authenticate').authenticate;
var authenticateAdmin = require('./authenticate').authenticateAdmin;
var access = require('../lib/access').access;
var _str = require('underscore.string');
var router = express.Router();
var path = require('path');
_.str = require('underscore.string');

router.get('/', authenticate, function(req, res, next){
	getCart(req, function(err, json){
		res.json(json);
	});
});
router.post('/add', authenticate, function(req, res, next){
	req.session.cart = req.session.cart || {};
	if(req.body.file){
		req.session.cart[req.body.file] = 1;
	}
	console.log(req.session.cart)
	res.json({success:1});
});
router.post('/remove', authenticate, function(req, res, next){
	req.session.cart = req.session.cart || {};
	if(req.body.id){
		delete req.session.cart[req.body.id];
	}
	res.json({success:1});
});
router.get('/checkout', authenticate, function(req, res, next){
	getCart(req, function(err, json){
		json.items = json.medias;
		res.render('cart-checkout', json);
	});	
});
router.post('/commit', authenticate, function(req, res, next){
	getCart(req, function(err, cart){
		Cart.getNextTransactionNumber(function(err, num){
			var trans = {
				session_uuid:req.session.uuid,
				user:req.user._id,
				ip:req.ip,
				status:'pending payment',
				total_bytes:cart.total_bytes,
				files:cart.files,
				transaction_number:num
			};
			var transaction = new Cart(trans);
			transaction.system_id = conf.system_id;
			transaction.save(function(err, d){
				if(err){
					return next(err);
				}
				req.session.cart.transaction_number = num;
				res.redirect('/cart/authorize')
			})
		});
	});	
});
router.get('/authorize', authenticate, function(req, res, next){
	res.render('cart-authorize', {transaction_number:req.session.cart.transaction_number});
});
router.get('/move', authenticate, function(req, res, next){
	res.render('cart-move', {transaction_number:req.session.cart.transaction_number});
});
router.get('/cancel', authenticate, function(req, res, next){
	var uuid = req.session.uuid;
	if(!uuid){
		return res.redirect('/');
	}
	//console.log('here');process.exit();
	Cart.update({session_uuid:uuid, status:'pending payment'}, {$set:{status:'cancelled'}},function(err, c){
		delete req.session.cart;
		res.redirect('/');
	})
});
router.post('/:id/approve', authenticateAdmin, function(req, res, next){
	var id = req.params.id;
	Cart.findOne({_id:id}, function(err, c){
		if(err){
			return next(err);
		}
		if(c.status == "pending payment"){
			Cart.update({_id:id},{$set:{status:'payment received'}}, function(err, c){
				if(err){
					return next(err);
				}
				if(c == 1){
					res.json({success:1})
				}else{
					res.json({success:0});
				}
			})
		}else{
			res.json({error:'transaction is not in pending payment status'});
		}
	});
});
router.get('/status', authenticate, function(req, res, next){
	var uuid = req.session.uuid;
	if(!uuid){
		return res.redirect('/');
	}
	Cart.findOne({session_uuid:uuid},function(err, c){
		res.json(c);
	})
});
router.get('/pending-payment', authenticateAdmin, function(req, res,next){
	Cart
	.find({status:'pending payment'})
	.lean()
	.exec(function(err, carts){
		carts = carts.map(function(c){
			var total_bytes = 0;
			var total_price = 0;
			c.files.forEach(function(f){
				if(!f){
					return;
				}
				total_bytes += f.size;
				total_price += f.price;
			});
			c.total_bytes = total_bytes;
			c.total_price = total_price;
			return c;
		});
		res.json(carts)
	})
});
router.get('/copy', authenticate, function(req, res, next){
	res.render('cart-copy', {transaction_number:req.session.cart.transaction_number});
})
router.post('/copy', authenticate, function(req, res, next){
	var t = parseInt(req.body.transaction_number);
	var mount = req.body.mount;
	var cart;
	async.waterfall([
		function validate(fn){
			Cart.findOne({transaction_number:t}, function(err, c){
				if(err){
					return next(err);
				}
				if(!c){
					return next('transaction not found');
				}
				if(c.status != "payment received"){
					return next('invalid status');
				}
				fn();
			});
		},
		function update(fn){
			var u = {
				mount:mount,
				status:'copying'
			}			
			Cart.update({transaction_number:t},{$set:u}, function(err, c){
				if(err){
					return fn(err);
				}
				fn();
			})
		}
	], function(err){
		if(err){
			return next(err);
		}
		Cart.copy(t);
		res.redirect('/cart/copy')
	})
})
module.exports = router;

function getCart(req, fn){
	if(!req.session.cart){
		return fn(null, {});
	}
	var files = _.keys(req.session.cart);
	async.mapSeries(files, function(item, done){
		Media.findOne({'files._id':item}, {'files.$':1, year:1, type:1, title:1})
		.lean()
		.exec(done);
	}, function(err, medias){
		if(err){
			console.log(err)
			return fn(err);
		};
		var total_bytes = 0;
		var total_price = 0;
		var _medias = {};
		var files = [];
		medias.forEach(function(m){
			if(!m){
				return;
			}
			var f = m.files[0];
			files.push(f);
			total_bytes += f.size;
			total_price += f.price;
			if(!_medias[m._id]){
				_medias[m._id] = m;
			}else{
				_medias[m._id].files.push(f)
			}
		});
		var a = [];
		for(var i in _medias){
			a.push(_medias[i]);

		}
		var json = {
			files:files,
			medias:a,
			total_bytes:total_bytes,
			total_price:total_price
		}
		fn(null, json);
	});
}