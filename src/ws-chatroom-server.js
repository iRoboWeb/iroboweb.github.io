var util = require("util");

var WebSocketAPI = require("./WebSocket-server.js");
var WebSocketServer = WebSocketAPI.WebSocketServer;
var WebSocket = WebSocketAPI.WebSocket;
var log = WebSocketAPI.log;

var server = WebSocketServer.listen({
	// host: "",
	port: 8002,
	heartBeatTimeout: 30,
	// acceptOrigins: ["http://weihub.local"],
	httpListener: function(request, response) {
		response.writeHead(200, {
			"content-type" : "text/html"
		});
		response.end("running");
	}
}, function(webSocket, request){
	webSocket.open();
	var user = new User(webSocket);
});

var userList = [];
var onlineUsers = {};

var uniqueId = 0;

var MSG_TYPE_TEXT = 0x1;
var MSG_TYPE_IMAGE = 0x2;
var MSG_TYPE_PLACE = 0x3;
var MSG_TYPE_LIST = 0x8;
var MSG_TYPE_JOIN = 0x9;
var MSG_TYPE_LEAVE = 0xa;
var MSG_TYPE_JOIN_ERROR = 0xb;

function User(webSocket) {

	this.uid = (++ uniqueId);
	this.joined = false;
	this.name = null;
	this.avatar = "";
	this.ip = webSocket.socket.remoteAddress;
	this.webSocket = webSocket;

	userList.push(this);
	// onlineUsers[username] = this;

	this.sendUserList();

	var self = this;

	webSocket.on("data", function(data){
		if (Buffer.isBuffer(data)) {
			// TODO: unexpected buffer received
			return;
		}
		try {
			var msg = JSON.parse(data);
		} catch (e) {
			// TODO: invalid message received
			return;
		}
		self.messageReceived(msg.type, msg.data);
	});

	webSocket.on("close", function(by, code, reason){
		log(webSocket.socket, util.format("Connection Closed by %s: <%d> %s", by, code, reason));
		self.leave();
		var index = userList.indexOf(self);
		if (index > -1) {
			userList.splice(index, 1);
		}
	});
}

User.prototype.toObject = function(){
	return {
		uid: this.uid,
		name: this.name,
		avatar: this.avatar,
		ip: this.ip
	}
};

User.prototype.messageReceived = function(type, data){
	switch (type) {
		case MSG_TYPE_TEXT:
			this.textReceived(data);
			break;
		case MSG_TYPE_IMAGE:
			this.imageReceived(data);
			break;
		case MSG_TYPE_PLACE:
			this.placeReceived(data);
			break;
		case MSG_TYPE_JOIN:
			this.join(data);
			break;
		case MSG_TYPE_LEAVE:
			this.leave(data);
			break;
	}
};

User.prototype.textReceived = function(data) {
	notify(MSG_TYPE_TEXT, {
		user: this.name,
		content: data.content
	}, this);
};

User.prototype.imageReceived = function(data) {
	notify(MSG_TYPE_IMAGE, {
		user: this.name,
		content: data.content
	}, this);
};

User.prototype.placeReceived = function(data) {
	notify(MSG_TYPE_PLACE, {
		user: this.name,
		coords: data
	}, this);
};

User.prototype.join = function(data) {
	var name = data.name.trim(),
		avatar = data.avatar;
	if (!(name && /^.{2,20}$/.test(name.replace(/[\u0100-\uffff]/g, "aa")))) {
		log(this.webSocket.socket, "Invalid Username");
		this.send(MSG_TYPE_JOIN_ERROR, {
			code: 1,
			reason: "Invalid Username"
		});
		return;
	}
	if (name in onlineUsers) {
		log(this.webSocket.socket, "Username Already Online");
		this.send(MSG_TYPE_JOIN_ERROR, {
			code: 2,
			reason: "Username Already Online"
		});
		return;
	}
	this.name = name;
	this.avatar = avatar;
	this.joined = true;
	onlineUsers[name] = this;

	notify(MSG_TYPE_JOIN, this.toObject());
};


User.prototype.leave = function(data) {
	if (!this.joined) {
		// TODO: unjoined
		return;
	}
	var name = this.name;
	if (name in onlineUsers) {
		delete onlineUsers[name];
	}
	this.name = null;
	this.avatar = "";
	this.joined = false;

	notify(MSG_TYPE_LEAVE, {
		name: name
	});
};

User.prototype.sendUserList = function() {
	var users = [],
		unjoined = 0;
	for (var i = 0; i < userList.length; ++ i) {
		var user = userList[i];
		if (user.joined) {
			users.push(user.toObject());
		} else {
			++ unjoined;
		}
	}
	this.send(MSG_TYPE_LIST, {
		list: users,
		unjoined: unjoined
	});
};

User.prototype.send = function(type, data, time) {
	time = time || Date.now();
	var msg = JSON.stringify({
		type: type,
		time: time,
		data: data
	});
	this.webSocket.send(msg);
};

function notify(type, data, user) {
	// var users = [];
	if (user) {
		if (!user.joined) {
			// TODO: unjoined
			return;
		}
	}
	var time = Date.now();
	for (var i = 0; i < userList.length; ++ i) {
		userList[i].send(type, data, time);
	}
}
