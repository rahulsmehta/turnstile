var Turnstile = require('../index.js'),
    spawn = require('child_process').spawn,
//    waitAndRun = require('./wait_run.js').waitAndRun;
    t = null,
    p_redis = null,
    PORT = 7000;

var waitAndRun = function(escapeFunction, runFunction, escapeTime) {
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
};

describe("Create test instance",function(){
  var _env = process.env.NODE_ENV || "development";

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

      waitAndRun(function(){
        return is_success != null;
      },function(){
        expect(is_success).toBe(true);
      },500)
    });
  }

  it("creates Turnstile instance",function(){
    t = new Turnstile({'su':true,'port':PORT});
    expect(t).not.toBeNull();
  });
  it("connects to redis at port "+PORT,function(){
    t.connect();
    expect(t.status()).toEqual("CONNECTED");
  });
});

describe("Test property retreival",function(){
  it("retreives test configuration (sync)",function(){
    var test_config = {};
    test_config['port'] = t.getPropSync('port');
    test_config['host'] = t.getPropSync('host');
    test_config['evictionRate'] = t.getPropSync('evictionRate');
    test_config['su'] = t.getPropSync('su');

    expect(test_config['port']).toEqual(7000);
    expect(test_config['host']).toEqual("localhost");
    expect(test_config['evictionRate']).toEqual(120000);
    expect(test_config['su']).toBe(true);

  });
  it("retrieves port (async)",function(done){
    t.getProp('port',function(err,reply){
      expect(err).toBeNull();
      expect(reply).toEqual(7000);
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
      expect(reply).toEqual(120000);
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

describe("Generate tokens",function(){
  it("generates a session token and gets info (success)",function(done){
    var user = {'uid':'test_user','api_key':'TEST_KEY'};
    var policy = {'req_per_int':100,'session_duration':86400000};
    var session_token = null;
    t.genSessionToken(user,policy,function(reply){
      session_token = reply.session_token;
      expect(session_token).not.toBeNull();
      t.getSessionInfo(session_token,function(err,reply){
        expect(err).toBeNull();
        expect(reply.api_key).toEqual("TEST_KEY");
        expect(reply.uid).toEqual("test_user");
        expect(reply.ttl).toBeGreaterThan(0);
        done();
      });
    });
  });
});

describe("Teardown",function(){
  it("kills redis at port "+PORT,function(){
    expect(p_redis).not.toBeNull();
    p_redis.kill('SIGINT');
  });
});
