var Unfriend = function() {
	var _unfriend = this;
	
	_unfriend.initialised = false;

	_unfriend.Init = function() {
		_unfriend.initialised = true;
		
		_unfriend.Facebook = new _unfriend._Facebook();
		_unfriend.Facebook.Init();
	};

	_unfriend._Facebook = function() {
		var _facebook = this;

		_facebook.Init = function() {
			// Maybe do something here?
		};

		_facebook.Login = function() {
			if (_unfriend.initialised) {
				FB.login(function(response) {
					if (response.authResponse) {
						window.location.reload();
					} else {
						// Cancelled or didn't go all the way
					}
				}, { scope: "email" });
			}
		}
	};
};
