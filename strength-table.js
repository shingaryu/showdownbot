// Command-line Arguments
global.program = require('commander');
global.program
.option('--net [action]', "'create' - generate a new network. 'update' - use and modify existing network. 'use' - use, but don't modify network. 'none' - use hardcoded weights. ['none']", 'none')
.option('--algorithm [algorithm]', "Can be 'minimax', 'greedy', or 'random'. ['minimax']", "minimax")
.option('--depth [depth]', "Minimax bot searches to this depth from the current state. [2]", "2")
.option('--nolog', "Don't append to log files.")
.option('--onlyinfo', "Hide debug messages and speed up bot calculations")
.option('--usechildprocess', "Use child process to execute heavy calculations with parent process keeping the connection to showdown server.")
.parse(process.argv);

const fs = require('fs');
const Dex = require('./showdown-sources/.sim-dist/dex').Dex;
const PcmBattle = require('./percymon-battle-engine').PcmBattle;
const BattleRoom = require("./battleroom");
const minimaxbot = require("./bots/minimaxbot");
const cloneBattle = require('./util').cloneBattle;
const importTeam = require('./util').importTeam;
const initLog4js = require('./initLog4js');

// Setup Logging
initLog4js(global.program.nolog, global.program.onlyinfo);
const logger = require('log4js').getLogger("bot");

makeStrengthTable();

function makeStrengthTable() {
  const dirName = 'strength-table';
  const filenames = fs.readdirSync('./' + dirName);

  const targetPokemons = [];
  filenames.forEach(filename => {
    try {
      const rawText = fs.readFileSync(`./${dirName}/${filename}`, "utf8");
      const team = importTeam(rawText); 
      const pokemonSets = Dex.fastUnpackTeam(team);
      if (!pokemonSets) {
        logger.warn(`'${filename}' doesn't contain a valid pokemon expression. We will just ignore this file.`);
      } else if (pokemonSets.length > 1) {
        logger.warn(`'${filename}' seems to have more than one pokemon expression. Subsequent ones are ignored.`);
      } 
      targetPokemons.push(pokemonSets[0]);
    } catch (error) {
      logger.warn(`Failed to import '${filename}'. Is this a text of a target pokemon?`);
    }
  });

  logger.info(targetPokemons.length + ' target pokemons are loaded.');

  const myTeam = [...targetPokemons];
  const oppTeam = [...targetPokemons];
	const customGameFormat = Dex.getFormat(`gen8customgame`, true);
	customGameFormat.ruleset = customGameFormat.ruleset.filter(rule => rule !== 'Team Preview');

	const oneOnOneRepetition = 1;
	logger.info("start evaluating One-On-One strength...")
	const evalValueTable = [];
	myTeam.forEach(myPoke => {
			const evalRecord = [];
			oppTeam.forEach(oppPoke => {
					logger.info(`evaluate about ${myPoke.name} vs ${oppPoke.name}`);
					const repeatedOneOnOneValues = []; 
					for (let i = 0; i < oneOnOneRepetition; i++) {
						const p1 = { name: 'botPlayer', avatar: 1, team: [myPoke] };
						const p2 = { name: 'humanPlayer', avatar: 1, team: [oppPoke] };								
						const battleOptions = { format: customGameFormat, rated: false, send: null, p1, p2 };
						const battle = new PcmBattle(battleOptions);
						battle.start();              
						battle.makeRequest();                   
						const decision = BattleRoom.parseRequest(battle.p1.request);
						const evalValue = minimaxbot.decide(cloneBattle(battle), decision.choices, false, 1, 1).tree.value;
						repeatedOneOnOneValues.push(evalValue);
					}

					const ave = average(repeatedOneOnOneValues);
					const stdD = stdDev(repeatedOneOnOneValues);
					const cv = stdD / Math.abs(ave);

					logger.info(`One-on-one strength: ${ave} (stddev: ${stdD}, C.V.: ${cv})`);
					evalRecord.push(ave);
					});
			evalValueTable.push(evalRecord);
	});

	logger.debug("evaluation value table is below: ");
	let tableHeader = '        ,';
	oppTeam.forEach(oppPoke => {
			tableHeader += oppPoke.name + ',';
	});
	console.log(tableHeader);
	for (let i = 0; i < myTeam.length; i++) {
			let tableRecord = '';
			tableRecord += myTeam[i].name + ',';
			evalValueTable[i].forEach(evalValue => {
					tableRecord += evalValue.toFixed() + ',';
			});
			console.log(tableRecord);
	}
}

function stdDev(values) {
	const ave = average(values);
	const vari = variance(values, ave);
	const stdDev = Math.sqrt(vari);
	return stdDev;
}

function average(values) {
	let sum = 0;
	values.forEach(value => sum += value);
	return sum / values.length;
}

function variance(values, average) {
	let sum = 0;
	values.forEach(value => sum += Math.pow(value - average, 2));
	return sum / values.length;
}
