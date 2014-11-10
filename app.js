'use strict';

var Hapi = require('hapi');
var taunus = require('taunus');
var taunusHapi = require('taunus-hapi')(taunus);
var routes = require('./controllers/routes');
var layout = require('./.bin/views/layout')
var port = process.env.PORT || 3000;
var pack = new Hapi.Pack();

pack.server('localhost', port);
pack.register({
  plugin: taunusHapi,
  options: {
    routes: routes,
    layout: layout
  }
}, registered);

function registered () {
  pack.start(started);
}

function started () {
  console.log('Hapi listening on port %s', port);
}

process.on('exit', function () {
  console.log('Shutting down...');
});
