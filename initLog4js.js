// call this function both the parent process and the child process,
// as the log4js object is not shared among them.
module.exports = function(nolog, onlyinfo) {
  var log4js = require('log4js');

  const logCategories = [
    'bot', 
    'minimax', 
    'learning', 
    'battleroom', 
    'decisions', 
    'webconsole', 
    'battle', 
    'battlepokemon', 
    'battleside', 
    'greedy'
  ]
 
  if (onlyinfo) {
    const levelsObj = {};
    logCategories.forEach(category => {
      levelsObj[category] = "INFO"
    });

    log4js.configure({
      appenders : [
        {
          type: "console",
          category: logCategories
        }
      ], 
      levels: levelsObj
    });
  }
  
  if(!nolog) {
    // Ensure that logging directory exists
    var fs = require('fs');
    if(!fs.existsSync("./logs")) { fs.mkdirSync("logs") };
    log4js.loadAppender('file');
    logCategories.forEach(category => log4js.addAppender(log4js.appenders.file(`logs/${category}.log`), category));
  }
}
