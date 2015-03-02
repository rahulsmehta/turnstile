//TODO: ADD LIFESPAN PARAMETER TO POLICY (to replace session_duration)
var redis = require('redis'),
    SHA256 = require('crypto-js/sha256'),
    extend = require('extend'),
    url = require('url');

DEBUG = true;

function Turnstile(_config){
  if(!_config)_config = {};
  var config = {};
  config.port = _config.port || 6379;
  config.host = _config.host || "localhost";
  config.evictionRate = _config.rate || 
    120000;
  config.su = _config.su || false;
  config.framework = _config.framework || "express";
  config.defaultPolicy = _config.defaultPolicy ||
    {'req_per_int':100,'session_duration':86400000};
  var client = null;


  var methods = {
    'status': function(){return (client)?"CONNECTED":"NOT CONNECTED";},
    'getRedisClient': function(){
        if(config.su)
          return client;
        else
          return null;
      },
    'connect':function(){client = redis.createClient(config.port,
      config.host);},
    'getProp':function(propName,callback){
        var err = null;
        if(!config[propName])
          err = "ERR_PROP_NOT_FOUND";
        return callback(err,config[propName]);
      },
    'getPropSync':function(propName){return config[propName];},
    'genSessionToken': function(user,policy,callback){
      var err = null;
      if(!user.api_key){
        err = "ERR_NO_API_KEY";
        return callback(err);
      }
      if(!policy)
        policy = config.defaultPolicy;
      var token = (SHA256(user.api_key+(Math.random()*1000)).toString()).substring(0,15);
      var uid = user.uid || null;
      var display = uid || user.api_key;

      client.hset([token,"api_key",user.api_key],function(){});
      client.hset([token,"uid",user.uid],function(){});
      client.hset([token,"policy",JSON.stringify(policy)],function(){});
      client.hset([token,"allowance",policy.req_per_int],function(){});
      client.hset([token,"rate",policy.req_per_int],function(){});
      client.hset([token,"last_msg",(new Date()).valueOf()],function(){});


      var duration = policy.session_duration || 
        config.defaultPolicy['session_duration'];

      client.zadd("active",(new Date()).valueOf()+duration,token,function(){});

      client.pexpire(token,duration,
          function(_err,reply){
            //console.error("Generated new session token for %s: %s",display,token);
            return callback(null,{'api_key':user.api_key,'session_token':token});
          });
    },
    'getSessionInfo': function(sessionToken,callback){
      client.hgetall(sessionToken,function(err,reply){
        var response = reply;
        //console.error(reply);
        if(err)
          return callback("INTERNAL_SERVER_ERROR");
        if(!reply)
          return callback("ERR_NOT_FOUND");
        else{
          client.pttl(sessionToken,function(err,ttl){
            response['ttl'] = ttl;
            delete response['allowance'];
            return callback(null,response);
          });
        }
      });
    },
    'getActiveSessions':function(callback){
      client.exists("active",function(err,reply){
        if(err)
          return callback("INTERNAL_SERVER_ERROR"+err);
        if(reply == 0)
          return callback(null,{'sessions':[],'num_active':0});
        else if(reply == 1){
          client.zrange(["active",0,-1],function(err,reply){
            if(err)
              return callback("INTERNAL_SERVER_ERROR"+err);
            else{
              response = {};
              response['sessions'] = [];
              reply.forEach(function(item){
                response['sessions'].push(item);
              });
              response['num_active'] = reply.length;
              return callback(null,response);
            }
          }); 
        }
      });
    },
    'endSession':function(session,callback){
      if(typeof(session) == 'string'){
        client.del(session,function(err,reply){
          if(err)
            return callback("INTERNAL_SERVER_ERROR");
          if(reply == 0)
              return callback(null,false);
          else if(reply == 1){
            client.zrem(["active",session],function(err,_reply){
              if(reply == 0)
                return callback(null,false);
              else if(reply == 1)
                return callback(null,true);
            });
          }
        });
      }
      else if(Object.prototype.toString.call(session) 
          == '[object Array]'){
        session.forEach(function(item){
          methods.endSession(item,function(err,reply){
            if(err)
              return callback("INTERNAL_SERVER_ERROR");
            if(!reply)
              return callback(null,false);
          });
        });
        return callback(null,true);
      }
    },
    'setThrottleParams':function(token,last_msg,allowance,callback){
      client.hset([token,'last_msg',last_msg],function(err){
        if(err)
          return callback("INTERNAL_SERVER_ERROR");
        client.hset([token,'allowance',allowance],function(err){
          if(err)
            return callback("INTERNAL_SERVER_ERROR");
          else{
            console.error("Session: %s  Last Message: %d  Allowance:%d",token,last_msg,allowance);
            return callback(null,true);
          }
        });
      });
    },
    'throttleRequest':function(sessionToken,callback){
      //TODO: FIX TIME PARAMATERS -- ERROR
      client.hgetall(sessionToken,function(err,reply){
        if(err)
          return callback("INTERNAL_SERVER_ERROR");
        if(!reply)
          return callback("ERR_NOT_FOUND");
        else{
          var now = (new Date()).valueOf();
          var delta = now-reply.last_msg;
          console.error("Difference: %d",delta);
          var rate = reply.rate;
          console.error("Allowance (before): %d",reply.allowance);
          //var allowance = (reply.allowance + delta*(rate/10000))/10; 

          var allowance = parseFloat(reply.allowance);
          var tok = delta*(rate/10000);
          allowance += delta*(rate/10000);

          console.error("Allowance (after): %d",allowance);
          console.error("Rate: %d",rate);
          if(allowance > rate){
            console.error("Setting allowance to rate...");
            allowance = rate;  
          }
          if(allowance < 1.0){
            console.error("Throttle request...discarding...");
            methods.setThrottleParams(sessionToken,now,
              allowance,function(){
              return callback(null,false);
            });
          }
          else{
            console.error("Permit message...");
            allowance--;
            methods.setThrottleParams(sessionToken,now,
              allowance,function(){
              return callback(null,true);
            });
          }
        }
      });
    },
  }
    
  setInterval(function(){
    if(methods.status() != "CONNECTED"){
      console.error(methods.status());
      return;
    }
  
    client.exists("active",function(err,reply){
      if(reply == 0){
        console.error("No active sessions");
        return;
      }
      else{
        var now = new Date();
        client.zremrangebyscore("active",0,now.valueOf(),
          function(){});
        return;
      }
    });
  },config.evictionRate);
  extend(Turnstile.prototype,methods);
}
module.exports = Turnstile;
