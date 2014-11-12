(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],2:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],4:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],5:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":3,"./encode":4}],6:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function about(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/about.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/about.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"why-taunus-\">Why Taunus?</h1>\n<p>Taunus focuses on delivering a progressively enhanced experience to the end-user, while providing <em>a reasonable development experience</em> as well. <strong>Taunus prioritizes content</strong>. It uses server-side rendering to get content to your humans as fast as possible, and it uses client-side rendering to improve their experience.</p>\n<p>While it focuses on progressive enhancement, <strong><a href=\"http://ponyfoo.com/articles/adjusting-ux-for-humans\">usability</a> and performance are both core concerns</strong> for Taunus. Incidentally, focusing on progressive enhancement also improves both of these. Usability is improved because the experience is gradually improved, meaning that if somewhere along the line a feature is missing, the component is <strong>still expected to work</strong>.</p>\n<p>For example, a progressively enhanced site uses plain-old links to navigate from one view to another, and then adds a <code>click</code> event handler that blocks navigation and issues an AJAX request instead. If JavaScript fails to load, perhaps the experience might stay a little bit worse, but that&#39;s okay, because we acknowledge that <strong>our sites don&#39;t need to look and behave the same on every browser</strong>. Similarly, <a href=\"http://ponyfoo.com/articles/critical-path-performance-optimization\">performance is greatly enhanced</a> by delivering content to the human as fast as possible, and then adding functionality on top of that.</p>\n<p>With progressive enhancement, if the functionality never gets there because a JavaScript resource failed to load because the network failed <em>(not uncommon in the mobile era)</em> or because the user blocked JavaScript, your application will still work!</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.unshift({ lineno: 3, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 4, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"why-not-other-frameworks-\">Why Not Other Frameworks?</h1>\n<p>Many other frameworks weren&#39;t designed with shared-rendering in mind. Content isn&#39;t prioritized, and humans are expected to <a href=\"http://ponyfoo.com/articles/stop-breaking-the-web\">download most of a web page before they can see any human-digestible content</a>. While Google is going to resolve the SEO issues with dedicated client-side rendering soon, SEO is also a problem. Google isn&#39;t the only web crawler operator out there, and it might be a while before social media link crawlers catch up with them.</p>\n<p>Lately, we can observe many mature open-source frameworks are dropping support for older browsers. This is necessary because of the way they&#39;re architected, where the developer is put first. <strong>Taunus is <a href=\"https://twitter.com/hashtag/humanfirst\">#humanfirst</a></strong>, meaning that it concedes that humans are more important than the developers building their applications.</p>\n<p>Progressively enhanced applications are always going to have great browser support because of the way they&#39;re architected. As the name implies, a baseline is established where we deliver the core experience to the user <em>(typically in the form of readable HTML content)</em>, and then enhance it <strong>if possible</strong> using CSS and JavaScript. Building applications in this way means that you&#39;ll be able to reach the most people with your core experience, and you&#39;ll also be able to provide humans in more modern browsers with all of the latest features and technologies.</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.unshift({ lineno: 5, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 6, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"features\">Features</h1>\n<p>Out of the box, Taunus ensures that your site works on any HTML-enabled document viewer and even the terminal, providing support for plain text responses <a href=\"/getting-started\">without any configuration needed</a>. Even while Taunus provides shared-rendering capabilities, it offers code reuse of views and routes, meaning you&#39;ll only have to declare these once but they&#39;ll be used in both the server-side and the client-side.</p>\n<p>Taunus features a reasonably enhanced experience, where if features aren&#39;t available on a browser, they&#39;re just not provided. For example, the client-side router makes use of the <code>history</code> API but if that&#39;s not available then it&#39;ll fall back to simply not meddling with links instead of using a client-side-only hash router.</p>\n<p>Taunus can deal with view caching on your behalf, if you so desire, using <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">asynchronous embedded database stores</a> on the client-side. Turns out, there&#39;s <a href=\"http://caniuse.com/#search=indexeddb\">pretty good browser support for IndexedDB</a>. Of course, IndexedDB will only be used if it&#39;s available, and if it&#39;s not then views won&#39;t be cached in the client-side besides an in-memory store. <strong>The site won&#39;t simply roll over and die, though.</strong></p>\n<p>If you&#39;ve turned client-side caching on, then you can also turn on the <strong>view pre-fetching feature</strong>, which will start downloading views as soon as humans hover on links, as to deliver a <em>faster perceived human experience</em>.</p>\n<p>Taunus provides the bare bones for your application so that you can separate concerns into routes, controllers, models, and views. Then it gets out of the way, by design. There are <a href=\"/complements\">a few complementary modules</a> you can use to enhance your development experience, as well.</p>\n<p>With Taunus you&#39;ll be in charge. <a href=\"/getting-started\">Are you ready to get started?</a></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.unshift({ lineno: 7, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 8, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"familiarity\">Familiarity</h1>\n<p>You can use Taunus to develop applications using your favorite Node.js HTTP server, <strong>both <a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a> are fully supported</strong>. In both cases, you&#39;ll <a href=\"/getting-started\">build controllers the way you&#39;re already used to</a>, except you won&#39;t have to <code>require</code> the view controllers or define any view routes since Taunus will deal with that on your behalf. In the controllers you&#39;ll be able to do everything you&#39;re already able to do, and then you&#39;ll have to return a JSON model which will be used to render a view.</p>\n<p>You can use any view-rendering engine that you want, provided that it can be compiled into JavaScript functions. That&#39;s because Taunus treats views as mere JavaScript functions, rather than being tied into a specific view-rendering engine.</p>\n<p>Client-side controllers are just functions, too. You can bring your own selector engine, your own AJAX libraries, and your own data-binding solutions. It might mean there&#39;s a bit more work involved for you, but you&#39;ll also be free to pick whatever libraries you&#39;re most comfortable with! That being said, Taunus <a href=\"/complements\">does recommend a few libraries</a> that work well with it.</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Why Taunus?\n\n    Taunus focuses on delivering a progressively enhanced experience to the end-user, while providing _a reasonable development experience_ as well. **Taunus prioritizes content**. It uses server-side rendering to get content to your humans as fast as possible, and it uses client-side rendering to improve their experience.\n\n    While it focuses on progressive enhancement, **[usability][2] and performance are both core concerns** for Taunus. Incidentally, focusing on progressive enhancement also improves both of these. Usability is improved because the experience is gradually improved, meaning that if somewhere along the line a feature is missing, the component is **still expected to work**.\n\n    For example, a progressively enhanced site uses plain-old links to navigate from one view to another, and then adds a `click` event handler that blocks navigation and issues an AJAX request instead. If JavaScript fails to load, perhaps the experience might stay a little bit worse, but that's okay, because we acknowledge that **our sites don't need to look and behave the same on every browser**. Similarly, [performance is greatly enhanced][1] by delivering content to the human as fast as possible, and then adding functionality on top of that.\n\n    With progressive enhancement, if the functionality never gets there because a JavaScript resource failed to load because the network failed _(not uncommon in the mobile era)_ or because the user blocked JavaScript, your application will still work!\n\n    [1]: http://ponyfoo.com/articles/critical-path-performance-optimization\n    [2]: http://ponyfoo.com/articles/adjusting-ux-for-humans\n\nsection.ly-section.md-markdown\n  :markdown\n    # Why Not Other Frameworks?\n\n    Many other frameworks weren't designed with shared-rendering in mind. Content isn't prioritized, and humans are expected to [download most of a web page before they can see any human-digestible content][2]. While Google is going to resolve the SEO issues with dedicated client-side rendering soon, SEO is also a problem. Google isn't the only web crawler operator out there, and it might be a while before social media link crawlers catch up with them.\n\n    Lately, we can observe many mature open-source frameworks are dropping support for older browsers. This is necessary because of the way they're architected, where the developer is put first. **Taunus is [#humanfirst][1]**, meaning that it concedes that humans are more important than the developers building their applications.\n\n    Progressively enhanced applications are always going to have great browser support because of the way they're architected. As the name implies, a baseline is established where we deliver the core experience to the user _(typically in the form of readable HTML content)_, and then enhance it **if possible** using CSS and JavaScript. Building applications in this way means that you'll be able to reach the most people with your core experience, and you'll also be able to provide humans in more modern browsers with all of the latest features and technologies.\n\n    [1]: https://twitter.com/hashtag/humanfirst\n    [2]: http://ponyfoo.com/articles/stop-breaking-the-web\n\nsection.ly-section.md-markdown\n  :markdown\n    # Features\n\n    Out of the box, Taunus ensures that your site works on any HTML-enabled document viewer and even the terminal, providing support for plain text responses [without any configuration needed][2]. Even while Taunus provides shared-rendering capabilities, it offers code reuse of views and routes, meaning you'll only have to declare these once but they'll be used in both the server-side and the client-side.\n\n    Taunus features a reasonably enhanced experience, where if features aren't available on a browser, they're just not provided. For example, the client-side router makes use of the `history` API but if that's not available then it'll fall back to simply not meddling with links instead of using a client-side-only hash router.\n\n    Taunus can deal with view caching on your behalf, if you so desire, using [asynchronous embedded database stores][3] on the client-side. Turns out, there's [pretty good browser support for IndexedDB][4]. Of course, IndexedDB will only be used if it's available, and if it's not then views won't be cached in the client-side besides an in-memory store. **The site won't simply roll over and die, though.**\n\n    If you've turned client-side caching on, then you can also turn on the **view pre-fetching feature**, which will start downloading views as soon as humans hover on links, as to deliver a _faster perceived human experience_.\n\n    Taunus provides the bare bones for your application so that you can separate concerns into routes, controllers, models, and views. Then it gets out of the way, by design. There are [a few complementary modules][1] you can use to enhance your development experience, as well.\n\n    With Taunus you'll be in charge. [Are you ready to get started?][2]\n\n    [1]: /complements\n    [2]: /getting-started\n    [3]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [4]: http://caniuse.com/#search=indexeddb\n\nsection.ly-section.md-markdown\n  :markdown\n    # Familiarity\n\n    You can use Taunus to develop applications using your favorite Node.js HTTP server, **both [Express][3] and [Hapi][4] are fully supported**. In both cases, you'll [build controllers the way you're already used to][1], except you won't have to `require` the view controllers or define any view routes since Taunus will deal with that on your behalf. In the controllers you'll be able to do everything you're already able to do, and then you'll have to return a JSON model which will be used to render a view.\n\n    You can use any view-rendering engine that you want, provided that it can be compiled into JavaScript functions. That's because Taunus treats views as mere JavaScript functions, rather than being tied into a specific view-rendering engine.\n\n    Client-side controllers are just functions, too. You can bring your own selector engine, your own AJAX libraries, and your own data-binding solutions. It might mean there's a bit more work involved for you, but you'll also be free to pick whatever libraries you're most comfortable with! That being said, Taunus [does recommend a few libraries][2] that work well with it.\n\n    [1]: /getting-started\n    [2]: /complements\n    [3]: http://expressjs.com\n    [4]: http://hapijs.com\n");
}
}
},{"jadum/runtime":13}],7:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function gettingStarted(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/getting-started.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/getting-started.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/getting-started.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/getting-started.jade" });
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#using-the-client-side-taunus-api\">Using the client-side Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">npm install taunus taunus-express express --save\n</code></pre>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n<li><code>routes</code> should be an array of view routes</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;there is no layout, just render the partials&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return model.partial;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  layout: require(&#39;./layout&#39;),\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that later, but it defaults to <code>{}</code>)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">touch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install jadum -g\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Taunus is now operational. All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">touch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template! The <code>!=</code> syntax means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>There&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install taunus -g\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<p>The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use <code>client/js</code> to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let&#39;s stick to the conventions.</p>\n<pre><code class=\"lang-shell\">touch client/js/main.js\n</code></pre>\n<p>The <code>main</code> module will be used as the <em>entry point</em> of your application on the client-side. Here you&#39;ll need to import <code>taunus</code>, the wiring module we&#39;ve just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke <code>taunus.mount</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar wiring = require(&#39;../../.bin/wiring&#39;);\nvar main = document.getElementsByTagName(&#39;main&#39;)[0];\n\ntaunus.mount(main, wiring);\n</code></pre>\n<p>The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.</p>\n<p>By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won&#39;t be functional until the client-side controller runs.</p>\n<p>An alternative is to inline the view model alongside the views in a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag, but this tends to slow down the initial response (models are <em>typically larger</em> than the resulting views).</p>\n<p>A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that&#39;s harder to set up.</p>\n<p>The three booting strategies are explained in <a href=\"/api\">the API documentation</a> and further discussed in <a href=\"/performance\">the optimization guide</a>. For now, the default strategy <em>(<code>&#39;auto&#39;</code>)</em> should suffice. It fetches the view model using an AJAX request right after Taunus loads.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>Client-side controllers run whenever a view is rendered, even if it&#39;s a partial. The controller is passed the <code>model</code>, containing the model that was used to render the view; the <code>route</code>, broken down into its components; and the <code>container</code>, which is whatever DOM element the view was rendered into.</p>\n<p>These controllers are entirely optional, which makes sense since we&#39;re progressively enhancing the application: it might not even be necessary! Let&#39;s add some client-side functionality to the example we&#39;ve been building.</p>\n<pre><code class=\"lang-shell\">touch client/js/controllers/home/index.js\n</code></pre>\n<p>Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we&#39;ll just print the action and the model to the console. If there&#39;s one place where you&#39;d want to enhance the experience, client-side controllers are where you want to put your code.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model, route, container) {\n  console.log(&#39;Rendered view %s using model %s&#39;, route.action, model);\n};\n</code></pre>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-client-side-taunus-api\">Using the client-side Taunus API</h4>\n<p>Taunus does provide <a href=\"/api\">a thin API</a> in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there&#39;s a few methods you can take advantage of on a global scale as well.</p>\n<p>Taunus can notify you whenever important events occur.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Besides events, there&#39;s a couple more methods you can use. The <code>taunus.navigate</code> method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there&#39;s <code>taunus.partial</code>, and that allows you to render any partial view on a DOM element of your choosing, and it&#39;ll then invoke its controller. You&#39;ll need to come up with the model yourself, though.</p>\n<p>Astonishingly, the API is further documented in <a href=\"/api\">the API documentation</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p><a href=\"/performance\">Performance</a> plays an important role in Taunus. That&#39;s why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?</p>\n<p>When turned on, by passing <code>{ cache: true }</code> as the third parameter for <code>taunus.mount</code>, the caching layer will make sure that responses are kept around for <code>15</code> seconds. Whenever a route needs a model in order to render a view, it&#39;ll first ask the caching layer for a fresh copy. If the caching layer doesn&#39;t have a copy, or if that copy is stale <em>(in this case, older than <code>15</code> seconds)</em>, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set <code>cache</code> to a number in seconds instead of just <code>true</code>.</p>\n<p>Since Taunus understands that not every view operates under the same constraints, you&#39;re also able to set a <code>cache</code> freshness duration directly in your routes. The <code>cache</code> property in routes has precedence over the default value.</p>\n<p>There&#39;s currently two caching stores: a raw in-memory store, and an <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">IndexedDB</a> store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of <code>localStorage</code>. It has <a href=\"http://caniuse.com/#feat=indexeddb\">surprisingly broad browser support</a>, and in the cases where it&#39;s not supported then caching is done solely in-memory.</p>\n<p>The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them <em>(the <code>touchstart</code> event)</em>, the prefetcher will issue an AJAX request for the view model for that link.</p>\n<p>If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their <em>(possibly limited)</em> Internet connection bandwidth.</p>\n<p>If the human clicks on the link before prefetching is completed, he&#39;ll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.</p>\n<p>Turning prefetching on is simply a matter of setting <code>prefetch</code> to <code>true</code> in the options passed to <code>taunus.mount</code>. For additional insights into the performance improvements Taunus can offer, head over to the <a href=\"/performance\">Performance Optimizations</a> guide.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Creating a layout](#creating-a-layout)\n      - [Your first route](#your-first-route)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Using the client-side Taunus API](#using-the-client-side-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    npm install taunus taunus-express express --save\n    ```\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n    - `routes` should be an array of view routes\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"there is no layout, just render the partials\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return model.partial;\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      layout: require('./layout'),\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that later, but it defaults to `{}`)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install jadum -g\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Taunus is now operational. All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template! The `!=` syntax means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    There's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install taunus -g\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use `client/js` to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let's stick to the conventions.\n\n    ```shell\n    touch client/js/main.js\n    ```\n\n    The `main` module will be used as the _entry point_ of your application on the client-side. Here you'll need to import `taunus`, the wiring module we've just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke `taunus.mount`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var wiring = require('../../.bin/wiring');\n    var main = document.getElementsByTagName('main')[0];\n\n    taunus.mount(main, wiring);\n    ```\n\n    The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.\n\n    By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won't be functional until the client-side controller runs.\n\n    An alternative is to inline the view model alongside the views in a `<script type='text/taunus'>` tag, but this tends to slow down the initial response (models are _typically larger_ than the resulting views).\n\n    A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that's harder to set up.\n\n    The three booting strategies are explained in [the API documentation][18] and further discussed in [the optimization guide][25]. For now, the default strategy _(`'auto'`)_ should suffice. It fetches the view model using an AJAX request right after Taunus loads.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    Client-side controllers run whenever a view is rendered, even if it's a partial. The controller is passed the `model`, containing the model that was used to render the view; the `route`, broken down into its components; and the `container`, which is whatever DOM element the view was rendered into.\n\n    These controllers are entirely optional, which makes sense since we're progressively enhancing the application: it might not even be necessary! Let's add some client-side functionality to the example we've been building.\n\n    ```shell\n    touch client/js/controllers/home/index.js\n    ```\n\n    Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we'll just print the action and the model to the console. If there's one place where you'd want to enhance the experience, client-side controllers are where you want to put your code.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model, route, container) {\n      console.log('Rendered view %s using model %s', route.action, model);\n    };\n    ```\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the client-side Taunus API\n\n    Taunus does provide [a thin API][18] in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there's a few methods you can take advantage of on a global scale as well.\n\n    Taunus can notify you whenever important events occur.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Besides events, there's a couple more methods you can use. The `taunus.navigate` method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there's `taunus.partial`, and that allows you to render any partial view on a DOM element of your choosing, and it'll then invoke its controller. You'll need to come up with the model yourself, though.\n\n    Astonishingly, the API is further documented in [the API documentation][18].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    [Performance][25] plays an important role in Taunus. That's why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?\n\n    When turned on, by passing `{ cache: true }` as the third parameter for `taunus.mount`, the caching layer will make sure that responses are kept around for `15` seconds. Whenever a route needs a model in order to render a view, it'll first ask the caching layer for a fresh copy. If the caching layer doesn't have a copy, or if that copy is stale _(in this case, older than `15` seconds)_, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set `cache` to a number in seconds instead of just `true`.\n\n    Since Taunus understands that not every view operates under the same constraints, you're also able to set a `cache` freshness duration directly in your routes. The `cache` property in routes has precedence over the default value.\n\n    There's currently two caching stores: a raw in-memory store, and an [IndexedDB][28] store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of `localStorage`. It has [surprisingly broad browser support][29], and in the cases where it's not supported then caching is done solely in-memory.\n\n    The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them _(the `touchstart` event)_, the prefetcher will issue an AJAX request for the view model for that link.\n\n    If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their _(possibly limited)_ Internet connection bandwidth.\n\n    If the human clicks on the link before prefetching is completed, he'll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.\n\n    Turning prefetching on is simply a matter of setting `prefetch` to `true` in the options passed to `taunus.mount`. For additional insights into the performance improvements Taunus can offer, head over to the [Performance Optimizations][25] guide.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n    [28]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [29]: http://caniuse.com/#feat=indexeddb\n");
}
}
},{"jadum/runtime":13}],8:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function notFound(locals) {
var jade_debug = [{ lineno: 1, filename: "views/error/not-found.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/error/not-found.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/error/not-found.jade" });
buf.push("<h1>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 1, filename: jade_debug[0].filename });
buf.push("Not Found");
jade_debug.shift();
jade_debug.shift();
buf.push("</h1>");
jade_debug.shift();
jade_debug.unshift({ lineno: 3, filename: "views/error/not-found.jade" });
buf.push("<p>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 3, filename: jade_debug[0].filename });
buf.push("There doesn't seem to be anything here yet. If you believe this to be a mistake, please let us know!");
jade_debug.shift();
jade_debug.shift();
buf.push("</p>");
jade_debug.shift();
jade_debug.unshift({ lineno: 4, filename: "views/error/not-found.jade" });
buf.push("<p>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 5, filename: "views/error/not-found.jade" });
buf.push("<a href=\"https://twitter.com/nzgb\" target=\"_blank\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 5, filename: jade_debug[0].filename });
buf.push("&mdash; @nzgb");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</p>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "h1 Not Found\n\np There doesn't seem to be anything here yet. If you believe this to be a mistake, please let us know!\np\n  a(href='https://twitter.com/nzgb', target='_blank') &mdash; @nzgb\n");
}
}
},{"jadum/runtime":13}],9:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function layout(locals) {
var jade_debug = [{ lineno: 1, filename: "views/layout.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined, model, partial) {
jade_debug.unshift({ lineno: 0, filename: "views/layout.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/layout.jade" });
buf.push("<!DOCTYPE html>");
jade_debug.shift();
jade_debug.unshift({ lineno: 2, filename: "views/layout.jade" });
buf.push("<html lang=\"en\" itemscope itemtype=\"http://schema.org/Blog\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 3, filename: "views/layout.jade" });
buf.push("<head>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 4, filename: "views/layout.jade" });
buf.push("<title>" + (jade.escape(null == (jade_interp = model.title) ? "" : jade_interp)));
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.shift();
buf.push("</title>");
jade_debug.shift();
jade_debug.unshift({ lineno: 5, filename: "views/layout.jade" });
buf.push("<meta charset=\"utf-8\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 6, filename: "views/layout.jade" });
buf.push("<link rel=\"shortcut icon\" href=\"/favicon.ico\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 7, filename: "views/layout.jade" });
buf.push("<meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge,chrome=1\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 8, filename: "views/layout.jade" });
buf.push("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 9, filename: "views/layout.jade" });
buf.push("<link rel=\"stylesheet\" type=\"text/css\" href=\"/css/all.css\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 10, filename: "views/layout.jade" });
buf.push("<link rel=\"stylesheet\" type=\"text/css\" href=\"http://fonts.googleapis.com/css?family=Unica+One:400|Playfair+Display:700|Megrim:700|Fauna+One:400italic,400,700\">");
jade_debug.shift();
jade_debug.shift();
buf.push("</head>");
jade_debug.shift();
jade_debug.unshift({ lineno: 12, filename: "views/layout.jade" });
buf.push("<body id=\"top\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 13, filename: "views/layout.jade" });
buf.push("<header>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 14, filename: "views/layout.jade" });
buf.push("<h1>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 15, filename: "views/layout.jade" });
buf.push("<a href=\"/\" aria-label=\"Go to home\" class=\"ly-title\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 15, filename: jade_debug[0].filename });
buf.push("Taunus");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</h1>");
jade_debug.shift();
jade_debug.unshift({ lineno: 16, filename: "views/layout.jade" });
buf.push("<h2 class=\"ly-subheading\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 16, filename: jade_debug[0].filename });
buf.push("Micro Isomorphic MVC Engine for Node.js");
jade_debug.shift();
jade_debug.shift();
buf.push("</h2>");
jade_debug.shift();
jade_debug.shift();
buf.push("</header>");
jade_debug.shift();
jade_debug.unshift({ lineno: 18, filename: "views/layout.jade" });
buf.push("<aside>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 19, filename: "views/layout.jade" });
buf.push("<nav class=\"nv-container\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 20, filename: "views/layout.jade" });
buf.push("<ul class=\"nv-items\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 21, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 22, filename: "views/layout.jade" });
buf.push("<a href=\"/\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 22, filename: jade_debug[0].filename });
buf.push("About");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 23, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 24, filename: "views/layout.jade" });
buf.push("<a href=\"/getting-started\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 24, filename: jade_debug[0].filename });
buf.push("Getting Started");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 25, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 26, filename: "views/layout.jade" });
buf.push("<a href=\"/api\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 26, filename: jade_debug[0].filename });
buf.push("API Documentation");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 27, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 28, filename: "views/layout.jade" });
buf.push("<a href=\"/complements\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 28, filename: jade_debug[0].filename });
buf.push("Complementary Modules");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 29, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 30, filename: "views/layout.jade" });
buf.push("<a href=\"/performance\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 30, filename: jade_debug[0].filename });
buf.push("Performance Optimization");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 31, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 32, filename: "views/layout.jade" });
buf.push("<a href=\"/source-code\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 32, filename: jade_debug[0].filename });
buf.push("Source Code");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.shift();
buf.push("</ul>");
jade_debug.shift();
jade_debug.shift();
buf.push("</nav>");
jade_debug.shift();
jade_debug.shift();
buf.push("</aside>");
jade_debug.shift();
jade_debug.unshift({ lineno: 34, filename: "views/layout.jade" });
buf.push("<main id=\"application-root\" data-taunus=\"model\">" + (null == (jade_interp = partial) ? "" : jade_interp));
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.shift();
buf.push("</main>");
jade_debug.shift();
jade_debug.unshift({ lineno: 35, filename: "views/layout.jade" });
buf.push("<script src=\"/js/all.js\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.shift();
buf.push("</script>");
jade_debug.shift();
jade_debug.shift();
buf.push("</body>");
jade_debug.shift();
jade_debug.shift();
buf.push("</html>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined,"model" in locals_for_with?locals_for_with.model:typeof model!=="undefined"?model:undefined,"partial" in locals_for_with?locals_for_with.partial:typeof partial!=="undefined"?partial:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "doctype html\nhtml(lang='en', itemscope, itemtype='http://schema.org/Blog')\n  head\n    title=model.title\n    meta(charset='utf-8')\n    link(rel='shortcut icon', href='/favicon.ico')\n    meta(http-equiv='X-UA-Compatible', content='IE=edge,chrome=1')\n    meta(name='viewport', content='width=device-width, initial-scale=1')\n    link(rel='stylesheet', type='text/css', href='/css/all.css')\n    link(rel='stylesheet', type='text/css', href='http://fonts.googleapis.com/css?family=Unica+One:400|Playfair+Display:700|Megrim:700|Fauna+One:400italic,400,700')\n\n  body#top\n    header\n      h1\n        a.ly-title(href='/', aria-label='Go to home') Taunus\n      h2.ly-subheading Micro Isomorphic MVC Engine for Node.js\n\n    aside\n      nav.nv-container\n        ul.nv-items\n          li.nv-item\n            a(href='/') About\n          li.nv-item\n            a(href='/getting-started') Getting Started\n          li.nv-item\n            a(href='/api') API Documentation\n          li.nv-item\n            a(href='/complements') Complementary Modules\n          li.nv-item\n            a(href='/performance') Performance Optimization\n          li.nv-item\n            a(href='/source-code') Source Code\n\n    main#application-root(data-taunus='model')!=partial\n    script(src='/js/all.js')\n");
}
}
},{"jadum/runtime":13}],10:[function(require,module,exports){
'use strict';

var templates = {
  'documentation/about': require('./views/documentation/about.js'),
  'documentation/getting-started': require('./views/documentation/getting-started.js'),
  'error/not-found': require('./views/error/not-found.js'),
  'layout': require('./views/layout.js')
};

var controllers = {
};

var routes = {
  '/': {
    action: 'documentation/about'
  },
  '/getting-started': {
    action: 'documentation/getting-started'
  },
  '/api': {
    action: 'documentation/api'
  },
  '/complements': {
    action: 'documentation/complements'
  },
  '/performance': {
    action: 'documentation/performance'
  },
  '/source-code': {
    ignore: true
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

},{"./views/documentation/about.js":6,"./views/documentation/getting-started.js":7,"./views/error/not-found.js":8,"./views/layout.js":9}],11:[function(require,module,exports){
'use strict';

// import the taunus module
var taunus = require('taunus');

// import the wiring module exported by Taunus
var wiring = require('../../.bin/wiring');

// get the <main> element
var main = document.getElementById('application-root');

// mount taunus so it starts its routing engine
taunus.mount(main, wiring);

},{"../../.bin/wiring":10,"taunus":21}],12:[function(require,module,exports){
(function (global){
!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.jade=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
'use strict';

/**
 * Merge two attribute objects giving precedence
 * to values in object `b`. Classes are special-cased
 * allowing for arrays and merging/joining appropriately
 * resulting in a string.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api private
 */

exports.merge = function merge(a, b) {
  if (arguments.length === 1) {
    var attrs = a[0];
    for (var i = 1; i < a.length; i++) {
      attrs = merge(attrs, a[i]);
    }
    return attrs;
  }
  var ac = a['class'];
  var bc = b['class'];

  if (ac || bc) {
    ac = ac || [];
    bc = bc || [];
    if (!Array.isArray(ac)) ac = [ac];
    if (!Array.isArray(bc)) bc = [bc];
    a['class'] = ac.concat(bc).filter(nulls);
  }

  for (var key in b) {
    if (key != 'class') {
      a[key] = b[key];
    }
  }

  return a;
};

/**
 * Filter null `val`s.
 *
 * @param {*} val
 * @return {Boolean}
 * @api private
 */

function nulls(val) {
  return val != null && val !== '';
}

/**
 * join array as classes.
 *
 * @param {*} val
 * @return {String}
 */
exports.joinClasses = joinClasses;
function joinClasses(val) {
  return Array.isArray(val) ? val.map(joinClasses).filter(nulls).join(' ') : val;
}

/**
 * Render the given classes.
 *
 * @param {Array} classes
 * @param {Array.<Boolean>} escaped
 * @return {String}
 */
exports.cls = function cls(classes, escaped) {
  var buf = [];
  for (var i = 0; i < classes.length; i++) {
    if (escaped && escaped[i]) {
      buf.push(exports.escape(joinClasses([classes[i]])));
    } else {
      buf.push(joinClasses(classes[i]));
    }
  }
  var text = joinClasses(buf);
  if (text.length) {
    return ' class="' + text + '"';
  } else {
    return '';
  }
};

/**
 * Render the given attribute.
 *
 * @param {String} key
 * @param {String} val
 * @param {Boolean} escaped
 * @param {Boolean} terse
 * @return {String}
 */
exports.attr = function attr(key, val, escaped, terse) {
  if ('boolean' == typeof val || null == val) {
    if (val) {
      return ' ' + (terse ? key : key + '="' + key + '"');
    } else {
      return '';
    }
  } else if (0 == key.indexOf('data') && 'string' != typeof val) {
    return ' ' + key + "='" + JSON.stringify(val).replace(/'/g, '&apos;') + "'";
  } else if (escaped) {
    return ' ' + key + '="' + exports.escape(val) + '"';
  } else {
    return ' ' + key + '="' + val + '"';
  }
};

/**
 * Render the given attributes object.
 *
 * @param {Object} obj
 * @param {Object} escaped
 * @return {String}
 */
exports.attrs = function attrs(obj, terse){
  var buf = [];

  var keys = Object.keys(obj);

  if (keys.length) {
    for (var i = 0; i < keys.length; ++i) {
      var key = keys[i]
        , val = obj[key];

      if ('class' == key) {
        if (val = joinClasses(val)) {
          buf.push(' ' + key + '="' + val + '"');
        }
      } else {
        buf.push(exports.attr(key, val, false, terse));
      }
    }
  }

  return buf.join('');
};

/**
 * Escape the given string of `html`.
 *
 * @param {String} html
 * @return {String}
 * @api private
 */

exports.escape = function escape(html){
  var result = String(html)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  if (result === '' + html) return html;
  else return result;
};

/**
 * Re-throw the given `err` in context to the
 * the jade in `filename` at the given `lineno`.
 *
 * @param {Error} err
 * @param {String} filename
 * @param {String} lineno
 * @api private
 */

exports.rethrow = function rethrow(err, filename, lineno, str){
  if (!(err instanceof Error)) throw err;
  if ((typeof window != 'undefined' || !filename) && !str) {
    err.message += ' on line ' + lineno;
    throw err;
  }
  try {
    str = str || _dereq_('fs').readFileSync(filename, 'utf8')
  } catch (ex) {
    rethrow(err, null, lineno)
  }
  var context = 3
    , lines = str.split('\n')
    , start = Math.max(lineno - context, 0)
    , end = Math.min(lines.length, lineno + context);

  // Error context
  var context = lines.slice(start, end).map(function(line, i){
    var curr = i + start + 1;
    return (curr == lineno ? '  > ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'Jade') + ':' + lineno
    + '\n' + context + '\n\n' + err.message;
  throw err;
};

},{"fs":2}],2:[function(_dereq_,module,exports){

},{}]},{},[1])
(1)
});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],13:[function(require,module,exports){
module.exports = require('jade/runtime');

},{"jade/runtime":12}],14:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var fetcher = require('./fetcher');
var partial = require('./partial');
var router = require('./router');
var state = require('./state');
var isNative = require('./isNative');
var modern = 'history' in window && 'pushState' in history;

// Google Chrome 38 on iOS makes weird changes to history.replaceState, breaking it
var nativeReplace = modern && isNative(window.history.replaceState);

function go (url, o) {
  var options = o || {};
  var context = options.context || null;

  if (!modern) {
    location.href = url; return;
  }

  var route = router(url);

  fetcher.abortPending();
  fetcher(route, { element: context, source: 'intent' }, resolved);

  function resolved (err, model) {
    if (err) {
      return;
    }
    navigation(route, model, 'pushState');
    partial(state.container, null, model, route);
  }
}

function start (model) {
  var route = replaceWith(model);
  emitter.emit('start', state.container, model);
  partial(state.container, null, model, route, { render: false });
  window.onpopstate = back;
}

function back (e) {
  var empty = !(e && e.state && e.state.model);
  if (empty) {
    return;
  }
  var model = e.state.model;
  var route = replaceWith(model);
  partial(state.container, null, model, route);
}

function replaceWith (model) {
  var url = location.pathname;
  var query = orEmpty(location.search) + orEmpty(location.hash);
  var route = router(url + query);
  navigation(route, model, 'replaceState');
  return route;
}

function orEmpty (value) {
  return value || '';
}

function navigation (route, model, direction) {
  state.model = model;
  if (model.title) {
    document.title = model.title;
  }
  if (modern && direction !== 'replaceState' || nativeReplace) {
    history[direction]({ model: model }, model.title, route.url);
  }
}

module.exports = {
  start: start,
  go: go
};

},{"./emitter":17,"./fetcher":19,"./isNative":23,"./partial":27,"./router":28,"./state":29}],15:[function(require,module,exports){
'use strict';

var once = require('./once');
var raw = require('./stores/raw');
var idb = require('./stores/idb');
var stores = [raw, idb];

function clone (value) {
  return JSON.parse(JSON.stringify(value));
}

function get (url, done) {
  var i = 0;

  function next () {
    var gotOnce = once(got);
    var store = stores[i++];
    if (store) {
      store.get(url, gotOnce);
      setTimeout(gotOnce, store === idb ? 100 : 50); // at worst, spend 150ms on caching layers
    } else {
      done(true);
    }

    function got (err, item) {
      if (err) {
        next();
      } else if (item && typeof item.expires === 'number' && Date.now() < item.expires) {
        done(false, clone(item.data)); // always return a unique copy
      } else {
        next();
      }
    }
  }

  next();
}

function set (url, data, duration) {
  if (duration < 1) { // sanity
    return;
  }
  var cloned = clone(data); // freeze a copy for our records
  stores.forEach(store);
  function store (s) {
    s.set(url, {
      data: cloned,
      expires: Date.now() + duration
    });
  }
}

module.exports = {
  get: get,
  set: set
};

},{"./once":26,"./stores/idb":30,"./stores/raw":31}],16:[function(require,module,exports){
'use strict';

var cache = require('./cache');
var idb = require('./stores/idb');
var state = require('./state');
var emitter = require('./emitter');
var interceptor = require('./interceptor');
var defaults = 15;
var baseline;

function e (value) {
  return value || '';
}

function setup (duration, route) {
  baseline = parseDuration(duration);
  if (baseline < 1) {
    state.cache = false;
    return;
  }
  interceptor.add(intercept);
  emitter.on('fetch.done', persist);
  state.cache = true;
}

function intercept (e) {
  cache.get(e.url, result);

  function result (err, data) {
    if (!err && data) {
      e.preventDefault(data);
    }
  }
}

function parseDuration (value) {
  if (value === true) {
    return baseline || defaults;
  }
  if (typeof value === 'number') {
    return value;
  }
  return 0;
}

function persist (route, context, data) {
  if (!state.cache) {
    return;
  }
  var key = route.parts.pathname + e(route.parts.query);
  var d = route.cache !== void 0 ? route.cache : baseline;
  cache.set(key, data, parseDuration(d) * 1000);
}

function ready (fn) {
  if (state.cache) {
    idb.tested(fn); // wait on idb compatibility tests
  } else {
    fn(); // caching is a no-op
  }
}

module.exports = {
  setup: setup,
  persist: persist,
  ready: ready
};

},{"./cache":15,"./emitter":17,"./interceptor":22,"./state":29,"./stores/idb":30}],17:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');

module.exports = emitter({}, { throws: false });

},{"contra.emitter":34}],18:[function(require,module,exports){
'use strict';

function add (element, type, fn) {
  if (element.addEventListener) {
    element.addEventListener(type, fn);
  } else if (element.attachEvent) {
    element.attachEvent('on' + type, wrapperFactory(element, fn));
  } else {
    element['on' + type] = fn;
  }
}

function wrapperFactory (element, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || window.event;
    e.target = e.target || e.srcElement;
    e.preventDefault  = e.preventDefault  || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    fn.call(element, e);
  };
}

module.exports = {
  add: add
};

},{}],19:[function(require,module,exports){
'use strict';

var xhr = require('./xhr');
var emitter = require('./emitter');
var interceptor = require('./interceptor');
var lastXhr = {};

function e (value) {
  return value || '';
}

function jsonify (route) {
  var parts = route.parts;
  var qs = e(parts.search);
  var p = qs ? '&' : '?';
  return parts.pathname + qs + p + 'json';
}

function abort (source) {
  if (lastXhr[source]) {
    lastXhr[source].abort();
  }
}

function abortPending () {
  Object.keys(lastXhr).forEach(abort);
  lastXhr = {};
}

function fetcher (route, context, done) {
  var url = route.url;
  if (lastXhr[context.source]) {
    lastXhr[context.source].abort();
    lastXhr[context.source] = null;
  }
  interceptor.execute(route, afterInterceptors);

  function afterInterceptors (err, result) {
    if (!err && result.defaultPrevented) {
      done(null, result.model);
    } else {
      emitter.emit('fetch.start', route, context);
      lastXhr[context.source] = xhr(jsonify(route), notify);
    }
  }

  function notify (err, data) {
    if (err) {
      if (err.message === 'aborted') {
        emitter.emit('fetch.abort', route, context);
      } else {
        emitter.emit('fetch.error', route, context, err);
      }
    } else {
      emitter.emit('fetch.done', route, context, data);
    }
    done(err, data);
  }
}

fetcher.abortPending = abortPending;

module.exports = fetcher;

},{"./emitter":17,"./interceptor":22,"./xhr":33}],20:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var links = require('./links');

function attach () {
  emitter.on('start', links);
}

module.exports = {
  attach: attach
};

},{"./emitter":17,"./links":24}],21:[function(require,module,exports){
'use strict';

var state = require('./state');
var interceptor = require('./interceptor');
var activator = require('./activator');
var emitter = require('./emitter');
var hooks = require('./hooks');
var partial = require('./partial');
var mount = require('./mount');
var router = require('./router');

hooks.attach();

module.exports = {
  mount: mount,
  partial: partial.standalone,
  on: emitter.on.bind(emitter),
  once: emitter.once.bind(emitter),
  off: emitter.off.bind(emitter),
  intercept: interceptor.add,
  navigate: activator.go,
  state: state,
  route: router
};

},{"./activator":14,"./emitter":17,"./hooks":20,"./interceptor":22,"./mount":25,"./partial":27,"./router":28,"./state":29}],22:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');
var once = require('./once');
var router = require('./router');
var interceptors = emitter({ count: 0 }, { async: true });

function getInterceptorEvent (url, route) {
  var e = {
    url: url,
    route: route,
    parts: route.parts,
    model: null,
    defaultPrevented: false,
    preventDefault: once(preventDefault)
  };

  function preventDefault (model) {
    e.defaultPrevented = true;
    e.model = model;
  }

  return e;
}

function add (action, fn) {
  if (arguments.length === 1) {
    fn = action;
    action = '*';
  }
  interceptors.count++;
  interceptors.on(action, fn);
}

function executeSync (route) {
  var e = getInterceptorEvent(route.url, route);

  interceptors.emit('*', e);
  interceptors.emit(route.action, e);

  return e;
}

function execute (route, done) {
  var e = getInterceptorEvent(route.url, route);
  if (interceptors.count === 0) { // fail fast
    end(); return;
  }
  var fn = once(end);
  var preventDefaultBase = e.preventDefault;

  e.preventDefault = once(preventDefaultEnds);

  interceptors.emit('*', e);
  interceptors.emit(route.action, e);

  setTimeout(fn, 200); // at worst, spend 200ms waiting on interceptors

  function preventDefaultEnds () {
    preventDefaultBase.apply(null, arguments);
    fn();
  }

  function end () {
    done(null, e);
  }
}

module.exports = {
  add: add,
  execute: execute
};

},{"./once":26,"./router":28,"contra.emitter":34}],23:[function(require,module,exports){
'use strict';

// source: https://gist.github.com/jdalton/5e34d890105aca44399f
// thanks @jdalton!

var toString = Object.prototype.toString; // used to resolve the internal `[[Class]]` of values
var fnToString = Function.prototype.toString; // used to resolve the decompiled source of functions
var host = /^\[object .+?Constructor\]$/; // used to detect host constructors (Safari > 4; really typed array specific)

// Escape any special regexp characters.
var specials = /[.*+?^${}()|[\]\/\\]/g;

// Replace mentions of `toString` with `.*?` to keep the template generic.
// Replace thing like `for ...` to support environments, like Rhino, which add extra
// info such as method arity.
var extras = /toString|(function).*?(?=\\\()| for .+?(?=\\\])/g;

// Compile a regexp using a common native method as a template.
// We chose `Object#toString` because there's a good chance it is not being mucked with.
var fnString = String(toString).replace(specials, '\\$&').replace(extras, '$1.*?');
var reNative = new RegExp('^' + fnString + '$');

function isNative (value) {
  var type = typeof value;
  if (type === 'function') {
    // Use `Function#toString` to bypass the value's own `toString` method
    // and avoid being faked out.
    return reNative.test(fnToString.call(value));
  }

  // Fallback to a host object check because some environments will represent
  // things like typed arrays as DOM methods which may not conform to the
  // normal native pattern.
  return (value && type === 'object' && host.test(toString.call(value))) || false;
}

module.exports = isNative;

},{}],24:[function(require,module,exports){
'use strict';

var state = require('./state');
var router = require('./router');
var events = require('./events');
var fetcher = require('./fetcher');
var activator = require('./activator');
var origin = document.location.origin;
var leftClick = 1;
var prefetching = [];
var clicksOnHold = [];

function links () {
  if (state.prefetch && state.cache) { // prefetch without cache makes no sense
    events.add(document.body, 'mouseover', maybePrefetch);
    events.add(document.body, 'touchstart', maybePrefetch);
  }
  events.add(document.body, 'click', maybeReroute);
}

function so (anchor) {
  return anchor.origin === origin;
}

function leftClickOnAnchor (e, anchor) {
  return anchor.pathname && e.which === leftClick && !e.metaKey && !e.ctrlKey;
}

function targetOrAnchor (e) {
  var anchor = e.target;
  while (anchor) {
    if (anchor.tagName === 'A') {
      return anchor;
    }
    anchor = anchor.parentElement;
  }
}

function maybeReroute (e) {
  var anchor = targetOrAnchor(e);
  if (anchor && so(anchor) && leftClickOnAnchor(e, anchor)) {
    reroute(e, anchor);
  }
}

function maybePrefetch (e) {
  var anchor = targetOrAnchor(e);
  if (anchor && so(anchor)) {
    prefetch(e, anchor);
  }
}

function scrollInto (id) {
  var elem = document.getElementById(id);
  if (elem && elem.scrollIntoView) {
    elem.scrollIntoView();
  }
}

function noop () {}

function getRoute (anchor, fail) {
  var url = anchor.pathname + anchor.search + anchor.hash;
  if (url === location.pathname + location.search + anchor.hash) {
    (fail || noop)();
    return; // anchor hash-navigation on same page ignores router
  }
  var route = router(url);
  if (!route || route.ignore) {
    return;
  }
  return route;
}

function reroute (e, anchor) {
  var route = getRoute(anchor, fail);
  if (!route) {
    return;
  }

  prevent();

  if (prefetching.indexOf(anchor) !== -1) {
    clicksOnHold.push(anchor);
    return;
  }

  activator.go(route.url, { context: anchor });

  function fail () {
    if (anchor.hash === location.hash) {
      scrollInto(anchor.hash.substr(1));
      prevent();
    }
  }

  function prevent () { e.preventDefault(); }
}

function prefetch (e, anchor) {
  var route = getRoute(anchor);
  if (!route) {
    return;
  }

  if (prefetching.indexOf(anchor) !== -1) {
    return;
  }

  prefetching.push(anchor);
  fetcher(route, { element: anchor, source: 'prefetch' }, resolved);

  function resolved (err, data) {
    prefetching.splice(prefetching.indexOf(anchor), 1);
    if (clicksOnHold.indexOf(anchor) !== -1) {
      clicksOnHold.splice(clicksOnHold.indexOf(anchor), 1);
      activator.go(route.url, { context: anchor });
    }
  }
}

module.exports = links;

},{"./activator":14,"./events":18,"./fetcher":19,"./router":28,"./state":29}],25:[function(require,module,exports){
(function (global){
'use strict';

var unescape = require('./unescape');
var state = require('./state');
var router = require('./router');
var activator = require('./activator');
var caching = require('./caching');
var fetcher = require('./fetcher');
var g = global;
var mounted;
var booted;

function orEmpty (value) {
  return value || '';
}

function mount (container, wiring, options) {
  var o = options || {};
  if (mounted) {
    throw new Error('Taunus already mounted!');
  }
  if (!container || !container.tagName) { // naïve is enough
    throw new Error('You must define an application root container!');
  }

  mounted = true;

  state.container = container;
  state.controllers = wiring.controllers;
  state.templates = wiring.templates;
  state.routes = wiring.routes;
  state.prefetch = !!o.prefetch;

  router.setup(wiring.routes);

  var url = location.pathname;
  var query = orEmpty(location.search) + orEmpty(location.hash);
  var route = router(url + query);

  caching.setup(o.cache, route);
  caching.ready(kickstart);

  function kickstart () {
    if (!o.bootstrap) { o.bootstrap = 'auto'; }
    if (o.bootstrap === 'auto') {
      autoboot();
    } else if (o.bootstrap === 'inline') {
      inlineboot();
    } else if (o.bootstrap === 'manual') {
      manualboot();
    }
  }

  function autoboot () {
    fetcher(route, { element: container, source: 'boot' }, fetched);
  }

  function fetched (err, data) {
    if (err) {
      throw new Error('Fetching JSON data model for first view failed.');
    }
    boot(data);
  }

  function inlineboot () {
    var id = container.getAttribute('data-taunus');
    var script = document.getElementById(id);
    var model = JSON.parse(unescape(script.innerText || script.textContent));
    boot(model);
  }

  function manualboot () {
    if (typeof g.taunusReady === 'function') {
      g.taunusReady = boot; // not yet an object? turn it into the boot method
    } else {
      boot(g.taunusReady); // already an object? boot with that as the model
    }
  }

  function boot (model) {
    if (booted) { // sanity
      return;
    }
    if (!model || typeof model !== 'object') {
      throw new Error('Taunus model must be an object!');
    }
    booted = true;
    caching.persist(route, state.container, model);
    activator.start(model);
  }
}

module.exports = mount;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./activator":14,"./caching":16,"./fetcher":19,"./router":28,"./state":29,"./unescape":32}],26:[function(require,module,exports){
'use strict';

module.exports = function (fn) {
  var used;
  return function once () {
    if (used) { return; } used = true;
    return fn.apply(this, arguments);
  };
};

},{}],27:[function(require,module,exports){
'use strict';

var raf = require('raf');
var state = require('./state');
var emitter = require('./emitter');

function positioning () {
  var target;
  var hash = location.hash;
  if (hash) {
    target = document.getElementById(hash.slice(1));
  }
  if (!target) {
    target = document.documentElement;
  }
  raf(focusin);
  function focusin () {
    target.scrollIntoView();
  }
}

function partial (container, enforcedAction, model, route, options) {
  var action = enforcedAction || model && model.action || route && route.action;
  var controller = state.controllers[action];
  var internals = options || {};
  if (internals.render !== false) {
    container.innerHTML = render(action, model);
    if (internals.routed !== false) {
      positioning();
    }
  }
  emitter.emit('render', container, model);
  if (controller) {
    controller(model, route, container);
  }
}

function render (action, model) {
  var template = state.templates[action];
  try {
    return template(model);
  } catch (e) {
    throw new Error('Error rendering "' + action + '" template\n' + e.stack);
  }
}

function standalone (container, action, model, route) {
  return partial(container, action, model, route, { routed: false });
}

partial.standalone = standalone;

module.exports = partial;

},{"./emitter":17,"./state":29,"raf":37}],28:[function(require,module,exports){
'use strict';

var url = require('fast-url-parser');
var routes = require('routes');
var matcher = routes();

function router (raw) {
  var parts = url.parse(raw);
  var result = matcher.match(parts.pathname);
  var route = result ? result.fn(result) : null;
  if (route) {
    route.url = raw;
    route.parts = parts;
  }
  return route;
}

function setup (definitions) {
  Object.keys(definitions).forEach(define.bind(null, definitions));
}

function define (definitions, key) {
  matcher.addRoute(key, function definition (match) {
    var params = match.params;
    params.args = match.splats;
    return {
      route: key,
      params: params,
      action: definitions[key].action || null,
      ignore: definitions[key].ignore,
      cache: definitions[key].cache
    };
  });
}

router.setup = setup;

module.exports = router;

},{"fast-url-parser":36,"routes":39}],29:[function(require,module,exports){
'use strict';

module.exports = {
  container: null
};

},{}],30:[function(require,module,exports){
(function (global){
'use strict';

var api = {};
var g = global;
var idb = g.indexedDB || g.mozIndexedDB || g.webkitIndexedDB || g.msIndexedDB;
var supports;
var db;
var dbName = 'taunus-cache';
var store = 'view-models';
var keyPath = 'url';
var setQueue = [];
var testedQueue = [];

function noop () {}

function test () {
  var key = 'indexed-db-feature-detection';
  var req;
  var db;

  if (!(idb && 'deleteDatabase' in idb)) {
    support(false); return;
  }

  try {
    idb.deleteDatabase(key).onsuccess = transactionalTest;
  } catch (e) {
    support(false);
  }

  function transactionalTest () {
    req = idb.open(key, 1);
    req.onupgradeneeded = upgneeded;
    req.onerror = error;
    req.onsuccess = success;

    function upgneeded () {
      req.result.createObjectStore('store');
    }

    function success () {
      db = req.result;
      try {
        db.transaction('store', 'readwrite').objectStore('store').add(new Blob(), 'key');
      } catch (e) {
        support(false);
      } finally {
        db.close();
        idb.deleteDatabase(key);
        if (supports !== false) {
          open();
        }
      }
    }

    function error () {
      support(false);
    }
  }
}

function open () {
  var req = idb.open(dbName, 1);
  req.onerror = error;
  req.onupgradeneeded = upgneeded;
  req.onsuccess = success;

  function upgneeded () {
    req.result.createObjectStore(store, { keyPath: keyPath });
  }

  function success () {
    db = req.result;
    api.name = 'IndexedDB';
    api.get = get;
    api.set = set;
    drainSet();
    support(true);
  }

  function error () {
    support(false);
  }
}

function fallback () {
  api.name = 'IndexedDB-fallbackStore';
  api.get = undefinedGet;
  api.set = enqueueSet;
}

function undefinedGet (key, done) {
  done(null, null);
}

function enqueueSet (key,  value, done) {
  if (setQueue.length > 2) { // let's not waste any more memory
    return;
  }
  if (supports !== false) { // let's assume the capability is validated soon
    setQueue.push({ key: key, value: value, done: done });
  }
}

function drainSet () {
  while (setQueue.length) {
    var item = setQueue.shift();
    set(item.key, item.value, item.done);
  }
}

function query (op, value, done) {
  var req = db.transaction(store, 'readwrite').objectStore(store)[op](value);

  req.onsuccess = success;
  req.onerror = error;

  function success () {
    (done || noop)(null, req.result);
  }

  function error () {
    (done || noop)(new Error('Taunus cache query failed at IndexedDB!'));
  }
}

function get (key, done) {
  query('get', key, done);
}

function set (key, value, done) {
  value[keyPath] = key;
  query('add', value, done); // attempt to insert
  query('put', value, done); // attempt to update
}

function drainTested () {
  while (testedQueue.length) {
    testedQueue.shift()();
  }
}

function tested (fn) {
  if (supports !== void 0) {
    fn();
  } else {
    testedQueue.push(fn);
  }
}

function support (value) {
  if (supports !== void 0) {
    return; // sanity
  }
  supports = value;
  drainTested();
}

function failed () {
  support(false);
}

fallback();
test();
setTimeout(failed, 600); // the test can take somewhere near 300ms to complete

module.exports = api;

api.tested = tested;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],31:[function(require,module,exports){
'use strict';

var raw = {};

function noop () {}

function get (key, done) {
  done(null, raw[key]);
}

function set (key, value, done) {
  raw[key] = value;
  (done || noop)(null);
}

module.exports = {
  name: 'memoryStore',
  get: get,
  set: set
};

},{}],32:[function(require,module,exports){
'use strict';

var reEscapedHtml = /&(?:amp|lt|gt|quot|#39|#96);/g;
var htmlUnescapes = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&#96;': '`'
};

function unescapeHtmlChar (c) {
  return htmlUnescapes[c];
}

function unescape (input) {
  var data = input == null ? '' : String(input);
  if (data && (reEscapedHtml.lastIndex = 0, reEscapedHtml.test(data))) {
    return data.replace(reEscapedHtml, unescapeHtmlChar);
  }
  return data;
}

module.exports = unescape;

},{}],33:[function(require,module,exports){
'use strict';

var xhr = require('xhr');
var emitter = require('./emitter');

module.exports = function (url, done) {
  var options = {
    url: url,
    json: true,
    headers: { Accept: 'application/json' }
  };
  var req = xhr(options, handle);

  return req;

  function handle (err, res, body) {
    if (err && !req.getAllResponseHeaders()) {
      done(new Error('aborted'));
    } else {
      done(err, body);
    }
  }
};

},{"./emitter":17,"xhr":40}],34:[function(require,module,exports){
module.exports = require('./src/contra.emitter.js');

},{"./src/contra.emitter.js":35}],35:[function(require,module,exports){
(function (process){
(function (root, undefined) {
  'use strict';

  var undef = '' + undefined;
  function atoa (a, n) { return Array.prototype.slice.call(a, n); }
  function debounce (fn, args, ctx) { if (!fn) { return; } tick(function run () { fn.apply(ctx || null, args || []); }); }

  // cross-platform ticker
  var si = typeof setImmediate === 'function', tick;
  if (si) {
    tick = function (fn) { setImmediate(fn); };
  } else if (typeof process !== undef && process.nextTick) {
    tick = process.nextTick;
  } else {
    tick = function (fn) { setTimeout(fn, 0); };
  }

  function _emitter (thing, options) {
    var opts = options || {};
    var evt = {};
    if (thing === undefined) { thing = {}; }
    thing.on = function (type, fn) {
      if (!evt[type]) {
        evt[type] = [fn];
      } else {
        evt[type].push(fn);
      }
      return thing;
    };
    thing.once = function (type, fn) {
      fn._once = true; // thing.off(fn) still works!
      thing.on(type, fn);
      return thing;
    };
    thing.off = function (type, fn) {
      var c = arguments.length;
      if (c === 1) {
        delete evt[type];
      } else if (c === 0) {
        evt = {};
      } else {
        var et = evt[type];
        if (!et) { return thing; }
        et.splice(et.indexOf(fn), 1);
      }
      return thing;
    };
    thing.emit = function () {
      var ctx = this;
      var args = atoa(arguments);
      var type = args.shift();
      var et = evt[type];
      if (type === 'error' && opts.throws !== false && !et) { throw args.length === 1 ? args[0] : args; }
      if (!et) { return thing; }
      evt[type] = et.filter(function emitter (listen) {
        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
        return !listen._once;
      });
      return thing;
    };
    return thing;
  }

  // cross-platform export
  if (typeof module !== undef && module.exports) {
    module.exports = _emitter;
  } else {
    root.contra = root.contra || {};
    root.contra.emitter = _emitter;
  }
})(this);

}).call(this,require("/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],36:[function(require,module,exports){
"use strict";
/*
Copyright (c) 2014 Petka Antonov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
function Url() {
    //For more efficient internal representation and laziness.
    //The non-underscore versions of these properties are accessor functions
    //defined on the prototype.
    this._protocol = null;
    this._href = "";
    this._port = -1;
    this._query = null;

    this.auth = null;
    this.slashes = null;
    this.host = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.pathname = null;

    this._prependSlash = false;
}

var querystring = require("querystring");
Url.prototype.parse =
function Url$parse(str, parseQueryString, hostDenotesSlash) {
    if (typeof str !== "string") {
        throw new TypeError("Parameter 'url' must be a string, not " +
            typeof str);
    }
    var start = 0;
    var end = str.length - 1;

    //Trim leading and trailing ws
    while (str.charCodeAt(start) <= 0x20 /*' '*/) start++;
    while (str.charCodeAt(end) <= 0x20 /*' '*/) end--;

    start = this._parseProtocol(str, start, end);

    //Javascript doesn't have host
    if (this._protocol !== "javascript") {
        start = this._parseHost(str, start, end, hostDenotesSlash);
        var proto = this._protocol;
        if (!this.hostname &&
            (this.slashes || (proto && !slashProtocols[proto]))) {
            this.hostname = this.host = "";
        }
    }

    if (start <= end) {
        var ch = str.charCodeAt(start);

        if (ch === 0x2F /*'/'*/) {
            this._parsePath(str, start, end);
        }
        else if (ch === 0x3F /*'?'*/) {
            this._parseQuery(str, start, end);
        }
        else if (ch === 0x23 /*'#'*/) {
            this._parseHash(str, start, end);
        }
        else if (this._protocol !== "javascript") {
            this._parsePath(str, start, end);
        }
        else { //For javascript the pathname is just the rest of it
            this.pathname = str.slice(start, end + 1 );
        }

    }

    if (!this.pathname && this.hostname &&
        this._slashProtocols[this._protocol]) {
        this.pathname = "/";
    }

    if (parseQueryString) {
        var search = this.search;
        if (search == null) {
            search = this.search = "";
        }
        if (search.charCodeAt(0) === 0x3F /*'?'*/) {
            search = search.slice(1);
        }
        //This calls a setter function, there is no .query data property
        this.query = querystring.parse(search);
    }
};

Url.prototype.resolve = function Url$resolve(relative) {
    return this.resolveObject(Url.parse(relative, false, true)).format();
};

Url.prototype.format = function Url$format() {
    var auth = this.auth || "";

    if (auth) {
        auth = encodeURIComponent(auth);
        auth = auth.replace(/%3A/i, ":");
        auth += "@";
    }

    var protocol = this.protocol || "";
    var pathname = this.pathname || "";
    var hash = this.hash || "";
    var search = this.search || "";
    var query = "";
    var hostname = this.hostname || "";
    var port = this.port || "";
    var host = false;
    var scheme = "";

    //Cache the result of the getter function
    var q = this.query;
    if (q && typeof q === "object") {
        query = querystring.stringify(q);
    }

    if (!search) {
        search = query ? "?" + query : "";
    }

    if (protocol && protocol.charCodeAt(protocol.length - 1) !== 0x3A /*':'*/)
        protocol += ":";

    if (this.host) {
        host = auth + this.host;
    }
    else if (hostname) {
        var ip6 = hostname.indexOf(":") > -1;
        if (ip6) hostname = "[" + hostname + "]";
        host = auth + hostname + (port ? ":" + port : "");
    }

    var slashes = this.slashes ||
        ((!protocol ||
        slashProtocols[protocol]) && host !== false);


    if (protocol) scheme = protocol + (slashes ? "//" : "");
    else if (slashes) scheme = "//";

    if (slashes && pathname && pathname.charCodeAt(0) !== 0x2F /*'/'*/) {
        pathname = "/" + pathname;
    }
    else if (!slashes && pathname === "/") {
        pathname = "";
    }
    if (search && search.charCodeAt(0) !== 0x3F /*'?'*/)
        search = "?" + search;
    if (hash && hash.charCodeAt(0) !== 0x23 /*'#'*/)
        hash = "#" + hash;

    pathname = escapePathName(pathname);
    search = escapeSearch(search);

    return scheme + (host === false ? "" : host) + pathname + search + hash;
};

Url.prototype.resolveObject = function Url$resolveObject(relative) {
    if (typeof relative === "string")
        relative = Url.parse(relative, false, true);

    var result = this._clone();

    // hash is always overridden, no matter what.
    // even href="" will remove it.
    result.hash = relative.hash;

    // if the relative url is empty, then there"s nothing left to do here.
    if (!relative.href) {
        result._href = "";
        return result;
    }

    // hrefs like //foo/bar always cut to the protocol.
    if (relative.slashes && !relative._protocol) {
        relative._copyPropsTo(result, true);

        if (slashProtocols[result._protocol] &&
            result.hostname && !result.pathname) {
            result.pathname = "/";
        }
        result._href = "";
        return result;
    }

    if (relative._protocol && relative._protocol !== result._protocol) {
        // if it"s a known url protocol, then changing
        // the protocol does weird things
        // first, if it"s not file:, then we MUST have a host,
        // and if there was a path
        // to begin with, then we MUST have a path.
        // if it is file:, then the host is dropped,
        // because that"s known to be hostless.
        // anything else is assumed to be absolute.
        if (!slashProtocols[relative._protocol]) {
            relative._copyPropsTo(result, false);
            result._href = "";
            return result;
        }

        result._protocol = relative._protocol;
        if (!relative.host && relative._protocol !== "javascript") {
            var relPath = (relative.pathname || "").split("/");
            while (relPath.length && !(relative.host = relPath.shift()));
            if (!relative.host) relative.host = "";
            if (!relative.hostname) relative.hostname = "";
            if (relPath[0] !== "") relPath.unshift("");
            if (relPath.length < 2) relPath.unshift("");
            result.pathname = relPath.join("/");
        } else {
            result.pathname = relative.pathname;
        }

        result.search = relative.search;
        result.host = relative.host || "";
        result.auth = relative.auth;
        result.hostname = relative.hostname || relative.host;
        result._port = relative._port;
        result.slashes = result.slashes || relative.slashes;
        result._href = "";
        return result;
    }

    var isSourceAbs =
        (result.pathname && result.pathname.charCodeAt(0) === 0x2F /*'/'*/);
    var isRelAbs = (
            relative.host ||
            (relative.pathname &&
            relative.pathname.charCodeAt(0) === 0x2F /*'/'*/)
        );
    var mustEndAbs = (isRelAbs || isSourceAbs ||
                        (result.host && relative.pathname));

    var removeAllDots = mustEndAbs;

    var srcPath = result.pathname && result.pathname.split("/") || [];
    var relPath = relative.pathname && relative.pathname.split("/") || [];
    var psychotic = result._protocol && !slashProtocols[result._protocol];

    // if the url is a non-slashed url, then relative
    // links like ../.. should be able
    // to crawl up to the hostname, as well.  This is strange.
    // result.protocol has already been set by now.
    // Later on, put the first path part into the host field.
    if (psychotic) {
        result.hostname = "";
        result._port = -1;
        if (result.host) {
            if (srcPath[0] === "") srcPath[0] = result.host;
            else srcPath.unshift(result.host);
        }
        result.host = "";
        if (relative._protocol) {
            relative.hostname = "";
            relative._port = -1;
            if (relative.host) {
                if (relPath[0] === "") relPath[0] = relative.host;
                else relPath.unshift(relative.host);
            }
            relative.host = "";
        }
        mustEndAbs = mustEndAbs && (relPath[0] === "" || srcPath[0] === "");
    }

    if (isRelAbs) {
        // it"s absolute.
        result.host = relative.host ?
            relative.host : result.host;
        result.hostname = relative.hostname ?
            relative.hostname : result.hostname;
        result.search = relative.search;
        srcPath = relPath;
        // fall through to the dot-handling below.
    } else if (relPath.length) {
        // it"s relative
        // throw away the existing file, and take the new path instead.
        if (!srcPath) srcPath = [];
        srcPath.pop();
        srcPath = srcPath.concat(relPath);
        result.search = relative.search;
    } else if (relative.search) {
        // just pull out the search.
        // like href="?foo".
        // Put this after the other two cases because it simplifies the booleans
        if (psychotic) {
            result.hostname = result.host = srcPath.shift();
            //occationaly the auth can get stuck only in host
            //this especialy happens in cases like
            //url.resolveObject("mailto:local1@domain1", "local2@domain2")
            var authInHost = result.host && result.host.indexOf("@") > 0 ?
                result.host.split("@") : false;
            if (authInHost) {
                result.auth = authInHost.shift();
                result.host = result.hostname = authInHost.shift();
            }
        }
        result.search = relative.search;
        result._href = "";
        return result;
    }

    if (!srcPath.length) {
        // no path at all.  easy.
        // we"ve already handled the other stuff above.
        result.pathname = null;
        result._href = "";
        return result;
    }

    // if a url ENDs in . or .., then it must get a trailing slash.
    // however, if it ends in anything else non-slashy,
    // then it must NOT get a trailing slash.
    var last = srcPath.slice(-1)[0];
    var hasTrailingSlash = (
        (result.host || relative.host) && (last === "." || last === "..") ||
        last === "");

    // strip single dots, resolve double dots to parent dir
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = srcPath.length; i >= 0; i--) {
        last = srcPath[i];
        if (last == ".") {
            srcPath.splice(i, 1);
        } else if (last === "..") {
            srcPath.splice(i, 1);
            up++;
        } else if (up) {
            srcPath.splice(i, 1);
            up--;
        }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (!mustEndAbs && !removeAllDots) {
        for (; up--; up) {
            srcPath.unshift("..");
        }
    }

    if (mustEndAbs && srcPath[0] !== "" &&
        (!srcPath[0] || srcPath[0].charCodeAt(0) !== 0x2F /*'/'*/)) {
        srcPath.unshift("");
    }

    if (hasTrailingSlash && (srcPath.join("/").substr(-1) !== "/")) {
        srcPath.push("");
    }

    var isAbsolute = srcPath[0] === "" ||
        (srcPath[0] && srcPath[0].charCodeAt(0) === 0x2F /*'/'*/);

    // put the host back
    if (psychotic) {
        result.hostname = result.host = isAbsolute ? "" :
            srcPath.length ? srcPath.shift() : "";
        //occationaly the auth can get stuck only in host
        //this especialy happens in cases like
        //url.resolveObject("mailto:local1@domain1", "local2@domain2")
        var authInHost = result.host && result.host.indexOf("@") > 0 ?
            result.host.split("@") : false;
        if (authInHost) {
            result.auth = authInHost.shift();
            result.host = result.hostname = authInHost.shift();
        }
    }

    mustEndAbs = mustEndAbs || (result.host && srcPath.length);

    if (mustEndAbs && !isAbsolute) {
        srcPath.unshift("");
    }

    result.pathname = srcPath.length === 0 ? null : srcPath.join("/");
    result.auth = relative.auth || result.auth;
    result.slashes = result.slashes || relative.slashes;
    result._href = "";
    return result;
};

var punycode = require("punycode");
Url.prototype._hostIdna = function Url$_hostIdna(hostname) {
    // IDNA Support: Returns a puny coded representation of "domain".
    // It only converts the part of the domain name that
    // has non ASCII characters. I.e. it dosent matter if
    // you call it with a domain that already is in ASCII.
    var domainArray = hostname.split(".");
    var newOut = [];
    for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            "xn--" + punycode.encode(s) : s);
    }
    return newOut.join(".");
};

var escapePathName = Url.prototype._escapePathName =
function Url$_escapePathName(pathname) {
    if (!containsCharacter2(pathname, 0x23 /*'#'*/, 0x3F /*'?'*/)) {
        return pathname;
    }
    //Avoid closure creation to keep this inlinable
    return _escapePath(pathname);
};

var escapeSearch = Url.prototype._escapeSearch =
function Url$_escapeSearch(search) {
    if (!containsCharacter2(search, 0x23 /*'#'*/, -1)) return search;
    //Avoid closure creation to keep this inlinable
    return _escapeSearch(search);
};

Url.prototype._parseProtocol = function Url$_parseProtocol(str, start, end) {
    var doLowerCase = false;
    var protocolCharacters = this._protocolCharacters;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (ch === 0x3A /*':'*/) {
            var protocol = str.slice(start, i);
            if (doLowerCase) protocol = protocol.toLowerCase();
            this._protocol = protocol;
            return i + 1;
        }
        else if (protocolCharacters[ch] === 1) {
            if (ch < 0x61 /*'a'*/)
                doLowerCase = true;
        }
        else {
            return start;
        }

    }
    return start;
};

Url.prototype._parseAuth = function Url$_parseAuth(str, start, end, decode) {
    var auth = str.slice(start, end + 1);
    if (decode) {
        auth = decodeURIComponent(auth);
    }
    this.auth = auth;
};

Url.prototype._parsePort = function Url$_parsePort(str, start, end) {
    //Internal format is integer for more efficient parsing
    //and for efficient trimming of leading zeros
    var port = 0;
    //Distinguish between :0 and : (no port number at all)
    var hadChars = false;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (0x30 /*'0'*/ <= ch && ch <= 0x39 /*'9'*/) {
            port = (10 * port) + (ch - 0x30 /*'0'*/);
            hadChars = true;
        }
        else break;

    }
    if (port === 0 && !hadChars) {
        return 0;
    }

    this._port = port;
    return i - start;
};

Url.prototype._parseHost =
function Url$_parseHost(str, start, end, slashesDenoteHost) {
    var hostEndingCharacters = this._hostEndingCharacters;
    if (str.charCodeAt(start) === 0x2F /*'/'*/ &&
        str.charCodeAt(start + 1) === 0x2F /*'/'*/) {
        this.slashes = true;

        //The string starts with //
        if (start === 0) {
            //The string is just "//"
            if (end < 2) return start;
            //If slashes do not denote host and there is no auth,
            //there is no host when the string starts with //
            var hasAuth =
                containsCharacter(str, 0x40 /*'@'*/, 2, hostEndingCharacters);
            if (!hasAuth && !slashesDenoteHost) {
                this.slashes = null;
                return start;
            }
        }
        //There is a host that starts after the //
        start += 2;
    }
    //If there is no slashes, there is no hostname if
    //1. there was no protocol at all
    else if (!this._protocol ||
        //2. there was a protocol that requires slashes
        //e.g. in 'http:asd' 'asd' is not a hostname
        slashProtocols[this._protocol]
    ) {
        return start;
    }

    var doLowerCase = false;
    var idna = false;
    var hostNameStart = start;
    var hostNameEnd = end;
    var lastCh = -1;
    var portLength = 0;
    var charsAfterDot = 0;
    var authNeedsDecoding = false;

    var j = -1;

    //Find the last occurrence of an @-sign until hostending character is met
    //also mark if decoding is needed for the auth portion
    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (ch === 0x40 /*'@'*/) {
            j = i;
        }
        //This check is very, very cheap. Unneeded decodeURIComponent is very
        //very expensive
        else if (ch === 0x25 /*'%'*/) {
            authNeedsDecoding = true;
        }
        else if (hostEndingCharacters[ch] === 1) {
            break;
        }
    }

    //@-sign was found at index j, everything to the left from it
    //is auth part
    if (j > -1) {
        this._parseAuth(str, start, j - 1, authNeedsDecoding);
        //hostname starts after the last @-sign
        start = hostNameStart = j + 1;
    }

    //Host name is starting with a [
    if (str.charCodeAt(start) === 0x5B /*'['*/) {
        for (var i = start + 1; i <= end; ++i) {
            var ch = str.charCodeAt(i);

            //Assume valid IP6 is between the brackets
            if (ch === 0x5D /*']'*/) {
                if (str.charCodeAt(i + 1) === 0x3A /*':'*/) {
                    portLength = this._parsePort(str, i + 2, end) + 1;
                }
                var hostname = str.slice(start + 1, i).toLowerCase();
                this.hostname = hostname;
                this.host = this._port > 0
                    ? "[" + hostname + "]:" + this._port
                    : "[" + hostname + "]";
                this.pathname = "/";
                return i + portLength + 1;
            }
        }
        //Empty hostname, [ starts a path
        return start;
    }

    for (var i = start; i <= end; ++i) {
        if (charsAfterDot > 62) {
            this.hostname = this.host = str.slice(start, i);
            return i;
        }
        var ch = str.charCodeAt(i);

        if (ch === 0x3A /*':'*/) {
            portLength = this._parsePort(str, i + 1, end) + 1;
            hostNameEnd = i - 1;
            break;
        }
        else if (ch < 0x61 /*'a'*/) {
            if (ch === 0x2E /*'.'*/) {
                //Node.js ignores this error
                /*
                if (lastCh === DOT || lastCh === -1) {
                    this.hostname = this.host = "";
                    return start;
                }
                */
                charsAfterDot = -1;
            }
            else if (0x41 /*'A'*/ <= ch && ch <= 0x5A /*'Z'*/) {
                doLowerCase = true;
            }
            else if (!(ch === 0x2D /*'-'*/ || ch === 0x5F /*'_'*/ ||
                (0x30 /*'0'*/ <= ch && ch <= 0x39 /*'9'*/))) {
                if (hostEndingCharacters[ch] === 0 &&
                    this._noPrependSlashHostEnders[ch] === 0) {
                    this._prependSlash = true;
                }
                hostNameEnd = i - 1;
                break;
            }
        }
        else if (ch >= 0x7B /*'{'*/) {
            if (ch <= 0x7E /*'~'*/) {
                if (this._noPrependSlashHostEnders[ch] === 0) {
                    this._prependSlash = true;
                }
                hostNameEnd = i - 1;
                break;
            }
            idna = true;
        }
        lastCh = ch;
        charsAfterDot++;
    }

    //Node.js ignores this error
    /*
    if (lastCh === DOT) {
        hostNameEnd--;
    }
    */

    if (hostNameEnd + 1 !== start &&
        hostNameEnd - hostNameStart <= 256) {
        var hostname = str.slice(hostNameStart, hostNameEnd + 1);
        if (doLowerCase) hostname = hostname.toLowerCase();
        if (idna) hostname = this._hostIdna(hostname);
        this.hostname = hostname;
        this.host = this._port > 0 ? hostname + ":" + this._port : hostname;
    }

    return hostNameEnd + 1 + portLength;

};

Url.prototype._copyPropsTo = function Url$_copyPropsTo(input, noProtocol) {
    if (!noProtocol) {
        input._protocol = this._protocol;
    }
    input._href = this._href;
    input._port = this._port;
    input._prependSlash = this._prependSlash;
    input.auth = this.auth;
    input.slashes = this.slashes;
    input.host = this.host;
    input.hostname = this.hostname;
    input.hash = this.hash;
    input.search = this.search;
    input.pathname = this.pathname;
};

Url.prototype._clone = function Url$_clone() {
    var ret = new Url();
    ret._protocol = this._protocol;
    ret._href = this._href;
    ret._port = this._port;
    ret._prependSlash = this._prependSlash;
    ret.auth = this.auth;
    ret.slashes = this.slashes;
    ret.host = this.host;
    ret.hostname = this.hostname;
    ret.hash = this.hash;
    ret.search = this.search;
    ret.pathname = this.pathname;
    return ret;
};

Url.prototype._getComponentEscaped =
function Url$_getComponentEscaped(str, start, end) {
    var cur = start;
    var i = start;
    var ret = "";
    var autoEscapeMap = this._autoEscapeMap;
    for (; i <= end; ++i) {
        var ch = str.charCodeAt(i);
        var escaped = autoEscapeMap[ch];

        if (escaped !== "") {
            if (cur < i) ret += str.slice(cur, i);
            ret += escaped;
            cur = i + 1;
        }
    }
    if (cur < i + 1) ret += str.slice(cur, i);
    return ret;
};

Url.prototype._parsePath =
function Url$_parsePath(str, start, end) {
    var pathStart = start;
    var pathEnd = end;
    var escape = false;
    var autoEscapeCharacters = this._autoEscapeCharacters;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);
        if (ch === 0x23 /*'#'*/) {
            this._parseHash(str, i, end);
            pathEnd = i - 1;
            break;
        }
        else if (ch === 0x3F /*'?'*/) {
            this._parseQuery(str, i, end);
            pathEnd = i - 1;
            break;
        }
        else if (!escape && autoEscapeCharacters[ch] === 1) {
            escape = true;
        }
    }

    if (pathStart > pathEnd) {
        this.pathname = "/";
        return;
    }

    var path;
    if (escape) {
        path = this._getComponentEscaped(str, pathStart, pathEnd);
    }
    else {
        path = str.slice(pathStart, pathEnd + 1);
    }
    this.pathname = this._prependSlash ? "/" + path : path;
};

Url.prototype._parseQuery = function Url$_parseQuery(str, start, end) {
    var queryStart = start;
    var queryEnd = end;
    var escape = false;
    var autoEscapeCharacters = this._autoEscapeCharacters;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (ch === 0x23 /*'#'*/) {
            this._parseHash(str, i, end);
            queryEnd = i - 1;
            break;
        }
        else if (!escape && autoEscapeCharacters[ch] === 1) {
            escape = true;
        }
    }

    if (queryStart > queryEnd) {
        this.search = "";
        return;
    }

    var query;
    if (escape) {
        query = this._getComponentEscaped(str, queryStart, queryEnd);
    }
    else {
        query = str.slice(queryStart, queryEnd + 1);
    }
    this.search = query;
};

Url.prototype._parseHash = function Url$_parseHash(str, start, end) {
    if (start > end) {
        this.hash = "";
        return;
    }
    this.hash = this._getComponentEscaped(str, start, end);
};

Object.defineProperty(Url.prototype, "port", {
    get: function() {
        if (this._port >= 0) {
            return ("" + this._port);
        }
        return null;
    },
    set: function(v) {
        if (v == null) {
            this._port = -1;
        }
        else {
            this._port = parseInt(v, 10);
        }
    }
});

Object.defineProperty(Url.prototype, "query", {
    get: function() {
        var query = this._query;
        if (query != null) {
            return query;
        }
        var search = this.search;

        if (search) {
            if (search.charCodeAt(0) === 0x3F /*'?'*/) {
                search = search.slice(1);
            }
            if (search !== "") {
                this._query = search;
                return search;
            }
        }
        return search;
    },
    set: function(v) {
        this._query = v;
    }
});

Object.defineProperty(Url.prototype, "path", {
    get: function() {
        var p = this.pathname || "";
        var s = this.search || "";
        if (p || s) {
            return p + s;
        }
        return (p == null && s) ? ("/" + s) : null;
    },
    set: function() {}
});

Object.defineProperty(Url.prototype, "protocol", {
    get: function() {
        var proto = this._protocol;
        return proto ? proto + ":" : proto;
    },
    set: function(v) {
        if (typeof v === "string") {
            var end = v.length - 1;
            if (v.charCodeAt(end) === 0x3A /*':'*/) {
                this._protocol = v.slice(0, end);
            }
            else {
                this._protocol = v;
            }
        }
        else if (v == null) {
            this._protocol = null;
        }
    }
});

Object.defineProperty(Url.prototype, "href", {
    get: function() {
        var href = this._href;
        if (!href) {
            href = this._href = this.format();
        }
        return href;
    },
    set: function(v) {
        this._href = v;
    }
});

Url.parse = function Url$Parse(str, parseQueryString, hostDenotesSlash) {
    if (str instanceof Url) return str;
    var ret = new Url();
    ret.parse(str, !!parseQueryString, !!hostDenotesSlash);
    return ret;
};

Url.format = function Url$Format(obj) {
    if (typeof obj === "string") {
        obj = Url.parse(obj);
    }
    if (!(obj instanceof Url)) {
        return Url.prototype.format.call(obj);
    }
    return obj.format();
};

Url.resolve = function Url$Resolve(source, relative) {
    return Url.parse(source, false, true).resolve(relative);
};

Url.resolveObject = function Url$ResolveObject(source, relative) {
    if (!source) return relative;
    return Url.parse(source, false, true).resolveObject(relative);
};

function _escapePath(pathname) {
    return pathname.replace(/[?#]/g, function(match) {
        return encodeURIComponent(match);
    });
}

function _escapeSearch(search) {
    return search.replace(/#/g, function(match) {
        return encodeURIComponent(match);
    });
}

//Search `char1` (integer code for a character) in `string`
//starting from `fromIndex` and ending at `string.length - 1`
//or when a stop character is found
function containsCharacter(string, char1, fromIndex, stopCharacterTable) {
    var len = string.length;
    for (var i = fromIndex; i < len; ++i) {
        var ch = string.charCodeAt(i);

        if (ch === char1) {
            return true;
        }
        else if (stopCharacterTable[ch] === 1) {
            return false;
        }
    }
    return false;
}

//See if `char1` or `char2` (integer codes for characters)
//is contained in `string`
function containsCharacter2(string, char1, char2) {
    for (var i = 0, len = string.length; i < len; ++i) {
        var ch = string.charCodeAt(i);
        if (ch === char1 || ch === char2) return true;
    }
    return false;
}

//Makes an array of 128 uint8's which represent boolean values.
//Spec is an array of ascii code points or ascii code point ranges
//ranges are expressed as [start, end]

//Create a table with the characters 0x30-0x39 (decimals '0' - '9') and
//0x7A (lowercaseletter 'z') as `true`:
//
//var a = makeAsciiTable([[0x30, 0x39], 0x7A]);
//a[0x30]; //1
//a[0x15]; //0
//a[0x35]; //1
function makeAsciiTable(spec) {
    var ret = new Uint8Array(128);
    spec.forEach(function(item){
        if (typeof item === "number") {
            ret[item] = 1;
        }
        else {
            var start = item[0];
            var end = item[1];
            for (var j = start; j <= end; ++j) {
                ret[j] = 1;
            }
        }
    });

    return ret;
}


var autoEscape = ["<", ">", "\"", "`", " ", "\r", "\n",
    "\t", "{", "}", "|", "\\", "^", "`", "'"];

var autoEscapeMap = new Array(128);



for (var i = 0, len = autoEscapeMap.length; i < len; ++i) {
    autoEscapeMap[i] = "";
}

for (var i = 0, len = autoEscape.length; i < len; ++i) {
    var c = autoEscape[i];
    var esc = encodeURIComponent(c);
    if (esc === c) {
        esc = escape(c);
    }
    autoEscapeMap[c.charCodeAt(0)] = esc;
}


var slashProtocols = Url.prototype._slashProtocols = {
    http: true,
    https: true,
    gopher: true,
    file: true,
    ftp: true,

    "http:": true,
    "https:": true,
    "gopher:": true,
    "file:": true,
    "ftp:": true
};

//Optimize back from normalized object caused by non-identifier keys
function f(){}
f.prototype = slashProtocols;

Url.prototype._protocolCharacters = makeAsciiTable([
    [0x61 /*'a'*/, 0x7A /*'z'*/],
    [0x41 /*'A'*/, 0x5A /*'Z'*/],
    0x2E /*'.'*/, 0x2B /*'+'*/, 0x2D /*'-'*/
]);

Url.prototype._hostEndingCharacters = makeAsciiTable([
    0x23 /*'#'*/, 0x3F /*'?'*/, 0x2F /*'/'*/
]);

Url.prototype._autoEscapeCharacters = makeAsciiTable(
    autoEscape.map(function(v) {
        return v.charCodeAt(0);
    })
);

//If these characters end a host name, the path will not be prepended a /
Url.prototype._noPrependSlashHostEnders = makeAsciiTable(
    [
        "<", ">", "'", "`", " ", "\r",
        "\n", "\t", "{", "}", "|", "\\",
        "^", "`", "\"", "%", ";"
    ].map(function(v) {
        return v.charCodeAt(0);
    })
);

Url.prototype._autoEscapeMap = autoEscapeMap;

module.exports = Url;

Url.replace = function Url$Replace() {
    require.cache["url"] = {
        exports: Url
    };
};

},{"punycode":2,"querystring":5}],37:[function(require,module,exports){
var now = require('performance-now')
  , global = typeof window === 'undefined' ? {} : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = global['request' + suffix]
  , caf = global['cancel' + suffix] || global['cancelRequest' + suffix]
  , isNative = true

for(var i = 0; i < vendors.length && !raf; i++) {
  raf = global[vendors[i] + 'Request' + suffix]
  caf = global[vendors[i] + 'Cancel' + suffix]
      || global[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  isNative = false

  var last = 0
    , id = 0
    , queue = []
    , frameDuration = 1000 / 60

  raf = function(callback) {
    if(queue.length === 0) {
      var _now = now()
        , next = Math.max(0, frameDuration - (_now - last))
      last = next + _now
      setTimeout(function() {
        var cp = queue.slice(0)
        // Clear queue here to prevent
        // callbacks from appending listeners
        // to the current frame's queue
        queue.length = 0
        for(var i = 0; i < cp.length; i++) {
          if(!cp[i].cancelled) {
            try{
              cp[i].callback(last)
            } catch(e) {
              setTimeout(function() { throw e }, 0)
            }
          }
        }
      }, Math.round(next))
    }
    queue.push({
      handle: ++id,
      callback: callback,
      cancelled: false
    })
    return id
  }

  caf = function(handle) {
    for(var i = 0; i < queue.length; i++) {
      if(queue[i].handle === handle) {
        queue[i].cancelled = true
      }
    }
  }
}

module.exports = function(fn) {
  // Wrap in a new function to prevent
  // `cancel` potentially being assigned
  // to the native rAF function
  if(!isNative) {
    return raf.call(global, fn)
  }
  return raf.call(global, function() {
    try{
      fn.apply(this, arguments)
    } catch(e) {
      setTimeout(function() { throw e }, 0)
    }
  })
}
module.exports.cancel = function() {
  caf.apply(global, arguments)
}

},{"performance-now":38}],38:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.6.3
(function() {
  var getNanoSeconds, hrtime, loadTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - loadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    loadTime = getNanoSeconds();
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);

/*
//@ sourceMappingURL=performance-now.map
*/

}).call(this,require("/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],39:[function(require,module,exports){
(function (global){
!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.routes=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){

var localRoutes = [];


/**
 * Convert path to route object
 *
 * A string or RegExp should be passed,
 * will return { re, src, keys} obj
 *
 * @param  {String / RegExp} path
 * @return {Object}
 */

var Route = function(path){
  //using 'new' is optional

  var src, re, keys = [];

  if(path instanceof RegExp){
    re = path;
    src = path.toString();
  }else{
    re = pathToRegExp(path, keys);
    src = path;
  }

  return {
  	 re: re,
  	 src: path.toString(),
  	 keys: keys
  }
};

/**
 * Normalize the given path string,
 * returning a regular expression.
 *
 * An empty array should be passed,
 * which will contain the placeholder
 * key names. For example "/user/:id" will
 * then contain ["id"].
 *
 * @param  {String} path
 * @param  {Array} keys
 * @return {RegExp}
 */
var pathToRegExp = function (path, keys) {
	path = path
		.concat('/?')
		.replace(/\/\(/g, '(?:/')
		.replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?|\*/g, function(_, slash, format, key, capture, optional){
			if (_ === "*"){
				keys.push(undefined);
				return _;
			}

			keys.push(key);
			slash = slash || '';
			return ''
				+ (optional ? '' : slash)
				+ '(?:'
				+ (optional ? slash : '')
				+ (format || '') + (capture || '([^/]+?)') + ')'
				+ (optional || '');
		})
		.replace(/([\/.])/g, '\\$1')
		.replace(/\*/g, '(.*)');
	return new RegExp('^' + path + '$', 'i');
};

/**
 * Attempt to match the given request to
 * one of the routes. When successful
 * a  {fn, params, splats} obj is returned
 *
 * @param  {Array} routes
 * @param  {String} uri
 * @return {Object}
 */
var match = function (routes, uri, startAt) {
	var captures, i = startAt || 0;

	for (var len = routes.length; i < len; ++i) {
		var route = routes[i],
		    re = route.re,
		    keys = route.keys,
		    splats = [],
		    params = {};

		if (captures = uri.match(re)) {
			for (var j = 1, len = captures.length; j < len; ++j) {
				var key = keys[j-1],
					val = typeof captures[j] === 'string'
						? unescape(captures[j])
						: captures[j];
				if (key) {
					params[key] = val;
				} else {
					splats.push(val);
				}
			}
			return {
				params: params,
				splats: splats,
				route: route.src,
				next: i + 1
			};
		}
	}
};

/**
 * Default "normal" router constructor.
 * accepts path, fn tuples via addRoute
 * returns {fn, params, splats, route}
 *  via match
 *
 * @return {Object}
 */

var Router = function(){
  //using 'new' is optional
  return {
    routes: [],
    routeMap : {},
    addRoute: function(path, fn){
      if (!path) throw new Error(' route requires a path');
      if (!fn) throw new Error(' route ' + path.toString() + ' requires a callback');

      var route = Route(path);
      route.fn = fn;

      this.routes.push(route);
      this.routeMap[path] = fn;
    },

    match: function(pathname, startAt){
      var route = match(this.routes, pathname, startAt);
      if(route){
        route.fn = this.routeMap[route.route];
        route.next = this.match.bind(this, pathname, route.next)
      }
      return route;
    }
  }
};

Router.Route = Route
Router.pathToRegExp = pathToRegExp
Router.match = match
// back compat
Router.Router = Router

module.exports = Router

},{}]},{},[1])
(1)
});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],40:[function(require,module,exports){
var window = require("global/window")
var once = require("once")
var parseHeaders = require('parse-headers')

var messages = {
    "0": "Internal XMLHttpRequest Error",
    "4": "4xx Client Error",
    "5": "5xx Server Error"
}

var XHR = window.XMLHttpRequest || noop
var XDR = "withCredentials" in (new XHR()) ? XHR : window.XDomainRequest

module.exports = createXHR

function createXHR(options, callback) {
    if (typeof options === "string") {
        options = { uri: options }
    }

    options = options || {}
    callback = once(callback)

    var xhr = options.xhr || null

    if (!xhr) {
        if (options.cors || options.useXDR) {
            xhr = new XDR()
        }else{
            xhr = new XHR()
        }
    }

    var uri = xhr.url = options.uri || options.url
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var key
    var load = options.response ? loadResponse : loadXhr

    if ("json" in options) {
        isJson = true
        headers["Accept"] = "application/json"
        if (method !== "GET" && method !== "HEAD") {
            headers["Content-Type"] = "application/json"
            body = JSON.stringify(options.json)
        }
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = load
    xhr.onerror = error
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    // hate IE
    xhr.ontimeout = noop
    xhr.open(method, uri, !sync)
                                    //backward compatibility
    if (options.withCredentials || (options.cors && options.withCredentials !== false)) {
        xhr.withCredentials = true
    }

    // Cannot set timeout with sync request
    if (!sync) {
        xhr.timeout = "timeout" in options ? options.timeout : 5000
    }

    if (xhr.setRequestHeader) {
        for(key in headers){
            if(headers.hasOwnProperty(key)){
                xhr.setRequestHeader(key, headers[key])
            }
        }
    } else if (options.headers) {
        throw new Error("Headers cannot be set on an XDomainRequest object")
    }

    if ("responseType" in options) {
        xhr.responseType = options.responseType
    }
    
    if ("beforeSend" in options && 
        typeof options.beforeSend === "function"
    ) {
        options.beforeSend(xhr)
    }

    xhr.send(body)

    return xhr

    function readystatechange() {
        if (xhr.readyState === 4) {
            load()
        }
    }

    function getBody() {
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = null

        if (xhr.response) {
            body = xhr.response
        } else if (xhr.responseType === 'text' || !xhr.responseType) {
            body = xhr.responseText || xhr.responseXML
        }

        if (isJson) {
            try {
                body = JSON.parse(body)
            } catch (e) {}
        }

        return body
    }

    function getStatusCode() {
        return xhr.status === 1223 ? 204 : xhr.status
    }

    // if we're getting a none-ok statusCode, build & return an error
    function errorFromStatusCode(status) {
        var error = null
        if (status === 0 || (status >= 400 && status < 600)) {
            var message = (typeof body === "string" ? body : false) ||
                messages[String(status).charAt(0)]
            error = new Error(message)
            error.statusCode = status
        }

        return error
    }

    // will load the data & process the response in a special response object
    function loadResponse() {
        var status = getStatusCode()
        var error = errorFromStatusCode(status)
        var response = {
            body: getBody(),
            statusCode: status,
            statusText: xhr.statusText,
            raw: xhr
        }
        if(xhr.getAllResponseHeaders){ //remember xhr can in fact be XDR for CORS in IE
            response.headers = parseHeaders(xhr.getAllResponseHeaders())
        } else {
            response.headers = {}
        }

        callback(error, response, response.body)
    }

    // will load the data and add some response properties to the source xhr
    // and then respond with that
    function loadXhr() {
        var status = getStatusCode()
        var error = errorFromStatusCode(status)

        xhr.status = xhr.statusCode = status
        xhr.body = getBody()
        xhr.headers = parseHeaders(xhr.getAllResponseHeaders())

        callback(error, xhr, xhr.body)
    }

    function error(evt) {
        callback(evt, xhr)
    }
}


function noop() {}

},{"global/window":41,"once":42,"parse-headers":46}],41:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],42:[function(require,module,exports){
module.exports = once

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })
})

function once (fn) {
  var called = false
  return function () {
    if (called) return
    called = true
    return fn.apply(this, arguments)
  }
}

},{}],43:[function(require,module,exports){
var isFunction = require('is-function')

module.exports = forEach

var toString = Object.prototype.toString
var hasOwnProperty = Object.prototype.hasOwnProperty

function forEach(list, iterator, context) {
    if (!isFunction(iterator)) {
        throw new TypeError('iterator must be a function')
    }

    if (arguments.length < 3) {
        context = this
    }
    
    if (toString.call(list) === '[object Array]')
        forEachArray(list, iterator, context)
    else if (typeof list === 'string')
        forEachString(list, iterator, context)
    else
        forEachObject(list, iterator, context)
}

function forEachArray(array, iterator, context) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            iterator.call(context, array[i], i, array)
        }
    }
}

function forEachString(string, iterator, context) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        iterator.call(context, string.charAt(i), i, string)
    }
}

function forEachObject(object, iterator, context) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            iterator.call(context, object[k], k, object)
        }
    }
}

},{"is-function":44}],44:[function(require,module,exports){
module.exports = isFunction

var toString = Object.prototype.toString

function isFunction (fn) {
  var string = toString.call(fn)
  return string === '[object Function]' ||
    (typeof fn === 'function' && string !== '[object RegExp]') ||
    (typeof window !== 'undefined' &&
     // IE8 and below
     (fn === window.setTimeout ||
      fn === window.alert ||
      fn === window.confirm ||
      fn === window.prompt))
};

},{}],45:[function(require,module,exports){

exports = module.exports = trim;

function trim(str){
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  return str.replace(/\s*$/, '');
};

},{}],46:[function(require,module,exports){
var trim = require('trim')
  , forEach = require('for-each')
  , isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    }

module.exports = function (headers) {
  if (!headers)
    return {}

  var result = {}

  forEach(
      trim(headers).split('\n')
    , function (row) {
        var index = row.indexOf(':')
          , key = trim(row.slice(0, index)).toLowerCase()
          , value = trim(row.slice(index + 1))

        if (typeof(result[key]) === 'undefined') {
          result[key] = value
        } else if (isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [ result[key], value ]
        }
      }
  )

  return result
}
},{"for-each":43,"trim":45}]},{},[11])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9lcnJvci9ub3QtZm91bmQuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvbGF5b3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3dpcmluZy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vY2xpZW50L2pzL21haW4uanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9qYWR1bS9ub2RlX21vZHVsZXMvamFkZS9ydW50aW1lLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2FjdGl2YXRvci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2NhY2hlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGluZy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2VtaXR0ZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9ldmVudHMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9mZXRjaGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaG9va3MuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2ludGVyY2VwdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaXNOYXRpdmUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9saW5rcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL21vdW50LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvb25jZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3BhcnRpYWwuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9yb3V0ZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdGF0ZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0b3Jlcy9pZGIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdG9yZXMvcmF3LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvdW5lc2NhcGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci94aHIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL2NvbnRyYS5lbWl0dGVyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9zcmMvY29udHJhLmVtaXR0ZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL2Zhc3QtdXJsLXBhcnNlci9zcmMvdXJscGFyc2VyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3JhZi9ub2RlX21vZHVsZXMvcGVyZm9ybWFuY2Utbm93L2xpYi9wZXJmb3JtYW5jZS1ub3cuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3JvdXRlcy9kaXN0L3JvdXRlcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL2dsb2JhbC93aW5kb3cuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvb25jZS9vbmNlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL2Zvci1lYWNoL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL2Zvci1lYWNoL25vZGVfbW9kdWxlcy9pcy1mdW5jdGlvbi9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy90cmltL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvcGFyc2UtaGVhZGVycy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25OQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcGhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKiEgaHR0cDovL210aHMuYmUvcHVueWNvZGUgdjEuMi40IGJ5IEBtYXRoaWFzICovXG47KGZ1bmN0aW9uKHJvb3QpIHtcblxuXHQvKiogRGV0ZWN0IGZyZWUgdmFyaWFibGVzICovXG5cdHZhciBmcmVlRXhwb3J0cyA9IHR5cGVvZiBleHBvcnRzID09ICdvYmplY3QnICYmIGV4cG9ydHM7XG5cdHZhciBmcmVlTW9kdWxlID0gdHlwZW9mIG1vZHVsZSA9PSAnb2JqZWN0JyAmJiBtb2R1bGUgJiZcblx0XHRtb2R1bGUuZXhwb3J0cyA9PSBmcmVlRXhwb3J0cyAmJiBtb2R1bGU7XG5cdHZhciBmcmVlR2xvYmFsID0gdHlwZW9mIGdsb2JhbCA9PSAnb2JqZWN0JyAmJiBnbG9iYWw7XG5cdGlmIChmcmVlR2xvYmFsLmdsb2JhbCA9PT0gZnJlZUdsb2JhbCB8fCBmcmVlR2xvYmFsLndpbmRvdyA9PT0gZnJlZUdsb2JhbCkge1xuXHRcdHJvb3QgPSBmcmVlR2xvYmFsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBgcHVueWNvZGVgIG9iamVjdC5cblx0ICogQG5hbWUgcHVueWNvZGVcblx0ICogQHR5cGUgT2JqZWN0XG5cdCAqL1xuXHR2YXIgcHVueWNvZGUsXG5cblx0LyoqIEhpZ2hlc3QgcG9zaXRpdmUgc2lnbmVkIDMyLWJpdCBmbG9hdCB2YWx1ZSAqL1xuXHRtYXhJbnQgPSAyMTQ3NDgzNjQ3LCAvLyBha2EuIDB4N0ZGRkZGRkYgb3IgMl4zMS0xXG5cblx0LyoqIEJvb3RzdHJpbmcgcGFyYW1ldGVycyAqL1xuXHRiYXNlID0gMzYsXG5cdHRNaW4gPSAxLFxuXHR0TWF4ID0gMjYsXG5cdHNrZXcgPSAzOCxcblx0ZGFtcCA9IDcwMCxcblx0aW5pdGlhbEJpYXMgPSA3Mixcblx0aW5pdGlhbE4gPSAxMjgsIC8vIDB4ODBcblx0ZGVsaW1pdGVyID0gJy0nLCAvLyAnXFx4MkQnXG5cblx0LyoqIFJlZ3VsYXIgZXhwcmVzc2lvbnMgKi9cblx0cmVnZXhQdW55Y29kZSA9IC9eeG4tLS8sXG5cdHJlZ2V4Tm9uQVNDSUkgPSAvW14gLX5dLywgLy8gdW5wcmludGFibGUgQVNDSUkgY2hhcnMgKyBub24tQVNDSUkgY2hhcnNcblx0cmVnZXhTZXBhcmF0b3JzID0gL1xceDJFfFxcdTMwMDJ8XFx1RkYwRXxcXHVGRjYxL2csIC8vIFJGQyAzNDkwIHNlcGFyYXRvcnNcblxuXHQvKiogRXJyb3IgbWVzc2FnZXMgKi9cblx0ZXJyb3JzID0ge1xuXHRcdCdvdmVyZmxvdyc6ICdPdmVyZmxvdzogaW5wdXQgbmVlZHMgd2lkZXIgaW50ZWdlcnMgdG8gcHJvY2VzcycsXG5cdFx0J25vdC1iYXNpYyc6ICdJbGxlZ2FsIGlucHV0ID49IDB4ODAgKG5vdCBhIGJhc2ljIGNvZGUgcG9pbnQpJyxcblx0XHQnaW52YWxpZC1pbnB1dCc6ICdJbnZhbGlkIGlucHV0J1xuXHR9LFxuXG5cdC8qKiBDb252ZW5pZW5jZSBzaG9ydGN1dHMgKi9cblx0YmFzZU1pbnVzVE1pbiA9IGJhc2UgLSB0TWluLFxuXHRmbG9vciA9IE1hdGguZmxvb3IsXG5cdHN0cmluZ0Zyb21DaGFyQ29kZSA9IFN0cmluZy5mcm9tQ2hhckNvZGUsXG5cblx0LyoqIFRlbXBvcmFyeSB2YXJpYWJsZSAqL1xuXHRrZXk7XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBlcnJvciB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgZXJyb3IgdHlwZS5cblx0ICogQHJldHVybnMge0Vycm9yfSBUaHJvd3MgYSBgUmFuZ2VFcnJvcmAgd2l0aCB0aGUgYXBwbGljYWJsZSBlcnJvciBtZXNzYWdlLlxuXHQgKi9cblx0ZnVuY3Rpb24gZXJyb3IodHlwZSkge1xuXHRcdHRocm93IFJhbmdlRXJyb3IoZXJyb3JzW3R5cGVdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgYEFycmF5I21hcGAgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGl0ZXJhdGUgb3Zlci5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5IGFycmF5XG5cdCAqIGl0ZW0uXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgYXJyYXkgb2YgdmFsdWVzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFjayBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcChhcnJheSwgZm4pIHtcblx0XHR2YXIgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXHRcdHdoaWxlIChsZW5ndGgtLSkge1xuXHRcdFx0YXJyYXlbbGVuZ3RoXSA9IGZuKGFycmF5W2xlbmd0aF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJyYXk7XG5cdH1cblxuXHQvKipcblx0ICogQSBzaW1wbGUgYEFycmF5I21hcGAtbGlrZSB3cmFwcGVyIHRvIHdvcmsgd2l0aCBkb21haW4gbmFtZSBzdHJpbmdzLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZS5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5XG5cdCAqIGNoYXJhY3Rlci5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBzdHJpbmcgb2YgY2hhcmFjdGVycyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2tcblx0ICogZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXBEb21haW4oc3RyaW5nLCBmbikge1xuXHRcdHJldHVybiBtYXAoc3RyaW5nLnNwbGl0KHJlZ2V4U2VwYXJhdG9ycyksIGZuKS5qb2luKCcuJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBudW1lcmljIGNvZGUgcG9pbnRzIG9mIGVhY2ggVW5pY29kZVxuXHQgKiBjaGFyYWN0ZXIgaW4gdGhlIHN0cmluZy4gV2hpbGUgSmF2YVNjcmlwdCB1c2VzIFVDUy0yIGludGVybmFsbHksXG5cdCAqIHRoaXMgZnVuY3Rpb24gd2lsbCBjb252ZXJ0IGEgcGFpciBvZiBzdXJyb2dhdGUgaGFsdmVzIChlYWNoIG9mIHdoaWNoXG5cdCAqIFVDUy0yIGV4cG9zZXMgYXMgc2VwYXJhdGUgY2hhcmFjdGVycykgaW50byBhIHNpbmdsZSBjb2RlIHBvaW50LFxuXHQgKiBtYXRjaGluZyBVVEYtMTYuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZW5jb2RlYFxuXHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBkZWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZyBUaGUgVW5pY29kZSBpbnB1dCBzdHJpbmcgKFVDUy0yKS5cblx0ICogQHJldHVybnMge0FycmF5fSBUaGUgbmV3IGFycmF5IG9mIGNvZGUgcG9pbnRzLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmRlY29kZShzdHJpbmcpIHtcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGNvdW50ZXIgPSAwLFxuXHRcdCAgICBsZW5ndGggPSBzdHJpbmcubGVuZ3RoLFxuXHRcdCAgICB2YWx1ZSxcblx0XHQgICAgZXh0cmE7XG5cdFx0d2hpbGUgKGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdHZhbHVlID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdGlmICh2YWx1ZSA+PSAweEQ4MDAgJiYgdmFsdWUgPD0gMHhEQkZGICYmIGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdFx0Ly8gaGlnaCBzdXJyb2dhdGUsIGFuZCB0aGVyZSBpcyBhIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdGV4dHJhID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdFx0aWYgKChleHRyYSAmIDB4RkMwMCkgPT0gMHhEQzAwKSB7IC8vIGxvdyBzdXJyb2dhdGVcblx0XHRcdFx0XHRvdXRwdXQucHVzaCgoKHZhbHVlICYgMHgzRkYpIDw8IDEwKSArIChleHRyYSAmIDB4M0ZGKSArIDB4MTAwMDApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHVubWF0Y2hlZCBzdXJyb2dhdGU7IG9ubHkgYXBwZW5kIHRoaXMgY29kZSB1bml0LCBpbiBjYXNlIHRoZSBuZXh0XG5cdFx0XHRcdFx0Ly8gY29kZSB1bml0IGlzIHRoZSBoaWdoIHN1cnJvZ2F0ZSBvZiBhIHN1cnJvZ2F0ZSBwYWlyXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0XHRcdGNvdW50ZXItLTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBzdHJpbmcgYmFzZWQgb24gYW4gYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5kZWNvZGVgXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGVuY29kZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBjb2RlUG9pbnRzIFRoZSBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgbmV3IFVuaWNvZGUgc3RyaW5nIChVQ1MtMikuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZW5jb2RlKGFycmF5KSB7XG5cdFx0cmV0dXJuIG1hcChhcnJheSwgZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdHZhciBvdXRwdXQgPSAnJztcblx0XHRcdGlmICh2YWx1ZSA+IDB4RkZGRikge1xuXHRcdFx0XHR2YWx1ZSAtPSAweDEwMDAwO1xuXHRcdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlID4+PiAxMCAmIDB4M0ZGIHwgMHhEODAwKTtcblx0XHRcdFx0dmFsdWUgPSAweERDMDAgfCB2YWx1ZSAmIDB4M0ZGO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSk7XG5cdFx0XHRyZXR1cm4gb3V0cHV0O1xuXHRcdH0pLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgYmFzaWMgY29kZSBwb2ludCBpbnRvIGEgZGlnaXQvaW50ZWdlci5cblx0ICogQHNlZSBgZGlnaXRUb0Jhc2ljKClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBjb2RlUG9pbnQgVGhlIGJhc2ljIG51bWVyaWMgY29kZSBwb2ludCB2YWx1ZS5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50IChmb3IgdXNlIGluXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaW4gdGhlIHJhbmdlIGAwYCB0byBgYmFzZSAtIDFgLCBvciBgYmFzZWAgaWZcblx0ICogdGhlIGNvZGUgcG9pbnQgZG9lcyBub3QgcmVwcmVzZW50IGEgdmFsdWUuXG5cdCAqL1xuXHRmdW5jdGlvbiBiYXNpY1RvRGlnaXQoY29kZVBvaW50KSB7XG5cdFx0aWYgKGNvZGVQb2ludCAtIDQ4IDwgMTApIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSAyMjtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDY1IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA2NTtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDk3IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA5Nztcblx0XHR9XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBkaWdpdC9pbnRlZ2VyIGludG8gYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAc2VlIGBiYXNpY1RvRGlnaXQoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGRpZ2l0IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIGJhc2ljIGNvZGUgcG9pbnQgd2hvc2UgdmFsdWUgKHdoZW4gdXNlZCBmb3Jcblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpcyBgZGlnaXRgLCB3aGljaCBuZWVkcyB0byBiZSBpbiB0aGUgcmFuZ2Vcblx0ICogYDBgIHRvIGBiYXNlIC0gMWAuIElmIGBmbGFnYCBpcyBub24temVybywgdGhlIHVwcGVyY2FzZSBmb3JtIGlzXG5cdCAqIHVzZWQ7IGVsc2UsIHRoZSBsb3dlcmNhc2UgZm9ybSBpcyB1c2VkLiBUaGUgYmVoYXZpb3IgaXMgdW5kZWZpbmVkXG5cdCAqIGlmIGBmbGFnYCBpcyBub24temVybyBhbmQgYGRpZ2l0YCBoYXMgbm8gdXBwZXJjYXNlIGZvcm0uXG5cdCAqL1xuXHRmdW5jdGlvbiBkaWdpdFRvQmFzaWMoZGlnaXQsIGZsYWcpIHtcblx0XHQvLyAgMC4uMjUgbWFwIHRvIEFTQ0lJIGEuLnogb3IgQS4uWlxuXHRcdC8vIDI2Li4zNSBtYXAgdG8gQVNDSUkgMC4uOVxuXHRcdHJldHVybiBkaWdpdCArIDIyICsgNzUgKiAoZGlnaXQgPCAyNikgLSAoKGZsYWcgIT0gMCkgPDwgNSk7XG5cdH1cblxuXHQvKipcblx0ICogQmlhcyBhZGFwdGF0aW9uIGZ1bmN0aW9uIGFzIHBlciBzZWN0aW9uIDMuNCBvZiBSRkMgMzQ5Mi5cblx0ICogaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzQ5MiNzZWN0aW9uLTMuNFxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0ZnVuY3Rpb24gYWRhcHQoZGVsdGEsIG51bVBvaW50cywgZmlyc3RUaW1lKSB7XG5cdFx0dmFyIGsgPSAwO1xuXHRcdGRlbHRhID0gZmlyc3RUaW1lID8gZmxvb3IoZGVsdGEgLyBkYW1wKSA6IGRlbHRhID4+IDE7XG5cdFx0ZGVsdGEgKz0gZmxvb3IoZGVsdGEgLyBudW1Qb2ludHMpO1xuXHRcdGZvciAoLyogbm8gaW5pdGlhbGl6YXRpb24gKi87IGRlbHRhID4gYmFzZU1pbnVzVE1pbiAqIHRNYXggPj4gMTsgayArPSBiYXNlKSB7XG5cdFx0XHRkZWx0YSA9IGZsb29yKGRlbHRhIC8gYmFzZU1pbnVzVE1pbik7XG5cdFx0fVxuXHRcdHJldHVybiBmbG9vcihrICsgKGJhc2VNaW51c1RNaW4gKyAxKSAqIGRlbHRhIC8gKGRlbHRhICsgc2tldykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scyB0byBhIHN0cmluZyBvZiBVbmljb2RlXG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGRlY29kZShpbnB1dCkge1xuXHRcdC8vIERvbid0IHVzZSBVQ1MtMlxuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgaW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGgsXG5cdFx0ICAgIG91dCxcblx0XHQgICAgaSA9IDAsXG5cdFx0ICAgIG4gPSBpbml0aWFsTixcblx0XHQgICAgYmlhcyA9IGluaXRpYWxCaWFzLFxuXHRcdCAgICBiYXNpYyxcblx0XHQgICAgaixcblx0XHQgICAgaW5kZXgsXG5cdFx0ICAgIG9sZGksXG5cdFx0ICAgIHcsXG5cdFx0ICAgIGssXG5cdFx0ICAgIGRpZ2l0LFxuXHRcdCAgICB0LFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgYmFzZU1pbnVzVDtcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHM6IGxldCBgYmFzaWNgIGJlIHRoZSBudW1iZXIgb2YgaW5wdXQgY29kZVxuXHRcdC8vIHBvaW50cyBiZWZvcmUgdGhlIGxhc3QgZGVsaW1pdGVyLCBvciBgMGAgaWYgdGhlcmUgaXMgbm9uZSwgdGhlbiBjb3B5XG5cdFx0Ly8gdGhlIGZpcnN0IGJhc2ljIGNvZGUgcG9pbnRzIHRvIHRoZSBvdXRwdXQuXG5cblx0XHRiYXNpYyA9IGlucHV0Lmxhc3RJbmRleE9mKGRlbGltaXRlcik7XG5cdFx0aWYgKGJhc2ljIDwgMCkge1xuXHRcdFx0YmFzaWMgPSAwO1xuXHRcdH1cblxuXHRcdGZvciAoaiA9IDA7IGogPCBiYXNpYzsgKytqKSB7XG5cdFx0XHQvLyBpZiBpdCdzIG5vdCBhIGJhc2ljIGNvZGUgcG9pbnRcblx0XHRcdGlmIChpbnB1dC5jaGFyQ29kZUF0KGopID49IDB4ODApIHtcblx0XHRcdFx0ZXJyb3IoJ25vdC1iYXNpYycpO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0LnB1c2goaW5wdXQuY2hhckNvZGVBdChqKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBkZWNvZGluZyBsb29wOiBzdGFydCBqdXN0IGFmdGVyIHRoZSBsYXN0IGRlbGltaXRlciBpZiBhbnkgYmFzaWMgY29kZVxuXHRcdC8vIHBvaW50cyB3ZXJlIGNvcGllZDsgc3RhcnQgYXQgdGhlIGJlZ2lubmluZyBvdGhlcndpc2UuXG5cblx0XHRmb3IgKGluZGV4ID0gYmFzaWMgPiAwID8gYmFzaWMgKyAxIDogMDsgaW5kZXggPCBpbnB1dExlbmd0aDsgLyogbm8gZmluYWwgZXhwcmVzc2lvbiAqLykge1xuXG5cdFx0XHQvLyBgaW5kZXhgIGlzIHRoZSBpbmRleCBvZiB0aGUgbmV4dCBjaGFyYWN0ZXIgdG8gYmUgY29uc3VtZWQuXG5cdFx0XHQvLyBEZWNvZGUgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlciBpbnRvIGBkZWx0YWAsXG5cdFx0XHQvLyB3aGljaCBnZXRzIGFkZGVkIHRvIGBpYC4gVGhlIG92ZXJmbG93IGNoZWNraW5nIGlzIGVhc2llclxuXHRcdFx0Ly8gaWYgd2UgaW5jcmVhc2UgYGlgIGFzIHdlIGdvLCB0aGVuIHN1YnRyYWN0IG9mZiBpdHMgc3RhcnRpbmdcblx0XHRcdC8vIHZhbHVlIGF0IHRoZSBlbmQgdG8gb2J0YWluIGBkZWx0YWAuXG5cdFx0XHRmb3IgKG9sZGkgPSBpLCB3ID0gMSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cblx0XHRcdFx0aWYgKGluZGV4ID49IGlucHV0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpZ2l0ID0gYmFzaWNUb0RpZ2l0KGlucHV0LmNoYXJDb2RlQXQoaW5kZXgrKykpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA+PSBiYXNlIHx8IGRpZ2l0ID4gZmxvb3IoKG1heEludCAtIGkpIC8gdykpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGkgKz0gZGlnaXQgKiB3O1xuXHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPCB0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdGlmICh3ID4gZmxvb3IobWF4SW50IC8gYmFzZU1pbnVzVCkpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHcgKj0gYmFzZU1pbnVzVDtcblxuXHRcdFx0fVxuXG5cdFx0XHRvdXQgPSBvdXRwdXQubGVuZ3RoICsgMTtcblx0XHRcdGJpYXMgPSBhZGFwdChpIC0gb2xkaSwgb3V0LCBvbGRpID09IDApO1xuXG5cdFx0XHQvLyBgaWAgd2FzIHN1cHBvc2VkIHRvIHdyYXAgYXJvdW5kIGZyb20gYG91dGAgdG8gYDBgLFxuXHRcdFx0Ly8gaW5jcmVtZW50aW5nIGBuYCBlYWNoIHRpbWUsIHNvIHdlJ2xsIGZpeCB0aGF0IG5vdzpcblx0XHRcdGlmIChmbG9vcihpIC8gb3V0KSA+IG1heEludCAtIG4pIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdG4gKz0gZmxvb3IoaSAvIG91dCk7XG5cdFx0XHRpICU9IG91dDtcblxuXHRcdFx0Ly8gSW5zZXJ0IGBuYCBhdCBwb3NpdGlvbiBgaWAgb2YgdGhlIG91dHB1dFxuXHRcdFx0b3V0cHV0LnNwbGljZShpKyssIDAsIG4pO1xuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVjczJlbmNvZGUob3V0cHV0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMgdG8gYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBlbmNvZGUoaW5wdXQpIHtcblx0XHR2YXIgbixcblx0XHQgICAgZGVsdGEsXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50LFxuXHRcdCAgICBiYXNpY0xlbmd0aCxcblx0XHQgICAgYmlhcyxcblx0XHQgICAgaixcblx0XHQgICAgbSxcblx0XHQgICAgcSxcblx0XHQgICAgayxcblx0XHQgICAgdCxcblx0XHQgICAgY3VycmVudFZhbHVlLFxuXHRcdCAgICBvdXRwdXQgPSBbXSxcblx0XHQgICAgLyoqIGBpbnB1dExlbmd0aGAgd2lsbCBob2xkIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgaW4gYGlucHV0YC4gKi9cblx0XHQgICAgaW5wdXRMZW5ndGgsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsXG5cdFx0ICAgIGJhc2VNaW51c1QsXG5cdFx0ICAgIHFNaW51c1Q7XG5cblx0XHQvLyBDb252ZXJ0IHRoZSBpbnB1dCBpbiBVQ1MtMiB0byBVbmljb2RlXG5cdFx0aW5wdXQgPSB1Y3MyZGVjb2RlKGlucHV0KTtcblxuXHRcdC8vIENhY2hlIHRoZSBsZW5ndGhcblx0XHRpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aDtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHN0YXRlXG5cdFx0biA9IGluaXRpYWxOO1xuXHRcdGRlbHRhID0gMDtcblx0XHRiaWFzID0gaW5pdGlhbEJpYXM7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzXG5cdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IDB4ODApIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGN1cnJlbnRWYWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGhhbmRsZWRDUENvdW50ID0gYmFzaWNMZW5ndGggPSBvdXRwdXQubGVuZ3RoO1xuXG5cdFx0Ly8gYGhhbmRsZWRDUENvdW50YCBpcyB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIHRoYXQgaGF2ZSBiZWVuIGhhbmRsZWQ7XG5cdFx0Ly8gYGJhc2ljTGVuZ3RoYCBpcyB0aGUgbnVtYmVyIG9mIGJhc2ljIGNvZGUgcG9pbnRzLlxuXG5cdFx0Ly8gRmluaXNoIHRoZSBiYXNpYyBzdHJpbmcgLSBpZiBpdCBpcyBub3QgZW1wdHkgLSB3aXRoIGEgZGVsaW1pdGVyXG5cdFx0aWYgKGJhc2ljTGVuZ3RoKSB7XG5cdFx0XHRvdXRwdXQucHVzaChkZWxpbWl0ZXIpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZW5jb2RpbmcgbG9vcDpcblx0XHR3aGlsZSAoaGFuZGxlZENQQ291bnQgPCBpbnB1dExlbmd0aCkge1xuXG5cdFx0XHQvLyBBbGwgbm9uLWJhc2ljIGNvZGUgcG9pbnRzIDwgbiBoYXZlIGJlZW4gaGFuZGxlZCBhbHJlYWR5LiBGaW5kIHRoZSBuZXh0XG5cdFx0XHQvLyBsYXJnZXIgb25lOlxuXHRcdFx0Zm9yIChtID0gbWF4SW50LCBqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPj0gbiAmJiBjdXJyZW50VmFsdWUgPCBtKSB7XG5cdFx0XHRcdFx0bSA9IGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmNyZWFzZSBgZGVsdGFgIGVub3VnaCB0byBhZHZhbmNlIHRoZSBkZWNvZGVyJ3MgPG4saT4gc3RhdGUgdG8gPG0sMD4sXG5cdFx0XHQvLyBidXQgZ3VhcmQgYWdhaW5zdCBvdmVyZmxvd1xuXHRcdFx0aGFuZGxlZENQQ291bnRQbHVzT25lID0gaGFuZGxlZENQQ291bnQgKyAxO1xuXHRcdFx0aWYgKG0gLSBuID4gZmxvb3IoKG1heEludCAtIGRlbHRhKSAvIGhhbmRsZWRDUENvdW50UGx1c09uZSkpIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGRlbHRhICs9IChtIC0gbikgKiBoYW5kbGVkQ1BDb3VudFBsdXNPbmU7XG5cdFx0XHRuID0gbTtcblxuXHRcdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IG4gJiYgKytkZWx0YSA+IG1heEludCkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA9PSBuKSB7XG5cdFx0XHRcdFx0Ly8gUmVwcmVzZW50IGRlbHRhIGFzIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXJcblx0XHRcdFx0XHRmb3IgKHEgPSBkZWx0YSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cdFx0XHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblx0XHRcdFx0XHRcdGlmIChxIDwgdCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHFNaW51c1QgPSBxIC0gdDtcblx0XHRcdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKFxuXHRcdFx0XHRcdFx0XHRzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHQgKyBxTWludXNUICUgYmFzZU1pbnVzVCwgMCkpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0cSA9IGZsb29yKHFNaW51c1QgLyBiYXNlTWludXNUKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHEsIDApKSk7XG5cdFx0XHRcdFx0YmlhcyA9IGFkYXB0KGRlbHRhLCBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsIGhhbmRsZWRDUENvdW50ID09IGJhc2ljTGVuZ3RoKTtcblx0XHRcdFx0XHRkZWx0YSA9IDA7XG5cdFx0XHRcdFx0KytoYW5kbGVkQ1BDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQrK2RlbHRhO1xuXHRcdFx0KytuO1xuXG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gVW5pY29kZS4gT25seSB0aGVcblx0ICogUHVueWNvZGVkIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCBvbiBhIHN0cmluZyB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gY29udmVydGVkIHRvXG5cdCAqIFVuaWNvZGUuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBQdW55Y29kZSBkb21haW4gbmFtZSB0byBjb252ZXJ0IHRvIFVuaWNvZGUuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBVbmljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBQdW55Y29kZVxuXHQgKiBzdHJpbmcuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b1VuaWNvZGUoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4UHVueWNvZGUudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gZGVjb2RlKHN0cmluZy5zbGljZSg0KS50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFVuaWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFB1bnljb2RlLiBPbmx5IHRoZVxuXHQgKiBub24tQVNDSUkgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCdzIGFscmVhZHkgaW4gQVNDSUkuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZSB0byBjb252ZXJ0LCBhcyBhIFVuaWNvZGUgc3RyaW5nLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgUHVueWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGRvbWFpbiBuYW1lLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9BU0NJSShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhOb25BU0NJSS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyAneG4tLScgKyBlbmNvZGUoc3RyaW5nKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKiBEZWZpbmUgdGhlIHB1YmxpYyBBUEkgKi9cblx0cHVueWNvZGUgPSB7XG5cdFx0LyoqXG5cdFx0ICogQSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBjdXJyZW50IFB1bnljb2RlLmpzIHZlcnNpb24gbnVtYmVyLlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIFN0cmluZ1xuXHRcdCAqL1xuXHRcdCd2ZXJzaW9uJzogJzEuMi40Jyxcblx0XHQvKipcblx0XHQgKiBBbiBvYmplY3Qgb2YgbWV0aG9kcyB0byBjb252ZXJ0IGZyb20gSmF2YVNjcmlwdCdzIGludGVybmFsIGNoYXJhY3RlclxuXHRcdCAqIHJlcHJlc2VudGF0aW9uIChVQ1MtMikgdG8gVW5pY29kZSBjb2RlIHBvaW50cywgYW5kIGJhY2suXG5cdFx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBPYmplY3Rcblx0XHQgKi9cblx0XHQndWNzMic6IHtcblx0XHRcdCdkZWNvZGUnOiB1Y3MyZGVjb2RlLFxuXHRcdFx0J2VuY29kZSc6IHVjczJlbmNvZGVcblx0XHR9LFxuXHRcdCdkZWNvZGUnOiBkZWNvZGUsXG5cdFx0J2VuY29kZSc6IGVuY29kZSxcblx0XHQndG9BU0NJSSc6IHRvQVNDSUksXG5cdFx0J3RvVW5pY29kZSc6IHRvVW5pY29kZVxuXHR9O1xuXG5cdC8qKiBFeHBvc2UgYHB1bnljb2RlYCAqL1xuXHQvLyBTb21lIEFNRCBidWlsZCBvcHRpbWl6ZXJzLCBsaWtlIHIuanMsIGNoZWNrIGZvciBzcGVjaWZpYyBjb25kaXRpb24gcGF0dGVybnNcblx0Ly8gbGlrZSB0aGUgZm9sbG93aW5nOlxuXHRpZiAoXG5cdFx0dHlwZW9mIGRlZmluZSA9PSAnZnVuY3Rpb24nICYmXG5cdFx0dHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcgJiZcblx0XHRkZWZpbmUuYW1kXG5cdCkge1xuXHRcdGRlZmluZSgncHVueWNvZGUnLCBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBwdW55Y29kZTtcblx0XHR9KTtcblx0fSBlbHNlIGlmIChmcmVlRXhwb3J0cyAmJiAhZnJlZUV4cG9ydHMubm9kZVR5cGUpIHtcblx0XHRpZiAoZnJlZU1vZHVsZSkgeyAvLyBpbiBOb2RlLmpzIG9yIFJpbmdvSlMgdjAuOC4wK1xuXHRcdFx0ZnJlZU1vZHVsZS5leHBvcnRzID0gcHVueWNvZGU7XG5cdFx0fSBlbHNlIHsgLy8gaW4gTmFyd2hhbCBvciBSaW5nb0pTIHYwLjcuMC1cblx0XHRcdGZvciAoa2V5IGluIHB1bnljb2RlKSB7XG5cdFx0XHRcdHB1bnljb2RlLmhhc093blByb3BlcnR5KGtleSkgJiYgKGZyZWVFeHBvcnRzW2tleV0gPSBwdW55Y29kZVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7IC8vIGluIFJoaW5vIG9yIGEgd2ViIGJyb3dzZXJcblx0XHRyb290LnB1bnljb2RlID0gcHVueWNvZGU7XG5cdH1cblxufSh0aGlzKSk7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gSWYgb2JqLmhhc093blByb3BlcnR5IGhhcyBiZWVuIG92ZXJyaWRkZW4sIHRoZW4gY2FsbGluZ1xuLy8gb2JqLmhhc093blByb3BlcnR5KHByb3ApIHdpbGwgYnJlYWsuXG4vLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9qb3llbnQvbm9kZS9pc3N1ZXMvMTcwN1xuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxcywgc2VwLCBlcSwgb3B0aW9ucykge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgdmFyIG9iaiA9IHt9O1xuXG4gIGlmICh0eXBlb2YgcXMgIT09ICdzdHJpbmcnIHx8IHFzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICB2YXIgcmVnZXhwID0gL1xcKy9nO1xuICBxcyA9IHFzLnNwbGl0KHNlcCk7XG5cbiAgdmFyIG1heEtleXMgPSAxMDAwO1xuICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5tYXhLZXlzID09PSAnbnVtYmVyJykge1xuICAgIG1heEtleXMgPSBvcHRpb25zLm1heEtleXM7XG4gIH1cblxuICB2YXIgbGVuID0gcXMubGVuZ3RoO1xuICAvLyBtYXhLZXlzIDw9IDAgbWVhbnMgdGhhdCB3ZSBzaG91bGQgbm90IGxpbWl0IGtleXMgY291bnRcbiAgaWYgKG1heEtleXMgPiAwICYmIGxlbiA+IG1heEtleXMpIHtcbiAgICBsZW4gPSBtYXhLZXlzO1xuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgIHZhciB4ID0gcXNbaV0ucmVwbGFjZShyZWdleHAsICclMjAnKSxcbiAgICAgICAgaWR4ID0geC5pbmRleE9mKGVxKSxcbiAgICAgICAga3N0ciwgdnN0ciwgaywgdjtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAga3N0ciA9IHguc3Vic3RyKDAsIGlkeCk7XG4gICAgICB2c3RyID0geC5zdWJzdHIoaWR4ICsgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtzdHIgPSB4O1xuICAgICAgdnN0ciA9ICcnO1xuICAgIH1cblxuICAgIGsgPSBkZWNvZGVVUklDb21wb25lbnQoa3N0cik7XG4gICAgdiA9IGRlY29kZVVSSUNvbXBvbmVudCh2c3RyKTtcblxuICAgIGlmICghaGFzT3duUHJvcGVydHkob2JqLCBrKSkge1xuICAgICAgb2JqW2tdID0gdjtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgb2JqW2tdLnB1c2godik7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ialtrXSA9IFtvYmpba10sIHZdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvYmo7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzdHJpbmdpZnlQcmltaXRpdmUgPSBmdW5jdGlvbih2KSB7XG4gIHN3aXRjaCAodHlwZW9mIHYpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHY7XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiB2ID8gJ3RydWUnIDogJ2ZhbHNlJztcblxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gaXNGaW5pdGUodikgPyB2IDogJyc7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICcnO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9iaiwgc2VwLCBlcSwgbmFtZSkge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgaWYgKG9iaiA9PT0gbnVsbCkge1xuICAgIG9iaiA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBtYXAob2JqZWN0S2V5cyhvYmopLCBmdW5jdGlvbihrKSB7XG4gICAgICB2YXIga3MgPSBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKGspKSArIGVxO1xuICAgICAgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgICByZXR1cm4gb2JqW2tdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZSh2KSk7XG4gICAgICAgIH0pLmpvaW4oc2VwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqW2tdKSk7XG4gICAgICB9XG4gICAgfSkuam9pbihzZXApO1xuXG4gIH1cblxuICBpZiAoIW5hbWUpIHJldHVybiAnJztcbiAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUobmFtZSkpICsgZXEgK1xuICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmopKTtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG5mdW5jdGlvbiBtYXAgKHhzLCBmKSB7XG4gIGlmICh4cy5tYXApIHJldHVybiB4cy5tYXAoZik7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgIHJlcy5wdXNoKGYoeHNbaV0sIGkpKTtcbiAgfVxuICByZXR1cm4gcmVzO1xufVxuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHJlcy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuZGVjb2RlID0gZXhwb3J0cy5wYXJzZSA9IHJlcXVpcmUoJy4vZGVjb2RlJyk7XG5leHBvcnRzLmVuY29kZSA9IGV4cG9ydHMuc3RyaW5naWZ5ID0gcmVxdWlyZSgnLi9lbmNvZGUnKTtcbiIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFib3V0KGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcIndoeS10YXVudXMtXFxcIj5XaHkgVGF1bnVzPzwvaDE+XFxuPHA+VGF1bnVzIGZvY3VzZXMgb24gZGVsaXZlcmluZyBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgZXhwZXJpZW5jZSB0byB0aGUgZW5kLXVzZXIsIHdoaWxlIHByb3ZpZGluZyA8ZW0+YSByZWFzb25hYmxlIGRldmVsb3BtZW50IGV4cGVyaWVuY2U8L2VtPiBhcyB3ZWxsLiA8c3Ryb25nPlRhdW51cyBwcmlvcml0aXplcyBjb250ZW50PC9zdHJvbmc+LiBJdCB1c2VzIHNlcnZlci1zaWRlIHJlbmRlcmluZyB0byBnZXQgY29udGVudCB0byB5b3VyIGh1bWFucyBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgaXQgdXNlcyBjbGllbnQtc2lkZSByZW5kZXJpbmcgdG8gaW1wcm92ZSB0aGVpciBleHBlcmllbmNlLjwvcD5cXG48cD5XaGlsZSBpdCBmb2N1c2VzIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCA8c3Ryb25nPjxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9hZGp1c3RpbmctdXgtZm9yLWh1bWFuc1xcXCI+dXNhYmlsaXR5PC9hPiBhbmQgcGVyZm9ybWFuY2UgYXJlIGJvdGggY29yZSBjb25jZXJuczwvc3Ryb25nPiBmb3IgVGF1bnVzLiBJbmNpZGVudGFsbHksIGZvY3VzaW5nIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGFsc28gaW1wcm92ZXMgYm90aCBvZiB0aGVzZS4gVXNhYmlsaXR5IGlzIGltcHJvdmVkIGJlY2F1c2UgdGhlIGV4cGVyaWVuY2UgaXMgZ3JhZHVhbGx5IGltcHJvdmVkLCBtZWFuaW5nIHRoYXQgaWYgc29tZXdoZXJlIGFsb25nIHRoZSBsaW5lIGEgZmVhdHVyZSBpcyBtaXNzaW5nLCB0aGUgY29tcG9uZW50IGlzIDxzdHJvbmc+c3RpbGwgZXhwZWN0ZWQgdG8gd29yazwvc3Ryb25nPi48L3A+XFxuPHA+Rm9yIGV4YW1wbGUsIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBzaXRlIHVzZXMgcGxhaW4tb2xkIGxpbmtzIHRvIG5hdmlnYXRlIGZyb20gb25lIHZpZXcgdG8gYW5vdGhlciwgYW5kIHRoZW4gYWRkcyBhIDxjb2RlPmNsaWNrPC9jb2RlPiBldmVudCBoYW5kbGVyIHRoYXQgYmxvY2tzIG5hdmlnYXRpb24gYW5kIGlzc3VlcyBhbiBBSkFYIHJlcXVlc3QgaW5zdGVhZC4gSWYgSmF2YVNjcmlwdCBmYWlscyB0byBsb2FkLCBwZXJoYXBzIHRoZSBleHBlcmllbmNlIG1pZ2h0IHN0YXkgYSBsaXR0bGUgYml0IHdvcnNlLCBidXQgdGhhdCYjMzk7cyBva2F5LCBiZWNhdXNlIHdlIGFja25vd2xlZGdlIHRoYXQgPHN0cm9uZz5vdXIgc2l0ZXMgZG9uJiMzOTt0IG5lZWQgdG8gbG9vayBhbmQgYmVoYXZlIHRoZSBzYW1lIG9uIGV2ZXJ5IGJyb3dzZXI8L3N0cm9uZz4uIFNpbWlsYXJseSwgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2NyaXRpY2FsLXBhdGgtcGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxcIj5wZXJmb3JtYW5jZSBpcyBncmVhdGx5IGVuaGFuY2VkPC9hPiBieSBkZWxpdmVyaW5nIGNvbnRlbnQgdG8gdGhlIGh1bWFuIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCB0aGVuIGFkZGluZyBmdW5jdGlvbmFsaXR5IG9uIHRvcCBvZiB0aGF0LjwvcD5cXG48cD5XaXRoIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCBpZiB0aGUgZnVuY3Rpb25hbGl0eSBuZXZlciBnZXRzIHRoZXJlIGJlY2F1c2UgYSBKYXZhU2NyaXB0IHJlc291cmNlIGZhaWxlZCB0byBsb2FkIGJlY2F1c2UgdGhlIG5ldHdvcmsgZmFpbGVkIDxlbT4obm90IHVuY29tbW9uIGluIHRoZSBtb2JpbGUgZXJhKTwvZW0+IG9yIGJlY2F1c2UgdGhlIHVzZXIgYmxvY2tlZCBKYXZhU2NyaXB0LCB5b3VyIGFwcGxpY2F0aW9uIHdpbGwgc3RpbGwgd29yayE8L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwid2h5LW5vdC1vdGhlci1mcmFtZXdvcmtzLVxcXCI+V2h5IE5vdCBPdGhlciBGcmFtZXdvcmtzPzwvaDE+XFxuPHA+TWFueSBvdGhlciBmcmFtZXdvcmtzIHdlcmVuJiMzOTt0IGRlc2lnbmVkIHdpdGggc2hhcmVkLXJlbmRlcmluZyBpbiBtaW5kLiBDb250ZW50IGlzbiYjMzk7dCBwcmlvcml0aXplZCwgYW5kIGh1bWFucyBhcmUgZXhwZWN0ZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+ZG93bmxvYWQgbW9zdCBvZiBhIHdlYiBwYWdlIGJlZm9yZSB0aGV5IGNhbiBzZWUgYW55IGh1bWFuLWRpZ2VzdGlibGUgY29udGVudDwvYT4uIFdoaWxlIEdvb2dsZSBpcyBnb2luZyB0byByZXNvbHZlIHRoZSBTRU8gaXNzdWVzIHdpdGggZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBzb29uLCBTRU8gaXMgYWxzbyBhIHByb2JsZW0uIEdvb2dsZSBpc24mIzM5O3QgdGhlIG9ubHkgd2ViIGNyYXdsZXIgb3BlcmF0b3Igb3V0IHRoZXJlLCBhbmQgaXQgbWlnaHQgYmUgYSB3aGlsZSBiZWZvcmUgc29jaWFsIG1lZGlhIGxpbmsgY3Jhd2xlcnMgY2F0Y2ggdXAgd2l0aCB0aGVtLjwvcD5cXG48cD5MYXRlbHksIHdlIGNhbiBvYnNlcnZlIG1hbnkgbWF0dXJlIG9wZW4tc291cmNlIGZyYW1ld29ya3MgYXJlIGRyb3BwaW5nIHN1cHBvcnQgZm9yIG9sZGVyIGJyb3dzZXJzLiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSYjMzk7cmUgYXJjaGl0ZWN0ZWQsIHdoZXJlIHRoZSBkZXZlbG9wZXIgaXMgcHV0IGZpcnN0LiA8c3Ryb25nPlRhdW51cyBpcyA8YSBocmVmPVxcXCJodHRwczovL3R3aXR0ZXIuY29tL2hhc2h0YWcvaHVtYW5maXJzdFxcXCI+I2h1bWFuZmlyc3Q8L2E+PC9zdHJvbmc+LCBtZWFuaW5nIHRoYXQgaXQgY29uY2VkZXMgdGhhdCBodW1hbnMgYXJlIG1vcmUgaW1wb3J0YW50IHRoYW4gdGhlIGRldmVsb3BlcnMgYnVpbGRpbmcgdGhlaXIgYXBwbGljYXRpb25zLjwvcD5cXG48cD5Qcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGFwcGxpY2F0aW9ucyBhcmUgYWx3YXlzIGdvaW5nIHRvIGhhdmUgZ3JlYXQgYnJvd3NlciBzdXBwb3J0IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5JiMzOTtyZSBhcmNoaXRlY3RlZC4gQXMgdGhlIG5hbWUgaW1wbGllcywgYSBiYXNlbGluZSBpcyBlc3RhYmxpc2hlZCB3aGVyZSB3ZSBkZWxpdmVyIHRoZSBjb3JlIGV4cGVyaWVuY2UgdG8gdGhlIHVzZXIgPGVtPih0eXBpY2FsbHkgaW4gdGhlIGZvcm0gb2YgcmVhZGFibGUgSFRNTCBjb250ZW50KTwvZW0+LCBhbmQgdGhlbiBlbmhhbmNlIGl0IDxzdHJvbmc+aWYgcG9zc2libGU8L3N0cm9uZz4gdXNpbmcgQ1NTIGFuZCBKYXZhU2NyaXB0LiBCdWlsZGluZyBhcHBsaWNhdGlvbnMgaW4gdGhpcyB3YXkgbWVhbnMgdGhhdCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gcmVhY2ggdGhlIG1vc3QgcGVvcGxlIHdpdGggeW91ciBjb3JlIGV4cGVyaWVuY2UsIGFuZCB5b3UmIzM5O2xsIGFsc28gYmUgYWJsZSB0byBwcm92aWRlIGh1bWFucyBpbiBtb3JlIG1vZGVybiBicm93c2VycyB3aXRoIGFsbCBvZiB0aGUgbGF0ZXN0IGZlYXR1cmVzIGFuZCB0ZWNobm9sb2dpZXMuPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDYsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImZlYXR1cmVzXFxcIj5GZWF0dXJlczwvaDE+XFxuPHA+T3V0IG9mIHRoZSBib3gsIFRhdW51cyBlbnN1cmVzIHRoYXQgeW91ciBzaXRlIHdvcmtzIG9uIGFueSBIVE1MLWVuYWJsZWQgZG9jdW1lbnQgdmlld2VyIGFuZCBldmVuIHRoZSB0ZXJtaW5hbCwgcHJvdmlkaW5nIHN1cHBvcnQgZm9yIHBsYWluIHRleHQgcmVzcG9uc2VzIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPndpdGhvdXQgYW55IGNvbmZpZ3VyYXRpb24gbmVlZGVkPC9hPi4gRXZlbiB3aGlsZSBUYXVudXMgcHJvdmlkZXMgc2hhcmVkLXJlbmRlcmluZyBjYXBhYmlsaXRpZXMsIGl0IG9mZmVycyBjb2RlIHJldXNlIG9mIHZpZXdzIGFuZCByb3V0ZXMsIG1lYW5pbmcgeW91JiMzOTtsbCBvbmx5IGhhdmUgdG8gZGVjbGFyZSB0aGVzZSBvbmNlIGJ1dCB0aGV5JiMzOTtsbCBiZSB1c2VkIGluIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUuPC9wPlxcbjxwPlRhdW51cyBmZWF0dXJlcyBhIHJlYXNvbmFibHkgZW5oYW5jZWQgZXhwZXJpZW5jZSwgd2hlcmUgaWYgZmVhdHVyZXMgYXJlbiYjMzk7dCBhdmFpbGFibGUgb24gYSBicm93c2VyLCB0aGV5JiMzOTtyZSBqdXN0IG5vdCBwcm92aWRlZC4gRm9yIGV4YW1wbGUsIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgbWFrZXMgdXNlIG9mIHRoZSA8Y29kZT5oaXN0b3J5PC9jb2RlPiBBUEkgYnV0IGlmIHRoYXQmIzM5O3Mgbm90IGF2YWlsYWJsZSB0aGVuIGl0JiMzOTtsbCBmYWxsIGJhY2sgdG8gc2ltcGx5IG5vdCBtZWRkbGluZyB3aXRoIGxpbmtzIGluc3RlYWQgb2YgdXNpbmcgYSBjbGllbnQtc2lkZS1vbmx5IGhhc2ggcm91dGVyLjwvcD5cXG48cD5UYXVudXMgY2FuIGRlYWwgd2l0aCB2aWV3IGNhY2hpbmcgb24geW91ciBiZWhhbGYsIGlmIHlvdSBzbyBkZXNpcmUsIHVzaW5nIDxhIGhyZWY9XFxcImh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxcIj5hc3luY2hyb25vdXMgZW1iZWRkZWQgZGF0YWJhc2Ugc3RvcmVzPC9hPiBvbiB0aGUgY2xpZW50LXNpZGUuIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgPGEgaHJlZj1cXFwiaHR0cDovL2Nhbml1c2UuY29tLyNzZWFyY2g9aW5kZXhlZGRiXFxcIj5wcmV0dHkgZ29vZCBicm93c2VyIHN1cHBvcnQgZm9yIEluZGV4ZWREQjwvYT4uIE9mIGNvdXJzZSwgSW5kZXhlZERCIHdpbGwgb25seSBiZSB1c2VkIGlmIGl0JiMzOTtzIGF2YWlsYWJsZSwgYW5kIGlmIGl0JiMzOTtzIG5vdCB0aGVuIHZpZXdzIHdvbiYjMzk7dCBiZSBjYWNoZWQgaW4gdGhlIGNsaWVudC1zaWRlIGJlc2lkZXMgYW4gaW4tbWVtb3J5IHN0b3JlLiA8c3Ryb25nPlRoZSBzaXRlIHdvbiYjMzk7dCBzaW1wbHkgcm9sbCBvdmVyIGFuZCBkaWUsIHRob3VnaC48L3N0cm9uZz48L3A+XFxuPHA+SWYgeW91JiMzOTt2ZSB0dXJuZWQgY2xpZW50LXNpZGUgY2FjaGluZyBvbiwgdGhlbiB5b3UgY2FuIGFsc28gdHVybiBvbiB0aGUgPHN0cm9uZz52aWV3IHByZS1mZXRjaGluZyBmZWF0dXJlPC9zdHJvbmc+LCB3aGljaCB3aWxsIHN0YXJ0IGRvd25sb2FkaW5nIHZpZXdzIGFzIHNvb24gYXMgaHVtYW5zIGhvdmVyIG9uIGxpbmtzLCBhcyB0byBkZWxpdmVyIGEgPGVtPmZhc3RlciBwZXJjZWl2ZWQgaHVtYW4gZXhwZXJpZW5jZTwvZW0+LjwvcD5cXG48cD5UYXVudXMgcHJvdmlkZXMgdGhlIGJhcmUgYm9uZXMgZm9yIHlvdXIgYXBwbGljYXRpb24gc28gdGhhdCB5b3UgY2FuIHNlcGFyYXRlIGNvbmNlcm5zIGludG8gcm91dGVzLCBjb250cm9sbGVycywgbW9kZWxzLCBhbmQgdmlld3MuIFRoZW4gaXQgZ2V0cyBvdXQgb2YgdGhlIHdheSwgYnkgZGVzaWduLiBUaGVyZSBhcmUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5hIGZldyBjb21wbGVtZW50YXJ5IG1vZHVsZXM8L2E+IHlvdSBjYW4gdXNlIHRvIGVuaGFuY2UgeW91ciBkZXZlbG9wbWVudCBleHBlcmllbmNlLCBhcyB3ZWxsLjwvcD5cXG48cD5XaXRoIFRhdW51cyB5b3UmIzM5O2xsIGJlIGluIGNoYXJnZS4gPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+QXJlIHlvdSByZWFkeSB0byBnZXQgc3RhcnRlZD88L2E+PC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNywgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDgsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImZhbWlsaWFyaXR5XFxcIj5GYW1pbGlhcml0eTwvaDE+XFxuPHA+WW91IGNhbiB1c2UgVGF1bnVzIHRvIGRldmVsb3AgYXBwbGljYXRpb25zIHVzaW5nIHlvdXIgZmF2b3JpdGUgTm9kZS5qcyBIVFRQIHNlcnZlciwgPHN0cm9uZz5ib3RoIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBhbmQgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IGFyZSBmdWxseSBzdXBwb3J0ZWQ8L3N0cm9uZz4uIEluIGJvdGggY2FzZXMsIHlvdSYjMzk7bGwgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+YnVpbGQgY29udHJvbGxlcnMgdGhlIHdheSB5b3UmIzM5O3JlIGFscmVhZHkgdXNlZCB0bzwvYT4sIGV4Y2VwdCB5b3Ugd29uJiMzOTt0IGhhdmUgdG8gPGNvZGU+cmVxdWlyZTwvY29kZT4gdGhlIHZpZXcgY29udHJvbGxlcnMgb3IgZGVmaW5lIGFueSB2aWV3IHJvdXRlcyBzaW5jZSBUYXVudXMgd2lsbCBkZWFsIHdpdGggdGhhdCBvbiB5b3VyIGJlaGFsZi4gSW4gdGhlIGNvbnRyb2xsZXJzIHlvdSYjMzk7bGwgYmUgYWJsZSB0byBkbyBldmVyeXRoaW5nIHlvdSYjMzk7cmUgYWxyZWFkeSBhYmxlIHRvIGRvLCBhbmQgdGhlbiB5b3UmIzM5O2xsIGhhdmUgdG8gcmV0dXJuIGEgSlNPTiBtb2RlbCB3aGljaCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIGEgdmlldy48L3A+XFxuPHA+WW91IGNhbiB1c2UgYW55IHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IHlvdSB3YW50LCBwcm92aWRlZCB0aGF0IGl0IGNhbiBiZSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLiBUaGF0JiMzOTtzIGJlY2F1c2UgVGF1bnVzIHRyZWF0cyB2aWV3cyBhcyBtZXJlIEphdmFTY3JpcHQgZnVuY3Rpb25zLCByYXRoZXIgdGhhbiBiZWluZyB0aWVkIGludG8gYSBzcGVjaWZpYyB2aWV3LXJlbmRlcmluZyBlbmdpbmUuPC9wPlxcbjxwPkNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBqdXN0IGZ1bmN0aW9ucywgdG9vLiBZb3UgY2FuIGJyaW5nIHlvdXIgb3duIHNlbGVjdG9yIGVuZ2luZSwgeW91ciBvd24gQUpBWCBsaWJyYXJpZXMsIGFuZCB5b3VyIG93biBkYXRhLWJpbmRpbmcgc29sdXRpb25zLiBJdCBtaWdodCBtZWFuIHRoZXJlJiMzOTtzIGEgYml0IG1vcmUgd29yayBpbnZvbHZlZCBmb3IgeW91LCBidXQgeW91JiMzOTtsbCBhbHNvIGJlIGZyZWUgdG8gcGljayB3aGF0ZXZlciBsaWJyYXJpZXMgeW91JiMzOTtyZSBtb3N0IGNvbWZvcnRhYmxlIHdpdGghIFRoYXQgYmVpbmcgc2FpZCwgVGF1bnVzIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+ZG9lcyByZWNvbW1lbmQgYSBmZXcgbGlicmFyaWVzPC9hPiB0aGF0IHdvcmsgd2VsbCB3aXRoIGl0LjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFdoeSBUYXVudXM/XFxuXFxuICAgIFRhdW51cyBmb2N1c2VzIG9uIGRlbGl2ZXJpbmcgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGV4cGVyaWVuY2UgdG8gdGhlIGVuZC11c2VyLCB3aGlsZSBwcm92aWRpbmcgX2EgcmVhc29uYWJsZSBkZXZlbG9wbWVudCBleHBlcmllbmNlXyBhcyB3ZWxsLiAqKlRhdW51cyBwcmlvcml0aXplcyBjb250ZW50KiouIEl0IHVzZXMgc2VydmVyLXNpZGUgcmVuZGVyaW5nIHRvIGdldCBjb250ZW50IHRvIHlvdXIgaHVtYW5zIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCBpdCB1c2VzIGNsaWVudC1zaWRlIHJlbmRlcmluZyB0byBpbXByb3ZlIHRoZWlyIGV4cGVyaWVuY2UuXFxuXFxuICAgIFdoaWxlIGl0IGZvY3VzZXMgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsICoqW3VzYWJpbGl0eV1bMl0gYW5kIHBlcmZvcm1hbmNlIGFyZSBib3RoIGNvcmUgY29uY2VybnMqKiBmb3IgVGF1bnVzLiBJbmNpZGVudGFsbHksIGZvY3VzaW5nIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGFsc28gaW1wcm92ZXMgYm90aCBvZiB0aGVzZS4gVXNhYmlsaXR5IGlzIGltcHJvdmVkIGJlY2F1c2UgdGhlIGV4cGVyaWVuY2UgaXMgZ3JhZHVhbGx5IGltcHJvdmVkLCBtZWFuaW5nIHRoYXQgaWYgc29tZXdoZXJlIGFsb25nIHRoZSBsaW5lIGEgZmVhdHVyZSBpcyBtaXNzaW5nLCB0aGUgY29tcG9uZW50IGlzICoqc3RpbGwgZXhwZWN0ZWQgdG8gd29yayoqLlxcblxcbiAgICBGb3IgZXhhbXBsZSwgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIHNpdGUgdXNlcyBwbGFpbi1vbGQgbGlua3MgdG8gbmF2aWdhdGUgZnJvbSBvbmUgdmlldyB0byBhbm90aGVyLCBhbmQgdGhlbiBhZGRzIGEgYGNsaWNrYCBldmVudCBoYW5kbGVyIHRoYXQgYmxvY2tzIG5hdmlnYXRpb24gYW5kIGlzc3VlcyBhbiBBSkFYIHJlcXVlc3QgaW5zdGVhZC4gSWYgSmF2YVNjcmlwdCBmYWlscyB0byBsb2FkLCBwZXJoYXBzIHRoZSBleHBlcmllbmNlIG1pZ2h0IHN0YXkgYSBsaXR0bGUgYml0IHdvcnNlLCBidXQgdGhhdCdzIG9rYXksIGJlY2F1c2Ugd2UgYWNrbm93bGVkZ2UgdGhhdCAqKm91ciBzaXRlcyBkb24ndCBuZWVkIHRvIGxvb2sgYW5kIGJlaGF2ZSB0aGUgc2FtZSBvbiBldmVyeSBicm93c2VyKiouIFNpbWlsYXJseSwgW3BlcmZvcm1hbmNlIGlzIGdyZWF0bHkgZW5oYW5jZWRdWzFdIGJ5IGRlbGl2ZXJpbmcgY29udGVudCB0byB0aGUgaHVtYW4gYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIHRoZW4gYWRkaW5nIGZ1bmN0aW9uYWxpdHkgb24gdG9wIG9mIHRoYXQuXFxuXFxuICAgIFdpdGggcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIGlmIHRoZSBmdW5jdGlvbmFsaXR5IG5ldmVyIGdldHMgdGhlcmUgYmVjYXVzZSBhIEphdmFTY3JpcHQgcmVzb3VyY2UgZmFpbGVkIHRvIGxvYWQgYmVjYXVzZSB0aGUgbmV0d29yayBmYWlsZWQgXyhub3QgdW5jb21tb24gaW4gdGhlIG1vYmlsZSBlcmEpXyBvciBiZWNhdXNlIHRoZSB1c2VyIGJsb2NrZWQgSmF2YVNjcmlwdCwgeW91ciBhcHBsaWNhdGlvbiB3aWxsIHN0aWxsIHdvcmshXFxuXFxuICAgIFsxXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2NyaXRpY2FsLXBhdGgtcGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxuICAgIFsyXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2FkanVzdGluZy11eC1mb3ItaHVtYW5zXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBXaHkgTm90IE90aGVyIEZyYW1ld29ya3M/XFxuXFxuICAgIE1hbnkgb3RoZXIgZnJhbWV3b3JrcyB3ZXJlbid0IGRlc2lnbmVkIHdpdGggc2hhcmVkLXJlbmRlcmluZyBpbiBtaW5kLiBDb250ZW50IGlzbid0IHByaW9yaXRpemVkLCBhbmQgaHVtYW5zIGFyZSBleHBlY3RlZCB0byBbZG93bmxvYWQgbW9zdCBvZiBhIHdlYiBwYWdlIGJlZm9yZSB0aGV5IGNhbiBzZWUgYW55IGh1bWFuLWRpZ2VzdGlibGUgY29udGVudF1bMl0uIFdoaWxlIEdvb2dsZSBpcyBnb2luZyB0byByZXNvbHZlIHRoZSBTRU8gaXNzdWVzIHdpdGggZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBzb29uLCBTRU8gaXMgYWxzbyBhIHByb2JsZW0uIEdvb2dsZSBpc24ndCB0aGUgb25seSB3ZWIgY3Jhd2xlciBvcGVyYXRvciBvdXQgdGhlcmUsIGFuZCBpdCBtaWdodCBiZSBhIHdoaWxlIGJlZm9yZSBzb2NpYWwgbWVkaWEgbGluayBjcmF3bGVycyBjYXRjaCB1cCB3aXRoIHRoZW0uXFxuXFxuICAgIExhdGVseSwgd2UgY2FuIG9ic2VydmUgbWFueSBtYXR1cmUgb3Blbi1zb3VyY2UgZnJhbWV3b3JrcyBhcmUgZHJvcHBpbmcgc3VwcG9ydCBmb3Igb2xkZXIgYnJvd3NlcnMuIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5J3JlIGFyY2hpdGVjdGVkLCB3aGVyZSB0aGUgZGV2ZWxvcGVyIGlzIHB1dCBmaXJzdC4gKipUYXVudXMgaXMgWyNodW1hbmZpcnN0XVsxXSoqLCBtZWFuaW5nIHRoYXQgaXQgY29uY2VkZXMgdGhhdCBodW1hbnMgYXJlIG1vcmUgaW1wb3J0YW50IHRoYW4gdGhlIGRldmVsb3BlcnMgYnVpbGRpbmcgdGhlaXIgYXBwbGljYXRpb25zLlxcblxcbiAgICBQcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGFwcGxpY2F0aW9ucyBhcmUgYWx3YXlzIGdvaW5nIHRvIGhhdmUgZ3JlYXQgYnJvd3NlciBzdXBwb3J0IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5J3JlIGFyY2hpdGVjdGVkLiBBcyB0aGUgbmFtZSBpbXBsaWVzLCBhIGJhc2VsaW5lIGlzIGVzdGFibGlzaGVkIHdoZXJlIHdlIGRlbGl2ZXIgdGhlIGNvcmUgZXhwZXJpZW5jZSB0byB0aGUgdXNlciBfKHR5cGljYWxseSBpbiB0aGUgZm9ybSBvZiByZWFkYWJsZSBIVE1MIGNvbnRlbnQpXywgYW5kIHRoZW4gZW5oYW5jZSBpdCAqKmlmIHBvc3NpYmxlKiogdXNpbmcgQ1NTIGFuZCBKYXZhU2NyaXB0LiBCdWlsZGluZyBhcHBsaWNhdGlvbnMgaW4gdGhpcyB3YXkgbWVhbnMgdGhhdCB5b3UnbGwgYmUgYWJsZSB0byByZWFjaCB0aGUgbW9zdCBwZW9wbGUgd2l0aCB5b3VyIGNvcmUgZXhwZXJpZW5jZSwgYW5kIHlvdSdsbCBhbHNvIGJlIGFibGUgdG8gcHJvdmlkZSBodW1hbnMgaW4gbW9yZSBtb2Rlcm4gYnJvd3NlcnMgd2l0aCBhbGwgb2YgdGhlIGxhdGVzdCBmZWF0dXJlcyBhbmQgdGVjaG5vbG9naWVzLlxcblxcbiAgICBbMV06IGh0dHBzOi8vdHdpdHRlci5jb20vaGFzaHRhZy9odW1hbmZpcnN0XFxuICAgIFsyXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgRmVhdHVyZXNcXG5cXG4gICAgT3V0IG9mIHRoZSBib3gsIFRhdW51cyBlbnN1cmVzIHRoYXQgeW91ciBzaXRlIHdvcmtzIG9uIGFueSBIVE1MLWVuYWJsZWQgZG9jdW1lbnQgdmlld2VyIGFuZCBldmVuIHRoZSB0ZXJtaW5hbCwgcHJvdmlkaW5nIHN1cHBvcnQgZm9yIHBsYWluIHRleHQgcmVzcG9uc2VzIFt3aXRob3V0IGFueSBjb25maWd1cmF0aW9uIG5lZWRlZF1bMl0uIEV2ZW4gd2hpbGUgVGF1bnVzIHByb3ZpZGVzIHNoYXJlZC1yZW5kZXJpbmcgY2FwYWJpbGl0aWVzLCBpdCBvZmZlcnMgY29kZSByZXVzZSBvZiB2aWV3cyBhbmQgcm91dGVzLCBtZWFuaW5nIHlvdSdsbCBvbmx5IGhhdmUgdG8gZGVjbGFyZSB0aGVzZSBvbmNlIGJ1dCB0aGV5J2xsIGJlIHVzZWQgaW4gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZS5cXG5cXG4gICAgVGF1bnVzIGZlYXR1cmVzIGEgcmVhc29uYWJseSBlbmhhbmNlZCBleHBlcmllbmNlLCB3aGVyZSBpZiBmZWF0dXJlcyBhcmVuJ3QgYXZhaWxhYmxlIG9uIGEgYnJvd3NlciwgdGhleSdyZSBqdXN0IG5vdCBwcm92aWRlZC4gRm9yIGV4YW1wbGUsIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgbWFrZXMgdXNlIG9mIHRoZSBgaGlzdG9yeWAgQVBJIGJ1dCBpZiB0aGF0J3Mgbm90IGF2YWlsYWJsZSB0aGVuIGl0J2xsIGZhbGwgYmFjayB0byBzaW1wbHkgbm90IG1lZGRsaW5nIHdpdGggbGlua3MgaW5zdGVhZCBvZiB1c2luZyBhIGNsaWVudC1zaWRlLW9ubHkgaGFzaCByb3V0ZXIuXFxuXFxuICAgIFRhdW51cyBjYW4gZGVhbCB3aXRoIHZpZXcgY2FjaGluZyBvbiB5b3VyIGJlaGFsZiwgaWYgeW91IHNvIGRlc2lyZSwgdXNpbmcgW2FzeW5jaHJvbm91cyBlbWJlZGRlZCBkYXRhYmFzZSBzdG9yZXNdWzNdIG9uIHRoZSBjbGllbnQtc2lkZS4gVHVybnMgb3V0LCB0aGVyZSdzIFtwcmV0dHkgZ29vZCBicm93c2VyIHN1cHBvcnQgZm9yIEluZGV4ZWREQl1bNF0uIE9mIGNvdXJzZSwgSW5kZXhlZERCIHdpbGwgb25seSBiZSB1c2VkIGlmIGl0J3MgYXZhaWxhYmxlLCBhbmQgaWYgaXQncyBub3QgdGhlbiB2aWV3cyB3b24ndCBiZSBjYWNoZWQgaW4gdGhlIGNsaWVudC1zaWRlIGJlc2lkZXMgYW4gaW4tbWVtb3J5IHN0b3JlLiAqKlRoZSBzaXRlIHdvbid0IHNpbXBseSByb2xsIG92ZXIgYW5kIGRpZSwgdGhvdWdoLioqXFxuXFxuICAgIElmIHlvdSd2ZSB0dXJuZWQgY2xpZW50LXNpZGUgY2FjaGluZyBvbiwgdGhlbiB5b3UgY2FuIGFsc28gdHVybiBvbiB0aGUgKip2aWV3IHByZS1mZXRjaGluZyBmZWF0dXJlKiosIHdoaWNoIHdpbGwgc3RhcnQgZG93bmxvYWRpbmcgdmlld3MgYXMgc29vbiBhcyBodW1hbnMgaG92ZXIgb24gbGlua3MsIGFzIHRvIGRlbGl2ZXIgYSBfZmFzdGVyIHBlcmNlaXZlZCBodW1hbiBleHBlcmllbmNlXy5cXG5cXG4gICAgVGF1bnVzIHByb3ZpZGVzIHRoZSBiYXJlIGJvbmVzIGZvciB5b3VyIGFwcGxpY2F0aW9uIHNvIHRoYXQgeW91IGNhbiBzZXBhcmF0ZSBjb25jZXJucyBpbnRvIHJvdXRlcywgY29udHJvbGxlcnMsIG1vZGVscywgYW5kIHZpZXdzLiBUaGVuIGl0IGdldHMgb3V0IG9mIHRoZSB3YXksIGJ5IGRlc2lnbi4gVGhlcmUgYXJlIFthIGZldyBjb21wbGVtZW50YXJ5IG1vZHVsZXNdWzFdIHlvdSBjYW4gdXNlIHRvIGVuaGFuY2UgeW91ciBkZXZlbG9wbWVudCBleHBlcmllbmNlLCBhcyB3ZWxsLlxcblxcbiAgICBXaXRoIFRhdW51cyB5b3UnbGwgYmUgaW4gY2hhcmdlLiBbQXJlIHlvdSByZWFkeSB0byBnZXQgc3RhcnRlZD9dWzJdXFxuXFxuICAgIFsxXTogL2NvbXBsZW1lbnRzXFxuICAgIFsyXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbM106IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxuICAgIFs0XTogaHR0cDovL2Nhbml1c2UuY29tLyNzZWFyY2g9aW5kZXhlZGRiXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBGYW1pbGlhcml0eVxcblxcbiAgICBZb3UgY2FuIHVzZSBUYXVudXMgdG8gZGV2ZWxvcCBhcHBsaWNhdGlvbnMgdXNpbmcgeW91ciBmYXZvcml0ZSBOb2RlLmpzIEhUVFAgc2VydmVyLCAqKmJvdGggW0V4cHJlc3NdWzNdIGFuZCBbSGFwaV1bNF0gYXJlIGZ1bGx5IHN1cHBvcnRlZCoqLiBJbiBib3RoIGNhc2VzLCB5b3UnbGwgW2J1aWxkIGNvbnRyb2xsZXJzIHRoZSB3YXkgeW91J3JlIGFscmVhZHkgdXNlZCB0b11bMV0sIGV4Y2VwdCB5b3Ugd29uJ3QgaGF2ZSB0byBgcmVxdWlyZWAgdGhlIHZpZXcgY29udHJvbGxlcnMgb3IgZGVmaW5lIGFueSB2aWV3IHJvdXRlcyBzaW5jZSBUYXVudXMgd2lsbCBkZWFsIHdpdGggdGhhdCBvbiB5b3VyIGJlaGFsZi4gSW4gdGhlIGNvbnRyb2xsZXJzIHlvdSdsbCBiZSBhYmxlIHRvIGRvIGV2ZXJ5dGhpbmcgeW91J3JlIGFscmVhZHkgYWJsZSB0byBkbywgYW5kIHRoZW4geW91J2xsIGhhdmUgdG8gcmV0dXJuIGEgSlNPTiBtb2RlbCB3aGljaCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIGEgdmlldy5cXG5cXG4gICAgWW91IGNhbiB1c2UgYW55IHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IHlvdSB3YW50LCBwcm92aWRlZCB0aGF0IGl0IGNhbiBiZSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLiBUaGF0J3MgYmVjYXVzZSBUYXVudXMgdHJlYXRzIHZpZXdzIGFzIG1lcmUgSmF2YVNjcmlwdCBmdW5jdGlvbnMsIHJhdGhlciB0aGFuIGJlaW5nIHRpZWQgaW50byBhIHNwZWNpZmljIHZpZXctcmVuZGVyaW5nIGVuZ2luZS5cXG5cXG4gICAgQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGp1c3QgZnVuY3Rpb25zLCB0b28uIFlvdSBjYW4gYnJpbmcgeW91ciBvd24gc2VsZWN0b3IgZW5naW5lLCB5b3VyIG93biBBSkFYIGxpYnJhcmllcywgYW5kIHlvdXIgb3duIGRhdGEtYmluZGluZyBzb2x1dGlvbnMuIEl0IG1pZ2h0IG1lYW4gdGhlcmUncyBhIGJpdCBtb3JlIHdvcmsgaW52b2x2ZWQgZm9yIHlvdSwgYnV0IHlvdSdsbCBhbHNvIGJlIGZyZWUgdG8gcGljayB3aGF0ZXZlciBsaWJyYXJpZXMgeW91J3JlIG1vc3QgY29tZm9ydGFibGUgd2l0aCEgVGhhdCBiZWluZyBzYWlkLCBUYXVudXMgW2RvZXMgcmVjb21tZW5kIGEgZmV3IGxpYnJhcmllc11bMl0gdGhhdCB3b3JrIHdlbGwgd2l0aCBpdC5cXG5cXG4gICAgWzFdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFsyXTogL2NvbXBsZW1lbnRzXFxuICAgIFszXTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzRdOiBodHRwOi8vaGFwaWpzLmNvbVxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXR0aW5nU3RhcnRlZChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZ2V0dGluZy1zdGFydGVkXFxcIj5HZXR0aW5nIFN0YXJ0ZWQ8L2gxPlxcbjxwPlRhdW51cyBpcyBhIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZSBmb3IgTm9kZS5qcywgYW5kIGl0JiMzOTtzIDxlbT51cCB0byB5b3UgaG93IHRvIHVzZSBpdDwvZW0+LiBJbiBmYWN0LCBpdCBtaWdodCBiZSBhIGdvb2QgaWRlYSBmb3IgeW91IHRvIDxzdHJvbmc+c2V0IHVwIGp1c3QgdGhlIHNlcnZlci1zaWRlIGFzcGVjdCBmaXJzdDwvc3Ryb25nPiwgYXMgdGhhdCYjMzk7bGwgdGVhY2ggeW91IGhvdyBpdCB3b3JrcyBldmVuIHdoZW4gSmF2YVNjcmlwdCBuZXZlciBnZXRzIHRvIHRoZSBjbGllbnQuPC9wPlxcbjxoMSBpZD1cXFwidGFibGUtb2YtY29udGVudHNcXFwiPlRhYmxlIG9mIENvbnRlbnRzPC9oMT5cXG48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiNob3ctaXQtd29ya3NcXFwiPkhvdyBpdCB3b3JrczwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjaW5zdGFsbGluZy10YXVudXNcXFwiPkluc3RhbGxpbmcgVGF1bnVzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZVxcXCI+U2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGU8L2E+PHVsPlxcbjxsaT48YSBocmVmPVxcXCIjY3JlYXRpbmctYS1sYXlvdXRcXFwiPkNyZWF0aW5nIGEgbGF5b3V0PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmVcXFwiPlVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZTwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdGhyb3dpbmctaW4tYS1jb250cm9sbGVyXFxcIj5UaHJvd2luZyBpbiBhIGNvbnRyb2xsZXI8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0YXVudXMtaW4tdGhlLWNsaWVudFxcXCI+VGF1bnVzIGluIHRoZSBjbGllbnQ8L2E+PHVsPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctdGhlLXRhdW51cy1jbGlcXFwiPlVzaW5nIHRoZSBUYXVudXMgQ0xJPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXJcXFwiPkJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyXFxcIj5BZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXI8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1jbGllbnQtc2lkZS10YXVudXMtYXBpXFxcIj5Vc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSTwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmdcXFwiPkNhY2hpbmcgYW5kIFByZWZldGNoaW5nPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdGhlLXNreS1pcy10aGUtbGltaXQtXFxcIj5UaGUgc2t5IGlzIHRoZSBsaW1pdCE8L2E+PC9saT5cXG48L3VsPlxcbjxoMSBpZD1cXFwiaG93LWl0LXdvcmtzXFxcIj5Ib3cgaXQgd29ya3M8L2gxPlxcbjxwPlRhdW51cyBmb2xsb3dzIGEgc2ltcGxlIGJ1dCA8c3Ryb25nPnByb3Zlbjwvc3Ryb25nPiBzZXQgb2YgcnVsZXMuPC9wPlxcbjx1bD5cXG48bGk+RGVmaW5lIGEgPGNvZGU+ZnVuY3Rpb24obW9kZWwpPC9jb2RlPiBmb3IgZWFjaCB5b3VyIHZpZXdzPC9saT5cXG48bGk+UHV0IHRoZXNlIHZpZXdzIGluIGJvdGggdGhlIHNlcnZlciBhbmQgdGhlIGNsaWVudDwvbGk+XFxuPGxpPkRlZmluZSByb3V0ZXMgZm9yIHlvdXIgYXBwbGljYXRpb248L2xpPlxcbjxsaT5QdXQgdGhvc2Ugcm91dGVzIGluIGJvdGggdGhlIHNlcnZlciBhbmQgdGhlIGNsaWVudDwvbGk+XFxuPGxpPkVuc3VyZSByb3V0ZSBtYXRjaGVzIHdvcmsgdGhlIHNhbWUgd2F5IG9uIGJvdGggZW5kczwvbGk+XFxuPGxpPkNyZWF0ZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyB0aGF0IHlpZWxkIHRoZSBtb2RlbCBmb3IgeW91ciB2aWV3czwvbGk+XFxuPGxpPkNyZWF0ZSBjbGllbnQtc2lkZSBjb250cm9sbGVycyBpZiB5b3UgbmVlZCB0byBhZGQgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byBhIHBhcnRpY3VsYXIgdmlldzwvbGk+XFxuPGxpPkZvciB0aGUgZmlyc3QgcmVxdWVzdCwgYWx3YXlzIHJlbmRlciB2aWV3cyBvbiB0aGUgc2VydmVyLXNpZGU8L2xpPlxcbjxsaT5XaGVuIHJlbmRlcmluZyBhIHZpZXcgb24gdGhlIHNlcnZlci1zaWRlLCBpbmNsdWRlIHRoZSBmdWxsIGxheW91dCBhcyB3ZWxsITwvbGk+XFxuPGxpPk9uY2UgdGhlIGNsaWVudC1zaWRlIGNvZGUga2lja3MgaW4sIDxzdHJvbmc+aGlqYWNrIGxpbmsgY2xpY2tzPC9zdHJvbmc+IGFuZCBtYWtlIEFKQVggcmVxdWVzdHMgaW5zdGVhZDwvbGk+XFxuPGxpPldoZW4geW91IGdldCB0aGUgSlNPTiBtb2RlbCBiYWNrLCByZW5kZXIgdmlld3Mgb24gdGhlIGNsaWVudC1zaWRlPC9saT5cXG48bGk+SWYgdGhlIDxjb2RlPmhpc3Rvcnk8L2NvZGU+IEFQSSBpcyB1bmF2YWlsYWJsZSwgZmFsbCBiYWNrIHRvIGdvb2Qgb2xkIHJlcXVlc3QtcmVzcG9uc2UuIDxzdHJvbmc+RG9uJiMzOTt0IGNvbmZ1c2UgeW91ciBodW1hbnMgd2l0aCBvYnNjdXJlIGhhc2ggcm91dGVycyE8L3N0cm9uZz48L2xpPlxcbjwvdWw+XFxuPHA+SSYjMzk7bGwgc3RlcCB5b3UgdGhyb3VnaCB0aGVzZSwgYnV0IHJhdGhlciB0aGFuIGxvb2tpbmcgYXQgaW1wbGVtZW50YXRpb24gZGV0YWlscywgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgc3RlcHMgeW91IG5lZWQgdG8gdGFrZSBpbiBvcmRlciB0byBtYWtlIHRoaXMgZmxvdyBoYXBwZW4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiaW5zdGFsbGluZy10YXVudXNcXFwiPkluc3RhbGxpbmcgVGF1bnVzPC9oMT5cXG48cD5GaXJzdCBvZmYsIHlvdSYjMzk7bGwgbmVlZCB0byBjaG9vc2UgYSBIVFRQIHNlcnZlciBmcmFtZXdvcmsgZm9yIHlvdXIgYXBwbGljYXRpb24uIEF0IHRoZSBtb21lbnQgVGF1bnVzIHN1cHBvcnRzIG9ubHkgYSBjb3VwbGUgb2YgSFRUUCBmcmFtZXdvcmtzLCBidXQgbW9yZSBtYXkgYmUgYWRkZWQgaWYgdGhleSBhcmUgcG9wdWxhciBlbm91Z2guPC9wPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+LCB0aHJvdWdoIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXFwiPnRhdW51cy1leHByZXNzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiwgdGhyb3VnaCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxcIj50YXVudXMtaGFwaTwvYT4gYW5kIHRoZSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2hhcGlpZnlcXFwiPmhhcGlpZnk8L2E+IHRyYW5zZm9ybTwvbGk+XFxuPC91bD5cXG48YmxvY2txdW90ZT5cXG48cD5JZiB5b3UmIzM5O3JlIG1vcmUgb2YgYSA8ZW0+JnF1b3Q7cnVtbWFnZSB0aHJvdWdoIHNvbWVvbmUgZWxzZSYjMzk7cyBjb2RlJnF1b3Q7PC9lbT4gdHlwZSBvZiBkZXZlbG9wZXIsIHlvdSBtYXkgZmVlbCBjb21mb3J0YWJsZSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pb1xcXCI+Z29pbmcgdGhyb3VnaCB0aGlzIHdlYnNpdGUmIzM5O3Mgc291cmNlIGNvZGU8L2E+LCB3aGljaCB1c2VzIHRoZSA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4gZmxhdm9yIG9mIFRhdW51cy4gQWx0ZXJuYXRpdmVseSB5b3UgY2FuIGxvb2sgYXQgdGhlIHNvdXJjZSBjb2RlIGZvciA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vXFxcIj5wb255Zm9vLmNvbTwvYT4sIHdoaWNoIGlzIDxzdHJvbmc+YSBtb3JlIGFkdmFuY2VkIHVzZS1jYXNlPC9zdHJvbmc+IHVuZGVyIHRoZSA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gZmxhdm9yLiBPciwgeW91IGNvdWxkIGp1c3Qga2VlcCBvbiByZWFkaW5nIHRoaXMgcGFnZSwgdGhhdCYjMzk7cyBva2F5IHRvby48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPk9uY2UgeW91JiMzOTt2ZSBzZXR0bGVkIGZvciBlaXRoZXIgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IG9yIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiB5b3UmIzM5O2xsIGJlIGFibGUgdG8gcHJvY2VlZC4gRm9yIHRoZSBwdXJwb3NlcyBvZiB0aGlzIGd1aWRlLCB3ZSYjMzk7bGwgdXNlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPi4gU3dpdGNoaW5nIGJldHdlZW4gb25lIG9mIHRoZSBkaWZmZXJlbnQgSFRUUCBmbGF2b3JzIGlzIHN0cmlraW5nbHkgZWFzeSwgdGhvdWdoLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInNldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlXFxcIj5TZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZTwvaDQ+XFxuPHA+TmF0dXJhbGx5LCB5b3UmIzM5O2xsIG5lZWQgdG8gaW5zdGFsbCBhbGwgb2YgdGhlIGZvbGxvd2luZyBtb2R1bGVzIGZyb20gPGNvZGU+bnBtPC9jb2RlPiB0byBnZXQgc3RhcnRlZC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgdGF1bnVzIHRhdW51cy1leHByZXNzIGV4cHJlc3MgLS1zYXZlXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxldCYjMzk7cyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSYjMzk7bGwgbmVlZCB0aGUgZmFtb3VzIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggYXBwLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUsIGxldCYjMzk7cyBkbyB0aGF0IG5vdy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge307XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QWxsIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIDxjb2RlPmFwcDwvY29kZT4uIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gaW52b2NhdGlvbi4gWW91JiMzOTtsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIDxlbT4mcXVvdDtOb3QgRm91bmQmcXVvdDs8L2VtPiB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS48L3A+XFxuPHA+VGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gbGV0JiMzOTtzIHlvdSBjb25maWd1cmUgVGF1bnVzLiBJbnN0ZWFkIG9mIGRpc2N1c3NpbmcgZXZlcnkgc2luZ2xlIGNvbmZpZ3VyYXRpb24gb3B0aW9uIHlvdSBjb3VsZCBzZXQgaGVyZSwgbGV0JiMzOTtzIGRpc2N1c3Mgd2hhdCBtYXR0ZXJzOiB0aGUgPGVtPnJlcXVpcmVkIGNvbmZpZ3VyYXRpb248L2VtPi4gVGhlcmUmIzM5O3MgdHdvIG9wdGlvbnMgdGhhdCB5b3UgbXVzdCBzZXQgaWYgeW91IHdhbnQgeW91ciBUYXVudXMgYXBwbGljYXRpb24gdG8gbWFrZSBhbnkgc2Vuc2UuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+bGF5b3V0PC9jb2RlPiBzaG91bGQgYmUgYSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgc2luZ2xlIDxjb2RlPm1vZGVsPC9jb2RlPiBhcmd1bWVudCBhbmQgcmV0dXJucyBhbiBlbnRpcmUgSFRNTCBkb2N1bWVudDwvbGk+XFxuPGxpPjxjb2RlPnJvdXRlczwvY29kZT4gc2hvdWxkIGJlIGFuIGFycmF5IG9mIHZpZXcgcm91dGVzPC9saT5cXG48L3VsPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY3JlYXRpbmctYS1sYXlvdXRcXFwiPkNyZWF0aW5nIGEgbGF5b3V0PC9oND5cXG48cD5MZXQmIzM5O3MgYWxzbyBjcmVhdGUgYSBsYXlvdXQuIEZvciB0aGUgcHVycG9zZXMgb2YgbWFraW5nIG91ciB3YXkgdGhyb3VnaCB0aGlzIGd1aWRlLCBpdCYjMzk7bGwganVzdCBiZSBhIHBsYWluIEphdmFTY3JpcHQgZnVuY3Rpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIGxheW91dC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5Ob3RlIHRoYXQgdGhlIDxjb2RlPnBhcnRpYWw8L2NvZGU+IHByb3BlcnR5IGluIHRoZSA8Y29kZT5tb2RlbDwvY29kZT4gPGVtPihhcyBzZWVuIGJlbG93KTwvZW0+IGlzIGNyZWF0ZWQgb24gdGhlIGZseSBhZnRlciByZW5kZXJpbmcgcGFydGlhbCB2aWV3cy4gVGhlIGxheW91dCBmdW5jdGlvbiB3ZSYjMzk7bGwgYmUgdXNpbmcgaGVyZSBlZmZlY3RpdmVseSBtZWFucyA8ZW0+JnF1b3Q7dGhlcmUgaXMgbm8gbGF5b3V0LCBqdXN0IHJlbmRlciB0aGUgcGFydGlhbHMmcXVvdDs8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHJldHVybiBtb2RlbC5wYXJ0aWFsO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9mIGNvdXJzZSwgaWYgeW91IHdlcmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24sIHRoZW4geW91IHByb2JhYmx5IHdvdWxkbiYjMzk7dCB3YW50IHRvIHdyaXRlIHZpZXdzIGFzIEphdmFTY3JpcHQgZnVuY3Rpb25zIGFzIHRoYXQmIzM5O3MgdW5wcm9kdWN0aXZlLCBjb25mdXNpbmcsIGFuZCBoYXJkIHRvIG1haW50YWluLiBXaGF0IHlvdSBjb3VsZCBkbyBpbnN0ZWFkLCBpcyB1c2UgYSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCBhbGxvd3MgeW91IHRvIGNvbXBpbGUgeW91ciB2aWV3IHRlbXBsYXRlcyBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLjwvcD5cXG48dWw+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9qYW5sL211c3RhY2hlLmpzXFxcIj5NdXN0YWNoZTwvYT4gaXMgYSB0ZW1wbGF0aW5nIGVuZ2luZSB0aGF0IGNhbiBjb21waWxlIHlvdXIgdmlld3MgaW50byBwbGFpbiBmdW5jdGlvbnMsIHVzaW5nIGEgc3ludGF4IHRoYXQmIzM5O3MgbWluaW1hbGx5IGRpZmZlcmVudCBmcm9tIEhUTUw8L2xpPlxcbjxsaT48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vamFkZWpzL2phZGVcXFwiPkphZGU8L2E+IGlzIGFub3RoZXIgb3B0aW9uLCBhbmQgaXQgaGFzIGEgdGVyc2Ugc3ludGF4IHdoZXJlIHNwYWNpbmcgbWF0dGVycyBidXQgdGhlcmUmIzM5O3Mgbm8gY2xvc2luZyB0YWdzPC9saT5cXG48bGk+VGhlcmUmIzM5O3MgbWFueSBtb3JlIGFsdGVybmF0aXZlcyBsaWtlIDxhIGhyZWY9XFxcImh0dHA6Ly9tb3ppbGxhLmdpdGh1Yi5pby9udW5qdWNrcy9cXFwiPk1vemlsbGEmIzM5O3MgTnVuanVja3M8L2E+LCA8YSBocmVmPVxcXCJodHRwOi8vaGFuZGxlYmFyc2pzLmNvbS9cXFwiPkhhbmRsZWJhcnM8L2E+LCBhbmQgPGEgaHJlZj1cXFwiaHR0cDovL3d3dy5lbWJlZGRlZGpzLmNvbS9cXFwiPkVKUzwvYT4uPC9saT5cXG48L3VsPlxcbjxwPlJlbWVtYmVyIHRvIGFkZCB0aGUgPGNvZGU+bGF5b3V0PC9jb2RlPiB1bmRlciB0aGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0IHBhc3NlZCB0byA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgbGF5b3V0OiByZXF1aXJlKCYjMzk7Li9sYXlvdXQmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPllvdSYjMzk7bGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbjwvYT4uIElmIHlvdSBkb24mIzM5O3QgcHJvdmlkZSBhIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIDxjb2RlPiZsdDtwcmUmZ3Q7PC9jb2RlPiBhbmQgPGNvZGU+Jmx0O2NvZGUmZ3Q7PC9jb2RlPiB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9oND5cXG48cD5Sb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gPHN0cm9uZz53aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZzwvc3Ryb25nPi4gTGV0JiMzOTtzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHJvdXRlcy5qc1xcbjwvY29kZT48L3ByZT5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IFtcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1cXG5dO1xcbjwvY29kZT48L3ByZT5cXG48cD5FYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSA8Y29kZT4vPC9jb2RlPiByb3V0ZSB3aXRoIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm48L2E+LCB3aGljaCBtYWRlIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvUnVieV9vbl9SYWlsc1xcXCI+UnVieSBvbiBSYWlsczwvYT4gZmFtb3VzLiA8ZW0+TWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vITwvZW0+IEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24gdXNlcyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gdmlldy4gT2YgY291cnNlLCA8ZW0+YWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbjwvZW0+LjwvcD5cXG48cD5UaW1lIHRvIGdvIGJhY2sgdG8gPGNvZGU+YXBwLmpzPC9jb2RlPiBhbmQgdXBkYXRlIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspLFxcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9yb3V0ZXMmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIGltcG9ydGFudCB0byBrbm93IHRoYXQgaWYgeW91IG9taXQgdGhlIGNyZWF0aW9uIG9mIGEgY29udHJvbGxlciB0aGVuIFRhdW51cyB3aWxsIHNraXAgdGhhdCBzdGVwLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHBhc3NpbmcgaXQgd2hhdGV2ZXIgdGhlIGRlZmF1bHQgbW9kZWwgaXMgPGVtPihtb3JlIG9uIHRoYXQgbGF0ZXIsIGJ1dCBpdCBkZWZhdWx0cyB0byA8Y29kZT57fTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctamFkZS1hcy15b3VyLXZpZXctZW5naW5lXFxcIj5Vc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmU8L2g0PlxcbjxwPkxldCYjMzk7cyBnbyBhaGVhZCBhbmQgdXNlIEphZGUgYXMgdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBjaG9pY2UgZm9yIG91ciB2aWV3cy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlJiMzOTtyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQmIzM5O3MgaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+cCBIZWxsbyBUYXVudXMhXFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgeW91JiMzOTtsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9qYWR1bVxcXCI+amFkdW08L2E+LCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0JiMzOTtzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIDxlbT4oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UmIzM5O3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKTwvZW0+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCBqYWR1bSAtZ1xcbjwvY29kZT48L3ByZT5cXG48cD5UbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIDxjb2RlPnZpZXdzPC9jb2RlPiBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSA8Y29kZT4uYmluPC9jb2RlPiBiZWNhdXNlIHRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uPC9hPiBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPmphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG48L2NvZGU+PC9wcmU+XFxuPHA+Q29uZ3JhdHVsYXRpb25zISBUYXVudXMgaXMgbm93IG9wZXJhdGlvbmFsLiBBbGwgdGhhdCYjMzk7cyBsZWZ0IGlzIGZvciB5b3UgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhbmQgdmlzaXQgaXQgb24gcG9ydCA8Y29kZT4zMDAwPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHAgJmFtcDtcXG5vcGVuIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFxcbjwvY29kZT48L3ByZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInRocm93aW5nLWluLWEtY29udHJvbGxlclxcXCI+VGhyb3dpbmcgaW4gYSBjb250cm9sbGVyPC9oND5cXG48cD5Db250cm9sbGVycyBhcmUgaW5kZWVkIG9wdGlvbmFsLCBidXQgYW4gYXBwbGljYXRpb24gdGhhdCByZW5kZXJzIGV2ZXJ5IHZpZXcgdXNpbmcgdGhlIHNhbWUgbW9kZWwgd29uJiMzOTt0IGdldCB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCYjMzk7cyBjcmVhdGUgYSBjb250cm9sbGVyIGZvciB0aGUgPGNvZGU+aG9tZS92aWV3PC9jb2RlPiBhY3Rpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIGNvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIGNvbnRyb2xsZXIgbW9kdWxlIHNob3VsZCBtZXJlbHkgZXhwb3J0IGEgZnVuY3Rpb24uIDxlbT5TdGFydGVkIG5vdGljaW5nIHRoZSBwYXR0ZXJuPzwvZW0+IFRoZSBzaWduYXR1cmUgZm9yIHRoZSBjb250cm9sbGVyIGlzIHRoZSBzYW1lIHNpZ25hdHVyZSBhcyB0aGF0IG9mIGFueSBvdGhlciBtaWRkbGV3YXJlIHBhc3NlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gPGVtPihvciBhbnkgcm91dGUgaGFuZGxlciBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IGluIHRoZSBjYXNlIG9mIDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPik8L2VtPi48L3A+XFxuPHA+QXMgeW91IG1heSBoYXZlIG5vdGljZWQgaW4gdGhlIGV4YW1wbGVzIHNvIGZhciwgeW91IGhhdmVuJiMzOTt0IGV2ZW4gc2V0IGEgZG9jdW1lbnQgdGl0bGUgZm9yIHlvdXIgSFRNTCBwYWdlcyEgVHVybnMgb3V0LCB0aGVyZSYjMzk7cyBhIGZldyBtb2RlbCBwcm9wZXJ0aWVzIDxlbT4odmVyeSBmZXcpPC9lbT4gdGhhdCBUYXVudXMgaXMgYXdhcmUgb2YuIE9uZSBvZiB0aG9zZSBpcyB0aGUgPGNvZGU+dGl0bGU8L2NvZGU+IHByb3BlcnR5LCBhbmQgaXQmIzM5O2xsIGJlIHVzZWQgdG8gY2hhbmdlIHRoZSA8Y29kZT5kb2N1bWVudC50aXRsZTwvY29kZT4gaW4geW91ciBwYWdlcyB3aGVuIG5hdmlnYXRpbmcgdGhyb3VnaCB0aGUgY2xpZW50LXNpZGUuIEtlZXAgaW4gbWluZCB0aGF0IGFueXRoaW5nIHRoYXQmIzM5O3Mgbm90IGluIHRoZSA8Y29kZT5tb2RlbDwvY29kZT4gcHJvcGVydHkgd29uJiMzOTt0IGJlIHRyYXNtaXR0ZWQgdG8gdGhlIGNsaWVudCwgYW5kIHdpbGwganVzdCBiZSBhY2Nlc3NpYmxlIHRvIHRoZSBsYXlvdXQuPC9wPlxcbjxwPkhlcmUgaXMgb3VyIG5ld2ZhbmdsZWQgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlci4gQXMgeW91JiMzOTtsbCBub3RpY2UsIGl0IGRvZXNuJiMzOTt0IGRpc3J1cHQgYW55IG9mIHRoZSB0eXBpY2FsIEV4cHJlc3MgZXhwZXJpZW5jZSwgYnV0IG1lcmVseSBidWlsZHMgdXBvbiBpdC4gV2hlbiA8Y29kZT5uZXh0PC9jb2RlPiBpcyBjYWxsZWQsIHRoZSBUYXVudXMgdmlldy1yZW5kZXJpbmcgaGFuZGxlciB3aWxsIGtpY2sgaW4sIGFuZCByZW5kZXIgdGhlIHZpZXcgdXNpbmcgdGhlIGluZm9ybWF0aW9uIHRoYXQgd2FzIGFzc2lnbmVkIHRvIDxjb2RlPnJlcy52aWV3TW9kZWw8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgcmVzLnZpZXdNb2RlbCA9IHtcXG4gICAgbW9kZWw6IHtcXG4gICAgICB0aXRsZTogJiMzOTtXZWxjb21lIEhvbWUsIFRhdW51cyEmIzM5O1xcbiAgICB9XFxuICB9O1xcbiAgbmV4dCgpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9mIGNvdXJzZSwgcmVseWluZyBvbiB0aGUgY2xpZW50LXNpZGUgY2hhbmdlcyB0byB5b3VyIHBhZ2UgaW4gb3JkZXIgdG8gc2V0IHRoZSB2aWV3IHRpdGxlIDxlbT53b3VsZG4mIzM5O3QgYmUgcHJvZ3Jlc3NpdmU8L2VtPiwgYW5kIHRodXMgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+aXQgd291bGQgYmUgcmVhbGx5LCA8ZW0+cmVhbGx5PC9lbT4gYmFkPC9hPi4gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgbGF5b3V0IHRvIHVzZSB3aGF0ZXZlciA8Y29kZT50aXRsZTwvY29kZT4gaGFzIGJlZW4gcGFzc2VkIHRvIHRoZSBtb2RlbC4gSW4gZmFjdCwgbGV0JiMzOTtzIGdvIGJhY2sgdG8gdGhlIGRyYXdpbmcgYm9hcmQgYW5kIG1ha2UgdGhlIGxheW91dCBpbnRvIGEgSmFkZSB0ZW1wbGF0ZSEgVGhlIDxjb2RlPiE9PC9jb2RlPiBzeW50YXggbWVhbnMgdGhhdCB3aGF0ZXZlciBpcyBpbiB0aGUgdmFsdWUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgd29uJiMzOTt0IGJlIGVzY2FwZWQuIFRoYXQmIzM5O3Mgb2theSBiZWNhdXNlIDxjb2RlPnBhcnRpYWw8L2NvZGU+IGlzIGEgdmlldyB3aGVyZSBKYWRlIGVzY2FwZWQgYW55dGhpbmcgdGhhdCBuZWVkZWQgZXNjYXBpbmcsIGJ1dCB3ZSB3b3VsZG4mIzM5O3Qgd2FudCBIVE1MIHRhZ3MgdG8gYmUgZXNjYXBlZCE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj50aXRsZT1tb2RlbC50aXRsZVxcbm1haW4hPXBhcnRpYWxcXG48L2NvZGU+PC9wcmU+XFxuPHA+QnkgdGhlIHdheSwgZGlkIHlvdSBrbm93IHRoYXQgPGNvZGU+Jmx0O2h0bWwmZ3Q7PC9jb2RlPiwgPGNvZGU+Jmx0O2hlYWQmZ3Q7PC9jb2RlPiwgYW5kIDxjb2RlPiZsdDtib2R5Jmd0OzwvY29kZT4gYXJlIGFsbCBvcHRpb25hbCBpbiBIVE1MIDUsIGFuZCB0aGF0IHlvdSBjYW4gc2FmZWx5IG9taXQgdGhlbSBpbiB5b3VyIEhUTUw/IE9mIGNvdXJzZSwgcmVuZGVyaW5nIGVuZ2luZXMgd2lsbCBzdGlsbCBpbnNlcnQgdGhvc2UgZWxlbWVudHMgYXV0b21hdGljYWxseSBpbnRvIHRoZSBET00gZm9yIHlvdSEgPGVtPkhvdyBjb29sIGlzIHRoYXQ/PC9lbT48L3A+XFxuPHA+VGhhdCYjMzk7cyBpdCwgbm93IHlvdXIgdmlldyBoYXMgYSB0aXRsZS4gT2YgY291cnNlLCB0aGVyZSYjMzk7cyBub3RoaW5nIHN0b3BwaW5nIHlvdSBmcm9tIGFkZGluZyBkYXRhYmFzZSBjYWxscyB0byBmZXRjaCBiaXRzIGFuZCBwaWVjZXMgb2YgdGhlIG1vZGVsIGJlZm9yZSBpbnZva2luZyA8Y29kZT5uZXh0PC9jb2RlPiB0byByZW5kZXIgdGhlIHZpZXcuPC9wPlxcbjxwPlRoZXJlJiMzOTtzIGFsc28gdGhlIGNsaWVudC1zaWRlIGFzcGVjdCBvZiBzZXR0aW5nIHVwIFRhdW51cy4gTGV0JiMzOTtzIHNldCBpdCB1cCBhbmQgc2VlIGhvdyBpdCBvcGVucyB1cCBvdXIgcG9zc2liaWxpdGllcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0YXVudXMtaW4tdGhlLWNsaWVudFxcXCI+VGF1bnVzIGluIHRoZSBjbGllbnQ8L2gxPlxcbjxwPllvdSBhbHJlYWR5IGtub3cgaG93IHRvIHNldCB1cCB0aGUgYmFzaWNzIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmcsIGFuZCB5b3Uga25vdyB0aGF0IHlvdSBzaG91bGQgPGEgaHJlZj1cXFwiL2FwaVxcXCI+Y2hlY2sgb3V0IHRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4gdG8gZ2V0IGEgbW9yZSB0aG9yb3VnaCB1bmRlcnN0YW5kaW5nIG9mIHRoZSBwdWJsaWMgaW50ZXJmYWNlIG9uIFRhdW51cywgYW5kIHdoYXQgaXQgZW5hYmxlcyB5b3UgdG8gZG8uPC9wPlxcbjxwPlRoZSB3YXkgVGF1bnVzIHdvcmtzIG9uIHRoZSBjbGllbnQtc2lkZSBpcyBzbyB0aGF0IG9uY2UgeW91IHNldCBpdCB1cCwgaXQgd2lsbCBoaWphY2sgbGluayBjbGlja3MgYW5kIHVzZSBBSkFYIHRvIGZldGNoIG1vZGVscyBhbmQgcmVuZGVyIHRob3NlIHZpZXdzIGluIHRoZSBjbGllbnQuIElmIHRoZSBKYXZhU2NyaXB0IGNvZGUgZmFpbHMgdG8gbG9hZCwgPGVtPm9yIGlmIGl0IGhhc24mIzM5O3QgbG9hZGVkIHlldCBkdWUgdG8gYSBzbG93IGNvbm5lY3Rpb24gc3VjaCBhcyB0aG9zZSBpbiB1bnN0YWJsZSBtb2JpbGUgbmV0d29ya3M8L2VtPiwgdGhlIHJlZ3VsYXIgbGluayB3b3VsZCBiZSBmb2xsb3dlZCBpbnN0ZWFkIGFuZCBubyBoYXJtIHdvdWxkIGJlIHVubGVhc2hlZCB1cG9uIHRoZSBodW1hbiwgZXhjZXB0IHRoZXkgd291bGQgZ2V0IGEgc2xpZ2h0bHkgbGVzcyBmYW5jeSBleHBlcmllbmNlLjwvcD5cXG48cD5TZXR0aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBpbnZvbHZlcyBhIGZldyBkaWZmZXJlbnQgc3RlcHMuIEZpcnN0bHksIHdlJiMzOTtsbCBoYXZlIHRvIGNvbXBpbGUgdGhlIGFwcGxpY2F0aW9uJiMzOTtzIHdpcmluZyA8ZW0+KHRoZSByb3V0ZXMgYW5kIEphdmFTY3JpcHQgdmlldyBmdW5jdGlvbnMpPC9lbT4gaW50byBzb21ldGhpbmcgdGhlIGJyb3dzZXIgdW5kZXJzdGFuZHMuIFRoZW4sIHlvdSYjMzk7bGwgaGF2ZSB0byBtb3VudCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlLCBwYXNzaW5nIHRoZSB3aXJpbmcgc28gdGhhdCBpdCBrbm93cyB3aGljaCByb3V0ZXMgaXQgc2hvdWxkIHJlc3BvbmQgdG8sIGFuZCB3aGljaCBvdGhlcnMgaXQgc2hvdWxkIG1lcmVseSBpZ25vcmUuIE9uY2UgdGhhdCYjMzk7cyBvdXQgb2YgdGhlIHdheSwgY2xpZW50LXNpZGUgcm91dGluZyB3b3VsZCBiZSBzZXQgdXAuPC9wPlxcbjxwPkFzIHN1Z2FyIGNvYXRpbmcgb24gdG9wIG9mIHRoYXQsIHlvdSBtYXkgYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdXNpbmcgY29udHJvbGxlcnMuIFRoZXNlIGNvbnRyb2xsZXJzIHdvdWxkIGJlIGV4ZWN1dGVkIGV2ZW4gaWYgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS4gVGhleSBjYW4gYWNjZXNzIHRoZSBUYXVudXMgQVBJIGRpcmVjdGx5LCBpbiBjYXNlIHlvdSBuZWVkIHRvIG5hdmlnYXRlIHRvIGFub3RoZXIgdmlldyBpbiBzb21lIHdheSBvdGhlciB0aGFuIGJ5IGhhdmluZyBodW1hbnMgY2xpY2sgb24gYW5jaG9yIHRhZ3MuIFRoZSBBUEksIGFzIHlvdSYjMzk7bGwgbGVhcm4sIHdpbGwgYWxzbyBsZXQgeW91IHJlbmRlciBwYXJ0aWFsIHZpZXdzIHVzaW5nIHRoZSBwb3dlcmZ1bCBUYXVudXMgZW5naW5lLCBsaXN0ZW4gZm9yIGV2ZW50cyB0aGF0IG1heSBvY2N1ciBhdCBrZXkgc3RhZ2VzIG9mIHRoZSB2aWV3LXJlbmRlcmluZyBwcm9jZXNzLCBhbmQgZXZlbiBpbnRlcmNlcHQgQUpBWCByZXF1ZXN0cyBibG9ja2luZyB0aGVtIGJlZm9yZSB0aGV5IGV2ZXIgaGFwcGVuLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS10YXVudXMtY2xpXFxcIj5Vc2luZyB0aGUgVGF1bnVzIENMSTwvaDQ+XFxuPHA+VGF1bnVzIGNvbWVzIHdpdGggYSBDTEkgdGhhdCBjYW4gYmUgdXNlZCB0byB3aXJlIHlvdXIgTm9kZS5qcyByb3V0ZXMgYW5kIHZpZXdzIGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGUgc2FtZSBDTEkgY2FuIGJlIHVzZWQgdG8gd2lyZSB1cCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXMgd2VsbC4gVGhlIG1haW4gcmVhc29uIHdoeSB0aGUgVGF1bnVzIENMSSBleGlzdHMgaXMgc28gdGhhdCB5b3UgZG9uJiMzOTt0IGhhdmUgdG8gPGNvZGU+cmVxdWlyZTwvY29kZT4gZXZlcnkgc2luZ2xlIHZpZXcgYW5kIGNvbnRyb2xsZXIsIHVuZG9pbmcgYSBsb3Qgb2YgdGhlIHdvcmsgdGhhdCB3YXMgcHV0IGludG8gY29kZSByZXVzZS4gSnVzdCBsaWtlIHdlIGRpZCB3aXRoIDxjb2RlPmphZHVtPC9jb2RlPiBlYXJsaWVyLCB3ZSYjMzk7bGwgaW5zdGFsbCB0aGUgPGNvZGU+dGF1bnVzPC9jb2RlPiBDTEkgZ2xvYmFsbHkgZm9yIHRoZSBzYWtlIG9mIGV4ZXJjaXNpbmcsIGJ1dCB3ZSB1bmRlcnN0YW5kIHRoYXQgcmVseWluZyBvbiBnbG9iYWxseSBpbnN0YWxsZWQgbW9kdWxlcyBpcyBpbnN1ZmZpY2llbnQgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgYXBwbGljYXRpb25zLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCB0YXVudXMgLWdcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIENMSSBpcyB0ZXJzZSBpbiBib3RoIGl0cyBpbnB1dHMgYW5kIGl0cyBvdXRwdXRzLiBJZiB5b3UgcnVuIGl0IHdpdGhvdXQgYW55IGFyZ3VtZW50cyBpdCYjMzk7bGwgcHJpbnQgb3V0IHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgaWYgeW91IHdhbnQgdG8gcGVyc2lzdCBpdCB5b3Ugc2hvdWxkIHByb3ZpZGUgdGhlIDxjb2RlPi0tb3V0cHV0PC9jb2RlPiBmbGFnLiBJbiB0eXBpY2FsIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmNvbnZlbnRpb24tb3Zlci1jb25maWd1cmF0aW9uPC9hPiBmYXNoaW9uLCB0aGUgQ0xJIHdpbGwgZGVmYXVsdCB0byBpbmZlcnJpbmcgeW91ciB2aWV3cyBhcmUgbG9jYXRlZCBpbiA8Y29kZT4uYmluL3ZpZXdzPC9jb2RlPiBhbmQgdGhhdCB5b3Ugd2FudCB0aGUgd2lyaW5nIG1vZHVsZSB0byBiZSBwbGFjZWQgaW4gPGNvZGU+LmJpbi93aXJpbmcuanM8L2NvZGU+LCBidXQgeW91JiMzOTtsbCBiZSBhYmxlIHRvIGNoYW5nZSB0aGF0IGlmIGl0IGRvZXNuJiMzOTt0IG1lZXQgeW91ciBuZWVkcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkF0IHRoaXMgcG9pbnQgaW4gb3VyIGV4YW1wbGUsIHRoZSBDTEkgc2hvdWxkIGNyZWF0ZSBhIDxjb2RlPi5iaW4vd2lyaW5nLmpzPC9jb2RlPiBmaWxlIHdpdGggdGhlIGNvbnRlbnRzIGRldGFpbGVkIGJlbG93LiBBcyB5b3UgY2FuIHNlZSwgZXZlbiBpZiA8Y29kZT50YXVudXM8L2NvZGU+IGlzIGFuIGF1dG9tYXRlZCBjb2RlLWdlbmVyYXRpb24gdG9vbCwgaXQmIzM5O3Mgb3V0cHV0IGlzIGFzIGh1bWFuIHJlYWRhYmxlIGFzIGFueSBvdGhlciBtb2R1bGUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0ZW1wbGF0ZXMgPSB7XFxuICAmIzM5O2hvbWUvaW5kZXgmIzM5OzogcmVxdWlyZSgmIzM5Oy4vdmlld3MvaG9tZS9pbmRleC5qcyYjMzk7KVxcbn07XFxuXFxudmFyIGNvbnRyb2xsZXJzID0ge1xcbn07XFxuXFxudmFyIHJvdXRlcyA9IHtcXG4gICYjMzk7LyYjMzk7OiB7XFxuICAgIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTtcXG4gIH1cXG59O1xcblxcbm1vZHVsZS5leHBvcnRzID0ge1xcbiAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICByb3V0ZXM6IHJvdXRlc1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdGUgdGhhdCB0aGUgPGNvZGU+Y29udHJvbGxlcnM8L2NvZGU+IG9iamVjdCBpcyBlbXB0eSBiZWNhdXNlIHlvdSBoYXZlbiYjMzk7dCBjcmVhdGVkIGFueSA8ZW0+Y2xpZW50LXNpZGUgY29udHJvbGxlcnM8L2VtPiB5ZXQuIFdlIGNyZWF0ZWQgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgYnV0IHRob3NlIGRvbiYjMzk7dCBoYXZlIGFueSBlZmZlY3QgaW4gdGhlIGNsaWVudC1zaWRlLCBiZXNpZGVzIGRldGVybWluaW5nIHdoYXQgZ2V0cyBzZW50IHRvIHRoZSBjbGllbnQuPC9wPlxcbjxwPlRoZSBDTEkgY2FuIGJlIGVudGlyZWx5IGlnbm9yZWQsIHlvdSBjb3VsZCB3cml0ZSB0aGVzZSBkZWZpbml0aW9ucyBieSB5b3Vyc2VsZiwgYnV0IHlvdSB3b3VsZCBoYXZlIHRvIHJlbWVtYmVyIHRvIHVwZGF0ZSB0aGlzIGZpbGUgd2hlbmV2ZXIgeW91IGFkZCwgY2hhbmdlLCBvciByZW1vdmUgYSB2aWV3LCBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIsIG9yIGEgcm91dGUuIERvaW5nIHRoYXQgd291bGQgYmUgY3VtYmVyc29tZSwgYW5kIHRoZSBDTEkgc29sdmVzIHRoYXQgcHJvYmxlbSBmb3IgdXMgYXQgdGhlIGV4cGVuc2Ugb2Ygb25lIGFkZGl0aW9uYWwgYnVpbGQgc3RlcC48L3A+XFxuPHA+RHVyaW5nIGRldmVsb3BtZW50LCB5b3UgY2FuIGFsc28gYWRkIHRoZSA8Y29kZT4tLXdhdGNoPC9jb2RlPiBmbGFnLCB3aGljaCB3aWxsIHJlYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgaWYgYSByZWxldmFudCBmaWxlIGNoYW5nZXMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dCAtLXdhdGNoXFxuPC9jb2RlPjwvcHJlPlxcbjxwPklmIHlvdSYjMzk7cmUgdXNpbmcgSGFwaSBpbnN0ZWFkIG9mIEV4cHJlc3MsIHlvdSYjMzk7bGwgYWxzbyBuZWVkIHRvIHBhc3MgaW4gdGhlIDxjb2RlPmhhcGlpZnk8L2NvZGU+IHRyYW5zZm9ybSBzbyB0aGF0IHJvdXRlcyBnZXQgY29udmVydGVkIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSByb3V0aW5nIG1vZHVsZSB1bmRlcnN0YW5kLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXQgLS10cmFuc2Zvcm0gaGFwaWlmeVxcbjwvY29kZT48L3ByZT5cXG48cD5Ob3cgdGhhdCB5b3UgdW5kZXJzdGFuZCBob3cgdG8gdXNlIHRoZSBDTEkgb3IgYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgb24geW91ciBvd24sIGJvb3RpbmcgdXAgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSB3aWxsIGJlIGFuIGVhc3kgdGhpbmcgdG8gZG8hPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiYm9vdGluZy11cC10aGUtY2xpZW50LXNpZGUtcm91dGVyXFxcIj5Cb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXI8L2g0PlxcbjxwPk9uY2Ugd2UgaGF2ZSB0aGUgd2lyaW5nIG1vZHVsZSwgYm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgZW5naW5lIGlzIHByZXR0eSBlYXN5LiBUYXVudXMgc3VnZ2VzdHMgeW91IHVzZSA8Y29kZT5jbGllbnQvanM8L2NvZGU+IHRvIGtlZXAgYWxsIG9mIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdCBsb2dpYywgYnV0IHRoYXQgaXMgdXAgdG8geW91IHRvby4gRm9yIHRoZSBzYWtlIG9mIHRoaXMgZ3VpZGUsIGxldCYjMzk7cyBzdGljayB0byB0aGUgY29udmVudGlvbnMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIGNsaWVudC9qcy9tYWluLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT5tYWluPC9jb2RlPiBtb2R1bGUgd2lsbCBiZSB1c2VkIGFzIHRoZSA8ZW0+ZW50cnkgcG9pbnQ8L2VtPiBvZiB5b3VyIGFwcGxpY2F0aW9uIG9uIHRoZSBjbGllbnQtc2lkZS4gSGVyZSB5b3UmIzM5O2xsIG5lZWQgdG8gaW1wb3J0IDxjb2RlPnRhdW51czwvY29kZT4sIHRoZSB3aXJpbmcgbW9kdWxlIHdlJiMzOTt2ZSBqdXN0IGJ1aWx0LCBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIERPTSBlbGVtZW50IHdoZXJlIHlvdSBhcmUgcmVuZGVyaW5nIHlvdXIgcGFydGlhbCB2aWV3cy4gT25jZSB5b3UgaGF2ZSBhbGwgdGhhdCwgeW91IGNhbiBpbnZva2UgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHdpcmluZyA9IHJlcXVpcmUoJiMzOTsuLi8uLi8uYmluL3dpcmluZyYjMzk7KTtcXG52YXIgbWFpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCYjMzk7bWFpbiYjMzk7KVswXTtcXG5cXG50YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIG1vdW50cG9pbnQgd2lsbCBzZXQgdXAgdGhlIGNsaWVudC1zaWRlIFRhdW51cyByb3V0ZXIgYW5kIGZpcmUgdGhlIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlciBmb3IgdGhlIHZpZXcgdGhhdCBoYXMgYmVlbiByZW5kZXJlZCBpbiB0aGUgc2VydmVyLXNpZGUuIFdoZW5ldmVyIGFuIGFuY2hvciBsaW5rIGlzIGNsaWNrZWQsIFRhdW51cyB3aWxsIGJlIGFibGUgdG8gaGlqYWNrIHRoYXQgY2xpY2sgYW5kIHJlcXVlc3QgdGhlIG1vZGVsIHVzaW5nIEFKQVgsIGJ1dCBvbmx5IGlmIGl0IG1hdGNoZXMgYSB2aWV3IHJvdXRlLiBPdGhlcndpc2UgdGhlIGxpbmsgd2lsbCBiZWhhdmUganVzdCBsaWtlIGFueSBub3JtYWwgbGluayB3b3VsZC48L3A+XFxuPHA+QnkgZGVmYXVsdCwgdGhlIG1vdW50cG9pbnQgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3LiBUaGlzIGlzIGFraW4gdG8gd2hhdCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIGZyYW1ld29ya3Mgc3VjaCBhcyBBbmd1bGFySlMgZG8sIHdoZXJlIHZpZXdzIGFyZSBvbmx5IHJlbmRlcmVkIGFmdGVyIGFsbCB0aGUgSmF2YVNjcmlwdCBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGFuZCBleGVjdXRlZC4gRXhjZXB0IFRhdW51cyBwcm92aWRlcyBodW1hbi1yZWFkYWJsZSBjb250ZW50IGZhc3RlciwgYmVmb3JlIHRoZSBKYXZhU2NyaXB0IGV2ZW4gYmVnaW5zIGRvd25sb2FkaW5nLCBhbHRob3VnaCBpdCB3b24mIzM5O3QgYmUgZnVuY3Rpb25hbCB1bnRpbCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBydW5zLjwvcD5cXG48cD5BbiBhbHRlcm5hdGl2ZSBpcyB0byBpbmxpbmUgdGhlIHZpZXcgbW9kZWwgYWxvbmdzaWRlIHRoZSB2aWV3cyBpbiBhIDxjb2RlPiZsdDtzY3JpcHQgdHlwZT0mIzM5O3RleHQvdGF1bnVzJiMzOTsmZ3Q7PC9jb2RlPiB0YWcsIGJ1dCB0aGlzIHRlbmRzIHRvIHNsb3cgZG93biB0aGUgaW5pdGlhbCByZXNwb25zZSAobW9kZWxzIGFyZSA8ZW0+dHlwaWNhbGx5IGxhcmdlcjwvZW0+IHRoYW4gdGhlIHJlc3VsdGluZyB2aWV3cykuPC9wPlxcbjxwPkEgdGhpcmQgc3RyYXRlZ3kgaXMgdGhhdCB5b3UgcmVxdWVzdCB0aGUgbW9kZWwgYXN5bmNocm9ub3VzbHkgb3V0c2lkZSBvZiBUYXVudXMsIGFsbG93aW5nIHlvdSB0byBmZXRjaCBib3RoIHRoZSB2aWV3IG1vZGVsIGFuZCBUYXVudXMgaXRzZWxmIGNvbmN1cnJlbnRseSwgYnV0IHRoYXQmIzM5O3MgaGFyZGVyIHRvIHNldCB1cC48L3A+XFxuPHA+VGhlIHRocmVlIGJvb3Rpbmcgc3RyYXRlZ2llcyBhcmUgZXhwbGFpbmVkIGluIDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4gYW5kIGZ1cnRoZXIgZGlzY3Vzc2VkIGluIDxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+dGhlIG9wdGltaXphdGlvbiBndWlkZTwvYT4uIEZvciBub3csIHRoZSBkZWZhdWx0IHN0cmF0ZWd5IDxlbT4oPGNvZGU+JiMzOTthdXRvJiMzOTs8L2NvZGU+KTwvZW0+IHNob3VsZCBzdWZmaWNlLiBJdCBmZXRjaGVzIHRoZSB2aWV3IG1vZGVsIHVzaW5nIGFuIEFKQVggcmVxdWVzdCByaWdodCBhZnRlciBUYXVudXMgbG9hZHMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyXFxcIj5BZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXI8L2g0PlxcbjxwPkNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIHJ1biB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQsIGV2ZW4gaWYgaXQmIzM5O3MgYSBwYXJ0aWFsLiBUaGUgY29udHJvbGxlciBpcyBwYXNzZWQgdGhlIDxjb2RlPm1vZGVsPC9jb2RlPiwgY29udGFpbmluZyB0aGUgbW9kZWwgdGhhdCB3YXMgdXNlZCB0byByZW5kZXIgdGhlIHZpZXc7IHRoZSA8Y29kZT5yb3V0ZTwvY29kZT4sIGJyb2tlbiBkb3duIGludG8gaXRzIGNvbXBvbmVudHM7IGFuZCB0aGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiwgd2hpY2ggaXMgd2hhdGV2ZXIgRE9NIGVsZW1lbnQgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIGludG8uPC9wPlxcbjxwPlRoZXNlIGNvbnRyb2xsZXJzIGFyZSBlbnRpcmVseSBvcHRpb25hbCwgd2hpY2ggbWFrZXMgc2Vuc2Ugc2luY2Ugd2UmIzM5O3JlIHByb2dyZXNzaXZlbHkgZW5oYW5jaW5nIHRoZSBhcHBsaWNhdGlvbjogaXQgbWlnaHQgbm90IGV2ZW4gYmUgbmVjZXNzYXJ5ISBMZXQmIzM5O3MgYWRkIHNvbWUgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byB0aGUgZXhhbXBsZSB3ZSYjMzk7dmUgYmVlbiBidWlsZGluZy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+R3Vlc3Mgd2hhdD8gVGhlIGNvbnRyb2xsZXIgc2hvdWxkIGJlIGEgbW9kdWxlIHdoaWNoIGV4cG9ydHMgYSBmdW5jdGlvbi4gVGhhdCBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aGVuZXZlciB0aGUgdmlldyBpcyByZW5kZXJlZC4gRm9yIHRoZSBzYWtlIG9mIHNpbXBsaWNpdHkgd2UmIzM5O2xsIGp1c3QgcHJpbnQgdGhlIGFjdGlvbiBhbmQgdGhlIG1vZGVsIHRvIHRoZSBjb25zb2xlLiBJZiB0aGVyZSYjMzk7cyBvbmUgcGxhY2Ugd2hlcmUgeW91JiMzOTtkIHdhbnQgdG8gZW5oYW5jZSB0aGUgZXhwZXJpZW5jZSwgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIHdoZXJlIHlvdSB3YW50IHRvIHB1dCB5b3VyIGNvZGUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsLCByb3V0ZSwgY29udGFpbmVyKSB7XFxuICBjb25zb2xlLmxvZygmIzM5O1JlbmRlcmVkIHZpZXcgJXMgdXNpbmcgbW9kZWwgJXMmIzM5Oywgcm91dGUuYWN0aW9uLCBtb2RlbCk7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtY2xpZW50LXNpZGUtdGF1bnVzLWFwaVxcXCI+VXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUEk8L2g0PlxcbjxwPlRhdW51cyBkb2VzIHByb3ZpZGUgPGEgaHJlZj1cXFwiL2FwaVxcXCI+YSB0aGluIEFQSTwvYT4gaW4gdGhlIGNsaWVudC1zaWRlLiBVc2FnZSBvZiB0aGF0IEFQSSBiZWxvbmdzIG1vc3RseSBpbnNpZGUgdGhlIGJvZHkgb2YgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVycywgYnV0IHRoZXJlJiMzOTtzIGEgZmV3IG1ldGhvZHMgeW91IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBvbiBhIGdsb2JhbCBzY2FsZSBhcyB3ZWxsLjwvcD5cXG48cD5UYXVudXMgY2FuIG5vdGlmeSB5b3Ugd2hlbmV2ZXIgaW1wb3J0YW50IGV2ZW50cyBvY2N1ci48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPkV2ZW50PC90aD5cXG48dGg+QXJndW1lbnRzPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3N0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW4gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBmaW5pc2hlZCB0aGUgcm91dGUgc2V0dXAgYW5kIGlzIGFib3V0IHRvIGludm9rZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlci4gU3Vic2NyaWJlIHRvIHRoaXMgZXZlbnQgYmVmb3JlIGNhbGxpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3JlbmRlciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+QSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWQ8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLnN0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5kb25lJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGRhdGE8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmFib3J0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmVycm9yJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGVycjwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci48L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPkJlc2lkZXMgZXZlbnRzLCB0aGVyZSYjMzk7cyBhIGNvdXBsZSBtb3JlIG1ldGhvZHMgeW91IGNhbiB1c2UuIFRoZSA8Y29kZT50YXVudXMubmF2aWdhdGU8L2NvZGU+IG1ldGhvZCBhbGxvd3MgeW91IHRvIG5hdmlnYXRlIHRvIGEgVVJMIHdpdGhvdXQgdGhlIG5lZWQgZm9yIGEgaHVtYW4gdG8gY2xpY2sgb24gYW4gYW5jaG9yIGxpbmsuIFRoZW4gdGhlcmUmIzM5O3MgPGNvZGU+dGF1bnVzLnBhcnRpYWw8L2NvZGU+LCBhbmQgdGhhdCBhbGxvd3MgeW91IHRvIHJlbmRlciBhbnkgcGFydGlhbCB2aWV3IG9uIGEgRE9NIGVsZW1lbnQgb2YgeW91ciBjaG9vc2luZywgYW5kIGl0JiMzOTtsbCB0aGVuIGludm9rZSBpdHMgY29udHJvbGxlci4gWW91JiMzOTtsbCBuZWVkIHRvIGNvbWUgdXAgd2l0aCB0aGUgbW9kZWwgeW91cnNlbGYsIHRob3VnaC48L3A+XFxuPHA+QXN0b25pc2hpbmdseSwgdGhlIEFQSSBpcyBmdXJ0aGVyIGRvY3VtZW50ZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2g0PlxcbjxwPjxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+UGVyZm9ybWFuY2U8L2E+IHBsYXlzIGFuIGltcG9ydGFudCByb2xlIGluIFRhdW51cy4gVGhhdCYjMzk7cyB3aHkgdGhlIHlvdSBjYW4gcGVyZm9ybSBjYWNoaW5nIGFuZCBwcmVmZXRjaGluZyBvbiB0aGUgY2xpZW50LXNpZGUganVzdCBieSB0dXJuaW5nIG9uIGEgcGFpciBvZiBmbGFncy4gQnV0IHdoYXQgZG8gdGhlc2UgZmxhZ3MgZG8gZXhhY3RseT88L3A+XFxuPHA+V2hlbiB0dXJuZWQgb24sIGJ5IHBhc3NpbmcgPGNvZGU+eyBjYWNoZTogdHJ1ZSB9PC9jb2RlPiBhcyB0aGUgdGhpcmQgcGFyYW1ldGVyIGZvciA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LCB0aGUgY2FjaGluZyBsYXllciB3aWxsIG1ha2Ugc3VyZSB0aGF0IHJlc3BvbnNlcyBhcmUga2VwdCBhcm91bmQgZm9yIDxjb2RlPjE1PC9jb2RlPiBzZWNvbmRzLiBXaGVuZXZlciBhIHJvdXRlIG5lZWRzIGEgbW9kZWwgaW4gb3JkZXIgdG8gcmVuZGVyIGEgdmlldywgaXQmIzM5O2xsIGZpcnN0IGFzayB0aGUgY2FjaGluZyBsYXllciBmb3IgYSBmcmVzaCBjb3B5LiBJZiB0aGUgY2FjaGluZyBsYXllciBkb2VzbiYjMzk7dCBoYXZlIGEgY29weSwgb3IgaWYgdGhhdCBjb3B5IGlzIHN0YWxlIDxlbT4oaW4gdGhpcyBjYXNlLCBvbGRlciB0aGFuIDxjb2RlPjE1PC9jb2RlPiBzZWNvbmRzKTwvZW0+LCB0aGVuIGFuIEFKQVggcmVxdWVzdCB3aWxsIGJlIGlzc3VlZCB0byB0aGUgc2VydmVyLiBPZiBjb3Vyc2UsIHRoZSBkdXJhdGlvbiBpcyBjb25maWd1cmFibGUuIElmIHlvdSB3YW50IHRvIHVzZSBhIHZhbHVlIG90aGVyIHRoYW4gdGhlIGRlZmF1bHQsIHlvdSBzaG91bGQgc2V0IDxjb2RlPmNhY2hlPC9jb2RlPiB0byBhIG51bWJlciBpbiBzZWNvbmRzIGluc3RlYWQgb2YganVzdCA8Y29kZT50cnVlPC9jb2RlPi48L3A+XFxuPHA+U2luY2UgVGF1bnVzIHVuZGVyc3RhbmRzIHRoYXQgbm90IGV2ZXJ5IHZpZXcgb3BlcmF0ZXMgdW5kZXIgdGhlIHNhbWUgY29uc3RyYWludHMsIHlvdSYjMzk7cmUgYWxzbyBhYmxlIHRvIHNldCBhIDxjb2RlPmNhY2hlPC9jb2RlPiBmcmVzaG5lc3MgZHVyYXRpb24gZGlyZWN0bHkgaW4geW91ciByb3V0ZXMuIFRoZSA8Y29kZT5jYWNoZTwvY29kZT4gcHJvcGVydHkgaW4gcm91dGVzIGhhcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGRlZmF1bHQgdmFsdWUuPC9wPlxcbjxwPlRoZXJlJiMzOTtzIGN1cnJlbnRseSB0d28gY2FjaGluZyBzdG9yZXM6IGEgcmF3IGluLW1lbW9yeSBzdG9yZSwgYW5kIGFuIDxhIGhyZWY9XFxcImh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxcIj5JbmRleGVkREI8L2E+IHN0b3JlLiBJbmRleGVkREIgaXMgYW4gZW1iZWRkZWQgZGF0YWJhc2Ugc29sdXRpb24sIGFuZCB5b3UgY2FuIHRoaW5rIG9mIGl0IGxpa2UgYW4gYXN5bmNocm9ub3VzIHZlcnNpb24gb2YgPGNvZGU+bG9jYWxTdG9yYWdlPC9jb2RlPi4gSXQgaGFzIDxhIGhyZWY9XFxcImh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXFwiPnN1cnByaXNpbmdseSBicm9hZCBicm93c2VyIHN1cHBvcnQ8L2E+LCBhbmQgaW4gdGhlIGNhc2VzIHdoZXJlIGl0JiMzOTtzIG5vdCBzdXBwb3J0ZWQgdGhlbiBjYWNoaW5nIGlzIGRvbmUgc29sZWx5IGluLW1lbW9yeS48L3A+XFxuPHA+VGhlIHByZWZldGNoaW5nIG1lY2hhbmlzbSBpcyBhbiBpbnRlcmVzdGluZyBzcGluLW9mZiBvZiBjYWNoaW5nLCBhbmQgaXQgcmVxdWlyZXMgY2FjaGluZyB0byBiZSBlbmFibGVkIGluIG9yZGVyIHRvIHdvcmsuIFdoZW5ldmVyIGh1bWFucyBob3ZlciBvdmVyIGEgbGluaywgb3Igd2hlbmV2ZXIgdGhleSBwdXQgdGhlaXIgZmluZ2VyIG9uIG9uZSBvZiB0aGVtIDxlbT4odGhlIDxjb2RlPnRvdWNoc3RhcnQ8L2NvZGU+IGV2ZW50KTwvZW0+LCB0aGUgcHJlZmV0Y2hlciB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgZm9yIHRoYXQgbGluay48L3A+XFxuPHA+SWYgdGhlIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkgdGhlbiB0aGUgcmVzcG9uc2Ugd2lsbCBiZSBjYWNoZWQgaW4gdGhlIHNhbWUgd2F5IGFueSBvdGhlciB2aWV3IHdvdWxkIGJlIGNhY2hlZC4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGFub3RoZXIgbGluayB3aGlsZSB0aGUgcHJldmlvdXMgb25lIGlzIHN0aWxsIGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhlIG9sZCByZXF1ZXN0IGlzIGFib3J0ZWQsIGFzIG5vdCB0byBkcmFpbiB0aGVpciA8ZW0+KHBvc3NpYmx5IGxpbWl0ZWQpPC9lbT4gSW50ZXJuZXQgY29ubmVjdGlvbiBiYW5kd2lkdGguPC9wPlxcbjxwPklmIHRoZSBodW1hbiBjbGlja3Mgb24gdGhlIGxpbmsgYmVmb3JlIHByZWZldGNoaW5nIGlzIGNvbXBsZXRlZCwgaGUmIzM5O2xsIG5hdmlnYXRlIHRvIHRoZSB2aWV3IGFzIHNvb24gYXMgcHJlZmV0Y2hpbmcgZW5kcywgcmF0aGVyIHRoYW4gZmlyaW5nIGFub3RoZXIgcmVxdWVzdC4gVGhpcyBoZWxwcyBUYXVudXMgc2F2ZSBwcmVjaW91cyBtaWxsaXNlY29uZHMgd2hlbiBkZWFsaW5nIHdpdGggbGF0ZW5jeS1zZW5zaXRpdmUgb3BlcmF0aW9ucy48L3A+XFxuPHA+VHVybmluZyBwcmVmZXRjaGluZyBvbiBpcyBzaW1wbHkgYSBtYXR0ZXIgb2Ygc2V0dGluZyA8Y29kZT5wcmVmZXRjaDwvY29kZT4gdG8gPGNvZGU+dHJ1ZTwvY29kZT4gaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uIEZvciBhZGRpdGlvbmFsIGluc2lnaHRzIGludG8gdGhlIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50cyBUYXVudXMgY2FuIG9mZmVyLCBoZWFkIG92ZXIgdG8gdGhlIDxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+UGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uczwvYT4gZ3VpZGUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGhlLXNreS1pcy10aGUtbGltaXQtXFxcIj5UaGUgc2t5IGlzIHRoZSBsaW1pdCE8L2gxPlxcbjxwPllvdSYjMzk7cmUgbm93IGZhbWlsaWFyIHdpdGggaG93IFRhdW51cyB3b3JrcyBvbiBhIGhpZ2gtbGV2ZWwuIFlvdSBoYXZlIGNvdmVyZWQgYSBkZWNlbnQgYW1vdW50IG9mIGdyb3VuZCwgYnV0IHlvdSBzaG91bGRuJiMzOTt0IHN0b3AgdGhlcmUuPC9wPlxcbjx1bD5cXG48bGk+TGVhcm4gbW9yZSBhYm91dCA8YSBocmVmPVxcXCIvYXBpXFxcIj50aGUgQVBJIFRhdW51cyBoYXM8L2E+IHRvIG9mZmVyPC9saT5cXG48bGk+R28gdGhyb3VnaCB0aGUgPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5wZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gdGlwczwvYT4uIFlvdSBtYXkgbGVhcm4gc29tZXRoaW5nIG5ldyE8L2xpPlxcbjxsaT48ZW0+RmFtaWxpYXJpemUgeW91cnNlbGYgd2l0aCB0aGUgd2F5cyBvZiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudDwvZW0+PHVsPlxcbjxsaT5KZXJlbXkgS2VpdGggZW51bmNpYXRlcyA8YSBocmVmPVxcXCJodHRwczovL2FkYWN0aW8uY29tL2pvdXJuYWwvNzcwNlxcXCI+JnF1b3Q7QmUgcHJvZ3Jlc3NpdmUmcXVvdDs8L2E+PC9saT5cXG48bGk+Q2hyaXN0aWFuIEhlaWxtYW5uIGFkdm9jYXRlcyBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL2ljYW50LmNvLnVrL2FydGljbGVzL3ByYWdtYXRpYy1wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC9cXFwiPiZxdW90O1ByYWdtYXRpYyBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCZxdW90OzwvYT48L2xpPlxcbjxsaT5KYWtlIEFyY2hpYmFsZCBleHBsYWlucyBob3cgPGEgaHJlZj1cXFwiaHR0cDovL2pha2VhcmNoaWJhbGQuY29tLzIwMTMvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtaXMtZmFzdGVyL1xcXCI+JnF1b3Q7UHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgaXMgZmFzdGVyJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkkgYmxvZ2dlZCBhYm91dCBob3cgd2Ugc2hvdWxkIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPiZxdW90O1N0b3AgQnJlYWtpbmcgdGhlIFdlYiZxdW90OzwvYT48L2xpPlxcbjxsaT5HdWlsbGVybW8gUmF1Y2ggYXJndWVzIGZvciA8YSBocmVmPVxcXCJodHRwOi8vcmF1Y2hnLmNvbS8yMDE0LzctcHJpbmNpcGxlcy1vZi1yaWNoLXdlYi1hcHBsaWNhdGlvbnMvXFxcIj4mcXVvdDs3IFByaW5jaXBsZXMgb2YgUmljaCBXZWIgQXBwbGljYXRpb25zJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkFhcm9uIEd1c3RhZnNvbiB3cml0ZXMgPGEgaHJlZj1cXFwiaHR0cDovL2FsaXN0YXBhcnQuY29tL2FydGljbGUvdW5kZXJzdGFuZGluZ3Byb2dyZXNzaXZlZW5oYW5jZW1lbnRcXFwiPiZxdW90O1VuZGVyc3RhbmRpbmcgUHJvZ3Jlc3NpdmUgRW5oYW5jZW1lbnQmcXVvdDs8L2E+PC9saT5cXG48bGk+T3JkZSBTYXVuZGVycyBnaXZlcyBoaXMgcG9pbnQgb2YgdmlldyBpbiA8YSBocmVmPVxcXCJodHRwczovL2RlY2FkZWNpdHkubmV0L2Jsb2cvMjAxMy8wOS8xNi9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1mb3ItZmF1bHQtdG9sZXJhbmNlXFxcIj4mcXVvdDtQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBmb3IgZmF1bHQgdG9sZXJhbmNlJnF1b3Q7PC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5TaWZ0IHRocm91Z2ggdGhlIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+Y29tcGxlbWVudGFyeSBtb2R1bGVzPC9hPi4gWW91IG1heSBmaW5kIHNvbWV0aGluZyB5b3UgaGFkbiYjMzk7dCB0aG91Z2h0IG9mITwvbGk+XFxuPC91bD5cXG48cD5BbHNvLCBnZXQgaW52b2x2ZWQhPC9wPlxcbjx1bD5cXG48bGk+Rm9yayB0aGlzIHJlcG9zaXRvcnkgYW5kIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvL3B1bGxzXFxcIj5zZW5kIHNvbWUgcHVsbCByZXF1ZXN0czwvYT4gdG8gaW1wcm92ZSB0aGVzZSBndWlkZXMhPC9saT5cXG48bGk+U2VlIHNvbWV0aGluZywgc2F5IHNvbWV0aGluZyEgSWYgeW91IGRldGVjdCBhIGJ1ZywgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMvaXNzdWVzL25ld1xcXCI+cGxlYXNlIGNyZWF0ZSBhbiBpc3N1ZTwvYT4hPC9saT5cXG48L3VsPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgR2V0dGluZyBTdGFydGVkXFxuXFxuICAgIFRhdW51cyBpcyBhIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZSBmb3IgTm9kZS5qcywgYW5kIGl0J3MgX3VwIHRvIHlvdSBob3cgdG8gdXNlIGl0Xy4gSW4gZmFjdCwgaXQgbWlnaHQgYmUgYSBnb29kIGlkZWEgZm9yIHlvdSB0byAqKnNldCB1cCBqdXN0IHRoZSBzZXJ2ZXItc2lkZSBhc3BlY3QgZmlyc3QqKiwgYXMgdGhhdCdsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC5cXG5cXG4gICAgIyBUYWJsZSBvZiBDb250ZW50c1xcblxcbiAgICAtIFtIb3cgaXQgd29ya3NdKCNob3ctaXQtd29ya3MpXFxuICAgIC0gW0luc3RhbGxpbmcgVGF1bnVzXSgjaW5zdGFsbGluZy10YXVudXMpXFxuICAgIC0gW1NldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlXSgjc2V0dGluZy11cC10aGUtc2VydmVyLXNpZGUpXFxuICAgICAgLSBbQ3JlYXRpbmcgYSBsYXlvdXRdKCNjcmVhdGluZy1hLWxheW91dClcXG4gICAgICAtIFtZb3VyIGZpcnN0IHJvdXRlXSgjeW91ci1maXJzdC1yb3V0ZSlcXG4gICAgICAtIFtVc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmVdKCN1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmUpXFxuICAgICAgLSBbVGhyb3dpbmcgaW4gYSBjb250cm9sbGVyXSgjdGhyb3dpbmctaW4tYS1jb250cm9sbGVyKVxcbiAgICAtIFtUYXVudXMgaW4gdGhlIGNsaWVudF0oI3RhdW51cy1pbi10aGUtY2xpZW50KVxcbiAgICAgIC0gW1VzaW5nIHRoZSBUYXVudXMgQ0xJXSgjdXNpbmctdGhlLXRhdW51cy1jbGkpXFxuICAgICAgLSBbQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXSgjYm9vdGluZy11cC10aGUtY2xpZW50LXNpZGUtcm91dGVyKVxcbiAgICAgIC0gW0FkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcl0oI2FkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlcilcXG4gICAgICAtIFtVc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSV0oI3VzaW5nLXRoZS1jbGllbnQtc2lkZS10YXVudXMtYXBpKVxcbiAgICAgIC0gW0NhY2hpbmcgYW5kIFByZWZldGNoaW5nXSgjY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmcpXFxuICAgIC0gW1RoZSBza3kgaXMgdGhlIGxpbWl0IV0oI3RoZS1za3ktaXMtdGhlLWxpbWl0LSlcXG5cXG4gICAgIyBIb3cgaXQgd29ya3NcXG5cXG4gICAgVGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0ICoqcHJvdmVuKiogc2V0IG9mIHJ1bGVzLlxcblxcbiAgICAtIERlZmluZSBhIGBmdW5jdGlvbihtb2RlbClgIGZvciBlYWNoIHlvdXIgdmlld3NcXG4gICAgLSBQdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50XFxuICAgIC0gRGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvblxcbiAgICAtIFB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50XFxuICAgIC0gRW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzXFxuICAgIC0gQ3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzXFxuICAgIC0gQ3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3XFxuICAgIC0gRm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZVxcbiAgICAtIFdoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhXFxuICAgIC0gT25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgKipoaWphY2sgbGluayBjbGlja3MqKiBhbmQgbWFrZSBBSkFYIHJlcXVlc3RzIGluc3RlYWRcXG4gICAgLSBXaGVuIHlvdSBnZXQgdGhlIEpTT04gbW9kZWwgYmFjaywgcmVuZGVyIHZpZXdzIG9uIHRoZSBjbGllbnQtc2lkZVxcbiAgICAtIElmIHRoZSBgaGlzdG9yeWAgQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gKipEb24ndCBjb25mdXNlIHlvdXIgaHVtYW5zIHdpdGggb2JzY3VyZSBoYXNoIHJvdXRlcnMhKipcXG5cXG4gICAgSSdsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJ2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIHN0ZXBzIHlvdSBuZWVkIHRvIHRha2UgaW4gb3JkZXIgdG8gbWFrZSB0aGlzIGZsb3cgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIEluc3RhbGxpbmcgVGF1bnVzXFxuXFxuICAgIEZpcnN0IG9mZiwgeW91J2xsIG5lZWQgdG8gY2hvb3NlIGEgSFRUUCBzZXJ2ZXIgZnJhbWV3b3JrIGZvciB5b3VyIGFwcGxpY2F0aW9uLiBBdCB0aGUgbW9tZW50IFRhdW51cyBzdXBwb3J0cyBvbmx5IGEgY291cGxlIG9mIEhUVFAgZnJhbWV3b3JrcywgYnV0IG1vcmUgbWF5IGJlIGFkZGVkIGlmIHRoZXkgYXJlIHBvcHVsYXIgZW5vdWdoLlxcblxcbiAgICAtIFtFeHByZXNzXVs2XSwgdGhyb3VnaCBbdGF1bnVzLWV4cHJlc3NdWzFdXFxuICAgIC0gW0hhcGldWzddLCB0aHJvdWdoIFt0YXVudXMtaGFwaV1bMl0gYW5kIHRoZSBbaGFwaWlmeV1bM10gdHJhbnNmb3JtXFxuXFxuICAgID4gSWYgeW91J3JlIG1vcmUgb2YgYSBfXFxcInJ1bW1hZ2UgdGhyb3VnaCBzb21lb25lIGVsc2UncyBjb2RlXFxcIl8gdHlwZSBvZiBkZXZlbG9wZXIsIHlvdSBtYXkgZmVlbCBjb21mb3J0YWJsZSBbZ29pbmcgdGhyb3VnaCB0aGlzIHdlYnNpdGUncyBzb3VyY2UgY29kZV1bNF0sIHdoaWNoIHVzZXMgdGhlIFtIYXBpXVs3XSBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIFtwb255Zm9vLmNvbV1bNV0sIHdoaWNoIGlzICoqYSBtb3JlIGFkdmFuY2VkIHVzZS1jYXNlKiogdW5kZXIgdGhlIFtFeHByZXNzXVs2XSBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0J3Mgb2theSB0b28uXFxuXFxuICAgIE9uY2UgeW91J3ZlIHNldHRsZWQgZm9yIGVpdGhlciBbRXhwcmVzc11bNl0gb3IgW0hhcGldWzddIHlvdSdsbCBiZSBhYmxlIHRvIHByb2NlZWQuIEZvciB0aGUgcHVycG9zZXMgb2YgdGhpcyBndWlkZSwgd2UnbGwgdXNlIFtFeHByZXNzXVs2XS4gU3dpdGNoaW5nIGJldHdlZW4gb25lIG9mIHRoZSBkaWZmZXJlbnQgSFRUUCBmbGF2b3JzIGlzIHN0cmlraW5nbHkgZWFzeSwgdGhvdWdoLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlXFxuXFxuICAgIE5hdHVyYWxseSwgeW91J2xsIG5lZWQgdG8gaW5zdGFsbCBhbGwgb2YgdGhlIGZvbGxvd2luZyBtb2R1bGVzIGZyb20gYG5wbWAgdG8gZ2V0IHN0YXJ0ZWQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIHRhdW51cyB0YXVudXMtZXhwcmVzcyBleHByZXNzIC0tc2F2ZVxcbiAgICBgYGBcXG5cXG4gICAgTGV0J3MgYnVpbGQgb3VyIGFwcGxpY2F0aW9uIHN0ZXAtYnktc3RlcCwgYW5kIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSdsbCBuZWVkIHRoZSBmYW1vdXMgYGFwcC5qc2AgZmlsZS5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggYXBwLmpzXFxuICAgIGBgYFxcblxcbiAgICBJdCdzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciBgYXBwLmpzYCBmaWxlLCBsZXQncyBkbyB0aGF0IG5vdy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge307XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgQWxsIGB0YXVudXMtZXhwcmVzc2AgcmVhbGx5IGRvZXMgaXMgYWRkIGEgYnVuY2ggb2Ygcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBgYXBwYC4gWW91IHNob3VsZCBub3RlIHRoYXQgYW55IG1pZGRsZXdhcmUgYW5kIEFQSSByb3V0ZXMgc2hvdWxkIHByb2JhYmx5IGNvbWUgYmVmb3JlIHRoZSBgdGF1bnVzRXhwcmVzc2AgaW52b2NhdGlvbi4gWW91J2xsIHByb2JhYmx5IGJlIHVzaW5nIGEgY2F0Y2gtYWxsIHZpZXcgcm91dGUgdGhhdCByZW5kZXJzIGEgX1xcXCJOb3QgRm91bmRcXFwiXyB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS5cXG5cXG4gICAgVGhlIGBvcHRpb25zYCBvYmplY3QgcGFzc2VkIHRvIGB0YXVudXNFeHByZXNzYCBsZXQncyB5b3UgY29uZmlndXJlIFRhdW51cy4gSW5zdGVhZCBvZiBkaXNjdXNzaW5nIGV2ZXJ5IHNpbmdsZSBjb25maWd1cmF0aW9uIG9wdGlvbiB5b3UgY291bGQgc2V0IGhlcmUsIGxldCdzIGRpc2N1c3Mgd2hhdCBtYXR0ZXJzOiB0aGUgX3JlcXVpcmVkIGNvbmZpZ3VyYXRpb25fLiBUaGVyZSdzIHR3byBvcHRpb25zIHRoYXQgeW91IG11c3Qgc2V0IGlmIHlvdSB3YW50IHlvdXIgVGF1bnVzIGFwcGxpY2F0aW9uIHRvIG1ha2UgYW55IHNlbnNlLlxcblxcbiAgICAtIGBsYXlvdXRgIHNob3VsZCBiZSBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSBzaW5nbGUgYG1vZGVsYCBhcmd1bWVudCBhbmQgcmV0dXJucyBhbiBlbnRpcmUgSFRNTCBkb2N1bWVudFxcbiAgICAtIGByb3V0ZXNgIHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlc1xcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENyZWF0aW5nIGEgbGF5b3V0XFxuXFxuICAgIExldCdzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQnbGwganVzdCBiZSBhIHBsYWluIEphdmFTY3JpcHQgZnVuY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGxheW91dC5qc1xcbiAgICBgYGBcXG5cXG4gICAgTm90ZSB0aGF0IHRoZSBgcGFydGlhbGAgcHJvcGVydHkgaW4gdGhlIGBtb2RlbGAgXyhhcyBzZWVuIGJlbG93KV8gaXMgY3JlYXRlZCBvbiB0aGUgZmx5IGFmdGVyIHJlbmRlcmluZyBwYXJ0aWFsIHZpZXdzLiBUaGUgbGF5b3V0IGZ1bmN0aW9uIHdlJ2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgX1xcXCJ0aGVyZSBpcyBubyBsYXlvdXQsIGp1c3QgcmVuZGVyIHRoZSBwYXJ0aWFsc1xcXCJfLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgcmV0dXJuIG1vZGVsLnBhcnRpYWw7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPZiBjb3Vyc2UsIGlmIHlvdSB3ZXJlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uLCB0aGVuIHlvdSBwcm9iYWJseSB3b3VsZG4ndCB3YW50IHRvIHdyaXRlIHZpZXdzIGFzIEphdmFTY3JpcHQgZnVuY3Rpb25zIGFzIHRoYXQncyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuXFxuXFxuICAgIC0gW011c3RhY2hlXVsxMF0gaXMgYSB0ZW1wbGF0aW5nIGVuZ2luZSB0aGF0IGNhbiBjb21waWxlIHlvdXIgdmlld3MgaW50byBwbGFpbiBmdW5jdGlvbnMsIHVzaW5nIGEgc3ludGF4IHRoYXQncyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTFxcbiAgICAtIFtKYWRlXVsxMV0gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSdzIG5vIGNsb3NpbmcgdGFnc1xcbiAgICAtIFRoZXJlJ3MgbWFueSBtb3JlIGFsdGVybmF0aXZlcyBsaWtlIFtNb3ppbGxhJ3MgTnVuanVja3NdWzEyXSwgW0hhbmRsZWJhcnNdWzEzXSwgYW5kIFtFSlNdWzE0XS5cXG5cXG4gICAgUmVtZW1iZXIgdG8gYWRkIHRoZSBgbGF5b3V0YCB1bmRlciB0aGUgYG9wdGlvbnNgIG9iamVjdCBwYXNzZWQgdG8gYHRhdW51c0V4cHJlc3NgIVxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgWW91J2xsIGZpbmQgdG9vbHMgcmVsYXRlZCB0byB2aWV3IHRlbXBsYXRpbmcgaW4gdGhlIFtjb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbl1bMTVdLiBJZiB5b3UgZG9uJ3QgcHJvdmlkZSBhIGBsYXlvdXRgIHByb3BlcnR5IGF0IGFsbCwgVGF1bnVzIHdpbGwgcmVuZGVyIHlvdXIgbW9kZWwgaW4gYSByZXNwb25zZSBieSB3cmFwcGluZyBpdCBpbiBgPHByZT5gIGFuZCBgPGNvZGU+YCB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBZb3VyIGZpcnN0IHJvdXRlXFxuXFxuICAgIFJvdXRlcyBuZWVkIHRvIGJlIHBsYWNlZCBpbiBpdHMgb3duIGRlZGljYXRlZCBtb2R1bGUsIHNvIHRoYXQgeW91IGNhbiByZXVzZSBpdCBsYXRlciBvbiAqKndoZW4gc2V0dGluZyB1cCBjbGllbnQtc2lkZSByb3V0aW5nKiouIExldCdzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIHJvdXRlcy5qc1xcbiAgICBgYGBcXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IFtcXG4gICAgICB7IHJvdXRlOiAnLycsIGFjdGlvbjogJ2hvbWUvaW5kZXgnIH1cXG4gICAgXTtcXG4gICAgYGBgXFxuXFxuICAgIEVhY2ggaXRlbSBpbiB0aGUgZXhwb3J0ZWQgYXJyYXkgaXMgYSByb3V0ZS4gSW4gdGhpcyBjYXNlLCB3ZSBvbmx5IGhhdmUgdGhlIGAvYCByb3V0ZSB3aXRoIHRoZSBgaG9tZS9pbmRleGAgYWN0aW9uLiBUYXVudXMgZm9sbG93cyB0aGUgd2VsbCBrbm93biBbY29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb24gcGF0dGVybl1bOF0sIHdoaWNoIG1hZGUgW1J1Ynkgb24gUmFpbHNdWzldIGZhbW91cy4gX01heWJlIG9uZSBkYXkgVGF1bnVzIHdpbGwgYmUgZmFtb3VzIHRvbyFfIEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSBgaG9tZS9pbmRleGAgYWN0aW9uIHVzZXMgdGhlIGBob21lL2luZGV4YCBjb250cm9sbGVyIGFuZCByZW5kZXJzIHRoZSBgaG9tZS9pbmRleGAgdmlldy4gT2YgY291cnNlLCBfYWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbl8uXFxuXFxuICAgIFRpbWUgdG8gZ28gYmFjayB0byBgYXBwLmpzYCBhbmQgdXBkYXRlIHRoZSBgb3B0aW9uc2Agb2JqZWN0LlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuL2xheW91dCcpLFxcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9yb3V0ZXMnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIEl0J3MgaW1wb3J0YW50IHRvIGtub3cgdGhhdCBpZiB5b3Ugb21pdCB0aGUgY3JlYXRpb24gb2YgYSBjb250cm9sbGVyIHRoZW4gVGF1bnVzIHdpbGwgc2tpcCB0aGF0IHN0ZXAsIGFuZCByZW5kZXIgdGhlIHZpZXcgcGFzc2luZyBpdCB3aGF0ZXZlciB0aGUgZGVmYXVsdCBtb2RlbCBpcyBfKG1vcmUgb24gdGhhdCBsYXRlciwgYnV0IGl0IGRlZmF1bHRzIHRvIGB7fWApXy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmVcXG5cXG4gICAgTGV0J3MgZ28gYWhlYWQgYW5kIHVzZSBKYWRlIGFzIHRoZSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgb2YgY2hvaWNlIGZvciBvdXIgdmlld3MuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIHZpZXdzL2hvbWUvaW5kZXguamFkZVxcbiAgICBgYGBcXG5cXG4gICAgU2luY2Ugd2UncmUganVzdCBnZXR0aW5nIHN0YXJ0ZWQsIHRoZSB2aWV3IHdpbGwganVzdCBoYXZlIHNvbWUgYmFzaWMgc3RhdGljIGNvbnRlbnQsIGFuZCB0aGF0J3MgaXQuXFxuXFxuICAgIGBgYGphZGVcXG4gICAgcCBIZWxsbyBUYXVudXMhXFxuICAgIGBgYFxcblxcbiAgICBOZXh0IHlvdSdsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIFtqYWR1bV1bMTZdLCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIGByZXF1aXJlYCBzdGF0ZW1lbnRzLCBhbmQgdGh1cyBzYXZpbmcgYnl0ZXMgd2hlbiBpdCBjb21lcyB0byBjbGllbnQtc2lkZSByZW5kZXJpbmcuIExldCdzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIF8oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UncmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24pXy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgamFkdW0gLWdcXG4gICAgYGBgXFxuXFxuICAgIFRvIGNvbXBpbGUgZXZlcnkgdmlldyBpbiB0aGUgYHZpZXdzYCBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgYC0tb3V0cHV0YCBmbGFnIGluZGljYXRlcyB3aGVyZSB5b3Ugd2FudCB0aGUgdmlld3MgdG8gYmUgcGxhY2VkLiBXZSBjaG9zZSB0byB1c2UgYC5iaW5gIGJlY2F1c2UgdGhhdCdzIHdoZXJlIFRhdW51cyBleHBlY3RzIHlvdXIgY29tcGlsZWQgdmlld3MgdG8gYmUgYnkgZGVmYXVsdC4gQnV0IHNpbmNlIFRhdW51cyBmb2xsb3dzIHRoZSBbY29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb25dWzE3XSBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIGphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG4gICAgYGBgXFxuXFxuICAgIENvbmdyYXR1bGF0aW9ucyEgVGF1bnVzIGlzIG5vdyBvcGVyYXRpb25hbC4gQWxsIHRoYXQncyBsZWZ0IGlzIGZvciB5b3UgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhbmQgdmlzaXQgaXQgb24gcG9ydCBgMzAwMGAuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgb3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG4gICAgYGBgXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVGhyb3dpbmcgaW4gYSBjb250cm9sbGVyXFxuXFxuICAgIENvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24ndCBnZXQgdmVyeSBmYXIuIENvbnRyb2xsZXJzIGFsbG93IHlvdSB0byBoYW5kbGUgdGhlIHJlcXVlc3QgYW5kIHB1dCB0b2dldGhlciB0aGUgbW9kZWwgdG8gYmUgdXNlZCB3aGVuIHNlbmRpbmcgYSByZXNwb25zZS4gQ29udHJhcnkgdG8gd2hhdCBtb3N0IGZyYW1ld29ya3MgcHJvcG9zZSwgVGF1bnVzIGV4cGVjdHMgZXZlcnkgYWN0aW9uIHRvIGhhdmUgaXRzIG93biBpbmRpdmlkdWFsIGNvbnRyb2xsZXIuIFNpbmNlIE5vZGUuanMgbWFrZXMgaXQgZWFzeSB0byBpbXBvcnQgY29tcG9uZW50cywgdGhpcyBzZXR1cCBoZWxwcyB5b3Uga2VlcCB5b3VyIGNvZGUgbW9kdWxhciB3aGlsZSBzdGlsbCBiZWluZyBhYmxlIHRvIHJldXNlIGxvZ2ljIGJ5IHNoYXJpbmcgbW9kdWxlcyBhY3Jvc3MgZGlmZmVyZW50IGNvbnRyb2xsZXJzLiBMZXQncyBjcmVhdGUgYSBjb250cm9sbGVyIGZvciB0aGUgYGhvbWUvdmlld2AgYWN0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuICAgIGBgYFxcblxcbiAgICBUaGUgY29udHJvbGxlciBtb2R1bGUgc2hvdWxkIG1lcmVseSBleHBvcnQgYSBmdW5jdGlvbi4gX1N0YXJ0ZWQgbm90aWNpbmcgdGhlIHBhdHRlcm4/XyBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gW0V4cHJlc3NdWzZdIF8ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIFtIYXBpXVs3XSBpbiB0aGUgY2FzZSBvZiBgdGF1bnVzLWhhcGlgKV8uXFxuXFxuICAgIEFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbid0IGV2ZW4gc2V0IGEgZG9jdW1lbnQgdGl0bGUgZm9yIHlvdXIgSFRNTCBwYWdlcyEgVHVybnMgb3V0LCB0aGVyZSdzIGEgZmV3IG1vZGVsIHByb3BlcnRpZXMgXyh2ZXJ5IGZldylfIHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIGB0aXRsZWAgcHJvcGVydHksIGFuZCBpdCdsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgYGRvY3VtZW50LnRpdGxlYCBpbiB5b3VyIHBhZ2VzIHdoZW4gbmF2aWdhdGluZyB0aHJvdWdoIHRoZSBjbGllbnQtc2lkZS4gS2VlcCBpbiBtaW5kIHRoYXQgYW55dGhpbmcgdGhhdCdzIG5vdCBpbiB0aGUgYG1vZGVsYCBwcm9wZXJ0eSB3b24ndCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LlxcblxcbiAgICBIZXJlIGlzIG91ciBuZXdmYW5nbGVkIGBob21lL2luZGV4YCBjb250cm9sbGVyLiBBcyB5b3UnbGwgbm90aWNlLCBpdCBkb2Vzbid0IGRpc3J1cHQgYW55IG9mIHRoZSB0eXBpY2FsIEV4cHJlc3MgZXhwZXJpZW5jZSwgYnV0IG1lcmVseSBidWlsZHMgdXBvbiBpdC4gV2hlbiBgbmV4dGAgaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byBgcmVzLnZpZXdNb2RlbGAuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gICAgICByZXMudmlld01vZGVsID0ge1xcbiAgICAgICAgbW9kZWw6IHtcXG4gICAgICAgICAgdGl0bGU6ICdXZWxjb21lIEhvbWUsIFRhdW51cyEnXFxuICAgICAgICB9XFxuICAgICAgfTtcXG4gICAgICBuZXh0KCk7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSBfd291bGRuJ3QgYmUgcHJvZ3Jlc3NpdmVfLCBhbmQgdGh1cyBbaXQgd291bGQgYmUgcmVhbGx5LCBfcmVhbGx5XyBiYWRdWzE3XS4gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgbGF5b3V0IHRvIHVzZSB3aGF0ZXZlciBgdGl0bGVgIGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCdzIGdvIGJhY2sgdG8gdGhlIGRyYXdpbmcgYm9hcmQgYW5kIG1ha2UgdGhlIGxheW91dCBpbnRvIGEgSmFkZSB0ZW1wbGF0ZSEgVGhlIGAhPWAgc3ludGF4IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbid0IGJlIGVzY2FwZWQuIFRoYXQncyBva2F5IGJlY2F1c2UgYHBhcnRpYWxgIGlzIGEgdmlldyB3aGVyZSBKYWRlIGVzY2FwZWQgYW55dGhpbmcgdGhhdCBuZWVkZWQgZXNjYXBpbmcsIGJ1dCB3ZSB3b3VsZG4ndCB3YW50IEhUTUwgdGFncyB0byBiZSBlc2NhcGVkIVxcblxcbiAgICBgYGBqYWRlXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1haW4hPXBhcnRpYWxcXG4gICAgYGBgXFxuXFxuICAgIEJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IGA8aHRtbD5gLCBgPGhlYWQ+YCwgYW5kIGA8Ym9keT5gIGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIF9Ib3cgY29vbCBpcyB0aGF0P19cXG5cXG4gICAgVGhhdCdzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJ3Mgbm90aGluZyBzdG9wcGluZyB5b3UgZnJvbSBhZGRpbmcgZGF0YWJhc2UgY2FsbHMgdG8gZmV0Y2ggYml0cyBhbmQgcGllY2VzIG9mIHRoZSBtb2RlbCBiZWZvcmUgaW52b2tpbmcgYG5leHRgIHRvIHJlbmRlciB0aGUgdmlldy5cXG5cXG4gICAgVGhlcmUncyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCdzIHNldCBpdCB1cCBhbmQgc2VlIGhvdyBpdCBvcGVucyB1cCBvdXIgcG9zc2liaWxpdGllcy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBUYXVudXMgaW4gdGhlIGNsaWVudFxcblxcbiAgICBZb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIFtjaGVjayBvdXQgdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0gdG8gZ2V0IGEgbW9yZSB0aG9yb3VnaCB1bmRlcnN0YW5kaW5nIG9mIHRoZSBwdWJsaWMgaW50ZXJmYWNlIG9uIFRhdW51cywgYW5kIHdoYXQgaXQgZW5hYmxlcyB5b3UgdG8gZG8uXFxuXFxuICAgIFRoZSB3YXkgVGF1bnVzIHdvcmtzIG9uIHRoZSBjbGllbnQtc2lkZSBpcyBzbyB0aGF0IG9uY2UgeW91IHNldCBpdCB1cCwgaXQgd2lsbCBoaWphY2sgbGluayBjbGlja3MgYW5kIHVzZSBBSkFYIHRvIGZldGNoIG1vZGVscyBhbmQgcmVuZGVyIHRob3NlIHZpZXdzIGluIHRoZSBjbGllbnQuIElmIHRoZSBKYXZhU2NyaXB0IGNvZGUgZmFpbHMgdG8gbG9hZCwgX29yIGlmIGl0IGhhc24ndCBsb2FkZWQgeWV0IGR1ZSB0byBhIHNsb3cgY29ubmVjdGlvbiBzdWNoIGFzIHRob3NlIGluIHVuc3RhYmxlIG1vYmlsZSBuZXR3b3Jrc18sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS5cXG5cXG4gICAgU2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSdsbCBoYXZlIHRvIGNvbXBpbGUgdGhlIGFwcGxpY2F0aW9uJ3Mgd2lyaW5nIF8odGhlIHJvdXRlcyBhbmQgSmF2YVNjcmlwdCB2aWV3IGZ1bmN0aW9ucylfIGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UnbGwgaGF2ZSB0byBtb3VudCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlLCBwYXNzaW5nIHRoZSB3aXJpbmcgc28gdGhhdCBpdCBrbm93cyB3aGljaCByb3V0ZXMgaXQgc2hvdWxkIHJlc3BvbmQgdG8sIGFuZCB3aGljaCBvdGhlcnMgaXQgc2hvdWxkIG1lcmVseSBpZ25vcmUuIE9uY2UgdGhhdCdzIG91dCBvZiB0aGUgd2F5LCBjbGllbnQtc2lkZSByb3V0aW5nIHdvdWxkIGJlIHNldCB1cC5cXG5cXG4gICAgQXMgc3VnYXIgY29hdGluZyBvbiB0b3Agb2YgdGhhdCwgeW91IG1heSBhZGQgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB1c2luZyBjb250cm9sbGVycy4gVGhlc2UgY29udHJvbGxlcnMgd291bGQgYmUgZXhlY3V0ZWQgZXZlbiBpZiB0aGUgdmlldyB3YXMgcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLiBUaGV5IGNhbiBhY2Nlc3MgdGhlIFRhdW51cyBBUEkgZGlyZWN0bHksIGluIGNhc2UgeW91IG5lZWQgdG8gbmF2aWdhdGUgdG8gYW5vdGhlciB2aWV3IGluIHNvbWUgd2F5IG90aGVyIHRoYW4gYnkgaGF2aW5nIGh1bWFucyBjbGljayBvbiBhbmNob3IgdGFncy4gVGhlIEFQSSwgYXMgeW91J2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgVGF1bnVzIENMSVxcblxcbiAgICBUYXVudXMgY29tZXMgd2l0aCBhIENMSSB0aGF0IGNhbiBiZSB1c2VkIHRvIHdpcmUgeW91ciBOb2RlLmpzIHJvdXRlcyBhbmQgdmlld3MgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZSBzYW1lIENMSSBjYW4gYmUgdXNlZCB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcyB3ZWxsLiBUaGUgbWFpbiByZWFzb24gd2h5IHRoZSBUYXVudXMgQ0xJIGV4aXN0cyBpcyBzbyB0aGF0IHlvdSBkb24ndCBoYXZlIHRvIGByZXF1aXJlYCBldmVyeSBzaW5nbGUgdmlldyBhbmQgY29udHJvbGxlciwgdW5kb2luZyBhIGxvdCBvZiB0aGUgd29yayB0aGF0IHdhcyBwdXQgaW50byBjb2RlIHJldXNlLiBKdXN0IGxpa2Ugd2UgZGlkIHdpdGggYGphZHVtYCBlYXJsaWVyLCB3ZSdsbCBpbnN0YWxsIHRoZSBgdGF1bnVzYCBDTEkgZ2xvYmFsbHkgZm9yIHRoZSBzYWtlIG9mIGV4ZXJjaXNpbmcsIGJ1dCB3ZSB1bmRlcnN0YW5kIHRoYXQgcmVseWluZyBvbiBnbG9iYWxseSBpbnN0YWxsZWQgbW9kdWxlcyBpcyBpbnN1ZmZpY2llbnQgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgYXBwbGljYXRpb25zLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCB0YXVudXMgLWdcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBDTEkgaXMgdGVyc2UgaW4gYm90aCBpdHMgaW5wdXRzIGFuZCBpdHMgb3V0cHV0cy4gSWYgeW91IHJ1biBpdCB3aXRob3V0IGFueSBhcmd1bWVudHMgaXQnbGwgcHJpbnQgb3V0IHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgaWYgeW91IHdhbnQgdG8gcGVyc2lzdCBpdCB5b3Ugc2hvdWxkIHByb3ZpZGUgdGhlIGAtLW91dHB1dGAgZmxhZy4gSW4gdHlwaWNhbCBbY29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb25dWzhdIGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIGAuYmluL3ZpZXdzYCBhbmQgdGhhdCB5b3Ugd2FudCB0aGUgd2lyaW5nIG1vZHVsZSB0byBiZSBwbGFjZWQgaW4gYC5iaW4vd2lyaW5nLmpzYCwgYnV0IHlvdSdsbCBiZSBhYmxlIHRvIGNoYW5nZSB0aGF0IGlmIGl0IGRvZXNuJ3QgbWVldCB5b3VyIG5lZWRzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXRcXG4gICAgYGBgXFxuXFxuICAgIEF0IHRoaXMgcG9pbnQgaW4gb3VyIGV4YW1wbGUsIHRoZSBDTEkgc2hvdWxkIGNyZWF0ZSBhIGAuYmluL3dpcmluZy5qc2AgZmlsZSB3aXRoIHRoZSBjb250ZW50cyBkZXRhaWxlZCBiZWxvdy4gQXMgeW91IGNhbiBzZWUsIGV2ZW4gaWYgYHRhdW51c2AgaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCdzIG91dHB1dCBpcyBhcyBodW1hbiByZWFkYWJsZSBhcyBhbnkgb3RoZXIgbW9kdWxlLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0ZW1wbGF0ZXMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuL3ZpZXdzL2hvbWUvaW5kZXguanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgY29udHJvbGxlcnMgPSB7XFxuICAgIH07XFxuXFxuICAgIHZhciByb3V0ZXMgPSB7XFxuICAgICAgJy8nOiB7XFxuICAgICAgICBhY3Rpb246ICdob21lL2luZGV4J1xcbiAgICAgIH1cXG4gICAgfTtcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XFxuICAgICAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICAgICAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgICAgIHJvdXRlczogcm91dGVzXFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBOb3RlIHRoYXQgdGhlIGBjb250cm9sbGVyc2Agb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJ3QgY3JlYXRlZCBhbnkgX2NsaWVudC1zaWRlIGNvbnRyb2xsZXJzXyB5ZXQuIFdlIGNyZWF0ZWQgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgYnV0IHRob3NlIGRvbid0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC5cXG5cXG4gICAgVGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCwgeW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoaXMgZmlsZSB3aGVuZXZlciB5b3UgYWRkLCBjaGFuZ2UsIG9yIHJlbW92ZSBhIHZpZXcsIGEgY2xpZW50LXNpZGUgY29udHJvbGxlciwgb3IgYSByb3V0ZS4gRG9pbmcgdGhhdCB3b3VsZCBiZSBjdW1iZXJzb21lLCBhbmQgdGhlIENMSSBzb2x2ZXMgdGhhdCBwcm9ibGVtIGZvciB1cyBhdCB0aGUgZXhwZW5zZSBvZiBvbmUgYWRkaXRpb25hbCBidWlsZCBzdGVwLlxcblxcbiAgICBEdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIGAtLXdhdGNoYCBmbGFnLCB3aGljaCB3aWxsIHJlYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgaWYgYSByZWxldmFudCBmaWxlIGNoYW5nZXMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dCAtLXdhdGNoXFxuICAgIGBgYFxcblxcbiAgICBJZiB5b3UncmUgdXNpbmcgSGFwaSBpbnN0ZWFkIG9mIEV4cHJlc3MsIHlvdSdsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgYGhhcGlpZnlgIHRyYW5zZm9ybSBzbyB0aGF0IHJvdXRlcyBnZXQgY29udmVydGVkIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSByb3V0aW5nIG1vZHVsZSB1bmRlcnN0YW5kLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXQgLS10cmFuc2Zvcm0gaGFwaWlmeVxcbiAgICBgYGBcXG5cXG4gICAgTm93IHRoYXQgeW91IHVuZGVyc3RhbmQgaG93IHRvIHVzZSB0aGUgQ0xJIG9yIGJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIG9uIHlvdXIgb3duLCBib290aW5nIHVwIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgd2lsbCBiZSBhbiBlYXN5IHRoaW5nIHRvIGRvIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIEJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlclxcblxcbiAgICBPbmNlIHdlIGhhdmUgdGhlIHdpcmluZyBtb2R1bGUsIGJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGVuZ2luZSBpcyBwcmV0dHkgZWFzeS4gVGF1bnVzIHN1Z2dlc3RzIHlvdSB1c2UgYGNsaWVudC9qc2AgdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0J3Mgc3RpY2sgdG8gdGhlIGNvbnZlbnRpb25zLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBjbGllbnQvanMvbWFpbi5qc1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGBtYWluYCBtb2R1bGUgd2lsbCBiZSB1c2VkIGFzIHRoZSBfZW50cnkgcG9pbnRfIG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSdsbCBuZWVkIHRvIGltcG9ydCBgdGF1bnVzYCwgdGhlIHdpcmluZyBtb2R1bGUgd2UndmUganVzdCBidWlsdCwgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBET00gZWxlbWVudCB3aGVyZSB5b3UgYXJlIHJlbmRlcmluZyB5b3VyIHBhcnRpYWwgdmlld3MuIE9uY2UgeW91IGhhdmUgYWxsIHRoYXQsIHlvdSBjYW4gaW52b2tlIGB0YXVudXMubW91bnRgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHdpcmluZyA9IHJlcXVpcmUoJy4uLy4uLy5iaW4vd2lyaW5nJyk7XFxuICAgIHZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ21haW4nKVswXTtcXG5cXG4gICAgdGF1bnVzLm1vdW50KG1haW4sIHdpcmluZyk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLlxcblxcbiAgICBCeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbid0IGJlIGZ1bmN0aW9uYWwgdW50aWwgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgcnVucy5cXG5cXG4gICAgQW4gYWx0ZXJuYXRpdmUgaXMgdG8gaW5saW5lIHRoZSB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmlld3MgaW4gYSBgPHNjcmlwdCB0eXBlPSd0ZXh0L3RhdW51cyc+YCB0YWcsIGJ1dCB0aGlzIHRlbmRzIHRvIHNsb3cgZG93biB0aGUgaW5pdGlhbCByZXNwb25zZSAobW9kZWxzIGFyZSBfdHlwaWNhbGx5IGxhcmdlcl8gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS5cXG5cXG4gICAgQSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCdzIGhhcmRlciB0byBzZXQgdXAuXFxuXFxuICAgIFRoZSB0aHJlZSBib290aW5nIHN0cmF0ZWdpZXMgYXJlIGV4cGxhaW5lZCBpbiBbdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0gYW5kIGZ1cnRoZXIgZGlzY3Vzc2VkIGluIFt0aGUgb3B0aW1pemF0aW9uIGd1aWRlXVsyNV0uIEZvciBub3csIHRoZSBkZWZhdWx0IHN0cmF0ZWd5IF8oYCdhdXRvJ2ApXyBzaG91bGQgc3VmZmljZS4gSXQgZmV0Y2hlcyB0aGUgdmlldyBtb2RlbCB1c2luZyBhbiBBSkFYIHJlcXVlc3QgcmlnaHQgYWZ0ZXIgVGF1bnVzIGxvYWRzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIEFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlclxcblxcbiAgICBDbGllbnQtc2lkZSBjb250cm9sbGVycyBydW4gd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLCBldmVuIGlmIGl0J3MgYSBwYXJ0aWFsLiBUaGUgY29udHJvbGxlciBpcyBwYXNzZWQgdGhlIGBtb2RlbGAsIGNvbnRhaW5pbmcgdGhlIG1vZGVsIHRoYXQgd2FzIHVzZWQgdG8gcmVuZGVyIHRoZSB2aWV3OyB0aGUgYHJvdXRlYCwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSBgY29udGFpbmVyYCwgd2hpY2ggaXMgd2hhdGV2ZXIgRE9NIGVsZW1lbnQgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIGludG8uXFxuXFxuICAgIFRoZXNlIGNvbnRyb2xsZXJzIGFyZSBlbnRpcmVseSBvcHRpb25hbCwgd2hpY2ggbWFrZXMgc2Vuc2Ugc2luY2Ugd2UncmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCdzIGFkZCBzb21lIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gdGhlIGV4YW1wbGUgd2UndmUgYmVlbiBidWlsZGluZy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG4gICAgYGBgXFxuXFxuICAgIEd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJ2xsIGp1c3QgcHJpbnQgdGhlIGFjdGlvbiBhbmQgdGhlIG1vZGVsIHRvIHRoZSBjb25zb2xlLiBJZiB0aGVyZSdzIG9uZSBwbGFjZSB3aGVyZSB5b3UnZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsLCByb3V0ZSwgY29udGFpbmVyKSB7XFxuICAgICAgY29uc29sZS5sb2coJ1JlbmRlcmVkIHZpZXcgJXMgdXNpbmcgbW9kZWwgJXMnLCByb3V0ZS5hY3Rpb24sIG1vZGVsKTtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUElcXG5cXG4gICAgVGF1bnVzIGRvZXMgcHJvdmlkZSBbYSB0aGluIEFQSV1bMThdIGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSdzIGEgZmV3IG1ldGhvZHMgeW91IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBvbiBhIGdsb2JhbCBzY2FsZSBhcyB3ZWxsLlxcblxcbiAgICBUYXVudXMgY2FuIG5vdGlmeSB5b3Ugd2hlbmV2ZXIgaW1wb3J0YW50IGV2ZW50cyBvY2N1ci5cXG5cXG4gICAgRXZlbnQgICAgICAgICAgICB8IEFyZ3VtZW50cyAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYCdzdGFydCdgICAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgRW1pdHRlZCB3aGVuIGB0YXVudXMubW91bnRgIGZpbmlzaGVkIHRoZSByb3V0ZSBzZXR1cCBhbmQgaXMgYWJvdXQgdG8gaW52b2tlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyLiBTdWJzY3JpYmUgdG8gdGhpcyBldmVudCBiZWZvcmUgY2FsbGluZyBgdGF1bnVzLm1vdW50YC5cXG4gICAgYCdyZW5kZXInYCAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgQSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWRcXG4gICAgYCdmZXRjaC5zdGFydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuXFxuICAgIGAnZmV0Y2guZG9uZSdgICAgfCAgYHJvdXRlLCBjb250ZXh0LCBkYXRhYCB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuXFxuICAgIGAnZmV0Y2guYWJvcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuXFxuICAgIGAnZmV0Y2guZXJyb3InYCAgfCAgYHJvdXRlLCBjb250ZXh0LCBlcnJgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLlxcblxcbiAgICBCZXNpZGVzIGV2ZW50cywgdGhlcmUncyBhIGNvdXBsZSBtb3JlIG1ldGhvZHMgeW91IGNhbiB1c2UuIFRoZSBgdGF1bnVzLm5hdmlnYXRlYCBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJ3MgYHRhdW51cy5wYXJ0aWFsYCwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCdsbCB0aGVuIGludm9rZSBpdHMgY29udHJvbGxlci4gWW91J2xsIG5lZWQgdG8gY29tZSB1cCB3aXRoIHRoZSBtb2RlbCB5b3Vyc2VsZiwgdGhvdWdoLlxcblxcbiAgICBBc3RvbmlzaGluZ2x5LCB0aGUgQVBJIGlzIGZ1cnRoZXIgZG9jdW1lbnRlZCBpbiBbdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmdcXG5cXG4gICAgW1BlcmZvcm1hbmNlXVsyNV0gcGxheXMgYW4gaW1wb3J0YW50IHJvbGUgaW4gVGF1bnVzLiBUaGF0J3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/XFxuXFxuICAgIFdoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIGB7IGNhY2hlOiB0cnVlIH1gIGFzIHRoZSB0aGlyZCBwYXJhbWV0ZXIgZm9yIGB0YXVudXMubW91bnRgLCB0aGUgY2FjaGluZyBsYXllciB3aWxsIG1ha2Ugc3VyZSB0aGF0IHJlc3BvbnNlcyBhcmUga2VwdCBhcm91bmQgZm9yIGAxNWAgc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0J2xsIGZpcnN0IGFzayB0aGUgY2FjaGluZyBsYXllciBmb3IgYSBmcmVzaCBjb3B5LiBJZiB0aGUgY2FjaGluZyBsYXllciBkb2Vzbid0IGhhdmUgYSBjb3B5LCBvciBpZiB0aGF0IGNvcHkgaXMgc3RhbGUgXyhpbiB0aGlzIGNhc2UsIG9sZGVyIHRoYW4gYDE1YCBzZWNvbmRzKV8sIHRoZW4gYW4gQUpBWCByZXF1ZXN0IHdpbGwgYmUgaXNzdWVkIHRvIHRoZSBzZXJ2ZXIuIE9mIGNvdXJzZSwgdGhlIGR1cmF0aW9uIGlzIGNvbmZpZ3VyYWJsZS4gSWYgeW91IHdhbnQgdG8gdXNlIGEgdmFsdWUgb3RoZXIgdGhhbiB0aGUgZGVmYXVsdCwgeW91IHNob3VsZCBzZXQgYGNhY2hlYCB0byBhIG51bWJlciBpbiBzZWNvbmRzIGluc3RlYWQgb2YganVzdCBgdHJ1ZWAuXFxuXFxuICAgIFNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UncmUgYWxzbyBhYmxlIHRvIHNldCBhIGBjYWNoZWAgZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgYGNhY2hlYCBwcm9wZXJ0eSBpbiByb3V0ZXMgaGFzIHByZWNlZGVuY2Ugb3ZlciB0aGUgZGVmYXVsdCB2YWx1ZS5cXG5cXG4gICAgVGhlcmUncyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiBbSW5kZXhlZERCXVsyOF0gc3RvcmUuIEluZGV4ZWREQiBpcyBhbiBlbWJlZGRlZCBkYXRhYmFzZSBzb2x1dGlvbiwgYW5kIHlvdSBjYW4gdGhpbmsgb2YgaXQgbGlrZSBhbiBhc3luY2hyb25vdXMgdmVyc2lvbiBvZiBgbG9jYWxTdG9yYWdlYC4gSXQgaGFzIFtzdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0XVsyOV0sIGFuZCBpbiB0aGUgY2FzZXMgd2hlcmUgaXQncyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuXFxuXFxuICAgIFRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSBfKHRoZSBgdG91Y2hzdGFydGAgZXZlbnQpXywgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuXFxuXFxuICAgIElmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgXyhwb3NzaWJseSBsaW1pdGVkKV8gSW50ZXJuZXQgY29ubmVjdGlvbiBiYW5kd2lkdGguXFxuXFxuICAgIElmIHRoZSBodW1hbiBjbGlja3Mgb24gdGhlIGxpbmsgYmVmb3JlIHByZWZldGNoaW5nIGlzIGNvbXBsZXRlZCwgaGUnbGwgbmF2aWdhdGUgdG8gdGhlIHZpZXcgYXMgc29vbiBhcyBwcmVmZXRjaGluZyBlbmRzLCByYXRoZXIgdGhhbiBmaXJpbmcgYW5vdGhlciByZXF1ZXN0LiBUaGlzIGhlbHBzIFRhdW51cyBzYXZlIHByZWNpb3VzIG1pbGxpc2Vjb25kcyB3aGVuIGRlYWxpbmcgd2l0aCBsYXRlbmN5LXNlbnNpdGl2ZSBvcGVyYXRpb25zLlxcblxcbiAgICBUdXJuaW5nIHByZWZldGNoaW5nIG9uIGlzIHNpbXBseSBhIG1hdHRlciBvZiBzZXR0aW5nIGBwcmVmZXRjaGAgdG8gYHRydWVgIGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YC4gRm9yIGFkZGl0aW9uYWwgaW5zaWdodHMgaW50byB0aGUgcGVyZm9ybWFuY2UgaW1wcm92ZW1lbnRzIFRhdW51cyBjYW4gb2ZmZXIsIGhlYWQgb3ZlciB0byB0aGUgW1BlcmZvcm1hbmNlIE9wdGltaXphdGlvbnNdWzI1XSBndWlkZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBUaGUgc2t5IGlzIHRoZSBsaW1pdCFcXG5cXG4gICAgWW91J3JlIG5vdyBmYW1pbGlhciB3aXRoIGhvdyBUYXVudXMgd29ya3Mgb24gYSBoaWdoLWxldmVsLiBZb3UgaGF2ZSBjb3ZlcmVkIGEgZGVjZW50IGFtb3VudCBvZiBncm91bmQsIGJ1dCB5b3Ugc2hvdWxkbid0IHN0b3AgdGhlcmUuXFxuXFxuICAgIC0gTGVhcm4gbW9yZSBhYm91dCBbdGhlIEFQSSBUYXVudXMgaGFzXVsxOF0gdG8gb2ZmZXJcXG4gICAgLSBHbyB0aHJvdWdoIHRoZSBbcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHRpcHNdWzI1XS4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3IVxcbiAgICAtIF9GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50X1xcbiAgICAgIC0gSmVyZW15IEtlaXRoIGVudW5jaWF0ZXMgW1xcXCJCZSBwcm9ncmVzc2l2ZVxcXCJdWzIwXVxcbiAgICAgIC0gQ2hyaXN0aWFuIEhlaWxtYW5uIGFkdm9jYXRlcyBmb3IgW1xcXCJQcmFnbWF0aWMgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnRcXFwiXVsyNl1cXG4gICAgICAtIEpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyBbXFxcIlByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGlzIGZhc3RlclxcXCJdWzIyXVxcbiAgICAgIC0gSSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgW1xcXCJTdG9wIEJyZWFraW5nIHRoZSBXZWJcXFwiXVsxN11cXG4gICAgICAtIEd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIFtcXFwiNyBQcmluY2lwbGVzIG9mIFJpY2ggV2ViIEFwcGxpY2F0aW9uc1xcXCJdWzI0XVxcbiAgICAgIC0gQWFyb24gR3VzdGFmc29uIHdyaXRlcyBbXFxcIlVuZGVyc3RhbmRpbmcgUHJvZ3Jlc3NpdmUgRW5oYW5jZW1lbnRcXFwiXVsyMV1cXG4gICAgICAtIE9yZGUgU2F1bmRlcnMgZ2l2ZXMgaGlzIHBvaW50IG9mIHZpZXcgaW4gW1xcXCJQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBmb3IgZmF1bHQgdG9sZXJhbmNlXFxcIl1bMjNdXFxuICAgIC0gU2lmdCB0aHJvdWdoIHRoZSBbY29tcGxlbWVudGFyeSBtb2R1bGVzXVsxNV0uIFlvdSBtYXkgZmluZCBzb21ldGhpbmcgeW91IGhhZG4ndCB0aG91Z2h0IG9mIVxcblxcbiAgICBBbHNvLCBnZXQgaW52b2x2ZWQhXFxuXFxuICAgIC0gRm9yayB0aGlzIHJlcG9zaXRvcnkgYW5kIFtzZW5kIHNvbWUgcHVsbCByZXF1ZXN0c11bMTldIHRvIGltcHJvdmUgdGhlc2UgZ3VpZGVzIVxcbiAgICAtIFNlZSBzb21ldGhpbmcsIHNheSBzb21ldGhpbmchIElmIHlvdSBkZXRlY3QgYSBidWcsIFtwbGVhc2UgY3JlYXRlIGFuIGlzc3VlXVsyN10hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgIFsxXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcbiAgICBbMl06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXG4gICAgWzNdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2hhcGlpZnlcXG4gICAgWzRdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pb1xcbiAgICBbNV06IGh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb29cXG4gICAgWzZdOiBodHRwOi8vZXhwcmVzc2pzLmNvbVxcbiAgICBbN106IGh0dHA6Ly9oYXBpanMuY29tXFxuICAgIFs4XTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcbiAgICBbOV06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvUnVieV9vbl9SYWlsc1xcbiAgICBbMTBdOiBodHRwczovL2dpdGh1Yi5jb20vamFubC9tdXN0YWNoZS5qc1xcbiAgICBbMTFdOiBodHRwczovL2dpdGh1Yi5jb20vamFkZWpzL2phZGVcXG4gICAgWzEyXTogaHR0cDovL21vemlsbGEuZ2l0aHViLmlvL251bmp1Y2tzL1xcbiAgICBbMTNdOiBodHRwOi8vaGFuZGxlYmFyc2pzLmNvbS9cXG4gICAgWzE0XTogaHR0cDovL3d3dy5lbWJlZGRlZGpzLmNvbS9cXG4gICAgWzE1XTogL2NvbXBsZW1lbnRzXFxuICAgIFsxNl06IGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9qYWR1bVxcbiAgICBbMTddOiBodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxuICAgIFsxOF06IC9hcGlcXG4gICAgWzE5XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW8vcHVsbHNcXG4gICAgWzIwXTogaHR0cHM6Ly9hZGFjdGlvLmNvbS9qb3VybmFsLzc3MDZcXG4gICAgWzIxXTogaHR0cDovL2FsaXN0YXBhcnQuY29tL2FydGljbGUvdW5kZXJzdGFuZGluZ3Byb2dyZXNzaXZlZW5oYW5jZW1lbnRcXG4gICAgWzIyXTogaHR0cDovL2pha2VhcmNoaWJhbGQuY29tLzIwMTMvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtaXMtZmFzdGVyL1xcbiAgICBbMjNdOiBodHRwczovL2RlY2FkZWNpdHkubmV0L2Jsb2cvMjAxMy8wOS8xNi9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1mb3ItZmF1bHQtdG9sZXJhbmNlXFxuICAgIFsyNF06IGh0dHA6Ly9yYXVjaGcuY29tLzIwMTQvNy1wcmluY2lwbGVzLW9mLXJpY2gtd2ViLWFwcGxpY2F0aW9ucy9cXG4gICAgWzI1XTogL3BlcmZvcm1hbmNlXFxuICAgIFsyNl06IGh0dHA6Ly9pY2FudC5jby51ay9hcnRpY2xlcy9wcmFnbWF0aWMtcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQvXFxuICAgIFsyN106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzL2lzc3Vlcy9uZXdcXG4gICAgWzI4XTogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXG4gICAgWzI5XTogaHR0cDovL2Nhbml1c2UuY29tLyNmZWF0PWluZGV4ZWRkYlxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBub3RGb3VuZChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDE+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiTm90IEZvdW5kXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gxPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHA+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiVGhlcmUgZG9lc24ndCBzZWVtIHRvIGJlIGFueXRoaW5nIGhlcmUgeWV0LiBJZiB5b3UgYmVsaWV2ZSB0aGlzIHRvIGJlIGEgbWlzdGFrZSwgcGxlYXNlIGxldCB1cyBrbm93IVwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9wPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHA+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCJodHRwczovL3R3aXR0ZXIuY29tL256Z2JcXFwiIHRhcmdldD1cXFwiX2JsYW5rXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCImbWRhc2g7IEBuemdiXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3A+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwiaDEgTm90IEZvdW5kXFxuXFxucCBUaGVyZSBkb2Vzbid0IHNlZW0gdG8gYmUgYW55dGhpbmcgaGVyZSB5ZXQuIElmIHlvdSBiZWxpZXZlIHRoaXMgdG8gYmUgYSBtaXN0YWtlLCBwbGVhc2UgbGV0IHVzIGtub3chXFxucFxcbiAgYShocmVmPSdodHRwczovL3R3aXR0ZXIuY29tL256Z2InLCB0YXJnZXQ9J19ibGFuaycpICZtZGFzaDsgQG56Z2JcXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbGF5b3V0KGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkLCBtb2RlbCwgcGFydGlhbCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8IURPQ1RZUEUgaHRtbD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxodG1sIGxhbmc9XFxcImVuXFxcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XFxcImh0dHA6Ly9zY2hlbWEub3JnL0Jsb2dcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGhlYWQ+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8dGl0bGU+XCIgKyAoamFkZS5lc2NhcGUobnVsbCA9PSAoamFkZV9pbnRlcnAgPSBtb2RlbC50aXRsZSkgPyBcIlwiIDogamFkZV9pbnRlcnApKSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvdGl0bGU+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBjaGFyc2V0PVxcXCJ1dGYtOFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInNob3J0Y3V0IGljb25cXFwiIGhyZWY9XFxcIi9mYXZpY29uLmljb1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA3LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBodHRwLWVxdWl2PVxcXCJYLVVBLUNvbXBhdGlibGVcXFwiIGNvbnRlbnQ9XFxcIklFPWVkZ2UsY2hyb21lPTFcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgbmFtZT1cXFwidmlld3BvcnRcXFwiIGNvbnRlbnQ9XFxcIndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic3R5bGVzaGVldFxcXCIgdHlwZT1cXFwidGV4dC9jc3NcXFwiIGhyZWY9XFxcIi9jc3MvYWxsLmNzc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzdHlsZXNoZWV0XFxcIiB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCIgaHJlZj1cXFwiaHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9VW5pY2ErT25lOjQwMHxQbGF5ZmFpcitEaXNwbGF5OjcwMHxNZWdyaW06NzAwfEZhdW5hK09uZTo0MDBpdGFsaWMsNDAwLDcwMFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2hlYWQ+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGJvZHkgaWQ9XFxcInRvcFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGhlYWRlcj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDE+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL1xcXCIgYXJpYS1sYWJlbD1cXFwiR28gdG8gaG9tZVxcXCIgY2xhc3M9XFxcImx5LXRpdGxlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE1LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiVGF1bnVzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gxPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMiBjbGFzcz1cXFwibHktc3ViaGVhZGluZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIk1pY3JvIElzb21vcnBoaWMgTVZDIEVuZ2luZSBmb3IgTm9kZS5qc1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaGVhZGVyPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhc2lkZT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bmF2IGNsYXNzPVxcXCJudi1jb250YWluZXJcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx1bCBjbGFzcz1cXFwibnYtaXRlbXNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFib3V0XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkdldHRpbmcgU3RhcnRlZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9hcGlcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJBUEkgRG9jdW1lbnRhdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI3LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkNvbXBsZW1lbnRhcnkgTW9kdWxlc1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlBlcmZvcm1hbmNlIE9wdGltaXphdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9zb3VyY2UtY29kZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlNvdXJjZSBDb2RlXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC91bD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbmF2PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hc2lkZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWFpbiBpZD1cXFwiYXBwbGljYXRpb24tcm9vdFxcXCIgZGF0YS10YXVudXM9XFxcIm1vZGVsXFxcIj5cIiArIChudWxsID09IChqYWRlX2ludGVycCA9IHBhcnRpYWwpID8gXCJcIiA6IGphZGVfaW50ZXJwKSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbWFpbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2NyaXB0IHNyYz1cXFwiL2pzL2FsbC5qc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NjcmlwdD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYm9keT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaHRtbD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkLFwibW9kZWxcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLm1vZGVsOnR5cGVvZiBtb2RlbCE9PVwidW5kZWZpbmVkXCI/bW9kZWw6dW5kZWZpbmVkLFwicGFydGlhbFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgucGFydGlhbDp0eXBlb2YgcGFydGlhbCE9PVwidW5kZWZpbmVkXCI/cGFydGlhbDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcImRvY3R5cGUgaHRtbFxcbmh0bWwobGFuZz0nZW4nLCBpdGVtc2NvcGUsIGl0ZW10eXBlPSdodHRwOi8vc2NoZW1hLm9yZy9CbG9nJylcXG4gIGhlYWRcXG4gICAgdGl0bGU9bW9kZWwudGl0bGVcXG4gICAgbWV0YShjaGFyc2V0PSd1dGYtOCcpXFxuICAgIGxpbmsocmVsPSdzaG9ydGN1dCBpY29uJywgaHJlZj0nL2Zhdmljb24uaWNvJylcXG4gICAgbWV0YShodHRwLWVxdWl2PSdYLVVBLUNvbXBhdGlibGUnLCBjb250ZW50PSdJRT1lZGdlLGNocm9tZT0xJylcXG4gICAgbWV0YShuYW1lPSd2aWV3cG9ydCcsIGNvbnRlbnQ9J3dpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xJylcXG4gICAgbGluayhyZWw9J3N0eWxlc2hlZXQnLCB0eXBlPSd0ZXh0L2NzcycsIGhyZWY9Jy9jc3MvYWxsLmNzcycpXFxuICAgIGxpbmsocmVsPSdzdHlsZXNoZWV0JywgdHlwZT0ndGV4dC9jc3MnLCBocmVmPSdodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT1VbmljYStPbmU6NDAwfFBsYXlmYWlyK0Rpc3BsYXk6NzAwfE1lZ3JpbTo3MDB8RmF1bmErT25lOjQwMGl0YWxpYyw0MDAsNzAwJylcXG5cXG4gIGJvZHkjdG9wXFxuICAgIGhlYWRlclxcbiAgICAgIGgxXFxuICAgICAgICBhLmx5LXRpdGxlKGhyZWY9Jy8nLCBhcmlhLWxhYmVsPSdHbyB0byBob21lJykgVGF1bnVzXFxuICAgICAgaDIubHktc3ViaGVhZGluZyBNaWNybyBJc29tb3JwaGljIE1WQyBFbmdpbmUgZm9yIE5vZGUuanNcXG5cXG4gICAgYXNpZGVcXG4gICAgICBuYXYubnYtY29udGFpbmVyXFxuICAgICAgICB1bC5udi1pdGVtc1xcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvJykgQWJvdXRcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2dldHRpbmctc3RhcnRlZCcpIEdldHRpbmcgU3RhcnRlZFxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvYXBpJykgQVBJIERvY3VtZW50YXRpb25cXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2NvbXBsZW1lbnRzJykgQ29tcGxlbWVudGFyeSBNb2R1bGVzXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9wZXJmb3JtYW5jZScpIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvc291cmNlLWNvZGUnKSBTb3VyY2UgQ29kZVxcblxcbiAgICBtYWluI2FwcGxpY2F0aW9uLXJvb3QoZGF0YS10YXVudXM9J21vZGVsJykhPXBhcnRpYWxcXG4gICAgc2NyaXB0KHNyYz0nL2pzL2FsbC5qcycpXFxuXCIpO1xufVxufSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRlbXBsYXRlcyA9IHtcbiAgJ2RvY3VtZW50YXRpb24vYWJvdXQnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qcycpLFxuICAnZXJyb3Ivbm90LWZvdW5kJzogcmVxdWlyZSgnLi92aWV3cy9lcnJvci9ub3QtZm91bmQuanMnKSxcbiAgJ2xheW91dCc6IHJlcXVpcmUoJy4vdmlld3MvbGF5b3V0LmpzJylcbn07XG5cbnZhciBjb250cm9sbGVycyA9IHtcbn07XG5cbnZhciByb3V0ZXMgPSB7XG4gICcvJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vYWJvdXQnXG4gIH0sXG4gICcvZ2V0dGluZy1zdGFydGVkJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkJ1xuICB9LFxuICAnL2FwaSc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2FwaSdcbiAgfSxcbiAgJy9jb21wbGVtZW50cyc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzJ1xuICB9LFxuICAnL3BlcmZvcm1hbmNlJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UnXG4gIH0sXG4gICcvc291cmNlLWNvZGUnOiB7XG4gICAgaWdub3JlOiB0cnVlXG4gIH0sXG4gICcvKic6IHtcbiAgICBhY3Rpb246ICdlcnJvci9ub3QtZm91bmQnXG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcbiAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxuICByb3V0ZXM6IHJvdXRlc1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLy8gaW1wb3J0IHRoZSB0YXVudXMgbW9kdWxlXG52YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XG5cbi8vIGltcG9ydCB0aGUgd2lyaW5nIG1vZHVsZSBleHBvcnRlZCBieSBUYXVudXNcbnZhciB3aXJpbmcgPSByZXF1aXJlKCcuLi8uLi8uYmluL3dpcmluZycpO1xuXG4vLyBnZXQgdGhlIDxtYWluPiBlbGVtZW50XG52YXIgbWFpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHBsaWNhdGlvbi1yb290Jyk7XG5cbi8vIG1vdW50IHRhdW51cyBzbyBpdCBzdGFydHMgaXRzIHJvdXRpbmcgZW5naW5lXG50YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbiFmdW5jdGlvbihlKXtpZihcIm9iamVjdFwiPT10eXBlb2YgZXhwb3J0cyltb2R1bGUuZXhwb3J0cz1lKCk7ZWxzZSBpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQpZGVmaW5lKGUpO2Vsc2V7dmFyIGY7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdz9mPXdpbmRvdzpcInVuZGVmaW5lZFwiIT10eXBlb2YgZ2xvYmFsP2Y9Z2xvYmFsOlwidW5kZWZpbmVkXCIhPXR5cGVvZiBzZWxmJiYoZj1zZWxmKSxmLmphZGU9ZSgpfX0oZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG4ndXNlIHN0cmljdCc7XHJcblxyXG4vKipcclxuICogTWVyZ2UgdHdvIGF0dHJpYnV0ZSBvYmplY3RzIGdpdmluZyBwcmVjZWRlbmNlXHJcbiAqIHRvIHZhbHVlcyBpbiBvYmplY3QgYGJgLiBDbGFzc2VzIGFyZSBzcGVjaWFsLWNhc2VkXHJcbiAqIGFsbG93aW5nIGZvciBhcnJheXMgYW5kIG1lcmdpbmcvam9pbmluZyBhcHByb3ByaWF0ZWx5XHJcbiAqIHJlc3VsdGluZyBpbiBhIHN0cmluZy5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IGFcclxuICogQHBhcmFtIHtPYmplY3R9IGJcclxuICogQHJldHVybiB7T2JqZWN0fSBhXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMubWVyZ2UgPSBmdW5jdGlvbiBtZXJnZShhLCBiKSB7XHJcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcclxuICAgIHZhciBhdHRycyA9IGFbMF07XHJcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGEubGVuZ3RoOyBpKyspIHtcclxuICAgICAgYXR0cnMgPSBtZXJnZShhdHRycywgYVtpXSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYXR0cnM7XHJcbiAgfVxyXG4gIHZhciBhYyA9IGFbJ2NsYXNzJ107XHJcbiAgdmFyIGJjID0gYlsnY2xhc3MnXTtcclxuXHJcbiAgaWYgKGFjIHx8IGJjKSB7XHJcbiAgICBhYyA9IGFjIHx8IFtdO1xyXG4gICAgYmMgPSBiYyB8fCBbXTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShhYykpIGFjID0gW2FjXTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShiYykpIGJjID0gW2JjXTtcclxuICAgIGFbJ2NsYXNzJ10gPSBhYy5jb25jYXQoYmMpLmZpbHRlcihudWxscyk7XHJcbiAgfVxyXG5cclxuICBmb3IgKHZhciBrZXkgaW4gYikge1xyXG4gICAgaWYgKGtleSAhPSAnY2xhc3MnKSB7XHJcbiAgICAgIGFba2V5XSA9IGJba2V5XTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBhO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEZpbHRlciBudWxsIGB2YWxgcy5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWxcclxuICogQHJldHVybiB7Qm9vbGVhbn1cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZnVuY3Rpb24gbnVsbHModmFsKSB7XHJcbiAgcmV0dXJuIHZhbCAhPSBudWxsICYmIHZhbCAhPT0gJyc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBqb2luIGFycmF5IGFzIGNsYXNzZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuam9pbkNsYXNzZXMgPSBqb2luQ2xhc3NlcztcclxuZnVuY3Rpb24gam9pbkNsYXNzZXModmFsKSB7XHJcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsKSA/IHZhbC5tYXAoam9pbkNsYXNzZXMpLmZpbHRlcihudWxscykuam9pbignICcpIDogdmFsO1xyXG59XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBjbGFzc2VzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5fSBjbGFzc2VzXHJcbiAqIEBwYXJhbSB7QXJyYXkuPEJvb2xlYW4+fSBlc2NhcGVkXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuY2xzID0gZnVuY3Rpb24gY2xzKGNsYXNzZXMsIGVzY2FwZWQpIHtcclxuICB2YXIgYnVmID0gW107XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbGFzc2VzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBpZiAoZXNjYXBlZCAmJiBlc2NhcGVkW2ldKSB7XHJcbiAgICAgIGJ1Zi5wdXNoKGV4cG9ydHMuZXNjYXBlKGpvaW5DbGFzc2VzKFtjbGFzc2VzW2ldXSkpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGJ1Zi5wdXNoKGpvaW5DbGFzc2VzKGNsYXNzZXNbaV0pKTtcclxuICAgIH1cclxuICB9XHJcbiAgdmFyIHRleHQgPSBqb2luQ2xhc3NlcyhidWYpO1xyXG4gIGlmICh0ZXh0Lmxlbmd0aCkge1xyXG4gICAgcmV0dXJuICcgY2xhc3M9XCInICsgdGV4dCArICdcIic7XHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiAnJztcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBhdHRyaWJ1dGUuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXlcclxuICogQHBhcmFtIHtTdHJpbmd9IHZhbFxyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGVzY2FwZWRcclxuICogQHBhcmFtIHtCb29sZWFufSB0ZXJzZVxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmF0dHIgPSBmdW5jdGlvbiBhdHRyKGtleSwgdmFsLCBlc2NhcGVkLCB0ZXJzZSkge1xyXG4gIGlmICgnYm9vbGVhbicgPT0gdHlwZW9mIHZhbCB8fCBudWxsID09IHZhbCkge1xyXG4gICAgaWYgKHZhbCkge1xyXG4gICAgICByZXR1cm4gJyAnICsgKHRlcnNlID8ga2V5IDoga2V5ICsgJz1cIicgKyBrZXkgKyAnXCInKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiAnJztcclxuICAgIH1cclxuICB9IGVsc2UgaWYgKDAgPT0ga2V5LmluZGV4T2YoJ2RhdGEnKSAmJiAnc3RyaW5nJyAhPSB0eXBlb2YgdmFsKSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgXCI9J1wiICsgSlNPTi5zdHJpbmdpZnkodmFsKS5yZXBsYWNlKC8nL2csICcmYXBvczsnKSArIFwiJ1wiO1xyXG4gIH0gZWxzZSBpZiAoZXNjYXBlZCkge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgZXhwb3J0cy5lc2NhcGUodmFsKSArICdcIic7XHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyAnPVwiJyArIHZhbCArICdcIic7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gYXR0cmlidXRlcyBvYmplY3QuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcclxuICogQHBhcmFtIHtPYmplY3R9IGVzY2FwZWRcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5hdHRycyA9IGZ1bmN0aW9uIGF0dHJzKG9iaiwgdGVyc2Upe1xyXG4gIHZhciBidWYgPSBbXTtcclxuXHJcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmopO1xyXG5cclxuICBpZiAoa2V5cy5sZW5ndGgpIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICB2YXIga2V5ID0ga2V5c1tpXVxyXG4gICAgICAgICwgdmFsID0gb2JqW2tleV07XHJcblxyXG4gICAgICBpZiAoJ2NsYXNzJyA9PSBrZXkpIHtcclxuICAgICAgICBpZiAodmFsID0gam9pbkNsYXNzZXModmFsKSkge1xyXG4gICAgICAgICAgYnVmLnB1c2goJyAnICsga2V5ICsgJz1cIicgKyB2YWwgKyAnXCInKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYnVmLnB1c2goZXhwb3J0cy5hdHRyKGtleSwgdmFsLCBmYWxzZSwgdGVyc2UpKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGJ1Zi5qb2luKCcnKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFc2NhcGUgdGhlIGdpdmVuIHN0cmluZyBvZiBgaHRtbGAuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBodG1sXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5lc2NhcGUgPSBmdW5jdGlvbiBlc2NhcGUoaHRtbCl7XHJcbiAgdmFyIHJlc3VsdCA9IFN0cmluZyhodG1sKVxyXG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcclxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcclxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jyk7XHJcbiAgaWYgKHJlc3VsdCA9PT0gJycgKyBodG1sKSByZXR1cm4gaHRtbDtcclxuICBlbHNlIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmUtdGhyb3cgdGhlIGdpdmVuIGBlcnJgIGluIGNvbnRleHQgdG8gdGhlXHJcbiAqIHRoZSBqYWRlIGluIGBmaWxlbmFtZWAgYXQgdGhlIGdpdmVuIGBsaW5lbm9gLlxyXG4gKlxyXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnJcclxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVuYW1lXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBsaW5lbm9cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5yZXRocm93ID0gZnVuY3Rpb24gcmV0aHJvdyhlcnIsIGZpbGVuYW1lLCBsaW5lbm8sIHN0cil7XHJcbiAgaWYgKCEoZXJyIGluc3RhbmNlb2YgRXJyb3IpKSB0aHJvdyBlcnI7XHJcbiAgaWYgKCh0eXBlb2Ygd2luZG93ICE9ICd1bmRlZmluZWQnIHx8ICFmaWxlbmFtZSkgJiYgIXN0cikge1xyXG4gICAgZXJyLm1lc3NhZ2UgKz0gJyBvbiBsaW5lICcgKyBsaW5lbm87XHJcbiAgICB0aHJvdyBlcnI7XHJcbiAgfVxyXG4gIHRyeSB7XHJcbiAgICBzdHIgPSBzdHIgfHwgX2RlcmVxXygnZnMnKS5yZWFkRmlsZVN5bmMoZmlsZW5hbWUsICd1dGY4JylcclxuICB9IGNhdGNoIChleCkge1xyXG4gICAgcmV0aHJvdyhlcnIsIG51bGwsIGxpbmVubylcclxuICB9XHJcbiAgdmFyIGNvbnRleHQgPSAzXHJcbiAgICAsIGxpbmVzID0gc3RyLnNwbGl0KCdcXG4nKVxyXG4gICAgLCBzdGFydCA9IE1hdGgubWF4KGxpbmVubyAtIGNvbnRleHQsIDApXHJcbiAgICAsIGVuZCA9IE1hdGgubWluKGxpbmVzLmxlbmd0aCwgbGluZW5vICsgY29udGV4dCk7XHJcblxyXG4gIC8vIEVycm9yIGNvbnRleHRcclxuICB2YXIgY29udGV4dCA9IGxpbmVzLnNsaWNlKHN0YXJ0LCBlbmQpLm1hcChmdW5jdGlvbihsaW5lLCBpKXtcclxuICAgIHZhciBjdXJyID0gaSArIHN0YXJ0ICsgMTtcclxuICAgIHJldHVybiAoY3VyciA9PSBsaW5lbm8gPyAnICA+ICcgOiAnICAgICcpXHJcbiAgICAgICsgY3VyclxyXG4gICAgICArICd8ICdcclxuICAgICAgKyBsaW5lO1xyXG4gIH0pLmpvaW4oJ1xcbicpO1xyXG5cclxuICAvLyBBbHRlciBleGNlcHRpb24gbWVzc2FnZVxyXG4gIGVyci5wYXRoID0gZmlsZW5hbWU7XHJcbiAgZXJyLm1lc3NhZ2UgPSAoZmlsZW5hbWUgfHwgJ0phZGUnKSArICc6JyArIGxpbmVub1xyXG4gICAgKyAnXFxuJyArIGNvbnRleHQgKyAnXFxuXFxuJyArIGVyci5tZXNzYWdlO1xyXG4gIHRocm93IGVycjtcclxufTtcclxuXG59LHtcImZzXCI6Mn1dLDI6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuXG59LHt9XX0se30sWzFdKVxuKDEpXG59KTtcbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCdqYWRlL3J1bnRpbWUnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgcGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgaXNOYXRpdmUgPSByZXF1aXJlKCcuL2lzTmF0aXZlJyk7XG52YXIgbW9kZXJuID0gJ2hpc3RvcnknIGluIHdpbmRvdyAmJiAncHVzaFN0YXRlJyBpbiBoaXN0b3J5O1xuXG4vLyBHb29nbGUgQ2hyb21lIDM4IG9uIGlPUyBtYWtlcyB3ZWlyZCBjaGFuZ2VzIHRvIGhpc3RvcnkucmVwbGFjZVN0YXRlLCBicmVha2luZyBpdFxudmFyIG5hdGl2ZVJlcGxhY2UgPSBtb2Rlcm4gJiYgaXNOYXRpdmUod2luZG93Lmhpc3RvcnkucmVwbGFjZVN0YXRlKTtcblxuZnVuY3Rpb24gZ28gKHVybCwgbykge1xuICB2YXIgb3B0aW9ucyA9IG8gfHwge307XG4gIHZhciBjb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0IHx8IG51bGw7XG5cbiAgaWYgKCFtb2Rlcm4pIHtcbiAgICBsb2NhdGlvbi5ocmVmID0gdXJsOyByZXR1cm47XG4gIH1cblxuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsKTtcblxuICBmZXRjaGVyLmFib3J0UGVuZGluZygpO1xuICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGNvbnRleHQsIHNvdXJjZTogJ2ludGVudCcgfSwgcmVzb2x2ZWQpO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVkIChlcnIsIG1vZGVsKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuYXZpZ2F0aW9uKHJvdXRlLCBtb2RlbCwgJ3B1c2hTdGF0ZScpO1xuICAgIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0IChtb2RlbCkge1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIGVtaXR0ZXIuZW1pdCgnc3RhcnQnLCBzdGF0ZS5jb250YWluZXIsIG1vZGVsKTtcbiAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSwgeyByZW5kZXI6IGZhbHNlIH0pO1xuICB3aW5kb3cub25wb3BzdGF0ZSA9IGJhY2s7XG59XG5cbmZ1bmN0aW9uIGJhY2sgKGUpIHtcbiAgdmFyIGVtcHR5ID0gIShlICYmIGUuc3RhdGUgJiYgZS5zdGF0ZS5tb2RlbCk7XG4gIGlmIChlbXB0eSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbW9kZWwgPSBlLnN0YXRlLm1vZGVsO1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xufVxuXG5mdW5jdGlvbiByZXBsYWNlV2l0aCAobW9kZWwpIHtcbiAgdmFyIHVybCA9IGxvY2F0aW9uLnBhdGhuYW1lO1xuICB2YXIgcXVlcnkgPSBvckVtcHR5KGxvY2F0aW9uLnNlYXJjaCkgKyBvckVtcHR5KGxvY2F0aW9uLmhhc2gpO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsICsgcXVlcnkpO1xuICBuYXZpZ2F0aW9uKHJvdXRlLCBtb2RlbCwgJ3JlcGxhY2VTdGF0ZScpO1xuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIG9yRW1wdHkgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gbmF2aWdhdGlvbiAocm91dGUsIG1vZGVsLCBkaXJlY3Rpb24pIHtcbiAgc3RhdGUubW9kZWwgPSBtb2RlbDtcbiAgaWYgKG1vZGVsLnRpdGxlKSB7XG4gICAgZG9jdW1lbnQudGl0bGUgPSBtb2RlbC50aXRsZTtcbiAgfVxuICBpZiAobW9kZXJuICYmIGRpcmVjdGlvbiAhPT0gJ3JlcGxhY2VTdGF0ZScgfHwgbmF0aXZlUmVwbGFjZSkge1xuICAgIGhpc3RvcnlbZGlyZWN0aW9uXSh7IG1vZGVsOiBtb2RlbCB9LCBtb2RlbC50aXRsZSwgcm91dGUudXJsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc3RhcnQ6IHN0YXJ0LFxuICBnbzogZ29cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgcmF3ID0gcmVxdWlyZSgnLi9zdG9yZXMvcmF3Jyk7XG52YXIgaWRiID0gcmVxdWlyZSgnLi9zdG9yZXMvaWRiJyk7XG52YXIgc3RvcmVzID0gW3JhdywgaWRiXTtcblxuZnVuY3Rpb24gY2xvbmUgKHZhbHVlKSB7XG4gIHJldHVybiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSk7XG59XG5cbmZ1bmN0aW9uIGdldCAodXJsLCBkb25lKSB7XG4gIHZhciBpID0gMDtcblxuICBmdW5jdGlvbiBuZXh0ICgpIHtcbiAgICB2YXIgZ290T25jZSA9IG9uY2UoZ290KTtcbiAgICB2YXIgc3RvcmUgPSBzdG9yZXNbaSsrXTtcbiAgICBpZiAoc3RvcmUpIHtcbiAgICAgIHN0b3JlLmdldCh1cmwsIGdvdE9uY2UpO1xuICAgICAgc2V0VGltZW91dChnb3RPbmNlLCBzdG9yZSA9PT0gaWRiID8gMTAwIDogNTApOyAvLyBhdCB3b3JzdCwgc3BlbmQgMTUwbXMgb24gY2FjaGluZyBsYXllcnNcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZSh0cnVlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnb3QgKGVyciwgaXRlbSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9IGVsc2UgaWYgKGl0ZW0gJiYgdHlwZW9mIGl0ZW0uZXhwaXJlcyA9PT0gJ251bWJlcicgJiYgRGF0ZS5ub3coKSA8IGl0ZW0uZXhwaXJlcykge1xuICAgICAgICBkb25lKGZhbHNlLCBjbG9uZShpdGVtLmRhdGEpKTsgLy8gYWx3YXlzIHJldHVybiBhIHVuaXF1ZSBjb3B5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbmV4dCgpO1xufVxuXG5mdW5jdGlvbiBzZXQgKHVybCwgZGF0YSwgZHVyYXRpb24pIHtcbiAgaWYgKGR1cmF0aW9uIDwgMSkgeyAvLyBzYW5pdHlcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGNsb25lZCA9IGNsb25lKGRhdGEpOyAvLyBmcmVlemUgYSBjb3B5IGZvciBvdXIgcmVjb3Jkc1xuICBzdG9yZXMuZm9yRWFjaChzdG9yZSk7XG4gIGZ1bmN0aW9uIHN0b3JlIChzKSB7XG4gICAgcy5zZXQodXJsLCB7XG4gICAgICBkYXRhOiBjbG9uZWQsXG4gICAgICBleHBpcmVzOiBEYXRlLm5vdygpICsgZHVyYXRpb25cbiAgICB9KTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2FjaGUgPSByZXF1aXJlKCcuL2NhY2hlJyk7XG52YXIgaWRiID0gcmVxdWlyZSgnLi9zdG9yZXMvaWRiJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGRlZmF1bHRzID0gMTU7XG52YXIgYmFzZWxpbmU7XG5cbmZ1bmN0aW9uIGUgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gc2V0dXAgKGR1cmF0aW9uLCByb3V0ZSkge1xuICBiYXNlbGluZSA9IHBhcnNlRHVyYXRpb24oZHVyYXRpb24pO1xuICBpZiAoYmFzZWxpbmUgPCAxKSB7XG4gICAgc3RhdGUuY2FjaGUgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cbiAgaW50ZXJjZXB0b3IuYWRkKGludGVyY2VwdCk7XG4gIGVtaXR0ZXIub24oJ2ZldGNoLmRvbmUnLCBwZXJzaXN0KTtcbiAgc3RhdGUuY2FjaGUgPSB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnRlcmNlcHQgKGUpIHtcbiAgY2FjaGUuZ2V0KGUudXJsLCByZXN1bHQpO1xuXG4gIGZ1bmN0aW9uIHJlc3VsdCAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKCFlcnIgJiYgZGF0YSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdChkYXRhKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VEdXJhdGlvbiAodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGJhc2VsaW5lIHx8IGRlZmF1bHRzO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0IChyb3V0ZSwgY29udGV4dCwgZGF0YSkge1xuICBpZiAoIXN0YXRlLmNhY2hlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBrZXkgPSByb3V0ZS5wYXJ0cy5wYXRobmFtZSArIGUocm91dGUucGFydHMucXVlcnkpO1xuICB2YXIgZCA9IHJvdXRlLmNhY2hlICE9PSB2b2lkIDAgPyByb3V0ZS5jYWNoZSA6IGJhc2VsaW5lO1xuICBjYWNoZS5zZXQoa2V5LCBkYXRhLCBwYXJzZUR1cmF0aW9uKGQpICogMTAwMCk7XG59XG5cbmZ1bmN0aW9uIHJlYWR5IChmbikge1xuICBpZiAoc3RhdGUuY2FjaGUpIHtcbiAgICBpZGIudGVzdGVkKGZuKTsgLy8gd2FpdCBvbiBpZGIgY29tcGF0aWJpbGl0eSB0ZXN0c1xuICB9IGVsc2Uge1xuICAgIGZuKCk7IC8vIGNhY2hpbmcgaXMgYSBuby1vcFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzZXR1cDogc2V0dXAsXG4gIHBlcnNpc3Q6IHBlcnNpc3QsXG4gIHJlYWR5OiByZWFkeVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGVtaXR0ZXIoe30sIHsgdGhyb3dzOiBmYWxzZSB9KTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gYWRkIChlbGVtZW50LCB0eXBlLCBmbikge1xuICBpZiAoZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGZuKTtcbiAgfSBlbHNlIGlmIChlbGVtZW50LmF0dGFjaEV2ZW50KSB7XG4gICAgZWxlbWVudC5hdHRhY2hFdmVudCgnb24nICsgdHlwZSwgd3JhcHBlckZhY3RvcnkoZWxlbWVudCwgZm4pKTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtZW50WydvbicgKyB0eXBlXSA9IGZuO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbGVtZW50LCBmbikge1xuICByZXR1cm4gZnVuY3Rpb24gd3JhcHBlciAob3JpZ2luYWxFdmVudCkge1xuICAgIHZhciBlID0gb3JpZ2luYWxFdmVudCB8fCB3aW5kb3cuZXZlbnQ7XG4gICAgZS50YXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCAgPSBlLnByZXZlbnREZWZhdWx0ICB8fCBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAoKSB7IGUucmV0dXJuVmFsdWUgPSBmYWxzZTsgfTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbiA9IGUuc3RvcFByb3BhZ2F0aW9uIHx8IGZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbiAoKSB7IGUuY2FuY2VsQnViYmxlID0gdHJ1ZTsgfTtcbiAgICBmbi5jYWxsKGVsZW1lbnQsIGUpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCcuL3hocicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBsYXN0WGhyID0ge307XG5cbmZ1bmN0aW9uIGUgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24ganNvbmlmeSAocm91dGUpIHtcbiAgdmFyIHBhcnRzID0gcm91dGUucGFydHM7XG4gIHZhciBxcyA9IGUocGFydHMuc2VhcmNoKTtcbiAgdmFyIHAgPSBxcyA/ICcmJyA6ICc/JztcbiAgcmV0dXJuIHBhcnRzLnBhdGhuYW1lICsgcXMgKyBwICsgJ2pzb24nO1xufVxuXG5mdW5jdGlvbiBhYm9ydCAoc291cmNlKSB7XG4gIGlmIChsYXN0WGhyW3NvdXJjZV0pIHtcbiAgICBsYXN0WGhyW3NvdXJjZV0uYWJvcnQoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhYm9ydFBlbmRpbmcgKCkge1xuICBPYmplY3Qua2V5cyhsYXN0WGhyKS5mb3JFYWNoKGFib3J0KTtcbiAgbGFzdFhociA9IHt9O1xufVxuXG5mdW5jdGlvbiBmZXRjaGVyIChyb3V0ZSwgY29udGV4dCwgZG9uZSkge1xuICB2YXIgdXJsID0gcm91dGUudXJsO1xuICBpZiAobGFzdFhocltjb250ZXh0LnNvdXJjZV0pIHtcbiAgICBsYXN0WGhyW2NvbnRleHQuc291cmNlXS5hYm9ydCgpO1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0gbnVsbDtcbiAgfVxuICBpbnRlcmNlcHRvci5leGVjdXRlKHJvdXRlLCBhZnRlckludGVyY2VwdG9ycyk7XG5cbiAgZnVuY3Rpb24gYWZ0ZXJJbnRlcmNlcHRvcnMgKGVyciwgcmVzdWx0KSB7XG4gICAgaWYgKCFlcnIgJiYgcmVzdWx0LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgIGRvbmUobnVsbCwgcmVzdWx0Lm1vZGVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5zdGFydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0geGhyKGpzb25pZnkocm91dGUpLCBub3RpZnkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeSAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgaWYgKGVyci5tZXNzYWdlID09PSAnYWJvcnRlZCcpIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5hYm9ydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guZXJyb3InLCByb3V0ZSwgY29udGV4dCwgZXJyKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5kb25lJywgcm91dGUsIGNvbnRleHQsIGRhdGEpO1xuICAgIH1cbiAgICBkb25lKGVyciwgZGF0YSk7XG4gIH1cbn1cblxuZmV0Y2hlci5hYm9ydFBlbmRpbmcgPSBhYm9ydFBlbmRpbmc7XG5cbm1vZHVsZS5leHBvcnRzID0gZmV0Y2hlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBsaW5rcyA9IHJlcXVpcmUoJy4vbGlua3MnKTtcblxuZnVuY3Rpb24gYXR0YWNoICgpIHtcbiAgZW1pdHRlci5vbignc3RhcnQnLCBsaW5rcyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRhY2g6IGF0dGFjaFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGhvb2tzID0gcmVxdWlyZSgnLi9ob29rcycpO1xudmFyIHBhcnRpYWwgPSByZXF1aXJlKCcuL3BhcnRpYWwnKTtcbnZhciBtb3VudCA9IHJlcXVpcmUoJy4vbW91bnQnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xuXG5ob29rcy5hdHRhY2goKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1vdW50OiBtb3VudCxcbiAgcGFydGlhbDogcGFydGlhbC5zdGFuZGFsb25lLFxuICBvbjogZW1pdHRlci5vbi5iaW5kKGVtaXR0ZXIpLFxuICBvbmNlOiBlbWl0dGVyLm9uY2UuYmluZChlbWl0dGVyKSxcbiAgb2ZmOiBlbWl0dGVyLm9mZi5iaW5kKGVtaXR0ZXIpLFxuICBpbnRlcmNlcHQ6IGludGVyY2VwdG9yLmFkZCxcbiAgbmF2aWdhdGU6IGFjdGl2YXRvci5nbyxcbiAgc3RhdGU6IHN0YXRlLFxuICByb3V0ZTogcm91dGVyXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG52YXIgb25jZSA9IHJlcXVpcmUoJy4vb25jZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgaW50ZXJjZXB0b3JzID0gZW1pdHRlcih7IGNvdW50OiAwIH0sIHsgYXN5bmM6IHRydWUgfSk7XG5cbmZ1bmN0aW9uIGdldEludGVyY2VwdG9yRXZlbnQgKHVybCwgcm91dGUpIHtcbiAgdmFyIGUgPSB7XG4gICAgdXJsOiB1cmwsXG4gICAgcm91dGU6IHJvdXRlLFxuICAgIHBhcnRzOiByb3V0ZS5wYXJ0cyxcbiAgICBtb2RlbDogbnVsbCxcbiAgICBkZWZhdWx0UHJldmVudGVkOiBmYWxzZSxcbiAgICBwcmV2ZW50RGVmYXVsdDogb25jZShwcmV2ZW50RGVmYXVsdClcbiAgfTtcblxuICBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAobW9kZWwpIHtcbiAgICBlLmRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlO1xuICAgIGUubW9kZWwgPSBtb2RlbDtcbiAgfVxuXG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBhZGQgKGFjdGlvbiwgZm4pIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICBmbiA9IGFjdGlvbjtcbiAgICBhY3Rpb24gPSAnKic7XG4gIH1cbiAgaW50ZXJjZXB0b3JzLmNvdW50Kys7XG4gIGludGVyY2VwdG9ycy5vbihhY3Rpb24sIGZuKTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZVN5bmMgKHJvdXRlKSB7XG4gIHZhciBlID0gZ2V0SW50ZXJjZXB0b3JFdmVudChyb3V0ZS51cmwsIHJvdXRlKTtcblxuICBpbnRlcmNlcHRvcnMuZW1pdCgnKicsIGUpO1xuICBpbnRlcmNlcHRvcnMuZW1pdChyb3V0ZS5hY3Rpb24sIGUpO1xuXG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlIChyb3V0ZSwgZG9uZSkge1xuICB2YXIgZSA9IGdldEludGVyY2VwdG9yRXZlbnQocm91dGUudXJsLCByb3V0ZSk7XG4gIGlmIChpbnRlcmNlcHRvcnMuY291bnQgPT09IDApIHsgLy8gZmFpbCBmYXN0XG4gICAgZW5kKCk7IHJldHVybjtcbiAgfVxuICB2YXIgZm4gPSBvbmNlKGVuZCk7XG4gIHZhciBwcmV2ZW50RGVmYXVsdEJhc2UgPSBlLnByZXZlbnREZWZhdWx0O1xuXG4gIGUucHJldmVudERlZmF1bHQgPSBvbmNlKHByZXZlbnREZWZhdWx0RW5kcyk7XG5cbiAgaW50ZXJjZXB0b3JzLmVtaXQoJyonLCBlKTtcbiAgaW50ZXJjZXB0b3JzLmVtaXQocm91dGUuYWN0aW9uLCBlKTtcblxuICBzZXRUaW1lb3V0KGZuLCAyMDApOyAvLyBhdCB3b3JzdCwgc3BlbmQgMjAwbXMgd2FpdGluZyBvbiBpbnRlcmNlcHRvcnNcblxuICBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdEVuZHMgKCkge1xuICAgIHByZXZlbnREZWZhdWx0QmFzZS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIGZuKCk7XG4gIH1cblxuICBmdW5jdGlvbiBlbmQgKCkge1xuICAgIGRvbmUobnVsbCwgZSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkLFxuICBleGVjdXRlOiBleGVjdXRlXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBzb3VyY2U6IGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2pkYWx0b24vNWUzNGQ4OTAxMDVhY2E0NDM5OWZcbi8vIHRoYW5rcyBAamRhbHRvbiFcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZzsgLy8gdXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBgW1tDbGFzc11dYCBvZiB2YWx1ZXNcbnZhciBmblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nOyAvLyB1c2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9uc1xudmFyIGhvc3QgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvOyAvLyB1c2VkIHRvIGRldGVjdCBob3N0IGNvbnN0cnVjdG9ycyAoU2FmYXJpID4gNDsgcmVhbGx5IHR5cGVkIGFycmF5IHNwZWNpZmljKVxuXG4vLyBFc2NhcGUgYW55IHNwZWNpYWwgcmVnZXhwIGNoYXJhY3RlcnMuXG52YXIgc3BlY2lhbHMgPSAvWy4qKz9eJHt9KCl8W1xcXVxcL1xcXFxdL2c7XG5cbi8vIFJlcGxhY2UgbWVudGlvbnMgb2YgYHRvU3RyaW5nYCB3aXRoIGAuKj9gIHRvIGtlZXAgdGhlIHRlbXBsYXRlIGdlbmVyaWMuXG4vLyBSZXBsYWNlIHRoaW5nIGxpa2UgYGZvciAuLi5gIHRvIHN1cHBvcnQgZW52aXJvbm1lbnRzLCBsaWtlIFJoaW5vLCB3aGljaCBhZGQgZXh0cmFcbi8vIGluZm8gc3VjaCBhcyBtZXRob2QgYXJpdHkuXG52YXIgZXh0cmFzID0gL3RvU3RyaW5nfChmdW5jdGlvbikuKj8oPz1cXFxcXFwoKXwgZm9yIC4rPyg/PVxcXFxcXF0pL2c7XG5cbi8vIENvbXBpbGUgYSByZWdleHAgdXNpbmcgYSBjb21tb24gbmF0aXZlIG1ldGhvZCBhcyBhIHRlbXBsYXRlLlxuLy8gV2UgY2hvc2UgYE9iamVjdCN0b1N0cmluZ2AgYmVjYXVzZSB0aGVyZSdzIGEgZ29vZCBjaGFuY2UgaXQgaXMgbm90IGJlaW5nIG11Y2tlZCB3aXRoLlxudmFyIGZuU3RyaW5nID0gU3RyaW5nKHRvU3RyaW5nKS5yZXBsYWNlKHNwZWNpYWxzLCAnXFxcXCQmJykucmVwbGFjZShleHRyYXMsICckMS4qPycpO1xudmFyIHJlTmF0aXZlID0gbmV3IFJlZ0V4cCgnXicgKyBmblN0cmluZyArICckJyk7XG5cbmZ1bmN0aW9uIGlzTmF0aXZlICh2YWx1ZSkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgaWYgKHR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAvLyBVc2UgYEZ1bmN0aW9uI3RvU3RyaW5nYCB0byBieXBhc3MgdGhlIHZhbHVlJ3Mgb3duIGB0b1N0cmluZ2AgbWV0aG9kXG4gICAgLy8gYW5kIGF2b2lkIGJlaW5nIGZha2VkIG91dC5cbiAgICByZXR1cm4gcmVOYXRpdmUudGVzdChmblRvU3RyaW5nLmNhbGwodmFsdWUpKTtcbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGEgaG9zdCBvYmplY3QgY2hlY2sgYmVjYXVzZSBzb21lIGVudmlyb25tZW50cyB3aWxsIHJlcHJlc2VudFxuICAvLyB0aGluZ3MgbGlrZSB0eXBlZCBhcnJheXMgYXMgRE9NIG1ldGhvZHMgd2hpY2ggbWF5IG5vdCBjb25mb3JtIHRvIHRoZVxuICAvLyBub3JtYWwgbmF0aXZlIHBhdHRlcm4uXG4gIHJldHVybiAodmFsdWUgJiYgdHlwZSA9PT0gJ29iamVjdCcgJiYgaG9zdC50ZXN0KHRvU3RyaW5nLmNhbGwodmFsdWUpKSkgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNOYXRpdmU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgb3JpZ2luID0gZG9jdW1lbnQubG9jYXRpb24ub3JpZ2luO1xudmFyIGxlZnRDbGljayA9IDE7XG52YXIgcHJlZmV0Y2hpbmcgPSBbXTtcbnZhciBjbGlja3NPbkhvbGQgPSBbXTtcblxuZnVuY3Rpb24gbGlua3MgKCkge1xuICBpZiAoc3RhdGUucHJlZmV0Y2ggJiYgc3RhdGUuY2FjaGUpIHsgLy8gcHJlZmV0Y2ggd2l0aG91dCBjYWNoZSBtYWtlcyBubyBzZW5zZVxuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ21vdXNlb3ZlcicsIG1heWJlUHJlZmV0Y2gpO1xuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ3RvdWNoc3RhcnQnLCBtYXliZVByZWZldGNoKTtcbiAgfVxuICBldmVudHMuYWRkKGRvY3VtZW50LmJvZHksICdjbGljaycsIG1heWJlUmVyb3V0ZSk7XG59XG5cbmZ1bmN0aW9uIHNvIChhbmNob3IpIHtcbiAgcmV0dXJuIGFuY2hvci5vcmlnaW4gPT09IG9yaWdpbjtcbn1cblxuZnVuY3Rpb24gbGVmdENsaWNrT25BbmNob3IgKGUsIGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLnBhdGhuYW1lICYmIGUud2hpY2ggPT09IGxlZnRDbGljayAmJiAhZS5tZXRhS2V5ICYmICFlLmN0cmxLZXk7XG59XG5cbmZ1bmN0aW9uIHRhcmdldE9yQW5jaG9yIChlKSB7XG4gIHZhciBhbmNob3IgPSBlLnRhcmdldDtcbiAgd2hpbGUgKGFuY2hvcikge1xuICAgIGlmIChhbmNob3IudGFnTmFtZSA9PT0gJ0EnKSB7XG4gICAgICByZXR1cm4gYW5jaG9yO1xuICAgIH1cbiAgICBhbmNob3IgPSBhbmNob3IucGFyZW50RWxlbWVudDtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVJlcm91dGUgKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikgJiYgbGVmdENsaWNrT25BbmNob3IoZSwgYW5jaG9yKSkge1xuICAgIHJlcm91dGUoZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVByZWZldGNoIChlKSB7XG4gIHZhciBhbmNob3IgPSB0YXJnZXRPckFuY2hvcihlKTtcbiAgaWYgKGFuY2hvciAmJiBzbyhhbmNob3IpKSB7XG4gICAgcHJlZmV0Y2goZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzY3JvbGxJbnRvIChpZCkge1xuICB2YXIgZWxlbSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgaWYgKGVsZW0gJiYgZWxlbS5zY3JvbGxJbnRvVmlldykge1xuICAgIGVsZW0uc2Nyb2xsSW50b1ZpZXcoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBub29wICgpIHt9XG5cbmZ1bmN0aW9uIGdldFJvdXRlIChhbmNob3IsIGZhaWwpIHtcbiAgdmFyIHVybCA9IGFuY2hvci5wYXRobmFtZSArIGFuY2hvci5zZWFyY2ggKyBhbmNob3IuaGFzaDtcbiAgaWYgKHVybCA9PT0gbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBhbmNob3IuaGFzaCkge1xuICAgIChmYWlsIHx8IG5vb3ApKCk7XG4gICAgcmV0dXJuOyAvLyBhbmNob3IgaGFzaC1uYXZpZ2F0aW9uIG9uIHNhbWUgcGFnZSBpZ25vcmVzIHJvdXRlclxuICB9XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLmlnbm9yZSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIHJlcm91dGUgKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IsIGZhaWwpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJldmVudCgpO1xuXG4gIGlmIChwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgY2xpY2tzT25Ib2xkLnB1c2goYW5jaG9yKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBhY3RpdmF0b3IuZ28ocm91dGUudXJsLCB7IGNvbnRleHQ6IGFuY2hvciB9KTtcblxuICBmdW5jdGlvbiBmYWlsICgpIHtcbiAgICBpZiAoYW5jaG9yLmhhc2ggPT09IGxvY2F0aW9uLmhhc2gpIHtcbiAgICAgIHNjcm9sbEludG8oYW5jaG9yLmhhc2guc3Vic3RyKDEpKTtcbiAgICAgIHByZXZlbnQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwcmV2ZW50ICgpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB9XG59XG5cbmZ1bmN0aW9uIHByZWZldGNoIChlLCBhbmNob3IpIHtcbiAgdmFyIHJvdXRlID0gZ2V0Um91dGUoYW5jaG9yKTtcbiAgaWYgKCFyb3V0ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJlZmV0Y2hpbmcucHVzaChhbmNob3IpO1xuICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGFuY2hvciwgc291cmNlOiAncHJlZmV0Y2gnIH0sIHJlc29sdmVkKTtcblxuICBmdW5jdGlvbiByZXNvbHZlZCAoZXJyLCBkYXRhKSB7XG4gICAgcHJlZmV0Y2hpbmcuc3BsaWNlKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSwgMSk7XG4gICAgaWYgKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgICBjbGlja3NPbkhvbGQuc3BsaWNlKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvciksIDEpO1xuICAgICAgYWN0aXZhdG9yLmdvKHJvdXRlLnVybCwgeyBjb250ZXh0OiBhbmNob3IgfSk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbGlua3M7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciB1bmVzY2FwZSA9IHJlcXVpcmUoJy4vdW5lc2NhcGUnKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgY2FjaGluZyA9IHJlcXVpcmUoJy4vY2FjaGluZycpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBnID0gZ2xvYmFsO1xudmFyIG1vdW50ZWQ7XG52YXIgYm9vdGVkO1xuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG1vdW50IChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucykge1xuICB2YXIgbyA9IG9wdGlvbnMgfHwge307XG4gIGlmIChtb3VudGVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdUYXVudXMgYWxyZWFkeSBtb3VudGVkIScpO1xuICB9XG4gIGlmICghY29udGFpbmVyIHx8ICFjb250YWluZXIudGFnTmFtZSkgeyAvLyBuYcOvdmUgaXMgZW5vdWdoXG4gICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYW4gYXBwbGljYXRpb24gcm9vdCBjb250YWluZXIhJyk7XG4gIH1cblxuICBtb3VudGVkID0gdHJ1ZTtcblxuICBzdGF0ZS5jb250YWluZXIgPSBjb250YWluZXI7XG4gIHN0YXRlLmNvbnRyb2xsZXJzID0gd2lyaW5nLmNvbnRyb2xsZXJzO1xuICBzdGF0ZS50ZW1wbGF0ZXMgPSB3aXJpbmcudGVtcGxhdGVzO1xuICBzdGF0ZS5yb3V0ZXMgPSB3aXJpbmcucm91dGVzO1xuICBzdGF0ZS5wcmVmZXRjaCA9ICEhby5wcmVmZXRjaDtcblxuICByb3V0ZXIuc2V0dXAod2lyaW5nLnJvdXRlcyk7XG5cbiAgdmFyIHVybCA9IGxvY2F0aW9uLnBhdGhuYW1lO1xuICB2YXIgcXVlcnkgPSBvckVtcHR5KGxvY2F0aW9uLnNlYXJjaCkgKyBvckVtcHR5KGxvY2F0aW9uLmhhc2gpO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsICsgcXVlcnkpO1xuXG4gIGNhY2hpbmcuc2V0dXAoby5jYWNoZSwgcm91dGUpO1xuICBjYWNoaW5nLnJlYWR5KGtpY2tzdGFydCk7XG5cbiAgZnVuY3Rpb24ga2lja3N0YXJ0ICgpIHtcbiAgICBpZiAoIW8uYm9vdHN0cmFwKSB7IG8uYm9vdHN0cmFwID0gJ2F1dG8nOyB9XG4gICAgaWYgKG8uYm9vdHN0cmFwID09PSAnYXV0bycpIHtcbiAgICAgIGF1dG9ib290KCk7XG4gICAgfSBlbHNlIGlmIChvLmJvb3RzdHJhcCA9PT0gJ2lubGluZScpIHtcbiAgICAgIGlubGluZWJvb3QoKTtcbiAgICB9IGVsc2UgaWYgKG8uYm9vdHN0cmFwID09PSAnbWFudWFsJykge1xuICAgICAgbWFudWFsYm9vdCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF1dG9ib290ICgpIHtcbiAgICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgc291cmNlOiAnYm9vdCcgfSwgZmV0Y2hlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBmZXRjaGVkIChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZldGNoaW5nIEpTT04gZGF0YSBtb2RlbCBmb3IgZmlyc3QgdmlldyBmYWlsZWQuJyk7XG4gICAgfVxuICAgIGJvb3QoZGF0YSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmxpbmVib290ICgpIHtcbiAgICB2YXIgaWQgPSBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLXRhdW51cycpO1xuICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIG1vZGVsID0gSlNPTi5wYXJzZSh1bmVzY2FwZShzY3JpcHQuaW5uZXJUZXh0IHx8IHNjcmlwdC50ZXh0Q29udGVudCkpO1xuICAgIGJvb3QobW9kZWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gbWFudWFsYm9vdCAoKSB7XG4gICAgaWYgKHR5cGVvZiBnLnRhdW51c1JlYWR5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBnLnRhdW51c1JlYWR5ID0gYm9vdDsgLy8gbm90IHlldCBhbiBvYmplY3Q/IHR1cm4gaXQgaW50byB0aGUgYm9vdCBtZXRob2RcbiAgICB9IGVsc2Uge1xuICAgICAgYm9vdChnLnRhdW51c1JlYWR5KTsgLy8gYWxyZWFkeSBhbiBvYmplY3Q/IGJvb3Qgd2l0aCB0aGF0IGFzIHRoZSBtb2RlbFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGJvb3QgKG1vZGVsKSB7XG4gICAgaWYgKGJvb3RlZCkgeyAvLyBzYW5pdHlcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFtb2RlbCB8fCB0eXBlb2YgbW9kZWwgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhdW51cyBtb2RlbCBtdXN0IGJlIGFuIG9iamVjdCEnKTtcbiAgICB9XG4gICAgYm9vdGVkID0gdHJ1ZTtcbiAgICBjYWNoaW5nLnBlcnNpc3Qocm91dGUsIHN0YXRlLmNvbnRhaW5lciwgbW9kZWwpO1xuICAgIGFjdGl2YXRvci5zdGFydChtb2RlbCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBtb3VudDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGZuKSB7XG4gIHZhciB1c2VkO1xuICByZXR1cm4gZnVuY3Rpb24gb25jZSAoKSB7XG4gICAgaWYgKHVzZWQpIHsgcmV0dXJuOyB9IHVzZWQgPSB0cnVlO1xuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJhZiA9IHJlcXVpcmUoJ3JhZicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcblxuZnVuY3Rpb24gcG9zaXRpb25pbmcgKCkge1xuICB2YXIgdGFyZ2V0O1xuICB2YXIgaGFzaCA9IGxvY2F0aW9uLmhhc2g7XG4gIGlmIChoYXNoKSB7XG4gICAgdGFyZ2V0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaGFzaC5zbGljZSgxKSk7XG4gIH1cbiAgaWYgKCF0YXJnZXQpIHtcbiAgICB0YXJnZXQgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIH1cbiAgcmFmKGZvY3VzaW4pO1xuICBmdW5jdGlvbiBmb2N1c2luICgpIHtcbiAgICB0YXJnZXQuc2Nyb2xsSW50b1ZpZXcoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJ0aWFsIChjb250YWluZXIsIGVuZm9yY2VkQWN0aW9uLCBtb2RlbCwgcm91dGUsIG9wdGlvbnMpIHtcbiAgdmFyIGFjdGlvbiA9IGVuZm9yY2VkQWN0aW9uIHx8IG1vZGVsICYmIG1vZGVsLmFjdGlvbiB8fCByb3V0ZSAmJiByb3V0ZS5hY3Rpb247XG4gIHZhciBjb250cm9sbGVyID0gc3RhdGUuY29udHJvbGxlcnNbYWN0aW9uXTtcbiAgdmFyIGludGVybmFscyA9IG9wdGlvbnMgfHwge307XG4gIGlmIChpbnRlcm5hbHMucmVuZGVyICE9PSBmYWxzZSkge1xuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXIoYWN0aW9uLCBtb2RlbCk7XG4gICAgaWYgKGludGVybmFscy5yb3V0ZWQgIT09IGZhbHNlKSB7XG4gICAgICBwb3NpdGlvbmluZygpO1xuICAgIH1cbiAgfVxuICBlbWl0dGVyLmVtaXQoJ3JlbmRlcicsIGNvbnRhaW5lciwgbW9kZWwpO1xuICBpZiAoY29udHJvbGxlcikge1xuICAgIGNvbnRyb2xsZXIobW9kZWwsIHJvdXRlLCBjb250YWluZXIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlciAoYWN0aW9uLCBtb2RlbCkge1xuICB2YXIgdGVtcGxhdGUgPSBzdGF0ZS50ZW1wbGF0ZXNbYWN0aW9uXTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gdGVtcGxhdGUobW9kZWwpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciByZW5kZXJpbmcgXCInICsgYWN0aW9uICsgJ1wiIHRlbXBsYXRlXFxuJyArIGUuc3RhY2spO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YW5kYWxvbmUgKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCwgcm91dGUpIHtcbiAgcmV0dXJuIHBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSwgeyByb3V0ZWQ6IGZhbHNlIH0pO1xufVxuXG5wYXJ0aWFsLnN0YW5kYWxvbmUgPSBzdGFuZGFsb25lO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnRpYWw7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1cmwgPSByZXF1aXJlKCdmYXN0LXVybC1wYXJzZXInKTtcbnZhciByb3V0ZXMgPSByZXF1aXJlKCdyb3V0ZXMnKTtcbnZhciBtYXRjaGVyID0gcm91dGVzKCk7XG5cbmZ1bmN0aW9uIHJvdXRlciAocmF3KSB7XG4gIHZhciBwYXJ0cyA9IHVybC5wYXJzZShyYXcpO1xuICB2YXIgcmVzdWx0ID0gbWF0Y2hlci5tYXRjaChwYXJ0cy5wYXRobmFtZSk7XG4gIHZhciByb3V0ZSA9IHJlc3VsdCA/IHJlc3VsdC5mbihyZXN1bHQpIDogbnVsbDtcbiAgaWYgKHJvdXRlKSB7XG4gICAgcm91dGUudXJsID0gcmF3O1xuICAgIHJvdXRlLnBhcnRzID0gcGFydHM7XG4gIH1cbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBzZXR1cCAoZGVmaW5pdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmaW5pdGlvbnMpLmZvckVhY2goZGVmaW5lLmJpbmQobnVsbCwgZGVmaW5pdGlvbnMpKTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lIChkZWZpbml0aW9ucywga2V5KSB7XG4gIG1hdGNoZXIuYWRkUm91dGUoa2V5LCBmdW5jdGlvbiBkZWZpbml0aW9uIChtYXRjaCkge1xuICAgIHZhciBwYXJhbXMgPSBtYXRjaC5wYXJhbXM7XG4gICAgcGFyYW1zLmFyZ3MgPSBtYXRjaC5zcGxhdHM7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJvdXRlOiBrZXksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIGFjdGlvbjogZGVmaW5pdGlvbnNba2V5XS5hY3Rpb24gfHwgbnVsbCxcbiAgICAgIGlnbm9yZTogZGVmaW5pdGlvbnNba2V5XS5pZ25vcmUsXG4gICAgICBjYWNoZTogZGVmaW5pdGlvbnNba2V5XS5jYWNoZVxuICAgIH07XG4gIH0pO1xufVxuXG5yb3V0ZXIuc2V0dXAgPSBzZXR1cDtcblxubW9kdWxlLmV4cG9ydHMgPSByb3V0ZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBjb250YWluZXI6IG51bGxcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBhcGkgPSB7fTtcbnZhciBnID0gZ2xvYmFsO1xudmFyIGlkYiA9IGcuaW5kZXhlZERCIHx8IGcubW96SW5kZXhlZERCIHx8IGcud2Via2l0SW5kZXhlZERCIHx8IGcubXNJbmRleGVkREI7XG52YXIgc3VwcG9ydHM7XG52YXIgZGI7XG52YXIgZGJOYW1lID0gJ3RhdW51cy1jYWNoZSc7XG52YXIgc3RvcmUgPSAndmlldy1tb2RlbHMnO1xudmFyIGtleVBhdGggPSAndXJsJztcbnZhciBzZXRRdWV1ZSA9IFtdO1xudmFyIHRlc3RlZFF1ZXVlID0gW107XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gdGVzdCAoKSB7XG4gIHZhciBrZXkgPSAnaW5kZXhlZC1kYi1mZWF0dXJlLWRldGVjdGlvbic7XG4gIHZhciByZXE7XG4gIHZhciBkYjtcblxuICBpZiAoIShpZGIgJiYgJ2RlbGV0ZURhdGFiYXNlJyBpbiBpZGIpKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7IHJldHVybjtcbiAgfVxuXG4gIHRyeSB7XG4gICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSkub25zdWNjZXNzID0gdHJhbnNhY3Rpb25hbFRlc3Q7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyYW5zYWN0aW9uYWxUZXN0ICgpIHtcbiAgICByZXEgPSBpZGIub3BlbihrZXksIDEpO1xuICAgIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gICAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICAgIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgICByZXEucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdzdG9yZScpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgICAgZGIgPSByZXEucmVzdWx0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGIudHJhbnNhY3Rpb24oJ3N0b3JlJywgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKCdzdG9yZScpLmFkZChuZXcgQmxvYigpLCAna2V5Jyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZGIuY2xvc2UoKTtcbiAgICAgICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSk7XG4gICAgICAgIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICBvcGVuKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgICBzdXBwb3J0KGZhbHNlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gb3BlbiAoKSB7XG4gIHZhciByZXEgPSBpZGIub3BlbihkYk5hbWUsIDEpO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuICByZXEub251cGdyYWRlbmVlZGVkID0gdXBnbmVlZGVkO1xuICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICBmdW5jdGlvbiB1cGduZWVkZWQgKCkge1xuICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoc3RvcmUsIHsga2V5UGF0aDoga2V5UGF0aCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIGRiID0gcmVxLnJlc3VsdDtcbiAgICBhcGkubmFtZSA9ICdJbmRleGVkREInO1xuICAgIGFwaS5nZXQgPSBnZXQ7XG4gICAgYXBpLnNldCA9IHNldDtcbiAgICBkcmFpblNldCgpO1xuICAgIHN1cHBvcnQodHJ1ZSk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmFsbGJhY2sgKCkge1xuICBhcGkubmFtZSA9ICdJbmRleGVkREItZmFsbGJhY2tTdG9yZSc7XG4gIGFwaS5nZXQgPSB1bmRlZmluZWRHZXQ7XG4gIGFwaS5zZXQgPSBlbnF1ZXVlU2V0O1xufVxuXG5mdW5jdGlvbiB1bmRlZmluZWRHZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIG51bGwpO1xufVxuXG5mdW5jdGlvbiBlbnF1ZXVlU2V0IChrZXksICB2YWx1ZSwgZG9uZSkge1xuICBpZiAoc2V0UXVldWUubGVuZ3RoID4gMikgeyAvLyBsZXQncyBub3Qgd2FzdGUgYW55IG1vcmUgbWVtb3J5XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHsgLy8gbGV0J3MgYXNzdW1lIHRoZSBjYXBhYmlsaXR5IGlzIHZhbGlkYXRlZCBzb29uXG4gICAgc2V0UXVldWUucHVzaCh7IGtleToga2V5LCB2YWx1ZTogdmFsdWUsIGRvbmU6IGRvbmUgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5TZXQgKCkge1xuICB3aGlsZSAoc2V0UXVldWUubGVuZ3RoKSB7XG4gICAgdmFyIGl0ZW0gPSBzZXRRdWV1ZS5zaGlmdCgpO1xuICAgIHNldChpdGVtLmtleSwgaXRlbS52YWx1ZSwgaXRlbS5kb25lKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBxdWVyeSAob3AsIHZhbHVlLCBkb25lKSB7XG4gIHZhciByZXEgPSBkYi50cmFuc2FjdGlvbihzdG9yZSwgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKHN0b3JlKVtvcF0odmFsdWUpO1xuXG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG51bGwsIHJlcS5yZXN1bHQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG5ldyBFcnJvcignVGF1bnVzIGNhY2hlIHF1ZXJ5IGZhaWxlZCBhdCBJbmRleGVkREIhJykpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldCAoa2V5LCBkb25lKSB7XG4gIHF1ZXJ5KCdnZXQnLCBrZXksIGRvbmUpO1xufVxuXG5mdW5jdGlvbiBzZXQgKGtleSwgdmFsdWUsIGRvbmUpIHtcbiAgdmFsdWVba2V5UGF0aF0gPSBrZXk7XG4gIHF1ZXJ5KCdhZGQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gaW5zZXJ0XG4gIHF1ZXJ5KCdwdXQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gdXBkYXRlXG59XG5cbmZ1bmN0aW9uIGRyYWluVGVzdGVkICgpIHtcbiAgd2hpbGUgKHRlc3RlZFF1ZXVlLmxlbmd0aCkge1xuICAgIHRlc3RlZFF1ZXVlLnNoaWZ0KCkoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0ZXN0ZWQgKGZuKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgZm4oKTtcbiAgfSBlbHNlIHtcbiAgICB0ZXN0ZWRRdWV1ZS5wdXNoKGZuKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdXBwb3J0ICh2YWx1ZSkge1xuICBpZiAoc3VwcG9ydHMgIT09IHZvaWQgMCkge1xuICAgIHJldHVybjsgLy8gc2FuaXR5XG4gIH1cbiAgc3VwcG9ydHMgPSB2YWx1ZTtcbiAgZHJhaW5UZXN0ZWQoKTtcbn1cblxuZnVuY3Rpb24gZmFpbGVkICgpIHtcbiAgc3VwcG9ydChmYWxzZSk7XG59XG5cbmZhbGxiYWNrKCk7XG50ZXN0KCk7XG5zZXRUaW1lb3V0KGZhaWxlZCwgNjAwKTsgLy8gdGhlIHRlc3QgY2FuIHRha2Ugc29tZXdoZXJlIG5lYXIgMzAwbXMgdG8gY29tcGxldGVcblxubW9kdWxlLmV4cG9ydHMgPSBhcGk7XG5cbmFwaS50ZXN0ZWQgPSB0ZXN0ZWQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmF3ID0ge307XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgZG9uZShudWxsLCByYXdba2V5XSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICByYXdba2V5XSA9IHZhbHVlO1xuICAoZG9uZSB8fCBub29wKShudWxsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG5hbWU6ICdtZW1vcnlTdG9yZScsXG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJlRXNjYXBlZEh0bWwgPSAvJig/OmFtcHxsdHxndHxxdW90fCMzOXwjOTYpOy9nO1xudmFyIGh0bWxVbmVzY2FwZXMgPSB7XG4gICcmYW1wOyc6ICcmJyxcbiAgJyZsdDsnOiAnPCcsXG4gICcmZ3Q7JzogJz4nLFxuICAnJnF1b3Q7JzogJ1wiJyxcbiAgJyYjMzk7JzogJ1xcJycsXG4gICcmIzk2Oyc6ICdgJ1xufTtcblxuZnVuY3Rpb24gdW5lc2NhcGVIdG1sQ2hhciAoYykge1xuICByZXR1cm4gaHRtbFVuZXNjYXBlc1tjXTtcbn1cblxuZnVuY3Rpb24gdW5lc2NhcGUgKGlucHV0KSB7XG4gIHZhciBkYXRhID0gaW5wdXQgPT0gbnVsbCA/ICcnIDogU3RyaW5nKGlucHV0KTtcbiAgaWYgKGRhdGEgJiYgKHJlRXNjYXBlZEh0bWwubGFzdEluZGV4ID0gMCwgcmVFc2NhcGVkSHRtbC50ZXN0KGRhdGEpKSkge1xuICAgIHJldHVybiBkYXRhLnJlcGxhY2UocmVFc2NhcGVkSHRtbCwgdW5lc2NhcGVIdG1sQ2hhcik7XG4gIH1cbiAgcmV0dXJuIGRhdGE7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdW5lc2NhcGU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCd4aHInKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHVybCwgZG9uZSkge1xuICB2YXIgb3B0aW9ucyA9IHtcbiAgICB1cmw6IHVybCxcbiAgICBqc29uOiB0cnVlLFxuICAgIGhlYWRlcnM6IHsgQWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicgfVxuICB9O1xuICB2YXIgcmVxID0geGhyKG9wdGlvbnMsIGhhbmRsZSk7XG5cbiAgcmV0dXJuIHJlcTtcblxuICBmdW5jdGlvbiBoYW5kbGUgKGVyciwgcmVzLCBib2R5KSB7XG4gICAgaWYgKGVyciAmJiAhcmVxLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKSB7XG4gICAgICBkb25lKG5ldyBFcnJvcignYWJvcnRlZCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZShlcnIsIGJvZHkpO1xuICAgIH1cbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zcmMvY29udHJhLmVtaXR0ZXIuanMnKTtcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4oZnVuY3Rpb24gKHJvb3QsIHVuZGVmaW5lZCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHVuZGVmID0gJycgKyB1bmRlZmluZWQ7XG4gIGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4gIGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7IGlmICghZm4pIHsgcmV0dXJuOyB9IHRpY2soZnVuY3Rpb24gcnVuICgpIHsgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pOyB9KTsgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIHRpY2tlclxuICB2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuICBpZiAoc2kpIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIHByb2Nlc3MgIT09IHVuZGVmICYmIHByb2Nlc3MubmV4dFRpY2spIHtcbiAgICB0aWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgfSBlbHNlIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX2VtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldnQgPSB7fTtcbiAgICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gICAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChjID09PSAxKSB7XG4gICAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgICAgZXZ0ID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGN0eCA9IHRoaXM7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciB0eXBlID0gYXJncy5zaGlmdCgpO1xuICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICBpZiAoIWV0KSB7IHJldHVybiB0aGluZzsgfVxuICAgICAgZXZ0W3R5cGVdID0gZXQuZmlsdGVyKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgIHJldHVybiAhbGlzdGVuLl9vbmNlO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICByZXR1cm4gdGhpbmc7XG4gIH1cblxuICAvLyBjcm9zcy1wbGF0Zm9ybSBleHBvcnRcbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09IHVuZGVmICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBfZW1pdHRlcjtcbiAgfSBlbHNlIHtcbiAgICByb290LmNvbnRyYSA9IHJvb3QuY29udHJhIHx8IHt9O1xuICAgIHJvb3QuY29udHJhLmVtaXR0ZXIgPSBfZW1pdHRlcjtcbiAgfVxufSkodGhpcyk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiKSkiLCJcInVzZSBzdHJpY3RcIjtcbi8qXG5Db3B5cmlnaHQgKGMpIDIwMTQgUGV0a2EgQW50b25vdlxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG5hbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiAgSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuVEhFIFNPRlRXQVJFLlxuKi9cbmZ1bmN0aW9uIFVybCgpIHtcbiAgICAvL0ZvciBtb3JlIGVmZmljaWVudCBpbnRlcm5hbCByZXByZXNlbnRhdGlvbiBhbmQgbGF6aW5lc3MuXG4gICAgLy9UaGUgbm9uLXVuZGVyc2NvcmUgdmVyc2lvbnMgb2YgdGhlc2UgcHJvcGVydGllcyBhcmUgYWNjZXNzb3IgZnVuY3Rpb25zXG4gICAgLy9kZWZpbmVkIG9uIHRoZSBwcm90b3R5cGUuXG4gICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgIHRoaXMuX2hyZWYgPSBcIlwiO1xuICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICB0aGlzLl9xdWVyeSA9IG51bGw7XG5cbiAgICB0aGlzLmF1dGggPSBudWxsO1xuICAgIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gICAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgICB0aGlzLmhhc2ggPSBudWxsO1xuICAgIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcblxuICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IGZhbHNlO1xufVxuXG52YXIgcXVlcnlzdHJpbmcgPSByZXF1aXJlKFwicXVlcnlzdHJpbmdcIik7XG5VcmwucHJvdG90eXBlLnBhcnNlID1cbmZ1bmN0aW9uIFVybCRwYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAodHlwZW9mIHN0ciAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUGFyYW1ldGVyICd1cmwnIG11c3QgYmUgYSBzdHJpbmcsIG5vdCBcIiArXG4gICAgICAgICAgICB0eXBlb2Ygc3RyKTtcbiAgICB9XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICB2YXIgZW5kID0gc3RyLmxlbmd0aCAtIDE7XG5cbiAgICAvL1RyaW0gbGVhZGluZyBhbmQgdHJhaWxpbmcgd3NcbiAgICB3aGlsZSAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpIDw9IDB4MjAgLyonICcqLykgc3RhcnQrKztcbiAgICB3aGlsZSAoc3RyLmNoYXJDb2RlQXQoZW5kKSA8PSAweDIwIC8qJyAnKi8pIGVuZC0tO1xuXG4gICAgc3RhcnQgPSB0aGlzLl9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCk7XG5cbiAgICAvL0phdmFzY3JpcHQgZG9lc24ndCBoYXZlIGhvc3RcbiAgICBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgIHN0YXJ0ID0gdGhpcy5fcGFyc2VIb3N0KHN0ciwgc3RhcnQsIGVuZCwgaG9zdERlbm90ZXNTbGFzaCk7XG4gICAgICAgIHZhciBwcm90byA9IHRoaXMuX3Byb3RvY29sO1xuICAgICAgICBpZiAoIXRoaXMuaG9zdG5hbWUgJiZcbiAgICAgICAgICAgICh0aGlzLnNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaFByb3RvY29sc1twcm90b10pKSkge1xuICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPD0gZW5kKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KHN0YXJ0KTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDIzIC8qJyMnKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlSGFzaChzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuX3Byb3RvY29sICE9PSBcImphdmFzY3JpcHRcIikge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7IC8vRm9yIGphdmFzY3JpcHQgdGhlIHBhdGhuYW1lIGlzIGp1c3QgdGhlIHJlc3Qgb2YgaXRcbiAgICAgICAgICAgIHRoaXMucGF0aG5hbWUgPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEgKTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBhdGhuYW1lICYmIHRoaXMuaG9zdG5hbWUgJiZcbiAgICAgICAgdGhpcy5fc2xhc2hQcm90b2NvbHNbdGhpcy5fcHJvdG9jb2xdKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICB9XG5cbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgICAgIGlmIChzZWFyY2ggPT0gbnVsbCkge1xuICAgICAgICAgICAgc2VhcmNoID0gdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guY2hhckNvZGVBdCgwKSA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSBzZWFyY2guc2xpY2UoMSk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNhbGxzIGEgc2V0dGVyIGZ1bmN0aW9uLCB0aGVyZSBpcyBubyAucXVlcnkgZGF0YSBwcm9wZXJ0eVxuICAgICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2Uoc2VhcmNoKTtcbiAgICB9XG59O1xuXG5VcmwucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkcmVzb2x2ZShyZWxhdGl2ZSkge1xuICAgIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QoVXJsLnBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuVXJsLnByb3RvdHlwZS5mb3JtYXQgPSBmdW5jdGlvbiBVcmwkZm9ybWF0KCkge1xuICAgIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8IFwiXCI7XG5cbiAgICBpZiAoYXV0aCkge1xuICAgICAgICBhdXRoID0gZW5jb2RlVVJJQ29tcG9uZW50KGF1dGgpO1xuICAgICAgICBhdXRoID0gYXV0aC5yZXBsYWNlKC8lM0EvaSwgXCI6XCIpO1xuICAgICAgICBhdXRoICs9IFwiQFwiO1xuICAgIH1cblxuICAgIHZhciBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgXCJcIjtcbiAgICB2YXIgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgdmFyIGhhc2ggPSB0aGlzLmhhc2ggfHwgXCJcIjtcbiAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgXCJcIjtcbiAgICB2YXIgcXVlcnkgPSBcIlwiO1xuICAgIHZhciBob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgcG9ydCA9IHRoaXMucG9ydCB8fCBcIlwiO1xuICAgIHZhciBob3N0ID0gZmFsc2U7XG4gICAgdmFyIHNjaGVtZSA9IFwiXCI7XG5cbiAgICAvL0NhY2hlIHRoZSByZXN1bHQgb2YgdGhlIGdldHRlciBmdW5jdGlvblxuICAgIHZhciBxID0gdGhpcy5xdWVyeTtcbiAgICBpZiAocSAmJiB0eXBlb2YgcSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeShxKTtcbiAgICB9XG5cbiAgICBpZiAoIXNlYXJjaCkge1xuICAgICAgICBzZWFyY2ggPSBxdWVyeSA/IFwiP1wiICsgcXVlcnkgOiBcIlwiO1xuICAgIH1cblxuICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5jaGFyQ29kZUF0KHByb3RvY29sLmxlbmd0aCAtIDEpICE9PSAweDNBIC8qJzonKi8pXG4gICAgICAgIHByb3RvY29sICs9IFwiOlwiO1xuXG4gICAgaWYgKHRoaXMuaG9zdCkge1xuICAgICAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgICB9XG4gICAgZWxzZSBpZiAoaG9zdG5hbWUpIHtcbiAgICAgICAgdmFyIGlwNiA9IGhvc3RuYW1lLmluZGV4T2YoXCI6XCIpID4gLTE7XG4gICAgICAgIGlmIChpcDYpIGhvc3RuYW1lID0gXCJbXCIgKyBob3N0bmFtZSArIFwiXVwiO1xuICAgICAgICBob3N0ID0gYXV0aCArIGhvc3RuYW1lICsgKHBvcnQgPyBcIjpcIiArIHBvcnQgOiBcIlwiKTtcbiAgICB9XG5cbiAgICB2YXIgc2xhc2hlcyA9IHRoaXMuc2xhc2hlcyB8fFxuICAgICAgICAoKCFwcm90b2NvbCB8fFxuICAgICAgICBzbGFzaFByb3RvY29sc1twcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKTtcblxuXG4gICAgaWYgKHByb3RvY29sKSBzY2hlbWUgPSBwcm90b2NvbCArIChzbGFzaGVzID8gXCIvL1wiIDogXCJcIik7XG4gICAgZWxzZSBpZiAoc2xhc2hlcykgc2NoZW1lID0gXCIvL1wiO1xuXG4gICAgaWYgKHNsYXNoZXMgJiYgcGF0aG5hbWUgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCgwKSAhPT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgIHBhdGhuYW1lID0gXCIvXCIgKyBwYXRobmFtZTtcbiAgICB9XG4gICAgZWxzZSBpZiAoIXNsYXNoZXMgJiYgcGF0aG5hbWUgPT09IFwiL1wiKSB7XG4gICAgICAgIHBhdGhuYW1lID0gXCJcIjtcbiAgICB9XG4gICAgaWYgKHNlYXJjaCAmJiBzZWFyY2guY2hhckNvZGVBdCgwKSAhPT0gMHgzRiAvKic/JyovKVxuICAgICAgICBzZWFyY2ggPSBcIj9cIiArIHNlYXJjaDtcbiAgICBpZiAoaGFzaCAmJiBoYXNoLmNoYXJDb2RlQXQoMCkgIT09IDB4MjMgLyonIycqLylcbiAgICAgICAgaGFzaCA9IFwiI1wiICsgaGFzaDtcblxuICAgIHBhdGhuYW1lID0gZXNjYXBlUGF0aE5hbWUocGF0aG5hbWUpO1xuICAgIHNlYXJjaCA9IGVzY2FwZVNlYXJjaChzZWFyY2gpO1xuXG4gICAgcmV0dXJuIHNjaGVtZSArIChob3N0ID09PSBmYWxzZSA/IFwiXCIgOiBob3N0KSArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlT2JqZWN0KHJlbGF0aXZlKSB7XG4gICAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gXCJzdHJpbmdcIilcbiAgICAgICAgcmVsYXRpdmUgPSBVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcblxuICAgIHZhciByZXN1bHQgPSB0aGlzLl9jbG9uZSgpO1xuXG4gICAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gICAgLy8gZXZlbiBocmVmPVwiXCIgd2lsbCByZW1vdmUgaXQuXG4gICAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gICAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZVwicyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgICBpZiAoIXJlbGF0aXZlLmhyZWYpIHtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBocmVmcyBsaWtlIC8vZm9vL2JhciBhbHdheXMgY3V0IHRvIHRoZSBwcm90b2NvbC5cbiAgICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIHRydWUpO1xuXG4gICAgICAgIGlmIChzbGFzaFByb3RvY29sc1tyZXN1bHQuX3Byb3RvY29sXSAmJlxuICAgICAgICAgICAgcmVzdWx0Lmhvc3RuYW1lICYmICFyZXN1bHQucGF0aG5hbWUpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKHJlbGF0aXZlLl9wcm90b2NvbCAmJiByZWxhdGl2ZS5fcHJvdG9jb2wgIT09IHJlc3VsdC5fcHJvdG9jb2wpIHtcbiAgICAgICAgLy8gaWYgaXRcInMgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAgICAgLy8gdGhlIHByb3RvY29sIGRvZXMgd2VpcmQgdGhpbmdzXG4gICAgICAgIC8vIGZpcnN0LCBpZiBpdFwicyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAgICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAgICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgICAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgICAgICAvLyBiZWNhdXNlIHRoYXRcInMga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICAgICAgaWYgKCFzbGFzaFByb3RvY29sc1tyZWxhdGl2ZS5fcHJvdG9jb2xdKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5fY29weVByb3BzVG8ocmVzdWx0LCBmYWxzZSk7XG4gICAgICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdC5fcHJvdG9jb2wgPSByZWxhdGl2ZS5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCAmJiByZWxhdGl2ZS5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCBcIlwiKS5zcGxpdChcIi9cIik7XG4gICAgICAgICAgICB3aGlsZSAocmVsUGF0aC5sZW5ndGggJiYgIShyZWxhdGl2ZS5ob3N0ID0gcmVsUGF0aC5zaGlmdCgpKSk7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHJlbGF0aXZlLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGhbMF0gIT09IFwiXCIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbihcIi9cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCBcIlwiO1xuICAgICAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IHJlbGF0aXZlLl9wb3J0O1xuICAgICAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgdmFyIGlzU291cmNlQWJzID1cbiAgICAgICAgKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcbiAgICB2YXIgaXNSZWxBYnMgPSAoXG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IHx8XG4gICAgICAgICAgICAocmVsYXRpdmUucGF0aG5hbWUgJiZcbiAgICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDB4MkYgLyonLycqLylcbiAgICAgICAgKTtcbiAgICB2YXIgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKSk7XG5cbiAgICB2YXIgcmVtb3ZlQWxsRG90cyA9IG11c3RFbmRBYnM7XG5cbiAgICB2YXIgc3JjUGF0aCA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoXCIvXCIpIHx8IFtdO1xuICAgIHZhciByZWxQYXRoID0gcmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoXCIvXCIpIHx8IFtdO1xuICAgIHZhciBwc3ljaG90aWMgPSByZXN1bHQuX3Byb3RvY29sICYmICFzbGFzaFByb3RvY29sc1tyZXN1bHQuX3Byb3RvY29sXTtcblxuICAgIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gICAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAgIC8vIHJlc3VsdC5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gICAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICByZXN1bHQuX3BvcnQgPSAtMTtcbiAgICAgICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICAgICAgICBpZiAoc3JjUGF0aFswXSA9PT0gXCJcIikgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gXCJcIjtcbiAgICAgICAgaWYgKHJlbGF0aXZlLl9wcm90b2NvbCkge1xuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgcmVsYXRpdmUuX3BvcnQgPSAtMTtcbiAgICAgICAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09IFwiXCIpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICAgICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09IFwiXCIgfHwgc3JjUGF0aFswXSA9PT0gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKGlzUmVsQWJzKSB7XG4gICAgICAgIC8vIGl0XCJzIGFic29sdXRlLlxuICAgICAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgP1xuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICAgIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gaXRcInMgcmVsYXRpdmVcbiAgICAgICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgICAgICBzcmNQYXRoLnBvcCgpO1xuICAgICAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgfSBlbHNlIGlmIChyZWxhdGl2ZS5zZWFyY2gpIHtcbiAgICAgICAgLy8ganVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgICAgICAvLyBsaWtlIGhyZWY9XCI/Zm9vXCIuXG4gICAgICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgICAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgICAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgICAgICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwID9cbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdChcIkBcIikgOiBmYWxzZTtcbiAgICAgICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAgICAgLy8gd2VcInZlIGFscmVhZHkgaGFuZGxlZCB0aGUgb3RoZXIgc3R1ZmYgYWJvdmUuXG4gICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gICAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gICAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICAgIHZhciBoYXNUcmFpbGluZ1NsYXNoID0gKFxuICAgICAgICAocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCkgJiYgKGxhc3QgPT09IFwiLlwiIHx8IGxhc3QgPT09IFwiLi5cIikgfHxcbiAgICAgICAgbGFzdCA9PT0gXCJcIik7XG5cbiAgICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gICAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgICB2YXIgdXAgPSAwO1xuICAgIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgICAgIGlmIChsYXN0ID09IFwiLlwiKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgfSBlbHNlIGlmIChsYXN0ID09PSBcIi4uXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgdXArKztcbiAgICAgICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cC0tO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICAgIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgICAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgICAgICAgIHNyY1BhdGgudW5zaGlmdChcIi4uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gXCJcIiAmJlxuICAgICAgICAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiAoc3JjUGF0aC5qb2luKFwiL1wiKS5zdWJzdHIoLTEpICE9PSBcIi9cIikpIHtcbiAgICAgICAgc3JjUGF0aC5wdXNoKFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBpc0Fic29sdXRlID0gc3JjUGF0aFswXSA9PT0gXCJcIiB8fFxuICAgICAgICAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgPT09IDB4MkYgLyonLycqLyk7XG5cbiAgICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBpc0Fic29sdXRlID8gXCJcIiA6XG4gICAgICAgICAgICBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6IFwiXCI7XG4gICAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgLy91cmwucmVzb2x2ZU9iamVjdChcIm1haWx0bzpsb2NhbDFAZG9tYWluMVwiLCBcImxvY2FsMkBkb21haW4yXCIpXG4gICAgICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwID9cbiAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgICAgICBzcmNQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgfVxuXG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5sZW5ndGggPT09IDAgPyBudWxsIDogc3JjUGF0aC5qb2luKFwiL1wiKTtcbiAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGggfHwgcmVzdWx0LmF1dGg7XG4gICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBwdW55Y29kZSA9IHJlcXVpcmUoXCJwdW55Y29kZVwiKTtcblVybC5wcm90b3R5cGUuX2hvc3RJZG5hID0gZnVuY3Rpb24gVXJsJF9ob3N0SWRuYShob3N0bmFtZSkge1xuICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnkgY29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHRoZSBwYXJ0IG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgLy8gaGFzIG5vbiBBU0NJSSBjaGFyYWN0ZXJzLiBJLmUuIGl0IGRvc2VudCBtYXR0ZXIgaWZcbiAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBpbiBBU0NJSS5cbiAgICB2YXIgZG9tYWluQXJyYXkgPSBob3N0bmFtZS5zcGxpdChcIi5cIik7XG4gICAgdmFyIG5ld091dCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZG9tYWluQXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIHMgPSBkb21haW5BcnJheVtpXTtcbiAgICAgICAgbmV3T3V0LnB1c2gocy5tYXRjaCgvW15BLVphLXowLTlfLV0vKSA/XG4gICAgICAgICAgICBcInhuLS1cIiArIHB1bnljb2RlLmVuY29kZShzKSA6IHMpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3T3V0LmpvaW4oXCIuXCIpO1xufTtcblxudmFyIGVzY2FwZVBhdGhOYW1lID0gVXJsLnByb3RvdHlwZS5fZXNjYXBlUGF0aE5hbWUgPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVQYXRoTmFtZShwYXRobmFtZSkge1xuICAgIGlmICghY29udGFpbnNDaGFyYWN0ZXIyKHBhdGhuYW1lLCAweDIzIC8qJyMnKi8sIDB4M0YgLyonPycqLykpIHtcbiAgICAgICAgcmV0dXJuIHBhdGhuYW1lO1xuICAgIH1cbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlUGF0aChwYXRobmFtZSk7XG59O1xuXG52YXIgZXNjYXBlU2VhcmNoID0gVXJsLnByb3RvdHlwZS5fZXNjYXBlU2VhcmNoID1cbmZ1bmN0aW9uIFVybCRfZXNjYXBlU2VhcmNoKHNlYXJjaCkge1xuICAgIGlmICghY29udGFpbnNDaGFyYWN0ZXIyKHNlYXJjaCwgMHgyMyAvKicjJyovLCAtMSkpIHJldHVybiBzZWFyY2g7XG4gICAgLy9Bdm9pZCBjbG9zdXJlIGNyZWF0aW9uIHRvIGtlZXAgdGhpcyBpbmxpbmFibGVcbiAgICByZXR1cm4gX2VzY2FwZVNlYXJjaChzZWFyY2gpO1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQcm90b2NvbCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQcm90b2NvbChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgZG9Mb3dlckNhc2UgPSBmYWxzZTtcbiAgICB2YXIgcHJvdG9jb2xDaGFyYWN0ZXJzID0gdGhpcy5fcHJvdG9jb2xDaGFyYWN0ZXJzO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICB2YXIgcHJvdG9jb2wgPSBzdHIuc2xpY2Uoc3RhcnQsIGkpO1xuICAgICAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBwcm90b2NvbCA9IHByb3RvY29sLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHByb3RvY29sO1xuICAgICAgICAgICAgcmV0dXJuIGkgKyAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHByb3RvY29sQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGlmIChjaCA8IDB4NjEgLyonYScqLylcbiAgICAgICAgICAgICAgICBkb0xvd2VyQ2FzZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgIH1cblxuICAgIH1cbiAgICByZXR1cm4gc3RhcnQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUF1dGggPSBmdW5jdGlvbiBVcmwkX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBlbmQsIGRlY29kZSkge1xuICAgIHZhciBhdXRoID0gc3RyLnNsaWNlKHN0YXJ0LCBlbmQgKyAxKTtcbiAgICBpZiAoZGVjb2RlKSB7XG4gICAgICAgIGF1dGggPSBkZWNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgfVxuICAgIHRoaXMuYXV0aCA9IGF1dGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVBvcnQgPSBmdW5jdGlvbiBVcmwkX3BhcnNlUG9ydChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICAvL0ludGVybmFsIGZvcm1hdCBpcyBpbnRlZ2VyIGZvciBtb3JlIGVmZmljaWVudCBwYXJzaW5nXG4gICAgLy9hbmQgZm9yIGVmZmljaWVudCB0cmltbWluZyBvZiBsZWFkaW5nIHplcm9zXG4gICAgdmFyIHBvcnQgPSAwO1xuICAgIC8vRGlzdGluZ3Vpc2ggYmV0d2VlbiA6MCBhbmQgOiAobm8gcG9ydCBudW1iZXIgYXQgYWxsKVxuICAgIHZhciBoYWRDaGFycyA9IGZhbHNlO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmICgweDMwIC8qJzAnKi8gPD0gY2ggJiYgY2ggPD0gMHgzOSAvKic5JyovKSB7XG4gICAgICAgICAgICBwb3J0ID0gKDEwICogcG9ydCkgKyAoY2ggLSAweDMwIC8qJzAnKi8pO1xuICAgICAgICAgICAgaGFkQ2hhcnMgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgYnJlYWs7XG5cbiAgICB9XG4gICAgaWYgKHBvcnQgPT09IDAgJiYgIWhhZENoYXJzKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIHRoaXMuX3BvcnQgPSBwb3J0O1xuICAgIHJldHVybiBpIC0gc3RhcnQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUhvc3QgPVxuZnVuY3Rpb24gVXJsJF9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICAgIHZhciBob3N0RW5kaW5nQ2hhcmFjdGVycyA9IHRoaXMuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzO1xuICAgIGlmIChzdHIuY2hhckNvZGVBdChzdGFydCkgPT09IDB4MkYgLyonLycqLyAmJlxuICAgICAgICBzdHIuY2hhckNvZGVBdChzdGFydCArIDEpID09PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcblxuICAgICAgICAvL1RoZSBzdHJpbmcgc3RhcnRzIHdpdGggLy9cbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSB7XG4gICAgICAgICAgICAvL1RoZSBzdHJpbmcgaXMganVzdCBcIi8vXCJcbiAgICAgICAgICAgIGlmIChlbmQgPCAyKSByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAvL0lmIHNsYXNoZXMgZG8gbm90IGRlbm90ZSBob3N0IGFuZCB0aGVyZSBpcyBubyBhdXRoLFxuICAgICAgICAgICAgLy90aGVyZSBpcyBubyBob3N0IHdoZW4gdGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICAgICAgdmFyIGhhc0F1dGggPVxuICAgICAgICAgICAgICAgIGNvbnRhaW5zQ2hhcmFjdGVyKHN0ciwgMHg0MCAvKidAJyovLCAyLCBob3N0RW5kaW5nQ2hhcmFjdGVycyk7XG4gICAgICAgICAgICBpZiAoIWhhc0F1dGggJiYgIXNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGVyZSBpcyBhIGhvc3QgdGhhdCBzdGFydHMgYWZ0ZXIgdGhlIC8vXG4gICAgICAgIHN0YXJ0ICs9IDI7XG4gICAgfVxuICAgIC8vSWYgdGhlcmUgaXMgbm8gc2xhc2hlcywgdGhlcmUgaXMgbm8gaG9zdG5hbWUgaWZcbiAgICAvLzEuIHRoZXJlIHdhcyBubyBwcm90b2NvbCBhdCBhbGxcbiAgICBlbHNlIGlmICghdGhpcy5fcHJvdG9jb2wgfHxcbiAgICAgICAgLy8yLiB0aGVyZSB3YXMgYSBwcm90b2NvbCB0aGF0IHJlcXVpcmVzIHNsYXNoZXNcbiAgICAgICAgLy9lLmcuIGluICdodHRwOmFzZCcgJ2FzZCcgaXMgbm90IGEgaG9zdG5hbWVcbiAgICAgICAgc2xhc2hQcm90b2NvbHNbdGhpcy5fcHJvdG9jb2xdXG4gICAgKSB7XG4gICAgICAgIHJldHVybiBzdGFydDtcbiAgICB9XG5cbiAgICB2YXIgZG9Mb3dlckNhc2UgPSBmYWxzZTtcbiAgICB2YXIgaWRuYSA9IGZhbHNlO1xuICAgIHZhciBob3N0TmFtZVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIGhvc3ROYW1lRW5kID0gZW5kO1xuICAgIHZhciBsYXN0Q2ggPSAtMTtcbiAgICB2YXIgcG9ydExlbmd0aCA9IDA7XG4gICAgdmFyIGNoYXJzQWZ0ZXJEb3QgPSAwO1xuICAgIHZhciBhdXRoTmVlZHNEZWNvZGluZyA9IGZhbHNlO1xuXG4gICAgdmFyIGogPSAtMTtcblxuICAgIC8vRmluZCB0aGUgbGFzdCBvY2N1cnJlbmNlIG9mIGFuIEAtc2lnbiB1bnRpbCBob3N0ZW5kaW5nIGNoYXJhY3RlciBpcyBtZXRcbiAgICAvL2Fsc28gbWFyayBpZiBkZWNvZGluZyBpcyBuZWVkZWQgZm9yIHRoZSBhdXRoIHBvcnRpb25cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDQwIC8qJ0AnKi8pIHtcbiAgICAgICAgICAgIGogPSBpO1xuICAgICAgICB9XG4gICAgICAgIC8vVGhpcyBjaGVjayBpcyB2ZXJ5LCB2ZXJ5IGNoZWFwLiBVbm5lZWRlZCBkZWNvZGVVUklDb21wb25lbnQgaXMgdmVyeVxuICAgICAgICAvL3ZlcnkgZXhwZW5zaXZlXG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDI1IC8qJyUnKi8pIHtcbiAgICAgICAgICAgIGF1dGhOZWVkc0RlY29kaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy9ALXNpZ24gd2FzIGZvdW5kIGF0IGluZGV4IGosIGV2ZXJ5dGhpbmcgdG8gdGhlIGxlZnQgZnJvbSBpdFxuICAgIC8vaXMgYXV0aCBwYXJ0XG4gICAgaWYgKGogPiAtMSkge1xuICAgICAgICB0aGlzLl9wYXJzZUF1dGgoc3RyLCBzdGFydCwgaiAtIDEsIGF1dGhOZWVkc0RlY29kaW5nKTtcbiAgICAgICAgLy9ob3N0bmFtZSBzdGFydHMgYWZ0ZXIgdGhlIGxhc3QgQC1zaWduXG4gICAgICAgIHN0YXJ0ID0gaG9zdE5hbWVTdGFydCA9IGogKyAxO1xuICAgIH1cblxuICAgIC8vSG9zdCBuYW1lIGlzIHN0YXJ0aW5nIHdpdGggYSBbXG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHg1QiAvKidbJyovKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBzdGFydCArIDE7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgICAgICAvL0Fzc3VtZSB2YWxpZCBJUDYgaXMgYmV0d2VlbiB0aGUgYnJhY2tldHNcbiAgICAgICAgICAgIGlmIChjaCA9PT0gMHg1RCAvKiddJyovKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0ci5jaGFyQ29kZUF0KGkgKyAxKSA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICAgICAgICAgIHBvcnRMZW5ndGggPSB0aGlzLl9wYXJzZVBvcnQoc3RyLCBpICsgMiwgZW5kKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBob3N0bmFtZSA9IHN0ci5zbGljZShzdGFydCArIDEsIGkpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICAgICAgICAgIHRoaXMuaG9zdCA9IHRoaXMuX3BvcnQgPiAwXG4gICAgICAgICAgICAgICAgICAgID8gXCJbXCIgKyBob3N0bmFtZSArIFwiXTpcIiArIHRoaXMuX3BvcnRcbiAgICAgICAgICAgICAgICAgICAgOiBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgICAgICAgICAgIHJldHVybiBpICsgcG9ydExlbmd0aCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9FbXB0eSBob3N0bmFtZSwgWyBzdGFydHMgYSBwYXRoXG4gICAgICAgIHJldHVybiBzdGFydDtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgaWYgKGNoYXJzQWZ0ZXJEb3QgPiA2Mikge1xuICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAxLCBlbmQpICsgMTtcbiAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA8IDB4NjEgLyonYScqLykge1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDJFIC8qJy4nKi8pIHtcbiAgICAgICAgICAgICAgICAvL05vZGUuanMgaWdub3JlcyB0aGlzIGVycm9yXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICBpZiAobGFzdENoID09PSBET1QgfHwgbGFzdENoID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNoYXJzQWZ0ZXJEb3QgPSAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKDB4NDEgLyonQScqLyA8PSBjaCAmJiBjaCA8PSAweDVBIC8qJ1onKi8pIHtcbiAgICAgICAgICAgICAgICBkb0xvd2VyQ2FzZSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICghKGNoID09PSAweDJEIC8qJy0nKi8gfHwgY2ggPT09IDB4NUYgLyonXycqLyB8fFxuICAgICAgICAgICAgICAgICgweDMwIC8qJzAnKi8gPD0gY2ggJiYgY2ggPD0gMHgzOSAvKic5JyovKSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaG9zdEVuZGluZ0NoYXJhY3RlcnNbY2hdID09PSAwICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX25vUHJlcGVuZFNsYXNoSG9zdEVuZGVyc1tjaF0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA+PSAweDdCIC8qJ3snKi8pIHtcbiAgICAgICAgICAgIGlmIChjaCA8PSAweDdFIC8qJ34nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWRuYSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdENoID0gY2g7XG4gICAgICAgIGNoYXJzQWZ0ZXJEb3QrKztcbiAgICB9XG5cbiAgICAvL05vZGUuanMgaWdub3JlcyB0aGlzIGVycm9yXG4gICAgLypcbiAgICBpZiAobGFzdENoID09PSBET1QpIHtcbiAgICAgICAgaG9zdE5hbWVFbmQtLTtcbiAgICB9XG4gICAgKi9cblxuICAgIGlmIChob3N0TmFtZUVuZCArIDEgIT09IHN0YXJ0ICYmXG4gICAgICAgIGhvc3ROYW1lRW5kIC0gaG9zdE5hbWVTdGFydCA8PSAyNTYpIHtcbiAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKGhvc3ROYW1lU3RhcnQsIGhvc3ROYW1lRW5kICsgMSk7XG4gICAgICAgIGlmIChkb0xvd2VyQ2FzZSkgaG9zdG5hbWUgPSBob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAoaWRuYSkgaG9zdG5hbWUgPSB0aGlzLl9ob3N0SWRuYShob3N0bmFtZSk7XG4gICAgICAgIHRoaXMuaG9zdG5hbWUgPSBob3N0bmFtZTtcbiAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDAgPyBob3N0bmFtZSArIFwiOlwiICsgdGhpcy5fcG9ydCA6IGhvc3RuYW1lO1xuICAgIH1cblxuICAgIHJldHVybiBob3N0TmFtZUVuZCArIDEgKyBwb3J0TGVuZ3RoO1xuXG59O1xuXG5VcmwucHJvdG90eXBlLl9jb3B5UHJvcHNUbyA9IGZ1bmN0aW9uIFVybCRfY29weVByb3BzVG8oaW5wdXQsIG5vUHJvdG9jb2wpIHtcbiAgICBpZiAoIW5vUHJvdG9jb2wpIHtcbiAgICAgICAgaW5wdXQuX3Byb3RvY29sID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgfVxuICAgIGlucHV0Ll9ocmVmID0gdGhpcy5faHJlZjtcbiAgICBpbnB1dC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgaW5wdXQuX3ByZXBlbmRTbGFzaCA9IHRoaXMuX3ByZXBlbmRTbGFzaDtcbiAgICBpbnB1dC5hdXRoID0gdGhpcy5hdXRoO1xuICAgIGlucHV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgaW5wdXQuaG9zdCA9IHRoaXMuaG9zdDtcbiAgICBpbnB1dC5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG4gICAgaW5wdXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICBpbnB1dC5zZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICBpbnB1dC5wYXRobmFtZSA9IHRoaXMucGF0aG5hbWU7XG59O1xuXG5VcmwucHJvdG90eXBlLl9jbG9uZSA9IGZ1bmN0aW9uIFVybCRfY2xvbmUoKSB7XG4gICAgdmFyIHJldCA9IG5ldyBVcmwoKTtcbiAgICByZXQuX3Byb3RvY29sID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgcmV0Ll9ocmVmID0gdGhpcy5faHJlZjtcbiAgICByZXQuX3BvcnQgPSB0aGlzLl9wb3J0O1xuICAgIHJldC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIHJldC5hdXRoID0gdGhpcy5hdXRoO1xuICAgIHJldC5zbGFzaGVzID0gdGhpcy5zbGFzaGVzO1xuICAgIHJldC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIHJldC5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG4gICAgcmV0Lmhhc2ggPSB0aGlzLmhhc2g7XG4gICAgcmV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIHJldC5wYXRobmFtZSA9IHRoaXMucGF0aG5hbWU7XG4gICAgcmV0dXJuIHJldDtcbn07XG5cblVybC5wcm90b3R5cGUuX2dldENvbXBvbmVudEVzY2FwZWQgPVxuZnVuY3Rpb24gVXJsJF9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBjdXIgPSBzdGFydDtcbiAgICB2YXIgaSA9IHN0YXJ0O1xuICAgIHZhciByZXQgPSBcIlwiO1xuICAgIHZhciBhdXRvRXNjYXBlTWFwID0gdGhpcy5fYXV0b0VzY2FwZU1hcDtcbiAgICBmb3IgKDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgICAgdmFyIGVzY2FwZWQgPSBhdXRvRXNjYXBlTWFwW2NoXTtcblxuICAgICAgICBpZiAoZXNjYXBlZCAhPT0gXCJcIikge1xuICAgICAgICAgICAgaWYgKGN1ciA8IGkpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICAgICAgICAgIHJldCArPSBlc2NhcGVkO1xuICAgICAgICAgICAgY3VyID0gaSArIDE7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGN1ciA8IGkgKyAxKSByZXQgKz0gc3RyLnNsaWNlKGN1ciwgaSk7XG4gICAgcmV0dXJuIHJldDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUGF0aCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlUGF0aChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgcGF0aFN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHBhdGhFbmQgPSBlbmQ7XG4gICAgdmFyIGVzY2FwZSA9IGZhbHNlO1xuICAgIHZhciBhdXRvRXNjYXBlQ2hhcmFjdGVycyA9IHRoaXMuX2F1dG9Fc2NhcGVDaGFyYWN0ZXJzO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHBhdGhFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlUXVlcnkoc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWVzY2FwZSAmJiBhdXRvRXNjYXBlQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocGF0aFN0YXJ0ID4gcGF0aEVuZCkge1xuICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgcGF0aDtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHBhdGggPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcGF0aFN0YXJ0LCBwYXRoRW5kKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHBhdGggPSBzdHIuc2xpY2UocGF0aFN0YXJ0LCBwYXRoRW5kICsgMSk7XG4gICAgfVxuICAgIHRoaXMucGF0aG5hbWUgPSB0aGlzLl9wcmVwZW5kU2xhc2ggPyBcIi9cIiArIHBhdGggOiBwYXRoO1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VRdWVyeSA9IGZ1bmN0aW9uIFVybCRfcGFyc2VRdWVyeShzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgcXVlcnlTdGFydCA9IHN0YXJ0O1xuICAgIHZhciBxdWVyeUVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDIzIC8qJyMnKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlSGFzaChzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBxdWVyeUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWVzY2FwZSAmJiBhdXRvRXNjYXBlQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocXVlcnlTdGFydCA+IHF1ZXJ5RW5kKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gXCJcIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBxdWVyeTtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHF1ZXJ5ID0gdGhpcy5fZ2V0Q29tcG9uZW50RXNjYXBlZChzdHIsIHF1ZXJ5U3RhcnQsIHF1ZXJ5RW5kKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0gc3RyLnNsaWNlKHF1ZXJ5U3RhcnQsIHF1ZXJ5RW5kICsgMSk7XG4gICAgfVxuICAgIHRoaXMuc2VhcmNoID0gcXVlcnk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUhhc2ggPSBmdW5jdGlvbiBVcmwkX3BhcnNlSGFzaChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICBpZiAoc3RhcnQgPiBlbmQpIHtcbiAgICAgICAgdGhpcy5oYXNoID0gXCJcIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmhhc2ggPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgc3RhcnQsIGVuZCk7XG59O1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwb3J0XCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fcG9ydCA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gKFwiXCIgKyB0aGlzLl9wb3J0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodiA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLl9wb3J0ID0gLTE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9wb3J0ID0gcGFyc2VJbnQodiwgMTApO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInF1ZXJ5XCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcXVlcnkgPSB0aGlzLl9xdWVyeTtcbiAgICAgICAgaWYgKHF1ZXJ5ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBxdWVyeTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2g7XG5cbiAgICAgICAgaWYgKHNlYXJjaCkge1xuICAgICAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgICAgICBzZWFyY2ggPSBzZWFyY2guc2xpY2UoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2VhcmNoICE9PSBcIlwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcXVlcnkgPSBzZWFyY2g7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlYXJjaDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHRoaXMuX3F1ZXJ5ID0gdjtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicGF0aFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHAgPSB0aGlzLnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgICAgIHZhciBzID0gdGhpcy5zZWFyY2ggfHwgXCJcIjtcbiAgICAgICAgaWYgKHAgfHwgcykge1xuICAgICAgICAgICAgcmV0dXJuIHAgKyBzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAocCA9PSBudWxsICYmIHMpID8gKFwiL1wiICsgcykgOiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbigpIHt9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicHJvdG9jb2xcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBwcm90byA9IHRoaXMuX3Byb3RvY29sO1xuICAgICAgICByZXR1cm4gcHJvdG8gPyBwcm90byArIFwiOlwiIDogcHJvdG87XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB2YXIgZW5kID0gdi5sZW5ndGggLSAxO1xuICAgICAgICAgICAgaWYgKHYuY2hhckNvZGVBdChlbmQpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHYuc2xpY2UoMCwgZW5kKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJocmVmXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgaHJlZiA9IHRoaXMuX2hyZWY7XG4gICAgICAgIGlmICghaHJlZikge1xuICAgICAgICAgICAgaHJlZiA9IHRoaXMuX2hyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBocmVmO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHRoaXMuX2hyZWYgPSB2O1xuICAgIH1cbn0pO1xuXG5VcmwucGFyc2UgPSBmdW5jdGlvbiBVcmwkUGFyc2Uoc3RyLCBwYXJzZVF1ZXJ5U3RyaW5nLCBob3N0RGVub3Rlc1NsYXNoKSB7XG4gICAgaWYgKHN0ciBpbnN0YW5jZW9mIFVybCkgcmV0dXJuIHN0cjtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5wYXJzZShzdHIsICEhcGFyc2VRdWVyeVN0cmluZywgISFob3N0RGVub3Rlc1NsYXNoKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRGb3JtYXQob2JqKSB7XG4gICAgaWYgKHR5cGVvZiBvYmogPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgb2JqID0gVXJsLnBhcnNlKG9iaik7XG4gICAgfVxuICAgIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHtcbiAgICAgICAgcmV0dXJuIFVybC5wcm90b3R5cGUuZm9ybWF0LmNhbGwob2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iai5mb3JtYXQoKTtcbn07XG5cblVybC5yZXNvbHZlID0gZnVuY3Rpb24gVXJsJFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIHJldHVybiBVcmwucGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59O1xuXG5VcmwucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uIFVybCRSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICAgIHJldHVybiBVcmwucGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59O1xuXG5mdW5jdGlvbiBfZXNjYXBlUGF0aChwYXRobmFtZSkge1xuICAgIHJldHVybiBwYXRobmFtZS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBfZXNjYXBlU2VhcmNoKHNlYXJjaCkge1xuICAgIHJldHVybiBzZWFyY2gucmVwbGFjZSgvIy9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KG1hdGNoKTtcbiAgICB9KTtcbn1cblxuLy9TZWFyY2ggYGNoYXIxYCAoaW50ZWdlciBjb2RlIGZvciBhIGNoYXJhY3RlcikgaW4gYHN0cmluZ2Bcbi8vc3RhcnRpbmcgZnJvbSBgZnJvbUluZGV4YCBhbmQgZW5kaW5nIGF0IGBzdHJpbmcubGVuZ3RoIC0gMWBcbi8vb3Igd2hlbiBhIHN0b3AgY2hhcmFjdGVyIGlzIGZvdW5kXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcihzdHJpbmcsIGNoYXIxLCBmcm9tSW5kZXgsIHN0b3BDaGFyYWN0ZXJUYWJsZSkge1xuICAgIHZhciBsZW4gPSBzdHJpbmcubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSBmcm9tSW5kZXg7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHJpbmcuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IGNoYXIxKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdG9wQ2hhcmFjdGVyVGFibGVbY2hdID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vL1NlZSBpZiBgY2hhcjFgIG9yIGBjaGFyMmAgKGludGVnZXIgY29kZXMgZm9yIGNoYXJhY3RlcnMpXG4vL2lzIGNvbnRhaW5lZCBpbiBgc3RyaW5nYFxuZnVuY3Rpb24gY29udGFpbnNDaGFyYWN0ZXIyKHN0cmluZywgY2hhcjEsIGNoYXIyKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHJpbmcuY2hhckNvZGVBdChpKTtcbiAgICAgICAgaWYgKGNoID09PSBjaGFyMSB8fCBjaCA9PT0gY2hhcjIpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vTWFrZXMgYW4gYXJyYXkgb2YgMTI4IHVpbnQ4J3Mgd2hpY2ggcmVwcmVzZW50IGJvb2xlYW4gdmFsdWVzLlxuLy9TcGVjIGlzIGFuIGFycmF5IG9mIGFzY2lpIGNvZGUgcG9pbnRzIG9yIGFzY2lpIGNvZGUgcG9pbnQgcmFuZ2VzXG4vL3JhbmdlcyBhcmUgZXhwcmVzc2VkIGFzIFtzdGFydCwgZW5kXVxuXG4vL0NyZWF0ZSBhIHRhYmxlIHdpdGggdGhlIGNoYXJhY3RlcnMgMHgzMC0weDM5IChkZWNpbWFscyAnMCcgLSAnOScpIGFuZFxuLy8weDdBIChsb3dlcmNhc2VsZXR0ZXIgJ3onKSBhcyBgdHJ1ZWA6XG4vL1xuLy92YXIgYSA9IG1ha2VBc2NpaVRhYmxlKFtbMHgzMCwgMHgzOV0sIDB4N0FdKTtcbi8vYVsweDMwXTsgLy8xXG4vL2FbMHgxNV07IC8vMFxuLy9hWzB4MzVdOyAvLzFcbmZ1bmN0aW9uIG1ha2VBc2NpaVRhYmxlKHNwZWMpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVpbnQ4QXJyYXkoMTI4KTtcbiAgICBzcGVjLmZvckVhY2goZnVuY3Rpb24oaXRlbSl7XG4gICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgcmV0W2l0ZW1dID0gMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBzdGFydCA9IGl0ZW1bMF07XG4gICAgICAgICAgICB2YXIgZW5kID0gaXRlbVsxXTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydDsgaiA8PSBlbmQ7ICsraikge1xuICAgICAgICAgICAgICAgIHJldFtqXSA9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiByZXQ7XG59XG5cblxudmFyIGF1dG9Fc2NhcGUgPSBbXCI8XCIsIFwiPlwiLCBcIlxcXCJcIiwgXCJgXCIsIFwiIFwiLCBcIlxcclwiLCBcIlxcblwiLFxuICAgIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLCBcIl5cIiwgXCJgXCIsIFwiJ1wiXTtcblxudmFyIGF1dG9Fc2NhcGVNYXAgPSBuZXcgQXJyYXkoMTI4KTtcblxuXG5cbmZvciAodmFyIGkgPSAwLCBsZW4gPSBhdXRvRXNjYXBlTWFwLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgYXV0b0VzY2FwZU1hcFtpXSA9IFwiXCI7XG59XG5cbmZvciAodmFyIGkgPSAwLCBsZW4gPSBhdXRvRXNjYXBlLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIGMgPSBhdXRvRXNjYXBlW2ldO1xuICAgIHZhciBlc2MgPSBlbmNvZGVVUklDb21wb25lbnQoYyk7XG4gICAgaWYgKGVzYyA9PT0gYykge1xuICAgICAgICBlc2MgPSBlc2NhcGUoYyk7XG4gICAgfVxuICAgIGF1dG9Fc2NhcGVNYXBbYy5jaGFyQ29kZUF0KDApXSA9IGVzYztcbn1cblxuXG52YXIgc2xhc2hQcm90b2NvbHMgPSBVcmwucHJvdG90eXBlLl9zbGFzaFByb3RvY29scyA9IHtcbiAgICBodHRwOiB0cnVlLFxuICAgIGh0dHBzOiB0cnVlLFxuICAgIGdvcGhlcjogdHJ1ZSxcbiAgICBmaWxlOiB0cnVlLFxuICAgIGZ0cDogdHJ1ZSxcblxuICAgIFwiaHR0cDpcIjogdHJ1ZSxcbiAgICBcImh0dHBzOlwiOiB0cnVlLFxuICAgIFwiZ29waGVyOlwiOiB0cnVlLFxuICAgIFwiZmlsZTpcIjogdHJ1ZSxcbiAgICBcImZ0cDpcIjogdHJ1ZVxufTtcblxuLy9PcHRpbWl6ZSBiYWNrIGZyb20gbm9ybWFsaXplZCBvYmplY3QgY2F1c2VkIGJ5IG5vbi1pZGVudGlmaWVyIGtleXNcbmZ1bmN0aW9uIGYoKXt9XG5mLnByb3RvdHlwZSA9IHNsYXNoUHJvdG9jb2xzO1xuXG5VcmwucHJvdG90eXBlLl9wcm90b2NvbENoYXJhY3RlcnMgPSBtYWtlQXNjaWlUYWJsZShbXG4gICAgWzB4NjEgLyonYScqLywgMHg3QSAvKid6JyovXSxcbiAgICBbMHg0MSAvKidBJyovLCAweDVBIC8qJ1onKi9dLFxuICAgIDB4MkUgLyonLicqLywgMHgyQiAvKicrJyovLCAweDJEIC8qJy0nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9ob3N0RW5kaW5nQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICAweDIzIC8qJyMnKi8sIDB4M0YgLyonPycqLywgMHgyRiAvKicvJyovXG5dKTtcblxuVXJsLnByb3RvdHlwZS5fYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSBtYWtlQXNjaWlUYWJsZShcbiAgICBhdXRvRXNjYXBlLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cbi8vSWYgdGhlc2UgY2hhcmFjdGVycyBlbmQgYSBob3N0IG5hbWUsIHRoZSBwYXRoIHdpbGwgbm90IGJlIHByZXBlbmRlZCBhIC9cblVybC5wcm90b3R5cGUuX25vUHJlcGVuZFNsYXNoSG9zdEVuZGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIFtcbiAgICAgICAgXCI8XCIsIFwiPlwiLCBcIidcIiwgXCJgXCIsIFwiIFwiLCBcIlxcclwiLFxuICAgICAgICBcIlxcblwiLCBcIlxcdFwiLCBcIntcIiwgXCJ9XCIsIFwifFwiLCBcIlxcXFxcIixcbiAgICAgICAgXCJeXCIsIFwiYFwiLCBcIlxcXCJcIiwgXCIlXCIsIFwiO1wiXG4gICAgXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICByZXR1cm4gdi5jaGFyQ29kZUF0KDApO1xuICAgIH0pXG4pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlTWFwID0gYXV0b0VzY2FwZU1hcDtcblxubW9kdWxlLmV4cG9ydHMgPSBVcmw7XG5cblVybC5yZXBsYWNlID0gZnVuY3Rpb24gVXJsJFJlcGxhY2UoKSB7XG4gICAgcmVxdWlyZS5jYWNoZVtcInVybFwiXSA9IHtcbiAgICAgICAgZXhwb3J0czogVXJsXG4gICAgfTtcbn07XG4iLCJ2YXIgbm93ID0gcmVxdWlyZSgncGVyZm9ybWFuY2Utbm93JylcbiAgLCBnbG9iYWwgPSB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IHt9IDogd2luZG93XG4gICwgdmVuZG9ycyA9IFsnbW96JywgJ3dlYmtpdCddXG4gICwgc3VmZml4ID0gJ0FuaW1hdGlvbkZyYW1lJ1xuICAsIHJhZiA9IGdsb2JhbFsncmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgY2FmID0gZ2xvYmFsWydjYW5jZWwnICsgc3VmZml4XSB8fCBnbG9iYWxbJ2NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxuICAsIGlzTmF0aXZlID0gdHJ1ZVxuXG5mb3IodmFyIGkgPSAwOyBpIDwgdmVuZG9ycy5sZW5ndGggJiYgIXJhZjsgaSsrKSB7XG4gIHJhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ1JlcXVlc3QnICsgc3VmZml4XVxuICBjYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWwnICsgc3VmZml4XVxuICAgICAgfHwgZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICBpc05hdGl2ZSA9IGZhbHNlXG5cbiAgdmFyIGxhc3QgPSAwXG4gICAgLCBpZCA9IDBcbiAgICAsIHF1ZXVlID0gW11cbiAgICAsIGZyYW1lRHVyYXRpb24gPSAxMDAwIC8gNjBcblxuICByYWYgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGlmKHF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIF9ub3cgPSBub3coKVxuICAgICAgICAsIG5leHQgPSBNYXRoLm1heCgwLCBmcmFtZUR1cmF0aW9uIC0gKF9ub3cgLSBsYXN0KSlcbiAgICAgIGxhc3QgPSBuZXh0ICsgX25vd1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNwID0gcXVldWUuc2xpY2UoMClcbiAgICAgICAgLy8gQ2xlYXIgcXVldWUgaGVyZSB0byBwcmV2ZW50XG4gICAgICAgIC8vIGNhbGxiYWNrcyBmcm9tIGFwcGVuZGluZyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdG8gdGhlIGN1cnJlbnQgZnJhbWUncyBxdWV1ZVxuICAgICAgICBxdWV1ZS5sZW5ndGggPSAwXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmKCFjcFtpXS5jYW5jZWxsZWQpIHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgY3BbaV0uY2FsbGJhY2sobGFzdClcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LCBNYXRoLnJvdW5kKG5leHQpKVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHtcbiAgICAgIGhhbmRsZTogKytpZCxcbiAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgIGNhbmNlbGxlZDogZmFsc2VcbiAgICB9KVxuICAgIHJldHVybiBpZFxuICB9XG5cbiAgY2FmID0gZnVuY3Rpb24oaGFuZGxlKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZihxdWV1ZVtpXS5oYW5kbGUgPT09IGhhbmRsZSkge1xuICAgICAgICBxdWV1ZVtpXS5jYW5jZWxsZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gV3JhcCBpbiBhIG5ldyBmdW5jdGlvbiB0byBwcmV2ZW50XG4gIC8vIGBjYW5jZWxgIHBvdGVudGlhbGx5IGJlaW5nIGFzc2lnbmVkXG4gIC8vIHRvIHRoZSBuYXRpdmUgckFGIGZ1bmN0aW9uXG4gIGlmKCFpc05hdGl2ZSkge1xuICAgIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZuKVxuICB9XG4gIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZ1bmN0aW9uKCkge1xuICAgIHRyeXtcbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICB9XG4gIH0pXG59XG5tb2R1bGUuZXhwb3J0cy5jYW5jZWwgPSBmdW5jdGlvbigpIHtcbiAgY2FmLmFwcGx5KGdsb2JhbCwgYXJndW1lbnRzKVxufVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8vIEdlbmVyYXRlZCBieSBDb2ZmZWVTY3JpcHQgMS42LjNcbihmdW5jdGlvbigpIHtcbiAgdmFyIGdldE5hbm9TZWNvbmRzLCBocnRpbWUsIGxvYWRUaW1lO1xuXG4gIGlmICgodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHBlcmZvcm1hbmNlICE9PSBudWxsKSAmJiBwZXJmb3JtYW5jZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIH07XG4gIH0gZWxzZSBpZiAoKHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MgIT09IG51bGwpICYmIHByb2Nlc3MuaHJ0aW1lKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAoZ2V0TmFub1NlY29uZHMoKSAtIGxvYWRUaW1lKSAvIDFlNjtcbiAgICB9O1xuICAgIGhydGltZSA9IHByb2Nlc3MuaHJ0aW1lO1xuICAgIGdldE5hbm9TZWNvbmRzID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaHI7XG4gICAgICBociA9IGhydGltZSgpO1xuICAgICAgcmV0dXJuIGhyWzBdICogMWU5ICsgaHJbMV07XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IGdldE5hbm9TZWNvbmRzKCk7XG4gIH0gZWxzZSBpZiAoRGF0ZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIERhdGUubm93KCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgfSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9XG5cbn0pLmNhbGwodGhpcyk7XG5cbi8qXG4vL0Agc291cmNlTWFwcGluZ1VSTD1wZXJmb3JtYW5jZS1ub3cubWFwXG4qL1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIikpIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuIWZ1bmN0aW9uKGUpe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgZjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P2Y9d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/Zj1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihmPXNlbGYpLGYucm91dGVzPWUoKX19KGZ1bmN0aW9uKCl7dmFyIGRlZmluZSxtb2R1bGUsZXhwb3J0cztyZXR1cm4gKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoezE6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuXG52YXIgbG9jYWxSb3V0ZXMgPSBbXTtcblxuXG4vKipcbiAqIENvbnZlcnQgcGF0aCB0byByb3V0ZSBvYmplY3RcbiAqXG4gKiBBIHN0cmluZyBvciBSZWdFeHAgc2hvdWxkIGJlIHBhc3NlZCxcbiAqIHdpbGwgcmV0dXJuIHsgcmUsIHNyYywga2V5c30gb2JqXG4gKlxuICogQHBhcmFtICB7U3RyaW5nIC8gUmVnRXhwfSBwYXRoXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxudmFyIFJvdXRlID0gZnVuY3Rpb24ocGF0aCl7XG4gIC8vdXNpbmcgJ25ldycgaXMgb3B0aW9uYWxcblxuICB2YXIgc3JjLCByZSwga2V5cyA9IFtdO1xuXG4gIGlmKHBhdGggaW5zdGFuY2VvZiBSZWdFeHApe1xuICAgIHJlID0gcGF0aDtcbiAgICBzcmMgPSBwYXRoLnRvU3RyaW5nKCk7XG4gIH1lbHNle1xuICAgIHJlID0gcGF0aFRvUmVnRXhwKHBhdGgsIGtleXMpO1xuICAgIHNyYyA9IHBhdGg7XG4gIH1cblxuICByZXR1cm4ge1xuICBcdCByZTogcmUsXG4gIFx0IHNyYzogcGF0aC50b1N0cmluZygpLFxuICBcdCBrZXlzOiBrZXlzXG4gIH1cbn07XG5cbi8qKlxuICogTm9ybWFsaXplIHRoZSBnaXZlbiBwYXRoIHN0cmluZyxcbiAqIHJldHVybmluZyBhIHJlZ3VsYXIgZXhwcmVzc2lvbi5cbiAqXG4gKiBBbiBlbXB0eSBhcnJheSBzaG91bGQgYmUgcGFzc2VkLFxuICogd2hpY2ggd2lsbCBjb250YWluIHRoZSBwbGFjZWhvbGRlclxuICoga2V5IG5hbWVzLiBGb3IgZXhhbXBsZSBcIi91c2VyLzppZFwiIHdpbGxcbiAqIHRoZW4gY29udGFpbiBbXCJpZFwiXS5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSBrZXlzXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbnZhciBwYXRoVG9SZWdFeHAgPSBmdW5jdGlvbiAocGF0aCwga2V5cykge1xuXHRwYXRoID0gcGF0aFxuXHRcdC5jb25jYXQoJy8/Jylcblx0XHQucmVwbGFjZSgvXFwvXFwoL2csICcoPzovJylcblx0XHQucmVwbGFjZSgvKFxcLyk/KFxcLik/OihcXHcrKSg/OihcXCguKj9cXCkpKT8oXFw/KT98XFwqL2csIGZ1bmN0aW9uKF8sIHNsYXNoLCBmb3JtYXQsIGtleSwgY2FwdHVyZSwgb3B0aW9uYWwpe1xuXHRcdFx0aWYgKF8gPT09IFwiKlwiKXtcblx0XHRcdFx0a2V5cy5wdXNoKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiBfO1xuXHRcdFx0fVxuXG5cdFx0XHRrZXlzLnB1c2goa2V5KTtcblx0XHRcdHNsYXNoID0gc2xhc2ggfHwgJyc7XG5cdFx0XHRyZXR1cm4gJydcblx0XHRcdFx0KyAob3B0aW9uYWwgPyAnJyA6IHNsYXNoKVxuXHRcdFx0XHQrICcoPzonXG5cdFx0XHRcdCsgKG9wdGlvbmFsID8gc2xhc2ggOiAnJylcblx0XHRcdFx0KyAoZm9ybWF0IHx8ICcnKSArIChjYXB0dXJlIHx8ICcoW14vXSs/KScpICsgJyknXG5cdFx0XHRcdCsgKG9wdGlvbmFsIHx8ICcnKTtcblx0XHR9KVxuXHRcdC5yZXBsYWNlKC8oW1xcLy5dKS9nLCAnXFxcXCQxJylcblx0XHQucmVwbGFjZSgvXFwqL2csICcoLiopJyk7XG5cdHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHBhdGggKyAnJCcsICdpJyk7XG59O1xuXG4vKipcbiAqIEF0dGVtcHQgdG8gbWF0Y2ggdGhlIGdpdmVuIHJlcXVlc3QgdG9cbiAqIG9uZSBvZiB0aGUgcm91dGVzLiBXaGVuIHN1Y2Nlc3NmdWxcbiAqIGEgIHtmbiwgcGFyYW1zLCBzcGxhdHN9IG9iaiBpcyByZXR1cm5lZFxuICpcbiAqIEBwYXJhbSAge0FycmF5fSByb3V0ZXNcbiAqIEBwYXJhbSAge1N0cmluZ30gdXJpXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cbnZhciBtYXRjaCA9IGZ1bmN0aW9uIChyb3V0ZXMsIHVyaSwgc3RhcnRBdCkge1xuXHR2YXIgY2FwdHVyZXMsIGkgPSBzdGFydEF0IHx8IDA7XG5cblx0Zm9yICh2YXIgbGVuID0gcm91dGVzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG5cdFx0dmFyIHJvdXRlID0gcm91dGVzW2ldLFxuXHRcdCAgICByZSA9IHJvdXRlLnJlLFxuXHRcdCAgICBrZXlzID0gcm91dGUua2V5cyxcblx0XHQgICAgc3BsYXRzID0gW10sXG5cdFx0ICAgIHBhcmFtcyA9IHt9O1xuXG5cdFx0aWYgKGNhcHR1cmVzID0gdXJpLm1hdGNoKHJlKSkge1xuXHRcdFx0Zm9yICh2YXIgaiA9IDEsIGxlbiA9IGNhcHR1cmVzLmxlbmd0aDsgaiA8IGxlbjsgKytqKSB7XG5cdFx0XHRcdHZhciBrZXkgPSBrZXlzW2otMV0sXG5cdFx0XHRcdFx0dmFsID0gdHlwZW9mIGNhcHR1cmVzW2pdID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0PyB1bmVzY2FwZShjYXB0dXJlc1tqXSlcblx0XHRcdFx0XHRcdDogY2FwdHVyZXNbal07XG5cdFx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0XHRwYXJhbXNba2V5XSA9IHZhbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzcGxhdHMucHVzaCh2YWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwYXJhbXM6IHBhcmFtcyxcblx0XHRcdFx0c3BsYXRzOiBzcGxhdHMsXG5cdFx0XHRcdHJvdXRlOiByb3V0ZS5zcmMsXG5cdFx0XHRcdG5leHQ6IGkgKyAxXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufTtcblxuLyoqXG4gKiBEZWZhdWx0IFwibm9ybWFsXCIgcm91dGVyIGNvbnN0cnVjdG9yLlxuICogYWNjZXB0cyBwYXRoLCBmbiB0dXBsZXMgdmlhIGFkZFJvdXRlXG4gKiByZXR1cm5zIHtmbiwgcGFyYW1zLCBzcGxhdHMsIHJvdXRlfVxuICogIHZpYSBtYXRjaFxuICpcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG52YXIgUm91dGVyID0gZnVuY3Rpb24oKXtcbiAgLy91c2luZyAnbmV3JyBpcyBvcHRpb25hbFxuICByZXR1cm4ge1xuICAgIHJvdXRlczogW10sXG4gICAgcm91dGVNYXAgOiB7fSxcbiAgICBhZGRSb3V0ZTogZnVuY3Rpb24ocGF0aCwgZm4pe1xuICAgICAgaWYgKCFwYXRoKSB0aHJvdyBuZXcgRXJyb3IoJyByb3V0ZSByZXF1aXJlcyBhIHBhdGgnKTtcbiAgICAgIGlmICghZm4pIHRocm93IG5ldyBFcnJvcignIHJvdXRlICcgKyBwYXRoLnRvU3RyaW5nKCkgKyAnIHJlcXVpcmVzIGEgY2FsbGJhY2snKTtcblxuICAgICAgdmFyIHJvdXRlID0gUm91dGUocGF0aCk7XG4gICAgICByb3V0ZS5mbiA9IGZuO1xuXG4gICAgICB0aGlzLnJvdXRlcy5wdXNoKHJvdXRlKTtcbiAgICAgIHRoaXMucm91dGVNYXBbcGF0aF0gPSBmbjtcbiAgICB9LFxuXG4gICAgbWF0Y2g6IGZ1bmN0aW9uKHBhdGhuYW1lLCBzdGFydEF0KXtcbiAgICAgIHZhciByb3V0ZSA9IG1hdGNoKHRoaXMucm91dGVzLCBwYXRobmFtZSwgc3RhcnRBdCk7XG4gICAgICBpZihyb3V0ZSl7XG4gICAgICAgIHJvdXRlLmZuID0gdGhpcy5yb3V0ZU1hcFtyb3V0ZS5yb3V0ZV07XG4gICAgICAgIHJvdXRlLm5leHQgPSB0aGlzLm1hdGNoLmJpbmQodGhpcywgcGF0aG5hbWUsIHJvdXRlLm5leHQpXG4gICAgICB9XG4gICAgICByZXR1cm4gcm91dGU7XG4gICAgfVxuICB9XG59O1xuXG5Sb3V0ZXIuUm91dGUgPSBSb3V0ZVxuUm91dGVyLnBhdGhUb1JlZ0V4cCA9IHBhdGhUb1JlZ0V4cFxuUm91dGVyLm1hdGNoID0gbWF0Y2hcbi8vIGJhY2sgY29tcGF0XG5Sb3V0ZXIuUm91dGVyID0gUm91dGVyXG5cbm1vZHVsZS5leHBvcnRzID0gUm91dGVyXG5cbn0se31dfSx7fSxbMV0pXG4oMSlcbn0pO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJ2YXIgd2luZG93ID0gcmVxdWlyZShcImdsb2JhbC93aW5kb3dcIilcbnZhciBvbmNlID0gcmVxdWlyZShcIm9uY2VcIilcbnZhciBwYXJzZUhlYWRlcnMgPSByZXF1aXJlKCdwYXJzZS1oZWFkZXJzJylcblxudmFyIG1lc3NhZ2VzID0ge1xuICAgIFwiMFwiOiBcIkludGVybmFsIFhNTEh0dHBSZXF1ZXN0IEVycm9yXCIsXG4gICAgXCI0XCI6IFwiNHh4IENsaWVudCBFcnJvclwiLFxuICAgIFwiNVwiOiBcIjV4eCBTZXJ2ZXIgRXJyb3JcIlxufVxuXG52YXIgWEhSID0gd2luZG93LlhNTEh0dHBSZXF1ZXN0IHx8IG5vb3BcbnZhciBYRFIgPSBcIndpdGhDcmVkZW50aWFsc1wiIGluIChuZXcgWEhSKCkpID8gWEhSIDogd2luZG93LlhEb21haW5SZXF1ZXN0XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlWEhSXG5cbmZ1bmN0aW9uIGNyZWF0ZVhIUihvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvcHRpb25zID0geyB1cmk6IG9wdGlvbnMgfVxuICAgIH1cblxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9XG4gICAgY2FsbGJhY2sgPSBvbmNlKGNhbGxiYWNrKVxuXG4gICAgdmFyIHhociA9IG9wdGlvbnMueGhyIHx8IG51bGxcblxuICAgIGlmICgheGhyKSB7XG4gICAgICAgIGlmIChvcHRpb25zLmNvcnMgfHwgb3B0aW9ucy51c2VYRFIpIHtcbiAgICAgICAgICAgIHhociA9IG5ldyBYRFIoKVxuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHhociA9IG5ldyBYSFIoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHVyaSA9IHhoci51cmwgPSBvcHRpb25zLnVyaSB8fCBvcHRpb25zLnVybFxuICAgIHZhciBtZXRob2QgPSB4aHIubWV0aG9kID0gb3B0aW9ucy5tZXRob2QgfHwgXCJHRVRcIlxuICAgIHZhciBib2R5ID0gb3B0aW9ucy5ib2R5IHx8IG9wdGlvbnMuZGF0YVxuICAgIHZhciBoZWFkZXJzID0geGhyLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge31cbiAgICB2YXIgc3luYyA9ICEhb3B0aW9ucy5zeW5jXG4gICAgdmFyIGlzSnNvbiA9IGZhbHNlXG4gICAgdmFyIGtleVxuICAgIHZhciBsb2FkID0gb3B0aW9ucy5yZXNwb25zZSA/IGxvYWRSZXNwb25zZSA6IGxvYWRYaHJcblxuICAgIGlmIChcImpzb25cIiBpbiBvcHRpb25zKSB7XG4gICAgICAgIGlzSnNvbiA9IHRydWVcbiAgICAgICAgaGVhZGVyc1tcIkFjY2VwdFwiXSA9IFwiYXBwbGljYXRpb24vanNvblwiXG4gICAgICAgIGlmIChtZXRob2QgIT09IFwiR0VUXCIgJiYgbWV0aG9kICE9PSBcIkhFQURcIikge1xuICAgICAgICAgICAgaGVhZGVyc1tcIkNvbnRlbnQtVHlwZVwiXSA9IFwiYXBwbGljYXRpb24vanNvblwiXG4gICAgICAgICAgICBib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5qc29uKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IHJlYWR5c3RhdGVjaGFuZ2VcbiAgICB4aHIub25sb2FkID0gbG9hZFxuICAgIHhoci5vbmVycm9yID0gZXJyb3JcbiAgICAvLyBJRTkgbXVzdCBoYXZlIG9ucHJvZ3Jlc3MgYmUgc2V0IHRvIGEgdW5pcXVlIGZ1bmN0aW9uLlxuICAgIHhoci5vbnByb2dyZXNzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBJRSBtdXN0IGRpZVxuICAgIH1cbiAgICAvLyBoYXRlIElFXG4gICAgeGhyLm9udGltZW91dCA9IG5vb3BcbiAgICB4aHIub3BlbihtZXRob2QsIHVyaSwgIXN5bmMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL2JhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICBpZiAob3B0aW9ucy53aXRoQ3JlZGVudGlhbHMgfHwgKG9wdGlvbnMuY29ycyAmJiBvcHRpb25zLndpdGhDcmVkZW50aWFscyAhPT0gZmFsc2UpKSB7XG4gICAgICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gQ2Fubm90IHNldCB0aW1lb3V0IHdpdGggc3luYyByZXF1ZXN0XG4gICAgaWYgKCFzeW5jKSB7XG4gICAgICAgIHhoci50aW1lb3V0ID0gXCJ0aW1lb3V0XCIgaW4gb3B0aW9ucyA/IG9wdGlvbnMudGltZW91dCA6IDUwMDBcbiAgICB9XG5cbiAgICBpZiAoeGhyLnNldFJlcXVlc3RIZWFkZXIpIHtcbiAgICAgICAgZm9yKGtleSBpbiBoZWFkZXJzKXtcbiAgICAgICAgICAgIGlmKGhlYWRlcnMuaGFzT3duUHJvcGVydHkoa2V5KSl7XG4gICAgICAgICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBoZWFkZXJzW2tleV0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMuaGVhZGVycykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJIZWFkZXJzIGNhbm5vdCBiZSBzZXQgb24gYW4gWERvbWFpblJlcXVlc3Qgb2JqZWN0XCIpXG4gICAgfVxuXG4gICAgaWYgKFwicmVzcG9uc2VUeXBlXCIgaW4gb3B0aW9ucykge1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gb3B0aW9ucy5yZXNwb25zZVR5cGVcbiAgICB9XG4gICAgXG4gICAgaWYgKFwiYmVmb3JlU2VuZFwiIGluIG9wdGlvbnMgJiYgXG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmJlZm9yZVNlbmQgPT09IFwiZnVuY3Rpb25cIlxuICAgICkge1xuICAgICAgICBvcHRpb25zLmJlZm9yZVNlbmQoeGhyKVxuICAgIH1cblxuICAgIHhoci5zZW5kKGJvZHkpXG5cbiAgICByZXR1cm4geGhyXG5cbiAgICBmdW5jdGlvbiByZWFkeXN0YXRlY2hhbmdlKCkge1xuICAgICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICAgIGxvYWQoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0Qm9keSgpIHtcbiAgICAgICAgLy8gQ2hyb21lIHdpdGggcmVxdWVzdFR5cGU9YmxvYiB0aHJvd3MgZXJyb3JzIGFycm91bmQgd2hlbiBldmVuIHRlc3RpbmcgYWNjZXNzIHRvIHJlc3BvbnNlVGV4dFxuICAgICAgICB2YXIgYm9keSA9IG51bGxcblxuICAgICAgICBpZiAoeGhyLnJlc3BvbnNlKSB7XG4gICAgICAgICAgICBib2R5ID0geGhyLnJlc3BvbnNlXG4gICAgICAgIH0gZWxzZSBpZiAoeGhyLnJlc3BvbnNlVHlwZSA9PT0gJ3RleHQnIHx8ICF4aHIucmVzcG9uc2VUeXBlKSB7XG4gICAgICAgICAgICBib2R5ID0geGhyLnJlc3BvbnNlVGV4dCB8fCB4aHIucmVzcG9uc2VYTUxcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0pzb24pIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYm9keSA9IEpTT04ucGFyc2UoYm9keSlcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYm9keVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFN0YXR1c0NvZGUoKSB7XG4gICAgICAgIHJldHVybiB4aHIuc3RhdHVzID09PSAxMjIzID8gMjA0IDogeGhyLnN0YXR1c1xuICAgIH1cblxuICAgIC8vIGlmIHdlJ3JlIGdldHRpbmcgYSBub25lLW9rIHN0YXR1c0NvZGUsIGJ1aWxkICYgcmV0dXJuIGFuIGVycm9yXG4gICAgZnVuY3Rpb24gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpIHtcbiAgICAgICAgdmFyIGVycm9yID0gbnVsbFxuICAgICAgICBpZiAoc3RhdHVzID09PSAwIHx8IChzdGF0dXMgPj0gNDAwICYmIHN0YXR1cyA8IDYwMCkpIHtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlID0gKHR5cGVvZiBib2R5ID09PSBcInN0cmluZ1wiID8gYm9keSA6IGZhbHNlKSB8fFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VzW1N0cmluZyhzdGF0dXMpLmNoYXJBdCgwKV1cbiAgICAgICAgICAgIGVycm9yID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gICAgICAgICAgICBlcnJvci5zdGF0dXNDb2RlID0gc3RhdHVzXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXJyb3JcbiAgICB9XG5cbiAgICAvLyB3aWxsIGxvYWQgdGhlIGRhdGEgJiBwcm9jZXNzIHRoZSByZXNwb25zZSBpbiBhIHNwZWNpYWwgcmVzcG9uc2Ugb2JqZWN0XG4gICAgZnVuY3Rpb24gbG9hZFJlc3BvbnNlKCkge1xuICAgICAgICB2YXIgc3RhdHVzID0gZ2V0U3RhdHVzQ29kZSgpXG4gICAgICAgIHZhciBlcnJvciA9IGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKVxuICAgICAgICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgICAgICAgICBib2R5OiBnZXRCb2R5KCksXG4gICAgICAgICAgICBzdGF0dXNDb2RlOiBzdGF0dXMsXG4gICAgICAgICAgICBzdGF0dXNUZXh0OiB4aHIuc3RhdHVzVGV4dCxcbiAgICAgICAgICAgIHJhdzogeGhyXG4gICAgICAgIH1cbiAgICAgICAgaWYoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycyl7IC8vcmVtZW1iZXIgeGhyIGNhbiBpbiBmYWN0IGJlIFhEUiBmb3IgQ09SUyBpbiBJRVxuICAgICAgICAgICAgcmVzcG9uc2UuaGVhZGVycyA9IHBhcnNlSGVhZGVycyh4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXNwb25zZS5oZWFkZXJzID0ge31cbiAgICAgICAgfVxuXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCByZXNwb25zZSwgcmVzcG9uc2UuYm9keSlcbiAgICB9XG5cbiAgICAvLyB3aWxsIGxvYWQgdGhlIGRhdGEgYW5kIGFkZCBzb21lIHJlc3BvbnNlIHByb3BlcnRpZXMgdG8gdGhlIHNvdXJjZSB4aHJcbiAgICAvLyBhbmQgdGhlbiByZXNwb25kIHdpdGggdGhhdFxuICAgIGZ1bmN0aW9uIGxvYWRYaHIoKSB7XG4gICAgICAgIHZhciBzdGF0dXMgPSBnZXRTdGF0dXNDb2RlKClcbiAgICAgICAgdmFyIGVycm9yID0gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpXG5cbiAgICAgICAgeGhyLnN0YXR1cyA9IHhoci5zdGF0dXNDb2RlID0gc3RhdHVzXG4gICAgICAgIHhoci5ib2R5ID0gZ2V0Qm9keSgpXG4gICAgICAgIHhoci5oZWFkZXJzID0gcGFyc2VIZWFkZXJzKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSlcblxuICAgICAgICBjYWxsYmFjayhlcnJvciwgeGhyLCB4aHIuYm9keSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvcihldnQpIHtcbiAgICAgICAgY2FsbGJhY2soZXZ0LCB4aHIpXG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHdpbmRvdztcbn0gZWxzZSBpZiAodHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsO1xufSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIil7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBzZWxmO1xufSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHt9O1xufVxuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIm1vZHVsZS5leHBvcnRzID0gb25jZVxuXG5vbmNlLnByb3RvID0gb25jZShmdW5jdGlvbiAoKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShGdW5jdGlvbi5wcm90b3R5cGUsICdvbmNlJywge1xuICAgIHZhbHVlOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gb25jZSh0aGlzKVxuICAgIH0sXG4gICAgY29uZmlndXJhYmxlOiB0cnVlXG4gIH0pXG59KVxuXG5mdW5jdGlvbiBvbmNlIChmbikge1xuICB2YXIgY2FsbGVkID0gZmFsc2VcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoY2FsbGVkKSByZXR1cm5cbiAgICBjYWxsZWQgPSB0cnVlXG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgfVxufVxuIiwidmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCdpcy1mdW5jdGlvbicpXG5cbm1vZHVsZS5leHBvcnRzID0gZm9yRWFjaFxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG52YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5XG5cbmZ1bmN0aW9uIGZvckVhY2gobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoIWlzRnVuY3Rpb24oaXRlcmF0b3IpKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2l0ZXJhdG9yIG11c3QgYmUgYSBmdW5jdGlvbicpXG4gICAgfVxuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAzKSB7XG4gICAgICAgIGNvbnRleHQgPSB0aGlzXG4gICAgfVxuICAgIFxuICAgIGlmICh0b1N0cmluZy5jYWxsKGxpc3QpID09PSAnW29iamVjdCBBcnJheV0nKVxuICAgICAgICBmb3JFYWNoQXJyYXkobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG4gICAgZWxzZSBpZiAodHlwZW9mIGxpc3QgPT09ICdzdHJpbmcnKVxuICAgICAgICBmb3JFYWNoU3RyaW5nKGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxuICAgIGVsc2VcbiAgICAgICAgZm9yRWFjaE9iamVjdChsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbn1cblxuZnVuY3Rpb24gZm9yRWFjaEFycmF5KGFycmF5LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBhcnJheS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChhcnJheSwgaSkpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgYXJyYXlbaV0sIGksIGFycmF5KVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoU3RyaW5nKHN0cmluZywgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIC8vIG5vIHN1Y2ggdGhpbmcgYXMgYSBzcGFyc2Ugc3RyaW5nLlxuICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHN0cmluZy5jaGFyQXQoaSksIGksIHN0cmluZylcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2hPYmplY3Qob2JqZWN0LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGsgaW4gb2JqZWN0KSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgaykpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqZWN0W2tdLCBrLCBvYmplY3QpXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGlzRnVuY3Rpb25cblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uIChmbikge1xuICB2YXIgc3RyaW5nID0gdG9TdHJpbmcuY2FsbChmbilcbiAgcmV0dXJuIHN0cmluZyA9PT0gJ1tvYmplY3QgRnVuY3Rpb25dJyB8fFxuICAgICh0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicgJiYgc3RyaW5nICE9PSAnW29iamVjdCBSZWdFeHBdJykgfHxcbiAgICAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgLy8gSUU4IGFuZCBiZWxvd1xuICAgICAoZm4gPT09IHdpbmRvdy5zZXRUaW1lb3V0IHx8XG4gICAgICBmbiA9PT0gd2luZG93LmFsZXJ0IHx8XG4gICAgICBmbiA9PT0gd2luZG93LmNvbmZpcm0gfHxcbiAgICAgIGZuID09PSB3aW5kb3cucHJvbXB0KSlcbn07XG4iLCJcbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHRyaW07XG5cbmZ1bmN0aW9uIHRyaW0oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzKnxcXHMqJC9nLCAnJyk7XG59XG5cbmV4cG9ydHMubGVmdCA9IGZ1bmN0aW9uKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyovLCAnJyk7XG59O1xuXG5leHBvcnRzLnJpZ2h0ID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXHMqJC8sICcnKTtcbn07XG4iLCJ2YXIgdHJpbSA9IHJlcXVpcmUoJ3RyaW0nKVxuICAsIGZvckVhY2ggPSByZXF1aXJlKCdmb3ItZWFjaCcpXG4gICwgaXNBcnJheSA9IGZ1bmN0aW9uKGFyZykge1xuICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhcmcpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIH1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaGVhZGVycykge1xuICBpZiAoIWhlYWRlcnMpXG4gICAgcmV0dXJuIHt9XG5cbiAgdmFyIHJlc3VsdCA9IHt9XG5cbiAgZm9yRWFjaChcbiAgICAgIHRyaW0oaGVhZGVycykuc3BsaXQoJ1xcbicpXG4gICAgLCBmdW5jdGlvbiAocm93KSB7XG4gICAgICAgIHZhciBpbmRleCA9IHJvdy5pbmRleE9mKCc6JylcbiAgICAgICAgICAsIGtleSA9IHRyaW0ocm93LnNsaWNlKDAsIGluZGV4KSkudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICwgdmFsdWUgPSB0cmltKHJvdy5zbGljZShpbmRleCArIDEpKVxuXG4gICAgICAgIGlmICh0eXBlb2YocmVzdWx0W2tleV0pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gdmFsdWVcbiAgICAgICAgfSBlbHNlIGlmIChpc0FycmF5KHJlc3VsdFtrZXldKSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldLnB1c2godmFsdWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSBbIHJlc3VsdFtrZXldLCB2YWx1ZSBdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgKVxuXG4gIHJldHVybiByZXN1bHRcbn0iXX0=
