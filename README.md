# Meteor BPMN Engine

[![Build Status](https://travis-ci.org/cquencial/bpm-engine.svg?branch=master)](https://travis-ci.org/cquencial/bpm-engine)

Integrates paed01/bpmn-engine into your Meteor application and provides a way to hook into the execution chain.

By using the hooks you can combine the data from execution events with your Meteor Mongo backend and create a powerful BPMN application backend or service.



### Installation

Simple install like any other Meteor package:

```
meteor add cquencial:bpmn-engine
```

This engine takes on a hard dependency on paed01/bpmn-engine because it is easier to maintain with this (and the other extension packages).
If I will face the time where I will not be able maintain this package I will decouple the versions. For now we are all good with a fix dependency.



### Gettings started

If you already know how the original engine works you can skip this step.

For everyone else I recommend you to read on some of the following resources:

* API and examples of paed01/bpmn-engine in order to understand how the original engine works
* Some literature on BPMN I can't link here for copyright reasons
* [BPMN 2.0 Specification](http://www.omg.org/spec/BPMN)


### How it works

Every new `Bpmn.Engine` instance that is created will be assigned of a new `instanceId`. This property can be passed as option to the constructor or will be automatically generated.

The engine provides hooks for each three essential methods `Engine.execute`, `Engine.stop` and `Engine.resume`.

These hooks can be used in extensions to "internally" attach / remove event listeners to the execution and act upon these events with a default behavior.
The extension provides a way to merge these "internally" created listeners with listeners that are passed to `Engine.execute` from "outside".


There are two types of hooks: global and local. You can write an extension and let it register to the global hooks, so that they will run on each new instance.
But you can also use the local hooks by passing them as option. Global and local hooks are finally merged together and executed at the respective situation.
Since hooks use object properties as namespaces, you can explicitly override a global hook using a local one.


### Extensions

I have already created some packages for you that make use of this package's extended API:

* cquencial:bpmn-instances - Automatically reveals which process instances are currently running and provide access to them.

* cquencial:bpmn-persistence - Persisting the engine state into a Mongo document. Restore your process at any time, rollback to any step.

* cquencial:bpmn-history - Creating a full documentation about every step in your process execution. Set the level of documentation by your needs.

* cquencial:bpmn-errors - Separate error log for all the bad things, that occurred during process execution.



Related package for integrating the bpmn-js modeler:

* jkuester:meteor-autoform-bpmn - If you use `aldeed:autoform` then this package will make creating new processes as easy as possible for you.


### Hooks

#### hooks.on<Name>Before

* will be synchronously executed after the function call but before the original function call
* don't require `Meteor.bindEnvironment` and `Meteor.defer`.

#### hooks.on<Name>

* this it the case when (immediately after) the original function is called. This will be executed before to the original callback
* you need to use `Meteor.defer` when handling calls to a Mongo Collection

#### hooks.on<Name>After

* needs to be Wrapped using `Meteor.bindEnvironment` for `Engine.execute` and `Resume` as i will be executed within a callback
* Without call that require a Fiber you can also execute these functions without wrapping


### License

