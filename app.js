'use strict';

var util = require('util');
var Hapi = require('hapi');
var taunus = require('taunus');
var taunusHapi = require('taunus-hapi')(taunus);
var routing = require('./controllers/routing');
var routes = require('./controllers/routes');
var layout = require('./.bin/views/layout')
var port = process.env.PORT || 3000;
var pack = new Hapi.Pack();

pack.server('0.0.0.0', port);

routing(pack);

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
