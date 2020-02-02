/**************************************************************************
 * This module can be run as either parent process or child process.
 * In both cases, bot.js keeps the websocket connection with Showdown server, 
 * and messages which it received from the server are handled here.
 **************************************************************************/

const isChildProcess = module === process.mainModule;

const logger = require('log4js').getLogger("roomhandler");
logger.info("Room handler starts!");

// set global variables cloned from parent
if (isChildProcess) {
	global.program = JSON.parse(process.argv[2]);
	global.account = JSON.parse(process.argv[3]);
	global.DOMAIN = JSON.parse(process.argv[4]);
	global.team6g = JSON.parse(process.argv[5]);
	global.team7g = JSON.parse(process.argv[6]);
	global.team8g = JSON.parse(process.argv[7]);
	require('./initLog4js')(global.program.nolog, global.program.onlyinfo);
} 

const BattleRoom = require('./battleroom');
const util = require('./util');

// Global room counter (this allows multiple battles at the same time)
const ROOMS = {};
const team6g = require('./showdown-sources/.sim-dist/dex').Dex.packTeam(global.team6g);
const team7g = require('./showdown-sources/.sim-dist/dex').Dex.packTeam(global.team7g);
const team8g = require('./showdown-sources/.sim-dist/dex').Dex.packTeam(global.team8g);

// The game type that we want to search for on startup
var GAME_TYPE = (global.program.ranked) ? "randombattle" : "unratedrandombattle";

// when received a message from parent
process.on(isChildProcess ? 'message' : 'fromBot', (msg) => {
	recieve(msg);
}) 

// when send a message to parent
function send(msg, room) {
	const contents = room === undefined ? msg : msg + '@' + room;
	if (isChildProcess) {
		process.send(contents);
	} else {
		process.emit('fromRoomHandler', contents);
	}
}

// Global recieve function - tries to interpret command, or send to the correct room
function recieve(data) {
	logger.trace("<< " + data);

	var roomid = '';
	if (data.substr(0,1) === '>') { // First determine if this command is for a room
		var nlIndex = data.indexOf('\n');
		if (nlIndex < 0) return;
		roomid = util.toRoomid(data.substr(1,nlIndex-1));
		data = data.substr(nlIndex+1);
	}
	if (data.substr(0,6) === '|init|') { // If it is an init command, create the room
		if (!roomid) roomid = 'lobby';
		var roomType = data.substr(6);
		var roomTypeLFIndex = roomType.indexOf('\n');
		if (roomTypeLFIndex >= 0) roomType = roomType.substr(0, roomTypeLFIndex);
		roomType = util.toId(roomType);

		logger.info(roomid + " is being opened.");
		addRoom(roomid, roomType);

	} else if ((data+'|').substr(0,8) === '|expire|') { // Room expiring
		var room = ROOMS[roomid];
		logger.info(roomid + " has expired.");
		if(room) {
			room.expired = true;
			if (room.updateUser) room.updateUser();
		}
		return;
	} else if ((data+'|').substr(0,8) === '|deinit|' || (data+'|').substr(0,8) === '|noinit|') {
		if (!roomid) roomid = 'lobby';

		// expired rooms aren't closed when left
		if (ROOMS[roomid] && ROOMS[roomid].expired) return;

		logger.info(roomid + " has been closed.");
		removeRoom(roomid);
		return;
	}
	if(roomid) { //Forward command to specific room
		if(ROOMS[roomid]) {
			ROOMS[roomid].recieve(data);
		} else {
			logger.error("Room of id " + roomid + " does not exist to send data to.");
		}
		return;
	}

	// Split global command into parts
	var parts;
	if(data.charAt(0) === '|') {
		parts = data.substr(1).split('|');
	} else {
		parts = [];
	}

	switch(parts[0]) {
		// Recieved challenge string
		case 'challenge-string':
		case 'challstr':
			logger.info("Recieved challenge string...");
			CHALLENGE_KEY_ID = parseInt(parts[1], 10);
			CHALLENGE = parts[2];

			// Now try to rename to the given user
			// handled by parent's rename() func 
			send('rename' + '|' + CHALLENGE_KEY_ID + '|' + CHALLENGE);
			break;
		// Server is telling us to update the user that we are currently logged in as
		case 'updateuser':
			// The update user command can actually come with a second command (after the newline)
			var nlIndex = data.indexOf('\n');
			if (nlIndex > 0) {
				recieve(data.substr(nlIndex+1));
				nlIndex = parts[3].indexOf('\n');
				parts[3] = parts[3].substr(0, nlIndex);
			}

			var name = parts[1];
			var named = !!+parts[2];

			if(name == global.account.username) {
				logger.info("Successfully logged in.");
				onLogin()
			}
			break;
		// Server tried to send us a popup
		case 'popup':
			logger.info("Popup: " + data.substr(7).replace(/\|\|/g, '\n'));
			break;
		// Someone has challenged us to a battle
		case 'updatechallenges':
			var challenges = JSON.parse(data.substr(18));
			if(challenges.challengesFrom) {
				for(var user in challenges.challengesFrom) {
					if(challenges.challengesFrom[user] == "gen6randombattle") {
						logger.info("Accepting challenge from " + user);
						send("/accept " + user);
					} else if (challenges.challengesFrom[user] == "gen6battlespotsingles") {
						send("/utm " + team6g);
						send("/accept " + user);
					} else if (challenges.challengesFrom[user] == "gen7randombattle") {
						logger.info("Accepting challenge from " + user);
						send("/accept " + user);
					} else if (challenges.challengesFrom[user] == "gen7battlespotsingles") {
						send("/utm " + team7g);
						send("/accept " + user);
					} else if (challenges.challengesFrom[user] == "gen8randombattle") {
						logger.info("Accepting challenge from " + user);
						send("/accept " + user);
					} else if (challenges.challengesFrom[user] == "gen8battlestadiumsingles") {
						logger.info("Accepting challenge from " + user);
						send("/utm " + team8g);
						send("/accept " + user);
					} else {
						logger.warn("Won't accept challenge of type: " + challenges.challengesFrom[user]);
						send("/reject " + user);
					}
				}
			}
			break;
		// Unkown global command
		default:
			logger.warn("Did not recognize command of type: " + parts[0]);
			break;
	}
}

// Add a new room (only supports rooms of type battle)
function addRoom(id, type) {
	if(type == "battle") {
		let formatId = 'base';
		const firstHyphen = id.indexOf('-');
		const lastHyphen = id.lastIndexOf('-');
		if (firstHyphen < lastHyphen) {
			formatId = id.substring(firstHyphen + 1, lastHyphen);
		}

		let team = null;
		if (formatId === 'gen6battlespotsingles') {
			team = team6g;
		} else if (formatId === 'gen7battlespotsingles') {
			team = team7g;
		} else if (formatId === 'gen8battlestadiumsingles') {
			team = team8g;
		}

		ROOMS[id] = new BattleRoom(id, send, formatId, team);
		return ROOMS[id];
	} else {
		logger.error("Unkown room type: " + type);
	}
}
// Remove a room from the global list
function removeRoom(id) {
	var room = ROOMS[id];
	if(room) {
		delete ROOMS[id];
		return true;
	}
	return false;
}

// Code to execute once we have succesfully authenticated
function onLogin() {
    //do nothing
}

function searchBattle() {
	logger.info("Searching for an unranked random battle");
    send("/search " + GAME_TYPE);
}

module.exports.searchBattle = searchBattle;
module.exports.ROOMS = ROOMS
module.exports.send = send;

// Web console, which reads battle states from exports.ROOMS 
var webconsole = require("./console.js");