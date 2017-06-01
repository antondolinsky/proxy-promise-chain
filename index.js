module.exports = function(promise, func) {
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
          return proxy;
        };
      }
    }
  });
};