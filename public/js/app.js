$(function() {
	
	var socket = io.connect('//');
	socket.on('generated_friends', function (data) {
	  $(".maincol").text(data);
	});
});