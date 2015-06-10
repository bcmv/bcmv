var mongoose = require('mongoose');
var Cart = mongoose.Schema({
	session_uuid:{type:'string', required:true},
	status:{type:'string', default:'pending payment', enum:["pending payment", 'payment received', 'cancelled'], required:true},
	user:{type:'string', required:true},
	files:{type:'array', required:true},
	total_bytes:{type:'number', required:true},
	date_added:{type:'date', default:Date.now},
	authorised_user:'string',
	ip:{type:'string', required:true},
	transaction_number:{type:'number', required:true}
});

Cart.statics.getNextTransactionNumber = function(fn){
	this
	.findOne({},{transaction_number:1})
	.sort({transaction_number:-1})
	.lean()
	.exec(function(err, proc){
		if(err){
			return fn(err);
		}
		var batch = proc && proc.transaction_number ? proc.transaction_number+1 : 1;
		fn(null, batch);
	})

}

mongoose.model('Cart', Cart);