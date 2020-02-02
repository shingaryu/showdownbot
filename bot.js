// Command-line Arguments
global.program = require('commander');
global.program
	.option('--console', 'Only start the web console - not the game playing bot.')
	.option('--host [url]', 'The websocket endpoint of the host to try to connect to. ["http://sim.smogon.com:8000/showdown"]', 'http://sim.smogon.com:8000/showdown')
	.option('--port [port]', 'The port on which to serve the web console. [3000]', "3000")
	.option('--ranked', 'Challenge on the ranked league.')
	.option('--net [action]', "'create' - generate a new network. 'update' - use and modify existing network. 'use' - use, but don't modify network. 'none' - use hardcoded weights. ['none']", 'none')
	.option('--algorithm [algorithm]', "Can be 'minimax', 'greedy', or 'random'. ['minimax']", "minimax")
	.option('--account [file]', "File from which to load credentials. ['account.json']", "account.json")
	.option('--team [file]', "File from which to load a battle team. ['team.txt']", "team.txt")
	.option('--nosave', "Don't save games to the in-memory db.")
	.option('--nolog', "Don't append to log files.")
        .option('--startchallenging', "Start out challenging, instead of requiring a manual activation first.")
	.parse(process.argv);

var request = require('request'); // Used for making post requests to login server
var util = require('./util');
var fs = require('fs');

// Setup Logging
var log4js = require('log4js');
log4js.loadAppender('file');
var logger = require('log4js').getLogger("bot");

if(!global.program.nolog) {
	// Ensure that logging directory exists
	if(!fs.existsSync("./logs")) { fs.mkdirSync("logs") };

	log4js.addAppender(log4js.appenders.file('logs/bot.log'), 'bot');

	log4js.addAppender(log4js.appenders.file('logs/minimax.log'), 'minimax');
	log4js.addAppender(log4js.appenders.file('logs/learning.log'), 'learning');

	log4js.addAppender(log4js.appenders.file('logs/battleroom.log'), 'battleroom');
	log4js.addAppender(log4js.appenders.file('logs/decisions.log'), 'decisions');

	log4js.addAppender(log4js.appenders.file('logs/webconsole.log'), 'webconsole');

	log4js.addAppender(log4js.appenders.file('logs/battle.log'), 'battle');
	log4js.addAppender(log4js.appenders.file('logs/battlepokemon.log'), 'battlepokemon');
	log4js.addAppender(log4js.appenders.file('logs/battleside.log'), 'battleside');

	log4js.addAppender(log4js.appenders.file('logs/greedy.log'), 'greedy');
} else {
	logger.setLevel("INFO");
	log4js.configure({
		appenders : [
			{
				type: "console",
				category: ["bot"]
			}
		]
	});
}

// Login information for this bot
global.account = JSON.parse(fs.readFileSync(global.program.account));

// Battle team for this bot
const teamText = fs.readFileSync(global.program.team, "utf8")
logger.debug(teamText);
global.team = require('./tools').importTeam(teamText);

var webconsole = require("./console.js");// Web console

// Connect to server
var sockjs = require('sockjs-client-ws');
var client = null;
if(!global.program.console) client = sockjs.create(global.program.host);

// Domain (replay button redirects here)
var DOMAIN = "http://play.pokemonshowdown.com/";
exports.DOMAIN = DOMAIN;

// PHP endpoint used to login / authenticate
var ACTION_PHP = DOMAIN + "~~showdown/action.php";

// Values that need to be globally stored in order to login properly
var CHALLENGE_KEY_ID = null;
var CHALLENGE = null;

// BattleRoom object
var BattleRoom = require('./battleroom');

// The game type that we want to search for on startup
var GAME_TYPE = (global.program.ranked) ? "randombattle" : "unratedrandombattle";

// Load in Game Data
var Pokedex = require("./data/pokedex");
var Typechart = require("./data/typechart");

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

// When you debug, you cannot use child process 
// const useChildProcess = true;
const useChildProcess = false;

let roomHanderProcess;
if (useChildProcess) {
	logger.info("Fork child process of room handler...");
	roomHanderProcess = require('child_process').fork('./roomhandler', [JSON.stringify(global.account), JSON.stringify(global.program)]);
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

// onevsonetest();

function onevsonetest () {
let minimaxbot = require("./bots/minimaxbot");
let clone = require("./clone");

logger.debug("1 vs 1 test");
battle = require('./battle-engine/battle-engine').construct('base', false, null);
const poke1 = battle.getTemplate("Raikou");
poke1.moves = poke1.randomBattleMoves;
poke1.level = 50;
const poke2 = battle.getTemplate("Tyranitar");
poke2.moves = poke2.randomBattleMoves;
poke2.level = 50;
battle.join('p1', 'Guest 1', 1, [poke1]);
battle.join('p2', 'Guest 2', 1, [poke2]);
battle.start();
logger.debug("pokemons created");
console.dir(poke1);
console.dir(poke2);

battle.makeRequest();    
console.dir("request:: " + battle.p1.request[0]);

const decision = BattleRoom.parseRequest(battle.p1.request);
console.dir("decision " +  decision[0]);
const result = minimaxbot.decide(clone(battle), decision.choices);
console.dir(result);
}