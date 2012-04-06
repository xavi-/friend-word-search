var fs = require("fs");
var http = require("http");
var quip = require("quip");
var bee = require("beeline");
var bind = require("bind");

var games = JSON.parse(fs.readFileSync("./games.json")), curGameIdx = getNewGame(-1);
var selections = {}, foundWords = {};

function getNewGame(lastGameIdx) {
	do { var newGameIdx = Math.floor(Math.random() * games.length); }
	while(lastGameIdx === newGameIdx);

	selections = {};
	foundWords = {};

	return newGameIdx;
}

var route = bee.route({
	"`preprocess`": [
		function(req, res) { quip.update(res); }
	],
	"/ /index.html": function(req, res) {
		var info = {
			game: JSON.stringify(games[curGameIdx]),
			selections: JSON.stringify(selections),
			foundWords: JSON.stringify(foundWords)
		};
		bind.toFile("./templates/index.html", info, function(data) {
			res.html(data);
		});
	}
})


function getSelectedPos(startPos, endPos) {
	var diffRow = endPos[0] - startPos[0], diffCol = endPos[1] - startPos[1];
	if(diffRow === 0 && diffCol === 0) { return startPos; }

	var isHorizontal = (diffRow === 0);
	var isVertical = (diffCol === 0);
	var isDiagonal = (Math.abs(diffRow) === Math.abs(diffCol));
	if(!isHorizontal && !isVertical && !isDiagonal) { return []; }

	var pos = [], steps = Math.max(Math.abs(diffRow), Math.abs(diffCol)) + 1;
	var stepRow = diffRow && diffRow / Math.abs(diffRow);
	var stepCol = diffCol && diffCol / Math.abs(diffCol);
	for(var i = 0; i < steps; i++) {
		pos.push([ startPos[0] + stepRow * i, startPos[1] + stepCol * i ]);
	}
	return pos;
}

var server = http.createServer(route);
var io = require("socket.io").listen(server);

io.sockets.on("connection", function(socket) {
	socket
		.on("found", function(info) {
			var curGame = games[curGameIdx];

			if(curGame.words.indexOf(info.word.toUpperCase()) === -1) { return; }

			var pos = getSelectedPos(info.startPos, info.endPos), word = "";
			for(var i = 0; i < pos.length; i++) {
				word += curGame.board[pos[i][0]][pos[i][1]];
			}

			if(word !== info.word && word.split("").reverse().join("") !== info.word) { return; }

			foundWords[info.word] = info;
			socket.broadcast.emit("found", info);

			if(curGame.words.filter(function(word) { return !foundWords[word]; }).length === 0) { // Game Over
				socket.broadcast.emit("game-over");
				socket.emit("game-over");
				setTimeout(function() {
					curGameIdx = getNewGame(curGameIdx);
					socket.broadcast.emit("new-game", games[curGameIdx]);
					socket.emit("new-game", games[curGameIdx]);
				}, 5000);
			}
		})
		.on("select", function(coords) {
			coords.userId = socket.id;
			socket.broadcast.emit("select", coords);
			selections[coords.userId] = coords;
		})
		.on("unselect", function() {
			socket.broadcast.emit("unselect", socket.id);
			selections[socket.id] = null;
			delete selections[socket.id];
		})
		.on("disconnect", function() {
			socket.broadcast.emit("unselect", socket.id);
			selections[socket.id] = null;
			delete selections[socket.id];
		});
});
io.set("log level", 1);
io.enable("browser client minification");
io.enable("browser client etag");
io.set('transports', [ // enable all transports (option
	// 'websocket'
	'flashsocket'
	, 'htmlfile'
	, 'xhr-polling'
	, 'jsonp-polling'
]);

server.listen(8010);
// http://wordsearchfun.com/9845_ANDREW_LESSON_4_wordsearch.html
// var a = ""; $("table tr").map(function() { $(this).find("td").map(function() { a += $(this).text().trim(); }); a += "\n"; }); b = $(".dyntextval").text().split(/\n/g).filter(function(t) { return t.trim().length > 0; }); a = a.trim().split(/\n/g).map(function(r) { return r.split(""); }); copy(JSON.stringify({ "board": a, "words": b }));