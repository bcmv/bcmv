var argv = require('optimist').argv;

exports.authenticate = function authenticate(req,res,next){
	if(req.isAuthenticated()){
		return next();
	}
	if(req.xhr){
		return res.json({error:'please login first'});
	}
	res.redirect('/login?redirect=' + req.originalUrl);
}

exports.authenticateAdmin = function authenticateAdmin(req,res,next){
	if(req.isAuthenticated()){
		if(req.user.level == 0){
			return res.redirect('/');
		}
		return next();
	}
	if(req.xhr){
		return res.json({error:'please login first'});
	}
	res.redirect('/login?redirect=' + req.originalUrl);
}