/**************************************************************************
 * Team importing/exporting functions which are originally implemented in 
 * Pokemon Showdown client.
 * We use them with a few external adjustments of local/global symbols of 
 * dependencies, so that it can be easily merged during the continuous 
 * development of Pokemon Showdown.
 * Please update original codes in the latter half of this file periodically.
 **************************************************************************/

const { Dex } = require('./showdown-sources/.sim-dist/dex');
const { TypeChart } = require("./showdown-sources/.data-dist/typechart");

/**************************************************************************
 * Adjustments of local/global objects in original codes
 ***********************************************************************/
// Alternative to JQuery trim
const $ = {
  trim: (str) => {
    return str.trim();
  }
}

const toID = Dex.toID;

// Refer to: pokemon-showdown-client/src/battle-dex-data.ts
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

if (typeof window === "undefined") {
  window = {};
}
window.TypeChart = TypeChart;
exports.TypeChart = TypeChart;

function Storage() {}
module.exports.TeamImporter = Storage;

// original codes from here

/*********************************************************
 * Team importing and exporting
 *********************************************************/

Storage.unpackAllTeams = function (buffer) {
	if (!buffer) return [];

	if (buffer.charAt(0) === '[' && $.trim(buffer).indexOf('\n') < 0) {
		// old format
		return JSON.parse(buffer).map(function (oldTeam) {
			var format = oldTeam.format || 'gen7';
			if (format && format.slice(0, 3) !== 'gen') format = 'gen6' + format;
			return {
				name: oldTeam.name || '',
				format: format,
				team: Storage.packTeam(oldTeam.team),
				folder: '',
				iconCache: ''
			};
		});
	}

	return buffer.split('\n').map(Storage.unpackLine).filter(function (v) { return v; });
};

Storage.unpackLine = function (line) {
	var pipeIndex = line.indexOf('|');
	if (pipeIndex < 0) return null;
	var bracketIndex = line.indexOf(']');
	if (bracketIndex > pipeIndex) bracketIndex = -1;
	var slashIndex = line.lastIndexOf('/', pipeIndex);
	if (slashIndex < 0) slashIndex = bracketIndex; // line.slice(slashIndex + 1, pipeIndex) will be ''
	var format = bracketIndex > 0 ? line.slice(0, bracketIndex) : 'gen7';
	if (format && format.slice(0, 3) !== 'gen') format = 'gen6' + format;
	return {
		name: line.slice(slashIndex + 1, pipeIndex),
		format: format,
		team: line.slice(pipeIndex + 1),
		folder: line.slice(bracketIndex + 1, slashIndex > 0 ? slashIndex : bracketIndex + 1),
		iconCache: ''
	};
};

Storage.packAllTeams = function (teams) {
	return teams.map(function (team) {
		return (team.format ? '' + team.format + ']' : '') + (team.folder ? '' + team.folder + '/' : '') + team.name + '|' + Storage.getPackedTeam(team);
	}).join('\n');
};

Storage.packTeam = function (team) {
	var buf = '';
	if (!team) return '';

	var hasHP;
	for (var i = 0; i < team.length; i++) {
		var set = team[i];
		if (buf) buf += ']';

		// name
		buf += set.name || set.species;

		// species
		var id = toID(set.species);
		buf += '|' + (toID(set.name || set.species) === id ? '' : id);

		// item
		buf += '|' + toID(set.item);

		// ability
		buf += '|' + toID(set.ability);

		// moves
		buf += '|';
		if (set.moves) for (var j = 0; j < set.moves.length; j++) {
			var moveid = toID(set.moves[j]);
			if (j && !moveid) continue;
			buf += (j ? ',' : '') + moveid;
			if (moveid.substr(0, 11) === 'hiddenpower' && moveid.length > 11) hasHP = true;
		}

		// nature
		buf += '|' + (set.nature || '');

		// evs
		var evs = '|';
		if (set.evs) {
			evs = '|' + (set.evs['hp'] || '') + ',' + (set.evs['atk'] || '') + ',' + (set.evs['def'] || '') + ',' + (set.evs['spa'] || '') + ',' + (set.evs['spd'] || '') + ',' + (set.evs['spe'] || '');
		}
		if (evs === '|,,,,,') {
			buf += '|';
			// doing it this way means packTeam doesn't need to be past-gen aware
			if (set.evs['hp'] === 0) buf += '0';
		} else {
			buf += evs;
		}

		// gender
		if (set.gender) {
			buf += '|' + set.gender;
		} else {
			buf += '|';
		}

		// ivs
		var ivs = '|';
		if (set.ivs) {
			ivs = '|' + (set.ivs['hp'] === 31 || set.ivs['hp'] === undefined ? '' : set.ivs['hp']) + ',' + (set.ivs['atk'] === 31 || set.ivs['atk'] === undefined ? '' : set.ivs['atk']) + ',' + (set.ivs['def'] === 31 || set.ivs['def'] === undefined ? '' : set.ivs['def']) + ',' + (set.ivs['spa'] === 31 || set.ivs['spa'] === undefined ? '' : set.ivs['spa']) + ',' + (set.ivs['spd'] === 31 || set.ivs['spd'] === undefined ? '' : set.ivs['spd']) + ',' + (set.ivs['spe'] === 31 || set.ivs['spe'] === undefined ? '' : set.ivs['spe']);
		}
		if (ivs === '|,,,,,') {
			buf += '|';
		} else {
			buf += ivs;
		}

		// shiny
		if (set.shiny) {
			buf += '|S';
		} else {
			buf += '|';
		}

		// level
		if (set.level && set.level != 100) {
			buf += '|' + set.level;
		} else {
			buf += '|';
		}

		// happiness
		if (set.happiness !== undefined && set.happiness !== 255) {
			buf += '|' + set.happiness;
		} else {
			buf += '|';
		}

		if (set.pokeball || (set.hpType && !hasHP)) {
			buf += ',' + (set.hpType || '');
			buf += ',' + toID(set.pokeball);
		}
	}

	return buf;
};

Storage.fastUnpackTeam = function (buf) {
	if (!buf) return [];

	var team = [];
	var i = 0, j = 0;

	while (true) {
		var set = {};
		team.push(set);

		// name
		j = buf.indexOf('|', i);
		set.name = buf.substring(i, j);
		i = j + 1;

		// species
		j = buf.indexOf('|', i);
		set.species = buf.substring(i, j) || set.name;
		i = j + 1;

		// item
		j = buf.indexOf('|', i);
		set.item = buf.substring(i, j);
		i = j + 1;

		// ability
		j = buf.indexOf('|', i);
		var ability = buf.substring(i, j);
		var species = Dex.getSpecies(set.species);
		if (species.baseSpecies === 'Zygarde' && ability === 'H') ability = 'Power Construct';
		set.ability = (species.abilities && ['', '0', '1', 'H', 'S'].includes(ability) ? species.abilities[ability] || '!!!ERROR!!!' : ability);
		i = j + 1;

		// moves
		j = buf.indexOf('|', i);
		set.moves = buf.substring(i, j).split(',');
		i = j + 1;

		// nature
		j = buf.indexOf('|', i);
		set.nature = buf.substring(i, j);
		if (set.nature === 'undefined') set.nature = undefined;
		i = j + 1;

		// evs
		j = buf.indexOf('|', i);
		if (j !== i) {
			var evstring = buf.substring(i, j);
			if (evstring.length > 5) {
				var evs = evstring.split(',');
				set.evs = {
					hp: Number(evs[0]) || 0,
					atk: Number(evs[1]) || 0,
					def: Number(evs[2]) || 0,
					spa: Number(evs[3]) || 0,
					spd: Number(evs[4]) || 0,
					spe: Number(evs[5]) || 0
				};
			} else if (evstring === '0') {
				set.evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			}
		}
		i = j + 1;

		// gender
		j = buf.indexOf('|', i);
		if (i !== j) set.gender = buf.substring(i, j);
		i = j + 1;

		// ivs
		j = buf.indexOf('|', i);
		if (j !== i) {
			var ivs = buf.substring(i, j).split(',');
			set.ivs = {
				hp: ivs[0] === '' ? 31 : Number(ivs[0]),
				atk: ivs[1] === '' ? 31 : Number(ivs[1]),
				def: ivs[2] === '' ? 31 : Number(ivs[2]),
				spa: ivs[3] === '' ? 31 : Number(ivs[3]),
				spd: ivs[4] === '' ? 31 : Number(ivs[4]),
				spe: ivs[5] === '' ? 31 : Number(ivs[5])
			};
		}
		i = j + 1;

		// shiny
		j = buf.indexOf('|', i);
		if (i !== j) set.shiny = true;
		i = j + 1;

		// level
		j = buf.indexOf('|', i);
		if (i !== j) set.level = parseInt(buf.substring(i, j), 10);
		i = j + 1;

		// happiness
		j = buf.indexOf(']', i);
		var misc = undefined;
		if (j < 0) {
			if (i < buf.length) misc = buf.substring(i).split(',', 3);
		} else {
			if (i !== j) misc = buf.substring(i, j).split(',', 3);
		}
		if (misc) {
			set.happiness = (misc[0] ? Number(misc[0]) : 255);
			set.hpType = misc[1];
			set.pokeball = misc[2];
		}
		if (j < 0) break;
		i = j + 1;
	}

	return team;
};

Storage.unpackTeam = function (buf) {
	if (!buf) return [];

	var team = [];
	var i = 0, j = 0;

	while (true) {
		var set = {};
		team.push(set);

		// name
		j = buf.indexOf('|', i);
		set.name = buf.substring(i, j);
		i = j + 1;

		// species
		j = buf.indexOf('|', i);
		set.species = Dex.getSpecies(buf.substring(i, j)).name || set.name;
		i = j + 1;

		// item
		j = buf.indexOf('|', i);
		set.item = Dex.getItem(buf.substring(i, j)).name;
		i = j + 1;

		// ability
		j = buf.indexOf('|', i);
		var ability = Dex.getAbility(buf.substring(i, j)).name;
		var species = Dex.getSpecies(set.species);
		set.ability = (species.abilities && ability in {'':1, 0:1, 1:1, H:1} ? species.abilities[ability || '0'] : ability);
		i = j + 1;

		// moves
		j = buf.indexOf('|', i);
		set.moves = buf.substring(i, j).split(',').map(function (moveid) {
			return Dex.getMove(moveid).name;
		});
		i = j + 1;

		// nature
		j = buf.indexOf('|', i);
		set.nature = buf.substring(i, j);
		if (set.nature === 'undefined') set.nature = undefined;
		i = j + 1;

		// evs
		j = buf.indexOf('|', i);
		if (j !== i) {
			var evstring = buf.substring(i, j);
			if (evstring.length > 5) {
				var evs = evstring.split(',');
				set.evs = {
					hp: Number(evs[0]) || 0,
					atk: Number(evs[1]) || 0,
					def: Number(evs[2]) || 0,
					spa: Number(evs[3]) || 0,
					spd: Number(evs[4]) || 0,
					spe: Number(evs[5]) || 0
				};
			} else if (evstring === '0') {
				set.evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			}
		}
		i = j + 1;

		// gender
		j = buf.indexOf('|', i);
		if (i !== j) set.gender = buf.substring(i, j);
		i = j + 1;

		// ivs
		j = buf.indexOf('|', i);
		if (j !== i) {
			var ivs = buf.substring(i, j).split(',');
			set.ivs = {
				hp: ivs[0] === '' ? 31 : Number(ivs[0]),
				atk: ivs[1] === '' ? 31 : Number(ivs[1]),
				def: ivs[2] === '' ? 31 : Number(ivs[2]),
				spa: ivs[3] === '' ? 31 : Number(ivs[3]),
				spd: ivs[4] === '' ? 31 : Number(ivs[4]),
				spe: ivs[5] === '' ? 31 : Number(ivs[5])
			};
		}
		i = j + 1;

		// shiny
		j = buf.indexOf('|', i);
		if (i !== j) set.shiny = true;
		i = j + 1;

		// level
		j = buf.indexOf('|', i);
		if (i !== j) set.level = parseInt(buf.substring(i, j), 10);
		i = j + 1;

		// happiness
		j = buf.indexOf(']', i);
		var misc = undefined;
		if (j < 0) {
			if (i < buf.length) misc = buf.substring(i).split(',', 3);
		} else {
			if (i !== j) misc = buf.substring(i, j).split(',', 3);
		}
		if (misc) {
			set.happiness = (misc[0] ? Number(misc[0]) : 255);
			set.hpType = misc[1];
			set.pokeball = misc[2];
		}
		if (j < 0) break;
		i = j + 1;
	}

	return team;
};

Storage.packedTeamNames = function (buf) {
	if (!buf) return [];

	var team = [];
	var i = 0;

	while (true) {
		var name = buf.substring(i, buf.indexOf('|', i));
		i = buf.indexOf('|', i) + 1;
		if (!i) return [];

		team.push(buf.substring(i, buf.indexOf('|', i)) || name);

		for (var k = 0; k < 9; k++) {
			i = buf.indexOf('|', i) + 1;
			if (!i) return [];
		}

		i = buf.indexOf(']', i) + 1;

		if (i < 1) break;
	}

	return team;
};

Storage.packedTeamIcons = function (buf) {
	if (!buf) return '<em>(empty team)</em>';

	return this.packedTeamNames(buf).map(function (species) {
		return '<span class="picon" style="' + Dex.getPokemonIcon(species) + ';float:left;overflow:visible"><span style="font-size:0px">' + toID(species) + '</span></span>';
	}).join('');
};

Storage.getTeamIcons = function (team) {
	if (team.iconCache === '!') {
		// an icon cache of '!' means that not only are the icons not cached,
		// but the packed team isn't guaranteed to be updated to the latest
		// changes from the teambuilder, either.

		// we use Storage.activeSetList instead of reading from
		// app.rooms.teambuilder.curSetList because the teambuilder
		// room may have been closed by the time we need to get
		// a packed team.
		team.team = Storage.packTeam(Storage.activeSetList);
		if ('teambuilder' in app.rooms) {
			return Storage.packedTeamIcons(team.team);
		}
		Storage.activeSetList = null;
		team.iconCache = Storage.packedTeamIcons(team.team);
	} else if (!team.iconCache) {
		team.iconCache = Storage.packedTeamIcons(team.team);
	}
	return team.iconCache;
};

Storage.getPackedTeam = function (team) {
	if (!team) return null;
	if (team.iconCache === '!') {
		// see the same case in Storage.getTeamIcons
		team.team = Storage.packTeam(Storage.activeSetList);
		if (!('teambuilder' in app.rooms)) {
			Storage.activeSetList = null;
			team.iconCache = '';
		}
	}
	if (typeof team.team !== 'string') {
		// should never happen
		team.team = Storage.packTeam(team.team);
	}
	return team.team;
};

Storage.importTeam = function (buffer, teams) {
	var text = buffer.split("\n");
	var team = teams ? null : [];
	var curSet = null;
	if (teams === true) {
		Storage.teams = [];
		teams = Storage.teams;
	} else if (text.length === 1 || (text.length === 2 && !text[1])) {
		return Storage.unpackTeam(text[0]);
	}
	for (var i = 0; i < text.length; i++) {
		var line = $.trim(text[i]);
		if (line === '' || line === '---') {
			curSet = null;
		} else if (line.substr(0, 3) === '===' && teams) {
			team = [];
			line = $.trim(line.substr(3, line.length - 6));
			var format = 'gen7';
			var bracketIndex = line.indexOf(']');
			if (bracketIndex >= 0) {
				format = line.substr(1, bracketIndex - 1);
				if (format && format.slice(0, 3) !== 'gen') format = 'gen6' + format;
				line = $.trim(line.substr(bracketIndex + 1));
			}
			if (teams.length && typeof teams[teams.length - 1].team !== 'string') {
				teams[teams.length - 1].team = Storage.packTeam(teams[teams.length - 1].team);
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
		} else if (line.includes('|')) {
			// packed format
			curSet = null;
			teams.push(Storage.unpackLine(line));
		} else if (!curSet) {
			curSet = {name: '', species: '', gender: ''};
			team.push(curSet);
			var atIndex = line.lastIndexOf(' @ ');
			if (atIndex !== -1) {
				curSet.item = line.substr(atIndex + 3);
				if (toID(curSet.item) === 'noitem') curSet.item = '';
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
				curSet.species = Dex.getSpecies(line.substr(parenIndex + 2)).name;
				line = line.substr(0, parenIndex);
				curSet.name = line;
			} else {
				curSet.species = Dex.getSpecies(line).name;
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
		} else if (line.substr(0, 10) === 'Pokeball: ') {
			line = line.substr(10);
			curSet.pokeball = line;
		} else if (line.substr(0, 14) === 'Hidden Power: ') {
			line = line.substr(14);
			curSet.hpType = line;
		} else if (line.substr(0, 5) === 'EVs: ') {
			line = line.substr(5);
			var evLines = line.split('/');
			curSet.evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			for (var j = 0; j < evLines.length; j++) {
				var evLine = $.trim(evLines[j]);
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
				if (!curSet.ivs && window.TypeChart && window.TypeChart[hptype]) {
					curSet.ivs = {};
					for (var stat in window.TypeChart[hptype].HPivs) {
						curSet.ivs[stat] = window.TypeChart[hptype].HPivs[stat];
					}
				}
			}
			if (line === 'Frustration' && curSet.happiness === undefined) {
				curSet.happiness = 0;
			}
			curSet.moves.push(line);
		}
	}
	if (teams && teams.length && typeof teams[teams.length - 1].team !== 'string') {
		teams[teams.length - 1].team = Storage.packTeam(teams[teams.length - 1].team);
	}
	return team;
};
Storage.exportAllTeams = function () {
	var buf = '';
	for (var i = 0, len = Storage.teams.length; i < len; i++) {
		var team = Storage.teams[i];
		buf += '=== ' + (team.format ? '[' + team.format + '] ' : '') + (team.folder ? '' + team.folder + '/' : '') + team.name + ' ===\n\n';
		buf += Storage.exportTeam(team.team);
		buf += '\n';
	}
	return buf;
};
Storage.exportFolder = function (folder) {
	var buf = '';
	for (var i = 0, len = Storage.teams.length; i < len; i++) {
		var team = Storage.teams[i];
		if (team.folder + "/" === folder || team.format === folder) {
			buf += '=== ' + (team.format ? '[' + team.format + '] ' : '') + (team.folder ? '' + team.folder + '/' : '') + team.name + ' ===\n\n';
			buf += Storage.exportTeam(team.team);
			buf += '\n';
		}
	}
	return buf;
};
Storage.exportTeam = function (team) {
	if (!team) return "";
	if (typeof team === 'string') {
		if (team.indexOf('\n') >= 0) return team;
		team = Storage.unpackTeam(team);
	}
	var text = '';
	for (var i = 0; i < team.length; i++) {
		var curSet = team[i];
		if (curSet.name && curSet.name !== curSet.species) {
			text += '' + curSet.name + ' (' + curSet.species + ')';
		} else {
			text += '' + curSet.species;
		}
		if (curSet.gender === 'M') text += ' (M)';
		if (curSet.gender === 'F') text += ' (F)';
		if (curSet.item) {
			text += ' @ ' + curSet.item;
		}
		text += "  \n";
		if (curSet.ability) {
			text += 'Ability: ' + curSet.ability + "  \n";
		}
		if (curSet.level && curSet.level != 100) {
			text += 'Level: ' + curSet.level + "  \n";
		}
		if (curSet.shiny) {
			text += 'Shiny: Yes  \n';
		}
		if (typeof curSet.happiness === 'number' && curSet.happiness !== 255 && !isNaN(curSet.happiness)) {
			text += 'Happiness: ' + curSet.happiness + "  \n";
		}
		if (curSet.pokeball) {
			text += 'Pokeball: ' + curSet.pokeball + "  \n";
		}
		if (curSet.hpType) {
			text += 'Hidden Power: ' + curSet.hpType + "  \n";
		}
		var first = true;
		if (curSet.evs) {
			for (var j in BattleStatNames) {
				if (!curSet.evs[j]) continue;
				if (first) {
					text += 'EVs: ';
					first = false;
				} else {
					text += ' / ';
				}
				text += '' + curSet.evs[j] + ' ' + BattleStatNames[j];
			}
		}
		if (!first) {
			text += "  \n";
		}
		if (curSet.nature) {
			text += '' + curSet.nature + ' Nature' + "  \n";
		}
		var first = true;
		if (curSet.ivs) {
			var defaultIvs = true;
			var hpType = false;
			for (var j = 0; j < curSet.moves.length; j++) {
				var move = curSet.moves[j];
				if (move.substr(0, 13) === 'Hidden Power ' && move.substr(0, 14) !== 'Hidden Power [') {
					hpType = move.substr(13);
					if (!exports.TypeChart[hpType].HPivs) {
						alert("That is not a valid Hidden Power type.");
						continue;
					}
					for (var stat in BattleStatNames) {
						if ((curSet.ivs[stat] === undefined ? 31 : curSet.ivs[stat]) !== (exports.TypeChart[hpType].HPivs[stat] || 31)) {
							defaultIvs = false;
							break;
						}
					}
				}
			}
			if (defaultIvs && !hpType) {
				for (var stat in BattleStatNames) {
					if (curSet.ivs[stat] !== 31 && curSet.ivs[stat] !== undefined) {
						defaultIvs = false;
						break;
					}
				}
			}
			if (!defaultIvs) {
				for (var stat in BattleStatNames) {
					if (typeof curSet.ivs[stat] === 'undefined' || isNaN(curSet.ivs[stat]) || curSet.ivs[stat] == 31) continue;
					if (first) {
						text += 'IVs: ';
						first = false;
					} else {
						text += ' / ';
					}
					text += '' + curSet.ivs[stat] + ' ' + BattleStatNames[stat];
				}
			}
		}
		if (!first) {
			text += "  \n";
		}
		if (curSet.moves) for (var j = 0; j < curSet.moves.length; j++) {
			var move = curSet.moves[j];
			if (move.substr(0, 13) === 'Hidden Power ') {
				move = move.substr(0, 13) + '[' + move.substr(13) + ']';
			}
			if (move) {
				text += '- ' + move + "  \n";
			}
		}
		text += "\n";
	}
	return text;
};
