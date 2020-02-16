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
const Minimax = require("./bots/minimaxbot").Minimax;
const cloneBattle = require('./util').cloneBattle;
const importTeam = require('./util').importTeam;
const initLog4js = require('./initLog4js');
const moment = require('moment');

// Setup Logging
initLog4js(global.program.nolog, global.program.onlyinfo);
const logger = require('log4js').getLogger("bot");

makeStrengthTable(10, 1, 1);

function makeStrengthTable(oneOnOneRepetition, minimaxDepth, minimaxRepetiton = 1) {
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

  const targetsVertical = [...targetPokemons];
  const targetsHorizontal = [...targetPokemons];
	const customGameFormat = Dex.getFormat(`gen8customgame`, true);
	customGameFormat.ruleset = customGameFormat.ruleset.filter(rule => rule !== 'Team Preview');

  logger.info("start evaluating One-On-One strength...")
  const minimax = new Minimax(false, minimaxRepetiton);
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
        const evalValue = minimax.decide(cloneBattle(battle), decision.choices, minimaxDepth).tree.value;
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
    `str_table_${oneOnOneRepetition}_${minimaxDepth}_${minimaxRepetiton}_${moment().format('YYYYMMDDHHmmss')}.csv`);
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