var mongoose = require('mongoose');
var User = mongoose.models.User;
exports.filterMedia = function filterMedia(req, docs, fn){
	if(!arguments.length || arguments.length < 3){
		throw Error("invalide filter call");
	}
	docs = docs.map(function(d){
		for(var i=1; i<=10; i++){
			delete d['download_link' + i];
			delete d['l'+i+'_quality'];
		}
		delete d.directory;
		delete d.anime;
		delete d.award_id;
		delete d.ip;
		delete d.keywords;
		delete d.downloads;
		delete d.language;
		delete d.movie_quality;
		delete d.movie_type;
		delete d.series_type;
		delete d.status;
		delete d.tagline;
		delete d.trailer;
		delete d.usa_rating;
		delete d.usa_rating_reason;
		delete d.user;
		delete d.user_created_record;
		delete d.votes_down;
		delete d.votes_up;
		delete d.download_link;
		delete d.series_id;
		delete d.director;
		delete d.views;
		delete d.location_parent;
		delete d.migrated;
		delete d.published;
		delete d.migrated_id;
		delete d.converted;
		delete d.update_timestamp;

		//delete info from files
		if(d.files && d.files.length){
			d.files = d.files.map(function(f){
				if(f == 'null' || !f){
					return;
				}
				delete f.location;
				delete f.location_parent;
				delete f.ip;
				delete f.user;
				delete f.migrated;
				delete f.migrated_id;
				delete f.migrated_location;
				delete f.migrated_location_parent;
				delete f.name;
				delete f.fs_location;
				delete f.extension;
				delete f.downloads;
				delete f.flags;
				return f;
			})
		}

		return d;
	});
	if(req.isAuthenticated()){
		//check for user subscriptions
		User
		.findOne({_id:req.user._id},{subscriptions:1})
		.lean()
		.exec(function(err, user){
			var s = user.subscriptions;
			if(!s){
				s = [];
			}
			docs = docs.map(function(doc){
				var id = doc._id.toString();
				doc.subscribed = s.indexOf(id) == -1 ? false : true;
				return doc;
			});
			fn(docs);
		})
	}else{
		fn(docs);
	}
}
