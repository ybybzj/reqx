# reqx
>A lite wrapper of http(s).request that's stream-friendly, inspired by [hyperquest](https://github.com/substack/hyperquest).

`reqx` implements a chainable api like [superagent](https://github.com/visionmedia/superagent), and supports redirect following.

## Install

```sh
$ npm install --save reqx
```

## Usage

Instead of accepting a single options argument like official http(s).request method dose, reqx basically converts each option key to an api method that returns the reqx object itself so they can be chainable.

As a result, every options in [official node documentation](https://nodejs.org/dist/latest-v6.x/docs/api/http.html#http_http_request_options_callback) is supported, except that you can use `uri` method to pass in a valid uri string to avoid pass in `protocol`, `host`, `hostname`, `path` and `port` individually. Besides that, there also are common http method apis that spare you to use `method` option api, such as `get`, `post`, `put`,`del`,`patch` and `head`.

Use `send` method to initiate a request, and a wrapped [http.ClientRequest](https://nodejs.org/dist/latest-v6.x/docs/api/http.html#http_class_http_clientrequest) instance is returned, which exports several methods to work with streams conveniently.

### wrapped clientRequest's api

#### pump

accepts duplex streams or writable stream

it returns the clientRequest instance itself for chaining invocation, and does not consume those streams until `collect` method is invoked.

#### collect

can accept a collector function as argument. This function is return a writable stream to collect stream data.

#### onResponse

if you want to mannually process response([http.IncomingMessage](https://nodejs.org/dist/latest-v6.x/docs/api/http.html#http_class_http_incomingmessage)), use this api method to pass in a callback that accepts the response instance. The callback is only called after `clientRequest` emits the `response` event.

### Example
```js
var reqx = require('reqx');

reqx.get('https://www.google.com').send().collect().then(function(body){
  console.log(body);
});

reqx.get('https://www.baidu.com').pump(process.stdout).collect();

//request json

var concat = require('concat-stream');

reqx
  .post('http://api/getById')
  .headers({
    'Authorization': 'xxxx'
  })
  .send({
    id: xxx
  })
  .collect(function(res, done, onErr){
    var ws = concat(function(body){
      if(res.statusCode < 400){
        return done(JSON.parse(body));
      }
      onErr({
        statusCode: res.statusCode,
        headers: res.headers,
        body: body
      })
    });
    ws.setEncoding('utf8');
    return ws;
  })
  .then(function(result){
    
    console.log(result);
  })
```
