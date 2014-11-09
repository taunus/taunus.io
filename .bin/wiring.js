'use strict';

var templates = {
  'documentation/home': require('views/documentation/home.js'),
  'error/not-found': require('views/error/not-found.js'),
  'layout': require('views/layout.js')
};

var controllers = {
};

var routes = {
  '/': {
    action: 'documentation/home'
  },
  '/*': {
    action: 'error/not-found'
  }
};

module.exports = {
  templates: templates,
  controllers: controllers,
  routes: routes
};
