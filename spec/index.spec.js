var Turnstile = require('../index.js'),
    spawn = require('child_process').spawn,
//    waitAndRun = require('./wait_run.js').waitAndRun;
    t = null,
    p_redis = null,
    PORT = 7000;

var waitAndRun = function(escapeFunction, runFunction, escapeTime) {
  // check the escapeFunction every millisecond so as soon as it is met we can escape the function
  var interval = setInterval(function() {
    if (escapeFunction()) {
      clearMe();
      runFunction();
    }
  }, 1);

  // in case we never reach the escapeFunction, we will time out
  // at the escapeTime
  var timeOut = setTimeout(function() {
    clearMe();
    runFunction();
  }, escapeTime);

  // clear the interval and the timeout
  function clearMe(){
    clearInterval(interval);
    clearTimeout(timeOut);
  }
};

describe("Creates instance and connects to db",function(){
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
  it("creates Turnstile instance",function(){
    t = new Turnstile({'su':true,'port':PORT});
    expect(t).not.toBeNull();
  });
  it("connects to redis at port "+PORT,function(){
    t.connect();
    expect(t.status()).toEqual("CONNECTED");
  });
});

describe("Teardown",function(){
  it("kills redis at port "+PORT,function(){
    expect(p_redis).not.toBeNull();
    p_redis.kill('SIGINT');
  });
});
