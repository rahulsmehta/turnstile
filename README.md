Turnstile.js
======
Lightweight, policy-based request throttling.
---

![Travis-CI](https://travis-ci.org/rahulsmehta/turnstile.svg?branch=integration)


Turnstile provides a lightweight request throttling service, and is framework-independent. Turnstile was developed with Express versions 4.0 and greater in mind, though it should work with any other web framework, or any other application which requires large-scale function/process throttling. Turnstile can be installed with `npm`;

	npm install turnstile
    
##Usage

First, import the Turnstile module.

```javascript
var client_t = require('turnstile');
```

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
    var sessionToken = client_t.genSessionToken(apiKey,{
    	'req_per_int':100,
        'session_duration':86400000
    });
    ...
    response.status(200).send(JSON.stringify({
    	...
        'session_token':sessionToken,
        ...
    }));
});
```

The call to `genSessionToken` requires the API key, as well as a policy. This policy consists of the 
maximum number of requests that are allowed per interval, and the duration after which the session 
token will expire (in ms). Note that the client can employ more sophisticated logic when determining 
the policy.

The client can generate a new session token with the following request:

	GET /api/get_session_token/<api_key>
    

Now, for any endpoint that the client wishes to throttle requests to, simply include the session token
within the request URL for any `GET` request, and in the request body for any `POST` or `PUT` request.

Though there are many methods for doing this, the suggested approach is to include the session token
in the query string of the request.

```javascript
app.get('/api/some_resource/',function(request,response){
	...
    // Process request
    ...
    var sessionToken = client_t.sessionToken(request);
    var allow = client_t.throttleRequest(sessionToken);
    ...
    if(allow)
    	response.status(200).send(...);
    else
    	response.status(429).send("Exceeded request allowance");
});
```

This throttled endpoint could be accessed by the client with the following request:

	GET /api/some_resource?session_token=<session_token>
    
For `POST` and `PUT` requests, the following will throttle an endpoint with the session token.

```javascript
app.post('/api/some_other_resource',function(request,response){
	...
    // Process request
    ...
    var sessionToken = client_t.sessionToken(request);
    var allow = client_t.throttleRequest(sessionToken);
    ...
    if(allow)
    	response.status(200).send(...);
    else
    	response.status(429).send("Exceeded request allowance");
});
```
A request to this endpoint could look like;

	POST /api/some_other_resource?session_token=<session_token>

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







