'use strict';

module.exports = [
  { route: '/', action: 'documentation/home' },
  { route: '/*', action: 'error/not-found' }
];
