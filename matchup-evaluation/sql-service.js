const { v4: uuidv4 } = require('uuid');
const { PostgresRepositoryBase } = require('./postgresRepositoryBase');

class SqlService extends PostgresRepositoryBase {
  constructor() {
    super();
  }

  insertPokemonStrategy(poke) {
    const sql = `
      INSERT INTO pokemon_strategies (
        id, 
        species_id,
        item,
        ability,
        nature,
        move1,
        move2,
        move3,
        move4,
        ev_hp,
        ev_atk,
        ev_def,
        ev_spa,
        ev_spd,
        ev_spe,
        nickname,
        gender,
        iv_hp,
        iv_atk,
        iv_def,
        iv_spa,
        iv_spd,
        iv_spe,
        level,
        happiness,
        shiny
      )
      SELECT 
        '${uuidv4()}' , 
        id,
        ${this.escapeOrNull(poke.item)},
        ${this.escapeOrNull(poke.ability)},
        ${this.escapeOrNull(poke.nature)},
        ${poke.moves.length > 0 ? this.escapeOrNull(poke.moves[0]): 'NULL'},
        ${poke.moves.length > 1 ? this.escapeOrNull(poke.moves[1]): 'NULL'},
        ${poke.moves.length > 2 ? this.escapeOrNull(poke.moves[2]): 'NULL'},
        ${poke.moves.length > 3 ? this.escapeOrNull(poke.moves[3]): 'NULL'},
        ${poke.evs? poke.evs.hp: 'NULL'},
        ${poke.evs? poke.evs.atk: 'NULL'},
        ${poke.evs? poke.evs.def: 'NULL'},
        ${poke.evs? poke.evs.spa: 'NULL'},
        ${poke.evs? poke.evs.spd: 'NULL'},
        ${poke.evs? poke.evs.spe: 'NULL'},
        ${this.escapeOrNull(poke.name)},
        ${this.escapeOrNull(poke.gender)},
        ${poke.ivs? poke.ivs.hp: 'NULL'},
        ${poke.ivs? poke.ivs.atk: 'NULL'},
        ${poke.ivs? poke.ivs.def: 'NULL'},
        ${poke.ivs? poke.ivs.spa: 'NULL'},
        ${poke.ivs? poke.ivs.spd: 'NULL'},
        ${poke.ivs? poke.ivs.spe: 'NULL'},
        ${poke.level? poke.level: 'NULL'},
        ${poke.happiness? poke.happiness: 'NULL'},
        ${poke.shiny? poke.shiny: 'NULL'}
      FROM pokemon_species
      WHERE name = '${poke.species}'
    `

    return this.sqlQueryPromise(sql);
  }


  fetchTargetStrategyIdSets() {
    const sql = `
      SELECT 
      spe1.name as spe1_species_name,
      spe2.name as spe2_species_name,

      str1.id as str1_id ,
      str1.item as str1_item ,
      str1.ability as str1_ability ,
      str1.nature as str1_nature ,
      str1.move1 as str1_move1 ,
      str1.move2 as str1_move2 ,
      str1.move3 as str1_move3 ,
      str1.move4 as str1_move4 ,
      str1.ev_hp as str1_ev_hp ,
      str1.ev_atk as str1_ev_atk ,
      str1.ev_def as str1_ev_def ,
      str1.ev_spa as str1_ev_spa ,
      str1.ev_spd as str1_ev_spd ,
      str1.ev_spe as str1_ev_spe ,
      str1.gender as str1_gender ,
      str1.iv_hp as str1_iv_hp ,
      str1.iv_atk as str1_iv_atk ,
      str1.iv_def as str1_iv_def ,
      str1.iv_spa as str1_iv_spa ,
      str1.iv_spd as str1_iv_spd ,
      str1.iv_spe as str1_iv_spe ,
      str1.happiness as str1_happiness , 

      str2.id as str2_id ,
      str2.item as str2_item ,
      str2.ability as str2_ability ,
      str2.nature as str2_nature ,
      str2.move1 as str2_move1 ,
      str2.move2 as str2_move2 ,
      str2.move3 as str2_move3 ,
      str2.move4 as str2_move4 ,
      str2.ev_hp as str2_ev_hp ,
      str2.ev_atk as str2_ev_atk ,
      str2.ev_def as str2_ev_def ,
      str2.ev_spa as str2_ev_spa ,
      str2.ev_spd as str2_ev_spd ,
      str2.ev_spe as str2_ev_spe ,
      str2.gender as str2_gender ,
      str2.iv_hp as str2_iv_hp ,
      str2.iv_atk as str2_iv_atk ,
      str2.iv_def as str2_iv_def ,
      str2.iv_spa as str2_iv_spa ,
      str2.iv_spd as str2_iv_spd ,
      str2.iv_spe as str2_iv_spe ,
      str2.happiness as str2_happiness 
      
      FROM pokemon_strategies as str1
      INNER JOIN pokemon_species as spe1
      ON str1.species_id = spe1.id

      CROSS JOIN pokemon_strategies as str2
      INNER JOIN pokemon_species as spe2
      ON str2.species_id = spe2.id
      LEFT OUTER JOIN matchup_evaluations as mat
      ON ((str1.id = mat.player_poke_id AND str2.id = mat.target_poke_id)
      OR (str2.id = mat.player_poke_id AND str1.id = mat.target_poke_id))
      WHERE mat.id IS NULL AND str1.id < str2.id
    `

    return this.sqlQueryPromise(sql);
  }

  insertMatchupEvaluation(playerPokeId, targetPokeId, value, calculatedAt) {
    const sql = `
      INSERT INTO matchup_evaluations VALUES (
        '${uuidv4()}',
        '${playerPokeId}',
        '${targetPokeId}',
        '${value}',
        '${calculatedAt}'
      )  
    `

    return this.sqlQueryPromise(sql);
  }

  // Note: return with single quotation
  escapeOrNull(text) {
    if (!text) {
      return 'NULL';
    }
    
    return `'${text.replace('\'', '\'\'')}'`;
  }
}

module.exports.SqlService = SqlService;