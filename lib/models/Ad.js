var mongoose = require('mongoose');
var Ad = mongoose.Schema({
	_id:{type:mongoose.Schema.ObjectId},
	title:{type:"string"},
	type:{type:"string"},
	size:{type:'array'},
	url:{type:'string'},
	effective_from:{type:"date", required:true},
	effective_to:{type:"date"},
	priority:{type:"string"},
	user:{type:"string"},
	ip:{type:"string"},
	file_name:{type:"string"},
	file_extension:{type:"string"},
	file_location:{type:"string"},
	file_size:{type:"number"},
	payment_type:{type:"string"},
	payment_amount:{type:"number"},
	time:{type:"date", required: true},
	views:{type:'number', default:0}
});

mongoose.model('Ad', Ad);