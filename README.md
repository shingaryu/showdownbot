Percymon: A Pokemon Showdown AI
===========

![Imgur](http://i.imgur.com/uasrTOy.png)

Percymon is a Pokemon battling AI that runs on the Pokemon Showdown server. Percymon is built using Node.js.

## Setting up the repository

To set up the server, you need to first install dependencies:

    npm install

In order to actually play games you must create an account on Pokemon Showdown. Once the log-in information has been obtained, you need to create an `account.json` file containing information. The format of `account.json` is as follows:

    {
        "username" : "sillybot",
        "password": "arbitrary password",
        "message" : "gl hf"
    }

The `message` field indicates the message that will be sent when the bot first connects to the game.

Finally, to start the server, issue the following command:

    node bot.js

By default, the server searches for unranked random battles when the option is toggled in the web console. There are several command line options that can be supplied:

    --console: Only start the web console, not the game playing bot.
    --host [url]: The websocket endpoint of the host to try to connect to. Default: http://sim.smogon.com:8000/showdown
    --port [port]: The port on which to serve the web console. Default: 3000
    --ranked: Challenge on the ranked league.
    --net [action]: Neural network configurations. 'create' - generate a new network. 'update' - use and modify existing network. 'use' - use, but don't modify network. 'none' - use hardcoded weights. Default: none
    --algorithm [algorithm]: Can be 'minimax', 'greedy', or 'random'. Default: minimax
    --depth [depth]: Minimax bot searches to this depth from the current state. Default: 2
    --account [file]: File from which to load credentials. Default: account.json
    --team6g [file]: File from which to load a battle team for Gen 6. Default: team6g.txt
    --team7g [file]: File from which to load a battle team for Gen 7. Default: team7g.txt
    --team8g [file]: File from which to load a battle team for Gen 8. Default: team8g.txt
    --nosave: Don't save games to the in-memory db.
    --nolog: Don't append to log files.
    --onlyinfo: Hide debug messages and speed up bot calculations.
    --startchallenging: Start out challenging, instead of requiring a manual activation first.
    --usechildprocess: Use child process to execute heavy calculations with parent process keeping the connection to showdown server

## Setting up teams

In order to play games of formats below, you must create text files that contains team (a set of Pokemon) information. You can obtain the texts on Pokemon Showdown, by clicking "Import/Export" for your team in the TeamBuilder.
|Format|File name|
|---|---|
|[Gen 6] Battle Spot Singles|team6g.txt|
|[Gen 7] Battle Spot Singles|team7g.txt|
|[Gen 8] Battle Stadium Singles|team8g.txt|

The format of the files is like this:

    Alakazam-Mega @ Alakazite  
    Ability: Trace  
    Level: 50  
    EVs: 252 SpA / 252 Spe  
    Timid Nature  
    IVs: 0 Atk  
    - Psychic  
    - Encore  
    - Focus Blast  
    - Protect  

    Garchomp @ Life Orb  
    Ability: Rough Skin  
    Level: 50  
    EVs: 252 Atk / 4 SpD / 252 Spe  
    Jolly Nature  
    - Earthquake  
    - Outrage  
    - Rock Slide  
    - Stealth Rock  

    ...

