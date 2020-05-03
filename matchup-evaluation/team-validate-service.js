const TeamValidator = require('../showdown-sources/.sim-dist/team-validator').TeamValidator;

// Validate pokemon sets. If the validation failed about one of target pokemons, throw an exception.
module.exports.validatePokemonSets = (gameFormat, pokemonSets) => {
  const teamValidator = new TeamValidator(gameFormat);

  pokemonSets.forEach(pokemonSet => {
    const setValidationProblems = teamValidator.validateSet(pokemonSet);
    if (setValidationProblems) {
      logger.error(`${setValidationProblems.length} problem(s) is found about ${pokemonSet.species} during the validation.`);
      setValidationProblems.forEach(problem => {
        logger.error(problem);
      })
      throw new Error('Pokemon Set Validation Error');
    }  
  })
}