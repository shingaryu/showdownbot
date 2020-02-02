const clone = require('./clone');

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

// implementation might be copied from future(not marged yet) dex.js
const BattleStatIDs = {
	HP: 'hp',
	hp: 'hp',
	Atk: 'atk',
	atk: 'atk',
	Def: 'def',
	def: 'def',
	SpA: 'spa',
	SAtk: 'spa',
	SpAtk: 'spa',
	spa: 'spa',
	SpD: 'spd',
	SDef: 'spd',
	SpDef: 'spd',
	spd: 'spd',
	Spe: 'spe',
	Spd: 'spe',
	spe: 'spe'
};

module.exports.importTeam = function(text, teams) {
	const TypeChart = require("./showdown-sources/data/typechart");
	var text = text.split("\n");
	var team = [];
	var curSet = null;
	if (teams === true) {
		// Storage.teams = [];
		// teams = Storage.teams;
	} else if (text.length === 1 || (text.length === 2 && !text[1])) {
		return Dex.unpackTeam(text[0]);
	}
	for (var i = 0; i < text.length; i++) {
		// var line = $.trim(text[i]);
		var line = text[i].trim();
		if (line === '' || line === '---') {
			curSet = null;
		} else if (line.substr(0, 3) === '===' && teams) {
			team = [];
			// line = $.trim(line.substr(3, line.length - 6));
			line = line.substr(3, line.length - 6).trim();
			var format = 'gen7';
			var bracketIndex = line.indexOf(']');
			if (bracketIndex >= 0) {
				format = line.substr(1, bracketIndex - 1);
				if (format && format.slice(0, 3) !== 'gen') format = 'gen6' + format;
				// line = $.trim(line.substr(bracketIndex + 1));
				line = line.substr(bracketIndex + 1).trim();
			}
			if (teams.length) {
				teams[teams.length - 1].team = Dex.packTeam(teams[teams.length - 1].team);
			}
			var slashIndex = line.lastIndexOf('/');
			var folder = '';
			if (slashIndex > 0) {
				folder = line.slice(0, slashIndex);
				line = line.slice(slashIndex + 1);
			}
			teams.push({
				name: line,
				format: format,
				team: team,
				folder: folder,
				iconCache: ''
			});
		} else if (!curSet) {
			curSet = {name: '', species: '', gender: ''};
			team.push(curSet);
			var atIndex = line.lastIndexOf(' @ ');
			if (atIndex !== -1) {
				curSet.item = line.substr(atIndex + 3);
				if (toId(curSet.item) === 'noitem') curSet.item = '';
				line = line.substr(0, atIndex);
			}
			if (line.substr(line.length - 4) === ' (M)') {
				curSet.gender = 'M';
				line = line.substr(0, line.length - 4);
			}
			if (line.substr(line.length - 4) === ' (F)') {
				curSet.gender = 'F';
				line = line.substr(0, line.length - 4);
			}
			var parenIndex = line.lastIndexOf(' (');
			if (line.substr(line.length - 1) === ')' && parenIndex !== -1) {
				line = line.substr(0, line.length - 1);
				curSet.species = Dex.getTemplate(line.substr(parenIndex + 2)).species;
				line = line.substr(0, parenIndex);
				curSet.name = line;
			} else {
				curSet.species = Dex.getTemplate(line).species;
				curSet.name = '';
			}
		} else if (line.substr(0, 7) === 'Trait: ') {
			line = line.substr(7);
			curSet.ability = line;
		} else if (line.substr(0, 9) === 'Ability: ') {
			line = line.substr(9);
			curSet.ability = line;
		} else if (line === 'Shiny: Yes') {
			curSet.shiny = true;
		} else if (line.substr(0, 7) === 'Level: ') {
			line = line.substr(7);
			curSet.level = +line;
		} else if (line.substr(0, 11) === 'Happiness: ') {
			line = line.substr(11);
			curSet.happiness = +line;
		} else if (line.substr(0, 5) === 'EVs: ') {
			line = line.substr(5);
			var evLines = line.split('/');
			curSet.evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			for (var j = 0; j < evLines.length; j++) {
				// var evLine = $.trim(evLines[j]);
				var evLine = evLines[j].trim();
				var spaceIndex = evLine.indexOf(' ');
				if (spaceIndex === -1) continue;
				var statid = BattleStatIDs[evLine.substr(spaceIndex + 1)];
				var statval = parseInt(evLine.substr(0, spaceIndex), 10);
				if (!statid) continue;
				curSet.evs[statid] = statval;
			}
		} else if (line.substr(0, 5) === 'IVs: ') {
			line = line.substr(5);
			var ivLines = line.split(' / ');
			curSet.ivs = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};
			for (var j = 0; j < ivLines.length; j++) {
				var ivLine = ivLines[j];
				var spaceIndex = ivLine.indexOf(' ');
				if (spaceIndex === -1) continue;
				var statid = BattleStatIDs[ivLine.substr(spaceIndex + 1)];
				var statval = parseInt(ivLine.substr(0, spaceIndex), 10);
				if (!statid) continue;
				if (isNaN(statval)) statval = 31;
				curSet.ivs[statid] = statval;
			}
		} else if (line.match(/^[A-Za-z]+ (N|n)ature/)) {
			var natureIndex = line.indexOf(' Nature');
			if (natureIndex === -1) natureIndex = line.indexOf(' nature');
			if (natureIndex === -1) continue;
			line = line.substr(0, natureIndex);
			if (line !== 'undefined') curSet.nature = line;
		} else if (line.substr(0, 1) === '-' || line.substr(0, 1) === '~') {
			line = line.substr(1);
			if (line.substr(0, 1) === ' ') line = line.substr(1);
			if (!curSet.moves) curSet.moves = [];
			if (line.substr(0, 14) === 'Hidden Power [') {
				var hptype = line.substr(14, line.length - 15);
				line = 'Hidden Power ' + hptype;
				if (!curSet.ivs && TypeChart.BattleTypeChart) {
					curSet.ivs = {};
					for (var stat in TypeChart.BattleTypeChart[hptype].HPivs) {
						curSet.ivs[stat] = TypeChart.BattleTypeChart[hptype].HPivs[stat];
					}
				}
			}
			if (line === 'Frustration') {
				curSet.happiness = 0;
			}
			curSet.moves.push(line);
		}
	}
	if (teams && teams.length) {
		teams[teams.length - 1].team = Dex.packTeam(teams[teams.length - 1].team);
	}
	return team;
}

module.exports.cloneBattle = function(battle) {
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

	return newbattle;
}
