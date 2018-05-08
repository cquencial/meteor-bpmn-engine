Package.describe({
  name: 'cquencial:bpmn-engine',
  version: '0.1.0',
  // Brief, one-line summary of the package.
  summary: 'Base package for including paed01/bpmn-engine.',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md',
});

Package.onUse(function (api) {
  api.versionsFrom('1.6');
  api.use([
    'ecmascript',
    'random',
    'mongo',
    'check',
  ]);
  api.export('Bpmn');
  api.addFiles('bpmn-engine.js');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('meteor');
  api.use('check');
  api.use('mongo');
  api.use('random');
  api.use('cquencial:bpmn-engine');
  api.use('meteortesting:mocha');
  api.use('practicalmeteor:chai');
  api.mainModule('bpmn-engine-tests.js');
});


Npm.depends({
  'bpmn-engine': '4.2.0',
});
