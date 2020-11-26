// call this function both the parent process and the child process,
// as the log4js object is not shared among them.
module.exports = function(logLevel = 'all', fileOutput = true) {
  var log4js = require('log4js');

  log4js.configure({
    appenders: {
      out: { type: 'console' },
      botLog: { type: 'file', filename: 'logs/bot.log' },
      minimaxLog: { type: 'file', filename: 'logs/minimax.log' },
      learningLog: { type: 'file', filename: 'logs/learning.log' },
      battleroomLog: { type: 'file', filename: 'logs/battleroom.log' },
      decisionsLog: { type: 'file', filename: 'logs/decisions.log' },
      webconsoleLog: { type: 'file', filename: 'logs/webconsole.log' },
      battleLog: { type: 'file', filename: 'logs/battle.log' },
      battlepokemonLog: { type: 'file', filename: 'logs/battlepokemon.log' },
      battlesideLog: { type: 'file', filename: 'logs/battleside.log' },
      greedyLog: { type: 'file', filename: 'logs/greedy.log' }
    },
    categories: {
      default: { appenders: [ 'out' ], level: logLevel },
      bot: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'botLog'], level: logLevel }, 
      minimax: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'minimaxLog'], level: logLevel }, 
      learning: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'learningLog'], level: logLevel }, 
      battleroom: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'battleroomLog'], level: logLevel }, 
      decisions: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'decisionsLog'], level: logLevel }, 
      webconsole: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'webconsoleLog'], level: logLevel }, 
      battle: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'battleLog'], level: logLevel }, 
      battlepokemon: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'battlepokemonLog'], level: logLevel }, 
      battleside: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'battlesideLog'], level: logLevel }, 
      greedy: { appenders: !fileOutput? [ 'out' ]: [ 'out', 'greedyLog'], level: logLevel }
    }
  });

  if(fileOutput) {
    // Ensure that logging directory exists
    var fs = require('fs');
    if(!fs.existsSync("./logs")) { fs.mkdirSync("logs") };
  }
}
