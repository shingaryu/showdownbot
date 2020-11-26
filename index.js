// exports for external packages in which percymon is installed as a library
module.exports.Dex = require('./showdown-sources/.sim-dist/dex').Dex;
module.exports.TeamValidator = require('./showdown-sources/.sim-dist/team-validator').TeamValidator;
module.exports.PcmBattle = require('./percymon-battle-engine').PcmBattle;
module.exports.Minimax = require('./bots/minimaxbot').Minimax;
module.exports.Util = require('./util');
// for keeping backward compatibility in v3.X.X
// module.exports.configureLogger = require('./configure-logger');
module.exports.initLog4js = (nolog, onlyinfo) => require('./configure-logger')(onlyinfo ? 'info': 'all', !nolog);
module.exports.TeamImporter = require('./team-importer').TeamImporter;