'use strict';

function routing (pack) {
  pack.route({
    method: 'GET',
    path: '/{asset*}',
    handler: {
      directory: { path: '.bin/public' }
    }
  });

  redirection('/about', '/');
  redirection('/source-code', 'https://github.com/taunus/taunus');

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
