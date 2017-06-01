#Chainable Async Interfaces Using Promises and Proxies

##Install
```
$ npm install proxy-promise-chain
```

##The objective

Sometimes it is convenient to be able to use the chaining style of code that is, for example, common in jQuery:  
```javascript
$('.someclass')
  .attr('someattr', 3)
  .html('somecontent')
  .appendTo(someElement)
```  
Each new function call returns a version of the same interface, so the calls can be chained. However, this does not work well with asynchronous code, since each function runs as soon as the previous one has returned.  
The chaining style can of course also be done asynchronously by using Promises. Let's say that *promise* is some promise. Then we can write:  
```javascript
promise
  .then(function() { ... })
  .then(function() { ... })
  .then(function() { ... })
```
We can continue to add new calls to `then` as much as necessary. But if we want to chain promises like this, we have to always use `then` as the function call, and we always have to pass in a function to `then`, and we have to return a new Promise each time from `then`.
It would be convenient if we could chain arbitrary function calls, pass in arbitrary arguments, and ensure that the chained functions could each do asynchronous execution, with the next function in the chain only running when the previous ones had completed.  
It would be nice, in other words, to be able to do something like the following:  
```javascript
makechain(...)
  .someFuncThatDoesAsyncStuff(...some args...)
  .someOtherFuncThatDoesAsyncStuff(...some args...)
  .thirdFunc(...some args...)
```
The following code aims to achieve this by wrapping a Promise in an interface that returns a Proxy. (So, of course, a Promise and Proxy-supporting JS environment is required.)  

##Main code

```javascript
function chain(promise, func, returnValueHandler) {
  if (! promise) {
    promise = new Promise(function(next) {
      next();
    });
  }
  return new Proxy({}, {
    get: function(state, key, proxy) {
      if (key === '') {
        return promise;
      } else {
        return function() {
          var callArgs = Array.prototype.slice.call(arguments);
          promise = promise.then(function() {
            var prevArgs = Array.prototype.slice.call(arguments);
            return new Promise(function(next) {
              func({
                next: next,
                prevArgs: prevArgs,
                callArgs: callArgs,
                key: key,
                state: state,
                promise: promise,
                proxy: proxy
              });
            });
          });
          var rvhResult;
          if (returnValueHandler) {
            rvhResult = returnValueHandler({
              prevArgs: prevArgs,
              callArgs: callArgs,
              key: key,
              state: state,
              promise: promise,
              proxy: proxy
            });
          }
          if (rvhResult) {
            return rvhResult.returnValue;
          } else {
            return proxy;
          }
        };
      }
    }
  });
};
```

##How it works

##Example: MySQL interface

This example is designed to run in Node and uses Felix Geisendörfer's [mysql](https://www.npmjs.com/package/mysql) module.

```javascript
var chain = require('proxy-promise-chain');
var mysql = require('mysql');

/* Setting up mysql handler that will use a chainable 
async interface */

var mysqlhandler = (function() {
  var methods = {
    setup: function(args) {
      var setupArgs = args.callArgs[0];
      args.state.pool = mysql.createPool(setupArgs);
      args.state.queryResults = {};
      args.next();
    },
    query: function(args) {
      var queryArgs = args.callArgs[0];
      function done(err, results) {
        args.state.queryResults[queryArgs.name] = err || results;
        args.next();
      };
      args.state.pool.getConnection(function(err, connection) {
        if (err) {
          done(err);
        } else {
          var query = connection.query({
            sql: queryArgs.sql
          }, done);
        }
      });
    },
    get: function(args) {
      var cb = args.callArgs[0];
      cb(args.next, args.state.queryResults);
    }
  };
  return function(setupArgs) {
    return chain(null, function(args) {
      methods[args.key](args)
    }).setup(setupArgs);
  };
})();

/* Now making an instance of the mysqlhandler and using it 
(If you are trying out this code, change the provided database 
connection settings - such as user, password, etc. - if necessary) */

var handler = mysqlhandler({
  host: '127.0.0.1',
  user: 'test',
  password: 'test',
  port: 3306,
  poolNumber: 10
}).query({
  name: 'query_1',
  sql: 'CREATE DATABASE testdatabase'
}).query({
  name: 'query_2',
  sql: 'CREATE TABLE testdatabase.testtable (testfield TEXT)'
}).query({
  name: 'query_3',
  sql: 'INSERT INTO testdatabase.testtable SET testfield = "sometext"'
}).query({
  name: 'query_4',
  sql: 'SELECT * FROM testdatabase.testtable'
}).query({
  name: 'query_5',
  sql: 'DROP DATABASE testdatabase'
}).get(function(next, queryResults) {
  /* queryResults will be an object with the query 'names' as 
  keys and the query results as values */
  console.log(queryResults);
  process.exit();
});
```

##Example: Using the chain with async/await

The chain can be used with `async`/`await` (or with generators). Reading the empty string property from the proxy returned by a chain returns the promise internal to the chain. This is designed so that the promise can then be given to an `await` statement (or, if using a generator, to a `yield` statement. [Note: `async`/`await` is only available on the more recent Node versions.]

```javascript
var chain = require('proxy-promise-chain');

var p = chain(null, function(args) {
  var key = args.key;
  var waitTime = args.callArgs[0];
  console.log('function named', key, 
    'has been called with first argument', waitTime);
  setTimeout(function() {
    args.next(key);
  }, waitTime);
});

/* p is now a chain instance */

(async function() {
  p.func_one(1000).func_two(2000).func_three(500);
  var await_1 = await p['']; /* p[''] returns the promise internal to 'p' */
  console.log('The last func called was named:', await_1);
  p.func_four(4000).func_five(300);
  var await_2 = await p[''];
  console.log('The last func called was named:', await_2);
})();
```