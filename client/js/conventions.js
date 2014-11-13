'use strict';

var $ = require('dominus');
var raf = require('raf');
var taunus = require('taunus');
var throttle = require('./throttle');
var slowScrollCheck = throttle(scrollCheck, 50);
var tracking;
var heading;

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
  if (found.length === 0 || heading && found[0] === heading[0]) {
    return;
  }
  if (heading) {
    heading.removeClass('uv-highlight');
  }
  heading = found.i(0);
  heading.addClass('uv-highlight');
  set('#' + heading.attr('id'));
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
  taunus.navigate(hash, { scroll: false, replaceState: true });
}

module.exports = conventions;
