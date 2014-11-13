'use strict';

var $ = require('dominus');
var raf = require('raf');
var sidebar = $('.sb-sidebar');
var throttle = require('./throttle');
var slowScrollCheck = throttle(scrollCheck, 200);
var heading;
var tracking;

raf(scroll);

function conventions (container) {
  tracking = $(container).find('#table-of-contents').length;
}

function scroll () {
  slowScrollCheck();
  raf(scroll);
}

function scrollCheck () {
  if (!tracking) {
    return;
  }
  var found = $('main').find('h1,h2,h3,h4,h5,h6').filter(inViewport);
  if (found.length === 0 || found[0] === heading) {
    return;
  }
  heading = found[0];
  set('#' + heading.id);
}

function inViewport (element) {
  var rect = element.getBoundingClientRect();
  var viewable = (
    Math.ceil(rect.top) >= 0 &&
    Math.ceil(rect.left) >= 0 &&
    Math.floor(rect.bottom) <= (window.innerHeight || document.documentElement.clientHeight) &&
    Math.floor(rect.right) <= (window.innerWidth || document.documentElement.clientWidth)
  );
  return viewable;
}

function set (hash) {
  if (history.pushState) {
    history.pushState(null, null, hash);
  }
}

module.exports = conventions;
