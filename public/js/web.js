//preload images

var vod = window.vod = {
	selectedMedia:{},
	mediaDisplayType:"popover",
	searchXHR:null,
	displayMedia:function(el, html){
		//TODO: destroy any existing media
		var media = $(".media");
		var data = el.attr("media-data");
		var type = el.attr("media-type").toLowerCase();
		media.removeClass('selected');
		if(!data){
			return;
		}
		data = JSON.parse(decodeURIComponent(data));
		for(var file in data.files){
			var len = data.files[file].size;
			data.files[file].size = prettyBytes(len);
		}
		if(type == "series" && data.files.length){
			//latest episode
			var latest_episode = _.last(data.files);
			latest_episode.title = "S" + latest_episode.season + "E" + latest_episode.episode;
			data.latest_episode = latest_episode;
			data.description = data.latest_episode.plot || data.description;	
		}
		el.addClass('selected');
		media.popover('destroy');
		$(".tabpop")
			.removeClass("tabpop-anim-in")
			.removeClass("tabpop-anim-out");
		//display
		if(this.mediaDisplayType == "popover"){
			el.popover({
				html:true,
				content:jade.render(type, data)
			}).popover('show');
		}else{
			$(".tabpop").html(jade.render(type, data))
			$(".tabpop").addClass("tabpop-anim-in");
		}
	},
	filterSearch:function(){
		//get properties
		var props = $("[filter-prop]")
		var props_build = {};
		if(props.length){
			props.each(function(){
				//debugger;
				var self = $(this)
				var prop = self.attr('filter-prop');
				var val;
				if(self.find('li.active').length){
					val =  self.find('li.active').text()
				}else{
					val = self.find('label.active').text()
				}
				if(val && val.length > 0){
					props_build[prop] = val;
				}
			});
		}
		//get str
		var finder = $("#finder");
		var query = finder.val();
		var tokens = query.split(' ');
		var t_obj = {};

		tokens = _.map(tokens,function(t){
			if(t.indexOf(":") != -1){
				var str = t.split(':');
				var key = str[0];
				var val = str[1];
				t_obj[key] = val;
				if(props_build[key]){
					var str = key + ":" + props_build[key];
					//props_build[key];
				}
				return '';
			}else{
				return t;
			}
		});
		for(var i in props_build){
			tokens.push(i+":"+props_build[i]);
		}
		finder.val(tokens.join(' ').trim().toLowerCase());
		finder.trigger('keyup');
	},
	handleError:function handleError(error){
		var error = error || {message: "An error occured"};
		var message = error.message || error.error.message || JSON.stringify(error);
		$("#error-message").text(message);
		$("#modal-error").modal('show');
	},
	handleCommand : function handleCommand(data){
		if(data.confirm){
			if (!confirm("Are you sure you want to do this?")){
				return;
			}
		}
		var route = data['route'];
		var id = data['id'];
		var method = data['method'] || "get";
		var template = data['template'];
		var display = data['display'];
		var payload = data['payload'] || {};

		var processData = true;
		var contentType = true;
		console.log(payload.constructor.name)
		if(payload){
			processData = false;
			contentType = false;
			if(payload.constructor.name != "FormData"){
				var form = new FormData();
				for(var i in payload){
					form.append(i, payload[i]);
				}
				payload = form;
			}
		}
		var q = {
			method:method,
			url:route,
			dataType:'json',
			processData: processData,
			contentType: contentType,
			success:function(data){
				if(data.error){
					return alert(data.error);
				}
				if(data.html){
					if(display){
						$(display).html(data.html);
					}else{
						$("body").append(data.html);
					}
				}
				if(template && display && data && data.length){
					var html = _.map(data, function(media){
						return jade.render(template,{item:media});
					});
					html = html.join('');
					$(display).html(html);
				}
			},
			error:function(err){
				vod.handleError(err);
			}
		}
		if(method != 'get'){
			q.data = payload;
		}
		$.ajax(q)
	},
	handleCommandEvent : function handleCommandEvent(event){
		var data = {};
		var el = $(this);
		data.route = el.attr('data-cmd-route');		
		data.id = el.attr('data-id');		
		data.method = el.attr('data-cmd-method');		
		data.template = el.attr('data-cmd-template');		
		data.display = el.attr('data-cmd-display');		
		data.route = el.attr('data-cmd-route');
		data.confirm = el.attr('data-cmd-confirm');
		data.payload = new FormData();
		$.each(this.attributes, function(){
			if(this.name.indexOf('data-payload') != -1){
				var attr = this.name.replace('data-payload-', '');
				data.payload.append(attr,this.value);
			}
		});
		vod.handleCommand(data);
	},
	refreshCart: function(checkout){
		$.getJSON('/cart', function(res){
			if(res.error){
				return alert(res.error);
			}
			if(res.medias && res.medias.length){
				var html = jade.render('cart-items',{items:res.medias, total_bytes:res.total_bytes, total_price:res.total_price, checkout:checkout||false});
				$("#cart-items").html(html);
			}
		});
	},
	getRequests: function(){
		async.forever(function(next){
			$.getJSON('/cart/pending-payment', function(res){
				//remove transactions which doesn't exist
				console.log(res);
				$('.cart-authorize-item').each(function(){
					var i = $(this);
					var id = i.attr('id');
					var c = _.find(res,function(c){
						console.log(c._id, id);
						return c._id == id;
					});
					if(!c){
						i.remove();
					}
				});
				res.forEach(function(c){
					var exist = $("#" + c._id);
					if(exist.length){
						return;
					}
					var html = jade.render('cart-items-admin',{item:c});
					$("#requests").append(html);
				});
				setTimeout(function(){
					vod.getRequests();
				},1000)
			});
		}, function(err){

		})
	}
};

var files_container = [];

$(function(){
	$('body').on('click', '.approve-item', function(){
		var id = $(this).attr('data-id');
		$.post('/cart/'+id+'/approve', function(res){

		});
	});
	$('body').on('click', '.remove-cart-item', function(){
		var id = $(this).attr('data-id');
		$.post('/cart/remove', {id:id}, function(res){
			if(res.error){
				return alert(res.error);
			}
			vod.refreshCart();	
		});
	});
	var ads = $('.advertisement').map(function(){
		var id = $(this).attr('data-id');
		return id
	});
	setTimeout(function(){
		var arr = ads.toArray();
		if(!arr.length) return;
		$.post('/ad/tick',{ids:arr});
	},1000);
	$(window).scroll(function(){
		if ($(window).scrollTop() + $(window).height() >= $(document).height() - 50){
			$("#search-more").trigger('click');
		}
	});
	$('body').on('click', '.chart', function(){
		var self = $(this);
	});
	$('body').on('click', '.command', vod.handleCommandEvent);
	$('body').on('click', '#send-reset-password', function(){
		var email = $("#reset-password-email").val();
		if(email != ''){
			$.post('/user/reset',{email:email}, function(res){
				$("#error-message").text(res.error || res.message);
				$("#modal-error").modal('show');
			});
		}
	})
	$('body').on('click', '#confirm-reset-password', function(){
		var email = $("#reset-password-email").val();
		var code = $("#reset-password-code").val();
		var password = $("#reset-password-password").val();
		if(email != ''){
			$.post('/user/reset-password',{email:email, code:code, password:password}, function(res){
				$("#error-message").text(res.error || res.message);
				$("#modal-error").modal('show');
				if(res.message){
					$('#modal-reset-account').modal('hide');
				}
			});
		}
	})
	$('body').on('click', '#signin-help', function(){
		$('#modal-reset-account').modal('show')
	})
	$("body").on('click', '#send-request', function(){
		var title = $('#request-title').val();
		var details = $('#request-details').val();
		if(title == ''){
			return;
		}
		$.post('/media/request',{title:title, details:details}, function(res){
			if(res.error){
				$("#error-message").text(res.error);
				$("#modal-error").modal('show');
			}else{
				$("#error-message").text(res.message);
				$("#modal-error").modal('show');
				$("#modal-request").modal('hide');
				$('#request-title').val('');
				$('#request-details').val('');
			}
		});
	});
	$("body").on('click', '.show-request-dialog', function(){
		var val = $("#finder").val();
		$("#request-title").val(val);
		$('#modal-request').modal('show')
	});
	$("body").on('click', '#confirm-verification', function(){
		var code = $('#verification-code').val();
		if(!code || code == ""){
			return;
		}
		$.post('/user/verify',{code:code}, function(res){
			if(res.error){
				return vod.handleError(res.error);
			}
			$('#modal-verify').modal('hide');
		});
	});
	$("body").on('click', '#send-verification-code', function(){
		$.post('/user/send-verification-sms')
	});
	$('body').on('click', '.flag-file a', function(){
		var id = $(this).parent().parent().attr('data-id');
		var reason = $(this).text();
		$.post('/media/flag', {id:id, reason:reason}, function(res){

		});
	})
	$("body").on('click', '.subscription-toggle', function(){
		var self = $(this);
		var id = self.attr('data-id');
		$.post('/user/subscription-toggle',{id:id}, function(res){
			if(res.error){
				if(!res.error.verified){
					$('#modal-verify').modal('show')
				}
				return;
			}
			if(res.watchlisted){
				self.addClass('active');
				self.find('span:first').removeClass('glyphicon-plus').addClass('glyphicon-ok');
				self.find('.watchlist-label').html('&nbsp;watchlisted');
			}else{
				self.removeClass('active');
				self.find('span:first').removeClass('glyphicon-ok').addClass('glyphicon-plus');
				self.find('.watchlist-label').html('&nbsp;add to watchlist');				
			}
		})
	});
	$("body").on('click', '#signup', function(){
		var fields = "name username email password mobile".split(" ");
		var vals = {};
		_.each(fields, function(f){vals[f] = $("#signup-" +f).val()});
		var isEmpty = _.find(fields, function(f){return $("#signup-" +f).val() == "";}) ? true : false;
		if(isEmpty){
			//return alert('Please fill all fields');
		}
		//enforce a strong pass
		if(vals.password.length <=5 || "123456 asdfg".indexOf(vals.password) != -1){
			$("#error-message").text('Please use a stronger password');
			$("#modal-error").modal('show');
			return;
		}
		if(vals.mobile.length != 7){
			$("#error-message").text('Incorrect mobile number');
			$("#modal-error").modal('show');
			return;
		}
		if(!vals.username.match(/^[a-zA-Z0-9_]*$/)){
			$("#error-message").text('Username must contain letters and numbers!');
			$("#modal-error").modal('show');
			return;
		}
		$.post('/user/register',vals, function(res){
			if(res.error){
				$("#error-message").text(res.error);
				$("#modal-error").modal('show');
			}else if(res.message){
				$("#error-message").text(res.message);
				$("#modal-error").modal('show');
				$('#signup-form').slideUp('fast');
			}
		});
	})
	$('body').on('click', '#listings-subpropfilter .btn-group-vertical label', function(){
		setTimeout(window.vod.filterSearch,0);
	});
	$('body').on('click', '.vod-list-inline li', function(){
		var self = $(this);
		self.siblings().removeClass('active');
		self.addClass("active");
	});
	$('body').on('click', '#search-more', function(){
		var last = $("#search-content .media:last");
		var id = last.attr('media-id');
		vod.searchSince = id;
		vod.filterSearch();
	})
	$('body').on('click', '#filter-container-elements li', function(){
		var self = $(this);
		var props = self.attr('filter-subprops');
		if(props){
			props = JSON.parse(props);
			var html = jade.render("listings-subpropfilter",{props:props});
			var subprop = $("#listings-subpropfilter");
			if(subprop.length){
				subprop.html(html);
			}else{
				$("#sub-contents").prepend("<section id='listings-subpropfilter'>" + html + "</section>");
			}
			$("#listings-subpropfilter .btn-group-vertical").each(function(){
				var self = $(this);
				var prop = self.attr('filter-prop');
				self.find('label').each(function(){
					var label = $(this);
					var text = label.text();
					label.html('<input type="radio" name="'+prop+'">' + text);
				})
			});
		}else{
			$("#listings-subpropfilter").html('');
		}
		setTimeout(window.vod.filterSearch,0);
	})
	$("body").on('keyup', '#finder', function(){
		var t = window.vod.searchTime;
		if(t){
			window.clearTimeout(window.vod.searchTime);
		}
		window.vod.searchTime = setTimeout(function(){
			var val = $("#finder").val();
			if(val == '' || val.length < 2){
				$("#main-content").show();
				$("#search-content").hide();
				return;
			}
			if(window.vod.searchXHR){
				window.vod.searchXHR.abort();
			}
			var search_params = {
				query:val
			}
			$("#main-content").hide();
			$("#search-content").show();
			if(vod.searchSince){
				search_params.since = vod.searchSince;
			}
			if(vod.searchType){
				search_params.type = vod.searchType;
			}
			window.vod.searchXHR = $.getJSON('/media/search',search_params,function(res){
				vod.searchSince = null;
				if(!res.length && !search_params.since){
					var html = jade.render('not-found');
					$("#search-content").html(html);
					return;
				}
				var items = _.map(res, function(m){
					m.files = _.sortBy(m.files, function(a){
						var score = parseFloat(a.season + '.' + a.episode);
						return score;
					});
					var lastfile = _.last(m.files);
					m.lastfile = lastfile;
					return jade.render('item',{item:m, lastfile:lastfile});
				});
				if(search_params.since){
					$("#search-content .listing").append(items.join(''));
					if(res.length < 4){
						$("#search-more").remove();
					}
				}else{
					var more = res.length < 4 ?'':jade.render('search-more');
					var html = '<ul class="dl-horizontal listing">'+items.join('')+'</ul>' + more;
					$("#search-content").html(html);
				}
			});	
		},300);
	})
	$("body").on('click', '.media a', function(e){
		// e.preventDefault();
		// e.stopPropagation();
		// var media = $(this).parent();
		//vod.displayMedia(media, "html");		
	});

	$("body").on("change", "#media-retrieve-data", function(){
		var val = $(this).val();
		$("#loader").show();
		$.post('/media/retrieve-data',{url:val}, function(res){
			$("#loader").hide();
			for(prop in res){
				$("#new-media-info-container input[media-prop='"+prop+"']").val(res[prop]);
			}
			$("#new-media-info-container textarea[media-prop='description']").html(res.description);
			$("#media-image").attr('src',"/media/pipe?url=" + res.poster);
		});
	});
	$("body").on("dragenter","#file-dropper", function(e){
		e.stopPropagation();
		e.preventDefault();
		var self = $(this);
		self.css('border', '2px solid #0B85A1');
	});
	$("body").on("dragend","#file-dropper", function(e){
		e.stopPropagation();
		e.preventDefault();
		var self = $(this);
		self.css('border', '2px solid red');
	});
	$("body").on("dragover","#file-dropper", function(e){
		e.stopPropagation();
		e.preventDefault();
	});
	
	$("body").on("drop","#file-dropper", function(e){
		e.stopPropagation();
		e.preventDefault();
		var self = $(this);
		self.css('border', '2px solid transparent');
		var files = e.originalEvent.dataTransfer.files;
		for(var i=0; i<files.length; i++){
			files_container.push(files[i]);
		}
		renderFiles();
	});
	$("body").on('click', '#media-type label', function(){
		$("#media-file-type").hide();
		$("#media-image").attr("src","");
		files_container.length = 0;
		window.vod.selectedMedia = {};
		var self = $(this);
		var type = self.text();
		var template = self.attr('media-template');
		var html = jade.render(template);
		$("#file-container").html('');
		files_container.length = 0;
		$("#new-media-info-container").html(html);
		if(type == "App"){
			type = "application";
		}
		var engine = new Bloodhound({
			datumTokenizer: function(d){
				return Bloodhound.tokenizers.whitespace(d.title)
			},
			queryTokenizer: Bloodhound.tokenizers.whitespace,
			prefetch:{
				url:'/media/search?type='+type.toLowerCase()+'&fields=title&include_unpublished=1&limit=1000000',
				ttl:1000,
				filter:function(media){
					return $.map(media, function (data) {
						data.value = data.title;
						return data;
					});
				}
			}
		});
		engine.clearPrefetchCache();
		engine.initialize();			
		$(".search").typeahead(
			{
				hint: true,
				highlight: true,
				minLength: 1
			},
			{
				displayKey: 'value',
				source: engine.ttAdapter()
			}
		)
		.on("typeahead:selected", function(datum, obj){
			$("#loader").show();
			$.getJSON('/media/' + obj._id, function(obj){
				$("#loader").hide();
				$("#media-file-type label:first").trigger('click');
				window.vod.selectedMedia = obj;
				$("[media-prop-type='text']").each(function(){
					var self = $(this);
					var prop = self.attr("media-prop");
					self.val(obj[prop]);
				});
				$("[media-prop-type='group']").each(function(){
					var self = $(this);
					var prop = self.attr("media-prop");
					self.find('label').each(function(){
						if($(this).text().trim() == obj[prop]){
							$(this).addClass('active');
						}else{
							$(this).removeClass('active');
						}
					});
				});
				$("#new-media-form-content").show();
				$("#media-file-type").show();
				var html = jade.render('file-details',{files:obj.files});
				$("#display-uploaded-media").html(html);
				var options = jade.render('newmedia-media-options',{id:obj._id});
				$("#save-info").parent().append(options);
			});
		})	
	})
	$("body").on('click', '#media-file-type label', function(){
		var self = $(this);
		var template = self.attr('media-template');
		var html = jade.render(template);
		$("#media-file-type-container").html(html);
	});


	$('body').on('click', function (e) {
		if (!$(e.target).parent().parent().hasClass('media') && $(e.target).parents('.popover.in').length === 0) { 
			$(".media").popover('destroy').removeClass('selected');
		}
	});
	$("body").on('click', '.remove-upload-file', function(){
		var index = $(this).attr('data-index');
		files_container.splice(index,1);
		renderFiles();
	});
});

function renderFiles(){
	$("#file-container").html('');
	files_container.forEach(function(file, index){
		var html = jade.render('file-container',{index:index, file:file.name||file.fileName, size:prettyBytes(file.size||file.fileSize)});
		$("#file-container").append(html);
	})
}

enquire.register("screen and (max-width:768px)", {
    match:function(){
    	vod.mediaDisplayType = "tabpop";
    	console.log(vod)
    },
    unmatch:function(){
    	vod.mediaDisplayType = "popover";
    	console.log(vod)
    }
});

var socket = window.socket = io.connect();
