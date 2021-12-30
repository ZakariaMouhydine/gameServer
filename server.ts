"use strict"

//Each player sends a 'message' every time an input is made (completed) - each input is asigned a SQN
//every 1/10th of a second all players poll for all outstanding messages

class Game{  
  id:number =-1
  sqn:number = 0         //Every received message is assigend a sequence number .. for now there is no checking on the order but they *should* be processed in order (by clients)
  players:Record<string,Player>={} //each game has a set of players, indexed by (unique) player name
  data:object  //store arbitrary game data, to be sent to players when they join (in our case, the type and position of all obstacles)

  constructor(games:Record<number,Game>,data:object){
    do{
      this.id=Math.floor(Math.random()*10000)+1000    //make a random game ID
    }
    while (games.hasOwnProperty(this.id))  //keep looping until we find an unused ID (becuase there's a small chance of a dupe)    
    games[this.id]=this  //store the game we have constructed
      this.data=data
  } 

}

class Player{    
  playerName:string  // is used as the unique ID too (player names must be unique per game)
  q:Message[]=[]  //Outboud queue of messages not yet collected by this player (via a POLL)
  params: object // inital position of joining players 

  constructor(playerName:string, params: object){        
      this.playerName = playerName
      this.params = params
  }
}

export class Message{
  gameId:number
  playerName:string
  sqn:number   //sequence number    
  cmd:string      //the 'command' is the action being performed
  params:object   //can be an empty object 
}


//const createError = require('http-errors');
const express = require('express');
const app=express()

app.get("/",(req,res)=>{
  res.send("This service is accessd via POST (don't try and GET from it)")
})

//CORS - without this we cannot accept multipart forms (or do several other things later - this really wants locking down before production)
app.use((req, res, next:Function) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*") ; //Origin, X-Requested-With, Content-Type, Accept");
  res.setHeader('Access-Control-Allow-Methods', "*") //; 'POST,GET'); // Add other methods here
  next();
});

app.use(express.json()) //alows us to use req.json

app.options("/*", (_req:any,res:any)=>res.sendStatus(200))  //we need to respond to preflight- OPTIONS requests for CORS to work

const games: Record<number,Game>={}

app.post("/*",(req,res)=>{ 
  let msg:Message=req.body //json() //body
  let game:Game
  let player:Player
    if (msg.gameId == null && msg.cmd != "createGame"){
      console.log(`recieved command ${msg.cmd} with no gameid`);
       res.status(500)  //sendStatus(200)
       res.end()
       return
    }

    // if(msg.cmd != "createGame" && ! games.hasOwnProperty(msg.gameId)){
    //    console.log(`recieved command ${msg.cmd} with gameId ${msg.gameId}`);
    //    res.status(500)  //sendStatus(200)
    //    res.end()
    //    return
    // }
  if (msg.gameId){ game=games[msg.gameId]}

  if (msg.cmd =="createGame"){
    game=new Game(games,msg.params);           
    console.log(`Created game ${game.id}`)
     res.json ({gameId:game.id}) 
    res.status(200)  //sendStatus(200)
    res.end()
    //move out (you should join the game you created)
    // player =new Player(msg.name)
    // game.players[msg.name]=player //place them in the games, players object  
    // //alter the msg - for output in all the queues
    // msg.cmd="playerJoined" 
    // msg.gameId=game.id
  }
  
  else if (msg.cmd=="joinGame"){
    //create a new player and add them to the requested game
    player =new Player(msg.playerName, msg.params)
    if(msg.playerName == undefined){
      console.log("playerName was undefined in joinGame");
    }
    
    //send the game setup data (whatever that is... in our case, obstacles)
    player.q.push({gameId:game.id,playerName:"",cmd:"gameData",sqn:game.sqn,params:game.data})
    game.sqn++

    //queue a 'virtual' 'playerJoined' message 'from' every player already in the game - for sending to this (joining) player 
    //(so we (the joining players) get to see all the players who have *already* joined)
    for (let pn in game.players){
      let op=game.players[pn] //other player      
      player.q.push({cmd:"playerJoined",playerName:op.playerName,gameId:game.id,sqn:game.sqn,params: op.params })
      game.sqn ++ 
    }

    game.players[msg.playerName]= player
    msg.cmd="playerJoined"
    console.log(`${msg.playerName} joined game ${game.id}`)
    
    
  }

  else if (msg.gameId==null){
    console.log (`ERROR: received a ${msg.cmd||'null'} command with no gameId present (Only joinGame, and createGame can be called without a gameId`)
  }
   
  if (msg.cmd != "poll"){
    
    msg.sqn=game.sqn  //assign a sequence number to the recieved message
    game.sqn++        //increment this *games* SQN (many games can be in progress)

    //relay this message to all connected players (including the sender)
    for (let playerName in game.players){
      console.log (`queuing ${msg} for ${playerName}`)
      game.players[playerName].q.push(msg)
    }
  }
  
  //the response to posting up ANY message (inclding Poll) is the list of all pending items in YOUR q (which will include the action you just posted)
  if (game.players.hasOwnProperty(msg.playerName)){
    
    //note q *can* be empty if we are polling and there is nothing for us
    if (game.players[msg.playerName].q.length>0){
      res.json (game.players[msg.playerName].q) 
    }
    else{
      res.json([]) //send an empty object if the their queue is empty (sending an empty array casues 'unexpected end of response' clientside)
    }
    game.players[msg.playerName].q =[] //empty their queue, once it has been sent (note we can't empty 'q'.. that jsut reassigns the object reference and leavers the original unaffected (ask me how i know))
  }
  else{
    console.log(`game ${game.id} has no player '${msg.playerName}'`)
  }

  res.status(200)  //sendStatus(200)
  res.end()
})

const port=5050
app.listen(port,()=>console.log(`started on port ${port}`))

