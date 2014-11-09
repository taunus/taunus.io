'use strict';

module.exports = [
  { route: '/', action: 'documentation/home' },
  { route: '/{topic}/{detail?}', action: 'error/not-found' },
  { route: '/foo/{name*2}', action: 'error/not-found' },
  { route: '/bar/{name*}', action: 'error/not-found' },
  { route: '/*', action: 'error/not-found' }
];
