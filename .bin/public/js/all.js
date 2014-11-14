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
},{"jadum/runtime":32}],7:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function api(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/api.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/api.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/api.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/api.jade" });
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n<p>Taunus exposes <em>three different public APIs</em>, and there&#39;s also <strong>plugins to integrate Taunus and an HTTP server</strong>. This document covers all three APIs extensively. If you&#39;re concerned about the inner workings of Taunus, please refer to the <a href=\"/getting-started\">Getting Started</a> guide. This document aims to only cover how the public interface affects application state, but <strong>doesn&#39;t delve into implementation details</strong>.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li>A <a href=\"#server-side-api\">server-side API</a> that deals with server-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Its <a href=\"#the-options-object\"><code>options</code></a> argument<ul>\n<li><a href=\"#-options-layout-\"><code>layout</code></a></li>\n<li><a href=\"#-options-routes-\"><code>routes</code></a></li>\n<li><a href=\"#-options-getdefaultviewmodel-\"><code>getDefaultViewModel</code></a></li>\n<li><a href=\"#-options-plaintext-\"><code>plaintext</code></a></li>\n<li><a href=\"#-options-resolvers-\"><code>resolvers</code></a></li>\n<li><a href=\"#-options-version-\"><code>version</code></a></li>\n</ul>\n</li>\n<li>Its <a href=\"#-addroute-definition-\"><code>addRoute</code></a> argument</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render</code></a> method</li>\n<li>The <a href=\"#-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel</code></a> method</li>\n</ul>\n</li>\n<li>A <a href=\"#http-framework-plugins\">suite of plugins</a> can integrate Taunus and an HTTP server<ul>\n<li>Using <a href=\"#using-taunus-express-\"><code>taunus-express</code></a> for <a href=\"http://expressjs.com\">Express</a></li>\n<li>Using <a href=\"#using-taunus-hapi-\"><code>taunus-hapi</code></a> for <a href=\"http://hapijs.com\">Hapi</a></li>\n</ul>\n</li>\n<li>A <a href=\"#command-line-interface\">CLI that produces a wiring module</a> for the client-side<ul>\n<li>The <a href=\"#-output-\"><code>--output</code></a> flag</li>\n<li>The <a href=\"#-watch-\"><code>--watch</code></a> flag</li>\n<li>The <a href=\"#-transform-module-\"><code>--transform &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-standalone-\"><code>--standalone</code></a> flag</li>\n</ul>\n</li>\n<li>A <a href=\"#client-side-api\">client-side API</a> that deals with client-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Using the <a href=\"#using-the-auto-strategy\"><code>auto</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-inline-strategy\"><code>inline</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-manual-strategy\"><code>manual</code></a> strategy</li>\n<li><a href=\"#caching\">Caching</a></li>\n<li><a href=\"#prefetching\">Prefetching</a></li>\n<li><a href=\"#versioning\">Versioning</a></li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a> method</li>\n<li>The <a href=\"#-taunus-once-type-fn-\"><code>taunus.once</code></a> method</li>\n<li>The <a href=\"#-taunus-off-type-fn-\"><code>taunus.off</code></a> method</li>\n<li>The <a href=\"#-taunus-intercept-action-fn-\"><code>taunus.intercept</code></a> method</li>\n<li>The <a href=\"#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a> method</li>\n<li>The <a href=\"#-taunus-navigate-url-options-\"><code>taunus.navigate</code></a> method</li>\n<li>The <a href=\"#-taunus-route-url-\"><code>taunus.route</code></a> method<ul>\n<li>The <a href=\"#-taunus-route-equals-route-route-\"><code>taunus.route.equals</code></a> method</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-state-\"><code>taunus.state</code></a> property</li>\n</ul>\n</li>\n<li>The <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a> manifest</li>\n</ul>\n<h1 id=\"server-side-api\">Server-side API</h1>\n<p>The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, <em>including client-side rendering</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-addroute-options-\"><code>taunus.mount(addRoute, options?)</code></h2>\n<p>Mounts Taunus on top of a server-side router, by registering each route in <code>options.routes</code> with the <code>addRoute</code> method.</p>\n<blockquote>\n<p>Note that most of the time, <strong>this method shouldn&#39;t be invoked directly</strong>, but rather through one of the <a href=\"#http-framework-plugins\">HTTP framework plugins</a> presented below.</p>\n</blockquote>\n<p>Here&#39;s an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the <code>route</code> and <code>action</code> properties.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\ntaunus.mount(addRoute, {\n  routes: [{ route: &#39;/&#39;, action: &#39;home/index&#39; }]\n});\n\nfunction addRoute (definition) {\n  app.get(definition.route, definition.action);\n}\n</code></pre>\n<p>Let&#39;s go over the options you can pass to <code>taunus.mount</code> first.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"the-options-object\">The <code>options?</code> object</h4>\n<p>There&#39;s a few options that can be passed to the server-side mountpoint. You&#39;re probably going to be passing these to your <a href=\"#http-framework-plugins\">HTTP framework plugin</a>, rather than using <code>taunus.mount</code> directly.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-layout-\"><code>options.layout?</code></h6>\n<p>The <code>layout</code> property is expected to have the <code>function(data)</code> signature. It&#39;ll be invoked whenever a full HTML document needs to be rendered, and a <code>data</code> object will be passed to it. That object will contain everything you&#39;ve set as the view model, plus a <code>partial</code> property containing the raw HTML of the rendered partial view. Your <code>layout</code> method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out <a href=\"https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\">the <code>layout.jade</code> used in Pony Foo</a> as an example.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-routes-\"><code>options.routes</code></h6>\n<p>The other big option is <code>routes</code>, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.</p>\n<p>Here&#39;s an example route that uses the <a href=\"http://expressjs.com\">Express</a> routing scheme.</p>\n<pre><code class=\"lang-js\">{\n  route: &#39;/articles/:slug&#39;,\n  action: &#39;articles/article&#39;,\n  ignore: false,\n  cache: &lt;inherit&gt;\n}\n</code></pre>\n<ul>\n<li><code>route</code> is a route in the format your HTTP framework of choice understands</li>\n<li><code>action</code> is the name of your controller action. It&#39;ll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller</li>\n<li><code>cache</code> can be used to determine the client-side caching behavior in this application path, and it&#39;ll default to inheriting from the options passed to <code>taunus.mount</code> <em>on the client-side</em></li>\n<li><code>ignore</code> is used in those cases where you want a URL to be ignored by the client-side router even if there&#39;s a catch-all route that would match that URL</li>\n</ul>\n<p>As an example of the <code>ignore</code> use case, consider the routing table shown below. The client-side router doesn&#39;t know <em>(and can&#39;t know unless you point it out)</em> what routes are server-side only, and it&#39;s up to you to point those out.</p>\n<pre><code class=\"lang-js\">[\n  { route: &#39;/&#39;, action: &#39;/home/index&#39; },\n  { route: &#39;/feed&#39;, ignore: true },\n  { route: &#39;/*&#39;, action: &#39;error/not-found&#39; }\n]\n</code></pre>\n<p>This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The <code>ignore</code> property is effectively telling the client-side <em>&quot;don&#39;t hijack links containing this URL&quot;</em>.</p>\n<p>Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don&#39;t need to be <code>ignore</code>d.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getdefaultviewmodel-\"><code>options.getDefaultViewModel?</code></h6>\n<p>The <code>getDefaultViewModel(done)</code> property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you&#39;re done creating a view model, you can invoke <code>done(null, model)</code>. If an error occurs while building the view model, you should call <code>done(err)</code> instead.</p>\n<p>Taunus will throw an error if <code>done</code> is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases <a href=\"#taunus-rebuilddefaultviewmodel\">the defaults can be rebuilt</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-plaintext-\"><code>options.plaintext?</code></h6>\n<p>The <code>plaintext</code> options object is passed directly to <a href=\"https://github.com/bevacqua/hget\">hget</a>, and it&#39;s used to <a href=\"https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\">tweak the plaintext version</a> of your site.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-resolvers-\"><code>options.resolvers?</code></h6>\n<p>Resolvers are used to determine the location of some of the different pieces of your application. Typically you won&#39;t have to touch these in the slightest.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getServerController(action)</code></td>\n<td>Return path to server-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p>The <code>addRoute</code> method passed to <code>taunus.mount</code> on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-version-\"><code>options.version?</code></h6>\n<p>Refer to the <a href=\"#versioning\">Versioning</a> section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-addroute-definition-\"><code>addRoute(definition)</code></h4>\n<p>The <code>addRoute(definition)</code> method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework&#39;s router.</p>\n<ul>\n<li><code>route</code> is the route that you set as <code>definition.route</code></li>\n<li><code>action</code> is the action as passed to the route definition</li>\n<li><code>actionFn</code> will be the controller for this action method</li>\n<li><code>middleware</code> will be an array of methods to be executed before <code>actionFn</code></li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render(action, viewModel, req, res, next)</code></h2>\n<p>This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won&#39;t go very deep into it.</p>\n<p>The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The <code>action</code> property determines the default view that will be rendered. The <code>viewModel</code> will be extended by <a href=\"#-options-getdefaultviewmodel-\">the default view model</a>, and it may also override the default <code>action</code> by setting <code>viewModel.model.action</code>.</p>\n<p>The <code>req</code>, <code>res</code>, and <code>next</code> arguments are expected to be the Express routing arguments, but they can also be mocked <em>(which is in fact what the Hapi plugin does)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel(done?)</code></h2>\n<p>Once Taunus has been mounted, calling this method will rebuild the view model defaults using the <code>getDefaultViewModel</code> that was passed to <code>taunus.mount</code> in the options. An optional <code>done</code> callback will be invoked when the model is rebuilt.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"http-framework-plugins\">HTTP Framework Plugins</h1>\n<p>There&#39;s currently two different HTTP frameworks <em>(<a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a>)</em> that you can readily use with Taunus without having to deal with any of the route plumbing yourself.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-express-\">Using <code>taunus-express</code></h2>\n<p>The <code>taunus-express</code> plugin is probably the easiest to use, as Taunus was originally developed with just <a href=\"http://expressjs.com\">Express</a> in mind. In addition to the options already outlined for <a href=\"#-taunus-mount-addroute-options-\">taunus.mount</a>, you can add middleware for any route individually.</p>\n<ul>\n<li><code>middleware</code> are any methods you want Taunus to execute as middleware in Express applications</li>\n</ul>\n<p>To get <code>taunus-express</code> going you can use the following piece of code, provided that you come up with an <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  // ...\n};\n\ntaunusExpress(taunus, app, options);\n</code></pre>\n<p>The <code>taunusExpress</code> method will merely set up Taunus and add the relevant routes to your Express application by calling <code>app.get</code> a bunch of times. You can <a href=\"https://github.com/taunus/taunus-express\">find taunus-express on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-hapi-\">Using <code>taunus-hapi</code></h2>\n<p>The <code>taunus-hapi</code> plugin is a bit more involved, and you&#39;ll have to create a Pack in order to use it. In addition to <a href=\"#-taunus-mount-addroute-options-\">the options we&#39;ve already covered</a>, you can add <code>config</code> on any route.</p>\n<ul>\n<li><code>config</code> is passed directly into the route registered with Hapi, giving you the most flexibility</li>\n</ul>\n<p>To get <code>taunus-hapi</code> going you can use the following piece of code, and you can bring your own <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar Hapi = require(&#39;hapi&#39;);\nvar taunus = require(&#39;taunus&#39;);\nvar taunusHapi = require(&#39;taunus-hapi&#39;)(taunus);\nvar pack = new Hapi.Pack();\n\npack.register({\n  plugin: taunusHapi,\n  options: {\n    // ...\n  }\n});\n</code></pre>\n<p>The <code>taunusHapi</code> plugin will mount Taunus and register all of the necessary routes. You can <a href=\"https://github.com/taunus/taunus-hapi\">find taunus-hapi on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"command-line-interface\">Command-Line Interface</h1>\n<p>Once you&#39;ve set up the server-side to render your views using Taunus, it&#39;s only logical that you&#39;ll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.</p>\n<p>The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.</p>\n<p>Install it globally for development, but remember to use local copies for production-grade uses.</p>\n<pre><code class=\"lang-shell\">npm install -g taunus\n</code></pre>\n<p>When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.</p>\n<pre><code class=\"lang-shell\">taunus\n</code></pre>\n<p>By default, the output will be printed to the standard output, making for a fast debugging experience. Here&#39;s the output if you just had a single <code>home/index</code> route, and the matching view and client-side controller existed.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n  &#39;home/index&#39;: require(&#39;../client/js/controllers/home/index.js&#39;)\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>You can use a few options to alter the outcome of invoking <code>taunus</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-output-\"><code>--output</code></h2>\n<p><sub>the <code>-o</code> alias is available</sub></p>\n<p>Output is written to a file instead of to standard output. The file path used will be the <code>client_wiring</code> option in <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a>, which defaults to <code>&#39;.bin/wiring.js&#39;</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-watch-\"><code>--watch</code></h2>\n<p><sub>the <code>-w</code> alias is available</sub></p>\n<p>Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether <code>--output</code> was used.</p>\n<p>The program won&#39;t exit.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-transform-module-\"><code>--transform &lt;module&gt;</code></h2>\n<p><sub>the <code>-t</code> alias is available</sub></p>\n<p>This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the <a href=\"https://github.com/taunus/hapiify\"><code>hapiify</code></a> module.</p>\n<pre><code class=\"lang-shell\">npm install hapiify\ntaunus -t hapiify\n</code></pre>\n<p>Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></h2>\n<p><sub>the <code>-r</code> alias is available</sub></p>\n<p>Similarly to the <a href=\"#-options-resolvers-\"><code>resolvers</code></a> option that you can pass to <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a>, these resolvers can change the way in which file paths are resolved.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getClientController(action)</code></td>\n<td>Return path to client-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-standalone-\"><code>--standalone</code></h2>\n<p><sub>the <code>-s</code> alias is available</sub></p>\n<p>Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus <a href=\"https://github.com/umdjs/umd\">as a UMD module</a>.</p>\n<p>This would allow you to use Taunus on the client-side even if you don&#39;t want to use <a href=\"http://browserify.org\">Browserify</a> directly.</p>\n<p>Feedback and suggestions about this flag, <em>and possible alternatives that would make Taunus easier to use</em>, are welcome.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-api\">Client-side API</h1>\n<p>Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-container-wiring-options-\"><code>taunus.mount(container, wiring, options?)</code></h2>\n<p>The mountpoint takes a root container, the wiring module, and an options parameter. The <code>container</code> is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the <code>wiring</code> module exactly as built by the CLI, and no further configuration is necessary.</p>\n<p>When the mountpoint executes, Taunus will configure its internal state, <em>set up the client-side router</em>, run the client-side controller for the server-side rendered view, and start hijacking links.</p>\n<p>As an example, consider a browser makes a <code>GET</code> request for <code>/articles/the-fox</code> for the first time. Once <code>taunus.mount(container, wiring)</code> is invoked on the client-side, several things would happen in the order listed below.</p>\n<ul>\n<li>Taunus sets up the client-side view routing engine</li>\n<li>If enabled <em>(via <code>options</code>)</em>, the caching engine is configured</li>\n<li>Taunus obtains the view model <em>(more on this later)</em></li>\n<li>When a view model is obtained, the <code>&#39;start&#39;</code> event is emitted</li>\n<li>Anchor links start being monitored for clicks <em>(at this point your application becomes a <a href=\"http://en.wikipedia.org/wiki/Single-page_application\">SPA</a>)</em></li>\n<li>The <code>articles/article</code> client-side controller is executed</li>\n</ul>\n<p>That&#39;s quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, <em>rather than on the server-side!</em></p>\n<p>In order to better understand the process, I&#39;ll walk you through the <code>options</code> parameter.</p>\n<p>First off, the <code>bootstrap</code> option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: <code>auto</code> <em>(the default strategy)</em>, <code>inline</code>, or <code>manual</code>. The <code>auto</code> strategy involves the least work, which is why it&#39;s the default.</p>\n<ul>\n<li><code>auto</code> will make an AJAX request for the view model</li>\n<li><code>inline</code> expects you to place the model into a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag</li>\n<li><code>manual</code> expects you to get the view model however you want to, and then let Taunus know when it&#39;s ready</li>\n</ul>\n<p>Let&#39;s go into detail about each of these strategies.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-auto-strategy\">Using the <code>auto</code> strategy</h4>\n<p>The <code>auto</code> strategy means that Taunus will make use of an AJAX request to obtain the view model. <em>You don&#39;t have to do anything else</em> and this is the default strategy. This is the <strong>most convenient strategy, but also the slowest</strong> one.</p>\n<p>It&#39;s slow because the view model won&#39;t be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and <code>taunus.mount</code> is invoked.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-inline-strategy\">Using the <code>inline</code> strategy</h4>\n<p>The <code>inline</code> strategy expects you to add a <code>data-taunus</code> attribute on the <code>container</code> element. This attribute must be equal to the <code>id</code> attribute of a <code>&lt;script&gt;</code> tag containing the serialized view model.</p>\n<pre><code class=\"lang-jade\">div(data-taunus=&#39;model&#39;)!=partial\nscript(type=&#39;text/taunus&#39;, data-taunus=&#39;model&#39;)=JSON.stringify(model)\n</code></pre>\n<p>Pay special attention to the fact that the model is not only made into a JSON string, <em>but also HTML encoded by Jade</em>. When Taunus extracts the model from the <code>&lt;script&gt;</code> tag it&#39;ll unescape it, and then parse it as JSON.</p>\n<p>This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.</p>\n<p>That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-manual-strategy\">Using the <code>manual</code> strategy</h4>\n<p>The <code>manual</code> strategy is the most involved of the three, but also the most performant. In this strategy you&#39;re supposed to add the following <em>(seemingly pointless)</em> snippet of code in a <code>&lt;script&gt;</code> other than the one that&#39;s pulling down Taunus, so that they are pulled concurrently rather than serially.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n</code></pre>\n<p>Once you somehow get your hands on the view model, you should invoke <code>taunusReady(model)</code>. Considering you&#39;ll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.</p>\n<ul>\n<li>The view model is loaded first, you call <code>taunusReady(model)</code> and wait for Taunus to take the model object and boot the application as soon as <code>taunus.mount</code> is executed</li>\n<li>Taunus loads first and <code>taunus.mount</code> is called first. In this case, Taunus will replace <code>window.taunusReady</code> with a special <code>boot</code> method. When the view model finishes loading, you call <code>taunusReady(model)</code> and the application finishes booting</li>\n</ul>\n<blockquote>\n<p>If this sounds a little mind-bending it&#39;s because it is. It&#39;s not designed to be pretty, but merely to be performant.</p>\n</blockquote>\n<p>Now that we&#39;ve addressed the awkward bits, let&#39;s cover the <em>&quot;somehow get your hands on the view model&quot;</em> aspect. My preferred method is using JSONP, as it&#39;s able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you&#39;ll probably want this to be an inline script, keeping it small is important.</p>\n<p>The good news is that the server-side supports JSONP out the box. Here&#39;s a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nfunction inject (url) {\n  var script = document.createElement(&#39;script&#39;);\n  script.src = url;\n  document.body.appendChild(script);\n}\n\nfunction injector () {\n  var search = location.search;\n  var searchQuery = search ? &#39;&amp;&#39; + search.substr(1) : &#39;&#39;;\n  var searchJson = &#39;?json&amp;callback=taunusReady&#39; + searchQuery;\n  inject(location.pathname + searchJson);\n}\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n\ninjector();\n</code></pre>\n<p>As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching\">Caching</h4>\n<p>The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the <code>cache</code> flag in the options passed to <code>taunus.mount</code> on the client-side.</p>\n<p>If you set <code>cache</code> to <code>true</code> then cached items will be considered <em>&quot;fresh&quot; (valid copies of the original)</em> for <strong>15 seconds</strong>. You can also set <code>cache</code> to a number, and that number of seconds will be used as the default instead.</p>\n<p>Caching can also be tweaked on individual routes. For instance, you could set <code>{ cache: true }</code> when mounting Taunus and then have <code>{ cache: 3600 }</code> on a route that you want to cache for a longer period of time.</p>\n<p>The caching layer is <em>seamlessly integrated</em> into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in <a href=\"http://caniuse.com/#feat=indexeddb\">browsers that support IndexedDB</a>. In the case of browsers that don&#39;t support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"prefetching\">Prefetching</h4>\n<p>If caching is enabled, the next logical step is prefetching. This is enabled just by adding <code>prefetch: true</code> to the options passed to <code>taunus.mount</code>. The prefetching feature will fire for any anchor link that&#39;s trips over a <code>mouseover</code> or a <code>touchstart</code> event. If a route matches the URL in the <code>href</code>, an AJAX request will prefetch the view and cache its contents, improving perceived performance.</p>\n<p>When links are clicked before prefetching finishes, they&#39;ll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.</p>\n<h4 id=\"versioning\">Versioning</h4>\n<p>In order to turn on the versioning API, set the <code>version</code> field in the options when invoking <code>taunus.mount</code> <strong>on both the server-side and the client-side, using the same value</strong>. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.</p>\n<p>The default version string is set to <code>1</code>. The Taunus version will be prepended to yours, resulting in a value such as <code>t3.0.0;v1</code> where Taunus is running version <code>3.0.0</code> and your application is running version <code>1</code>.</p>\n<p>Refer to the Getting Started guide for a more detailed <a href=\"/getting-started#versioning\">analysis of the uses for versioning</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-on-type-fn-\"><code>taunus.on(type, fn)</code></h2>\n<p>Taunus emits a series of events during its lifecycle, and <code>taunus.on</code> is the way you can tune in and listen for these events using a subscription function <code>fn</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-once-type-fn-\"><code>taunus.once(type, fn)</code></h2>\n<p>This method is equivalent to <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a>, except the event listeners will be used once and then it&#39;ll be discarded.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-off-type-fn-\"><code>taunus.off(type, fn)</code></h2>\n<p>Using this method you can remove any event listeners that were previously added using <code>.on</code> or <code>.once</code>. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling <code>.on</code> or <code>.once</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-intercept-action-fn-\"><code>taunus.intercept(action?, fn)</code></h2>\n<p>This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified <code>action</code>. You can also add global interceptors by omitting the <code>action</code> parameter, or setting it to <code>*</code>.</p>\n<p>An interceptor function will receive an <code>event</code> parameter, containing a few different properties.</p>\n<ul>\n<li><code>url</code> contains the URL that needs a view model</li>\n<li><code>route</code> contains the full route object as you&#39;d get from <a href=\"#-taunus-route-url-\"><code>taunus.route(url)</code></a></li>\n<li><code>parts</code> is just a shortcut for <code>route.parts</code></li>\n<li><code>preventDefault(model)</code> allows you to suppress the need for an AJAX request, commanding Taunus to use the model you&#39;ve provided instead</li>\n<li><code>defaultPrevented</code> tells you if some other handler has prevented the default behavior</li>\n<li><code>canPreventDefault</code> tells you if invoking <code>event.preventDefault</code> will have any effect</li>\n<li><code>model</code> starts as <code>null</code>, and it can later become the model passed to <code>preventDefault</code></li>\n</ul>\n<p>Interceptors are asynchronous, but if an interceptor spends longer than 200ms it&#39;ll be short-circuited and calling <code>event.preventDefault</code> past that point won&#39;t have any effect.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-partial-container-action-model-\"><code>taunus.partial(container, action, model)</code></h2>\n<p>This method provides you with access to the view-rendering engine of Taunus. You can use it to render the <code>action</code> view into the <code>container</code> DOM element, using the specified <code>model</code>. Once the view is rendered, the <code>render</code> event will be fired <em>(with <code>container, model</code> as arguments)</em> and the client-side controller for that view will be executed.</p>\n<p>While <code>taunus.partial</code> takes a <code>route</code> as the fourth parameter, you should omit that since it&#39;s used for internal purposes only.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-navigate-url-options-\"><code>taunus.navigate(url, options)</code></h2>\n<p>Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use <code>taunus.navigate</code> passing it a plain URL or anything that would cause <code>taunus.route(url)</code> to return a valid route.</p>\n<p>By default, if <code>taunus.navigate(url, options)</code> is called with an <code>url</code> that doesn&#39;t match any client-side route, then the user will be redirected via <code>location.href</code>. In cases where the browser doesn&#39;t support the history API, <code>location.href</code> will be used as well.</p>\n<p>There&#39;s a few options you can use to tweak the behavior of <code>taunus.navigate</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Option</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>context</code></td>\n<td>A DOM element that caused the navigation event, used when emitting events</td>\n</tr>\n<tr>\n<td><code>strict</code></td>\n<td>If set to <code>true</code> and the URL doesn&#39;t match any route, then the navigation attempt must be ignored</td>\n</tr>\n<tr>\n<td><code>scroll</code></td>\n<td>When this is set to <code>false</code>, elements aren&#39;t scrolled into view after navigation</td>\n</tr>\n<tr>\n<td><code>force</code></td>\n<td>Unless this is set to <code>true</code>, navigation won&#39;t <em>fetch a model</em> if the route matches the current route, and <code>state.model</code> will be reused instead</td>\n</tr>\n<tr>\n<td><code>replaceState</code></td>\n<td>Use <code>replaceState</code> instead of <code>pushState</code> when changing history</td>\n</tr>\n</tbody>\n</table>\n<p>Note that the notion of <em>fetching a model</em> might be deceiving as the model could be pulled from the cache even if <code>force</code> is set to <code>true</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-route-url-\"><code>taunus.route(url)</code></h2>\n<p>This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.</p>\n<ul>\n<li>A fully qualified URL on the same origin, e.g <code>http://taunus.bevacqua.io/api</code></li>\n<li>An absolute URL without an origin, e.g <code>/api</code></li>\n<li>Just a hash, e.g <code>#foo</code> <em>(<code>location.href</code> is used)</em></li>\n<li>Falsy values, e.g <code>null</code> <em>(<code>location.href</code> is used)</em></li>\n</ul>\n<p>Relative URLs are not supported <em>(anything that doesn&#39;t have a leading slash)</em>, e.g <code>files/data.json</code>. Anything that&#39;s not on the same origin or doesn&#39;t match one of the registered routes is going to yield <code>null</code>.</p>\n<p><em>This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"-taunus-route-equals-route-route-\"><code>taunus.route.equals(route, route)</code></h1>\n<p>Compares two routes and returns <code>true</code> if they would fetch the same model. Note that different URLs may still return <code>true</code>. For instance, <code>/foo</code> and <code>/foo#bar</code> would fetch the same model even if they&#39;re different URLs.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-state-\"><code>taunus.state</code></h2>\n<p>This is an internal state variable, and it contains a lot of useful debugging information.</p>\n<ul>\n<li><code>container</code> is the DOM element passed to <code>taunus.mount</code></li>\n<li><code>controllers</code> are all the controllers, as defined in the wiring module</li>\n<li><code>templates</code> are all the templates, as defined in the wiring module</li>\n<li><code>routes</code> are all the routes, as defined in the wiring module</li>\n<li><code>route</code> is a reference to the current route</li>\n<li><code>model</code> is a reference to the model used to render the current view</li>\n<li><code>prefetch</code> exposes whether prefetching is turned on</li>\n<li><code>cache</code> exposes whether caching is enabled</li>\n</ul>\n<p>Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-taunusrc-manifest\">The <code>.taunusrc</code> manifest</h1>\n<p>If you want to use values other than the conventional defaults shown in the table below, then you should create a <code>.taunusrc</code> file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your <code>package.json</code>, under the <code>taunus</code> property.</p>\n<pre><code class=\"lang-json\">{\n  &quot;views&quot;: &quot;.bin/views&quot;,\n  &quot;server_routes&quot;: &quot;controllers/routes.js&quot;,\n  &quot;server_controllers&quot;: &quot;controllers&quot;,\n  &quot;client_controllers&quot;: &quot;client/js/controllers&quot;,\n  &quot;client_wiring&quot;: &quot;.bin/wiring.js&quot;\n}\n</code></pre>\n<ul>\n<li>The <code>views</code> directory is where your views <em>(already compiled into JavaScript)</em> are placed. These views are used directly on both the server-side and the client-side</li>\n<li>The <code>server_routes</code> file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module</li>\n<li>The <code>server_controllers</code> directory is the root directory where your server-side controllers live. It&#39;s used when setting up the server-side router</li>\n<li>The <code>client_controllers</code> directory is where your client-side controller modules live. The CLI will <code>require</code> these controllers in its resulting wiring module</li>\n<li>The <code>client_wiring</code> file is where your wiring module will be placed by the CLI. You&#39;ll then have to <code>require</code> it in your application when booting up Taunus</li>\n</ul>\n<p>Here is where things get <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">a little conventional</a>. Views, and both server-side and client-side controllers are expected to be organized by following the <code>{root}/{controller}/{action}</code> pattern, but you could change that using <code>resolvers</code> when invoking the CLI and using the server-side API.</p>\n<p>Views and controllers are also expected to be CommonJS modules that export a single method.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    Taunus exposes _three different public APIs_, and there's also **plugins to integrate Taunus and an HTTP server**. This document covers all three APIs extensively. If you're concerned about the inner workings of Taunus, please refer to the [Getting Started][1] guide. This document aims to only cover how the public interface affects application state, but **doesn't delve into implementation details**.\n\n    # Table of Contents\n\n    - A [server-side API](#server-side-api) that deals with server-side rendering\n      - The [`taunus.mount`](#-taunus-mount-addroute-options-) method\n        - Its [`options`](#the-options-object) argument\n          - [`layout`](#-options-layout-)\n          - [`routes`](#-options-routes-)\n          - [`getDefaultViewModel`](#-options-getdefaultviewmodel-)\n          - [`plaintext`](#-options-plaintext-)\n          - [`resolvers`](#-options-resolvers-)\n          - [`version`](#-options-version-)\n        - Its [`addRoute`](#-addroute-definition-) argument\n      - The [`taunus.render`](#-taunus-render-action-viewmodel-req-res-next-) method\n      - The [`taunus.rebuildDefaultViewModel`](#-taunus-rebuilddefaultviewmodel-done-) method\n    - A [suite of plugins](#http-framework-plugins) can integrate Taunus and an HTTP server\n      - Using [`taunus-express`](#using-taunus-express-) for [Express][2]\n      - Using [`taunus-hapi`](#using-taunus-hapi-) for [Hapi][3]\n    - A [CLI that produces a wiring module](#command-line-interface) for the client-side\n      - The [`--output`](#-output-) flag\n      - The [`--watch`](#-watch-) flag\n      - The [`--transform <module>`](#-transform-module-) flag\n      - The [`--resolvers <module>`](#-resolvers-module-) flag\n      - The [`--standalone`](#-standalone-) flag\n    - A [client-side API](#client-side-api) that deals with client-side rendering\n      - The [`taunus.mount`](#-taunus-mount-container-wiring-options-) method\n        - Using the [`auto`](#using-the-auto-strategy) strategy\n        - Using the [`inline`](#using-the-inline-strategy) strategy\n        - Using the [`manual`](#using-the-manual-strategy) strategy\n        - [Caching](#caching)\n        - [Prefetching](#prefetching)\n        - [Versioning](#versioning)\n      - The [`taunus.on`](#-taunus-on-type-fn-) method\n      - The [`taunus.once`](#-taunus-once-type-fn-) method\n      - The [`taunus.off`](#-taunus-off-type-fn-) method\n      - The [`taunus.intercept`](#-taunus-intercept-action-fn-) method\n      - The [`taunus.partial`](#-taunus-partial-container-action-model-) method\n      - The [`taunus.navigate`](#-taunus-navigate-url-options-) method\n      - The [`taunus.route`](#-taunus-route-url-) method\n        - The [`taunus.route.equals`](#-taunus-route-equals-route-route-) method\n      - The [`taunus.state`](#-taunus-state-) property\n    - The [`.taunusrc`](#the-taunusrc-manifest) manifest\n\n    # Server-side API\n\n    The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, _including client-side rendering_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(addRoute, options?)`\n\n    Mounts Taunus on top of a server-side router, by registering each route in `options.routes` with the `addRoute` method.\n\n    > Note that most of the time, **this method shouldn't be invoked directly**, but rather through one of the [HTTP framework plugins](#http-framework-plugins) presented below.\n\n    Here's an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the `route` and `action` properties.\n\n    ```js\n    'use strict';\n\n    taunus.mount(addRoute, {\n      routes: [{ route: '/', action: 'home/index' }]\n    });\n\n    function addRoute (definition) {\n      app.get(definition.route, definition.action);\n    }\n    ```\n\n    Let's go over the options you can pass to `taunus.mount` first.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### The `options?` object\n\n    There's a few options that can be passed to the server-side mountpoint. You're probably going to be passing these to your [HTTP framework plugin](#http-framework-plugins), rather than using `taunus.mount` directly.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.layout?`\n\n    The `layout` property is expected to have the `function(data)` signature. It'll be invoked whenever a full HTML document needs to be rendered, and a `data` object will be passed to it. That object will contain everything you've set as the view model, plus a `partial` property containing the raw HTML of the rendered partial view. Your `layout` method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out [the `layout.jade` used in Pony Foo][4] as an example.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.routes`\n\n    The other big option is `routes`, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.\n\n    Here's an example route that uses the [Express][2] routing scheme.\n\n    ```js\n    {\n      route: '/articles/:slug',\n      action: 'articles/article',\n      ignore: false,\n      cache: <inherit>\n    }\n    ```\n\n    - `route` is a route in the format your HTTP framework of choice understands\n    - `action` is the name of your controller action. It'll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller\n    - `cache` can be used to determine the client-side caching behavior in this application path, and it'll default to inheriting from the options passed to `taunus.mount` _on the client-side_\n    - `ignore` is used in those cases where you want a URL to be ignored by the client-side router even if there's a catch-all route that would match that URL\n\n    As an example of the `ignore` use case, consider the routing table shown below. The client-side router doesn't know _(and can't know unless you point it out)_ what routes are server-side only, and it's up to you to point those out.\n\n    ```js\n    [\n      { route: '/', action: '/home/index' },\n      { route: '/feed', ignore: true },\n      { route: '/*', action: 'error/not-found' }\n    ]\n    ```\n\n    This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The `ignore` property is effectively telling the client-side _\"don't hijack links containing this URL\"_.\n\n    Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don't need to be `ignore`d.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getDefaultViewModel?`\n\n    The `getDefaultViewModel(done)` property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you're done creating a view model, you can invoke `done(null, model)`. If an error occurs while building the view model, you should call `done(err)` instead.\n\n    Taunus will throw an error if `done` is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases [the defaults can be rebuilt](#taunus-rebuilddefaultviewmodel).\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.plaintext?`\n\n    The `plaintext` options object is passed directly to [hget][5], and it's used to [tweak the plaintext version][6] of your site.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.resolvers?`\n\n    Resolvers are used to determine the location of some of the different pieces of your application. Typically you won't have to touch these in the slightest.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getServerController(action)` | Return path to server-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    The `addRoute` method passed to `taunus.mount` on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.version?`\n\n    Refer to the [Versioning](#versioning) section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `addRoute(definition)`\n\n    The `addRoute(definition)` method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework's router.\n\n    - `route` is the route that you set as `definition.route`\n    - `action` is the action as passed to the route definition\n    - `actionFn` will be the controller for this action method\n    - `middleware` will be an array of methods to be executed before `actionFn`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.render(action, viewModel, req, res, next)`\n\n    This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won't go very deep into it.\n\n    The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The `action` property determines the default view that will be rendered. The `viewModel` will be extended by [the default view model](#-options-getdefaultviewmodel-), and it may also override the default `action` by setting `viewModel.model.action`.\n\n    The `req`, `res`, and `next` arguments are expected to be the Express routing arguments, but they can also be mocked _(which is in fact what the Hapi plugin does)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.rebuildDefaultViewModel(done?)`\n\n    Once Taunus has been mounted, calling this method will rebuild the view model defaults using the `getDefaultViewModel` that was passed to `taunus.mount` in the options. An optional `done` callback will be invoked when the model is rebuilt.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # HTTP Framework Plugins\n\n    There's currently two different HTTP frameworks _([Express][2] and [Hapi][3])_ that you can readily use with Taunus without having to deal with any of the route plumbing yourself.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-express`\n\n    The `taunus-express` plugin is probably the easiest to use, as Taunus was originally developed with just [Express][2] in mind. In addition to the options already outlined for [taunus.mount](#-taunus-mount-addroute-options-), you can add middleware for any route individually.\n\n    - `middleware` are any methods you want Taunus to execute as middleware in Express applications\n\n    To get `taunus-express` going you can use the following piece of code, provided that you come up with an `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      // ...\n    };\n\n    taunusExpress(taunus, app, options);\n    ```\n\n    The `taunusExpress` method will merely set up Taunus and add the relevant routes to your Express application by calling `app.get` a bunch of times. You can [find taunus-express on GitHub][7].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-hapi`\n\n    The `taunus-hapi` plugin is a bit more involved, and you'll have to create a Pack in order to use it. In addition to [the options we've already covered](#-taunus-mount-addroute-options-), you can add `config` on any route.\n\n    - `config` is passed directly into the route registered with Hapi, giving you the most flexibility\n\n    To get `taunus-hapi` going you can use the following piece of code, and you can bring your own `options` object.\n\n    ```js\n    'use strict';\n\n    var Hapi = require('hapi');\n    var taunus = require('taunus');\n    var taunusHapi = require('taunus-hapi')(taunus);\n    var pack = new Hapi.Pack();\n\n    pack.register({\n      plugin: taunusHapi,\n      options: {\n        // ...\n      }\n    });\n    ```\n\n    The `taunusHapi` plugin will mount Taunus and register all of the necessary routes. You can [find taunus-hapi on GitHub][8].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Command-Line Interface\n\n    Once you've set up the server-side to render your views using Taunus, it's only logical that you'll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.\n\n    The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.\n\n    Install it globally for development, but remember to use local copies for production-grade uses.\n\n    ```shell\n    npm install -g taunus\n    ```\n\n    When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.\n\n    ```shell\n    taunus\n    ```\n\n    By default, the output will be printed to the standard output, making for a fast debugging experience. Here's the output if you just had a single `home/index` route, and the matching view and client-side controller existed.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n      'home/index': require('../client/js/controllers/home/index.js')\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    You can use a few options to alter the outcome of invoking `taunus`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--output`\n\n    <sub>the `-o` alias is available</sub>\n\n    Output is written to a file instead of to standard output. The file path used will be the `client_wiring` option in [`.taunusrc`](#the-taunusrc-manifest), which defaults to `'.bin/wiring.js'`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--watch`\n\n    <sub>the `-w` alias is available</sub>\n\n    Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether `--output` was used.\n\n    The program won't exit.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--transform <module>`\n\n    <sub>the `-t` alias is available</sub>\n\n    This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the [`hapiify`][9] module.\n\n    ```shell\n    npm install hapiify\n    taunus -t hapiify\n    ```\n\n    Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--resolvers <module>`\n\n    <sub>the `-r` alias is available</sub>\n\n    Similarly to the [`resolvers`](#-options-resolvers-) option that you can pass to [`taunus.mount`](#-taunus-mount-addroute-options-), these resolvers can change the way in which file paths are resolved.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getClientController(action)` | Return path to client-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--standalone`\n\n    <sub>the `-s` alias is available</sub>\n\n    Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus [as a UMD module][10].\n\n    This would allow you to use Taunus on the client-side even if you don't want to use [Browserify][11] directly.\n\n    Feedback and suggestions about this flag, _and possible alternatives that would make Taunus easier to use_, are welcome.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-side API\n\n    Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(container, wiring, options?)`\n\n    The mountpoint takes a root container, the wiring module, and an options parameter. The `container` is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the `wiring` module exactly as built by the CLI, and no further configuration is necessary.\n\n    When the mountpoint executes, Taunus will configure its internal state, _set up the client-side router_, run the client-side controller for the server-side rendered view, and start hijacking links.\n\n    As an example, consider a browser makes a `GET` request for `/articles/the-fox` for the first time. Once `taunus.mount(container, wiring)` is invoked on the client-side, several things would happen in the order listed below.\n\n    - Taunus sets up the client-side view routing engine\n    - If enabled _(via `options`)_, the caching engine is configured\n    - Taunus obtains the view model _(more on this later)_\n    - When a view model is obtained, the `'start'` event is emitted\n    - Anchor links start being monitored for clicks _(at this point your application becomes a [SPA][13])_\n    - The `articles/article` client-side controller is executed\n\n    That's quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, _rather than on the server-side!_\n\n    In order to better understand the process, I'll walk you through the `options` parameter.\n\n    First off, the `bootstrap` option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: `auto` _(the default strategy)_, `inline`, or `manual`. The `auto` strategy involves the least work, which is why it's the default.\n\n    - `auto` will make an AJAX request for the view model\n    - `inline` expects you to place the model into a `<script type='text/taunus'>` tag\n    - `manual` expects you to get the view model however you want to, and then let Taunus know when it's ready\n\n    Let's go into detail about each of these strategies.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `auto` strategy\n\n    The `auto` strategy means that Taunus will make use of an AJAX request to obtain the view model. _You don't have to do anything else_ and this is the default strategy. This is the **most convenient strategy, but also the slowest** one.\n\n    It's slow because the view model won't be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and `taunus.mount` is invoked.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `inline` strategy\n\n    The `inline` strategy expects you to add a `data-taunus` attribute on the `container` element. This attribute must be equal to the `id` attribute of a `<script>` tag containing the serialized view model.\n\n    ```jade\n    div(data-taunus='model')!=partial\n    script(type='text/taunus', data-taunus='model')=JSON.stringify(model)\n    ```\n\n    Pay special attention to the fact that the model is not only made into a JSON string, _but also HTML encoded by Jade_. When Taunus extracts the model from the `<script>` tag it'll unescape it, and then parse it as JSON.\n\n    This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.\n\n    That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `manual` strategy\n\n    The `manual` strategy is the most involved of the three, but also the most performant. In this strategy you're supposed to add the following _(seemingly pointless)_ snippet of code in a `<script>` other than the one that's pulling down Taunus, so that they are pulled concurrently rather than serially.\n\n    ```js\n    'use strict';\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n    ```\n\n    Once you somehow get your hands on the view model, you should invoke `taunusReady(model)`. Considering you'll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.\n\n    - The view model is loaded first, you call `taunusReady(model)` and wait for Taunus to take the model object and boot the application as soon as `taunus.mount` is executed\n    - Taunus loads first and `taunus.mount` is called first. In this case, Taunus will replace `window.taunusReady` with a special `boot` method. When the view model finishes loading, you call `taunusReady(model)` and the application finishes booting\n\n    > If this sounds a little mind-bending it's because it is. It's not designed to be pretty, but merely to be performant.\n\n    Now that we've addressed the awkward bits, let's cover the _\"somehow get your hands on the view model\"_ aspect. My preferred method is using JSONP, as it's able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you'll probably want this to be an inline script, keeping it small is important.\n\n    The good news is that the server-side supports JSONP out the box. Here's a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.\n\n    ```js\n    'use strict';\n\n    function inject (url) {\n      var script = document.createElement('script');\n      script.src = url;\n      document.body.appendChild(script);\n    }\n\n    function injector () {\n      var search = location.search;\n      var searchQuery = search ? '&' + search.substr(1) : '';\n      var searchJson = '?json&callback=taunusReady' + searchQuery;\n      inject(location.pathname + searchJson);\n    }\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n\n    injector();\n    ```\n\n    As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching\n\n    The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the `cache` flag in the options passed to `taunus.mount` on the client-side.\n\n    If you set `cache` to `true` then cached items will be considered _\"fresh\" (valid copies of the original)_ for **15 seconds**. You can also set `cache` to a number, and that number of seconds will be used as the default instead.\n\n    Caching can also be tweaked on individual routes. For instance, you could set `{ cache: true }` when mounting Taunus and then have `{ cache: 3600 }` on a route that you want to cache for a longer period of time.\n\n    The caching layer is _seamlessly integrated_ into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in [browsers that support IndexedDB][14]. In the case of browsers that don't support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Prefetching\n\n    If caching is enabled, the next logical step is prefetching. This is enabled just by adding `prefetch: true` to the options passed to `taunus.mount`. The prefetching feature will fire for any anchor link that's trips over a `mouseover` or a `touchstart` event. If a route matches the URL in the `href`, an AJAX request will prefetch the view and cache its contents, improving perceived performance.\n\n    When links are clicked before prefetching finishes, they'll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.\n\n    #### Versioning\n\n    In order to turn on the versioning API, set the `version` field in the options when invoking `taunus.mount` **on both the server-side and the client-side, using the same value**. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.\n\n    The default version string is set to `1`. The Taunus version will be prepended to yours, resulting in a value such as `t3.0.0;v1` where Taunus is running version `3.0.0` and your application is running version `1`.\n\n    Refer to the Getting Started guide for a more detailed [analysis of the uses for versioning][15].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.on(type, fn)`\n\n    Taunus emits a series of events during its lifecycle, and `taunus.on` is the way you can tune in and listen for these events using a subscription function `fn`.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.once(type, fn)`\n\n    This method is equivalent to [`taunus.on`](#-taunus-on-type-fn-), except the event listeners will be used once and then it'll be discarded.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.off(type, fn)`\n\n    Using this method you can remove any event listeners that were previously added using `.on` or `.once`. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling `.on` or `.once`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.intercept(action?, fn)`\n\n    This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified `action`. You can also add global interceptors by omitting the `action` parameter, or setting it to `*`.\n\n    An interceptor function will receive an `event` parameter, containing a few different properties.\n\n    - `url` contains the URL that needs a view model\n    - `route` contains the full route object as you'd get from [`taunus.route(url)`](#-taunus-route-url-)\n    - `parts` is just a shortcut for `route.parts`\n    - `preventDefault(model)` allows you to suppress the need for an AJAX request, commanding Taunus to use the model you've provided instead\n    - `defaultPrevented` tells you if some other handler has prevented the default behavior\n    - `canPreventDefault` tells you if invoking `event.preventDefault` will have any effect\n    - `model` starts as `null`, and it can later become the model passed to `preventDefault`\n\n    Interceptors are asynchronous, but if an interceptor spends longer than 200ms it'll be short-circuited and calling `event.preventDefault` past that point won't have any effect.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.partial(container, action, model)`\n\n    This method provides you with access to the view-rendering engine of Taunus. You can use it to render the `action` view into the `container` DOM element, using the specified `model`. Once the view is rendered, the `render` event will be fired _(with `container, model` as arguments)_ and the client-side controller for that view will be executed.\n\n    While `taunus.partial` takes a `route` as the fourth parameter, you should omit that since it's used for internal purposes only.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.navigate(url, options)`\n\n    Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use `taunus.navigate` passing it a plain URL or anything that would cause `taunus.route(url)` to return a valid route.\n\n    By default, if `taunus.navigate(url, options)` is called with an `url` that doesn't match any client-side route, then the user will be redirected via `location.href`. In cases where the browser doesn't support the history API, `location.href` will be used as well.\n\n    There's a few options you can use to tweak the behavior of `taunus.navigate`.\n\n    Option           | Description\n    -----------------|-------------------------------------------------------------------\n    `context`        | A DOM element that caused the navigation event, used when emitting events\n    `strict`         | If set to `true` and the URL doesn't match any route, then the navigation attempt must be ignored\n    `scroll`         | When this is set to `false`, elements aren't scrolled into view after navigation\n    `force`          | Unless this is set to `true`, navigation won't _fetch a model_ if the route matches the current route, and `state.model` will be reused instead\n    `replaceState`   | Use `replaceState` instead of `pushState` when changing history\n\n    Note that the notion of _fetching a model_ might be deceiving as the model could be pulled from the cache even if `force` is set to `true`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.route(url)`\n\n    This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.\n\n    - A fully qualified URL on the same origin, e.g `http://taunus.bevacqua.io/api`\n    - An absolute URL without an origin, e.g `/api`\n    - Just a hash, e.g `#foo` _(`location.href` is used)_\n    - Falsy values, e.g `null` _(`location.href` is used)_\n\n    Relative URLs are not supported _(anything that doesn't have a leading slash)_, e.g `files/data.json`. Anything that's not on the same origin or doesn't match one of the registered routes is going to yield `null`.\n\n    _This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # `taunus.route.equals(route, route)`\n\n    Compares two routes and returns `true` if they would fetch the same model. Note that different URLs may still return `true`. For instance, `/foo` and `/foo#bar` would fetch the same model even if they're different URLs.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.state`\n\n    This is an internal state variable, and it contains a lot of useful debugging information.\n\n    - `container` is the DOM element passed to `taunus.mount`\n    - `controllers` are all the controllers, as defined in the wiring module\n    - `templates` are all the templates, as defined in the wiring module\n    - `routes` are all the routes, as defined in the wiring module\n    - `route` is a reference to the current route\n    - `model` is a reference to the model used to render the current view\n    - `prefetch` exposes whether prefetching is turned on\n    - `cache` exposes whether caching is enabled\n\n    Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The `.taunusrc` manifest\n\n    If you want to use values other than the conventional defaults shown in the table below, then you should create a `.taunusrc` file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your `package.json`, under the `taunus` property.\n\n    ```json\n    {\n      \"views\": \".bin/views\",\n      \"server_routes\": \"controllers/routes.js\",\n      \"server_controllers\": \"controllers\",\n      \"client_controllers\": \"client/js/controllers\",\n      \"client_wiring\": \".bin/wiring.js\"\n    }\n    ```\n\n    - The `views` directory is where your views _(already compiled into JavaScript)_ are placed. These views are used directly on both the server-side and the client-side\n    - The `server_routes` file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module\n    - The `server_controllers` directory is the root directory where your server-side controllers live. It's used when setting up the server-side router\n    - The `client_controllers` directory is where your client-side controller modules live. The CLI will `require` these controllers in its resulting wiring module\n    - The `client_wiring` file is where your wiring module will be placed by the CLI. You'll then have to `require` it in your application when booting up Taunus\n\n    Here is where things get [a little conventional][12]. Views, and both server-side and client-side controllers are expected to be organized by following the `{root}/{controller}/{action}` pattern, but you could change that using `resolvers` when invoking the CLI and using the server-side API.\n\n    Views and controllers are also expected to be CommonJS modules that export a single method.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: /getting-started\n    [2]: http://expressjs.com\n    [3]: http://hapijs.com\n    [4]: https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\n    [5]: https://github.com/bevacqua/hget\n    [6]: https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\n    [7]: https://github.com/taunus/taunus-express\n    [8]: https://github.com/taunus/taunus-hapi\n    [9]: https://github.com/taunus/hapiify\n    [10]: https://github.com/umdjs/umd\n    [11]: http://browserify.org\n    [12]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [13]: http://en.wikipedia.org/wiki/Single-page_application\n    [14]: http://caniuse.com/#feat=indexeddb\n    [15]: /getting-started#versioning\n");
}
}
},{"jadum/runtime":32}],8:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function complements(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/complements.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/complements.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/complements.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/complements.jade" });
buf.push("<h1 id=\"complementary-modules\">Complementary Modules</h1>\n<p>Taunus is a small library by MVC framework standards, sitting <strong>below 15kB minified and gzipped</strong>. It is designed to be small. It is also designed to do one thing well, and that&#39;s <em>being a shared-rendering MVC engine</em>.</p>\n<p>Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you <a href=\"/api\">head over to the API documentation</a>, you&#39;ll notice that the server-side API, the command-line interface, and the <code>.taunusrc</code> manifest are only concerned with providing a conventional shared-rendering MVC engine.</p>\n<p>In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you&#39;re used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.</p>\n<blockquote>\n<p>In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.</p>\n</blockquote>\n<p>Taunus attempts to bring the server-side mentality of <em>&quot;not doing everything is okay&quot;</em> into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do <strong>one thing well</strong>.</p>\n<p>In this brief article we&#39;ll recommend three different libraries that play well with Taunus, and you&#39;ll also learn how to search for modules that can give you access to other functionality you may be interested in.</p>\n<h1 id=\"using-dominus-for-dom-querying\">Using <code>dominus</code> for DOM querying</h1>\n<p><a href=\"https://github.com/bevacqua/dominus\">Dominus</a> is an extra-small DOM querying library, currently clocking below <strong>4kB minified and gzipped</strong>, almost <em>ten times smaller</em> than it&#39;s competition. Unlike jQuery and popular friends, Dominus doesn&#39;t provide AJAX features, layout math, <code>&lt;form&gt;</code> manipulation, promises, tens of event binding methods, a selector engine written in plain JavaScript, nor a myriad of utility functions. Instead, Dominus focuses solely on providing a rich DOM querying and manipulation API that gets rid of inconsistencies across browsers.</p>\n<h1 id=\"using-xhr-to-make-ajax-requests\">Using <code>xhr</code> to make AJAX requests</h1>\n<h1 id=\"using-measly-as-an-upgrade-to-xhr-\">Using <code>measly</code> as an upgrade to <code>xhr</code></h1>\n<h1 id=\"complementing-your-code-with-small-modules\">Complementing your code with small modules</h1>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Complementary Modules\n\n    Taunus is a small library by MVC framework standards, sitting **below 15kB minified and gzipped**. It is designed to be small. It is also designed to do one thing well, and that's _being a shared-rendering MVC engine_.\n\n    Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you [head over to the API documentation][1], you'll notice that the server-side API, the command-line interface, and the `.taunusrc` manifest are only concerned with providing a conventional shared-rendering MVC engine.\n\n    In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you're used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.\n\n    > In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.\n\n    Taunus attempts to bring the server-side mentality of _\"not doing everything is okay\"_ into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do **one thing well**.\n\n    In this brief article we'll recommend three different libraries that play well with Taunus, and you'll also learn how to search for modules that can give you access to other functionality you may be interested in.\n\n    # Using `dominus` for DOM querying\n\n    [Dominus][2] is an extra-small DOM querying library, currently clocking below **4kB minified and gzipped**, almost _ten times smaller_ than it's competition. Unlike jQuery and popular friends, Dominus doesn't provide AJAX features, layout math, `<form>` manipulation, promises, tens of event binding methods, a selector engine written in plain JavaScript, nor a myriad of utility functions. Instead, Dominus focuses solely on providing a rich DOM querying and manipulation API that gets rid of inconsistencies across browsers.\n\n    # Using `xhr` to make AJAX requests\n\n    # Using `measly` as an upgrade to `xhr`\n\n    # Complementing your code with small modules\n\n    [1]: /api\n    [2]: https://github.com/bevacqua/dominus\n    [3]: https://github.com/bevacqua/measly\n    [4]: https://github.com/Raynos/xhr\n");
}
}
},{"jadum/runtime":32}],9:[function(require,module,exports){
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
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#compiling-your-client-side-javascript\">Compiling your client-side JavaScript</a></li>\n<li><a href=\"#using-the-client-side-taunus-api\">Using the client-side Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n<li><a href=\"#versioning\">Versioning</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">mkdir getting-started\ncd getting-started\nnpm init\nnpm install --save taunus taunus-express express\n</code></pre>\n<p><img src=\"http://i.imgur.com/4P8vNe9.png\" alt=\"Screenshot with `npm init` output\"></p>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/n8mH4mN.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>routes</code> should be an array of view routes</li>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that <a href=\"/api\">in the API documentation</a>, but it defaults to <code>{}</code>)</em>.</p>\n<p>Here&#39;s what you&#39;d get if you attempted to run the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/08lnCec.png\" alt=\"Screenshot with `node app` results\"></p>\n<p>Turns out you&#39;re missing a lot of things! Taunus is quite lenient and it&#39;ll try its best to let you know what you might be missing, though. Apparently you don&#39;t have a layout, a server-side controller, or even a view! <em>That&#39;s rough.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;use the following combination of plain text and the <strong>(maybe HTML)</strong> partial view&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return &#39;This is the partial: &quot;&#39; + model.partial + &#39;&quot;&#39;;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Here&#39;s what you&#39;d get if you ran the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/wUbnCyk.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>At this point we have a layout, but we&#39;re still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you&#39;re trying to get an MVC engine up and running, right?</p>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">mkdir -p views/home\ntouch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install --global jadum\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/zjaJYCq.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>Granted, you should <em>probably</em> move the layout into a Jade <em>(any view engine will do)</em> template as well.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">mkdir -p controllers/home\ntouch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template!</p>\n<pre><code class=\"lang-shell\">rm layout.js\ntouch views/layout.jade\njadum views/** --output .bin\n</code></pre>\n<p>You should also remember to update the <code>app.js</code> module once again!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The <code>!=</code> syntax below means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/NvEWx9z.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>You can now visit <code>localhost:3000</code> with your favorite web browser and you&#39;ll notice that the view renders as you&#39;d expect. The title will be properly set, and a <code>&lt;main&gt;</code> element will have the contents of your view.</p>\n<p><img src=\"http://i.imgur.com/LgZRFn5.png\" alt=\"Screenshot with application running on Google Chrome\"></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>Then there&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install --global taunus\n</code></pre>\n<p>Before you can use the CLI, you should move the route definitions to <code>controllers/routes.js</code>. That&#39;s where Taunus expects them to be. If you want to place them something else, <a href=\"/api\">the API documentation can help you</a>.</p>\n<pre><code class=\"lang-shell\">mv routes.js controllers/routes.js\n</code></pre>\n<p>Since you moved the routes you should also update the <code>require</code> statement in the <code>app.js</code> module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;),\n  &#39;layout&#39;: require(&#39;./views/layout.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p><img src=\"http://i.imgur.com/fJnHdYi.png\" alt=\"Screenshot with `taunus` output\"></p>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<p>The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use <code>client/js</code> to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let&#39;s stick to the conventions.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js\ntouch client/js/main.js\n</code></pre>\n<p>The <code>main</code> module will be used as the <em>entry point</em> of your application on the client-side. Here you&#39;ll need to import <code>taunus</code>, the wiring module we&#39;ve just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke <code>taunus.mount</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar wiring = require(&#39;../../.bin/wiring&#39;);\nvar main = document.getElementsByTagName(&#39;main&#39;)[0];\n\ntaunus.mount(main, wiring);\n</code></pre>\n<p>The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.</p>\n<p>By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won&#39;t be functional until the client-side controller runs.</p>\n<p>An alternative is to inline the view model alongside the views in a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag, but this tends to slow down the initial response (models are <em>typically larger</em> than the resulting views).</p>\n<p>A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that&#39;s harder to set up.</p>\n<p>The three booting strategies are explained in <a href=\"/api\">the API documentation</a> and further discussed in <a href=\"/performance\">the optimization guide</a>. For now, the default strategy <em>(<code>&#39;auto&#39;</code>)</em> should suffice. It fetches the view model using an AJAX request right after Taunus loads.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>Client-side controllers run whenever a view is rendered, even if it&#39;s a partial. The controller is passed the <code>model</code>, containing the model that was used to render the view; the <code>route</code>, broken down into its components; and the <code>container</code>, which is whatever DOM element the view was rendered into.</p>\n<p>These controllers are entirely optional, which makes sense since we&#39;re progressively enhancing the application: it might not even be necessary! Let&#39;s add some client-side functionality to the example we&#39;ve been building.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js/controllers/home\ntouch client/js/controllers/home/index.js\n</code></pre>\n<p>Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we&#39;ll just print the action and the model to the console. If there&#39;s one place where you&#39;d want to enhance the experience, client-side controllers are where you want to put your code.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model, container, route) {\n  console.log(&#39;Rendered view %s using model:\\n%s&#39;, route.action, JSON.stringify(model, null, 2));\n};\n</code></pre>\n<p>Since we weren&#39;t using the <code>--watch</code> flag from the Taunus CLI, you&#39;ll have to recompile the wiring at this point, so that the controller gets added to that manifest.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>Of course, you&#39;ll now have to wire up the client-side JavaScript using <a href=\"http://browserify.org/\">Browserify</a>!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"compiling-your-client-side-javascript\">Compiling your client-side JavaScript</h4>\n<p>You&#39;ll need to compile the <code>client/js/main.js</code> module, our client-side application&#39;s entry point, using Browserify since the code is written using CommonJS. In this example you&#39;ll install <code>browserify</code> globally to compile the code, but naturally you&#39;ll install it locally when working on a real-world application.</p>\n<pre><code class=\"lang-shell\">npm install --global browserify\n</code></pre>\n<p>Once you have the Browserify CLI, you&#39;ll be able to compile the code right from your command line. The <code>-d</code> flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The <code>-o</code> flag redirects output to the indicated file, whereas the output is printed to standard output by default.</p>\n<pre><code class=\"lang-shell\">mkdir -p .bin/public/js\nbrowserify client/js/main.js -do .bin/public/js/all.js\n</code></pre>\n<p>We haven&#39;t done much of anything with the Express application, so you&#39;ll need to adjust the <code>app.js</code> module to serve static assets. If you&#39;re used to Express, you&#39;ll notice there&#39;s nothing special about how we&#39;re using <code>serve-static</code>.</p>\n<pre><code class=\"lang-shell\">npm install --save serve-static\n</code></pre>\n<p>Let&#39;s configure the application to serve static assets from <code>.bin/public</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar serveStatic = require(&#39;serve-static&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\napp.use(serveStatic(&#39;.bin/public&#39;));\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Next up, you&#39;ll have to edit the layout to include the compiled JavaScript bundle file.</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\nscript(src=&#39;/js/all.js&#39;)\n</code></pre>\n<p>Lastly, you can execute the application and see it in action!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/68O84wX.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>If you open the application on a web browser, you&#39;ll notice that the appropriate information will be logged into the developer <code>console</code>.</p>\n<p><img src=\"http://i.imgur.com/ZUF6NFl.png\" alt=\"Screenshot with the application running under Google Chrome\"></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-client-side-taunus-api\">Using the client-side Taunus API</h4>\n<p>Taunus does provide <a href=\"/api\">a thin API</a> in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there&#39;s a few methods you can take advantage of on a global scale as well.</p>\n<p>Taunus can notify you whenever important events occur.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Besides events, there&#39;s a couple more methods you can use. The <code>taunus.navigate</code> method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there&#39;s <code>taunus.partial</code>, and that allows you to render any partial view on a DOM element of your choosing, and it&#39;ll then invoke its controller. You&#39;ll need to come up with the model yourself, though.</p>\n<p>Astonishingly, the API is further documented in <a href=\"/api\">the API documentation</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p><a href=\"/performance\">Performance</a> plays an important role in Taunus. That&#39;s why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?</p>\n<p>When turned on, by passing <code>{ cache: true }</code> as the third parameter for <code>taunus.mount</code>, the caching layer will make sure that responses are kept around for <code>15</code> seconds. Whenever a route needs a model in order to render a view, it&#39;ll first ask the caching layer for a fresh copy. If the caching layer doesn&#39;t have a copy, or if that copy is stale <em>(in this case, older than <code>15</code> seconds)</em>, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set <code>cache</code> to a number in seconds instead of just <code>true</code>.</p>\n<p>Since Taunus understands that not every view operates under the same constraints, you&#39;re also able to set a <code>cache</code> freshness duration directly in your routes. The <code>cache</code> property in routes has precedence over the default value.</p>\n<p>There&#39;s currently two caching stores: a raw in-memory store, and an <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">IndexedDB</a> store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of <code>localStorage</code>. It has <a href=\"http://caniuse.com/#feat=indexeddb\">surprisingly broad browser support</a>, and in the cases where it&#39;s not supported then caching is done solely in-memory.</p>\n<p>The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them <em>(the <code>touchstart</code> event)</em>, the prefetcher will issue an AJAX request for the view model for that link.</p>\n<p>If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their <em>(possibly limited)</em> Internet connection bandwidth.</p>\n<p>If the human clicks on the link before prefetching is completed, he&#39;ll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.</p>\n<p>Turning prefetching on is simply a matter of setting <code>prefetch</code> to <code>true</code> in the options passed to <code>taunus.mount</code>. For additional insights into the performance improvements Taunus can offer, head over to the <a href=\"/performance\">Performance Optimizations</a> guide.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"versioning\">Versioning</h4>\n<p>When you alter your views, change controllers, or modify the models, chances are the client-side is going to come across one of the following issues.</p>\n<ul>\n<li>Outdated view template functions in the client-side, causing new models to break</li>\n<li>Outdated client-side controllers, causing new models to break or miss out on functionality</li>\n<li>Outdated models in the cache, causing new views or controllers to break</li>\n</ul>\n<p>The versioning API handles these issues gracefully on your behalf. The way it works is that whenever you get a response from Taunus, a <em>version string (configured on the server-side)</em> is included with it. If that version string doesn&#39;t match the one stored in the client, then the cache will be flushed and the human will be redirected, forcing a full page reload.</p>\n<blockquote>\n<p>The versioning API is unable to handle changes to routes, and it&#39;s up to you to make sure that the application stays backwards compatible when it comes to routing.</p>\n<p>The versioning API can&#39;t intervene when the client-side is heavily relying on cached views and models, and the human is refusing to reload their browser. The server isn&#39;t being accessed and thus it can&#39;t communicate that everything on the cache may have become stale. The good news is that the human won&#39;t notice any oddities, as the site will continue to work as he knows it. When he finally attempts to visit something that isn&#39;t cached, a request is made, and the versioning engine resolves version discrepancies for them.</p>\n</blockquote>\n<p>Making use of the versioning API involves setting the <code>version</code> field in the options, when invoking <code>taunus.mount</code> <strong>on both the server-side and the client-side, using the same value</strong>. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.</p>\n<p>You may use your build identifier or the <code>version</code> field in <code>package.json</code>, but understand that it may cause the client-side to flush the cache too often <em>(maybe even on every deployment)</em>.</p>\n<p>The default version string is set to <code>1</code>. The Taunus version will be prepended to yours, resulting in a value such as <code>t3.0.0;v1</code> where Taunus is running version <code>3.0.0</code> and your application is running version <code>1</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<blockquote>\n<p>You&#39;ll find a <a href=\"https://github.com/taunus/getting-started\">full fledged version of the Getting Started</a> tutorial application on GitHub.</p>\n</blockquote>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Your first route](#your-first-route)\n      - [Creating a layout](#creating-a-layout)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Compiling your client-side JavaScript](#compiling-your-client-side-javascript)\n      - [Using the client-side Taunus API](#using-the-client-side-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n      - [Versioning](#versioning)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    mkdir getting-started\n    cd getting-started\n    npm init\n    npm install --save taunus taunus-express express\n    ```\n\n    ![Screenshot with `npm init` output][30]\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][31]\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `routes` should be an array of view routes\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that [in the API documentation][18], but it defaults to `{}`)_.\n\n    Here's what you'd get if you attempted to run the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` results][32]\n\n    Turns out you're missing a lot of things! Taunus is quite lenient and it'll try its best to let you know what you might be missing, though. Apparently you don't have a layout, a server-side controller, or even a view! _That's rough._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"use the following combination of plain text and the **(maybe HTML)** partial view\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return 'This is the partial: \"' + model.partial + '\"';\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Here's what you'd get if you ran the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][33]\n\n    At this point we have a layout, but we're still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you're trying to get an MVC engine up and running, right?\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    mkdir -p views/home\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install --global jadum\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][34]\n\n    Granted, you should _probably_ move the layout into a Jade _(any view engine will do)_ template as well.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    mkdir -p controllers/home\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template!\n\n    ```shell\n    rm layout.js\n    touch views/layout.jade\n    jadum views/** --output .bin\n    ```\n\n    You should also remember to update the `app.js` module once again!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The `!=` syntax below means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][35]\n\n    You can now visit `localhost:3000` with your favorite web browser and you'll notice that the view renders as you'd expect. The title will be properly set, and a `<main>` element will have the contents of your view.\n\n    ![Screenshot with application running on Google Chrome][36]\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    Then there's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install --global taunus\n    ```\n\n    Before you can use the CLI, you should move the route definitions to `controllers/routes.js`. That's where Taunus expects them to be. If you want to place them something else, [the API documentation can help you][18].\n\n    ```shell\n    mv routes.js controllers/routes.js\n    ```\n\n    Since you moved the routes you should also update the `require` statement in the `app.js` module.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js'),\n      'layout': require('./views/layout.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    ![Screenshot with `taunus` output][37]\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use `client/js` to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let's stick to the conventions.\n\n    ```shell\n    mkdir -p client/js\n    touch client/js/main.js\n    ```\n\n    The `main` module will be used as the _entry point_ of your application on the client-side. Here you'll need to import `taunus`, the wiring module we've just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke `taunus.mount`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var wiring = require('../../.bin/wiring');\n    var main = document.getElementsByTagName('main')[0];\n\n    taunus.mount(main, wiring);\n    ```\n\n    The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.\n\n    By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won't be functional until the client-side controller runs.\n\n    An alternative is to inline the view model alongside the views in a `<script type='text/taunus'>` tag, but this tends to slow down the initial response (models are _typically larger_ than the resulting views).\n\n    A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that's harder to set up.\n\n    The three booting strategies are explained in [the API documentation][18] and further discussed in [the optimization guide][25]. For now, the default strategy _(`'auto'`)_ should suffice. It fetches the view model using an AJAX request right after Taunus loads.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    Client-side controllers run whenever a view is rendered, even if it's a partial. The controller is passed the `model`, containing the model that was used to render the view; the `route`, broken down into its components; and the `container`, which is whatever DOM element the view was rendered into.\n\n    These controllers are entirely optional, which makes sense since we're progressively enhancing the application: it might not even be necessary! Let's add some client-side functionality to the example we've been building.\n\n    ```shell\n    mkdir -p client/js/controllers/home\n    touch client/js/controllers/home/index.js\n    ```\n\n    Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we'll just print the action and the model to the console. If there's one place where you'd want to enhance the experience, client-side controllers are where you want to put your code.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model, container, route) {\n      console.log('Rendered view %s using model:\\n%s', route.action, JSON.stringify(model, null, 2));\n    };\n    ```\n\n    Since we weren't using the `--watch` flag from the Taunus CLI, you'll have to recompile the wiring at this point, so that the controller gets added to that manifest.\n\n    ```shell\n    taunus --output\n    ```\n\n    Of course, you'll now have to wire up the client-side JavaScript using [Browserify][38]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Compiling your client-side JavaScript\n\n    You'll need to compile the `client/js/main.js` module, our client-side application's entry point, using Browserify since the code is written using CommonJS. In this example you'll install `browserify` globally to compile the code, but naturally you'll install it locally when working on a real-world application.\n\n    ```shell\n    npm install --global browserify\n    ```\n\n    Once you have the Browserify CLI, you'll be able to compile the code right from your command line. The `-d` flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The `-o` flag redirects output to the indicated file, whereas the output is printed to standard output by default.\n\n    ```shell\n    mkdir -p .bin/public/js\n    browserify client/js/main.js -do .bin/public/js/all.js\n    ```\n\n    We haven't done much of anything with the Express application, so you'll need to adjust the `app.js` module to serve static assets. If you're used to Express, you'll notice there's nothing special about how we're using `serve-static`.\n\n    ```shell\n    npm install --save serve-static\n    ```\n\n    Let's configure the application to serve static assets from `.bin/public`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var serveStatic = require('serve-static');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    app.use(serveStatic('.bin/public'));\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Next up, you'll have to edit the layout to include the compiled JavaScript bundle file.\n\n    ```jade\n    title=model.title\n    main!=partial\n    script(src='/js/all.js')\n    ```\n\n    Lastly, you can execute the application and see it in action!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][39]\n\n    If you open the application on a web browser, you'll notice that the appropriate information will be logged into the developer `console`.\n\n    ![Screenshot with the application running under Google Chrome][40]\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the client-side Taunus API\n\n    Taunus does provide [a thin API][18] in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there's a few methods you can take advantage of on a global scale as well.\n\n    Taunus can notify you whenever important events occur.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Besides events, there's a couple more methods you can use. The `taunus.navigate` method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there's `taunus.partial`, and that allows you to render any partial view on a DOM element of your choosing, and it'll then invoke its controller. You'll need to come up with the model yourself, though.\n\n    Astonishingly, the API is further documented in [the API documentation][18].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    [Performance][25] plays an important role in Taunus. That's why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?\n\n    When turned on, by passing `{ cache: true }` as the third parameter for `taunus.mount`, the caching layer will make sure that responses are kept around for `15` seconds. Whenever a route needs a model in order to render a view, it'll first ask the caching layer for a fresh copy. If the caching layer doesn't have a copy, or if that copy is stale _(in this case, older than `15` seconds)_, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set `cache` to a number in seconds instead of just `true`.\n\n    Since Taunus understands that not every view operates under the same constraints, you're also able to set a `cache` freshness duration directly in your routes. The `cache` property in routes has precedence over the default value.\n\n    There's currently two caching stores: a raw in-memory store, and an [IndexedDB][28] store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of `localStorage`. It has [surprisingly broad browser support][29], and in the cases where it's not supported then caching is done solely in-memory.\n\n    The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them _(the `touchstart` event)_, the prefetcher will issue an AJAX request for the view model for that link.\n\n    If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their _(possibly limited)_ Internet connection bandwidth.\n\n    If the human clicks on the link before prefetching is completed, he'll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.\n\n    Turning prefetching on is simply a matter of setting `prefetch` to `true` in the options passed to `taunus.mount`. For additional insights into the performance improvements Taunus can offer, head over to the [Performance Optimizations][25] guide.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Versioning\n\n    When you alter your views, change controllers, or modify the models, chances are the client-side is going to come across one of the following issues.\n\n    - Outdated view template functions in the client-side, causing new models to break\n    - Outdated client-side controllers, causing new models to break or miss out on functionality\n    - Outdated models in the cache, causing new views or controllers to break\n\n    The versioning API handles these issues gracefully on your behalf. The way it works is that whenever you get a response from Taunus, a _version string (configured on the server-side)_ is included with it. If that version string doesn't match the one stored in the client, then the cache will be flushed and the human will be redirected, forcing a full page reload.\n\n    > The versioning API is unable to handle changes to routes, and it's up to you to make sure that the application stays backwards compatible when it comes to routing.\n    >\n    > The versioning API can't intervene when the client-side is heavily relying on cached views and models, and the human is refusing to reload their browser. The server isn't being accessed and thus it can't communicate that everything on the cache may have become stale. The good news is that the human won't notice any oddities, as the site will continue to work as he knows it. When he finally attempts to visit something that isn't cached, a request is made, and the versioning engine resolves version discrepancies for them.\n\n    Making use of the versioning API involves setting the `version` field in the options, when invoking `taunus.mount` **on both the server-side and the client-side, using the same value**. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.\n\n    You may use your build identifier or the `version` field in `package.json`, but understand that it may cause the client-side to flush the cache too often _(maybe even on every deployment)_.\n\n    The default version string is set to `1`. The Taunus version will be prepended to yours, resulting in a value such as `t3.0.0;v1` where Taunus is running version `3.0.0` and your application is running version `1`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    > You'll find a [full fledged version of the Getting Started][41] tutorial application on GitHub.\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n    [28]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [29]: http://caniuse.com/#feat=indexeddb\n    [30]: http://i.imgur.com/4P8vNe9.png\n    [31]: http://i.imgur.com/n8mH4mN.png\n    [32]: http://i.imgur.com/08lnCec.png\n    [33]: http://i.imgur.com/wUbnCyk.png\n    [34]: http://i.imgur.com/zjaJYCq.png\n    [35]: http://i.imgur.com/NvEWx9z.png\n    [36]: http://i.imgur.com/LgZRFn5.png\n    [37]: http://i.imgur.com/fJnHdYi.png\n    [38]: http://browserify.org/\n    [39]: http://i.imgur.com/68O84wX.png\n    [40]: http://i.imgur.com/ZUF6NFl.png\n    [41]: https://github.com/taunus/getting-started\n");
}
}
},{"jadum/runtime":32}],10:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function performance(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/performance.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/performance.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/performance.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/performance.jade" });
buf.push("<h1 id=\"performance-optimization\">Performance Optimization</h1>\n<p>Foo</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Performance Optimization\n\n    Foo\n");
}
}
},{"jadum/runtime":32}],11:[function(require,module,exports){
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
},{"jadum/runtime":32}],12:[function(require,module,exports){
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
buf.push("<aside class=\"sb-sidebar\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 19, filename: "views/layout.jade" });
buf.push("<nav class=\"sb-container\">");
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
jade_debug.unshift({ lineno: 33, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 34, filename: "views/layout.jade" });
buf.push("<a href=\"/changelog\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 34, filename: jade_debug[0].filename });
buf.push("Changelog");
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
jade_debug.unshift({ lineno: 36, filename: "views/layout.jade" });
buf.push("<main id=\"application-root\" data-taunus=\"model\" class=\"ly-main\">" + (null == (jade_interp = partial) ? "" : jade_interp));
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.shift();
buf.push("</main>");
jade_debug.shift();
jade_debug.unshift({ lineno: 37, filename: "views/layout.jade" });
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
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "doctype html\nhtml(lang='en', itemscope, itemtype='http://schema.org/Blog')\n  head\n    title=model.title\n    meta(charset='utf-8')\n    link(rel='shortcut icon', href='/favicon.ico')\n    meta(http-equiv='X-UA-Compatible', content='IE=edge,chrome=1')\n    meta(name='viewport', content='width=device-width, initial-scale=1')\n    link(rel='stylesheet', type='text/css', href='/css/all.css')\n    link(rel='stylesheet', type='text/css', href='http://fonts.googleapis.com/css?family=Unica+One:400|Playfair+Display:700|Megrim:700|Fauna+One:400italic,400,700')\n\n  body#top\n    header\n      h1\n        a.ly-title(href='/', aria-label='Go to home') Taunus\n      h2.ly-subheading Micro Isomorphic MVC Engine for Node.js\n\n    aside.sb-sidebar\n      nav.sb-container\n        ul.nv-items\n          li.nv-item\n            a(href='/') About\n          li.nv-item\n            a(href='/getting-started') Getting Started\n          li.nv-item\n            a(href='/api') API Documentation\n          li.nv-item\n            a(href='/complements') Complementary Modules\n          li.nv-item\n            a(href='/performance') Performance Optimization\n          li.nv-item\n            a(href='/source-code') Source Code\n          li.nv-item\n            a(href='/changelog') Changelog\n\n    main.ly-main#application-root(data-taunus='model')!=partial\n    script(src='/js/all.js')\n");
}
}
},{"jadum/runtime":32}],13:[function(require,module,exports){
'use strict';

var templates = {
  'documentation/about': require('./views/documentation/about.js'),
  'documentation/api': require('./views/documentation/api.js'),
  'documentation/complements': require('./views/documentation/complements.js'),
  'documentation/getting-started': require('./views/documentation/getting-started.js'),
  'documentation/performance': require('./views/documentation/performance.js'),
  'error/not-found': require('./views/error/not-found.js'),
  'layout': require('./views/layout.js')
};

var controllers = {
  'documentation/about': require('../client/js/controllers/documentation/about.js')
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
  '/changelog': {
    ignore: true
  },
  '/:catchall*': {
    action: 'error/not-found'
  }
};

module.exports = {
  templates: templates,
  controllers: controllers,
  routes: routes
};

},{"../client/js/controllers/documentation/about.js":14,"./views/documentation/about.js":6,"./views/documentation/api.js":7,"./views/documentation/complements.js":8,"./views/documentation/getting-started.js":9,"./views/documentation/performance.js":10,"./views/error/not-found.js":11,"./views/layout.js":12}],14:[function(require,module,exports){
'use strict';

module.exports = function () {
  console.log('Welcome to Taunus documentation mini-site!');
};

},{}],15:[function(require,module,exports){
'use strict';

var $ = require('dominus');
var raf = require('raf');
var taunus = require('taunus');
var throttle = require('./throttle');
var slowScrollCheck = throttle(scrollCheck, 50);
var hx = /^h[1-6]$/i;
var heading;

function conventions (container) {
  $('body').on('click', 'h1,h2,h3,h4,h5,h6', headingClick);

  raf(scroll);
}

function scroll () {
  slowScrollCheck();
  raf(scroll);
}

function scrollCheck () {
  var found = $('main').find('h1,h2,h3,h4,h5,h6').filter(inViewport);
  if (found.length === 0 || heading && found[0] === heading[0]) {
    return;
  }
  if (heading) {
    heading.removeClass('uv-highlight');
  }
  heading = found.i(0);
  heading.addClass('uv-highlight');
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

function findHeading (e) {
  var h = e.target;
  while (h && !hx.test(h.tagName)) {
    h = h.parentElement;
  }
  return h;
}

function headingClick (e) {
  var h = findHeading(e);
  if (h && h.id) {
    taunus.navigate('#' + h.id);
  }
}

module.exports = conventions;

},{"./throttle":17,"dominus":26,"raf":33,"taunus":43}],16:[function(require,module,exports){
(function (global){
'use strict';

// import the taunus module
var taunus = require('taunus');

// import the wiring module exported by Taunus
var wiring = require('../../.bin/wiring');

// import conventions
var conventions = require('./conventions');

// get the <main> element
var main = document.getElementById('application-root');

// set up conventions that get executed for every view
taunus.on('render', conventions);

// mount taunus so it starts its routing engine
taunus.mount(main, wiring);

// create globals to make it easy to debug
// don't do this in production!
global.$ = require('dominus');
global.taunus = taunus;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../../.bin/wiring":13,"./conventions":15,"dominus":26,"taunus":43}],17:[function(require,module,exports){
(function (global){
'use strict';

function throttle (fn, t) {
  var cache;
  var last = -1;
  return function throttled () {
    var now = Date.now();
    if (now - last > t) {
      cache = fn.apply(this, arguments);
      last = now;
    }
    return cache;
  };
}

module.exports = throttle;
global.throttle=throttle;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],18:[function(require,module,exports){
var poser = require('./src/node');

module.exports = poser;

['Array', 'Function', 'Object', 'Date', 'String'].forEach(pose);

function pose (type) {
  poser[type] = function poseComputedType () { return poser(type); };
}

},{"./src/node":19}],19:[function(require,module,exports){
(function (global){
'use strict';

var d = global.document;

function poser (type) {
  var iframe = d.createElement('iframe');

  iframe.style.display = 'none';
  d.body.appendChild(iframe);

  return map(type, iframe.contentWindow);
}

function map (type, source) { // forward polyfills to the stolen reference!
  var original = window[type].prototype;
  var value = source[type];
  var prop;

  for (prop in original) {
    value.prototype[prop] = original[prop];
  }

  return value;
}

module.exports = poser;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],20:[function(require,module,exports){
(function (global){
'use strict';

var expando = 'sektor-' + Date.now();
var rsiblings = /[+~]/;
var document = global.document;
var del = document.documentElement;
var match = del.matches ||
            del.webkitMatchesSelector ||
            del.mozMatchesSelector ||
            del.oMatchesSelector ||
            del.msMatchesSelector;

function qsa (selector, context) {
  var existed, id, prefix, prefixed, adapter, hack = context !== document;
  if (hack) { // id hack for context-rooted queries
    existed = context.getAttribute('id');
    id = existed || expando;
    prefix = '#' + id + ' ';
    prefixed = prefix + selector.replace(/,/g, ',' + prefix);
    adapter = rsiblings.test(selector) && context.parentNode;
    if (!existed) { context.setAttribute('id', id); }
  }
  try {
    return (adapter || context).querySelectorAll(prefixed || selector);
  } catch (e) {
    return [];
  } finally {
    if (existed === null) { context.removeAttribute('id'); }
  }
}

function find (selector, ctx, collection, seed) {
  var element;
  var context = ctx || document;
  var results = collection || [];
  var i = 0;
  if (typeof selector !== 'string') {
    return results;
  }
  if (context.nodeType !== 1 && context.nodeType !== 9) {
    return []; // bail if context is not an element or document
  }
  if (seed) {
    while ((element = seed[i++])) {
      if (matchesSelector(element, selector)) {
        results.push(element);
      }
    }
  } else {
    results.push.apply(results, qsa(selector, context));
  }
  return results;
}

function matches (selector, elements) {
  return find(selector, null, null, elements);
}

function matchesSelector (element, selector) {
  return match.call(element, selector);
}

module.exports = find;

find.matches = matches;
find.matchesSelector = matchesSelector;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],21:[function(require,module,exports){
'use strict';

var poser = require('poser');
var Dominus = poser.Array();

module.exports = Dominus;

},{"poser":18}],22:[function(require,module,exports){
'use strict';

var $ = require('./public');
var core = require('./core');
var dom = require('./dom');
var classes = require('./classes');
var Dominus = require('./Dominus.ctor');

function equals (selector) {
  return function equals (elem) {
    return dom.matches(elem, selector);
  };
}

function straight (prop, one) {
  return function domMapping (selector) {
    var result = this.map(function (elem) {
      return dom[prop](elem, selector);
    });
    var results = core.flatten(result);
    return one ? results[0] : results;
  };
}

Dominus.prototype.prev = straight('prev');
Dominus.prototype.next = straight('next');
Dominus.prototype.parent = straight('parent');
Dominus.prototype.parents = straight('parents');
Dominus.prototype.children = straight('children');
Dominus.prototype.find = straight('qsa');
Dominus.prototype.findOne = straight('qs', true);

Dominus.prototype.where = function (selector) {
  return this.filter(equals(selector));
};

Dominus.prototype.is = function (selector) {
  return this.some(equals(selector));
};

Dominus.prototype.i = function (index) {
  return new Dominus(this[index]);
};

function compareFactory (fn) {
  return function compare () {
    $.apply(null, arguments).forEach(fn, this);
    return this;
  };
}

Dominus.prototype.and = compareFactory(function addOne (elem) {
  if (this.indexOf(elem) === -1) {
    this.push(elem);
  }
  return this;
});

Dominus.prototype.but = compareFactory(function addOne (elem) {
  var index = this.indexOf(elem);
  if (index !== -1) {
    this.splice(index, 1);
  }
  return this;
});

Dominus.prototype.css = function (name, value) {
  var props;
  var many = name && typeof name === 'object';
  var getter = !many && !value;
  if (getter) {
    return this.length ? dom.getCss(this[0], name) : null;
  }
  if (many) {
    props = name;
  } else {
    props = {};
    props[name] = value;
  }
  this.forEach(dom.setCss(props));
  return this;
};

Dominus.prototype.on = function (types, filter, fn) {
  this.forEach(function (elem) {
    types.split(' ').forEach(function (type) {
      dom.on(elem, type, filter, fn);
    });
  });
  return this;
};

Dominus.prototype.off = function (types, filter, fn) {
  this.forEach(function (elem) {
    types.split(' ').forEach(function (type) {
      dom.off(elem, type, filter, fn);
    });
  });
  return this;
};

[
  ['addClass', classes.add],
  ['removeClass', classes.remove],
  ['setClass', classes.set],
  ['removeClass', classes.remove],
  ['remove', dom.remove]
].forEach(mapMethods);

function mapMethods (data) {
  Dominus.prototype[data[0]] = function (value) {
    this.forEach(function (elem) {
      data[1](elem, value);
    });
    return this;
  };
}

[
  ['append', dom.append],
  ['appendTo', dom.appendTo],
  ['prepend', dom.prepend],
  ['prependTo', dom.prependTo],
  ['before', dom.before],
  ['beforeOf', dom.beforeOf],
  ['after', dom.after],
  ['afterOf', dom.afterOf],
  ['show', dom.show],
  ['hide', dom.hide]
].forEach(mapManipulation);

function mapManipulation (data) {
  Dominus.prototype[data[0]] = function (value) {
    data[1](this, value);
    return this;
  };
}

Dominus.prototype.hasClass = function (value) {
  return this.some(function (elem) {
    return classes.contains(elem, value);
  });
};

Dominus.prototype.attr = function (name, value) {
  var getter = arguments.length < 2;
  var result = this.map(function (elem) {
    return getter ? dom.attr(elem, name) : dom.attr(elem, name, value);
  });
  return getter ? result[0] : this;
};

function keyValue (key, value) {
  var getter = arguments.length < 2;
  if (getter) {
    return this.length ? dom[key](this[0]) : '';
  }
  this.forEach(function (elem) {
    dom[key](elem, value);
  });
  return this;
}

function keyValueProperty (prop) {
  Dominus.prototype[prop] = function accessor (value) {
    var getter = arguments.length < 1;
    if (getter) {
      return keyValue.call(this, prop);
    }
    return keyValue.call(this, prop, value);
  };
}

['html', 'text', 'value'].forEach(keyValueProperty);

Dominus.prototype.clone = function () {
  return this.map(function (elem) {
    return dom.clone(elem);
  });
};

module.exports = require('./public');

},{"./Dominus.ctor":21,"./classes":23,"./core":24,"./dom":25,"./public":28}],23:[function(require,module,exports){
'use strict';

var trim = /^\s+|\s+$/g;
var whitespace = /\s+/g;

function interpret (input) {
  return typeof input === 'string' ? input.replace(trim, '').split(whitespace) : input;
}

function classes (node) {
  return node.className.replace(trim, '').split(whitespace);
}

function set (node, input) {
  node.className = interpret(input).join(' ');
}

function add (node, input) {
  var current = remove(node, input);
  var values = interpret(input);
  current.push.apply(current, values);
  set(node, current);
  return current;
}

function remove (node, input) {
  var current = classes(node);
  var values = interpret(input);
  values.forEach(function (value) {
    var i = current.indexOf(value);
    if (i !== -1) {
      current.splice(i, 1);
    }
  });
  set(node, current);
  return current;
}

function contains (node, input) {
  var current = classes(node);
  var values = interpret(input);

  return values.every(function (value) {
    return current.indexOf(value) !== -1;
  });
}

module.exports = {
  add: add,
  remove: remove,
  contains: contains,
  set: set,
  get: classes
};

},{}],24:[function(require,module,exports){
'use strict';

var test = require('./test');
var Dominus = require('./Dominus.ctor');
var proto = Dominus.prototype;

function Applied (args) {
  return Dominus.apply(this, args);
}

Applied.prototype = proto;

['map', 'filter', 'concat'].forEach(ensure);

function ensure (key) {
  var original = proto[key];
  proto[key] = function applied () {
    return apply(original.apply(this, arguments));
  };
}

function apply (a) {
  return new Applied(a);
}

function cast (a) {
  if (a instanceof Dominus) {
    return a;
  }
  if (!a) {
    return new Dominus();
  }
  if (test.isElement(a)) {
    return new Dominus(a);
  }
  if (!test.isArray(a)) {
    return new Dominus();
  }
  return apply(a).filter(function (i) {
    return test.isElement(i);
  });
}

function flatten (a, cache) {
  return a.reduce(function (current, item) {
    if (Dominus.isArray(item)) {
      return flatten(item, current);
    } else if (current.indexOf(item) === -1) {
      return current.concat(item);
    }
    return current;
  }, cache || new Dominus());
}

module.exports = {
  apply: apply,
  cast: cast,
  flatten: flatten
};

},{"./Dominus.ctor":21,"./test":29}],25:[function(require,module,exports){
'use strict';

var sektor = require('sektor');
var Dominus = require('./Dominus.ctor');
var core = require('./core');
var events = require('./events');
var text = require('./text');
var test = require('./test');
var api = module.exports = {};
var delegates = {};

function castContext (context) {
  if (typeof context === 'string') {
    return api.qs(null, context);
  }
  if (test.isElement(context)) {
    return context;
  }
  if (context instanceof Dominus) {
    return context[0];
  }
  return null;
}

api.qsa = function (elem, selector) {
  var results = new Dominus();
  return sektor(selector, castContext(elem), results);
};

api.qs = function (elem, selector) {
  return api.qsa(elem, selector)[0];
};

api.matches = function (elem, selector) {
  return sektor.matchesSelector(elem, selector);
};

function relatedFactory (prop) {
  return function related (elem, selector) {
    var relative = elem[prop];
    if (relative) {
      if (!selector || api.matches(relative, selector)) {
        return core.cast(relative);
      }
    }
    return new Dominus();
  };
}

api.prev = relatedFactory('previousElementSibling');
api.next = relatedFactory('nextElementSibling');
api.parent = relatedFactory('parentElement');

function matches (elem, value) {
  if (!value) {
    return true;
  }
  if (value instanceof Dominus) {
    return value.indexOf(elem) !== -1;
  }
  if (test.isElement(value)) {
    return elem === value;
  }
  return api.matches(elem, value);
}

api.parents = function (elem, value) {
  var nodes = [];
  var node = elem;
  while (node.parentElement) {
    if (matches(node.parentElement, value)) {
      nodes.push(node.parentElement);
    }
    node = node.parentElement;
  }
  return core.apply(nodes);
};

api.children = function (elem, value) {
  var nodes = [];
  var children = elem.children;
  var child;
  var i;
  for (i = 0; i < children.length; i++) {
    child = children[i];
    if (matches(child, value)) {
      nodes.push(child);
    }
  }
  return core.apply(nodes);
};

// this method caches delegates so that .off() works seamlessly
function delegate (root, filter, fn) {
  if (delegates[fn._dd]) {
    return delegates[fn._dd];
  }
  fn._dd = Date.now();
  delegates[fn._dd] = delegator;
  function delegator (e) {
    var elem = e.target;
    while (elem && elem !== root) {
      if (api.matches(elem, filter)) {
        fn.apply(this, arguments); return;
      }
      elem = elem.parentElement;
    }
  }
  return delegator;
}

api.on = function (elem, type, filter, fn) {
  if (fn === void 0) {
    events.add(elem, type, filter); // filter _is_ fn
  } else {
    events.add(elem, type, delegate(elem, filter, fn));
  }
};

api.off = function (elem, type, filter, fn) {
  if (fn === void 0) {
    events.remove(elem, type, filter); // filter _is_ fn
  } else {
    events.remove(elem, type, delegate(elem, filter, fn));
  }
};

api.html = function (elem, html) {
  var getter = arguments.length < 2;
  if (getter) {
    return elem.innerHTML;
  } else {
    elem.innerHTML = html;
  }
};

api.text = function (elem, text) {
  var checkable = test.isCheckable(elem);
  var getter = arguments.length < 2;
  if (getter) {
    return checkable ? elem.value : elem.innerText || elem.textContent;
  } else if (checkable) {
    elem.value = text;
  } else {
    elem.innerText = elem.textContent = text;
  }
};

api.value = function (elem, value) {
  var checkable = test.isCheckable(elem);
  var getter = arguments.length < 2;
  if (getter) {
    return checkable ? elem.checked : elem.value;
  } else if (checkable) {
    elem.checked = value;
  } else {
    elem.value = value;
  }
};

api.attr = function (elem, name, value) {
  var getter = arguments.length < 3;
  var camel = text.hyphenToCamel(name);
  if (getter) {
    if (camel in elem) {
      return elem[camel];
    } else {
      return elem.getAttribute(name, value);
    }
  }
  if (camel in elem) {
    elem[camel] = value;
  } else if (value === null || value === void 0) {
    elem.removeAttribute(name);
  } else {
    elem.setAttribute(name, value);
  }
};

api.make = function (type) {
  return new Dominus(document.createElement(type));
};

api.clone = function (elem) {
  return elem.cloneNode(true);
};

api.remove = function (elem) {
  if (elem.parentElement) {
    elem.parentElement.removeChild(elem);
  }
};

api.append = function (elem, target) {
  if (manipulationGuard(elem, target, api.append)) {
    return;
  }
  elem.appendChild(target);
};

api.prepend = function (elem, target) {
  if (manipulationGuard(elem, target, api.prepend)) {
    return;
  }
  elem.insertBefore(target, elem.firstChild);
};

api.before = function (elem, target) {
  if (manipulationGuard(elem, target, api.before)) {
    return;
  }
  if (elem.parentElement) {
    elem.parentElement.insertBefore(target, elem);
  }
};

api.after = function (elem, target) {
  if (manipulationGuard(elem, target, api.after)) {
    return;
  }
  if (elem.parentElement) {
    elem.parentElement.insertBefore(target, elem.nextSibling);
  }
};

function manipulationGuard (elem, target, fn) {
  var right = target instanceof Dominus;
  var left = elem instanceof Dominus;
  if (left) {
    elem.forEach(manipulateMany);
  } else if (right) {
    manipulate(elem, true);
  }
  return left || right;

  function manipulate (elem, precondition) {
    if (right) {
      target.forEach(function (target, j) {
        fn(elem, cloneUnless(target, precondition && j === 0));
      });
    } else {
      fn(elem, cloneUnless(target, precondition));
    }
  }

  function manipulateMany (elem, i) {
    manipulate(elem, i === 0);
  }
}

function cloneUnless (target, condition) {
  return condition ? target : api.clone(target);
}

['appendTo', 'prependTo', 'beforeOf', 'afterOf'].forEach(flip);

function flip (key) {
  var original = key.split(/[A-Z]/)[0];
  api[key] = function (elem, target) {
    api[original](target, elem);
  };
}

api.show = function (elem, should, invert) {
  if (elem instanceof Dominus) {
    elem.forEach(showTest);
  } else {
    showTest(elem);
  }

  function showTest (current) {
    var ok = should === void 0 || should === true || typeof should === 'function' && should.call(current);
    display(current, invert ? !ok : ok);
  }
};

api.hide = function (elem, should) {
  api.show(elem, should, true);
};

function display (elem, should) {
  elem.style.display = should ? 'block' : 'none';
}

var numericCssProperties = {
  'column-count': true,
  'fill-opacity': true,
  'flex-grow': true,
  'flex-shrink': true,
  'font-weight': true,
  'line-height': true,
  'opacity': true,
  'order': true,
  'orphans': true,
  'widows': true,
  'z-index': true,
  'zoom': true
};
var numeric = /^\d+$/;
var canFloat = 'float' in document.body.style;

api.getCss = function (elem, prop) {
  var hprop = text.hyphenate(prop);
  var fprop = !canFloat && hprop === 'float' ? 'cssFloat' : hprop;
  var result = window.getComputedStyle(elem)[hprop];
  if (prop === 'opacity' && result === '') {
    return 1;
  }
  if (result.substr(-2) === 'px' || numeric.test(result)) {
    return parseFloat(result, 10);
  }
  return result;
};

api.setCss = function (props) {
  var mapped = Object.keys(props).filter(bad).map(expand);
  function bad (prop) {
    var value = props[prop];
    return value !== null && value === value;
  }
  function expand (prop) {
    var hprop = text.hyphenate(prop);
    var value = props[prop];
    if (typeof value === 'number' && !numericCssProperties[hprop]) {
      value += 'px';
    }
    return {
      name: hprop, value: value
    };
  }
  return function (elem) {
    mapped.forEach(function (prop) {
      elem.style[prop.name] = prop.value;
    });
  };
};

},{"./Dominus.ctor":21,"./core":24,"./events":27,"./test":29,"./text":30,"sektor":20}],26:[function(require,module,exports){
'use strict';

module.exports = require('./Dominus.prototype');

},{"./Dominus.prototype":22}],27:[function(require,module,exports){
'use strict';

var addEvent = addEventEasy;
var removeEvent = removeEventEasy;
var hardCache = [];

if (!window.addEventListener) {
  addEvent = addEventHard;
}

if (!window.removeEventListener) {
  removeEvent = removeEventHard;
}

function addEventEasy (element, evt, fn) {
  return element.addEventListener(evt, fn);
}

function addEventHard (element, evt, fn) {
  return element.attachEvent('on' + evt, wrap(element, evt, fn));
}

function removeEventEasy (element, evt, fn) {
  return element.removeEventListener(evt, fn);
}

function removeEventHard (element, evt, fn) {
  return element.detachEvent('on' + evt, unwrap(element, evt, fn));
}

function wrapperFactory (element, evt, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || window.event;
    e.target = e.target || e.srcElement;
    e.preventDefault  = e.preventDefault  || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    fn.call(element, e);
  };
}

function wrap (element, evt, fn) {
  var wrapper = unwrap(element, evt, fn) || wrapperFactory(element, evt, fn);
  hardCache.push({
    wrapper: wrapper,
    element: element,
    evt: evt,
    fn: fn
  });
  return wrapper;
}

function unwrap (element, evt, fn) {
  var i = find(element, evt, fn);
  if (i) {
    var wrapper = hardCache[i].wrapper;
    hardCache.splice(i, 1); // free up a tad of memory
    return wrapper;
  }
}

function find (element, evt, fn) {
  var i, item;
  for (i = 0; i < hardCache.length; i++) {
    item = hardCache[i];
    if (item.element === element && item.evt === evt && item.fn === fn) {
      return i;
    }
  }
}

module.exports = {
  add: addEvent,
  remove: removeEvent
};

},{}],28:[function(require,module,exports){
'use strict';

var dom = require('./dom');
var core = require('./core');
var Dominus = require('./Dominus.ctor');
var tag = /^\s*<([a-z]+(?:-[a-z]+)?)\s*\/?>\s*$/i;

function api (selector, context) {
  var notText = typeof selector !== 'string';
  if (notText && arguments.length < 2) {
    return core.cast(selector);
  }
  if (notText) {
    return new Dominus();
  }
  var matches = selector.match(tag);
  if (matches) {
    return dom.make(matches[1]);
  }
  return api.find(selector, context);
}

api.find = function (selector, context) {
  return dom.qsa(context, selector);
};

api.findOne = function (selector, context) {
  return dom.qs(context, selector);
};

module.exports = api;

},{"./Dominus.ctor":21,"./core":24,"./dom":25}],29:[function(require,module,exports){
'use strict';

var nodeObjects = typeof Node === 'object';
var elementObjects = typeof HTMLElement === 'object';

function isNode (o) {
  return nodeObjects ? o instanceof Node : isNodeObject(o);
}

function isNodeObject (o) {
  return o &&
    typeof o === 'object' &&
    typeof o.nodeName === 'string' &&
    typeof o.nodeType === 'number';
}

function isElement (o) {
  return elementObjects ? o instanceof HTMLElement : isElementObject(o);
}

function isElementObject (o) {
  return o &&
    typeof o === 'object' &&
    typeof o.nodeName === 'string' &&
    o.nodeType === 1;
}

function isArray (a) {
  return Object.prototype.toString.call(a) === '[object Array]';
}

function isCheckable (elem) {
  return 'checked' in elem && elem.type === 'radio' || elem.type === 'checkbox';
}

module.exports = {
  isNode: isNode,
  isElement: isElement,
  isArray: isArray,
  isCheckable: isCheckable
};

},{}],30:[function(require,module,exports){
'use strict';

function hyphenToCamel (hyphens) {
  var part = /-([a-z])/g;
  return hyphens.replace(part, function (g, m) {
    return m.toUpperCase();
  });
}

function hyphenate (text) {
  var camel = /([a-z])([A-Z])/g;
  return text.replace(camel, '$1-$2').toLowerCase();
}

module.exports = {
  hyphenToCamel: hyphenToCamel,
  hyphenate: hyphenate
};

},{}],31:[function(require,module,exports){
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
},{}],32:[function(require,module,exports){
module.exports = require('jade/runtime');

},{"jade/runtime":31}],33:[function(require,module,exports){
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

},{"performance-now":34}],34:[function(require,module,exports){
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
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],35:[function(require,module,exports){
'use strict';

var raf = require('raf');
var clone = require('./clone');
var emitter = require('./emitter');
var fetcher = require('./fetcher');
var partial = require('./partial');
var router = require('./router');
var state = require('./state');
var nativeFn = require('./nativeFn');
var versioning = require('../versioning');
var modern = 'history' in window && 'pushState' in history;

// Google Chrome 38 on iOS makes weird changes to history.replaceState, breaking it
var nativeReplace = modern && nativeFn(window.history.replaceState);

function go (url, options) {
  var o = options || {};
  var direction = o.replaceState ? 'replaceState' : 'pushState';
  var context = o.context || null;
  var route = router(url);
  if (!route) {
    if (o.strict !== true) {
      location.href = url;
    }
    return;
  }

  var same = router.equals(route, state.route);
  if (same && o.force !== true) {
    if (route.parts.hash) {
      scrollInto(id(route.parts.hash), o.scroll);
      navigation(route, state.model, direction);
      return; // anchor hash-navigation on same page ignores router
    }
    resolved(null, state.model);
    return;
  }

  if (!modern) {
    location.href = url;
    return;
  }

  fetcher.abortPending();
  fetcher(route, { element: context, source: 'intent' }, resolved);

  function resolved (err, model) {
    if (err) {
      return;
    }
    if (versioning.ensure(model.__tv, state.version)) {
      location.href = url; // version changes demands fallback to strict navigation
    }
    navigation(route, model, direction);
    partial(state.container, null, model, route);
    scrollInto(id(route.parts.hash), o.scroll);
  }
}

function start (model) {
  if (versioning.ensure(model.__tv, state.version)) {
    location.reload(); // version may change between Taunus being loaded and a model being available
  }
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
  scrollInto(id(route.parts.hash));
}

function scrollInto (id, enabled) {
  if (enabled === false) {
    return;
  }
  var elem = id && document.getElementById(id) || document.documentElement;
  if (elem && elem.scrollIntoView) {
    raf(scrollSoon);
  }

  function scrollSoon () {
    elem.scrollIntoView();
  }
}

function id (hash) {
  return orEmpty(hash).substr(1);
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
  state.route = route;
  state.model = clone(model);
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

},{"../versioning":70,"./clone":38,"./emitter":39,"./fetcher":41,"./nativeFn":47,"./partial":49,"./router":50,"./state":51,"raf":59}],36:[function(require,module,exports){
'use strict';

var clone = require('./clone');
var once = require('./once');
var state = require('./state');
var raw = require('./stores/raw');
var idb = require('./stores/idb');
var versioning = require('../versioning');
var stores = [raw, idb];

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
      } else if (valid(item)) {
        done(false, clone(item.data)); // always return a unique copy
      } else {
        next();
      }
    }

    function valid (item) {
      if (!item) {
        return false; // cache must have item
      }
      var mismatch = typeof item.version !== 'string' || !versioning.match(item.version, state.version);
      if (mismatch) {
        return false; // cache must match current version
      }
      var stale = typeof item.expires !== 'number' || Date.now() >= item.expires;
      if (stale) {
        return false; // cache must be fresh
      }
      return true;
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
      version: cloned.__tv,
      expires: Date.now() + duration
    });
  }
}

module.exports = {
  get: get,
  set: set
};

},{"../versioning":70,"./clone":38,"./once":48,"./state":51,"./stores/idb":52,"./stores/raw":53}],37:[function(require,module,exports){
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

function getKey (route) {
  return route.parts.pathname + e(route.parts.query);
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
  cache.get(getKey(e.route), result);

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
  if (route.cache === false) {
    return;
  }
  var d = baseline;
  if (typeof route.cache === 'number') {
    d = route.cache;
  }
  cache.set(getKey(route), data, parseDuration(d) * 1000);
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

},{"./cache":36,"./emitter":39,"./interceptor":44,"./state":51,"./stores/idb":52}],38:[function(require,module,exports){
'use strict';

function clone (value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = clone;

},{}],39:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');

module.exports = emitter({}, { throws: false });

},{"contra.emitter":56}],40:[function(require,module,exports){
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

},{}],41:[function(require,module,exports){
'use strict';

var xhr = require('./xhr');
var state = require('./state');
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
      if (data && data.__tv) {
        state.version = data.__tv; // sync version expectation with server-side
      }
      emitter.emit('fetch.done', route, context, data);
    }
    done(err, data);
  }
}

fetcher.abortPending = abortPending;

module.exports = fetcher;

},{"./emitter":39,"./interceptor":44,"./state":51,"./xhr":55}],42:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var links = require('./links');

function attach () {
  emitter.on('start', links);
}

module.exports = {
  attach: attach
};

},{"./emitter":39,"./links":45}],43:[function(require,module,exports){
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

},{"./activator":35,"./emitter":39,"./hooks":42,"./interceptor":44,"./mount":46,"./partial":49,"./router":50,"./state":51}],44:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');
var once = require('./once');
var router = require('./router');
var interceptors = emitter({ count: 0 }, { async: true });

function getInterceptorEvent (route) {
  var e = {
    url: route.url,
    route: route,
    parts: route.parts,
    model: null,
    canPreventDefault: true,
    defaultPrevented: false,
    preventDefault: once(preventDefault)
  };

  function preventDefault (model) {
    if (!e.canPreventDefault) {
      return;
    }
    e.canPreventDefault = false;
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
  var e = getInterceptorEvent(route);

  interceptors.emit('*', e);
  interceptors.emit(route.action, e);

  return e;
}

function execute (route, done) {
  var e = getInterceptorEvent(route);
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
    e.canPreventDefault = false;
    done(null, e);
  }
}

module.exports = {
  add: add,
  execute: execute
};

},{"./once":48,"./router":50,"contra.emitter":56}],45:[function(require,module,exports){
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

function noop () {}

function getRoute (anchor) {
  var url = anchor.pathname + anchor.search + anchor.hash;
  var route = router(url);
  if (!route || route.ignore) {
    return;
  }
  return route;
}

function reroute (e, anchor) {
  var route = getRoute(anchor);
  if (!route) {
    return;
  }

  prevent();

  if (prefetching.indexOf(anchor) !== -1) {
    clicksOnHold.push(anchor);
    return;
  }

  activator.go(route.url, { context: anchor });

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

},{"./activator":35,"./events":40,"./fetcher":41,"./router":50,"./state":51}],46:[function(require,module,exports){
(function (global){
'use strict';

var unescape = require('./unescape');
var state = require('./state');
var router = require('./router');
var activator = require('./activator');
var caching = require('./caching');
var fetcher = require('./fetcher');
var versioning = require('../versioning');
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
  state.version = versioning.get(o.version || '1');

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
    } else {
      throw new Error(o.bootstrap + ' is not a valid bootstrap mode!');
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
    } else if (g.taunusReady && typeof g.taunusReady === 'object') {
      boot(g.taunusReady); // already an object? boot with that as the model
    } else {
      throw new Error('Did you forget to add the taunusReady global?');
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
},{"../versioning":70,"./activator":35,"./caching":37,"./fetcher":41,"./router":50,"./state":51,"./unescape":54}],47:[function(require,module,exports){
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

function nativeFn (value) {
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

module.exports = nativeFn;

},{}],48:[function(require,module,exports){
'use strict';

module.exports = function (fn) {
  var used;
  return function once () {
    if (used) { return; } used = true;
    return fn.apply(this, arguments);
  };
};

},{}],49:[function(require,module,exports){
'use strict';

var state = require('./state');
var emitter = require('./emitter');

function partial (container, enforcedAction, model, route, options) {
  var action = enforcedAction || model && model.action || route && route.action;
  var controller = state.controllers[action];
  var internals = options || {};
  if (internals.render !== false) {
    container.innerHTML = render(action, model);
  }
  emitter.emit('render', container, model);
  if (controller) {
    controller(model, container, route);
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

},{"./emitter":39,"./state":51}],50:[function(require,module,exports){
'use strict';

var url = require('fast-url-parser');
var routes = require('routes');
var matcher = routes();
var protocol = /^[a-z]+?:\/\//i;

function getFullUrl (raw) {
  var base = location.href.substr(location.origin.length);
  var hashless;
  if (!raw) {
    return base;
  }
  if (raw[0] === '#') {
    hashless = base.substr(0, base.length - location.hash.length);
    return hashless + raw;
  }
  if (protocol.test(raw)) {
    if (raw.indexOf(location.origin) === 0) {
      return raw.substr(location.origin.length);
    }
    return null;
  }
  return raw;
}

function router (raw) {
  var full = getFullUrl(raw);
  if (full === null) {
    return full;
  }
  var parts = url.parse(full);
  var result = matcher.match(parts.pathname);
  var route = result ? result.fn(result) : null;
  if (route) {
    route.url = full;
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

function equals (left, right) {
  return left && right && left.route === right.route && JSON.stringify(left.params) === JSON.stringify(right.params);
}

router.setup = setup;
router.equals = equals;

module.exports = router;

},{"fast-url-parser":58,"routes":61}],51:[function(require,module,exports){
'use strict';

module.exports = {
  container: null
};

},{}],52:[function(require,module,exports){
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
},{}],53:[function(require,module,exports){
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

},{}],54:[function(require,module,exports){
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

},{}],55:[function(require,module,exports){
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

},{"./emitter":39,"xhr":62}],56:[function(require,module,exports){
module.exports = require('./src/contra.emitter.js');

},{"./src/contra.emitter.js":57}],57:[function(require,module,exports){
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
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],58:[function(require,module,exports){
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

},{"punycode":2,"querystring":5}],59:[function(require,module,exports){
var now = require('performance-now')
  , global = typeof window === 'undefined' ? {} : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = global['request' + suffix]
  , caf = global['cancel' + suffix] || global['cancelRequest' + suffix]
  , native = true

for(var i = 0; i < vendors.length && !raf; i++) {
  raf = global[vendors[i] + 'Request' + suffix]
  caf = global[vendors[i] + 'Cancel' + suffix]
      || global[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  native = false

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
  if(!native) {
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

},{"performance-now":60}],60:[function(require,module,exports){
module.exports=require(34)
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],61:[function(require,module,exports){
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
},{}],62:[function(require,module,exports){
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

},{"global/window":63,"once":64,"parse-headers":68}],63:[function(require,module,exports){
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
},{}],64:[function(require,module,exports){
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

},{}],65:[function(require,module,exports){
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

},{"is-function":66}],66:[function(require,module,exports){
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

},{}],67:[function(require,module,exports){

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

},{}],68:[function(require,module,exports){
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
},{"for-each":65,"trim":67}],69:[function(require,module,exports){
module.exports="2.8.6"
},{}],70:[function(require,module,exports){
(function (global){
'use strict';

var t = require('./version.json');

function get (v) {
  return 't' + t + ';v' + v;
}

function match (v, expected) {
  return v === expected;
}

function ensure (v, expected) {
  var mismatch = !match(v, expected);
  if (mismatch) {
    global.location.reload();
  }
  return mismatch;
}

module.exports = {
  get: get,
  match: match,
  ensure: ensure
};

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./version.json":69}]},{},[16])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvY29udmVudGlvbnMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9tYWluLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvdGhyb3R0bGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL25vZGVfbW9kdWxlcy9wb3Nlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvbm9kZV9tb2R1bGVzL3Bvc2VyL3NyYy9icm93c2VyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9ub2RlX21vZHVsZXMvc2VrdG9yL3NyYy9zZWt0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLmN0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLnByb3RvdHlwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2NsYXNzZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9jb3JlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9tLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9taW51cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3B1YmxpYy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3Rlc3QuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy90ZXh0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vbm9kZV9tb2R1bGVzL2phZGUvcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvYWN0aXZhdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoaW5nLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2xvbmUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZXZlbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZmV0Y2hlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2hvb2tzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pbnRlcmNlcHRvci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2xpbmtzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbW91bnQuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9uYXRpdmVGbi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9wYXJ0aWFsLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcm91dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RhdGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdG9yZXMvaWRiLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL3Jhdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3VuZXNjYXBlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIveGhyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvc3JjL2NvbnRyYS5lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9mYXN0LXVybC1wYXJzZXIvc3JjL3VybHBhcnNlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcmFmL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9yb3V0ZXMvZGlzdC9yb3V0ZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9nbG9iYWwvd2luZG93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL29uY2Uvb25jZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy9mb3ItZWFjaC9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy9mb3ItZWFjaC9ub2RlX21vZHVsZXMvaXMtZnVuY3Rpb24vaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvdHJpbS9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL3BhcnNlLWhlYWRlcnMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvdmVyc2lvbi5qc29uIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL3ZlcnNpb25pbmcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoVkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25OQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8qISBodHRwOi8vbXRocy5iZS9wdW55Y29kZSB2MS4yLjQgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cztcblx0dmFyIGZyZWVNb2R1bGUgPSB0eXBlb2YgbW9kdWxlID09ICdvYmplY3QnICYmIG1vZHVsZSAmJlxuXHRcdG1vZHVsZS5leHBvcnRzID09IGZyZWVFeHBvcnRzICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8IGZyZWVHbG9iYWwud2luZG93ID09PSBmcmVlR2xvYmFsKSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXiAtfl0vLCAvLyB1bnByaW50YWJsZSBBU0NJSSBjaGFycyArIG5vbi1BU0NJSSBjaGFyc1xuXHRyZWdleFNlcGFyYXRvcnMgPSAvXFx4MkV8XFx1MzAwMnxcXHVGRjBFfFxcdUZGNjEvZywgLy8gUkZDIDM0OTAgc2VwYXJhdG9yc1xuXG5cdC8qKiBFcnJvciBtZXNzYWdlcyAqL1xuXHRlcnJvcnMgPSB7XG5cdFx0J292ZXJmbG93JzogJ092ZXJmbG93OiBpbnB1dCBuZWVkcyB3aWRlciBpbnRlZ2VycyB0byBwcm9jZXNzJyxcblx0XHQnbm90LWJhc2ljJzogJ0lsbGVnYWwgaW5wdXQgPj0gMHg4MCAobm90IGEgYmFzaWMgY29kZSBwb2ludCknLFxuXHRcdCdpbnZhbGlkLWlucHV0JzogJ0ludmFsaWQgaW5wdXQnXG5cdH0sXG5cblx0LyoqIENvbnZlbmllbmNlIHNob3J0Y3V0cyAqL1xuXHRiYXNlTWludXNUTWluID0gYmFzZSAtIHRNaW4sXG5cdGZsb29yID0gTWF0aC5mbG9vcixcblx0c3RyaW5nRnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZSxcblxuXHQvKiogVGVtcG9yYXJ5IHZhcmlhYmxlICovXG5cdGtleTtcblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGVycm9yIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSBlcnJvciB0eXBlLlxuXHQgKiBAcmV0dXJucyB7RXJyb3J9IFRocm93cyBhIGBSYW5nZUVycm9yYCB3aXRoIHRoZSBhcHBsaWNhYmxlIGVycm9yIG1lc3NhZ2UuXG5cdCAqL1xuXHRmdW5jdGlvbiBlcnJvcih0eXBlKSB7XG5cdFx0dGhyb3cgUmFuZ2VFcnJvcihlcnJvcnNbdHlwZV0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBgQXJyYXkjbWFwYCB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnkgYXJyYXlcblx0ICogaXRlbS5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBhcnJheSBvZiB2YWx1ZXMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwKGFycmF5LCBmbikge1xuXHRcdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdFx0d2hpbGUgKGxlbmd0aC0tKSB7XG5cdFx0XHRhcnJheVtsZW5ndGhdID0gZm4oYXJyYXlbbGVuZ3RoXSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHNpbXBsZSBgQXJyYXkjbWFwYC1saWtlIHdyYXBwZXIgdG8gd29yayB3aXRoIGRvbWFpbiBuYW1lIHN0cmluZ3MuXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnlcblx0ICogY2hhcmFjdGVyLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IHN0cmluZyBvZiBjaGFyYWN0ZXJzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFja1xuXHQgKiBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcERvbWFpbihzdHJpbmcsIGZuKSB7XG5cdFx0cmV0dXJuIG1hcChzdHJpbmcuc3BsaXQocmVnZXhTZXBhcmF0b3JzKSwgZm4pLmpvaW4oJy4nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIG51bWVyaWMgY29kZSBwb2ludHMgb2YgZWFjaCBVbmljb2RlXG5cdCAqIGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLiBXaGlsZSBKYXZhU2NyaXB0IHVzZXMgVUNTLTIgaW50ZXJuYWxseSxcblx0ICogdGhpcyBmdW5jdGlvbiB3aWxsIGNvbnZlcnQgYSBwYWlyIG9mIHN1cnJvZ2F0ZSBoYWx2ZXMgKGVhY2ggb2Ygd2hpY2hcblx0ICogVUNTLTIgZXhwb3NlcyBhcyBzZXBhcmF0ZSBjaGFyYWN0ZXJzKSBpbnRvIGEgc2luZ2xlIGNvZGUgcG9pbnQsXG5cdCAqIG1hdGNoaW5nIFVURi0xNi5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5lbmNvZGVgXG5cdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGRlY29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBuZXcgYXJyYXkgb2YgY29kZSBwb2ludHMuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgY291bnRlciA9IDAsXG5cdFx0ICAgIGxlbmd0aCA9IHN0cmluZy5sZW5ndGgsXG5cdFx0ICAgIHZhbHVlLFxuXHRcdCAgICBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmRlY29kZWBcblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZW5jb2RlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGNvZGVQb2ludHMgVGhlIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuZXcgVW5pY29kZSBzdHJpbmcgKFVDUy0yKS5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJlbmNvZGUoYXJyYXkpIHtcblx0XHRyZXR1cm4gbWFwKGFycmF5LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdFx0aWYgKHZhbHVlID4gMHhGRkZGKSB7XG5cdFx0XHRcdHZhbHVlIC09IDB4MTAwMDA7XG5cdFx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApO1xuXHRcdFx0XHR2YWx1ZSA9IDB4REMwMCB8IHZhbHVlICYgMHgzRkY7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBiYXNpYyBjb2RlIHBvaW50IGludG8gYSBkaWdpdC9pbnRlZ2VyLlxuXHQgKiBAc2VlIGBkaWdpdFRvQmFzaWMoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVQb2ludCBUaGUgYmFzaWMgbnVtZXJpYyBjb2RlIHBvaW50IHZhbHVlLlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQgKGZvciB1c2UgaW5cblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuXHQgKiB0aGUgY29kZSBwb2ludCBkb2VzIG5vdCByZXByZXNlbnQgYSB2YWx1ZS5cblx0ICovXG5cdGZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQpIHtcblx0XHRpZiAoY29kZVBvaW50IC0gNDggPCAxMCkge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDIyO1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gNjUgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDY1O1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gOTcgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDk3O1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEBzZWUgYGJhc2ljVG9EaWdpdCgpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gZGlnaXQgVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzaWMgY29kZSBwb2ludCB3aG9zZSB2YWx1ZSAod2hlbiB1c2VkIGZvclxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGlzIGBkaWdpdGAsIHdoaWNoIG5lZWRzIHRvIGJlIGluIHRoZSByYW5nZVxuXHQgKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcblx0ICogdXNlZDsgZWxzZSwgdGhlIGxvd2VyY2FzZSBmb3JtIGlzIHVzZWQuIFRoZSBiZWhhdmlvciBpcyB1bmRlZmluZWRcblx0ICogaWYgYGZsYWdgIGlzIG5vbi16ZXJvIGFuZCBgZGlnaXRgIGhhcyBubyB1cHBlcmNhc2UgZm9ybS5cblx0ICovXG5cdGZ1bmN0aW9uIGRpZ2l0VG9CYXNpYyhkaWdpdCwgZmxhZykge1xuXHRcdC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG5cdFx0Ly8gMjYuLjM1IG1hcCB0byBBU0NJSSAwLi45XG5cdFx0cmV0dXJuIGRpZ2l0ICsgMjIgKyA3NSAqIChkaWdpdCA8IDI2KSAtICgoZmxhZyAhPSAwKSA8PCA1KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaWFzIGFkYXB0YXRpb24gZnVuY3Rpb24gYXMgcGVyIHNlY3Rpb24gMy40IG9mIFJGQyAzNDkyLlxuXHQgKiBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNDkyI3NlY3Rpb24tMy40XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGFwdChkZWx0YSwgbnVtUG9pbnRzLCBmaXJzdFRpbWUpIHtcblx0XHR2YXIgayA9IDA7XG5cdFx0ZGVsdGEgPSBmaXJzdFRpbWUgPyBmbG9vcihkZWx0YSAvIGRhbXApIDogZGVsdGEgPj4gMTtcblx0XHRkZWx0YSArPSBmbG9vcihkZWx0YSAvIG51bVBvaW50cyk7XG5cdFx0Zm9yICgvKiBubyBpbml0aWFsaXphdGlvbiAqLzsgZGVsdGEgPiBiYXNlTWludXNUTWluICogdE1heCA+PiAxOyBrICs9IGJhc2UpIHtcblx0XHRcdGRlbHRhID0gZmxvb3IoZGVsdGEgLyBiYXNlTWludXNUTWluKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZsb29yKGsgKyAoYmFzZU1pbnVzVE1pbiArIDEpICogZGVsdGEgLyAoZGVsdGEgKyBza2V3KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzIHRvIGEgc3RyaW5nIG9mIFVuaWNvZGVcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGVjb2RlKGlucHV0KSB7XG5cdFx0Ly8gRG9uJ3QgdXNlIFVDUy0yXG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aCxcblx0XHQgICAgb3V0LFxuXHRcdCAgICBpID0gMCxcblx0XHQgICAgbiA9IGluaXRpYWxOLFxuXHRcdCAgICBiaWFzID0gaW5pdGlhbEJpYXMsXG5cdFx0ICAgIGJhc2ljLFxuXHRcdCAgICBqLFxuXHRcdCAgICBpbmRleCxcblx0XHQgICAgb2xkaSxcblx0XHQgICAgdyxcblx0XHQgICAgayxcblx0XHQgICAgZGlnaXQsXG5cdFx0ICAgIHQsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBiYXNlTWludXNUO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50czogbGV0IGBiYXNpY2AgYmUgdGhlIG51bWJlciBvZiBpbnB1dCBjb2RlXG5cdFx0Ly8gcG9pbnRzIGJlZm9yZSB0aGUgbGFzdCBkZWxpbWl0ZXIsIG9yIGAwYCBpZiB0aGVyZSBpcyBub25lLCB0aGVuIGNvcHlcblx0XHQvLyB0aGUgZmlyc3QgYmFzaWMgY29kZSBwb2ludHMgdG8gdGhlIG91dHB1dC5cblxuXHRcdGJhc2ljID0gaW5wdXQubGFzdEluZGV4T2YoZGVsaW1pdGVyKTtcblx0XHRpZiAoYmFzaWMgPCAwKSB7XG5cdFx0XHRiYXNpYyA9IDA7XG5cdFx0fVxuXG5cdFx0Zm9yIChqID0gMDsgaiA8IGJhc2ljOyArK2opIHtcblx0XHRcdC8vIGlmIGl0J3Mgbm90IGEgYmFzaWMgY29kZSBwb2ludFxuXHRcdFx0aWYgKGlucHV0LmNoYXJDb2RlQXQoaikgPj0gMHg4MCkge1xuXHRcdFx0XHRlcnJvcignbm90LWJhc2ljJyk7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQucHVzaChpbnB1dC5jaGFyQ29kZUF0KGopKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGRlY29kaW5nIGxvb3A6IHN0YXJ0IGp1c3QgYWZ0ZXIgdGhlIGxhc3QgZGVsaW1pdGVyIGlmIGFueSBiYXNpYyBjb2RlXG5cdFx0Ly8gcG9pbnRzIHdlcmUgY29waWVkOyBzdGFydCBhdCB0aGUgYmVnaW5uaW5nIG90aGVyd2lzZS5cblxuXHRcdGZvciAoaW5kZXggPSBiYXNpYyA+IDAgPyBiYXNpYyArIDEgOiAwOyBpbmRleCA8IGlucHV0TGVuZ3RoOyAvKiBubyBmaW5hbCBleHByZXNzaW9uICovKSB7XG5cblx0XHRcdC8vIGBpbmRleGAgaXMgdGhlIGluZGV4IG9mIHRoZSBuZXh0IGNoYXJhY3RlciB0byBiZSBjb25zdW1lZC5cblx0XHRcdC8vIERlY29kZSBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyIGludG8gYGRlbHRhYCxcblx0XHRcdC8vIHdoaWNoIGdldHMgYWRkZWQgdG8gYGlgLiBUaGUgb3ZlcmZsb3cgY2hlY2tpbmcgaXMgZWFzaWVyXG5cdFx0XHQvLyBpZiB3ZSBpbmNyZWFzZSBgaWAgYXMgd2UgZ28sIHRoZW4gc3VidHJhY3Qgb2ZmIGl0cyBzdGFydGluZ1xuXHRcdFx0Ly8gdmFsdWUgYXQgdGhlIGVuZCB0byBvYnRhaW4gYGRlbHRhYC5cblx0XHRcdGZvciAob2xkaSA9IGksIHcgPSAxLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblxuXHRcdFx0XHRpZiAoaW5kZXggPj0gaW5wdXRMZW5ndGgpIHtcblx0XHRcdFx0XHRlcnJvcignaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlnaXQgPSBiYXNpY1RvRGlnaXQoaW5wdXQuY2hhckNvZGVBdChpbmRleCsrKSk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0ID49IGJhc2UgfHwgZGlnaXQgPiBmbG9vcigobWF4SW50IC0gaSkgLyB3KSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aSArPSBkaWdpdCAqIHc7XG5cdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA8IHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0aWYgKHcgPiBmbG9vcihtYXhJbnQgLyBiYXNlTWludXNUKSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dyAqPSBiYXNlTWludXNUO1xuXG5cdFx0XHR9XG5cblx0XHRcdG91dCA9IG91dHB1dC5sZW5ndGggKyAxO1xuXHRcdFx0YmlhcyA9IGFkYXB0KGkgLSBvbGRpLCBvdXQsIG9sZGkgPT0gMCk7XG5cblx0XHRcdC8vIGBpYCB3YXMgc3VwcG9zZWQgdG8gd3JhcCBhcm91bmQgZnJvbSBgb3V0YCB0byBgMGAsXG5cdFx0XHQvLyBpbmNyZW1lbnRpbmcgYG5gIGVhY2ggdGltZSwgc28gd2UnbGwgZml4IHRoYXQgbm93OlxuXHRcdFx0aWYgKGZsb29yKGkgLyBvdXQpID4gbWF4SW50IC0gbikge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0biArPSBmbG9vcihpIC8gb3V0KTtcblx0XHRcdGkgJT0gb3V0O1xuXG5cdFx0XHQvLyBJbnNlcnQgYG5gIGF0IHBvc2l0aW9uIGBpYCBvZiB0aGUgb3V0cHV0XG5cdFx0XHRvdXRwdXQuc3BsaWNlKGkrKywgMCwgbik7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdWNzMmVuY29kZShvdXRwdXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scyB0byBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5XG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGVuY29kZShpbnB1dCkge1xuXHRcdHZhciBuLFxuXHRcdCAgICBkZWx0YSxcblx0XHQgICAgaGFuZGxlZENQQ291bnQsXG5cdFx0ICAgIGJhc2ljTGVuZ3RoLFxuXHRcdCAgICBiaWFzLFxuXHRcdCAgICBqLFxuXHRcdCAgICBtLFxuXHRcdCAgICBxLFxuXHRcdCAgICBrLFxuXHRcdCAgICB0LFxuXHRcdCAgICBjdXJyZW50VmFsdWUsXG5cdFx0ICAgIG91dHB1dCA9IFtdLFxuXHRcdCAgICAvKiogYGlucHV0TGVuZ3RoYCB3aWxsIGhvbGQgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyBpbiBgaW5wdXRgLiAqL1xuXHRcdCAgICBpbnB1dExlbmd0aCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50UGx1c09uZSxcblx0XHQgICAgYmFzZU1pbnVzVCxcblx0XHQgICAgcU1pbnVzVDtcblxuXHRcdC8vIENvbnZlcnQgdGhlIGlucHV0IGluIFVDUy0yIHRvIFVuaWNvZGVcblx0XHRpbnB1dCA9IHVjczJkZWNvZGUoaW5wdXQpO1xuXG5cdFx0Ly8gQ2FjaGUgdGhlIGxlbmd0aFxuXHRcdGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgc3RhdGVcblx0XHRuID0gaW5pdGlhbE47XG5cdFx0ZGVsdGEgPSAwO1xuXHRcdGJpYXMgPSBpbml0aWFsQmlhcztcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHNcblx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgMHg4MCkge1xuXHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoY3VycmVudFZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aGFuZGxlZENQQ291bnQgPSBiYXNpY0xlbmd0aCA9IG91dHB1dC5sZW5ndGg7XG5cblx0XHQvLyBgaGFuZGxlZENQQ291bnRgIGlzIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgdGhhdCBoYXZlIGJlZW4gaGFuZGxlZDtcblx0XHQvLyBgYmFzaWNMZW5ndGhgIGlzIHRoZSBudW1iZXIgb2YgYmFzaWMgY29kZSBwb2ludHMuXG5cblx0XHQvLyBGaW5pc2ggdGhlIGJhc2ljIHN0cmluZyAtIGlmIGl0IGlzIG5vdCBlbXB0eSAtIHdpdGggYSBkZWxpbWl0ZXJcblx0XHRpZiAoYmFzaWNMZW5ndGgpIHtcblx0XHRcdG91dHB1dC5wdXNoKGRlbGltaXRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBlbmNvZGluZyBsb29wOlxuXHRcdHdoaWxlIChoYW5kbGVkQ1BDb3VudCA8IGlucHV0TGVuZ3RoKSB7XG5cblx0XHRcdC8vIEFsbCBub24tYmFzaWMgY29kZSBwb2ludHMgPCBuIGhhdmUgYmVlbiBoYW5kbGVkIGFscmVhZHkuIEZpbmQgdGhlIG5leHRcblx0XHRcdC8vIGxhcmdlciBvbmU6XG5cdFx0XHRmb3IgKG0gPSBtYXhJbnQsIGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA+PSBuICYmIGN1cnJlbnRWYWx1ZSA8IG0pIHtcblx0XHRcdFx0XHRtID0gY3VycmVudFZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluY3JlYXNlIGBkZWx0YWAgZW5vdWdoIHRvIGFkdmFuY2UgdGhlIGRlY29kZXIncyA8bixpPiBzdGF0ZSB0byA8bSwwPixcblx0XHRcdC8vIGJ1dCBndWFyZCBhZ2FpbnN0IG92ZXJmbG93XG5cdFx0XHRoYW5kbGVkQ1BDb3VudFBsdXNPbmUgPSBoYW5kbGVkQ1BDb3VudCArIDE7XG5cdFx0XHRpZiAobSAtIG4gPiBmbG9vcigobWF4SW50IC0gZGVsdGEpIC8gaGFuZGxlZENQQ291bnRQbHVzT25lKSkge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsdGEgKz0gKG0gLSBuKSAqIGhhbmRsZWRDUENvdW50UGx1c09uZTtcblx0XHRcdG4gPSBtO1xuXG5cdFx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgbiAmJiArK2RlbHRhID4gbWF4SW50KSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID09IG4pIHtcblx0XHRcdFx0XHQvLyBSZXByZXNlbnQgZGVsdGEgYXMgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlclxuXHRcdFx0XHRcdGZvciAocSA9IGRlbHRhLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblx0XHRcdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXHRcdFx0XHRcdFx0aWYgKHEgPCB0KSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cU1pbnVzVCA9IHEgLSB0O1xuXHRcdFx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goXG5cdFx0XHRcdFx0XHRcdHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWModCArIHFNaW51c1QgJSBiYXNlTWludXNULCAwKSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRxID0gZmxvb3IocU1pbnVzVCAvIGJhc2VNaW51c1QpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWMocSwgMCkpKTtcblx0XHRcdFx0XHRiaWFzID0gYWRhcHQoZGVsdGEsIGhhbmRsZWRDUENvdW50UGx1c09uZSwgaGFuZGxlZENQQ291bnQgPT0gYmFzaWNMZW5ndGgpO1xuXHRcdFx0XHRcdGRlbHRhID0gMDtcblx0XHRcdFx0XHQrK2hhbmRsZWRDUENvdW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdCsrZGVsdGE7XG5cdFx0XHQrK247XG5cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dC5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBVbmljb2RlLiBPbmx5IHRoZVxuXHQgKiBQdW55Y29kZWQgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IG9uIGEgc3RyaW5nIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBjb252ZXJ0ZWQgdG9cblx0ICogVW5pY29kZS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIFB1bnljb2RlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQgdG8gVW5pY29kZS5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFVuaWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIFB1bnljb2RlXG5cdCAqIHN0cmluZy5cblx0ICovXG5cdGZ1bmN0aW9uIHRvVW5pY29kZShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhQdW55Y29kZS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyBkZWNvZGUoc3RyaW5nLnNsaWNlKDQpLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgVW5pY29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gUHVueWNvZGUuIE9ubHkgdGhlXG5cdCAqIG5vbi1BU0NJSSBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0J3MgYWxyZWFkeSBpbiBBU0NJSS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQsIGFzIGEgVW5pY29kZSBzdHJpbmcuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBQdW55Y29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gZG9tYWluIG5hbWUuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b0FTQ0lJKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleE5vbkFTQ0lJLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/ICd4bi0tJyArIGVuY29kZShzdHJpbmcpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqIERlZmluZSB0aGUgcHVibGljIEFQSSAqL1xuXHRwdW55Y29kZSA9IHtcblx0XHQvKipcblx0XHQgKiBBIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGN1cnJlbnQgUHVueWNvZGUuanMgdmVyc2lvbiBudW1iZXIuXG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgU3RyaW5nXG5cdFx0ICovXG5cdFx0J3ZlcnNpb24nOiAnMS4yLjQnLFxuXHRcdC8qKlxuXHRcdCAqIEFuIG9iamVjdCBvZiBtZXRob2RzIHRvIGNvbnZlcnQgZnJvbSBKYXZhU2NyaXB0J3MgaW50ZXJuYWwgY2hhcmFjdGVyXG5cdFx0ICogcmVwcmVzZW50YXRpb24gKFVDUy0yKSB0byBVbmljb2RlIGNvZGUgcG9pbnRzLCBhbmQgYmFjay5cblx0XHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIE9iamVjdFxuXHRcdCAqL1xuXHRcdCd1Y3MyJzoge1xuXHRcdFx0J2RlY29kZSc6IHVjczJkZWNvZGUsXG5cdFx0XHQnZW5jb2RlJzogdWNzMmVuY29kZVxuXHRcdH0sXG5cdFx0J2RlY29kZSc6IGRlY29kZSxcblx0XHQnZW5jb2RlJzogZW5jb2RlLFxuXHRcdCd0b0FTQ0lJJzogdG9BU0NJSSxcblx0XHQndG9Vbmljb2RlJzogdG9Vbmljb2RlXG5cdH07XG5cblx0LyoqIEV4cG9zZSBgcHVueWNvZGVgICovXG5cdC8vIFNvbWUgQU1EIGJ1aWxkIG9wdGltaXplcnMsIGxpa2Ugci5qcywgY2hlY2sgZm9yIHNwZWNpZmljIGNvbmRpdGlvbiBwYXR0ZXJuc1xuXHQvLyBsaWtlIHRoZSBmb2xsb3dpbmc6XG5cdGlmIChcblx0XHR0eXBlb2YgZGVmaW5lID09ICdmdW5jdGlvbicgJiZcblx0XHR0eXBlb2YgZGVmaW5lLmFtZCA9PSAnb2JqZWN0JyAmJlxuXHRcdGRlZmluZS5hbWRcblx0KSB7XG5cdFx0ZGVmaW5lKCdwdW55Y29kZScsIGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHB1bnljb2RlO1xuXHRcdH0pO1xuXHR9IGVsc2UgaWYgKGZyZWVFeHBvcnRzICYmICFmcmVlRXhwb3J0cy5ub2RlVHlwZSkge1xuXHRcdGlmIChmcmVlTW9kdWxlKSB7IC8vIGluIE5vZGUuanMgb3IgUmluZ29KUyB2MC44LjArXG5cdFx0XHRmcmVlTW9kdWxlLmV4cG9ydHMgPSBwdW55Y29kZTtcblx0XHR9IGVsc2UgeyAvLyBpbiBOYXJ3aGFsIG9yIFJpbmdvSlMgdjAuNy4wLVxuXHRcdFx0Zm9yIChrZXkgaW4gcHVueWNvZGUpIHtcblx0XHRcdFx0cHVueWNvZGUuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAoZnJlZUV4cG9ydHNba2V5XSA9IHB1bnljb2RlW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHsgLy8gaW4gUmhpbm8gb3IgYSB3ZWIgYnJvd3NlclxuXHRcdHJvb3QucHVueWNvZGUgPSBwdW55Y29kZTtcblx0fVxuXG59KHRoaXMpKTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBvYmpba10ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYWJvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwid2h5LXRhdW51cy1cXFwiPldoeSBUYXVudXM/PC9oMT5cXG48cD5UYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIDxlbT5hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZTwvZW0+IGFzIHdlbGwuIDxzdHJvbmc+VGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQ8L3N0cm9uZz4uIEl0IHVzZXMgc2VydmVyLXNpZGUgcmVuZGVyaW5nIHRvIGdldCBjb250ZW50IHRvIHlvdXIgaHVtYW5zIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCBpdCB1c2VzIGNsaWVudC1zaWRlIHJlbmRlcmluZyB0byBpbXByb3ZlIHRoZWlyIGV4cGVyaWVuY2UuPC9wPlxcbjxwPldoaWxlIGl0IGZvY3VzZXMgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIDxzdHJvbmc+PGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2FkanVzdGluZy11eC1mb3ItaHVtYW5zXFxcIj51c2FiaWxpdHk8L2E+IGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zPC9zdHJvbmc+IGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgPHN0cm9uZz5zdGlsbCBleHBlY3RlZCB0byB3b3JrPC9zdHJvbmc+LjwvcD5cXG48cD5Gb3IgZXhhbXBsZSwgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIHNpdGUgdXNlcyBwbGFpbi1vbGQgbGlua3MgdG8gbmF2aWdhdGUgZnJvbSBvbmUgdmlldyB0byBhbm90aGVyLCBhbmQgdGhlbiBhZGRzIGEgPGNvZGU+Y2xpY2s8L2NvZGU+IGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0JiMzOTtzIG9rYXksIGJlY2F1c2Ugd2UgYWNrbm93bGVkZ2UgdGhhdCA8c3Ryb25nPm91ciBzaXRlcyBkb24mIzM5O3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3Nlcjwvc3Ryb25nPi4gU2ltaWxhcmx5LCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXFwiPnBlcmZvcm1hbmNlIGlzIGdyZWF0bHkgZW5oYW5jZWQ8L2E+IGJ5IGRlbGl2ZXJpbmcgY29udGVudCB0byB0aGUgaHVtYW4gYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIHRoZW4gYWRkaW5nIGZ1bmN0aW9uYWxpdHkgb24gdG9wIG9mIHRoYXQuPC9wPlxcbjxwPldpdGggcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIGlmIHRoZSBmdW5jdGlvbmFsaXR5IG5ldmVyIGdldHMgdGhlcmUgYmVjYXVzZSBhIEphdmFTY3JpcHQgcmVzb3VyY2UgZmFpbGVkIHRvIGxvYWQgYmVjYXVzZSB0aGUgbmV0d29yayBmYWlsZWQgPGVtPihub3QgdW5jb21tb24gaW4gdGhlIG1vYmlsZSBlcmEpPC9lbT4gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrITwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktbm90LW90aGVyLWZyYW1ld29ya3MtXFxcIj5XaHkgTm90IE90aGVyIEZyYW1ld29ya3M/PC9oMT5cXG48cD5NYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4mIzM5O3QgZGVzaWduZWQgd2l0aCBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJiMzOTt0IHByaW9yaXRpemVkLCBhbmQgaHVtYW5zIGFyZSBleHBlY3RlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5kb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgaHVtYW4tZGlnZXN0aWJsZSBjb250ZW50PC9hPi4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIFNFTyBpcyBhbHNvIGEgcHJvYmxlbS4gR29vZ2xlIGlzbiYjMzk7dCB0aGUgb25seSB3ZWIgY3Jhd2xlciBvcGVyYXRvciBvdXQgdGhlcmUsIGFuZCBpdCBtaWdodCBiZSBhIHdoaWxlIGJlZm9yZSBzb2NpYWwgbWVkaWEgbGluayBjcmF3bGVycyBjYXRjaCB1cCB3aXRoIHRoZW0uPC9wPlxcbjxwPkxhdGVseSwgd2UgY2FuIG9ic2VydmUgbWFueSBtYXR1cmUgb3Blbi1zb3VyY2UgZnJhbWV3b3JrcyBhcmUgZHJvcHBpbmcgc3VwcG9ydCBmb3Igb2xkZXIgYnJvd3NlcnMuIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5JiMzOTtyZSBhcmNoaXRlY3RlZCwgd2hlcmUgdGhlIGRldmVsb3BlciBpcyBwdXQgZmlyc3QuIDxzdHJvbmc+VGF1bnVzIGlzIDxhIGhyZWY9XFxcImh0dHBzOi8vdHdpdHRlci5jb20vaGFzaHRhZy9odW1hbmZpcnN0XFxcIj4jaHVtYW5maXJzdDwvYT48L3N0cm9uZz4sIG1lYW5pbmcgdGhhdCBpdCBjb25jZWRlcyB0aGF0IGh1bWFucyBhcmUgbW9yZSBpbXBvcnRhbnQgdGhhbiB0aGUgZGV2ZWxvcGVycyBidWlsZGluZyB0aGVpciBhcHBsaWNhdGlvbnMuPC9wPlxcbjxwPlByb2dyZXNzaXZlbHkgZW5oYW5jZWQgYXBwbGljYXRpb25zIGFyZSBhbHdheXMgZ29pbmcgdG8gaGF2ZSBncmVhdCBicm93c2VyIHN1cHBvcnQgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkmIzM5O3JlIGFyY2hpdGVjdGVkLiBBcyB0aGUgbmFtZSBpbXBsaWVzLCBhIGJhc2VsaW5lIGlzIGVzdGFibGlzaGVkIHdoZXJlIHdlIGRlbGl2ZXIgdGhlIGNvcmUgZXhwZXJpZW5jZSB0byB0aGUgdXNlciA8ZW0+KHR5cGljYWxseSBpbiB0aGUgZm9ybSBvZiByZWFkYWJsZSBIVE1MIGNvbnRlbnQpPC9lbT4sIGFuZCB0aGVuIGVuaGFuY2UgaXQgPHN0cm9uZz5pZiBwb3NzaWJsZTwvc3Ryb25nPiB1c2luZyBDU1MgYW5kIEphdmFTY3JpcHQuIEJ1aWxkaW5nIGFwcGxpY2F0aW9ucyBpbiB0aGlzIHdheSBtZWFucyB0aGF0IHlvdSYjMzk7bGwgYmUgYWJsZSB0byByZWFjaCB0aGUgbW9zdCBwZW9wbGUgd2l0aCB5b3VyIGNvcmUgZXhwZXJpZW5jZSwgYW5kIHlvdSYjMzk7bGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmVhdHVyZXNcXFwiPkZlYXR1cmVzPC9oMT5cXG48cD5PdXQgb2YgdGhlIGJveCwgVGF1bnVzIGVuc3VyZXMgdGhhdCB5b3VyIHNpdGUgd29ya3Mgb24gYW55IEhUTUwtZW5hYmxlZCBkb2N1bWVudCB2aWV3ZXIgYW5kIGV2ZW4gdGhlIHRlcm1pbmFsLCBwcm92aWRpbmcgc3VwcG9ydCBmb3IgcGxhaW4gdGV4dCByZXNwb25zZXMgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+d2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWQ8L2E+LiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UmIzM5O2xsIG9ubHkgaGF2ZSB0byBkZWNsYXJlIHRoZXNlIG9uY2UgYnV0IHRoZXkmIzM5O2xsIGJlIHVzZWQgaW4gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+VGF1bnVzIGZlYXR1cmVzIGEgcmVhc29uYWJseSBlbmhhbmNlZCBleHBlcmllbmNlLCB3aGVyZSBpZiBmZWF0dXJlcyBhcmVuJiMzOTt0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkmIzM5O3JlIGp1c3Qgbm90IHByb3ZpZGVkLiBGb3IgZXhhbXBsZSwgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBtYWtlcyB1c2Ugb2YgdGhlIDxjb2RlPmhpc3Rvcnk8L2NvZGU+IEFQSSBidXQgaWYgdGhhdCYjMzk7cyBub3QgYXZhaWxhYmxlIHRoZW4gaXQmIzM5O2xsIGZhbGwgYmFjayB0byBzaW1wbHkgbm90IG1lZGRsaW5nIHdpdGggbGlua3MgaW5zdGVhZCBvZiB1c2luZyBhIGNsaWVudC1zaWRlLW9ubHkgaGFzaCByb3V0ZXIuPC9wPlxcbjxwPlRhdW51cyBjYW4gZGVhbCB3aXRoIHZpZXcgY2FjaGluZyBvbiB5b3VyIGJlaGFsZiwgaWYgeW91IHNvIGRlc2lyZSwgdXNpbmcgPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXFwiPmFzeW5jaHJvbm91cyBlbWJlZGRlZCBkYXRhYmFzZSBzdG9yZXM8L2E+IG9uIHRoZSBjbGllbnQtc2lkZS4gVHVybnMgb3V0LCB0aGVyZSYjMzk7cyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI3NlYXJjaD1pbmRleGVkZGJcXFwiPnByZXR0eSBnb29kIGJyb3dzZXIgc3VwcG9ydCBmb3IgSW5kZXhlZERCPC9hPi4gT2YgY291cnNlLCBJbmRleGVkREIgd2lsbCBvbmx5IGJlIHVzZWQgaWYgaXQmIzM5O3MgYXZhaWxhYmxlLCBhbmQgaWYgaXQmIzM5O3Mgbm90IHRoZW4gdmlld3Mgd29uJiMzOTt0IGJlIGNhY2hlZCBpbiB0aGUgY2xpZW50LXNpZGUgYmVzaWRlcyBhbiBpbi1tZW1vcnkgc3RvcmUuIDxzdHJvbmc+VGhlIHNpdGUgd29uJiMzOTt0IHNpbXBseSByb2xsIG92ZXIgYW5kIGRpZSwgdGhvdWdoLjwvc3Ryb25nPjwvcD5cXG48cD5JZiB5b3UmIzM5O3ZlIHR1cm5lZCBjbGllbnQtc2lkZSBjYWNoaW5nIG9uLCB0aGVuIHlvdSBjYW4gYWxzbyB0dXJuIG9uIHRoZSA8c3Ryb25nPnZpZXcgcHJlLWZldGNoaW5nIGZlYXR1cmU8L3N0cm9uZz4sIHdoaWNoIHdpbGwgc3RhcnQgZG93bmxvYWRpbmcgdmlld3MgYXMgc29vbiBhcyBodW1hbnMgaG92ZXIgb24gbGlua3MsIGFzIHRvIGRlbGl2ZXIgYSA8ZW0+ZmFzdGVyIHBlcmNlaXZlZCBodW1hbiBleHBlcmllbmNlPC9lbT4uPC9wPlxcbjxwPlRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmEgZmV3IGNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4geW91IGNhbiB1c2UgdG8gZW5oYW5jZSB5b3VyIGRldmVsb3BtZW50IGV4cGVyaWVuY2UsIGFzIHdlbGwuPC9wPlxcbjxwPldpdGggVGF1bnVzIHlvdSYjMzk7bGwgYmUgaW4gY2hhcmdlLiA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5BcmUgeW91IHJlYWR5IHRvIGdldCBzdGFydGVkPzwvYT48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA3LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmFtaWxpYXJpdHlcXFwiPkZhbWlsaWFyaXR5PC9oMT5cXG48cD5Zb3UgY2FuIHVzZSBUYXVudXMgdG8gZGV2ZWxvcCBhcHBsaWNhdGlvbnMgdXNpbmcgeW91ciBmYXZvcml0ZSBOb2RlLmpzIEhUVFAgc2VydmVyLCA8c3Ryb25nPmJvdGggPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGFuZCA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4gYXJlIGZ1bGx5IHN1cHBvcnRlZDwvc3Ryb25nPi4gSW4gYm90aCBjYXNlcywgeW91JiMzOTtsbCA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5idWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSYjMzk7cmUgYWxyZWFkeSB1c2VkIHRvPC9hPiwgZXhjZXB0IHlvdSB3b24mIzM5O3QgaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiB0aGUgdmlldyBjb250cm9sbGVycyBvciBkZWZpbmUgYW55IHZpZXcgcm91dGVzIHNpbmNlIFRhdW51cyB3aWxsIGRlYWwgd2l0aCB0aGF0IG9uIHlvdXIgYmVoYWxmLiBJbiB0aGUgY29udHJvbGxlcnMgeW91JiMzOTtsbCBiZSBhYmxlIHRvIGRvIGV2ZXJ5dGhpbmcgeW91JiMzOTtyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSYjMzk7bGwgaGF2ZSB0byByZXR1cm4gYSBKU09OIG1vZGVsIHdoaWNoIHdpbGwgYmUgdXNlZCB0byByZW5kZXIgYSB2aWV3LjwvcD5cXG48cD5Zb3UgY2FuIHVzZSBhbnkgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgeW91IHdhbnQsIHByb3ZpZGVkIHRoYXQgaXQgY2FuIGJlIGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuIFRoYXQmIzM5O3MgYmVjYXVzZSBUYXVudXMgdHJlYXRzIHZpZXdzIGFzIG1lcmUgSmF2YVNjcmlwdCBmdW5jdGlvbnMsIHJhdGhlciB0aGFuIGJlaW5nIHRpZWQgaW50byBhIHNwZWNpZmljIHZpZXctcmVuZGVyaW5nIGVuZ2luZS48L3A+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGp1c3QgZnVuY3Rpb25zLCB0b28uIFlvdSBjYW4gYnJpbmcgeW91ciBvd24gc2VsZWN0b3IgZW5naW5lLCB5b3VyIG93biBBSkFYIGxpYnJhcmllcywgYW5kIHlvdXIgb3duIGRhdGEtYmluZGluZyBzb2x1dGlvbnMuIEl0IG1pZ2h0IG1lYW4gdGhlcmUmIzM5O3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UmIzM5O2xsIGFsc28gYmUgZnJlZSB0byBwaWNrIHdoYXRldmVyIGxpYnJhcmllcyB5b3UmIzM5O3JlIG1vc3QgY29tZm9ydGFibGUgd2l0aCEgVGhhdCBiZWluZyBzYWlkLCBUYXVudXMgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5kb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXM8L2E+IHRoYXQgd29yayB3ZWxsIHdpdGggaXQuPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IFRhdW51cz9cXG5cXG4gICAgVGF1bnVzIGZvY3VzZXMgb24gZGVsaXZlcmluZyBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgZXhwZXJpZW5jZSB0byB0aGUgZW5kLXVzZXIsIHdoaWxlIHByb3ZpZGluZyBfYSByZWFzb25hYmxlIGRldmVsb3BtZW50IGV4cGVyaWVuY2VfIGFzIHdlbGwuICoqVGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQqKi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS5cXG5cXG4gICAgV2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgKipbdXNhYmlsaXR5XVsyXSBhbmQgcGVyZm9ybWFuY2UgYXJlIGJvdGggY29yZSBjb25jZXJucyoqIGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgKipzdGlsbCBleHBlY3RlZCB0byB3b3JrKiouXFxuXFxuICAgIEZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSBgY2xpY2tgIGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0J3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0ICoqb3VyIHNpdGVzIGRvbid0IG5lZWQgdG8gbG9vayBhbmQgYmVoYXZlIHRoZSBzYW1lIG9uIGV2ZXJ5IGJyb3dzZXIqKi4gU2ltaWxhcmx5LCBbcGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZF1bMV0gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC5cXG5cXG4gICAgV2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCBfKG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSlfIG9yIGJlY2F1c2UgdGhlIHVzZXIgYmxvY2tlZCBKYXZhU2NyaXB0LCB5b3VyIGFwcGxpY2F0aW9uIHdpbGwgc3RpbGwgd29yayFcXG5cXG4gICAgWzFdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXG4gICAgWzJdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFdoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz9cXG5cXG4gICAgTWFueSBvdGhlciBmcmFtZXdvcmtzIHdlcmVuJ3QgZGVzaWduZWQgd2l0aCBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJ3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIFtkb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgaHVtYW4tZGlnZXN0aWJsZSBjb250ZW50XVsyXS4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIFNFTyBpcyBhbHNvIGEgcHJvYmxlbS4gR29vZ2xlIGlzbid0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS5cXG5cXG4gICAgTGF0ZWx5LCB3ZSBjYW4gb2JzZXJ2ZSBtYW55IG1hdHVyZSBvcGVuLXNvdXJjZSBmcmFtZXdvcmtzIGFyZSBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQsIHdoZXJlIHRoZSBkZXZlbG9wZXIgaXMgcHV0IGZpcnN0LiAqKlRhdW51cyBpcyBbI2h1bWFuZmlyc3RdWzFdKiosIG1lYW5pbmcgdGhhdCBpdCBjb25jZWRlcyB0aGF0IGh1bWFucyBhcmUgbW9yZSBpbXBvcnRhbnQgdGhhbiB0aGUgZGV2ZWxvcGVycyBidWlsZGluZyB0aGVpciBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIFByb2dyZXNzaXZlbHkgZW5oYW5jZWQgYXBwbGljYXRpb25zIGFyZSBhbHdheXMgZ29pbmcgdG8gaGF2ZSBncmVhdCBicm93c2VyIHN1cHBvcnQgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIF8odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudClfLCBhbmQgdGhlbiBlbmhhbmNlIGl0ICoqaWYgcG9zc2libGUqKiB1c2luZyBDU1MgYW5kIEphdmFTY3JpcHQuIEJ1aWxkaW5nIGFwcGxpY2F0aW9ucyBpbiB0aGlzIHdheSBtZWFucyB0aGF0IHlvdSdsbCBiZSBhYmxlIHRvIHJlYWNoIHRoZSBtb3N0IHBlb3BsZSB3aXRoIHlvdXIgY29yZSBleHBlcmllbmNlLCBhbmQgeW91J2xsIGFsc28gYmUgYWJsZSB0byBwcm92aWRlIGh1bWFucyBpbiBtb3JlIG1vZGVybiBicm93c2VycyB3aXRoIGFsbCBvZiB0aGUgbGF0ZXN0IGZlYXR1cmVzIGFuZCB0ZWNobm9sb2dpZXMuXFxuXFxuICAgIFsxXTogaHR0cHM6Ly90d2l0dGVyLmNvbS9oYXNodGFnL2h1bWFuZmlyc3RcXG4gICAgWzJdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvc3RvcC1icmVha2luZy10aGUtd2ViXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBGZWF0dXJlc1xcblxcbiAgICBPdXQgb2YgdGhlIGJveCwgVGF1bnVzIGVuc3VyZXMgdGhhdCB5b3VyIHNpdGUgd29ya3Mgb24gYW55IEhUTUwtZW5hYmxlZCBkb2N1bWVudCB2aWV3ZXIgYW5kIGV2ZW4gdGhlIHRlcm1pbmFsLCBwcm92aWRpbmcgc3VwcG9ydCBmb3IgcGxhaW4gdGV4dCByZXNwb25zZXMgW3dpdGhvdXQgYW55IGNvbmZpZ3VyYXRpb24gbmVlZGVkXVsyXS4gRXZlbiB3aGlsZSBUYXVudXMgcHJvdmlkZXMgc2hhcmVkLXJlbmRlcmluZyBjYXBhYmlsaXRpZXMsIGl0IG9mZmVycyBjb2RlIHJldXNlIG9mIHZpZXdzIGFuZCByb3V0ZXMsIG1lYW5pbmcgeW91J2xsIG9ubHkgaGF2ZSB0byBkZWNsYXJlIHRoZXNlIG9uY2UgYnV0IHRoZXknbGwgYmUgdXNlZCBpbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBUYXVudXMgZmVhdHVyZXMgYSByZWFzb25hYmx5IGVuaGFuY2VkIGV4cGVyaWVuY2UsIHdoZXJlIGlmIGZlYXR1cmVzIGFyZW4ndCBhdmFpbGFibGUgb24gYSBicm93c2VyLCB0aGV5J3JlIGp1c3Qgbm90IHByb3ZpZGVkLiBGb3IgZXhhbXBsZSwgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBtYWtlcyB1c2Ugb2YgdGhlIGBoaXN0b3J5YCBBUEkgYnV0IGlmIHRoYXQncyBub3QgYXZhaWxhYmxlIHRoZW4gaXQnbGwgZmFsbCBiYWNrIHRvIHNpbXBseSBub3QgbWVkZGxpbmcgd2l0aCBsaW5rcyBpbnN0ZWFkIG9mIHVzaW5nIGEgY2xpZW50LXNpZGUtb25seSBoYXNoIHJvdXRlci5cXG5cXG4gICAgVGF1bnVzIGNhbiBkZWFsIHdpdGggdmlldyBjYWNoaW5nIG9uIHlvdXIgYmVoYWxmLCBpZiB5b3Ugc28gZGVzaXJlLCB1c2luZyBbYXN5bmNocm9ub3VzIGVtYmVkZGVkIGRhdGFiYXNlIHN0b3Jlc11bM10gb24gdGhlIGNsaWVudC1zaWRlLiBUdXJucyBvdXQsIHRoZXJlJ3MgW3ByZXR0eSBnb29kIGJyb3dzZXIgc3VwcG9ydCBmb3IgSW5kZXhlZERCXVs0XS4gT2YgY291cnNlLCBJbmRleGVkREIgd2lsbCBvbmx5IGJlIHVzZWQgaWYgaXQncyBhdmFpbGFibGUsIGFuZCBpZiBpdCdzIG5vdCB0aGVuIHZpZXdzIHdvbid0IGJlIGNhY2hlZCBpbiB0aGUgY2xpZW50LXNpZGUgYmVzaWRlcyBhbiBpbi1tZW1vcnkgc3RvcmUuICoqVGhlIHNpdGUgd29uJ3Qgc2ltcGx5IHJvbGwgb3ZlciBhbmQgZGllLCB0aG91Z2guKipcXG5cXG4gICAgSWYgeW91J3ZlIHR1cm5lZCBjbGllbnQtc2lkZSBjYWNoaW5nIG9uLCB0aGVuIHlvdSBjYW4gYWxzbyB0dXJuIG9uIHRoZSAqKnZpZXcgcHJlLWZldGNoaW5nIGZlYXR1cmUqKiwgd2hpY2ggd2lsbCBzdGFydCBkb3dubG9hZGluZyB2aWV3cyBhcyBzb29uIGFzIGh1bWFucyBob3ZlciBvbiBsaW5rcywgYXMgdG8gZGVsaXZlciBhIF9mYXN0ZXIgcGVyY2VpdmVkIGh1bWFuIGV4cGVyaWVuY2VfLlxcblxcbiAgICBUYXVudXMgcHJvdmlkZXMgdGhlIGJhcmUgYm9uZXMgZm9yIHlvdXIgYXBwbGljYXRpb24gc28gdGhhdCB5b3UgY2FuIHNlcGFyYXRlIGNvbmNlcm5zIGludG8gcm91dGVzLCBjb250cm9sbGVycywgbW9kZWxzLCBhbmQgdmlld3MuIFRoZW4gaXQgZ2V0cyBvdXQgb2YgdGhlIHdheSwgYnkgZGVzaWduLiBUaGVyZSBhcmUgW2EgZmV3IGNvbXBsZW1lbnRhcnkgbW9kdWxlc11bMV0geW91IGNhbiB1c2UgdG8gZW5oYW5jZSB5b3VyIGRldmVsb3BtZW50IGV4cGVyaWVuY2UsIGFzIHdlbGwuXFxuXFxuICAgIFdpdGggVGF1bnVzIHlvdSdsbCBiZSBpbiBjaGFyZ2UuIFtBcmUgeW91IHJlYWR5IHRvIGdldCBzdGFydGVkP11bMl1cXG5cXG4gICAgWzFdOiAvY29tcGxlbWVudHNcXG4gICAgWzJdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFszXTogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXG4gICAgWzRdOiBodHRwOi8vY2FuaXVzZS5jb20vI3NlYXJjaD1pbmRleGVkZGJcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEZhbWlsaWFyaXR5XFxuXFxuICAgIFlvdSBjYW4gdXNlIFRhdW51cyB0byBkZXZlbG9wIGFwcGxpY2F0aW9ucyB1c2luZyB5b3VyIGZhdm9yaXRlIE5vZGUuanMgSFRUUCBzZXJ2ZXIsICoqYm90aCBbRXhwcmVzc11bM10gYW5kIFtIYXBpXVs0XSBhcmUgZnVsbHkgc3VwcG9ydGVkKiouIEluIGJvdGggY2FzZXMsIHlvdSdsbCBbYnVpbGQgY29udHJvbGxlcnMgdGhlIHdheSB5b3UncmUgYWxyZWFkeSB1c2VkIHRvXVsxXSwgZXhjZXB0IHlvdSB3b24ndCBoYXZlIHRvIGByZXF1aXJlYCB0aGUgdmlldyBjb250cm9sbGVycyBvciBkZWZpbmUgYW55IHZpZXcgcm91dGVzIHNpbmNlIFRhdW51cyB3aWxsIGRlYWwgd2l0aCB0aGF0IG9uIHlvdXIgYmVoYWxmLiBJbiB0aGUgY29udHJvbGxlcnMgeW91J2xsIGJlIGFibGUgdG8gZG8gZXZlcnl0aGluZyB5b3UncmUgYWxyZWFkeSBhYmxlIHRvIGRvLCBhbmQgdGhlbiB5b3UnbGwgaGF2ZSB0byByZXR1cm4gYSBKU09OIG1vZGVsIHdoaWNoIHdpbGwgYmUgdXNlZCB0byByZW5kZXIgYSB2aWV3LlxcblxcbiAgICBZb3UgY2FuIHVzZSBhbnkgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgeW91IHdhbnQsIHByb3ZpZGVkIHRoYXQgaXQgY2FuIGJlIGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuIFRoYXQncyBiZWNhdXNlIFRhdW51cyB0cmVhdHMgdmlld3MgYXMgbWVyZSBKYXZhU2NyaXB0IGZ1bmN0aW9ucywgcmF0aGVyIHRoYW4gYmVpbmcgdGllZCBpbnRvIGEgc3BlY2lmaWMgdmlldy1yZW5kZXJpbmcgZW5naW5lLlxcblxcbiAgICBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUganVzdCBmdW5jdGlvbnMsIHRvby4gWW91IGNhbiBicmluZyB5b3VyIG93biBzZWxlY3RvciBlbmdpbmUsIHlvdXIgb3duIEFKQVggbGlicmFyaWVzLCBhbmQgeW91ciBvd24gZGF0YS1iaW5kaW5nIHNvbHV0aW9ucy4gSXQgbWlnaHQgbWVhbiB0aGVyZSdzIGEgYml0IG1vcmUgd29yayBpbnZvbHZlZCBmb3IgeW91LCBidXQgeW91J2xsIGFsc28gYmUgZnJlZSB0byBwaWNrIHdoYXRldmVyIGxpYnJhcmllcyB5b3UncmUgbW9zdCBjb21mb3J0YWJsZSB3aXRoISBUaGF0IGJlaW5nIHNhaWQsIFRhdW51cyBbZG9lcyByZWNvbW1lbmQgYSBmZXcgbGlicmFyaWVzXVsyXSB0aGF0IHdvcmsgd2VsbCB3aXRoIGl0LlxcblxcbiAgICBbMV06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzJdOiAvY29tcGxlbWVudHNcXG4gICAgWzNdOiBodHRwOi8vZXhwcmVzc2pzLmNvbVxcbiAgICBbNF06IGh0dHA6Ly9oYXBpanMuY29tXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwaShsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiYXBpLWRvY3VtZW50YXRpb25cXFwiPkFQSSBEb2N1bWVudGF0aW9uPC9oMT5cXG48cD5IZXJlJiMzOTtzIHRoZSBBUEkgZG9jdW1lbnRhdGlvbiBmb3IgVGF1bnVzLiBJZiB5b3UmIzM5O3ZlIG5ldmVyIHVzZWQgaXQgYmVmb3JlLCB3ZSByZWNvbW1lbmQgZ29pbmcgb3ZlciB0aGUgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9hPiBndWlkZSBiZWZvcmUganVtcGluZyBpbnRvIHRoZSBBUEkgZG9jdW1lbnRhdGlvbi4gVGhhdCB3YXksIHlvdSYjMzk7bGwgZ2V0IGEgYmV0dGVyIGlkZWEgb2Ygd2hhdCB0byBsb29rIGZvciBhbmQgaG93IHRvIHB1dCB0b2dldGhlciBzaW1wbGUgYXBwbGljYXRpb25zIHVzaW5nIFRhdW51cywgYmVmb3JlIGdvaW5nIHRocm91Z2ggZG9jdW1lbnRhdGlvbiBvbiBldmVyeSBwdWJsaWMgaW50ZXJmYWNlIHRvIFRhdW51cy48L3A+XFxuPHA+VGF1bnVzIGV4cG9zZXMgPGVtPnRocmVlIGRpZmZlcmVudCBwdWJsaWMgQVBJczwvZW0+LCBhbmQgdGhlcmUmIzM5O3MgYWxzbyA8c3Ryb25nPnBsdWdpbnMgdG8gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXI8L3N0cm9uZz4uIFRoaXMgZG9jdW1lbnQgY292ZXJzIGFsbCB0aHJlZSBBUElzIGV4dGVuc2l2ZWx5LiBJZiB5b3UmIzM5O3JlIGNvbmNlcm5lZCBhYm91dCB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgVGF1bnVzLCBwbGVhc2UgcmVmZXIgdG8gdGhlIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvYT4gZ3VpZGUuIFRoaXMgZG9jdW1lbnQgYWltcyB0byBvbmx5IGNvdmVyIGhvdyB0aGUgcHVibGljIGludGVyZmFjZSBhZmZlY3RzIGFwcGxpY2F0aW9uIHN0YXRlLCBidXQgPHN0cm9uZz5kb2VzbiYjMzk7dCBkZWx2ZSBpbnRvIGltcGxlbWVudGF0aW9uIGRldGFpbHM8L3N0cm9uZz4uPC9wPlxcbjxoMSBpZD1cXFwidGFibGUtb2YtY29udGVudHNcXFwiPlRhYmxlIG9mIENvbnRlbnRzPC9oMT5cXG48dWw+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI3NlcnZlci1zaWRlLWFwaVxcXCI+c2VydmVyLXNpZGUgQVBJPC9hPiB0aGF0IGRlYWxzIHdpdGggc2VydmVyLXNpZGUgcmVuZGVyaW5nPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudDwvY29kZT48L2E+IG1ldGhvZDx1bD5cXG48bGk+SXRzIDxhIGhyZWY9XFxcIiN0aGUtb3B0aW9ucy1vYmplY3RcXFwiPjxjb2RlPm9wdGlvbnM8L2NvZGU+PC9hPiBhcmd1bWVudDx1bD5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLWxheW91dC1cXFwiPjxjb2RlPmxheW91dDwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXJvdXRlcy1cXFwiPjxjb2RlPnJvdXRlczwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj48Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcGxhaW50ZXh0LVxcXCI+PGNvZGU+cGxhaW50ZXh0PC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+cmVzb2x2ZXJzPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtdmVyc2lvbi1cXFwiPjxjb2RlPnZlcnNpb248L2NvZGU+PC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5JdHMgPGEgaHJlZj1cXFwiIy1hZGRyb3V0ZS1kZWZpbml0aW9uLVxcXCI+PGNvZGU+YWRkUm91dGU8L2NvZGU+PC9hPiBhcmd1bWVudDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LVxcXCI+PGNvZGU+dGF1bnVzLnJlbmRlcjwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPnN1aXRlIG9mIHBsdWdpbnM8L2E+IGNhbiBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcjx1bD5cXG48bGk+VXNpbmcgPGEgaHJlZj1cXFwiI3VzaW5nLXRhdW51cy1leHByZXNzLVxcXCI+PGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+PC9hPiBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+PC9saT5cXG48bGk+VXNpbmcgPGEgaHJlZj1cXFwiI3VzaW5nLXRhdW51cy1oYXBpLVxcXCI+PGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+PC9hPiBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI2NvbW1hbmQtbGluZS1pbnRlcmZhY2VcXFwiPkNMSSB0aGF0IHByb2R1Y2VzIGEgd2lyaW5nIG1vZHVsZTwvYT4gZm9yIHRoZSBjbGllbnQtc2lkZTx1bD5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtb3V0cHV0LVxcXCI+PGNvZGU+LS1vdXRwdXQ8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtd2F0Y2gtXFxcIj48Y29kZT4tLXdhdGNoPC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRyYW5zZm9ybS1tb2R1bGUtXFxcIj48Y29kZT4tLXRyYW5zZm9ybSAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy1yZXNvbHZlcnMtbW9kdWxlLVxcXCI+PGNvZGU+LS1yZXNvbHZlcnMgJmx0O21vZHVsZSZndDs8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtc3RhbmRhbG9uZS1cXFwiPjxjb2RlPi0tc3RhbmRhbG9uZTwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+QSA8YSBocmVmPVxcXCIjY2xpZW50LXNpZGUtYXBpXFxcIj5jbGllbnQtc2lkZSBBUEk8L2E+IHRoYXQgZGVhbHMgd2l0aCBjbGllbnQtc2lkZSByZW5kZXJpbmc8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiBtZXRob2Q8dWw+XFxuPGxpPlVzaW5nIHRoZSA8YSBocmVmPVxcXCIjdXNpbmctdGhlLWF1dG8tc3RyYXRlZ3lcXFwiPjxjb2RlPmF1dG88L2NvZGU+PC9hPiBzdHJhdGVneTwvbGk+XFxuPGxpPlVzaW5nIHRoZSA8YSBocmVmPVxcXCIjdXNpbmctdGhlLWlubGluZS1zdHJhdGVneVxcXCI+PGNvZGU+aW5saW5lPC9jb2RlPjwvYT4gc3RyYXRlZ3k8L2xpPlxcbjxsaT5Vc2luZyB0aGUgPGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3lcXFwiPjxjb2RlPm1hbnVhbDwvY29kZT48L2E+IHN0cmF0ZWd5PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2NhY2hpbmdcXFwiPkNhY2hpbmc8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3ByZWZldGNoaW5nXFxcIj5QcmVmZXRjaGluZzwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdmVyc2lvbmluZ1xcXCI+VmVyc2lvbmluZzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub248L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2U8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb2ZmLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub2ZmPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLWludGVyY2VwdC1hY3Rpb24tZm4tXFxcIj48Y29kZT50YXVudXMuaW50ZXJjZXB0PC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1cXFwiPjxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW5hdmlnYXRlLXVybC1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZTwvY29kZT48L2E+IG1ldGhvZDx1bD5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLWVxdWFscy1yb3V0ZS1yb3V0ZS1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZS5lcXVhbHM8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXN0YXRlLVxcXCI+PGNvZGU+dGF1bnVzLnN0YXRlPC9jb2RlPjwvYT4gcHJvcGVydHk8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiN0aGUtdGF1bnVzcmMtbWFuaWZlc3RcXFwiPjxjb2RlPi50YXVudXNyYzwvY29kZT48L2E+IG1hbmlmZXN0PC9saT5cXG48L3VsPlxcbjxoMSBpZD1cXFwic2VydmVyLXNpZGUtYXBpXFxcIj5TZXJ2ZXItc2lkZSBBUEk8L2gxPlxcbjxwPlRoZSBzZXJ2ZXItc2lkZSBBUEkgaXMgdXNlZCB0byBzZXQgdXAgdGhlIHZpZXcgcm91dGVyLiBJdCB0aGVuIGdldHMgb3V0IG9mIHRoZSB3YXksIGFsbG93aW5nIHRoZSBjbGllbnQtc2lkZSB0byBldmVudHVhbGx5IHRha2Ugb3ZlciBhbmQgYWRkIGFueSBleHRyYSBzdWdhciBvbiB0b3AsIDxlbT5pbmNsdWRpbmcgY2xpZW50LXNpZGUgcmVuZGVyaW5nPC9lbT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50KGFkZFJvdXRlLCBvcHRpb25zPyk8L2NvZGU+PC9oMj5cXG48cD5Nb3VudHMgVGF1bnVzIG9uIHRvcCBvZiBhIHNlcnZlci1zaWRlIHJvdXRlciwgYnkgcmVnaXN0ZXJpbmcgZWFjaCByb3V0ZSBpbiA8Y29kZT5vcHRpb25zLnJvdXRlczwvY29kZT4gd2l0aCB0aGUgPGNvZGU+YWRkUm91dGU8L2NvZGU+IG1ldGhvZC48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+Tm90ZSB0aGF0IG1vc3Qgb2YgdGhlIHRpbWUsIDxzdHJvbmc+dGhpcyBtZXRob2Qgc2hvdWxkbiYjMzk7dCBiZSBpbnZva2VkIGRpcmVjdGx5PC9zdHJvbmc+LCBidXQgcmF0aGVyIHRocm91Z2ggb25lIG9mIHRoZSA8YSBocmVmPVxcXCIjaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+SFRUUCBmcmFtZXdvcmsgcGx1Z2luczwvYT4gcHJlc2VudGVkIGJlbG93LjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+SGVyZSYjMzk7cyBhbiBpbmNvbXBsZXRlIGV4YW1wbGUgb2YgaG93IHRoaXMgbWV0aG9kIG1heSBiZSB1c2VkLiBJdCBpcyBpbmNvbXBsZXRlIGJlY2F1c2Ugcm91dGUgZGVmaW5pdGlvbnMgaGF2ZSBtb3JlIG9wdGlvbnMgYmV5b25kIHRoZSA8Y29kZT5yb3V0ZTwvY29kZT4gYW5kIDxjb2RlPmFjdGlvbjwvY29kZT4gcHJvcGVydGllcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudGF1bnVzLm1vdW50KGFkZFJvdXRlLCB7XFxuICByb3V0ZXM6IFt7IHJvdXRlOiAmIzM5Oy8mIzM5OywgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5OyB9XVxcbn0pO1xcblxcbmZ1bmN0aW9uIGFkZFJvdXRlIChkZWZpbml0aW9uKSB7XFxuICBhcHAuZ2V0KGRlZmluaXRpb24ucm91dGUsIGRlZmluaXRpb24uYWN0aW9uKTtcXG59XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxldCYjMzk7cyBnbyBvdmVyIHRoZSBvcHRpb25zIHlvdSBjYW4gcGFzcyB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGZpcnN0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInRoZS1vcHRpb25zLW9iamVjdFxcXCI+VGhlIDxjb2RlPm9wdGlvbnM/PC9jb2RlPiBvYmplY3Q8L2g0PlxcbjxwPlRoZXJlJiMzOTtzIGEgZmV3IG9wdGlvbnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIHRoZSBzZXJ2ZXItc2lkZSBtb3VudHBvaW50LiBZb3UmIzM5O3JlIHByb2JhYmx5IGdvaW5nIHRvIGJlIHBhc3NpbmcgdGhlc2UgdG8geW91ciA8YSBocmVmPVxcXCIjaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+SFRUUCBmcmFtZXdvcmsgcGx1Z2luPC9hPiwgcmF0aGVyIHRoYW4gdXNpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBkaXJlY3RseS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1sYXlvdXQtXFxcIj48Y29kZT5vcHRpb25zLmxheW91dD88L2NvZGU+PC9oNj5cXG48cD5UaGUgPGNvZGU+bGF5b3V0PC9jb2RlPiBwcm9wZXJ0eSBpcyBleHBlY3RlZCB0byBoYXZlIHRoZSA8Y29kZT5mdW5jdGlvbihkYXRhKTwvY29kZT4gc2lnbmF0dXJlLiBJdCYjMzk7bGwgYmUgaW52b2tlZCB3aGVuZXZlciBhIGZ1bGwgSFRNTCBkb2N1bWVudCBuZWVkcyB0byBiZSByZW5kZXJlZCwgYW5kIGEgPGNvZGU+ZGF0YTwvY29kZT4gb2JqZWN0IHdpbGwgYmUgcGFzc2VkIHRvIGl0LiBUaGF0IG9iamVjdCB3aWxsIGNvbnRhaW4gZXZlcnl0aGluZyB5b3UmIzM5O3ZlIHNldCBhcyB0aGUgdmlldyBtb2RlbCwgcGx1cyBhIDxjb2RlPnBhcnRpYWw8L2NvZGU+IHByb3BlcnR5IGNvbnRhaW5pbmcgdGhlIHJhdyBIVE1MIG9mIHRoZSByZW5kZXJlZCBwYXJ0aWFsIHZpZXcuIFlvdXIgPGNvZGU+bGF5b3V0PC9jb2RlPiBtZXRob2Qgd2lsbCB0eXBpY2FsbHkgd3JhcCB0aGUgcmF3IEhUTUwgZm9yIHRoZSBwYXJ0aWFsIHdpdGggdGhlIGJhcmUgYm9uZXMgb2YgYW4gSFRNTCBkb2N1bWVudC4gQ2hlY2sgb3V0IDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi8zMzI3MTc1MTMxMmRiNmU5MjA1OWQ5ODI5M2QwYTdhYzZlOWU4ZTViL3ZpZXdzL3NlcnZlci9sYXlvdXQvbGF5b3V0LmphZGVcXFwiPnRoZSA8Y29kZT5sYXlvdXQuamFkZTwvY29kZT4gdXNlZCBpbiBQb255IEZvbzwvYT4gYXMgYW4gZXhhbXBsZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1yb3V0ZXMtXFxcIj48Y29kZT5vcHRpb25zLnJvdXRlczwvY29kZT48L2g2PlxcbjxwPlRoZSBvdGhlciBiaWcgb3B0aW9uIGlzIDxjb2RlPnJvdXRlczwvY29kZT4sIHdoaWNoIGV4cGVjdHMgYSBjb2xsZWN0aW9uIG9mIHJvdXRlIGRlZmluaXRpb25zLiBSb3V0ZSBkZWZpbml0aW9ucyB1c2UgYSBudW1iZXIgb2YgcHJvcGVydGllcyB0byBkZXRlcm1pbmUgaG93IHRoZSByb3V0ZSBpcyBnb2luZyB0byBiZWhhdmUuPC9wPlxcbjxwPkhlcmUmIzM5O3MgYW4gZXhhbXBsZSByb3V0ZSB0aGF0IHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiByb3V0aW5nIHNjaGVtZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+e1xcbiAgcm91dGU6ICYjMzk7L2FydGljbGVzLzpzbHVnJiMzOTssXFxuICBhY3Rpb246ICYjMzk7YXJ0aWNsZXMvYXJ0aWNsZSYjMzk7LFxcbiAgaWdub3JlOiBmYWxzZSxcXG4gIGNhY2hlOiAmbHQ7aW5oZXJpdCZndDtcXG59XFxuPC9jb2RlPjwvcHJlPlxcbjx1bD5cXG48bGk+PGNvZGU+cm91dGU8L2NvZGU+IGlzIGEgcm91dGUgaW4gdGhlIGZvcm1hdCB5b3VyIEhUVFAgZnJhbWV3b3JrIG9mIGNob2ljZSB1bmRlcnN0YW5kczwvbGk+XFxuPGxpPjxjb2RlPmFjdGlvbjwvY29kZT4gaXMgdGhlIG5hbWUgb2YgeW91ciBjb250cm9sbGVyIGFjdGlvbi4gSXQmIzM5O2xsIGJlIHVzZWQgdG8gZmluZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlciwgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHNob3VsZCBiZSB1c2VkIHdpdGggdGhpcyByb3V0ZSwgYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyPC9saT5cXG48bGk+PGNvZGU+Y2FjaGU8L2NvZGU+IGNhbiBiZSB1c2VkIHRvIGRldGVybWluZSB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBiZWhhdmlvciBpbiB0aGlzIGFwcGxpY2F0aW9uIHBhdGgsIGFuZCBpdCYjMzk7bGwgZGVmYXVsdCB0byBpbmhlcml0aW5nIGZyb20gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gPGVtPm9uIHRoZSBjbGllbnQtc2lkZTwvZW0+PC9saT5cXG48bGk+PGNvZGU+aWdub3JlPC9jb2RlPiBpcyB1c2VkIGluIHRob3NlIGNhc2VzIHdoZXJlIHlvdSB3YW50IGEgVVJMIHRvIGJlIGlnbm9yZWQgYnkgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBldmVuIGlmIHRoZXJlJiMzOTtzIGEgY2F0Y2gtYWxsIHJvdXRlIHRoYXQgd291bGQgbWF0Y2ggdGhhdCBVUkw8L2xpPlxcbjwvdWw+XFxuPHA+QXMgYW4gZXhhbXBsZSBvZiB0aGUgPGNvZGU+aWdub3JlPC9jb2RlPiB1c2UgY2FzZSwgY29uc2lkZXIgdGhlIHJvdXRpbmcgdGFibGUgc2hvd24gYmVsb3cuIFRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZG9lc24mIzM5O3Qga25vdyA8ZW0+KGFuZCBjYW4mIzM5O3Qga25vdyB1bmxlc3MgeW91IHBvaW50IGl0IG91dCk8L2VtPiB3aGF0IHJvdXRlcyBhcmUgc2VydmVyLXNpZGUgb25seSwgYW5kIGl0JiMzOTtzIHVwIHRvIHlvdSB0byBwb2ludCB0aG9zZSBvdXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPltcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7L2hvbWUvaW5kZXgmIzM5OyB9LFxcbiAgeyByb3V0ZTogJiMzOTsvZmVlZCYjMzk7LCBpZ25vcmU6IHRydWUgfSxcXG4gIHsgcm91dGU6ICYjMzk7LyomIzM5OywgYWN0aW9uOiAmIzM5O2Vycm9yL25vdC1mb3VuZCYjMzk7IH1cXG5dXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoaXMgc3RlcCBpcyBuZWNlc3Nhcnkgd2hlbmV2ZXIgeW91IGhhdmUgYW4gYW5jaG9yIGxpbmsgcG9pbnRlZCBhdCBzb21ldGhpbmcgbGlrZSBhbiBSU1MgZmVlZC4gVGhlIDxjb2RlPmlnbm9yZTwvY29kZT4gcHJvcGVydHkgaXMgZWZmZWN0aXZlbHkgdGVsbGluZyB0aGUgY2xpZW50LXNpZGUgPGVtPiZxdW90O2RvbiYjMzk7dCBoaWphY2sgbGlua3MgY29udGFpbmluZyB0aGlzIFVSTCZxdW90OzwvZW0+LjwvcD5cXG48cD5QbGVhc2Ugbm90ZSB0aGF0IGV4dGVybmFsIGxpbmtzIGFyZSBuZXZlciBoaWphY2tlZC4gT25seSBzYW1lLW9yaWdpbiBsaW5rcyBjb250YWluaW5nIGEgVVJMIHRoYXQgbWF0Y2hlcyBvbmUgb2YgdGhlIHJvdXRlcyB3aWxsIGJlIGhpamFja2VkIGJ5IFRhdW51cy4gRXh0ZXJuYWwgbGlua3MgZG9uJiMzOTt0IG5lZWQgdG8gYmUgPGNvZGU+aWdub3JlPC9jb2RlPmQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC1cXFwiPjxjb2RlPm9wdGlvbnMuZ2V0RGVmYXVsdFZpZXdNb2RlbD88L2NvZGU+PC9oNj5cXG48cD5UaGUgPGNvZGU+Z2V0RGVmYXVsdFZpZXdNb2RlbChkb25lKTwvY29kZT4gcHJvcGVydHkgY2FuIGJlIGEgbWV0aG9kIHRoYXQgcHV0cyB0b2dldGhlciB0aGUgYmFzZSB2aWV3IG1vZGVsLCB3aGljaCB3aWxsIHRoZW4gYmUgZXh0ZW5kZWQgb24gYW4gYWN0aW9uLWJ5LWFjdGlvbiBiYXNpcy4gV2hlbiB5b3UmIzM5O3JlIGRvbmUgY3JlYXRpbmcgYSB2aWV3IG1vZGVsLCB5b3UgY2FuIGludm9rZSA8Y29kZT5kb25lKG51bGwsIG1vZGVsKTwvY29kZT4uIElmIGFuIGVycm9yIG9jY3VycyB3aGlsZSBidWlsZGluZyB0aGUgdmlldyBtb2RlbCwgeW91IHNob3VsZCBjYWxsIDxjb2RlPmRvbmUoZXJyKTwvY29kZT4gaW5zdGVhZC48L3A+XFxuPHA+VGF1bnVzIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgPGNvZGU+ZG9uZTwvY29kZT4gaXMgaW52b2tlZCB3aXRoIGFuIGVycm9yLCBzbyB5b3UgbWlnaHQgd2FudCB0byBwdXQgc2FmZWd1YXJkcyBpbiBwbGFjZSBhcyB0byBhdm9pZCB0aGF0IGZyb20gaGFwcGVubmluZy4gVGhlIHJlYXNvbiB0aGlzIG1ldGhvZCBpcyBhc3luY2hyb25vdXMgaXMgYmVjYXVzZSB5b3UgbWF5IG5lZWQgZGF0YWJhc2UgYWNjZXNzIG9yIHNvbWVzdWNoIHdoZW4gcHV0dGluZyB0b2dldGhlciB0aGUgZGVmYXVsdHMuIFRoZSByZWFzb24gdGhpcyBpcyBhIG1ldGhvZCBhbmQgbm90IGp1c3QgYW4gb2JqZWN0IGlzIHRoYXQgdGhlIGRlZmF1bHRzIG1heSBjaGFuZ2UgZHVlIHRvIGh1bWFuIGludGVyYWN0aW9uIHdpdGggdGhlIGFwcGxpY2F0aW9uLCBhbmQgaW4gdGhvc2UgY2FzZXMgPGEgaHJlZj1cXFwiI3RhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbFxcXCI+dGhlIGRlZmF1bHRzIGNhbiBiZSByZWJ1aWx0PC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1wbGFpbnRleHQtXFxcIj48Y29kZT5vcHRpb25zLnBsYWludGV4dD88L2NvZGU+PC9oNj5cXG48cD5UaGUgPGNvZGU+cGxhaW50ZXh0PC9jb2RlPiBvcHRpb25zIG9iamVjdCBpcyBwYXNzZWQgZGlyZWN0bHkgdG8gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2hnZXRcXFwiPmhnZXQ8L2E+LCBhbmQgaXQmIzM5O3MgdXNlZCB0byA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvZjZkNmI1MDY4ZmYwM2EzODdmNTAzOTAwMTYwZDlmZGMxZTc0OTc1MC9jb250cm9sbGVycy9yb3V0aW5nLmpzI0w3MC1MNzJcXFwiPnR3ZWFrIHRoZSBwbGFpbnRleHQgdmVyc2lvbjwvYT4gb2YgeW91ciBzaXRlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLXJlc29sdmVycy1cXFwiPjxjb2RlPm9wdGlvbnMucmVzb2x2ZXJzPzwvY29kZT48L2g2PlxcbjxwPlJlc29sdmVycyBhcmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGxvY2F0aW9uIG9mIHNvbWUgb2YgdGhlIGRpZmZlcmVudCBwaWVjZXMgb2YgeW91ciBhcHBsaWNhdGlvbi4gVHlwaWNhbGx5IHlvdSB3b24mIzM5O3QgaGF2ZSB0byB0b3VjaCB0aGVzZSBpbiB0aGUgc2xpZ2h0ZXN0LjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+U2lnbmF0dXJlPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRTZXJ2ZXJDb250cm9sbGVyKGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gc2VydmVyLXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRWaWV3KGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPlRoZSA8Y29kZT5hZGRSb3V0ZTwvY29kZT4gbWV0aG9kIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IG9uIHRoZSBzZXJ2ZXItc2lkZSBpcyBtb3N0bHkgZ29pbmcgdG8gYmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBIVFRQIGZyYW1ld29yayBwbHVnaW5zLCBzbyBmZWVsIGZyZWUgdG8gc2tpcCBvdmVyIHRoZSBmb2xsb3dpbmcgc2VjdGlvbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy12ZXJzaW9uLVxcXCI+PGNvZGU+b3B0aW9ucy52ZXJzaW9uPzwvY29kZT48L2g2PlxcbjxwPlJlZmVyIHRvIHRoZSA8YSBocmVmPVxcXCIjdmVyc2lvbmluZ1xcXCI+VmVyc2lvbmluZzwvYT4gc2VjdGlvbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCItYWRkcm91dGUtZGVmaW5pdGlvbi1cXFwiPjxjb2RlPmFkZFJvdXRlKGRlZmluaXRpb24pPC9jb2RlPjwvaDQ+XFxuPHA+VGhlIDxjb2RlPmFkZFJvdXRlKGRlZmluaXRpb24pPC9jb2RlPiBtZXRob2Qgd2lsbCBiZSBwYXNzZWQgYSByb3V0ZSBkZWZpbml0aW9uLCBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllcy4gVGhpcyBtZXRob2QgaXMgZXhwZWN0ZWQgdG8gcmVnaXN0ZXIgYSByb3V0ZSBpbiB5b3VyIEhUVFAgZnJhbWV3b3JrJiMzOTtzIHJvdXRlci48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gaXMgdGhlIHJvdXRlIHRoYXQgeW91IHNldCBhcyA8Y29kZT5kZWZpbml0aW9uLnJvdXRlPC9jb2RlPjwvbGk+XFxuPGxpPjxjb2RlPmFjdGlvbjwvY29kZT4gaXMgdGhlIGFjdGlvbiBhcyBwYXNzZWQgdG8gdGhlIHJvdXRlIGRlZmluaXRpb248L2xpPlxcbjxsaT48Y29kZT5hY3Rpb25GbjwvY29kZT4gd2lsbCBiZSB0aGUgY29udHJvbGxlciBmb3IgdGhpcyBhY3Rpb24gbWV0aG9kPC9saT5cXG48bGk+PGNvZGU+bWlkZGxld2FyZTwvY29kZT4gd2lsbCBiZSBhbiBhcnJheSBvZiBtZXRob2RzIHRvIGJlIGV4ZWN1dGVkIGJlZm9yZSA8Y29kZT5hY3Rpb25GbjwvY29kZT48L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLXJlbmRlci1hY3Rpb24tdmlld21vZGVsLXJlcS1yZXMtbmV4dC1cXFwiPjxjb2RlPnRhdW51cy5yZW5kZXIoYWN0aW9uLCB2aWV3TW9kZWwsIHJlcSwgcmVzLCBuZXh0KTwvY29kZT48L2gyPlxcbjxwPlRoaXMgbWV0aG9kIGlzIGFsbW9zdCBhbiBpbXBsZW1lbnRhdGlvbiBkZXRhaWwgYXMgeW91IHNob3VsZCBiZSB1c2luZyBUYXVudXMgdGhyb3VnaCBvbmUgb2YgdGhlIHBsdWdpbnMgYW55d2F5cywgc28gd2Ugd29uJiMzOTt0IGdvIHZlcnkgZGVlcCBpbnRvIGl0LjwvcD5cXG48cD5UaGUgcmVuZGVyIG1ldGhvZCBpcyB3aGF0IFRhdW51cyB1c2VzIHRvIHJlbmRlciB2aWV3cyBieSBjb25zdHJ1Y3RpbmcgSFRNTCwgSlNPTiwgb3IgcGxhaW50ZXh0IHJlc3BvbnNlcy4gVGhlIDxjb2RlPmFjdGlvbjwvY29kZT4gcHJvcGVydHkgZGV0ZXJtaW5lcyB0aGUgZGVmYXVsdCB2aWV3IHRoYXQgd2lsbCBiZSByZW5kZXJlZC4gVGhlIDxjb2RlPnZpZXdNb2RlbDwvY29kZT4gd2lsbCBiZSBleHRlbmRlZCBieSA8YSBocmVmPVxcXCIjLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC1cXFwiPnRoZSBkZWZhdWx0IHZpZXcgbW9kZWw8L2E+LCBhbmQgaXQgbWF5IGFsc28gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgPGNvZGU+YWN0aW9uPC9jb2RlPiBieSBzZXR0aW5nIDxjb2RlPnZpZXdNb2RlbC5tb2RlbC5hY3Rpb248L2NvZGU+LjwvcD5cXG48cD5UaGUgPGNvZGU+cmVxPC9jb2RlPiwgPGNvZGU+cmVzPC9jb2RlPiwgYW5kIDxjb2RlPm5leHQ8L2NvZGU+IGFyZ3VtZW50cyBhcmUgZXhwZWN0ZWQgdG8gYmUgdGhlIEV4cHJlc3Mgcm91dGluZyBhcmd1bWVudHMsIGJ1dCB0aGV5IGNhbiBhbHNvIGJlIG1vY2tlZCA8ZW0+KHdoaWNoIGlzIGluIGZhY3Qgd2hhdCB0aGUgSGFwaSBwbHVnaW4gZG9lcyk8L2VtPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLXJlYnVpbGRkZWZhdWx0dmlld21vZGVsLWRvbmUtXFxcIj48Y29kZT50YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWwoZG9uZT8pPC9jb2RlPjwvaDI+XFxuPHA+T25jZSBUYXVudXMgaGFzIGJlZW4gbW91bnRlZCwgY2FsbGluZyB0aGlzIG1ldGhvZCB3aWxsIHJlYnVpbGQgdGhlIHZpZXcgbW9kZWwgZGVmYXVsdHMgdXNpbmcgdGhlIDxjb2RlPmdldERlZmF1bHRWaWV3TW9kZWw8L2NvZGU+IHRoYXQgd2FzIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGluIHRoZSBvcHRpb25zLiBBbiBvcHRpb25hbCA8Y29kZT5kb25lPC9jb2RlPiBjYWxsYmFjayB3aWxsIGJlIGludm9rZWQgd2hlbiB0aGUgbW9kZWwgaXMgcmVidWlsdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5IVFRQIEZyYW1ld29yayBQbHVnaW5zPC9oMT5cXG48cD5UaGVyZSYjMzk7cyBjdXJyZW50bHkgdHdvIGRpZmZlcmVudCBIVFRQIGZyYW1ld29ya3MgPGVtPig8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPik8L2VtPiB0aGF0IHlvdSBjYW4gcmVhZGlseSB1c2Ugd2l0aCBUYXVudXMgd2l0aG91dCBoYXZpbmcgdG8gZGVhbCB3aXRoIGFueSBvZiB0aGUgcm91dGUgcGx1bWJpbmcgeW91cnNlbGYuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwidXNpbmctdGF1bnVzLWV4cHJlc3MtXFxcIj5Vc2luZyA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT48L2gyPlxcbjxwPlRoZSA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT4gcGx1Z2luIGlzIHByb2JhYmx5IHRoZSBlYXNpZXN0IHRvIHVzZSwgYXMgVGF1bnVzIHdhcyBvcmlnaW5hbGx5IGRldmVsb3BlZCB3aXRoIGp1c3QgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGluIG1pbmQuIEluIGFkZGl0aW9uIHRvIHRoZSBvcHRpb25zIGFscmVhZHkgb3V0bGluZWQgZm9yIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj50YXVudXMubW91bnQ8L2E+LCB5b3UgY2FuIGFkZCBtaWRkbGV3YXJlIGZvciBhbnkgcm91dGUgaW5kaXZpZHVhbGx5LjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPm1pZGRsZXdhcmU8L2NvZGU+IGFyZSBhbnkgbWV0aG9kcyB5b3Ugd2FudCBUYXVudXMgdG8gZXhlY3V0ZSBhcyBtaWRkbGV3YXJlIGluIEV4cHJlc3MgYXBwbGljYXRpb25zPC9saT5cXG48L3VsPlxcbjxwPlRvIGdldCA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT4gZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBwcm92aWRlZCB0aGF0IHlvdSBjb21lIHVwIHdpdGggYW4gPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICAvLyAuLi5cXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gbWV0aG9kIHdpbGwgbWVyZWx5IHNldCB1cCBUYXVudXMgYW5kIGFkZCB0aGUgcmVsZXZhbnQgcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBhcHBsaWNhdGlvbiBieSBjYWxsaW5nIDxjb2RlPmFwcC5nZXQ8L2NvZGU+IGEgYnVuY2ggb2YgdGltZXMuIFlvdSBjYW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+ZmluZCB0YXVudXMtZXhwcmVzcyBvbiBHaXRIdWI8L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcInVzaW5nLXRhdW51cy1oYXBpLVxcXCI+VXNpbmcgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+PC9oMj5cXG48cD5UaGUgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+IHBsdWdpbiBpcyBhIGJpdCBtb3JlIGludm9sdmVkLCBhbmQgeW91JiMzOTtsbCBoYXZlIHRvIGNyZWF0ZSBhIFBhY2sgaW4gb3JkZXIgdG8gdXNlIGl0LiBJbiBhZGRpdGlvbiB0byA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+dGhlIG9wdGlvbnMgd2UmIzM5O3ZlIGFscmVhZHkgY292ZXJlZDwvYT4sIHlvdSBjYW4gYWRkIDxjb2RlPmNvbmZpZzwvY29kZT4gb24gYW55IHJvdXRlLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmNvbmZpZzwvY29kZT4gaXMgcGFzc2VkIGRpcmVjdGx5IGludG8gdGhlIHJvdXRlIHJlZ2lzdGVyZWQgd2l0aCBIYXBpLCBnaXZpbmcgeW91IHRoZSBtb3N0IGZsZXhpYmlsaXR5PC9saT5cXG48L3VsPlxcbjxwPlRvIGdldCA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4gZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBhbmQgeW91IGNhbiBicmluZyB5b3VyIG93biA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciBIYXBpID0gcmVxdWlyZSgmIzM5O2hhcGkmIzM5Oyk7XFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0hhcGkgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWhhcGkmIzM5OykodGF1bnVzKTtcXG52YXIgcGFjayA9IG5ldyBIYXBpLlBhY2soKTtcXG5cXG5wYWNrLnJlZ2lzdGVyKHtcXG4gIHBsdWdpbjogdGF1bnVzSGFwaSxcXG4gIG9wdGlvbnM6IHtcXG4gICAgLy8gLi4uXFxuICB9XFxufSk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT50YXVudXNIYXBpPC9jb2RlPiBwbHVnaW4gd2lsbCBtb3VudCBUYXVudXMgYW5kIHJlZ2lzdGVyIGFsbCBvZiB0aGUgbmVjZXNzYXJ5IHJvdXRlcy4gWW91IGNhbiA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxcIj5maW5kIHRhdW51cy1oYXBpIG9uIEdpdEh1YjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiY29tbWFuZC1saW5lLWludGVyZmFjZVxcXCI+Q29tbWFuZC1MaW5lIEludGVyZmFjZTwvaDE+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldCB1cCB0aGUgc2VydmVyLXNpZGUgdG8gcmVuZGVyIHlvdXIgdmlld3MgdXNpbmcgVGF1bnVzLCBpdCYjMzk7cyBvbmx5IGxvZ2ljYWwgdGhhdCB5b3UmIzM5O2xsIHdhbnQgdG8gcmVuZGVyIHRoZSB2aWV3cyBpbiB0aGUgY2xpZW50LXNpZGUgYXMgd2VsbCwgZWZmZWN0aXZlbHkgY29udmVydGluZyB5b3VyIGFwcGxpY2F0aW9uIGludG8gYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbiBhZnRlciB0aGUgZmlyc3QgdmlldyBoYXMgYmVlbiByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuPC9wPlxcbjxwPlRoZSBUYXVudXMgQ0xJIGlzIGFuIHVzZWZ1bCBpbnRlcm1lZGlhcnkgaW4gdGhlIHByb2Nlc3Mgb2YgZ2V0dGluZyB0aGUgY29uZmlndXJhdGlvbiB5b3Ugd3JvdGUgc28gZmFyIGZvciB0aGUgc2VydmVyLXNpZGUgdG8gYWxzbyB3b3JrIHdlbGwgaW4gdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5JbnN0YWxsIGl0IGdsb2JhbGx5IGZvciBkZXZlbG9wbWVudCwgYnV0IHJlbWVtYmVyIHRvIHVzZSBsb2NhbCBjb3BpZXMgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgdXNlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgLWcgdGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPldoZW4gaW52b2tlZCB3aXRob3V0IGFueSBhcmd1bWVudHMsIHRoZSBDTEkgd2lsbCBzaW1wbHkgZm9sbG93IHRoZSBkZWZhdWx0IGNvbnZlbnRpb25zIHRvIGZpbmQgeW91ciByb3V0ZSBkZWZpbml0aW9ucywgdmlld3MsIGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVycy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IGRlZmF1bHQsIHRoZSBvdXRwdXQgd2lsbCBiZSBwcmludGVkIHRvIHRoZSBzdGFuZGFyZCBvdXRwdXQsIG1ha2luZyBmb3IgYSBmYXN0IGRlYnVnZ2luZyBleHBlcmllbmNlLiBIZXJlJiMzOTtzIHRoZSBvdXRwdXQgaWYgeW91IGp1c3QgaGFkIGEgc2luZ2xlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IHJvdXRlLCBhbmQgdGhlIG1hdGNoaW5nIHZpZXcgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZXhpc3RlZC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxuICAmIzM5O2hvbWUvaW5kZXgmIzM5OzogcmVxdWlyZSgmIzM5Oy4uL2NsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzJiMzOTspXFxufTtcXG5cXG52YXIgcm91dGVzID0ge1xcbiAgJiMzOTsvJiMzOTs6IHtcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbn07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+WW91IGNhbiB1c2UgYSBmZXcgb3B0aW9ucyB0byBhbHRlciB0aGUgb3V0Y29tZSBvZiBpbnZva2luZyA8Y29kZT50YXVudXM8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi1vdXRwdXQtXFxcIj48Y29kZT4tLW91dHB1dDwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1vPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+T3V0cHV0IGlzIHdyaXR0ZW4gdG8gYSBmaWxlIGluc3RlYWQgb2YgdG8gc3RhbmRhcmQgb3V0cHV0LiBUaGUgZmlsZSBwYXRoIHVzZWQgd2lsbCBiZSB0aGUgPGNvZGU+Y2xpZW50X3dpcmluZzwvY29kZT4gb3B0aW9uIGluIDxhIGhyZWY9XFxcIiN0aGUtdGF1bnVzcmMtbWFuaWZlc3RcXFwiPjxjb2RlPi50YXVudXNyYzwvY29kZT48L2E+LCB3aGljaCBkZWZhdWx0cyB0byA8Y29kZT4mIzM5Oy5iaW4vd2lyaW5nLmpzJiMzOTs8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi13YXRjaC1cXFwiPjxjb2RlPi0td2F0Y2g8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tdzwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPldoZW5ldmVyIGEgc2VydmVyLXNpZGUgcm91dGUgZGVmaW5pdGlvbiBjaGFuZ2VzLCB0aGUgb3V0cHV0IGlzIHByaW50ZWQgYWdhaW4gdG8gZWl0aGVyIHN0YW5kYXJkIG91dHB1dCBvciBhIGZpbGUsIGRlcGVuZGluZyBvbiB3aGV0aGVyIDxjb2RlPi0tb3V0cHV0PC9jb2RlPiB3YXMgdXNlZC48L3A+XFxuPHA+VGhlIHByb2dyYW0gd29uJiMzOTt0IGV4aXQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRyYW5zZm9ybS1tb2R1bGUtXFxcIj48Y29kZT4tLXRyYW5zZm9ybSAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi10PC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+VGhpcyBmbGFnIGFsbG93cyB5b3UgdG8gdHJhbnNmb3JtIHNlcnZlci1zaWRlIHJvdXRlcyBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgdW5kZXJzdGFuZHMuIEV4cHJlc3Mgcm91dGVzIGFyZSBjb21wbGV0ZWx5IGNvbXBhdGlibGUgd2l0aCB0aGUgY2xpZW50LXNpZGUgcm91dGVyLCBidXQgSGFwaSByb3V0ZXMgbmVlZCB0byBiZSB0cmFuc2Zvcm1lZCB1c2luZyB0aGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxcIj48Y29kZT5oYXBpaWZ5PC9jb2RlPjwvYT4gbW9kdWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCBoYXBpaWZ5XFxudGF1bnVzIC10IGhhcGlpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+VXNpbmcgdGhpcyB0cmFuc2Zvcm0gcmVsaWV2ZXMgeW91IGZyb20gaGF2aW5nIHRvIGRlZmluZSB0aGUgc2FtZSByb3V0ZXMgdHdpY2UgdXNpbmcgc2xpZ2h0bHkgZGlmZmVyZW50IGZvcm1hdHMgdGhhdCBjb252ZXkgdGhlIHNhbWUgbWVhbmluZy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItcmVzb2x2ZXJzLW1vZHVsZS1cXFwiPjxjb2RlPi0tcmVzb2x2ZXJzICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXI8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5TaW1pbGFybHkgdG8gdGhlIDxhIGhyZWY9XFxcIiMtb3B0aW9ucy1yZXNvbHZlcnMtXFxcIj48Y29kZT5yZXNvbHZlcnM8L2NvZGU+PC9hPiBvcHRpb24gdGhhdCB5b3UgY2FuIHBhc3MgdG8gPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudDwvY29kZT48L2E+LCB0aGVzZSByZXNvbHZlcnMgY2FuIGNoYW5nZSB0aGUgd2F5IGluIHdoaWNoIGZpbGUgcGF0aHMgYXJlIHJlc29sdmVkLjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+U2lnbmF0dXJlPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRDbGllbnRDb250cm9sbGVyKGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gY2xpZW50LXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRWaWV3KGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXN0YW5kYWxvbmUtXFxcIj48Y29kZT4tLXN0YW5kYWxvbmU8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tczwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPlVuZGVyIHRoaXMgZXhwZXJpbWVudGFsIGZsYWcsIHRoZSBDTEkgd2lsbCB1c2UgQnJvd3NlcmlmeSB0byBjb21waWxlIGEgc3RhbmRhbG9uZSBtb2R1bGUgdGhhdCBpbmNsdWRlcyB0aGUgd2lyaW5nIG5vcm1hbGx5IGV4cG9ydGVkIGJ5IHRoZSBDTEkgcGx1cyBhbGwgb2YgVGF1bnVzIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS91bWRqcy91bWRcXFwiPmFzIGEgVU1EIG1vZHVsZTwvYT4uPC9wPlxcbjxwPlRoaXMgd291bGQgYWxsb3cgeW91IHRvIHVzZSBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIGV2ZW4gaWYgeW91IGRvbiYjMzk7dCB3YW50IHRvIHVzZSA8YSBocmVmPVxcXCJodHRwOi8vYnJvd3NlcmlmeS5vcmdcXFwiPkJyb3dzZXJpZnk8L2E+IGRpcmVjdGx5LjwvcD5cXG48cD5GZWVkYmFjayBhbmQgc3VnZ2VzdGlvbnMgYWJvdXQgdGhpcyBmbGFnLCA8ZW0+YW5kIHBvc3NpYmxlIGFsdGVybmF0aXZlcyB0aGF0IHdvdWxkIG1ha2UgVGF1bnVzIGVhc2llciB0byB1c2U8L2VtPiwgYXJlIHdlbGNvbWUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiY2xpZW50LXNpZGUtYXBpXFxcIj5DbGllbnQtc2lkZSBBUEk8L2gxPlxcbjxwPkp1c3QgbGlrZSB0aGUgc2VydmVyLXNpZGUsIGV2ZXJ5dGhpbmcgaW4gdGhlIGNsaWVudC1zaWRlIGJlZ2lucyBhdCB0aGUgbW91bnRwb2ludC4gT25jZSB0aGUgYXBwbGljYXRpb24gaXMgbW91bnRlZCwgYW5jaG9yIGxpbmtzIHdpbGwgYmUgaGlqYWNrZWQgYW5kIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgd2lsbCB0YWtlIG92ZXIgdmlldyByZW5kZXJpbmcuIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleGVjdXRlZCB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcsIG9wdGlvbnM/KTwvY29kZT48L2gyPlxcbjxwPlRoZSBtb3VudHBvaW50IHRha2VzIGEgcm9vdCBjb250YWluZXIsIHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgYW4gb3B0aW9ucyBwYXJhbWV0ZXIuIFRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+IGlzIHdoZXJlIGNsaWVudC1zaWRlLXJlbmRlcmVkIHZpZXdzIHdpbGwgYmUgcGxhY2VkLCBieSByZXBsYWNpbmcgd2hhdGV2ZXIgSFRNTCBjb250ZW50cyBhbHJlYWR5IGV4aXN0LiBZb3UgY2FuIHBhc3MgaW4gdGhlIDxjb2RlPndpcmluZzwvY29kZT4gbW9kdWxlIGV4YWN0bHkgYXMgYnVpbHQgYnkgdGhlIENMSSwgYW5kIG5vIGZ1cnRoZXIgY29uZmlndXJhdGlvbiBpcyBuZWNlc3NhcnkuPC9wPlxcbjxwPldoZW4gdGhlIG1vdW50cG9pbnQgZXhlY3V0ZXMsIFRhdW51cyB3aWxsIGNvbmZpZ3VyZSBpdHMgaW50ZXJuYWwgc3RhdGUsIDxlbT5zZXQgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvZW0+LCBydW4gdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3LCBhbmQgc3RhcnQgaGlqYWNraW5nIGxpbmtzLjwvcD5cXG48cD5BcyBhbiBleGFtcGxlLCBjb25zaWRlciBhIGJyb3dzZXIgbWFrZXMgYSA8Y29kZT5HRVQ8L2NvZGU+IHJlcXVlc3QgZm9yIDxjb2RlPi9hcnRpY2xlcy90aGUtZm94PC9jb2RlPiBmb3IgdGhlIGZpcnN0IHRpbWUuIE9uY2UgPGNvZGU+dGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nKTwvY29kZT4gaXMgaW52b2tlZCBvbiB0aGUgY2xpZW50LXNpZGUsIHNldmVyYWwgdGhpbmdzIHdvdWxkIGhhcHBlbiBpbiB0aGUgb3JkZXIgbGlzdGVkIGJlbG93LjwvcD5cXG48dWw+XFxuPGxpPlRhdW51cyBzZXRzIHVwIHRoZSBjbGllbnQtc2lkZSB2aWV3IHJvdXRpbmcgZW5naW5lPC9saT5cXG48bGk+SWYgZW5hYmxlZCA8ZW0+KHZpYSA8Y29kZT5vcHRpb25zPC9jb2RlPik8L2VtPiwgdGhlIGNhY2hpbmcgZW5naW5lIGlzIGNvbmZpZ3VyZWQ8L2xpPlxcbjxsaT5UYXVudXMgb2J0YWlucyB0aGUgdmlldyBtb2RlbCA8ZW0+KG1vcmUgb24gdGhpcyBsYXRlcik8L2VtPjwvbGk+XFxuPGxpPldoZW4gYSB2aWV3IG1vZGVsIGlzIG9idGFpbmVkLCB0aGUgPGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPiBldmVudCBpcyBlbWl0dGVkPC9saT5cXG48bGk+QW5jaG9yIGxpbmtzIHN0YXJ0IGJlaW5nIG1vbml0b3JlZCBmb3IgY2xpY2tzIDxlbT4oYXQgdGhpcyBwb2ludCB5b3VyIGFwcGxpY2F0aW9uIGJlY29tZXMgYSA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NpbmdsZS1wYWdlX2FwcGxpY2F0aW9uXFxcIj5TUEE8L2E+KTwvZW0+PC9saT5cXG48bGk+VGhlIDxjb2RlPmFydGljbGVzL2FydGljbGU8L2NvZGU+IGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgZXhlY3V0ZWQ8L2xpPlxcbjwvdWw+XFxuPHA+VGhhdCYjMzk7cyBxdWl0ZSBhIGJpdCBvZiBmdW5jdGlvbmFsaXR5LCBidXQgaWYgeW91IHRoaW5rIGFib3V0IGl0LCBtb3N0IG90aGVyIGZyYW1ld29ya3MgYWxzbyByZW5kZXIgdGhlIHZpZXcgYXQgdGhpcyBwb2ludCwgPGVtPnJhdGhlciB0aGFuIG9uIHRoZSBzZXJ2ZXItc2lkZSE8L2VtPjwvcD5cXG48cD5JbiBvcmRlciB0byBiZXR0ZXIgdW5kZXJzdGFuZCB0aGUgcHJvY2VzcywgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgPGNvZGU+b3B0aW9uczwvY29kZT4gcGFyYW1ldGVyLjwvcD5cXG48cD5GaXJzdCBvZmYsIHRoZSA8Y29kZT5ib290c3RyYXA8L2NvZGU+IG9wdGlvbiBkZXRlcm1pbmVzIHRoZSBzdHJhdGVneSB1c2VkIHRvIHB1bGwgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZXJlIGFyZSB0aHJlZSBwb3NzaWJsZSBzdHJhdGVnaWVzIGF2YWlsYWJsZTogPGNvZGU+YXV0bzwvY29kZT4gPGVtPih0aGUgZGVmYXVsdCBzdHJhdGVneSk8L2VtPiwgPGNvZGU+aW5saW5lPC9jb2RlPiwgb3IgPGNvZGU+bWFudWFsPC9jb2RlPi4gVGhlIDxjb2RlPmF1dG88L2NvZGU+IHN0cmF0ZWd5IGludm9sdmVzIHRoZSBsZWFzdCB3b3JrLCB3aGljaCBpcyB3aHkgaXQmIzM5O3MgdGhlIGRlZmF1bHQuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+YXV0bzwvY29kZT4gd2lsbCBtYWtlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWw8L2xpPlxcbjxsaT48Y29kZT5pbmxpbmU8L2NvZGU+IGV4cGVjdHMgeW91IHRvIHBsYWNlIHRoZSBtb2RlbCBpbnRvIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZzwvbGk+XFxuPGxpPjxjb2RlPm1hbnVhbDwvY29kZT4gZXhwZWN0cyB5b3UgdG8gZ2V0IHRoZSB2aWV3IG1vZGVsIGhvd2V2ZXIgeW91IHdhbnQgdG8sIGFuZCB0aGVuIGxldCBUYXVudXMga25vdyB3aGVuIGl0JiMzOTtzIHJlYWR5PC9saT5cXG48L3VsPlxcbjxwPkxldCYjMzk7cyBnbyBpbnRvIGRldGFpbCBhYm91dCBlYWNoIG9mIHRoZXNlIHN0cmF0ZWdpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWF1dG8tc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5hdXRvPC9jb2RlPiBzdHJhdGVneTwvaDQ+XFxuPHA+VGhlIDxjb2RlPmF1dG88L2NvZGU+IHN0cmF0ZWd5IG1lYW5zIHRoYXQgVGF1bnVzIHdpbGwgbWFrZSB1c2Ugb2YgYW4gQUpBWCByZXF1ZXN0IHRvIG9idGFpbiB0aGUgdmlldyBtb2RlbC4gPGVtPllvdSBkb24mIzM5O3QgaGF2ZSB0byBkbyBhbnl0aGluZyBlbHNlPC9lbT4gYW5kIHRoaXMgaXMgdGhlIGRlZmF1bHQgc3RyYXRlZ3kuIFRoaXMgaXMgdGhlIDxzdHJvbmc+bW9zdCBjb252ZW5pZW50IHN0cmF0ZWd5LCBidXQgYWxzbyB0aGUgc2xvd2VzdDwvc3Ryb25nPiBvbmUuPC9wPlxcbjxwPkl0JiMzOTtzIHNsb3cgYmVjYXVzZSB0aGUgdmlldyBtb2RlbCB3b24mIzM5O3QgYmUgcmVxdWVzdGVkIHVudGlsIHRoZSBidWxrIG9mIHlvdXIgSmF2YVNjcmlwdCBjb2RlIGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgZXhlY3V0ZWQsIGFuZCA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGludm9rZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWlubGluZS1zdHJhdGVneVxcXCI+VXNpbmcgdGhlIDxjb2RlPmlubGluZTwvY29kZT4gc3RyYXRlZ3k8L2g0PlxcbjxwPlRoZSA8Y29kZT5pbmxpbmU8L2NvZGU+IHN0cmF0ZWd5IGV4cGVjdHMgeW91IHRvIGFkZCBhIDxjb2RlPmRhdGEtdGF1bnVzPC9jb2RlPiBhdHRyaWJ1dGUgb24gdGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4gZWxlbWVudC4gVGhpcyBhdHRyaWJ1dGUgbXVzdCBiZSBlcXVhbCB0byB0aGUgPGNvZGU+aWQ8L2NvZGU+IGF0dHJpYnV0ZSBvZiBhIDxjb2RlPiZsdDtzY3JpcHQmZ3Q7PC9jb2RlPiB0YWcgY29udGFpbmluZyB0aGUgc2VyaWFsaXplZCB2aWV3IG1vZGVsLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWphZGVcXFwiPmRpdihkYXRhLXRhdW51cz0mIzM5O21vZGVsJiMzOTspIT1wYXJ0aWFsXFxuc2NyaXB0KHR5cGU9JiMzOTt0ZXh0L3RhdW51cyYjMzk7LCBkYXRhLXRhdW51cz0mIzM5O21vZGVsJiMzOTspPUpTT04uc3RyaW5naWZ5KG1vZGVsKVxcbjwvY29kZT48L3ByZT5cXG48cD5QYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gdGhlIGZhY3QgdGhhdCB0aGUgbW9kZWwgaXMgbm90IG9ubHkgbWFkZSBpbnRvIGEgSlNPTiBzdHJpbmcsIDxlbT5idXQgYWxzbyBIVE1MIGVuY29kZWQgYnkgSmFkZTwvZW0+LiBXaGVuIFRhdW51cyBleHRyYWN0cyB0aGUgbW9kZWwgZnJvbSB0aGUgPGNvZGU+Jmx0O3NjcmlwdCZndDs8L2NvZGU+IHRhZyBpdCYjMzk7bGwgdW5lc2NhcGUgaXQsIGFuZCB0aGVuIHBhcnNlIGl0IGFzIEpTT04uPC9wPlxcbjxwPlRoaXMgc3RyYXRlZ3kgaXMgYWxzbyBmYWlybHkgY29udmVuaWVudCB0byBzZXQgdXAsIGJ1dCBpdCBpbnZvbHZlcyBhIGxpdHRsZSBtb3JlIHdvcmsuIEl0IG1pZ2h0IGJlIHdvcnRod2hpbGUgdG8gdXNlIGluIGNhc2VzIHdoZXJlIG1vZGVscyBhcmUgc21hbGwsIGJ1dCBpdCB3aWxsIHNsb3cgZG93biBzZXJ2ZXItc2lkZSB2aWV3IHJlbmRlcmluZywgYXMgdGhlIG1vZGVsIGlzIGlubGluZWQgYWxvbmdzaWRlIHRoZSBIVE1MLjwvcD5cXG48cD5UaGF0IG1lYW5zIHRoYXQgdGhlIGNvbnRlbnQgeW91IGFyZSBzdXBwb3NlZCB0byBiZSBwcmlvcml0aXppbmcgaXMgZ29pbmcgdG8gdGFrZSBsb25nZXIgdG8gZ2V0IHRvIHlvdXIgaHVtYW5zLCBidXQgb25jZSB0aGV5IGdldCB0aGUgSFRNTCwgdGhpcyBzdHJhdGVneSB3aWxsIGV4ZWN1dGUgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWxtb3N0IGltbWVkaWF0ZWx5LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5tYW51YWw8L2NvZGU+IHN0cmF0ZWd5PC9oND5cXG48cD5UaGUgPGNvZGU+bWFudWFsPC9jb2RlPiBzdHJhdGVneSBpcyB0aGUgbW9zdCBpbnZvbHZlZCBvZiB0aGUgdGhyZWUsIGJ1dCBhbHNvIHRoZSBtb3N0IHBlcmZvcm1hbnQuIEluIHRoaXMgc3RyYXRlZ3kgeW91JiMzOTtyZSBzdXBwb3NlZCB0byBhZGQgdGhlIGZvbGxvd2luZyA8ZW0+KHNlZW1pbmdseSBwb2ludGxlc3MpPC9lbT4gc25pcHBldCBvZiBjb2RlIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCZndDs8L2NvZGU+IG90aGVyIHRoYW4gdGhlIG9uZSB0aGF0JiMzOTtzIHB1bGxpbmcgZG93biBUYXVudXMsIHNvIHRoYXQgdGhleSBhcmUgcHVsbGVkIGNvbmN1cnJlbnRseSByYXRoZXIgdGhhbiBzZXJpYWxseS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxud2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PbmNlIHlvdSBzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGludm9rZSA8Y29kZT50YXVudXNSZWFkeShtb2RlbCk8L2NvZGU+LiBDb25zaWRlcmluZyB5b3UmIzM5O2xsIGJlIHB1bGxpbmcgYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGF0IHRoZSBzYW1lIHRpbWUsIGEgbnVtYmVyIG9mIGRpZmZlcmVudCBzY2VuYXJpb3MgbWF5IHBsYXkgb3V0LjwvcD5cXG48dWw+XFxuPGxpPlRoZSB2aWV3IG1vZGVsIGlzIGxvYWRlZCBmaXJzdCwgeW91IGNhbGwgPGNvZGU+dGF1bnVzUmVhZHkobW9kZWwpPC9jb2RlPiBhbmQgd2FpdCBmb3IgVGF1bnVzIHRvIHRha2UgdGhlIG1vZGVsIG9iamVjdCBhbmQgYm9vdCB0aGUgYXBwbGljYXRpb24gYXMgc29vbiBhcyA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGV4ZWN1dGVkPC9saT5cXG48bGk+VGF1bnVzIGxvYWRzIGZpcnN0IGFuZCA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGNhbGxlZCBmaXJzdC4gSW4gdGhpcyBjYXNlLCBUYXVudXMgd2lsbCByZXBsYWNlIDxjb2RlPndpbmRvdy50YXVudXNSZWFkeTwvY29kZT4gd2l0aCBhIHNwZWNpYWwgPGNvZGU+Ym9vdDwvY29kZT4gbWV0aG9kLiBXaGVuIHRoZSB2aWV3IG1vZGVsIGZpbmlzaGVzIGxvYWRpbmcsIHlvdSBjYWxsIDxjb2RlPnRhdW51c1JlYWR5KG1vZGVsKTwvY29kZT4gYW5kIHRoZSBhcHBsaWNhdGlvbiBmaW5pc2hlcyBib290aW5nPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHRoaXMgc291bmRzIGEgbGl0dGxlIG1pbmQtYmVuZGluZyBpdCYjMzk7cyBiZWNhdXNlIGl0IGlzLiBJdCYjMzk7cyBub3QgZGVzaWduZWQgdG8gYmUgcHJldHR5LCBidXQgbWVyZWx5IHRvIGJlIHBlcmZvcm1hbnQuPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5Ob3cgdGhhdCB3ZSYjMzk7dmUgYWRkcmVzc2VkIHRoZSBhd2t3YXJkIGJpdHMsIGxldCYjMzk7cyBjb3ZlciB0aGUgPGVtPiZxdW90O3NvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWwmcXVvdDs8L2VtPiBhc3BlY3QuIE15IHByZWZlcnJlZCBtZXRob2QgaXMgdXNpbmcgSlNPTlAsIGFzIGl0JiMzOTtzIGFibGUgdG8gZGVsaXZlciB0aGUgc21hbGxlc3Qgc25pcHBldCBwb3NzaWJsZSwgYW5kIGl0IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBzZXJ2ZXItc2lkZSBjYWNoaW5nLiBDb25zaWRlcmluZyB5b3UmIzM5O2xsIHByb2JhYmx5IHdhbnQgdGhpcyB0byBiZSBhbiBpbmxpbmUgc2NyaXB0LCBrZWVwaW5nIGl0IHNtYWxsIGlzIGltcG9ydGFudC48L3A+XFxuPHA+VGhlIGdvb2QgbmV3cyBpcyB0aGF0IHRoZSBzZXJ2ZXItc2lkZSBzdXBwb3J0cyBKU09OUCBvdXQgdGhlIGJveC4gSGVyZSYjMzk7cyBhIHNuaXBwZXQgb2YgY29kZSB5b3UgY291bGQgdXNlIHRvIHB1bGwgZG93biB0aGUgdmlldyBtb2RlbCBhbmQgYm9vdCBUYXVudXMgdXAgYXMgc29vbiBhcyBib3RoIG9wZXJhdGlvbnMgYXJlIHJlYWR5LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5mdW5jdGlvbiBpbmplY3QgKHVybCkge1xcbiAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJiMzOTtzY3JpcHQmIzM5Oyk7XFxuICBzY3JpcHQuc3JjID0gdXJsO1xcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzY3JpcHQpO1xcbn1cXG5cXG5mdW5jdGlvbiBpbmplY3RvciAoKSB7XFxuICB2YXIgc2VhcmNoID0gbG9jYXRpb24uc2VhcmNoO1xcbiAgdmFyIHNlYXJjaFF1ZXJ5ID0gc2VhcmNoID8gJiMzOTsmYW1wOyYjMzk7ICsgc2VhcmNoLnN1YnN0cigxKSA6ICYjMzk7JiMzOTs7XFxuICB2YXIgc2VhcmNoSnNvbiA9ICYjMzk7P2pzb24mYW1wO2NhbGxiYWNrPXRhdW51c1JlYWR5JiMzOTsgKyBzZWFyY2hRdWVyeTtcXG4gIGluamVjdChsb2NhdGlvbi5wYXRobmFtZSArIHNlYXJjaEpzb24pO1xcbn1cXG5cXG53aW5kb3cudGF1bnVzUmVhZHkgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHdpbmRvdy50YXVudXNSZWFkeSA9IG1vZGVsO1xcbn07XFxuXFxuaW5qZWN0b3IoKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXMgbWVudGlvbmVkIGVhcmxpZXIsIHRoaXMgYXBwcm9hY2ggaW52b2x2ZXMgZ2V0dGluZyB5b3VyIGhhbmRzIGRpcnRpZXIgYnV0IGl0IHBheXMgb2ZmIGJ5IGJlaW5nIHRoZSBmYXN0ZXN0IG9mIHRoZSB0aHJlZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJjYWNoaW5nXFxcIj5DYWNoaW5nPC9oND5cXG48cD5UaGUgY2xpZW50LXNpZGUgaW4gVGF1bnVzIHN1cHBvcnRzIGNhY2hpbmcgaW4tbWVtb3J5IGFuZCB1c2luZyB0aGUgZW1iZWRkZWQgSW5kZXhlZERCIHN5c3RlbSBieSBtZXJlbHkgdHVybmluZyBvbiB0aGUgPGNvZGU+Y2FjaGU8L2NvZGU+IGZsYWcgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gb24gdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5JZiB5b3Ugc2V0IDxjb2RlPmNhY2hlPC9jb2RlPiB0byA8Y29kZT50cnVlPC9jb2RlPiB0aGVuIGNhY2hlZCBpdGVtcyB3aWxsIGJlIGNvbnNpZGVyZWQgPGVtPiZxdW90O2ZyZXNoJnF1b3Q7ICh2YWxpZCBjb3BpZXMgb2YgdGhlIG9yaWdpbmFsKTwvZW0+IGZvciA8c3Ryb25nPjE1IHNlY29uZHM8L3N0cm9uZz4uIFlvdSBjYW4gYWxzbyBzZXQgPGNvZGU+Y2FjaGU8L2NvZGU+IHRvIGEgbnVtYmVyLCBhbmQgdGhhdCBudW1iZXIgb2Ygc2Vjb25kcyB3aWxsIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgaW5zdGVhZC48L3A+XFxuPHA+Q2FjaGluZyBjYW4gYWxzbyBiZSB0d2Vha2VkIG9uIGluZGl2aWR1YWwgcm91dGVzLiBGb3IgaW5zdGFuY2UsIHlvdSBjb3VsZCBzZXQgPGNvZGU+eyBjYWNoZTogdHJ1ZSB9PC9jb2RlPiB3aGVuIG1vdW50aW5nIFRhdW51cyBhbmQgdGhlbiBoYXZlIDxjb2RlPnsgY2FjaGU6IDM2MDAgfTwvY29kZT4gb24gYSByb3V0ZSB0aGF0IHlvdSB3YW50IHRvIGNhY2hlIGZvciBhIGxvbmdlciBwZXJpb2Qgb2YgdGltZS48L3A+XFxuPHA+VGhlIGNhY2hpbmcgbGF5ZXIgaXMgPGVtPnNlYW1sZXNzbHkgaW50ZWdyYXRlZDwvZW0+IGludG8gVGF1bnVzLCBtZWFuaW5nIHRoYXQgYW55IHZpZXdzIHJlbmRlcmVkIGJ5IFRhdW51cyB3aWxsIGJlIGNhY2hlZCBhY2NvcmRpbmcgdG8gdGhlc2UgY2FjaGluZyBydWxlcy4gS2VlcCBpbiBtaW5kLCBob3dldmVyLCB0aGF0IHBlcnNpc3RlbmNlIGF0IHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGxheWVyIHdpbGwgb25seSBiZSBwb3NzaWJsZSBpbiA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5icm93c2VycyB0aGF0IHN1cHBvcnQgSW5kZXhlZERCPC9hPi4gSW4gdGhlIGNhc2Ugb2YgYnJvd3NlcnMgdGhhdCBkb24mIzM5O3Qgc3VwcG9ydCBJbmRleGVkREIsIFRhdW51cyB3aWxsIHVzZSBhbiBpbi1tZW1vcnkgY2FjaGUsIHdoaWNoIHdpbGwgYmUgd2lwZWQgb3V0IHdoZW5ldmVyIHRoZSBodW1hbiBkZWNpZGVzIHRvIGNsb3NlIHRoZSB0YWIgaW4gdGhlaXIgYnJvd3Nlci48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJwcmVmZXRjaGluZ1xcXCI+UHJlZmV0Y2hpbmc8L2g0PlxcbjxwPklmIGNhY2hpbmcgaXMgZW5hYmxlZCwgdGhlIG5leHQgbG9naWNhbCBzdGVwIGlzIHByZWZldGNoaW5nLiBUaGlzIGlzIGVuYWJsZWQganVzdCBieSBhZGRpbmcgPGNvZGU+cHJlZmV0Y2g6IHRydWU8L2NvZGU+IHRvIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBUaGUgcHJlZmV0Y2hpbmcgZmVhdHVyZSB3aWxsIGZpcmUgZm9yIGFueSBhbmNob3IgbGluayB0aGF0JiMzOTtzIHRyaXBzIG92ZXIgYSA8Y29kZT5tb3VzZW92ZXI8L2NvZGU+IG9yIGEgPGNvZGU+dG91Y2hzdGFydDwvY29kZT4gZXZlbnQuIElmIGEgcm91dGUgbWF0Y2hlcyB0aGUgVVJMIGluIHRoZSA8Y29kZT5ocmVmPC9jb2RlPiwgYW4gQUpBWCByZXF1ZXN0IHdpbGwgcHJlZmV0Y2ggdGhlIHZpZXcgYW5kIGNhY2hlIGl0cyBjb250ZW50cywgaW1wcm92aW5nIHBlcmNlaXZlZCBwZXJmb3JtYW5jZS48L3A+XFxuPHA+V2hlbiBsaW5rcyBhcmUgY2xpY2tlZCBiZWZvcmUgcHJlZmV0Y2hpbmcgZmluaXNoZXMsIHRoZXkmIzM5O2xsIHdhaXQgb24gdGhlIHByZWZldGNoZXIgdG8gZmluaXNoIGJlZm9yZSBpbW1lZGlhdGVseSBzd2l0Y2hpbmcgdG8gdGhlIHZpZXcsIGVmZmVjdGl2ZWx5IGN1dHRpbmcgZG93biB0aGUgcmVzcG9uc2UgdGltZS4gSWYgdGhlIGxpbmsgd2FzIGFscmVhZHkgcHJlZmV0Y2hlZCBvciBvdGhlcndpc2UgY2FjaGVkLCB0aGUgdmlldyB3aWxsIGJlIGxvYWRlZCBpbW1lZGlhdGVseS4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGEgbGluayBhbmQgYW5vdGhlciBvbmUgd2FzIGFscmVhZHkgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGF0IG9uZSBpcyBhYm9ydGVkLiBUaGlzIHByZXZlbnRzIHByZWZldGNoaW5nIGZyb20gZHJhaW5pbmcgdGhlIGJhbmR3aWR0aCBvbiBjbGllbnRzIHdpdGggbGltaXRlZCBvciBpbnRlcm1pdHRlbnQgY29ubmVjdGl2aXR5LjwvcD5cXG48aDQgaWQ9XFxcInZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2g0PlxcbjxwPkluIG9yZGVyIHRvIHR1cm4gb24gdGhlIHZlcnNpb25pbmcgQVBJLCBzZXQgdGhlIDxjb2RlPnZlcnNpb248L2NvZGU+IGZpZWxkIGluIHRoZSBvcHRpb25zIHdoZW4gaW52b2tpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiA8c3Ryb25nPm9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUsIHVzaW5nIHRoZSBzYW1lIHZhbHVlPC9zdHJvbmc+LiBUaGUgVGF1bnVzIHZlcnNpb24gc3RyaW5nIHdpbGwgYmUgYWRkZWQgdG8gdGhlIG9uZSB5b3UgcHJvdmlkZWQsIHNvIHRoYXQgVGF1bnVzIHdpbGwga25vdyB0byBzdGF5IGFsZXJ0IGZvciBjaGFuZ2VzIHRvIFRhdW51cyBpdHNlbGYsIGFzIHdlbGwuPC9wPlxcbjxwPlRoZSBkZWZhdWx0IHZlcnNpb24gc3RyaW5nIGlzIHNldCB0byA8Y29kZT4xPC9jb2RlPi4gVGhlIFRhdW51cyB2ZXJzaW9uIHdpbGwgYmUgcHJlcGVuZGVkIHRvIHlvdXJzLCByZXN1bHRpbmcgaW4gYSB2YWx1ZSBzdWNoIGFzIDxjb2RlPnQzLjAuMDt2MTwvY29kZT4gd2hlcmUgVGF1bnVzIGlzIHJ1bm5pbmcgdmVyc2lvbiA8Y29kZT4zLjAuMDwvY29kZT4gYW5kIHlvdXIgYXBwbGljYXRpb24gaXMgcnVubmluZyB2ZXJzaW9uIDxjb2RlPjE8L2NvZGU+LjwvcD5cXG48cD5SZWZlciB0byB0aGUgR2V0dGluZyBTdGFydGVkIGd1aWRlIGZvciBhIG1vcmUgZGV0YWlsZWQgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZCN2ZXJzaW9uaW5nXFxcIj5hbmFseXNpcyBvZiB0aGUgdXNlcyBmb3IgdmVyc2lvbmluZzwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vbi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uKHR5cGUsIGZuKTwvY29kZT48L2gyPlxcbjxwPlRhdW51cyBlbWl0cyBhIHNlcmllcyBvZiBldmVudHMgZHVyaW5nIGl0cyBsaWZlY3ljbGUsIGFuZCA8Y29kZT50YXVudXMub248L2NvZGU+IGlzIHRoZSB3YXkgeW91IGNhbiB0dW5lIGluIGFuZCBsaXN0ZW4gZm9yIHRoZXNlIGV2ZW50cyB1c2luZyBhIHN1YnNjcmlwdGlvbiBmdW5jdGlvbiA8Y29kZT5mbjwvY29kZT4uPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5FdmVudDwvdGg+XFxuPHRoPkFyZ3VtZW50czwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5zdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZG9uZSYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBkYXRhPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5hYm9ydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5lcnJvciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBlcnI8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2UodHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgaXMgZXF1aXZhbGVudCB0byA8YSBocmVmPVxcXCIjLXRhdW51cy1vbi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uPC9jb2RlPjwvYT4sIGV4Y2VwdCB0aGUgZXZlbnQgbGlzdGVuZXJzIHdpbGwgYmUgdXNlZCBvbmNlIGFuZCB0aGVuIGl0JiMzOTtsbCBiZSBkaXNjYXJkZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vZmYtdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vZmYodHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VXNpbmcgdGhpcyBtZXRob2QgeW91IGNhbiByZW1vdmUgYW55IGV2ZW50IGxpc3RlbmVycyB0aGF0IHdlcmUgcHJldmlvdXNseSBhZGRlZCB1c2luZyA8Y29kZT4ub248L2NvZGU+IG9yIDxjb2RlPi5vbmNlPC9jb2RlPi4gWW91IG11c3QgcHJvdmlkZSB0aGUgdHlwZSBvZiBldmVudCB5b3Ugd2FudCB0byByZW1vdmUgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBldmVudCBsaXN0ZW5lciBmdW5jdGlvbiB0aGF0IHdhcyBvcmlnaW5hbGx5IHVzZWQgd2hlbiBjYWxsaW5nIDxjb2RlPi5vbjwvY29kZT4gb3IgPGNvZGU+Lm9uY2U8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtaW50ZXJjZXB0LWFjdGlvbi1mbi1cXFwiPjxjb2RlPnRhdW51cy5pbnRlcmNlcHQoYWN0aW9uPywgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgY2FuIGJlIHVzZWQgdG8gYW50aWNpcGF0ZSBtb2RlbCByZXF1ZXN0cywgYmVmb3JlIHRoZXkgZXZlciBtYWtlIGl0IGludG8gWEhSIHJlcXVlc3RzLiBZb3UgY2FuIGFkZCBpbnRlcmNlcHRvcnMgZm9yIHNwZWNpZmljIGFjdGlvbnMsIHdoaWNoIHdvdWxkIGJlIHRyaWdnZXJlZCBvbmx5IGlmIHRoZSByZXF1ZXN0IG1hdGNoZXMgdGhlIHNwZWNpZmllZCA8Y29kZT5hY3Rpb248L2NvZGU+LiBZb3UgY2FuIGFsc28gYWRkIGdsb2JhbCBpbnRlcmNlcHRvcnMgYnkgb21pdHRpbmcgdGhlIDxjb2RlPmFjdGlvbjwvY29kZT4gcGFyYW1ldGVyLCBvciBzZXR0aW5nIGl0IHRvIDxjb2RlPio8L2NvZGU+LjwvcD5cXG48cD5BbiBpbnRlcmNlcHRvciBmdW5jdGlvbiB3aWxsIHJlY2VpdmUgYW4gPGNvZGU+ZXZlbnQ8L2NvZGU+IHBhcmFtZXRlciwgY29udGFpbmluZyBhIGZldyBkaWZmZXJlbnQgcHJvcGVydGllcy48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT51cmw8L2NvZGU+IGNvbnRhaW5zIHRoZSBVUkwgdGhhdCBuZWVkcyBhIHZpZXcgbW9kZWw8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gY29udGFpbnMgdGhlIGZ1bGwgcm91dGUgb2JqZWN0IGFzIHlvdSYjMzk7ZCBnZXQgZnJvbSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMucm91dGUodXJsKTwvY29kZT48L2E+PC9saT5cXG48bGk+PGNvZGU+cGFydHM8L2NvZGU+IGlzIGp1c3QgYSBzaG9ydGN1dCBmb3IgPGNvZGU+cm91dGUucGFydHM8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+cHJldmVudERlZmF1bHQobW9kZWwpPC9jb2RlPiBhbGxvd3MgeW91IHRvIHN1cHByZXNzIHRoZSBuZWVkIGZvciBhbiBBSkFYIHJlcXVlc3QsIGNvbW1hbmRpbmcgVGF1bnVzIHRvIHVzZSB0aGUgbW9kZWwgeW91JiMzOTt2ZSBwcm92aWRlZCBpbnN0ZWFkPC9saT5cXG48bGk+PGNvZGU+ZGVmYXVsdFByZXZlbnRlZDwvY29kZT4gdGVsbHMgeW91IGlmIHNvbWUgb3RoZXIgaGFuZGxlciBoYXMgcHJldmVudGVkIHRoZSBkZWZhdWx0IGJlaGF2aW9yPC9saT5cXG48bGk+PGNvZGU+Y2FuUHJldmVudERlZmF1bHQ8L2NvZGU+IHRlbGxzIHlvdSBpZiBpbnZva2luZyA8Y29kZT5ldmVudC5wcmV2ZW50RGVmYXVsdDwvY29kZT4gd2lsbCBoYXZlIGFueSBlZmZlY3Q8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gc3RhcnRzIGFzIDxjb2RlPm51bGw8L2NvZGU+LCBhbmQgaXQgY2FuIGxhdGVyIGJlY29tZSB0aGUgbW9kZWwgcGFzc2VkIHRvIDxjb2RlPnByZXZlbnREZWZhdWx0PC9jb2RlPjwvbGk+XFxuPC91bD5cXG48cD5JbnRlcmNlcHRvcnMgYXJlIGFzeW5jaHJvbm91cywgYnV0IGlmIGFuIGludGVyY2VwdG9yIHNwZW5kcyBsb25nZXIgdGhhbiAyMDBtcyBpdCYjMzk7bGwgYmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBjYWxsaW5nIDxjb2RlPmV2ZW50LnByZXZlbnREZWZhdWx0PC9jb2RlPiBwYXN0IHRoYXQgcG9pbnQgd29uJiMzOTt0IGhhdmUgYW55IGVmZmVjdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1cXFwiPjxjb2RlPnRhdW51cy5wYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBwcm92aWRlcyB5b3Ugd2l0aCBhY2Nlc3MgdG8gdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBUYXVudXMuIFlvdSBjYW4gdXNlIGl0IHRvIHJlbmRlciB0aGUgPGNvZGU+YWN0aW9uPC9jb2RlPiB2aWV3IGludG8gdGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4gRE9NIGVsZW1lbnQsIHVzaW5nIHRoZSBzcGVjaWZpZWQgPGNvZGU+bW9kZWw8L2NvZGU+LiBPbmNlIHRoZSB2aWV3IGlzIHJlbmRlcmVkLCB0aGUgPGNvZGU+cmVuZGVyPC9jb2RlPiBldmVudCB3aWxsIGJlIGZpcmVkIDxlbT4od2l0aCA8Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPiBhcyBhcmd1bWVudHMpPC9lbT4gYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGF0IHZpZXcgd2lsbCBiZSBleGVjdXRlZC48L3A+XFxuPHA+V2hpbGUgPGNvZGU+dGF1bnVzLnBhcnRpYWw8L2NvZGU+IHRha2VzIGEgPGNvZGU+cm91dGU8L2NvZGU+IGFzIHRoZSBmb3VydGggcGFyYW1ldGVyLCB5b3Ugc2hvdWxkIG9taXQgdGhhdCBzaW5jZSBpdCYjMzk7cyB1c2VkIGZvciBpbnRlcm5hbCBwdXJwb3NlcyBvbmx5LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbmF2aWdhdGUtdXJsLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubmF2aWdhdGUodXJsLCBvcHRpb25zKTwvY29kZT48L2gyPlxcbjxwPldoZW5ldmVyIHlvdSB3YW50IHRvIG5hdmlnYXRlIHRvIGEgVVJMLCBzYXkgd2hlbiBhbiBBSkFYIGNhbGwgZmluaXNoZXMgYWZ0ZXIgYSBidXR0b24gY2xpY2ssIHlvdSBjYW4gdXNlIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT4gcGFzc2luZyBpdCBhIHBsYWluIFVSTCBvciBhbnl0aGluZyB0aGF0IHdvdWxkIGNhdXNlIDxjb2RlPnRhdW51cy5yb3V0ZSh1cmwpPC9jb2RlPiB0byByZXR1cm4gYSB2YWxpZCByb3V0ZS48L3A+XFxuPHA+QnkgZGVmYXVsdCwgaWYgPGNvZGU+dGF1bnVzLm5hdmlnYXRlKHVybCwgb3B0aW9ucyk8L2NvZGU+IGlzIGNhbGxlZCB3aXRoIGFuIDxjb2RlPnVybDwvY29kZT4gdGhhdCBkb2VzbiYjMzk7dCBtYXRjaCBhbnkgY2xpZW50LXNpZGUgcm91dGUsIHRoZW4gdGhlIHVzZXIgd2lsbCBiZSByZWRpcmVjdGVkIHZpYSA8Y29kZT5sb2NhdGlvbi5ocmVmPC9jb2RlPi4gSW4gY2FzZXMgd2hlcmUgdGhlIGJyb3dzZXIgZG9lc24mIzM5O3Qgc3VwcG9ydCB0aGUgaGlzdG9yeSBBUEksIDxjb2RlPmxvY2F0aW9uLmhyZWY8L2NvZGU+IHdpbGwgYmUgdXNlZCBhcyB3ZWxsLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBvcHRpb25zIHlvdSBjYW4gdXNlIHRvIHR3ZWFrIHRoZSBiZWhhdmlvciBvZiA8Y29kZT50YXVudXMubmF2aWdhdGU8L2NvZGU+LjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+T3B0aW9uPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT5jb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkEgRE9NIGVsZW1lbnQgdGhhdCBjYXVzZWQgdGhlIG5hdmlnYXRpb24gZXZlbnQsIHVzZWQgd2hlbiBlbWl0dGluZyBldmVudHM8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5zdHJpY3Q8L2NvZGU+PC90ZD5cXG48dGQ+SWYgc2V0IHRvIDxjb2RlPnRydWU8L2NvZGU+IGFuZCB0aGUgVVJMIGRvZXNuJiMzOTt0IG1hdGNoIGFueSByb3V0ZSwgdGhlbiB0aGUgbmF2aWdhdGlvbiBhdHRlbXB0IG11c3QgYmUgaWdub3JlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPnNjcm9sbDwvY29kZT48L3RkPlxcbjx0ZD5XaGVuIHRoaXMgaXMgc2V0IHRvIDxjb2RlPmZhbHNlPC9jb2RlPiwgZWxlbWVudHMgYXJlbiYjMzk7dCBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXIgbmF2aWdhdGlvbjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPmZvcmNlPC9jb2RlPjwvdGQ+XFxuPHRkPlVubGVzcyB0aGlzIGlzIHNldCB0byA8Y29kZT50cnVlPC9jb2RlPiwgbmF2aWdhdGlvbiB3b24mIzM5O3QgPGVtPmZldGNoIGEgbW9kZWw8L2VtPiBpZiB0aGUgcm91dGUgbWF0Y2hlcyB0aGUgY3VycmVudCByb3V0ZSwgYW5kIDxjb2RlPnN0YXRlLm1vZGVsPC9jb2RlPiB3aWxsIGJlIHJldXNlZCBpbnN0ZWFkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+cmVwbGFjZVN0YXRlPC9jb2RlPjwvdGQ+XFxuPHRkPlVzZSA8Y29kZT5yZXBsYWNlU3RhdGU8L2NvZGU+IGluc3RlYWQgb2YgPGNvZGU+cHVzaFN0YXRlPC9jb2RlPiB3aGVuIGNoYW5naW5nIGhpc3Rvcnk8L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPk5vdGUgdGhhdCB0aGUgbm90aW9uIG9mIDxlbT5mZXRjaGluZyBhIG1vZGVsPC9lbT4gbWlnaHQgYmUgZGVjZWl2aW5nIGFzIHRoZSBtb2RlbCBjb3VsZCBiZSBwdWxsZWQgZnJvbSB0aGUgY2FjaGUgZXZlbiBpZiA8Y29kZT5mb3JjZTwvY29kZT4gaXMgc2V0IHRvIDxjb2RlPnRydWU8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcm91dGUtdXJsLVxcXCI+PGNvZGU+dGF1bnVzLnJvdXRlKHVybCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIGNvbnZlbmllbmNlIG1ldGhvZCBhbGxvd3MgeW91IHRvIGJyZWFrIGRvd24gYSBVUkwgaW50byBpdHMgaW5kaXZpZHVhbCBjb21wb25lbnRzLiBUaGUgbWV0aG9kIGFjY2VwdHMgYW55IG9mIHRoZSBmb2xsb3dpbmcgcGF0dGVybnMsIGFuZCBpdCByZXR1cm5zIGEgVGF1bnVzIHJvdXRlIG9iamVjdC48L3A+XFxuPHVsPlxcbjxsaT5BIGZ1bGx5IHF1YWxpZmllZCBVUkwgb24gdGhlIHNhbWUgb3JpZ2luLCBlLmcgPGNvZGU+aHR0cDovL3RhdW51cy5iZXZhY3F1YS5pby9hcGk8L2NvZGU+PC9saT5cXG48bGk+QW4gYWJzb2x1dGUgVVJMIHdpdGhvdXQgYW4gb3JpZ2luLCBlLmcgPGNvZGU+L2FwaTwvY29kZT48L2xpPlxcbjxsaT5KdXN0IGEgaGFzaCwgZS5nIDxjb2RlPiNmb288L2NvZGU+IDxlbT4oPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4gaXMgdXNlZCk8L2VtPjwvbGk+XFxuPGxpPkZhbHN5IHZhbHVlcywgZS5nIDxjb2RlPm51bGw8L2NvZGU+IDxlbT4oPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4gaXMgdXNlZCk8L2VtPjwvbGk+XFxuPC91bD5cXG48cD5SZWxhdGl2ZSBVUkxzIGFyZSBub3Qgc3VwcG9ydGVkIDxlbT4oYW55dGhpbmcgdGhhdCBkb2VzbiYjMzk7dCBoYXZlIGEgbGVhZGluZyBzbGFzaCk8L2VtPiwgZS5nIDxjb2RlPmZpbGVzL2RhdGEuanNvbjwvY29kZT4uIEFueXRoaW5nIHRoYXQmIzM5O3Mgbm90IG9uIHRoZSBzYW1lIG9yaWdpbiBvciBkb2VzbiYjMzk7dCBtYXRjaCBvbmUgb2YgdGhlIHJlZ2lzdGVyZWQgcm91dGVzIGlzIGdvaW5nIHRvIHlpZWxkIDxjb2RlPm51bGw8L2NvZGU+LjwvcD5cXG48cD48ZW0+VGhpcyBtZXRob2QgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLCBhcyBpdCBnaXZlcyB5b3UgZGlyZWN0IGFjY2VzcyB0byB0aGUgcm91dGVyIHVzZWQgaW50ZXJuYWxseSBieSBUYXVudXMuPC9lbT48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCItdGF1bnVzLXJvdXRlLWVxdWFscy1yb3V0ZS1yb3V0ZS1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZS5lcXVhbHMocm91dGUsIHJvdXRlKTwvY29kZT48L2gxPlxcbjxwPkNvbXBhcmVzIHR3byByb3V0ZXMgYW5kIHJldHVybnMgPGNvZGU+dHJ1ZTwvY29kZT4gaWYgdGhleSB3b3VsZCBmZXRjaCB0aGUgc2FtZSBtb2RlbC4gTm90ZSB0aGF0IGRpZmZlcmVudCBVUkxzIG1heSBzdGlsbCByZXR1cm4gPGNvZGU+dHJ1ZTwvY29kZT4uIEZvciBpbnN0YW5jZSwgPGNvZGU+L2ZvbzwvY29kZT4gYW5kIDxjb2RlPi9mb28jYmFyPC9jb2RlPiB3b3VsZCBmZXRjaCB0aGUgc2FtZSBtb2RlbCBldmVuIGlmIHRoZXkmIzM5O3JlIGRpZmZlcmVudCBVUkxzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtc3RhdGUtXFxcIj48Y29kZT50YXVudXMuc3RhdGU8L2NvZGU+PC9oMj5cXG48cD5UaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5jb250YWluZXI8L2NvZGU+IGlzIHRoZSBET00gZWxlbWVudCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvbGk+XFxuPGxpPjxjb2RlPmNvbnRyb2xsZXJzPC9jb2RlPiBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPjxjb2RlPnRlbXBsYXRlczwvY29kZT4gYXJlIGFsbCB0aGUgdGVtcGxhdGVzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+PGNvZGU+cm91dGVzPC9jb2RlPiBhcmUgYWxsIHRoZSByb3V0ZXMsIGFzIGRlZmluZWQgaW4gdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gaXMgYSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgcm91dGU8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gaXMgYSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsIHVzZWQgdG8gcmVuZGVyIHRoZSBjdXJyZW50IHZpZXc8L2xpPlxcbjxsaT48Y29kZT5wcmVmZXRjaDwvY29kZT4gZXhwb3NlcyB3aGV0aGVyIHByZWZldGNoaW5nIGlzIHR1cm5lZCBvbjwvbGk+XFxuPGxpPjxjb2RlPmNhY2hlPC9jb2RlPiBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkPC9saT5cXG48L3VsPlxcbjxwPk9mIGNvdXJzZSwgeW91ciBub3Qgc3VwcG9zZWQgdG8gbWVkZGxlIHdpdGggaXQsIHNvIGJlIGEgZ29vZCBjaXRpemVuIGFuZCBqdXN0IGluc3BlY3QgaXRzIHZhbHVlcyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0aGUtdGF1bnVzcmMtbWFuaWZlc3RcXFwiPlRoZSA8Y29kZT4udGF1bnVzcmM8L2NvZGU+IG1hbmlmZXN0PC9oMT5cXG48cD5JZiB5b3Ugd2FudCB0byB1c2UgdmFsdWVzIG90aGVyIHRoYW4gdGhlIGNvbnZlbnRpb25hbCBkZWZhdWx0cyBzaG93biBpbiB0aGUgdGFibGUgYmVsb3csIHRoZW4geW91IHNob3VsZCBjcmVhdGUgYSA8Y29kZT4udGF1bnVzcmM8L2NvZGU+IGZpbGUuIE5vdGUgdGhhdCB0aGUgZGVmYXVsdHMgbmVlZCB0byBiZSBvdmVyd3JpdHRlbiBpbiBhIGNhc2UtYnktY2FzZSBiYXNpcy4gVGhlc2Ugb3B0aW9ucyBjYW4gYWxzbyBiZSBjb25maWd1cmVkIGluIHlvdXIgPGNvZGU+cGFja2FnZS5qc29uPC9jb2RlPiwgdW5kZXIgdGhlIDxjb2RlPnRhdW51czwvY29kZT4gcHJvcGVydHkuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNvblxcXCI+e1xcbiAgJnF1b3Q7dmlld3MmcXVvdDs6ICZxdW90Oy5iaW4vdmlld3MmcXVvdDssXFxuICAmcXVvdDtzZXJ2ZXJfcm91dGVzJnF1b3Q7OiAmcXVvdDtjb250cm9sbGVycy9yb3V0ZXMuanMmcXVvdDssXFxuICAmcXVvdDtzZXJ2ZXJfY29udHJvbGxlcnMmcXVvdDs6ICZxdW90O2NvbnRyb2xsZXJzJnF1b3Q7LFxcbiAgJnF1b3Q7Y2xpZW50X2NvbnRyb2xsZXJzJnF1b3Q7OiAmcXVvdDtjbGllbnQvanMvY29udHJvbGxlcnMmcXVvdDssXFxuICAmcXVvdDtjbGllbnRfd2lyaW5nJnF1b3Q7OiAmcXVvdDsuYmluL3dpcmluZy5qcyZxdW90O1xcbn1cXG48L2NvZGU+PC9wcmU+XFxuPHVsPlxcbjxsaT5UaGUgPGNvZGU+dmlld3M8L2NvZGU+IGRpcmVjdG9yeSBpcyB3aGVyZSB5b3VyIHZpZXdzIDxlbT4oYWxyZWFkeSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQpPC9lbT4gYXJlIHBsYWNlZC4gVGhlc2Ugdmlld3MgYXJlIHVzZWQgZGlyZWN0bHkgb24gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZTwvbGk+XFxuPGxpPlRoZSA8Y29kZT5zZXJ2ZXJfcm91dGVzPC9jb2RlPiBmaWxlIGlzIHRoZSBtb2R1bGUgd2hlcmUgeW91IGV4cG9ydCBhIGNvbGxlY3Rpb24gb2Ygcm91dGVzLiBUaGUgQ0xJIHdpbGwgcHVsbCB0aGVzZSByb3V0ZXMgd2hlbiBjcmVhdGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGVzIGZvciB0aGUgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPlRoZSA8Y29kZT5zZXJ2ZXJfY29udHJvbGxlcnM8L2NvZGU+IGRpcmVjdG9yeSBpcyB0aGUgcm9vdCBkaXJlY3Rvcnkgd2hlcmUgeW91ciBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBsaXZlLiBJdCYjMzk7cyB1c2VkIHdoZW4gc2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGUgcm91dGVyPC9saT5cXG48bGk+VGhlIDxjb2RlPmNsaWVudF9jb250cm9sbGVyczwvY29kZT4gZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgY2xpZW50LXNpZGUgY29udHJvbGxlciBtb2R1bGVzIGxpdmUuIFRoZSBDTEkgd2lsbCA8Y29kZT5yZXF1aXJlPC9jb2RlPiB0aGVzZSBjb250cm9sbGVycyBpbiBpdHMgcmVzdWx0aW5nIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT5UaGUgPGNvZGU+Y2xpZW50X3dpcmluZzwvY29kZT4gZmlsZSBpcyB3aGVyZSB5b3VyIHdpcmluZyBtb2R1bGUgd2lsbCBiZSBwbGFjZWQgYnkgdGhlIENMSS4gWW91JiMzOTtsbCB0aGVuIGhhdmUgdG8gPGNvZGU+cmVxdWlyZTwvY29kZT4gaXQgaW4geW91ciBhcHBsaWNhdGlvbiB3aGVuIGJvb3RpbmcgdXAgVGF1bnVzPC9saT5cXG48L3VsPlxcbjxwPkhlcmUgaXMgd2hlcmUgdGhpbmdzIGdldCA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxcIj5hIGxpdHRsZSBjb252ZW50aW9uYWw8L2E+LiBWaWV3cywgYW5kIGJvdGggc2VydmVyLXNpZGUgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleHBlY3RlZCB0byBiZSBvcmdhbml6ZWQgYnkgZm9sbG93aW5nIHRoZSA8Y29kZT57cm9vdH0ve2NvbnRyb2xsZXJ9L3thY3Rpb259PC9jb2RlPiBwYXR0ZXJuLCBidXQgeW91IGNvdWxkIGNoYW5nZSB0aGF0IHVzaW5nIDxjb2RlPnJlc29sdmVyczwvY29kZT4gd2hlbiBpbnZva2luZyB0aGUgQ0xJIGFuZCB1c2luZyB0aGUgc2VydmVyLXNpZGUgQVBJLjwvcD5cXG48cD5WaWV3cyBhbmQgY29udHJvbGxlcnMgYXJlIGFsc28gZXhwZWN0ZWQgdG8gYmUgQ29tbW9uSlMgbW9kdWxlcyB0aGF0IGV4cG9ydCBhIHNpbmdsZSBtZXRob2QuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgQVBJIERvY3VtZW50YXRpb25cXG5cXG4gICAgSGVyZSdzIHRoZSBBUEkgZG9jdW1lbnRhdGlvbiBmb3IgVGF1bnVzLiBJZiB5b3UndmUgbmV2ZXIgdXNlZCBpdCBiZWZvcmUsIHdlIHJlY29tbWVuZCBnb2luZyBvdmVyIHRoZSBbR2V0dGluZyBTdGFydGVkXVsxXSBndWlkZSBiZWZvcmUganVtcGluZyBpbnRvIHRoZSBBUEkgZG9jdW1lbnRhdGlvbi4gVGhhdCB3YXksIHlvdSdsbCBnZXQgYSBiZXR0ZXIgaWRlYSBvZiB3aGF0IHRvIGxvb2sgZm9yIGFuZCBob3cgdG8gcHV0IHRvZ2V0aGVyIHNpbXBsZSBhcHBsaWNhdGlvbnMgdXNpbmcgVGF1bnVzLCBiZWZvcmUgZ29pbmcgdGhyb3VnaCBkb2N1bWVudGF0aW9uIG9uIGV2ZXJ5IHB1YmxpYyBpbnRlcmZhY2UgdG8gVGF1bnVzLlxcblxcbiAgICBUYXVudXMgZXhwb3NlcyBfdGhyZWUgZGlmZmVyZW50IHB1YmxpYyBBUElzXywgYW5kIHRoZXJlJ3MgYWxzbyAqKnBsdWdpbnMgdG8gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXIqKi4gVGhpcyBkb2N1bWVudCBjb3ZlcnMgYWxsIHRocmVlIEFQSXMgZXh0ZW5zaXZlbHkuIElmIHlvdSdyZSBjb25jZXJuZWQgYWJvdXQgdGhlIGlubmVyIHdvcmtpbmdzIG9mIFRhdW51cywgcGxlYXNlIHJlZmVyIHRvIHRoZSBbR2V0dGluZyBTdGFydGVkXVsxXSBndWlkZS4gVGhpcyBkb2N1bWVudCBhaW1zIHRvIG9ubHkgY292ZXIgaG93IHRoZSBwdWJsaWMgaW50ZXJmYWNlIGFmZmVjdHMgYXBwbGljYXRpb24gc3RhdGUsIGJ1dCAqKmRvZXNuJ3QgZGVsdmUgaW50byBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzKiouXFxuXFxuICAgICMgVGFibGUgb2YgQ29udGVudHNcXG5cXG4gICAgLSBBIFtzZXJ2ZXItc2lkZSBBUEldKCNzZXJ2ZXItc2lkZS1hcGkpIHRoYXQgZGVhbHMgd2l0aCBzZXJ2ZXItc2lkZSByZW5kZXJpbmdcXG4gICAgICAtIFRoZSBbYHRhdW51cy5tb3VudGBdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSBtZXRob2RcXG4gICAgICAgIC0gSXRzIFtgb3B0aW9uc2BdKCN0aGUtb3B0aW9ucy1vYmplY3QpIGFyZ3VtZW50XFxuICAgICAgICAgIC0gW2BsYXlvdXRgXSgjLW9wdGlvbnMtbGF5b3V0LSlcXG4gICAgICAgICAgLSBbYHJvdXRlc2BdKCMtb3B0aW9ucy1yb3V0ZXMtKVxcbiAgICAgICAgICAtIFtgZ2V0RGVmYXVsdFZpZXdNb2RlbGBdKCMtb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLSlcXG4gICAgICAgICAgLSBbYHBsYWludGV4dGBdKCMtb3B0aW9ucy1wbGFpbnRleHQtKVxcbiAgICAgICAgICAtIFtgcmVzb2x2ZXJzYF0oIy1vcHRpb25zLXJlc29sdmVycy0pXFxuICAgICAgICAgIC0gW2B2ZXJzaW9uYF0oIy1vcHRpb25zLXZlcnNpb24tKVxcbiAgICAgICAgLSBJdHMgW2BhZGRSb3V0ZWBdKCMtYWRkcm91dGUtZGVmaW5pdGlvbi0pIGFyZ3VtZW50XFxuICAgICAgLSBUaGUgW2B0YXVudXMucmVuZGVyYF0oIy10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWxgXSgjLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLSkgbWV0aG9kXFxuICAgIC0gQSBbc3VpdGUgb2YgcGx1Z2luc10oI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnMpIGNhbiBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlclxcbiAgICAgIC0gVXNpbmcgW2B0YXVudXMtZXhwcmVzc2BdKCN1c2luZy10YXVudXMtZXhwcmVzcy0pIGZvciBbRXhwcmVzc11bMl1cXG4gICAgICAtIFVzaW5nIFtgdGF1bnVzLWhhcGlgXSgjdXNpbmctdGF1bnVzLWhhcGktKSBmb3IgW0hhcGldWzNdXFxuICAgIC0gQSBbQ0xJIHRoYXQgcHJvZHVjZXMgYSB3aXJpbmcgbW9kdWxlXSgjY29tbWFuZC1saW5lLWludGVyZmFjZSkgZm9yIHRoZSBjbGllbnQtc2lkZVxcbiAgICAgIC0gVGhlIFtgLS1vdXRwdXRgXSgjLW91dHB1dC0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0td2F0Y2hgXSgjLXdhdGNoLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS10cmFuc2Zvcm0gPG1vZHVsZT5gXSgjLXRyYW5zZm9ybS1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXJlc29sdmVycyA8bW9kdWxlPmBdKCMtcmVzb2x2ZXJzLW1vZHVsZS0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0tc3RhbmRhbG9uZWBdKCMtc3RhbmRhbG9uZS0pIGZsYWdcXG4gICAgLSBBIFtjbGllbnQtc2lkZSBBUEldKCNjbGllbnQtc2lkZS1hcGkpIHRoYXQgZGVhbHMgd2l0aCBjbGllbnQtc2lkZSByZW5kZXJpbmdcXG4gICAgICAtIFRoZSBbYHRhdW51cy5tb3VudGBdKCMtdGF1bnVzLW1vdW50LWNvbnRhaW5lci13aXJpbmctb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgICAgLSBVc2luZyB0aGUgW2BhdXRvYF0oI3VzaW5nLXRoZS1hdXRvLXN0cmF0ZWd5KSBzdHJhdGVneVxcbiAgICAgICAgLSBVc2luZyB0aGUgW2BpbmxpbmVgXSgjdXNpbmctdGhlLWlubGluZS1zdHJhdGVneSkgc3RyYXRlZ3lcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgbWFudWFsYF0oI3VzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3kpIHN0cmF0ZWd5XFxuICAgICAgICAtIFtDYWNoaW5nXSgjY2FjaGluZylcXG4gICAgICAgIC0gW1ByZWZldGNoaW5nXSgjcHJlZmV0Y2hpbmcpXFxuICAgICAgICAtIFtWZXJzaW9uaW5nXSgjdmVyc2lvbmluZylcXG4gICAgICAtIFRoZSBbYHRhdW51cy5vbmBdKCMtdGF1bnVzLW9uLXR5cGUtZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5vbmNlYF0oIy10YXVudXMtb25jZS10eXBlLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMub2ZmYF0oIy10YXVudXMtb2ZmLXR5cGUtZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5pbnRlcmNlcHRgXSgjLXRhdW51cy1pbnRlcmNlcHQtYWN0aW9uLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMucGFydGlhbGBdKCMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm5hdmlnYXRlYF0oIy10YXVudXMtbmF2aWdhdGUtdXJsLW9wdGlvbnMtKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5yb3V0ZWBdKCMtdGF1bnVzLXJvdXRlLXVybC0pIG1ldGhvZFxcbiAgICAgICAgLSBUaGUgW2B0YXVudXMucm91dGUuZXF1YWxzYF0oIy10YXVudXMtcm91dGUtZXF1YWxzLXJvdXRlLXJvdXRlLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMuc3RhdGVgXSgjLXRhdW51cy1zdGF0ZS0pIHByb3BlcnR5XFxuICAgIC0gVGhlIFtgLnRhdW51c3JjYF0oI3RoZS10YXVudXNyYy1tYW5pZmVzdCkgbWFuaWZlc3RcXG5cXG4gICAgIyBTZXJ2ZXItc2lkZSBBUElcXG5cXG4gICAgVGhlIHNlcnZlci1zaWRlIEFQSSBpcyB1c2VkIHRvIHNldCB1cCB0aGUgdmlldyByb3V0ZXIuIEl0IHRoZW4gZ2V0cyBvdXQgb2YgdGhlIHdheSwgYWxsb3dpbmcgdGhlIGNsaWVudC1zaWRlIHRvIGV2ZW50dWFsbHkgdGFrZSBvdmVyIGFuZCBhZGQgYW55IGV4dHJhIHN1Z2FyIG9uIHRvcCwgX2luY2x1ZGluZyBjbGllbnQtc2lkZSByZW5kZXJpbmdfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm1vdW50KGFkZFJvdXRlLCBvcHRpb25zPylgXFxuXFxuICAgIE1vdW50cyBUYXVudXMgb24gdG9wIG9mIGEgc2VydmVyLXNpZGUgcm91dGVyLCBieSByZWdpc3RlcmluZyBlYWNoIHJvdXRlIGluIGBvcHRpb25zLnJvdXRlc2Agd2l0aCB0aGUgYGFkZFJvdXRlYCBtZXRob2QuXFxuXFxuICAgID4gTm90ZSB0aGF0IG1vc3Qgb2YgdGhlIHRpbWUsICoqdGhpcyBtZXRob2Qgc2hvdWxkbid0IGJlIGludm9rZWQgZGlyZWN0bHkqKiwgYnV0IHJhdGhlciB0aHJvdWdoIG9uZSBvZiB0aGUgW0hUVFAgZnJhbWV3b3JrIHBsdWdpbnNdKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSBwcmVzZW50ZWQgYmVsb3cuXFxuXFxuICAgIEhlcmUncyBhbiBpbmNvbXBsZXRlIGV4YW1wbGUgb2YgaG93IHRoaXMgbWV0aG9kIG1heSBiZSB1c2VkLiBJdCBpcyBpbmNvbXBsZXRlIGJlY2F1c2Ugcm91dGUgZGVmaW5pdGlvbnMgaGF2ZSBtb3JlIG9wdGlvbnMgYmV5b25kIHRoZSBgcm91dGVgIGFuZCBgYWN0aW9uYCBwcm9wZXJ0aWVzLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHRhdW51cy5tb3VudChhZGRSb3V0ZSwge1xcbiAgICAgIHJvdXRlczogW3sgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfV1cXG4gICAgfSk7XFxuXFxuICAgIGZ1bmN0aW9uIGFkZFJvdXRlIChkZWZpbml0aW9uKSB7XFxuICAgICAgYXBwLmdldChkZWZpbml0aW9uLnJvdXRlLCBkZWZpbml0aW9uLmFjdGlvbik7XFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIExldCdzIGdvIG92ZXIgdGhlIG9wdGlvbnMgeW91IGNhbiBwYXNzIHRvIGB0YXVudXMubW91bnRgIGZpcnN0LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFRoZSBgb3B0aW9ucz9gIG9iamVjdFxcblxcbiAgICBUaGVyZSdzIGEgZmV3IG9wdGlvbnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIHRoZSBzZXJ2ZXItc2lkZSBtb3VudHBvaW50LiBZb3UncmUgcHJvYmFibHkgZ29pbmcgdG8gYmUgcGFzc2luZyB0aGVzZSB0byB5b3VyIFtIVFRQIGZyYW1ld29yayBwbHVnaW5dKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSwgcmF0aGVyIHRoYW4gdXNpbmcgYHRhdW51cy5tb3VudGAgZGlyZWN0bHkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5sYXlvdXQ/YFxcblxcbiAgICBUaGUgYGxheW91dGAgcHJvcGVydHkgaXMgZXhwZWN0ZWQgdG8gaGF2ZSB0aGUgYGZ1bmN0aW9uKGRhdGEpYCBzaWduYXR1cmUuIEl0J2xsIGJlIGludm9rZWQgd2hlbmV2ZXIgYSBmdWxsIEhUTUwgZG9jdW1lbnQgbmVlZHMgdG8gYmUgcmVuZGVyZWQsIGFuZCBhIGBkYXRhYCBvYmplY3Qgd2lsbCBiZSBwYXNzZWQgdG8gaXQuIFRoYXQgb2JqZWN0IHdpbGwgY29udGFpbiBldmVyeXRoaW5nIHlvdSd2ZSBzZXQgYXMgdGhlIHZpZXcgbW9kZWwsIHBsdXMgYSBgcGFydGlhbGAgcHJvcGVydHkgY29udGFpbmluZyB0aGUgcmF3IEhUTUwgb2YgdGhlIHJlbmRlcmVkIHBhcnRpYWwgdmlldy4gWW91ciBgbGF5b3V0YCBtZXRob2Qgd2lsbCB0eXBpY2FsbHkgd3JhcCB0aGUgcmF3IEhUTUwgZm9yIHRoZSBwYXJ0aWFsIHdpdGggdGhlIGJhcmUgYm9uZXMgb2YgYW4gSFRNTCBkb2N1bWVudC4gQ2hlY2sgb3V0IFt0aGUgYGxheW91dC5qYWRlYCB1c2VkIGluIFBvbnkgRm9vXVs0XSBhcyBhbiBleGFtcGxlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucm91dGVzYFxcblxcbiAgICBUaGUgb3RoZXIgYmlnIG9wdGlvbiBpcyBgcm91dGVzYCwgd2hpY2ggZXhwZWN0cyBhIGNvbGxlY3Rpb24gb2Ygcm91dGUgZGVmaW5pdGlvbnMuIFJvdXRlIGRlZmluaXRpb25zIHVzZSBhIG51bWJlciBvZiBwcm9wZXJ0aWVzIHRvIGRldGVybWluZSBob3cgdGhlIHJvdXRlIGlzIGdvaW5nIHRvIGJlaGF2ZS5cXG5cXG4gICAgSGVyZSdzIGFuIGV4YW1wbGUgcm91dGUgdGhhdCB1c2VzIHRoZSBbRXhwcmVzc11bMl0gcm91dGluZyBzY2hlbWUuXFxuXFxuICAgIGBgYGpzXFxuICAgIHtcXG4gICAgICByb3V0ZTogJy9hcnRpY2xlcy86c2x1ZycsXFxuICAgICAgYWN0aW9uOiAnYXJ0aWNsZXMvYXJ0aWNsZScsXFxuICAgICAgaWdub3JlOiBmYWxzZSxcXG4gICAgICBjYWNoZTogPGluaGVyaXQ+XFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIC0gYHJvdXRlYCBpcyBhIHJvdXRlIGluIHRoZSBmb3JtYXQgeW91ciBIVFRQIGZyYW1ld29yayBvZiBjaG9pY2UgdW5kZXJzdGFuZHNcXG4gICAgLSBgYWN0aW9uYCBpcyB0aGUgbmFtZSBvZiB5b3VyIGNvbnRyb2xsZXIgYWN0aW9uLiBJdCdsbCBiZSB1c2VkIHRvIGZpbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCBzaG91bGQgYmUgdXNlZCB3aXRoIHRoaXMgcm91dGUsIGFuZCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlclxcbiAgICAtIGBjYWNoZWAgY2FuIGJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGJlaGF2aW9yIGluIHRoaXMgYXBwbGljYXRpb24gcGF0aCwgYW5kIGl0J2xsIGRlZmF1bHQgdG8gaW5oZXJpdGluZyBmcm9tIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBfb24gdGhlIGNsaWVudC1zaWRlX1xcbiAgICAtIGBpZ25vcmVgIGlzIHVzZWQgaW4gdGhvc2UgY2FzZXMgd2hlcmUgeW91IHdhbnQgYSBVUkwgdG8gYmUgaWdub3JlZCBieSB0aGUgY2xpZW50LXNpZGUgcm91dGVyIGV2ZW4gaWYgdGhlcmUncyBhIGNhdGNoLWFsbCByb3V0ZSB0aGF0IHdvdWxkIG1hdGNoIHRoYXQgVVJMXFxuXFxuICAgIEFzIGFuIGV4YW1wbGUgb2YgdGhlIGBpZ25vcmVgIHVzZSBjYXNlLCBjb25zaWRlciB0aGUgcm91dGluZyB0YWJsZSBzaG93biBiZWxvdy4gVGhlIGNsaWVudC1zaWRlIHJvdXRlciBkb2Vzbid0IGtub3cgXyhhbmQgY2FuJ3Qga25vdyB1bmxlc3MgeW91IHBvaW50IGl0IG91dClfIHdoYXQgcm91dGVzIGFyZSBzZXJ2ZXItc2lkZSBvbmx5LCBhbmQgaXQncyB1cCB0byB5b3UgdG8gcG9pbnQgdGhvc2Ugb3V0LlxcblxcbiAgICBgYGBqc1xcbiAgICBbXFxuICAgICAgeyByb3V0ZTogJy8nLCBhY3Rpb246ICcvaG9tZS9pbmRleCcgfSxcXG4gICAgICB7IHJvdXRlOiAnL2ZlZWQnLCBpZ25vcmU6IHRydWUgfSxcXG4gICAgICB7IHJvdXRlOiAnLyonLCBhY3Rpb246ICdlcnJvci9ub3QtZm91bmQnIH1cXG4gICAgXVxcbiAgICBgYGBcXG5cXG4gICAgVGhpcyBzdGVwIGlzIG5lY2Vzc2FyeSB3aGVuZXZlciB5b3UgaGF2ZSBhbiBhbmNob3IgbGluayBwb2ludGVkIGF0IHNvbWV0aGluZyBsaWtlIGFuIFJTUyBmZWVkLiBUaGUgYGlnbm9yZWAgcHJvcGVydHkgaXMgZWZmZWN0aXZlbHkgdGVsbGluZyB0aGUgY2xpZW50LXNpZGUgX1xcXCJkb24ndCBoaWphY2sgbGlua3MgY29udGFpbmluZyB0aGlzIFVSTFxcXCJfLlxcblxcbiAgICBQbGVhc2Ugbm90ZSB0aGF0IGV4dGVybmFsIGxpbmtzIGFyZSBuZXZlciBoaWphY2tlZC4gT25seSBzYW1lLW9yaWdpbiBsaW5rcyBjb250YWluaW5nIGEgVVJMIHRoYXQgbWF0Y2hlcyBvbmUgb2YgdGhlIHJvdXRlcyB3aWxsIGJlIGhpamFja2VkIGJ5IFRhdW51cy4gRXh0ZXJuYWwgbGlua3MgZG9uJ3QgbmVlZCB0byBiZSBgaWdub3JlYGQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5nZXREZWZhdWx0Vmlld01vZGVsP2BcXG5cXG4gICAgVGhlIGBnZXREZWZhdWx0Vmlld01vZGVsKGRvbmUpYCBwcm9wZXJ0eSBjYW4gYmUgYSBtZXRob2QgdGhhdCBwdXRzIHRvZ2V0aGVyIHRoZSBiYXNlIHZpZXcgbW9kZWwsIHdoaWNoIHdpbGwgdGhlbiBiZSBleHRlbmRlZCBvbiBhbiBhY3Rpb24tYnktYWN0aW9uIGJhc2lzLiBXaGVuIHlvdSdyZSBkb25lIGNyZWF0aW5nIGEgdmlldyBtb2RlbCwgeW91IGNhbiBpbnZva2UgYGRvbmUobnVsbCwgbW9kZWwpYC4gSWYgYW4gZXJyb3Igb2NjdXJzIHdoaWxlIGJ1aWxkaW5nIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGNhbGwgYGRvbmUoZXJyKWAgaW5zdGVhZC5cXG5cXG4gICAgVGF1bnVzIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgYGRvbmVgIGlzIGludm9rZWQgd2l0aCBhbiBlcnJvciwgc28geW91IG1pZ2h0IHdhbnQgdG8gcHV0IHNhZmVndWFyZHMgaW4gcGxhY2UgYXMgdG8gYXZvaWQgdGhhdCBmcm9tIGhhcHBlbm5pbmcuIFRoZSByZWFzb24gdGhpcyBtZXRob2QgaXMgYXN5bmNocm9ub3VzIGlzIGJlY2F1c2UgeW91IG1heSBuZWVkIGRhdGFiYXNlIGFjY2VzcyBvciBzb21lc3VjaCB3aGVuIHB1dHRpbmcgdG9nZXRoZXIgdGhlIGRlZmF1bHRzLiBUaGUgcmVhc29uIHRoaXMgaXMgYSBtZXRob2QgYW5kIG5vdCBqdXN0IGFuIG9iamVjdCBpcyB0aGF0IHRoZSBkZWZhdWx0cyBtYXkgY2hhbmdlIGR1ZSB0byBodW1hbiBpbnRlcmFjdGlvbiB3aXRoIHRoZSBhcHBsaWNhdGlvbiwgYW5kIGluIHRob3NlIGNhc2VzIFt0aGUgZGVmYXVsdHMgY2FuIGJlIHJlYnVpbHRdKCN0YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwpLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucGxhaW50ZXh0P2BcXG5cXG4gICAgVGhlIGBwbGFpbnRleHRgIG9wdGlvbnMgb2JqZWN0IGlzIHBhc3NlZCBkaXJlY3RseSB0byBbaGdldF1bNV0sIGFuZCBpdCdzIHVzZWQgdG8gW3R3ZWFrIHRoZSBwbGFpbnRleHQgdmVyc2lvbl1bNl0gb2YgeW91ciBzaXRlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucmVzb2x2ZXJzP2BcXG5cXG4gICAgUmVzb2x2ZXJzIGFyZSB1c2VkIHRvIGRldGVybWluZSB0aGUgbG9jYXRpb24gb2Ygc29tZSBvZiB0aGUgZGlmZmVyZW50IHBpZWNlcyBvZiB5b3VyIGFwcGxpY2F0aW9uLiBUeXBpY2FsbHkgeW91IHdvbid0IGhhdmUgdG8gdG91Y2ggdGhlc2UgaW4gdGhlIHNsaWdodGVzdC5cXG5cXG4gICAgU2lnbmF0dXJlICAgICAgICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBnZXRTZXJ2ZXJDb250cm9sbGVyKGFjdGlvbilgIHwgUmV0dXJuIHBhdGggdG8gc2VydmVyLXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGVcXG4gICAgYGdldFZpZXcoYWN0aW9uKWAgICAgICAgICAgICAgfCBSZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZVxcblxcbiAgICBUaGUgYGFkZFJvdXRlYCBtZXRob2QgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgIG9uIHRoZSBzZXJ2ZXItc2lkZSBpcyBtb3N0bHkgZ29pbmcgdG8gYmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBIVFRQIGZyYW1ld29yayBwbHVnaW5zLCBzbyBmZWVsIGZyZWUgdG8gc2tpcCBvdmVyIHRoZSBmb2xsb3dpbmcgc2VjdGlvbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnZlcnNpb24/YFxcblxcbiAgICBSZWZlciB0byB0aGUgW1ZlcnNpb25pbmddKCN2ZXJzaW9uaW5nKSBzZWN0aW9uLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIGBhZGRSb3V0ZShkZWZpbml0aW9uKWBcXG5cXG4gICAgVGhlIGBhZGRSb3V0ZShkZWZpbml0aW9uKWAgbWV0aG9kIHdpbGwgYmUgcGFzc2VkIGEgcm91dGUgZGVmaW5pdGlvbiwgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXMuIFRoaXMgbWV0aG9kIGlzIGV4cGVjdGVkIHRvIHJlZ2lzdGVyIGEgcm91dGUgaW4geW91ciBIVFRQIGZyYW1ld29yaydzIHJvdXRlci5cXG5cXG4gICAgLSBgcm91dGVgIGlzIHRoZSByb3V0ZSB0aGF0IHlvdSBzZXQgYXMgYGRlZmluaXRpb24ucm91dGVgXFxuICAgIC0gYGFjdGlvbmAgaXMgdGhlIGFjdGlvbiBhcyBwYXNzZWQgdG8gdGhlIHJvdXRlIGRlZmluaXRpb25cXG4gICAgLSBgYWN0aW9uRm5gIHdpbGwgYmUgdGhlIGNvbnRyb2xsZXIgZm9yIHRoaXMgYWN0aW9uIG1ldGhvZFxcbiAgICAtIGBtaWRkbGV3YXJlYCB3aWxsIGJlIGFuIGFycmF5IG9mIG1ldGhvZHMgdG8gYmUgZXhlY3V0ZWQgYmVmb3JlIGBhY3Rpb25GbmBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5yZW5kZXIoYWN0aW9uLCB2aWV3TW9kZWwsIHJlcSwgcmVzLCBuZXh0KWBcXG5cXG4gICAgVGhpcyBtZXRob2QgaXMgYWxtb3N0IGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBhcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIFRhdW51cyB0aHJvdWdoIG9uZSBvZiB0aGUgcGx1Z2lucyBhbnl3YXlzLCBzbyB3ZSB3b24ndCBnbyB2ZXJ5IGRlZXAgaW50byBpdC5cXG5cXG4gICAgVGhlIHJlbmRlciBtZXRob2QgaXMgd2hhdCBUYXVudXMgdXNlcyB0byByZW5kZXIgdmlld3MgYnkgY29uc3RydWN0aW5nIEhUTUwsIEpTT04sIG9yIHBsYWludGV4dCByZXNwb25zZXMuIFRoZSBgYWN0aW9uYCBwcm9wZXJ0eSBkZXRlcm1pbmVzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCB3aWxsIGJlIHJlbmRlcmVkLiBUaGUgYHZpZXdNb2RlbGAgd2lsbCBiZSBleHRlbmRlZCBieSBbdGhlIGRlZmF1bHQgdmlldyBtb2RlbF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKSwgYW5kIGl0IG1heSBhbHNvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGBhY3Rpb25gIGJ5IHNldHRpbmcgYHZpZXdNb2RlbC5tb2RlbC5hY3Rpb25gLlxcblxcbiAgICBUaGUgYHJlcWAsIGByZXNgLCBhbmQgYG5leHRgIGFyZ3VtZW50cyBhcmUgZXhwZWN0ZWQgdG8gYmUgdGhlIEV4cHJlc3Mgcm91dGluZyBhcmd1bWVudHMsIGJ1dCB0aGV5IGNhbiBhbHNvIGJlIG1vY2tlZCBfKHdoaWNoIGlzIGluIGZhY3Qgd2hhdCB0aGUgSGFwaSBwbHVnaW4gZG9lcylfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsKGRvbmU/KWBcXG5cXG4gICAgT25jZSBUYXVudXMgaGFzIGJlZW4gbW91bnRlZCwgY2FsbGluZyB0aGlzIG1ldGhvZCB3aWxsIHJlYnVpbGQgdGhlIHZpZXcgbW9kZWwgZGVmYXVsdHMgdXNpbmcgdGhlIGBnZXREZWZhdWx0Vmlld01vZGVsYCB0aGF0IHdhcyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgaW4gdGhlIG9wdGlvbnMuIEFuIG9wdGlvbmFsIGBkb25lYCBjYWxsYmFjayB3aWxsIGJlIGludm9rZWQgd2hlbiB0aGUgbW9kZWwgaXMgcmVidWlsdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBIVFRQIEZyYW1ld29yayBQbHVnaW5zXFxuXFxuICAgIFRoZXJlJ3MgY3VycmVudGx5IHR3byBkaWZmZXJlbnQgSFRUUCBmcmFtZXdvcmtzIF8oW0V4cHJlc3NdWzJdIGFuZCBbSGFwaV1bM10pXyB0aGF0IHlvdSBjYW4gcmVhZGlseSB1c2Ugd2l0aCBUYXVudXMgd2l0aG91dCBoYXZpbmcgdG8gZGVhbCB3aXRoIGFueSBvZiB0aGUgcm91dGUgcGx1bWJpbmcgeW91cnNlbGYuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtZXhwcmVzc2BcXG5cXG4gICAgVGhlIGB0YXVudXMtZXhwcmVzc2AgcGx1Z2luIGlzIHByb2JhYmx5IHRoZSBlYXNpZXN0IHRvIHVzZSwgYXMgVGF1bnVzIHdhcyBvcmlnaW5hbGx5IGRldmVsb3BlZCB3aXRoIGp1c3QgW0V4cHJlc3NdWzJdIGluIG1pbmQuIEluIGFkZGl0aW9uIHRvIHRoZSBvcHRpb25zIGFscmVhZHkgb3V0bGluZWQgZm9yIFt0YXVudXMubW91bnRdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgeW91IGNhbiBhZGQgbWlkZGxld2FyZSBmb3IgYW55IHJvdXRlIGluZGl2aWR1YWxseS5cXG5cXG4gICAgLSBgbWlkZGxld2FyZWAgYXJlIGFueSBtZXRob2RzIHlvdSB3YW50IFRhdW51cyB0byBleGVjdXRlIGFzIG1pZGRsZXdhcmUgaW4gRXhwcmVzcyBhcHBsaWNhdGlvbnNcXG5cXG4gICAgVG8gZ2V0IGB0YXVudXMtZXhwcmVzc2AgZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBwcm92aWRlZCB0aGF0IHlvdSBjb21lIHVwIHdpdGggYW4gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIC8vIC4uLlxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgdGF1bnVzRXhwcmVzc2AgbWV0aG9kIHdpbGwgbWVyZWx5IHNldCB1cCBUYXVudXMgYW5kIGFkZCB0aGUgcmVsZXZhbnQgcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBhcHBsaWNhdGlvbiBieSBjYWxsaW5nIGBhcHAuZ2V0YCBhIGJ1bmNoIG9mIHRpbWVzLiBZb3UgY2FuIFtmaW5kIHRhdW51cy1leHByZXNzIG9uIEdpdEh1Yl1bN10uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtaGFwaWBcXG5cXG4gICAgVGhlIGB0YXVudXMtaGFwaWAgcGx1Z2luIGlzIGEgYml0IG1vcmUgaW52b2x2ZWQsIGFuZCB5b3UnbGwgaGF2ZSB0byBjcmVhdGUgYSBQYWNrIGluIG9yZGVyIHRvIHVzZSBpdC4gSW4gYWRkaXRpb24gdG8gW3RoZSBvcHRpb25zIHdlJ3ZlIGFscmVhZHkgY292ZXJlZF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pLCB5b3UgY2FuIGFkZCBgY29uZmlnYCBvbiBhbnkgcm91dGUuXFxuXFxuICAgIC0gYGNvbmZpZ2AgaXMgcGFzc2VkIGRpcmVjdGx5IGludG8gdGhlIHJvdXRlIHJlZ2lzdGVyZWQgd2l0aCBIYXBpLCBnaXZpbmcgeW91IHRoZSBtb3N0IGZsZXhpYmlsaXR5XFxuXFxuICAgIFRvIGdldCBgdGF1bnVzLWhhcGlgIGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgYW5kIHlvdSBjYW4gYnJpbmcgeW91ciBvd24gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgSGFwaSA9IHJlcXVpcmUoJ2hhcGknKTtcXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzSGFwaSA9IHJlcXVpcmUoJ3RhdW51cy1oYXBpJykodGF1bnVzKTtcXG4gICAgdmFyIHBhY2sgPSBuZXcgSGFwaS5QYWNrKCk7XFxuXFxuICAgIHBhY2sucmVnaXN0ZXIoe1xcbiAgICAgIHBsdWdpbjogdGF1bnVzSGFwaSxcXG4gICAgICBvcHRpb25zOiB7XFxuICAgICAgICAvLyAuLi5cXG4gICAgICB9XFxuICAgIH0pO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGB0YXVudXNIYXBpYCBwbHVnaW4gd2lsbCBtb3VudCBUYXVudXMgYW5kIHJlZ2lzdGVyIGFsbCBvZiB0aGUgbmVjZXNzYXJ5IHJvdXRlcy4gWW91IGNhbiBbZmluZCB0YXVudXMtaGFwaSBvbiBHaXRIdWJdWzhdLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIENvbW1hbmQtTGluZSBJbnRlcmZhY2VcXG5cXG4gICAgT25jZSB5b3UndmUgc2V0IHVwIHRoZSBzZXJ2ZXItc2lkZSB0byByZW5kZXIgeW91ciB2aWV3cyB1c2luZyBUYXVudXMsIGl0J3Mgb25seSBsb2dpY2FsIHRoYXQgeW91J2xsIHdhbnQgdG8gcmVuZGVyIHRoZSB2aWV3cyBpbiB0aGUgY2xpZW50LXNpZGUgYXMgd2VsbCwgZWZmZWN0aXZlbHkgY29udmVydGluZyB5b3VyIGFwcGxpY2F0aW9uIGludG8gYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbiBhZnRlciB0aGUgZmlyc3QgdmlldyBoYXMgYmVlbiByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuXFxuXFxuICAgIFRoZSBUYXVudXMgQ0xJIGlzIGFuIHVzZWZ1bCBpbnRlcm1lZGlhcnkgaW4gdGhlIHByb2Nlc3Mgb2YgZ2V0dGluZyB0aGUgY29uZmlndXJhdGlvbiB5b3Ugd3JvdGUgc28gZmFyIGZvciB0aGUgc2VydmVyLXNpZGUgdG8gYWxzbyB3b3JrIHdlbGwgaW4gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJbnN0YWxsIGl0IGdsb2JhbGx5IGZvciBkZXZlbG9wbWVudCwgYnV0IHJlbWVtYmVyIHRvIHVzZSBsb2NhbCBjb3BpZXMgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgdXNlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLWcgdGF1bnVzXFxuICAgIGBgYFxcblxcbiAgICBXaGVuIGludm9rZWQgd2l0aG91dCBhbnkgYXJndW1lbnRzLCB0aGUgQ0xJIHdpbGwgc2ltcGx5IGZvbGxvdyB0aGUgZGVmYXVsdCBjb252ZW50aW9ucyB0byBmaW5kIHlvdXIgcm91dGUgZGVmaW5pdGlvbnMsIHZpZXdzLCBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgQnkgZGVmYXVsdCwgdGhlIG91dHB1dCB3aWxsIGJlIHByaW50ZWQgdG8gdGhlIHN0YW5kYXJkIG91dHB1dCwgbWFraW5nIGZvciBhIGZhc3QgZGVidWdnaW5nIGV4cGVyaWVuY2UuIEhlcmUncyB0aGUgb3V0cHV0IGlmIHlvdSBqdXN0IGhhZCBhIHNpbmdsZSBgaG9tZS9pbmRleGAgcm91dGUsIGFuZCB0aGUgbWF0Y2hpbmcgdmlldyBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlciBleGlzdGVkLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0ZW1wbGF0ZXMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuL3ZpZXdzL2hvbWUvaW5kZXguanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgY29udHJvbGxlcnMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciByb3V0ZXMgPSB7XFxuICAgICAgJy8nOiB7XFxuICAgICAgICBhY3Rpb246ICdob21lL2luZGV4J1xcbiAgICAgIH1cXG4gICAgfTtcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XFxuICAgICAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICAgICAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgICAgIHJvdXRlczogcm91dGVzXFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBZb3UgY2FuIHVzZSBhIGZldyBvcHRpb25zIHRvIGFsdGVyIHRoZSBvdXRjb21lIG9mIGludm9raW5nIGB0YXVudXNgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS1vdXRwdXRgXFxuXFxuICAgIDxzdWI+dGhlIGAtb2AgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIE91dHB1dCBpcyB3cml0dGVuIHRvIGEgZmlsZSBpbnN0ZWFkIG9mIHRvIHN0YW5kYXJkIG91dHB1dC4gVGhlIGZpbGUgcGF0aCB1c2VkIHdpbGwgYmUgdGhlIGBjbGllbnRfd2lyaW5nYCBvcHRpb24gaW4gW2AudGF1bnVzcmNgXSgjdGhlLXRhdW51c3JjLW1hbmlmZXN0KSwgd2hpY2ggZGVmYXVsdHMgdG8gYCcuYmluL3dpcmluZy5qcydgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS13YXRjaGBcXG5cXG4gICAgPHN1Yj50aGUgYC13YCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgV2hlbmV2ZXIgYSBzZXJ2ZXItc2lkZSByb3V0ZSBkZWZpbml0aW9uIGNoYW5nZXMsIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCBhZ2FpbiB0byBlaXRoZXIgc3RhbmRhcmQgb3V0cHV0IG9yIGEgZmlsZSwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgYC0tb3V0cHV0YCB3YXMgdXNlZC5cXG5cXG4gICAgVGhlIHByb2dyYW0gd29uJ3QgZXhpdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tdHJhbnNmb3JtIDxtb2R1bGU+YFxcblxcbiAgICA8c3ViPnRoZSBgLXRgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBUaGlzIGZsYWcgYWxsb3dzIHlvdSB0byB0cmFuc2Zvcm0gc2VydmVyLXNpZGUgcm91dGVzIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSB1bmRlcnN0YW5kcy4gRXhwcmVzcyByb3V0ZXMgYXJlIGNvbXBsZXRlbHkgY29tcGF0aWJsZSB3aXRoIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIsIGJ1dCBIYXBpIHJvdXRlcyBuZWVkIHRvIGJlIHRyYW5zZm9ybWVkIHVzaW5nIHRoZSBbYGhhcGlpZnlgXVs5XSBtb2R1bGUuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIGhhcGlpZnlcXG4gICAgdGF1bnVzIC10IGhhcGlpZnlcXG4gICAgYGBgXFxuXFxuICAgIFVzaW5nIHRoaXMgdHJhbnNmb3JtIHJlbGlldmVzIHlvdSBmcm9tIGhhdmluZyB0byBkZWZpbmUgdGhlIHNhbWUgcm91dGVzIHR3aWNlIHVzaW5nIHNsaWdodGx5IGRpZmZlcmVudCBmb3JtYXRzIHRoYXQgY29udmV5IHRoZSBzYW1lIG1lYW5pbmcuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXJlc29sdmVycyA8bW9kdWxlPmBcXG5cXG4gICAgPHN1Yj50aGUgYC1yYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgU2ltaWxhcmx5IHRvIHRoZSBbYHJlc29sdmVyc2BdKCMtb3B0aW9ucy1yZXNvbHZlcnMtKSBvcHRpb24gdGhhdCB5b3UgY2FuIHBhc3MgdG8gW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSksIHRoZXNlIHJlc29sdmVycyBjYW4gY2hhbmdlIHRoZSB3YXkgaW4gd2hpY2ggZmlsZSBwYXRocyBhcmUgcmVzb2x2ZWQuXFxuXFxuICAgIFNpZ25hdHVyZSAgICAgICAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgZ2V0Q2xpZW50Q29udHJvbGxlcihhY3Rpb24pYCB8IFJldHVybiBwYXRoIHRvIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlXFxuICAgIGBnZXRWaWV3KGFjdGlvbilgICAgICAgICAgICAgIHwgUmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGVcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tc3RhbmRhbG9uZWBcXG5cXG4gICAgPHN1Yj50aGUgYC1zYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgVW5kZXIgdGhpcyBleHBlcmltZW50YWwgZmxhZywgdGhlIENMSSB3aWxsIHVzZSBCcm93c2VyaWZ5IHRvIGNvbXBpbGUgYSBzdGFuZGFsb25lIG1vZHVsZSB0aGF0IGluY2x1ZGVzIHRoZSB3aXJpbmcgbm9ybWFsbHkgZXhwb3J0ZWQgYnkgdGhlIENMSSBwbHVzIGFsbCBvZiBUYXVudXMgW2FzIGEgVU1EIG1vZHVsZV1bMTBdLlxcblxcbiAgICBUaGlzIHdvdWxkIGFsbG93IHlvdSB0byB1c2UgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSBldmVuIGlmIHlvdSBkb24ndCB3YW50IHRvIHVzZSBbQnJvd3NlcmlmeV1bMTFdIGRpcmVjdGx5LlxcblxcbiAgICBGZWVkYmFjayBhbmQgc3VnZ2VzdGlvbnMgYWJvdXQgdGhpcyBmbGFnLCBfYW5kIHBvc3NpYmxlIGFsdGVybmF0aXZlcyB0aGF0IHdvdWxkIG1ha2UgVGF1bnVzIGVhc2llciB0byB1c2VfLCBhcmUgd2VsY29tZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBDbGllbnQtc2lkZSBBUElcXG5cXG4gICAgSnVzdCBsaWtlIHRoZSBzZXJ2ZXItc2lkZSwgZXZlcnl0aGluZyBpbiB0aGUgY2xpZW50LXNpZGUgYmVnaW5zIGF0IHRoZSBtb3VudHBvaW50LiBPbmNlIHRoZSBhcHBsaWNhdGlvbiBpcyBtb3VudGVkLCBhbmNob3IgbGlua3Mgd2lsbCBiZSBoaWphY2tlZCBhbmQgdGhlIGNsaWVudC1zaWRlIHJvdXRlciB3aWxsIHRha2Ugb3ZlciB2aWV3IHJlbmRlcmluZy4gQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4ZWN1dGVkIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucz8pYFxcblxcbiAgICBUaGUgbW91bnRwb2ludCB0YWtlcyBhIHJvb3QgY29udGFpbmVyLCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGFuIG9wdGlvbnMgcGFyYW1ldGVyLiBUaGUgYGNvbnRhaW5lcmAgaXMgd2hlcmUgY2xpZW50LXNpZGUtcmVuZGVyZWQgdmlld3Mgd2lsbCBiZSBwbGFjZWQsIGJ5IHJlcGxhY2luZyB3aGF0ZXZlciBIVE1MIGNvbnRlbnRzIGFscmVhZHkgZXhpc3QuIFlvdSBjYW4gcGFzcyBpbiB0aGUgYHdpcmluZ2AgbW9kdWxlIGV4YWN0bHkgYXMgYnVpbHQgYnkgdGhlIENMSSwgYW5kIG5vIGZ1cnRoZXIgY29uZmlndXJhdGlvbiBpcyBuZWNlc3NhcnkuXFxuXFxuICAgIFdoZW4gdGhlIG1vdW50cG9pbnQgZXhlY3V0ZXMsIFRhdW51cyB3aWxsIGNvbmZpZ3VyZSBpdHMgaW50ZXJuYWwgc3RhdGUsIF9zZXQgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcl8sIHJ1biB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBmb3IgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcsIGFuZCBzdGFydCBoaWphY2tpbmcgbGlua3MuXFxuXFxuICAgIEFzIGFuIGV4YW1wbGUsIGNvbnNpZGVyIGEgYnJvd3NlciBtYWtlcyBhIGBHRVRgIHJlcXVlc3QgZm9yIGAvYXJ0aWNsZXMvdGhlLWZveGAgZm9yIHRoZSBmaXJzdCB0aW1lLiBPbmNlIGB0YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcpYCBpcyBpbnZva2VkIG9uIHRoZSBjbGllbnQtc2lkZSwgc2V2ZXJhbCB0aGluZ3Mgd291bGQgaGFwcGVuIGluIHRoZSBvcmRlciBsaXN0ZWQgYmVsb3cuXFxuXFxuICAgIC0gVGF1bnVzIHNldHMgdXAgdGhlIGNsaWVudC1zaWRlIHZpZXcgcm91dGluZyBlbmdpbmVcXG4gICAgLSBJZiBlbmFibGVkIF8odmlhIGBvcHRpb25zYClfLCB0aGUgY2FjaGluZyBlbmdpbmUgaXMgY29uZmlndXJlZFxcbiAgICAtIFRhdW51cyBvYnRhaW5zIHRoZSB2aWV3IG1vZGVsIF8obW9yZSBvbiB0aGlzIGxhdGVyKV9cXG4gICAgLSBXaGVuIGEgdmlldyBtb2RlbCBpcyBvYnRhaW5lZCwgdGhlIGAnc3RhcnQnYCBldmVudCBpcyBlbWl0dGVkXFxuICAgIC0gQW5jaG9yIGxpbmtzIHN0YXJ0IGJlaW5nIG1vbml0b3JlZCBmb3IgY2xpY2tzIF8oYXQgdGhpcyBwb2ludCB5b3VyIGFwcGxpY2F0aW9uIGJlY29tZXMgYSBbU1BBXVsxM10pX1xcbiAgICAtIFRoZSBgYXJ0aWNsZXMvYXJ0aWNsZWAgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBleGVjdXRlZFxcblxcbiAgICBUaGF0J3MgcXVpdGUgYSBiaXQgb2YgZnVuY3Rpb25hbGl0eSwgYnV0IGlmIHlvdSB0aGluayBhYm91dCBpdCwgbW9zdCBvdGhlciBmcmFtZXdvcmtzIGFsc28gcmVuZGVyIHRoZSB2aWV3IGF0IHRoaXMgcG9pbnQsIF9yYXRoZXIgdGhhbiBvbiB0aGUgc2VydmVyLXNpZGUhX1xcblxcbiAgICBJbiBvcmRlciB0byBiZXR0ZXIgdW5kZXJzdGFuZCB0aGUgcHJvY2VzcywgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBgb3B0aW9uc2AgcGFyYW1ldGVyLlxcblxcbiAgICBGaXJzdCBvZmYsIHRoZSBgYm9vdHN0cmFwYCBvcHRpb24gZGV0ZXJtaW5lcyB0aGUgc3RyYXRlZ3kgdXNlZCB0byBwdWxsIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3IGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGVyZSBhcmUgdGhyZWUgcG9zc2libGUgc3RyYXRlZ2llcyBhdmFpbGFibGU6IGBhdXRvYCBfKHRoZSBkZWZhdWx0IHN0cmF0ZWd5KV8sIGBpbmxpbmVgLCBvciBgbWFudWFsYC4gVGhlIGBhdXRvYCBzdHJhdGVneSBpbnZvbHZlcyB0aGUgbGVhc3Qgd29yaywgd2hpY2ggaXMgd2h5IGl0J3MgdGhlIGRlZmF1bHQuXFxuXFxuICAgIC0gYGF1dG9gIHdpbGwgbWFrZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsXFxuICAgIC0gYGlubGluZWAgZXhwZWN0cyB5b3UgdG8gcGxhY2UgdGhlIG1vZGVsIGludG8gYSBgPHNjcmlwdCB0eXBlPSd0ZXh0L3RhdW51cyc+YCB0YWdcXG4gICAgLSBgbWFudWFsYCBleHBlY3RzIHlvdSB0byBnZXQgdGhlIHZpZXcgbW9kZWwgaG93ZXZlciB5b3Ugd2FudCB0bywgYW5kIHRoZW4gbGV0IFRhdW51cyBrbm93IHdoZW4gaXQncyByZWFkeVxcblxcbiAgICBMZXQncyBnbyBpbnRvIGRldGFpbCBhYm91dCBlYWNoIG9mIHRoZXNlIHN0cmF0ZWdpZXMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGBhdXRvYCBzdHJhdGVneVxcblxcbiAgICBUaGUgYGF1dG9gIHN0cmF0ZWd5IG1lYW5zIHRoYXQgVGF1bnVzIHdpbGwgbWFrZSB1c2Ugb2YgYW4gQUpBWCByZXF1ZXN0IHRvIG9idGFpbiB0aGUgdmlldyBtb2RlbC4gX1lvdSBkb24ndCBoYXZlIHRvIGRvIGFueXRoaW5nIGVsc2VfIGFuZCB0aGlzIGlzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5LiBUaGlzIGlzIHRoZSAqKm1vc3QgY29udmVuaWVudCBzdHJhdGVneSwgYnV0IGFsc28gdGhlIHNsb3dlc3QqKiBvbmUuXFxuXFxuICAgIEl0J3Mgc2xvdyBiZWNhdXNlIHRoZSB2aWV3IG1vZGVsIHdvbid0IGJlIHJlcXVlc3RlZCB1bnRpbCB0aGUgYnVsayBvZiB5b3VyIEphdmFTY3JpcHQgY29kZSBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGV4ZWN1dGVkLCBhbmQgYHRhdW51cy5tb3VudGAgaXMgaW52b2tlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgYGlubGluZWAgc3RyYXRlZ3lcXG5cXG4gICAgVGhlIGBpbmxpbmVgIHN0cmF0ZWd5IGV4cGVjdHMgeW91IHRvIGFkZCBhIGBkYXRhLXRhdW51c2AgYXR0cmlidXRlIG9uIHRoZSBgY29udGFpbmVyYCBlbGVtZW50LiBUaGlzIGF0dHJpYnV0ZSBtdXN0IGJlIGVxdWFsIHRvIHRoZSBgaWRgIGF0dHJpYnV0ZSBvZiBhIGA8c2NyaXB0PmAgdGFnIGNvbnRhaW5pbmcgdGhlIHNlcmlhbGl6ZWQgdmlldyBtb2RlbC5cXG5cXG4gICAgYGBgamFkZVxcbiAgICBkaXYoZGF0YS10YXVudXM9J21vZGVsJykhPXBhcnRpYWxcXG4gICAgc2NyaXB0KHR5cGU9J3RleHQvdGF1bnVzJywgZGF0YS10YXVudXM9J21vZGVsJyk9SlNPTi5zdHJpbmdpZnkobW9kZWwpXFxuICAgIGBgYFxcblxcbiAgICBQYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gdGhlIGZhY3QgdGhhdCB0aGUgbW9kZWwgaXMgbm90IG9ubHkgbWFkZSBpbnRvIGEgSlNPTiBzdHJpbmcsIF9idXQgYWxzbyBIVE1MIGVuY29kZWQgYnkgSmFkZV8uIFdoZW4gVGF1bnVzIGV4dHJhY3RzIHRoZSBtb2RlbCBmcm9tIHRoZSBgPHNjcmlwdD5gIHRhZyBpdCdsbCB1bmVzY2FwZSBpdCwgYW5kIHRoZW4gcGFyc2UgaXQgYXMgSlNPTi5cXG5cXG4gICAgVGhpcyBzdHJhdGVneSBpcyBhbHNvIGZhaXJseSBjb252ZW5pZW50IHRvIHNldCB1cCwgYnV0IGl0IGludm9sdmVzIGEgbGl0dGxlIG1vcmUgd29yay4gSXQgbWlnaHQgYmUgd29ydGh3aGlsZSB0byB1c2UgaW4gY2FzZXMgd2hlcmUgbW9kZWxzIGFyZSBzbWFsbCwgYnV0IGl0IHdpbGwgc2xvdyBkb3duIHNlcnZlci1zaWRlIHZpZXcgcmVuZGVyaW5nLCBhcyB0aGUgbW9kZWwgaXMgaW5saW5lZCBhbG9uZ3NpZGUgdGhlIEhUTUwuXFxuXFxuICAgIFRoYXQgbWVhbnMgdGhhdCB0aGUgY29udGVudCB5b3UgYXJlIHN1cHBvc2VkIHRvIGJlIHByaW9yaXRpemluZyBpcyBnb2luZyB0byB0YWtlIGxvbmdlciB0byBnZXQgdG8geW91ciBodW1hbnMsIGJ1dCBvbmNlIHRoZXkgZ2V0IHRoZSBIVE1MLCB0aGlzIHN0cmF0ZWd5IHdpbGwgZXhlY3V0ZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBhbG1vc3QgaW1tZWRpYXRlbHkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGBtYW51YWxgIHN0cmF0ZWd5XFxuXFxuICAgIFRoZSBgbWFudWFsYCBzdHJhdGVneSBpcyB0aGUgbW9zdCBpbnZvbHZlZCBvZiB0aGUgdGhyZWUsIGJ1dCBhbHNvIHRoZSBtb3N0IHBlcmZvcm1hbnQuIEluIHRoaXMgc3RyYXRlZ3kgeW91J3JlIHN1cHBvc2VkIHRvIGFkZCB0aGUgZm9sbG93aW5nIF8oc2VlbWluZ2x5IHBvaW50bGVzcylfIHNuaXBwZXQgb2YgY29kZSBpbiBhIGA8c2NyaXB0PmAgb3RoZXIgdGhhbiB0aGUgb25lIHRoYXQncyBwdWxsaW5nIGRvd24gVGF1bnVzLCBzbyB0aGF0IHRoZXkgYXJlIHB1bGxlZCBjb25jdXJyZW50bHkgcmF0aGVyIHRoYW4gc2VyaWFsbHkuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPbmNlIHlvdSBzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGludm9rZSBgdGF1bnVzUmVhZHkobW9kZWwpYC4gQ29uc2lkZXJpbmcgeW91J2xsIGJlIHB1bGxpbmcgYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGF0IHRoZSBzYW1lIHRpbWUsIGEgbnVtYmVyIG9mIGRpZmZlcmVudCBzY2VuYXJpb3MgbWF5IHBsYXkgb3V0LlxcblxcbiAgICAtIFRoZSB2aWV3IG1vZGVsIGlzIGxvYWRlZCBmaXJzdCwgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHdhaXQgZm9yIFRhdW51cyB0byB0YWtlIHRoZSBtb2RlbCBvYmplY3QgYW5kIGJvb3QgdGhlIGFwcGxpY2F0aW9uIGFzIHNvb24gYXMgYHRhdW51cy5tb3VudGAgaXMgZXhlY3V0ZWRcXG4gICAgLSBUYXVudXMgbG9hZHMgZmlyc3QgYW5kIGB0YXVudXMubW91bnRgIGlzIGNhbGxlZCBmaXJzdC4gSW4gdGhpcyBjYXNlLCBUYXVudXMgd2lsbCByZXBsYWNlIGB3aW5kb3cudGF1bnVzUmVhZHlgIHdpdGggYSBzcGVjaWFsIGBib290YCBtZXRob2QuIFdoZW4gdGhlIHZpZXcgbW9kZWwgZmluaXNoZXMgbG9hZGluZywgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHRoZSBhcHBsaWNhdGlvbiBmaW5pc2hlcyBib290aW5nXFxuXFxuICAgID4gSWYgdGhpcyBzb3VuZHMgYSBsaXR0bGUgbWluZC1iZW5kaW5nIGl0J3MgYmVjYXVzZSBpdCBpcy4gSXQncyBub3QgZGVzaWduZWQgdG8gYmUgcHJldHR5LCBidXQgbWVyZWx5IHRvIGJlIHBlcmZvcm1hbnQuXFxuXFxuICAgIE5vdyB0aGF0IHdlJ3ZlIGFkZHJlc3NlZCB0aGUgYXdrd2FyZCBiaXRzLCBsZXQncyBjb3ZlciB0aGUgX1xcXCJzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsXFxcIl8gYXNwZWN0LiBNeSBwcmVmZXJyZWQgbWV0aG9kIGlzIHVzaW5nIEpTT05QLCBhcyBpdCdzIGFibGUgdG8gZGVsaXZlciB0aGUgc21hbGxlc3Qgc25pcHBldCBwb3NzaWJsZSwgYW5kIGl0IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBzZXJ2ZXItc2lkZSBjYWNoaW5nLiBDb25zaWRlcmluZyB5b3UnbGwgcHJvYmFibHkgd2FudCB0aGlzIHRvIGJlIGFuIGlubGluZSBzY3JpcHQsIGtlZXBpbmcgaXQgc21hbGwgaXMgaW1wb3J0YW50LlxcblxcbiAgICBUaGUgZ29vZCBuZXdzIGlzIHRoYXQgdGhlIHNlcnZlci1zaWRlIHN1cHBvcnRzIEpTT05QIG91dCB0aGUgYm94LiBIZXJlJ3MgYSBzbmlwcGV0IG9mIGNvZGUgeW91IGNvdWxkIHVzZSB0byBwdWxsIGRvd24gdGhlIHZpZXcgbW9kZWwgYW5kIGJvb3QgVGF1bnVzIHVwIGFzIHNvb24gYXMgYm90aCBvcGVyYXRpb25zIGFyZSByZWFkeS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBmdW5jdGlvbiBpbmplY3QgKHVybCkge1xcbiAgICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcXG4gICAgICBzY3JpcHQuc3JjID0gdXJsO1xcbiAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcXG4gICAgfVxcblxcbiAgICBmdW5jdGlvbiBpbmplY3RvciAoKSB7XFxuICAgICAgdmFyIHNlYXJjaCA9IGxvY2F0aW9uLnNlYXJjaDtcXG4gICAgICB2YXIgc2VhcmNoUXVlcnkgPSBzZWFyY2ggPyAnJicgKyBzZWFyY2guc3Vic3RyKDEpIDogJyc7XFxuICAgICAgdmFyIHNlYXJjaEpzb24gPSAnP2pzb24mY2FsbGJhY2s9dGF1bnVzUmVhZHknICsgc2VhcmNoUXVlcnk7XFxuICAgICAgaW5qZWN0KGxvY2F0aW9uLnBhdGhuYW1lICsgc2VhcmNoSnNvbik7XFxuICAgIH1cXG5cXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuXFxuICAgIGluamVjdG9yKCk7XFxuICAgIGBgYFxcblxcbiAgICBBcyBtZW50aW9uZWQgZWFybGllciwgdGhpcyBhcHByb2FjaCBpbnZvbHZlcyBnZXR0aW5nIHlvdXIgaGFuZHMgZGlydGllciBidXQgaXQgcGF5cyBvZmYgYnkgYmVpbmcgdGhlIGZhc3Rlc3Qgb2YgdGhlIHRocmVlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENhY2hpbmdcXG5cXG4gICAgVGhlIGNsaWVudC1zaWRlIGluIFRhdW51cyBzdXBwb3J0cyBjYWNoaW5nIGluLW1lbW9yeSBhbmQgdXNpbmcgdGhlIGVtYmVkZGVkIEluZGV4ZWREQiBzeXN0ZW0gYnkgbWVyZWx5IHR1cm5pbmcgb24gdGhlIGBjYWNoZWAgZmxhZyBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgb24gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJZiB5b3Ugc2V0IGBjYWNoZWAgdG8gYHRydWVgIHRoZW4gY2FjaGVkIGl0ZW1zIHdpbGwgYmUgY29uc2lkZXJlZCBfXFxcImZyZXNoXFxcIiAodmFsaWQgY29waWVzIG9mIHRoZSBvcmlnaW5hbClfIGZvciAqKjE1IHNlY29uZHMqKi4gWW91IGNhbiBhbHNvIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyLCBhbmQgdGhhdCBudW1iZXIgb2Ygc2Vjb25kcyB3aWxsIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgaW5zdGVhZC5cXG5cXG4gICAgQ2FjaGluZyBjYW4gYWxzbyBiZSB0d2Vha2VkIG9uIGluZGl2aWR1YWwgcm91dGVzLiBGb3IgaW5zdGFuY2UsIHlvdSBjb3VsZCBzZXQgYHsgY2FjaGU6IHRydWUgfWAgd2hlbiBtb3VudGluZyBUYXVudXMgYW5kIHRoZW4gaGF2ZSBgeyBjYWNoZTogMzYwMCB9YCBvbiBhIHJvdXRlIHRoYXQgeW91IHdhbnQgdG8gY2FjaGUgZm9yIGEgbG9uZ2VyIHBlcmlvZCBvZiB0aW1lLlxcblxcbiAgICBUaGUgY2FjaGluZyBsYXllciBpcyBfc2VhbWxlc3NseSBpbnRlZ3JhdGVkXyBpbnRvIFRhdW51cywgbWVhbmluZyB0aGF0IGFueSB2aWV3cyByZW5kZXJlZCBieSBUYXVudXMgd2lsbCBiZSBjYWNoZWQgYWNjb3JkaW5nIHRvIHRoZXNlIGNhY2hpbmcgcnVsZXMuIEtlZXAgaW4gbWluZCwgaG93ZXZlciwgdGhhdCBwZXJzaXN0ZW5jZSBhdCB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBsYXllciB3aWxsIG9ubHkgYmUgcG9zc2libGUgaW4gW2Jyb3dzZXJzIHRoYXQgc3VwcG9ydCBJbmRleGVkREJdWzE0XS4gSW4gdGhlIGNhc2Ugb2YgYnJvd3NlcnMgdGhhdCBkb24ndCBzdXBwb3J0IEluZGV4ZWREQiwgVGF1bnVzIHdpbGwgdXNlIGFuIGluLW1lbW9yeSBjYWNoZSwgd2hpY2ggd2lsbCBiZSB3aXBlZCBvdXQgd2hlbmV2ZXIgdGhlIGh1bWFuIGRlY2lkZXMgdG8gY2xvc2UgdGhlIHRhYiBpbiB0aGVpciBicm93c2VyLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFByZWZldGNoaW5nXFxuXFxuICAgIElmIGNhY2hpbmcgaXMgZW5hYmxlZCwgdGhlIG5leHQgbG9naWNhbCBzdGVwIGlzIHByZWZldGNoaW5nLiBUaGlzIGlzIGVuYWJsZWQganVzdCBieSBhZGRpbmcgYHByZWZldGNoOiB0cnVlYCB0byB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAuIFRoZSBwcmVmZXRjaGluZyBmZWF0dXJlIHdpbGwgZmlyZSBmb3IgYW55IGFuY2hvciBsaW5rIHRoYXQncyB0cmlwcyBvdmVyIGEgYG1vdXNlb3ZlcmAgb3IgYSBgdG91Y2hzdGFydGAgZXZlbnQuIElmIGEgcm91dGUgbWF0Y2hlcyB0aGUgVVJMIGluIHRoZSBgaHJlZmAsIGFuIEFKQVggcmVxdWVzdCB3aWxsIHByZWZldGNoIHRoZSB2aWV3IGFuZCBjYWNoZSBpdHMgY29udGVudHMsIGltcHJvdmluZyBwZXJjZWl2ZWQgcGVyZm9ybWFuY2UuXFxuXFxuICAgIFdoZW4gbGlua3MgYXJlIGNsaWNrZWQgYmVmb3JlIHByZWZldGNoaW5nIGZpbmlzaGVzLCB0aGV5J2xsIHdhaXQgb24gdGhlIHByZWZldGNoZXIgdG8gZmluaXNoIGJlZm9yZSBpbW1lZGlhdGVseSBzd2l0Y2hpbmcgdG8gdGhlIHZpZXcsIGVmZmVjdGl2ZWx5IGN1dHRpbmcgZG93biB0aGUgcmVzcG9uc2UgdGltZS4gSWYgdGhlIGxpbmsgd2FzIGFscmVhZHkgcHJlZmV0Y2hlZCBvciBvdGhlcndpc2UgY2FjaGVkLCB0aGUgdmlldyB3aWxsIGJlIGxvYWRlZCBpbW1lZGlhdGVseS4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGEgbGluayBhbmQgYW5vdGhlciBvbmUgd2FzIGFscmVhZHkgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGF0IG9uZSBpcyBhYm9ydGVkLiBUaGlzIHByZXZlbnRzIHByZWZldGNoaW5nIGZyb20gZHJhaW5pbmcgdGhlIGJhbmR3aWR0aCBvbiBjbGllbnRzIHdpdGggbGltaXRlZCBvciBpbnRlcm1pdHRlbnQgY29ubmVjdGl2aXR5LlxcblxcbiAgICAjIyMjIFZlcnNpb25pbmdcXG5cXG4gICAgSW4gb3JkZXIgdG8gdHVybiBvbiB0aGUgdmVyc2lvbmluZyBBUEksIHNldCB0aGUgYHZlcnNpb25gIGZpZWxkIGluIHRoZSBvcHRpb25zIHdoZW4gaW52b2tpbmcgYHRhdW51cy5tb3VudGAgKipvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLCB1c2luZyB0aGUgc2FtZSB2YWx1ZSoqLiBUaGUgVGF1bnVzIHZlcnNpb24gc3RyaW5nIHdpbGwgYmUgYWRkZWQgdG8gdGhlIG9uZSB5b3UgcHJvdmlkZWQsIHNvIHRoYXQgVGF1bnVzIHdpbGwga25vdyB0byBzdGF5IGFsZXJ0IGZvciBjaGFuZ2VzIHRvIFRhdW51cyBpdHNlbGYsIGFzIHdlbGwuXFxuXFxuICAgIFRoZSBkZWZhdWx0IHZlcnNpb24gc3RyaW5nIGlzIHNldCB0byBgMWAuIFRoZSBUYXVudXMgdmVyc2lvbiB3aWxsIGJlIHByZXBlbmRlZCB0byB5b3VycywgcmVzdWx0aW5nIGluIGEgdmFsdWUgc3VjaCBhcyBgdDMuMC4wO3YxYCB3aGVyZSBUYXVudXMgaXMgcnVubmluZyB2ZXJzaW9uIGAzLjAuMGAgYW5kIHlvdXIgYXBwbGljYXRpb24gaXMgcnVubmluZyB2ZXJzaW9uIGAxYC5cXG5cXG4gICAgUmVmZXIgdG8gdGhlIEdldHRpbmcgU3RhcnRlZCBndWlkZSBmb3IgYSBtb3JlIGRldGFpbGVkIFthbmFseXNpcyBvZiB0aGUgdXNlcyBmb3IgdmVyc2lvbmluZ11bMTVdLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm9uKHR5cGUsIGZuKWBcXG5cXG4gICAgVGF1bnVzIGVtaXRzIGEgc2VyaWVzIG9mIGV2ZW50cyBkdXJpbmcgaXRzIGxpZmVjeWNsZSwgYW5kIGB0YXVudXMub25gIGlzIHRoZSB3YXkgeW91IGNhbiB0dW5lIGluIGFuZCBsaXN0ZW4gZm9yIHRoZXNlIGV2ZW50cyB1c2luZyBhIHN1YnNjcmlwdGlvbiBmdW5jdGlvbiBgZm5gLlxcblxcbiAgICBFdmVudCAgICAgICAgICAgIHwgQXJndW1lbnRzICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgJ3N0YXJ0J2AgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2ZldGNoLnN0YXJ0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy5cXG4gICAgYCdmZXRjaC5kb25lJ2AgICB8ICBgcm91dGUsIGNvbnRleHQsIGRhdGFgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS5cXG4gICAgYCdmZXRjaC5hYm9ydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC5cXG4gICAgYCdmZXRjaC5lcnJvcidgICB8ICBgcm91dGUsIGNvbnRleHQsIGVycmAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub25jZSh0eXBlLCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGlzIGVxdWl2YWxlbnQgdG8gW2B0YXVudXMub25gXSgjLXRhdW51cy1vbi10eXBlLWZuLSksIGV4Y2VwdCB0aGUgZXZlbnQgbGlzdGVuZXJzIHdpbGwgYmUgdXNlZCBvbmNlIGFuZCB0aGVuIGl0J2xsIGJlIGRpc2NhcmRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5vZmYodHlwZSwgZm4pYFxcblxcbiAgICBVc2luZyB0aGlzIG1ldGhvZCB5b3UgY2FuIHJlbW92ZSBhbnkgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBwcmV2aW91c2x5IGFkZGVkIHVzaW5nIGAub25gIG9yIGAub25jZWAuIFlvdSBtdXN0IHByb3ZpZGUgdGhlIHR5cGUgb2YgZXZlbnQgeW91IHdhbnQgdG8gcmVtb3ZlIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgZXZlbnQgbGlzdGVuZXIgZnVuY3Rpb24gdGhhdCB3YXMgb3JpZ2luYWxseSB1c2VkIHdoZW4gY2FsbGluZyBgLm9uYCBvciBgLm9uY2VgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLmludGVyY2VwdChhY3Rpb24/LCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGNhbiBiZSB1c2VkIHRvIGFudGljaXBhdGUgbW9kZWwgcmVxdWVzdHMsIGJlZm9yZSB0aGV5IGV2ZXIgbWFrZSBpdCBpbnRvIFhIUiByZXF1ZXN0cy4gWW91IGNhbiBhZGQgaW50ZXJjZXB0b3JzIGZvciBzcGVjaWZpYyBhY3Rpb25zLCB3aGljaCB3b3VsZCBiZSB0cmlnZ2VyZWQgb25seSBpZiB0aGUgcmVxdWVzdCBtYXRjaGVzIHRoZSBzcGVjaWZpZWQgYGFjdGlvbmAuIFlvdSBjYW4gYWxzbyBhZGQgZ2xvYmFsIGludGVyY2VwdG9ycyBieSBvbWl0dGluZyB0aGUgYGFjdGlvbmAgcGFyYW1ldGVyLCBvciBzZXR0aW5nIGl0IHRvIGAqYC5cXG5cXG4gICAgQW4gaW50ZXJjZXB0b3IgZnVuY3Rpb24gd2lsbCByZWNlaXZlIGFuIGBldmVudGAgcGFyYW1ldGVyLCBjb250YWluaW5nIGEgZmV3IGRpZmZlcmVudCBwcm9wZXJ0aWVzLlxcblxcbiAgICAtIGB1cmxgIGNvbnRhaW5zIHRoZSBVUkwgdGhhdCBuZWVkcyBhIHZpZXcgbW9kZWxcXG4gICAgLSBgcm91dGVgIGNvbnRhaW5zIHRoZSBmdWxsIHJvdXRlIG9iamVjdCBhcyB5b3UnZCBnZXQgZnJvbSBbYHRhdW51cy5yb3V0ZSh1cmwpYF0oIy10YXVudXMtcm91dGUtdXJsLSlcXG4gICAgLSBgcGFydHNgIGlzIGp1c3QgYSBzaG9ydGN1dCBmb3IgYHJvdXRlLnBhcnRzYFxcbiAgICAtIGBwcmV2ZW50RGVmYXVsdChtb2RlbClgIGFsbG93cyB5b3UgdG8gc3VwcHJlc3MgdGhlIG5lZWQgZm9yIGFuIEFKQVggcmVxdWVzdCwgY29tbWFuZGluZyBUYXVudXMgdG8gdXNlIHRoZSBtb2RlbCB5b3UndmUgcHJvdmlkZWQgaW5zdGVhZFxcbiAgICAtIGBkZWZhdWx0UHJldmVudGVkYCB0ZWxscyB5b3UgaWYgc29tZSBvdGhlciBoYW5kbGVyIGhhcyBwcmV2ZW50ZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3JcXG4gICAgLSBgY2FuUHJldmVudERlZmF1bHRgIHRlbGxzIHlvdSBpZiBpbnZva2luZyBgZXZlbnQucHJldmVudERlZmF1bHRgIHdpbGwgaGF2ZSBhbnkgZWZmZWN0XFxuICAgIC0gYG1vZGVsYCBzdGFydHMgYXMgYG51bGxgLCBhbmQgaXQgY2FuIGxhdGVyIGJlY29tZSB0aGUgbW9kZWwgcGFzc2VkIHRvIGBwcmV2ZW50RGVmYXVsdGBcXG5cXG4gICAgSW50ZXJjZXB0b3JzIGFyZSBhc3luY2hyb25vdXMsIGJ1dCBpZiBhbiBpbnRlcmNlcHRvciBzcGVuZHMgbG9uZ2VyIHRoYW4gMjAwbXMgaXQnbGwgYmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBjYWxsaW5nIGBldmVudC5wcmV2ZW50RGVmYXVsdGAgcGFzdCB0aGF0IHBvaW50IHdvbid0IGhhdmUgYW55IGVmZmVjdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5wYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbClgXFxuXFxuICAgIFRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSBgYWN0aW9uYCB2aWV3IGludG8gdGhlIGBjb250YWluZXJgIERPTSBlbGVtZW50LCB1c2luZyB0aGUgc3BlY2lmaWVkIGBtb2RlbGAuIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSBgcmVuZGVyYCBldmVudCB3aWxsIGJlIGZpcmVkIF8od2l0aCBgY29udGFpbmVyLCBtb2RlbGAgYXMgYXJndW1lbnRzKV8gYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGF0IHZpZXcgd2lsbCBiZSBleGVjdXRlZC5cXG5cXG4gICAgV2hpbGUgYHRhdW51cy5wYXJ0aWFsYCB0YWtlcyBhIGByb3V0ZWAgYXMgdGhlIGZvdXJ0aCBwYXJhbWV0ZXIsIHlvdSBzaG91bGQgb21pdCB0aGF0IHNpbmNlIGl0J3MgdXNlZCBmb3IgaW50ZXJuYWwgcHVycG9zZXMgb25seS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYFxcblxcbiAgICBXaGVuZXZlciB5b3Ugd2FudCB0byBuYXZpZ2F0ZSB0byBhIFVSTCwgc2F5IHdoZW4gYW4gQUpBWCBjYWxsIGZpbmlzaGVzIGFmdGVyIGEgYnV0dG9uIGNsaWNrLCB5b3UgY2FuIHVzZSBgdGF1bnVzLm5hdmlnYXRlYCBwYXNzaW5nIGl0IGEgcGxhaW4gVVJMIG9yIGFueXRoaW5nIHRoYXQgd291bGQgY2F1c2UgYHRhdW51cy5yb3V0ZSh1cmwpYCB0byByZXR1cm4gYSB2YWxpZCByb3V0ZS5cXG5cXG4gICAgQnkgZGVmYXVsdCwgaWYgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYCBpcyBjYWxsZWQgd2l0aCBhbiBgdXJsYCB0aGF0IGRvZXNuJ3QgbWF0Y2ggYW55IGNsaWVudC1zaWRlIHJvdXRlLCB0aGVuIHRoZSB1c2VyIHdpbGwgYmUgcmVkaXJlY3RlZCB2aWEgYGxvY2F0aW9uLmhyZWZgLiBJbiBjYXNlcyB3aGVyZSB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBvcnQgdGhlIGhpc3RvcnkgQVBJLCBgbG9jYXRpb24uaHJlZmAgd2lsbCBiZSB1c2VkIGFzIHdlbGwuXFxuXFxuICAgIFRoZXJlJ3MgYSBmZXcgb3B0aW9ucyB5b3UgY2FuIHVzZSB0byB0d2VhayB0aGUgYmVoYXZpb3Igb2YgYHRhdW51cy5uYXZpZ2F0ZWAuXFxuXFxuICAgIE9wdGlvbiAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBjb250ZXh0YCAgICAgICAgfCBBIERPTSBlbGVtZW50IHRoYXQgY2F1c2VkIHRoZSBuYXZpZ2F0aW9uIGV2ZW50LCB1c2VkIHdoZW4gZW1pdHRpbmcgZXZlbnRzXFxuICAgIGBzdHJpY3RgICAgICAgICAgfCBJZiBzZXQgdG8gYHRydWVgIGFuZCB0aGUgVVJMIGRvZXNuJ3QgbWF0Y2ggYW55IHJvdXRlLCB0aGVuIHRoZSBuYXZpZ2F0aW9uIGF0dGVtcHQgbXVzdCBiZSBpZ25vcmVkXFxuICAgIGBzY3JvbGxgICAgICAgICAgfCBXaGVuIHRoaXMgaXMgc2V0IHRvIGBmYWxzZWAsIGVsZW1lbnRzIGFyZW4ndCBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXIgbmF2aWdhdGlvblxcbiAgICBgZm9yY2VgICAgICAgICAgIHwgVW5sZXNzIHRoaXMgaXMgc2V0IHRvIGB0cnVlYCwgbmF2aWdhdGlvbiB3b24ndCBfZmV0Y2ggYSBtb2RlbF8gaWYgdGhlIHJvdXRlIG1hdGNoZXMgdGhlIGN1cnJlbnQgcm91dGUsIGFuZCBgc3RhdGUubW9kZWxgIHdpbGwgYmUgcmV1c2VkIGluc3RlYWRcXG4gICAgYHJlcGxhY2VTdGF0ZWAgICB8IFVzZSBgcmVwbGFjZVN0YXRlYCBpbnN0ZWFkIG9mIGBwdXNoU3RhdGVgIHdoZW4gY2hhbmdpbmcgaGlzdG9yeVxcblxcbiAgICBOb3RlIHRoYXQgdGhlIG5vdGlvbiBvZiBfZmV0Y2hpbmcgYSBtb2RlbF8gbWlnaHQgYmUgZGVjZWl2aW5nIGFzIHRoZSBtb2RlbCBjb3VsZCBiZSBwdWxsZWQgZnJvbSB0aGUgY2FjaGUgZXZlbiBpZiBgZm9yY2VgIGlzIHNldCB0byBgdHJ1ZWAuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucm91dGUodXJsKWBcXG5cXG4gICAgVGhpcyBjb252ZW5pZW5jZSBtZXRob2QgYWxsb3dzIHlvdSB0byBicmVhayBkb3duIGEgVVJMIGludG8gaXRzIGluZGl2aWR1YWwgY29tcG9uZW50cy4gVGhlIG1ldGhvZCBhY2NlcHRzIGFueSBvZiB0aGUgZm9sbG93aW5nIHBhdHRlcm5zLCBhbmQgaXQgcmV0dXJucyBhIFRhdW51cyByb3V0ZSBvYmplY3QuXFxuXFxuICAgIC0gQSBmdWxseSBxdWFsaWZpZWQgVVJMIG9uIHRoZSBzYW1lIG9yaWdpbiwgZS5nIGBodHRwOi8vdGF1bnVzLmJldmFjcXVhLmlvL2FwaWBcXG4gICAgLSBBbiBhYnNvbHV0ZSBVUkwgd2l0aG91dCBhbiBvcmlnaW4sIGUuZyBgL2FwaWBcXG4gICAgLSBKdXN0IGEgaGFzaCwgZS5nIGAjZm9vYCBfKGBsb2NhdGlvbi5ocmVmYCBpcyB1c2VkKV9cXG4gICAgLSBGYWxzeSB2YWx1ZXMsIGUuZyBgbnVsbGAgXyhgbG9jYXRpb24uaHJlZmAgaXMgdXNlZClfXFxuXFxuICAgIFJlbGF0aXZlIFVSTHMgYXJlIG5vdCBzdXBwb3J0ZWQgXyhhbnl0aGluZyB0aGF0IGRvZXNuJ3QgaGF2ZSBhIGxlYWRpbmcgc2xhc2gpXywgZS5nIGBmaWxlcy9kYXRhLmpzb25gLiBBbnl0aGluZyB0aGF0J3Mgbm90IG9uIHRoZSBzYW1lIG9yaWdpbiBvciBkb2Vzbid0IG1hdGNoIG9uZSBvZiB0aGUgcmVnaXN0ZXJlZCByb3V0ZXMgaXMgZ29pbmcgdG8geWllbGQgYG51bGxgLlxcblxcbiAgICBfVGhpcyBtZXRob2QgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLCBhcyBpdCBnaXZlcyB5b3UgZGlyZWN0IGFjY2VzcyB0byB0aGUgcm91dGVyIHVzZWQgaW50ZXJuYWxseSBieSBUYXVudXMuX1xcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIGB0YXVudXMucm91dGUuZXF1YWxzKHJvdXRlLCByb3V0ZSlgXFxuXFxuICAgIENvbXBhcmVzIHR3byByb3V0ZXMgYW5kIHJldHVybnMgYHRydWVgIGlmIHRoZXkgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwuIE5vdGUgdGhhdCBkaWZmZXJlbnQgVVJMcyBtYXkgc3RpbGwgcmV0dXJuIGB0cnVlYC4gRm9yIGluc3RhbmNlLCBgL2Zvb2AgYW5kIGAvZm9vI2JhcmAgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwgZXZlbiBpZiB0aGV5J3JlIGRpZmZlcmVudCBVUkxzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnN0YXRlYFxcblxcbiAgICBUaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi5cXG5cXG4gICAgLSBgY29udGFpbmVyYCBpcyB0aGUgRE9NIGVsZW1lbnQgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgXFxuICAgIC0gYGNvbnRyb2xsZXJzYCBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGB0ZW1wbGF0ZXNgIGFyZSBhbGwgdGhlIHRlbXBsYXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZXNgIGFyZSBhbGwgdGhlIHJvdXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZWAgaXMgYSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgcm91dGVcXG4gICAgLSBgbW9kZWxgIGlzIGEgcmVmZXJlbmNlIHRvIHRoZSBtb2RlbCB1c2VkIHRvIHJlbmRlciB0aGUgY3VycmVudCB2aWV3XFxuICAgIC0gYHByZWZldGNoYCBleHBvc2VzIHdoZXRoZXIgcHJlZmV0Y2hpbmcgaXMgdHVybmVkIG9uXFxuICAgIC0gYGNhY2hlYCBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkXFxuXFxuICAgIE9mIGNvdXJzZSwgeW91ciBub3Qgc3VwcG9zZWQgdG8gbWVkZGxlIHdpdGggaXQsIHNvIGJlIGEgZ29vZCBjaXRpemVuIGFuZCBqdXN0IGluc3BlY3QgaXRzIHZhbHVlcyFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBUaGUgYC50YXVudXNyY2AgbWFuaWZlc3RcXG5cXG4gICAgSWYgeW91IHdhbnQgdG8gdXNlIHZhbHVlcyBvdGhlciB0aGFuIHRoZSBjb252ZW50aW9uYWwgZGVmYXVsdHMgc2hvd24gaW4gdGhlIHRhYmxlIGJlbG93LCB0aGVuIHlvdSBzaG91bGQgY3JlYXRlIGEgYC50YXVudXNyY2AgZmlsZS4gTm90ZSB0aGF0IHRoZSBkZWZhdWx0cyBuZWVkIHRvIGJlIG92ZXJ3cml0dGVuIGluIGEgY2FzZS1ieS1jYXNlIGJhc2lzLiBUaGVzZSBvcHRpb25zIGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgaW4geW91ciBgcGFja2FnZS5qc29uYCwgdW5kZXIgdGhlIGB0YXVudXNgIHByb3BlcnR5LlxcblxcbiAgICBgYGBqc29uXFxuICAgIHtcXG4gICAgICBcXFwidmlld3NcXFwiOiBcXFwiLmJpbi92aWV3c1xcXCIsXFxuICAgICAgXFxcInNlcnZlcl9yb3V0ZXNcXFwiOiBcXFwiY29udHJvbGxlcnMvcm91dGVzLmpzXFxcIixcXG4gICAgICBcXFwic2VydmVyX2NvbnRyb2xsZXJzXFxcIjogXFxcImNvbnRyb2xsZXJzXFxcIixcXG4gICAgICBcXFwiY2xpZW50X2NvbnRyb2xsZXJzXFxcIjogXFxcImNsaWVudC9qcy9jb250cm9sbGVyc1xcXCIsXFxuICAgICAgXFxcImNsaWVudF93aXJpbmdcXFwiOiBcXFwiLmJpbi93aXJpbmcuanNcXFwiXFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIC0gVGhlIGB2aWV3c2AgZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgdmlld3MgXyhhbHJlYWR5IGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdClfIGFyZSBwbGFjZWQuIFRoZXNlIHZpZXdzIGFyZSB1c2VkIGRpcmVjdGx5IG9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGVcXG4gICAgLSBUaGUgYHNlcnZlcl9yb3V0ZXNgIGZpbGUgaXMgdGhlIG1vZHVsZSB3aGVyZSB5b3UgZXhwb3J0IGEgY29sbGVjdGlvbiBvZiByb3V0ZXMuIFRoZSBDTEkgd2lsbCBwdWxsIHRoZXNlIHJvdXRlcyB3aGVuIGNyZWF0aW5nIHRoZSBjbGllbnQtc2lkZSByb3V0ZXMgZm9yIHRoZSB3aXJpbmcgbW9kdWxlXFxuICAgIC0gVGhlIGBzZXJ2ZXJfY29udHJvbGxlcnNgIGRpcmVjdG9yeSBpcyB0aGUgcm9vdCBkaXJlY3Rvcnkgd2hlcmUgeW91ciBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBsaXZlLiBJdCdzIHVzZWQgd2hlbiBzZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZSByb3V0ZXJcXG4gICAgLSBUaGUgYGNsaWVudF9jb250cm9sbGVyc2AgZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgY2xpZW50LXNpZGUgY29udHJvbGxlciBtb2R1bGVzIGxpdmUuIFRoZSBDTEkgd2lsbCBgcmVxdWlyZWAgdGhlc2UgY29udHJvbGxlcnMgaW4gaXRzIHJlc3VsdGluZyB3aXJpbmcgbW9kdWxlXFxuICAgIC0gVGhlIGBjbGllbnRfd2lyaW5nYCBmaWxlIGlzIHdoZXJlIHlvdXIgd2lyaW5nIG1vZHVsZSB3aWxsIGJlIHBsYWNlZCBieSB0aGUgQ0xJLiBZb3UnbGwgdGhlbiBoYXZlIHRvIGByZXF1aXJlYCBpdCBpbiB5b3VyIGFwcGxpY2F0aW9uIHdoZW4gYm9vdGluZyB1cCBUYXVudXNcXG5cXG4gICAgSGVyZSBpcyB3aGVyZSB0aGluZ3MgZ2V0IFthIGxpdHRsZSBjb252ZW50aW9uYWxdWzEyXS4gVmlld3MsIGFuZCBib3RoIHNlcnZlci1zaWRlIGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhwZWN0ZWQgdG8gYmUgb3JnYW5pemVkIGJ5IGZvbGxvd2luZyB0aGUgYHtyb290fS97Y29udHJvbGxlcn0ve2FjdGlvbn1gIHBhdHRlcm4sIGJ1dCB5b3UgY291bGQgY2hhbmdlIHRoYXQgdXNpbmcgYHJlc29sdmVyc2Agd2hlbiBpbnZva2luZyB0aGUgQ0xJIGFuZCB1c2luZyB0aGUgc2VydmVyLXNpZGUgQVBJLlxcblxcbiAgICBWaWV3cyBhbmQgY29udHJvbGxlcnMgYXJlIGFsc28gZXhwZWN0ZWQgdG8gYmUgQ29tbW9uSlMgbW9kdWxlcyB0aGF0IGV4cG9ydCBhIHNpbmdsZSBtZXRob2QuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgIFsxXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbMl06IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFszXTogaHR0cDovL2hhcGlqcy5jb21cXG4gICAgWzRdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvMzMyNzE3NTEzMTJkYjZlOTIwNTlkOTgyOTNkMGE3YWM2ZTllOGU1Yi92aWV3cy9zZXJ2ZXIvbGF5b3V0L2xheW91dC5qYWRlXFxuICAgIFs1XTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2hnZXRcXG4gICAgWzZdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvZjZkNmI1MDY4ZmYwM2EzODdmNTAzOTAwMTYwZDlmZGMxZTc0OTc1MC9jb250cm9sbGVycy9yb3V0aW5nLmpzI0w3MC1MNzJcXG4gICAgWzddOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxuICAgIFs4XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcbiAgICBbOV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcbiAgICBbMTBdOiBodHRwczovL2dpdGh1Yi5jb20vdW1kanMvdW1kXFxuICAgIFsxMV06IGh0dHA6Ly9icm93c2VyaWZ5Lm9yZ1xcbiAgICBbMTJdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxuICAgIFsxM106IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvU2luZ2xlLXBhZ2VfYXBwbGljYXRpb25cXG4gICAgWzE0XTogaHR0cDovL2Nhbml1c2UuY29tLyNmZWF0PWluZGV4ZWRkYlxcbiAgICBbMTVdOiAvZ2V0dGluZy1zdGFydGVkI3ZlcnNpb25pbmdcXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29tcGxlbWVudHMobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiY29tcGxlbWVudGFyeS1tb2R1bGVzXFxcIj5Db21wbGVtZW50YXJ5IE1vZHVsZXM8L2gxPlxcbjxwPlRhdW51cyBpcyBhIHNtYWxsIGxpYnJhcnkgYnkgTVZDIGZyYW1ld29yayBzdGFuZGFyZHMsIHNpdHRpbmcgPHN0cm9uZz5iZWxvdyAxNWtCIG1pbmlmaWVkIGFuZCBnemlwcGVkPC9zdHJvbmc+LiBJdCBpcyBkZXNpZ25lZCB0byBiZSBzbWFsbC4gSXQgaXMgYWxzbyBkZXNpZ25lZCB0byBkbyBvbmUgdGhpbmcgd2VsbCwgYW5kIHRoYXQmIzM5O3MgPGVtPmJlaW5nIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lPC9lbT4uPC9wPlxcbjxwPlRhdW51cyBjYW4gYmUgdXNlZCBmb3Igcm91dGluZywgcHV0dGluZyB0b2dldGhlciBjb250cm9sbGVycywgbW9kZWxzIGFuZCB2aWV3cyB0byBoYW5kbGUgaHVtYW4gaW50ZXJhY3Rpb24uIElmIHlvdSA8YSBocmVmPVxcXCIvYXBpXFxcIj5oZWFkIG92ZXIgdG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiwgeW91JiMzOTtsbCBub3RpY2UgdGhhdCB0aGUgc2VydmVyLXNpZGUgQVBJLCB0aGUgY29tbWFuZC1saW5lIGludGVyZmFjZSwgYW5kIHRoZSA8Y29kZT4udGF1bnVzcmM8L2NvZGU+IG1hbmlmZXN0IGFyZSBvbmx5IGNvbmNlcm5lZCB3aXRoIHByb3ZpZGluZyBhIGNvbnZlbnRpb25hbCBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUuPC9wPlxcbjxwPkluIHRoZSBzZXJ2ZXItc2lkZSB5b3UgbWlnaHQgbmVlZCB0byBkbyBvdGhlciB0aGluZ3MgYmVzaWRlcyByb3V0aW5nIGFuZCByZW5kZXJpbmcgdmlld3MsIGFuZCBvdGhlciBtb2R1bGVzIGNhbiB0YWtlIGNhcmUgb2YgdGhhdC4gSG93ZXZlciwgeW91JiMzOTtyZSB1c2VkIHRvIGhhdmluZyBkYXRhYmFzZSBhY2Nlc3MsIHNlYXJjaCwgbG9nZ2luZywgYW5kIGEgdmFyaWV0eSBvZiBzZXJ2aWNlcyBoYW5kbGVkIGJ5IHNlcGFyYXRlIGxpYnJhcmllcywgaW5zdGVhZCBvZiBhIHNpbmdsZSBiZWhlbW90aCB0aGF0IHRyaWVzIHRvIGRvIGV2ZXJ5dGhpbmcuPC9wPlxcbjxibG9ja3F1b3RlPlxcbjxwPkluIHRoZSBjbGllbnQtc2lkZSwgeW91IG1pZ2h0IGJlIHVzZWQgdG8geW91ciBNVkMgZnJhbWV3b3JrIG9mIGNob2ljZSByZXNvbHZpbmcgZXZlcnl0aGluZyBvbiB5b3VyIGJlaGFsZiwgZnJvbSBET00gbWFuaXB1bGF0aW9uIGFuZCBkYXRhLWJpbmRpbmcgdG8gaG9va2luZyB1cCB3aXRoIGEgUkVTVCBBUEksIGFuZCBldmVyeXdoZXJlIGluIGJldHdlZW4uPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5UYXVudXMgYXR0ZW1wdHMgdG8gYnJpbmcgdGhlIHNlcnZlci1zaWRlIG1lbnRhbGl0eSBvZiA8ZW0+JnF1b3Q7bm90IGRvaW5nIGV2ZXJ5dGhpbmcgaXMgb2theSZxdW90OzwvZW0+IGludG8gdGhlIHdvcmxkIG9mIGNsaWVudC1zaWRlIHdlYiBhcHBsaWNhdGlvbiBkZXZlbG9wbWVudCBhcyB3ZWxsLiBUbyB0aGF0IGVuZCwgVGF1bnVzIHJlY29tbWVuZHMgdGhhdCB5b3UgZ2l2ZSBhIHNob3QgdG8gbGlicmFyaWVzIHRoYXQgYWxzbyBkbyA8c3Ryb25nPm9uZSB0aGluZyB3ZWxsPC9zdHJvbmc+LjwvcD5cXG48cD5JbiB0aGlzIGJyaWVmIGFydGljbGUgd2UmIzM5O2xsIHJlY29tbWVuZCB0aHJlZSBkaWZmZXJlbnQgbGlicmFyaWVzIHRoYXQgcGxheSB3ZWxsIHdpdGggVGF1bnVzLCBhbmQgeW91JiMzOTtsbCBhbHNvIGxlYXJuIGhvdyB0byBzZWFyY2ggZm9yIG1vZHVsZXMgdGhhdCBjYW4gZ2l2ZSB5b3UgYWNjZXNzIHRvIG90aGVyIGZ1bmN0aW9uYWxpdHkgeW91IG1heSBiZSBpbnRlcmVzdGVkIGluLjwvcD5cXG48aDEgaWQ9XFxcInVzaW5nLWRvbWludXMtZm9yLWRvbS1xdWVyeWluZ1xcXCI+VXNpbmcgPGNvZGU+ZG9taW51czwvY29kZT4gZm9yIERPTSBxdWVyeWluZzwvaDE+XFxuPHA+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2RvbWludXNcXFwiPkRvbWludXM8L2E+IGlzIGFuIGV4dHJhLXNtYWxsIERPTSBxdWVyeWluZyBsaWJyYXJ5LCBjdXJyZW50bHkgY2xvY2tpbmcgYmVsb3cgPHN0cm9uZz40a0IgbWluaWZpZWQgYW5kIGd6aXBwZWQ8L3N0cm9uZz4sIGFsbW9zdCA8ZW0+dGVuIHRpbWVzIHNtYWxsZXI8L2VtPiB0aGFuIGl0JiMzOTtzIGNvbXBldGl0aW9uLiBVbmxpa2UgalF1ZXJ5IGFuZCBwb3B1bGFyIGZyaWVuZHMsIERvbWludXMgZG9lc24mIzM5O3QgcHJvdmlkZSBBSkFYIGZlYXR1cmVzLCBsYXlvdXQgbWF0aCwgPGNvZGU+Jmx0O2Zvcm0mZ3Q7PC9jb2RlPiBtYW5pcHVsYXRpb24sIHByb21pc2VzLCB0ZW5zIG9mIGV2ZW50IGJpbmRpbmcgbWV0aG9kcywgYSBzZWxlY3RvciBlbmdpbmUgd3JpdHRlbiBpbiBwbGFpbiBKYXZhU2NyaXB0LCBub3IgYSBteXJpYWQgb2YgdXRpbGl0eSBmdW5jdGlvbnMuIEluc3RlYWQsIERvbWludXMgZm9jdXNlcyBzb2xlbHkgb24gcHJvdmlkaW5nIGEgcmljaCBET00gcXVlcnlpbmcgYW5kIG1hbmlwdWxhdGlvbiBBUEkgdGhhdCBnZXRzIHJpZCBvZiBpbmNvbnNpc3RlbmNpZXMgYWNyb3NzIGJyb3dzZXJzLjwvcD5cXG48aDEgaWQ9XFxcInVzaW5nLXhoci10by1tYWtlLWFqYXgtcmVxdWVzdHNcXFwiPlVzaW5nIDxjb2RlPnhocjwvY29kZT4gdG8gbWFrZSBBSkFYIHJlcXVlc3RzPC9oMT5cXG48aDEgaWQ9XFxcInVzaW5nLW1lYXNseS1hcy1hbi11cGdyYWRlLXRvLXhoci1cXFwiPlVzaW5nIDxjb2RlPm1lYXNseTwvY29kZT4gYXMgYW4gdXBncmFkZSB0byA8Y29kZT54aHI8L2NvZGU+PC9oMT5cXG48aDEgaWQ9XFxcImNvbXBsZW1lbnRpbmcteW91ci1jb2RlLXdpdGgtc21hbGwtbW9kdWxlc1xcXCI+Q29tcGxlbWVudGluZyB5b3VyIGNvZGUgd2l0aCBzbWFsbCBtb2R1bGVzPC9oMT5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIENvbXBsZW1lbnRhcnkgTW9kdWxlc1xcblxcbiAgICBUYXVudXMgaXMgYSBzbWFsbCBsaWJyYXJ5IGJ5IE1WQyBmcmFtZXdvcmsgc3RhbmRhcmRzLCBzaXR0aW5nICoqYmVsb3cgMTVrQiBtaW5pZmllZCBhbmQgZ3ppcHBlZCoqLiBJdCBpcyBkZXNpZ25lZCB0byBiZSBzbWFsbC4gSXQgaXMgYWxzbyBkZXNpZ25lZCB0byBkbyBvbmUgdGhpbmcgd2VsbCwgYW5kIHRoYXQncyBfYmVpbmcgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmVfLlxcblxcbiAgICBUYXVudXMgY2FuIGJlIHVzZWQgZm9yIHJvdXRpbmcsIHB1dHRpbmcgdG9nZXRoZXIgY29udHJvbGxlcnMsIG1vZGVscyBhbmQgdmlld3MgdG8gaGFuZGxlIGh1bWFuIGludGVyYWN0aW9uLiBJZiB5b3UgW2hlYWQgb3ZlciB0byB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzFdLCB5b3UnbGwgbm90aWNlIHRoYXQgdGhlIHNlcnZlci1zaWRlIEFQSSwgdGhlIGNvbW1hbmQtbGluZSBpbnRlcmZhY2UsIGFuZCB0aGUgYC50YXVudXNyY2AgbWFuaWZlc3QgYXJlIG9ubHkgY29uY2VybmVkIHdpdGggcHJvdmlkaW5nIGEgY29udmVudGlvbmFsIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZS5cXG5cXG4gICAgSW4gdGhlIHNlcnZlci1zaWRlIHlvdSBtaWdodCBuZWVkIHRvIGRvIG90aGVyIHRoaW5ncyBiZXNpZGVzIHJvdXRpbmcgYW5kIHJlbmRlcmluZyB2aWV3cywgYW5kIG90aGVyIG1vZHVsZXMgY2FuIHRha2UgY2FyZSBvZiB0aGF0LiBIb3dldmVyLCB5b3UncmUgdXNlZCB0byBoYXZpbmcgZGF0YWJhc2UgYWNjZXNzLCBzZWFyY2gsIGxvZ2dpbmcsIGFuZCBhIHZhcmlldHkgb2Ygc2VydmljZXMgaGFuZGxlZCBieSBzZXBhcmF0ZSBsaWJyYXJpZXMsIGluc3RlYWQgb2YgYSBzaW5nbGUgYmVoZW1vdGggdGhhdCB0cmllcyB0byBkbyBldmVyeXRoaW5nLlxcblxcbiAgICA+IEluIHRoZSBjbGllbnQtc2lkZSwgeW91IG1pZ2h0IGJlIHVzZWQgdG8geW91ciBNVkMgZnJhbWV3b3JrIG9mIGNob2ljZSByZXNvbHZpbmcgZXZlcnl0aGluZyBvbiB5b3VyIGJlaGFsZiwgZnJvbSBET00gbWFuaXB1bGF0aW9uIGFuZCBkYXRhLWJpbmRpbmcgdG8gaG9va2luZyB1cCB3aXRoIGEgUkVTVCBBUEksIGFuZCBldmVyeXdoZXJlIGluIGJldHdlZW4uXFxuXFxuICAgIFRhdW51cyBhdHRlbXB0cyB0byBicmluZyB0aGUgc2VydmVyLXNpZGUgbWVudGFsaXR5IG9mIF9cXFwibm90IGRvaW5nIGV2ZXJ5dGhpbmcgaXMgb2theVxcXCJfIGludG8gdGhlIHdvcmxkIG9mIGNsaWVudC1zaWRlIHdlYiBhcHBsaWNhdGlvbiBkZXZlbG9wbWVudCBhcyB3ZWxsLiBUbyB0aGF0IGVuZCwgVGF1bnVzIHJlY29tbWVuZHMgdGhhdCB5b3UgZ2l2ZSBhIHNob3QgdG8gbGlicmFyaWVzIHRoYXQgYWxzbyBkbyAqKm9uZSB0aGluZyB3ZWxsKiouXFxuXFxuICAgIEluIHRoaXMgYnJpZWYgYXJ0aWNsZSB3ZSdsbCByZWNvbW1lbmQgdGhyZWUgZGlmZmVyZW50IGxpYnJhcmllcyB0aGF0IHBsYXkgd2VsbCB3aXRoIFRhdW51cywgYW5kIHlvdSdsbCBhbHNvIGxlYXJuIGhvdyB0byBzZWFyY2ggZm9yIG1vZHVsZXMgdGhhdCBjYW4gZ2l2ZSB5b3UgYWNjZXNzIHRvIG90aGVyIGZ1bmN0aW9uYWxpdHkgeW91IG1heSBiZSBpbnRlcmVzdGVkIGluLlxcblxcbiAgICAjIFVzaW5nIGBkb21pbnVzYCBmb3IgRE9NIHF1ZXJ5aW5nXFxuXFxuICAgIFtEb21pbnVzXVsyXSBpcyBhbiBleHRyYS1zbWFsbCBET00gcXVlcnlpbmcgbGlicmFyeSwgY3VycmVudGx5IGNsb2NraW5nIGJlbG93ICoqNGtCIG1pbmlmaWVkIGFuZCBnemlwcGVkKiosIGFsbW9zdCBfdGVuIHRpbWVzIHNtYWxsZXJfIHRoYW4gaXQncyBjb21wZXRpdGlvbi4gVW5saWtlIGpRdWVyeSBhbmQgcG9wdWxhciBmcmllbmRzLCBEb21pbnVzIGRvZXNuJ3QgcHJvdmlkZSBBSkFYIGZlYXR1cmVzLCBsYXlvdXQgbWF0aCwgYDxmb3JtPmAgbWFuaXB1bGF0aW9uLCBwcm9taXNlcywgdGVucyBvZiBldmVudCBiaW5kaW5nIG1ldGhvZHMsIGEgc2VsZWN0b3IgZW5naW5lIHdyaXR0ZW4gaW4gcGxhaW4gSmF2YVNjcmlwdCwgbm9yIGEgbXlyaWFkIG9mIHV0aWxpdHkgZnVuY3Rpb25zLiBJbnN0ZWFkLCBEb21pbnVzIGZvY3VzZXMgc29sZWx5IG9uIHByb3ZpZGluZyBhIHJpY2ggRE9NIHF1ZXJ5aW5nIGFuZCBtYW5pcHVsYXRpb24gQVBJIHRoYXQgZ2V0cyByaWQgb2YgaW5jb25zaXN0ZW5jaWVzIGFjcm9zcyBicm93c2Vycy5cXG5cXG4gICAgIyBVc2luZyBgeGhyYCB0byBtYWtlIEFKQVggcmVxdWVzdHNcXG5cXG4gICAgIyBVc2luZyBgbWVhc2x5YCBhcyBhbiB1cGdyYWRlIHRvIGB4aHJgXFxuXFxuICAgICMgQ29tcGxlbWVudGluZyB5b3VyIGNvZGUgd2l0aCBzbWFsbCBtb2R1bGVzXFxuXFxuICAgIFsxXTogL2FwaVxcbiAgICBbMl06IGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kb21pbnVzXFxuICAgIFszXTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL21lYXNseVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS9SYXlub3MveGhyXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldHRpbmdTdGFydGVkKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJnZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQmIzM5O3MgPGVtPnVwIHRvIHlvdSBob3cgdG8gdXNlIGl0PC9lbT4uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gPHN0cm9uZz5zZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0PC9zdHJvbmc+LCBhcyB0aGF0JiMzOTtsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2hvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlXFxcIj5TZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZTwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjcmVhdGluZy1hLWxheW91dFxcXCI+Q3JlYXRpbmcgYSBsYXlvdXQ8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjY29tcGlsaW5nLXlvdXItY2xpZW50LXNpZGUtamF2YXNjcmlwdFxcXCI+Q29tcGlsaW5nIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdDwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3ZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvYT48L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJob3ctaXQtd29ya3NcXFwiPkhvdyBpdCB3b3JrczwvaDE+XFxuPHA+VGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0IDxzdHJvbmc+cHJvdmVuPC9zdHJvbmc+IHNldCBvZiBydWxlcy48L3A+XFxuPHVsPlxcbjxsaT5EZWZpbmUgYSA8Y29kZT5mdW5jdGlvbihtb2RlbCk8L2NvZGU+IGZvciBlYWNoIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5QdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvbjwvbGk+XFxuPGxpPlB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzPC9saT5cXG48bGk+Q3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzPC9saT5cXG48bGk+Q3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3PC9saT5cXG48bGk+Rm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZTwvbGk+XFxuPGxpPldoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhPC9saT5cXG48bGk+T25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgPHN0cm9uZz5oaWphY2sgbGluayBjbGlja3M8L3N0cm9uZz4gYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkPC9saT5cXG48bGk+V2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5JZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gPHN0cm9uZz5Eb24mIzM5O3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzITwvc3Ryb25nPjwvbGk+XFxuPC91bD5cXG48cD5JJiMzOTtsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2gxPlxcbjxwPkZpcnN0IG9mZiwgeW91JiMzOTtsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+dGF1bnVzLWV4cHJlc3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+LCB0aHJvdWdoIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPnRhdW51cy1oYXBpPC9hPiBhbmQgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+aGFwaWlmeTwvYT4gdHJhbnNmb3JtPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHlvdSYjMzk7cmUgbW9yZSBvZiBhIDxlbT4mcXVvdDtydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJiMzOTtzIGNvZGUmcXVvdDs8L2VtPiB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxcIj5nb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSYjMzk7cyBzb3VyY2UgY29kZTwvYT4sIHdoaWNoIHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb29cXFwiPnBvbnlmb28uY29tPC9hPiwgd2hpY2ggaXMgPHN0cm9uZz5hIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2U8L3N0cm9uZz4gdW5kZXIgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0JiMzOTtzIG9rYXkgdG9vLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldHRsZWQgZm9yIGVpdGhlciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJiMzOTtsbCB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+LiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwic2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9oND5cXG48cD5OYXR1cmFsbHksIHlvdSYjMzk7bGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSA8Y29kZT5ucG08L2NvZGU+IHRvIGdldCBzdGFydGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciBnZXR0aW5nLXN0YXJ0ZWRcXG5jZCBnZXR0aW5nLXN0YXJ0ZWRcXG5ucG0gaW5pdFxcbm5wbSBpbnN0YWxsIC0tc2F2ZSB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzc1xcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbnBtIGluaXRgIG91dHB1dFxcXCI+PC9wPlxcbjxwPkxldCYjMzk7cyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSYjMzk7bGwgbmVlZCB0aGUgZmFtb3VzIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggYXBwLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUsIGxldCYjMzk7cyBkbyB0aGF0IG5vdy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge307XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QWxsIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIDxjb2RlPmFwcDwvY29kZT4uIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gaW52b2NhdGlvbi4gWW91JiMzOTtsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIDxlbT4mcXVvdDtOb3QgRm91bmQmcXVvdDs8L2VtPiB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS48L3A+XFxuPHA+SWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5UaGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0IHBhc3NlZCB0byA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBsZXQmIzM5O3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQmIzM5O3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSA8ZW0+cmVxdWlyZWQgY29uZmlndXJhdGlvbjwvZW0+LiBUaGVyZSYjMzk7cyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlczwvbGk+XFxuPGxpPjxjb2RlPmxheW91dDwvY29kZT4gc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSA8Y29kZT5tb2RlbDwvY29kZT4gYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnQ8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9oND5cXG48cD5Sb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gPHN0cm9uZz53aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZzwvc3Ryb25nPi4gTGV0JiMzOTtzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHJvdXRlcy5qc1xcbjwvY29kZT48L3ByZT5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IFtcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1cXG5dO1xcbjwvY29kZT48L3ByZT5cXG48cD5FYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSA8Y29kZT4vPC9jb2RlPiByb3V0ZSB3aXRoIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm48L2E+LCB3aGljaCBtYWRlIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvUnVieV9vbl9SYWlsc1xcXCI+UnVieSBvbiBSYWlsczwvYT4gZmFtb3VzLiA8ZW0+TWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vITwvZW0+IEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24gdXNlcyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gdmlldy4gT2YgY291cnNlLCA8ZW0+YWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbjwvZW0+LjwvcD5cXG48cD5UaW1lIHRvIGdvIGJhY2sgdG8gPGNvZGU+YXBwLmpzPC9jb2RlPiBhbmQgdXBkYXRlIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIDxlbT4obW9yZSBvbiB0aGF0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPmluIHRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4sIGJ1dCBpdCBkZWZhdWx0cyB0byA8Y29kZT57fTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkhlcmUmIzM5O3Mgd2hhdCB5b3UmIzM5O2QgZ2V0IGlmIHlvdSBhdHRlbXB0ZWQgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS8wOGxuQ2VjLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXFxcIj48L3A+XFxuPHA+VHVybnMgb3V0IHlvdSYjMzk7cmUgbWlzc2luZyBhIGxvdCBvZiB0aGluZ3MhIFRhdW51cyBpcyBxdWl0ZSBsZW5pZW50IGFuZCBpdCYjMzk7bGwgdHJ5IGl0cyBiZXN0IHRvIGxldCB5b3Uga25vdyB3aGF0IHlvdSBtaWdodCBiZSBtaXNzaW5nLCB0aG91Z2guIEFwcGFyZW50bHkgeW91IGRvbiYjMzk7dCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISA8ZW0+VGhhdCYjMzk7cyByb3VnaC48L2VtPjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvaDQ+XFxuPHA+TGV0JiMzOTtzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQmIzM5O2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBsYXlvdXQuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IDxlbT4oYXMgc2VlbiBiZWxvdyk8L2VtPiBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UmIzM5O2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgPGVtPiZxdW90O3VzZSB0aGUgZm9sbG93aW5nIGNvbWJpbmF0aW9uIG9mIHBsYWluIHRleHQgYW5kIHRoZSA8c3Ryb25nPihtYXliZSBIVE1MKTwvc3Ryb25nPiBwYXJ0aWFsIHZpZXcmcXVvdDs8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHJldHVybiAmIzM5O1RoaXMgaXMgdGhlIHBhcnRpYWw6ICZxdW90OyYjMzk7ICsgbW9kZWwucGFydGlhbCArICYjMzk7JnF1b3Q7JiMzOTs7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJiMzOTt0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCYjMzk7cyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuPC9wPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXFwiPk11c3RhY2hlPC9hPiBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCYjMzk7cyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTDwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcXCI+SmFkZTwvYT4gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSYjMzk7cyBubyBjbG9zaW5nIHRhZ3M8L2xpPlxcbjxsaT5UaGVyZSYjMzk7cyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgPGEgaHJlZj1cXFwiaHR0cDovL21vemlsbGEuZ2l0aHViLmlvL251bmp1Y2tzL1xcXCI+TW96aWxsYSYjMzk7cyBOdW5qdWNrczwvYT4sIDxhIGhyZWY9XFxcImh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcXCI+SGFuZGxlYmFyczwvYT4sIGFuZCA8YSBocmVmPVxcXCJodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcXCI+RUpTPC9hPi48L2xpPlxcbjwvdWw+XFxuPHA+UmVtZW1iZXIgdG8gYWRkIHRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHVuZGVyIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5IZXJlJiMzOTtzIHdoYXQgeW91JiMzOTtkIGdldCBpZiB5b3UgcmFuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5BdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSYjMzk7cmUgc3RpbGwgbWlzc2luZyB0aGUgcGFydGlhbCB2aWV3IGFuZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlci4gV2UgY2FuIGRvIHdpdGhvdXQgdGhlIGNvbnRyb2xsZXIsIGJ1dCBoYXZpbmcgbm8gdmlld3MgaXMga2luZCBvZiBwb2ludGxlc3Mgd2hlbiB5b3UmIzM5O3JlIHRyeWluZyB0byBnZXQgYW4gTVZDIGVuZ2luZSB1cCBhbmQgcnVubmluZywgcmlnaHQ/PC9wPlxcbjxwPllvdSYjMzk7bGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbjwvYT4uIElmIHlvdSBkb24mIzM5O3QgcHJvdmlkZSBhIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIDxjb2RlPiZsdDtwcmUmZ3Q7PC9jb2RlPiBhbmQgPGNvZGU+Jmx0O2NvZGUmZ3Q7PC9jb2RlPiB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmVcXFwiPlVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZTwvaDQ+XFxuPHA+TGV0JiMzOTtzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCB2aWV3cy9ob21lXFxudG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlJiMzOTtyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQmIzM5O3MgaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+cCBIZWxsbyBUYXVudXMhXFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgeW91JiMzOTtsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9qYWR1bVxcXCI+amFkdW08L2E+LCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0JiMzOTtzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIDxlbT4oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UmIzM5O3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKTwvZW0+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLWdsb2JhbCBqYWR1bVxcbjwvY29kZT48L3ByZT5cXG48cD5UbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIDxjb2RlPnZpZXdzPC9jb2RlPiBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSA8Y29kZT4uYmluPC9jb2RlPiBiZWNhdXNlIHRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uPC9hPiBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPmphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG48L2NvZGU+PC9wcmU+XFxuPHA+Q29uZ3JhdHVsYXRpb25zISBZb3VyIGZpcnN0IHZpZXcgaXMgbm93IG9wZXJhdGlvbmFsIGFuZCBidWlsdCB1c2luZyBhIGZ1bGwtZmxlZGdlZCB0ZW1wbGF0aW5nIGVuZ2luZSEgQWxsIHRoYXQmIzM5O3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgPGNvZGU+MzAwMDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxub3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS96amFKWUNxLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5HcmFudGVkLCB5b3Ugc2hvdWxkIDxlbT5wcm9iYWJseTwvZW0+IG1vdmUgdGhlIGxheW91dCBpbnRvIGEgSmFkZSA8ZW0+KGFueSB2aWV3IGVuZ2luZSB3aWxsIGRvKTwvZW0+IHRlbXBsYXRlIGFzIHdlbGwuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhyb3dpbmctaW4tYS1jb250cm9sbGVyXFxcIj5UaHJvd2luZyBpbiBhIGNvbnRyb2xsZXI8L2g0PlxcbjxwPkNvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24mIzM5O3QgZ2V0IHlvdSB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCYjMzk7cyBjcmVhdGUgYSBjb250cm9sbGVyIGZvciB0aGUgPGNvZGU+aG9tZS92aWV3PC9jb2RlPiBhY3Rpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm1rZGlyIC1wIGNvbnRyb2xsZXJzL2hvbWVcXG50b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiA8ZW0+U3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj88L2VtPiBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IDxlbT4ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBpbiB0aGUgY2FzZSBvZiA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbiYjMzk7dCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyA8ZW0+KHZlcnkgZmV3KTwvZW0+IHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIDxjb2RlPnRpdGxlPC9jb2RlPiBwcm9wZXJ0eSwgYW5kIGl0JiMzOTtsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgPGNvZGU+ZG9jdW1lbnQudGl0bGU8L2NvZGU+IGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0JiMzOTtzIG5vdCBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IHByb3BlcnR5IHdvbiYjMzk7dCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LjwvcD5cXG48cD5IZXJlIGlzIG91ciBuZXdmYW5nbGVkIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIuIEFzIHlvdSYjMzk7bGwgbm90aWNlLCBpdCBkb2VzbiYjMzk7dCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gPGNvZGU+bmV4dDwvY29kZT4gaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byA8Y29kZT5yZXMudmlld01vZGVsPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgIG1vZGVsOiB7XFxuICAgICAgdGl0bGU6ICYjMzk7V2VsY29tZSBIb21lLCBUYXVudXMhJiMzOTtcXG4gICAgfVxcbiAgfTtcXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSA8ZW0+d291bGRuJiMzOTt0IGJlIHByb2dyZXNzaXZlPC9lbT4sIGFuZCB0aHVzIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPml0IHdvdWxkIGJlIHJlYWxseSwgPGVtPnJlYWxseTwvZW0+IGJhZDwvYT4uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgPGNvZGU+dGl0bGU8L2NvZGU+IGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCYjMzk7cyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnJtIGxheW91dC5qc1xcbnRvdWNoIHZpZXdzL2xheW91dC5qYWRlXFxuamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbjwvY29kZT48L3ByZT5cXG48cD5Zb3Ugc2hvdWxkIGFsc28gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZSBvbmNlIGFnYWluITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vLmJpbi92aWV3cy9sYXlvdXQmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT4hPTwvY29kZT4gc3ludGF4IGJlbG93IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbiYjMzk7dCBiZSBlc2NhcGVkLiBUaGF0JiMzOTtzIG9rYXkgYmVjYXVzZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJiMzOTt0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+dGl0bGU9bW9kZWwudGl0bGVcXG5tYWluIT1wYXJ0aWFsXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IDxjb2RlPiZsdDtodG1sJmd0OzwvY29kZT4sIDxjb2RlPiZsdDtoZWFkJmd0OzwvY29kZT4sIGFuZCA8Y29kZT4mbHQ7Ym9keSZndDs8L2NvZGU+IGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIDxlbT5Ib3cgY29vbCBpcyB0aGF0PzwvZW0+PC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vTnZFV3g5ei5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+WW91IGNhbiBub3cgdmlzaXQgPGNvZGU+bG9jYWxob3N0OjMwMDA8L2NvZGU+IHdpdGggeW91ciBmYXZvcml0ZSB3ZWIgYnJvd3NlciBhbmQgeW91JiMzOTtsbCBub3RpY2UgdGhhdCB0aGUgdmlldyByZW5kZXJzIGFzIHlvdSYjMzk7ZCBleHBlY3QuIFRoZSB0aXRsZSB3aWxsIGJlIHByb3Blcmx5IHNldCwgYW5kIGEgPGNvZGU+Jmx0O21haW4mZ3Q7PC9jb2RlPiBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgY29udGVudHMgb2YgeW91ciB2aWV3LjwvcD5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL0xnWlJGbjUucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBhcHBsaWNhdGlvbiBydW5uaW5nIG9uIEdvb2dsZSBDaHJvbWVcXFwiPjwvcD5cXG48cD5UaGF0JiMzOTtzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJiMzOTtzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIDxjb2RlPm5leHQ8L2NvZGU+IHRvIHJlbmRlciB0aGUgdmlldy48L3A+XFxuPHA+VGhlbiB0aGVyZSYjMzk7cyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCYjMzk7cyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9oMT5cXG48cD5Zb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmNoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLjwvcD5cXG48cD5UaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIDxlbT5vciBpZiBpdCBoYXNuJiMzOTt0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzPC9lbT4sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS48L3A+XFxuPHA+U2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSYjMzk7bGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbiYjMzk7cyB3aXJpbmcgPGVtPih0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKTwvZW0+IGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UmIzM5O2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQmIzM5O3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLjwvcD5cXG48cD5BcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UmIzM5O2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2g0PlxcbjxwPlRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCA8Y29kZT5qYWR1bTwvY29kZT4gZWFybGllciwgd2UmIzM5O2xsIGluc3RhbGwgdGhlIDxjb2RlPnRhdW51czwvY29kZT4gQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgLS1nbG9iYWwgdGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJlZm9yZSB5b3UgY2FuIHVzZSB0aGUgQ0xJLCB5b3Ugc2hvdWxkIG1vdmUgdGhlIHJvdXRlIGRlZmluaXRpb25zIHRvIDxjb2RlPmNvbnRyb2xsZXJzL3JvdXRlcy5qczwvY29kZT4uIFRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgdGhlbSB0byBiZS4gSWYgeW91IHdhbnQgdG8gcGxhY2UgdGhlbSBzb21ldGhpbmcgZWxzZSwgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uIGNhbiBoZWxwIHlvdTwvYT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm12IHJvdXRlcy5qcyBjb250cm9sbGVycy9yb3V0ZXMuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2UgeW91IG1vdmVkIHRoZSByb3V0ZXMgeW91IHNob3VsZCBhbHNvIHVwZGF0ZSB0aGUgPGNvZGU+cmVxdWlyZTwvY29kZT4gc3RhdGVtZW50IGluIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0JiMzOTtsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcuIEluIHR5cGljYWwgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb248L2E+IGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIDxjb2RlPi5iaW4vdmlld3M8L2NvZGU+IGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4sIGJ1dCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24mIzM5O3QgbWVldCB5b3VyIG5lZWRzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXRcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LmJpbi93aXJpbmcuanM8L2NvZGU+IGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIDxjb2RlPnRhdW51czwvY29kZT4gaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCYjMzk7cyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspLFxcbiAgJiMzOTtsYXlvdXQmIzM5OzogcmVxdWlyZSgmIzM5Oy4vdmlld3MvbGF5b3V0LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxufTtcXG5cXG52YXIgcm91dGVzID0ge1xcbiAgJiMzOTsvJiMzOTs6IHtcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbn07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9mSm5IZFlpLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYHRhdW51c2Agb3V0cHV0XFxcIj48L3A+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5jb250cm9sbGVyczwvY29kZT4gb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJiMzOTt0IGNyZWF0ZWQgYW55IDxlbT5jbGllbnQtc2lkZSBjb250cm9sbGVyczwvZW0+IHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJiMzOTt0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC48L3A+XFxuPHA+VGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCwgeW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoaXMgZmlsZSB3aGVuZXZlciB5b3UgYWRkLCBjaGFuZ2UsIG9yIHJlbW92ZSBhIHZpZXcsIGEgY2xpZW50LXNpZGUgY29udHJvbGxlciwgb3IgYSByb3V0ZS4gRG9pbmcgdGhhdCB3b3VsZCBiZSBjdW1iZXJzb21lLCBhbmQgdGhlIENMSSBzb2x2ZXMgdGhhdCBwcm9ibGVtIGZvciB1cyBhdCB0aGUgZXhwZW5zZSBvZiBvbmUgYWRkaXRpb25hbCBidWlsZCBzdGVwLjwvcD5cXG48cD5EdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIDxjb2RlPi0td2F0Y2g8L2NvZGU+IGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG48L2NvZGU+PC9wcmU+XFxuPHA+SWYgeW91JiMzOTtyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91JiMzOTtsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgPGNvZGU+aGFwaWlmeTwvY29kZT4gdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXJcXFwiPkJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvaDQ+XFxuPHA+T25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIDxjb2RlPmNsaWVudC9qczwvY29kZT4gdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0JiMzOTtzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgY2xpZW50L2pzXFxudG91Y2ggY2xpZW50L2pzL21haW4uanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPm1haW48L2NvZGU+IG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIDxlbT5lbnRyeSBwb2ludDwvZW0+IG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSYjMzk7bGwgbmVlZCB0byBpbXBvcnQgPGNvZGU+dGF1bnVzPC9jb2RlPiwgdGhlIHdpcmluZyBtb2R1bGUgd2UmIzM5O3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgd2lyaW5nID0gcmVxdWlyZSgmIzM5Oy4uLy4uLy5iaW4vd2lyaW5nJiMzOTspO1xcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJiMzOTttYWluJiMzOTspWzBdO1xcblxcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLjwvcD5cXG48cD5CeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbiYjMzk7dCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuPC9wPlxcbjxwPkFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIDxlbT50eXBpY2FsbHkgbGFyZ2VyPC9lbT4gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS48L3A+XFxuPHA+QSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCYjMzk7cyBoYXJkZXIgdG8gc2V0IHVwLjwvcD5cXG48cD5UaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj50aGUgb3B0aW1pemF0aW9uIGd1aWRlPC9hPi4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgPGVtPig8Y29kZT4mIzM5O2F1dG8mIzM5OzwvY29kZT4pPC9lbT4gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCYjMzk7cyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+LCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+LCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by48L3A+XFxuPHA+VGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSYjMzk7cmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCYjMzk7cyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJiMzOTt2ZSBiZWVuIGJ1aWxkaW5nLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZVxcbnRvdWNoIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJiMzOTtsbCBqdXN0IHByaW50IHRoZSBhY3Rpb24gYW5kIHRoZSBtb2RlbCB0byB0aGUgY29uc29sZS4gSWYgdGhlcmUmIzM5O3Mgb25lIHBsYWNlIHdoZXJlIHlvdSYjMzk7ZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCwgY29udGFpbmVyLCByb3V0ZSkge1xcbiAgY29uc29sZS5sb2coJiMzOTtSZW5kZXJlZCB2aWV3ICVzIHVzaW5nIG1vZGVsOlxcXFxuJXMmIzM5Oywgcm91dGUuYWN0aW9uLCBKU09OLnN0cmluZ2lmeShtb2RlbCwgbnVsbCwgMikpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlIHdlcmVuJiMzOTt0IHVzaW5nIHRoZSA8Y29kZT4tLXdhdGNoPC9jb2RlPiBmbGFnIGZyb20gdGhlIFRhdW51cyBDTEksIHlvdSYjMzk7bGwgaGF2ZSB0byByZWNvbXBpbGUgdGhlIHdpcmluZyBhdCB0aGlzIHBvaW50LCBzbyB0aGF0IHRoZSBjb250cm9sbGVyIGdldHMgYWRkZWQgdG8gdGhhdCBtYW5pZmVzdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9mIGNvdXJzZSwgeW91JiMzOTtsbCBub3cgaGF2ZSB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IHVzaW5nIDxhIGhyZWY9XFxcImh0dHA6Ly9icm93c2VyaWZ5Lm9yZy9cXFwiPkJyb3dzZXJpZnk8L2E+ITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNvbXBpbGluZy15b3VyLWNsaWVudC1zaWRlLWphdmFzY3JpcHRcXFwiPkNvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQ8L2g0PlxcbjxwPllvdSYjMzk7bGwgbmVlZCB0byBjb21waWxlIHRoZSA8Y29kZT5jbGllbnQvanMvbWFpbi5qczwvY29kZT4gbW9kdWxlLCBvdXIgY2xpZW50LXNpZGUgYXBwbGljYXRpb24mIzM5O3MgZW50cnkgcG9pbnQsIHVzaW5nIEJyb3dzZXJpZnkgc2luY2UgdGhlIGNvZGUgaXMgd3JpdHRlbiB1c2luZyBDb21tb25KUy4gSW4gdGhpcyBleGFtcGxlIHlvdSYjMzk7bGwgaW5zdGFsbCA8Y29kZT5icm93c2VyaWZ5PC9jb2RlPiBnbG9iYWxseSB0byBjb21waWxlIHRoZSBjb2RlLCBidXQgbmF0dXJhbGx5IHlvdSYjMzk7bGwgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4gd29ya2luZyBvbiBhIHJlYWwtd29ybGQgYXBwbGljYXRpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC0tZ2xvYmFsIGJyb3dzZXJpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+T25jZSB5b3UgaGF2ZSB0aGUgQnJvd3NlcmlmeSBDTEksIHlvdSYjMzk7bGwgYmUgYWJsZSB0byBjb21waWxlIHRoZSBjb2RlIHJpZ2h0IGZyb20geW91ciBjb21tYW5kIGxpbmUuIFRoZSA8Y29kZT4tZDwvY29kZT4gZmxhZyB0ZWxscyBCcm93c2VyaWZ5IHRvIGFkZCBhbiBpbmxpbmUgc291cmNlIG1hcCBpbnRvIHRoZSBjb21waWxlZCBidW5kbGUsIG1ha2luZyBkZWJ1Z2dpbmcgZWFzaWVyIGZvciB1cy4gVGhlIDxjb2RlPi1vPC9jb2RlPiBmbGFnIHJlZGlyZWN0cyBvdXRwdXQgdG8gdGhlIGluZGljYXRlZCBmaWxlLCB3aGVyZWFzIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCB0byBzdGFuZGFyZCBvdXRwdXQgYnkgZGVmYXVsdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgLmJpbi9wdWJsaWMvanNcXG5icm93c2VyaWZ5IGNsaWVudC9qcy9tYWluLmpzIC1kbyAuYmluL3B1YmxpYy9qcy9hbGwuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+V2UgaGF2ZW4mIzM5O3QgZG9uZSBtdWNoIG9mIGFueXRoaW5nIHdpdGggdGhlIEV4cHJlc3MgYXBwbGljYXRpb24sIHNvIHlvdSYjMzk7bGwgbmVlZCB0byBhZGp1c3QgdGhlIDxjb2RlPmFwcC5qczwvY29kZT4gbW9kdWxlIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMuIElmIHlvdSYjMzk7cmUgdXNlZCB0byBFeHByZXNzLCB5b3UmIzM5O2xsIG5vdGljZSB0aGVyZSYjMzk7cyBub3RoaW5nIHNwZWNpYWwgYWJvdXQgaG93IHdlJiMzOTtyZSB1c2luZyA8Y29kZT5zZXJ2ZS1zdGF0aWM8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLXNhdmUgc2VydmUtc3RhdGljXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxldCYjMzk7cyBjb25maWd1cmUgdGhlIGFwcGxpY2F0aW9uIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMgZnJvbSA8Y29kZT4uYmluL3B1YmxpYzwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIHNlcnZlU3RhdGljID0gcmVxdWlyZSgmIzM5O3NlcnZlLXN0YXRpYyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG5hcHAudXNlKHNlcnZlU3RhdGljKCYjMzk7LmJpbi9wdWJsaWMmIzM5OykpO1xcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgdXAsIHlvdSYjMzk7bGwgaGF2ZSB0byBlZGl0IHRoZSBsYXlvdXQgdG8gaW5jbHVkZSB0aGUgY29tcGlsZWQgSmF2YVNjcmlwdCBidW5kbGUgZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj50aXRsZT1tb2RlbC50aXRsZVxcbm1haW4hPXBhcnRpYWxcXG5zY3JpcHQoc3JjPSYjMzk7L2pzL2FsbC5qcyYjMzk7KVxcbjwvY29kZT48L3ByZT5cXG48cD5MYXN0bHksIHlvdSBjYW4gZXhlY3V0ZSB0aGUgYXBwbGljYXRpb24gYW5kIHNlZSBpdCBpbiBhY3Rpb24hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vNjhPODR3WC5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+SWYgeW91IG9wZW4gdGhlIGFwcGxpY2F0aW9uIG9uIGEgd2ViIGJyb3dzZXIsIHlvdSYjMzk7bGwgbm90aWNlIHRoYXQgdGhlIGFwcHJvcHJpYXRlIGluZm9ybWF0aW9uIHdpbGwgYmUgbG9nZ2VkIGludG8gdGhlIGRldmVsb3BlciA8Y29kZT5jb25zb2xlPC9jb2RlPi48L3A+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9aVUY2TkZsLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggdGhlIGFwcGxpY2F0aW9uIHJ1bm5pbmcgdW5kZXIgR29vZ2xlIENocm9tZVxcXCI+PC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9oND5cXG48cD5UYXVudXMgZG9lcyBwcm92aWRlIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmEgdGhpbiBBUEk8L2E+IGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSYjMzk7cyBhIGZldyBtZXRob2RzIHlvdSBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygb24gYSBnbG9iYWwgc2NhbGUgYXMgd2VsbC48L3A+XFxuPHA+VGF1bnVzIGNhbiBub3RpZnkgeW91IHdoZW5ldmVyIGltcG9ydGFudCBldmVudHMgb2NjdXIuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5FdmVudDwvdGg+XFxuPHRoPkFyZ3VtZW50czwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5zdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZG9uZSYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBkYXRhPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5hYm9ydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5lcnJvciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBlcnI8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5CZXNpZGVzIGV2ZW50cywgdGhlcmUmIzM5O3MgYSBjb3VwbGUgbW9yZSBtZXRob2RzIHlvdSBjYW4gdXNlLiBUaGUgPGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPiBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJiMzOTtzIDxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPiwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCYjMzk7bGwgdGhlbiBpbnZva2UgaXRzIGNvbnRyb2xsZXIuIFlvdSYjMzk7bGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guPC9wPlxcbjxwPkFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmdcXFwiPkNhY2hpbmcgYW5kIFByZWZldGNoaW5nPC9oND5cXG48cD48YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlPC9hPiBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQmIzM5O3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/PC9wPlxcbjxwPldoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIDxjb2RlPnsgY2FjaGU6IHRydWUgfTwvY29kZT4gYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiwgdGhlIGNhY2hpbmcgbGF5ZXIgd2lsbCBtYWtlIHN1cmUgdGhhdCByZXNwb25zZXMgYXJlIGtlcHQgYXJvdW5kIGZvciA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0JiMzOTtsbCBmaXJzdCBhc2sgdGhlIGNhY2hpbmcgbGF5ZXIgZm9yIGEgZnJlc2ggY29weS4gSWYgdGhlIGNhY2hpbmcgbGF5ZXIgZG9lc24mIzM5O3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSA8ZW0+KGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcyk8L2VtPiwgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gYSBudW1iZXIgaW4gc2Vjb25kcyBpbnN0ZWFkIG9mIGp1c3QgPGNvZGU+dHJ1ZTwvY29kZT4uPC9wPlxcbjxwPlNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UmIzM5O3JlIGFsc28gYWJsZSB0byBzZXQgYSA8Y29kZT5jYWNoZTwvY29kZT4gZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgPGNvZGU+Y2FjaGU8L2NvZGU+IHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+SW5kZXhlZERCPC9hPiBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIDxjb2RlPmxvY2FsU3RvcmFnZTwvY29kZT4uIEl0IGhhcyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5zdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0PC9hPiwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCYjMzk7cyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuPC9wPlxcbjxwPlRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSA8ZW0+KHRoZSA8Y29kZT50b3VjaHN0YXJ0PC9jb2RlPiBldmVudCk8L2VtPiwgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuPC9wPlxcbjxwPklmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgPGVtPihwb3NzaWJseSBsaW1pdGVkKTwvZW0+IEludGVybmV0IGNvbm5lY3Rpb24gYmFuZHdpZHRoLjwvcD5cXG48cD5JZiB0aGUgaHVtYW4gY2xpY2tzIG9uIHRoZSBsaW5rIGJlZm9yZSBwcmVmZXRjaGluZyBpcyBjb21wbGV0ZWQsIGhlJiMzOTtsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuPC9wPlxcbjxwPlR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgPGNvZGU+cHJlZmV0Y2g8L2NvZGU+IHRvIDxjb2RlPnRydWU8L2NvZGU+IGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlIE9wdGltaXphdGlvbnM8L2E+IGd1aWRlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2g0PlxcbjxwPldoZW4geW91IGFsdGVyIHlvdXIgdmlld3MsIGNoYW5nZSBjb250cm9sbGVycywgb3IgbW9kaWZ5IHRoZSBtb2RlbHMsIGNoYW5jZXMgYXJlIHRoZSBjbGllbnQtc2lkZSBpcyBnb2luZyB0byBjb21lIGFjcm9zcyBvbmUgb2YgdGhlIGZvbGxvd2luZyBpc3N1ZXMuPC9wPlxcbjx1bD5cXG48bGk+T3V0ZGF0ZWQgdmlldyB0ZW1wbGF0ZSBmdW5jdGlvbnMgaW4gdGhlIGNsaWVudC1zaWRlLCBjYXVzaW5nIG5ldyBtb2RlbHMgdG8gYnJlYWs8L2xpPlxcbjxsaT5PdXRkYXRlZCBjbGllbnQtc2lkZSBjb250cm9sbGVycywgY2F1c2luZyBuZXcgbW9kZWxzIHRvIGJyZWFrIG9yIG1pc3Mgb3V0IG9uIGZ1bmN0aW9uYWxpdHk8L2xpPlxcbjxsaT5PdXRkYXRlZCBtb2RlbHMgaW4gdGhlIGNhY2hlLCBjYXVzaW5nIG5ldyB2aWV3cyBvciBjb250cm9sbGVycyB0byBicmVhazwvbGk+XFxuPC91bD5cXG48cD5UaGUgdmVyc2lvbmluZyBBUEkgaGFuZGxlcyB0aGVzZSBpc3N1ZXMgZ3JhY2VmdWxseSBvbiB5b3VyIGJlaGFsZi4gVGhlIHdheSBpdCB3b3JrcyBpcyB0aGF0IHdoZW5ldmVyIHlvdSBnZXQgYSByZXNwb25zZSBmcm9tIFRhdW51cywgYSA8ZW0+dmVyc2lvbiBzdHJpbmcgKGNvbmZpZ3VyZWQgb24gdGhlIHNlcnZlci1zaWRlKTwvZW0+IGlzIGluY2x1ZGVkIHdpdGggaXQuIElmIHRoYXQgdmVyc2lvbiBzdHJpbmcgZG9lc24mIzM5O3QgbWF0Y2ggdGhlIG9uZSBzdG9yZWQgaW4gdGhlIGNsaWVudCwgdGhlbiB0aGUgY2FjaGUgd2lsbCBiZSBmbHVzaGVkIGFuZCB0aGUgaHVtYW4gd2lsbCBiZSByZWRpcmVjdGVkLCBmb3JjaW5nIGEgZnVsbCBwYWdlIHJlbG9hZC48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+VGhlIHZlcnNpb25pbmcgQVBJIGlzIHVuYWJsZSB0byBoYW5kbGUgY2hhbmdlcyB0byByb3V0ZXMsIGFuZCBpdCYjMzk7cyB1cCB0byB5b3UgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIGFwcGxpY2F0aW9uIHN0YXlzIGJhY2t3YXJkcyBjb21wYXRpYmxlIHdoZW4gaXQgY29tZXMgdG8gcm91dGluZy48L3A+XFxuPHA+VGhlIHZlcnNpb25pbmcgQVBJIGNhbiYjMzk7dCBpbnRlcnZlbmUgd2hlbiB0aGUgY2xpZW50LXNpZGUgaXMgaGVhdmlseSByZWx5aW5nIG9uIGNhY2hlZCB2aWV3cyBhbmQgbW9kZWxzLCBhbmQgdGhlIGh1bWFuIGlzIHJlZnVzaW5nIHRvIHJlbG9hZCB0aGVpciBicm93c2VyLiBUaGUgc2VydmVyIGlzbiYjMzk7dCBiZWluZyBhY2Nlc3NlZCBhbmQgdGh1cyBpdCBjYW4mIzM5O3QgY29tbXVuaWNhdGUgdGhhdCBldmVyeXRoaW5nIG9uIHRoZSBjYWNoZSBtYXkgaGF2ZSBiZWNvbWUgc3RhbGUuIFRoZSBnb29kIG5ld3MgaXMgdGhhdCB0aGUgaHVtYW4gd29uJiMzOTt0IG5vdGljZSBhbnkgb2RkaXRpZXMsIGFzIHRoZSBzaXRlIHdpbGwgY29udGludWUgdG8gd29yayBhcyBoZSBrbm93cyBpdC4gV2hlbiBoZSBmaW5hbGx5IGF0dGVtcHRzIHRvIHZpc2l0IHNvbWV0aGluZyB0aGF0IGlzbiYjMzk7dCBjYWNoZWQsIGEgcmVxdWVzdCBpcyBtYWRlLCBhbmQgdGhlIHZlcnNpb25pbmcgZW5naW5lIHJlc29sdmVzIHZlcnNpb24gZGlzY3JlcGFuY2llcyBmb3IgdGhlbS48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPk1ha2luZyB1c2Ugb2YgdGhlIHZlcnNpb25pbmcgQVBJIGludm9sdmVzIHNldHRpbmcgdGhlIDxjb2RlPnZlcnNpb248L2NvZGU+IGZpZWxkIGluIHRoZSBvcHRpb25zLCB3aGVuIGludm9raW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gPHN0cm9uZz5vbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLCB1c2luZyB0aGUgc2FtZSB2YWx1ZTwvc3Ryb25nPi4gVGhlIFRhdW51cyB2ZXJzaW9uIHN0cmluZyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBvbmUgeW91IHByb3ZpZGVkLCBzbyB0aGF0IFRhdW51cyB3aWxsIGtub3cgdG8gc3RheSBhbGVydCBmb3IgY2hhbmdlcyB0byBUYXVudXMgaXRzZWxmLCBhcyB3ZWxsLjwvcD5cXG48cD5Zb3UgbWF5IHVzZSB5b3VyIGJ1aWxkIGlkZW50aWZpZXIgb3IgdGhlIDxjb2RlPnZlcnNpb248L2NvZGU+IGZpZWxkIGluIDxjb2RlPnBhY2thZ2UuanNvbjwvY29kZT4sIGJ1dCB1bmRlcnN0YW5kIHRoYXQgaXQgbWF5IGNhdXNlIHRoZSBjbGllbnQtc2lkZSB0byBmbHVzaCB0aGUgY2FjaGUgdG9vIG9mdGVuIDxlbT4obWF5YmUgZXZlbiBvbiBldmVyeSBkZXBsb3ltZW50KTwvZW0+LjwvcD5cXG48cD5UaGUgZGVmYXVsdCB2ZXJzaW9uIHN0cmluZyBpcyBzZXQgdG8gPGNvZGU+MTwvY29kZT4uIFRoZSBUYXVudXMgdmVyc2lvbiB3aWxsIGJlIHByZXBlbmRlZCB0byB5b3VycywgcmVzdWx0aW5nIGluIGEgdmFsdWUgc3VjaCBhcyA8Y29kZT50My4wLjA7djE8L2NvZGU+IHdoZXJlIFRhdW51cyBpcyBydW5uaW5nIHZlcnNpb24gPGNvZGU+My4wLjA8L2NvZGU+IGFuZCB5b3VyIGFwcGxpY2F0aW9uIGlzIHJ1bm5pbmcgdmVyc2lvbiA8Y29kZT4xPC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvaDE+XFxuPHA+WW91JiMzOTtyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4mIzM5O3Qgc3RvcCB0aGVyZS48L3A+XFxuPHVsPlxcbjxsaT5MZWFybiBtb3JlIGFib3V0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgVGF1bnVzIGhhczwvYT4gdG8gb2ZmZXI8L2xpPlxcbjxsaT5HbyB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPnBlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzPC9hPi4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3ITwvbGk+XFxuPGxpPjxlbT5GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50PC9lbT48dWw+XFxuPGxpPkplcmVteSBLZWl0aCBlbnVuY2lhdGVzIDxhIGhyZWY9XFxcImh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxcIj4mcXVvdDtCZSBwcm9ncmVzc2l2ZSZxdW90OzwvYT48L2xpPlxcbjxsaT5DaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciA8YSBocmVmPVxcXCJodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcXCI+JnF1b3Q7UHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyA8YSBocmVmPVxcXCJodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxcIj4mcXVvdDtQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXImcXVvdDs8L2E+PC9saT5cXG48bGk+SSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+JnF1b3Q7U3RvcCBCcmVha2luZyB0aGUgV2ViJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9yYXVjaGcuY29tLzIwMTQvNy1wcmluY2lwbGVzLW9mLXJpY2gtd2ViLWFwcGxpY2F0aW9ucy9cXFwiPiZxdW90OzcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnMmcXVvdDs8L2E+PC9saT5cXG48bGk+QWFyb24gR3VzdGFmc29uIHdyaXRlcyA8YSBocmVmPVxcXCJodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcXCI+JnF1b3Q7VW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudCZxdW90OzwvYT48L2xpPlxcbjxsaT5PcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIDxhIGhyZWY9XFxcImh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2UmcXVvdDs8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlNpZnQgdGhyb3VnaCB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXM8L2E+LiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJiMzOTt0IHRob3VnaHQgb2YhPC9saT5cXG48L3VsPlxcbjxwPkFsc28sIGdldCBpbnZvbHZlZCE8L3A+XFxuPHVsPlxcbjxsaT5Gb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW8vcHVsbHNcXFwiPnNlbmQgc29tZSBwdWxsIHJlcXVlc3RzPC9hPiB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyE8L2xpPlxcbjxsaT5TZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxcIj5wbGVhc2UgY3JlYXRlIGFuIGlzc3VlPC9hPiE8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+WW91JiMzOTtsbCBmaW5kIGEgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9nZXR0aW5nLXN0YXJ0ZWRcXFwiPmZ1bGwgZmxlZGdlZCB2ZXJzaW9uIG9mIHRoZSBHZXR0aW5nIFN0YXJ0ZWQ8L2E+IHR1dG9yaWFsIGFwcGxpY2F0aW9uIG9uIEdpdEh1Yi48L3A+XFxuPC9ibG9ja3F1b3RlPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgR2V0dGluZyBTdGFydGVkXFxuXFxuICAgIFRhdW51cyBpcyBhIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZSBmb3IgTm9kZS5qcywgYW5kIGl0J3MgX3VwIHRvIHlvdSBob3cgdG8gdXNlIGl0Xy4gSW4gZmFjdCwgaXQgbWlnaHQgYmUgYSBnb29kIGlkZWEgZm9yIHlvdSB0byAqKnNldCB1cCBqdXN0IHRoZSBzZXJ2ZXItc2lkZSBhc3BlY3QgZmlyc3QqKiwgYXMgdGhhdCdsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC5cXG5cXG4gICAgIyBUYWJsZSBvZiBDb250ZW50c1xcblxcbiAgICAtIFtIb3cgaXQgd29ya3NdKCNob3ctaXQtd29ya3MpXFxuICAgIC0gW0luc3RhbGxpbmcgVGF1bnVzXSgjaW5zdGFsbGluZy10YXVudXMpXFxuICAgIC0gW1NldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlXSgjc2V0dGluZy11cC10aGUtc2VydmVyLXNpZGUpXFxuICAgICAgLSBbWW91ciBmaXJzdCByb3V0ZV0oI3lvdXItZmlyc3Qtcm91dGUpXFxuICAgICAgLSBbQ3JlYXRpbmcgYSBsYXlvdXRdKCNjcmVhdGluZy1hLWxheW91dClcXG4gICAgICAtIFtVc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmVdKCN1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmUpXFxuICAgICAgLSBbVGhyb3dpbmcgaW4gYSBjb250cm9sbGVyXSgjdGhyb3dpbmctaW4tYS1jb250cm9sbGVyKVxcbiAgICAtIFtUYXVudXMgaW4gdGhlIGNsaWVudF0oI3RhdW51cy1pbi10aGUtY2xpZW50KVxcbiAgICAgIC0gW1VzaW5nIHRoZSBUYXVudXMgQ0xJXSgjdXNpbmctdGhlLXRhdW51cy1jbGkpXFxuICAgICAgLSBbQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXSgjYm9vdGluZy11cC10aGUtY2xpZW50LXNpZGUtcm91dGVyKVxcbiAgICAgIC0gW0FkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcl0oI2FkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlcilcXG4gICAgICAtIFtDb21waWxpbmcgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0XSgjY29tcGlsaW5nLXlvdXItY2xpZW50LXNpZGUtamF2YXNjcmlwdClcXG4gICAgICAtIFtVc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSV0oI3VzaW5nLXRoZS1jbGllbnQtc2lkZS10YXVudXMtYXBpKVxcbiAgICAgIC0gW0NhY2hpbmcgYW5kIFByZWZldGNoaW5nXSgjY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmcpXFxuICAgICAgLSBbVmVyc2lvbmluZ10oI3ZlcnNpb25pbmcpXFxuICAgIC0gW1RoZSBza3kgaXMgdGhlIGxpbWl0IV0oI3RoZS1za3ktaXMtdGhlLWxpbWl0LSlcXG5cXG4gICAgIyBIb3cgaXQgd29ya3NcXG5cXG4gICAgVGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0ICoqcHJvdmVuKiogc2V0IG9mIHJ1bGVzLlxcblxcbiAgICAtIERlZmluZSBhIGBmdW5jdGlvbihtb2RlbClgIGZvciBlYWNoIHlvdXIgdmlld3NcXG4gICAgLSBQdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50XFxuICAgIC0gRGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvblxcbiAgICAtIFB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50XFxuICAgIC0gRW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzXFxuICAgIC0gQ3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzXFxuICAgIC0gQ3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3XFxuICAgIC0gRm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZVxcbiAgICAtIFdoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhXFxuICAgIC0gT25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgKipoaWphY2sgbGluayBjbGlja3MqKiBhbmQgbWFrZSBBSkFYIHJlcXVlc3RzIGluc3RlYWRcXG4gICAgLSBXaGVuIHlvdSBnZXQgdGhlIEpTT04gbW9kZWwgYmFjaywgcmVuZGVyIHZpZXdzIG9uIHRoZSBjbGllbnQtc2lkZVxcbiAgICAtIElmIHRoZSBgaGlzdG9yeWAgQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gKipEb24ndCBjb25mdXNlIHlvdXIgaHVtYW5zIHdpdGggb2JzY3VyZSBoYXNoIHJvdXRlcnMhKipcXG5cXG4gICAgSSdsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJ2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIHN0ZXBzIHlvdSBuZWVkIHRvIHRha2UgaW4gb3JkZXIgdG8gbWFrZSB0aGlzIGZsb3cgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIEluc3RhbGxpbmcgVGF1bnVzXFxuXFxuICAgIEZpcnN0IG9mZiwgeW91J2xsIG5lZWQgdG8gY2hvb3NlIGEgSFRUUCBzZXJ2ZXIgZnJhbWV3b3JrIGZvciB5b3VyIGFwcGxpY2F0aW9uLiBBdCB0aGUgbW9tZW50IFRhdW51cyBzdXBwb3J0cyBvbmx5IGEgY291cGxlIG9mIEhUVFAgZnJhbWV3b3JrcywgYnV0IG1vcmUgbWF5IGJlIGFkZGVkIGlmIHRoZXkgYXJlIHBvcHVsYXIgZW5vdWdoLlxcblxcbiAgICAtIFtFeHByZXNzXVs2XSwgdGhyb3VnaCBbdGF1bnVzLWV4cHJlc3NdWzFdXFxuICAgIC0gW0hhcGldWzddLCB0aHJvdWdoIFt0YXVudXMtaGFwaV1bMl0gYW5kIHRoZSBbaGFwaWlmeV1bM10gdHJhbnNmb3JtXFxuXFxuICAgID4gSWYgeW91J3JlIG1vcmUgb2YgYSBfXFxcInJ1bW1hZ2UgdGhyb3VnaCBzb21lb25lIGVsc2UncyBjb2RlXFxcIl8gdHlwZSBvZiBkZXZlbG9wZXIsIHlvdSBtYXkgZmVlbCBjb21mb3J0YWJsZSBbZ29pbmcgdGhyb3VnaCB0aGlzIHdlYnNpdGUncyBzb3VyY2UgY29kZV1bNF0sIHdoaWNoIHVzZXMgdGhlIFtIYXBpXVs3XSBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIFtwb255Zm9vLmNvbV1bNV0sIHdoaWNoIGlzICoqYSBtb3JlIGFkdmFuY2VkIHVzZS1jYXNlKiogdW5kZXIgdGhlIFtFeHByZXNzXVs2XSBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0J3Mgb2theSB0b28uXFxuXFxuICAgIE9uY2UgeW91J3ZlIHNldHRsZWQgZm9yIGVpdGhlciBbRXhwcmVzc11bNl0gb3IgW0hhcGldWzddIHlvdSdsbCBiZSBhYmxlIHRvIHByb2NlZWQuIEZvciB0aGUgcHVycG9zZXMgb2YgdGhpcyBndWlkZSwgd2UnbGwgdXNlIFtFeHByZXNzXVs2XS4gU3dpdGNoaW5nIGJldHdlZW4gb25lIG9mIHRoZSBkaWZmZXJlbnQgSFRUUCBmbGF2b3JzIGlzIHN0cmlraW5nbHkgZWFzeSwgdGhvdWdoLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlXFxuXFxuICAgIE5hdHVyYWxseSwgeW91J2xsIG5lZWQgdG8gaW5zdGFsbCBhbGwgb2YgdGhlIGZvbGxvd2luZyBtb2R1bGVzIGZyb20gYG5wbWAgdG8gZ2V0IHN0YXJ0ZWQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIGdldHRpbmctc3RhcnRlZFxcbiAgICBjZCBnZXR0aW5nLXN0YXJ0ZWRcXG4gICAgbnBtIGluaXRcXG4gICAgbnBtIGluc3RhbGwgLS1zYXZlIHRhdW51cyB0YXVudXMtZXhwcmVzcyBleHByZXNzXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbnBtIGluaXRgIG91dHB1dF1bMzBdXFxuXFxuICAgIExldCdzIGJ1aWxkIG91ciBhcHBsaWNhdGlvbiBzdGVwLWJ5LXN0ZXAsIGFuZCBJJ2xsIHdhbGsgeW91IHRocm91Z2ggdGhlbSBhcyB3ZSBnbyBhbG9uZy4gRmlyc3Qgb2YgYWxsLCB5b3UnbGwgbmVlZCB0aGUgZmFtb3VzIGBhcHAuanNgIGZpbGUuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGFwcC5qc1xcbiAgICBgYGBcXG5cXG4gICAgSXQncyBwcm9iYWJseSBhIGdvb2QgaWRlYSB0byBwdXQgc29tZXRoaW5nIGluIHlvdXIgYGFwcC5qc2AgZmlsZSwgbGV0J3MgZG8gdGhhdCBub3cuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHt9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIEFsbCBgdGF1bnVzLWV4cHJlc3NgIHJlYWxseSBkb2VzIGlzIGFkZCBhIGJ1bmNoIG9mIHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgYGFwcGAuIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgYHRhdW51c0V4cHJlc3NgIGludm9jYXRpb24uIFlvdSdsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIF9cXFwiTm90IEZvdW5kXFxcIl8gdmlldywgYmxvY2tpbmcgYW55IHJvdXRpbmcgYmV5b25kIHRoYXQgcm91dGUuXFxuXFxuICAgIElmIHlvdSB3ZXJlIHRvIHJ1biB0aGUgYXBwbGljYXRpb24gbm93IHlvdSB3b3VsZCBnZXQgYSBmcmllbmRseSByZW1pbmVkIGZyb20gVGF1bnVzIGxldHRpbmcgeW91IGtub3cgdGhhdCB5b3UgZm9yZ290IHRvIGRlY2xhcmUgYW55IHZpZXcgcm91dGVzLiBTaWxseSB5b3UhXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzFdXFxuXFxuICAgIFRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCB0byBgdGF1bnVzRXhwcmVzc2AgbGV0J3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQncyBkaXNjdXNzIHdoYXQgbWF0dGVyczogdGhlIF9yZXF1aXJlZCBjb25maWd1cmF0aW9uXy4gVGhlcmUncyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS5cXG5cXG4gICAgLSBgcm91dGVzYCBzaG91bGQgYmUgYW4gYXJyYXkgb2YgdmlldyByb3V0ZXNcXG4gICAgLSBgbGF5b3V0YCBzaG91bGQgYmUgYSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgc2luZ2xlIGBtb2RlbGAgYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnRcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBZb3VyIGZpcnN0IHJvdXRlXFxuXFxuICAgIFJvdXRlcyBuZWVkIHRvIGJlIHBsYWNlZCBpbiBpdHMgb3duIGRlZGljYXRlZCBtb2R1bGUsIHNvIHRoYXQgeW91IGNhbiByZXVzZSBpdCBsYXRlciBvbiAqKndoZW4gc2V0dGluZyB1cCBjbGllbnQtc2lkZSByb3V0aW5nKiouIExldCdzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIHJvdXRlcy5qc1xcbiAgICBgYGBcXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IFtcXG4gICAgICB7IHJvdXRlOiAnLycsIGFjdGlvbjogJ2hvbWUvaW5kZXgnIH1cXG4gICAgXTtcXG4gICAgYGBgXFxuXFxuICAgIEVhY2ggaXRlbSBpbiB0aGUgZXhwb3J0ZWQgYXJyYXkgaXMgYSByb3V0ZS4gSW4gdGhpcyBjYXNlLCB3ZSBvbmx5IGhhdmUgdGhlIGAvYCByb3V0ZSB3aXRoIHRoZSBgaG9tZS9pbmRleGAgYWN0aW9uLiBUYXVudXMgZm9sbG93cyB0aGUgd2VsbCBrbm93biBbY29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb24gcGF0dGVybl1bOF0sIHdoaWNoIG1hZGUgW1J1Ynkgb24gUmFpbHNdWzldIGZhbW91cy4gX01heWJlIG9uZSBkYXkgVGF1bnVzIHdpbGwgYmUgZmFtb3VzIHRvbyFfIEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSBgaG9tZS9pbmRleGAgYWN0aW9uIHVzZXMgdGhlIGBob21lL2luZGV4YCBjb250cm9sbGVyIGFuZCByZW5kZXJzIHRoZSBgaG9tZS9pbmRleGAgdmlldy4gT2YgY291cnNlLCBfYWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbl8uXFxuXFxuICAgIFRpbWUgdG8gZ28gYmFjayB0byBgYXBwLmpzYCBhbmQgdXBkYXRlIHRoZSBgb3B0aW9uc2Agb2JqZWN0LlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL3JvdXRlcycpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgSXQncyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIF8obW9yZSBvbiB0aGF0IFtpbiB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSwgYnV0IGl0IGRlZmF1bHRzIHRvIGB7fWApXy5cXG5cXG4gICAgSGVyZSdzIHdoYXQgeW91J2QgZ2V0IGlmIHlvdSBhdHRlbXB0ZWQgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcCAmXFxuICAgIGN1cmwgbG9jYWxob3N0OjMwMDBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgcmVzdWx0c11bMzJdXFxuXFxuICAgIFR1cm5zIG91dCB5b3UncmUgbWlzc2luZyBhIGxvdCBvZiB0aGluZ3MhIFRhdW51cyBpcyBxdWl0ZSBsZW5pZW50IGFuZCBpdCdsbCB0cnkgaXRzIGJlc3QgdG8gbGV0IHlvdSBrbm93IHdoYXQgeW91IG1pZ2h0IGJlIG1pc3NpbmcsIHRob3VnaC4gQXBwYXJlbnRseSB5b3UgZG9uJ3QgaGF2ZSBhIGxheW91dCwgYSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLCBvciBldmVuIGEgdmlldyEgX1RoYXQncyByb3VnaC5fXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ3JlYXRpbmcgYSBsYXlvdXRcXG5cXG4gICAgTGV0J3MgYWxzbyBjcmVhdGUgYSBsYXlvdXQuIEZvciB0aGUgcHVycG9zZXMgb2YgbWFraW5nIG91ciB3YXkgdGhyb3VnaCB0aGlzIGd1aWRlLCBpdCdsbCBqdXN0IGJlIGEgcGxhaW4gSmF2YVNjcmlwdCBmdW5jdGlvbi5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggbGF5b3V0LmpzXFxuICAgIGBgYFxcblxcbiAgICBOb3RlIHRoYXQgdGhlIGBwYXJ0aWFsYCBwcm9wZXJ0eSBpbiB0aGUgYG1vZGVsYCBfKGFzIHNlZW4gYmVsb3cpXyBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UnbGwgYmUgdXNpbmcgaGVyZSBlZmZlY3RpdmVseSBtZWFucyBfXFxcInVzZSB0aGUgZm9sbG93aW5nIGNvbWJpbmF0aW9uIG9mIHBsYWluIHRleHQgYW5kIHRoZSAqKihtYXliZSBIVE1MKSoqIHBhcnRpYWwgdmlld1xcXCJfLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgcmV0dXJuICdUaGlzIGlzIHRoZSBwYXJ0aWFsOiBcXFwiJyArIG1vZGVsLnBhcnRpYWwgKyAnXFxcIic7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPZiBjb3Vyc2UsIGlmIHlvdSB3ZXJlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uLCB0aGVuIHlvdSBwcm9iYWJseSB3b3VsZG4ndCB3YW50IHRvIHdyaXRlIHZpZXdzIGFzIEphdmFTY3JpcHQgZnVuY3Rpb25zIGFzIHRoYXQncyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuXFxuXFxuICAgIC0gW011c3RhY2hlXVsxMF0gaXMgYSB0ZW1wbGF0aW5nIGVuZ2luZSB0aGF0IGNhbiBjb21waWxlIHlvdXIgdmlld3MgaW50byBwbGFpbiBmdW5jdGlvbnMsIHVzaW5nIGEgc3ludGF4IHRoYXQncyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTFxcbiAgICAtIFtKYWRlXVsxMV0gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSdzIG5vIGNsb3NpbmcgdGFnc1xcbiAgICAtIFRoZXJlJ3MgbWFueSBtb3JlIGFsdGVybmF0aXZlcyBsaWtlIFtNb3ppbGxhJ3MgTnVuanVja3NdWzEyXSwgW0hhbmRsZWJhcnNdWzEzXSwgYW5kIFtFSlNdWzE0XS5cXG5cXG4gICAgUmVtZW1iZXIgdG8gYWRkIHRoZSBgbGF5b3V0YCB1bmRlciB0aGUgYG9wdGlvbnNgIG9iamVjdCBwYXNzZWQgdG8gYHRhdW51c0V4cHJlc3NgIVxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL3JvdXRlcycpLFxcbiAgICAgIGxheW91dDogcmVxdWlyZSgnLi9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIEhlcmUncyB3aGF0IHlvdSdkIGdldCBpZiB5b3UgcmFuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcCAmXFxuICAgIGN1cmwgbG9jYWxob3N0OjMwMDBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszM11cXG5cXG4gICAgQXQgdGhpcyBwb2ludCB3ZSBoYXZlIGEgbGF5b3V0LCBidXQgd2UncmUgc3RpbGwgbWlzc2luZyB0aGUgcGFydGlhbCB2aWV3IGFuZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlci4gV2UgY2FuIGRvIHdpdGhvdXQgdGhlIGNvbnRyb2xsZXIsIGJ1dCBoYXZpbmcgbm8gdmlld3MgaXMga2luZCBvZiBwb2ludGxlc3Mgd2hlbiB5b3UncmUgdHJ5aW5nIHRvIGdldCBhbiBNVkMgZW5naW5lIHVwIGFuZCBydW5uaW5nLCByaWdodD9cXG5cXG4gICAgWW91J2xsIGZpbmQgdG9vbHMgcmVsYXRlZCB0byB2aWV3IHRlbXBsYXRpbmcgaW4gdGhlIFtjb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbl1bMTVdLiBJZiB5b3UgZG9uJ3QgcHJvdmlkZSBhIGBsYXlvdXRgIHByb3BlcnR5IGF0IGFsbCwgVGF1bnVzIHdpbGwgcmVuZGVyIHlvdXIgbW9kZWwgaW4gYSByZXNwb25zZSBieSB3cmFwcGluZyBpdCBpbiBgPHByZT5gIGFuZCBgPGNvZGU+YCB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmVcXG5cXG4gICAgTGV0J3MgZ28gYWhlYWQgYW5kIHVzZSBKYWRlIGFzIHRoZSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgb2YgY2hvaWNlIGZvciBvdXIgdmlld3MuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIC1wIHZpZXdzL2hvbWVcXG4gICAgdG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuICAgIGBgYFxcblxcbiAgICBTaW5jZSB3ZSdyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQncyBpdC5cXG5cXG4gICAgYGBgamFkZVxcbiAgICBwIEhlbGxvIFRhdW51cyFcXG4gICAgYGBgXFxuXFxuICAgIE5leHQgeW91J2xsIHdhbnQgdG8gY29tcGlsZSB0aGUgdmlldyBpbnRvIGEgZnVuY3Rpb24uIFRvIGRvIHRoYXQgeW91IGNhbiB1c2UgW2phZHVtXVsxNl0sIGEgc3BlY2lhbGl6ZWQgSmFkZSBjb21waWxlciB0aGF0IHBsYXlzIHdlbGwgd2l0aCBUYXVudXMgYnkgYmVpbmcgYXdhcmUgb2YgYHJlcXVpcmVgIHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0J3MgaW5zdGFsbCBpdCBnbG9iYWxseSwgZm9yIHRoZSBzYWtlIG9mIHRoaXMgZXhlcmNpc2UgXyh5b3Ugc2hvdWxkIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHlvdSdyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbilfLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCAtLWdsb2JhbCBqYWR1bVxcbiAgICBgYGBcXG5cXG4gICAgVG8gY29tcGlsZSBldmVyeSB2aWV3IGluIHRoZSBgdmlld3NgIGRpcmVjdG9yeSBpbnRvIGZ1bmN0aW9ucyB0aGF0IHdvcmsgd2VsbCB3aXRoIFRhdW51cywgeW91IGNhbiB1c2UgdGhlIGNvbW1hbmQgYmVsb3cuIFRoZSBgLS1vdXRwdXRgIGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSBgLmJpbmAgYmVjYXVzZSB0aGF0J3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbl1bMTddIGFwcHJvYWNoLCB5b3UgY291bGQgY2hhbmdlIHRoYXQgaWYgeW91IHdhbnRlZCB0by5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbiAgICBgYGBcXG5cXG4gICAgQ29uZ3JhdHVsYXRpb25zISBZb3VyIGZpcnN0IHZpZXcgaXMgbm93IG9wZXJhdGlvbmFsIGFuZCBidWlsdCB1c2luZyBhIGZ1bGwtZmxlZGdlZCB0ZW1wbGF0aW5nIGVuZ2luZSEgQWxsIHRoYXQncyBsZWZ0IGlzIGZvciB5b3UgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhbmQgdmlzaXQgaXQgb24gcG9ydCBgMzAwMGAuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgb3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszNF1cXG5cXG4gICAgR3JhbnRlZCwgeW91IHNob3VsZCBfcHJvYmFibHlfIG1vdmUgdGhlIGxheW91dCBpbnRvIGEgSmFkZSBfKGFueSB2aWV3IGVuZ2luZSB3aWxsIGRvKV8gdGVtcGxhdGUgYXMgd2VsbC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJcXG5cXG4gICAgQ29udHJvbGxlcnMgYXJlIGluZGVlZCBvcHRpb25hbCwgYnV0IGFuIGFwcGxpY2F0aW9uIHRoYXQgcmVuZGVycyBldmVyeSB2aWV3IHVzaW5nIHRoZSBzYW1lIG1vZGVsIHdvbid0IGdldCB5b3UgdmVyeSBmYXIuIENvbnRyb2xsZXJzIGFsbG93IHlvdSB0byBoYW5kbGUgdGhlIHJlcXVlc3QgYW5kIHB1dCB0b2dldGhlciB0aGUgbW9kZWwgdG8gYmUgdXNlZCB3aGVuIHNlbmRpbmcgYSByZXNwb25zZS4gQ29udHJhcnkgdG8gd2hhdCBtb3N0IGZyYW1ld29ya3MgcHJvcG9zZSwgVGF1bnVzIGV4cGVjdHMgZXZlcnkgYWN0aW9uIHRvIGhhdmUgaXRzIG93biBpbmRpdmlkdWFsIGNvbnRyb2xsZXIuIFNpbmNlIE5vZGUuanMgbWFrZXMgaXQgZWFzeSB0byBpbXBvcnQgY29tcG9uZW50cywgdGhpcyBzZXR1cCBoZWxwcyB5b3Uga2VlcCB5b3VyIGNvZGUgbW9kdWxhciB3aGlsZSBzdGlsbCBiZWluZyBhYmxlIHRvIHJldXNlIGxvZ2ljIGJ5IHNoYXJpbmcgbW9kdWxlcyBhY3Jvc3MgZGlmZmVyZW50IGNvbnRyb2xsZXJzLiBMZXQncyBjcmVhdGUgYSBjb250cm9sbGVyIGZvciB0aGUgYGhvbWUvdmlld2AgYWN0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCBjb250cm9sbGVycy9ob21lXFxuICAgIHRvdWNoIGNvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiBfU3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj9fIFRoZSBzaWduYXR1cmUgZm9yIHRoZSBjb250cm9sbGVyIGlzIHRoZSBzYW1lIHNpZ25hdHVyZSBhcyB0aGF0IG9mIGFueSBvdGhlciBtaWRkbGV3YXJlIHBhc3NlZCB0byBbRXhwcmVzc11bNl0gXyhvciBhbnkgcm91dGUgaGFuZGxlciBwYXNzZWQgdG8gW0hhcGldWzddIGluIHRoZSBjYXNlIG9mIGB0YXVudXMtaGFwaWApXy5cXG5cXG4gICAgQXMgeW91IG1heSBoYXZlIG5vdGljZWQgaW4gdGhlIGV4YW1wbGVzIHNvIGZhciwgeW91IGhhdmVuJ3QgZXZlbiBzZXQgYSBkb2N1bWVudCB0aXRsZSBmb3IgeW91ciBIVE1MIHBhZ2VzISBUdXJucyBvdXQsIHRoZXJlJ3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyBfKHZlcnkgZmV3KV8gdGhhdCBUYXVudXMgaXMgYXdhcmUgb2YuIE9uZSBvZiB0aG9zZSBpcyB0aGUgYHRpdGxlYCBwcm9wZXJ0eSwgYW5kIGl0J2xsIGJlIHVzZWQgdG8gY2hhbmdlIHRoZSBgZG9jdW1lbnQudGl0bGVgIGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0J3Mgbm90IGluIHRoZSBgbW9kZWxgIHByb3BlcnR5IHdvbid0IGJlIHRyYXNtaXR0ZWQgdG8gdGhlIGNsaWVudCwgYW5kIHdpbGwganVzdCBiZSBhY2Nlc3NpYmxlIHRvIHRoZSBsYXlvdXQuXFxuXFxuICAgIEhlcmUgaXMgb3VyIG5ld2ZhbmdsZWQgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIuIEFzIHlvdSdsbCBub3RpY2UsIGl0IGRvZXNuJ3QgZGlzcnVwdCBhbnkgb2YgdGhlIHR5cGljYWwgRXhwcmVzcyBleHBlcmllbmNlLCBidXQgbWVyZWx5IGJ1aWxkcyB1cG9uIGl0LiBXaGVuIGBuZXh0YCBpcyBjYWxsZWQsIHRoZSBUYXVudXMgdmlldy1yZW5kZXJpbmcgaGFuZGxlciB3aWxsIGtpY2sgaW4sIGFuZCByZW5kZXIgdGhlIHZpZXcgdXNpbmcgdGhlIGluZm9ybWF0aW9uIHRoYXQgd2FzIGFzc2lnbmVkIHRvIGByZXMudmlld01vZGVsYC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgICAgIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgICAgICBtb2RlbDoge1xcbiAgICAgICAgICB0aXRsZTogJ1dlbGNvbWUgSG9tZSwgVGF1bnVzISdcXG4gICAgICAgIH1cXG4gICAgICB9O1xcbiAgICAgIG5leHQoKTtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgcmVseWluZyBvbiB0aGUgY2xpZW50LXNpZGUgY2hhbmdlcyB0byB5b3VyIHBhZ2UgaW4gb3JkZXIgdG8gc2V0IHRoZSB2aWV3IHRpdGxlIF93b3VsZG4ndCBiZSBwcm9ncmVzc2l2ZV8sIGFuZCB0aHVzIFtpdCB3b3VsZCBiZSByZWFsbHksIF9yZWFsbHlfIGJhZF1bMTddLiBXZSBzaG91bGQgdXBkYXRlIHRoZSBsYXlvdXQgdG8gdXNlIHdoYXRldmVyIGB0aXRsZWAgaGFzIGJlZW4gcGFzc2VkIHRvIHRoZSBtb2RlbC4gSW4gZmFjdCwgbGV0J3MgZ28gYmFjayB0byB0aGUgZHJhd2luZyBib2FyZCBhbmQgbWFrZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIHRlbXBsYXRlIVxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBybSBsYXlvdXQuanNcXG4gICAgdG91Y2ggdmlld3MvbGF5b3V0LmphZGVcXG4gICAgamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbiAgICBgYGBcXG5cXG4gICAgWW91IHNob3VsZCBhbHNvIHJlbWVtYmVyIHRvIHVwZGF0ZSB0aGUgYGFwcC5qc2AgbW9kdWxlIG9uY2UgYWdhaW4hXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuLy5iaW4vdmlld3MvbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgYCE9YCBzeW50YXggYmVsb3cgbWVhbnMgdGhhdCB3aGF0ZXZlciBpcyBpbiB0aGUgdmFsdWUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgd29uJ3QgYmUgZXNjYXBlZC4gVGhhdCdzIG9rYXkgYmVjYXVzZSBgcGFydGlhbGAgaXMgYSB2aWV3IHdoZXJlIEphZGUgZXNjYXBlZCBhbnl0aGluZyB0aGF0IG5lZWRlZCBlc2NhcGluZywgYnV0IHdlIHdvdWxkbid0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhXFxuXFxuICAgIGBgYGphZGVcXG4gICAgdGl0bGU9bW9kZWwudGl0bGVcXG4gICAgbWFpbiE9cGFydGlhbFxcbiAgICBgYGBcXG5cXG4gICAgQnkgdGhlIHdheSwgZGlkIHlvdSBrbm93IHRoYXQgYDxodG1sPmAsIGA8aGVhZD5gLCBhbmQgYDxib2R5PmAgYXJlIGFsbCBvcHRpb25hbCBpbiBIVE1MIDUsIGFuZCB0aGF0IHlvdSBjYW4gc2FmZWx5IG9taXQgdGhlbSBpbiB5b3VyIEhUTUw/IE9mIGNvdXJzZSwgcmVuZGVyaW5nIGVuZ2luZXMgd2lsbCBzdGlsbCBpbnNlcnQgdGhvc2UgZWxlbWVudHMgYXV0b21hdGljYWxseSBpbnRvIHRoZSBET00gZm9yIHlvdSEgX0hvdyBjb29sIGlzIHRoYXQ/X1xcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzM1XVxcblxcbiAgICBZb3UgY2FuIG5vdyB2aXNpdCBgbG9jYWxob3N0OjMwMDBgIHdpdGggeW91ciBmYXZvcml0ZSB3ZWIgYnJvd3NlciBhbmQgeW91J2xsIG5vdGljZSB0aGF0IHRoZSB2aWV3IHJlbmRlcnMgYXMgeW91J2QgZXhwZWN0LiBUaGUgdGl0bGUgd2lsbCBiZSBwcm9wZXJseSBzZXQsIGFuZCBhIGA8bWFpbj5gIGVsZW1lbnQgd2lsbCBoYXZlIHRoZSBjb250ZW50cyBvZiB5b3VyIHZpZXcuXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGFwcGxpY2F0aW9uIHJ1bm5pbmcgb24gR29vZ2xlIENocm9tZV1bMzZdXFxuXFxuICAgIFRoYXQncyBpdCwgbm93IHlvdXIgdmlldyBoYXMgYSB0aXRsZS4gT2YgY291cnNlLCB0aGVyZSdzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIGBuZXh0YCB0byByZW5kZXIgdGhlIHZpZXcuXFxuXFxuICAgIFRoZW4gdGhlcmUncyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCdzIHNldCBpdCB1cCBhbmQgc2VlIGhvdyBpdCBvcGVucyB1cCBvdXIgcG9zc2liaWxpdGllcy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBUYXVudXMgaW4gdGhlIGNsaWVudFxcblxcbiAgICBZb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIFtjaGVjayBvdXQgdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0gdG8gZ2V0IGEgbW9yZSB0aG9yb3VnaCB1bmRlcnN0YW5kaW5nIG9mIHRoZSBwdWJsaWMgaW50ZXJmYWNlIG9uIFRhdW51cywgYW5kIHdoYXQgaXQgZW5hYmxlcyB5b3UgdG8gZG8uXFxuXFxuICAgIFRoZSB3YXkgVGF1bnVzIHdvcmtzIG9uIHRoZSBjbGllbnQtc2lkZSBpcyBzbyB0aGF0IG9uY2UgeW91IHNldCBpdCB1cCwgaXQgd2lsbCBoaWphY2sgbGluayBjbGlja3MgYW5kIHVzZSBBSkFYIHRvIGZldGNoIG1vZGVscyBhbmQgcmVuZGVyIHRob3NlIHZpZXdzIGluIHRoZSBjbGllbnQuIElmIHRoZSBKYXZhU2NyaXB0IGNvZGUgZmFpbHMgdG8gbG9hZCwgX29yIGlmIGl0IGhhc24ndCBsb2FkZWQgeWV0IGR1ZSB0byBhIHNsb3cgY29ubmVjdGlvbiBzdWNoIGFzIHRob3NlIGluIHVuc3RhYmxlIG1vYmlsZSBuZXR3b3Jrc18sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS5cXG5cXG4gICAgU2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSdsbCBoYXZlIHRvIGNvbXBpbGUgdGhlIGFwcGxpY2F0aW9uJ3Mgd2lyaW5nIF8odGhlIHJvdXRlcyBhbmQgSmF2YVNjcmlwdCB2aWV3IGZ1bmN0aW9ucylfIGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UnbGwgaGF2ZSB0byBtb3VudCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlLCBwYXNzaW5nIHRoZSB3aXJpbmcgc28gdGhhdCBpdCBrbm93cyB3aGljaCByb3V0ZXMgaXQgc2hvdWxkIHJlc3BvbmQgdG8sIGFuZCB3aGljaCBvdGhlcnMgaXQgc2hvdWxkIG1lcmVseSBpZ25vcmUuIE9uY2UgdGhhdCdzIG91dCBvZiB0aGUgd2F5LCBjbGllbnQtc2lkZSByb3V0aW5nIHdvdWxkIGJlIHNldCB1cC5cXG5cXG4gICAgQXMgc3VnYXIgY29hdGluZyBvbiB0b3Agb2YgdGhhdCwgeW91IG1heSBhZGQgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB1c2luZyBjb250cm9sbGVycy4gVGhlc2UgY29udHJvbGxlcnMgd291bGQgYmUgZXhlY3V0ZWQgZXZlbiBpZiB0aGUgdmlldyB3YXMgcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLiBUaGV5IGNhbiBhY2Nlc3MgdGhlIFRhdW51cyBBUEkgZGlyZWN0bHksIGluIGNhc2UgeW91IG5lZWQgdG8gbmF2aWdhdGUgdG8gYW5vdGhlciB2aWV3IGluIHNvbWUgd2F5IG90aGVyIHRoYW4gYnkgaGF2aW5nIGh1bWFucyBjbGljayBvbiBhbmNob3IgdGFncy4gVGhlIEFQSSwgYXMgeW91J2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgVGF1bnVzIENMSVxcblxcbiAgICBUYXVudXMgY29tZXMgd2l0aCBhIENMSSB0aGF0IGNhbiBiZSB1c2VkIHRvIHdpcmUgeW91ciBOb2RlLmpzIHJvdXRlcyBhbmQgdmlld3MgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZSBzYW1lIENMSSBjYW4gYmUgdXNlZCB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcyB3ZWxsLiBUaGUgbWFpbiByZWFzb24gd2h5IHRoZSBUYXVudXMgQ0xJIGV4aXN0cyBpcyBzbyB0aGF0IHlvdSBkb24ndCBoYXZlIHRvIGByZXF1aXJlYCBldmVyeSBzaW5nbGUgdmlldyBhbmQgY29udHJvbGxlciwgdW5kb2luZyBhIGxvdCBvZiB0aGUgd29yayB0aGF0IHdhcyBwdXQgaW50byBjb2RlIHJldXNlLiBKdXN0IGxpa2Ugd2UgZGlkIHdpdGggYGphZHVtYCBlYXJsaWVyLCB3ZSdsbCBpbnN0YWxsIHRoZSBgdGF1bnVzYCBDTEkgZ2xvYmFsbHkgZm9yIHRoZSBzYWtlIG9mIGV4ZXJjaXNpbmcsIGJ1dCB3ZSB1bmRlcnN0YW5kIHRoYXQgcmVseWluZyBvbiBnbG9iYWxseSBpbnN0YWxsZWQgbW9kdWxlcyBpcyBpbnN1ZmZpY2llbnQgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgYXBwbGljYXRpb25zLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCAtLWdsb2JhbCB0YXVudXNcXG4gICAgYGBgXFxuXFxuICAgIEJlZm9yZSB5b3UgY2FuIHVzZSB0aGUgQ0xJLCB5b3Ugc2hvdWxkIG1vdmUgdGhlIHJvdXRlIGRlZmluaXRpb25zIHRvIGBjb250cm9sbGVycy9yb3V0ZXMuanNgLiBUaGF0J3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgdGhlbSB0byBiZS4gSWYgeW91IHdhbnQgdG8gcGxhY2UgdGhlbSBzb21ldGhpbmcgZWxzZSwgW3RoZSBBUEkgZG9jdW1lbnRhdGlvbiBjYW4gaGVscCB5b3VdWzE4XS5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbXYgcm91dGVzLmpzIGNvbnRyb2xsZXJzL3JvdXRlcy5qc1xcbiAgICBgYGBcXG5cXG4gICAgU2luY2UgeW91IG1vdmVkIHRoZSByb3V0ZXMgeW91IHNob3VsZCBhbHNvIHVwZGF0ZSB0aGUgYHJlcXVpcmVgIHN0YXRlbWVudCBpbiB0aGUgYGFwcC5qc2AgbW9kdWxlLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL3JvdXRlcycpLFxcbiAgICAgIGxheW91dDogcmVxdWlyZSgnLi8uYmluL3ZpZXdzL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIENMSSBpcyB0ZXJzZSBpbiBib3RoIGl0cyBpbnB1dHMgYW5kIGl0cyBvdXRwdXRzLiBJZiB5b3UgcnVuIGl0IHdpdGhvdXQgYW55IGFyZ3VtZW50cyBpdCdsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgYC0tb3V0cHV0YCBmbGFnLiBJbiB0eXBpY2FsIFtjb252ZW50aW9uLW92ZXItY29uZmlndXJhdGlvbl1bOF0gZmFzaGlvbiwgdGhlIENMSSB3aWxsIGRlZmF1bHQgdG8gaW5mZXJyaW5nIHlvdXIgdmlld3MgYXJlIGxvY2F0ZWQgaW4gYC5iaW4vdmlld3NgIGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiBgLmJpbi93aXJpbmcuanNgLCBidXQgeW91J2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24ndCBtZWV0IHlvdXIgbmVlZHMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dFxcbiAgICBgYGBcXG5cXG4gICAgQXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgYC5iaW4vd2lyaW5nLmpzYCBmaWxlIHdpdGggdGhlIGNvbnRlbnRzIGRldGFpbGVkIGJlbG93LiBBcyB5b3UgY2FuIHNlZSwgZXZlbiBpZiBgdGF1bnVzYCBpcyBhbiBhdXRvbWF0ZWQgY29kZS1nZW5lcmF0aW9uIHRvb2wsIGl0J3Mgb3V0cHV0IGlzIGFzIGh1bWFuIHJlYWRhYmxlIGFzIGFueSBvdGhlciBtb2R1bGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRlbXBsYXRlcyA9IHtcXG4gICAgICAnaG9tZS9pbmRleCc6IHJlcXVpcmUoJy4vdmlld3MvaG9tZS9pbmRleC5qcycpLFxcbiAgICAgICdsYXlvdXQnOiByZXF1aXJlKCcuL3ZpZXdzL2xheW91dC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciBjb250cm9sbGVycyA9IHtcXG4gICAgfTtcXG5cXG4gICAgdmFyIHJvdXRlcyA9IHtcXG4gICAgICAnLyc6IHtcXG4gICAgICAgIGFjdGlvbjogJ2hvbWUvaW5kZXgnXFxuICAgICAgfVxcbiAgICB9O1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcXG4gICAgICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gICAgICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICAgICAgcm91dGVzOiByb3V0ZXNcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGB0YXVudXNgIG91dHB1dF1bMzddXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYGNvbnRyb2xsZXJzYCBvYmplY3QgaXMgZW1wdHkgYmVjYXVzZSB5b3UgaGF2ZW4ndCBjcmVhdGVkIGFueSBfY2xpZW50LXNpZGUgY29udHJvbGxlcnNfIHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJ3QgaGF2ZSBhbnkgZWZmZWN0IGluIHRoZSBjbGllbnQtc2lkZSwgYmVzaWRlcyBkZXRlcm1pbmluZyB3aGF0IGdldHMgc2VudCB0byB0aGUgY2xpZW50LlxcblxcbiAgICBUaGUgQ0xJIGNhbiBiZSBlbnRpcmVseSBpZ25vcmVkLCB5b3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhpcyBmaWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuXFxuXFxuICAgIER1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgYC0td2F0Y2hgIGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG4gICAgYGBgXFxuXFxuICAgIElmIHlvdSdyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91J2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSBgaGFwaWlmeWAgdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuICAgIGBgYFxcblxcbiAgICBOb3cgdGhhdCB5b3UgdW5kZXJzdGFuZCBob3cgdG8gdXNlIHRoZSBDTEkgb3IgYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgb24geW91ciBvd24sIGJvb3RpbmcgdXAgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSB3aWxsIGJlIGFuIGVhc3kgdGhpbmcgdG8gZG8hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXFxuXFxuICAgIE9uY2Ugd2UgaGF2ZSB0aGUgd2lyaW5nIG1vZHVsZSwgYm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgZW5naW5lIGlzIHByZXR0eSBlYXN5LiBUYXVudXMgc3VnZ2VzdHMgeW91IHVzZSBgY2xpZW50L2pzYCB0byBrZWVwIGFsbCBvZiB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgbG9naWMsIGJ1dCB0aGF0IGlzIHVwIHRvIHlvdSB0b28uIEZvciB0aGUgc2FrZSBvZiB0aGlzIGd1aWRlLCBsZXQncyBzdGljayB0byB0aGUgY29udmVudGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIC1wIGNsaWVudC9qc1xcbiAgICB0b3VjaCBjbGllbnQvanMvbWFpbi5qc1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGBtYWluYCBtb2R1bGUgd2lsbCBiZSB1c2VkIGFzIHRoZSBfZW50cnkgcG9pbnRfIG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSdsbCBuZWVkIHRvIGltcG9ydCBgdGF1bnVzYCwgdGhlIHdpcmluZyBtb2R1bGUgd2UndmUganVzdCBidWlsdCwgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBET00gZWxlbWVudCB3aGVyZSB5b3UgYXJlIHJlbmRlcmluZyB5b3VyIHBhcnRpYWwgdmlld3MuIE9uY2UgeW91IGhhdmUgYWxsIHRoYXQsIHlvdSBjYW4gaW52b2tlIGB0YXVudXMubW91bnRgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHdpcmluZyA9IHJlcXVpcmUoJy4uLy4uLy5iaW4vd2lyaW5nJyk7XFxuICAgIHZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ21haW4nKVswXTtcXG5cXG4gICAgdGF1bnVzLm1vdW50KG1haW4sIHdpcmluZyk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLlxcblxcbiAgICBCeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbid0IGJlIGZ1bmN0aW9uYWwgdW50aWwgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgcnVucy5cXG5cXG4gICAgQW4gYWx0ZXJuYXRpdmUgaXMgdG8gaW5saW5lIHRoZSB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmlld3MgaW4gYSBgPHNjcmlwdCB0eXBlPSd0ZXh0L3RhdW51cyc+YCB0YWcsIGJ1dCB0aGlzIHRlbmRzIHRvIHNsb3cgZG93biB0aGUgaW5pdGlhbCByZXNwb25zZSAobW9kZWxzIGFyZSBfdHlwaWNhbGx5IGxhcmdlcl8gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS5cXG5cXG4gICAgQSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCdzIGhhcmRlciB0byBzZXQgdXAuXFxuXFxuICAgIFRoZSB0aHJlZSBib290aW5nIHN0cmF0ZWdpZXMgYXJlIGV4cGxhaW5lZCBpbiBbdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0gYW5kIGZ1cnRoZXIgZGlzY3Vzc2VkIGluIFt0aGUgb3B0aW1pemF0aW9uIGd1aWRlXVsyNV0uIEZvciBub3csIHRoZSBkZWZhdWx0IHN0cmF0ZWd5IF8oYCdhdXRvJ2ApXyBzaG91bGQgc3VmZmljZS4gSXQgZmV0Y2hlcyB0aGUgdmlldyBtb2RlbCB1c2luZyBhbiBBSkFYIHJlcXVlc3QgcmlnaHQgYWZ0ZXIgVGF1bnVzIGxvYWRzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIEFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlclxcblxcbiAgICBDbGllbnQtc2lkZSBjb250cm9sbGVycyBydW4gd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLCBldmVuIGlmIGl0J3MgYSBwYXJ0aWFsLiBUaGUgY29udHJvbGxlciBpcyBwYXNzZWQgdGhlIGBtb2RlbGAsIGNvbnRhaW5pbmcgdGhlIG1vZGVsIHRoYXQgd2FzIHVzZWQgdG8gcmVuZGVyIHRoZSB2aWV3OyB0aGUgYHJvdXRlYCwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSBgY29udGFpbmVyYCwgd2hpY2ggaXMgd2hhdGV2ZXIgRE9NIGVsZW1lbnQgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIGludG8uXFxuXFxuICAgIFRoZXNlIGNvbnRyb2xsZXJzIGFyZSBlbnRpcmVseSBvcHRpb25hbCwgd2hpY2ggbWFrZXMgc2Vuc2Ugc2luY2Ugd2UncmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCdzIGFkZCBzb21lIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gdGhlIGV4YW1wbGUgd2UndmUgYmVlbiBidWlsZGluZy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWVcXG4gICAgdG91Y2ggY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG4gICAgYGBgXFxuXFxuICAgIEd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJ2xsIGp1c3QgcHJpbnQgdGhlIGFjdGlvbiBhbmQgdGhlIG1vZGVsIHRvIHRoZSBjb25zb2xlLiBJZiB0aGVyZSdzIG9uZSBwbGFjZSB3aGVyZSB5b3UnZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsLCBjb250YWluZXIsIHJvdXRlKSB7XFxuICAgICAgY29uc29sZS5sb2coJ1JlbmRlcmVkIHZpZXcgJXMgdXNpbmcgbW9kZWw6XFxcXG4lcycsIHJvdXRlLmFjdGlvbiwgSlNPTi5zdHJpbmdpZnkobW9kZWwsIG51bGwsIDIpKTtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIFNpbmNlIHdlIHdlcmVuJ3QgdXNpbmcgdGhlIGAtLXdhdGNoYCBmbGFnIGZyb20gdGhlIFRhdW51cyBDTEksIHlvdSdsbCBoYXZlIHRvIHJlY29tcGlsZSB0aGUgd2lyaW5nIGF0IHRoaXMgcG9pbnQsIHNvIHRoYXQgdGhlIGNvbnRyb2xsZXIgZ2V0cyBhZGRlZCB0byB0aGF0IG1hbmlmZXN0LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXRcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgeW91J2xsIG5vdyBoYXZlIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgdXNpbmcgW0Jyb3dzZXJpZnldWzM4XSFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDb21waWxpbmcgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0XFxuXFxuICAgIFlvdSdsbCBuZWVkIHRvIGNvbXBpbGUgdGhlIGBjbGllbnQvanMvbWFpbi5qc2AgbW9kdWxlLCBvdXIgY2xpZW50LXNpZGUgYXBwbGljYXRpb24ncyBlbnRyeSBwb2ludCwgdXNpbmcgQnJvd3NlcmlmeSBzaW5jZSB0aGUgY29kZSBpcyB3cml0dGVuIHVzaW5nIENvbW1vbkpTLiBJbiB0aGlzIGV4YW1wbGUgeW91J2xsIGluc3RhbGwgYGJyb3dzZXJpZnlgIGdsb2JhbGx5IHRvIGNvbXBpbGUgdGhlIGNvZGUsIGJ1dCBuYXR1cmFsbHkgeW91J2xsIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHdvcmtpbmcgb24gYSByZWFsLXdvcmxkIGFwcGxpY2F0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCAtLWdsb2JhbCBicm93c2VyaWZ5XFxuICAgIGBgYFxcblxcbiAgICBPbmNlIHlvdSBoYXZlIHRoZSBCcm93c2VyaWZ5IENMSSwgeW91J2xsIGJlIGFibGUgdG8gY29tcGlsZSB0aGUgY29kZSByaWdodCBmcm9tIHlvdXIgY29tbWFuZCBsaW5lLiBUaGUgYC1kYCBmbGFnIHRlbGxzIEJyb3dzZXJpZnkgdG8gYWRkIGFuIGlubGluZSBzb3VyY2UgbWFwIGludG8gdGhlIGNvbXBpbGVkIGJ1bmRsZSwgbWFraW5nIGRlYnVnZ2luZyBlYXNpZXIgZm9yIHVzLiBUaGUgYC1vYCBmbGFnIHJlZGlyZWN0cyBvdXRwdXQgdG8gdGhlIGluZGljYXRlZCBmaWxlLCB3aGVyZWFzIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCB0byBzdGFuZGFyZCBvdXRwdXQgYnkgZGVmYXVsdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgLmJpbi9wdWJsaWMvanNcXG4gICAgYnJvd3NlcmlmeSBjbGllbnQvanMvbWFpbi5qcyAtZG8gLmJpbi9wdWJsaWMvanMvYWxsLmpzXFxuICAgIGBgYFxcblxcbiAgICBXZSBoYXZlbid0IGRvbmUgbXVjaCBvZiBhbnl0aGluZyB3aXRoIHRoZSBFeHByZXNzIGFwcGxpY2F0aW9uLCBzbyB5b3UnbGwgbmVlZCB0byBhZGp1c3QgdGhlIGBhcHAuanNgIG1vZHVsZSB0byBzZXJ2ZSBzdGF0aWMgYXNzZXRzLiBJZiB5b3UncmUgdXNlZCB0byBFeHByZXNzLCB5b3UnbGwgbm90aWNlIHRoZXJlJ3Mgbm90aGluZyBzcGVjaWFsIGFib3V0IGhvdyB3ZSdyZSB1c2luZyBgc2VydmUtc3RhdGljYC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLS1zYXZlIHNlcnZlLXN0YXRpY1xcbiAgICBgYGBcXG5cXG4gICAgTGV0J3MgY29uZmlndXJlIHRoZSBhcHBsaWNhdGlvbiB0byBzZXJ2ZSBzdGF0aWMgYXNzZXRzIGZyb20gYC5iaW4vcHVibGljYC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBzZXJ2ZVN0YXRpYyA9IHJlcXVpcmUoJ3NlcnZlLXN0YXRpYycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuLy5iaW4vdmlld3MvbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgYXBwLnVzZShzZXJ2ZVN0YXRpYygnLmJpbi9wdWJsaWMnKSk7XFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgTmV4dCB1cCwgeW91J2xsIGhhdmUgdG8gZWRpdCB0aGUgbGF5b3V0IHRvIGluY2x1ZGUgdGhlIGNvbXBpbGVkIEphdmFTY3JpcHQgYnVuZGxlIGZpbGUuXFxuXFxuICAgIGBgYGphZGVcXG4gICAgdGl0bGU9bW9kZWwudGl0bGVcXG4gICAgbWFpbiE9cGFydGlhbFxcbiAgICBzY3JpcHQoc3JjPScvanMvYWxsLmpzJylcXG4gICAgYGBgXFxuXFxuICAgIExhc3RseSwgeW91IGNhbiBleGVjdXRlIHRoZSBhcHBsaWNhdGlvbiBhbmQgc2VlIGl0IGluIGFjdGlvbiFcXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszOV1cXG5cXG4gICAgSWYgeW91IG9wZW4gdGhlIGFwcGxpY2F0aW9uIG9uIGEgd2ViIGJyb3dzZXIsIHlvdSdsbCBub3RpY2UgdGhhdCB0aGUgYXBwcm9wcmlhdGUgaW5mb3JtYXRpb24gd2lsbCBiZSBsb2dnZWQgaW50byB0aGUgZGV2ZWxvcGVyIGBjb25zb2xlYC5cXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggdGhlIGFwcGxpY2F0aW9uIHJ1bm5pbmcgdW5kZXIgR29vZ2xlIENocm9tZV1bNDBdXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUElcXG5cXG4gICAgVGF1bnVzIGRvZXMgcHJvdmlkZSBbYSB0aGluIEFQSV1bMThdIGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSdzIGEgZmV3IG1ldGhvZHMgeW91IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBvbiBhIGdsb2JhbCBzY2FsZSBhcyB3ZWxsLlxcblxcbiAgICBUYXVudXMgY2FuIG5vdGlmeSB5b3Ugd2hlbmV2ZXIgaW1wb3J0YW50IGV2ZW50cyBvY2N1ci5cXG5cXG4gICAgRXZlbnQgICAgICAgICAgICB8IEFyZ3VtZW50cyAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYCdzdGFydCdgICAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgRW1pdHRlZCB3aGVuIGB0YXVudXMubW91bnRgIGZpbmlzaGVkIHRoZSByb3V0ZSBzZXR1cCBhbmQgaXMgYWJvdXQgdG8gaW52b2tlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyLiBTdWJzY3JpYmUgdG8gdGhpcyBldmVudCBiZWZvcmUgY2FsbGluZyBgdGF1bnVzLm1vdW50YC5cXG4gICAgYCdyZW5kZXInYCAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgQSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWRcXG4gICAgYCdmZXRjaC5zdGFydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuXFxuICAgIGAnZmV0Y2guZG9uZSdgICAgfCAgYHJvdXRlLCBjb250ZXh0LCBkYXRhYCB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuXFxuICAgIGAnZmV0Y2guYWJvcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuXFxuICAgIGAnZmV0Y2guZXJyb3InYCAgfCAgYHJvdXRlLCBjb250ZXh0LCBlcnJgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLlxcblxcbiAgICBCZXNpZGVzIGV2ZW50cywgdGhlcmUncyBhIGNvdXBsZSBtb3JlIG1ldGhvZHMgeW91IGNhbiB1c2UuIFRoZSBgdGF1bnVzLm5hdmlnYXRlYCBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJ3MgYHRhdW51cy5wYXJ0aWFsYCwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCdsbCB0aGVuIGludm9rZSBpdHMgY29udHJvbGxlci4gWW91J2xsIG5lZWQgdG8gY29tZSB1cCB3aXRoIHRoZSBtb2RlbCB5b3Vyc2VsZiwgdGhvdWdoLlxcblxcbiAgICBBc3RvbmlzaGluZ2x5LCB0aGUgQVBJIGlzIGZ1cnRoZXIgZG9jdW1lbnRlZCBpbiBbdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmdcXG5cXG4gICAgW1BlcmZvcm1hbmNlXVsyNV0gcGxheXMgYW4gaW1wb3J0YW50IHJvbGUgaW4gVGF1bnVzLiBUaGF0J3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/XFxuXFxuICAgIFdoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIGB7IGNhY2hlOiB0cnVlIH1gIGFzIHRoZSB0aGlyZCBwYXJhbWV0ZXIgZm9yIGB0YXVudXMubW91bnRgLCB0aGUgY2FjaGluZyBsYXllciB3aWxsIG1ha2Ugc3VyZSB0aGF0IHJlc3BvbnNlcyBhcmUga2VwdCBhcm91bmQgZm9yIGAxNWAgc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0J2xsIGZpcnN0IGFzayB0aGUgY2FjaGluZyBsYXllciBmb3IgYSBmcmVzaCBjb3B5LiBJZiB0aGUgY2FjaGluZyBsYXllciBkb2Vzbid0IGhhdmUgYSBjb3B5LCBvciBpZiB0aGF0IGNvcHkgaXMgc3RhbGUgXyhpbiB0aGlzIGNhc2UsIG9sZGVyIHRoYW4gYDE1YCBzZWNvbmRzKV8sIHRoZW4gYW4gQUpBWCByZXF1ZXN0IHdpbGwgYmUgaXNzdWVkIHRvIHRoZSBzZXJ2ZXIuIE9mIGNvdXJzZSwgdGhlIGR1cmF0aW9uIGlzIGNvbmZpZ3VyYWJsZS4gSWYgeW91IHdhbnQgdG8gdXNlIGEgdmFsdWUgb3RoZXIgdGhhbiB0aGUgZGVmYXVsdCwgeW91IHNob3VsZCBzZXQgYGNhY2hlYCB0byBhIG51bWJlciBpbiBzZWNvbmRzIGluc3RlYWQgb2YganVzdCBgdHJ1ZWAuXFxuXFxuICAgIFNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UncmUgYWxzbyBhYmxlIHRvIHNldCBhIGBjYWNoZWAgZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgYGNhY2hlYCBwcm9wZXJ0eSBpbiByb3V0ZXMgaGFzIHByZWNlZGVuY2Ugb3ZlciB0aGUgZGVmYXVsdCB2YWx1ZS5cXG5cXG4gICAgVGhlcmUncyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiBbSW5kZXhlZERCXVsyOF0gc3RvcmUuIEluZGV4ZWREQiBpcyBhbiBlbWJlZGRlZCBkYXRhYmFzZSBzb2x1dGlvbiwgYW5kIHlvdSBjYW4gdGhpbmsgb2YgaXQgbGlrZSBhbiBhc3luY2hyb25vdXMgdmVyc2lvbiBvZiBgbG9jYWxTdG9yYWdlYC4gSXQgaGFzIFtzdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0XVsyOV0sIGFuZCBpbiB0aGUgY2FzZXMgd2hlcmUgaXQncyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuXFxuXFxuICAgIFRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSBfKHRoZSBgdG91Y2hzdGFydGAgZXZlbnQpXywgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuXFxuXFxuICAgIElmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgXyhwb3NzaWJseSBsaW1pdGVkKV8gSW50ZXJuZXQgY29ubmVjdGlvbiBiYW5kd2lkdGguXFxuXFxuICAgIElmIHRoZSBodW1hbiBjbGlja3Mgb24gdGhlIGxpbmsgYmVmb3JlIHByZWZldGNoaW5nIGlzIGNvbXBsZXRlZCwgaGUnbGwgbmF2aWdhdGUgdG8gdGhlIHZpZXcgYXMgc29vbiBhcyBwcmVmZXRjaGluZyBlbmRzLCByYXRoZXIgdGhhbiBmaXJpbmcgYW5vdGhlciByZXF1ZXN0LiBUaGlzIGhlbHBzIFRhdW51cyBzYXZlIHByZWNpb3VzIG1pbGxpc2Vjb25kcyB3aGVuIGRlYWxpbmcgd2l0aCBsYXRlbmN5LXNlbnNpdGl2ZSBvcGVyYXRpb25zLlxcblxcbiAgICBUdXJuaW5nIHByZWZldGNoaW5nIG9uIGlzIHNpbXBseSBhIG1hdHRlciBvZiBzZXR0aW5nIGBwcmVmZXRjaGAgdG8gYHRydWVgIGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YC4gRm9yIGFkZGl0aW9uYWwgaW5zaWdodHMgaW50byB0aGUgcGVyZm9ybWFuY2UgaW1wcm92ZW1lbnRzIFRhdW51cyBjYW4gb2ZmZXIsIGhlYWQgb3ZlciB0byB0aGUgW1BlcmZvcm1hbmNlIE9wdGltaXphdGlvbnNdWzI1XSBndWlkZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBWZXJzaW9uaW5nXFxuXFxuICAgIFdoZW4geW91IGFsdGVyIHlvdXIgdmlld3MsIGNoYW5nZSBjb250cm9sbGVycywgb3IgbW9kaWZ5IHRoZSBtb2RlbHMsIGNoYW5jZXMgYXJlIHRoZSBjbGllbnQtc2lkZSBpcyBnb2luZyB0byBjb21lIGFjcm9zcyBvbmUgb2YgdGhlIGZvbGxvd2luZyBpc3N1ZXMuXFxuXFxuICAgIC0gT3V0ZGF0ZWQgdmlldyB0ZW1wbGF0ZSBmdW5jdGlvbnMgaW4gdGhlIGNsaWVudC1zaWRlLCBjYXVzaW5nIG5ldyBtb2RlbHMgdG8gYnJlYWtcXG4gICAgLSBPdXRkYXRlZCBjbGllbnQtc2lkZSBjb250cm9sbGVycywgY2F1c2luZyBuZXcgbW9kZWxzIHRvIGJyZWFrIG9yIG1pc3Mgb3V0IG9uIGZ1bmN0aW9uYWxpdHlcXG4gICAgLSBPdXRkYXRlZCBtb2RlbHMgaW4gdGhlIGNhY2hlLCBjYXVzaW5nIG5ldyB2aWV3cyBvciBjb250cm9sbGVycyB0byBicmVha1xcblxcbiAgICBUaGUgdmVyc2lvbmluZyBBUEkgaGFuZGxlcyB0aGVzZSBpc3N1ZXMgZ3JhY2VmdWxseSBvbiB5b3VyIGJlaGFsZi4gVGhlIHdheSBpdCB3b3JrcyBpcyB0aGF0IHdoZW5ldmVyIHlvdSBnZXQgYSByZXNwb25zZSBmcm9tIFRhdW51cywgYSBfdmVyc2lvbiBzdHJpbmcgKGNvbmZpZ3VyZWQgb24gdGhlIHNlcnZlci1zaWRlKV8gaXMgaW5jbHVkZWQgd2l0aCBpdC4gSWYgdGhhdCB2ZXJzaW9uIHN0cmluZyBkb2Vzbid0IG1hdGNoIHRoZSBvbmUgc3RvcmVkIGluIHRoZSBjbGllbnQsIHRoZW4gdGhlIGNhY2hlIHdpbGwgYmUgZmx1c2hlZCBhbmQgdGhlIGh1bWFuIHdpbGwgYmUgcmVkaXJlY3RlZCwgZm9yY2luZyBhIGZ1bGwgcGFnZSByZWxvYWQuXFxuXFxuICAgID4gVGhlIHZlcnNpb25pbmcgQVBJIGlzIHVuYWJsZSB0byBoYW5kbGUgY2hhbmdlcyB0byByb3V0ZXMsIGFuZCBpdCdzIHVwIHRvIHlvdSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgYXBwbGljYXRpb24gc3RheXMgYmFja3dhcmRzIGNvbXBhdGlibGUgd2hlbiBpdCBjb21lcyB0byByb3V0aW5nLlxcbiAgICA+XFxuICAgID4gVGhlIHZlcnNpb25pbmcgQVBJIGNhbid0IGludGVydmVuZSB3aGVuIHRoZSBjbGllbnQtc2lkZSBpcyBoZWF2aWx5IHJlbHlpbmcgb24gY2FjaGVkIHZpZXdzIGFuZCBtb2RlbHMsIGFuZCB0aGUgaHVtYW4gaXMgcmVmdXNpbmcgdG8gcmVsb2FkIHRoZWlyIGJyb3dzZXIuIFRoZSBzZXJ2ZXIgaXNuJ3QgYmVpbmcgYWNjZXNzZWQgYW5kIHRodXMgaXQgY2FuJ3QgY29tbXVuaWNhdGUgdGhhdCBldmVyeXRoaW5nIG9uIHRoZSBjYWNoZSBtYXkgaGF2ZSBiZWNvbWUgc3RhbGUuIFRoZSBnb29kIG5ld3MgaXMgdGhhdCB0aGUgaHVtYW4gd29uJ3Qgbm90aWNlIGFueSBvZGRpdGllcywgYXMgdGhlIHNpdGUgd2lsbCBjb250aW51ZSB0byB3b3JrIGFzIGhlIGtub3dzIGl0LiBXaGVuIGhlIGZpbmFsbHkgYXR0ZW1wdHMgdG8gdmlzaXQgc29tZXRoaW5nIHRoYXQgaXNuJ3QgY2FjaGVkLCBhIHJlcXVlc3QgaXMgbWFkZSwgYW5kIHRoZSB2ZXJzaW9uaW5nIGVuZ2luZSByZXNvbHZlcyB2ZXJzaW9uIGRpc2NyZXBhbmNpZXMgZm9yIHRoZW0uXFxuXFxuICAgIE1ha2luZyB1c2Ugb2YgdGhlIHZlcnNpb25pbmcgQVBJIGludm9sdmVzIHNldHRpbmcgdGhlIGB2ZXJzaW9uYCBmaWVsZCBpbiB0aGUgb3B0aW9ucywgd2hlbiBpbnZva2luZyBgdGF1bnVzLm1vdW50YCAqKm9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUsIHVzaW5nIHRoZSBzYW1lIHZhbHVlKiouIFRoZSBUYXVudXMgdmVyc2lvbiBzdHJpbmcgd2lsbCBiZSBhZGRlZCB0byB0aGUgb25lIHlvdSBwcm92aWRlZCwgc28gdGhhdCBUYXVudXMgd2lsbCBrbm93IHRvIHN0YXkgYWxlcnQgZm9yIGNoYW5nZXMgdG8gVGF1bnVzIGl0c2VsZiwgYXMgd2VsbC5cXG5cXG4gICAgWW91IG1heSB1c2UgeW91ciBidWlsZCBpZGVudGlmaWVyIG9yIHRoZSBgdmVyc2lvbmAgZmllbGQgaW4gYHBhY2thZ2UuanNvbmAsIGJ1dCB1bmRlcnN0YW5kIHRoYXQgaXQgbWF5IGNhdXNlIHRoZSBjbGllbnQtc2lkZSB0byBmbHVzaCB0aGUgY2FjaGUgdG9vIG9mdGVuIF8obWF5YmUgZXZlbiBvbiBldmVyeSBkZXBsb3ltZW50KV8uXFxuXFxuICAgIFRoZSBkZWZhdWx0IHZlcnNpb24gc3RyaW5nIGlzIHNldCB0byBgMWAuIFRoZSBUYXVudXMgdmVyc2lvbiB3aWxsIGJlIHByZXBlbmRlZCB0byB5b3VycywgcmVzdWx0aW5nIGluIGEgdmFsdWUgc3VjaCBhcyBgdDMuMC4wO3YxYCB3aGVyZSBUYXVudXMgaXMgcnVubmluZyB2ZXJzaW9uIGAzLjAuMGAgYW5kIHlvdXIgYXBwbGljYXRpb24gaXMgcnVubmluZyB2ZXJzaW9uIGAxYC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBUaGUgc2t5IGlzIHRoZSBsaW1pdCFcXG5cXG4gICAgWW91J3JlIG5vdyBmYW1pbGlhciB3aXRoIGhvdyBUYXVudXMgd29ya3Mgb24gYSBoaWdoLWxldmVsLiBZb3UgaGF2ZSBjb3ZlcmVkIGEgZGVjZW50IGFtb3VudCBvZiBncm91bmQsIGJ1dCB5b3Ugc2hvdWxkbid0IHN0b3AgdGhlcmUuXFxuXFxuICAgIC0gTGVhcm4gbW9yZSBhYm91dCBbdGhlIEFQSSBUYXVudXMgaGFzXVsxOF0gdG8gb2ZmZXJcXG4gICAgLSBHbyB0aHJvdWdoIHRoZSBbcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHRpcHNdWzI1XS4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3IVxcbiAgICAtIF9GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50X1xcbiAgICAgIC0gSmVyZW15IEtlaXRoIGVudW5jaWF0ZXMgW1xcXCJCZSBwcm9ncmVzc2l2ZVxcXCJdWzIwXVxcbiAgICAgIC0gQ2hyaXN0aWFuIEhlaWxtYW5uIGFkdm9jYXRlcyBmb3IgW1xcXCJQcmFnbWF0aWMgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnRcXFwiXVsyNl1cXG4gICAgICAtIEpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyBbXFxcIlByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGlzIGZhc3RlclxcXCJdWzIyXVxcbiAgICAgIC0gSSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgW1xcXCJTdG9wIEJyZWFraW5nIHRoZSBXZWJcXFwiXVsxN11cXG4gICAgICAtIEd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIFtcXFwiNyBQcmluY2lwbGVzIG9mIFJpY2ggV2ViIEFwcGxpY2F0aW9uc1xcXCJdWzI0XVxcbiAgICAgIC0gQWFyb24gR3VzdGFmc29uIHdyaXRlcyBbXFxcIlVuZGVyc3RhbmRpbmcgUHJvZ3Jlc3NpdmUgRW5oYW5jZW1lbnRcXFwiXVsyMV1cXG4gICAgICAtIE9yZGUgU2F1bmRlcnMgZ2l2ZXMgaGlzIHBvaW50IG9mIHZpZXcgaW4gW1xcXCJQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBmb3IgZmF1bHQgdG9sZXJhbmNlXFxcIl1bMjNdXFxuICAgIC0gU2lmdCB0aHJvdWdoIHRoZSBbY29tcGxlbWVudGFyeSBtb2R1bGVzXVsxNV0uIFlvdSBtYXkgZmluZCBzb21ldGhpbmcgeW91IGhhZG4ndCB0aG91Z2h0IG9mIVxcblxcbiAgICBBbHNvLCBnZXQgaW52b2x2ZWQhXFxuXFxuICAgIC0gRm9yayB0aGlzIHJlcG9zaXRvcnkgYW5kIFtzZW5kIHNvbWUgcHVsbCByZXF1ZXN0c11bMTldIHRvIGltcHJvdmUgdGhlc2UgZ3VpZGVzIVxcbiAgICAtIFNlZSBzb21ldGhpbmcsIHNheSBzb21ldGhpbmchIElmIHlvdSBkZXRlY3QgYSBidWcsIFtwbGVhc2UgY3JlYXRlIGFuIGlzc3VlXVsyN10hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgID4gWW91J2xsIGZpbmQgYSBbZnVsbCBmbGVkZ2VkIHZlcnNpb24gb2YgdGhlIEdldHRpbmcgU3RhcnRlZF1bNDFdIHR1dG9yaWFsIGFwcGxpY2F0aW9uIG9uIEdpdEh1Yi5cXG5cXG4gICAgWzFdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxuICAgIFsyXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcbiAgICBbM106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxuICAgIFs1XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvb1xcbiAgICBbNl06IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs3XTogaHR0cDovL2hhcGlqcy5jb21cXG4gICAgWzhdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxuICAgIFs5XTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9SdWJ5X29uX1JhaWxzXFxuICAgIFsxMF06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYW5sL211c3RhY2hlLmpzXFxuICAgIFsxMV06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcbiAgICBbMTJdOiBodHRwOi8vbW96aWxsYS5naXRodWIuaW8vbnVuanVja3MvXFxuICAgIFsxM106IGh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcbiAgICBbMTRdOiBodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcbiAgICBbMTVdOiAvY29tcGxlbWVudHNcXG4gICAgWzE2XTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2phZHVtXFxuICAgIFsxN106IGh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG4gICAgWzE4XTogL2FwaVxcbiAgICBbMTldOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcbiAgICBbMjBdOiBodHRwczovL2FkYWN0aW8uY29tL2pvdXJuYWwvNzcwNlxcbiAgICBbMjFdOiBodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcbiAgICBbMjJdOiBodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxuICAgIFsyM106IGh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXG4gICAgWzI0XTogaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcbiAgICBbMjVdOiAvcGVyZm9ybWFuY2VcXG4gICAgWzI2XTogaHR0cDovL2ljYW50LmNvLnVrL2FydGljbGVzL3ByYWdtYXRpYy1wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC9cXG4gICAgWzI3XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMvaXNzdWVzL25ld1xcbiAgICBbMjhdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbMjldOiBodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxuICAgIFszMF06IGh0dHA6Ly9pLmltZ3VyLmNvbS80UDh2TmU5LnBuZ1xcbiAgICBbMzFdOiBodHRwOi8vaS5pbWd1ci5jb20vbjhtSDRtTi5wbmdcXG4gICAgWzMyXTogaHR0cDovL2kuaW1ndXIuY29tLzA4bG5DZWMucG5nXFxuICAgIFszM106IGh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcbiAgICBbMzRdOiBodHRwOi8vaS5pbWd1ci5jb20vemphSllDcS5wbmdcXG4gICAgWzM1XTogaHR0cDovL2kuaW1ndXIuY29tL052RVd4OXoucG5nXFxuICAgIFszNl06IGh0dHA6Ly9pLmltZ3VyLmNvbS9MZ1pSRm41LnBuZ1xcbiAgICBbMzddOiBodHRwOi8vaS5pbWd1ci5jb20vZkpuSGRZaS5wbmdcXG4gICAgWzM4XTogaHR0cDovL2Jyb3dzZXJpZnkub3JnL1xcbiAgICBbMzldOiBodHRwOi8vaS5pbWd1ci5jb20vNjhPODR3WC5wbmdcXG4gICAgWzQwXTogaHR0cDovL2kuaW1ndXIuY29tL1pVRjZORmwucG5nXFxuICAgIFs0MV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvZ2V0dGluZy1zdGFydGVkXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBlcmZvcm1hbmNlKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcInBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+UGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uPC9oMT5cXG48cD5Gb288L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cXG5cXG4gICAgRm9vXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG5vdEZvdW5kKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJOb3QgRm91bmRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUaGVyZSBkb2Vzbid0IHNlZW0gdG8gYmUgYW55dGhpbmcgaGVyZSB5ZXQuIElmIHlvdSBiZWxpZXZlIHRoaXMgdG8gYmUgYSBtaXN0YWtlLCBwbGVhc2UgbGV0IHVzIGtub3chXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3A+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcImh0dHBzOi8vdHdpdHRlci5jb20vbnpnYlxcXCIgdGFyZ2V0PVxcXCJfYmxhbmtcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIiZtZGFzaDsgQG56Z2JcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJoMSBOb3QgRm91bmRcXG5cXG5wIFRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcXG5wXFxuICBhKGhyZWY9J2h0dHBzOi8vdHdpdHRlci5jb20vbnpnYicsIHRhcmdldD0nX2JsYW5rJykgJm1kYXNoOyBAbnpnYlxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsYXlvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQsIG1vZGVsLCBwYXJ0aWFsKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjwhRE9DVFlQRSBodG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGh0bWwgbGFuZz1cXFwiZW5cXFwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cXFwiaHR0cDovL3NjaGVtYS5vcmcvQmxvZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx0aXRsZT5cIiArIChqYWRlLmVzY2FwZShudWxsID09IChqYWRlX2ludGVycCA9IG1vZGVsLnRpdGxlKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC90aXRsZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGNoYXJzZXQ9XFxcInV0Zi04XFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic2hvcnRjdXQgaWNvblxcXCIgaHJlZj1cXFwiL2Zhdmljb24uaWNvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGh0dHAtZXF1aXY9XFxcIlgtVUEtQ29tcGF0aWJsZVxcXCIgY29udGVudD1cXFwiSUU9ZWRnZSxjaHJvbWU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBuYW1lPVxcXCJ2aWV3cG9ydFxcXCIgY29udGVudD1cXFwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTFcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzdHlsZXNoZWV0XFxcIiB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCIgaHJlZj1cXFwiL2Nzcy9hbGwuY3NzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCJodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT1VbmljYStPbmU6NDAwfFBsYXlmYWlyK0Rpc3BsYXk6NzAwfE1lZ3JpbTo3MDB8RmF1bmErT25lOjQwMGl0YWxpYyw0MDAsNzAwXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaGVhZD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8Ym9keSBpZD1cXFwidG9wXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZGVyPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIiBhcmlhLWxhYmVsPVxcXCJHbyB0byBob21lXFxcIiBjbGFzcz1cXFwibHktdGl0bGVcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUYXVudXNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgyIGNsYXNzPVxcXCJseS1zdWJoZWFkaW5nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gyPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGFzaWRlIGNsYXNzPVxcXCJzYi1zaWRlYmFyXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bmF2IGNsYXNzPVxcXCJzYi1jb250YWluZXJcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx1bCBjbGFzcz1cXFwibnYtaXRlbXNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFib3V0XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkdldHRpbmcgU3RhcnRlZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9hcGlcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJBUEkgRG9jdW1lbnRhdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI3LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkNvbXBsZW1lbnRhcnkgTW9kdWxlc1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlBlcmZvcm1hbmNlIE9wdGltaXphdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9zb3VyY2UtY29kZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlNvdXJjZSBDb2RlXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NoYW5nZWxvZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkNoYW5nZWxvZ1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvdWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L25hdj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYXNpZGU+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1haW4gaWQ9XFxcImFwcGxpY2F0aW9uLXJvb3RcXFwiIGRhdGEtdGF1bnVzPVxcXCJtb2RlbFxcXCIgY2xhc3M9XFxcImx5LW1haW5cXFwiPlwiICsgKG51bGwgPT0gKGphZGVfaW50ZXJwID0gcGFydGlhbCkgPyBcIlwiIDogamFkZV9pbnRlcnApKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9tYWluPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzY3JpcHQgc3JjPVxcXCIvanMvYWxsLmpzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2NyaXB0PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9ib2R5PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9odG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQsXCJtb2RlbFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgubW9kZWw6dHlwZW9mIG1vZGVsIT09XCJ1bmRlZmluZWRcIj9tb2RlbDp1bmRlZmluZWQsXCJwYXJ0aWFsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5wYXJ0aWFsOnR5cGVvZiBwYXJ0aWFsIT09XCJ1bmRlZmluZWRcIj9wYXJ0aWFsOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwiZG9jdHlwZSBodG1sXFxuaHRtbChsYW5nPSdlbicsIGl0ZW1zY29wZSwgaXRlbXR5cGU9J2h0dHA6Ly9zY2hlbWEub3JnL0Jsb2cnKVxcbiAgaGVhZFxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtZXRhKGNoYXJzZXQ9J3V0Zi04JylcXG4gICAgbGluayhyZWw9J3Nob3J0Y3V0IGljb24nLCBocmVmPScvZmF2aWNvbi5pY28nKVxcbiAgICBtZXRhKGh0dHAtZXF1aXY9J1gtVUEtQ29tcGF0aWJsZScsIGNvbnRlbnQ9J0lFPWVkZ2UsY2hyb21lPTEnKVxcbiAgICBtZXRhKG5hbWU9J3ZpZXdwb3J0JywgY29udGVudD0nd2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0nL2Nzcy9hbGwuY3NzJylcXG4gICAgbGluayhyZWw9J3N0eWxlc2hlZXQnLCB0eXBlPSd0ZXh0L2NzcycsIGhyZWY9J2h0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDAnKVxcblxcbiAgYm9keSN0b3BcXG4gICAgaGVhZGVyXFxuICAgICAgaDFcXG4gICAgICAgIGEubHktdGl0bGUoaHJlZj0nLycsIGFyaWEtbGFiZWw9J0dvIHRvIGhvbWUnKSBUYXVudXNcXG4gICAgICBoMi5seS1zdWJoZWFkaW5nIE1pY3JvIElzb21vcnBoaWMgTVZDIEVuZ2luZSBmb3IgTm9kZS5qc1xcblxcbiAgICBhc2lkZS5zYi1zaWRlYmFyXFxuICAgICAgbmF2LnNiLWNvbnRhaW5lclxcbiAgICAgICAgdWwubnYtaXRlbXNcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nLycpIEFib3V0XFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9nZXR0aW5nLXN0YXJ0ZWQnKSBHZXR0aW5nIFN0YXJ0ZWRcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2FwaScpIEFQSSBEb2N1bWVudGF0aW9uXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9jb21wbGVtZW50cycpIENvbXBsZW1lbnRhcnkgTW9kdWxlc1xcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvcGVyZm9ybWFuY2UnKSBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL3NvdXJjZS1jb2RlJykgU291cmNlIENvZGVcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2NoYW5nZWxvZycpIENoYW5nZWxvZ1xcblxcbiAgICBtYWluLmx5LW1haW4jYXBwbGljYXRpb24tcm9vdChkYXRhLXRhdW51cz0nbW9kZWwnKSE9cGFydGlhbFxcbiAgICBzY3JpcHQoc3JjPScvanMvYWxsLmpzJylcXG5cIik7XG59XG59IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGVtcGxhdGVzID0ge1xuICAnZG9jdW1lbnRhdGlvbi9hYm91dCc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9hcGknOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMnKSxcbiAgJ2Vycm9yL25vdC1mb3VuZCc6IHJlcXVpcmUoJy4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzJyksXG4gICdsYXlvdXQnOiByZXF1aXJlKCcuL3ZpZXdzL2xheW91dC5qcycpXG59O1xuXG52YXIgY29udHJvbGxlcnMgPSB7XG4gICdkb2N1bWVudGF0aW9uL2Fib3V0JzogcmVxdWlyZSgnLi4vY2xpZW50L2pzL2NvbnRyb2xsZXJzL2RvY3VtZW50YXRpb24vYWJvdXQuanMnKVxufTtcblxudmFyIHJvdXRlcyA9IHtcbiAgJy8nOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hYm91dCdcbiAgfSxcbiAgJy9nZXR0aW5nLXN0YXJ0ZWQnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQnXG4gIH0sXG4gICcvYXBpJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vYXBpJ1xuICB9LFxuICAnL2NvbXBsZW1lbnRzJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMnXG4gIH0sXG4gICcvcGVyZm9ybWFuY2UnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZSdcbiAgfSxcbiAgJy9zb3VyY2UtY29kZSc6IHtcbiAgICBpZ25vcmU6IHRydWVcbiAgfSxcbiAgJy9jaGFuZ2Vsb2cnOiB7XG4gICAgaWdub3JlOiB0cnVlXG4gIH0sXG4gICcvOmNhdGNoYWxsKic6IHtcbiAgICBhY3Rpb246ICdlcnJvci9ub3QtZm91bmQnXG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcbiAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxuICByb3V0ZXM6IHJvdXRlc1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnNvbGUubG9nKCdXZWxjb21lIHRvIFRhdW51cyBkb2N1bWVudGF0aW9uIG1pbmktc2l0ZSEnKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciAkID0gcmVxdWlyZSgnZG9taW51cycpO1xudmFyIHJhZiA9IHJlcXVpcmUoJ3JhZicpO1xudmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xudmFyIHRocm90dGxlID0gcmVxdWlyZSgnLi90aHJvdHRsZScpO1xudmFyIHNsb3dTY3JvbGxDaGVjayA9IHRocm90dGxlKHNjcm9sbENoZWNrLCA1MCk7XG52YXIgaHggPSAvXmhbMS02XSQvaTtcbnZhciBoZWFkaW5nO1xuXG5mdW5jdGlvbiBjb252ZW50aW9ucyAoY29udGFpbmVyKSB7XG4gICQoJ2JvZHknKS5vbignY2xpY2snLCAnaDEsaDIsaDMsaDQsaDUsaDYnLCBoZWFkaW5nQ2xpY2spO1xuXG4gIHJhZihzY3JvbGwpO1xufVxuXG5mdW5jdGlvbiBzY3JvbGwgKCkge1xuICBzbG93U2Nyb2xsQ2hlY2soKTtcbiAgcmFmKHNjcm9sbCk7XG59XG5cbmZ1bmN0aW9uIHNjcm9sbENoZWNrICgpIHtcbiAgdmFyIGZvdW5kID0gJCgnbWFpbicpLmZpbmQoJ2gxLGgyLGgzLGg0LGg1LGg2JykuZmlsdGVyKGluVmlld3BvcnQpO1xuICBpZiAoZm91bmQubGVuZ3RoID09PSAwIHx8IGhlYWRpbmcgJiYgZm91bmRbMF0gPT09IGhlYWRpbmdbMF0pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGhlYWRpbmcpIHtcbiAgICBoZWFkaW5nLnJlbW92ZUNsYXNzKCd1di1oaWdobGlnaHQnKTtcbiAgfVxuICBoZWFkaW5nID0gZm91bmQuaSgwKTtcbiAgaGVhZGluZy5hZGRDbGFzcygndXYtaGlnaGxpZ2h0Jyk7XG59XG5cbmZ1bmN0aW9uIGluVmlld3BvcnQgKGVsZW1lbnQpIHtcbiAgdmFyIHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICB2YXIgdmlld2FibGUgPSAoXG4gICAgTWF0aC5jZWlsKHJlY3QudG9wKSA+PSAwICYmXG4gICAgTWF0aC5jZWlsKHJlY3QubGVmdCkgPj0gMCAmJlxuICAgIE1hdGguZmxvb3IocmVjdC5ib3R0b20pIDw9ICh3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkgJiZcbiAgICBNYXRoLmZsb29yKHJlY3QucmlnaHQpIDw9ICh3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGgpXG4gICk7XG4gIHJldHVybiB2aWV3YWJsZTtcbn1cblxuZnVuY3Rpb24gZmluZEhlYWRpbmcgKGUpIHtcbiAgdmFyIGggPSBlLnRhcmdldDtcbiAgd2hpbGUgKGggJiYgIWh4LnRlc3QoaC50YWdOYW1lKSkge1xuICAgIGggPSBoLnBhcmVudEVsZW1lbnQ7XG4gIH1cbiAgcmV0dXJuIGg7XG59XG5cbmZ1bmN0aW9uIGhlYWRpbmdDbGljayAoZSkge1xuICB2YXIgaCA9IGZpbmRIZWFkaW5nKGUpO1xuICBpZiAoaCAmJiBoLmlkKSB7XG4gICAgdGF1bnVzLm5hdmlnYXRlKCcjJyArIGguaWQpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY29udmVudGlvbnM7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbi8vIGltcG9ydCB0aGUgdGF1bnVzIG1vZHVsZVxudmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xuXG4vLyBpbXBvcnQgdGhlIHdpcmluZyBtb2R1bGUgZXhwb3J0ZWQgYnkgVGF1bnVzXG52YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcblxuLy8gaW1wb3J0IGNvbnZlbnRpb25zXG52YXIgY29udmVudGlvbnMgPSByZXF1aXJlKCcuL2NvbnZlbnRpb25zJyk7XG5cbi8vIGdldCB0aGUgPG1haW4+IGVsZW1lbnRcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGxpY2F0aW9uLXJvb3QnKTtcblxuLy8gc2V0IHVwIGNvbnZlbnRpb25zIHRoYXQgZ2V0IGV4ZWN1dGVkIGZvciBldmVyeSB2aWV3XG50YXVudXMub24oJ3JlbmRlcicsIGNvbnZlbnRpb25zKTtcblxuLy8gbW91bnQgdGF1bnVzIHNvIGl0IHN0YXJ0cyBpdHMgcm91dGluZyBlbmdpbmVcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xuXG4vLyBjcmVhdGUgZ2xvYmFscyB0byBtYWtlIGl0IGVhc3kgdG8gZGVidWdcbi8vIGRvbid0IGRvIHRoaXMgaW4gcHJvZHVjdGlvbiFcbmdsb2JhbC4kID0gcmVxdWlyZSgnZG9taW51cycpO1xuZ2xvYmFsLnRhdW51cyA9IHRhdW51cztcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIHRocm90dGxlIChmbiwgdCkge1xuICB2YXIgY2FjaGU7XG4gIHZhciBsYXN0ID0gLTE7XG4gIHJldHVybiBmdW5jdGlvbiB0aHJvdHRsZWQgKCkge1xuICAgIHZhciBub3cgPSBEYXRlLm5vdygpO1xuICAgIGlmIChub3cgLSBsYXN0ID4gdCkge1xuICAgICAgY2FjaGUgPSBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgbGFzdCA9IG5vdztcbiAgICB9XG4gICAgcmV0dXJuIGNhY2hlO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRocm90dGxlO1xuZ2xvYmFsLnRocm90dGxlPXRocm90dGxlO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciBwb3NlciA9IHJlcXVpcmUoJy4vc3JjL25vZGUnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBwb3NlcjtcblxuWydBcnJheScsICdGdW5jdGlvbicsICdPYmplY3QnLCAnRGF0ZScsICdTdHJpbmcnXS5mb3JFYWNoKHBvc2UpO1xuXG5mdW5jdGlvbiBwb3NlICh0eXBlKSB7XG4gIHBvc2VyW3R5cGVdID0gZnVuY3Rpb24gcG9zZUNvbXB1dGVkVHlwZSAoKSB7IHJldHVybiBwb3Nlcih0eXBlKTsgfTtcbn1cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGQgPSBnbG9iYWwuZG9jdW1lbnQ7XG5cbmZ1bmN0aW9uIHBvc2VyICh0eXBlKSB7XG4gIHZhciBpZnJhbWUgPSBkLmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXG4gIGlmcmFtZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICBkLmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblxuICByZXR1cm4gbWFwKHR5cGUsIGlmcmFtZS5jb250ZW50V2luZG93KTtcbn1cblxuZnVuY3Rpb24gbWFwICh0eXBlLCBzb3VyY2UpIHsgLy8gZm9yd2FyZCBwb2x5ZmlsbHMgdG8gdGhlIHN0b2xlbiByZWZlcmVuY2UhXG4gIHZhciBvcmlnaW5hbCA9IHdpbmRvd1t0eXBlXS5wcm90b3R5cGU7XG4gIHZhciB2YWx1ZSA9IHNvdXJjZVt0eXBlXTtcbiAgdmFyIHByb3A7XG5cbiAgZm9yIChwcm9wIGluIG9yaWdpbmFsKSB7XG4gICAgdmFsdWUucHJvdG90eXBlW3Byb3BdID0gb3JpZ2luYWxbcHJvcF07XG4gIH1cblxuICByZXR1cm4gdmFsdWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcG9zZXI7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXhwYW5kbyA9ICdzZWt0b3ItJyArIERhdGUubm93KCk7XG52YXIgcnNpYmxpbmdzID0gL1srfl0vO1xudmFyIGRvY3VtZW50ID0gZ2xvYmFsLmRvY3VtZW50O1xudmFyIGRlbCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbnZhciBtYXRjaCA9IGRlbC5tYXRjaGVzIHx8XG4gICAgICAgICAgICBkZWwud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8XG4gICAgICAgICAgICBkZWwubW96TWF0Y2hlc1NlbGVjdG9yIHx8XG4gICAgICAgICAgICBkZWwub01hdGNoZXNTZWxlY3RvciB8fFxuICAgICAgICAgICAgZGVsLm1zTWF0Y2hlc1NlbGVjdG9yO1xuXG5mdW5jdGlvbiBxc2EgKHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gIHZhciBleGlzdGVkLCBpZCwgcHJlZml4LCBwcmVmaXhlZCwgYWRhcHRlciwgaGFjayA9IGNvbnRleHQgIT09IGRvY3VtZW50O1xuICBpZiAoaGFjaykgeyAvLyBpZCBoYWNrIGZvciBjb250ZXh0LXJvb3RlZCBxdWVyaWVzXG4gICAgZXhpc3RlZCA9IGNvbnRleHQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgIGlkID0gZXhpc3RlZCB8fCBleHBhbmRvO1xuICAgIHByZWZpeCA9ICcjJyArIGlkICsgJyAnO1xuICAgIHByZWZpeGVkID0gcHJlZml4ICsgc2VsZWN0b3IucmVwbGFjZSgvLC9nLCAnLCcgKyBwcmVmaXgpO1xuICAgIGFkYXB0ZXIgPSByc2libGluZ3MudGVzdChzZWxlY3RvcikgJiYgY29udGV4dC5wYXJlbnROb2RlO1xuICAgIGlmICghZXhpc3RlZCkgeyBjb250ZXh0LnNldEF0dHJpYnV0ZSgnaWQnLCBpZCk7IH1cbiAgfVxuICB0cnkge1xuICAgIHJldHVybiAoYWRhcHRlciB8fCBjb250ZXh0KS5xdWVyeVNlbGVjdG9yQWxsKHByZWZpeGVkIHx8IHNlbGVjdG9yKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBbXTtcbiAgfSBmaW5hbGx5IHtcbiAgICBpZiAoZXhpc3RlZCA9PT0gbnVsbCkgeyBjb250ZXh0LnJlbW92ZUF0dHJpYnV0ZSgnaWQnKTsgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZpbmQgKHNlbGVjdG9yLCBjdHgsIGNvbGxlY3Rpb24sIHNlZWQpIHtcbiAgdmFyIGVsZW1lbnQ7XG4gIHZhciBjb250ZXh0ID0gY3R4IHx8IGRvY3VtZW50O1xuICB2YXIgcmVzdWx0cyA9IGNvbGxlY3Rpb24gfHwgW107XG4gIHZhciBpID0gMDtcbiAgaWYgKHR5cGVvZiBzZWxlY3RvciAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuICBpZiAoY29udGV4dC5ub2RlVHlwZSAhPT0gMSAmJiBjb250ZXh0Lm5vZGVUeXBlICE9PSA5KSB7XG4gICAgcmV0dXJuIFtdOyAvLyBiYWlsIGlmIGNvbnRleHQgaXMgbm90IGFuIGVsZW1lbnQgb3IgZG9jdW1lbnRcbiAgfVxuICBpZiAoc2VlZCkge1xuICAgIHdoaWxlICgoZWxlbWVudCA9IHNlZWRbaSsrXSkpIHtcbiAgICAgIGlmIChtYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IpKSB7XG4gICAgICAgIHJlc3VsdHMucHVzaChlbGVtZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cy5wdXNoLmFwcGx5KHJlc3VsdHMsIHFzYShzZWxlY3RvciwgY29udGV4dCkpO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBtYXRjaGVzIChzZWxlY3RvciwgZWxlbWVudHMpIHtcbiAgcmV0dXJuIGZpbmQoc2VsZWN0b3IsIG51bGwsIG51bGwsIGVsZW1lbnRzKTtcbn1cblxuZnVuY3Rpb24gbWF0Y2hlc1NlbGVjdG9yIChlbGVtZW50LCBzZWxlY3Rvcikge1xuICByZXR1cm4gbWF0Y2guY2FsbChlbGVtZW50LCBzZWxlY3Rvcik7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZmluZDtcblxuZmluZC5tYXRjaGVzID0gbWF0Y2hlcztcbmZpbmQubWF0Y2hlc1NlbGVjdG9yID0gbWF0Y2hlc1NlbGVjdG9yO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHBvc2VyID0gcmVxdWlyZSgncG9zZXInKTtcbnZhciBEb21pbnVzID0gcG9zZXIuQXJyYXkoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBEb21pbnVzO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgJCA9IHJlcXVpcmUoJy4vcHVibGljJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIGRvbSA9IHJlcXVpcmUoJy4vZG9tJyk7XG52YXIgY2xhc3NlcyA9IHJlcXVpcmUoJy4vY2xhc3NlcycpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xuXG5mdW5jdGlvbiBlcXVhbHMgKHNlbGVjdG9yKSB7XG4gIHJldHVybiBmdW5jdGlvbiBlcXVhbHMgKGVsZW0pIHtcbiAgICByZXR1cm4gZG9tLm1hdGNoZXMoZWxlbSwgc2VsZWN0b3IpO1xuICB9O1xufVxuXG5mdW5jdGlvbiBzdHJhaWdodCAocHJvcCwgb25lKSB7XG4gIHJldHVybiBmdW5jdGlvbiBkb21NYXBwaW5nIChzZWxlY3Rvcikge1xuICAgIHZhciByZXN1bHQgPSB0aGlzLm1hcChmdW5jdGlvbiAoZWxlbSkge1xuICAgICAgcmV0dXJuIGRvbVtwcm9wXShlbGVtLCBzZWxlY3Rvcik7XG4gICAgfSk7XG4gICAgdmFyIHJlc3VsdHMgPSBjb3JlLmZsYXR0ZW4ocmVzdWx0KTtcbiAgICByZXR1cm4gb25lID8gcmVzdWx0c1swXSA6IHJlc3VsdHM7XG4gIH07XG59XG5cbkRvbWludXMucHJvdG90eXBlLnByZXYgPSBzdHJhaWdodCgncHJldicpO1xuRG9taW51cy5wcm90b3R5cGUubmV4dCA9IHN0cmFpZ2h0KCduZXh0Jyk7XG5Eb21pbnVzLnByb3RvdHlwZS5wYXJlbnQgPSBzdHJhaWdodCgncGFyZW50Jyk7XG5Eb21pbnVzLnByb3RvdHlwZS5wYXJlbnRzID0gc3RyYWlnaHQoJ3BhcmVudHMnKTtcbkRvbWludXMucHJvdG90eXBlLmNoaWxkcmVuID0gc3RyYWlnaHQoJ2NoaWxkcmVuJyk7XG5Eb21pbnVzLnByb3RvdHlwZS5maW5kID0gc3RyYWlnaHQoJ3FzYScpO1xuRG9taW51cy5wcm90b3R5cGUuZmluZE9uZSA9IHN0cmFpZ2h0KCdxcycsIHRydWUpO1xuXG5Eb21pbnVzLnByb3RvdHlwZS53aGVyZSA9IGZ1bmN0aW9uIChzZWxlY3Rvcikge1xuICByZXR1cm4gdGhpcy5maWx0ZXIoZXF1YWxzKHNlbGVjdG9yKSk7XG59O1xuXG5Eb21pbnVzLnByb3RvdHlwZS5pcyA9IGZ1bmN0aW9uIChzZWxlY3Rvcikge1xuICByZXR1cm4gdGhpcy5zb21lKGVxdWFscyhzZWxlY3RvcikpO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUuaSA9IGZ1bmN0aW9uIChpbmRleCkge1xuICByZXR1cm4gbmV3IERvbWludXModGhpc1tpbmRleF0pO1xufTtcblxuZnVuY3Rpb24gY29tcGFyZUZhY3RvcnkgKGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiBjb21wYXJlICgpIHtcbiAgICAkLmFwcGx5KG51bGwsIGFyZ3VtZW50cykuZm9yRWFjaChmbiwgdGhpcyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG59XG5cbkRvbWludXMucHJvdG90eXBlLmFuZCA9IGNvbXBhcmVGYWN0b3J5KGZ1bmN0aW9uIGFkZE9uZSAoZWxlbSkge1xuICBpZiAodGhpcy5pbmRleE9mKGVsZW0pID09PSAtMSkge1xuICAgIHRoaXMucHVzaChlbGVtKTtcbiAgfVxuICByZXR1cm4gdGhpcztcbn0pO1xuXG5Eb21pbnVzLnByb3RvdHlwZS5idXQgPSBjb21wYXJlRmFjdG9yeShmdW5jdGlvbiBhZGRPbmUgKGVsZW0pIHtcbiAgdmFyIGluZGV4ID0gdGhpcy5pbmRleE9mKGVsZW0pO1xuICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgdGhpcy5zcGxpY2UoaW5kZXgsIDEpO1xuICB9XG4gIHJldHVybiB0aGlzO1xufSk7XG5cbkRvbWludXMucHJvdG90eXBlLmNzcyA9IGZ1bmN0aW9uIChuYW1lLCB2YWx1ZSkge1xuICB2YXIgcHJvcHM7XG4gIHZhciBtYW55ID0gbmFtZSAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCc7XG4gIHZhciBnZXR0ZXIgPSAhbWFueSAmJiAhdmFsdWU7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gdGhpcy5sZW5ndGggPyBkb20uZ2V0Q3NzKHRoaXNbMF0sIG5hbWUpIDogbnVsbDtcbiAgfVxuICBpZiAobWFueSkge1xuICAgIHByb3BzID0gbmFtZTtcbiAgfSBlbHNlIHtcbiAgICBwcm9wcyA9IHt9O1xuICAgIHByb3BzW25hbWVdID0gdmFsdWU7XG4gIH1cbiAgdGhpcy5mb3JFYWNoKGRvbS5zZXRDc3MocHJvcHMpKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5Eb21pbnVzLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uICh0eXBlcywgZmlsdGVyLCBmbikge1xuICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICB0eXBlcy5zcGxpdCgnICcpLmZvckVhY2goZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgIGRvbS5vbihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24gKHR5cGVzLCBmaWx0ZXIsIGZuKSB7XG4gIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgIHR5cGVzLnNwbGl0KCcgJykuZm9yRWFjaChmdW5jdGlvbiAodHlwZSkge1xuICAgICAgZG9tLm9mZihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuW1xuICBbJ2FkZENsYXNzJywgY2xhc3Nlcy5hZGRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3NldENsYXNzJywgY2xhc3Nlcy5zZXRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3JlbW92ZScsIGRvbS5yZW1vdmVdXG5dLmZvckVhY2gobWFwTWV0aG9kcyk7XG5cbmZ1bmN0aW9uIG1hcE1ldGhvZHMgKGRhdGEpIHtcbiAgRG9taW51cy5wcm90b3R5cGVbZGF0YVswXV0gPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICAgIGRhdGFbMV0oZWxlbSwgdmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5bXG4gIFsnYXBwZW5kJywgZG9tLmFwcGVuZF0sXG4gIFsnYXBwZW5kVG8nLCBkb20uYXBwZW5kVG9dLFxuICBbJ3ByZXBlbmQnLCBkb20ucHJlcGVuZF0sXG4gIFsncHJlcGVuZFRvJywgZG9tLnByZXBlbmRUb10sXG4gIFsnYmVmb3JlJywgZG9tLmJlZm9yZV0sXG4gIFsnYmVmb3JlT2YnLCBkb20uYmVmb3JlT2ZdLFxuICBbJ2FmdGVyJywgZG9tLmFmdGVyXSxcbiAgWydhZnRlck9mJywgZG9tLmFmdGVyT2ZdLFxuICBbJ3Nob3cnLCBkb20uc2hvd10sXG4gIFsnaGlkZScsIGRvbS5oaWRlXVxuXS5mb3JFYWNoKG1hcE1hbmlwdWxhdGlvbik7XG5cbmZ1bmN0aW9uIG1hcE1hbmlwdWxhdGlvbiAoZGF0YSkge1xuICBEb21pbnVzLnByb3RvdHlwZVtkYXRhWzBdXSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIGRhdGFbMV0odGhpcywgdmFsdWUpO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5oYXNDbGFzcyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICByZXR1cm4gdGhpcy5zb21lKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgcmV0dXJuIGNsYXNzZXMuY29udGFpbnMoZWxlbSwgdmFsdWUpO1xuICB9KTtcbn07XG5cbkRvbWludXMucHJvdG90eXBlLmF0dHIgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAyO1xuICB2YXIgcmVzdWx0ID0gdGhpcy5tYXAoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICByZXR1cm4gZ2V0dGVyID8gZG9tLmF0dHIoZWxlbSwgbmFtZSkgOiBkb20uYXR0cihlbGVtLCBuYW1lLCB2YWx1ZSk7XG4gIH0pO1xuICByZXR1cm4gZ2V0dGVyID8gcmVzdWx0WzBdIDogdGhpcztcbn07XG5cbmZ1bmN0aW9uIGtleVZhbHVlIChrZXksIHZhbHVlKSB7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMjtcbiAgaWYgKGdldHRlcikge1xuICAgIHJldHVybiB0aGlzLmxlbmd0aCA/IGRvbVtrZXldKHRoaXNbMF0pIDogJyc7XG4gIH1cbiAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgZG9tW2tleV0oZWxlbSwgdmFsdWUpO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGtleVZhbHVlUHJvcGVydHkgKHByb3ApIHtcbiAgRG9taW51cy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbiBhY2Nlc3NvciAodmFsdWUpIHtcbiAgICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDE7XG4gICAgaWYgKGdldHRlcikge1xuICAgICAgcmV0dXJuIGtleVZhbHVlLmNhbGwodGhpcywgcHJvcCk7XG4gICAgfVxuICAgIHJldHVybiBrZXlWYWx1ZS5jYWxsKHRoaXMsIHByb3AsIHZhbHVlKTtcbiAgfTtcbn1cblxuWydodG1sJywgJ3RleHQnLCAndmFsdWUnXS5mb3JFYWNoKGtleVZhbHVlUHJvcGVydHkpO1xuXG5Eb21pbnVzLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMubWFwKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgcmV0dXJuIGRvbS5jbG9uZShlbGVtKTtcbiAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vcHVibGljJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0cmltID0gL15cXHMrfFxccyskL2c7XG52YXIgd2hpdGVzcGFjZSA9IC9cXHMrL2c7XG5cbmZ1bmN0aW9uIGludGVycHJldCAoaW5wdXQpIHtcbiAgcmV0dXJuIHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgPyBpbnB1dC5yZXBsYWNlKHRyaW0sICcnKS5zcGxpdCh3aGl0ZXNwYWNlKSA6IGlucHV0O1xufVxuXG5mdW5jdGlvbiBjbGFzc2VzIChub2RlKSB7XG4gIHJldHVybiBub2RlLmNsYXNzTmFtZS5yZXBsYWNlKHRyaW0sICcnKS5zcGxpdCh3aGl0ZXNwYWNlKTtcbn1cblxuZnVuY3Rpb24gc2V0IChub2RlLCBpbnB1dCkge1xuICBub2RlLmNsYXNzTmFtZSA9IGludGVycHJldChpbnB1dCkuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBhZGQgKG5vZGUsIGlucHV0KSB7XG4gIHZhciBjdXJyZW50ID0gcmVtb3ZlKG5vZGUsIGlucHV0KTtcbiAgdmFyIHZhbHVlcyA9IGludGVycHJldChpbnB1dCk7XG4gIGN1cnJlbnQucHVzaC5hcHBseShjdXJyZW50LCB2YWx1ZXMpO1xuICBzZXQobm9kZSwgY3VycmVudCk7XG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiByZW1vdmUgKG5vZGUsIGlucHV0KSB7XG4gIHZhciBjdXJyZW50ID0gY2xhc3Nlcyhub2RlKTtcbiAgdmFyIHZhbHVlcyA9IGludGVycHJldChpbnB1dCk7XG4gIHZhbHVlcy5mb3JFYWNoKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHZhciBpID0gY3VycmVudC5pbmRleE9mKHZhbHVlKTtcbiAgICBpZiAoaSAhPT0gLTEpIHtcbiAgICAgIGN1cnJlbnQuc3BsaWNlKGksIDEpO1xuICAgIH1cbiAgfSk7XG4gIHNldChub2RlLCBjdXJyZW50KTtcbiAgcmV0dXJuIGN1cnJlbnQ7XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zIChub2RlLCBpbnB1dCkge1xuICB2YXIgY3VycmVudCA9IGNsYXNzZXMobm9kZSk7XG4gIHZhciB2YWx1ZXMgPSBpbnRlcnByZXQoaW5wdXQpO1xuXG4gIHJldHVybiB2YWx1ZXMuZXZlcnkoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGN1cnJlbnQuaW5kZXhPZih2YWx1ZSkgIT09IC0xO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkLFxuICByZW1vdmU6IHJlbW92ZSxcbiAgY29udGFpbnM6IGNvbnRhaW5zLFxuICBzZXQ6IHNldCxcbiAgZ2V0OiBjbGFzc2VzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIHByb3RvID0gRG9taW51cy5wcm90b3R5cGU7XG5cbmZ1bmN0aW9uIEFwcGxpZWQgKGFyZ3MpIHtcbiAgcmV0dXJuIERvbWludXMuYXBwbHkodGhpcywgYXJncyk7XG59XG5cbkFwcGxpZWQucHJvdG90eXBlID0gcHJvdG87XG5cblsnbWFwJywgJ2ZpbHRlcicsICdjb25jYXQnXS5mb3JFYWNoKGVuc3VyZSk7XG5cbmZ1bmN0aW9uIGVuc3VyZSAoa2V5KSB7XG4gIHZhciBvcmlnaW5hbCA9IHByb3RvW2tleV07XG4gIHByb3RvW2tleV0gPSBmdW5jdGlvbiBhcHBsaWVkICgpIHtcbiAgICByZXR1cm4gYXBwbHkob3JpZ2luYWwuYXBwbHkodGhpcywgYXJndW1lbnRzKSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGFwcGx5IChhKSB7XG4gIHJldHVybiBuZXcgQXBwbGllZChhKTtcbn1cblxuZnVuY3Rpb24gY2FzdCAoYSkge1xuICBpZiAoYSBpbnN0YW5jZW9mIERvbWludXMpIHtcbiAgICByZXR1cm4gYTtcbiAgfVxuICBpZiAoIWEpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoKTtcbiAgfVxuICBpZiAodGVzdC5pc0VsZW1lbnQoYSkpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoYSk7XG4gIH1cbiAgaWYgKCF0ZXN0LmlzQXJyYXkoYSkpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoKTtcbiAgfVxuICByZXR1cm4gYXBwbHkoYSkuZmlsdGVyKGZ1bmN0aW9uIChpKSB7XG4gICAgcmV0dXJuIHRlc3QuaXNFbGVtZW50KGkpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmxhdHRlbiAoYSwgY2FjaGUpIHtcbiAgcmV0dXJuIGEucmVkdWNlKGZ1bmN0aW9uIChjdXJyZW50LCBpdGVtKSB7XG4gICAgaWYgKERvbWludXMuaXNBcnJheShpdGVtKSkge1xuICAgICAgcmV0dXJuIGZsYXR0ZW4oaXRlbSwgY3VycmVudCk7XG4gICAgfSBlbHNlIGlmIChjdXJyZW50LmluZGV4T2YoaXRlbSkgPT09IC0xKSB7XG4gICAgICByZXR1cm4gY3VycmVudC5jb25jYXQoaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiBjdXJyZW50O1xuICB9LCBjYWNoZSB8fCBuZXcgRG9taW51cygpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFwcGx5OiBhcHBseSxcbiAgY2FzdDogY2FzdCxcbiAgZmxhdHRlbjogZmxhdHRlblxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHNla3RvciA9IHJlcXVpcmUoJ3Nla3RvcicpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NvcmUnKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xudmFyIHRleHQgPSByZXF1aXJlKCcuL3RleHQnKTtcbnZhciB0ZXN0ID0gcmVxdWlyZSgnLi90ZXN0Jyk7XG52YXIgYXBpID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBkZWxlZ2F0ZXMgPSB7fTtcblxuZnVuY3Rpb24gY2FzdENvbnRleHQgKGNvbnRleHQpIHtcbiAgaWYgKHR5cGVvZiBjb250ZXh0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBhcGkucXMobnVsbCwgY29udGV4dCk7XG4gIH1cbiAgaWYgKHRlc3QuaXNFbGVtZW50KGNvbnRleHQpKSB7XG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgaWYgKGNvbnRleHQgaW5zdGFuY2VvZiBEb21pbnVzKSB7XG4gICAgcmV0dXJuIGNvbnRleHRbMF07XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmFwaS5xc2EgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgdmFyIHJlc3VsdHMgPSBuZXcgRG9taW51cygpO1xuICByZXR1cm4gc2VrdG9yKHNlbGVjdG9yLCBjYXN0Q29udGV4dChlbGVtKSwgcmVzdWx0cyk7XG59O1xuXG5hcGkucXMgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIGFwaS5xc2EoZWxlbSwgc2VsZWN0b3IpWzBdO1xufTtcblxuYXBpLm1hdGNoZXMgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIHNla3Rvci5tYXRjaGVzU2VsZWN0b3IoZWxlbSwgc2VsZWN0b3IpO1xufTtcblxuZnVuY3Rpb24gcmVsYXRlZEZhY3RvcnkgKHByb3ApIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHJlbGF0ZWQgKGVsZW0sIHNlbGVjdG9yKSB7XG4gICAgdmFyIHJlbGF0aXZlID0gZWxlbVtwcm9wXTtcbiAgICBpZiAocmVsYXRpdmUpIHtcbiAgICAgIGlmICghc2VsZWN0b3IgfHwgYXBpLm1hdGNoZXMocmVsYXRpdmUsIHNlbGVjdG9yKSkge1xuICAgICAgICByZXR1cm4gY29yZS5jYXN0KHJlbGF0aXZlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH07XG59XG5cbmFwaS5wcmV2ID0gcmVsYXRlZEZhY3RvcnkoJ3ByZXZpb3VzRWxlbWVudFNpYmxpbmcnKTtcbmFwaS5uZXh0ID0gcmVsYXRlZEZhY3RvcnkoJ25leHRFbGVtZW50U2libGluZycpO1xuYXBpLnBhcmVudCA9IHJlbGF0ZWRGYWN0b3J5KCdwYXJlbnRFbGVtZW50Jyk7XG5cbmZ1bmN0aW9uIG1hdGNoZXMgKGVsZW0sIHZhbHVlKSB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEb21pbnVzKSB7XG4gICAgcmV0dXJuIHZhbHVlLmluZGV4T2YoZWxlbSkgIT09IC0xO1xuICB9XG4gIGlmICh0ZXN0LmlzRWxlbWVudCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gZWxlbSA9PT0gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIGFwaS5tYXRjaGVzKGVsZW0sIHZhbHVlKTtcbn1cblxuYXBpLnBhcmVudHMgPSBmdW5jdGlvbiAoZWxlbSwgdmFsdWUpIHtcbiAgdmFyIG5vZGVzID0gW107XG4gIHZhciBub2RlID0gZWxlbTtcbiAgd2hpbGUgKG5vZGUucGFyZW50RWxlbWVudCkge1xuICAgIGlmIChtYXRjaGVzKG5vZGUucGFyZW50RWxlbWVudCwgdmFsdWUpKSB7XG4gICAgICBub2Rlcy5wdXNoKG5vZGUucGFyZW50RWxlbWVudCk7XG4gICAgfVxuICAgIG5vZGUgPSBub2RlLnBhcmVudEVsZW1lbnQ7XG4gIH1cbiAgcmV0dXJuIGNvcmUuYXBwbHkobm9kZXMpO1xufTtcblxuYXBpLmNoaWxkcmVuID0gZnVuY3Rpb24gKGVsZW0sIHZhbHVlKSB7XG4gIHZhciBub2RlcyA9IFtdO1xuICB2YXIgY2hpbGRyZW4gPSBlbGVtLmNoaWxkcmVuO1xuICB2YXIgY2hpbGQ7XG4gIHZhciBpO1xuICBmb3IgKGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICBjaGlsZCA9IGNoaWxkcmVuW2ldO1xuICAgIGlmIChtYXRjaGVzKGNoaWxkLCB2YWx1ZSkpIHtcbiAgICAgIG5vZGVzLnB1c2goY2hpbGQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29yZS5hcHBseShub2Rlcyk7XG59O1xuXG4vLyB0aGlzIG1ldGhvZCBjYWNoZXMgZGVsZWdhdGVzIHNvIHRoYXQgLm9mZigpIHdvcmtzIHNlYW1sZXNzbHlcbmZ1bmN0aW9uIGRlbGVnYXRlIChyb290LCBmaWx0ZXIsIGZuKSB7XG4gIGlmIChkZWxlZ2F0ZXNbZm4uX2RkXSkge1xuICAgIHJldHVybiBkZWxlZ2F0ZXNbZm4uX2RkXTtcbiAgfVxuICBmbi5fZGQgPSBEYXRlLm5vdygpO1xuICBkZWxlZ2F0ZXNbZm4uX2RkXSA9IGRlbGVnYXRvcjtcbiAgZnVuY3Rpb24gZGVsZWdhdG9yIChlKSB7XG4gICAgdmFyIGVsZW0gPSBlLnRhcmdldDtcbiAgICB3aGlsZSAoZWxlbSAmJiBlbGVtICE9PSByb290KSB7XG4gICAgICBpZiAoYXBpLm1hdGNoZXMoZWxlbSwgZmlsdGVyKSkge1xuICAgICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyByZXR1cm47XG4gICAgICB9XG4gICAgICBlbGVtID0gZWxlbS5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVsZWdhdG9yO1xufVxuXG5hcGkub24gPSBmdW5jdGlvbiAoZWxlbSwgdHlwZSwgZmlsdGVyLCBmbikge1xuICBpZiAoZm4gPT09IHZvaWQgMCkge1xuICAgIGV2ZW50cy5hZGQoZWxlbSwgdHlwZSwgZmlsdGVyKTsgLy8gZmlsdGVyIF9pc18gZm5cbiAgfSBlbHNlIHtcbiAgICBldmVudHMuYWRkKGVsZW0sIHR5cGUsIGRlbGVnYXRlKGVsZW0sIGZpbHRlciwgZm4pKTtcbiAgfVxufTtcblxuYXBpLm9mZiA9IGZ1bmN0aW9uIChlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKSB7XG4gIGlmIChmbiA9PT0gdm9pZCAwKSB7XG4gICAgZXZlbnRzLnJlbW92ZShlbGVtLCB0eXBlLCBmaWx0ZXIpOyAvLyBmaWx0ZXIgX2lzXyBmblxuICB9IGVsc2Uge1xuICAgIGV2ZW50cy5yZW1vdmUoZWxlbSwgdHlwZSwgZGVsZWdhdGUoZWxlbSwgZmlsdGVyLCBmbikpO1xuICB9XG59O1xuXG5hcGkuaHRtbCA9IGZ1bmN0aW9uIChlbGVtLCBodG1sKSB7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMjtcbiAgaWYgKGdldHRlcikge1xuICAgIHJldHVybiBlbGVtLmlubmVySFRNTDtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLmlubmVySFRNTCA9IGh0bWw7XG4gIH1cbn07XG5cbmFwaS50ZXh0ID0gZnVuY3Rpb24gKGVsZW0sIHRleHQpIHtcbiAgdmFyIGNoZWNrYWJsZSA9IHRlc3QuaXNDaGVja2FibGUoZWxlbSk7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMjtcbiAgaWYgKGdldHRlcikge1xuICAgIHJldHVybiBjaGVja2FibGUgPyBlbGVtLnZhbHVlIDogZWxlbS5pbm5lclRleHQgfHwgZWxlbS50ZXh0Q29udGVudDtcbiAgfSBlbHNlIGlmIChjaGVja2FibGUpIHtcbiAgICBlbGVtLnZhbHVlID0gdGV4dDtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLmlubmVyVGV4dCA9IGVsZW0udGV4dENvbnRlbnQgPSB0ZXh0O1xuICB9XG59O1xuXG5hcGkudmFsdWUgPSBmdW5jdGlvbiAoZWxlbSwgdmFsdWUpIHtcbiAgdmFyIGNoZWNrYWJsZSA9IHRlc3QuaXNDaGVja2FibGUoZWxlbSk7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMjtcbiAgaWYgKGdldHRlcikge1xuICAgIHJldHVybiBjaGVja2FibGUgPyBlbGVtLmNoZWNrZWQgOiBlbGVtLnZhbHVlO1xuICB9IGVsc2UgaWYgKGNoZWNrYWJsZSkge1xuICAgIGVsZW0uY2hlY2tlZCA9IHZhbHVlO1xuICB9IGVsc2Uge1xuICAgIGVsZW0udmFsdWUgPSB2YWx1ZTtcbiAgfVxufTtcblxuYXBpLmF0dHIgPSBmdW5jdGlvbiAoZWxlbSwgbmFtZSwgdmFsdWUpIHtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAzO1xuICB2YXIgY2FtZWwgPSB0ZXh0Lmh5cGhlblRvQ2FtZWwobmFtZSk7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICBpZiAoY2FtZWwgaW4gZWxlbSkge1xuICAgICAgcmV0dXJuIGVsZW1bY2FtZWxdO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZWxlbS5nZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xuICAgIH1cbiAgfVxuICBpZiAoY2FtZWwgaW4gZWxlbSkge1xuICAgIGVsZW1bY2FtZWxdID0gdmFsdWU7XG4gIH0gZWxzZSBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHZvaWQgMCkge1xuICAgIGVsZW0ucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuICB9IGVsc2Uge1xuICAgIGVsZW0uc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcbiAgfVxufTtcblxuYXBpLm1ha2UgPSBmdW5jdGlvbiAodHlwZSkge1xuICByZXR1cm4gbmV3IERvbWludXMoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0eXBlKSk7XG59O1xuXG5hcGkuY2xvbmUgPSBmdW5jdGlvbiAoZWxlbSkge1xuICByZXR1cm4gZWxlbS5jbG9uZU5vZGUodHJ1ZSk7XG59O1xuXG5hcGkucmVtb3ZlID0gZnVuY3Rpb24gKGVsZW0pIHtcbiAgaWYgKGVsZW0ucGFyZW50RWxlbWVudCkge1xuICAgIGVsZW0ucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZChlbGVtKTtcbiAgfVxufTtcblxuYXBpLmFwcGVuZCA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgaWYgKG1hbmlwdWxhdGlvbkd1YXJkKGVsZW0sIHRhcmdldCwgYXBpLmFwcGVuZCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZWxlbS5hcHBlbmRDaGlsZCh0YXJnZXQpO1xufTtcblxuYXBpLnByZXBlbmQgPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gIGlmIChtYW5pcHVsYXRpb25HdWFyZChlbGVtLCB0YXJnZXQsIGFwaS5wcmVwZW5kKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBlbGVtLmluc2VydEJlZm9yZSh0YXJnZXQsIGVsZW0uZmlyc3RDaGlsZCk7XG59O1xuXG5hcGkuYmVmb3JlID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICBpZiAobWFuaXB1bGF0aW9uR3VhcmQoZWxlbSwgdGFyZ2V0LCBhcGkuYmVmb3JlKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoZWxlbS5wYXJlbnRFbGVtZW50KSB7XG4gICAgZWxlbS5wYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZSh0YXJnZXQsIGVsZW0pO1xuICB9XG59O1xuXG5hcGkuYWZ0ZXIgPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gIGlmIChtYW5pcHVsYXRpb25HdWFyZChlbGVtLCB0YXJnZXQsIGFwaS5hZnRlcikpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGVsZW0ucGFyZW50RWxlbWVudCkge1xuICAgIGVsZW0ucGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUodGFyZ2V0LCBlbGVtLm5leHRTaWJsaW5nKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gbWFuaXB1bGF0aW9uR3VhcmQgKGVsZW0sIHRhcmdldCwgZm4pIHtcbiAgdmFyIHJpZ2h0ID0gdGFyZ2V0IGluc3RhbmNlb2YgRG9taW51cztcbiAgdmFyIGxlZnQgPSBlbGVtIGluc3RhbmNlb2YgRG9taW51cztcbiAgaWYgKGxlZnQpIHtcbiAgICBlbGVtLmZvckVhY2gobWFuaXB1bGF0ZU1hbnkpO1xuICB9IGVsc2UgaWYgKHJpZ2h0KSB7XG4gICAgbWFuaXB1bGF0ZShlbGVtLCB0cnVlKTtcbiAgfVxuICByZXR1cm4gbGVmdCB8fCByaWdodDtcblxuICBmdW5jdGlvbiBtYW5pcHVsYXRlIChlbGVtLCBwcmVjb25kaXRpb24pIHtcbiAgICBpZiAocmlnaHQpIHtcbiAgICAgIHRhcmdldC5mb3JFYWNoKGZ1bmN0aW9uICh0YXJnZXQsIGopIHtcbiAgICAgICAgZm4oZWxlbSwgY2xvbmVVbmxlc3ModGFyZ2V0LCBwcmVjb25kaXRpb24gJiYgaiA9PT0gMCkpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZuKGVsZW0sIGNsb25lVW5sZXNzKHRhcmdldCwgcHJlY29uZGl0aW9uKSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbWFuaXB1bGF0ZU1hbnkgKGVsZW0sIGkpIHtcbiAgICBtYW5pcHVsYXRlKGVsZW0sIGkgPT09IDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lVW5sZXNzICh0YXJnZXQsIGNvbmRpdGlvbikge1xuICByZXR1cm4gY29uZGl0aW9uID8gdGFyZ2V0IDogYXBpLmNsb25lKHRhcmdldCk7XG59XG5cblsnYXBwZW5kVG8nLCAncHJlcGVuZFRvJywgJ2JlZm9yZU9mJywgJ2FmdGVyT2YnXS5mb3JFYWNoKGZsaXApO1xuXG5mdW5jdGlvbiBmbGlwIChrZXkpIHtcbiAgdmFyIG9yaWdpbmFsID0ga2V5LnNwbGl0KC9bQS1aXS8pWzBdO1xuICBhcGlba2V5XSA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgICBhcGlbb3JpZ2luYWxdKHRhcmdldCwgZWxlbSk7XG4gIH07XG59XG5cbmFwaS5zaG93ID0gZnVuY3Rpb24gKGVsZW0sIHNob3VsZCwgaW52ZXJ0KSB7XG4gIGlmIChlbGVtIGluc3RhbmNlb2YgRG9taW51cykge1xuICAgIGVsZW0uZm9yRWFjaChzaG93VGVzdCk7XG4gIH0gZWxzZSB7XG4gICAgc2hvd1Rlc3QoZWxlbSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93VGVzdCAoY3VycmVudCkge1xuICAgIHZhciBvayA9IHNob3VsZCA9PT0gdm9pZCAwIHx8IHNob3VsZCA9PT0gdHJ1ZSB8fCB0eXBlb2Ygc2hvdWxkID09PSAnZnVuY3Rpb24nICYmIHNob3VsZC5jYWxsKGN1cnJlbnQpO1xuICAgIGRpc3BsYXkoY3VycmVudCwgaW52ZXJ0ID8gIW9rIDogb2spO1xuICB9XG59O1xuXG5hcGkuaGlkZSA9IGZ1bmN0aW9uIChlbGVtLCBzaG91bGQpIHtcbiAgYXBpLnNob3coZWxlbSwgc2hvdWxkLCB0cnVlKTtcbn07XG5cbmZ1bmN0aW9uIGRpc3BsYXkgKGVsZW0sIHNob3VsZCkge1xuICBlbGVtLnN0eWxlLmRpc3BsYXkgPSBzaG91bGQgPyAnYmxvY2snIDogJ25vbmUnO1xufVxuXG52YXIgbnVtZXJpY0Nzc1Byb3BlcnRpZXMgPSB7XG4gICdjb2x1bW4tY291bnQnOiB0cnVlLFxuICAnZmlsbC1vcGFjaXR5JzogdHJ1ZSxcbiAgJ2ZsZXgtZ3Jvdyc6IHRydWUsXG4gICdmbGV4LXNocmluayc6IHRydWUsXG4gICdmb250LXdlaWdodCc6IHRydWUsXG4gICdsaW5lLWhlaWdodCc6IHRydWUsXG4gICdvcGFjaXR5JzogdHJ1ZSxcbiAgJ29yZGVyJzogdHJ1ZSxcbiAgJ29ycGhhbnMnOiB0cnVlLFxuICAnd2lkb3dzJzogdHJ1ZSxcbiAgJ3otaW5kZXgnOiB0cnVlLFxuICAnem9vbSc6IHRydWVcbn07XG52YXIgbnVtZXJpYyA9IC9eXFxkKyQvO1xudmFyIGNhbkZsb2F0ID0gJ2Zsb2F0JyBpbiBkb2N1bWVudC5ib2R5LnN0eWxlO1xuXG5hcGkuZ2V0Q3NzID0gZnVuY3Rpb24gKGVsZW0sIHByb3ApIHtcbiAgdmFyIGhwcm9wID0gdGV4dC5oeXBoZW5hdGUocHJvcCk7XG4gIHZhciBmcHJvcCA9ICFjYW5GbG9hdCAmJiBocHJvcCA9PT0gJ2Zsb2F0JyA/ICdjc3NGbG9hdCcgOiBocHJvcDtcbiAgdmFyIHJlc3VsdCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW0pW2hwcm9wXTtcbiAgaWYgKHByb3AgPT09ICdvcGFjaXR5JyAmJiByZXN1bHQgPT09ICcnKSB7XG4gICAgcmV0dXJuIDE7XG4gIH1cbiAgaWYgKHJlc3VsdC5zdWJzdHIoLTIpID09PSAncHgnIHx8IG51bWVyaWMudGVzdChyZXN1bHQpKSB7XG4gICAgcmV0dXJuIHBhcnNlRmxvYXQocmVzdWx0LCAxMCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmFwaS5zZXRDc3MgPSBmdW5jdGlvbiAocHJvcHMpIHtcbiAgdmFyIG1hcHBlZCA9IE9iamVjdC5rZXlzKHByb3BzKS5maWx0ZXIoYmFkKS5tYXAoZXhwYW5kKTtcbiAgZnVuY3Rpb24gYmFkIChwcm9wKSB7XG4gICAgdmFyIHZhbHVlID0gcHJvcHNbcHJvcF07XG4gICAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHZhbHVlID09PSB2YWx1ZTtcbiAgfVxuICBmdW5jdGlvbiBleHBhbmQgKHByb3ApIHtcbiAgICB2YXIgaHByb3AgPSB0ZXh0Lmh5cGhlbmF0ZShwcm9wKTtcbiAgICB2YXIgdmFsdWUgPSBwcm9wc1twcm9wXTtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhbnVtZXJpY0Nzc1Byb3BlcnRpZXNbaHByb3BdKSB7XG4gICAgICB2YWx1ZSArPSAncHgnO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgbmFtZTogaHByb3AsIHZhbHVlOiB2YWx1ZVxuICAgIH07XG4gIH1cbiAgcmV0dXJuIGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgbWFwcGVkLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIGVsZW0uc3R5bGVbcHJvcC5uYW1lXSA9IHByb3AudmFsdWU7XG4gICAgfSk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vRG9taW51cy5wcm90b3R5cGUnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGFkZEV2ZW50ID0gYWRkRXZlbnRFYXN5O1xudmFyIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRFYXN5O1xudmFyIGhhcmRDYWNoZSA9IFtdO1xuXG5pZiAoIXdpbmRvdy5hZGRFdmVudExpc3RlbmVyKSB7XG4gIGFkZEV2ZW50ID0gYWRkRXZlbnRIYXJkO1xufVxuXG5pZiAoIXdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRIYXJkO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEVhc3kgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldnQsIGZuKTtcbn1cblxuZnVuY3Rpb24gYWRkRXZlbnRIYXJkIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHJldHVybiBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyBldnQsIHdyYXAoZWxlbWVudCwgZXZ0LCBmbikpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEVhc3kgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldnQsIGZuKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlRXZlbnRIYXJkIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHJldHVybiBlbGVtZW50LmRldGFjaEV2ZW50KCdvbicgKyBldnQsIHVud3JhcChlbGVtZW50LCBldnQsIGZuKSk7XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IHdpbmRvdy5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ICA9IGUucHJldmVudERlZmF1bHQgIHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGZuLmNhbGwoZWxlbWVudCwgZSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHdyYXAgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgdmFyIHdyYXBwZXIgPSB1bndyYXAoZWxlbWVudCwgZXZ0LCBmbikgfHwgd3JhcHBlckZhY3RvcnkoZWxlbWVudCwgZXZ0LCBmbik7XG4gIGhhcmRDYWNoZS5wdXNoKHtcbiAgICB3cmFwcGVyOiB3cmFwcGVyLFxuICAgIGVsZW1lbnQ6IGVsZW1lbnQsXG4gICAgZXZ0OiBldnQsXG4gICAgZm46IGZuXG4gIH0pO1xuICByZXR1cm4gd3JhcHBlcjtcbn1cblxuZnVuY3Rpb24gdW53cmFwIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHZhciBpID0gZmluZChlbGVtZW50LCBldnQsIGZuKTtcbiAgaWYgKGkpIHtcbiAgICB2YXIgd3JhcHBlciA9IGhhcmRDYWNoZVtpXS53cmFwcGVyO1xuICAgIGhhcmRDYWNoZS5zcGxpY2UoaSwgMSk7IC8vIGZyZWUgdXAgYSB0YWQgb2YgbWVtb3J5XG4gICAgcmV0dXJuIHdyYXBwZXI7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmluZCAoZWxlbWVudCwgZXZ0LCBmbikge1xuICB2YXIgaSwgaXRlbTtcbiAgZm9yIChpID0gMDsgaSA8IGhhcmRDYWNoZS5sZW5ndGg7IGkrKykge1xuICAgIGl0ZW0gPSBoYXJkQ2FjaGVbaV07XG4gICAgaWYgKGl0ZW0uZWxlbWVudCA9PT0gZWxlbWVudCAmJiBpdGVtLmV2dCA9PT0gZXZ0ICYmIGl0ZW0uZm4gPT09IGZuKSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkRXZlbnQsXG4gIHJlbW92ZTogcmVtb3ZlRXZlbnRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBkb20gPSByZXF1aXJlKCcuL2RvbScpO1xudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NvcmUnKTtcbnZhciBEb21pbnVzID0gcmVxdWlyZSgnLi9Eb21pbnVzLmN0b3InKTtcbnZhciB0YWcgPSAvXlxccyo8KFthLXpdKyg/Oi1bYS16XSspPylcXHMqXFwvPz5cXHMqJC9pO1xuXG5mdW5jdGlvbiBhcGkgKHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gIHZhciBub3RUZXh0ID0gdHlwZW9mIHNlbGVjdG9yICE9PSAnc3RyaW5nJztcbiAgaWYgKG5vdFRleHQgJiYgYXJndW1lbnRzLmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4gY29yZS5jYXN0KHNlbGVjdG9yKTtcbiAgfVxuICBpZiAobm90VGV4dCkge1xuICAgIHJldHVybiBuZXcgRG9taW51cygpO1xuICB9XG4gIHZhciBtYXRjaGVzID0gc2VsZWN0b3IubWF0Y2godGFnKTtcbiAgaWYgKG1hdGNoZXMpIHtcbiAgICByZXR1cm4gZG9tLm1ha2UobWF0Y2hlc1sxXSk7XG4gIH1cbiAgcmV0dXJuIGFwaS5maW5kKHNlbGVjdG9yLCBjb250ZXh0KTtcbn1cblxuYXBpLmZpbmQgPSBmdW5jdGlvbiAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgcmV0dXJuIGRvbS5xc2EoY29udGV4dCwgc2VsZWN0b3IpO1xufTtcblxuYXBpLmZpbmRPbmUgPSBmdW5jdGlvbiAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgcmV0dXJuIGRvbS5xcyhjb250ZXh0LCBzZWxlY3Rvcik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIG5vZGVPYmplY3RzID0gdHlwZW9mIE5vZGUgPT09ICdvYmplY3QnO1xudmFyIGVsZW1lbnRPYmplY3RzID0gdHlwZW9mIEhUTUxFbGVtZW50ID09PSAnb2JqZWN0JztcblxuZnVuY3Rpb24gaXNOb2RlIChvKSB7XG4gIHJldHVybiBub2RlT2JqZWN0cyA/IG8gaW5zdGFuY2VvZiBOb2RlIDogaXNOb2RlT2JqZWN0KG8pO1xufVxuXG5mdW5jdGlvbiBpc05vZGVPYmplY3QgKG8pIHtcbiAgcmV0dXJuIG8gJiZcbiAgICB0eXBlb2YgbyA9PT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2Ygby5ub2RlTmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2Ygby5ub2RlVHlwZSA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzRWxlbWVudCAobykge1xuICByZXR1cm4gZWxlbWVudE9iamVjdHMgPyBvIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgOiBpc0VsZW1lbnRPYmplY3Qobyk7XG59XG5cbmZ1bmN0aW9uIGlzRWxlbWVudE9iamVjdCAobykge1xuICByZXR1cm4gbyAmJlxuICAgIHR5cGVvZiBvID09PSAnb2JqZWN0JyAmJlxuICAgIHR5cGVvZiBvLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIG8ubm9kZVR5cGUgPT09IDE7XG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKGEpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn1cblxuZnVuY3Rpb24gaXNDaGVja2FibGUgKGVsZW0pIHtcbiAgcmV0dXJuICdjaGVja2VkJyBpbiBlbGVtICYmIGVsZW0udHlwZSA9PT0gJ3JhZGlvJyB8fCBlbGVtLnR5cGUgPT09ICdjaGVja2JveCc7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBpc05vZGU6IGlzTm9kZSxcbiAgaXNFbGVtZW50OiBpc0VsZW1lbnQsXG4gIGlzQXJyYXk6IGlzQXJyYXksXG4gIGlzQ2hlY2thYmxlOiBpc0NoZWNrYWJsZVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gaHlwaGVuVG9DYW1lbCAoaHlwaGVucykge1xuICB2YXIgcGFydCA9IC8tKFthLXpdKS9nO1xuICByZXR1cm4gaHlwaGVucy5yZXBsYWNlKHBhcnQsIGZ1bmN0aW9uIChnLCBtKSB7XG4gICAgcmV0dXJuIG0udG9VcHBlckNhc2UoKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGh5cGhlbmF0ZSAodGV4dCkge1xuICB2YXIgY2FtZWwgPSAvKFthLXpdKShbQS1aXSkvZztcbiAgcmV0dXJuIHRleHQucmVwbGFjZShjYW1lbCwgJyQxLSQyJykudG9Mb3dlckNhc2UoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGh5cGhlblRvQ2FtZWw6IGh5cGhlblRvQ2FtZWwsXG4gIGh5cGhlbmF0ZTogaHlwaGVuYXRlXG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuIWZ1bmN0aW9uKGUpe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgZjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P2Y9d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/Zj1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihmPXNlbGYpLGYuamFkZT1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbid1c2Ugc3RyaWN0JztcclxuXHJcbi8qKlxyXG4gKiBNZXJnZSB0d28gYXR0cmlidXRlIG9iamVjdHMgZ2l2aW5nIHByZWNlZGVuY2VcclxuICogdG8gdmFsdWVzIGluIG9iamVjdCBgYmAuIENsYXNzZXMgYXJlIHNwZWNpYWwtY2FzZWRcclxuICogYWxsb3dpbmcgZm9yIGFycmF5cyBhbmQgbWVyZ2luZy9qb2luaW5nIGFwcHJvcHJpYXRlbHlcclxuICogcmVzdWx0aW5nIGluIGEgc3RyaW5nLlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gYVxyXG4gKiBAcGFyYW0ge09iamVjdH0gYlxyXG4gKiBAcmV0dXJuIHtPYmplY3R9IGFcclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5tZXJnZSA9IGZ1bmN0aW9uIG1lcmdlKGEsIGIpIHtcclxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgdmFyIGF0dHJzID0gYVswXTtcclxuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYS5sZW5ndGg7IGkrKykge1xyXG4gICAgICBhdHRycyA9IG1lcmdlKGF0dHJzLCBhW2ldKTtcclxuICAgIH1cclxuICAgIHJldHVybiBhdHRycztcclxuICB9XHJcbiAgdmFyIGFjID0gYVsnY2xhc3MnXTtcclxuICB2YXIgYmMgPSBiWydjbGFzcyddO1xyXG5cclxuICBpZiAoYWMgfHwgYmMpIHtcclxuICAgIGFjID0gYWMgfHwgW107XHJcbiAgICBiYyA9IGJjIHx8IFtdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjKSkgYWMgPSBbYWNdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGJjKSkgYmMgPSBbYmNdO1xyXG4gICAgYVsnY2xhc3MnXSA9IGFjLmNvbmNhdChiYykuZmlsdGVyKG51bGxzKTtcclxuICB9XHJcblxyXG4gIGZvciAodmFyIGtleSBpbiBiKSB7XHJcbiAgICBpZiAoa2V5ICE9ICdjbGFzcycpIHtcclxuICAgICAgYVtrZXldID0gYltrZXldO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGE7XHJcbn07XHJcblxyXG4vKipcclxuICogRmlsdGVyIG51bGwgYHZhbGBzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtCb29sZWFufVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5mdW5jdGlvbiBudWxscyh2YWwpIHtcclxuICByZXR1cm4gdmFsICE9IG51bGwgJiYgdmFsICE9PSAnJztcclxufVxyXG5cclxuLyoqXHJcbiAqIGpvaW4gYXJyYXkgYXMgY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5qb2luQ2xhc3NlcyA9IGpvaW5DbGFzc2VzO1xyXG5mdW5jdGlvbiBqb2luQ2xhc3Nlcyh2YWwpIHtcclxuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpID8gdmFsLm1hcChqb2luQ2xhc3NlcykuZmlsdGVyKG51bGxzKS5qb2luKCcgJykgOiB2YWw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGNsYXNzZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IGNsYXNzZXNcclxuICogQHBhcmFtIHtBcnJheS48Qm9vbGVhbj59IGVzY2FwZWRcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5jbHMgPSBmdW5jdGlvbiBjbHMoY2xhc3NlcywgZXNjYXBlZCkge1xyXG4gIHZhciBidWYgPSBbXTtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGlmIChlc2NhcGVkICYmIGVzY2FwZWRbaV0pIHtcclxuICAgICAgYnVmLnB1c2goZXhwb3J0cy5lc2NhcGUoam9pbkNsYXNzZXMoW2NsYXNzZXNbaV1dKSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgYnVmLnB1c2goam9pbkNsYXNzZXMoY2xhc3Nlc1tpXSkpO1xyXG4gICAgfVxyXG4gIH1cclxuICB2YXIgdGV4dCA9IGpvaW5DbGFzc2VzKGJ1Zik7XHJcbiAgaWYgKHRleHQubGVuZ3RoKSB7XHJcbiAgICByZXR1cm4gJyBjbGFzcz1cIicgKyB0ZXh0ICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcnO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZS5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGtleVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZXNjYXBlZFxyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IHRlcnNlXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0ciA9IGZ1bmN0aW9uIGF0dHIoa2V5LCB2YWwsIGVzY2FwZWQsIHRlcnNlKSB7XHJcbiAgaWYgKCdib29sZWFuJyA9PSB0eXBlb2YgdmFsIHx8IG51bGwgPT0gdmFsKSB7XHJcbiAgICBpZiAodmFsKSB7XHJcbiAgICAgIHJldHVybiAnICcgKyAodGVyc2UgPyBrZXkgOiBrZXkgKyAnPVwiJyArIGtleSArICdcIicpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuICcnO1xyXG4gICAgfVxyXG4gIH0gZWxzZSBpZiAoMCA9PSBrZXkuaW5kZXhPZignZGF0YScpICYmICdzdHJpbmcnICE9IHR5cGVvZiB2YWwpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyBcIj0nXCIgKyBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2UoLycvZywgJyZhcG9zOycpICsgXCInXCI7XHJcbiAgfSBlbHNlIGlmIChlc2NhcGVkKSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyBleHBvcnRzLmVzY2FwZSh2YWwpICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJztcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBhdHRyaWJ1dGVzIG9iamVjdC5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IG9ialxyXG4gKiBAcGFyYW0ge09iamVjdH0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmF0dHJzID0gZnVuY3Rpb24gYXR0cnMob2JqLCB0ZXJzZSl7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG5cclxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iaik7XHJcblxyXG4gIGlmIChrZXlzLmxlbmd0aCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldXHJcbiAgICAgICAgLCB2YWwgPSBvYmpba2V5XTtcclxuXHJcbiAgICAgIGlmICgnY2xhc3MnID09IGtleSkge1xyXG4gICAgICAgIGlmICh2YWwgPSBqb2luQ2xhc3Nlcyh2YWwpKSB7XHJcbiAgICAgICAgICBidWYucHVzaCgnICcgKyBrZXkgKyAnPVwiJyArIHZhbCArICdcIicpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBidWYucHVzaChleHBvcnRzLmF0dHIoa2V5LCB2YWwsIGZhbHNlLCB0ZXJzZSkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYnVmLmpvaW4oJycpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEVzY2FwZSB0aGUgZ2l2ZW4gc3RyaW5nIG9mIGBodG1sYC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGh0bWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLmVzY2FwZSA9IGZ1bmN0aW9uIGVzY2FwZShodG1sKXtcclxuICB2YXIgcmVzdWx0ID0gU3RyaW5nKGh0bWwpXHJcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxyXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxyXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcclxuICBpZiAocmVzdWx0ID09PSAnJyArIGh0bWwpIHJldHVybiBodG1sO1xyXG4gIGVsc2UgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZS10aHJvdyB0aGUgZ2l2ZW4gYGVycmAgaW4gY29udGV4dCB0byB0aGVcclxuICogdGhlIGphZGUgaW4gYGZpbGVuYW1lYCBhdCB0aGUgZ2l2ZW4gYGxpbmVub2AuXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZW5hbWVcclxuICogQHBhcmFtIHtTdHJpbmd9IGxpbmVub1xyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLnJldGhyb3cgPSBmdW5jdGlvbiByZXRocm93KGVyciwgZmlsZW5hbWUsIGxpbmVubywgc3RyKXtcclxuICBpZiAoIShlcnIgaW5zdGFuY2VvZiBFcnJvcikpIHRocm93IGVycjtcclxuICBpZiAoKHR5cGVvZiB3aW5kb3cgIT0gJ3VuZGVmaW5lZCcgfHwgIWZpbGVuYW1lKSAmJiAhc3RyKSB7XHJcbiAgICBlcnIubWVzc2FnZSArPSAnIG9uIGxpbmUgJyArIGxpbmVubztcclxuICAgIHRocm93IGVycjtcclxuICB9XHJcbiAgdHJ5IHtcclxuICAgIHN0ciA9IHN0ciB8fCBfZGVyZXFfKCdmcycpLnJlYWRGaWxlU3luYyhmaWxlbmFtZSwgJ3V0ZjgnKVxyXG4gIH0gY2F0Y2ggKGV4KSB7XHJcbiAgICByZXRocm93KGVyciwgbnVsbCwgbGluZW5vKVxyXG4gIH1cclxuICB2YXIgY29udGV4dCA9IDNcclxuICAgICwgbGluZXMgPSBzdHIuc3BsaXQoJ1xcbicpXHJcbiAgICAsIHN0YXJ0ID0gTWF0aC5tYXgobGluZW5vIC0gY29udGV4dCwgMClcclxuICAgICwgZW5kID0gTWF0aC5taW4obGluZXMubGVuZ3RoLCBsaW5lbm8gKyBjb250ZXh0KTtcclxuXHJcbiAgLy8gRXJyb3IgY29udGV4dFxyXG4gIHZhciBjb250ZXh0ID0gbGluZXMuc2xpY2Uoc3RhcnQsIGVuZCkubWFwKGZ1bmN0aW9uKGxpbmUsIGkpe1xyXG4gICAgdmFyIGN1cnIgPSBpICsgc3RhcnQgKyAxO1xyXG4gICAgcmV0dXJuIChjdXJyID09IGxpbmVubyA/ICcgID4gJyA6ICcgICAgJylcclxuICAgICAgKyBjdXJyXHJcbiAgICAgICsgJ3wgJ1xyXG4gICAgICArIGxpbmU7XHJcbiAgfSkuam9pbignXFxuJyk7XHJcblxyXG4gIC8vIEFsdGVyIGV4Y2VwdGlvbiBtZXNzYWdlXHJcbiAgZXJyLnBhdGggPSBmaWxlbmFtZTtcclxuICBlcnIubWVzc2FnZSA9IChmaWxlbmFtZSB8fCAnSmFkZScpICsgJzonICsgbGluZW5vXHJcbiAgICArICdcXG4nICsgY29udGV4dCArICdcXG5cXG4nICsgZXJyLm1lc3NhZ2U7XHJcbiAgdGhyb3cgZXJyO1xyXG59O1xyXG5cbn0se1wiZnNcIjoyfV0sMjpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbn0se31dfSx7fSxbMV0pXG4oMSlcbn0pO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJ2phZGUvcnVudGltZScpO1xuIiwidmFyIG5vdyA9IHJlcXVpcmUoJ3BlcmZvcm1hbmNlLW5vdycpXG4gICwgZ2xvYmFsID0gdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyB7fSA6IHdpbmRvd1xuICAsIHZlbmRvcnMgPSBbJ21veicsICd3ZWJraXQnXVxuICAsIHN1ZmZpeCA9ICdBbmltYXRpb25GcmFtZSdcbiAgLCByYWYgPSBnbG9iYWxbJ3JlcXVlc3QnICsgc3VmZml4XVxuICAsIGNhZiA9IGdsb2JhbFsnY2FuY2VsJyArIHN1ZmZpeF0gfHwgZ2xvYmFsWydjYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBpc05hdGl2ZSA9IHRydWVcblxuZm9yKHZhciBpID0gMDsgaSA8IHZlbmRvcnMubGVuZ3RoICYmICFyYWY7IGkrKykge1xuICByYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgY2FmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsJyArIHN1ZmZpeF1cbiAgICAgIHx8IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxufVxuXG4vLyBTb21lIHZlcnNpb25zIG9mIEZGIGhhdmUgckFGIGJ1dCBub3QgY0FGXG5pZighcmFmIHx8ICFjYWYpIHtcbiAgaXNOYXRpdmUgPSBmYWxzZVxuXG4gIHZhciBsYXN0ID0gMFxuICAgICwgaWQgPSAwXG4gICAgLCBxdWV1ZSA9IFtdXG4gICAgLCBmcmFtZUR1cmF0aW9uID0gMTAwMCAvIDYwXG5cbiAgcmFmID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICBpZihxdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHZhciBfbm93ID0gbm93KClcbiAgICAgICAgLCBuZXh0ID0gTWF0aC5tYXgoMCwgZnJhbWVEdXJhdGlvbiAtIChfbm93IC0gbGFzdCkpXG4gICAgICBsYXN0ID0gbmV4dCArIF9ub3dcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjcCA9IHF1ZXVlLnNsaWNlKDApXG4gICAgICAgIC8vIENsZWFyIHF1ZXVlIGhlcmUgdG8gcHJldmVudFxuICAgICAgICAvLyBjYWxsYmFja3MgZnJvbSBhcHBlbmRpbmcgbGlzdGVuZXJzXG4gICAgICAgIC8vIHRvIHRoZSBjdXJyZW50IGZyYW1lJ3MgcXVldWVcbiAgICAgICAgcXVldWUubGVuZ3RoID0gMFxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY3AubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZighY3BbaV0uY2FuY2VsbGVkKSB7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgIGNwW2ldLmNhbGxiYWNrKGxhc3QpXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSwgTWF0aC5yb3VuZChuZXh0KSlcbiAgICB9XG4gICAgcXVldWUucHVzaCh7XG4gICAgICBoYW5kbGU6ICsraWQsXG4gICAgICBjYWxsYmFjazogY2FsbGJhY2ssXG4gICAgICBjYW5jZWxsZWQ6IGZhbHNlXG4gICAgfSlcbiAgICByZXR1cm4gaWRcbiAgfVxuXG4gIGNhZiA9IGZ1bmN0aW9uKGhhbmRsZSkge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYocXVldWVbaV0uaGFuZGxlID09PSBoYW5kbGUpIHtcbiAgICAgICAgcXVldWVbaV0uY2FuY2VsbGVkID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIFdyYXAgaW4gYSBuZXcgZnVuY3Rpb24gdG8gcHJldmVudFxuICAvLyBgY2FuY2VsYCBwb3RlbnRpYWxseSBiZWluZyBhc3NpZ25lZFxuICAvLyB0byB0aGUgbmF0aXZlIHJBRiBmdW5jdGlvblxuICBpZighaXNOYXRpdmUpIHtcbiAgICByZXR1cm4gcmFmLmNhbGwoZ2xvYmFsLCBmbilcbiAgfVxuICByZXR1cm4gcmFmLmNhbGwoZ2xvYmFsLCBmdW5jdGlvbigpIHtcbiAgICB0cnl7XG4gICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgfSBjYXRjaChlKSB7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgfVxuICB9KVxufVxubW9kdWxlLmV4cG9ydHMuY2FuY2VsID0gZnVuY3Rpb24oKSB7XG4gIGNhZi5hcHBseShnbG9iYWwsIGFyZ3VtZW50cylcbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNi4zXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBnZXROYW5vU2Vjb25kcywgaHJ0aW1lLCBsb2FkVGltZTtcblxuICBpZiAoKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwZXJmb3JtYW5jZSAhPT0gbnVsbCkgJiYgcGVyZm9ybWFuY2Uubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB9O1xuICB9IGVsc2UgaWYgKCh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzICE9PSBudWxsKSAmJiBwcm9jZXNzLmhydGltZSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gKGdldE5hbm9TZWNvbmRzKCkgLSBsb2FkVGltZSkgLyAxZTY7XG4gICAgfTtcbiAgICBocnRpbWUgPSBwcm9jZXNzLmhydGltZTtcbiAgICBnZXROYW5vU2Vjb25kcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGhyO1xuICAgICAgaHIgPSBocnRpbWUoKTtcbiAgICAgIHJldHVybiBoclswXSAqIDFlOSArIGhyWzFdO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBnZXROYW5vU2Vjb25kcygpO1xuICB9IGVsc2UgaWYgKERhdGUubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBEYXRlLm5vdygpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IERhdGUubm93KCk7XG4gIH0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfVxuXG59KS5jYWxsKHRoaXMpO1xuXG4vKlxuLy9AIHNvdXJjZU1hcHBpbmdVUkw9cGVyZm9ybWFuY2Utbm93Lm1hcFxuKi9cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJhZiA9IHJlcXVpcmUoJ3JhZicpO1xudmFyIGNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgcGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgbmF0aXZlRm4gPSByZXF1aXJlKCcuL25hdGl2ZUZuJyk7XG52YXIgdmVyc2lvbmluZyA9IHJlcXVpcmUoJy4uL3ZlcnNpb25pbmcnKTtcbnZhciBtb2Rlcm4gPSAnaGlzdG9yeScgaW4gd2luZG93ICYmICdwdXNoU3RhdGUnIGluIGhpc3Rvcnk7XG5cbi8vIEdvb2dsZSBDaHJvbWUgMzggb24gaU9TIG1ha2VzIHdlaXJkIGNoYW5nZXMgdG8gaGlzdG9yeS5yZXBsYWNlU3RhdGUsIGJyZWFraW5nIGl0XG52YXIgbmF0aXZlUmVwbGFjZSA9IG1vZGVybiAmJiBuYXRpdmVGbih3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUpO1xuXG5mdW5jdGlvbiBnbyAodXJsLCBvcHRpb25zKSB7XG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIGRpcmVjdGlvbiA9IG8ucmVwbGFjZVN0YXRlID8gJ3JlcGxhY2VTdGF0ZScgOiAncHVzaFN0YXRlJztcbiAgdmFyIGNvbnRleHQgPSBvLmNvbnRleHQgfHwgbnVsbDtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCk7XG4gIGlmICghcm91dGUpIHtcbiAgICBpZiAoby5zdHJpY3QgIT09IHRydWUpIHtcbiAgICAgIGxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBzYW1lID0gcm91dGVyLmVxdWFscyhyb3V0ZSwgc3RhdGUucm91dGUpO1xuICBpZiAoc2FtZSAmJiBvLmZvcmNlICE9PSB0cnVlKSB7XG4gICAgaWYgKHJvdXRlLnBhcnRzLmhhc2gpIHtcbiAgICAgIHNjcm9sbEludG8oaWQocm91dGUucGFydHMuaGFzaCksIG8uc2Nyb2xsKTtcbiAgICAgIG5hdmlnYXRpb24ocm91dGUsIHN0YXRlLm1vZGVsLCBkaXJlY3Rpb24pO1xuICAgICAgcmV0dXJuOyAvLyBhbmNob3IgaGFzaC1uYXZpZ2F0aW9uIG9uIHNhbWUgcGFnZSBpZ25vcmVzIHJvdXRlclxuICAgIH1cbiAgICByZXNvbHZlZChudWxsLCBzdGF0ZS5tb2RlbCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCFtb2Rlcm4pIHtcbiAgICBsb2NhdGlvbi5ocmVmID0gdXJsO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGZldGNoZXIuYWJvcnRQZW5kaW5nKCk7XG4gIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogY29udGV4dCwgc291cmNlOiAnaW50ZW50JyB9LCByZXNvbHZlZCk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZWQgKGVyciwgbW9kZWwpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh2ZXJzaW9uaW5nLmVuc3VyZShtb2RlbC5fX3R2LCBzdGF0ZS52ZXJzaW9uKSkge1xuICAgICAgbG9jYXRpb24uaHJlZiA9IHVybDsgLy8gdmVyc2lvbiBjaGFuZ2VzIGRlbWFuZHMgZmFsbGJhY2sgdG8gc3RyaWN0IG5hdmlnYXRpb25cbiAgICB9XG4gICAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsIGRpcmVjdGlvbik7XG4gICAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSk7XG4gICAgc2Nyb2xsSW50byhpZChyb3V0ZS5wYXJ0cy5oYXNoKSwgby5zY3JvbGwpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0IChtb2RlbCkge1xuICBpZiAodmVyc2lvbmluZy5lbnN1cmUobW9kZWwuX190diwgc3RhdGUudmVyc2lvbikpIHtcbiAgICBsb2NhdGlvbi5yZWxvYWQoKTsgLy8gdmVyc2lvbiBtYXkgY2hhbmdlIGJldHdlZW4gVGF1bnVzIGJlaW5nIGxvYWRlZCBhbmQgYSBtb2RlbCBiZWluZyBhdmFpbGFibGVcbiAgfVxuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIGVtaXR0ZXIuZW1pdCgnc3RhcnQnLCBzdGF0ZS5jb250YWluZXIsIG1vZGVsKTtcbiAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSwgeyByZW5kZXI6IGZhbHNlIH0pO1xuICB3aW5kb3cub25wb3BzdGF0ZSA9IGJhY2s7XG59XG5cbmZ1bmN0aW9uIGJhY2sgKGUpIHtcbiAgdmFyIGVtcHR5ID0gIShlICYmIGUuc3RhdGUgJiYgZS5zdGF0ZS5tb2RlbCk7XG4gIGlmIChlbXB0eSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbW9kZWwgPSBlLnN0YXRlLm1vZGVsO1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICBzY3JvbGxJbnRvKGlkKHJvdXRlLnBhcnRzLmhhc2gpKTtcbn1cblxuZnVuY3Rpb24gc2Nyb2xsSW50byAoaWQsIGVuYWJsZWQpIHtcbiAgaWYgKGVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBlbGVtID0gaWQgJiYgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgaWYgKGVsZW0gJiYgZWxlbS5zY3JvbGxJbnRvVmlldykge1xuICAgIHJhZihzY3JvbGxTb29uKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjcm9sbFNvb24gKCkge1xuICAgIGVsZW0uc2Nyb2xsSW50b1ZpZXcoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpZCAoaGFzaCkge1xuICByZXR1cm4gb3JFbXB0eShoYXNoKS5zdWJzdHIoMSk7XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VXaXRoIChtb2RlbCkge1xuICB2YXIgdXJsID0gbG9jYXRpb24ucGF0aG5hbWU7XG4gIHZhciBxdWVyeSA9IG9yRW1wdHkobG9jYXRpb24uc2VhcmNoKSArIG9yRW1wdHkobG9jYXRpb24uaGFzaCk7XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwgKyBxdWVyeSk7XG4gIG5hdmlnYXRpb24ocm91dGUsIG1vZGVsLCAncmVwbGFjZVN0YXRlJyk7XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gb3JFbXB0eSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBuYXZpZ2F0aW9uIChyb3V0ZSwgbW9kZWwsIGRpcmVjdGlvbikge1xuICBzdGF0ZS5yb3V0ZSA9IHJvdXRlO1xuICBzdGF0ZS5tb2RlbCA9IGNsb25lKG1vZGVsKTtcbiAgaWYgKG1vZGVsLnRpdGxlKSB7XG4gICAgZG9jdW1lbnQudGl0bGUgPSBtb2RlbC50aXRsZTtcbiAgfVxuICBpZiAobW9kZXJuICYmIGRpcmVjdGlvbiAhPT0gJ3JlcGxhY2VTdGF0ZScgfHwgbmF0aXZlUmVwbGFjZSkge1xuICAgIGhpc3RvcnlbZGlyZWN0aW9uXSh7IG1vZGVsOiBtb2RlbCB9LCBtb2RlbC50aXRsZSwgcm91dGUudXJsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc3RhcnQ6IHN0YXJ0LFxuICBnbzogZ29cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjbG9uZSA9IHJlcXVpcmUoJy4vY2xvbmUnKTtcbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcmF3ID0gcmVxdWlyZSgnLi9zdG9yZXMvcmF3Jyk7XG52YXIgaWRiID0gcmVxdWlyZSgnLi9zdG9yZXMvaWRiJyk7XG52YXIgdmVyc2lvbmluZyA9IHJlcXVpcmUoJy4uL3ZlcnNpb25pbmcnKTtcbnZhciBzdG9yZXMgPSBbcmF3LCBpZGJdO1xuXG5mdW5jdGlvbiBnZXQgKHVybCwgZG9uZSkge1xuICB2YXIgaSA9IDA7XG5cbiAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgdmFyIGdvdE9uY2UgPSBvbmNlKGdvdCk7XG4gICAgdmFyIHN0b3JlID0gc3RvcmVzW2krK107XG4gICAgaWYgKHN0b3JlKSB7XG4gICAgICBzdG9yZS5nZXQodXJsLCBnb3RPbmNlKTtcbiAgICAgIHNldFRpbWVvdXQoZ290T25jZSwgc3RvcmUgPT09IGlkYiA/IDEwMCA6IDUwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDE1MG1zIG9uIGNhY2hpbmcgbGF5ZXJzXG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUodHJ1ZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ290IChlcnIsIGl0ZW0pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSBlbHNlIGlmICh2YWxpZChpdGVtKSkge1xuICAgICAgICBkb25lKGZhbHNlLCBjbG9uZShpdGVtLmRhdGEpKTsgLy8gYWx3YXlzIHJldHVybiBhIHVuaXF1ZSBjb3B5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdmFsaWQgKGl0ZW0pIHtcbiAgICAgIGlmICghaXRlbSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7IC8vIGNhY2hlIG11c3QgaGF2ZSBpdGVtXG4gICAgICB9XG4gICAgICB2YXIgbWlzbWF0Y2ggPSB0eXBlb2YgaXRlbS52ZXJzaW9uICE9PSAnc3RyaW5nJyB8fCAhdmVyc2lvbmluZy5tYXRjaChpdGVtLnZlcnNpb24sIHN0YXRlLnZlcnNpb24pO1xuICAgICAgaWYgKG1pc21hdGNoKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gY2FjaGUgbXVzdCBtYXRjaCBjdXJyZW50IHZlcnNpb25cbiAgICAgIH1cbiAgICAgIHZhciBzdGFsZSA9IHR5cGVvZiBpdGVtLmV4cGlyZXMgIT09ICdudW1iZXInIHx8IERhdGUubm93KCkgPj0gaXRlbS5leHBpcmVzO1xuICAgICAgaWYgKHN0YWxlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gY2FjaGUgbXVzdCBiZSBmcmVzaFxuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgbmV4dCgpO1xufVxuXG5mdW5jdGlvbiBzZXQgKHVybCwgZGF0YSwgZHVyYXRpb24pIHtcbiAgaWYgKGR1cmF0aW9uIDwgMSkgeyAvLyBzYW5pdHlcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGNsb25lZCA9IGNsb25lKGRhdGEpOyAvLyBmcmVlemUgYSBjb3B5IGZvciBvdXIgcmVjb3Jkc1xuICBzdG9yZXMuZm9yRWFjaChzdG9yZSk7XG4gIGZ1bmN0aW9uIHN0b3JlIChzKSB7XG4gICAgcy5zZXQodXJsLCB7XG4gICAgICBkYXRhOiBjbG9uZWQsXG4gICAgICB2ZXJzaW9uOiBjbG9uZWQuX190dixcbiAgICAgIGV4cGlyZXM6IERhdGUubm93KCkgKyBkdXJhdGlvblxuICAgIH0pO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBnZXQ6IGdldCxcbiAgc2V0OiBzZXRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjYWNoZSA9IHJlcXVpcmUoJy4vY2FjaGUnKTtcbnZhciBpZGIgPSByZXF1aXJlKCcuL3N0b3Jlcy9pZGInKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgZGVmYXVsdHMgPSAxNTtcbnZhciBiYXNlbGluZTtcblxuZnVuY3Rpb24gZSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBnZXRLZXkgKHJvdXRlKSB7XG4gIHJldHVybiByb3V0ZS5wYXJ0cy5wYXRobmFtZSArIGUocm91dGUucGFydHMucXVlcnkpO1xufVxuXG5mdW5jdGlvbiBzZXR1cCAoZHVyYXRpb24sIHJvdXRlKSB7XG4gIGJhc2VsaW5lID0gcGFyc2VEdXJhdGlvbihkdXJhdGlvbik7XG4gIGlmIChiYXNlbGluZSA8IDEpIHtcbiAgICBzdGF0ZS5jYWNoZSA9IGZhbHNlO1xuICAgIHJldHVybjtcbiAgfVxuICBpbnRlcmNlcHRvci5hZGQoaW50ZXJjZXB0KTtcbiAgZW1pdHRlci5vbignZmV0Y2guZG9uZScsIHBlcnNpc3QpO1xuICBzdGF0ZS5jYWNoZSA9IHRydWU7XG59XG5cbmZ1bmN0aW9uIGludGVyY2VwdCAoZSkge1xuICBjYWNoZS5nZXQoZ2V0S2V5KGUucm91dGUpLCByZXN1bHQpO1xuXG4gIGZ1bmN0aW9uIHJlc3VsdCAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKCFlcnIgJiYgZGF0YSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdChkYXRhKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VEdXJhdGlvbiAodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGJhc2VsaW5lIHx8IGRlZmF1bHRzO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0IChyb3V0ZSwgY29udGV4dCwgZGF0YSkge1xuICBpZiAoIXN0YXRlLmNhY2hlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb3V0ZS5jYWNoZSA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGQgPSBiYXNlbGluZTtcbiAgaWYgKHR5cGVvZiByb3V0ZS5jYWNoZSA9PT0gJ251bWJlcicpIHtcbiAgICBkID0gcm91dGUuY2FjaGU7XG4gIH1cbiAgY2FjaGUuc2V0KGdldEtleShyb3V0ZSksIGRhdGEsIHBhcnNlRHVyYXRpb24oZCkgKiAxMDAwKTtcbn1cblxuZnVuY3Rpb24gcmVhZHkgKGZuKSB7XG4gIGlmIChzdGF0ZS5jYWNoZSkge1xuICAgIGlkYi50ZXN0ZWQoZm4pOyAvLyB3YWl0IG9uIGlkYiBjb21wYXRpYmlsaXR5IHRlc3RzXG4gIH0gZWxzZSB7XG4gICAgZm4oKTsgLy8gY2FjaGluZyBpcyBhIG5vLW9wXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHNldHVwOiBzZXR1cCxcbiAgcGVyc2lzdDogcGVyc2lzdCxcbiAgcmVhZHk6IHJlYWR5XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBjbG9uZSAodmFsdWUpIHtcbiAgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjbG9uZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGVtaXR0ZXIoe30sIHsgdGhyb3dzOiBmYWxzZSB9KTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gYWRkIChlbGVtZW50LCB0eXBlLCBmbikge1xuICBpZiAoZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGZuKTtcbiAgfSBlbHNlIGlmIChlbGVtZW50LmF0dGFjaEV2ZW50KSB7XG4gICAgZWxlbWVudC5hdHRhY2hFdmVudCgnb24nICsgdHlwZSwgd3JhcHBlckZhY3RvcnkoZWxlbWVudCwgZm4pKTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtZW50WydvbicgKyB0eXBlXSA9IGZuO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbGVtZW50LCBmbikge1xuICByZXR1cm4gZnVuY3Rpb24gd3JhcHBlciAob3JpZ2luYWxFdmVudCkge1xuICAgIHZhciBlID0gb3JpZ2luYWxFdmVudCB8fCB3aW5kb3cuZXZlbnQ7XG4gICAgZS50YXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCAgPSBlLnByZXZlbnREZWZhdWx0ICB8fCBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAoKSB7IGUucmV0dXJuVmFsdWUgPSBmYWxzZTsgfTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbiA9IGUuc3RvcFByb3BhZ2F0aW9uIHx8IGZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbiAoKSB7IGUuY2FuY2VsQnViYmxlID0gdHJ1ZTsgfTtcbiAgICBmbi5jYWxsKGVsZW1lbnQsIGUpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCcuL3hocicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBsYXN0WGhyID0ge307XG5cbmZ1bmN0aW9uIGUgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24ganNvbmlmeSAocm91dGUpIHtcbiAgdmFyIHBhcnRzID0gcm91dGUucGFydHM7XG4gIHZhciBxcyA9IGUocGFydHMuc2VhcmNoKTtcbiAgdmFyIHAgPSBxcyA/ICcmJyA6ICc/JztcbiAgcmV0dXJuIHBhcnRzLnBhdGhuYW1lICsgcXMgKyBwICsgJ2pzb24nO1xufVxuXG5mdW5jdGlvbiBhYm9ydCAoc291cmNlKSB7XG4gIGlmIChsYXN0WGhyW3NvdXJjZV0pIHtcbiAgICBsYXN0WGhyW3NvdXJjZV0uYWJvcnQoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhYm9ydFBlbmRpbmcgKCkge1xuICBPYmplY3Qua2V5cyhsYXN0WGhyKS5mb3JFYWNoKGFib3J0KTtcbiAgbGFzdFhociA9IHt9O1xufVxuXG5mdW5jdGlvbiBmZXRjaGVyIChyb3V0ZSwgY29udGV4dCwgZG9uZSkge1xuICB2YXIgdXJsID0gcm91dGUudXJsO1xuICBpZiAobGFzdFhocltjb250ZXh0LnNvdXJjZV0pIHtcbiAgICBsYXN0WGhyW2NvbnRleHQuc291cmNlXS5hYm9ydCgpO1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0gbnVsbDtcbiAgfVxuICBpbnRlcmNlcHRvci5leGVjdXRlKHJvdXRlLCBhZnRlckludGVyY2VwdG9ycyk7XG5cbiAgZnVuY3Rpb24gYWZ0ZXJJbnRlcmNlcHRvcnMgKGVyciwgcmVzdWx0KSB7XG4gICAgaWYgKCFlcnIgJiYgcmVzdWx0LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgIGRvbmUobnVsbCwgcmVzdWx0Lm1vZGVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5zdGFydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0geGhyKGpzb25pZnkocm91dGUpLCBub3RpZnkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeSAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgaWYgKGVyci5tZXNzYWdlID09PSAnYWJvcnRlZCcpIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5hYm9ydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guZXJyb3InLCByb3V0ZSwgY29udGV4dCwgZXJyKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEgJiYgZGF0YS5fX3R2KSB7XG4gICAgICAgIHN0YXRlLnZlcnNpb24gPSBkYXRhLl9fdHY7IC8vIHN5bmMgdmVyc2lvbiBleHBlY3RhdGlvbiB3aXRoIHNlcnZlci1zaWRlXG4gICAgICB9XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmRvbmUnLCByb3V0ZSwgY29udGV4dCwgZGF0YSk7XG4gICAgfVxuICAgIGRvbmUoZXJyLCBkYXRhKTtcbiAgfVxufVxuXG5mZXRjaGVyLmFib3J0UGVuZGluZyA9IGFib3J0UGVuZGluZztcblxubW9kdWxlLmV4cG9ydHMgPSBmZXRjaGVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGxpbmtzID0gcmVxdWlyZSgnLi9saW5rcycpO1xuXG5mdW5jdGlvbiBhdHRhY2ggKCkge1xuICBlbWl0dGVyLm9uKCdzdGFydCcsIGxpbmtzKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF0dGFjaDogYXR0YWNoXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaG9va3MgPSByZXF1aXJlKCcuL2hvb2tzJyk7XG52YXIgcGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xudmFyIG1vdW50ID0gcmVxdWlyZSgnLi9tb3VudCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG5cbmhvb2tzLmF0dGFjaCgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbW91bnQ6IG1vdW50LFxuICBwYXJ0aWFsOiBwYXJ0aWFsLnN0YW5kYWxvbmUsXG4gIG9uOiBlbWl0dGVyLm9uLmJpbmQoZW1pdHRlciksXG4gIG9uY2U6IGVtaXR0ZXIub25jZS5iaW5kKGVtaXR0ZXIpLFxuICBvZmY6IGVtaXR0ZXIub2ZmLmJpbmQoZW1pdHRlciksXG4gIGludGVyY2VwdDogaW50ZXJjZXB0b3IuYWRkLFxuICBuYXZpZ2F0ZTogYWN0aXZhdG9yLmdvLFxuICBzdGF0ZTogc3RhdGUsXG4gIHJvdXRlOiByb3V0ZXJcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhLmVtaXR0ZXInKTtcbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBpbnRlcmNlcHRvcnMgPSBlbWl0dGVyKHsgY291bnQ6IDAgfSwgeyBhc3luYzogdHJ1ZSB9KTtcblxuZnVuY3Rpb24gZ2V0SW50ZXJjZXB0b3JFdmVudCAocm91dGUpIHtcbiAgdmFyIGUgPSB7XG4gICAgdXJsOiByb3V0ZS51cmwsXG4gICAgcm91dGU6IHJvdXRlLFxuICAgIHBhcnRzOiByb3V0ZS5wYXJ0cyxcbiAgICBtb2RlbDogbnVsbCxcbiAgICBjYW5QcmV2ZW50RGVmYXVsdDogdHJ1ZSxcbiAgICBkZWZhdWx0UHJldmVudGVkOiBmYWxzZSxcbiAgICBwcmV2ZW50RGVmYXVsdDogb25jZShwcmV2ZW50RGVmYXVsdClcbiAgfTtcblxuICBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAobW9kZWwpIHtcbiAgICBpZiAoIWUuY2FuUHJldmVudERlZmF1bHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZS5jYW5QcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgIGUuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgZS5tb2RlbCA9IG1vZGVsO1xuICB9XG5cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGFkZCAoYWN0aW9uLCBmbikge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGZuID0gYWN0aW9uO1xuICAgIGFjdGlvbiA9ICcqJztcbiAgfVxuICBpbnRlcmNlcHRvcnMuY291bnQrKztcbiAgaW50ZXJjZXB0b3JzLm9uKGFjdGlvbiwgZm4pO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlU3luYyAocm91dGUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlKTtcblxuICBpbnRlcmNlcHRvcnMuZW1pdCgnKicsIGUpO1xuICBpbnRlcmNlcHRvcnMuZW1pdChyb3V0ZS5hY3Rpb24sIGUpO1xuXG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlIChyb3V0ZSwgZG9uZSkge1xuICB2YXIgZSA9IGdldEludGVyY2VwdG9yRXZlbnQocm91dGUpO1xuICBpZiAoaW50ZXJjZXB0b3JzLmNvdW50ID09PSAwKSB7IC8vIGZhaWwgZmFzdFxuICAgIGVuZCgpOyByZXR1cm47XG4gIH1cbiAgdmFyIGZuID0gb25jZShlbmQpO1xuICB2YXIgcHJldmVudERlZmF1bHRCYXNlID0gZS5wcmV2ZW50RGVmYXVsdDtcblxuICBlLnByZXZlbnREZWZhdWx0ID0gb25jZShwcmV2ZW50RGVmYXVsdEVuZHMpO1xuXG4gIGludGVyY2VwdG9ycy5lbWl0KCcqJywgZSk7XG4gIGludGVyY2VwdG9ycy5lbWl0KHJvdXRlLmFjdGlvbiwgZSk7XG5cbiAgc2V0VGltZW91dChmbiwgMjAwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDIwMG1zIHdhaXRpbmcgb24gaW50ZXJjZXB0b3JzXG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHRFbmRzICgpIHtcbiAgICBwcmV2ZW50RGVmYXVsdEJhc2UuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICBmbigpO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kICgpIHtcbiAgICBlLmNhblByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgZG9uZShudWxsLCBlKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGQsXG4gIGV4ZWN1dGU6IGV4ZWN1dGVcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgb3JpZ2luID0gZG9jdW1lbnQubG9jYXRpb24ub3JpZ2luO1xudmFyIGxlZnRDbGljayA9IDE7XG52YXIgcHJlZmV0Y2hpbmcgPSBbXTtcbnZhciBjbGlja3NPbkhvbGQgPSBbXTtcblxuZnVuY3Rpb24gbGlua3MgKCkge1xuICBpZiAoc3RhdGUucHJlZmV0Y2ggJiYgc3RhdGUuY2FjaGUpIHsgLy8gcHJlZmV0Y2ggd2l0aG91dCBjYWNoZSBtYWtlcyBubyBzZW5zZVxuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ21vdXNlb3ZlcicsIG1heWJlUHJlZmV0Y2gpO1xuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ3RvdWNoc3RhcnQnLCBtYXliZVByZWZldGNoKTtcbiAgfVxuICBldmVudHMuYWRkKGRvY3VtZW50LmJvZHksICdjbGljaycsIG1heWJlUmVyb3V0ZSk7XG59XG5cbmZ1bmN0aW9uIHNvIChhbmNob3IpIHtcbiAgcmV0dXJuIGFuY2hvci5vcmlnaW4gPT09IG9yaWdpbjtcbn1cblxuZnVuY3Rpb24gbGVmdENsaWNrT25BbmNob3IgKGUsIGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLnBhdGhuYW1lICYmIGUud2hpY2ggPT09IGxlZnRDbGljayAmJiAhZS5tZXRhS2V5ICYmICFlLmN0cmxLZXk7XG59XG5cbmZ1bmN0aW9uIHRhcmdldE9yQW5jaG9yIChlKSB7XG4gIHZhciBhbmNob3IgPSBlLnRhcmdldDtcbiAgd2hpbGUgKGFuY2hvcikge1xuICAgIGlmIChhbmNob3IudGFnTmFtZSA9PT0gJ0EnKSB7XG4gICAgICByZXR1cm4gYW5jaG9yO1xuICAgIH1cbiAgICBhbmNob3IgPSBhbmNob3IucGFyZW50RWxlbWVudDtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVJlcm91dGUgKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikgJiYgbGVmdENsaWNrT25BbmNob3IoZSwgYW5jaG9yKSkge1xuICAgIHJlcm91dGUoZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVByZWZldGNoIChlKSB7XG4gIHZhciBhbmNob3IgPSB0YXJnZXRPckFuY2hvcihlKTtcbiAgaWYgKGFuY2hvciAmJiBzbyhhbmNob3IpKSB7XG4gICAgcHJlZmV0Y2goZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBub29wICgpIHt9XG5cbmZ1bmN0aW9uIGdldFJvdXRlIChhbmNob3IpIHtcbiAgdmFyIHVybCA9IGFuY2hvci5wYXRobmFtZSArIGFuY2hvci5zZWFyY2ggKyBhbmNob3IuaGFzaDtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUuaWdub3JlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gcmVyb3V0ZSAoZSwgYW5jaG9yKSB7XG4gIHZhciByb3V0ZSA9IGdldFJvdXRlKGFuY2hvcik7XG4gIGlmICghcm91dGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcmV2ZW50KCk7XG5cbiAgaWYgKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICBjbGlja3NPbkhvbGQucHVzaChhbmNob3IpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGFjdGl2YXRvci5nbyhyb3V0ZS51cmwsIHsgY29udGV4dDogYW5jaG9yIH0pO1xuXG4gIGZ1bmN0aW9uIHByZXZlbnQgKCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IH1cbn1cblxuZnVuY3Rpb24gcHJlZmV0Y2ggKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcmVmZXRjaGluZy5wdXNoKGFuY2hvcik7XG4gIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogYW5jaG9yLCBzb3VyY2U6ICdwcmVmZXRjaCcgfSwgcmVzb2x2ZWQpO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVkIChlcnIsIGRhdGEpIHtcbiAgICBwcmVmZXRjaGluZy5zcGxpY2UocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpLCAxKTtcbiAgICBpZiAoY2xpY2tzT25Ib2xkLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICAgIGNsaWNrc09uSG9sZC5zcGxpY2UoY2xpY2tzT25Ib2xkLmluZGV4T2YoYW5jaG9yKSwgMSk7XG4gICAgICBhY3RpdmF0b3IuZ28ocm91dGUudXJsLCB7IGNvbnRleHQ6IGFuY2hvciB9KTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBsaW5rcztcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHVuZXNjYXBlID0gcmVxdWlyZSgnLi91bmVzY2FwZScpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBjYWNoaW5nID0gcmVxdWlyZSgnLi9jYWNoaW5nJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIHZlcnNpb25pbmcgPSByZXF1aXJlKCcuLi92ZXJzaW9uaW5nJyk7XG52YXIgZyA9IGdsb2JhbDtcbnZhciBtb3VudGVkO1xudmFyIGJvb3RlZDtcblxuZnVuY3Rpb24gb3JFbXB0eSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBtb3VudCAoY29udGFpbmVyLCB3aXJpbmcsIG9wdGlvbnMpIHtcbiAgdmFyIG8gPSBvcHRpb25zIHx8IHt9O1xuICBpZiAobW91bnRlZCkge1xuICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIGFscmVhZHkgbW91bnRlZCEnKTtcbiAgfVxuICBpZiAoIWNvbnRhaW5lciB8fCAhY29udGFpbmVyLnRhZ05hbWUpIHsgLy8gbmHDr3ZlIGlzIGVub3VnaFxuICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgZGVmaW5lIGFuIGFwcGxpY2F0aW9uIHJvb3QgY29udGFpbmVyIScpO1xuICB9XG5cbiAgbW91bnRlZCA9IHRydWU7XG5cbiAgc3RhdGUuY29udGFpbmVyID0gY29udGFpbmVyO1xuICBzdGF0ZS5jb250cm9sbGVycyA9IHdpcmluZy5jb250cm9sbGVycztcbiAgc3RhdGUudGVtcGxhdGVzID0gd2lyaW5nLnRlbXBsYXRlcztcbiAgc3RhdGUucm91dGVzID0gd2lyaW5nLnJvdXRlcztcbiAgc3RhdGUucHJlZmV0Y2ggPSAhIW8ucHJlZmV0Y2g7XG4gIHN0YXRlLnZlcnNpb24gPSB2ZXJzaW9uaW5nLmdldChvLnZlcnNpb24gfHwgJzEnKTtcblxuICByb3V0ZXIuc2V0dXAod2lyaW5nLnJvdXRlcyk7XG5cbiAgdmFyIHVybCA9IGxvY2F0aW9uLnBhdGhuYW1lO1xuICB2YXIgcXVlcnkgPSBvckVtcHR5KGxvY2F0aW9uLnNlYXJjaCkgKyBvckVtcHR5KGxvY2F0aW9uLmhhc2gpO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsICsgcXVlcnkpO1xuXG4gIGNhY2hpbmcuc2V0dXAoby5jYWNoZSwgcm91dGUpO1xuICBjYWNoaW5nLnJlYWR5KGtpY2tzdGFydCk7XG5cbiAgZnVuY3Rpb24ga2lja3N0YXJ0ICgpIHtcbiAgICBpZiAoIW8uYm9vdHN0cmFwKSB7IG8uYm9vdHN0cmFwID0gJ2F1dG8nOyB9XG4gICAgaWYgKG8uYm9vdHN0cmFwID09PSAnYXV0bycpIHtcbiAgICAgIGF1dG9ib290KCk7XG4gICAgfSBlbHNlIGlmIChvLmJvb3RzdHJhcCA9PT0gJ2lubGluZScpIHtcbiAgICAgIGlubGluZWJvb3QoKTtcbiAgICB9IGVsc2UgaWYgKG8uYm9vdHN0cmFwID09PSAnbWFudWFsJykge1xuICAgICAgbWFudWFsYm9vdCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3Ioby5ib290c3RyYXAgKyAnIGlzIG5vdCBhIHZhbGlkIGJvb3RzdHJhcCBtb2RlIScpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF1dG9ib290ICgpIHtcbiAgICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgc291cmNlOiAnYm9vdCcgfSwgZmV0Y2hlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBmZXRjaGVkIChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZldGNoaW5nIEpTT04gZGF0YSBtb2RlbCBmb3IgZmlyc3QgdmlldyBmYWlsZWQuJyk7XG4gICAgfVxuICAgIGJvb3QoZGF0YSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmxpbmVib290ICgpIHtcbiAgICB2YXIgaWQgPSBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLXRhdW51cycpO1xuICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIG1vZGVsID0gSlNPTi5wYXJzZSh1bmVzY2FwZShzY3JpcHQuaW5uZXJUZXh0IHx8IHNjcmlwdC50ZXh0Q29udGVudCkpO1xuICAgIGJvb3QobW9kZWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gbWFudWFsYm9vdCAoKSB7XG4gICAgaWYgKHR5cGVvZiBnLnRhdW51c1JlYWR5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBnLnRhdW51c1JlYWR5ID0gYm9vdDsgLy8gbm90IHlldCBhbiBvYmplY3Q/IHR1cm4gaXQgaW50byB0aGUgYm9vdCBtZXRob2RcbiAgICB9IGVsc2UgaWYgKGcudGF1bnVzUmVhZHkgJiYgdHlwZW9mIGcudGF1bnVzUmVhZHkgPT09ICdvYmplY3QnKSB7XG4gICAgICBib290KGcudGF1bnVzUmVhZHkpOyAvLyBhbHJlYWR5IGFuIG9iamVjdD8gYm9vdCB3aXRoIHRoYXQgYXMgdGhlIG1vZGVsXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRGlkIHlvdSBmb3JnZXQgdG8gYWRkIHRoZSB0YXVudXNSZWFkeSBnbG9iYWw/Jyk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYm9vdCAobW9kZWwpIHtcbiAgICBpZiAoYm9vdGVkKSB7IC8vIHNhbml0eVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIW1vZGVsIHx8IHR5cGVvZiBtb2RlbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIG1vZGVsIG11c3QgYmUgYW4gb2JqZWN0IScpO1xuICAgIH1cbiAgICBib290ZWQgPSB0cnVlO1xuICAgIGNhY2hpbmcucGVyc2lzdChyb3V0ZSwgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gICAgYWN0aXZhdG9yLnN0YXJ0KG1vZGVsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1vdW50O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxuLy8gc291cmNlOiBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9qZGFsdG9uLzVlMzRkODkwMTA1YWNhNDQzOTlmXG4vLyB0aGFua3MgQGpkYWx0b24hXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7IC8vIHVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgYFtbQ2xhc3NdXWAgb2YgdmFsdWVzXG52YXIgZm5Ub1N0cmluZyA9IEZ1bmN0aW9uLnByb3RvdHlwZS50b1N0cmluZzsgLy8gdXNlZCB0byByZXNvbHZlIHRoZSBkZWNvbXBpbGVkIHNvdXJjZSBvZiBmdW5jdGlvbnNcbnZhciBob3N0ID0gL15cXFtvYmplY3QgLis/Q29uc3RydWN0b3JcXF0kLzsgLy8gdXNlZCB0byBkZXRlY3QgaG9zdCBjb25zdHJ1Y3RvcnMgKFNhZmFyaSA+IDQ7IHJlYWxseSB0eXBlZCBhcnJheSBzcGVjaWZpYylcblxuLy8gRXNjYXBlIGFueSBzcGVjaWFsIHJlZ2V4cCBjaGFyYWN0ZXJzLlxudmFyIHNwZWNpYWxzID0gL1suKis/XiR7fSgpfFtcXF1cXC9cXFxcXS9nO1xuXG4vLyBSZXBsYWNlIG1lbnRpb25zIG9mIGB0b1N0cmluZ2Agd2l0aCBgLio/YCB0byBrZWVwIHRoZSB0ZW1wbGF0ZSBnZW5lcmljLlxuLy8gUmVwbGFjZSB0aGluZyBsaWtlIGBmb3IgLi4uYCB0byBzdXBwb3J0IGVudmlyb25tZW50cywgbGlrZSBSaGlubywgd2hpY2ggYWRkIGV4dHJhXG4vLyBpbmZvIHN1Y2ggYXMgbWV0aG9kIGFyaXR5LlxudmFyIGV4dHJhcyA9IC90b1N0cmluZ3woZnVuY3Rpb24pLio/KD89XFxcXFxcKCl8IGZvciAuKz8oPz1cXFxcXFxdKS9nO1xuXG4vLyBDb21waWxlIGEgcmVnZXhwIHVzaW5nIGEgY29tbW9uIG5hdGl2ZSBtZXRob2QgYXMgYSB0ZW1wbGF0ZS5cbi8vIFdlIGNob3NlIGBPYmplY3QjdG9TdHJpbmdgIGJlY2F1c2UgdGhlcmUncyBhIGdvb2QgY2hhbmNlIGl0IGlzIG5vdCBiZWluZyBtdWNrZWQgd2l0aC5cbnZhciBmblN0cmluZyA9IFN0cmluZyh0b1N0cmluZykucmVwbGFjZShzcGVjaWFscywgJ1xcXFwkJicpLnJlcGxhY2UoZXh0cmFzLCAnJDEuKj8nKTtcbnZhciByZU5hdGl2ZSA9IG5ldyBSZWdFeHAoJ14nICsgZm5TdHJpbmcgKyAnJCcpO1xuXG5mdW5jdGlvbiBuYXRpdmVGbiAodmFsdWUpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgLy8gVXNlIGBGdW5jdGlvbiN0b1N0cmluZ2AgdG8gYnlwYXNzIHRoZSB2YWx1ZSdzIG93biBgdG9TdHJpbmdgIG1ldGhvZFxuICAgIC8vIGFuZCBhdm9pZCBiZWluZyBmYWtlZCBvdXQuXG4gICAgcmV0dXJuIHJlTmF0aXZlLnRlc3QoZm5Ub1N0cmluZy5jYWxsKHZhbHVlKSk7XG4gIH1cblxuICAvLyBGYWxsYmFjayB0byBhIGhvc3Qgb2JqZWN0IGNoZWNrIGJlY2F1c2Ugc29tZSBlbnZpcm9ubWVudHMgd2lsbCByZXByZXNlbnRcbiAgLy8gdGhpbmdzIGxpa2UgdHlwZWQgYXJyYXlzIGFzIERPTSBtZXRob2RzIHdoaWNoIG1heSBub3QgY29uZm9ybSB0byB0aGVcbiAgLy8gbm9ybWFsIG5hdGl2ZSBwYXR0ZXJuLlxuICByZXR1cm4gKHZhbHVlICYmIHR5cGUgPT09ICdvYmplY3QnICYmIGhvc3QudGVzdCh0b1N0cmluZy5jYWxsKHZhbHVlKSkpIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG5hdGl2ZUZuO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChmbikge1xuICB2YXIgdXNlZDtcbiAgcmV0dXJuIGZ1bmN0aW9uIG9uY2UgKCkge1xuICAgIGlmICh1c2VkKSB7IHJldHVybjsgfSB1c2VkID0gdHJ1ZTtcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG5cbmZ1bmN0aW9uIHBhcnRpYWwgKGNvbnRhaW5lciwgZW5mb3JjZWRBY3Rpb24sIG1vZGVsLCByb3V0ZSwgb3B0aW9ucykge1xuICB2YXIgYWN0aW9uID0gZW5mb3JjZWRBY3Rpb24gfHwgbW9kZWwgJiYgbW9kZWwuYWN0aW9uIHx8IHJvdXRlICYmIHJvdXRlLmFjdGlvbjtcbiAgdmFyIGNvbnRyb2xsZXIgPSBzdGF0ZS5jb250cm9sbGVyc1thY3Rpb25dO1xuICB2YXIgaW50ZXJuYWxzID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKGludGVybmFscy5yZW5kZXIgIT09IGZhbHNlKSB7XG4gICAgY29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlcihhY3Rpb24sIG1vZGVsKTtcbiAgfVxuICBlbWl0dGVyLmVtaXQoJ3JlbmRlcicsIGNvbnRhaW5lciwgbW9kZWwpO1xuICBpZiAoY29udHJvbGxlcikge1xuICAgIGNvbnRyb2xsZXIobW9kZWwsIGNvbnRhaW5lciwgcm91dGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlciAoYWN0aW9uLCBtb2RlbCkge1xuICB2YXIgdGVtcGxhdGUgPSBzdGF0ZS50ZW1wbGF0ZXNbYWN0aW9uXTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gdGVtcGxhdGUobW9kZWwpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciByZW5kZXJpbmcgXCInICsgYWN0aW9uICsgJ1wiIHRlbXBsYXRlXFxuJyArIGUuc3RhY2spO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YW5kYWxvbmUgKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCwgcm91dGUpIHtcbiAgcmV0dXJuIHBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSwgeyByb3V0ZWQ6IGZhbHNlIH0pO1xufVxuXG5wYXJ0aWFsLnN0YW5kYWxvbmUgPSBzdGFuZGFsb25lO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnRpYWw7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1cmwgPSByZXF1aXJlKCdmYXN0LXVybC1wYXJzZXInKTtcbnZhciByb3V0ZXMgPSByZXF1aXJlKCdyb3V0ZXMnKTtcbnZhciBtYXRjaGVyID0gcm91dGVzKCk7XG52YXIgcHJvdG9jb2wgPSAvXlthLXpdKz86XFwvXFwvL2k7XG5cbmZ1bmN0aW9uIGdldEZ1bGxVcmwgKHJhdykge1xuICB2YXIgYmFzZSA9IGxvY2F0aW9uLmhyZWYuc3Vic3RyKGxvY2F0aW9uLm9yaWdpbi5sZW5ndGgpO1xuICB2YXIgaGFzaGxlc3M7XG4gIGlmICghcmF3KSB7XG4gICAgcmV0dXJuIGJhc2U7XG4gIH1cbiAgaWYgKHJhd1swXSA9PT0gJyMnKSB7XG4gICAgaGFzaGxlc3MgPSBiYXNlLnN1YnN0cigwLCBiYXNlLmxlbmd0aCAtIGxvY2F0aW9uLmhhc2gubGVuZ3RoKTtcbiAgICByZXR1cm4gaGFzaGxlc3MgKyByYXc7XG4gIH1cbiAgaWYgKHByb3RvY29sLnRlc3QocmF3KSkge1xuICAgIGlmIChyYXcuaW5kZXhPZihsb2NhdGlvbi5vcmlnaW4pID09PSAwKSB7XG4gICAgICByZXR1cm4gcmF3LnN1YnN0cihsb2NhdGlvbi5vcmlnaW4ubGVuZ3RoKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHJhdztcbn1cblxuZnVuY3Rpb24gcm91dGVyIChyYXcpIHtcbiAgdmFyIGZ1bGwgPSBnZXRGdWxsVXJsKHJhdyk7XG4gIGlmIChmdWxsID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGZ1bGw7XG4gIH1cbiAgdmFyIHBhcnRzID0gdXJsLnBhcnNlKGZ1bGwpO1xuICB2YXIgcmVzdWx0ID0gbWF0Y2hlci5tYXRjaChwYXJ0cy5wYXRobmFtZSk7XG4gIHZhciByb3V0ZSA9IHJlc3VsdCA/IHJlc3VsdC5mbihyZXN1bHQpIDogbnVsbDtcbiAgaWYgKHJvdXRlKSB7XG4gICAgcm91dGUudXJsID0gZnVsbDtcbiAgICByb3V0ZS5wYXJ0cyA9IHBhcnRzO1xuICB9XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gc2V0dXAgKGRlZmluaXRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmluaXRpb25zKS5mb3JFYWNoKGRlZmluZS5iaW5kKG51bGwsIGRlZmluaXRpb25zKSk7XG59XG5cbmZ1bmN0aW9uIGRlZmluZSAoZGVmaW5pdGlvbnMsIGtleSkge1xuICBtYXRjaGVyLmFkZFJvdXRlKGtleSwgZnVuY3Rpb24gZGVmaW5pdGlvbiAobWF0Y2gpIHtcbiAgICB2YXIgcGFyYW1zID0gbWF0Y2gucGFyYW1zO1xuICAgIHBhcmFtcy5hcmdzID0gbWF0Y2guc3BsYXRzO1xuICAgIHJldHVybiB7XG4gICAgICByb3V0ZToga2V5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICBhY3Rpb246IGRlZmluaXRpb25zW2tleV0uYWN0aW9uIHx8IG51bGwsXG4gICAgICBpZ25vcmU6IGRlZmluaXRpb25zW2tleV0uaWdub3JlLFxuICAgICAgY2FjaGU6IGRlZmluaXRpb25zW2tleV0uY2FjaGVcbiAgICB9O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZXF1YWxzIChsZWZ0LCByaWdodCkge1xuICByZXR1cm4gbGVmdCAmJiByaWdodCAmJiBsZWZ0LnJvdXRlID09PSByaWdodC5yb3V0ZSAmJiBKU09OLnN0cmluZ2lmeShsZWZ0LnBhcmFtcykgPT09IEpTT04uc3RyaW5naWZ5KHJpZ2h0LnBhcmFtcyk7XG59XG5cbnJvdXRlci5zZXR1cCA9IHNldHVwO1xucm91dGVyLmVxdWFscyA9IGVxdWFscztcblxubW9kdWxlLmV4cG9ydHMgPSByb3V0ZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBjb250YWluZXI6IG51bGxcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBhcGkgPSB7fTtcbnZhciBnID0gZ2xvYmFsO1xudmFyIGlkYiA9IGcuaW5kZXhlZERCIHx8IGcubW96SW5kZXhlZERCIHx8IGcud2Via2l0SW5kZXhlZERCIHx8IGcubXNJbmRleGVkREI7XG52YXIgc3VwcG9ydHM7XG52YXIgZGI7XG52YXIgZGJOYW1lID0gJ3RhdW51cy1jYWNoZSc7XG52YXIgc3RvcmUgPSAndmlldy1tb2RlbHMnO1xudmFyIGtleVBhdGggPSAndXJsJztcbnZhciBzZXRRdWV1ZSA9IFtdO1xudmFyIHRlc3RlZFF1ZXVlID0gW107XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gdGVzdCAoKSB7XG4gIHZhciBrZXkgPSAnaW5kZXhlZC1kYi1mZWF0dXJlLWRldGVjdGlvbic7XG4gIHZhciByZXE7XG4gIHZhciBkYjtcblxuICBpZiAoIShpZGIgJiYgJ2RlbGV0ZURhdGFiYXNlJyBpbiBpZGIpKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7IHJldHVybjtcbiAgfVxuXG4gIHRyeSB7XG4gICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSkub25zdWNjZXNzID0gdHJhbnNhY3Rpb25hbFRlc3Q7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyYW5zYWN0aW9uYWxUZXN0ICgpIHtcbiAgICByZXEgPSBpZGIub3BlbihrZXksIDEpO1xuICAgIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gICAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICAgIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgICByZXEucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdzdG9yZScpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgICAgZGIgPSByZXEucmVzdWx0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGIudHJhbnNhY3Rpb24oJ3N0b3JlJywgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKCdzdG9yZScpLmFkZChuZXcgQmxvYigpLCAna2V5Jyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZGIuY2xvc2UoKTtcbiAgICAgICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSk7XG4gICAgICAgIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICBvcGVuKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgICBzdXBwb3J0KGZhbHNlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gb3BlbiAoKSB7XG4gIHZhciByZXEgPSBpZGIub3BlbihkYk5hbWUsIDEpO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuICByZXEub251cGdyYWRlbmVlZGVkID0gdXBnbmVlZGVkO1xuICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICBmdW5jdGlvbiB1cGduZWVkZWQgKCkge1xuICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoc3RvcmUsIHsga2V5UGF0aDoga2V5UGF0aCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIGRiID0gcmVxLnJlc3VsdDtcbiAgICBhcGkubmFtZSA9ICdJbmRleGVkREInO1xuICAgIGFwaS5nZXQgPSBnZXQ7XG4gICAgYXBpLnNldCA9IHNldDtcbiAgICBkcmFpblNldCgpO1xuICAgIHN1cHBvcnQodHJ1ZSk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmFsbGJhY2sgKCkge1xuICBhcGkubmFtZSA9ICdJbmRleGVkREItZmFsbGJhY2tTdG9yZSc7XG4gIGFwaS5nZXQgPSB1bmRlZmluZWRHZXQ7XG4gIGFwaS5zZXQgPSBlbnF1ZXVlU2V0O1xufVxuXG5mdW5jdGlvbiB1bmRlZmluZWRHZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIG51bGwpO1xufVxuXG5mdW5jdGlvbiBlbnF1ZXVlU2V0IChrZXksICB2YWx1ZSwgZG9uZSkge1xuICBpZiAoc2V0UXVldWUubGVuZ3RoID4gMikgeyAvLyBsZXQncyBub3Qgd2FzdGUgYW55IG1vcmUgbWVtb3J5XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHsgLy8gbGV0J3MgYXNzdW1lIHRoZSBjYXBhYmlsaXR5IGlzIHZhbGlkYXRlZCBzb29uXG4gICAgc2V0UXVldWUucHVzaCh7IGtleToga2V5LCB2YWx1ZTogdmFsdWUsIGRvbmU6IGRvbmUgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5TZXQgKCkge1xuICB3aGlsZSAoc2V0UXVldWUubGVuZ3RoKSB7XG4gICAgdmFyIGl0ZW0gPSBzZXRRdWV1ZS5zaGlmdCgpO1xuICAgIHNldChpdGVtLmtleSwgaXRlbS52YWx1ZSwgaXRlbS5kb25lKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBxdWVyeSAob3AsIHZhbHVlLCBkb25lKSB7XG4gIHZhciByZXEgPSBkYi50cmFuc2FjdGlvbihzdG9yZSwgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKHN0b3JlKVtvcF0odmFsdWUpO1xuXG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG51bGwsIHJlcS5yZXN1bHQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG5ldyBFcnJvcignVGF1bnVzIGNhY2hlIHF1ZXJ5IGZhaWxlZCBhdCBJbmRleGVkREIhJykpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldCAoa2V5LCBkb25lKSB7XG4gIHF1ZXJ5KCdnZXQnLCBrZXksIGRvbmUpO1xufVxuXG5mdW5jdGlvbiBzZXQgKGtleSwgdmFsdWUsIGRvbmUpIHtcbiAgdmFsdWVba2V5UGF0aF0gPSBrZXk7XG4gIHF1ZXJ5KCdhZGQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gaW5zZXJ0XG4gIHF1ZXJ5KCdwdXQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gdXBkYXRlXG59XG5cbmZ1bmN0aW9uIGRyYWluVGVzdGVkICgpIHtcbiAgd2hpbGUgKHRlc3RlZFF1ZXVlLmxlbmd0aCkge1xuICAgIHRlc3RlZFF1ZXVlLnNoaWZ0KCkoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0ZXN0ZWQgKGZuKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgZm4oKTtcbiAgfSBlbHNlIHtcbiAgICB0ZXN0ZWRRdWV1ZS5wdXNoKGZuKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdXBwb3J0ICh2YWx1ZSkge1xuICBpZiAoc3VwcG9ydHMgIT09IHZvaWQgMCkge1xuICAgIHJldHVybjsgLy8gc2FuaXR5XG4gIH1cbiAgc3VwcG9ydHMgPSB2YWx1ZTtcbiAgZHJhaW5UZXN0ZWQoKTtcbn1cblxuZnVuY3Rpb24gZmFpbGVkICgpIHtcbiAgc3VwcG9ydChmYWxzZSk7XG59XG5cbmZhbGxiYWNrKCk7XG50ZXN0KCk7XG5zZXRUaW1lb3V0KGZhaWxlZCwgNjAwKTsgLy8gdGhlIHRlc3QgY2FuIHRha2Ugc29tZXdoZXJlIG5lYXIgMzAwbXMgdG8gY29tcGxldGVcblxubW9kdWxlLmV4cG9ydHMgPSBhcGk7XG5cbmFwaS50ZXN0ZWQgPSB0ZXN0ZWQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmF3ID0ge307XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgZG9uZShudWxsLCByYXdba2V5XSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICByYXdba2V5XSA9IHZhbHVlO1xuICAoZG9uZSB8fCBub29wKShudWxsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG5hbWU6ICdtZW1vcnlTdG9yZScsXG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJlRXNjYXBlZEh0bWwgPSAvJig/OmFtcHxsdHxndHxxdW90fCMzOXwjOTYpOy9nO1xudmFyIGh0bWxVbmVzY2FwZXMgPSB7XG4gICcmYW1wOyc6ICcmJyxcbiAgJyZsdDsnOiAnPCcsXG4gICcmZ3Q7JzogJz4nLFxuICAnJnF1b3Q7JzogJ1wiJyxcbiAgJyYjMzk7JzogJ1xcJycsXG4gICcmIzk2Oyc6ICdgJ1xufTtcblxuZnVuY3Rpb24gdW5lc2NhcGVIdG1sQ2hhciAoYykge1xuICByZXR1cm4gaHRtbFVuZXNjYXBlc1tjXTtcbn1cblxuZnVuY3Rpb24gdW5lc2NhcGUgKGlucHV0KSB7XG4gIHZhciBkYXRhID0gaW5wdXQgPT0gbnVsbCA/ICcnIDogU3RyaW5nKGlucHV0KTtcbiAgaWYgKGRhdGEgJiYgKHJlRXNjYXBlZEh0bWwubGFzdEluZGV4ID0gMCwgcmVFc2NhcGVkSHRtbC50ZXN0KGRhdGEpKSkge1xuICAgIHJldHVybiBkYXRhLnJlcGxhY2UocmVFc2NhcGVkSHRtbCwgdW5lc2NhcGVIdG1sQ2hhcik7XG4gIH1cbiAgcmV0dXJuIGRhdGE7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdW5lc2NhcGU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCd4aHInKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHVybCwgZG9uZSkge1xuICB2YXIgb3B0aW9ucyA9IHtcbiAgICB1cmw6IHVybCxcbiAgICBqc29uOiB0cnVlLFxuICAgIGhlYWRlcnM6IHsgQWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicgfVxuICB9O1xuICB2YXIgcmVxID0geGhyKG9wdGlvbnMsIGhhbmRsZSk7XG5cbiAgcmV0dXJuIHJlcTtcblxuICBmdW5jdGlvbiBoYW5kbGUgKGVyciwgcmVzLCBib2R5KSB7XG4gICAgaWYgKGVyciAmJiAhcmVxLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKSB7XG4gICAgICBkb25lKG5ldyBFcnJvcignYWJvcnRlZCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZShlcnIsIGJvZHkpO1xuICAgIH1cbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zcmMvY29udHJhLmVtaXR0ZXIuanMnKTtcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4oZnVuY3Rpb24gKHJvb3QsIHVuZGVmaW5lZCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHVuZGVmID0gJycgKyB1bmRlZmluZWQ7XG4gIGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4gIGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7IGlmICghZm4pIHsgcmV0dXJuOyB9IHRpY2soZnVuY3Rpb24gcnVuICgpIHsgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pOyB9KTsgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIHRpY2tlclxuICB2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuICBpZiAoc2kpIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIHByb2Nlc3MgIT09IHVuZGVmICYmIHByb2Nlc3MubmV4dFRpY2spIHtcbiAgICB0aWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgfSBlbHNlIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX2VtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldnQgPSB7fTtcbiAgICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gICAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChjID09PSAxKSB7XG4gICAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgICAgZXZ0ID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGN0eCA9IHRoaXM7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciB0eXBlID0gYXJncy5zaGlmdCgpO1xuICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICBpZiAoIWV0KSB7IHJldHVybiB0aGluZzsgfVxuICAgICAgZXZ0W3R5cGVdID0gZXQuZmlsdGVyKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgIHJldHVybiAhbGlzdGVuLl9vbmNlO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICByZXR1cm4gdGhpbmc7XG4gIH1cblxuICAvLyBjcm9zcy1wbGF0Zm9ybSBleHBvcnRcbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09IHVuZGVmICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBfZW1pdHRlcjtcbiAgfSBlbHNlIHtcbiAgICByb290LmNvbnRyYSA9IHJvb3QuY29udHJhIHx8IHt9O1xuICAgIHJvb3QuY29udHJhLmVtaXR0ZXIgPSBfZW1pdHRlcjtcbiAgfVxufSkodGhpcyk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiKSkiLCJcInVzZSBzdHJpY3RcIjtcbi8qXG5Db3B5cmlnaHQgKGMpIDIwMTQgUGV0a2EgQW50b25vdlxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG5hbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiAgSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuVEhFIFNPRlRXQVJFLlxuKi9cbmZ1bmN0aW9uIFVybCgpIHtcbiAgICAvL0ZvciBtb3JlIGVmZmljaWVudCBpbnRlcm5hbCByZXByZXNlbnRhdGlvbiBhbmQgbGF6aW5lc3MuXG4gICAgLy9UaGUgbm9uLXVuZGVyc2NvcmUgdmVyc2lvbnMgb2YgdGhlc2UgcHJvcGVydGllcyBhcmUgYWNjZXNzb3IgZnVuY3Rpb25zXG4gICAgLy9kZWZpbmVkIG9uIHRoZSBwcm90b3R5cGUuXG4gICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgIHRoaXMuX2hyZWYgPSBcIlwiO1xuICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICB0aGlzLl9xdWVyeSA9IG51bGw7XG5cbiAgICB0aGlzLmF1dGggPSBudWxsO1xuICAgIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gICAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgICB0aGlzLmhhc2ggPSBudWxsO1xuICAgIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcblxuICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IGZhbHNlO1xufVxuXG52YXIgcXVlcnlzdHJpbmcgPSByZXF1aXJlKFwicXVlcnlzdHJpbmdcIik7XG5VcmwucHJvdG90eXBlLnBhcnNlID1cbmZ1bmN0aW9uIFVybCRwYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAodHlwZW9mIHN0ciAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUGFyYW1ldGVyICd1cmwnIG11c3QgYmUgYSBzdHJpbmcsIG5vdCBcIiArXG4gICAgICAgICAgICB0eXBlb2Ygc3RyKTtcbiAgICB9XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICB2YXIgZW5kID0gc3RyLmxlbmd0aCAtIDE7XG5cbiAgICAvL1RyaW0gbGVhZGluZyBhbmQgdHJhaWxpbmcgd3NcbiAgICB3aGlsZSAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpIDw9IDB4MjAgLyonICcqLykgc3RhcnQrKztcbiAgICB3aGlsZSAoc3RyLmNoYXJDb2RlQXQoZW5kKSA8PSAweDIwIC8qJyAnKi8pIGVuZC0tO1xuXG4gICAgc3RhcnQgPSB0aGlzLl9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCk7XG5cbiAgICAvL0phdmFzY3JpcHQgZG9lc24ndCBoYXZlIGhvc3RcbiAgICBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgIHN0YXJ0ID0gdGhpcy5fcGFyc2VIb3N0KHN0ciwgc3RhcnQsIGVuZCwgaG9zdERlbm90ZXNTbGFzaCk7XG4gICAgICAgIHZhciBwcm90byA9IHRoaXMuX3Byb3RvY29sO1xuICAgICAgICBpZiAoIXRoaXMuaG9zdG5hbWUgJiZcbiAgICAgICAgICAgICh0aGlzLnNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaFByb3RvY29sc1twcm90b10pKSkge1xuICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPD0gZW5kKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KHN0YXJ0KTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDIzIC8qJyMnKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlSGFzaChzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuX3Byb3RvY29sICE9PSBcImphdmFzY3JpcHRcIikge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7IC8vRm9yIGphdmFzY3JpcHQgdGhlIHBhdGhuYW1lIGlzIGp1c3QgdGhlIHJlc3Qgb2YgaXRcbiAgICAgICAgICAgIHRoaXMucGF0aG5hbWUgPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEgKTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBhdGhuYW1lICYmIHRoaXMuaG9zdG5hbWUgJiZcbiAgICAgICAgdGhpcy5fc2xhc2hQcm90b2NvbHNbdGhpcy5fcHJvdG9jb2xdKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICB9XG5cbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgICAgIGlmIChzZWFyY2ggPT0gbnVsbCkge1xuICAgICAgICAgICAgc2VhcmNoID0gdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guY2hhckNvZGVBdCgwKSA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSBzZWFyY2guc2xpY2UoMSk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNhbGxzIGEgc2V0dGVyIGZ1bmN0aW9uLCB0aGVyZSBpcyBubyAucXVlcnkgZGF0YSBwcm9wZXJ0eVxuICAgICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2Uoc2VhcmNoKTtcbiAgICB9XG59O1xuXG5VcmwucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkcmVzb2x2ZShyZWxhdGl2ZSkge1xuICAgIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QoVXJsLnBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuVXJsLnByb3RvdHlwZS5mb3JtYXQgPSBmdW5jdGlvbiBVcmwkZm9ybWF0KCkge1xuICAgIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8IFwiXCI7XG5cbiAgICBpZiAoYXV0aCkge1xuICAgICAgICBhdXRoID0gZW5jb2RlVVJJQ29tcG9uZW50KGF1dGgpO1xuICAgICAgICBhdXRoID0gYXV0aC5yZXBsYWNlKC8lM0EvaSwgXCI6XCIpO1xuICAgICAgICBhdXRoICs9IFwiQFwiO1xuICAgIH1cblxuICAgIHZhciBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgXCJcIjtcbiAgICB2YXIgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgdmFyIGhhc2ggPSB0aGlzLmhhc2ggfHwgXCJcIjtcbiAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgXCJcIjtcbiAgICB2YXIgcXVlcnkgPSBcIlwiO1xuICAgIHZhciBob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgcG9ydCA9IHRoaXMucG9ydCB8fCBcIlwiO1xuICAgIHZhciBob3N0ID0gZmFsc2U7XG4gICAgdmFyIHNjaGVtZSA9IFwiXCI7XG5cbiAgICAvL0NhY2hlIHRoZSByZXN1bHQgb2YgdGhlIGdldHRlciBmdW5jdGlvblxuICAgIHZhciBxID0gdGhpcy5xdWVyeTtcbiAgICBpZiAocSAmJiB0eXBlb2YgcSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeShxKTtcbiAgICB9XG5cbiAgICBpZiAoIXNlYXJjaCkge1xuICAgICAgICBzZWFyY2ggPSBxdWVyeSA/IFwiP1wiICsgcXVlcnkgOiBcIlwiO1xuICAgIH1cblxuICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5jaGFyQ29kZUF0KHByb3RvY29sLmxlbmd0aCAtIDEpICE9PSAweDNBIC8qJzonKi8pXG4gICAgICAgIHByb3RvY29sICs9IFwiOlwiO1xuXG4gICAgaWYgKHRoaXMuaG9zdCkge1xuICAgICAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgICB9XG4gICAgZWxzZSBpZiAoaG9zdG5hbWUpIHtcbiAgICAgICAgdmFyIGlwNiA9IGhvc3RuYW1lLmluZGV4T2YoXCI6XCIpID4gLTE7XG4gICAgICAgIGlmIChpcDYpIGhvc3RuYW1lID0gXCJbXCIgKyBob3N0bmFtZSArIFwiXVwiO1xuICAgICAgICBob3N0ID0gYXV0aCArIGhvc3RuYW1lICsgKHBvcnQgPyBcIjpcIiArIHBvcnQgOiBcIlwiKTtcbiAgICB9XG5cbiAgICB2YXIgc2xhc2hlcyA9IHRoaXMuc2xhc2hlcyB8fFxuICAgICAgICAoKCFwcm90b2NvbCB8fFxuICAgICAgICBzbGFzaFByb3RvY29sc1twcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKTtcblxuXG4gICAgaWYgKHByb3RvY29sKSBzY2hlbWUgPSBwcm90b2NvbCArIChzbGFzaGVzID8gXCIvL1wiIDogXCJcIik7XG4gICAgZWxzZSBpZiAoc2xhc2hlcykgc2NoZW1lID0gXCIvL1wiO1xuXG4gICAgaWYgKHNsYXNoZXMgJiYgcGF0aG5hbWUgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCgwKSAhPT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgIHBhdGhuYW1lID0gXCIvXCIgKyBwYXRobmFtZTtcbiAgICB9XG4gICAgZWxzZSBpZiAoIXNsYXNoZXMgJiYgcGF0aG5hbWUgPT09IFwiL1wiKSB7XG4gICAgICAgIHBhdGhuYW1lID0gXCJcIjtcbiAgICB9XG4gICAgaWYgKHNlYXJjaCAmJiBzZWFyY2guY2hhckNvZGVBdCgwKSAhPT0gMHgzRiAvKic/JyovKVxuICAgICAgICBzZWFyY2ggPSBcIj9cIiArIHNlYXJjaDtcbiAgICBpZiAoaGFzaCAmJiBoYXNoLmNoYXJDb2RlQXQoMCkgIT09IDB4MjMgLyonIycqLylcbiAgICAgICAgaGFzaCA9IFwiI1wiICsgaGFzaDtcblxuICAgIHBhdGhuYW1lID0gZXNjYXBlUGF0aE5hbWUocGF0aG5hbWUpO1xuICAgIHNlYXJjaCA9IGVzY2FwZVNlYXJjaChzZWFyY2gpO1xuXG4gICAgcmV0dXJuIHNjaGVtZSArIChob3N0ID09PSBmYWxzZSA/IFwiXCIgOiBob3N0KSArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlT2JqZWN0KHJlbGF0aXZlKSB7XG4gICAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gXCJzdHJpbmdcIilcbiAgICAgICAgcmVsYXRpdmUgPSBVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcblxuICAgIHZhciByZXN1bHQgPSB0aGlzLl9jbG9uZSgpO1xuXG4gICAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gICAgLy8gZXZlbiBocmVmPVwiXCIgd2lsbCByZW1vdmUgaXQuXG4gICAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gICAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZVwicyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgICBpZiAoIXJlbGF0aXZlLmhyZWYpIHtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBocmVmcyBsaWtlIC8vZm9vL2JhciBhbHdheXMgY3V0IHRvIHRoZSBwcm90b2NvbC5cbiAgICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIHRydWUpO1xuXG4gICAgICAgIGlmIChzbGFzaFByb3RvY29sc1tyZXN1bHQuX3Byb3RvY29sXSAmJlxuICAgICAgICAgICAgcmVzdWx0Lmhvc3RuYW1lICYmICFyZXN1bHQucGF0aG5hbWUpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKHJlbGF0aXZlLl9wcm90b2NvbCAmJiByZWxhdGl2ZS5fcHJvdG9jb2wgIT09IHJlc3VsdC5fcHJvdG9jb2wpIHtcbiAgICAgICAgLy8gaWYgaXRcInMgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAgICAgLy8gdGhlIHByb3RvY29sIGRvZXMgd2VpcmQgdGhpbmdzXG4gICAgICAgIC8vIGZpcnN0LCBpZiBpdFwicyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAgICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAgICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgICAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgICAgICAvLyBiZWNhdXNlIHRoYXRcInMga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICAgICAgaWYgKCFzbGFzaFByb3RvY29sc1tyZWxhdGl2ZS5fcHJvdG9jb2xdKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5fY29weVByb3BzVG8ocmVzdWx0LCBmYWxzZSk7XG4gICAgICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdC5fcHJvdG9jb2wgPSByZWxhdGl2ZS5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCAmJiByZWxhdGl2ZS5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCBcIlwiKS5zcGxpdChcIi9cIik7XG4gICAgICAgICAgICB3aGlsZSAocmVsUGF0aC5sZW5ndGggJiYgIShyZWxhdGl2ZS5ob3N0ID0gcmVsUGF0aC5zaGlmdCgpKSk7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHJlbGF0aXZlLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGhbMF0gIT09IFwiXCIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbihcIi9cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCBcIlwiO1xuICAgICAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IHJlbGF0aXZlLl9wb3J0O1xuICAgICAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgdmFyIGlzU291cmNlQWJzID1cbiAgICAgICAgKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcbiAgICB2YXIgaXNSZWxBYnMgPSAoXG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IHx8XG4gICAgICAgICAgICAocmVsYXRpdmUucGF0aG5hbWUgJiZcbiAgICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDB4MkYgLyonLycqLylcbiAgICAgICAgKTtcbiAgICB2YXIgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKSk7XG5cbiAgICB2YXIgcmVtb3ZlQWxsRG90cyA9IG11c3RFbmRBYnM7XG5cbiAgICB2YXIgc3JjUGF0aCA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoXCIvXCIpIHx8IFtdO1xuICAgIHZhciByZWxQYXRoID0gcmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoXCIvXCIpIHx8IFtdO1xuICAgIHZhciBwc3ljaG90aWMgPSByZXN1bHQuX3Byb3RvY29sICYmICFzbGFzaFByb3RvY29sc1tyZXN1bHQuX3Byb3RvY29sXTtcblxuICAgIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gICAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAgIC8vIHJlc3VsdC5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gICAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICByZXN1bHQuX3BvcnQgPSAtMTtcbiAgICAgICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICAgICAgICBpZiAoc3JjUGF0aFswXSA9PT0gXCJcIikgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gXCJcIjtcbiAgICAgICAgaWYgKHJlbGF0aXZlLl9wcm90b2NvbCkge1xuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgcmVsYXRpdmUuX3BvcnQgPSAtMTtcbiAgICAgICAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09IFwiXCIpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICAgICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09IFwiXCIgfHwgc3JjUGF0aFswXSA9PT0gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKGlzUmVsQWJzKSB7XG4gICAgICAgIC8vIGl0XCJzIGFic29sdXRlLlxuICAgICAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgP1xuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICAgIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gaXRcInMgcmVsYXRpdmVcbiAgICAgICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgICAgICBzcmNQYXRoLnBvcCgpO1xuICAgICAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgfSBlbHNlIGlmIChyZWxhdGl2ZS5zZWFyY2gpIHtcbiAgICAgICAgLy8ganVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgICAgICAvLyBsaWtlIGhyZWY9XCI/Zm9vXCIuXG4gICAgICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgICAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgICAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgICAgICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwID9cbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdChcIkBcIikgOiBmYWxzZTtcbiAgICAgICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAgICAgLy8gd2VcInZlIGFscmVhZHkgaGFuZGxlZCB0aGUgb3RoZXIgc3R1ZmYgYWJvdmUuXG4gICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gICAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gICAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICAgIHZhciBoYXNUcmFpbGluZ1NsYXNoID0gKFxuICAgICAgICAocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCkgJiYgKGxhc3QgPT09IFwiLlwiIHx8IGxhc3QgPT09IFwiLi5cIikgfHxcbiAgICAgICAgbGFzdCA9PT0gXCJcIik7XG5cbiAgICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gICAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgICB2YXIgdXAgPSAwO1xuICAgIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgICAgIGlmIChsYXN0ID09IFwiLlwiKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgfSBlbHNlIGlmIChsYXN0ID09PSBcIi4uXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgdXArKztcbiAgICAgICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cC0tO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICAgIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgICAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgICAgICAgIHNyY1BhdGgudW5zaGlmdChcIi4uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gXCJcIiAmJlxuICAgICAgICAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiAoc3JjUGF0aC5qb2luKFwiL1wiKS5zdWJzdHIoLTEpICE9PSBcIi9cIikpIHtcbiAgICAgICAgc3JjUGF0aC5wdXNoKFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBpc0Fic29sdXRlID0gc3JjUGF0aFswXSA9PT0gXCJcIiB8fFxuICAgICAgICAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgPT09IDB4MkYgLyonLycqLyk7XG5cbiAgICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBpc0Fic29sdXRlID8gXCJcIiA6XG4gICAgICAgICAgICBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6IFwiXCI7XG4gICAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgLy91cmwucmVzb2x2ZU9iamVjdChcIm1haWx0bzpsb2NhbDFAZG9tYWluMVwiLCBcImxvY2FsMkBkb21haW4yXCIpXG4gICAgICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwID9cbiAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgICAgICBzcmNQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgfVxuXG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5sZW5ndGggPT09IDAgPyBudWxsIDogc3JjUGF0aC5qb2luKFwiL1wiKTtcbiAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGggfHwgcmVzdWx0LmF1dGg7XG4gICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBwdW55Y29kZSA9IHJlcXVpcmUoXCJwdW55Y29kZVwiKTtcblVybC5wcm90b3R5cGUuX2hvc3RJZG5hID0gZnVuY3Rpb24gVXJsJF9ob3N0SWRuYShob3N0bmFtZSkge1xuICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnkgY29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHRoZSBwYXJ0IG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgLy8gaGFzIG5vbiBBU0NJSSBjaGFyYWN0ZXJzLiBJLmUuIGl0IGRvc2VudCBtYXR0ZXIgaWZcbiAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBpbiBBU0NJSS5cbiAgICB2YXIgZG9tYWluQXJyYXkgPSBob3N0bmFtZS5zcGxpdChcIi5cIik7XG4gICAgdmFyIG5ld091dCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZG9tYWluQXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIHMgPSBkb21haW5BcnJheVtpXTtcbiAgICAgICAgbmV3T3V0LnB1c2gocy5tYXRjaCgvW15BLVphLXowLTlfLV0vKSA/XG4gICAgICAgICAgICBcInhuLS1cIiArIHB1bnljb2RlLmVuY29kZShzKSA6IHMpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3T3V0LmpvaW4oXCIuXCIpO1xufTtcblxudmFyIGVzY2FwZVBhdGhOYW1lID0gVXJsLnByb3RvdHlwZS5fZXNjYXBlUGF0aE5hbWUgPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVQYXRoTmFtZShwYXRobmFtZSkge1xuICAgIGlmICghY29udGFpbnNDaGFyYWN0ZXIyKHBhdGhuYW1lLCAweDIzIC8qJyMnKi8sIDB4M0YgLyonPycqLykpIHtcbiAgICAgICAgcmV0dXJuIHBhdGhuYW1lO1xuICAgIH1cbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlUGF0aChwYXRobmFtZSk7XG59O1xuXG52YXIgZXNjYXBlU2VhcmNoID0gVXJsLnByb3RvdHlwZS5fZXNjYXBlU2VhcmNoID1cbmZ1bmN0aW9uIFVybCRfZXNjYXBlU2VhcmNoKHNlYXJjaCkge1xuICAgIGlmICghY29udGFpbnNDaGFyYWN0ZXIyKHNlYXJjaCwgMHgyMyAvKicjJyovLCAtMSkpIHJldHVybiBzZWFyY2g7XG4gICAgLy9Bdm9pZCBjbG9zdXJlIGNyZWF0aW9uIHRvIGtlZXAgdGhpcyBpbmxpbmFibGVcbiAgICByZXR1cm4gX2VzY2FwZVNlYXJjaChzZWFyY2gpO1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQcm90b2NvbCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQcm90b2NvbChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgZG9Mb3dlckNhc2UgPSBmYWxzZTtcbiAgICB2YXIgcHJvdG9jb2xDaGFyYWN0ZXJzID0gdGhpcy5fcHJvdG9jb2xDaGFyYWN0ZXJzO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICB2YXIgcHJvdG9jb2wgPSBzdHIuc2xpY2Uoc3RhcnQsIGkpO1xuICAgICAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBwcm90b2NvbCA9IHByb3RvY29sLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHByb3RvY29sO1xuICAgICAgICAgICAgcmV0dXJuIGkgKyAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHByb3RvY29sQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGlmIChjaCA8IDB4NjEgLyonYScqLylcbiAgICAgICAgICAgICAgICBkb0xvd2VyQ2FzZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgIH1cblxuICAgIH1cbiAgICByZXR1cm4gc3RhcnQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUF1dGggPSBmdW5jdGlvbiBVcmwkX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBlbmQsIGRlY29kZSkge1xuICAgIHZhciBhdXRoID0gc3RyLnNsaWNlKHN0YXJ0LCBlbmQgKyAxKTtcbiAgICBpZiAoZGVjb2RlKSB7XG4gICAgICAgIGF1dGggPSBkZWNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgfVxuICAgIHRoaXMuYXV0aCA9IGF1dGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVBvcnQgPSBmdW5jdGlvbiBVcmwkX3BhcnNlUG9ydChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICAvL0ludGVybmFsIGZvcm1hdCBpcyBpbnRlZ2VyIGZvciBtb3JlIGVmZmljaWVudCBwYXJzaW5nXG4gICAgLy9hbmQgZm9yIGVmZmljaWVudCB0cmltbWluZyBvZiBsZWFkaW5nIHplcm9zXG4gICAgdmFyIHBvcnQgPSAwO1xuICAgIC8vRGlzdGluZ3Vpc2ggYmV0d2VlbiA6MCBhbmQgOiAobm8gcG9ydCBudW1iZXIgYXQgYWxsKVxuICAgIHZhciBoYWRDaGFycyA9IGZhbHNlO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmICgweDMwIC8qJzAnKi8gPD0gY2ggJiYgY2ggPD0gMHgzOSAvKic5JyovKSB7XG4gICAgICAgICAgICBwb3J0ID0gKDEwICogcG9ydCkgKyAoY2ggLSAweDMwIC8qJzAnKi8pO1xuICAgICAgICAgICAgaGFkQ2hhcnMgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgYnJlYWs7XG5cbiAgICB9XG4gICAgaWYgKHBvcnQgPT09IDAgJiYgIWhhZENoYXJzKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIHRoaXMuX3BvcnQgPSBwb3J0O1xuICAgIHJldHVybiBpIC0gc3RhcnQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUhvc3QgPVxuZnVuY3Rpb24gVXJsJF9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICAgIHZhciBob3N0RW5kaW5nQ2hhcmFjdGVycyA9IHRoaXMuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzO1xuICAgIGlmIChzdHIuY2hhckNvZGVBdChzdGFydCkgPT09IDB4MkYgLyonLycqLyAmJlxuICAgICAgICBzdHIuY2hhckNvZGVBdChzdGFydCArIDEpID09PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcblxuICAgICAgICAvL1RoZSBzdHJpbmcgc3RhcnRzIHdpdGggLy9cbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSB7XG4gICAgICAgICAgICAvL1RoZSBzdHJpbmcgaXMganVzdCBcIi8vXCJcbiAgICAgICAgICAgIGlmIChlbmQgPCAyKSByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAvL0lmIHNsYXNoZXMgZG8gbm90IGRlbm90ZSBob3N0IGFuZCB0aGVyZSBpcyBubyBhdXRoLFxuICAgICAgICAgICAgLy90aGVyZSBpcyBubyBob3N0IHdoZW4gdGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICAgICAgdmFyIGhhc0F1dGggPVxuICAgICAgICAgICAgICAgIGNvbnRhaW5zQ2hhcmFjdGVyKHN0ciwgMHg0MCAvKidAJyovLCAyLCBob3N0RW5kaW5nQ2hhcmFjdGVycyk7XG4gICAgICAgICAgICBpZiAoIWhhc0F1dGggJiYgIXNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGVyZSBpcyBhIGhvc3QgdGhhdCBzdGFydHMgYWZ0ZXIgdGhlIC8vXG4gICAgICAgIHN0YXJ0ICs9IDI7XG4gICAgfVxuICAgIC8vSWYgdGhlcmUgaXMgbm8gc2xhc2hlcywgdGhlcmUgaXMgbm8gaG9zdG5hbWUgaWZcbiAgICAvLzEuIHRoZXJlIHdhcyBubyBwcm90b2NvbCBhdCBhbGxcbiAgICBlbHNlIGlmICghdGhpcy5fcHJvdG9jb2wgfHxcbiAgICAgICAgLy8yLiB0aGVyZSB3YXMgYSBwcm90b2NvbCB0aGF0IHJlcXVpcmVzIHNsYXNoZXNcbiAgICAgICAgLy9lLmcuIGluICdodHRwOmFzZCcgJ2FzZCcgaXMgbm90IGEgaG9zdG5hbWVcbiAgICAgICAgc2xhc2hQcm90b2NvbHNbdGhpcy5fcHJvdG9jb2xdXG4gICAgKSB7XG4gICAgICAgIHJldHVybiBzdGFydDtcbiAgICB9XG5cbiAgICB2YXIgZG9Mb3dlckNhc2UgPSBmYWxzZTtcbiAgICB2YXIgaWRuYSA9IGZhbHNlO1xuICAgIHZhciBob3N0TmFtZVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIGhvc3ROYW1lRW5kID0gZW5kO1xuICAgIHZhciBsYXN0Q2ggPSAtMTtcbiAgICB2YXIgcG9ydExlbmd0aCA9IDA7XG4gICAgdmFyIGNoYXJzQWZ0ZXJEb3QgPSAwO1xuICAgIHZhciBhdXRoTmVlZHNEZWNvZGluZyA9IGZhbHNlO1xuXG4gICAgdmFyIGogPSAtMTtcblxuICAgIC8vRmluZCB0aGUgbGFzdCBvY2N1cnJlbmNlIG9mIGFuIEAtc2lnbiB1bnRpbCBob3N0ZW5kaW5nIGNoYXJhY3RlciBpcyBtZXRcbiAgICAvL2Fsc28gbWFyayBpZiBkZWNvZGluZyBpcyBuZWVkZWQgZm9yIHRoZSBhdXRoIHBvcnRpb25cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDQwIC8qJ0AnKi8pIHtcbiAgICAgICAgICAgIGogPSBpO1xuICAgICAgICB9XG4gICAgICAgIC8vVGhpcyBjaGVjayBpcyB2ZXJ5LCB2ZXJ5IGNoZWFwLiBVbm5lZWRlZCBkZWNvZGVVUklDb21wb25lbnQgaXMgdmVyeVxuICAgICAgICAvL3ZlcnkgZXhwZW5zaXZlXG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDI1IC8qJyUnKi8pIHtcbiAgICAgICAgICAgIGF1dGhOZWVkc0RlY29kaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy9ALXNpZ24gd2FzIGZvdW5kIGF0IGluZGV4IGosIGV2ZXJ5dGhpbmcgdG8gdGhlIGxlZnQgZnJvbSBpdFxuICAgIC8vaXMgYXV0aCBwYXJ0XG4gICAgaWYgKGogPiAtMSkge1xuICAgICAgICB0aGlzLl9wYXJzZUF1dGgoc3RyLCBzdGFydCwgaiAtIDEsIGF1dGhOZWVkc0RlY29kaW5nKTtcbiAgICAgICAgLy9ob3N0bmFtZSBzdGFydHMgYWZ0ZXIgdGhlIGxhc3QgQC1zaWduXG4gICAgICAgIHN0YXJ0ID0gaG9zdE5hbWVTdGFydCA9IGogKyAxO1xuICAgIH1cblxuICAgIC8vSG9zdCBuYW1lIGlzIHN0YXJ0aW5nIHdpdGggYSBbXG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHg1QiAvKidbJyovKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBzdGFydCArIDE7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgICAgICAvL0Fzc3VtZSB2YWxpZCBJUDYgaXMgYmV0d2VlbiB0aGUgYnJhY2tldHNcbiAgICAgICAgICAgIGlmIChjaCA9PT0gMHg1RCAvKiddJyovKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0ci5jaGFyQ29kZUF0KGkgKyAxKSA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICAgICAgICAgIHBvcnRMZW5ndGggPSB0aGlzLl9wYXJzZVBvcnQoc3RyLCBpICsgMiwgZW5kKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBob3N0bmFtZSA9IHN0ci5zbGljZShzdGFydCArIDEsIGkpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICAgICAgICAgIHRoaXMuaG9zdCA9IHRoaXMuX3BvcnQgPiAwXG4gICAgICAgICAgICAgICAgICAgID8gXCJbXCIgKyBob3N0bmFtZSArIFwiXTpcIiArIHRoaXMuX3BvcnRcbiAgICAgICAgICAgICAgICAgICAgOiBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgICAgICAgICAgIHJldHVybiBpICsgcG9ydExlbmd0aCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9FbXB0eSBob3N0bmFtZSwgWyBzdGFydHMgYSBwYXRoXG4gICAgICAgIHJldHVybiBzdGFydDtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgaWYgKGNoYXJzQWZ0ZXJEb3QgPiA2Mikge1xuICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAxLCBlbmQpICsgMTtcbiAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA8IDB4NjEgLyonYScqLykge1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDJFIC8qJy4nKi8pIHtcbiAgICAgICAgICAgICAgICAvL05vZGUuanMgaWdub3JlcyB0aGlzIGVycm9yXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICBpZiAobGFzdENoID09PSBET1QgfHwgbGFzdENoID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNoYXJzQWZ0ZXJEb3QgPSAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKDB4NDEgLyonQScqLyA8PSBjaCAmJiBjaCA8PSAweDVBIC8qJ1onKi8pIHtcbiAgICAgICAgICAgICAgICBkb0xvd2VyQ2FzZSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICghKGNoID09PSAweDJEIC8qJy0nKi8gfHwgY2ggPT09IDB4NUYgLyonXycqLyB8fFxuICAgICAgICAgICAgICAgICgweDMwIC8qJzAnKi8gPD0gY2ggJiYgY2ggPD0gMHgzOSAvKic5JyovKSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaG9zdEVuZGluZ0NoYXJhY3RlcnNbY2hdID09PSAwICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX25vUHJlcGVuZFNsYXNoSG9zdEVuZGVyc1tjaF0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA+PSAweDdCIC8qJ3snKi8pIHtcbiAgICAgICAgICAgIGlmIChjaCA8PSAweDdFIC8qJ34nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWRuYSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdENoID0gY2g7XG4gICAgICAgIGNoYXJzQWZ0ZXJEb3QrKztcbiAgICB9XG5cbiAgICAvL05vZGUuanMgaWdub3JlcyB0aGlzIGVycm9yXG4gICAgLypcbiAgICBpZiAobGFzdENoID09PSBET1QpIHtcbiAgICAgICAgaG9zdE5hbWVFbmQtLTtcbiAgICB9XG4gICAgKi9cblxuICAgIGlmIChob3N0TmFtZUVuZCArIDEgIT09IHN0YXJ0ICYmXG4gICAgICAgIGhvc3ROYW1lRW5kIC0gaG9zdE5hbWVTdGFydCA8PSAyNTYpIHtcbiAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKGhvc3ROYW1lU3RhcnQsIGhvc3ROYW1lRW5kICsgMSk7XG4gICAgICAgIGlmIChkb0xvd2VyQ2FzZSkgaG9zdG5hbWUgPSBob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAoaWRuYSkgaG9zdG5hbWUgPSB0aGlzLl9ob3N0SWRuYShob3N0bmFtZSk7XG4gICAgICAgIHRoaXMuaG9zdG5hbWUgPSBob3N0bmFtZTtcbiAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDAgPyBob3N0bmFtZSArIFwiOlwiICsgdGhpcy5fcG9ydCA6IGhvc3RuYW1lO1xuICAgIH1cblxuICAgIHJldHVybiBob3N0TmFtZUVuZCArIDEgKyBwb3J0TGVuZ3RoO1xuXG59O1xuXG5VcmwucHJvdG90eXBlLl9jb3B5UHJvcHNUbyA9IGZ1bmN0aW9uIFVybCRfY29weVByb3BzVG8oaW5wdXQsIG5vUHJvdG9jb2wpIHtcbiAgICBpZiAoIW5vUHJvdG9jb2wpIHtcbiAgICAgICAgaW5wdXQuX3Byb3RvY29sID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgfVxuICAgIGlucHV0Ll9ocmVmID0gdGhpcy5faHJlZjtcbiAgICBpbnB1dC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgaW5wdXQuX3ByZXBlbmRTbGFzaCA9IHRoaXMuX3ByZXBlbmRTbGFzaDtcbiAgICBpbnB1dC5hdXRoID0gdGhpcy5hdXRoO1xuICAgIGlucHV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgaW5wdXQuaG9zdCA9IHRoaXMuaG9zdDtcbiAgICBpbnB1dC5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG4gICAgaW5wdXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICBpbnB1dC5zZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICBpbnB1dC5wYXRobmFtZSA9IHRoaXMucGF0aG5hbWU7XG59O1xuXG5VcmwucHJvdG90eXBlLl9jbG9uZSA9IGZ1bmN0aW9uIFVybCRfY2xvbmUoKSB7XG4gICAgdmFyIHJldCA9IG5ldyBVcmwoKTtcbiAgICByZXQuX3Byb3RvY29sID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgcmV0Ll9ocmVmID0gdGhpcy5faHJlZjtcbiAgICByZXQuX3BvcnQgPSB0aGlzLl9wb3J0O1xuICAgIHJldC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIHJldC5hdXRoID0gdGhpcy5hdXRoO1xuICAgIHJldC5zbGFzaGVzID0gdGhpcy5zbGFzaGVzO1xuICAgIHJldC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIHJldC5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG4gICAgcmV0Lmhhc2ggPSB0aGlzLmhhc2g7XG4gICAgcmV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIHJldC5wYXRobmFtZSA9IHRoaXMucGF0aG5hbWU7XG4gICAgcmV0dXJuIHJldDtcbn07XG5cblVybC5wcm90b3R5cGUuX2dldENvbXBvbmVudEVzY2FwZWQgPVxuZnVuY3Rpb24gVXJsJF9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBjdXIgPSBzdGFydDtcbiAgICB2YXIgaSA9IHN0YXJ0O1xuICAgIHZhciByZXQgPSBcIlwiO1xuICAgIHZhciBhdXRvRXNjYXBlTWFwID0gdGhpcy5fYXV0b0VzY2FwZU1hcDtcbiAgICBmb3IgKDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgICAgdmFyIGVzY2FwZWQgPSBhdXRvRXNjYXBlTWFwW2NoXTtcblxuICAgICAgICBpZiAoZXNjYXBlZCAhPT0gXCJcIikge1xuICAgICAgICAgICAgaWYgKGN1ciA8IGkpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICAgICAgICAgIHJldCArPSBlc2NhcGVkO1xuICAgICAgICAgICAgY3VyID0gaSArIDE7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGN1ciA8IGkgKyAxKSByZXQgKz0gc3RyLnNsaWNlKGN1ciwgaSk7XG4gICAgcmV0dXJuIHJldDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUGF0aCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlUGF0aChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgcGF0aFN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHBhdGhFbmQgPSBlbmQ7XG4gICAgdmFyIGVzY2FwZSA9IGZhbHNlO1xuICAgIHZhciBhdXRvRXNjYXBlQ2hhcmFjdGVycyA9IHRoaXMuX2F1dG9Fc2NhcGVDaGFyYWN0ZXJzO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHBhdGhFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlUXVlcnkoc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWVzY2FwZSAmJiBhdXRvRXNjYXBlQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocGF0aFN0YXJ0ID4gcGF0aEVuZCkge1xuICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgcGF0aDtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHBhdGggPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcGF0aFN0YXJ0LCBwYXRoRW5kKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHBhdGggPSBzdHIuc2xpY2UocGF0aFN0YXJ0LCBwYXRoRW5kICsgMSk7XG4gICAgfVxuICAgIHRoaXMucGF0aG5hbWUgPSB0aGlzLl9wcmVwZW5kU2xhc2ggPyBcIi9cIiArIHBhdGggOiBwYXRoO1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VRdWVyeSA9IGZ1bmN0aW9uIFVybCRfcGFyc2VRdWVyeShzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgcXVlcnlTdGFydCA9IHN0YXJ0O1xuICAgIHZhciBxdWVyeUVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDIzIC8qJyMnKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlSGFzaChzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBxdWVyeUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWVzY2FwZSAmJiBhdXRvRXNjYXBlQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocXVlcnlTdGFydCA+IHF1ZXJ5RW5kKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gXCJcIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBxdWVyeTtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHF1ZXJ5ID0gdGhpcy5fZ2V0Q29tcG9uZW50RXNjYXBlZChzdHIsIHF1ZXJ5U3RhcnQsIHF1ZXJ5RW5kKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0gc3RyLnNsaWNlKHF1ZXJ5U3RhcnQsIHF1ZXJ5RW5kICsgMSk7XG4gICAgfVxuICAgIHRoaXMuc2VhcmNoID0gcXVlcnk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUhhc2ggPSBmdW5jdGlvbiBVcmwkX3BhcnNlSGFzaChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICBpZiAoc3RhcnQgPiBlbmQpIHtcbiAgICAgICAgdGhpcy5oYXNoID0gXCJcIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmhhc2ggPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgc3RhcnQsIGVuZCk7XG59O1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwb3J0XCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fcG9ydCA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gKFwiXCIgKyB0aGlzLl9wb3J0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodiA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLl9wb3J0ID0gLTE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9wb3J0ID0gcGFyc2VJbnQodiwgMTApO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInF1ZXJ5XCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcXVlcnkgPSB0aGlzLl9xdWVyeTtcbiAgICAgICAgaWYgKHF1ZXJ5ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBxdWVyeTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2g7XG5cbiAgICAgICAgaWYgKHNlYXJjaCkge1xuICAgICAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgICAgICBzZWFyY2ggPSBzZWFyY2guc2xpY2UoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2VhcmNoICE9PSBcIlwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcXVlcnkgPSBzZWFyY2g7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlYXJjaDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHRoaXMuX3F1ZXJ5ID0gdjtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicGF0aFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHAgPSB0aGlzLnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgICAgIHZhciBzID0gdGhpcy5zZWFyY2ggfHwgXCJcIjtcbiAgICAgICAgaWYgKHAgfHwgcykge1xuICAgICAgICAgICAgcmV0dXJuIHAgKyBzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAocCA9PSBudWxsICYmIHMpID8gKFwiL1wiICsgcykgOiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbigpIHt9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicHJvdG9jb2xcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBwcm90byA9IHRoaXMuX3Byb3RvY29sO1xuICAgICAgICByZXR1cm4gcHJvdG8gPyBwcm90byArIFwiOlwiIDogcHJvdG87XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB2YXIgZW5kID0gdi5sZW5ndGggLSAxO1xuICAgICAgICAgICAgaWYgKHYuY2hhckNvZGVBdChlbmQpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHYuc2xpY2UoMCwgZW5kKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJocmVmXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgaHJlZiA9IHRoaXMuX2hyZWY7XG4gICAgICAgIGlmICghaHJlZikge1xuICAgICAgICAgICAgaHJlZiA9IHRoaXMuX2hyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBocmVmO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHRoaXMuX2hyZWYgPSB2O1xuICAgIH1cbn0pO1xuXG5VcmwucGFyc2UgPSBmdW5jdGlvbiBVcmwkUGFyc2Uoc3RyLCBwYXJzZVF1ZXJ5U3RyaW5nLCBob3N0RGVub3Rlc1NsYXNoKSB7XG4gICAgaWYgKHN0ciBpbnN0YW5jZW9mIFVybCkgcmV0dXJuIHN0cjtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5wYXJzZShzdHIsICEhcGFyc2VRdWVyeVN0cmluZywgISFob3N0RGVub3Rlc1NsYXNoKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRGb3JtYXQob2JqKSB7XG4gICAgaWYgKHR5cGVvZiBvYmogPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgb2JqID0gVXJsLnBhcnNlKG9iaik7XG4gICAgfVxuICAgIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHtcbiAgICAgICAgcmV0dXJuIFVybC5wcm90b3R5cGUuZm9ybWF0LmNhbGwob2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iai5mb3JtYXQoKTtcbn07XG5cblVybC5yZXNvbHZlID0gZnVuY3Rpb24gVXJsJFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIHJldHVybiBVcmwucGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59O1xuXG5VcmwucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uIFVybCRSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICAgIHJldHVybiBVcmwucGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59O1xuXG5mdW5jdGlvbiBfZXNjYXBlUGF0aChwYXRobmFtZSkge1xuICAgIHJldHVybiBwYXRobmFtZS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBfZXNjYXBlU2VhcmNoKHNlYXJjaCkge1xuICAgIHJldHVybiBzZWFyY2gucmVwbGFjZSgvIy9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KG1hdGNoKTtcbiAgICB9KTtcbn1cblxuLy9TZWFyY2ggYGNoYXIxYCAoaW50ZWdlciBjb2RlIGZvciBhIGNoYXJhY3RlcikgaW4gYHN0cmluZ2Bcbi8vc3RhcnRpbmcgZnJvbSBgZnJvbUluZGV4YCBhbmQgZW5kaW5nIGF0IGBzdHJpbmcubGVuZ3RoIC0gMWBcbi8vb3Igd2hlbiBhIHN0b3AgY2hhcmFjdGVyIGlzIGZvdW5kXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcihzdHJpbmcsIGNoYXIxLCBmcm9tSW5kZXgsIHN0b3BDaGFyYWN0ZXJUYWJsZSkge1xuICAgIHZhciBsZW4gPSBzdHJpbmcubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSBmcm9tSW5kZXg7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHJpbmcuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IGNoYXIxKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdG9wQ2hhcmFjdGVyVGFibGVbY2hdID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vL1NlZSBpZiBgY2hhcjFgIG9yIGBjaGFyMmAgKGludGVnZXIgY29kZXMgZm9yIGNoYXJhY3RlcnMpXG4vL2lzIGNvbnRhaW5lZCBpbiBgc3RyaW5nYFxuZnVuY3Rpb24gY29udGFpbnNDaGFyYWN0ZXIyKHN0cmluZywgY2hhcjEsIGNoYXIyKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHJpbmcuY2hhckNvZGVBdChpKTtcbiAgICAgICAgaWYgKGNoID09PSBjaGFyMSB8fCBjaCA9PT0gY2hhcjIpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vTWFrZXMgYW4gYXJyYXkgb2YgMTI4IHVpbnQ4J3Mgd2hpY2ggcmVwcmVzZW50IGJvb2xlYW4gdmFsdWVzLlxuLy9TcGVjIGlzIGFuIGFycmF5IG9mIGFzY2lpIGNvZGUgcG9pbnRzIG9yIGFzY2lpIGNvZGUgcG9pbnQgcmFuZ2VzXG4vL3JhbmdlcyBhcmUgZXhwcmVzc2VkIGFzIFtzdGFydCwgZW5kXVxuXG4vL0NyZWF0ZSBhIHRhYmxlIHdpdGggdGhlIGNoYXJhY3RlcnMgMHgzMC0weDM5IChkZWNpbWFscyAnMCcgLSAnOScpIGFuZFxuLy8weDdBIChsb3dlcmNhc2VsZXR0ZXIgJ3onKSBhcyBgdHJ1ZWA6XG4vL1xuLy92YXIgYSA9IG1ha2VBc2NpaVRhYmxlKFtbMHgzMCwgMHgzOV0sIDB4N0FdKTtcbi8vYVsweDMwXTsgLy8xXG4vL2FbMHgxNV07IC8vMFxuLy9hWzB4MzVdOyAvLzFcbmZ1bmN0aW9uIG1ha2VBc2NpaVRhYmxlKHNwZWMpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVpbnQ4QXJyYXkoMTI4KTtcbiAgICBzcGVjLmZvckVhY2goZnVuY3Rpb24oaXRlbSl7XG4gICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgcmV0W2l0ZW1dID0gMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBzdGFydCA9IGl0ZW1bMF07XG4gICAgICAgICAgICB2YXIgZW5kID0gaXRlbVsxXTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydDsgaiA8PSBlbmQ7ICsraikge1xuICAgICAgICAgICAgICAgIHJldFtqXSA9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiByZXQ7XG59XG5cblxudmFyIGF1dG9Fc2NhcGUgPSBbXCI8XCIsIFwiPlwiLCBcIlxcXCJcIiwgXCJgXCIsIFwiIFwiLCBcIlxcclwiLCBcIlxcblwiLFxuICAgIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLCBcIl5cIiwgXCJgXCIsIFwiJ1wiXTtcblxudmFyIGF1dG9Fc2NhcGVNYXAgPSBuZXcgQXJyYXkoMTI4KTtcblxuXG5cbmZvciAodmFyIGkgPSAwLCBsZW4gPSBhdXRvRXNjYXBlTWFwLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgYXV0b0VzY2FwZU1hcFtpXSA9IFwiXCI7XG59XG5cbmZvciAodmFyIGkgPSAwLCBsZW4gPSBhdXRvRXNjYXBlLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIGMgPSBhdXRvRXNjYXBlW2ldO1xuICAgIHZhciBlc2MgPSBlbmNvZGVVUklDb21wb25lbnQoYyk7XG4gICAgaWYgKGVzYyA9PT0gYykge1xuICAgICAgICBlc2MgPSBlc2NhcGUoYyk7XG4gICAgfVxuICAgIGF1dG9Fc2NhcGVNYXBbYy5jaGFyQ29kZUF0KDApXSA9IGVzYztcbn1cblxuXG52YXIgc2xhc2hQcm90b2NvbHMgPSBVcmwucHJvdG90eXBlLl9zbGFzaFByb3RvY29scyA9IHtcbiAgICBodHRwOiB0cnVlLFxuICAgIGh0dHBzOiB0cnVlLFxuICAgIGdvcGhlcjogdHJ1ZSxcbiAgICBmaWxlOiB0cnVlLFxuICAgIGZ0cDogdHJ1ZSxcblxuICAgIFwiaHR0cDpcIjogdHJ1ZSxcbiAgICBcImh0dHBzOlwiOiB0cnVlLFxuICAgIFwiZ29waGVyOlwiOiB0cnVlLFxuICAgIFwiZmlsZTpcIjogdHJ1ZSxcbiAgICBcImZ0cDpcIjogdHJ1ZVxufTtcblxuLy9PcHRpbWl6ZSBiYWNrIGZyb20gbm9ybWFsaXplZCBvYmplY3QgY2F1c2VkIGJ5IG5vbi1pZGVudGlmaWVyIGtleXNcbmZ1bmN0aW9uIGYoKXt9XG5mLnByb3RvdHlwZSA9IHNsYXNoUHJvdG9jb2xzO1xuXG5VcmwucHJvdG90eXBlLl9wcm90b2NvbENoYXJhY3RlcnMgPSBtYWtlQXNjaWlUYWJsZShbXG4gICAgWzB4NjEgLyonYScqLywgMHg3QSAvKid6JyovXSxcbiAgICBbMHg0MSAvKidBJyovLCAweDVBIC8qJ1onKi9dLFxuICAgIDB4MkUgLyonLicqLywgMHgyQiAvKicrJyovLCAweDJEIC8qJy0nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9ob3N0RW5kaW5nQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICAweDIzIC8qJyMnKi8sIDB4M0YgLyonPycqLywgMHgyRiAvKicvJyovXG5dKTtcblxuVXJsLnByb3RvdHlwZS5fYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSBtYWtlQXNjaWlUYWJsZShcbiAgICBhdXRvRXNjYXBlLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cbi8vSWYgdGhlc2UgY2hhcmFjdGVycyBlbmQgYSBob3N0IG5hbWUsIHRoZSBwYXRoIHdpbGwgbm90IGJlIHByZXBlbmRlZCBhIC9cblVybC5wcm90b3R5cGUuX25vUHJlcGVuZFNsYXNoSG9zdEVuZGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIFtcbiAgICAgICAgXCI8XCIsIFwiPlwiLCBcIidcIiwgXCJgXCIsIFwiIFwiLCBcIlxcclwiLFxuICAgICAgICBcIlxcblwiLCBcIlxcdFwiLCBcIntcIiwgXCJ9XCIsIFwifFwiLCBcIlxcXFxcIixcbiAgICAgICAgXCJeXCIsIFwiYFwiLCBcIlxcXCJcIiwgXCIlXCIsIFwiO1wiXG4gICAgXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICByZXR1cm4gdi5jaGFyQ29kZUF0KDApO1xuICAgIH0pXG4pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlTWFwID0gYXV0b0VzY2FwZU1hcDtcblxubW9kdWxlLmV4cG9ydHMgPSBVcmw7XG5cblVybC5yZXBsYWNlID0gZnVuY3Rpb24gVXJsJFJlcGxhY2UoKSB7XG4gICAgcmVxdWlyZS5jYWNoZVtcInVybFwiXSA9IHtcbiAgICAgICAgZXhwb3J0czogVXJsXG4gICAgfTtcbn07XG4iLCJ2YXIgbm93ID0gcmVxdWlyZSgncGVyZm9ybWFuY2Utbm93JylcbiAgLCBnbG9iYWwgPSB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IHt9IDogd2luZG93XG4gICwgdmVuZG9ycyA9IFsnbW96JywgJ3dlYmtpdCddXG4gICwgc3VmZml4ID0gJ0FuaW1hdGlvbkZyYW1lJ1xuICAsIHJhZiA9IGdsb2JhbFsncmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgY2FmID0gZ2xvYmFsWydjYW5jZWwnICsgc3VmZml4XSB8fCBnbG9iYWxbJ2NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxuICAsIG5hdGl2ZSA9IHRydWVcblxuZm9yKHZhciBpID0gMDsgaSA8IHZlbmRvcnMubGVuZ3RoICYmICFyYWY7IGkrKykge1xuICByYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgY2FmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsJyArIHN1ZmZpeF1cbiAgICAgIHx8IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxufVxuXG4vLyBTb21lIHZlcnNpb25zIG9mIEZGIGhhdmUgckFGIGJ1dCBub3QgY0FGXG5pZighcmFmIHx8ICFjYWYpIHtcbiAgbmF0aXZlID0gZmFsc2VcblxuICB2YXIgbGFzdCA9IDBcbiAgICAsIGlkID0gMFxuICAgICwgcXVldWUgPSBbXVxuICAgICwgZnJhbWVEdXJhdGlvbiA9IDEwMDAgLyA2MFxuXG4gIHJhZiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgaWYocXVldWUubGVuZ3RoID09PSAwKSB7XG4gICAgICB2YXIgX25vdyA9IG5vdygpXG4gICAgICAgICwgbmV4dCA9IE1hdGgubWF4KDAsIGZyYW1lRHVyYXRpb24gLSAoX25vdyAtIGxhc3QpKVxuICAgICAgbGFzdCA9IG5leHQgKyBfbm93XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY3AgPSBxdWV1ZS5zbGljZSgwKVxuICAgICAgICAvLyBDbGVhciBxdWV1ZSBoZXJlIHRvIHByZXZlbnRcbiAgICAgICAgLy8gY2FsbGJhY2tzIGZyb20gYXBwZW5kaW5nIGxpc3RlbmVyc1xuICAgICAgICAvLyB0byB0aGUgY3VycmVudCBmcmFtZSdzIHF1ZXVlXG4gICAgICAgIHF1ZXVlLmxlbmd0aCA9IDBcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGNwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYoIWNwW2ldLmNhbmNlbGxlZCkge1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICBjcFtpXS5jYWxsYmFjayhsYXN0KVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sIE1hdGgucm91bmQobmV4dCkpXG4gICAgfVxuICAgIHF1ZXVlLnB1c2goe1xuICAgICAgaGFuZGxlOiArK2lkLFxuICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxuICAgICAgY2FuY2VsbGVkOiBmYWxzZVxuICAgIH0pXG4gICAgcmV0dXJuIGlkXG4gIH1cblxuICBjYWYgPSBmdW5jdGlvbihoYW5kbGUpIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmKHF1ZXVlW2ldLmhhbmRsZSA9PT0gaGFuZGxlKSB7XG4gICAgICAgIHF1ZXVlW2ldLmNhbmNlbGxlZCA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihmbikge1xuICAvLyBXcmFwIGluIGEgbmV3IGZ1bmN0aW9uIHRvIHByZXZlbnRcbiAgLy8gYGNhbmNlbGAgcG90ZW50aWFsbHkgYmVpbmcgYXNzaWduZWRcbiAgLy8gdG8gdGhlIG5hdGl2ZSByQUYgZnVuY3Rpb25cbiAgaWYoIW5hdGl2ZSkge1xuICAgIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZuKVxuICB9XG4gIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZ1bmN0aW9uKCkge1xuICAgIHRyeXtcbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICB9XG4gIH0pXG59XG5tb2R1bGUuZXhwb3J0cy5jYW5jZWwgPSBmdW5jdGlvbigpIHtcbiAgY2FmLmFwcGx5KGdsb2JhbCwgYXJndW1lbnRzKVxufVxuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuIWZ1bmN0aW9uKGUpe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgZjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P2Y9d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/Zj1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihmPXNlbGYpLGYucm91dGVzPWUoKX19KGZ1bmN0aW9uKCl7dmFyIGRlZmluZSxtb2R1bGUsZXhwb3J0cztyZXR1cm4gKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoezE6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuXG52YXIgbG9jYWxSb3V0ZXMgPSBbXTtcblxuXG4vKipcbiAqIENvbnZlcnQgcGF0aCB0byByb3V0ZSBvYmplY3RcbiAqXG4gKiBBIHN0cmluZyBvciBSZWdFeHAgc2hvdWxkIGJlIHBhc3NlZCxcbiAqIHdpbGwgcmV0dXJuIHsgcmUsIHNyYywga2V5c30gb2JqXG4gKlxuICogQHBhcmFtICB7U3RyaW5nIC8gUmVnRXhwfSBwYXRoXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxudmFyIFJvdXRlID0gZnVuY3Rpb24ocGF0aCl7XG4gIC8vdXNpbmcgJ25ldycgaXMgb3B0aW9uYWxcblxuICB2YXIgc3JjLCByZSwga2V5cyA9IFtdO1xuXG4gIGlmKHBhdGggaW5zdGFuY2VvZiBSZWdFeHApe1xuICAgIHJlID0gcGF0aDtcbiAgICBzcmMgPSBwYXRoLnRvU3RyaW5nKCk7XG4gIH1lbHNle1xuICAgIHJlID0gcGF0aFRvUmVnRXhwKHBhdGgsIGtleXMpO1xuICAgIHNyYyA9IHBhdGg7XG4gIH1cblxuICByZXR1cm4ge1xuICBcdCByZTogcmUsXG4gIFx0IHNyYzogcGF0aC50b1N0cmluZygpLFxuICBcdCBrZXlzOiBrZXlzXG4gIH1cbn07XG5cbi8qKlxuICogTm9ybWFsaXplIHRoZSBnaXZlbiBwYXRoIHN0cmluZyxcbiAqIHJldHVybmluZyBhIHJlZ3VsYXIgZXhwcmVzc2lvbi5cbiAqXG4gKiBBbiBlbXB0eSBhcnJheSBzaG91bGQgYmUgcGFzc2VkLFxuICogd2hpY2ggd2lsbCBjb250YWluIHRoZSBwbGFjZWhvbGRlclxuICoga2V5IG5hbWVzLiBGb3IgZXhhbXBsZSBcIi91c2VyLzppZFwiIHdpbGxcbiAqIHRoZW4gY29udGFpbiBbXCJpZFwiXS5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IHBhdGhcbiAqIEBwYXJhbSAge0FycmF5fSBrZXlzXG4gKiBAcmV0dXJuIHtSZWdFeHB9XG4gKi9cbnZhciBwYXRoVG9SZWdFeHAgPSBmdW5jdGlvbiAocGF0aCwga2V5cykge1xuXHRwYXRoID0gcGF0aFxuXHRcdC5jb25jYXQoJy8/Jylcblx0XHQucmVwbGFjZSgvXFwvXFwoL2csICcoPzovJylcblx0XHQucmVwbGFjZSgvKFxcLyk/KFxcLik/OihcXHcrKSg/OihcXCguKj9cXCkpKT8oXFw/KT98XFwqL2csIGZ1bmN0aW9uKF8sIHNsYXNoLCBmb3JtYXQsIGtleSwgY2FwdHVyZSwgb3B0aW9uYWwpe1xuXHRcdFx0aWYgKF8gPT09IFwiKlwiKXtcblx0XHRcdFx0a2V5cy5wdXNoKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiBfO1xuXHRcdFx0fVxuXG5cdFx0XHRrZXlzLnB1c2goa2V5KTtcblx0XHRcdHNsYXNoID0gc2xhc2ggfHwgJyc7XG5cdFx0XHRyZXR1cm4gJydcblx0XHRcdFx0KyAob3B0aW9uYWwgPyAnJyA6IHNsYXNoKVxuXHRcdFx0XHQrICcoPzonXG5cdFx0XHRcdCsgKG9wdGlvbmFsID8gc2xhc2ggOiAnJylcblx0XHRcdFx0KyAoZm9ybWF0IHx8ICcnKSArIChjYXB0dXJlIHx8ICcoW14vXSs/KScpICsgJyknXG5cdFx0XHRcdCsgKG9wdGlvbmFsIHx8ICcnKTtcblx0XHR9KVxuXHRcdC5yZXBsYWNlKC8oW1xcLy5dKS9nLCAnXFxcXCQxJylcblx0XHQucmVwbGFjZSgvXFwqL2csICcoLiopJyk7XG5cdHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHBhdGggKyAnJCcsICdpJyk7XG59O1xuXG4vKipcbiAqIEF0dGVtcHQgdG8gbWF0Y2ggdGhlIGdpdmVuIHJlcXVlc3QgdG9cbiAqIG9uZSBvZiB0aGUgcm91dGVzLiBXaGVuIHN1Y2Nlc3NmdWxcbiAqIGEgIHtmbiwgcGFyYW1zLCBzcGxhdHN9IG9iaiBpcyByZXR1cm5lZFxuICpcbiAqIEBwYXJhbSAge0FycmF5fSByb3V0ZXNcbiAqIEBwYXJhbSAge1N0cmluZ30gdXJpXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cbnZhciBtYXRjaCA9IGZ1bmN0aW9uIChyb3V0ZXMsIHVyaSwgc3RhcnRBdCkge1xuXHR2YXIgY2FwdHVyZXMsIGkgPSBzdGFydEF0IHx8IDA7XG5cblx0Zm9yICh2YXIgbGVuID0gcm91dGVzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG5cdFx0dmFyIHJvdXRlID0gcm91dGVzW2ldLFxuXHRcdCAgICByZSA9IHJvdXRlLnJlLFxuXHRcdCAgICBrZXlzID0gcm91dGUua2V5cyxcblx0XHQgICAgc3BsYXRzID0gW10sXG5cdFx0ICAgIHBhcmFtcyA9IHt9O1xuXG5cdFx0aWYgKGNhcHR1cmVzID0gdXJpLm1hdGNoKHJlKSkge1xuXHRcdFx0Zm9yICh2YXIgaiA9IDEsIGxlbiA9IGNhcHR1cmVzLmxlbmd0aDsgaiA8IGxlbjsgKytqKSB7XG5cdFx0XHRcdHZhciBrZXkgPSBrZXlzW2otMV0sXG5cdFx0XHRcdFx0dmFsID0gdHlwZW9mIGNhcHR1cmVzW2pdID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0PyB1bmVzY2FwZShjYXB0dXJlc1tqXSlcblx0XHRcdFx0XHRcdDogY2FwdHVyZXNbal07XG5cdFx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0XHRwYXJhbXNba2V5XSA9IHZhbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzcGxhdHMucHVzaCh2YWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwYXJhbXM6IHBhcmFtcyxcblx0XHRcdFx0c3BsYXRzOiBzcGxhdHMsXG5cdFx0XHRcdHJvdXRlOiByb3V0ZS5zcmMsXG5cdFx0XHRcdG5leHQ6IGkgKyAxXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufTtcblxuLyoqXG4gKiBEZWZhdWx0IFwibm9ybWFsXCIgcm91dGVyIGNvbnN0cnVjdG9yLlxuICogYWNjZXB0cyBwYXRoLCBmbiB0dXBsZXMgdmlhIGFkZFJvdXRlXG4gKiByZXR1cm5zIHtmbiwgcGFyYW1zLCBzcGxhdHMsIHJvdXRlfVxuICogIHZpYSBtYXRjaFxuICpcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG52YXIgUm91dGVyID0gZnVuY3Rpb24oKXtcbiAgLy91c2luZyAnbmV3JyBpcyBvcHRpb25hbFxuICByZXR1cm4ge1xuICAgIHJvdXRlczogW10sXG4gICAgcm91dGVNYXAgOiB7fSxcbiAgICBhZGRSb3V0ZTogZnVuY3Rpb24ocGF0aCwgZm4pe1xuICAgICAgaWYgKCFwYXRoKSB0aHJvdyBuZXcgRXJyb3IoJyByb3V0ZSByZXF1aXJlcyBhIHBhdGgnKTtcbiAgICAgIGlmICghZm4pIHRocm93IG5ldyBFcnJvcignIHJvdXRlICcgKyBwYXRoLnRvU3RyaW5nKCkgKyAnIHJlcXVpcmVzIGEgY2FsbGJhY2snKTtcblxuICAgICAgdmFyIHJvdXRlID0gUm91dGUocGF0aCk7XG4gICAgICByb3V0ZS5mbiA9IGZuO1xuXG4gICAgICB0aGlzLnJvdXRlcy5wdXNoKHJvdXRlKTtcbiAgICAgIHRoaXMucm91dGVNYXBbcGF0aF0gPSBmbjtcbiAgICB9LFxuXG4gICAgbWF0Y2g6IGZ1bmN0aW9uKHBhdGhuYW1lLCBzdGFydEF0KXtcbiAgICAgIHZhciByb3V0ZSA9IG1hdGNoKHRoaXMucm91dGVzLCBwYXRobmFtZSwgc3RhcnRBdCk7XG4gICAgICBpZihyb3V0ZSl7XG4gICAgICAgIHJvdXRlLmZuID0gdGhpcy5yb3V0ZU1hcFtyb3V0ZS5yb3V0ZV07XG4gICAgICAgIHJvdXRlLm5leHQgPSB0aGlzLm1hdGNoLmJpbmQodGhpcywgcGF0aG5hbWUsIHJvdXRlLm5leHQpXG4gICAgICB9XG4gICAgICByZXR1cm4gcm91dGU7XG4gICAgfVxuICB9XG59O1xuXG5Sb3V0ZXIuUm91dGUgPSBSb3V0ZVxuUm91dGVyLnBhdGhUb1JlZ0V4cCA9IHBhdGhUb1JlZ0V4cFxuUm91dGVyLm1hdGNoID0gbWF0Y2hcbi8vIGJhY2sgY29tcGF0XG5Sb3V0ZXIuUm91dGVyID0gUm91dGVyXG5cbm1vZHVsZS5leHBvcnRzID0gUm91dGVyXG5cbn0se31dfSx7fSxbMV0pXG4oMSlcbn0pO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJ2YXIgd2luZG93ID0gcmVxdWlyZShcImdsb2JhbC93aW5kb3dcIilcbnZhciBvbmNlID0gcmVxdWlyZShcIm9uY2VcIilcbnZhciBwYXJzZUhlYWRlcnMgPSByZXF1aXJlKCdwYXJzZS1oZWFkZXJzJylcblxudmFyIG1lc3NhZ2VzID0ge1xuICAgIFwiMFwiOiBcIkludGVybmFsIFhNTEh0dHBSZXF1ZXN0IEVycm9yXCIsXG4gICAgXCI0XCI6IFwiNHh4IENsaWVudCBFcnJvclwiLFxuICAgIFwiNVwiOiBcIjV4eCBTZXJ2ZXIgRXJyb3JcIlxufVxuXG52YXIgWEhSID0gd2luZG93LlhNTEh0dHBSZXF1ZXN0IHx8IG5vb3BcbnZhciBYRFIgPSBcIndpdGhDcmVkZW50aWFsc1wiIGluIChuZXcgWEhSKCkpID8gWEhSIDogd2luZG93LlhEb21haW5SZXF1ZXN0XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlWEhSXG5cbmZ1bmN0aW9uIGNyZWF0ZVhIUihvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvcHRpb25zID0geyB1cmk6IG9wdGlvbnMgfVxuICAgIH1cblxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9XG4gICAgY2FsbGJhY2sgPSBvbmNlKGNhbGxiYWNrKVxuXG4gICAgdmFyIHhociA9IG9wdGlvbnMueGhyIHx8IG51bGxcblxuICAgIGlmICgheGhyKSB7XG4gICAgICAgIGlmIChvcHRpb25zLmNvcnMgfHwgb3B0aW9ucy51c2VYRFIpIHtcbiAgICAgICAgICAgIHhociA9IG5ldyBYRFIoKVxuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHhociA9IG5ldyBYSFIoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHVyaSA9IHhoci51cmwgPSBvcHRpb25zLnVyaSB8fCBvcHRpb25zLnVybFxuICAgIHZhciBtZXRob2QgPSB4aHIubWV0aG9kID0gb3B0aW9ucy5tZXRob2QgfHwgXCJHRVRcIlxuICAgIHZhciBib2R5ID0gb3B0aW9ucy5ib2R5IHx8IG9wdGlvbnMuZGF0YVxuICAgIHZhciBoZWFkZXJzID0geGhyLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge31cbiAgICB2YXIgc3luYyA9ICEhb3B0aW9ucy5zeW5jXG4gICAgdmFyIGlzSnNvbiA9IGZhbHNlXG4gICAgdmFyIGtleVxuICAgIHZhciBsb2FkID0gb3B0aW9ucy5yZXNwb25zZSA/IGxvYWRSZXNwb25zZSA6IGxvYWRYaHJcblxuICAgIGlmIChcImpzb25cIiBpbiBvcHRpb25zKSB7XG4gICAgICAgIGlzSnNvbiA9IHRydWVcbiAgICAgICAgaGVhZGVyc1tcIkFjY2VwdFwiXSA9IFwiYXBwbGljYXRpb24vanNvblwiXG4gICAgICAgIGlmIChtZXRob2QgIT09IFwiR0VUXCIgJiYgbWV0aG9kICE9PSBcIkhFQURcIikge1xuICAgICAgICAgICAgaGVhZGVyc1tcIkNvbnRlbnQtVHlwZVwiXSA9IFwiYXBwbGljYXRpb24vanNvblwiXG4gICAgICAgICAgICBib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5qc29uKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IHJlYWR5c3RhdGVjaGFuZ2VcbiAgICB4aHIub25sb2FkID0gbG9hZFxuICAgIHhoci5vbmVycm9yID0gZXJyb3JcbiAgICAvLyBJRTkgbXVzdCBoYXZlIG9ucHJvZ3Jlc3MgYmUgc2V0IHRvIGEgdW5pcXVlIGZ1bmN0aW9uLlxuICAgIHhoci5vbnByb2dyZXNzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBJRSBtdXN0IGRpZVxuICAgIH1cbiAgICAvLyBoYXRlIElFXG4gICAgeGhyLm9udGltZW91dCA9IG5vb3BcbiAgICB4aHIub3BlbihtZXRob2QsIHVyaSwgIXN5bmMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL2JhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICBpZiAob3B0aW9ucy53aXRoQ3JlZGVudGlhbHMgfHwgKG9wdGlvbnMuY29ycyAmJiBvcHRpb25zLndpdGhDcmVkZW50aWFscyAhPT0gZmFsc2UpKSB7XG4gICAgICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gQ2Fubm90IHNldCB0aW1lb3V0IHdpdGggc3luYyByZXF1ZXN0XG4gICAgaWYgKCFzeW5jKSB7XG4gICAgICAgIHhoci50aW1lb3V0ID0gXCJ0aW1lb3V0XCIgaW4gb3B0aW9ucyA/IG9wdGlvbnMudGltZW91dCA6IDUwMDBcbiAgICB9XG5cbiAgICBpZiAoeGhyLnNldFJlcXVlc3RIZWFkZXIpIHtcbiAgICAgICAgZm9yKGtleSBpbiBoZWFkZXJzKXtcbiAgICAgICAgICAgIGlmKGhlYWRlcnMuaGFzT3duUHJvcGVydHkoa2V5KSl7XG4gICAgICAgICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBoZWFkZXJzW2tleV0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG9wdGlvbnMuaGVhZGVycykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJIZWFkZXJzIGNhbm5vdCBiZSBzZXQgb24gYW4gWERvbWFpblJlcXVlc3Qgb2JqZWN0XCIpXG4gICAgfVxuXG4gICAgaWYgKFwicmVzcG9uc2VUeXBlXCIgaW4gb3B0aW9ucykge1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gb3B0aW9ucy5yZXNwb25zZVR5cGVcbiAgICB9XG4gICAgXG4gICAgaWYgKFwiYmVmb3JlU2VuZFwiIGluIG9wdGlvbnMgJiYgXG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmJlZm9yZVNlbmQgPT09IFwiZnVuY3Rpb25cIlxuICAgICkge1xuICAgICAgICBvcHRpb25zLmJlZm9yZVNlbmQoeGhyKVxuICAgIH1cblxuICAgIHhoci5zZW5kKGJvZHkpXG5cbiAgICByZXR1cm4geGhyXG5cbiAgICBmdW5jdGlvbiByZWFkeXN0YXRlY2hhbmdlKCkge1xuICAgICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICAgIGxvYWQoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0Qm9keSgpIHtcbiAgICAgICAgLy8gQ2hyb21lIHdpdGggcmVxdWVzdFR5cGU9YmxvYiB0aHJvd3MgZXJyb3JzIGFycm91bmQgd2hlbiBldmVuIHRlc3RpbmcgYWNjZXNzIHRvIHJlc3BvbnNlVGV4dFxuICAgICAgICB2YXIgYm9keSA9IG51bGxcblxuICAgICAgICBpZiAoeGhyLnJlc3BvbnNlKSB7XG4gICAgICAgICAgICBib2R5ID0geGhyLnJlc3BvbnNlXG4gICAgICAgIH0gZWxzZSBpZiAoeGhyLnJlc3BvbnNlVHlwZSA9PT0gJ3RleHQnIHx8ICF4aHIucmVzcG9uc2VUeXBlKSB7XG4gICAgICAgICAgICBib2R5ID0geGhyLnJlc3BvbnNlVGV4dCB8fCB4aHIucmVzcG9uc2VYTUxcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0pzb24pIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYm9keSA9IEpTT04ucGFyc2UoYm9keSlcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYm9keVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFN0YXR1c0NvZGUoKSB7XG4gICAgICAgIHJldHVybiB4aHIuc3RhdHVzID09PSAxMjIzID8gMjA0IDogeGhyLnN0YXR1c1xuICAgIH1cblxuICAgIC8vIGlmIHdlJ3JlIGdldHRpbmcgYSBub25lLW9rIHN0YXR1c0NvZGUsIGJ1aWxkICYgcmV0dXJuIGFuIGVycm9yXG4gICAgZnVuY3Rpb24gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpIHtcbiAgICAgICAgdmFyIGVycm9yID0gbnVsbFxuICAgICAgICBpZiAoc3RhdHVzID09PSAwIHx8IChzdGF0dXMgPj0gNDAwICYmIHN0YXR1cyA8IDYwMCkpIHtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlID0gKHR5cGVvZiBib2R5ID09PSBcInN0cmluZ1wiID8gYm9keSA6IGZhbHNlKSB8fFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VzW1N0cmluZyhzdGF0dXMpLmNoYXJBdCgwKV1cbiAgICAgICAgICAgIGVycm9yID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gICAgICAgICAgICBlcnJvci5zdGF0dXNDb2RlID0gc3RhdHVzXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXJyb3JcbiAgICB9XG5cbiAgICAvLyB3aWxsIGxvYWQgdGhlIGRhdGEgJiBwcm9jZXNzIHRoZSByZXNwb25zZSBpbiBhIHNwZWNpYWwgcmVzcG9uc2Ugb2JqZWN0XG4gICAgZnVuY3Rpb24gbG9hZFJlc3BvbnNlKCkge1xuICAgICAgICB2YXIgc3RhdHVzID0gZ2V0U3RhdHVzQ29kZSgpXG4gICAgICAgIHZhciBlcnJvciA9IGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKVxuICAgICAgICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgICAgICAgICBib2R5OiBnZXRCb2R5KCksXG4gICAgICAgICAgICBzdGF0dXNDb2RlOiBzdGF0dXMsXG4gICAgICAgICAgICBzdGF0dXNUZXh0OiB4aHIuc3RhdHVzVGV4dCxcbiAgICAgICAgICAgIHJhdzogeGhyXG4gICAgICAgIH1cbiAgICAgICAgaWYoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycyl7IC8vcmVtZW1iZXIgeGhyIGNhbiBpbiBmYWN0IGJlIFhEUiBmb3IgQ09SUyBpbiBJRVxuICAgICAgICAgICAgcmVzcG9uc2UuaGVhZGVycyA9IHBhcnNlSGVhZGVycyh4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXNwb25zZS5oZWFkZXJzID0ge31cbiAgICAgICAgfVxuXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCByZXNwb25zZSwgcmVzcG9uc2UuYm9keSlcbiAgICB9XG5cbiAgICAvLyB3aWxsIGxvYWQgdGhlIGRhdGEgYW5kIGFkZCBzb21lIHJlc3BvbnNlIHByb3BlcnRpZXMgdG8gdGhlIHNvdXJjZSB4aHJcbiAgICAvLyBhbmQgdGhlbiByZXNwb25kIHdpdGggdGhhdFxuICAgIGZ1bmN0aW9uIGxvYWRYaHIoKSB7XG4gICAgICAgIHZhciBzdGF0dXMgPSBnZXRTdGF0dXNDb2RlKClcbiAgICAgICAgdmFyIGVycm9yID0gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpXG5cbiAgICAgICAgeGhyLnN0YXR1cyA9IHhoci5zdGF0dXNDb2RlID0gc3RhdHVzXG4gICAgICAgIHhoci5ib2R5ID0gZ2V0Qm9keSgpXG4gICAgICAgIHhoci5oZWFkZXJzID0gcGFyc2VIZWFkZXJzKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSlcblxuICAgICAgICBjYWxsYmFjayhlcnJvciwgeGhyLCB4aHIuYm9keSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvcihldnQpIHtcbiAgICAgICAgY2FsbGJhY2soZXZ0LCB4aHIpXG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHdpbmRvdztcbn0gZWxzZSBpZiAodHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsO1xufSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIil7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBzZWxmO1xufSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHt9O1xufVxuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIm1vZHVsZS5leHBvcnRzID0gb25jZVxuXG5vbmNlLnByb3RvID0gb25jZShmdW5jdGlvbiAoKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShGdW5jdGlvbi5wcm90b3R5cGUsICdvbmNlJywge1xuICAgIHZhbHVlOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gb25jZSh0aGlzKVxuICAgIH0sXG4gICAgY29uZmlndXJhYmxlOiB0cnVlXG4gIH0pXG59KVxuXG5mdW5jdGlvbiBvbmNlIChmbikge1xuICB2YXIgY2FsbGVkID0gZmFsc2VcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoY2FsbGVkKSByZXR1cm5cbiAgICBjYWxsZWQgPSB0cnVlXG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgfVxufVxuIiwidmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCdpcy1mdW5jdGlvbicpXG5cbm1vZHVsZS5leHBvcnRzID0gZm9yRWFjaFxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG52YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5XG5cbmZ1bmN0aW9uIGZvckVhY2gobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoIWlzRnVuY3Rpb24oaXRlcmF0b3IpKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2l0ZXJhdG9yIG11c3QgYmUgYSBmdW5jdGlvbicpXG4gICAgfVxuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAzKSB7XG4gICAgICAgIGNvbnRleHQgPSB0aGlzXG4gICAgfVxuICAgIFxuICAgIGlmICh0b1N0cmluZy5jYWxsKGxpc3QpID09PSAnW29iamVjdCBBcnJheV0nKVxuICAgICAgICBmb3JFYWNoQXJyYXkobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG4gICAgZWxzZSBpZiAodHlwZW9mIGxpc3QgPT09ICdzdHJpbmcnKVxuICAgICAgICBmb3JFYWNoU3RyaW5nKGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxuICAgIGVsc2VcbiAgICAgICAgZm9yRWFjaE9iamVjdChsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbn1cblxuZnVuY3Rpb24gZm9yRWFjaEFycmF5KGFycmF5LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBhcnJheS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChhcnJheSwgaSkpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgYXJyYXlbaV0sIGksIGFycmF5KVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoU3RyaW5nKHN0cmluZywgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIC8vIG5vIHN1Y2ggdGhpbmcgYXMgYSBzcGFyc2Ugc3RyaW5nLlxuICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHN0cmluZy5jaGFyQXQoaSksIGksIHN0cmluZylcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2hPYmplY3Qob2JqZWN0LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGsgaW4gb2JqZWN0KSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgaykpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqZWN0W2tdLCBrLCBvYmplY3QpXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGlzRnVuY3Rpb25cblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uIChmbikge1xuICB2YXIgc3RyaW5nID0gdG9TdHJpbmcuY2FsbChmbilcbiAgcmV0dXJuIHN0cmluZyA9PT0gJ1tvYmplY3QgRnVuY3Rpb25dJyB8fFxuICAgICh0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicgJiYgc3RyaW5nICE9PSAnW29iamVjdCBSZWdFeHBdJykgfHxcbiAgICAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgLy8gSUU4IGFuZCBiZWxvd1xuICAgICAoZm4gPT09IHdpbmRvdy5zZXRUaW1lb3V0IHx8XG4gICAgICBmbiA9PT0gd2luZG93LmFsZXJ0IHx8XG4gICAgICBmbiA9PT0gd2luZG93LmNvbmZpcm0gfHxcbiAgICAgIGZuID09PSB3aW5kb3cucHJvbXB0KSlcbn07XG4iLCJcbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHRyaW07XG5cbmZ1bmN0aW9uIHRyaW0oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzKnxcXHMqJC9nLCAnJyk7XG59XG5cbmV4cG9ydHMubGVmdCA9IGZ1bmN0aW9uKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyovLCAnJyk7XG59O1xuXG5leHBvcnRzLnJpZ2h0ID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXHMqJC8sICcnKTtcbn07XG4iLCJ2YXIgdHJpbSA9IHJlcXVpcmUoJ3RyaW0nKVxuICAsIGZvckVhY2ggPSByZXF1aXJlKCdmb3ItZWFjaCcpXG4gICwgaXNBcnJheSA9IGZ1bmN0aW9uKGFyZykge1xuICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhcmcpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIH1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaGVhZGVycykge1xuICBpZiAoIWhlYWRlcnMpXG4gICAgcmV0dXJuIHt9XG5cbiAgdmFyIHJlc3VsdCA9IHt9XG5cbiAgZm9yRWFjaChcbiAgICAgIHRyaW0oaGVhZGVycykuc3BsaXQoJ1xcbicpXG4gICAgLCBmdW5jdGlvbiAocm93KSB7XG4gICAgICAgIHZhciBpbmRleCA9IHJvdy5pbmRleE9mKCc6JylcbiAgICAgICAgICAsIGtleSA9IHRyaW0ocm93LnNsaWNlKDAsIGluZGV4KSkudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICwgdmFsdWUgPSB0cmltKHJvdy5zbGljZShpbmRleCArIDEpKVxuXG4gICAgICAgIGlmICh0eXBlb2YocmVzdWx0W2tleV0pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gdmFsdWVcbiAgICAgICAgfSBlbHNlIGlmIChpc0FycmF5KHJlc3VsdFtrZXldKSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldLnB1c2godmFsdWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSBbIHJlc3VsdFtrZXldLCB2YWx1ZSBdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgKVxuXG4gIHJldHVybiByZXN1bHRcbn0iLCJtb2R1bGUuZXhwb3J0cz1cIjIuOC42XCIiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciB0ID0gcmVxdWlyZSgnLi92ZXJzaW9uLmpzb24nKTtcblxuZnVuY3Rpb24gZ2V0ICh2KSB7XG4gIHJldHVybiAndCcgKyB0ICsgJzt2JyArIHY7XG59XG5cbmZ1bmN0aW9uIG1hdGNoICh2LCBleHBlY3RlZCkge1xuICByZXR1cm4gdiA9PT0gZXhwZWN0ZWQ7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZSAodiwgZXhwZWN0ZWQpIHtcbiAgdmFyIG1pc21hdGNoID0gIW1hdGNoKHYsIGV4cGVjdGVkKTtcbiAgaWYgKG1pc21hdGNoKSB7XG4gICAgZ2xvYmFsLmxvY2F0aW9uLnJlbG9hZCgpO1xuICB9XG4gIHJldHVybiBtaXNtYXRjaDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldDogZ2V0LFxuICBtYXRjaDogbWF0Y2gsXG4gIGVuc3VyZTogZW5zdXJlXG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSJdfQ==
