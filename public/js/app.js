$(function() {
	
	var socket = io.connect('//');
	socket.on('generated_friends', function (data) {
	  var data = JSON.parse(data);
	  if (data.identifier == USER_HASH && data.payload == "updated_friends") {
	  	$.get("/friends_list", function(response) {
	  		$(".maincol").fadeOut(250, function() {
	  			$(".maincol").html(response);
	  			$(".maincol").fadeIn(250);
	  		});
	  	});
	  }
	});

	$(".friends .friend").live('click', function() {
		if ($(this).hasClass("checked")) {
			$(this).removeClass("checked");
		} else {
			$(this).addClass("checked");
		}
	});

	$(".lists a").live('click', function(e) {
		e.preventDefault();
		if ($(this).data("members") == "*") {
			$(".friends .friend").show();
		} else {
			var ids = $(this).data("members").split(","),
				selector = ".friend[data-fbid='" + ids.join("'],.friend[data-fbid='") + "']",
				$friends = $(selector);
		
			$(".friends .friend").hide();
			$friends.show();
		}
	});
});