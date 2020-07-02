const { Client } = require('pg')
const fs = require('fs');

class PostgresRepositoryBase {
  constructor() {
    const postgresCredentials = JSON.parse(fs.readFileSync('./matchup-evaluation/postgres-credentials.json'));

    // on heroku environment
    if (process.env.NODE_ENV === 'production') {
      this.client = new Client({
        // connectionString: process.env.DATABASE_URL,
        connectionString: postgresCredentials.databaseUrl,
        ssl: {
          rejectUnauthorized: false
        }
      });
    } else {
      this.client = new Client({
        // connectionString: process.env.DATABASE_URL,
        connectionString: postgresCredentials.databaseUrl,
      });
    }

    this.client.connect();
  }

  endConnection() {
    this.client.end();
  }

  sqlQueryPromise(statement) {
    // this.client.connect();
    return new Promise((resolve, reject) => {
      this.client.query(statement, (err, res) => {
        if (err) {
          // this.client.end();
          console.log(err)
          reject(err);
        } else {
          // this.client.end();
          resolve(res.rows);
        }
      })
    });
  }
}

module.exports.PostgresRepositoryBase = PostgresRepositoryBase;