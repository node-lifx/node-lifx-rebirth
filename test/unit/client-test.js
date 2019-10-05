'use strict';

const Client = require('../../').Client;
const Light = require('../../').Light;
const Packet = require('../../').Packet;
const constants = require('../../').constants;
const assert = require('chai').assert;
const lolex = require('lolex');
const sinon = require('sinon');

describe('Client', () => {
  let client;
  let clock;
  const getMsgQueueLength = (queueAddress) => {
    return client.getMessageQueue(queueAddress).length;
  };
  const getDeviceCount = () => {
    return Object.keys(client.devices).length;
  };

  const lightProps = {
    client: client,
    id: 'f37a4311b857',
    address: '192.168.0.1',
    port: constants.LIFX_DEFAULT_PORT,
    seenOnDiscovery: 0
  };

  beforeEach(() => {
    client = new Client();
    client.devices.f37a4311b857 = new Light(lightProps);
  });

  afterEach(() => {
    client.destroy();
  });

  it('not connected by default', () => {
    assert.isNull(client.address());
  });

  it('connected after init', (done) => {
    client.init({}, () => {
      assert.isObject(client.address());
      assert.property(client.address(), 'address');
      assert.property(client.address(), 'port');
      done();
    });
  });

  it('accepts init parameters', (done) => {
    client.init({
      address: '127.0.0.1',
      port: 65535,
      source: '12345678',
      lightOfflineTolerance: 2,
      messageHandlerTimeout: 12000,
      resendPacketDelay: 200,
      resendMaxTimes: 2,
      lights: ['192.168.0.100'],
      broadcast: '192.168.0.255',
      sendPort: 65534,
      stopAfterDiscovery: true
    }, () => {
      assert.equal(client.address().address, '127.0.0.1');
      assert.equal(client.address().port, 65535);
      assert.equal(client.source, '12345678');
      assert.equal(client.lightOfflineTolerance, 2);
      assert.equal(client.messageHandlerTimeout, 12000);
      assert.equal(client.resendPacketDelay, 200);
      assert.equal(client.resendMaxTimes, 2);
      assert.equal(client.broadcastAddress, '192.168.0.255');
      assert.equal(client.sendPort, 65534);
      assert.equal(client.stopAfterDiscovery, true);
      assert.deepEqual(client.lightAddresses, ['192.168.0.100']);
      done();
    });
  });

  it('init parameters of wrong types throw exception', () => {
    assert.throw(() => {
      client.init({port: '57500'});
    }, TypeError);

    assert.throw(() => {
      client.init({port: -1});
    }, RangeError);

    assert.throw(() => {
      client.init({port: 65536});
    }, RangeError);

    assert.throw(() => {
      client.init({source: 23456789});
    }, TypeError);

    assert.throw(() => {
      client.init({source: 'Test'});
    }, RangeError);

    assert.throw(() => {
      client.init({lightOfflineTolerance: '3'});
    }, TypeError);

    assert.throw(() => {
      client.init({messageHandlerTimeout: '30000'});
    }, TypeError);

    assert.throw(() => {
      client.init({debug: 'true'});
    }, TypeError);

    assert.throw(() => {
      client.init({resendPacketDelay: '200'});
    }, TypeError);

    assert.throw(() => {
      client.init({resendMaxTimes: '2'});
    }, TypeError);

    assert.throw(() => {
      client.init({lights: {lights: '192.168.0.100'}});
    }, TypeError);

    assert.throw(() => {
      client.init({lights: '192.168.0.100'});
    }, TypeError);

    assert.throw(() => {
      client.init({lights: ['192.168.0.100'], stopAfterDiscovery: 'false'});
    }, TypeError);

    assert.throw(() => {
      client.init({lights: ['::1']});
    }, TypeError);

    assert.throw(() => {
      client.init({broadcast: '::1'});
    }, TypeError);

    assert.throw(() => {
      client.init({broadcast: ['255.255.255.255']});
    }, TypeError);

    assert.throw(() => {
      client.init({sendPort: '57500'});
    }, TypeError);

    assert.throw(() => {
      client.init({sendPort: 0});
    }, RangeError);

    assert.throw(() => {
      client.init({sendPort: 65536});
    }, RangeError);
  });

  it('inits with random bind port by default', (done) => {
    client.init({
      startDiscovery: false
    }, () => {
      assert.equal(client.address().address, '0.0.0.0');
      assert.notEqual(client.address().port, constants.LIFX_DEFAULT_PORT);
      assert.isAtLeast(client.address().port, 1024);
      assert.isAtMost(client.address().port, 65535);
      assert.equal(client.port, 0);
      assert.equal(client.sendPort, constants.LIFX_DEFAULT_PORT);
      done();
    });
  });

  it('inits with random source by default', (done) => {
    client.init({
      startDiscovery: false
    }, () => {
      assert.typeOf(client.source, 'string');
      assert.lengthOf(client.source, 8);
      done();
    });
  });

  it('discovery start and stop', (done) => {
    client.init({
      startDiscovery: false
    }, () => {
      assert.isNull(client.discoveryTimer);
      client.startDiscovery();
      assert.isObject(client.discoveryTimer);
      client.stopDiscovery();
      assert.isNull(client.discoveryTimer);
      done();
    });
  });

  it('discovery packet processing', () => {
    const discoveryMessage = {
      size: 41,
      addressable: true,
      tagged: false,
      origin: true,
      protocolVersion: 1024,
      source: '0c583dd9',
      target: 'd073d5006d72',
      site: 'LIFXV2',
      ackRequired: false,
      resRequired: false,
      sequence: 0,
      type: 'stateService',
      service: 'udp',
      port: 56700
    };
    const discoveryInfo = {
      address: '192.168.2.108',
      family: 'IPv4',
      port: 56700,
      size: 41
    };
    const queueAddress = discoveryInfo.address;

    let currDeviceCount = getDeviceCount();
    let currMsgQueCnt = getMsgQueueLength(queueAddress);
    client.processDiscoveryPacket(new Error(), null, null);
    client.processDiscoveryPacket(null, {
      service: 'udp',
      port: 8080
    }, null);
    assert.equal(currDeviceCount, getDeviceCount(), 'malformed packages ignored');
    assert.equal(currMsgQueCnt, getMsgQueueLength(queueAddress), 'malformed packages ignored');

    client.processDiscoveryPacket(null, discoveryMessage, discoveryInfo);
    assert.equal(getDeviceCount(), currDeviceCount + 1, 'device added');
    currDeviceCount += 1;
    assert.equal(getMsgQueueLength(queueAddress), currMsgQueCnt + 1, 'label request done');
    currMsgQueCnt += 1;

    // Set to offline for recovery check
    client.devices[discoveryMessage.target].status = 'off';
    client.processDiscoveryPacket(null, discoveryMessage, discoveryInfo);
    assert.equal(client.devices[discoveryMessage.target].status, 'on');
    assert.equal(currDeviceCount, getDeviceCount(), 'no new devices but known updated');
    assert.equal(currMsgQueCnt, getMsgQueueLength(queueAddress), 'no new messages');
  });

  it('finding bulbs by different parameters', () => {
    const bulbs = [];
    let bulb;

    bulb = new Light({
      client: client,
      id: '0dd124d25597',
      address: '192.168.0.8',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulb.status = 'off';
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: 'ad227d95517z',
      address: '192.168.254.254',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulb.label = 'Living room';
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: '783rbc67cg14',
      address: '192.168.1.5',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 2
    });
    bulb.label = 'Ceiling. Upstairs.';
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: '883rbd67cg15',
      address: 'FE80::903A:1C1A:E802:11E4',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 2
    });
    bulb.label = 'Front: 🚪Door';
    bulbs.push(bulb);

    client.devices = bulbs;

    let result;
    result = client.light('0dd124d25597');
    assert.instanceOf(result, Light);
    assert.equal(result.address, '192.168.0.8');

    result = client.light('FE80::903A:1C1A:E802:11E4');
    assert.instanceOf(result, Light);
    assert.equal(result.id, '883rbd67cg15');

    result = client.light('192.168.254.254');
    assert.instanceOf(result, Light);
    assert.equal(result.id, 'ad227d95517z');

    result = client.light('Living room');
    assert.instanceOf(result, Light);
    assert.equal(result.id, 'ad227d95517z');

    result = client.light('Front: 🚪Door');
    assert.instanceOf(result, Light);
    assert.equal(result.id, '883rbd67cg15');

    result = client.light('141svsdvsdv1');
    assert.isFalse(result);

    result = client.light('Front: Door');
    assert.isFalse(result, 'don\'t omit utf8');

    result = client.light('living room');
    assert.isFalse(result, 'case sensitive search');

    result = client.light(lightProps.address);
    assert.isFalse(result);

    result = client.light('7812e9zonvwouv8754179410ufsknsuvsif724581419713947');
    assert.isFalse(result);

    assert.throw(() => {
      client.light({id: '0123456789012'});
    }, TypeError);

    assert.throw(() => {
      client.light(['12a135r25t24']);
    }, TypeError);
  });

  it('adding packages to the sending queue', (done) => {
    client.init({
      startDiscovery: false
    }, () => {
      assert.equal(client.sequenceNumber, 0, 'starts sequence with 0');
      assert.lengthOf(client.getMessageQueue(), 0, 'is empty');
      client.send(Packet.create('getService', {}, '12345678'));
      assert.equal(client.sequenceNumber, 0, 'sequence is the same after broadcast');
      assert.lengthOf(client.getMessageQueue(), 1, 'added to message queue');
      assert.property(client.getMessageQueue()[0], 'data', 'has data');
      assert.notProperty(client.getMessageQueue()[0], 'address', 'broadcast has no target address');

      client.send(Packet.create('setPower', {level: 65535, duration: 0, target: lightProps.id}, '12345678'));
      assert.equal(client.sequenceNumber, 1, 'sequence increased after specific targeting');

      client.sequenceNumber = constants.PACKET_HEADER_SEQUENCE_MAX;
      client.send(Packet.create('setPower', {level: 65535, duration: 0, target: lightProps.id}, '12345678'));
      assert.equal(client.sequenceNumber, 0, 'sequence starts over after maximum');
      done();
    });
  });

  it('getting all known lights', () => {
    const bulbs = [];
    let bulb;

    bulb = new Light({
      client: client,
      id: '0dd124d25597',
      address: '192.168.0.8',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: '783rbc67cg14',
      address: '192.168.0.9',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulb.status = 'off';
    bulbs.push(bulb);

    client.devices = bulbs;
    assert.deepEqual(client.lights(''), bulbs);

    assert.deepEqual(client.lights(), [bulbs[0]]);
    assert.deepEqual(client.lights('on'), [bulbs[0]]);

    assert.deepEqual(client.lights('off'), [bulbs[1]]);

    assert.throw(() => {
      client.lights(true);
    }, TypeError);

    assert.throw(() => {
      client.lights('true');
    }, TypeError);
  });

  it('changing debugging mode', () => {
    assert.throw(() => {
      client.setDebug('true');
    }, TypeError);

    assert.equal(client.debug, false, 'debug off by default');

    client.setDebug(true);
    assert.equal(client.debug, true);

    client.setDebug(false);
    assert.equal(client.debug, false);
  });

  describe('message handler', () => {
    beforeEach(() => {
      clock = lolex.install(Date.now());
    });

    afterEach(() => {
      clock.uninstall();
    });

    it('discovery handler registered by default', () => {
      assert.lengthOf(client.messageHandlers, 3);
      assert.equal(client.messageHandlers[0].type, 'stateService');
      assert.equal(client.messageHandlers[1].type, 'stateLabel');
      assert.equal(client.messageHandlers[2].type, 'stateLight');
    });

    it('adding valid handlers', () => {
      const prevMsgHandlerCount = client.messageHandlers.length;
      client.addMessageHandler('stateLight', () => {}, 1);
      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'message handler has been added');
      assert.equal(client.messageHandlers[prevMsgHandlerCount].type, 'stateLight', 'correct handler type');
      assert.equal(client.messageHandlers[prevMsgHandlerCount].timestamp / 1000, Date.now() / 1000, 'timestamp set to now');
    });

    it('adding invalid handlers', () => {
      assert.throw(() => {
        client.addMessageHandler('stateLight', () => {}, '1');
      }, TypeError);
      assert.throw(() => {
        client.addMessageHandler(14, () => {});
      }, TypeError);
      assert.throw(() => {
        client.addMessageHandler('statePower', {});
      }, TypeError);
      assert.throw(() => {
        client.addMessageHandler('unknownPacket', () => {}, 1);
      }, RangeError);
    });

    it('calling and removing one time handlers after call', (done) => {
      let mustBeFalse = false;
      const prevMsgHandlerCount = client.messageHandlers.length;

      client.addMessageHandler('statePower', () => { // random name
        mustBeFalse = true; // Was falsely triggered
      }, 2);
      client.addMessageHandler('stateLight', () => { // random name
        mustBeFalse = true; // Was falsely triggered
      }, 1);
      client.addMessageHandler('statePower', (err, msg, rinfo) => { // same as first name
        assert.isNull(err, 'no error');
        assert.isObject(msg);
        assert.isObject(rinfo);
        assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 2, 'this handler has been removed');
        assert.equal(mustBeFalse, false, 'incorrect handlers not called');
        done();
      }, 1);
      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 3, 'handler has been added');

      // emit a fake message, rinfo is not relevant for fake
      client.processMessageHandlers({
        type: 'statePower',
        sequence: 1,
        source: client.source
      }, {});
    });

    it('keeping permanent handlers after call', (done) => {
      const prevMsgHandlerCount = client.messageHandlers.length;
      client.addMessageHandler('statePower', (err, msg, rinfo) => {
        assert.isNull(err, 'no error');
        assert.isObject(msg);
        assert.isObject(rinfo);
        done(); // Make sure callback is called
      });
      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler has been added');

      // emit a fake message, rinfo is not relevant for fake
      client.processMessageHandlers({type: 'statePower', source: client.source}, {});

      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler is still present');
    });

    it('calling and removing packets with sequenceNumber, after messageHandlerTimeout', (done) => {
      const prevMsgHandlerCount = client.messageHandlers.length;
      const messageHandlerTimeout = 30000; // Our timeout for the test

      client.init({
        startDiscovery: false,
        messageHandlerTimeout: messageHandlerTimeout
      }, () => {
        client.addMessageHandler('statePower', (err, msg, rinfo) => {
          assert.instanceOf(err, Error, 'error was thrown');
          assert.isNull(msg);
          assert.isNull(rinfo);
          assert.lengthOf(client.messageHandlers, prevMsgHandlerCount, 'handler should be removed after timeout');
          done();
        }, 2);
        assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler has been added');

        // Instant
        client.processMessageHandlers({type: 'someRandomHandler', source: client.source}, {});
        assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler should still exist after instant call');

        // Short before messageHandlerTimeout
        clock.setTimeout(() => {
          client.processMessageHandlers({type: 'someRandomHandler', source: client.source}, {});
          assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler should still exist before timeout');
        }, messageHandlerTimeout - 1);

        // Directly after messageHandlerTimeout
        clock.setTimeout(() => {
          // This will trigger the message handler callback after timeout
          client.processMessageHandlers({type: 'someRandomHandler', source: client.source}, {});
        }, messageHandlerTimeout + 1);

        clock.tick(messageHandlerTimeout - 1);
        clock.tick(messageHandlerTimeout + 1);
      });
    });
  });

  describe('sending process', () => {
    beforeEach(() => {
      clock = lolex.install(Date.now());
    });

    afterEach(() => {
      clock.uninstall();
    });

    it('with no meesages in queue', (done) => {
      const shouldNotBeCalled = () => {
        throw new Error();
      };
      const queueAddress = client.broadcastAddress;

      client.init({
        startDiscovery: false
      }, () => {
        client.socket.on('message', shouldNotBeCalled);
        client.sendingProcess(queueAddress);
        assert.isUndefined(client.sendTimers[queueAddress]);
        client.socket.removeListener('message', shouldNotBeCalled);
        done();
      });
    });

    it('with new single one way packet in queue', (done) => {
      const packetSendCallback = (msg, rinfo) => {
        if (msg === undefined || rinfo === undefined) {
          throw new Error();
        }
        done();
      };
      const packetObj = Packet.create('setPower', {level: 65535}, client.source);
      const queueAddress = client.broadcastAddress;

      client.init({
        port: constants.LIFX_DEFAULT_PORT,
        startDiscovery: false
      }, () => {
        client.socket.on('message', packetSendCallback);
        let currMsgQueCnt = getMsgQueueLength(queueAddress);
        client.send(packetObj);
        assert.equal(getMsgQueueLength(queueAddress), currMsgQueCnt + 1, 'sends a packet to the queue');
        currMsgQueCnt += 1;
        assert.isDefined(client.sendTimers[queueAddress]);
        client.stopSendingProcess(); // We don't want automatic calling of sending

        const sendingProcess = client.sendingProcess(queueAddress);
        sendingProcess(); // Call sending it manualy

        assert.equal(getMsgQueueLength(queueAddress), currMsgQueCnt - 1, 'removes the packet when send');
        currMsgQueCnt -= 1;
      });
    });

    it('with a new request and response packet in queue', (done) => {
      const packetSendCallback = (msg, rinfo) => {
        if (msg === undefined || rinfo === undefined) {
          throw new Error();
        }
        done();
      };
      const packetObj = Packet.create('setPower', {level: 65535}, client.source);
      const queueAddress = client.broadcastAddress;

      client.init({
        port: constants.LIFX_DEFAULT_PORT,
        startDiscovery: false
      }, () => {
        client.socket.on('message', packetSendCallback);

        let currMsgQueCnt = getMsgQueueLength(queueAddress);
        client.send(packetObj, () => {});
        assert.equal(getMsgQueueLength(queueAddress), currMsgQueCnt + 1, 'sends a packet to the queue');
        currMsgQueCnt += 1;
        assert.isDefined(client.sendTimers[queueAddress]);
        client.stopSendingProcess(); // We don't want automatic calling of sending

        const sendingProcess = client.sendingProcess(queueAddress);
        sendingProcess(); // Call sending it manualy

        assert.equal(getMsgQueueLength(queueAddress), currMsgQueCnt, 'keeps packet when send');
      });
    });

    it('with a max retried request and response packet in queue', (done) => {
      const shouldNotBeSendCallback = () => {
        throw new Error();
      };
      const handlerTimeoutCallback = (err, msg, rinfo) => {
        assert.isNotNull(err);
        assert.isNull(msg);
        assert.isNull(rinfo);
        done();
      };
      const packetObj = Packet.create('setPower', {level: 65535}, client.source);
      const queueAddress = client.broadcastAddress;

      client.init({
        startDiscovery: false
      }, () => {
        client.socket.on('message', shouldNotBeSendCallback);

        let currMsgQueCnt = getMsgQueueLength(queueAddress);
        client.send(packetObj, handlerTimeoutCallback);
        assert.equal(getMsgQueueLength(queueAddress), currMsgQueCnt + 1, 'sends a packet to the queue');
        currMsgQueCnt += 1;
        assert.isDefined(client.sendTimers[queueAddress]);
        client.stopSendingProcess(); // We don't want automatic calling of sending
        client.getMessageQueue(queueAddress)[0].timesSent = client.resendMaxTimes; // This triggers error

        const sendingProcess = client.sendingProcess(queueAddress);
        sendingProcess(); // Call sending it manualy

        assert.equal(getMsgQueueLength(queueAddress), currMsgQueCnt - 1, 'removes packet after max retries and callback');
        currMsgQueCnt -= 1;
      });
    });

    it('stops discovery after predefined lights found when stopAfterDiscovery is true', (done) => {
      const discoveryMessage = {
        size: 41,
        addressable: true,
        tagged: false,
        origin: true,
        protocolVersion: 1024,
        source: '0c583dd9',
        target: 'd073d5006d72',
        site: 'LIFXV2',
        ackRequired: false,
        resRequired: false,
        sequence: 0,
        type: 'stateService',
        service: 'udp',
        port: 56700
      };
      const discoveryInfo = {
        address: '192.168.2.108',
        family: 'IPv4',
        port: 56700,
        size: 41
      };
      const discoveryMessage2 = Object.assign({}, discoveryMessage, {sequence: 1});
      const discoveryInfo2 = Object.assign({}, discoveryInfo, {address: '192.168.2.200'});
      const labelPacket = {
        target: 'd073d5006d72',
        label: 'test'
      };
      const discoveryCompletedCallback = sinon.spy();

      client.on('discovery-completed', discoveryCompletedCallback);
      client.init({
        startDiscovery: false,
        lights: ['192.168.2.108'],
        stopAfterDiscovery: true
      }, () => {
        client.processDiscoveryPacket(null, discoveryMessage, discoveryInfo);
        client.processLabelPacket(null, labelPacket);
        client.processDiscoveryPacket(null, discoveryMessage2, discoveryInfo2);

        assert.isTrue((discoveryCompletedCallback.called));
        done();
      });
    });
  });
});
