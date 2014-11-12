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
},{"jadum/runtime":17}],7:[function(require,module,exports){
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
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n<p>Taunus exposes <em>three different public APIs</em>, and there&#39;s also <strong>plugins to integrate Taunus and an HTTP server</strong>. This document covers all three APIs extensively. If you&#39;re concerned about the inner workings of Taunus, please refer to the <a href=\"/getting-started\">Getting Started</a> guide. This document aims to only cover how the public interface affects application state, but <strong>doesn&#39;t delve into implementation details</strong>.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li>A <a href=\"#server-side-api\">server-side API</a> that deals with server-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Its <a href=\"#the-options-object\"><code>options</code></a> argument<ul>\n<li><a href=\"#-options-layout-\"><code>layout</code></a></li>\n<li><a href=\"#-options-routes-\"><code>routes</code></a></li>\n<li><a href=\"#-options-getdefaultviewmodel-\"><code>getDefaultViewModel</code></a></li>\n<li><a href=\"#-options-plaintext-\"><code>plaintext</code></a></li>\n<li><a href=\"#-options-resolvers-\"><code>resolvers</code></a></li>\n</ul>\n</li>\n<li>Its <a href=\"#-addroute-definition-\"><code>addRoute</code></a> argument</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render</code></a> method</li>\n<li>The <a href=\"#-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel</code></a> method</li>\n</ul>\n</li>\n<li>A <a href=\"#http-framework-plugins\">suite of plugins</a> can integrate Taunus and an HTTP server<ul>\n<li>Using <a href=\"#using-taunus-express-\"><code>taunus-express</code></a> for <a href=\"http://expressjs.com\">Express</a></li>\n<li>Using <a href=\"#using-taunus-hapi-\"><code>taunus-hapi</code></a> for <a href=\"http://hapijs.com\">Hapi</a></li>\n</ul>\n</li>\n<li>A <a href=\"#command-line-interface\">CLI that produces a wiring module</a> for the client-side<ul>\n<li>The <a href=\"#-output-\"><code>--output</code></a> flag</li>\n<li>The <a href=\"#-watch-\"><code>--watch</code></a> flag</li>\n<li>The <a href=\"#-transform-module-\"><code>--transform &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-standalone-\"><code>--standalone</code></a> flag</li>\n</ul>\n</li>\n<li>A <a href=\"#client-side-api\">client-side API</a> that deals with client-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> method</li>\n<li>The <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a> method</li>\n<li>The <a href=\"#-taunus-once-type-fn-\"><code>taunus.once</code></a> method</li>\n<li>The <a href=\"#-taunus-off-type-fn-\"><code>taunus.off</code></a> method</li>\n<li>The <a href=\"#-taunus-intercept-action-fn-\"><code>taunus.intercept</code></a> method</li>\n<li>The <a href=\"#-taunus-partial-container-action-model-route-\"><code>taunus.partial</code></a> method</li>\n<li>The <a href=\"#-taunus-navigate-url-\"><code>taunus.navigate</code></a> method</li>\n<li>The <a href=\"#-taunus-route-url-\"><code>taunus.state</code></a> property</li>\n<li>The <a href=\"#-taunus-state-\"><code>taunus.route</code></a> method</li>\n</ul>\n</li>\n<li>The <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a> manifest</li>\n</ul>\n<h1 id=\"server-side-api\">Server-side API</h1>\n<p>The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, <em>including client-side rendering</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-addroute-options-\"><code>taunus.mount(addRoute, options?)</code></h2>\n<p>Mounts Taunus on top of a server-side router, by registering each route in <code>options.routes</code> with the <code>addRoute</code> method.</p>\n<blockquote>\n<p>Note that most of the time, <strong>this method shouldn&#39;t be invoked directly</strong>, but rather through one of the <a href=\"#http-framework-plugins\">HTTP framework plugins</a> presented below.</p>\n</blockquote>\n<p>Here&#39;s an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the <code>route</code> and <code>action</code> properties.</p>\n<pre><code class=\"lang-js\">taunus.mount(addRoute, {\n  routes: [{ route: &#39;/&#39;, action: &#39;home/index&#39; }]\n});\n\nfunction addRoute (definition) {\n  app.get(definition.route, definition.action);\n}\n</code></pre>\n<p>Let&#39;s go over the options you can pass to <code>taunus.mount</code> first.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"the-options-object\">The <code>options?</code> object</h4>\n<p>There&#39;s a few options that can be passed to the server-side mountpoint. You&#39;re probably going to be passing these to your <a href=\"#http-framework-plugins\">HTTP framework plugin</a>, rather than using <code>taunus.mount</code> directly.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-layout-\"><code>options.layout?</code></h6>\n<p>The <code>layout</code> property is expected to have the <code>function(data)</code> signature. It&#39;ll be invoked whenever a full HTML document needs to be rendered, and a <code>data</code> object will be passed to it. That object will contain everything you&#39;ve set as the view model, plus a <code>partial</code> property containing the raw HTML of the rendered partial view. Your <code>layout</code> method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out <a href=\"https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\">the <code>layout.jade</code> used in Pony Foo</a> as an example.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-routes-\"><code>options.routes</code></h6>\n<p>The other big option is <code>routes</code>, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.</p>\n<p>Here&#39;s an example route that uses the <a href=\"http://expressjs.com\">Express</a> routing scheme.</p>\n<pre><code class=\"lang-js\">{\n  route: &#39;/articles/:slug&#39;,\n  action: &#39;articles/article&#39;,\n  ignore: false,\n  cache: &lt;inherit&gt;\n}\n</code></pre>\n<ul>\n<li><code>route</code> is a route in the format your HTTP framework of choice understands</li>\n<li><code>action</code> is the name of your controller action. It&#39;ll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller</li>\n<li><code>cache</code> can be used to determine the client-side caching behavior in this application path, and it&#39;ll default to inheriting from the options passed to <code>taunus.mount</code> <em>on the client-side</em></li>\n<li><code>ignore</code> is used in those cases where you want a URL to be ignored by the client-side router even if there&#39;s a catch-all route that would match that URL</li>\n</ul>\n<p>As an example of the <code>ignore</code> use case, consider the routing table shown below. The client-side router doesn&#39;t know <em>(and can&#39;t know unless you point it out)</em> what routes are server-side only, and it&#39;s up to you to point those out.</p>\n<pre><code class=\"lang-js\">[\n  { route: &#39;/&#39;, action: &#39;/home/index&#39; },\n  { route: &#39;/feed&#39;, ignore: true },\n  { route: &#39;/*&#39;, action: &#39;error/not-found&#39; }\n]\n</code></pre>\n<p>This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The <code>ignore</code> property is effectively telling the client-side <em>&quot;don&#39;t hijack links containing this URL&quot;</em>.</p>\n<p>Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don&#39;t need to be <code>ignore</code>d.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getdefaultviewmodel-\"><code>options.getDefaultViewModel?</code></h6>\n<p>The <code>getDefaultViewModel(done)</code> property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you&#39;re done creating a view model, you can invoke <code>done(null, model)</code>. If an error occurs while building the view model, you should call <code>done(err)</code> instead.</p>\n<p>Taunus will throw an error if <code>done</code> is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases <a href=\"#taunus-rebuilddefaultviewmodel\">the defaults can be rebuilt</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-plaintext-\"><code>options.plaintext?</code></h6>\n<p>The <code>plaintext</code> options object is passed directly to <a href=\"https://github.com/bevacqua/hget\">hget</a>, and it&#39;s used to <a href=\"https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\">tweak the plaintext version</a> of your site.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-resolvers-\"><code>options.resolvers?</code></h6>\n<p>Resolvers are used to determine the location of some of the different pieces of your application. Typically you won&#39;t have to touch these in the slightest.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getServerController(action)</code></td>\n<td>Return path to server-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p>The <code>addRoute</code> method passed to <code>taunus.mount</code> on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-addroute-definition-\"><code>addRoute(definition)</code></h4>\n<p>The <code>addRoute(definition)</code> method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework&#39;s router.</p>\n<ul>\n<li><code>route</code> is the route that you set as <code>definition.route</code></li>\n<li><code>action</code> is the action as passed to the route definition</li>\n<li><code>actionFn</code> will be the controller for this action method</li>\n<li><code>middleware</code> will be an array of methods to be executed before <code>actionFn</code></li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render(action, viewModel, req, res, next)</code></h2>\n<p>This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won&#39;t go very deep into it.</p>\n<p>The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The <code>action</code> property determines the default view that will be rendered. The <code>viewModel</code> will be extended by <a href=\"#-options-getdefaultviewmodel-\">the default view model</a>, and it may also override the default <code>action</code> by setting <code>viewModel.model.action</code>.</p>\n<p>The <code>req</code>, <code>res</code>, and <code>next</code> arguments are expected to be the Express routing arguments, but they can also be mocked <em>(which is in fact what the Hapi plugin does)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel(done?)</code></h2>\n<p>Once Taunus has been mounted, calling this method will rebuild the view model defaults using the <code>getDefaultViewModel</code> that was passed to <code>taunus.mount</code> in the options. An optional <code>done</code> callback will be invoked when the model is rebuilt.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"http-framework-plugins\">HTTP Framework Plugins</h1>\n<p>There&#39;s currently two different HTTP frameworks <em>(<a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a>)</em> that you can readily use with Taunus without having to deal with any of the route plumbing yourself.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-express-\">Using <code>taunus-express</code></h2>\n<p>The <code>taunus-express</code> plugin is probably the easiest to use, as Taunus was originally developed with just <a href=\"http://expressjs.com\">Express</a> in mind. In addition to the options already outlined for <a href=\"#-taunus-mount-addroute-options-\">taunus.mount</a>, you can add middleware for any route individually.</p>\n<ul>\n<li><code>middleware</code> are any methods you want Taunus to execute as middleware in Express applications</li>\n</ul>\n<p>To get <code>taunus-express</code> going you can use the following piece of code, provided that you come up with an <code>options</code> object.</p>\n<pre><code class=\"lang-js\">var taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  // ...\n};\n\ntaunusExpress(taunus, app, options);\n</code></pre>\n<p>The <code>taunusExpress</code> method will merely set up Taunus and add the relevant routes to your Express application by calling <code>app.get</code> a bunch of times. You can <a href=\"https://github.com/taunus/taunus-express\">find taunus-express on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-hapi-\">Using <code>taunus-hapi</code></h2>\n<p>The <code>taunus-hapi</code> plugin is a bit more involved, and you&#39;ll have to create a Pack in order to use it. In addition to <a href=\"#-taunus-mount-addroute-options-\">the options we&#39;ve already covered</a>, you can add <code>config</code> on any route.</p>\n<ul>\n<li><code>config</code> is passed directly into the route registered with Hapi, giving you the most flexibility</li>\n</ul>\n<p>To get <code>taunus-hapi</code> going you can use the following piece of code, and you can bring your own <code>options</code> object.</p>\n<pre><code class=\"lang-js\">var Hapi = require(&#39;hapi&#39;);\nvar taunus = require(&#39;taunus&#39;);\nvar taunusHapi = require(&#39;taunus-hapi&#39;)(taunus);\nvar pack = new Hapi.Pack();\n\npack.register({\n  plugin: taunusHapi,\n  options: {\n    // ...\n  }\n});\n</code></pre>\n<p>The <code>taunusHapi</code> plugin will mount Taunus and register all of the necessary routes. You can <a href=\"https://github.com/taunus/taunus-hapi\">find taunus-hapi on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"command-line-interface\">Command-Line Interface</h1>\n<p>Once you&#39;ve set up the server-side to render your views using Taunus, it&#39;s only logical that you&#39;ll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.</p>\n<p>The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.</p>\n<p>Install it globally for development, but remember to use local copies for production-grade uses.</p>\n<pre><code class=\"lang-shell\">npm install -g taunus\n</code></pre>\n<p>When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.</p>\n<pre><code class=\"lang-shell\">taunus\n</code></pre>\n<p>By default, the output will be printed to the standard output, making for a fast debugging experience. Here&#39;s the output if you just had a single <code>home/index</code> route, and the matching view and client-side controller existed.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n  &#39;home/index&#39;: require(&#39;../client/js/controllers/home/index.js&#39;)\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>You can use a few options to alter the outcome of invoking <code>taunus</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-output-\"><code>--output</code></h2>\n<p><sub>the <code>-o</code> alias is available</sub></p>\n<p>Output is written to a file instead of to standard output. The file path used will be the <code>client_wiring</code> option in <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a>, which defaults to <code>&#39;.bin/wiring.js&#39;</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-watch-\"><code>--watch</code></h2>\n<p><sub>the <code>-w</code> alias is available</sub></p>\n<p>Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether <code>--output</code> was used.</p>\n<p>The program won&#39;t exit.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-transform-module-\"><code>--transform &lt;module&gt;</code></h2>\n<p><sub>the <code>-t</code> alias is available</sub></p>\n<p>This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the <a href=\"https://github.com/taunus/hapiify\"><code>hapiify</code></a> module.</p>\n<pre><code class=\"lang-shell\">npm install hapiify\ntaunus -t hapiify\n</code></pre>\n<p>Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></h2>\n<p><sub>the <code>-r</code> alias is available</sub></p>\n<p>Similarly to the <a href=\"#-options-resolvers-\"><code>resolvers</code></a> option that you can pass to <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a>, these resolvers can change the way in which file paths are resolved.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getClientController(action)</code></td>\n<td>Return path to client-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-standalone-\"><code>--standalone</code></h2>\n<p><sub>the <code>-s</code> alias is available</sub></p>\n<p>Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus <a href=\"https://github.com/umdjs/umd\">as a UMD module</a>.</p>\n<p>This would allow you to use Taunus on the client-side even if you don&#39;t want to use <a href=\"http://browserify.org\">Browserify</a> directly.</p>\n<p>Feedback and suggestions about this flag, <em>and possible alternatives that would make Taunus easier to use</em>, are welcome.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-api\">Client-side API</h1>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-container-wiring-options-\"><code>taunus.mount(container, wiring, options)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-on-type-fn-\"><code>taunus.on(type, fn)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-once-type-fn-\"><code>taunus.once(type, fn)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-off-type-fn-\"><code>taunus.off(type, fn)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-intercept-action-fn-\"><code>taunus.intercept(action, fn)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-partial-container-action-model-route-\"><code>taunus.partial(container, action, model, route)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-navigate-url-\"><code>taunus.navigate(url)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-route-url-\"><code>taunus.route(url)</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-state-\"><code>taunus.state</code></h2>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-taunusrc-manifest\">The <code>.taunusrc</code> manifest</h1>\n<p>If you want to use values other than the conventional defaults shown in the table below, then you should create a <code>.taunusrc</code> file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your <code>package.json</code>, under the <code>taunus</code> property.</p>\n<pre><code class=\"lang-json\">{\n  &quot;views&quot;: &quot;.bin/views&quot;,\n  &quot;server_routes&quot;: &quot;controllers/routes.js&quot;,\n  &quot;server_controllers&quot;: &quot;controllers&quot;,\n  &quot;client_controllers&quot;: &quot;client/js/controllers&quot;,\n  &quot;client_wiring&quot;: &quot;.bin/wiring.js&quot;\n}\n</code></pre>\n<ul>\n<li>The <code>views</code> directory is where your views <em>(already compiled into JavaScript)</em> are placed. These views are used directly on both the server-side and the client-side</li>\n<li>The <code>server_routes</code> file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module</li>\n<li>The <code>server_controllers</code> directory is the root directory where your server-side controllers live. It&#39;s used when setting up the server-side router</li>\n<li>The <code>client_controllers</code> directory is where your client-side controller modules live. The CLI will <code>require</code> these controllers in its resulting wiring module</li>\n<li>The <code>client_wiring</code> file is where your wiring module will be placed by the CLI. You&#39;ll then have to <code>require</code> it in your application when booting up Taunus</li>\n</ul>\n<p>Here is where things get <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">a little conventional</a>. Views, and both server-side and client-side controllers are expected to be organized by following the <code>{root}/{controller}/{action}</code> pattern, but you could change that using <code>resolvers</code> when invoking the CLI and using the server-side API.</p>\n<p>Views and controllers are also expected to be CommonJS modules that export a single method.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    Taunus exposes _three different public APIs_, and there's also **plugins to integrate Taunus and an HTTP server**. This document covers all three APIs extensively. If you're concerned about the inner workings of Taunus, please refer to the [Getting Started][1] guide. This document aims to only cover how the public interface affects application state, but **doesn't delve into implementation details**.\n\n    # Table of Contents\n\n    - A [server-side API](#server-side-api) that deals with server-side rendering\n      - The [`taunus.mount`](#-taunus-mount-addroute-options-) method\n        - Its [`options`](#the-options-object) argument\n          - [`layout`](#-options-layout-)\n          - [`routes`](#-options-routes-)\n          - [`getDefaultViewModel`](#-options-getdefaultviewmodel-)\n          - [`plaintext`](#-options-plaintext-)\n          - [`resolvers`](#-options-resolvers-)\n        - Its [`addRoute`](#-addroute-definition-) argument\n      - The [`taunus.render`](#-taunus-render-action-viewmodel-req-res-next-) method\n      - The [`taunus.rebuildDefaultViewModel`](#-taunus-rebuilddefaultviewmodel-done-) method\n    - A [suite of plugins](#http-framework-plugins) can integrate Taunus and an HTTP server\n      - Using [`taunus-express`](#using-taunus-express-) for [Express][2]\n      - Using [`taunus-hapi`](#using-taunus-hapi-) for [Hapi][3]\n    - A [CLI that produces a wiring module](#command-line-interface) for the client-side\n      - The [`--output`](#-output-) flag\n      - The [`--watch`](#-watch-) flag\n      - The [`--transform <module>`](#-transform-module-) flag\n      - The [`--resolvers <module>`](#-resolvers-module-) flag\n      - The [`--standalone`](#-standalone-) flag\n    - A [client-side API](#client-side-api) that deals with client-side rendering\n      - The [`taunus.mount`](#-taunus-mount-container-wiring-options-) method\n      - The [`taunus.on`](#-taunus-on-type-fn-) method\n      - The [`taunus.once`](#-taunus-once-type-fn-) method\n      - The [`taunus.off`](#-taunus-off-type-fn-) method\n      - The [`taunus.intercept`](#-taunus-intercept-action-fn-) method\n      - The [`taunus.partial`](#-taunus-partial-container-action-model-route-) method\n      - The [`taunus.navigate`](#-taunus-navigate-url-) method\n      - The [`taunus.state`](#-taunus-route-url-) property\n      - The [`taunus.route`](#-taunus-state-) method\n    - The [`.taunusrc`](#the-taunusrc-manifest) manifest\n\n    # Server-side API\n\n    The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, _including client-side rendering_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(addRoute, options?)`\n\n    Mounts Taunus on top of a server-side router, by registering each route in `options.routes` with the `addRoute` method.\n\n    > Note that most of the time, **this method shouldn't be invoked directly**, but rather through one of the [HTTP framework plugins](#http-framework-plugins) presented below.\n\n    Here's an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the `route` and `action` properties.\n\n    ```js\n    taunus.mount(addRoute, {\n      routes: [{ route: '/', action: 'home/index' }]\n    });\n\n    function addRoute (definition) {\n      app.get(definition.route, definition.action);\n    }\n    ```\n\n    Let's go over the options you can pass to `taunus.mount` first.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### The `options?` object\n\n    There's a few options that can be passed to the server-side mountpoint. You're probably going to be passing these to your [HTTP framework plugin](#http-framework-plugins), rather than using `taunus.mount` directly.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.layout?`\n\n    The `layout` property is expected to have the `function(data)` signature. It'll be invoked whenever a full HTML document needs to be rendered, and a `data` object will be passed to it. That object will contain everything you've set as the view model, plus a `partial` property containing the raw HTML of the rendered partial view. Your `layout` method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out [the `layout.jade` used in Pony Foo][4] as an example.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.routes`\n\n    The other big option is `routes`, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.\n\n    Here's an example route that uses the [Express][2] routing scheme.\n\n    ```js\n    {\n      route: '/articles/:slug',\n      action: 'articles/article',\n      ignore: false,\n      cache: <inherit>\n    }\n    ```\n\n    - `route` is a route in the format your HTTP framework of choice understands\n    - `action` is the name of your controller action. It'll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller\n    - `cache` can be used to determine the client-side caching behavior in this application path, and it'll default to inheriting from the options passed to `taunus.mount` _on the client-side_\n    - `ignore` is used in those cases where you want a URL to be ignored by the client-side router even if there's a catch-all route that would match that URL\n\n    As an example of the `ignore` use case, consider the routing table shown below. The client-side router doesn't know _(and can't know unless you point it out)_ what routes are server-side only, and it's up to you to point those out.\n\n    ```js\n    [\n      { route: '/', action: '/home/index' },\n      { route: '/feed', ignore: true },\n      { route: '/*', action: 'error/not-found' }\n    ]\n    ```\n\n    This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The `ignore` property is effectively telling the client-side _\"don't hijack links containing this URL\"_.\n\n    Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don't need to be `ignore`d.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getDefaultViewModel?`\n\n    The `getDefaultViewModel(done)` property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you're done creating a view model, you can invoke `done(null, model)`. If an error occurs while building the view model, you should call `done(err)` instead.\n\n    Taunus will throw an error if `done` is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases [the defaults can be rebuilt](#taunus-rebuilddefaultviewmodel).\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.plaintext?`\n\n    The `plaintext` options object is passed directly to [hget][5], and it's used to [tweak the plaintext version][6] of your site.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.resolvers?`\n\n    Resolvers are used to determine the location of some of the different pieces of your application. Typically you won't have to touch these in the slightest.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getServerController(action)` | Return path to server-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    The `addRoute` method passed to `taunus.mount` on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `addRoute(definition)`\n\n    The `addRoute(definition)` method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework's router.\n\n    - `route` is the route that you set as `definition.route`\n    - `action` is the action as passed to the route definition\n    - `actionFn` will be the controller for this action method\n    - `middleware` will be an array of methods to be executed before `actionFn`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.render(action, viewModel, req, res, next)`\n\n    This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won't go very deep into it.\n\n    The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The `action` property determines the default view that will be rendered. The `viewModel` will be extended by [the default view model](#-options-getdefaultviewmodel-), and it may also override the default `action` by setting `viewModel.model.action`.\n\n    The `req`, `res`, and `next` arguments are expected to be the Express routing arguments, but they can also be mocked _(which is in fact what the Hapi plugin does)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.rebuildDefaultViewModel(done?)`\n\n    Once Taunus has been mounted, calling this method will rebuild the view model defaults using the `getDefaultViewModel` that was passed to `taunus.mount` in the options. An optional `done` callback will be invoked when the model is rebuilt.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # HTTP Framework Plugins\n\n    There's currently two different HTTP frameworks _([Express][2] and [Hapi][3])_ that you can readily use with Taunus without having to deal with any of the route plumbing yourself.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-express`\n\n    The `taunus-express` plugin is probably the easiest to use, as Taunus was originally developed with just [Express][2] in mind. In addition to the options already outlined for [taunus.mount](#-taunus-mount-addroute-options-), you can add middleware for any route individually.\n\n    - `middleware` are any methods you want Taunus to execute as middleware in Express applications\n\n    To get `taunus-express` going you can use the following piece of code, provided that you come up with an `options` object.\n\n    ```js\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      // ...\n    };\n\n    taunusExpress(taunus, app, options);\n    ```\n\n    The `taunusExpress` method will merely set up Taunus and add the relevant routes to your Express application by calling `app.get` a bunch of times. You can [find taunus-express on GitHub][7].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-hapi`\n\n    The `taunus-hapi` plugin is a bit more involved, and you'll have to create a Pack in order to use it. In addition to [the options we've already covered](#-taunus-mount-addroute-options-), you can add `config` on any route.\n\n    - `config` is passed directly into the route registered with Hapi, giving you the most flexibility\n\n    To get `taunus-hapi` going you can use the following piece of code, and you can bring your own `options` object.\n\n    ```js\n    var Hapi = require('hapi');\n    var taunus = require('taunus');\n    var taunusHapi = require('taunus-hapi')(taunus);\n    var pack = new Hapi.Pack();\n\n    pack.register({\n      plugin: taunusHapi,\n      options: {\n        // ...\n      }\n    });\n    ```\n\n    The `taunusHapi` plugin will mount Taunus and register all of the necessary routes. You can [find taunus-hapi on GitHub][8].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Command-Line Interface\n\n    Once you've set up the server-side to render your views using Taunus, it's only logical that you'll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.\n\n    The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.\n\n    Install it globally for development, but remember to use local copies for production-grade uses.\n\n    ```shell\n    npm install -g taunus\n    ```\n\n    When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.\n\n    ```shell\n    taunus\n    ```\n\n    By default, the output will be printed to the standard output, making for a fast debugging experience. Here's the output if you just had a single `home/index` route, and the matching view and client-side controller existed.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n      'home/index': require('../client/js/controllers/home/index.js')\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    You can use a few options to alter the outcome of invoking `taunus`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--output`\n\n    <sub>the `-o` alias is available</sub>\n\n    Output is written to a file instead of to standard output. The file path used will be the `client_wiring` option in [`.taunusrc`](#the-taunusrc-manifest), which defaults to `'.bin/wiring.js'`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--watch`\n\n    <sub>the `-w` alias is available</sub>\n\n    Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether `--output` was used.\n\n    The program won't exit.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--transform <module>`\n\n    <sub>the `-t` alias is available</sub>\n\n    This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the [`hapiify`][9] module.\n\n    ```shell\n    npm install hapiify\n    taunus -t hapiify\n    ```\n\n    Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--resolvers <module>`\n\n    <sub>the `-r` alias is available</sub>\n\n    Similarly to the [`resolvers`](#-options-resolvers-) option that you can pass to [`taunus.mount`](#-taunus-mount-addroute-options-), these resolvers can change the way in which file paths are resolved.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getClientController(action)` | Return path to client-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--standalone`\n\n    <sub>the `-s` alias is available</sub>\n\n    Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus [as a UMD module][10].\n\n    This would allow you to use Taunus on the client-side even if you don't want to use [Browserify][11] directly.\n\n    Feedback and suggestions about this flag, _and possible alternatives that would make Taunus easier to use_, are welcome.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-side API\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(container, wiring, options)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.on(type, fn)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.once(type, fn)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.off(type, fn)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.intercept(action, fn)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.partial(container, action, model, route)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.navigate(url)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.route(url)`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.state`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The `.taunusrc` manifest\n\n    If you want to use values other than the conventional defaults shown in the table below, then you should create a `.taunusrc` file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your `package.json`, under the `taunus` property.\n\n    ```json\n    {\n      \"views\": \".bin/views\",\n      \"server_routes\": \"controllers/routes.js\",\n      \"server_controllers\": \"controllers\",\n      \"client_controllers\": \"client/js/controllers\",\n      \"client_wiring\": \".bin/wiring.js\"\n    }\n    ```\n\n    - The `views` directory is where your views _(already compiled into JavaScript)_ are placed. These views are used directly on both the server-side and the client-side\n    - The `server_routes` file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module\n    - The `server_controllers` directory is the root directory where your server-side controllers live. It's used when setting up the server-side router\n    - The `client_controllers` directory is where your client-side controller modules live. The CLI will `require` these controllers in its resulting wiring module\n    - The `client_wiring` file is where your wiring module will be placed by the CLI. You'll then have to `require` it in your application when booting up Taunus\n\n    Here is where things get [a little conventional][12]. Views, and both server-side and client-side controllers are expected to be organized by following the `{root}/{controller}/{action}` pattern, but you could change that using `resolvers` when invoking the CLI and using the server-side API.\n\n    Views and controllers are also expected to be CommonJS modules that export a single method.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: /getting-started\n    [2]: http://expressjs.com\n    [3]: http://hapijs.com\n    [4]: https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\n    [5]: https://github.com/bevacqua/hget\n    [6]: https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\n    [7]: https://github.com/taunus/taunus-express\n    [8]: https://github.com/taunus/taunus-hapi\n    [9]: https://github.com/taunus/hapiify\n    [10]: https://github.com/umdjs/umd\n    [11]: http://browserify.org\n    [12]: http://en.wikipedia.org/wiki/Convention_over_configuration\n");
}
}
},{"jadum/runtime":17}],8:[function(require,module,exports){
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
buf.push("<h1 id=\"complementary-modules\">Complementary Modules</h1>\n<p>Foo</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Complementary Modules\n\n    Foo\n");
}
}
},{"jadum/runtime":17}],9:[function(require,module,exports){
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
},{"jadum/runtime":17}],10:[function(require,module,exports){
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
},{"jadum/runtime":17}],11:[function(require,module,exports){
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
},{"jadum/runtime":17}],12:[function(require,module,exports){
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
buf.push("<main id=\"application-root\" data-taunus=\"model\">" + (null == (jade_interp = partial) ? "" : jade_interp));
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
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "doctype html\nhtml(lang='en', itemscope, itemtype='http://schema.org/Blog')\n  head\n    title=model.title\n    meta(charset='utf-8')\n    link(rel='shortcut icon', href='/favicon.ico')\n    meta(http-equiv='X-UA-Compatible', content='IE=edge,chrome=1')\n    meta(name='viewport', content='width=device-width, initial-scale=1')\n    link(rel='stylesheet', type='text/css', href='/css/all.css')\n    link(rel='stylesheet', type='text/css', href='http://fonts.googleapis.com/css?family=Unica+One:400|Playfair+Display:700|Megrim:700|Fauna+One:400italic,400,700')\n\n  body#top\n    header\n      h1\n        a.ly-title(href='/', aria-label='Go to home') Taunus\n      h2.ly-subheading Micro Isomorphic MVC Engine for Node.js\n\n    aside\n      nav.nv-container\n        ul.nv-items\n          li.nv-item\n            a(href='/') About\n          li.nv-item\n            a(href='/getting-started') Getting Started\n          li.nv-item\n            a(href='/api') API Documentation\n          li.nv-item\n            a(href='/complements') Complementary Modules\n          li.nv-item\n            a(href='/performance') Performance Optimization\n          li.nv-item\n            a(href='/source-code') Source Code\n          li.nv-item\n            a(href='/changelog') Changelog\n\n    main#application-root(data-taunus='model')!=partial\n    script(src='/js/all.js')\n");
}
}
},{"jadum/runtime":17}],13:[function(require,module,exports){
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

// import the taunus module
var taunus = require('taunus');

// import the wiring module exported by Taunus
var wiring = require('../../.bin/wiring');

// get the <main> element
var main = document.getElementById('application-root');

// mount taunus so it starts its routing engine
taunus.mount(main, wiring);

},{"../../.bin/wiring":13,"taunus":25}],16:[function(require,module,exports){
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
},{}],17:[function(require,module,exports){
module.exports = require('jade/runtime');

},{"jade/runtime":16}],18:[function(require,module,exports){
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

},{"./emitter":21,"./fetcher":23,"./isNative":27,"./partial":31,"./router":32,"./state":33}],19:[function(require,module,exports){
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

},{"./once":30,"./stores/idb":34,"./stores/raw":35}],20:[function(require,module,exports){
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
  if (route.cache === false) {
    return;
  }
  var d = baseline;
  if (typeof route.cache === 'number') {
    d = route.cache;
  }
  var key = route.parts.pathname + e(route.parts.query);
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

},{"./cache":19,"./emitter":21,"./interceptor":26,"./state":33,"./stores/idb":34}],21:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');

module.exports = emitter({}, { throws: false });

},{"contra.emitter":38}],22:[function(require,module,exports){
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

},{}],23:[function(require,module,exports){
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

},{"./emitter":21,"./interceptor":26,"./xhr":37}],24:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var links = require('./links');

function attach () {
  emitter.on('start', links);
}

module.exports = {
  attach: attach
};

},{"./emitter":21,"./links":28}],25:[function(require,module,exports){
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

},{"./activator":18,"./emitter":21,"./hooks":24,"./interceptor":26,"./mount":29,"./partial":31,"./router":32,"./state":33}],26:[function(require,module,exports){
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

},{"./once":30,"./router":32,"contra.emitter":38}],27:[function(require,module,exports){
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

},{}],28:[function(require,module,exports){
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

},{"./activator":18,"./events":22,"./fetcher":23,"./router":32,"./state":33}],29:[function(require,module,exports){
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
},{"./activator":18,"./caching":20,"./fetcher":23,"./router":32,"./state":33,"./unescape":36}],30:[function(require,module,exports){
'use strict';

module.exports = function (fn) {
  var used;
  return function once () {
    if (used) { return; } used = true;
    return fn.apply(this, arguments);
  };
};

},{}],31:[function(require,module,exports){
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

},{"./emitter":21,"./state":33,"raf":41}],32:[function(require,module,exports){
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

},{"fast-url-parser":40,"routes":43}],33:[function(require,module,exports){
'use strict';

module.exports = {
  container: null
};

},{}],34:[function(require,module,exports){
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
},{}],35:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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

},{}],37:[function(require,module,exports){
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

},{"./emitter":21,"xhr":44}],38:[function(require,module,exports){
module.exports = require('./src/contra.emitter.js');

},{"./src/contra.emitter.js":39}],39:[function(require,module,exports){
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
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],40:[function(require,module,exports){
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

},{"punycode":2,"querystring":5}],41:[function(require,module,exports){
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

},{"performance-now":42}],42:[function(require,module,exports){
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
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],43:[function(require,module,exports){
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
},{}],44:[function(require,module,exports){
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

},{"global/window":45,"once":46,"parse-headers":50}],45:[function(require,module,exports){
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
},{}],46:[function(require,module,exports){
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

},{}],47:[function(require,module,exports){
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

},{"is-function":48}],48:[function(require,module,exports){
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

},{}],49:[function(require,module,exports){

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

},{}],50:[function(require,module,exports){
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
},{"for-each":47,"trim":49}]},{},[15])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvbWFpbi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL25vZGVfbW9kdWxlcy9qYWRlL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9qYWR1bS9ydW50aW1lLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvYWN0aXZhdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoaW5nLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZW1pdHRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2ZldGNoZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9ob29rcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW50ZXJjZXB0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pc05hdGl2ZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2xpbmtzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbW91bnQuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9vbmNlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcGFydGlhbC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3JvdXRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0YXRlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL2lkYi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0b3Jlcy9yYXcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci91bmVzY2FwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3hoci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL2NvbnRyYS5lbWl0dGVyL3NyYy9jb250cmEuZW1pdHRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvZmFzdC11cmwtcGFyc2VyL3NyYy91cmxwYXJzZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3JhZi9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcmFmL25vZGVfbW9kdWxlcy9wZXJmb3JtYW5jZS1ub3cvbGliL3BlcmZvcm1hbmNlLW5vdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcm91dGVzL2Rpc3Qvcm91dGVzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvZ2xvYmFsL3dpbmRvdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9vbmNlL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvbm9kZV9tb2R1bGVzL2lzLWZ1bmN0aW9uL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL3RyaW0vaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9wYXJzZS1oZWFkZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3ZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk5BO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8qISBodHRwOi8vbXRocy5iZS9wdW55Y29kZSB2MS4yLjQgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cztcblx0dmFyIGZyZWVNb2R1bGUgPSB0eXBlb2YgbW9kdWxlID09ICdvYmplY3QnICYmIG1vZHVsZSAmJlxuXHRcdG1vZHVsZS5leHBvcnRzID09IGZyZWVFeHBvcnRzICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8IGZyZWVHbG9iYWwud2luZG93ID09PSBmcmVlR2xvYmFsKSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXiAtfl0vLCAvLyB1bnByaW50YWJsZSBBU0NJSSBjaGFycyArIG5vbi1BU0NJSSBjaGFyc1xuXHRyZWdleFNlcGFyYXRvcnMgPSAvXFx4MkV8XFx1MzAwMnxcXHVGRjBFfFxcdUZGNjEvZywgLy8gUkZDIDM0OTAgc2VwYXJhdG9yc1xuXG5cdC8qKiBFcnJvciBtZXNzYWdlcyAqL1xuXHRlcnJvcnMgPSB7XG5cdFx0J292ZXJmbG93JzogJ092ZXJmbG93OiBpbnB1dCBuZWVkcyB3aWRlciBpbnRlZ2VycyB0byBwcm9jZXNzJyxcblx0XHQnbm90LWJhc2ljJzogJ0lsbGVnYWwgaW5wdXQgPj0gMHg4MCAobm90IGEgYmFzaWMgY29kZSBwb2ludCknLFxuXHRcdCdpbnZhbGlkLWlucHV0JzogJ0ludmFsaWQgaW5wdXQnXG5cdH0sXG5cblx0LyoqIENvbnZlbmllbmNlIHNob3J0Y3V0cyAqL1xuXHRiYXNlTWludXNUTWluID0gYmFzZSAtIHRNaW4sXG5cdGZsb29yID0gTWF0aC5mbG9vcixcblx0c3RyaW5nRnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZSxcblxuXHQvKiogVGVtcG9yYXJ5IHZhcmlhYmxlICovXG5cdGtleTtcblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGVycm9yIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSBlcnJvciB0eXBlLlxuXHQgKiBAcmV0dXJucyB7RXJyb3J9IFRocm93cyBhIGBSYW5nZUVycm9yYCB3aXRoIHRoZSBhcHBsaWNhYmxlIGVycm9yIG1lc3NhZ2UuXG5cdCAqL1xuXHRmdW5jdGlvbiBlcnJvcih0eXBlKSB7XG5cdFx0dGhyb3cgUmFuZ2VFcnJvcihlcnJvcnNbdHlwZV0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBgQXJyYXkjbWFwYCB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnkgYXJyYXlcblx0ICogaXRlbS5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBhcnJheSBvZiB2YWx1ZXMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwKGFycmF5LCBmbikge1xuXHRcdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdFx0d2hpbGUgKGxlbmd0aC0tKSB7XG5cdFx0XHRhcnJheVtsZW5ndGhdID0gZm4oYXJyYXlbbGVuZ3RoXSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHNpbXBsZSBgQXJyYXkjbWFwYC1saWtlIHdyYXBwZXIgdG8gd29yayB3aXRoIGRvbWFpbiBuYW1lIHN0cmluZ3MuXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnlcblx0ICogY2hhcmFjdGVyLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IHN0cmluZyBvZiBjaGFyYWN0ZXJzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFja1xuXHQgKiBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcERvbWFpbihzdHJpbmcsIGZuKSB7XG5cdFx0cmV0dXJuIG1hcChzdHJpbmcuc3BsaXQocmVnZXhTZXBhcmF0b3JzKSwgZm4pLmpvaW4oJy4nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIG51bWVyaWMgY29kZSBwb2ludHMgb2YgZWFjaCBVbmljb2RlXG5cdCAqIGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLiBXaGlsZSBKYXZhU2NyaXB0IHVzZXMgVUNTLTIgaW50ZXJuYWxseSxcblx0ICogdGhpcyBmdW5jdGlvbiB3aWxsIGNvbnZlcnQgYSBwYWlyIG9mIHN1cnJvZ2F0ZSBoYWx2ZXMgKGVhY2ggb2Ygd2hpY2hcblx0ICogVUNTLTIgZXhwb3NlcyBhcyBzZXBhcmF0ZSBjaGFyYWN0ZXJzKSBpbnRvIGEgc2luZ2xlIGNvZGUgcG9pbnQsXG5cdCAqIG1hdGNoaW5nIFVURi0xNi5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5lbmNvZGVgXG5cdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGRlY29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBuZXcgYXJyYXkgb2YgY29kZSBwb2ludHMuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgY291bnRlciA9IDAsXG5cdFx0ICAgIGxlbmd0aCA9IHN0cmluZy5sZW5ndGgsXG5cdFx0ICAgIHZhbHVlLFxuXHRcdCAgICBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmRlY29kZWBcblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZW5jb2RlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGNvZGVQb2ludHMgVGhlIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuZXcgVW5pY29kZSBzdHJpbmcgKFVDUy0yKS5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJlbmNvZGUoYXJyYXkpIHtcblx0XHRyZXR1cm4gbWFwKGFycmF5LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdFx0aWYgKHZhbHVlID4gMHhGRkZGKSB7XG5cdFx0XHRcdHZhbHVlIC09IDB4MTAwMDA7XG5cdFx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApO1xuXHRcdFx0XHR2YWx1ZSA9IDB4REMwMCB8IHZhbHVlICYgMHgzRkY7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBiYXNpYyBjb2RlIHBvaW50IGludG8gYSBkaWdpdC9pbnRlZ2VyLlxuXHQgKiBAc2VlIGBkaWdpdFRvQmFzaWMoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVQb2ludCBUaGUgYmFzaWMgbnVtZXJpYyBjb2RlIHBvaW50IHZhbHVlLlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQgKGZvciB1c2UgaW5cblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuXHQgKiB0aGUgY29kZSBwb2ludCBkb2VzIG5vdCByZXByZXNlbnQgYSB2YWx1ZS5cblx0ICovXG5cdGZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQpIHtcblx0XHRpZiAoY29kZVBvaW50IC0gNDggPCAxMCkge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDIyO1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gNjUgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDY1O1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gOTcgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDk3O1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEBzZWUgYGJhc2ljVG9EaWdpdCgpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gZGlnaXQgVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzaWMgY29kZSBwb2ludCB3aG9zZSB2YWx1ZSAod2hlbiB1c2VkIGZvclxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGlzIGBkaWdpdGAsIHdoaWNoIG5lZWRzIHRvIGJlIGluIHRoZSByYW5nZVxuXHQgKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcblx0ICogdXNlZDsgZWxzZSwgdGhlIGxvd2VyY2FzZSBmb3JtIGlzIHVzZWQuIFRoZSBiZWhhdmlvciBpcyB1bmRlZmluZWRcblx0ICogaWYgYGZsYWdgIGlzIG5vbi16ZXJvIGFuZCBgZGlnaXRgIGhhcyBubyB1cHBlcmNhc2UgZm9ybS5cblx0ICovXG5cdGZ1bmN0aW9uIGRpZ2l0VG9CYXNpYyhkaWdpdCwgZmxhZykge1xuXHRcdC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG5cdFx0Ly8gMjYuLjM1IG1hcCB0byBBU0NJSSAwLi45XG5cdFx0cmV0dXJuIGRpZ2l0ICsgMjIgKyA3NSAqIChkaWdpdCA8IDI2KSAtICgoZmxhZyAhPSAwKSA8PCA1KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaWFzIGFkYXB0YXRpb24gZnVuY3Rpb24gYXMgcGVyIHNlY3Rpb24gMy40IG9mIFJGQyAzNDkyLlxuXHQgKiBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNDkyI3NlY3Rpb24tMy40XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGFwdChkZWx0YSwgbnVtUG9pbnRzLCBmaXJzdFRpbWUpIHtcblx0XHR2YXIgayA9IDA7XG5cdFx0ZGVsdGEgPSBmaXJzdFRpbWUgPyBmbG9vcihkZWx0YSAvIGRhbXApIDogZGVsdGEgPj4gMTtcblx0XHRkZWx0YSArPSBmbG9vcihkZWx0YSAvIG51bVBvaW50cyk7XG5cdFx0Zm9yICgvKiBubyBpbml0aWFsaXphdGlvbiAqLzsgZGVsdGEgPiBiYXNlTWludXNUTWluICogdE1heCA+PiAxOyBrICs9IGJhc2UpIHtcblx0XHRcdGRlbHRhID0gZmxvb3IoZGVsdGEgLyBiYXNlTWludXNUTWluKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZsb29yKGsgKyAoYmFzZU1pbnVzVE1pbiArIDEpICogZGVsdGEgLyAoZGVsdGEgKyBza2V3KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzIHRvIGEgc3RyaW5nIG9mIFVuaWNvZGVcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGVjb2RlKGlucHV0KSB7XG5cdFx0Ly8gRG9uJ3QgdXNlIFVDUy0yXG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aCxcblx0XHQgICAgb3V0LFxuXHRcdCAgICBpID0gMCxcblx0XHQgICAgbiA9IGluaXRpYWxOLFxuXHRcdCAgICBiaWFzID0gaW5pdGlhbEJpYXMsXG5cdFx0ICAgIGJhc2ljLFxuXHRcdCAgICBqLFxuXHRcdCAgICBpbmRleCxcblx0XHQgICAgb2xkaSxcblx0XHQgICAgdyxcblx0XHQgICAgayxcblx0XHQgICAgZGlnaXQsXG5cdFx0ICAgIHQsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBiYXNlTWludXNUO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50czogbGV0IGBiYXNpY2AgYmUgdGhlIG51bWJlciBvZiBpbnB1dCBjb2RlXG5cdFx0Ly8gcG9pbnRzIGJlZm9yZSB0aGUgbGFzdCBkZWxpbWl0ZXIsIG9yIGAwYCBpZiB0aGVyZSBpcyBub25lLCB0aGVuIGNvcHlcblx0XHQvLyB0aGUgZmlyc3QgYmFzaWMgY29kZSBwb2ludHMgdG8gdGhlIG91dHB1dC5cblxuXHRcdGJhc2ljID0gaW5wdXQubGFzdEluZGV4T2YoZGVsaW1pdGVyKTtcblx0XHRpZiAoYmFzaWMgPCAwKSB7XG5cdFx0XHRiYXNpYyA9IDA7XG5cdFx0fVxuXG5cdFx0Zm9yIChqID0gMDsgaiA8IGJhc2ljOyArK2opIHtcblx0XHRcdC8vIGlmIGl0J3Mgbm90IGEgYmFzaWMgY29kZSBwb2ludFxuXHRcdFx0aWYgKGlucHV0LmNoYXJDb2RlQXQoaikgPj0gMHg4MCkge1xuXHRcdFx0XHRlcnJvcignbm90LWJhc2ljJyk7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQucHVzaChpbnB1dC5jaGFyQ29kZUF0KGopKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGRlY29kaW5nIGxvb3A6IHN0YXJ0IGp1c3QgYWZ0ZXIgdGhlIGxhc3QgZGVsaW1pdGVyIGlmIGFueSBiYXNpYyBjb2RlXG5cdFx0Ly8gcG9pbnRzIHdlcmUgY29waWVkOyBzdGFydCBhdCB0aGUgYmVnaW5uaW5nIG90aGVyd2lzZS5cblxuXHRcdGZvciAoaW5kZXggPSBiYXNpYyA+IDAgPyBiYXNpYyArIDEgOiAwOyBpbmRleCA8IGlucHV0TGVuZ3RoOyAvKiBubyBmaW5hbCBleHByZXNzaW9uICovKSB7XG5cblx0XHRcdC8vIGBpbmRleGAgaXMgdGhlIGluZGV4IG9mIHRoZSBuZXh0IGNoYXJhY3RlciB0byBiZSBjb25zdW1lZC5cblx0XHRcdC8vIERlY29kZSBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyIGludG8gYGRlbHRhYCxcblx0XHRcdC8vIHdoaWNoIGdldHMgYWRkZWQgdG8gYGlgLiBUaGUgb3ZlcmZsb3cgY2hlY2tpbmcgaXMgZWFzaWVyXG5cdFx0XHQvLyBpZiB3ZSBpbmNyZWFzZSBgaWAgYXMgd2UgZ28sIHRoZW4gc3VidHJhY3Qgb2ZmIGl0cyBzdGFydGluZ1xuXHRcdFx0Ly8gdmFsdWUgYXQgdGhlIGVuZCB0byBvYnRhaW4gYGRlbHRhYC5cblx0XHRcdGZvciAob2xkaSA9IGksIHcgPSAxLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblxuXHRcdFx0XHRpZiAoaW5kZXggPj0gaW5wdXRMZW5ndGgpIHtcblx0XHRcdFx0XHRlcnJvcignaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlnaXQgPSBiYXNpY1RvRGlnaXQoaW5wdXQuY2hhckNvZGVBdChpbmRleCsrKSk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0ID49IGJhc2UgfHwgZGlnaXQgPiBmbG9vcigobWF4SW50IC0gaSkgLyB3KSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aSArPSBkaWdpdCAqIHc7XG5cdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA8IHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0aWYgKHcgPiBmbG9vcihtYXhJbnQgLyBiYXNlTWludXNUKSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dyAqPSBiYXNlTWludXNUO1xuXG5cdFx0XHR9XG5cblx0XHRcdG91dCA9IG91dHB1dC5sZW5ndGggKyAxO1xuXHRcdFx0YmlhcyA9IGFkYXB0KGkgLSBvbGRpLCBvdXQsIG9sZGkgPT0gMCk7XG5cblx0XHRcdC8vIGBpYCB3YXMgc3VwcG9zZWQgdG8gd3JhcCBhcm91bmQgZnJvbSBgb3V0YCB0byBgMGAsXG5cdFx0XHQvLyBpbmNyZW1lbnRpbmcgYG5gIGVhY2ggdGltZSwgc28gd2UnbGwgZml4IHRoYXQgbm93OlxuXHRcdFx0aWYgKGZsb29yKGkgLyBvdXQpID4gbWF4SW50IC0gbikge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0biArPSBmbG9vcihpIC8gb3V0KTtcblx0XHRcdGkgJT0gb3V0O1xuXG5cdFx0XHQvLyBJbnNlcnQgYG5gIGF0IHBvc2l0aW9uIGBpYCBvZiB0aGUgb3V0cHV0XG5cdFx0XHRvdXRwdXQuc3BsaWNlKGkrKywgMCwgbik7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdWNzMmVuY29kZShvdXRwdXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scyB0byBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5XG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGVuY29kZShpbnB1dCkge1xuXHRcdHZhciBuLFxuXHRcdCAgICBkZWx0YSxcblx0XHQgICAgaGFuZGxlZENQQ291bnQsXG5cdFx0ICAgIGJhc2ljTGVuZ3RoLFxuXHRcdCAgICBiaWFzLFxuXHRcdCAgICBqLFxuXHRcdCAgICBtLFxuXHRcdCAgICBxLFxuXHRcdCAgICBrLFxuXHRcdCAgICB0LFxuXHRcdCAgICBjdXJyZW50VmFsdWUsXG5cdFx0ICAgIG91dHB1dCA9IFtdLFxuXHRcdCAgICAvKiogYGlucHV0TGVuZ3RoYCB3aWxsIGhvbGQgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyBpbiBgaW5wdXRgLiAqL1xuXHRcdCAgICBpbnB1dExlbmd0aCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50UGx1c09uZSxcblx0XHQgICAgYmFzZU1pbnVzVCxcblx0XHQgICAgcU1pbnVzVDtcblxuXHRcdC8vIENvbnZlcnQgdGhlIGlucHV0IGluIFVDUy0yIHRvIFVuaWNvZGVcblx0XHRpbnB1dCA9IHVjczJkZWNvZGUoaW5wdXQpO1xuXG5cdFx0Ly8gQ2FjaGUgdGhlIGxlbmd0aFxuXHRcdGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgc3RhdGVcblx0XHRuID0gaW5pdGlhbE47XG5cdFx0ZGVsdGEgPSAwO1xuXHRcdGJpYXMgPSBpbml0aWFsQmlhcztcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHNcblx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgMHg4MCkge1xuXHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoY3VycmVudFZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aGFuZGxlZENQQ291bnQgPSBiYXNpY0xlbmd0aCA9IG91dHB1dC5sZW5ndGg7XG5cblx0XHQvLyBgaGFuZGxlZENQQ291bnRgIGlzIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgdGhhdCBoYXZlIGJlZW4gaGFuZGxlZDtcblx0XHQvLyBgYmFzaWNMZW5ndGhgIGlzIHRoZSBudW1iZXIgb2YgYmFzaWMgY29kZSBwb2ludHMuXG5cblx0XHQvLyBGaW5pc2ggdGhlIGJhc2ljIHN0cmluZyAtIGlmIGl0IGlzIG5vdCBlbXB0eSAtIHdpdGggYSBkZWxpbWl0ZXJcblx0XHRpZiAoYmFzaWNMZW5ndGgpIHtcblx0XHRcdG91dHB1dC5wdXNoKGRlbGltaXRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBlbmNvZGluZyBsb29wOlxuXHRcdHdoaWxlIChoYW5kbGVkQ1BDb3VudCA8IGlucHV0TGVuZ3RoKSB7XG5cblx0XHRcdC8vIEFsbCBub24tYmFzaWMgY29kZSBwb2ludHMgPCBuIGhhdmUgYmVlbiBoYW5kbGVkIGFscmVhZHkuIEZpbmQgdGhlIG5leHRcblx0XHRcdC8vIGxhcmdlciBvbmU6XG5cdFx0XHRmb3IgKG0gPSBtYXhJbnQsIGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA+PSBuICYmIGN1cnJlbnRWYWx1ZSA8IG0pIHtcblx0XHRcdFx0XHRtID0gY3VycmVudFZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluY3JlYXNlIGBkZWx0YWAgZW5vdWdoIHRvIGFkdmFuY2UgdGhlIGRlY29kZXIncyA8bixpPiBzdGF0ZSB0byA8bSwwPixcblx0XHRcdC8vIGJ1dCBndWFyZCBhZ2FpbnN0IG92ZXJmbG93XG5cdFx0XHRoYW5kbGVkQ1BDb3VudFBsdXNPbmUgPSBoYW5kbGVkQ1BDb3VudCArIDE7XG5cdFx0XHRpZiAobSAtIG4gPiBmbG9vcigobWF4SW50IC0gZGVsdGEpIC8gaGFuZGxlZENQQ291bnRQbHVzT25lKSkge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsdGEgKz0gKG0gLSBuKSAqIGhhbmRsZWRDUENvdW50UGx1c09uZTtcblx0XHRcdG4gPSBtO1xuXG5cdFx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgbiAmJiArK2RlbHRhID4gbWF4SW50KSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID09IG4pIHtcblx0XHRcdFx0XHQvLyBSZXByZXNlbnQgZGVsdGEgYXMgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlclxuXHRcdFx0XHRcdGZvciAocSA9IGRlbHRhLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblx0XHRcdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXHRcdFx0XHRcdFx0aWYgKHEgPCB0KSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cU1pbnVzVCA9IHEgLSB0O1xuXHRcdFx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goXG5cdFx0XHRcdFx0XHRcdHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWModCArIHFNaW51c1QgJSBiYXNlTWludXNULCAwKSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRxID0gZmxvb3IocU1pbnVzVCAvIGJhc2VNaW51c1QpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWMocSwgMCkpKTtcblx0XHRcdFx0XHRiaWFzID0gYWRhcHQoZGVsdGEsIGhhbmRsZWRDUENvdW50UGx1c09uZSwgaGFuZGxlZENQQ291bnQgPT0gYmFzaWNMZW5ndGgpO1xuXHRcdFx0XHRcdGRlbHRhID0gMDtcblx0XHRcdFx0XHQrK2hhbmRsZWRDUENvdW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdCsrZGVsdGE7XG5cdFx0XHQrK247XG5cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dC5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBVbmljb2RlLiBPbmx5IHRoZVxuXHQgKiBQdW55Y29kZWQgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IG9uIGEgc3RyaW5nIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBjb252ZXJ0ZWQgdG9cblx0ICogVW5pY29kZS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIFB1bnljb2RlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQgdG8gVW5pY29kZS5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFVuaWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIFB1bnljb2RlXG5cdCAqIHN0cmluZy5cblx0ICovXG5cdGZ1bmN0aW9uIHRvVW5pY29kZShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhQdW55Y29kZS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyBkZWNvZGUoc3RyaW5nLnNsaWNlKDQpLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgVW5pY29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gUHVueWNvZGUuIE9ubHkgdGhlXG5cdCAqIG5vbi1BU0NJSSBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0J3MgYWxyZWFkeSBpbiBBU0NJSS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQsIGFzIGEgVW5pY29kZSBzdHJpbmcuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBQdW55Y29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gZG9tYWluIG5hbWUuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b0FTQ0lJKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleE5vbkFTQ0lJLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/ICd4bi0tJyArIGVuY29kZShzdHJpbmcpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqIERlZmluZSB0aGUgcHVibGljIEFQSSAqL1xuXHRwdW55Y29kZSA9IHtcblx0XHQvKipcblx0XHQgKiBBIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGN1cnJlbnQgUHVueWNvZGUuanMgdmVyc2lvbiBudW1iZXIuXG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgU3RyaW5nXG5cdFx0ICovXG5cdFx0J3ZlcnNpb24nOiAnMS4yLjQnLFxuXHRcdC8qKlxuXHRcdCAqIEFuIG9iamVjdCBvZiBtZXRob2RzIHRvIGNvbnZlcnQgZnJvbSBKYXZhU2NyaXB0J3MgaW50ZXJuYWwgY2hhcmFjdGVyXG5cdFx0ICogcmVwcmVzZW50YXRpb24gKFVDUy0yKSB0byBVbmljb2RlIGNvZGUgcG9pbnRzLCBhbmQgYmFjay5cblx0XHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIE9iamVjdFxuXHRcdCAqL1xuXHRcdCd1Y3MyJzoge1xuXHRcdFx0J2RlY29kZSc6IHVjczJkZWNvZGUsXG5cdFx0XHQnZW5jb2RlJzogdWNzMmVuY29kZVxuXHRcdH0sXG5cdFx0J2RlY29kZSc6IGRlY29kZSxcblx0XHQnZW5jb2RlJzogZW5jb2RlLFxuXHRcdCd0b0FTQ0lJJzogdG9BU0NJSSxcblx0XHQndG9Vbmljb2RlJzogdG9Vbmljb2RlXG5cdH07XG5cblx0LyoqIEV4cG9zZSBgcHVueWNvZGVgICovXG5cdC8vIFNvbWUgQU1EIGJ1aWxkIG9wdGltaXplcnMsIGxpa2Ugci5qcywgY2hlY2sgZm9yIHNwZWNpZmljIGNvbmRpdGlvbiBwYXR0ZXJuc1xuXHQvLyBsaWtlIHRoZSBmb2xsb3dpbmc6XG5cdGlmIChcblx0XHR0eXBlb2YgZGVmaW5lID09ICdmdW5jdGlvbicgJiZcblx0XHR0eXBlb2YgZGVmaW5lLmFtZCA9PSAnb2JqZWN0JyAmJlxuXHRcdGRlZmluZS5hbWRcblx0KSB7XG5cdFx0ZGVmaW5lKCdwdW55Y29kZScsIGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHB1bnljb2RlO1xuXHRcdH0pO1xuXHR9IGVsc2UgaWYgKGZyZWVFeHBvcnRzICYmICFmcmVlRXhwb3J0cy5ub2RlVHlwZSkge1xuXHRcdGlmIChmcmVlTW9kdWxlKSB7IC8vIGluIE5vZGUuanMgb3IgUmluZ29KUyB2MC44LjArXG5cdFx0XHRmcmVlTW9kdWxlLmV4cG9ydHMgPSBwdW55Y29kZTtcblx0XHR9IGVsc2UgeyAvLyBpbiBOYXJ3aGFsIG9yIFJpbmdvSlMgdjAuNy4wLVxuXHRcdFx0Zm9yIChrZXkgaW4gcHVueWNvZGUpIHtcblx0XHRcdFx0cHVueWNvZGUuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAoZnJlZUV4cG9ydHNba2V5XSA9IHB1bnljb2RlW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHsgLy8gaW4gUmhpbm8gb3IgYSB3ZWIgYnJvd3NlclxuXHRcdHJvb3QucHVueWNvZGUgPSBwdW55Y29kZTtcblx0fVxuXG59KHRoaXMpKTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBvYmpba10ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYWJvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwid2h5LXRhdW51cy1cXFwiPldoeSBUYXVudXM/PC9oMT5cXG48cD5UYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIDxlbT5hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZTwvZW0+IGFzIHdlbGwuIDxzdHJvbmc+VGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQ8L3N0cm9uZz4uIEl0IHVzZXMgc2VydmVyLXNpZGUgcmVuZGVyaW5nIHRvIGdldCBjb250ZW50IHRvIHlvdXIgaHVtYW5zIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCBpdCB1c2VzIGNsaWVudC1zaWRlIHJlbmRlcmluZyB0byBpbXByb3ZlIHRoZWlyIGV4cGVyaWVuY2UuPC9wPlxcbjxwPldoaWxlIGl0IGZvY3VzZXMgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIDxzdHJvbmc+PGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2FkanVzdGluZy11eC1mb3ItaHVtYW5zXFxcIj51c2FiaWxpdHk8L2E+IGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zPC9zdHJvbmc+IGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgPHN0cm9uZz5zdGlsbCBleHBlY3RlZCB0byB3b3JrPC9zdHJvbmc+LjwvcD5cXG48cD5Gb3IgZXhhbXBsZSwgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIHNpdGUgdXNlcyBwbGFpbi1vbGQgbGlua3MgdG8gbmF2aWdhdGUgZnJvbSBvbmUgdmlldyB0byBhbm90aGVyLCBhbmQgdGhlbiBhZGRzIGEgPGNvZGU+Y2xpY2s8L2NvZGU+IGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0JiMzOTtzIG9rYXksIGJlY2F1c2Ugd2UgYWNrbm93bGVkZ2UgdGhhdCA8c3Ryb25nPm91ciBzaXRlcyBkb24mIzM5O3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3Nlcjwvc3Ryb25nPi4gU2ltaWxhcmx5LCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXFwiPnBlcmZvcm1hbmNlIGlzIGdyZWF0bHkgZW5oYW5jZWQ8L2E+IGJ5IGRlbGl2ZXJpbmcgY29udGVudCB0byB0aGUgaHVtYW4gYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIHRoZW4gYWRkaW5nIGZ1bmN0aW9uYWxpdHkgb24gdG9wIG9mIHRoYXQuPC9wPlxcbjxwPldpdGggcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIGlmIHRoZSBmdW5jdGlvbmFsaXR5IG5ldmVyIGdldHMgdGhlcmUgYmVjYXVzZSBhIEphdmFTY3JpcHQgcmVzb3VyY2UgZmFpbGVkIHRvIGxvYWQgYmVjYXVzZSB0aGUgbmV0d29yayBmYWlsZWQgPGVtPihub3QgdW5jb21tb24gaW4gdGhlIG1vYmlsZSBlcmEpPC9lbT4gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrITwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktbm90LW90aGVyLWZyYW1ld29ya3MtXFxcIj5XaHkgTm90IE90aGVyIEZyYW1ld29ya3M/PC9oMT5cXG48cD5NYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4mIzM5O3QgZGVzaWduZWQgd2l0aCBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJiMzOTt0IHByaW9yaXRpemVkLCBhbmQgaHVtYW5zIGFyZSBleHBlY3RlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5kb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgaHVtYW4tZGlnZXN0aWJsZSBjb250ZW50PC9hPi4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIFNFTyBpcyBhbHNvIGEgcHJvYmxlbS4gR29vZ2xlIGlzbiYjMzk7dCB0aGUgb25seSB3ZWIgY3Jhd2xlciBvcGVyYXRvciBvdXQgdGhlcmUsIGFuZCBpdCBtaWdodCBiZSBhIHdoaWxlIGJlZm9yZSBzb2NpYWwgbWVkaWEgbGluayBjcmF3bGVycyBjYXRjaCB1cCB3aXRoIHRoZW0uPC9wPlxcbjxwPkxhdGVseSwgd2UgY2FuIG9ic2VydmUgbWFueSBtYXR1cmUgb3Blbi1zb3VyY2UgZnJhbWV3b3JrcyBhcmUgZHJvcHBpbmcgc3VwcG9ydCBmb3Igb2xkZXIgYnJvd3NlcnMuIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5JiMzOTtyZSBhcmNoaXRlY3RlZCwgd2hlcmUgdGhlIGRldmVsb3BlciBpcyBwdXQgZmlyc3QuIDxzdHJvbmc+VGF1bnVzIGlzIDxhIGhyZWY9XFxcImh0dHBzOi8vdHdpdHRlci5jb20vaGFzaHRhZy9odW1hbmZpcnN0XFxcIj4jaHVtYW5maXJzdDwvYT48L3N0cm9uZz4sIG1lYW5pbmcgdGhhdCBpdCBjb25jZWRlcyB0aGF0IGh1bWFucyBhcmUgbW9yZSBpbXBvcnRhbnQgdGhhbiB0aGUgZGV2ZWxvcGVycyBidWlsZGluZyB0aGVpciBhcHBsaWNhdGlvbnMuPC9wPlxcbjxwPlByb2dyZXNzaXZlbHkgZW5oYW5jZWQgYXBwbGljYXRpb25zIGFyZSBhbHdheXMgZ29pbmcgdG8gaGF2ZSBncmVhdCBicm93c2VyIHN1cHBvcnQgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkmIzM5O3JlIGFyY2hpdGVjdGVkLiBBcyB0aGUgbmFtZSBpbXBsaWVzLCBhIGJhc2VsaW5lIGlzIGVzdGFibGlzaGVkIHdoZXJlIHdlIGRlbGl2ZXIgdGhlIGNvcmUgZXhwZXJpZW5jZSB0byB0aGUgdXNlciA8ZW0+KHR5cGljYWxseSBpbiB0aGUgZm9ybSBvZiByZWFkYWJsZSBIVE1MIGNvbnRlbnQpPC9lbT4sIGFuZCB0aGVuIGVuaGFuY2UgaXQgPHN0cm9uZz5pZiBwb3NzaWJsZTwvc3Ryb25nPiB1c2luZyBDU1MgYW5kIEphdmFTY3JpcHQuIEJ1aWxkaW5nIGFwcGxpY2F0aW9ucyBpbiB0aGlzIHdheSBtZWFucyB0aGF0IHlvdSYjMzk7bGwgYmUgYWJsZSB0byByZWFjaCB0aGUgbW9zdCBwZW9wbGUgd2l0aCB5b3VyIGNvcmUgZXhwZXJpZW5jZSwgYW5kIHlvdSYjMzk7bGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmVhdHVyZXNcXFwiPkZlYXR1cmVzPC9oMT5cXG48cD5PdXQgb2YgdGhlIGJveCwgVGF1bnVzIGVuc3VyZXMgdGhhdCB5b3VyIHNpdGUgd29ya3Mgb24gYW55IEhUTUwtZW5hYmxlZCBkb2N1bWVudCB2aWV3ZXIgYW5kIGV2ZW4gdGhlIHRlcm1pbmFsLCBwcm92aWRpbmcgc3VwcG9ydCBmb3IgcGxhaW4gdGV4dCByZXNwb25zZXMgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+d2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWQ8L2E+LiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UmIzM5O2xsIG9ubHkgaGF2ZSB0byBkZWNsYXJlIHRoZXNlIG9uY2UgYnV0IHRoZXkmIzM5O2xsIGJlIHVzZWQgaW4gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+VGF1bnVzIGZlYXR1cmVzIGEgcmVhc29uYWJseSBlbmhhbmNlZCBleHBlcmllbmNlLCB3aGVyZSBpZiBmZWF0dXJlcyBhcmVuJiMzOTt0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkmIzM5O3JlIGp1c3Qgbm90IHByb3ZpZGVkLiBGb3IgZXhhbXBsZSwgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBtYWtlcyB1c2Ugb2YgdGhlIDxjb2RlPmhpc3Rvcnk8L2NvZGU+IEFQSSBidXQgaWYgdGhhdCYjMzk7cyBub3QgYXZhaWxhYmxlIHRoZW4gaXQmIzM5O2xsIGZhbGwgYmFjayB0byBzaW1wbHkgbm90IG1lZGRsaW5nIHdpdGggbGlua3MgaW5zdGVhZCBvZiB1c2luZyBhIGNsaWVudC1zaWRlLW9ubHkgaGFzaCByb3V0ZXIuPC9wPlxcbjxwPlRhdW51cyBjYW4gZGVhbCB3aXRoIHZpZXcgY2FjaGluZyBvbiB5b3VyIGJlaGFsZiwgaWYgeW91IHNvIGRlc2lyZSwgdXNpbmcgPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXFwiPmFzeW5jaHJvbm91cyBlbWJlZGRlZCBkYXRhYmFzZSBzdG9yZXM8L2E+IG9uIHRoZSBjbGllbnQtc2lkZS4gVHVybnMgb3V0LCB0aGVyZSYjMzk7cyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI3NlYXJjaD1pbmRleGVkZGJcXFwiPnByZXR0eSBnb29kIGJyb3dzZXIgc3VwcG9ydCBmb3IgSW5kZXhlZERCPC9hPi4gT2YgY291cnNlLCBJbmRleGVkREIgd2lsbCBvbmx5IGJlIHVzZWQgaWYgaXQmIzM5O3MgYXZhaWxhYmxlLCBhbmQgaWYgaXQmIzM5O3Mgbm90IHRoZW4gdmlld3Mgd29uJiMzOTt0IGJlIGNhY2hlZCBpbiB0aGUgY2xpZW50LXNpZGUgYmVzaWRlcyBhbiBpbi1tZW1vcnkgc3RvcmUuIDxzdHJvbmc+VGhlIHNpdGUgd29uJiMzOTt0IHNpbXBseSByb2xsIG92ZXIgYW5kIGRpZSwgdGhvdWdoLjwvc3Ryb25nPjwvcD5cXG48cD5JZiB5b3UmIzM5O3ZlIHR1cm5lZCBjbGllbnQtc2lkZSBjYWNoaW5nIG9uLCB0aGVuIHlvdSBjYW4gYWxzbyB0dXJuIG9uIHRoZSA8c3Ryb25nPnZpZXcgcHJlLWZldGNoaW5nIGZlYXR1cmU8L3N0cm9uZz4sIHdoaWNoIHdpbGwgc3RhcnQgZG93bmxvYWRpbmcgdmlld3MgYXMgc29vbiBhcyBodW1hbnMgaG92ZXIgb24gbGlua3MsIGFzIHRvIGRlbGl2ZXIgYSA8ZW0+ZmFzdGVyIHBlcmNlaXZlZCBodW1hbiBleHBlcmllbmNlPC9lbT4uPC9wPlxcbjxwPlRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmEgZmV3IGNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4geW91IGNhbiB1c2UgdG8gZW5oYW5jZSB5b3VyIGRldmVsb3BtZW50IGV4cGVyaWVuY2UsIGFzIHdlbGwuPC9wPlxcbjxwPldpdGggVGF1bnVzIHlvdSYjMzk7bGwgYmUgaW4gY2hhcmdlLiA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5BcmUgeW91IHJlYWR5IHRvIGdldCBzdGFydGVkPzwvYT48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA3LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmFtaWxpYXJpdHlcXFwiPkZhbWlsaWFyaXR5PC9oMT5cXG48cD5Zb3UgY2FuIHVzZSBUYXVudXMgdG8gZGV2ZWxvcCBhcHBsaWNhdGlvbnMgdXNpbmcgeW91ciBmYXZvcml0ZSBOb2RlLmpzIEhUVFAgc2VydmVyLCA8c3Ryb25nPmJvdGggPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGFuZCA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4gYXJlIGZ1bGx5IHN1cHBvcnRlZDwvc3Ryb25nPi4gSW4gYm90aCBjYXNlcywgeW91JiMzOTtsbCA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5idWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSYjMzk7cmUgYWxyZWFkeSB1c2VkIHRvPC9hPiwgZXhjZXB0IHlvdSB3b24mIzM5O3QgaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiB0aGUgdmlldyBjb250cm9sbGVycyBvciBkZWZpbmUgYW55IHZpZXcgcm91dGVzIHNpbmNlIFRhdW51cyB3aWxsIGRlYWwgd2l0aCB0aGF0IG9uIHlvdXIgYmVoYWxmLiBJbiB0aGUgY29udHJvbGxlcnMgeW91JiMzOTtsbCBiZSBhYmxlIHRvIGRvIGV2ZXJ5dGhpbmcgeW91JiMzOTtyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSYjMzk7bGwgaGF2ZSB0byByZXR1cm4gYSBKU09OIG1vZGVsIHdoaWNoIHdpbGwgYmUgdXNlZCB0byByZW5kZXIgYSB2aWV3LjwvcD5cXG48cD5Zb3UgY2FuIHVzZSBhbnkgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgeW91IHdhbnQsIHByb3ZpZGVkIHRoYXQgaXQgY2FuIGJlIGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuIFRoYXQmIzM5O3MgYmVjYXVzZSBUYXVudXMgdHJlYXRzIHZpZXdzIGFzIG1lcmUgSmF2YVNjcmlwdCBmdW5jdGlvbnMsIHJhdGhlciB0aGFuIGJlaW5nIHRpZWQgaW50byBhIHNwZWNpZmljIHZpZXctcmVuZGVyaW5nIGVuZ2luZS48L3A+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGp1c3QgZnVuY3Rpb25zLCB0b28uIFlvdSBjYW4gYnJpbmcgeW91ciBvd24gc2VsZWN0b3IgZW5naW5lLCB5b3VyIG93biBBSkFYIGxpYnJhcmllcywgYW5kIHlvdXIgb3duIGRhdGEtYmluZGluZyBzb2x1dGlvbnMuIEl0IG1pZ2h0IG1lYW4gdGhlcmUmIzM5O3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UmIzM5O2xsIGFsc28gYmUgZnJlZSB0byBwaWNrIHdoYXRldmVyIGxpYnJhcmllcyB5b3UmIzM5O3JlIG1vc3QgY29tZm9ydGFibGUgd2l0aCEgVGhhdCBiZWluZyBzYWlkLCBUYXVudXMgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5kb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXM8L2E+IHRoYXQgd29yayB3ZWxsIHdpdGggaXQuPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IFRhdW51cz9cXG5cXG4gICAgVGF1bnVzIGZvY3VzZXMgb24gZGVsaXZlcmluZyBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgZXhwZXJpZW5jZSB0byB0aGUgZW5kLXVzZXIsIHdoaWxlIHByb3ZpZGluZyBfYSByZWFzb25hYmxlIGRldmVsb3BtZW50IGV4cGVyaWVuY2VfIGFzIHdlbGwuICoqVGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQqKi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS5cXG5cXG4gICAgV2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgKipbdXNhYmlsaXR5XVsyXSBhbmQgcGVyZm9ybWFuY2UgYXJlIGJvdGggY29yZSBjb25jZXJucyoqIGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgKipzdGlsbCBleHBlY3RlZCB0byB3b3JrKiouXFxuXFxuICAgIEZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSBgY2xpY2tgIGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0J3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0ICoqb3VyIHNpdGVzIGRvbid0IG5lZWQgdG8gbG9vayBhbmQgYmVoYXZlIHRoZSBzYW1lIG9uIGV2ZXJ5IGJyb3dzZXIqKi4gU2ltaWxhcmx5LCBbcGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZF1bMV0gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC5cXG5cXG4gICAgV2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCBfKG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSlfIG9yIGJlY2F1c2UgdGhlIHVzZXIgYmxvY2tlZCBKYXZhU2NyaXB0LCB5b3VyIGFwcGxpY2F0aW9uIHdpbGwgc3RpbGwgd29yayFcXG5cXG4gICAgWzFdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXG4gICAgWzJdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFdoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz9cXG5cXG4gICAgTWFueSBvdGhlciBmcmFtZXdvcmtzIHdlcmVuJ3QgZGVzaWduZWQgd2l0aCBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJ3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIFtkb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgaHVtYW4tZGlnZXN0aWJsZSBjb250ZW50XVsyXS4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIFNFTyBpcyBhbHNvIGEgcHJvYmxlbS4gR29vZ2xlIGlzbid0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS5cXG5cXG4gICAgTGF0ZWx5LCB3ZSBjYW4gb2JzZXJ2ZSBtYW55IG1hdHVyZSBvcGVuLXNvdXJjZSBmcmFtZXdvcmtzIGFyZSBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQsIHdoZXJlIHRoZSBkZXZlbG9wZXIgaXMgcHV0IGZpcnN0LiAqKlRhdW51cyBpcyBbI2h1bWFuZmlyc3RdWzFdKiosIG1lYW5pbmcgdGhhdCBpdCBjb25jZWRlcyB0aGF0IGh1bWFucyBhcmUgbW9yZSBpbXBvcnRhbnQgdGhhbiB0aGUgZGV2ZWxvcGVycyBidWlsZGluZyB0aGVpciBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIFByb2dyZXNzaXZlbHkgZW5oYW5jZWQgYXBwbGljYXRpb25zIGFyZSBhbHdheXMgZ29pbmcgdG8gaGF2ZSBncmVhdCBicm93c2VyIHN1cHBvcnQgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIF8odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudClfLCBhbmQgdGhlbiBlbmhhbmNlIGl0ICoqaWYgcG9zc2libGUqKiB1c2luZyBDU1MgYW5kIEphdmFTY3JpcHQuIEJ1aWxkaW5nIGFwcGxpY2F0aW9ucyBpbiB0aGlzIHdheSBtZWFucyB0aGF0IHlvdSdsbCBiZSBhYmxlIHRvIHJlYWNoIHRoZSBtb3N0IHBlb3BsZSB3aXRoIHlvdXIgY29yZSBleHBlcmllbmNlLCBhbmQgeW91J2xsIGFsc28gYmUgYWJsZSB0byBwcm92aWRlIGh1bWFucyBpbiBtb3JlIG1vZGVybiBicm93c2VycyB3aXRoIGFsbCBvZiB0aGUgbGF0ZXN0IGZlYXR1cmVzIGFuZCB0ZWNobm9sb2dpZXMuXFxuXFxuICAgIFsxXTogaHR0cHM6Ly90d2l0dGVyLmNvbS9oYXNodGFnL2h1bWFuZmlyc3RcXG4gICAgWzJdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvc3RvcC1icmVha2luZy10aGUtd2ViXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBGZWF0dXJlc1xcblxcbiAgICBPdXQgb2YgdGhlIGJveCwgVGF1bnVzIGVuc3VyZXMgdGhhdCB5b3VyIHNpdGUgd29ya3Mgb24gYW55IEhUTUwtZW5hYmxlZCBkb2N1bWVudCB2aWV3ZXIgYW5kIGV2ZW4gdGhlIHRlcm1pbmFsLCBwcm92aWRpbmcgc3VwcG9ydCBmb3IgcGxhaW4gdGV4dCByZXNwb25zZXMgW3dpdGhvdXQgYW55IGNvbmZpZ3VyYXRpb24gbmVlZGVkXVsyXS4gRXZlbiB3aGlsZSBUYXVudXMgcHJvdmlkZXMgc2hhcmVkLXJlbmRlcmluZyBjYXBhYmlsaXRpZXMsIGl0IG9mZmVycyBjb2RlIHJldXNlIG9mIHZpZXdzIGFuZCByb3V0ZXMsIG1lYW5pbmcgeW91J2xsIG9ubHkgaGF2ZSB0byBkZWNsYXJlIHRoZXNlIG9uY2UgYnV0IHRoZXknbGwgYmUgdXNlZCBpbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBUYXVudXMgZmVhdHVyZXMgYSByZWFzb25hYmx5IGVuaGFuY2VkIGV4cGVyaWVuY2UsIHdoZXJlIGlmIGZlYXR1cmVzIGFyZW4ndCBhdmFpbGFibGUgb24gYSBicm93c2VyLCB0aGV5J3JlIGp1c3Qgbm90IHByb3ZpZGVkLiBGb3IgZXhhbXBsZSwgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBtYWtlcyB1c2Ugb2YgdGhlIGBoaXN0b3J5YCBBUEkgYnV0IGlmIHRoYXQncyBub3QgYXZhaWxhYmxlIHRoZW4gaXQnbGwgZmFsbCBiYWNrIHRvIHNpbXBseSBub3QgbWVkZGxpbmcgd2l0aCBsaW5rcyBpbnN0ZWFkIG9mIHVzaW5nIGEgY2xpZW50LXNpZGUtb25seSBoYXNoIHJvdXRlci5cXG5cXG4gICAgVGF1bnVzIGNhbiBkZWFsIHdpdGggdmlldyBjYWNoaW5nIG9uIHlvdXIgYmVoYWxmLCBpZiB5b3Ugc28gZGVzaXJlLCB1c2luZyBbYXN5bmNocm9ub3VzIGVtYmVkZGVkIGRhdGFiYXNlIHN0b3Jlc11bM10gb24gdGhlIGNsaWVudC1zaWRlLiBUdXJucyBvdXQsIHRoZXJlJ3MgW3ByZXR0eSBnb29kIGJyb3dzZXIgc3VwcG9ydCBmb3IgSW5kZXhlZERCXVs0XS4gT2YgY291cnNlLCBJbmRleGVkREIgd2lsbCBvbmx5IGJlIHVzZWQgaWYgaXQncyBhdmFpbGFibGUsIGFuZCBpZiBpdCdzIG5vdCB0aGVuIHZpZXdzIHdvbid0IGJlIGNhY2hlZCBpbiB0aGUgY2xpZW50LXNpZGUgYmVzaWRlcyBhbiBpbi1tZW1vcnkgc3RvcmUuICoqVGhlIHNpdGUgd29uJ3Qgc2ltcGx5IHJvbGwgb3ZlciBhbmQgZGllLCB0aG91Z2guKipcXG5cXG4gICAgSWYgeW91J3ZlIHR1cm5lZCBjbGllbnQtc2lkZSBjYWNoaW5nIG9uLCB0aGVuIHlvdSBjYW4gYWxzbyB0dXJuIG9uIHRoZSAqKnZpZXcgcHJlLWZldGNoaW5nIGZlYXR1cmUqKiwgd2hpY2ggd2lsbCBzdGFydCBkb3dubG9hZGluZyB2aWV3cyBhcyBzb29uIGFzIGh1bWFucyBob3ZlciBvbiBsaW5rcywgYXMgdG8gZGVsaXZlciBhIF9mYXN0ZXIgcGVyY2VpdmVkIGh1bWFuIGV4cGVyaWVuY2VfLlxcblxcbiAgICBUYXVudXMgcHJvdmlkZXMgdGhlIGJhcmUgYm9uZXMgZm9yIHlvdXIgYXBwbGljYXRpb24gc28gdGhhdCB5b3UgY2FuIHNlcGFyYXRlIGNvbmNlcm5zIGludG8gcm91dGVzLCBjb250cm9sbGVycywgbW9kZWxzLCBhbmQgdmlld3MuIFRoZW4gaXQgZ2V0cyBvdXQgb2YgdGhlIHdheSwgYnkgZGVzaWduLiBUaGVyZSBhcmUgW2EgZmV3IGNvbXBsZW1lbnRhcnkgbW9kdWxlc11bMV0geW91IGNhbiB1c2UgdG8gZW5oYW5jZSB5b3VyIGRldmVsb3BtZW50IGV4cGVyaWVuY2UsIGFzIHdlbGwuXFxuXFxuICAgIFdpdGggVGF1bnVzIHlvdSdsbCBiZSBpbiBjaGFyZ2UuIFtBcmUgeW91IHJlYWR5IHRvIGdldCBzdGFydGVkP11bMl1cXG5cXG4gICAgWzFdOiAvY29tcGxlbWVudHNcXG4gICAgWzJdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFszXTogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXG4gICAgWzRdOiBodHRwOi8vY2FuaXVzZS5jb20vI3NlYXJjaD1pbmRleGVkZGJcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEZhbWlsaWFyaXR5XFxuXFxuICAgIFlvdSBjYW4gdXNlIFRhdW51cyB0byBkZXZlbG9wIGFwcGxpY2F0aW9ucyB1c2luZyB5b3VyIGZhdm9yaXRlIE5vZGUuanMgSFRUUCBzZXJ2ZXIsICoqYm90aCBbRXhwcmVzc11bM10gYW5kIFtIYXBpXVs0XSBhcmUgZnVsbHkgc3VwcG9ydGVkKiouIEluIGJvdGggY2FzZXMsIHlvdSdsbCBbYnVpbGQgY29udHJvbGxlcnMgdGhlIHdheSB5b3UncmUgYWxyZWFkeSB1c2VkIHRvXVsxXSwgZXhjZXB0IHlvdSB3b24ndCBoYXZlIHRvIGByZXF1aXJlYCB0aGUgdmlldyBjb250cm9sbGVycyBvciBkZWZpbmUgYW55IHZpZXcgcm91dGVzIHNpbmNlIFRhdW51cyB3aWxsIGRlYWwgd2l0aCB0aGF0IG9uIHlvdXIgYmVoYWxmLiBJbiB0aGUgY29udHJvbGxlcnMgeW91J2xsIGJlIGFibGUgdG8gZG8gZXZlcnl0aGluZyB5b3UncmUgYWxyZWFkeSBhYmxlIHRvIGRvLCBhbmQgdGhlbiB5b3UnbGwgaGF2ZSB0byByZXR1cm4gYSBKU09OIG1vZGVsIHdoaWNoIHdpbGwgYmUgdXNlZCB0byByZW5kZXIgYSB2aWV3LlxcblxcbiAgICBZb3UgY2FuIHVzZSBhbnkgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgeW91IHdhbnQsIHByb3ZpZGVkIHRoYXQgaXQgY2FuIGJlIGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuIFRoYXQncyBiZWNhdXNlIFRhdW51cyB0cmVhdHMgdmlld3MgYXMgbWVyZSBKYXZhU2NyaXB0IGZ1bmN0aW9ucywgcmF0aGVyIHRoYW4gYmVpbmcgdGllZCBpbnRvIGEgc3BlY2lmaWMgdmlldy1yZW5kZXJpbmcgZW5naW5lLlxcblxcbiAgICBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUganVzdCBmdW5jdGlvbnMsIHRvby4gWW91IGNhbiBicmluZyB5b3VyIG93biBzZWxlY3RvciBlbmdpbmUsIHlvdXIgb3duIEFKQVggbGlicmFyaWVzLCBhbmQgeW91ciBvd24gZGF0YS1iaW5kaW5nIHNvbHV0aW9ucy4gSXQgbWlnaHQgbWVhbiB0aGVyZSdzIGEgYml0IG1vcmUgd29yayBpbnZvbHZlZCBmb3IgeW91LCBidXQgeW91J2xsIGFsc28gYmUgZnJlZSB0byBwaWNrIHdoYXRldmVyIGxpYnJhcmllcyB5b3UncmUgbW9zdCBjb21mb3J0YWJsZSB3aXRoISBUaGF0IGJlaW5nIHNhaWQsIFRhdW51cyBbZG9lcyByZWNvbW1lbmQgYSBmZXcgbGlicmFyaWVzXVsyXSB0aGF0IHdvcmsgd2VsbCB3aXRoIGl0LlxcblxcbiAgICBbMV06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzJdOiAvY29tcGxlbWVudHNcXG4gICAgWzNdOiBodHRwOi8vZXhwcmVzc2pzLmNvbVxcbiAgICBbNF06IGh0dHA6Ly9oYXBpanMuY29tXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwaShsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiYXBpLWRvY3VtZW50YXRpb25cXFwiPkFQSSBEb2N1bWVudGF0aW9uPC9oMT5cXG48cD5IZXJlJiMzOTtzIHRoZSBBUEkgZG9jdW1lbnRhdGlvbiBmb3IgVGF1bnVzLiBJZiB5b3UmIzM5O3ZlIG5ldmVyIHVzZWQgaXQgYmVmb3JlLCB3ZSByZWNvbW1lbmQgZ29pbmcgb3ZlciB0aGUgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9hPiBndWlkZSBiZWZvcmUganVtcGluZyBpbnRvIHRoZSBBUEkgZG9jdW1lbnRhdGlvbi4gVGhhdCB3YXksIHlvdSYjMzk7bGwgZ2V0IGEgYmV0dGVyIGlkZWEgb2Ygd2hhdCB0byBsb29rIGZvciBhbmQgaG93IHRvIHB1dCB0b2dldGhlciBzaW1wbGUgYXBwbGljYXRpb25zIHVzaW5nIFRhdW51cywgYmVmb3JlIGdvaW5nIHRocm91Z2ggZG9jdW1lbnRhdGlvbiBvbiBldmVyeSBwdWJsaWMgaW50ZXJmYWNlIHRvIFRhdW51cy48L3A+XFxuPHA+VGF1bnVzIGV4cG9zZXMgPGVtPnRocmVlIGRpZmZlcmVudCBwdWJsaWMgQVBJczwvZW0+LCBhbmQgdGhlcmUmIzM5O3MgYWxzbyA8c3Ryb25nPnBsdWdpbnMgdG8gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXI8L3N0cm9uZz4uIFRoaXMgZG9jdW1lbnQgY292ZXJzIGFsbCB0aHJlZSBBUElzIGV4dGVuc2l2ZWx5LiBJZiB5b3UmIzM5O3JlIGNvbmNlcm5lZCBhYm91dCB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgVGF1bnVzLCBwbGVhc2UgcmVmZXIgdG8gdGhlIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvYT4gZ3VpZGUuIFRoaXMgZG9jdW1lbnQgYWltcyB0byBvbmx5IGNvdmVyIGhvdyB0aGUgcHVibGljIGludGVyZmFjZSBhZmZlY3RzIGFwcGxpY2F0aW9uIHN0YXRlLCBidXQgPHN0cm9uZz5kb2VzbiYjMzk7dCBkZWx2ZSBpbnRvIGltcGxlbWVudGF0aW9uIGRldGFpbHM8L3N0cm9uZz4uPC9wPlxcbjxoMSBpZD1cXFwidGFibGUtb2YtY29udGVudHNcXFwiPlRhYmxlIG9mIENvbnRlbnRzPC9oMT5cXG48dWw+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI3NlcnZlci1zaWRlLWFwaVxcXCI+c2VydmVyLXNpZGUgQVBJPC9hPiB0aGF0IGRlYWxzIHdpdGggc2VydmVyLXNpZGUgcmVuZGVyaW5nPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudDwvY29kZT48L2E+IG1ldGhvZDx1bD5cXG48bGk+SXRzIDxhIGhyZWY9XFxcIiN0aGUtb3B0aW9ucy1vYmplY3RcXFwiPjxjb2RlPm9wdGlvbnM8L2NvZGU+PC9hPiBhcmd1bWVudDx1bD5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLWxheW91dC1cXFwiPjxjb2RlPmxheW91dDwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXJvdXRlcy1cXFwiPjxjb2RlPnJvdXRlczwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj48Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcGxhaW50ZXh0LVxcXCI+PGNvZGU+cGxhaW50ZXh0PC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+cmVzb2x2ZXJzPC9jb2RlPjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+SXRzIDxhIGhyZWY9XFxcIiMtYWRkcm91dGUtZGVmaW5pdGlvbi1cXFwiPjxjb2RlPmFkZFJvdXRlPC9jb2RlPjwvYT4gYXJndW1lbnQ8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJlbmRlci1hY3Rpb24tdmlld21vZGVsLXJlcS1yZXMtbmV4dC1cXFwiPjxjb2RlPnRhdW51cy5yZW5kZXI8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS1cXFwiPjxjb2RlPnRhdW51cy5yZWJ1aWxkRGVmYXVsdFZpZXdNb2RlbDwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5zdWl0ZSBvZiBwbHVnaW5zPC9hPiBjYW4gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXI8dWw+XFxuPGxpPlVzaW5nIDxhIGhyZWY9XFxcIiN1c2luZy10YXVudXMtZXhwcmVzcy1cXFwiPjxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPjwvYT4gZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPjwvbGk+XFxuPGxpPlVzaW5nIDxhIGhyZWY9XFxcIiN1c2luZy10YXVudXMtaGFwaS1cXFwiPjxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPjwvYT4gZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNjb21tYW5kLWxpbmUtaW50ZXJmYWNlXFxcIj5DTEkgdGhhdCBwcm9kdWNlcyBhIHdpcmluZyBtb2R1bGU8L2E+IGZvciB0aGUgY2xpZW50LXNpZGU8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLW91dHB1dC1cXFwiPjxjb2RlPi0tb3V0cHV0PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXdhdGNoLVxcXCI+PGNvZGU+LS13YXRjaDwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10cmFuc2Zvcm0tbW9kdWxlLVxcXCI+PGNvZGU+LS10cmFuc2Zvcm0gJmx0O21vZHVsZSZndDs8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtcmVzb2x2ZXJzLW1vZHVsZS1cXFwiPjxjb2RlPi0tcmVzb2x2ZXJzICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXN0YW5kYWxvbmUtXFxcIj48Y29kZT4tLXN0YW5kYWxvbmU8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI2NsaWVudC1zaWRlLWFwaVxcXCI+Y2xpZW50LXNpZGUgQVBJPC9hPiB0aGF0IGRlYWxzIHdpdGggY2xpZW50LXNpZGUgcmVuZGVyaW5nPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtY29udGFpbmVyLXdpcmluZy1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub248L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2U8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb2ZmLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub2ZmPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLWludGVyY2VwdC1hY3Rpb24tZm4tXFxcIj48Y29kZT50YXVudXMuaW50ZXJjZXB0PC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1yb3V0ZS1cXFwiPjxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW5hdmlnYXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMuc3RhdGU8L2NvZGU+PC9hPiBwcm9wZXJ0eTwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1zdGF0ZS1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZTwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiI3RoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+PGNvZGU+LnRhdW51c3JjPC9jb2RlPjwvYT4gbWFuaWZlc3Q8L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJzZXJ2ZXItc2lkZS1hcGlcXFwiPlNlcnZlci1zaWRlIEFQSTwvaDE+XFxuPHA+VGhlIHNlcnZlci1zaWRlIEFQSSBpcyB1c2VkIHRvIHNldCB1cCB0aGUgdmlldyByb3V0ZXIuIEl0IHRoZW4gZ2V0cyBvdXQgb2YgdGhlIHdheSwgYWxsb3dpbmcgdGhlIGNsaWVudC1zaWRlIHRvIGV2ZW50dWFsbHkgdGFrZSBvdmVyIGFuZCBhZGQgYW55IGV4dHJhIHN1Z2FyIG9uIHRvcCwgPGVtPmluY2x1ZGluZyBjbGllbnQtc2lkZSByZW5kZXJpbmc8L2VtPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQoYWRkUm91dGUsIG9wdGlvbnM/KTwvY29kZT48L2gyPlxcbjxwPk1vdW50cyBUYXVudXMgb24gdG9wIG9mIGEgc2VydmVyLXNpZGUgcm91dGVyLCBieSByZWdpc3RlcmluZyBlYWNoIHJvdXRlIGluIDxjb2RlPm9wdGlvbnMucm91dGVzPC9jb2RlPiB3aXRoIHRoZSA8Y29kZT5hZGRSb3V0ZTwvY29kZT4gbWV0aG9kLjwvcD5cXG48YmxvY2txdW90ZT5cXG48cD5Ob3RlIHRoYXQgbW9zdCBvZiB0aGUgdGltZSwgPHN0cm9uZz50aGlzIG1ldGhvZCBzaG91bGRuJiMzOTt0IGJlIGludm9rZWQgZGlyZWN0bHk8L3N0cm9uZz4sIGJ1dCByYXRoZXIgdGhyb3VnaCBvbmUgb2YgdGhlIDxhIGhyZWY9XFxcIiNodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5IVFRQIGZyYW1ld29yayBwbHVnaW5zPC9hPiBwcmVzZW50ZWQgYmVsb3cuPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5IZXJlJiMzOTtzIGFuIGluY29tcGxldGUgZXhhbXBsZSBvZiBob3cgdGhpcyBtZXRob2QgbWF5IGJlIHVzZWQuIEl0IGlzIGluY29tcGxldGUgYmVjYXVzZSByb3V0ZSBkZWZpbml0aW9ucyBoYXZlIG1vcmUgb3B0aW9ucyBiZXlvbmQgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiBhbmQgPGNvZGU+YWN0aW9uPC9jb2RlPiBwcm9wZXJ0aWVzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj50YXVudXMubW91bnQoYWRkUm91dGUsIHtcXG4gIHJvdXRlczogW3sgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1dXFxufSk7XFxuXFxuZnVuY3Rpb24gYWRkUm91dGUgKGRlZmluaXRpb24pIHtcXG4gIGFwcC5nZXQoZGVmaW5pdGlvbi5yb3V0ZSwgZGVmaW5pdGlvbi5hY3Rpb24pO1xcbn1cXG48L2NvZGU+PC9wcmU+XFxuPHA+TGV0JiMzOTtzIGdvIG92ZXIgdGhlIG9wdGlvbnMgeW91IGNhbiBwYXNzIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmlyc3QuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhlLW9wdGlvbnMtb2JqZWN0XFxcIj5UaGUgPGNvZGU+b3B0aW9ucz88L2NvZGU+IG9iamVjdDwvaDQ+XFxuPHA+VGhlcmUmIzM5O3MgYSBmZXcgb3B0aW9ucyB0aGF0IGNhbiBiZSBwYXNzZWQgdG8gdGhlIHNlcnZlci1zaWRlIG1vdW50cG9pbnQuIFlvdSYjMzk7cmUgcHJvYmFibHkgZ29pbmcgdG8gYmUgcGFzc2luZyB0aGVzZSB0byB5b3VyIDxhIGhyZWY9XFxcIiNodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5IVFRQIGZyYW1ld29yayBwbHVnaW48L2E+LCByYXRoZXIgdGhhbiB1c2luZyA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGRpcmVjdGx5LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLWxheW91dC1cXFwiPjxjb2RlPm9wdGlvbnMubGF5b3V0PzwvY29kZT48L2g2PlxcbjxwPlRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHByb3BlcnR5IGlzIGV4cGVjdGVkIHRvIGhhdmUgdGhlIDxjb2RlPmZ1bmN0aW9uKGRhdGEpPC9jb2RlPiBzaWduYXR1cmUuIEl0JiMzOTtsbCBiZSBpbnZva2VkIHdoZW5ldmVyIGEgZnVsbCBIVE1MIGRvY3VtZW50IG5lZWRzIHRvIGJlIHJlbmRlcmVkLCBhbmQgYSA8Y29kZT5kYXRhPC9jb2RlPiBvYmplY3Qgd2lsbCBiZSBwYXNzZWQgdG8gaXQuIFRoYXQgb2JqZWN0IHdpbGwgY29udGFpbiBldmVyeXRoaW5nIHlvdSYjMzk7dmUgc2V0IGFzIHRoZSB2aWV3IG1vZGVsLCBwbHVzIGEgPGNvZGU+cGFydGlhbDwvY29kZT4gcHJvcGVydHkgY29udGFpbmluZyB0aGUgcmF3IEhUTUwgb2YgdGhlIHJlbmRlcmVkIHBhcnRpYWwgdmlldy4gWW91ciA8Y29kZT5sYXlvdXQ8L2NvZGU+IG1ldGhvZCB3aWxsIHR5cGljYWxseSB3cmFwIHRoZSByYXcgSFRNTCBmb3IgdGhlIHBhcnRpYWwgd2l0aCB0aGUgYmFyZSBib25lcyBvZiBhbiBIVE1MIGRvY3VtZW50LiBDaGVjayBvdXQgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iLzMzMjcxNzUxMzEyZGI2ZTkyMDU5ZDk4MjkzZDBhN2FjNmU5ZThlNWIvdmlld3Mvc2VydmVyL2xheW91dC9sYXlvdXQuamFkZVxcXCI+dGhlIDxjb2RlPmxheW91dC5qYWRlPC9jb2RlPiB1c2VkIGluIFBvbnkgRm9vPC9hPiBhcyBhbiBleGFtcGxlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLXJvdXRlcy1cXFwiPjxjb2RlPm9wdGlvbnMucm91dGVzPC9jb2RlPjwvaDY+XFxuPHA+VGhlIG90aGVyIGJpZyBvcHRpb24gaXMgPGNvZGU+cm91dGVzPC9jb2RlPiwgd2hpY2ggZXhwZWN0cyBhIGNvbGxlY3Rpb24gb2Ygcm91dGUgZGVmaW5pdGlvbnMuIFJvdXRlIGRlZmluaXRpb25zIHVzZSBhIG51bWJlciBvZiBwcm9wZXJ0aWVzIHRvIGRldGVybWluZSBob3cgdGhlIHJvdXRlIGlzIGdvaW5nIHRvIGJlaGF2ZS48L3A+XFxuPHA+SGVyZSYjMzk7cyBhbiBleGFtcGxlIHJvdXRlIHRoYXQgdXNlcyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IHJvdXRpbmcgc2NoZW1lLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj57XFxuICByb3V0ZTogJiMzOTsvYXJ0aWNsZXMvOnNsdWcmIzM5OyxcXG4gIGFjdGlvbjogJiMzOTthcnRpY2xlcy9hcnRpY2xlJiMzOTssXFxuICBpZ25vcmU6IGZhbHNlLFxcbiAgY2FjaGU6ICZsdDtpbmhlcml0Jmd0O1xcbn1cXG48L2NvZGU+PC9wcmU+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gaXMgYSByb3V0ZSBpbiB0aGUgZm9ybWF0IHlvdXIgSFRUUCBmcmFtZXdvcmsgb2YgY2hvaWNlIHVuZGVyc3RhbmRzPC9saT5cXG48bGk+PGNvZGU+YWN0aW9uPC9jb2RlPiBpcyB0aGUgbmFtZSBvZiB5b3VyIGNvbnRyb2xsZXIgYWN0aW9uLiBJdCYjMzk7bGwgYmUgdXNlZCB0byBmaW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLCB0aGUgZGVmYXVsdCB2aWV3IHRoYXQgc2hvdWxkIGJlIHVzZWQgd2l0aCB0aGlzIHJvdXRlLCBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXI8L2xpPlxcbjxsaT48Y29kZT5jYWNoZTwvY29kZT4gY2FuIGJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGJlaGF2aW9yIGluIHRoaXMgYXBwbGljYXRpb24gcGF0aCwgYW5kIGl0JiMzOTtsbCBkZWZhdWx0IHRvIGluaGVyaXRpbmcgZnJvbSB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiA8ZW0+b24gdGhlIGNsaWVudC1zaWRlPC9lbT48L2xpPlxcbjxsaT48Y29kZT5pZ25vcmU8L2NvZGU+IGlzIHVzZWQgaW4gdGhvc2UgY2FzZXMgd2hlcmUgeW91IHdhbnQgYSBVUkwgdG8gYmUgaWdub3JlZCBieSB0aGUgY2xpZW50LXNpZGUgcm91dGVyIGV2ZW4gaWYgdGhlcmUmIzM5O3MgYSBjYXRjaC1hbGwgcm91dGUgdGhhdCB3b3VsZCBtYXRjaCB0aGF0IFVSTDwvbGk+XFxuPC91bD5cXG48cD5BcyBhbiBleGFtcGxlIG9mIHRoZSA8Y29kZT5pZ25vcmU8L2NvZGU+IHVzZSBjYXNlLCBjb25zaWRlciB0aGUgcm91dGluZyB0YWJsZSBzaG93biBiZWxvdy4gVGhlIGNsaWVudC1zaWRlIHJvdXRlciBkb2VzbiYjMzk7dCBrbm93IDxlbT4oYW5kIGNhbiYjMzk7dCBrbm93IHVubGVzcyB5b3UgcG9pbnQgaXQgb3V0KTwvZW0+IHdoYXQgcm91dGVzIGFyZSBzZXJ2ZXItc2lkZSBvbmx5LCBhbmQgaXQmIzM5O3MgdXAgdG8geW91IHRvIHBvaW50IHRob3NlIG91dC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+W1xcbiAgeyByb3V0ZTogJiMzOTsvJiMzOTssIGFjdGlvbjogJiMzOTsvaG9tZS9pbmRleCYjMzk7IH0sXFxuICB7IHJvdXRlOiAmIzM5Oy9mZWVkJiMzOTssIGlnbm9yZTogdHJ1ZSB9LFxcbiAgeyByb3V0ZTogJiMzOTsvKiYjMzk7LCBhY3Rpb246ICYjMzk7ZXJyb3Ivbm90LWZvdW5kJiMzOTsgfVxcbl1cXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhpcyBzdGVwIGlzIG5lY2Vzc2FyeSB3aGVuZXZlciB5b3UgaGF2ZSBhbiBhbmNob3IgbGluayBwb2ludGVkIGF0IHNvbWV0aGluZyBsaWtlIGFuIFJTUyBmZWVkLiBUaGUgPGNvZGU+aWdub3JlPC9jb2RlPiBwcm9wZXJ0eSBpcyBlZmZlY3RpdmVseSB0ZWxsaW5nIHRoZSBjbGllbnQtc2lkZSA8ZW0+JnF1b3Q7ZG9uJiMzOTt0IGhpamFjayBsaW5rcyBjb250YWluaW5nIHRoaXMgVVJMJnF1b3Q7PC9lbT4uPC9wPlxcbjxwPlBsZWFzZSBub3RlIHRoYXQgZXh0ZXJuYWwgbGlua3MgYXJlIG5ldmVyIGhpamFja2VkLiBPbmx5IHNhbWUtb3JpZ2luIGxpbmtzIGNvbnRhaW5pbmcgYSBVUkwgdGhhdCBtYXRjaGVzIG9uZSBvZiB0aGUgcm91dGVzIHdpbGwgYmUgaGlqYWNrZWQgYnkgVGF1bnVzLiBFeHRlcm5hbCBsaW5rcyBkb24mIzM5O3QgbmVlZCB0byBiZSA8Y29kZT5pZ25vcmU8L2NvZGU+ZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLVxcXCI+PGNvZGU+b3B0aW9ucy5nZXREZWZhdWx0Vmlld01vZGVsPzwvY29kZT48L2g2PlxcbjxwPlRoZSA8Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsKGRvbmUpPC9jb2RlPiBwcm9wZXJ0eSBjYW4gYmUgYSBtZXRob2QgdGhhdCBwdXRzIHRvZ2V0aGVyIHRoZSBiYXNlIHZpZXcgbW9kZWwsIHdoaWNoIHdpbGwgdGhlbiBiZSBleHRlbmRlZCBvbiBhbiBhY3Rpb24tYnktYWN0aW9uIGJhc2lzLiBXaGVuIHlvdSYjMzk7cmUgZG9uZSBjcmVhdGluZyBhIHZpZXcgbW9kZWwsIHlvdSBjYW4gaW52b2tlIDxjb2RlPmRvbmUobnVsbCwgbW9kZWwpPC9jb2RlPi4gSWYgYW4gZXJyb3Igb2NjdXJzIHdoaWxlIGJ1aWxkaW5nIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGNhbGwgPGNvZGU+ZG9uZShlcnIpPC9jb2RlPiBpbnN0ZWFkLjwvcD5cXG48cD5UYXVudXMgd2lsbCB0aHJvdyBhbiBlcnJvciBpZiA8Y29kZT5kb25lPC9jb2RlPiBpcyBpbnZva2VkIHdpdGggYW4gZXJyb3IsIHNvIHlvdSBtaWdodCB3YW50IHRvIHB1dCBzYWZlZ3VhcmRzIGluIHBsYWNlIGFzIHRvIGF2b2lkIHRoYXQgZnJvbSBoYXBwZW5uaW5nLiBUaGUgcmVhc29uIHRoaXMgbWV0aG9kIGlzIGFzeW5jaHJvbm91cyBpcyBiZWNhdXNlIHlvdSBtYXkgbmVlZCBkYXRhYmFzZSBhY2Nlc3Mgb3Igc29tZXN1Y2ggd2hlbiBwdXR0aW5nIHRvZ2V0aGVyIHRoZSBkZWZhdWx0cy4gVGhlIHJlYXNvbiB0aGlzIGlzIGEgbWV0aG9kIGFuZCBub3QganVzdCBhbiBvYmplY3QgaXMgdGhhdCB0aGUgZGVmYXVsdHMgbWF5IGNoYW5nZSBkdWUgdG8gaHVtYW4gaW50ZXJhY3Rpb24gd2l0aCB0aGUgYXBwbGljYXRpb24sIGFuZCBpbiB0aG9zZSBjYXNlcyA8YSBocmVmPVxcXCIjdGF1bnVzLXJlYnVpbGRkZWZhdWx0dmlld21vZGVsXFxcIj50aGUgZGVmYXVsdHMgY2FuIGJlIHJlYnVpbHQ8L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLXBsYWludGV4dC1cXFwiPjxjb2RlPm9wdGlvbnMucGxhaW50ZXh0PzwvY29kZT48L2g2PlxcbjxwPlRoZSA8Y29kZT5wbGFpbnRleHQ8L2NvZGU+IG9wdGlvbnMgb2JqZWN0IGlzIHBhc3NlZCBkaXJlY3RseSB0byA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvaGdldFxcXCI+aGdldDwvYT4sIGFuZCBpdCYjMzk7cyB1c2VkIHRvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi9mNmQ2YjUwNjhmZjAzYTM4N2Y1MDM5MDAxNjBkOWZkYzFlNzQ5NzUwL2NvbnRyb2xsZXJzL3JvdXRpbmcuanMjTDcwLUw3MlxcXCI+dHdlYWsgdGhlIHBsYWludGV4dCB2ZXJzaW9uPC9hPiBvZiB5b3VyIHNpdGUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+b3B0aW9ucy5yZXNvbHZlcnM/PC9jb2RlPjwvaDY+XFxuPHA+UmVzb2x2ZXJzIGFyZSB1c2VkIHRvIGRldGVybWluZSB0aGUgbG9jYXRpb24gb2Ygc29tZSBvZiB0aGUgZGlmZmVyZW50IHBpZWNlcyBvZiB5b3VyIGFwcGxpY2F0aW9uLiBUeXBpY2FsbHkgeW91IHdvbiYjMzk7dCBoYXZlIHRvIHRvdWNoIHRoZXNlIGluIHRoZSBzbGlnaHRlc3QuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5TaWduYXR1cmU8L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPmdldFNlcnZlckNvbnRyb2xsZXIoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byBzZXJ2ZXItc2lkZSBjb250cm9sbGVyIGFjdGlvbiBoYW5kbGVyIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPmdldFZpZXcoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+VGhlIDxjb2RlPmFkZFJvdXRlPC9jb2RlPiBtZXRob2QgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gb24gdGhlIHNlcnZlci1zaWRlIGlzIG1vc3RseSBnb2luZyB0byBiZSB1c2VkIGludGVybmFsbHkgYnkgdGhlIEhUVFAgZnJhbWV3b3JrIHBsdWdpbnMsIHNvIGZlZWwgZnJlZSB0byBza2lwIG92ZXIgdGhlIGZvbGxvd2luZyBzZWN0aW9uLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcIi1hZGRyb3V0ZS1kZWZpbml0aW9uLVxcXCI+PGNvZGU+YWRkUm91dGUoZGVmaW5pdGlvbik8L2NvZGU+PC9oND5cXG48cD5UaGUgPGNvZGU+YWRkUm91dGUoZGVmaW5pdGlvbik8L2NvZGU+IG1ldGhvZCB3aWxsIGJlIHBhc3NlZCBhIHJvdXRlIGRlZmluaXRpb24sIGNvbnRhaW5pbmcgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzLiBUaGlzIG1ldGhvZCBpcyBleHBlY3RlZCB0byByZWdpc3RlciBhIHJvdXRlIGluIHlvdXIgSFRUUCBmcmFtZXdvcmsmIzM5O3Mgcm91dGVyLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBpcyB0aGUgcm91dGUgdGhhdCB5b3Ugc2V0IGFzIDxjb2RlPmRlZmluaXRpb24ucm91dGU8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+YWN0aW9uPC9jb2RlPiBpcyB0aGUgYWN0aW9uIGFzIHBhc3NlZCB0byB0aGUgcm91dGUgZGVmaW5pdGlvbjwvbGk+XFxuPGxpPjxjb2RlPmFjdGlvbkZuPC9jb2RlPiB3aWxsIGJlIHRoZSBjb250cm9sbGVyIGZvciB0aGlzIGFjdGlvbiBtZXRob2Q8L2xpPlxcbjxsaT48Y29kZT5taWRkbGV3YXJlPC9jb2RlPiB3aWxsIGJlIGFuIGFycmF5IG9mIG1ldGhvZHMgdG8gYmUgZXhlY3V0ZWQgYmVmb3JlIDxjb2RlPmFjdGlvbkZuPC9jb2RlPjwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LVxcXCI+PGNvZGU+dGF1bnVzLnJlbmRlcihhY3Rpb24sIHZpZXdNb2RlbCwgcmVxLCByZXMsIG5leHQpPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgaXMgYWxtb3N0IGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBhcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIFRhdW51cyB0aHJvdWdoIG9uZSBvZiB0aGUgcGx1Z2lucyBhbnl3YXlzLCBzbyB3ZSB3b24mIzM5O3QgZ28gdmVyeSBkZWVwIGludG8gaXQuPC9wPlxcbjxwPlRoZSByZW5kZXIgbWV0aG9kIGlzIHdoYXQgVGF1bnVzIHVzZXMgdG8gcmVuZGVyIHZpZXdzIGJ5IGNvbnN0cnVjdGluZyBIVE1MLCBKU09OLCBvciBwbGFpbnRleHQgcmVzcG9uc2VzLiBUaGUgPGNvZGU+YWN0aW9uPC9jb2RlPiBwcm9wZXJ0eSBkZXRlcm1pbmVzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCB3aWxsIGJlIHJlbmRlcmVkLiBUaGUgPGNvZGU+dmlld01vZGVsPC9jb2RlPiB3aWxsIGJlIGV4dGVuZGVkIGJ5IDxhIGhyZWY9XFxcIiMtb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLVxcXCI+dGhlIGRlZmF1bHQgdmlldyBtb2RlbDwvYT4sIGFuZCBpdCBtYXkgYWxzbyBvdmVycmlkZSB0aGUgZGVmYXVsdCA8Y29kZT5hY3Rpb248L2NvZGU+IGJ5IHNldHRpbmcgPGNvZGU+dmlld01vZGVsLm1vZGVsLmFjdGlvbjwvY29kZT4uPC9wPlxcbjxwPlRoZSA8Y29kZT5yZXE8L2NvZGU+LCA8Y29kZT5yZXM8L2NvZGU+LCBhbmQgPGNvZGU+bmV4dDwvY29kZT4gYXJndW1lbnRzIGFyZSBleHBlY3RlZCB0byBiZSB0aGUgRXhwcmVzcyByb3V0aW5nIGFyZ3VtZW50cywgYnV0IHRoZXkgY2FuIGFsc28gYmUgbW9ja2VkIDxlbT4od2hpY2ggaXMgaW4gZmFjdCB3aGF0IHRoZSBIYXBpIHBsdWdpbiBkb2VzKTwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS1cXFwiPjxjb2RlPnRhdW51cy5yZWJ1aWxkRGVmYXVsdFZpZXdNb2RlbChkb25lPyk8L2NvZGU+PC9oMj5cXG48cD5PbmNlIFRhdW51cyBoYXMgYmVlbiBtb3VudGVkLCBjYWxsaW5nIHRoaXMgbWV0aG9kIHdpbGwgcmVidWlsZCB0aGUgdmlldyBtb2RlbCBkZWZhdWx0cyB1c2luZyB0aGUgPGNvZGU+Z2V0RGVmYXVsdFZpZXdNb2RlbDwvY29kZT4gdGhhdCB3YXMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gaW4gdGhlIG9wdGlvbnMuIEFuIG9wdGlvbmFsIDxjb2RlPmRvbmU8L2NvZGU+IGNhbGxiYWNrIHdpbGwgYmUgaW52b2tlZCB3aGVuIHRoZSBtb2RlbCBpcyByZWJ1aWx0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImh0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgRnJhbWV3b3JrIFBsdWdpbnM8L2gxPlxcbjxwPlRoZXJlJiMzOTtzIGN1cnJlbnRseSB0d28gZGlmZmVyZW50IEhUVFAgZnJhbWV3b3JrcyA8ZW0+KDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBhbmQgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+KTwvZW0+IHRoYXQgeW91IGNhbiByZWFkaWx5IHVzZSB3aXRoIFRhdW51cyB3aXRob3V0IGhhdmluZyB0byBkZWFsIHdpdGggYW55IG9mIHRoZSByb3V0ZSBwbHVtYmluZyB5b3Vyc2VsZi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCJ1c2luZy10YXVudXMtZXhwcmVzcy1cXFwiPlVzaW5nIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPjwvaDI+XFxuPHA+VGhlIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiBwbHVnaW4gaXMgcHJvYmFibHkgdGhlIGVhc2llc3QgdG8gdXNlLCBhcyBUYXVudXMgd2FzIG9yaWdpbmFsbHkgZGV2ZWxvcGVkIHdpdGgganVzdCA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gaW4gbWluZC4gSW4gYWRkaXRpb24gdG8gdGhlIG9wdGlvbnMgYWxyZWFkeSBvdXRsaW5lZCBmb3IgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPnRhdW51cy5tb3VudDwvYT4sIHlvdSBjYW4gYWRkIG1pZGRsZXdhcmUgZm9yIGFueSByb3V0ZSBpbmRpdmlkdWFsbHkuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+bWlkZGxld2FyZTwvY29kZT4gYXJlIGFueSBtZXRob2RzIHlvdSB3YW50IFRhdW51cyB0byBleGVjdXRlIGFzIG1pZGRsZXdhcmUgaW4gRXhwcmVzcyBhcHBsaWNhdGlvbnM8L2xpPlxcbjwvdWw+XFxuPHA+VG8gZ2V0IDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIHByb3ZpZGVkIHRoYXQgeW91IGNvbWUgdXAgd2l0aCBhbiA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIC8vIC4uLlxcbn07XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBtZXRob2Qgd2lsbCBtZXJlbHkgc2V0IHVwIFRhdW51cyBhbmQgYWRkIHRoZSByZWxldmFudCByb3V0ZXMgdG8geW91ciBFeHByZXNzIGFwcGxpY2F0aW9uIGJ5IGNhbGxpbmcgPGNvZGU+YXBwLmdldDwvY29kZT4gYSBidW5jaCBvZiB0aW1lcy4gWW91IGNhbiA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxcIj5maW5kIHRhdW51cy1leHByZXNzIG9uIEdpdEh1YjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwidXNpbmctdGF1bnVzLWhhcGktXFxcIj5Vc2luZyA8Y29kZT50YXVudXMtaGFwaTwvY29kZT48L2gyPlxcbjxwPlRoZSA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4gcGx1Z2luIGlzIGEgYml0IG1vcmUgaW52b2x2ZWQsIGFuZCB5b3UmIzM5O2xsIGhhdmUgdG8gY3JlYXRlIGEgUGFjayBpbiBvcmRlciB0byB1c2UgaXQuIEluIGFkZGl0aW9uIHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj50aGUgb3B0aW9ucyB3ZSYjMzk7dmUgYWxyZWFkeSBjb3ZlcmVkPC9hPiwgeW91IGNhbiBhZGQgPGNvZGU+Y29uZmlnPC9jb2RlPiBvbiBhbnkgcm91dGUuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+Y29uZmlnPC9jb2RlPiBpcyBwYXNzZWQgZGlyZWN0bHkgaW50byB0aGUgcm91dGUgcmVnaXN0ZXJlZCB3aXRoIEhhcGksIGdpdmluZyB5b3UgdGhlIG1vc3QgZmxleGliaWxpdHk8L2xpPlxcbjwvdWw+XFxuPHA+VG8gZ2V0IDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPiBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIGFuZCB5b3UgY2FuIGJyaW5nIHlvdXIgb3duIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+dmFyIEhhcGkgPSByZXF1aXJlKCYjMzk7aGFwaSYjMzk7KTtcXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzSGFwaSA9IHJlcXVpcmUoJiMzOTt0YXVudXMtaGFwaSYjMzk7KSh0YXVudXMpO1xcbnZhciBwYWNrID0gbmV3IEhhcGkuUGFjaygpO1xcblxcbnBhY2sucmVnaXN0ZXIoe1xcbiAgcGx1Z2luOiB0YXVudXNIYXBpLFxcbiAgb3B0aW9uczoge1xcbiAgICAvLyAuLi5cXG4gIH1cXG59KTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPnRhdW51c0hhcGk8L2NvZGU+IHBsdWdpbiB3aWxsIG1vdW50IFRhdW51cyBhbmQgcmVnaXN0ZXIgYWxsIG9mIHRoZSBuZWNlc3Nhcnkgcm91dGVzLiBZb3UgY2FuIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPmZpbmQgdGF1bnVzLWhhcGkgb24gR2l0SHViPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJjb21tYW5kLWxpbmUtaW50ZXJmYWNlXFxcIj5Db21tYW5kLUxpbmUgSW50ZXJmYWNlPC9oMT5cXG48cD5PbmNlIHlvdSYjMzk7dmUgc2V0IHVwIHRoZSBzZXJ2ZXItc2lkZSB0byByZW5kZXIgeW91ciB2aWV3cyB1c2luZyBUYXVudXMsIGl0JiMzOTtzIG9ubHkgbG9naWNhbCB0aGF0IHlvdSYjMzk7bGwgd2FudCB0byByZW5kZXIgdGhlIHZpZXdzIGluIHRoZSBjbGllbnQtc2lkZSBhcyB3ZWxsLCBlZmZlY3RpdmVseSBjb252ZXJ0aW5nIHlvdXIgYXBwbGljYXRpb24gaW50byBhIHNpbmdsZS1wYWdlIGFwcGxpY2F0aW9uIGFmdGVyIHRoZSBmaXJzdCB2aWV3IGhhcyBiZWVuIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS48L3A+XFxuPHA+VGhlIFRhdW51cyBDTEkgaXMgYW4gdXNlZnVsIGludGVybWVkaWFyeSBpbiB0aGUgcHJvY2VzcyBvZiBnZXR0aW5nIHRoZSBjb25maWd1cmF0aW9uIHlvdSB3cm90ZSBzbyBmYXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSB0byBhbHNvIHdvcmsgd2VsbCBpbiB0aGUgY2xpZW50LXNpZGUuPC9wPlxcbjxwPkluc3RhbGwgaXQgZ2xvYmFsbHkgZm9yIGRldmVsb3BtZW50LCBidXQgcmVtZW1iZXIgdG8gdXNlIGxvY2FsIGNvcGllcyBmb3IgcHJvZHVjdGlvbi1ncmFkZSB1c2VzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtZyB0YXVudXNcXG48L2NvZGU+PC9wcmU+XFxuPHA+V2hlbiBpbnZva2VkIHdpdGhvdXQgYW55IGFyZ3VtZW50cywgdGhlIENMSSB3aWxsIHNpbXBseSBmb2xsb3cgdGhlIGRlZmF1bHQgY29udmVudGlvbnMgdG8gZmluZCB5b3VyIHJvdXRlIGRlZmluaXRpb25zLCB2aWV3cywgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXNcXG48L2NvZGU+PC9wcmU+XFxuPHA+QnkgZGVmYXVsdCwgdGhlIG91dHB1dCB3aWxsIGJlIHByaW50ZWQgdG8gdGhlIHN0YW5kYXJkIG91dHB1dCwgbWFraW5nIGZvciBhIGZhc3QgZGVidWdnaW5nIGV4cGVyaWVuY2UuIEhlcmUmIzM5O3MgdGhlIG91dHB1dCBpZiB5b3UganVzdCBoYWQgYSBzaW5nbGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gcm91dGUsIGFuZCB0aGUgbWF0Y2hpbmcgdmlldyBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlciBleGlzdGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGVtcGxhdGVzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuL3ZpZXdzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciBjb250cm9sbGVycyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li4vY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciByb3V0ZXMgPSB7XFxuICAmIzM5Oy8mIzM5Ozoge1xcbiAgICBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7XFxuICB9XFxufTtcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IHtcXG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxcbiAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgcm91dGVzOiByb3V0ZXNcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5Zb3UgY2FuIHVzZSBhIGZldyBvcHRpb25zIHRvIGFsdGVyIHRoZSBvdXRjb21lIG9mIGludm9raW5nIDxjb2RlPnRhdW51czwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLW91dHB1dC1cXFwiPjxjb2RlPi0tb3V0cHV0PC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LW88L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5PdXRwdXQgaXMgd3JpdHRlbiB0byBhIGZpbGUgaW5zdGVhZCBvZiB0byBzdGFuZGFyZCBvdXRwdXQuIFRoZSBmaWxlIHBhdGggdXNlZCB3aWxsIGJlIHRoZSA8Y29kZT5jbGllbnRfd2lyaW5nPC9jb2RlPiBvcHRpb24gaW4gPGEgaHJlZj1cXFwiI3RoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+PGNvZGU+LnRhdW51c3JjPC9jb2RlPjwvYT4sIHdoaWNoIGRlZmF1bHRzIHRvIDxjb2RlPiYjMzk7LmJpbi93aXJpbmcuanMmIzM5OzwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXdhdGNoLVxcXCI+PGNvZGU+LS13YXRjaDwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi13PC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+V2hlbmV2ZXIgYSBzZXJ2ZXItc2lkZSByb3V0ZSBkZWZpbml0aW9uIGNoYW5nZXMsIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCBhZ2FpbiB0byBlaXRoZXIgc3RhbmRhcmQgb3V0cHV0IG9yIGEgZmlsZSwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IHdhcyB1c2VkLjwvcD5cXG48cD5UaGUgcHJvZ3JhbSB3b24mIzM5O3QgZXhpdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdHJhbnNmb3JtLW1vZHVsZS1cXFwiPjxjb2RlPi0tdHJhbnNmb3JtICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXQ8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5UaGlzIGZsYWcgYWxsb3dzIHlvdSB0byB0cmFuc2Zvcm0gc2VydmVyLXNpZGUgcm91dGVzIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSB1bmRlcnN0YW5kcy4gRXhwcmVzcyByb3V0ZXMgYXJlIGNvbXBsZXRlbHkgY29tcGF0aWJsZSB3aXRoIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIsIGJ1dCBIYXBpIHJvdXRlcyBuZWVkIHRvIGJlIHRyYW5zZm9ybWVkIHVzaW5nIHRoZSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2hhcGlpZnlcXFwiPjxjb2RlPmhhcGlpZnk8L2NvZGU+PC9hPiBtb2R1bGUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIGhhcGlpZnlcXG50YXVudXMgLXQgaGFwaWlmeVxcbjwvY29kZT48L3ByZT5cXG48cD5Vc2luZyB0aGlzIHRyYW5zZm9ybSByZWxpZXZlcyB5b3UgZnJvbSBoYXZpbmcgdG8gZGVmaW5lIHRoZSBzYW1lIHJvdXRlcyB0d2ljZSB1c2luZyBzbGlnaHRseSBkaWZmZXJlbnQgZm9ybWF0cyB0aGF0IGNvbnZleSB0aGUgc2FtZSBtZWFuaW5nLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi1yZXNvbHZlcnMtbW9kdWxlLVxcXCI+PGNvZGU+LS1yZXNvbHZlcnMgJmx0O21vZHVsZSZndDs8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tcjwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPlNpbWlsYXJseSB0byB0aGUgPGEgaHJlZj1cXFwiIy1vcHRpb25zLXJlc29sdmVycy1cXFwiPjxjb2RlPnJlc29sdmVyczwvY29kZT48L2E+IG9wdGlvbiB0aGF0IHlvdSBjYW4gcGFzcyB0byA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvYT4sIHRoZXNlIHJlc29sdmVycyBjYW4gY2hhbmdlIHRoZSB3YXkgaW4gd2hpY2ggZmlsZSBwYXRocyBhcmUgcmVzb2x2ZWQuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5TaWduYXR1cmU8L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPmdldENsaWVudENvbnRyb2xsZXIoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byBjbGllbnQtc2lkZSBjb250cm9sbGVyIGFjdGlvbiBoYW5kbGVyIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPmdldFZpZXcoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItc3RhbmRhbG9uZS1cXFwiPjxjb2RlPi0tc3RhbmRhbG9uZTwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1zPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+VW5kZXIgdGhpcyBleHBlcmltZW50YWwgZmxhZywgdGhlIENMSSB3aWxsIHVzZSBCcm93c2VyaWZ5IHRvIGNvbXBpbGUgYSBzdGFuZGFsb25lIG1vZHVsZSB0aGF0IGluY2x1ZGVzIHRoZSB3aXJpbmcgbm9ybWFsbHkgZXhwb3J0ZWQgYnkgdGhlIENMSSBwbHVzIGFsbCBvZiBUYXVudXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3VtZGpzL3VtZFxcXCI+YXMgYSBVTUQgbW9kdWxlPC9hPi48L3A+XFxuPHA+VGhpcyB3b3VsZCBhbGxvdyB5b3UgdG8gdXNlIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgZXZlbiBpZiB5b3UgZG9uJiMzOTt0IHdhbnQgdG8gdXNlIDxhIGhyZWY9XFxcImh0dHA6Ly9icm93c2VyaWZ5Lm9yZ1xcXCI+QnJvd3NlcmlmeTwvYT4gZGlyZWN0bHkuPC9wPlxcbjxwPkZlZWRiYWNrIGFuZCBzdWdnZXN0aW9ucyBhYm91dCB0aGlzIGZsYWcsIDxlbT5hbmQgcG9zc2libGUgYWx0ZXJuYXRpdmVzIHRoYXQgd291bGQgbWFrZSBUYXVudXMgZWFzaWVyIHRvIHVzZTwvZW0+LCBhcmUgd2VsY29tZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJjbGllbnQtc2lkZS1hcGlcXFwiPkNsaWVudC1zaWRlIEFQSTwvaDE+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW1vdW50LWNvbnRhaW5lci13aXJpbmctb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucyk8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtb24tdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vbih0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2UodHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9mZi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9mZih0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtaW50ZXJjZXB0LWFjdGlvbi1mbi1cXFwiPjxjb2RlPnRhdW51cy5pbnRlcmNlcHQoYWN0aW9uLCBmbik8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLXJvdXRlLVxcXCI+PGNvZGU+dGF1bnVzLnBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSk8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbmF2aWdhdGUtdXJsLVxcXCI+PGNvZGU+dGF1bnVzLm5hdmlnYXRlKHVybCk8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcm91dGUtdXJsLVxcXCI+PGNvZGU+dGF1bnVzLnJvdXRlKHVybCk8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtc3RhdGUtXFxcIj48Y29kZT50YXVudXMuc3RhdGU8L2NvZGU+PC9oMj5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+VGhlIDxjb2RlPi50YXVudXNyYzwvY29kZT4gbWFuaWZlc3Q8L2gxPlxcbjxwPklmIHlvdSB3YW50IHRvIHVzZSB2YWx1ZXMgb3RoZXIgdGhhbiB0aGUgY29udmVudGlvbmFsIGRlZmF1bHRzIHNob3duIGluIHRoZSB0YWJsZSBiZWxvdywgdGhlbiB5b3Ugc2hvdWxkIGNyZWF0ZSBhIDxjb2RlPi50YXVudXNyYzwvY29kZT4gZmlsZS4gTm90ZSB0aGF0IHRoZSBkZWZhdWx0cyBuZWVkIHRvIGJlIG92ZXJ3cml0dGVuIGluIGEgY2FzZS1ieS1jYXNlIGJhc2lzLiBUaGVzZSBvcHRpb25zIGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgaW4geW91ciA8Y29kZT5wYWNrYWdlLmpzb248L2NvZGU+LCB1bmRlciB0aGUgPGNvZGU+dGF1bnVzPC9jb2RlPiBwcm9wZXJ0eS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc29uXFxcIj57XFxuICAmcXVvdDt2aWV3cyZxdW90OzogJnF1b3Q7LmJpbi92aWV3cyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9yb3V0ZXMmcXVvdDs6ICZxdW90O2NvbnRyb2xsZXJzL3JvdXRlcy5qcyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9jb250cm9sbGVycyZxdW90OzogJnF1b3Q7Y29udHJvbGxlcnMmcXVvdDssXFxuICAmcXVvdDtjbGllbnRfY29udHJvbGxlcnMmcXVvdDs6ICZxdW90O2NsaWVudC9qcy9jb250cm9sbGVycyZxdW90OyxcXG4gICZxdW90O2NsaWVudF93aXJpbmcmcXVvdDs6ICZxdW90Oy5iaW4vd2lyaW5nLmpzJnF1b3Q7XFxufVxcbjwvY29kZT48L3ByZT5cXG48dWw+XFxuPGxpPlRoZSA8Y29kZT52aWV3czwvY29kZT4gZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgdmlld3MgPGVtPihhbHJlYWR5IGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCk8L2VtPiBhcmUgcGxhY2VkLiBUaGVzZSB2aWV3cyBhcmUgdXNlZCBkaXJlY3RseSBvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9yb3V0ZXM8L2NvZGU+IGZpbGUgaXMgdGhlIG1vZHVsZSB3aGVyZSB5b3UgZXhwb3J0IGEgY29sbGVjdGlvbiBvZiByb3V0ZXMuIFRoZSBDTEkgd2lsbCBwdWxsIHRoZXNlIHJvdXRlcyB3aGVuIGNyZWF0aW5nIHRoZSBjbGllbnQtc2lkZSByb3V0ZXMgZm9yIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9jb250cm9sbGVyczwvY29kZT4gZGlyZWN0b3J5IGlzIHRoZSByb290IGRpcmVjdG9yeSB3aGVyZSB5b3VyIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGxpdmUuIEl0JiMzOTtzIHVzZWQgd2hlbiBzZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZSByb3V0ZXI8L2xpPlxcbjxsaT5UaGUgPGNvZGU+Y2xpZW50X2NvbnRyb2xsZXJzPC9jb2RlPiBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciBjbGllbnQtc2lkZSBjb250cm9sbGVyIG1vZHVsZXMgbGl2ZS4gVGhlIENMSSB3aWxsIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZXNlIGNvbnRyb2xsZXJzIGluIGl0cyByZXN1bHRpbmcgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPlRoZSA8Y29kZT5jbGllbnRfd2lyaW5nPC9jb2RlPiBmaWxlIGlzIHdoZXJlIHlvdXIgd2lyaW5nIG1vZHVsZSB3aWxsIGJlIHBsYWNlZCBieSB0aGUgQ0xJLiBZb3UmIzM5O2xsIHRoZW4gaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiBpdCBpbiB5b3VyIGFwcGxpY2F0aW9uIHdoZW4gYm9vdGluZyB1cCBUYXVudXM8L2xpPlxcbjwvdWw+XFxuPHA+SGVyZSBpcyB3aGVyZSB0aGluZ3MgZ2V0IDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmEgbGl0dGxlIGNvbnZlbnRpb25hbDwvYT4uIFZpZXdzLCBhbmQgYm90aCBzZXJ2ZXItc2lkZSBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4cGVjdGVkIHRvIGJlIG9yZ2FuaXplZCBieSBmb2xsb3dpbmcgdGhlIDxjb2RlPntyb290fS97Y29udHJvbGxlcn0ve2FjdGlvbn08L2NvZGU+IHBhdHRlcm4sIGJ1dCB5b3UgY291bGQgY2hhbmdlIHRoYXQgdXNpbmcgPGNvZGU+cmVzb2x2ZXJzPC9jb2RlPiB3aGVuIGludm9raW5nIHRoZSBDTEkgYW5kIHVzaW5nIHRoZSBzZXJ2ZXItc2lkZSBBUEkuPC9wPlxcbjxwPlZpZXdzIGFuZCBjb250cm9sbGVycyBhcmUgYWxzbyBleHBlY3RlZCB0byBiZSBDb21tb25KUyBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIG1ldGhvZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBBUEkgRG9jdW1lbnRhdGlvblxcblxcbiAgICBIZXJlJ3MgdGhlIEFQSSBkb2N1bWVudGF0aW9uIGZvciBUYXVudXMuIElmIHlvdSd2ZSBuZXZlciB1c2VkIGl0IGJlZm9yZSwgd2UgcmVjb21tZW5kIGdvaW5nIG92ZXIgdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlIGJlZm9yZSBqdW1waW5nIGludG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uLiBUaGF0IHdheSwgeW91J2xsIGdldCBhIGJldHRlciBpZGVhIG9mIHdoYXQgdG8gbG9vayBmb3IgYW5kIGhvdyB0byBwdXQgdG9nZXRoZXIgc2ltcGxlIGFwcGxpY2F0aW9ucyB1c2luZyBUYXVudXMsIGJlZm9yZSBnb2luZyB0aHJvdWdoIGRvY3VtZW50YXRpb24gb24gZXZlcnkgcHVibGljIGludGVyZmFjZSB0byBUYXVudXMuXFxuXFxuICAgIFRhdW51cyBleHBvc2VzIF90aHJlZSBkaWZmZXJlbnQgcHVibGljIEFQSXNfLCBhbmQgdGhlcmUncyBhbHNvICoqcGx1Z2lucyB0byBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcioqLiBUaGlzIGRvY3VtZW50IGNvdmVycyBhbGwgdGhyZWUgQVBJcyBleHRlbnNpdmVseS4gSWYgeW91J3JlIGNvbmNlcm5lZCBhYm91dCB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgVGF1bnVzLCBwbGVhc2UgcmVmZXIgdG8gdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlLiBUaGlzIGRvY3VtZW50IGFpbXMgdG8gb25seSBjb3ZlciBob3cgdGhlIHB1YmxpYyBpbnRlcmZhY2UgYWZmZWN0cyBhcHBsaWNhdGlvbiBzdGF0ZSwgYnV0ICoqZG9lc24ndCBkZWx2ZSBpbnRvIGltcGxlbWVudGF0aW9uIGRldGFpbHMqKi5cXG5cXG4gICAgIyBUYWJsZSBvZiBDb250ZW50c1xcblxcbiAgICAtIEEgW3NlcnZlci1zaWRlIEFQSV0oI3NlcnZlci1zaWRlLWFwaSkgdGhhdCBkZWFscyB3aXRoIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm1vdW50YF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgICAgLSBJdHMgW2BvcHRpb25zYF0oI3RoZS1vcHRpb25zLW9iamVjdCkgYXJndW1lbnRcXG4gICAgICAgICAgLSBbYGxheW91dGBdKCMtb3B0aW9ucy1sYXlvdXQtKVxcbiAgICAgICAgICAtIFtgcm91dGVzYF0oIy1vcHRpb25zLXJvdXRlcy0pXFxuICAgICAgICAgIC0gW2BnZXREZWZhdWx0Vmlld01vZGVsYF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKVxcbiAgICAgICAgICAtIFtgcGxhaW50ZXh0YF0oIy1vcHRpb25zLXBsYWludGV4dC0pXFxuICAgICAgICAgIC0gW2ByZXNvbHZlcnNgXSgjLW9wdGlvbnMtcmVzb2x2ZXJzLSlcXG4gICAgICAgIC0gSXRzIFtgYWRkUm91dGVgXSgjLWFkZHJvdXRlLWRlZmluaXRpb24tKSBhcmd1bWVudFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlbmRlcmBdKCMtdGF1bnVzLXJlbmRlci1hY3Rpb24tdmlld21vZGVsLXJlcS1yZXMtbmV4dC0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsYF0oIy10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS0pIG1ldGhvZFxcbiAgICAtIEEgW3N1aXRlIG9mIHBsdWdpbnNdKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSBjYW4gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXJcXG4gICAgICAtIFVzaW5nIFtgdGF1bnVzLWV4cHJlc3NgXSgjdXNpbmctdGF1bnVzLWV4cHJlc3MtKSBmb3IgW0V4cHJlc3NdWzJdXFxuICAgICAgLSBVc2luZyBbYHRhdW51cy1oYXBpYF0oI3VzaW5nLXRhdW51cy1oYXBpLSkgZm9yIFtIYXBpXVszXVxcbiAgICAtIEEgW0NMSSB0aGF0IHByb2R1Y2VzIGEgd2lyaW5nIG1vZHVsZV0oI2NvbW1hbmQtbGluZS1pbnRlcmZhY2UpIGZvciB0aGUgY2xpZW50LXNpZGVcXG4gICAgICAtIFRoZSBbYC0tb3V0cHV0YF0oIy1vdXRwdXQtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXdhdGNoYF0oIy13YXRjaC0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0tdHJhbnNmb3JtIDxtb2R1bGU+YF0oIy10cmFuc2Zvcm0tbW9kdWxlLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS1yZXNvbHZlcnMgPG1vZHVsZT5gXSgjLXJlc29sdmVycy1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXN0YW5kYWxvbmVgXSgjLXN0YW5kYWxvbmUtKSBmbGFnXFxuICAgIC0gQSBbY2xpZW50LXNpZGUgQVBJXSgjY2xpZW50LXNpZGUtYXBpKSB0aGF0IGRlYWxzIHdpdGggY2xpZW50LXNpZGUgcmVuZGVyaW5nXFxuICAgICAgLSBUaGUgW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5vbmBdKCMtdGF1bnVzLW9uLXR5cGUtZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5vbmNlYF0oIy10YXVudXMtb25jZS10eXBlLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMub2ZmYF0oIy10YXVudXMtb2ZmLXR5cGUtZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5pbnRlcmNlcHRgXSgjLXRhdW51cy1pbnRlcmNlcHQtYWN0aW9uLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMucGFydGlhbGBdKCMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1yb3V0ZS0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm5hdmlnYXRlYF0oIy10YXVudXMtbmF2aWdhdGUtdXJsLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMuc3RhdGVgXSgjLXRhdW51cy1yb3V0ZS11cmwtKSBwcm9wZXJ0eVxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJvdXRlYF0oIy10YXVudXMtc3RhdGUtKSBtZXRob2RcXG4gICAgLSBUaGUgW2AudGF1bnVzcmNgXSgjdGhlLXRhdW51c3JjLW1hbmlmZXN0KSBtYW5pZmVzdFxcblxcbiAgICAjIFNlcnZlci1zaWRlIEFQSVxcblxcbiAgICBUaGUgc2VydmVyLXNpZGUgQVBJIGlzIHVzZWQgdG8gc2V0IHVwIHRoZSB2aWV3IHJvdXRlci4gSXQgdGhlbiBnZXRzIG91dCBvZiB0aGUgd2F5LCBhbGxvd2luZyB0aGUgY2xpZW50LXNpZGUgdG8gZXZlbnR1YWxseSB0YWtlIG92ZXIgYW5kIGFkZCBhbnkgZXh0cmEgc3VnYXIgb24gdG9wLCBfaW5jbHVkaW5nIGNsaWVudC1zaWRlIHJlbmRlcmluZ18uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMubW91bnQoYWRkUm91dGUsIG9wdGlvbnM/KWBcXG5cXG4gICAgTW91bnRzIFRhdW51cyBvbiB0b3Agb2YgYSBzZXJ2ZXItc2lkZSByb3V0ZXIsIGJ5IHJlZ2lzdGVyaW5nIGVhY2ggcm91dGUgaW4gYG9wdGlvbnMucm91dGVzYCB3aXRoIHRoZSBgYWRkUm91dGVgIG1ldGhvZC5cXG5cXG4gICAgPiBOb3RlIHRoYXQgbW9zdCBvZiB0aGUgdGltZSwgKip0aGlzIG1ldGhvZCBzaG91bGRuJ3QgYmUgaW52b2tlZCBkaXJlY3RseSoqLCBidXQgcmF0aGVyIHRocm91Z2ggb25lIG9mIHRoZSBbSFRUUCBmcmFtZXdvcmsgcGx1Z2luc10oI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnMpIHByZXNlbnRlZCBiZWxvdy5cXG5cXG4gICAgSGVyZSdzIGFuIGluY29tcGxldGUgZXhhbXBsZSBvZiBob3cgdGhpcyBtZXRob2QgbWF5IGJlIHVzZWQuIEl0IGlzIGluY29tcGxldGUgYmVjYXVzZSByb3V0ZSBkZWZpbml0aW9ucyBoYXZlIG1vcmUgb3B0aW9ucyBiZXlvbmQgdGhlIGByb3V0ZWAgYW5kIGBhY3Rpb25gIHByb3BlcnRpZXMuXFxuXFxuICAgIGBgYGpzXFxuICAgIHRhdW51cy5tb3VudChhZGRSb3V0ZSwge1xcbiAgICAgIHJvdXRlczogW3sgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfV1cXG4gICAgfSk7XFxuXFxuICAgIGZ1bmN0aW9uIGFkZFJvdXRlIChkZWZpbml0aW9uKSB7XFxuICAgICAgYXBwLmdldChkZWZpbml0aW9uLnJvdXRlLCBkZWZpbml0aW9uLmFjdGlvbik7XFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIExldCdzIGdvIG92ZXIgdGhlIG9wdGlvbnMgeW91IGNhbiBwYXNzIHRvIGB0YXVudXMubW91bnRgIGZpcnN0LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFRoZSBgb3B0aW9ucz9gIG9iamVjdFxcblxcbiAgICBUaGVyZSdzIGEgZmV3IG9wdGlvbnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIHRoZSBzZXJ2ZXItc2lkZSBtb3VudHBvaW50LiBZb3UncmUgcHJvYmFibHkgZ29pbmcgdG8gYmUgcGFzc2luZyB0aGVzZSB0byB5b3VyIFtIVFRQIGZyYW1ld29yayBwbHVnaW5dKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSwgcmF0aGVyIHRoYW4gdXNpbmcgYHRhdW51cy5tb3VudGAgZGlyZWN0bHkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5sYXlvdXQ/YFxcblxcbiAgICBUaGUgYGxheW91dGAgcHJvcGVydHkgaXMgZXhwZWN0ZWQgdG8gaGF2ZSB0aGUgYGZ1bmN0aW9uKGRhdGEpYCBzaWduYXR1cmUuIEl0J2xsIGJlIGludm9rZWQgd2hlbmV2ZXIgYSBmdWxsIEhUTUwgZG9jdW1lbnQgbmVlZHMgdG8gYmUgcmVuZGVyZWQsIGFuZCBhIGBkYXRhYCBvYmplY3Qgd2lsbCBiZSBwYXNzZWQgdG8gaXQuIFRoYXQgb2JqZWN0IHdpbGwgY29udGFpbiBldmVyeXRoaW5nIHlvdSd2ZSBzZXQgYXMgdGhlIHZpZXcgbW9kZWwsIHBsdXMgYSBgcGFydGlhbGAgcHJvcGVydHkgY29udGFpbmluZyB0aGUgcmF3IEhUTUwgb2YgdGhlIHJlbmRlcmVkIHBhcnRpYWwgdmlldy4gWW91ciBgbGF5b3V0YCBtZXRob2Qgd2lsbCB0eXBpY2FsbHkgd3JhcCB0aGUgcmF3IEhUTUwgZm9yIHRoZSBwYXJ0aWFsIHdpdGggdGhlIGJhcmUgYm9uZXMgb2YgYW4gSFRNTCBkb2N1bWVudC4gQ2hlY2sgb3V0IFt0aGUgYGxheW91dC5qYWRlYCB1c2VkIGluIFBvbnkgRm9vXVs0XSBhcyBhbiBleGFtcGxlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucm91dGVzYFxcblxcbiAgICBUaGUgb3RoZXIgYmlnIG9wdGlvbiBpcyBgcm91dGVzYCwgd2hpY2ggZXhwZWN0cyBhIGNvbGxlY3Rpb24gb2Ygcm91dGUgZGVmaW5pdGlvbnMuIFJvdXRlIGRlZmluaXRpb25zIHVzZSBhIG51bWJlciBvZiBwcm9wZXJ0aWVzIHRvIGRldGVybWluZSBob3cgdGhlIHJvdXRlIGlzIGdvaW5nIHRvIGJlaGF2ZS5cXG5cXG4gICAgSGVyZSdzIGFuIGV4YW1wbGUgcm91dGUgdGhhdCB1c2VzIHRoZSBbRXhwcmVzc11bMl0gcm91dGluZyBzY2hlbWUuXFxuXFxuICAgIGBgYGpzXFxuICAgIHtcXG4gICAgICByb3V0ZTogJy9hcnRpY2xlcy86c2x1ZycsXFxuICAgICAgYWN0aW9uOiAnYXJ0aWNsZXMvYXJ0aWNsZScsXFxuICAgICAgaWdub3JlOiBmYWxzZSxcXG4gICAgICBjYWNoZTogPGluaGVyaXQ+XFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIC0gYHJvdXRlYCBpcyBhIHJvdXRlIGluIHRoZSBmb3JtYXQgeW91ciBIVFRQIGZyYW1ld29yayBvZiBjaG9pY2UgdW5kZXJzdGFuZHNcXG4gICAgLSBgYWN0aW9uYCBpcyB0aGUgbmFtZSBvZiB5b3VyIGNvbnRyb2xsZXIgYWN0aW9uLiBJdCdsbCBiZSB1c2VkIHRvIGZpbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCBzaG91bGQgYmUgdXNlZCB3aXRoIHRoaXMgcm91dGUsIGFuZCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlclxcbiAgICAtIGBjYWNoZWAgY2FuIGJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGJlaGF2aW9yIGluIHRoaXMgYXBwbGljYXRpb24gcGF0aCwgYW5kIGl0J2xsIGRlZmF1bHQgdG8gaW5oZXJpdGluZyBmcm9tIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBfb24gdGhlIGNsaWVudC1zaWRlX1xcbiAgICAtIGBpZ25vcmVgIGlzIHVzZWQgaW4gdGhvc2UgY2FzZXMgd2hlcmUgeW91IHdhbnQgYSBVUkwgdG8gYmUgaWdub3JlZCBieSB0aGUgY2xpZW50LXNpZGUgcm91dGVyIGV2ZW4gaWYgdGhlcmUncyBhIGNhdGNoLWFsbCByb3V0ZSB0aGF0IHdvdWxkIG1hdGNoIHRoYXQgVVJMXFxuXFxuICAgIEFzIGFuIGV4YW1wbGUgb2YgdGhlIGBpZ25vcmVgIHVzZSBjYXNlLCBjb25zaWRlciB0aGUgcm91dGluZyB0YWJsZSBzaG93biBiZWxvdy4gVGhlIGNsaWVudC1zaWRlIHJvdXRlciBkb2Vzbid0IGtub3cgXyhhbmQgY2FuJ3Qga25vdyB1bmxlc3MgeW91IHBvaW50IGl0IG91dClfIHdoYXQgcm91dGVzIGFyZSBzZXJ2ZXItc2lkZSBvbmx5LCBhbmQgaXQncyB1cCB0byB5b3UgdG8gcG9pbnQgdGhvc2Ugb3V0LlxcblxcbiAgICBgYGBqc1xcbiAgICBbXFxuICAgICAgeyByb3V0ZTogJy8nLCBhY3Rpb246ICcvaG9tZS9pbmRleCcgfSxcXG4gICAgICB7IHJvdXRlOiAnL2ZlZWQnLCBpZ25vcmU6IHRydWUgfSxcXG4gICAgICB7IHJvdXRlOiAnLyonLCBhY3Rpb246ICdlcnJvci9ub3QtZm91bmQnIH1cXG4gICAgXVxcbiAgICBgYGBcXG5cXG4gICAgVGhpcyBzdGVwIGlzIG5lY2Vzc2FyeSB3aGVuZXZlciB5b3UgaGF2ZSBhbiBhbmNob3IgbGluayBwb2ludGVkIGF0IHNvbWV0aGluZyBsaWtlIGFuIFJTUyBmZWVkLiBUaGUgYGlnbm9yZWAgcHJvcGVydHkgaXMgZWZmZWN0aXZlbHkgdGVsbGluZyB0aGUgY2xpZW50LXNpZGUgX1xcXCJkb24ndCBoaWphY2sgbGlua3MgY29udGFpbmluZyB0aGlzIFVSTFxcXCJfLlxcblxcbiAgICBQbGVhc2Ugbm90ZSB0aGF0IGV4dGVybmFsIGxpbmtzIGFyZSBuZXZlciBoaWphY2tlZC4gT25seSBzYW1lLW9yaWdpbiBsaW5rcyBjb250YWluaW5nIGEgVVJMIHRoYXQgbWF0Y2hlcyBvbmUgb2YgdGhlIHJvdXRlcyB3aWxsIGJlIGhpamFja2VkIGJ5IFRhdW51cy4gRXh0ZXJuYWwgbGlua3MgZG9uJ3QgbmVlZCB0byBiZSBgaWdub3JlYGQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5nZXREZWZhdWx0Vmlld01vZGVsP2BcXG5cXG4gICAgVGhlIGBnZXREZWZhdWx0Vmlld01vZGVsKGRvbmUpYCBwcm9wZXJ0eSBjYW4gYmUgYSBtZXRob2QgdGhhdCBwdXRzIHRvZ2V0aGVyIHRoZSBiYXNlIHZpZXcgbW9kZWwsIHdoaWNoIHdpbGwgdGhlbiBiZSBleHRlbmRlZCBvbiBhbiBhY3Rpb24tYnktYWN0aW9uIGJhc2lzLiBXaGVuIHlvdSdyZSBkb25lIGNyZWF0aW5nIGEgdmlldyBtb2RlbCwgeW91IGNhbiBpbnZva2UgYGRvbmUobnVsbCwgbW9kZWwpYC4gSWYgYW4gZXJyb3Igb2NjdXJzIHdoaWxlIGJ1aWxkaW5nIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGNhbGwgYGRvbmUoZXJyKWAgaW5zdGVhZC5cXG5cXG4gICAgVGF1bnVzIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgYGRvbmVgIGlzIGludm9rZWQgd2l0aCBhbiBlcnJvciwgc28geW91IG1pZ2h0IHdhbnQgdG8gcHV0IHNhZmVndWFyZHMgaW4gcGxhY2UgYXMgdG8gYXZvaWQgdGhhdCBmcm9tIGhhcHBlbm5pbmcuIFRoZSByZWFzb24gdGhpcyBtZXRob2QgaXMgYXN5bmNocm9ub3VzIGlzIGJlY2F1c2UgeW91IG1heSBuZWVkIGRhdGFiYXNlIGFjY2VzcyBvciBzb21lc3VjaCB3aGVuIHB1dHRpbmcgdG9nZXRoZXIgdGhlIGRlZmF1bHRzLiBUaGUgcmVhc29uIHRoaXMgaXMgYSBtZXRob2QgYW5kIG5vdCBqdXN0IGFuIG9iamVjdCBpcyB0aGF0IHRoZSBkZWZhdWx0cyBtYXkgY2hhbmdlIGR1ZSB0byBodW1hbiBpbnRlcmFjdGlvbiB3aXRoIHRoZSBhcHBsaWNhdGlvbiwgYW5kIGluIHRob3NlIGNhc2VzIFt0aGUgZGVmYXVsdHMgY2FuIGJlIHJlYnVpbHRdKCN0YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwpLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucGxhaW50ZXh0P2BcXG5cXG4gICAgVGhlIGBwbGFpbnRleHRgIG9wdGlvbnMgb2JqZWN0IGlzIHBhc3NlZCBkaXJlY3RseSB0byBbaGdldF1bNV0sIGFuZCBpdCdzIHVzZWQgdG8gW3R3ZWFrIHRoZSBwbGFpbnRleHQgdmVyc2lvbl1bNl0gb2YgeW91ciBzaXRlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucmVzb2x2ZXJzP2BcXG5cXG4gICAgUmVzb2x2ZXJzIGFyZSB1c2VkIHRvIGRldGVybWluZSB0aGUgbG9jYXRpb24gb2Ygc29tZSBvZiB0aGUgZGlmZmVyZW50IHBpZWNlcyBvZiB5b3VyIGFwcGxpY2F0aW9uLiBUeXBpY2FsbHkgeW91IHdvbid0IGhhdmUgdG8gdG91Y2ggdGhlc2UgaW4gdGhlIHNsaWdodGVzdC5cXG5cXG4gICAgU2lnbmF0dXJlICAgICAgICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBnZXRTZXJ2ZXJDb250cm9sbGVyKGFjdGlvbilgIHwgUmV0dXJuIHBhdGggdG8gc2VydmVyLXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGVcXG4gICAgYGdldFZpZXcoYWN0aW9uKWAgICAgICAgICAgICAgfCBSZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZVxcblxcbiAgICBUaGUgYGFkZFJvdXRlYCBtZXRob2QgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgIG9uIHRoZSBzZXJ2ZXItc2lkZSBpcyBtb3N0bHkgZ29pbmcgdG8gYmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBIVFRQIGZyYW1ld29yayBwbHVnaW5zLCBzbyBmZWVsIGZyZWUgdG8gc2tpcCBvdmVyIHRoZSBmb2xsb3dpbmcgc2VjdGlvbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBgYWRkUm91dGUoZGVmaW5pdGlvbilgXFxuXFxuICAgIFRoZSBgYWRkUm91dGUoZGVmaW5pdGlvbilgIG1ldGhvZCB3aWxsIGJlIHBhc3NlZCBhIHJvdXRlIGRlZmluaXRpb24sIGNvbnRhaW5pbmcgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzLiBUaGlzIG1ldGhvZCBpcyBleHBlY3RlZCB0byByZWdpc3RlciBhIHJvdXRlIGluIHlvdXIgSFRUUCBmcmFtZXdvcmsncyByb3V0ZXIuXFxuXFxuICAgIC0gYHJvdXRlYCBpcyB0aGUgcm91dGUgdGhhdCB5b3Ugc2V0IGFzIGBkZWZpbml0aW9uLnJvdXRlYFxcbiAgICAtIGBhY3Rpb25gIGlzIHRoZSBhY3Rpb24gYXMgcGFzc2VkIHRvIHRoZSByb3V0ZSBkZWZpbml0aW9uXFxuICAgIC0gYGFjdGlvbkZuYCB3aWxsIGJlIHRoZSBjb250cm9sbGVyIGZvciB0aGlzIGFjdGlvbiBtZXRob2RcXG4gICAgLSBgbWlkZGxld2FyZWAgd2lsbCBiZSBhbiBhcnJheSBvZiBtZXRob2RzIHRvIGJlIGV4ZWN1dGVkIGJlZm9yZSBgYWN0aW9uRm5gXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucmVuZGVyKGFjdGlvbiwgdmlld01vZGVsLCByZXEsIHJlcywgbmV4dClgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGlzIGFsbW9zdCBhbiBpbXBsZW1lbnRhdGlvbiBkZXRhaWwgYXMgeW91IHNob3VsZCBiZSB1c2luZyBUYXVudXMgdGhyb3VnaCBvbmUgb2YgdGhlIHBsdWdpbnMgYW55d2F5cywgc28gd2Ugd29uJ3QgZ28gdmVyeSBkZWVwIGludG8gaXQuXFxuXFxuICAgIFRoZSByZW5kZXIgbWV0aG9kIGlzIHdoYXQgVGF1bnVzIHVzZXMgdG8gcmVuZGVyIHZpZXdzIGJ5IGNvbnN0cnVjdGluZyBIVE1MLCBKU09OLCBvciBwbGFpbnRleHQgcmVzcG9uc2VzLiBUaGUgYGFjdGlvbmAgcHJvcGVydHkgZGV0ZXJtaW5lcyB0aGUgZGVmYXVsdCB2aWV3IHRoYXQgd2lsbCBiZSByZW5kZXJlZC4gVGhlIGB2aWV3TW9kZWxgIHdpbGwgYmUgZXh0ZW5kZWQgYnkgW3RoZSBkZWZhdWx0IHZpZXcgbW9kZWxdKCMtb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLSksIGFuZCBpdCBtYXkgYWxzbyBvdmVycmlkZSB0aGUgZGVmYXVsdCBgYWN0aW9uYCBieSBzZXR0aW5nIGB2aWV3TW9kZWwubW9kZWwuYWN0aW9uYC5cXG5cXG4gICAgVGhlIGByZXFgLCBgcmVzYCwgYW5kIGBuZXh0YCBhcmd1bWVudHMgYXJlIGV4cGVjdGVkIHRvIGJlIHRoZSBFeHByZXNzIHJvdXRpbmcgYXJndW1lbnRzLCBidXQgdGhleSBjYW4gYWxzbyBiZSBtb2NrZWQgXyh3aGljaCBpcyBpbiBmYWN0IHdoYXQgdGhlIEhhcGkgcGx1Z2luIGRvZXMpXy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5yZWJ1aWxkRGVmYXVsdFZpZXdNb2RlbChkb25lPylgXFxuXFxuICAgIE9uY2UgVGF1bnVzIGhhcyBiZWVuIG1vdW50ZWQsIGNhbGxpbmcgdGhpcyBtZXRob2Qgd2lsbCByZWJ1aWxkIHRoZSB2aWV3IG1vZGVsIGRlZmF1bHRzIHVzaW5nIHRoZSBgZ2V0RGVmYXVsdFZpZXdNb2RlbGAgdGhhdCB3YXMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgIGluIHRoZSBvcHRpb25zLiBBbiBvcHRpb25hbCBgZG9uZWAgY2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gdGhlIG1vZGVsIGlzIHJlYnVpbHQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgSFRUUCBGcmFtZXdvcmsgUGx1Z2luc1xcblxcbiAgICBUaGVyZSdzIGN1cnJlbnRseSB0d28gZGlmZmVyZW50IEhUVFAgZnJhbWV3b3JrcyBfKFtFeHByZXNzXVsyXSBhbmQgW0hhcGldWzNdKV8gdGhhdCB5b3UgY2FuIHJlYWRpbHkgdXNlIHdpdGggVGF1bnVzIHdpdGhvdXQgaGF2aW5nIHRvIGRlYWwgd2l0aCBhbnkgb2YgdGhlIHJvdXRlIHBsdW1iaW5nIHlvdXJzZWxmLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBVc2luZyBgdGF1bnVzLWV4cHJlc3NgXFxuXFxuICAgIFRoZSBgdGF1bnVzLWV4cHJlc3NgIHBsdWdpbiBpcyBwcm9iYWJseSB0aGUgZWFzaWVzdCB0byB1c2UsIGFzIFRhdW51cyB3YXMgb3JpZ2luYWxseSBkZXZlbG9wZWQgd2l0aCBqdXN0IFtFeHByZXNzXVsyXSBpbiBtaW5kLiBJbiBhZGRpdGlvbiB0byB0aGUgb3B0aW9ucyBhbHJlYWR5IG91dGxpbmVkIGZvciBbdGF1bnVzLm1vdW50XSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSksIHlvdSBjYW4gYWRkIG1pZGRsZXdhcmUgZm9yIGFueSByb3V0ZSBpbmRpdmlkdWFsbHkuXFxuXFxuICAgIC0gYG1pZGRsZXdhcmVgIGFyZSBhbnkgbWV0aG9kcyB5b3Ugd2FudCBUYXVudXMgdG8gZXhlY3V0ZSBhcyBtaWRkbGV3YXJlIGluIEV4cHJlc3MgYXBwbGljYXRpb25zXFxuXFxuICAgIFRvIGdldCBgdGF1bnVzLWV4cHJlc3NgIGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgcHJvdmlkZWQgdGhhdCB5b3UgY29tZSB1cCB3aXRoIGFuIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgLy8gLi4uXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGB0YXVudXNFeHByZXNzYCBtZXRob2Qgd2lsbCBtZXJlbHkgc2V0IHVwIFRhdW51cyBhbmQgYWRkIHRoZSByZWxldmFudCByb3V0ZXMgdG8geW91ciBFeHByZXNzIGFwcGxpY2F0aW9uIGJ5IGNhbGxpbmcgYGFwcC5nZXRgIGEgYnVuY2ggb2YgdGltZXMuIFlvdSBjYW4gW2ZpbmQgdGF1bnVzLWV4cHJlc3Mgb24gR2l0SHViXVs3XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgVXNpbmcgYHRhdW51cy1oYXBpYFxcblxcbiAgICBUaGUgYHRhdW51cy1oYXBpYCBwbHVnaW4gaXMgYSBiaXQgbW9yZSBpbnZvbHZlZCwgYW5kIHlvdSdsbCBoYXZlIHRvIGNyZWF0ZSBhIFBhY2sgaW4gb3JkZXIgdG8gdXNlIGl0LiBJbiBhZGRpdGlvbiB0byBbdGhlIG9wdGlvbnMgd2UndmUgYWxyZWFkeSBjb3ZlcmVkXSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSksIHlvdSBjYW4gYWRkIGBjb25maWdgIG9uIGFueSByb3V0ZS5cXG5cXG4gICAgLSBgY29uZmlnYCBpcyBwYXNzZWQgZGlyZWN0bHkgaW50byB0aGUgcm91dGUgcmVnaXN0ZXJlZCB3aXRoIEhhcGksIGdpdmluZyB5b3UgdGhlIG1vc3QgZmxleGliaWxpdHlcXG5cXG4gICAgVG8gZ2V0IGB0YXVudXMtaGFwaWAgZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBhbmQgeW91IGNhbiBicmluZyB5b3VyIG93biBgb3B0aW9uc2Agb2JqZWN0LlxcblxcbiAgICBgYGBqc1xcbiAgICB2YXIgSGFwaSA9IHJlcXVpcmUoJ2hhcGknKTtcXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzSGFwaSA9IHJlcXVpcmUoJ3RhdW51cy1oYXBpJykodGF1bnVzKTtcXG4gICAgdmFyIHBhY2sgPSBuZXcgSGFwaS5QYWNrKCk7XFxuXFxuICAgIHBhY2sucmVnaXN0ZXIoe1xcbiAgICAgIHBsdWdpbjogdGF1bnVzSGFwaSxcXG4gICAgICBvcHRpb25zOiB7XFxuICAgICAgICAvLyAuLi5cXG4gICAgICB9XFxuICAgIH0pO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGB0YXVudXNIYXBpYCBwbHVnaW4gd2lsbCBtb3VudCBUYXVudXMgYW5kIHJlZ2lzdGVyIGFsbCBvZiB0aGUgbmVjZXNzYXJ5IHJvdXRlcy4gWW91IGNhbiBbZmluZCB0YXVudXMtaGFwaSBvbiBHaXRIdWJdWzhdLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIENvbW1hbmQtTGluZSBJbnRlcmZhY2VcXG5cXG4gICAgT25jZSB5b3UndmUgc2V0IHVwIHRoZSBzZXJ2ZXItc2lkZSB0byByZW5kZXIgeW91ciB2aWV3cyB1c2luZyBUYXVudXMsIGl0J3Mgb25seSBsb2dpY2FsIHRoYXQgeW91J2xsIHdhbnQgdG8gcmVuZGVyIHRoZSB2aWV3cyBpbiB0aGUgY2xpZW50LXNpZGUgYXMgd2VsbCwgZWZmZWN0aXZlbHkgY29udmVydGluZyB5b3VyIGFwcGxpY2F0aW9uIGludG8gYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbiBhZnRlciB0aGUgZmlyc3QgdmlldyBoYXMgYmVlbiByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuXFxuXFxuICAgIFRoZSBUYXVudXMgQ0xJIGlzIGFuIHVzZWZ1bCBpbnRlcm1lZGlhcnkgaW4gdGhlIHByb2Nlc3Mgb2YgZ2V0dGluZyB0aGUgY29uZmlndXJhdGlvbiB5b3Ugd3JvdGUgc28gZmFyIGZvciB0aGUgc2VydmVyLXNpZGUgdG8gYWxzbyB3b3JrIHdlbGwgaW4gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJbnN0YWxsIGl0IGdsb2JhbGx5IGZvciBkZXZlbG9wbWVudCwgYnV0IHJlbWVtYmVyIHRvIHVzZSBsb2NhbCBjb3BpZXMgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgdXNlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLWcgdGF1bnVzXFxuICAgIGBgYFxcblxcbiAgICBXaGVuIGludm9rZWQgd2l0aG91dCBhbnkgYXJndW1lbnRzLCB0aGUgQ0xJIHdpbGwgc2ltcGx5IGZvbGxvdyB0aGUgZGVmYXVsdCBjb252ZW50aW9ucyB0byBmaW5kIHlvdXIgcm91dGUgZGVmaW5pdGlvbnMsIHZpZXdzLCBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgQnkgZGVmYXVsdCwgdGhlIG91dHB1dCB3aWxsIGJlIHByaW50ZWQgdG8gdGhlIHN0YW5kYXJkIG91dHB1dCwgbWFraW5nIGZvciBhIGZhc3QgZGVidWdnaW5nIGV4cGVyaWVuY2UuIEhlcmUncyB0aGUgb3V0cHV0IGlmIHlvdSBqdXN0IGhhZCBhIHNpbmdsZSBgaG9tZS9pbmRleGAgcm91dGUsIGFuZCB0aGUgbWF0Y2hpbmcgdmlldyBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlciBleGlzdGVkLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0ZW1wbGF0ZXMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuL3ZpZXdzL2hvbWUvaW5kZXguanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgY29udHJvbGxlcnMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciByb3V0ZXMgPSB7XFxuICAgICAgJy8nOiB7XFxuICAgICAgICBhY3Rpb246ICdob21lL2luZGV4J1xcbiAgICAgIH1cXG4gICAgfTtcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XFxuICAgICAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICAgICAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgICAgIHJvdXRlczogcm91dGVzXFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBZb3UgY2FuIHVzZSBhIGZldyBvcHRpb25zIHRvIGFsdGVyIHRoZSBvdXRjb21lIG9mIGludm9raW5nIGB0YXVudXNgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS1vdXRwdXRgXFxuXFxuICAgIDxzdWI+dGhlIGAtb2AgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIE91dHB1dCBpcyB3cml0dGVuIHRvIGEgZmlsZSBpbnN0ZWFkIG9mIHRvIHN0YW5kYXJkIG91dHB1dC4gVGhlIGZpbGUgcGF0aCB1c2VkIHdpbGwgYmUgdGhlIGBjbGllbnRfd2lyaW5nYCBvcHRpb24gaW4gW2AudGF1bnVzcmNgXSgjdGhlLXRhdW51c3JjLW1hbmlmZXN0KSwgd2hpY2ggZGVmYXVsdHMgdG8gYCcuYmluL3dpcmluZy5qcydgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS13YXRjaGBcXG5cXG4gICAgPHN1Yj50aGUgYC13YCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgV2hlbmV2ZXIgYSBzZXJ2ZXItc2lkZSByb3V0ZSBkZWZpbml0aW9uIGNoYW5nZXMsIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCBhZ2FpbiB0byBlaXRoZXIgc3RhbmRhcmQgb3V0cHV0IG9yIGEgZmlsZSwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgYC0tb3V0cHV0YCB3YXMgdXNlZC5cXG5cXG4gICAgVGhlIHByb2dyYW0gd29uJ3QgZXhpdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tdHJhbnNmb3JtIDxtb2R1bGU+YFxcblxcbiAgICA8c3ViPnRoZSBgLXRgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBUaGlzIGZsYWcgYWxsb3dzIHlvdSB0byB0cmFuc2Zvcm0gc2VydmVyLXNpZGUgcm91dGVzIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSB1bmRlcnN0YW5kcy4gRXhwcmVzcyByb3V0ZXMgYXJlIGNvbXBsZXRlbHkgY29tcGF0aWJsZSB3aXRoIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIsIGJ1dCBIYXBpIHJvdXRlcyBuZWVkIHRvIGJlIHRyYW5zZm9ybWVkIHVzaW5nIHRoZSBbYGhhcGlpZnlgXVs5XSBtb2R1bGUuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIGhhcGlpZnlcXG4gICAgdGF1bnVzIC10IGhhcGlpZnlcXG4gICAgYGBgXFxuXFxuICAgIFVzaW5nIHRoaXMgdHJhbnNmb3JtIHJlbGlldmVzIHlvdSBmcm9tIGhhdmluZyB0byBkZWZpbmUgdGhlIHNhbWUgcm91dGVzIHR3aWNlIHVzaW5nIHNsaWdodGx5IGRpZmZlcmVudCBmb3JtYXRzIHRoYXQgY29udmV5IHRoZSBzYW1lIG1lYW5pbmcuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXJlc29sdmVycyA8bW9kdWxlPmBcXG5cXG4gICAgPHN1Yj50aGUgYC1yYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgU2ltaWxhcmx5IHRvIHRoZSBbYHJlc29sdmVyc2BdKCMtb3B0aW9ucy1yZXNvbHZlcnMtKSBvcHRpb24gdGhhdCB5b3UgY2FuIHBhc3MgdG8gW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSksIHRoZXNlIHJlc29sdmVycyBjYW4gY2hhbmdlIHRoZSB3YXkgaW4gd2hpY2ggZmlsZSBwYXRocyBhcmUgcmVzb2x2ZWQuXFxuXFxuICAgIFNpZ25hdHVyZSAgICAgICAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgZ2V0Q2xpZW50Q29udHJvbGxlcihhY3Rpb24pYCB8IFJldHVybiBwYXRoIHRvIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlXFxuICAgIGBnZXRWaWV3KGFjdGlvbilgICAgICAgICAgICAgIHwgUmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGVcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tc3RhbmRhbG9uZWBcXG5cXG4gICAgPHN1Yj50aGUgYC1zYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgVW5kZXIgdGhpcyBleHBlcmltZW50YWwgZmxhZywgdGhlIENMSSB3aWxsIHVzZSBCcm93c2VyaWZ5IHRvIGNvbXBpbGUgYSBzdGFuZGFsb25lIG1vZHVsZSB0aGF0IGluY2x1ZGVzIHRoZSB3aXJpbmcgbm9ybWFsbHkgZXhwb3J0ZWQgYnkgdGhlIENMSSBwbHVzIGFsbCBvZiBUYXVudXMgW2FzIGEgVU1EIG1vZHVsZV1bMTBdLlxcblxcbiAgICBUaGlzIHdvdWxkIGFsbG93IHlvdSB0byB1c2UgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSBldmVuIGlmIHlvdSBkb24ndCB3YW50IHRvIHVzZSBbQnJvd3NlcmlmeV1bMTFdIGRpcmVjdGx5LlxcblxcbiAgICBGZWVkYmFjayBhbmQgc3VnZ2VzdGlvbnMgYWJvdXQgdGhpcyBmbGFnLCBfYW5kIHBvc3NpYmxlIGFsdGVybmF0aXZlcyB0aGF0IHdvdWxkIG1ha2UgVGF1bnVzIGVhc2llciB0byB1c2VfLCBhcmUgd2VsY29tZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBDbGllbnQtc2lkZSBBUElcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucylgXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub24odHlwZSwgZm4pYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm9uY2UodHlwZSwgZm4pYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm9mZih0eXBlLCBmbilgXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMuaW50ZXJjZXB0KGFjdGlvbiwgZm4pYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSlgXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMubmF2aWdhdGUodXJsKWBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5yb3V0ZSh1cmwpYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnN0YXRlYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRoZSBgLnRhdW51c3JjYCBtYW5pZmVzdFxcblxcbiAgICBJZiB5b3Ugd2FudCB0byB1c2UgdmFsdWVzIG90aGVyIHRoYW4gdGhlIGNvbnZlbnRpb25hbCBkZWZhdWx0cyBzaG93biBpbiB0aGUgdGFibGUgYmVsb3csIHRoZW4geW91IHNob3VsZCBjcmVhdGUgYSBgLnRhdW51c3JjYCBmaWxlLiBOb3RlIHRoYXQgdGhlIGRlZmF1bHRzIG5lZWQgdG8gYmUgb3ZlcndyaXR0ZW4gaW4gYSBjYXNlLWJ5LWNhc2UgYmFzaXMuIFRoZXNlIG9wdGlvbnMgY2FuIGFsc28gYmUgY29uZmlndXJlZCBpbiB5b3VyIGBwYWNrYWdlLmpzb25gLCB1bmRlciB0aGUgYHRhdW51c2AgcHJvcGVydHkuXFxuXFxuICAgIGBgYGpzb25cXG4gICAge1xcbiAgICAgIFxcXCJ2aWV3c1xcXCI6IFxcXCIuYmluL3ZpZXdzXFxcIixcXG4gICAgICBcXFwic2VydmVyX3JvdXRlc1xcXCI6IFxcXCJjb250cm9sbGVycy9yb3V0ZXMuanNcXFwiLFxcbiAgICAgIFxcXCJzZXJ2ZXJfY29udHJvbGxlcnNcXFwiOiBcXFwiY29udHJvbGxlcnNcXFwiLFxcbiAgICAgIFxcXCJjbGllbnRfY29udHJvbGxlcnNcXFwiOiBcXFwiY2xpZW50L2pzL2NvbnRyb2xsZXJzXFxcIixcXG4gICAgICBcXFwiY2xpZW50X3dpcmluZ1xcXCI6IFxcXCIuYmluL3dpcmluZy5qc1xcXCJcXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgLSBUaGUgYHZpZXdzYCBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciB2aWV3cyBfKGFscmVhZHkgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0KV8gYXJlIHBsYWNlZC4gVGhlc2Ugdmlld3MgYXJlIHVzZWQgZGlyZWN0bHkgb24gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZVxcbiAgICAtIFRoZSBgc2VydmVyX3JvdXRlc2AgZmlsZSBpcyB0aGUgbW9kdWxlIHdoZXJlIHlvdSBleHBvcnQgYSBjb2xsZWN0aW9uIG9mIHJvdXRlcy4gVGhlIENMSSB3aWxsIHB1bGwgdGhlc2Ugcm91dGVzIHdoZW4gY3JlYXRpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRlcyBmb3IgdGhlIHdpcmluZyBtb2R1bGVcXG4gICAgLSBUaGUgYHNlcnZlcl9jb250cm9sbGVyc2AgZGlyZWN0b3J5IGlzIHRoZSByb290IGRpcmVjdG9yeSB3aGVyZSB5b3VyIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGxpdmUuIEl0J3MgdXNlZCB3aGVuIHNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlIHJvdXRlclxcbiAgICAtIFRoZSBgY2xpZW50X2NvbnRyb2xsZXJzYCBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciBjbGllbnQtc2lkZSBjb250cm9sbGVyIG1vZHVsZXMgbGl2ZS4gVGhlIENMSSB3aWxsIGByZXF1aXJlYCB0aGVzZSBjb250cm9sbGVycyBpbiBpdHMgcmVzdWx0aW5nIHdpcmluZyBtb2R1bGVcXG4gICAgLSBUaGUgYGNsaWVudF93aXJpbmdgIGZpbGUgaXMgd2hlcmUgeW91ciB3aXJpbmcgbW9kdWxlIHdpbGwgYmUgcGxhY2VkIGJ5IHRoZSBDTEkuIFlvdSdsbCB0aGVuIGhhdmUgdG8gYHJlcXVpcmVgIGl0IGluIHlvdXIgYXBwbGljYXRpb24gd2hlbiBib290aW5nIHVwIFRhdW51c1xcblxcbiAgICBIZXJlIGlzIHdoZXJlIHRoaW5ncyBnZXQgW2EgbGl0dGxlIGNvbnZlbnRpb25hbF1bMTJdLiBWaWV3cywgYW5kIGJvdGggc2VydmVyLXNpZGUgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleHBlY3RlZCB0byBiZSBvcmdhbml6ZWQgYnkgZm9sbG93aW5nIHRoZSBge3Jvb3R9L3tjb250cm9sbGVyfS97YWN0aW9ufWAgcGF0dGVybiwgYnV0IHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCB1c2luZyBgcmVzb2x2ZXJzYCB3aGVuIGludm9raW5nIHRoZSBDTEkgYW5kIHVzaW5nIHRoZSBzZXJ2ZXItc2lkZSBBUEkuXFxuXFxuICAgIFZpZXdzIGFuZCBjb250cm9sbGVycyBhcmUgYWxzbyBleHBlY3RlZCB0byBiZSBDb21tb25KUyBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIG1ldGhvZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgWzFdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFsyXTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzNdOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi8zMzI3MTc1MTMxMmRiNmU5MjA1OWQ5ODI5M2QwYTdhYzZlOWU4ZTViL3ZpZXdzL3NlcnZlci9sYXlvdXQvbGF5b3V0LmphZGVcXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvaGdldFxcbiAgICBbNl06IGh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi9mNmQ2YjUwNjhmZjAzYTM4N2Y1MDM5MDAxNjBkOWZkYzFlNzQ5NzUwL2NvbnRyb2xsZXJzL3JvdXRpbmcuanMjTDcwLUw3MlxcbiAgICBbN106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzhdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFs5XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFsxMF06IGh0dHBzOi8vZ2l0aHViLmNvbS91bWRqcy91bWRcXG4gICAgWzExXTogaHR0cDovL2Jyb3dzZXJpZnkub3JnXFxuICAgIFsxMl06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29tcGxlbWVudHMobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiY29tcGxlbWVudGFyeS1tb2R1bGVzXFxcIj5Db21wbGVtZW50YXJ5IE1vZHVsZXM8L2gxPlxcbjxwPkZvbzwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIENvbXBsZW1lbnRhcnkgTW9kdWxlc1xcblxcbiAgICBGb29cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZ2V0dGluZ1N0YXJ0ZWQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImdldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9oMT5cXG48cD5UYXVudXMgaXMgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUgZm9yIE5vZGUuanMsIGFuZCBpdCYjMzk7cyA8ZW0+dXAgdG8geW91IGhvdyB0byB1c2UgaXQ8L2VtPi4gSW4gZmFjdCwgaXQgbWlnaHQgYmUgYSBnb29kIGlkZWEgZm9yIHlvdSB0byA8c3Ryb25nPnNldCB1cCBqdXN0IHRoZSBzZXJ2ZXItc2lkZSBhc3BlY3QgZmlyc3Q8L3N0cm9uZz4sIGFzIHRoYXQmIzM5O2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LjwvcD5cXG48aDEgaWQ9XFxcInRhYmxlLW9mLWNvbnRlbnRzXFxcIj5UYWJsZSBvZiBDb250ZW50czwvaDE+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCIjaG93LWl0LXdvcmtzXFxcIj5Ib3cgaXQgd29ya3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2luc3RhbGxpbmctdGF1bnVzXFxcIj5JbnN0YWxsaW5nIFRhdW51czwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjc2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9hPjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2NyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjeW91ci1maXJzdC1yb3V0ZVxcXCI+WW91ciBmaXJzdCByb3V0ZTwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctamFkZS1hcy15b3VyLXZpZXctZW5naW5lXFxcIj5Vc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmU8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3Rocm93aW5nLWluLWEtY29udHJvbGxlclxcXCI+VGhyb3dpbmcgaW4gYSBjb250cm9sbGVyPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9hPjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLXRoZS10YXVudXMtY2xpXFxcIj5Vc2luZyB0aGUgVGF1bnVzIENMSTwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjYm9vdGluZy11cC10aGUtY2xpZW50LXNpZGUtcm91dGVyXFxcIj5Cb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXI8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2FkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlclxcXCI+QWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtY2xpZW50LXNpZGUtdGF1bnVzLWFwaVxcXCI+VXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2NhY2hpbmctYW5kLXByZWZldGNoaW5nXFxcIj5DYWNoaW5nIGFuZCBQcmVmZXRjaGluZzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RoZS1za3ktaXMtdGhlLWxpbWl0LVxcXCI+VGhlIHNreSBpcyB0aGUgbGltaXQhPC9hPjwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcImhvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9oMT5cXG48cD5UYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgPHN0cm9uZz5wcm92ZW48L3N0cm9uZz4gc2V0IG9mIHJ1bGVzLjwvcD5cXG48dWw+XFxuPGxpPkRlZmluZSBhIDxjb2RlPmZ1bmN0aW9uKG1vZGVsKTwvY29kZT4gZm9yIGVhY2ggeW91ciB2aWV3czwvbGk+XFxuPGxpPlB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnQ8L2xpPlxcbjxsaT5EZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uPC9saT5cXG48bGk+UHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnQ8L2xpPlxcbjxsaT5FbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHM8L2xpPlxcbjxsaT5DcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5DcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXc8L2xpPlxcbjxsaT5Gb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlPC9saT5cXG48bGk+V2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCE8L2xpPlxcbjxsaT5PbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCA8c3Ryb25nPmhpamFjayBsaW5rIGNsaWNrczwvc3Ryb25nPiBhbmQgbWFrZSBBSkFYIHJlcXVlc3RzIGluc3RlYWQ8L2xpPlxcbjxsaT5XaGVuIHlvdSBnZXQgdGhlIEpTT04gbW9kZWwgYmFjaywgcmVuZGVyIHZpZXdzIG9uIHRoZSBjbGllbnQtc2lkZTwvbGk+XFxuPGxpPklmIHRoZSA8Y29kZT5oaXN0b3J5PC9jb2RlPiBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiA8c3Ryb25nPkRvbiYjMzk7dCBjb25mdXNlIHlvdXIgaHVtYW5zIHdpdGggb2JzY3VyZSBoYXNoIHJvdXRlcnMhPC9zdHJvbmc+PC9saT5cXG48L3VsPlxcbjxwPkkmIzM5O2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEkmIzM5O2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIHN0ZXBzIHlvdSBuZWVkIHRvIHRha2UgaW4gb3JkZXIgdG8gbWFrZSB0aGlzIGZsb3cgaGFwcGVuLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImluc3RhbGxpbmctdGF1bnVzXFxcIj5JbnN0YWxsaW5nIFRhdW51czwvaDE+XFxuPHA+Rmlyc3Qgb2ZmLCB5b3UmIzM5O2xsIG5lZWQgdG8gY2hvb3NlIGEgSFRUUCBzZXJ2ZXIgZnJhbWV3b3JrIGZvciB5b3VyIGFwcGxpY2F0aW9uLiBBdCB0aGUgbW9tZW50IFRhdW51cyBzdXBwb3J0cyBvbmx5IGEgY291cGxlIG9mIEhUVFAgZnJhbWV3b3JrcywgYnV0IG1vcmUgbWF5IGJlIGFkZGVkIGlmIHRoZXkgYXJlIHBvcHVsYXIgZW5vdWdoLjwvcD5cXG48dWw+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiwgdGhyb3VnaCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxcIj50YXVudXMtZXhwcmVzczwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcXCI+dGF1bnVzLWhhcGk8L2E+IGFuZCB0aGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxcIj5oYXBpaWZ5PC9hPiB0cmFuc2Zvcm08L2xpPlxcbjwvdWw+XFxuPGJsb2NrcXVvdGU+XFxuPHA+SWYgeW91JiMzOTtyZSBtb3JlIG9mIGEgPGVtPiZxdW90O3J1bW1hZ2UgdGhyb3VnaCBzb21lb25lIGVsc2UmIzM5O3MgY29kZSZxdW90OzwvZW0+IHR5cGUgb2YgZGV2ZWxvcGVyLCB5b3UgbWF5IGZlZWwgY29tZm9ydGFibGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXFwiPmdvaW5nIHRocm91Z2ggdGhpcyB3ZWJzaXRlJiMzOTtzIHNvdXJjZSBjb2RlPC9hPiwgd2hpY2ggdXNlcyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvb1xcXCI+cG9ueWZvby5jb208L2E+LCB3aGljaCBpcyA8c3Ryb25nPmEgbW9yZSBhZHZhbmNlZCB1c2UtY2FzZTwvc3Ryb25nPiB1bmRlciB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQmIzM5O3Mgb2theSB0b28uPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5PbmNlIHlvdSYjMzk7dmUgc2V0dGxlZCBmb3IgZWl0aGVyIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBvciA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4geW91JiMzOTtsbCBiZSBhYmxlIHRvIHByb2NlZWQuIEZvciB0aGUgcHVycG9zZXMgb2YgdGhpcyBndWlkZSwgd2UmIzM5O2xsIHVzZSA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4uIFN3aXRjaGluZyBiZXR3ZWVuIG9uZSBvZiB0aGUgZGlmZmVyZW50IEhUVFAgZmxhdm9ycyBpcyBzdHJpa2luZ2x5IGVhc3ksIHRob3VnaC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZVxcXCI+U2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGU8L2g0PlxcbjxwPk5hdHVyYWxseSwgeW91JiMzOTtsbCBuZWVkIHRvIGluc3RhbGwgYWxsIG9mIHRoZSBmb2xsb3dpbmcgbW9kdWxlcyBmcm9tIDxjb2RlPm5wbTwvY29kZT4gdG8gZ2V0IHN0YXJ0ZWQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIHRhdW51cyB0YXVudXMtZXhwcmVzcyBleHByZXNzIC0tc2F2ZVxcbjwvY29kZT48L3ByZT5cXG48cD5MZXQmIzM5O3MgYnVpbGQgb3VyIGFwcGxpY2F0aW9uIHN0ZXAtYnktc3RlcCwgYW5kIEkmIzM5O2xsIHdhbGsgeW91IHRocm91Z2ggdGhlbSBhcyB3ZSBnbyBhbG9uZy4gRmlyc3Qgb2YgYWxsLCB5b3UmIzM5O2xsIG5lZWQgdGhlIGZhbW91cyA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIGFwcC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBwcm9iYWJseSBhIGdvb2QgaWRlYSB0byBwdXQgc29tZXRoaW5nIGluIHlvdXIgPGNvZGU+YXBwLmpzPC9jb2RlPiBmaWxlLCBsZXQmIzM5O3MgZG8gdGhhdCBub3cuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHt9O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkFsbCA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT4gcmVhbGx5IGRvZXMgaXMgYWRkIGEgYnVuY2ggb2Ygcm91dGVzIHRvIHlvdXIgRXhwcmVzcyA8Y29kZT5hcHA8L2NvZGU+LiBZb3Ugc2hvdWxkIG5vdGUgdGhhdCBhbnkgbWlkZGxld2FyZSBhbmQgQVBJIHJvdXRlcyBzaG91bGQgcHJvYmFibHkgY29tZSBiZWZvcmUgdGhlIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+IGludm9jYXRpb24uIFlvdSYjMzk7bGwgcHJvYmFibHkgYmUgdXNpbmcgYSBjYXRjaC1hbGwgdmlldyByb3V0ZSB0aGF0IHJlbmRlcnMgYSA8ZW0+JnF1b3Q7Tm90IEZvdW5kJnF1b3Q7PC9lbT4gdmlldywgYmxvY2tpbmcgYW55IHJvdXRpbmcgYmV5b25kIHRoYXQgcm91dGUuPC9wPlxcbjxwPlRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+IGxldCYjMzk7cyB5b3UgY29uZmlndXJlIFRhdW51cy4gSW5zdGVhZCBvZiBkaXNjdXNzaW5nIGV2ZXJ5IHNpbmdsZSBjb25maWd1cmF0aW9uIG9wdGlvbiB5b3UgY291bGQgc2V0IGhlcmUsIGxldCYjMzk7cyBkaXNjdXNzIHdoYXQgbWF0dGVyczogdGhlIDxlbT5yZXF1aXJlZCBjb25maWd1cmF0aW9uPC9lbT4uIFRoZXJlJiMzOTtzIHR3byBvcHRpb25zIHRoYXQgeW91IG11c3Qgc2V0IGlmIHlvdSB3YW50IHlvdXIgVGF1bnVzIGFwcGxpY2F0aW9uIHRvIG1ha2UgYW55IHNlbnNlLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmxheW91dDwvY29kZT4gc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSA8Y29kZT5tb2RlbDwvY29kZT4gYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnQ8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlczwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvaDQ+XFxuPHA+TGV0JiMzOTtzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQmIzM5O2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBsYXlvdXQuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IDxlbT4oYXMgc2VlbiBiZWxvdyk8L2VtPiBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UmIzM5O2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgPGVtPiZxdW90O3RoZXJlIGlzIG5vIGxheW91dCwganVzdCByZW5kZXIgdGhlIHBhcnRpYWxzJnF1b3Q7PC9lbT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICByZXR1cm4gbW9kZWwucGFydGlhbDtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIGlmIHlvdSB3ZXJlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uLCB0aGVuIHlvdSBwcm9iYWJseSB3b3VsZG4mIzM5O3Qgd2FudCB0byB3cml0ZSB2aWV3cyBhcyBKYXZhU2NyaXB0IGZ1bmN0aW9ucyBhcyB0aGF0JiMzOTtzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vamFubC9tdXN0YWNoZS5qc1xcXCI+TXVzdGFjaGU8L2E+IGlzIGEgdGVtcGxhdGluZyBlbmdpbmUgdGhhdCBjYW4gY29tcGlsZSB5b3VyIHZpZXdzIGludG8gcGxhaW4gZnVuY3Rpb25zLCB1c2luZyBhIHN5bnRheCB0aGF0JiMzOTtzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxcIj5KYWRlPC9hPiBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJiMzOTtzIG5vIGNsb3NpbmcgdGFnczwvbGk+XFxuPGxpPlRoZXJlJiMzOTtzIG1hbnkgbW9yZSBhbHRlcm5hdGl2ZXMgbGlrZSA8YSBocmVmPVxcXCJodHRwOi8vbW96aWxsYS5naXRodWIuaW8vbnVuanVja3MvXFxcIj5Nb3ppbGxhJiMzOTtzIE51bmp1Y2tzPC9hPiwgPGEgaHJlZj1cXFwiaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxcIj5IYW5kbGViYXJzPC9hPiwgYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxcIj5FSlM8L2E+LjwvbGk+XFxuPC91bD5cXG48cD5SZW1lbWJlciB0byBhZGQgdGhlIDxjb2RlPmxheW91dDwvY29kZT4gdW5kZXIgdGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5Zb3UmIzM5O2xsIGZpbmQgdG9vbHMgcmVsYXRlZCB0byB2aWV3IHRlbXBsYXRpbmcgaW4gdGhlIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+Y29tcGxlbWVudGFyeSBtb2R1bGVzIHNlY3Rpb248L2E+LiBJZiB5b3UgZG9uJiMzOTt0IHByb3ZpZGUgYSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHByb3BlcnR5IGF0IGFsbCwgVGF1bnVzIHdpbGwgcmVuZGVyIHlvdXIgbW9kZWwgaW4gYSByZXNwb25zZSBieSB3cmFwcGluZyBpdCBpbiA8Y29kZT4mbHQ7cHJlJmd0OzwvY29kZT4gYW5kIDxjb2RlPiZsdDtjb2RlJmd0OzwvY29kZT4gdGFncywgd2hpY2ggbWF5IGFpZCB5b3Ugd2hlbiBnZXR0aW5nIHN0YXJ0ZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwieW91ci1maXJzdC1yb3V0ZVxcXCI+WW91ciBmaXJzdCByb3V0ZTwvaDQ+XFxuPHA+Um91dGVzIG5lZWQgdG8gYmUgcGxhY2VkIGluIGl0cyBvd24gZGVkaWNhdGVkIG1vZHVsZSwgc28gdGhhdCB5b3UgY2FuIHJldXNlIGl0IGxhdGVyIG9uIDxzdHJvbmc+d2hlbiBzZXR0aW5nIHVwIGNsaWVudC1zaWRlIHJvdXRpbmc8L3N0cm9uZz4uIExldCYjMzk7cyBjcmVhdGUgdGhhdCBtb2R1bGUgYW5kIGFkZCBhIHJvdXRlIHRvIGl0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCByb3V0ZXMuanNcXG48L2NvZGU+PC9wcmU+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBbXFxuICB7IHJvdXRlOiAmIzM5Oy8mIzM5OywgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5OyB9XFxuXTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+RWFjaCBpdGVtIGluIHRoZSBleHBvcnRlZCBhcnJheSBpcyBhIHJvdXRlLiBJbiB0aGlzIGNhc2UsIHdlIG9ubHkgaGF2ZSB0aGUgPGNvZGU+LzwvY29kZT4gcm91dGUgd2l0aCB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gYWN0aW9uLiBUYXVudXMgZm9sbG93cyB0aGUgd2VsbCBrbm93biA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxcIj5jb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbiBwYXR0ZXJuPC9hPiwgd2hpY2ggbWFkZSA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1J1Ynlfb25fUmFpbHNcXFwiPlJ1Ynkgb24gUmFpbHM8L2E+IGZhbW91cy4gPGVtPk1heWJlIG9uZSBkYXkgVGF1bnVzIHdpbGwgYmUgZmFtb3VzIHRvbyE8L2VtPiBCeSBjb252ZW50aW9uLCBUYXVudXMgd2lsbCBhc3N1bWUgdGhhdCB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gYWN0aW9uIHVzZXMgdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIgYW5kIHJlbmRlcnMgdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IHZpZXcuIE9mIGNvdXJzZSwgPGVtPmFsbCBvZiB0aGF0IGNhbiBiZSBjaGFuZ2VkIHVzaW5nIGNvbmZpZ3VyYXRpb248L2VtPi48L3A+XFxuPHA+VGltZSB0byBnbyBiYWNrIHRvIDxjb2RlPmFwcC5qczwvY29kZT4gYW5kIHVwZGF0ZSB0aGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuL2xheW91dCYjMzk7KSxcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIDxlbT4obW9yZSBvbiB0aGF0IGxhdGVyLCBidXQgaXQgZGVmYXVsdHMgdG8gPGNvZGU+e308L2NvZGU+KTwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9oND5cXG48cD5MZXQmIzM5O3MgZ28gYWhlYWQgYW5kIHVzZSBKYWRlIGFzIHRoZSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgb2YgY2hvaWNlIGZvciBvdXIgdmlld3MuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHZpZXdzL2hvbWUvaW5kZXguamFkZVxcbjwvY29kZT48L3ByZT5cXG48cD5TaW5jZSB3ZSYjMzk7cmUganVzdCBnZXR0aW5nIHN0YXJ0ZWQsIHRoZSB2aWV3IHdpbGwganVzdCBoYXZlIHNvbWUgYmFzaWMgc3RhdGljIGNvbnRlbnQsIGFuZCB0aGF0JiMzOTtzIGl0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWphZGVcXFwiPnAgSGVsbG8gVGF1bnVzIVxcbjwvY29kZT48L3ByZT5cXG48cD5OZXh0IHlvdSYjMzk7bGwgd2FudCB0byBjb21waWxlIHRoZSB2aWV3IGludG8gYSBmdW5jdGlvbi4gVG8gZG8gdGhhdCB5b3UgY2FuIHVzZSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvamFkdW1cXFwiPmphZHVtPC9hPiwgYSBzcGVjaWFsaXplZCBKYWRlIGNvbXBpbGVyIHRoYXQgcGxheXMgd2VsbCB3aXRoIFRhdW51cyBieSBiZWluZyBhd2FyZSBvZiA8Y29kZT5yZXF1aXJlPC9jb2RlPiBzdGF0ZW1lbnRzLCBhbmQgdGh1cyBzYXZpbmcgYnl0ZXMgd2hlbiBpdCBjb21lcyB0byBjbGllbnQtc2lkZSByZW5kZXJpbmcuIExldCYjMzk7cyBpbnN0YWxsIGl0IGdsb2JhbGx5LCBmb3IgdGhlIHNha2Ugb2YgdGhpcyBleGVyY2lzZSA8ZW0+KHlvdSBzaG91bGQgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4geW91JiMzOTtyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbik8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgamFkdW0gLWdcXG48L2NvZGU+PC9wcmU+XFxuPHA+VG8gY29tcGlsZSBldmVyeSB2aWV3IGluIHRoZSA8Y29kZT52aWV3czwvY29kZT4gZGlyZWN0b3J5IGludG8gZnVuY3Rpb25zIHRoYXQgd29yayB3ZWxsIHdpdGggVGF1bnVzLCB5b3UgY2FuIHVzZSB0aGUgY29tbWFuZCBiZWxvdy4gVGhlIDxjb2RlPi0tb3V0cHV0PC9jb2RlPiBmbGFnIGluZGljYXRlcyB3aGVyZSB5b3Ugd2FudCB0aGUgdmlld3MgdG8gYmUgcGxhY2VkLiBXZSBjaG9zZSB0byB1c2UgPGNvZGU+LmJpbjwvY29kZT4gYmVjYXVzZSB0aGF0JiMzOTtzIHdoZXJlIFRhdW51cyBleHBlY3RzIHlvdXIgY29tcGlsZWQgdmlld3MgdG8gYmUgYnkgZGVmYXVsdC4gQnV0IHNpbmNlIFRhdW51cyBmb2xsb3dzIHRoZSA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5jb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbjwvYT4gYXBwcm9hY2gsIHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCBpZiB5b3Ugd2FudGVkIHRvLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5qYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkNvbmdyYXR1bGF0aW9ucyEgVGF1bnVzIGlzIG5vdyBvcGVyYXRpb25hbC4gQWxsIHRoYXQmIzM5O3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgPGNvZGU+MzAwMDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxub3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q29udHJvbGxlcnMgYXJlIGluZGVlZCBvcHRpb25hbCwgYnV0IGFuIGFwcGxpY2F0aW9uIHRoYXQgcmVuZGVycyBldmVyeSB2aWV3IHVzaW5nIHRoZSBzYW1lIG1vZGVsIHdvbiYjMzk7dCBnZXQgdmVyeSBmYXIuIENvbnRyb2xsZXJzIGFsbG93IHlvdSB0byBoYW5kbGUgdGhlIHJlcXVlc3QgYW5kIHB1dCB0b2dldGhlciB0aGUgbW9kZWwgdG8gYmUgdXNlZCB3aGVuIHNlbmRpbmcgYSByZXNwb25zZS4gQ29udHJhcnkgdG8gd2hhdCBtb3N0IGZyYW1ld29ya3MgcHJvcG9zZSwgVGF1bnVzIGV4cGVjdHMgZXZlcnkgYWN0aW9uIHRvIGhhdmUgaXRzIG93biBpbmRpdmlkdWFsIGNvbnRyb2xsZXIuIFNpbmNlIE5vZGUuanMgbWFrZXMgaXQgZWFzeSB0byBpbXBvcnQgY29tcG9uZW50cywgdGhpcyBzZXR1cCBoZWxwcyB5b3Uga2VlcCB5b3VyIGNvZGUgbW9kdWxhciB3aGlsZSBzdGlsbCBiZWluZyBhYmxlIHRvIHJldXNlIGxvZ2ljIGJ5IHNoYXJpbmcgbW9kdWxlcyBhY3Jvc3MgZGlmZmVyZW50IGNvbnRyb2xsZXJzLiBMZXQmIzM5O3MgY3JlYXRlIGEgY29udHJvbGxlciBmb3IgdGhlIDxjb2RlPmhvbWUvdmlldzwvY29kZT4gYWN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiA8ZW0+U3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj88L2VtPiBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IDxlbT4ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBpbiB0aGUgY2FzZSBvZiA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbiYjMzk7dCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyA8ZW0+KHZlcnkgZmV3KTwvZW0+IHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIDxjb2RlPnRpdGxlPC9jb2RlPiBwcm9wZXJ0eSwgYW5kIGl0JiMzOTtsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgPGNvZGU+ZG9jdW1lbnQudGl0bGU8L2NvZGU+IGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0JiMzOTtzIG5vdCBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IHByb3BlcnR5IHdvbiYjMzk7dCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LjwvcD5cXG48cD5IZXJlIGlzIG91ciBuZXdmYW5nbGVkIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIuIEFzIHlvdSYjMzk7bGwgbm90aWNlLCBpdCBkb2VzbiYjMzk7dCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gPGNvZGU+bmV4dDwvY29kZT4gaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byA8Y29kZT5yZXMudmlld01vZGVsPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgIG1vZGVsOiB7XFxuICAgICAgdGl0bGU6ICYjMzk7V2VsY29tZSBIb21lLCBUYXVudXMhJiMzOTtcXG4gICAgfVxcbiAgfTtcXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSA8ZW0+d291bGRuJiMzOTt0IGJlIHByb2dyZXNzaXZlPC9lbT4sIGFuZCB0aHVzIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPml0IHdvdWxkIGJlIHJlYWxseSwgPGVtPnJlYWxseTwvZW0+IGJhZDwvYT4uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgPGNvZGU+dGl0bGU8L2NvZGU+IGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCYjMzk7cyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhIFRoZSA8Y29kZT4hPTwvY29kZT4gc3ludGF4IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbiYjMzk7dCBiZSBlc2NhcGVkLiBUaGF0JiMzOTtzIG9rYXkgYmVjYXVzZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJiMzOTt0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+dGl0bGU9bW9kZWwudGl0bGVcXG5tYWluIT1wYXJ0aWFsXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IDxjb2RlPiZsdDtodG1sJmd0OzwvY29kZT4sIDxjb2RlPiZsdDtoZWFkJmd0OzwvY29kZT4sIGFuZCA8Y29kZT4mbHQ7Ym9keSZndDs8L2NvZGU+IGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIDxlbT5Ib3cgY29vbCBpcyB0aGF0PzwvZW0+PC9wPlxcbjxwPlRoYXQmIzM5O3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUmIzM5O3Mgbm90aGluZyBzdG9wcGluZyB5b3UgZnJvbSBhZGRpbmcgZGF0YWJhc2UgY2FsbHMgdG8gZmV0Y2ggYml0cyBhbmQgcGllY2VzIG9mIHRoZSBtb2RlbCBiZWZvcmUgaW52b2tpbmcgPGNvZGU+bmV4dDwvY29kZT4gdG8gcmVuZGVyIHRoZSB2aWV3LjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCYjMzk7cyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9oMT5cXG48cD5Zb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmNoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLjwvcD5cXG48cD5UaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIDxlbT5vciBpZiBpdCBoYXNuJiMzOTt0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzPC9lbT4sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS48L3A+XFxuPHA+U2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSYjMzk7bGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbiYjMzk7cyB3aXJpbmcgPGVtPih0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKTwvZW0+IGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UmIzM5O2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQmIzM5O3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLjwvcD5cXG48cD5BcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UmIzM5O2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2g0PlxcbjxwPlRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCA8Y29kZT5qYWR1bTwvY29kZT4gZWFybGllciwgd2UmIzM5O2xsIGluc3RhbGwgdGhlIDxjb2RlPnRhdW51czwvY29kZT4gQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgdGF1bnVzIC1nXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBDTEkgaXMgdGVyc2UgaW4gYm90aCBpdHMgaW5wdXRzIGFuZCBpdHMgb3V0cHV0cy4gSWYgeW91IHJ1biBpdCB3aXRob3V0IGFueSBhcmd1bWVudHMgaXQmIzM5O2xsIHByaW50IG91dCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGlmIHlvdSB3YW50IHRvIHBlcnNpc3QgaXQgeW91IHNob3VsZCBwcm92aWRlIHRoZSA8Y29kZT4tLW91dHB1dDwvY29kZT4gZmxhZy4gSW4gdHlwaWNhbCA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxcIj5jb252ZW50aW9uLW92ZXItY29uZmlndXJhdGlvbjwvYT4gZmFzaGlvbiwgdGhlIENMSSB3aWxsIGRlZmF1bHQgdG8gaW5mZXJyaW5nIHlvdXIgdmlld3MgYXJlIGxvY2F0ZWQgaW4gPGNvZGU+LmJpbi92aWV3czwvY29kZT4gYW5kIHRoYXQgeW91IHdhbnQgdGhlIHdpcmluZyBtb2R1bGUgdG8gYmUgcGxhY2VkIGluIDxjb2RlPi5iaW4vd2lyaW5nLmpzPC9jb2RlPiwgYnV0IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBjaGFuZ2UgdGhhdCBpZiBpdCBkb2VzbiYjMzk7dCBtZWV0IHlvdXIgbmVlZHMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dFxcbjwvY29kZT48L3ByZT5cXG48cD5BdCB0aGlzIHBvaW50IGluIG91ciBleGFtcGxlLCB0aGUgQ0xJIHNob3VsZCBjcmVhdGUgYSA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4gZmlsZSB3aXRoIHRoZSBjb250ZW50cyBkZXRhaWxlZCBiZWxvdy4gQXMgeW91IGNhbiBzZWUsIGV2ZW4gaWYgPGNvZGU+dGF1bnVzPC9jb2RlPiBpcyBhbiBhdXRvbWF0ZWQgY29kZS1nZW5lcmF0aW9uIHRvb2wsIGl0JiMzOTtzIG91dHB1dCBpcyBhcyBodW1hbiByZWFkYWJsZSBhcyBhbnkgb3RoZXIgbW9kdWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGVtcGxhdGVzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuL3ZpZXdzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciBjb250cm9sbGVycyA9IHtcXG59O1xcblxcbnZhciByb3V0ZXMgPSB7XFxuICAmIzM5Oy8mIzM5Ozoge1xcbiAgICBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7XFxuICB9XFxufTtcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IHtcXG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxcbiAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgcm91dGVzOiByb3V0ZXNcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5Ob3RlIHRoYXQgdGhlIDxjb2RlPmNvbnRyb2xsZXJzPC9jb2RlPiBvYmplY3QgaXMgZW1wdHkgYmVjYXVzZSB5b3UgaGF2ZW4mIzM5O3QgY3JlYXRlZCBhbnkgPGVtPmNsaWVudC1zaWRlIGNvbnRyb2xsZXJzPC9lbT4geWV0LiBXZSBjcmVhdGVkIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGJ1dCB0aG9zZSBkb24mIzM5O3QgaGF2ZSBhbnkgZWZmZWN0IGluIHRoZSBjbGllbnQtc2lkZSwgYmVzaWRlcyBkZXRlcm1pbmluZyB3aGF0IGdldHMgc2VudCB0byB0aGUgY2xpZW50LjwvcD5cXG48cD5UaGUgQ0xJIGNhbiBiZSBlbnRpcmVseSBpZ25vcmVkLCB5b3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhpcyBmaWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuPC9wPlxcbjxwPkR1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgPGNvZGU+LS13YXRjaDwvY29kZT4gZmxhZywgd2hpY2ggd2lsbCByZWJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIGlmIGEgcmVsZXZhbnQgZmlsZSBjaGFuZ2VzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXQgLS13YXRjaFxcbjwvY29kZT48L3ByZT5cXG48cD5JZiB5b3UmIzM5O3JlIHVzaW5nIEhhcGkgaW5zdGVhZCBvZiBFeHByZXNzLCB5b3UmIzM5O2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSA8Y29kZT5oYXBpaWZ5PC9jb2RlPiB0cmFuc2Zvcm0gc28gdGhhdCByb3V0ZXMgZ2V0IGNvbnZlcnRlZCBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGluZyBtb2R1bGUgdW5kZXJzdGFuZC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0tdHJhbnNmb3JtIGhhcGlpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm93IHRoYXQgeW91IHVuZGVyc3RhbmQgaG93IHRvIHVzZSB0aGUgQ0xJIG9yIGJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIG9uIHlvdXIgb3duLCBib290aW5nIHVwIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgd2lsbCBiZSBhbiBlYXN5IHRoaW5nIHRvIGRvITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImJvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9oND5cXG48cD5PbmNlIHdlIGhhdmUgdGhlIHdpcmluZyBtb2R1bGUsIGJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGVuZ2luZSBpcyBwcmV0dHkgZWFzeS4gVGF1bnVzIHN1Z2dlc3RzIHlvdSB1c2UgPGNvZGU+Y2xpZW50L2pzPC9jb2RlPiB0byBrZWVwIGFsbCBvZiB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgbG9naWMsIGJ1dCB0aGF0IGlzIHVwIHRvIHlvdSB0b28uIEZvciB0aGUgc2FrZSBvZiB0aGlzIGd1aWRlLCBsZXQmIzM5O3Mgc3RpY2sgdG8gdGhlIGNvbnZlbnRpb25zLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBjbGllbnQvanMvbWFpbi5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgPGNvZGU+bWFpbjwvY29kZT4gbW9kdWxlIHdpbGwgYmUgdXNlZCBhcyB0aGUgPGVtPmVudHJ5IHBvaW50PC9lbT4gb2YgeW91ciBhcHBsaWNhdGlvbiBvbiB0aGUgY2xpZW50LXNpZGUuIEhlcmUgeW91JiMzOTtsbCBuZWVkIHRvIGltcG9ydCA8Y29kZT50YXVudXM8L2NvZGU+LCB0aGUgd2lyaW5nIG1vZHVsZSB3ZSYjMzk7dmUganVzdCBidWlsdCwgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBET00gZWxlbWVudCB3aGVyZSB5b3UgYXJlIHJlbmRlcmluZyB5b3VyIHBhcnRpYWwgdmlld3MuIE9uY2UgeW91IGhhdmUgYWxsIHRoYXQsIHlvdSBjYW4gaW52b2tlIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB3aXJpbmcgPSByZXF1aXJlKCYjMzk7Li4vLi4vLmJpbi93aXJpbmcmIzM5Oyk7XFxudmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgmIzM5O21haW4mIzM5OylbMF07XFxuXFxudGF1bnVzLm1vdW50KG1haW4sIHdpcmluZyk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBtb3VudHBvaW50IHdpbGwgc2V0IHVwIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgcm91dGVyIGFuZCBmaXJlIHRoZSBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXIgZm9yIHRoZSB2aWV3IHRoYXQgaGFzIGJlZW4gcmVuZGVyZWQgaW4gdGhlIHNlcnZlci1zaWRlLiBXaGVuZXZlciBhbiBhbmNob3IgbGluayBpcyBjbGlja2VkLCBUYXVudXMgd2lsbCBiZSBhYmxlIHRvIGhpamFjayB0aGF0IGNsaWNrIGFuZCByZXF1ZXN0IHRoZSBtb2RlbCB1c2luZyBBSkFYLCBidXQgb25seSBpZiBpdCBtYXRjaGVzIGEgdmlldyByb3V0ZS4gT3RoZXJ3aXNlIHRoZSBsaW5rIHdpbGwgYmVoYXZlIGp1c3QgbGlrZSBhbnkgbm9ybWFsIGxpbmsgd291bGQuPC9wPlxcbjxwPkJ5IGRlZmF1bHQsIHRoZSBtb3VudHBvaW50IHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldy4gVGhpcyBpcyBha2luIHRvIHdoYXQgZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBmcmFtZXdvcmtzIHN1Y2ggYXMgQW5ndWxhckpTIGRvLCB3aGVyZSB2aWV3cyBhcmUgb25seSByZW5kZXJlZCBhZnRlciBhbGwgdGhlIEphdmFTY3JpcHQgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBhbmQgZXhlY3V0ZWQuIEV4Y2VwdCBUYXVudXMgcHJvdmlkZXMgaHVtYW4tcmVhZGFibGUgY29udGVudCBmYXN0ZXIsIGJlZm9yZSB0aGUgSmF2YVNjcmlwdCBldmVuIGJlZ2lucyBkb3dubG9hZGluZywgYWx0aG91Z2ggaXQgd29uJiMzOTt0IGJlIGZ1bmN0aW9uYWwgdW50aWwgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgcnVucy48L3A+XFxuPHA+QW4gYWx0ZXJuYXRpdmUgaXMgdG8gaW5saW5lIHRoZSB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmlld3MgaW4gYSA8Y29kZT4mbHQ7c2NyaXB0IHR5cGU9JiMzOTt0ZXh0L3RhdW51cyYjMzk7Jmd0OzwvY29kZT4gdGFnLCBidXQgdGhpcyB0ZW5kcyB0byBzbG93IGRvd24gdGhlIGluaXRpYWwgcmVzcG9uc2UgKG1vZGVscyBhcmUgPGVtPnR5cGljYWxseSBsYXJnZXI8L2VtPiB0aGFuIHRoZSByZXN1bHRpbmcgdmlld3MpLjwvcD5cXG48cD5BIHRoaXJkIHN0cmF0ZWd5IGlzIHRoYXQgeW91IHJlcXVlc3QgdGhlIG1vZGVsIGFzeW5jaHJvbm91c2x5IG91dHNpZGUgb2YgVGF1bnVzLCBhbGxvd2luZyB5b3UgdG8gZmV0Y2ggYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGl0c2VsZiBjb25jdXJyZW50bHksIGJ1dCB0aGF0JiMzOTtzIGhhcmRlciB0byBzZXQgdXAuPC9wPlxcbjxwPlRoZSB0aHJlZSBib290aW5nIHN0cmF0ZWdpZXMgYXJlIGV4cGxhaW5lZCBpbiA8YSBocmVmPVxcXCIvYXBpXFxcIj50aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IGFuZCBmdXJ0aGVyIGRpc2N1c3NlZCBpbiA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPnRoZSBvcHRpbWl6YXRpb24gZ3VpZGU8L2E+LiBGb3Igbm93LCB0aGUgZGVmYXVsdCBzdHJhdGVneSA8ZW0+KDxjb2RlPiYjMzk7YXV0byYjMzk7PC9jb2RlPik8L2VtPiBzaG91bGQgc3VmZmljZS4gSXQgZmV0Y2hlcyB0aGUgdmlldyBtb2RlbCB1c2luZyBhbiBBSkFYIHJlcXVlc3QgcmlnaHQgYWZ0ZXIgVGF1bnVzIGxvYWRzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImFkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlclxcXCI+QWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyPC9oND5cXG48cD5DbGllbnQtc2lkZSBjb250cm9sbGVycyBydW4gd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLCBldmVuIGlmIGl0JiMzOTtzIGEgcGFydGlhbC4gVGhlIGNvbnRyb2xsZXIgaXMgcGFzc2VkIHRoZSA8Y29kZT5tb2RlbDwvY29kZT4sIGNvbnRhaW5pbmcgdGhlIG1vZGVsIHRoYXQgd2FzIHVzZWQgdG8gcmVuZGVyIHRoZSB2aWV3OyB0aGUgPGNvZGU+cm91dGU8L2NvZGU+LCBicm9rZW4gZG93biBpbnRvIGl0cyBjb21wb25lbnRzOyBhbmQgdGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4sIHdoaWNoIGlzIHdoYXRldmVyIERPTSBlbGVtZW50IHRoZSB2aWV3IHdhcyByZW5kZXJlZCBpbnRvLjwvcD5cXG48cD5UaGVzZSBjb250cm9sbGVycyBhcmUgZW50aXJlbHkgb3B0aW9uYWwsIHdoaWNoIG1ha2VzIHNlbnNlIHNpbmNlIHdlJiMzOTtyZSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2luZyB0aGUgYXBwbGljYXRpb246IGl0IG1pZ2h0IG5vdCBldmVuIGJlIG5lY2Vzc2FyeSEgTGV0JiMzOTtzIGFkZCBzb21lIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gdGhlIGV4YW1wbGUgd2UmIzM5O3ZlIGJlZW4gYnVpbGRpbmcuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJiMzOTtsbCBqdXN0IHByaW50IHRoZSBhY3Rpb24gYW5kIHRoZSBtb2RlbCB0byB0aGUgY29uc29sZS4gSWYgdGhlcmUmIzM5O3Mgb25lIHBsYWNlIHdoZXJlIHlvdSYjMzk7ZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCwgcm91dGUsIGNvbnRhaW5lcikge1xcbiAgY29uc29sZS5sb2coJiMzOTtSZW5kZXJlZCB2aWV3ICVzIHVzaW5nIG1vZGVsICVzJiMzOTssIHJvdXRlLmFjdGlvbiwgbW9kZWwpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9oND5cXG48cD5UYXVudXMgZG9lcyBwcm92aWRlIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmEgdGhpbiBBUEk8L2E+IGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSYjMzk7cyBhIGZldyBtZXRob2RzIHlvdSBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygb24gYSBnbG9iYWwgc2NhbGUgYXMgd2VsbC48L3A+XFxuPHA+VGF1bnVzIGNhbiBub3RpZnkgeW91IHdoZW5ldmVyIGltcG9ydGFudCBldmVudHMgb2NjdXIuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5FdmVudDwvdGg+XFxuPHRoPkFyZ3VtZW50czwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5zdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZG9uZSYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBkYXRhPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5hYm9ydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5lcnJvciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBlcnI8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5CZXNpZGVzIGV2ZW50cywgdGhlcmUmIzM5O3MgYSBjb3VwbGUgbW9yZSBtZXRob2RzIHlvdSBjYW4gdXNlLiBUaGUgPGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPiBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJiMzOTtzIDxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPiwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCYjMzk7bGwgdGhlbiBpbnZva2UgaXRzIGNvbnRyb2xsZXIuIFlvdSYjMzk7bGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guPC9wPlxcbjxwPkFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmdcXFwiPkNhY2hpbmcgYW5kIFByZWZldGNoaW5nPC9oND5cXG48cD48YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlPC9hPiBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQmIzM5O3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/PC9wPlxcbjxwPldoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIDxjb2RlPnsgY2FjaGU6IHRydWUgfTwvY29kZT4gYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiwgdGhlIGNhY2hpbmcgbGF5ZXIgd2lsbCBtYWtlIHN1cmUgdGhhdCByZXNwb25zZXMgYXJlIGtlcHQgYXJvdW5kIGZvciA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0JiMzOTtsbCBmaXJzdCBhc2sgdGhlIGNhY2hpbmcgbGF5ZXIgZm9yIGEgZnJlc2ggY29weS4gSWYgdGhlIGNhY2hpbmcgbGF5ZXIgZG9lc24mIzM5O3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSA8ZW0+KGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcyk8L2VtPiwgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gYSBudW1iZXIgaW4gc2Vjb25kcyBpbnN0ZWFkIG9mIGp1c3QgPGNvZGU+dHJ1ZTwvY29kZT4uPC9wPlxcbjxwPlNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UmIzM5O3JlIGFsc28gYWJsZSB0byBzZXQgYSA8Y29kZT5jYWNoZTwvY29kZT4gZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgPGNvZGU+Y2FjaGU8L2NvZGU+IHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+SW5kZXhlZERCPC9hPiBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIDxjb2RlPmxvY2FsU3RvcmFnZTwvY29kZT4uIEl0IGhhcyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5zdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0PC9hPiwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCYjMzk7cyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuPC9wPlxcbjxwPlRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSA8ZW0+KHRoZSA8Y29kZT50b3VjaHN0YXJ0PC9jb2RlPiBldmVudCk8L2VtPiwgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuPC9wPlxcbjxwPklmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgPGVtPihwb3NzaWJseSBsaW1pdGVkKTwvZW0+IEludGVybmV0IGNvbm5lY3Rpb24gYmFuZHdpZHRoLjwvcD5cXG48cD5JZiB0aGUgaHVtYW4gY2xpY2tzIG9uIHRoZSBsaW5rIGJlZm9yZSBwcmVmZXRjaGluZyBpcyBjb21wbGV0ZWQsIGhlJiMzOTtsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuPC9wPlxcbjxwPlR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgPGNvZGU+cHJlZmV0Y2g8L2NvZGU+IHRvIDxjb2RlPnRydWU8L2NvZGU+IGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlIE9wdGltaXphdGlvbnM8L2E+IGd1aWRlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS1za3ktaXMtdGhlLWxpbWl0LVxcXCI+VGhlIHNreSBpcyB0aGUgbGltaXQhPC9oMT5cXG48cD5Zb3UmIzM5O3JlIG5vdyBmYW1pbGlhciB3aXRoIGhvdyBUYXVudXMgd29ya3Mgb24gYSBoaWdoLWxldmVsLiBZb3UgaGF2ZSBjb3ZlcmVkIGEgZGVjZW50IGFtb3VudCBvZiBncm91bmQsIGJ1dCB5b3Ugc2hvdWxkbiYjMzk7dCBzdG9wIHRoZXJlLjwvcD5cXG48dWw+XFxuPGxpPkxlYXJuIG1vcmUgYWJvdXQgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBUYXVudXMgaGFzPC9hPiB0byBvZmZlcjwvbGk+XFxuPGxpPkdvIHRocm91Z2ggdGhlIDxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+cGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHRpcHM8L2E+LiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchPC9saT5cXG48bGk+PGVtPkZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQ8L2VtPjx1bD5cXG48bGk+SmVyZW15IEtlaXRoIGVudW5jaWF0ZXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly9hZGFjdGlvLmNvbS9qb3VybmFsLzc3MDZcXFwiPiZxdW90O0JlIHByb2dyZXNzaXZlJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkNocmlzdGlhbiBIZWlsbWFubiBhZHZvY2F0ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9pY2FudC5jby51ay9hcnRpY2xlcy9wcmFnbWF0aWMtcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQvXFxcIj4mcXVvdDtQcmFnbWF0aWMgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQmcXVvdDs8L2E+PC9saT5cXG48bGk+SmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IDxhIGhyZWY9XFxcImh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGlzIGZhc3RlciZxdW90OzwvYT48L2xpPlxcbjxsaT5JIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj4mcXVvdDtTdG9wIEJyZWFraW5nIHRoZSBXZWImcXVvdDs8L2E+PC9saT5cXG48bGk+R3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcXCI+JnF1b3Q7NyBQcmluY2lwbGVzIG9mIFJpY2ggV2ViIEFwcGxpY2F0aW9ucyZxdW90OzwvYT48L2xpPlxcbjxsaT5BYXJvbiBHdXN0YWZzb24gd3JpdGVzIDxhIGhyZWY9XFxcImh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxcIj4mcXVvdDtVbmRlcnN0YW5kaW5nIFByb2dyZXNzaXZlIEVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPk9yZGUgU2F1bmRlcnMgZ2l2ZXMgaGlzIHBvaW50IG9mIHZpZXcgaW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcXCI+JnF1b3Q7UHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgZm9yIGZhdWx0IHRvbGVyYW5jZSZxdW90OzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+U2lmdCB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4uIFlvdSBtYXkgZmluZCBzb21ldGhpbmcgeW91IGhhZG4mIzM5O3QgdGhvdWdodCBvZiE8L2xpPlxcbjwvdWw+XFxuPHA+QWxzbywgZ2V0IGludm9sdmVkITwvcD5cXG48dWw+XFxuPGxpPkZvcmsgdGhpcyByZXBvc2l0b3J5IGFuZCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcXCI+c2VuZCBzb21lIHB1bGwgcmVxdWVzdHM8L2E+IHRvIGltcHJvdmUgdGhlc2UgZ3VpZGVzITwvbGk+XFxuPGxpPlNlZSBzb21ldGhpbmcsIHNheSBzb21ldGhpbmchIElmIHlvdSBkZXRlY3QgYSBidWcsIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzL2lzc3Vlcy9uZXdcXFwiPnBsZWFzZSBjcmVhdGUgYW4gaXNzdWU8L2E+ITwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEdldHRpbmcgU3RhcnRlZFxcblxcbiAgICBUYXVudXMgaXMgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUgZm9yIE5vZGUuanMsIGFuZCBpdCdzIF91cCB0byB5b3UgaG93IHRvIHVzZSBpdF8uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gKipzZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0KiosIGFzIHRoYXQnbGwgdGVhY2ggeW91IGhvdyBpdCB3b3JrcyBldmVuIHdoZW4gSmF2YVNjcmlwdCBuZXZlciBnZXRzIHRvIHRoZSBjbGllbnQuXFxuXFxuICAgICMgVGFibGUgb2YgQ29udGVudHNcXG5cXG4gICAgLSBbSG93IGl0IHdvcmtzXSgjaG93LWl0LXdvcmtzKVxcbiAgICAtIFtJbnN0YWxsaW5nIFRhdW51c10oI2luc3RhbGxpbmctdGF1bnVzKVxcbiAgICAtIFtTZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZV0oI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlKVxcbiAgICAgIC0gW0NyZWF0aW5nIGEgbGF5b3V0XSgjY3JlYXRpbmctYS1sYXlvdXQpXFxuICAgICAgLSBbWW91ciBmaXJzdCByb3V0ZV0oI3lvdXItZmlyc3Qtcm91dGUpXFxuICAgICAgLSBbVXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lXSgjdXNpbmctamFkZS1hcy15b3VyLXZpZXctZW5naW5lKVxcbiAgICAgIC0gW1Rocm93aW5nIGluIGEgY29udHJvbGxlcl0oI3Rocm93aW5nLWluLWEtY29udHJvbGxlcilcXG4gICAgLSBbVGF1bnVzIGluIHRoZSBjbGllbnRdKCN0YXVudXMtaW4tdGhlLWNsaWVudClcXG4gICAgICAtIFtVc2luZyB0aGUgVGF1bnVzIENMSV0oI3VzaW5nLXRoZS10YXVudXMtY2xpKVxcbiAgICAgIC0gW0Jvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcl0oI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlcilcXG4gICAgICAtIFtBZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJdKCNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXIpXFxuICAgICAgLSBbVXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUEldKCN1c2luZy10aGUtY2xpZW50LXNpZGUtdGF1bnVzLWFwaSlcXG4gICAgICAtIFtDYWNoaW5nIGFuZCBQcmVmZXRjaGluZ10oI2NhY2hpbmctYW5kLXByZWZldGNoaW5nKVxcbiAgICAtIFtUaGUgc2t5IGlzIHRoZSBsaW1pdCFdKCN0aGUtc2t5LWlzLXRoZS1saW1pdC0pXFxuXFxuICAgICMgSG93IGl0IHdvcmtzXFxuXFxuICAgIFRhdW51cyBmb2xsb3dzIGEgc2ltcGxlIGJ1dCAqKnByb3ZlbioqIHNldCBvZiBydWxlcy5cXG5cXG4gICAgLSBEZWZpbmUgYSBgZnVuY3Rpb24obW9kZWwpYCBmb3IgZWFjaCB5b3VyIHZpZXdzXFxuICAgIC0gUHV0IHRoZXNlIHZpZXdzIGluIGJvdGggdGhlIHNlcnZlciBhbmQgdGhlIGNsaWVudFxcbiAgICAtIERlZmluZSByb3V0ZXMgZm9yIHlvdXIgYXBwbGljYXRpb25cXG4gICAgLSBQdXQgdGhvc2Ugcm91dGVzIGluIGJvdGggdGhlIHNlcnZlciBhbmQgdGhlIGNsaWVudFxcbiAgICAtIEVuc3VyZSByb3V0ZSBtYXRjaGVzIHdvcmsgdGhlIHNhbWUgd2F5IG9uIGJvdGggZW5kc1xcbiAgICAtIENyZWF0ZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyB0aGF0IHlpZWxkIHRoZSBtb2RlbCBmb3IgeW91ciB2aWV3c1xcbiAgICAtIENyZWF0ZSBjbGllbnQtc2lkZSBjb250cm9sbGVycyBpZiB5b3UgbmVlZCB0byBhZGQgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byBhIHBhcnRpY3VsYXIgdmlld1xcbiAgICAtIEZvciB0aGUgZmlyc3QgcmVxdWVzdCwgYWx3YXlzIHJlbmRlciB2aWV3cyBvbiB0aGUgc2VydmVyLXNpZGVcXG4gICAgLSBXaGVuIHJlbmRlcmluZyBhIHZpZXcgb24gdGhlIHNlcnZlci1zaWRlLCBpbmNsdWRlIHRoZSBmdWxsIGxheW91dCBhcyB3ZWxsIVxcbiAgICAtIE9uY2UgdGhlIGNsaWVudC1zaWRlIGNvZGUga2lja3MgaW4sICoqaGlqYWNrIGxpbmsgY2xpY2tzKiogYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkXFxuICAgIC0gV2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGVcXG4gICAgLSBJZiB0aGUgYGhpc3RvcnlgIEFQSSBpcyB1bmF2YWlsYWJsZSwgZmFsbCBiYWNrIHRvIGdvb2Qgb2xkIHJlcXVlc3QtcmVzcG9uc2UuICoqRG9uJ3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzISoqXFxuXFxuICAgIEknbGwgc3RlcCB5b3UgdGhyb3VnaCB0aGVzZSwgYnV0IHJhdGhlciB0aGFuIGxvb2tpbmcgYXQgaW1wbGVtZW50YXRpb24gZGV0YWlscywgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBJbnN0YWxsaW5nIFRhdW51c1xcblxcbiAgICBGaXJzdCBvZmYsIHlvdSdsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC5cXG5cXG4gICAgLSBbRXhwcmVzc11bNl0sIHRocm91Z2ggW3RhdW51cy1leHByZXNzXVsxXVxcbiAgICAtIFtIYXBpXVs3XSwgdGhyb3VnaCBbdGF1bnVzLWhhcGldWzJdIGFuZCB0aGUgW2hhcGlpZnldWzNdIHRyYW5zZm9ybVxcblxcbiAgICA+IElmIHlvdSdyZSBtb3JlIG9mIGEgX1xcXCJydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJ3MgY29kZVxcXCJfIHR5cGUgb2YgZGV2ZWxvcGVyLCB5b3UgbWF5IGZlZWwgY29tZm9ydGFibGUgW2dvaW5nIHRocm91Z2ggdGhpcyB3ZWJzaXRlJ3Mgc291cmNlIGNvZGVdWzRdLCB3aGljaCB1c2VzIHRoZSBbSGFwaV1bN10gZmxhdm9yIG9mIFRhdW51cy4gQWx0ZXJuYXRpdmVseSB5b3UgY2FuIGxvb2sgYXQgdGhlIHNvdXJjZSBjb2RlIGZvciBbcG9ueWZvby5jb21dWzVdLCB3aGljaCBpcyAqKmEgbW9yZSBhZHZhbmNlZCB1c2UtY2FzZSoqIHVuZGVyIHRoZSBbRXhwcmVzc11bNl0gZmxhdm9yLiBPciwgeW91IGNvdWxkIGp1c3Qga2VlcCBvbiByZWFkaW5nIHRoaXMgcGFnZSwgdGhhdCdzIG9rYXkgdG9vLlxcblxcbiAgICBPbmNlIHlvdSd2ZSBzZXR0bGVkIGZvciBlaXRoZXIgW0V4cHJlc3NdWzZdIG9yIFtIYXBpXVs3XSB5b3UnbGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJ2xsIHVzZSBbRXhwcmVzc11bNl0uIFN3aXRjaGluZyBiZXR3ZWVuIG9uZSBvZiB0aGUgZGlmZmVyZW50IEhUVFAgZmxhdm9ycyBpcyBzdHJpa2luZ2x5IGVhc3ksIHRob3VnaC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBTZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZVxcblxcbiAgICBOYXR1cmFsbHksIHlvdSdsbCBuZWVkIHRvIGluc3RhbGwgYWxsIG9mIHRoZSBmb2xsb3dpbmcgbW9kdWxlcyBmcm9tIGBucG1gIHRvIGdldCBzdGFydGVkLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzcyAtLXNhdmVcXG4gICAgYGBgXFxuXFxuICAgIExldCdzIGJ1aWxkIG91ciBhcHBsaWNhdGlvbiBzdGVwLWJ5LXN0ZXAsIGFuZCBJJ2xsIHdhbGsgeW91IHRocm91Z2ggdGhlbSBhcyB3ZSBnbyBhbG9uZy4gRmlyc3Qgb2YgYWxsLCB5b3UnbGwgbmVlZCB0aGUgZmFtb3VzIGBhcHAuanNgIGZpbGUuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGFwcC5qc1xcbiAgICBgYGBcXG5cXG4gICAgSXQncyBwcm9iYWJseSBhIGdvb2QgaWRlYSB0byBwdXQgc29tZXRoaW5nIGluIHlvdXIgYGFwcC5qc2AgZmlsZSwgbGV0J3MgZG8gdGhhdCBub3cuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHt9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIEFsbCBgdGF1bnVzLWV4cHJlc3NgIHJlYWxseSBkb2VzIGlzIGFkZCBhIGJ1bmNoIG9mIHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgYGFwcGAuIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgYHRhdW51c0V4cHJlc3NgIGludm9jYXRpb24uIFlvdSdsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIF9cXFwiTm90IEZvdW5kXFxcIl8gdmlldywgYmxvY2tpbmcgYW55IHJvdXRpbmcgYmV5b25kIHRoYXQgcm91dGUuXFxuXFxuICAgIFRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCB0byBgdGF1bnVzRXhwcmVzc2AgbGV0J3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQncyBkaXNjdXNzIHdoYXQgbWF0dGVyczogdGhlIF9yZXF1aXJlZCBjb25maWd1cmF0aW9uXy4gVGhlcmUncyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS5cXG5cXG4gICAgLSBgbGF5b3V0YCBzaG91bGQgYmUgYSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgc2luZ2xlIGBtb2RlbGAgYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnRcXG4gICAgLSBgcm91dGVzYCBzaG91bGQgYmUgYW4gYXJyYXkgb2YgdmlldyByb3V0ZXNcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDcmVhdGluZyBhIGxheW91dFxcblxcbiAgICBMZXQncyBhbHNvIGNyZWF0ZSBhIGxheW91dC4gRm9yIHRoZSBwdXJwb3NlcyBvZiBtYWtpbmcgb3VyIHdheSB0aHJvdWdoIHRoaXMgZ3VpZGUsIGl0J2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBsYXlvdXQuanNcXG4gICAgYGBgXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYHBhcnRpYWxgIHByb3BlcnR5IGluIHRoZSBgbW9kZWxgIF8oYXMgc2VlbiBiZWxvdylfIGlzIGNyZWF0ZWQgb24gdGhlIGZseSBhZnRlciByZW5kZXJpbmcgcGFydGlhbCB2aWV3cy4gVGhlIGxheW91dCBmdW5jdGlvbiB3ZSdsbCBiZSB1c2luZyBoZXJlIGVmZmVjdGl2ZWx5IG1lYW5zIF9cXFwidGhlcmUgaXMgbm8gbGF5b3V0LCBqdXN0IHJlbmRlciB0aGUgcGFydGlhbHNcXFwiXy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgICAgIHJldHVybiBtb2RlbC5wYXJ0aWFsO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJ3Qgd2FudCB0byB3cml0ZSB2aWV3cyBhcyBKYXZhU2NyaXB0IGZ1bmN0aW9ucyBhcyB0aGF0J3MgdW5wcm9kdWN0aXZlLCBjb25mdXNpbmcsIGFuZCBoYXJkIHRvIG1haW50YWluLiBXaGF0IHlvdSBjb3VsZCBkbyBpbnN0ZWFkLCBpcyB1c2UgYSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCBhbGxvd3MgeW91IHRvIGNvbXBpbGUgeW91ciB2aWV3IHRlbXBsYXRlcyBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLlxcblxcbiAgICAtIFtNdXN0YWNoZV1bMTBdIGlzIGEgdGVtcGxhdGluZyBlbmdpbmUgdGhhdCBjYW4gY29tcGlsZSB5b3VyIHZpZXdzIGludG8gcGxhaW4gZnVuY3Rpb25zLCB1c2luZyBhIHN5bnRheCB0aGF0J3MgbWluaW1hbGx5IGRpZmZlcmVudCBmcm9tIEhUTUxcXG4gICAgLSBbSmFkZV1bMTFdIGlzIGFub3RoZXIgb3B0aW9uLCBhbmQgaXQgaGFzIGEgdGVyc2Ugc3ludGF4IHdoZXJlIHNwYWNpbmcgbWF0dGVycyBidXQgdGhlcmUncyBubyBjbG9zaW5nIHRhZ3NcXG4gICAgLSBUaGVyZSdzIG1hbnkgbW9yZSBhbHRlcm5hdGl2ZXMgbGlrZSBbTW96aWxsYSdzIE51bmp1Y2tzXVsxMl0sIFtIYW5kbGViYXJzXVsxM10sIGFuZCBbRUpTXVsxNF0uXFxuXFxuICAgIFJlbWVtYmVyIHRvIGFkZCB0aGUgYGxheW91dGAgdW5kZXIgdGhlIGBvcHRpb25zYCBvYmplY3QgcGFzc2VkIHRvIGB0YXVudXNFeHByZXNzYCFcXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIGxheW91dDogcmVxdWlyZSgnLi9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIFlvdSdsbCBmaW5kIHRvb2xzIHJlbGF0ZWQgdG8gdmlldyB0ZW1wbGF0aW5nIGluIHRoZSBbY29tcGxlbWVudGFyeSBtb2R1bGVzIHNlY3Rpb25dWzE1XS4gSWYgeW91IGRvbid0IHByb3ZpZGUgYSBgbGF5b3V0YCBwcm9wZXJ0eSBhdCBhbGwsIFRhdW51cyB3aWxsIHJlbmRlciB5b3VyIG1vZGVsIGluIGEgcmVzcG9uc2UgYnkgd3JhcHBpbmcgaXQgaW4gYDxwcmU+YCBhbmQgYDxjb2RlPmAgdGFncywgd2hpY2ggbWF5IGFpZCB5b3Ugd2hlbiBnZXR0aW5nIHN0YXJ0ZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgWW91ciBmaXJzdCByb3V0ZVxcblxcbiAgICBSb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gKip3aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZyoqLiBMZXQncyBjcmVhdGUgdGhhdCBtb2R1bGUgYW5kIGFkZCBhIHJvdXRlIHRvIGl0LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCByb3V0ZXMuanNcXG4gICAgYGBgXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBbXFxuICAgICAgeyByb3V0ZTogJy8nLCBhY3Rpb246ICdob21lL2luZGV4JyB9XFxuICAgIF07XFxuICAgIGBgYFxcblxcbiAgICBFYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSBgL2Agcm91dGUgd2l0aCB0aGUgYGhvbWUvaW5kZXhgIGFjdGlvbi4gVGF1bnVzIGZvbGxvd3MgdGhlIHdlbGwga25vd24gW2NvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm5dWzhdLCB3aGljaCBtYWRlIFtSdWJ5IG9uIFJhaWxzXVs5XSBmYW1vdXMuIF9NYXliZSBvbmUgZGF5IFRhdW51cyB3aWxsIGJlIGZhbW91cyB0b28hXyBCeSBjb252ZW50aW9uLCBUYXVudXMgd2lsbCBhc3N1bWUgdGhhdCB0aGUgYGhvbWUvaW5kZXhgIGFjdGlvbiB1c2VzIHRoZSBgaG9tZS9pbmRleGAgY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgYGhvbWUvaW5kZXhgIHZpZXcuIE9mIGNvdXJzZSwgX2FsbCBvZiB0aGF0IGNhbiBiZSBjaGFuZ2VkIHVzaW5nIGNvbmZpZ3VyYXRpb25fLlxcblxcbiAgICBUaW1lIHRvIGdvIGJhY2sgdG8gYGFwcC5qc2AgYW5kIHVwZGF0ZSB0aGUgYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIGxheW91dDogcmVxdWlyZSgnLi9sYXlvdXQnKSxcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBJdCdzIGltcG9ydGFudCB0byBrbm93IHRoYXQgaWYgeW91IG9taXQgdGhlIGNyZWF0aW9uIG9mIGEgY29udHJvbGxlciB0aGVuIFRhdW51cyB3aWxsIHNraXAgdGhhdCBzdGVwLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHBhc3NpbmcgaXQgd2hhdGV2ZXIgdGhlIGRlZmF1bHQgbW9kZWwgaXMgXyhtb3JlIG9uIHRoYXQgbGF0ZXIsIGJ1dCBpdCBkZWZhdWx0cyB0byBge31gKV8uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lXFxuXFxuICAgIExldCdzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCB2aWV3cy9ob21lL2luZGV4LmphZGVcXG4gICAgYGBgXFxuXFxuICAgIFNpbmNlIHdlJ3JlIGp1c3QgZ2V0dGluZyBzdGFydGVkLCB0aGUgdmlldyB3aWxsIGp1c3QgaGF2ZSBzb21lIGJhc2ljIHN0YXRpYyBjb250ZW50LCBhbmQgdGhhdCdzIGl0LlxcblxcbiAgICBgYGBqYWRlXFxuICAgIHAgSGVsbG8gVGF1bnVzIVxcbiAgICBgYGBcXG5cXG4gICAgTmV4dCB5b3UnbGwgd2FudCB0byBjb21waWxlIHRoZSB2aWV3IGludG8gYSBmdW5jdGlvbi4gVG8gZG8gdGhhdCB5b3UgY2FuIHVzZSBbamFkdW1dWzE2XSwgYSBzcGVjaWFsaXplZCBKYWRlIGNvbXBpbGVyIHRoYXQgcGxheXMgd2VsbCB3aXRoIFRhdW51cyBieSBiZWluZyBhd2FyZSBvZiBgcmVxdWlyZWAgc3RhdGVtZW50cywgYW5kIHRodXMgc2F2aW5nIGJ5dGVzIHdoZW4gaXQgY29tZXMgdG8gY2xpZW50LXNpZGUgcmVuZGVyaW5nLiBMZXQncyBpbnN0YWxsIGl0IGdsb2JhbGx5LCBmb3IgdGhlIHNha2Ugb2YgdGhpcyBleGVyY2lzZSBfKHlvdSBzaG91bGQgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4geW91J3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKV8uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIGphZHVtIC1nXFxuICAgIGBgYFxcblxcbiAgICBUbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIGB2aWV3c2AgZGlyZWN0b3J5IGludG8gZnVuY3Rpb25zIHRoYXQgd29yayB3ZWxsIHdpdGggVGF1bnVzLCB5b3UgY2FuIHVzZSB0aGUgY29tbWFuZCBiZWxvdy4gVGhlIGAtLW91dHB1dGAgZmxhZyBpbmRpY2F0ZXMgd2hlcmUgeW91IHdhbnQgdGhlIHZpZXdzIHRvIGJlIHBsYWNlZC4gV2UgY2hvc2UgdG8gdXNlIGAuYmluYCBiZWNhdXNlIHRoYXQncyB3aGVyZSBUYXVudXMgZXhwZWN0cyB5b3VyIGNvbXBpbGVkIHZpZXdzIHRvIGJlIGJ5IGRlZmF1bHQuIEJ1dCBzaW5jZSBUYXVudXMgZm9sbG93cyB0aGUgW2NvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uXVsxN10gYXBwcm9hY2gsIHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCBpZiB5b3Ugd2FudGVkIHRvLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBqYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuICAgIGBgYFxcblxcbiAgICBDb25ncmF0dWxhdGlvbnMhIFRhdW51cyBpcyBub3cgb3BlcmF0aW9uYWwuIEFsbCB0aGF0J3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgYDMwMDBgLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcCAmXFxuICAgIG9wZW4gaHR0cDovL2xvY2FsaG9zdDozMDAwXFxuICAgIGBgYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFRocm93aW5nIGluIGEgY29udHJvbGxlclxcblxcbiAgICBDb250cm9sbGVycyBhcmUgaW5kZWVkIG9wdGlvbmFsLCBidXQgYW4gYXBwbGljYXRpb24gdGhhdCByZW5kZXJzIGV2ZXJ5IHZpZXcgdXNpbmcgdGhlIHNhbWUgbW9kZWwgd29uJ3QgZ2V0IHZlcnkgZmFyLiBDb250cm9sbGVycyBhbGxvdyB5b3UgdG8gaGFuZGxlIHRoZSByZXF1ZXN0IGFuZCBwdXQgdG9nZXRoZXIgdGhlIG1vZGVsIHRvIGJlIHVzZWQgd2hlbiBzZW5kaW5nIGEgcmVzcG9uc2UuIENvbnRyYXJ5IHRvIHdoYXQgbW9zdCBmcmFtZXdvcmtzIHByb3Bvc2UsIFRhdW51cyBleHBlY3RzIGV2ZXJ5IGFjdGlvbiB0byBoYXZlIGl0cyBvd24gaW5kaXZpZHVhbCBjb250cm9sbGVyLiBTaW5jZSBOb2RlLmpzIG1ha2VzIGl0IGVhc3kgdG8gaW1wb3J0IGNvbXBvbmVudHMsIHRoaXMgc2V0dXAgaGVscHMgeW91IGtlZXAgeW91ciBjb2RlIG1vZHVsYXIgd2hpbGUgc3RpbGwgYmVpbmcgYWJsZSB0byByZXVzZSBsb2dpYyBieSBzaGFyaW5nIG1vZHVsZXMgYWNyb3NzIGRpZmZlcmVudCBjb250cm9sbGVycy4gTGV0J3MgY3JlYXRlIGEgY29udHJvbGxlciBmb3IgdGhlIGBob21lL3ZpZXdgIGFjdGlvbi5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGNvbnRyb2xsZXIgbW9kdWxlIHNob3VsZCBtZXJlbHkgZXhwb3J0IGEgZnVuY3Rpb24uIF9TdGFydGVkIG5vdGljaW5nIHRoZSBwYXR0ZXJuP18gVGhlIHNpZ25hdHVyZSBmb3IgdGhlIGNvbnRyb2xsZXIgaXMgdGhlIHNhbWUgc2lnbmF0dXJlIGFzIHRoYXQgb2YgYW55IG90aGVyIG1pZGRsZXdhcmUgcGFzc2VkIHRvIFtFeHByZXNzXVs2XSBfKG9yIGFueSByb3V0ZSBoYW5kbGVyIHBhc3NlZCB0byBbSGFwaV1bN10gaW4gdGhlIGNhc2Ugb2YgYHRhdW51cy1oYXBpYClfLlxcblxcbiAgICBBcyB5b3UgbWF5IGhhdmUgbm90aWNlZCBpbiB0aGUgZXhhbXBsZXMgc28gZmFyLCB5b3UgaGF2ZW4ndCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUncyBhIGZldyBtb2RlbCBwcm9wZXJ0aWVzIF8odmVyeSBmZXcpXyB0aGF0IFRhdW51cyBpcyBhd2FyZSBvZi4gT25lIG9mIHRob3NlIGlzIHRoZSBgdGl0bGVgIHByb3BlcnR5LCBhbmQgaXQnbGwgYmUgdXNlZCB0byBjaGFuZ2UgdGhlIGBkb2N1bWVudC50aXRsZWAgaW4geW91ciBwYWdlcyB3aGVuIG5hdmlnYXRpbmcgdGhyb3VnaCB0aGUgY2xpZW50LXNpZGUuIEtlZXAgaW4gbWluZCB0aGF0IGFueXRoaW5nIHRoYXQncyBub3QgaW4gdGhlIGBtb2RlbGAgcHJvcGVydHkgd29uJ3QgYmUgdHJhc21pdHRlZCB0byB0aGUgY2xpZW50LCBhbmQgd2lsbCBqdXN0IGJlIGFjY2Vzc2libGUgdG8gdGhlIGxheW91dC5cXG5cXG4gICAgSGVyZSBpcyBvdXIgbmV3ZmFuZ2xlZCBgaG9tZS9pbmRleGAgY29udHJvbGxlci4gQXMgeW91J2xsIG5vdGljZSwgaXQgZG9lc24ndCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gYG5leHRgIGlzIGNhbGxlZCwgdGhlIFRhdW51cyB2aWV3LXJlbmRlcmluZyBoYW5kbGVyIHdpbGwga2ljayBpbiwgYW5kIHJlbmRlciB0aGUgdmlldyB1c2luZyB0aGUgaW5mb3JtYXRpb24gdGhhdCB3YXMgYXNzaWduZWQgdG8gYHJlcy52aWV3TW9kZWxgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICAgICAgcmVzLnZpZXdNb2RlbCA9IHtcXG4gICAgICAgIG1vZGVsOiB7XFxuICAgICAgICAgIHRpdGxlOiAnV2VsY29tZSBIb21lLCBUYXVudXMhJ1xcbiAgICAgICAgfVxcbiAgICAgIH07XFxuICAgICAgbmV4dCgpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCByZWx5aW5nIG9uIHRoZSBjbGllbnQtc2lkZSBjaGFuZ2VzIHRvIHlvdXIgcGFnZSBpbiBvcmRlciB0byBzZXQgdGhlIHZpZXcgdGl0bGUgX3dvdWxkbid0IGJlIHByb2dyZXNzaXZlXywgYW5kIHRodXMgW2l0IHdvdWxkIGJlIHJlYWxseSwgX3JlYWxseV8gYmFkXVsxN10uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgYHRpdGxlYCBoYXMgYmVlbiBwYXNzZWQgdG8gdGhlIG1vZGVsLiBJbiBmYWN0LCBsZXQncyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhIFRoZSBgIT1gIHN5bnRheCBtZWFucyB0aGF0IHdoYXRldmVyIGlzIGluIHRoZSB2YWx1ZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudCB3b24ndCBiZSBlc2NhcGVkLiBUaGF0J3Mgb2theSBiZWNhdXNlIGBwYXJ0aWFsYCBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJ3Qgd2FudCBIVE1MIHRhZ3MgdG8gYmUgZXNjYXBlZCFcXG5cXG4gICAgYGBgamFkZVxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtYWluIT1wYXJ0aWFsXFxuICAgIGBgYFxcblxcbiAgICBCeSB0aGUgd2F5LCBkaWQgeW91IGtub3cgdGhhdCBgPGh0bWw+YCwgYDxoZWFkPmAsIGFuZCBgPGJvZHk+YCBhcmUgYWxsIG9wdGlvbmFsIGluIEhUTUwgNSwgYW5kIHRoYXQgeW91IGNhbiBzYWZlbHkgb21pdCB0aGVtIGluIHlvdXIgSFRNTD8gT2YgY291cnNlLCByZW5kZXJpbmcgZW5naW5lcyB3aWxsIHN0aWxsIGluc2VydCB0aG9zZSBlbGVtZW50cyBhdXRvbWF0aWNhbGx5IGludG8gdGhlIERPTSBmb3IgeW91ISBfSG93IGNvb2wgaXMgdGhhdD9fXFxuXFxuICAgIFRoYXQncyBpdCwgbm93IHlvdXIgdmlldyBoYXMgYSB0aXRsZS4gT2YgY291cnNlLCB0aGVyZSdzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIGBuZXh0YCB0byByZW5kZXIgdGhlIHZpZXcuXFxuXFxuICAgIFRoZXJlJ3MgYWxzbyB0aGUgY2xpZW50LXNpZGUgYXNwZWN0IG9mIHNldHRpbmcgdXAgVGF1bnVzLiBMZXQncyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGF1bnVzIGluIHRoZSBjbGllbnRcXG5cXG4gICAgWW91IGFscmVhZHkga25vdyBob3cgdG8gc2V0IHVwIHRoZSBiYXNpY3MgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZywgYW5kIHlvdSBrbm93IHRoYXQgeW91IHNob3VsZCBbY2hlY2sgb3V0IHRoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdIHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLlxcblxcbiAgICBUaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIF9vciBpZiBpdCBoYXNuJ3QgbG9hZGVkIHlldCBkdWUgdG8gYSBzbG93IGNvbm5lY3Rpb24gc3VjaCBhcyB0aG9zZSBpbiB1bnN0YWJsZSBtb2JpbGUgbmV0d29ya3NfLCB0aGUgcmVndWxhciBsaW5rIHdvdWxkIGJlIGZvbGxvd2VkIGluc3RlYWQgYW5kIG5vIGhhcm0gd291bGQgYmUgdW5sZWFzaGVkIHVwb24gdGhlIGh1bWFuLCBleGNlcHQgdGhleSB3b3VsZCBnZXQgYSBzbGlnaHRseSBsZXNzIGZhbmN5IGV4cGVyaWVuY2UuXFxuXFxuICAgIFNldHRpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGludm9sdmVzIGEgZmV3IGRpZmZlcmVudCBzdGVwcy4gRmlyc3RseSwgd2UnbGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbidzIHdpcmluZyBfKHRoZSByb3V0ZXMgYW5kIEphdmFTY3JpcHQgdmlldyBmdW5jdGlvbnMpXyBpbnRvIHNvbWV0aGluZyB0aGUgYnJvd3NlciB1bmRlcnN0YW5kcy4gVGhlbiwgeW91J2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQncyBvdXQgb2YgdGhlIHdheSwgY2xpZW50LXNpZGUgcm91dGluZyB3b3VsZCBiZSBzZXQgdXAuXFxuXFxuICAgIEFzIHN1Z2FyIGNvYXRpbmcgb24gdG9wIG9mIHRoYXQsIHlvdSBtYXkgYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdXNpbmcgY29udHJvbGxlcnMuIFRoZXNlIGNvbnRyb2xsZXJzIHdvdWxkIGJlIGV4ZWN1dGVkIGV2ZW4gaWYgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS4gVGhleSBjYW4gYWNjZXNzIHRoZSBUYXVudXMgQVBJIGRpcmVjdGx5LCBpbiBjYXNlIHlvdSBuZWVkIHRvIG5hdmlnYXRlIHRvIGFub3RoZXIgdmlldyBpbiBzb21lIHdheSBvdGhlciB0aGFuIGJ5IGhhdmluZyBodW1hbnMgY2xpY2sgb24gYW5jaG9yIHRhZ3MuIFRoZSBBUEksIGFzIHlvdSdsbCBsZWFybiwgd2lsbCBhbHNvIGxldCB5b3UgcmVuZGVyIHBhcnRpYWwgdmlld3MgdXNpbmcgdGhlIHBvd2VyZnVsIFRhdW51cyBlbmdpbmUsIGxpc3RlbiBmb3IgZXZlbnRzIHRoYXQgbWF5IG9jY3VyIGF0IGtleSBzdGFnZXMgb2YgdGhlIHZpZXctcmVuZGVyaW5nIHByb2Nlc3MsIGFuZCBldmVuIGludGVyY2VwdCBBSkFYIHJlcXVlc3RzIGJsb2NraW5nIHRoZW0gYmVmb3JlIHRoZXkgZXZlciBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIFRhdW51cyBDTElcXG5cXG4gICAgVGF1bnVzIGNvbWVzIHdpdGggYSBDTEkgdGhhdCBjYW4gYmUgdXNlZCB0byB3aXJlIHlvdXIgTm9kZS5qcyByb3V0ZXMgYW5kIHZpZXdzIGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGUgc2FtZSBDTEkgY2FuIGJlIHVzZWQgdG8gd2lyZSB1cCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXMgd2VsbC4gVGhlIG1haW4gcmVhc29uIHdoeSB0aGUgVGF1bnVzIENMSSBleGlzdHMgaXMgc28gdGhhdCB5b3UgZG9uJ3QgaGF2ZSB0byBgcmVxdWlyZWAgZXZlcnkgc2luZ2xlIHZpZXcgYW5kIGNvbnRyb2xsZXIsIHVuZG9pbmcgYSBsb3Qgb2YgdGhlIHdvcmsgdGhhdCB3YXMgcHV0IGludG8gY29kZSByZXVzZS4gSnVzdCBsaWtlIHdlIGRpZCB3aXRoIGBqYWR1bWAgZWFybGllciwgd2UnbGwgaW5zdGFsbCB0aGUgYHRhdW51c2AgQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgdGF1bnVzIC1nXFxuICAgIGBgYFxcblxcbiAgICBUaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0J2xsIHByaW50IG91dCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGlmIHlvdSB3YW50IHRvIHBlcnNpc3QgaXQgeW91IHNob3VsZCBwcm92aWRlIHRoZSBgLS1vdXRwdXRgIGZsYWcuIEluIHR5cGljYWwgW2NvbnZlbnRpb24tb3Zlci1jb25maWd1cmF0aW9uXVs4XSBmYXNoaW9uLCB0aGUgQ0xJIHdpbGwgZGVmYXVsdCB0byBpbmZlcnJpbmcgeW91ciB2aWV3cyBhcmUgbG9jYXRlZCBpbiBgLmJpbi92aWV3c2AgYW5kIHRoYXQgeW91IHdhbnQgdGhlIHdpcmluZyBtb2R1bGUgdG8gYmUgcGxhY2VkIGluIGAuYmluL3dpcmluZy5qc2AsIGJ1dCB5b3UnbGwgYmUgYWJsZSB0byBjaGFuZ2UgdGhhdCBpZiBpdCBkb2Vzbid0IG1lZXQgeW91ciBuZWVkcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0XFxuICAgIGBgYFxcblxcbiAgICBBdCB0aGlzIHBvaW50IGluIG91ciBleGFtcGxlLCB0aGUgQ0xJIHNob3VsZCBjcmVhdGUgYSBgLmJpbi93aXJpbmcuanNgIGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIGB0YXVudXNgIGlzIGFuIGF1dG9tYXRlZCBjb2RlLWdlbmVyYXRpb24gdG9vbCwgaXQncyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGVtcGxhdGVzID0ge1xcbiAgICAgICdob21lL2luZGV4JzogcmVxdWlyZSgnLi92aWV3cy9ob21lL2luZGV4LmpzJylcXG4gICAgfTtcXG5cXG4gICAgdmFyIGNvbnRyb2xsZXJzID0ge1xcbiAgICB9O1xcblxcbiAgICB2YXIgcm91dGVzID0ge1xcbiAgICAgICcvJzoge1xcbiAgICAgICAgYWN0aW9uOiAnaG9tZS9pbmRleCdcXG4gICAgICB9XFxuICAgIH07XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0ge1xcbiAgICAgIHRlbXBsYXRlczogdGVtcGxhdGVzLFxcbiAgICAgIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gICAgICByb3V0ZXM6IHJvdXRlc1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgTm90ZSB0aGF0IHRoZSBgY29udHJvbGxlcnNgIG9iamVjdCBpcyBlbXB0eSBiZWNhdXNlIHlvdSBoYXZlbid0IGNyZWF0ZWQgYW55IF9jbGllbnQtc2lkZSBjb250cm9sbGVyc18geWV0LiBXZSBjcmVhdGVkIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGJ1dCB0aG9zZSBkb24ndCBoYXZlIGFueSBlZmZlY3QgaW4gdGhlIGNsaWVudC1zaWRlLCBiZXNpZGVzIGRldGVybWluaW5nIHdoYXQgZ2V0cyBzZW50IHRvIHRoZSBjbGllbnQuXFxuXFxuICAgIFRoZSBDTEkgY2FuIGJlIGVudGlyZWx5IGlnbm9yZWQsIHlvdSBjb3VsZCB3cml0ZSB0aGVzZSBkZWZpbml0aW9ucyBieSB5b3Vyc2VsZiwgYnV0IHlvdSB3b3VsZCBoYXZlIHRvIHJlbWVtYmVyIHRvIHVwZGF0ZSB0aGlzIGZpbGUgd2hlbmV2ZXIgeW91IGFkZCwgY2hhbmdlLCBvciByZW1vdmUgYSB2aWV3LCBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIsIG9yIGEgcm91dGUuIERvaW5nIHRoYXQgd291bGQgYmUgY3VtYmVyc29tZSwgYW5kIHRoZSBDTEkgc29sdmVzIHRoYXQgcHJvYmxlbSBmb3IgdXMgYXQgdGhlIGV4cGVuc2Ugb2Ygb25lIGFkZGl0aW9uYWwgYnVpbGQgc3RlcC5cXG5cXG4gICAgRHVyaW5nIGRldmVsb3BtZW50LCB5b3UgY2FuIGFsc28gYWRkIHRoZSBgLS13YXRjaGAgZmxhZywgd2hpY2ggd2lsbCByZWJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIGlmIGEgcmVsZXZhbnQgZmlsZSBjaGFuZ2VzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXQgLS13YXRjaFxcbiAgICBgYGBcXG5cXG4gICAgSWYgeW91J3JlIHVzaW5nIEhhcGkgaW5zdGVhZCBvZiBFeHByZXNzLCB5b3UnbGwgYWxzbyBuZWVkIHRvIHBhc3MgaW4gdGhlIGBoYXBpaWZ5YCB0cmFuc2Zvcm0gc28gdGhhdCByb3V0ZXMgZ2V0IGNvbnZlcnRlZCBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGluZyBtb2R1bGUgdW5kZXJzdGFuZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0tdHJhbnNmb3JtIGhhcGlpZnlcXG4gICAgYGBgXFxuXFxuICAgIE5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJcXG5cXG4gICAgT25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIGBjbGllbnQvanNgIHRvIGtlZXAgYWxsIG9mIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdCBsb2dpYywgYnV0IHRoYXQgaXMgdXAgdG8geW91IHRvby4gRm9yIHRoZSBzYWtlIG9mIHRoaXMgZ3VpZGUsIGxldCdzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggY2xpZW50L2pzL21haW4uanNcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgbWFpbmAgbW9kdWxlIHdpbGwgYmUgdXNlZCBhcyB0aGUgX2VudHJ5IHBvaW50XyBvZiB5b3VyIGFwcGxpY2F0aW9uIG9uIHRoZSBjbGllbnQtc2lkZS4gSGVyZSB5b3UnbGwgbmVlZCB0byBpbXBvcnQgYHRhdW51c2AsIHRoZSB3aXJpbmcgbW9kdWxlIHdlJ3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSBgdGF1bnVzLm1vdW50YC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB3aXJpbmcgPSByZXF1aXJlKCcuLi8uLi8uYmluL3dpcmluZycpO1xcbiAgICB2YXIgbWFpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdtYWluJylbMF07XFxuXFxuICAgIHRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIG1vdW50cG9pbnQgd2lsbCBzZXQgdXAgdGhlIGNsaWVudC1zaWRlIFRhdW51cyByb3V0ZXIgYW5kIGZpcmUgdGhlIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlciBmb3IgdGhlIHZpZXcgdGhhdCBoYXMgYmVlbiByZW5kZXJlZCBpbiB0aGUgc2VydmVyLXNpZGUuIFdoZW5ldmVyIGFuIGFuY2hvciBsaW5rIGlzIGNsaWNrZWQsIFRhdW51cyB3aWxsIGJlIGFibGUgdG8gaGlqYWNrIHRoYXQgY2xpY2sgYW5kIHJlcXVlc3QgdGhlIG1vZGVsIHVzaW5nIEFKQVgsIGJ1dCBvbmx5IGlmIGl0IG1hdGNoZXMgYSB2aWV3IHJvdXRlLiBPdGhlcndpc2UgdGhlIGxpbmsgd2lsbCBiZWhhdmUganVzdCBsaWtlIGFueSBub3JtYWwgbGluayB3b3VsZC5cXG5cXG4gICAgQnkgZGVmYXVsdCwgdGhlIG1vdW50cG9pbnQgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3LiBUaGlzIGlzIGFraW4gdG8gd2hhdCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIGZyYW1ld29ya3Mgc3VjaCBhcyBBbmd1bGFySlMgZG8sIHdoZXJlIHZpZXdzIGFyZSBvbmx5IHJlbmRlcmVkIGFmdGVyIGFsbCB0aGUgSmF2YVNjcmlwdCBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGFuZCBleGVjdXRlZC4gRXhjZXB0IFRhdW51cyBwcm92aWRlcyBodW1hbi1yZWFkYWJsZSBjb250ZW50IGZhc3RlciwgYmVmb3JlIHRoZSBKYXZhU2NyaXB0IGV2ZW4gYmVnaW5zIGRvd25sb2FkaW5nLCBhbHRob3VnaCBpdCB3b24ndCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuXFxuXFxuICAgIEFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgYDxzY3JpcHQgdHlwZT0ndGV4dC90YXVudXMnPmAgdGFnLCBidXQgdGhpcyB0ZW5kcyB0byBzbG93IGRvd24gdGhlIGluaXRpYWwgcmVzcG9uc2UgKG1vZGVscyBhcmUgX3R5cGljYWxseSBsYXJnZXJfIHRoYW4gdGhlIHJlc3VsdGluZyB2aWV3cykuXFxuXFxuICAgIEEgdGhpcmQgc3RyYXRlZ3kgaXMgdGhhdCB5b3UgcmVxdWVzdCB0aGUgbW9kZWwgYXN5bmNocm9ub3VzbHkgb3V0c2lkZSBvZiBUYXVudXMsIGFsbG93aW5nIHlvdSB0byBmZXRjaCBib3RoIHRoZSB2aWV3IG1vZGVsIGFuZCBUYXVudXMgaXRzZWxmIGNvbmN1cnJlbnRseSwgYnV0IHRoYXQncyBoYXJkZXIgdG8gc2V0IHVwLlxcblxcbiAgICBUaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gW3RoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdIGFuZCBmdXJ0aGVyIGRpc2N1c3NlZCBpbiBbdGhlIG9wdGltaXphdGlvbiBndWlkZV1bMjVdLiBGb3Igbm93LCB0aGUgZGVmYXVsdCBzdHJhdGVneSBfKGAnYXV0bydgKV8gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBBZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJcXG5cXG4gICAgQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCdzIGEgcGFydGlhbC4gVGhlIGNvbnRyb2xsZXIgaXMgcGFzc2VkIHRoZSBgbW9kZWxgLCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIGByb3V0ZWAsIGJyb2tlbiBkb3duIGludG8gaXRzIGNvbXBvbmVudHM7IGFuZCB0aGUgYGNvbnRhaW5lcmAsIHdoaWNoIGlzIHdoYXRldmVyIERPTSBlbGVtZW50IHRoZSB2aWV3IHdhcyByZW5kZXJlZCBpbnRvLlxcblxcbiAgICBUaGVzZSBjb250cm9sbGVycyBhcmUgZW50aXJlbHkgb3B0aW9uYWwsIHdoaWNoIG1ha2VzIHNlbnNlIHNpbmNlIHdlJ3JlIHByb2dyZXNzaXZlbHkgZW5oYW5jaW5nIHRoZSBhcHBsaWNhdGlvbjogaXQgbWlnaHQgbm90IGV2ZW4gYmUgbmVjZXNzYXJ5ISBMZXQncyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJ3ZlIGJlZW4gYnVpbGRpbmcuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuICAgIGBgYFxcblxcbiAgICBHdWVzcyB3aGF0PyBUaGUgY29udHJvbGxlciBzaG91bGQgYmUgYSBtb2R1bGUgd2hpY2ggZXhwb3J0cyBhIGZ1bmN0aW9uLiBUaGF0IGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIHdoZW5ldmVyIHRoZSB2aWV3IGlzIHJlbmRlcmVkLiBGb3IgdGhlIHNha2Ugb2Ygc2ltcGxpY2l0eSB3ZSdsbCBqdXN0IHByaW50IHRoZSBhY3Rpb24gYW5kIHRoZSBtb2RlbCB0byB0aGUgY29uc29sZS4gSWYgdGhlcmUncyBvbmUgcGxhY2Ugd2hlcmUgeW91J2Qgd2FudCB0byBlbmhhbmNlIHRoZSBleHBlcmllbmNlLCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgd2hlcmUgeW91IHdhbnQgdG8gcHV0IHlvdXIgY29kZS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCwgcm91dGUsIGNvbnRhaW5lcikge1xcbiAgICAgIGNvbnNvbGUubG9nKCdSZW5kZXJlZCB2aWV3ICVzIHVzaW5nIG1vZGVsICVzJywgcm91dGUuYWN0aW9uLCBtb2RlbCk7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJXFxuXFxuICAgIFRhdW51cyBkb2VzIHByb3ZpZGUgW2EgdGhpbiBBUEldWzE4XSBpbiB0aGUgY2xpZW50LXNpZGUuIFVzYWdlIG9mIHRoYXQgQVBJIGJlbG9uZ3MgbW9zdGx5IGluc2lkZSB0aGUgYm9keSBvZiBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXJzLCBidXQgdGhlcmUncyBhIGZldyBtZXRob2RzIHlvdSBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygb24gYSBnbG9iYWwgc2NhbGUgYXMgd2VsbC5cXG5cXG4gICAgVGF1bnVzIGNhbiBub3RpZnkgeW91IHdoZW5ldmVyIGltcG9ydGFudCBldmVudHMgb2NjdXIuXFxuXFxuICAgIEV2ZW50ICAgICAgICAgICAgfCBBcmd1bWVudHMgICAgICAgICAgICAgICB8IERlc2NyaXB0aW9uXFxuICAgIC0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGAnc3RhcnQnYCAgICAgICAgfCBgY29udGFpbmVyLCBtb2RlbGAgICAgICB8IEVtaXR0ZWQgd2hlbiBgdGF1bnVzLm1vdW50YCBmaW5pc2hlZCB0aGUgcm91dGUgc2V0dXAgYW5kIGlzIGFib3V0IHRvIGludm9rZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlci4gU3Vic2NyaWJlIHRvIHRoaXMgZXZlbnQgYmVmb3JlIGNhbGxpbmcgYHRhdW51cy5tb3VudGAuXFxuICAgIGAncmVuZGVyJ2AgICAgICAgfCBgY29udGFpbmVyLCBtb2RlbGAgICAgICB8IEEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkXFxuICAgIGAnZmV0Y2guc3RhcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLlxcbiAgICBgJ2ZldGNoLmRvbmUnYCAgIHwgIGByb3V0ZSwgY29udGV4dCwgZGF0YWAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5LlxcbiAgICBgJ2ZldGNoLmFib3J0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGlzIHB1cnBvc2VseSBhYm9ydGVkLlxcbiAgICBgJ2ZldGNoLmVycm9yJ2AgIHwgIGByb3V0ZSwgY29udGV4dCwgZXJyYCAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci5cXG5cXG4gICAgQmVzaWRlcyBldmVudHMsIHRoZXJlJ3MgYSBjb3VwbGUgbW9yZSBtZXRob2RzIHlvdSBjYW4gdXNlLiBUaGUgYHRhdW51cy5uYXZpZ2F0ZWAgbWV0aG9kIGFsbG93cyB5b3UgdG8gbmF2aWdhdGUgdG8gYSBVUkwgd2l0aG91dCB0aGUgbmVlZCBmb3IgYSBodW1hbiB0byBjbGljayBvbiBhbiBhbmNob3IgbGluay4gVGhlbiB0aGVyZSdzIGB0YXVudXMucGFydGlhbGAsIGFuZCB0aGF0IGFsbG93cyB5b3UgdG8gcmVuZGVyIGFueSBwYXJ0aWFsIHZpZXcgb24gYSBET00gZWxlbWVudCBvZiB5b3VyIGNob29zaW5nLCBhbmQgaXQnbGwgdGhlbiBpbnZva2UgaXRzIGNvbnRyb2xsZXIuIFlvdSdsbCBuZWVkIHRvIGNvbWUgdXAgd2l0aCB0aGUgbW9kZWwgeW91cnNlbGYsIHRob3VnaC5cXG5cXG4gICAgQXN0b25pc2hpbmdseSwgdGhlIEFQSSBpcyBmdXJ0aGVyIGRvY3VtZW50ZWQgaW4gW3RoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENhY2hpbmcgYW5kIFByZWZldGNoaW5nXFxuXFxuICAgIFtQZXJmb3JtYW5jZV1bMjVdIHBsYXlzIGFuIGltcG9ydGFudCByb2xlIGluIFRhdW51cy4gVGhhdCdzIHdoeSB0aGUgeW91IGNhbiBwZXJmb3JtIGNhY2hpbmcgYW5kIHByZWZldGNoaW5nIG9uIHRoZSBjbGllbnQtc2lkZSBqdXN0IGJ5IHR1cm5pbmcgb24gYSBwYWlyIG9mIGZsYWdzLiBCdXQgd2hhdCBkbyB0aGVzZSBmbGFncyBkbyBleGFjdGx5P1xcblxcbiAgICBXaGVuIHR1cm5lZCBvbiwgYnkgcGFzc2luZyBgeyBjYWNoZTogdHJ1ZSB9YCBhcyB0aGUgdGhpcmQgcGFyYW1ldGVyIGZvciBgdGF1bnVzLm1vdW50YCwgdGhlIGNhY2hpbmcgbGF5ZXIgd2lsbCBtYWtlIHN1cmUgdGhhdCByZXNwb25zZXMgYXJlIGtlcHQgYXJvdW5kIGZvciBgMTVgIHNlY29uZHMuIFdoZW5ldmVyIGEgcm91dGUgbmVlZHMgYSBtb2RlbCBpbiBvcmRlciB0byByZW5kZXIgYSB2aWV3LCBpdCdsbCBmaXJzdCBhc2sgdGhlIGNhY2hpbmcgbGF5ZXIgZm9yIGEgZnJlc2ggY29weS4gSWYgdGhlIGNhY2hpbmcgbGF5ZXIgZG9lc24ndCBoYXZlIGEgY29weSwgb3IgaWYgdGhhdCBjb3B5IGlzIHN0YWxlIF8oaW4gdGhpcyBjYXNlLCBvbGRlciB0aGFuIGAxNWAgc2Vjb25kcylfLCB0aGVuIGFuIEFKQVggcmVxdWVzdCB3aWxsIGJlIGlzc3VlZCB0byB0aGUgc2VydmVyLiBPZiBjb3Vyc2UsIHRoZSBkdXJhdGlvbiBpcyBjb25maWd1cmFibGUuIElmIHlvdSB3YW50IHRvIHVzZSBhIHZhbHVlIG90aGVyIHRoYW4gdGhlIGRlZmF1bHQsIHlvdSBzaG91bGQgc2V0IGBjYWNoZWAgdG8gYSBudW1iZXIgaW4gc2Vjb25kcyBpbnN0ZWFkIG9mIGp1c3QgYHRydWVgLlxcblxcbiAgICBTaW5jZSBUYXVudXMgdW5kZXJzdGFuZHMgdGhhdCBub3QgZXZlcnkgdmlldyBvcGVyYXRlcyB1bmRlciB0aGUgc2FtZSBjb25zdHJhaW50cywgeW91J3JlIGFsc28gYWJsZSB0byBzZXQgYSBgY2FjaGVgIGZyZXNobmVzcyBkdXJhdGlvbiBkaXJlY3RseSBpbiB5b3VyIHJvdXRlcy4gVGhlIGBjYWNoZWAgcHJvcGVydHkgaW4gcm91dGVzIGhhcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGRlZmF1bHQgdmFsdWUuXFxuXFxuICAgIFRoZXJlJ3MgY3VycmVudGx5IHR3byBjYWNoaW5nIHN0b3JlczogYSByYXcgaW4tbWVtb3J5IHN0b3JlLCBhbmQgYW4gW0luZGV4ZWREQl1bMjhdIHN0b3JlLiBJbmRleGVkREIgaXMgYW4gZW1iZWRkZWQgZGF0YWJhc2Ugc29sdXRpb24sIGFuZCB5b3UgY2FuIHRoaW5rIG9mIGl0IGxpa2UgYW4gYXN5bmNocm9ub3VzIHZlcnNpb24gb2YgYGxvY2FsU3RvcmFnZWAuIEl0IGhhcyBbc3VycHJpc2luZ2x5IGJyb2FkIGJyb3dzZXIgc3VwcG9ydF1bMjldLCBhbmQgaW4gdGhlIGNhc2VzIHdoZXJlIGl0J3Mgbm90IHN1cHBvcnRlZCB0aGVuIGNhY2hpbmcgaXMgZG9uZSBzb2xlbHkgaW4tbWVtb3J5LlxcblxcbiAgICBUaGUgcHJlZmV0Y2hpbmcgbWVjaGFuaXNtIGlzIGFuIGludGVyZXN0aW5nIHNwaW4tb2ZmIG9mIGNhY2hpbmcsIGFuZCBpdCByZXF1aXJlcyBjYWNoaW5nIHRvIGJlIGVuYWJsZWQgaW4gb3JkZXIgdG8gd29yay4gV2hlbmV2ZXIgaHVtYW5zIGhvdmVyIG92ZXIgYSBsaW5rLCBvciB3aGVuZXZlciB0aGV5IHB1dCB0aGVpciBmaW5nZXIgb24gb25lIG9mIHRoZW0gXyh0aGUgYHRvdWNoc3RhcnRgIGV2ZW50KV8sIHRoZSBwcmVmZXRjaGVyIHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBmb3IgdGhhdCBsaW5rLlxcblxcbiAgICBJZiB0aGUgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseSB0aGVuIHRoZSByZXNwb25zZSB3aWxsIGJlIGNhY2hlZCBpbiB0aGUgc2FtZSB3YXkgYW55IG90aGVyIHZpZXcgd291bGQgYmUgY2FjaGVkLiBJZiB0aGUgaHVtYW4gaG92ZXJzIG92ZXIgYW5vdGhlciBsaW5rIHdoaWxlIHRoZSBwcmV2aW91cyBvbmUgaXMgc3RpbGwgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGUgb2xkIHJlcXVlc3QgaXMgYWJvcnRlZCwgYXMgbm90IHRvIGRyYWluIHRoZWlyIF8ocG9zc2libHkgbGltaXRlZClfIEludGVybmV0IGNvbm5lY3Rpb24gYmFuZHdpZHRoLlxcblxcbiAgICBJZiB0aGUgaHVtYW4gY2xpY2tzIG9uIHRoZSBsaW5rIGJlZm9yZSBwcmVmZXRjaGluZyBpcyBjb21wbGV0ZWQsIGhlJ2xsIG5hdmlnYXRlIHRvIHRoZSB2aWV3IGFzIHNvb24gYXMgcHJlZmV0Y2hpbmcgZW5kcywgcmF0aGVyIHRoYW4gZmlyaW5nIGFub3RoZXIgcmVxdWVzdC4gVGhpcyBoZWxwcyBUYXVudXMgc2F2ZSBwcmVjaW91cyBtaWxsaXNlY29uZHMgd2hlbiBkZWFsaW5nIHdpdGggbGF0ZW5jeS1zZW5zaXRpdmUgb3BlcmF0aW9ucy5cXG5cXG4gICAgVHVybmluZyBwcmVmZXRjaGluZyBvbiBpcyBzaW1wbHkgYSBtYXR0ZXIgb2Ygc2V0dGluZyBgcHJlZmV0Y2hgIHRvIGB0cnVlYCBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAuIEZvciBhZGRpdGlvbmFsIGluc2lnaHRzIGludG8gdGhlIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50cyBUYXVudXMgY2FuIG9mZmVyLCBoZWFkIG92ZXIgdG8gdGhlIFtQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25zXVsyNV0gZ3VpZGUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGhlIHNreSBpcyB0aGUgbGltaXQhXFxuXFxuICAgIFlvdSdyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4ndCBzdG9wIHRoZXJlLlxcblxcbiAgICAtIExlYXJuIG1vcmUgYWJvdXQgW3RoZSBBUEkgVGF1bnVzIGhhc11bMThdIHRvIG9mZmVyXFxuICAgIC0gR28gdGhyb3VnaCB0aGUgW3BlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzXVsyNV0uIFlvdSBtYXkgbGVhcm4gc29tZXRoaW5nIG5ldyFcXG4gICAgLSBfRmFtaWxpYXJpemUgeW91cnNlbGYgd2l0aCB0aGUgd2F5cyBvZiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudF9cXG4gICAgICAtIEplcmVteSBLZWl0aCBlbnVuY2lhdGVzIFtcXFwiQmUgcHJvZ3Jlc3NpdmVcXFwiXVsyMF1cXG4gICAgICAtIENocmlzdGlhbiBIZWlsbWFubiBhZHZvY2F0ZXMgZm9yIFtcXFwiUHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50XFxcIl1bMjZdXFxuICAgICAgLSBKYWtlIEFyY2hpYmFsZCBleHBsYWlucyBob3cgW1xcXCJQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXJcXFwiXVsyMl1cXG4gICAgICAtIEkgYmxvZ2dlZCBhYm91dCBob3cgd2Ugc2hvdWxkIFtcXFwiU3RvcCBCcmVha2luZyB0aGUgV2ViXFxcIl1bMTddXFxuICAgICAgLSBHdWlsbGVybW8gUmF1Y2ggYXJndWVzIGZvciBbXFxcIjcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnNcXFwiXVsyNF1cXG4gICAgICAtIEFhcm9uIEd1c3RhZnNvbiB3cml0ZXMgW1xcXCJVbmRlcnN0YW5kaW5nIFByb2dyZXNzaXZlIEVuaGFuY2VtZW50XFxcIl1bMjFdXFxuICAgICAgLSBPcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIFtcXFwiUHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgZm9yIGZhdWx0IHRvbGVyYW5jZVxcXCJdWzIzXVxcbiAgICAtIFNpZnQgdGhyb3VnaCB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlc11bMTVdLiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJ3QgdGhvdWdodCBvZiFcXG5cXG4gICAgQWxzbywgZ2V0IGludm9sdmVkIVxcblxcbiAgICAtIEZvcmsgdGhpcyByZXBvc2l0b3J5IGFuZCBbc2VuZCBzb21lIHB1bGwgcmVxdWVzdHNdWzE5XSB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyFcXG4gICAgLSBTZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCBbcGxlYXNlIGNyZWF0ZSBhbiBpc3N1ZV1bMjddIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICBbMV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzJdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFszXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vXFxuICAgIFs2XTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzddOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbOF06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG4gICAgWzldOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1J1Ynlfb25fUmFpbHNcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXG4gICAgWzExXTogaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxuICAgIFsxMl06IGh0dHA6Ly9tb3ppbGxhLmdpdGh1Yi5pby9udW5qdWNrcy9cXG4gICAgWzEzXTogaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxuICAgIFsxNF06IGh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxuICAgIFsxNV06IC9jb21wbGVtZW50c1xcbiAgICBbMTZdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvamFkdW1cXG4gICAgWzE3XTogaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcbiAgICBbMThdOiAvYXBpXFxuICAgIFsxOV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvL3B1bGxzXFxuICAgIFsyMF06IGh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxuICAgIFsyMV06IGh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxuICAgIFsyMl06IGh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXG4gICAgWzIzXTogaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcbiAgICBbMjRdOiBodHRwOi8vcmF1Y2hnLmNvbS8yMDE0LzctcHJpbmNpcGxlcy1vZi1yaWNoLXdlYi1hcHBsaWNhdGlvbnMvXFxuICAgIFsyNV06IC9wZXJmb3JtYW5jZVxcbiAgICBbMjZdOiBodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcbiAgICBbMjddOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxuICAgIFsyOF06IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxuICAgIFsyOV06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGVyZm9ybWFuY2UobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwicGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxcIj5QZXJmb3JtYW5jZSBPcHRpbWl6YXRpb248L2gxPlxcbjxwPkZvbzwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcblxcbiAgICBGb29cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbm90Rm91bmQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIk5vdCBGb3VuZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiXFxcIiB0YXJnZXQ9XFxcIl9ibGFua1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiJm1kYXNoOyBAbnpnYlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9wPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcImgxIE5vdCBGb3VuZFxcblxcbnAgVGhlcmUgZG9lc24ndCBzZWVtIHRvIGJlIGFueXRoaW5nIGhlcmUgeWV0LiBJZiB5b3UgYmVsaWV2ZSB0aGlzIHRvIGJlIGEgbWlzdGFrZSwgcGxlYXNlIGxldCB1cyBrbm93IVxcbnBcXG4gIGEoaHJlZj0naHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiJywgdGFyZ2V0PSdfYmxhbmsnKSAmbWRhc2g7IEBuemdiXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxheW91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCwgbW9kZWwsIHBhcnRpYWwpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPCFET0NUWVBFIGh0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aHRtbCBsYW5nPVxcXCJlblxcXCIgaXRlbXNjb3BlIGl0ZW10eXBlPVxcXCJodHRwOi8vc2NoZW1hLm9yZy9CbG9nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHRpdGxlPlwiICsgKGphZGUuZXNjYXBlKG51bGwgPT0gKGphZGVfaW50ZXJwID0gbW9kZWwudGl0bGUpID8gXCJcIiA6IGphZGVfaW50ZXJwKSkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3RpdGxlPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgY2hhcnNldD1cXFwidXRmLThcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzaG9ydGN1dCBpY29uXFxcIiBocmVmPVxcXCIvZmF2aWNvbi5pY29cXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgaHR0cC1lcXVpdj1cXFwiWC1VQS1Db21wYXRpYmxlXFxcIiBjb250ZW50PVxcXCJJRT1lZGdlLGNocm9tZT0xXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIG5hbWU9XFxcInZpZXdwb3J0XFxcIiBjb250ZW50PVxcXCJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCIvY3NzL2FsbC5jc3NcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic3R5bGVzaGVldFxcXCIgdHlwZT1cXFwidGV4dC9jc3NcXFwiIGhyZWY9XFxcImh0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDBcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxib2R5IGlkPVxcXCJ0b3BcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9cXFwiIGFyaWEtbGFiZWw9XFxcIkdvIHRvIGhvbWVcXFwiIGNsYXNzPVxcXCJseS10aXRsZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRhdW51c1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDIgY2xhc3M9XFxcImx5LXN1YmhlYWRpbmdcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJNaWNybyBJc29tb3JwaGljIE1WQyBFbmdpbmUgZm9yIE5vZGUuanNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2hlYWRlcj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YXNpZGU+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxOSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG5hdiBjbGFzcz1cXFwibnYtY29udGFpbmVyXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8dWwgY2xhc3M9XFxcIm52LWl0ZW1zXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjIsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJBYm91dFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJHZXR0aW5nIFN0YXJ0ZWRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvYXBpXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI2LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQVBJIERvY3VtZW50YXRpb25cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjgsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJDb21wbGVtZW50YXJ5IE1vZHVsZXNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzAsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvc291cmNlLWNvZGVcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzIsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJTb3VyY2UgQ29kZVwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9jaGFuZ2Vsb2dcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJDaGFuZ2Vsb2dcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3VsPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9uYXY+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2FzaWRlPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtYWluIGlkPVxcXCJhcHBsaWNhdGlvbi1yb290XFxcIiBkYXRhLXRhdW51cz1cXFwibW9kZWxcXFwiPlwiICsgKG51bGwgPT0gKGphZGVfaW50ZXJwID0gcGFydGlhbCkgPyBcIlwiIDogamFkZV9pbnRlcnApKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9tYWluPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzY3JpcHQgc3JjPVxcXCIvanMvYWxsLmpzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2NyaXB0PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9ib2R5PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9odG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQsXCJtb2RlbFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgubW9kZWw6dHlwZW9mIG1vZGVsIT09XCJ1bmRlZmluZWRcIj9tb2RlbDp1bmRlZmluZWQsXCJwYXJ0aWFsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5wYXJ0aWFsOnR5cGVvZiBwYXJ0aWFsIT09XCJ1bmRlZmluZWRcIj9wYXJ0aWFsOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwiZG9jdHlwZSBodG1sXFxuaHRtbChsYW5nPSdlbicsIGl0ZW1zY29wZSwgaXRlbXR5cGU9J2h0dHA6Ly9zY2hlbWEub3JnL0Jsb2cnKVxcbiAgaGVhZFxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtZXRhKGNoYXJzZXQ9J3V0Zi04JylcXG4gICAgbGluayhyZWw9J3Nob3J0Y3V0IGljb24nLCBocmVmPScvZmF2aWNvbi5pY28nKVxcbiAgICBtZXRhKGh0dHAtZXF1aXY9J1gtVUEtQ29tcGF0aWJsZScsIGNvbnRlbnQ9J0lFPWVkZ2UsY2hyb21lPTEnKVxcbiAgICBtZXRhKG5hbWU9J3ZpZXdwb3J0JywgY29udGVudD0nd2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0nL2Nzcy9hbGwuY3NzJylcXG4gICAgbGluayhyZWw9J3N0eWxlc2hlZXQnLCB0eXBlPSd0ZXh0L2NzcycsIGhyZWY9J2h0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDAnKVxcblxcbiAgYm9keSN0b3BcXG4gICAgaGVhZGVyXFxuICAgICAgaDFcXG4gICAgICAgIGEubHktdGl0bGUoaHJlZj0nLycsIGFyaWEtbGFiZWw9J0dvIHRvIGhvbWUnKSBUYXVudXNcXG4gICAgICBoMi5seS1zdWJoZWFkaW5nIE1pY3JvIElzb21vcnBoaWMgTVZDIEVuZ2luZSBmb3IgTm9kZS5qc1xcblxcbiAgICBhc2lkZVxcbiAgICAgIG5hdi5udi1jb250YWluZXJcXG4gICAgICAgIHVsLm52LWl0ZW1zXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy8nKSBBYm91dFxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvZ2V0dGluZy1zdGFydGVkJykgR2V0dGluZyBTdGFydGVkXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9hcGknKSBBUEkgRG9jdW1lbnRhdGlvblxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvY29tcGxlbWVudHMnKSBDb21wbGVtZW50YXJ5IE1vZHVsZXNcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL3BlcmZvcm1hbmNlJykgUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9zb3VyY2UtY29kZScpIFNvdXJjZSBDb2RlXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9jaGFuZ2Vsb2cnKSBDaGFuZ2Vsb2dcXG5cXG4gICAgbWFpbiNhcHBsaWNhdGlvbi1yb290KGRhdGEtdGF1bnVzPSdtb2RlbCcpIT1wYXJ0aWFsXFxuICAgIHNjcmlwdChzcmM9Jy9qcy9hbGwuanMnKVxcblwiKTtcbn1cbn0iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0ZW1wbGF0ZXMgPSB7XG4gICdkb2N1bWVudGF0aW9uL2Fib3V0JzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2FwaSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qcycpLFxuICAnZXJyb3Ivbm90LWZvdW5kJzogcmVxdWlyZSgnLi92aWV3cy9lcnJvci9ub3QtZm91bmQuanMnKSxcbiAgJ2xheW91dCc6IHJlcXVpcmUoJy4vdmlld3MvbGF5b3V0LmpzJylcbn07XG5cbnZhciBjb250cm9sbGVycyA9IHtcbiAgJ2RvY3VtZW50YXRpb24vYWJvdXQnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpXG59O1xuXG52YXIgcm91dGVzID0ge1xuICAnLyc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2Fib3V0J1xuICB9LFxuICAnL2dldHRpbmctc3RhcnRlZCc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCdcbiAgfSxcbiAgJy9hcGknOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hcGknXG4gIH0sXG4gICcvY29tcGxlbWVudHMnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cydcbiAgfSxcbiAgJy9wZXJmb3JtYW5jZSc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlJ1xuICB9LFxuICAnL3NvdXJjZS1jb2RlJzoge1xuICAgIGlnbm9yZTogdHJ1ZVxuICB9LFxuICAnL2NoYW5nZWxvZyc6IHtcbiAgICBpZ25vcmU6IHRydWVcbiAgfSxcbiAgJy86Y2F0Y2hhbGwqJzoge1xuICAgIGFjdGlvbjogJ2Vycm9yL25vdC1mb3VuZCdcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXG4gIHJvdXRlczogcm91dGVzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc29sZS5sb2coJ1dlbGNvbWUgdG8gVGF1bnVzIGRvY3VtZW50YXRpb24gbWluaS1zaXRlIScpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLy8gaW1wb3J0IHRoZSB0YXVudXMgbW9kdWxlXG52YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XG5cbi8vIGltcG9ydCB0aGUgd2lyaW5nIG1vZHVsZSBleHBvcnRlZCBieSBUYXVudXNcbnZhciB3aXJpbmcgPSByZXF1aXJlKCcuLi8uLi8uYmluL3dpcmluZycpO1xuXG4vLyBnZXQgdGhlIDxtYWluPiBlbGVtZW50XG52YXIgbWFpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHBsaWNhdGlvbi1yb290Jyk7XG5cbi8vIG1vdW50IHRhdW51cyBzbyBpdCBzdGFydHMgaXRzIHJvdXRpbmcgZW5naW5lXG50YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbiFmdW5jdGlvbihlKXtpZihcIm9iamVjdFwiPT10eXBlb2YgZXhwb3J0cyltb2R1bGUuZXhwb3J0cz1lKCk7ZWxzZSBpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQpZGVmaW5lKGUpO2Vsc2V7dmFyIGY7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdz9mPXdpbmRvdzpcInVuZGVmaW5lZFwiIT10eXBlb2YgZ2xvYmFsP2Y9Z2xvYmFsOlwidW5kZWZpbmVkXCIhPXR5cGVvZiBzZWxmJiYoZj1zZWxmKSxmLmphZGU9ZSgpfX0oZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG4ndXNlIHN0cmljdCc7XHJcblxyXG4vKipcclxuICogTWVyZ2UgdHdvIGF0dHJpYnV0ZSBvYmplY3RzIGdpdmluZyBwcmVjZWRlbmNlXHJcbiAqIHRvIHZhbHVlcyBpbiBvYmplY3QgYGJgLiBDbGFzc2VzIGFyZSBzcGVjaWFsLWNhc2VkXHJcbiAqIGFsbG93aW5nIGZvciBhcnJheXMgYW5kIG1lcmdpbmcvam9pbmluZyBhcHByb3ByaWF0ZWx5XHJcbiAqIHJlc3VsdGluZyBpbiBhIHN0cmluZy5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IGFcclxuICogQHBhcmFtIHtPYmplY3R9IGJcclxuICogQHJldHVybiB7T2JqZWN0fSBhXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMubWVyZ2UgPSBmdW5jdGlvbiBtZXJnZShhLCBiKSB7XHJcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcclxuICAgIHZhciBhdHRycyA9IGFbMF07XHJcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGEubGVuZ3RoOyBpKyspIHtcclxuICAgICAgYXR0cnMgPSBtZXJnZShhdHRycywgYVtpXSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYXR0cnM7XHJcbiAgfVxyXG4gIHZhciBhYyA9IGFbJ2NsYXNzJ107XHJcbiAgdmFyIGJjID0gYlsnY2xhc3MnXTtcclxuXHJcbiAgaWYgKGFjIHx8IGJjKSB7XHJcbiAgICBhYyA9IGFjIHx8IFtdO1xyXG4gICAgYmMgPSBiYyB8fCBbXTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShhYykpIGFjID0gW2FjXTtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShiYykpIGJjID0gW2JjXTtcclxuICAgIGFbJ2NsYXNzJ10gPSBhYy5jb25jYXQoYmMpLmZpbHRlcihudWxscyk7XHJcbiAgfVxyXG5cclxuICBmb3IgKHZhciBrZXkgaW4gYikge1xyXG4gICAgaWYgKGtleSAhPSAnY2xhc3MnKSB7XHJcbiAgICAgIGFba2V5XSA9IGJba2V5XTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBhO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEZpbHRlciBudWxsIGB2YWxgcy5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWxcclxuICogQHJldHVybiB7Qm9vbGVhbn1cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZnVuY3Rpb24gbnVsbHModmFsKSB7XHJcbiAgcmV0dXJuIHZhbCAhPSBudWxsICYmIHZhbCAhPT0gJyc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBqb2luIGFycmF5IGFzIGNsYXNzZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuam9pbkNsYXNzZXMgPSBqb2luQ2xhc3NlcztcclxuZnVuY3Rpb24gam9pbkNsYXNzZXModmFsKSB7XHJcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsKSA/IHZhbC5tYXAoam9pbkNsYXNzZXMpLmZpbHRlcihudWxscykuam9pbignICcpIDogdmFsO1xyXG59XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBjbGFzc2VzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge0FycmF5fSBjbGFzc2VzXHJcbiAqIEBwYXJhbSB7QXJyYXkuPEJvb2xlYW4+fSBlc2NhcGVkXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuY2xzID0gZnVuY3Rpb24gY2xzKGNsYXNzZXMsIGVzY2FwZWQpIHtcclxuICB2YXIgYnVmID0gW107XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbGFzc2VzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBpZiAoZXNjYXBlZCAmJiBlc2NhcGVkW2ldKSB7XHJcbiAgICAgIGJ1Zi5wdXNoKGV4cG9ydHMuZXNjYXBlKGpvaW5DbGFzc2VzKFtjbGFzc2VzW2ldXSkpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGJ1Zi5wdXNoKGpvaW5DbGFzc2VzKGNsYXNzZXNbaV0pKTtcclxuICAgIH1cclxuICB9XHJcbiAgdmFyIHRleHQgPSBqb2luQ2xhc3NlcyhidWYpO1xyXG4gIGlmICh0ZXh0Lmxlbmd0aCkge1xyXG4gICAgcmV0dXJuICcgY2xhc3M9XCInICsgdGV4dCArICdcIic7XHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiAnJztcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBhdHRyaWJ1dGUuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXlcclxuICogQHBhcmFtIHtTdHJpbmd9IHZhbFxyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGVzY2FwZWRcclxuICogQHBhcmFtIHtCb29sZWFufSB0ZXJzZVxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmF0dHIgPSBmdW5jdGlvbiBhdHRyKGtleSwgdmFsLCBlc2NhcGVkLCB0ZXJzZSkge1xyXG4gIGlmICgnYm9vbGVhbicgPT0gdHlwZW9mIHZhbCB8fCBudWxsID09IHZhbCkge1xyXG4gICAgaWYgKHZhbCkge1xyXG4gICAgICByZXR1cm4gJyAnICsgKHRlcnNlID8ga2V5IDoga2V5ICsgJz1cIicgKyBrZXkgKyAnXCInKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiAnJztcclxuICAgIH1cclxuICB9IGVsc2UgaWYgKDAgPT0ga2V5LmluZGV4T2YoJ2RhdGEnKSAmJiAnc3RyaW5nJyAhPSB0eXBlb2YgdmFsKSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgXCI9J1wiICsgSlNPTi5zdHJpbmdpZnkodmFsKS5yZXBsYWNlKC8nL2csICcmYXBvczsnKSArIFwiJ1wiO1xyXG4gIH0gZWxzZSBpZiAoZXNjYXBlZCkge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgZXhwb3J0cy5lc2NhcGUodmFsKSArICdcIic7XHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyAnPVwiJyArIHZhbCArICdcIic7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gYXR0cmlidXRlcyBvYmplY3QuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcclxuICogQHBhcmFtIHtPYmplY3R9IGVzY2FwZWRcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5hdHRycyA9IGZ1bmN0aW9uIGF0dHJzKG9iaiwgdGVyc2Upe1xyXG4gIHZhciBidWYgPSBbXTtcclxuXHJcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmopO1xyXG5cclxuICBpZiAoa2V5cy5sZW5ndGgpIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICB2YXIga2V5ID0ga2V5c1tpXVxyXG4gICAgICAgICwgdmFsID0gb2JqW2tleV07XHJcblxyXG4gICAgICBpZiAoJ2NsYXNzJyA9PSBrZXkpIHtcclxuICAgICAgICBpZiAodmFsID0gam9pbkNsYXNzZXModmFsKSkge1xyXG4gICAgICAgICAgYnVmLnB1c2goJyAnICsga2V5ICsgJz1cIicgKyB2YWwgKyAnXCInKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYnVmLnB1c2goZXhwb3J0cy5hdHRyKGtleSwgdmFsLCBmYWxzZSwgdGVyc2UpKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGJ1Zi5qb2luKCcnKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBFc2NhcGUgdGhlIGdpdmVuIHN0cmluZyBvZiBgaHRtbGAuXHJcbiAqXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBodG1sXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5lc2NhcGUgPSBmdW5jdGlvbiBlc2NhcGUoaHRtbCl7XHJcbiAgdmFyIHJlc3VsdCA9IFN0cmluZyhodG1sKVxyXG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcclxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcclxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jyk7XHJcbiAgaWYgKHJlc3VsdCA9PT0gJycgKyBodG1sKSByZXR1cm4gaHRtbDtcclxuICBlbHNlIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmUtdGhyb3cgdGhlIGdpdmVuIGBlcnJgIGluIGNvbnRleHQgdG8gdGhlXHJcbiAqIHRoZSBqYWRlIGluIGBmaWxlbmFtZWAgYXQgdGhlIGdpdmVuIGBsaW5lbm9gLlxyXG4gKlxyXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnJcclxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVuYW1lXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBsaW5lbm9cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5yZXRocm93ID0gZnVuY3Rpb24gcmV0aHJvdyhlcnIsIGZpbGVuYW1lLCBsaW5lbm8sIHN0cil7XHJcbiAgaWYgKCEoZXJyIGluc3RhbmNlb2YgRXJyb3IpKSB0aHJvdyBlcnI7XHJcbiAgaWYgKCh0eXBlb2Ygd2luZG93ICE9ICd1bmRlZmluZWQnIHx8ICFmaWxlbmFtZSkgJiYgIXN0cikge1xyXG4gICAgZXJyLm1lc3NhZ2UgKz0gJyBvbiBsaW5lICcgKyBsaW5lbm87XHJcbiAgICB0aHJvdyBlcnI7XHJcbiAgfVxyXG4gIHRyeSB7XHJcbiAgICBzdHIgPSBzdHIgfHwgX2RlcmVxXygnZnMnKS5yZWFkRmlsZVN5bmMoZmlsZW5hbWUsICd1dGY4JylcclxuICB9IGNhdGNoIChleCkge1xyXG4gICAgcmV0aHJvdyhlcnIsIG51bGwsIGxpbmVubylcclxuICB9XHJcbiAgdmFyIGNvbnRleHQgPSAzXHJcbiAgICAsIGxpbmVzID0gc3RyLnNwbGl0KCdcXG4nKVxyXG4gICAgLCBzdGFydCA9IE1hdGgubWF4KGxpbmVubyAtIGNvbnRleHQsIDApXHJcbiAgICAsIGVuZCA9IE1hdGgubWluKGxpbmVzLmxlbmd0aCwgbGluZW5vICsgY29udGV4dCk7XHJcblxyXG4gIC8vIEVycm9yIGNvbnRleHRcclxuICB2YXIgY29udGV4dCA9IGxpbmVzLnNsaWNlKHN0YXJ0LCBlbmQpLm1hcChmdW5jdGlvbihsaW5lLCBpKXtcclxuICAgIHZhciBjdXJyID0gaSArIHN0YXJ0ICsgMTtcclxuICAgIHJldHVybiAoY3VyciA9PSBsaW5lbm8gPyAnICA+ICcgOiAnICAgICcpXHJcbiAgICAgICsgY3VyclxyXG4gICAgICArICd8ICdcclxuICAgICAgKyBsaW5lO1xyXG4gIH0pLmpvaW4oJ1xcbicpO1xyXG5cclxuICAvLyBBbHRlciBleGNlcHRpb24gbWVzc2FnZVxyXG4gIGVyci5wYXRoID0gZmlsZW5hbWU7XHJcbiAgZXJyLm1lc3NhZ2UgPSAoZmlsZW5hbWUgfHwgJ0phZGUnKSArICc6JyArIGxpbmVub1xyXG4gICAgKyAnXFxuJyArIGNvbnRleHQgKyAnXFxuXFxuJyArIGVyci5tZXNzYWdlO1xyXG4gIHRocm93IGVycjtcclxufTtcclxuXG59LHtcImZzXCI6Mn1dLDI6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuXG59LHt9XX0se30sWzFdKVxuKDEpXG59KTtcbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCdqYWRlL3J1bnRpbWUnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgcGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgaXNOYXRpdmUgPSByZXF1aXJlKCcuL2lzTmF0aXZlJyk7XG52YXIgbW9kZXJuID0gJ2hpc3RvcnknIGluIHdpbmRvdyAmJiAncHVzaFN0YXRlJyBpbiBoaXN0b3J5O1xuXG4vLyBHb29nbGUgQ2hyb21lIDM4IG9uIGlPUyBtYWtlcyB3ZWlyZCBjaGFuZ2VzIHRvIGhpc3RvcnkucmVwbGFjZVN0YXRlLCBicmVha2luZyBpdFxudmFyIG5hdGl2ZVJlcGxhY2UgPSBtb2Rlcm4gJiYgaXNOYXRpdmUod2luZG93Lmhpc3RvcnkucmVwbGFjZVN0YXRlKTtcblxuZnVuY3Rpb24gZ28gKHVybCwgbykge1xuICB2YXIgb3B0aW9ucyA9IG8gfHwge307XG4gIHZhciBjb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0IHx8IG51bGw7XG5cbiAgaWYgKCFtb2Rlcm4pIHtcbiAgICBsb2NhdGlvbi5ocmVmID0gdXJsOyByZXR1cm47XG4gIH1cblxuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsKTtcblxuICBmZXRjaGVyLmFib3J0UGVuZGluZygpO1xuICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGNvbnRleHQsIHNvdXJjZTogJ2ludGVudCcgfSwgcmVzb2x2ZWQpO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVkIChlcnIsIG1vZGVsKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuYXZpZ2F0aW9uKHJvdXRlLCBtb2RlbCwgJ3B1c2hTdGF0ZScpO1xuICAgIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0IChtb2RlbCkge1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIGVtaXR0ZXIuZW1pdCgnc3RhcnQnLCBzdGF0ZS5jb250YWluZXIsIG1vZGVsKTtcbiAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSwgeyByZW5kZXI6IGZhbHNlIH0pO1xuICB3aW5kb3cub25wb3BzdGF0ZSA9IGJhY2s7XG59XG5cbmZ1bmN0aW9uIGJhY2sgKGUpIHtcbiAgdmFyIGVtcHR5ID0gIShlICYmIGUuc3RhdGUgJiYgZS5zdGF0ZS5tb2RlbCk7XG4gIGlmIChlbXB0eSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbW9kZWwgPSBlLnN0YXRlLm1vZGVsO1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xufVxuXG5mdW5jdGlvbiByZXBsYWNlV2l0aCAobW9kZWwpIHtcbiAgdmFyIHVybCA9IGxvY2F0aW9uLnBhdGhuYW1lO1xuICB2YXIgcXVlcnkgPSBvckVtcHR5KGxvY2F0aW9uLnNlYXJjaCkgKyBvckVtcHR5KGxvY2F0aW9uLmhhc2gpO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsICsgcXVlcnkpO1xuICBuYXZpZ2F0aW9uKHJvdXRlLCBtb2RlbCwgJ3JlcGxhY2VTdGF0ZScpO1xuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIG9yRW1wdHkgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gbmF2aWdhdGlvbiAocm91dGUsIG1vZGVsLCBkaXJlY3Rpb24pIHtcbiAgc3RhdGUubW9kZWwgPSBtb2RlbDtcbiAgaWYgKG1vZGVsLnRpdGxlKSB7XG4gICAgZG9jdW1lbnQudGl0bGUgPSBtb2RlbC50aXRsZTtcbiAgfVxuICBpZiAobW9kZXJuICYmIGRpcmVjdGlvbiAhPT0gJ3JlcGxhY2VTdGF0ZScgfHwgbmF0aXZlUmVwbGFjZSkge1xuICAgIGhpc3RvcnlbZGlyZWN0aW9uXSh7IG1vZGVsOiBtb2RlbCB9LCBtb2RlbC50aXRsZSwgcm91dGUudXJsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc3RhcnQ6IHN0YXJ0LFxuICBnbzogZ29cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgcmF3ID0gcmVxdWlyZSgnLi9zdG9yZXMvcmF3Jyk7XG52YXIgaWRiID0gcmVxdWlyZSgnLi9zdG9yZXMvaWRiJyk7XG52YXIgc3RvcmVzID0gW3JhdywgaWRiXTtcblxuZnVuY3Rpb24gY2xvbmUgKHZhbHVlKSB7XG4gIHJldHVybiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSk7XG59XG5cbmZ1bmN0aW9uIGdldCAodXJsLCBkb25lKSB7XG4gIHZhciBpID0gMDtcblxuICBmdW5jdGlvbiBuZXh0ICgpIHtcbiAgICB2YXIgZ290T25jZSA9IG9uY2UoZ290KTtcbiAgICB2YXIgc3RvcmUgPSBzdG9yZXNbaSsrXTtcbiAgICBpZiAoc3RvcmUpIHtcbiAgICAgIHN0b3JlLmdldCh1cmwsIGdvdE9uY2UpO1xuICAgICAgc2V0VGltZW91dChnb3RPbmNlLCBzdG9yZSA9PT0gaWRiID8gMTAwIDogNTApOyAvLyBhdCB3b3JzdCwgc3BlbmQgMTUwbXMgb24gY2FjaGluZyBsYXllcnNcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZSh0cnVlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnb3QgKGVyciwgaXRlbSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9IGVsc2UgaWYgKGl0ZW0gJiYgdHlwZW9mIGl0ZW0uZXhwaXJlcyA9PT0gJ251bWJlcicgJiYgRGF0ZS5ub3coKSA8IGl0ZW0uZXhwaXJlcykge1xuICAgICAgICBkb25lKGZhbHNlLCBjbG9uZShpdGVtLmRhdGEpKTsgLy8gYWx3YXlzIHJldHVybiBhIHVuaXF1ZSBjb3B5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbmV4dCgpO1xufVxuXG5mdW5jdGlvbiBzZXQgKHVybCwgZGF0YSwgZHVyYXRpb24pIHtcbiAgaWYgKGR1cmF0aW9uIDwgMSkgeyAvLyBzYW5pdHlcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGNsb25lZCA9IGNsb25lKGRhdGEpOyAvLyBmcmVlemUgYSBjb3B5IGZvciBvdXIgcmVjb3Jkc1xuICBzdG9yZXMuZm9yRWFjaChzdG9yZSk7XG4gIGZ1bmN0aW9uIHN0b3JlIChzKSB7XG4gICAgcy5zZXQodXJsLCB7XG4gICAgICBkYXRhOiBjbG9uZWQsXG4gICAgICBleHBpcmVzOiBEYXRlLm5vdygpICsgZHVyYXRpb25cbiAgICB9KTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2FjaGUgPSByZXF1aXJlKCcuL2NhY2hlJyk7XG52YXIgaWRiID0gcmVxdWlyZSgnLi9zdG9yZXMvaWRiJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGRlZmF1bHRzID0gMTU7XG52YXIgYmFzZWxpbmU7XG5cbmZ1bmN0aW9uIGUgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gc2V0dXAgKGR1cmF0aW9uLCByb3V0ZSkge1xuICBiYXNlbGluZSA9IHBhcnNlRHVyYXRpb24oZHVyYXRpb24pO1xuICBpZiAoYmFzZWxpbmUgPCAxKSB7XG4gICAgc3RhdGUuY2FjaGUgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cbiAgaW50ZXJjZXB0b3IuYWRkKGludGVyY2VwdCk7XG4gIGVtaXR0ZXIub24oJ2ZldGNoLmRvbmUnLCBwZXJzaXN0KTtcbiAgc3RhdGUuY2FjaGUgPSB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnRlcmNlcHQgKGUpIHtcbiAgY2FjaGUuZ2V0KGUudXJsLCByZXN1bHQpO1xuXG4gIGZ1bmN0aW9uIHJlc3VsdCAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKCFlcnIgJiYgZGF0YSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdChkYXRhKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VEdXJhdGlvbiAodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGJhc2VsaW5lIHx8IGRlZmF1bHRzO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0IChyb3V0ZSwgY29udGV4dCwgZGF0YSkge1xuICBpZiAoIXN0YXRlLmNhY2hlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb3V0ZS5jYWNoZSA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGQgPSBiYXNlbGluZTtcbiAgaWYgKHR5cGVvZiByb3V0ZS5jYWNoZSA9PT0gJ251bWJlcicpIHtcbiAgICBkID0gcm91dGUuY2FjaGU7XG4gIH1cbiAgdmFyIGtleSA9IHJvdXRlLnBhcnRzLnBhdGhuYW1lICsgZShyb3V0ZS5wYXJ0cy5xdWVyeSk7XG4gIGNhY2hlLnNldChrZXksIGRhdGEsIHBhcnNlRHVyYXRpb24oZCkgKiAxMDAwKTtcbn1cblxuZnVuY3Rpb24gcmVhZHkgKGZuKSB7XG4gIGlmIChzdGF0ZS5jYWNoZSkge1xuICAgIGlkYi50ZXN0ZWQoZm4pOyAvLyB3YWl0IG9uIGlkYiBjb21wYXRpYmlsaXR5IHRlc3RzXG4gIH0gZWxzZSB7XG4gICAgZm4oKTsgLy8gY2FjaGluZyBpcyBhIG5vLW9wXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHNldHVwOiBzZXR1cCxcbiAgcGVyc2lzdDogcGVyc2lzdCxcbiAgcmVhZHk6IHJlYWR5XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZW1pdHRlcih7fSwgeyB0aHJvd3M6IGZhbHNlIH0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBhZGQgKGVsZW1lbnQsIHR5cGUsIGZuKSB7XG4gIGlmIChlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZm4pO1xuICB9IGVsc2UgaWYgKGVsZW1lbnQuYXR0YWNoRXZlbnQpIHtcbiAgICBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBmbikpO1xuICB9IGVsc2Uge1xuICAgIGVsZW1lbnRbJ29uJyArIHR5cGVdID0gZm47XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IHdpbmRvdy5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ICA9IGUucHJldmVudERlZmF1bHQgIHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGZuLmNhbGwoZWxlbWVudCwgZSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJy4veGhyJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGxhc3RYaHIgPSB7fTtcblxuZnVuY3Rpb24gZSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBqc29uaWZ5IChyb3V0ZSkge1xuICB2YXIgcGFydHMgPSByb3V0ZS5wYXJ0cztcbiAgdmFyIHFzID0gZShwYXJ0cy5zZWFyY2gpO1xuICB2YXIgcCA9IHFzID8gJyYnIDogJz8nO1xuICByZXR1cm4gcGFydHMucGF0aG5hbWUgKyBxcyArIHAgKyAnanNvbic7XG59XG5cbmZ1bmN0aW9uIGFib3J0IChzb3VyY2UpIHtcbiAgaWYgKGxhc3RYaHJbc291cmNlXSkge1xuICAgIGxhc3RYaHJbc291cmNlXS5hYm9ydCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFib3J0UGVuZGluZyAoKSB7XG4gIE9iamVjdC5rZXlzKGxhc3RYaHIpLmZvckVhY2goYWJvcnQpO1xuICBsYXN0WGhyID0ge307XG59XG5cbmZ1bmN0aW9uIGZldGNoZXIgKHJvdXRlLCBjb250ZXh0LCBkb25lKSB7XG4gIHZhciB1cmwgPSByb3V0ZS51cmw7XG4gIGlmIChsYXN0WGhyW2NvbnRleHQuc291cmNlXSkge1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdLmFib3J0KCk7XG4gICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSBudWxsO1xuICB9XG4gIGludGVyY2VwdG9yLmV4ZWN1dGUocm91dGUsIGFmdGVySW50ZXJjZXB0b3JzKTtcblxuICBmdW5jdGlvbiBhZnRlckludGVyY2VwdG9ycyAoZXJyLCByZXN1bHQpIHtcbiAgICBpZiAoIWVyciAmJiByZXN1bHQuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgZG9uZShudWxsLCByZXN1bHQubW9kZWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLnN0YXJ0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSB4aHIoanNvbmlmeShyb3V0ZSksIG5vdGlmeSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbm90aWZ5IChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBpZiAoZXJyLm1lc3NhZ2UgPT09ICdhYm9ydGVkJykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmFib3J0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5lcnJvcicsIHJvdXRlLCBjb250ZXh0LCBlcnIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmRvbmUnLCByb3V0ZSwgY29udGV4dCwgZGF0YSk7XG4gICAgfVxuICAgIGRvbmUoZXJyLCBkYXRhKTtcbiAgfVxufVxuXG5mZXRjaGVyLmFib3J0UGVuZGluZyA9IGFib3J0UGVuZGluZztcblxubW9kdWxlLmV4cG9ydHMgPSBmZXRjaGVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGxpbmtzID0gcmVxdWlyZSgnLi9saW5rcycpO1xuXG5mdW5jdGlvbiBhdHRhY2ggKCkge1xuICBlbWl0dGVyLm9uKCdzdGFydCcsIGxpbmtzKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF0dGFjaDogYXR0YWNoXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaG9va3MgPSByZXF1aXJlKCcuL2hvb2tzJyk7XG52YXIgcGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xudmFyIG1vdW50ID0gcmVxdWlyZSgnLi9tb3VudCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG5cbmhvb2tzLmF0dGFjaCgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbW91bnQ6IG1vdW50LFxuICBwYXJ0aWFsOiBwYXJ0aWFsLnN0YW5kYWxvbmUsXG4gIG9uOiBlbWl0dGVyLm9uLmJpbmQoZW1pdHRlciksXG4gIG9uY2U6IGVtaXR0ZXIub25jZS5iaW5kKGVtaXR0ZXIpLFxuICBvZmY6IGVtaXR0ZXIub2ZmLmJpbmQoZW1pdHRlciksXG4gIGludGVyY2VwdDogaW50ZXJjZXB0b3IuYWRkLFxuICBuYXZpZ2F0ZTogYWN0aXZhdG9yLmdvLFxuICBzdGF0ZTogc3RhdGUsXG4gIHJvdXRlOiByb3V0ZXJcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhLmVtaXR0ZXInKTtcbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBpbnRlcmNlcHRvcnMgPSBlbWl0dGVyKHsgY291bnQ6IDAgfSwgeyBhc3luYzogdHJ1ZSB9KTtcblxuZnVuY3Rpb24gZ2V0SW50ZXJjZXB0b3JFdmVudCAodXJsLCByb3V0ZSkge1xuICB2YXIgZSA9IHtcbiAgICB1cmw6IHVybCxcbiAgICByb3V0ZTogcm91dGUsXG4gICAgcGFydHM6IHJvdXRlLnBhcnRzLFxuICAgIG1vZGVsOiBudWxsLFxuICAgIGRlZmF1bHRQcmV2ZW50ZWQ6IGZhbHNlLFxuICAgIHByZXZlbnREZWZhdWx0OiBvbmNlKHByZXZlbnREZWZhdWx0KVxuICB9O1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0IChtb2RlbCkge1xuICAgIGUuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgZS5tb2RlbCA9IG1vZGVsO1xuICB9XG5cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGFkZCAoYWN0aW9uLCBmbikge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGZuID0gYWN0aW9uO1xuICAgIGFjdGlvbiA9ICcqJztcbiAgfVxuICBpbnRlcmNlcHRvcnMuY291bnQrKztcbiAgaW50ZXJjZXB0b3JzLm9uKGFjdGlvbiwgZm4pO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlU3luYyAocm91dGUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlLnVybCwgcm91dGUpO1xuXG4gIGludGVyY2VwdG9ycy5lbWl0KCcqJywgZSk7XG4gIGludGVyY2VwdG9ycy5lbWl0KHJvdXRlLmFjdGlvbiwgZSk7XG5cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGUgKHJvdXRlLCBkb25lKSB7XG4gIHZhciBlID0gZ2V0SW50ZXJjZXB0b3JFdmVudChyb3V0ZS51cmwsIHJvdXRlKTtcbiAgaWYgKGludGVyY2VwdG9ycy5jb3VudCA9PT0gMCkgeyAvLyBmYWlsIGZhc3RcbiAgICBlbmQoKTsgcmV0dXJuO1xuICB9XG4gIHZhciBmbiA9IG9uY2UoZW5kKTtcbiAgdmFyIHByZXZlbnREZWZhdWx0QmFzZSA9IGUucHJldmVudERlZmF1bHQ7XG5cbiAgZS5wcmV2ZW50RGVmYXVsdCA9IG9uY2UocHJldmVudERlZmF1bHRFbmRzKTtcblxuICBpbnRlcmNlcHRvcnMuZW1pdCgnKicsIGUpO1xuICBpbnRlcmNlcHRvcnMuZW1pdChyb3V0ZS5hY3Rpb24sIGUpO1xuXG4gIHNldFRpbWVvdXQoZm4sIDIwMCk7IC8vIGF0IHdvcnN0LCBzcGVuZCAyMDBtcyB3YWl0aW5nIG9uIGludGVyY2VwdG9yc1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0RW5kcyAoKSB7XG4gICAgcHJldmVudERlZmF1bHRCYXNlLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgZm4oKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZCAoKSB7XG4gICAgZG9uZShudWxsLCBlKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGQsXG4gIGV4ZWN1dGU6IGV4ZWN1dGVcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8vIHNvdXJjZTogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vamRhbHRvbi81ZTM0ZDg5MDEwNWFjYTQ0Mzk5ZlxuLy8gdGhhbmtzIEBqZGFsdG9uIVxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nOyAvLyB1c2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIGBbW0NsYXNzXV1gIG9mIHZhbHVlc1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7IC8vIHVzZWQgdG8gcmVzb2x2ZSB0aGUgZGVjb21waWxlZCBzb3VyY2Ugb2YgZnVuY3Rpb25zXG52YXIgaG9zdCA9IC9eXFxbb2JqZWN0IC4rP0NvbnN0cnVjdG9yXFxdJC87IC8vIHVzZWQgdG8gZGV0ZWN0IGhvc3QgY29uc3RydWN0b3JzIChTYWZhcmkgPiA0OyByZWFsbHkgdHlwZWQgYXJyYXkgc3BlY2lmaWMpXG5cbi8vIEVzY2FwZSBhbnkgc3BlY2lhbCByZWdleHAgY2hhcmFjdGVycy5cbnZhciBzcGVjaWFscyA9IC9bLiorP14ke30oKXxbXFxdXFwvXFxcXF0vZztcblxuLy8gUmVwbGFjZSBtZW50aW9ucyBvZiBgdG9TdHJpbmdgIHdpdGggYC4qP2AgdG8ga2VlcCB0aGUgdGVtcGxhdGUgZ2VuZXJpYy5cbi8vIFJlcGxhY2UgdGhpbmcgbGlrZSBgZm9yIC4uLmAgdG8gc3VwcG9ydCBlbnZpcm9ubWVudHMsIGxpa2UgUmhpbm8sIHdoaWNoIGFkZCBleHRyYVxuLy8gaW5mbyBzdWNoIGFzIG1ldGhvZCBhcml0eS5cbnZhciBleHRyYXMgPSAvdG9TdHJpbmd8KGZ1bmN0aW9uKS4qPyg/PVxcXFxcXCgpfCBmb3IgLis/KD89XFxcXFxcXSkvZztcblxuLy8gQ29tcGlsZSBhIHJlZ2V4cCB1c2luZyBhIGNvbW1vbiBuYXRpdmUgbWV0aG9kIGFzIGEgdGVtcGxhdGUuXG4vLyBXZSBjaG9zZSBgT2JqZWN0I3RvU3RyaW5nYCBiZWNhdXNlIHRoZXJlJ3MgYSBnb29kIGNoYW5jZSBpdCBpcyBub3QgYmVpbmcgbXVja2VkIHdpdGguXG52YXIgZm5TdHJpbmcgPSBTdHJpbmcodG9TdHJpbmcpLnJlcGxhY2Uoc3BlY2lhbHMsICdcXFxcJCYnKS5yZXBsYWNlKGV4dHJhcywgJyQxLio/Jyk7XG52YXIgcmVOYXRpdmUgPSBuZXcgUmVnRXhwKCdeJyArIGZuU3RyaW5nICsgJyQnKTtcblxuZnVuY3Rpb24gaXNOYXRpdmUgKHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIC8vIFVzZSBgRnVuY3Rpb24jdG9TdHJpbmdgIHRvIGJ5cGFzcyB0aGUgdmFsdWUncyBvd24gYHRvU3RyaW5nYCBtZXRob2RcbiAgICAvLyBhbmQgYXZvaWQgYmVpbmcgZmFrZWQgb3V0LlxuICAgIHJldHVybiByZU5hdGl2ZS50ZXN0KGZuVG9TdHJpbmcuY2FsbCh2YWx1ZSkpO1xuICB9XG5cbiAgLy8gRmFsbGJhY2sgdG8gYSBob3N0IG9iamVjdCBjaGVjayBiZWNhdXNlIHNvbWUgZW52aXJvbm1lbnRzIHdpbGwgcmVwcmVzZW50XG4gIC8vIHRoaW5ncyBsaWtlIHR5cGVkIGFycmF5cyBhcyBET00gbWV0aG9kcyB3aGljaCBtYXkgbm90IGNvbmZvcm0gdG8gdGhlXG4gIC8vIG5vcm1hbCBuYXRpdmUgcGF0dGVybi5cbiAgcmV0dXJuICh2YWx1ZSAmJiB0eXBlID09PSAnb2JqZWN0JyAmJiBob3N0LnRlc3QodG9TdHJpbmcuY2FsbCh2YWx1ZSkpKSB8fCBmYWxzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc05hdGl2ZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBvcmlnaW4gPSBkb2N1bWVudC5sb2NhdGlvbi5vcmlnaW47XG52YXIgbGVmdENsaWNrID0gMTtcbnZhciBwcmVmZXRjaGluZyA9IFtdO1xudmFyIGNsaWNrc09uSG9sZCA9IFtdO1xuXG5mdW5jdGlvbiBsaW5rcyAoKSB7XG4gIGlmIChzdGF0ZS5wcmVmZXRjaCAmJiBzdGF0ZS5jYWNoZSkgeyAvLyBwcmVmZXRjaCB3aXRob3V0IGNhY2hlIG1ha2VzIG5vIHNlbnNlXG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAnbW91c2VvdmVyJywgbWF5YmVQcmVmZXRjaCk7XG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAndG91Y2hzdGFydCcsIG1heWJlUHJlZmV0Y2gpO1xuICB9XG4gIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ2NsaWNrJywgbWF5YmVSZXJvdXRlKTtcbn1cblxuZnVuY3Rpb24gc28gKGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLm9yaWdpbiA9PT0gb3JpZ2luO1xufVxuXG5mdW5jdGlvbiBsZWZ0Q2xpY2tPbkFuY2hvciAoZSwgYW5jaG9yKSB7XG4gIHJldHVybiBhbmNob3IucGF0aG5hbWUgJiYgZS53aGljaCA9PT0gbGVmdENsaWNrICYmICFlLm1ldGFLZXkgJiYgIWUuY3RybEtleTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0T3JBbmNob3IgKGUpIHtcbiAgdmFyIGFuY2hvciA9IGUudGFyZ2V0O1xuICB3aGlsZSAoYW5jaG9yKSB7XG4gICAgaWYgKGFuY2hvci50YWdOYW1lID09PSAnQScpIHtcbiAgICAgIHJldHVybiBhbmNob3I7XG4gICAgfVxuICAgIGFuY2hvciA9IGFuY2hvci5wYXJlbnRFbGVtZW50O1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUmVyb3V0ZSAoZSkge1xuICB2YXIgYW5jaG9yID0gdGFyZ2V0T3JBbmNob3IoZSk7XG4gIGlmIChhbmNob3IgJiYgc28oYW5jaG9yKSAmJiBsZWZ0Q2xpY2tPbkFuY2hvcihlLCBhbmNob3IpKSB7XG4gICAgcmVyb3V0ZShlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUHJlZmV0Y2ggKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikpIHtcbiAgICBwcmVmZXRjaChlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNjcm9sbEludG8gKGlkKSB7XG4gIHZhciBlbGVtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICBpZiAoZWxlbSAmJiBlbGVtLnNjcm9sbEludG9WaWV3KSB7XG4gICAgZWxlbS5zY3JvbGxJbnRvVmlldygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0Um91dGUgKGFuY2hvciwgZmFpbCkge1xuICB2YXIgdXJsID0gYW5jaG9yLnBhdGhuYW1lICsgYW5jaG9yLnNlYXJjaCArIGFuY2hvci5oYXNoO1xuICBpZiAodXJsID09PSBsb2NhdGlvbi5wYXRobmFtZSArIGxvY2F0aW9uLnNlYXJjaCArIGFuY2hvci5oYXNoKSB7XG4gICAgKGZhaWwgfHwgbm9vcCkoKTtcbiAgICByZXR1cm47IC8vIGFuY2hvciBoYXNoLW5hdmlnYXRpb24gb24gc2FtZSBwYWdlIGlnbm9yZXMgcm91dGVyXG4gIH1cbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUuaWdub3JlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gcmVyb3V0ZSAoZSwgYW5jaG9yKSB7XG4gIHZhciByb3V0ZSA9IGdldFJvdXRlKGFuY2hvciwgZmFpbCk7XG4gIGlmICghcm91dGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcmV2ZW50KCk7XG5cbiAgaWYgKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICBjbGlja3NPbkhvbGQucHVzaChhbmNob3IpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGFjdGl2YXRvci5nbyhyb3V0ZS51cmwsIHsgY29udGV4dDogYW5jaG9yIH0pO1xuXG4gIGZ1bmN0aW9uIGZhaWwgKCkge1xuICAgIGlmIChhbmNob3IuaGFzaCA9PT0gbG9jYXRpb24uaGFzaCkge1xuICAgICAgc2Nyb2xsSW50byhhbmNob3IuaGFzaC5zdWJzdHIoMSkpO1xuICAgICAgcHJldmVudCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXZlbnQgKCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IH1cbn1cblxuZnVuY3Rpb24gcHJlZmV0Y2ggKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcmVmZXRjaGluZy5wdXNoKGFuY2hvcik7XG4gIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogYW5jaG9yLCBzb3VyY2U6ICdwcmVmZXRjaCcgfSwgcmVzb2x2ZWQpO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVkIChlcnIsIGRhdGEpIHtcbiAgICBwcmVmZXRjaGluZy5zcGxpY2UocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpLCAxKTtcbiAgICBpZiAoY2xpY2tzT25Ib2xkLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICAgIGNsaWNrc09uSG9sZC5zcGxpY2UoY2xpY2tzT25Ib2xkLmluZGV4T2YoYW5jaG9yKSwgMSk7XG4gICAgICBhY3RpdmF0b3IuZ28ocm91dGUudXJsLCB7IGNvbnRleHQ6IGFuY2hvciB9KTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBsaW5rcztcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHVuZXNjYXBlID0gcmVxdWlyZSgnLi91bmVzY2FwZScpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBjYWNoaW5nID0gcmVxdWlyZSgnLi9jYWNoaW5nJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIGcgPSBnbG9iYWw7XG52YXIgbW91bnRlZDtcbnZhciBib290ZWQ7XG5cbmZ1bmN0aW9uIG9yRW1wdHkgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gbW91bnQgKGNvbnRhaW5lciwgd2lyaW5nLCBvcHRpb25zKSB7XG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKG1vdW50ZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhdW51cyBhbHJlYWR5IG1vdW50ZWQhJyk7XG4gIH1cbiAgaWYgKCFjb250YWluZXIgfHwgIWNvbnRhaW5lci50YWdOYW1lKSB7IC8vIG5hw692ZSBpcyBlbm91Z2hcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhbiBhcHBsaWNhdGlvbiByb290IGNvbnRhaW5lciEnKTtcbiAgfVxuXG4gIG1vdW50ZWQgPSB0cnVlO1xuXG4gIHN0YXRlLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcbiAgc3RhdGUuY29udHJvbGxlcnMgPSB3aXJpbmcuY29udHJvbGxlcnM7XG4gIHN0YXRlLnRlbXBsYXRlcyA9IHdpcmluZy50ZW1wbGF0ZXM7XG4gIHN0YXRlLnJvdXRlcyA9IHdpcmluZy5yb3V0ZXM7XG4gIHN0YXRlLnByZWZldGNoID0gISFvLnByZWZldGNoO1xuXG4gIHJvdXRlci5zZXR1cCh3aXJpbmcucm91dGVzKTtcblxuICB2YXIgdXJsID0gbG9jYXRpb24ucGF0aG5hbWU7XG4gIHZhciBxdWVyeSA9IG9yRW1wdHkobG9jYXRpb24uc2VhcmNoKSArIG9yRW1wdHkobG9jYXRpb24uaGFzaCk7XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwgKyBxdWVyeSk7XG5cbiAgY2FjaGluZy5zZXR1cChvLmNhY2hlLCByb3V0ZSk7XG4gIGNhY2hpbmcucmVhZHkoa2lja3N0YXJ0KTtcblxuICBmdW5jdGlvbiBraWNrc3RhcnQgKCkge1xuICAgIGlmICghby5ib290c3RyYXApIHsgby5ib290c3RyYXAgPSAnYXV0byc7IH1cbiAgICBpZiAoby5ib290c3RyYXAgPT09ICdhdXRvJykge1xuICAgICAgYXV0b2Jvb3QoKTtcbiAgICB9IGVsc2UgaWYgKG8uYm9vdHN0cmFwID09PSAnaW5saW5lJykge1xuICAgICAgaW5saW5lYm9vdCgpO1xuICAgIH0gZWxzZSBpZiAoby5ib290c3RyYXAgPT09ICdtYW51YWwnKSB7XG4gICAgICBtYW51YWxib290KCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXV0b2Jvb3QgKCkge1xuICAgIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogY29udGFpbmVyLCBzb3VyY2U6ICdib290JyB9LCBmZXRjaGVkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZldGNoZWQgKGVyciwgZGF0YSkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmV0Y2hpbmcgSlNPTiBkYXRhIG1vZGVsIGZvciBmaXJzdCB2aWV3IGZhaWxlZC4nKTtcbiAgICB9XG4gICAgYm9vdChkYXRhKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlubGluZWJvb3QgKCkge1xuICAgIHZhciBpZCA9IGNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGF1bnVzJyk7XG4gICAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICB2YXIgbW9kZWwgPSBKU09OLnBhcnNlKHVuZXNjYXBlKHNjcmlwdC5pbm5lclRleHQgfHwgc2NyaXB0LnRleHRDb250ZW50KSk7XG4gICAgYm9vdChtb2RlbCk7XG4gIH1cblxuICBmdW5jdGlvbiBtYW51YWxib290ICgpIHtcbiAgICBpZiAodHlwZW9mIGcudGF1bnVzUmVhZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGcudGF1bnVzUmVhZHkgPSBib290OyAvLyBub3QgeWV0IGFuIG9iamVjdD8gdHVybiBpdCBpbnRvIHRoZSBib290IG1ldGhvZFxuICAgIH0gZWxzZSB7XG4gICAgICBib290KGcudGF1bnVzUmVhZHkpOyAvLyBhbHJlYWR5IGFuIG9iamVjdD8gYm9vdCB3aXRoIHRoYXQgYXMgdGhlIG1vZGVsXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYm9vdCAobW9kZWwpIHtcbiAgICBpZiAoYm9vdGVkKSB7IC8vIHNhbml0eVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIW1vZGVsIHx8IHR5cGVvZiBtb2RlbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIG1vZGVsIG11c3QgYmUgYW4gb2JqZWN0IScpO1xuICAgIH1cbiAgICBib290ZWQgPSB0cnVlO1xuICAgIGNhY2hpbmcucGVyc2lzdChyb3V0ZSwgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gICAgYWN0aXZhdG9yLnN0YXJ0KG1vZGVsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1vdW50O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHVzZWQ7XG4gIHJldHVybiBmdW5jdGlvbiBvbmNlICgpIHtcbiAgICBpZiAodXNlZCkgeyByZXR1cm47IH0gdXNlZCA9IHRydWU7XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xuXG5mdW5jdGlvbiBwb3NpdGlvbmluZyAoKSB7XG4gIHZhciB0YXJnZXQ7XG4gIHZhciBoYXNoID0gbG9jYXRpb24uaGFzaDtcbiAgaWYgKGhhc2gpIHtcbiAgICB0YXJnZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChoYXNoLnNsaWNlKDEpKTtcbiAgfVxuICBpZiAoIXRhcmdldCkge1xuICAgIHRhcmdldCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgfVxuICByYWYoZm9jdXNpbik7XG4gIGZ1bmN0aW9uIGZvY3VzaW4gKCkge1xuICAgIHRhcmdldC5zY3JvbGxJbnRvVmlldygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnRpYWwgKGNvbnRhaW5lciwgZW5mb3JjZWRBY3Rpb24sIG1vZGVsLCByb3V0ZSwgb3B0aW9ucykge1xuICB2YXIgYWN0aW9uID0gZW5mb3JjZWRBY3Rpb24gfHwgbW9kZWwgJiYgbW9kZWwuYWN0aW9uIHx8IHJvdXRlICYmIHJvdXRlLmFjdGlvbjtcbiAgdmFyIGNvbnRyb2xsZXIgPSBzdGF0ZS5jb250cm9sbGVyc1thY3Rpb25dO1xuICB2YXIgaW50ZXJuYWxzID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKGludGVybmFscy5yZW5kZXIgIT09IGZhbHNlKSB7XG4gICAgY29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlcihhY3Rpb24sIG1vZGVsKTtcbiAgICBpZiAoaW50ZXJuYWxzLnJvdXRlZCAhPT0gZmFsc2UpIHtcbiAgICAgIHBvc2l0aW9uaW5nKCk7XG4gICAgfVxuICB9XG4gIGVtaXR0ZXIuZW1pdCgncmVuZGVyJywgY29udGFpbmVyLCBtb2RlbCk7XG4gIGlmIChjb250cm9sbGVyKSB7XG4gICAgY29udHJvbGxlcihtb2RlbCwgY29udGFpbmVyLCByb3V0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyIChhY3Rpb24sIG1vZGVsKSB7XG4gIHZhciB0ZW1wbGF0ZSA9IHN0YXRlLnRlbXBsYXRlc1thY3Rpb25dO1xuICB0cnkge1xuICAgIHJldHVybiB0ZW1wbGF0ZShtb2RlbCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIHJlbmRlcmluZyBcIicgKyBhY3Rpb24gKyAnXCIgdGVtcGxhdGVcXG4nICsgZS5zdGFjayk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RhbmRhbG9uZSAoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSkge1xuICByZXR1cm4gcGFydGlhbChjb250YWluZXIsIGFjdGlvbiwgbW9kZWwsIHJvdXRlLCB7IHJvdXRlZDogZmFsc2UgfSk7XG59XG5cbnBhcnRpYWwuc3RhbmRhbG9uZSA9IHN0YW5kYWxvbmU7XG5cbm1vZHVsZS5leHBvcnRzID0gcGFydGlhbDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHVybCA9IHJlcXVpcmUoJ2Zhc3QtdXJsLXBhcnNlcicpO1xudmFyIHJvdXRlcyA9IHJlcXVpcmUoJ3JvdXRlcycpO1xudmFyIG1hdGNoZXIgPSByb3V0ZXMoKTtcblxuZnVuY3Rpb24gcm91dGVyIChyYXcpIHtcbiAgdmFyIHBhcnRzID0gdXJsLnBhcnNlKHJhdyk7XG4gIHZhciByZXN1bHQgPSBtYXRjaGVyLm1hdGNoKHBhcnRzLnBhdGhuYW1lKTtcbiAgdmFyIHJvdXRlID0gcmVzdWx0ID8gcmVzdWx0LmZuKHJlc3VsdCkgOiBudWxsO1xuICBpZiAocm91dGUpIHtcbiAgICByb3V0ZS51cmwgPSByYXc7XG4gICAgcm91dGUucGFydHMgPSBwYXJ0cztcbiAgfVxuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkZWZpbml0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZpbml0aW9ucykuZm9yRWFjaChkZWZpbmUuYmluZChudWxsLCBkZWZpbml0aW9ucykpO1xufVxuXG5mdW5jdGlvbiBkZWZpbmUgKGRlZmluaXRpb25zLCBrZXkpIHtcbiAgbWF0Y2hlci5hZGRSb3V0ZShrZXksIGZ1bmN0aW9uIGRlZmluaXRpb24gKG1hdGNoKSB7XG4gICAgdmFyIHBhcmFtcyA9IG1hdGNoLnBhcmFtcztcbiAgICBwYXJhbXMuYXJncyA9IG1hdGNoLnNwbGF0cztcbiAgICByZXR1cm4ge1xuICAgICAgcm91dGU6IGtleSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgYWN0aW9uOiBkZWZpbml0aW9uc1trZXldLmFjdGlvbiB8fCBudWxsLFxuICAgICAgaWdub3JlOiBkZWZpbml0aW9uc1trZXldLmlnbm9yZSxcbiAgICAgIGNhY2hlOiBkZWZpbml0aW9uc1trZXldLmNhY2hlXG4gICAgfTtcbiAgfSk7XG59XG5cbnJvdXRlci5zZXR1cCA9IHNldHVwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJvdXRlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNvbnRhaW5lcjogbnVsbFxufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGFwaSA9IHt9O1xudmFyIGcgPSBnbG9iYWw7XG52YXIgaWRiID0gZy5pbmRleGVkREIgfHwgZy5tb3pJbmRleGVkREIgfHwgZy53ZWJraXRJbmRleGVkREIgfHwgZy5tc0luZGV4ZWREQjtcbnZhciBzdXBwb3J0cztcbnZhciBkYjtcbnZhciBkYk5hbWUgPSAndGF1bnVzLWNhY2hlJztcbnZhciBzdG9yZSA9ICd2aWV3LW1vZGVscyc7XG52YXIga2V5UGF0aCA9ICd1cmwnO1xudmFyIHNldFF1ZXVlID0gW107XG52YXIgdGVzdGVkUXVldWUgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiB0ZXN0ICgpIHtcbiAgdmFyIGtleSA9ICdpbmRleGVkLWRiLWZlYXR1cmUtZGV0ZWN0aW9uJztcbiAgdmFyIHJlcTtcbiAgdmFyIGRiO1xuXG4gIGlmICghKGlkYiAmJiAnZGVsZXRlRGF0YWJhc2UnIGluIGlkYikpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTsgcmV0dXJuO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KS5vbnN1Y2Nlc3MgPSB0cmFuc2FjdGlvbmFsVGVzdDtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN1cHBvcnQoZmFsc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJhbnNhY3Rpb25hbFRlc3QgKCkge1xuICAgIHJlcSA9IGlkYi5vcGVuKGtleSwgMSk7XG4gICAgcmVxLm9udXBncmFkZW5lZWRlZCA9IHVwZ25lZWRlZDtcbiAgICByZXEub25lcnJvciA9IGVycm9yO1xuICAgIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gICAgZnVuY3Rpb24gdXBnbmVlZGVkICgpIHtcbiAgICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoJ3N0b3JlJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgICBkYiA9IHJlcS5yZXN1bHQ7XG4gICAgICB0cnkge1xuICAgICAgICBkYi50cmFuc2FjdGlvbignc3RvcmUnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3N0b3JlJykuYWRkKG5ldyBCbG9iKCksICdrZXknKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgc3VwcG9ydChmYWxzZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkYi5jbG9zZSgpO1xuICAgICAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KTtcbiAgICAgICAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkge1xuICAgICAgICAgIG9wZW4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvcGVuICgpIHtcbiAgdmFyIHJlcSA9IGlkYi5vcGVuKGRiTmFtZSwgMSk7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG4gIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgcmVxLnJlc3VsdC5jcmVhdGVPYmplY3RTdG9yZShzdG9yZSwgeyBrZXlQYXRoOiBrZXlQYXRoIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgZGIgPSByZXEucmVzdWx0O1xuICAgIGFwaS5uYW1lID0gJ0luZGV4ZWREQic7XG4gICAgYXBpLmdldCA9IGdldDtcbiAgICBhcGkuc2V0ID0gc2V0O1xuICAgIGRyYWluU2V0KCk7XG4gICAgc3VwcG9ydCh0cnVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmYWxsYmFjayAoKSB7XG4gIGFwaS5uYW1lID0gJ0luZGV4ZWREQi1mYWxsYmFja1N0b3JlJztcbiAgYXBpLmdldCA9IHVuZGVmaW5lZEdldDtcbiAgYXBpLnNldCA9IGVucXVldWVTZXQ7XG59XG5cbmZ1bmN0aW9uIHVuZGVmaW5lZEdldCAoa2V5LCBkb25lKSB7XG4gIGRvbmUobnVsbCwgbnVsbCk7XG59XG5cbmZ1bmN0aW9uIGVucXVldWVTZXQgKGtleSwgIHZhbHVlLCBkb25lKSB7XG4gIGlmIChzZXRRdWV1ZS5sZW5ndGggPiAyKSB7IC8vIGxldCdzIG5vdCB3YXN0ZSBhbnkgbW9yZSBtZW1vcnlcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkgeyAvLyBsZXQncyBhc3N1bWUgdGhlIGNhcGFiaWxpdHkgaXMgdmFsaWRhdGVkIHNvb25cbiAgICBzZXRRdWV1ZS5wdXNoKHsga2V5OiBrZXksIHZhbHVlOiB2YWx1ZSwgZG9uZTogZG9uZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblNldCAoKSB7XG4gIHdoaWxlIChzZXRRdWV1ZS5sZW5ndGgpIHtcbiAgICB2YXIgaXRlbSA9IHNldFF1ZXVlLnNoaWZ0KCk7XG4gICAgc2V0KGl0ZW0ua2V5LCBpdGVtLnZhbHVlLCBpdGVtLmRvbmUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHF1ZXJ5IChvcCwgdmFsdWUsIGRvbmUpIHtcbiAgdmFyIHJlcSA9IGRiLnRyYW5zYWN0aW9uKHN0b3JlLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoc3RvcmUpW29wXSh2YWx1ZSk7XG5cbiAgcmVxLm9uc3VjY2VzcyA9IHN1Y2Nlc3M7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobnVsbCwgcmVxLnJlc3VsdCk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobmV3IEVycm9yKCdUYXVudXMgY2FjaGUgcXVlcnkgZmFpbGVkIGF0IEluZGV4ZWREQiEnKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgcXVlcnkoJ2dldCcsIGtleSwgZG9uZSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICB2YWx1ZVtrZXlQYXRoXSA9IGtleTtcbiAgcXVlcnkoJ2FkZCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byBpbnNlcnRcbiAgcXVlcnkoJ3B1dCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byB1cGRhdGVcbn1cblxuZnVuY3Rpb24gZHJhaW5UZXN0ZWQgKCkge1xuICB3aGlsZSAodGVzdGVkUXVldWUubGVuZ3RoKSB7XG4gICAgdGVzdGVkUXVldWUuc2hpZnQoKSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRlc3RlZCAoZm4pIHtcbiAgaWYgKHN1cHBvcnRzICE9PSB2b2lkIDApIHtcbiAgICBmbigpO1xuICB9IGVsc2Uge1xuICAgIHRlc3RlZFF1ZXVlLnB1c2goZm4pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN1cHBvcnQgKHZhbHVlKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgcmV0dXJuOyAvLyBzYW5pdHlcbiAgfVxuICBzdXBwb3J0cyA9IHZhbHVlO1xuICBkcmFpblRlc3RlZCgpO1xufVxuXG5mdW5jdGlvbiBmYWlsZWQgKCkge1xuICBzdXBwb3J0KGZhbHNlKTtcbn1cblxuZmFsbGJhY2soKTtcbnRlc3QoKTtcbnNldFRpbWVvdXQoZmFpbGVkLCA2MDApOyAvLyB0aGUgdGVzdCBjYW4gdGFrZSBzb21ld2hlcmUgbmVhciAzMDBtcyB0byBjb21wbGV0ZVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcblxuYXBpLnRlc3RlZCA9IHRlc3RlZDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciByYXcgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiBnZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIHJhd1trZXldKTtcbn1cblxuZnVuY3Rpb24gc2V0IChrZXksIHZhbHVlLCBkb25lKSB7XG4gIHJhd1trZXldID0gdmFsdWU7XG4gIChkb25lIHx8IG5vb3ApKG51bGwpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbmFtZTogJ21lbW9yeVN0b3JlJyxcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVFc2NhcGVkSHRtbCA9IC8mKD86YW1wfGx0fGd0fHF1b3R8IzM5fCM5Nik7L2c7XG52YXIgaHRtbFVuZXNjYXBlcyA9IHtcbiAgJyZhbXA7JzogJyYnLFxuICAnJmx0Oyc6ICc8JyxcbiAgJyZndDsnOiAnPicsXG4gICcmcXVvdDsnOiAnXCInLFxuICAnJiMzOTsnOiAnXFwnJyxcbiAgJyYjOTY7JzogJ2AnXG59O1xuXG5mdW5jdGlvbiB1bmVzY2FwZUh0bWxDaGFyIChjKSB7XG4gIHJldHVybiBodG1sVW5lc2NhcGVzW2NdO1xufVxuXG5mdW5jdGlvbiB1bmVzY2FwZSAoaW5wdXQpIHtcbiAgdmFyIGRhdGEgPSBpbnB1dCA9PSBudWxsID8gJycgOiBTdHJpbmcoaW5wdXQpO1xuICBpZiAoZGF0YSAmJiAocmVFc2NhcGVkSHRtbC5sYXN0SW5kZXggPSAwLCByZUVzY2FwZWRIdG1sLnRlc3QoZGF0YSkpKSB7XG4gICAgcmV0dXJuIGRhdGEucmVwbGFjZShyZUVzY2FwZWRIdG1sLCB1bmVzY2FwZUh0bWxDaGFyKTtcbiAgfVxuICByZXR1cm4gZGF0YTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB1bmVzY2FwZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJ3hocicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAodXJsLCBkb25lKSB7XG4gIHZhciBvcHRpb25zID0ge1xuICAgIHVybDogdXJsLFxuICAgIGpzb246IHRydWUsXG4gICAgaGVhZGVyczogeyBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyB9XG4gIH07XG4gIHZhciByZXEgPSB4aHIob3B0aW9ucywgaGFuZGxlKTtcblxuICByZXR1cm4gcmVxO1xuXG4gIGZ1bmN0aW9uIGhhbmRsZSAoZXJyLCByZXMsIGJvZHkpIHtcbiAgICBpZiAoZXJyICYmICFyZXEuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpIHtcbiAgICAgIGRvbmUobmV3IEVycm9yKCdhYm9ydGVkJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKGVyciwgYm9keSk7XG4gICAgfVxuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9jb250cmEuZW1pdHRlci5qcycpO1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbihmdW5jdGlvbiAocm9vdCwgdW5kZWZpbmVkKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgdW5kZWYgPSAnJyArIHVuZGVmaW5lZDtcbiAgZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiAgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHsgaWYgKCFmbikgeyByZXR1cm47IH0gdGljayhmdW5jdGlvbiBydW4gKCkgeyBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7IH0pOyB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gdGlja2VyXG4gIHZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG4gIGlmIChzaSkge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gdW5kZWYgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgIHRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICB9IGVsc2Uge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG4gIH1cblxuICBmdW5jdGlvbiBfZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2dCA9IHt9O1xuICAgIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGMgPT09IDEpIHtcbiAgICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgICBldnQgPSB7fTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgY3R4ID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIHR5cGUgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0KSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldnRbdHlwZV0gPSBldC5maWx0ZXIoZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgcmV0dXJuICFsaXN0ZW4uX29uY2U7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IF9lbWl0dGVyO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gcm9vdC5jb250cmEgfHwge307XG4gICAgcm9vdC5jb250cmEuZW1pdHRlciA9IF9lbWl0dGVyO1xuICB9XG59KSh0aGlzKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIlwidXNlIHN0cmljdFwiO1xuLypcbkNvcHlyaWdodCAoYykgMjAxNCBQZXRrYSBBbnRvbm92XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuICBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG4qL1xuZnVuY3Rpb24gVXJsKCkge1xuICAgIC8vRm9yIG1vcmUgZWZmaWNpZW50IGludGVybmFsIHJlcHJlc2VudGF0aW9uIGFuZCBsYXppbmVzcy5cbiAgICAvL1RoZSBub24tdW5kZXJzY29yZSB2ZXJzaW9ucyBvZiB0aGVzZSBwcm9wZXJ0aWVzIGFyZSBhY2Nlc3NvciBmdW5jdGlvbnNcbiAgICAvL2RlZmluZWQgb24gdGhlIHByb3RvdHlwZS5cbiAgICB0aGlzLl9wcm90b2NvbCA9IG51bGw7XG4gICAgdGhpcy5faHJlZiA9IFwiXCI7XG4gICAgdGhpcy5fcG9ydCA9IC0xO1xuICAgIHRoaXMuX3F1ZXJ5ID0gbnVsbDtcblxuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICB0aGlzLmhvc3QgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuXG4gICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gZmFsc2U7XG59XG5cbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoXCJxdWVyeXN0cmluZ1wiKTtcblVybC5wcm90b3R5cGUucGFyc2UgPVxuZnVuY3Rpb24gVXJsJHBhcnNlKHN0ciwgcGFyc2VRdWVyeVN0cmluZywgaG9zdERlbm90ZXNTbGFzaCkge1xuICAgIGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICtcbiAgICAgICAgICAgIHR5cGVvZiBzdHIpO1xuICAgIH1cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSBzdHIubGVuZ3RoIC0gMTtcblxuICAgIC8vVHJpbSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3c1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChzdGFydCkgPD0gMHgyMCAvKicgJyovKSBzdGFydCsrO1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChlbmQpIDw9IDB4MjAgLyonICcqLykgZW5kLS07XG5cbiAgICBzdGFydCA9IHRoaXMuX3BhcnNlUHJvdG9jb2woc3RyLCBzdGFydCwgZW5kKTtcblxuICAgIC8vSmF2YXNjcmlwdCBkb2Vzbid0IGhhdmUgaG9zdFxuICAgIGlmICh0aGlzLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgc3RhcnQgPSB0aGlzLl9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBob3N0RGVub3Rlc1NsYXNoKTtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICAgICAgKHRoaXMuc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoUHJvdG9jb2xzW3Byb3RvXSkpKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFydCA8PSBlbmQpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHsgLy9Gb3IgamF2YXNjcmlwdCB0aGUgcGF0aG5hbWUgaXMganVzdCB0aGUgcmVzdCBvZiBpdFxuICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGF0aG5hbWUgJiYgdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICB0aGlzLl9zbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF0pIHtcbiAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgIH1cblxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICAgICAgaWYgKHNlYXJjaCA9PSBudWxsKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSB0aGlzLnNlYXJjaCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgICAvL1RoaXMgY2FsbHMgYSBzZXR0ZXIgZnVuY3Rpb24sIHRoZXJlIGlzIG5vIC5xdWVyeSBkYXRhIHByb3BlcnR5XG4gICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZShzZWFyY2gpO1xuICAgIH1cbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlKHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdChVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRmb3JtYXQoKSB7XG4gICAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgXCJcIjtcblxuICAgIGlmIChhdXRoKSB7XG4gICAgICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCBcIjpcIik7XG4gICAgICAgIGF1dGggKz0gXCJAXCI7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCBcIlwiO1xuICAgIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCBcIlwiO1xuICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgIHZhciBxdWVyeSA9IFwiXCI7XG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0IHx8IFwiXCI7XG4gICAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgICB2YXIgc2NoZW1lID0gXCJcIjtcblxuICAgIC8vQ2FjaGUgdGhlIHJlc3VsdCBvZiB0aGUgZ2V0dGVyIGZ1bmN0aW9uXG4gICAgdmFyIHEgPSB0aGlzLnF1ZXJ5O1xuICAgIGlmIChxICYmIHR5cGVvZiBxID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHEpO1xuICAgIH1cblxuICAgIGlmICghc2VhcmNoKSB7XG4gICAgICAgIHNlYXJjaCA9IHF1ZXJ5ID8gXCI/XCIgKyBxdWVyeSA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDB4M0EgLyonOicqLylcbiAgICAgICAgcHJvdG9jb2wgKz0gXCI6XCI7XG5cbiAgICBpZiAodGhpcy5ob3N0KSB7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICAgIH1cbiAgICBlbHNlIGlmIChob3N0bmFtZSkge1xuICAgICAgICB2YXIgaXA2ID0gaG9zdG5hbWUuaW5kZXhPZihcIjpcIikgPiAtMTtcbiAgICAgICAgaWYgKGlwNikgaG9zdG5hbWUgPSBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgaG9zdG5hbWUgKyAocG9ydCA/IFwiOlwiICsgcG9ydCA6IFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBzbGFzaGVzID0gdGhpcy5zbGFzaGVzIHx8XG4gICAgICAgICgoIXByb3RvY29sIHx8XG4gICAgICAgIHNsYXNoUHJvdG9jb2xzW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpO1xuXG5cbiAgICBpZiAocHJvdG9jb2wpIHNjaGVtZSA9IHByb3RvY29sICsgKHNsYXNoZXMgPyBcIi8vXCIgOiBcIlwiKTtcbiAgICBlbHNlIGlmIChzbGFzaGVzKSBzY2hlbWUgPSBcIi8vXCI7XG5cbiAgICBpZiAoc2xhc2hlcyAmJiBwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIi9cIiArIHBhdGhuYW1lO1xuICAgIH1cbiAgICBlbHNlIGlmICghc2xhc2hlcyAmJiBwYXRobmFtZSA9PT0gXCIvXCIpIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSAweDNGIC8qJz8nKi8pXG4gICAgICAgIHNlYXJjaCA9IFwiP1wiICsgc2VhcmNoO1xuICAgIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMHgyMyAvKicjJyovKVxuICAgICAgICBoYXNoID0gXCIjXCIgKyBoYXNoO1xuXG4gICAgcGF0aG5hbWUgPSBlc2NhcGVQYXRoTmFtZShwYXRobmFtZSk7XG4gICAgc2VhcmNoID0gZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG5cbiAgICByZXR1cm4gc2NoZW1lICsgKGhvc3QgPT09IGZhbHNlID8gXCJcIiA6IGhvc3QpICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJHJlc29sdmVPYmplY3QocmVsYXRpdmUpIHtcbiAgICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZWxhdGl2ZSA9IFVybC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMuX2Nsb25lKCk7XG5cbiAgICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlXCJzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICAgIGlmICghcmVsYXRpdmUuaHJlZikge1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICAgIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5fcHJvdG9jb2wpIHtcbiAgICAgICAgcmVsYXRpdmUuX2NvcHlQcm9wc1RvKHJlc3VsdCwgdHJ1ZSk7XG5cbiAgICAgICAgaWYgKHNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdICYmXG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gcmVzdWx0Ll9wcm90b2NvbCkge1xuICAgICAgICAvLyBpZiBpdFwicyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgICAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAgICAgLy8gZmlyc3QsIGlmIGl0XCJzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgICAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgICAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGJlY2F1c2UgdGhhdFwicyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAgICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgICAgICBpZiAoIXNsYXNoUHJvdG9jb2xzW3JlbGF0aXZlLl9wcm90b2NvbF0pIHtcbiAgICAgICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIGZhbHNlKTtcbiAgICAgICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Ll9wcm90b2NvbCA9IHJlbGF0aXZlLl9wcm90b2NvbDtcbiAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0ICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8IFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAocmVsUGF0aFswXSAhPT0gXCJcIikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKFwiL1wiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IFwiXCI7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgcmVzdWx0Ll9wb3J0ID0gcmVsYXRpdmUuX3BvcnQ7XG4gICAgICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICB2YXIgaXNTb3VyY2VBYnMgPVxuICAgICAgICAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pO1xuICAgIHZhciBpc1JlbEFicyA9IChcbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICAgIChyZWxhdGl2ZS5wYXRobmFtZSAmJlxuICAgICAgICAgICAgcmVsYXRpdmUucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKVxuICAgICAgICApO1xuICAgIHZhciBtdXN0RW5kQWJzID0gKGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKTtcblxuICAgIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcblxuICAgIHZhciBzcmNQYXRoID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5fcHJvdG9jb2wgJiYgIXNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdO1xuXG4gICAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAgIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gICAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IC0xO1xuICAgICAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgICAgICAgIGlmIChzcmNQYXRoWzBdID09PSBcIlwiKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICAgICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Lmhvc3QgPSBcIlwiO1xuICAgICAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICByZWxhdGl2ZS5fcG9ydCA9IC0xO1xuICAgICAgICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gXCJcIikgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgICAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gXCJcIiB8fCBzcmNQYXRoWzBdID09PSBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaXNSZWxBYnMpIHtcbiAgICAgICAgLy8gaXRcInMgYWJzb2x1dGUuXG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lID9cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAgICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gICAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgICAgICAvLyBpdFwicyByZWxhdGl2ZVxuICAgICAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICAgICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgICAgIHNyY1BhdGgucG9wKCk7XG4gICAgICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCkge1xuICAgICAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgICAgIC8vIGxpa2UgaHJlZj1cIj9mb29cIi5cbiAgICAgICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoXCJtYWlsdG86bG9jYWwxQGRvbWFpbjFcIiwgXCJsb2NhbDJAZG9tYWluMlwiKVxuICAgICAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgICAgICAvLyB3ZVwidmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gICAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAgIChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gXCIuXCIgfHwgbGFzdCA9PT0gXCIuLlwiKSB8fFxuICAgICAgICBsYXN0ID09PSBcIlwiKTtcblxuICAgIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICAgIHZhciB1cCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgICAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICAgICAgaWYgKGxhc3QgPT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICB9IGVsc2UgaWYgKGxhc3QgPT09IFwiLi5cIikge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cCsrO1xuICAgICAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHVwLS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gICAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiLi5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSBcIlwiICYmXG4gICAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgIT09IDB4MkYgLyonLycqLykpIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oXCIvXCIpLnN1YnN0cigtMSkgIT09IFwiL1wiKSkge1xuICAgICAgICBzcmNQYXRoLnB1c2goXCJcIik7XG4gICAgfVxuXG4gICAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSBcIlwiIHx8XG4gICAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcblxuICAgIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IGlzQWJzb2x1dGUgPyBcIlwiIDpcbiAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogXCJcIjtcbiAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpIDogZmFsc2U7XG4gICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICAgIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmxlbmd0aCA9PT0gMCA/IG51bGwgOiBzcmNQYXRoLmpvaW4oXCIvXCIpO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIHB1bnljb2RlID0gcmVxdWlyZShcInB1bnljb2RlXCIpO1xuVXJsLnByb3RvdHlwZS5faG9zdElkbmEgPSBmdW5jdGlvbiBVcmwkX2hvc3RJZG5hKGhvc3RuYW1lKSB7XG4gICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgIHZhciBkb21haW5BcnJheSA9IGhvc3RuYW1lLnNwbGl0KFwiLlwiKTtcbiAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgIFwieG4tLVwiICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgfVxuICAgIHJldHVybiBuZXdPdXQuam9pbihcIi5cIik7XG59O1xuXG52YXIgZXNjYXBlUGF0aE5hbWUgPSBVcmwucHJvdG90eXBlLl9lc2NhcGVQYXRoTmFtZSA9XG5mdW5jdGlvbiBVcmwkX2VzY2FwZVBhdGhOYW1lKHBhdGhuYW1lKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIocGF0aG5hbWUsIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovKSkge1xuICAgICAgICByZXR1cm4gcGF0aG5hbWU7XG4gICAgfVxuICAgIC8vQXZvaWQgY2xvc3VyZSBjcmVhdGlvbiB0byBrZWVwIHRoaXMgaW5saW5hYmxlXG4gICAgcmV0dXJuIF9lc2NhcGVQYXRoKHBhdGhuYW1lKTtcbn07XG5cbnZhciBlc2NhcGVTZWFyY2ggPSBVcmwucHJvdG90eXBlLl9lc2NhcGVTZWFyY2ggPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIoc2VhcmNoLCAweDIzIC8qJyMnKi8sIC0xKSkgcmV0dXJuIHNlYXJjaDtcbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVByb3RvY29sID0gZnVuY3Rpb24gVXJsJF9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBwcm90b2NvbENoYXJhY3RlcnMgPSB0aGlzLl9wcm90b2NvbENoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgIHZhciBwcm90b2NvbCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICBpZiAoZG9Mb3dlckNhc2UpIHByb3RvY29sID0gcHJvdG9jb2wudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJvdG9jb2xDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGNoIDwgMHg2MSAvKidhJyovKVxuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlQXV0aCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VBdXRoKHN0ciwgc3RhcnQsIGVuZCwgZGVjb2RlKSB7XG4gICAgdmFyIGF1dGggPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEpO1xuICAgIGlmIChkZWNvZGUpIHtcbiAgICAgICAgYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG4gICAgdGhpcy5hdXRoID0gYXV0aDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUG9ydCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQb3J0KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIC8vSW50ZXJuYWwgZm9ybWF0IGlzIGludGVnZXIgZm9yIG1vcmUgZWZmaWNpZW50IHBhcnNpbmdcbiAgICAvL2FuZCBmb3IgZWZmaWNpZW50IHRyaW1taW5nIG9mIGxlYWRpbmcgemVyb3NcbiAgICB2YXIgcG9ydCA9IDA7XG4gICAgLy9EaXN0aW5ndWlzaCBiZXR3ZWVuIDowIGFuZCA6IChubyBwb3J0IG51bWJlciBhdCBhbGwpXG4gICAgdmFyIGhhZENoYXJzID0gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pIHtcbiAgICAgICAgICAgIHBvcnQgPSAoMTAgKiBwb3J0KSArIChjaCAtIDB4MzAgLyonMCcqLyk7XG4gICAgICAgICAgICBoYWRDaGFycyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBicmVhaztcblxuICAgIH1cbiAgICBpZiAocG9ydCA9PT0gMCAmJiAhaGFkQ2hhcnMpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgdGhpcy5fcG9ydCA9IHBvcnQ7XG4gICAgcmV0dXJuIGkgLSBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSG9zdCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlSG9zdChzdHIsIHN0YXJ0LCBlbmQsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgdmFyIGhvc3RFbmRpbmdDaGFyYWN0ZXJzID0gdGhpcy5faG9zdEVuZGluZ0NoYXJhY3RlcnM7XG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHgyRiAvKicvJyovICYmXG4gICAgICAgIHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgMSkgPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuXG4gICAgICAgIC8vVGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHtcbiAgICAgICAgICAgIC8vVGhlIHN0cmluZyBpcyBqdXN0IFwiLy9cIlxuICAgICAgICAgICAgaWYgKGVuZCA8IDIpIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIC8vSWYgc2xhc2hlcyBkbyBub3QgZGVub3RlIGhvc3QgYW5kIHRoZXJlIGlzIG5vIGF1dGgsXG4gICAgICAgICAgICAvL3RoZXJlIGlzIG5vIGhvc3Qgd2hlbiB0aGUgc3RyaW5nIHN0YXJ0cyB3aXRoIC8vXG4gICAgICAgICAgICB2YXIgaGFzQXV0aCA9XG4gICAgICAgICAgICAgICAgY29udGFpbnNDaGFyYWN0ZXIoc3RyLCAweDQwIC8qJ0AnKi8sIDIsIGhvc3RFbmRpbmdDaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIGlmICghaGFzQXV0aCAmJiAhc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL1RoZXJlIGlzIGEgaG9zdCB0aGF0IHN0YXJ0cyBhZnRlciB0aGUgLy9cbiAgICAgICAgc3RhcnQgKz0gMjtcbiAgICB9XG4gICAgLy9JZiB0aGVyZSBpcyBubyBzbGFzaGVzLCB0aGVyZSBpcyBubyBob3N0bmFtZSBpZlxuICAgIC8vMS4gdGhlcmUgd2FzIG5vIHByb3RvY29sIGF0IGFsbFxuICAgIGVsc2UgaWYgKCF0aGlzLl9wcm90b2NvbCB8fFxuICAgICAgICAvLzIuIHRoZXJlIHdhcyBhIHByb3RvY29sIHRoYXQgcmVxdWlyZXMgc2xhc2hlc1xuICAgICAgICAvL2UuZy4gaW4gJ2h0dHA6YXNkJyAnYXNkJyBpcyBub3QgYSBob3N0bmFtZVxuICAgICAgICBzbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF1cbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBpZG5hID0gZmFsc2U7XG4gICAgdmFyIGhvc3ROYW1lU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgaG9zdE5hbWVFbmQgPSBlbmQ7XG4gICAgdmFyIGxhc3RDaCA9IC0xO1xuICAgIHZhciBwb3J0TGVuZ3RoID0gMDtcbiAgICB2YXIgY2hhcnNBZnRlckRvdCA9IDA7XG4gICAgdmFyIGF1dGhOZWVkc0RlY29kaW5nID0gZmFsc2U7XG5cbiAgICB2YXIgaiA9IC0xO1xuXG4gICAgLy9GaW5kIHRoZSBsYXN0IG9jY3VycmVuY2Ugb2YgYW4gQC1zaWduIHVudGlsIGhvc3RlbmRpbmcgY2hhcmFjdGVyIGlzIG1ldFxuICAgIC8vYWxzbyBtYXJrIGlmIGRlY29kaW5nIGlzIG5lZWRlZCBmb3IgdGhlIGF1dGggcG9ydGlvblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4NDAgLyonQCcqLykge1xuICAgICAgICAgICAgaiA9IGk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNoZWNrIGlzIHZlcnksIHZlcnkgY2hlYXAuIFVubmVlZGVkIGRlY29kZVVSSUNvbXBvbmVudCBpcyB2ZXJ5XG4gICAgICAgIC8vdmVyeSBleHBlbnNpdmVcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjUgLyonJScqLykge1xuICAgICAgICAgICAgYXV0aE5lZWRzRGVjb2RpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhvc3RFbmRpbmdDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvL0Atc2lnbiB3YXMgZm91bmQgYXQgaW5kZXggaiwgZXZlcnl0aGluZyB0byB0aGUgbGVmdCBmcm9tIGl0XG4gICAgLy9pcyBhdXRoIHBhcnRcbiAgICBpZiAoaiA+IC0xKSB7XG4gICAgICAgIHRoaXMuX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBqIC0gMSwgYXV0aE5lZWRzRGVjb2RpbmcpO1xuICAgICAgICAvL2hvc3RuYW1lIHN0YXJ0cyBhZnRlciB0aGUgbGFzdCBALXNpZ25cbiAgICAgICAgc3RhcnQgPSBob3N0TmFtZVN0YXJ0ID0gaiArIDE7XG4gICAgfVxuXG4gICAgLy9Ib3N0IG5hbWUgaXMgc3RhcnRpbmcgd2l0aCBhIFtcbiAgICBpZiAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpID09PSAweDVCIC8qJ1snKi8pIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0ICsgMTsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgICAgIC8vQXNzdW1lIHZhbGlkIElQNiBpcyBiZXR3ZWVuIHRoZSBicmFja2V0c1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDVEIC8qJ10nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAyLCBlbmQpICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKHN0YXJ0ICsgMSwgaSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBcIltcIiArIGhvc3RuYW1lICsgXCJdOlwiICsgdGhpcy5fcG9ydFxuICAgICAgICAgICAgICAgICAgICA6IFwiW1wiICsgaG9zdG5hbWUgKyBcIl1cIjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGkgKyBwb3J0TGVuZ3RoICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL0VtcHR5IGhvc3RuYW1lLCBbIHN0YXJ0cyBhIHBhdGhcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICBpZiAoY2hhcnNBZnRlckRvdCA+IDYyKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gc3RyLnNsaWNlKHN0YXJ0LCBpKTtcbiAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICBwb3J0TGVuZ3RoID0gdGhpcy5fcGFyc2VQb3J0KHN0ciwgaSArIDEsIGVuZCkgKyAxO1xuICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoIDwgMHg2MSAvKidhJyovKSB7XG4gICAgICAgICAgICBpZiAoY2ggPT09IDB4MkUgLyonLicqLykge1xuICAgICAgICAgICAgICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGlmIChsYXN0Q2ggPT09IERPVCB8fCBsYXN0Q2ggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2hhcnNBZnRlckRvdCA9IC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoMHg0MSAvKidBJyovIDw9IGNoICYmIGNoIDw9IDB4NUEgLyonWicqLykge1xuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCEoY2ggPT09IDB4MkQgLyonLScqLyB8fCBjaCA9PT0gMHg1RiAvKidfJyovIHx8XG4gICAgICAgICAgICAgICAgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pKSkge1xuICAgICAgICAgICAgICAgIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDAgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID49IDB4N0IgLyoneycqLykge1xuICAgICAgICAgICAgaWYgKGNoIDw9IDB4N0UgLyonficqLykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnNbY2hdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZG5hID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0Q2ggPSBjaDtcbiAgICAgICAgY2hhcnNBZnRlckRvdCsrO1xuICAgIH1cblxuICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAvKlxuICAgIGlmIChsYXN0Q2ggPT09IERPVCkge1xuICAgICAgICBob3N0TmFtZUVuZC0tO1xuICAgIH1cbiAgICAqL1xuXG4gICAgaWYgKGhvc3ROYW1lRW5kICsgMSAhPT0gc3RhcnQgJiZcbiAgICAgICAgaG9zdE5hbWVFbmQgLSBob3N0TmFtZVN0YXJ0IDw9IDI1Nikge1xuICAgICAgICB2YXIgaG9zdG5hbWUgPSBzdHIuc2xpY2UoaG9zdE5hbWVTdGFydCwgaG9zdE5hbWVFbmQgKyAxKTtcbiAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBob3N0bmFtZSA9IGhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChpZG5hKSBob3N0bmFtZSA9IHRoaXMuX2hvc3RJZG5hKGhvc3RuYW1lKTtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICB0aGlzLmhvc3QgPSB0aGlzLl9wb3J0ID4gMCA/IGhvc3RuYW1lICsgXCI6XCIgKyB0aGlzLl9wb3J0IDogaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhvc3ROYW1lRW5kICsgMSArIHBvcnRMZW5ndGg7XG5cbn07XG5cblVybC5wcm90b3R5cGUuX2NvcHlQcm9wc1RvID0gZnVuY3Rpb24gVXJsJF9jb3B5UHJvcHNUbyhpbnB1dCwgbm9Qcm90b2NvbCkge1xuICAgIGlmICghbm9Qcm90b2NvbCkge1xuICAgICAgICBpbnB1dC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICB9XG4gICAgaW5wdXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIGlucHV0Ll9wb3J0ID0gdGhpcy5fcG9ydDtcbiAgICBpbnB1dC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIGlucHV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgaW5wdXQuc2xhc2hlcyA9IHRoaXMuc2xhc2hlcztcbiAgICBpbnB1dC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIGlucHV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICBpbnB1dC5oYXNoID0gdGhpcy5oYXNoO1xuICAgIGlucHV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIGlucHV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbn07XG5cblVybC5wcm90b3R5cGUuX2Nsb25lID0gZnVuY3Rpb24gVXJsJF9jbG9uZSgpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICByZXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIHJldC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgcmV0Ll9wcmVwZW5kU2xhc2ggPSB0aGlzLl9wcmVwZW5kU2xhc2g7XG4gICAgcmV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgcmV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgcmV0Lmhvc3QgPSB0aGlzLmhvc3Q7XG4gICAgcmV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICByZXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICByZXQuc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgcmV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fZ2V0Q29tcG9uZW50RXNjYXBlZCA9XG5mdW5jdGlvbiBVcmwkX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIGN1ciA9IHN0YXJ0O1xuICAgIHZhciBpID0gc3RhcnQ7XG4gICAgdmFyIHJldCA9IFwiXCI7XG4gICAgdmFyIGF1dG9Fc2NhcGVNYXAgPSB0aGlzLl9hdXRvRXNjYXBlTWFwO1xuICAgIGZvciAoOyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB2YXIgZXNjYXBlZCA9IGF1dG9Fc2NhcGVNYXBbY2hdO1xuXG4gICAgICAgIGlmIChlc2NhcGVkICE9PSBcIlwiKSB7XG4gICAgICAgICAgICBpZiAoY3VyIDwgaSkgcmV0ICs9IHN0ci5zbGljZShjdXIsIGkpO1xuICAgICAgICAgICAgcmV0ICs9IGVzY2FwZWQ7XG4gICAgICAgICAgICBjdXIgPSBpICsgMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VyIDwgaSArIDEpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQYXRoID1cbmZ1bmN0aW9uIFVybCRfcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBwYXRoU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgcGF0aEVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBwYXRoRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXRoU3RhcnQgPiBwYXRoRW5kKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwYXRoO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcGF0aCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBwYXRoU3RhcnQsIHBhdGhFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcGF0aCA9IHN0ci5zbGljZShwYXRoU3RhcnQsIHBhdGhFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5wYXRobmFtZSA9IHRoaXMuX3ByZXBlbmRTbGFzaCA/IFwiL1wiICsgcGF0aCA6IHBhdGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVF1ZXJ5ID0gZnVuY3Rpb24gVXJsJF9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBxdWVyeVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHF1ZXJ5RW5kID0gZW5kO1xuICAgIHZhciBlc2NhcGUgPSBmYWxzZTtcbiAgICB2YXIgYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSB0aGlzLl9hdXRvRXNjYXBlQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHF1ZXJ5RW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChxdWVyeVN0YXJ0ID4gcXVlcnlFbmQpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5O1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcXVlcnkgPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcXVlcnlTdGFydCwgcXVlcnlFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSBzdHIuc2xpY2UocXVlcnlTdGFydCwgcXVlcnlFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5zZWFyY2ggPSBxdWVyeTtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSGFzaCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIGlmIChzdGFydCA+IGVuZCkge1xuICAgICAgICB0aGlzLmhhc2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaGFzaCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInBvcnRcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wb3J0ID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiAoXCJcIiArIHRoaXMuX3BvcnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSBwYXJzZUludCh2LCAxMCk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicXVlcnlcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5O1xuICAgICAgICBpZiAocXVlcnkgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcblxuICAgICAgICBpZiAoc2VhcmNoKSB7XG4gICAgICAgICAgICBpZiAoc2VhcmNoLmNoYXJDb2RlQXQoMCkgPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzZWFyY2ggIT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHNlYXJjaDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWFyY2g7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5fcXVlcnkgPSB2O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwYXRoXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgICAgICBpZiAocCB8fCBzKSB7XG4gICAgICAgICAgICByZXR1cm4gcCArIHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChwID09IG51bGwgJiYgcykgPyAoXCIvXCIgKyBzKSA6IG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKCkge31cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwcm90b2NvbFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIHJldHVybiBwcm90byA/IHByb3RvICsgXCI6XCIgOiBwcm90bztcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBlbmQgPSB2Lmxlbmd0aCAtIDE7XG4gICAgICAgICAgICBpZiAodi5jaGFyQ29kZUF0KGVuZCkgPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdi5zbGljZSgwLCBlbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSB2O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcImhyZWZcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBocmVmID0gdGhpcy5faHJlZjtcbiAgICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgICAgICBocmVmID0gdGhpcy5faHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhyZWY7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5faHJlZiA9IHY7XG4gICAgfVxufSk7XG5cblVybC5wYXJzZSA9IGZ1bmN0aW9uIFVybCRQYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAoc3RyIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gc3RyO1xuICAgIHZhciByZXQgPSBuZXcgVXJsKCk7XG4gICAgcmV0LnBhcnNlKHN0ciwgISFwYXJzZVF1ZXJ5U3RyaW5nLCAhIWhvc3REZW5vdGVzU2xhc2gpO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwuZm9ybWF0ID0gZnVuY3Rpb24gVXJsJEZvcm1hdChvYmopIHtcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvYmogPSBVcmwucGFyc2Uob2JqKTtcbiAgICB9XG4gICAgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkge1xuICAgICAgICByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufTtcblxuVXJsLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn07XG5cblVybC5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIGlmICghc291cmNlKSByZXR1cm4gcmVsYXRpdmU7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlT2JqZWN0KHJlbGF0aXZlKTtcbn07XG5cbmZ1bmN0aW9uIF9lc2NhcGVQYXRoKHBhdGhuYW1lKSB7XG4gICAgcmV0dXJuIHBhdGhuYW1lLnJlcGxhY2UoL1s/I10vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgcmV0dXJuIHNlYXJjaC5yZXBsYWNlKC8jL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG4vL1NlYXJjaCBgY2hhcjFgIChpbnRlZ2VyIGNvZGUgZm9yIGEgY2hhcmFjdGVyKSBpbiBgc3RyaW5nYFxuLy9zdGFydGluZyBmcm9tIGBmcm9tSW5kZXhgIGFuZCBlbmRpbmcgYXQgYHN0cmluZy5sZW5ndGggLSAxYFxuLy9vciB3aGVuIGEgc3RvcCBjaGFyYWN0ZXIgaXMgZm91bmRcbmZ1bmN0aW9uIGNvbnRhaW5zQ2hhcmFjdGVyKHN0cmluZywgY2hhcjEsIGZyb21JbmRleCwgc3RvcENoYXJhY3RlclRhYmxlKSB7XG4gICAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IGZyb21JbmRleDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gY2hhcjEpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHN0b3BDaGFyYWN0ZXJUYWJsZVtjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vU2VlIGlmIGBjaGFyMWAgb3IgYGNoYXIyYCAoaW50ZWdlciBjb2RlcyBmb3IgY2hhcmFjdGVycylcbi8vaXMgY29udGFpbmVkIGluIGBzdHJpbmdgXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcjIoc3RyaW5nLCBjaGFyMSwgY2hhcjIpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IGNoYXIxIHx8IGNoID09PSBjaGFyMikgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy9NYWtlcyBhbiBhcnJheSBvZiAxMjggdWludDgncyB3aGljaCByZXByZXNlbnQgYm9vbGVhbiB2YWx1ZXMuXG4vL1NwZWMgaXMgYW4gYXJyYXkgb2YgYXNjaWkgY29kZSBwb2ludHMgb3IgYXNjaWkgY29kZSBwb2ludCByYW5nZXNcbi8vcmFuZ2VzIGFyZSBleHByZXNzZWQgYXMgW3N0YXJ0LCBlbmRdXG5cbi8vQ3JlYXRlIGEgdGFibGUgd2l0aCB0aGUgY2hhcmFjdGVycyAweDMwLTB4MzkgKGRlY2ltYWxzICcwJyAtICc5JykgYW5kXG4vLzB4N0EgKGxvd2VyY2FzZWxldHRlciAneicpIGFzIGB0cnVlYDpcbi8vXG4vL3ZhciBhID0gbWFrZUFzY2lpVGFibGUoW1sweDMwLCAweDM5XSwgMHg3QV0pO1xuLy9hWzB4MzBdOyAvLzFcbi8vYVsweDE1XTsgLy8wXG4vL2FbMHgzNV07IC8vMVxuZnVuY3Rpb24gbWFrZUFzY2lpVGFibGUoc3BlYykge1xuICAgIHZhciByZXQgPSBuZXcgVWludDhBcnJheSgxMjgpO1xuICAgIHNwZWMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICByZXRbaXRlbV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gaXRlbVswXTtcbiAgICAgICAgICAgIHZhciBlbmQgPSBpdGVtWzFdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0OyBqIDw9IGVuZDsgKytqKSB7XG4gICAgICAgICAgICAgICAgcmV0W2pdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJldDtcbn1cblxuXG52YXIgYXV0b0VzY2FwZSA9IFtcIjxcIiwgXCI+XCIsIFwiXFxcIlwiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsIFwiXFxuXCIsXG4gICAgXCJcXHRcIiwgXCJ7XCIsIFwifVwiLCBcInxcIiwgXCJcXFxcXCIsIFwiXlwiLCBcImBcIiwgXCInXCJdO1xuXG52YXIgYXV0b0VzY2FwZU1hcCA9IG5ldyBBcnJheSgxMjgpO1xuXG5cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGVNYXAubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBhdXRvRXNjYXBlTWFwW2ldID0gXCJcIjtcbn1cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgYyA9IGF1dG9Fc2NhcGVbaV07XG4gICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChjKTtcbiAgICBpZiAoZXNjID09PSBjKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShjKTtcbiAgICB9XG4gICAgYXV0b0VzY2FwZU1hcFtjLmNoYXJDb2RlQXQoMCldID0gZXNjO1xufVxuXG5cbnZhciBzbGFzaFByb3RvY29scyA9IFVybC5wcm90b3R5cGUuX3NsYXNoUHJvdG9jb2xzID0ge1xuICAgIGh0dHA6IHRydWUsXG4gICAgaHR0cHM6IHRydWUsXG4gICAgZ29waGVyOiB0cnVlLFxuICAgIGZpbGU6IHRydWUsXG4gICAgZnRwOiB0cnVlLFxuXG4gICAgXCJodHRwOlwiOiB0cnVlLFxuICAgIFwiaHR0cHM6XCI6IHRydWUsXG4gICAgXCJnb3BoZXI6XCI6IHRydWUsXG4gICAgXCJmaWxlOlwiOiB0cnVlLFxuICAgIFwiZnRwOlwiOiB0cnVlXG59O1xuXG4vL09wdGltaXplIGJhY2sgZnJvbSBub3JtYWxpemVkIG9iamVjdCBjYXVzZWQgYnkgbm9uLWlkZW50aWZpZXIga2V5c1xuZnVuY3Rpb24gZigpe31cbmYucHJvdG90eXBlID0gc2xhc2hQcm90b2NvbHM7XG5cblVybC5wcm90b3R5cGUuX3Byb3RvY29sQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICBbMHg2MSAvKidhJyovLCAweDdBIC8qJ3onKi9dLFxuICAgIFsweDQxIC8qJ0EnKi8sIDB4NUEgLyonWicqL10sXG4gICAgMHgyRSAvKicuJyovLCAweDJCIC8qJysnKi8sIDB4MkQgLyonLScqL1xuXSk7XG5cblVybC5wcm90b3R5cGUuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoW1xuICAgIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovLCAweDJGIC8qJy8nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIGF1dG9Fc2NhcGUubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgcmV0dXJuIHYuY2hhckNvZGVBdCgwKTtcbiAgICB9KVxuKTtcblxuLy9JZiB0aGVzZSBjaGFyYWN0ZXJzIGVuZCBhIGhvc3QgbmFtZSwgdGhlIHBhdGggd2lsbCBub3QgYmUgcHJlcGVuZGVkIGEgL1xuVXJsLnByb3RvdHlwZS5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzID0gbWFrZUFzY2lpVGFibGUoXG4gICAgW1xuICAgICAgICBcIjxcIiwgXCI+XCIsIFwiJ1wiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsXG4gICAgICAgIFwiXFxuXCIsIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLFxuICAgICAgICBcIl5cIiwgXCJgXCIsIFwiXFxcIlwiLCBcIiVcIiwgXCI7XCJcbiAgICBdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cblVybC5wcm90b3R5cGUuX2F1dG9Fc2NhcGVNYXAgPSBhdXRvRXNjYXBlTWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVybDtcblxuVXJsLnJlcGxhY2UgPSBmdW5jdGlvbiBVcmwkUmVwbGFjZSgpIHtcbiAgICByZXF1aXJlLmNhY2hlW1widXJsXCJdID0ge1xuICAgICAgICBleHBvcnRzOiBVcmxcbiAgICB9O1xufTtcbiIsInZhciBub3cgPSByZXF1aXJlKCdwZXJmb3JtYW5jZS1ub3cnKVxuICAsIGdsb2JhbCA9IHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8ge30gOiB3aW5kb3dcbiAgLCB2ZW5kb3JzID0gWydtb3onLCAnd2Via2l0J11cbiAgLCBzdWZmaXggPSAnQW5pbWF0aW9uRnJhbWUnXG4gICwgcmFmID0gZ2xvYmFsWydyZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBjYWYgPSBnbG9iYWxbJ2NhbmNlbCcgKyBzdWZmaXhdIHx8IGdsb2JhbFsnY2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgaXNOYXRpdmUgPSB0cnVlXG5cbmZvcih2YXIgaSA9IDA7IGkgPCB2ZW5kb3JzLmxlbmd0aCAmJiAhcmFmOyBpKyspIHtcbiAgcmFmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnUmVxdWVzdCcgKyBzdWZmaXhdXG4gIGNhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbCcgKyBzdWZmaXhdXG4gICAgICB8fCBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cbn1cblxuLy8gU29tZSB2ZXJzaW9ucyBvZiBGRiBoYXZlIHJBRiBidXQgbm90IGNBRlxuaWYoIXJhZiB8fCAhY2FmKSB7XG4gIGlzTmF0aXZlID0gZmFsc2VcblxuICB2YXIgbGFzdCA9IDBcbiAgICAsIGlkID0gMFxuICAgICwgcXVldWUgPSBbXVxuICAgICwgZnJhbWVEdXJhdGlvbiA9IDEwMDAgLyA2MFxuXG4gIHJhZiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgaWYocXVldWUubGVuZ3RoID09PSAwKSB7XG4gICAgICB2YXIgX25vdyA9IG5vdygpXG4gICAgICAgICwgbmV4dCA9IE1hdGgubWF4KDAsIGZyYW1lRHVyYXRpb24gLSAoX25vdyAtIGxhc3QpKVxuICAgICAgbGFzdCA9IG5leHQgKyBfbm93XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY3AgPSBxdWV1ZS5zbGljZSgwKVxuICAgICAgICAvLyBDbGVhciBxdWV1ZSBoZXJlIHRvIHByZXZlbnRcbiAgICAgICAgLy8gY2FsbGJhY2tzIGZyb20gYXBwZW5kaW5nIGxpc3RlbmVyc1xuICAgICAgICAvLyB0byB0aGUgY3VycmVudCBmcmFtZSdzIHF1ZXVlXG4gICAgICAgIHF1ZXVlLmxlbmd0aCA9IDBcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGNwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYoIWNwW2ldLmNhbmNlbGxlZCkge1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICBjcFtpXS5jYWxsYmFjayhsYXN0KVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sIE1hdGgucm91bmQobmV4dCkpXG4gICAgfVxuICAgIHF1ZXVlLnB1c2goe1xuICAgICAgaGFuZGxlOiArK2lkLFxuICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxuICAgICAgY2FuY2VsbGVkOiBmYWxzZVxuICAgIH0pXG4gICAgcmV0dXJuIGlkXG4gIH1cblxuICBjYWYgPSBmdW5jdGlvbihoYW5kbGUpIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmKHF1ZXVlW2ldLmhhbmRsZSA9PT0gaGFuZGxlKSB7XG4gICAgICAgIHF1ZXVlW2ldLmNhbmNlbGxlZCA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihmbikge1xuICAvLyBXcmFwIGluIGEgbmV3IGZ1bmN0aW9uIHRvIHByZXZlbnRcbiAgLy8gYGNhbmNlbGAgcG90ZW50aWFsbHkgYmVpbmcgYXNzaWduZWRcbiAgLy8gdG8gdGhlIG5hdGl2ZSByQUYgZnVuY3Rpb25cbiAgaWYoIWlzTmF0aXZlKSB7XG4gICAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZm4pXG4gIH1cbiAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZnVuY3Rpb24oKSB7XG4gICAgdHJ5e1xuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgIH1cbiAgfSlcbn1cbm1vZHVsZS5leHBvcnRzLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICBjYWYuYXBwbHkoZ2xvYmFsLCBhcmd1bWVudHMpXG59XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuLy8gR2VuZXJhdGVkIGJ5IENvZmZlZVNjcmlwdCAxLjYuM1xuKGZ1bmN0aW9uKCkge1xuICB2YXIgZ2V0TmFub1NlY29uZHMsIGhydGltZSwgbG9hZFRpbWU7XG5cbiAgaWYgKCh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcGVyZm9ybWFuY2UgIT09IG51bGwpICYmIHBlcmZvcm1hbmNlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgfTtcbiAgfSBlbHNlIGlmICgodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2VzcyAhPT0gbnVsbCkgJiYgcHJvY2Vzcy5ocnRpbWUpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIChnZXROYW5vU2Vjb25kcygpIC0gbG9hZFRpbWUpIC8gMWU2O1xuICAgIH07XG4gICAgaHJ0aW1lID0gcHJvY2Vzcy5ocnRpbWU7XG4gICAgZ2V0TmFub1NlY29uZHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBocjtcbiAgICAgIGhyID0gaHJ0aW1lKCk7XG4gICAgICByZXR1cm4gaHJbMF0gKiAxZTkgKyBoclsxXTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gZ2V0TmFub1NlY29uZHMoKTtcbiAgfSBlbHNlIGlmIChEYXRlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gRGF0ZS5ub3coKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxufSkuY2FsbCh0aGlzKTtcblxuLypcbi8vQCBzb3VyY2VNYXBwaW5nVVJMPXBlcmZvcm1hbmNlLW5vdy5tYXBcbiovXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiKSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5yb3V0ZXM9ZSgpfX0oZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbnZhciBsb2NhbFJvdXRlcyA9IFtdO1xuXG5cbi8qKlxuICogQ29udmVydCBwYXRoIHRvIHJvdXRlIG9iamVjdFxuICpcbiAqIEEgc3RyaW5nIG9yIFJlZ0V4cCBzaG91bGQgYmUgcGFzc2VkLFxuICogd2lsbCByZXR1cm4geyByZSwgc3JjLCBrZXlzfSBvYmpcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmcgLyBSZWdFeHB9IHBhdGhcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG52YXIgUm91dGUgPSBmdW5jdGlvbihwYXRoKXtcbiAgLy91c2luZyAnbmV3JyBpcyBvcHRpb25hbFxuXG4gIHZhciBzcmMsIHJlLCBrZXlzID0gW107XG5cbiAgaWYocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCl7XG4gICAgcmUgPSBwYXRoO1xuICAgIHNyYyA9IHBhdGgudG9TdHJpbmcoKTtcbiAgfWVsc2V7XG4gICAgcmUgPSBwYXRoVG9SZWdFeHAocGF0aCwga2V5cyk7XG4gICAgc3JjID0gcGF0aDtcbiAgfVxuXG4gIHJldHVybiB7XG4gIFx0IHJlOiByZSxcbiAgXHQgc3JjOiBwYXRoLnRvU3RyaW5nKCksXG4gIFx0IGtleXM6IGtleXNcbiAgfVxufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLFxuICogcmV0dXJuaW5nIGEgcmVndWxhciBleHByZXNzaW9uLlxuICpcbiAqIEFuIGVtcHR5IGFycmF5IHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aGljaCB3aWxsIGNvbnRhaW4gdGhlIHBsYWNlaG9sZGVyXG4gKiBrZXkgbmFtZXMuIEZvciBleGFtcGxlIFwiL3VzZXIvOmlkXCIgd2lsbFxuICogdGhlbiBjb250YWluIFtcImlkXCJdLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9IGtleXNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xudmFyIHBhdGhUb1JlZ0V4cCA9IGZ1bmN0aW9uIChwYXRoLCBrZXlzKSB7XG5cdHBhdGggPSBwYXRoXG5cdFx0LmNvbmNhdCgnLz8nKVxuXHRcdC5yZXBsYWNlKC9cXC9cXCgvZywgJyg/Oi8nKVxuXHRcdC5yZXBsYWNlKC8oXFwvKT8oXFwuKT86KFxcdyspKD86KFxcKC4qP1xcKSkpPyhcXD8pP3xcXCovZywgZnVuY3Rpb24oXywgc2xhc2gsIGZvcm1hdCwga2V5LCBjYXB0dXJlLCBvcHRpb25hbCl7XG5cdFx0XHRpZiAoXyA9PT0gXCIqXCIpe1xuXHRcdFx0XHRrZXlzLnB1c2godW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIF87XG5cdFx0XHR9XG5cblx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0c2xhc2ggPSBzbGFzaCB8fCAnJztcblx0XHRcdHJldHVybiAnJ1xuXHRcdFx0XHQrIChvcHRpb25hbCA/ICcnIDogc2xhc2gpXG5cdFx0XHRcdCsgJyg/Oidcblx0XHRcdFx0KyAob3B0aW9uYWwgPyBzbGFzaCA6ICcnKVxuXHRcdFx0XHQrIChmb3JtYXQgfHwgJycpICsgKGNhcHR1cmUgfHwgJyhbXi9dKz8pJykgKyAnKSdcblx0XHRcdFx0KyAob3B0aW9uYWwgfHwgJycpO1xuXHRcdH0pXG5cdFx0LnJlcGxhY2UoLyhbXFwvLl0pL2csICdcXFxcJDEnKVxuXHRcdC5yZXBsYWNlKC9cXCovZywgJyguKiknKTtcblx0cmV0dXJuIG5ldyBSZWdFeHAoJ14nICsgcGF0aCArICckJywgJ2knKTtcbn07XG5cbi8qKlxuICogQXR0ZW1wdCB0byBtYXRjaCB0aGUgZ2l2ZW4gcmVxdWVzdCB0b1xuICogb25lIG9mIHRoZSByb3V0ZXMuIFdoZW4gc3VjY2Vzc2Z1bFxuICogYSAge2ZuLCBwYXJhbXMsIHNwbGF0c30gb2JqIGlzIHJldHVybmVkXG4gKlxuICogQHBhcmFtICB7QXJyYXl9IHJvdXRlc1xuICogQHBhcmFtICB7U3RyaW5nfSB1cmlcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xudmFyIG1hdGNoID0gZnVuY3Rpb24gKHJvdXRlcywgdXJpLCBzdGFydEF0KSB7XG5cdHZhciBjYXB0dXJlcywgaSA9IHN0YXJ0QXQgfHwgMDtcblxuXHRmb3IgKHZhciBsZW4gPSByb3V0ZXMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcblx0XHR2YXIgcm91dGUgPSByb3V0ZXNbaV0sXG5cdFx0ICAgIHJlID0gcm91dGUucmUsXG5cdFx0ICAgIGtleXMgPSByb3V0ZS5rZXlzLFxuXHRcdCAgICBzcGxhdHMgPSBbXSxcblx0XHQgICAgcGFyYW1zID0ge307XG5cblx0XHRpZiAoY2FwdHVyZXMgPSB1cmkubWF0Y2gocmUpKSB7XG5cdFx0XHRmb3IgKHZhciBqID0gMSwgbGVuID0gY2FwdHVyZXMubGVuZ3RoOyBqIDwgbGVuOyArK2opIHtcblx0XHRcdFx0dmFyIGtleSA9IGtleXNbai0xXSxcblx0XHRcdFx0XHR2YWwgPSB0eXBlb2YgY2FwdHVyZXNbal0gPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHVuZXNjYXBlKGNhcHR1cmVzW2pdKVxuXHRcdFx0XHRcdFx0OiBjYXB0dXJlc1tqXTtcblx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdHBhcmFtc1trZXldID0gdmFsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNwbGF0cy5wdXNoKHZhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBhcmFtczogcGFyYW1zLFxuXHRcdFx0XHRzcGxhdHM6IHNwbGF0cyxcblx0XHRcdFx0cm91dGU6IHJvdXRlLnNyYyxcblx0XHRcdFx0bmV4dDogaSArIDFcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIERlZmF1bHQgXCJub3JtYWxcIiByb3V0ZXIgY29uc3RydWN0b3IuXG4gKiBhY2NlcHRzIHBhdGgsIGZuIHR1cGxlcyB2aWEgYWRkUm91dGVcbiAqIHJldHVybnMge2ZuLCBwYXJhbXMsIHNwbGF0cywgcm91dGV9XG4gKiAgdmlhIG1hdGNoXG4gKlxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZXIgPSBmdW5jdGlvbigpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG4gIHJldHVybiB7XG4gICAgcm91dGVzOiBbXSxcbiAgICByb3V0ZU1hcCA6IHt9LFxuICAgIGFkZFJvdXRlOiBmdW5jdGlvbihwYXRoLCBmbil7XG4gICAgICBpZiAoIXBhdGgpIHRocm93IG5ldyBFcnJvcignIHJvdXRlIHJlcXVpcmVzIGEgcGF0aCcpO1xuICAgICAgaWYgKCFmbikgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgJyArIHBhdGgudG9TdHJpbmcoKSArICcgcmVxdWlyZXMgYSBjYWxsYmFjaycpO1xuXG4gICAgICB2YXIgcm91dGUgPSBSb3V0ZShwYXRoKTtcbiAgICAgIHJvdXRlLmZuID0gZm47XG5cbiAgICAgIHRoaXMucm91dGVzLnB1c2gocm91dGUpO1xuICAgICAgdGhpcy5yb3V0ZU1hcFtwYXRoXSA9IGZuO1xuICAgIH0sXG5cbiAgICBtYXRjaDogZnVuY3Rpb24ocGF0aG5hbWUsIHN0YXJ0QXQpe1xuICAgICAgdmFyIHJvdXRlID0gbWF0Y2godGhpcy5yb3V0ZXMsIHBhdGhuYW1lLCBzdGFydEF0KTtcbiAgICAgIGlmKHJvdXRlKXtcbiAgICAgICAgcm91dGUuZm4gPSB0aGlzLnJvdXRlTWFwW3JvdXRlLnJvdXRlXTtcbiAgICAgICAgcm91dGUubmV4dCA9IHRoaXMubWF0Y2guYmluZCh0aGlzLCBwYXRobmFtZSwgcm91dGUubmV4dClcbiAgICAgIH1cbiAgICAgIHJldHVybiByb3V0ZTtcbiAgICB9XG4gIH1cbn07XG5cblJvdXRlci5Sb3V0ZSA9IFJvdXRlXG5Sb3V0ZXIucGF0aFRvUmVnRXhwID0gcGF0aFRvUmVnRXhwXG5Sb3V0ZXIubWF0Y2ggPSBtYXRjaFxuLy8gYmFjayBjb21wYXRcblJvdXRlci5Sb3V0ZXIgPSBSb3V0ZXJcblxubW9kdWxlLmV4cG9ydHMgPSBSb3V0ZXJcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciB3aW5kb3cgPSByZXF1aXJlKFwiZ2xvYmFsL3dpbmRvd1wiKVxudmFyIG9uY2UgPSByZXF1aXJlKFwib25jZVwiKVxudmFyIHBhcnNlSGVhZGVycyA9IHJlcXVpcmUoJ3BhcnNlLWhlYWRlcnMnKVxuXG52YXIgbWVzc2FnZXMgPSB7XG4gICAgXCIwXCI6IFwiSW50ZXJuYWwgWE1MSHR0cFJlcXVlc3QgRXJyb3JcIixcbiAgICBcIjRcIjogXCI0eHggQ2xpZW50IEVycm9yXCIsXG4gICAgXCI1XCI6IFwiNXh4IFNlcnZlciBFcnJvclwiXG59XG5cbnZhciBYSFIgPSB3aW5kb3cuWE1MSHR0cFJlcXVlc3QgfHwgbm9vcFxudmFyIFhEUiA9IFwid2l0aENyZWRlbnRpYWxzXCIgaW4gKG5ldyBYSFIoKSkgPyBYSFIgOiB3aW5kb3cuWERvbWFpblJlcXVlc3RcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVYSFJcblxuZnVuY3Rpb24gY3JlYXRlWEhSKG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7IHVyaTogb3B0aW9ucyB9XG4gICAgfVxuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICBjYWxsYmFjayA9IG9uY2UoY2FsbGJhY2spXG5cbiAgICB2YXIgeGhyID0gb3B0aW9ucy54aHIgfHwgbnVsbFxuXG4gICAgaWYgKCF4aHIpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuY29ycyB8fCBvcHRpb25zLnVzZVhEUikge1xuICAgICAgICAgICAgeGhyID0gbmV3IFhEUigpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgeGhyID0gbmV3IFhIUigpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdXJpID0geGhyLnVybCA9IG9wdGlvbnMudXJpIHx8IG9wdGlvbnMudXJsXG4gICAgdmFyIG1ldGhvZCA9IHhoci5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCBcIkdFVFwiXG4gICAgdmFyIGJvZHkgPSBvcHRpb25zLmJvZHkgfHwgb3B0aW9ucy5kYXRhXG4gICAgdmFyIGhlYWRlcnMgPSB4aHIuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fVxuICAgIHZhciBzeW5jID0gISFvcHRpb25zLnN5bmNcbiAgICB2YXIgaXNKc29uID0gZmFsc2VcbiAgICB2YXIga2V5XG4gICAgdmFyIGxvYWQgPSBvcHRpb25zLnJlc3BvbnNlID8gbG9hZFJlc3BvbnNlIDogbG9hZFhoclxuXG4gICAgaWYgKFwianNvblwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaXNKc29uID0gdHJ1ZVxuICAgICAgICBoZWFkZXJzW1wiQWNjZXB0XCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgaWYgKG1ldGhvZCAhPT0gXCJHRVRcIiAmJiBtZXRob2QgIT09IFwiSEVBRFwiKSB7XG4gICAgICAgICAgICBoZWFkZXJzW1wiQ29udGVudC1UeXBlXCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgICAgIGJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gcmVhZHlzdGF0ZWNoYW5nZVxuICAgIHhoci5vbmxvYWQgPSBsb2FkXG4gICAgeGhyLm9uZXJyb3IgPSBlcnJvclxuICAgIC8vIElFOSBtdXN0IGhhdmUgb25wcm9ncmVzcyBiZSBzZXQgdG8gYSB1bmlxdWUgZnVuY3Rpb24uXG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElFIG11c3QgZGllXG4gICAgfVxuICAgIC8vIGhhdGUgSUVcbiAgICB4aHIub250aW1lb3V0ID0gbm9vcFxuICAgIHhoci5vcGVuKG1ldGhvZCwgdXJpLCAhc3luYylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIGlmIChvcHRpb25zLndpdGhDcmVkZW50aWFscyB8fCAob3B0aW9ucy5jb3JzICYmIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzICE9PSBmYWxzZSkpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG5cbiAgICAvLyBDYW5ub3Qgc2V0IHRpbWVvdXQgd2l0aCBzeW5jIHJlcXVlc3RcbiAgICBpZiAoIXN5bmMpIHtcbiAgICAgICAgeGhyLnRpbWVvdXQgPSBcInRpbWVvdXRcIiBpbiBvcHRpb25zID8gb3B0aW9ucy50aW1lb3V0IDogNTAwMFxuICAgIH1cblxuICAgIGlmICh4aHIuc2V0UmVxdWVzdEhlYWRlcikge1xuICAgICAgICBmb3Ioa2V5IGluIGhlYWRlcnMpe1xuICAgICAgICAgICAgaWYoaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkhlYWRlcnMgY2Fubm90IGJlIHNldCBvbiBhbiBYRG9tYWluUmVxdWVzdCBvYmplY3RcIilcbiAgICB9XG5cbiAgICBpZiAoXCJyZXNwb25zZVR5cGVcIiBpbiBvcHRpb25zKSB7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSBvcHRpb25zLnJlc3BvbnNlVHlwZVxuICAgIH1cbiAgICBcbiAgICBpZiAoXCJiZWZvcmVTZW5kXCIgaW4gb3B0aW9ucyAmJiBcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuYmVmb3JlU2VuZCA9PT0gXCJmdW5jdGlvblwiXG4gICAgKSB7XG4gICAgICAgIG9wdGlvbnMuYmVmb3JlU2VuZCh4aHIpXG4gICAgfVxuXG4gICAgeGhyLnNlbmQoYm9keSlcblxuICAgIHJldHVybiB4aHJcblxuICAgIGZ1bmN0aW9uIHJlYWR5c3RhdGVjaGFuZ2UoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgbG9hZCgpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRCb2R5KCkge1xuICAgICAgICAvLyBDaHJvbWUgd2l0aCByZXF1ZXN0VHlwZT1ibG9iIHRocm93cyBlcnJvcnMgYXJyb3VuZCB3aGVuIGV2ZW4gdGVzdGluZyBhY2Nlc3MgdG8gcmVzcG9uc2VUZXh0XG4gICAgICAgIHZhciBib2R5ID0gbnVsbFxuXG4gICAgICAgIGlmICh4aHIucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIGlmICh4aHIucmVzcG9uc2VUeXBlID09PSAndGV4dCcgfHwgIXhoci5yZXNwb25zZVR5cGUpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VUZXh0IHx8IHhoci5yZXNwb25zZVhNTFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzSnNvbikge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBib2R5ID0gSlNPTi5wYXJzZShib2R5KVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBib2R5XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U3RhdHVzQ29kZSgpIHtcbiAgICAgICAgcmV0dXJuIHhoci5zdGF0dXMgPT09IDEyMjMgPyAyMDQgOiB4aHIuc3RhdHVzXG4gICAgfVxuXG4gICAgLy8gaWYgd2UncmUgZ2V0dGluZyBhIG5vbmUtb2sgc3RhdHVzQ29kZSwgYnVpbGQgJiByZXR1cm4gYW4gZXJyb3JcbiAgICBmdW5jdGlvbiBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cykge1xuICAgICAgICB2YXIgZXJyb3IgPSBudWxsXG4gICAgICAgIGlmIChzdGF0dXMgPT09IDAgfHwgKHN0YXR1cyA+PSA0MDAgJiYgc3RhdHVzIDwgNjAwKSkge1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSAodHlwZW9mIGJvZHkgPT09IFwic3RyaW5nXCIgPyBib2R5IDogZmFsc2UpIHx8XG4gICAgICAgICAgICAgICAgbWVzc2FnZXNbU3RyaW5nKHN0YXR1cykuY2hhckF0KDApXVxuICAgICAgICAgICAgZXJyb3IgPSBuZXcgRXJyb3IobWVzc2FnZSlcbiAgICAgICAgICAgIGVycm9yLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlcnJvclxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSAmIHByb2Nlc3MgdGhlIHJlc3BvbnNlIGluIGEgc3BlY2lhbCByZXNwb25zZSBvYmplY3RcbiAgICBmdW5jdGlvbiBsb2FkUmVzcG9uc2UoKSB7XG4gICAgICAgIHZhciBzdGF0dXMgPSBnZXRTdGF0dXNDb2RlKClcbiAgICAgICAgdmFyIGVycm9yID0gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpXG4gICAgICAgIHZhciByZXNwb25zZSA9IHtcbiAgICAgICAgICAgIGJvZHk6IGdldEJvZHkoKSxcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IHN0YXR1cyxcbiAgICAgICAgICAgIHN0YXR1c1RleHQ6IHhoci5zdGF0dXNUZXh0LFxuICAgICAgICAgICAgcmF3OiB4aHJcbiAgICAgICAgfVxuICAgICAgICBpZih4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKXsgLy9yZW1lbWJlciB4aHIgY2FuIGluIGZhY3QgYmUgWERSIGZvciBDT1JTIGluIElFXG4gICAgICAgICAgICByZXNwb25zZS5oZWFkZXJzID0gcGFyc2VIZWFkZXJzKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIHJlc3BvbnNlLCByZXNwb25zZS5ib2R5KVxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSBhbmQgYWRkIHNvbWUgcmVzcG9uc2UgcHJvcGVydGllcyB0byB0aGUgc291cmNlIHhoclxuICAgIC8vIGFuZCB0aGVuIHJlc3BvbmQgd2l0aCB0aGF0XG4gICAgZnVuY3Rpb24gbG9hZFhocigpIHtcbiAgICAgICAgdmFyIHN0YXR1cyA9IGdldFN0YXR1c0NvZGUoKVxuICAgICAgICB2YXIgZXJyb3IgPSBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cylcblxuICAgICAgICB4aHIuc3RhdHVzID0geGhyLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgeGhyLmJvZHkgPSBnZXRCb2R5KClcbiAgICAgICAgeGhyLmhlYWRlcnMgPSBwYXJzZUhlYWRlcnMoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKVxuXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCB4aHIsIHhoci5ib2R5KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKGV2dCkge1xuICAgICAgICBjYWxsYmFjayhldnQsIHhocilcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHNlbGY7XG59IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0ge307XG59XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwibW9kdWxlLmV4cG9ydHMgPSBvbmNlXG5cbm9uY2UucHJvdG8gPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bmN0aW9uLnByb3RvdHlwZSwgJ29uY2UnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBvbmNlKHRoaXMpXG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWVcbiAgfSlcbn0pXG5cbmZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gIHZhciBjYWxsZWQgPSBmYWxzZVxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGlmIChjYWxsZWQpIHJldHVyblxuICAgIGNhbGxlZCA9IHRydWVcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICB9XG59XG4iLCJ2YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2lzLWZ1bmN0aW9uJylcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHlcblxuZnVuY3Rpb24gZm9yRWFjaChsaXN0LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXNGdW5jdGlvbihpdGVyYXRvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignaXRlcmF0b3IgbXVzdCBiZSBhIGZ1bmN0aW9uJylcbiAgICB9XG5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgY29udGV4dCA9IHRoaXNcbiAgICB9XG4gICAgXG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobGlzdCkgPT09ICdbb2JqZWN0IEFycmF5XScpXG4gICAgICAgIGZvckVhY2hBcnJheShsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlIGlmICh0eXBlb2YgbGlzdCA9PT0gJ3N0cmluZycpXG4gICAgICAgIGZvckVhY2hTdHJpbmcobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG4gICAgZWxzZVxuICAgICAgICBmb3JFYWNoT2JqZWN0KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoQXJyYXkoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5LCBpKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVtpXSwgaSwgYXJyYXkpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2hTdHJpbmcoc3RyaW5nLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgLy8gbm8gc3VjaCB0aGluZyBhcyBhIHNwYXJzZSBzdHJpbmcuXG4gICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgc3RyaW5nLmNoYXJBdChpKSwgaSwgc3RyaW5nKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaE9iamVjdChvYmplY3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgayBpbiBvYmplY3QpIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmplY3Rba10sIGssIG9iamVjdClcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gaXNGdW5jdGlvblxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24gKGZuKSB7XG4gIHZhciBzdHJpbmcgPSB0b1N0cmluZy5jYWxsKGZuKVxuICByZXR1cm4gc3RyaW5nID09PSAnW29iamVjdCBGdW5jdGlvbl0nIHx8XG4gICAgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJyAmJiBzdHJpbmcgIT09ICdbb2JqZWN0IFJlZ0V4cF0nKSB8fFxuICAgICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAvLyBJRTggYW5kIGJlbG93XG4gICAgIChmbiA9PT0gd2luZG93LnNldFRpbWVvdXQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuYWxlcnQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuY29uZmlybSB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5wcm9tcHQpKVxufTtcbiIsIlxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gdHJpbTtcblxuZnVuY3Rpb24gdHJpbShzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqfFxccyokL2csICcnKTtcbn1cblxuZXhwb3J0cy5sZWZ0ID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzKi8sICcnKTtcbn07XG5cbmV4cG9ydHMucmlnaHQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccyokLywgJycpO1xufTtcbiIsInZhciB0cmltID0gcmVxdWlyZSgndHJpbScpXG4gICwgZm9yRWFjaCA9IHJlcXVpcmUoJ2Zvci1lYWNoJylcbiAgLCBpc0FycmF5ID0gZnVuY3Rpb24oYXJnKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFyZykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChoZWFkZXJzKSB7XG4gIGlmICghaGVhZGVycylcbiAgICByZXR1cm4ge31cblxuICB2YXIgcmVzdWx0ID0ge31cblxuICBmb3JFYWNoKFxuICAgICAgdHJpbShoZWFkZXJzKS5zcGxpdCgnXFxuJylcbiAgICAsIGZ1bmN0aW9uIChyb3cpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gcm93LmluZGV4T2YoJzonKVxuICAgICAgICAgICwga2V5ID0gdHJpbShyb3cuc2xpY2UoMCwgaW5kZXgpKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgLCB2YWx1ZSA9IHRyaW0ocm93LnNsaWNlKGluZGV4ICsgMSkpXG5cbiAgICAgICAgaWYgKHR5cGVvZihyZXN1bHRba2V5XSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSB2YWx1ZVxuICAgICAgICB9IGVsc2UgaWYgKGlzQXJyYXkocmVzdWx0W2tleV0pKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IFsgcmVzdWx0W2tleV0sIHZhbHVlIF1cbiAgICAgICAgfVxuICAgICAgfVxuICApXG5cbiAgcmV0dXJuIHJlc3VsdFxufSJdfQ==
