global.program = require('commander');
global.program
.option('--directory [file]', "directory path from which showdown format pokemon files are loaded. ['./matchup-evaluation/matchup-candidates']", './matchup-evaluation/matchup-candidates')
.parse(process.argv);

global.Dex = require('../showdown-sources/.sim-dist/dex').Dex;
global.toId = Dex.getId;
const fs = require('fs');
const importTeam = require('../util').importTeam;
const MySqlService = require('./mysql-service').MySqlService;
// const validatePokemonSets = require('./team-validate-service').validatePokemonSets;

const mySqlService = new MySqlService();

const matchupCandidates = loadPokemonSetsFromTexts(global.program.directory);
// const customGameFormat = Dex.getFormat(`gen8customgame`, true);
// customGameFormat.ruleset = customGameFormat.ruleset.filter(rule => rule !== 'Team Preview');
// customGameFormat.forcedLevel = 50;
// validatePokemonSets(customGameFormat, matchupCandidates)

matchupCandidates.forEach(poke => {
  console.log(`Insert ${poke.species} to DB...`);

  mySqlService.insertPokemonStrategy(poke);
})

mySqlService.endConnection();

// Read target pokemon sets from team text. If an error occurs, just skip the file and continue.
function loadPokemonSetsFromTexts(directoryPath) {
  const filenames = fs.readdirSync(directoryPath);
  const pokemons = [];

  filenames.forEach(filename => {
    try {
      const rawText = fs.readFileSync(`${directoryPath}/${filename}`, "utf8");
      const pokemonSets = importTeam(rawText); 
      if (!pokemonSets) {
        console.log(`'${filename}' doesn't contain a valid pokemon expression. We will just ignore this file.`);
      } else if (pokemonSets.length > 1) {
        console.log(`'${filename}' seems to have more than one pokemon expression. Subsequent ones are ignored.`);
      }
      pokemons.push(pokemonSets[0]);
    } catch (error) {
      console.log(`Failed to import '${filename}'. Is this a text of a target pokemon?`);
      console.log(error);
    }
  });

  return pokemons;
}