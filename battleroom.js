// Class libary
JS = require('jsclass');
JS.require('JS.Class');

//does this work? will it show up?

require("sugar");

// Results database
var db = require("./db");

// Logging
var log4js = require('log4js');
var logger = require('log4js').getLogger("battleroom");
var decisionslogger = require('log4js').getLogger("decisions");

//battle-engine
var PcmBattle = require('./percymon-battle-engine').PcmBattle;
var PcmPokemon = require('./percymon-battle-engine').PcmPokemon;

var Abilities = require("./showdown-sources/.data-dist/abilities").BattleAbilities;
var Items = require("./showdown-sources/.data-dist/items").BattleItems;

var _ = require("underscore");

const cloneBattle = require('./util').cloneBattle;

const terrainMoves = new Map();
terrainMoves.set('Electric Terrain', ['Electric Terrain', 'Z-Electric Terrain', 'Max Lightning']);
terrainMoves.set('Grassy Terrain', ['Grassy Terrain', 'Z-Grassy Terrain', 'Max Overgrowth']);
terrainMoves.set('Psychic Terrain', ['Psychic Terrain', 'Z-Psychic Terrain', 'Max Mindstorm']);
terrainMoves.set('Misty Terrain', ['Misty Terrain', 'Z-Misty Terrain', 'Max Starfall']);

const weatherMoves = new Map();
weatherMoves.set('SunnyDay', ['Sunny Day', 'Z-Sunny Day', 'Max Flare']);
weatherMoves.set('RainDance', ['Rain Dance', 'Z-Rain Dance', 'Max Geyser']);
weatherMoves.set('Sandstorm', ['Sandstorm', 'Z-Sandstorm', 'Max Rockfall']);
weatherMoves.set('Hail', ['Hail', 'Z-Hail', 'Max Hailstorm']);

var BattleRoom = new JS.Class({
    initialize: function(id, sendfunc, formatId, team) {
        this.id = id;
        this.title = "Untitled";
        this.send = sendfunc;
        this.formatId = formatId;
        this.team = team;

        setTimeout(function() {
            sendfunc(global.account.message, id); // Notify User that this is a bot
            sendfunc("/timer", id); // Start timer (for user leaving or bot screw ups)
        }, 10000);

        this.decisions = [];
        this.teamPreviewRequest = {}; // my team information
        this.teamPreviewSelection = []; // pokemon indices used in team preview (1 ~ 6)
        this.afterBattleStarted = [() => {}];
        this.log = "";

        let mod = 'gen8'; // latest gen as a default
        if (this.formatId.substring(0, 3) === 'gen') {
            mod = this.formatId.substring(0, 4);
        }
        this.customGameFormat = Dex.getFormat(`${mod}customgame`, true);
        this.customGameFormat.ruleset = this.customGameFormat.ruleset.filter(rule => rule !== 'Team Preview');
        this.dexForFormat = Dex.forFormat(this.customGameFormat);

        this.p1DynamaxUsed = false;
        this.p2DynamaxUsed = false;
    },
    init: function(data) {
        var log = data.split('\n');
        if (data.substr(0, 6) === '|init|') {
            log.shift();
        }
        if (log.length && log[0].substr(0, 7) === '|title|') {
            this.title = log[0].substr(7);
            log.shift();
            logger.info("Title for " + this.id + " is " + this.title);
        }
    },
    startBattle: function() {
        // Default team is automatically filled by 6 Bulbasaur
        // In our local simulation in the future, Bulbasaur means unknown and temporary slot
        let team1 = [];
        const team2 = [];
        for (let i = 0; i < 6; i++) {
            const bulbasaur1 = this.dexForFormat.getSpecies('Bulbasaur');
            bulbasaur1.moves = ['Tackle'];
            bulbasaur1.level = 1;
            team1.push(bulbasaur1);
            const bulbasaur2 = this.dexForFormat.getSpecies('Bulbasaur');
            bulbasaur2.moves = ['Tackle'];
            bulbasaur2.level = 1;
            team2.push(bulbasaur2);
        }

        if (this.team && this.teamPreviewSelection) {
            team1 = [];
            const pokemonSets = this.dexForFormat.fastUnpackTeam(this.team);
            this.teamPreviewSelection.forEach(pokeIndex => {
                team1.push(pokemonSets[pokeIndex - 1]);
            })
        }

        const p1 = { name: 'botPlayer', avatar: 1, team: team1 };
        const p2 = { name: 'humanPlayer', avatar: 1, team: team2 };

        // Construct a battle object that we will modify as our state
        const battleOptions = { format: this.customGameFormat, rated: false, send: null, p1, p2 };
        this.state = new PcmBattle(battleOptions);
        this.state.reportPercentages = true;

        this.previousState = null; // For TD Learning

        this.state.start();
        this.afterBattleStarted.forEach(callback => {
            callback();
        });
        this.afterBattleStarted = [() => {}];
    },
    //given a player and a pokemon, returns the corresponding pokemon object
    getPokemon: function(battleside, pokename) {
        for(var i = 0; i < battleside.pokemon.length; i++) {
            if(battleside.pokemon[i].name === pokename || //for mega pokemon
               battleside.pokemon[i].name.substr(0,pokename.length) === pokename)
                return battleside.pokemon[i];
        }
        return undefined; //otherwise Pokemon does not exist
    },
    //given a player and a pokemon, updates that pokemon in the battleside object
    updatePokemon: function(battleside, pokemon) {
        for(var i = 0; i < battleside.pokemon.length; i++) {
            if(battleside.pokemon[i].name === pokemon.name) {
                battleside.pokemon[i] = pokemon;
                return;
            }
        }
        logger.info("Could not find " + pokemon.name + " in the battle side, creating new Pokemon.");
        for(var i = battleside.pokemon.length - 1; i >= 0; i--) {
            if(battleside.pokemon[i].name === "Bulbasaur") {
                battleside.pokemon[i] = pokemon;
                return;
            }
        }
    },

    //returns true if the player object is us
    isPlayer: function(player) {
        return player === this.side + 'a:' || player === this.side + ':';
    },
    // TODO: Understand more about the opposing pokemon
    updatePokemonOnSwitch: function(tokens) {
        const speciesName = tokens[3].split(', ')[0];
        var level = tokens[3].split(', ')[1].substring(1);
        var tokens4 = tokens[4].split(/\/| /); //for health

        const player = tokens[2].substring(0, tokens[2].indexOf(' '));
        const nickName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var health = tokens4[0];
        var maxHealth = tokens4[1];

        var battleside = undefined;
        let canPlayerDynamax = true;

        if (this.isPlayer(player)) {
            logger.info("Our pokemon has switched! " + tokens[2]);
            battleside = this.state.p1;
            //remove boosts for current pokemon
            this.state.p1.active[0].clearVolatile();
            canPlayerDynamax = !this.p1DynamaxUsed;
        } else {
            logger.info("Opponents pokemon has switched! " + tokens[2]);
            battleside = this.state.p2;
            //remove boosts for current pokemon
            this.state.p2.active[0].clearVolatile();
            canPlayerDynamax = !this.p2DynamaxUsed;
        }
        var pokemon = this.getPokemon(battleside, nickName);

        if(!pokemon) { //pokemon has not been defined yet, so choose Bulbasaur
            //note: this will not quite work if the pokemon is actually Bulbasaur
            pokemon = this.getPokemon(battleside, "Bulbasaur");
            var set = this.state.dex.getSpecies(speciesName);
            set.moves = set.randomBattleMoves;
            //set.moves = _.sample(set.randomBattleMoves, 4); //for efficiency, need to implement move ordering
            set.level = parseInt(level);
            //choose the best ability
            var abilities = Object.values(set.abilities).sort(function(a,b) {
                return this.dexForFormat.getAbility(b).rating - this.dexForFormat.getAbility(a).rating;
            }.bind(this));
            set.ability = abilities[0];
            pokemon = new PcmPokemon(set, battleside);
            pokemon.trueMoves = []; //gradually add moves as they are seen
        }
        //opponent hp is recorded as percentage
        pokemon.hp = Math.ceil(health / maxHealth * pokemon.maxhp);
        pokemon.position = 0;

        battleside.active[0].isActive = false;
        pokemon.isActive = true;
        if (pokemon.canDynamax && !canPlayerDynamax) {
            pokemon.canDynamax = false;
        }
        this.updatePokemon(battleside,pokemon);

        battleside.active = [pokemon];

        //Ensure that active pokemon is in slot zero
        battleside.pokemon = _.sortBy(battleside.pokemon, function(pokemon) { return pokemon == battleside.active[0] ? 0 : 1 });
        for (let i = 0; i < battleside.pokemon.length; i++) {
            battleside.pokemon[i].position = i;
        }
    },
    updatePokemonOnMove: function(tokens) {
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var move = tokens[3];
        const moveId = toId(move);
        const dexMove = this.dexForFormat.getMove(moveId);
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = this.getPokemon(battleside, pokeName);
        if(!pokemon) {
            logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        //update last move (doesn't actually affect the bot...)
        pokemon.lastMove = moveId;

        //if move is protect or detect, update stall counter
        if('stall' in pokemon.volatiles) {
            pokemon.volatiles.stall.counter++;
        }
        //update status duration
        if(pokemon.status) {
            pokemon.statusData.duration = (pokemon.statusData.duration?
                                           pokemon.statusData.duration+1:
                                           1);
        }
        //we are no longer newly switched (so we don't fakeout after the first turn)
        pokemon.activeTurns += 1;

        if(!this.isPlayer(player) && !dexMove.isZ && !dexMove.isMax) { //anticipate more about the Pokemon's moves
            if(pokemon.trueMoves.indexOf(moveId) < 0 && pokemon.trueMoves.length < 4) {
                pokemon.moveSlots.push({
					move: dexMove.name,
					id: dexMove.id,
					pp: ((dexMove.noPPBoosts || dexMove.isZ) ? dexMove.pp : dexMove.pp * 8 / 5),
					maxpp: ((dexMove.noPPBoosts || dexMove.isZ) ? dexMove.pp : dexMove.pp * 8 / 5),
					target: dexMove.target,
					disabled: false,
					disabledSource: '',
					used: true,
                });
                pokemon.trueMoves.push(moveId);
                logger.info("Determined that " + pokeName + " can use " + moveId);
                //if we have collected all of the moves, eliminate all other possibilities
                if(pokemon.trueMoves.length >= 4) {
                    logger.info("Collected all of " + pokeName + "'s moves!");
                    var newMoveset = [];
                    for(var i = 0; i < pokemon.moveSlots.length; i++) {
                        if(pokemon.trueMoves.indexOf(pokemon.moveSlots[i].id) >= 0) {
                            newMoveset.push(pokemon.moveSlots[i]);  //store actual moves
                        }
                    }
                    pokemon.moveSlots = newMoveset;
                }
            }
        }

        this.updatePokemon(battleside, pokemon);

        return { move: move, pokemon: pokemon};
    },
    updatePokemonOnDamage: function(tokens) {
        //extract damage dealt to a particular pokemon
        //also takes into account passives
        //note that opponent health is recorded as percent. Keep this in mind

        var tokens3 = tokens[3].split(/\/| /);
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var health = tokens3[0];
        var maxHealth = tokens3[1];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = this.getPokemon(battleside, pokeName);
        if(!pokemon) {
            logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        let isFainted = (health === 0 || maxHealth === 'fnt'); // If fainted, maxHealth is not a number

        //update hp
        pokemon.hp = isFainted ? 0 : Math.ceil(health / maxHealth * pokemon.maxhp);
        this.updatePokemon(battleside, pokemon);

    },
    updatePokemonOnBoost: function(tokens, isBoost) {
        var stat = tokens[3];
        var boostCount = parseInt(tokens[4]);
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = this.getPokemon(battleside, pokeName);
        if(!pokemon) {
            logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        if(isBoost) {
            if(stat in pokemon.boosts)
                pokemon.boosts[stat] += boostCount;
            else
                pokemon.boosts[stat] = boostCount;
        } else {
            if(stat in pokemon.boosts)
                pokemon.boosts[stat] -= boostCount;
            else
                pokemon.boosts[stat] = -boostCount;
        }
        this.updatePokemon(battleside, pokemon);
    },
    updatePokemonSetBoost: function(tokens) {
        var stat = tokens[3];
        var boostCount = parseInt(tokens[4]);
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = this.getPokemon(battleside, pokeName);
        if(!pokemon) {
            logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        pokemon.boosts[stat] = boostCount;
        this.updatePokemon(battleside, pokemon);
    },
    updatePokemonRestoreBoost: function(tokens) {
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = this.getPokemon(battleside, pokeName);
        if(!pokemon) {
            logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        for(var stat in pokemon.boosts) {
            if(pokemon.boosts[stat] < 0)
                delete pokemon.boosts[stat];
        }
        this.updatePokemon(battleside, pokemon);


    },
    updatePokemonStart: function(tokens, newStatus) {
        //add condition such as leech seed, substitute, ability, confusion, encore
        //move: yawn, etc.
        //ability: flash fire, etc.

        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var status = tokens[3];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = this.getPokemon(battleside, pokeName);

        if(status.substring(0,4) === 'move') {
            status = status.substring(6);
        } else if(status.substring(0,7) === 'ability') {
            status = status.substring(9);
        }

        if(newStatus) {
            pokemon.addVolatile(status);
            if (status === 'Dynamax') {
                battleside.pokemon.forEach(poke => poke.canDynamax = false);
                if (this.isPlayer(player)) {
                    this.p1DynamaxUsed = true;
                } else {
                    this.p2DynamaxUsed = true;
                }
            }
        } else {
            pokemon.removeVolatile(status);
        }
        this.updatePokemon(battleside, pokemon);
    },
    updateField: function(tokens, newField, pokesUsedMoves) {
        var fieldStatus = tokens[2].substring(6);

        // terrain or pseudoweather
        let isTerrain = false;
        for (let key of terrainMoves.keys()) {
            if (fieldStatus.indexOf(key) >= 0) {
                isTerrain = true;
                break;
            }
        }

        let source = null;
        if (this.isUpkeepMessage(tokens)) {
            return;
        }
        if (!source) {
            source = this.getSourcePokemonFromOf(tokens);
        }
        if (!source && !isTerrain) {
            source = this.getSourcePokemonFromMoveName(fieldStatus, pokesUsedMoves);
        }
        if (!source && isTerrain) {
            source = this.getSourcePokemonFromTerrainMoves(fieldStatus, pokesUsedMoves)
        }

        if (isTerrain) {
            if (newField) {
                this.state.field.setTerrain(fieldStatus, source);
            } else {
                this.state.field.clearTerrain();
            }
        } else {
            if(newField) {
                this.state.field.addPseudoWeather(fieldStatus, source);
            } else {
                this.state.field.removePseudoWeather(fieldStatus);
            }    
        }
    },
    isUpkeepMessage(tokens) {
        return tokens.length > 3 && tokens[3].indexOf('[upkeep]') >= 0;
    },
    getSourcePokemonFromOf(tokens) {
        let pokeName = '';
        let source = null;
        tokens.forEach(token => {
            if (token.indexOf('[of]') >= 0) {
                pokeName = token.slice(token.lastIndexOf(':') + 2);
            }
        })

        this.state.p1.pokemon.forEach(poke => {
            if (poke.name === pokeName || poke.species === pokeName) {
                source = poke;
            }
        });
        this.state.p2.pokemon.forEach(poke => {
            if (poke.name === pokeName || poke.species === pokeName) {
                source = poke;
            }
        });
        
        return source;
    },
    getSourcePokemonFromMoveName(fieldStatus, pokesUsedMoves) {
        let source = null;

        if(fieldStatus.substring(0,4) === "move") {
            fieldStatus = tokens[3].substring(6);
        }
        const poke = pokesUsedMoves.get(fieldStatus);
        if (poke) {
            source = poke;
        }

        return source;
    },
    getSourcePokemonFromTerrainMoves(fieldStatus, pokesUsedMoves) {
        let terrain = null
        for (let key of terrainMoves.keys()) {
            if (fieldStatus.indexOf(key) >= 0) {
                terrain = key;
            }
        }

        let moves = terrainMoves.get(terrain);
        if (!moves) {
            return null;
        }

        let source = null;
        for (var [key, value] of pokesUsedMoves) {
            if (moves.some(move => move.indexOf(key) >= 0)) {
                source = value;
                break;
            }
        }

        return source;
    },
    getSourcePokemonFromWeatherMoves(fieldStatus, pokesUsedMoves) {
        let weather = null
        for (let key of weatherMoves.keys()) {
            if (fieldStatus.indexOf(key) >= 0) {
                weather = key;
            }
        }

        let moves = weatherMoves.get(weather);
        if (!moves) {
            return null;
        }

        let source = null;
        for (var [key, value] of pokesUsedMoves) {
            if (moves.some(move => move.indexOf(key) >= 0)) {
                source = value;
                break;
            }
        }

        return source;
    },
    updateWeather: function(tokens, pokesUsedMoves) {
        var weather = tokens[2];
        if(weather === "none") {
            this.state.field.clearWeather();
        } else {
            let source = null;

            if (this.isUpkeepMessage(tokens)) {
                return;
            }
            if (!source) {
                source = this.getSourcePokemonFromOf(tokens);
            }
            if (!source) {
                source = this.getSourcePokemonFromWeatherMoves(weather, pokesUsedMoves)
            }

            this.state.field.setWeather(weather, source);
            //we might want to keep track of how long the weather has been lasting...
            //might be done automatically for us
        }
    },
    updateSideCondition: function(tokens, newSide, pokesUsedMoves) {
        var player = tokens[2].split(' ')[0];
        var sideStatus = tokens[3]; // move: {movename} or {movename}
        let source = null;
        if(sideStatus.substring(0,4) === "move") {
            sideStatus = tokens[3].substring(6);
        }

        source = this.getSourcePokemonFromMoveName(sideStatus, pokesUsedMoves);

        var battleside = undefined;
        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        if(newSide) {
            battleside.addSideCondition(sideStatus, source);
            //Note: can have multiple layers of toxic spikes or spikes
        } else {
            battleside.removeSideCondition(sideStatus, source);
            //remove side status
        }
    },
    updatePokemonStatus: function(tokens, newStatus) {
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var status = tokens[3];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        var pokemon = this.getPokemon(battleside, pokeName);

        if(newStatus) {
            pokemon.setStatus(status);
            //record a new Pokemon's status
            //also keep track of how long the status has been going? relevant for toxic poison
            //actually, might be done by default
        } else {
            pokemon.clearStatus();
            //heal a Pokemon's status
        }
        this.updatePokemon(battleside, pokemon);
    },
    updatePokemonOnItem: function(tokens, newItem) {
        //record that a pokemon has an item. Most relevant if a Pokemon has an air balloon/chesto berry
        //TODO: try to predict the opponent's current item

        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var item = tokens[3];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        var pokemon = this.getPokemon(battleside, pokeName);

        if(newItem) {
            pokemon.setItem(item);
        } else {
            pokemon.clearItem(item);
        }
        this.updatePokemon(battleside, pokemon);
    },

    //Apply mega evolution effects, or aegislash/meloetta
    updatePokemonOnFormeChange: function(tokens) {
        var tokens3 = tokens[3].split(', ');
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var newPokeName = tokens3[0];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        logger.info(pokeName + " has transformed into " + newPokeName + "!");
        var pokemon = this.getPokemon(battleside, pokeName, true);
        const isMegaEvo = newPokeName.indexOf('-Mega') > 0;
        if (isMegaEvo) {
            logger.info('This is Mega evolution!');
        }

        //apply forme change
        if (isMegaEvo) {
            pokemon.canMegaEvo = newPokeName; // because updateSide() deleted this flag
            this.state.runMegaEvo(pokemon);
        } else {
            pokemon.formeChange(newPokeName);
        }

        this.updatePokemon(battleside, pokemon);
    },
    //for ditto exclusively
    updatePokemonOnTransform: function(tokens) {
        var tokens3 = tokens[3].split(' ');
        var player = tokens[2].substring(0, tokens[2].indexOf(' '));
        var pokeName = tokens[2].substring(tokens[2].indexOf(' ') + 1);
        var newPokeName = tokens3[1];
        var battleside = undefined;
        var pokemon = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
            pokemon = this.getPokemon(battleside, pokeName);
            pokemon.transformInto(this.state.p2.active[0]);
        } else {
            battleside = this.state.p2;
            pokemon = this.getPokemon(battleside, pokeName);
            pokemon.transformInto(this.state.p1.active[0]);
        }
        this.updatePokemon(battleside, pokemon);

    },
    recieve: function(data) {
        try {
            if (!data) return;

            logger.trace("<< " + data);
    
            if (data.substr(0, 6) === '|init|') {
                return this.init(data);
            }
            if (data.substr(0, 9) === '|request|') {
                return this.receiveRequest(JSON.parse(data.substr(9) || "null" ));
            }
    
            var log = data.split('\n');
            const teamPreviewPokes = [];
            const pokesUsedMoves = new Map();
            for (var i = 0; i < log.length; i++) {
                this.log += log[i] + "\n";
    
                var tokens = log[i].split('|');
                if (tokens.length > 1) {
    
                    if (tokens[1] === 'tier') {
                        this.tier = tokens[2];
                    } else if (tokens[1] === 'win') {
                        this.send("gg", this.id);
    
                        this.winner = tokens[2];
                        if (this.winner == global.account.username) {
                            logger.info(this.title + ": I won this game");
                        } else {
                            logger.info(this.title + ": I lost this game");
                        }
    
                        if(program.net === "update" && this.previousState) {
                            var playerAlive = _.any(this.state.p1.pokemon, function(pokemon) { return pokemon.hp > 0; });
                            var opponentAlive = _.any(this.state.p2.pokemon, function(pokemon) { return pokemon.hp > 0; });
    
                            if(!playerAlive || !opponentAlive) minimaxbot.train_net(this.previousState, null, (this.winner == global.account.username));
                        }
    
                        if(!program.nosave) this.saveResult();
    
                        // Leave in two seconds
                        var battleroom = this;
                        setTimeout(function() {
                            battleroom.send("/leave " + battleroom.id);
                        }, 2000);
    
                    } else if (tokens[1] === 'poke') {
                        // information for teampreview
                        // store data for 'teampreview' message in following lines
                        const poke = {
                            side: tokens[2],
                            details: tokens[3],
                            hasItem: tokens.length === 5 && tokens[4] === 'item'
                        };
                        teamPreviewPokes.push(poke);
                    } else if (tokens[1] ==='teampreview') {
                        const maxTeamSize = tokens[2];
                        this.teamPreviewSelection = this.chooseTeamPokes(teamPreviewPokes, maxTeamSize);
                    } else if (tokens[1] ==='start') {
                        this.startBattle();
                    } else if (tokens[1] === 'switch' || tokens[1] === 'drag') {
                        this.updatePokemonOnSwitch(tokens);
                    } else if (tokens[1] === 'move') {
                        const moveAndPoke = this.updatePokemonOnMove(tokens);
                        pokesUsedMoves.set(moveAndPoke.move, moveAndPoke.pokemon);
                    } else if(tokens[1] === 'faint') { //we could outright remove a pokemon...
                        //record that pokemon has fainted
                    } else if(tokens[1] === 'detailschange' || tokens[1] === 'formechange') {
                        this.updatePokemonOnFormeChange(tokens);
                    } else if(tokens[1] === '-transform') {
                        this.updatePokemonOnTransform(tokens);
                    } else if(tokens[1] === '-damage') { //Error: not getting to here...
                        this.updatePokemonOnDamage(tokens);
                    } else if(tokens[1] === '-heal') {
                        this.updatePokemonOnDamage(tokens);
                    } else if(tokens[1] === '-boost') {
                        this.updatePokemonOnBoost(tokens, true);
                    } else if(tokens[1] === '-unboost') {
                        this.updatePokemonOnBoost(tokens, false);
                    } else if(tokens[1] === '-setboost') {
                        this.updatePokemonSetBoost(tokens);
                    } else if(tokens[1] === '-restoreboost') {
                        this.updatePokemonRestoreBoost(tokens);
                    } else if(tokens[1] === '-start') {
                        this.updatePokemonStart(tokens, true);
                    } else if(tokens[1] === '-end') {
                        this.updatePokemonStart(tokens, false);
                    } else if(tokens[1] === '-fieldstart') {
                        this.updateField(tokens, true, pokesUsedMoves);
                    } else if(tokens[1] === '-fieldend') {
                        this.updateField(tokens, false, pokesUsedMoves);
                    } else if(tokens[1] === '-weather') {
                        this.updateWeather(tokens, pokesUsedMoves);
                    } else if(tokens[1] === '-sidestart') {
                        this.updateSideCondition(tokens, true, pokesUsedMoves);
                    } else if(tokens[1] === '-sideend') {
                        this.updateSideCondition(tokens, false, pokesUsedMoves);
                    } else if(tokens[1] === '-status') {
                        this.updatePokemonStatus(tokens, true);
                    } else if(tokens[1] === '-curestatus') {
                        this.updatePokemonStatus(tokens, false);
                    } else if(tokens[1] === '-item') {
                        this.updatePokemonOnItem(tokens, true);
                    } else if(tokens[1] === '-enditem') {
                        this.updatePokemonOnItem(tokens, false);
                    } else if(tokens[1] === '-ability') {
                        //relatively situational -- important for mold breaker/teravolt, etc.
                        //needs to be recorded so that we don't accidentally lose a pokemon
    
                        //We don't actually care about the rest of these effects, as they are merely visual
                    } else if(tokens[1] === '-supereffective') {
    
                    } else if(tokens[1] === '-crit') {
    
                    } else if(tokens[1] === '-singleturn') { //for protect. But we only care about damage...
    
                    } else if(tokens[1] === 'c') {//chat message. ignore. (or should we?)
    
                    } else if(tokens[1] === '-activate') { //protect, wonder guard, etc.
    
                    } else if(tokens[1] === '-fail') {
    
                    } else if(tokens[1] === '-immune') {
    
                    } else if(tokens[1] === 'message') {
    
                    } else if(tokens[1] === 'cant') {
    
                    } else if(tokens[1] === 'leave') {
    
                    } else if(tokens[1]) { //what if token is defined
                        logger.info("Error: could not parse token '" + tokens[1] + "'. This needs to be implemented");
                    }
                }
            }    
        } catch (error) {
            logger.error(error);
            logger.error("Something happened in BattleRoom. We will leave the game.");
            this.send("/forfeit", this.id);
        }
    },
    saveResult: function() {
        // Save game data to data base
        game = {
            "title": this.title,
            "id": this.id,
            "win": (this.winner == global.account.username),
            "date": new Date(),
            "decisions": "[]", //JSON.stringify(this.decisions),
            "log": this.log,
            "tier": this.tier
        };
        db.insert(game, function(err, newDoc) {
	    if(newDoc) logger.info("Saved result of " + newDoc.title + " to database.");
	    else logger.error("Error saving result to database.");
        });
    },
    receiveRequest: function(request) {
        if (!request) {
            this.side = '';
            return;
        }

        if (request.teamPreview === true) {
            this.teamPreviewRequest = request;
            // team pokemon choice will be done with following messages
        } else {
            // on starting a battle, the first request is arrived former than |start| message
            if (!this.state) {
                this.afterBattleStarted.push(() => this.receiveRequest(request));
                return;
            }

            if (request.side) this.updateSide(request.side, true);
    
            if (request.active) logger.info(this.title + ": I need to make a move.");
            if (request.forceSwitch) logger.info(this.title + ": I need to make a switch.");
    
            if (request.active || request.forceSwitch) this.makeMove(request);
        }
    },

    //note: we should not be recreating pokemon each time
    //is this redundant?
    updateSide: function(sideData) {
        if (!sideData || !sideData.id) return;
        logger.info("Starting to update my side data.");
        // only for random team
        if (!this.team) {
            for (var i = 0; i < sideData.pokemon.length; ++i) {
                var pokemon = sideData.pokemon[i];
    
                var details = pokemon.details.split(",");
                var name = details[0].trim();
                var level = parseInt(details[1].trim().substring(1));
                var gender = details[2] ? details[2].trim() : null;
    
                var templateFromSideData = {
                    name: name,
                    moves: pokemon.moves,
                    ability: Abilities[pokemon.baseAbility].name,
                    evs: {
                        hp: 85,
                        atk: 85,
                        def: 85,
                        spa: 85,
                        spd: 85,
                        spe: 85
                    },
                    ivs: {
                        hp: 31,
                        atk: 31,
                        def: 31,
                        spa: 31,
                        spd: 31,
                        spe: 31
                    },
                    item: (!pokemon.item || pokemon.item === '') ? '' : Items[pokemon.item].name,
                    level: level,
                    active: pokemon.active,
                    shiny: false
                };
    
                let template = this.state.dex.getSpecies(name);               
                Object.assign(template, templateFromSideData);
                
                //keep track of old pokemon
                var oldPokemon = this.state.p1.pokemon[i];
    
                // Initialize pokemon
                this.state.p1.pokemon[i] = new PcmPokemon(template, this.state.p1);
                this.state.p1.pokemon[i].position = i;
    
                // Update the pokemon object with latest stats
                for (var stat in pokemon.stats) {
                    this.state.p1.pokemon[i].baseStoredStats[stat] = pokemon.stats[stat];
                }
                // Update health/status effects, if any
                var condition = pokemon.condition.split(/\/| /);
                this.state.p1.pokemon[i].hp = parseInt(condition[0]);
                if(condition.length > 2) {//add status condition
                    this.state.p1.pokemon[i].setStatus(condition[2]); //necessary
                }
                if(oldPokemon.isActive && oldPokemon.statusData) { //keep old duration
                    pokemon.statusData = oldPokemon.statusData;
                }
    
                // Keep old boosts
                this.state.p1.pokemon[i].boosts = oldPokemon.boosts;
    
                // Keep old volatiles
                this.state.p1.pokemon[i].volatiles = oldPokemon.volatiles;
    
                if (pokemon.active) {
                    this.state.p1.active = [this.state.p1.pokemon[i]];
                    this.state.p1.pokemon[i].isActive = true;
                }
    
                // TODO(rameshvarun): Somehow parse / load in current hp and status conditions
            }
        } 

        // Set canMegaEvo flag manually
        const hasAlreadyMegaEvo = this.state.p1.pokemon.some(poke => poke.species.indexOf("-Mega") > 0);
        if (hasAlreadyMegaEvo) {
            this.state.p1.pokemon.forEach(poke => poke.canMegaEvo = false);
        }

        // Enforce that the active pokemon is in the first slot
        this.state.p1.pokemon = _.sortBy(this.state.p1.pokemon, function(pokemon) { return pokemon.isActive ? 0 : 1 });

        this.side = sideData.id;
        this.oppSide = (this.side === "p1") ? "p2" : "p1";
        logger.info(this.title + ": My current side is " + this.side);
    },
    chooseTeamPokes: function(pokes, maxTeamSize) {
        logger.info("Choose team pokemons...");
        // temporary random selection
        // in the future, use some algorithms to decide which combination is strongest to oppenents
        let teamOrderNums = [1, 2, 3, 4, 5, 6];
        for(let i = teamOrderNums.length - 1; i > 0; i--){
            const r = Math.floor(Math.random() * (i + 1));
            const tmp = teamOrderNums[i];
            teamOrderNums[i] = teamOrderNums[r];
            teamOrderNums[r] = tmp;
        }

        this.send("/team " + teamOrderNums.join('') + '|' + this.teamPreviewRequest.rqid, this.id);
        return teamOrderNums.slice(0, maxTeamSize);
    },
    makeMove: function(request) {
        var room = this;

        setTimeout(function() {
            // The state of the battle was modified everywhere in previous processes, so at this time we update the request objects again 
            room.state.makeRequest()       
           
            if(program.net === "update") {
                if(room.previousState != null) minimaxbot.train_net(room.previousState, room.state);
                room.previousState = cloneBattle(room.state);
            }

            var decision = BattleRoom.parseRequest(request);
           
            // Use specified algorithm to determine resulting choice
            var result = undefined;
            if(decision.choices.length == 1) result = decision.choices[0];
            else if(program.algorithm === "minimax") {
                const minimax = new Minimax(true, 1); 
                result = minimax.decide(cloneBattle(room.state), decision.choices, program.depth);
            } 
            else if(program.algorithm === "greedy") result = greedybot.decide(cloneBattle(room.state), decision.choices);
            else if(program.algorithm === "random") result = randombot.decide(cloneBattle(room.state), decision.choices);

            room.decisions.push(result);
            room.send("/choose " + BattleRoom.toChoiceString(result, room.state.p1) + "|" + decision.rqid, room.id);
        }, 5000);
    },
    // Static class methods
    extend: {
        toChoiceString: function(choice, battleside) {
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
        },
        parseRequest: function(request) {
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
    }
});
module.exports = BattleRoom;

var minimaxbot = require("./bots/minimaxbot");
const Minimax = minimaxbot.Minimax;
var greedybot = require("./bots/greedybot");
var randombot = require("./bots/randombot");
