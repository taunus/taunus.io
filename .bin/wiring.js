'use strict';

var templates = {
  'documentation/about': require('./views/documentation/about.js'),
  'documentation/api': require('./views/documentation/api.js'),
  'documentation/complements': require('./views/documentation/complements.js'),
  'documentation/getting-started': require('./views/documentation/getting-started.js'),
  'documentation/performance': require('./views/documentation/performance.js'),
  'error/not-found': require('./views/error/not-found.js'),
  'layout': require('./views/layout.js')
};

var controllers = {
  'documentation/about': require('../client/js/controllers/documentation/about.js')
};

var routes = [
  {
    route: '/',
    action: 'documentation/about'
  },
  {
    route: '/getting-started',
    action: 'documentation/getting-started'
  },
  {
    route: '/api',
    action: 'documentation/api'
  },
  {
    route: '/complements',
    action: 'documentation/complements'
  },
  {
    route: '/performance',
    action: 'documentation/performance'
  },
  {
    route: '/source-code',
    ignore: true
  },
  {
    route: '/changelog',
    ignore: true
  },
  {
    route: '/:catchall*',
    action: 'error/not-found'
  }
];

module.exports = {
  templates: templates,
  controllers: controllers,
  routes: routes
};
