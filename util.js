const clone = require('./clone');
const PRNG = require('./showdown-sources/.sim-dist/prng').PRNG;
const _ = require("underscore");

// Some Pokemon Showdown-specific JSON parsing rules
module.exports.safeJSON = function(data) {
	if (data.length < 1) return;
	if (data[0] == ']') data = data.substr(1);
	return JSON.parse(data);
}

// Sanitizes a Room name
module.exports.toRoomid = function(roomid) {
	return roomid.replace(/[^a-zA-Z0-9-]+/g, '');
}

// Unsure exactly - sanitizes roomType?
module.exports.toId = function(text) {
	text = text || '';
	if (typeof text === 'number') text = ''+text;
	if (typeof text !== 'string') return toId(text && text.id);
	return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

module.exports.cloneBattle = function(battle, copyPRNG = true) {
	// here we exclude as many objects as we can from deep-copy
	const excludeKeys = [
		'dex',
		'format',
		'ruleTable',
		'teamGenerator'
	]

	const excludeValues = {};

	excludeKeys.forEach(key => {
		excludeValues[key] = battle[key];
		battle[key] = null;
	})

	const newbattle = clone(battle);

	excludeKeys.forEach(key => {
		battle[key] = newbattle[key] =  excludeValues[key];
	})

	if (!copyPRNG) {
		newbattle.prng = new PRNG(undefined);
		newbattle.prngSeed = newbattle.prng.startingSeed.slice();
	}

	return newbattle;
}

module.exports.toChoiceString = function(choice) {
	if (choice.type == "move") {
			if (choice.runMegaEvo)
					return "move " + choice.id + " mega";
			else if (choice.useZMove)
					return "move " + choice.id + " zmove";
			else if (choice.runDynamax)
					return "move " + choice.id + " dynamax";                    
			else
					return "move " + choice.id;
	} else if (choice.type == "switch") {
			return "switch " + (choice.id + 1);
	}
}

module.exports.parseRequest = function(request) {
	var choices = [];

	if(!request) return choices; // Empty request
	if(request.wait) return choices; // This player is not supposed to make a move

	// If we can make a move
	if (request.active) {
			_.each(request.active[0].moves, function(move, index) {
					if (!move.disabled) {
							const choice = {
									"type": "move",
									"id": move.id,
							};
							choices.push(choice);

							if (request.active[0].canMegaEvo) {
									choices.push({...choice, "runMegaEvo": request.active[0].canMegaEvo})
							}
							if (request.active[0].canZMove && request.active[0].canZMove[index]) {
									choices.push({...choice, "useZMove": true})
							}
							if (request.active[0].canDynamax) {
									choices.push({...choice, "runDynamax": true})
							}
					}
			});
	}

	// Switching options
	var trapped = (request.active) ? (request.active[0].trapped || request.active[0].maybeTrapped) : false;
	var canSwitch = request.forceSwitch || !trapped;
	if (canSwitch) {
			_.each(request.side.pokemon, function(pokemon, index) {
					if (pokemon.condition.indexOf("fnt") < 0 && !pokemon.active) {
							choices.push({
									"type": "switch",
									"id": index
							});
					}
			});
	}

	return {
			rqid: request.rqid,
			choices: choices
	};
}
