const clone = require('./clone');
const PRNG = require('./showdown-sources/.sim-dist/prng').PRNG;

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
