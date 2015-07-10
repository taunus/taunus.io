'use strict';

var util = require('util');
var Hapi = require('hapi');
var taunus = require('taunus');
var taunusHapi = require('taunus-hapi')(taunus);
var routing = require('./controllers/routing');
var routes = require('./controllers/routes');
var layout = require('./.bin/views/layout');
var port = process.env.PORT || 3000;
var server = new Hapi.Server();

server.connection({ port: port });

routing(server);

server.register({
  register: taunusHapi,
  options: {
    routes: routes,
    layout: layout
  }
}, registered);

function registered () {
  server.start(started);
}

function started () {
  console.log('Hapi listening on port %s', port);
}
