Turnstile.js
======
Lightweight, policy-based request throttling.
---

[![Travis-CI](https://travis-ci.org/rahulsmehta/turnstile.svg?branch=integration)](https://travis-ci.org/rahulsmehta/turnstile)


Turnstile provides a lightweight request throttling service, and is framework-independent. Turnstile was developed with Express versions 4.0 and greater in mind, though it should work with any other web framework, or any other application which requires large-scale function/process throttling. Turnstile can be installed with `npm`;

	npm install turnstile
    
##Usage

First, import the Turnstile module. Then, create a new instance and connect it to Redis.

```javascript
var Turnstile = require('turnstile');
var client_t = new Turnstile(options);
client_t.connect();
```

The options object takes the following parameters (with the following defaults):

```javascript
options = {
	su: false,
	port: 6379,
	host: "localhost",
	evictionRate: 120000,
	framework: "express",
	defaultPolicy:{
		req_per_int:100,
		session_interval:10000,
		session_duration:86400000
	}
}
```

`su` - superuser: Setting this to `true` will give the Turnstile client access to the underlying connection to Redis with the `client_t.getRedisClient()` function.
`port` - the port that Turnstile will use to connect to Redis. **Warning:** Turnstile should use a separate Redis instance from any data the application depends on.
`host` - the hostname of the Redis instance for the Turnstile connection (defaults to `localhost`).
`evictionRate` - the rate at which Turnstile evicts expired session tokens from the active sessions list. At this time, support for Redis keyspace notifications is experimental; when it becomes a stable feature this functionality of Turnstile will be phased out.
`defaultPolicy` - the default policy for an API user. The default above is simply a placeholder - this parameter should be set by the organization.

The policy object takes the parameters `req_per_int` and `session_duration`.  The first parameter is used to determine the number of requests that the client can make during `session_interval`. That is, Turnstile limits the number of requests a user can make to at most `req_per_int`/`session_interval`. The units for all time parameters are in ms. `session_duration` denotes the lifespan of the session - after that many ms, the session token will expire and be evicted from the active sessions list.

The remainder of the examples will assume Express.js version 4.0 or greater. We are currently in the process of 
testing other web frameworks. 

The first API endpoint that must be exposed is one to generate a session token. The client will include the 
session token in every subsequent request to the API.

```javascript
app.get('/api/get_session_token/*',function(request,response){
	...
	// Process request
    ...
    var apiKey = client_t.getApiKey(request.path);
    client_t.genSessionToken(apiKey,{
    	'req_per_int':100,
        'session_duration':86400000
    }, function(err,reply){
		if(err) res.status(500).send("Internal server error");
		else
			res.send(200).send({
			...
			session_token = reply.session_token,
			...
			}
	});
    
});
```

The call to `genSessionToken` requires the API key, as well as a policy. This policy consists of the 
maximum number of requests that are allowed per interval, and the duration after which the session 
token will expire (in ms). Note that the client can employ more sophisticated logic when determining 
the policy.

The client can generate a new session token with the following request:

	GET /api/get_session_token/<api_key>
    

Now, for any endpoint that the client wishes to throttle requests to, simply include the session token within the request URL for any `GET`, `PUT` or `POST` request.

Though there are many methods for doing this, the suggested approach is to include the session tokenin the query string of the request.

```javascript
app.get('/api/some_resource/',function(request,response){
	...
    // Process request
    ...
    var sessionToken = client_t.sessionToken(request);
    client_t.throttleRequest(sessionToken,function(err,allow){
		if(allow)
	    	response.status(200).send(...);
	    else
	    	response.status(429)
	    	.send("Exceeded request allowance");
	});
    
});
```

This throttled endpoint could be accessed by the client with the following request:

	GET /api/some_resource?session_token=<session_token>
    
For `POST` and `PUT` requests, simply replace `app.get` with either `app.post` or `app.put`.


##API Reference
The following functions are available for an instance of Turnstile. All references to `Client` denote an instantiated Turnstile object (constructed with `new Turnstile(options)`).

 - `Client.status` - Returns `CONNECTED` or `NOT CONNECTED` depending on whether or not the Turnstile client has an active connection with Redis.
 - `Client.connect` - Connect the Turnstile client to Redis at the address specified in `options`.
 - `Client.getProp` - Get the value of the specified property from the Turnstile client. Takes parameters `propertyName` and a callback. The callback is passed parameters `err` and `reply`.
 - `Client.getPropSync` - Synchronous implementation of the above method. Takes one parameter, namely `propertyName`.
 - `Client.genSessionToken` - Generates a session token for the specified `user` with a particular `policy`. The `user` object has the fields `api_key` and `uid`, and defaults to `defaultPolicy` if not otherwise specified. The callback is passed the parameters `err` and `reply`. The session token will be exposed at `reply.session_token`.
 - `Client.getSessionInfo` - Takes parameters `session_token` and a callback. If the session token exists, `reply` will have the fields `api_key`, `uid`, `policy`, `last_msg` (time of last message received), and `ttl` (the remaining time until the session expires).
 - `Client.getActiveSessions` - Retrieve all active sessions. `reply` will have the fields `sessions`, which is an array of the active session tokens, and `num_active`, an integer field for the number of active sessions.
 - `Client.endSession` - Ends the session specified by parameter `session_token`. `reply` will be true if deletion was successful, or false if the key was not found or the deletion was unsuccessful.
 - `Client.throttleRequest` - Records the request specified by `session_token`. If the allowance is exceeded, `reply` will be `false`, and if it is permitted, will be `true`.

### Dashboard
Turnstile also provides a dashboard for users to monitor the current usage of their API, as well as a list of recently-created sessions and recent requests. Currently, it is available at `hostname:3030`. This feature is still under development, so submit an issue or a pull request with features if you wish to contribute.

## Testing
Tests for turnstile are written for the Jasmine unit testing framework. To run the tests, start
a Redis server at port `7000` by running `redis-server --port 7000`. Then, enter the `jasmine`
command to run the test suite. Jasmine is included among the dependencies in the `package.json`
file, but on some machines, it may be necessary to install it globally (this can be done
by running `npm install -g jasmine`).

**Warning!** Do not run the test suite on an instance of Redis that is storing testing or production
data for your application. As part of the teardown in the tests, the `FLUSHALL` command is executed,
flushing all the keys in the database. If you are using port `7000` for another purpose,
simply change the `PORT` parameter in `spec/index.spec.js`.

## Under the Hood

### Storage

Turnstile uses Redis, a high performance key-value store, to efficiently maintain authentication tokens
and session information about each client. The efficient tracking capabilities provided by Redis allow 
Turnstile to provide real-time information about the current load, API endpoint usage, user-by-user
breakdowns, and more.


### The Algorithm
Turnstile utilizes a "token bucket" algorithm to throttle requests. The intuition behind the approach is that
for every predetermined time step, each individual receives an additional token, which can be redeemed for
one unit of transmission (the algorithm was originally developed for enforcing bandwidth policies in the
first packet-switched computer networks, but in our case, a unit of transmission is a request to the API).

We use an implementation of the token bucket algorithm *without* queuing; that is, requests that exceed the 
allowance for a particular interval will simply be discarded, as opposed to being queued for processing
once a new interval begins. The reason for this is simple; we want the API throttling to be as transparent to
the client as possible. Therefore, to provide descriptive error messages relating to rate-limiting, requests
exceeding the limit are discarded. Additionally, if a sufficiently large quantity (i.e. a quantity greater 
than the allowance) of requests are received during an interval where the client has already exceeded the
allowance, then the queued messages would exceed the allowance for the next interval. Thus, if the client
exceeds the allowance across multiple intervals, access to the API could be limited until all requests have 
been processed.

Pseudocode of our token bucket implementation can be found below (for a more in-depth explanation of
correctness and the token bucket algorithm, check out 
[this StackOverflow post](http://stackoverflow.com/questions/667508/whats-a-good-rate-limiting-algorithm)).

```
Algorithm LimitRate(rate, duration)
01.  allowance := rate
02.  last_message := now() //Assuming UNIX convention of time since Jan. 1, 1970.
03.
04.  when message received
05.    current := now()
06.    time_passed := current-last_message
07.    last_message := current
08.    allowance := allowance + time_passed*(rate/duration)
09.    if(allowance > rate)
10.      allowance := rate //Throttle message
11.    if(allowance < 1.0)
12. 	 discard message
13.    else
14.      forward message
15.      allowance := allowance - 1
```

This is a standard implementation of the token bucket algorithm. Line 7 is an optimization for adding one
token to the bucket every `(rate/duration)` seconds. Note that the allowance is capped by `rate`; that is, 
even if a session token is generated and no requests to the API are made for a long period of time, the 
maximum number of requests that can be made "at once" is still limited by `rate`.
