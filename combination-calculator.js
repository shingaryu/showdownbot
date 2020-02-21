const fs = require('fs');
const filename = 'strength-table.csv';

const src = fs.createReadStream(`combination-calculator/${filename}`, 'utf8');
let tableRows = [];
src.on('data', row => {
  tableRows = row.split('\n');
})
src.on('end', () => {
  let numberOfValues = -1;
  let strengthRows = []; 
  let index = 0;

  console.log(`${tableRows.length} rows are loaded`);
  tableRows.slice(1).forEach(row => {
    console.log(row);
    if (!row) {
      return;
    }
    const records = row.split(',');
    const strengthRow = {};
    strengthRow['index'] = index++;
    strengthRow['name'] = records[0];
    const values = records.slice(1);
    if (numberOfValues === -1) {
      numberOfValues = values.length;
    } else {
      if (numberOfValues !== values.length) {
        throw new Error('error: the number of column is not same among different rows');
      }
    }
    strengthRow['vector'] = values.map(v => parseFloat(v));
  
    strengthRows.push(strengthRow);

  }) 
  constructTeamByIngenMethod(strengthRows, 17);
})

function constructTeamByIngenMethod(strengthRows, firstPokemonIndex) {
  // (1) select the first pokemon
  const firstPoke = strengthRows[firstPokemonIndex];
  console.log(`firstPoke: ${firstPoke.name}\n`);
  strengthRows = strengthRows.filter(x => x.index != firstPoke.index);

  // (2) search the second pokemon which complements the first pokemon
  const resultStep2 = searchMinimumRow(firstPoke.vector, strengthRows, (v1, v2) => cosineSimilarity(v1, v2));
  const secondPoke = resultStep2.row;
  console.log(`secondPoke: ${secondPoke.name}\n`);
  strengthRows = strengthRows.filter(x => x.index != secondPoke.index);

  // (3)(4) search the third and fourth pokemon which complements the first and second
  const vectorFirstAndSecond = addVector(firstPoke.vector, secondPoke.vector);
  minimumCosSim = Number.MAX_VALUE;
  let thirdPoke = null;
  let fourthPoke = null;
  // temporary search all combinations
  for (let i = 0; i < strengthRows.length; i++) {
    const v1 = strengthRows[i].vector;
    for (let j = i + 1; j < strengthRows.length; j++) {
      const v2 = strengthRows[j].vector;
      const combinedVector = addVector(v1, v2);
      const cos = cosineSimilarity(vectorFirstAndSecond, combinedVector);
      // console.log(`${strengthVectors[i].name} + ${strengthVectors[j].name}: ${cos}`);
      if (cos < minimumCosSim) {
        minimumCosSim = cos;
        thirdPoke = strengthRows[i];
        fourthPoke = strengthRows[j];
      }
    }
  }

  console.log(`thirdPoke: ${thirdPoke.name}`);
  console.log(`fourthPoke: ${fourthPoke.name}\n`);
  strengthRows = strengthRows.filter(x => x.index != thirdPoke.index);
  strengthRows = strengthRows.filter(x => x.index != fourthPoke.index);


  // (5) search fifth pokemon which complements above 4 pokemons
  const vector4Pokemons = addVectors(firstPoke.vector, secondPoke.vector, thirdPoke.vector, fourthPoke.vector);
  console.log(JSON.stringify(vector4Pokemons))
  const resultStep5 = searchMinimumRow(vector4Pokemons, strengthRows, (v1, v2) => cosineSimilarity(v1, v2))
  const fifthPoke = resultStep5.row; 
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

  console.log(`weakest slot is ${weakestSlot}: ${weakestValue}`);

  const resultStep6 = searchMaximumRow(null, strengthRows, (v1, v2) => v2[weakestSlot]);
  const sixthPoke = resultStep6.row;
  console.log(`sixthPoke: ${sixthPoke.name}\n`);

  console.log(`${firstPoke.name} (norm: ${l2norm(firstPoke.vector)})`);
  console.log(`${secondPoke.name} (norm: ${l2norm(secondPoke.vector)})`);
  console.log(`${thirdPoke.name} (norm: ${l2norm(thirdPoke.vector)})`);
  console.log(`${fourthPoke.name} (norm: ${l2norm(fourthPoke.vector)})`);
  console.log(`${fifthPoke.name} (norm: ${l2norm(fifthPoke.vector)})`);
  console.log(`${sixthPoke.name} (norm: ${l2norm(sixthPoke.vector)})`);

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
