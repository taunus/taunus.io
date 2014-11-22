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
buf.push("<h1 id=\"why-not-other-frameworks-\">Why Not Other Frameworks?</h1>\n<p>Many other frameworks weren&#39;t designed with progressive enhancement, or even shared-rendering in mind. Content isn&#39;t prioritized, and humans are expected to <a href=\"http://ponyfoo.com/articles/stop-breaking-the-web\">download most of a web page before they can see any digestible content</a>. While Google is going to resolve the SEO issues with dedicated client-side rendering soon, that won&#39;t solve all your problems. Google isn&#39;t the only web crawler operator out there, and it might be a while before social media link crawlers catch up with them. Even if crawlers are not an issue, being able to provide the fastest possible experience is a big problem to resolve.</p>\n<p>Lately, many mature open-source frameworks started dropping support for older browsers. This is necessary because of the way they&#39;re architected, where the developer is put first. <strong>Taunus is <a href=\"https://twitter.com/hashtag/humanfirst\">#humanfirst</a></strong>, meaning that it concedes that humans are more important than the developers building their applications.</p>\n<p>Progressively enhanced applications are always going to have great browser support because of the way they&#39;re architected. As the name implies, a baseline is established where we deliver the core experience to the user <em>(typically in the form of readable HTML content)</em>, and then enhance it <strong>if possible</strong> using CSS and JavaScript. Building applications in this way means that <strong>you&#39;ll be able to reach the most people with your core experience</strong>, and you&#39;ll also be able to provide humans in more modern browsers with all of the latest features and technologies.</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.unshift({ lineno: 5, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 6, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"features\">Features</h1>\n<p>Out of the box, Taunus ensures that your site works on any HTML-enabled document viewer, or even on the terminal, providing support for plain text responses <a href=\"/getting-started\">without any configuration needed</a>. Even while Taunus provides shared-rendering capabilities, it offers code reuse of views and routes, meaning you&#39;ll only have to declare these once but they&#39;ll be used in both the server-side and the client-side.</p>\n<p>Taunus features a reasonably enhanced experience, where if features aren&#39;t available on a browser, they&#39;re just not provided. For example, the client-side router makes use of the <code>history</code> API but if that&#39;s not available then it&#39;ll fall back to simply not meddling with links instead of using a client-side-only hash router.</p>\n<p>Taunus can deal with view caching on your behalf, if you so desire, using <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">asynchronous embedded database stores</a> on the client-side. Turns out, there&#39;s <a href=\"http://caniuse.com/#search=indexeddb\">pretty good browser support for IndexedDB</a>. Of course, IndexedDB will only be used if it&#39;s available, and if it&#39;s not then view models won&#39;t be cached in the client-side besides an in-memory store. <strong>The site won&#39;t simply roll over and die, though.</strong></p>\n<p>If you&#39;ve turned client-side caching on, then you can also turn on the <strong>view pre-fetching feature</strong>, which will start downloading views as soon as humans hover on links, as to deliver a <em>faster perceived human experience</em>.</p>\n<p>Taunus provides the bare bones for your application so that you can separate concerns into routes, controllers, models, and views. Then it gets out of the way, by design. There are <a href=\"/complements\">a few complementary modules</a> you can use to enhance your development experience, as well.</p>\n<p>With Taunus you&#39;ll be in charge. <a href=\"/getting-started\">Are you ready to get started?</a></p>\n");
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
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Why Taunus?\n\n    Taunus focuses on delivering a progressively enhanced experience to the end-user, while providing _a reasonable development experience_ as well. **Taunus prioritizes content**. It uses server-side rendering to get content to your humans as fast as possible, and it uses client-side rendering to improve their experience.\n\n    While it focuses on progressive enhancement, **[usability][2] and performance are both core concerns** for Taunus. Incidentally, focusing on progressive enhancement also improves both of these. Usability is improved because the experience is gradually improved, meaning that if somewhere along the line a feature is missing, the component is **still expected to work**.\n\n    For example, a progressively enhanced site uses plain-old links to navigate from one view to another, and then adds a `click` event handler that blocks navigation and issues an AJAX request instead. If JavaScript fails to load, perhaps the experience might stay a little bit worse, but that's okay, because we acknowledge that **our sites don't need to look and behave the same on every browser**. Similarly, [performance is greatly enhanced][1] by delivering content to the human as fast as possible, and then adding functionality on top of that.\n\n    With progressive enhancement, if the functionality never gets there because a JavaScript resource failed to load because the network failed _(not uncommon in the mobile era)_ or because the user blocked JavaScript, your application will still work!\n\n    [1]: http://ponyfoo.com/articles/critical-path-performance-optimization\n    [2]: http://ponyfoo.com/articles/adjusting-ux-for-humans\n\nsection.ly-section.md-markdown\n  :markdown\n    # Why Not Other Frameworks?\n\n    Many other frameworks weren't designed with progressive enhancement, or even shared-rendering in mind. Content isn't prioritized, and humans are expected to [download most of a web page before they can see any digestible content][2]. While Google is going to resolve the SEO issues with dedicated client-side rendering soon, that won't solve all your problems. Google isn't the only web crawler operator out there, and it might be a while before social media link crawlers catch up with them. Even if crawlers are not an issue, being able to provide the fastest possible experience is a big problem to resolve.\n\n    Lately, many mature open-source frameworks started dropping support for older browsers. This is necessary because of the way they're architected, where the developer is put first. **Taunus is [#humanfirst][1]**, meaning that it concedes that humans are more important than the developers building their applications.\n\n    Progressively enhanced applications are always going to have great browser support because of the way they're architected. As the name implies, a baseline is established where we deliver the core experience to the user _(typically in the form of readable HTML content)_, and then enhance it **if possible** using CSS and JavaScript. Building applications in this way means that **you'll be able to reach the most people with your core experience**, and you'll also be able to provide humans in more modern browsers with all of the latest features and technologies.\n\n    [1]: https://twitter.com/hashtag/humanfirst\n    [2]: http://ponyfoo.com/articles/stop-breaking-the-web\n\nsection.ly-section.md-markdown\n  :markdown\n    # Features\n\n    Out of the box, Taunus ensures that your site works on any HTML-enabled document viewer, or even on the terminal, providing support for plain text responses [without any configuration needed][2]. Even while Taunus provides shared-rendering capabilities, it offers code reuse of views and routes, meaning you'll only have to declare these once but they'll be used in both the server-side and the client-side.\n\n    Taunus features a reasonably enhanced experience, where if features aren't available on a browser, they're just not provided. For example, the client-side router makes use of the `history` API but if that's not available then it'll fall back to simply not meddling with links instead of using a client-side-only hash router.\n\n    Taunus can deal with view caching on your behalf, if you so desire, using [asynchronous embedded database stores][3] on the client-side. Turns out, there's [pretty good browser support for IndexedDB][4]. Of course, IndexedDB will only be used if it's available, and if it's not then view models won't be cached in the client-side besides an in-memory store. **The site won't simply roll over and die, though.**\n\n    If you've turned client-side caching on, then you can also turn on the **view pre-fetching feature**, which will start downloading views as soon as humans hover on links, as to deliver a _faster perceived human experience_.\n\n    Taunus provides the bare bones for your application so that you can separate concerns into routes, controllers, models, and views. Then it gets out of the way, by design. There are [a few complementary modules][1] you can use to enhance your development experience, as well.\n\n    With Taunus you'll be in charge. [Are you ready to get started?][2]\n\n    [1]: /complements\n    [2]: /getting-started\n    [3]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [4]: http://caniuse.com/#search=indexeddb\n\nsection.ly-section.md-markdown\n  :markdown\n    # Familiarity\n\n    You can use Taunus to develop applications using your favorite Node.js HTTP server, **both [Express][3] and [Hapi][4] are fully supported**. In both cases, you'll [build controllers the way you're already used to][1], except you won't have to `require` the view controllers or define any view routes since Taunus will deal with that on your behalf. In the controllers you'll be able to do everything you're already able to do, and then you'll have to return a JSON model which will be used to render a view.\n\n    You can use any view-rendering engine that you want, provided that it can be compiled into JavaScript functions. That's because Taunus treats views as mere JavaScript functions, rather than being tied into a specific view-rendering engine.\n\n    Client-side controllers are just functions, too. You can bring your own selector engine, your own AJAX libraries, and your own data-binding solutions. It might mean there's a bit more work involved for you, but you'll also be free to pick whatever libraries you're most comfortable with! That being said, Taunus [does recommend a few libraries][2] that work well with it.\n\n    [1]: /getting-started\n    [2]: /complements\n    [3]: http://expressjs.com\n    [4]: http://hapijs.com\n");
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
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n<p>Taunus exposes <em>three different public APIs</em>, and there&#39;s also <strong>plugins to integrate Taunus and an HTTP server</strong>. This document covers all three APIs extensively. If you&#39;re concerned about the inner workings of Taunus, please refer to the <a href=\"/getting-started\">Getting Started</a> guide. This document aims to only cover how the public interface affects application state, but <strong>doesn&#39;t delve into implementation details</strong>.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li>A <a href=\"#server-side-api\">server-side API</a> that deals with server-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Its <a href=\"#the-options-object\"><code>options</code></a> argument<ul>\n<li><a href=\"#-options-layout-\"><code>layout</code></a></li>\n<li><a href=\"#-options-routes-\"><code>routes</code></a></li>\n<li><a href=\"#-options-getdefaultviewmodel-\"><code>getDefaultViewModel</code></a></li>\n<li><a href=\"#-options-plaintext-\"><code>plaintext</code></a></li>\n<li><a href=\"#-options-resolvers-\"><code>resolvers</code></a></li>\n<li><a href=\"#-options-version-\"><code>version</code></a></li>\n<li><a href=\"#-options-deferminified-\"><code>deferMinified</code></a></li>\n</ul>\n</li>\n<li>Its <a href=\"#-addroute-definition-\"><code>addRoute</code></a> argument</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render</code></a> method</li>\n<li>The <a href=\"#-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel</code></a> method</li>\n</ul>\n</li>\n<li><a href=\"#server-side-controllers\">Server-side controllers</a></li>\n<li>A <a href=\"#http-framework-plugins\">suite of plugins</a> can integrate Taunus and an HTTP server<ul>\n<li>Using <a href=\"#using-taunus-express-\"><code>taunus-express</code></a> for <a href=\"http://expressjs.com\">Express</a></li>\n<li>Using <a href=\"#using-taunus-hapi-\"><code>taunus-hapi</code></a> for <a href=\"http://hapijs.com\">Hapi</a></li>\n</ul>\n</li>\n<li>A <a href=\"#command-line-interface\">CLI that produces a wiring module</a> for the client-side<ul>\n<li>The <a href=\"#-output-\"><code>--output</code></a> flag</li>\n<li>The <a href=\"#-watch-\"><code>--watch</code></a> flag</li>\n<li>The <a href=\"#-transform-module-\"><code>--transform &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-defer-actions-\"><code>--defer</code></a> flag</li>\n<li>The <a href=\"#-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-bundle-\"><code>--bundle</code></a> flag</li>\n</ul>\n</li>\n<li>A <a href=\"#client-side-api\">client-side API</a> that deals with client-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Using the <a href=\"#using-the-auto-strategy\"><code>auto</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-inline-strategy\"><code>inline</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-manual-strategy\"><code>manual</code></a> strategy</li>\n<li><a href=\"#caching\">Caching</a></li>\n<li><a href=\"#prefetching\">Prefetching</a></li>\n<li><a href=\"#versioning\">Versioning</a></li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a> method</li>\n<li>The <a href=\"#-taunus-once-type-fn-\"><code>taunus.once</code></a> method</li>\n<li>The <a href=\"#-taunus-off-type-fn-\"><code>taunus.off</code></a> method</li>\n<li>The <a href=\"#-taunus-intercept-action-fn-\"><code>taunus.intercept</code></a> method</li>\n<li>The <a href=\"#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a> method</li>\n<li>The <a href=\"#-taunus-navigate-url-options-\"><code>taunus.navigate</code></a> method</li>\n<li>The <a href=\"#-taunus-route-url-\"><code>taunus.route</code></a> method<ul>\n<li>The <a href=\"#-taunus-route-equals-route-route-\"><code>taunus.route.equals</code></a> method</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-state-\"><code>taunus.state</code></a> property</li>\n<li>The <a href=\"#-taunus-xhr-url-options-done-\"><code>taunus.xhr</code></a> method</li>\n<li><a href=\"#debugging-taunus\">Debugging Taunus</a></li>\n</ul>\n</li>\n<li><a href=\"#client-side-controllers\">Client-side controllers</a></li>\n<li>The <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a> manifest</li>\n</ul>\n<h1 id=\"server-side-api\">Server-side API</h1>\n<p>The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, <em>including client-side rendering</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-addroute-options-\"><code>taunus.mount(addRoute, options?)</code></h2>\n<p>Mounts Taunus on top of a server-side router, by registering each route in <code>options.routes</code> with the <code>addRoute</code> method.</p>\n<blockquote>\n<p>Note that most of the time, <strong>this method shouldn&#39;t be invoked directly</strong>, but rather through one of the <a href=\"#http-framework-plugins\">HTTP framework plugins</a> presented below.</p>\n</blockquote>\n<p>Here&#39;s an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the <code>route</code> and <code>action</code> properties.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\ntaunus.mount(addRoute, {\n  routes: [{ route: &#39;/&#39;, action: &#39;home/index&#39; }]\n});\n\nfunction addRoute (definition) {\n  app.get(definition.route, definition.action);\n}\n</code></pre>\n<p>Let&#39;s go over the options you can pass to <code>taunus.mount</code> first.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"the-options-object\">The <code>options?</code> object</h4>\n<p>There&#39;s a few options that can be passed to the server-side mountpoint. You&#39;re probably going to be passing these to your <a href=\"#http-framework-plugins\">HTTP framework plugin</a>, rather than using <code>taunus.mount</code> directly.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-layout-\"><code>options.layout?</code></h6>\n<p>The <code>layout</code> property is expected to have the <code>function(data)</code> signature. It&#39;ll be invoked whenever a full HTML document needs to be rendered, and a <code>data</code> object will be passed to it. That object will contain everything you&#39;ve set as the view model, plus a <code>partial</code> property containing the raw HTML of the rendered partial view. Your <code>layout</code> method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out <a href=\"https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\">the <code>layout.jade</code> used in Pony Foo</a> as an example.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-routes-\"><code>options.routes</code></h6>\n<p>The other big option is <code>routes</code>, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.</p>\n<p>Here&#39;s an example route that uses the <a href=\"http://expressjs.com\">Express</a> routing scheme.</p>\n<pre><code class=\"lang-js\">{\n  route: &#39;/articles/:slug&#39;,\n  action: &#39;articles/article&#39;,\n  ignore: false,\n  cache: &lt;inherit&gt;\n}\n</code></pre>\n<ul>\n<li><code>route</code> is a route in the format your HTTP framework of choice understands</li>\n<li><code>action</code> is the name of your controller action. It&#39;ll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller</li>\n<li><code>cache</code> can be used to determine the client-side caching behavior in this application path, and it&#39;ll default to inheriting from the options passed to <code>taunus.mount</code> <em>on the client-side</em></li>\n<li><code>ignore</code> is used in those cases where you want a URL to be ignored by the client-side router even if there&#39;s a catch-all route that would match that URL</li>\n</ul>\n<p>As an example of the <code>ignore</code> use case, consider the routing table shown below. The client-side router doesn&#39;t know <em>(and can&#39;t know unless you point it out)</em> what routes are server-side only, and it&#39;s up to you to point those out.</p>\n<pre><code class=\"lang-js\">[\n  { route: &#39;/&#39;, action: &#39;/home/index&#39; },\n  { route: &#39;/feed&#39;, ignore: true },\n  { route: &#39;/*&#39;, action: &#39;error/not-found&#39; }\n]\n</code></pre>\n<p>This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The <code>ignore</code> property is effectively telling the client-side <em>&quot;don&#39;t hijack links containing this URL&quot;</em>.</p>\n<p>Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don&#39;t need to be <code>ignore</code>d.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getdefaultviewmodel-\"><code>options.getDefaultViewModel?</code></h6>\n<p>The <code>getDefaultViewModel(done)</code> property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you&#39;re done creating a view model, you can invoke <code>done(null, model)</code>. If an error occurs while building the view model, you should call <code>done(err)</code> instead.</p>\n<p>Taunus will throw an error if <code>done</code> is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases <a href=\"#taunus-rebuilddefaultviewmodel\">the defaults can be rebuilt</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-plaintext-\"><code>options.plaintext?</code></h6>\n<p>The <code>plaintext</code> options object is passed directly to <a href=\"https://github.com/bevacqua/hget\">hget</a>, and it&#39;s used to <a href=\"https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\">tweak the plaintext version</a> of your site.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-resolvers-\"><code>options.resolvers?</code></h6>\n<p>Resolvers are used to determine the location of some of the different pieces of your application. Typically you won&#39;t have to touch these in the slightest.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getServerController(action)</code></td>\n<td>Return path to server-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p>The <code>addRoute</code> method passed to <code>taunus.mount</code> on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-version-\"><code>options.version?</code></h6>\n<p>Refer to the <a href=\"#versioning\">Versioning</a> section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getpartial-\"><code>options.getPartial?</code></h6>\n<p>By default, Taunus will render partials on the server-side by looking up the module for an action method, and calling that action passing in a model.</p>\n<p>You can override the default behavior by setting <code>options.getPartial</code> to a function. This method takes three parameters.</p>\n<ul>\n<li><code>action</code> is the action that needs to be rendered</li>\n<li><code>model</code> is the model you can use to render the view for that action</li>\n<li><code>done(err, html)</code> is called when you&#39;re done, passing in the resulting <code>html</code> for the partial</li>\n</ul>\n<p>Note that if you don&#39;t set <code>getPartial</code>, Taunus will just require your controller action method and invoke that instead.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-deferminified-\"><code>options.deferMinified?</code></h6>\n<p>When views and controllers are lazily loaded, they are compiled and bundled using Browserify. Taunus will even produce a source map. To avoid the source map, and minify the bundle instead, set <code>deferMinified</code> to <code>true</code>.</p>\n<p>You&#39;ll probably want to set <code>deferMinified</code> to whether the application is running on the production environment.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-addroute-definition-\"><code>addRoute(definition)</code></h4>\n<p>The <code>addRoute(definition)</code> method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework&#39;s router.</p>\n<ul>\n<li><code>route</code> is the route that you set as <code>definition.route</code></li>\n<li><code>action</code> is the action as passed to the route definition</li>\n<li><code>actionFn</code> will be the controller for this action method</li>\n<li><code>middleware</code> will be an array of methods to be executed before <code>actionFn</code></li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render(action, viewModel, req, res, next)</code></h2>\n<p>This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won&#39;t go very deep into it.</p>\n<p>The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The <code>action</code> property determines the default view that will be rendered. The <code>viewModel</code> will be extended by <a href=\"#-options-getdefaultviewmodel-\">the default view model</a>, and it may also override the default <code>action</code> by setting <code>viewModel.model.action</code>.</p>\n<p>The <code>req</code>, <code>res</code>, and <code>next</code> arguments are expected to be the Express routing arguments, but they can also be mocked <em>(which is in fact what the Hapi plugin does)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel(done?)</code></h2>\n<p>Once Taunus has been mounted, calling this method will rebuild the view model defaults using the <code>getDefaultViewModel</code> that was passed to <code>taunus.mount</code> in the options. An optional <code>done</code> callback will be invoked when the model is rebuilt.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"server-side-controllers\">Server-Side Controllers</h1>\n<p>On the server-side, controllers are modules that export a single function. The parameters passed to these controllers depend on the server-side HTTP framework that&#39;s being used.</p>\n<p>For example, Express gives us three parameters: <code>req</code>, <code>res</code> and <code>next</code>. Hapi gives us two instead: <code>request</code> and <code>reply</code>.</p>\n<p>Here&#39;s a sample controller using <code>taunus-express</code>, as <a href=\"#using-taunus-express-\">detailed below</a>. This is a very simple controller where we are setting the special <code>viewModel</code> property on the response, and calling <code>next</code>. Suppose this controller is the <code>product/home</code> action handler.</p>\n<pre><code class=\"lang-js\">module.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;view title&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>As you can see, Taunus won&#39;t alter the API provided by Express. Instead, it builds upon the notion of using middleware. Once the <code>product/home</code> view is rendered and JavaScript loads, the <code>product/home</code> view controller is executed on the client-side.</p>\n<p>You could change the view to be rendered by setting the <code>action</code> property on the <code>model</code>. In the example shown below this would mean that the <code>error/offline</code> view would be rendered. The client-side controller will be that of <code>error/offline</code>, as well. View controllers are tied to the view that gets rendered.</p>\n<pre><code class=\"lang-js\">module.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;view title&#39;\n    }\n  };\n  if (offline) {\n    res.viewModel.model.action = &#39;error/offline&#39;;\n  }\n  next();\n};\n</code></pre>\n<p>Having a default action and the ability to redirect to another gives us a lot of flexibility when determining how to respond to a request.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"http-framework-plugins\">HTTP Framework Plugins</h1>\n<p>There&#39;s currently two different HTTP frameworks <em>(<a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a>)</em> that you can readily use with Taunus without having to deal with any of the route plumbing yourself.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-express-\">Using <code>taunus-express</code></h2>\n<p>The <code>taunus-express</code> plugin is probably the easiest to use, as Taunus was originally developed with just <a href=\"http://expressjs.com\">Express</a> in mind. In addition to the options already outlined for <a href=\"#-taunus-mount-addroute-options-\">taunus.mount</a>, you can add middleware for any route individually.</p>\n<ul>\n<li><code>middleware</code> are any methods you want Taunus to execute as middleware in Express applications</li>\n</ul>\n<p>To get <code>taunus-express</code> going you can use the following piece of code, provided that you come up with an <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  // ...\n};\n\ntaunusExpress(taunus, app, options);\n</code></pre>\n<p>The <code>taunusExpress</code> method will merely set up Taunus and add the relevant routes to your Express application by calling <code>app.get</code> a bunch of times. You can <a href=\"https://github.com/taunus/taunus-express\">find taunus-express on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-hapi-\">Using <code>taunus-hapi</code></h2>\n<p>The <code>taunus-hapi</code> plugin is a bit more involved, and you&#39;ll have to create a Pack in order to use it. In addition to <a href=\"#-taunus-mount-addroute-options-\">the options we&#39;ve already covered</a>, you can add <code>config</code> on any route.</p>\n<ul>\n<li><code>config</code> is passed directly into the route registered with Hapi, giving you the most flexibility</li>\n</ul>\n<p>To get <code>taunus-hapi</code> going you can use the following piece of code, and you can bring your own <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar Hapi = require(&#39;hapi&#39;);\nvar taunus = require(&#39;taunus&#39;);\nvar taunusHapi = require(&#39;taunus-hapi&#39;)(taunus);\nvar pack = new Hapi.Pack();\n\npack.register({\n  plugin: taunusHapi,\n  options: {\n    // ...\n  }\n});\n</code></pre>\n<p>The <code>taunusHapi</code> plugin will mount Taunus and register all of the necessary routes. You can <a href=\"https://github.com/taunus/taunus-hapi\">find taunus-hapi on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"command-line-interface\">Command-Line Interface</h1>\n<p>Once you&#39;ve set up the server-side to render your views using Taunus, it&#39;s only logical that you&#39;ll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.</p>\n<p>The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.</p>\n<p>Install it globally for development, but remember to use local copies for production-grade uses.</p>\n<pre><code class=\"lang-shell\">npm install -g taunus\n</code></pre>\n<p>When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.</p>\n<pre><code class=\"lang-shell\">taunus\n</code></pre>\n<p>By default, the output will be printed to the standard output, making for a fast debugging experience. Here&#39;s the output if you just had a single <code>home/index</code> route, and the matching view and client-side controller existed.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n  &#39;home/index&#39;: require(&#39;../client/js/controllers/home/index.js&#39;)\n};\n\nvar routes = [\n  {\n    route: &#39;/&#39;,\n    action: &#39;home/index&#39;\n  }\n];\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>You can use a few options to alter the outcome of invoking <code>taunus</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-output-\"><code>--output</code></h2>\n<p><sub>the <code>-o</code> alias is available</sub></p>\n<p>Output is written to a file instead of to standard output. The file path used will be the <code>client_wiring</code> option in <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a>, which defaults to <code>&#39;.bin/wiring.js&#39;</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-watch-\"><code>--watch</code></h2>\n<p><sub>the <code>-w</code> alias is available</sub></p>\n<p>Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether <code>--output</code> was used.</p>\n<p>The program won&#39;t exit.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-transform-module-\"><code>--transform &lt;module&gt;</code></h2>\n<p><sub>the <code>-t</code> alias is available</sub></p>\n<p>This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the <a href=\"https://github.com/taunus/hapiify\"><code>hapiify</code></a> module.</p>\n<pre><code class=\"lang-shell\">npm install hapiify\ntaunus -t hapiify\n</code></pre>\n<p>Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-defer-actions-\"><code>--defer [actions]</code></h2>\n<p><sub>the <code>-d</code> alias is available</sub></p>\n<p>Here is where things get interesting. The <code>--defer</code> flag allows you to defer loading for zero or more actions. Excluding the controller and view templates for any deferred action can significantly reduce the fingerprint of your application.</p>\n<p>The <code>[actions]</code> argument determines what actions get deferred, and which don&#39;t. It expects a comma-separated list of actions, where you can pass in either the controller name, or both the controller name and the action name. Using <code>?</code> acts as a wildcard.</p>\n<p>For example, using <code>admin</code> <em>(equivalent to using <code>admin/?</code>)</em> will defer every action under the <code>admin</code> controller. Using <code>admin/nuke</code> will only defer the <code>admin/nuke</code> action. If you omit the <code>[actions]</code> parameter entirely, the default value of <code>&#39;?&#39;</code> will be used and everything will be deferred.</p>\n<p>When components get deferred, they&#39;ll be loaded as soon as Taunus detects that they&#39;re needed. This can happen in a few places.</p>\n<ul>\n<li>The user navigates to (or <a href=\"#prefetching\"><em>prefetches</em></a>) the <code>/admin</code> route, and <code>admin/index</code> was deferred, and its components aren&#39;t cached on the client-side yet</li>\n<li>A controller uses <code>taunus.partial</code> to render an action that was deferred, and its components aren&#39;t cached on the client-side yet</li>\n<li>The user navigates to the <code>/admin</code> route, and its matching <code>admin/index</code> route wasn&#39;t deferred, but the server-side controller decides to change the action to <code>admin/superadmin</code>. When the response gets to the client, it&#39;ll need to ask the server for the <code>admin/superadmin</code> template if the client doesn&#39;t already have it</li>\n</ul>\n<p>You don&#39;t have to worry about those different scenarios, though, as Taunus handles them all for you transparently. You should <a href=\"/performance#send-views-and-controllers-to-the-client-selectively\">learn more about deferred loading on the performance optimization guide</a>.</p>\n<p>The only concern with deferred execution is that partial views may not be rendered immediately, as a request may be necessary to fetch the controller or template for the partial.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></h2>\n<p><sub>the <code>-r</code> alias is available</sub></p>\n<p>Similarly to the <a href=\"#-options-resolvers-\"><code>resolvers</code></a> option that you can pass to <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a>, these resolvers can change the way in which file paths are resolved.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getClientController(action)</code></td>\n<td>Return path to client-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-bundle-\"><code>--bundle</code></h2>\n<p><sub>the <code>-b</code> alias is available</sub></p>\n<p>Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus <a href=\"https://github.com/umdjs/umd\">as a UMD module</a>.</p>\n<p>This allows you to use Taunus on the client-side even if you don&#39;t want to use <a href=\"http://browserify.org\">Browserify</a> directly.</p>\n<p>Feedback and suggestions about this flag, <em>and possible alternatives that would make Taunus easier to use</em>, are welcome.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-api\">Client-side API</h1>\n<p>Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-container-wiring-options-\"><code>taunus.mount(container, wiring, options?)</code></h2>\n<p>The mountpoint takes a root container, the wiring module, and an options parameter. The <code>container</code> is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the <code>wiring</code> module exactly as built by the CLI, and no further configuration is necessary.</p>\n<p>When the mountpoint executes, Taunus will configure its internal state, <em>set up the client-side router</em>, run the client-side controller for the server-side rendered view, and start hijacking links.</p>\n<p>As an example, consider a browser makes a <code>GET</code> request for <code>/articles/the-fox</code> for the first time. Once <code>taunus.mount(container, wiring)</code> is invoked on the client-side, several things would happen in the order listed below.</p>\n<ul>\n<li>Taunus sets up the client-side view routing engine</li>\n<li>If enabled <em>(via <code>options</code>)</em>, the caching engine is configured</li>\n<li>Taunus obtains the view model <em>(more on this later)</em></li>\n<li>When a view model is obtained, the <code>&#39;start&#39;</code> event is emitted</li>\n<li>Anchor links start being monitored for clicks <em>(at this point your application becomes a <a href=\"http://en.wikipedia.org/wiki/Single-page_application\">SPA</a>)</em></li>\n<li>The <code>articles/article</code> client-side controller is executed</li>\n</ul>\n<p>That&#39;s quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, <em>rather than on the server-side!</em></p>\n<p>In order to better understand the process, I&#39;ll walk you through the <code>options</code> parameter.</p>\n<p>First off, the <code>bootstrap</code> option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: <code>auto</code> <em>(the default strategy)</em>, <code>inline</code>, or <code>manual</code>. The <code>auto</code> strategy involves the least work, which is why it&#39;s the default.</p>\n<ul>\n<li><code>auto</code> will make an AJAX request for the view model</li>\n<li><code>inline</code> expects you to place the model into a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag</li>\n<li><code>manual</code> expects you to get the view model however you want to, and then let Taunus know when it&#39;s ready</li>\n</ul>\n<p>Let&#39;s go into detail about each of these strategies.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-auto-strategy\">Using the <code>auto</code> strategy</h4>\n<p>The <code>auto</code> strategy means that Taunus will make use of an AJAX request to obtain the view model. <em>You don&#39;t have to do anything else</em> and this is the default strategy. This is the <strong>most convenient strategy, but also the slowest</strong> one.</p>\n<p>It&#39;s slow because the view model won&#39;t be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and <code>taunus.mount</code> is invoked.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-inline-strategy\">Using the <code>inline</code> strategy</h4>\n<p>The <code>inline</code> strategy expects you to add a <code>data-taunus</code> attribute on the <code>container</code> element. This attribute must be equal to the <code>id</code> attribute of a <code>&lt;script&gt;</code> tag containing the serialized view model alongside the version information automatically injected by Taunus into the layout template data.</p>\n<pre><code class=\"lang-jade\">div(data-taunus=&#39;model&#39;)!=partial\nscript(type=&#39;text/taunus&#39;, data-taunus=&#39;model&#39;)=JSON.stringify({ version: version, model: model })\n</code></pre>\n<p>Pay special attention to the fact that the model is not only made into a JSON string, <em>but also HTML encoded by Jade</em>. When Taunus extracts the model from the <code>&lt;script&gt;</code> tag it&#39;ll unescape it, and then parse it as JSON.</p>\n<p>This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.</p>\n<p>That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-manual-strategy\">Using the <code>manual</code> strategy</h4>\n<p>The <code>manual</code> strategy is the most involved of the three, but also the most performant. In this strategy you&#39;re supposed to add the following <em>(seemingly pointless)</em> snippet of code in a <code>&lt;script&gt;</code> other than the one that&#39;s pulling down Taunus, so that they are pulled concurrently rather than serially.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n</code></pre>\n<p>Once you somehow get your hands on the view model, you should invoke <code>taunusReady(model)</code>. Considering you&#39;ll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.</p>\n<ul>\n<li>The view model is loaded first, you call <code>taunusReady(model)</code> and wait for Taunus to take the model object and boot the application as soon as <code>taunus.mount</code> is executed</li>\n<li>Taunus loads first and <code>taunus.mount</code> is called first. In this case, Taunus will replace <code>window.taunusReady</code> with a special <code>boot</code> method. When the view model finishes loading, you call <code>taunusReady(model)</code> and the application finishes booting</li>\n</ul>\n<blockquote>\n<p>If this sounds a little mind-bending it&#39;s because it is. It&#39;s not designed to be pretty, but merely to be performant.</p>\n</blockquote>\n<p>Now that we&#39;ve addressed the awkward bits, let&#39;s cover the <em>&quot;somehow get your hands on the view model&quot;</em> aspect. My preferred method is using JSONP, as it&#39;s able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you&#39;ll probably want this to be an inline script, keeping it small is important.</p>\n<p>The good news is that the server-side supports JSONP out the box. Here&#39;s a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nfunction inject (url) {\n  var script = document.createElement(&#39;script&#39;);\n  script.src = url;\n  document.body.appendChild(script);\n}\n\nfunction injector () {\n  var search = location.search;\n  var searchQuery = search ? &#39;&amp;&#39; + search.substr(1) : &#39;&#39;;\n  var searchJson = &#39;?json&amp;callback=taunusReady&#39; + searchQuery;\n  inject(location.pathname + searchJson);\n}\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n\ninjector();\n</code></pre>\n<p>As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching\">Caching</h4>\n<p>The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the <code>cache</code> flag in the options passed to <code>taunus.mount</code> on the client-side.</p>\n<p>If you set <code>cache</code> to <code>true</code> then cached items will be considered <em>&quot;fresh&quot; (valid copies of the original)</em> for <strong>15 seconds</strong>. You can also set <code>cache</code> to a number, and that number of seconds will be used as the default instead.</p>\n<p>Caching can also be tweaked on individual routes. For instance, you could set <code>{ cache: true }</code> when mounting Taunus and then have <code>{ cache: 3600 }</code> on a route that you want to cache for a longer period of time.</p>\n<p>The caching layer is <em>seamlessly integrated</em> into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in <a href=\"http://caniuse.com/#feat=indexeddb\">browsers that support IndexedDB</a>. In the case of browsers that don&#39;t support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"prefetching\">Prefetching</h4>\n<p>If caching is enabled, the next logical step is prefetching. This is enabled just by adding <code>prefetch: true</code> to the options passed to <code>taunus.mount</code>. The prefetching feature will fire for any anchor link that&#39;s trips over a <code>mouseover</code> or a <code>touchstart</code> event. If a route matches the URL in the <code>href</code>, an AJAX request will prefetch the view and cache its contents, improving perceived performance.</p>\n<p>When links are clicked before prefetching finishes, they&#39;ll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.</p>\n<h4 id=\"versioning\">Versioning</h4>\n<p>When enabled, versioning will look out for discrepancies between what&#39;s currently on the client and what&#39;s on the server, and reload everything necessary to make what&#39;s on the client match what&#39;s on the server.</p>\n<p>In order to turn it on, set the <code>version</code> field in the options when invoking <code>taunus.mount</code> <strong>on both the server-side and the client-side, using the same value</strong>. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.</p>\n<blockquote>\n<p>To make sure you don&#39;t forget to change the version string in one of the mountpoints, please create a JSON file with just the version string and <code>require</code> that file in both sides.</p>\n<pre><code class=\"lang-shell\">echo &#39;&quot;1.0.0&quot;&#39; &gt; version.json\n</code></pre>\n</blockquote>\n<p>The default version string is set to <code>1</code>. The Taunus version will be prepended to yours, resulting in a value such as <code>t3.0.0;v1</code> where Taunus is running version <code>3.0.0</code> and your application is running version <code>1</code>.</p>\n<p>Refer to the Getting Started guide for a more detailed <a href=\"/getting-started#versioning\">analysis of the uses for versioning</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-on-type-fn-\"><code>taunus.on(type, fn)</code></h2>\n<p>Taunus emits a series of events during its lifecycle, and <code>taunus.on</code> is the way you can tune in and listen for these events using a subscription function <code>fn</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model, route</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model, route</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;change&#39;</code></td>\n<td><code>route, model</code></td>\n<td>Same as <code>&#39;render&#39;</code>, but only if <code>container</code> is the mountpoint and the route has changed.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Consider for instance that you&#39;d like to keep track of every view that gets rendered, and what DOM element it gets placed into. The piece of code below would quickly do that for us.</p>\n<pre><code class=\"lang-js\">taunus.on(&#39;render&#39;, function (container) {\n  console.log(&#39;Rendered a view on&#39;, container);\n});\n</code></pre>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-once-type-fn-\"><code>taunus.once(type, fn)</code></h2>\n<p>This method is equivalent to <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a>, except the event listeners will be used once and then it&#39;ll be discarded.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-off-type-fn-\"><code>taunus.off(type, fn)</code></h2>\n<p>Using this method you can remove any event listeners that were previously added using <code>.on</code> or <code>.once</code>. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling <code>.on</code> or <code>.once</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-intercept-action-fn-\"><code>taunus.intercept(action?, fn)</code></h2>\n<p>This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified <code>action</code>. You can also add global interceptors by omitting the <code>action</code> parameter, or setting it to <code>*</code>.</p>\n<p>An interceptor function will receive an <code>event</code> parameter, containing a few different properties.</p>\n<ul>\n<li><code>url</code> contains the URL that needs a view model</li>\n<li><code>route</code> contains the full route object as you&#39;d get from <a href=\"#-taunus-route-url-\"><code>taunus.route(url)</code></a></li>\n<li><code>parts</code> is just a shortcut for <code>route.parts</code></li>\n<li><code>preventDefault(model)</code> allows you to suppress the need for an AJAX request, commanding Taunus to use the model you&#39;ve provided instead</li>\n<li><code>defaultPrevented</code> tells you if some other handler has prevented the default behavior</li>\n<li><code>canPreventDefault</code> tells you if invoking <code>event.preventDefault</code> will have any effect</li>\n<li><code>model</code> starts as <code>null</code>, and it can later become the model passed to <code>preventDefault</code></li>\n</ul>\n<p>Interceptors are asynchronous, but if an interceptor spends longer than 50ms it&#39;ll be short-circuited and calling <code>event.preventDefault</code> past that point won&#39;t have any effect.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-partial-container-action-model-\"><code>taunus.partial(container, action, model)</code></h2>\n<p>This method provides you with access to the view-rendering engine of Taunus. You can use it to render the <code>action</code> view into the <code>container</code> DOM element, using the specified <code>model</code>. Once the view is rendered, the <code>render</code> event will be fired <em>(with <code>container, model</code> as arguments)</em> and the client-side controller for that view will be executed.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-navigate-url-options-\"><code>taunus.navigate(url, options)</code></h2>\n<p>Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use <code>taunus.navigate</code> passing it a plain URL or anything that would cause <code>taunus.route(url)</code> to return a valid route.</p>\n<p>By default, if <code>taunus.navigate(url, options)</code> is called with an <code>url</code> that doesn&#39;t match any client-side route, then the user will be redirected via <code>location.href</code>. In cases where the browser doesn&#39;t support the history API, <code>location.href</code> will be used as well.</p>\n<p>There&#39;s a few options you can use to tweak the behavior of <code>taunus.navigate</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Option</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>context</code></td>\n<td>A DOM element that caused the navigation event, used when emitting events</td>\n</tr>\n<tr>\n<td><code>strict</code></td>\n<td>If set to <code>true</code> and the URL doesn&#39;t match any route, then the navigation attempt must be ignored</td>\n</tr>\n<tr>\n<td><code>scroll</code></td>\n<td>When this is set to <code>false</code>, elements aren&#39;t scrolled into view after navigation</td>\n</tr>\n<tr>\n<td><code>force</code></td>\n<td>Unless this is set to <code>true</code>, navigation won&#39;t <em>fetch a model</em> if the route matches the current route, and <code>state.model</code> will be reused instead</td>\n</tr>\n<tr>\n<td><code>replaceState</code></td>\n<td>Use <code>replaceState</code> instead of <code>pushState</code> when changing history</td>\n</tr>\n</tbody>\n</table>\n<p>Note that the notion of <em>fetching a model</em> might be deceiving as the model could be pulled from the cache even if <code>force</code> is set to <code>true</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-route-url-\"><code>taunus.route(url)</code></h2>\n<p>This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.</p>\n<ul>\n<li>A fully qualified URL on the same origin, e.g <code>http://taunus.bevacqua.io/api</code></li>\n<li>An absolute URL without an origin, e.g <code>/api</code></li>\n<li>Just a hash, e.g <code>#foo</code> <em>(<code>location.href</code> is used)</em></li>\n<li>Falsy values, e.g <code>null</code> <em>(<code>location.href</code> is used)</em></li>\n</ul>\n<p>Relative URLs are not supported <em>(anything that doesn&#39;t have a leading slash)</em>, e.g <code>files/data.json</code>. Anything that&#39;s not on the same origin or doesn&#39;t match one of the registered routes is going to yield <code>null</code>.</p>\n<p><em>This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-taunus-route-equals-route-route-\"><code>taunus.route.equals(route, route)</code></h4>\n<p>Compares two routes and returns <code>true</code> if they would fetch the same model. Note that different URLs may still return <code>true</code>. For instance, <code>/foo</code> and <code>/foo#bar</code> would fetch the same model even if they&#39;re different URLs.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-state-\"><code>taunus.state</code></h2>\n<p>This is an internal state variable, and it contains a lot of useful debugging information.</p>\n<ul>\n<li><code>container</code> is the DOM element passed to <code>taunus.mount</code></li>\n<li><code>controllers</code> are all the controllers, as defined in the wiring module</li>\n<li><code>templates</code> are all the templates, as defined in the wiring module</li>\n<li><code>routes</code> are all the routes, as defined in the wiring module</li>\n<li><code>route</code> is a reference to the current route</li>\n<li><code>model</code> is a reference to the model used to render the current view</li>\n<li><code>prefetch</code> exposes whether prefetching is turned on</li>\n<li><code>cache</code> exposes whether caching is enabled</li>\n<li><code>version</code> exposes the version string that&#39;s currently in use</li>\n</ul>\n<p>There&#39;s also a <code>clear</code> method accessible through <code>taunus.state.clear</code>, which will empty the cache, as well as remove from the <code>state</code> any controllers and templates that were lazy loaded.</p>\n<p>Of course, you&#39;re not supposed to meddle with it, so be a good citizen and just inspect its values!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-xhr-url-options-done-\"><code>taunus.xhr(url, options?, done)</code></h2>\n<p>This method allows you to issue your own AJAX requests through the <code>xhr</code> module. It sets a few convenient defaults, <em>listed below</em>, where <code>url</code> refers to the URL passed as the first parameter.</p>\n<pre><code class=\"lang-js\">{\n  url: url,\n  json: true,\n  headers: { Accept: &#39;application/json&#39; }\n}\n</code></pre>\n<p>The <code>done(err, body, res)</code> callback will be invoked when the request finishes, and it&#39;ll be passed three parameters, an optional error if something went wrong <em>(request failed, was aborted, etc.)</em> and a <code>body</code> parameter containing the response body. The raw <code>res</code> object that&#39;s typically provided by <a href=\"https://github.com/Raynos/xhr\"><code>xhr</code></a> as the second parameter is provided as the third parameter instead.</p>\n<p>As an example, here is a <code>GET</code> request.</p>\n<pre><code class=\"lang-js\">taunus.xhr(&#39;/api/places&#39;, function (err, body) {\n  console.log(body);\n  // &lt;- { places: [&#39;underwater fortress&#39;, &#39;island mansion&#39;] }\n});\n</code></pre>\n<p>Always remember to handle the case where <code>err</code> is set!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"debugging-taunus\">Debugging Taunus</h2>\n<p>On the client-side, you will typically <code>require</code> Taunus using the statement below.</p>\n<pre><code class=\"lang-js\">var taunus = require(&#39;taunus&#39;);\n</code></pre>\n<p>However, you could also turn on the internal debug logger simply by using another entry point!</p>\n<pre><code class=\"lang-js\">var taunus = require(&#39;taunus/browser/debug&#39;);\n</code></pre>\n<p>The screenshot below contains an example of this mechanism, where using <a href=\"#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a> triggers a flurry of debug messages.</p>\n<p><img src=\"http://i.imgur.com/CjbIHy0.png\" alt=\"debug.png\"></p>\n<p>This is particularly helpful during development, but also useful if you don&#39;t understand exactly how Taunus is doing something, as the logger is pretty verbose.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-controllers\">Client-Side Controllers</h1>\n<p>Client-side controllers are executed right after a view is rendered, even in the case of <a href=\"#-taunus-partial-container-action-model-\">partial views</a>. These controllers are used to progressively add behavior on top of the HTML for that view.</p>\n<p>View controllers take three parameters.</p>\n<table>\n<thead>\n<tr>\n<th>Parameter</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>model</code></td>\n<td>Model that was used to render the view</td>\n</tr>\n<tr>\n<td><code>container</code></td>\n<td>The DOM element where the view was rendered</td>\n</tr>\n<tr>\n<td><code>route?</code></td>\n<td>Route that triggered the rendering engine. May be <code>null</code></td>\n</tr>\n</tbody>\n</table>\n<p>Note that Taunus will <a href=\"#-taunus-on-type-fn-\">emit a <code>render</code> event</a> right before the view controller gets executed, giving you a chance to react to views getting rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-taunusrc-manifest\">The <code>.taunusrc</code> manifest</h1>\n<p>If you want to use values other than the conventional defaults shown in the table below, then you should create a <code>.taunusrc</code> file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your <code>package.json</code>, under the <code>taunus</code> property.</p>\n<pre><code class=\"lang-json\">{\n  &quot;views&quot;: &quot;.bin/views&quot;,\n  &quot;server_routes&quot;: &quot;controllers/routes.js&quot;,\n  &quot;server_controllers&quot;: &quot;controllers&quot;,\n  &quot;client_controllers&quot;: &quot;client/js/controllers&quot;,\n  &quot;client_wiring&quot;: &quot;.bin/wiring.js&quot;\n}\n</code></pre>\n<ul>\n<li>The <code>views</code> directory is where your views <em>(already compiled into JavaScript)</em> are placed. These views are used directly on both the server-side and the client-side</li>\n<li>The <code>server_routes</code> file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module</li>\n<li>The <code>server_controllers</code> directory is the root directory where your server-side controllers live. It&#39;s used when setting up the server-side router</li>\n<li>The <code>client_controllers</code> directory is where your client-side controller modules live. The CLI will <code>require</code> these controllers in its resulting wiring module</li>\n<li>The <code>client_wiring</code> file is where your wiring module will be placed by the CLI. You&#39;ll then have to <code>require</code> it in your application when booting up Taunus</li>\n</ul>\n<p>Here is where things get <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">a little conventional</a>. Views, and both server-side and client-side controllers are expected to be organized by following the <code>{root}/{controller}/{action}</code> pattern, but you could change that using <code>resolvers</code> when invoking the CLI and using the server-side API.</p>\n<p>Views and controllers are also expected to be CommonJS modules that export a single method.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    Taunus exposes _three different public APIs_, and there's also **plugins to integrate Taunus and an HTTP server**. This document covers all three APIs extensively. If you're concerned about the inner workings of Taunus, please refer to the [Getting Started][1] guide. This document aims to only cover how the public interface affects application state, but **doesn't delve into implementation details**.\n\n    # Table of Contents\n\n    - A [server-side API](#server-side-api) that deals with server-side rendering\n      - The [`taunus.mount`](#-taunus-mount-addroute-options-) method\n        - Its [`options`](#the-options-object) argument\n          - [`layout`](#-options-layout-)\n          - [`routes`](#-options-routes-)\n          - [`getDefaultViewModel`](#-options-getdefaultviewmodel-)\n          - [`plaintext`](#-options-plaintext-)\n          - [`resolvers`](#-options-resolvers-)\n          - [`version`](#-options-version-)\n          - [`deferMinified`](#-options-deferminified-)\n        - Its [`addRoute`](#-addroute-definition-) argument\n      - The [`taunus.render`](#-taunus-render-action-viewmodel-req-res-next-) method\n      - The [`taunus.rebuildDefaultViewModel`](#-taunus-rebuilddefaultviewmodel-done-) method\n    - [Server-side controllers](#server-side-controllers)\n    - A [suite of plugins](#http-framework-plugins) can integrate Taunus and an HTTP server\n      - Using [`taunus-express`](#using-taunus-express-) for [Express][2]\n      - Using [`taunus-hapi`](#using-taunus-hapi-) for [Hapi][3]\n    - A [CLI that produces a wiring module](#command-line-interface) for the client-side\n      - The [`--output`](#-output-) flag\n      - The [`--watch`](#-watch-) flag\n      - The [`--transform <module>`](#-transform-module-) flag\n      - The [`--defer`](#-defer-actions-) flag\n      - The [`--resolvers <module>`](#-resolvers-module-) flag\n      - The [`--bundle`](#-bundle-) flag\n    - A [client-side API](#client-side-api) that deals with client-side rendering\n      - The [`taunus.mount`](#-taunus-mount-container-wiring-options-) method\n        - Using the [`auto`](#using-the-auto-strategy) strategy\n        - Using the [`inline`](#using-the-inline-strategy) strategy\n        - Using the [`manual`](#using-the-manual-strategy) strategy\n        - [Caching](#caching)\n        - [Prefetching](#prefetching)\n        - [Versioning](#versioning)\n      - The [`taunus.on`](#-taunus-on-type-fn-) method\n      - The [`taunus.once`](#-taunus-once-type-fn-) method\n      - The [`taunus.off`](#-taunus-off-type-fn-) method\n      - The [`taunus.intercept`](#-taunus-intercept-action-fn-) method\n      - The [`taunus.partial`](#-taunus-partial-container-action-model-) method\n      - The [`taunus.navigate`](#-taunus-navigate-url-options-) method\n      - The [`taunus.route`](#-taunus-route-url-) method\n        - The [`taunus.route.equals`](#-taunus-route-equals-route-route-) method\n      - The [`taunus.state`](#-taunus-state-) property\n      - The [`taunus.xhr`](#-taunus-xhr-url-options-done-) method\n      - [Debugging Taunus](#debugging-taunus)\n    - [Client-side controllers](#client-side-controllers)\n    - The [`.taunusrc`](#the-taunusrc-manifest) manifest\n\n    # Server-side API\n\n    The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, _including client-side rendering_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(addRoute, options?)`\n\n    Mounts Taunus on top of a server-side router, by registering each route in `options.routes` with the `addRoute` method.\n\n    > Note that most of the time, **this method shouldn't be invoked directly**, but rather through one of the [HTTP framework plugins](#http-framework-plugins) presented below.\n\n    Here's an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the `route` and `action` properties.\n\n    ```js\n    'use strict';\n\n    taunus.mount(addRoute, {\n      routes: [{ route: '/', action: 'home/index' }]\n    });\n\n    function addRoute (definition) {\n      app.get(definition.route, definition.action);\n    }\n    ```\n\n    Let's go over the options you can pass to `taunus.mount` first.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### The `options?` object\n\n    There's a few options that can be passed to the server-side mountpoint. You're probably going to be passing these to your [HTTP framework plugin](#http-framework-plugins), rather than using `taunus.mount` directly.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.layout?`\n\n    The `layout` property is expected to have the `function(data)` signature. It'll be invoked whenever a full HTML document needs to be rendered, and a `data` object will be passed to it. That object will contain everything you've set as the view model, plus a `partial` property containing the raw HTML of the rendered partial view. Your `layout` method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out [the `layout.jade` used in Pony Foo][4] as an example.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.routes`\n\n    The other big option is `routes`, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.\n\n    Here's an example route that uses the [Express][2] routing scheme.\n\n    ```js\n    {\n      route: '/articles/:slug',\n      action: 'articles/article',\n      ignore: false,\n      cache: <inherit>\n    }\n    ```\n\n    - `route` is a route in the format your HTTP framework of choice understands\n    - `action` is the name of your controller action. It'll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller\n    - `cache` can be used to determine the client-side caching behavior in this application path, and it'll default to inheriting from the options passed to `taunus.mount` _on the client-side_\n    - `ignore` is used in those cases where you want a URL to be ignored by the client-side router even if there's a catch-all route that would match that URL\n\n    As an example of the `ignore` use case, consider the routing table shown below. The client-side router doesn't know _(and can't know unless you point it out)_ what routes are server-side only, and it's up to you to point those out.\n\n    ```js\n    [\n      { route: '/', action: '/home/index' },\n      { route: '/feed', ignore: true },\n      { route: '/*', action: 'error/not-found' }\n    ]\n    ```\n\n    This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The `ignore` property is effectively telling the client-side _\"don't hijack links containing this URL\"_.\n\n    Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don't need to be `ignore`d.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getDefaultViewModel?`\n\n    The `getDefaultViewModel(done)` property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you're done creating a view model, you can invoke `done(null, model)`. If an error occurs while building the view model, you should call `done(err)` instead.\n\n    Taunus will throw an error if `done` is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases [the defaults can be rebuilt](#taunus-rebuilddefaultviewmodel).\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.plaintext?`\n\n    The `plaintext` options object is passed directly to [hget][5], and it's used to [tweak the plaintext version][6] of your site.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.resolvers?`\n\n    Resolvers are used to determine the location of some of the different pieces of your application. Typically you won't have to touch these in the slightest.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getServerController(action)` | Return path to server-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    The `addRoute` method passed to `taunus.mount` on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.version?`\n\n    Refer to the [Versioning](#versioning) section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getPartial?`\n\n    By default, Taunus will render partials on the server-side by looking up the module for an action method, and calling that action passing in a model.\n\n    You can override the default behavior by setting `options.getPartial` to a function. This method takes three parameters.\n\n    - `action` is the action that needs to be rendered\n    - `model` is the model you can use to render the view for that action\n    - `done(err, html)` is called when you're done, passing in the resulting `html` for the partial\n\n    Note that if you don't set `getPartial`, Taunus will just require your controller action method and invoke that instead.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.deferMinified?`\n\n    When views and controllers are lazily loaded, they are compiled and bundled using Browserify. Taunus will even produce a source map. To avoid the source map, and minify the bundle instead, set `deferMinified` to `true`.\n\n    You'll probably want to set `deferMinified` to whether the application is running on the production environment.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `addRoute(definition)`\n\n    The `addRoute(definition)` method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework's router.\n\n    - `route` is the route that you set as `definition.route`\n    - `action` is the action as passed to the route definition\n    - `actionFn` will be the controller for this action method\n    - `middleware` will be an array of methods to be executed before `actionFn`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.render(action, viewModel, req, res, next)`\n\n    This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won't go very deep into it.\n\n    The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The `action` property determines the default view that will be rendered. The `viewModel` will be extended by [the default view model](#-options-getdefaultviewmodel-), and it may also override the default `action` by setting `viewModel.model.action`.\n\n    The `req`, `res`, and `next` arguments are expected to be the Express routing arguments, but they can also be mocked _(which is in fact what the Hapi plugin does)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.rebuildDefaultViewModel(done?)`\n\n    Once Taunus has been mounted, calling this method will rebuild the view model defaults using the `getDefaultViewModel` that was passed to `taunus.mount` in the options. An optional `done` callback will be invoked when the model is rebuilt.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Server-Side Controllers\n\n    On the server-side, controllers are modules that export a single function. The parameters passed to these controllers depend on the server-side HTTP framework that's being used.\n\n    For example, Express gives us three parameters: `req`, `res` and `next`. Hapi gives us two instead: `request` and `reply`.\n\n    Here's a sample controller using `taunus-express`, as [detailed below](#using-taunus-express-). This is a very simple controller where we are setting the special `viewModel` property on the response, and calling `next`. Suppose this controller is the `product/home` action handler.\n\n    ```js\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'view title'\n        }\n      };\n      next();\n    };\n    ```\n\n    As you can see, Taunus won't alter the API provided by Express. Instead, it builds upon the notion of using middleware. Once the `product/home` view is rendered and JavaScript loads, the `product/home` view controller is executed on the client-side.\n\n    You could change the view to be rendered by setting the `action` property on the `model`. In the example shown below this would mean that the `error/offline` view would be rendered. The client-side controller will be that of `error/offline`, as well. View controllers are tied to the view that gets rendered.\n\n    ```js\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'view title'\n        }\n      };\n      if (offline) {\n        res.viewModel.model.action = 'error/offline';\n      }\n      next();\n    };\n    ```\n\n    Having a default action and the ability to redirect to another gives us a lot of flexibility when determining how to respond to a request.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # HTTP Framework Plugins\n\n    There's currently two different HTTP frameworks _([Express][2] and [Hapi][3])_ that you can readily use with Taunus without having to deal with any of the route plumbing yourself.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-express`\n\n    The `taunus-express` plugin is probably the easiest to use, as Taunus was originally developed with just [Express][2] in mind. In addition to the options already outlined for [taunus.mount](#-taunus-mount-addroute-options-), you can add middleware for any route individually.\n\n    - `middleware` are any methods you want Taunus to execute as middleware in Express applications\n\n    To get `taunus-express` going you can use the following piece of code, provided that you come up with an `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      // ...\n    };\n\n    taunusExpress(taunus, app, options);\n    ```\n\n    The `taunusExpress` method will merely set up Taunus and add the relevant routes to your Express application by calling `app.get` a bunch of times. You can [find taunus-express on GitHub][7].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-hapi`\n\n    The `taunus-hapi` plugin is a bit more involved, and you'll have to create a Pack in order to use it. In addition to [the options we've already covered](#-taunus-mount-addroute-options-), you can add `config` on any route.\n\n    - `config` is passed directly into the route registered with Hapi, giving you the most flexibility\n\n    To get `taunus-hapi` going you can use the following piece of code, and you can bring your own `options` object.\n\n    ```js\n    'use strict';\n\n    var Hapi = require('hapi');\n    var taunus = require('taunus');\n    var taunusHapi = require('taunus-hapi')(taunus);\n    var pack = new Hapi.Pack();\n\n    pack.register({\n      plugin: taunusHapi,\n      options: {\n        // ...\n      }\n    });\n    ```\n\n    The `taunusHapi` plugin will mount Taunus and register all of the necessary routes. You can [find taunus-hapi on GitHub][8].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Command-Line Interface\n\n    Once you've set up the server-side to render your views using Taunus, it's only logical that you'll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.\n\n    The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.\n\n    Install it globally for development, but remember to use local copies for production-grade uses.\n\n    ```shell\n    npm install -g taunus\n    ```\n\n    When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.\n\n    ```shell\n    taunus\n    ```\n\n    By default, the output will be printed to the standard output, making for a fast debugging experience. Here's the output if you just had a single `home/index` route, and the matching view and client-side controller existed.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n      'home/index': require('../client/js/controllers/home/index.js')\n    };\n\n    var routes = [\n      {\n        route: '/',\n        action: 'home/index'\n      }\n    ];\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    You can use a few options to alter the outcome of invoking `taunus`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--output`\n\n    <sub>the `-o` alias is available</sub>\n\n    Output is written to a file instead of to standard output. The file path used will be the `client_wiring` option in [`.taunusrc`](#the-taunusrc-manifest), which defaults to `'.bin/wiring.js'`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--watch`\n\n    <sub>the `-w` alias is available</sub>\n\n    Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether `--output` was used.\n\n    The program won't exit.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--transform <module>`\n\n    <sub>the `-t` alias is available</sub>\n\n    This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the [`hapiify`][9] module.\n\n    ```shell\n    npm install hapiify\n    taunus -t hapiify\n    ```\n\n    Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--defer [actions]`\n\n    <sub>the `-d` alias is available</sub>\n\n    Here is where things get interesting. The `--defer` flag allows you to defer loading for zero or more actions. Excluding the controller and view templates for any deferred action can significantly reduce the fingerprint of your application.\n\n    The `[actions]` argument determines what actions get deferred, and which don't. It expects a comma-separated list of actions, where you can pass in either the controller name, or both the controller name and the action name. Using `?` acts as a wildcard.\n\n    For example, using `admin` _(equivalent to using `admin/?`)_ will defer every action under the `admin` controller. Using `admin/nuke` will only defer the `admin/nuke` action. If you omit the `[actions]` parameter entirely, the default value of `'?'` will be used and everything will be deferred.\n\n    When components get deferred, they'll be loaded as soon as Taunus detects that they're needed. This can happen in a few places.\n\n    - The user navigates to (or [_prefetches_](#prefetching)) the `/admin` route, and `admin/index` was deferred, and its components aren't cached on the client-side yet\n    - A controller uses `taunus.partial` to render an action that was deferred, and its components aren't cached on the client-side yet\n    - The user navigates to the `/admin` route, and its matching `admin/index` route wasn't deferred, but the server-side controller decides to change the action to `admin/superadmin`. When the response gets to the client, it'll need to ask the server for the `admin/superadmin` template if the client doesn't already have it\n\n    You don't have to worry about those different scenarios, though, as Taunus handles them all for you transparently. You should [learn more about deferred loading on the performance optimization guide](/performance#send-views-and-controllers-to-the-client-selectively).\n\n    The only concern with deferred execution is that partial views may not be rendered immediately, as a request may be necessary to fetch the controller or template for the partial.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--resolvers <module>`\n\n    <sub>the `-r` alias is available</sub>\n\n    Similarly to the [`resolvers`](#-options-resolvers-) option that you can pass to [`taunus.mount`](#-taunus-mount-addroute-options-), these resolvers can change the way in which file paths are resolved.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getClientController(action)` | Return path to client-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--bundle`\n\n    <sub>the `-b` alias is available</sub>\n\n    Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus [as a UMD module][10].\n\n    This allows you to use Taunus on the client-side even if you don't want to use [Browserify][11] directly.\n\n    Feedback and suggestions about this flag, _and possible alternatives that would make Taunus easier to use_, are welcome.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-side API\n\n    Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(container, wiring, options?)`\n\n    The mountpoint takes a root container, the wiring module, and an options parameter. The `container` is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the `wiring` module exactly as built by the CLI, and no further configuration is necessary.\n\n    When the mountpoint executes, Taunus will configure its internal state, _set up the client-side router_, run the client-side controller for the server-side rendered view, and start hijacking links.\n\n    As an example, consider a browser makes a `GET` request for `/articles/the-fox` for the first time. Once `taunus.mount(container, wiring)` is invoked on the client-side, several things would happen in the order listed below.\n\n    - Taunus sets up the client-side view routing engine\n    - If enabled _(via `options`)_, the caching engine is configured\n    - Taunus obtains the view model _(more on this later)_\n    - When a view model is obtained, the `'start'` event is emitted\n    - Anchor links start being monitored for clicks _(at this point your application becomes a [SPA][13])_\n    - The `articles/article` client-side controller is executed\n\n    That's quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, _rather than on the server-side!_\n\n    In order to better understand the process, I'll walk you through the `options` parameter.\n\n    First off, the `bootstrap` option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: `auto` _(the default strategy)_, `inline`, or `manual`. The `auto` strategy involves the least work, which is why it's the default.\n\n    - `auto` will make an AJAX request for the view model\n    - `inline` expects you to place the model into a `<script type='text/taunus'>` tag\n    - `manual` expects you to get the view model however you want to, and then let Taunus know when it's ready\n\n    Let's go into detail about each of these strategies.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `auto` strategy\n\n    The `auto` strategy means that Taunus will make use of an AJAX request to obtain the view model. _You don't have to do anything else_ and this is the default strategy. This is the **most convenient strategy, but also the slowest** one.\n\n    It's slow because the view model won't be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and `taunus.mount` is invoked.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `inline` strategy\n\n    The `inline` strategy expects you to add a `data-taunus` attribute on the `container` element. This attribute must be equal to the `id` attribute of a `<script>` tag containing the serialized view model alongside the version information automatically injected by Taunus into the layout template data.\n\n    ```jade\n    div(data-taunus='model')!=partial\n    script(type='text/taunus', data-taunus='model')=JSON.stringify({ version: version, model: model })\n    ```\n\n    Pay special attention to the fact that the model is not only made into a JSON string, _but also HTML encoded by Jade_. When Taunus extracts the model from the `<script>` tag it'll unescape it, and then parse it as JSON.\n\n    This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.\n\n    That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `manual` strategy\n\n    The `manual` strategy is the most involved of the three, but also the most performant. In this strategy you're supposed to add the following _(seemingly pointless)_ snippet of code in a `<script>` other than the one that's pulling down Taunus, so that they are pulled concurrently rather than serially.\n\n    ```js\n    'use strict';\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n    ```\n\n    Once you somehow get your hands on the view model, you should invoke `taunusReady(model)`. Considering you'll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.\n\n    - The view model is loaded first, you call `taunusReady(model)` and wait for Taunus to take the model object and boot the application as soon as `taunus.mount` is executed\n    - Taunus loads first and `taunus.mount` is called first. In this case, Taunus will replace `window.taunusReady` with a special `boot` method. When the view model finishes loading, you call `taunusReady(model)` and the application finishes booting\n\n    > If this sounds a little mind-bending it's because it is. It's not designed to be pretty, but merely to be performant.\n\n    Now that we've addressed the awkward bits, let's cover the _\"somehow get your hands on the view model\"_ aspect. My preferred method is using JSONP, as it's able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you'll probably want this to be an inline script, keeping it small is important.\n\n    The good news is that the server-side supports JSONP out the box. Here's a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.\n\n    ```js\n    'use strict';\n\n    function inject (url) {\n      var script = document.createElement('script');\n      script.src = url;\n      document.body.appendChild(script);\n    }\n\n    function injector () {\n      var search = location.search;\n      var searchQuery = search ? '&' + search.substr(1) : '';\n      var searchJson = '?json&callback=taunusReady' + searchQuery;\n      inject(location.pathname + searchJson);\n    }\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n\n    injector();\n    ```\n\n    As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching\n\n    The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the `cache` flag in the options passed to `taunus.mount` on the client-side.\n\n    If you set `cache` to `true` then cached items will be considered _\"fresh\" (valid copies of the original)_ for **15 seconds**. You can also set `cache` to a number, and that number of seconds will be used as the default instead.\n\n    Caching can also be tweaked on individual routes. For instance, you could set `{ cache: true }` when mounting Taunus and then have `{ cache: 3600 }` on a route that you want to cache for a longer period of time.\n\n    The caching layer is _seamlessly integrated_ into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in [browsers that support IndexedDB][14]. In the case of browsers that don't support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Prefetching\n\n    If caching is enabled, the next logical step is prefetching. This is enabled just by adding `prefetch: true` to the options passed to `taunus.mount`. The prefetching feature will fire for any anchor link that's trips over a `mouseover` or a `touchstart` event. If a route matches the URL in the `href`, an AJAX request will prefetch the view and cache its contents, improving perceived performance.\n\n    When links are clicked before prefetching finishes, they'll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.\n\n    #### Versioning\n\n    When enabled, versioning will look out for discrepancies between what's currently on the client and what's on the server, and reload everything necessary to make what's on the client match what's on the server.\n\n    In order to turn it on, set the `version` field in the options when invoking `taunus.mount` **on both the server-side and the client-side, using the same value**. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.\n\n    > To make sure you don't forget to change the version string in one of the mountpoints, please create a JSON file with just the version string and `require` that file in both sides.\n    >\n    > ```shell\n    > echo '\"1.0.0\"' > version.json\n    > ```\n\n    The default version string is set to `1`. The Taunus version will be prepended to yours, resulting in a value such as `t3.0.0;v1` where Taunus is running version `3.0.0` and your application is running version `1`.\n\n    Refer to the Getting Started guide for a more detailed [analysis of the uses for versioning][15].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.on(type, fn)`\n\n    Taunus emits a series of events during its lifecycle, and `taunus.on` is the way you can tune in and listen for these events using a subscription function `fn`.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model, route`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model, route`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'change'`       | `route, model`          | Same as `'render'`, but only if `container` is the mountpoint and the route has changed.\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Consider for instance that you'd like to keep track of every view that gets rendered, and what DOM element it gets placed into. The piece of code below would quickly do that for us.\n\n    ```js\n    taunus.on('render', function (container) {\n      console.log('Rendered a view on', container);\n    });\n    ```\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.once(type, fn)`\n\n    This method is equivalent to [`taunus.on`](#-taunus-on-type-fn-), except the event listeners will be used once and then it'll be discarded.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.off(type, fn)`\n\n    Using this method you can remove any event listeners that were previously added using `.on` or `.once`. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling `.on` or `.once`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.intercept(action?, fn)`\n\n    This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified `action`. You can also add global interceptors by omitting the `action` parameter, or setting it to `*`.\n\n    An interceptor function will receive an `event` parameter, containing a few different properties.\n\n    - `url` contains the URL that needs a view model\n    - `route` contains the full route object as you'd get from [`taunus.route(url)`](#-taunus-route-url-)\n    - `parts` is just a shortcut for `route.parts`\n    - `preventDefault(model)` allows you to suppress the need for an AJAX request, commanding Taunus to use the model you've provided instead\n    - `defaultPrevented` tells you if some other handler has prevented the default behavior\n    - `canPreventDefault` tells you if invoking `event.preventDefault` will have any effect\n    - `model` starts as `null`, and it can later become the model passed to `preventDefault`\n\n    Interceptors are asynchronous, but if an interceptor spends longer than 50ms it'll be short-circuited and calling `event.preventDefault` past that point won't have any effect.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.partial(container, action, model)`\n\n    This method provides you with access to the view-rendering engine of Taunus. You can use it to render the `action` view into the `container` DOM element, using the specified `model`. Once the view is rendered, the `render` event will be fired _(with `container, model` as arguments)_ and the client-side controller for that view will be executed.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.navigate(url, options)`\n\n    Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use `taunus.navigate` passing it a plain URL or anything that would cause `taunus.route(url)` to return a valid route.\n\n    By default, if `taunus.navigate(url, options)` is called with an `url` that doesn't match any client-side route, then the user will be redirected via `location.href`. In cases where the browser doesn't support the history API, `location.href` will be used as well.\n\n    There's a few options you can use to tweak the behavior of `taunus.navigate`.\n\n    Option           | Description\n    -----------------|-------------------------------------------------------------------\n    `context`        | A DOM element that caused the navigation event, used when emitting events\n    `strict`         | If set to `true` and the URL doesn't match any route, then the navigation attempt must be ignored\n    `scroll`         | When this is set to `false`, elements aren't scrolled into view after navigation\n    `force`          | Unless this is set to `true`, navigation won't _fetch a model_ if the route matches the current route, and `state.model` will be reused instead\n    `replaceState`   | Use `replaceState` instead of `pushState` when changing history\n\n    Note that the notion of _fetching a model_ might be deceiving as the model could be pulled from the cache even if `force` is set to `true`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.route(url)`\n\n    This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.\n\n    - A fully qualified URL on the same origin, e.g `http://taunus.bevacqua.io/api`\n    - An absolute URL without an origin, e.g `/api`\n    - Just a hash, e.g `#foo` _(`location.href` is used)_\n    - Falsy values, e.g `null` _(`location.href` is used)_\n\n    Relative URLs are not supported _(anything that doesn't have a leading slash)_, e.g `files/data.json`. Anything that's not on the same origin or doesn't match one of the registered routes is going to yield `null`.\n\n    _This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `taunus.route.equals(route, route)`\n\n    Compares two routes and returns `true` if they would fetch the same model. Note that different URLs may still return `true`. For instance, `/foo` and `/foo#bar` would fetch the same model even if they're different URLs.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.state`\n\n    This is an internal state variable, and it contains a lot of useful debugging information.\n\n    - `container` is the DOM element passed to `taunus.mount`\n    - `controllers` are all the controllers, as defined in the wiring module\n    - `templates` are all the templates, as defined in the wiring module\n    - `routes` are all the routes, as defined in the wiring module\n    - `route` is a reference to the current route\n    - `model` is a reference to the model used to render the current view\n    - `prefetch` exposes whether prefetching is turned on\n    - `cache` exposes whether caching is enabled\n    - `version` exposes the version string that's currently in use\n\n    There's also a `clear` method accessible through `taunus.state.clear`, which will empty the cache, as well as remove from the `state` any controllers and templates that were lazy loaded.\n\n    Of course, you're not supposed to meddle with it, so be a good citizen and just inspect its values!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.xhr(url, options?, done)`\n\n    This method allows you to issue your own AJAX requests through the `xhr` module. It sets a few convenient defaults, _listed below_, where `url` refers to the URL passed as the first parameter.\n\n    ```js\n    {\n      url: url,\n      json: true,\n      headers: { Accept: 'application/json' }\n    }\n    ```\n\n    The `done(err, body, res)` callback will be invoked when the request finishes, and it'll be passed three parameters, an optional error if something went wrong _(request failed, was aborted, etc.)_ and a `body` parameter containing the response body. The raw `res` object that's typically provided by [`xhr`][16] as the second parameter is provided as the third parameter instead.\n\n    As an example, here is a `GET` request.\n\n    ```js\n    taunus.xhr('/api/places', function (err, body) {\n      console.log(body);\n      // <- { places: ['underwater fortress', 'island mansion'] }\n    });\n    ```\n\n    Always remember to handle the case where `err` is set!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Debugging Taunus\n\n    On the client-side, you will typically `require` Taunus using the statement below.\n\n    ```js\n    var taunus = require('taunus');\n    ```\n\n    However, you could also turn on the internal debug logger simply by using another entry point!\n\n    ```js\n    var taunus = require('taunus/browser/debug');\n    ```\n\n    The screenshot below contains an example of this mechanism, where using [`taunus.partial`](#-taunus-partial-container-action-model-) triggers a flurry of debug messages.\n\n    ![debug.png][17]\n\n    This is particularly helpful during development, but also useful if you don't understand exactly how Taunus is doing something, as the logger is pretty verbose.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-Side Controllers\n\n    Client-side controllers are executed right after a view is rendered, even in the case of [partial views](#-taunus-partial-container-action-model-). These controllers are used to progressively add behavior on top of the HTML for that view.\n\n    View controllers take three parameters.\n\n    Parameter   | Description\n    ------------|--------------------------\n    `model`     | Model that was used to render the view\n    `container` | The DOM element where the view was rendered\n    `route?`    | Route that triggered the rendering engine. May be `null`\n\n    Note that Taunus will [emit a `render` event](#-taunus-on-type-fn-) right before the view controller gets executed, giving you a chance to react to views getting rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The `.taunusrc` manifest\n\n    If you want to use values other than the conventional defaults shown in the table below, then you should create a `.taunusrc` file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your `package.json`, under the `taunus` property.\n\n    ```json\n    {\n      \"views\": \".bin/views\",\n      \"server_routes\": \"controllers/routes.js\",\n      \"server_controllers\": \"controllers\",\n      \"client_controllers\": \"client/js/controllers\",\n      \"client_wiring\": \".bin/wiring.js\"\n    }\n    ```\n\n    - The `views` directory is where your views _(already compiled into JavaScript)_ are placed. These views are used directly on both the server-side and the client-side\n    - The `server_routes` file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module\n    - The `server_controllers` directory is the root directory where your server-side controllers live. It's used when setting up the server-side router\n    - The `client_controllers` directory is where your client-side controller modules live. The CLI will `require` these controllers in its resulting wiring module\n    - The `client_wiring` file is where your wiring module will be placed by the CLI. You'll then have to `require` it in your application when booting up Taunus\n\n    Here is where things get [a little conventional][12]. Views, and both server-side and client-side controllers are expected to be organized by following the `{root}/{controller}/{action}` pattern, but you could change that using `resolvers` when invoking the CLI and using the server-side API.\n\n    Views and controllers are also expected to be CommonJS modules that export a single method.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: /getting-started\n    [2]: http://expressjs.com\n    [3]: http://hapijs.com\n    [4]: https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\n    [5]: https://github.com/bevacqua/hget\n    [6]: https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\n    [7]: https://github.com/taunus/taunus-express\n    [8]: https://github.com/taunus/taunus-hapi\n    [9]: https://github.com/taunus/hapiify\n    [10]: https://github.com/umdjs/umd\n    [11]: http://browserify.org\n    [12]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [13]: http://en.wikipedia.org/wiki/Single-page_application\n    [14]: http://caniuse.com/#feat=indexeddb\n    [15]: /getting-started#versioning\n    [16]: https://github.com/Raynos/xhr\n    [17]: http://i.imgur.com/CjbIHy0.png\n");
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
buf.push("<h1 id=\"complementary-modules\">Complementary Modules</h1>\n<p>Taunus is a small library by MVC framework standards, sitting <strong>below 15kB minified and gzipped</strong>. It is designed to be small. It is also designed to do one thing well, and that&#39;s <em>being a shared-rendering MVC engine</em>.</p>\n<p>Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you <a href=\"/api\">head over to the API documentation</a>, you&#39;ll notice that the server-side API, the command-line interface, and the <code>.taunusrc</code> manifest are only concerned with providing a conventional shared-rendering MVC engine.</p>\n<p>In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you&#39;re used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.</p>\n<blockquote>\n<p>In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.</p>\n</blockquote>\n<p>Taunus attempts to bring the server-side mentality of <em>&quot;not doing everything is okay&quot;</em> into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do <strong>one thing well</strong>.</p>\n<p>In this brief article we&#39;ll recommend a couple different libraries that play well with Taunus, and you&#39;ll also learn how to search for modules that can give you access to other functionality you may be interested in.</p>\n<h1 id=\"using-dominus-for-dom-querying\">Using <code>dominus</code> for DOM querying</h1>\n<p><a href=\"https://github.com/bevacqua/dominus\">Dominus</a> is an extra-small DOM querying library, currently clocking around <strong>4kB minified and gzipped</strong>, almost <em>ten times smaller</em> than it&#39;s competition. Unlike jQuery and popular friends, Dominus doesn&#39;t provide AJAX features, layout math, <code>&lt;form&gt;</code> manipulation, promises, tens of event binding methods, a selector engine written in plain JavaScript, nor a myriad of utility functions. Instead, Dominus focuses solely on providing a rich DOM querying and manipulation API that gets rid of inconsistencies across browsers.</p>\n<p>While the API isn&#39;t exactly compatible with jQuery, it is definitely familiar to the jQuery adept. Chaining, versatility, expressiveness, and raw power are all core concerns for Dominus. You&#39;ll find that Dominus has more consistently named methods, given that it was built with a concise API in mind.</p>\n<p>There&#39;s a few differences in semantics, and I believe that&#39;s a good thing. For instance, if you do <code>.value</code> on a checkbox or radio button you&#39;ll get back whether the input is checked. Similarly, if you call <code>.text</code> on the input you&#39;ll get the text back, which is most often what you wanted to get.</p>\n<pre><code class=\"lang-js\">var a = require(&#39;dominus&#39;);\nvar b = jQuery;\n\na(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, value: &#39;Foo&#39; }).text();\n// &lt;- &#39;Foo&#39;\n\na(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, checked: true }).value();\n// &lt;- true\n\nb(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, value: &#39;Foo&#39; }).text();\n// &lt;- &#39;&#39;\n\nb(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, checked: true }).val();\n// &lt;- &#39;Foo&#39;\n</code></pre>\n<p>One of the best aspects of Dominus, <em>besides its small size</em>, is the fact that it extends native JavaScript arrays <em>(using <a href=\"https://github.com/bevacqua/poser\"><code>poser</code></a>)</em>. That means you have access to all of the <code>Array</code> functional methods on any <code>Dominus</code> collections, such as <code>.forEach</code>, <code>.map</code>, <code>.filter</code>, <code>.sort</code> and so on.</p>\n<p>Taunus doesn&#39;t make any extensive DOM manipulation <em>(nor querying)</em> and doesn&#39;t need to use Dominus, but it may find a home in your application.</p>\n<p>You can check out the <em>complete API documentation</em> for <code>dominus</code> on <a href=\"https://github.com/bevacqua/dominus\">its GitHub repository</a>.</p>\n<h1 id=\"using-xhr-to-make-ajax-requests\">Using <code>xhr</code> to make AJAX requests</h1>\n<p>A small program called <a href=\"https://github.com/Raynos/xhr\"><code>xhr</code></a> can be used to make AJAX requests and it&#39;s bundled with Taunus, because it needs it internally to communicate with the server. As such, it was trivial for Taunus to expose this engine and give you the ability to make AJAX calls of your own using it as well.</p>\n<p>You can check out <a href=\"/api#-taunus-xhr-url-options-done-\">the API documentation</a> for an explanation of how our interface to <code>xhr</code> works, or you could also <a href=\"https://github.com/Raynos/xhr\">see their API documentation</a> and use that directly instead.</p>\n<h1 id=\"complementing-your-code-with-small-modules\">Complementing your code with small modules</h1>\n<p>There&#39;s an infinite number of modules that do just one thing well and are eager to be part of your applications. Leverage the Internet to find what you need. Small libraries tend to be better documented, concise to use, and simpler.</p>\n<p>Here&#39;s a few examples of modules you could consider.</p>\n<ul>\n<li><a href=\"https://github.com/bevacqua/hint\"><code>vue</code></a> gives you MVVM capabilities</li>\n<li><a href=\"https://github.com/polymer/observe-js\"><code>observe-js</code></a> to get data-binding</li>\n<li><a href=\"https://github.com/Matt-Esch/virtual-dom\"><code>virtual-dom</code></a> to use a virtual DOM diffing algorithm a la <a href=\"https://github.com/facebook/react\">Facebook React</a></li>\n<li><a href=\"https://github.com/bevacqua/hint\"><code>hint</code></a> progressively enhances your HTML giving you more colorful tooltips</li>\n<li><a href=\"https://github.com/bevacqua/rome\"><code>rome</code></a> is a small calendar component</li>\n</ul>\n<p>You can look for relevant modules using <a href=\"http://browserifysearch.org/\">BrowserifySearch.org</a>, the <a href=\"https://www.npmjs.org/\"><code>npm</code> search</a>, asking around on Twitter, or just by Googling!</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Complementary Modules\n\n    Taunus is a small library by MVC framework standards, sitting **below 15kB minified and gzipped**. It is designed to be small. It is also designed to do one thing well, and that's _being a shared-rendering MVC engine_.\n\n    Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you [head over to the API documentation][1], you'll notice that the server-side API, the command-line interface, and the `.taunusrc` manifest are only concerned with providing a conventional shared-rendering MVC engine.\n\n    In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you're used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.\n\n    > In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.\n\n    Taunus attempts to bring the server-side mentality of _\"not doing everything is okay\"_ into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do **one thing well**.\n\n    In this brief article we'll recommend a couple different libraries that play well with Taunus, and you'll also learn how to search for modules that can give you access to other functionality you may be interested in.\n\n    # Using `dominus` for DOM querying\n\n    [Dominus][2] is an extra-small DOM querying library, currently clocking around **4kB minified and gzipped**, almost _ten times smaller_ than it's competition. Unlike jQuery and popular friends, Dominus doesn't provide AJAX features, layout math, `<form>` manipulation, promises, tens of event binding methods, a selector engine written in plain JavaScript, nor a myriad of utility functions. Instead, Dominus focuses solely on providing a rich DOM querying and manipulation API that gets rid of inconsistencies across browsers.\n\n    While the API isn't exactly compatible with jQuery, it is definitely familiar to the jQuery adept. Chaining, versatility, expressiveness, and raw power are all core concerns for Dominus. You'll find that Dominus has more consistently named methods, given that it was built with a concise API in mind.\n\n    There's a few differences in semantics, and I believe that's a good thing. For instance, if you do `.value` on a checkbox or radio button you'll get back whether the input is checked. Similarly, if you call `.text` on the input you'll get the text back, which is most often what you wanted to get.\n\n    ```js\n    var a = require('dominus');\n    var b = jQuery;\n\n    a('<input>').attr({ type: 'radio', value: 'Foo' }).text();\n    // <- 'Foo'\n\n    a('<input>').attr({ type: 'radio', checked: true }).value();\n    // <- true\n\n    b('<input>').attr({ type: 'radio', value: 'Foo' }).text();\n    // <- ''\n\n    b('<input>').attr({ type: 'radio', checked: true }).val();\n    // <- 'Foo'\n    ```\n\n    One of the best aspects of Dominus, _besides its small size_, is the fact that it extends native JavaScript arrays _(using [`poser`][5])_. That means you have access to all of the `Array` functional methods on any `Dominus` collections, such as `.forEach`, `.map`, `.filter`, `.sort` and so on.\n\n    Taunus doesn't make any extensive DOM manipulation _(nor querying)_ and doesn't need to use Dominus, but it may find a home in your application.\n\n    You can check out the _complete API documentation_ for `dominus` on [its GitHub repository][2].\n\n    # Using `xhr` to make AJAX requests\n\n    A small program called [`xhr`][4] can be used to make AJAX requests and it's bundled with Taunus, because it needs it internally to communicate with the server. As such, it was trivial for Taunus to expose this engine and give you the ability to make AJAX calls of your own using it as well.\n\n    You can check out [the API documentation][6] for an explanation of how our interface to `xhr` works, or you could also [see their API documentation][4] and use that directly instead.\n\n    # Complementing your code with small modules\n\n    There's an infinite number of modules that do just one thing well and are eager to be part of your applications. Leverage the Internet to find what you need. Small libraries tend to be better documented, concise to use, and simpler.\n\n    Here's a few examples of modules you could consider.\n\n    - [`vue`][12] gives you MVVM capabilities\n    - [`observe-js`][7] to get data-binding\n    - [`virtual-dom`][8] to use a virtual DOM diffing algorithm a la [Facebook React][9]\n    - [`hint`][10] progressively enhances your HTML giving you more colorful tooltips\n    - [`rome`][11] is a small calendar component\n\n    You can look for relevant modules using [BrowserifySearch.org][13], the [`npm` search][14], asking around on Twitter, or just by Googling!\n\n    [1]: /api\n    [2]: https://github.com/bevacqua/dominus\n    [4]: https://github.com/Raynos/xhr\n    [5]: https://github.com/bevacqua/poser\n    [6]: /api#-taunus-xhr-url-options-done-\n    [7]: https://github.com/polymer/observe-js\n    [8]: https://github.com/Matt-Esch/virtual-dom\n    [9]: https://github.com/facebook/react\n    [10]: https://github.com/bevacqua/hint\n    [11]: https://github.com/bevacqua/rome\n    [12]: https://github.com/bevacqua/hint\n    [13]: http://browserifysearch.org/\n    [14]: https://www.npmjs.org/\n    [15]: https://github.com/yyx990803/vue\n");
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
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#compiling-your-client-side-javascript\">Compiling your client-side JavaScript</a></li>\n<li><a href=\"#using-the-client-side-taunus-api\">Using the client-side Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n<li><a href=\"#versioning\">Versioning</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n<p>There&#39;s also <a href=\"https://github.com/taunus/generator-taunus\">a Yeoman generator named <code>generator-taunus</code></a> you could use to get started, instead.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">mkdir getting-started\ncd getting-started\nnpm init\nnpm install --save taunus taunus-express express\n</code></pre>\n<p><img src=\"http://i.imgur.com/4P8vNe9.png\" alt=\"Screenshot with `npm init` output\"></p>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/n8mH4mN.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>routes</code> should be an array of view routes</li>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that <a href=\"/api\">in the API documentation</a>, but it defaults to <code>{}</code>)</em>.</p>\n<p>Here&#39;s what you&#39;d get if you attempted to run the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/08lnCec.png\" alt=\"Screenshot with `node app` results\"></p>\n<p>Turns out you&#39;re missing a lot of things! Taunus is quite lenient and it&#39;ll try its best to let you know what you might be missing, though. Apparently you don&#39;t have a layout, a server-side controller, or even a view! <em>That&#39;s rough.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;use the following combination of plain text and the <strong>(maybe HTML)</strong> partial view&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return &#39;This is the partial: &quot;&#39; + model.partial + &#39;&quot;&#39;;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Here&#39;s what you&#39;d get if you ran the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/wUbnCyk.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>At this point we have a layout, but we&#39;re still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you&#39;re trying to get an MVC engine up and running, right?</p>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">mkdir -p views/home\ntouch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install --global jadum\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/zjaJYCq.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>Granted, you should <em>probably</em> move the layout into a Jade <em>(any view engine will do)</em> template as well.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">mkdir -p controllers/home\ntouch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template!</p>\n<pre><code class=\"lang-shell\">rm layout.js\ntouch views/layout.jade\njadum views/** --output .bin\n</code></pre>\n<p>You should also remember to update the <code>app.js</code> module once again!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The <code>!=</code> syntax below means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/NvEWx9z.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>You can now visit <code>localhost:3000</code> with your favorite web browser and you&#39;ll notice that the view renders as you&#39;d expect. The title will be properly set, and a <code>&lt;main&gt;</code> element will have the contents of your view.</p>\n<p><img src=\"http://i.imgur.com/LgZRFn5.png\" alt=\"Screenshot with application running on Google Chrome\"></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>Then there&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install --global taunus\n</code></pre>\n<p>Before you can use the CLI, you should move the route definitions to <code>controllers/routes.js</code>. That&#39;s where Taunus expects them to be. If you want to place them something else, <a href=\"/api\">the API documentation can help you</a>.</p>\n<pre><code class=\"lang-shell\">mv routes.js controllers/routes.js\n</code></pre>\n<p>Since you moved the routes you should also update the <code>require</code> statement in the <code>app.js</code> module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;),\n  &#39;layout&#39;: require(&#39;./views/layout.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = [\n  {\n    route: &#39;/&#39;,\n    action: &#39;home/index&#39;\n  }\n];\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p><img src=\"http://i.imgur.com/fIEe5Tm.png\" alt=\"Screenshot with `taunus` output\"></p>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<blockquote>\n<p><strong>The CLI can be entirely ignored</strong>. You could write these definitions by yourself, but you would have to remember to update the wiring module whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n</blockquote>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use <code>client/js</code> to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let&#39;s stick to the conventions.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js\ntouch client/js/main.js\n</code></pre>\n<p>The <code>main</code> module will be used as the <em>entry point</em> of your application on the client-side. Here you&#39;ll need to import <code>taunus</code>, the wiring module we&#39;ve just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke <code>taunus.mount</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar wiring = require(&#39;../../.bin/wiring&#39;);\nvar main = document.getElementsByTagName(&#39;main&#39;)[0];\n\ntaunus.mount(main, wiring);\n</code></pre>\n<p>The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.</p>\n<p>By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won&#39;t be functional until the client-side controller runs.</p>\n<p>An alternative is to inline the view model alongside the views in a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag, but this tends to slow down the initial response (models are <em>typically larger</em> than the resulting views).</p>\n<p>A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that&#39;s harder to set up.</p>\n<p>The three booting strategies are explained in <a href=\"/api\">the API documentation</a> and further discussed in <a href=\"/performance\">the optimization guide</a>. For now, the default strategy <em>(<code>&#39;auto&#39;</code>)</em> should suffice. It fetches the view model using an AJAX request right after Taunus loads.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>Client-side controllers run whenever a view is rendered, even if it&#39;s a partial. The controller is passed the <code>model</code>, containing the model that was used to render the view; the <code>route</code>, broken down into its components; and the <code>container</code>, which is whatever DOM element the view was rendered into.</p>\n<p>These controllers are entirely optional, which makes sense since we&#39;re progressively enhancing the application: it might not even be necessary! Let&#39;s add some client-side functionality to the example we&#39;ve been building.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js/controllers/home\ntouch client/js/controllers/home/index.js\n</code></pre>\n<p>Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we&#39;ll just print the action and the model to the console. If there&#39;s one place where you&#39;d want to enhance the experience, client-side controllers are where you want to put your code.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model, container, route) {\n  console.log(&#39;Rendered view %s using model:\\n%s&#39;, route.action, JSON.stringify(model, null, 2));\n};\n</code></pre>\n<p>Since we weren&#39;t using the <code>--watch</code> flag from the Taunus CLI, you&#39;ll have to recompile the wiring at this point, so that the controller gets added to that manifest.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>Of course, you&#39;ll now have to wire up the client-side JavaScript using <a href=\"http://browserify.org/\">Browserify</a>!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"compiling-your-client-side-javascript\">Compiling your client-side JavaScript</h4>\n<p>You&#39;ll need to compile the <code>client/js/main.js</code> module, our client-side application&#39;s entry point, using Browserify since the code is written using CommonJS. In this example you&#39;ll install <code>browserify</code> globally to compile the code, but naturally you&#39;ll install it locally when working on a real-world application.</p>\n<pre><code class=\"lang-shell\">npm install --global browserify\n</code></pre>\n<p>Once you have the Browserify CLI, you&#39;ll be able to compile the code right from your command line. The <code>-d</code> flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The <code>-o</code> flag redirects output to the indicated file, whereas the output is printed to standard output by default.</p>\n<pre><code class=\"lang-shell\">mkdir -p .bin/public/js\nbrowserify client/js/main.js -do .bin/public/js/all.js\n</code></pre>\n<p>We haven&#39;t done much of anything with the Express application, so you&#39;ll need to adjust the <code>app.js</code> module to serve static assets. If you&#39;re used to Express, you&#39;ll notice there&#39;s nothing special about how we&#39;re using <code>serve-static</code>.</p>\n<pre><code class=\"lang-shell\">npm install --save serve-static\n</code></pre>\n<p>Let&#39;s configure the application to serve static assets from <code>.bin/public</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar serveStatic = require(&#39;serve-static&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\napp.use(serveStatic(&#39;.bin/public&#39;));\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Next up, you&#39;ll have to edit the layout to include the compiled JavaScript bundle file.</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\nscript(src=&#39;/js/all.js&#39;)\n</code></pre>\n<p>Lastly, you can execute the application and see it in action!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/68O84wX.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>If you open the application on a web browser, you&#39;ll notice that the appropriate information will be logged into the developer <code>console</code>.</p>\n<p><img src=\"http://i.imgur.com/ZUF6NFl.png\" alt=\"Screenshot with the application running under Google Chrome\"></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-client-side-taunus-api\">Using the client-side Taunus API</h4>\n<p>Taunus does provide <a href=\"/api\">a thin API</a> in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there&#39;s a few methods you can take advantage of on a global scale as well.</p>\n<p>Taunus can notify you whenever important events occur.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Besides events, there&#39;s a couple more methods you can use. The <code>taunus.navigate</code> method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there&#39;s <code>taunus.partial</code>, and that allows you to render any partial view on a DOM element of your choosing, and it&#39;ll then invoke its controller. You&#39;ll need to come up with the model yourself, though.</p>\n<p>Astonishingly, the API is further documented in <a href=\"/api\">the API documentation</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p><a href=\"/performance\">Performance</a> plays an important role in Taunus. That&#39;s why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?</p>\n<p>When turned on, by passing <code>{ cache: true }</code> as the third parameter for <code>taunus.mount</code>, the caching layer will make sure that responses are kept around for <code>15</code> seconds. Whenever a route needs a model in order to render a view, it&#39;ll first ask the caching layer for a fresh copy. If the caching layer doesn&#39;t have a copy, or if that copy is stale <em>(in this case, older than <code>15</code> seconds)</em>, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set <code>cache</code> to a number in seconds instead of just <code>true</code>.</p>\n<p>Since Taunus understands that not every view operates under the same constraints, you&#39;re also able to set a <code>cache</code> freshness duration directly in your routes. The <code>cache</code> property in routes has precedence over the default value.</p>\n<p>There&#39;s currently two caching stores: a raw in-memory store, and an <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">IndexedDB</a> store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of <code>localStorage</code>. It has <a href=\"http://caniuse.com/#feat=indexeddb\">surprisingly broad browser support</a>, and in the cases where it&#39;s not supported then caching is done solely in-memory.</p>\n<p>The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them <em>(the <code>touchstart</code> event)</em>, the prefetcher will issue an AJAX request for the view model for that link.</p>\n<p>If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their <em>(possibly limited)</em> Internet connection bandwidth.</p>\n<p>If the human clicks on the link before prefetching is completed, he&#39;ll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.</p>\n<p>Turning prefetching on is simply a matter of setting <code>prefetch</code> to <code>true</code> in the options passed to <code>taunus.mount</code>. For additional insights into the performance improvements Taunus can offer, head over to the <a href=\"/performance\">Performance Optimizations</a> guide.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"versioning\">Versioning</h4>\n<p>When you alter your views, change controllers, or modify the models, chances are the client-side is going to come across one of the following issues.</p>\n<ul>\n<li>Outdated view template functions in the client-side, causing new models to break</li>\n<li>Outdated client-side controllers, causing new models to break or miss out on functionality</li>\n<li>Outdated models in the cache, causing new views or controllers to break</li>\n</ul>\n<p>Versioning handles these issues gracefully on your behalf. The way it works is that whenever you get a response from Taunus, a <em>version string (configured on the server-side)</em> is included with it. If that version string doesn&#39;t match the one stored in the client, then the cache will be flushed and the human will be redirected, forcing a full page reload.</p>\n<blockquote>\n<p>The versioning API is unable to handle changes to routes, and it&#39;s up to you to make sure that the application stays backwards compatible when it comes to routing.</p>\n<p>Versioning can&#39;t intervene when the client-side is heavily relying on cached views and models, and the human is refusing to reload their browser. The server isn&#39;t being accessed and thus it can&#39;t communicate that everything on the cache may have become stale. The good news is that the human won&#39;t notice any oddities, as the site will continue to work as he knows it. When he finally attempts to visit something that isn&#39;t cached, a request is made, and the versioning engine resolves version discrepancies for them.</p>\n</blockquote>\n<p>Making use of versioning involves setting the <code>version</code> field in the options, when invoking <code>taunus.mount</code> <strong>on both the server-side and the client-side, using the same value</strong>. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.</p>\n<p>You may use your build identifier or the <code>version</code> field in <code>package.json</code>, but understand that it may cause the client-side to flush the cache too often <em>(maybe even on every deployment)</em>.</p>\n<p>The default version string is set to <code>1</code>. The Taunus version will be prepended to yours, resulting in a value such as <code>t3.0.0;v1</code> where Taunus is running version <code>3.0.0</code> and your application is running version <code>1</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<blockquote>\n<p>You&#39;ll find a <a href=\"https://github.com/taunus/getting-started\">full fledged version of the Getting Started</a> tutorial application on GitHub.</p>\n</blockquote>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Your first route](#your-first-route)\n      - [Creating a layout](#creating-a-layout)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Compiling your client-side JavaScript](#compiling-your-client-side-javascript)\n      - [Using the client-side Taunus API](#using-the-client-side-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n      - [Versioning](#versioning)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n    >\n    > There's also [a Yeoman generator named `generator-taunus`][42] you could use to get started, instead.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    mkdir getting-started\n    cd getting-started\n    npm init\n    npm install --save taunus taunus-express express\n    ```\n\n    ![Screenshot with `npm init` output][30]\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][31]\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `routes` should be an array of view routes\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that [in the API documentation][18], but it defaults to `{}`)_.\n\n    Here's what you'd get if you attempted to run the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` results][32]\n\n    Turns out you're missing a lot of things! Taunus is quite lenient and it'll try its best to let you know what you might be missing, though. Apparently you don't have a layout, a server-side controller, or even a view! _That's rough._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"use the following combination of plain text and the **(maybe HTML)** partial view\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return 'This is the partial: \"' + model.partial + '\"';\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Here's what you'd get if you ran the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][33]\n\n    At this point we have a layout, but we're still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you're trying to get an MVC engine up and running, right?\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    mkdir -p views/home\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install --global jadum\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][34]\n\n    Granted, you should _probably_ move the layout into a Jade _(any view engine will do)_ template as well.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    mkdir -p controllers/home\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template!\n\n    ```shell\n    rm layout.js\n    touch views/layout.jade\n    jadum views/** --output .bin\n    ```\n\n    You should also remember to update the `app.js` module once again!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The `!=` syntax below means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][35]\n\n    You can now visit `localhost:3000` with your favorite web browser and you'll notice that the view renders as you'd expect. The title will be properly set, and a `<main>` element will have the contents of your view.\n\n    ![Screenshot with application running on Google Chrome][36]\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    Then there's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install --global taunus\n    ```\n\n    Before you can use the CLI, you should move the route definitions to `controllers/routes.js`. That's where Taunus expects them to be. If you want to place them something else, [the API documentation can help you][18].\n\n    ```shell\n    mv routes.js controllers/routes.js\n    ```\n\n    Since you moved the routes you should also update the `require` statement in the `app.js` module.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js'),\n      'layout': require('./views/layout.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = [\n      {\n        route: '/',\n        action: 'home/index'\n      }\n    ];\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    ![Screenshot with `taunus` output][37]\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    > **The CLI can be entirely ignored**. You could write these definitions by yourself, but you would have to remember to update the wiring module whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use `client/js` to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let's stick to the conventions.\n\n    ```shell\n    mkdir -p client/js\n    touch client/js/main.js\n    ```\n\n    The `main` module will be used as the _entry point_ of your application on the client-side. Here you'll need to import `taunus`, the wiring module we've just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke `taunus.mount`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var wiring = require('../../.bin/wiring');\n    var main = document.getElementsByTagName('main')[0];\n\n    taunus.mount(main, wiring);\n    ```\n\n    The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.\n\n    By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won't be functional until the client-side controller runs.\n\n    An alternative is to inline the view model alongside the views in a `<script type='text/taunus'>` tag, but this tends to slow down the initial response (models are _typically larger_ than the resulting views).\n\n    A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that's harder to set up.\n\n    The three booting strategies are explained in [the API documentation][18] and further discussed in [the optimization guide][25]. For now, the default strategy _(`'auto'`)_ should suffice. It fetches the view model using an AJAX request right after Taunus loads.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    Client-side controllers run whenever a view is rendered, even if it's a partial. The controller is passed the `model`, containing the model that was used to render the view; the `route`, broken down into its components; and the `container`, which is whatever DOM element the view was rendered into.\n\n    These controllers are entirely optional, which makes sense since we're progressively enhancing the application: it might not even be necessary! Let's add some client-side functionality to the example we've been building.\n\n    ```shell\n    mkdir -p client/js/controllers/home\n    touch client/js/controllers/home/index.js\n    ```\n\n    Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we'll just print the action and the model to the console. If there's one place where you'd want to enhance the experience, client-side controllers are where you want to put your code.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model, container, route) {\n      console.log('Rendered view %s using model:\\n%s', route.action, JSON.stringify(model, null, 2));\n    };\n    ```\n\n    Since we weren't using the `--watch` flag from the Taunus CLI, you'll have to recompile the wiring at this point, so that the controller gets added to that manifest.\n\n    ```shell\n    taunus --output\n    ```\n\n    Of course, you'll now have to wire up the client-side JavaScript using [Browserify][38]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Compiling your client-side JavaScript\n\n    You'll need to compile the `client/js/main.js` module, our client-side application's entry point, using Browserify since the code is written using CommonJS. In this example you'll install `browserify` globally to compile the code, but naturally you'll install it locally when working on a real-world application.\n\n    ```shell\n    npm install --global browserify\n    ```\n\n    Once you have the Browserify CLI, you'll be able to compile the code right from your command line. The `-d` flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The `-o` flag redirects output to the indicated file, whereas the output is printed to standard output by default.\n\n    ```shell\n    mkdir -p .bin/public/js\n    browserify client/js/main.js -do .bin/public/js/all.js\n    ```\n\n    We haven't done much of anything with the Express application, so you'll need to adjust the `app.js` module to serve static assets. If you're used to Express, you'll notice there's nothing special about how we're using `serve-static`.\n\n    ```shell\n    npm install --save serve-static\n    ```\n\n    Let's configure the application to serve static assets from `.bin/public`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var serveStatic = require('serve-static');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    app.use(serveStatic('.bin/public'));\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Next up, you'll have to edit the layout to include the compiled JavaScript bundle file.\n\n    ```jade\n    title=model.title\n    main!=partial\n    script(src='/js/all.js')\n    ```\n\n    Lastly, you can execute the application and see it in action!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][39]\n\n    If you open the application on a web browser, you'll notice that the appropriate information will be logged into the developer `console`.\n\n    ![Screenshot with the application running under Google Chrome][40]\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the client-side Taunus API\n\n    Taunus does provide [a thin API][18] in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there's a few methods you can take advantage of on a global scale as well.\n\n    Taunus can notify you whenever important events occur.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Besides events, there's a couple more methods you can use. The `taunus.navigate` method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there's `taunus.partial`, and that allows you to render any partial view on a DOM element of your choosing, and it'll then invoke its controller. You'll need to come up with the model yourself, though.\n\n    Astonishingly, the API is further documented in [the API documentation][18].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    [Performance][25] plays an important role in Taunus. That's why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?\n\n    When turned on, by passing `{ cache: true }` as the third parameter for `taunus.mount`, the caching layer will make sure that responses are kept around for `15` seconds. Whenever a route needs a model in order to render a view, it'll first ask the caching layer for a fresh copy. If the caching layer doesn't have a copy, or if that copy is stale _(in this case, older than `15` seconds)_, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set `cache` to a number in seconds instead of just `true`.\n\n    Since Taunus understands that not every view operates under the same constraints, you're also able to set a `cache` freshness duration directly in your routes. The `cache` property in routes has precedence over the default value.\n\n    There's currently two caching stores: a raw in-memory store, and an [IndexedDB][28] store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of `localStorage`. It has [surprisingly broad browser support][29], and in the cases where it's not supported then caching is done solely in-memory.\n\n    The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them _(the `touchstart` event)_, the prefetcher will issue an AJAX request for the view model for that link.\n\n    If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their _(possibly limited)_ Internet connection bandwidth.\n\n    If the human clicks on the link before prefetching is completed, he'll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.\n\n    Turning prefetching on is simply a matter of setting `prefetch` to `true` in the options passed to `taunus.mount`. For additional insights into the performance improvements Taunus can offer, head over to the [Performance Optimizations][25] guide.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Versioning\n\n    When you alter your views, change controllers, or modify the models, chances are the client-side is going to come across one of the following issues.\n\n    - Outdated view template functions in the client-side, causing new models to break\n    - Outdated client-side controllers, causing new models to break or miss out on functionality\n    - Outdated models in the cache, causing new views or controllers to break\n\n    Versioning handles these issues gracefully on your behalf. The way it works is that whenever you get a response from Taunus, a _version string (configured on the server-side)_ is included with it. If that version string doesn't match the one stored in the client, then the cache will be flushed and the human will be redirected, forcing a full page reload.\n\n    > The versioning API is unable to handle changes to routes, and it's up to you to make sure that the application stays backwards compatible when it comes to routing.\n    >\n    > Versioning can't intervene when the client-side is heavily relying on cached views and models, and the human is refusing to reload their browser. The server isn't being accessed and thus it can't communicate that everything on the cache may have become stale. The good news is that the human won't notice any oddities, as the site will continue to work as he knows it. When he finally attempts to visit something that isn't cached, a request is made, and the versioning engine resolves version discrepancies for them.\n\n    Making use of versioning involves setting the `version` field in the options, when invoking `taunus.mount` **on both the server-side and the client-side, using the same value**. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.\n\n    You may use your build identifier or the `version` field in `package.json`, but understand that it may cause the client-side to flush the cache too often _(maybe even on every deployment)_.\n\n    The default version string is set to `1`. The Taunus version will be prepended to yours, resulting in a value such as `t3.0.0;v1` where Taunus is running version `3.0.0` and your application is running version `1`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    > You'll find a [full fledged version of the Getting Started][41] tutorial application on GitHub.\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n    [28]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [29]: http://caniuse.com/#feat=indexeddb\n    [30]: http://i.imgur.com/4P8vNe9.png\n    [31]: http://i.imgur.com/n8mH4mN.png\n    [32]: http://i.imgur.com/08lnCec.png\n    [33]: http://i.imgur.com/wUbnCyk.png\n    [34]: http://i.imgur.com/zjaJYCq.png\n    [35]: http://i.imgur.com/NvEWx9z.png\n    [36]: http://i.imgur.com/LgZRFn5.png\n    [37]: http://i.imgur.com/fIEe5Tm.png\n    [38]: http://browserify.org/\n    [39]: http://i.imgur.com/68O84wX.png\n    [40]: http://i.imgur.com/ZUF6NFl.png\n    [41]: https://github.com/taunus/getting-started\n    [42]: https://github.com/taunus/generator-taunus\n");
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
buf.push("<h1 id=\"performance-optimization\">Performance Optimization</h1>\n<p>Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on the site as well.</p>\n<p>There&#39;s a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.</p>\n<h1 id=\"performance-checklist\">Performance Checklist</h1>\n<p>If you haven&#39;t, you should read <a href=\"http://ponyfoo.com/articles/critical-path-performance-optimization\">&quot;Critical Path Performance Optimization&quot;</a> as a small guide of performance optimizations you should already be doing. The list below contains some of what&#39;s discussed in that article.</p>\n<ul>\n<li>Move away from dedicated client-side rendering</li>\n<li>Use <a href=\"http://nginx.org/\"><code>nginx</code></a> as a reverse proxy for your front-end servers</li>\n<li>Resize and optimize images</li>\n<li>Defer non-critical static asset loading</li>\n<li>Inline critical CSS and JavaScript</li>\n<li>Cache responses aggressively</li>\n<li>Ditch large libraries and frameworks</li>\n</ul>\n<h1 id=\"boosting-performance-with-taunus\">Boosting Performance with Taunus</h1>\n<p>When it comes to Taunus, there&#39;s a few more performance tweaks you should consider implementing.</p>\n<ul>\n<li>Choose the right boot strategy</li>\n<li>Turn on client-side caching</li>\n<li>Enable prefetching for predictive cache loading</li>\n<li>Use versioning to ensure cache relevance</li>\n<li>Send views and controllers to the client selectively</li>\n</ul>\n<p>Given that this site is about Taunus, we&#39;ll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.</p>\n<h1 id=\"choose-the-right-boot-strategy\">Choose the right boot strategy</h1>\n<p><em>(UNDER CONSTRUCTION)</em></p>\n<h1 id=\"turn-on-client-side-caching\">Turn on client-side caching</h1>\n<p><em>(UNDER CONSTRUCTION)</em></p>\n<h1 id=\"enable-prefetching-for-predictive-cache-loading\">Enable prefetching for predictive cache loading</h1>\n<p><em>(UNDER CONSTRUCTION)</em></p>\n<h1 id=\"use-versioning-to-ensure-cache-relevance\">Use versioning to ensure cache relevance</h1>\n<p><em>(UNDER CONSTRUCTION)</em></p>\n<h1 id=\"send-views-and-controllers-to-the-client-selectively\">Send views and controllers to the client selectively</h1>\n<p><em>(UNDER CONSTRUCTION)</em></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Performance Optimization\n\n    Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on the site as well.\n\n    There's a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.\n\n    # Performance Checklist\n\n    If you haven't, you should read [\"Critical Path Performance Optimization\"][1] as a small guide of performance optimizations you should already be doing. The list below contains some of what's discussed in that article.\n\n    - Move away from dedicated client-side rendering\n    - Use [`nginx`][2] as a reverse proxy for your front-end servers\n    - Resize and optimize images\n    - Defer non-critical static asset loading\n    - Inline critical CSS and JavaScript\n    - Cache responses aggressively\n    - Ditch large libraries and frameworks\n\n    # Boosting Performance with Taunus\n\n    When it comes to Taunus, there's a few more performance tweaks you should consider implementing.\n\n    - Choose the right boot strategy\n    - Turn on client-side caching\n    - Enable prefetching for predictive cache loading\n    - Use versioning to ensure cache relevance\n    - Send views and controllers to the client selectively\n\n    Given that this site is about Taunus, we'll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.\n\n    # Choose the right boot strategy\n\n    _(UNDER CONSTRUCTION)_\n\n    # Turn on client-side caching\n\n    _(UNDER CONSTRUCTION)_\n\n    # Enable prefetching for predictive cache loading\n\n    _(UNDER CONSTRUCTION)_\n\n    # Use versioning to ensure cache relevance\n\n    _(UNDER CONSTRUCTION)_\n\n    # Send views and controllers to the client selectively\n\n    _(UNDER CONSTRUCTION)_\n\n    [1]: http://ponyfoo.com/articles/critical-path-performance-optimization\n    [2]: http://nginx.org/\n");
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

var routes = [
  {
    route: '/',
    action: 'documentation/about'
  },
  {
    route: '/getting-started',
    action: 'documentation/getting-started'
  },
  {
    route: '/api',
    action: 'documentation/api'
  },
  {
    route: '/complements',
    action: 'documentation/complements'
  },
  {
    route: '/performance',
    action: 'documentation/performance'
  },
  {
    route: '/source-code',
    ignore: true
  },
  {
    route: '/changelog',
    ignore: true
  },
  {
    route: '/:catchall*',
    action: 'error/not-found'
  }
];

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

},{"./throttle":17,"dominus":26,"raf":33,"taunus":45}],16:[function(require,module,exports){
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
},{"../../.bin/wiring":13,"./conventions":15,"dominus":26,"taunus":45}],17:[function(require,module,exports){
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
  var hash = name && typeof name === 'object';
  var set = hash ? setMany : setSingle;
  var setter = hash || arguments.length > 1;
  if (setter) {
    this.forEach(set);
    return this;
  } else {
    return this.length ? dom.getAttr(this[0], name) : null;
  }
  function setMany (elem) {
    dom.manyAttr(elem, name);
  }
  function setSingle (elem) {
    dom.attr(elem, name, value);
  }
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
  var camel = text.hyphenToCamel(name);
  if (camel in elem) {
    elem[camel] = value;
  } else if (value === null || value === void 0) {
    elem.removeAttribute(name);
  } else {
    elem.setAttribute(name, value);
  }
};

api.getAttr = function (elem, name) {
  var camel = text.hyphenToCamel(name);
  if (camel in elem) {
    return elem[camel];
  } else {
    return elem.getAttribute(name);
  }
};

api.manyAttr = function (elem, attrs) {
  Object.keys(attrs).forEach(function (attr) {
    api.attr(elem, attr, attrs[attr]);
  });
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
(function (global){
'use strict';

var raf = require('raf');
var clone = require('./clone');
var emitter = require('./emitter');
var fetcher = require('./fetcher');
var view = require('./view');
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
      global.DEBUG && global.DEBUG('[activator] redirecting to %s', url);
      location.href = url;
    }
    return;
  }

  var same = router.equals(route, state.route);
  if (same && o.force !== true) {
    if (route.parts.hash) {
      global.DEBUG && global.DEBUG('[activator] same route and hash, updating scroll position');
      scrollInto(id(route.parts.hash), o.scroll);
      navigation(route, state.model, direction);
      return; // anchor hash-navigation on same page ignores router
    }
    global.DEBUG && global.DEBUG('[activator] same route, resolving');
    resolved(state.model);
    return;
  }

  if (!modern) {
    global.DEBUG && global.DEBUG('[activator] not modern, redirecting to %s', url);
    location.href = url;
    return;
  }

  global.DEBUG && global.DEBUG('[activator] fetching %s', route.url);
  fetcher.abortPending();
  fetcher(route, { element: context, source: 'intent' }, maybeResolved);

  function maybeResolved (err, data) {
    if (err) {
      return;
    }
    if (data.version !== state.version) {
      global.DEBUG && global.DEBUG('[activator] version change (is "%s", was "%s"), redirecting to %s', data.version, state.version, url);
      location.href = url; // version change demands fallback to strict navigation
      return;
    }
    console.log(data.model);
    resolved(data.model);
  }

  function resolved (model) {
    navigation(route, model, direction);
    view(state.container, null, model, route);
    scrollInto(id(route.parts.hash), o.scroll);
  }
}

function start (data) {
  if (data.version !== state.version) {
    global.DEBUG && global.DEBUG('[activator] version change, reloading browser');
    location.reload(); // version may change between Taunus loading and a model becoming available
    return;
  }
  var model = data.model;
  var route = replaceWith(model);
  emitter.emit('start', state.container, model, route);
  global.DEBUG && global.DEBUG('[activator] started, executing client-side controller');
  view(state.container, null, model, route, { render: false });
  window.onpopstate = back;
}

function back (e) {
  var empty = !(e && e.state && e.state.model);
  if (empty) {
    return;
  }
  global.DEBUG && global.DEBUG('[activator] backwards history navigation with state', e.state);
  var model = e.state.model;
  var route = replaceWith(model);
  view(state.container, null, model, route);
  scrollInto(id(route.parts.hash));
}

function scrollInto (id, enabled) {
  if (enabled === false || !id) {
    return;
  }
  global.DEBUG && global.DEBUG('[activator] scrolling into "%s"', id);
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
  global.DEBUG && global.DEBUG('[activator] pushing %s into history', route.url);
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

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../versioning":73,"./clone":38,"./emitter":41,"./fetcher":43,"./nativeFn":49,"./router":51,"./state":52,"./view":58,"raf":33}],36:[function(require,module,exports){
'use strict';

var clone = require('./clone');
var once = require('./once');
var state = require('./state');
var raw = require('./stores/raw');
var idb = require('./stores/idb');
var versioning = require('../versioning');
var stores = [raw, idb];

function get (type, key, done) {
  var i = 0;

  function next () {
    var gotOnce = once(got);
    var store = stores[i++];
    if (store) {
      store.get(type, key, gotOnce);
      setTimeout(gotOnce, store === idb ? 35 : 5); // at worst, spend 40ms on caching layers
    } else {
      done(true);
    }

    function got (err, item) {
      if (err) {
        next();
      } else if (valid(item)) {
        done(false, blob(item)); // always return a unique copy
      } else {
        next();
      }
    }

    function valid (item) {
      if (!item) {
        return false; // cache must have item
      }
      var mismatch = typeof item.version !== 'string' || item.version !== state.version;
      if (mismatch) {
        return false; // cache must match current version
      }
      var stale = typeof item.expires !== 'number' || Date.now() >= item.expires;
      if (stale) {
        return false; // cache must be fresh
      }
      return true;
    }

    function blob (item) {
      var singular = type.substr(0, type.length - 1);
      var data = clone(item.data);
      var response = {
        version: item.version
      };
      response[singular] = data;
      return response;
    }
  }

  next();
}

function set (type, key, data, duration) {
  if (duration < 1) { // sanity
    return;
  }
  var cloned = clone(data); // freeze a copy for our records
  stores.forEach(store);
  function store (s) {
    s.set(type, key, {
      data: cloned,
      version: state.version,
      expires: Date.now() + duration
    });
  }
}

module.exports = {
  get: get,
  set: set
};

},{"../versioning":73,"./clone":38,"./once":50,"./state":52,"./stores/idb":54,"./stores/raw":55}],37:[function(require,module,exports){
(function (global){
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
  global.DEBUG && global.DEBUG('[cache] attempting to intercept %s', e.route.url);
  cache.get('models', e.route.parts.path, result);

  function result (err, data) {
    global.DEBUG && global.DEBUG('[cache] interception for %s %s', e.route.url, err || !data ? 'failed' : 'succeeded');
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
  var target = context.hijacker || route.action;
  var freshness = parseDuration(d) * 1000;
  if ('model' in data) {
    global.DEBUG && global.DEBUG('[cache] saving model for %s', route.parts.path);
    cache.set('models', route.parts.path, data.model, freshness);
  }
  if ('template' in data) {
    global.DEBUG && global.DEBUG('[cache] saving template for %s', target);
    cache.set('templates', target, data.template, freshness);
  }
  if ('controller' in data) {
    global.DEBUG && global.DEBUG('[cache] saving controller for %s', target);
    cache.set('controllers', target, data.controller, freshness);
  }
}

function ready (fn) {
  if (state.cache) {
    idb.tested(fn); // wait on idb compatibility tests
  } else {
    fn(false); // caching is a no-op
  }
}

module.exports = {
  setup: setup,
  persist: persist,
  ready: ready
};

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./cache":36,"./emitter":41,"./interceptor":46,"./state":52,"./stores/idb":54}],38:[function(require,module,exports){
'use strict';

function clone (value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = clone;

},{}],39:[function(require,module,exports){
(function (global){
'use strict';

var state = require('./state');
var caching = require('./caching');
var unstrictEval = require('./unstrictEval');
var idb = require('./stores/idb');
var deferred = require('../lib/deferred');

function set (action, data) {
  store('template');
  store('controller');

  function store (key) {
    var type = key + 's';

    if (key in data) {
      push(type, action, data[key], data.version);
    }
  }
}

function refill () {
  caching.ready(pullComponents);
}

function pullComponents (enabled) {
  if (!enabled) { // bail if caching is turned off
    return;
  }
  idb.get('controllers', pull.bind(null, 'controllers'));
  idb.get('templates', pull.bind(null, 'templates'));
}

function pull (type, err, items) {
  if (err) {
    return;
  }
  items.forEach(pullItem);

  function pullItem (item) {
    push(type, item.key, item.data, item.version);
  }
}

function push (type, action, value, version) {
  var singular = type.substr(0, type.length - 1);
  var is = deferred(action, state.deferrals);
  if (is === false) {
    return;
  }
  if (version === state.version) {
    global.DEBUG && global.DEBUG('[componentCache] storing %s for %s in state', singular, action);
    state[type][action] = {
      fn: parse(singular, value),
      version: version
    };
  } else {
    global.DEBUG && global.DEBUG('[componentCache] bad version: %s !== %s', version, state.version);
  }
}

function parse (type, value) {
  if (value) {
    try {
      return unstrictEval(value);
    } catch (e) {
      global.DEBUG && global.DEBUG('[componentCache] %s eval failed', type, e);
    }
  }
}

module.exports = {
  set: set,
  refill: refill
};

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/deferred":60,"./caching":37,"./state":52,"./stores/idb":54,"./unstrictEval":57}],40:[function(require,module,exports){
(function (global){
'use strict';

var state = require('./state');
var deferred = require('../lib/deferred');

function needs (action) {
  var demands = [];
  var is = deferred(action, state.deferrals);
  if (is) {
    if (invalid('templates')) {
      demands.push('template');
    }
    if (invalid('controllers')) {
      demands.push('controller');
    }
  }

  function invalid (type) {
    var store = state[type];
    var fail = !store[action] || store[action].version !== state.version;
    if (fail) {
      global.DEBUG && global.DEBUG('[deferral] deferred %s %s not found', action, type.substr(0, type.length - 1));
      return true;
    }
    return false;
  }

  return demands;
}

module.exports = {
  needs: needs
};

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/deferred":60,"./state":52}],41:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');

module.exports = emitter({}, { throws: false });

},{"contra.emitter":61}],42:[function(require,module,exports){
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

},{}],43:[function(require,module,exports){
(function (global){
'use strict';

var xhr = require('./xhr');
var state = require('./state');
var router = require('./router');
var emitter = require('./emitter');
var deferral = require('./deferral');
var interceptor = require('./interceptor');
var componentCache = require('./componentCache');
var lastXhr = {};

function e (value) {
  return value || '';
}

function negotiate (route, context) {
  var parts = route.parts;
  var qs = e(parts.search);
  var p = qs ? '&' : '?';
  var target = context.hijacker || route.action;
  var demands = ['json'].concat(deferral.needs(target));
  if (context.hijacker && context.hijacker !== route.action) {
    demands.push('hijacker=' + context.hijacker);
  }
  return parts.pathname + qs + p + demands.join('&');
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

  global.DEBUG && global.DEBUG('[fetcher] requested %s', route.url);

  interceptor.execute(route, afterInterceptors);

  function afterInterceptors (err, result) {
    if (!err && result.defaultPrevented && !context.hijacker) {
      global.DEBUG && global.DEBUG('[fetcher] prevented %s with data', route.url, result.data);
      done(null, result.data);
    } else {
      emitter.emit('fetch.start', route, context);
      lastXhr[context.source] = xhr(negotiate(route, context), notify);
    }
  }

  function notify (err, data, res) {
    if (err) {
      global.DEBUG && global.DEBUG('[fetcher] failed for %s', route.url);
      if (err.message === 'aborted') {
        emitter.emit('fetch.abort', route, context);
      } else {
        emitter.emit('fetch.error', route, context, err);
      }
    } else {
      global.DEBUG && global.DEBUG('[fetcher] succeeded for %s', route.url);
      if (data && data.version) {
        state.version = data.version; // sync version expectation with server-side
        componentCache.set(router(res.url).parts.query.hijacker || route.action, data);
      }
      emitter.emit('fetch.done', route, context, data);
    }
    done(err, data);
  }
}

fetcher.abortPending = abortPending;

module.exports = fetcher;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./componentCache":39,"./deferral":40,"./emitter":41,"./interceptor":46,"./router":51,"./state":52,"./xhr":59}],44:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var links = require('./links');

function attach () {
  emitter.on('start', links);
}

module.exports = {
  attach: attach
};

},{"./emitter":41,"./links":47}],45:[function(require,module,exports){
(function (global){
'use strict';

global.DEBUG && global.DEBUG('[index] loading taunus');

if (global.taunus !== void 0) {
  throw new Error('Use require(\'taunus/global\') after the initial require(\'taunus\') statement!');
}

var state = require('./state');
var stateClear = require('./stateClear');
var interceptor = require('./interceptor');
var activator = require('./activator');
var emitter = require('./emitter');
var hooks = require('./hooks');
var view = require('./view');
var mount = require('./mount');
var router = require('./router');
var xhr = require('./xhr');

state.clear = stateClear;
hooks.attach();

module.exports = global.taunus = {
  mount: mount,
  partial: view.partial,
  on: emitter.on.bind(emitter),
  once: emitter.once.bind(emitter),
  off: emitter.off.bind(emitter),
  intercept: interceptor.add,
  navigate: activator.go,
  state: state,
  route: router,
  xhr: xhr
};

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./activator":35,"./emitter":41,"./hooks":44,"./interceptor":46,"./mount":48,"./router":51,"./state":52,"./stateClear":53,"./view":58,"./xhr":59}],46:[function(require,module,exports){
(function (global){
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
    data: null,
    canPreventDefault: true,
    defaultPrevented: false,
    preventDefault: once(preventDefault)
  };

  function preventDefault (data) {
    if (!e.canPreventDefault) {
      return;
    }
    e.canPreventDefault = false;
    e.defaultPrevented = true;
    e.data = data;
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

  global.DEBUG && global.DEBUG('[interceptor] executing for %s', route.url);

  interceptors.emit('*', e);
  interceptors.emit(route.action, e);

  setTimeout(fn, 50); // at worst, spend 50ms waiting on interceptors

  function preventDefaultEnds () {
    preventDefaultBase.apply(null, arguments);
    fn();
  }

  function end () {
    global.DEBUG && global.DEBUG('[interceptor] %s for %s', interceptors.count === 0 && 'skipped' || e.defaultPrevented && 'prevented' || 'timed out', route.url);
    e.canPreventDefault = false;
    done(null, e);
  }
}

module.exports = {
  add: add,
  execute: execute
};

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./once":50,"./router":51,"contra.emitter":61}],47:[function(require,module,exports){
(function (global){
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
    global.DEBUG && global.DEBUG('[links] listening for prefetching opportunities');
    events.add(document.body, 'mouseover', maybePrefetch);
    events.add(document.body, 'touchstart', maybePrefetch);
  }
  global.DEBUG && global.DEBUG('[links] listening for rerouting opportunities');
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
    global.DEBUG && global.DEBUG('[links] waiting on prefetcher for %s', route.url);
    clicksOnHold.push(anchor);
    return;
  }

  global.DEBUG && global.DEBUG('[links] navigating to %s', route.url);
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

  global.DEBUG && global.DEBUG('[links] prefetching %s', route.url);
  prefetching.push(anchor);
  fetcher(route, { element: anchor, source: 'prefetch' }, resolved);

  function resolved () {
    prefetching.splice(prefetching.indexOf(anchor), 1);
    if (clicksOnHold.indexOf(anchor) !== -1) {
      clicksOnHold.splice(clicksOnHold.indexOf(anchor), 1);

      global.DEBUG && global.DEBUG('[links] prefetcher resumed %s', route.url);
      activator.go(route.url, { context: anchor });
    }
  }
}

module.exports = links;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./activator":35,"./events":42,"./fetcher":43,"./router":51,"./state":52}],48:[function(require,module,exports){
(function (global){
'use strict';

var unescape = require('./unescape');
var state = require('./state');
var router = require('./router');
var activator = require('./activator');
var caching = require('./caching');
var componentCache = require('./componentCache');
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
  if (!o.bootstrap) { o.bootstrap = 'auto'; }

  mounted = true;

  global.DEBUG && global.DEBUG('[mount] mountpoint invoked using "%s" strategy', o.bootstrap);

  state.container = container;
  state.controllers = wiring.controllers;
  state.templates = wiring.templates;
  state.routes = wiring.routes;
  state.deferrals = wiring.deferrals || [];
  state.prefetch = !!o.prefetch;
  state.version = versioning.get(o.version || '1');

  router.setup(wiring.routes);

  var url = location.pathname;
  var query = orEmpty(location.search) + orEmpty(location.hash);
  var route = router(url + query);

  caching.setup(o.cache, route);
  caching.ready(kickstart);
  componentCache.refill();

  function kickstart () {
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
      throw new Error('Fetching JSON data model failed at mountpoint.');
    }
    boot(data);
  }

  function inlineboot () {
    var id = container.getAttribute('data-taunus');
    var script = document.getElementById(id);
    var data = JSON.parse(unescape(script.innerText || script.textContent));
    boot(data);
  }

  function manualboot () {
    if (typeof g.taunusReady === 'function') {
      g.taunusReady = boot; // not yet an object? turn it into the boot method
    } else if (g.taunusReady && typeof g.taunusReady === 'object') {
      boot(g.taunusReady); // already an object? boot with that as the data object
    } else {
      throw new Error('Did you forget to add the taunusReady global?');
    }
  }

  function boot (data) {
    if (booted) { // sanity
      return;
    }

    global.DEBUG && global.DEBUG('[mount] mountpoint booted with data', data);

    if (!data) {
      throw new Error('Taunus data is required! Boot failed');
    }
    if (!data.version) {
      throw new Error('Version data is missing! Boot failed');
    }
    if (!data.model || typeof data.model !== 'object') {
      throw new Error('Taunus model must be an object! Boot failed');
    }
    booted = true;
    caching.persist(route, state.container, data);
    activator.start(data);
  }
}

module.exports = mount;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../versioning":73,"./activator":35,"./caching":37,"./componentCache":39,"./fetcher":43,"./router":51,"./state":52,"./unescape":56}],49:[function(require,module,exports){
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

},{}],50:[function(require,module,exports){
'use strict';

module.exports = function disposable (fn) {
  var used;
  return function once () {
    if (used) { return; } used = true;
    return fn.apply(this, arguments);
  };
};

},{}],51:[function(require,module,exports){
(function (global){
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
  var parts = url.parse(full, true);
  var result = matcher.match(parts.pathname);
  var route = result ? result.fn(result) : null;
  if (route) {
    route.url = full;
    route.parts = parts;
  }

  global.DEBUG && global.DEBUG('[router] %s yields %s', raw, route.route);

  return route;
}

function setup (definitions) {
  definitions.forEach(define);
}

function define (definition) {
  matcher.addRoute(definition.route, function build (match) {
    var params = match.params;
    params.args = match.splats;
    return {
      route: definition.route,
      params: params,
      action: definition.action || null,
      ignore: definition.ignore,
      cache: definition.cache
    };
  });
}

function equals (left, right) {
  return left && right && left.route === right.route && JSON.stringify(left.params) === JSON.stringify(right.params);
}

router.setup = setup;
router.equals = equals;

module.exports = router;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"fast-url-parser":63,"routes":64}],52:[function(require,module,exports){
'use strict';

module.exports = {
  container: null
};

},{}],53:[function(require,module,exports){
'use strict';

var state = require('./state');
var raw = require('./stores/raw');
var idb = require('./stores/idb');

function clear () {
  raw.clear();
  idb.clear('models');
  idb.clear('controllers');
  idb.clear('templates');
  clearStore('controllers');
  clearStore('templates');
}

function clearStore (type) {
  var store = state[type];
  Object.keys(store).filter(o).forEach(rm);

  function o (action) {
    return store[action] && typeof store[action] === 'object';
  }
  function rm (action) {
    delete store[action];
  }
}


module.exports = clear;

},{"./state":52,"./stores/idb":54,"./stores/raw":55}],54:[function(require,module,exports){
(function (global){
'use strict';

var api = {};
var g = global;
var idb = g.indexedDB || g.mozIndexedDB || g.webkitIndexedDB || g.msIndexedDB;
var supports;
var db;
var dbVersion = 3;
var dbName = 'taunus';
var keyPath = 'key';
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
  var req = idb.open(dbName, dbVersion);
  req.onerror = error;
  req.onupgradeneeded = upgneeded;
  req.onsuccess = success;

  function upgneeded (e) {
    var db = req.result;
    var v = e.oldVersion;
    if (v === 1) {
      db.deleteObjectStore('wildstore');
    }
    if (v < 2) {
      db.createObjectStore('models', { keyPath: keyPath });
      db.createObjectStore('templates', { keyPath: keyPath });
      db.createObjectStore('controllers', { keyPath: keyPath });
    }
  }

  function success () {
    db = req.result;
    api.name = 'IndexedDB';
    api.get = get;
    api.set = set;
    api.clear = clear;
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
  api.clear = noop;
}

function undefinedGet (store, key, done) {
  (done || key)(null, done ? null : []);
}

function enqueueSet (store, key,  value, done) {
  if (setQueue.length > 2) { // let's not waste any more memory
    return;
  }
  if (supports !== false) { // let's assume the capability is validated soon
    setQueue.push({ store: store, key: key, value: value, done: done });
  }
}

function drainSet () {
  while (setQueue.length) {
    var item = setQueue.shift();
    set(item.store, item.key, item.value, item.done);
  }
}

function query (op, store, value, done) {
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

function all (store, done) {
  var tx = db.transaction(store, 'readonly');
  var s = tx.objectStore(store);
  var req = s.openCursor();
  var items = [];

  req.onsuccess = success;
  req.onerror = error;
  tx.oncomplete = complete;

  function complete () {
    (done || noop)(null, items);
  }

  function success (e) {
    var cursor = e.target.result;
    if (cursor) {
      items.push(cursor.value);
      cursor.continue();
    }
  }

  function error () {
    (done || noop)(new Error('Taunus cache query-all failed at IndexedDB!'));
  }
}

function clear (store, done) {
  var tx = db.transaction(store, 'readwrite');
  var s = tx.objectStore(store);
  var req = s.clear();
  var items = [];

  req.onerror = error;
  tx.oncomplete = complete;

  function complete () {
    (done || noop)(null, items);
  }

  function error () {
    (done || noop)(new Error('Taunus cache clear failed at IndexedDB!'));
  }
}

function get (store, key, done) {
  if (done === void 0) {
    all(store, key);
  } else {
    query('get', store, key, done);
  }
}

function set (store, key, value, done) {
  global.DEBUG && global.DEBUG('[idb] storing %s, in %s db', key, store, value);
  value[keyPath] = key;
  query('add', store, value, done); // attempt to insert
  query('put', store, value, done); // attempt to update
}

function drainTested () {
  while (testedQueue.length) {
    testedQueue.shift()(supports);
  }
}

function tested (fn) {
  if (supports !== void 0) {
    fn(supports);
  } else {
    testedQueue.push(fn);
  }
}

function support (value) {
  if (supports !== void 0) {
    return; // sanity
  }
  global.DEBUG && global.DEBUG('[idb] test result %s, db %s', value, value ? 'ready' : 'unavailable');
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
},{}],55:[function(require,module,exports){
'use strict';

var raw = {};

function noop () {}

function ensure (store) {
  if (!raw[store]) { raw[store] = {}; }
}

function get (store, key, done) {
  ensure(store);
  done(null, raw[store][key]);
}

function set (store, key, value, done) {
  ensure(store);
  raw[store][key] = value;
  (done || noop)(null);
}

function clear () {
  raw = {};
}

module.exports = {
  name: 'memoryStore',
  get: get,
  set: set,
  clear: clear
};

},{}],56:[function(require,module,exports){
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

},{}],57:[function(require,module,exports){
/* jshint strict:false */
// this module doesn't use strict, so eval is unstrict.

module.exports = function (code) {
  /* jshint evil:true */
  return eval(code);
};

},{}],58:[function(require,module,exports){
(function (global){
'use strict';

var state = require('./state');
var emitter = require('./emitter');
var fetcher = require('./fetcher');
var deferral = require('./deferral');

function view (container, enforcedAction, model, route, options) {
  var action = enforcedAction || model && model.action || route && route.action;
  var demands = deferral.needs(action);

  global.DEBUG && global.DEBUG('[view] rendering view %s with [%s] demands', action, demands.join(','));

  if (demands.length) {
    pull();
  } else {
    ready();
  }

  function pull () {
    var victim = route || state.route;
    var context = {
      source: 'hijacking',
      hijacker: action,
      element: container
    };
    global.DEBUG && global.DEBUG('[view] hijacking %s for action %s', victim.url, action);
    fetcher(victim, context, ready);
  }

  function ready () {
    var controller = getComponent('controllers', action);
    var internals = options || {};
    if (internals.render !== false) {
      container.innerHTML = render(action, model);
    } else {
      global.DEBUG && global.DEBUG('[view] not rendering %s', action);
    }
    if (container === state.container) {
      emitter.emit('change', route, model);
    }
    emitter.emit('render', container, model, route || null);
    global.DEBUG && global.DEBUG('[view] %s client-side controller for %s', controller ? 'executing' : 'no', action);
    if (controller) {
      controller(model, container, route || null);
    }
  }
}

function render (action, model) {
  global.DEBUG && global.DEBUG('[view] rendering %s with model', action, model);
  var template = getComponent('templates', action);
  if (typeof template !== 'function') {
    throw new Error('Client-side "' + action + '" template not found');
  }
  try {
    return template(model);
  } catch (e) {
    throw new Error('Error rendering "' + action + '" view template\n' + e.stack);
  }
}

function getComponent (type, action) {
  var component = state[type][action];
  var transport = typeof component;
  if (transport === 'object' && component) {
    return component.fn;
  }
  if (transport === 'function') {
    return component;
  }
}

function partial (container, action, model) {
  global.DEBUG && global.DEBUG('[view] rendering partial %s', action);
  return view(container, action, model, null, { routed: false });
}

view.partial = partial;

module.exports = view;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./deferral":40,"./emitter":41,"./fetcher":43,"./state":52}],59:[function(require,module,exports){
(function (global){
'use strict';

var xhr = require('xhr');

function request (url, o, done) {
  var options = {
    url: url,
    json: true,
    headers: { Accept: 'application/json' }
  };
  if (done) {
    Object.keys(o).forEach(overwrite);
  } else {
    done = o;
  }

  global.DEBUG && global.DEBUG('[xhr] %s %s', options.method || 'GET', options.url);

  var req = xhr(options, handle);

  return req;

  function overwrite (prop) {
    options[prop] = o[prop];
  }

  function handle (err, res, body) {
    if (err && !req.getAllResponseHeaders()) {
      global.DEBUG && global.DEBUG('[xhr] %s %s aborted', options.method || 'GET', options.url);
      done(new Error('aborted'), null, res);
    } else {
      global.DEBUG && global.DEBUG('[xhr] %s %s done', options.method || 'GET', options.url);
      done(err, body, res);
    }
  }
}

module.exports = request;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"xhr":65}],60:[function(require,module,exports){
'use strict';

module.exports = function deferred (action, rules) {
  return rules.some(failed);
  function failed (challenge) {
    var left = challenge.split('/');
    var right = action.split('/');
    var lpart, rpart;
    while (left.length) {
      lpart = left.shift();
      rpart = right.shift();
      if (lpart !== '?' && lpart !== rpart) {
        return false;
      }
    }
    return true;
  }
};

},{}],61:[function(require,module,exports){
module.exports = require('./src/contra.emitter.js');

},{"./src/contra.emitter.js":62}],62:[function(require,module,exports){
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
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],63:[function(require,module,exports){
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

},{"punycode":2,"querystring":5}],64:[function(require,module,exports){
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
},{}],65:[function(require,module,exports){
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

},{"global/window":66,"once":67,"parse-headers":71}],66:[function(require,module,exports){
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
},{}],67:[function(require,module,exports){
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

},{}],68:[function(require,module,exports){
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

},{"is-function":69}],69:[function(require,module,exports){
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

},{}],70:[function(require,module,exports){

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

},{}],71:[function(require,module,exports){
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
},{"for-each":68,"trim":70}],72:[function(require,module,exports){
module.exports="3.0.1"

},{}],73:[function(require,module,exports){
'use strict';

var t = require('./version.json');

function get (v) {
  return 't' + t + ';v' + v;
}

module.exports = {
  get: get
};

},{"./version.json":72}]},{},[16])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvY29udmVudGlvbnMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9tYWluLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvdGhyb3R0bGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL25vZGVfbW9kdWxlcy9wb3Nlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvbm9kZV9tb2R1bGVzL3Bvc2VyL3NyYy9icm93c2VyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9ub2RlX21vZHVsZXMvc2VrdG9yL3NyYy9zZWt0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLmN0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLnByb3RvdHlwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2NsYXNzZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9jb3JlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9tLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9taW51cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3B1YmxpYy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3Rlc3QuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy90ZXh0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vbm9kZV9tb2R1bGVzL2phZGUvcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvYWN0aXZhdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoaW5nLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2xvbmUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jb21wb25lbnRDYWNoZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2RlZmVycmFsLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZW1pdHRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2ZldGNoZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9ob29rcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW50ZXJjZXB0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9saW5rcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL21vdW50LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbmF0aXZlRm4uanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9vbmNlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcm91dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RhdGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdGF0ZUNsZWFyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL2lkYi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0b3Jlcy9yYXcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci91bmVzY2FwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3Vuc3RyaWN0RXZhbC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3ZpZXcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci94aHIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbGliL2RlZmVycmVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvc3JjL2NvbnRyYS5lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9mYXN0LXVybC1wYXJzZXIvc3JjL3VybHBhcnNlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcm91dGVzL2Rpc3Qvcm91dGVzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvZ2xvYmFsL3dpbmRvdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9vbmNlL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvbm9kZV9tb2R1bGVzL2lzLWZ1bmN0aW9uL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL3RyaW0vaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9wYXJzZS1oZWFkZXJzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL3ZlcnNpb24uanNvbiIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy92ZXJzaW9uaW5nLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3ZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25OQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDek9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8qISBodHRwOi8vbXRocy5iZS9wdW55Y29kZSB2MS4yLjQgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cztcblx0dmFyIGZyZWVNb2R1bGUgPSB0eXBlb2YgbW9kdWxlID09ICdvYmplY3QnICYmIG1vZHVsZSAmJlxuXHRcdG1vZHVsZS5leHBvcnRzID09IGZyZWVFeHBvcnRzICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8IGZyZWVHbG9iYWwud2luZG93ID09PSBmcmVlR2xvYmFsKSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXiAtfl0vLCAvLyB1bnByaW50YWJsZSBBU0NJSSBjaGFycyArIG5vbi1BU0NJSSBjaGFyc1xuXHRyZWdleFNlcGFyYXRvcnMgPSAvXFx4MkV8XFx1MzAwMnxcXHVGRjBFfFxcdUZGNjEvZywgLy8gUkZDIDM0OTAgc2VwYXJhdG9yc1xuXG5cdC8qKiBFcnJvciBtZXNzYWdlcyAqL1xuXHRlcnJvcnMgPSB7XG5cdFx0J292ZXJmbG93JzogJ092ZXJmbG93OiBpbnB1dCBuZWVkcyB3aWRlciBpbnRlZ2VycyB0byBwcm9jZXNzJyxcblx0XHQnbm90LWJhc2ljJzogJ0lsbGVnYWwgaW5wdXQgPj0gMHg4MCAobm90IGEgYmFzaWMgY29kZSBwb2ludCknLFxuXHRcdCdpbnZhbGlkLWlucHV0JzogJ0ludmFsaWQgaW5wdXQnXG5cdH0sXG5cblx0LyoqIENvbnZlbmllbmNlIHNob3J0Y3V0cyAqL1xuXHRiYXNlTWludXNUTWluID0gYmFzZSAtIHRNaW4sXG5cdGZsb29yID0gTWF0aC5mbG9vcixcblx0c3RyaW5nRnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZSxcblxuXHQvKiogVGVtcG9yYXJ5IHZhcmlhYmxlICovXG5cdGtleTtcblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGVycm9yIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSBlcnJvciB0eXBlLlxuXHQgKiBAcmV0dXJucyB7RXJyb3J9IFRocm93cyBhIGBSYW5nZUVycm9yYCB3aXRoIHRoZSBhcHBsaWNhYmxlIGVycm9yIG1lc3NhZ2UuXG5cdCAqL1xuXHRmdW5jdGlvbiBlcnJvcih0eXBlKSB7XG5cdFx0dGhyb3cgUmFuZ2VFcnJvcihlcnJvcnNbdHlwZV0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBgQXJyYXkjbWFwYCB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnkgYXJyYXlcblx0ICogaXRlbS5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBhcnJheSBvZiB2YWx1ZXMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwKGFycmF5LCBmbikge1xuXHRcdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdFx0d2hpbGUgKGxlbmd0aC0tKSB7XG5cdFx0XHRhcnJheVtsZW5ndGhdID0gZm4oYXJyYXlbbGVuZ3RoXSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHNpbXBsZSBgQXJyYXkjbWFwYC1saWtlIHdyYXBwZXIgdG8gd29yayB3aXRoIGRvbWFpbiBuYW1lIHN0cmluZ3MuXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnlcblx0ICogY2hhcmFjdGVyLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IHN0cmluZyBvZiBjaGFyYWN0ZXJzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFja1xuXHQgKiBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcERvbWFpbihzdHJpbmcsIGZuKSB7XG5cdFx0cmV0dXJuIG1hcChzdHJpbmcuc3BsaXQocmVnZXhTZXBhcmF0b3JzKSwgZm4pLmpvaW4oJy4nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIG51bWVyaWMgY29kZSBwb2ludHMgb2YgZWFjaCBVbmljb2RlXG5cdCAqIGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLiBXaGlsZSBKYXZhU2NyaXB0IHVzZXMgVUNTLTIgaW50ZXJuYWxseSxcblx0ICogdGhpcyBmdW5jdGlvbiB3aWxsIGNvbnZlcnQgYSBwYWlyIG9mIHN1cnJvZ2F0ZSBoYWx2ZXMgKGVhY2ggb2Ygd2hpY2hcblx0ICogVUNTLTIgZXhwb3NlcyBhcyBzZXBhcmF0ZSBjaGFyYWN0ZXJzKSBpbnRvIGEgc2luZ2xlIGNvZGUgcG9pbnQsXG5cdCAqIG1hdGNoaW5nIFVURi0xNi5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5lbmNvZGVgXG5cdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGRlY29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBuZXcgYXJyYXkgb2YgY29kZSBwb2ludHMuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgY291bnRlciA9IDAsXG5cdFx0ICAgIGxlbmd0aCA9IHN0cmluZy5sZW5ndGgsXG5cdFx0ICAgIHZhbHVlLFxuXHRcdCAgICBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmRlY29kZWBcblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZW5jb2RlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGNvZGVQb2ludHMgVGhlIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuZXcgVW5pY29kZSBzdHJpbmcgKFVDUy0yKS5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJlbmNvZGUoYXJyYXkpIHtcblx0XHRyZXR1cm4gbWFwKGFycmF5LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdFx0aWYgKHZhbHVlID4gMHhGRkZGKSB7XG5cdFx0XHRcdHZhbHVlIC09IDB4MTAwMDA7XG5cdFx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApO1xuXHRcdFx0XHR2YWx1ZSA9IDB4REMwMCB8IHZhbHVlICYgMHgzRkY7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBiYXNpYyBjb2RlIHBvaW50IGludG8gYSBkaWdpdC9pbnRlZ2VyLlxuXHQgKiBAc2VlIGBkaWdpdFRvQmFzaWMoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVQb2ludCBUaGUgYmFzaWMgbnVtZXJpYyBjb2RlIHBvaW50IHZhbHVlLlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQgKGZvciB1c2UgaW5cblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuXHQgKiB0aGUgY29kZSBwb2ludCBkb2VzIG5vdCByZXByZXNlbnQgYSB2YWx1ZS5cblx0ICovXG5cdGZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQpIHtcblx0XHRpZiAoY29kZVBvaW50IC0gNDggPCAxMCkge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDIyO1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gNjUgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDY1O1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gOTcgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDk3O1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEBzZWUgYGJhc2ljVG9EaWdpdCgpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gZGlnaXQgVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzaWMgY29kZSBwb2ludCB3aG9zZSB2YWx1ZSAod2hlbiB1c2VkIGZvclxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGlzIGBkaWdpdGAsIHdoaWNoIG5lZWRzIHRvIGJlIGluIHRoZSByYW5nZVxuXHQgKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcblx0ICogdXNlZDsgZWxzZSwgdGhlIGxvd2VyY2FzZSBmb3JtIGlzIHVzZWQuIFRoZSBiZWhhdmlvciBpcyB1bmRlZmluZWRcblx0ICogaWYgYGZsYWdgIGlzIG5vbi16ZXJvIGFuZCBgZGlnaXRgIGhhcyBubyB1cHBlcmNhc2UgZm9ybS5cblx0ICovXG5cdGZ1bmN0aW9uIGRpZ2l0VG9CYXNpYyhkaWdpdCwgZmxhZykge1xuXHRcdC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG5cdFx0Ly8gMjYuLjM1IG1hcCB0byBBU0NJSSAwLi45XG5cdFx0cmV0dXJuIGRpZ2l0ICsgMjIgKyA3NSAqIChkaWdpdCA8IDI2KSAtICgoZmxhZyAhPSAwKSA8PCA1KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaWFzIGFkYXB0YXRpb24gZnVuY3Rpb24gYXMgcGVyIHNlY3Rpb24gMy40IG9mIFJGQyAzNDkyLlxuXHQgKiBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNDkyI3NlY3Rpb24tMy40XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGFwdChkZWx0YSwgbnVtUG9pbnRzLCBmaXJzdFRpbWUpIHtcblx0XHR2YXIgayA9IDA7XG5cdFx0ZGVsdGEgPSBmaXJzdFRpbWUgPyBmbG9vcihkZWx0YSAvIGRhbXApIDogZGVsdGEgPj4gMTtcblx0XHRkZWx0YSArPSBmbG9vcihkZWx0YSAvIG51bVBvaW50cyk7XG5cdFx0Zm9yICgvKiBubyBpbml0aWFsaXphdGlvbiAqLzsgZGVsdGEgPiBiYXNlTWludXNUTWluICogdE1heCA+PiAxOyBrICs9IGJhc2UpIHtcblx0XHRcdGRlbHRhID0gZmxvb3IoZGVsdGEgLyBiYXNlTWludXNUTWluKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZsb29yKGsgKyAoYmFzZU1pbnVzVE1pbiArIDEpICogZGVsdGEgLyAoZGVsdGEgKyBza2V3KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzIHRvIGEgc3RyaW5nIG9mIFVuaWNvZGVcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGVjb2RlKGlucHV0KSB7XG5cdFx0Ly8gRG9uJ3QgdXNlIFVDUy0yXG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aCxcblx0XHQgICAgb3V0LFxuXHRcdCAgICBpID0gMCxcblx0XHQgICAgbiA9IGluaXRpYWxOLFxuXHRcdCAgICBiaWFzID0gaW5pdGlhbEJpYXMsXG5cdFx0ICAgIGJhc2ljLFxuXHRcdCAgICBqLFxuXHRcdCAgICBpbmRleCxcblx0XHQgICAgb2xkaSxcblx0XHQgICAgdyxcblx0XHQgICAgayxcblx0XHQgICAgZGlnaXQsXG5cdFx0ICAgIHQsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBiYXNlTWludXNUO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50czogbGV0IGBiYXNpY2AgYmUgdGhlIG51bWJlciBvZiBpbnB1dCBjb2RlXG5cdFx0Ly8gcG9pbnRzIGJlZm9yZSB0aGUgbGFzdCBkZWxpbWl0ZXIsIG9yIGAwYCBpZiB0aGVyZSBpcyBub25lLCB0aGVuIGNvcHlcblx0XHQvLyB0aGUgZmlyc3QgYmFzaWMgY29kZSBwb2ludHMgdG8gdGhlIG91dHB1dC5cblxuXHRcdGJhc2ljID0gaW5wdXQubGFzdEluZGV4T2YoZGVsaW1pdGVyKTtcblx0XHRpZiAoYmFzaWMgPCAwKSB7XG5cdFx0XHRiYXNpYyA9IDA7XG5cdFx0fVxuXG5cdFx0Zm9yIChqID0gMDsgaiA8IGJhc2ljOyArK2opIHtcblx0XHRcdC8vIGlmIGl0J3Mgbm90IGEgYmFzaWMgY29kZSBwb2ludFxuXHRcdFx0aWYgKGlucHV0LmNoYXJDb2RlQXQoaikgPj0gMHg4MCkge1xuXHRcdFx0XHRlcnJvcignbm90LWJhc2ljJyk7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQucHVzaChpbnB1dC5jaGFyQ29kZUF0KGopKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGRlY29kaW5nIGxvb3A6IHN0YXJ0IGp1c3QgYWZ0ZXIgdGhlIGxhc3QgZGVsaW1pdGVyIGlmIGFueSBiYXNpYyBjb2RlXG5cdFx0Ly8gcG9pbnRzIHdlcmUgY29waWVkOyBzdGFydCBhdCB0aGUgYmVnaW5uaW5nIG90aGVyd2lzZS5cblxuXHRcdGZvciAoaW5kZXggPSBiYXNpYyA+IDAgPyBiYXNpYyArIDEgOiAwOyBpbmRleCA8IGlucHV0TGVuZ3RoOyAvKiBubyBmaW5hbCBleHByZXNzaW9uICovKSB7XG5cblx0XHRcdC8vIGBpbmRleGAgaXMgdGhlIGluZGV4IG9mIHRoZSBuZXh0IGNoYXJhY3RlciB0byBiZSBjb25zdW1lZC5cblx0XHRcdC8vIERlY29kZSBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyIGludG8gYGRlbHRhYCxcblx0XHRcdC8vIHdoaWNoIGdldHMgYWRkZWQgdG8gYGlgLiBUaGUgb3ZlcmZsb3cgY2hlY2tpbmcgaXMgZWFzaWVyXG5cdFx0XHQvLyBpZiB3ZSBpbmNyZWFzZSBgaWAgYXMgd2UgZ28sIHRoZW4gc3VidHJhY3Qgb2ZmIGl0cyBzdGFydGluZ1xuXHRcdFx0Ly8gdmFsdWUgYXQgdGhlIGVuZCB0byBvYnRhaW4gYGRlbHRhYC5cblx0XHRcdGZvciAob2xkaSA9IGksIHcgPSAxLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblxuXHRcdFx0XHRpZiAoaW5kZXggPj0gaW5wdXRMZW5ndGgpIHtcblx0XHRcdFx0XHRlcnJvcignaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlnaXQgPSBiYXNpY1RvRGlnaXQoaW5wdXQuY2hhckNvZGVBdChpbmRleCsrKSk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0ID49IGJhc2UgfHwgZGlnaXQgPiBmbG9vcigobWF4SW50IC0gaSkgLyB3KSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aSArPSBkaWdpdCAqIHc7XG5cdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA8IHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0aWYgKHcgPiBmbG9vcihtYXhJbnQgLyBiYXNlTWludXNUKSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dyAqPSBiYXNlTWludXNUO1xuXG5cdFx0XHR9XG5cblx0XHRcdG91dCA9IG91dHB1dC5sZW5ndGggKyAxO1xuXHRcdFx0YmlhcyA9IGFkYXB0KGkgLSBvbGRpLCBvdXQsIG9sZGkgPT0gMCk7XG5cblx0XHRcdC8vIGBpYCB3YXMgc3VwcG9zZWQgdG8gd3JhcCBhcm91bmQgZnJvbSBgb3V0YCB0byBgMGAsXG5cdFx0XHQvLyBpbmNyZW1lbnRpbmcgYG5gIGVhY2ggdGltZSwgc28gd2UnbGwgZml4IHRoYXQgbm93OlxuXHRcdFx0aWYgKGZsb29yKGkgLyBvdXQpID4gbWF4SW50IC0gbikge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0biArPSBmbG9vcihpIC8gb3V0KTtcblx0XHRcdGkgJT0gb3V0O1xuXG5cdFx0XHQvLyBJbnNlcnQgYG5gIGF0IHBvc2l0aW9uIGBpYCBvZiB0aGUgb3V0cHV0XG5cdFx0XHRvdXRwdXQuc3BsaWNlKGkrKywgMCwgbik7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdWNzMmVuY29kZShvdXRwdXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scyB0byBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5XG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGVuY29kZShpbnB1dCkge1xuXHRcdHZhciBuLFxuXHRcdCAgICBkZWx0YSxcblx0XHQgICAgaGFuZGxlZENQQ291bnQsXG5cdFx0ICAgIGJhc2ljTGVuZ3RoLFxuXHRcdCAgICBiaWFzLFxuXHRcdCAgICBqLFxuXHRcdCAgICBtLFxuXHRcdCAgICBxLFxuXHRcdCAgICBrLFxuXHRcdCAgICB0LFxuXHRcdCAgICBjdXJyZW50VmFsdWUsXG5cdFx0ICAgIG91dHB1dCA9IFtdLFxuXHRcdCAgICAvKiogYGlucHV0TGVuZ3RoYCB3aWxsIGhvbGQgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyBpbiBgaW5wdXRgLiAqL1xuXHRcdCAgICBpbnB1dExlbmd0aCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50UGx1c09uZSxcblx0XHQgICAgYmFzZU1pbnVzVCxcblx0XHQgICAgcU1pbnVzVDtcblxuXHRcdC8vIENvbnZlcnQgdGhlIGlucHV0IGluIFVDUy0yIHRvIFVuaWNvZGVcblx0XHRpbnB1dCA9IHVjczJkZWNvZGUoaW5wdXQpO1xuXG5cdFx0Ly8gQ2FjaGUgdGhlIGxlbmd0aFxuXHRcdGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgc3RhdGVcblx0XHRuID0gaW5pdGlhbE47XG5cdFx0ZGVsdGEgPSAwO1xuXHRcdGJpYXMgPSBpbml0aWFsQmlhcztcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHNcblx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgMHg4MCkge1xuXHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoY3VycmVudFZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aGFuZGxlZENQQ291bnQgPSBiYXNpY0xlbmd0aCA9IG91dHB1dC5sZW5ndGg7XG5cblx0XHQvLyBgaGFuZGxlZENQQ291bnRgIGlzIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgdGhhdCBoYXZlIGJlZW4gaGFuZGxlZDtcblx0XHQvLyBgYmFzaWNMZW5ndGhgIGlzIHRoZSBudW1iZXIgb2YgYmFzaWMgY29kZSBwb2ludHMuXG5cblx0XHQvLyBGaW5pc2ggdGhlIGJhc2ljIHN0cmluZyAtIGlmIGl0IGlzIG5vdCBlbXB0eSAtIHdpdGggYSBkZWxpbWl0ZXJcblx0XHRpZiAoYmFzaWNMZW5ndGgpIHtcblx0XHRcdG91dHB1dC5wdXNoKGRlbGltaXRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBlbmNvZGluZyBsb29wOlxuXHRcdHdoaWxlIChoYW5kbGVkQ1BDb3VudCA8IGlucHV0TGVuZ3RoKSB7XG5cblx0XHRcdC8vIEFsbCBub24tYmFzaWMgY29kZSBwb2ludHMgPCBuIGhhdmUgYmVlbiBoYW5kbGVkIGFscmVhZHkuIEZpbmQgdGhlIG5leHRcblx0XHRcdC8vIGxhcmdlciBvbmU6XG5cdFx0XHRmb3IgKG0gPSBtYXhJbnQsIGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA+PSBuICYmIGN1cnJlbnRWYWx1ZSA8IG0pIHtcblx0XHRcdFx0XHRtID0gY3VycmVudFZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluY3JlYXNlIGBkZWx0YWAgZW5vdWdoIHRvIGFkdmFuY2UgdGhlIGRlY29kZXIncyA8bixpPiBzdGF0ZSB0byA8bSwwPixcblx0XHRcdC8vIGJ1dCBndWFyZCBhZ2FpbnN0IG92ZXJmbG93XG5cdFx0XHRoYW5kbGVkQ1BDb3VudFBsdXNPbmUgPSBoYW5kbGVkQ1BDb3VudCArIDE7XG5cdFx0XHRpZiAobSAtIG4gPiBmbG9vcigobWF4SW50IC0gZGVsdGEpIC8gaGFuZGxlZENQQ291bnRQbHVzT25lKSkge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsdGEgKz0gKG0gLSBuKSAqIGhhbmRsZWRDUENvdW50UGx1c09uZTtcblx0XHRcdG4gPSBtO1xuXG5cdFx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgbiAmJiArK2RlbHRhID4gbWF4SW50KSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID09IG4pIHtcblx0XHRcdFx0XHQvLyBSZXByZXNlbnQgZGVsdGEgYXMgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlclxuXHRcdFx0XHRcdGZvciAocSA9IGRlbHRhLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblx0XHRcdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXHRcdFx0XHRcdFx0aWYgKHEgPCB0KSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cU1pbnVzVCA9IHEgLSB0O1xuXHRcdFx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goXG5cdFx0XHRcdFx0XHRcdHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWModCArIHFNaW51c1QgJSBiYXNlTWludXNULCAwKSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRxID0gZmxvb3IocU1pbnVzVCAvIGJhc2VNaW51c1QpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWMocSwgMCkpKTtcblx0XHRcdFx0XHRiaWFzID0gYWRhcHQoZGVsdGEsIGhhbmRsZWRDUENvdW50UGx1c09uZSwgaGFuZGxlZENQQ291bnQgPT0gYmFzaWNMZW5ndGgpO1xuXHRcdFx0XHRcdGRlbHRhID0gMDtcblx0XHRcdFx0XHQrK2hhbmRsZWRDUENvdW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdCsrZGVsdGE7XG5cdFx0XHQrK247XG5cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dC5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBVbmljb2RlLiBPbmx5IHRoZVxuXHQgKiBQdW55Y29kZWQgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IG9uIGEgc3RyaW5nIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBjb252ZXJ0ZWQgdG9cblx0ICogVW5pY29kZS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIFB1bnljb2RlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQgdG8gVW5pY29kZS5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFVuaWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIFB1bnljb2RlXG5cdCAqIHN0cmluZy5cblx0ICovXG5cdGZ1bmN0aW9uIHRvVW5pY29kZShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhQdW55Y29kZS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyBkZWNvZGUoc3RyaW5nLnNsaWNlKDQpLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgVW5pY29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gUHVueWNvZGUuIE9ubHkgdGhlXG5cdCAqIG5vbi1BU0NJSSBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0J3MgYWxyZWFkeSBpbiBBU0NJSS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQsIGFzIGEgVW5pY29kZSBzdHJpbmcuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBQdW55Y29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gZG9tYWluIG5hbWUuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b0FTQ0lJKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleE5vbkFTQ0lJLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/ICd4bi0tJyArIGVuY29kZShzdHJpbmcpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqIERlZmluZSB0aGUgcHVibGljIEFQSSAqL1xuXHRwdW55Y29kZSA9IHtcblx0XHQvKipcblx0XHQgKiBBIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGN1cnJlbnQgUHVueWNvZGUuanMgdmVyc2lvbiBudW1iZXIuXG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgU3RyaW5nXG5cdFx0ICovXG5cdFx0J3ZlcnNpb24nOiAnMS4yLjQnLFxuXHRcdC8qKlxuXHRcdCAqIEFuIG9iamVjdCBvZiBtZXRob2RzIHRvIGNvbnZlcnQgZnJvbSBKYXZhU2NyaXB0J3MgaW50ZXJuYWwgY2hhcmFjdGVyXG5cdFx0ICogcmVwcmVzZW50YXRpb24gKFVDUy0yKSB0byBVbmljb2RlIGNvZGUgcG9pbnRzLCBhbmQgYmFjay5cblx0XHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIE9iamVjdFxuXHRcdCAqL1xuXHRcdCd1Y3MyJzoge1xuXHRcdFx0J2RlY29kZSc6IHVjczJkZWNvZGUsXG5cdFx0XHQnZW5jb2RlJzogdWNzMmVuY29kZVxuXHRcdH0sXG5cdFx0J2RlY29kZSc6IGRlY29kZSxcblx0XHQnZW5jb2RlJzogZW5jb2RlLFxuXHRcdCd0b0FTQ0lJJzogdG9BU0NJSSxcblx0XHQndG9Vbmljb2RlJzogdG9Vbmljb2RlXG5cdH07XG5cblx0LyoqIEV4cG9zZSBgcHVueWNvZGVgICovXG5cdC8vIFNvbWUgQU1EIGJ1aWxkIG9wdGltaXplcnMsIGxpa2Ugci5qcywgY2hlY2sgZm9yIHNwZWNpZmljIGNvbmRpdGlvbiBwYXR0ZXJuc1xuXHQvLyBsaWtlIHRoZSBmb2xsb3dpbmc6XG5cdGlmIChcblx0XHR0eXBlb2YgZGVmaW5lID09ICdmdW5jdGlvbicgJiZcblx0XHR0eXBlb2YgZGVmaW5lLmFtZCA9PSAnb2JqZWN0JyAmJlxuXHRcdGRlZmluZS5hbWRcblx0KSB7XG5cdFx0ZGVmaW5lKCdwdW55Y29kZScsIGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHB1bnljb2RlO1xuXHRcdH0pO1xuXHR9IGVsc2UgaWYgKGZyZWVFeHBvcnRzICYmICFmcmVlRXhwb3J0cy5ub2RlVHlwZSkge1xuXHRcdGlmIChmcmVlTW9kdWxlKSB7IC8vIGluIE5vZGUuanMgb3IgUmluZ29KUyB2MC44LjArXG5cdFx0XHRmcmVlTW9kdWxlLmV4cG9ydHMgPSBwdW55Y29kZTtcblx0XHR9IGVsc2UgeyAvLyBpbiBOYXJ3aGFsIG9yIFJpbmdvSlMgdjAuNy4wLVxuXHRcdFx0Zm9yIChrZXkgaW4gcHVueWNvZGUpIHtcblx0XHRcdFx0cHVueWNvZGUuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAoZnJlZUV4cG9ydHNba2V5XSA9IHB1bnljb2RlW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHsgLy8gaW4gUmhpbm8gb3IgYSB3ZWIgYnJvd3NlclxuXHRcdHJvb3QucHVueWNvZGUgPSBwdW55Y29kZTtcblx0fVxuXG59KHRoaXMpKTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBvYmpba10ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYWJvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwid2h5LXRhdW51cy1cXFwiPldoeSBUYXVudXM/PC9oMT5cXG48cD5UYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIDxlbT5hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZTwvZW0+IGFzIHdlbGwuIDxzdHJvbmc+VGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQ8L3N0cm9uZz4uIEl0IHVzZXMgc2VydmVyLXNpZGUgcmVuZGVyaW5nIHRvIGdldCBjb250ZW50IHRvIHlvdXIgaHVtYW5zIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCBpdCB1c2VzIGNsaWVudC1zaWRlIHJlbmRlcmluZyB0byBpbXByb3ZlIHRoZWlyIGV4cGVyaWVuY2UuPC9wPlxcbjxwPldoaWxlIGl0IGZvY3VzZXMgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIDxzdHJvbmc+PGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2FkanVzdGluZy11eC1mb3ItaHVtYW5zXFxcIj51c2FiaWxpdHk8L2E+IGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zPC9zdHJvbmc+IGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgPHN0cm9uZz5zdGlsbCBleHBlY3RlZCB0byB3b3JrPC9zdHJvbmc+LjwvcD5cXG48cD5Gb3IgZXhhbXBsZSwgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIHNpdGUgdXNlcyBwbGFpbi1vbGQgbGlua3MgdG8gbmF2aWdhdGUgZnJvbSBvbmUgdmlldyB0byBhbm90aGVyLCBhbmQgdGhlbiBhZGRzIGEgPGNvZGU+Y2xpY2s8L2NvZGU+IGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0JiMzOTtzIG9rYXksIGJlY2F1c2Ugd2UgYWNrbm93bGVkZ2UgdGhhdCA8c3Ryb25nPm91ciBzaXRlcyBkb24mIzM5O3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3Nlcjwvc3Ryb25nPi4gU2ltaWxhcmx5LCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXFwiPnBlcmZvcm1hbmNlIGlzIGdyZWF0bHkgZW5oYW5jZWQ8L2E+IGJ5IGRlbGl2ZXJpbmcgY29udGVudCB0byB0aGUgaHVtYW4gYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIHRoZW4gYWRkaW5nIGZ1bmN0aW9uYWxpdHkgb24gdG9wIG9mIHRoYXQuPC9wPlxcbjxwPldpdGggcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIGlmIHRoZSBmdW5jdGlvbmFsaXR5IG5ldmVyIGdldHMgdGhlcmUgYmVjYXVzZSBhIEphdmFTY3JpcHQgcmVzb3VyY2UgZmFpbGVkIHRvIGxvYWQgYmVjYXVzZSB0aGUgbmV0d29yayBmYWlsZWQgPGVtPihub3QgdW5jb21tb24gaW4gdGhlIG1vYmlsZSBlcmEpPC9lbT4gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrITwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktbm90LW90aGVyLWZyYW1ld29ya3MtXFxcIj5XaHkgTm90IE90aGVyIEZyYW1ld29ya3M/PC9oMT5cXG48cD5NYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4mIzM5O3QgZGVzaWduZWQgd2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgb3IgZXZlbiBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJiMzOTt0IHByaW9yaXRpemVkLCBhbmQgaHVtYW5zIGFyZSBleHBlY3RlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5kb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgZGlnZXN0aWJsZSBjb250ZW50PC9hPi4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIHRoYXQgd29uJiMzOTt0IHNvbHZlIGFsbCB5b3VyIHByb2JsZW1zLiBHb29nbGUgaXNuJiMzOTt0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS4gRXZlbiBpZiBjcmF3bGVycyBhcmUgbm90IGFuIGlzc3VlLCBiZWluZyBhYmxlIHRvIHByb3ZpZGUgdGhlIGZhc3Rlc3QgcG9zc2libGUgZXhwZXJpZW5jZSBpcyBhIGJpZyBwcm9ibGVtIHRvIHJlc29sdmUuPC9wPlxcbjxwPkxhdGVseSwgbWFueSBtYXR1cmUgb3Blbi1zb3VyY2UgZnJhbWV3b3JrcyBzdGFydGVkIGRyb3BwaW5nIHN1cHBvcnQgZm9yIG9sZGVyIGJyb3dzZXJzLiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSYjMzk7cmUgYXJjaGl0ZWN0ZWQsIHdoZXJlIHRoZSBkZXZlbG9wZXIgaXMgcHV0IGZpcnN0LiA8c3Ryb25nPlRhdW51cyBpcyA8YSBocmVmPVxcXCJodHRwczovL3R3aXR0ZXIuY29tL2hhc2h0YWcvaHVtYW5maXJzdFxcXCI+I2h1bWFuZmlyc3Q8L2E+PC9zdHJvbmc+LCBtZWFuaW5nIHRoYXQgaXQgY29uY2VkZXMgdGhhdCBodW1hbnMgYXJlIG1vcmUgaW1wb3J0YW50IHRoYW4gdGhlIGRldmVsb3BlcnMgYnVpbGRpbmcgdGhlaXIgYXBwbGljYXRpb25zLjwvcD5cXG48cD5Qcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGFwcGxpY2F0aW9ucyBhcmUgYWx3YXlzIGdvaW5nIHRvIGhhdmUgZ3JlYXQgYnJvd3NlciBzdXBwb3J0IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5JiMzOTtyZSBhcmNoaXRlY3RlZC4gQXMgdGhlIG5hbWUgaW1wbGllcywgYSBiYXNlbGluZSBpcyBlc3RhYmxpc2hlZCB3aGVyZSB3ZSBkZWxpdmVyIHRoZSBjb3JlIGV4cGVyaWVuY2UgdG8gdGhlIHVzZXIgPGVtPih0eXBpY2FsbHkgaW4gdGhlIGZvcm0gb2YgcmVhZGFibGUgSFRNTCBjb250ZW50KTwvZW0+LCBhbmQgdGhlbiBlbmhhbmNlIGl0IDxzdHJvbmc+aWYgcG9zc2libGU8L3N0cm9uZz4gdXNpbmcgQ1NTIGFuZCBKYXZhU2NyaXB0LiBCdWlsZGluZyBhcHBsaWNhdGlvbnMgaW4gdGhpcyB3YXkgbWVhbnMgdGhhdCA8c3Ryb25nPnlvdSYjMzk7bGwgYmUgYWJsZSB0byByZWFjaCB0aGUgbW9zdCBwZW9wbGUgd2l0aCB5b3VyIGNvcmUgZXhwZXJpZW5jZTwvc3Ryb25nPiwgYW5kIHlvdSYjMzk7bGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmVhdHVyZXNcXFwiPkZlYXR1cmVzPC9oMT5cXG48cD5PdXQgb2YgdGhlIGJveCwgVGF1bnVzIGVuc3VyZXMgdGhhdCB5b3VyIHNpdGUgd29ya3Mgb24gYW55IEhUTUwtZW5hYmxlZCBkb2N1bWVudCB2aWV3ZXIsIG9yIGV2ZW4gb24gdGhlIHRlcm1pbmFsLCBwcm92aWRpbmcgc3VwcG9ydCBmb3IgcGxhaW4gdGV4dCByZXNwb25zZXMgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+d2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWQ8L2E+LiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UmIzM5O2xsIG9ubHkgaGF2ZSB0byBkZWNsYXJlIHRoZXNlIG9uY2UgYnV0IHRoZXkmIzM5O2xsIGJlIHVzZWQgaW4gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+VGF1bnVzIGZlYXR1cmVzIGEgcmVhc29uYWJseSBlbmhhbmNlZCBleHBlcmllbmNlLCB3aGVyZSBpZiBmZWF0dXJlcyBhcmVuJiMzOTt0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkmIzM5O3JlIGp1c3Qgbm90IHByb3ZpZGVkLiBGb3IgZXhhbXBsZSwgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBtYWtlcyB1c2Ugb2YgdGhlIDxjb2RlPmhpc3Rvcnk8L2NvZGU+IEFQSSBidXQgaWYgdGhhdCYjMzk7cyBub3QgYXZhaWxhYmxlIHRoZW4gaXQmIzM5O2xsIGZhbGwgYmFjayB0byBzaW1wbHkgbm90IG1lZGRsaW5nIHdpdGggbGlua3MgaW5zdGVhZCBvZiB1c2luZyBhIGNsaWVudC1zaWRlLW9ubHkgaGFzaCByb3V0ZXIuPC9wPlxcbjxwPlRhdW51cyBjYW4gZGVhbCB3aXRoIHZpZXcgY2FjaGluZyBvbiB5b3VyIGJlaGFsZiwgaWYgeW91IHNvIGRlc2lyZSwgdXNpbmcgPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXFwiPmFzeW5jaHJvbm91cyBlbWJlZGRlZCBkYXRhYmFzZSBzdG9yZXM8L2E+IG9uIHRoZSBjbGllbnQtc2lkZS4gVHVybnMgb3V0LCB0aGVyZSYjMzk7cyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI3NlYXJjaD1pbmRleGVkZGJcXFwiPnByZXR0eSBnb29kIGJyb3dzZXIgc3VwcG9ydCBmb3IgSW5kZXhlZERCPC9hPi4gT2YgY291cnNlLCBJbmRleGVkREIgd2lsbCBvbmx5IGJlIHVzZWQgaWYgaXQmIzM5O3MgYXZhaWxhYmxlLCBhbmQgaWYgaXQmIzM5O3Mgbm90IHRoZW4gdmlldyBtb2RlbHMgd29uJiMzOTt0IGJlIGNhY2hlZCBpbiB0aGUgY2xpZW50LXNpZGUgYmVzaWRlcyBhbiBpbi1tZW1vcnkgc3RvcmUuIDxzdHJvbmc+VGhlIHNpdGUgd29uJiMzOTt0IHNpbXBseSByb2xsIG92ZXIgYW5kIGRpZSwgdGhvdWdoLjwvc3Ryb25nPjwvcD5cXG48cD5JZiB5b3UmIzM5O3ZlIHR1cm5lZCBjbGllbnQtc2lkZSBjYWNoaW5nIG9uLCB0aGVuIHlvdSBjYW4gYWxzbyB0dXJuIG9uIHRoZSA8c3Ryb25nPnZpZXcgcHJlLWZldGNoaW5nIGZlYXR1cmU8L3N0cm9uZz4sIHdoaWNoIHdpbGwgc3RhcnQgZG93bmxvYWRpbmcgdmlld3MgYXMgc29vbiBhcyBodW1hbnMgaG92ZXIgb24gbGlua3MsIGFzIHRvIGRlbGl2ZXIgYSA8ZW0+ZmFzdGVyIHBlcmNlaXZlZCBodW1hbiBleHBlcmllbmNlPC9lbT4uPC9wPlxcbjxwPlRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmEgZmV3IGNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4geW91IGNhbiB1c2UgdG8gZW5oYW5jZSB5b3VyIGRldmVsb3BtZW50IGV4cGVyaWVuY2UsIGFzIHdlbGwuPC9wPlxcbjxwPldpdGggVGF1bnVzIHlvdSYjMzk7bGwgYmUgaW4gY2hhcmdlLiA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5BcmUgeW91IHJlYWR5IHRvIGdldCBzdGFydGVkPzwvYT48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA3LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmFtaWxpYXJpdHlcXFwiPkZhbWlsaWFyaXR5PC9oMT5cXG48cD5Zb3UgY2FuIHVzZSBUYXVudXMgdG8gZGV2ZWxvcCBhcHBsaWNhdGlvbnMgdXNpbmcgeW91ciBmYXZvcml0ZSBOb2RlLmpzIEhUVFAgc2VydmVyLCA8c3Ryb25nPmJvdGggPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGFuZCA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4gYXJlIGZ1bGx5IHN1cHBvcnRlZDwvc3Ryb25nPi4gSW4gYm90aCBjYXNlcywgeW91JiMzOTtsbCA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5idWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSYjMzk7cmUgYWxyZWFkeSB1c2VkIHRvPC9hPiwgZXhjZXB0IHlvdSB3b24mIzM5O3QgaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiB0aGUgdmlldyBjb250cm9sbGVycyBvciBkZWZpbmUgYW55IHZpZXcgcm91dGVzIHNpbmNlIFRhdW51cyB3aWxsIGRlYWwgd2l0aCB0aGF0IG9uIHlvdXIgYmVoYWxmLiBJbiB0aGUgY29udHJvbGxlcnMgeW91JiMzOTtsbCBiZSBhYmxlIHRvIGRvIGV2ZXJ5dGhpbmcgeW91JiMzOTtyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSYjMzk7bGwgaGF2ZSB0byByZXR1cm4gYSBKU09OIG1vZGVsIHdoaWNoIHdpbGwgYmUgdXNlZCB0byByZW5kZXIgYSB2aWV3LjwvcD5cXG48cD5Zb3UgY2FuIHVzZSBhbnkgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgeW91IHdhbnQsIHByb3ZpZGVkIHRoYXQgaXQgY2FuIGJlIGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuIFRoYXQmIzM5O3MgYmVjYXVzZSBUYXVudXMgdHJlYXRzIHZpZXdzIGFzIG1lcmUgSmF2YVNjcmlwdCBmdW5jdGlvbnMsIHJhdGhlciB0aGFuIGJlaW5nIHRpZWQgaW50byBhIHNwZWNpZmljIHZpZXctcmVuZGVyaW5nIGVuZ2luZS48L3A+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGp1c3QgZnVuY3Rpb25zLCB0b28uIFlvdSBjYW4gYnJpbmcgeW91ciBvd24gc2VsZWN0b3IgZW5naW5lLCB5b3VyIG93biBBSkFYIGxpYnJhcmllcywgYW5kIHlvdXIgb3duIGRhdGEtYmluZGluZyBzb2x1dGlvbnMuIEl0IG1pZ2h0IG1lYW4gdGhlcmUmIzM5O3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UmIzM5O2xsIGFsc28gYmUgZnJlZSB0byBwaWNrIHdoYXRldmVyIGxpYnJhcmllcyB5b3UmIzM5O3JlIG1vc3QgY29tZm9ydGFibGUgd2l0aCEgVGhhdCBiZWluZyBzYWlkLCBUYXVudXMgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5kb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXM8L2E+IHRoYXQgd29yayB3ZWxsIHdpdGggaXQuPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IFRhdW51cz9cXG5cXG4gICAgVGF1bnVzIGZvY3VzZXMgb24gZGVsaXZlcmluZyBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgZXhwZXJpZW5jZSB0byB0aGUgZW5kLXVzZXIsIHdoaWxlIHByb3ZpZGluZyBfYSByZWFzb25hYmxlIGRldmVsb3BtZW50IGV4cGVyaWVuY2VfIGFzIHdlbGwuICoqVGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQqKi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS5cXG5cXG4gICAgV2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgKipbdXNhYmlsaXR5XVsyXSBhbmQgcGVyZm9ybWFuY2UgYXJlIGJvdGggY29yZSBjb25jZXJucyoqIGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgKipzdGlsbCBleHBlY3RlZCB0byB3b3JrKiouXFxuXFxuICAgIEZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSBgY2xpY2tgIGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0J3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0ICoqb3VyIHNpdGVzIGRvbid0IG5lZWQgdG8gbG9vayBhbmQgYmVoYXZlIHRoZSBzYW1lIG9uIGV2ZXJ5IGJyb3dzZXIqKi4gU2ltaWxhcmx5LCBbcGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZF1bMV0gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC5cXG5cXG4gICAgV2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCBfKG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSlfIG9yIGJlY2F1c2UgdGhlIHVzZXIgYmxvY2tlZCBKYXZhU2NyaXB0LCB5b3VyIGFwcGxpY2F0aW9uIHdpbGwgc3RpbGwgd29yayFcXG5cXG4gICAgWzFdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXG4gICAgWzJdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFdoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz9cXG5cXG4gICAgTWFueSBvdGhlciBmcmFtZXdvcmtzIHdlcmVuJ3QgZGVzaWduZWQgd2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgb3IgZXZlbiBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJ3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIFtkb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgZGlnZXN0aWJsZSBjb250ZW50XVsyXS4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIHRoYXQgd29uJ3Qgc29sdmUgYWxsIHlvdXIgcHJvYmxlbXMuIEdvb2dsZSBpc24ndCB0aGUgb25seSB3ZWIgY3Jhd2xlciBvcGVyYXRvciBvdXQgdGhlcmUsIGFuZCBpdCBtaWdodCBiZSBhIHdoaWxlIGJlZm9yZSBzb2NpYWwgbWVkaWEgbGluayBjcmF3bGVycyBjYXRjaCB1cCB3aXRoIHRoZW0uIEV2ZW4gaWYgY3Jhd2xlcnMgYXJlIG5vdCBhbiBpc3N1ZSwgYmVpbmcgYWJsZSB0byBwcm92aWRlIHRoZSBmYXN0ZXN0IHBvc3NpYmxlIGV4cGVyaWVuY2UgaXMgYSBiaWcgcHJvYmxlbSB0byByZXNvbHZlLlxcblxcbiAgICBMYXRlbHksIG1hbnkgbWF0dXJlIG9wZW4tc291cmNlIGZyYW1ld29ya3Mgc3RhcnRlZCBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQsIHdoZXJlIHRoZSBkZXZlbG9wZXIgaXMgcHV0IGZpcnN0LiAqKlRhdW51cyBpcyBbI2h1bWFuZmlyc3RdWzFdKiosIG1lYW5pbmcgdGhhdCBpdCBjb25jZWRlcyB0aGF0IGh1bWFucyBhcmUgbW9yZSBpbXBvcnRhbnQgdGhhbiB0aGUgZGV2ZWxvcGVycyBidWlsZGluZyB0aGVpciBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIFByb2dyZXNzaXZlbHkgZW5oYW5jZWQgYXBwbGljYXRpb25zIGFyZSBhbHdheXMgZ29pbmcgdG8gaGF2ZSBncmVhdCBicm93c2VyIHN1cHBvcnQgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIF8odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudClfLCBhbmQgdGhlbiBlbmhhbmNlIGl0ICoqaWYgcG9zc2libGUqKiB1c2luZyBDU1MgYW5kIEphdmFTY3JpcHQuIEJ1aWxkaW5nIGFwcGxpY2F0aW9ucyBpbiB0aGlzIHdheSBtZWFucyB0aGF0ICoqeW91J2xsIGJlIGFibGUgdG8gcmVhY2ggdGhlIG1vc3QgcGVvcGxlIHdpdGggeW91ciBjb3JlIGV4cGVyaWVuY2UqKiwgYW5kIHlvdSdsbCBhbHNvIGJlIGFibGUgdG8gcHJvdmlkZSBodW1hbnMgaW4gbW9yZSBtb2Rlcm4gYnJvd3NlcnMgd2l0aCBhbGwgb2YgdGhlIGxhdGVzdCBmZWF0dXJlcyBhbmQgdGVjaG5vbG9naWVzLlxcblxcbiAgICBbMV06IGh0dHBzOi8vdHdpdHRlci5jb20vaGFzaHRhZy9odW1hbmZpcnN0XFxuICAgIFsyXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgRmVhdHVyZXNcXG5cXG4gICAgT3V0IG9mIHRoZSBib3gsIFRhdW51cyBlbnN1cmVzIHRoYXQgeW91ciBzaXRlIHdvcmtzIG9uIGFueSBIVE1MLWVuYWJsZWQgZG9jdW1lbnQgdmlld2VyLCBvciBldmVuIG9uIHRoZSB0ZXJtaW5hbCwgcHJvdmlkaW5nIHN1cHBvcnQgZm9yIHBsYWluIHRleHQgcmVzcG9uc2VzIFt3aXRob3V0IGFueSBjb25maWd1cmF0aW9uIG5lZWRlZF1bMl0uIEV2ZW4gd2hpbGUgVGF1bnVzIHByb3ZpZGVzIHNoYXJlZC1yZW5kZXJpbmcgY2FwYWJpbGl0aWVzLCBpdCBvZmZlcnMgY29kZSByZXVzZSBvZiB2aWV3cyBhbmQgcm91dGVzLCBtZWFuaW5nIHlvdSdsbCBvbmx5IGhhdmUgdG8gZGVjbGFyZSB0aGVzZSBvbmNlIGJ1dCB0aGV5J2xsIGJlIHVzZWQgaW4gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZS5cXG5cXG4gICAgVGF1bnVzIGZlYXR1cmVzIGEgcmVhc29uYWJseSBlbmhhbmNlZCBleHBlcmllbmNlLCB3aGVyZSBpZiBmZWF0dXJlcyBhcmVuJ3QgYXZhaWxhYmxlIG9uIGEgYnJvd3NlciwgdGhleSdyZSBqdXN0IG5vdCBwcm92aWRlZC4gRm9yIGV4YW1wbGUsIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgbWFrZXMgdXNlIG9mIHRoZSBgaGlzdG9yeWAgQVBJIGJ1dCBpZiB0aGF0J3Mgbm90IGF2YWlsYWJsZSB0aGVuIGl0J2xsIGZhbGwgYmFjayB0byBzaW1wbHkgbm90IG1lZGRsaW5nIHdpdGggbGlua3MgaW5zdGVhZCBvZiB1c2luZyBhIGNsaWVudC1zaWRlLW9ubHkgaGFzaCByb3V0ZXIuXFxuXFxuICAgIFRhdW51cyBjYW4gZGVhbCB3aXRoIHZpZXcgY2FjaGluZyBvbiB5b3VyIGJlaGFsZiwgaWYgeW91IHNvIGRlc2lyZSwgdXNpbmcgW2FzeW5jaHJvbm91cyBlbWJlZGRlZCBkYXRhYmFzZSBzdG9yZXNdWzNdIG9uIHRoZSBjbGllbnQtc2lkZS4gVHVybnMgb3V0LCB0aGVyZSdzIFtwcmV0dHkgZ29vZCBicm93c2VyIHN1cHBvcnQgZm9yIEluZGV4ZWREQl1bNF0uIE9mIGNvdXJzZSwgSW5kZXhlZERCIHdpbGwgb25seSBiZSB1c2VkIGlmIGl0J3MgYXZhaWxhYmxlLCBhbmQgaWYgaXQncyBub3QgdGhlbiB2aWV3IG1vZGVscyB3b24ndCBiZSBjYWNoZWQgaW4gdGhlIGNsaWVudC1zaWRlIGJlc2lkZXMgYW4gaW4tbWVtb3J5IHN0b3JlLiAqKlRoZSBzaXRlIHdvbid0IHNpbXBseSByb2xsIG92ZXIgYW5kIGRpZSwgdGhvdWdoLioqXFxuXFxuICAgIElmIHlvdSd2ZSB0dXJuZWQgY2xpZW50LXNpZGUgY2FjaGluZyBvbiwgdGhlbiB5b3UgY2FuIGFsc28gdHVybiBvbiB0aGUgKip2aWV3IHByZS1mZXRjaGluZyBmZWF0dXJlKiosIHdoaWNoIHdpbGwgc3RhcnQgZG93bmxvYWRpbmcgdmlld3MgYXMgc29vbiBhcyBodW1hbnMgaG92ZXIgb24gbGlua3MsIGFzIHRvIGRlbGl2ZXIgYSBfZmFzdGVyIHBlcmNlaXZlZCBodW1hbiBleHBlcmllbmNlXy5cXG5cXG4gICAgVGF1bnVzIHByb3ZpZGVzIHRoZSBiYXJlIGJvbmVzIGZvciB5b3VyIGFwcGxpY2F0aW9uIHNvIHRoYXQgeW91IGNhbiBzZXBhcmF0ZSBjb25jZXJucyBpbnRvIHJvdXRlcywgY29udHJvbGxlcnMsIG1vZGVscywgYW5kIHZpZXdzLiBUaGVuIGl0IGdldHMgb3V0IG9mIHRoZSB3YXksIGJ5IGRlc2lnbi4gVGhlcmUgYXJlIFthIGZldyBjb21wbGVtZW50YXJ5IG1vZHVsZXNdWzFdIHlvdSBjYW4gdXNlIHRvIGVuaGFuY2UgeW91ciBkZXZlbG9wbWVudCBleHBlcmllbmNlLCBhcyB3ZWxsLlxcblxcbiAgICBXaXRoIFRhdW51cyB5b3UnbGwgYmUgaW4gY2hhcmdlLiBbQXJlIHlvdSByZWFkeSB0byBnZXQgc3RhcnRlZD9dWzJdXFxuXFxuICAgIFsxXTogL2NvbXBsZW1lbnRzXFxuICAgIFsyXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbM106IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxuICAgIFs0XTogaHR0cDovL2Nhbml1c2UuY29tLyNzZWFyY2g9aW5kZXhlZGRiXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBGYW1pbGlhcml0eVxcblxcbiAgICBZb3UgY2FuIHVzZSBUYXVudXMgdG8gZGV2ZWxvcCBhcHBsaWNhdGlvbnMgdXNpbmcgeW91ciBmYXZvcml0ZSBOb2RlLmpzIEhUVFAgc2VydmVyLCAqKmJvdGggW0V4cHJlc3NdWzNdIGFuZCBbSGFwaV1bNF0gYXJlIGZ1bGx5IHN1cHBvcnRlZCoqLiBJbiBib3RoIGNhc2VzLCB5b3UnbGwgW2J1aWxkIGNvbnRyb2xsZXJzIHRoZSB3YXkgeW91J3JlIGFscmVhZHkgdXNlZCB0b11bMV0sIGV4Y2VwdCB5b3Ugd29uJ3QgaGF2ZSB0byBgcmVxdWlyZWAgdGhlIHZpZXcgY29udHJvbGxlcnMgb3IgZGVmaW5lIGFueSB2aWV3IHJvdXRlcyBzaW5jZSBUYXVudXMgd2lsbCBkZWFsIHdpdGggdGhhdCBvbiB5b3VyIGJlaGFsZi4gSW4gdGhlIGNvbnRyb2xsZXJzIHlvdSdsbCBiZSBhYmxlIHRvIGRvIGV2ZXJ5dGhpbmcgeW91J3JlIGFscmVhZHkgYWJsZSB0byBkbywgYW5kIHRoZW4geW91J2xsIGhhdmUgdG8gcmV0dXJuIGEgSlNPTiBtb2RlbCB3aGljaCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIGEgdmlldy5cXG5cXG4gICAgWW91IGNhbiB1c2UgYW55IHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IHlvdSB3YW50LCBwcm92aWRlZCB0aGF0IGl0IGNhbiBiZSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLiBUaGF0J3MgYmVjYXVzZSBUYXVudXMgdHJlYXRzIHZpZXdzIGFzIG1lcmUgSmF2YVNjcmlwdCBmdW5jdGlvbnMsIHJhdGhlciB0aGFuIGJlaW5nIHRpZWQgaW50byBhIHNwZWNpZmljIHZpZXctcmVuZGVyaW5nIGVuZ2luZS5cXG5cXG4gICAgQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGp1c3QgZnVuY3Rpb25zLCB0b28uIFlvdSBjYW4gYnJpbmcgeW91ciBvd24gc2VsZWN0b3IgZW5naW5lLCB5b3VyIG93biBBSkFYIGxpYnJhcmllcywgYW5kIHlvdXIgb3duIGRhdGEtYmluZGluZyBzb2x1dGlvbnMuIEl0IG1pZ2h0IG1lYW4gdGhlcmUncyBhIGJpdCBtb3JlIHdvcmsgaW52b2x2ZWQgZm9yIHlvdSwgYnV0IHlvdSdsbCBhbHNvIGJlIGZyZWUgdG8gcGljayB3aGF0ZXZlciBsaWJyYXJpZXMgeW91J3JlIG1vc3QgY29tZm9ydGFibGUgd2l0aCEgVGhhdCBiZWluZyBzYWlkLCBUYXVudXMgW2RvZXMgcmVjb21tZW5kIGEgZmV3IGxpYnJhcmllc11bMl0gdGhhdCB3b3JrIHdlbGwgd2l0aCBpdC5cXG5cXG4gICAgWzFdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFsyXTogL2NvbXBsZW1lbnRzXFxuICAgIFszXTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzRdOiBodHRwOi8vaGFwaWpzLmNvbVxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhcGkobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImFwaS1kb2N1bWVudGF0aW9uXFxcIj5BUEkgRG9jdW1lbnRhdGlvbjwvaDE+XFxuPHA+SGVyZSYjMzk7cyB0aGUgQVBJIGRvY3VtZW50YXRpb24gZm9yIFRhdW51cy4gSWYgeW91JiMzOTt2ZSBuZXZlciB1c2VkIGl0IGJlZm9yZSwgd2UgcmVjb21tZW5kIGdvaW5nIG92ZXIgdGhlIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvYT4gZ3VpZGUgYmVmb3JlIGp1bXBpbmcgaW50byB0aGUgQVBJIGRvY3VtZW50YXRpb24uIFRoYXQgd2F5LCB5b3UmIzM5O2xsIGdldCBhIGJldHRlciBpZGVhIG9mIHdoYXQgdG8gbG9vayBmb3IgYW5kIGhvdyB0byBwdXQgdG9nZXRoZXIgc2ltcGxlIGFwcGxpY2F0aW9ucyB1c2luZyBUYXVudXMsIGJlZm9yZSBnb2luZyB0aHJvdWdoIGRvY3VtZW50YXRpb24gb24gZXZlcnkgcHVibGljIGludGVyZmFjZSB0byBUYXVudXMuPC9wPlxcbjxwPlRhdW51cyBleHBvc2VzIDxlbT50aHJlZSBkaWZmZXJlbnQgcHVibGljIEFQSXM8L2VtPiwgYW5kIHRoZXJlJiMzOTtzIGFsc28gPHN0cm9uZz5wbHVnaW5zIHRvIGludGVncmF0ZSBUYXVudXMgYW5kIGFuIEhUVFAgc2VydmVyPC9zdHJvbmc+LiBUaGlzIGRvY3VtZW50IGNvdmVycyBhbGwgdGhyZWUgQVBJcyBleHRlbnNpdmVseS4gSWYgeW91JiMzOTtyZSBjb25jZXJuZWQgYWJvdXQgdGhlIGlubmVyIHdvcmtpbmdzIG9mIFRhdW51cywgcGxlYXNlIHJlZmVyIHRvIHRoZSA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5HZXR0aW5nIFN0YXJ0ZWQ8L2E+IGd1aWRlLiBUaGlzIGRvY3VtZW50IGFpbXMgdG8gb25seSBjb3ZlciBob3cgdGhlIHB1YmxpYyBpbnRlcmZhY2UgYWZmZWN0cyBhcHBsaWNhdGlvbiBzdGF0ZSwgYnV0IDxzdHJvbmc+ZG9lc24mIzM5O3QgZGVsdmUgaW50byBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzPC9zdHJvbmc+LjwvcD5cXG48aDEgaWQ9XFxcInRhYmxlLW9mLWNvbnRlbnRzXFxcIj5UYWJsZSBvZiBDb250ZW50czwvaDE+XFxuPHVsPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNzZXJ2ZXItc2lkZS1hcGlcXFwiPnNlcnZlci1zaWRlIEFQSTwvYT4gdGhhdCBkZWFscyB3aXRoIHNlcnZlci1zaWRlIHJlbmRlcmluZzx1bD5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiBtZXRob2Q8dWw+XFxuPGxpPkl0cyA8YSBocmVmPVxcXCIjdGhlLW9wdGlvbnMtb2JqZWN0XFxcIj48Y29kZT5vcHRpb25zPC9jb2RlPjwvYT4gYXJndW1lbnQ8dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1sYXlvdXQtXFxcIj48Y29kZT5sYXlvdXQ8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1yb3V0ZXMtXFxcIj48Y29kZT5yb3V0ZXM8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLVxcXCI+PGNvZGU+Z2V0RGVmYXVsdFZpZXdNb2RlbDwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXBsYWludGV4dC1cXFwiPjxjb2RlPnBsYWludGV4dDwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXJlc29sdmVycy1cXFwiPjxjb2RlPnJlc29sdmVyczwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXZlcnNpb24tXFxcIj48Y29kZT52ZXJzaW9uPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtZGVmZXJtaW5pZmllZC1cXFwiPjxjb2RlPmRlZmVyTWluaWZpZWQ8L2NvZGU+PC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5JdHMgPGEgaHJlZj1cXFwiIy1hZGRyb3V0ZS1kZWZpbml0aW9uLVxcXCI+PGNvZGU+YWRkUm91dGU8L2NvZGU+PC9hPiBhcmd1bWVudDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LVxcXCI+PGNvZGU+dGF1bnVzLnJlbmRlcjwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNzZXJ2ZXItc2lkZS1jb250cm9sbGVyc1xcXCI+U2VydmVyLXNpZGUgY29udHJvbGxlcnM8L2E+PC9saT5cXG48bGk+QSA8YSBocmVmPVxcXCIjaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+c3VpdGUgb2YgcGx1Z2luczwvYT4gY2FuIGludGVncmF0ZSBUYXVudXMgYW5kIGFuIEhUVFAgc2VydmVyPHVsPlxcbjxsaT5Vc2luZyA8YSBocmVmPVxcXCIjdXNpbmctdGF1bnVzLWV4cHJlc3MtXFxcIj48Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT48L2E+IGZvciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT48L2xpPlxcbjxsaT5Vc2luZyA8YSBocmVmPVxcXCIjdXNpbmctdGF1bnVzLWhhcGktXFxcIj48Y29kZT50YXVudXMtaGFwaTwvY29kZT48L2E+IGZvciA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+QSA8YSBocmVmPVxcXCIjY29tbWFuZC1saW5lLWludGVyZmFjZVxcXCI+Q0xJIHRoYXQgcHJvZHVjZXMgYSB3aXJpbmcgbW9kdWxlPC9hPiBmb3IgdGhlIGNsaWVudC1zaWRlPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy1vdXRwdXQtXFxcIj48Y29kZT4tLW91dHB1dDwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy13YXRjaC1cXFwiPjxjb2RlPi0td2F0Y2g8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdHJhbnNmb3JtLW1vZHVsZS1cXFwiPjxjb2RlPi0tdHJhbnNmb3JtICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLWRlZmVyLWFjdGlvbnMtXFxcIj48Y29kZT4tLWRlZmVyPC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXJlc29sdmVycy1tb2R1bGUtXFxcIj48Y29kZT4tLXJlc29sdmVycyAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy1idW5kbGUtXFxcIj48Y29kZT4tLWJ1bmRsZTwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+QSA8YSBocmVmPVxcXCIjY2xpZW50LXNpZGUtYXBpXFxcIj5jbGllbnQtc2lkZSBBUEk8L2E+IHRoYXQgZGVhbHMgd2l0aCBjbGllbnQtc2lkZSByZW5kZXJpbmc8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiBtZXRob2Q8dWw+XFxuPGxpPlVzaW5nIHRoZSA8YSBocmVmPVxcXCIjdXNpbmctdGhlLWF1dG8tc3RyYXRlZ3lcXFwiPjxjb2RlPmF1dG88L2NvZGU+PC9hPiBzdHJhdGVneTwvbGk+XFxuPGxpPlVzaW5nIHRoZSA8YSBocmVmPVxcXCIjdXNpbmctdGhlLWlubGluZS1zdHJhdGVneVxcXCI+PGNvZGU+aW5saW5lPC9jb2RlPjwvYT4gc3RyYXRlZ3k8L2xpPlxcbjxsaT5Vc2luZyB0aGUgPGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3lcXFwiPjxjb2RlPm1hbnVhbDwvY29kZT48L2E+IHN0cmF0ZWd5PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2NhY2hpbmdcXFwiPkNhY2hpbmc8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3ByZWZldGNoaW5nXFxcIj5QcmVmZXRjaGluZzwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdmVyc2lvbmluZ1xcXCI+VmVyc2lvbmluZzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub248L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2U8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb2ZmLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub2ZmPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLWludGVyY2VwdC1hY3Rpb24tZm4tXFxcIj48Y29kZT50YXVudXMuaW50ZXJjZXB0PC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1cXFwiPjxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW5hdmlnYXRlLXVybC1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZTwvY29kZT48L2E+IG1ldGhvZDx1bD5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLWVxdWFscy1yb3V0ZS1yb3V0ZS1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZS5lcXVhbHM8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXN0YXRlLVxcXCI+PGNvZGU+dGF1bnVzLnN0YXRlPC9jb2RlPjwvYT4gcHJvcGVydHk8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMteGhyLXVybC1vcHRpb25zLWRvbmUtXFxcIj48Y29kZT50YXVudXMueGhyPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2RlYnVnZ2luZy10YXVudXNcXFwiPkRlYnVnZ2luZyBUYXVudXM8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjbGllbnQtc2lkZS1jb250cm9sbGVyc1xcXCI+Q2xpZW50LXNpZGUgY29udHJvbGxlcnM8L2E+PC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiN0aGUtdGF1bnVzcmMtbWFuaWZlc3RcXFwiPjxjb2RlPi50YXVudXNyYzwvY29kZT48L2E+IG1hbmlmZXN0PC9saT5cXG48L3VsPlxcbjxoMSBpZD1cXFwic2VydmVyLXNpZGUtYXBpXFxcIj5TZXJ2ZXItc2lkZSBBUEk8L2gxPlxcbjxwPlRoZSBzZXJ2ZXItc2lkZSBBUEkgaXMgdXNlZCB0byBzZXQgdXAgdGhlIHZpZXcgcm91dGVyLiBJdCB0aGVuIGdldHMgb3V0IG9mIHRoZSB3YXksIGFsbG93aW5nIHRoZSBjbGllbnQtc2lkZSB0byBldmVudHVhbGx5IHRha2Ugb3ZlciBhbmQgYWRkIGFueSBleHRyYSBzdWdhciBvbiB0b3AsIDxlbT5pbmNsdWRpbmcgY2xpZW50LXNpZGUgcmVuZGVyaW5nPC9lbT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50KGFkZFJvdXRlLCBvcHRpb25zPyk8L2NvZGU+PC9oMj5cXG48cD5Nb3VudHMgVGF1bnVzIG9uIHRvcCBvZiBhIHNlcnZlci1zaWRlIHJvdXRlciwgYnkgcmVnaXN0ZXJpbmcgZWFjaCByb3V0ZSBpbiA8Y29kZT5vcHRpb25zLnJvdXRlczwvY29kZT4gd2l0aCB0aGUgPGNvZGU+YWRkUm91dGU8L2NvZGU+IG1ldGhvZC48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+Tm90ZSB0aGF0IG1vc3Qgb2YgdGhlIHRpbWUsIDxzdHJvbmc+dGhpcyBtZXRob2Qgc2hvdWxkbiYjMzk7dCBiZSBpbnZva2VkIGRpcmVjdGx5PC9zdHJvbmc+LCBidXQgcmF0aGVyIHRocm91Z2ggb25lIG9mIHRoZSA8YSBocmVmPVxcXCIjaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+SFRUUCBmcmFtZXdvcmsgcGx1Z2luczwvYT4gcHJlc2VudGVkIGJlbG93LjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+SGVyZSYjMzk7cyBhbiBpbmNvbXBsZXRlIGV4YW1wbGUgb2YgaG93IHRoaXMgbWV0aG9kIG1heSBiZSB1c2VkLiBJdCBpcyBpbmNvbXBsZXRlIGJlY2F1c2Ugcm91dGUgZGVmaW5pdGlvbnMgaGF2ZSBtb3JlIG9wdGlvbnMgYmV5b25kIHRoZSA8Y29kZT5yb3V0ZTwvY29kZT4gYW5kIDxjb2RlPmFjdGlvbjwvY29kZT4gcHJvcGVydGllcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudGF1bnVzLm1vdW50KGFkZFJvdXRlLCB7XFxuICByb3V0ZXM6IFt7IHJvdXRlOiAmIzM5Oy8mIzM5OywgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5OyB9XVxcbn0pO1xcblxcbmZ1bmN0aW9uIGFkZFJvdXRlIChkZWZpbml0aW9uKSB7XFxuICBhcHAuZ2V0KGRlZmluaXRpb24ucm91dGUsIGRlZmluaXRpb24uYWN0aW9uKTtcXG59XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxldCYjMzk7cyBnbyBvdmVyIHRoZSBvcHRpb25zIHlvdSBjYW4gcGFzcyB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGZpcnN0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInRoZS1vcHRpb25zLW9iamVjdFxcXCI+VGhlIDxjb2RlPm9wdGlvbnM/PC9jb2RlPiBvYmplY3Q8L2g0PlxcbjxwPlRoZXJlJiMzOTtzIGEgZmV3IG9wdGlvbnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIHRoZSBzZXJ2ZXItc2lkZSBtb3VudHBvaW50LiBZb3UmIzM5O3JlIHByb2JhYmx5IGdvaW5nIHRvIGJlIHBhc3NpbmcgdGhlc2UgdG8geW91ciA8YSBocmVmPVxcXCIjaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+SFRUUCBmcmFtZXdvcmsgcGx1Z2luPC9hPiwgcmF0aGVyIHRoYW4gdXNpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBkaXJlY3RseS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1sYXlvdXQtXFxcIj48Y29kZT5vcHRpb25zLmxheW91dD88L2NvZGU+PC9oNj5cXG48cD5UaGUgPGNvZGU+bGF5b3V0PC9jb2RlPiBwcm9wZXJ0eSBpcyBleHBlY3RlZCB0byBoYXZlIHRoZSA8Y29kZT5mdW5jdGlvbihkYXRhKTwvY29kZT4gc2lnbmF0dXJlLiBJdCYjMzk7bGwgYmUgaW52b2tlZCB3aGVuZXZlciBhIGZ1bGwgSFRNTCBkb2N1bWVudCBuZWVkcyB0byBiZSByZW5kZXJlZCwgYW5kIGEgPGNvZGU+ZGF0YTwvY29kZT4gb2JqZWN0IHdpbGwgYmUgcGFzc2VkIHRvIGl0LiBUaGF0IG9iamVjdCB3aWxsIGNvbnRhaW4gZXZlcnl0aGluZyB5b3UmIzM5O3ZlIHNldCBhcyB0aGUgdmlldyBtb2RlbCwgcGx1cyBhIDxjb2RlPnBhcnRpYWw8L2NvZGU+IHByb3BlcnR5IGNvbnRhaW5pbmcgdGhlIHJhdyBIVE1MIG9mIHRoZSByZW5kZXJlZCBwYXJ0aWFsIHZpZXcuIFlvdXIgPGNvZGU+bGF5b3V0PC9jb2RlPiBtZXRob2Qgd2lsbCB0eXBpY2FsbHkgd3JhcCB0aGUgcmF3IEhUTUwgZm9yIHRoZSBwYXJ0aWFsIHdpdGggdGhlIGJhcmUgYm9uZXMgb2YgYW4gSFRNTCBkb2N1bWVudC4gQ2hlY2sgb3V0IDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi8zMzI3MTc1MTMxMmRiNmU5MjA1OWQ5ODI5M2QwYTdhYzZlOWU4ZTViL3ZpZXdzL3NlcnZlci9sYXlvdXQvbGF5b3V0LmphZGVcXFwiPnRoZSA8Y29kZT5sYXlvdXQuamFkZTwvY29kZT4gdXNlZCBpbiBQb255IEZvbzwvYT4gYXMgYW4gZXhhbXBsZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1yb3V0ZXMtXFxcIj48Y29kZT5vcHRpb25zLnJvdXRlczwvY29kZT48L2g2PlxcbjxwPlRoZSBvdGhlciBiaWcgb3B0aW9uIGlzIDxjb2RlPnJvdXRlczwvY29kZT4sIHdoaWNoIGV4cGVjdHMgYSBjb2xsZWN0aW9uIG9mIHJvdXRlIGRlZmluaXRpb25zLiBSb3V0ZSBkZWZpbml0aW9ucyB1c2UgYSBudW1iZXIgb2YgcHJvcGVydGllcyB0byBkZXRlcm1pbmUgaG93IHRoZSByb3V0ZSBpcyBnb2luZyB0byBiZWhhdmUuPC9wPlxcbjxwPkhlcmUmIzM5O3MgYW4gZXhhbXBsZSByb3V0ZSB0aGF0IHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiByb3V0aW5nIHNjaGVtZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+e1xcbiAgcm91dGU6ICYjMzk7L2FydGljbGVzLzpzbHVnJiMzOTssXFxuICBhY3Rpb246ICYjMzk7YXJ0aWNsZXMvYXJ0aWNsZSYjMzk7LFxcbiAgaWdub3JlOiBmYWxzZSxcXG4gIGNhY2hlOiAmbHQ7aW5oZXJpdCZndDtcXG59XFxuPC9jb2RlPjwvcHJlPlxcbjx1bD5cXG48bGk+PGNvZGU+cm91dGU8L2NvZGU+IGlzIGEgcm91dGUgaW4gdGhlIGZvcm1hdCB5b3VyIEhUVFAgZnJhbWV3b3JrIG9mIGNob2ljZSB1bmRlcnN0YW5kczwvbGk+XFxuPGxpPjxjb2RlPmFjdGlvbjwvY29kZT4gaXMgdGhlIG5hbWUgb2YgeW91ciBjb250cm9sbGVyIGFjdGlvbi4gSXQmIzM5O2xsIGJlIHVzZWQgdG8gZmluZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlciwgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHNob3VsZCBiZSB1c2VkIHdpdGggdGhpcyByb3V0ZSwgYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyPC9saT5cXG48bGk+PGNvZGU+Y2FjaGU8L2NvZGU+IGNhbiBiZSB1c2VkIHRvIGRldGVybWluZSB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBiZWhhdmlvciBpbiB0aGlzIGFwcGxpY2F0aW9uIHBhdGgsIGFuZCBpdCYjMzk7bGwgZGVmYXVsdCB0byBpbmhlcml0aW5nIGZyb20gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gPGVtPm9uIHRoZSBjbGllbnQtc2lkZTwvZW0+PC9saT5cXG48bGk+PGNvZGU+aWdub3JlPC9jb2RlPiBpcyB1c2VkIGluIHRob3NlIGNhc2VzIHdoZXJlIHlvdSB3YW50IGEgVVJMIHRvIGJlIGlnbm9yZWQgYnkgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBldmVuIGlmIHRoZXJlJiMzOTtzIGEgY2F0Y2gtYWxsIHJvdXRlIHRoYXQgd291bGQgbWF0Y2ggdGhhdCBVUkw8L2xpPlxcbjwvdWw+XFxuPHA+QXMgYW4gZXhhbXBsZSBvZiB0aGUgPGNvZGU+aWdub3JlPC9jb2RlPiB1c2UgY2FzZSwgY29uc2lkZXIgdGhlIHJvdXRpbmcgdGFibGUgc2hvd24gYmVsb3cuIFRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZG9lc24mIzM5O3Qga25vdyA8ZW0+KGFuZCBjYW4mIzM5O3Qga25vdyB1bmxlc3MgeW91IHBvaW50IGl0IG91dCk8L2VtPiB3aGF0IHJvdXRlcyBhcmUgc2VydmVyLXNpZGUgb25seSwgYW5kIGl0JiMzOTtzIHVwIHRvIHlvdSB0byBwb2ludCB0aG9zZSBvdXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPltcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7L2hvbWUvaW5kZXgmIzM5OyB9LFxcbiAgeyByb3V0ZTogJiMzOTsvZmVlZCYjMzk7LCBpZ25vcmU6IHRydWUgfSxcXG4gIHsgcm91dGU6ICYjMzk7LyomIzM5OywgYWN0aW9uOiAmIzM5O2Vycm9yL25vdC1mb3VuZCYjMzk7IH1cXG5dXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoaXMgc3RlcCBpcyBuZWNlc3Nhcnkgd2hlbmV2ZXIgeW91IGhhdmUgYW4gYW5jaG9yIGxpbmsgcG9pbnRlZCBhdCBzb21ldGhpbmcgbGlrZSBhbiBSU1MgZmVlZC4gVGhlIDxjb2RlPmlnbm9yZTwvY29kZT4gcHJvcGVydHkgaXMgZWZmZWN0aXZlbHkgdGVsbGluZyB0aGUgY2xpZW50LXNpZGUgPGVtPiZxdW90O2RvbiYjMzk7dCBoaWphY2sgbGlua3MgY29udGFpbmluZyB0aGlzIFVSTCZxdW90OzwvZW0+LjwvcD5cXG48cD5QbGVhc2Ugbm90ZSB0aGF0IGV4dGVybmFsIGxpbmtzIGFyZSBuZXZlciBoaWphY2tlZC4gT25seSBzYW1lLW9yaWdpbiBsaW5rcyBjb250YWluaW5nIGEgVVJMIHRoYXQgbWF0Y2hlcyBvbmUgb2YgdGhlIHJvdXRlcyB3aWxsIGJlIGhpamFja2VkIGJ5IFRhdW51cy4gRXh0ZXJuYWwgbGlua3MgZG9uJiMzOTt0IG5lZWQgdG8gYmUgPGNvZGU+aWdub3JlPC9jb2RlPmQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC1cXFwiPjxjb2RlPm9wdGlvbnMuZ2V0RGVmYXVsdFZpZXdNb2RlbD88L2NvZGU+PC9oNj5cXG48cD5UaGUgPGNvZGU+Z2V0RGVmYXVsdFZpZXdNb2RlbChkb25lKTwvY29kZT4gcHJvcGVydHkgY2FuIGJlIGEgbWV0aG9kIHRoYXQgcHV0cyB0b2dldGhlciB0aGUgYmFzZSB2aWV3IG1vZGVsLCB3aGljaCB3aWxsIHRoZW4gYmUgZXh0ZW5kZWQgb24gYW4gYWN0aW9uLWJ5LWFjdGlvbiBiYXNpcy4gV2hlbiB5b3UmIzM5O3JlIGRvbmUgY3JlYXRpbmcgYSB2aWV3IG1vZGVsLCB5b3UgY2FuIGludm9rZSA8Y29kZT5kb25lKG51bGwsIG1vZGVsKTwvY29kZT4uIElmIGFuIGVycm9yIG9jY3VycyB3aGlsZSBidWlsZGluZyB0aGUgdmlldyBtb2RlbCwgeW91IHNob3VsZCBjYWxsIDxjb2RlPmRvbmUoZXJyKTwvY29kZT4gaW5zdGVhZC48L3A+XFxuPHA+VGF1bnVzIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgPGNvZGU+ZG9uZTwvY29kZT4gaXMgaW52b2tlZCB3aXRoIGFuIGVycm9yLCBzbyB5b3UgbWlnaHQgd2FudCB0byBwdXQgc2FmZWd1YXJkcyBpbiBwbGFjZSBhcyB0byBhdm9pZCB0aGF0IGZyb20gaGFwcGVubmluZy4gVGhlIHJlYXNvbiB0aGlzIG1ldGhvZCBpcyBhc3luY2hyb25vdXMgaXMgYmVjYXVzZSB5b3UgbWF5IG5lZWQgZGF0YWJhc2UgYWNjZXNzIG9yIHNvbWVzdWNoIHdoZW4gcHV0dGluZyB0b2dldGhlciB0aGUgZGVmYXVsdHMuIFRoZSByZWFzb24gdGhpcyBpcyBhIG1ldGhvZCBhbmQgbm90IGp1c3QgYW4gb2JqZWN0IGlzIHRoYXQgdGhlIGRlZmF1bHRzIG1heSBjaGFuZ2UgZHVlIHRvIGh1bWFuIGludGVyYWN0aW9uIHdpdGggdGhlIGFwcGxpY2F0aW9uLCBhbmQgaW4gdGhvc2UgY2FzZXMgPGEgaHJlZj1cXFwiI3RhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbFxcXCI+dGhlIGRlZmF1bHRzIGNhbiBiZSByZWJ1aWx0PC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1wbGFpbnRleHQtXFxcIj48Y29kZT5vcHRpb25zLnBsYWludGV4dD88L2NvZGU+PC9oNj5cXG48cD5UaGUgPGNvZGU+cGxhaW50ZXh0PC9jb2RlPiBvcHRpb25zIG9iamVjdCBpcyBwYXNzZWQgZGlyZWN0bHkgdG8gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2hnZXRcXFwiPmhnZXQ8L2E+LCBhbmQgaXQmIzM5O3MgdXNlZCB0byA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvZjZkNmI1MDY4ZmYwM2EzODdmNTAzOTAwMTYwZDlmZGMxZTc0OTc1MC9jb250cm9sbGVycy9yb3V0aW5nLmpzI0w3MC1MNzJcXFwiPnR3ZWFrIHRoZSBwbGFpbnRleHQgdmVyc2lvbjwvYT4gb2YgeW91ciBzaXRlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLXJlc29sdmVycy1cXFwiPjxjb2RlPm9wdGlvbnMucmVzb2x2ZXJzPzwvY29kZT48L2g2PlxcbjxwPlJlc29sdmVycyBhcmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGxvY2F0aW9uIG9mIHNvbWUgb2YgdGhlIGRpZmZlcmVudCBwaWVjZXMgb2YgeW91ciBhcHBsaWNhdGlvbi4gVHlwaWNhbGx5IHlvdSB3b24mIzM5O3QgaGF2ZSB0byB0b3VjaCB0aGVzZSBpbiB0aGUgc2xpZ2h0ZXN0LjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+U2lnbmF0dXJlPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRTZXJ2ZXJDb250cm9sbGVyKGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gc2VydmVyLXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRWaWV3KGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPlRoZSA8Y29kZT5hZGRSb3V0ZTwvY29kZT4gbWV0aG9kIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IG9uIHRoZSBzZXJ2ZXItc2lkZSBpcyBtb3N0bHkgZ29pbmcgdG8gYmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBIVFRQIGZyYW1ld29yayBwbHVnaW5zLCBzbyBmZWVsIGZyZWUgdG8gc2tpcCBvdmVyIHRoZSBmb2xsb3dpbmcgc2VjdGlvbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy12ZXJzaW9uLVxcXCI+PGNvZGU+b3B0aW9ucy52ZXJzaW9uPzwvY29kZT48L2g2PlxcbjxwPlJlZmVyIHRvIHRoZSA8YSBocmVmPVxcXCIjdmVyc2lvbmluZ1xcXCI+VmVyc2lvbmluZzwvYT4gc2VjdGlvbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1nZXRwYXJ0aWFsLVxcXCI+PGNvZGU+b3B0aW9ucy5nZXRQYXJ0aWFsPzwvY29kZT48L2g2PlxcbjxwPkJ5IGRlZmF1bHQsIFRhdW51cyB3aWxsIHJlbmRlciBwYXJ0aWFscyBvbiB0aGUgc2VydmVyLXNpZGUgYnkgbG9va2luZyB1cCB0aGUgbW9kdWxlIGZvciBhbiBhY3Rpb24gbWV0aG9kLCBhbmQgY2FsbGluZyB0aGF0IGFjdGlvbiBwYXNzaW5nIGluIGEgbW9kZWwuPC9wPlxcbjxwPllvdSBjYW4gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgYmVoYXZpb3IgYnkgc2V0dGluZyA8Y29kZT5vcHRpb25zLmdldFBhcnRpYWw8L2NvZGU+IHRvIGEgZnVuY3Rpb24uIFRoaXMgbWV0aG9kIHRha2VzIHRocmVlIHBhcmFtZXRlcnMuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+YWN0aW9uPC9jb2RlPiBpcyB0aGUgYWN0aW9uIHRoYXQgbmVlZHMgdG8gYmUgcmVuZGVyZWQ8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gaXMgdGhlIG1vZGVsIHlvdSBjYW4gdXNlIHRvIHJlbmRlciB0aGUgdmlldyBmb3IgdGhhdCBhY3Rpb248L2xpPlxcbjxsaT48Y29kZT5kb25lKGVyciwgaHRtbCk8L2NvZGU+IGlzIGNhbGxlZCB3aGVuIHlvdSYjMzk7cmUgZG9uZSwgcGFzc2luZyBpbiB0aGUgcmVzdWx0aW5nIDxjb2RlPmh0bWw8L2NvZGU+IGZvciB0aGUgcGFydGlhbDwvbGk+XFxuPC91bD5cXG48cD5Ob3RlIHRoYXQgaWYgeW91IGRvbiYjMzk7dCBzZXQgPGNvZGU+Z2V0UGFydGlhbDwvY29kZT4sIFRhdW51cyB3aWxsIGp1c3QgcmVxdWlyZSB5b3VyIGNvbnRyb2xsZXIgYWN0aW9uIG1ldGhvZCBhbmQgaW52b2tlIHRoYXQgaW5zdGVhZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1kZWZlcm1pbmlmaWVkLVxcXCI+PGNvZGU+b3B0aW9ucy5kZWZlck1pbmlmaWVkPzwvY29kZT48L2g2PlxcbjxwPldoZW4gdmlld3MgYW5kIGNvbnRyb2xsZXJzIGFyZSBsYXppbHkgbG9hZGVkLCB0aGV5IGFyZSBjb21waWxlZCBhbmQgYnVuZGxlZCB1c2luZyBCcm93c2VyaWZ5LiBUYXVudXMgd2lsbCBldmVuIHByb2R1Y2UgYSBzb3VyY2UgbWFwLiBUbyBhdm9pZCB0aGUgc291cmNlIG1hcCwgYW5kIG1pbmlmeSB0aGUgYnVuZGxlIGluc3RlYWQsIHNldCA8Y29kZT5kZWZlck1pbmlmaWVkPC9jb2RlPiB0byA8Y29kZT50cnVlPC9jb2RlPi48L3A+XFxuPHA+WW91JiMzOTtsbCBwcm9iYWJseSB3YW50IHRvIHNldCA8Y29kZT5kZWZlck1pbmlmaWVkPC9jb2RlPiB0byB3aGV0aGVyIHRoZSBhcHBsaWNhdGlvbiBpcyBydW5uaW5nIG9uIHRoZSBwcm9kdWN0aW9uIGVudmlyb25tZW50LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcIi1hZGRyb3V0ZS1kZWZpbml0aW9uLVxcXCI+PGNvZGU+YWRkUm91dGUoZGVmaW5pdGlvbik8L2NvZGU+PC9oND5cXG48cD5UaGUgPGNvZGU+YWRkUm91dGUoZGVmaW5pdGlvbik8L2NvZGU+IG1ldGhvZCB3aWxsIGJlIHBhc3NlZCBhIHJvdXRlIGRlZmluaXRpb24sIGNvbnRhaW5pbmcgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzLiBUaGlzIG1ldGhvZCBpcyBleHBlY3RlZCB0byByZWdpc3RlciBhIHJvdXRlIGluIHlvdXIgSFRUUCBmcmFtZXdvcmsmIzM5O3Mgcm91dGVyLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBpcyB0aGUgcm91dGUgdGhhdCB5b3Ugc2V0IGFzIDxjb2RlPmRlZmluaXRpb24ucm91dGU8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+YWN0aW9uPC9jb2RlPiBpcyB0aGUgYWN0aW9uIGFzIHBhc3NlZCB0byB0aGUgcm91dGUgZGVmaW5pdGlvbjwvbGk+XFxuPGxpPjxjb2RlPmFjdGlvbkZuPC9jb2RlPiB3aWxsIGJlIHRoZSBjb250cm9sbGVyIGZvciB0aGlzIGFjdGlvbiBtZXRob2Q8L2xpPlxcbjxsaT48Y29kZT5taWRkbGV3YXJlPC9jb2RlPiB3aWxsIGJlIGFuIGFycmF5IG9mIG1ldGhvZHMgdG8gYmUgZXhlY3V0ZWQgYmVmb3JlIDxjb2RlPmFjdGlvbkZuPC9jb2RlPjwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LVxcXCI+PGNvZGU+dGF1bnVzLnJlbmRlcihhY3Rpb24sIHZpZXdNb2RlbCwgcmVxLCByZXMsIG5leHQpPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgaXMgYWxtb3N0IGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBhcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIFRhdW51cyB0aHJvdWdoIG9uZSBvZiB0aGUgcGx1Z2lucyBhbnl3YXlzLCBzbyB3ZSB3b24mIzM5O3QgZ28gdmVyeSBkZWVwIGludG8gaXQuPC9wPlxcbjxwPlRoZSByZW5kZXIgbWV0aG9kIGlzIHdoYXQgVGF1bnVzIHVzZXMgdG8gcmVuZGVyIHZpZXdzIGJ5IGNvbnN0cnVjdGluZyBIVE1MLCBKU09OLCBvciBwbGFpbnRleHQgcmVzcG9uc2VzLiBUaGUgPGNvZGU+YWN0aW9uPC9jb2RlPiBwcm9wZXJ0eSBkZXRlcm1pbmVzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCB3aWxsIGJlIHJlbmRlcmVkLiBUaGUgPGNvZGU+dmlld01vZGVsPC9jb2RlPiB3aWxsIGJlIGV4dGVuZGVkIGJ5IDxhIGhyZWY9XFxcIiMtb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLVxcXCI+dGhlIGRlZmF1bHQgdmlldyBtb2RlbDwvYT4sIGFuZCBpdCBtYXkgYWxzbyBvdmVycmlkZSB0aGUgZGVmYXVsdCA8Y29kZT5hY3Rpb248L2NvZGU+IGJ5IHNldHRpbmcgPGNvZGU+dmlld01vZGVsLm1vZGVsLmFjdGlvbjwvY29kZT4uPC9wPlxcbjxwPlRoZSA8Y29kZT5yZXE8L2NvZGU+LCA8Y29kZT5yZXM8L2NvZGU+LCBhbmQgPGNvZGU+bmV4dDwvY29kZT4gYXJndW1lbnRzIGFyZSBleHBlY3RlZCB0byBiZSB0aGUgRXhwcmVzcyByb3V0aW5nIGFyZ3VtZW50cywgYnV0IHRoZXkgY2FuIGFsc28gYmUgbW9ja2VkIDxlbT4od2hpY2ggaXMgaW4gZmFjdCB3aGF0IHRoZSBIYXBpIHBsdWdpbiBkb2VzKTwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS1cXFwiPjxjb2RlPnRhdW51cy5yZWJ1aWxkRGVmYXVsdFZpZXdNb2RlbChkb25lPyk8L2NvZGU+PC9oMj5cXG48cD5PbmNlIFRhdW51cyBoYXMgYmVlbiBtb3VudGVkLCBjYWxsaW5nIHRoaXMgbWV0aG9kIHdpbGwgcmVidWlsZCB0aGUgdmlldyBtb2RlbCBkZWZhdWx0cyB1c2luZyB0aGUgPGNvZGU+Z2V0RGVmYXVsdFZpZXdNb2RlbDwvY29kZT4gdGhhdCB3YXMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gaW4gdGhlIG9wdGlvbnMuIEFuIG9wdGlvbmFsIDxjb2RlPmRvbmU8L2NvZGU+IGNhbGxiYWNrIHdpbGwgYmUgaW52b2tlZCB3aGVuIHRoZSBtb2RlbCBpcyByZWJ1aWx0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInNlcnZlci1zaWRlLWNvbnRyb2xsZXJzXFxcIj5TZXJ2ZXItU2lkZSBDb250cm9sbGVyczwvaDE+XFxuPHA+T24gdGhlIHNlcnZlci1zaWRlLCBjb250cm9sbGVycyBhcmUgbW9kdWxlcyB0aGF0IGV4cG9ydCBhIHNpbmdsZSBmdW5jdGlvbi4gVGhlIHBhcmFtZXRlcnMgcGFzc2VkIHRvIHRoZXNlIGNvbnRyb2xsZXJzIGRlcGVuZCBvbiB0aGUgc2VydmVyLXNpZGUgSFRUUCBmcmFtZXdvcmsgdGhhdCYjMzk7cyBiZWluZyB1c2VkLjwvcD5cXG48cD5Gb3IgZXhhbXBsZSwgRXhwcmVzcyBnaXZlcyB1cyB0aHJlZSBwYXJhbWV0ZXJzOiA8Y29kZT5yZXE8L2NvZGU+LCA8Y29kZT5yZXM8L2NvZGU+IGFuZCA8Y29kZT5uZXh0PC9jb2RlPi4gSGFwaSBnaXZlcyB1cyB0d28gaW5zdGVhZDogPGNvZGU+cmVxdWVzdDwvY29kZT4gYW5kIDxjb2RlPnJlcGx5PC9jb2RlPi48L3A+XFxuPHA+SGVyZSYjMzk7cyBhIHNhbXBsZSBjb250cm9sbGVyIHVzaW5nIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiwgYXMgPGEgaHJlZj1cXFwiI3VzaW5nLXRhdW51cy1leHByZXNzLVxcXCI+ZGV0YWlsZWQgYmVsb3c8L2E+LiBUaGlzIGlzIGEgdmVyeSBzaW1wbGUgY29udHJvbGxlciB3aGVyZSB3ZSBhcmUgc2V0dGluZyB0aGUgc3BlY2lhbCA8Y29kZT52aWV3TW9kZWw8L2NvZGU+IHByb3BlcnR5IG9uIHRoZSByZXNwb25zZSwgYW5kIGNhbGxpbmcgPGNvZGU+bmV4dDwvY29kZT4uIFN1cHBvc2UgdGhpcyBjb250cm9sbGVyIGlzIHRoZSA8Y29kZT5wcm9kdWN0L2hvbWU8L2NvZGU+IGFjdGlvbiBoYW5kbGVyLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgcmVzLnZpZXdNb2RlbCA9IHtcXG4gICAgbW9kZWw6IHtcXG4gICAgICB0aXRsZTogJiMzOTt2aWV3IHRpdGxlJiMzOTtcXG4gICAgfVxcbiAgfTtcXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5BcyB5b3UgY2FuIHNlZSwgVGF1bnVzIHdvbiYjMzk7dCBhbHRlciB0aGUgQVBJIHByb3ZpZGVkIGJ5IEV4cHJlc3MuIEluc3RlYWQsIGl0IGJ1aWxkcyB1cG9uIHRoZSBub3Rpb24gb2YgdXNpbmcgbWlkZGxld2FyZS4gT25jZSB0aGUgPGNvZGU+cHJvZHVjdC9ob21lPC9jb2RlPiB2aWV3IGlzIHJlbmRlcmVkIGFuZCBKYXZhU2NyaXB0IGxvYWRzLCB0aGUgPGNvZGU+cHJvZHVjdC9ob21lPC9jb2RlPiB2aWV3IGNvbnRyb2xsZXIgaXMgZXhlY3V0ZWQgb24gdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5Zb3UgY291bGQgY2hhbmdlIHRoZSB2aWV3IHRvIGJlIHJlbmRlcmVkIGJ5IHNldHRpbmcgdGhlIDxjb2RlPmFjdGlvbjwvY29kZT4gcHJvcGVydHkgb24gdGhlIDxjb2RlPm1vZGVsPC9jb2RlPi4gSW4gdGhlIGV4YW1wbGUgc2hvd24gYmVsb3cgdGhpcyB3b3VsZCBtZWFuIHRoYXQgdGhlIDxjb2RlPmVycm9yL29mZmxpbmU8L2NvZGU+IHZpZXcgd291bGQgYmUgcmVuZGVyZWQuIFRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHdpbGwgYmUgdGhhdCBvZiA8Y29kZT5lcnJvci9vZmZsaW5lPC9jb2RlPiwgYXMgd2VsbC4gVmlldyBjb250cm9sbGVycyBhcmUgdGllZCB0byB0aGUgdmlldyB0aGF0IGdldHMgcmVuZGVyZWQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICByZXMudmlld01vZGVsID0ge1xcbiAgICBtb2RlbDoge1xcbiAgICAgIHRpdGxlOiAmIzM5O3ZpZXcgdGl0bGUmIzM5O1xcbiAgICB9XFxuICB9O1xcbiAgaWYgKG9mZmxpbmUpIHtcXG4gICAgcmVzLnZpZXdNb2RlbC5tb2RlbC5hY3Rpb24gPSAmIzM5O2Vycm9yL29mZmxpbmUmIzM5OztcXG4gIH1cXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5IYXZpbmcgYSBkZWZhdWx0IGFjdGlvbiBhbmQgdGhlIGFiaWxpdHkgdG8gcmVkaXJlY3QgdG8gYW5vdGhlciBnaXZlcyB1cyBhIGxvdCBvZiBmbGV4aWJpbGl0eSB3aGVuIGRldGVybWluaW5nIGhvdyB0byByZXNwb25kIHRvIGEgcmVxdWVzdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5IVFRQIEZyYW1ld29yayBQbHVnaW5zPC9oMT5cXG48cD5UaGVyZSYjMzk7cyBjdXJyZW50bHkgdHdvIGRpZmZlcmVudCBIVFRQIGZyYW1ld29ya3MgPGVtPig8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPik8L2VtPiB0aGF0IHlvdSBjYW4gcmVhZGlseSB1c2Ugd2l0aCBUYXVudXMgd2l0aG91dCBoYXZpbmcgdG8gZGVhbCB3aXRoIGFueSBvZiB0aGUgcm91dGUgcGx1bWJpbmcgeW91cnNlbGYuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwidXNpbmctdGF1bnVzLWV4cHJlc3MtXFxcIj5Vc2luZyA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT48L2gyPlxcbjxwPlRoZSA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT4gcGx1Z2luIGlzIHByb2JhYmx5IHRoZSBlYXNpZXN0IHRvIHVzZSwgYXMgVGF1bnVzIHdhcyBvcmlnaW5hbGx5IGRldmVsb3BlZCB3aXRoIGp1c3QgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGluIG1pbmQuIEluIGFkZGl0aW9uIHRvIHRoZSBvcHRpb25zIGFscmVhZHkgb3V0bGluZWQgZm9yIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj50YXVudXMubW91bnQ8L2E+LCB5b3UgY2FuIGFkZCBtaWRkbGV3YXJlIGZvciBhbnkgcm91dGUgaW5kaXZpZHVhbGx5LjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPm1pZGRsZXdhcmU8L2NvZGU+IGFyZSBhbnkgbWV0aG9kcyB5b3Ugd2FudCBUYXVudXMgdG8gZXhlY3V0ZSBhcyBtaWRkbGV3YXJlIGluIEV4cHJlc3MgYXBwbGljYXRpb25zPC9saT5cXG48L3VsPlxcbjxwPlRvIGdldCA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT4gZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBwcm92aWRlZCB0aGF0IHlvdSBjb21lIHVwIHdpdGggYW4gPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICAvLyAuLi5cXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gbWV0aG9kIHdpbGwgbWVyZWx5IHNldCB1cCBUYXVudXMgYW5kIGFkZCB0aGUgcmVsZXZhbnQgcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBhcHBsaWNhdGlvbiBieSBjYWxsaW5nIDxjb2RlPmFwcC5nZXQ8L2NvZGU+IGEgYnVuY2ggb2YgdGltZXMuIFlvdSBjYW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+ZmluZCB0YXVudXMtZXhwcmVzcyBvbiBHaXRIdWI8L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcInVzaW5nLXRhdW51cy1oYXBpLVxcXCI+VXNpbmcgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+PC9oMj5cXG48cD5UaGUgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+IHBsdWdpbiBpcyBhIGJpdCBtb3JlIGludm9sdmVkLCBhbmQgeW91JiMzOTtsbCBoYXZlIHRvIGNyZWF0ZSBhIFBhY2sgaW4gb3JkZXIgdG8gdXNlIGl0LiBJbiBhZGRpdGlvbiB0byA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+dGhlIG9wdGlvbnMgd2UmIzM5O3ZlIGFscmVhZHkgY292ZXJlZDwvYT4sIHlvdSBjYW4gYWRkIDxjb2RlPmNvbmZpZzwvY29kZT4gb24gYW55IHJvdXRlLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmNvbmZpZzwvY29kZT4gaXMgcGFzc2VkIGRpcmVjdGx5IGludG8gdGhlIHJvdXRlIHJlZ2lzdGVyZWQgd2l0aCBIYXBpLCBnaXZpbmcgeW91IHRoZSBtb3N0IGZsZXhpYmlsaXR5PC9saT5cXG48L3VsPlxcbjxwPlRvIGdldCA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4gZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBhbmQgeW91IGNhbiBicmluZyB5b3VyIG93biA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciBIYXBpID0gcmVxdWlyZSgmIzM5O2hhcGkmIzM5Oyk7XFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0hhcGkgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWhhcGkmIzM5OykodGF1bnVzKTtcXG52YXIgcGFjayA9IG5ldyBIYXBpLlBhY2soKTtcXG5cXG5wYWNrLnJlZ2lzdGVyKHtcXG4gIHBsdWdpbjogdGF1bnVzSGFwaSxcXG4gIG9wdGlvbnM6IHtcXG4gICAgLy8gLi4uXFxuICB9XFxufSk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT50YXVudXNIYXBpPC9jb2RlPiBwbHVnaW4gd2lsbCBtb3VudCBUYXVudXMgYW5kIHJlZ2lzdGVyIGFsbCBvZiB0aGUgbmVjZXNzYXJ5IHJvdXRlcy4gWW91IGNhbiA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxcIj5maW5kIHRhdW51cy1oYXBpIG9uIEdpdEh1YjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiY29tbWFuZC1saW5lLWludGVyZmFjZVxcXCI+Q29tbWFuZC1MaW5lIEludGVyZmFjZTwvaDE+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldCB1cCB0aGUgc2VydmVyLXNpZGUgdG8gcmVuZGVyIHlvdXIgdmlld3MgdXNpbmcgVGF1bnVzLCBpdCYjMzk7cyBvbmx5IGxvZ2ljYWwgdGhhdCB5b3UmIzM5O2xsIHdhbnQgdG8gcmVuZGVyIHRoZSB2aWV3cyBpbiB0aGUgY2xpZW50LXNpZGUgYXMgd2VsbCwgZWZmZWN0aXZlbHkgY29udmVydGluZyB5b3VyIGFwcGxpY2F0aW9uIGludG8gYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbiBhZnRlciB0aGUgZmlyc3QgdmlldyBoYXMgYmVlbiByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuPC9wPlxcbjxwPlRoZSBUYXVudXMgQ0xJIGlzIGFuIHVzZWZ1bCBpbnRlcm1lZGlhcnkgaW4gdGhlIHByb2Nlc3Mgb2YgZ2V0dGluZyB0aGUgY29uZmlndXJhdGlvbiB5b3Ugd3JvdGUgc28gZmFyIGZvciB0aGUgc2VydmVyLXNpZGUgdG8gYWxzbyB3b3JrIHdlbGwgaW4gdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5JbnN0YWxsIGl0IGdsb2JhbGx5IGZvciBkZXZlbG9wbWVudCwgYnV0IHJlbWVtYmVyIHRvIHVzZSBsb2NhbCBjb3BpZXMgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgdXNlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgLWcgdGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPldoZW4gaW52b2tlZCB3aXRob3V0IGFueSBhcmd1bWVudHMsIHRoZSBDTEkgd2lsbCBzaW1wbHkgZm9sbG93IHRoZSBkZWZhdWx0IGNvbnZlbnRpb25zIHRvIGZpbmQgeW91ciByb3V0ZSBkZWZpbml0aW9ucywgdmlld3MsIGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVycy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IGRlZmF1bHQsIHRoZSBvdXRwdXQgd2lsbCBiZSBwcmludGVkIHRvIHRoZSBzdGFuZGFyZCBvdXRwdXQsIG1ha2luZyBmb3IgYSBmYXN0IGRlYnVnZ2luZyBleHBlcmllbmNlLiBIZXJlJiMzOTtzIHRoZSBvdXRwdXQgaWYgeW91IGp1c3QgaGFkIGEgc2luZ2xlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IHJvdXRlLCBhbmQgdGhlIG1hdGNoaW5nIHZpZXcgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZXhpc3RlZC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxuICAmIzM5O2hvbWUvaW5kZXgmIzM5OzogcmVxdWlyZSgmIzM5Oy4uL2NsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzJiMzOTspXFxufTtcXG5cXG52YXIgcm91dGVzID0gW1xcbiAge1xcbiAgICByb3V0ZTogJiMzOTsvJiMzOTssXFxuICAgIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTtcXG4gIH1cXG5dO1xcblxcbm1vZHVsZS5leHBvcnRzID0ge1xcbiAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICByb3V0ZXM6IHJvdXRlc1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPllvdSBjYW4gdXNlIGEgZmV3IG9wdGlvbnMgdG8gYWx0ZXIgdGhlIG91dGNvbWUgb2YgaW52b2tpbmcgPGNvZGU+dGF1bnVzPC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItb3V0cHV0LVxcXCI+PGNvZGU+LS1vdXRwdXQ8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tbzwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPk91dHB1dCBpcyB3cml0dGVuIHRvIGEgZmlsZSBpbnN0ZWFkIG9mIHRvIHN0YW5kYXJkIG91dHB1dC4gVGhlIGZpbGUgcGF0aCB1c2VkIHdpbGwgYmUgdGhlIDxjb2RlPmNsaWVudF93aXJpbmc8L2NvZGU+IG9wdGlvbiBpbiA8YSBocmVmPVxcXCIjdGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj48Y29kZT4udGF1bnVzcmM8L2NvZGU+PC9hPiwgd2hpY2ggZGVmYXVsdHMgdG8gPGNvZGU+JiMzOTsuYmluL3dpcmluZy5qcyYjMzk7PC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItd2F0Y2gtXFxcIj48Y29kZT4tLXdhdGNoPC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXc8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5XaGVuZXZlciBhIHNlcnZlci1zaWRlIHJvdXRlIGRlZmluaXRpb24gY2hhbmdlcywgdGhlIG91dHB1dCBpcyBwcmludGVkIGFnYWluIHRvIGVpdGhlciBzdGFuZGFyZCBvdXRwdXQgb3IgYSBmaWxlLCBkZXBlbmRpbmcgb24gd2hldGhlciA8Y29kZT4tLW91dHB1dDwvY29kZT4gd2FzIHVzZWQuPC9wPlxcbjxwPlRoZSBwcm9ncmFtIHdvbiYjMzk7dCBleGl0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10cmFuc2Zvcm0tbW9kdWxlLVxcXCI+PGNvZGU+LS10cmFuc2Zvcm0gJmx0O21vZHVsZSZndDs8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tdDwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPlRoaXMgZmxhZyBhbGxvd3MgeW91IHRvIHRyYW5zZm9ybSBzZXJ2ZXItc2lkZSByb3V0ZXMgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHVuZGVyc3RhbmRzLiBFeHByZXNzIHJvdXRlcyBhcmUgY29tcGxldGVseSBjb21wYXRpYmxlIHdpdGggdGhlIGNsaWVudC1zaWRlIHJvdXRlciwgYnV0IEhhcGkgcm91dGVzIG5lZWQgdG8gYmUgdHJhbnNmb3JtZWQgdXNpbmcgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+PGNvZGU+aGFwaWlmeTwvY29kZT48L2E+IG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgaGFwaWlmeVxcbnRhdW51cyAtdCBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlVzaW5nIHRoaXMgdHJhbnNmb3JtIHJlbGlldmVzIHlvdSBmcm9tIGhhdmluZyB0byBkZWZpbmUgdGhlIHNhbWUgcm91dGVzIHR3aWNlIHVzaW5nIHNsaWdodGx5IGRpZmZlcmVudCBmb3JtYXRzIHRoYXQgY29udmV5IHRoZSBzYW1lIG1lYW5pbmcuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLWRlZmVyLWFjdGlvbnMtXFxcIj48Y29kZT4tLWRlZmVyIFthY3Rpb25zXTwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1kPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+SGVyZSBpcyB3aGVyZSB0aGluZ3MgZ2V0IGludGVyZXN0aW5nLiBUaGUgPGNvZGU+LS1kZWZlcjwvY29kZT4gZmxhZyBhbGxvd3MgeW91IHRvIGRlZmVyIGxvYWRpbmcgZm9yIHplcm8gb3IgbW9yZSBhY3Rpb25zLiBFeGNsdWRpbmcgdGhlIGNvbnRyb2xsZXIgYW5kIHZpZXcgdGVtcGxhdGVzIGZvciBhbnkgZGVmZXJyZWQgYWN0aW9uIGNhbiBzaWduaWZpY2FudGx5IHJlZHVjZSB0aGUgZmluZ2VycHJpbnQgb2YgeW91ciBhcHBsaWNhdGlvbi48L3A+XFxuPHA+VGhlIDxjb2RlPlthY3Rpb25zXTwvY29kZT4gYXJndW1lbnQgZGV0ZXJtaW5lcyB3aGF0IGFjdGlvbnMgZ2V0IGRlZmVycmVkLCBhbmQgd2hpY2ggZG9uJiMzOTt0LiBJdCBleHBlY3RzIGEgY29tbWEtc2VwYXJhdGVkIGxpc3Qgb2YgYWN0aW9ucywgd2hlcmUgeW91IGNhbiBwYXNzIGluIGVpdGhlciB0aGUgY29udHJvbGxlciBuYW1lLCBvciBib3RoIHRoZSBjb250cm9sbGVyIG5hbWUgYW5kIHRoZSBhY3Rpb24gbmFtZS4gVXNpbmcgPGNvZGU+PzwvY29kZT4gYWN0cyBhcyBhIHdpbGRjYXJkLjwvcD5cXG48cD5Gb3IgZXhhbXBsZSwgdXNpbmcgPGNvZGU+YWRtaW48L2NvZGU+IDxlbT4oZXF1aXZhbGVudCB0byB1c2luZyA8Y29kZT5hZG1pbi8/PC9jb2RlPik8L2VtPiB3aWxsIGRlZmVyIGV2ZXJ5IGFjdGlvbiB1bmRlciB0aGUgPGNvZGU+YWRtaW48L2NvZGU+IGNvbnRyb2xsZXIuIFVzaW5nIDxjb2RlPmFkbWluL251a2U8L2NvZGU+IHdpbGwgb25seSBkZWZlciB0aGUgPGNvZGU+YWRtaW4vbnVrZTwvY29kZT4gYWN0aW9uLiBJZiB5b3Ugb21pdCB0aGUgPGNvZGU+W2FjdGlvbnNdPC9jb2RlPiBwYXJhbWV0ZXIgZW50aXJlbHksIHRoZSBkZWZhdWx0IHZhbHVlIG9mIDxjb2RlPiYjMzk7PyYjMzk7PC9jb2RlPiB3aWxsIGJlIHVzZWQgYW5kIGV2ZXJ5dGhpbmcgd2lsbCBiZSBkZWZlcnJlZC48L3A+XFxuPHA+V2hlbiBjb21wb25lbnRzIGdldCBkZWZlcnJlZCwgdGhleSYjMzk7bGwgYmUgbG9hZGVkIGFzIHNvb24gYXMgVGF1bnVzIGRldGVjdHMgdGhhdCB0aGV5JiMzOTtyZSBuZWVkZWQuIFRoaXMgY2FuIGhhcHBlbiBpbiBhIGZldyBwbGFjZXMuPC9wPlxcbjx1bD5cXG48bGk+VGhlIHVzZXIgbmF2aWdhdGVzIHRvIChvciA8YSBocmVmPVxcXCIjcHJlZmV0Y2hpbmdcXFwiPjxlbT5wcmVmZXRjaGVzPC9lbT48L2E+KSB0aGUgPGNvZGU+L2FkbWluPC9jb2RlPiByb3V0ZSwgYW5kIDxjb2RlPmFkbWluL2luZGV4PC9jb2RlPiB3YXMgZGVmZXJyZWQsIGFuZCBpdHMgY29tcG9uZW50cyBhcmVuJiMzOTt0IGNhY2hlZCBvbiB0aGUgY2xpZW50LXNpZGUgeWV0PC9saT5cXG48bGk+QSBjb250cm9sbGVyIHVzZXMgPGNvZGU+dGF1bnVzLnBhcnRpYWw8L2NvZGU+IHRvIHJlbmRlciBhbiBhY3Rpb24gdGhhdCB3YXMgZGVmZXJyZWQsIGFuZCBpdHMgY29tcG9uZW50cyBhcmVuJiMzOTt0IGNhY2hlZCBvbiB0aGUgY2xpZW50LXNpZGUgeWV0PC9saT5cXG48bGk+VGhlIHVzZXIgbmF2aWdhdGVzIHRvIHRoZSA8Y29kZT4vYWRtaW48L2NvZGU+IHJvdXRlLCBhbmQgaXRzIG1hdGNoaW5nIDxjb2RlPmFkbWluL2luZGV4PC9jb2RlPiByb3V0ZSB3YXNuJiMzOTt0IGRlZmVycmVkLCBidXQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIgZGVjaWRlcyB0byBjaGFuZ2UgdGhlIGFjdGlvbiB0byA8Y29kZT5hZG1pbi9zdXBlcmFkbWluPC9jb2RlPi4gV2hlbiB0aGUgcmVzcG9uc2UgZ2V0cyB0byB0aGUgY2xpZW50LCBpdCYjMzk7bGwgbmVlZCB0byBhc2sgdGhlIHNlcnZlciBmb3IgdGhlIDxjb2RlPmFkbWluL3N1cGVyYWRtaW48L2NvZGU+IHRlbXBsYXRlIGlmIHRoZSBjbGllbnQgZG9lc24mIzM5O3QgYWxyZWFkeSBoYXZlIGl0PC9saT5cXG48L3VsPlxcbjxwPllvdSBkb24mIzM5O3QgaGF2ZSB0byB3b3JyeSBhYm91dCB0aG9zZSBkaWZmZXJlbnQgc2NlbmFyaW9zLCB0aG91Z2gsIGFzIFRhdW51cyBoYW5kbGVzIHRoZW0gYWxsIGZvciB5b3UgdHJhbnNwYXJlbnRseS4gWW91IHNob3VsZCA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2Ujc2VuZC12aWV3cy1hbmQtY29udHJvbGxlcnMtdG8tdGhlLWNsaWVudC1zZWxlY3RpdmVseVxcXCI+bGVhcm4gbW9yZSBhYm91dCBkZWZlcnJlZCBsb2FkaW5nIG9uIHRoZSBwZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gZ3VpZGU8L2E+LjwvcD5cXG48cD5UaGUgb25seSBjb25jZXJuIHdpdGggZGVmZXJyZWQgZXhlY3V0aW9uIGlzIHRoYXQgcGFydGlhbCB2aWV3cyBtYXkgbm90IGJlIHJlbmRlcmVkIGltbWVkaWF0ZWx5LCBhcyBhIHJlcXVlc3QgbWF5IGJlIG5lY2Vzc2FyeSB0byBmZXRjaCB0aGUgY29udHJvbGxlciBvciB0ZW1wbGF0ZSBmb3IgdGhlIHBhcnRpYWwuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXJlc29sdmVycy1tb2R1bGUtXFxcIj48Y29kZT4tLXJlc29sdmVycyAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1yPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+U2ltaWxhcmx5IHRvIHRoZSA8YSBocmVmPVxcXCIjLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+cmVzb2x2ZXJzPC9jb2RlPjwvYT4gb3B0aW9uIHRoYXQgeW91IGNhbiBwYXNzIHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiwgdGhlc2UgcmVzb2x2ZXJzIGNhbiBjaGFuZ2UgdGhlIHdheSBpbiB3aGljaCBmaWxlIHBhdGhzIGFyZSByZXNvbHZlZC48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPlNpZ25hdHVyZTwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0Q2xpZW50Q29udHJvbGxlcihhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0VmlldyhhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi1idW5kbGUtXFxcIj48Y29kZT4tLWJ1bmRsZTwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1iPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+VW5kZXIgdGhpcyBleHBlcmltZW50YWwgZmxhZywgdGhlIENMSSB3aWxsIHVzZSBCcm93c2VyaWZ5IHRvIGNvbXBpbGUgYSBzdGFuZGFsb25lIG1vZHVsZSB0aGF0IGluY2x1ZGVzIHRoZSB3aXJpbmcgbm9ybWFsbHkgZXhwb3J0ZWQgYnkgdGhlIENMSSBwbHVzIGFsbCBvZiBUYXVudXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3VtZGpzL3VtZFxcXCI+YXMgYSBVTUQgbW9kdWxlPC9hPi48L3A+XFxuPHA+VGhpcyBhbGxvd3MgeW91IHRvIHVzZSBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIGV2ZW4gaWYgeW91IGRvbiYjMzk7dCB3YW50IHRvIHVzZSA8YSBocmVmPVxcXCJodHRwOi8vYnJvd3NlcmlmeS5vcmdcXFwiPkJyb3dzZXJpZnk8L2E+IGRpcmVjdGx5LjwvcD5cXG48cD5GZWVkYmFjayBhbmQgc3VnZ2VzdGlvbnMgYWJvdXQgdGhpcyBmbGFnLCA8ZW0+YW5kIHBvc3NpYmxlIGFsdGVybmF0aXZlcyB0aGF0IHdvdWxkIG1ha2UgVGF1bnVzIGVhc2llciB0byB1c2U8L2VtPiwgYXJlIHdlbGNvbWUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiY2xpZW50LXNpZGUtYXBpXFxcIj5DbGllbnQtc2lkZSBBUEk8L2gxPlxcbjxwPkp1c3QgbGlrZSB0aGUgc2VydmVyLXNpZGUsIGV2ZXJ5dGhpbmcgaW4gdGhlIGNsaWVudC1zaWRlIGJlZ2lucyBhdCB0aGUgbW91bnRwb2ludC4gT25jZSB0aGUgYXBwbGljYXRpb24gaXMgbW91bnRlZCwgYW5jaG9yIGxpbmtzIHdpbGwgYmUgaGlqYWNrZWQgYW5kIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgd2lsbCB0YWtlIG92ZXIgdmlldyByZW5kZXJpbmcuIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleGVjdXRlZCB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcsIG9wdGlvbnM/KTwvY29kZT48L2gyPlxcbjxwPlRoZSBtb3VudHBvaW50IHRha2VzIGEgcm9vdCBjb250YWluZXIsIHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgYW4gb3B0aW9ucyBwYXJhbWV0ZXIuIFRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+IGlzIHdoZXJlIGNsaWVudC1zaWRlLXJlbmRlcmVkIHZpZXdzIHdpbGwgYmUgcGxhY2VkLCBieSByZXBsYWNpbmcgd2hhdGV2ZXIgSFRNTCBjb250ZW50cyBhbHJlYWR5IGV4aXN0LiBZb3UgY2FuIHBhc3MgaW4gdGhlIDxjb2RlPndpcmluZzwvY29kZT4gbW9kdWxlIGV4YWN0bHkgYXMgYnVpbHQgYnkgdGhlIENMSSwgYW5kIG5vIGZ1cnRoZXIgY29uZmlndXJhdGlvbiBpcyBuZWNlc3NhcnkuPC9wPlxcbjxwPldoZW4gdGhlIG1vdW50cG9pbnQgZXhlY3V0ZXMsIFRhdW51cyB3aWxsIGNvbmZpZ3VyZSBpdHMgaW50ZXJuYWwgc3RhdGUsIDxlbT5zZXQgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvZW0+LCBydW4gdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3LCBhbmQgc3RhcnQgaGlqYWNraW5nIGxpbmtzLjwvcD5cXG48cD5BcyBhbiBleGFtcGxlLCBjb25zaWRlciBhIGJyb3dzZXIgbWFrZXMgYSA8Y29kZT5HRVQ8L2NvZGU+IHJlcXVlc3QgZm9yIDxjb2RlPi9hcnRpY2xlcy90aGUtZm94PC9jb2RlPiBmb3IgdGhlIGZpcnN0IHRpbWUuIE9uY2UgPGNvZGU+dGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nKTwvY29kZT4gaXMgaW52b2tlZCBvbiB0aGUgY2xpZW50LXNpZGUsIHNldmVyYWwgdGhpbmdzIHdvdWxkIGhhcHBlbiBpbiB0aGUgb3JkZXIgbGlzdGVkIGJlbG93LjwvcD5cXG48dWw+XFxuPGxpPlRhdW51cyBzZXRzIHVwIHRoZSBjbGllbnQtc2lkZSB2aWV3IHJvdXRpbmcgZW5naW5lPC9saT5cXG48bGk+SWYgZW5hYmxlZCA8ZW0+KHZpYSA8Y29kZT5vcHRpb25zPC9jb2RlPik8L2VtPiwgdGhlIGNhY2hpbmcgZW5naW5lIGlzIGNvbmZpZ3VyZWQ8L2xpPlxcbjxsaT5UYXVudXMgb2J0YWlucyB0aGUgdmlldyBtb2RlbCA8ZW0+KG1vcmUgb24gdGhpcyBsYXRlcik8L2VtPjwvbGk+XFxuPGxpPldoZW4gYSB2aWV3IG1vZGVsIGlzIG9idGFpbmVkLCB0aGUgPGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPiBldmVudCBpcyBlbWl0dGVkPC9saT5cXG48bGk+QW5jaG9yIGxpbmtzIHN0YXJ0IGJlaW5nIG1vbml0b3JlZCBmb3IgY2xpY2tzIDxlbT4oYXQgdGhpcyBwb2ludCB5b3VyIGFwcGxpY2F0aW9uIGJlY29tZXMgYSA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NpbmdsZS1wYWdlX2FwcGxpY2F0aW9uXFxcIj5TUEE8L2E+KTwvZW0+PC9saT5cXG48bGk+VGhlIDxjb2RlPmFydGljbGVzL2FydGljbGU8L2NvZGU+IGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgZXhlY3V0ZWQ8L2xpPlxcbjwvdWw+XFxuPHA+VGhhdCYjMzk7cyBxdWl0ZSBhIGJpdCBvZiBmdW5jdGlvbmFsaXR5LCBidXQgaWYgeW91IHRoaW5rIGFib3V0IGl0LCBtb3N0IG90aGVyIGZyYW1ld29ya3MgYWxzbyByZW5kZXIgdGhlIHZpZXcgYXQgdGhpcyBwb2ludCwgPGVtPnJhdGhlciB0aGFuIG9uIHRoZSBzZXJ2ZXItc2lkZSE8L2VtPjwvcD5cXG48cD5JbiBvcmRlciB0byBiZXR0ZXIgdW5kZXJzdGFuZCB0aGUgcHJvY2VzcywgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgPGNvZGU+b3B0aW9uczwvY29kZT4gcGFyYW1ldGVyLjwvcD5cXG48cD5GaXJzdCBvZmYsIHRoZSA8Y29kZT5ib290c3RyYXA8L2NvZGU+IG9wdGlvbiBkZXRlcm1pbmVzIHRoZSBzdHJhdGVneSB1c2VkIHRvIHB1bGwgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZXJlIGFyZSB0aHJlZSBwb3NzaWJsZSBzdHJhdGVnaWVzIGF2YWlsYWJsZTogPGNvZGU+YXV0bzwvY29kZT4gPGVtPih0aGUgZGVmYXVsdCBzdHJhdGVneSk8L2VtPiwgPGNvZGU+aW5saW5lPC9jb2RlPiwgb3IgPGNvZGU+bWFudWFsPC9jb2RlPi4gVGhlIDxjb2RlPmF1dG88L2NvZGU+IHN0cmF0ZWd5IGludm9sdmVzIHRoZSBsZWFzdCB3b3JrLCB3aGljaCBpcyB3aHkgaXQmIzM5O3MgdGhlIGRlZmF1bHQuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+YXV0bzwvY29kZT4gd2lsbCBtYWtlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWw8L2xpPlxcbjxsaT48Y29kZT5pbmxpbmU8L2NvZGU+IGV4cGVjdHMgeW91IHRvIHBsYWNlIHRoZSBtb2RlbCBpbnRvIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZzwvbGk+XFxuPGxpPjxjb2RlPm1hbnVhbDwvY29kZT4gZXhwZWN0cyB5b3UgdG8gZ2V0IHRoZSB2aWV3IG1vZGVsIGhvd2V2ZXIgeW91IHdhbnQgdG8sIGFuZCB0aGVuIGxldCBUYXVudXMga25vdyB3aGVuIGl0JiMzOTtzIHJlYWR5PC9saT5cXG48L3VsPlxcbjxwPkxldCYjMzk7cyBnbyBpbnRvIGRldGFpbCBhYm91dCBlYWNoIG9mIHRoZXNlIHN0cmF0ZWdpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWF1dG8tc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5hdXRvPC9jb2RlPiBzdHJhdGVneTwvaDQ+XFxuPHA+VGhlIDxjb2RlPmF1dG88L2NvZGU+IHN0cmF0ZWd5IG1lYW5zIHRoYXQgVGF1bnVzIHdpbGwgbWFrZSB1c2Ugb2YgYW4gQUpBWCByZXF1ZXN0IHRvIG9idGFpbiB0aGUgdmlldyBtb2RlbC4gPGVtPllvdSBkb24mIzM5O3QgaGF2ZSB0byBkbyBhbnl0aGluZyBlbHNlPC9lbT4gYW5kIHRoaXMgaXMgdGhlIGRlZmF1bHQgc3RyYXRlZ3kuIFRoaXMgaXMgdGhlIDxzdHJvbmc+bW9zdCBjb252ZW5pZW50IHN0cmF0ZWd5LCBidXQgYWxzbyB0aGUgc2xvd2VzdDwvc3Ryb25nPiBvbmUuPC9wPlxcbjxwPkl0JiMzOTtzIHNsb3cgYmVjYXVzZSB0aGUgdmlldyBtb2RlbCB3b24mIzM5O3QgYmUgcmVxdWVzdGVkIHVudGlsIHRoZSBidWxrIG9mIHlvdXIgSmF2YVNjcmlwdCBjb2RlIGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgZXhlY3V0ZWQsIGFuZCA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGludm9rZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWlubGluZS1zdHJhdGVneVxcXCI+VXNpbmcgdGhlIDxjb2RlPmlubGluZTwvY29kZT4gc3RyYXRlZ3k8L2g0PlxcbjxwPlRoZSA8Y29kZT5pbmxpbmU8L2NvZGU+IHN0cmF0ZWd5IGV4cGVjdHMgeW91IHRvIGFkZCBhIDxjb2RlPmRhdGEtdGF1bnVzPC9jb2RlPiBhdHRyaWJ1dGUgb24gdGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4gZWxlbWVudC4gVGhpcyBhdHRyaWJ1dGUgbXVzdCBiZSBlcXVhbCB0byB0aGUgPGNvZGU+aWQ8L2NvZGU+IGF0dHJpYnV0ZSBvZiBhIDxjb2RlPiZsdDtzY3JpcHQmZ3Q7PC9jb2RlPiB0YWcgY29udGFpbmluZyB0aGUgc2VyaWFsaXplZCB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmVyc2lvbiBpbmZvcm1hdGlvbiBhdXRvbWF0aWNhbGx5IGluamVjdGVkIGJ5IFRhdW51cyBpbnRvIHRoZSBsYXlvdXQgdGVtcGxhdGUgZGF0YS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj5kaXYoZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KSE9cGFydGlhbFxcbnNjcmlwdCh0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OywgZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KT1KU09OLnN0cmluZ2lmeSh7IHZlcnNpb246IHZlcnNpb24sIG1vZGVsOiBtb2RlbCB9KVxcbjwvY29kZT48L3ByZT5cXG48cD5QYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gdGhlIGZhY3QgdGhhdCB0aGUgbW9kZWwgaXMgbm90IG9ubHkgbWFkZSBpbnRvIGEgSlNPTiBzdHJpbmcsIDxlbT5idXQgYWxzbyBIVE1MIGVuY29kZWQgYnkgSmFkZTwvZW0+LiBXaGVuIFRhdW51cyBleHRyYWN0cyB0aGUgbW9kZWwgZnJvbSB0aGUgPGNvZGU+Jmx0O3NjcmlwdCZndDs8L2NvZGU+IHRhZyBpdCYjMzk7bGwgdW5lc2NhcGUgaXQsIGFuZCB0aGVuIHBhcnNlIGl0IGFzIEpTT04uPC9wPlxcbjxwPlRoaXMgc3RyYXRlZ3kgaXMgYWxzbyBmYWlybHkgY29udmVuaWVudCB0byBzZXQgdXAsIGJ1dCBpdCBpbnZvbHZlcyBhIGxpdHRsZSBtb3JlIHdvcmsuIEl0IG1pZ2h0IGJlIHdvcnRod2hpbGUgdG8gdXNlIGluIGNhc2VzIHdoZXJlIG1vZGVscyBhcmUgc21hbGwsIGJ1dCBpdCB3aWxsIHNsb3cgZG93biBzZXJ2ZXItc2lkZSB2aWV3IHJlbmRlcmluZywgYXMgdGhlIG1vZGVsIGlzIGlubGluZWQgYWxvbmdzaWRlIHRoZSBIVE1MLjwvcD5cXG48cD5UaGF0IG1lYW5zIHRoYXQgdGhlIGNvbnRlbnQgeW91IGFyZSBzdXBwb3NlZCB0byBiZSBwcmlvcml0aXppbmcgaXMgZ29pbmcgdG8gdGFrZSBsb25nZXIgdG8gZ2V0IHRvIHlvdXIgaHVtYW5zLCBidXQgb25jZSB0aGV5IGdldCB0aGUgSFRNTCwgdGhpcyBzdHJhdGVneSB3aWxsIGV4ZWN1dGUgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWxtb3N0IGltbWVkaWF0ZWx5LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5tYW51YWw8L2NvZGU+IHN0cmF0ZWd5PC9oND5cXG48cD5UaGUgPGNvZGU+bWFudWFsPC9jb2RlPiBzdHJhdGVneSBpcyB0aGUgbW9zdCBpbnZvbHZlZCBvZiB0aGUgdGhyZWUsIGJ1dCBhbHNvIHRoZSBtb3N0IHBlcmZvcm1hbnQuIEluIHRoaXMgc3RyYXRlZ3kgeW91JiMzOTtyZSBzdXBwb3NlZCB0byBhZGQgdGhlIGZvbGxvd2luZyA8ZW0+KHNlZW1pbmdseSBwb2ludGxlc3MpPC9lbT4gc25pcHBldCBvZiBjb2RlIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCZndDs8L2NvZGU+IG90aGVyIHRoYW4gdGhlIG9uZSB0aGF0JiMzOTtzIHB1bGxpbmcgZG93biBUYXVudXMsIHNvIHRoYXQgdGhleSBhcmUgcHVsbGVkIGNvbmN1cnJlbnRseSByYXRoZXIgdGhhbiBzZXJpYWxseS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxud2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PbmNlIHlvdSBzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGludm9rZSA8Y29kZT50YXVudXNSZWFkeShtb2RlbCk8L2NvZGU+LiBDb25zaWRlcmluZyB5b3UmIzM5O2xsIGJlIHB1bGxpbmcgYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGF0IHRoZSBzYW1lIHRpbWUsIGEgbnVtYmVyIG9mIGRpZmZlcmVudCBzY2VuYXJpb3MgbWF5IHBsYXkgb3V0LjwvcD5cXG48dWw+XFxuPGxpPlRoZSB2aWV3IG1vZGVsIGlzIGxvYWRlZCBmaXJzdCwgeW91IGNhbGwgPGNvZGU+dGF1bnVzUmVhZHkobW9kZWwpPC9jb2RlPiBhbmQgd2FpdCBmb3IgVGF1bnVzIHRvIHRha2UgdGhlIG1vZGVsIG9iamVjdCBhbmQgYm9vdCB0aGUgYXBwbGljYXRpb24gYXMgc29vbiBhcyA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGV4ZWN1dGVkPC9saT5cXG48bGk+VGF1bnVzIGxvYWRzIGZpcnN0IGFuZCA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGNhbGxlZCBmaXJzdC4gSW4gdGhpcyBjYXNlLCBUYXVudXMgd2lsbCByZXBsYWNlIDxjb2RlPndpbmRvdy50YXVudXNSZWFkeTwvY29kZT4gd2l0aCBhIHNwZWNpYWwgPGNvZGU+Ym9vdDwvY29kZT4gbWV0aG9kLiBXaGVuIHRoZSB2aWV3IG1vZGVsIGZpbmlzaGVzIGxvYWRpbmcsIHlvdSBjYWxsIDxjb2RlPnRhdW51c1JlYWR5KG1vZGVsKTwvY29kZT4gYW5kIHRoZSBhcHBsaWNhdGlvbiBmaW5pc2hlcyBib290aW5nPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHRoaXMgc291bmRzIGEgbGl0dGxlIG1pbmQtYmVuZGluZyBpdCYjMzk7cyBiZWNhdXNlIGl0IGlzLiBJdCYjMzk7cyBub3QgZGVzaWduZWQgdG8gYmUgcHJldHR5LCBidXQgbWVyZWx5IHRvIGJlIHBlcmZvcm1hbnQuPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5Ob3cgdGhhdCB3ZSYjMzk7dmUgYWRkcmVzc2VkIHRoZSBhd2t3YXJkIGJpdHMsIGxldCYjMzk7cyBjb3ZlciB0aGUgPGVtPiZxdW90O3NvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWwmcXVvdDs8L2VtPiBhc3BlY3QuIE15IHByZWZlcnJlZCBtZXRob2QgaXMgdXNpbmcgSlNPTlAsIGFzIGl0JiMzOTtzIGFibGUgdG8gZGVsaXZlciB0aGUgc21hbGxlc3Qgc25pcHBldCBwb3NzaWJsZSwgYW5kIGl0IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBzZXJ2ZXItc2lkZSBjYWNoaW5nLiBDb25zaWRlcmluZyB5b3UmIzM5O2xsIHByb2JhYmx5IHdhbnQgdGhpcyB0byBiZSBhbiBpbmxpbmUgc2NyaXB0LCBrZWVwaW5nIGl0IHNtYWxsIGlzIGltcG9ydGFudC48L3A+XFxuPHA+VGhlIGdvb2QgbmV3cyBpcyB0aGF0IHRoZSBzZXJ2ZXItc2lkZSBzdXBwb3J0cyBKU09OUCBvdXQgdGhlIGJveC4gSGVyZSYjMzk7cyBhIHNuaXBwZXQgb2YgY29kZSB5b3UgY291bGQgdXNlIHRvIHB1bGwgZG93biB0aGUgdmlldyBtb2RlbCBhbmQgYm9vdCBUYXVudXMgdXAgYXMgc29vbiBhcyBib3RoIG9wZXJhdGlvbnMgYXJlIHJlYWR5LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5mdW5jdGlvbiBpbmplY3QgKHVybCkge1xcbiAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJiMzOTtzY3JpcHQmIzM5Oyk7XFxuICBzY3JpcHQuc3JjID0gdXJsO1xcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzY3JpcHQpO1xcbn1cXG5cXG5mdW5jdGlvbiBpbmplY3RvciAoKSB7XFxuICB2YXIgc2VhcmNoID0gbG9jYXRpb24uc2VhcmNoO1xcbiAgdmFyIHNlYXJjaFF1ZXJ5ID0gc2VhcmNoID8gJiMzOTsmYW1wOyYjMzk7ICsgc2VhcmNoLnN1YnN0cigxKSA6ICYjMzk7JiMzOTs7XFxuICB2YXIgc2VhcmNoSnNvbiA9ICYjMzk7P2pzb24mYW1wO2NhbGxiYWNrPXRhdW51c1JlYWR5JiMzOTsgKyBzZWFyY2hRdWVyeTtcXG4gIGluamVjdChsb2NhdGlvbi5wYXRobmFtZSArIHNlYXJjaEpzb24pO1xcbn1cXG5cXG53aW5kb3cudGF1bnVzUmVhZHkgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHdpbmRvdy50YXVudXNSZWFkeSA9IG1vZGVsO1xcbn07XFxuXFxuaW5qZWN0b3IoKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXMgbWVudGlvbmVkIGVhcmxpZXIsIHRoaXMgYXBwcm9hY2ggaW52b2x2ZXMgZ2V0dGluZyB5b3VyIGhhbmRzIGRpcnRpZXIgYnV0IGl0IHBheXMgb2ZmIGJ5IGJlaW5nIHRoZSBmYXN0ZXN0IG9mIHRoZSB0aHJlZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJjYWNoaW5nXFxcIj5DYWNoaW5nPC9oND5cXG48cD5UaGUgY2xpZW50LXNpZGUgaW4gVGF1bnVzIHN1cHBvcnRzIGNhY2hpbmcgaW4tbWVtb3J5IGFuZCB1c2luZyB0aGUgZW1iZWRkZWQgSW5kZXhlZERCIHN5c3RlbSBieSBtZXJlbHkgdHVybmluZyBvbiB0aGUgPGNvZGU+Y2FjaGU8L2NvZGU+IGZsYWcgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gb24gdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5JZiB5b3Ugc2V0IDxjb2RlPmNhY2hlPC9jb2RlPiB0byA8Y29kZT50cnVlPC9jb2RlPiB0aGVuIGNhY2hlZCBpdGVtcyB3aWxsIGJlIGNvbnNpZGVyZWQgPGVtPiZxdW90O2ZyZXNoJnF1b3Q7ICh2YWxpZCBjb3BpZXMgb2YgdGhlIG9yaWdpbmFsKTwvZW0+IGZvciA8c3Ryb25nPjE1IHNlY29uZHM8L3N0cm9uZz4uIFlvdSBjYW4gYWxzbyBzZXQgPGNvZGU+Y2FjaGU8L2NvZGU+IHRvIGEgbnVtYmVyLCBhbmQgdGhhdCBudW1iZXIgb2Ygc2Vjb25kcyB3aWxsIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgaW5zdGVhZC48L3A+XFxuPHA+Q2FjaGluZyBjYW4gYWxzbyBiZSB0d2Vha2VkIG9uIGluZGl2aWR1YWwgcm91dGVzLiBGb3IgaW5zdGFuY2UsIHlvdSBjb3VsZCBzZXQgPGNvZGU+eyBjYWNoZTogdHJ1ZSB9PC9jb2RlPiB3aGVuIG1vdW50aW5nIFRhdW51cyBhbmQgdGhlbiBoYXZlIDxjb2RlPnsgY2FjaGU6IDM2MDAgfTwvY29kZT4gb24gYSByb3V0ZSB0aGF0IHlvdSB3YW50IHRvIGNhY2hlIGZvciBhIGxvbmdlciBwZXJpb2Qgb2YgdGltZS48L3A+XFxuPHA+VGhlIGNhY2hpbmcgbGF5ZXIgaXMgPGVtPnNlYW1sZXNzbHkgaW50ZWdyYXRlZDwvZW0+IGludG8gVGF1bnVzLCBtZWFuaW5nIHRoYXQgYW55IHZpZXdzIHJlbmRlcmVkIGJ5IFRhdW51cyB3aWxsIGJlIGNhY2hlZCBhY2NvcmRpbmcgdG8gdGhlc2UgY2FjaGluZyBydWxlcy4gS2VlcCBpbiBtaW5kLCBob3dldmVyLCB0aGF0IHBlcnNpc3RlbmNlIGF0IHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGxheWVyIHdpbGwgb25seSBiZSBwb3NzaWJsZSBpbiA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5icm93c2VycyB0aGF0IHN1cHBvcnQgSW5kZXhlZERCPC9hPi4gSW4gdGhlIGNhc2Ugb2YgYnJvd3NlcnMgdGhhdCBkb24mIzM5O3Qgc3VwcG9ydCBJbmRleGVkREIsIFRhdW51cyB3aWxsIHVzZSBhbiBpbi1tZW1vcnkgY2FjaGUsIHdoaWNoIHdpbGwgYmUgd2lwZWQgb3V0IHdoZW5ldmVyIHRoZSBodW1hbiBkZWNpZGVzIHRvIGNsb3NlIHRoZSB0YWIgaW4gdGhlaXIgYnJvd3Nlci48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJwcmVmZXRjaGluZ1xcXCI+UHJlZmV0Y2hpbmc8L2g0PlxcbjxwPklmIGNhY2hpbmcgaXMgZW5hYmxlZCwgdGhlIG5leHQgbG9naWNhbCBzdGVwIGlzIHByZWZldGNoaW5nLiBUaGlzIGlzIGVuYWJsZWQganVzdCBieSBhZGRpbmcgPGNvZGU+cHJlZmV0Y2g6IHRydWU8L2NvZGU+IHRvIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBUaGUgcHJlZmV0Y2hpbmcgZmVhdHVyZSB3aWxsIGZpcmUgZm9yIGFueSBhbmNob3IgbGluayB0aGF0JiMzOTtzIHRyaXBzIG92ZXIgYSA8Y29kZT5tb3VzZW92ZXI8L2NvZGU+IG9yIGEgPGNvZGU+dG91Y2hzdGFydDwvY29kZT4gZXZlbnQuIElmIGEgcm91dGUgbWF0Y2hlcyB0aGUgVVJMIGluIHRoZSA8Y29kZT5ocmVmPC9jb2RlPiwgYW4gQUpBWCByZXF1ZXN0IHdpbGwgcHJlZmV0Y2ggdGhlIHZpZXcgYW5kIGNhY2hlIGl0cyBjb250ZW50cywgaW1wcm92aW5nIHBlcmNlaXZlZCBwZXJmb3JtYW5jZS48L3A+XFxuPHA+V2hlbiBsaW5rcyBhcmUgY2xpY2tlZCBiZWZvcmUgcHJlZmV0Y2hpbmcgZmluaXNoZXMsIHRoZXkmIzM5O2xsIHdhaXQgb24gdGhlIHByZWZldGNoZXIgdG8gZmluaXNoIGJlZm9yZSBpbW1lZGlhdGVseSBzd2l0Y2hpbmcgdG8gdGhlIHZpZXcsIGVmZmVjdGl2ZWx5IGN1dHRpbmcgZG93biB0aGUgcmVzcG9uc2UgdGltZS4gSWYgdGhlIGxpbmsgd2FzIGFscmVhZHkgcHJlZmV0Y2hlZCBvciBvdGhlcndpc2UgY2FjaGVkLCB0aGUgdmlldyB3aWxsIGJlIGxvYWRlZCBpbW1lZGlhdGVseS4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGEgbGluayBhbmQgYW5vdGhlciBvbmUgd2FzIGFscmVhZHkgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGF0IG9uZSBpcyBhYm9ydGVkLiBUaGlzIHByZXZlbnRzIHByZWZldGNoaW5nIGZyb20gZHJhaW5pbmcgdGhlIGJhbmR3aWR0aCBvbiBjbGllbnRzIHdpdGggbGltaXRlZCBvciBpbnRlcm1pdHRlbnQgY29ubmVjdGl2aXR5LjwvcD5cXG48aDQgaWQ9XFxcInZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2g0PlxcbjxwPldoZW4gZW5hYmxlZCwgdmVyc2lvbmluZyB3aWxsIGxvb2sgb3V0IGZvciBkaXNjcmVwYW5jaWVzIGJldHdlZW4gd2hhdCYjMzk7cyBjdXJyZW50bHkgb24gdGhlIGNsaWVudCBhbmQgd2hhdCYjMzk7cyBvbiB0aGUgc2VydmVyLCBhbmQgcmVsb2FkIGV2ZXJ5dGhpbmcgbmVjZXNzYXJ5IHRvIG1ha2Ugd2hhdCYjMzk7cyBvbiB0aGUgY2xpZW50IG1hdGNoIHdoYXQmIzM5O3Mgb24gdGhlIHNlcnZlci48L3A+XFxuPHA+SW4gb3JkZXIgdG8gdHVybiBpdCBvbiwgc2V0IHRoZSA8Y29kZT52ZXJzaW9uPC9jb2RlPiBmaWVsZCBpbiB0aGUgb3B0aW9ucyB3aGVuIGludm9raW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gPHN0cm9uZz5vbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLCB1c2luZyB0aGUgc2FtZSB2YWx1ZTwvc3Ryb25nPi4gVGhlIFRhdW51cyB2ZXJzaW9uIHN0cmluZyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBvbmUgeW91IHByb3ZpZGVkLCBzbyB0aGF0IFRhdW51cyB3aWxsIGtub3cgdG8gc3RheSBhbGVydCBmb3IgY2hhbmdlcyB0byBUYXVudXMgaXRzZWxmLCBhcyB3ZWxsLjwvcD5cXG48YmxvY2txdW90ZT5cXG48cD5UbyBtYWtlIHN1cmUgeW91IGRvbiYjMzk7dCBmb3JnZXQgdG8gY2hhbmdlIHRoZSB2ZXJzaW9uIHN0cmluZyBpbiBvbmUgb2YgdGhlIG1vdW50cG9pbnRzLCBwbGVhc2UgY3JlYXRlIGEgSlNPTiBmaWxlIHdpdGgganVzdCB0aGUgdmVyc2lvbiBzdHJpbmcgYW5kIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoYXQgZmlsZSBpbiBib3RoIHNpZGVzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5lY2hvICYjMzk7JnF1b3Q7MS4wLjAmcXVvdDsmIzM5OyAmZ3Q7IHZlcnNpb24uanNvblxcbjwvY29kZT48L3ByZT5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+VGhlIGRlZmF1bHQgdmVyc2lvbiBzdHJpbmcgaXMgc2V0IHRvIDxjb2RlPjE8L2NvZGU+LiBUaGUgVGF1bnVzIHZlcnNpb24gd2lsbCBiZSBwcmVwZW5kZWQgdG8geW91cnMsIHJlc3VsdGluZyBpbiBhIHZhbHVlIHN1Y2ggYXMgPGNvZGU+dDMuMC4wO3YxPC9jb2RlPiB3aGVyZSBUYXVudXMgaXMgcnVubmluZyB2ZXJzaW9uIDxjb2RlPjMuMC4wPC9jb2RlPiBhbmQgeW91ciBhcHBsaWNhdGlvbiBpcyBydW5uaW5nIHZlcnNpb24gPGNvZGU+MTwvY29kZT4uPC9wPlxcbjxwPlJlZmVyIHRvIHRoZSBHZXR0aW5nIFN0YXJ0ZWQgZ3VpZGUgZm9yIGEgbW9yZSBkZXRhaWxlZCA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkI3ZlcnNpb25pbmdcXFwiPmFuYWx5c2lzIG9mIHRoZSB1c2VzIGZvciB2ZXJzaW9uaW5nPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub24odHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGF1bnVzIGVtaXRzIGEgc2VyaWVzIG9mIGV2ZW50cyBkdXJpbmcgaXRzIGxpZmVjeWNsZSwgYW5kIDxjb2RlPnRhdW51cy5vbjwvY29kZT4gaXMgdGhlIHdheSB5b3UgY2FuIHR1bmUgaW4gYW5kIGxpc3RlbiBmb3IgdGhlc2UgZXZlbnRzIHVzaW5nIGEgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIDxjb2RlPmZuPC9jb2RlPi48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPkV2ZW50PC90aD5cXG48dGg+QXJndW1lbnRzPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3N0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbCwgcm91dGU8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsLCByb3V0ZTwvY29kZT48L3RkPlxcbjx0ZD5BIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7Y2hhbmdlJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPlNhbWUgYXMgPGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT4sIGJ1dCBvbmx5IGlmIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4gaXMgdGhlIG1vdW50cG9pbnQgYW5kIHRoZSByb3V0ZSBoYXMgY2hhbmdlZC48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLnN0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5kb25lJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGRhdGE8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmFib3J0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmVycm9yJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGVycjwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci48L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPkNvbnNpZGVyIGZvciBpbnN0YW5jZSB0aGF0IHlvdSYjMzk7ZCBsaWtlIHRvIGtlZXAgdHJhY2sgb2YgZXZlcnkgdmlldyB0aGF0IGdldHMgcmVuZGVyZWQsIGFuZCB3aGF0IERPTSBlbGVtZW50IGl0IGdldHMgcGxhY2VkIGludG8uIFRoZSBwaWVjZSBvZiBjb2RlIGJlbG93IHdvdWxkIHF1aWNrbHkgZG8gdGhhdCBmb3IgdXMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPnRhdW51cy5vbigmIzM5O3JlbmRlciYjMzk7LCBmdW5jdGlvbiAoY29udGFpbmVyKSB7XFxuICBjb25zb2xlLmxvZygmIzM5O1JlbmRlcmVkIGEgdmlldyBvbiYjMzk7LCBjb250YWluZXIpO1xcbn0pO1xcbjwvY29kZT48L3ByZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2UodHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgaXMgZXF1aXZhbGVudCB0byA8YSBocmVmPVxcXCIjLXRhdW51cy1vbi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uPC9jb2RlPjwvYT4sIGV4Y2VwdCB0aGUgZXZlbnQgbGlzdGVuZXJzIHdpbGwgYmUgdXNlZCBvbmNlIGFuZCB0aGVuIGl0JiMzOTtsbCBiZSBkaXNjYXJkZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vZmYtdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vZmYodHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VXNpbmcgdGhpcyBtZXRob2QgeW91IGNhbiByZW1vdmUgYW55IGV2ZW50IGxpc3RlbmVycyB0aGF0IHdlcmUgcHJldmlvdXNseSBhZGRlZCB1c2luZyA8Y29kZT4ub248L2NvZGU+IG9yIDxjb2RlPi5vbmNlPC9jb2RlPi4gWW91IG11c3QgcHJvdmlkZSB0aGUgdHlwZSBvZiBldmVudCB5b3Ugd2FudCB0byByZW1vdmUgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBldmVudCBsaXN0ZW5lciBmdW5jdGlvbiB0aGF0IHdhcyBvcmlnaW5hbGx5IHVzZWQgd2hlbiBjYWxsaW5nIDxjb2RlPi5vbjwvY29kZT4gb3IgPGNvZGU+Lm9uY2U8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtaW50ZXJjZXB0LWFjdGlvbi1mbi1cXFwiPjxjb2RlPnRhdW51cy5pbnRlcmNlcHQoYWN0aW9uPywgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgY2FuIGJlIHVzZWQgdG8gYW50aWNpcGF0ZSBtb2RlbCByZXF1ZXN0cywgYmVmb3JlIHRoZXkgZXZlciBtYWtlIGl0IGludG8gWEhSIHJlcXVlc3RzLiBZb3UgY2FuIGFkZCBpbnRlcmNlcHRvcnMgZm9yIHNwZWNpZmljIGFjdGlvbnMsIHdoaWNoIHdvdWxkIGJlIHRyaWdnZXJlZCBvbmx5IGlmIHRoZSByZXF1ZXN0IG1hdGNoZXMgdGhlIHNwZWNpZmllZCA8Y29kZT5hY3Rpb248L2NvZGU+LiBZb3UgY2FuIGFsc28gYWRkIGdsb2JhbCBpbnRlcmNlcHRvcnMgYnkgb21pdHRpbmcgdGhlIDxjb2RlPmFjdGlvbjwvY29kZT4gcGFyYW1ldGVyLCBvciBzZXR0aW5nIGl0IHRvIDxjb2RlPio8L2NvZGU+LjwvcD5cXG48cD5BbiBpbnRlcmNlcHRvciBmdW5jdGlvbiB3aWxsIHJlY2VpdmUgYW4gPGNvZGU+ZXZlbnQ8L2NvZGU+IHBhcmFtZXRlciwgY29udGFpbmluZyBhIGZldyBkaWZmZXJlbnQgcHJvcGVydGllcy48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT51cmw8L2NvZGU+IGNvbnRhaW5zIHRoZSBVUkwgdGhhdCBuZWVkcyBhIHZpZXcgbW9kZWw8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gY29udGFpbnMgdGhlIGZ1bGwgcm91dGUgb2JqZWN0IGFzIHlvdSYjMzk7ZCBnZXQgZnJvbSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMucm91dGUodXJsKTwvY29kZT48L2E+PC9saT5cXG48bGk+PGNvZGU+cGFydHM8L2NvZGU+IGlzIGp1c3QgYSBzaG9ydGN1dCBmb3IgPGNvZGU+cm91dGUucGFydHM8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+cHJldmVudERlZmF1bHQobW9kZWwpPC9jb2RlPiBhbGxvd3MgeW91IHRvIHN1cHByZXNzIHRoZSBuZWVkIGZvciBhbiBBSkFYIHJlcXVlc3QsIGNvbW1hbmRpbmcgVGF1bnVzIHRvIHVzZSB0aGUgbW9kZWwgeW91JiMzOTt2ZSBwcm92aWRlZCBpbnN0ZWFkPC9saT5cXG48bGk+PGNvZGU+ZGVmYXVsdFByZXZlbnRlZDwvY29kZT4gdGVsbHMgeW91IGlmIHNvbWUgb3RoZXIgaGFuZGxlciBoYXMgcHJldmVudGVkIHRoZSBkZWZhdWx0IGJlaGF2aW9yPC9saT5cXG48bGk+PGNvZGU+Y2FuUHJldmVudERlZmF1bHQ8L2NvZGU+IHRlbGxzIHlvdSBpZiBpbnZva2luZyA8Y29kZT5ldmVudC5wcmV2ZW50RGVmYXVsdDwvY29kZT4gd2lsbCBoYXZlIGFueSBlZmZlY3Q8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gc3RhcnRzIGFzIDxjb2RlPm51bGw8L2NvZGU+LCBhbmQgaXQgY2FuIGxhdGVyIGJlY29tZSB0aGUgbW9kZWwgcGFzc2VkIHRvIDxjb2RlPnByZXZlbnREZWZhdWx0PC9jb2RlPjwvbGk+XFxuPC91bD5cXG48cD5JbnRlcmNlcHRvcnMgYXJlIGFzeW5jaHJvbm91cywgYnV0IGlmIGFuIGludGVyY2VwdG9yIHNwZW5kcyBsb25nZXIgdGhhbiA1MG1zIGl0JiMzOTtsbCBiZSBzaG9ydC1jaXJjdWl0ZWQgYW5kIGNhbGxpbmcgPGNvZGU+ZXZlbnQucHJldmVudERlZmF1bHQ8L2NvZGU+IHBhc3QgdGhhdCBwb2ludCB3b24mIzM5O3QgaGF2ZSBhbnkgZWZmZWN0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLVxcXCI+PGNvZGU+dGF1bnVzLnBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsKTwvY29kZT48L2gyPlxcbjxwPlRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSA8Y29kZT5hY3Rpb248L2NvZGU+IHZpZXcgaW50byB0aGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiBET00gZWxlbWVudCwgdXNpbmcgdGhlIHNwZWNpZmllZCA8Y29kZT5tb2RlbDwvY29kZT4uIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSA8Y29kZT5yZW5kZXI8L2NvZGU+IGV2ZW50IHdpbGwgYmUgZmlyZWQgPGVtPih3aXRoIDxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+IGFzIGFyZ3VtZW50cyk8L2VtPiBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoYXQgdmlldyB3aWxsIGJlIGV4ZWN1dGVkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbmF2aWdhdGUtdXJsLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubmF2aWdhdGUodXJsLCBvcHRpb25zKTwvY29kZT48L2gyPlxcbjxwPldoZW5ldmVyIHlvdSB3YW50IHRvIG5hdmlnYXRlIHRvIGEgVVJMLCBzYXkgd2hlbiBhbiBBSkFYIGNhbGwgZmluaXNoZXMgYWZ0ZXIgYSBidXR0b24gY2xpY2ssIHlvdSBjYW4gdXNlIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT4gcGFzc2luZyBpdCBhIHBsYWluIFVSTCBvciBhbnl0aGluZyB0aGF0IHdvdWxkIGNhdXNlIDxjb2RlPnRhdW51cy5yb3V0ZSh1cmwpPC9jb2RlPiB0byByZXR1cm4gYSB2YWxpZCByb3V0ZS48L3A+XFxuPHA+QnkgZGVmYXVsdCwgaWYgPGNvZGU+dGF1bnVzLm5hdmlnYXRlKHVybCwgb3B0aW9ucyk8L2NvZGU+IGlzIGNhbGxlZCB3aXRoIGFuIDxjb2RlPnVybDwvY29kZT4gdGhhdCBkb2VzbiYjMzk7dCBtYXRjaCBhbnkgY2xpZW50LXNpZGUgcm91dGUsIHRoZW4gdGhlIHVzZXIgd2lsbCBiZSByZWRpcmVjdGVkIHZpYSA8Y29kZT5sb2NhdGlvbi5ocmVmPC9jb2RlPi4gSW4gY2FzZXMgd2hlcmUgdGhlIGJyb3dzZXIgZG9lc24mIzM5O3Qgc3VwcG9ydCB0aGUgaGlzdG9yeSBBUEksIDxjb2RlPmxvY2F0aW9uLmhyZWY8L2NvZGU+IHdpbGwgYmUgdXNlZCBhcyB3ZWxsLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBvcHRpb25zIHlvdSBjYW4gdXNlIHRvIHR3ZWFrIHRoZSBiZWhhdmlvciBvZiA8Y29kZT50YXVudXMubmF2aWdhdGU8L2NvZGU+LjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+T3B0aW9uPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT5jb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkEgRE9NIGVsZW1lbnQgdGhhdCBjYXVzZWQgdGhlIG5hdmlnYXRpb24gZXZlbnQsIHVzZWQgd2hlbiBlbWl0dGluZyBldmVudHM8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5zdHJpY3Q8L2NvZGU+PC90ZD5cXG48dGQ+SWYgc2V0IHRvIDxjb2RlPnRydWU8L2NvZGU+IGFuZCB0aGUgVVJMIGRvZXNuJiMzOTt0IG1hdGNoIGFueSByb3V0ZSwgdGhlbiB0aGUgbmF2aWdhdGlvbiBhdHRlbXB0IG11c3QgYmUgaWdub3JlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPnNjcm9sbDwvY29kZT48L3RkPlxcbjx0ZD5XaGVuIHRoaXMgaXMgc2V0IHRvIDxjb2RlPmZhbHNlPC9jb2RlPiwgZWxlbWVudHMgYXJlbiYjMzk7dCBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXIgbmF2aWdhdGlvbjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPmZvcmNlPC9jb2RlPjwvdGQ+XFxuPHRkPlVubGVzcyB0aGlzIGlzIHNldCB0byA8Y29kZT50cnVlPC9jb2RlPiwgbmF2aWdhdGlvbiB3b24mIzM5O3QgPGVtPmZldGNoIGEgbW9kZWw8L2VtPiBpZiB0aGUgcm91dGUgbWF0Y2hlcyB0aGUgY3VycmVudCByb3V0ZSwgYW5kIDxjb2RlPnN0YXRlLm1vZGVsPC9jb2RlPiB3aWxsIGJlIHJldXNlZCBpbnN0ZWFkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+cmVwbGFjZVN0YXRlPC9jb2RlPjwvdGQ+XFxuPHRkPlVzZSA8Y29kZT5yZXBsYWNlU3RhdGU8L2NvZGU+IGluc3RlYWQgb2YgPGNvZGU+cHVzaFN0YXRlPC9jb2RlPiB3aGVuIGNoYW5naW5nIGhpc3Rvcnk8L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPk5vdGUgdGhhdCB0aGUgbm90aW9uIG9mIDxlbT5mZXRjaGluZyBhIG1vZGVsPC9lbT4gbWlnaHQgYmUgZGVjZWl2aW5nIGFzIHRoZSBtb2RlbCBjb3VsZCBiZSBwdWxsZWQgZnJvbSB0aGUgY2FjaGUgZXZlbiBpZiA8Y29kZT5mb3JjZTwvY29kZT4gaXMgc2V0IHRvIDxjb2RlPnRydWU8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcm91dGUtdXJsLVxcXCI+PGNvZGU+dGF1bnVzLnJvdXRlKHVybCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIGNvbnZlbmllbmNlIG1ldGhvZCBhbGxvd3MgeW91IHRvIGJyZWFrIGRvd24gYSBVUkwgaW50byBpdHMgaW5kaXZpZHVhbCBjb21wb25lbnRzLiBUaGUgbWV0aG9kIGFjY2VwdHMgYW55IG9mIHRoZSBmb2xsb3dpbmcgcGF0dGVybnMsIGFuZCBpdCByZXR1cm5zIGEgVGF1bnVzIHJvdXRlIG9iamVjdC48L3A+XFxuPHVsPlxcbjxsaT5BIGZ1bGx5IHF1YWxpZmllZCBVUkwgb24gdGhlIHNhbWUgb3JpZ2luLCBlLmcgPGNvZGU+aHR0cDovL3RhdW51cy5iZXZhY3F1YS5pby9hcGk8L2NvZGU+PC9saT5cXG48bGk+QW4gYWJzb2x1dGUgVVJMIHdpdGhvdXQgYW4gb3JpZ2luLCBlLmcgPGNvZGU+L2FwaTwvY29kZT48L2xpPlxcbjxsaT5KdXN0IGEgaGFzaCwgZS5nIDxjb2RlPiNmb288L2NvZGU+IDxlbT4oPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4gaXMgdXNlZCk8L2VtPjwvbGk+XFxuPGxpPkZhbHN5IHZhbHVlcywgZS5nIDxjb2RlPm51bGw8L2NvZGU+IDxlbT4oPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4gaXMgdXNlZCk8L2VtPjwvbGk+XFxuPC91bD5cXG48cD5SZWxhdGl2ZSBVUkxzIGFyZSBub3Qgc3VwcG9ydGVkIDxlbT4oYW55dGhpbmcgdGhhdCBkb2VzbiYjMzk7dCBoYXZlIGEgbGVhZGluZyBzbGFzaCk8L2VtPiwgZS5nIDxjb2RlPmZpbGVzL2RhdGEuanNvbjwvY29kZT4uIEFueXRoaW5nIHRoYXQmIzM5O3Mgbm90IG9uIHRoZSBzYW1lIG9yaWdpbiBvciBkb2VzbiYjMzk7dCBtYXRjaCBvbmUgb2YgdGhlIHJlZ2lzdGVyZWQgcm91dGVzIGlzIGdvaW5nIHRvIHlpZWxkIDxjb2RlPm51bGw8L2NvZGU+LjwvcD5cXG48cD48ZW0+VGhpcyBtZXRob2QgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLCBhcyBpdCBnaXZlcyB5b3UgZGlyZWN0IGFjY2VzcyB0byB0aGUgcm91dGVyIHVzZWQgaW50ZXJuYWxseSBieSBUYXVudXMuPC9lbT48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCItdGF1bnVzLXJvdXRlLWVxdWFscy1yb3V0ZS1yb3V0ZS1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZS5lcXVhbHMocm91dGUsIHJvdXRlKTwvY29kZT48L2g0PlxcbjxwPkNvbXBhcmVzIHR3byByb3V0ZXMgYW5kIHJldHVybnMgPGNvZGU+dHJ1ZTwvY29kZT4gaWYgdGhleSB3b3VsZCBmZXRjaCB0aGUgc2FtZSBtb2RlbC4gTm90ZSB0aGF0IGRpZmZlcmVudCBVUkxzIG1heSBzdGlsbCByZXR1cm4gPGNvZGU+dHJ1ZTwvY29kZT4uIEZvciBpbnN0YW5jZSwgPGNvZGU+L2ZvbzwvY29kZT4gYW5kIDxjb2RlPi9mb28jYmFyPC9jb2RlPiB3b3VsZCBmZXRjaCB0aGUgc2FtZSBtb2RlbCBldmVuIGlmIHRoZXkmIzM5O3JlIGRpZmZlcmVudCBVUkxzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtc3RhdGUtXFxcIj48Y29kZT50YXVudXMuc3RhdGU8L2NvZGU+PC9oMj5cXG48cD5UaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5jb250YWluZXI8L2NvZGU+IGlzIHRoZSBET00gZWxlbWVudCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvbGk+XFxuPGxpPjxjb2RlPmNvbnRyb2xsZXJzPC9jb2RlPiBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPjxjb2RlPnRlbXBsYXRlczwvY29kZT4gYXJlIGFsbCB0aGUgdGVtcGxhdGVzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+PGNvZGU+cm91dGVzPC9jb2RlPiBhcmUgYWxsIHRoZSByb3V0ZXMsIGFzIGRlZmluZWQgaW4gdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gaXMgYSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgcm91dGU8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gaXMgYSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsIHVzZWQgdG8gcmVuZGVyIHRoZSBjdXJyZW50IHZpZXc8L2xpPlxcbjxsaT48Y29kZT5wcmVmZXRjaDwvY29kZT4gZXhwb3NlcyB3aGV0aGVyIHByZWZldGNoaW5nIGlzIHR1cm5lZCBvbjwvbGk+XFxuPGxpPjxjb2RlPmNhY2hlPC9jb2RlPiBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkPC9saT5cXG48bGk+PGNvZGU+dmVyc2lvbjwvY29kZT4gZXhwb3NlcyB0aGUgdmVyc2lvbiBzdHJpbmcgdGhhdCYjMzk7cyBjdXJyZW50bHkgaW4gdXNlPC9saT5cXG48L3VsPlxcbjxwPlRoZXJlJiMzOTtzIGFsc28gYSA8Y29kZT5jbGVhcjwvY29kZT4gbWV0aG9kIGFjY2Vzc2libGUgdGhyb3VnaCA8Y29kZT50YXVudXMuc3RhdGUuY2xlYXI8L2NvZGU+LCB3aGljaCB3aWxsIGVtcHR5IHRoZSBjYWNoZSwgYXMgd2VsbCBhcyByZW1vdmUgZnJvbSB0aGUgPGNvZGU+c3RhdGU8L2NvZGU+IGFueSBjb250cm9sbGVycyBhbmQgdGVtcGxhdGVzIHRoYXQgd2VyZSBsYXp5IGxvYWRlZC48L3A+XFxuPHA+T2YgY291cnNlLCB5b3UmIzM5O3JlIG5vdCBzdXBwb3NlZCB0byBtZWRkbGUgd2l0aCBpdCwgc28gYmUgYSBnb29kIGNpdGl6ZW4gYW5kIGp1c3QgaW5zcGVjdCBpdHMgdmFsdWVzITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMteGhyLXVybC1vcHRpb25zLWRvbmUtXFxcIj48Y29kZT50YXVudXMueGhyKHVybCwgb3B0aW9ucz8sIGRvbmUpPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgYWxsb3dzIHlvdSB0byBpc3N1ZSB5b3VyIG93biBBSkFYIHJlcXVlc3RzIHRocm91Z2ggdGhlIDxjb2RlPnhocjwvY29kZT4gbW9kdWxlLiBJdCBzZXRzIGEgZmV3IGNvbnZlbmllbnQgZGVmYXVsdHMsIDxlbT5saXN0ZWQgYmVsb3c8L2VtPiwgd2hlcmUgPGNvZGU+dXJsPC9jb2RlPiByZWZlcnMgdG8gdGhlIFVSTCBwYXNzZWQgYXMgdGhlIGZpcnN0IHBhcmFtZXRlci48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+e1xcbiAgdXJsOiB1cmwsXFxuICBqc29uOiB0cnVlLFxcbiAgaGVhZGVyczogeyBBY2NlcHQ6ICYjMzk7YXBwbGljYXRpb24vanNvbiYjMzk7IH1cXG59XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT5kb25lKGVyciwgYm9keSwgcmVzKTwvY29kZT4gY2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gdGhlIHJlcXVlc3QgZmluaXNoZXMsIGFuZCBpdCYjMzk7bGwgYmUgcGFzc2VkIHRocmVlIHBhcmFtZXRlcnMsIGFuIG9wdGlvbmFsIGVycm9yIGlmIHNvbWV0aGluZyB3ZW50IHdyb25nIDxlbT4ocmVxdWVzdCBmYWlsZWQsIHdhcyBhYm9ydGVkLCBldGMuKTwvZW0+IGFuZCBhIDxjb2RlPmJvZHk8L2NvZGU+IHBhcmFtZXRlciBjb250YWluaW5nIHRoZSByZXNwb25zZSBib2R5LiBUaGUgcmF3IDxjb2RlPnJlczwvY29kZT4gb2JqZWN0IHRoYXQmIzM5O3MgdHlwaWNhbGx5IHByb3ZpZGVkIGJ5IDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9SYXlub3MveGhyXFxcIj48Y29kZT54aHI8L2NvZGU+PC9hPiBhcyB0aGUgc2Vjb25kIHBhcmFtZXRlciBpcyBwcm92aWRlZCBhcyB0aGUgdGhpcmQgcGFyYW1ldGVyIGluc3RlYWQuPC9wPlxcbjxwPkFzIGFuIGV4YW1wbGUsIGhlcmUgaXMgYSA8Y29kZT5HRVQ8L2NvZGU+IHJlcXVlc3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPnRhdW51cy54aHIoJiMzOTsvYXBpL3BsYWNlcyYjMzk7LCBmdW5jdGlvbiAoZXJyLCBib2R5KSB7XFxuICBjb25zb2xlLmxvZyhib2R5KTtcXG4gIC8vICZsdDstIHsgcGxhY2VzOiBbJiMzOTt1bmRlcndhdGVyIGZvcnRyZXNzJiMzOTssICYjMzk7aXNsYW5kIG1hbnNpb24mIzM5O10gfVxcbn0pO1xcbjwvY29kZT48L3ByZT5cXG48cD5BbHdheXMgcmVtZW1iZXIgdG8gaGFuZGxlIHRoZSBjYXNlIHdoZXJlIDxjb2RlPmVycjwvY29kZT4gaXMgc2V0ITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcImRlYnVnZ2luZy10YXVudXNcXFwiPkRlYnVnZ2luZyBUYXVudXM8L2gyPlxcbjxwPk9uIHRoZSBjbGllbnQtc2lkZSwgeW91IHdpbGwgdHlwaWNhbGx5IDxjb2RlPnJlcXVpcmU8L2NvZGU+IFRhdW51cyB1c2luZyB0aGUgc3RhdGVtZW50IGJlbG93LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+SG93ZXZlciwgeW91IGNvdWxkIGFsc28gdHVybiBvbiB0aGUgaW50ZXJuYWwgZGVidWcgbG9nZ2VyIHNpbXBseSBieSB1c2luZyBhbm90aGVyIGVudHJ5IHBvaW50ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cy9icm93c2VyL2RlYnVnJiMzOTspO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgc2NyZWVuc2hvdCBiZWxvdyBjb250YWlucyBhbiBleGFtcGxlIG9mIHRoaXMgbWVjaGFuaXNtLCB3aGVyZSB1c2luZyA8YSBocmVmPVxcXCIjLXRhdW51cy1wYXJ0aWFsLWNvbnRhaW5lci1hY3Rpb24tbW9kZWwtXFxcIj48Y29kZT50YXVudXMucGFydGlhbDwvY29kZT48L2E+IHRyaWdnZXJzIGEgZmx1cnJ5IG9mIGRlYnVnIG1lc3NhZ2VzLjwvcD5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL0NqYklIeTAucG5nXFxcIiBhbHQ9XFxcImRlYnVnLnBuZ1xcXCI+PC9wPlxcbjxwPlRoaXMgaXMgcGFydGljdWxhcmx5IGhlbHBmdWwgZHVyaW5nIGRldmVsb3BtZW50LCBidXQgYWxzbyB1c2VmdWwgaWYgeW91IGRvbiYjMzk7dCB1bmRlcnN0YW5kIGV4YWN0bHkgaG93IFRhdW51cyBpcyBkb2luZyBzb21ldGhpbmcsIGFzIHRoZSBsb2dnZXIgaXMgcHJldHR5IHZlcmJvc2UuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiY2xpZW50LXNpZGUtY29udHJvbGxlcnNcXFwiPkNsaWVudC1TaWRlIENvbnRyb2xsZXJzPC9oMT5cXG48cD5DbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhlY3V0ZWQgcmlnaHQgYWZ0ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLCBldmVuIGluIHRoZSBjYXNlIG9mIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1cXFwiPnBhcnRpYWwgdmlld3M8L2E+LiBUaGVzZSBjb250cm9sbGVycyBhcmUgdXNlZCB0byBwcm9ncmVzc2l2ZWx5IGFkZCBiZWhhdmlvciBvbiB0b3Agb2YgdGhlIEhUTUwgZm9yIHRoYXQgdmlldy48L3A+XFxuPHA+VmlldyBjb250cm9sbGVycyB0YWtlIHRocmVlIHBhcmFtZXRlcnMuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5QYXJhbWV0ZXI8L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPm1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPk1vZGVsIHRoYXQgd2FzIHVzZWQgdG8gcmVuZGVyIHRoZSB2aWV3PC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Y29udGFpbmVyPC9jb2RlPjwvdGQ+XFxuPHRkPlRoZSBET00gZWxlbWVudCB3aGVyZSB0aGUgdmlldyB3YXMgcmVuZGVyZWQ8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5yb3V0ZT88L2NvZGU+PC90ZD5cXG48dGQ+Um91dGUgdGhhdCB0cmlnZ2VyZWQgdGhlIHJlbmRlcmluZyBlbmdpbmUuIE1heSBiZSA8Y29kZT5udWxsPC9jb2RlPjwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+Tm90ZSB0aGF0IFRhdW51cyB3aWxsIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj5lbWl0IGEgPGNvZGU+cmVuZGVyPC9jb2RlPiBldmVudDwvYT4gcmlnaHQgYmVmb3JlIHRoZSB2aWV3IGNvbnRyb2xsZXIgZ2V0cyBleGVjdXRlZCwgZ2l2aW5nIHlvdSBhIGNoYW5jZSB0byByZWFjdCB0byB2aWV3cyBnZXR0aW5nIHJlbmRlcmVkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+VGhlIDxjb2RlPi50YXVudXNyYzwvY29kZT4gbWFuaWZlc3Q8L2gxPlxcbjxwPklmIHlvdSB3YW50IHRvIHVzZSB2YWx1ZXMgb3RoZXIgdGhhbiB0aGUgY29udmVudGlvbmFsIGRlZmF1bHRzIHNob3duIGluIHRoZSB0YWJsZSBiZWxvdywgdGhlbiB5b3Ugc2hvdWxkIGNyZWF0ZSBhIDxjb2RlPi50YXVudXNyYzwvY29kZT4gZmlsZS4gTm90ZSB0aGF0IHRoZSBkZWZhdWx0cyBuZWVkIHRvIGJlIG92ZXJ3cml0dGVuIGluIGEgY2FzZS1ieS1jYXNlIGJhc2lzLiBUaGVzZSBvcHRpb25zIGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgaW4geW91ciA8Y29kZT5wYWNrYWdlLmpzb248L2NvZGU+LCB1bmRlciB0aGUgPGNvZGU+dGF1bnVzPC9jb2RlPiBwcm9wZXJ0eS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc29uXFxcIj57XFxuICAmcXVvdDt2aWV3cyZxdW90OzogJnF1b3Q7LmJpbi92aWV3cyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9yb3V0ZXMmcXVvdDs6ICZxdW90O2NvbnRyb2xsZXJzL3JvdXRlcy5qcyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9jb250cm9sbGVycyZxdW90OzogJnF1b3Q7Y29udHJvbGxlcnMmcXVvdDssXFxuICAmcXVvdDtjbGllbnRfY29udHJvbGxlcnMmcXVvdDs6ICZxdW90O2NsaWVudC9qcy9jb250cm9sbGVycyZxdW90OyxcXG4gICZxdW90O2NsaWVudF93aXJpbmcmcXVvdDs6ICZxdW90Oy5iaW4vd2lyaW5nLmpzJnF1b3Q7XFxufVxcbjwvY29kZT48L3ByZT5cXG48dWw+XFxuPGxpPlRoZSA8Y29kZT52aWV3czwvY29kZT4gZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgdmlld3MgPGVtPihhbHJlYWR5IGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCk8L2VtPiBhcmUgcGxhY2VkLiBUaGVzZSB2aWV3cyBhcmUgdXNlZCBkaXJlY3RseSBvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9yb3V0ZXM8L2NvZGU+IGZpbGUgaXMgdGhlIG1vZHVsZSB3aGVyZSB5b3UgZXhwb3J0IGEgY29sbGVjdGlvbiBvZiByb3V0ZXMuIFRoZSBDTEkgd2lsbCBwdWxsIHRoZXNlIHJvdXRlcyB3aGVuIGNyZWF0aW5nIHRoZSBjbGllbnQtc2lkZSByb3V0ZXMgZm9yIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9jb250cm9sbGVyczwvY29kZT4gZGlyZWN0b3J5IGlzIHRoZSByb290IGRpcmVjdG9yeSB3aGVyZSB5b3VyIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGxpdmUuIEl0JiMzOTtzIHVzZWQgd2hlbiBzZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZSByb3V0ZXI8L2xpPlxcbjxsaT5UaGUgPGNvZGU+Y2xpZW50X2NvbnRyb2xsZXJzPC9jb2RlPiBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciBjbGllbnQtc2lkZSBjb250cm9sbGVyIG1vZHVsZXMgbGl2ZS4gVGhlIENMSSB3aWxsIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZXNlIGNvbnRyb2xsZXJzIGluIGl0cyByZXN1bHRpbmcgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPlRoZSA8Y29kZT5jbGllbnRfd2lyaW5nPC9jb2RlPiBmaWxlIGlzIHdoZXJlIHlvdXIgd2lyaW5nIG1vZHVsZSB3aWxsIGJlIHBsYWNlZCBieSB0aGUgQ0xJLiBZb3UmIzM5O2xsIHRoZW4gaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiBpdCBpbiB5b3VyIGFwcGxpY2F0aW9uIHdoZW4gYm9vdGluZyB1cCBUYXVudXM8L2xpPlxcbjwvdWw+XFxuPHA+SGVyZSBpcyB3aGVyZSB0aGluZ3MgZ2V0IDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmEgbGl0dGxlIGNvbnZlbnRpb25hbDwvYT4uIFZpZXdzLCBhbmQgYm90aCBzZXJ2ZXItc2lkZSBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4cGVjdGVkIHRvIGJlIG9yZ2FuaXplZCBieSBmb2xsb3dpbmcgdGhlIDxjb2RlPntyb290fS97Y29udHJvbGxlcn0ve2FjdGlvbn08L2NvZGU+IHBhdHRlcm4sIGJ1dCB5b3UgY291bGQgY2hhbmdlIHRoYXQgdXNpbmcgPGNvZGU+cmVzb2x2ZXJzPC9jb2RlPiB3aGVuIGludm9raW5nIHRoZSBDTEkgYW5kIHVzaW5nIHRoZSBzZXJ2ZXItc2lkZSBBUEkuPC9wPlxcbjxwPlZpZXdzIGFuZCBjb250cm9sbGVycyBhcmUgYWxzbyBleHBlY3RlZCB0byBiZSBDb21tb25KUyBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIG1ldGhvZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBBUEkgRG9jdW1lbnRhdGlvblxcblxcbiAgICBIZXJlJ3MgdGhlIEFQSSBkb2N1bWVudGF0aW9uIGZvciBUYXVudXMuIElmIHlvdSd2ZSBuZXZlciB1c2VkIGl0IGJlZm9yZSwgd2UgcmVjb21tZW5kIGdvaW5nIG92ZXIgdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlIGJlZm9yZSBqdW1waW5nIGludG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uLiBUaGF0IHdheSwgeW91J2xsIGdldCBhIGJldHRlciBpZGVhIG9mIHdoYXQgdG8gbG9vayBmb3IgYW5kIGhvdyB0byBwdXQgdG9nZXRoZXIgc2ltcGxlIGFwcGxpY2F0aW9ucyB1c2luZyBUYXVudXMsIGJlZm9yZSBnb2luZyB0aHJvdWdoIGRvY3VtZW50YXRpb24gb24gZXZlcnkgcHVibGljIGludGVyZmFjZSB0byBUYXVudXMuXFxuXFxuICAgIFRhdW51cyBleHBvc2VzIF90aHJlZSBkaWZmZXJlbnQgcHVibGljIEFQSXNfLCBhbmQgdGhlcmUncyBhbHNvICoqcGx1Z2lucyB0byBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcioqLiBUaGlzIGRvY3VtZW50IGNvdmVycyBhbGwgdGhyZWUgQVBJcyBleHRlbnNpdmVseS4gSWYgeW91J3JlIGNvbmNlcm5lZCBhYm91dCB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgVGF1bnVzLCBwbGVhc2UgcmVmZXIgdG8gdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlLiBUaGlzIGRvY3VtZW50IGFpbXMgdG8gb25seSBjb3ZlciBob3cgdGhlIHB1YmxpYyBpbnRlcmZhY2UgYWZmZWN0cyBhcHBsaWNhdGlvbiBzdGF0ZSwgYnV0ICoqZG9lc24ndCBkZWx2ZSBpbnRvIGltcGxlbWVudGF0aW9uIGRldGFpbHMqKi5cXG5cXG4gICAgIyBUYWJsZSBvZiBDb250ZW50c1xcblxcbiAgICAtIEEgW3NlcnZlci1zaWRlIEFQSV0oI3NlcnZlci1zaWRlLWFwaSkgdGhhdCBkZWFscyB3aXRoIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm1vdW50YF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgICAgLSBJdHMgW2BvcHRpb25zYF0oI3RoZS1vcHRpb25zLW9iamVjdCkgYXJndW1lbnRcXG4gICAgICAgICAgLSBbYGxheW91dGBdKCMtb3B0aW9ucy1sYXlvdXQtKVxcbiAgICAgICAgICAtIFtgcm91dGVzYF0oIy1vcHRpb25zLXJvdXRlcy0pXFxuICAgICAgICAgIC0gW2BnZXREZWZhdWx0Vmlld01vZGVsYF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKVxcbiAgICAgICAgICAtIFtgcGxhaW50ZXh0YF0oIy1vcHRpb25zLXBsYWludGV4dC0pXFxuICAgICAgICAgIC0gW2ByZXNvbHZlcnNgXSgjLW9wdGlvbnMtcmVzb2x2ZXJzLSlcXG4gICAgICAgICAgLSBbYHZlcnNpb25gXSgjLW9wdGlvbnMtdmVyc2lvbi0pXFxuICAgICAgICAgIC0gW2BkZWZlck1pbmlmaWVkYF0oIy1vcHRpb25zLWRlZmVybWluaWZpZWQtKVxcbiAgICAgICAgLSBJdHMgW2BhZGRSb3V0ZWBdKCMtYWRkcm91dGUtZGVmaW5pdGlvbi0pIGFyZ3VtZW50XFxuICAgICAgLSBUaGUgW2B0YXVudXMucmVuZGVyYF0oIy10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWxgXSgjLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLSkgbWV0aG9kXFxuICAgIC0gW1NlcnZlci1zaWRlIGNvbnRyb2xsZXJzXSgjc2VydmVyLXNpZGUtY29udHJvbGxlcnMpXFxuICAgIC0gQSBbc3VpdGUgb2YgcGx1Z2luc10oI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnMpIGNhbiBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlclxcbiAgICAgIC0gVXNpbmcgW2B0YXVudXMtZXhwcmVzc2BdKCN1c2luZy10YXVudXMtZXhwcmVzcy0pIGZvciBbRXhwcmVzc11bMl1cXG4gICAgICAtIFVzaW5nIFtgdGF1bnVzLWhhcGlgXSgjdXNpbmctdGF1bnVzLWhhcGktKSBmb3IgW0hhcGldWzNdXFxuICAgIC0gQSBbQ0xJIHRoYXQgcHJvZHVjZXMgYSB3aXJpbmcgbW9kdWxlXSgjY29tbWFuZC1saW5lLWludGVyZmFjZSkgZm9yIHRoZSBjbGllbnQtc2lkZVxcbiAgICAgIC0gVGhlIFtgLS1vdXRwdXRgXSgjLW91dHB1dC0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0td2F0Y2hgXSgjLXdhdGNoLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS10cmFuc2Zvcm0gPG1vZHVsZT5gXSgjLXRyYW5zZm9ybS1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLWRlZmVyYF0oIy1kZWZlci1hY3Rpb25zLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS1yZXNvbHZlcnMgPG1vZHVsZT5gXSgjLXJlc29sdmVycy1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLWJ1bmRsZWBdKCMtYnVuZGxlLSkgZmxhZ1xcbiAgICAtIEEgW2NsaWVudC1zaWRlIEFQSV0oI2NsaWVudC1zaWRlLWFwaSkgdGhhdCBkZWFscyB3aXRoIGNsaWVudC1zaWRlIHJlbmRlcmluZ1xcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm1vdW50YF0oIy10YXVudXMtbW91bnQtY29udGFpbmVyLXdpcmluZy1vcHRpb25zLSkgbWV0aG9kXFxuICAgICAgICAtIFVzaW5nIHRoZSBbYGF1dG9gXSgjdXNpbmctdGhlLWF1dG8tc3RyYXRlZ3kpIHN0cmF0ZWd5XFxuICAgICAgICAtIFVzaW5nIHRoZSBbYGlubGluZWBdKCN1c2luZy10aGUtaW5saW5lLXN0cmF0ZWd5KSBzdHJhdGVneVxcbiAgICAgICAgLSBVc2luZyB0aGUgW2BtYW51YWxgXSgjdXNpbmctdGhlLW1hbnVhbC1zdHJhdGVneSkgc3RyYXRlZ3lcXG4gICAgICAgIC0gW0NhY2hpbmddKCNjYWNoaW5nKVxcbiAgICAgICAgLSBbUHJlZmV0Y2hpbmddKCNwcmVmZXRjaGluZylcXG4gICAgICAgIC0gW1ZlcnNpb25pbmddKCN2ZXJzaW9uaW5nKVxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9uYF0oIy10YXVudXMtb24tdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9uY2VgXSgjLXRhdW51cy1vbmNlLXR5cGUtZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5vZmZgXSgjLXRhdW51cy1vZmYtdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLmludGVyY2VwdGBdKCMtdGF1bnVzLWludGVyY2VwdC1hY3Rpb24tZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5wYXJ0aWFsYF0oIy10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMubmF2aWdhdGVgXSgjLXRhdW51cy1uYXZpZ2F0ZS11cmwtb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJvdXRlYF0oIy10YXVudXMtcm91dGUtdXJsLSkgbWV0aG9kXFxuICAgICAgICAtIFRoZSBbYHRhdW51cy5yb3V0ZS5lcXVhbHNgXSgjLXRhdW51cy1yb3V0ZS1lcXVhbHMtcm91dGUtcm91dGUtKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5zdGF0ZWBdKCMtdGF1bnVzLXN0YXRlLSkgcHJvcGVydHlcXG4gICAgICAtIFRoZSBbYHRhdW51cy54aHJgXSgjLXRhdW51cy14aHItdXJsLW9wdGlvbnMtZG9uZS0pIG1ldGhvZFxcbiAgICAgIC0gW0RlYnVnZ2luZyBUYXVudXNdKCNkZWJ1Z2dpbmctdGF1bnVzKVxcbiAgICAtIFtDbGllbnQtc2lkZSBjb250cm9sbGVyc10oI2NsaWVudC1zaWRlLWNvbnRyb2xsZXJzKVxcbiAgICAtIFRoZSBbYC50YXVudXNyY2BdKCN0aGUtdGF1bnVzcmMtbWFuaWZlc3QpIG1hbmlmZXN0XFxuXFxuICAgICMgU2VydmVyLXNpZGUgQVBJXFxuXFxuICAgIFRoZSBzZXJ2ZXItc2lkZSBBUEkgaXMgdXNlZCB0byBzZXQgdXAgdGhlIHZpZXcgcm91dGVyLiBJdCB0aGVuIGdldHMgb3V0IG9mIHRoZSB3YXksIGFsbG93aW5nIHRoZSBjbGllbnQtc2lkZSB0byBldmVudHVhbGx5IHRha2Ugb3ZlciBhbmQgYWRkIGFueSBleHRyYSBzdWdhciBvbiB0b3AsIF9pbmNsdWRpbmcgY2xpZW50LXNpZGUgcmVuZGVyaW5nXy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5tb3VudChhZGRSb3V0ZSwgb3B0aW9ucz8pYFxcblxcbiAgICBNb3VudHMgVGF1bnVzIG9uIHRvcCBvZiBhIHNlcnZlci1zaWRlIHJvdXRlciwgYnkgcmVnaXN0ZXJpbmcgZWFjaCByb3V0ZSBpbiBgb3B0aW9ucy5yb3V0ZXNgIHdpdGggdGhlIGBhZGRSb3V0ZWAgbWV0aG9kLlxcblxcbiAgICA+IE5vdGUgdGhhdCBtb3N0IG9mIHRoZSB0aW1lLCAqKnRoaXMgbWV0aG9kIHNob3VsZG4ndCBiZSBpbnZva2VkIGRpcmVjdGx5KiosIGJ1dCByYXRoZXIgdGhyb3VnaCBvbmUgb2YgdGhlIFtIVFRQIGZyYW1ld29yayBwbHVnaW5zXSgjaHR0cC1mcmFtZXdvcmstcGx1Z2lucykgcHJlc2VudGVkIGJlbG93LlxcblxcbiAgICBIZXJlJ3MgYW4gaW5jb21wbGV0ZSBleGFtcGxlIG9mIGhvdyB0aGlzIG1ldGhvZCBtYXkgYmUgdXNlZC4gSXQgaXMgaW5jb21wbGV0ZSBiZWNhdXNlIHJvdXRlIGRlZmluaXRpb25zIGhhdmUgbW9yZSBvcHRpb25zIGJleW9uZCB0aGUgYHJvdXRlYCBhbmQgYGFjdGlvbmAgcHJvcGVydGllcy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB0YXVudXMubW91bnQoYWRkUm91dGUsIHtcXG4gICAgICByb3V0ZXM6IFt7IHJvdXRlOiAnLycsIGFjdGlvbjogJ2hvbWUvaW5kZXgnIH1dXFxuICAgIH0pO1xcblxcbiAgICBmdW5jdGlvbiBhZGRSb3V0ZSAoZGVmaW5pdGlvbikge1xcbiAgICAgIGFwcC5nZXQoZGVmaW5pdGlvbi5yb3V0ZSwgZGVmaW5pdGlvbi5hY3Rpb24pO1xcbiAgICB9XFxuICAgIGBgYFxcblxcbiAgICBMZXQncyBnbyBvdmVyIHRoZSBvcHRpb25zIHlvdSBjYW4gcGFzcyB0byBgdGF1bnVzLm1vdW50YCBmaXJzdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBUaGUgYG9wdGlvbnM/YCBvYmplY3RcXG5cXG4gICAgVGhlcmUncyBhIGZldyBvcHRpb25zIHRoYXQgY2FuIGJlIHBhc3NlZCB0byB0aGUgc2VydmVyLXNpZGUgbW91bnRwb2ludC4gWW91J3JlIHByb2JhYmx5IGdvaW5nIHRvIGJlIHBhc3NpbmcgdGhlc2UgdG8geW91ciBbSFRUUCBmcmFtZXdvcmsgcGx1Z2luXSgjaHR0cC1mcmFtZXdvcmstcGx1Z2lucyksIHJhdGhlciB0aGFuIHVzaW5nIGB0YXVudXMubW91bnRgIGRpcmVjdGx5LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMubGF5b3V0P2BcXG5cXG4gICAgVGhlIGBsYXlvdXRgIHByb3BlcnR5IGlzIGV4cGVjdGVkIHRvIGhhdmUgdGhlIGBmdW5jdGlvbihkYXRhKWAgc2lnbmF0dXJlLiBJdCdsbCBiZSBpbnZva2VkIHdoZW5ldmVyIGEgZnVsbCBIVE1MIGRvY3VtZW50IG5lZWRzIHRvIGJlIHJlbmRlcmVkLCBhbmQgYSBgZGF0YWAgb2JqZWN0IHdpbGwgYmUgcGFzc2VkIHRvIGl0LiBUaGF0IG9iamVjdCB3aWxsIGNvbnRhaW4gZXZlcnl0aGluZyB5b3UndmUgc2V0IGFzIHRoZSB2aWV3IG1vZGVsLCBwbHVzIGEgYHBhcnRpYWxgIHByb3BlcnR5IGNvbnRhaW5pbmcgdGhlIHJhdyBIVE1MIG9mIHRoZSByZW5kZXJlZCBwYXJ0aWFsIHZpZXcuIFlvdXIgYGxheW91dGAgbWV0aG9kIHdpbGwgdHlwaWNhbGx5IHdyYXAgdGhlIHJhdyBIVE1MIGZvciB0aGUgcGFydGlhbCB3aXRoIHRoZSBiYXJlIGJvbmVzIG9mIGFuIEhUTUwgZG9jdW1lbnQuIENoZWNrIG91dCBbdGhlIGBsYXlvdXQuamFkZWAgdXNlZCBpbiBQb255IEZvb11bNF0gYXMgYW4gZXhhbXBsZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnJvdXRlc2BcXG5cXG4gICAgVGhlIG90aGVyIGJpZyBvcHRpb24gaXMgYHJvdXRlc2AsIHdoaWNoIGV4cGVjdHMgYSBjb2xsZWN0aW9uIG9mIHJvdXRlIGRlZmluaXRpb25zLiBSb3V0ZSBkZWZpbml0aW9ucyB1c2UgYSBudW1iZXIgb2YgcHJvcGVydGllcyB0byBkZXRlcm1pbmUgaG93IHRoZSByb3V0ZSBpcyBnb2luZyB0byBiZWhhdmUuXFxuXFxuICAgIEhlcmUncyBhbiBleGFtcGxlIHJvdXRlIHRoYXQgdXNlcyB0aGUgW0V4cHJlc3NdWzJdIHJvdXRpbmcgc2NoZW1lLlxcblxcbiAgICBgYGBqc1xcbiAgICB7XFxuICAgICAgcm91dGU6ICcvYXJ0aWNsZXMvOnNsdWcnLFxcbiAgICAgIGFjdGlvbjogJ2FydGljbGVzL2FydGljbGUnLFxcbiAgICAgIGlnbm9yZTogZmFsc2UsXFxuICAgICAgY2FjaGU6IDxpbmhlcml0PlxcbiAgICB9XFxuICAgIGBgYFxcblxcbiAgICAtIGByb3V0ZWAgaXMgYSByb3V0ZSBpbiB0aGUgZm9ybWF0IHlvdXIgSFRUUCBmcmFtZXdvcmsgb2YgY2hvaWNlIHVuZGVyc3RhbmRzXFxuICAgIC0gYGFjdGlvbmAgaXMgdGhlIG5hbWUgb2YgeW91ciBjb250cm9sbGVyIGFjdGlvbi4gSXQnbGwgYmUgdXNlZCB0byBmaW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLCB0aGUgZGVmYXVsdCB2aWV3IHRoYXQgc2hvdWxkIGJlIHVzZWQgd2l0aCB0aGlzIHJvdXRlLCBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJcXG4gICAgLSBgY2FjaGVgIGNhbiBiZSB1c2VkIHRvIGRldGVybWluZSB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBiZWhhdmlvciBpbiB0aGlzIGFwcGxpY2F0aW9uIHBhdGgsIGFuZCBpdCdsbCBkZWZhdWx0IHRvIGluaGVyaXRpbmcgZnJvbSB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgX29uIHRoZSBjbGllbnQtc2lkZV9cXG4gICAgLSBgaWdub3JlYCBpcyB1c2VkIGluIHRob3NlIGNhc2VzIHdoZXJlIHlvdSB3YW50IGEgVVJMIHRvIGJlIGlnbm9yZWQgYnkgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBldmVuIGlmIHRoZXJlJ3MgYSBjYXRjaC1hbGwgcm91dGUgdGhhdCB3b3VsZCBtYXRjaCB0aGF0IFVSTFxcblxcbiAgICBBcyBhbiBleGFtcGxlIG9mIHRoZSBgaWdub3JlYCB1c2UgY2FzZSwgY29uc2lkZXIgdGhlIHJvdXRpbmcgdGFibGUgc2hvd24gYmVsb3cuIFRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZG9lc24ndCBrbm93IF8oYW5kIGNhbid0IGtub3cgdW5sZXNzIHlvdSBwb2ludCBpdCBvdXQpXyB3aGF0IHJvdXRlcyBhcmUgc2VydmVyLXNpZGUgb25seSwgYW5kIGl0J3MgdXAgdG8geW91IHRvIHBvaW50IHRob3NlIG91dC5cXG5cXG4gICAgYGBganNcXG4gICAgW1xcbiAgICAgIHsgcm91dGU6ICcvJywgYWN0aW9uOiAnL2hvbWUvaW5kZXgnIH0sXFxuICAgICAgeyByb3V0ZTogJy9mZWVkJywgaWdub3JlOiB0cnVlIH0sXFxuICAgICAgeyByb3V0ZTogJy8qJywgYWN0aW9uOiAnZXJyb3Ivbm90LWZvdW5kJyB9XFxuICAgIF1cXG4gICAgYGBgXFxuXFxuICAgIFRoaXMgc3RlcCBpcyBuZWNlc3Nhcnkgd2hlbmV2ZXIgeW91IGhhdmUgYW4gYW5jaG9yIGxpbmsgcG9pbnRlZCBhdCBzb21ldGhpbmcgbGlrZSBhbiBSU1MgZmVlZC4gVGhlIGBpZ25vcmVgIHByb3BlcnR5IGlzIGVmZmVjdGl2ZWx5IHRlbGxpbmcgdGhlIGNsaWVudC1zaWRlIF9cXFwiZG9uJ3QgaGlqYWNrIGxpbmtzIGNvbnRhaW5pbmcgdGhpcyBVUkxcXFwiXy5cXG5cXG4gICAgUGxlYXNlIG5vdGUgdGhhdCBleHRlcm5hbCBsaW5rcyBhcmUgbmV2ZXIgaGlqYWNrZWQuIE9ubHkgc2FtZS1vcmlnaW4gbGlua3MgY29udGFpbmluZyBhIFVSTCB0aGF0IG1hdGNoZXMgb25lIG9mIHRoZSByb3V0ZXMgd2lsbCBiZSBoaWphY2tlZCBieSBUYXVudXMuIEV4dGVybmFsIGxpbmtzIGRvbid0IG5lZWQgdG8gYmUgYGlnbm9yZWBkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMuZ2V0RGVmYXVsdFZpZXdNb2RlbD9gXFxuXFxuICAgIFRoZSBgZ2V0RGVmYXVsdFZpZXdNb2RlbChkb25lKWAgcHJvcGVydHkgY2FuIGJlIGEgbWV0aG9kIHRoYXQgcHV0cyB0b2dldGhlciB0aGUgYmFzZSB2aWV3IG1vZGVsLCB3aGljaCB3aWxsIHRoZW4gYmUgZXh0ZW5kZWQgb24gYW4gYWN0aW9uLWJ5LWFjdGlvbiBiYXNpcy4gV2hlbiB5b3UncmUgZG9uZSBjcmVhdGluZyBhIHZpZXcgbW9kZWwsIHlvdSBjYW4gaW52b2tlIGBkb25lKG51bGwsIG1vZGVsKWAuIElmIGFuIGVycm9yIG9jY3VycyB3aGlsZSBidWlsZGluZyB0aGUgdmlldyBtb2RlbCwgeW91IHNob3VsZCBjYWxsIGBkb25lKGVycilgIGluc3RlYWQuXFxuXFxuICAgIFRhdW51cyB3aWxsIHRocm93IGFuIGVycm9yIGlmIGBkb25lYCBpcyBpbnZva2VkIHdpdGggYW4gZXJyb3IsIHNvIHlvdSBtaWdodCB3YW50IHRvIHB1dCBzYWZlZ3VhcmRzIGluIHBsYWNlIGFzIHRvIGF2b2lkIHRoYXQgZnJvbSBoYXBwZW5uaW5nLiBUaGUgcmVhc29uIHRoaXMgbWV0aG9kIGlzIGFzeW5jaHJvbm91cyBpcyBiZWNhdXNlIHlvdSBtYXkgbmVlZCBkYXRhYmFzZSBhY2Nlc3Mgb3Igc29tZXN1Y2ggd2hlbiBwdXR0aW5nIHRvZ2V0aGVyIHRoZSBkZWZhdWx0cy4gVGhlIHJlYXNvbiB0aGlzIGlzIGEgbWV0aG9kIGFuZCBub3QganVzdCBhbiBvYmplY3QgaXMgdGhhdCB0aGUgZGVmYXVsdHMgbWF5IGNoYW5nZSBkdWUgdG8gaHVtYW4gaW50ZXJhY3Rpb24gd2l0aCB0aGUgYXBwbGljYXRpb24sIGFuZCBpbiB0aG9zZSBjYXNlcyBbdGhlIGRlZmF1bHRzIGNhbiBiZSByZWJ1aWx0XSgjdGF1bnVzLXJlYnVpbGRkZWZhdWx0dmlld21vZGVsKS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnBsYWludGV4dD9gXFxuXFxuICAgIFRoZSBgcGxhaW50ZXh0YCBvcHRpb25zIG9iamVjdCBpcyBwYXNzZWQgZGlyZWN0bHkgdG8gW2hnZXRdWzVdLCBhbmQgaXQncyB1c2VkIHRvIFt0d2VhayB0aGUgcGxhaW50ZXh0IHZlcnNpb25dWzZdIG9mIHlvdXIgc2l0ZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnJlc29sdmVycz9gXFxuXFxuICAgIFJlc29sdmVycyBhcmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGxvY2F0aW9uIG9mIHNvbWUgb2YgdGhlIGRpZmZlcmVudCBwaWVjZXMgb2YgeW91ciBhcHBsaWNhdGlvbi4gVHlwaWNhbGx5IHlvdSB3b24ndCBoYXZlIHRvIHRvdWNoIHRoZXNlIGluIHRoZSBzbGlnaHRlc3QuXFxuXFxuICAgIFNpZ25hdHVyZSAgICAgICAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgZ2V0U2VydmVyQ29udHJvbGxlcihhY3Rpb24pYCB8IFJldHVybiBwYXRoIHRvIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlXFxuICAgIGBnZXRWaWV3KGFjdGlvbilgICAgICAgICAgICAgIHwgUmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGVcXG5cXG4gICAgVGhlIGBhZGRSb3V0ZWAgbWV0aG9kIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBvbiB0aGUgc2VydmVyLXNpZGUgaXMgbW9zdGx5IGdvaW5nIHRvIGJlIHVzZWQgaW50ZXJuYWxseSBieSB0aGUgSFRUUCBmcmFtZXdvcmsgcGx1Z2lucywgc28gZmVlbCBmcmVlIHRvIHNraXAgb3ZlciB0aGUgZm9sbG93aW5nIHNlY3Rpb24uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy52ZXJzaW9uP2BcXG5cXG4gICAgUmVmZXIgdG8gdGhlIFtWZXJzaW9uaW5nXSgjdmVyc2lvbmluZykgc2VjdGlvbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLmdldFBhcnRpYWw/YFxcblxcbiAgICBCeSBkZWZhdWx0LCBUYXVudXMgd2lsbCByZW5kZXIgcGFydGlhbHMgb24gdGhlIHNlcnZlci1zaWRlIGJ5IGxvb2tpbmcgdXAgdGhlIG1vZHVsZSBmb3IgYW4gYWN0aW9uIG1ldGhvZCwgYW5kIGNhbGxpbmcgdGhhdCBhY3Rpb24gcGFzc2luZyBpbiBhIG1vZGVsLlxcblxcbiAgICBZb3UgY2FuIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGJlaGF2aW9yIGJ5IHNldHRpbmcgYG9wdGlvbnMuZ2V0UGFydGlhbGAgdG8gYSBmdW5jdGlvbi4gVGhpcyBtZXRob2QgdGFrZXMgdGhyZWUgcGFyYW1ldGVycy5cXG5cXG4gICAgLSBgYWN0aW9uYCBpcyB0aGUgYWN0aW9uIHRoYXQgbmVlZHMgdG8gYmUgcmVuZGVyZWRcXG4gICAgLSBgbW9kZWxgIGlzIHRoZSBtb2RlbCB5b3UgY2FuIHVzZSB0byByZW5kZXIgdGhlIHZpZXcgZm9yIHRoYXQgYWN0aW9uXFxuICAgIC0gYGRvbmUoZXJyLCBodG1sKWAgaXMgY2FsbGVkIHdoZW4geW91J3JlIGRvbmUsIHBhc3NpbmcgaW4gdGhlIHJlc3VsdGluZyBgaHRtbGAgZm9yIHRoZSBwYXJ0aWFsXFxuXFxuICAgIE5vdGUgdGhhdCBpZiB5b3UgZG9uJ3Qgc2V0IGBnZXRQYXJ0aWFsYCwgVGF1bnVzIHdpbGwganVzdCByZXF1aXJlIHlvdXIgY29udHJvbGxlciBhY3Rpb24gbWV0aG9kIGFuZCBpbnZva2UgdGhhdCBpbnN0ZWFkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMuZGVmZXJNaW5pZmllZD9gXFxuXFxuICAgIFdoZW4gdmlld3MgYW5kIGNvbnRyb2xsZXJzIGFyZSBsYXppbHkgbG9hZGVkLCB0aGV5IGFyZSBjb21waWxlZCBhbmQgYnVuZGxlZCB1c2luZyBCcm93c2VyaWZ5LiBUYXVudXMgd2lsbCBldmVuIHByb2R1Y2UgYSBzb3VyY2UgbWFwLiBUbyBhdm9pZCB0aGUgc291cmNlIG1hcCwgYW5kIG1pbmlmeSB0aGUgYnVuZGxlIGluc3RlYWQsIHNldCBgZGVmZXJNaW5pZmllZGAgdG8gYHRydWVgLlxcblxcbiAgICBZb3UnbGwgcHJvYmFibHkgd2FudCB0byBzZXQgYGRlZmVyTWluaWZpZWRgIHRvIHdoZXRoZXIgdGhlIGFwcGxpY2F0aW9uIGlzIHJ1bm5pbmcgb24gdGhlIHByb2R1Y3Rpb24gZW52aXJvbm1lbnQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgYGFkZFJvdXRlKGRlZmluaXRpb24pYFxcblxcbiAgICBUaGUgYGFkZFJvdXRlKGRlZmluaXRpb24pYCBtZXRob2Qgd2lsbCBiZSBwYXNzZWQgYSByb3V0ZSBkZWZpbml0aW9uLCBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllcy4gVGhpcyBtZXRob2QgaXMgZXhwZWN0ZWQgdG8gcmVnaXN0ZXIgYSByb3V0ZSBpbiB5b3VyIEhUVFAgZnJhbWV3b3JrJ3Mgcm91dGVyLlxcblxcbiAgICAtIGByb3V0ZWAgaXMgdGhlIHJvdXRlIHRoYXQgeW91IHNldCBhcyBgZGVmaW5pdGlvbi5yb3V0ZWBcXG4gICAgLSBgYWN0aW9uYCBpcyB0aGUgYWN0aW9uIGFzIHBhc3NlZCB0byB0aGUgcm91dGUgZGVmaW5pdGlvblxcbiAgICAtIGBhY3Rpb25GbmAgd2lsbCBiZSB0aGUgY29udHJvbGxlciBmb3IgdGhpcyBhY3Rpb24gbWV0aG9kXFxuICAgIC0gYG1pZGRsZXdhcmVgIHdpbGwgYmUgYW4gYXJyYXkgb2YgbWV0aG9kcyB0byBiZSBleGVjdXRlZCBiZWZvcmUgYGFjdGlvbkZuYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnJlbmRlcihhY3Rpb24sIHZpZXdNb2RlbCwgcmVxLCByZXMsIG5leHQpYFxcblxcbiAgICBUaGlzIG1ldGhvZCBpcyBhbG1vc3QgYW4gaW1wbGVtZW50YXRpb24gZGV0YWlsIGFzIHlvdSBzaG91bGQgYmUgdXNpbmcgVGF1bnVzIHRocm91Z2ggb25lIG9mIHRoZSBwbHVnaW5zIGFueXdheXMsIHNvIHdlIHdvbid0IGdvIHZlcnkgZGVlcCBpbnRvIGl0LlxcblxcbiAgICBUaGUgcmVuZGVyIG1ldGhvZCBpcyB3aGF0IFRhdW51cyB1c2VzIHRvIHJlbmRlciB2aWV3cyBieSBjb25zdHJ1Y3RpbmcgSFRNTCwgSlNPTiwgb3IgcGxhaW50ZXh0IHJlc3BvbnNlcy4gVGhlIGBhY3Rpb25gIHByb3BlcnR5IGRldGVybWluZXMgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHdpbGwgYmUgcmVuZGVyZWQuIFRoZSBgdmlld01vZGVsYCB3aWxsIGJlIGV4dGVuZGVkIGJ5IFt0aGUgZGVmYXVsdCB2aWV3IG1vZGVsXSgjLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC0pLCBhbmQgaXQgbWF5IGFsc28gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgYGFjdGlvbmAgYnkgc2V0dGluZyBgdmlld01vZGVsLm1vZGVsLmFjdGlvbmAuXFxuXFxuICAgIFRoZSBgcmVxYCwgYHJlc2AsIGFuZCBgbmV4dGAgYXJndW1lbnRzIGFyZSBleHBlY3RlZCB0byBiZSB0aGUgRXhwcmVzcyByb3V0aW5nIGFyZ3VtZW50cywgYnV0IHRoZXkgY2FuIGFsc28gYmUgbW9ja2VkIF8od2hpY2ggaXMgaW4gZmFjdCB3aGF0IHRoZSBIYXBpIHBsdWdpbiBkb2VzKV8uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWwoZG9uZT8pYFxcblxcbiAgICBPbmNlIFRhdW51cyBoYXMgYmVlbiBtb3VudGVkLCBjYWxsaW5nIHRoaXMgbWV0aG9kIHdpbGwgcmVidWlsZCB0aGUgdmlldyBtb2RlbCBkZWZhdWx0cyB1c2luZyB0aGUgYGdldERlZmF1bHRWaWV3TW9kZWxgIHRoYXQgd2FzIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBpbiB0aGUgb3B0aW9ucy4gQW4gb3B0aW9uYWwgYGRvbmVgIGNhbGxiYWNrIHdpbGwgYmUgaW52b2tlZCB3aGVuIHRoZSBtb2RlbCBpcyByZWJ1aWx0LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFNlcnZlci1TaWRlIENvbnRyb2xsZXJzXFxuXFxuICAgIE9uIHRoZSBzZXJ2ZXItc2lkZSwgY29udHJvbGxlcnMgYXJlIG1vZHVsZXMgdGhhdCBleHBvcnQgYSBzaW5nbGUgZnVuY3Rpb24uIFRoZSBwYXJhbWV0ZXJzIHBhc3NlZCB0byB0aGVzZSBjb250cm9sbGVycyBkZXBlbmQgb24gdGhlIHNlcnZlci1zaWRlIEhUVFAgZnJhbWV3b3JrIHRoYXQncyBiZWluZyB1c2VkLlxcblxcbiAgICBGb3IgZXhhbXBsZSwgRXhwcmVzcyBnaXZlcyB1cyB0aHJlZSBwYXJhbWV0ZXJzOiBgcmVxYCwgYHJlc2AgYW5kIGBuZXh0YC4gSGFwaSBnaXZlcyB1cyB0d28gaW5zdGVhZDogYHJlcXVlc3RgIGFuZCBgcmVwbHlgLlxcblxcbiAgICBIZXJlJ3MgYSBzYW1wbGUgY29udHJvbGxlciB1c2luZyBgdGF1bnVzLWV4cHJlc3NgLCBhcyBbZGV0YWlsZWQgYmVsb3ddKCN1c2luZy10YXVudXMtZXhwcmVzcy0pLiBUaGlzIGlzIGEgdmVyeSBzaW1wbGUgY29udHJvbGxlciB3aGVyZSB3ZSBhcmUgc2V0dGluZyB0aGUgc3BlY2lhbCBgdmlld01vZGVsYCBwcm9wZXJ0eSBvbiB0aGUgcmVzcG9uc2UsIGFuZCBjYWxsaW5nIGBuZXh0YC4gU3VwcG9zZSB0aGlzIGNvbnRyb2xsZXIgaXMgdGhlIGBwcm9kdWN0L2hvbWVgIGFjdGlvbiBoYW5kbGVyLlxcblxcbiAgICBgYGBqc1xcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgICAgIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgICAgICBtb2RlbDoge1xcbiAgICAgICAgICB0aXRsZTogJ3ZpZXcgdGl0bGUnXFxuICAgICAgICB9XFxuICAgICAgfTtcXG4gICAgICBuZXh0KCk7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBBcyB5b3UgY2FuIHNlZSwgVGF1bnVzIHdvbid0IGFsdGVyIHRoZSBBUEkgcHJvdmlkZWQgYnkgRXhwcmVzcy4gSW5zdGVhZCwgaXQgYnVpbGRzIHVwb24gdGhlIG5vdGlvbiBvZiB1c2luZyBtaWRkbGV3YXJlLiBPbmNlIHRoZSBgcHJvZHVjdC9ob21lYCB2aWV3IGlzIHJlbmRlcmVkIGFuZCBKYXZhU2NyaXB0IGxvYWRzLCB0aGUgYHByb2R1Y3QvaG9tZWAgdmlldyBjb250cm9sbGVyIGlzIGV4ZWN1dGVkIG9uIHRoZSBjbGllbnQtc2lkZS5cXG5cXG4gICAgWW91IGNvdWxkIGNoYW5nZSB0aGUgdmlldyB0byBiZSByZW5kZXJlZCBieSBzZXR0aW5nIHRoZSBgYWN0aW9uYCBwcm9wZXJ0eSBvbiB0aGUgYG1vZGVsYC4gSW4gdGhlIGV4YW1wbGUgc2hvd24gYmVsb3cgdGhpcyB3b3VsZCBtZWFuIHRoYXQgdGhlIGBlcnJvci9vZmZsaW5lYCB2aWV3IHdvdWxkIGJlIHJlbmRlcmVkLiBUaGUgY2xpZW50LXNpZGUgY29udHJvbGxlciB3aWxsIGJlIHRoYXQgb2YgYGVycm9yL29mZmxpbmVgLCBhcyB3ZWxsLiBWaWV3IGNvbnRyb2xsZXJzIGFyZSB0aWVkIHRvIHRoZSB2aWV3IHRoYXQgZ2V0cyByZW5kZXJlZC5cXG5cXG4gICAgYGBganNcXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gICAgICByZXMudmlld01vZGVsID0ge1xcbiAgICAgICAgbW9kZWw6IHtcXG4gICAgICAgICAgdGl0bGU6ICd2aWV3IHRpdGxlJ1xcbiAgICAgICAgfVxcbiAgICAgIH07XFxuICAgICAgaWYgKG9mZmxpbmUpIHtcXG4gICAgICAgIHJlcy52aWV3TW9kZWwubW9kZWwuYWN0aW9uID0gJ2Vycm9yL29mZmxpbmUnO1xcbiAgICAgIH1cXG4gICAgICBuZXh0KCk7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBIYXZpbmcgYSBkZWZhdWx0IGFjdGlvbiBhbmQgdGhlIGFiaWxpdHkgdG8gcmVkaXJlY3QgdG8gYW5vdGhlciBnaXZlcyB1cyBhIGxvdCBvZiBmbGV4aWJpbGl0eSB3aGVuIGRldGVybWluaW5nIGhvdyB0byByZXNwb25kIHRvIGEgcmVxdWVzdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBIVFRQIEZyYW1ld29yayBQbHVnaW5zXFxuXFxuICAgIFRoZXJlJ3MgY3VycmVudGx5IHR3byBkaWZmZXJlbnQgSFRUUCBmcmFtZXdvcmtzIF8oW0V4cHJlc3NdWzJdIGFuZCBbSGFwaV1bM10pXyB0aGF0IHlvdSBjYW4gcmVhZGlseSB1c2Ugd2l0aCBUYXVudXMgd2l0aG91dCBoYXZpbmcgdG8gZGVhbCB3aXRoIGFueSBvZiB0aGUgcm91dGUgcGx1bWJpbmcgeW91cnNlbGYuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtZXhwcmVzc2BcXG5cXG4gICAgVGhlIGB0YXVudXMtZXhwcmVzc2AgcGx1Z2luIGlzIHByb2JhYmx5IHRoZSBlYXNpZXN0IHRvIHVzZSwgYXMgVGF1bnVzIHdhcyBvcmlnaW5hbGx5IGRldmVsb3BlZCB3aXRoIGp1c3QgW0V4cHJlc3NdWzJdIGluIG1pbmQuIEluIGFkZGl0aW9uIHRvIHRoZSBvcHRpb25zIGFscmVhZHkgb3V0bGluZWQgZm9yIFt0YXVudXMubW91bnRdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgeW91IGNhbiBhZGQgbWlkZGxld2FyZSBmb3IgYW55IHJvdXRlIGluZGl2aWR1YWxseS5cXG5cXG4gICAgLSBgbWlkZGxld2FyZWAgYXJlIGFueSBtZXRob2RzIHlvdSB3YW50IFRhdW51cyB0byBleGVjdXRlIGFzIG1pZGRsZXdhcmUgaW4gRXhwcmVzcyBhcHBsaWNhdGlvbnNcXG5cXG4gICAgVG8gZ2V0IGB0YXVudXMtZXhwcmVzc2AgZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBwcm92aWRlZCB0aGF0IHlvdSBjb21lIHVwIHdpdGggYW4gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIC8vIC4uLlxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgdGF1bnVzRXhwcmVzc2AgbWV0aG9kIHdpbGwgbWVyZWx5IHNldCB1cCBUYXVudXMgYW5kIGFkZCB0aGUgcmVsZXZhbnQgcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBhcHBsaWNhdGlvbiBieSBjYWxsaW5nIGBhcHAuZ2V0YCBhIGJ1bmNoIG9mIHRpbWVzLiBZb3UgY2FuIFtmaW5kIHRhdW51cy1leHByZXNzIG9uIEdpdEh1Yl1bN10uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtaGFwaWBcXG5cXG4gICAgVGhlIGB0YXVudXMtaGFwaWAgcGx1Z2luIGlzIGEgYml0IG1vcmUgaW52b2x2ZWQsIGFuZCB5b3UnbGwgaGF2ZSB0byBjcmVhdGUgYSBQYWNrIGluIG9yZGVyIHRvIHVzZSBpdC4gSW4gYWRkaXRpb24gdG8gW3RoZSBvcHRpb25zIHdlJ3ZlIGFscmVhZHkgY292ZXJlZF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pLCB5b3UgY2FuIGFkZCBgY29uZmlnYCBvbiBhbnkgcm91dGUuXFxuXFxuICAgIC0gYGNvbmZpZ2AgaXMgcGFzc2VkIGRpcmVjdGx5IGludG8gdGhlIHJvdXRlIHJlZ2lzdGVyZWQgd2l0aCBIYXBpLCBnaXZpbmcgeW91IHRoZSBtb3N0IGZsZXhpYmlsaXR5XFxuXFxuICAgIFRvIGdldCBgdGF1bnVzLWhhcGlgIGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgYW5kIHlvdSBjYW4gYnJpbmcgeW91ciBvd24gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgSGFwaSA9IHJlcXVpcmUoJ2hhcGknKTtcXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzSGFwaSA9IHJlcXVpcmUoJ3RhdW51cy1oYXBpJykodGF1bnVzKTtcXG4gICAgdmFyIHBhY2sgPSBuZXcgSGFwaS5QYWNrKCk7XFxuXFxuICAgIHBhY2sucmVnaXN0ZXIoe1xcbiAgICAgIHBsdWdpbjogdGF1bnVzSGFwaSxcXG4gICAgICBvcHRpb25zOiB7XFxuICAgICAgICAvLyAuLi5cXG4gICAgICB9XFxuICAgIH0pO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGB0YXVudXNIYXBpYCBwbHVnaW4gd2lsbCBtb3VudCBUYXVudXMgYW5kIHJlZ2lzdGVyIGFsbCBvZiB0aGUgbmVjZXNzYXJ5IHJvdXRlcy4gWW91IGNhbiBbZmluZCB0YXVudXMtaGFwaSBvbiBHaXRIdWJdWzhdLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIENvbW1hbmQtTGluZSBJbnRlcmZhY2VcXG5cXG4gICAgT25jZSB5b3UndmUgc2V0IHVwIHRoZSBzZXJ2ZXItc2lkZSB0byByZW5kZXIgeW91ciB2aWV3cyB1c2luZyBUYXVudXMsIGl0J3Mgb25seSBsb2dpY2FsIHRoYXQgeW91J2xsIHdhbnQgdG8gcmVuZGVyIHRoZSB2aWV3cyBpbiB0aGUgY2xpZW50LXNpZGUgYXMgd2VsbCwgZWZmZWN0aXZlbHkgY29udmVydGluZyB5b3VyIGFwcGxpY2F0aW9uIGludG8gYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbiBhZnRlciB0aGUgZmlyc3QgdmlldyBoYXMgYmVlbiByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuXFxuXFxuICAgIFRoZSBUYXVudXMgQ0xJIGlzIGFuIHVzZWZ1bCBpbnRlcm1lZGlhcnkgaW4gdGhlIHByb2Nlc3Mgb2YgZ2V0dGluZyB0aGUgY29uZmlndXJhdGlvbiB5b3Ugd3JvdGUgc28gZmFyIGZvciB0aGUgc2VydmVyLXNpZGUgdG8gYWxzbyB3b3JrIHdlbGwgaW4gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJbnN0YWxsIGl0IGdsb2JhbGx5IGZvciBkZXZlbG9wbWVudCwgYnV0IHJlbWVtYmVyIHRvIHVzZSBsb2NhbCBjb3BpZXMgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgdXNlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLWcgdGF1bnVzXFxuICAgIGBgYFxcblxcbiAgICBXaGVuIGludm9rZWQgd2l0aG91dCBhbnkgYXJndW1lbnRzLCB0aGUgQ0xJIHdpbGwgc2ltcGx5IGZvbGxvdyB0aGUgZGVmYXVsdCBjb252ZW50aW9ucyB0byBmaW5kIHlvdXIgcm91dGUgZGVmaW5pdGlvbnMsIHZpZXdzLCBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgQnkgZGVmYXVsdCwgdGhlIG91dHB1dCB3aWxsIGJlIHByaW50ZWQgdG8gdGhlIHN0YW5kYXJkIG91dHB1dCwgbWFraW5nIGZvciBhIGZhc3QgZGVidWdnaW5nIGV4cGVyaWVuY2UuIEhlcmUncyB0aGUgb3V0cHV0IGlmIHlvdSBqdXN0IGhhZCBhIHNpbmdsZSBgaG9tZS9pbmRleGAgcm91dGUsIGFuZCB0aGUgbWF0Y2hpbmcgdmlldyBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlciBleGlzdGVkLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0ZW1wbGF0ZXMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuL3ZpZXdzL2hvbWUvaW5kZXguanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgY29udHJvbGxlcnMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciByb3V0ZXMgPSBbXFxuICAgICAge1xcbiAgICAgICAgcm91dGU6ICcvJyxcXG4gICAgICAgIGFjdGlvbjogJ2hvbWUvaW5kZXgnXFxuICAgICAgfVxcbiAgICBdO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcXG4gICAgICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gICAgICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICAgICAgcm91dGVzOiByb3V0ZXNcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIFlvdSBjYW4gdXNlIGEgZmV3IG9wdGlvbnMgdG8gYWx0ZXIgdGhlIG91dGNvbWUgb2YgaW52b2tpbmcgYHRhdW51c2AuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLW91dHB1dGBcXG5cXG4gICAgPHN1Yj50aGUgYC1vYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgT3V0cHV0IGlzIHdyaXR0ZW4gdG8gYSBmaWxlIGluc3RlYWQgb2YgdG8gc3RhbmRhcmQgb3V0cHV0LiBUaGUgZmlsZSBwYXRoIHVzZWQgd2lsbCBiZSB0aGUgYGNsaWVudF93aXJpbmdgIG9wdGlvbiBpbiBbYC50YXVudXNyY2BdKCN0aGUtdGF1bnVzcmMtbWFuaWZlc3QpLCB3aGljaCBkZWZhdWx0cyB0byBgJy5iaW4vd2lyaW5nLmpzJ2AuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXdhdGNoYFxcblxcbiAgICA8c3ViPnRoZSBgLXdgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBXaGVuZXZlciBhIHNlcnZlci1zaWRlIHJvdXRlIGRlZmluaXRpb24gY2hhbmdlcywgdGhlIG91dHB1dCBpcyBwcmludGVkIGFnYWluIHRvIGVpdGhlciBzdGFuZGFyZCBvdXRwdXQgb3IgYSBmaWxlLCBkZXBlbmRpbmcgb24gd2hldGhlciBgLS1vdXRwdXRgIHdhcyB1c2VkLlxcblxcbiAgICBUaGUgcHJvZ3JhbSB3b24ndCBleGl0LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS10cmFuc2Zvcm0gPG1vZHVsZT5gXFxuXFxuICAgIDxzdWI+dGhlIGAtdGAgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIFRoaXMgZmxhZyBhbGxvd3MgeW91IHRvIHRyYW5zZm9ybSBzZXJ2ZXItc2lkZSByb3V0ZXMgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHVuZGVyc3RhbmRzLiBFeHByZXNzIHJvdXRlcyBhcmUgY29tcGxldGVseSBjb21wYXRpYmxlIHdpdGggdGhlIGNsaWVudC1zaWRlIHJvdXRlciwgYnV0IEhhcGkgcm91dGVzIG5lZWQgdG8gYmUgdHJhbnNmb3JtZWQgdXNpbmcgdGhlIFtgaGFwaWlmeWBdWzldIG1vZHVsZS5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgaGFwaWlmeVxcbiAgICB0YXVudXMgLXQgaGFwaWlmeVxcbiAgICBgYGBcXG5cXG4gICAgVXNpbmcgdGhpcyB0cmFuc2Zvcm0gcmVsaWV2ZXMgeW91IGZyb20gaGF2aW5nIHRvIGRlZmluZSB0aGUgc2FtZSByb3V0ZXMgdHdpY2UgdXNpbmcgc2xpZ2h0bHkgZGlmZmVyZW50IGZvcm1hdHMgdGhhdCBjb252ZXkgdGhlIHNhbWUgbWVhbmluZy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tZGVmZXIgW2FjdGlvbnNdYFxcblxcbiAgICA8c3ViPnRoZSBgLWRgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBIZXJlIGlzIHdoZXJlIHRoaW5ncyBnZXQgaW50ZXJlc3RpbmcuIFRoZSBgLS1kZWZlcmAgZmxhZyBhbGxvd3MgeW91IHRvIGRlZmVyIGxvYWRpbmcgZm9yIHplcm8gb3IgbW9yZSBhY3Rpb25zLiBFeGNsdWRpbmcgdGhlIGNvbnRyb2xsZXIgYW5kIHZpZXcgdGVtcGxhdGVzIGZvciBhbnkgZGVmZXJyZWQgYWN0aW9uIGNhbiBzaWduaWZpY2FudGx5IHJlZHVjZSB0aGUgZmluZ2VycHJpbnQgb2YgeW91ciBhcHBsaWNhdGlvbi5cXG5cXG4gICAgVGhlIGBbYWN0aW9uc11gIGFyZ3VtZW50IGRldGVybWluZXMgd2hhdCBhY3Rpb25zIGdldCBkZWZlcnJlZCwgYW5kIHdoaWNoIGRvbid0LiBJdCBleHBlY3RzIGEgY29tbWEtc2VwYXJhdGVkIGxpc3Qgb2YgYWN0aW9ucywgd2hlcmUgeW91IGNhbiBwYXNzIGluIGVpdGhlciB0aGUgY29udHJvbGxlciBuYW1lLCBvciBib3RoIHRoZSBjb250cm9sbGVyIG5hbWUgYW5kIHRoZSBhY3Rpb24gbmFtZS4gVXNpbmcgYD9gIGFjdHMgYXMgYSB3aWxkY2FyZC5cXG5cXG4gICAgRm9yIGV4YW1wbGUsIHVzaW5nIGBhZG1pbmAgXyhlcXVpdmFsZW50IHRvIHVzaW5nIGBhZG1pbi8/YClfIHdpbGwgZGVmZXIgZXZlcnkgYWN0aW9uIHVuZGVyIHRoZSBgYWRtaW5gIGNvbnRyb2xsZXIuIFVzaW5nIGBhZG1pbi9udWtlYCB3aWxsIG9ubHkgZGVmZXIgdGhlIGBhZG1pbi9udWtlYCBhY3Rpb24uIElmIHlvdSBvbWl0IHRoZSBgW2FjdGlvbnNdYCBwYXJhbWV0ZXIgZW50aXJlbHksIHRoZSBkZWZhdWx0IHZhbHVlIG9mIGAnPydgIHdpbGwgYmUgdXNlZCBhbmQgZXZlcnl0aGluZyB3aWxsIGJlIGRlZmVycmVkLlxcblxcbiAgICBXaGVuIGNvbXBvbmVudHMgZ2V0IGRlZmVycmVkLCB0aGV5J2xsIGJlIGxvYWRlZCBhcyBzb29uIGFzIFRhdW51cyBkZXRlY3RzIHRoYXQgdGhleSdyZSBuZWVkZWQuIFRoaXMgY2FuIGhhcHBlbiBpbiBhIGZldyBwbGFjZXMuXFxuXFxuICAgIC0gVGhlIHVzZXIgbmF2aWdhdGVzIHRvIChvciBbX3ByZWZldGNoZXNfXSgjcHJlZmV0Y2hpbmcpKSB0aGUgYC9hZG1pbmAgcm91dGUsIGFuZCBgYWRtaW4vaW5kZXhgIHdhcyBkZWZlcnJlZCwgYW5kIGl0cyBjb21wb25lbnRzIGFyZW4ndCBjYWNoZWQgb24gdGhlIGNsaWVudC1zaWRlIHlldFxcbiAgICAtIEEgY29udHJvbGxlciB1c2VzIGB0YXVudXMucGFydGlhbGAgdG8gcmVuZGVyIGFuIGFjdGlvbiB0aGF0IHdhcyBkZWZlcnJlZCwgYW5kIGl0cyBjb21wb25lbnRzIGFyZW4ndCBjYWNoZWQgb24gdGhlIGNsaWVudC1zaWRlIHlldFxcbiAgICAtIFRoZSB1c2VyIG5hdmlnYXRlcyB0byB0aGUgYC9hZG1pbmAgcm91dGUsIGFuZCBpdHMgbWF0Y2hpbmcgYGFkbWluL2luZGV4YCByb3V0ZSB3YXNuJ3QgZGVmZXJyZWQsIGJ1dCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlciBkZWNpZGVzIHRvIGNoYW5nZSB0aGUgYWN0aW9uIHRvIGBhZG1pbi9zdXBlcmFkbWluYC4gV2hlbiB0aGUgcmVzcG9uc2UgZ2V0cyB0byB0aGUgY2xpZW50LCBpdCdsbCBuZWVkIHRvIGFzayB0aGUgc2VydmVyIGZvciB0aGUgYGFkbWluL3N1cGVyYWRtaW5gIHRlbXBsYXRlIGlmIHRoZSBjbGllbnQgZG9lc24ndCBhbHJlYWR5IGhhdmUgaXRcXG5cXG4gICAgWW91IGRvbid0IGhhdmUgdG8gd29ycnkgYWJvdXQgdGhvc2UgZGlmZmVyZW50IHNjZW5hcmlvcywgdGhvdWdoLCBhcyBUYXVudXMgaGFuZGxlcyB0aGVtIGFsbCBmb3IgeW91IHRyYW5zcGFyZW50bHkuIFlvdSBzaG91bGQgW2xlYXJuIG1vcmUgYWJvdXQgZGVmZXJyZWQgbG9hZGluZyBvbiB0aGUgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIGd1aWRlXSgvcGVyZm9ybWFuY2Ujc2VuZC12aWV3cy1hbmQtY29udHJvbGxlcnMtdG8tdGhlLWNsaWVudC1zZWxlY3RpdmVseSkuXFxuXFxuICAgIFRoZSBvbmx5IGNvbmNlcm4gd2l0aCBkZWZlcnJlZCBleGVjdXRpb24gaXMgdGhhdCBwYXJ0aWFsIHZpZXdzIG1heSBub3QgYmUgcmVuZGVyZWQgaW1tZWRpYXRlbHksIGFzIGEgcmVxdWVzdCBtYXkgYmUgbmVjZXNzYXJ5IHRvIGZldGNoIHRoZSBjb250cm9sbGVyIG9yIHRlbXBsYXRlIGZvciB0aGUgcGFydGlhbC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tcmVzb2x2ZXJzIDxtb2R1bGU+YFxcblxcbiAgICA8c3ViPnRoZSBgLXJgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBTaW1pbGFybHkgdG8gdGhlIFtgcmVzb2x2ZXJzYF0oIy1vcHRpb25zLXJlc29sdmVycy0pIG9wdGlvbiB0aGF0IHlvdSBjYW4gcGFzcyB0byBbYHRhdW51cy5tb3VudGBdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgdGhlc2UgcmVzb2x2ZXJzIGNhbiBjaGFuZ2UgdGhlIHdheSBpbiB3aGljaCBmaWxlIHBhdGhzIGFyZSByZXNvbHZlZC5cXG5cXG4gICAgU2lnbmF0dXJlICAgICAgICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBnZXRDbGllbnRDb250cm9sbGVyKGFjdGlvbilgIHwgUmV0dXJuIHBhdGggdG8gY2xpZW50LXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGVcXG4gICAgYGdldFZpZXcoYWN0aW9uKWAgICAgICAgICAgICAgfCBSZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS1idW5kbGVgXFxuXFxuICAgIDxzdWI+dGhlIGAtYmAgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIFVuZGVyIHRoaXMgZXhwZXJpbWVudGFsIGZsYWcsIHRoZSBDTEkgd2lsbCB1c2UgQnJvd3NlcmlmeSB0byBjb21waWxlIGEgc3RhbmRhbG9uZSBtb2R1bGUgdGhhdCBpbmNsdWRlcyB0aGUgd2lyaW5nIG5vcm1hbGx5IGV4cG9ydGVkIGJ5IHRoZSBDTEkgcGx1cyBhbGwgb2YgVGF1bnVzIFthcyBhIFVNRCBtb2R1bGVdWzEwXS5cXG5cXG4gICAgVGhpcyBhbGxvd3MgeW91IHRvIHVzZSBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIGV2ZW4gaWYgeW91IGRvbid0IHdhbnQgdG8gdXNlIFtCcm93c2VyaWZ5XVsxMV0gZGlyZWN0bHkuXFxuXFxuICAgIEZlZWRiYWNrIGFuZCBzdWdnZXN0aW9ucyBhYm91dCB0aGlzIGZsYWcsIF9hbmQgcG9zc2libGUgYWx0ZXJuYXRpdmVzIHRoYXQgd291bGQgbWFrZSBUYXVudXMgZWFzaWVyIHRvIHVzZV8sIGFyZSB3ZWxjb21lLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIENsaWVudC1zaWRlIEFQSVxcblxcbiAgICBKdXN0IGxpa2UgdGhlIHNlcnZlci1zaWRlLCBldmVyeXRoaW5nIGluIHRoZSBjbGllbnQtc2lkZSBiZWdpbnMgYXQgdGhlIG1vdW50cG9pbnQuIE9uY2UgdGhlIGFwcGxpY2F0aW9uIGlzIG1vdW50ZWQsIGFuY2hvciBsaW5rcyB3aWxsIGJlIGhpamFja2VkIGFuZCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIHdpbGwgdGFrZSBvdmVyIHZpZXcgcmVuZGVyaW5nLiBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhlY3V0ZWQgd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nLCBvcHRpb25zPylgXFxuXFxuICAgIFRoZSBtb3VudHBvaW50IHRha2VzIGEgcm9vdCBjb250YWluZXIsIHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgYW4gb3B0aW9ucyBwYXJhbWV0ZXIuIFRoZSBgY29udGFpbmVyYCBpcyB3aGVyZSBjbGllbnQtc2lkZS1yZW5kZXJlZCB2aWV3cyB3aWxsIGJlIHBsYWNlZCwgYnkgcmVwbGFjaW5nIHdoYXRldmVyIEhUTUwgY29udGVudHMgYWxyZWFkeSBleGlzdC4gWW91IGNhbiBwYXNzIGluIHRoZSBgd2lyaW5nYCBtb2R1bGUgZXhhY3RseSBhcyBidWlsdCBieSB0aGUgQ0xJLCBhbmQgbm8gZnVydGhlciBjb25maWd1cmF0aW9uIGlzIG5lY2Vzc2FyeS5cXG5cXG4gICAgV2hlbiB0aGUgbW91bnRwb2ludCBleGVjdXRlcywgVGF1bnVzIHdpbGwgY29uZmlndXJlIGl0cyBpbnRlcm5hbCBzdGF0ZSwgX3NldCB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXywgcnVuIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldywgYW5kIHN0YXJ0IGhpamFja2luZyBsaW5rcy5cXG5cXG4gICAgQXMgYW4gZXhhbXBsZSwgY29uc2lkZXIgYSBicm93c2VyIG1ha2VzIGEgYEdFVGAgcmVxdWVzdCBmb3IgYC9hcnRpY2xlcy90aGUtZm94YCBmb3IgdGhlIGZpcnN0IHRpbWUuIE9uY2UgYHRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZylgIGlzIGludm9rZWQgb24gdGhlIGNsaWVudC1zaWRlLCBzZXZlcmFsIHRoaW5ncyB3b3VsZCBoYXBwZW4gaW4gdGhlIG9yZGVyIGxpc3RlZCBiZWxvdy5cXG5cXG4gICAgLSBUYXVudXMgc2V0cyB1cCB0aGUgY2xpZW50LXNpZGUgdmlldyByb3V0aW5nIGVuZ2luZVxcbiAgICAtIElmIGVuYWJsZWQgXyh2aWEgYG9wdGlvbnNgKV8sIHRoZSBjYWNoaW5nIGVuZ2luZSBpcyBjb25maWd1cmVkXFxuICAgIC0gVGF1bnVzIG9idGFpbnMgdGhlIHZpZXcgbW9kZWwgXyhtb3JlIG9uIHRoaXMgbGF0ZXIpX1xcbiAgICAtIFdoZW4gYSB2aWV3IG1vZGVsIGlzIG9idGFpbmVkLCB0aGUgYCdzdGFydCdgIGV2ZW50IGlzIGVtaXR0ZWRcXG4gICAgLSBBbmNob3IgbGlua3Mgc3RhcnQgYmVpbmcgbW9uaXRvcmVkIGZvciBjbGlja3MgXyhhdCB0aGlzIHBvaW50IHlvdXIgYXBwbGljYXRpb24gYmVjb21lcyBhIFtTUEFdWzEzXSlfXFxuICAgIC0gVGhlIGBhcnRpY2xlcy9hcnRpY2xlYCBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGV4ZWN1dGVkXFxuXFxuICAgIFRoYXQncyBxdWl0ZSBhIGJpdCBvZiBmdW5jdGlvbmFsaXR5LCBidXQgaWYgeW91IHRoaW5rIGFib3V0IGl0LCBtb3N0IG90aGVyIGZyYW1ld29ya3MgYWxzbyByZW5kZXIgdGhlIHZpZXcgYXQgdGhpcyBwb2ludCwgX3JhdGhlciB0aGFuIG9uIHRoZSBzZXJ2ZXItc2lkZSFfXFxuXFxuICAgIEluIG9yZGVyIHRvIGJldHRlciB1bmRlcnN0YW5kIHRoZSBwcm9jZXNzLCBJJ2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIGBvcHRpb25zYCBwYXJhbWV0ZXIuXFxuXFxuICAgIEZpcnN0IG9mZiwgdGhlIGBib290c3RyYXBgIG9wdGlvbiBkZXRlcm1pbmVzIHRoZSBzdHJhdGVneSB1c2VkIHRvIHB1bGwgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZXJlIGFyZSB0aHJlZSBwb3NzaWJsZSBzdHJhdGVnaWVzIGF2YWlsYWJsZTogYGF1dG9gIF8odGhlIGRlZmF1bHQgc3RyYXRlZ3kpXywgYGlubGluZWAsIG9yIGBtYW51YWxgLiBUaGUgYGF1dG9gIHN0cmF0ZWd5IGludm9sdmVzIHRoZSBsZWFzdCB3b3JrLCB3aGljaCBpcyB3aHkgaXQncyB0aGUgZGVmYXVsdC5cXG5cXG4gICAgLSBgYXV0b2Agd2lsbCBtYWtlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWxcXG4gICAgLSBgaW5saW5lYCBleHBlY3RzIHlvdSB0byBwbGFjZSB0aGUgbW9kZWwgaW50byBhIGA8c2NyaXB0IHR5cGU9J3RleHQvdGF1bnVzJz5gIHRhZ1xcbiAgICAtIGBtYW51YWxgIGV4cGVjdHMgeW91IHRvIGdldCB0aGUgdmlldyBtb2RlbCBob3dldmVyIHlvdSB3YW50IHRvLCBhbmQgdGhlbiBsZXQgVGF1bnVzIGtub3cgd2hlbiBpdCdzIHJlYWR5XFxuXFxuICAgIExldCdzIGdvIGludG8gZGV0YWlsIGFib3V0IGVhY2ggb2YgdGhlc2Ugc3RyYXRlZ2llcy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgYGF1dG9gIHN0cmF0ZWd5XFxuXFxuICAgIFRoZSBgYXV0b2Agc3RyYXRlZ3kgbWVhbnMgdGhhdCBUYXVudXMgd2lsbCBtYWtlIHVzZSBvZiBhbiBBSkFYIHJlcXVlc3QgdG8gb2J0YWluIHRoZSB2aWV3IG1vZGVsLiBfWW91IGRvbid0IGhhdmUgdG8gZG8gYW55dGhpbmcgZWxzZV8gYW5kIHRoaXMgaXMgdGhlIGRlZmF1bHQgc3RyYXRlZ3kuIFRoaXMgaXMgdGhlICoqbW9zdCBjb252ZW5pZW50IHN0cmF0ZWd5LCBidXQgYWxzbyB0aGUgc2xvd2VzdCoqIG9uZS5cXG5cXG4gICAgSXQncyBzbG93IGJlY2F1c2UgdGhlIHZpZXcgbW9kZWwgd29uJ3QgYmUgcmVxdWVzdGVkIHVudGlsIHRoZSBidWxrIG9mIHlvdXIgSmF2YVNjcmlwdCBjb2RlIGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgZXhlY3V0ZWQsIGFuZCBgdGF1bnVzLm1vdW50YCBpcyBpbnZva2VkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBgaW5saW5lYCBzdHJhdGVneVxcblxcbiAgICBUaGUgYGlubGluZWAgc3RyYXRlZ3kgZXhwZWN0cyB5b3UgdG8gYWRkIGEgYGRhdGEtdGF1bnVzYCBhdHRyaWJ1dGUgb24gdGhlIGBjb250YWluZXJgIGVsZW1lbnQuIFRoaXMgYXR0cmlidXRlIG11c3QgYmUgZXF1YWwgdG8gdGhlIGBpZGAgYXR0cmlidXRlIG9mIGEgYDxzY3JpcHQ+YCB0YWcgY29udGFpbmluZyB0aGUgc2VyaWFsaXplZCB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmVyc2lvbiBpbmZvcm1hdGlvbiBhdXRvbWF0aWNhbGx5IGluamVjdGVkIGJ5IFRhdW51cyBpbnRvIHRoZSBsYXlvdXQgdGVtcGxhdGUgZGF0YS5cXG5cXG4gICAgYGBgamFkZVxcbiAgICBkaXYoZGF0YS10YXVudXM9J21vZGVsJykhPXBhcnRpYWxcXG4gICAgc2NyaXB0KHR5cGU9J3RleHQvdGF1bnVzJywgZGF0YS10YXVudXM9J21vZGVsJyk9SlNPTi5zdHJpbmdpZnkoeyB2ZXJzaW9uOiB2ZXJzaW9uLCBtb2RlbDogbW9kZWwgfSlcXG4gICAgYGBgXFxuXFxuICAgIFBheSBzcGVjaWFsIGF0dGVudGlvbiB0byB0aGUgZmFjdCB0aGF0IHRoZSBtb2RlbCBpcyBub3Qgb25seSBtYWRlIGludG8gYSBKU09OIHN0cmluZywgX2J1dCBhbHNvIEhUTUwgZW5jb2RlZCBieSBKYWRlXy4gV2hlbiBUYXVudXMgZXh0cmFjdHMgdGhlIG1vZGVsIGZyb20gdGhlIGA8c2NyaXB0PmAgdGFnIGl0J2xsIHVuZXNjYXBlIGl0LCBhbmQgdGhlbiBwYXJzZSBpdCBhcyBKU09OLlxcblxcbiAgICBUaGlzIHN0cmF0ZWd5IGlzIGFsc28gZmFpcmx5IGNvbnZlbmllbnQgdG8gc2V0IHVwLCBidXQgaXQgaW52b2x2ZXMgYSBsaXR0bGUgbW9yZSB3b3JrLiBJdCBtaWdodCBiZSB3b3J0aHdoaWxlIHRvIHVzZSBpbiBjYXNlcyB3aGVyZSBtb2RlbHMgYXJlIHNtYWxsLCBidXQgaXQgd2lsbCBzbG93IGRvd24gc2VydmVyLXNpZGUgdmlldyByZW5kZXJpbmcsIGFzIHRoZSBtb2RlbCBpcyBpbmxpbmVkIGFsb25nc2lkZSB0aGUgSFRNTC5cXG5cXG4gICAgVGhhdCBtZWFucyB0aGF0IHRoZSBjb250ZW50IHlvdSBhcmUgc3VwcG9zZWQgdG8gYmUgcHJpb3JpdGl6aW5nIGlzIGdvaW5nIHRvIHRha2UgbG9uZ2VyIHRvIGdldCB0byB5b3VyIGh1bWFucywgYnV0IG9uY2UgdGhleSBnZXQgdGhlIEhUTUwsIHRoaXMgc3RyYXRlZ3kgd2lsbCBleGVjdXRlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGFsbW9zdCBpbW1lZGlhdGVseS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgYG1hbnVhbGAgc3RyYXRlZ3lcXG5cXG4gICAgVGhlIGBtYW51YWxgIHN0cmF0ZWd5IGlzIHRoZSBtb3N0IGludm9sdmVkIG9mIHRoZSB0aHJlZSwgYnV0IGFsc28gdGhlIG1vc3QgcGVyZm9ybWFudC4gSW4gdGhpcyBzdHJhdGVneSB5b3UncmUgc3VwcG9zZWQgdG8gYWRkIHRoZSBmb2xsb3dpbmcgXyhzZWVtaW5nbHkgcG9pbnRsZXNzKV8gc25pcHBldCBvZiBjb2RlIGluIGEgYDxzY3JpcHQ+YCBvdGhlciB0aGFuIHRoZSBvbmUgdGhhdCdzIHB1bGxpbmcgZG93biBUYXVudXMsIHNvIHRoYXQgdGhleSBhcmUgcHVsbGVkIGNvbmN1cnJlbnRseSByYXRoZXIgdGhhbiBzZXJpYWxseS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB3aW5kb3cudGF1bnVzUmVhZHkgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9uY2UgeW91IHNvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgaW52b2tlIGB0YXVudXNSZWFkeShtb2RlbClgLiBDb25zaWRlcmluZyB5b3UnbGwgYmUgcHVsbGluZyBib3RoIHRoZSB2aWV3IG1vZGVsIGFuZCBUYXVudXMgYXQgdGhlIHNhbWUgdGltZSwgYSBudW1iZXIgb2YgZGlmZmVyZW50IHNjZW5hcmlvcyBtYXkgcGxheSBvdXQuXFxuXFxuICAgIC0gVGhlIHZpZXcgbW9kZWwgaXMgbG9hZGVkIGZpcnN0LCB5b3UgY2FsbCBgdGF1bnVzUmVhZHkobW9kZWwpYCBhbmQgd2FpdCBmb3IgVGF1bnVzIHRvIHRha2UgdGhlIG1vZGVsIG9iamVjdCBhbmQgYm9vdCB0aGUgYXBwbGljYXRpb24gYXMgc29vbiBhcyBgdGF1bnVzLm1vdW50YCBpcyBleGVjdXRlZFxcbiAgICAtIFRhdW51cyBsb2FkcyBmaXJzdCBhbmQgYHRhdW51cy5tb3VudGAgaXMgY2FsbGVkIGZpcnN0LiBJbiB0aGlzIGNhc2UsIFRhdW51cyB3aWxsIHJlcGxhY2UgYHdpbmRvdy50YXVudXNSZWFkeWAgd2l0aCBhIHNwZWNpYWwgYGJvb3RgIG1ldGhvZC4gV2hlbiB0aGUgdmlldyBtb2RlbCBmaW5pc2hlcyBsb2FkaW5nLCB5b3UgY2FsbCBgdGF1bnVzUmVhZHkobW9kZWwpYCBhbmQgdGhlIGFwcGxpY2F0aW9uIGZpbmlzaGVzIGJvb3RpbmdcXG5cXG4gICAgPiBJZiB0aGlzIHNvdW5kcyBhIGxpdHRsZSBtaW5kLWJlbmRpbmcgaXQncyBiZWNhdXNlIGl0IGlzLiBJdCdzIG5vdCBkZXNpZ25lZCB0byBiZSBwcmV0dHksIGJ1dCBtZXJlbHkgdG8gYmUgcGVyZm9ybWFudC5cXG5cXG4gICAgTm93IHRoYXQgd2UndmUgYWRkcmVzc2VkIHRoZSBhd2t3YXJkIGJpdHMsIGxldCdzIGNvdmVyIHRoZSBfXFxcInNvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWxcXFwiXyBhc3BlY3QuIE15IHByZWZlcnJlZCBtZXRob2QgaXMgdXNpbmcgSlNPTlAsIGFzIGl0J3MgYWJsZSB0byBkZWxpdmVyIHRoZSBzbWFsbGVzdCBzbmlwcGV0IHBvc3NpYmxlLCBhbmQgaXQgY2FuIHRha2UgYWR2YW50YWdlIG9mIHNlcnZlci1zaWRlIGNhY2hpbmcuIENvbnNpZGVyaW5nIHlvdSdsbCBwcm9iYWJseSB3YW50IHRoaXMgdG8gYmUgYW4gaW5saW5lIHNjcmlwdCwga2VlcGluZyBpdCBzbWFsbCBpcyBpbXBvcnRhbnQuXFxuXFxuICAgIFRoZSBnb29kIG5ld3MgaXMgdGhhdCB0aGUgc2VydmVyLXNpZGUgc3VwcG9ydHMgSlNPTlAgb3V0IHRoZSBib3guIEhlcmUncyBhIHNuaXBwZXQgb2YgY29kZSB5b3UgY291bGQgdXNlIHRvIHB1bGwgZG93biB0aGUgdmlldyBtb2RlbCBhbmQgYm9vdCBUYXVudXMgdXAgYXMgc29vbiBhcyBib3RoIG9wZXJhdGlvbnMgYXJlIHJlYWR5LlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIGZ1bmN0aW9uIGluamVjdCAodXJsKSB7XFxuICAgICAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xcbiAgICAgIHNjcmlwdC5zcmMgPSB1cmw7XFxuICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzY3JpcHQpO1xcbiAgICB9XFxuXFxuICAgIGZ1bmN0aW9uIGluamVjdG9yICgpIHtcXG4gICAgICB2YXIgc2VhcmNoID0gbG9jYXRpb24uc2VhcmNoO1xcbiAgICAgIHZhciBzZWFyY2hRdWVyeSA9IHNlYXJjaCA/ICcmJyArIHNlYXJjaC5zdWJzdHIoMSkgOiAnJztcXG4gICAgICB2YXIgc2VhcmNoSnNvbiA9ICc/anNvbiZjYWxsYmFjaz10YXVudXNSZWFkeScgKyBzZWFyY2hRdWVyeTtcXG4gICAgICBpbmplY3QobG9jYXRpb24ucGF0aG5hbWUgKyBzZWFyY2hKc29uKTtcXG4gICAgfVxcblxcbiAgICB3aW5kb3cudGF1bnVzUmVhZHkgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG4gICAgfTtcXG5cXG4gICAgaW5qZWN0b3IoKTtcXG4gICAgYGBgXFxuXFxuICAgIEFzIG1lbnRpb25lZCBlYXJsaWVyLCB0aGlzIGFwcHJvYWNoIGludm9sdmVzIGdldHRpbmcgeW91ciBoYW5kcyBkaXJ0aWVyIGJ1dCBpdCBwYXlzIG9mZiBieSBiZWluZyB0aGUgZmFzdGVzdCBvZiB0aGUgdGhyZWUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ2FjaGluZ1xcblxcbiAgICBUaGUgY2xpZW50LXNpZGUgaW4gVGF1bnVzIHN1cHBvcnRzIGNhY2hpbmcgaW4tbWVtb3J5IGFuZCB1c2luZyB0aGUgZW1iZWRkZWQgSW5kZXhlZERCIHN5c3RlbSBieSBtZXJlbHkgdHVybmluZyBvbiB0aGUgYGNhY2hlYCBmbGFnIGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBvbiB0aGUgY2xpZW50LXNpZGUuXFxuXFxuICAgIElmIHlvdSBzZXQgYGNhY2hlYCB0byBgdHJ1ZWAgdGhlbiBjYWNoZWQgaXRlbXMgd2lsbCBiZSBjb25zaWRlcmVkIF9cXFwiZnJlc2hcXFwiICh2YWxpZCBjb3BpZXMgb2YgdGhlIG9yaWdpbmFsKV8gZm9yICoqMTUgc2Vjb25kcyoqLiBZb3UgY2FuIGFsc28gc2V0IGBjYWNoZWAgdG8gYSBudW1iZXIsIGFuZCB0aGF0IG51bWJlciBvZiBzZWNvbmRzIHdpbGwgYmUgdXNlZCBhcyB0aGUgZGVmYXVsdCBpbnN0ZWFkLlxcblxcbiAgICBDYWNoaW5nIGNhbiBhbHNvIGJlIHR3ZWFrZWQgb24gaW5kaXZpZHVhbCByb3V0ZXMuIEZvciBpbnN0YW5jZSwgeW91IGNvdWxkIHNldCBgeyBjYWNoZTogdHJ1ZSB9YCB3aGVuIG1vdW50aW5nIFRhdW51cyBhbmQgdGhlbiBoYXZlIGB7IGNhY2hlOiAzNjAwIH1gIG9uIGEgcm91dGUgdGhhdCB5b3Ugd2FudCB0byBjYWNoZSBmb3IgYSBsb25nZXIgcGVyaW9kIG9mIHRpbWUuXFxuXFxuICAgIFRoZSBjYWNoaW5nIGxheWVyIGlzIF9zZWFtbGVzc2x5IGludGVncmF0ZWRfIGludG8gVGF1bnVzLCBtZWFuaW5nIHRoYXQgYW55IHZpZXdzIHJlbmRlcmVkIGJ5IFRhdW51cyB3aWxsIGJlIGNhY2hlZCBhY2NvcmRpbmcgdG8gdGhlc2UgY2FjaGluZyBydWxlcy4gS2VlcCBpbiBtaW5kLCBob3dldmVyLCB0aGF0IHBlcnNpc3RlbmNlIGF0IHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGxheWVyIHdpbGwgb25seSBiZSBwb3NzaWJsZSBpbiBbYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEluZGV4ZWREQl1bMTRdLiBJbiB0aGUgY2FzZSBvZiBicm93c2VycyB0aGF0IGRvbid0IHN1cHBvcnQgSW5kZXhlZERCLCBUYXVudXMgd2lsbCB1c2UgYW4gaW4tbWVtb3J5IGNhY2hlLCB3aGljaCB3aWxsIGJlIHdpcGVkIG91dCB3aGVuZXZlciB0aGUgaHVtYW4gZGVjaWRlcyB0byBjbG9zZSB0aGUgdGFiIGluIHRoZWlyIGJyb3dzZXIuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgUHJlZmV0Y2hpbmdcXG5cXG4gICAgSWYgY2FjaGluZyBpcyBlbmFibGVkLCB0aGUgbmV4dCBsb2dpY2FsIHN0ZXAgaXMgcHJlZmV0Y2hpbmcuIFRoaXMgaXMgZW5hYmxlZCBqdXN0IGJ5IGFkZGluZyBgcHJlZmV0Y2g6IHRydWVgIHRvIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YC4gVGhlIHByZWZldGNoaW5nIGZlYXR1cmUgd2lsbCBmaXJlIGZvciBhbnkgYW5jaG9yIGxpbmsgdGhhdCdzIHRyaXBzIG92ZXIgYSBgbW91c2VvdmVyYCBvciBhIGB0b3VjaHN0YXJ0YCBldmVudC4gSWYgYSByb3V0ZSBtYXRjaGVzIHRoZSBVUkwgaW4gdGhlIGBocmVmYCwgYW4gQUpBWCByZXF1ZXN0IHdpbGwgcHJlZmV0Y2ggdGhlIHZpZXcgYW5kIGNhY2hlIGl0cyBjb250ZW50cywgaW1wcm92aW5nIHBlcmNlaXZlZCBwZXJmb3JtYW5jZS5cXG5cXG4gICAgV2hlbiBsaW5rcyBhcmUgY2xpY2tlZCBiZWZvcmUgcHJlZmV0Y2hpbmcgZmluaXNoZXMsIHRoZXknbGwgd2FpdCBvbiB0aGUgcHJlZmV0Y2hlciB0byBmaW5pc2ggYmVmb3JlIGltbWVkaWF0ZWx5IHN3aXRjaGluZyB0byB0aGUgdmlldywgZWZmZWN0aXZlbHkgY3V0dGluZyBkb3duIHRoZSByZXNwb25zZSB0aW1lLiBJZiB0aGUgbGluayB3YXMgYWxyZWFkeSBwcmVmZXRjaGVkIG9yIG90aGVyd2lzZSBjYWNoZWQsIHRoZSB2aWV3IHdpbGwgYmUgbG9hZGVkIGltbWVkaWF0ZWx5LiBJZiB0aGUgaHVtYW4gaG92ZXJzIG92ZXIgYSBsaW5rIGFuZCBhbm90aGVyIG9uZSB3YXMgYWxyZWFkeSBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoYXQgb25lIGlzIGFib3J0ZWQuIFRoaXMgcHJldmVudHMgcHJlZmV0Y2hpbmcgZnJvbSBkcmFpbmluZyB0aGUgYmFuZHdpZHRoIG9uIGNsaWVudHMgd2l0aCBsaW1pdGVkIG9yIGludGVybWl0dGVudCBjb25uZWN0aXZpdHkuXFxuXFxuICAgICMjIyMgVmVyc2lvbmluZ1xcblxcbiAgICBXaGVuIGVuYWJsZWQsIHZlcnNpb25pbmcgd2lsbCBsb29rIG91dCBmb3IgZGlzY3JlcGFuY2llcyBiZXR3ZWVuIHdoYXQncyBjdXJyZW50bHkgb24gdGhlIGNsaWVudCBhbmQgd2hhdCdzIG9uIHRoZSBzZXJ2ZXIsIGFuZCByZWxvYWQgZXZlcnl0aGluZyBuZWNlc3NhcnkgdG8gbWFrZSB3aGF0J3Mgb24gdGhlIGNsaWVudCBtYXRjaCB3aGF0J3Mgb24gdGhlIHNlcnZlci5cXG5cXG4gICAgSW4gb3JkZXIgdG8gdHVybiBpdCBvbiwgc2V0IHRoZSBgdmVyc2lvbmAgZmllbGQgaW4gdGhlIG9wdGlvbnMgd2hlbiBpbnZva2luZyBgdGF1bnVzLm1vdW50YCAqKm9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUsIHVzaW5nIHRoZSBzYW1lIHZhbHVlKiouIFRoZSBUYXVudXMgdmVyc2lvbiBzdHJpbmcgd2lsbCBiZSBhZGRlZCB0byB0aGUgb25lIHlvdSBwcm92aWRlZCwgc28gdGhhdCBUYXVudXMgd2lsbCBrbm93IHRvIHN0YXkgYWxlcnQgZm9yIGNoYW5nZXMgdG8gVGF1bnVzIGl0c2VsZiwgYXMgd2VsbC5cXG5cXG4gICAgPiBUbyBtYWtlIHN1cmUgeW91IGRvbid0IGZvcmdldCB0byBjaGFuZ2UgdGhlIHZlcnNpb24gc3RyaW5nIGluIG9uZSBvZiB0aGUgbW91bnRwb2ludHMsIHBsZWFzZSBjcmVhdGUgYSBKU09OIGZpbGUgd2l0aCBqdXN0IHRoZSB2ZXJzaW9uIHN0cmluZyBhbmQgYHJlcXVpcmVgIHRoYXQgZmlsZSBpbiBib3RoIHNpZGVzLlxcbiAgICA+XFxuICAgID4gYGBgc2hlbGxcXG4gICAgPiBlY2hvICdcXFwiMS4wLjBcXFwiJyA+IHZlcnNpb24uanNvblxcbiAgICA+IGBgYFxcblxcbiAgICBUaGUgZGVmYXVsdCB2ZXJzaW9uIHN0cmluZyBpcyBzZXQgdG8gYDFgLiBUaGUgVGF1bnVzIHZlcnNpb24gd2lsbCBiZSBwcmVwZW5kZWQgdG8geW91cnMsIHJlc3VsdGluZyBpbiBhIHZhbHVlIHN1Y2ggYXMgYHQzLjAuMDt2MWAgd2hlcmUgVGF1bnVzIGlzIHJ1bm5pbmcgdmVyc2lvbiBgMy4wLjBgIGFuZCB5b3VyIGFwcGxpY2F0aW9uIGlzIHJ1bm5pbmcgdmVyc2lvbiBgMWAuXFxuXFxuICAgIFJlZmVyIHRvIHRoZSBHZXR0aW5nIFN0YXJ0ZWQgZ3VpZGUgZm9yIGEgbW9yZSBkZXRhaWxlZCBbYW5hbHlzaXMgb2YgdGhlIHVzZXMgZm9yIHZlcnNpb25pbmddWzE1XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5vbih0eXBlLCBmbilgXFxuXFxuICAgIFRhdW51cyBlbWl0cyBhIHNlcmllcyBvZiBldmVudHMgZHVyaW5nIGl0cyBsaWZlY3ljbGUsIGFuZCBgdGF1bnVzLm9uYCBpcyB0aGUgd2F5IHlvdSBjYW4gdHVuZSBpbiBhbmQgbGlzdGVuIGZvciB0aGVzZSBldmVudHMgdXNpbmcgYSBzdWJzY3JpcHRpb24gZnVuY3Rpb24gYGZuYC5cXG5cXG4gICAgRXZlbnQgICAgICAgICAgICB8IEFyZ3VtZW50cyAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYCdzdGFydCdgICAgICAgICB8IGBjb250YWluZXIsIG1vZGVsLCByb3V0ZWAgICAgICB8IEVtaXR0ZWQgd2hlbiBgdGF1bnVzLm1vdW50YCBmaW5pc2hlZCB0aGUgcm91dGUgc2V0dXAgYW5kIGlzIGFib3V0IHRvIGludm9rZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlci4gU3Vic2NyaWJlIHRvIHRoaXMgZXZlbnQgYmVmb3JlIGNhbGxpbmcgYHRhdW51cy5tb3VudGAuXFxuICAgIGAncmVuZGVyJ2AgICAgICAgfCBgY29udGFpbmVyLCBtb2RlbCwgcm91dGVgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2NoYW5nZSdgICAgICAgIHwgYHJvdXRlLCBtb2RlbGAgICAgICAgICAgfCBTYW1lIGFzIGAncmVuZGVyJ2AsIGJ1dCBvbmx5IGlmIGBjb250YWluZXJgIGlzIHRoZSBtb3VudHBvaW50IGFuZCB0aGUgcm91dGUgaGFzIGNoYW5nZWQuXFxuICAgIGAnZmV0Y2guc3RhcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLlxcbiAgICBgJ2ZldGNoLmRvbmUnYCAgIHwgIGByb3V0ZSwgY29udGV4dCwgZGF0YWAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5LlxcbiAgICBgJ2ZldGNoLmFib3J0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGlzIHB1cnBvc2VseSBhYm9ydGVkLlxcbiAgICBgJ2ZldGNoLmVycm9yJ2AgIHwgIGByb3V0ZSwgY29udGV4dCwgZXJyYCAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci5cXG5cXG4gICAgQ29uc2lkZXIgZm9yIGluc3RhbmNlIHRoYXQgeW91J2QgbGlrZSB0byBrZWVwIHRyYWNrIG9mIGV2ZXJ5IHZpZXcgdGhhdCBnZXRzIHJlbmRlcmVkLCBhbmQgd2hhdCBET00gZWxlbWVudCBpdCBnZXRzIHBsYWNlZCBpbnRvLiBUaGUgcGllY2Ugb2YgY29kZSBiZWxvdyB3b3VsZCBxdWlja2x5IGRvIHRoYXQgZm9yIHVzLlxcblxcbiAgICBgYGBqc1xcbiAgICB0YXVudXMub24oJ3JlbmRlcicsIGZ1bmN0aW9uIChjb250YWluZXIpIHtcXG4gICAgICBjb25zb2xlLmxvZygnUmVuZGVyZWQgYSB2aWV3IG9uJywgY29udGFpbmVyKTtcXG4gICAgfSk7XFxuICAgIGBgYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm9uY2UodHlwZSwgZm4pYFxcblxcbiAgICBUaGlzIG1ldGhvZCBpcyBlcXVpdmFsZW50IHRvIFtgdGF1bnVzLm9uYF0oIy10YXVudXMtb24tdHlwZS1mbi0pLCBleGNlcHQgdGhlIGV2ZW50IGxpc3RlbmVycyB3aWxsIGJlIHVzZWQgb25jZSBhbmQgdGhlbiBpdCdsbCBiZSBkaXNjYXJkZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub2ZmKHR5cGUsIGZuKWBcXG5cXG4gICAgVXNpbmcgdGhpcyBtZXRob2QgeW91IGNhbiByZW1vdmUgYW55IGV2ZW50IGxpc3RlbmVycyB0aGF0IHdlcmUgcHJldmlvdXNseSBhZGRlZCB1c2luZyBgLm9uYCBvciBgLm9uY2VgLiBZb3UgbXVzdCBwcm92aWRlIHRoZSB0eXBlIG9mIGV2ZW50IHlvdSB3YW50IHRvIHJlbW92ZSBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGZ1bmN0aW9uIHRoYXQgd2FzIG9yaWdpbmFsbHkgdXNlZCB3aGVuIGNhbGxpbmcgYC5vbmAgb3IgYC5vbmNlYC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5pbnRlcmNlcHQoYWN0aW9uPywgZm4pYFxcblxcbiAgICBUaGlzIG1ldGhvZCBjYW4gYmUgdXNlZCB0byBhbnRpY2lwYXRlIG1vZGVsIHJlcXVlc3RzLCBiZWZvcmUgdGhleSBldmVyIG1ha2UgaXQgaW50byBYSFIgcmVxdWVzdHMuIFlvdSBjYW4gYWRkIGludGVyY2VwdG9ycyBmb3Igc3BlY2lmaWMgYWN0aW9ucywgd2hpY2ggd291bGQgYmUgdHJpZ2dlcmVkIG9ubHkgaWYgdGhlIHJlcXVlc3QgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIGBhY3Rpb25gLiBZb3UgY2FuIGFsc28gYWRkIGdsb2JhbCBpbnRlcmNlcHRvcnMgYnkgb21pdHRpbmcgdGhlIGBhY3Rpb25gIHBhcmFtZXRlciwgb3Igc2V0dGluZyBpdCB0byBgKmAuXFxuXFxuICAgIEFuIGludGVyY2VwdG9yIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBhbiBgZXZlbnRgIHBhcmFtZXRlciwgY29udGFpbmluZyBhIGZldyBkaWZmZXJlbnQgcHJvcGVydGllcy5cXG5cXG4gICAgLSBgdXJsYCBjb250YWlucyB0aGUgVVJMIHRoYXQgbmVlZHMgYSB2aWV3IG1vZGVsXFxuICAgIC0gYHJvdXRlYCBjb250YWlucyB0aGUgZnVsbCByb3V0ZSBvYmplY3QgYXMgeW91J2QgZ2V0IGZyb20gW2B0YXVudXMucm91dGUodXJsKWBdKCMtdGF1bnVzLXJvdXRlLXVybC0pXFxuICAgIC0gYHBhcnRzYCBpcyBqdXN0IGEgc2hvcnRjdXQgZm9yIGByb3V0ZS5wYXJ0c2BcXG4gICAgLSBgcHJldmVudERlZmF1bHQobW9kZWwpYCBhbGxvd3MgeW91IHRvIHN1cHByZXNzIHRoZSBuZWVkIGZvciBhbiBBSkFYIHJlcXVlc3QsIGNvbW1hbmRpbmcgVGF1bnVzIHRvIHVzZSB0aGUgbW9kZWwgeW91J3ZlIHByb3ZpZGVkIGluc3RlYWRcXG4gICAgLSBgZGVmYXVsdFByZXZlbnRlZGAgdGVsbHMgeW91IGlmIHNvbWUgb3RoZXIgaGFuZGxlciBoYXMgcHJldmVudGVkIHRoZSBkZWZhdWx0IGJlaGF2aW9yXFxuICAgIC0gYGNhblByZXZlbnREZWZhdWx0YCB0ZWxscyB5b3UgaWYgaW52b2tpbmcgYGV2ZW50LnByZXZlbnREZWZhdWx0YCB3aWxsIGhhdmUgYW55IGVmZmVjdFxcbiAgICAtIGBtb2RlbGAgc3RhcnRzIGFzIGBudWxsYCwgYW5kIGl0IGNhbiBsYXRlciBiZWNvbWUgdGhlIG1vZGVsIHBhc3NlZCB0byBgcHJldmVudERlZmF1bHRgXFxuXFxuICAgIEludGVyY2VwdG9ycyBhcmUgYXN5bmNocm9ub3VzLCBidXQgaWYgYW4gaW50ZXJjZXB0b3Igc3BlbmRzIGxvbmdlciB0aGFuIDUwbXMgaXQnbGwgYmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBjYWxsaW5nIGBldmVudC5wcmV2ZW50RGVmYXVsdGAgcGFzdCB0aGF0IHBvaW50IHdvbid0IGhhdmUgYW55IGVmZmVjdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5wYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbClgXFxuXFxuICAgIFRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSBgYWN0aW9uYCB2aWV3IGludG8gdGhlIGBjb250YWluZXJgIERPTSBlbGVtZW50LCB1c2luZyB0aGUgc3BlY2lmaWVkIGBtb2RlbGAuIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSBgcmVuZGVyYCBldmVudCB3aWxsIGJlIGZpcmVkIF8od2l0aCBgY29udGFpbmVyLCBtb2RlbGAgYXMgYXJndW1lbnRzKV8gYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGF0IHZpZXcgd2lsbCBiZSBleGVjdXRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYFxcblxcbiAgICBXaGVuZXZlciB5b3Ugd2FudCB0byBuYXZpZ2F0ZSB0byBhIFVSTCwgc2F5IHdoZW4gYW4gQUpBWCBjYWxsIGZpbmlzaGVzIGFmdGVyIGEgYnV0dG9uIGNsaWNrLCB5b3UgY2FuIHVzZSBgdGF1bnVzLm5hdmlnYXRlYCBwYXNzaW5nIGl0IGEgcGxhaW4gVVJMIG9yIGFueXRoaW5nIHRoYXQgd291bGQgY2F1c2UgYHRhdW51cy5yb3V0ZSh1cmwpYCB0byByZXR1cm4gYSB2YWxpZCByb3V0ZS5cXG5cXG4gICAgQnkgZGVmYXVsdCwgaWYgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYCBpcyBjYWxsZWQgd2l0aCBhbiBgdXJsYCB0aGF0IGRvZXNuJ3QgbWF0Y2ggYW55IGNsaWVudC1zaWRlIHJvdXRlLCB0aGVuIHRoZSB1c2VyIHdpbGwgYmUgcmVkaXJlY3RlZCB2aWEgYGxvY2F0aW9uLmhyZWZgLiBJbiBjYXNlcyB3aGVyZSB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBvcnQgdGhlIGhpc3RvcnkgQVBJLCBgbG9jYXRpb24uaHJlZmAgd2lsbCBiZSB1c2VkIGFzIHdlbGwuXFxuXFxuICAgIFRoZXJlJ3MgYSBmZXcgb3B0aW9ucyB5b3UgY2FuIHVzZSB0byB0d2VhayB0aGUgYmVoYXZpb3Igb2YgYHRhdW51cy5uYXZpZ2F0ZWAuXFxuXFxuICAgIE9wdGlvbiAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBjb250ZXh0YCAgICAgICAgfCBBIERPTSBlbGVtZW50IHRoYXQgY2F1c2VkIHRoZSBuYXZpZ2F0aW9uIGV2ZW50LCB1c2VkIHdoZW4gZW1pdHRpbmcgZXZlbnRzXFxuICAgIGBzdHJpY3RgICAgICAgICAgfCBJZiBzZXQgdG8gYHRydWVgIGFuZCB0aGUgVVJMIGRvZXNuJ3QgbWF0Y2ggYW55IHJvdXRlLCB0aGVuIHRoZSBuYXZpZ2F0aW9uIGF0dGVtcHQgbXVzdCBiZSBpZ25vcmVkXFxuICAgIGBzY3JvbGxgICAgICAgICAgfCBXaGVuIHRoaXMgaXMgc2V0IHRvIGBmYWxzZWAsIGVsZW1lbnRzIGFyZW4ndCBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXIgbmF2aWdhdGlvblxcbiAgICBgZm9yY2VgICAgICAgICAgIHwgVW5sZXNzIHRoaXMgaXMgc2V0IHRvIGB0cnVlYCwgbmF2aWdhdGlvbiB3b24ndCBfZmV0Y2ggYSBtb2RlbF8gaWYgdGhlIHJvdXRlIG1hdGNoZXMgdGhlIGN1cnJlbnQgcm91dGUsIGFuZCBgc3RhdGUubW9kZWxgIHdpbGwgYmUgcmV1c2VkIGluc3RlYWRcXG4gICAgYHJlcGxhY2VTdGF0ZWAgICB8IFVzZSBgcmVwbGFjZVN0YXRlYCBpbnN0ZWFkIG9mIGBwdXNoU3RhdGVgIHdoZW4gY2hhbmdpbmcgaGlzdG9yeVxcblxcbiAgICBOb3RlIHRoYXQgdGhlIG5vdGlvbiBvZiBfZmV0Y2hpbmcgYSBtb2RlbF8gbWlnaHQgYmUgZGVjZWl2aW5nIGFzIHRoZSBtb2RlbCBjb3VsZCBiZSBwdWxsZWQgZnJvbSB0aGUgY2FjaGUgZXZlbiBpZiBgZm9yY2VgIGlzIHNldCB0byBgdHJ1ZWAuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucm91dGUodXJsKWBcXG5cXG4gICAgVGhpcyBjb252ZW5pZW5jZSBtZXRob2QgYWxsb3dzIHlvdSB0byBicmVhayBkb3duIGEgVVJMIGludG8gaXRzIGluZGl2aWR1YWwgY29tcG9uZW50cy4gVGhlIG1ldGhvZCBhY2NlcHRzIGFueSBvZiB0aGUgZm9sbG93aW5nIHBhdHRlcm5zLCBhbmQgaXQgcmV0dXJucyBhIFRhdW51cyByb3V0ZSBvYmplY3QuXFxuXFxuICAgIC0gQSBmdWxseSBxdWFsaWZpZWQgVVJMIG9uIHRoZSBzYW1lIG9yaWdpbiwgZS5nIGBodHRwOi8vdGF1bnVzLmJldmFjcXVhLmlvL2FwaWBcXG4gICAgLSBBbiBhYnNvbHV0ZSBVUkwgd2l0aG91dCBhbiBvcmlnaW4sIGUuZyBgL2FwaWBcXG4gICAgLSBKdXN0IGEgaGFzaCwgZS5nIGAjZm9vYCBfKGBsb2NhdGlvbi5ocmVmYCBpcyB1c2VkKV9cXG4gICAgLSBGYWxzeSB2YWx1ZXMsIGUuZyBgbnVsbGAgXyhgbG9jYXRpb24uaHJlZmAgaXMgdXNlZClfXFxuXFxuICAgIFJlbGF0aXZlIFVSTHMgYXJlIG5vdCBzdXBwb3J0ZWQgXyhhbnl0aGluZyB0aGF0IGRvZXNuJ3QgaGF2ZSBhIGxlYWRpbmcgc2xhc2gpXywgZS5nIGBmaWxlcy9kYXRhLmpzb25gLiBBbnl0aGluZyB0aGF0J3Mgbm90IG9uIHRoZSBzYW1lIG9yaWdpbiBvciBkb2Vzbid0IG1hdGNoIG9uZSBvZiB0aGUgcmVnaXN0ZXJlZCByb3V0ZXMgaXMgZ29pbmcgdG8geWllbGQgYG51bGxgLlxcblxcbiAgICBfVGhpcyBtZXRob2QgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLCBhcyBpdCBnaXZlcyB5b3UgZGlyZWN0IGFjY2VzcyB0byB0aGUgcm91dGVyIHVzZWQgaW50ZXJuYWxseSBieSBUYXVudXMuX1xcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIGB0YXVudXMucm91dGUuZXF1YWxzKHJvdXRlLCByb3V0ZSlgXFxuXFxuICAgIENvbXBhcmVzIHR3byByb3V0ZXMgYW5kIHJldHVybnMgYHRydWVgIGlmIHRoZXkgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwuIE5vdGUgdGhhdCBkaWZmZXJlbnQgVVJMcyBtYXkgc3RpbGwgcmV0dXJuIGB0cnVlYC4gRm9yIGluc3RhbmNlLCBgL2Zvb2AgYW5kIGAvZm9vI2JhcmAgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwgZXZlbiBpZiB0aGV5J3JlIGRpZmZlcmVudCBVUkxzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnN0YXRlYFxcblxcbiAgICBUaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi5cXG5cXG4gICAgLSBgY29udGFpbmVyYCBpcyB0aGUgRE9NIGVsZW1lbnQgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgXFxuICAgIC0gYGNvbnRyb2xsZXJzYCBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGB0ZW1wbGF0ZXNgIGFyZSBhbGwgdGhlIHRlbXBsYXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZXNgIGFyZSBhbGwgdGhlIHJvdXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZWAgaXMgYSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgcm91dGVcXG4gICAgLSBgbW9kZWxgIGlzIGEgcmVmZXJlbmNlIHRvIHRoZSBtb2RlbCB1c2VkIHRvIHJlbmRlciB0aGUgY3VycmVudCB2aWV3XFxuICAgIC0gYHByZWZldGNoYCBleHBvc2VzIHdoZXRoZXIgcHJlZmV0Y2hpbmcgaXMgdHVybmVkIG9uXFxuICAgIC0gYGNhY2hlYCBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkXFxuICAgIC0gYHZlcnNpb25gIGV4cG9zZXMgdGhlIHZlcnNpb24gc3RyaW5nIHRoYXQncyBjdXJyZW50bHkgaW4gdXNlXFxuXFxuICAgIFRoZXJlJ3MgYWxzbyBhIGBjbGVhcmAgbWV0aG9kIGFjY2Vzc2libGUgdGhyb3VnaCBgdGF1bnVzLnN0YXRlLmNsZWFyYCwgd2hpY2ggd2lsbCBlbXB0eSB0aGUgY2FjaGUsIGFzIHdlbGwgYXMgcmVtb3ZlIGZyb20gdGhlIGBzdGF0ZWAgYW55IGNvbnRyb2xsZXJzIGFuZCB0ZW1wbGF0ZXMgdGhhdCB3ZXJlIGxhenkgbG9hZGVkLlxcblxcbiAgICBPZiBjb3Vyc2UsIHlvdSdyZSBub3Qgc3VwcG9zZWQgdG8gbWVkZGxlIHdpdGggaXQsIHNvIGJlIGEgZ29vZCBjaXRpemVuIGFuZCBqdXN0IGluc3BlY3QgaXRzIHZhbHVlcyFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy54aHIodXJsLCBvcHRpb25zPywgZG9uZSlgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGFsbG93cyB5b3UgdG8gaXNzdWUgeW91ciBvd24gQUpBWCByZXF1ZXN0cyB0aHJvdWdoIHRoZSBgeGhyYCBtb2R1bGUuIEl0IHNldHMgYSBmZXcgY29udmVuaWVudCBkZWZhdWx0cywgX2xpc3RlZCBiZWxvd18sIHdoZXJlIGB1cmxgIHJlZmVycyB0byB0aGUgVVJMIHBhc3NlZCBhcyB0aGUgZmlyc3QgcGFyYW1ldGVyLlxcblxcbiAgICBgYGBqc1xcbiAgICB7XFxuICAgICAgdXJsOiB1cmwsXFxuICAgICAganNvbjogdHJ1ZSxcXG4gICAgICBoZWFkZXJzOiB7IEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nIH1cXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgVGhlIGBkb25lKGVyciwgYm9keSwgcmVzKWAgY2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gdGhlIHJlcXVlc3QgZmluaXNoZXMsIGFuZCBpdCdsbCBiZSBwYXNzZWQgdGhyZWUgcGFyYW1ldGVycywgYW4gb3B0aW9uYWwgZXJyb3IgaWYgc29tZXRoaW5nIHdlbnQgd3JvbmcgXyhyZXF1ZXN0IGZhaWxlZCwgd2FzIGFib3J0ZWQsIGV0Yy4pXyBhbmQgYSBgYm9keWAgcGFyYW1ldGVyIGNvbnRhaW5pbmcgdGhlIHJlc3BvbnNlIGJvZHkuIFRoZSByYXcgYHJlc2Agb2JqZWN0IHRoYXQncyB0eXBpY2FsbHkgcHJvdmlkZWQgYnkgW2B4aHJgXVsxNl0gYXMgdGhlIHNlY29uZCBwYXJhbWV0ZXIgaXMgcHJvdmlkZWQgYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBpbnN0ZWFkLlxcblxcbiAgICBBcyBhbiBleGFtcGxlLCBoZXJlIGlzIGEgYEdFVGAgcmVxdWVzdC5cXG5cXG4gICAgYGBganNcXG4gICAgdGF1bnVzLnhocignL2FwaS9wbGFjZXMnLCBmdW5jdGlvbiAoZXJyLCBib2R5KSB7XFxuICAgICAgY29uc29sZS5sb2coYm9keSk7XFxuICAgICAgLy8gPC0geyBwbGFjZXM6IFsndW5kZXJ3YXRlciBmb3J0cmVzcycsICdpc2xhbmQgbWFuc2lvbiddIH1cXG4gICAgfSk7XFxuICAgIGBgYFxcblxcbiAgICBBbHdheXMgcmVtZW1iZXIgdG8gaGFuZGxlIHRoZSBjYXNlIHdoZXJlIGBlcnJgIGlzIHNldCFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgRGVidWdnaW5nIFRhdW51c1xcblxcbiAgICBPbiB0aGUgY2xpZW50LXNpZGUsIHlvdSB3aWxsIHR5cGljYWxseSBgcmVxdWlyZWAgVGF1bnVzIHVzaW5nIHRoZSBzdGF0ZW1lbnQgYmVsb3cuXFxuXFxuICAgIGBgYGpzXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgYGBgXFxuXFxuICAgIEhvd2V2ZXIsIHlvdSBjb3VsZCBhbHNvIHR1cm4gb24gdGhlIGludGVybmFsIGRlYnVnIGxvZ2dlciBzaW1wbHkgYnkgdXNpbmcgYW5vdGhlciBlbnRyeSBwb2ludCFcXG5cXG4gICAgYGBganNcXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cy9icm93c2VyL2RlYnVnJyk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgc2NyZWVuc2hvdCBiZWxvdyBjb250YWlucyBhbiBleGFtcGxlIG9mIHRoaXMgbWVjaGFuaXNtLCB3aGVyZSB1c2luZyBbYHRhdW51cy5wYXJ0aWFsYF0oIy10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLSkgdHJpZ2dlcnMgYSBmbHVycnkgb2YgZGVidWcgbWVzc2FnZXMuXFxuXFxuICAgICFbZGVidWcucG5nXVsxN11cXG5cXG4gICAgVGhpcyBpcyBwYXJ0aWN1bGFybHkgaGVscGZ1bCBkdXJpbmcgZGV2ZWxvcG1lbnQsIGJ1dCBhbHNvIHVzZWZ1bCBpZiB5b3UgZG9uJ3QgdW5kZXJzdGFuZCBleGFjdGx5IGhvdyBUYXVudXMgaXMgZG9pbmcgc29tZXRoaW5nLCBhcyB0aGUgbG9nZ2VyIGlzIHByZXR0eSB2ZXJib3NlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIENsaWVudC1TaWRlIENvbnRyb2xsZXJzXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleGVjdXRlZCByaWdodCBhZnRlciBhIHZpZXcgaXMgcmVuZGVyZWQsIGV2ZW4gaW4gdGhlIGNhc2Ugb2YgW3BhcnRpYWwgdmlld3NdKCMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC0pLiBUaGVzZSBjb250cm9sbGVycyBhcmUgdXNlZCB0byBwcm9ncmVzc2l2ZWx5IGFkZCBiZWhhdmlvciBvbiB0b3Agb2YgdGhlIEhUTUwgZm9yIHRoYXQgdmlldy5cXG5cXG4gICAgVmlldyBjb250cm9sbGVycyB0YWtlIHRocmVlIHBhcmFtZXRlcnMuXFxuXFxuICAgIFBhcmFtZXRlciAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBtb2RlbGAgICAgIHwgTW9kZWwgdGhhdCB3YXMgdXNlZCB0byByZW5kZXIgdGhlIHZpZXdcXG4gICAgYGNvbnRhaW5lcmAgfCBUaGUgRE9NIGVsZW1lbnQgd2hlcmUgdGhlIHZpZXcgd2FzIHJlbmRlcmVkXFxuICAgIGByb3V0ZT9gICAgIHwgUm91dGUgdGhhdCB0cmlnZ2VyZWQgdGhlIHJlbmRlcmluZyBlbmdpbmUuIE1heSBiZSBgbnVsbGBcXG5cXG4gICAgTm90ZSB0aGF0IFRhdW51cyB3aWxsIFtlbWl0IGEgYHJlbmRlcmAgZXZlbnRdKCMtdGF1bnVzLW9uLXR5cGUtZm4tKSByaWdodCBiZWZvcmUgdGhlIHZpZXcgY29udHJvbGxlciBnZXRzIGV4ZWN1dGVkLCBnaXZpbmcgeW91IGEgY2hhbmNlIHRvIHJlYWN0IHRvIHZpZXdzIGdldHRpbmcgcmVuZGVyZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGhlIGAudGF1bnVzcmNgIG1hbmlmZXN0XFxuXFxuICAgIElmIHlvdSB3YW50IHRvIHVzZSB2YWx1ZXMgb3RoZXIgdGhhbiB0aGUgY29udmVudGlvbmFsIGRlZmF1bHRzIHNob3duIGluIHRoZSB0YWJsZSBiZWxvdywgdGhlbiB5b3Ugc2hvdWxkIGNyZWF0ZSBhIGAudGF1bnVzcmNgIGZpbGUuIE5vdGUgdGhhdCB0aGUgZGVmYXVsdHMgbmVlZCB0byBiZSBvdmVyd3JpdHRlbiBpbiBhIGNhc2UtYnktY2FzZSBiYXNpcy4gVGhlc2Ugb3B0aW9ucyBjYW4gYWxzbyBiZSBjb25maWd1cmVkIGluIHlvdXIgYHBhY2thZ2UuanNvbmAsIHVuZGVyIHRoZSBgdGF1bnVzYCBwcm9wZXJ0eS5cXG5cXG4gICAgYGBganNvblxcbiAgICB7XFxuICAgICAgXFxcInZpZXdzXFxcIjogXFxcIi5iaW4vdmlld3NcXFwiLFxcbiAgICAgIFxcXCJzZXJ2ZXJfcm91dGVzXFxcIjogXFxcImNvbnRyb2xsZXJzL3JvdXRlcy5qc1xcXCIsXFxuICAgICAgXFxcInNlcnZlcl9jb250cm9sbGVyc1xcXCI6IFxcXCJjb250cm9sbGVyc1xcXCIsXFxuICAgICAgXFxcImNsaWVudF9jb250cm9sbGVyc1xcXCI6IFxcXCJjbGllbnQvanMvY29udHJvbGxlcnNcXFwiLFxcbiAgICAgIFxcXCJjbGllbnRfd2lyaW5nXFxcIjogXFxcIi5iaW4vd2lyaW5nLmpzXFxcIlxcbiAgICB9XFxuICAgIGBgYFxcblxcbiAgICAtIFRoZSBgdmlld3NgIGRpcmVjdG9yeSBpcyB3aGVyZSB5b3VyIHZpZXdzIF8oYWxyZWFkeSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQpXyBhcmUgcGxhY2VkLiBUaGVzZSB2aWV3cyBhcmUgdXNlZCBkaXJlY3RseSBvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlXFxuICAgIC0gVGhlIGBzZXJ2ZXJfcm91dGVzYCBmaWxlIGlzIHRoZSBtb2R1bGUgd2hlcmUgeW91IGV4cG9ydCBhIGNvbGxlY3Rpb24gb2Ygcm91dGVzLiBUaGUgQ0xJIHdpbGwgcHVsbCB0aGVzZSByb3V0ZXMgd2hlbiBjcmVhdGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGVzIGZvciB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIFRoZSBgc2VydmVyX2NvbnRyb2xsZXJzYCBkaXJlY3RvcnkgaXMgdGhlIHJvb3QgZGlyZWN0b3J5IHdoZXJlIHlvdXIgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgbGl2ZS4gSXQncyB1c2VkIHdoZW4gc2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGUgcm91dGVyXFxuICAgIC0gVGhlIGBjbGllbnRfY29udHJvbGxlcnNgIGRpcmVjdG9yeSBpcyB3aGVyZSB5b3VyIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgbW9kdWxlcyBsaXZlLiBUaGUgQ0xJIHdpbGwgYHJlcXVpcmVgIHRoZXNlIGNvbnRyb2xsZXJzIGluIGl0cyByZXN1bHRpbmcgd2lyaW5nIG1vZHVsZVxcbiAgICAtIFRoZSBgY2xpZW50X3dpcmluZ2AgZmlsZSBpcyB3aGVyZSB5b3VyIHdpcmluZyBtb2R1bGUgd2lsbCBiZSBwbGFjZWQgYnkgdGhlIENMSS4gWW91J2xsIHRoZW4gaGF2ZSB0byBgcmVxdWlyZWAgaXQgaW4geW91ciBhcHBsaWNhdGlvbiB3aGVuIGJvb3RpbmcgdXAgVGF1bnVzXFxuXFxuICAgIEhlcmUgaXMgd2hlcmUgdGhpbmdzIGdldCBbYSBsaXR0bGUgY29udmVudGlvbmFsXVsxMl0uIFZpZXdzLCBhbmQgYm90aCBzZXJ2ZXItc2lkZSBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4cGVjdGVkIHRvIGJlIG9yZ2FuaXplZCBieSBmb2xsb3dpbmcgdGhlIGB7cm9vdH0ve2NvbnRyb2xsZXJ9L3thY3Rpb259YCBwYXR0ZXJuLCBidXQgeW91IGNvdWxkIGNoYW5nZSB0aGF0IHVzaW5nIGByZXNvbHZlcnNgIHdoZW4gaW52b2tpbmcgdGhlIENMSSBhbmQgdXNpbmcgdGhlIHNlcnZlci1zaWRlIEFQSS5cXG5cXG4gICAgVmlld3MgYW5kIGNvbnRyb2xsZXJzIGFyZSBhbHNvIGV4cGVjdGVkIHRvIGJlIENvbW1vbkpTIG1vZHVsZXMgdGhhdCBleHBvcnQgYSBzaW5nbGUgbWV0aG9kLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICBbMV06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzJdOiBodHRwOi8vZXhwcmVzc2pzLmNvbVxcbiAgICBbM106IGh0dHA6Ly9oYXBpanMuY29tXFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iLzMzMjcxNzUxMzEyZGI2ZTkyMDU5ZDk4MjkzZDBhN2FjNmU5ZThlNWIvdmlld3Mvc2VydmVyL2xheW91dC9sYXlvdXQuamFkZVxcbiAgICBbNV06IGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9oZ2V0XFxuICAgIFs2XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iL2Y2ZDZiNTA2OGZmMDNhMzg3ZjUwMzkwMDE2MGQ5ZmRjMWU3NDk3NTAvY29udHJvbGxlcnMvcm91dGluZy5qcyNMNzAtTDcyXFxuICAgIFs3XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcbiAgICBbOF06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXG4gICAgWzldOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2hhcGlpZnlcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL3VtZGpzL3VtZFxcbiAgICBbMTFdOiBodHRwOi8vYnJvd3NlcmlmeS5vcmdcXG4gICAgWzEyXTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcbiAgICBbMTNdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NpbmdsZS1wYWdlX2FwcGxpY2F0aW9uXFxuICAgIFsxNF06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXG4gICAgWzE1XTogL2dldHRpbmctc3RhcnRlZCN2ZXJzaW9uaW5nXFxuICAgIFsxNl06IGh0dHBzOi8vZ2l0aHViLmNvbS9SYXlub3MveGhyXFxuICAgIFsxN106IGh0dHA6Ly9pLmltZ3VyLmNvbS9DamJJSHkwLnBuZ1xcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb21wbGVtZW50cyhsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJjb21wbGVtZW50YXJ5LW1vZHVsZXNcXFwiPkNvbXBsZW1lbnRhcnkgTW9kdWxlczwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc21hbGwgbGlicmFyeSBieSBNVkMgZnJhbWV3b3JrIHN0YW5kYXJkcywgc2l0dGluZyA8c3Ryb25nPmJlbG93IDE1a0IgbWluaWZpZWQgYW5kIGd6aXBwZWQ8L3N0cm9uZz4uIEl0IGlzIGRlc2lnbmVkIHRvIGJlIHNtYWxsLiBJdCBpcyBhbHNvIGRlc2lnbmVkIHRvIGRvIG9uZSB0aGluZyB3ZWxsLCBhbmQgdGhhdCYjMzk7cyA8ZW0+YmVpbmcgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmU8L2VtPi48L3A+XFxuPHA+VGF1bnVzIGNhbiBiZSB1c2VkIGZvciByb3V0aW5nLCBwdXR0aW5nIHRvZ2V0aGVyIGNvbnRyb2xsZXJzLCBtb2RlbHMgYW5kIHZpZXdzIHRvIGhhbmRsZSBodW1hbiBpbnRlcmFjdGlvbi4gSWYgeW91IDxhIGhyZWY9XFxcIi9hcGlcXFwiPmhlYWQgb3ZlciB0byB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+LCB5b3UmIzM5O2xsIG5vdGljZSB0aGF0IHRoZSBzZXJ2ZXItc2lkZSBBUEksIHRoZSBjb21tYW5kLWxpbmUgaW50ZXJmYWNlLCBhbmQgdGhlIDxjb2RlPi50YXVudXNyYzwvY29kZT4gbWFuaWZlc3QgYXJlIG9ubHkgY29uY2VybmVkIHdpdGggcHJvdmlkaW5nIGEgY29udmVudGlvbmFsIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZS48L3A+XFxuPHA+SW4gdGhlIHNlcnZlci1zaWRlIHlvdSBtaWdodCBuZWVkIHRvIGRvIG90aGVyIHRoaW5ncyBiZXNpZGVzIHJvdXRpbmcgYW5kIHJlbmRlcmluZyB2aWV3cywgYW5kIG90aGVyIG1vZHVsZXMgY2FuIHRha2UgY2FyZSBvZiB0aGF0LiBIb3dldmVyLCB5b3UmIzM5O3JlIHVzZWQgdG8gaGF2aW5nIGRhdGFiYXNlIGFjY2Vzcywgc2VhcmNoLCBsb2dnaW5nLCBhbmQgYSB2YXJpZXR5IG9mIHNlcnZpY2VzIGhhbmRsZWQgYnkgc2VwYXJhdGUgbGlicmFyaWVzLCBpbnN0ZWFkIG9mIGEgc2luZ2xlIGJlaGVtb3RoIHRoYXQgdHJpZXMgdG8gZG8gZXZlcnl0aGluZy48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+SW4gdGhlIGNsaWVudC1zaWRlLCB5b3UgbWlnaHQgYmUgdXNlZCB0byB5b3VyIE1WQyBmcmFtZXdvcmsgb2YgY2hvaWNlIHJlc29sdmluZyBldmVyeXRoaW5nIG9uIHlvdXIgYmVoYWxmLCBmcm9tIERPTSBtYW5pcHVsYXRpb24gYW5kIGRhdGEtYmluZGluZyB0byBob29raW5nIHVwIHdpdGggYSBSRVNUIEFQSSwgYW5kIGV2ZXJ5d2hlcmUgaW4gYmV0d2Vlbi48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPlRhdW51cyBhdHRlbXB0cyB0byBicmluZyB0aGUgc2VydmVyLXNpZGUgbWVudGFsaXR5IG9mIDxlbT4mcXVvdDtub3QgZG9pbmcgZXZlcnl0aGluZyBpcyBva2F5JnF1b3Q7PC9lbT4gaW50byB0aGUgd29ybGQgb2YgY2xpZW50LXNpZGUgd2ViIGFwcGxpY2F0aW9uIGRldmVsb3BtZW50IGFzIHdlbGwuIFRvIHRoYXQgZW5kLCBUYXVudXMgcmVjb21tZW5kcyB0aGF0IHlvdSBnaXZlIGEgc2hvdCB0byBsaWJyYXJpZXMgdGhhdCBhbHNvIGRvIDxzdHJvbmc+b25lIHRoaW5nIHdlbGw8L3N0cm9uZz4uPC9wPlxcbjxwPkluIHRoaXMgYnJpZWYgYXJ0aWNsZSB3ZSYjMzk7bGwgcmVjb21tZW5kIGEgY291cGxlIGRpZmZlcmVudCBsaWJyYXJpZXMgdGhhdCBwbGF5IHdlbGwgd2l0aCBUYXVudXMsIGFuZCB5b3UmIzM5O2xsIGFsc28gbGVhcm4gaG93IHRvIHNlYXJjaCBmb3IgbW9kdWxlcyB0aGF0IGNhbiBnaXZlIHlvdSBhY2Nlc3MgdG8gb3RoZXIgZnVuY3Rpb25hbGl0eSB5b3UgbWF5IGJlIGludGVyZXN0ZWQgaW4uPC9wPlxcbjxoMSBpZD1cXFwidXNpbmctZG9taW51cy1mb3ItZG9tLXF1ZXJ5aW5nXFxcIj5Vc2luZyA8Y29kZT5kb21pbnVzPC9jb2RlPiBmb3IgRE9NIHF1ZXJ5aW5nPC9oMT5cXG48cD48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvZG9taW51c1xcXCI+RG9taW51czwvYT4gaXMgYW4gZXh0cmEtc21hbGwgRE9NIHF1ZXJ5aW5nIGxpYnJhcnksIGN1cnJlbnRseSBjbG9ja2luZyBhcm91bmQgPHN0cm9uZz40a0IgbWluaWZpZWQgYW5kIGd6aXBwZWQ8L3N0cm9uZz4sIGFsbW9zdCA8ZW0+dGVuIHRpbWVzIHNtYWxsZXI8L2VtPiB0aGFuIGl0JiMzOTtzIGNvbXBldGl0aW9uLiBVbmxpa2UgalF1ZXJ5IGFuZCBwb3B1bGFyIGZyaWVuZHMsIERvbWludXMgZG9lc24mIzM5O3QgcHJvdmlkZSBBSkFYIGZlYXR1cmVzLCBsYXlvdXQgbWF0aCwgPGNvZGU+Jmx0O2Zvcm0mZ3Q7PC9jb2RlPiBtYW5pcHVsYXRpb24sIHByb21pc2VzLCB0ZW5zIG9mIGV2ZW50IGJpbmRpbmcgbWV0aG9kcywgYSBzZWxlY3RvciBlbmdpbmUgd3JpdHRlbiBpbiBwbGFpbiBKYXZhU2NyaXB0LCBub3IgYSBteXJpYWQgb2YgdXRpbGl0eSBmdW5jdGlvbnMuIEluc3RlYWQsIERvbWludXMgZm9jdXNlcyBzb2xlbHkgb24gcHJvdmlkaW5nIGEgcmljaCBET00gcXVlcnlpbmcgYW5kIG1hbmlwdWxhdGlvbiBBUEkgdGhhdCBnZXRzIHJpZCBvZiBpbmNvbnNpc3RlbmNpZXMgYWNyb3NzIGJyb3dzZXJzLjwvcD5cXG48cD5XaGlsZSB0aGUgQVBJIGlzbiYjMzk7dCBleGFjdGx5IGNvbXBhdGlibGUgd2l0aCBqUXVlcnksIGl0IGlzIGRlZmluaXRlbHkgZmFtaWxpYXIgdG8gdGhlIGpRdWVyeSBhZGVwdC4gQ2hhaW5pbmcsIHZlcnNhdGlsaXR5LCBleHByZXNzaXZlbmVzcywgYW5kIHJhdyBwb3dlciBhcmUgYWxsIGNvcmUgY29uY2VybnMgZm9yIERvbWludXMuIFlvdSYjMzk7bGwgZmluZCB0aGF0IERvbWludXMgaGFzIG1vcmUgY29uc2lzdGVudGx5IG5hbWVkIG1ldGhvZHMsIGdpdmVuIHRoYXQgaXQgd2FzIGJ1aWx0IHdpdGggYSBjb25jaXNlIEFQSSBpbiBtaW5kLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBkaWZmZXJlbmNlcyBpbiBzZW1hbnRpY3MsIGFuZCBJIGJlbGlldmUgdGhhdCYjMzk7cyBhIGdvb2QgdGhpbmcuIEZvciBpbnN0YW5jZSwgaWYgeW91IGRvIDxjb2RlPi52YWx1ZTwvY29kZT4gb24gYSBjaGVja2JveCBvciByYWRpbyBidXR0b24geW91JiMzOTtsbCBnZXQgYmFjayB3aGV0aGVyIHRoZSBpbnB1dCBpcyBjaGVja2VkLiBTaW1pbGFybHksIGlmIHlvdSBjYWxsIDxjb2RlPi50ZXh0PC9jb2RlPiBvbiB0aGUgaW5wdXQgeW91JiMzOTtsbCBnZXQgdGhlIHRleHQgYmFjaywgd2hpY2ggaXMgbW9zdCBvZnRlbiB3aGF0IHlvdSB3YW50ZWQgdG8gZ2V0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj52YXIgYSA9IHJlcXVpcmUoJiMzOTtkb21pbnVzJiMzOTspO1xcbnZhciBiID0galF1ZXJ5O1xcblxcbmEoJiMzOTsmbHQ7aW5wdXQmZ3Q7JiMzOTspLmF0dHIoeyB0eXBlOiAmIzM5O3JhZGlvJiMzOTssIHZhbHVlOiAmIzM5O0ZvbyYjMzk7IH0pLnRleHQoKTtcXG4vLyAmbHQ7LSAmIzM5O0ZvbyYjMzk7XFxuXFxuYSgmIzM5OyZsdDtpbnB1dCZndDsmIzM5OykuYXR0cih7IHR5cGU6ICYjMzk7cmFkaW8mIzM5OywgY2hlY2tlZDogdHJ1ZSB9KS52YWx1ZSgpO1xcbi8vICZsdDstIHRydWVcXG5cXG5iKCYjMzk7Jmx0O2lucHV0Jmd0OyYjMzk7KS5hdHRyKHsgdHlwZTogJiMzOTtyYWRpbyYjMzk7LCB2YWx1ZTogJiMzOTtGb28mIzM5OyB9KS50ZXh0KCk7XFxuLy8gJmx0Oy0gJiMzOTsmIzM5O1xcblxcbmIoJiMzOTsmbHQ7aW5wdXQmZ3Q7JiMzOTspLmF0dHIoeyB0eXBlOiAmIzM5O3JhZGlvJiMzOTssIGNoZWNrZWQ6IHRydWUgfSkudmFsKCk7XFxuLy8gJmx0Oy0gJiMzOTtGb28mIzM5O1xcbjwvY29kZT48L3ByZT5cXG48cD5PbmUgb2YgdGhlIGJlc3QgYXNwZWN0cyBvZiBEb21pbnVzLCA8ZW0+YmVzaWRlcyBpdHMgc21hbGwgc2l6ZTwvZW0+LCBpcyB0aGUgZmFjdCB0aGF0IGl0IGV4dGVuZHMgbmF0aXZlIEphdmFTY3JpcHQgYXJyYXlzIDxlbT4odXNpbmcgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL3Bvc2VyXFxcIj48Y29kZT5wb3NlcjwvY29kZT48L2E+KTwvZW0+LiBUaGF0IG1lYW5zIHlvdSBoYXZlIGFjY2VzcyB0byBhbGwgb2YgdGhlIDxjb2RlPkFycmF5PC9jb2RlPiBmdW5jdGlvbmFsIG1ldGhvZHMgb24gYW55IDxjb2RlPkRvbWludXM8L2NvZGU+IGNvbGxlY3Rpb25zLCBzdWNoIGFzIDxjb2RlPi5mb3JFYWNoPC9jb2RlPiwgPGNvZGU+Lm1hcDwvY29kZT4sIDxjb2RlPi5maWx0ZXI8L2NvZGU+LCA8Y29kZT4uc29ydDwvY29kZT4gYW5kIHNvIG9uLjwvcD5cXG48cD5UYXVudXMgZG9lc24mIzM5O3QgbWFrZSBhbnkgZXh0ZW5zaXZlIERPTSBtYW5pcHVsYXRpb24gPGVtPihub3IgcXVlcnlpbmcpPC9lbT4gYW5kIGRvZXNuJiMzOTt0IG5lZWQgdG8gdXNlIERvbWludXMsIGJ1dCBpdCBtYXkgZmluZCBhIGhvbWUgaW4geW91ciBhcHBsaWNhdGlvbi48L3A+XFxuPHA+WW91IGNhbiBjaGVjayBvdXQgdGhlIDxlbT5jb21wbGV0ZSBBUEkgZG9jdW1lbnRhdGlvbjwvZW0+IGZvciA8Y29kZT5kb21pbnVzPC9jb2RlPiBvbiA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvZG9taW51c1xcXCI+aXRzIEdpdEh1YiByZXBvc2l0b3J5PC9hPi48L3A+XFxuPGgxIGlkPVxcXCJ1c2luZy14aHItdG8tbWFrZS1hamF4LXJlcXVlc3RzXFxcIj5Vc2luZyA8Y29kZT54aHI8L2NvZGU+IHRvIG1ha2UgQUpBWCByZXF1ZXN0czwvaDE+XFxuPHA+QSBzbWFsbCBwcm9ncmFtIGNhbGxlZCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vUmF5bm9zL3hoclxcXCI+PGNvZGU+eGhyPC9jb2RlPjwvYT4gY2FuIGJlIHVzZWQgdG8gbWFrZSBBSkFYIHJlcXVlc3RzIGFuZCBpdCYjMzk7cyBidW5kbGVkIHdpdGggVGF1bnVzLCBiZWNhdXNlIGl0IG5lZWRzIGl0IGludGVybmFsbHkgdG8gY29tbXVuaWNhdGUgd2l0aCB0aGUgc2VydmVyLiBBcyBzdWNoLCBpdCB3YXMgdHJpdmlhbCBmb3IgVGF1bnVzIHRvIGV4cG9zZSB0aGlzIGVuZ2luZSBhbmQgZ2l2ZSB5b3UgdGhlIGFiaWxpdHkgdG8gbWFrZSBBSkFYIGNhbGxzIG9mIHlvdXIgb3duIHVzaW5nIGl0IGFzIHdlbGwuPC9wPlxcbjxwPllvdSBjYW4gY2hlY2sgb3V0IDxhIGhyZWY9XFxcIi9hcGkjLXRhdW51cy14aHItdXJsLW9wdGlvbnMtZG9uZS1cXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4gZm9yIGFuIGV4cGxhbmF0aW9uIG9mIGhvdyBvdXIgaW50ZXJmYWNlIHRvIDxjb2RlPnhocjwvY29kZT4gd29ya3MsIG9yIHlvdSBjb3VsZCBhbHNvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9SYXlub3MveGhyXFxcIj5zZWUgdGhlaXIgQVBJIGRvY3VtZW50YXRpb248L2E+IGFuZCB1c2UgdGhhdCBkaXJlY3RseSBpbnN0ZWFkLjwvcD5cXG48aDEgaWQ9XFxcImNvbXBsZW1lbnRpbmcteW91ci1jb2RlLXdpdGgtc21hbGwtbW9kdWxlc1xcXCI+Q29tcGxlbWVudGluZyB5b3VyIGNvZGUgd2l0aCBzbWFsbCBtb2R1bGVzPC9oMT5cXG48cD5UaGVyZSYjMzk7cyBhbiBpbmZpbml0ZSBudW1iZXIgb2YgbW9kdWxlcyB0aGF0IGRvIGp1c3Qgb25lIHRoaW5nIHdlbGwgYW5kIGFyZSBlYWdlciB0byBiZSBwYXJ0IG9mIHlvdXIgYXBwbGljYXRpb25zLiBMZXZlcmFnZSB0aGUgSW50ZXJuZXQgdG8gZmluZCB3aGF0IHlvdSBuZWVkLiBTbWFsbCBsaWJyYXJpZXMgdGVuZCB0byBiZSBiZXR0ZXIgZG9jdW1lbnRlZCwgY29uY2lzZSB0byB1c2UsIGFuZCBzaW1wbGVyLjwvcD5cXG48cD5IZXJlJiMzOTtzIGEgZmV3IGV4YW1wbGVzIG9mIG1vZHVsZXMgeW91IGNvdWxkIGNvbnNpZGVyLjwvcD5cXG48dWw+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9oaW50XFxcIj48Y29kZT52dWU8L2NvZGU+PC9hPiBnaXZlcyB5b3UgTVZWTSBjYXBhYmlsaXRpZXM8L2xpPlxcbjxsaT48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vcG9seW1lci9vYnNlcnZlLWpzXFxcIj48Y29kZT5vYnNlcnZlLWpzPC9jb2RlPjwvYT4gdG8gZ2V0IGRhdGEtYmluZGluZzwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9NYXR0LUVzY2gvdmlydHVhbC1kb21cXFwiPjxjb2RlPnZpcnR1YWwtZG9tPC9jb2RlPjwvYT4gdG8gdXNlIGEgdmlydHVhbCBET00gZGlmZmluZyBhbGdvcml0aG0gYSBsYSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vZmFjZWJvb2svcmVhY3RcXFwiPkZhY2Vib29rIFJlYWN0PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9oaW50XFxcIj48Y29kZT5oaW50PC9jb2RlPjwvYT4gcHJvZ3Jlc3NpdmVseSBlbmhhbmNlcyB5b3VyIEhUTUwgZ2l2aW5nIHlvdSBtb3JlIGNvbG9yZnVsIHRvb2x0aXBzPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL3JvbWVcXFwiPjxjb2RlPnJvbWU8L2NvZGU+PC9hPiBpcyBhIHNtYWxsIGNhbGVuZGFyIGNvbXBvbmVudDwvbGk+XFxuPC91bD5cXG48cD5Zb3UgY2FuIGxvb2sgZm9yIHJlbGV2YW50IG1vZHVsZXMgdXNpbmcgPGEgaHJlZj1cXFwiaHR0cDovL2Jyb3dzZXJpZnlzZWFyY2gub3JnL1xcXCI+QnJvd3NlcmlmeVNlYXJjaC5vcmc8L2E+LCB0aGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly93d3cubnBtanMub3JnL1xcXCI+PGNvZGU+bnBtPC9jb2RlPiBzZWFyY2g8L2E+LCBhc2tpbmcgYXJvdW5kIG9uIFR3aXR0ZXIsIG9yIGp1c3QgYnkgR29vZ2xpbmchPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgQ29tcGxlbWVudGFyeSBNb2R1bGVzXFxuXFxuICAgIFRhdW51cyBpcyBhIHNtYWxsIGxpYnJhcnkgYnkgTVZDIGZyYW1ld29yayBzdGFuZGFyZHMsIHNpdHRpbmcgKipiZWxvdyAxNWtCIG1pbmlmaWVkIGFuZCBnemlwcGVkKiouIEl0IGlzIGRlc2lnbmVkIHRvIGJlIHNtYWxsLiBJdCBpcyBhbHNvIGRlc2lnbmVkIHRvIGRvIG9uZSB0aGluZyB3ZWxsLCBhbmQgdGhhdCdzIF9iZWluZyBhIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZV8uXFxuXFxuICAgIFRhdW51cyBjYW4gYmUgdXNlZCBmb3Igcm91dGluZywgcHV0dGluZyB0b2dldGhlciBjb250cm9sbGVycywgbW9kZWxzIGFuZCB2aWV3cyB0byBoYW5kbGUgaHVtYW4gaW50ZXJhY3Rpb24uIElmIHlvdSBbaGVhZCBvdmVyIHRvIHRoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMV0sIHlvdSdsbCBub3RpY2UgdGhhdCB0aGUgc2VydmVyLXNpZGUgQVBJLCB0aGUgY29tbWFuZC1saW5lIGludGVyZmFjZSwgYW5kIHRoZSBgLnRhdW51c3JjYCBtYW5pZmVzdCBhcmUgb25seSBjb25jZXJuZWQgd2l0aCBwcm92aWRpbmcgYSBjb252ZW50aW9uYWwgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lLlxcblxcbiAgICBJbiB0aGUgc2VydmVyLXNpZGUgeW91IG1pZ2h0IG5lZWQgdG8gZG8gb3RoZXIgdGhpbmdzIGJlc2lkZXMgcm91dGluZyBhbmQgcmVuZGVyaW5nIHZpZXdzLCBhbmQgb3RoZXIgbW9kdWxlcyBjYW4gdGFrZSBjYXJlIG9mIHRoYXQuIEhvd2V2ZXIsIHlvdSdyZSB1c2VkIHRvIGhhdmluZyBkYXRhYmFzZSBhY2Nlc3MsIHNlYXJjaCwgbG9nZ2luZywgYW5kIGEgdmFyaWV0eSBvZiBzZXJ2aWNlcyBoYW5kbGVkIGJ5IHNlcGFyYXRlIGxpYnJhcmllcywgaW5zdGVhZCBvZiBhIHNpbmdsZSBiZWhlbW90aCB0aGF0IHRyaWVzIHRvIGRvIGV2ZXJ5dGhpbmcuXFxuXFxuICAgID4gSW4gdGhlIGNsaWVudC1zaWRlLCB5b3UgbWlnaHQgYmUgdXNlZCB0byB5b3VyIE1WQyBmcmFtZXdvcmsgb2YgY2hvaWNlIHJlc29sdmluZyBldmVyeXRoaW5nIG9uIHlvdXIgYmVoYWxmLCBmcm9tIERPTSBtYW5pcHVsYXRpb24gYW5kIGRhdGEtYmluZGluZyB0byBob29raW5nIHVwIHdpdGggYSBSRVNUIEFQSSwgYW5kIGV2ZXJ5d2hlcmUgaW4gYmV0d2Vlbi5cXG5cXG4gICAgVGF1bnVzIGF0dGVtcHRzIHRvIGJyaW5nIHRoZSBzZXJ2ZXItc2lkZSBtZW50YWxpdHkgb2YgX1xcXCJub3QgZG9pbmcgZXZlcnl0aGluZyBpcyBva2F5XFxcIl8gaW50byB0aGUgd29ybGQgb2YgY2xpZW50LXNpZGUgd2ViIGFwcGxpY2F0aW9uIGRldmVsb3BtZW50IGFzIHdlbGwuIFRvIHRoYXQgZW5kLCBUYXVudXMgcmVjb21tZW5kcyB0aGF0IHlvdSBnaXZlIGEgc2hvdCB0byBsaWJyYXJpZXMgdGhhdCBhbHNvIGRvICoqb25lIHRoaW5nIHdlbGwqKi5cXG5cXG4gICAgSW4gdGhpcyBicmllZiBhcnRpY2xlIHdlJ2xsIHJlY29tbWVuZCBhIGNvdXBsZSBkaWZmZXJlbnQgbGlicmFyaWVzIHRoYXQgcGxheSB3ZWxsIHdpdGggVGF1bnVzLCBhbmQgeW91J2xsIGFsc28gbGVhcm4gaG93IHRvIHNlYXJjaCBmb3IgbW9kdWxlcyB0aGF0IGNhbiBnaXZlIHlvdSBhY2Nlc3MgdG8gb3RoZXIgZnVuY3Rpb25hbGl0eSB5b3UgbWF5IGJlIGludGVyZXN0ZWQgaW4uXFxuXFxuICAgICMgVXNpbmcgYGRvbWludXNgIGZvciBET00gcXVlcnlpbmdcXG5cXG4gICAgW0RvbWludXNdWzJdIGlzIGFuIGV4dHJhLXNtYWxsIERPTSBxdWVyeWluZyBsaWJyYXJ5LCBjdXJyZW50bHkgY2xvY2tpbmcgYXJvdW5kICoqNGtCIG1pbmlmaWVkIGFuZCBnemlwcGVkKiosIGFsbW9zdCBfdGVuIHRpbWVzIHNtYWxsZXJfIHRoYW4gaXQncyBjb21wZXRpdGlvbi4gVW5saWtlIGpRdWVyeSBhbmQgcG9wdWxhciBmcmllbmRzLCBEb21pbnVzIGRvZXNuJ3QgcHJvdmlkZSBBSkFYIGZlYXR1cmVzLCBsYXlvdXQgbWF0aCwgYDxmb3JtPmAgbWFuaXB1bGF0aW9uLCBwcm9taXNlcywgdGVucyBvZiBldmVudCBiaW5kaW5nIG1ldGhvZHMsIGEgc2VsZWN0b3IgZW5naW5lIHdyaXR0ZW4gaW4gcGxhaW4gSmF2YVNjcmlwdCwgbm9yIGEgbXlyaWFkIG9mIHV0aWxpdHkgZnVuY3Rpb25zLiBJbnN0ZWFkLCBEb21pbnVzIGZvY3VzZXMgc29sZWx5IG9uIHByb3ZpZGluZyBhIHJpY2ggRE9NIHF1ZXJ5aW5nIGFuZCBtYW5pcHVsYXRpb24gQVBJIHRoYXQgZ2V0cyByaWQgb2YgaW5jb25zaXN0ZW5jaWVzIGFjcm9zcyBicm93c2Vycy5cXG5cXG4gICAgV2hpbGUgdGhlIEFQSSBpc24ndCBleGFjdGx5IGNvbXBhdGlibGUgd2l0aCBqUXVlcnksIGl0IGlzIGRlZmluaXRlbHkgZmFtaWxpYXIgdG8gdGhlIGpRdWVyeSBhZGVwdC4gQ2hhaW5pbmcsIHZlcnNhdGlsaXR5LCBleHByZXNzaXZlbmVzcywgYW5kIHJhdyBwb3dlciBhcmUgYWxsIGNvcmUgY29uY2VybnMgZm9yIERvbWludXMuIFlvdSdsbCBmaW5kIHRoYXQgRG9taW51cyBoYXMgbW9yZSBjb25zaXN0ZW50bHkgbmFtZWQgbWV0aG9kcywgZ2l2ZW4gdGhhdCBpdCB3YXMgYnVpbHQgd2l0aCBhIGNvbmNpc2UgQVBJIGluIG1pbmQuXFxuXFxuICAgIFRoZXJlJ3MgYSBmZXcgZGlmZmVyZW5jZXMgaW4gc2VtYW50aWNzLCBhbmQgSSBiZWxpZXZlIHRoYXQncyBhIGdvb2QgdGhpbmcuIEZvciBpbnN0YW5jZSwgaWYgeW91IGRvIGAudmFsdWVgIG9uIGEgY2hlY2tib3ggb3IgcmFkaW8gYnV0dG9uIHlvdSdsbCBnZXQgYmFjayB3aGV0aGVyIHRoZSBpbnB1dCBpcyBjaGVja2VkLiBTaW1pbGFybHksIGlmIHlvdSBjYWxsIGAudGV4dGAgb24gdGhlIGlucHV0IHlvdSdsbCBnZXQgdGhlIHRleHQgYmFjaywgd2hpY2ggaXMgbW9zdCBvZnRlbiB3aGF0IHlvdSB3YW50ZWQgdG8gZ2V0LlxcblxcbiAgICBgYGBqc1xcbiAgICB2YXIgYSA9IHJlcXVpcmUoJ2RvbWludXMnKTtcXG4gICAgdmFyIGIgPSBqUXVlcnk7XFxuXFxuICAgIGEoJzxpbnB1dD4nKS5hdHRyKHsgdHlwZTogJ3JhZGlvJywgdmFsdWU6ICdGb28nIH0pLnRleHQoKTtcXG4gICAgLy8gPC0gJ0ZvbydcXG5cXG4gICAgYSgnPGlucHV0PicpLmF0dHIoeyB0eXBlOiAncmFkaW8nLCBjaGVja2VkOiB0cnVlIH0pLnZhbHVlKCk7XFxuICAgIC8vIDwtIHRydWVcXG5cXG4gICAgYignPGlucHV0PicpLmF0dHIoeyB0eXBlOiAncmFkaW8nLCB2YWx1ZTogJ0ZvbycgfSkudGV4dCgpO1xcbiAgICAvLyA8LSAnJ1xcblxcbiAgICBiKCc8aW5wdXQ+JykuYXR0cih7IHR5cGU6ICdyYWRpbycsIGNoZWNrZWQ6IHRydWUgfSkudmFsKCk7XFxuICAgIC8vIDwtICdGb28nXFxuICAgIGBgYFxcblxcbiAgICBPbmUgb2YgdGhlIGJlc3QgYXNwZWN0cyBvZiBEb21pbnVzLCBfYmVzaWRlcyBpdHMgc21hbGwgc2l6ZV8sIGlzIHRoZSBmYWN0IHRoYXQgaXQgZXh0ZW5kcyBuYXRpdmUgSmF2YVNjcmlwdCBhcnJheXMgXyh1c2luZyBbYHBvc2VyYF1bNV0pXy4gVGhhdCBtZWFucyB5b3UgaGF2ZSBhY2Nlc3MgdG8gYWxsIG9mIHRoZSBgQXJyYXlgIGZ1bmN0aW9uYWwgbWV0aG9kcyBvbiBhbnkgYERvbWludXNgIGNvbGxlY3Rpb25zLCBzdWNoIGFzIGAuZm9yRWFjaGAsIGAubWFwYCwgYC5maWx0ZXJgLCBgLnNvcnRgIGFuZCBzbyBvbi5cXG5cXG4gICAgVGF1bnVzIGRvZXNuJ3QgbWFrZSBhbnkgZXh0ZW5zaXZlIERPTSBtYW5pcHVsYXRpb24gXyhub3IgcXVlcnlpbmcpXyBhbmQgZG9lc24ndCBuZWVkIHRvIHVzZSBEb21pbnVzLCBidXQgaXQgbWF5IGZpbmQgYSBob21lIGluIHlvdXIgYXBwbGljYXRpb24uXFxuXFxuICAgIFlvdSBjYW4gY2hlY2sgb3V0IHRoZSBfY29tcGxldGUgQVBJIGRvY3VtZW50YXRpb25fIGZvciBgZG9taW51c2Agb24gW2l0cyBHaXRIdWIgcmVwb3NpdG9yeV1bMl0uXFxuXFxuICAgICMgVXNpbmcgYHhocmAgdG8gbWFrZSBBSkFYIHJlcXVlc3RzXFxuXFxuICAgIEEgc21hbGwgcHJvZ3JhbSBjYWxsZWQgW2B4aHJgXVs0XSBjYW4gYmUgdXNlZCB0byBtYWtlIEFKQVggcmVxdWVzdHMgYW5kIGl0J3MgYnVuZGxlZCB3aXRoIFRhdW51cywgYmVjYXVzZSBpdCBuZWVkcyBpdCBpbnRlcm5hbGx5IHRvIGNvbW11bmljYXRlIHdpdGggdGhlIHNlcnZlci4gQXMgc3VjaCwgaXQgd2FzIHRyaXZpYWwgZm9yIFRhdW51cyB0byBleHBvc2UgdGhpcyBlbmdpbmUgYW5kIGdpdmUgeW91IHRoZSBhYmlsaXR5IHRvIG1ha2UgQUpBWCBjYWxscyBvZiB5b3VyIG93biB1c2luZyBpdCBhcyB3ZWxsLlxcblxcbiAgICBZb3UgY2FuIGNoZWNrIG91dCBbdGhlIEFQSSBkb2N1bWVudGF0aW9uXVs2XSBmb3IgYW4gZXhwbGFuYXRpb24gb2YgaG93IG91ciBpbnRlcmZhY2UgdG8gYHhocmAgd29ya3MsIG9yIHlvdSBjb3VsZCBhbHNvIFtzZWUgdGhlaXIgQVBJIGRvY3VtZW50YXRpb25dWzRdIGFuZCB1c2UgdGhhdCBkaXJlY3RseSBpbnN0ZWFkLlxcblxcbiAgICAjIENvbXBsZW1lbnRpbmcgeW91ciBjb2RlIHdpdGggc21hbGwgbW9kdWxlc1xcblxcbiAgICBUaGVyZSdzIGFuIGluZmluaXRlIG51bWJlciBvZiBtb2R1bGVzIHRoYXQgZG8ganVzdCBvbmUgdGhpbmcgd2VsbCBhbmQgYXJlIGVhZ2VyIHRvIGJlIHBhcnQgb2YgeW91ciBhcHBsaWNhdGlvbnMuIExldmVyYWdlIHRoZSBJbnRlcm5ldCB0byBmaW5kIHdoYXQgeW91IG5lZWQuIFNtYWxsIGxpYnJhcmllcyB0ZW5kIHRvIGJlIGJldHRlciBkb2N1bWVudGVkLCBjb25jaXNlIHRvIHVzZSwgYW5kIHNpbXBsZXIuXFxuXFxuICAgIEhlcmUncyBhIGZldyBleGFtcGxlcyBvZiBtb2R1bGVzIHlvdSBjb3VsZCBjb25zaWRlci5cXG5cXG4gICAgLSBbYHZ1ZWBdWzEyXSBnaXZlcyB5b3UgTVZWTSBjYXBhYmlsaXRpZXNcXG4gICAgLSBbYG9ic2VydmUtanNgXVs3XSB0byBnZXQgZGF0YS1iaW5kaW5nXFxuICAgIC0gW2B2aXJ0dWFsLWRvbWBdWzhdIHRvIHVzZSBhIHZpcnR1YWwgRE9NIGRpZmZpbmcgYWxnb3JpdGhtIGEgbGEgW0ZhY2Vib29rIFJlYWN0XVs5XVxcbiAgICAtIFtgaGludGBdWzEwXSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VzIHlvdXIgSFRNTCBnaXZpbmcgeW91IG1vcmUgY29sb3JmdWwgdG9vbHRpcHNcXG4gICAgLSBbYHJvbWVgXVsxMV0gaXMgYSBzbWFsbCBjYWxlbmRhciBjb21wb25lbnRcXG5cXG4gICAgWW91IGNhbiBsb29rIGZvciByZWxldmFudCBtb2R1bGVzIHVzaW5nIFtCcm93c2VyaWZ5U2VhcmNoLm9yZ11bMTNdLCB0aGUgW2BucG1gIHNlYXJjaF1bMTRdLCBhc2tpbmcgYXJvdW5kIG9uIFR3aXR0ZXIsIG9yIGp1c3QgYnkgR29vZ2xpbmchXFxuXFxuICAgIFsxXTogL2FwaVxcbiAgICBbMl06IGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kb21pbnVzXFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL1JheW5vcy94aHJcXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvcG9zZXJcXG4gICAgWzZdOiAvYXBpIy10YXVudXMteGhyLXVybC1vcHRpb25zLWRvbmUtXFxuICAgIFs3XTogaHR0cHM6Ly9naXRodWIuY29tL3BvbHltZXIvb2JzZXJ2ZS1qc1xcbiAgICBbOF06IGh0dHBzOi8vZ2l0aHViLmNvbS9NYXR0LUVzY2gvdmlydHVhbC1kb21cXG4gICAgWzldOiBodHRwczovL2dpdGh1Yi5jb20vZmFjZWJvb2svcmVhY3RcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2hpbnRcXG4gICAgWzExXTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL3JvbWVcXG4gICAgWzEyXTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2hpbnRcXG4gICAgWzEzXTogaHR0cDovL2Jyb3dzZXJpZnlzZWFyY2gub3JnL1xcbiAgICBbMTRdOiBodHRwczovL3d3dy5ucG1qcy5vcmcvXFxuICAgIFsxNV06IGh0dHBzOi8vZ2l0aHViLmNvbS95eXg5OTA4MDMvdnVlXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldHRpbmdTdGFydGVkKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJnZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQmIzM5O3MgPGVtPnVwIHRvIHlvdSBob3cgdG8gdXNlIGl0PC9lbT4uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gPHN0cm9uZz5zZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0PC9zdHJvbmc+LCBhcyB0aGF0JiMzOTtsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2hvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlXFxcIj5TZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZTwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjcmVhdGluZy1hLWxheW91dFxcXCI+Q3JlYXRpbmcgYSBsYXlvdXQ8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjY29tcGlsaW5nLXlvdXItY2xpZW50LXNpZGUtamF2YXNjcmlwdFxcXCI+Q29tcGlsaW5nIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdDwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3ZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvYT48L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJob3ctaXQtd29ya3NcXFwiPkhvdyBpdCB3b3JrczwvaDE+XFxuPHA+VGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0IDxzdHJvbmc+cHJvdmVuPC9zdHJvbmc+IHNldCBvZiBydWxlcy48L3A+XFxuPHVsPlxcbjxsaT5EZWZpbmUgYSA8Y29kZT5mdW5jdGlvbihtb2RlbCk8L2NvZGU+IGZvciBlYWNoIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5QdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvbjwvbGk+XFxuPGxpPlB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzPC9saT5cXG48bGk+Q3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzPC9saT5cXG48bGk+Q3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3PC9saT5cXG48bGk+Rm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZTwvbGk+XFxuPGxpPldoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhPC9saT5cXG48bGk+T25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgPHN0cm9uZz5oaWphY2sgbGluayBjbGlja3M8L3N0cm9uZz4gYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkPC9saT5cXG48bGk+V2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5JZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gPHN0cm9uZz5Eb24mIzM5O3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzITwvc3Ryb25nPjwvbGk+XFxuPC91bD5cXG48cD5JJiMzOTtsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2gxPlxcbjxwPkZpcnN0IG9mZiwgeW91JiMzOTtsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+dGF1bnVzLWV4cHJlc3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+LCB0aHJvdWdoIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPnRhdW51cy1oYXBpPC9hPiBhbmQgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+aGFwaWlmeTwvYT4gdHJhbnNmb3JtPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHlvdSYjMzk7cmUgbW9yZSBvZiBhIDxlbT4mcXVvdDtydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJiMzOTtzIGNvZGUmcXVvdDs8L2VtPiB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxcIj5nb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSYjMzk7cyBzb3VyY2UgY29kZTwvYT4sIHdoaWNoIHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb29cXFwiPnBvbnlmb28uY29tPC9hPiwgd2hpY2ggaXMgPHN0cm9uZz5hIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2U8L3N0cm9uZz4gdW5kZXIgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0JiMzOTtzIG9rYXkgdG9vLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhbHNvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvZ2VuZXJhdG9yLXRhdW51c1xcXCI+YSBZZW9tYW4gZ2VuZXJhdG9yIG5hbWVkIDxjb2RlPmdlbmVyYXRvci10YXVudXM8L2NvZGU+PC9hPiB5b3UgY291bGQgdXNlIHRvIGdldCBzdGFydGVkLCBpbnN0ZWFkLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldHRsZWQgZm9yIGVpdGhlciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJiMzOTtsbCB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+LiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwic2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9oND5cXG48cD5OYXR1cmFsbHksIHlvdSYjMzk7bGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSA8Y29kZT5ucG08L2NvZGU+IHRvIGdldCBzdGFydGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciBnZXR0aW5nLXN0YXJ0ZWRcXG5jZCBnZXR0aW5nLXN0YXJ0ZWRcXG5ucG0gaW5pdFxcbm5wbSBpbnN0YWxsIC0tc2F2ZSB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzc1xcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbnBtIGluaXRgIG91dHB1dFxcXCI+PC9wPlxcbjxwPkxldCYjMzk7cyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSYjMzk7bGwgbmVlZCB0aGUgZmFtb3VzIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggYXBwLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUsIGxldCYjMzk7cyBkbyB0aGF0IG5vdy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge307XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QWxsIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIDxjb2RlPmFwcDwvY29kZT4uIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gaW52b2NhdGlvbi4gWW91JiMzOTtsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIDxlbT4mcXVvdDtOb3QgRm91bmQmcXVvdDs8L2VtPiB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS48L3A+XFxuPHA+SWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5UaGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0IHBhc3NlZCB0byA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBsZXQmIzM5O3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQmIzM5O3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSA8ZW0+cmVxdWlyZWQgY29uZmlndXJhdGlvbjwvZW0+LiBUaGVyZSYjMzk7cyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlczwvbGk+XFxuPGxpPjxjb2RlPmxheW91dDwvY29kZT4gc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSA8Y29kZT5tb2RlbDwvY29kZT4gYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnQ8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9oND5cXG48cD5Sb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gPHN0cm9uZz53aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZzwvc3Ryb25nPi4gTGV0JiMzOTtzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHJvdXRlcy5qc1xcbjwvY29kZT48L3ByZT5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IFtcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1cXG5dO1xcbjwvY29kZT48L3ByZT5cXG48cD5FYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSA8Y29kZT4vPC9jb2RlPiByb3V0ZSB3aXRoIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm48L2E+LCB3aGljaCBtYWRlIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvUnVieV9vbl9SYWlsc1xcXCI+UnVieSBvbiBSYWlsczwvYT4gZmFtb3VzLiA8ZW0+TWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vITwvZW0+IEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24gdXNlcyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gdmlldy4gT2YgY291cnNlLCA8ZW0+YWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbjwvZW0+LjwvcD5cXG48cD5UaW1lIHRvIGdvIGJhY2sgdG8gPGNvZGU+YXBwLmpzPC9jb2RlPiBhbmQgdXBkYXRlIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIDxlbT4obW9yZSBvbiB0aGF0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPmluIHRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4sIGJ1dCBpdCBkZWZhdWx0cyB0byA8Y29kZT57fTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkhlcmUmIzM5O3Mgd2hhdCB5b3UmIzM5O2QgZ2V0IGlmIHlvdSBhdHRlbXB0ZWQgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS8wOGxuQ2VjLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXFxcIj48L3A+XFxuPHA+VHVybnMgb3V0IHlvdSYjMzk7cmUgbWlzc2luZyBhIGxvdCBvZiB0aGluZ3MhIFRhdW51cyBpcyBxdWl0ZSBsZW5pZW50IGFuZCBpdCYjMzk7bGwgdHJ5IGl0cyBiZXN0IHRvIGxldCB5b3Uga25vdyB3aGF0IHlvdSBtaWdodCBiZSBtaXNzaW5nLCB0aG91Z2guIEFwcGFyZW50bHkgeW91IGRvbiYjMzk7dCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISA8ZW0+VGhhdCYjMzk7cyByb3VnaC48L2VtPjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvaDQ+XFxuPHA+TGV0JiMzOTtzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQmIzM5O2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBsYXlvdXQuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IDxlbT4oYXMgc2VlbiBiZWxvdyk8L2VtPiBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UmIzM5O2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgPGVtPiZxdW90O3VzZSB0aGUgZm9sbG93aW5nIGNvbWJpbmF0aW9uIG9mIHBsYWluIHRleHQgYW5kIHRoZSA8c3Ryb25nPihtYXliZSBIVE1MKTwvc3Ryb25nPiBwYXJ0aWFsIHZpZXcmcXVvdDs8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHJldHVybiAmIzM5O1RoaXMgaXMgdGhlIHBhcnRpYWw6ICZxdW90OyYjMzk7ICsgbW9kZWwucGFydGlhbCArICYjMzk7JnF1b3Q7JiMzOTs7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJiMzOTt0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCYjMzk7cyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuPC9wPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXFwiPk11c3RhY2hlPC9hPiBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCYjMzk7cyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTDwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcXCI+SmFkZTwvYT4gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSYjMzk7cyBubyBjbG9zaW5nIHRhZ3M8L2xpPlxcbjxsaT5UaGVyZSYjMzk7cyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgPGEgaHJlZj1cXFwiaHR0cDovL21vemlsbGEuZ2l0aHViLmlvL251bmp1Y2tzL1xcXCI+TW96aWxsYSYjMzk7cyBOdW5qdWNrczwvYT4sIDxhIGhyZWY9XFxcImh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcXCI+SGFuZGxlYmFyczwvYT4sIGFuZCA8YSBocmVmPVxcXCJodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcXCI+RUpTPC9hPi48L2xpPlxcbjwvdWw+XFxuPHA+UmVtZW1iZXIgdG8gYWRkIHRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHVuZGVyIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5IZXJlJiMzOTtzIHdoYXQgeW91JiMzOTtkIGdldCBpZiB5b3UgcmFuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5BdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSYjMzk7cmUgc3RpbGwgbWlzc2luZyB0aGUgcGFydGlhbCB2aWV3IGFuZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlci4gV2UgY2FuIGRvIHdpdGhvdXQgdGhlIGNvbnRyb2xsZXIsIGJ1dCBoYXZpbmcgbm8gdmlld3MgaXMga2luZCBvZiBwb2ludGxlc3Mgd2hlbiB5b3UmIzM5O3JlIHRyeWluZyB0byBnZXQgYW4gTVZDIGVuZ2luZSB1cCBhbmQgcnVubmluZywgcmlnaHQ/PC9wPlxcbjxwPllvdSYjMzk7bGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbjwvYT4uIElmIHlvdSBkb24mIzM5O3QgcHJvdmlkZSBhIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIDxjb2RlPiZsdDtwcmUmZ3Q7PC9jb2RlPiBhbmQgPGNvZGU+Jmx0O2NvZGUmZ3Q7PC9jb2RlPiB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmVcXFwiPlVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZTwvaDQ+XFxuPHA+TGV0JiMzOTtzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCB2aWV3cy9ob21lXFxudG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlJiMzOTtyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQmIzM5O3MgaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+cCBIZWxsbyBUYXVudXMhXFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgeW91JiMzOTtsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9qYWR1bVxcXCI+amFkdW08L2E+LCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0JiMzOTtzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIDxlbT4oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UmIzM5O3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKTwvZW0+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLWdsb2JhbCBqYWR1bVxcbjwvY29kZT48L3ByZT5cXG48cD5UbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIDxjb2RlPnZpZXdzPC9jb2RlPiBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSA8Y29kZT4uYmluPC9jb2RlPiBiZWNhdXNlIHRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uPC9hPiBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPmphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG48L2NvZGU+PC9wcmU+XFxuPHA+Q29uZ3JhdHVsYXRpb25zISBZb3VyIGZpcnN0IHZpZXcgaXMgbm93IG9wZXJhdGlvbmFsIGFuZCBidWlsdCB1c2luZyBhIGZ1bGwtZmxlZGdlZCB0ZW1wbGF0aW5nIGVuZ2luZSEgQWxsIHRoYXQmIzM5O3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgPGNvZGU+MzAwMDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxub3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS96amFKWUNxLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5HcmFudGVkLCB5b3Ugc2hvdWxkIDxlbT5wcm9iYWJseTwvZW0+IG1vdmUgdGhlIGxheW91dCBpbnRvIGEgSmFkZSA8ZW0+KGFueSB2aWV3IGVuZ2luZSB3aWxsIGRvKTwvZW0+IHRlbXBsYXRlIGFzIHdlbGwuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhyb3dpbmctaW4tYS1jb250cm9sbGVyXFxcIj5UaHJvd2luZyBpbiBhIGNvbnRyb2xsZXI8L2g0PlxcbjxwPkNvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24mIzM5O3QgZ2V0IHlvdSB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCYjMzk7cyBjcmVhdGUgYSBjb250cm9sbGVyIGZvciB0aGUgPGNvZGU+aG9tZS92aWV3PC9jb2RlPiBhY3Rpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm1rZGlyIC1wIGNvbnRyb2xsZXJzL2hvbWVcXG50b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiA8ZW0+U3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj88L2VtPiBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IDxlbT4ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBpbiB0aGUgY2FzZSBvZiA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbiYjMzk7dCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyA8ZW0+KHZlcnkgZmV3KTwvZW0+IHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIDxjb2RlPnRpdGxlPC9jb2RlPiBwcm9wZXJ0eSwgYW5kIGl0JiMzOTtsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgPGNvZGU+ZG9jdW1lbnQudGl0bGU8L2NvZGU+IGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0JiMzOTtzIG5vdCBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IHByb3BlcnR5IHdvbiYjMzk7dCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LjwvcD5cXG48cD5IZXJlIGlzIG91ciBuZXdmYW5nbGVkIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIuIEFzIHlvdSYjMzk7bGwgbm90aWNlLCBpdCBkb2VzbiYjMzk7dCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gPGNvZGU+bmV4dDwvY29kZT4gaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byA8Y29kZT5yZXMudmlld01vZGVsPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgIG1vZGVsOiB7XFxuICAgICAgdGl0bGU6ICYjMzk7V2VsY29tZSBIb21lLCBUYXVudXMhJiMzOTtcXG4gICAgfVxcbiAgfTtcXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSA8ZW0+d291bGRuJiMzOTt0IGJlIHByb2dyZXNzaXZlPC9lbT4sIGFuZCB0aHVzIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPml0IHdvdWxkIGJlIHJlYWxseSwgPGVtPnJlYWxseTwvZW0+IGJhZDwvYT4uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgPGNvZGU+dGl0bGU8L2NvZGU+IGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCYjMzk7cyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnJtIGxheW91dC5qc1xcbnRvdWNoIHZpZXdzL2xheW91dC5qYWRlXFxuamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbjwvY29kZT48L3ByZT5cXG48cD5Zb3Ugc2hvdWxkIGFsc28gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZSBvbmNlIGFnYWluITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vLmJpbi92aWV3cy9sYXlvdXQmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT4hPTwvY29kZT4gc3ludGF4IGJlbG93IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbiYjMzk7dCBiZSBlc2NhcGVkLiBUaGF0JiMzOTtzIG9rYXkgYmVjYXVzZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJiMzOTt0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+dGl0bGU9bW9kZWwudGl0bGVcXG5tYWluIT1wYXJ0aWFsXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IDxjb2RlPiZsdDtodG1sJmd0OzwvY29kZT4sIDxjb2RlPiZsdDtoZWFkJmd0OzwvY29kZT4sIGFuZCA8Y29kZT4mbHQ7Ym9keSZndDs8L2NvZGU+IGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIDxlbT5Ib3cgY29vbCBpcyB0aGF0PzwvZW0+PC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vTnZFV3g5ei5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+WW91IGNhbiBub3cgdmlzaXQgPGNvZGU+bG9jYWxob3N0OjMwMDA8L2NvZGU+IHdpdGggeW91ciBmYXZvcml0ZSB3ZWIgYnJvd3NlciBhbmQgeW91JiMzOTtsbCBub3RpY2UgdGhhdCB0aGUgdmlldyByZW5kZXJzIGFzIHlvdSYjMzk7ZCBleHBlY3QuIFRoZSB0aXRsZSB3aWxsIGJlIHByb3Blcmx5IHNldCwgYW5kIGEgPGNvZGU+Jmx0O21haW4mZ3Q7PC9jb2RlPiBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgY29udGVudHMgb2YgeW91ciB2aWV3LjwvcD5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL0xnWlJGbjUucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBhcHBsaWNhdGlvbiBydW5uaW5nIG9uIEdvb2dsZSBDaHJvbWVcXFwiPjwvcD5cXG48cD5UaGF0JiMzOTtzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJiMzOTtzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIDxjb2RlPm5leHQ8L2NvZGU+IHRvIHJlbmRlciB0aGUgdmlldy48L3A+XFxuPHA+VGhlbiB0aGVyZSYjMzk7cyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCYjMzk7cyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9oMT5cXG48cD5Zb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmNoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLjwvcD5cXG48cD5UaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIDxlbT5vciBpZiBpdCBoYXNuJiMzOTt0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzPC9lbT4sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS48L3A+XFxuPHA+U2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSYjMzk7bGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbiYjMzk7cyB3aXJpbmcgPGVtPih0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKTwvZW0+IGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UmIzM5O2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQmIzM5O3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLjwvcD5cXG48cD5BcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UmIzM5O2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2g0PlxcbjxwPlRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCA8Y29kZT5qYWR1bTwvY29kZT4gZWFybGllciwgd2UmIzM5O2xsIGluc3RhbGwgdGhlIDxjb2RlPnRhdW51czwvY29kZT4gQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgLS1nbG9iYWwgdGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJlZm9yZSB5b3UgY2FuIHVzZSB0aGUgQ0xJLCB5b3Ugc2hvdWxkIG1vdmUgdGhlIHJvdXRlIGRlZmluaXRpb25zIHRvIDxjb2RlPmNvbnRyb2xsZXJzL3JvdXRlcy5qczwvY29kZT4uIFRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgdGhlbSB0byBiZS4gSWYgeW91IHdhbnQgdG8gcGxhY2UgdGhlbSBzb21ldGhpbmcgZWxzZSwgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uIGNhbiBoZWxwIHlvdTwvYT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm12IHJvdXRlcy5qcyBjb250cm9sbGVycy9yb3V0ZXMuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2UgeW91IG1vdmVkIHRoZSByb3V0ZXMgeW91IHNob3VsZCBhbHNvIHVwZGF0ZSB0aGUgPGNvZGU+cmVxdWlyZTwvY29kZT4gc3RhdGVtZW50IGluIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0JiMzOTtsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcuIEluIHR5cGljYWwgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb248L2E+IGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIDxjb2RlPi5iaW4vdmlld3M8L2NvZGU+IGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4sIGJ1dCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24mIzM5O3QgbWVldCB5b3VyIG5lZWRzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXRcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LmJpbi93aXJpbmcuanM8L2NvZGU+IGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIDxjb2RlPnRhdW51czwvY29kZT4gaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCYjMzk7cyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspLFxcbiAgJiMzOTtsYXlvdXQmIzM5OzogcmVxdWlyZSgmIzM5Oy4vdmlld3MvbGF5b3V0LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxufTtcXG5cXG52YXIgcm91dGVzID0gW1xcbiAge1xcbiAgICByb3V0ZTogJiMzOTsvJiMzOTssXFxuICAgIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTtcXG4gIH1cXG5dO1xcblxcbm1vZHVsZS5leHBvcnRzID0ge1xcbiAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICByb3V0ZXM6IHJvdXRlc1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vZklFZTVUbS5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGB0YXVudXNgIG91dHB1dFxcXCI+PC9wPlxcbjxwPk5vdGUgdGhhdCB0aGUgPGNvZGU+Y29udHJvbGxlcnM8L2NvZGU+IG9iamVjdCBpcyBlbXB0eSBiZWNhdXNlIHlvdSBoYXZlbiYjMzk7dCBjcmVhdGVkIGFueSA8ZW0+Y2xpZW50LXNpZGUgY29udHJvbGxlcnM8L2VtPiB5ZXQuIFdlIGNyZWF0ZWQgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgYnV0IHRob3NlIGRvbiYjMzk7dCBoYXZlIGFueSBlZmZlY3QgaW4gdGhlIGNsaWVudC1zaWRlLCBiZXNpZGVzIGRldGVybWluaW5nIHdoYXQgZ2V0cyBzZW50IHRvIHRoZSBjbGllbnQuPC9wPlxcbjxibG9ja3F1b3RlPlxcbjxwPjxzdHJvbmc+VGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZDwvc3Ryb25nPi4gWW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSB3aXJpbmcgbW9kdWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5EdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIDxjb2RlPi0td2F0Y2g8L2NvZGU+IGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG48L2NvZGU+PC9wcmU+XFxuPHA+SWYgeW91JiMzOTtyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91JiMzOTtsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgPGNvZGU+aGFwaWlmeTwvY29kZT4gdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXJcXFwiPkJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvaDQ+XFxuPHA+T25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIDxjb2RlPmNsaWVudC9qczwvY29kZT4gdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0JiMzOTtzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgY2xpZW50L2pzXFxudG91Y2ggY2xpZW50L2pzL21haW4uanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPm1haW48L2NvZGU+IG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIDxlbT5lbnRyeSBwb2ludDwvZW0+IG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSYjMzk7bGwgbmVlZCB0byBpbXBvcnQgPGNvZGU+dGF1bnVzPC9jb2RlPiwgdGhlIHdpcmluZyBtb2R1bGUgd2UmIzM5O3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgd2lyaW5nID0gcmVxdWlyZSgmIzM5Oy4uLy4uLy5iaW4vd2lyaW5nJiMzOTspO1xcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJiMzOTttYWluJiMzOTspWzBdO1xcblxcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLjwvcD5cXG48cD5CeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbiYjMzk7dCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuPC9wPlxcbjxwPkFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIDxlbT50eXBpY2FsbHkgbGFyZ2VyPC9lbT4gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS48L3A+XFxuPHA+QSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCYjMzk7cyBoYXJkZXIgdG8gc2V0IHVwLjwvcD5cXG48cD5UaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj50aGUgb3B0aW1pemF0aW9uIGd1aWRlPC9hPi4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgPGVtPig8Y29kZT4mIzM5O2F1dG8mIzM5OzwvY29kZT4pPC9lbT4gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCYjMzk7cyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+LCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+LCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by48L3A+XFxuPHA+VGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSYjMzk7cmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCYjMzk7cyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJiMzOTt2ZSBiZWVuIGJ1aWxkaW5nLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZVxcbnRvdWNoIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJiMzOTtsbCBqdXN0IHByaW50IHRoZSBhY3Rpb24gYW5kIHRoZSBtb2RlbCB0byB0aGUgY29uc29sZS4gSWYgdGhlcmUmIzM5O3Mgb25lIHBsYWNlIHdoZXJlIHlvdSYjMzk7ZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCwgY29udGFpbmVyLCByb3V0ZSkge1xcbiAgY29uc29sZS5sb2coJiMzOTtSZW5kZXJlZCB2aWV3ICVzIHVzaW5nIG1vZGVsOlxcXFxuJXMmIzM5Oywgcm91dGUuYWN0aW9uLCBKU09OLnN0cmluZ2lmeShtb2RlbCwgbnVsbCwgMikpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlIHdlcmVuJiMzOTt0IHVzaW5nIHRoZSA8Y29kZT4tLXdhdGNoPC9jb2RlPiBmbGFnIGZyb20gdGhlIFRhdW51cyBDTEksIHlvdSYjMzk7bGwgaGF2ZSB0byByZWNvbXBpbGUgdGhlIHdpcmluZyBhdCB0aGlzIHBvaW50LCBzbyB0aGF0IHRoZSBjb250cm9sbGVyIGdldHMgYWRkZWQgdG8gdGhhdCBtYW5pZmVzdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9mIGNvdXJzZSwgeW91JiMzOTtsbCBub3cgaGF2ZSB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IHVzaW5nIDxhIGhyZWY9XFxcImh0dHA6Ly9icm93c2VyaWZ5Lm9yZy9cXFwiPkJyb3dzZXJpZnk8L2E+ITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNvbXBpbGluZy15b3VyLWNsaWVudC1zaWRlLWphdmFzY3JpcHRcXFwiPkNvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQ8L2g0PlxcbjxwPllvdSYjMzk7bGwgbmVlZCB0byBjb21waWxlIHRoZSA8Y29kZT5jbGllbnQvanMvbWFpbi5qczwvY29kZT4gbW9kdWxlLCBvdXIgY2xpZW50LXNpZGUgYXBwbGljYXRpb24mIzM5O3MgZW50cnkgcG9pbnQsIHVzaW5nIEJyb3dzZXJpZnkgc2luY2UgdGhlIGNvZGUgaXMgd3JpdHRlbiB1c2luZyBDb21tb25KUy4gSW4gdGhpcyBleGFtcGxlIHlvdSYjMzk7bGwgaW5zdGFsbCA8Y29kZT5icm93c2VyaWZ5PC9jb2RlPiBnbG9iYWxseSB0byBjb21waWxlIHRoZSBjb2RlLCBidXQgbmF0dXJhbGx5IHlvdSYjMzk7bGwgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4gd29ya2luZyBvbiBhIHJlYWwtd29ybGQgYXBwbGljYXRpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC0tZ2xvYmFsIGJyb3dzZXJpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+T25jZSB5b3UgaGF2ZSB0aGUgQnJvd3NlcmlmeSBDTEksIHlvdSYjMzk7bGwgYmUgYWJsZSB0byBjb21waWxlIHRoZSBjb2RlIHJpZ2h0IGZyb20geW91ciBjb21tYW5kIGxpbmUuIFRoZSA8Y29kZT4tZDwvY29kZT4gZmxhZyB0ZWxscyBCcm93c2VyaWZ5IHRvIGFkZCBhbiBpbmxpbmUgc291cmNlIG1hcCBpbnRvIHRoZSBjb21waWxlZCBidW5kbGUsIG1ha2luZyBkZWJ1Z2dpbmcgZWFzaWVyIGZvciB1cy4gVGhlIDxjb2RlPi1vPC9jb2RlPiBmbGFnIHJlZGlyZWN0cyBvdXRwdXQgdG8gdGhlIGluZGljYXRlZCBmaWxlLCB3aGVyZWFzIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCB0byBzdGFuZGFyZCBvdXRwdXQgYnkgZGVmYXVsdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgLmJpbi9wdWJsaWMvanNcXG5icm93c2VyaWZ5IGNsaWVudC9qcy9tYWluLmpzIC1kbyAuYmluL3B1YmxpYy9qcy9hbGwuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+V2UgaGF2ZW4mIzM5O3QgZG9uZSBtdWNoIG9mIGFueXRoaW5nIHdpdGggdGhlIEV4cHJlc3MgYXBwbGljYXRpb24sIHNvIHlvdSYjMzk7bGwgbmVlZCB0byBhZGp1c3QgdGhlIDxjb2RlPmFwcC5qczwvY29kZT4gbW9kdWxlIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMuIElmIHlvdSYjMzk7cmUgdXNlZCB0byBFeHByZXNzLCB5b3UmIzM5O2xsIG5vdGljZSB0aGVyZSYjMzk7cyBub3RoaW5nIHNwZWNpYWwgYWJvdXQgaG93IHdlJiMzOTtyZSB1c2luZyA8Y29kZT5zZXJ2ZS1zdGF0aWM8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLXNhdmUgc2VydmUtc3RhdGljXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxldCYjMzk7cyBjb25maWd1cmUgdGhlIGFwcGxpY2F0aW9uIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMgZnJvbSA8Y29kZT4uYmluL3B1YmxpYzwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIHNlcnZlU3RhdGljID0gcmVxdWlyZSgmIzM5O3NlcnZlLXN0YXRpYyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG5hcHAudXNlKHNlcnZlU3RhdGljKCYjMzk7LmJpbi9wdWJsaWMmIzM5OykpO1xcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgdXAsIHlvdSYjMzk7bGwgaGF2ZSB0byBlZGl0IHRoZSBsYXlvdXQgdG8gaW5jbHVkZSB0aGUgY29tcGlsZWQgSmF2YVNjcmlwdCBidW5kbGUgZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj50aXRsZT1tb2RlbC50aXRsZVxcbm1haW4hPXBhcnRpYWxcXG5zY3JpcHQoc3JjPSYjMzk7L2pzL2FsbC5qcyYjMzk7KVxcbjwvY29kZT48L3ByZT5cXG48cD5MYXN0bHksIHlvdSBjYW4gZXhlY3V0ZSB0aGUgYXBwbGljYXRpb24gYW5kIHNlZSBpdCBpbiBhY3Rpb24hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vNjhPODR3WC5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+SWYgeW91IG9wZW4gdGhlIGFwcGxpY2F0aW9uIG9uIGEgd2ViIGJyb3dzZXIsIHlvdSYjMzk7bGwgbm90aWNlIHRoYXQgdGhlIGFwcHJvcHJpYXRlIGluZm9ybWF0aW9uIHdpbGwgYmUgbG9nZ2VkIGludG8gdGhlIGRldmVsb3BlciA8Y29kZT5jb25zb2xlPC9jb2RlPi48L3A+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9aVUY2TkZsLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggdGhlIGFwcGxpY2F0aW9uIHJ1bm5pbmcgdW5kZXIgR29vZ2xlIENocm9tZVxcXCI+PC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9oND5cXG48cD5UYXVudXMgZG9lcyBwcm92aWRlIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmEgdGhpbiBBUEk8L2E+IGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSYjMzk7cyBhIGZldyBtZXRob2RzIHlvdSBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygb24gYSBnbG9iYWwgc2NhbGUgYXMgd2VsbC48L3A+XFxuPHA+VGF1bnVzIGNhbiBub3RpZnkgeW91IHdoZW5ldmVyIGltcG9ydGFudCBldmVudHMgb2NjdXIuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5FdmVudDwvdGg+XFxuPHRoPkFyZ3VtZW50czwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5zdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZG9uZSYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBkYXRhPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5hYm9ydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5lcnJvciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBlcnI8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5CZXNpZGVzIGV2ZW50cywgdGhlcmUmIzM5O3MgYSBjb3VwbGUgbW9yZSBtZXRob2RzIHlvdSBjYW4gdXNlLiBUaGUgPGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPiBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJiMzOTtzIDxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPiwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCYjMzk7bGwgdGhlbiBpbnZva2UgaXRzIGNvbnRyb2xsZXIuIFlvdSYjMzk7bGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guPC9wPlxcbjxwPkFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmdcXFwiPkNhY2hpbmcgYW5kIFByZWZldGNoaW5nPC9oND5cXG48cD48YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlPC9hPiBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQmIzM5O3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/PC9wPlxcbjxwPldoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIDxjb2RlPnsgY2FjaGU6IHRydWUgfTwvY29kZT4gYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiwgdGhlIGNhY2hpbmcgbGF5ZXIgd2lsbCBtYWtlIHN1cmUgdGhhdCByZXNwb25zZXMgYXJlIGtlcHQgYXJvdW5kIGZvciA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0JiMzOTtsbCBmaXJzdCBhc2sgdGhlIGNhY2hpbmcgbGF5ZXIgZm9yIGEgZnJlc2ggY29weS4gSWYgdGhlIGNhY2hpbmcgbGF5ZXIgZG9lc24mIzM5O3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSA8ZW0+KGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcyk8L2VtPiwgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gYSBudW1iZXIgaW4gc2Vjb25kcyBpbnN0ZWFkIG9mIGp1c3QgPGNvZGU+dHJ1ZTwvY29kZT4uPC9wPlxcbjxwPlNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UmIzM5O3JlIGFsc28gYWJsZSB0byBzZXQgYSA8Y29kZT5jYWNoZTwvY29kZT4gZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgPGNvZGU+Y2FjaGU8L2NvZGU+IHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+SW5kZXhlZERCPC9hPiBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIDxjb2RlPmxvY2FsU3RvcmFnZTwvY29kZT4uIEl0IGhhcyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5zdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0PC9hPiwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCYjMzk7cyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuPC9wPlxcbjxwPlRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSA8ZW0+KHRoZSA8Y29kZT50b3VjaHN0YXJ0PC9jb2RlPiBldmVudCk8L2VtPiwgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuPC9wPlxcbjxwPklmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgPGVtPihwb3NzaWJseSBsaW1pdGVkKTwvZW0+IEludGVybmV0IGNvbm5lY3Rpb24gYmFuZHdpZHRoLjwvcD5cXG48cD5JZiB0aGUgaHVtYW4gY2xpY2tzIG9uIHRoZSBsaW5rIGJlZm9yZSBwcmVmZXRjaGluZyBpcyBjb21wbGV0ZWQsIGhlJiMzOTtsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuPC9wPlxcbjxwPlR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgPGNvZGU+cHJlZmV0Y2g8L2NvZGU+IHRvIDxjb2RlPnRydWU8L2NvZGU+IGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlIE9wdGltaXphdGlvbnM8L2E+IGd1aWRlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2g0PlxcbjxwPldoZW4geW91IGFsdGVyIHlvdXIgdmlld3MsIGNoYW5nZSBjb250cm9sbGVycywgb3IgbW9kaWZ5IHRoZSBtb2RlbHMsIGNoYW5jZXMgYXJlIHRoZSBjbGllbnQtc2lkZSBpcyBnb2luZyB0byBjb21lIGFjcm9zcyBvbmUgb2YgdGhlIGZvbGxvd2luZyBpc3N1ZXMuPC9wPlxcbjx1bD5cXG48bGk+T3V0ZGF0ZWQgdmlldyB0ZW1wbGF0ZSBmdW5jdGlvbnMgaW4gdGhlIGNsaWVudC1zaWRlLCBjYXVzaW5nIG5ldyBtb2RlbHMgdG8gYnJlYWs8L2xpPlxcbjxsaT5PdXRkYXRlZCBjbGllbnQtc2lkZSBjb250cm9sbGVycywgY2F1c2luZyBuZXcgbW9kZWxzIHRvIGJyZWFrIG9yIG1pc3Mgb3V0IG9uIGZ1bmN0aW9uYWxpdHk8L2xpPlxcbjxsaT5PdXRkYXRlZCBtb2RlbHMgaW4gdGhlIGNhY2hlLCBjYXVzaW5nIG5ldyB2aWV3cyBvciBjb250cm9sbGVycyB0byBicmVhazwvbGk+XFxuPC91bD5cXG48cD5WZXJzaW9uaW5nIGhhbmRsZXMgdGhlc2UgaXNzdWVzIGdyYWNlZnVsbHkgb24geW91ciBiZWhhbGYuIFRoZSB3YXkgaXQgd29ya3MgaXMgdGhhdCB3aGVuZXZlciB5b3UgZ2V0IGEgcmVzcG9uc2UgZnJvbSBUYXVudXMsIGEgPGVtPnZlcnNpb24gc3RyaW5nIChjb25maWd1cmVkIG9uIHRoZSBzZXJ2ZXItc2lkZSk8L2VtPiBpcyBpbmNsdWRlZCB3aXRoIGl0LiBJZiB0aGF0IHZlcnNpb24gc3RyaW5nIGRvZXNuJiMzOTt0IG1hdGNoIHRoZSBvbmUgc3RvcmVkIGluIHRoZSBjbGllbnQsIHRoZW4gdGhlIGNhY2hlIHdpbGwgYmUgZmx1c2hlZCBhbmQgdGhlIGh1bWFuIHdpbGwgYmUgcmVkaXJlY3RlZCwgZm9yY2luZyBhIGZ1bGwgcGFnZSByZWxvYWQuPC9wPlxcbjxibG9ja3F1b3RlPlxcbjxwPlRoZSB2ZXJzaW9uaW5nIEFQSSBpcyB1bmFibGUgdG8gaGFuZGxlIGNoYW5nZXMgdG8gcm91dGVzLCBhbmQgaXQmIzM5O3MgdXAgdG8geW91IHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBhcHBsaWNhdGlvbiBzdGF5cyBiYWNrd2FyZHMgY29tcGF0aWJsZSB3aGVuIGl0IGNvbWVzIHRvIHJvdXRpbmcuPC9wPlxcbjxwPlZlcnNpb25pbmcgY2FuJiMzOTt0IGludGVydmVuZSB3aGVuIHRoZSBjbGllbnQtc2lkZSBpcyBoZWF2aWx5IHJlbHlpbmcgb24gY2FjaGVkIHZpZXdzIGFuZCBtb2RlbHMsIGFuZCB0aGUgaHVtYW4gaXMgcmVmdXNpbmcgdG8gcmVsb2FkIHRoZWlyIGJyb3dzZXIuIFRoZSBzZXJ2ZXIgaXNuJiMzOTt0IGJlaW5nIGFjY2Vzc2VkIGFuZCB0aHVzIGl0IGNhbiYjMzk7dCBjb21tdW5pY2F0ZSB0aGF0IGV2ZXJ5dGhpbmcgb24gdGhlIGNhY2hlIG1heSBoYXZlIGJlY29tZSBzdGFsZS4gVGhlIGdvb2QgbmV3cyBpcyB0aGF0IHRoZSBodW1hbiB3b24mIzM5O3Qgbm90aWNlIGFueSBvZGRpdGllcywgYXMgdGhlIHNpdGUgd2lsbCBjb250aW51ZSB0byB3b3JrIGFzIGhlIGtub3dzIGl0LiBXaGVuIGhlIGZpbmFsbHkgYXR0ZW1wdHMgdG8gdmlzaXQgc29tZXRoaW5nIHRoYXQgaXNuJiMzOTt0IGNhY2hlZCwgYSByZXF1ZXN0IGlzIG1hZGUsIGFuZCB0aGUgdmVyc2lvbmluZyBlbmdpbmUgcmVzb2x2ZXMgdmVyc2lvbiBkaXNjcmVwYW5jaWVzIGZvciB0aGVtLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+TWFraW5nIHVzZSBvZiB2ZXJzaW9uaW5nIGludm9sdmVzIHNldHRpbmcgdGhlIDxjb2RlPnZlcnNpb248L2NvZGU+IGZpZWxkIGluIHRoZSBvcHRpb25zLCB3aGVuIGludm9raW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gPHN0cm9uZz5vbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLCB1c2luZyB0aGUgc2FtZSB2YWx1ZTwvc3Ryb25nPi4gVGhlIFRhdW51cyB2ZXJzaW9uIHN0cmluZyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBvbmUgeW91IHByb3ZpZGVkLCBzbyB0aGF0IFRhdW51cyB3aWxsIGtub3cgdG8gc3RheSBhbGVydCBmb3IgY2hhbmdlcyB0byBUYXVudXMgaXRzZWxmLCBhcyB3ZWxsLjwvcD5cXG48cD5Zb3UgbWF5IHVzZSB5b3VyIGJ1aWxkIGlkZW50aWZpZXIgb3IgdGhlIDxjb2RlPnZlcnNpb248L2NvZGU+IGZpZWxkIGluIDxjb2RlPnBhY2thZ2UuanNvbjwvY29kZT4sIGJ1dCB1bmRlcnN0YW5kIHRoYXQgaXQgbWF5IGNhdXNlIHRoZSBjbGllbnQtc2lkZSB0byBmbHVzaCB0aGUgY2FjaGUgdG9vIG9mdGVuIDxlbT4obWF5YmUgZXZlbiBvbiBldmVyeSBkZXBsb3ltZW50KTwvZW0+LjwvcD5cXG48cD5UaGUgZGVmYXVsdCB2ZXJzaW9uIHN0cmluZyBpcyBzZXQgdG8gPGNvZGU+MTwvY29kZT4uIFRoZSBUYXVudXMgdmVyc2lvbiB3aWxsIGJlIHByZXBlbmRlZCB0byB5b3VycywgcmVzdWx0aW5nIGluIGEgdmFsdWUgc3VjaCBhcyA8Y29kZT50My4wLjA7djE8L2NvZGU+IHdoZXJlIFRhdW51cyBpcyBydW5uaW5nIHZlcnNpb24gPGNvZGU+My4wLjA8L2NvZGU+IGFuZCB5b3VyIGFwcGxpY2F0aW9uIGlzIHJ1bm5pbmcgdmVyc2lvbiA8Y29kZT4xPC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvaDE+XFxuPHA+WW91JiMzOTtyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4mIzM5O3Qgc3RvcCB0aGVyZS48L3A+XFxuPHVsPlxcbjxsaT5MZWFybiBtb3JlIGFib3V0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgVGF1bnVzIGhhczwvYT4gdG8gb2ZmZXI8L2xpPlxcbjxsaT5HbyB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPnBlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzPC9hPi4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3ITwvbGk+XFxuPGxpPjxlbT5GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50PC9lbT48dWw+XFxuPGxpPkplcmVteSBLZWl0aCBlbnVuY2lhdGVzIDxhIGhyZWY9XFxcImh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxcIj4mcXVvdDtCZSBwcm9ncmVzc2l2ZSZxdW90OzwvYT48L2xpPlxcbjxsaT5DaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciA8YSBocmVmPVxcXCJodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcXCI+JnF1b3Q7UHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyA8YSBocmVmPVxcXCJodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxcIj4mcXVvdDtQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXImcXVvdDs8L2E+PC9saT5cXG48bGk+SSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+JnF1b3Q7U3RvcCBCcmVha2luZyB0aGUgV2ViJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9yYXVjaGcuY29tLzIwMTQvNy1wcmluY2lwbGVzLW9mLXJpY2gtd2ViLWFwcGxpY2F0aW9ucy9cXFwiPiZxdW90OzcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnMmcXVvdDs8L2E+PC9saT5cXG48bGk+QWFyb24gR3VzdGFmc29uIHdyaXRlcyA8YSBocmVmPVxcXCJodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcXCI+JnF1b3Q7VW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudCZxdW90OzwvYT48L2xpPlxcbjxsaT5PcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIDxhIGhyZWY9XFxcImh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2UmcXVvdDs8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlNpZnQgdGhyb3VnaCB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXM8L2E+LiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJiMzOTt0IHRob3VnaHQgb2YhPC9saT5cXG48L3VsPlxcbjxwPkFsc28sIGdldCBpbnZvbHZlZCE8L3A+XFxuPHVsPlxcbjxsaT5Gb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW8vcHVsbHNcXFwiPnNlbmQgc29tZSBwdWxsIHJlcXVlc3RzPC9hPiB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyE8L2xpPlxcbjxsaT5TZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxcIj5wbGVhc2UgY3JlYXRlIGFuIGlzc3VlPC9hPiE8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+WW91JiMzOTtsbCBmaW5kIGEgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9nZXR0aW5nLXN0YXJ0ZWRcXFwiPmZ1bGwgZmxlZGdlZCB2ZXJzaW9uIG9mIHRoZSBHZXR0aW5nIFN0YXJ0ZWQ8L2E+IHR1dG9yaWFsIGFwcGxpY2F0aW9uIG9uIEdpdEh1Yi48L3A+XFxuPC9ibG9ja3F1b3RlPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgR2V0dGluZyBTdGFydGVkXFxuXFxuICAgIFRhdW51cyBpcyBhIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZSBmb3IgTm9kZS5qcywgYW5kIGl0J3MgX3VwIHRvIHlvdSBob3cgdG8gdXNlIGl0Xy4gSW4gZmFjdCwgaXQgbWlnaHQgYmUgYSBnb29kIGlkZWEgZm9yIHlvdSB0byAqKnNldCB1cCBqdXN0IHRoZSBzZXJ2ZXItc2lkZSBhc3BlY3QgZmlyc3QqKiwgYXMgdGhhdCdsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC5cXG5cXG4gICAgIyBUYWJsZSBvZiBDb250ZW50c1xcblxcbiAgICAtIFtIb3cgaXQgd29ya3NdKCNob3ctaXQtd29ya3MpXFxuICAgIC0gW0luc3RhbGxpbmcgVGF1bnVzXSgjaW5zdGFsbGluZy10YXVudXMpXFxuICAgIC0gW1NldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlXSgjc2V0dGluZy11cC10aGUtc2VydmVyLXNpZGUpXFxuICAgICAgLSBbWW91ciBmaXJzdCByb3V0ZV0oI3lvdXItZmlyc3Qtcm91dGUpXFxuICAgICAgLSBbQ3JlYXRpbmcgYSBsYXlvdXRdKCNjcmVhdGluZy1hLWxheW91dClcXG4gICAgICAtIFtVc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmVdKCN1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmUpXFxuICAgICAgLSBbVGhyb3dpbmcgaW4gYSBjb250cm9sbGVyXSgjdGhyb3dpbmctaW4tYS1jb250cm9sbGVyKVxcbiAgICAtIFtUYXVudXMgaW4gdGhlIGNsaWVudF0oI3RhdW51cy1pbi10aGUtY2xpZW50KVxcbiAgICAgIC0gW1VzaW5nIHRoZSBUYXVudXMgQ0xJXSgjdXNpbmctdGhlLXRhdW51cy1jbGkpXFxuICAgICAgLSBbQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXSgjYm9vdGluZy11cC10aGUtY2xpZW50LXNpZGUtcm91dGVyKVxcbiAgICAgIC0gW0FkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcl0oI2FkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlcilcXG4gICAgICAtIFtDb21waWxpbmcgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0XSgjY29tcGlsaW5nLXlvdXItY2xpZW50LXNpZGUtamF2YXNjcmlwdClcXG4gICAgICAtIFtVc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSV0oI3VzaW5nLXRoZS1jbGllbnQtc2lkZS10YXVudXMtYXBpKVxcbiAgICAgIC0gW0NhY2hpbmcgYW5kIFByZWZldGNoaW5nXSgjY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmcpXFxuICAgICAgLSBbVmVyc2lvbmluZ10oI3ZlcnNpb25pbmcpXFxuICAgIC0gW1RoZSBza3kgaXMgdGhlIGxpbWl0IV0oI3RoZS1za3ktaXMtdGhlLWxpbWl0LSlcXG5cXG4gICAgIyBIb3cgaXQgd29ya3NcXG5cXG4gICAgVGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0ICoqcHJvdmVuKiogc2V0IG9mIHJ1bGVzLlxcblxcbiAgICAtIERlZmluZSBhIGBmdW5jdGlvbihtb2RlbClgIGZvciBlYWNoIHlvdXIgdmlld3NcXG4gICAgLSBQdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50XFxuICAgIC0gRGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvblxcbiAgICAtIFB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50XFxuICAgIC0gRW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzXFxuICAgIC0gQ3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzXFxuICAgIC0gQ3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3XFxuICAgIC0gRm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZVxcbiAgICAtIFdoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhXFxuICAgIC0gT25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgKipoaWphY2sgbGluayBjbGlja3MqKiBhbmQgbWFrZSBBSkFYIHJlcXVlc3RzIGluc3RlYWRcXG4gICAgLSBXaGVuIHlvdSBnZXQgdGhlIEpTT04gbW9kZWwgYmFjaywgcmVuZGVyIHZpZXdzIG9uIHRoZSBjbGllbnQtc2lkZVxcbiAgICAtIElmIHRoZSBgaGlzdG9yeWAgQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gKipEb24ndCBjb25mdXNlIHlvdXIgaHVtYW5zIHdpdGggb2JzY3VyZSBoYXNoIHJvdXRlcnMhKipcXG5cXG4gICAgSSdsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJ2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIHN0ZXBzIHlvdSBuZWVkIHRvIHRha2UgaW4gb3JkZXIgdG8gbWFrZSB0aGlzIGZsb3cgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIEluc3RhbGxpbmcgVGF1bnVzXFxuXFxuICAgIEZpcnN0IG9mZiwgeW91J2xsIG5lZWQgdG8gY2hvb3NlIGEgSFRUUCBzZXJ2ZXIgZnJhbWV3b3JrIGZvciB5b3VyIGFwcGxpY2F0aW9uLiBBdCB0aGUgbW9tZW50IFRhdW51cyBzdXBwb3J0cyBvbmx5IGEgY291cGxlIG9mIEhUVFAgZnJhbWV3b3JrcywgYnV0IG1vcmUgbWF5IGJlIGFkZGVkIGlmIHRoZXkgYXJlIHBvcHVsYXIgZW5vdWdoLlxcblxcbiAgICAtIFtFeHByZXNzXVs2XSwgdGhyb3VnaCBbdGF1bnVzLWV4cHJlc3NdWzFdXFxuICAgIC0gW0hhcGldWzddLCB0aHJvdWdoIFt0YXVudXMtaGFwaV1bMl0gYW5kIHRoZSBbaGFwaWlmeV1bM10gdHJhbnNmb3JtXFxuXFxuICAgID4gSWYgeW91J3JlIG1vcmUgb2YgYSBfXFxcInJ1bW1hZ2UgdGhyb3VnaCBzb21lb25lIGVsc2UncyBjb2RlXFxcIl8gdHlwZSBvZiBkZXZlbG9wZXIsIHlvdSBtYXkgZmVlbCBjb21mb3J0YWJsZSBbZ29pbmcgdGhyb3VnaCB0aGlzIHdlYnNpdGUncyBzb3VyY2UgY29kZV1bNF0sIHdoaWNoIHVzZXMgdGhlIFtIYXBpXVs3XSBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIFtwb255Zm9vLmNvbV1bNV0sIHdoaWNoIGlzICoqYSBtb3JlIGFkdmFuY2VkIHVzZS1jYXNlKiogdW5kZXIgdGhlIFtFeHByZXNzXVs2XSBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0J3Mgb2theSB0b28uXFxuICAgID5cXG4gICAgPiBUaGVyZSdzIGFsc28gW2EgWWVvbWFuIGdlbmVyYXRvciBuYW1lZCBgZ2VuZXJhdG9yLXRhdW51c2BdWzQyXSB5b3UgY291bGQgdXNlIHRvIGdldCBzdGFydGVkLCBpbnN0ZWFkLlxcblxcbiAgICBPbmNlIHlvdSd2ZSBzZXR0bGVkIGZvciBlaXRoZXIgW0V4cHJlc3NdWzZdIG9yIFtIYXBpXVs3XSB5b3UnbGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJ2xsIHVzZSBbRXhwcmVzc11bNl0uIFN3aXRjaGluZyBiZXR3ZWVuIG9uZSBvZiB0aGUgZGlmZmVyZW50IEhUVFAgZmxhdm9ycyBpcyBzdHJpa2luZ2x5IGVhc3ksIHRob3VnaC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBTZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZVxcblxcbiAgICBOYXR1cmFsbHksIHlvdSdsbCBuZWVkIHRvIGluc3RhbGwgYWxsIG9mIHRoZSBmb2xsb3dpbmcgbW9kdWxlcyBmcm9tIGBucG1gIHRvIGdldCBzdGFydGVkLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciBnZXR0aW5nLXN0YXJ0ZWRcXG4gICAgY2QgZ2V0dGluZy1zdGFydGVkXFxuICAgIG5wbSBpbml0XFxuICAgIG5wbSBpbnN0YWxsIC0tc2F2ZSB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzc1xcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5wbSBpbml0YCBvdXRwdXRdWzMwXVxcblxcbiAgICBMZXQncyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZW0gYXMgd2UgZ28gYWxvbmcuIEZpcnN0IG9mIGFsbCwgeW91J2xsIG5lZWQgdGhlIGZhbW91cyBgYXBwLmpzYCBmaWxlLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBhcHAuanNcXG4gICAgYGBgXFxuXFxuICAgIEl0J3MgcHJvYmFibHkgYSBnb29kIGlkZWEgdG8gcHV0IHNvbWV0aGluZyBpbiB5b3VyIGBhcHAuanNgIGZpbGUsIGxldCdzIGRvIHRoYXQgbm93LlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBBbGwgYHRhdW51cy1leHByZXNzYCByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIGBhcHBgLiBZb3Ugc2hvdWxkIG5vdGUgdGhhdCBhbnkgbWlkZGxld2FyZSBhbmQgQVBJIHJvdXRlcyBzaG91bGQgcHJvYmFibHkgY29tZSBiZWZvcmUgdGhlIGB0YXVudXNFeHByZXNzYCBpbnZvY2F0aW9uLiBZb3UnbGwgcHJvYmFibHkgYmUgdXNpbmcgYSBjYXRjaC1hbGwgdmlldyByb3V0ZSB0aGF0IHJlbmRlcnMgYSBfXFxcIk5vdCBGb3VuZFxcXCJfIHZpZXcsIGJsb2NraW5nIGFueSByb3V0aW5nIGJleW9uZCB0aGF0IHJvdXRlLlxcblxcbiAgICBJZiB5b3Ugd2VyZSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIG5vdyB5b3Ugd291bGQgZ2V0IGEgZnJpZW5kbHkgcmVtaW5lZCBmcm9tIFRhdW51cyBsZXR0aW5nIHlvdSBrbm93IHRoYXQgeW91IGZvcmdvdCB0byBkZWNsYXJlIGFueSB2aWV3IHJvdXRlcy4gU2lsbHkgeW91IVxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzMxXVxcblxcbiAgICBUaGUgYG9wdGlvbnNgIG9iamVjdCBwYXNzZWQgdG8gYHRhdW51c0V4cHJlc3NgIGxldCdzIHlvdSBjb25maWd1cmUgVGF1bnVzLiBJbnN0ZWFkIG9mIGRpc2N1c3NpbmcgZXZlcnkgc2luZ2xlIGNvbmZpZ3VyYXRpb24gb3B0aW9uIHlvdSBjb3VsZCBzZXQgaGVyZSwgbGV0J3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSBfcmVxdWlyZWQgY29uZmlndXJhdGlvbl8uIFRoZXJlJ3MgdHdvIG9wdGlvbnMgdGhhdCB5b3UgbXVzdCBzZXQgaWYgeW91IHdhbnQgeW91ciBUYXVudXMgYXBwbGljYXRpb24gdG8gbWFrZSBhbnkgc2Vuc2UuXFxuXFxuICAgIC0gYHJvdXRlc2Agc2hvdWxkIGJlIGFuIGFycmF5IG9mIHZpZXcgcm91dGVzXFxuICAgIC0gYGxheW91dGAgc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSBgbW9kZWxgIGFyZ3VtZW50IGFuZCByZXR1cm5zIGFuIGVudGlyZSBIVE1MIGRvY3VtZW50XFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgWW91ciBmaXJzdCByb3V0ZVxcblxcbiAgICBSb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gKip3aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZyoqLiBMZXQncyBjcmVhdGUgdGhhdCBtb2R1bGUgYW5kIGFkZCBhIHJvdXRlIHRvIGl0LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCByb3V0ZXMuanNcXG4gICAgYGBgXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBbXFxuICAgICAgeyByb3V0ZTogJy8nLCBhY3Rpb246ICdob21lL2luZGV4JyB9XFxuICAgIF07XFxuICAgIGBgYFxcblxcbiAgICBFYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSBgL2Agcm91dGUgd2l0aCB0aGUgYGhvbWUvaW5kZXhgIGFjdGlvbi4gVGF1bnVzIGZvbGxvd3MgdGhlIHdlbGwga25vd24gW2NvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm5dWzhdLCB3aGljaCBtYWRlIFtSdWJ5IG9uIFJhaWxzXVs5XSBmYW1vdXMuIF9NYXliZSBvbmUgZGF5IFRhdW51cyB3aWxsIGJlIGZhbW91cyB0b28hXyBCeSBjb252ZW50aW9uLCBUYXVudXMgd2lsbCBhc3N1bWUgdGhhdCB0aGUgYGhvbWUvaW5kZXhgIGFjdGlvbiB1c2VzIHRoZSBgaG9tZS9pbmRleGAgY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgYGhvbWUvaW5kZXhgIHZpZXcuIE9mIGNvdXJzZSwgX2FsbCBvZiB0aGF0IGNhbiBiZSBjaGFuZ2VkIHVzaW5nIGNvbmZpZ3VyYXRpb25fLlxcblxcbiAgICBUaW1lIHRvIGdvIGJhY2sgdG8gYGFwcC5qc2AgYW5kIHVwZGF0ZSB0aGUgYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9yb3V0ZXMnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIEl0J3MgaW1wb3J0YW50IHRvIGtub3cgdGhhdCBpZiB5b3Ugb21pdCB0aGUgY3JlYXRpb24gb2YgYSBjb250cm9sbGVyIHRoZW4gVGF1bnVzIHdpbGwgc2tpcCB0aGF0IHN0ZXAsIGFuZCByZW5kZXIgdGhlIHZpZXcgcGFzc2luZyBpdCB3aGF0ZXZlciB0aGUgZGVmYXVsdCBtb2RlbCBpcyBfKG1vcmUgb24gdGhhdCBbaW4gdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0sIGJ1dCBpdCBkZWZhdWx0cyB0byBge31gKV8uXFxuXFxuICAgIEhlcmUncyB3aGF0IHlvdSdkIGdldCBpZiB5b3UgYXR0ZW1wdGVkIHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYXQgdGhpcyBwb2ludC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBjdXJsIGxvY2FsaG9zdDozMDAwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIHJlc3VsdHNdWzMyXVxcblxcbiAgICBUdXJucyBvdXQgeW91J3JlIG1pc3NpbmcgYSBsb3Qgb2YgdGhpbmdzISBUYXVudXMgaXMgcXVpdGUgbGVuaWVudCBhbmQgaXQnbGwgdHJ5IGl0cyBiZXN0IHRvIGxldCB5b3Uga25vdyB3aGF0IHlvdSBtaWdodCBiZSBtaXNzaW5nLCB0aG91Z2guIEFwcGFyZW50bHkgeW91IGRvbid0IGhhdmUgYSBsYXlvdXQsIGEgc2VydmVyLXNpZGUgY29udHJvbGxlciwgb3IgZXZlbiBhIHZpZXchIF9UaGF0J3Mgcm91Z2guX1xcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENyZWF0aW5nIGEgbGF5b3V0XFxuXFxuICAgIExldCdzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQnbGwganVzdCBiZSBhIHBsYWluIEphdmFTY3JpcHQgZnVuY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGxheW91dC5qc1xcbiAgICBgYGBcXG5cXG4gICAgTm90ZSB0aGF0IHRoZSBgcGFydGlhbGAgcHJvcGVydHkgaW4gdGhlIGBtb2RlbGAgXyhhcyBzZWVuIGJlbG93KV8gaXMgY3JlYXRlZCBvbiB0aGUgZmx5IGFmdGVyIHJlbmRlcmluZyBwYXJ0aWFsIHZpZXdzLiBUaGUgbGF5b3V0IGZ1bmN0aW9uIHdlJ2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgX1xcXCJ1c2UgdGhlIGZvbGxvd2luZyBjb21iaW5hdGlvbiBvZiBwbGFpbiB0ZXh0IGFuZCB0aGUgKioobWF5YmUgSFRNTCkqKiBwYXJ0aWFsIHZpZXdcXFwiXy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgICAgIHJldHVybiAnVGhpcyBpcyB0aGUgcGFydGlhbDogXFxcIicgKyBtb2RlbC5wYXJ0aWFsICsgJ1xcXCInO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJ3Qgd2FudCB0byB3cml0ZSB2aWV3cyBhcyBKYXZhU2NyaXB0IGZ1bmN0aW9ucyBhcyB0aGF0J3MgdW5wcm9kdWN0aXZlLCBjb25mdXNpbmcsIGFuZCBoYXJkIHRvIG1haW50YWluLiBXaGF0IHlvdSBjb3VsZCBkbyBpbnN0ZWFkLCBpcyB1c2UgYSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCBhbGxvd3MgeW91IHRvIGNvbXBpbGUgeW91ciB2aWV3IHRlbXBsYXRlcyBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLlxcblxcbiAgICAtIFtNdXN0YWNoZV1bMTBdIGlzIGEgdGVtcGxhdGluZyBlbmdpbmUgdGhhdCBjYW4gY29tcGlsZSB5b3VyIHZpZXdzIGludG8gcGxhaW4gZnVuY3Rpb25zLCB1c2luZyBhIHN5bnRheCB0aGF0J3MgbWluaW1hbGx5IGRpZmZlcmVudCBmcm9tIEhUTUxcXG4gICAgLSBbSmFkZV1bMTFdIGlzIGFub3RoZXIgb3B0aW9uLCBhbmQgaXQgaGFzIGEgdGVyc2Ugc3ludGF4IHdoZXJlIHNwYWNpbmcgbWF0dGVycyBidXQgdGhlcmUncyBubyBjbG9zaW5nIHRhZ3NcXG4gICAgLSBUaGVyZSdzIG1hbnkgbW9yZSBhbHRlcm5hdGl2ZXMgbGlrZSBbTW96aWxsYSdzIE51bmp1Y2tzXVsxMl0sIFtIYW5kbGViYXJzXVsxM10sIGFuZCBbRUpTXVsxNF0uXFxuXFxuICAgIFJlbWVtYmVyIHRvIGFkZCB0aGUgYGxheW91dGAgdW5kZXIgdGhlIGBvcHRpb25zYCBvYmplY3QgcGFzc2VkIHRvIGB0YXVudXNFeHByZXNzYCFcXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBIZXJlJ3Mgd2hhdCB5b3UnZCBnZXQgaWYgeW91IHJhbiB0aGUgYXBwbGljYXRpb24gYXQgdGhpcyBwb2ludC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBjdXJsIGxvY2FsaG9zdDozMDAwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzNdXFxuXFxuICAgIEF0IHRoaXMgcG9pbnQgd2UgaGF2ZSBhIGxheW91dCwgYnV0IHdlJ3JlIHN0aWxsIG1pc3NpbmcgdGhlIHBhcnRpYWwgdmlldyBhbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIuIFdlIGNhbiBkbyB3aXRob3V0IHRoZSBjb250cm9sbGVyLCBidXQgaGF2aW5nIG5vIHZpZXdzIGlzIGtpbmQgb2YgcG9pbnRsZXNzIHdoZW4geW91J3JlIHRyeWluZyB0byBnZXQgYW4gTVZDIGVuZ2luZSB1cCBhbmQgcnVubmluZywgcmlnaHQ/XFxuXFxuICAgIFlvdSdsbCBmaW5kIHRvb2xzIHJlbGF0ZWQgdG8gdmlldyB0ZW1wbGF0aW5nIGluIHRoZSBbY29tcGxlbWVudGFyeSBtb2R1bGVzIHNlY3Rpb25dWzE1XS4gSWYgeW91IGRvbid0IHByb3ZpZGUgYSBgbGF5b3V0YCBwcm9wZXJ0eSBhdCBhbGwsIFRhdW51cyB3aWxsIHJlbmRlciB5b3VyIG1vZGVsIGluIGEgcmVzcG9uc2UgYnkgd3JhcHBpbmcgaXQgaW4gYDxwcmU+YCBhbmQgYDxjb2RlPmAgdGFncywgd2hpY2ggbWF5IGFpZCB5b3Ugd2hlbiBnZXR0aW5nIHN0YXJ0ZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lXFxuXFxuICAgIExldCdzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCB2aWV3cy9ob21lXFxuICAgIHRvdWNoIHZpZXdzL2hvbWUvaW5kZXguamFkZVxcbiAgICBgYGBcXG5cXG4gICAgU2luY2Ugd2UncmUganVzdCBnZXR0aW5nIHN0YXJ0ZWQsIHRoZSB2aWV3IHdpbGwganVzdCBoYXZlIHNvbWUgYmFzaWMgc3RhdGljIGNvbnRlbnQsIGFuZCB0aGF0J3MgaXQuXFxuXFxuICAgIGBgYGphZGVcXG4gICAgcCBIZWxsbyBUYXVudXMhXFxuICAgIGBgYFxcblxcbiAgICBOZXh0IHlvdSdsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIFtqYWR1bV1bMTZdLCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIGByZXF1aXJlYCBzdGF0ZW1lbnRzLCBhbmQgdGh1cyBzYXZpbmcgYnl0ZXMgd2hlbiBpdCBjb21lcyB0byBjbGllbnQtc2lkZSByZW5kZXJpbmcuIExldCdzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIF8oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UncmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24pXy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLS1nbG9iYWwgamFkdW1cXG4gICAgYGBgXFxuXFxuICAgIFRvIGNvbXBpbGUgZXZlcnkgdmlldyBpbiB0aGUgYHZpZXdzYCBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgYC0tb3V0cHV0YCBmbGFnIGluZGljYXRlcyB3aGVyZSB5b3Ugd2FudCB0aGUgdmlld3MgdG8gYmUgcGxhY2VkLiBXZSBjaG9zZSB0byB1c2UgYC5iaW5gIGJlY2F1c2UgdGhhdCdzIHdoZXJlIFRhdW51cyBleHBlY3RzIHlvdXIgY29tcGlsZWQgdmlld3MgdG8gYmUgYnkgZGVmYXVsdC4gQnV0IHNpbmNlIFRhdW51cyBmb2xsb3dzIHRoZSBbY29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb25dWzE3XSBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIGphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG4gICAgYGBgXFxuXFxuICAgIENvbmdyYXR1bGF0aW9ucyEgWW91ciBmaXJzdCB2aWV3IGlzIG5vdyBvcGVyYXRpb25hbCBhbmQgYnVpbHQgdXNpbmcgYSBmdWxsLWZsZWRnZWQgdGVtcGxhdGluZyBlbmdpbmUhIEFsbCB0aGF0J3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgYDMwMDBgLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcCAmXFxuICAgIG9wZW4gaHR0cDovL2xvY2FsaG9zdDozMDAwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzRdXFxuXFxuICAgIEdyYW50ZWQsIHlvdSBzaG91bGQgX3Byb2JhYmx5XyBtb3ZlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgXyhhbnkgdmlldyBlbmdpbmUgd2lsbCBkbylfIHRlbXBsYXRlIGFzIHdlbGwuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVGhyb3dpbmcgaW4gYSBjb250cm9sbGVyXFxuXFxuICAgIENvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24ndCBnZXQgeW91IHZlcnkgZmFyLiBDb250cm9sbGVycyBhbGxvdyB5b3UgdG8gaGFuZGxlIHRoZSByZXF1ZXN0IGFuZCBwdXQgdG9nZXRoZXIgdGhlIG1vZGVsIHRvIGJlIHVzZWQgd2hlbiBzZW5kaW5nIGEgcmVzcG9uc2UuIENvbnRyYXJ5IHRvIHdoYXQgbW9zdCBmcmFtZXdvcmtzIHByb3Bvc2UsIFRhdW51cyBleHBlY3RzIGV2ZXJ5IGFjdGlvbiB0byBoYXZlIGl0cyBvd24gaW5kaXZpZHVhbCBjb250cm9sbGVyLiBTaW5jZSBOb2RlLmpzIG1ha2VzIGl0IGVhc3kgdG8gaW1wb3J0IGNvbXBvbmVudHMsIHRoaXMgc2V0dXAgaGVscHMgeW91IGtlZXAgeW91ciBjb2RlIG1vZHVsYXIgd2hpbGUgc3RpbGwgYmVpbmcgYWJsZSB0byByZXVzZSBsb2dpYyBieSBzaGFyaW5nIG1vZHVsZXMgYWNyb3NzIGRpZmZlcmVudCBjb250cm9sbGVycy4gTGV0J3MgY3JlYXRlIGEgY29udHJvbGxlciBmb3IgdGhlIGBob21lL3ZpZXdgIGFjdGlvbi5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgY29udHJvbGxlcnMvaG9tZVxcbiAgICB0b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuICAgIGBgYFxcblxcbiAgICBUaGUgY29udHJvbGxlciBtb2R1bGUgc2hvdWxkIG1lcmVseSBleHBvcnQgYSBmdW5jdGlvbi4gX1N0YXJ0ZWQgbm90aWNpbmcgdGhlIHBhdHRlcm4/XyBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gW0V4cHJlc3NdWzZdIF8ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIFtIYXBpXVs3XSBpbiB0aGUgY2FzZSBvZiBgdGF1bnVzLWhhcGlgKV8uXFxuXFxuICAgIEFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbid0IGV2ZW4gc2V0IGEgZG9jdW1lbnQgdGl0bGUgZm9yIHlvdXIgSFRNTCBwYWdlcyEgVHVybnMgb3V0LCB0aGVyZSdzIGEgZmV3IG1vZGVsIHByb3BlcnRpZXMgXyh2ZXJ5IGZldylfIHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIGB0aXRsZWAgcHJvcGVydHksIGFuZCBpdCdsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgYGRvY3VtZW50LnRpdGxlYCBpbiB5b3VyIHBhZ2VzIHdoZW4gbmF2aWdhdGluZyB0aHJvdWdoIHRoZSBjbGllbnQtc2lkZS4gS2VlcCBpbiBtaW5kIHRoYXQgYW55dGhpbmcgdGhhdCdzIG5vdCBpbiB0aGUgYG1vZGVsYCBwcm9wZXJ0eSB3b24ndCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LlxcblxcbiAgICBIZXJlIGlzIG91ciBuZXdmYW5nbGVkIGBob21lL2luZGV4YCBjb250cm9sbGVyLiBBcyB5b3UnbGwgbm90aWNlLCBpdCBkb2Vzbid0IGRpc3J1cHQgYW55IG9mIHRoZSB0eXBpY2FsIEV4cHJlc3MgZXhwZXJpZW5jZSwgYnV0IG1lcmVseSBidWlsZHMgdXBvbiBpdC4gV2hlbiBgbmV4dGAgaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byBgcmVzLnZpZXdNb2RlbGAuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gICAgICByZXMudmlld01vZGVsID0ge1xcbiAgICAgICAgbW9kZWw6IHtcXG4gICAgICAgICAgdGl0bGU6ICdXZWxjb21lIEhvbWUsIFRhdW51cyEnXFxuICAgICAgICB9XFxuICAgICAgfTtcXG4gICAgICBuZXh0KCk7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSBfd291bGRuJ3QgYmUgcHJvZ3Jlc3NpdmVfLCBhbmQgdGh1cyBbaXQgd291bGQgYmUgcmVhbGx5LCBfcmVhbGx5XyBiYWRdWzE3XS4gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgbGF5b3V0IHRvIHVzZSB3aGF0ZXZlciBgdGl0bGVgIGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCdzIGdvIGJhY2sgdG8gdGhlIGRyYXdpbmcgYm9hcmQgYW5kIG1ha2UgdGhlIGxheW91dCBpbnRvIGEgSmFkZSB0ZW1wbGF0ZSFcXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgcm0gbGF5b3V0LmpzXFxuICAgIHRvdWNoIHZpZXdzL2xheW91dC5qYWRlXFxuICAgIGphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG4gICAgYGBgXFxuXFxuICAgIFlvdSBzaG91bGQgYWxzbyByZW1lbWJlciB0byB1cGRhdGUgdGhlIGBhcHAuanNgIG1vZHVsZSBvbmNlIGFnYWluIVxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL3JvdXRlcycpLFxcbiAgICAgIGxheW91dDogcmVxdWlyZSgnLi8uYmluL3ZpZXdzL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGAhPWAgc3ludGF4IGJlbG93IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbid0IGJlIGVzY2FwZWQuIFRoYXQncyBva2F5IGJlY2F1c2UgYHBhcnRpYWxgIGlzIGEgdmlldyB3aGVyZSBKYWRlIGVzY2FwZWQgYW55dGhpbmcgdGhhdCBuZWVkZWQgZXNjYXBpbmcsIGJ1dCB3ZSB3b3VsZG4ndCB3YW50IEhUTUwgdGFncyB0byBiZSBlc2NhcGVkIVxcblxcbiAgICBgYGBqYWRlXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1haW4hPXBhcnRpYWxcXG4gICAgYGBgXFxuXFxuICAgIEJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IGA8aHRtbD5gLCBgPGhlYWQ+YCwgYW5kIGA8Ym9keT5gIGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIF9Ib3cgY29vbCBpcyB0aGF0P19cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszNV1cXG5cXG4gICAgWW91IGNhbiBub3cgdmlzaXQgYGxvY2FsaG9zdDozMDAwYCB3aXRoIHlvdXIgZmF2b3JpdGUgd2ViIGJyb3dzZXIgYW5kIHlvdSdsbCBub3RpY2UgdGhhdCB0aGUgdmlldyByZW5kZXJzIGFzIHlvdSdkIGV4cGVjdC4gVGhlIHRpdGxlIHdpbGwgYmUgcHJvcGVybHkgc2V0LCBhbmQgYSBgPG1haW4+YCBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgY29udGVudHMgb2YgeW91ciB2aWV3LlxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBhcHBsaWNhdGlvbiBydW5uaW5nIG9uIEdvb2dsZSBDaHJvbWVdWzM2XVxcblxcbiAgICBUaGF0J3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUncyBub3RoaW5nIHN0b3BwaW5nIHlvdSBmcm9tIGFkZGluZyBkYXRhYmFzZSBjYWxscyB0byBmZXRjaCBiaXRzIGFuZCBwaWVjZXMgb2YgdGhlIG1vZGVsIGJlZm9yZSBpbnZva2luZyBgbmV4dGAgdG8gcmVuZGVyIHRoZSB2aWV3LlxcblxcbiAgICBUaGVuIHRoZXJlJ3MgYWxzbyB0aGUgY2xpZW50LXNpZGUgYXNwZWN0IG9mIHNldHRpbmcgdXAgVGF1bnVzLiBMZXQncyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGF1bnVzIGluIHRoZSBjbGllbnRcXG5cXG4gICAgWW91IGFscmVhZHkga25vdyBob3cgdG8gc2V0IHVwIHRoZSBiYXNpY3MgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZywgYW5kIHlvdSBrbm93IHRoYXQgeW91IHNob3VsZCBbY2hlY2sgb3V0IHRoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdIHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLlxcblxcbiAgICBUaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIF9vciBpZiBpdCBoYXNuJ3QgbG9hZGVkIHlldCBkdWUgdG8gYSBzbG93IGNvbm5lY3Rpb24gc3VjaCBhcyB0aG9zZSBpbiB1bnN0YWJsZSBtb2JpbGUgbmV0d29ya3NfLCB0aGUgcmVndWxhciBsaW5rIHdvdWxkIGJlIGZvbGxvd2VkIGluc3RlYWQgYW5kIG5vIGhhcm0gd291bGQgYmUgdW5sZWFzaGVkIHVwb24gdGhlIGh1bWFuLCBleGNlcHQgdGhleSB3b3VsZCBnZXQgYSBzbGlnaHRseSBsZXNzIGZhbmN5IGV4cGVyaWVuY2UuXFxuXFxuICAgIFNldHRpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGludm9sdmVzIGEgZmV3IGRpZmZlcmVudCBzdGVwcy4gRmlyc3RseSwgd2UnbGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbidzIHdpcmluZyBfKHRoZSByb3V0ZXMgYW5kIEphdmFTY3JpcHQgdmlldyBmdW5jdGlvbnMpXyBpbnRvIHNvbWV0aGluZyB0aGUgYnJvd3NlciB1bmRlcnN0YW5kcy4gVGhlbiwgeW91J2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQncyBvdXQgb2YgdGhlIHdheSwgY2xpZW50LXNpZGUgcm91dGluZyB3b3VsZCBiZSBzZXQgdXAuXFxuXFxuICAgIEFzIHN1Z2FyIGNvYXRpbmcgb24gdG9wIG9mIHRoYXQsIHlvdSBtYXkgYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdXNpbmcgY29udHJvbGxlcnMuIFRoZXNlIGNvbnRyb2xsZXJzIHdvdWxkIGJlIGV4ZWN1dGVkIGV2ZW4gaWYgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS4gVGhleSBjYW4gYWNjZXNzIHRoZSBUYXVudXMgQVBJIGRpcmVjdGx5LCBpbiBjYXNlIHlvdSBuZWVkIHRvIG5hdmlnYXRlIHRvIGFub3RoZXIgdmlldyBpbiBzb21lIHdheSBvdGhlciB0aGFuIGJ5IGhhdmluZyBodW1hbnMgY2xpY2sgb24gYW5jaG9yIHRhZ3MuIFRoZSBBUEksIGFzIHlvdSdsbCBsZWFybiwgd2lsbCBhbHNvIGxldCB5b3UgcmVuZGVyIHBhcnRpYWwgdmlld3MgdXNpbmcgdGhlIHBvd2VyZnVsIFRhdW51cyBlbmdpbmUsIGxpc3RlbiBmb3IgZXZlbnRzIHRoYXQgbWF5IG9jY3VyIGF0IGtleSBzdGFnZXMgb2YgdGhlIHZpZXctcmVuZGVyaW5nIHByb2Nlc3MsIGFuZCBldmVuIGludGVyY2VwdCBBSkFYIHJlcXVlc3RzIGJsb2NraW5nIHRoZW0gYmVmb3JlIHRoZXkgZXZlciBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIFRhdW51cyBDTElcXG5cXG4gICAgVGF1bnVzIGNvbWVzIHdpdGggYSBDTEkgdGhhdCBjYW4gYmUgdXNlZCB0byB3aXJlIHlvdXIgTm9kZS5qcyByb3V0ZXMgYW5kIHZpZXdzIGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGUgc2FtZSBDTEkgY2FuIGJlIHVzZWQgdG8gd2lyZSB1cCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXMgd2VsbC4gVGhlIG1haW4gcmVhc29uIHdoeSB0aGUgVGF1bnVzIENMSSBleGlzdHMgaXMgc28gdGhhdCB5b3UgZG9uJ3QgaGF2ZSB0byBgcmVxdWlyZWAgZXZlcnkgc2luZ2xlIHZpZXcgYW5kIGNvbnRyb2xsZXIsIHVuZG9pbmcgYSBsb3Qgb2YgdGhlIHdvcmsgdGhhdCB3YXMgcHV0IGludG8gY29kZSByZXVzZS4gSnVzdCBsaWtlIHdlIGRpZCB3aXRoIGBqYWR1bWAgZWFybGllciwgd2UnbGwgaW5zdGFsbCB0aGUgYHRhdW51c2AgQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLS1nbG9iYWwgdGF1bnVzXFxuICAgIGBgYFxcblxcbiAgICBCZWZvcmUgeW91IGNhbiB1c2UgdGhlIENMSSwgeW91IHNob3VsZCBtb3ZlIHRoZSByb3V0ZSBkZWZpbml0aW9ucyB0byBgY29udHJvbGxlcnMvcm91dGVzLmpzYC4gVGhhdCdzIHdoZXJlIFRhdW51cyBleHBlY3RzIHRoZW0gdG8gYmUuIElmIHlvdSB3YW50IHRvIHBsYWNlIHRoZW0gc29tZXRoaW5nIGVsc2UsIFt0aGUgQVBJIGRvY3VtZW50YXRpb24gY2FuIGhlbHAgeW91XVsxOF0uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG12IHJvdXRlcy5qcyBjb250cm9sbGVycy9yb3V0ZXMuanNcXG4gICAgYGBgXFxuXFxuICAgIFNpbmNlIHlvdSBtb3ZlZCB0aGUgcm91dGVzIHlvdSBzaG91bGQgYWxzbyB1cGRhdGUgdGhlIGByZXF1aXJlYCBzdGF0ZW1lbnQgaW4gdGhlIGBhcHAuanNgIG1vZHVsZS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9jb250cm9sbGVycy9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vLmJpbi92aWV3cy9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBDTEkgaXMgdGVyc2UgaW4gYm90aCBpdHMgaW5wdXRzIGFuZCBpdHMgb3V0cHV0cy4gSWYgeW91IHJ1biBpdCB3aXRob3V0IGFueSBhcmd1bWVudHMgaXQnbGwgcHJpbnQgb3V0IHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgaWYgeW91IHdhbnQgdG8gcGVyc2lzdCBpdCB5b3Ugc2hvdWxkIHByb3ZpZGUgdGhlIGAtLW91dHB1dGAgZmxhZy4gSW4gdHlwaWNhbCBbY29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb25dWzhdIGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIGAuYmluL3ZpZXdzYCBhbmQgdGhhdCB5b3Ugd2FudCB0aGUgd2lyaW5nIG1vZHVsZSB0byBiZSBwbGFjZWQgaW4gYC5iaW4vd2lyaW5nLmpzYCwgYnV0IHlvdSdsbCBiZSBhYmxlIHRvIGNoYW5nZSB0aGF0IGlmIGl0IGRvZXNuJ3QgbWVldCB5b3VyIG5lZWRzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXRcXG4gICAgYGBgXFxuXFxuICAgIEF0IHRoaXMgcG9pbnQgaW4gb3VyIGV4YW1wbGUsIHRoZSBDTEkgc2hvdWxkIGNyZWF0ZSBhIGAuYmluL3dpcmluZy5qc2AgZmlsZSB3aXRoIHRoZSBjb250ZW50cyBkZXRhaWxlZCBiZWxvdy4gQXMgeW91IGNhbiBzZWUsIGV2ZW4gaWYgYHRhdW51c2AgaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCdzIG91dHB1dCBpcyBhcyBodW1hbiByZWFkYWJsZSBhcyBhbnkgb3RoZXIgbW9kdWxlLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0ZW1wbGF0ZXMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuL3ZpZXdzL2hvbWUvaW5kZXguanMnKSxcXG4gICAgICAnbGF5b3V0JzogcmVxdWlyZSgnLi92aWV3cy9sYXlvdXQuanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgY29udHJvbGxlcnMgPSB7XFxuICAgIH07XFxuXFxuICAgIHZhciByb3V0ZXMgPSBbXFxuICAgICAge1xcbiAgICAgICAgcm91dGU6ICcvJyxcXG4gICAgICAgIGFjdGlvbjogJ2hvbWUvaW5kZXgnXFxuICAgICAgfVxcbiAgICBdO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcXG4gICAgICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gICAgICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICAgICAgcm91dGVzOiByb3V0ZXNcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGB0YXVudXNgIG91dHB1dF1bMzddXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYGNvbnRyb2xsZXJzYCBvYmplY3QgaXMgZW1wdHkgYmVjYXVzZSB5b3UgaGF2ZW4ndCBjcmVhdGVkIGFueSBfY2xpZW50LXNpZGUgY29udHJvbGxlcnNfIHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJ3QgaGF2ZSBhbnkgZWZmZWN0IGluIHRoZSBjbGllbnQtc2lkZSwgYmVzaWRlcyBkZXRlcm1pbmluZyB3aGF0IGdldHMgc2VudCB0byB0aGUgY2xpZW50LlxcblxcbiAgICA+ICoqVGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCoqLiBZb3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhlIHdpcmluZyBtb2R1bGUgd2hlbmV2ZXIgeW91IGFkZCwgY2hhbmdlLCBvciByZW1vdmUgYSB2aWV3LCBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIsIG9yIGEgcm91dGUuIERvaW5nIHRoYXQgd291bGQgYmUgY3VtYmVyc29tZSwgYW5kIHRoZSBDTEkgc29sdmVzIHRoYXQgcHJvYmxlbSBmb3IgdXMgYXQgdGhlIGV4cGVuc2Ugb2Ygb25lIGFkZGl0aW9uYWwgYnVpbGQgc3RlcC5cXG5cXG4gICAgRHVyaW5nIGRldmVsb3BtZW50LCB5b3UgY2FuIGFsc28gYWRkIHRoZSBgLS13YXRjaGAgZmxhZywgd2hpY2ggd2lsbCByZWJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIGlmIGEgcmVsZXZhbnQgZmlsZSBjaGFuZ2VzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXQgLS13YXRjaFxcbiAgICBgYGBcXG5cXG4gICAgSWYgeW91J3JlIHVzaW5nIEhhcGkgaW5zdGVhZCBvZiBFeHByZXNzLCB5b3UnbGwgYWxzbyBuZWVkIHRvIHBhc3MgaW4gdGhlIGBoYXBpaWZ5YCB0cmFuc2Zvcm0gc28gdGhhdCByb3V0ZXMgZ2V0IGNvbnZlcnRlZCBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGluZyBtb2R1bGUgdW5kZXJzdGFuZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0tdHJhbnNmb3JtIGhhcGlpZnlcXG4gICAgYGBgXFxuXFxuICAgIE5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJcXG5cXG4gICAgT25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIGBjbGllbnQvanNgIHRvIGtlZXAgYWxsIG9mIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdCBsb2dpYywgYnV0IHRoYXQgaXMgdXAgdG8geW91IHRvby4gRm9yIHRoZSBzYWtlIG9mIHRoaXMgZ3VpZGUsIGxldCdzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgY2xpZW50L2pzXFxuICAgIHRvdWNoIGNsaWVudC9qcy9tYWluLmpzXFxuICAgIGBgYFxcblxcbiAgICBUaGUgYG1haW5gIG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIF9lbnRyeSBwb2ludF8gb2YgeW91ciBhcHBsaWNhdGlvbiBvbiB0aGUgY2xpZW50LXNpZGUuIEhlcmUgeW91J2xsIG5lZWQgdG8gaW1wb3J0IGB0YXVudXNgLCB0aGUgd2lyaW5nIG1vZHVsZSB3ZSd2ZSBqdXN0IGJ1aWx0LCBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIERPTSBlbGVtZW50IHdoZXJlIHlvdSBhcmUgcmVuZGVyaW5nIHlvdXIgcGFydGlhbCB2aWV3cy4gT25jZSB5b3UgaGF2ZSBhbGwgdGhhdCwgeW91IGNhbiBpbnZva2UgYHRhdW51cy5tb3VudGAuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcXG4gICAgdmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbWFpbicpWzBdO1xcblxcbiAgICB0YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBtb3VudHBvaW50IHdpbGwgc2V0IHVwIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgcm91dGVyIGFuZCBmaXJlIHRoZSBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXIgZm9yIHRoZSB2aWV3IHRoYXQgaGFzIGJlZW4gcmVuZGVyZWQgaW4gdGhlIHNlcnZlci1zaWRlLiBXaGVuZXZlciBhbiBhbmNob3IgbGluayBpcyBjbGlja2VkLCBUYXVudXMgd2lsbCBiZSBhYmxlIHRvIGhpamFjayB0aGF0IGNsaWNrIGFuZCByZXF1ZXN0IHRoZSBtb2RlbCB1c2luZyBBSkFYLCBidXQgb25seSBpZiBpdCBtYXRjaGVzIGEgdmlldyByb3V0ZS4gT3RoZXJ3aXNlIHRoZSBsaW5rIHdpbGwgYmVoYXZlIGp1c3QgbGlrZSBhbnkgbm9ybWFsIGxpbmsgd291bGQuXFxuXFxuICAgIEJ5IGRlZmF1bHQsIHRoZSBtb3VudHBvaW50IHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldy4gVGhpcyBpcyBha2luIHRvIHdoYXQgZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBmcmFtZXdvcmtzIHN1Y2ggYXMgQW5ndWxhckpTIGRvLCB3aGVyZSB2aWV3cyBhcmUgb25seSByZW5kZXJlZCBhZnRlciBhbGwgdGhlIEphdmFTY3JpcHQgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBhbmQgZXhlY3V0ZWQuIEV4Y2VwdCBUYXVudXMgcHJvdmlkZXMgaHVtYW4tcmVhZGFibGUgY29udGVudCBmYXN0ZXIsIGJlZm9yZSB0aGUgSmF2YVNjcmlwdCBldmVuIGJlZ2lucyBkb3dubG9hZGluZywgYWx0aG91Z2ggaXQgd29uJ3QgYmUgZnVuY3Rpb25hbCB1bnRpbCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBydW5zLlxcblxcbiAgICBBbiBhbHRlcm5hdGl2ZSBpcyB0byBpbmxpbmUgdGhlIHZpZXcgbW9kZWwgYWxvbmdzaWRlIHRoZSB2aWV3cyBpbiBhIGA8c2NyaXB0IHR5cGU9J3RleHQvdGF1bnVzJz5gIHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIF90eXBpY2FsbHkgbGFyZ2VyXyB0aGFuIHRoZSByZXN1bHRpbmcgdmlld3MpLlxcblxcbiAgICBBIHRoaXJkIHN0cmF0ZWd5IGlzIHRoYXQgeW91IHJlcXVlc3QgdGhlIG1vZGVsIGFzeW5jaHJvbm91c2x5IG91dHNpZGUgb2YgVGF1bnVzLCBhbGxvd2luZyB5b3UgdG8gZmV0Y2ggYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGl0c2VsZiBjb25jdXJyZW50bHksIGJ1dCB0aGF0J3MgaGFyZGVyIHRvIHNldCB1cC5cXG5cXG4gICAgVGhlIHRocmVlIGJvb3Rpbmcgc3RyYXRlZ2llcyBhcmUgZXhwbGFpbmVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gW3RoZSBvcHRpbWl6YXRpb24gZ3VpZGVdWzI1XS4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgXyhgJ2F1dG8nYClfIHNob3VsZCBzdWZmaWNlLiBJdCBmZXRjaGVzIHRoZSB2aWV3IG1vZGVsIHVzaW5nIGFuIEFKQVggcmVxdWVzdCByaWdodCBhZnRlciBUYXVudXMgbG9hZHMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIHJ1biB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQsIGV2ZW4gaWYgaXQncyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgYG1vZGVsYCwgY29udGFpbmluZyB0aGUgbW9kZWwgdGhhdCB3YXMgdXNlZCB0byByZW5kZXIgdGhlIHZpZXc7IHRoZSBgcm91dGVgLCBicm9rZW4gZG93biBpbnRvIGl0cyBjb21wb25lbnRzOyBhbmQgdGhlIGBjb250YWluZXJgLCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by5cXG5cXG4gICAgVGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSdyZSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2luZyB0aGUgYXBwbGljYXRpb246IGl0IG1pZ2h0IG5vdCBldmVuIGJlIG5lY2Vzc2FyeSEgTGV0J3MgYWRkIHNvbWUgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byB0aGUgZXhhbXBsZSB3ZSd2ZSBiZWVuIGJ1aWxkaW5nLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZVxcbiAgICB0b3VjaCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbiAgICBgYGBcXG5cXG4gICAgR3Vlc3Mgd2hhdD8gVGhlIGNvbnRyb2xsZXIgc2hvdWxkIGJlIGEgbW9kdWxlIHdoaWNoIGV4cG9ydHMgYSBmdW5jdGlvbi4gVGhhdCBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aGVuZXZlciB0aGUgdmlldyBpcyByZW5kZXJlZC4gRm9yIHRoZSBzYWtlIG9mIHNpbXBsaWNpdHkgd2UnbGwganVzdCBwcmludCB0aGUgYWN0aW9uIGFuZCB0aGUgbW9kZWwgdG8gdGhlIGNvbnNvbGUuIElmIHRoZXJlJ3Mgb25lIHBsYWNlIHdoZXJlIHlvdSdkIHdhbnQgdG8gZW5oYW5jZSB0aGUgZXhwZXJpZW5jZSwgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIHdoZXJlIHlvdSB3YW50IHRvIHB1dCB5b3VyIGNvZGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwsIGNvbnRhaW5lciwgcm91dGUpIHtcXG4gICAgICBjb25zb2xlLmxvZygnUmVuZGVyZWQgdmlldyAlcyB1c2luZyBtb2RlbDpcXFxcbiVzJywgcm91dGUuYWN0aW9uLCBKU09OLnN0cmluZ2lmeShtb2RlbCwgbnVsbCwgMikpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgU2luY2Ugd2Ugd2VyZW4ndCB1c2luZyB0aGUgYC0td2F0Y2hgIGZsYWcgZnJvbSB0aGUgVGF1bnVzIENMSSwgeW91J2xsIGhhdmUgdG8gcmVjb21waWxlIHRoZSB3aXJpbmcgYXQgdGhpcyBwb2ludCwgc28gdGhhdCB0aGUgY29udHJvbGxlciBnZXRzIGFkZGVkIHRvIHRoYXQgbWFuaWZlc3QuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dFxcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCB5b3UnbGwgbm93IGhhdmUgdG8gd2lyZSB1cCB0aGUgY2xpZW50LXNpZGUgSmF2YVNjcmlwdCB1c2luZyBbQnJvd3NlcmlmeV1bMzhdIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHRcXG5cXG4gICAgWW91J2xsIG5lZWQgdG8gY29tcGlsZSB0aGUgYGNsaWVudC9qcy9tYWluLmpzYCBtb2R1bGUsIG91ciBjbGllbnQtc2lkZSBhcHBsaWNhdGlvbidzIGVudHJ5IHBvaW50LCB1c2luZyBCcm93c2VyaWZ5IHNpbmNlIHRoZSBjb2RlIGlzIHdyaXR0ZW4gdXNpbmcgQ29tbW9uSlMuIEluIHRoaXMgZXhhbXBsZSB5b3UnbGwgaW5zdGFsbCBgYnJvd3NlcmlmeWAgZ2xvYmFsbHkgdG8gY29tcGlsZSB0aGUgY29kZSwgYnV0IG5hdHVyYWxseSB5b3UnbGwgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4gd29ya2luZyBvbiBhIHJlYWwtd29ybGQgYXBwbGljYXRpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC0tZ2xvYmFsIGJyb3dzZXJpZnlcXG4gICAgYGBgXFxuXFxuICAgIE9uY2UgeW91IGhhdmUgdGhlIEJyb3dzZXJpZnkgQ0xJLCB5b3UnbGwgYmUgYWJsZSB0byBjb21waWxlIHRoZSBjb2RlIHJpZ2h0IGZyb20geW91ciBjb21tYW5kIGxpbmUuIFRoZSBgLWRgIGZsYWcgdGVsbHMgQnJvd3NlcmlmeSB0byBhZGQgYW4gaW5saW5lIHNvdXJjZSBtYXAgaW50byB0aGUgY29tcGlsZWQgYnVuZGxlLCBtYWtpbmcgZGVidWdnaW5nIGVhc2llciBmb3IgdXMuIFRoZSBgLW9gIGZsYWcgcmVkaXJlY3RzIG91dHB1dCB0byB0aGUgaW5kaWNhdGVkIGZpbGUsIHdoZXJlYXMgdGhlIG91dHB1dCBpcyBwcmludGVkIHRvIHN0YW5kYXJkIG91dHB1dCBieSBkZWZhdWx0LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCAuYmluL3B1YmxpYy9qc1xcbiAgICBicm93c2VyaWZ5IGNsaWVudC9qcy9tYWluLmpzIC1kbyAuYmluL3B1YmxpYy9qcy9hbGwuanNcXG4gICAgYGBgXFxuXFxuICAgIFdlIGhhdmVuJ3QgZG9uZSBtdWNoIG9mIGFueXRoaW5nIHdpdGggdGhlIEV4cHJlc3MgYXBwbGljYXRpb24sIHNvIHlvdSdsbCBuZWVkIHRvIGFkanVzdCB0aGUgYGFwcC5qc2AgbW9kdWxlIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMuIElmIHlvdSdyZSB1c2VkIHRvIEV4cHJlc3MsIHlvdSdsbCBub3RpY2UgdGhlcmUncyBub3RoaW5nIHNwZWNpYWwgYWJvdXQgaG93IHdlJ3JlIHVzaW5nIGBzZXJ2ZS1zdGF0aWNgLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCAtLXNhdmUgc2VydmUtc3RhdGljXFxuICAgIGBgYFxcblxcbiAgICBMZXQncyBjb25maWd1cmUgdGhlIGFwcGxpY2F0aW9uIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMgZnJvbSBgLmJpbi9wdWJsaWNgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIHNlcnZlU3RhdGljID0gcmVxdWlyZSgnc2VydmUtc3RhdGljJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9jb250cm9sbGVycy9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vLmJpbi92aWV3cy9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICBhcHAudXNlKHNlcnZlU3RhdGljKCcuYmluL3B1YmxpYycpKTtcXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBOZXh0IHVwLCB5b3UnbGwgaGF2ZSB0byBlZGl0IHRoZSBsYXlvdXQgdG8gaW5jbHVkZSB0aGUgY29tcGlsZWQgSmF2YVNjcmlwdCBidW5kbGUgZmlsZS5cXG5cXG4gICAgYGBgamFkZVxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtYWluIT1wYXJ0aWFsXFxuICAgIHNjcmlwdChzcmM9Jy9qcy9hbGwuanMnKVxcbiAgICBgYGBcXG5cXG4gICAgTGFzdGx5LCB5b3UgY2FuIGV4ZWN1dGUgdGhlIGFwcGxpY2F0aW9uIGFuZCBzZWUgaXQgaW4gYWN0aW9uIVxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzM5XVxcblxcbiAgICBJZiB5b3Ugb3BlbiB0aGUgYXBwbGljYXRpb24gb24gYSB3ZWIgYnJvd3NlciwgeW91J2xsIG5vdGljZSB0aGF0IHRoZSBhcHByb3ByaWF0ZSBpbmZvcm1hdGlvbiB3aWxsIGJlIGxvZ2dlZCBpbnRvIHRoZSBkZXZlbG9wZXIgYGNvbnNvbGVgLlxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCB0aGUgYXBwbGljYXRpb24gcnVubmluZyB1bmRlciBHb29nbGUgQ2hyb21lXVs0MF1cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSVxcblxcbiAgICBUYXVudXMgZG9lcyBwcm92aWRlIFthIHRoaW4gQVBJXVsxOF0gaW4gdGhlIGNsaWVudC1zaWRlLiBVc2FnZSBvZiB0aGF0IEFQSSBiZWxvbmdzIG1vc3RseSBpbnNpZGUgdGhlIGJvZHkgb2YgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVycywgYnV0IHRoZXJlJ3MgYSBmZXcgbWV0aG9kcyB5b3UgY2FuIHRha2UgYWR2YW50YWdlIG9mIG9uIGEgZ2xvYmFsIHNjYWxlIGFzIHdlbGwuXFxuXFxuICAgIFRhdW51cyBjYW4gbm90aWZ5IHlvdSB3aGVuZXZlciBpbXBvcnRhbnQgZXZlbnRzIG9jY3VyLlxcblxcbiAgICBFdmVudCAgICAgICAgICAgIHwgQXJndW1lbnRzICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgJ3N0YXJ0J2AgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2ZldGNoLnN0YXJ0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy5cXG4gICAgYCdmZXRjaC5kb25lJ2AgICB8ICBgcm91dGUsIGNvbnRleHQsIGRhdGFgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS5cXG4gICAgYCdmZXRjaC5hYm9ydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC5cXG4gICAgYCdmZXRjaC5lcnJvcidgICB8ICBgcm91dGUsIGNvbnRleHQsIGVycmAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuXFxuXFxuICAgIEJlc2lkZXMgZXZlbnRzLCB0aGVyZSdzIGEgY291cGxlIG1vcmUgbWV0aG9kcyB5b3UgY2FuIHVzZS4gVGhlIGB0YXVudXMubmF2aWdhdGVgIG1ldGhvZCBhbGxvd3MgeW91IHRvIG5hdmlnYXRlIHRvIGEgVVJMIHdpdGhvdXQgdGhlIG5lZWQgZm9yIGEgaHVtYW4gdG8gY2xpY2sgb24gYW4gYW5jaG9yIGxpbmsuIFRoZW4gdGhlcmUncyBgdGF1bnVzLnBhcnRpYWxgLCBhbmQgdGhhdCBhbGxvd3MgeW91IHRvIHJlbmRlciBhbnkgcGFydGlhbCB2aWV3IG9uIGEgRE9NIGVsZW1lbnQgb2YgeW91ciBjaG9vc2luZywgYW5kIGl0J2xsIHRoZW4gaW52b2tlIGl0cyBjb250cm9sbGVyLiBZb3UnbGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guXFxuXFxuICAgIEFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDYWNoaW5nIGFuZCBQcmVmZXRjaGluZ1xcblxcbiAgICBbUGVyZm9ybWFuY2VdWzI1XSBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQncyB3aHkgdGhlIHlvdSBjYW4gcGVyZm9ybSBjYWNoaW5nIGFuZCBwcmVmZXRjaGluZyBvbiB0aGUgY2xpZW50LXNpZGUganVzdCBieSB0dXJuaW5nIG9uIGEgcGFpciBvZiBmbGFncy4gQnV0IHdoYXQgZG8gdGhlc2UgZmxhZ3MgZG8gZXhhY3RseT9cXG5cXG4gICAgV2hlbiB0dXJuZWQgb24sIGJ5IHBhc3NpbmcgYHsgY2FjaGU6IHRydWUgfWAgYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgYHRhdW51cy5tb3VudGAsIHRoZSBjYWNoaW5nIGxheWVyIHdpbGwgbWFrZSBzdXJlIHRoYXQgcmVzcG9uc2VzIGFyZSBrZXB0IGFyb3VuZCBmb3IgYDE1YCBzZWNvbmRzLiBXaGVuZXZlciBhIHJvdXRlIG5lZWRzIGEgbW9kZWwgaW4gb3JkZXIgdG8gcmVuZGVyIGEgdmlldywgaXQnbGwgZmlyc3QgYXNrIHRoZSBjYWNoaW5nIGxheWVyIGZvciBhIGZyZXNoIGNvcHkuIElmIHRoZSBjYWNoaW5nIGxheWVyIGRvZXNuJ3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSBfKGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiBgMTVgIHNlY29uZHMpXywgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyIGluIHNlY29uZHMgaW5zdGVhZCBvZiBqdXN0IGB0cnVlYC5cXG5cXG4gICAgU2luY2UgVGF1bnVzIHVuZGVyc3RhbmRzIHRoYXQgbm90IGV2ZXJ5IHZpZXcgb3BlcmF0ZXMgdW5kZXIgdGhlIHNhbWUgY29uc3RyYWludHMsIHlvdSdyZSBhbHNvIGFibGUgdG8gc2V0IGEgYGNhY2hlYCBmcmVzaG5lc3MgZHVyYXRpb24gZGlyZWN0bHkgaW4geW91ciByb3V0ZXMuIFRoZSBgY2FjaGVgIHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLlxcblxcbiAgICBUaGVyZSdzIGN1cnJlbnRseSB0d28gY2FjaGluZyBzdG9yZXM6IGEgcmF3IGluLW1lbW9yeSBzdG9yZSwgYW5kIGFuIFtJbmRleGVkREJdWzI4XSBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIGBsb2NhbFN0b3JhZ2VgLiBJdCBoYXMgW3N1cnByaXNpbmdseSBicm9hZCBicm93c2VyIHN1cHBvcnRdWzI5XSwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCdzIG5vdCBzdXBwb3J0ZWQgdGhlbiBjYWNoaW5nIGlzIGRvbmUgc29sZWx5IGluLW1lbW9yeS5cXG5cXG4gICAgVGhlIHByZWZldGNoaW5nIG1lY2hhbmlzbSBpcyBhbiBpbnRlcmVzdGluZyBzcGluLW9mZiBvZiBjYWNoaW5nLCBhbmQgaXQgcmVxdWlyZXMgY2FjaGluZyB0byBiZSBlbmFibGVkIGluIG9yZGVyIHRvIHdvcmsuIFdoZW5ldmVyIGh1bWFucyBob3ZlciBvdmVyIGEgbGluaywgb3Igd2hlbmV2ZXIgdGhleSBwdXQgdGhlaXIgZmluZ2VyIG9uIG9uZSBvZiB0aGVtIF8odGhlIGB0b3VjaHN0YXJ0YCBldmVudClfLCB0aGUgcHJlZmV0Y2hlciB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgZm9yIHRoYXQgbGluay5cXG5cXG4gICAgSWYgdGhlIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkgdGhlbiB0aGUgcmVzcG9uc2Ugd2lsbCBiZSBjYWNoZWQgaW4gdGhlIHNhbWUgd2F5IGFueSBvdGhlciB2aWV3IHdvdWxkIGJlIGNhY2hlZC4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGFub3RoZXIgbGluayB3aGlsZSB0aGUgcHJldmlvdXMgb25lIGlzIHN0aWxsIGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhlIG9sZCByZXF1ZXN0IGlzIGFib3J0ZWQsIGFzIG5vdCB0byBkcmFpbiB0aGVpciBfKHBvc3NpYmx5IGxpbWl0ZWQpXyBJbnRlcm5ldCBjb25uZWN0aW9uIGJhbmR3aWR0aC5cXG5cXG4gICAgSWYgdGhlIGh1bWFuIGNsaWNrcyBvbiB0aGUgbGluayBiZWZvcmUgcHJlZmV0Y2hpbmcgaXMgY29tcGxldGVkLCBoZSdsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuXFxuXFxuICAgIFR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgYHByZWZldGNoYCB0byBgdHJ1ZWAgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgLiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSBbUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uc11bMjVdIGd1aWRlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFZlcnNpb25pbmdcXG5cXG4gICAgV2hlbiB5b3UgYWx0ZXIgeW91ciB2aWV3cywgY2hhbmdlIGNvbnRyb2xsZXJzLCBvciBtb2RpZnkgdGhlIG1vZGVscywgY2hhbmNlcyBhcmUgdGhlIGNsaWVudC1zaWRlIGlzIGdvaW5nIHRvIGNvbWUgYWNyb3NzIG9uZSBvZiB0aGUgZm9sbG93aW5nIGlzc3Vlcy5cXG5cXG4gICAgLSBPdXRkYXRlZCB2aWV3IHRlbXBsYXRlIGZ1bmN0aW9ucyBpbiB0aGUgY2xpZW50LXNpZGUsIGNhdXNpbmcgbmV3IG1vZGVscyB0byBicmVha1xcbiAgICAtIE91dGRhdGVkIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzLCBjYXVzaW5nIG5ldyBtb2RlbHMgdG8gYnJlYWsgb3IgbWlzcyBvdXQgb24gZnVuY3Rpb25hbGl0eVxcbiAgICAtIE91dGRhdGVkIG1vZGVscyBpbiB0aGUgY2FjaGUsIGNhdXNpbmcgbmV3IHZpZXdzIG9yIGNvbnRyb2xsZXJzIHRvIGJyZWFrXFxuXFxuICAgIFZlcnNpb25pbmcgaGFuZGxlcyB0aGVzZSBpc3N1ZXMgZ3JhY2VmdWxseSBvbiB5b3VyIGJlaGFsZi4gVGhlIHdheSBpdCB3b3JrcyBpcyB0aGF0IHdoZW5ldmVyIHlvdSBnZXQgYSByZXNwb25zZSBmcm9tIFRhdW51cywgYSBfdmVyc2lvbiBzdHJpbmcgKGNvbmZpZ3VyZWQgb24gdGhlIHNlcnZlci1zaWRlKV8gaXMgaW5jbHVkZWQgd2l0aCBpdC4gSWYgdGhhdCB2ZXJzaW9uIHN0cmluZyBkb2Vzbid0IG1hdGNoIHRoZSBvbmUgc3RvcmVkIGluIHRoZSBjbGllbnQsIHRoZW4gdGhlIGNhY2hlIHdpbGwgYmUgZmx1c2hlZCBhbmQgdGhlIGh1bWFuIHdpbGwgYmUgcmVkaXJlY3RlZCwgZm9yY2luZyBhIGZ1bGwgcGFnZSByZWxvYWQuXFxuXFxuICAgID4gVGhlIHZlcnNpb25pbmcgQVBJIGlzIHVuYWJsZSB0byBoYW5kbGUgY2hhbmdlcyB0byByb3V0ZXMsIGFuZCBpdCdzIHVwIHRvIHlvdSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgYXBwbGljYXRpb24gc3RheXMgYmFja3dhcmRzIGNvbXBhdGlibGUgd2hlbiBpdCBjb21lcyB0byByb3V0aW5nLlxcbiAgICA+XFxuICAgID4gVmVyc2lvbmluZyBjYW4ndCBpbnRlcnZlbmUgd2hlbiB0aGUgY2xpZW50LXNpZGUgaXMgaGVhdmlseSByZWx5aW5nIG9uIGNhY2hlZCB2aWV3cyBhbmQgbW9kZWxzLCBhbmQgdGhlIGh1bWFuIGlzIHJlZnVzaW5nIHRvIHJlbG9hZCB0aGVpciBicm93c2VyLiBUaGUgc2VydmVyIGlzbid0IGJlaW5nIGFjY2Vzc2VkIGFuZCB0aHVzIGl0IGNhbid0IGNvbW11bmljYXRlIHRoYXQgZXZlcnl0aGluZyBvbiB0aGUgY2FjaGUgbWF5IGhhdmUgYmVjb21lIHN0YWxlLiBUaGUgZ29vZCBuZXdzIGlzIHRoYXQgdGhlIGh1bWFuIHdvbid0IG5vdGljZSBhbnkgb2RkaXRpZXMsIGFzIHRoZSBzaXRlIHdpbGwgY29udGludWUgdG8gd29yayBhcyBoZSBrbm93cyBpdC4gV2hlbiBoZSBmaW5hbGx5IGF0dGVtcHRzIHRvIHZpc2l0IHNvbWV0aGluZyB0aGF0IGlzbid0IGNhY2hlZCwgYSByZXF1ZXN0IGlzIG1hZGUsIGFuZCB0aGUgdmVyc2lvbmluZyBlbmdpbmUgcmVzb2x2ZXMgdmVyc2lvbiBkaXNjcmVwYW5jaWVzIGZvciB0aGVtLlxcblxcbiAgICBNYWtpbmcgdXNlIG9mIHZlcnNpb25pbmcgaW52b2x2ZXMgc2V0dGluZyB0aGUgYHZlcnNpb25gIGZpZWxkIGluIHRoZSBvcHRpb25zLCB3aGVuIGludm9raW5nIGB0YXVudXMubW91bnRgICoqb24gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZSwgdXNpbmcgdGhlIHNhbWUgdmFsdWUqKi4gVGhlIFRhdW51cyB2ZXJzaW9uIHN0cmluZyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBvbmUgeW91IHByb3ZpZGVkLCBzbyB0aGF0IFRhdW51cyB3aWxsIGtub3cgdG8gc3RheSBhbGVydCBmb3IgY2hhbmdlcyB0byBUYXVudXMgaXRzZWxmLCBhcyB3ZWxsLlxcblxcbiAgICBZb3UgbWF5IHVzZSB5b3VyIGJ1aWxkIGlkZW50aWZpZXIgb3IgdGhlIGB2ZXJzaW9uYCBmaWVsZCBpbiBgcGFja2FnZS5qc29uYCwgYnV0IHVuZGVyc3RhbmQgdGhhdCBpdCBtYXkgY2F1c2UgdGhlIGNsaWVudC1zaWRlIHRvIGZsdXNoIHRoZSBjYWNoZSB0b28gb2Z0ZW4gXyhtYXliZSBldmVuIG9uIGV2ZXJ5IGRlcGxveW1lbnQpXy5cXG5cXG4gICAgVGhlIGRlZmF1bHQgdmVyc2lvbiBzdHJpbmcgaXMgc2V0IHRvIGAxYC4gVGhlIFRhdW51cyB2ZXJzaW9uIHdpbGwgYmUgcHJlcGVuZGVkIHRvIHlvdXJzLCByZXN1bHRpbmcgaW4gYSB2YWx1ZSBzdWNoIGFzIGB0My4wLjA7djFgIHdoZXJlIFRhdW51cyBpcyBydW5uaW5nIHZlcnNpb24gYDMuMC4wYCBhbmQgeW91ciBhcHBsaWNhdGlvbiBpcyBydW5uaW5nIHZlcnNpb24gYDFgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRoZSBza3kgaXMgdGhlIGxpbWl0IVxcblxcbiAgICBZb3UncmUgbm93IGZhbWlsaWFyIHdpdGggaG93IFRhdW51cyB3b3JrcyBvbiBhIGhpZ2gtbGV2ZWwuIFlvdSBoYXZlIGNvdmVyZWQgYSBkZWNlbnQgYW1vdW50IG9mIGdyb3VuZCwgYnV0IHlvdSBzaG91bGRuJ3Qgc3RvcCB0aGVyZS5cXG5cXG4gICAgLSBMZWFybiBtb3JlIGFib3V0IFt0aGUgQVBJIFRhdW51cyBoYXNdWzE4XSB0byBvZmZlclxcbiAgICAtIEdvIHRocm91Z2ggdGhlIFtwZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gdGlwc11bMjVdLiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchXFxuICAgIC0gX0ZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnRfXFxuICAgICAgLSBKZXJlbXkgS2VpdGggZW51bmNpYXRlcyBbXFxcIkJlIHByb2dyZXNzaXZlXFxcIl1bMjBdXFxuICAgICAgLSBDaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciBbXFxcIlByYWdtYXRpYyBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudFxcXCJdWzI2XVxcbiAgICAgIC0gSmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IFtcXFwiUHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgaXMgZmFzdGVyXFxcIl1bMjJdXFxuICAgICAgLSBJIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCBbXFxcIlN0b3AgQnJlYWtpbmcgdGhlIFdlYlxcXCJdWzE3XVxcbiAgICAgIC0gR3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgW1xcXCI3IFByaW5jaXBsZXMgb2YgUmljaCBXZWIgQXBwbGljYXRpb25zXFxcIl1bMjRdXFxuICAgICAgLSBBYXJvbiBHdXN0YWZzb24gd3JpdGVzIFtcXFwiVW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudFxcXCJdWzIxXVxcbiAgICAgIC0gT3JkZSBTYXVuZGVycyBnaXZlcyBoaXMgcG9pbnQgb2YgdmlldyBpbiBbXFxcIlByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2VcXFwiXVsyM11cXG4gICAgLSBTaWZ0IHRocm91Z2ggdGhlIFtjb21wbGVtZW50YXJ5IG1vZHVsZXNdWzE1XS4gWW91IG1heSBmaW5kIHNvbWV0aGluZyB5b3UgaGFkbid0IHRob3VnaHQgb2YhXFxuXFxuICAgIEFsc28sIGdldCBpbnZvbHZlZCFcXG5cXG4gICAgLSBGb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgW3NlbmQgc29tZSBwdWxsIHJlcXVlc3RzXVsxOV0gdG8gaW1wcm92ZSB0aGVzZSBndWlkZXMhXFxuICAgIC0gU2VlIHNvbWV0aGluZywgc2F5IHNvbWV0aGluZyEgSWYgeW91IGRldGVjdCBhIGJ1ZywgW3BsZWFzZSBjcmVhdGUgYW4gaXNzdWVdWzI3XSFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgPiBZb3UnbGwgZmluZCBhIFtmdWxsIGZsZWRnZWQgdmVyc2lvbiBvZiB0aGUgR2V0dGluZyBTdGFydGVkXVs0MV0gdHV0b3JpYWwgYXBwbGljYXRpb24gb24gR2l0SHViLlxcblxcbiAgICBbMV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzJdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFszXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vXFxuICAgIFs2XTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzddOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbOF06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG4gICAgWzldOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1J1Ynlfb25fUmFpbHNcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXG4gICAgWzExXTogaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxuICAgIFsxMl06IGh0dHA6Ly9tb3ppbGxhLmdpdGh1Yi5pby9udW5qdWNrcy9cXG4gICAgWzEzXTogaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxuICAgIFsxNF06IGh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxuICAgIFsxNV06IC9jb21wbGVtZW50c1xcbiAgICBbMTZdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvamFkdW1cXG4gICAgWzE3XTogaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcbiAgICBbMThdOiAvYXBpXFxuICAgIFsxOV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvL3B1bGxzXFxuICAgIFsyMF06IGh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxuICAgIFsyMV06IGh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxuICAgIFsyMl06IGh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXG4gICAgWzIzXTogaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcbiAgICBbMjRdOiBodHRwOi8vcmF1Y2hnLmNvbS8yMDE0LzctcHJpbmNpcGxlcy1vZi1yaWNoLXdlYi1hcHBsaWNhdGlvbnMvXFxuICAgIFsyNV06IC9wZXJmb3JtYW5jZVxcbiAgICBbMjZdOiBodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcbiAgICBbMjddOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxuICAgIFsyOF06IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxuICAgIFsyOV06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXG4gICAgWzMwXTogaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxuICAgIFszMV06IGh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcbiAgICBbMzJdOiBodHRwOi8vaS5pbWd1ci5jb20vMDhsbkNlYy5wbmdcXG4gICAgWzMzXTogaHR0cDovL2kuaW1ndXIuY29tL3dVYm5DeWsucG5nXFxuICAgIFszNF06IGh0dHA6Ly9pLmltZ3VyLmNvbS96amFKWUNxLnBuZ1xcbiAgICBbMzVdOiBodHRwOi8vaS5pbWd1ci5jb20vTnZFV3g5ei5wbmdcXG4gICAgWzM2XTogaHR0cDovL2kuaW1ndXIuY29tL0xnWlJGbjUucG5nXFxuICAgIFszN106IGh0dHA6Ly9pLmltZ3VyLmNvbS9mSUVlNVRtLnBuZ1xcbiAgICBbMzhdOiBodHRwOi8vYnJvd3NlcmlmeS5vcmcvXFxuICAgIFszOV06IGh0dHA6Ly9pLmltZ3VyLmNvbS82OE84NHdYLnBuZ1xcbiAgICBbNDBdOiBodHRwOi8vaS5pbWd1ci5jb20vWlVGNk5GbC5wbmdcXG4gICAgWzQxXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzQyXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9nZW5lcmF0b3ItdGF1bnVzXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBlcmZvcm1hbmNlKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcInBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+UGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uPC9oMT5cXG48cD5HaXZlbiB0aGF0IHBlcmZvcm1hbmNlIGlzIG9uZSBvZiB0aGUgY29yZSB2YWx1ZXMgaW4gYm90aCBUYXVudXMgYW5kIFVzZXIgRXhwZXJpZW5jZSwgaXQgZGVzZXJ2ZWQgYSBmaXJzdC1jbGFzcyBhcnRpY2xlIG9uIHRoZSBzaXRlIGFzIHdlbGwuPC9wPlxcbjxwPlRoZXJlJiMzOTtzIGEgZmV3IHRoaW5ncyB0byB0YWtlIGludG8gYWNjb3VudCB3aGVuIGRldmVsb3BpbmcgYW4gYXBwbGljYXRpb24gaWYgd2Ugd2FudCB0byBzdHJpdmUgZm9yIHBlcmZvcm1hbmNlLCBhbmQgdGhpcyBhcnRpY2xlIGFpbXMgdG8gYmUgYSBjb2xsZWN0aW9uIG9mIHdlYiBwZXJmb3JtYW5jZSBiZXN0IHByYWN0aWNlcyBhbG9uZyB3aXRoIHRpcHMgb24gaG93IHRvIGltcHJvdmUgcGVyZm9ybWFuY2UgZXNwZWNpZmljYWxseSBmb3IgYXBwbGljYXRpb25zIGJ1aWx0IG9uIHRvcCBvZiBUYXVudXMuPC9wPlxcbjxoMSBpZD1cXFwicGVyZm9ybWFuY2UtY2hlY2tsaXN0XFxcIj5QZXJmb3JtYW5jZSBDaGVja2xpc3Q8L2gxPlxcbjxwPklmIHlvdSBoYXZlbiYjMzk7dCwgeW91IHNob3VsZCByZWFkIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+JnF1b3Q7Q3JpdGljYWwgUGF0aCBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb24mcXVvdDs8L2E+IGFzIGEgc21hbGwgZ3VpZGUgb2YgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9ucyB5b3Ugc2hvdWxkIGFscmVhZHkgYmUgZG9pbmcuIFRoZSBsaXN0IGJlbG93IGNvbnRhaW5zIHNvbWUgb2Ygd2hhdCYjMzk7cyBkaXNjdXNzZWQgaW4gdGhhdCBhcnRpY2xlLjwvcD5cXG48dWw+XFxuPGxpPk1vdmUgYXdheSBmcm9tIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmc8L2xpPlxcbjxsaT5Vc2UgPGEgaHJlZj1cXFwiaHR0cDovL25naW54Lm9yZy9cXFwiPjxjb2RlPm5naW54PC9jb2RlPjwvYT4gYXMgYSByZXZlcnNlIHByb3h5IGZvciB5b3VyIGZyb250LWVuZCBzZXJ2ZXJzPC9saT5cXG48bGk+UmVzaXplIGFuZCBvcHRpbWl6ZSBpbWFnZXM8L2xpPlxcbjxsaT5EZWZlciBub24tY3JpdGljYWwgc3RhdGljIGFzc2V0IGxvYWRpbmc8L2xpPlxcbjxsaT5JbmxpbmUgY3JpdGljYWwgQ1NTIGFuZCBKYXZhU2NyaXB0PC9saT5cXG48bGk+Q2FjaGUgcmVzcG9uc2VzIGFnZ3Jlc3NpdmVseTwvbGk+XFxuPGxpPkRpdGNoIGxhcmdlIGxpYnJhcmllcyBhbmQgZnJhbWV3b3JrczwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcImJvb3N0aW5nLXBlcmZvcm1hbmNlLXdpdGgtdGF1bnVzXFxcIj5Cb29zdGluZyBQZXJmb3JtYW5jZSB3aXRoIFRhdW51czwvaDE+XFxuPHA+V2hlbiBpdCBjb21lcyB0byBUYXVudXMsIHRoZXJlJiMzOTtzIGEgZmV3IG1vcmUgcGVyZm9ybWFuY2UgdHdlYWtzIHlvdSBzaG91bGQgY29uc2lkZXIgaW1wbGVtZW50aW5nLjwvcD5cXG48dWw+XFxuPGxpPkNob29zZSB0aGUgcmlnaHQgYm9vdCBzdHJhdGVneTwvbGk+XFxuPGxpPlR1cm4gb24gY2xpZW50LXNpZGUgY2FjaGluZzwvbGk+XFxuPGxpPkVuYWJsZSBwcmVmZXRjaGluZyBmb3IgcHJlZGljdGl2ZSBjYWNoZSBsb2FkaW5nPC9saT5cXG48bGk+VXNlIHZlcnNpb25pbmcgdG8gZW5zdXJlIGNhY2hlIHJlbGV2YW5jZTwvbGk+XFxuPGxpPlNlbmQgdmlld3MgYW5kIGNvbnRyb2xsZXJzIHRvIHRoZSBjbGllbnQgc2VsZWN0aXZlbHk8L2xpPlxcbjwvdWw+XFxuPHA+R2l2ZW4gdGhhdCB0aGlzIHNpdGUgaXMgYWJvdXQgVGF1bnVzLCB3ZSYjMzk7bGwgZm9jdXMgb24gdGhlIFRhdW51cyB0d2Vha3MsIGFzIHlvdSBjYW4gcmVhZGlseSBzY291ciB0aGUgd2ViIGZvciBnZW5lcmFsIHdlYiBwZXJmb3JtYW5jZSBhZHZpY2UuPC9wPlxcbjxoMSBpZD1cXFwiY2hvb3NlLXRoZS1yaWdodC1ib290LXN0cmF0ZWd5XFxcIj5DaG9vc2UgdGhlIHJpZ2h0IGJvb3Qgc3RyYXRlZ3k8L2gxPlxcbjxwPjxlbT4oVU5ERVIgQ09OU1RSVUNUSU9OKTwvZW0+PC9wPlxcbjxoMSBpZD1cXFwidHVybi1vbi1jbGllbnQtc2lkZS1jYWNoaW5nXFxcIj5UdXJuIG9uIGNsaWVudC1zaWRlIGNhY2hpbmc8L2gxPlxcbjxwPjxlbT4oVU5ERVIgQ09OU1RSVUNUSU9OKTwvZW0+PC9wPlxcbjxoMSBpZD1cXFwiZW5hYmxlLXByZWZldGNoaW5nLWZvci1wcmVkaWN0aXZlLWNhY2hlLWxvYWRpbmdcXFwiPkVuYWJsZSBwcmVmZXRjaGluZyBmb3IgcHJlZGljdGl2ZSBjYWNoZSBsb2FkaW5nPC9oMT5cXG48cD48ZW0+KFVOREVSIENPTlNUUlVDVElPTik8L2VtPjwvcD5cXG48aDEgaWQ9XFxcInVzZS12ZXJzaW9uaW5nLXRvLWVuc3VyZS1jYWNoZS1yZWxldmFuY2VcXFwiPlVzZSB2ZXJzaW9uaW5nIHRvIGVuc3VyZSBjYWNoZSByZWxldmFuY2U8L2gxPlxcbjxwPjxlbT4oVU5ERVIgQ09OU1RSVUNUSU9OKTwvZW0+PC9wPlxcbjxoMSBpZD1cXFwic2VuZC12aWV3cy1hbmQtY29udHJvbGxlcnMtdG8tdGhlLWNsaWVudC1zZWxlY3RpdmVseVxcXCI+U2VuZCB2aWV3cyBhbmQgY29udHJvbGxlcnMgdG8gdGhlIGNsaWVudCBzZWxlY3RpdmVseTwvaDE+XFxuPHA+PGVtPihVTkRFUiBDT05TVFJVQ1RJT04pPC9lbT48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cXG5cXG4gICAgR2l2ZW4gdGhhdCBwZXJmb3JtYW5jZSBpcyBvbmUgb2YgdGhlIGNvcmUgdmFsdWVzIGluIGJvdGggVGF1bnVzIGFuZCBVc2VyIEV4cGVyaWVuY2UsIGl0IGRlc2VydmVkIGEgZmlyc3QtY2xhc3MgYXJ0aWNsZSBvbiB0aGUgc2l0ZSBhcyB3ZWxsLlxcblxcbiAgICBUaGVyZSdzIGEgZmV3IHRoaW5ncyB0byB0YWtlIGludG8gYWNjb3VudCB3aGVuIGRldmVsb3BpbmcgYW4gYXBwbGljYXRpb24gaWYgd2Ugd2FudCB0byBzdHJpdmUgZm9yIHBlcmZvcm1hbmNlLCBhbmQgdGhpcyBhcnRpY2xlIGFpbXMgdG8gYmUgYSBjb2xsZWN0aW9uIG9mIHdlYiBwZXJmb3JtYW5jZSBiZXN0IHByYWN0aWNlcyBhbG9uZyB3aXRoIHRpcHMgb24gaG93IHRvIGltcHJvdmUgcGVyZm9ybWFuY2UgZXNwZWNpZmljYWxseSBmb3IgYXBwbGljYXRpb25zIGJ1aWx0IG9uIHRvcCBvZiBUYXVudXMuXFxuXFxuICAgICMgUGVyZm9ybWFuY2UgQ2hlY2tsaXN0XFxuXFxuICAgIElmIHlvdSBoYXZlbid0LCB5b3Ugc2hvdWxkIHJlYWQgW1xcXCJDcml0aWNhbCBQYXRoIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcXCJdWzFdIGFzIGEgc21hbGwgZ3VpZGUgb2YgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9ucyB5b3Ugc2hvdWxkIGFscmVhZHkgYmUgZG9pbmcuIFRoZSBsaXN0IGJlbG93IGNvbnRhaW5zIHNvbWUgb2Ygd2hhdCdzIGRpc2N1c3NlZCBpbiB0aGF0IGFydGljbGUuXFxuXFxuICAgIC0gTW92ZSBhd2F5IGZyb20gZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZ1xcbiAgICAtIFVzZSBbYG5naW54YF1bMl0gYXMgYSByZXZlcnNlIHByb3h5IGZvciB5b3VyIGZyb250LWVuZCBzZXJ2ZXJzXFxuICAgIC0gUmVzaXplIGFuZCBvcHRpbWl6ZSBpbWFnZXNcXG4gICAgLSBEZWZlciBub24tY3JpdGljYWwgc3RhdGljIGFzc2V0IGxvYWRpbmdcXG4gICAgLSBJbmxpbmUgY3JpdGljYWwgQ1NTIGFuZCBKYXZhU2NyaXB0XFxuICAgIC0gQ2FjaGUgcmVzcG9uc2VzIGFnZ3Jlc3NpdmVseVxcbiAgICAtIERpdGNoIGxhcmdlIGxpYnJhcmllcyBhbmQgZnJhbWV3b3Jrc1xcblxcbiAgICAjIEJvb3N0aW5nIFBlcmZvcm1hbmNlIHdpdGggVGF1bnVzXFxuXFxuICAgIFdoZW4gaXQgY29tZXMgdG8gVGF1bnVzLCB0aGVyZSdzIGEgZmV3IG1vcmUgcGVyZm9ybWFuY2UgdHdlYWtzIHlvdSBzaG91bGQgY29uc2lkZXIgaW1wbGVtZW50aW5nLlxcblxcbiAgICAtIENob29zZSB0aGUgcmlnaHQgYm9vdCBzdHJhdGVneVxcbiAgICAtIFR1cm4gb24gY2xpZW50LXNpZGUgY2FjaGluZ1xcbiAgICAtIEVuYWJsZSBwcmVmZXRjaGluZyBmb3IgcHJlZGljdGl2ZSBjYWNoZSBsb2FkaW5nXFxuICAgIC0gVXNlIHZlcnNpb25pbmcgdG8gZW5zdXJlIGNhY2hlIHJlbGV2YW5jZVxcbiAgICAtIFNlbmQgdmlld3MgYW5kIGNvbnRyb2xsZXJzIHRvIHRoZSBjbGllbnQgc2VsZWN0aXZlbHlcXG5cXG4gICAgR2l2ZW4gdGhhdCB0aGlzIHNpdGUgaXMgYWJvdXQgVGF1bnVzLCB3ZSdsbCBmb2N1cyBvbiB0aGUgVGF1bnVzIHR3ZWFrcywgYXMgeW91IGNhbiByZWFkaWx5IHNjb3VyIHRoZSB3ZWIgZm9yIGdlbmVyYWwgd2ViIHBlcmZvcm1hbmNlIGFkdmljZS5cXG5cXG4gICAgIyBDaG9vc2UgdGhlIHJpZ2h0IGJvb3Qgc3RyYXRlZ3lcXG5cXG4gICAgXyhVTkRFUiBDT05TVFJVQ1RJT04pX1xcblxcbiAgICAjIFR1cm4gb24gY2xpZW50LXNpZGUgY2FjaGluZ1xcblxcbiAgICBfKFVOREVSIENPTlNUUlVDVElPTilfXFxuXFxuICAgICMgRW5hYmxlIHByZWZldGNoaW5nIGZvciBwcmVkaWN0aXZlIGNhY2hlIGxvYWRpbmdcXG5cXG4gICAgXyhVTkRFUiBDT05TVFJVQ1RJT04pX1xcblxcbiAgICAjIFVzZSB2ZXJzaW9uaW5nIHRvIGVuc3VyZSBjYWNoZSByZWxldmFuY2VcXG5cXG4gICAgXyhVTkRFUiBDT05TVFJVQ1RJT04pX1xcblxcbiAgICAjIFNlbmQgdmlld3MgYW5kIGNvbnRyb2xsZXJzIHRvIHRoZSBjbGllbnQgc2VsZWN0aXZlbHlcXG5cXG4gICAgXyhVTkRFUiBDT05TVFJVQ1RJT04pX1xcblxcbiAgICBbMV06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcbiAgICBbMl06IGh0dHA6Ly9uZ2lueC5vcmcvXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG5vdEZvdW5kKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJOb3QgRm91bmRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUaGVyZSBkb2Vzbid0IHNlZW0gdG8gYmUgYW55dGhpbmcgaGVyZSB5ZXQuIElmIHlvdSBiZWxpZXZlIHRoaXMgdG8gYmUgYSBtaXN0YWtlLCBwbGVhc2UgbGV0IHVzIGtub3chXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3A+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcImh0dHBzOi8vdHdpdHRlci5jb20vbnpnYlxcXCIgdGFyZ2V0PVxcXCJfYmxhbmtcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIiZtZGFzaDsgQG56Z2JcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJoMSBOb3QgRm91bmRcXG5cXG5wIFRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcXG5wXFxuICBhKGhyZWY9J2h0dHBzOi8vdHdpdHRlci5jb20vbnpnYicsIHRhcmdldD0nX2JsYW5rJykgJm1kYXNoOyBAbnpnYlxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsYXlvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQsIG1vZGVsLCBwYXJ0aWFsKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjwhRE9DVFlQRSBodG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGh0bWwgbGFuZz1cXFwiZW5cXFwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cXFwiaHR0cDovL3NjaGVtYS5vcmcvQmxvZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx0aXRsZT5cIiArIChqYWRlLmVzY2FwZShudWxsID09IChqYWRlX2ludGVycCA9IG1vZGVsLnRpdGxlKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC90aXRsZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGNoYXJzZXQ9XFxcInV0Zi04XFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic2hvcnRjdXQgaWNvblxcXCIgaHJlZj1cXFwiL2Zhdmljb24uaWNvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGh0dHAtZXF1aXY9XFxcIlgtVUEtQ29tcGF0aWJsZVxcXCIgY29udGVudD1cXFwiSUU9ZWRnZSxjaHJvbWU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBuYW1lPVxcXCJ2aWV3cG9ydFxcXCIgY29udGVudD1cXFwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTFcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzdHlsZXNoZWV0XFxcIiB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCIgaHJlZj1cXFwiL2Nzcy9hbGwuY3NzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCJodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT1VbmljYStPbmU6NDAwfFBsYXlmYWlyK0Rpc3BsYXk6NzAwfE1lZ3JpbTo3MDB8RmF1bmErT25lOjQwMGl0YWxpYyw0MDAsNzAwXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaGVhZD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8Ym9keSBpZD1cXFwidG9wXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZGVyPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIiBhcmlhLWxhYmVsPVxcXCJHbyB0byBob21lXFxcIiBjbGFzcz1cXFwibHktdGl0bGVcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUYXVudXNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgyIGNsYXNzPVxcXCJseS1zdWJoZWFkaW5nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gyPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGFzaWRlIGNsYXNzPVxcXCJzYi1zaWRlYmFyXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bmF2IGNsYXNzPVxcXCJzYi1jb250YWluZXJcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx1bCBjbGFzcz1cXFwibnYtaXRlbXNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFib3V0XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkdldHRpbmcgU3RhcnRlZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9hcGlcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJBUEkgRG9jdW1lbnRhdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI3LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkNvbXBsZW1lbnRhcnkgTW9kdWxlc1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlBlcmZvcm1hbmNlIE9wdGltaXphdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9zb3VyY2UtY29kZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlNvdXJjZSBDb2RlXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NoYW5nZWxvZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkNoYW5nZWxvZ1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvdWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L25hdj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYXNpZGU+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1haW4gaWQ9XFxcImFwcGxpY2F0aW9uLXJvb3RcXFwiIGRhdGEtdGF1bnVzPVxcXCJtb2RlbFxcXCIgY2xhc3M9XFxcImx5LW1haW5cXFwiPlwiICsgKG51bGwgPT0gKGphZGVfaW50ZXJwID0gcGFydGlhbCkgPyBcIlwiIDogamFkZV9pbnRlcnApKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9tYWluPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzY3JpcHQgc3JjPVxcXCIvanMvYWxsLmpzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2NyaXB0PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9ib2R5PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9odG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQsXCJtb2RlbFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgubW9kZWw6dHlwZW9mIG1vZGVsIT09XCJ1bmRlZmluZWRcIj9tb2RlbDp1bmRlZmluZWQsXCJwYXJ0aWFsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5wYXJ0aWFsOnR5cGVvZiBwYXJ0aWFsIT09XCJ1bmRlZmluZWRcIj9wYXJ0aWFsOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwiZG9jdHlwZSBodG1sXFxuaHRtbChsYW5nPSdlbicsIGl0ZW1zY29wZSwgaXRlbXR5cGU9J2h0dHA6Ly9zY2hlbWEub3JnL0Jsb2cnKVxcbiAgaGVhZFxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtZXRhKGNoYXJzZXQ9J3V0Zi04JylcXG4gICAgbGluayhyZWw9J3Nob3J0Y3V0IGljb24nLCBocmVmPScvZmF2aWNvbi5pY28nKVxcbiAgICBtZXRhKGh0dHAtZXF1aXY9J1gtVUEtQ29tcGF0aWJsZScsIGNvbnRlbnQ9J0lFPWVkZ2UsY2hyb21lPTEnKVxcbiAgICBtZXRhKG5hbWU9J3ZpZXdwb3J0JywgY29udGVudD0nd2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0nL2Nzcy9hbGwuY3NzJylcXG4gICAgbGluayhyZWw9J3N0eWxlc2hlZXQnLCB0eXBlPSd0ZXh0L2NzcycsIGhyZWY9J2h0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDAnKVxcblxcbiAgYm9keSN0b3BcXG4gICAgaGVhZGVyXFxuICAgICAgaDFcXG4gICAgICAgIGEubHktdGl0bGUoaHJlZj0nLycsIGFyaWEtbGFiZWw9J0dvIHRvIGhvbWUnKSBUYXVudXNcXG4gICAgICBoMi5seS1zdWJoZWFkaW5nIE1pY3JvIElzb21vcnBoaWMgTVZDIEVuZ2luZSBmb3IgTm9kZS5qc1xcblxcbiAgICBhc2lkZS5zYi1zaWRlYmFyXFxuICAgICAgbmF2LnNiLWNvbnRhaW5lclxcbiAgICAgICAgdWwubnYtaXRlbXNcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nLycpIEFib3V0XFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9nZXR0aW5nLXN0YXJ0ZWQnKSBHZXR0aW5nIFN0YXJ0ZWRcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2FwaScpIEFQSSBEb2N1bWVudGF0aW9uXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9jb21wbGVtZW50cycpIENvbXBsZW1lbnRhcnkgTW9kdWxlc1xcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvcGVyZm9ybWFuY2UnKSBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL3NvdXJjZS1jb2RlJykgU291cmNlIENvZGVcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2NoYW5nZWxvZycpIENoYW5nZWxvZ1xcblxcbiAgICBtYWluLmx5LW1haW4jYXBwbGljYXRpb24tcm9vdChkYXRhLXRhdW51cz0nbW9kZWwnKSE9cGFydGlhbFxcbiAgICBzY3JpcHQoc3JjPScvanMvYWxsLmpzJylcXG5cIik7XG59XG59IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGVtcGxhdGVzID0ge1xuICAnZG9jdW1lbnRhdGlvbi9hYm91dCc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9hcGknOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMnKSxcbiAgJ2Vycm9yL25vdC1mb3VuZCc6IHJlcXVpcmUoJy4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzJyksXG4gICdsYXlvdXQnOiByZXF1aXJlKCcuL3ZpZXdzL2xheW91dC5qcycpXG59O1xuXG52YXIgY29udHJvbGxlcnMgPSB7XG4gICdkb2N1bWVudGF0aW9uL2Fib3V0JzogcmVxdWlyZSgnLi4vY2xpZW50L2pzL2NvbnRyb2xsZXJzL2RvY3VtZW50YXRpb24vYWJvdXQuanMnKVxufTtcblxudmFyIHJvdXRlcyA9IFtcbiAge1xuICAgIHJvdXRlOiAnLycsXG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hYm91dCdcbiAgfSxcbiAge1xuICAgIHJvdXRlOiAnL2dldHRpbmctc3RhcnRlZCcsXG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQnXG4gIH0sXG4gIHtcbiAgICByb3V0ZTogJy9hcGknLFxuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vYXBpJ1xuICB9LFxuICB7XG4gICAgcm91dGU6ICcvY29tcGxlbWVudHMnLFxuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMnXG4gIH0sXG4gIHtcbiAgICByb3V0ZTogJy9wZXJmb3JtYW5jZScsXG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZSdcbiAgfSxcbiAge1xuICAgIHJvdXRlOiAnL3NvdXJjZS1jb2RlJyxcbiAgICBpZ25vcmU6IHRydWVcbiAgfSxcbiAge1xuICAgIHJvdXRlOiAnL2NoYW5nZWxvZycsXG4gICAgaWdub3JlOiB0cnVlXG4gIH0sXG4gIHtcbiAgICByb3V0ZTogJy86Y2F0Y2hhbGwqJyxcbiAgICBhY3Rpb246ICdlcnJvci9ub3QtZm91bmQnXG4gIH1cbl07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcbiAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxuICByb3V0ZXM6IHJvdXRlc1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnNvbGUubG9nKCdXZWxjb21lIHRvIFRhdW51cyBkb2N1bWVudGF0aW9uIG1pbmktc2l0ZSEnKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciAkID0gcmVxdWlyZSgnZG9taW51cycpO1xudmFyIHJhZiA9IHJlcXVpcmUoJ3JhZicpO1xudmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xudmFyIHRocm90dGxlID0gcmVxdWlyZSgnLi90aHJvdHRsZScpO1xudmFyIHNsb3dTY3JvbGxDaGVjayA9IHRocm90dGxlKHNjcm9sbENoZWNrLCA1MCk7XG52YXIgaHggPSAvXmhbMS02XSQvaTtcbnZhciBoZWFkaW5nO1xuXG5mdW5jdGlvbiBjb252ZW50aW9ucyAoY29udGFpbmVyKSB7XG4gICQoJ2JvZHknKS5vbignY2xpY2snLCAnaDEsaDIsaDMsaDQsaDUsaDYnLCBoZWFkaW5nQ2xpY2spO1xuXG4gIHJhZihzY3JvbGwpO1xufVxuXG5mdW5jdGlvbiBzY3JvbGwgKCkge1xuICBzbG93U2Nyb2xsQ2hlY2soKTtcbiAgcmFmKHNjcm9sbCk7XG59XG5cbmZ1bmN0aW9uIHNjcm9sbENoZWNrICgpIHtcbiAgdmFyIGZvdW5kID0gJCgnbWFpbicpLmZpbmQoJ2gxLGgyLGgzLGg0LGg1LGg2JykuZmlsdGVyKGluVmlld3BvcnQpO1xuICBpZiAoZm91bmQubGVuZ3RoID09PSAwIHx8IGhlYWRpbmcgJiYgZm91bmRbMF0gPT09IGhlYWRpbmdbMF0pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGhlYWRpbmcpIHtcbiAgICBoZWFkaW5nLnJlbW92ZUNsYXNzKCd1di1oaWdobGlnaHQnKTtcbiAgfVxuICBoZWFkaW5nID0gZm91bmQuaSgwKTtcbiAgaGVhZGluZy5hZGRDbGFzcygndXYtaGlnaGxpZ2h0Jyk7XG59XG5cbmZ1bmN0aW9uIGluVmlld3BvcnQgKGVsZW1lbnQpIHtcbiAgdmFyIHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICB2YXIgdmlld2FibGUgPSAoXG4gICAgTWF0aC5jZWlsKHJlY3QudG9wKSA+PSAwICYmXG4gICAgTWF0aC5jZWlsKHJlY3QubGVmdCkgPj0gMCAmJlxuICAgIE1hdGguZmxvb3IocmVjdC5ib3R0b20pIDw9ICh3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkgJiZcbiAgICBNYXRoLmZsb29yKHJlY3QucmlnaHQpIDw9ICh3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGgpXG4gICk7XG4gIHJldHVybiB2aWV3YWJsZTtcbn1cblxuZnVuY3Rpb24gZmluZEhlYWRpbmcgKGUpIHtcbiAgdmFyIGggPSBlLnRhcmdldDtcbiAgd2hpbGUgKGggJiYgIWh4LnRlc3QoaC50YWdOYW1lKSkge1xuICAgIGggPSBoLnBhcmVudEVsZW1lbnQ7XG4gIH1cbiAgcmV0dXJuIGg7XG59XG5cbmZ1bmN0aW9uIGhlYWRpbmdDbGljayAoZSkge1xuICB2YXIgaCA9IGZpbmRIZWFkaW5nKGUpO1xuICBpZiAoaCAmJiBoLmlkKSB7XG4gICAgdGF1bnVzLm5hdmlnYXRlKCcjJyArIGguaWQpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY29udmVudGlvbnM7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbi8vIGltcG9ydCB0aGUgdGF1bnVzIG1vZHVsZVxudmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xuXG4vLyBpbXBvcnQgdGhlIHdpcmluZyBtb2R1bGUgZXhwb3J0ZWQgYnkgVGF1bnVzXG52YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcblxuLy8gaW1wb3J0IGNvbnZlbnRpb25zXG52YXIgY29udmVudGlvbnMgPSByZXF1aXJlKCcuL2NvbnZlbnRpb25zJyk7XG5cbi8vIGdldCB0aGUgPG1haW4+IGVsZW1lbnRcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGxpY2F0aW9uLXJvb3QnKTtcblxuLy8gc2V0IHVwIGNvbnZlbnRpb25zIHRoYXQgZ2V0IGV4ZWN1dGVkIGZvciBldmVyeSB2aWV3XG50YXVudXMub24oJ3JlbmRlcicsIGNvbnZlbnRpb25zKTtcblxuLy8gbW91bnQgdGF1bnVzIHNvIGl0IHN0YXJ0cyBpdHMgcm91dGluZyBlbmdpbmVcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xuXG4vLyBjcmVhdGUgZ2xvYmFscyB0byBtYWtlIGl0IGVhc3kgdG8gZGVidWdcbi8vIGRvbid0IGRvIHRoaXMgaW4gcHJvZHVjdGlvbiFcbmdsb2JhbC4kID0gcmVxdWlyZSgnZG9taW51cycpO1xuZ2xvYmFsLnRhdW51cyA9IHRhdW51cztcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIHRocm90dGxlIChmbiwgdCkge1xuICB2YXIgY2FjaGU7XG4gIHZhciBsYXN0ID0gLTE7XG4gIHJldHVybiBmdW5jdGlvbiB0aHJvdHRsZWQgKCkge1xuICAgIHZhciBub3cgPSBEYXRlLm5vdygpO1xuICAgIGlmIChub3cgLSBsYXN0ID4gdCkge1xuICAgICAgY2FjaGUgPSBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgbGFzdCA9IG5vdztcbiAgICB9XG4gICAgcmV0dXJuIGNhY2hlO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRocm90dGxlO1xuZ2xvYmFsLnRocm90dGxlPXRocm90dGxlO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciBwb3NlciA9IHJlcXVpcmUoJy4vc3JjL25vZGUnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBwb3NlcjtcblxuWydBcnJheScsICdGdW5jdGlvbicsICdPYmplY3QnLCAnRGF0ZScsICdTdHJpbmcnXS5mb3JFYWNoKHBvc2UpO1xuXG5mdW5jdGlvbiBwb3NlICh0eXBlKSB7XG4gIHBvc2VyW3R5cGVdID0gZnVuY3Rpb24gcG9zZUNvbXB1dGVkVHlwZSAoKSB7IHJldHVybiBwb3Nlcih0eXBlKTsgfTtcbn1cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGQgPSBnbG9iYWwuZG9jdW1lbnQ7XG5cbmZ1bmN0aW9uIHBvc2VyICh0eXBlKSB7XG4gIHZhciBpZnJhbWUgPSBkLmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXG4gIGlmcmFtZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICBkLmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblxuICByZXR1cm4gbWFwKHR5cGUsIGlmcmFtZS5jb250ZW50V2luZG93KTtcbn1cblxuZnVuY3Rpb24gbWFwICh0eXBlLCBzb3VyY2UpIHsgLy8gZm9yd2FyZCBwb2x5ZmlsbHMgdG8gdGhlIHN0b2xlbiByZWZlcmVuY2UhXG4gIHZhciBvcmlnaW5hbCA9IHdpbmRvd1t0eXBlXS5wcm90b3R5cGU7XG4gIHZhciB2YWx1ZSA9IHNvdXJjZVt0eXBlXTtcbiAgdmFyIHByb3A7XG5cbiAgZm9yIChwcm9wIGluIG9yaWdpbmFsKSB7XG4gICAgdmFsdWUucHJvdG90eXBlW3Byb3BdID0gb3JpZ2luYWxbcHJvcF07XG4gIH1cblxuICByZXR1cm4gdmFsdWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcG9zZXI7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXhwYW5kbyA9ICdzZWt0b3ItJyArIERhdGUubm93KCk7XG52YXIgcnNpYmxpbmdzID0gL1srfl0vO1xudmFyIGRvY3VtZW50ID0gZ2xvYmFsLmRvY3VtZW50O1xudmFyIGRlbCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbnZhciBtYXRjaCA9IGRlbC5tYXRjaGVzIHx8XG4gICAgICAgICAgICBkZWwud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8XG4gICAgICAgICAgICBkZWwubW96TWF0Y2hlc1NlbGVjdG9yIHx8XG4gICAgICAgICAgICBkZWwub01hdGNoZXNTZWxlY3RvciB8fFxuICAgICAgICAgICAgZGVsLm1zTWF0Y2hlc1NlbGVjdG9yO1xuXG5mdW5jdGlvbiBxc2EgKHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gIHZhciBleGlzdGVkLCBpZCwgcHJlZml4LCBwcmVmaXhlZCwgYWRhcHRlciwgaGFjayA9IGNvbnRleHQgIT09IGRvY3VtZW50O1xuICBpZiAoaGFjaykgeyAvLyBpZCBoYWNrIGZvciBjb250ZXh0LXJvb3RlZCBxdWVyaWVzXG4gICAgZXhpc3RlZCA9IGNvbnRleHQuZ2V0QXR0cmlidXRlKCdpZCcpO1xuICAgIGlkID0gZXhpc3RlZCB8fCBleHBhbmRvO1xuICAgIHByZWZpeCA9ICcjJyArIGlkICsgJyAnO1xuICAgIHByZWZpeGVkID0gcHJlZml4ICsgc2VsZWN0b3IucmVwbGFjZSgvLC9nLCAnLCcgKyBwcmVmaXgpO1xuICAgIGFkYXB0ZXIgPSByc2libGluZ3MudGVzdChzZWxlY3RvcikgJiYgY29udGV4dC5wYXJlbnROb2RlO1xuICAgIGlmICghZXhpc3RlZCkgeyBjb250ZXh0LnNldEF0dHJpYnV0ZSgnaWQnLCBpZCk7IH1cbiAgfVxuICB0cnkge1xuICAgIHJldHVybiAoYWRhcHRlciB8fCBjb250ZXh0KS5xdWVyeVNlbGVjdG9yQWxsKHByZWZpeGVkIHx8IHNlbGVjdG9yKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBbXTtcbiAgfSBmaW5hbGx5IHtcbiAgICBpZiAoZXhpc3RlZCA9PT0gbnVsbCkgeyBjb250ZXh0LnJlbW92ZUF0dHJpYnV0ZSgnaWQnKTsgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGZpbmQgKHNlbGVjdG9yLCBjdHgsIGNvbGxlY3Rpb24sIHNlZWQpIHtcbiAgdmFyIGVsZW1lbnQ7XG4gIHZhciBjb250ZXh0ID0gY3R4IHx8IGRvY3VtZW50O1xuICB2YXIgcmVzdWx0cyA9IGNvbGxlY3Rpb24gfHwgW107XG4gIHZhciBpID0gMDtcbiAgaWYgKHR5cGVvZiBzZWxlY3RvciAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuICBpZiAoY29udGV4dC5ub2RlVHlwZSAhPT0gMSAmJiBjb250ZXh0Lm5vZGVUeXBlICE9PSA5KSB7XG4gICAgcmV0dXJuIFtdOyAvLyBiYWlsIGlmIGNvbnRleHQgaXMgbm90IGFuIGVsZW1lbnQgb3IgZG9jdW1lbnRcbiAgfVxuICBpZiAoc2VlZCkge1xuICAgIHdoaWxlICgoZWxlbWVudCA9IHNlZWRbaSsrXSkpIHtcbiAgICAgIGlmIChtYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IpKSB7XG4gICAgICAgIHJlc3VsdHMucHVzaChlbGVtZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cy5wdXNoLmFwcGx5KHJlc3VsdHMsIHFzYShzZWxlY3RvciwgY29udGV4dCkpO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBtYXRjaGVzIChzZWxlY3RvciwgZWxlbWVudHMpIHtcbiAgcmV0dXJuIGZpbmQoc2VsZWN0b3IsIG51bGwsIG51bGwsIGVsZW1lbnRzKTtcbn1cblxuZnVuY3Rpb24gbWF0Y2hlc1NlbGVjdG9yIChlbGVtZW50LCBzZWxlY3Rvcikge1xuICByZXR1cm4gbWF0Y2guY2FsbChlbGVtZW50LCBzZWxlY3Rvcik7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZmluZDtcblxuZmluZC5tYXRjaGVzID0gbWF0Y2hlcztcbmZpbmQubWF0Y2hlc1NlbGVjdG9yID0gbWF0Y2hlc1NlbGVjdG9yO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHBvc2VyID0gcmVxdWlyZSgncG9zZXInKTtcbnZhciBEb21pbnVzID0gcG9zZXIuQXJyYXkoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBEb21pbnVzO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgJCA9IHJlcXVpcmUoJy4vcHVibGljJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIGRvbSA9IHJlcXVpcmUoJy4vZG9tJyk7XG52YXIgY2xhc3NlcyA9IHJlcXVpcmUoJy4vY2xhc3NlcycpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xuXG5mdW5jdGlvbiBlcXVhbHMgKHNlbGVjdG9yKSB7XG4gIHJldHVybiBmdW5jdGlvbiBlcXVhbHMgKGVsZW0pIHtcbiAgICByZXR1cm4gZG9tLm1hdGNoZXMoZWxlbSwgc2VsZWN0b3IpO1xuICB9O1xufVxuXG5mdW5jdGlvbiBzdHJhaWdodCAocHJvcCwgb25lKSB7XG4gIHJldHVybiBmdW5jdGlvbiBkb21NYXBwaW5nIChzZWxlY3Rvcikge1xuICAgIHZhciByZXN1bHQgPSB0aGlzLm1hcChmdW5jdGlvbiAoZWxlbSkge1xuICAgICAgcmV0dXJuIGRvbVtwcm9wXShlbGVtLCBzZWxlY3Rvcik7XG4gICAgfSk7XG4gICAgdmFyIHJlc3VsdHMgPSBjb3JlLmZsYXR0ZW4ocmVzdWx0KTtcbiAgICByZXR1cm4gb25lID8gcmVzdWx0c1swXSA6IHJlc3VsdHM7XG4gIH07XG59XG5cbkRvbWludXMucHJvdG90eXBlLnByZXYgPSBzdHJhaWdodCgncHJldicpO1xuRG9taW51cy5wcm90b3R5cGUubmV4dCA9IHN0cmFpZ2h0KCduZXh0Jyk7XG5Eb21pbnVzLnByb3RvdHlwZS5wYXJlbnQgPSBzdHJhaWdodCgncGFyZW50Jyk7XG5Eb21pbnVzLnByb3RvdHlwZS5wYXJlbnRzID0gc3RyYWlnaHQoJ3BhcmVudHMnKTtcbkRvbWludXMucHJvdG90eXBlLmNoaWxkcmVuID0gc3RyYWlnaHQoJ2NoaWxkcmVuJyk7XG5Eb21pbnVzLnByb3RvdHlwZS5maW5kID0gc3RyYWlnaHQoJ3FzYScpO1xuRG9taW51cy5wcm90b3R5cGUuZmluZE9uZSA9IHN0cmFpZ2h0KCdxcycsIHRydWUpO1xuXG5Eb21pbnVzLnByb3RvdHlwZS53aGVyZSA9IGZ1bmN0aW9uIChzZWxlY3Rvcikge1xuICByZXR1cm4gdGhpcy5maWx0ZXIoZXF1YWxzKHNlbGVjdG9yKSk7XG59O1xuXG5Eb21pbnVzLnByb3RvdHlwZS5pcyA9IGZ1bmN0aW9uIChzZWxlY3Rvcikge1xuICByZXR1cm4gdGhpcy5zb21lKGVxdWFscyhzZWxlY3RvcikpO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUuaSA9IGZ1bmN0aW9uIChpbmRleCkge1xuICByZXR1cm4gbmV3IERvbWludXModGhpc1tpbmRleF0pO1xufTtcblxuZnVuY3Rpb24gY29tcGFyZUZhY3RvcnkgKGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiBjb21wYXJlICgpIHtcbiAgICAkLmFwcGx5KG51bGwsIGFyZ3VtZW50cykuZm9yRWFjaChmbiwgdGhpcyk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG59XG5cbkRvbWludXMucHJvdG90eXBlLmFuZCA9IGNvbXBhcmVGYWN0b3J5KGZ1bmN0aW9uIGFkZE9uZSAoZWxlbSkge1xuICBpZiAodGhpcy5pbmRleE9mKGVsZW0pID09PSAtMSkge1xuICAgIHRoaXMucHVzaChlbGVtKTtcbiAgfVxuICByZXR1cm4gdGhpcztcbn0pO1xuXG5Eb21pbnVzLnByb3RvdHlwZS5idXQgPSBjb21wYXJlRmFjdG9yeShmdW5jdGlvbiBhZGRPbmUgKGVsZW0pIHtcbiAgdmFyIGluZGV4ID0gdGhpcy5pbmRleE9mKGVsZW0pO1xuICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgdGhpcy5zcGxpY2UoaW5kZXgsIDEpO1xuICB9XG4gIHJldHVybiB0aGlzO1xufSk7XG5cbkRvbWludXMucHJvdG90eXBlLmNzcyA9IGZ1bmN0aW9uIChuYW1lLCB2YWx1ZSkge1xuICB2YXIgcHJvcHM7XG4gIHZhciBtYW55ID0gbmFtZSAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCc7XG4gIHZhciBnZXR0ZXIgPSAhbWFueSAmJiAhdmFsdWU7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gdGhpcy5sZW5ndGggPyBkb20uZ2V0Q3NzKHRoaXNbMF0sIG5hbWUpIDogbnVsbDtcbiAgfVxuICBpZiAobWFueSkge1xuICAgIHByb3BzID0gbmFtZTtcbiAgfSBlbHNlIHtcbiAgICBwcm9wcyA9IHt9O1xuICAgIHByb3BzW25hbWVdID0gdmFsdWU7XG4gIH1cbiAgdGhpcy5mb3JFYWNoKGRvbS5zZXRDc3MocHJvcHMpKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5Eb21pbnVzLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uICh0eXBlcywgZmlsdGVyLCBmbikge1xuICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICB0eXBlcy5zcGxpdCgnICcpLmZvckVhY2goZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgIGRvbS5vbihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24gKHR5cGVzLCBmaWx0ZXIsIGZuKSB7XG4gIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgIHR5cGVzLnNwbGl0KCcgJykuZm9yRWFjaChmdW5jdGlvbiAodHlwZSkge1xuICAgICAgZG9tLm9mZihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuW1xuICBbJ2FkZENsYXNzJywgY2xhc3Nlcy5hZGRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3NldENsYXNzJywgY2xhc3Nlcy5zZXRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3JlbW92ZScsIGRvbS5yZW1vdmVdXG5dLmZvckVhY2gobWFwTWV0aG9kcyk7XG5cbmZ1bmN0aW9uIG1hcE1ldGhvZHMgKGRhdGEpIHtcbiAgRG9taW51cy5wcm90b3R5cGVbZGF0YVswXV0gPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICAgIGRhdGFbMV0oZWxlbSwgdmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5bXG4gIFsnYXBwZW5kJywgZG9tLmFwcGVuZF0sXG4gIFsnYXBwZW5kVG8nLCBkb20uYXBwZW5kVG9dLFxuICBbJ3ByZXBlbmQnLCBkb20ucHJlcGVuZF0sXG4gIFsncHJlcGVuZFRvJywgZG9tLnByZXBlbmRUb10sXG4gIFsnYmVmb3JlJywgZG9tLmJlZm9yZV0sXG4gIFsnYmVmb3JlT2YnLCBkb20uYmVmb3JlT2ZdLFxuICBbJ2FmdGVyJywgZG9tLmFmdGVyXSxcbiAgWydhZnRlck9mJywgZG9tLmFmdGVyT2ZdLFxuICBbJ3Nob3cnLCBkb20uc2hvd10sXG4gIFsnaGlkZScsIGRvbS5oaWRlXVxuXS5mb3JFYWNoKG1hcE1hbmlwdWxhdGlvbik7XG5cbmZ1bmN0aW9uIG1hcE1hbmlwdWxhdGlvbiAoZGF0YSkge1xuICBEb21pbnVzLnByb3RvdHlwZVtkYXRhWzBdXSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIGRhdGFbMV0odGhpcywgdmFsdWUpO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5oYXNDbGFzcyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICByZXR1cm4gdGhpcy5zb21lKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgcmV0dXJuIGNsYXNzZXMuY29udGFpbnMoZWxlbSwgdmFsdWUpO1xuICB9KTtcbn07XG5cbkRvbWludXMucHJvdG90eXBlLmF0dHIgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgdmFyIGhhc2ggPSBuYW1lICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JztcbiAgdmFyIHNldCA9IGhhc2ggPyBzZXRNYW55IDogc2V0U2luZ2xlO1xuICB2YXIgc2V0dGVyID0gaGFzaCB8fCBhcmd1bWVudHMubGVuZ3RoID4gMTtcbiAgaWYgKHNldHRlcikge1xuICAgIHRoaXMuZm9yRWFjaChzZXQpO1xuICAgIHJldHVybiB0aGlzO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB0aGlzLmxlbmd0aCA/IGRvbS5nZXRBdHRyKHRoaXNbMF0sIG5hbWUpIDogbnVsbDtcbiAgfVxuICBmdW5jdGlvbiBzZXRNYW55IChlbGVtKSB7XG4gICAgZG9tLm1hbnlBdHRyKGVsZW0sIG5hbWUpO1xuICB9XG4gIGZ1bmN0aW9uIHNldFNpbmdsZSAoZWxlbSkge1xuICAgIGRvbS5hdHRyKGVsZW0sIG5hbWUsIHZhbHVlKTtcbiAgfVxufTtcblxuZnVuY3Rpb24ga2V5VmFsdWUgKGtleSwgdmFsdWUpIHtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAyO1xuICBpZiAoZ2V0dGVyKSB7XG4gICAgcmV0dXJuIHRoaXMubGVuZ3RoID8gZG9tW2tleV0odGhpc1swXSkgOiAnJztcbiAgfVxuICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICBkb21ba2V5XShlbGVtLCB2YWx1ZSk7XG4gIH0pO1xuICByZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24ga2V5VmFsdWVQcm9wZXJ0eSAocHJvcCkge1xuICBEb21pbnVzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uIGFjY2Vzc29yICh2YWx1ZSkge1xuICAgIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMTtcbiAgICBpZiAoZ2V0dGVyKSB7XG4gICAgICByZXR1cm4ga2V5VmFsdWUuY2FsbCh0aGlzLCBwcm9wKTtcbiAgICB9XG4gICAgcmV0dXJuIGtleVZhbHVlLmNhbGwodGhpcywgcHJvcCwgdmFsdWUpO1xuICB9O1xufVxuXG5bJ2h0bWwnLCAndGV4dCcsICd2YWx1ZSddLmZvckVhY2goa2V5VmFsdWVQcm9wZXJ0eSk7XG5cbkRvbWludXMucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5tYXAoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICByZXR1cm4gZG9tLmNsb25lKGVsZW0pO1xuICB9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9wdWJsaWMnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRyaW0gPSAvXlxccyt8XFxzKyQvZztcbnZhciB3aGl0ZXNwYWNlID0gL1xccysvZztcblxuZnVuY3Rpb24gaW50ZXJwcmV0IChpbnB1dCkge1xuICByZXR1cm4gdHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJyA/IGlucHV0LnJlcGxhY2UodHJpbSwgJycpLnNwbGl0KHdoaXRlc3BhY2UpIDogaW5wdXQ7XG59XG5cbmZ1bmN0aW9uIGNsYXNzZXMgKG5vZGUpIHtcbiAgcmV0dXJuIG5vZGUuY2xhc3NOYW1lLnJlcGxhY2UodHJpbSwgJycpLnNwbGl0KHdoaXRlc3BhY2UpO1xufVxuXG5mdW5jdGlvbiBzZXQgKG5vZGUsIGlucHV0KSB7XG4gIG5vZGUuY2xhc3NOYW1lID0gaW50ZXJwcmV0KGlucHV0KS5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIGFkZCAobm9kZSwgaW5wdXQpIHtcbiAgdmFyIGN1cnJlbnQgPSByZW1vdmUobm9kZSwgaW5wdXQpO1xuICB2YXIgdmFsdWVzID0gaW50ZXJwcmV0KGlucHV0KTtcbiAgY3VycmVudC5wdXNoLmFwcGx5KGN1cnJlbnQsIHZhbHVlcyk7XG4gIHNldChub2RlLCBjdXJyZW50KTtcbiAgcmV0dXJuIGN1cnJlbnQ7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZSAobm9kZSwgaW5wdXQpIHtcbiAgdmFyIGN1cnJlbnQgPSBjbGFzc2VzKG5vZGUpO1xuICB2YXIgdmFsdWVzID0gaW50ZXJwcmV0KGlucHV0KTtcbiAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIGkgPSBjdXJyZW50LmluZGV4T2YodmFsdWUpO1xuICAgIGlmIChpICE9PSAtMSkge1xuICAgICAgY3VycmVudC5zcGxpY2UoaSwgMSk7XG4gICAgfVxuICB9KTtcbiAgc2V0KG5vZGUsIGN1cnJlbnQpO1xuICByZXR1cm4gY3VycmVudDtcbn1cblxuZnVuY3Rpb24gY29udGFpbnMgKG5vZGUsIGlucHV0KSB7XG4gIHZhciBjdXJyZW50ID0gY2xhc3Nlcyhub2RlKTtcbiAgdmFyIHZhbHVlcyA9IGludGVycHJldChpbnB1dCk7XG5cbiAgcmV0dXJuIHZhbHVlcy5ldmVyeShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gY3VycmVudC5pbmRleE9mKHZhbHVlKSAhPT0gLTE7XG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGQsXG4gIHJlbW92ZTogcmVtb3ZlLFxuICBjb250YWluczogY29udGFpbnMsXG4gIHNldDogc2V0LFxuICBnZXQ6IGNsYXNzZXNcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0ZXN0ID0gcmVxdWlyZSgnLi90ZXN0Jyk7XG52YXIgRG9taW51cyA9IHJlcXVpcmUoJy4vRG9taW51cy5jdG9yJyk7XG52YXIgcHJvdG8gPSBEb21pbnVzLnByb3RvdHlwZTtcblxuZnVuY3Rpb24gQXBwbGllZCAoYXJncykge1xuICByZXR1cm4gRG9taW51cy5hcHBseSh0aGlzLCBhcmdzKTtcbn1cblxuQXBwbGllZC5wcm90b3R5cGUgPSBwcm90bztcblxuWydtYXAnLCAnZmlsdGVyJywgJ2NvbmNhdCddLmZvckVhY2goZW5zdXJlKTtcblxuZnVuY3Rpb24gZW5zdXJlIChrZXkpIHtcbiAgdmFyIG9yaWdpbmFsID0gcHJvdG9ba2V5XTtcbiAgcHJvdG9ba2V5XSA9IGZ1bmN0aW9uIGFwcGxpZWQgKCkge1xuICAgIHJldHVybiBhcHBseShvcmlnaW5hbC5hcHBseSh0aGlzLCBhcmd1bWVudHMpKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gYXBwbHkgKGEpIHtcbiAgcmV0dXJuIG5ldyBBcHBsaWVkKGEpO1xufVxuXG5mdW5jdGlvbiBjYXN0IChhKSB7XG4gIGlmIChhIGluc3RhbmNlb2YgRG9taW51cykge1xuICAgIHJldHVybiBhO1xuICB9XG4gIGlmICghYSkge1xuICAgIHJldHVybiBuZXcgRG9taW51cygpO1xuICB9XG4gIGlmICh0ZXN0LmlzRWxlbWVudChhKSkge1xuICAgIHJldHVybiBuZXcgRG9taW51cyhhKTtcbiAgfVxuICBpZiAoIXRlc3QuaXNBcnJheShhKSkge1xuICAgIHJldHVybiBuZXcgRG9taW51cygpO1xuICB9XG4gIHJldHVybiBhcHBseShhKS5maWx0ZXIoZnVuY3Rpb24gKGkpIHtcbiAgICByZXR1cm4gdGVzdC5pc0VsZW1lbnQoaSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBmbGF0dGVuIChhLCBjYWNoZSkge1xuICByZXR1cm4gYS5yZWR1Y2UoZnVuY3Rpb24gKGN1cnJlbnQsIGl0ZW0pIHtcbiAgICBpZiAoRG9taW51cy5pc0FycmF5KGl0ZW0pKSB7XG4gICAgICByZXR1cm4gZmxhdHRlbihpdGVtLCBjdXJyZW50KTtcbiAgICB9IGVsc2UgaWYgKGN1cnJlbnQuaW5kZXhPZihpdGVtKSA9PT0gLTEpIHtcbiAgICAgIHJldHVybiBjdXJyZW50LmNvbmNhdChpdGVtKTtcbiAgICB9XG4gICAgcmV0dXJuIGN1cnJlbnQ7XG4gIH0sIGNhY2hlIHx8IG5ldyBEb21pbnVzKCkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXBwbHk6IGFwcGx5LFxuICBjYXN0OiBjYXN0LFxuICBmbGF0dGVuOiBmbGF0dGVuXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgc2VrdG9yID0gcmVxdWlyZSgnc2VrdG9yJyk7XG52YXIgRG9taW51cyA9IHJlcXVpcmUoJy4vRG9taW51cy5jdG9yJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIGV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG52YXIgdGV4dCA9IHJlcXVpcmUoJy4vdGV4dCcpO1xudmFyIHRlc3QgPSByZXF1aXJlKCcuL3Rlc3QnKTtcbnZhciBhcGkgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIGRlbGVnYXRlcyA9IHt9O1xuXG5mdW5jdGlvbiBjYXN0Q29udGV4dCAoY29udGV4dCkge1xuICBpZiAodHlwZW9mIGNvbnRleHQgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGFwaS5xcyhudWxsLCBjb250ZXh0KTtcbiAgfVxuICBpZiAodGVzdC5pc0VsZW1lbnQoY29udGV4dCkpIHtcbiAgICByZXR1cm4gY29udGV4dDtcbiAgfVxuICBpZiAoY29udGV4dCBpbnN0YW5jZW9mIERvbWludXMpIHtcbiAgICByZXR1cm4gY29udGV4dFswXTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuYXBpLnFzYSA9IGZ1bmN0aW9uIChlbGVtLCBzZWxlY3Rvcikge1xuICB2YXIgcmVzdWx0cyA9IG5ldyBEb21pbnVzKCk7XG4gIHJldHVybiBzZWt0b3Ioc2VsZWN0b3IsIGNhc3RDb250ZXh0KGVsZW0pLCByZXN1bHRzKTtcbn07XG5cbmFwaS5xcyA9IGZ1bmN0aW9uIChlbGVtLCBzZWxlY3Rvcikge1xuICByZXR1cm4gYXBpLnFzYShlbGVtLCBzZWxlY3RvcilbMF07XG59O1xuXG5hcGkubWF0Y2hlcyA9IGZ1bmN0aW9uIChlbGVtLCBzZWxlY3Rvcikge1xuICByZXR1cm4gc2VrdG9yLm1hdGNoZXNTZWxlY3RvcihlbGVtLCBzZWxlY3Rvcik7XG59O1xuXG5mdW5jdGlvbiByZWxhdGVkRmFjdG9yeSAocHJvcCkge1xuICByZXR1cm4gZnVuY3Rpb24gcmVsYXRlZCAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgICB2YXIgcmVsYXRpdmUgPSBlbGVtW3Byb3BdO1xuICAgIGlmIChyZWxhdGl2ZSkge1xuICAgICAgaWYgKCFzZWxlY3RvciB8fCBhcGkubWF0Y2hlcyhyZWxhdGl2ZSwgc2VsZWN0b3IpKSB7XG4gICAgICAgIHJldHVybiBjb3JlLmNhc3QocmVsYXRpdmUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IERvbWludXMoKTtcbiAgfTtcbn1cblxuYXBpLnByZXYgPSByZWxhdGVkRmFjdG9yeSgncHJldmlvdXNFbGVtZW50U2libGluZycpO1xuYXBpLm5leHQgPSByZWxhdGVkRmFjdG9yeSgnbmV4dEVsZW1lbnRTaWJsaW5nJyk7XG5hcGkucGFyZW50ID0gcmVsYXRlZEZhY3RvcnkoJ3BhcmVudEVsZW1lbnQnKTtcblxuZnVuY3Rpb24gbWF0Y2hlcyAoZWxlbSwgdmFsdWUpIHtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERvbWludXMpIHtcbiAgICByZXR1cm4gdmFsdWUuaW5kZXhPZihlbGVtKSAhPT0gLTE7XG4gIH1cbiAgaWYgKHRlc3QuaXNFbGVtZW50KHZhbHVlKSkge1xuICAgIHJldHVybiBlbGVtID09PSB2YWx1ZTtcbiAgfVxuICByZXR1cm4gYXBpLm1hdGNoZXMoZWxlbSwgdmFsdWUpO1xufVxuXG5hcGkucGFyZW50cyA9IGZ1bmN0aW9uIChlbGVtLCB2YWx1ZSkge1xuICB2YXIgbm9kZXMgPSBbXTtcbiAgdmFyIG5vZGUgPSBlbGVtO1xuICB3aGlsZSAobm9kZS5wYXJlbnRFbGVtZW50KSB7XG4gICAgaWYgKG1hdGNoZXMobm9kZS5wYXJlbnRFbGVtZW50LCB2YWx1ZSkpIHtcbiAgICAgIG5vZGVzLnB1c2gobm9kZS5wYXJlbnRFbGVtZW50KTtcbiAgICB9XG4gICAgbm9kZSA9IG5vZGUucGFyZW50RWxlbWVudDtcbiAgfVxuICByZXR1cm4gY29yZS5hcHBseShub2Rlcyk7XG59O1xuXG5hcGkuY2hpbGRyZW4gPSBmdW5jdGlvbiAoZWxlbSwgdmFsdWUpIHtcbiAgdmFyIG5vZGVzID0gW107XG4gIHZhciBjaGlsZHJlbiA9IGVsZW0uY2hpbGRyZW47XG4gIHZhciBjaGlsZDtcbiAgdmFyIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgIGNoaWxkID0gY2hpbGRyZW5baV07XG4gICAgaWYgKG1hdGNoZXMoY2hpbGQsIHZhbHVlKSkge1xuICAgICAgbm9kZXMucHVzaChjaGlsZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb3JlLmFwcGx5KG5vZGVzKTtcbn07XG5cbi8vIHRoaXMgbWV0aG9kIGNhY2hlcyBkZWxlZ2F0ZXMgc28gdGhhdCAub2ZmKCkgd29ya3Mgc2VhbWxlc3NseVxuZnVuY3Rpb24gZGVsZWdhdGUgKHJvb3QsIGZpbHRlciwgZm4pIHtcbiAgaWYgKGRlbGVnYXRlc1tmbi5fZGRdKSB7XG4gICAgcmV0dXJuIGRlbGVnYXRlc1tmbi5fZGRdO1xuICB9XG4gIGZuLl9kZCA9IERhdGUubm93KCk7XG4gIGRlbGVnYXRlc1tmbi5fZGRdID0gZGVsZWdhdG9yO1xuICBmdW5jdGlvbiBkZWxlZ2F0b3IgKGUpIHtcbiAgICB2YXIgZWxlbSA9IGUudGFyZ2V0O1xuICAgIHdoaWxlIChlbGVtICYmIGVsZW0gIT09IHJvb3QpIHtcbiAgICAgIGlmIChhcGkubWF0Y2hlcyhlbGVtLCBmaWx0ZXIpKSB7XG4gICAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IHJldHVybjtcbiAgICAgIH1cbiAgICAgIGVsZW0gPSBlbGVtLnBhcmVudEVsZW1lbnQ7XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWxlZ2F0b3I7XG59XG5cbmFwaS5vbiA9IGZ1bmN0aW9uIChlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKSB7XG4gIGlmIChmbiA9PT0gdm9pZCAwKSB7XG4gICAgZXZlbnRzLmFkZChlbGVtLCB0eXBlLCBmaWx0ZXIpOyAvLyBmaWx0ZXIgX2lzXyBmblxuICB9IGVsc2Uge1xuICAgIGV2ZW50cy5hZGQoZWxlbSwgdHlwZSwgZGVsZWdhdGUoZWxlbSwgZmlsdGVyLCBmbikpO1xuICB9XG59O1xuXG5hcGkub2ZmID0gZnVuY3Rpb24gKGVsZW0sIHR5cGUsIGZpbHRlciwgZm4pIHtcbiAgaWYgKGZuID09PSB2b2lkIDApIHtcbiAgICBldmVudHMucmVtb3ZlKGVsZW0sIHR5cGUsIGZpbHRlcik7IC8vIGZpbHRlciBfaXNfIGZuXG4gIH0gZWxzZSB7XG4gICAgZXZlbnRzLnJlbW92ZShlbGVtLCB0eXBlLCBkZWxlZ2F0ZShlbGVtLCBmaWx0ZXIsIGZuKSk7XG4gIH1cbn07XG5cbmFwaS5odG1sID0gZnVuY3Rpb24gKGVsZW0sIGh0bWwpIHtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAyO1xuICBpZiAoZ2V0dGVyKSB7XG4gICAgcmV0dXJuIGVsZW0uaW5uZXJIVE1MO1xuICB9IGVsc2Uge1xuICAgIGVsZW0uaW5uZXJIVE1MID0gaHRtbDtcbiAgfVxufTtcblxuYXBpLnRleHQgPSBmdW5jdGlvbiAoZWxlbSwgdGV4dCkge1xuICB2YXIgY2hlY2thYmxlID0gdGVzdC5pc0NoZWNrYWJsZShlbGVtKTtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAyO1xuICBpZiAoZ2V0dGVyKSB7XG4gICAgcmV0dXJuIGNoZWNrYWJsZSA/IGVsZW0udmFsdWUgOiBlbGVtLmlubmVyVGV4dCB8fCBlbGVtLnRleHRDb250ZW50O1xuICB9IGVsc2UgaWYgKGNoZWNrYWJsZSkge1xuICAgIGVsZW0udmFsdWUgPSB0ZXh0O1xuICB9IGVsc2Uge1xuICAgIGVsZW0uaW5uZXJUZXh0ID0gZWxlbS50ZXh0Q29udGVudCA9IHRleHQ7XG4gIH1cbn07XG5cbmFwaS52YWx1ZSA9IGZ1bmN0aW9uIChlbGVtLCB2YWx1ZSkge1xuICB2YXIgY2hlY2thYmxlID0gdGVzdC5pc0NoZWNrYWJsZShlbGVtKTtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAyO1xuICBpZiAoZ2V0dGVyKSB7XG4gICAgcmV0dXJuIGNoZWNrYWJsZSA/IGVsZW0uY2hlY2tlZCA6IGVsZW0udmFsdWU7XG4gIH0gZWxzZSBpZiAoY2hlY2thYmxlKSB7XG4gICAgZWxlbS5jaGVja2VkID0gdmFsdWU7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS52YWx1ZSA9IHZhbHVlO1xuICB9XG59O1xuXG5hcGkuYXR0ciA9IGZ1bmN0aW9uIChlbGVtLCBuYW1lLCB2YWx1ZSkge1xuICB2YXIgY2FtZWwgPSB0ZXh0Lmh5cGhlblRvQ2FtZWwobmFtZSk7XG4gIGlmIChjYW1lbCBpbiBlbGVtKSB7XG4gICAgZWxlbVtjYW1lbF0gPSB2YWx1ZTtcbiAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgZWxlbS5yZW1vdmVBdHRyaWJ1dGUobmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xuICB9XG59O1xuXG5hcGkuZ2V0QXR0ciA9IGZ1bmN0aW9uIChlbGVtLCBuYW1lKSB7XG4gIHZhciBjYW1lbCA9IHRleHQuaHlwaGVuVG9DYW1lbChuYW1lKTtcbiAgaWYgKGNhbWVsIGluIGVsZW0pIHtcbiAgICByZXR1cm4gZWxlbVtjYW1lbF07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGVsZW0uZ2V0QXR0cmlidXRlKG5hbWUpO1xuICB9XG59O1xuXG5hcGkubWFueUF0dHIgPSBmdW5jdGlvbiAoZWxlbSwgYXR0cnMpIHtcbiAgT2JqZWN0LmtleXMoYXR0cnMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHIpIHtcbiAgICBhcGkuYXR0cihlbGVtLCBhdHRyLCBhdHRyc1thdHRyXSk7XG4gIH0pO1xufTtcblxuYXBpLm1ha2UgPSBmdW5jdGlvbiAodHlwZSkge1xuICByZXR1cm4gbmV3IERvbWludXMoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0eXBlKSk7XG59O1xuXG5hcGkuY2xvbmUgPSBmdW5jdGlvbiAoZWxlbSkge1xuICByZXR1cm4gZWxlbS5jbG9uZU5vZGUodHJ1ZSk7XG59O1xuXG5hcGkucmVtb3ZlID0gZnVuY3Rpb24gKGVsZW0pIHtcbiAgaWYgKGVsZW0ucGFyZW50RWxlbWVudCkge1xuICAgIGVsZW0ucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZChlbGVtKTtcbiAgfVxufTtcblxuYXBpLmFwcGVuZCA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgaWYgKG1hbmlwdWxhdGlvbkd1YXJkKGVsZW0sIHRhcmdldCwgYXBpLmFwcGVuZCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZWxlbS5hcHBlbmRDaGlsZCh0YXJnZXQpO1xufTtcblxuYXBpLnByZXBlbmQgPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gIGlmIChtYW5pcHVsYXRpb25HdWFyZChlbGVtLCB0YXJnZXQsIGFwaS5wcmVwZW5kKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBlbGVtLmluc2VydEJlZm9yZSh0YXJnZXQsIGVsZW0uZmlyc3RDaGlsZCk7XG59O1xuXG5hcGkuYmVmb3JlID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICBpZiAobWFuaXB1bGF0aW9uR3VhcmQoZWxlbSwgdGFyZ2V0LCBhcGkuYmVmb3JlKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoZWxlbS5wYXJlbnRFbGVtZW50KSB7XG4gICAgZWxlbS5wYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZSh0YXJnZXQsIGVsZW0pO1xuICB9XG59O1xuXG5hcGkuYWZ0ZXIgPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gIGlmIChtYW5pcHVsYXRpb25HdWFyZChlbGVtLCB0YXJnZXQsIGFwaS5hZnRlcikpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGVsZW0ucGFyZW50RWxlbWVudCkge1xuICAgIGVsZW0ucGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUodGFyZ2V0LCBlbGVtLm5leHRTaWJsaW5nKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gbWFuaXB1bGF0aW9uR3VhcmQgKGVsZW0sIHRhcmdldCwgZm4pIHtcbiAgdmFyIHJpZ2h0ID0gdGFyZ2V0IGluc3RhbmNlb2YgRG9taW51cztcbiAgdmFyIGxlZnQgPSBlbGVtIGluc3RhbmNlb2YgRG9taW51cztcbiAgaWYgKGxlZnQpIHtcbiAgICBlbGVtLmZvckVhY2gobWFuaXB1bGF0ZU1hbnkpO1xuICB9IGVsc2UgaWYgKHJpZ2h0KSB7XG4gICAgbWFuaXB1bGF0ZShlbGVtLCB0cnVlKTtcbiAgfVxuICByZXR1cm4gbGVmdCB8fCByaWdodDtcblxuICBmdW5jdGlvbiBtYW5pcHVsYXRlIChlbGVtLCBwcmVjb25kaXRpb24pIHtcbiAgICBpZiAocmlnaHQpIHtcbiAgICAgIHRhcmdldC5mb3JFYWNoKGZ1bmN0aW9uICh0YXJnZXQsIGopIHtcbiAgICAgICAgZm4oZWxlbSwgY2xvbmVVbmxlc3ModGFyZ2V0LCBwcmVjb25kaXRpb24gJiYgaiA9PT0gMCkpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZuKGVsZW0sIGNsb25lVW5sZXNzKHRhcmdldCwgcHJlY29uZGl0aW9uKSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbWFuaXB1bGF0ZU1hbnkgKGVsZW0sIGkpIHtcbiAgICBtYW5pcHVsYXRlKGVsZW0sIGkgPT09IDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lVW5sZXNzICh0YXJnZXQsIGNvbmRpdGlvbikge1xuICByZXR1cm4gY29uZGl0aW9uID8gdGFyZ2V0IDogYXBpLmNsb25lKHRhcmdldCk7XG59XG5cblsnYXBwZW5kVG8nLCAncHJlcGVuZFRvJywgJ2JlZm9yZU9mJywgJ2FmdGVyT2YnXS5mb3JFYWNoKGZsaXApO1xuXG5mdW5jdGlvbiBmbGlwIChrZXkpIHtcbiAgdmFyIG9yaWdpbmFsID0ga2V5LnNwbGl0KC9bQS1aXS8pWzBdO1xuICBhcGlba2V5XSA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgICBhcGlbb3JpZ2luYWxdKHRhcmdldCwgZWxlbSk7XG4gIH07XG59XG5cbmFwaS5zaG93ID0gZnVuY3Rpb24gKGVsZW0sIHNob3VsZCwgaW52ZXJ0KSB7XG4gIGlmIChlbGVtIGluc3RhbmNlb2YgRG9taW51cykge1xuICAgIGVsZW0uZm9yRWFjaChzaG93VGVzdCk7XG4gIH0gZWxzZSB7XG4gICAgc2hvd1Rlc3QoZWxlbSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93VGVzdCAoY3VycmVudCkge1xuICAgIHZhciBvayA9IHNob3VsZCA9PT0gdm9pZCAwIHx8IHNob3VsZCA9PT0gdHJ1ZSB8fCB0eXBlb2Ygc2hvdWxkID09PSAnZnVuY3Rpb24nICYmIHNob3VsZC5jYWxsKGN1cnJlbnQpO1xuICAgIGRpc3BsYXkoY3VycmVudCwgaW52ZXJ0ID8gIW9rIDogb2spO1xuICB9XG59O1xuXG5hcGkuaGlkZSA9IGZ1bmN0aW9uIChlbGVtLCBzaG91bGQpIHtcbiAgYXBpLnNob3coZWxlbSwgc2hvdWxkLCB0cnVlKTtcbn07XG5cbmZ1bmN0aW9uIGRpc3BsYXkgKGVsZW0sIHNob3VsZCkge1xuICBlbGVtLnN0eWxlLmRpc3BsYXkgPSBzaG91bGQgPyAnYmxvY2snIDogJ25vbmUnO1xufVxuXG52YXIgbnVtZXJpY0Nzc1Byb3BlcnRpZXMgPSB7XG4gICdjb2x1bW4tY291bnQnOiB0cnVlLFxuICAnZmlsbC1vcGFjaXR5JzogdHJ1ZSxcbiAgJ2ZsZXgtZ3Jvdyc6IHRydWUsXG4gICdmbGV4LXNocmluayc6IHRydWUsXG4gICdmb250LXdlaWdodCc6IHRydWUsXG4gICdsaW5lLWhlaWdodCc6IHRydWUsXG4gICdvcGFjaXR5JzogdHJ1ZSxcbiAgJ29yZGVyJzogdHJ1ZSxcbiAgJ29ycGhhbnMnOiB0cnVlLFxuICAnd2lkb3dzJzogdHJ1ZSxcbiAgJ3otaW5kZXgnOiB0cnVlLFxuICAnem9vbSc6IHRydWVcbn07XG52YXIgbnVtZXJpYyA9IC9eXFxkKyQvO1xudmFyIGNhbkZsb2F0ID0gJ2Zsb2F0JyBpbiBkb2N1bWVudC5ib2R5LnN0eWxlO1xuXG5hcGkuZ2V0Q3NzID0gZnVuY3Rpb24gKGVsZW0sIHByb3ApIHtcbiAgdmFyIGhwcm9wID0gdGV4dC5oeXBoZW5hdGUocHJvcCk7XG4gIHZhciBmcHJvcCA9ICFjYW5GbG9hdCAmJiBocHJvcCA9PT0gJ2Zsb2F0JyA/ICdjc3NGbG9hdCcgOiBocHJvcDtcbiAgdmFyIHJlc3VsdCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW0pW2hwcm9wXTtcbiAgaWYgKHByb3AgPT09ICdvcGFjaXR5JyAmJiByZXN1bHQgPT09ICcnKSB7XG4gICAgcmV0dXJuIDE7XG4gIH1cbiAgaWYgKHJlc3VsdC5zdWJzdHIoLTIpID09PSAncHgnIHx8IG51bWVyaWMudGVzdChyZXN1bHQpKSB7XG4gICAgcmV0dXJuIHBhcnNlRmxvYXQocmVzdWx0LCAxMCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmFwaS5zZXRDc3MgPSBmdW5jdGlvbiAocHJvcHMpIHtcbiAgdmFyIG1hcHBlZCA9IE9iamVjdC5rZXlzKHByb3BzKS5maWx0ZXIoYmFkKS5tYXAoZXhwYW5kKTtcbiAgZnVuY3Rpb24gYmFkIChwcm9wKSB7XG4gICAgdmFyIHZhbHVlID0gcHJvcHNbcHJvcF07XG4gICAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHZhbHVlID09PSB2YWx1ZTtcbiAgfVxuICBmdW5jdGlvbiBleHBhbmQgKHByb3ApIHtcbiAgICB2YXIgaHByb3AgPSB0ZXh0Lmh5cGhlbmF0ZShwcm9wKTtcbiAgICB2YXIgdmFsdWUgPSBwcm9wc1twcm9wXTtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhbnVtZXJpY0Nzc1Byb3BlcnRpZXNbaHByb3BdKSB7XG4gICAgICB2YWx1ZSArPSAncHgnO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgbmFtZTogaHByb3AsIHZhbHVlOiB2YWx1ZVxuICAgIH07XG4gIH1cbiAgcmV0dXJuIGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgbWFwcGVkLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgIGVsZW0uc3R5bGVbcHJvcC5uYW1lXSA9IHByb3AudmFsdWU7XG4gICAgfSk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vRG9taW51cy5wcm90b3R5cGUnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGFkZEV2ZW50ID0gYWRkRXZlbnRFYXN5O1xudmFyIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRFYXN5O1xudmFyIGhhcmRDYWNoZSA9IFtdO1xuXG5pZiAoIXdpbmRvdy5hZGRFdmVudExpc3RlbmVyKSB7XG4gIGFkZEV2ZW50ID0gYWRkRXZlbnRIYXJkO1xufVxuXG5pZiAoIXdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRIYXJkO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEVhc3kgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldnQsIGZuKTtcbn1cblxuZnVuY3Rpb24gYWRkRXZlbnRIYXJkIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHJldHVybiBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyBldnQsIHdyYXAoZWxlbWVudCwgZXZ0LCBmbikpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEVhc3kgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldnQsIGZuKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlRXZlbnRIYXJkIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHJldHVybiBlbGVtZW50LmRldGFjaEV2ZW50KCdvbicgKyBldnQsIHVud3JhcChlbGVtZW50LCBldnQsIGZuKSk7XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IHdpbmRvdy5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ICA9IGUucHJldmVudERlZmF1bHQgIHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGZuLmNhbGwoZWxlbWVudCwgZSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHdyYXAgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgdmFyIHdyYXBwZXIgPSB1bndyYXAoZWxlbWVudCwgZXZ0LCBmbikgfHwgd3JhcHBlckZhY3RvcnkoZWxlbWVudCwgZXZ0LCBmbik7XG4gIGhhcmRDYWNoZS5wdXNoKHtcbiAgICB3cmFwcGVyOiB3cmFwcGVyLFxuICAgIGVsZW1lbnQ6IGVsZW1lbnQsXG4gICAgZXZ0OiBldnQsXG4gICAgZm46IGZuXG4gIH0pO1xuICByZXR1cm4gd3JhcHBlcjtcbn1cblxuZnVuY3Rpb24gdW53cmFwIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHZhciBpID0gZmluZChlbGVtZW50LCBldnQsIGZuKTtcbiAgaWYgKGkpIHtcbiAgICB2YXIgd3JhcHBlciA9IGhhcmRDYWNoZVtpXS53cmFwcGVyO1xuICAgIGhhcmRDYWNoZS5zcGxpY2UoaSwgMSk7IC8vIGZyZWUgdXAgYSB0YWQgb2YgbWVtb3J5XG4gICAgcmV0dXJuIHdyYXBwZXI7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmluZCAoZWxlbWVudCwgZXZ0LCBmbikge1xuICB2YXIgaSwgaXRlbTtcbiAgZm9yIChpID0gMDsgaSA8IGhhcmRDYWNoZS5sZW5ndGg7IGkrKykge1xuICAgIGl0ZW0gPSBoYXJkQ2FjaGVbaV07XG4gICAgaWYgKGl0ZW0uZWxlbWVudCA9PT0gZWxlbWVudCAmJiBpdGVtLmV2dCA9PT0gZXZ0ICYmIGl0ZW0uZm4gPT09IGZuKSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkRXZlbnQsXG4gIHJlbW92ZTogcmVtb3ZlRXZlbnRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBkb20gPSByZXF1aXJlKCcuL2RvbScpO1xudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NvcmUnKTtcbnZhciBEb21pbnVzID0gcmVxdWlyZSgnLi9Eb21pbnVzLmN0b3InKTtcbnZhciB0YWcgPSAvXlxccyo8KFthLXpdKyg/Oi1bYS16XSspPylcXHMqXFwvPz5cXHMqJC9pO1xuXG5mdW5jdGlvbiBhcGkgKHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gIHZhciBub3RUZXh0ID0gdHlwZW9mIHNlbGVjdG9yICE9PSAnc3RyaW5nJztcbiAgaWYgKG5vdFRleHQgJiYgYXJndW1lbnRzLmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4gY29yZS5jYXN0KHNlbGVjdG9yKTtcbiAgfVxuICBpZiAobm90VGV4dCkge1xuICAgIHJldHVybiBuZXcgRG9taW51cygpO1xuICB9XG4gIHZhciBtYXRjaGVzID0gc2VsZWN0b3IubWF0Y2godGFnKTtcbiAgaWYgKG1hdGNoZXMpIHtcbiAgICByZXR1cm4gZG9tLm1ha2UobWF0Y2hlc1sxXSk7XG4gIH1cbiAgcmV0dXJuIGFwaS5maW5kKHNlbGVjdG9yLCBjb250ZXh0KTtcbn1cblxuYXBpLmZpbmQgPSBmdW5jdGlvbiAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgcmV0dXJuIGRvbS5xc2EoY29udGV4dCwgc2VsZWN0b3IpO1xufTtcblxuYXBpLmZpbmRPbmUgPSBmdW5jdGlvbiAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgcmV0dXJuIGRvbS5xcyhjb250ZXh0LCBzZWxlY3Rvcik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIG5vZGVPYmplY3RzID0gdHlwZW9mIE5vZGUgPT09ICdvYmplY3QnO1xudmFyIGVsZW1lbnRPYmplY3RzID0gdHlwZW9mIEhUTUxFbGVtZW50ID09PSAnb2JqZWN0JztcblxuZnVuY3Rpb24gaXNOb2RlIChvKSB7XG4gIHJldHVybiBub2RlT2JqZWN0cyA/IG8gaW5zdGFuY2VvZiBOb2RlIDogaXNOb2RlT2JqZWN0KG8pO1xufVxuXG5mdW5jdGlvbiBpc05vZGVPYmplY3QgKG8pIHtcbiAgcmV0dXJuIG8gJiZcbiAgICB0eXBlb2YgbyA9PT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2Ygby5ub2RlTmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2Ygby5ub2RlVHlwZSA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzRWxlbWVudCAobykge1xuICByZXR1cm4gZWxlbWVudE9iamVjdHMgPyBvIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgOiBpc0VsZW1lbnRPYmplY3Qobyk7XG59XG5cbmZ1bmN0aW9uIGlzRWxlbWVudE9iamVjdCAobykge1xuICByZXR1cm4gbyAmJlxuICAgIHR5cGVvZiBvID09PSAnb2JqZWN0JyAmJlxuICAgIHR5cGVvZiBvLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIG8ubm9kZVR5cGUgPT09IDE7XG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKGEpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn1cblxuZnVuY3Rpb24gaXNDaGVja2FibGUgKGVsZW0pIHtcbiAgcmV0dXJuICdjaGVja2VkJyBpbiBlbGVtICYmIGVsZW0udHlwZSA9PT0gJ3JhZGlvJyB8fCBlbGVtLnR5cGUgPT09ICdjaGVja2JveCc7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBpc05vZGU6IGlzTm9kZSxcbiAgaXNFbGVtZW50OiBpc0VsZW1lbnQsXG4gIGlzQXJyYXk6IGlzQXJyYXksXG4gIGlzQ2hlY2thYmxlOiBpc0NoZWNrYWJsZVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gaHlwaGVuVG9DYW1lbCAoaHlwaGVucykge1xuICB2YXIgcGFydCA9IC8tKFthLXpdKS9nO1xuICByZXR1cm4gaHlwaGVucy5yZXBsYWNlKHBhcnQsIGZ1bmN0aW9uIChnLCBtKSB7XG4gICAgcmV0dXJuIG0udG9VcHBlckNhc2UoKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGh5cGhlbmF0ZSAodGV4dCkge1xuICB2YXIgY2FtZWwgPSAvKFthLXpdKShbQS1aXSkvZztcbiAgcmV0dXJuIHRleHQucmVwbGFjZShjYW1lbCwgJyQxLSQyJykudG9Mb3dlckNhc2UoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGh5cGhlblRvQ2FtZWw6IGh5cGhlblRvQ2FtZWwsXG4gIGh5cGhlbmF0ZTogaHlwaGVuYXRlXG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuIWZ1bmN0aW9uKGUpe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgZjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P2Y9d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/Zj1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihmPXNlbGYpLGYuamFkZT1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbid1c2Ugc3RyaWN0JztcclxuXHJcbi8qKlxyXG4gKiBNZXJnZSB0d28gYXR0cmlidXRlIG9iamVjdHMgZ2l2aW5nIHByZWNlZGVuY2VcclxuICogdG8gdmFsdWVzIGluIG9iamVjdCBgYmAuIENsYXNzZXMgYXJlIHNwZWNpYWwtY2FzZWRcclxuICogYWxsb3dpbmcgZm9yIGFycmF5cyBhbmQgbWVyZ2luZy9qb2luaW5nIGFwcHJvcHJpYXRlbHlcclxuICogcmVzdWx0aW5nIGluIGEgc3RyaW5nLlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gYVxyXG4gKiBAcGFyYW0ge09iamVjdH0gYlxyXG4gKiBAcmV0dXJuIHtPYmplY3R9IGFcclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5tZXJnZSA9IGZ1bmN0aW9uIG1lcmdlKGEsIGIpIHtcclxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgdmFyIGF0dHJzID0gYVswXTtcclxuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYS5sZW5ndGg7IGkrKykge1xyXG4gICAgICBhdHRycyA9IG1lcmdlKGF0dHJzLCBhW2ldKTtcclxuICAgIH1cclxuICAgIHJldHVybiBhdHRycztcclxuICB9XHJcbiAgdmFyIGFjID0gYVsnY2xhc3MnXTtcclxuICB2YXIgYmMgPSBiWydjbGFzcyddO1xyXG5cclxuICBpZiAoYWMgfHwgYmMpIHtcclxuICAgIGFjID0gYWMgfHwgW107XHJcbiAgICBiYyA9IGJjIHx8IFtdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjKSkgYWMgPSBbYWNdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGJjKSkgYmMgPSBbYmNdO1xyXG4gICAgYVsnY2xhc3MnXSA9IGFjLmNvbmNhdChiYykuZmlsdGVyKG51bGxzKTtcclxuICB9XHJcblxyXG4gIGZvciAodmFyIGtleSBpbiBiKSB7XHJcbiAgICBpZiAoa2V5ICE9ICdjbGFzcycpIHtcclxuICAgICAgYVtrZXldID0gYltrZXldO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGE7XHJcbn07XHJcblxyXG4vKipcclxuICogRmlsdGVyIG51bGwgYHZhbGBzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtCb29sZWFufVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5mdW5jdGlvbiBudWxscyh2YWwpIHtcclxuICByZXR1cm4gdmFsICE9IG51bGwgJiYgdmFsICE9PSAnJztcclxufVxyXG5cclxuLyoqXHJcbiAqIGpvaW4gYXJyYXkgYXMgY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5qb2luQ2xhc3NlcyA9IGpvaW5DbGFzc2VzO1xyXG5mdW5jdGlvbiBqb2luQ2xhc3Nlcyh2YWwpIHtcclxuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpID8gdmFsLm1hcChqb2luQ2xhc3NlcykuZmlsdGVyKG51bGxzKS5qb2luKCcgJykgOiB2YWw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGNsYXNzZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IGNsYXNzZXNcclxuICogQHBhcmFtIHtBcnJheS48Qm9vbGVhbj59IGVzY2FwZWRcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5jbHMgPSBmdW5jdGlvbiBjbHMoY2xhc3NlcywgZXNjYXBlZCkge1xyXG4gIHZhciBidWYgPSBbXTtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGlmIChlc2NhcGVkICYmIGVzY2FwZWRbaV0pIHtcclxuICAgICAgYnVmLnB1c2goZXhwb3J0cy5lc2NhcGUoam9pbkNsYXNzZXMoW2NsYXNzZXNbaV1dKSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgYnVmLnB1c2goam9pbkNsYXNzZXMoY2xhc3Nlc1tpXSkpO1xyXG4gICAgfVxyXG4gIH1cclxuICB2YXIgdGV4dCA9IGpvaW5DbGFzc2VzKGJ1Zik7XHJcbiAgaWYgKHRleHQubGVuZ3RoKSB7XHJcbiAgICByZXR1cm4gJyBjbGFzcz1cIicgKyB0ZXh0ICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcnO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZS5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGtleVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZXNjYXBlZFxyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IHRlcnNlXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0ciA9IGZ1bmN0aW9uIGF0dHIoa2V5LCB2YWwsIGVzY2FwZWQsIHRlcnNlKSB7XHJcbiAgaWYgKCdib29sZWFuJyA9PSB0eXBlb2YgdmFsIHx8IG51bGwgPT0gdmFsKSB7XHJcbiAgICBpZiAodmFsKSB7XHJcbiAgICAgIHJldHVybiAnICcgKyAodGVyc2UgPyBrZXkgOiBrZXkgKyAnPVwiJyArIGtleSArICdcIicpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuICcnO1xyXG4gICAgfVxyXG4gIH0gZWxzZSBpZiAoMCA9PSBrZXkuaW5kZXhPZignZGF0YScpICYmICdzdHJpbmcnICE9IHR5cGVvZiB2YWwpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyBcIj0nXCIgKyBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2UoLycvZywgJyZhcG9zOycpICsgXCInXCI7XHJcbiAgfSBlbHNlIGlmIChlc2NhcGVkKSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyBleHBvcnRzLmVzY2FwZSh2YWwpICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJztcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBhdHRyaWJ1dGVzIG9iamVjdC5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IG9ialxyXG4gKiBAcGFyYW0ge09iamVjdH0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmF0dHJzID0gZnVuY3Rpb24gYXR0cnMob2JqLCB0ZXJzZSl7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG5cclxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iaik7XHJcblxyXG4gIGlmIChrZXlzLmxlbmd0aCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldXHJcbiAgICAgICAgLCB2YWwgPSBvYmpba2V5XTtcclxuXHJcbiAgICAgIGlmICgnY2xhc3MnID09IGtleSkge1xyXG4gICAgICAgIGlmICh2YWwgPSBqb2luQ2xhc3Nlcyh2YWwpKSB7XHJcbiAgICAgICAgICBidWYucHVzaCgnICcgKyBrZXkgKyAnPVwiJyArIHZhbCArICdcIicpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBidWYucHVzaChleHBvcnRzLmF0dHIoa2V5LCB2YWwsIGZhbHNlLCB0ZXJzZSkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYnVmLmpvaW4oJycpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEVzY2FwZSB0aGUgZ2l2ZW4gc3RyaW5nIG9mIGBodG1sYC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGh0bWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLmVzY2FwZSA9IGZ1bmN0aW9uIGVzY2FwZShodG1sKXtcclxuICB2YXIgcmVzdWx0ID0gU3RyaW5nKGh0bWwpXHJcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxyXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxyXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcclxuICBpZiAocmVzdWx0ID09PSAnJyArIGh0bWwpIHJldHVybiBodG1sO1xyXG4gIGVsc2UgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZS10aHJvdyB0aGUgZ2l2ZW4gYGVycmAgaW4gY29udGV4dCB0byB0aGVcclxuICogdGhlIGphZGUgaW4gYGZpbGVuYW1lYCBhdCB0aGUgZ2l2ZW4gYGxpbmVub2AuXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZW5hbWVcclxuICogQHBhcmFtIHtTdHJpbmd9IGxpbmVub1xyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLnJldGhyb3cgPSBmdW5jdGlvbiByZXRocm93KGVyciwgZmlsZW5hbWUsIGxpbmVubywgc3RyKXtcclxuICBpZiAoIShlcnIgaW5zdGFuY2VvZiBFcnJvcikpIHRocm93IGVycjtcclxuICBpZiAoKHR5cGVvZiB3aW5kb3cgIT0gJ3VuZGVmaW5lZCcgfHwgIWZpbGVuYW1lKSAmJiAhc3RyKSB7XHJcbiAgICBlcnIubWVzc2FnZSArPSAnIG9uIGxpbmUgJyArIGxpbmVubztcclxuICAgIHRocm93IGVycjtcclxuICB9XHJcbiAgdHJ5IHtcclxuICAgIHN0ciA9IHN0ciB8fCBfZGVyZXFfKCdmcycpLnJlYWRGaWxlU3luYyhmaWxlbmFtZSwgJ3V0ZjgnKVxyXG4gIH0gY2F0Y2ggKGV4KSB7XHJcbiAgICByZXRocm93KGVyciwgbnVsbCwgbGluZW5vKVxyXG4gIH1cclxuICB2YXIgY29udGV4dCA9IDNcclxuICAgICwgbGluZXMgPSBzdHIuc3BsaXQoJ1xcbicpXHJcbiAgICAsIHN0YXJ0ID0gTWF0aC5tYXgobGluZW5vIC0gY29udGV4dCwgMClcclxuICAgICwgZW5kID0gTWF0aC5taW4obGluZXMubGVuZ3RoLCBsaW5lbm8gKyBjb250ZXh0KTtcclxuXHJcbiAgLy8gRXJyb3IgY29udGV4dFxyXG4gIHZhciBjb250ZXh0ID0gbGluZXMuc2xpY2Uoc3RhcnQsIGVuZCkubWFwKGZ1bmN0aW9uKGxpbmUsIGkpe1xyXG4gICAgdmFyIGN1cnIgPSBpICsgc3RhcnQgKyAxO1xyXG4gICAgcmV0dXJuIChjdXJyID09IGxpbmVubyA/ICcgID4gJyA6ICcgICAgJylcclxuICAgICAgKyBjdXJyXHJcbiAgICAgICsgJ3wgJ1xyXG4gICAgICArIGxpbmU7XHJcbiAgfSkuam9pbignXFxuJyk7XHJcblxyXG4gIC8vIEFsdGVyIGV4Y2VwdGlvbiBtZXNzYWdlXHJcbiAgZXJyLnBhdGggPSBmaWxlbmFtZTtcclxuICBlcnIubWVzc2FnZSA9IChmaWxlbmFtZSB8fCAnSmFkZScpICsgJzonICsgbGluZW5vXHJcbiAgICArICdcXG4nICsgY29udGV4dCArICdcXG5cXG4nICsgZXJyLm1lc3NhZ2U7XHJcbiAgdGhyb3cgZXJyO1xyXG59O1xyXG5cbn0se1wiZnNcIjoyfV0sMjpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbn0se31dfSx7fSxbMV0pXG4oMSlcbn0pO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJ2phZGUvcnVudGltZScpO1xuIiwidmFyIG5vdyA9IHJlcXVpcmUoJ3BlcmZvcm1hbmNlLW5vdycpXG4gICwgZ2xvYmFsID0gdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyB7fSA6IHdpbmRvd1xuICAsIHZlbmRvcnMgPSBbJ21veicsICd3ZWJraXQnXVxuICAsIHN1ZmZpeCA9ICdBbmltYXRpb25GcmFtZSdcbiAgLCByYWYgPSBnbG9iYWxbJ3JlcXVlc3QnICsgc3VmZml4XVxuICAsIGNhZiA9IGdsb2JhbFsnY2FuY2VsJyArIHN1ZmZpeF0gfHwgZ2xvYmFsWydjYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBpc05hdGl2ZSA9IHRydWVcblxuZm9yKHZhciBpID0gMDsgaSA8IHZlbmRvcnMubGVuZ3RoICYmICFyYWY7IGkrKykge1xuICByYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgY2FmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsJyArIHN1ZmZpeF1cbiAgICAgIHx8IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxufVxuXG4vLyBTb21lIHZlcnNpb25zIG9mIEZGIGhhdmUgckFGIGJ1dCBub3QgY0FGXG5pZighcmFmIHx8ICFjYWYpIHtcbiAgaXNOYXRpdmUgPSBmYWxzZVxuXG4gIHZhciBsYXN0ID0gMFxuICAgICwgaWQgPSAwXG4gICAgLCBxdWV1ZSA9IFtdXG4gICAgLCBmcmFtZUR1cmF0aW9uID0gMTAwMCAvIDYwXG5cbiAgcmFmID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICBpZihxdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHZhciBfbm93ID0gbm93KClcbiAgICAgICAgLCBuZXh0ID0gTWF0aC5tYXgoMCwgZnJhbWVEdXJhdGlvbiAtIChfbm93IC0gbGFzdCkpXG4gICAgICBsYXN0ID0gbmV4dCArIF9ub3dcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjcCA9IHF1ZXVlLnNsaWNlKDApXG4gICAgICAgIC8vIENsZWFyIHF1ZXVlIGhlcmUgdG8gcHJldmVudFxuICAgICAgICAvLyBjYWxsYmFja3MgZnJvbSBhcHBlbmRpbmcgbGlzdGVuZXJzXG4gICAgICAgIC8vIHRvIHRoZSBjdXJyZW50IGZyYW1lJ3MgcXVldWVcbiAgICAgICAgcXVldWUubGVuZ3RoID0gMFxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY3AubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZighY3BbaV0uY2FuY2VsbGVkKSB7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgIGNwW2ldLmNhbGxiYWNrKGxhc3QpXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSwgTWF0aC5yb3VuZChuZXh0KSlcbiAgICB9XG4gICAgcXVldWUucHVzaCh7XG4gICAgICBoYW5kbGU6ICsraWQsXG4gICAgICBjYWxsYmFjazogY2FsbGJhY2ssXG4gICAgICBjYW5jZWxsZWQ6IGZhbHNlXG4gICAgfSlcbiAgICByZXR1cm4gaWRcbiAgfVxuXG4gIGNhZiA9IGZ1bmN0aW9uKGhhbmRsZSkge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYocXVldWVbaV0uaGFuZGxlID09PSBoYW5kbGUpIHtcbiAgICAgICAgcXVldWVbaV0uY2FuY2VsbGVkID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIFdyYXAgaW4gYSBuZXcgZnVuY3Rpb24gdG8gcHJldmVudFxuICAvLyBgY2FuY2VsYCBwb3RlbnRpYWxseSBiZWluZyBhc3NpZ25lZFxuICAvLyB0byB0aGUgbmF0aXZlIHJBRiBmdW5jdGlvblxuICBpZighaXNOYXRpdmUpIHtcbiAgICByZXR1cm4gcmFmLmNhbGwoZ2xvYmFsLCBmbilcbiAgfVxuICByZXR1cm4gcmFmLmNhbGwoZ2xvYmFsLCBmdW5jdGlvbigpIHtcbiAgICB0cnl7XG4gICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgfSBjYXRjaChlKSB7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgfVxuICB9KVxufVxubW9kdWxlLmV4cG9ydHMuY2FuY2VsID0gZnVuY3Rpb24oKSB7XG4gIGNhZi5hcHBseShnbG9iYWwsIGFyZ3VtZW50cylcbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNi4zXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBnZXROYW5vU2Vjb25kcywgaHJ0aW1lLCBsb2FkVGltZTtcblxuICBpZiAoKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwZXJmb3JtYW5jZSAhPT0gbnVsbCkgJiYgcGVyZm9ybWFuY2Uubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB9O1xuICB9IGVsc2UgaWYgKCh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzICE9PSBudWxsKSAmJiBwcm9jZXNzLmhydGltZSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gKGdldE5hbm9TZWNvbmRzKCkgLSBsb2FkVGltZSkgLyAxZTY7XG4gICAgfTtcbiAgICBocnRpbWUgPSBwcm9jZXNzLmhydGltZTtcbiAgICBnZXROYW5vU2Vjb25kcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGhyO1xuICAgICAgaHIgPSBocnRpbWUoKTtcbiAgICAgIHJldHVybiBoclswXSAqIDFlOSArIGhyWzFdO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBnZXROYW5vU2Vjb25kcygpO1xuICB9IGVsc2UgaWYgKERhdGUubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBEYXRlLm5vdygpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IERhdGUubm93KCk7XG4gIH0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfVxuXG59KS5jYWxsKHRoaXMpO1xuXG4vKlxuLy9AIHNvdXJjZU1hcHBpbmdVUkw9cGVyZm9ybWFuY2Utbm93Lm1hcFxuKi9cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHJhZiA9IHJlcXVpcmUoJ3JhZicpO1xudmFyIGNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4vdmlldycpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgbmF0aXZlRm4gPSByZXF1aXJlKCcuL25hdGl2ZUZuJyk7XG52YXIgdmVyc2lvbmluZyA9IHJlcXVpcmUoJy4uL3ZlcnNpb25pbmcnKTtcbnZhciBtb2Rlcm4gPSAnaGlzdG9yeScgaW4gd2luZG93ICYmICdwdXNoU3RhdGUnIGluIGhpc3Rvcnk7XG5cbi8vIEdvb2dsZSBDaHJvbWUgMzggb24gaU9TIG1ha2VzIHdlaXJkIGNoYW5nZXMgdG8gaGlzdG9yeS5yZXBsYWNlU3RhdGUsIGJyZWFraW5nIGl0XG52YXIgbmF0aXZlUmVwbGFjZSA9IG1vZGVybiAmJiBuYXRpdmVGbih3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUpO1xuXG5mdW5jdGlvbiBnbyAodXJsLCBvcHRpb25zKSB7XG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIGRpcmVjdGlvbiA9IG8ucmVwbGFjZVN0YXRlID8gJ3JlcGxhY2VTdGF0ZScgOiAncHVzaFN0YXRlJztcbiAgdmFyIGNvbnRleHQgPSBvLmNvbnRleHQgfHwgbnVsbDtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCk7XG4gIGlmICghcm91dGUpIHtcbiAgICBpZiAoby5zdHJpY3QgIT09IHRydWUpIHtcbiAgICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIHJlZGlyZWN0aW5nIHRvICVzJywgdXJsKTtcbiAgICAgIGxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBzYW1lID0gcm91dGVyLmVxdWFscyhyb3V0ZSwgc3RhdGUucm91dGUpO1xuICBpZiAoc2FtZSAmJiBvLmZvcmNlICE9PSB0cnVlKSB7XG4gICAgaWYgKHJvdXRlLnBhcnRzLmhhc2gpIHtcbiAgICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIHNhbWUgcm91dGUgYW5kIGhhc2gsIHVwZGF0aW5nIHNjcm9sbCBwb3NpdGlvbicpO1xuICAgICAgc2Nyb2xsSW50byhpZChyb3V0ZS5wYXJ0cy5oYXNoKSwgby5zY3JvbGwpO1xuICAgICAgbmF2aWdhdGlvbihyb3V0ZSwgc3RhdGUubW9kZWwsIGRpcmVjdGlvbik7XG4gICAgICByZXR1cm47IC8vIGFuY2hvciBoYXNoLW5hdmlnYXRpb24gb24gc2FtZSBwYWdlIGlnbm9yZXMgcm91dGVyXG4gICAgfVxuICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIHNhbWUgcm91dGUsIHJlc29sdmluZycpO1xuICAgIHJlc29sdmVkKHN0YXRlLm1vZGVsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIW1vZGVybikge1xuICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIG5vdCBtb2Rlcm4sIHJlZGlyZWN0aW5nIHRvICVzJywgdXJsKTtcbiAgICBsb2NhdGlvbi5ocmVmID0gdXJsO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIGZldGNoaW5nICVzJywgcm91dGUudXJsKTtcbiAgZmV0Y2hlci5hYm9ydFBlbmRpbmcoKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250ZXh0LCBzb3VyY2U6ICdpbnRlbnQnIH0sIG1heWJlUmVzb2x2ZWQpO1xuXG4gIGZ1bmN0aW9uIG1heWJlUmVzb2x2ZWQgKGVyciwgZGF0YSkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGRhdGEudmVyc2lvbiAhPT0gc3RhdGUudmVyc2lvbikge1xuICAgICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2FjdGl2YXRvcl0gdmVyc2lvbiBjaGFuZ2UgKGlzIFwiJXNcIiwgd2FzIFwiJXNcIiksIHJlZGlyZWN0aW5nIHRvICVzJywgZGF0YS52ZXJzaW9uLCBzdGF0ZS52ZXJzaW9uLCB1cmwpO1xuICAgICAgbG9jYXRpb24uaHJlZiA9IHVybDsgLy8gdmVyc2lvbiBjaGFuZ2UgZGVtYW5kcyBmYWxsYmFjayB0byBzdHJpY3QgbmF2aWdhdGlvblxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zb2xlLmxvZyhkYXRhLm1vZGVsKTtcbiAgICByZXNvbHZlZChkYXRhLm1vZGVsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc29sdmVkIChtb2RlbCkge1xuICAgIG5hdmlnYXRpb24ocm91dGUsIG1vZGVsLCBkaXJlY3Rpb24pO1xuICAgIHZpZXcoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICAgIHNjcm9sbEludG8oaWQocm91dGUucGFydHMuaGFzaCksIG8uc2Nyb2xsKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydCAoZGF0YSkge1xuICBpZiAoZGF0YS52ZXJzaW9uICE9PSBzdGF0ZS52ZXJzaW9uKSB7XG4gICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2FjdGl2YXRvcl0gdmVyc2lvbiBjaGFuZ2UsIHJlbG9hZGluZyBicm93c2VyJyk7XG4gICAgbG9jYXRpb24ucmVsb2FkKCk7IC8vIHZlcnNpb24gbWF5IGNoYW5nZSBiZXR3ZWVuIFRhdW51cyBsb2FkaW5nIGFuZCBhIG1vZGVsIGJlY29taW5nIGF2YWlsYWJsZVxuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbW9kZWwgPSBkYXRhLm1vZGVsO1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIGVtaXR0ZXIuZW1pdCgnc3RhcnQnLCBzdGF0ZS5jb250YWluZXIsIG1vZGVsLCByb3V0ZSk7XG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIHN0YXJ0ZWQsIGV4ZWN1dGluZyBjbGllbnQtc2lkZSBjb250cm9sbGVyJyk7XG4gIHZpZXcoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUsIHsgcmVuZGVyOiBmYWxzZSB9KTtcbiAgd2luZG93Lm9ucG9wc3RhdGUgPSBiYWNrO1xufVxuXG5mdW5jdGlvbiBiYWNrIChlKSB7XG4gIHZhciBlbXB0eSA9ICEoZSAmJiBlLnN0YXRlICYmIGUuc3RhdGUubW9kZWwpO1xuICBpZiAoZW1wdHkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2FjdGl2YXRvcl0gYmFja3dhcmRzIGhpc3RvcnkgbmF2aWdhdGlvbiB3aXRoIHN0YXRlJywgZS5zdGF0ZSk7XG4gIHZhciBtb2RlbCA9IGUuc3RhdGUubW9kZWw7XG4gIHZhciByb3V0ZSA9IHJlcGxhY2VXaXRoKG1vZGVsKTtcbiAgdmlldyhzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSk7XG4gIHNjcm9sbEludG8oaWQocm91dGUucGFydHMuaGFzaCkpO1xufVxuXG5mdW5jdGlvbiBzY3JvbGxJbnRvIChpZCwgZW5hYmxlZCkge1xuICBpZiAoZW5hYmxlZCA9PT0gZmFsc2UgfHwgIWlkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIHNjcm9sbGluZyBpbnRvIFwiJXNcIicsIGlkKTtcbiAgdmFyIGVsZW0gPSBpZCAmJiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICBpZiAoZWxlbSAmJiBlbGVtLnNjcm9sbEludG9WaWV3KSB7XG4gICAgcmFmKHNjcm9sbFNvb24pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2Nyb2xsU29vbiAoKSB7XG4gICAgZWxlbS5zY3JvbGxJbnRvVmlldygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlkIChoYXNoKSB7XG4gIHJldHVybiBvckVtcHR5KGhhc2gpLnN1YnN0cigxKTtcbn1cblxuZnVuY3Rpb24gcmVwbGFjZVdpdGggKG1vZGVsKSB7XG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcbiAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdyZXBsYWNlU3RhdGUnKTtcbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRpb24gKHJvdXRlLCBtb2RlbCwgZGlyZWN0aW9uKSB7XG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1thY3RpdmF0b3JdIHB1c2hpbmcgJXMgaW50byBoaXN0b3J5Jywgcm91dGUudXJsKTtcbiAgc3RhdGUucm91dGUgPSByb3V0ZTtcbiAgc3RhdGUubW9kZWwgPSBjbG9uZShtb2RlbCk7XG4gIGlmIChtb2RlbC50aXRsZSkge1xuICAgIGRvY3VtZW50LnRpdGxlID0gbW9kZWwudGl0bGU7XG4gIH1cbiAgaWYgKG1vZGVybiAmJiBkaXJlY3Rpb24gIT09ICdyZXBsYWNlU3RhdGUnIHx8IG5hdGl2ZVJlcGxhY2UpIHtcbiAgICBoaXN0b3J5W2RpcmVjdGlvbl0oeyBtb2RlbDogbW9kZWwgfSwgbW9kZWwudGl0bGUsIHJvdXRlLnVybCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHN0YXJ0OiBzdGFydCxcbiAgZ286IGdvXG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xudmFyIG9uY2UgPSByZXF1aXJlKCcuL29uY2UnKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByYXcgPSByZXF1aXJlKCcuL3N0b3Jlcy9yYXcnKTtcbnZhciBpZGIgPSByZXF1aXJlKCcuL3N0b3Jlcy9pZGInKTtcbnZhciB2ZXJzaW9uaW5nID0gcmVxdWlyZSgnLi4vdmVyc2lvbmluZycpO1xudmFyIHN0b3JlcyA9IFtyYXcsIGlkYl07XG5cbmZ1bmN0aW9uIGdldCAodHlwZSwga2V5LCBkb25lKSB7XG4gIHZhciBpID0gMDtcblxuICBmdW5jdGlvbiBuZXh0ICgpIHtcbiAgICB2YXIgZ290T25jZSA9IG9uY2UoZ290KTtcbiAgICB2YXIgc3RvcmUgPSBzdG9yZXNbaSsrXTtcbiAgICBpZiAoc3RvcmUpIHtcbiAgICAgIHN0b3JlLmdldCh0eXBlLCBrZXksIGdvdE9uY2UpO1xuICAgICAgc2V0VGltZW91dChnb3RPbmNlLCBzdG9yZSA9PT0gaWRiID8gMzUgOiA1KTsgLy8gYXQgd29yc3QsIHNwZW5kIDQwbXMgb24gY2FjaGluZyBsYXllcnNcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZSh0cnVlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnb3QgKGVyciwgaXRlbSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9IGVsc2UgaWYgKHZhbGlkKGl0ZW0pKSB7XG4gICAgICAgIGRvbmUoZmFsc2UsIGJsb2IoaXRlbSkpOyAvLyBhbHdheXMgcmV0dXJuIGEgdW5pcXVlIGNvcHlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5leHQoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiB2YWxpZCAoaXRlbSkge1xuICAgICAgaWYgKCFpdGVtKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gY2FjaGUgbXVzdCBoYXZlIGl0ZW1cbiAgICAgIH1cbiAgICAgIHZhciBtaXNtYXRjaCA9IHR5cGVvZiBpdGVtLnZlcnNpb24gIT09ICdzdHJpbmcnIHx8IGl0ZW0udmVyc2lvbiAhPT0gc3RhdGUudmVyc2lvbjtcbiAgICAgIGlmIChtaXNtYXRjaCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7IC8vIGNhY2hlIG11c3QgbWF0Y2ggY3VycmVudCB2ZXJzaW9uXG4gICAgICB9XG4gICAgICB2YXIgc3RhbGUgPSB0eXBlb2YgaXRlbS5leHBpcmVzICE9PSAnbnVtYmVyJyB8fCBEYXRlLm5vdygpID49IGl0ZW0uZXhwaXJlcztcbiAgICAgIGlmIChzdGFsZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7IC8vIGNhY2hlIG11c3QgYmUgZnJlc2hcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJsb2IgKGl0ZW0pIHtcbiAgICAgIHZhciBzaW5ndWxhciA9IHR5cGUuc3Vic3RyKDAsIHR5cGUubGVuZ3RoIC0gMSk7XG4gICAgICB2YXIgZGF0YSA9IGNsb25lKGl0ZW0uZGF0YSk7XG4gICAgICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgICAgIHZlcnNpb246IGl0ZW0udmVyc2lvblxuICAgICAgfTtcbiAgICAgIHJlc3BvbnNlW3Npbmd1bGFyXSA9IGRhdGE7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuICB9XG5cbiAgbmV4dCgpO1xufVxuXG5mdW5jdGlvbiBzZXQgKHR5cGUsIGtleSwgZGF0YSwgZHVyYXRpb24pIHtcbiAgaWYgKGR1cmF0aW9uIDwgMSkgeyAvLyBzYW5pdHlcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGNsb25lZCA9IGNsb25lKGRhdGEpOyAvLyBmcmVlemUgYSBjb3B5IGZvciBvdXIgcmVjb3Jkc1xuICBzdG9yZXMuZm9yRWFjaChzdG9yZSk7XG4gIGZ1bmN0aW9uIHN0b3JlIChzKSB7XG4gICAgcy5zZXQodHlwZSwga2V5LCB7XG4gICAgICBkYXRhOiBjbG9uZWQsXG4gICAgICB2ZXJzaW9uOiBzdGF0ZS52ZXJzaW9uLFxuICAgICAgZXhwaXJlczogRGF0ZS5ub3coKSArIGR1cmF0aW9uXG4gICAgfSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGNhY2hlID0gcmVxdWlyZSgnLi9jYWNoZScpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBkZWZhdWx0cyA9IDE1O1xudmFyIGJhc2VsaW5lO1xuXG5mdW5jdGlvbiBlICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkdXJhdGlvbiwgcm91dGUpIHtcbiAgYmFzZWxpbmUgPSBwYXJzZUR1cmF0aW9uKGR1cmF0aW9uKTtcbiAgaWYgKGJhc2VsaW5lIDwgMSkge1xuICAgIHN0YXRlLmNhY2hlID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG4gIGludGVyY2VwdG9yLmFkZChpbnRlcmNlcHQpO1xuICBlbWl0dGVyLm9uKCdmZXRjaC5kb25lJywgcGVyc2lzdCk7XG4gIHN0YXRlLmNhY2hlID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW50ZXJjZXB0IChlKSB7XG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1tjYWNoZV0gYXR0ZW1wdGluZyB0byBpbnRlcmNlcHQgJXMnLCBlLnJvdXRlLnVybCk7XG4gIGNhY2hlLmdldCgnbW9kZWxzJywgZS5yb3V0ZS5wYXJ0cy5wYXRoLCByZXN1bHQpO1xuXG4gIGZ1bmN0aW9uIHJlc3VsdCAoZXJyLCBkYXRhKSB7XG4gICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2NhY2hlXSBpbnRlcmNlcHRpb24gZm9yICVzICVzJywgZS5yb3V0ZS51cmwsIGVyciB8fCAhZGF0YSA/ICdmYWlsZWQnIDogJ3N1Y2NlZWRlZCcpO1xuICAgIGlmICghZXJyICYmIGRhdGEpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoZGF0YSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlRHVyYXRpb24gKHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBiYXNlbGluZSB8fCBkZWZhdWx0cztcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdCAocm91dGUsIGNvbnRleHQsIGRhdGEpIHtcbiAgaWYgKCFzdGF0ZS5jYWNoZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocm91dGUuY2FjaGUgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBkID0gYmFzZWxpbmU7XG4gIGlmICh0eXBlb2Ygcm91dGUuY2FjaGUgPT09ICdudW1iZXInKSB7XG4gICAgZCA9IHJvdXRlLmNhY2hlO1xuICB9XG4gIHZhciB0YXJnZXQgPSBjb250ZXh0LmhpamFja2VyIHx8IHJvdXRlLmFjdGlvbjtcbiAgdmFyIGZyZXNobmVzcyA9IHBhcnNlRHVyYXRpb24oZCkgKiAxMDAwO1xuICBpZiAoJ21vZGVsJyBpbiBkYXRhKSB7XG4gICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2NhY2hlXSBzYXZpbmcgbW9kZWwgZm9yICVzJywgcm91dGUucGFydHMucGF0aCk7XG4gICAgY2FjaGUuc2V0KCdtb2RlbHMnLCByb3V0ZS5wYXJ0cy5wYXRoLCBkYXRhLm1vZGVsLCBmcmVzaG5lc3MpO1xuICB9XG4gIGlmICgndGVtcGxhdGUnIGluIGRhdGEpIHtcbiAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbY2FjaGVdIHNhdmluZyB0ZW1wbGF0ZSBmb3IgJXMnLCB0YXJnZXQpO1xuICAgIGNhY2hlLnNldCgndGVtcGxhdGVzJywgdGFyZ2V0LCBkYXRhLnRlbXBsYXRlLCBmcmVzaG5lc3MpO1xuICB9XG4gIGlmICgnY29udHJvbGxlcicgaW4gZGF0YSkge1xuICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1tjYWNoZV0gc2F2aW5nIGNvbnRyb2xsZXIgZm9yICVzJywgdGFyZ2V0KTtcbiAgICBjYWNoZS5zZXQoJ2NvbnRyb2xsZXJzJywgdGFyZ2V0LCBkYXRhLmNvbnRyb2xsZXIsIGZyZXNobmVzcyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZHkgKGZuKSB7XG4gIGlmIChzdGF0ZS5jYWNoZSkge1xuICAgIGlkYi50ZXN0ZWQoZm4pOyAvLyB3YWl0IG9uIGlkYiBjb21wYXRpYmlsaXR5IHRlc3RzXG4gIH0gZWxzZSB7XG4gICAgZm4oZmFsc2UpOyAvLyBjYWNoaW5nIGlzIGEgbm8tb3BcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2V0dXA6IHNldHVwLFxuICBwZXJzaXN0OiBwZXJzaXN0LFxuICByZWFkeTogcmVhZHlcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBjbG9uZSAodmFsdWUpIHtcbiAgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjbG9uZTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGNhY2hpbmcgPSByZXF1aXJlKCcuL2NhY2hpbmcnKTtcbnZhciB1bnN0cmljdEV2YWwgPSByZXF1aXJlKCcuL3Vuc3RyaWN0RXZhbCcpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIGRlZmVycmVkID0gcmVxdWlyZSgnLi4vbGliL2RlZmVycmVkJyk7XG5cbmZ1bmN0aW9uIHNldCAoYWN0aW9uLCBkYXRhKSB7XG4gIHN0b3JlKCd0ZW1wbGF0ZScpO1xuICBzdG9yZSgnY29udHJvbGxlcicpO1xuXG4gIGZ1bmN0aW9uIHN0b3JlIChrZXkpIHtcbiAgICB2YXIgdHlwZSA9IGtleSArICdzJztcblxuICAgIGlmIChrZXkgaW4gZGF0YSkge1xuICAgICAgcHVzaCh0eXBlLCBhY3Rpb24sIGRhdGFba2V5XSwgZGF0YS52ZXJzaW9uKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmaWxsICgpIHtcbiAgY2FjaGluZy5yZWFkeShwdWxsQ29tcG9uZW50cyk7XG59XG5cbmZ1bmN0aW9uIHB1bGxDb21wb25lbnRzIChlbmFibGVkKSB7XG4gIGlmICghZW5hYmxlZCkgeyAvLyBiYWlsIGlmIGNhY2hpbmcgaXMgdHVybmVkIG9mZlxuICAgIHJldHVybjtcbiAgfVxuICBpZGIuZ2V0KCdjb250cm9sbGVycycsIHB1bGwuYmluZChudWxsLCAnY29udHJvbGxlcnMnKSk7XG4gIGlkYi5nZXQoJ3RlbXBsYXRlcycsIHB1bGwuYmluZChudWxsLCAndGVtcGxhdGVzJykpO1xufVxuXG5mdW5jdGlvbiBwdWxsICh0eXBlLCBlcnIsIGl0ZW1zKSB7XG4gIGlmIChlcnIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaXRlbXMuZm9yRWFjaChwdWxsSXRlbSk7XG5cbiAgZnVuY3Rpb24gcHVsbEl0ZW0gKGl0ZW0pIHtcbiAgICBwdXNoKHR5cGUsIGl0ZW0ua2V5LCBpdGVtLmRhdGEsIGl0ZW0udmVyc2lvbik7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHVzaCAodHlwZSwgYWN0aW9uLCB2YWx1ZSwgdmVyc2lvbikge1xuICB2YXIgc2luZ3VsYXIgPSB0eXBlLnN1YnN0cigwLCB0eXBlLmxlbmd0aCAtIDEpO1xuICB2YXIgaXMgPSBkZWZlcnJlZChhY3Rpb24sIHN0YXRlLmRlZmVycmFscyk7XG4gIGlmIChpcyA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHZlcnNpb24gPT09IHN0YXRlLnZlcnNpb24pIHtcbiAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbY29tcG9uZW50Q2FjaGVdIHN0b3JpbmcgJXMgZm9yICVzIGluIHN0YXRlJywgc2luZ3VsYXIsIGFjdGlvbik7XG4gICAgc3RhdGVbdHlwZV1bYWN0aW9uXSA9IHtcbiAgICAgIGZuOiBwYXJzZShzaW5ndWxhciwgdmFsdWUpLFxuICAgICAgdmVyc2lvbjogdmVyc2lvblxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2NvbXBvbmVudENhY2hlXSBiYWQgdmVyc2lvbjogJXMgIT09ICVzJywgdmVyc2lvbiwgc3RhdGUudmVyc2lvbik7XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2UgKHR5cGUsIHZhbHVlKSB7XG4gIGlmICh2YWx1ZSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdW5zdHJpY3RFdmFsKHZhbHVlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbY29tcG9uZW50Q2FjaGVdICVzIGV2YWwgZmFpbGVkJywgdHlwZSwgZSk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzZXQ6IHNldCxcbiAgcmVmaWxsOiByZWZpbGxcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZGVmZXJyZWQgPSByZXF1aXJlKCcuLi9saWIvZGVmZXJyZWQnKTtcblxuZnVuY3Rpb24gbmVlZHMgKGFjdGlvbikge1xuICB2YXIgZGVtYW5kcyA9IFtdO1xuICB2YXIgaXMgPSBkZWZlcnJlZChhY3Rpb24sIHN0YXRlLmRlZmVycmFscyk7XG4gIGlmIChpcykge1xuICAgIGlmIChpbnZhbGlkKCd0ZW1wbGF0ZXMnKSkge1xuICAgICAgZGVtYW5kcy5wdXNoKCd0ZW1wbGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaW52YWxpZCgnY29udHJvbGxlcnMnKSkge1xuICAgICAgZGVtYW5kcy5wdXNoKCdjb250cm9sbGVyJyk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW52YWxpZCAodHlwZSkge1xuICAgIHZhciBzdG9yZSA9IHN0YXRlW3R5cGVdO1xuICAgIHZhciBmYWlsID0gIXN0b3JlW2FjdGlvbl0gfHwgc3RvcmVbYWN0aW9uXS52ZXJzaW9uICE9PSBzdGF0ZS52ZXJzaW9uO1xuICAgIGlmIChmYWlsKSB7XG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbZGVmZXJyYWxdIGRlZmVycmVkICVzICVzIG5vdCBmb3VuZCcsIGFjdGlvbiwgdHlwZS5zdWJzdHIoMCwgdHlwZS5sZW5ndGggLSAxKSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIGRlbWFuZHM7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBuZWVkczogbmVlZHNcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZW1pdHRlcih7fSwgeyB0aHJvd3M6IGZhbHNlIH0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBhZGQgKGVsZW1lbnQsIHR5cGUsIGZuKSB7XG4gIGlmIChlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZm4pO1xuICB9IGVsc2UgaWYgKGVsZW1lbnQuYXR0YWNoRXZlbnQpIHtcbiAgICBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBmbikpO1xuICB9IGVsc2Uge1xuICAgIGVsZW1lbnRbJ29uJyArIHR5cGVdID0gZm47XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IHdpbmRvdy5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ICA9IGUucHJldmVudERlZmF1bHQgIHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGZuLmNhbGwoZWxlbWVudCwgZSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZFxufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJy4veGhyJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgZGVmZXJyYWwgPSByZXF1aXJlKCcuL2RlZmVycmFsJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgY29tcG9uZW50Q2FjaGUgPSByZXF1aXJlKCcuL2NvbXBvbmVudENhY2hlJyk7XG52YXIgbGFzdFhociA9IHt9O1xuXG5mdW5jdGlvbiBlICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG5lZ290aWF0ZSAocm91dGUsIGNvbnRleHQpIHtcbiAgdmFyIHBhcnRzID0gcm91dGUucGFydHM7XG4gIHZhciBxcyA9IGUocGFydHMuc2VhcmNoKTtcbiAgdmFyIHAgPSBxcyA/ICcmJyA6ICc/JztcbiAgdmFyIHRhcmdldCA9IGNvbnRleHQuaGlqYWNrZXIgfHwgcm91dGUuYWN0aW9uO1xuICB2YXIgZGVtYW5kcyA9IFsnanNvbiddLmNvbmNhdChkZWZlcnJhbC5uZWVkcyh0YXJnZXQpKTtcbiAgaWYgKGNvbnRleHQuaGlqYWNrZXIgJiYgY29udGV4dC5oaWphY2tlciAhPT0gcm91dGUuYWN0aW9uKSB7XG4gICAgZGVtYW5kcy5wdXNoKCdoaWphY2tlcj0nICsgY29udGV4dC5oaWphY2tlcik7XG4gIH1cbiAgcmV0dXJuIHBhcnRzLnBhdGhuYW1lICsgcXMgKyBwICsgZGVtYW5kcy5qb2luKCcmJyk7XG59XG5cbmZ1bmN0aW9uIGFib3J0IChzb3VyY2UpIHtcbiAgaWYgKGxhc3RYaHJbc291cmNlXSkge1xuICAgIGxhc3RYaHJbc291cmNlXS5hYm9ydCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFib3J0UGVuZGluZyAoKSB7XG4gIE9iamVjdC5rZXlzKGxhc3RYaHIpLmZvckVhY2goYWJvcnQpO1xuICBsYXN0WGhyID0ge307XG59XG5cbmZ1bmN0aW9uIGZldGNoZXIgKHJvdXRlLCBjb250ZXh0LCBkb25lKSB7XG4gIHZhciB1cmwgPSByb3V0ZS51cmw7XG4gIGlmIChsYXN0WGhyW2NvbnRleHQuc291cmNlXSkge1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdLmFib3J0KCk7XG4gICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSBudWxsO1xuICB9XG5cbiAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2ZldGNoZXJdIHJlcXVlc3RlZCAlcycsIHJvdXRlLnVybCk7XG5cbiAgaW50ZXJjZXB0b3IuZXhlY3V0ZShyb3V0ZSwgYWZ0ZXJJbnRlcmNlcHRvcnMpO1xuXG4gIGZ1bmN0aW9uIGFmdGVySW50ZXJjZXB0b3JzIChlcnIsIHJlc3VsdCkge1xuICAgIGlmICghZXJyICYmIHJlc3VsdC5kZWZhdWx0UHJldmVudGVkICYmICFjb250ZXh0LmhpamFja2VyKSB7XG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbZmV0Y2hlcl0gcHJldmVudGVkICVzIHdpdGggZGF0YScsIHJvdXRlLnVybCwgcmVzdWx0LmRhdGEpO1xuICAgICAgZG9uZShudWxsLCByZXN1bHQuZGF0YSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guc3RhcnQnLCByb3V0ZSwgY29udGV4dCk7XG4gICAgICBsYXN0WGhyW2NvbnRleHQuc291cmNlXSA9IHhocihuZWdvdGlhdGUocm91dGUsIGNvbnRleHQpLCBub3RpZnkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeSAoZXJyLCBkYXRhLCByZXMpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbZmV0Y2hlcl0gZmFpbGVkIGZvciAlcycsIHJvdXRlLnVybCk7XG4gICAgICBpZiAoZXJyLm1lc3NhZ2UgPT09ICdhYm9ydGVkJykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmFib3J0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5lcnJvcicsIHJvdXRlLCBjb250ZXh0LCBlcnIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbZmV0Y2hlcl0gc3VjY2VlZGVkIGZvciAlcycsIHJvdXRlLnVybCk7XG4gICAgICBpZiAoZGF0YSAmJiBkYXRhLnZlcnNpb24pIHtcbiAgICAgICAgc3RhdGUudmVyc2lvbiA9IGRhdGEudmVyc2lvbjsgLy8gc3luYyB2ZXJzaW9uIGV4cGVjdGF0aW9uIHdpdGggc2VydmVyLXNpZGVcbiAgICAgICAgY29tcG9uZW50Q2FjaGUuc2V0KHJvdXRlcihyZXMudXJsKS5wYXJ0cy5xdWVyeS5oaWphY2tlciB8fCByb3V0ZS5hY3Rpb24sIGRhdGEpO1xuICAgICAgfVxuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5kb25lJywgcm91dGUsIGNvbnRleHQsIGRhdGEpO1xuICAgIH1cbiAgICBkb25lKGVyciwgZGF0YSk7XG4gIH1cbn1cblxuZmV0Y2hlci5hYm9ydFBlbmRpbmcgPSBhYm9ydFBlbmRpbmc7XG5cbm1vZHVsZS5leHBvcnRzID0gZmV0Y2hlcjtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgbGlua3MgPSByZXF1aXJlKCcuL2xpbmtzJyk7XG5cbmZ1bmN0aW9uIGF0dGFjaCAoKSB7XG4gIGVtaXR0ZXIub24oJ3N0YXJ0JywgbGlua3MpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXR0YWNoOiBhdHRhY2hcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbmdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1tpbmRleF0gbG9hZGluZyB0YXVudXMnKTtcblxuaWYgKGdsb2JhbC50YXVudXMgIT09IHZvaWQgMCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ1VzZSByZXF1aXJlKFxcJ3RhdW51cy9nbG9iYWxcXCcpIGFmdGVyIHRoZSBpbml0aWFsIHJlcXVpcmUoXFwndGF1bnVzXFwnKSBzdGF0ZW1lbnQhJyk7XG59XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBzdGF0ZUNsZWFyID0gcmVxdWlyZSgnLi9zdGF0ZUNsZWFyJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaG9va3MgPSByZXF1aXJlKCcuL2hvb2tzJyk7XG52YXIgdmlldyA9IHJlcXVpcmUoJy4vdmlldycpO1xudmFyIG1vdW50ID0gcmVxdWlyZSgnLi9tb3VudCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgeGhyID0gcmVxdWlyZSgnLi94aHInKTtcblxuc3RhdGUuY2xlYXIgPSBzdGF0ZUNsZWFyO1xuaG9va3MuYXR0YWNoKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gZ2xvYmFsLnRhdW51cyA9IHtcbiAgbW91bnQ6IG1vdW50LFxuICBwYXJ0aWFsOiB2aWV3LnBhcnRpYWwsXG4gIG9uOiBlbWl0dGVyLm9uLmJpbmQoZW1pdHRlciksXG4gIG9uY2U6IGVtaXR0ZXIub25jZS5iaW5kKGVtaXR0ZXIpLFxuICBvZmY6IGVtaXR0ZXIub2ZmLmJpbmQoZW1pdHRlciksXG4gIGludGVyY2VwdDogaW50ZXJjZXB0b3IuYWRkLFxuICBuYXZpZ2F0ZTogYWN0aXZhdG9yLmdvLFxuICBzdGF0ZTogc3RhdGUsXG4gIHJvdXRlOiByb3V0ZXIsXG4gIHhocjogeGhyXG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xudmFyIG9uY2UgPSByZXF1aXJlKCcuL29uY2UnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGludGVyY2VwdG9ycyA9IGVtaXR0ZXIoeyBjb3VudDogMCB9LCB7IGFzeW5jOiB0cnVlIH0pO1xuXG5mdW5jdGlvbiBnZXRJbnRlcmNlcHRvckV2ZW50IChyb3V0ZSkge1xuICB2YXIgZSA9IHtcbiAgICB1cmw6IHJvdXRlLnVybCxcbiAgICByb3V0ZTogcm91dGUsXG4gICAgcGFydHM6IHJvdXRlLnBhcnRzLFxuICAgIGRhdGE6IG51bGwsXG4gICAgY2FuUHJldmVudERlZmF1bHQ6IHRydWUsXG4gICAgZGVmYXVsdFByZXZlbnRlZDogZmFsc2UsXG4gICAgcHJldmVudERlZmF1bHQ6IG9uY2UocHJldmVudERlZmF1bHQpXG4gIH07XG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKGRhdGEpIHtcbiAgICBpZiAoIWUuY2FuUHJldmVudERlZmF1bHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZS5jYW5QcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgIGUuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgZS5kYXRhID0gZGF0YTtcbiAgfVxuXG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBhZGQgKGFjdGlvbiwgZm4pIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICBmbiA9IGFjdGlvbjtcbiAgICBhY3Rpb24gPSAnKic7XG4gIH1cbiAgaW50ZXJjZXB0b3JzLmNvdW50Kys7XG4gIGludGVyY2VwdG9ycy5vbihhY3Rpb24sIGZuKTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZVN5bmMgKHJvdXRlKSB7XG4gIHZhciBlID0gZ2V0SW50ZXJjZXB0b3JFdmVudChyb3V0ZSk7XG5cbiAgaW50ZXJjZXB0b3JzLmVtaXQoJyonLCBlKTtcbiAgaW50ZXJjZXB0b3JzLmVtaXQocm91dGUuYWN0aW9uLCBlKTtcblxuICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZSAocm91dGUsIGRvbmUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlKTtcbiAgaWYgKGludGVyY2VwdG9ycy5jb3VudCA9PT0gMCkgeyAvLyBmYWlsIGZhc3RcbiAgICBlbmQoKTsgcmV0dXJuO1xuICB9XG4gIHZhciBmbiA9IG9uY2UoZW5kKTtcbiAgdmFyIHByZXZlbnREZWZhdWx0QmFzZSA9IGUucHJldmVudERlZmF1bHQ7XG5cbiAgZS5wcmV2ZW50RGVmYXVsdCA9IG9uY2UocHJldmVudERlZmF1bHRFbmRzKTtcblxuICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbaW50ZXJjZXB0b3JdIGV4ZWN1dGluZyBmb3IgJXMnLCByb3V0ZS51cmwpO1xuXG4gIGludGVyY2VwdG9ycy5lbWl0KCcqJywgZSk7XG4gIGludGVyY2VwdG9ycy5lbWl0KHJvdXRlLmFjdGlvbiwgZSk7XG5cbiAgc2V0VGltZW91dChmbiwgNTApOyAvLyBhdCB3b3JzdCwgc3BlbmQgNTBtcyB3YWl0aW5nIG9uIGludGVyY2VwdG9yc1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0RW5kcyAoKSB7XG4gICAgcHJldmVudERlZmF1bHRCYXNlLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgZm4oKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZCAoKSB7XG4gICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2ludGVyY2VwdG9yXSAlcyBmb3IgJXMnLCBpbnRlcmNlcHRvcnMuY291bnQgPT09IDAgJiYgJ3NraXBwZWQnIHx8IGUuZGVmYXVsdFByZXZlbnRlZCAmJiAncHJldmVudGVkJyB8fCAndGltZWQgb3V0Jywgcm91dGUudXJsKTtcbiAgICBlLmNhblByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgZG9uZShudWxsLCBlKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGQsXG4gIGV4ZWN1dGU6IGV4ZWN1dGVcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBhY3RpdmF0b3IgPSByZXF1aXJlKCcuL2FjdGl2YXRvcicpO1xudmFyIG9yaWdpbiA9IGRvY3VtZW50LmxvY2F0aW9uLm9yaWdpbjtcbnZhciBsZWZ0Q2xpY2sgPSAxO1xudmFyIHByZWZldGNoaW5nID0gW107XG52YXIgY2xpY2tzT25Ib2xkID0gW107XG5cbmZ1bmN0aW9uIGxpbmtzICgpIHtcbiAgaWYgKHN0YXRlLnByZWZldGNoICYmIHN0YXRlLmNhY2hlKSB7IC8vIHByZWZldGNoIHdpdGhvdXQgY2FjaGUgbWFrZXMgbm8gc2Vuc2VcbiAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbbGlua3NdIGxpc3RlbmluZyBmb3IgcHJlZmV0Y2hpbmcgb3Bwb3J0dW5pdGllcycpO1xuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ21vdXNlb3ZlcicsIG1heWJlUHJlZmV0Y2gpO1xuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ3RvdWNoc3RhcnQnLCBtYXliZVByZWZldGNoKTtcbiAgfVxuICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbbGlua3NdIGxpc3RlbmluZyBmb3IgcmVyb3V0aW5nIG9wcG9ydHVuaXRpZXMnKTtcbiAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAnY2xpY2snLCBtYXliZVJlcm91dGUpO1xufVxuXG5mdW5jdGlvbiBzbyAoYW5jaG9yKSB7XG4gIHJldHVybiBhbmNob3Iub3JpZ2luID09PSBvcmlnaW47XG59XG5cbmZ1bmN0aW9uIGxlZnRDbGlja09uQW5jaG9yIChlLCBhbmNob3IpIHtcbiAgcmV0dXJuIGFuY2hvci5wYXRobmFtZSAmJiBlLndoaWNoID09PSBsZWZ0Q2xpY2sgJiYgIWUubWV0YUtleSAmJiAhZS5jdHJsS2V5O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRPckFuY2hvciAoZSkge1xuICB2YXIgYW5jaG9yID0gZS50YXJnZXQ7XG4gIHdoaWxlIChhbmNob3IpIHtcbiAgICBpZiAoYW5jaG9yLnRhZ05hbWUgPT09ICdBJykge1xuICAgICAgcmV0dXJuIGFuY2hvcjtcbiAgICB9XG4gICAgYW5jaG9yID0gYW5jaG9yLnBhcmVudEVsZW1lbnQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWF5YmVSZXJvdXRlIChlKSB7XG4gIHZhciBhbmNob3IgPSB0YXJnZXRPckFuY2hvcihlKTtcbiAgaWYgKGFuY2hvciAmJiBzbyhhbmNob3IpICYmIGxlZnRDbGlja09uQW5jaG9yKGUsIGFuY2hvcikpIHtcbiAgICByZXJvdXRlKGUsIGFuY2hvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWF5YmVQcmVmZXRjaCAoZSkge1xuICB2YXIgYW5jaG9yID0gdGFyZ2V0T3JBbmNob3IoZSk7XG4gIGlmIChhbmNob3IgJiYgc28oYW5jaG9yKSkge1xuICAgIHByZWZldGNoKGUsIGFuY2hvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiBnZXRSb3V0ZSAoYW5jaG9yKSB7XG4gIHZhciB1cmwgPSBhbmNob3IucGF0aG5hbWUgKyBhbmNob3Iuc2VhcmNoICsgYW5jaG9yLmhhc2g7XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLmlnbm9yZSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIHJlcm91dGUgKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJldmVudCgpO1xuXG4gIGlmIChwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2xpbmtzXSB3YWl0aW5nIG9uIHByZWZldGNoZXIgZm9yICVzJywgcm91dGUudXJsKTtcbiAgICBjbGlja3NPbkhvbGQucHVzaChhbmNob3IpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1tsaW5rc10gbmF2aWdhdGluZyB0byAlcycsIHJvdXRlLnVybCk7XG4gIGFjdGl2YXRvci5nbyhyb3V0ZS51cmwsIHsgY29udGV4dDogYW5jaG9yIH0pO1xuXG4gIGZ1bmN0aW9uIHByZXZlbnQgKCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IH1cbn1cblxuZnVuY3Rpb24gcHJlZmV0Y2ggKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbbGlua3NdIHByZWZldGNoaW5nICVzJywgcm91dGUudXJsKTtcbiAgcHJlZmV0Y2hpbmcucHVzaChhbmNob3IpO1xuICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGFuY2hvciwgc291cmNlOiAncHJlZmV0Y2gnIH0sIHJlc29sdmVkKTtcblxuICBmdW5jdGlvbiByZXNvbHZlZCAoKSB7XG4gICAgcHJlZmV0Y2hpbmcuc3BsaWNlKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSwgMSk7XG4gICAgaWYgKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgICBjbGlja3NPbkhvbGQuc3BsaWNlKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvciksIDEpO1xuXG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbbGlua3NdIHByZWZldGNoZXIgcmVzdW1lZCAlcycsIHJvdXRlLnVybCk7XG4gICAgICBhY3RpdmF0b3IuZ28ocm91dGUudXJsLCB7IGNvbnRleHQ6IGFuY2hvciB9KTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBsaW5rcztcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciB1bmVzY2FwZSA9IHJlcXVpcmUoJy4vdW5lc2NhcGUnKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgY2FjaGluZyA9IHJlcXVpcmUoJy4vY2FjaGluZycpO1xudmFyIGNvbXBvbmVudENhY2hlID0gcmVxdWlyZSgnLi9jb21wb25lbnRDYWNoZScpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciB2ZXJzaW9uaW5nID0gcmVxdWlyZSgnLi4vdmVyc2lvbmluZycpO1xudmFyIGcgPSBnbG9iYWw7XG52YXIgbW91bnRlZDtcbnZhciBib290ZWQ7XG5cbmZ1bmN0aW9uIG9yRW1wdHkgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gbW91bnQgKGNvbnRhaW5lciwgd2lyaW5nLCBvcHRpb25zKSB7XG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKG1vdW50ZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhdW51cyBhbHJlYWR5IG1vdW50ZWQhJyk7XG4gIH1cbiAgaWYgKCFjb250YWluZXIgfHwgIWNvbnRhaW5lci50YWdOYW1lKSB7IC8vIG5hw692ZSBpcyBlbm91Z2hcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhbiBhcHBsaWNhdGlvbiByb290IGNvbnRhaW5lciEnKTtcbiAgfVxuICBpZiAoIW8uYm9vdHN0cmFwKSB7IG8uYm9vdHN0cmFwID0gJ2F1dG8nOyB9XG5cbiAgbW91bnRlZCA9IHRydWU7XG5cbiAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW21vdW50XSBtb3VudHBvaW50IGludm9rZWQgdXNpbmcgXCIlc1wiIHN0cmF0ZWd5Jywgby5ib290c3RyYXApO1xuXG4gIHN0YXRlLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcbiAgc3RhdGUuY29udHJvbGxlcnMgPSB3aXJpbmcuY29udHJvbGxlcnM7XG4gIHN0YXRlLnRlbXBsYXRlcyA9IHdpcmluZy50ZW1wbGF0ZXM7XG4gIHN0YXRlLnJvdXRlcyA9IHdpcmluZy5yb3V0ZXM7XG4gIHN0YXRlLmRlZmVycmFscyA9IHdpcmluZy5kZWZlcnJhbHMgfHwgW107XG4gIHN0YXRlLnByZWZldGNoID0gISFvLnByZWZldGNoO1xuICBzdGF0ZS52ZXJzaW9uID0gdmVyc2lvbmluZy5nZXQoby52ZXJzaW9uIHx8ICcxJyk7XG5cbiAgcm91dGVyLnNldHVwKHdpcmluZy5yb3V0ZXMpO1xuXG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcblxuICBjYWNoaW5nLnNldHVwKG8uY2FjaGUsIHJvdXRlKTtcbiAgY2FjaGluZy5yZWFkeShraWNrc3RhcnQpO1xuICBjb21wb25lbnRDYWNoZS5yZWZpbGwoKTtcblxuICBmdW5jdGlvbiBraWNrc3RhcnQgKCkge1xuICAgIGlmIChvLmJvb3RzdHJhcCA9PT0gJ2F1dG8nKSB7XG4gICAgICBhdXRvYm9vdCgpO1xuICAgIH0gZWxzZSBpZiAoby5ib290c3RyYXAgPT09ICdpbmxpbmUnKSB7XG4gICAgICBpbmxpbmVib290KCk7XG4gICAgfSBlbHNlIGlmIChvLmJvb3RzdHJhcCA9PT0gJ21hbnVhbCcpIHtcbiAgICAgIG1hbnVhbGJvb3QoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKG8uYm9vdHN0cmFwICsgJyBpcyBub3QgYSB2YWxpZCBib290c3RyYXAgbW9kZSEnKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhdXRvYm9vdCAoKSB7XG4gICAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250YWluZXIsIHNvdXJjZTogJ2Jvb3QnIH0sIGZldGNoZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZmV0Y2hlZCAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGZXRjaGluZyBKU09OIGRhdGEgbW9kZWwgZmFpbGVkIGF0IG1vdW50cG9pbnQuJyk7XG4gICAgfVxuICAgIGJvb3QoZGF0YSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmxpbmVib290ICgpIHtcbiAgICB2YXIgaWQgPSBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLXRhdW51cycpO1xuICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIGRhdGEgPSBKU09OLnBhcnNlKHVuZXNjYXBlKHNjcmlwdC5pbm5lclRleHQgfHwgc2NyaXB0LnRleHRDb250ZW50KSk7XG4gICAgYm9vdChkYXRhKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1hbnVhbGJvb3QgKCkge1xuICAgIGlmICh0eXBlb2YgZy50YXVudXNSZWFkeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgZy50YXVudXNSZWFkeSA9IGJvb3Q7IC8vIG5vdCB5ZXQgYW4gb2JqZWN0PyB0dXJuIGl0IGludG8gdGhlIGJvb3QgbWV0aG9kXG4gICAgfSBlbHNlIGlmIChnLnRhdW51c1JlYWR5ICYmIHR5cGVvZiBnLnRhdW51c1JlYWR5ID09PSAnb2JqZWN0Jykge1xuICAgICAgYm9vdChnLnRhdW51c1JlYWR5KTsgLy8gYWxyZWFkeSBhbiBvYmplY3Q/IGJvb3Qgd2l0aCB0aGF0IGFzIHRoZSBkYXRhIG9iamVjdFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0RpZCB5b3UgZm9yZ2V0IHRvIGFkZCB0aGUgdGF1bnVzUmVhZHkgZ2xvYmFsPycpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGJvb3QgKGRhdGEpIHtcbiAgICBpZiAoYm9vdGVkKSB7IC8vIHNhbml0eVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1ttb3VudF0gbW91bnRwb2ludCBib290ZWQgd2l0aCBkYXRhJywgZGF0YSk7XG5cbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIGRhdGEgaXMgcmVxdWlyZWQhIEJvb3QgZmFpbGVkJyk7XG4gICAgfVxuICAgIGlmICghZGF0YS52ZXJzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZlcnNpb24gZGF0YSBpcyBtaXNzaW5nISBCb290IGZhaWxlZCcpO1xuICAgIH1cbiAgICBpZiAoIWRhdGEubW9kZWwgfHwgdHlwZW9mIGRhdGEubW9kZWwgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhdW51cyBtb2RlbCBtdXN0IGJlIGFuIG9iamVjdCEgQm9vdCBmYWlsZWQnKTtcbiAgICB9XG4gICAgYm9vdGVkID0gdHJ1ZTtcbiAgICBjYWNoaW5nLnBlcnNpc3Qocm91dGUsIHN0YXRlLmNvbnRhaW5lciwgZGF0YSk7XG4gICAgYWN0aXZhdG9yLnN0YXJ0KGRhdGEpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbW91bnQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBzb3VyY2U6IGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2pkYWx0b24vNWUzNGQ4OTAxMDVhY2E0NDM5OWZcbi8vIHRoYW5rcyBAamRhbHRvbiFcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZzsgLy8gdXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBgW1tDbGFzc11dYCBvZiB2YWx1ZXNcbnZhciBmblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nOyAvLyB1c2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9uc1xudmFyIGhvc3QgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvOyAvLyB1c2VkIHRvIGRldGVjdCBob3N0IGNvbnN0cnVjdG9ycyAoU2FmYXJpID4gNDsgcmVhbGx5IHR5cGVkIGFycmF5IHNwZWNpZmljKVxuXG4vLyBFc2NhcGUgYW55IHNwZWNpYWwgcmVnZXhwIGNoYXJhY3RlcnMuXG52YXIgc3BlY2lhbHMgPSAvWy4qKz9eJHt9KCl8W1xcXVxcL1xcXFxdL2c7XG5cbi8vIFJlcGxhY2UgbWVudGlvbnMgb2YgYHRvU3RyaW5nYCB3aXRoIGAuKj9gIHRvIGtlZXAgdGhlIHRlbXBsYXRlIGdlbmVyaWMuXG4vLyBSZXBsYWNlIHRoaW5nIGxpa2UgYGZvciAuLi5gIHRvIHN1cHBvcnQgZW52aXJvbm1lbnRzLCBsaWtlIFJoaW5vLCB3aGljaCBhZGQgZXh0cmFcbi8vIGluZm8gc3VjaCBhcyBtZXRob2QgYXJpdHkuXG52YXIgZXh0cmFzID0gL3RvU3RyaW5nfChmdW5jdGlvbikuKj8oPz1cXFxcXFwoKXwgZm9yIC4rPyg/PVxcXFxcXF0pL2c7XG5cbi8vIENvbXBpbGUgYSByZWdleHAgdXNpbmcgYSBjb21tb24gbmF0aXZlIG1ldGhvZCBhcyBhIHRlbXBsYXRlLlxuLy8gV2UgY2hvc2UgYE9iamVjdCN0b1N0cmluZ2AgYmVjYXVzZSB0aGVyZSdzIGEgZ29vZCBjaGFuY2UgaXQgaXMgbm90IGJlaW5nIG11Y2tlZCB3aXRoLlxudmFyIGZuU3RyaW5nID0gU3RyaW5nKHRvU3RyaW5nKS5yZXBsYWNlKHNwZWNpYWxzLCAnXFxcXCQmJykucmVwbGFjZShleHRyYXMsICckMS4qPycpO1xudmFyIHJlTmF0aXZlID0gbmV3IFJlZ0V4cCgnXicgKyBmblN0cmluZyArICckJyk7XG5cbmZ1bmN0aW9uIG5hdGl2ZUZuICh2YWx1ZSkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgaWYgKHR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAvLyBVc2UgYEZ1bmN0aW9uI3RvU3RyaW5nYCB0byBieXBhc3MgdGhlIHZhbHVlJ3Mgb3duIGB0b1N0cmluZ2AgbWV0aG9kXG4gICAgLy8gYW5kIGF2b2lkIGJlaW5nIGZha2VkIG91dC5cbiAgICByZXR1cm4gcmVOYXRpdmUudGVzdChmblRvU3RyaW5nLmNhbGwodmFsdWUpKTtcbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGEgaG9zdCBvYmplY3QgY2hlY2sgYmVjYXVzZSBzb21lIGVudmlyb25tZW50cyB3aWxsIHJlcHJlc2VudFxuICAvLyB0aGluZ3MgbGlrZSB0eXBlZCBhcnJheXMgYXMgRE9NIG1ldGhvZHMgd2hpY2ggbWF5IG5vdCBjb25mb3JtIHRvIHRoZVxuICAvLyBub3JtYWwgbmF0aXZlIHBhdHRlcm4uXG4gIHJldHVybiAodmFsdWUgJiYgdHlwZSA9PT0gJ29iamVjdCcgJiYgaG9zdC50ZXN0KHRvU3RyaW5nLmNhbGwodmFsdWUpKSkgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbmF0aXZlRm47XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGlzcG9zYWJsZSAoZm4pIHtcbiAgdmFyIHVzZWQ7XG4gIHJldHVybiBmdW5jdGlvbiBvbmNlICgpIHtcbiAgICBpZiAodXNlZCkgeyByZXR1cm47IH0gdXNlZCA9IHRydWU7XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXJsID0gcmVxdWlyZSgnZmFzdC11cmwtcGFyc2VyJyk7XG52YXIgcm91dGVzID0gcmVxdWlyZSgncm91dGVzJyk7XG52YXIgbWF0Y2hlciA9IHJvdXRlcygpO1xudmFyIHByb3RvY29sID0gL15bYS16XSs/OlxcL1xcLy9pO1xuXG5mdW5jdGlvbiBnZXRGdWxsVXJsIChyYXcpIHtcbiAgdmFyIGJhc2UgPSBsb2NhdGlvbi5ocmVmLnN1YnN0cihsb2NhdGlvbi5vcmlnaW4ubGVuZ3RoKTtcbiAgdmFyIGhhc2hsZXNzO1xuICBpZiAoIXJhdykge1xuICAgIHJldHVybiBiYXNlO1xuICB9XG4gIGlmIChyYXdbMF0gPT09ICcjJykge1xuICAgIGhhc2hsZXNzID0gYmFzZS5zdWJzdHIoMCwgYmFzZS5sZW5ndGggLSBsb2NhdGlvbi5oYXNoLmxlbmd0aCk7XG4gICAgcmV0dXJuIGhhc2hsZXNzICsgcmF3O1xuICB9XG4gIGlmIChwcm90b2NvbC50ZXN0KHJhdykpIHtcbiAgICBpZiAocmF3LmluZGV4T2YobG9jYXRpb24ub3JpZ2luKSA9PT0gMCkge1xuICAgICAgcmV0dXJuIHJhdy5zdWJzdHIobG9jYXRpb24ub3JpZ2luLmxlbmd0aCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiByYXc7XG59XG5cbmZ1bmN0aW9uIHJvdXRlciAocmF3KSB7XG4gIHZhciBmdWxsID0gZ2V0RnVsbFVybChyYXcpO1xuICBpZiAoZnVsbCA9PT0gbnVsbCkge1xuICAgIHJldHVybiBmdWxsO1xuICB9XG4gIHZhciBwYXJ0cyA9IHVybC5wYXJzZShmdWxsLCB0cnVlKTtcbiAgdmFyIHJlc3VsdCA9IG1hdGNoZXIubWF0Y2gocGFydHMucGF0aG5hbWUpO1xuICB2YXIgcm91dGUgPSByZXN1bHQgPyByZXN1bHQuZm4ocmVzdWx0KSA6IG51bGw7XG4gIGlmIChyb3V0ZSkge1xuICAgIHJvdXRlLnVybCA9IGZ1bGw7XG4gICAgcm91dGUucGFydHMgPSBwYXJ0cztcbiAgfVxuXG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1tyb3V0ZXJdICVzIHlpZWxkcyAlcycsIHJhdywgcm91dGUucm91dGUpO1xuXG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gc2V0dXAgKGRlZmluaXRpb25zKSB7XG4gIGRlZmluaXRpb25zLmZvckVhY2goZGVmaW5lKTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lIChkZWZpbml0aW9uKSB7XG4gIG1hdGNoZXIuYWRkUm91dGUoZGVmaW5pdGlvbi5yb3V0ZSwgZnVuY3Rpb24gYnVpbGQgKG1hdGNoKSB7XG4gICAgdmFyIHBhcmFtcyA9IG1hdGNoLnBhcmFtcztcbiAgICBwYXJhbXMuYXJncyA9IG1hdGNoLnNwbGF0cztcbiAgICByZXR1cm4ge1xuICAgICAgcm91dGU6IGRlZmluaXRpb24ucm91dGUsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIGFjdGlvbjogZGVmaW5pdGlvbi5hY3Rpb24gfHwgbnVsbCxcbiAgICAgIGlnbm9yZTogZGVmaW5pdGlvbi5pZ25vcmUsXG4gICAgICBjYWNoZTogZGVmaW5pdGlvbi5jYWNoZVxuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBlcXVhbHMgKGxlZnQsIHJpZ2h0KSB7XG4gIHJldHVybiBsZWZ0ICYmIHJpZ2h0ICYmIGxlZnQucm91dGUgPT09IHJpZ2h0LnJvdXRlICYmIEpTT04uc3RyaW5naWZ5KGxlZnQucGFyYW1zKSA9PT0gSlNPTi5zdHJpbmdpZnkocmlnaHQucGFyYW1zKTtcbn1cblxucm91dGVyLnNldHVwID0gc2V0dXA7XG5yb3V0ZXIuZXF1YWxzID0gZXF1YWxzO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJvdXRlcjtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBjb250YWluZXI6IG51bGxcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByYXcgPSByZXF1aXJlKCcuL3N0b3Jlcy9yYXcnKTtcbnZhciBpZGIgPSByZXF1aXJlKCcuL3N0b3Jlcy9pZGInKTtcblxuZnVuY3Rpb24gY2xlYXIgKCkge1xuICByYXcuY2xlYXIoKTtcbiAgaWRiLmNsZWFyKCdtb2RlbHMnKTtcbiAgaWRiLmNsZWFyKCdjb250cm9sbGVycycpO1xuICBpZGIuY2xlYXIoJ3RlbXBsYXRlcycpO1xuICBjbGVhclN0b3JlKCdjb250cm9sbGVycycpO1xuICBjbGVhclN0b3JlKCd0ZW1wbGF0ZXMnKTtcbn1cblxuZnVuY3Rpb24gY2xlYXJTdG9yZSAodHlwZSkge1xuICB2YXIgc3RvcmUgPSBzdGF0ZVt0eXBlXTtcbiAgT2JqZWN0LmtleXMoc3RvcmUpLmZpbHRlcihvKS5mb3JFYWNoKHJtKTtcblxuICBmdW5jdGlvbiBvIChhY3Rpb24pIHtcbiAgICByZXR1cm4gc3RvcmVbYWN0aW9uXSAmJiB0eXBlb2Ygc3RvcmVbYWN0aW9uXSA9PT0gJ29iamVjdCc7XG4gIH1cbiAgZnVuY3Rpb24gcm0gKGFjdGlvbikge1xuICAgIGRlbGV0ZSBzdG9yZVthY3Rpb25dO1xuICB9XG59XG5cblxubW9kdWxlLmV4cG9ydHMgPSBjbGVhcjtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGFwaSA9IHt9O1xudmFyIGcgPSBnbG9iYWw7XG52YXIgaWRiID0gZy5pbmRleGVkREIgfHwgZy5tb3pJbmRleGVkREIgfHwgZy53ZWJraXRJbmRleGVkREIgfHwgZy5tc0luZGV4ZWREQjtcbnZhciBzdXBwb3J0cztcbnZhciBkYjtcbnZhciBkYlZlcnNpb24gPSAzO1xudmFyIGRiTmFtZSA9ICd0YXVudXMnO1xudmFyIGtleVBhdGggPSAna2V5JztcbnZhciBzZXRRdWV1ZSA9IFtdO1xudmFyIHRlc3RlZFF1ZXVlID0gW107XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gdGVzdCAoKSB7XG4gIHZhciBrZXkgPSAnaW5kZXhlZC1kYi1mZWF0dXJlLWRldGVjdGlvbic7XG4gIHZhciByZXE7XG4gIHZhciBkYjtcblxuICBpZiAoIShpZGIgJiYgJ2RlbGV0ZURhdGFiYXNlJyBpbiBpZGIpKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7IHJldHVybjtcbiAgfVxuXG4gIHRyeSB7XG4gICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSkub25zdWNjZXNzID0gdHJhbnNhY3Rpb25hbFRlc3Q7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyYW5zYWN0aW9uYWxUZXN0ICgpIHtcbiAgICByZXEgPSBpZGIub3BlbihrZXksIDEpO1xuICAgIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gICAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICAgIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgICByZXEucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdzdG9yZScpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgICAgZGIgPSByZXEucmVzdWx0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGIudHJhbnNhY3Rpb24oJ3N0b3JlJywgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKCdzdG9yZScpLmFkZChuZXcgQmxvYigpLCAna2V5Jyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZGIuY2xvc2UoKTtcbiAgICAgICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSk7XG4gICAgICAgIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICBvcGVuKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgICBzdXBwb3J0KGZhbHNlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gb3BlbiAoKSB7XG4gIHZhciByZXEgPSBpZGIub3BlbihkYk5hbWUsIGRiVmVyc2lvbik7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG4gIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gIGZ1bmN0aW9uIHVwZ25lZWRlZCAoZSkge1xuICAgIHZhciBkYiA9IHJlcS5yZXN1bHQ7XG4gICAgdmFyIHYgPSBlLm9sZFZlcnNpb247XG4gICAgaWYgKHYgPT09IDEpIHtcbiAgICAgIGRiLmRlbGV0ZU9iamVjdFN0b3JlKCd3aWxkc3RvcmUnKTtcbiAgICB9XG4gICAgaWYgKHYgPCAyKSB7XG4gICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZSgnbW9kZWxzJywgeyBrZXlQYXRoOiBrZXlQYXRoIH0pO1xuICAgICAgZGIuY3JlYXRlT2JqZWN0U3RvcmUoJ3RlbXBsYXRlcycsIHsga2V5UGF0aDoga2V5UGF0aCB9KTtcbiAgICAgIGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdjb250cm9sbGVycycsIHsga2V5UGF0aDoga2V5UGF0aCB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdWNjZXNzICgpIHtcbiAgICBkYiA9IHJlcS5yZXN1bHQ7XG4gICAgYXBpLm5hbWUgPSAnSW5kZXhlZERCJztcbiAgICBhcGkuZ2V0ID0gZ2V0O1xuICAgIGFwaS5zZXQgPSBzZXQ7XG4gICAgYXBpLmNsZWFyID0gY2xlYXI7XG4gICAgZHJhaW5TZXQoKTtcbiAgICBzdXBwb3J0KHRydWUpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgIHN1cHBvcnQoZmFsc2UpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZhbGxiYWNrICgpIHtcbiAgYXBpLm5hbWUgPSAnSW5kZXhlZERCLWZhbGxiYWNrU3RvcmUnO1xuICBhcGkuZ2V0ID0gdW5kZWZpbmVkR2V0O1xuICBhcGkuc2V0ID0gZW5xdWV1ZVNldDtcbiAgYXBpLmNsZWFyID0gbm9vcDtcbn1cblxuZnVuY3Rpb24gdW5kZWZpbmVkR2V0IChzdG9yZSwga2V5LCBkb25lKSB7XG4gIChkb25lIHx8IGtleSkobnVsbCwgZG9uZSA/IG51bGwgOiBbXSk7XG59XG5cbmZ1bmN0aW9uIGVucXVldWVTZXQgKHN0b3JlLCBrZXksICB2YWx1ZSwgZG9uZSkge1xuICBpZiAoc2V0UXVldWUubGVuZ3RoID4gMikgeyAvLyBsZXQncyBub3Qgd2FzdGUgYW55IG1vcmUgbWVtb3J5XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHsgLy8gbGV0J3MgYXNzdW1lIHRoZSBjYXBhYmlsaXR5IGlzIHZhbGlkYXRlZCBzb29uXG4gICAgc2V0UXVldWUucHVzaCh7IHN0b3JlOiBzdG9yZSwga2V5OiBrZXksIHZhbHVlOiB2YWx1ZSwgZG9uZTogZG9uZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblNldCAoKSB7XG4gIHdoaWxlIChzZXRRdWV1ZS5sZW5ndGgpIHtcbiAgICB2YXIgaXRlbSA9IHNldFF1ZXVlLnNoaWZ0KCk7XG4gICAgc2V0KGl0ZW0uc3RvcmUsIGl0ZW0ua2V5LCBpdGVtLnZhbHVlLCBpdGVtLmRvbmUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHF1ZXJ5IChvcCwgc3RvcmUsIHZhbHVlLCBkb25lKSB7XG4gIHZhciByZXEgPSBkYi50cmFuc2FjdGlvbihzdG9yZSwgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKHN0b3JlKVtvcF0odmFsdWUpO1xuXG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG51bGwsIHJlcS5yZXN1bHQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG5ldyBFcnJvcignVGF1bnVzIGNhY2hlIHF1ZXJ5IGZhaWxlZCBhdCBJbmRleGVkREIhJykpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFsbCAoc3RvcmUsIGRvbmUpIHtcbiAgdmFyIHR4ID0gZGIudHJhbnNhY3Rpb24oc3RvcmUsICdyZWFkb25seScpO1xuICB2YXIgcyA9IHR4Lm9iamVjdFN0b3JlKHN0b3JlKTtcbiAgdmFyIHJlcSA9IHMub3BlbkN1cnNvcigpO1xuICB2YXIgaXRlbXMgPSBbXTtcblxuICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcbiAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgdHgub25jb21wbGV0ZSA9IGNvbXBsZXRlO1xuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlICgpIHtcbiAgICAoZG9uZSB8fCBub29wKShudWxsLCBpdGVtcyk7XG4gIH1cblxuICBmdW5jdGlvbiBzdWNjZXNzIChlKSB7XG4gICAgdmFyIGN1cnNvciA9IGUudGFyZ2V0LnJlc3VsdDtcbiAgICBpZiAoY3Vyc29yKSB7XG4gICAgICBpdGVtcy5wdXNoKGN1cnNvci52YWx1ZSk7XG4gICAgICBjdXJzb3IuY29udGludWUoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobmV3IEVycm9yKCdUYXVudXMgY2FjaGUgcXVlcnktYWxsIGZhaWxlZCBhdCBJbmRleGVkREIhJykpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNsZWFyIChzdG9yZSwgZG9uZSkge1xuICB2YXIgdHggPSBkYi50cmFuc2FjdGlvbihzdG9yZSwgJ3JlYWR3cml0ZScpO1xuICB2YXIgcyA9IHR4Lm9iamVjdFN0b3JlKHN0b3JlKTtcbiAgdmFyIHJlcSA9IHMuY2xlYXIoKTtcbiAgdmFyIGl0ZW1zID0gW107XG5cbiAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgdHgub25jb21wbGV0ZSA9IGNvbXBsZXRlO1xuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlICgpIHtcbiAgICAoZG9uZSB8fCBub29wKShudWxsLCBpdGVtcyk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobmV3IEVycm9yKCdUYXVudXMgY2FjaGUgY2xlYXIgZmFpbGVkIGF0IEluZGV4ZWREQiEnKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0IChzdG9yZSwga2V5LCBkb25lKSB7XG4gIGlmIChkb25lID09PSB2b2lkIDApIHtcbiAgICBhbGwoc3RvcmUsIGtleSk7XG4gIH0gZWxzZSB7XG4gICAgcXVlcnkoJ2dldCcsIHN0b3JlLCBrZXksIGRvbmUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldCAoc3RvcmUsIGtleSwgdmFsdWUsIGRvbmUpIHtcbiAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW2lkYl0gc3RvcmluZyAlcywgaW4gJXMgZGInLCBrZXksIHN0b3JlLCB2YWx1ZSk7XG4gIHZhbHVlW2tleVBhdGhdID0ga2V5O1xuICBxdWVyeSgnYWRkJywgc3RvcmUsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byBpbnNlcnRcbiAgcXVlcnkoJ3B1dCcsIHN0b3JlLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gdXBkYXRlXG59XG5cbmZ1bmN0aW9uIGRyYWluVGVzdGVkICgpIHtcbiAgd2hpbGUgKHRlc3RlZFF1ZXVlLmxlbmd0aCkge1xuICAgIHRlc3RlZFF1ZXVlLnNoaWZ0KCkoc3VwcG9ydHMpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRlc3RlZCAoZm4pIHtcbiAgaWYgKHN1cHBvcnRzICE9PSB2b2lkIDApIHtcbiAgICBmbihzdXBwb3J0cyk7XG4gIH0gZWxzZSB7XG4gICAgdGVzdGVkUXVldWUucHVzaChmbik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3VwcG9ydCAodmFsdWUpIHtcbiAgaWYgKHN1cHBvcnRzICE9PSB2b2lkIDApIHtcbiAgICByZXR1cm47IC8vIHNhbml0eVxuICB9XG4gIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1tpZGJdIHRlc3QgcmVzdWx0ICVzLCBkYiAlcycsIHZhbHVlLCB2YWx1ZSA/ICdyZWFkeScgOiAndW5hdmFpbGFibGUnKTtcbiAgc3VwcG9ydHMgPSB2YWx1ZTtcbiAgZHJhaW5UZXN0ZWQoKTtcbn1cblxuZnVuY3Rpb24gZmFpbGVkICgpIHtcbiAgc3VwcG9ydChmYWxzZSk7XG59XG5cbmZhbGxiYWNrKCk7XG50ZXN0KCk7XG5zZXRUaW1lb3V0KGZhaWxlZCwgNjAwKTsgLy8gdGhlIHRlc3QgY2FuIHRha2Ugc29tZXdoZXJlIG5lYXIgMzAwbXMgdG8gY29tcGxldGVcblxubW9kdWxlLmV4cG9ydHMgPSBhcGk7XG5cbmFwaS50ZXN0ZWQgPSB0ZXN0ZWQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmF3ID0ge307XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZW5zdXJlIChzdG9yZSkge1xuICBpZiAoIXJhd1tzdG9yZV0pIHsgcmF3W3N0b3JlXSA9IHt9OyB9XG59XG5cbmZ1bmN0aW9uIGdldCAoc3RvcmUsIGtleSwgZG9uZSkge1xuICBlbnN1cmUoc3RvcmUpO1xuICBkb25lKG51bGwsIHJhd1tzdG9yZV1ba2V5XSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoc3RvcmUsIGtleSwgdmFsdWUsIGRvbmUpIHtcbiAgZW5zdXJlKHN0b3JlKTtcbiAgcmF3W3N0b3JlXVtrZXldID0gdmFsdWU7XG4gIChkb25lIHx8IG5vb3ApKG51bGwpO1xufVxuXG5mdW5jdGlvbiBjbGVhciAoKSB7XG4gIHJhdyA9IHt9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbmFtZTogJ21lbW9yeVN0b3JlJyxcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0LFxuICBjbGVhcjogY2xlYXJcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciByZUVzY2FwZWRIdG1sID0gLyYoPzphbXB8bHR8Z3R8cXVvdHwjMzl8Izk2KTsvZztcbnZhciBodG1sVW5lc2NhcGVzID0ge1xuICAnJmFtcDsnOiAnJicsXG4gICcmbHQ7JzogJzwnLFxuICAnJmd0Oyc6ICc+JyxcbiAgJyZxdW90Oyc6ICdcIicsXG4gICcmIzM5Oyc6ICdcXCcnLFxuICAnJiM5NjsnOiAnYCdcbn07XG5cbmZ1bmN0aW9uIHVuZXNjYXBlSHRtbENoYXIgKGMpIHtcbiAgcmV0dXJuIGh0bWxVbmVzY2FwZXNbY107XG59XG5cbmZ1bmN0aW9uIHVuZXNjYXBlIChpbnB1dCkge1xuICB2YXIgZGF0YSA9IGlucHV0ID09IG51bGwgPyAnJyA6IFN0cmluZyhpbnB1dCk7XG4gIGlmIChkYXRhICYmIChyZUVzY2FwZWRIdG1sLmxhc3RJbmRleCA9IDAsIHJlRXNjYXBlZEh0bWwudGVzdChkYXRhKSkpIHtcbiAgICByZXR1cm4gZGF0YS5yZXBsYWNlKHJlRXNjYXBlZEh0bWwsIHVuZXNjYXBlSHRtbENoYXIpO1xuICB9XG4gIHJldHVybiBkYXRhO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHVuZXNjYXBlO1xuIiwiLyoganNoaW50IHN0cmljdDpmYWxzZSAqL1xuLy8gdGhpcyBtb2R1bGUgZG9lc24ndCB1c2Ugc3RyaWN0LCBzbyBldmFsIGlzIHVuc3RyaWN0LlxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb2RlKSB7XG4gIC8qIGpzaGludCBldmlsOnRydWUgKi9cbiAgcmV0dXJuIGV2YWwoY29kZSk7XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBkZWZlcnJhbCA9IHJlcXVpcmUoJy4vZGVmZXJyYWwnKTtcblxuZnVuY3Rpb24gdmlldyAoY29udGFpbmVyLCBlbmZvcmNlZEFjdGlvbiwgbW9kZWwsIHJvdXRlLCBvcHRpb25zKSB7XG4gIHZhciBhY3Rpb24gPSBlbmZvcmNlZEFjdGlvbiB8fCBtb2RlbCAmJiBtb2RlbC5hY3Rpb24gfHwgcm91dGUgJiYgcm91dGUuYWN0aW9uO1xuICB2YXIgZGVtYW5kcyA9IGRlZmVycmFsLm5lZWRzKGFjdGlvbik7XG5cbiAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW3ZpZXddIHJlbmRlcmluZyB2aWV3ICVzIHdpdGggWyVzXSBkZW1hbmRzJywgYWN0aW9uLCBkZW1hbmRzLmpvaW4oJywnKSk7XG5cbiAgaWYgKGRlbWFuZHMubGVuZ3RoKSB7XG4gICAgcHVsbCgpO1xuICB9IGVsc2Uge1xuICAgIHJlYWR5KCk7XG4gIH1cblxuICBmdW5jdGlvbiBwdWxsICgpIHtcbiAgICB2YXIgdmljdGltID0gcm91dGUgfHwgc3RhdGUucm91dGU7XG4gICAgdmFyIGNvbnRleHQgPSB7XG4gICAgICBzb3VyY2U6ICdoaWphY2tpbmcnLFxuICAgICAgaGlqYWNrZXI6IGFjdGlvbixcbiAgICAgIGVsZW1lbnQ6IGNvbnRhaW5lclxuICAgIH07XG4gICAgZ2xvYmFsLkRFQlVHICYmIGdsb2JhbC5ERUJVRygnW3ZpZXddIGhpamFja2luZyAlcyBmb3IgYWN0aW9uICVzJywgdmljdGltLnVybCwgYWN0aW9uKTtcbiAgICBmZXRjaGVyKHZpY3RpbSwgY29udGV4dCwgcmVhZHkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVhZHkgKCkge1xuICAgIHZhciBjb250cm9sbGVyID0gZ2V0Q29tcG9uZW50KCdjb250cm9sbGVycycsIGFjdGlvbik7XG4gICAgdmFyIGludGVybmFscyA9IG9wdGlvbnMgfHwge307XG4gICAgaWYgKGludGVybmFscy5yZW5kZXIgIT09IGZhbHNlKSB7XG4gICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gcmVuZGVyKGFjdGlvbiwgbW9kZWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbdmlld10gbm90IHJlbmRlcmluZyAlcycsIGFjdGlvbik7XG4gICAgfVxuICAgIGlmIChjb250YWluZXIgPT09IHN0YXRlLmNvbnRhaW5lcikge1xuICAgICAgZW1pdHRlci5lbWl0KCdjaGFuZ2UnLCByb3V0ZSwgbW9kZWwpO1xuICAgIH1cbiAgICBlbWl0dGVyLmVtaXQoJ3JlbmRlcicsIGNvbnRhaW5lciwgbW9kZWwsIHJvdXRlIHx8IG51bGwpO1xuICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1t2aWV3XSAlcyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciAlcycsIGNvbnRyb2xsZXIgPyAnZXhlY3V0aW5nJyA6ICdubycsIGFjdGlvbik7XG4gICAgaWYgKGNvbnRyb2xsZXIpIHtcbiAgICAgIGNvbnRyb2xsZXIobW9kZWwsIGNvbnRhaW5lciwgcm91dGUgfHwgbnVsbCk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlciAoYWN0aW9uLCBtb2RlbCkge1xuICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbdmlld10gcmVuZGVyaW5nICVzIHdpdGggbW9kZWwnLCBhY3Rpb24sIG1vZGVsKTtcbiAgdmFyIHRlbXBsYXRlID0gZ2V0Q29tcG9uZW50KCd0ZW1wbGF0ZXMnLCBhY3Rpb24pO1xuICBpZiAodHlwZW9mIHRlbXBsYXRlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdDbGllbnQtc2lkZSBcIicgKyBhY3Rpb24gKyAnXCIgdGVtcGxhdGUgbm90IGZvdW5kJyk7XG4gIH1cbiAgdHJ5IHtcbiAgICByZXR1cm4gdGVtcGxhdGUobW9kZWwpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciByZW5kZXJpbmcgXCInICsgYWN0aW9uICsgJ1wiIHZpZXcgdGVtcGxhdGVcXG4nICsgZS5zdGFjayk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0Q29tcG9uZW50ICh0eXBlLCBhY3Rpb24pIHtcbiAgdmFyIGNvbXBvbmVudCA9IHN0YXRlW3R5cGVdW2FjdGlvbl07XG4gIHZhciB0cmFuc3BvcnQgPSB0eXBlb2YgY29tcG9uZW50O1xuICBpZiAodHJhbnNwb3J0ID09PSAnb2JqZWN0JyAmJiBjb21wb25lbnQpIHtcbiAgICByZXR1cm4gY29tcG9uZW50LmZuO1xuICB9XG4gIGlmICh0cmFuc3BvcnQgPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gY29tcG9uZW50O1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnRpYWwgKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCkge1xuICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbdmlld10gcmVuZGVyaW5nIHBhcnRpYWwgJXMnLCBhY3Rpb24pO1xuICByZXR1cm4gdmlldyhjb250YWluZXIsIGFjdGlvbiwgbW9kZWwsIG51bGwsIHsgcm91dGVkOiBmYWxzZSB9KTtcbn1cblxudmlldy5wYXJ0aWFsID0gcGFydGlhbDtcblxubW9kdWxlLmV4cG9ydHMgPSB2aWV3O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJ3hocicpO1xuXG5mdW5jdGlvbiByZXF1ZXN0ICh1cmwsIG8sIGRvbmUpIHtcbiAgdmFyIG9wdGlvbnMgPSB7XG4gICAgdXJsOiB1cmwsXG4gICAganNvbjogdHJ1ZSxcbiAgICBoZWFkZXJzOiB7IEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nIH1cbiAgfTtcbiAgaWYgKGRvbmUpIHtcbiAgICBPYmplY3Qua2V5cyhvKS5mb3JFYWNoKG92ZXJ3cml0ZSk7XG4gIH0gZWxzZSB7XG4gICAgZG9uZSA9IG87XG4gIH1cblxuICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbeGhyXSAlcyAlcycsIG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnLCBvcHRpb25zLnVybCk7XG5cbiAgdmFyIHJlcSA9IHhocihvcHRpb25zLCBoYW5kbGUpO1xuXG4gIHJldHVybiByZXE7XG5cbiAgZnVuY3Rpb24gb3ZlcndyaXRlIChwcm9wKSB7XG4gICAgb3B0aW9uc1twcm9wXSA9IG9bcHJvcF07XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGUgKGVyciwgcmVzLCBib2R5KSB7XG4gICAgaWYgKGVyciAmJiAhcmVxLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKSB7XG4gICAgICBnbG9iYWwuREVCVUcgJiYgZ2xvYmFsLkRFQlVHKCdbeGhyXSAlcyAlcyBhYm9ydGVkJywgb3B0aW9ucy5tZXRob2QgfHwgJ0dFVCcsIG9wdGlvbnMudXJsKTtcbiAgICAgIGRvbmUobmV3IEVycm9yKCdhYm9ydGVkJyksIG51bGwsIHJlcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsb2JhbC5ERUJVRyAmJiBnbG9iYWwuREVCVUcoJ1t4aHJdICVzICVzIGRvbmUnLCBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJywgb3B0aW9ucy51cmwpO1xuICAgICAgZG9uZShlcnIsIGJvZHksIHJlcyk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWVzdDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmZXJyZWQgKGFjdGlvbiwgcnVsZXMpIHtcbiAgcmV0dXJuIHJ1bGVzLnNvbWUoZmFpbGVkKTtcbiAgZnVuY3Rpb24gZmFpbGVkIChjaGFsbGVuZ2UpIHtcbiAgICB2YXIgbGVmdCA9IGNoYWxsZW5nZS5zcGxpdCgnLycpO1xuICAgIHZhciByaWdodCA9IGFjdGlvbi5zcGxpdCgnLycpO1xuICAgIHZhciBscGFydCwgcnBhcnQ7XG4gICAgd2hpbGUgKGxlZnQubGVuZ3RoKSB7XG4gICAgICBscGFydCA9IGxlZnQuc2hpZnQoKTtcbiAgICAgIHJwYXJ0ID0gcmlnaHQuc2hpZnQoKTtcbiAgICAgIGlmIChscGFydCAhPT0gJz8nICYmIGxwYXJ0ICE9PSBycGFydCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9jb250cmEuZW1pdHRlci5qcycpO1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbihmdW5jdGlvbiAocm9vdCwgdW5kZWZpbmVkKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgdW5kZWYgPSAnJyArIHVuZGVmaW5lZDtcbiAgZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiAgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHsgaWYgKCFmbikgeyByZXR1cm47IH0gdGljayhmdW5jdGlvbiBydW4gKCkgeyBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7IH0pOyB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gdGlja2VyXG4gIHZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG4gIGlmIChzaSkge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gdW5kZWYgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgIHRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICB9IGVsc2Uge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG4gIH1cblxuICBmdW5jdGlvbiBfZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2dCA9IHt9O1xuICAgIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGMgPT09IDEpIHtcbiAgICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgICBldnQgPSB7fTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgY3R4ID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIHR5cGUgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0KSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldnRbdHlwZV0gPSBldC5maWx0ZXIoZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgcmV0dXJuICFsaXN0ZW4uX29uY2U7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IF9lbWl0dGVyO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gcm9vdC5jb250cmEgfHwge307XG4gICAgcm9vdC5jb250cmEuZW1pdHRlciA9IF9lbWl0dGVyO1xuICB9XG59KSh0aGlzKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIlwidXNlIHN0cmljdFwiO1xuLypcbkNvcHlyaWdodCAoYykgMjAxNCBQZXRrYSBBbnRvbm92XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuICBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG4qL1xuZnVuY3Rpb24gVXJsKCkge1xuICAgIC8vRm9yIG1vcmUgZWZmaWNpZW50IGludGVybmFsIHJlcHJlc2VudGF0aW9uIGFuZCBsYXppbmVzcy5cbiAgICAvL1RoZSBub24tdW5kZXJzY29yZSB2ZXJzaW9ucyBvZiB0aGVzZSBwcm9wZXJ0aWVzIGFyZSBhY2Nlc3NvciBmdW5jdGlvbnNcbiAgICAvL2RlZmluZWQgb24gdGhlIHByb3RvdHlwZS5cbiAgICB0aGlzLl9wcm90b2NvbCA9IG51bGw7XG4gICAgdGhpcy5faHJlZiA9IFwiXCI7XG4gICAgdGhpcy5fcG9ydCA9IC0xO1xuICAgIHRoaXMuX3F1ZXJ5ID0gbnVsbDtcblxuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICB0aGlzLmhvc3QgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuXG4gICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gZmFsc2U7XG59XG5cbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoXCJxdWVyeXN0cmluZ1wiKTtcblVybC5wcm90b3R5cGUucGFyc2UgPVxuZnVuY3Rpb24gVXJsJHBhcnNlKHN0ciwgcGFyc2VRdWVyeVN0cmluZywgaG9zdERlbm90ZXNTbGFzaCkge1xuICAgIGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICtcbiAgICAgICAgICAgIHR5cGVvZiBzdHIpO1xuICAgIH1cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSBzdHIubGVuZ3RoIC0gMTtcblxuICAgIC8vVHJpbSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3c1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChzdGFydCkgPD0gMHgyMCAvKicgJyovKSBzdGFydCsrO1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChlbmQpIDw9IDB4MjAgLyonICcqLykgZW5kLS07XG5cbiAgICBzdGFydCA9IHRoaXMuX3BhcnNlUHJvdG9jb2woc3RyLCBzdGFydCwgZW5kKTtcblxuICAgIC8vSmF2YXNjcmlwdCBkb2Vzbid0IGhhdmUgaG9zdFxuICAgIGlmICh0aGlzLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgc3RhcnQgPSB0aGlzLl9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBob3N0RGVub3Rlc1NsYXNoKTtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICAgICAgKHRoaXMuc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoUHJvdG9jb2xzW3Byb3RvXSkpKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFydCA8PSBlbmQpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHsgLy9Gb3IgamF2YXNjcmlwdCB0aGUgcGF0aG5hbWUgaXMganVzdCB0aGUgcmVzdCBvZiBpdFxuICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGF0aG5hbWUgJiYgdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICB0aGlzLl9zbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF0pIHtcbiAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgIH1cblxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICAgICAgaWYgKHNlYXJjaCA9PSBudWxsKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSB0aGlzLnNlYXJjaCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgICAvL1RoaXMgY2FsbHMgYSBzZXR0ZXIgZnVuY3Rpb24sIHRoZXJlIGlzIG5vIC5xdWVyeSBkYXRhIHByb3BlcnR5XG4gICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZShzZWFyY2gpO1xuICAgIH1cbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlKHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdChVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRmb3JtYXQoKSB7XG4gICAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgXCJcIjtcblxuICAgIGlmIChhdXRoKSB7XG4gICAgICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCBcIjpcIik7XG4gICAgICAgIGF1dGggKz0gXCJAXCI7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCBcIlwiO1xuICAgIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCBcIlwiO1xuICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgIHZhciBxdWVyeSA9IFwiXCI7XG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0IHx8IFwiXCI7XG4gICAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgICB2YXIgc2NoZW1lID0gXCJcIjtcblxuICAgIC8vQ2FjaGUgdGhlIHJlc3VsdCBvZiB0aGUgZ2V0dGVyIGZ1bmN0aW9uXG4gICAgdmFyIHEgPSB0aGlzLnF1ZXJ5O1xuICAgIGlmIChxICYmIHR5cGVvZiBxID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHEpO1xuICAgIH1cblxuICAgIGlmICghc2VhcmNoKSB7XG4gICAgICAgIHNlYXJjaCA9IHF1ZXJ5ID8gXCI/XCIgKyBxdWVyeSA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDB4M0EgLyonOicqLylcbiAgICAgICAgcHJvdG9jb2wgKz0gXCI6XCI7XG5cbiAgICBpZiAodGhpcy5ob3N0KSB7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICAgIH1cbiAgICBlbHNlIGlmIChob3N0bmFtZSkge1xuICAgICAgICB2YXIgaXA2ID0gaG9zdG5hbWUuaW5kZXhPZihcIjpcIikgPiAtMTtcbiAgICAgICAgaWYgKGlwNikgaG9zdG5hbWUgPSBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgaG9zdG5hbWUgKyAocG9ydCA/IFwiOlwiICsgcG9ydCA6IFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBzbGFzaGVzID0gdGhpcy5zbGFzaGVzIHx8XG4gICAgICAgICgoIXByb3RvY29sIHx8XG4gICAgICAgIHNsYXNoUHJvdG9jb2xzW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpO1xuXG5cbiAgICBpZiAocHJvdG9jb2wpIHNjaGVtZSA9IHByb3RvY29sICsgKHNsYXNoZXMgPyBcIi8vXCIgOiBcIlwiKTtcbiAgICBlbHNlIGlmIChzbGFzaGVzKSBzY2hlbWUgPSBcIi8vXCI7XG5cbiAgICBpZiAoc2xhc2hlcyAmJiBwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIi9cIiArIHBhdGhuYW1lO1xuICAgIH1cbiAgICBlbHNlIGlmICghc2xhc2hlcyAmJiBwYXRobmFtZSA9PT0gXCIvXCIpIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSAweDNGIC8qJz8nKi8pXG4gICAgICAgIHNlYXJjaCA9IFwiP1wiICsgc2VhcmNoO1xuICAgIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMHgyMyAvKicjJyovKVxuICAgICAgICBoYXNoID0gXCIjXCIgKyBoYXNoO1xuXG4gICAgcGF0aG5hbWUgPSBlc2NhcGVQYXRoTmFtZShwYXRobmFtZSk7XG4gICAgc2VhcmNoID0gZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG5cbiAgICByZXR1cm4gc2NoZW1lICsgKGhvc3QgPT09IGZhbHNlID8gXCJcIiA6IGhvc3QpICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJHJlc29sdmVPYmplY3QocmVsYXRpdmUpIHtcbiAgICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZWxhdGl2ZSA9IFVybC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMuX2Nsb25lKCk7XG5cbiAgICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlXCJzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICAgIGlmICghcmVsYXRpdmUuaHJlZikge1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICAgIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5fcHJvdG9jb2wpIHtcbiAgICAgICAgcmVsYXRpdmUuX2NvcHlQcm9wc1RvKHJlc3VsdCwgdHJ1ZSk7XG5cbiAgICAgICAgaWYgKHNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdICYmXG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gcmVzdWx0Ll9wcm90b2NvbCkge1xuICAgICAgICAvLyBpZiBpdFwicyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgICAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAgICAgLy8gZmlyc3QsIGlmIGl0XCJzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgICAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgICAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGJlY2F1c2UgdGhhdFwicyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAgICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgICAgICBpZiAoIXNsYXNoUHJvdG9jb2xzW3JlbGF0aXZlLl9wcm90b2NvbF0pIHtcbiAgICAgICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIGZhbHNlKTtcbiAgICAgICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Ll9wcm90b2NvbCA9IHJlbGF0aXZlLl9wcm90b2NvbDtcbiAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0ICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8IFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAocmVsUGF0aFswXSAhPT0gXCJcIikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKFwiL1wiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IFwiXCI7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgcmVzdWx0Ll9wb3J0ID0gcmVsYXRpdmUuX3BvcnQ7XG4gICAgICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICB2YXIgaXNTb3VyY2VBYnMgPVxuICAgICAgICAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pO1xuICAgIHZhciBpc1JlbEFicyA9IChcbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICAgIChyZWxhdGl2ZS5wYXRobmFtZSAmJlxuICAgICAgICAgICAgcmVsYXRpdmUucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKVxuICAgICAgICApO1xuICAgIHZhciBtdXN0RW5kQWJzID0gKGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKTtcblxuICAgIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcblxuICAgIHZhciBzcmNQYXRoID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5fcHJvdG9jb2wgJiYgIXNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdO1xuXG4gICAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAgIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gICAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IC0xO1xuICAgICAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgICAgICAgIGlmIChzcmNQYXRoWzBdID09PSBcIlwiKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICAgICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Lmhvc3QgPSBcIlwiO1xuICAgICAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICByZWxhdGl2ZS5fcG9ydCA9IC0xO1xuICAgICAgICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gXCJcIikgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgICAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gXCJcIiB8fCBzcmNQYXRoWzBdID09PSBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaXNSZWxBYnMpIHtcbiAgICAgICAgLy8gaXRcInMgYWJzb2x1dGUuXG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lID9cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAgICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gICAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgICAgICAvLyBpdFwicyByZWxhdGl2ZVxuICAgICAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICAgICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgICAgIHNyY1BhdGgucG9wKCk7XG4gICAgICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCkge1xuICAgICAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgICAgIC8vIGxpa2UgaHJlZj1cIj9mb29cIi5cbiAgICAgICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoXCJtYWlsdG86bG9jYWwxQGRvbWFpbjFcIiwgXCJsb2NhbDJAZG9tYWluMlwiKVxuICAgICAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgICAgICAvLyB3ZVwidmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gICAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAgIChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gXCIuXCIgfHwgbGFzdCA9PT0gXCIuLlwiKSB8fFxuICAgICAgICBsYXN0ID09PSBcIlwiKTtcblxuICAgIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICAgIHZhciB1cCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgICAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICAgICAgaWYgKGxhc3QgPT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICB9IGVsc2UgaWYgKGxhc3QgPT09IFwiLi5cIikge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cCsrO1xuICAgICAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHVwLS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gICAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiLi5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSBcIlwiICYmXG4gICAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgIT09IDB4MkYgLyonLycqLykpIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oXCIvXCIpLnN1YnN0cigtMSkgIT09IFwiL1wiKSkge1xuICAgICAgICBzcmNQYXRoLnB1c2goXCJcIik7XG4gICAgfVxuXG4gICAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSBcIlwiIHx8XG4gICAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcblxuICAgIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IGlzQWJzb2x1dGUgPyBcIlwiIDpcbiAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogXCJcIjtcbiAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpIDogZmFsc2U7XG4gICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICAgIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmxlbmd0aCA9PT0gMCA/IG51bGwgOiBzcmNQYXRoLmpvaW4oXCIvXCIpO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIHB1bnljb2RlID0gcmVxdWlyZShcInB1bnljb2RlXCIpO1xuVXJsLnByb3RvdHlwZS5faG9zdElkbmEgPSBmdW5jdGlvbiBVcmwkX2hvc3RJZG5hKGhvc3RuYW1lKSB7XG4gICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgIHZhciBkb21haW5BcnJheSA9IGhvc3RuYW1lLnNwbGl0KFwiLlwiKTtcbiAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgIFwieG4tLVwiICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgfVxuICAgIHJldHVybiBuZXdPdXQuam9pbihcIi5cIik7XG59O1xuXG52YXIgZXNjYXBlUGF0aE5hbWUgPSBVcmwucHJvdG90eXBlLl9lc2NhcGVQYXRoTmFtZSA9XG5mdW5jdGlvbiBVcmwkX2VzY2FwZVBhdGhOYW1lKHBhdGhuYW1lKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIocGF0aG5hbWUsIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovKSkge1xuICAgICAgICByZXR1cm4gcGF0aG5hbWU7XG4gICAgfVxuICAgIC8vQXZvaWQgY2xvc3VyZSBjcmVhdGlvbiB0byBrZWVwIHRoaXMgaW5saW5hYmxlXG4gICAgcmV0dXJuIF9lc2NhcGVQYXRoKHBhdGhuYW1lKTtcbn07XG5cbnZhciBlc2NhcGVTZWFyY2ggPSBVcmwucHJvdG90eXBlLl9lc2NhcGVTZWFyY2ggPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIoc2VhcmNoLCAweDIzIC8qJyMnKi8sIC0xKSkgcmV0dXJuIHNlYXJjaDtcbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVByb3RvY29sID0gZnVuY3Rpb24gVXJsJF9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBwcm90b2NvbENoYXJhY3RlcnMgPSB0aGlzLl9wcm90b2NvbENoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgIHZhciBwcm90b2NvbCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICBpZiAoZG9Mb3dlckNhc2UpIHByb3RvY29sID0gcHJvdG9jb2wudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJvdG9jb2xDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGNoIDwgMHg2MSAvKidhJyovKVxuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlQXV0aCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VBdXRoKHN0ciwgc3RhcnQsIGVuZCwgZGVjb2RlKSB7XG4gICAgdmFyIGF1dGggPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEpO1xuICAgIGlmIChkZWNvZGUpIHtcbiAgICAgICAgYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG4gICAgdGhpcy5hdXRoID0gYXV0aDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUG9ydCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQb3J0KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIC8vSW50ZXJuYWwgZm9ybWF0IGlzIGludGVnZXIgZm9yIG1vcmUgZWZmaWNpZW50IHBhcnNpbmdcbiAgICAvL2FuZCBmb3IgZWZmaWNpZW50IHRyaW1taW5nIG9mIGxlYWRpbmcgemVyb3NcbiAgICB2YXIgcG9ydCA9IDA7XG4gICAgLy9EaXN0aW5ndWlzaCBiZXR3ZWVuIDowIGFuZCA6IChubyBwb3J0IG51bWJlciBhdCBhbGwpXG4gICAgdmFyIGhhZENoYXJzID0gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pIHtcbiAgICAgICAgICAgIHBvcnQgPSAoMTAgKiBwb3J0KSArIChjaCAtIDB4MzAgLyonMCcqLyk7XG4gICAgICAgICAgICBoYWRDaGFycyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBicmVhaztcblxuICAgIH1cbiAgICBpZiAocG9ydCA9PT0gMCAmJiAhaGFkQ2hhcnMpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgdGhpcy5fcG9ydCA9IHBvcnQ7XG4gICAgcmV0dXJuIGkgLSBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSG9zdCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlSG9zdChzdHIsIHN0YXJ0LCBlbmQsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgdmFyIGhvc3RFbmRpbmdDaGFyYWN0ZXJzID0gdGhpcy5faG9zdEVuZGluZ0NoYXJhY3RlcnM7XG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHgyRiAvKicvJyovICYmXG4gICAgICAgIHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgMSkgPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuXG4gICAgICAgIC8vVGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHtcbiAgICAgICAgICAgIC8vVGhlIHN0cmluZyBpcyBqdXN0IFwiLy9cIlxuICAgICAgICAgICAgaWYgKGVuZCA8IDIpIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIC8vSWYgc2xhc2hlcyBkbyBub3QgZGVub3RlIGhvc3QgYW5kIHRoZXJlIGlzIG5vIGF1dGgsXG4gICAgICAgICAgICAvL3RoZXJlIGlzIG5vIGhvc3Qgd2hlbiB0aGUgc3RyaW5nIHN0YXJ0cyB3aXRoIC8vXG4gICAgICAgICAgICB2YXIgaGFzQXV0aCA9XG4gICAgICAgICAgICAgICAgY29udGFpbnNDaGFyYWN0ZXIoc3RyLCAweDQwIC8qJ0AnKi8sIDIsIGhvc3RFbmRpbmdDaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIGlmICghaGFzQXV0aCAmJiAhc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL1RoZXJlIGlzIGEgaG9zdCB0aGF0IHN0YXJ0cyBhZnRlciB0aGUgLy9cbiAgICAgICAgc3RhcnQgKz0gMjtcbiAgICB9XG4gICAgLy9JZiB0aGVyZSBpcyBubyBzbGFzaGVzLCB0aGVyZSBpcyBubyBob3N0bmFtZSBpZlxuICAgIC8vMS4gdGhlcmUgd2FzIG5vIHByb3RvY29sIGF0IGFsbFxuICAgIGVsc2UgaWYgKCF0aGlzLl9wcm90b2NvbCB8fFxuICAgICAgICAvLzIuIHRoZXJlIHdhcyBhIHByb3RvY29sIHRoYXQgcmVxdWlyZXMgc2xhc2hlc1xuICAgICAgICAvL2UuZy4gaW4gJ2h0dHA6YXNkJyAnYXNkJyBpcyBub3QgYSBob3N0bmFtZVxuICAgICAgICBzbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF1cbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBpZG5hID0gZmFsc2U7XG4gICAgdmFyIGhvc3ROYW1lU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgaG9zdE5hbWVFbmQgPSBlbmQ7XG4gICAgdmFyIGxhc3RDaCA9IC0xO1xuICAgIHZhciBwb3J0TGVuZ3RoID0gMDtcbiAgICB2YXIgY2hhcnNBZnRlckRvdCA9IDA7XG4gICAgdmFyIGF1dGhOZWVkc0RlY29kaW5nID0gZmFsc2U7XG5cbiAgICB2YXIgaiA9IC0xO1xuXG4gICAgLy9GaW5kIHRoZSBsYXN0IG9jY3VycmVuY2Ugb2YgYW4gQC1zaWduIHVudGlsIGhvc3RlbmRpbmcgY2hhcmFjdGVyIGlzIG1ldFxuICAgIC8vYWxzbyBtYXJrIGlmIGRlY29kaW5nIGlzIG5lZWRlZCBmb3IgdGhlIGF1dGggcG9ydGlvblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4NDAgLyonQCcqLykge1xuICAgICAgICAgICAgaiA9IGk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNoZWNrIGlzIHZlcnksIHZlcnkgY2hlYXAuIFVubmVlZGVkIGRlY29kZVVSSUNvbXBvbmVudCBpcyB2ZXJ5XG4gICAgICAgIC8vdmVyeSBleHBlbnNpdmVcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjUgLyonJScqLykge1xuICAgICAgICAgICAgYXV0aE5lZWRzRGVjb2RpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhvc3RFbmRpbmdDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvL0Atc2lnbiB3YXMgZm91bmQgYXQgaW5kZXggaiwgZXZlcnl0aGluZyB0byB0aGUgbGVmdCBmcm9tIGl0XG4gICAgLy9pcyBhdXRoIHBhcnRcbiAgICBpZiAoaiA+IC0xKSB7XG4gICAgICAgIHRoaXMuX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBqIC0gMSwgYXV0aE5lZWRzRGVjb2RpbmcpO1xuICAgICAgICAvL2hvc3RuYW1lIHN0YXJ0cyBhZnRlciB0aGUgbGFzdCBALXNpZ25cbiAgICAgICAgc3RhcnQgPSBob3N0TmFtZVN0YXJ0ID0gaiArIDE7XG4gICAgfVxuXG4gICAgLy9Ib3N0IG5hbWUgaXMgc3RhcnRpbmcgd2l0aCBhIFtcbiAgICBpZiAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpID09PSAweDVCIC8qJ1snKi8pIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0ICsgMTsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgICAgIC8vQXNzdW1lIHZhbGlkIElQNiBpcyBiZXR3ZWVuIHRoZSBicmFja2V0c1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDVEIC8qJ10nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAyLCBlbmQpICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKHN0YXJ0ICsgMSwgaSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBcIltcIiArIGhvc3RuYW1lICsgXCJdOlwiICsgdGhpcy5fcG9ydFxuICAgICAgICAgICAgICAgICAgICA6IFwiW1wiICsgaG9zdG5hbWUgKyBcIl1cIjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGkgKyBwb3J0TGVuZ3RoICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL0VtcHR5IGhvc3RuYW1lLCBbIHN0YXJ0cyBhIHBhdGhcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICBpZiAoY2hhcnNBZnRlckRvdCA+IDYyKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gc3RyLnNsaWNlKHN0YXJ0LCBpKTtcbiAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICBwb3J0TGVuZ3RoID0gdGhpcy5fcGFyc2VQb3J0KHN0ciwgaSArIDEsIGVuZCkgKyAxO1xuICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoIDwgMHg2MSAvKidhJyovKSB7XG4gICAgICAgICAgICBpZiAoY2ggPT09IDB4MkUgLyonLicqLykge1xuICAgICAgICAgICAgICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGlmIChsYXN0Q2ggPT09IERPVCB8fCBsYXN0Q2ggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2hhcnNBZnRlckRvdCA9IC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoMHg0MSAvKidBJyovIDw9IGNoICYmIGNoIDw9IDB4NUEgLyonWicqLykge1xuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCEoY2ggPT09IDB4MkQgLyonLScqLyB8fCBjaCA9PT0gMHg1RiAvKidfJyovIHx8XG4gICAgICAgICAgICAgICAgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pKSkge1xuICAgICAgICAgICAgICAgIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDAgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID49IDB4N0IgLyoneycqLykge1xuICAgICAgICAgICAgaWYgKGNoIDw9IDB4N0UgLyonficqLykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnNbY2hdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZG5hID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0Q2ggPSBjaDtcbiAgICAgICAgY2hhcnNBZnRlckRvdCsrO1xuICAgIH1cblxuICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAvKlxuICAgIGlmIChsYXN0Q2ggPT09IERPVCkge1xuICAgICAgICBob3N0TmFtZUVuZC0tO1xuICAgIH1cbiAgICAqL1xuXG4gICAgaWYgKGhvc3ROYW1lRW5kICsgMSAhPT0gc3RhcnQgJiZcbiAgICAgICAgaG9zdE5hbWVFbmQgLSBob3N0TmFtZVN0YXJ0IDw9IDI1Nikge1xuICAgICAgICB2YXIgaG9zdG5hbWUgPSBzdHIuc2xpY2UoaG9zdE5hbWVTdGFydCwgaG9zdE5hbWVFbmQgKyAxKTtcbiAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBob3N0bmFtZSA9IGhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChpZG5hKSBob3N0bmFtZSA9IHRoaXMuX2hvc3RJZG5hKGhvc3RuYW1lKTtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICB0aGlzLmhvc3QgPSB0aGlzLl9wb3J0ID4gMCA/IGhvc3RuYW1lICsgXCI6XCIgKyB0aGlzLl9wb3J0IDogaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhvc3ROYW1lRW5kICsgMSArIHBvcnRMZW5ndGg7XG5cbn07XG5cblVybC5wcm90b3R5cGUuX2NvcHlQcm9wc1RvID0gZnVuY3Rpb24gVXJsJF9jb3B5UHJvcHNUbyhpbnB1dCwgbm9Qcm90b2NvbCkge1xuICAgIGlmICghbm9Qcm90b2NvbCkge1xuICAgICAgICBpbnB1dC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICB9XG4gICAgaW5wdXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIGlucHV0Ll9wb3J0ID0gdGhpcy5fcG9ydDtcbiAgICBpbnB1dC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIGlucHV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgaW5wdXQuc2xhc2hlcyA9IHRoaXMuc2xhc2hlcztcbiAgICBpbnB1dC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIGlucHV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICBpbnB1dC5oYXNoID0gdGhpcy5oYXNoO1xuICAgIGlucHV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIGlucHV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbn07XG5cblVybC5wcm90b3R5cGUuX2Nsb25lID0gZnVuY3Rpb24gVXJsJF9jbG9uZSgpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICByZXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIHJldC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgcmV0Ll9wcmVwZW5kU2xhc2ggPSB0aGlzLl9wcmVwZW5kU2xhc2g7XG4gICAgcmV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgcmV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgcmV0Lmhvc3QgPSB0aGlzLmhvc3Q7XG4gICAgcmV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICByZXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICByZXQuc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgcmV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fZ2V0Q29tcG9uZW50RXNjYXBlZCA9XG5mdW5jdGlvbiBVcmwkX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIGN1ciA9IHN0YXJ0O1xuICAgIHZhciBpID0gc3RhcnQ7XG4gICAgdmFyIHJldCA9IFwiXCI7XG4gICAgdmFyIGF1dG9Fc2NhcGVNYXAgPSB0aGlzLl9hdXRvRXNjYXBlTWFwO1xuICAgIGZvciAoOyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB2YXIgZXNjYXBlZCA9IGF1dG9Fc2NhcGVNYXBbY2hdO1xuXG4gICAgICAgIGlmIChlc2NhcGVkICE9PSBcIlwiKSB7XG4gICAgICAgICAgICBpZiAoY3VyIDwgaSkgcmV0ICs9IHN0ci5zbGljZShjdXIsIGkpO1xuICAgICAgICAgICAgcmV0ICs9IGVzY2FwZWQ7XG4gICAgICAgICAgICBjdXIgPSBpICsgMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VyIDwgaSArIDEpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQYXRoID1cbmZ1bmN0aW9uIFVybCRfcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBwYXRoU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgcGF0aEVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBwYXRoRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXRoU3RhcnQgPiBwYXRoRW5kKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwYXRoO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcGF0aCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBwYXRoU3RhcnQsIHBhdGhFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcGF0aCA9IHN0ci5zbGljZShwYXRoU3RhcnQsIHBhdGhFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5wYXRobmFtZSA9IHRoaXMuX3ByZXBlbmRTbGFzaCA/IFwiL1wiICsgcGF0aCA6IHBhdGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVF1ZXJ5ID0gZnVuY3Rpb24gVXJsJF9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBxdWVyeVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHF1ZXJ5RW5kID0gZW5kO1xuICAgIHZhciBlc2NhcGUgPSBmYWxzZTtcbiAgICB2YXIgYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSB0aGlzLl9hdXRvRXNjYXBlQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHF1ZXJ5RW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChxdWVyeVN0YXJ0ID4gcXVlcnlFbmQpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5O1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcXVlcnkgPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcXVlcnlTdGFydCwgcXVlcnlFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSBzdHIuc2xpY2UocXVlcnlTdGFydCwgcXVlcnlFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5zZWFyY2ggPSBxdWVyeTtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSGFzaCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIGlmIChzdGFydCA+IGVuZCkge1xuICAgICAgICB0aGlzLmhhc2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaGFzaCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInBvcnRcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wb3J0ID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiAoXCJcIiArIHRoaXMuX3BvcnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSBwYXJzZUludCh2LCAxMCk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicXVlcnlcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5O1xuICAgICAgICBpZiAocXVlcnkgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcblxuICAgICAgICBpZiAoc2VhcmNoKSB7XG4gICAgICAgICAgICBpZiAoc2VhcmNoLmNoYXJDb2RlQXQoMCkgPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzZWFyY2ggIT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHNlYXJjaDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWFyY2g7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5fcXVlcnkgPSB2O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwYXRoXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgICAgICBpZiAocCB8fCBzKSB7XG4gICAgICAgICAgICByZXR1cm4gcCArIHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChwID09IG51bGwgJiYgcykgPyAoXCIvXCIgKyBzKSA6IG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKCkge31cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwcm90b2NvbFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIHJldHVybiBwcm90byA/IHByb3RvICsgXCI6XCIgOiBwcm90bztcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBlbmQgPSB2Lmxlbmd0aCAtIDE7XG4gICAgICAgICAgICBpZiAodi5jaGFyQ29kZUF0KGVuZCkgPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdi5zbGljZSgwLCBlbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSB2O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcImhyZWZcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBocmVmID0gdGhpcy5faHJlZjtcbiAgICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgICAgICBocmVmID0gdGhpcy5faHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhyZWY7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5faHJlZiA9IHY7XG4gICAgfVxufSk7XG5cblVybC5wYXJzZSA9IGZ1bmN0aW9uIFVybCRQYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAoc3RyIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gc3RyO1xuICAgIHZhciByZXQgPSBuZXcgVXJsKCk7XG4gICAgcmV0LnBhcnNlKHN0ciwgISFwYXJzZVF1ZXJ5U3RyaW5nLCAhIWhvc3REZW5vdGVzU2xhc2gpO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwuZm9ybWF0ID0gZnVuY3Rpb24gVXJsJEZvcm1hdChvYmopIHtcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvYmogPSBVcmwucGFyc2Uob2JqKTtcbiAgICB9XG4gICAgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkge1xuICAgICAgICByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufTtcblxuVXJsLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn07XG5cblVybC5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIGlmICghc291cmNlKSByZXR1cm4gcmVsYXRpdmU7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlT2JqZWN0KHJlbGF0aXZlKTtcbn07XG5cbmZ1bmN0aW9uIF9lc2NhcGVQYXRoKHBhdGhuYW1lKSB7XG4gICAgcmV0dXJuIHBhdGhuYW1lLnJlcGxhY2UoL1s/I10vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgcmV0dXJuIHNlYXJjaC5yZXBsYWNlKC8jL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG4vL1NlYXJjaCBgY2hhcjFgIChpbnRlZ2VyIGNvZGUgZm9yIGEgY2hhcmFjdGVyKSBpbiBgc3RyaW5nYFxuLy9zdGFydGluZyBmcm9tIGBmcm9tSW5kZXhgIGFuZCBlbmRpbmcgYXQgYHN0cmluZy5sZW5ndGggLSAxYFxuLy9vciB3aGVuIGEgc3RvcCBjaGFyYWN0ZXIgaXMgZm91bmRcbmZ1bmN0aW9uIGNvbnRhaW5zQ2hhcmFjdGVyKHN0cmluZywgY2hhcjEsIGZyb21JbmRleCwgc3RvcENoYXJhY3RlclRhYmxlKSB7XG4gICAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IGZyb21JbmRleDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gY2hhcjEpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHN0b3BDaGFyYWN0ZXJUYWJsZVtjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vU2VlIGlmIGBjaGFyMWAgb3IgYGNoYXIyYCAoaW50ZWdlciBjb2RlcyBmb3IgY2hhcmFjdGVycylcbi8vaXMgY29udGFpbmVkIGluIGBzdHJpbmdgXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcjIoc3RyaW5nLCBjaGFyMSwgY2hhcjIpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IGNoYXIxIHx8IGNoID09PSBjaGFyMikgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy9NYWtlcyBhbiBhcnJheSBvZiAxMjggdWludDgncyB3aGljaCByZXByZXNlbnQgYm9vbGVhbiB2YWx1ZXMuXG4vL1NwZWMgaXMgYW4gYXJyYXkgb2YgYXNjaWkgY29kZSBwb2ludHMgb3IgYXNjaWkgY29kZSBwb2ludCByYW5nZXNcbi8vcmFuZ2VzIGFyZSBleHByZXNzZWQgYXMgW3N0YXJ0LCBlbmRdXG5cbi8vQ3JlYXRlIGEgdGFibGUgd2l0aCB0aGUgY2hhcmFjdGVycyAweDMwLTB4MzkgKGRlY2ltYWxzICcwJyAtICc5JykgYW5kXG4vLzB4N0EgKGxvd2VyY2FzZWxldHRlciAneicpIGFzIGB0cnVlYDpcbi8vXG4vL3ZhciBhID0gbWFrZUFzY2lpVGFibGUoW1sweDMwLCAweDM5XSwgMHg3QV0pO1xuLy9hWzB4MzBdOyAvLzFcbi8vYVsweDE1XTsgLy8wXG4vL2FbMHgzNV07IC8vMVxuZnVuY3Rpb24gbWFrZUFzY2lpVGFibGUoc3BlYykge1xuICAgIHZhciByZXQgPSBuZXcgVWludDhBcnJheSgxMjgpO1xuICAgIHNwZWMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICByZXRbaXRlbV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gaXRlbVswXTtcbiAgICAgICAgICAgIHZhciBlbmQgPSBpdGVtWzFdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0OyBqIDw9IGVuZDsgKytqKSB7XG4gICAgICAgICAgICAgICAgcmV0W2pdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJldDtcbn1cblxuXG52YXIgYXV0b0VzY2FwZSA9IFtcIjxcIiwgXCI+XCIsIFwiXFxcIlwiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsIFwiXFxuXCIsXG4gICAgXCJcXHRcIiwgXCJ7XCIsIFwifVwiLCBcInxcIiwgXCJcXFxcXCIsIFwiXlwiLCBcImBcIiwgXCInXCJdO1xuXG52YXIgYXV0b0VzY2FwZU1hcCA9IG5ldyBBcnJheSgxMjgpO1xuXG5cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGVNYXAubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBhdXRvRXNjYXBlTWFwW2ldID0gXCJcIjtcbn1cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgYyA9IGF1dG9Fc2NhcGVbaV07XG4gICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChjKTtcbiAgICBpZiAoZXNjID09PSBjKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShjKTtcbiAgICB9XG4gICAgYXV0b0VzY2FwZU1hcFtjLmNoYXJDb2RlQXQoMCldID0gZXNjO1xufVxuXG5cbnZhciBzbGFzaFByb3RvY29scyA9IFVybC5wcm90b3R5cGUuX3NsYXNoUHJvdG9jb2xzID0ge1xuICAgIGh0dHA6IHRydWUsXG4gICAgaHR0cHM6IHRydWUsXG4gICAgZ29waGVyOiB0cnVlLFxuICAgIGZpbGU6IHRydWUsXG4gICAgZnRwOiB0cnVlLFxuXG4gICAgXCJodHRwOlwiOiB0cnVlLFxuICAgIFwiaHR0cHM6XCI6IHRydWUsXG4gICAgXCJnb3BoZXI6XCI6IHRydWUsXG4gICAgXCJmaWxlOlwiOiB0cnVlLFxuICAgIFwiZnRwOlwiOiB0cnVlXG59O1xuXG4vL09wdGltaXplIGJhY2sgZnJvbSBub3JtYWxpemVkIG9iamVjdCBjYXVzZWQgYnkgbm9uLWlkZW50aWZpZXIga2V5c1xuZnVuY3Rpb24gZigpe31cbmYucHJvdG90eXBlID0gc2xhc2hQcm90b2NvbHM7XG5cblVybC5wcm90b3R5cGUuX3Byb3RvY29sQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICBbMHg2MSAvKidhJyovLCAweDdBIC8qJ3onKi9dLFxuICAgIFsweDQxIC8qJ0EnKi8sIDB4NUEgLyonWicqL10sXG4gICAgMHgyRSAvKicuJyovLCAweDJCIC8qJysnKi8sIDB4MkQgLyonLScqL1xuXSk7XG5cblVybC5wcm90b3R5cGUuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoW1xuICAgIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovLCAweDJGIC8qJy8nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIGF1dG9Fc2NhcGUubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgcmV0dXJuIHYuY2hhckNvZGVBdCgwKTtcbiAgICB9KVxuKTtcblxuLy9JZiB0aGVzZSBjaGFyYWN0ZXJzIGVuZCBhIGhvc3QgbmFtZSwgdGhlIHBhdGggd2lsbCBub3QgYmUgcHJlcGVuZGVkIGEgL1xuVXJsLnByb3RvdHlwZS5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzID0gbWFrZUFzY2lpVGFibGUoXG4gICAgW1xuICAgICAgICBcIjxcIiwgXCI+XCIsIFwiJ1wiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsXG4gICAgICAgIFwiXFxuXCIsIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLFxuICAgICAgICBcIl5cIiwgXCJgXCIsIFwiXFxcIlwiLCBcIiVcIiwgXCI7XCJcbiAgICBdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cblVybC5wcm90b3R5cGUuX2F1dG9Fc2NhcGVNYXAgPSBhdXRvRXNjYXBlTWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVybDtcblxuVXJsLnJlcGxhY2UgPSBmdW5jdGlvbiBVcmwkUmVwbGFjZSgpIHtcbiAgICByZXF1aXJlLmNhY2hlW1widXJsXCJdID0ge1xuICAgICAgICBleHBvcnRzOiBVcmxcbiAgICB9O1xufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbiFmdW5jdGlvbihlKXtpZihcIm9iamVjdFwiPT10eXBlb2YgZXhwb3J0cyltb2R1bGUuZXhwb3J0cz1lKCk7ZWxzZSBpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQpZGVmaW5lKGUpO2Vsc2V7dmFyIGY7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdz9mPXdpbmRvdzpcInVuZGVmaW5lZFwiIT10eXBlb2YgZ2xvYmFsP2Y9Z2xvYmFsOlwidW5kZWZpbmVkXCIhPXR5cGVvZiBzZWxmJiYoZj1zZWxmKSxmLnJvdXRlcz1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblxudmFyIGxvY2FsUm91dGVzID0gW107XG5cblxuLyoqXG4gKiBDb252ZXJ0IHBhdGggdG8gcm91dGUgb2JqZWN0XG4gKlxuICogQSBzdHJpbmcgb3IgUmVnRXhwIHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aWxsIHJldHVybiB7IHJlLCBzcmMsIGtleXN9IG9ialxuICpcbiAqIEBwYXJhbSAge1N0cmluZyAvIFJlZ0V4cH0gcGF0aFxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZSA9IGZ1bmN0aW9uKHBhdGgpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG5cbiAgdmFyIHNyYywgcmUsIGtleXMgPSBbXTtcblxuICBpZihwYXRoIGluc3RhbmNlb2YgUmVnRXhwKXtcbiAgICByZSA9IHBhdGg7XG4gICAgc3JjID0gcGF0aC50b1N0cmluZygpO1xuICB9ZWxzZXtcbiAgICByZSA9IHBhdGhUb1JlZ0V4cChwYXRoLCBrZXlzKTtcbiAgICBzcmMgPSBwYXRoO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgXHQgcmU6IHJlLFxuICBcdCBzcmM6IHBhdGgudG9TdHJpbmcoKSxcbiAgXHQga2V5czoga2V5c1xuICB9XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSB0aGUgZ2l2ZW4gcGF0aCBzdHJpbmcsXG4gKiByZXR1cm5pbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKlxuICogQW4gZW1wdHkgYXJyYXkgc2hvdWxkIGJlIHBhc3NlZCxcbiAqIHdoaWNoIHdpbGwgY29udGFpbiB0aGUgcGxhY2Vob2xkZXJcbiAqIGtleSBuYW1lcy4gRm9yIGV4YW1wbGUgXCIvdXNlci86aWRcIiB3aWxsXG4gKiB0aGVuIGNvbnRhaW4gW1wiaWRcIl0uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBwYXRoXG4gKiBAcGFyYW0gIHtBcnJheX0ga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG52YXIgcGF0aFRvUmVnRXhwID0gZnVuY3Rpb24gKHBhdGgsIGtleXMpIHtcblx0cGF0aCA9IHBhdGhcblx0XHQuY29uY2F0KCcvPycpXG5cdFx0LnJlcGxhY2UoL1xcL1xcKC9nLCAnKD86LycpXG5cdFx0LnJlcGxhY2UoLyhcXC8pPyhcXC4pPzooXFx3KykoPzooXFwoLio/XFwpKSk/KFxcPyk/fFxcKi9nLCBmdW5jdGlvbihfLCBzbGFzaCwgZm9ybWF0LCBrZXksIGNhcHR1cmUsIG9wdGlvbmFsKXtcblx0XHRcdGlmIChfID09PSBcIipcIil7XG5cdFx0XHRcdGtleXMucHVzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4gXztcblx0XHRcdH1cblxuXHRcdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0XHRzbGFzaCA9IHNsYXNoIHx8ICcnO1xuXHRcdFx0cmV0dXJuICcnXG5cdFx0XHRcdCsgKG9wdGlvbmFsID8gJycgOiBzbGFzaClcblx0XHRcdFx0KyAnKD86J1xuXHRcdFx0XHQrIChvcHRpb25hbCA/IHNsYXNoIDogJycpXG5cdFx0XHRcdCsgKGZvcm1hdCB8fCAnJykgKyAoY2FwdHVyZSB8fCAnKFteL10rPyknKSArICcpJ1xuXHRcdFx0XHQrIChvcHRpb25hbCB8fCAnJyk7XG5cdFx0fSlcblx0XHQucmVwbGFjZSgvKFtcXC8uXSkvZywgJ1xcXFwkMScpXG5cdFx0LnJlcGxhY2UoL1xcKi9nLCAnKC4qKScpO1xuXHRyZXR1cm4gbmV3IFJlZ0V4cCgnXicgKyBwYXRoICsgJyQnLCAnaScpO1xufTtcblxuLyoqXG4gKiBBdHRlbXB0IHRvIG1hdGNoIHRoZSBnaXZlbiByZXF1ZXN0IHRvXG4gKiBvbmUgb2YgdGhlIHJvdXRlcy4gV2hlbiBzdWNjZXNzZnVsXG4gKiBhICB7Zm4sIHBhcmFtcywgc3BsYXRzfSBvYmogaXMgcmV0dXJuZWRcbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gcm91dGVzXG4gKiBAcGFyYW0gIHtTdHJpbmd9IHVyaVxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG52YXIgbWF0Y2ggPSBmdW5jdGlvbiAocm91dGVzLCB1cmksIHN0YXJ0QXQpIHtcblx0dmFyIGNhcHR1cmVzLCBpID0gc3RhcnRBdCB8fCAwO1xuXG5cdGZvciAodmFyIGxlbiA9IHJvdXRlcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuXHRcdHZhciByb3V0ZSA9IHJvdXRlc1tpXSxcblx0XHQgICAgcmUgPSByb3V0ZS5yZSxcblx0XHQgICAga2V5cyA9IHJvdXRlLmtleXMsXG5cdFx0ICAgIHNwbGF0cyA9IFtdLFxuXHRcdCAgICBwYXJhbXMgPSB7fTtcblxuXHRcdGlmIChjYXB0dXJlcyA9IHVyaS5tYXRjaChyZSkpIHtcblx0XHRcdGZvciAodmFyIGogPSAxLCBsZW4gPSBjYXB0dXJlcy5sZW5ndGg7IGogPCBsZW47ICsraikge1xuXHRcdFx0XHR2YXIga2V5ID0ga2V5c1tqLTFdLFxuXHRcdFx0XHRcdHZhbCA9IHR5cGVvZiBjYXB0dXJlc1tqXSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHRcdD8gdW5lc2NhcGUoY2FwdHVyZXNbal0pXG5cdFx0XHRcdFx0XHQ6IGNhcHR1cmVzW2pdO1xuXHRcdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdFx0cGFyYW1zW2tleV0gPSB2YWw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3BsYXRzLnB1c2godmFsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGFyYW1zOiBwYXJhbXMsXG5cdFx0XHRcdHNwbGF0czogc3BsYXRzLFxuXHRcdFx0XHRyb3V0ZTogcm91dGUuc3JjLFxuXHRcdFx0XHRuZXh0OiBpICsgMVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogRGVmYXVsdCBcIm5vcm1hbFwiIHJvdXRlciBjb25zdHJ1Y3Rvci5cbiAqIGFjY2VwdHMgcGF0aCwgZm4gdHVwbGVzIHZpYSBhZGRSb3V0ZVxuICogcmV0dXJucyB7Zm4sIHBhcmFtcywgc3BsYXRzLCByb3V0ZX1cbiAqICB2aWEgbWF0Y2hcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxudmFyIFJvdXRlciA9IGZ1bmN0aW9uKCl7XG4gIC8vdXNpbmcgJ25ldycgaXMgb3B0aW9uYWxcbiAgcmV0dXJuIHtcbiAgICByb3V0ZXM6IFtdLFxuICAgIHJvdXRlTWFwIDoge30sXG4gICAgYWRkUm91dGU6IGZ1bmN0aW9uKHBhdGgsIGZuKXtcbiAgICAgIGlmICghcGF0aCkgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgcmVxdWlyZXMgYSBwYXRoJyk7XG4gICAgICBpZiAoIWZuKSB0aHJvdyBuZXcgRXJyb3IoJyByb3V0ZSAnICsgcGF0aC50b1N0cmluZygpICsgJyByZXF1aXJlcyBhIGNhbGxiYWNrJyk7XG5cbiAgICAgIHZhciByb3V0ZSA9IFJvdXRlKHBhdGgpO1xuICAgICAgcm91dGUuZm4gPSBmbjtcblxuICAgICAgdGhpcy5yb3V0ZXMucHVzaChyb3V0ZSk7XG4gICAgICB0aGlzLnJvdXRlTWFwW3BhdGhdID0gZm47XG4gICAgfSxcblxuICAgIG1hdGNoOiBmdW5jdGlvbihwYXRobmFtZSwgc3RhcnRBdCl7XG4gICAgICB2YXIgcm91dGUgPSBtYXRjaCh0aGlzLnJvdXRlcywgcGF0aG5hbWUsIHN0YXJ0QXQpO1xuICAgICAgaWYocm91dGUpe1xuICAgICAgICByb3V0ZS5mbiA9IHRoaXMucm91dGVNYXBbcm91dGUucm91dGVdO1xuICAgICAgICByb3V0ZS5uZXh0ID0gdGhpcy5tYXRjaC5iaW5kKHRoaXMsIHBhdGhuYW1lLCByb3V0ZS5uZXh0KVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJvdXRlO1xuICAgIH1cbiAgfVxufTtcblxuUm91dGVyLlJvdXRlID0gUm91dGVcblJvdXRlci5wYXRoVG9SZWdFeHAgPSBwYXRoVG9SZWdFeHBcblJvdXRlci5tYXRjaCA9IG1hdGNoXG4vLyBiYWNrIGNvbXBhdFxuUm91dGVyLlJvdXRlciA9IFJvdXRlclxuXG5tb2R1bGUuZXhwb3J0cyA9IFJvdXRlclxuXG59LHt9XX0se30sWzFdKVxuKDEpXG59KTtcbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwidmFyIHdpbmRvdyA9IHJlcXVpcmUoXCJnbG9iYWwvd2luZG93XCIpXG52YXIgb25jZSA9IHJlcXVpcmUoXCJvbmNlXCIpXG52YXIgcGFyc2VIZWFkZXJzID0gcmVxdWlyZSgncGFyc2UtaGVhZGVycycpXG5cbnZhciBtZXNzYWdlcyA9IHtcbiAgICBcIjBcIjogXCJJbnRlcm5hbCBYTUxIdHRwUmVxdWVzdCBFcnJvclwiLFxuICAgIFwiNFwiOiBcIjR4eCBDbGllbnQgRXJyb3JcIixcbiAgICBcIjVcIjogXCI1eHggU2VydmVyIEVycm9yXCJcbn1cblxudmFyIFhIUiA9IHdpbmRvdy5YTUxIdHRwUmVxdWVzdCB8fCBub29wXG52YXIgWERSID0gXCJ3aXRoQ3JlZGVudGlhbHNcIiBpbiAobmV3IFhIUigpKSA/IFhIUiA6IHdpbmRvdy5YRG9tYWluUmVxdWVzdFxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVhIUlxuXG5mdW5jdGlvbiBjcmVhdGVYSFIob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHsgdXJpOiBvcHRpb25zIH1cbiAgICB9XG5cbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIGNhbGxiYWNrID0gb25jZShjYWxsYmFjaylcblxuICAgIHZhciB4aHIgPSBvcHRpb25zLnhociB8fCBudWxsXG5cbiAgICBpZiAoIXhocikge1xuICAgICAgICBpZiAob3B0aW9ucy5jb3JzIHx8IG9wdGlvbnMudXNlWERSKSB7XG4gICAgICAgICAgICB4aHIgPSBuZXcgWERSKClcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICB4aHIgPSBuZXcgWEhSKClcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciB1cmkgPSB4aHIudXJsID0gb3B0aW9ucy51cmkgfHwgb3B0aW9ucy51cmxcbiAgICB2YXIgbWV0aG9kID0geGhyLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8IFwiR0VUXCJcbiAgICB2YXIgYm9keSA9IG9wdGlvbnMuYm9keSB8fCBvcHRpb25zLmRhdGFcbiAgICB2YXIgaGVhZGVycyA9IHhoci5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9XG4gICAgdmFyIHN5bmMgPSAhIW9wdGlvbnMuc3luY1xuICAgIHZhciBpc0pzb24gPSBmYWxzZVxuICAgIHZhciBrZXlcbiAgICB2YXIgbG9hZCA9IG9wdGlvbnMucmVzcG9uc2UgPyBsb2FkUmVzcG9uc2UgOiBsb2FkWGhyXG5cbiAgICBpZiAoXCJqc29uXCIgaW4gb3B0aW9ucykge1xuICAgICAgICBpc0pzb24gPSB0cnVlXG4gICAgICAgIGhlYWRlcnNbXCJBY2NlcHRcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIlxuICAgICAgICBpZiAobWV0aG9kICE9PSBcIkdFVFwiICYmIG1ldGhvZCAhPT0gXCJIRUFEXCIpIHtcbiAgICAgICAgICAgIGhlYWRlcnNbXCJDb250ZW50LVR5cGVcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIlxuICAgICAgICAgICAgYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSByZWFkeXN0YXRlY2hhbmdlXG4gICAgeGhyLm9ubG9hZCA9IGxvYWRcbiAgICB4aHIub25lcnJvciA9IGVycm9yXG4gICAgLy8gSUU5IG11c3QgaGF2ZSBvbnByb2dyZXNzIGJlIHNldCB0byBhIHVuaXF1ZSBmdW5jdGlvbi5cbiAgICB4aHIub25wcm9ncmVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gSUUgbXVzdCBkaWVcbiAgICB9XG4gICAgLy8gaGF0ZSBJRVxuICAgIHhoci5vbnRpbWVvdXQgPSBub29wXG4gICAgeGhyLm9wZW4obWV0aG9kLCB1cmksICFzeW5jKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9iYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgaWYgKG9wdGlvbnMud2l0aENyZWRlbnRpYWxzIHx8IChvcHRpb25zLmNvcnMgJiYgb3B0aW9ucy53aXRoQ3JlZGVudGlhbHMgIT09IGZhbHNlKSkge1xuICAgICAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIENhbm5vdCBzZXQgdGltZW91dCB3aXRoIHN5bmMgcmVxdWVzdFxuICAgIGlmICghc3luYykge1xuICAgICAgICB4aHIudGltZW91dCA9IFwidGltZW91dFwiIGluIG9wdGlvbnMgPyBvcHRpb25zLnRpbWVvdXQgOiA1MDAwXG4gICAgfVxuXG4gICAgaWYgKHhoci5zZXRSZXF1ZXN0SGVhZGVyKSB7XG4gICAgICAgIGZvcihrZXkgaW4gaGVhZGVycyl7XG4gICAgICAgICAgICBpZihoZWFkZXJzLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgaGVhZGVyc1trZXldKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChvcHRpb25zLmhlYWRlcnMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSGVhZGVycyBjYW5ub3QgYmUgc2V0IG9uIGFuIFhEb21haW5SZXF1ZXN0IG9iamVjdFwiKVxuICAgIH1cblxuICAgIGlmIChcInJlc3BvbnNlVHlwZVwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9IG9wdGlvbnMucmVzcG9uc2VUeXBlXG4gICAgfVxuICAgIFxuICAgIGlmIChcImJlZm9yZVNlbmRcIiBpbiBvcHRpb25zICYmIFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5iZWZvcmVTZW5kID09PSBcImZ1bmN0aW9uXCJcbiAgICApIHtcbiAgICAgICAgb3B0aW9ucy5iZWZvcmVTZW5kKHhocilcbiAgICB9XG5cbiAgICB4aHIuc2VuZChib2R5KVxuXG4gICAgcmV0dXJuIHhoclxuXG4gICAgZnVuY3Rpb24gcmVhZHlzdGF0ZWNoYW5nZSgpIHtcbiAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICBsb2FkKClcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEJvZHkoKSB7XG4gICAgICAgIC8vIENocm9tZSB3aXRoIHJlcXVlc3RUeXBlPWJsb2IgdGhyb3dzIGVycm9ycyBhcnJvdW5kIHdoZW4gZXZlbiB0ZXN0aW5nIGFjY2VzcyB0byByZXNwb25zZVRleHRcbiAgICAgICAgdmFyIGJvZHkgPSBudWxsXG5cbiAgICAgICAgaWYgKHhoci5yZXNwb25zZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5yZXNwb25zZVxuICAgICAgICB9IGVsc2UgaWYgKHhoci5yZXNwb25zZVR5cGUgPT09ICd0ZXh0JyB8fCAheGhyLnJlc3BvbnNlVHlwZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5yZXNwb25zZVRleHQgfHwgeGhyLnJlc3BvbnNlWE1MXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNKc29uKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJvZHkgPSBKU09OLnBhcnNlKGJvZHkpXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJvZHlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTdGF0dXNDb2RlKCkge1xuICAgICAgICByZXR1cm4geGhyLnN0YXR1cyA9PT0gMTIyMyA/IDIwNCA6IHhoci5zdGF0dXNcbiAgICB9XG5cbiAgICAvLyBpZiB3ZSdyZSBnZXR0aW5nIGEgbm9uZS1vayBzdGF0dXNDb2RlLCBidWlsZCAmIHJldHVybiBhbiBlcnJvclxuICAgIGZ1bmN0aW9uIGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKSB7XG4gICAgICAgIHZhciBlcnJvciA9IG51bGxcbiAgICAgICAgaWYgKHN0YXR1cyA9PT0gMCB8fCAoc3RhdHVzID49IDQwMCAmJiBzdGF0dXMgPCA2MDApKSB7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9ICh0eXBlb2YgYm9keSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkgOiBmYWxzZSkgfHxcbiAgICAgICAgICAgICAgICBtZXNzYWdlc1tTdHJpbmcoc3RhdHVzKS5jaGFyQXQoMCldXG4gICAgICAgICAgICBlcnJvciA9IG5ldyBFcnJvcihtZXNzYWdlKVxuICAgICAgICAgICAgZXJyb3Iuc3RhdHVzQ29kZSA9IHN0YXR1c1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVycm9yXG4gICAgfVxuXG4gICAgLy8gd2lsbCBsb2FkIHRoZSBkYXRhICYgcHJvY2VzcyB0aGUgcmVzcG9uc2UgaW4gYSBzcGVjaWFsIHJlc3BvbnNlIG9iamVjdFxuICAgIGZ1bmN0aW9uIGxvYWRSZXNwb25zZSgpIHtcbiAgICAgICAgdmFyIHN0YXR1cyA9IGdldFN0YXR1c0NvZGUoKVxuICAgICAgICB2YXIgZXJyb3IgPSBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cylcbiAgICAgICAgdmFyIHJlc3BvbnNlID0ge1xuICAgICAgICAgICAgYm9keTogZ2V0Qm9keSgpLFxuICAgICAgICAgICAgc3RhdHVzQ29kZTogc3RhdHVzLFxuICAgICAgICAgICAgc3RhdHVzVGV4dDogeGhyLnN0YXR1c1RleHQsXG4gICAgICAgICAgICByYXc6IHhoclxuICAgICAgICB9XG4gICAgICAgIGlmKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMpeyAvL3JlbWVtYmVyIHhociBjYW4gaW4gZmFjdCBiZSBYRFIgZm9yIENPUlMgaW4gSUVcbiAgICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSBwYXJzZUhlYWRlcnMoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzcG9uc2UuaGVhZGVycyA9IHt9XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhlcnJvciwgcmVzcG9uc2UsIHJlc3BvbnNlLmJvZHkpXG4gICAgfVxuXG4gICAgLy8gd2lsbCBsb2FkIHRoZSBkYXRhIGFuZCBhZGQgc29tZSByZXNwb25zZSBwcm9wZXJ0aWVzIHRvIHRoZSBzb3VyY2UgeGhyXG4gICAgLy8gYW5kIHRoZW4gcmVzcG9uZCB3aXRoIHRoYXRcbiAgICBmdW5jdGlvbiBsb2FkWGhyKCkge1xuICAgICAgICB2YXIgc3RhdHVzID0gZ2V0U3RhdHVzQ29kZSgpXG4gICAgICAgIHZhciBlcnJvciA9IGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKVxuXG4gICAgICAgIHhoci5zdGF0dXMgPSB4aHIuc3RhdHVzQ29kZSA9IHN0YXR1c1xuICAgICAgICB4aHIuYm9keSA9IGdldEJvZHkoKVxuICAgICAgICB4aHIuaGVhZGVycyA9IHBhcnNlSGVhZGVycyh4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpXG5cbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIHhociwgeGhyLmJvZHkpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IoZXZ0KSB7XG4gICAgICAgIGNhbGxiYWNrKGV2dCwgeGhyKVxuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBub29wKCkge31cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbmlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbDtcbn0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIpe1xuICAgIG1vZHVsZS5leHBvcnRzID0gc2VsZjtcbn0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7fTtcbn1cblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IG9uY2Vcblxub25jZS5wcm90byA9IG9uY2UoZnVuY3Rpb24gKCkge1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRnVuY3Rpb24ucHJvdG90eXBlLCAnb25jZScsIHtcbiAgICB2YWx1ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIG9uY2UodGhpcylcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICB9KVxufSlcblxuZnVuY3Rpb24gb25jZSAoZm4pIHtcbiAgdmFyIGNhbGxlZCA9IGZhbHNlXG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGNhbGxlZCkgcmV0dXJuXG4gICAgY2FsbGVkID0gdHJ1ZVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gIH1cbn1cbiIsInZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnaXMtZnVuY3Rpb24nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZvckVhY2hcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ1xudmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eVxuXG5mdW5jdGlvbiBmb3JFYWNoKGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGl0ZXJhdG9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdpdGVyYXRvciBtdXN0IGJlIGEgZnVuY3Rpb24nKVxuICAgIH1cblxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMykge1xuICAgICAgICBjb250ZXh0ID0gdGhpc1xuICAgIH1cbiAgICBcbiAgICBpZiAodG9TdHJpbmcuY2FsbChsaXN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJylcbiAgICAgICAgZm9yRWFjaEFycmF5KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxuICAgIGVsc2UgaWYgKHR5cGVvZiBsaXN0ID09PSAnc3RyaW5nJylcbiAgICAgICAgZm9yRWFjaFN0cmluZyhsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlXG4gICAgICAgIGZvckVhY2hPYmplY3QobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG59XG5cbmZ1bmN0aW9uIGZvckVhY2hBcnJheShhcnJheSwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoYXJyYXksIGkpKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIGFycmF5W2ldLCBpLCBhcnJheSlcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaFN0cmluZyhzdHJpbmcsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAvLyBubyBzdWNoIHRoaW5nIGFzIGEgc3BhcnNlIHN0cmluZy5cbiAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBzdHJpbmcuY2hhckF0KGkpLCBpLCBzdHJpbmcpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoT2JqZWN0KG9iamVjdCwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBrIGluIG9iamVjdCkge1xuICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGspKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9iamVjdFtrXSwgaywgb2JqZWN0KVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBpc0Z1bmN0aW9uXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcblxuZnVuY3Rpb24gaXNGdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHN0cmluZyA9IHRvU3RyaW5nLmNhbGwoZm4pXG4gIHJldHVybiBzdHJpbmcgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXScgfHxcbiAgICAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nICYmIHN0cmluZyAhPT0gJ1tvYmplY3QgUmVnRXhwXScpIHx8XG4gICAgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmXG4gICAgIC8vIElFOCBhbmQgYmVsb3dcbiAgICAgKGZuID09PSB3aW5kb3cuc2V0VGltZW91dCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5hbGVydCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5jb25maXJtIHx8XG4gICAgICBmbiA9PT0gd2luZG93LnByb21wdCkpXG59O1xuIiwiXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB0cmltO1xuXG5mdW5jdGlvbiB0cmltKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyp8XFxzKiQvZywgJycpO1xufVxuXG5leHBvcnRzLmxlZnQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqLywgJycpO1xufTtcblxuZXhwb3J0cy5yaWdodCA9IGZ1bmN0aW9uKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG59O1xuIiwidmFyIHRyaW0gPSByZXF1aXJlKCd0cmltJylcbiAgLCBmb3JFYWNoID0gcmVxdWlyZSgnZm9yLWVhY2gnKVxuICAsIGlzQXJyYXkgPSBmdW5jdGlvbihhcmcpIHtcbiAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJnKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICB9XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGhlYWRlcnMpIHtcbiAgaWYgKCFoZWFkZXJzKVxuICAgIHJldHVybiB7fVxuXG4gIHZhciByZXN1bHQgPSB7fVxuXG4gIGZvckVhY2goXG4gICAgICB0cmltKGhlYWRlcnMpLnNwbGl0KCdcXG4nKVxuICAgICwgZnVuY3Rpb24gKHJvdykge1xuICAgICAgICB2YXIgaW5kZXggPSByb3cuaW5kZXhPZignOicpXG4gICAgICAgICAgLCBrZXkgPSB0cmltKHJvdy5zbGljZSgwLCBpbmRleCkpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAsIHZhbHVlID0gdHJpbShyb3cuc2xpY2UoaW5kZXggKyAxKSlcblxuICAgICAgICBpZiAodHlwZW9mKHJlc3VsdFtrZXldKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHZhbHVlXG4gICAgICAgIH0gZWxzZSBpZiAoaXNBcnJheShyZXN1bHRba2V5XSkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XS5wdXNoKHZhbHVlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gWyByZXN1bHRba2V5XSwgdmFsdWUgXVxuICAgICAgICB9XG4gICAgICB9XG4gIClcblxuICByZXR1cm4gcmVzdWx0XG59IiwibW9kdWxlLmV4cG9ydHM9XCIzLjAuMVwiXG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0ID0gcmVxdWlyZSgnLi92ZXJzaW9uLmpzb24nKTtcblxuZnVuY3Rpb24gZ2V0ICh2KSB7XG4gIHJldHVybiAndCcgKyB0ICsgJzt2JyArIHY7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBnZXQ6IGdldFxufTtcbiJdfQ==
