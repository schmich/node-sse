var assert = require('chai').assert;
var url = require('url');
var request = require('request');
var express = require('express');
var http = require('http');

var ServerSentEvents = require('../index');
var sse = new ServerSentEvents();

var port = process.env.PORT || 3001;
var app = express();
app.use(express.json());

app.get('/stream/:id', function(req, res) {
  var streamId = req.params.id;
  sse.stream(streamId, req, res);
});

app.post('/stream/:id', function(req, res) {
  var streamId = req.params.id;
  var event = req.body.event;
  var data = req.body.data;
  sse.publish(req.params.id, event, data);
});

before(function(done) {
  http.createServer(app).listen(port, done);
});

function parseEvent(buffer) {
  var event = { };
  var dataBuffer = '';

  var lines = buffer.split('\n');
  for (var i = 0; i < lines.length; ++i) {
    var line = lines[i];
    if (line.trim()) {
      var separator = line.indexOf(':');
      if (separator >= 0) {
        var key = line.substring(0, separator).trim();
        var value = line.substring(separator + 1).trim();
        if (key == 'event') {
          event.event = value;
        } else if (key == 'retry') {
          event.retry = value;
        } else if (key == 'data') {
          dataBuffer += value;
        }
      }
    }
  }

  event.data = dataBuffer;
  
  return event;
}

function streamEvents(streamId, callback) {
  var res = request.get('http://localhost:3001/stream/' + streamId);

  var eventBuffer = '';
  res.on('data', function(data) {
    eventBuffer += data.toString();
    var endIndex;
    do {
      endIndex = eventBuffer.indexOf('\n\n');
      if (endIndex >= 0) {
        var eventData = eventBuffer.substring(0, endIndex + 1);
        callback(parseEvent(eventData), function() {
          res.req.socket.destroy();
        });
        eventBuffer = eventBuffer.substring(endIndex + 1);
      }
    } while (endIndex >= 0);
  });
}

function publishEvent(streamId, event, data) {
  var json = {
    event: event,
    data: data
  };
  request.post('http://localhost:3001/stream/' + streamId, { json: json });
}

function assertEvents(streamId, expectedEvents, done) {
  var index = 0;
  streamEvents(streamId, function(incomingEvent, close) {
    var expectedEvent = expectedEvents[index];
    assert.equal(incomingEvent.event, expectedEvent.event);
    var data = JSON.parse(incomingEvent.data);
    assert.deepEqual(data, expectedEvent.data);
    if (++index == expectedEvents.length) {
      close();
      done();
    }
  });
}

describe('Server-sent events', function() {
  it('emits events with simple data', function(done) {
    assertEvents('foo', [{ event: 'simple', data: 42 }], done);
    publishEvent('foo', 'simple', 42);
  });
  it('emits multiple events in one stream', function(done) {
    assertEvents('foo', [
      { event: 'one', data: 1 },
      { event: 'two', data: 2 }
    ], done);
    publishEvent('foo', 'one', 1);
    publishEvent('foo', 'two', 2);
  });
  it('emits complex JSON objects', function(done) {
    assertEvents('foo', [{ event: 'complex', data: { a: 1, b: 2 } }], done);
    publishEvent('foo', 'complex', { a: 1, b: 2 });
  });
  it('emits data with newlines ', function(done) {
    assertEvents('foo', [{ event: 'newlines', data: { text: 'foo\n\n\nbar' } }], done);
    publishEvent('foo', 'newlines', { text: 'foo\n\n\nbar' });
  });
  it('emits data to exclusive channels', function(done) {
    var doneCount = 0;
    var allDone = function() {
      if (++doneCount == 2) {
        done();
      }
    };
    assertEvents('foo', [{ event: 'one', data: 1 }], allDone);
    assertEvents('bar', [{ event: 'two', data: 2 }], allDone);
    publishEvent('foo', 'one', 1);
    publishEvent('bar', 'two', 2);
  });
  it('emits data to multiple connections', function(done) {
    var doneCount = 0;
    var allDone = function() {
      if (++doneCount == 3) {
        done();
      }
    };
    assertEvents('foo', [{ event: 'one', data: 1 }], allDone);
    assertEvents('foo', [{ event: 'one', data: 1 }], allDone);
    assertEvents('foo', [{ event: 'one', data: 1 }], allDone);
    publishEvent('foo', 'one', 1);
  });

  // id tests
  // retry tests
  // custom broker tests
  // client library tests
});
