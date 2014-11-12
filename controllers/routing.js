'use strict';

var util = require('util');

function routing (pack) {
  favicon();
  assets('js');
  assets('css');
  redirection('/about', '/');
  redirection('/source-code', 'https://github.com/taunus/taunus');
  redirection('/changelog', 'https://github.com/taunus/taunus/blob/master/CHANGELOG.md');

  function favicon () {
    pack.route({
      method: 'GET',
      path: '/favicon.ico',
      handler: { file: '.bin/public/favicon.ico' },
      config: {
        cache: { expiresIn: 86400000, privacy: 'public' }
      }
    });
  }

  function assets (type, file) {
    pack.route({
      method: 'GET',
      path: util.format('/%s/{asset*}', type),
      handler: {
        directory: { path: '.bin/public/' + type }
      }
    });
  }

  function redirection(from, to) {
    pack.route({
      method: 'GET',
      path: from,
      handler: function (request, reply) {
        reply.redirect(to);
      }
    });
  }
}

module.exports = routing;
