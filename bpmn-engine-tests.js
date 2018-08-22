/* eslint-env mocha */
import { Bpmn } from 'meteor/cquencial:bpmn-engine';
import { assert } from 'meteor/practicalmeteor:chai';
import { Random } from 'meteor/random';
import {Meteor} from 'meteor/meteor'

const { EventEmitter } = require('events');

const processXml = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <userTask id="userTask" />
    <endEvent id="theEnd" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="userTask" />
    <sequenceFlow id="flow2" sourceRef="userTask" targetRef="theEnd" />
  </process>
</definitions>`;

const processWithUserTask = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <userTask id="userTask" />
    <endEvent id="theEnd" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="userTask" />
    <sequenceFlow id="flow2" sourceRef="userTask" targetRef="theEnd" />
  </process>
</definitions>`;

const Events = {
  start: 'start',
  enter: 'enter',
  end: 'end',
  wait: 'wait',
  leave: 'leave',
  taken: 'taken',
  cancel: 'cancel',
  error: 'error',
  discarded: 'discarded',
};

describe('bpmn-engine', function () {
  beforeEach(function () {
    Bpmn.hooks.clear();
  });

  const isDefined = function (target, expectedType) {
    assert.isDefined(target);
    assert.isTrue(typeof target === expectedType);
  };

  // //////////////////////////////////////////////////////////////////////////////////////
  //
  //  ORIGINAL API
  //
  // //////////////////////////////////////////////////////////////////////////////////////

  describe('Bpmn.Events definitions', function () {
    it('has a top level definition of all event types', function () {
      assert.equal(Bpmn.Events.start, 'start');
      assert.equal(Bpmn.Events.enter, 'enter');
      assert.equal(Bpmn.Events.end, 'end');
      assert.equal(Bpmn.Events.taken, 'taken');
      assert.equal(Bpmn.Events.discarded, 'discarded');
      assert.equal(Bpmn.Events.leave, 'leave');
      assert.equal(Bpmn.Events.wait, 'wait');
      assert.equal(Bpmn.Events.error, 'error');
    });
  });

  describe('Override constructor new Engine', function () {
    it('does not break the original api', function () {
      isDefined(Bpmn.Engine, 'function');
      isDefined(Bpmn.Engine.resume, 'function');

      const engine = new Bpmn.Engine({ source: processXml });
      isDefined(engine.getState, 'function');
      isDefined(engine.getState(), 'object');

      isDefined(engine.getDefinition, 'function');
      isDefined(engine.getDefinitions, 'function');
      isDefined(engine.getDefinitionById, 'function');
      isDefined(engine.getPendingActivities, 'function');
    });

    it('does not affect default behavior', function (done) {
      const engine = new Bpmn.Engine({ source: processXml });
      assert.isTrue(engine instanceof EventEmitter);
      engine.on('end', () => {
        done();
      });

      const waitListener = new EventEmitter();
      waitListener.on('wait', (element) => {
        element.signal();
      });
      engine.execute({ listener: waitListener });
    });

    it('has an instanceId auto generated', function () {
      const engine = new Bpmn.Engine({ source: processXml });
      isDefined(engine.instanceId, 'string');
    });

    it('allows to pass in a custom instanceId via options', function () {
      const instanceId = Random.id();
      const engine = new Bpmn.Engine({
        source: processXml,
        instanceId,
      });
      assert.equal(engine.instanceId, instanceId);
    });

    it('has a default empty set of extensions', function () {
      const engine = new Bpmn.Engine({ source: processXml });
      isDefined(engine.extensions, 'object');
      assert.equal(Object.keys(engine.extensions).length, 0);
    });

    it('allows to pass in local extension', function () {
      const hooksObj = {
        foo: 'bar',
      };

      const engine = new Bpmn.Engine({ source: processXml, hooks: hooksObj });
      isDefined(engine.extensions, 'object');
      assert.deepEqual(engine.extensions, hooksObj);
    });
  });

  // //////////////////////////////////////////////////////////////////////////////////////
  //
  //  COLLECTION
  //
  // //////////////////////////////////////////////////////////////////////////////////////

  describe('Bpmn.processes', function () {

    it('processes.register registers a new process on instantiation', function () {
      const insertDoc = {
        instanceId: Random.id(),
        source: Random.id(),
        isResume: true,
      }

      const registeredId = Bpmn.processes.register(insertDoc)
      const registeredDoc = Bpmn.processes.collection.findOne(registeredId)

      assert.equal(registeredDoc.state, Bpmn.States.started)
      assert.equal(registeredDoc.instanceId, insertDoc.instanceId)
      assert.equal(registeredDoc.source, insertDoc.source)
      assert.equal(registeredDoc.isResume, insertDoc.isResume)
    })

    it('processes.updateState updates the state of the current process', function () {
      const insertDoc = {
        instanceId: Random.id(),
        source: Random.id(),
        isResume: true,
      }

      const registeredId = Bpmn.processes.register(insertDoc)

      Bpmn.processes.updateState(insertDoc.instanceId, Bpmn.States.waiting)
      const registeredDoc = Bpmn.processes.collection.findOne(registeredId)


      assert.equal(registeredDoc.state, Bpmn.States.waiting)
      assert.equal(registeredDoc.instanceId, insertDoc.instanceId)
      assert.equal(registeredDoc.source, insertDoc.source)
      assert.equal(registeredDoc.isResume, insertDoc.isResume)
    })

    it('process.updateState - started, running, waiting, completed', function (done) {
      const engineOptions = {
        source: processWithUserTask,
      };


      const engine = new Bpmn.Engine(engineOptions);
      const instanceId = engine.instanceId

      const processDocStart = Bpmn.processes.collection.findOne({instanceId})
      assert.equal(processDocStart.state, Bpmn.States.started)

      const waitListener = new EventEmitter()
      waitListener.on('wait', Meteor.bindEnvironment((element) => {
        Meteor._sleepForMs(200)
        const processDocWaiting = Bpmn.processes.collection.findOne({instanceId})
        assert.equal(processDocWaiting.state, Bpmn.States.waiting)
        element.signal()
      }))

      engine.on('end', Meteor.bindEnvironment(() => {
        Meteor._sleepForMs(200)
        const processDocEnd = Bpmn.processes.collection.findOne({instanceId})
        assert.equal(processDocEnd.state, Bpmn.States.complete)
        done()
      }))

      engine.execute({ listener: waitListener })
    })

    it('processes.updateState - stopped, resume', function (done) {
      const engineOptions = {
        source: processWithUserTask,
      };

      const engine = new Bpmn.Engine(engineOptions);
      const instanceId = engine.instanceId
      let state;

      const waitListener = new EventEmitter();
      waitListener.on('wait', Meteor.bindEnvironment(() => {
        Meteor._sleepForMs(150)
        state = engine.getState();
        engine.stop()
      }))

      engine.on('end', () => {
        Meteor._sleepForMs(450)
        const processDocStopped = Bpmn.processes.collection.findOne({instanceId})
        assert.equal(processDocStopped.state, Bpmn.States.stopped)
        Bpmn.Engine.resume(state, {instanceId}, (err, res) => {
          done();
        });

      });

      engine.execute({ listener: waitListener });
    });
  })

  // //////////////////////////////////////////////////////////////////////////////////////
  //
  //  HOOKS
  //
  // //////////////////////////////////////////////////////////////////////////////////////

  describe('Engine hooks', function () {
    let beforeFlag;
    let afterFlag;
    let hookOptions;


    beforeEach(function () {
      beforeFlag = false;
      afterFlag = false;
      hookOptions = {
        foo: 'bar',
      };
    });

    const unexpectedErr = new Error('unexpected code reach');

    const createErrorHook = function (functionName, done) {
      return {
        [`on${functionName}Before`]: () => {
          done(unexpectedErr);
        },
        [`on${functionName}After`]: () => {
          done(unexpectedErr);
        },
      };
    };

    const createHook = function (functionName, done) {
      return {
        [`on${functionName}Before`]: (engineFct, options) => {
          isDefined(engineFct, 'function');
          const engine = engineFct();

          if (functionName !== 'Resume') {
            assert.isTrue(engine instanceof EventEmitter);
            isDefined(engine.instanceId, 'string');
          }

          // specific tests
          if (functionName === 'Stop') {
            assert.isFalse(!!engine.stopped);
          }

          isDefined(options, 'object');

          assert.isFalse(afterFlag);
          assert.isFalse(beforeFlag);
          beforeFlag = true;
        },

        [`on${functionName}`]: (engineFct, options) => {
          isDefined(engineFct, 'function');
          const engine = engineFct();

          assert.isTrue(engine instanceof EventEmitter);
          isDefined(engine.instanceId, 'string');
          isDefined(options, 'object');

          if (functionName !== 'Resume') { assert.isTrue(beforeFlag); }
          assert.isFalse(afterFlag);
        },

        [`on${functionName}After`]: (engineFct, options) => {
          isDefined(engineFct, 'function');
          const engine = engineFct();

          assert.isTrue(engine instanceof EventEmitter);
          isDefined(engine.instanceId, 'string');

          // specific tests
          if (functionName === 'Stop') { assert.isTrue(!!engine.stopped); }

          isDefined(options, 'object');

          if (functionName !== 'Resume') { assert.isTrue(beforeFlag); }
          assert.isFalse(afterFlag);
          afterFlag = true;
          done();
        },

        testErr() {
          done(new Error('unexpected to call hooks that are not following naming conventions'));
        },
      };
    };

    const testHook = function ({
      done, hookName, local, global,
    }) {
      if (global && !local) {
        Bpmn.hooks.add('test', createHook(hookName, done));
      }

      if (global && local) {
        Bpmn.hooks.add('test', createErrorHook(hookName, done));
      }

      const instanceId = Random.id();
      const engineOptions = {
        source: processWithUserTask,
        instanceId,
      };

      if (local) { engineOptions.hooks = { test: createHook(hookName, done) }; }

      const engine = new Bpmn.Engine(engineOptions);
      let state;

      const waitListener = new EventEmitter();
      waitListener.on('wait', () => {
        state = engine.getState();
        engine.stop(local || global ? hookOptions : undefined);
      });

      engine.on('end', () => {
        const resumeOptions = { instanceId };
        if (local) { resumeOptions.hooks = { test: createHook(hookName, done) }; }
        Bpmn.Engine.resume(state, resumeOptions);
      });

      engine.execute({ listener: waitListener });
    };

    ['Execute', 'Stop', 'Resume'].forEach((hookName) => {
      describe(hookName, function () {
        it('with global hooks', function (done) {
          testHook.call(this, {
            done, hookName, local: false, global: true,
          });
        });

        it('with local hooks', function (done) {
          testHook.call(this, {
            done, hookName, local: true, global: false,
          });
        });

        it('with local hooks override global hooks', function (done) {
          testHook.call(this, {
            done, hookName, local: true, global: true,
          });
        });
      });
    });

    it('allows hooks to alter the options object if present', function (done) {
      const instanceId = Random.id();
      const engineOptions = {
        source: processWithUserTask,
        instanceId,
      };

      engineOptions.hooks = {
        test: {
          onExecuteBefore(engine, options) {
            const waitListener = new EventEmitter();
            waitListener.on('wait', () => {
              done();
            });
            options.listener = waitListener;
          },
        },
      };

      const engine = new Bpmn.Engine(engineOptions);
      engine.execute({});
    });

    it('executes as like the default engine if running without hooks', function (done) {
      const engineOptions = {
        source: processWithUserTask,
      };

      const instanceId = Random.id();
      const engine = new Bpmn.Engine(engineOptions);
      let state;

      const waitListener = new EventEmitter();
      waitListener.on('wait', () => {
        state = engine.getState();
        engine.stop();
      });

      engine.on('end', () => {
        Bpmn.Engine.resume(state, { instanceId }, (err, res) => {
          assert.equal(res.instanceId, instanceId);
          done();
        });
      });

      engine.execute({ listener: waitListener });
    });

    it('throws on resume if no instanceId is passed', function (done) {
      const engineOptions = {
        source: processWithUserTask,
      };

      const engine = new Bpmn.Engine(engineOptions);
      let state;

      const waitListener = new EventEmitter();
      waitListener.on('wait', () => {
        state = engine.getState();
        engine.stop();
      });

      engine.on('end', () => {
        assert.throws(function () {
          Bpmn.Engine.resume(state, {}, (err, res) => {});
        });
        done();
      });

      engine.execute({ listener: waitListener });
    });
  });

  describe('Bpmn.mergeListeners', function () {
    it('is defined as top level api functon', function () {
      isDefined(Bpmn.mergeListeners, 'function');
    });

    const listenersTotalCount = function (emitter) {
      const evts = Object.keys(emitter._events);
      let count = 0;
      evts.forEach((key) => {
        const event = emitter._events[key];
        count += (typeof event === 'function') ? 1 : event.length;
      });
      return count;
    };

    it('copies all event listeners from a source to a target', function () {
      const allEvents = {
        event1: 'event1',
        event2: 'event2',
      };
      const source = new EventEmitter();
      source.on(allEvents.event1, () => {});
      source.on(allEvents.event2, () => {});

      const target = new EventEmitter();
      target.on(allEvents.event2, () => {});

      const expectedLength = listenersTotalCount(source) + listenersTotalCount(target);
      const merged = Bpmn.mergeListeners({ source, target });

      assert.equal(listenersTotalCount(merged), expectedLength);

      const allKeys = Object.keys(merged._events);
      allKeys.forEach((key) => {
        assert.isDefined(allEvents[key]);
      });
    });

    it('throws error if source and target are both undefined', function () {
      assert.throws(function () {
        Bpmn.mergeListeners({});
      });
      assert.throws(function () {
        Bpmn.mergeListeners();
      });
    });
  });

  describe('Bpmn.createListeners', function () {
    const checkCreateListeners = function (opts) {
      const events = [];
      const options = opts;
      const callbackFct = (element, instance, event) => {
        if (events.indexOf(event) === -1) { events.push(event); }
      };
      const listener = Bpmn.createListeners(callbackFct, options);

      const sourceEvents = listener._events;
      const sourceEventKeys = Object.keys(sourceEvents);

      const eventsMap = Object.assign({}, Events);

      if (options) {
        if (options.target) delete options.target;
        Object.keys(options).forEach((key) => {
          const value = options[key];
          if (value === false) {
            delete eventsMap[key];
          }
        });
      }

      assert.equal(sourceEventKeys.length, Object.keys(eventsMap).length);

      sourceEventKeys.forEach((sourceEventKey) => {
        assert.isDefined(eventsMap[sourceEventKey]);
      });

      return listener;
    };

    it('is defined as top level api functon', function () {
      isDefined(Bpmn.createListeners, 'function');
    });

    it('creates a listener to engine every event by default', function () {
      checkCreateListeners({});
    });

    it('can attach the listeners to a given target', function () {
      const target = new EventEmitter();
      target.id = 'targetEmitterId';

      const listener = checkCreateListeners({ target });
      assert.equal(target.id, listener.id);
    });

    it('throws an error if a target is given but null', function () {
      assert.throws(function () {
        checkCreateListeners({ target: null });
      });
    });

    it('throws an erorr if the given target is not an EventEmitter', function () {
      assert.throws(function () {
        checkCreateListeners({ target: {} });
      });
    });

    it('allows to prevent from listening to some or all types of events', function () {
      const muted = {};
      Object.keys(Events).forEach((key) => {
        muted[key] = false;
      });
      checkCreateListeners(muted);
    });
  });


  describe('stress tests', function () {
    it('handles recurring stop/resume ping-pong', function (done) {
      this.timeout(5000);

      let engine;
      let resumeStateLocal;
      let count = 0;

      const maxPingPong = 10;
      const instanceId = Random.id();

      const waitListener = new EventEmitter();
      waitListener.on('wait', Meteor.bindEnvironment(() => {
        Meteor._sleepForMs(50);
        resumeStateLocal = engine.getState();
        engine.stop();
      }));

      function pong() {
        Meteor._sleepForMs(50);

        count += 1;
        if (count < maxPingPong) {
          Meteor._sleepForMs(50);
          ping({ listener: waitListener }); // eslint-disable-line no-use-before-define
        } else {
          done();
        }
      }

      function ping({ listener, prevent }) {
        engine = Bpmn.Engine.resume(resumeStateLocal, { instanceId, prevent, listener });
        engine.on('end', Meteor.bindEnvironment(pong));
      }

      // INIT PING PONG
      engine = new Bpmn.Engine({ source: processWithUserTask });
      engine.instanceId = instanceId;
      engine.on('end', Meteor.bindEnvironment(pong));
      engine.execute({
        listener: waitListener,
      });
    });
  });
});
