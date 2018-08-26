/* global Bpmn:true */
import { check, Match } from 'meteor/check'
import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'

const BpmnEngine = require('bpmn-engine')
const {EventEmitter} = require('events')

/**
 * See: https://github.com/paed01/bpmn-engine/blob/master/lib/validation.js
 * @private
 */
const validExecuteOptions = ['listener', 'services', 'variables']

/**
 * The default Bpmn engine import from 'bpmn-engine'.
 */
Bpmn = BpmnEngine

// //////////////////////////////////////////////////////////////////////////////////////
//
//  EVENTS
//
// //////////////////////////////////////////////////////////////////////////////////////

/**
 * List all available events here.
 */
Bpmn.Events = {
  start: 'start',
  enter: 'enter',
  end: 'end',
  wait: 'wait',
  leave: 'leave',
  taken: 'taken',
  cancel: 'cancel',
  error: 'error',
  discarded: 'discarded'
}

// //////////////////////////////////////////////////////////////////////////////////////
//
//  STATES
//
// //////////////////////////////////////////////////////////////////////////////////////

const states = {
  running: 'running',
  started: 'started',
  complete: 'complete',
  waiting: 'waiting',
  stopped: 'stopped',
  cancelled: 'cancelled',
  error: 'error'
}

Bpmn.States = states

// //////////////////////////////////////////////////////////////////////////////////////
//
//  EXTENSIONS
//
// //////////////////////////////////////////////////////////////////////////////////////

/**
 * Private dict for the extensions
 * @type {{}}
 * @private
 */
const _extensions = {}

const extensions = {
  add (key, ref, isActive = true) {
    _extensions[key] = {ref, isActive}
    return ref
  },
  remove (key, ref) {
    return delete _extensions[key]
  },
  get (key) {
    return _extensions[key]
  },
  getAll () {
    return Object.values(_extensions)
  },
  status (key, isActive) {
    const ref = this.get(key)
    if (ref) {
      ref.isActive = isActive
      return true
    } else {
      return false
    }
  }
}

Bpmn.extensions = extensions

// //////////////////////////////////////////////////////////////////////////////////////
//
//  HOOKS
//
// //////////////////////////////////////////////////////////////////////////////////////

/**
 * Private dict for the hooks
 * @type {{}}
 * @private
 */
let _globalHooks = {}

const hooks = {
  add (key, hooks) {
    _globalHooks[key] = hooks
  },

  remove (key) {
    delete _globalHooks[key]
  },

  clear () {
    _globalHooks = {}
  }
}

Bpmn.hooks = hooks

// //////////////////////////////////////////////////////////////////////////////////////
//
//  DEFAULT EXTENSION
//
// //////////////////////////////////////////////////////////////////////////////////////

const collectionName = 'BpmnProcesses'
const BpmnProcessCollection = new Mongo.Collection(collectionName)
BpmnProcessCollection.name = collectionName

const processes = {}
processes.name = 'Processes'
processes.ns = 'extensions.processes'
processes.description = 'Foundation for process Management'
processes.collection = BpmnProcessCollection

processes.isRegistered = Meteor.bindEnvironment(function (instanceId) {
  check(instanceId, String)
  return BpmnProcessCollection.findOne({instanceId})
})

processes.register = Meteor.bindEnvironment(function ({instanceId, source, isResume = false}) {
  check(instanceId, String)
  check(source, String)
  check(isResume, Boolean)

  const registeredDoc = processes.isRegistered(instanceId)
  if (!registeredDoc) {
    return BpmnProcessCollection.insert({instanceId, source, isResume, state: 'started'})
  } else {
    return registeredDoc._id
  }
})

processes.updateState = Meteor.bindEnvironment(function updateState (instanceId, state) {
  check(instanceId, String)
  check(state, String)
  return BpmnProcessCollection.update({instanceId}, {$set: {state}})
})

Bpmn.processes = processes

Bpmn.extensions.add(processes.ns, processes, true)

// //////////////////////////////////////////////////////////////////////////////////////
//
//  HELPERS
//
// //////////////////////////////////////////////////////////////////////////////////////

function runExtensions ({mergedExtensions, name, instance, options}) {
  const extensionValues = Object.values(mergedExtensions)
  extensionValues.forEach((extension) => {
    if (extension[name]) { extension[name].call(null, instance, options) }
  })
}

function cleanOptions (options) {
  const tmp = Object.assign({}, options)
  Object.keys(tmp).forEach((key) => {
    if (validExecuteOptions.indexOf(key) === -1) { delete tmp[key] }
  })
  return tmp
}

// //////////////////////////////////////////////////////////////////////////////////////
//
//  UTILS
//
// //////////////////////////////////////////////////////////////////////////////////////

Bpmn.utils = {}

/**
 * Attaches listeners to all {Bpmn.Events} unless flagged as false.
 * @param callbackFct {Function} The callback that will be called on all events that the listener is on.
 * @param opts {Object} Options.
 * @param opts.target {Object.EventEmitter} Optional target to listen on.
 * @returns {Object.EventEmitter} Returns a new EventEmitter or the given target by {opts.target}.
 */
function createListeners (callbackFct, opts, arr) {
  const options = opts || {}

  if (Object.prototype.hasOwnProperty.call(options, 'target')) {
    if (!options.target) {
      throw new Error('expected target but got none')
    }
    if (!(options.target instanceof EventEmitter)) { throw new Error('expected target to be an EventEmitter') }
  }
  const persistenceListener = options.target || new EventEmitter()

  const boundCb = Meteor.bindEnvironment(callbackFct)

  function cb (eventName) {
    return (element, instance) => {
      boundCb(element, instance, eventName)
    }
  }

  // TODO fix merge options and arr
  if (arr) {
    arr.forEach(key => {
      persistenceListener.on(key, cb(key))
    })
    return persistenceListener
  }

  if (options.wait !== false) {
    persistenceListener.on('wait', cb('wait'))
  }

  if (options.error !== false) {
    persistenceListener.on('error', cb('error'))
  }

  if (options.start !== false) {
    persistenceListener.on('start', cb('start'))
  }

  if (options.end !== false) {
    persistenceListener.on('end', cb('end'))
  }

  if (options.enter !== false) {
    persistenceListener.on('enter', cb('enter'))
  }

  if (options.cancel !== false) {
    persistenceListener.on('cancel', cb('cancel'))
  }

  if (options.taken !== false) {
    persistenceListener.on('taken', cb('taken'))
  }

  if (options.leave !== false) {
    persistenceListener.on('leave', cb('leave'))
  }

  if (options.discarded !== false) {
    persistenceListener.on('discarded', cb('discarded'))
  }

  return persistenceListener
}

Bpmn.createListeners = createListeners

/**
 * Merges two Event Listeners by copying all events from source to target.
 * This is not a pure function and mutates the target EventEmitter instance.
 * @param source EventEmitter, the one from the events will be copied from
 * @param target EventEmitter, the one to which will the events be copied to
 * @returns {EventEmitter} the merged EventEmitter instance
 */
function mergeListeners ({source, target}) {
  check(source, Match.Maybe(EventEmitter))
  check(source, Match.Maybe(EventEmitter))

  if (!source && !target) {
    throw new Error('expected at least one of target or source as param')
  }
  if (!source && target) return target
  if (!target && source) return source

  const sourceEvents = source._events
  const sourceEventKeys = Object.keys(sourceEvents)
  sourceEventKeys.forEach((sourceEventKey) => {
    let sourceEventValue = sourceEvents[sourceEventKey]

    if (typeof sourceEventValue === 'function') {
      sourceEventValue = [sourceEventValue]
    }

    sourceEventValue.forEach((sourceListener) => {
      if (sourceListener.name.includes('once')) {
        target.once(sourceEventKey, sourceListener.listener)
      } else {
        target.on(sourceEventKey, sourceListener)
      }
    })
  })
  return target
}

Bpmn.mergeListeners = mergeListeners

// //////////////////////////////////////////////////////////////////////////////////////
//
//  OVERRIDE CONSTRUCTOR
//
// //////////////////////////////////////////////////////////////////////////////////////

const OriginalConstructor = Bpmn.Engine
Bpmn.Engine = function (options) {
  const _options = options

  // unify instance by
  // using an instanceId
  let instanceId
  if (_options && _options.instanceId) {
    instanceId = _options.instanceId
    delete _options.instanceId
  } else {
    instanceId = Random.id()
  }

  processes.register({instanceId, source: options.source})

  // add local extensions
  let localExtensions = {}
  if (_options && _options.hooks) {
    localExtensions = _options.hooks
    delete _options.hooks
  }

  const engine = new OriginalConstructor(_options)
  engine.instanceId = instanceId
  engine.extensions = localExtensions

  engine.on('end', () => {
    if (!engine.stopped) {
      processes.updateState(instanceId, states.complete)
    }
  })

  engine.on('error', () => {
    processes.updateState(instanceId, states.error)
  })
  return engine
}

Bpmn.Engine.prototype = OriginalConstructor.prototype

Object.keys(OriginalConstructor).forEach((key) => {
  const value = OriginalConstructor[key]
  Bpmn.Engine[key] = value
  Bpmn.Engine[key].prototype = value.prototype
})

// //////////////////////////////////////////////////////////////////////////////////////
//
//  OVERRIDE EXECUTE
//
// //////////////////////////////////////////////////////////////////////////////////////

/**
 * Extends the execution by adding an instanceId.
 */

Bpmn.Engine.prototype.execute = (function () {
  const original = Bpmn.Engine.prototype.execute

  return function (options = {}, callback) {
    const instance = this
    const mergedExtensions = Object.assign({}, _globalHooks, instance.extensions)

    runExtensions({
      mergedExtensions,
      name: 'onExecuteBefore',
      instance: () => instance,
      options
    })

    const processListener = Bpmn.createListeners(() => {
      processes.updateState(instance.instanceId, states.waiting)
    }, null, [Bpmn.Events.wait])

    if (options.listener) {
      options.listener = Bpmn.mergeListeners({
        target: processListener,
        source: options.listener
      })
    }
    options.listener = processListener

    return original.call(this, cleanOptions(options), (err, engine) => {
      engine.stopped = false
      processes.updateState(instance.instanceId, states.running)

      runExtensions({
        mergedExtensions,
        name: 'onExecuteAfter',
        instance: () => instance,
        options
      })

      if (callback) callback(err, engine)
    })
  }
}())

// //////////////////////////////////////////////////////////////////////////////////////
//
//  OVERRIDE STOP
//
// //////////////////////////////////////////////////////////////////////////////////////

Bpmn.Engine.prototype.stop = (function () {
  const original = Bpmn.Engine.prototype.stop

  return function (options) {
    const instance = this
    const mergedExtensions = Object.assign({}, _globalHooks, instance.extensions)

    runExtensions({
      mergedExtensions,
      name: 'onStopBefore',
      instance: () => instance,
      options
    })

    processes.updateState(instance.instanceId, states.stopped)
    this.stopped = true

    const stoppedEngine = original.call(instance)

    runExtensions({
      mergedExtensions,
      name: 'onStopAfter',
      instance: () => instance,
      options
    })

    return stoppedEngine
  }
}())

// //////////////////////////////////////////////////////////////////////////////////////
//
//  OVERRIDE RESUME
//
// //////////////////////////////////////////////////////////////////////////////////////

const originalResume = Bpmn.Engine.resume
const originalResumePrototype = originalResume.prototype

Bpmn.Engine.resume = function (state, options, callback) {
  const _options = options
  let hooks = {}
  if (_options && _options.hooks) {
    hooks = _options.hooks
  }

  const instanceId = _options.instanceId
  if (!instanceId) throw new Error('instanceId is required to resume')

  processes.register({instanceId, source: JSON.stringify(state), isResume: true})

  let engineRef
  const mergedExtensions = Object.assign({}, _globalHooks, hooks)

  runExtensions({
    mergedExtensions,
    name: 'onResumeBefore',
    instance: () => engineRef,
    options
  })

  engineRef = originalResume.call(this, state, cleanOptions(_options), (error, engine) => {
    engineRef = engine
    engineRef.stopped = false
    engineRef.extensions = hooks
    engineRef.instanceId = instanceId
    processes.updateState(instanceId, states.running)
    runExtensions({
      name: 'onResumeAfter',
      mergedExtensions,
      instance: () => engine,
      options
    })

    if (callback) callback(error, engine)
  })

  engineRef.on('end', () => {
    if (!engineRef.stopped) {
      processes.updateState(instanceId, states.complete)
    }
  })

  engineRef.on('error', () => {
    processes.updateState(instanceId, states.error)
  })

  engineRef.extensions = hooks
  engineRef.instanceId = instanceId

  runExtensions({
    name: 'onResume',
    mergedExtensions,
    instance: () => engineRef,
    options
  })

  return engineRef
}

Bpmn.Engine.resume.prototype = originalResumePrototype
