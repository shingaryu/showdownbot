const nodes = createTreantNodes(lastDecision.tree, 'START', 'top')
const simple_chart_config = {
  chart: {
      container: "#tree-simple",
      connectors: {
        type: 'curve'
      },
      nodeAlign: 'TOP',
      levelSeparation: 130,
      siblingSeparation: 170,
      subTeeSeparation: 170,
      node: {
        collapsable: true,
      }
  },

  nodeStructure: nodes
};

var chart = new Treant(simple_chart_config, function() {
  console.log( 'Tree Loaded' ) 

  replaceWithCustomNodes(null, lastDecision.tree, 'top', false, lastDecision.tree.state);
}, $ );

function createTreantNodes(tree, name, nodeIndex) {
  console.log(`getNode type ${tree.type}, value ${tree.value}, depth ${tree.depth}`)
  console.log(`node index ${nodeIndex}`);
  const text = {name: name || 'none'};

  const isBottom = !(tree.depth > 0 && tree.children.length > 0);
  const children = [];
  if (!isBottom) {
    console.log(`choice ${tree.choices.length}, children ${tree.children.length}`);
    for (let i = 0; i < tree.children.length; i++) {
      const choice =  tree.choices[i];
      const childTree = tree.children[i];
      const index = nodeIndex === 'top'? i.toString() : nodeIndex + '-' + i.toString();
      children.push(createTreantNodes(childTree, choice.type + ' ' + choice.id, index));
    }
  }

  return {
    text, children, HTMLid: `node-${nodeIndex}`, collapsed: isBottom? false: true
  }
}

// replace placeholders and add information to each node from minimax tree objects
function replaceWithCustomNodes(choice, tree, nodeIndex, isPercymonChoice, stateTextBefore) {
  console.log(`replace node index ${nodeIndex}`);

  // insert a template HTML element to the node
  $('body > .custom-node').clone().appendTo(`#node-${nodeIndex}`);

  // from parent
  if (nodeIndex !== 'top') {
    if (isPercymonChoice) {
      $(`#node-${nodeIndex} > div > .percymon-badge`).show();
    } else {
      $(`#node-${nodeIndex} > div > .player-badge`).show();
    }
  }

  const stateBefore = getStateParametersFromText(stateTextBefore);

  // from choice
  let actionText = '';
  if (nodeIndex === 'top') {
    actionText = 'START';
  } else if (choice && choice.type === 'move') {
    actionText = choice.id;
  } else if (choice && choice.type === 'switch') {
    if (isPercymonChoice) {
      actionText = stateBefore.botPokeNames[parseInt(choice.id)];
    } else {
      actionText = stateBefore.humanPokeNames[parseInt(choice.id)];
    }
  }
  insertVariable(`#node-${nodeIndex} > div > .action > .action-text`, '{action}', actionText);

  if (choice) {
    if (choice.type === 'move') {
      $(`#node-${nodeIndex} > div > .action`).addClass('icon-move');
    } else if (choice.type === 'switch') {
      $(`#node-${nodeIndex} > div > .action`).addClass('icon-switch');
    }

    if (choice.runMegaEvo) {
      $(`#node-${nodeIndex} .megaevo-badge`).show();
    } else if (choice.useZMove) {
      $(`#node-${nodeIndex} .zmove-badge`).show();
    } else if (choice.runDynamax) {
      $(`#node-${nodeIndex} .dynamax-badge`).show();
    }
  }

  // from tree
  // extract state information after executed this choice
  const stateAfter = getStateParametersFromText(tree.state);
  insertVariable(`#node-${nodeIndex} > div .value-text`, '{value}', tree.value.toFixed());
  insertVariable(`#node-${nodeIndex} > div > .bot-status`, '{status}', stateAfter.botActive);
  insertVariable(`#node-${nodeIndex} > div > .player-status`, '{status}', stateAfter.humanActive);

  // recursive for children
  if (tree.depth > 0 && tree.children.length > 0) {
    console.log(`choice ${tree.choices.length}, children ${tree.children.length}`);
    // note: tree.type === 'max' means that it sets maximum values of child nodes as the value of this node.
    // Thus, it means also that all ``child`` nodes are percymon's choices.
    const isChildPercymonChoice = tree.type === 'max';
    for (let i = 0; i < tree.children.length; i++) {
      const childChoice = tree.choices[i];
      const childIndex = nodeIndex === 'top'? i.toString() : nodeIndex + '-' + i.toString();
      const childTree = tree.children[i];
      replaceWithCustomNodes(childChoice, childTree, childIndex, isChildPercymonChoice, tree.state);
    }
  }
}

function getStateParametersFromText(stateText) {
  const botPlayerState = stateText.substring(stateText.indexOf('botPlayer'), stateText.indexOf('humanPlayer'));
  let botActive = botPlayerState.substring(botPlayerState.indexOf('Active Pokemon:') + 16, botPlayerState.indexOf(', L'));
  if (botActive.indexOf(' @ ') >= 0) {
    botActive = botActive.substring(0, botActive.indexOf(' @ '));
  }
  const humanPlayerState = stateText.substring(stateText.indexOf('humanPlayer'));
  let humanActive = humanPlayerState.substring(humanPlayerState.indexOf('active:') + 7, humanPlayerState.indexOf(', L'));
  if (humanActive.indexOf(' @ ') >= 0) {
    humanActive = humanActive.substring(0, humanActive.indexOf(' @ '));
  }

  const botPokeNames = getPokeNames(botPlayerState);
  const humanPokeNames = getPokeNames(humanPlayerState);
  
  return {
    botActive, humanActive, botPokeNames, humanPokeNames
  }
}

function getPokeNames(sideStateText) {
  const stateLines = sideStateText.split('\n');
  const allPokeLines = [];
  let allPokemonLineIndex = Number.MAX_VALUE;
  for (let i = 0; i < stateLines.length; i++) {
    const line = stateLines[i];
    if (line.indexOf('All Pokemon') >= 0) {
      allPokemonLineIndex = i;
      continue;
    }
  
    if (line.indexOf('side conditions') >= 0) {
      break;
    }

    if (allPokemonLineIndex < i) {
      allPokeLines.push(line.trim());
    }
  }
  
  const pokeNames = [];
  allPokeLines.forEach(line => {
    pokeNames.push(line.substring(0, line.indexOf(' ')));
  });

  return pokeNames;
}

function insertVariable(selector, variableName, value) {
  let valueText = $(selector).text();
  valueText = valueText.replace(variableName, value);
  $(selector).text(valueText);
}
