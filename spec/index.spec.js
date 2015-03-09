var Turnstile = require('../index.js'),
    spawn = require('child_process').spawn,
    t = null,
    p_redis = null,
    redis_client = null,
    PORT = 7000,
    EVICTION_RATE = 2000,
    _env = "";

var util = {
  'waitAndRun':function(escapeFunction, runFunction, escapeTime) {
    var interval = setInterval(function() {
      if (escapeFunction()) {
        clearMe();
        runFunction();
      }
    }, 1);
    var timeOut = setTimeout(function() {
      clearMe();
      runFunction();
    }, escapeTime);
    function clearMe(){
      clearInterval(interval);
      clearTimeout(timeOut);
    }
  },
  'user':function(uid,key){
    var user = {};
    user['uid'] = uid;
    user['api_key'] = key || "TEST_KEY"+(Math.floor(Math.random()*1000));
    return user;
  },
  'policy':{'req_per_int':100,'session_interval':10000,'session_duration':86400000},
}


describe("Create test instance",function(){
/*  _env = process.env.NODE_ENV || "development";

  if(_env == "development"){
    describe("Start redis-server",function(){
      it("checks environment variables",function(){
        expect(_env).toEqual("development");
      });
    });

    it("starts redis at port "+PORT,function(){
      var is_success = null;

      p_redis = spawn('redis-server',['--port '+PORT]);
      p_redis.stdout.on('data',function(data){
        var _data = data.toString('utf8');
        is_success = (_data.indexOf("The server is now ready to "+
            "accept connections on port "+PORT) != -1);
      });
      p_redis.on('error',function(){is_success = false;});

      util.waitAndRun(function(){
        return is_success != null;
      },function(){
        expect(is_success).toBe(true);
      },500)
    });
  }*/


  it("creates Turnstile instance",function(){
    t = new Turnstile({'su':true,'port':PORT,'evictionRate':EVICTION_RATE});
    expect(t).not.toBeNull();
  });
  it("connects to redis at port "+PORT,function(){
    t.connect();
    expect(t.status()).toEqual("CONNECTED");
  });
  it("gets redis client for later",function(){
    redis_client = t.getRedisClient();
    expect(redis_client).not.toBeNull();
  });
  it("flushes all keys from redis at port "+PORT,function(done){
    redis_client.flushall(function(err,reply){
      expect(err).not.toBeTruthy();
      expect(reply).toEqual("OK");
      done();
    });
  });
});

describe("Test property retreival",function(){
  it("retreives test configuration (sync)",function(){
    var test_config = {};
    test_config['port'] = t.getPropSync('port');
    test_config['host'] = t.getPropSync('host');
    test_config['evictionRate'] = t.getPropSync('evictionRate');
    test_config['su'] = t.getPropSync('su');

    expect(test_config['port']).toEqual(PORT);
    expect(test_config['host']).toEqual("localhost");
    expect(test_config['evictionRate']).toEqual(EVICTION_RATE);
    expect(test_config['su']).toBe(true);

  });
  it("retrieves port (async)",function(done){
    t.getProp('port',function(err,reply){
      expect(err).toBeNull();
      expect(reply).toEqual(PORT);
      done();
    });
  });

  it("retrieves host (async)",function(done){
    t.getProp('host',function(err,reply){
      expect(err).toBeNull();
      expect(reply).toEqual("localhost");
      done();
    });
  });

  it("retrieves eviction rate (async)",function(done){
    t.getProp('evictionRate',function(err,reply){
      expect(err).toBeNull();
      expect(reply).toEqual(EVICTION_RATE);
      done();
    });
  });

  it("retrieves superuser (async)",function(done){
    t.getProp('su',function(err,reply){
      expect(err).toBeNull();
      expect(reply).toBe(true);
      done();
    });
  });
});

describe("Test token generation and session info",function(){
  var reply_tokens = [];

  it("generates a session token and gets info (success)",function(done){
    var user = util.user("test_user","TEST_KEY");
    var policy = util.policy;
    var session_token = null;
    t.genSessionToken(user,policy,function(err,reply){
      session_token = reply.session_token;
      expect(session_token).not.toBeNull();
      t.getSessionInfo(session_token,function(err,reply){
        expect(err).toBeNull();

        expect(reply.api_key).toEqual("TEST_KEY");
        expect(reply.uid).toEqual("test_user");
        expect(reply.ttl).toBeGreaterThan(0);

        expect(reply.last_msg).not.toBe(undefined); 
        expect(reply.last_msg).toBeGreaterThan(0);

        t.endSession(session_token,function(err,deleted){
          expect(deleted).toBe(true);
          done();
        });
      });
    });
  });
  it("gets session token info (fail)",function(done){
    var session_token = "FAIL";
    t.getSessionInfo(session_token,function(err,reply){
      expect(err).not.toBeNull();
      expect(err).toEqual("ERR_NOT_FOUND");
      expect(reply).toBeFalsy();
      done();
    });
  });
  it("generates a bunch of tokens",function(done){
    var tokens = 0;
    var policy = util.policy;
    for(var i = 0; i < 10; i++){
      var user = util.user("test_user"+(i+1));
      t.genSessionToken(user,policy,function(err,reply){
        reply_tokens.push(reply.session_token);
        tokens++;
        return;
      });
    }
    util.waitAndRun(function(){
      return tokens == 10;
    },function(){
      t.getActiveSessions(function(err,reply){
        expect(err).toBeNull();
        expect(reply.num_active).toEqual(10);
        done();
      });
    },10000);
  });

  it("gets active sessions (10)",function(done){
    t.getActiveSessions(function(err,reply){
      expect(err).toBeNull();
      expect(reply.num_active).toEqual(10);
      reply.sessions.forEach(function(item){
        expect(item.length).toEqual(15);
        expect(reply_tokens.indexOf(item)).not.toEqual(-1);
      });
      done();
    });
  });

  it("ends active sessions (10)",function(done){
    t.endSession(reply_tokens,function(err,reply){
      expect(reply).toBe(true);
      done();
    });
  });

});

describe("Test throttling",function(){
  var sessionToken = null;
  it("generates a session token",function(done){
    var policy = {'req_per_int':2,'session_interval':10000,'session_duration':10000};
    t.genSessionToken(util.user("test_user","TEST_KEY"),policy,
      function(err,reply){
      expect(err).toBe(null);
      expect(reply).toBeTruthy();
      sessionToken = reply.session_token;
      expect(sessionToken.length).toEqual(15);
      done();
    });
  });

  it("makes multiple requests on token",function(done){
    var count = [0,0];
    var id = setInterval(function(){
      t.throttleRequest(sessionToken,function(err,reply){
        if(reply) count[0]++;
        else count[1]++;
      });
    },100);
    util.waitAndRun(function(){
      return (count[0]+count[1] >= 10);
    },function(){
      expect(count[0]/count[1]).toBeLessThan(0.3);
      done();
    },10000);
  });

  it("ends the session",function(done){
    t.endSession(sessionToken,function(err,reply){
      expect(err).toBe(null);
      expect(reply).toBeTruthy();
      done();
    });
  });
});

describe("Test expired key eviction",function(){
  var sessionToken = null;
  it("creates a session token with 2s lifespan",function(done){
    var policy = {'req_per_int':2,'session_interval':10000,'session_duration':2000};
    t.genSessionToken(util.user('test_user',"TEST_KEY"),policy,
      function(err,reply){
      expect(err).toBe(null);
      expect(reply).toBeTruthy();
      sessionToken = reply.session_token;
      expect(sessionToken.length).toEqual(15);
      done();
    });
  });

  it("checks to see if key is active after 3s",function(done){
    setTimeout(function(){
      t.getActiveSessions(function(err,reply){
        expect(err).toBe(null);
        expect(reply).toBeTruthy();
        expect(reply.num_active).toEqual(0);
        done();
      });
    },3000);
  });
});

describe("Teardown",function(){
  it("checks redis client stability (expect no keys)",function(done){
    redis_client.keys("*",function(err,reply){
      expect(err).toBe(null);
      expect(reply.length).toEqual(0);
      done();
    });
  });
  it("flushes keys from redis at port "+PORT,function(done){
    redis_client.flushall(function(err,reply){
      expect(err).not.toBeTruthy();
      expect(reply).toEqual("OK");
      done();
    });
  });
});
