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
const TeamValidator = require('./showdown-sources/.sim-dist/team-validator').TeamValidator;
const PcmBattle = require('./percymon-battle-engine').PcmBattle;
const BattleRoom = require("./battleroom");
const Minimax = require("./bots/minimaxbot").Minimax;
const cloneBattle = require('./util').cloneBattle;
const importTeam = require('./util').importTeam;
const initLog4js = require('./initLog4js');
const moment = require('moment');

// Setup Logging
initLog4js(global.program.nolog, global.program.onlyinfo);
const logger = require('log4js').getLogger("bot");

const weights = {
  "p1_hp": 1024,
  "p2_hp": -1024,
}

makeStrengthTable(weights, 1, 1, 1);
// makeStrengthTable(weights, 100, 3, 1);

function makeStrengthTable(weights, oneOnOneRepetition, minimaxDepth, minimaxRepetiton = 1) {
  const rootDir = 'strength-table';
  const targetPokemonDir = 'Target Pokemons';
  const teamPokemonDir = 'Team Pokemons';

  const customGameFormat = Dex.getFormat(`gen8customgame`, true);
  customGameFormat.ruleset = customGameFormat.ruleset.filter(rule => rule !== 'Team Preview');
  customGameFormat.forcedLevel = 50;
  const teamValidator = new TeamValidator(customGameFormat);

  const targetPokemons = loadPokemonSetsFromTexts(`./${rootDir}/${targetPokemonDir}`);
  const teamPokemons = loadPokemonSetsFromTexts(`./${rootDir}/${teamPokemonDir}`);
  validatePokemonSets(teamValidator, targetPokemons);
  validatePokemonSets(teamValidator, teamPokemons);

  logger.info(teamPokemons.length + ' team pokemons are loaded.');
  logger.info(targetPokemons.length + ' target pokemons are loaded.');
  const targetsVertical = [...teamPokemons];
  const targetsHorizontal = [...targetPokemons];

  logger.info("start evaluating One-On-One strength...")
  const minimax = new Minimax(false, minimaxRepetiton, false, weights);
  const evalValueTable = [];
  for (let i = 0; i < targetsVertical.length; i++) {
    const myPoke = targetsVertical[i];  
    const evalRecord = [];
    for (let j = 0; j < targetsHorizontal.length; j++) {
      const oppPoke = targetsHorizontal[j];
      logger.info(`evaluate about ${myPoke.name} vs ${oppPoke.name}`);
      const repeatedOneOnOneValues = []; 
      for (let k = 0; k < oneOnOneRepetition; k++) {
        const evalValuesForBothSide = [];
        // to avoid asymmetry about evaluation value for some reasons
        for (let l = 0; l < 2; l++) {
          const p1 = { name: 'botPlayer', avatar: 1, team: l === 0? [myPoke]:[oppPoke] };
          const p2 = { name: 'humanPlayer', avatar: 1, team: l === 0? [oppPoke]:[myPoke] };								
          const battleOptions = { format: customGameFormat, rated: false, send: null, p1, p2 };
          const battle = new PcmBattle(battleOptions);
          battle.start();              
          battle.makeRequest();                   
          const decision = BattleRoom.parseRequest(battle.p1.request);
          const minimaxDecision = minimax.decide(cloneBattle(battle), decision.choices, minimaxDepth);
          try {
            fs.writeFileSync(`./${rootDir}/Decision Logs/(${i})${myPoke.name}-(${j})${oppPoke.name}_${k}_${l}.json`, JSON.stringify(minimaxDecision));
          } catch (e) {
            logger.warn('failed to save decision data!');
            logger.warn(e);
          }

          evalValuesForBothSide.push(minimaxDecision.tree.value);
        }

        const evalValue = (evalValuesForBothSide[0] - evalValuesForBothSide[1]) / 2;
        repeatedOneOnOneValues.push(evalValue);
      }

      const ave = average(repeatedOneOnOneValues);
      const stdD = stdDev(repeatedOneOnOneValues);
      const cv = stdD / Math.abs(ave);

      logger.info(`One-on-one strength: ${ave} (stddev: ${stdD}, C.V.: ${cv})`);
      evalRecord.push(ave);
    };

    evalValueTable.push(evalRecord);
  }

	logger.debug("evaluation value table is below: ");
	let tableHeader = '        ,';
	targetsHorizontal.forEach(oppPoke => {
			tableHeader += oppPoke.name + ',';
	});
	console.log(tableHeader);
	for (let i = 0; i < targetsVertical.length; i++) {
			let tableRecord = '';
			tableRecord += targetsVertical[i].name + ',';
			evalValueTable[i].forEach(evalValue => {
					tableRecord += evalValue.toFixed() + ',';
			});
			console.log(tableRecord);
  }
  
  writeEvalTable(evalValueTable, targetsVertical.map(x => x.name), targetsHorizontal.map(x => x.name),
    `./${rootDir}/Outputs/str_table_${oneOnOneRepetition}_${minimaxDepth}_${minimaxRepetiton}_${moment().format('YYYYMMDDHHmmss')}.csv`);
}

// Read target pokemon sets from team text. If an error occurs, just skip the file and continue.
function loadPokemonSetsFromTexts(directoryPath) {
  const filenames = fs.readdirSync(directoryPath);
  const pokemons = [];

  filenames.forEach(filename => {
    try {
      const rawText = fs.readFileSync(`${directoryPath}/${filename}`, "utf8");
      const pokemonSets = importTeam(rawText); 
      if (!pokemonSets) {
        logger.warn(`'${filename}' doesn't contain a valid pokemon expression. We will just ignore this file.`);
      } else if (pokemonSets.length > 1) {
        logger.warn(`'${filename}' seems to have more than one pokemon expression. Subsequent ones are ignored.`);
      }
      pokemons.push(pokemonSets[0]);
    } catch (error) {
      logger.warn(`Failed to import '${filename}'. Is this a text of a target pokemon?`);
      logger.warn(error);
    }
  });

  return pokemons;
}

// Validate pokemon sets. If the validation failed about one of target pokemons, throw an exception.
function validatePokemonSets(teamValidator, pokemonSets) {
  pokemonSets.forEach(pokemonSet => {
    const setValidationProblems = teamValidator.validateSet(pokemonSet);
    if (setValidationProblems) {
      logger.error(`${setValidationProblems.length} problem(s) is found about ${pokemonSet.name} during the validation.`);
      setValidationProblems.forEach(problem => {
        logger.error(problem);
      })
      throw new Error('Pokemon Set Validation Error');
    }  
  })
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

function writeEvalTable(evalValueTable, rowHeader, columnHeader, filename) {
  let csvText = '';
  columnHeader.forEach(columnName => csvText += ','+ columnName);
  csvText += '\n';

  for (let i = 0; i < evalValueTable.length; i++) {
    const row = evalValueTable[i];
    for (let j = 0; j < row.length; j++) {
      if (j === 0) {
        csvText += rowHeader[i];
      } 
      
      csvText += ',' + row[j].toFixed();
    }

    csvText += '\n';
  }

  fs.writeFileSync(filename, csvText);
}