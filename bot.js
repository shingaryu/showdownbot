// Command-line Arguments
global.program = require('commander');
global.program
	.option('--console', 'Only start the web console - not the game playing bot.')
	.option('--host [url]', 'The websocket endpoint of the host to try to connect to. ["http://sim.smogon.com:8000/showdown"]', 'http://sim.smogon.com:8000/showdown')
	.option('--port [port]', 'The port on which to serve the web console. [3000]', "3000")
	.option('--ranked', 'Challenge on the ranked league.')
	.option('--net [action]', "'create' - generate a new network. 'update' - use and modify existing network. 'use' - use, but don't modify network. 'none' - use hardcoded weights. ['none']", 'none')
	.option('--algorithm [algorithm]', "Can be 'minimax', 'greedy', or 'random'. ['minimax']", "minimax")
	.option('--depth [depth]', "Minimax bot searches to this depth from the current state. [2]", "2")
	.option('--account [file]', "File from which to load credentials. ['account.json']", "account.json")
	.option('--team6g [file]', "File from which to load a battle team for Gen 6. ['team6g.txt']", "team6g.txt")
	.option('--team7g [file]', "File from which to load a battle team for Gen 7. ['team7g.txt']", "team7g.txt")
	.option('--team8g [file]', "File from which to load a battle team for Gen 8. ['team8g.txt']", "team8g.txt")
	.option('--nosave', "Don't save games to the in-memory db.")
	.option('--nolog', "Don't append to log files.")
	.option('--onlyinfo', "Hide debug messages and speed up bot calculations")
	.option('--startchallenging', "Start out challenging, instead of requiring a manual activation first.")
	.option('--usechildprocess', "Use child process to execute heavy calculations with parent process keeping the connection to showdown server.")
	.parse(process.argv);

var request = require('request'); // Used for making post requests to login server
var util = require('./util');
var fs = require('fs');

// Setup Logging
require('./configure-logger')(global.program.onlyinfo ? 'info': 'all', !global.program.nolog);
var logger = require('log4js').getLogger("bot");

// Login information for this bot
global.account = JSON.parse(fs.readFileSync(global.program.account));

// Global variables for simulator
global.Dex = require('./showdown-sources/.sim-dist/dex').Dex;
global.toId = Dex.toID;

// Battle teams for this bot
const teamText6g = fs.readFileSync(global.program.team6g, "utf8")
global.team6g = require('./team-importer').TeamImporter.importTeam(teamText6g);
const teamText7g = fs.readFileSync(global.program.team7g, "utf8")
global.team7g = require('./team-importer').TeamImporter.importTeam(teamText7g);
const teamText8g = fs.readFileSync(global.program.team8g, "utf8")
global.team8g = require('./team-importer').TeamImporter.importTeam(teamText8g);

// Connect to server
var sockjs = require('sockjs-client-ws');
var client = null;
if(!global.program.console) client = sockjs.create(global.program.host);

// Domain (replay button redirects here)
global.DOMAIN = "http://play.pokemonshowdown.com/";

// PHP endpoint used to login / authenticate
var ACTION_PHP = global.DOMAIN + "~~showdown/action.php";

// Values that need to be globally stored in order to login properly
var CHALLENGE_KEY_ID = null;
var CHALLENGE = null;

// Sends a piece of data to the given room
// Room can be null for a global command
var send = module.exports.send = function(data, room) {
	if (room && room !== 'lobby' && room !== true) {
		data = room+'|'+data;
	} else if (room !== true) {
		data = '|'+data;
	}
	client.write(data);

	logger.trace(">> " + data);
}

// Login to a new account
function rename(name, password) {
	var self = this;
	request.post({
		url : ACTION_PHP,
		formData : {
			act: "login",
			name: name,
			pass: password,
			challengekeyid: CHALLENGE_KEY_ID,
			challenge: CHALLENGE
		}
	},
	function (err, response, body) {
		var data = util.safeJSON(body);
		if(data && data.curuser && data.curuser.loggedin) {
			send("/trn " + global.account.username + ",0," + data.assertion);
		} else {
			// We couldn't log in for some reason
			logger.fatal("Error logging in...");
			process.exit();
		}
	});
}

const useChildProcess = global.program.usechildprocess;

let roomHanderProcess;
if (useChildProcess) {
	logger.info("Fork child process of room handler...");
	roomHanderProcess = require('child_process').fork(
		'./roomhandler', [
			JSON.stringify(global.program),
			JSON.stringify(global.account), 
			JSON.stringify(global.DOMAIN),
			JSON.stringify(global.team6g),
			JSON.stringify(global.team7g),
			JSON.stringify(global.team8g),
		], 
		{ execArgv : ['--inspect=9230'] } // fixed debug port for child process
	);
} else {
	logger.info("Import room handler as parent process...");
	require('./roomhandler');
	roomHanderProcess = process;
}

roomHanderProcess.on(useChildProcess? 'message' : 'fromRoomHandler', (msg) => {
	if(msg.substr(0, 6) === 'rename') {
		const data = msg.split('|');
		CHALLENGE_KEY_ID = data[1];
		CHALLENGE = data[2];
		rename(global.account.username, global.account.password);
	}
	else {
		const data = msg.split('@');
		const message = data[0];
		const room = data[1];
		send(message, room);
	}
});

if(client) {
	client.on('connection', function() {
		logger.info('Connected to server.');
	});

	client.on('data', function(msg) {
		if (useChildProcess) {
			roomHanderProcess.send(msg);
		} else {
			process.emit('fromBot', msg);
		}
	});

	client.on('error', function(e) {
		logger.error(e);
	});
}
