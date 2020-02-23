const fs = require('fs');

const filename = 'strength-table.csv';
const strategiesFilename = 'strategies.csv';
const usageFilename = 'usage.csv';


const loadStrTableResult = loadStrengthTable(`combination-calculator/${filename}`);
const strengthRows = loadStrTableResult.strengthRows;
const columns = loadStrTableResult.columns;
console.log(`strength table is successfully loaded`);
loadStrategyInfoToStrTable(`./combination-calculator/${strategiesFilename}`, strengthRows);
console.log(`strategy information is successfully loaded`);
loadUsageInfo(`./combination-calculator/${usageFilename}`, columns, strengthRows)

constructTeamByIngenMethod(strengthRows, 24);

function loadStrengthTable(filepath) {
  let tableText = fs.readFileSync(filepath, 'utf8');
  tableText = tableText.replace('\r\n', '\n');
  let tableRows = tableText.split('\n');
    
  const columns = tableRows[0].split(',').slice(1).filter(x => !isEmptyString(x));
  console.log(`${columns.length} columns exist`);
  
  let strengthRows = []; 
  let index = 0;
  tableRows.slice(1).forEach(row => {
    if (!row) {
      return;
    }
  
    if (row.split(',').every(x => isEmptyString(x))) {
      return;
    }
    const records = row.split(',');
    const strengthRow = {};
    strengthRow['index'] = index++;
    strengthRow['name'] = records[0].trim();
    const values = records.slice(1).filter(x => !isEmptyString(x));
    if (columns.length !== values.length) {
      throw new Error('error: the number of column is not same among all rows');
    }
    strengthRow['originalVector'] = values.map(v => parseFloat(v.trim()));
    strengthRow['vector'] = values.map(v => parseFloat(v.trim()));
    
    strengthRows.push(strengthRow);
  });

  console.log(`${strengthRows.length} rows are loaded`);

  return { columns, strengthRows};
}

// load strategy info from text and add params to strength table
function loadStrategyInfoToStrTable(filepath, strengthRows) {
  let strategiesText = fs.readFileSync(filepath, 'utf8');
  strategiesText = strategiesText.replace('\r\n', '\n');
  const strategiesRows = strategiesText.split('\n');

  strategiesRows.slice(1).forEach(strategiesRow => {
    if (strategiesRow.split(',').every(x => isEmptyString(x))) {
      return;
    }

    const records = strategiesRow.split(',');
    if (records.length < 3) {
      throw new Error('error: invalid strategies records');
    }

    const index = parseInt(records[0].trim());
    const name = records[1].trim();
    const type = records[2].trim();
    const hasBoost = (records.length > 3 && records[3].trim() === 'Yes');

    if (index > strengthRows.length - 1) {
      throw new Error(`error: index ${index} is out of range of strength table`);
    }

    const row = strengthRows[index];

    if (row.name !== name) {
      throw new Error(`error: species name ${name} is not match with the row [${index}] of the strength table`);
    }

    const validStrategiesType = [
      'Sweeper', 'Tank', 'Wall', 'Support'
    ];
    
    if (validStrategiesType.indexOf(type) < 0) {
      throw new Error(`error: invalid strategy type ${type}`);
    }

    row['strategyType'] = type;
    row['hasBoost'] = hasBoost;
  });

  if (!strengthRows.find(x => x.hasBoost)) {
    throw new Error('error: no boost attacker is found');
  }

  strengthRows.forEach(x => {
    if (!x.strategyType) {
      throw new Error(`error: strategy type of pokemon ${x.name} is not set`);
    }
  });
}

function loadUsageInfo(filepath, columns, strengthRows) {
  let usageText = fs.readFileSync(filepath, 'utf8');
  usageText = usageText.replace('\r\n', '\n');

  const usageRows = usageText.split('\n');
  const usageInfo = [];
  const usageMap = new Map();
  usageRows.slice(1).forEach(row => {
    if (!row) {
      return;
    }
  
    if (row.split(',').every(x => isEmptyString(x))) {
      return;
    }
  
    const records = row.split(',');
    if (records.length < 2) {
      throw new Error('error: invalid usage records');
    }
  
    const name = records[0].trim();
    const usage = parseFloat(records[1].trim());
    usageMap.set(name, usage);
  
    usageInfo.push({name, usage});
  });
  
  const usageBaseRatio = [];
  for (let i = 0; i < columns.length; i++) {
    if (usageMap.get(columns[i]) === undefined) {
      throw new Error(`error: usage information for pokemon ${columns[i]} is not found`);
    }

    const duplicateCounts = columns.filter(x => x === columns[i]).length;
    usageBaseRatio[i] = usageMap.get(columns[i]) / duplicateCounts;
  }

  strengthRows.forEach(row => {
    for (let i = 0; i < columns.length; i++) {
      row.vector[i] *= (usageBaseRatio[i] / 100);
    }
  })
}

function constructTeamByIngenMethod(strengthRows, firstPokemonIndex) {
  // (1) select the first pokemon
  const firstPoke = strengthRows[firstPokemonIndex];
  console.log(`firstPoke: ${firstPoke.name}\n`);
  strengthRows = strengthRows.filter(x => x.index != firstPoke.index);
  const compatibleStrTypes = compatibleTypes(firstPoke.strategyType);

  // (2) search the second pokemon which complements the first pokemon
  const resultStep2 = searchMinimumRow(firstPoke.vector, 
    filterStrengthRows(compatibleStrTypes, strengthRows), (v1, v2) => cosineSimilarity(v1, v2));
  const secondPoke = resultStep2.row;
  console.log(`secondPoke: ${secondPoke.name}\n`);
  strengthRows = strengthRows.filter(x => x.index != secondPoke.index);

  // (3)(4) search the third and fourth pokemon which cover weak slots of the first and second
  const vectorFirstAndSecond = addVector(firstPoke.vector, secondPoke.vector);
  console.log(JSON.stringify(vectorFirstAndSecond))
  let maximumValueStep34 = Number.MIN_SAFE_INTEGER;
  let thirdPoke = null;
  let fourthPoke = null;
  const filteredStrRows34 = filterStrengthRows(compatibleStrTypes, strengthRows);
  // temporary search all combinations
  for (let i = 0; i < filteredStrRows34.length; i++) {
    for (let j = i + 1; j < filteredStrRows34.length; j++) {
      const cropedV1 = [];
      const cropedV2 = [];
      for (let k = 0; k < vectorFirstAndSecond.length; k++) {
        if (vectorFirstAndSecond[k] < 0) {
          cropedV1.push(filteredStrRows34[i].vector[k]);
          cropedV2.push(filteredStrRows34[j].vector[k]);
        }
      }

      const combinedVector = addVector(cropedV1, cropedV2);
      const cos = cosineSimilarity(cropedV1, cropedV2);
      const absSin = Math.sqrt(1 - cos * cos);
      const product = dotProduct(combinedVector, combinedVector.map(x => 1.0));
      const value = product * absSin;

      console.log(`${filteredStrRows34[i].name} + ${filteredStrRows34[j].name}: ${value}(${product} * ${absSin})`);
      if (value > maximumValueStep34) {
        maximumValueStep34 = value;
        thirdPoke = filteredStrRows34[i];
        fourthPoke = filteredStrRows34[j];
      }
    }
  }

  console.log(`thirdPoke: ${thirdPoke.name}`);
  console.log(`fourthPoke: ${fourthPoke.name}\n`);
  strengthRows = strengthRows.filter(x => x.index != thirdPoke.index);
  strengthRows = strengthRows.filter(x => x.index != fourthPoke.index);


  // (5) search fifth boost attacker pokemon which leverages weak slots of above 4 pokemons
  const vector4Pokemons = addVectors(firstPoke.vector, secondPoke.vector, thirdPoke.vector, fourthPoke.vector);
  console.log(JSON.stringify(vector4Pokemons))
  let maximumValueStep5 = Number.MIN_SAFE_INTEGER;
  const filteredStrRows5 = strengthRows.filter(x => x.hasBoost);
  let fifthPoke = null;
  for (let i = 0; i < filteredStrRows5.length; i++) {
    const cropedV1 = [];
    for (let j = 0; j < vector4Pokemons.length; j++) {
      if (vector4Pokemons[j] < 0) {
        cropedV1.push(filteredStrRows5[i].vector[j]);
      }
    }

    const product = dotProduct(cropedV1, cropedV1.map(x => 1.0));
    const value = product;

    console.log(`${filteredStrRows5[i].name}: ${value}`);
    if (value > maximumValueStep5) {
      maximumValueStep5 = value;
      fifthPoke = filteredStrRows5[i];
    }
  }

  console.log(`fifthPoke: ${fifthPoke.name}\n`);
  strengthRows = strengthRows.filter(x => x.index != fifthPoke.index);

  // (6) search sixth pokemon which covers the weakest pokemon of 5
  const vector5Pokemons = addVectors(firstPoke.vector, secondPoke.vector, thirdPoke.vector, fourthPoke.vector, fifthPoke.vector);
  console.log(JSON.stringify(vector5Pokemons))
  let weakestSlot = -1;
  let weakestValue = Number.MAX_VALUE;
  for (let i = 0; i < vector5Pokemons.length; i++) {
    const value = vector5Pokemons[i];
    if (value < weakestValue) {
      weakestValue = value;
      weakestSlot = i;
    }
  }

  console.log(`weakest slot is ${weakestSlot}(${columns[weakestSlot]}): ${weakestValue}`);

  const resultStep6 = searchMaximumRow(null, strengthRows, (v1, v2) => v2[weakestSlot]);
  const sixthPoke = resultStep6.row;
  console.log(`sixthPoke: ${sixthPoke.name}\n`);

  console.log(`${firstPoke.name} (norm: ${dotProduct(firstPoke.vector, firstPoke.vector.map(x => 1))})`);
  console.log(`${secondPoke.name} (norm: ${dotProduct(secondPoke.vector, secondPoke.vector.map(x => 1))})`);
  console.log(`${thirdPoke.name} (norm: ${dotProduct(thirdPoke.vector, thirdPoke.vector.map(x => 1))})`);
  console.log(`${fourthPoke.name} (norm: ${dotProduct(fourthPoke.vector, fourthPoke.vector.map(x => 1))})`);
  console.log(`${fifthPoke.name} (norm: ${dotProduct(fifthPoke.vector, fifthPoke.vector.map(x => 1))})`);
  console.log(`${sixthPoke.name} (norm: ${dotProduct(sixthPoke.vector, sixthPoke.vector.map(x => 1))})`);

  const finalVector = addVectors(firstPoke.vector, secondPoke.vector, thirdPoke.vector, fourthPoke.vector, fifthPoke.vector, sixthPoke.vector);
  console.log(JSON.stringify(finalVector));
}

// search the row which has the minimum value on the evaluation function
function searchMinimumRow(targetVector, strengthRows, evaluationFunc) {
  let minimumValue = Number.MAX_VALUE;
  let minimumRow = null;
  strengthRows.forEach(strRow => {
    const val = evaluationFunc(targetVector, strRow.vector);
    console.log(`${strRow.name}: ${val}`);
    if (val < minimumValue) {
      minimumValue = val;
      minimumRow = strRow;
    }
  });

  return { row: minimumRow, value: minimumValue };
}

function searchMaximumRow(targetVector, strengthRows, evaluationFunc) {
  const inverseEvalFunc = (v1, v2) => -1 * evaluationFunc(v1, v2);
  return searchMinimumRow(targetVector, strengthRows, inverseEvalFunc);
}


function addVectors() {
  const length = arguments[0].length;
  for (let i = 0; i < arguments.length; i++) {
    if (length !== arguments[i].length) {
      throw new Error('the number of elements is not same');
    }
    
  }

  const newVec = [];
  for (let i = 0; i < length; i++) {
    let elementsSum = 0;
    for (let j = 0; j < arguments.length; j++) {
      elementsSum += arguments[j][i];
    }
    newVec.push(elementsSum);
  } 

  return newVec;
}

function addVector(vector1, vector2) {
  if (vector1.length !== vector2.length) {
    throw new Error('the number of elements is not same');
  }

  const newVec = [];
  for (let i = 0; i < vector1.length; i++) {
    newVec.push(vector1[i] + vector2[i]);
  } 

  return newVec;
}

function cosineSimilarity(v1, v2) {
  return dotProduct(v1, v2) / (l2norm(v1) * l2norm(v2));
}

function dotProduct(vector1, vector2) {
  if (vector1.length !== vector2.length) {
    throw new Error('the number of elements is not same');
  }

  let sum = 0;
  for (let i = 0; i < vector1.length; i++) {
    sum += vector1[i] * vector2[i];
  }

  return sum;
}

function l2norm(vector) {
  let sum = 0;
  vector.forEach(x => {
    sum += x * x;
  });

  sum = Math.sqrt(sum);
  return sum;
}

function isEmptyString(x) {
  return (x === '' || x === '\n' || x === '\r');
}

function compatibleTypes(strategyType) {
  let compatibleTypes = [];

  if (strategyType === 'Sweeper') {
    compatibleTypes = ['Sweeper', 'Tank'];
  } else if (strategyType === 'Tank') {
    compatibleTypes = ['Sweeper', 'Tank', 'Wall'];
  } else if (strategyType === 'Wall') {
    compatibleTypes = ['Tank', 'Wall'];
  }

  return compatibleTypes;
}

function filterStrengthRows(acceptableTypes, strengthRows) {
  return strengthRows.filter(x => acceptableTypes.indexOf(x.strategyType) >= 0);
}