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
});