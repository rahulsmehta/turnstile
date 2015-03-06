var Turnstile = require('./index.js'),
    redis = require('redis');

var t = new Turnstile({'su':true,'port':7000,'evictionRate':2000});
t.connect();
console.log(t.status());

var redisClient = t.getRedisClient();
redisClient.flushall(function(err,reply){
  console.log("FLUSHALL: "+reply);});

if(t.status() == "CONNECTED"){
  var user = {'uid':'rahulm','api_key':'abc123'};
  var policy = {'req_per_int':2,'session_duration':86400000};
  var session_token = -1;
  setInterval(function(){
  t.genSessionToken(user,policy,function(err,reply){
    session_token = reply.session_token;
    console.log('Session Token:'+session_token);
/*    t.getSessionInfo(session_token,function(err,reply){
      if(err){console.log(err);process.exit();}
      console.log('Session Info: '+JSON.stringify(reply));
      var reqNum = 0;
      var id = setInterval(function(){
        t.throttleRequest(session_token,function(err,reply){
          reqNum++;
          console.log(reply);
          if(reqNum == 5)clearInterval(id);
        });
      },1000);
    });*/
  });
  },2000);
}
