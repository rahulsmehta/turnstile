var redis = require('redis'),
    SHA256 = require('crypto-js/sha256'),
    extend = require('extend'),
    url = require('url');

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
        return callback(config[propName]);
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
      if(uid) client.hset([token,"uid",user.uid],function(){});
      client.hset([token,"policy",JSON.stringify(policy)],function(){});
      client.hset([token,"allowance",policy.req_per_int],function(){});


      var duration = policy.session_duration || 
        config.defaultPolicy['session_duration'];

      client.zadd("active",(new Date()).valueOf()+duration,token,function(){});

      client.pexpire(token,duration,
          function(_err,reply){
            console.log("Generated new session token for %s: %s",display,token);
            return callback({'api_key':user.api_key,'session_token':token});
          });
    },
    'getSessionInfo': function(sessionToken,callback){
      client.exists(sessionToken,function(err,reply){
        if(reply == 1){
          response = {};
          client.hget([sessionToken,"api_key"],function(err,reply){
            response['api_key'] = reply;
            client.hget([sessionToken,"uid"],function(err,_reply){
              if(!_reply)
                return callback(null,response);
              else{
                response['uid'] = _reply;
                return callback(null,response);
              }
            });
          });
        }
        else if(reply == 0)
          return callback("ERR_NOT_FOUND",null);
      });
    },
    'getActiveSessions':function(callback){
      client.exists("active",function(err,reply){
        if(err)
          return callback("INTERNAL_SERVER_ERROR"+err);
        if(reply == 0)
          return callback(null,"NO_ACTIVE_SESSIONS");
        else if(reply == 1){
          client.zrange(["active",0,-1],function(err,reply){
            if(err)
              return callback("INTERNAL_SERVER_ERROR"+err);
            else{
              response = [];
              reply.forEach(function(item){
                response.push(item);
              });
              return callback(null,response);
            }
          }); 
        }
      });
    },
  }
    

  extend(Turnstile.prototype,methods);

}

module.exports = Turnstile;



