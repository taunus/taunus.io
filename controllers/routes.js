'use strict';

module.exports = [
  { route: '/', action: 'documentation/about' },
  { route: '/getting-started', action: 'documentation/getting-started' },
  { route: '/api', action: 'documentation/api' },
  { route: '/complements', action: 'documentation/complements' },
  { route: '/performance', action: 'documentation/performance' },
  { route: '/source-code', ignore: true },
  { route: '/{catchall*}', action: 'error/not-found' }
];
