function MemoryBroker() {
  var currentId = 0;
  var maxInt = 9007199254740992;

  this.subscribers = {};

  function nextId() {
    var next = currentId;

    if (++currentId == maxInt) {
      currentId = 0;
    }

    return next;
  }

  this.publish = function(channel, event, data) {
    var subs = this.subscribers[channel];
    if (subs) {
      for (var id in subs) {
        subs[id](event, data);
      }
    }
  };

  this.subscribe = function(channel, callback) {
    if (!this.subscribers[channel]) {
      this.subscribers[channel] = {};
    }

    var id = nextId();
    this.subscribers[channel][id] = callback;

    return id;
  };

  this.unsubscribe = function(id, channel) {
    var subs = this.subscribers[channel];
    if (subs) {
      delete subs[id];
      if (subs.length == 0) {
        delete this.subscribers[channel];
      }
    }
  };
}

function ServerSentEvents(options) {
  this.broker = (options || { }).broker || (new MemoryBroker());

  this.stream = function stream(channel, req, res) {
    req.socket.setTimeout(Infinity);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'max-age=0, no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive'
    });

    res.write('\n');

    var id = this.broker.subscribe(channel, function(event, data) {
      var payload = JSON.stringify(data);
      payload = 'data: ' + payload.split('\n').join('\ndata: ');

      res.write('event: ' + event + '\n');
      res.write(payload + '\n\n');
    });

    var self = this;
    req.socket.on('close', function() {
      if (id != null) {
        self.broker.unsubscribe(id, channel);
        id = null;
      }
    });
  };

  this.publish = function publish(channel, event, data) {
    this.broker.publish(channel, event, data);
  };
}

module.exports = ServerSentEvents;
