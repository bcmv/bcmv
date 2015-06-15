console.log('Worker started: pid ' + process.pid);
//require('./lib/crons');
console = require('tracer').console();
var express = require('express');
var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var stylus = require('stylus');
var jade_browser = require('jade-browser');
var passport = require('passport');
var passport_local = require('passport-local').Strategy;
var conf = require('./config');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var crypto = require('crypto');
var compress = require('compression');
var multer = require('multer');
var fs = require('fs');
var async = require('async');
var imagetype = require('imagetype');
var imagesize = require('image-size');
var rndm = require('rndm');
var fse = require('fs-extra');
var _ = require('underscore');
var argv = require('optimist').argv;
var request = require('request');
var uuid = require('uuid');
var df = require('node-df');
var prettyBytes = require('pretty-bytes');
//connect to db
var authenticate = require('./routes/authenticate').authenticate;
var authenticateAdmin = require('./routes/authenticate').authenticateAdmin;
var mongoose = require('mongoose');
var host = '127.0.0.1';
if(conf.host){
	host = conf.host
}
mongoose.connect('mongodb://'+host+':27017/' + conf.db,{server:{poolSize:5}});

require('./lib/models/User')
require('./lib/models/Log')
require('./lib/models/UserGroup')
require('./lib/models/Ad')
require('./lib/models/Cart')
require('./lib/models/Background')
require('./lib/models/Harvest')

//routes
var media = require('./routes/media');
var user = require('./routes/user');
var insight = require('./routes/insight');
var usergroup = require('./routes/usergroup');
var ad = require('./routes/ad');
var cart = require('./routes/cart');
var harvest = require('./routes/harvest');

var Background = mongoose.models.Harvest;
var Background = mongoose.models.Background;
var Cart = mongoose.models.Cart;
var Ad = mongoose.models.Ad;
var User = mongoose.models.User;
var UserGroup = mongoose.models.UserGroup;
var Media = mongoose.models.Media;
var Log = mongoose.models.Log;


var renderPage = require('./lib/render_page').renderPage;


User.createIfNotExists({username:'anonymous', password:'bell cell sell'});

///passport
passport.use(new passport_local({
		usernameField: 'username',
		passwordField: 'password',
		passReqToCallback: true
	},
	function(req, username, password, done) {
		User.authenticate({username:username, password:password}, function(err, user){
			if(err) throw err;
			if(!user){
				return done(null, false, {msg: "Incorrect username or password"});
			}
			done(null, user);
		});
	}
));

passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
	User.findOne({_id:id, banned:false},{subscriptions:0,password:0, downloads:0})
	.lean()
	.exec(function(err, user){
		var u = 'user uploader admin'.split(' ');
		user.level = u.indexOf(user.type);
		done(err, user);
	});
});

//utils

function hashMatch(hash, password){
	return hashPassword(password) === hash;
}

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.enable('trust proxy')
app.disable('x-powered-by')
app.use(favicon(path.join(__dirname, '/public/favicon.ico')));
app.use(logger('combined'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(multer({includeEmptyFields: true}))
app.use(cookieParser(conf.cookie_secret));
app.use(stylus.middleware({ src: __dirname + '/public', force:true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'bower_components')));
app.use(express.static(path.join(__dirname, 'node_modules/emojione')));
app.use(jade_browser('/templates.js', '**', {root: __dirname + '/views/components', cache:false})); 
app.use(function(req, res, next){
    res.header('Vary', 'Accept');
    next();
}); 
app.use(
	compress({
		filter: function (req, res) {
			return /json|text|javascript|css/.test(res.getHeader('Content-Type'))
		},
		level: 9
	})
);

app.use(session({
	resave:true,
	saveUninitialized:true,
	secret: conf.cookie_secret, 
	store: new MongoStore({
		mongoose_connection:mongoose.connection
	}), 
	cookie: { maxAge: 1000 * 60 * 60 * 7 * 1000 ,httpOnly: false, secure: false}}));
app.use(passport.initialize());
app.use(passport.session());
app.use(function(req,res,next){
	res.locals._session = req.session;
	res.locals._user = req.user;
	if(req.user){
		res.locals._user.groups = res.locals._user.groups || [];
		res.locals._user.groups = res.locals._user.groups.map(function(g){return g.name});
		res.locals._user.hasAccess = function(){
			var groups = Array.prototype.slice.call(arguments, 0);
			console.log(arguments);
			var exists = true;
			groups.forEach(function(g){
				if(res.locals._user.groups.indexOf(g) == -1){
					exists = false;
				}
			});
			return exists;
		}
	}
	if(!req.session.uuid){
		req.session.uuid = uuid.v1();
	}
	next();
});
app.use(function(req, res, next){
	var u = req.session.uuid;
	if(!u){
		return next();
	}
	Cart.findOne({session_uuid:u, status: {$in:['pending payment', 'payment received']}}, function(err, t){
		if(!t){
			return next();
		}
		if(
			req.url == "/logout" || 
			req.url == "/drives" || 
			req.url == "/cart/authorize" || 
			req.url == "/cart/move" || 
			req.url == "/cart/copy" || 
			req.url == "/cart/drive" || 
			req.url == "/cart/cancel" || 
			req.url == "/cart/status"){

			return next();
		}
		if(t.status == 'pending payment'){
			res.redirect('/cart/authorize');
		}else{
			res.redirect('/cart/move');
		}
	})
});
app.get('/', authenticate, function(req,res){
	console.log(req.session)
	renderPage(req,res, function(err, page){
		res.render('home', page);
	})	
});
app.get('/p', function(req,res){
	var q = req.query.q;
	if(!q){
		res.end();
	}
	request(q)
	.pipe(res);
})
app.get('/v/:id',function(req,res){
	res.redirect('/media/' + req.params.id);
});
app.get('/movies', function(req,res){
	renderPage(req,res, function(err, page){
		page.type = 'movie';
		res.render('listings', page);
	})
});
app.get('/applications',function(req,res){
	renderPage(req,res, function(err, page){
		page.type = 'application';
		res.render('listings', page);
	})
});
app.get('/series',function(req,res){
	renderPage(req,res, function(err, page){
		page.type = 'series';
		res.render('listings', page);
	})
});
app.get('/login', function(req,res){
	if (req.isAuthenticated()){
		var url = '/';
		if(req.query.redirect){
			url = req.query.redirect;
		}
		return res.redirect(url);
	}
    res.render('login');
});
app.post(
	'/login',
	function(req,res,next){
		passport.authenticate('local', function(err, user, info){
			if(err){
				return next(err);
			}
			var fail = "An error occured.";
			if(!user){
				fail = "Username or password incorrect.";
				return res.render('login',{msg:fail});
			}
			req.logIn(user, function(err) {
      			if (err) { return next(err); }				
				res.redirect(req.headers.referer);
			})
		})(req, res, next);		
	}
);
app.post(
	'/login-anonymous',
	function(req,res,next){
		req.body.username = "anonymous";
		req.body.password = "bell cell sell";
		passport.authenticate('local', function(err, user, info){
			if(err){
				return next(err);
			}
			var fail = "An error occured.";
			if(!user){
				fail = "Username or password incorrect.";
				return res.render('login',{msg:fail});
			}
			req.logIn(user, function(err) {
      			if (err) { return next(err); }				
				res.redirect(req.headers.referer);
			})
		})(req, res, next);		
	}
);
app.get('/logout', function(req, res){
	req.session.destroy();
    req.logout();
    res.redirect('/');
});
app.use('/media', media);
app.use('/user', user);
app.use('/ad', ad);
app.use('/cart', cart);
app.use('/usergroup', usergroup);
app.use('/insight', insight);
app.use('/harvest', harvest);

app.get('/manage/media',function(req,res){
	res.redirect('/media/new');
})
app.get('/manage/flagged',function(req,res){
	res.redirect('/media/flagged');
})
app.get('/manage/requests',function(req,res){
	res.redirect('/media/requests');
})
app.get('/live',function(req,res){
	renderPage(req,res, function(err, page){
		page.type = 'series';
		res.render('live', page);
	});
})
app.get('/backgrounds', function(req, res){
	Background
	.find()
	.sort({_id:-1})
	.lean()
	.exec(function(err, d){
		res.json(filter(d));
	})
});
app.post('/background', function(req, res, next){
	var file;
	var filename;
	var w,h;
	async.waterfall([
		function validateTempKey(fn){
			if(!req.body.key == "CC6B565B2A47F"){
				return fn('invalid key');
			}
			return fn();
		},
		function isImage(fn){
			file = req.files.file;
			if(!file){
				fn("no file");
			}
			imagetype(file.path, function(type){
				if(!type){
					return fn('invalid file type');
				}
				fn();
			})
		},
		function dimensions(fn){
			imagesize(file.path, function(err, d){
				w = d.width;
				h = d.height;
				fn();
			})
		},
		function moveFile(fn){
			filename = "v2h_" + rndm(5) +'-' + _.str.slugify(file.originalname) + '.' + file.extension;
			var newpath = path.join(__dirname, '/public/bg/', filename);
			fse.move(file.path, newpath,fn)			
		},
		function createfile(fn){
			req.body.ip = req.ip;
			req.body.file_size = file.size;
			req.body.file = filename;
			var bg = new Background(req.body)
			bg.width = w;
			bg.height = h;
			bg.save(fn);
		}
	], function(err, r){
		if(err){
			return next(err);
		}
		r = r.toJSON();
		var f = filter(r);
		console.log(f);
		res.json();
	})	
});
app.get('/drives', authenticate, function(req, res){
	df(function(err, list){
		var list = list.filter(function(l){
			return conf.skipmounts.indexOf(l.mount) == -1;
		});
		res.json(list);
	})
})

function filter(obj){
	if(!obj){
		return [];
	}
	if(!obj.length){
		obj = [obj]
	};
	var ret = obj.map(function(r){
		if(!r){
			return
		}
		r.url = 'http://video2home.net/bg/' + r.file;
		delete r.ip;
		delete r.__v;
		return r;
	});
	return ret;
}


/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
//if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.json({
            message: err.message,
            error: err
        });
    });
//}

// production error handler
// no stacktraces leaked to user

app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.end(err || "");
});


var server = app.listen(argv.p || conf.port);
var io = require('socket.io')(server);
var io_redis = require('socket.io-redis');
io.adapter(io_redis({ host: '127.0.0.1', port: 6379, key:'asdasd'}));

io.on('error', function(err){
	throw err;
});
io.on('connection', function(socket){
	var ips = [];
	for(var conn in io.sockets.connected){
		var c = io.sockets.connected[conn];
		var ip = c.conn.remoteAddress;
		if(ips.indexOf(ip) == -1){
			ips.push(ip);
		}
	}
	io.emit('v2h:connected', {clients:ips.length, pid:process.pid});
});

module.exports = app;
