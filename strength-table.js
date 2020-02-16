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
  const dirName = 'strength-table';
  const filenames = fs.readdirSync('./' + dirName);

  const customGameFormat = Dex.getFormat(`gen8customgame`, true);
  customGameFormat.ruleset = customGameFormat.ruleset.filter(rule => rule !== 'Team Preview');
  customGameFormat.forcedLevel = 50;

  const teamValidator = new TeamValidator(customGameFormat);
  const targetPokemons = [];

  // Read target pokemon sets from team text. If an error occurs, just skip the file and continue.
  filenames.forEach(filename => {
    try {
      const rawText = fs.readFileSync(`./${dirName}/${filename}`, "utf8");
      const pokemonSets = importTeam(rawText); 
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

  // Validate pokemon sets. If the validation failed about one of target pokemons, throw an exception.
  targetPokemons.forEach(targetPokemon => {
    const setValidationProblems = teamValidator.validateSet(targetPokemon);
    if (setValidationProblems) {
      logger.error(`${setValidationProblems.length} problem(s) is found about ${targetPokemon.name} during the validation.`);
      setValidationProblems.forEach(problem => {
        logger.error(problem);
      })
      throw new Error('Pokemon Set Validation Error');
    }  
  })

  logger.info(targetPokemons.length + ' target pokemons are loaded.');
  const targetsVertical = [...targetPokemons];
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
        const p1 = { name: 'botPlayer', avatar: 1, team: [myPoke] };
        const p2 = { name: 'humanPlayer', avatar: 1, team: [oppPoke] };								
        const battleOptions = { format: customGameFormat, rated: false, send: null, p1, p2 };
        const battle = new PcmBattle(battleOptions);
        battle.start();              
        battle.makeRequest();                   
        const decision = BattleRoom.parseRequest(battle.p1.request);
        const minimaxDecision = minimax.decide(cloneBattle(battle), decision.choices, minimaxDepth);
        try {
          fs.writeFileSync(`./${dirName}/Decision Logs/(${i})${myPoke.name}-(${j})${oppPoke.name}_${k}.json`, JSON.stringify(minimaxDecision));
        } catch (e) {
          logger.warn('failed to save decision data!');
          logger.warn(e);
        }

        const evalValue = minimaxDecision.tree.value;
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

  averageDiagonalElements(evalValueTable);

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
    `./${dirName}/Outputs/str_table_${oneOnOneRepetition}_${minimaxDepth}_${minimaxRepetiton}_${moment().format('YYYYMMDDHHmmss')}.csv`);
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

function averageDiagonalElements(evalValueTable) {
  if (evalValueTable.some(row => row.length !== evalValueTable.length)) {
    throw new Error('Table needs to be square');
  }

  for (let i = 0; i < evalValueTable.length; i++) {
    for (let j = i; j < evalValueTable[i].length; j++) {
      if (i === j) {
        evalValueTable[i][j] = 0;
      } else {
        const valueIJ = evalValueTable[i][j];
        const valueJI = evalValueTable[j][i];
        evalValueTable[i][j] = (valueIJ - valueJI) / 2;
        evalValueTable[j][i] = (valueJI - valueIJ) / 2;
      }
    }
  }
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