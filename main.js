var redis = require('redis'),
    client = redis.createClient(),
    SHA256 = require('crypto-js/sha256');

var express = require('express'),
    url = require('url'),
    errorHandler = require('errorhandler'),
    bodyParser = require('body-parser'),
    app = express();

var util = require('./util.js');

//var handler = require('./handlers.js');

app.use(errorHandler());;

node_env = process.env.NODE_ENV || "development";
logging = false;
port = null;
ACTIVE_RESOLUTION = -1;

if(node_env === "development"){
  logging = true; 
  port = 3000;
  ACTIVE_RESOLUTION = 120000;
}
else if(node_env === "production"){
  port = process.env.PORT;
  ACTIVE_RESOLUTION = process.env.ACTIVE_RESOLUTION 
    || 120000;
}

app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());


client.on("error",function(err){
  if(logging)console.log("Redis error "+err);
});


app.get('/api/*',function(req,res){
  console.log("%s %s",req.method,req.path);
  var endpt = req.path.split('/')[2];
  var _res = {};
  var query = url.parse(req.url,true).query;


  if(endpt == "get_session_token"){
    var api_key = req.path.split('/')[3];

    if(!api_key){
      _res['error'] = "api key not found";
      _res['status'] = 404;
      res.status(404).send(JSON.stringify(_res));
      return;
    }

    client.get(api_key,function(err,reply){
      if(err){
        _res['error'] = "internal server error",
        _res['status'] = 500;
        res.status(500).send(JSON.stringify(_res));
        return;
      }
      if(!reply){
        _res['error'] = "api key not found";
        _res['status'] = 404;
        res.status(404).send(JSON.stringify(_res));
        return;
      }
      var _hash = SHA256(api_key+Math.random()).toString(),
          _hash = _hash.substring(0,15);

      var _reply = JSON.parse(reply);

      _res['token'] = _hash;
      _res['req_per_int']=_reply.policy.req_per_int;

      client.hset([_res['token'],"api_key",api_key],redis.print);
      client.hset([_res['token'],"uid",_reply.uid],redis.print);
      client.hset([_res['token'],"policy",JSON.stringify(_reply.policy)],
        redis.print);
      client.hset([_res['token'],"allowance",_reply.policy.req_per_int],
        redis.print);

      /* Evict at duration specified by policy, or default to 24-hour */
      var duration = _reply.policy.session_duration || 86400000;
      
      var now = new Date();
      client.zadd("active",now.valueOf()+duration,_res['token'],redis.print);


      client.pexpire(_res['token'],duration,
        function(err,reply){
        console.log("Generated new session token for %s: %s",_reply.uid,
          _hash);
        res.status(200).send(JSON.stringify(_res));
      });
    });
  }
  else if(endpt == "sample_endpoint"){
    var session_token = query.session_token;
    client.exists(session_token,function(err,reply){
      if(err){
        _res['error'] = "internal server error",
        _res['status'] = 500;
        res.status(500).send(JSON.stringify(_res));
        return;
      }
      if(reply == 1)
        res.status(200).send("200 Okay\n");
      else
        res.status(404).send("404 Not Found\n");
    });
  }
});


app.post('/api/*',function(req,res){
  console.log(req.method+" "+req.path);
  console.log(req.body);
  var endpt = req.path.split('/')[2];
  
  if(endpt == "gen_key"){
    console.log("Generating new API key...");
    var _hash = SHA256(req.body.uid).toString(),
        _hash = _hash.substring(0,10);

    var _key_data = {
      'uid':req.body.uid,
      'api_key':_hash,
      'policy':{'req_per_int':100,'session_duration':43200000}
    };

    client.set(_hash,JSON.stringify(_key_data));

    console.log("New API key saved for '"+_key_data.uid+"':"+_key_data.api_key);

    _key_data['session_token']=SHA256(_key_data.uid+Math.random()).toString();

    res.status(200).send(JSON.stringify(_key_data));

  }
  else if(endpt == "active_sessions"){
    console.log("Active sessions...");
    client.zrange("active",0,-1,function(err,reply){
      console.log(reply);
      res.status(200).send("200 Okay"+'\n');
    });
    res.status(200).send("200 Okay"+'\n');
  }
  else
    res.status(200).send("200 Okay"+'\n');
});

/* Evict expired session tokens at the resolution specified
 * (default 120 seconds) */
setInterval(function(){
  client.exists("active",function(err,reply){
    if(reply == 0){
      console.log("No active sessions");
      return;
    }
    else{
      var now = new Date();
      client.zremrangebyscore("active",0,now.valueOf(),redis.print);
      return;
    }
  });
},ACTIVE_RESOLUTION);

var server = app.listen(port);

console.log("Started server at port %d",port);
