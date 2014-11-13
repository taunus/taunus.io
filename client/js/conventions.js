'use strict';

var $ = require('dominus');
var raf = require('raf');
var sidebar = $('.sb-sidebar');
var throttle = require('./throttle');
var slowScrollCheck = throttle(scrollCheck, 200);
var offsetTop;
var scrollTop;
var heading;
var tracking;

raf(scroll);

function conventions (container) {
  sidebar.find('.sb-toc').remove();

  var sbToc;
  var toc = $('#table-of-contents + ul', container);
  if (toc.length) {
    sbToc = toc.clone().addClass('sb-container sb-toc').appendTo(sidebar);
    sbToc.find('li').forEach(reshape);
    offsetTop = sbToc[0].offsetTop;
  }
  tracking = !!toc.length;
}

function reshape (li) {
  var child = li.children[0];
  var ul = li.children[1];
  if (ul) {
    $(ul).find('li').forEach(reshape);
  }

  li.innerHTML = child.outerHTML + (ul ? ul.outerHTML : '');
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

function scroll () {
  slowScrollCheck();
  raf(scroll);
}

function scrollCheck () {
  if (!tracking) {
    return;
  }
  var reading = document.body.scrollTop;
  if (reading === scrollTop) {
    return;
  }
  scrollTop = reading;

  var sbToc = $('.sb-toc');
  var sbTocEl = sbToc[0];
  var clientHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
  var found = $('main').find('h1,h2,h3,h4,h5,h6').filter(inViewport);
  var filtered = found.where(':first-child,#table-of-contents');
  if (found.length && found.length === filtered.length) {
    sbTocEl.style.top = offsetTop + 'px';
    sbTocEl.style.marginTop = 0;
    set('#' + found[0].id);
    return;
  }
  found.splice(0, filtered.length);
  if (found.length === 0 || found[0] === heading) {
    return;
  }
  heading = found[0];

  $('.sb-toc-current').removeClass('sb-toc-current');

  var hash = '#' + heading.id;
  var sb = $('.sb-container')[0].offsetHeight;
  var a = sbToc.find('[href="' + hash + '"').addClass('sb-toc-current');
  var aEl = a[0];console.log(hash);
  var top = Math.max(scrollTop - sb + 25, offsetTop);

  sbTocEl.style.position = 'absolute';
  sbTocEl.style.top = top + 'px';
  sbTocEl.style.marginTop = -(aEl.offsetTop - aEl.offsetHeight - 25) + 'px';
  set(hash);
}

function set (hash) {
  if (history.pushState) {
    history.pushState(null, null, hash);
  }
}

module.exports = conventions;
