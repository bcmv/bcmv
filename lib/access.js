var mongoose = require('mongoose');
var User = mongoose.models.User;

exports.access = function access(acl){
	return function(req, res, next){
		User
		.count({_id:req.user._id, 'groups.name':acl})
		.exec(function(err, count){
			if(count == 0){
				next("unauthorized");
			}else{
				next();
			}
		})
	}
}