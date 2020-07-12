/**************************************************************************
 * Our local battle simulations need a few adjustments (e.g. storing player's 
 * requests, inserting logging processes) to Pokemon Showdown battle engine.
 * In this purpose we define child classes, like PcmPokemon or PcmBattle here, 
 * and use them instead of original ones.
 * Since implementations of these override functions a bit depend on original sources, 
 * periodically we need update them if there is a big change on originals.
 **************************************************************************/

require('sugar');

const Pokemon = require('./showdown-sources/.sim-dist/pokemon').Pokemon;
const Side = require('./showdown-sources/.sim-dist/side').Side;
const Battle = require('./showdown-sources/.sim-dist/battle').Battle;

// Logging for BattlePokemon
var bpLog4js = require('log4js');
var bpLogger = require('log4js').getLogger("battlepokemon");
// Logging for BattleSide
var bsLog4js = require('log4js');
var bsLogger = require('log4js').getLogger("battleside");
// Logging for Battle
var battleLog4js = require('log4js');
var battleLogger = require('log4js').getLogger("battle");

// Circular, recursive clone
var clone = require("./clone");
var _ = require("underscore");

const Data = require('./showdown-sources/.sim-dist/dex-data');

global.Dex = require('./showdown-sources/.sim-dist/dex').Dex;
global.Config = require('./showdown-sources/config/config');

/**
 * Converts anything to an ID. An ID must have only lowercase alphanumeric
 * characters.
 * If a string is passed, it will be converted to lowercase and
 * non-alphanumeric characters will be stripped.
 * If an object with an ID is passed, its ID will be returned.
 * Otherwise, an empty string will be returned.
 */
global.toId = function (text) {
	if (text && text.id) text = text.id;
	else if (text && text.userid) text = text.userid;

	return string(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
};

/**
 * Validates a username or Pokemon nickname
 */
global.toName = function (name) {
	name = string(name);
	name = name.replace(/[\|\s\[\]\,]+/g, ' ').trim();
	if (name.length > 18) name = name.substr(0, 18).trim();
	return name;
};

/**
 * Safely ensures the passed variable is a string
 * Simply doing '' + str can crash if str.toString crashes or isn't a function
 * If we're expecting a string and being given anything that isn't a string
 * or a number, it's safe to assume it's an error, and return ''
 */
global.string = function (str) {
	if (typeof str === 'string' || typeof str === 'number') return '' + str;
	return '';
};

class PcmPokemon extends Pokemon {
	constructor(set, side) {
    const baseTemplate = Dex.getSpecies(set.species || set.name);
		if (!baseTemplate.exists) {
      side.battle.debug('Unidentified species: ' + Dex.getSpecies(set.species));
      const bulbasaurSet = Dex.getSpecies('Bulbasaur');
      super(bulbasaurSet, side);
    } else {
      super(set, side);
    }

    bpLogger.trace("Created pokemon " + this.toString());
  }
}

class PcmSide extends Side {
  constructor(name, battle, n, team) {
    super(name, battle, n, team);
  }

  emitRequest(update) {
		this.request = update; // Keep track of current request
		super.emitRequest(update);
	}
}

class PcmBattle extends Battle {
	constructor(battleOptions) {
		super(battleOptions)
		if (!battleOptions.send) {
			this.send = this.sendToLogger;
		}
	}

	// for disabling critical hit
	getDamage(
		pokemon, target, move,
		suppressMessages = false
	) {
		if (typeof move === 'string') move = this.dex.getActiveMove(move);

		if (typeof move === 'number') {
			const basePower = move;
			move = new Data.Move({
				basePower,
				type: '???',
				category: 'Physical',
				willCrit: false,
			}) ;
			move.hit = 0;
		}

		if (!move.ignoreImmunity || (move.ignoreImmunity !== true && !move.ignoreImmunity[move.type])) {
			if (!target.runImmunity(move.type, !suppressMessages)) {
				return false;
			}
		}

		if (move.ohko) return target.maxhp;
		if (move.damageCallback) return move.damageCallback.call(this, pokemon, target);
		if (move.damage === 'level') {
			return pokemon.level;
		} else if (move.damage) {
			return move.damage;
		}

		const category = this.getCategory(move);
		const defensiveCategory = move.defensiveCategory || category;

		let basePower = move.basePower;
		if (move.basePowerCallback) {
			basePower = move.basePowerCallback.call(this, pokemon, target, move);
		}
		if (!basePower) return basePower === 0 ? undefined : basePower;
		basePower = this.clampIntRange(basePower, 1);

		let critMult;
		let critRatio = this.runEvent('ModifyCritRatio', pokemon, target, move, move.critRatio || 0);
		if (this.gen <= 5) {
			critRatio = this.clampIntRange(critRatio, 0, 5);
			critMult = [0, 16, 8, 4, 3, 2];
		} else {
			critRatio = this.clampIntRange(critRatio, 0, 4);
			if (this.gen === 6) {
				critMult = [0, 16, 8, 2, 1];
			} else {
				critMult = [0, 24, 8, 2, 1];
			}
		}

		const moveHit = target.getMoveHitData(move);
		/***********************************
		* Modified from original 
		************************************/
		// moveHit.crit = move.willCrit || false;
		moveHit.crit = false; //always make crit false
		/***********************************
		* Up to here
		************************************/
		if (move.willCrit === undefined) {
			if (critRatio) {
				moveHit.crit = this.randomChance(1, critMult[critRatio]);
			}
		}

		if (moveHit.crit) {
			moveHit.crit = this.runEvent('CriticalHit', target, null, move);
		}

		// happens after crit calculation
		basePower = this.runEvent('BasePower', pokemon, target, move, basePower, true);

		if (!basePower) return 0;
		basePower = this.clampIntRange(basePower, 1);

		const level = pokemon.level;

		const attacker = pokemon;
		const defender = target;
		let attackStat = category === 'Physical' ? 'atk' : 'spa';
		const defenseStat = defensiveCategory === 'Physical' ? 'def' : 'spd';
		if (move.useSourceDefensiveAsOffensive) {
			attackStat = defenseStat;
			// Body press really wants to use the def stat,
			// so it switches stats to compensate for Wonder Room.
			// Of course, the game thus miscalculates the boosts...
			if ('wonderroom' in this.field.pseudoWeather) {
				if (attackStat === 'def') {
					attackStat = 'spd';
				} else if (attackStat === 'spd') {
					attackStat = 'def';
				}
				if (attacker.boosts['def'] || attacker.boosts['spd']) {
					this.hint("Body Press uses Sp. Def boosts when Wonder Room is active.");
				}
			}
		}

		const statTable = {atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
		let attack;
		let defense;

		let atkBoosts = move.useTargetOffensive ? defender.boosts[attackStat] : attacker.boosts[attackStat];
		let defBoosts = defender.boosts[defenseStat];

		let ignoreNegativeOffensive = !!move.ignoreNegativeOffensive;
		let ignorePositiveDefensive = !!move.ignorePositiveDefensive;

		if (moveHit.crit) {
			ignoreNegativeOffensive = true;
			ignorePositiveDefensive = true;
		}
		const ignoreOffensive = !!(move.ignoreOffensive || (ignoreNegativeOffensive && atkBoosts < 0));
		const ignoreDefensive = !!(move.ignoreDefensive || (ignorePositiveDefensive && defBoosts > 0));

		if (ignoreOffensive) {
			this.debug('Negating (sp)atk boost/penalty.');
			atkBoosts = 0;
		}
		if (ignoreDefensive) {
			this.debug('Negating (sp)def boost/penalty.');
			defBoosts = 0;
		}

		if (move.useTargetOffensive) {
			attack = defender.calculateStat(attackStat, atkBoosts);
		} else {
			attack = attacker.calculateStat(attackStat, atkBoosts);
		}

		attackStat = (category === 'Physical' ? 'atk' : 'spa');
		defense = defender.calculateStat(defenseStat, defBoosts);

		// Apply Stat Modifiers
		attack = this.runEvent('Modify' + statTable[attackStat], attacker, defender, move, attack);
		defense = this.runEvent('Modify' + statTable[defenseStat], defender, attacker, move, defense);

		if (this.gen <= 4 && ['explosion', 'selfdestruct'].includes(move.id) && defenseStat === 'def') {
			defense = this.clampIntRange(Math.floor(defense / 2), 1);
		}

		const tr = this.trunc;

		// int(int(int(2 * L / 5 + 2) * A * P / D) / 50);
		const baseDamage = tr(tr(tr(tr(2 * level / 5 + 2) * basePower * attack) / defense) / 50);

		// Calculate damage modifiers separately (order differs between generations)
		return this.modifyDamage(baseDamage, pokemon, target, move, suppressMessages);
	}

	// for changing dependency on Side and not calling this.start()
	setPlayer(slot, options) {
		let side;
		let didSomething = true;
		const slotNum = parseInt(slot[1]) - 1;
		if (!this.sides[slotNum]) {
			// create player
			const team = this.getTeam(options);
			side = new PcmSide(options.name || `Player ${slotNum + 1}`, this, slotNum, team);
			if (options.avatar) side.avatar = '' + options.avatar;
			this.sides[slotNum] = side;
		} else {
			// edit player
			side = this.sides[slotNum];
			didSomething = false;
			if (options.name && side.name !== options.name) {
				side.name = options.name;
				didSomething = true;
			}
			if (options.avatar && side.avatar !== '' + options.avatar) {
				side.avatar = '' + options.avatar;
				didSomething = true;
			}
			if (options.team) throw new Error(`Player ${slot} already has a team!`);
		}
		if (options.team && typeof options.team !== 'string') {
			options.team = this.dex.packTeam(options.team);
		}
		if (!didSomething) return;
		this.inputLog.push(`>player ${slot} ` + JSON.stringify(options));
		this.add('player', side.id, side.name, side.avatar, options.rating || '');
		
		// Start the battle if it's ready to start
		// if (this.sides.every(playerSide => !!playerSide) && !this.started) this.start();
	}
 
  go() {
    battleLogger.trace("Implementing the choices that were selected by the players...");
    super.go();
  }

  debug(activity) {
		battleLogger.debug(activity);
  }

	debugError(activity) {
		battleLogger.error(activity);
  }

	sendToLogger(type, data) {
		battleLogger.trace(type + ": " + data);
	}

	toString() {
	    // TODO: Need better toString function to understand battle

	    function formatPokemon(pokemon) {
		var text = "";
		text += pokemon.name + " " + pokemon.hp + "/" + pokemon.maxhp;
                if(pokemon.status) {
                    text += " " + pokemon.status;
                    //debug purposes
                    //text += " duration: " + pokemon.statusData.duration;
                }
                if(pokemon.item)
                    text += " @ " + pokemon.item;
                text += ", L" + (pokemon.level?pokemon.level:'??');
                text += ".  Ability: " + (pokemon.ability?pokemon.ability:'???');
                text += ".  Volatiles: " + JSON.stringify(_.keys(pokemon.volatiles));
		text += "  Boosts: " + JSON.stringify(_.pick(pokemon.boosts, function(value, key, object) {
		    return value != 0;
		}));
                text += "  Stats: " + JSON.stringify(pokemon.baseStoredStats);
                if(pokemon.isActive) {
                    text += ". I'm Active!";
                }
		return text;
	    }

	    function requestType(request) {
		if(request.wait) return "Wait";
		if(request.active) return "Any Move";
		if(request.forceSwitch) return "Force Switch";
		return "Unkown Type";
	    }

	    var data = ''
	    data += 'Turn: ' + this.turn + "\n";
	    data += "\n";

	    data += "Weather: " + (this.field.getWeather().id === "" ? "None" : this.field.getWeather().name) + "\n";
	    data += "PsuedoWeathers: " + JSON.stringify(_.keys(this.pseudoWeather)) + "\n";
	    data += "\n";

	    data += this.p1.name + "\n";
		data += "\tRequest Type: " + requestType(this.p1.request) + "\n";
	    data += "\Active Pokemon: " + formatPokemon(this.p1.active[0]) + "\n";
            data += "\tAll Pokemon:\n";
            for(var i = 0; i < this.p1.pokemon.length; i++) {
                data += "\t\t" + formatPokemon(this.p1.pokemon[i]) + "\n";
            }

	    data += "\tside conditions:" + JSON.stringify(_.keys(this.p1.sideConditions)) + "\n";
	    data += "\n";

	    data += this.p2.name + "\n";
		data += "\tRequest Type: " + requestType(this.p2.request) + "\n";
	    data += "\tactive:" + formatPokemon(this.p2.active[0]) + "\n";
            data += "\tAll Pokemon:\n";
            for(var i = 0; i < this.p2.pokemon.length; i++) {
                data += "\t\t" + formatPokemon(this.p2.pokemon[i]) + "\n";
            }

	    data += "\tside conditions:" + JSON.stringify(_.keys(this.p2.sideConditions)) + "\n";
	    data += "\n";
	    return data;
	}
}

exports.PcmPokemon = PcmPokemon;
exports.PcmSide = PcmSide;
exports.PcmBattle = PcmBattle;
