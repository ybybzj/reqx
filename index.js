var makeBuilder = require('js-liber/fn/build');
var t = require('js-liber/type');
var pick = require('js-liber/l/pick');
var http = require('http');
var https = require('https');
var url = require('url');
var BPromise = require('bluebird');
var assert = require('js-liber/assert');
var extend = require('js-liber/extend');
var qs = require('querystring');
var pump = require('pump');
var concatStream = require('concat-stream');
var slice = require('js-liber/slice');
var isStream = require('isstream');
var debug = require('debug')('reqx');

var HTTP_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head'
  //...
];

var reqx = makeBuilder(sendRequest, {
  '?options': t.isObject,
  '?uri': function(uri) {
    return t.isString(uri) || t.isObject(uri);
  },
  '?sendType': [function(type) {
    return ['html', 'xml', 'text', 'form', 'json'].indexOf(type) > -1;
  }, 'form'],
  '?redirect': [function(r) {
    return t.isBoolean(r) || t.isNumber(r);
  }, false],
  '?method': [function(m) {
    return t.isString(m) && HTTP_METHODS.indexOf(m.toLowerCase()) > -1;
  }, 'get'],
  '?headers': t.isObject,
  '?agent': function(a) {
    return a instanceof http.Agent || a instanceof https.Agent || a === false;
  },
  '?timeout': t.isNumber,
  //options for ssl
  '?pfx': isStrOrBuffer,
  '?key': isStrOrBufferArr,
  '?passphrase': t.isString,
  '?cert': isStrOrBufferArr,
  '?ca': isStrOrBufferArr,
  '?ciphers': t.isString,
  '?rejectUnauthorized': t.isBoolean,
  '?secureProtocol': t.isString,
  '?servername': t.isString
}, {
  fnName: 'reqx',
  alias: {
    build: 'send'
  }
});

reqx = makeBuilder.mixin(reqx, HTTP_METHODS.reduce(function(mixins, method) {
  var mname = method === 'delete' ? 'del' : method;

  mixins[mname] = function $http_method(uri) {
    return this.method(method).uri(uri);
  };
  return mixins;
}, {}));

reqx = makeBuilder.mixin(reqx, {
  setHeader: function(key, value) {
    var headers = this.headers() || {};
    headers[key] = value;
    return this.headers(headers);
  }
});

module.exports = reqx;



function sendRequest(options, data, reqxBuilder) {
  var dataParam = data;
  var redirect = normalizeRedirect(options.redirect);
  var _tmp = normalizeOptions(options, data);
  var requestOptions = _tmp[0];
  data = _tmp[1];
  var requestFn = requestOptions.protocol === 'https:' ? https.request.bind(https) : http.request.bind(http);
  var sendType = requestOptions.sendType;
  var clientRequest, promise;

  delete requestOptions.sendType;

  debug('requestOptions: %j', requestOptions);

  clientRequest = requestFn(requestOptions);

  promise = new BPromise(function(resolve, reject) {
    clientRequest.on('response', function(response) {
      if (response) {
        return resolve(response);
      }
      reject(new Error('[reqx]empty response!'));
    });


    if (!isStream.isReadable(data)) {
      data = streamFrom(stringifyByType(sendType, data));
    }

    pump(data, clientRequest, function(err) {
      if (err) reject(err);
    });
  });

  clientRequest.response = handleRedirect(clientRequest, promise, redirect, dataParam, reqxBuilder);

  extendClinetRequest(clientRequest);

  return clientRequest;
}


function handleRedirect(request, responsePromise, redirect, data, reqx) {
  if (redirect <= 0) {
    return responsePromise;
  }

  reqx.redirect(redirect - 1);

  return responsePromise.then(function(res) {
    if (isRedirect(res.statusCode)) {
      debug('redirect to => %s', res.headers.location);
      return reqx.uri(res.headers.location).send(data).response;
    } else {
      return res;
    }
  });
}

function extendClinetRequest(crq) {
  extend(crq, {
    onResponse: function(fn) {
      return crq.response.then(fn);
    },
    _getPumpedQPromise: function() {
      if (!crq._pumpPromise) {
        crq._pumpPromise = this.onResponse(function(res) {
          return [res, []];
        });
      }

      return crq._pumpPromise;
    },
    pump: function( /*ws,..*/ ) {
      var wss = slice(arguments, 0);
      if (t.isArray(wss[0])) {
        wss = wss[0];
      }

      crq._pumpPromise = crq._getPumpedQPromise().then(function(pair) {
        var res = pair[0],
          pumpedQ = pair[1];
        var ss = wss.map(function(ws) {
          return isStream(ws) ? ws : ws(res);
        });

        pumpedQ = pumpedQ.concat(ss);
        return [res, pumpedQ];
      });
      return crq;
    },
    collect: function(collector) {
      return crq._getPumpedQPromise().then(function(pair) {
        var res = pair[0],
          pumpedQ = pair[1];
        collector = t.isFunction(collector) ? collector(res) : collector;
        return new BPromise(function(resolve, reject) {
  
          var collectWs =  isStream.isWritable(collector) ? collector :
            concatStream(function(body) {
              var rtn = {
                statusCode: res.statusCode,
                response: res,
                body: body
              };

              resolve(rtn);
            });

          var pipeline = makePipeline(res, pumpedQ, collectWs);

          pump(pipeline, function(err) {
            if (err) return reject(err);
            return resolve();
          });
        });
      });
    }
  });
  return crq;
}

//helpers
function isStrOrBuffer(o) {
  return t.isString(o) || Buffer.isBuffer(o);
}

function isStrOrBufferArr(o) {
  return isStrOrBuffer(o) ||
    (t.isArray(o) && (
      o.every(isStrOrBuffer)
    ));
}

function normalizeRedirect(redirect) {
  if (t.isBoolean(redirect)) {
    return redirect === true ? 10 : 0;
  }
  return redirect < 0 ? 0 : redirect;
}

function normalizeOptions(options, data) {
  var requestOptions;

  if (t.isObject(options.options)) {
    requestOptions = options.options;
  } else {
    var uriObj = t.isString(options.uri) ? url.parse(options.uri) : options.uri;
    assert(t.isObject(uriObj), '[reqx]invalid uri option! Given: ' + options.uri);

    var uriOpts = pick(['protocol', 'host', 'hostname', 'port', 'path'], uriObj);

    var restOptsKeys = uriOpts.protocol === ':https' ? ['sendType', 'method', 'headers', 'agent', 'timeout', 'pfx', 'key', 'passphrase', 'cert', 'ca', 'ciphers', 'rejectUnauthorized', 'secureProtocol', 'servername'] : ['sendType', 'method', 'headers', 'agent', 'timeout'];
    var restOpts = pick(restOptsKeys, options);

    if (needSendData(restOpts.method)) {
      var headers = {};
      headers['Content-Type'] = getReqCTypeStr(restOpts.sendType);
      if (restOpts.sendType === 'json') {
        headers['Accept'] = "application/json, text/*";
      }
      restOpts.headers = extend({}, headers, restOpts.headers);
    }
    requestOptions = extend({}, uriOpts, restOpts);
  }

  if (!needSendData(requestOptions.method)) {
    var pathObj = url.parse(requestOptions.path);
    var searchStr = (pathObj.query ? (pathObj.query + '&') : '') + qs.stringify(data);
    searchStr = searchStr ? ('?' + searchStr) : '';
    pathObj.search = searchStr;
    requestOptions.path = url.format(pathObj);
    data = '';
  }

  return [requestOptions, data];

}


function getReqCTypeStr(type) {

  return {
    'html': 'text/html',
    'xml': 'application/xml',
    'text': 'text/*',
    'form': 'application/x-www-form-urlencoded; charset=utf-8',
    'json': 'application/json; charset=utf-8'
  }[type];
}

function stringifyByType(type, o) {
  if (t.isString(o)) {
    return o;
  }

  if (o == null) {
    return '';
  }

  if (type === 'json') {
    return JSON.stringify(o);
  }

  return qs.stringify(o);
}

function needSendData(method) {
  method = method.toLowerCase();
  return method === 'post' || method === 'put' || method === 'patch';
}

var from = require('from2');

function streamFrom(data) {
  return from(function(size, next) {
    if (data.length <= 0) {
      return next(null, null);
    }

    var chunk = data.slice(0, size);
    data = data.slice(size);
    next(null, chunk);
  });
}

function isWritableOnly(s) {
  return isStream.isWritable(s) && !isStream.isReadable(s);
}

function makePipeline(res, pumpedQ, collectWs) {
  var result = [res];
  var i, l = pumpedQ.length,
    pumped;
  for (i = 0; i < l; i++) {
    pumped = pumpedQ[i];

    if (isWritableOnly(pumped)) {
      collectWs = pumped;
      break;
    } else {
      result.push(pumped);
    }
  }

  result.push(collectWs);

  return result;
}

function isRedirect(statusCode) {
  return statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308;
}

// if (require.main === module) {
//   var through = require('through2');
//   var request = reqx.get('https://www.google.com').redirect(true).send();

//   var strThrough = through();
//   strThrough.setEncoding('utf8');

//   request.pump(strThrough).collect()
//     .then(function(result){
//       return result.response.headers;
//     })
//     .then(console.log.bind(console))
//     .catch(console.log.bind(console));


//   // request.abort();
// }

// if(require.main === module){
//   var through = require('through2');
//   var fs = require('fs');
//   var request = reqx.get('https://www.google.com').redirect(true).send().pump(through(), through()).collect(fs.createWriteStream(__dirname + '/out')).then(console.log.bind(console, 'reqx finished!'));
// }
