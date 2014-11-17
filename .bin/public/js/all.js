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
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n<p>Taunus exposes <em>three different public APIs</em>, and there&#39;s also <strong>plugins to integrate Taunus and an HTTP server</strong>. This document covers all three APIs extensively. If you&#39;re concerned about the inner workings of Taunus, please refer to the <a href=\"/getting-started\">Getting Started</a> guide. This document aims to only cover how the public interface affects application state, but <strong>doesn&#39;t delve into implementation details</strong>.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li>A <a href=\"#server-side-api\">server-side API</a> that deals with server-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Its <a href=\"#the-options-object\"><code>options</code></a> argument<ul>\n<li><a href=\"#-options-layout-\"><code>layout</code></a></li>\n<li><a href=\"#-options-routes-\"><code>routes</code></a></li>\n<li><a href=\"#-options-getdefaultviewmodel-\"><code>getDefaultViewModel</code></a></li>\n<li><a href=\"#-options-plaintext-\"><code>plaintext</code></a></li>\n<li><a href=\"#-options-resolvers-\"><code>resolvers</code></a></li>\n<li><a href=\"#-options-version-\"><code>version</code></a></li>\n</ul>\n</li>\n<li>Its <a href=\"#-addroute-definition-\"><code>addRoute</code></a> argument</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render</code></a> method</li>\n<li>The <a href=\"#-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel</code></a> method</li>\n</ul>\n</li>\n<li><a href=\"#server-side-controllers\">Server-side controllers</a></li>\n<li>A <a href=\"#http-framework-plugins\">suite of plugins</a> can integrate Taunus and an HTTP server<ul>\n<li>Using <a href=\"#using-taunus-express-\"><code>taunus-express</code></a> for <a href=\"http://expressjs.com\">Express</a></li>\n<li>Using <a href=\"#using-taunus-hapi-\"><code>taunus-hapi</code></a> for <a href=\"http://hapijs.com\">Hapi</a></li>\n</ul>\n</li>\n<li>A <a href=\"#command-line-interface\">CLI that produces a wiring module</a> for the client-side<ul>\n<li>The <a href=\"#-output-\"><code>--output</code></a> flag</li>\n<li>The <a href=\"#-watch-\"><code>--watch</code></a> flag</li>\n<li>The <a href=\"#-transform-module-\"><code>--transform &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-standalone-\"><code>--standalone</code></a> flag</li>\n</ul>\n</li>\n<li>A <a href=\"#client-side-api\">client-side API</a> that deals with client-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Using the <a href=\"#using-the-auto-strategy\"><code>auto</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-inline-strategy\"><code>inline</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-manual-strategy\"><code>manual</code></a> strategy</li>\n<li><a href=\"#caching\">Caching</a></li>\n<li><a href=\"#prefetching\">Prefetching</a></li>\n<li><a href=\"#versioning\">Versioning</a></li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a> method</li>\n<li>The <a href=\"#-taunus-once-type-fn-\"><code>taunus.once</code></a> method</li>\n<li>The <a href=\"#-taunus-off-type-fn-\"><code>taunus.off</code></a> method</li>\n<li>The <a href=\"#-taunus-intercept-action-fn-\"><code>taunus.intercept</code></a> method</li>\n<li>The <a href=\"#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a> method</li>\n<li>The <a href=\"#-taunus-navigate-url-options-\"><code>taunus.navigate</code></a> method</li>\n<li>The <a href=\"#-taunus-route-url-\"><code>taunus.route</code></a> method<ul>\n<li>The <a href=\"#-taunus-route-equals-route-route-\"><code>taunus.route.equals</code></a> method</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-state-\"><code>taunus.state</code></a> property</li>\n<li>The <a href=\"#-taunus-xhr-url-options-done-\"><code>taunus.xhr</code></a> method</li>\n</ul>\n</li>\n<li><a href=\"#client-side-controllers\">Client-side controllers</a></li>\n<li>The <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a> manifest</li>\n</ul>\n<h1 id=\"server-side-api\">Server-side API</h1>\n<p>The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, <em>including client-side rendering</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-addroute-options-\"><code>taunus.mount(addRoute, options?)</code></h2>\n<p>Mounts Taunus on top of a server-side router, by registering each route in <code>options.routes</code> with the <code>addRoute</code> method.</p>\n<blockquote>\n<p>Note that most of the time, <strong>this method shouldn&#39;t be invoked directly</strong>, but rather through one of the <a href=\"#http-framework-plugins\">HTTP framework plugins</a> presented below.</p>\n</blockquote>\n<p>Here&#39;s an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the <code>route</code> and <code>action</code> properties.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\ntaunus.mount(addRoute, {\n  routes: [{ route: &#39;/&#39;, action: &#39;home/index&#39; }]\n});\n\nfunction addRoute (definition) {\n  app.get(definition.route, definition.action);\n}\n</code></pre>\n<p>Let&#39;s go over the options you can pass to <code>taunus.mount</code> first.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"the-options-object\">The <code>options?</code> object</h4>\n<p>There&#39;s a few options that can be passed to the server-side mountpoint. You&#39;re probably going to be passing these to your <a href=\"#http-framework-plugins\">HTTP framework plugin</a>, rather than using <code>taunus.mount</code> directly.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-layout-\"><code>options.layout?</code></h6>\n<p>The <code>layout</code> property is expected to have the <code>function(data)</code> signature. It&#39;ll be invoked whenever a full HTML document needs to be rendered, and a <code>data</code> object will be passed to it. That object will contain everything you&#39;ve set as the view model, plus a <code>partial</code> property containing the raw HTML of the rendered partial view. Your <code>layout</code> method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out <a href=\"https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\">the <code>layout.jade</code> used in Pony Foo</a> as an example.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-routes-\"><code>options.routes</code></h6>\n<p>The other big option is <code>routes</code>, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.</p>\n<p>Here&#39;s an example route that uses the <a href=\"http://expressjs.com\">Express</a> routing scheme.</p>\n<pre><code class=\"lang-js\">{\n  route: &#39;/articles/:slug&#39;,\n  action: &#39;articles/article&#39;,\n  ignore: false,\n  cache: &lt;inherit&gt;\n}\n</code></pre>\n<ul>\n<li><code>route</code> is a route in the format your HTTP framework of choice understands</li>\n<li><code>action</code> is the name of your controller action. It&#39;ll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller</li>\n<li><code>cache</code> can be used to determine the client-side caching behavior in this application path, and it&#39;ll default to inheriting from the options passed to <code>taunus.mount</code> <em>on the client-side</em></li>\n<li><code>ignore</code> is used in those cases where you want a URL to be ignored by the client-side router even if there&#39;s a catch-all route that would match that URL</li>\n</ul>\n<p>As an example of the <code>ignore</code> use case, consider the routing table shown below. The client-side router doesn&#39;t know <em>(and can&#39;t know unless you point it out)</em> what routes are server-side only, and it&#39;s up to you to point those out.</p>\n<pre><code class=\"lang-js\">[\n  { route: &#39;/&#39;, action: &#39;/home/index&#39; },\n  { route: &#39;/feed&#39;, ignore: true },\n  { route: &#39;/*&#39;, action: &#39;error/not-found&#39; }\n]\n</code></pre>\n<p>This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The <code>ignore</code> property is effectively telling the client-side <em>&quot;don&#39;t hijack links containing this URL&quot;</em>.</p>\n<p>Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don&#39;t need to be <code>ignore</code>d.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getdefaultviewmodel-\"><code>options.getDefaultViewModel?</code></h6>\n<p>The <code>getDefaultViewModel(done)</code> property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you&#39;re done creating a view model, you can invoke <code>done(null, model)</code>. If an error occurs while building the view model, you should call <code>done(err)</code> instead.</p>\n<p>Taunus will throw an error if <code>done</code> is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases <a href=\"#taunus-rebuilddefaultviewmodel\">the defaults can be rebuilt</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-plaintext-\"><code>options.plaintext?</code></h6>\n<p>The <code>plaintext</code> options object is passed directly to <a href=\"https://github.com/bevacqua/hget\">hget</a>, and it&#39;s used to <a href=\"https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\">tweak the plaintext version</a> of your site.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-resolvers-\"><code>options.resolvers?</code></h6>\n<p>Resolvers are used to determine the location of some of the different pieces of your application. Typically you won&#39;t have to touch these in the slightest.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getServerController(action)</code></td>\n<td>Return path to server-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p>The <code>addRoute</code> method passed to <code>taunus.mount</code> on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-version-\"><code>options.version?</code></h6>\n<p>Refer to the <a href=\"#versioning\">Versioning</a> section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-addroute-definition-\"><code>addRoute(definition)</code></h4>\n<p>The <code>addRoute(definition)</code> method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework&#39;s router.</p>\n<ul>\n<li><code>route</code> is the route that you set as <code>definition.route</code></li>\n<li><code>action</code> is the action as passed to the route definition</li>\n<li><code>actionFn</code> will be the controller for this action method</li>\n<li><code>middleware</code> will be an array of methods to be executed before <code>actionFn</code></li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render(action, viewModel, req, res, next)</code></h2>\n<p>This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won&#39;t go very deep into it.</p>\n<p>The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The <code>action</code> property determines the default view that will be rendered. The <code>viewModel</code> will be extended by <a href=\"#-options-getdefaultviewmodel-\">the default view model</a>, and it may also override the default <code>action</code> by setting <code>viewModel.model.action</code>.</p>\n<p>The <code>req</code>, <code>res</code>, and <code>next</code> arguments are expected to be the Express routing arguments, but they can also be mocked <em>(which is in fact what the Hapi plugin does)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel(done?)</code></h2>\n<p>Once Taunus has been mounted, calling this method will rebuild the view model defaults using the <code>getDefaultViewModel</code> that was passed to <code>taunus.mount</code> in the options. An optional <code>done</code> callback will be invoked when the model is rebuilt.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"server-side-controllers\">Server-Side Controllers</h1>\n<p>On the server-side, controllers are modules that export a single function. The parameters passed to these controllers depend on the server-side HTTP framework that&#39;s being used.</p>\n<p>For example, Express gives us three parameters: <code>req</code>, <code>res</code> and <code>next</code>. Hapi gives us two instead: <code>request</code> and <code>reply</code>.</p>\n<p>Here&#39;s a sample controller using <code>taunus-express</code>, as <a href=\"#using-taunus-express-\">detailed below</a>. This is a very simple controller where we are setting the special <code>viewModel</code> property on the response, and calling <code>next</code>. Suppose this controller is the <code>product/home</code> action handler.</p>\n<pre><code class=\"lang-js\">module.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;view title&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>As you can see, Taunus won&#39;t alter the API provided by Express. Instead, it builds upon the notion of using middleware. Once the <code>product/home</code> view is rendered and JavaScript loads, the <code>product/home</code> view controller is executed on the client-side.</p>\n<p>You could change the view to be rendered by setting the <code>action</code> property on the <code>model</code>. In the example shown below this would mean that the <code>error/offline</code> view would be rendered. The client-side controller will be that of <code>error/offline</code>, as well. View controllers are tied to the view that gets rendered.</p>\n<pre><code class=\"lang-js\">module.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;view title&#39;\n    }\n  };\n  if (offline) {\n    res.viewModel.model.action = &#39;error/offline&#39;;\n  }\n  next();\n};\n</code></pre>\n<p>Having a default action and the ability to redirect to another gives us a lot of flexibility when determining how to respond to a request.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"http-framework-plugins\">HTTP Framework Plugins</h1>\n<p>There&#39;s currently two different HTTP frameworks <em>(<a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a>)</em> that you can readily use with Taunus without having to deal with any of the route plumbing yourself.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-express-\">Using <code>taunus-express</code></h2>\n<p>The <code>taunus-express</code> plugin is probably the easiest to use, as Taunus was originally developed with just <a href=\"http://expressjs.com\">Express</a> in mind. In addition to the options already outlined for <a href=\"#-taunus-mount-addroute-options-\">taunus.mount</a>, you can add middleware for any route individually.</p>\n<ul>\n<li><code>middleware</code> are any methods you want Taunus to execute as middleware in Express applications</li>\n</ul>\n<p>To get <code>taunus-express</code> going you can use the following piece of code, provided that you come up with an <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  // ...\n};\n\ntaunusExpress(taunus, app, options);\n</code></pre>\n<p>The <code>taunusExpress</code> method will merely set up Taunus and add the relevant routes to your Express application by calling <code>app.get</code> a bunch of times. You can <a href=\"https://github.com/taunus/taunus-express\">find taunus-express on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-hapi-\">Using <code>taunus-hapi</code></h2>\n<p>The <code>taunus-hapi</code> plugin is a bit more involved, and you&#39;ll have to create a Pack in order to use it. In addition to <a href=\"#-taunus-mount-addroute-options-\">the options we&#39;ve already covered</a>, you can add <code>config</code> on any route.</p>\n<ul>\n<li><code>config</code> is passed directly into the route registered with Hapi, giving you the most flexibility</li>\n</ul>\n<p>To get <code>taunus-hapi</code> going you can use the following piece of code, and you can bring your own <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar Hapi = require(&#39;hapi&#39;);\nvar taunus = require(&#39;taunus&#39;);\nvar taunusHapi = require(&#39;taunus-hapi&#39;)(taunus);\nvar pack = new Hapi.Pack();\n\npack.register({\n  plugin: taunusHapi,\n  options: {\n    // ...\n  }\n});\n</code></pre>\n<p>The <code>taunusHapi</code> plugin will mount Taunus and register all of the necessary routes. You can <a href=\"https://github.com/taunus/taunus-hapi\">find taunus-hapi on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"command-line-interface\">Command-Line Interface</h1>\n<p>Once you&#39;ve set up the server-side to render your views using Taunus, it&#39;s only logical that you&#39;ll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.</p>\n<p>The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.</p>\n<p>Install it globally for development, but remember to use local copies for production-grade uses.</p>\n<pre><code class=\"lang-shell\">npm install -g taunus\n</code></pre>\n<p>When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.</p>\n<pre><code class=\"lang-shell\">taunus\n</code></pre>\n<p>By default, the output will be printed to the standard output, making for a fast debugging experience. Here&#39;s the output if you just had a single <code>home/index</code> route, and the matching view and client-side controller existed.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n  &#39;home/index&#39;: require(&#39;../client/js/controllers/home/index.js&#39;)\n};\n\nvar routes = [\n  {\n    route: &#39;/&#39;,\n    action: &#39;home/index&#39;\n  }\n];\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>You can use a few options to alter the outcome of invoking <code>taunus</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-output-\"><code>--output</code></h2>\n<p><sub>the <code>-o</code> alias is available</sub></p>\n<p>Output is written to a file instead of to standard output. The file path used will be the <code>client_wiring</code> option in <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a>, which defaults to <code>&#39;.bin/wiring.js&#39;</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-watch-\"><code>--watch</code></h2>\n<p><sub>the <code>-w</code> alias is available</sub></p>\n<p>Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether <code>--output</code> was used.</p>\n<p>The program won&#39;t exit.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-transform-module-\"><code>--transform &lt;module&gt;</code></h2>\n<p><sub>the <code>-t</code> alias is available</sub></p>\n<p>This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the <a href=\"https://github.com/taunus/hapiify\"><code>hapiify</code></a> module.</p>\n<pre><code class=\"lang-shell\">npm install hapiify\ntaunus -t hapiify\n</code></pre>\n<p>Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></h2>\n<p><sub>the <code>-r</code> alias is available</sub></p>\n<p>Similarly to the <a href=\"#-options-resolvers-\"><code>resolvers</code></a> option that you can pass to <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a>, these resolvers can change the way in which file paths are resolved.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getClientController(action)</code></td>\n<td>Return path to client-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-standalone-\"><code>--standalone</code></h2>\n<p><sub>the <code>-s</code> alias is available</sub></p>\n<p>Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus <a href=\"https://github.com/umdjs/umd\">as a UMD module</a>.</p>\n<p>This would allow you to use Taunus on the client-side even if you don&#39;t want to use <a href=\"http://browserify.org\">Browserify</a> directly.</p>\n<p>Feedback and suggestions about this flag, <em>and possible alternatives that would make Taunus easier to use</em>, are welcome.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-api\">Client-side API</h1>\n<p>Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-container-wiring-options-\"><code>taunus.mount(container, wiring, options?)</code></h2>\n<p>The mountpoint takes a root container, the wiring module, and an options parameter. The <code>container</code> is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the <code>wiring</code> module exactly as built by the CLI, and no further configuration is necessary.</p>\n<p>When the mountpoint executes, Taunus will configure its internal state, <em>set up the client-side router</em>, run the client-side controller for the server-side rendered view, and start hijacking links.</p>\n<p>As an example, consider a browser makes a <code>GET</code> request for <code>/articles/the-fox</code> for the first time. Once <code>taunus.mount(container, wiring)</code> is invoked on the client-side, several things would happen in the order listed below.</p>\n<ul>\n<li>Taunus sets up the client-side view routing engine</li>\n<li>If enabled <em>(via <code>options</code>)</em>, the caching engine is configured</li>\n<li>Taunus obtains the view model <em>(more on this later)</em></li>\n<li>When a view model is obtained, the <code>&#39;start&#39;</code> event is emitted</li>\n<li>Anchor links start being monitored for clicks <em>(at this point your application becomes a <a href=\"http://en.wikipedia.org/wiki/Single-page_application\">SPA</a>)</em></li>\n<li>The <code>articles/article</code> client-side controller is executed</li>\n</ul>\n<p>That&#39;s quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, <em>rather than on the server-side!</em></p>\n<p>In order to better understand the process, I&#39;ll walk you through the <code>options</code> parameter.</p>\n<p>First off, the <code>bootstrap</code> option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: <code>auto</code> <em>(the default strategy)</em>, <code>inline</code>, or <code>manual</code>. The <code>auto</code> strategy involves the least work, which is why it&#39;s the default.</p>\n<ul>\n<li><code>auto</code> will make an AJAX request for the view model</li>\n<li><code>inline</code> expects you to place the model into a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag</li>\n<li><code>manual</code> expects you to get the view model however you want to, and then let Taunus know when it&#39;s ready</li>\n</ul>\n<p>Let&#39;s go into detail about each of these strategies.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-auto-strategy\">Using the <code>auto</code> strategy</h4>\n<p>The <code>auto</code> strategy means that Taunus will make use of an AJAX request to obtain the view model. <em>You don&#39;t have to do anything else</em> and this is the default strategy. This is the <strong>most convenient strategy, but also the slowest</strong> one.</p>\n<p>It&#39;s slow because the view model won&#39;t be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and <code>taunus.mount</code> is invoked.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-inline-strategy\">Using the <code>inline</code> strategy</h4>\n<p>The <code>inline</code> strategy expects you to add a <code>data-taunus</code> attribute on the <code>container</code> element. This attribute must be equal to the <code>id</code> attribute of a <code>&lt;script&gt;</code> tag containing the serialized view model alongside the version information automatically injected by Taunus into the layout template data.</p>\n<pre><code class=\"lang-jade\">div(data-taunus=&#39;model&#39;)!=partial\nscript(type=&#39;text/taunus&#39;, data-taunus=&#39;model&#39;)=JSON.stringify({ version: version, model: model })\n</code></pre>\n<p>Pay special attention to the fact that the model is not only made into a JSON string, <em>but also HTML encoded by Jade</em>. When Taunus extracts the model from the <code>&lt;script&gt;</code> tag it&#39;ll unescape it, and then parse it as JSON.</p>\n<p>This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.</p>\n<p>That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-manual-strategy\">Using the <code>manual</code> strategy</h4>\n<p>The <code>manual</code> strategy is the most involved of the three, but also the most performant. In this strategy you&#39;re supposed to add the following <em>(seemingly pointless)</em> snippet of code in a <code>&lt;script&gt;</code> other than the one that&#39;s pulling down Taunus, so that they are pulled concurrently rather than serially.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n</code></pre>\n<p>Once you somehow get your hands on the view model, you should invoke <code>taunusReady(model)</code>. Considering you&#39;ll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.</p>\n<ul>\n<li>The view model is loaded first, you call <code>taunusReady(model)</code> and wait for Taunus to take the model object and boot the application as soon as <code>taunus.mount</code> is executed</li>\n<li>Taunus loads first and <code>taunus.mount</code> is called first. In this case, Taunus will replace <code>window.taunusReady</code> with a special <code>boot</code> method. When the view model finishes loading, you call <code>taunusReady(model)</code> and the application finishes booting</li>\n</ul>\n<blockquote>\n<p>If this sounds a little mind-bending it&#39;s because it is. It&#39;s not designed to be pretty, but merely to be performant.</p>\n</blockquote>\n<p>Now that we&#39;ve addressed the awkward bits, let&#39;s cover the <em>&quot;somehow get your hands on the view model&quot;</em> aspect. My preferred method is using JSONP, as it&#39;s able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you&#39;ll probably want this to be an inline script, keeping it small is important.</p>\n<p>The good news is that the server-side supports JSONP out the box. Here&#39;s a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nfunction inject (url) {\n  var script = document.createElement(&#39;script&#39;);\n  script.src = url;\n  document.body.appendChild(script);\n}\n\nfunction injector () {\n  var search = location.search;\n  var searchQuery = search ? &#39;&amp;&#39; + search.substr(1) : &#39;&#39;;\n  var searchJson = &#39;?json&amp;callback=taunusReady&#39; + searchQuery;\n  inject(location.pathname + searchJson);\n}\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n\ninjector();\n</code></pre>\n<p>As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching\">Caching</h4>\n<p>The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the <code>cache</code> flag in the options passed to <code>taunus.mount</code> on the client-side.</p>\n<p>If you set <code>cache</code> to <code>true</code> then cached items will be considered <em>&quot;fresh&quot; (valid copies of the original)</em> for <strong>15 seconds</strong>. You can also set <code>cache</code> to a number, and that number of seconds will be used as the default instead.</p>\n<p>Caching can also be tweaked on individual routes. For instance, you could set <code>{ cache: true }</code> when mounting Taunus and then have <code>{ cache: 3600 }</code> on a route that you want to cache for a longer period of time.</p>\n<p>The caching layer is <em>seamlessly integrated</em> into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in <a href=\"http://caniuse.com/#feat=indexeddb\">browsers that support IndexedDB</a>. In the case of browsers that don&#39;t support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"prefetching\">Prefetching</h4>\n<p>If caching is enabled, the next logical step is prefetching. This is enabled just by adding <code>prefetch: true</code> to the options passed to <code>taunus.mount</code>. The prefetching feature will fire for any anchor link that&#39;s trips over a <code>mouseover</code> or a <code>touchstart</code> event. If a route matches the URL in the <code>href</code>, an AJAX request will prefetch the view and cache its contents, improving perceived performance.</p>\n<p>When links are clicked before prefetching finishes, they&#39;ll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.</p>\n<h4 id=\"versioning\">Versioning</h4>\n<p>When enabled, versioning will look out for discrepancies between what&#39;s currently on the client and what&#39;s on the server, and reload everything necessary to make what&#39;s on the client match what&#39;s on the server.</p>\n<p>In order to turn it on, set the <code>version</code> field in the options when invoking <code>taunus.mount</code> <strong>on both the server-side and the client-side, using the same value</strong>. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.</p>\n<blockquote>\n<p>To make sure you don&#39;t forget to change the version string in one of the mountpoints, please create a JSON file with just the version string and <code>require</code> that file in both sides.</p>\n<pre><code class=\"lang-shell\">echo &#39;&quot;1.0.0&quot;&#39; &gt; version.json\n</code></pre>\n</blockquote>\n<p>The default version string is set to <code>1</code>. The Taunus version will be prepended to yours, resulting in a value such as <code>t3.0.0;v1</code> where Taunus is running version <code>3.0.0</code> and your application is running version <code>1</code>.</p>\n<p>Refer to the Getting Started guide for a more detailed <a href=\"/getting-started#versioning\">analysis of the uses for versioning</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-on-type-fn-\"><code>taunus.on(type, fn)</code></h2>\n<p>Taunus emits a series of events during its lifecycle, and <code>taunus.on</code> is the way you can tune in and listen for these events using a subscription function <code>fn</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model, route</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model, route</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Consider for instance that you&#39;d like to keep track of every view that gets rendered, and what DOM element it gets placed into. The piece of code below would quickly do that for us.</p>\n<pre><code class=\"lang-js\">taunus.on(&#39;render&#39;, function (container) {\n  console.log(&#39;Rendered a view on&#39;, container);\n});\n</code></pre>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-once-type-fn-\"><code>taunus.once(type, fn)</code></h2>\n<p>This method is equivalent to <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a>, except the event listeners will be used once and then it&#39;ll be discarded.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-off-type-fn-\"><code>taunus.off(type, fn)</code></h2>\n<p>Using this method you can remove any event listeners that were previously added using <code>.on</code> or <code>.once</code>. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling <code>.on</code> or <code>.once</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-intercept-action-fn-\"><code>taunus.intercept(action?, fn)</code></h2>\n<p>This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified <code>action</code>. You can also add global interceptors by omitting the <code>action</code> parameter, or setting it to <code>*</code>.</p>\n<p>An interceptor function will receive an <code>event</code> parameter, containing a few different properties.</p>\n<ul>\n<li><code>url</code> contains the URL that needs a view model</li>\n<li><code>route</code> contains the full route object as you&#39;d get from <a href=\"#-taunus-route-url-\"><code>taunus.route(url)</code></a></li>\n<li><code>parts</code> is just a shortcut for <code>route.parts</code></li>\n<li><code>preventDefault(model)</code> allows you to suppress the need for an AJAX request, commanding Taunus to use the model you&#39;ve provided instead</li>\n<li><code>defaultPrevented</code> tells you if some other handler has prevented the default behavior</li>\n<li><code>canPreventDefault</code> tells you if invoking <code>event.preventDefault</code> will have any effect</li>\n<li><code>model</code> starts as <code>null</code>, and it can later become the model passed to <code>preventDefault</code></li>\n</ul>\n<p>Interceptors are asynchronous, but if an interceptor spends longer than 200ms it&#39;ll be short-circuited and calling <code>event.preventDefault</code> past that point won&#39;t have any effect.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-partial-container-action-model-\"><code>taunus.partial(container, action, model)</code></h2>\n<p>This method provides you with access to the view-rendering engine of Taunus. You can use it to render the <code>action</code> view into the <code>container</code> DOM element, using the specified <code>model</code>. Once the view is rendered, the <code>render</code> event will be fired <em>(with <code>container, model</code> as arguments)</em> and the client-side controller for that view will be executed.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-navigate-url-options-\"><code>taunus.navigate(url, options)</code></h2>\n<p>Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use <code>taunus.navigate</code> passing it a plain URL or anything that would cause <code>taunus.route(url)</code> to return a valid route.</p>\n<p>By default, if <code>taunus.navigate(url, options)</code> is called with an <code>url</code> that doesn&#39;t match any client-side route, then the user will be redirected via <code>location.href</code>. In cases where the browser doesn&#39;t support the history API, <code>location.href</code> will be used as well.</p>\n<p>There&#39;s a few options you can use to tweak the behavior of <code>taunus.navigate</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Option</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>context</code></td>\n<td>A DOM element that caused the navigation event, used when emitting events</td>\n</tr>\n<tr>\n<td><code>strict</code></td>\n<td>If set to <code>true</code> and the URL doesn&#39;t match any route, then the navigation attempt must be ignored</td>\n</tr>\n<tr>\n<td><code>scroll</code></td>\n<td>When this is set to <code>false</code>, elements aren&#39;t scrolled into view after navigation</td>\n</tr>\n<tr>\n<td><code>force</code></td>\n<td>Unless this is set to <code>true</code>, navigation won&#39;t <em>fetch a model</em> if the route matches the current route, and <code>state.model</code> will be reused instead</td>\n</tr>\n<tr>\n<td><code>replaceState</code></td>\n<td>Use <code>replaceState</code> instead of <code>pushState</code> when changing history</td>\n</tr>\n</tbody>\n</table>\n<p>Note that the notion of <em>fetching a model</em> might be deceiving as the model could be pulled from the cache even if <code>force</code> is set to <code>true</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-route-url-\"><code>taunus.route(url)</code></h2>\n<p>This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.</p>\n<ul>\n<li>A fully qualified URL on the same origin, e.g <code>http://taunus.bevacqua.io/api</code></li>\n<li>An absolute URL without an origin, e.g <code>/api</code></li>\n<li>Just a hash, e.g <code>#foo</code> <em>(<code>location.href</code> is used)</em></li>\n<li>Falsy values, e.g <code>null</code> <em>(<code>location.href</code> is used)</em></li>\n</ul>\n<p>Relative URLs are not supported <em>(anything that doesn&#39;t have a leading slash)</em>, e.g <code>files/data.json</code>. Anything that&#39;s not on the same origin or doesn&#39;t match one of the registered routes is going to yield <code>null</code>.</p>\n<p><em>This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-taunus-route-equals-route-route-\"><code>taunus.route.equals(route, route)</code></h4>\n<p>Compares two routes and returns <code>true</code> if they would fetch the same model. Note that different URLs may still return <code>true</code>. For instance, <code>/foo</code> and <code>/foo#bar</code> would fetch the same model even if they&#39;re different URLs.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-state-\"><code>taunus.state</code></h2>\n<p>This is an internal state variable, and it contains a lot of useful debugging information.</p>\n<ul>\n<li><code>container</code> is the DOM element passed to <code>taunus.mount</code></li>\n<li><code>controllers</code> are all the controllers, as defined in the wiring module</li>\n<li><code>templates</code> are all the templates, as defined in the wiring module</li>\n<li><code>routes</code> are all the routes, as defined in the wiring module</li>\n<li><code>route</code> is a reference to the current route</li>\n<li><code>model</code> is a reference to the model used to render the current view</li>\n<li><code>prefetch</code> exposes whether prefetching is turned on</li>\n<li><code>cache</code> exposes whether caching is enabled</li>\n<li><code>version</code> exposes the version string that&#39;s currently in use</li>\n</ul>\n<p>Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-xhr-url-options-done-\"><code>taunus.xhr(url, options?, done)</code></h2>\n<p>This method allows you to issue your own AJAX requests through the <code>xhr</code> module. It sets a few convenient defaults, <em>listed below</em>, where <code>url</code> refers to the URL passed as the first parameter.</p>\n<pre><code class=\"lang-js\">{\n  url: url,\n  json: true,\n  headers: { Accept: &#39;application/json&#39; }\n}\n</code></pre>\n<p>The <code>done(err, body, res)</code> callback will be invoked when the request finishes, and it&#39;ll be passed three parameters, an optional error if something went wrong <em>(request failed, was aborted, etc.)</em> and a <code>body</code> parameter containing the response body. The raw <code>res</code> object that&#39;s typically provided by <a href=\"https://github.com/Raynos/xhr\"><code>xhr</code></a> as the second parameter is provided as the third parameter instead.</p>\n<p>As an example, here is a <code>GET</code> request.</p>\n<pre><code class=\"lang-js\">taunus.xhr(&#39;/api/places&#39;, function (err, body) {\n  console.log(body);\n  // &lt;- { places: [&#39;underwater fortress&#39;, &#39;island mansion&#39;] }\n});\n</code></pre>\n<p>Always remember to handle the case where <code>err</code> is set!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-controllers\">Client-Side Controllers</h1>\n<p>Client-side controllers are executed right after a view is rendered, even in the case of <a href=\"#-taunus-partial-container-action-model-\">partial views</a>. These controllers are used to progressively add behavior on top of the HTML for that view.</p>\n<p>View controllers take three parameters.</p>\n<table>\n<thead>\n<tr>\n<th>Parameter</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>model</code></td>\n<td>Model that was used to render the view</td>\n</tr>\n<tr>\n<td><code>container</code></td>\n<td>The DOM element where the view was rendered</td>\n</tr>\n<tr>\n<td><code>route?</code></td>\n<td>Route that triggered the rendering engine. May be <code>null</code></td>\n</tr>\n</tbody>\n</table>\n<p>Note that Taunus will <a href=\"#-taunus-on-type-fn-\">emit a <code>render</code> event</a> right before the view controller gets executed, giving you a chance to react to views getting rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-taunusrc-manifest\">The <code>.taunusrc</code> manifest</h1>\n<p>If you want to use values other than the conventional defaults shown in the table below, then you should create a <code>.taunusrc</code> file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your <code>package.json</code>, under the <code>taunus</code> property.</p>\n<pre><code class=\"lang-json\">{\n  &quot;views&quot;: &quot;.bin/views&quot;,\n  &quot;server_routes&quot;: &quot;controllers/routes.js&quot;,\n  &quot;server_controllers&quot;: &quot;controllers&quot;,\n  &quot;client_controllers&quot;: &quot;client/js/controllers&quot;,\n  &quot;client_wiring&quot;: &quot;.bin/wiring.js&quot;\n}\n</code></pre>\n<ul>\n<li>The <code>views</code> directory is where your views <em>(already compiled into JavaScript)</em> are placed. These views are used directly on both the server-side and the client-side</li>\n<li>The <code>server_routes</code> file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module</li>\n<li>The <code>server_controllers</code> directory is the root directory where your server-side controllers live. It&#39;s used when setting up the server-side router</li>\n<li>The <code>client_controllers</code> directory is where your client-side controller modules live. The CLI will <code>require</code> these controllers in its resulting wiring module</li>\n<li>The <code>client_wiring</code> file is where your wiring module will be placed by the CLI. You&#39;ll then have to <code>require</code> it in your application when booting up Taunus</li>\n</ul>\n<p>Here is where things get <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">a little conventional</a>. Views, and both server-side and client-side controllers are expected to be organized by following the <code>{root}/{controller}/{action}</code> pattern, but you could change that using <code>resolvers</code> when invoking the CLI and using the server-side API.</p>\n<p>Views and controllers are also expected to be CommonJS modules that export a single method.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    Taunus exposes _three different public APIs_, and there's also **plugins to integrate Taunus and an HTTP server**. This document covers all three APIs extensively. If you're concerned about the inner workings of Taunus, please refer to the [Getting Started][1] guide. This document aims to only cover how the public interface affects application state, but **doesn't delve into implementation details**.\n\n    # Table of Contents\n\n    - A [server-side API](#server-side-api) that deals with server-side rendering\n      - The [`taunus.mount`](#-taunus-mount-addroute-options-) method\n        - Its [`options`](#the-options-object) argument\n          - [`layout`](#-options-layout-)\n          - [`routes`](#-options-routes-)\n          - [`getDefaultViewModel`](#-options-getdefaultviewmodel-)\n          - [`plaintext`](#-options-plaintext-)\n          - [`resolvers`](#-options-resolvers-)\n          - [`version`](#-options-version-)\n        - Its [`addRoute`](#-addroute-definition-) argument\n      - The [`taunus.render`](#-taunus-render-action-viewmodel-req-res-next-) method\n      - The [`taunus.rebuildDefaultViewModel`](#-taunus-rebuilddefaultviewmodel-done-) method\n    - [Server-side controllers](#server-side-controllers)\n    - A [suite of plugins](#http-framework-plugins) can integrate Taunus and an HTTP server\n      - Using [`taunus-express`](#using-taunus-express-) for [Express][2]\n      - Using [`taunus-hapi`](#using-taunus-hapi-) for [Hapi][3]\n    - A [CLI that produces a wiring module](#command-line-interface) for the client-side\n      - The [`--output`](#-output-) flag\n      - The [`--watch`](#-watch-) flag\n      - The [`--transform <module>`](#-transform-module-) flag\n      - The [`--resolvers <module>`](#-resolvers-module-) flag\n      - The [`--standalone`](#-standalone-) flag\n    - A [client-side API](#client-side-api) that deals with client-side rendering\n      - The [`taunus.mount`](#-taunus-mount-container-wiring-options-) method\n        - Using the [`auto`](#using-the-auto-strategy) strategy\n        - Using the [`inline`](#using-the-inline-strategy) strategy\n        - Using the [`manual`](#using-the-manual-strategy) strategy\n        - [Caching](#caching)\n        - [Prefetching](#prefetching)\n        - [Versioning](#versioning)\n      - The [`taunus.on`](#-taunus-on-type-fn-) method\n      - The [`taunus.once`](#-taunus-once-type-fn-) method\n      - The [`taunus.off`](#-taunus-off-type-fn-) method\n      - The [`taunus.intercept`](#-taunus-intercept-action-fn-) method\n      - The [`taunus.partial`](#-taunus-partial-container-action-model-) method\n      - The [`taunus.navigate`](#-taunus-navigate-url-options-) method\n      - The [`taunus.route`](#-taunus-route-url-) method\n        - The [`taunus.route.equals`](#-taunus-route-equals-route-route-) method\n      - The [`taunus.state`](#-taunus-state-) property\n      - The [`taunus.xhr`](#-taunus-xhr-url-options-done-) method\n    - [Client-side controllers](#client-side-controllers)\n    - The [`.taunusrc`](#the-taunusrc-manifest) manifest\n\n    # Server-side API\n\n    The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, _including client-side rendering_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(addRoute, options?)`\n\n    Mounts Taunus on top of a server-side router, by registering each route in `options.routes` with the `addRoute` method.\n\n    > Note that most of the time, **this method shouldn't be invoked directly**, but rather through one of the [HTTP framework plugins](#http-framework-plugins) presented below.\n\n    Here's an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the `route` and `action` properties.\n\n    ```js\n    'use strict';\n\n    taunus.mount(addRoute, {\n      routes: [{ route: '/', action: 'home/index' }]\n    });\n\n    function addRoute (definition) {\n      app.get(definition.route, definition.action);\n    }\n    ```\n\n    Let's go over the options you can pass to `taunus.mount` first.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### The `options?` object\n\n    There's a few options that can be passed to the server-side mountpoint. You're probably going to be passing these to your [HTTP framework plugin](#http-framework-plugins), rather than using `taunus.mount` directly.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.layout?`\n\n    The `layout` property is expected to have the `function(data)` signature. It'll be invoked whenever a full HTML document needs to be rendered, and a `data` object will be passed to it. That object will contain everything you've set as the view model, plus a `partial` property containing the raw HTML of the rendered partial view. Your `layout` method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out [the `layout.jade` used in Pony Foo][4] as an example.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.routes`\n\n    The other big option is `routes`, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.\n\n    Here's an example route that uses the [Express][2] routing scheme.\n\n    ```js\n    {\n      route: '/articles/:slug',\n      action: 'articles/article',\n      ignore: false,\n      cache: <inherit>\n    }\n    ```\n\n    - `route` is a route in the format your HTTP framework of choice understands\n    - `action` is the name of your controller action. It'll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller\n    - `cache` can be used to determine the client-side caching behavior in this application path, and it'll default to inheriting from the options passed to `taunus.mount` _on the client-side_\n    - `ignore` is used in those cases where you want a URL to be ignored by the client-side router even if there's a catch-all route that would match that URL\n\n    As an example of the `ignore` use case, consider the routing table shown below. The client-side router doesn't know _(and can't know unless you point it out)_ what routes are server-side only, and it's up to you to point those out.\n\n    ```js\n    [\n      { route: '/', action: '/home/index' },\n      { route: '/feed', ignore: true },\n      { route: '/*', action: 'error/not-found' }\n    ]\n    ```\n\n    This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The `ignore` property is effectively telling the client-side _\"don't hijack links containing this URL\"_.\n\n    Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don't need to be `ignore`d.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getDefaultViewModel?`\n\n    The `getDefaultViewModel(done)` property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you're done creating a view model, you can invoke `done(null, model)`. If an error occurs while building the view model, you should call `done(err)` instead.\n\n    Taunus will throw an error if `done` is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases [the defaults can be rebuilt](#taunus-rebuilddefaultviewmodel).\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.plaintext?`\n\n    The `plaintext` options object is passed directly to [hget][5], and it's used to [tweak the plaintext version][6] of your site.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.resolvers?`\n\n    Resolvers are used to determine the location of some of the different pieces of your application. Typically you won't have to touch these in the slightest.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getServerController(action)` | Return path to server-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    The `addRoute` method passed to `taunus.mount` on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.version?`\n\n    Refer to the [Versioning](#versioning) section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `addRoute(definition)`\n\n    The `addRoute(definition)` method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework's router.\n\n    - `route` is the route that you set as `definition.route`\n    - `action` is the action as passed to the route definition\n    - `actionFn` will be the controller for this action method\n    - `middleware` will be an array of methods to be executed before `actionFn`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.render(action, viewModel, req, res, next)`\n\n    This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won't go very deep into it.\n\n    The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The `action` property determines the default view that will be rendered. The `viewModel` will be extended by [the default view model](#-options-getdefaultviewmodel-), and it may also override the default `action` by setting `viewModel.model.action`.\n\n    The `req`, `res`, and `next` arguments are expected to be the Express routing arguments, but they can also be mocked _(which is in fact what the Hapi plugin does)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.rebuildDefaultViewModel(done?)`\n\n    Once Taunus has been mounted, calling this method will rebuild the view model defaults using the `getDefaultViewModel` that was passed to `taunus.mount` in the options. An optional `done` callback will be invoked when the model is rebuilt.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Server-Side Controllers\n\n    On the server-side, controllers are modules that export a single function. The parameters passed to these controllers depend on the server-side HTTP framework that's being used.\n\n    For example, Express gives us three parameters: `req`, `res` and `next`. Hapi gives us two instead: `request` and `reply`.\n\n    Here's a sample controller using `taunus-express`, as [detailed below](#using-taunus-express-). This is a very simple controller where we are setting the special `viewModel` property on the response, and calling `next`. Suppose this controller is the `product/home` action handler.\n\n    ```js\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'view title'\n        }\n      };\n      next();\n    };\n    ```\n\n    As you can see, Taunus won't alter the API provided by Express. Instead, it builds upon the notion of using middleware. Once the `product/home` view is rendered and JavaScript loads, the `product/home` view controller is executed on the client-side.\n\n    You could change the view to be rendered by setting the `action` property on the `model`. In the example shown below this would mean that the `error/offline` view would be rendered. The client-side controller will be that of `error/offline`, as well. View controllers are tied to the view that gets rendered.\n\n    ```js\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'view title'\n        }\n      };\n      if (offline) {\n        res.viewModel.model.action = 'error/offline';\n      }\n      next();\n    };\n    ```\n\n    Having a default action and the ability to redirect to another gives us a lot of flexibility when determining how to respond to a request.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # HTTP Framework Plugins\n\n    There's currently two different HTTP frameworks _([Express][2] and [Hapi][3])_ that you can readily use with Taunus without having to deal with any of the route plumbing yourself.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-express`\n\n    The `taunus-express` plugin is probably the easiest to use, as Taunus was originally developed with just [Express][2] in mind. In addition to the options already outlined for [taunus.mount](#-taunus-mount-addroute-options-), you can add middleware for any route individually.\n\n    - `middleware` are any methods you want Taunus to execute as middleware in Express applications\n\n    To get `taunus-express` going you can use the following piece of code, provided that you come up with an `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      // ...\n    };\n\n    taunusExpress(taunus, app, options);\n    ```\n\n    The `taunusExpress` method will merely set up Taunus and add the relevant routes to your Express application by calling `app.get` a bunch of times. You can [find taunus-express on GitHub][7].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-hapi`\n\n    The `taunus-hapi` plugin is a bit more involved, and you'll have to create a Pack in order to use it. In addition to [the options we've already covered](#-taunus-mount-addroute-options-), you can add `config` on any route.\n\n    - `config` is passed directly into the route registered with Hapi, giving you the most flexibility\n\n    To get `taunus-hapi` going you can use the following piece of code, and you can bring your own `options` object.\n\n    ```js\n    'use strict';\n\n    var Hapi = require('hapi');\n    var taunus = require('taunus');\n    var taunusHapi = require('taunus-hapi')(taunus);\n    var pack = new Hapi.Pack();\n\n    pack.register({\n      plugin: taunusHapi,\n      options: {\n        // ...\n      }\n    });\n    ```\n\n    The `taunusHapi` plugin will mount Taunus and register all of the necessary routes. You can [find taunus-hapi on GitHub][8].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Command-Line Interface\n\n    Once you've set up the server-side to render your views using Taunus, it's only logical that you'll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.\n\n    The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.\n\n    Install it globally for development, but remember to use local copies for production-grade uses.\n\n    ```shell\n    npm install -g taunus\n    ```\n\n    When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.\n\n    ```shell\n    taunus\n    ```\n\n    By default, the output will be printed to the standard output, making for a fast debugging experience. Here's the output if you just had a single `home/index` route, and the matching view and client-side controller existed.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n      'home/index': require('../client/js/controllers/home/index.js')\n    };\n\n    var routes = [\n      {\n        route: '/',\n        action: 'home/index'\n      }\n    ];\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    You can use a few options to alter the outcome of invoking `taunus`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--output`\n\n    <sub>the `-o` alias is available</sub>\n\n    Output is written to a file instead of to standard output. The file path used will be the `client_wiring` option in [`.taunusrc`](#the-taunusrc-manifest), which defaults to `'.bin/wiring.js'`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--watch`\n\n    <sub>the `-w` alias is available</sub>\n\n    Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether `--output` was used.\n\n    The program won't exit.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--transform <module>`\n\n    <sub>the `-t` alias is available</sub>\n\n    This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the [`hapiify`][9] module.\n\n    ```shell\n    npm install hapiify\n    taunus -t hapiify\n    ```\n\n    Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--resolvers <module>`\n\n    <sub>the `-r` alias is available</sub>\n\n    Similarly to the [`resolvers`](#-options-resolvers-) option that you can pass to [`taunus.mount`](#-taunus-mount-addroute-options-), these resolvers can change the way in which file paths are resolved.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getClientController(action)` | Return path to client-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--standalone`\n\n    <sub>the `-s` alias is available</sub>\n\n    Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus [as a UMD module][10].\n\n    This would allow you to use Taunus on the client-side even if you don't want to use [Browserify][11] directly.\n\n    Feedback and suggestions about this flag, _and possible alternatives that would make Taunus easier to use_, are welcome.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-side API\n\n    Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(container, wiring, options?)`\n\n    The mountpoint takes a root container, the wiring module, and an options parameter. The `container` is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the `wiring` module exactly as built by the CLI, and no further configuration is necessary.\n\n    When the mountpoint executes, Taunus will configure its internal state, _set up the client-side router_, run the client-side controller for the server-side rendered view, and start hijacking links.\n\n    As an example, consider a browser makes a `GET` request for `/articles/the-fox` for the first time. Once `taunus.mount(container, wiring)` is invoked on the client-side, several things would happen in the order listed below.\n\n    - Taunus sets up the client-side view routing engine\n    - If enabled _(via `options`)_, the caching engine is configured\n    - Taunus obtains the view model _(more on this later)_\n    - When a view model is obtained, the `'start'` event is emitted\n    - Anchor links start being monitored for clicks _(at this point your application becomes a [SPA][13])_\n    - The `articles/article` client-side controller is executed\n\n    That's quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, _rather than on the server-side!_\n\n    In order to better understand the process, I'll walk you through the `options` parameter.\n\n    First off, the `bootstrap` option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: `auto` _(the default strategy)_, `inline`, or `manual`. The `auto` strategy involves the least work, which is why it's the default.\n\n    - `auto` will make an AJAX request for the view model\n    - `inline` expects you to place the model into a `<script type='text/taunus'>` tag\n    - `manual` expects you to get the view model however you want to, and then let Taunus know when it's ready\n\n    Let's go into detail about each of these strategies.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `auto` strategy\n\n    The `auto` strategy means that Taunus will make use of an AJAX request to obtain the view model. _You don't have to do anything else_ and this is the default strategy. This is the **most convenient strategy, but also the slowest** one.\n\n    It's slow because the view model won't be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and `taunus.mount` is invoked.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `inline` strategy\n\n    The `inline` strategy expects you to add a `data-taunus` attribute on the `container` element. This attribute must be equal to the `id` attribute of a `<script>` tag containing the serialized view model alongside the version information automatically injected by Taunus into the layout template data.\n\n    ```jade\n    div(data-taunus='model')!=partial\n    script(type='text/taunus', data-taunus='model')=JSON.stringify({ version: version, model: model })\n    ```\n\n    Pay special attention to the fact that the model is not only made into a JSON string, _but also HTML encoded by Jade_. When Taunus extracts the model from the `<script>` tag it'll unescape it, and then parse it as JSON.\n\n    This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.\n\n    That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `manual` strategy\n\n    The `manual` strategy is the most involved of the three, but also the most performant. In this strategy you're supposed to add the following _(seemingly pointless)_ snippet of code in a `<script>` other than the one that's pulling down Taunus, so that they are pulled concurrently rather than serially.\n\n    ```js\n    'use strict';\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n    ```\n\n    Once you somehow get your hands on the view model, you should invoke `taunusReady(model)`. Considering you'll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.\n\n    - The view model is loaded first, you call `taunusReady(model)` and wait for Taunus to take the model object and boot the application as soon as `taunus.mount` is executed\n    - Taunus loads first and `taunus.mount` is called first. In this case, Taunus will replace `window.taunusReady` with a special `boot` method. When the view model finishes loading, you call `taunusReady(model)` and the application finishes booting\n\n    > If this sounds a little mind-bending it's because it is. It's not designed to be pretty, but merely to be performant.\n\n    Now that we've addressed the awkward bits, let's cover the _\"somehow get your hands on the view model\"_ aspect. My preferred method is using JSONP, as it's able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you'll probably want this to be an inline script, keeping it small is important.\n\n    The good news is that the server-side supports JSONP out the box. Here's a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.\n\n    ```js\n    'use strict';\n\n    function inject (url) {\n      var script = document.createElement('script');\n      script.src = url;\n      document.body.appendChild(script);\n    }\n\n    function injector () {\n      var search = location.search;\n      var searchQuery = search ? '&' + search.substr(1) : '';\n      var searchJson = '?json&callback=taunusReady' + searchQuery;\n      inject(location.pathname + searchJson);\n    }\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n\n    injector();\n    ```\n\n    As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching\n\n    The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the `cache` flag in the options passed to `taunus.mount` on the client-side.\n\n    If you set `cache` to `true` then cached items will be considered _\"fresh\" (valid copies of the original)_ for **15 seconds**. You can also set `cache` to a number, and that number of seconds will be used as the default instead.\n\n    Caching can also be tweaked on individual routes. For instance, you could set `{ cache: true }` when mounting Taunus and then have `{ cache: 3600 }` on a route that you want to cache for a longer period of time.\n\n    The caching layer is _seamlessly integrated_ into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in [browsers that support IndexedDB][14]. In the case of browsers that don't support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Prefetching\n\n    If caching is enabled, the next logical step is prefetching. This is enabled just by adding `prefetch: true` to the options passed to `taunus.mount`. The prefetching feature will fire for any anchor link that's trips over a `mouseover` or a `touchstart` event. If a route matches the URL in the `href`, an AJAX request will prefetch the view and cache its contents, improving perceived performance.\n\n    When links are clicked before prefetching finishes, they'll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.\n\n    #### Versioning\n\n    When enabled, versioning will look out for discrepancies between what's currently on the client and what's on the server, and reload everything necessary to make what's on the client match what's on the server.\n\n    In order to turn it on, set the `version` field in the options when invoking `taunus.mount` **on both the server-side and the client-side, using the same value**. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.\n\n    > To make sure you don't forget to change the version string in one of the mountpoints, please create a JSON file with just the version string and `require` that file in both sides.\n    >\n    > ```shell\n    > echo '\"1.0.0\"' > version.json\n    > ```\n\n    The default version string is set to `1`. The Taunus version will be prepended to yours, resulting in a value such as `t3.0.0;v1` where Taunus is running version `3.0.0` and your application is running version `1`.\n\n    Refer to the Getting Started guide for a more detailed [analysis of the uses for versioning][15].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.on(type, fn)`\n\n    Taunus emits a series of events during its lifecycle, and `taunus.on` is the way you can tune in and listen for these events using a subscription function `fn`.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model, route`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model, route`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Consider for instance that you'd like to keep track of every view that gets rendered, and what DOM element it gets placed into. The piece of code below would quickly do that for us.\n\n    ```js\n    taunus.on('render', function (container) {\n      console.log('Rendered a view on', container);\n    });\n    ```\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.once(type, fn)`\n\n    This method is equivalent to [`taunus.on`](#-taunus-on-type-fn-), except the event listeners will be used once and then it'll be discarded.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.off(type, fn)`\n\n    Using this method you can remove any event listeners that were previously added using `.on` or `.once`. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling `.on` or `.once`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.intercept(action?, fn)`\n\n    This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified `action`. You can also add global interceptors by omitting the `action` parameter, or setting it to `*`.\n\n    An interceptor function will receive an `event` parameter, containing a few different properties.\n\n    - `url` contains the URL that needs a view model\n    - `route` contains the full route object as you'd get from [`taunus.route(url)`](#-taunus-route-url-)\n    - `parts` is just a shortcut for `route.parts`\n    - `preventDefault(model)` allows you to suppress the need for an AJAX request, commanding Taunus to use the model you've provided instead\n    - `defaultPrevented` tells you if some other handler has prevented the default behavior\n    - `canPreventDefault` tells you if invoking `event.preventDefault` will have any effect\n    - `model` starts as `null`, and it can later become the model passed to `preventDefault`\n\n    Interceptors are asynchronous, but if an interceptor spends longer than 200ms it'll be short-circuited and calling `event.preventDefault` past that point won't have any effect.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.partial(container, action, model)`\n\n    This method provides you with access to the view-rendering engine of Taunus. You can use it to render the `action` view into the `container` DOM element, using the specified `model`. Once the view is rendered, the `render` event will be fired _(with `container, model` as arguments)_ and the client-side controller for that view will be executed.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.navigate(url, options)`\n\n    Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use `taunus.navigate` passing it a plain URL or anything that would cause `taunus.route(url)` to return a valid route.\n\n    By default, if `taunus.navigate(url, options)` is called with an `url` that doesn't match any client-side route, then the user will be redirected via `location.href`. In cases where the browser doesn't support the history API, `location.href` will be used as well.\n\n    There's a few options you can use to tweak the behavior of `taunus.navigate`.\n\n    Option           | Description\n    -----------------|-------------------------------------------------------------------\n    `context`        | A DOM element that caused the navigation event, used when emitting events\n    `strict`         | If set to `true` and the URL doesn't match any route, then the navigation attempt must be ignored\n    `scroll`         | When this is set to `false`, elements aren't scrolled into view after navigation\n    `force`          | Unless this is set to `true`, navigation won't _fetch a model_ if the route matches the current route, and `state.model` will be reused instead\n    `replaceState`   | Use `replaceState` instead of `pushState` when changing history\n\n    Note that the notion of _fetching a model_ might be deceiving as the model could be pulled from the cache even if `force` is set to `true`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.route(url)`\n\n    This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.\n\n    - A fully qualified URL on the same origin, e.g `http://taunus.bevacqua.io/api`\n    - An absolute URL without an origin, e.g `/api`\n    - Just a hash, e.g `#foo` _(`location.href` is used)_\n    - Falsy values, e.g `null` _(`location.href` is used)_\n\n    Relative URLs are not supported _(anything that doesn't have a leading slash)_, e.g `files/data.json`. Anything that's not on the same origin or doesn't match one of the registered routes is going to yield `null`.\n\n    _This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `taunus.route.equals(route, route)`\n\n    Compares two routes and returns `true` if they would fetch the same model. Note that different URLs may still return `true`. For instance, `/foo` and `/foo#bar` would fetch the same model even if they're different URLs.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.state`\n\n    This is an internal state variable, and it contains a lot of useful debugging information.\n\n    - `container` is the DOM element passed to `taunus.mount`\n    - `controllers` are all the controllers, as defined in the wiring module\n    - `templates` are all the templates, as defined in the wiring module\n    - `routes` are all the routes, as defined in the wiring module\n    - `route` is a reference to the current route\n    - `model` is a reference to the model used to render the current view\n    - `prefetch` exposes whether prefetching is turned on\n    - `cache` exposes whether caching is enabled\n    - `version` exposes the version string that's currently in use\n\n    Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.xhr(url, options?, done)`\n\n    This method allows you to issue your own AJAX requests through the `xhr` module. It sets a few convenient defaults, _listed below_, where `url` refers to the URL passed as the first parameter.\n\n    ```js\n    {\n      url: url,\n      json: true,\n      headers: { Accept: 'application/json' }\n    }\n    ```\n\n    The `done(err, body, res)` callback will be invoked when the request finishes, and it'll be passed three parameters, an optional error if something went wrong _(request failed, was aborted, etc.)_ and a `body` parameter containing the response body. The raw `res` object that's typically provided by [`xhr`][16] as the second parameter is provided as the third parameter instead.\n\n    As an example, here is a `GET` request.\n\n    ```js\n    taunus.xhr('/api/places', function (err, body) {\n      console.log(body);\n      // <- { places: ['underwater fortress', 'island mansion'] }\n    });\n    ```\n\n    Always remember to handle the case where `err` is set!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-Side Controllers\n\n    Client-side controllers are executed right after a view is rendered, even in the case of [partial views](#-taunus-partial-container-action-model-). These controllers are used to progressively add behavior on top of the HTML for that view.\n\n    View controllers take three parameters.\n\n    Parameter   | Description\n    ------------|--------------------------\n    `model`     | Model that was used to render the view\n    `container` | The DOM element where the view was rendered\n    `route?`    | Route that triggered the rendering engine. May be `null`\n\n    Note that Taunus will [emit a `render` event](#-taunus-on-type-fn-) right before the view controller gets executed, giving you a chance to react to views getting rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The `.taunusrc` manifest\n\n    If you want to use values other than the conventional defaults shown in the table below, then you should create a `.taunusrc` file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your `package.json`, under the `taunus` property.\n\n    ```json\n    {\n      \"views\": \".bin/views\",\n      \"server_routes\": \"controllers/routes.js\",\n      \"server_controllers\": \"controllers\",\n      \"client_controllers\": \"client/js/controllers\",\n      \"client_wiring\": \".bin/wiring.js\"\n    }\n    ```\n\n    - The `views` directory is where your views _(already compiled into JavaScript)_ are placed. These views are used directly on both the server-side and the client-side\n    - The `server_routes` file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module\n    - The `server_controllers` directory is the root directory where your server-side controllers live. It's used when setting up the server-side router\n    - The `client_controllers` directory is where your client-side controller modules live. The CLI will `require` these controllers in its resulting wiring module\n    - The `client_wiring` file is where your wiring module will be placed by the CLI. You'll then have to `require` it in your application when booting up Taunus\n\n    Here is where things get [a little conventional][12]. Views, and both server-side and client-side controllers are expected to be organized by following the `{root}/{controller}/{action}` pattern, but you could change that using `resolvers` when invoking the CLI and using the server-side API.\n\n    Views and controllers are also expected to be CommonJS modules that export a single method.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: /getting-started\n    [2]: http://expressjs.com\n    [3]: http://hapijs.com\n    [4]: https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\n    [5]: https://github.com/bevacqua/hget\n    [6]: https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\n    [7]: https://github.com/taunus/taunus-express\n    [8]: https://github.com/taunus/taunus-hapi\n    [9]: https://github.com/taunus/hapiify\n    [10]: https://github.com/umdjs/umd\n    [11]: http://browserify.org\n    [12]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [13]: http://en.wikipedia.org/wiki/Single-page_application\n    [14]: http://caniuse.com/#feat=indexeddb\n    [15]: /getting-started#versioning\n    [16]: https://github.com/Raynos/xhr\n");
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
buf.push("<h1 id=\"complementary-modules\">Complementary Modules</h1>\n<p>Taunus is a small library by MVC framework standards, sitting <strong>below 15kB minified and gzipped</strong>. It is designed to be small. It is also designed to do one thing well, and that&#39;s <em>being a shared-rendering MVC engine</em>.</p>\n<p>Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you <a href=\"/api\">head over to the API documentation</a>, you&#39;ll notice that the server-side API, the command-line interface, and the <code>.taunusrc</code> manifest are only concerned with providing a conventional shared-rendering MVC engine.</p>\n<p>In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you&#39;re used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.</p>\n<blockquote>\n<p>In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.</p>\n</blockquote>\n<p>Taunus attempts to bring the server-side mentality of <em>&quot;not doing everything is okay&quot;</em> into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do <strong>one thing well</strong>.</p>\n<p>In this brief article we&#39;ll recommend a couple different libraries that play well with Taunus, and you&#39;ll also learn how to search for modules that can give you access to other functionality you may be interested in.</p>\n<h1 id=\"using-dominus-for-dom-querying\">Using <code>dominus</code> for DOM querying</h1>\n<p><a href=\"https://github.com/bevacqua/dominus\">Dominus</a> is an extra-small DOM querying library, currently clocking around <strong>4kB minified and gzipped</strong>, almost <em>ten times smaller</em> than it&#39;s competition. Unlike jQuery and popular friends, Dominus doesn&#39;t provide AJAX features, layout math, <code>&lt;form&gt;</code> manipulation, promises, tens of event binding methods, a selector engine written in plain JavaScript, nor a myriad of utility functions. Instead, Dominus focuses solely on providing a rich DOM querying and manipulation API that gets rid of inconsistencies across browsers.</p>\n<p>While the API isn&#39;t exactly compatible with jQuery, it is definitely familiar to the jQuery adept. Chaining, versatility, expressiveness, and raw power are all core concerns for Dominus. You&#39;ll find that Dominus has more consistently named methods, given that it was built with a concise API in mind.</p>\n<p>There&#39;s a few differences in semantics, and I believe that&#39;s a good thing. For instance, if you do <code>.value</code> on a checkbox or radio button you&#39;ll get back whether the input is checked. Similarly, if you call <code>.text</code> on the input you&#39;ll get the text back, which is most often what you wanted to get.</p>\n<pre><code class=\"lang-js\">var a = require(&#39;dominus&#39;);\nvar b = jQuery;\n\na(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, value: &#39;Foo&#39; }).text();\n// &lt;- &#39;Foo&#39;\n\na(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, checked: true }).value();\n// &lt;- true\n\nb(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, value: &#39;Foo&#39; }).text();\n// &lt;- &#39;&#39;\n\nb(&#39;&lt;input&gt;&#39;).attr({ type: &#39;radio&#39;, checked: true }).val();\n// &lt;- &#39;Foo&#39;\n</code></pre>\n<p>One of the best aspects of Dominus, <em>besides its small size</em>, is the fact that it extends native JavaScript arrays <em>(using <a href=\"https://github.com/bevacqua/poser\"><code>poser</code></a>)</em>. That means you have access to all of the <code>Array</code> functional methods on any <code>Dominus</code> collections, such as <code>.forEach</code>, <code>.map</code>, <code>.filter</code>, <code>.sort</code> and so on.</p>\n<p>Taunus doesn&#39;t make any extensive DOM manipulation <em>(nor querying)</em> and doesn&#39;t need to use Dominus, but it may find a home in your application.</p>\n<p>You can check out the <em>complete API documentation</em> for <code>dominus</code> on <a href=\"https://github.com/bevacqua/dominus\">its GitHub repository</a>.</p>\n<h1 id=\"using-xhr-to-make-ajax-requests\">Using <code>xhr</code> to make AJAX requests</h1>\n<p>A small program called <a href=\"https://github.com/Raynos/xhr\"><code>xhr</code></a> can be used to make AJAX requests and it&#39;s bundled with Taunus, because it needs it internally to communicate with the server. As such, it was trivial for Taunus to expose this engine and give you the ability to make AJAX calls of your own using it as well.</p>\n<p>You can check out <a href=\"/api#-taunus-xhr-url-options-done-\">the API documentation</a> for an explanation of how our interface to <code>xhr</code> works, or you could also <a href=\"https://github.com/Raynos/xhr\">see their API documentation</a> and use that directly instead.</p>\n<h1 id=\"complementing-your-code-with-small-modules\">Complementing your code with small modules</h1>\n<p>There&#39;s an infinite number of modules that do just one thing well and are eager to be part of your applications. Leverage the Internet to find what you need. Small libraries tend to be better documented, concise to use, and simpler.</p>\n<p>Here&#39;s a few examples of modules you could consider.</p>\n<ul>\n<li><a href=\"https://github.com/polymer/observe-js\"><code>observe-js</code></a> to get data-binding</li>\n<li><a href=\"https://github.com/Matt-Esch/virtual-dom\"><code>virtual-dom</code></a> to use a virtual DOM diffing algorithm a la <a href=\"https://github.com/facebook/react\">Facebook React</a></li>\n<li><a href=\"https://github.com/bevacqua/hint\"><code>hint</code></a> progressively enhances your HTML giving you more colorful tooltips</li>\n<li><a href=\"https://github.com/bevacqua/rome\"><code>rome</code></a> is a small calendar component</li>\n</ul>\n<p>You can look for relevant modules using <a href=\"http://browserifysearch.org/\">BrowserifySearch.org</a>, the <a href=\"https://www.npmjs.org/\"><code>npm</code> search</a>, asking around on Twitter, or just by Googling!</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Complementary Modules\n\n    Taunus is a small library by MVC framework standards, sitting **below 15kB minified and gzipped**. It is designed to be small. It is also designed to do one thing well, and that's _being a shared-rendering MVC engine_.\n\n    Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you [head over to the API documentation][1], you'll notice that the server-side API, the command-line interface, and the `.taunusrc` manifest are only concerned with providing a conventional shared-rendering MVC engine.\n\n    In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you're used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.\n\n    > In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.\n\n    Taunus attempts to bring the server-side mentality of _\"not doing everything is okay\"_ into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do **one thing well**.\n\n    In this brief article we'll recommend a couple different libraries that play well with Taunus, and you'll also learn how to search for modules that can give you access to other functionality you may be interested in.\n\n    # Using `dominus` for DOM querying\n\n    [Dominus][2] is an extra-small DOM querying library, currently clocking around **4kB minified and gzipped**, almost _ten times smaller_ than it's competition. Unlike jQuery and popular friends, Dominus doesn't provide AJAX features, layout math, `<form>` manipulation, promises, tens of event binding methods, a selector engine written in plain JavaScript, nor a myriad of utility functions. Instead, Dominus focuses solely on providing a rich DOM querying and manipulation API that gets rid of inconsistencies across browsers.\n\n    While the API isn't exactly compatible with jQuery, it is definitely familiar to the jQuery adept. Chaining, versatility, expressiveness, and raw power are all core concerns for Dominus. You'll find that Dominus has more consistently named methods, given that it was built with a concise API in mind.\n\n    There's a few differences in semantics, and I believe that's a good thing. For instance, if you do `.value` on a checkbox or radio button you'll get back whether the input is checked. Similarly, if you call `.text` on the input you'll get the text back, which is most often what you wanted to get.\n\n    ```js\n    var a = require('dominus');\n    var b = jQuery;\n\n    a('<input>').attr({ type: 'radio', value: 'Foo' }).text();\n    // <- 'Foo'\n\n    a('<input>').attr({ type: 'radio', checked: true }).value();\n    // <- true\n\n    b('<input>').attr({ type: 'radio', value: 'Foo' }).text();\n    // <- ''\n\n    b('<input>').attr({ type: 'radio', checked: true }).val();\n    // <- 'Foo'\n    ```\n\n    One of the best aspects of Dominus, _besides its small size_, is the fact that it extends native JavaScript arrays _(using [`poser`][5])_. That means you have access to all of the `Array` functional methods on any `Dominus` collections, such as `.forEach`, `.map`, `.filter`, `.sort` and so on.\n\n    Taunus doesn't make any extensive DOM manipulation _(nor querying)_ and doesn't need to use Dominus, but it may find a home in your application.\n\n    You can check out the _complete API documentation_ for `dominus` on [its GitHub repository][2].\n\n    # Using `xhr` to make AJAX requests\n\n    A small program called [`xhr`][4] can be used to make AJAX requests and it's bundled with Taunus, because it needs it internally to communicate with the server. As such, it was trivial for Taunus to expose this engine and give you the ability to make AJAX calls of your own using it as well.\n\n    You can check out [the API documentation][6] for an explanation of how our interface to `xhr` works, or you could also [see their API documentation][4] and use that directly instead.\n\n    # Complementing your code with small modules\n\n    There's an infinite number of modules that do just one thing well and are eager to be part of your applications. Leverage the Internet to find what you need. Small libraries tend to be better documented, concise to use, and simpler.\n\n    Here's a few examples of modules you could consider.\n\n    - [`observe-js`][7] to get data-binding\n    - [`virtual-dom`][8] to use a virtual DOM diffing algorithm a la [Facebook React][9]\n    - [`hint`][10] progressively enhances your HTML giving you more colorful tooltips\n    - [`rome`][11] is a small calendar component\n\n    You can look for relevant modules using [BrowserifySearch.org][13], the [`npm` search][14], asking around on Twitter, or just by Googling!\n\n    [1]: /api\n    [2]: https://github.com/bevacqua/dominus\n    [4]: https://github.com/Raynos/xhr\n    [5]: https://github.com/bevacqua/poser\n    [6]: /api#-taunus-xhr-url-options-done-\n    [7]: https://github.com/polymer/observe-js\n    [8]: https://github.com/Matt-Esch/virtual-dom\n    [9]: https://github.com/facebook/react\n    [10]: https://github.com/bevacqua/hint\n    [11]: https://github.com/bevacqua/rome\n    [12]: https://github.com/bevacqua/hint\n    [13]: http://browserifysearch.org/\n    [14]: https://www.npmjs.org/\n");
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
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#compiling-your-client-side-javascript\">Compiling your client-side JavaScript</a></li>\n<li><a href=\"#using-the-client-side-taunus-api\">Using the client-side Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n<li><a href=\"#versioning\">Versioning</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">mkdir getting-started\ncd getting-started\nnpm init\nnpm install --save taunus taunus-express express\n</code></pre>\n<p><img src=\"http://i.imgur.com/4P8vNe9.png\" alt=\"Screenshot with `npm init` output\"></p>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/n8mH4mN.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>routes</code> should be an array of view routes</li>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that <a href=\"/api\">in the API documentation</a>, but it defaults to <code>{}</code>)</em>.</p>\n<p>Here&#39;s what you&#39;d get if you attempted to run the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/08lnCec.png\" alt=\"Screenshot with `node app` results\"></p>\n<p>Turns out you&#39;re missing a lot of things! Taunus is quite lenient and it&#39;ll try its best to let you know what you might be missing, though. Apparently you don&#39;t have a layout, a server-side controller, or even a view! <em>That&#39;s rough.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;use the following combination of plain text and the <strong>(maybe HTML)</strong> partial view&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return &#39;This is the partial: &quot;&#39; + model.partial + &#39;&quot;&#39;;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Here&#39;s what you&#39;d get if you ran the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/wUbnCyk.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>At this point we have a layout, but we&#39;re still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you&#39;re trying to get an MVC engine up and running, right?</p>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">mkdir -p views/home\ntouch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install --global jadum\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/zjaJYCq.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>Granted, you should <em>probably</em> move the layout into a Jade <em>(any view engine will do)</em> template as well.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">mkdir -p controllers/home\ntouch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template!</p>\n<pre><code class=\"lang-shell\">rm layout.js\ntouch views/layout.jade\njadum views/** --output .bin\n</code></pre>\n<p>You should also remember to update the <code>app.js</code> module once again!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The <code>!=</code> syntax below means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/NvEWx9z.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>You can now visit <code>localhost:3000</code> with your favorite web browser and you&#39;ll notice that the view renders as you&#39;d expect. The title will be properly set, and a <code>&lt;main&gt;</code> element will have the contents of your view.</p>\n<p><img src=\"http://i.imgur.com/LgZRFn5.png\" alt=\"Screenshot with application running on Google Chrome\"></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>Then there&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install --global taunus\n</code></pre>\n<p>Before you can use the CLI, you should move the route definitions to <code>controllers/routes.js</code>. That&#39;s where Taunus expects them to be. If you want to place them something else, <a href=\"/api\">the API documentation can help you</a>.</p>\n<pre><code class=\"lang-shell\">mv routes.js controllers/routes.js\n</code></pre>\n<p>Since you moved the routes you should also update the <code>require</code> statement in the <code>app.js</code> module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;),\n  &#39;layout&#39;: require(&#39;./views/layout.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = [\n  {\n    route: &#39;/&#39;,\n    action: &#39;home/index&#39;\n  }\n];\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p><img src=\"http://i.imgur.com/fIEe5Tm.png\" alt=\"Screenshot with `taunus` output\"></p>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<blockquote>\n<p><strong>The CLI can be entirely ignored</strong>. You could write these definitions by yourself, but you would have to remember to update the wiring module whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n</blockquote>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use <code>client/js</code> to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let&#39;s stick to the conventions.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js\ntouch client/js/main.js\n</code></pre>\n<p>The <code>main</code> module will be used as the <em>entry point</em> of your application on the client-side. Here you&#39;ll need to import <code>taunus</code>, the wiring module we&#39;ve just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke <code>taunus.mount</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar wiring = require(&#39;../../.bin/wiring&#39;);\nvar main = document.getElementsByTagName(&#39;main&#39;)[0];\n\ntaunus.mount(main, wiring);\n</code></pre>\n<p>The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.</p>\n<p>By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won&#39;t be functional until the client-side controller runs.</p>\n<p>An alternative is to inline the view model alongside the views in a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag, but this tends to slow down the initial response (models are <em>typically larger</em> than the resulting views).</p>\n<p>A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that&#39;s harder to set up.</p>\n<p>The three booting strategies are explained in <a href=\"/api\">the API documentation</a> and further discussed in <a href=\"/performance\">the optimization guide</a>. For now, the default strategy <em>(<code>&#39;auto&#39;</code>)</em> should suffice. It fetches the view model using an AJAX request right after Taunus loads.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>Client-side controllers run whenever a view is rendered, even if it&#39;s a partial. The controller is passed the <code>model</code>, containing the model that was used to render the view; the <code>route</code>, broken down into its components; and the <code>container</code>, which is whatever DOM element the view was rendered into.</p>\n<p>These controllers are entirely optional, which makes sense since we&#39;re progressively enhancing the application: it might not even be necessary! Let&#39;s add some client-side functionality to the example we&#39;ve been building.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js/controllers/home\ntouch client/js/controllers/home/index.js\n</code></pre>\n<p>Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we&#39;ll just print the action and the model to the console. If there&#39;s one place where you&#39;d want to enhance the experience, client-side controllers are where you want to put your code.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model, container, route) {\n  console.log(&#39;Rendered view %s using model:\\n%s&#39;, route.action, JSON.stringify(model, null, 2));\n};\n</code></pre>\n<p>Since we weren&#39;t using the <code>--watch</code> flag from the Taunus CLI, you&#39;ll have to recompile the wiring at this point, so that the controller gets added to that manifest.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>Of course, you&#39;ll now have to wire up the client-side JavaScript using <a href=\"http://browserify.org/\">Browserify</a>!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"compiling-your-client-side-javascript\">Compiling your client-side JavaScript</h4>\n<p>You&#39;ll need to compile the <code>client/js/main.js</code> module, our client-side application&#39;s entry point, using Browserify since the code is written using CommonJS. In this example you&#39;ll install <code>browserify</code> globally to compile the code, but naturally you&#39;ll install it locally when working on a real-world application.</p>\n<pre><code class=\"lang-shell\">npm install --global browserify\n</code></pre>\n<p>Once you have the Browserify CLI, you&#39;ll be able to compile the code right from your command line. The <code>-d</code> flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The <code>-o</code> flag redirects output to the indicated file, whereas the output is printed to standard output by default.</p>\n<pre><code class=\"lang-shell\">mkdir -p .bin/public/js\nbrowserify client/js/main.js -do .bin/public/js/all.js\n</code></pre>\n<p>We haven&#39;t done much of anything with the Express application, so you&#39;ll need to adjust the <code>app.js</code> module to serve static assets. If you&#39;re used to Express, you&#39;ll notice there&#39;s nothing special about how we&#39;re using <code>serve-static</code>.</p>\n<pre><code class=\"lang-shell\">npm install --save serve-static\n</code></pre>\n<p>Let&#39;s configure the application to serve static assets from <code>.bin/public</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar serveStatic = require(&#39;serve-static&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\napp.use(serveStatic(&#39;.bin/public&#39;));\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Next up, you&#39;ll have to edit the layout to include the compiled JavaScript bundle file.</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\nscript(src=&#39;/js/all.js&#39;)\n</code></pre>\n<p>Lastly, you can execute the application and see it in action!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/68O84wX.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>If you open the application on a web browser, you&#39;ll notice that the appropriate information will be logged into the developer <code>console</code>.</p>\n<p><img src=\"http://i.imgur.com/ZUF6NFl.png\" alt=\"Screenshot with the application running under Google Chrome\"></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-client-side-taunus-api\">Using the client-side Taunus API</h4>\n<p>Taunus does provide <a href=\"/api\">a thin API</a> in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there&#39;s a few methods you can take advantage of on a global scale as well.</p>\n<p>Taunus can notify you whenever important events occur.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Besides events, there&#39;s a couple more methods you can use. The <code>taunus.navigate</code> method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there&#39;s <code>taunus.partial</code>, and that allows you to render any partial view on a DOM element of your choosing, and it&#39;ll then invoke its controller. You&#39;ll need to come up with the model yourself, though.</p>\n<p>Astonishingly, the API is further documented in <a href=\"/api\">the API documentation</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p><a href=\"/performance\">Performance</a> plays an important role in Taunus. That&#39;s why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?</p>\n<p>When turned on, by passing <code>{ cache: true }</code> as the third parameter for <code>taunus.mount</code>, the caching layer will make sure that responses are kept around for <code>15</code> seconds. Whenever a route needs a model in order to render a view, it&#39;ll first ask the caching layer for a fresh copy. If the caching layer doesn&#39;t have a copy, or if that copy is stale <em>(in this case, older than <code>15</code> seconds)</em>, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set <code>cache</code> to a number in seconds instead of just <code>true</code>.</p>\n<p>Since Taunus understands that not every view operates under the same constraints, you&#39;re also able to set a <code>cache</code> freshness duration directly in your routes. The <code>cache</code> property in routes has precedence over the default value.</p>\n<p>There&#39;s currently two caching stores: a raw in-memory store, and an <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">IndexedDB</a> store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of <code>localStorage</code>. It has <a href=\"http://caniuse.com/#feat=indexeddb\">surprisingly broad browser support</a>, and in the cases where it&#39;s not supported then caching is done solely in-memory.</p>\n<p>The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them <em>(the <code>touchstart</code> event)</em>, the prefetcher will issue an AJAX request for the view model for that link.</p>\n<p>If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their <em>(possibly limited)</em> Internet connection bandwidth.</p>\n<p>If the human clicks on the link before prefetching is completed, he&#39;ll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.</p>\n<p>Turning prefetching on is simply a matter of setting <code>prefetch</code> to <code>true</code> in the options passed to <code>taunus.mount</code>. For additional insights into the performance improvements Taunus can offer, head over to the <a href=\"/performance\">Performance Optimizations</a> guide.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"versioning\">Versioning</h4>\n<p>When you alter your views, change controllers, or modify the models, chances are the client-side is going to come across one of the following issues.</p>\n<ul>\n<li>Outdated view template functions in the client-side, causing new models to break</li>\n<li>Outdated client-side controllers, causing new models to break or miss out on functionality</li>\n<li>Outdated models in the cache, causing new views or controllers to break</li>\n</ul>\n<p>Versioning handles these issues gracefully on your behalf. The way it works is that whenever you get a response from Taunus, a <em>version string (configured on the server-side)</em> is included with it. If that version string doesn&#39;t match the one stored in the client, then the cache will be flushed and the human will be redirected, forcing a full page reload.</p>\n<blockquote>\n<p>The versioning API is unable to handle changes to routes, and it&#39;s up to you to make sure that the application stays backwards compatible when it comes to routing.</p>\n<p>Versioning can&#39;t intervene when the client-side is heavily relying on cached views and models, and the human is refusing to reload their browser. The server isn&#39;t being accessed and thus it can&#39;t communicate that everything on the cache may have become stale. The good news is that the human won&#39;t notice any oddities, as the site will continue to work as he knows it. When he finally attempts to visit something that isn&#39;t cached, a request is made, and the versioning engine resolves version discrepancies for them.</p>\n</blockquote>\n<p>Making use of versioning involves setting the <code>version</code> field in the options, when invoking <code>taunus.mount</code> <strong>on both the server-side and the client-side, using the same value</strong>. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.</p>\n<p>You may use your build identifier or the <code>version</code> field in <code>package.json</code>, but understand that it may cause the client-side to flush the cache too often <em>(maybe even on every deployment)</em>.</p>\n<p>The default version string is set to <code>1</code>. The Taunus version will be prepended to yours, resulting in a value such as <code>t3.0.0;v1</code> where Taunus is running version <code>3.0.0</code> and your application is running version <code>1</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<blockquote>\n<p>You&#39;ll find a <a href=\"https://github.com/taunus/getting-started\">full fledged version of the Getting Started</a> tutorial application on GitHub.</p>\n</blockquote>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Your first route](#your-first-route)\n      - [Creating a layout](#creating-a-layout)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Compiling your client-side JavaScript](#compiling-your-client-side-javascript)\n      - [Using the client-side Taunus API](#using-the-client-side-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n      - [Versioning](#versioning)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    mkdir getting-started\n    cd getting-started\n    npm init\n    npm install --save taunus taunus-express express\n    ```\n\n    ![Screenshot with `npm init` output][30]\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][31]\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `routes` should be an array of view routes\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that [in the API documentation][18], but it defaults to `{}`)_.\n\n    Here's what you'd get if you attempted to run the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` results][32]\n\n    Turns out you're missing a lot of things! Taunus is quite lenient and it'll try its best to let you know what you might be missing, though. Apparently you don't have a layout, a server-side controller, or even a view! _That's rough._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"use the following combination of plain text and the **(maybe HTML)** partial view\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return 'This is the partial: \"' + model.partial + '\"';\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Here's what you'd get if you ran the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][33]\n\n    At this point we have a layout, but we're still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you're trying to get an MVC engine up and running, right?\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    mkdir -p views/home\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install --global jadum\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][34]\n\n    Granted, you should _probably_ move the layout into a Jade _(any view engine will do)_ template as well.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    mkdir -p controllers/home\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template!\n\n    ```shell\n    rm layout.js\n    touch views/layout.jade\n    jadum views/** --output .bin\n    ```\n\n    You should also remember to update the `app.js` module once again!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The `!=` syntax below means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][35]\n\n    You can now visit `localhost:3000` with your favorite web browser and you'll notice that the view renders as you'd expect. The title will be properly set, and a `<main>` element will have the contents of your view.\n\n    ![Screenshot with application running on Google Chrome][36]\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    Then there's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install --global taunus\n    ```\n\n    Before you can use the CLI, you should move the route definitions to `controllers/routes.js`. That's where Taunus expects them to be. If you want to place them something else, [the API documentation can help you][18].\n\n    ```shell\n    mv routes.js controllers/routes.js\n    ```\n\n    Since you moved the routes you should also update the `require` statement in the `app.js` module.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js'),\n      'layout': require('./views/layout.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = [\n      {\n        route: '/',\n        action: 'home/index'\n      }\n    ];\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    ![Screenshot with `taunus` output][37]\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    > **The CLI can be entirely ignored**. You could write these definitions by yourself, but you would have to remember to update the wiring module whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use `client/js` to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let's stick to the conventions.\n\n    ```shell\n    mkdir -p client/js\n    touch client/js/main.js\n    ```\n\n    The `main` module will be used as the _entry point_ of your application on the client-side. Here you'll need to import `taunus`, the wiring module we've just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke `taunus.mount`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var wiring = require('../../.bin/wiring');\n    var main = document.getElementsByTagName('main')[0];\n\n    taunus.mount(main, wiring);\n    ```\n\n    The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.\n\n    By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won't be functional until the client-side controller runs.\n\n    An alternative is to inline the view model alongside the views in a `<script type='text/taunus'>` tag, but this tends to slow down the initial response (models are _typically larger_ than the resulting views).\n\n    A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that's harder to set up.\n\n    The three booting strategies are explained in [the API documentation][18] and further discussed in [the optimization guide][25]. For now, the default strategy _(`'auto'`)_ should suffice. It fetches the view model using an AJAX request right after Taunus loads.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    Client-side controllers run whenever a view is rendered, even if it's a partial. The controller is passed the `model`, containing the model that was used to render the view; the `route`, broken down into its components; and the `container`, which is whatever DOM element the view was rendered into.\n\n    These controllers are entirely optional, which makes sense since we're progressively enhancing the application: it might not even be necessary! Let's add some client-side functionality to the example we've been building.\n\n    ```shell\n    mkdir -p client/js/controllers/home\n    touch client/js/controllers/home/index.js\n    ```\n\n    Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we'll just print the action and the model to the console. If there's one place where you'd want to enhance the experience, client-side controllers are where you want to put your code.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model, container, route) {\n      console.log('Rendered view %s using model:\\n%s', route.action, JSON.stringify(model, null, 2));\n    };\n    ```\n\n    Since we weren't using the `--watch` flag from the Taunus CLI, you'll have to recompile the wiring at this point, so that the controller gets added to that manifest.\n\n    ```shell\n    taunus --output\n    ```\n\n    Of course, you'll now have to wire up the client-side JavaScript using [Browserify][38]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Compiling your client-side JavaScript\n\n    You'll need to compile the `client/js/main.js` module, our client-side application's entry point, using Browserify since the code is written using CommonJS. In this example you'll install `browserify` globally to compile the code, but naturally you'll install it locally when working on a real-world application.\n\n    ```shell\n    npm install --global browserify\n    ```\n\n    Once you have the Browserify CLI, you'll be able to compile the code right from your command line. The `-d` flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The `-o` flag redirects output to the indicated file, whereas the output is printed to standard output by default.\n\n    ```shell\n    mkdir -p .bin/public/js\n    browserify client/js/main.js -do .bin/public/js/all.js\n    ```\n\n    We haven't done much of anything with the Express application, so you'll need to adjust the `app.js` module to serve static assets. If you're used to Express, you'll notice there's nothing special about how we're using `serve-static`.\n\n    ```shell\n    npm install --save serve-static\n    ```\n\n    Let's configure the application to serve static assets from `.bin/public`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var serveStatic = require('serve-static');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    app.use(serveStatic('.bin/public'));\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Next up, you'll have to edit the layout to include the compiled JavaScript bundle file.\n\n    ```jade\n    title=model.title\n    main!=partial\n    script(src='/js/all.js')\n    ```\n\n    Lastly, you can execute the application and see it in action!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][39]\n\n    If you open the application on a web browser, you'll notice that the appropriate information will be logged into the developer `console`.\n\n    ![Screenshot with the application running under Google Chrome][40]\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the client-side Taunus API\n\n    Taunus does provide [a thin API][18] in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there's a few methods you can take advantage of on a global scale as well.\n\n    Taunus can notify you whenever important events occur.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Besides events, there's a couple more methods you can use. The `taunus.navigate` method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there's `taunus.partial`, and that allows you to render any partial view on a DOM element of your choosing, and it'll then invoke its controller. You'll need to come up with the model yourself, though.\n\n    Astonishingly, the API is further documented in [the API documentation][18].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    [Performance][25] plays an important role in Taunus. That's why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?\n\n    When turned on, by passing `{ cache: true }` as the third parameter for `taunus.mount`, the caching layer will make sure that responses are kept around for `15` seconds. Whenever a route needs a model in order to render a view, it'll first ask the caching layer for a fresh copy. If the caching layer doesn't have a copy, or if that copy is stale _(in this case, older than `15` seconds)_, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set `cache` to a number in seconds instead of just `true`.\n\n    Since Taunus understands that not every view operates under the same constraints, you're also able to set a `cache` freshness duration directly in your routes. The `cache` property in routes has precedence over the default value.\n\n    There's currently two caching stores: a raw in-memory store, and an [IndexedDB][28] store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of `localStorage`. It has [surprisingly broad browser support][29], and in the cases where it's not supported then caching is done solely in-memory.\n\n    The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them _(the `touchstart` event)_, the prefetcher will issue an AJAX request for the view model for that link.\n\n    If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their _(possibly limited)_ Internet connection bandwidth.\n\n    If the human clicks on the link before prefetching is completed, he'll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.\n\n    Turning prefetching on is simply a matter of setting `prefetch` to `true` in the options passed to `taunus.mount`. For additional insights into the performance improvements Taunus can offer, head over to the [Performance Optimizations][25] guide.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Versioning\n\n    When you alter your views, change controllers, or modify the models, chances are the client-side is going to come across one of the following issues.\n\n    - Outdated view template functions in the client-side, causing new models to break\n    - Outdated client-side controllers, causing new models to break or miss out on functionality\n    - Outdated models in the cache, causing new views or controllers to break\n\n    Versioning handles these issues gracefully on your behalf. The way it works is that whenever you get a response from Taunus, a _version string (configured on the server-side)_ is included with it. If that version string doesn't match the one stored in the client, then the cache will be flushed and the human will be redirected, forcing a full page reload.\n\n    > The versioning API is unable to handle changes to routes, and it's up to you to make sure that the application stays backwards compatible when it comes to routing.\n    >\n    > Versioning can't intervene when the client-side is heavily relying on cached views and models, and the human is refusing to reload their browser. The server isn't being accessed and thus it can't communicate that everything on the cache may have become stale. The good news is that the human won't notice any oddities, as the site will continue to work as he knows it. When he finally attempts to visit something that isn't cached, a request is made, and the versioning engine resolves version discrepancies for them.\n\n    Making use of versioning involves setting the `version` field in the options, when invoking `taunus.mount` **on both the server-side and the client-side, using the same value**. The Taunus version string will be added to the one you provided, so that Taunus will know to stay alert for changes to Taunus itself, as well.\n\n    You may use your build identifier or the `version` field in `package.json`, but understand that it may cause the client-side to flush the cache too often _(maybe even on every deployment)_.\n\n    The default version string is set to `1`. The Taunus version will be prepended to yours, resulting in a value such as `t3.0.0;v1` where Taunus is running version `3.0.0` and your application is running version `1`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    > You'll find a [full fledged version of the Getting Started][41] tutorial application on GitHub.\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n    [28]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [29]: http://caniuse.com/#feat=indexeddb\n    [30]: http://i.imgur.com/4P8vNe9.png\n    [31]: http://i.imgur.com/n8mH4mN.png\n    [32]: http://i.imgur.com/08lnCec.png\n    [33]: http://i.imgur.com/wUbnCyk.png\n    [34]: http://i.imgur.com/zjaJYCq.png\n    [35]: http://i.imgur.com/NvEWx9z.png\n    [36]: http://i.imgur.com/LgZRFn5.png\n    [37]: http://i.imgur.com/fIEe5Tm.png\n    [38]: http://browserify.org/\n    [39]: http://i.imgur.com/68O84wX.png\n    [40]: http://i.imgur.com/ZUF6NFl.png\n    [41]: https://github.com/taunus/getting-started\n");
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
buf.push("<h1 id=\"performance-optimization\">Performance Optimization</h1>\n<p>Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on the site as well.</p>\n<p>There&#39;s a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.</p>\n<h1 id=\"performance-checklist\">Performance Checklist</h1>\n<p>If you haven&#39;t, you should read <a href=\"http://ponyfoo.com/articles/critical-path-performance-optimization\">&quot;Critical Path Performance Optimization&quot;</a> as a small guide of performance optimizations you should already be doing. The list below contains some of what&#39;s discussed in that article.</p>\n<ul>\n<li>Move away from dedicated client-side rendering</li>\n<li>Use <a href=\"http://nginx.org/\"><code>nginx</code></a> as a reverse proxy for your front-end servers</li>\n<li>Resize and optimize images</li>\n<li>Defer non-critical static asset loading</li>\n<li>Inline critical CSS and JavaScript</li>\n<li>Cache responses aggressively</li>\n<li>Ditch large libraries and frameworks</li>\n</ul>\n<h1 id=\"boosting-performance-with-taunus\">Boosting Performance with Taunus</h1>\n<p>When it comes to Taunus, there&#39;s a few more performance tweaks you should consider implementing.</p>\n<ul>\n<li>Choose the right boot strategy</li>\n<li>Turn on client-side caching</li>\n<li>Enable prefetching for predictive cache loading</li>\n<li>Use versioning to ensure cache relevance</li>\n<li>Send views and controllers to the client selectively</li>\n</ul>\n<p>Given that this site is about Taunus, we&#39;ll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.</p>\n<h1 id=\"choose-the-right-boot-strategy\">Choose the right boot strategy</h1>\n<h1 id=\"turn-on-client-side-caching\">Turn on client-side caching</h1>\n<h1 id=\"enable-prefetching-for-predictive-cache-loading\">Enable prefetching for predictive cache loading</h1>\n<h1 id=\"use-versioning-to-ensure-cache-relevance\">Use versioning to ensure cache relevance</h1>\n<h1 id=\"send-views-and-controllers-to-the-client-selectively\">Send views and controllers to the client selectively</h1>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Performance Optimization\n\n    Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on the site as well.\n\n    There's a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.\n\n    # Performance Checklist\n\n    If you haven't, you should read [\"Critical Path Performance Optimization\"][1] as a small guide of performance optimizations you should already be doing. The list below contains some of what's discussed in that article.\n\n    - Move away from dedicated client-side rendering\n    - Use [`nginx`][2] as a reverse proxy for your front-end servers\n    - Resize and optimize images\n    - Defer non-critical static asset loading\n    - Inline critical CSS and JavaScript\n    - Cache responses aggressively\n    - Ditch large libraries and frameworks\n\n    # Boosting Performance with Taunus\n\n    When it comes to Taunus, there's a few more performance tweaks you should consider implementing.\n\n    - Choose the right boot strategy\n    - Turn on client-side caching\n    - Enable prefetching for predictive cache loading\n    - Use versioning to ensure cache relevance\n    - Send views and controllers to the client selectively\n\n    Given that this site is about Taunus, we'll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.\n\n    # Choose the right boot strategy\n    # Turn on client-side caching\n    # Enable prefetching for predictive cache loading\n    # Use versioning to ensure cache relevance\n    # Send views and controllers to the client selectively\n\n    [1]: http://ponyfoo.com/articles/critical-path-performance-optimization\n    [2]: http://nginx.org/\n");
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
    resolved(state.model);
    return;
  }

  if (!modern) {
    location.href = url;
    return;
  }

  fetcher.abortPending();
  fetcher(route, { element: context, source: 'intent' }, maybeResolved);

  function maybeResolved (err, data) {
    if (err) {
      return;
    }
    if (data.version !== state.version) {
      location.href = url; // version change demands fallback to strict navigation
      return;
    }
    resolved(data.model);
  }

  function resolved (model) {
    navigation(route, model, direction);
    partial(state.container, null, model, route);
    scrollInto(id(route.parts.hash), o.scroll);
  }
}

function start (data) {
  if (data.version !== state.version) {
    location.reload(); // version may change between Taunus loading and a model becoming available
    return;
  }
  var model = data.model;
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

},{"../versioning":68,"./clone":38,"./emitter":39,"./fetcher":41,"./nativeFn":47,"./partial":49,"./router":50,"./state":51,"raf":33}],36:[function(require,module,exports){
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
      version: state.version,
      expires: Date.now() + duration
    });
  }
}

module.exports = {
  get: get,
  set: set
};

},{"../versioning":68,"./clone":38,"./once":48,"./state":51,"./stores/idb":52,"./stores/raw":53}],37:[function(require,module,exports){
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

function getModelKey (route) {
  return 'model:/' + route.parts.pathname + e(route.parts.query);
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
  cache.get(getModelKey(e.route), result);

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
  var freshness = parseDuration(d) * 1000;
  if (data.model) {
    cache.set(getModelKey(route), v(data, 'model'), freshness);
  }
}

function v (data, key) {
  var result = { version: data.version };
  result[key] = data[key];
  return result;
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
      if (data && data.version) {
        state.version = data.version; // sync version expectation with server-side
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
var xhr = require('./xhr');

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
  route: router,
  xhr: xhr
};

},{"./activator":35,"./emitter":39,"./hooks":42,"./interceptor":44,"./mount":46,"./partial":49,"./router":50,"./state":51,"./xhr":55}],44:[function(require,module,exports){
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

  function resolved () {
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
},{"../versioning":68,"./activator":35,"./caching":37,"./fetcher":41,"./router":50,"./state":51,"./unescape":54}],47:[function(require,module,exports){
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

},{"fast-url-parser":58,"routes":59}],51:[function(require,module,exports){
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
var dbName = 'taunus';
var store = 'wildstore';
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
  var req = xhr(options, handle);

  return req;

  function overwrite (prop) {
    options[prop] = o[prop];
  }

  function handle (err, res, body) {
    if (err && !req.getAllResponseHeaders()) {
      done(new Error('aborted'), null, res);
    } else {
      done(err, body, res);
    }
  }
}

module.exports = request;

},{"xhr":60}],56:[function(require,module,exports){
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
},{}],60:[function(require,module,exports){
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

},{"global/window":61,"once":62,"parse-headers":66}],61:[function(require,module,exports){
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
},{}],62:[function(require,module,exports){
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

},{}],63:[function(require,module,exports){
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

},{"is-function":64}],64:[function(require,module,exports){
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

},{}],65:[function(require,module,exports){

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

},{}],66:[function(require,module,exports){
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
},{"for-each":63,"trim":65}],67:[function(require,module,exports){
module.exports="2.8.6"
},{}],68:[function(require,module,exports){
'use strict';

var t = require('./version.json');

function get (v) {
  return 't' + t + ';v' + v;
}

module.exports = {
  get: get
};

},{"./version.json":67}]},{},[16])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvY29udmVudGlvbnMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9tYWluLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvdGhyb3R0bGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL25vZGVfbW9kdWxlcy9wb3Nlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvbm9kZV9tb2R1bGVzL3Bvc2VyL3NyYy9icm93c2VyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9ub2RlX21vZHVsZXMvc2VrdG9yL3NyYy9zZWt0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLmN0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLnByb3RvdHlwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2NsYXNzZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9jb3JlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9tLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9taW51cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3B1YmxpYy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3Rlc3QuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy90ZXh0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vbm9kZV9tb2R1bGVzL2phZGUvcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvYWN0aXZhdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoaW5nLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2xvbmUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZXZlbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZmV0Y2hlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2hvb2tzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pbnRlcmNlcHRvci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2xpbmtzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbW91bnQuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9uYXRpdmVGbi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9wYXJ0aWFsLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcm91dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RhdGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdG9yZXMvaWRiLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL3Jhdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3VuZXNjYXBlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIveGhyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvc3JjL2NvbnRyYS5lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9mYXN0LXVybC1wYXJzZXIvc3JjL3VybHBhcnNlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcm91dGVzL2Rpc3Qvcm91dGVzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvZ2xvYmFsL3dpbmRvdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9vbmNlL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvbm9kZV9tb2R1bGVzL2lzLWZ1bmN0aW9uL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL3RyaW0vaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9wYXJzZS1oZWFkZXJzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL3ZlcnNpb24uanNvbiIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy92ZXJzaW9uaW5nLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3ZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25OQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcGhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyohIGh0dHA6Ly9tdGhzLmJlL3B1bnljb2RlIHYxLjIuNCBieSBAbWF0aGlhcyAqL1xuOyhmdW5jdGlvbihyb290KSB7XG5cblx0LyoqIERldGVjdCBmcmVlIHZhcmlhYmxlcyAqL1xuXHR2YXIgZnJlZUV4cG9ydHMgPSB0eXBlb2YgZXhwb3J0cyA9PSAnb2JqZWN0JyAmJiBleHBvcnRzO1xuXHR2YXIgZnJlZU1vZHVsZSA9IHR5cGVvZiBtb2R1bGUgPT0gJ29iamVjdCcgJiYgbW9kdWxlICYmXG5cdFx0bW9kdWxlLmV4cG9ydHMgPT0gZnJlZUV4cG9ydHMgJiYgbW9kdWxlO1xuXHR2YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsO1xuXHRpZiAoZnJlZUdsb2JhbC5nbG9iYWwgPT09IGZyZWVHbG9iYWwgfHwgZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwpIHtcblx0XHRyb290ID0gZnJlZUdsb2JhbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYHB1bnljb2RlYCBvYmplY3QuXG5cdCAqIEBuYW1lIHB1bnljb2RlXG5cdCAqIEB0eXBlIE9iamVjdFxuXHQgKi9cblx0dmFyIHB1bnljb2RlLFxuXG5cdC8qKiBIaWdoZXN0IHBvc2l0aXZlIHNpZ25lZCAzMi1iaXQgZmxvYXQgdmFsdWUgKi9cblx0bWF4SW50ID0gMjE0NzQ4MzY0NywgLy8gYWthLiAweDdGRkZGRkZGIG9yIDJeMzEtMVxuXG5cdC8qKiBCb290c3RyaW5nIHBhcmFtZXRlcnMgKi9cblx0YmFzZSA9IDM2LFxuXHR0TWluID0gMSxcblx0dE1heCA9IDI2LFxuXHRza2V3ID0gMzgsXG5cdGRhbXAgPSA3MDAsXG5cdGluaXRpYWxCaWFzID0gNzIsXG5cdGluaXRpYWxOID0gMTI4LCAvLyAweDgwXG5cdGRlbGltaXRlciA9ICctJywgLy8gJ1xceDJEJ1xuXG5cdC8qKiBSZWd1bGFyIGV4cHJlc3Npb25zICovXG5cdHJlZ2V4UHVueWNvZGUgPSAvXnhuLS0vLFxuXHRyZWdleE5vbkFTQ0lJID0gL1teIC1+XS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9cXHgyRXxcXHUzMDAyfFxcdUZGMEV8XFx1RkY2MS9nLCAvLyBSRkMgMzQ5MCBzZXBhcmF0b3JzXG5cblx0LyoqIEVycm9yIG1lc3NhZ2VzICovXG5cdGVycm9ycyA9IHtcblx0XHQnb3ZlcmZsb3cnOiAnT3ZlcmZsb3c6IGlucHV0IG5lZWRzIHdpZGVyIGludGVnZXJzIHRvIHByb2Nlc3MnLFxuXHRcdCdub3QtYmFzaWMnOiAnSWxsZWdhbCBpbnB1dCA+PSAweDgwIChub3QgYSBiYXNpYyBjb2RlIHBvaW50KScsXG5cdFx0J2ludmFsaWQtaW5wdXQnOiAnSW52YWxpZCBpbnB1dCdcblx0fSxcblxuXHQvKiogQ29udmVuaWVuY2Ugc2hvcnRjdXRzICovXG5cdGJhc2VNaW51c1RNaW4gPSBiYXNlIC0gdE1pbixcblx0Zmxvb3IgPSBNYXRoLmZsb29yLFxuXHRzdHJpbmdGcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLFxuXG5cdC8qKiBUZW1wb3JhcnkgdmFyaWFibGUgKi9cblx0a2V5O1xuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgZXJyb3IgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIGVycm9yIHR5cGUuXG5cdCAqIEByZXR1cm5zIHtFcnJvcn0gVGhyb3dzIGEgYFJhbmdlRXJyb3JgIHdpdGggdGhlIGFwcGxpY2FibGUgZXJyb3IgbWVzc2FnZS5cblx0ICovXG5cdGZ1bmN0aW9uIGVycm9yKHR5cGUpIHtcblx0XHR0aHJvdyBSYW5nZUVycm9yKGVycm9yc1t0eXBlXSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGBBcnJheSNtYXBgIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeSBhcnJheVxuXHQgKiBpdGVtLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IGFycmF5IG9mIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXAoYXJyYXksIGZuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR3aGlsZSAobGVuZ3RoLS0pIHtcblx0XHRcdGFycmF5W2xlbmd0aF0gPSBmbihhcnJheVtsZW5ndGhdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5O1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncy5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeVxuXHQgKiBjaGFyYWN0ZXIuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgc3RyaW5nIG9mIGNoYXJhY3RlcnMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrXG5cdCAqIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwRG9tYWluKHN0cmluZywgZm4pIHtcblx0XHRyZXR1cm4gbWFwKHN0cmluZy5zcGxpdChyZWdleFNlcGFyYXRvcnMpLCBmbikuam9pbignLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcblx0ICogY2hhcmFjdGVyIGluIHRoZSBzdHJpbmcuIFdoaWxlIEphdmFTY3JpcHQgdXNlcyBVQ1MtMiBpbnRlcm5hbGx5LFxuXHQgKiB0aGlzIGZ1bmN0aW9uIHdpbGwgY29udmVydCBhIHBhaXIgb2Ygc3Vycm9nYXRlIGhhbHZlcyAoZWFjaCBvZiB3aGljaFxuXHQgKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcblx0ICogbWF0Y2hpbmcgVVRGLTE2LlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmVuY29kZWBcblx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZGVjb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmcgVGhlIFVuaWNvZGUgaW5wdXQgc3RyaW5nIChVQ1MtMikuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gVGhlIG5ldyBhcnJheSBvZiBjb2RlIHBvaW50cy5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJkZWNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBjb3VudGVyID0gMCxcblx0XHQgICAgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aCxcblx0XHQgICAgdmFsdWUsXG5cdFx0ICAgIGV4dHJhO1xuXHRcdHdoaWxlIChjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGhpZ2ggc3Vycm9nYXRlLCBhbmQgdGhlcmUgaXMgYSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRleHRyYSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRcdGlmICgoZXh0cmEgJiAweEZDMDApID09IDB4REMwMCkgeyAvLyBsb3cgc3Vycm9nYXRlXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1bm1hdGNoZWQgc3Vycm9nYXRlOyBvbmx5IGFwcGVuZCB0aGlzIGNvZGUgdW5pdCwgaW4gY2FzZSB0aGUgbmV4dFxuXHRcdFx0XHRcdC8vIGNvZGUgdW5pdCBpcyB0aGUgaGlnaCBzdXJyb2dhdGUgb2YgYSBzdXJyb2dhdGUgcGFpclxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRjb3VudGVyLS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3RyaW5nIGJhc2VkIG9uIGFuIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZGVjb2RlYFxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBlbmNvZGVcblx0ICogQHBhcmFtIHtBcnJheX0gY29kZVBvaW50cyBUaGUgYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHJldHVybiBtYXAoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YXIgb3V0cHV0ID0gJyc7XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGJhc2ljIGNvZGUgcG9pbnQgaW50byBhIGRpZ2l0L2ludGVnZXIuXG5cdCAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gY29kZVBvaW50IFRoZSBiYXNpYyBudW1lcmljIGNvZGUgcG9pbnQgdmFsdWUuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGluIHRoZSByYW5nZSBgMGAgdG8gYGJhc2UgLSAxYCwgb3IgYGJhc2VgIGlmXG5cdCAqIHRoZSBjb2RlIHBvaW50IGRvZXMgbm90IHJlcHJlc2VudCBhIHZhbHVlLlxuXHQgKi9cblx0ZnVuY3Rpb24gYmFzaWNUb0RpZ2l0KGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgLSA0OCA8IDEwKSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gMjI7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA2NSA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gNjU7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA5NyA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gOTc7XG5cdFx0fVxuXHRcdHJldHVybiBiYXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGlnaXQvaW50ZWdlciBpbnRvIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHNlZSBgYmFzaWNUb0RpZ2l0KClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBkaWdpdCBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBiYXNpYyBjb2RlIHBvaW50IHdob3NlIHZhbHVlICh3aGVuIHVzZWQgZm9yXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG5cdCAqIGAwYCB0byBgYmFzZSAtIDFgLiBJZiBgZmxhZ2AgaXMgbm9uLXplcm8sIHRoZSB1cHBlcmNhc2UgZm9ybSBpc1xuXHQgKiB1c2VkOyBlbHNlLCB0aGUgbG93ZXJjYXNlIGZvcm0gaXMgdXNlZC4gVGhlIGJlaGF2aW9yIGlzIHVuZGVmaW5lZFxuXHQgKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGlnaXRUb0Jhc2ljKGRpZ2l0LCBmbGFnKSB7XG5cdFx0Ly8gIDAuLjI1IG1hcCB0byBBU0NJSSBhLi56IG9yIEEuLlpcblx0XHQvLyAyNi4uMzUgbWFwIHRvIEFTQ0lJIDAuLjlcblx0XHRyZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogKGRpZ2l0IDwgMjYpIC0gKChmbGFnICE9IDApIDw8IDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG5cdCAqIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0OTIjc2VjdGlvbi0zLjRcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGFkYXB0KGRlbHRhLCBudW1Qb2ludHMsIGZpcnN0VGltZSkge1xuXHRcdHZhciBrID0gMDtcblx0XHRkZWx0YSA9IGZpcnN0VGltZSA/IGZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuXHRcdGRlbHRhICs9IGZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblx0XHRmb3IgKC8qIG5vIGluaXRpYWxpemF0aW9uICovOyBkZWx0YSA+IGJhc2VNaW51c1RNaW4gKiB0TWF4ID4+IDE7IGsgKz0gYmFzZSkge1xuXHRcdFx0ZGVsdGEgPSBmbG9vcihkZWx0YSAvIGJhc2VNaW51c1RNaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gZmxvb3IoayArIChiYXNlTWludXNUTWluICsgMSkgKiBkZWx0YSAvIChkZWx0YSArIHNrZXcpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMgdG8gYSBzdHJpbmcgb2YgVW5pY29kZVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBkZWNvZGUoaW5wdXQpIHtcblx0XHQvLyBEb24ndCB1c2UgVUNTLTJcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuXHRcdCAgICBvdXQsXG5cdFx0ICAgIGkgPSAwLFxuXHRcdCAgICBuID0gaW5pdGlhbE4sXG5cdFx0ICAgIGJpYXMgPSBpbml0aWFsQmlhcyxcblx0XHQgICAgYmFzaWMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIGluZGV4LFxuXHRcdCAgICBvbGRpLFxuXHRcdCAgICB3LFxuXHRcdCAgICBrLFxuXHRcdCAgICBkaWdpdCxcblx0XHQgICAgdCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuNCcsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoJ3B1bnljb2RlJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgIWZyZWVFeHBvcnRzLm5vZGVUeXBlKSB7XG5cdFx0aWYgKGZyZWVNb2R1bGUpIHsgLy8gaW4gTm9kZS5qcyBvciBSaW5nb0pTIHYwLjguMCtcblx0XHRcdGZyZWVNb2R1bGUuZXhwb3J0cyA9IHB1bnljb2RlO1xuXHRcdH0gZWxzZSB7IC8vIGluIE5hcndoYWwgb3IgUmluZ29KUyB2MC43LjAtXG5cdFx0XHRmb3IgKGtleSBpbiBwdW55Y29kZSkge1xuXHRcdFx0XHRwdW55Y29kZS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIChmcmVlRXhwb3J0c1trZXldID0gcHVueWNvZGVba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBpbiBSaGlubyBvciBhIHdlYiBicm93c2VyXG5cdFx0cm9vdC5wdW55Y29kZSA9IHB1bnljb2RlO1xuXHR9XG5cbn0odGhpcykpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhYm91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktdGF1bnVzLVxcXCI+V2h5IFRhdW51cz88L2gxPlxcbjxwPlRhdW51cyBmb2N1c2VzIG9uIGRlbGl2ZXJpbmcgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGV4cGVyaWVuY2UgdG8gdGhlIGVuZC11c2VyLCB3aGlsZSBwcm92aWRpbmcgPGVtPmEgcmVhc29uYWJsZSBkZXZlbG9wbWVudCBleHBlcmllbmNlPC9lbT4gYXMgd2VsbC4gPHN0cm9uZz5UYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudDwvc3Ryb25nPi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS48L3A+XFxuPHA+V2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgPHN0cm9uZz48YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXFwiPnVzYWJpbGl0eTwvYT4gYW5kIHBlcmZvcm1hbmNlIGFyZSBib3RoIGNvcmUgY29uY2VybnM8L3N0cm9uZz4gZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyA8c3Ryb25nPnN0aWxsIGV4cGVjdGVkIHRvIHdvcms8L3N0cm9uZz4uPC9wPlxcbjxwPkZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSA8Y29kZT5jbGljazwvY29kZT4gZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQmIzM5O3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0IDxzdHJvbmc+b3VyIHNpdGVzIGRvbiYjMzk7dCBuZWVkIHRvIGxvb2sgYW5kIGJlaGF2ZSB0aGUgc2FtZSBvbiBldmVyeSBicm93c2VyPC9zdHJvbmc+LiBTaW1pbGFybHksIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+cGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZDwvYT4gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC48L3A+XFxuPHA+V2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCA8ZW0+KG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSk8L2VtPiBvciBiZWNhdXNlIHRoZSB1c2VyIGJsb2NrZWQgSmF2YVNjcmlwdCwgeW91ciBhcHBsaWNhdGlvbiB3aWxsIHN0aWxsIHdvcmshPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcIndoeS1ub3Qtb3RoZXItZnJhbWV3b3Jrcy1cXFwiPldoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz88L2gxPlxcbjxwPk1hbnkgb3RoZXIgZnJhbWV3b3JrcyB3ZXJlbiYjMzk7dCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24mIzM5O3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmRvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnQ8L2E+LiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJiMzOTt0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS48L3A+XFxuPHA+TGF0ZWx5LCB3ZSBjYW4gb2JzZXJ2ZSBtYW55IG1hdHVyZSBvcGVuLXNvdXJjZSBmcmFtZXdvcmtzIGFyZSBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkmIzM5O3JlIGFyY2hpdGVjdGVkLCB3aGVyZSB0aGUgZGV2ZWxvcGVyIGlzIHB1dCBmaXJzdC4gPHN0cm9uZz5UYXVudXMgaXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9oYXNodGFnL2h1bWFuZmlyc3RcXFwiPiNodW1hbmZpcnN0PC9hPjwvc3Ryb25nPiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy48L3A+XFxuPHA+UHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSYjMzk7cmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIDxlbT4odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudCk8L2VtPiwgYW5kIHRoZW4gZW5oYW5jZSBpdCA8c3Ryb25nPmlmIHBvc3NpYmxlPC9zdHJvbmc+IHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91JiMzOTtsbCBiZSBhYmxlIHRvIHJlYWNoIHRoZSBtb3N0IHBlb3BsZSB3aXRoIHlvdXIgY29yZSBleHBlcmllbmNlLCBhbmQgeW91JiMzOTtsbCBhbHNvIGJlIGFibGUgdG8gcHJvdmlkZSBodW1hbnMgaW4gbW9yZSBtb2Rlcm4gYnJvd3NlcnMgd2l0aCBhbGwgb2YgdGhlIGxhdGVzdCBmZWF0dXJlcyBhbmQgdGVjaG5vbG9naWVzLjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA2LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmZWF0dXJlc1xcXCI+RmVhdHVyZXM8L2gxPlxcbjxwPk91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj53aXRob3V0IGFueSBjb25maWd1cmF0aW9uIG5lZWRlZDwvYT4uIEV2ZW4gd2hpbGUgVGF1bnVzIHByb3ZpZGVzIHNoYXJlZC1yZW5kZXJpbmcgY2FwYWJpbGl0aWVzLCBpdCBvZmZlcnMgY29kZSByZXVzZSBvZiB2aWV3cyBhbmQgcm91dGVzLCBtZWFuaW5nIHlvdSYjMzk7bGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSYjMzk7bGwgYmUgdXNlZCBpbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5UYXVudXMgZmVhdHVyZXMgYSByZWFzb25hYmx5IGVuaGFuY2VkIGV4cGVyaWVuY2UsIHdoZXJlIGlmIGZlYXR1cmVzIGFyZW4mIzM5O3QgYXZhaWxhYmxlIG9uIGEgYnJvd3NlciwgdGhleSYjMzk7cmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGJ1dCBpZiB0aGF0JiMzOTtzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCYjMzk7bGwgZmFsbCBiYWNrIHRvIHNpbXBseSBub3QgbWVkZGxpbmcgd2l0aCBsaW5rcyBpbnN0ZWFkIG9mIHVzaW5nIGEgY2xpZW50LXNpZGUtb25seSBoYXNoIHJvdXRlci48L3A+XFxuPHA+VGF1bnVzIGNhbiBkZWFsIHdpdGggdmlldyBjYWNoaW5nIG9uIHlvdXIgYmVoYWxmLCBpZiB5b3Ugc28gZGVzaXJlLCB1c2luZyA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+YXN5bmNocm9ub3VzIGVtYmVkZGVkIGRhdGFiYXNlIHN0b3JlczwvYT4gb24gdGhlIGNsaWVudC1zaWRlLiBUdXJucyBvdXQsIHRoZXJlJiMzOTtzIDxhIGhyZWY9XFxcImh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcXCI+cHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREI8L2E+LiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCYjMzk7cyBhdmFpbGFibGUsIGFuZCBpZiBpdCYjMzk7cyBub3QgdGhlbiB2aWV3cyB3b24mIzM5O3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gPHN0cm9uZz5UaGUgc2l0ZSB3b24mIzM5O3Qgc2ltcGx5IHJvbGwgb3ZlciBhbmQgZGllLCB0aG91Z2guPC9zdHJvbmc+PC9wPlxcbjxwPklmIHlvdSYjMzk7dmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlIDxzdHJvbmc+dmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZTwvc3Ryb25nPiwgd2hpY2ggd2lsbCBzdGFydCBkb3dubG9hZGluZyB2aWV3cyBhcyBzb29uIGFzIGh1bWFucyBob3ZlciBvbiBsaW5rcywgYXMgdG8gZGVsaXZlciBhIDxlbT5mYXN0ZXIgcGVyY2VpdmVkIGh1bWFuIGV4cGVyaWVuY2U8L2VtPi48L3A+XFxuPHA+VGF1bnVzIHByb3ZpZGVzIHRoZSBiYXJlIGJvbmVzIGZvciB5b3VyIGFwcGxpY2F0aW9uIHNvIHRoYXQgeW91IGNhbiBzZXBhcmF0ZSBjb25jZXJucyBpbnRvIHJvdXRlcywgY29udHJvbGxlcnMsIG1vZGVscywgYW5kIHZpZXdzLiBUaGVuIGl0IGdldHMgb3V0IG9mIHRoZSB3YXksIGJ5IGRlc2lnbi4gVGhlcmUgYXJlIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+YSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzPC9hPiB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC48L3A+XFxuPHA+V2l0aCBUYXVudXMgeW91JiMzOTtsbCBiZSBpbiBjaGFyZ2UuIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkFyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/PC9hPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmYW1pbGlhcml0eVxcXCI+RmFtaWxpYXJpdHk8L2gxPlxcbjxwPllvdSBjYW4gdXNlIFRhdW51cyB0byBkZXZlbG9wIGFwcGxpY2F0aW9ucyB1c2luZyB5b3VyIGZhdm9yaXRlIE5vZGUuanMgSFRUUCBzZXJ2ZXIsIDxzdHJvbmc+Ym90aCA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBhcmUgZnVsbHkgc3VwcG9ydGVkPC9zdHJvbmc+LiBJbiBib3RoIGNhc2VzLCB5b3UmIzM5O2xsIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPmJ1aWxkIGNvbnRyb2xsZXJzIHRoZSB3YXkgeW91JiMzOTtyZSBhbHJlYWR5IHVzZWQgdG88L2E+LCBleGNlcHQgeW91IHdvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UmIzM5O2xsIGJlIGFibGUgdG8gZG8gZXZlcnl0aGluZyB5b3UmIzM5O3JlIGFscmVhZHkgYWJsZSB0byBkbywgYW5kIHRoZW4geW91JiMzOTtsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuPC9wPlxcbjxwPllvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCYjMzk7cyBiZWNhdXNlIFRhdW51cyB0cmVhdHMgdmlld3MgYXMgbWVyZSBKYXZhU2NyaXB0IGZ1bmN0aW9ucywgcmF0aGVyIHRoYW4gYmVpbmcgdGllZCBpbnRvIGEgc3BlY2lmaWMgdmlldy1yZW5kZXJpbmcgZW5naW5lLjwvcD5cXG48cD5DbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUganVzdCBmdW5jdGlvbnMsIHRvby4gWW91IGNhbiBicmluZyB5b3VyIG93biBzZWxlY3RvciBlbmdpbmUsIHlvdXIgb3duIEFKQVggbGlicmFyaWVzLCBhbmQgeW91ciBvd24gZGF0YS1iaW5kaW5nIHNvbHV0aW9ucy4gSXQgbWlnaHQgbWVhbiB0aGVyZSYjMzk7cyBhIGJpdCBtb3JlIHdvcmsgaW52b2x2ZWQgZm9yIHlvdSwgYnV0IHlvdSYjMzk7bGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSYjMzk7cmUgbW9zdCBjb21mb3J0YWJsZSB3aXRoISBUaGF0IGJlaW5nIHNhaWQsIFRhdW51cyA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmRvZXMgcmVjb21tZW5kIGEgZmV3IGxpYnJhcmllczwvYT4gdGhhdCB3b3JrIHdlbGwgd2l0aCBpdC48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBXaHkgVGF1bnVzP1xcblxcbiAgICBUYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIF9hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZV8gYXMgd2VsbC4gKipUYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudCoqLiBJdCB1c2VzIHNlcnZlci1zaWRlIHJlbmRlcmluZyB0byBnZXQgY29udGVudCB0byB5b3VyIGh1bWFucyBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgaXQgdXNlcyBjbGllbnQtc2lkZSByZW5kZXJpbmcgdG8gaW1wcm92ZSB0aGVpciBleHBlcmllbmNlLlxcblxcbiAgICBXaGlsZSBpdCBmb2N1c2VzIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCAqKlt1c2FiaWxpdHldWzJdIGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zKiogZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyAqKnN0aWxsIGV4cGVjdGVkIHRvIHdvcmsqKi5cXG5cXG4gICAgRm9yIGV4YW1wbGUsIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBzaXRlIHVzZXMgcGxhaW4tb2xkIGxpbmtzIHRvIG5hdmlnYXRlIGZyb20gb25lIHZpZXcgdG8gYW5vdGhlciwgYW5kIHRoZW4gYWRkcyBhIGBjbGlja2AgZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQncyBva2F5LCBiZWNhdXNlIHdlIGFja25vd2xlZGdlIHRoYXQgKipvdXIgc2l0ZXMgZG9uJ3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3NlcioqLiBTaW1pbGFybHksIFtwZXJmb3JtYW5jZSBpcyBncmVhdGx5IGVuaGFuY2VkXVsxXSBieSBkZWxpdmVyaW5nIGNvbnRlbnQgdG8gdGhlIGh1bWFuIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCB0aGVuIGFkZGluZyBmdW5jdGlvbmFsaXR5IG9uIHRvcCBvZiB0aGF0LlxcblxcbiAgICBXaXRoIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCBpZiB0aGUgZnVuY3Rpb25hbGl0eSBuZXZlciBnZXRzIHRoZXJlIGJlY2F1c2UgYSBKYXZhU2NyaXB0IHJlc291cmNlIGZhaWxlZCB0byBsb2FkIGJlY2F1c2UgdGhlIG5ldHdvcmsgZmFpbGVkIF8obm90IHVuY29tbW9uIGluIHRoZSBtb2JpbGUgZXJhKV8gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrIVxcblxcbiAgICBbMV06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9hZGp1c3RpbmctdXgtZm9yLWh1bWFuc1xcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IE5vdCBPdGhlciBGcmFtZXdvcmtzP1xcblxcbiAgICBNYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4ndCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24ndCBwcmlvcml0aXplZCwgYW5kIGh1bWFucyBhcmUgZXhwZWN0ZWQgdG8gW2Rvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnRdWzJdLiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJ3QgdGhlIG9ubHkgd2ViIGNyYXdsZXIgb3BlcmF0b3Igb3V0IHRoZXJlLCBhbmQgaXQgbWlnaHQgYmUgYSB3aGlsZSBiZWZvcmUgc29jaWFsIG1lZGlhIGxpbmsgY3Jhd2xlcnMgY2F0Y2ggdXAgd2l0aCB0aGVtLlxcblxcbiAgICBMYXRlbHksIHdlIGNhbiBvYnNlcnZlIG1hbnkgbWF0dXJlIG9wZW4tc291cmNlIGZyYW1ld29ya3MgYXJlIGRyb3BwaW5nIHN1cHBvcnQgZm9yIG9sZGVyIGJyb3dzZXJzLiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZCwgd2hlcmUgdGhlIGRldmVsb3BlciBpcyBwdXQgZmlyc3QuICoqVGF1bnVzIGlzIFsjaHVtYW5maXJzdF1bMV0qKiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy5cXG5cXG4gICAgUHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZC4gQXMgdGhlIG5hbWUgaW1wbGllcywgYSBiYXNlbGluZSBpcyBlc3RhYmxpc2hlZCB3aGVyZSB3ZSBkZWxpdmVyIHRoZSBjb3JlIGV4cGVyaWVuY2UgdG8gdGhlIHVzZXIgXyh0eXBpY2FsbHkgaW4gdGhlIGZvcm0gb2YgcmVhZGFibGUgSFRNTCBjb250ZW50KV8sIGFuZCB0aGVuIGVuaGFuY2UgaXQgKippZiBwb3NzaWJsZSoqIHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91J2xsIGJlIGFibGUgdG8gcmVhY2ggdGhlIG1vc3QgcGVvcGxlIHdpdGggeW91ciBjb3JlIGV4cGVyaWVuY2UsIGFuZCB5b3UnbGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy5cXG5cXG4gICAgWzFdOiBodHRwczovL3R3aXR0ZXIuY29tL2hhc2h0YWcvaHVtYW5maXJzdFxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEZlYXR1cmVzXFxuXFxuICAgIE91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyBbd2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWRdWzJdLiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UnbGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSdsbCBiZSB1c2VkIGluIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUuXFxuXFxuICAgIFRhdW51cyBmZWF0dXJlcyBhIHJlYXNvbmFibHkgZW5oYW5jZWQgZXhwZXJpZW5jZSwgd2hlcmUgaWYgZmVhdHVyZXMgYXJlbid0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkncmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgYGhpc3RvcnlgIEFQSSBidXQgaWYgdGhhdCdzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCdsbCBmYWxsIGJhY2sgdG8gc2ltcGx5IG5vdCBtZWRkbGluZyB3aXRoIGxpbmtzIGluc3RlYWQgb2YgdXNpbmcgYSBjbGllbnQtc2lkZS1vbmx5IGhhc2ggcm91dGVyLlxcblxcbiAgICBUYXVudXMgY2FuIGRlYWwgd2l0aCB2aWV3IGNhY2hpbmcgb24geW91ciBiZWhhbGYsIGlmIHlvdSBzbyBkZXNpcmUsIHVzaW5nIFthc3luY2hyb25vdXMgZW1iZWRkZWQgZGF0YWJhc2Ugc3RvcmVzXVszXSBvbiB0aGUgY2xpZW50LXNpZGUuIFR1cm5zIG91dCwgdGhlcmUncyBbcHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREJdWzRdLiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCdzIGF2YWlsYWJsZSwgYW5kIGlmIGl0J3Mgbm90IHRoZW4gdmlld3Mgd29uJ3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gKipUaGUgc2l0ZSB3b24ndCBzaW1wbHkgcm9sbCBvdmVyIGFuZCBkaWUsIHRob3VnaC4qKlxcblxcbiAgICBJZiB5b3UndmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlICoqdmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZSoqLCB3aGljaCB3aWxsIHN0YXJ0IGRvd25sb2FkaW5nIHZpZXdzIGFzIHNvb24gYXMgaHVtYW5zIGhvdmVyIG9uIGxpbmtzLCBhcyB0byBkZWxpdmVyIGEgX2Zhc3RlciBwZXJjZWl2ZWQgaHVtYW4gZXhwZXJpZW5jZV8uXFxuXFxuICAgIFRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSBbYSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzXVsxXSB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC5cXG5cXG4gICAgV2l0aCBUYXVudXMgeW91J2xsIGJlIGluIGNoYXJnZS4gW0FyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/XVsyXVxcblxcbiAgICBbMV06IC9jb21wbGVtZW50c1xcbiAgICBbMl06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzNdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbNF06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgRmFtaWxpYXJpdHlcXG5cXG4gICAgWW91IGNhbiB1c2UgVGF1bnVzIHRvIGRldmVsb3AgYXBwbGljYXRpb25zIHVzaW5nIHlvdXIgZmF2b3JpdGUgTm9kZS5qcyBIVFRQIHNlcnZlciwgKipib3RoIFtFeHByZXNzXVszXSBhbmQgW0hhcGldWzRdIGFyZSBmdWxseSBzdXBwb3J0ZWQqKi4gSW4gYm90aCBjYXNlcywgeW91J2xsIFtidWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSdyZSBhbHJlYWR5IHVzZWQgdG9dWzFdLCBleGNlcHQgeW91IHdvbid0IGhhdmUgdG8gYHJlcXVpcmVgIHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UnbGwgYmUgYWJsZSB0byBkbyBldmVyeXRoaW5nIHlvdSdyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSdsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuXFxuXFxuICAgIFlvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCdzIGJlY2F1c2UgVGF1bnVzIHRyZWF0cyB2aWV3cyBhcyBtZXJlIEphdmFTY3JpcHQgZnVuY3Rpb25zLCByYXRoZXIgdGhhbiBiZWluZyB0aWVkIGludG8gYSBzcGVjaWZpYyB2aWV3LXJlbmRlcmluZyBlbmdpbmUuXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBqdXN0IGZ1bmN0aW9ucywgdG9vLiBZb3UgY2FuIGJyaW5nIHlvdXIgb3duIHNlbGVjdG9yIGVuZ2luZSwgeW91ciBvd24gQUpBWCBsaWJyYXJpZXMsIGFuZCB5b3VyIG93biBkYXRhLWJpbmRpbmcgc29sdXRpb25zLiBJdCBtaWdodCBtZWFuIHRoZXJlJ3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UnbGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSdyZSBtb3N0IGNvbWZvcnRhYmxlIHdpdGghIFRoYXQgYmVpbmcgc2FpZCwgVGF1bnVzIFtkb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXNdWzJdIHRoYXQgd29yayB3ZWxsIHdpdGggaXQuXFxuXFxuICAgIFsxXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbMl06IC9jb21wbGVtZW50c1xcbiAgICBbM106IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs0XTogaHR0cDovL2hhcGlqcy5jb21cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBpKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJhcGktZG9jdW1lbnRhdGlvblxcXCI+QVBJIERvY3VtZW50YXRpb248L2gxPlxcbjxwPkhlcmUmIzM5O3MgdGhlIEFQSSBkb2N1bWVudGF0aW9uIGZvciBUYXVudXMuIElmIHlvdSYjMzk7dmUgbmV2ZXIgdXNlZCBpdCBiZWZvcmUsIHdlIHJlY29tbWVuZCBnb2luZyBvdmVyIHRoZSA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5HZXR0aW5nIFN0YXJ0ZWQ8L2E+IGd1aWRlIGJlZm9yZSBqdW1waW5nIGludG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uLiBUaGF0IHdheSwgeW91JiMzOTtsbCBnZXQgYSBiZXR0ZXIgaWRlYSBvZiB3aGF0IHRvIGxvb2sgZm9yIGFuZCBob3cgdG8gcHV0IHRvZ2V0aGVyIHNpbXBsZSBhcHBsaWNhdGlvbnMgdXNpbmcgVGF1bnVzLCBiZWZvcmUgZ29pbmcgdGhyb3VnaCBkb2N1bWVudGF0aW9uIG9uIGV2ZXJ5IHB1YmxpYyBpbnRlcmZhY2UgdG8gVGF1bnVzLjwvcD5cXG48cD5UYXVudXMgZXhwb3NlcyA8ZW0+dGhyZWUgZGlmZmVyZW50IHB1YmxpYyBBUElzPC9lbT4sIGFuZCB0aGVyZSYjMzk7cyBhbHNvIDxzdHJvbmc+cGx1Z2lucyB0byBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcjwvc3Ryb25nPi4gVGhpcyBkb2N1bWVudCBjb3ZlcnMgYWxsIHRocmVlIEFQSXMgZXh0ZW5zaXZlbHkuIElmIHlvdSYjMzk7cmUgY29uY2VybmVkIGFib3V0IHRoZSBpbm5lciB3b3JraW5ncyBvZiBUYXVudXMsIHBsZWFzZSByZWZlciB0byB0aGUgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9hPiBndWlkZS4gVGhpcyBkb2N1bWVudCBhaW1zIHRvIG9ubHkgY292ZXIgaG93IHRoZSBwdWJsaWMgaW50ZXJmYWNlIGFmZmVjdHMgYXBwbGljYXRpb24gc3RhdGUsIGJ1dCA8c3Ryb25nPmRvZXNuJiMzOTt0IGRlbHZlIGludG8gaW1wbGVtZW50YXRpb24gZGV0YWlsczwvc3Ryb25nPi48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+QSA8YSBocmVmPVxcXCIjc2VydmVyLXNpZGUtYXBpXFxcIj5zZXJ2ZXItc2lkZSBBUEk8L2E+IHRoYXQgZGVhbHMgd2l0aCBzZXJ2ZXItc2lkZSByZW5kZXJpbmc8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvYT4gbWV0aG9kPHVsPlxcbjxsaT5JdHMgPGEgaHJlZj1cXFwiI3RoZS1vcHRpb25zLW9iamVjdFxcXCI+PGNvZGU+b3B0aW9uczwvY29kZT48L2E+IGFyZ3VtZW50PHVsPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtbGF5b3V0LVxcXCI+PGNvZGU+bGF5b3V0PC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcm91dGVzLVxcXCI+PGNvZGU+cm91dGVzPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC1cXFwiPjxjb2RlPmdldERlZmF1bHRWaWV3TW9kZWw8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1wbGFpbnRleHQtXFxcIj48Y29kZT5wbGFpbnRleHQ8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1yZXNvbHZlcnMtXFxcIj48Y29kZT5yZXNvbHZlcnM8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy12ZXJzaW9uLVxcXCI+PGNvZGU+dmVyc2lvbjwvY29kZT48L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkl0cyA8YSBocmVmPVxcXCIjLWFkZHJvdXRlLWRlZmluaXRpb24tXFxcIj48Y29kZT5hZGRSb3V0ZTwvY29kZT48L2E+IGFyZ3VtZW50PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yZW5kZXItYWN0aW9uLXZpZXdtb2RlbC1yZXEtcmVzLW5leHQtXFxcIj48Y29kZT50YXVudXMucmVuZGVyPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJlYnVpbGRkZWZhdWx0dmlld21vZGVsLWRvbmUtXFxcIj48Y29kZT50YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWw8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3NlcnZlci1zaWRlLWNvbnRyb2xsZXJzXFxcIj5TZXJ2ZXItc2lkZSBjb250cm9sbGVyczwvYT48L2xpPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5zdWl0ZSBvZiBwbHVnaW5zPC9hPiBjYW4gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXI8dWw+XFxuPGxpPlVzaW5nIDxhIGhyZWY9XFxcIiN1c2luZy10YXVudXMtZXhwcmVzcy1cXFwiPjxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPjwvYT4gZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPjwvbGk+XFxuPGxpPlVzaW5nIDxhIGhyZWY9XFxcIiN1c2luZy10YXVudXMtaGFwaS1cXFwiPjxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPjwvYT4gZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNjb21tYW5kLWxpbmUtaW50ZXJmYWNlXFxcIj5DTEkgdGhhdCBwcm9kdWNlcyBhIHdpcmluZyBtb2R1bGU8L2E+IGZvciB0aGUgY2xpZW50LXNpZGU8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLW91dHB1dC1cXFwiPjxjb2RlPi0tb3V0cHV0PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXdhdGNoLVxcXCI+PGNvZGU+LS13YXRjaDwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10cmFuc2Zvcm0tbW9kdWxlLVxcXCI+PGNvZGU+LS10cmFuc2Zvcm0gJmx0O21vZHVsZSZndDs8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtcmVzb2x2ZXJzLW1vZHVsZS1cXFwiPjxjb2RlPi0tcmVzb2x2ZXJzICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXN0YW5kYWxvbmUtXFxcIj48Y29kZT4tLXN0YW5kYWxvbmU8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI2NsaWVudC1zaWRlLWFwaVxcXCI+Y2xpZW50LXNpZGUgQVBJPC9hPiB0aGF0IGRlYWxzIHdpdGggY2xpZW50LXNpZGUgcmVuZGVyaW5nPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtY29udGFpbmVyLXdpcmluZy1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvYT4gbWV0aG9kPHVsPlxcbjxsaT5Vc2luZyB0aGUgPGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1hdXRvLXN0cmF0ZWd5XFxcIj48Y29kZT5hdXRvPC9jb2RlPjwvYT4gc3RyYXRlZ3k8L2xpPlxcbjxsaT5Vc2luZyB0aGUgPGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1pbmxpbmUtc3RyYXRlZ3lcXFwiPjxjb2RlPmlubGluZTwvY29kZT48L2E+IHN0cmF0ZWd5PC9saT5cXG48bGk+VXNpbmcgdGhlIDxhIGhyZWY9XFxcIiN1c2luZy10aGUtbWFudWFsLXN0cmF0ZWd5XFxcIj48Y29kZT5tYW51YWw8L2NvZGU+PC9hPiBzdHJhdGVneTwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nXFxcIj5DYWNoaW5nPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNwcmVmZXRjaGluZ1xcXCI+UHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3ZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1vbi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uY2UtdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vbmNlPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9mZi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9mZjwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1pbnRlcmNlcHQtYWN0aW9uLWZuLVxcXCI+PGNvZGU+dGF1bnVzLmludGVyY2VwdDwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1wYXJ0aWFsLWNvbnRhaW5lci1hY3Rpb24tbW9kZWwtXFxcIj48Y29kZT50YXVudXMucGFydGlhbDwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1uYXZpZ2F0ZS11cmwtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMucm91dGU8L2NvZGU+PC9hPiBtZXRob2Q8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS1lcXVhbHMtcm91dGUtcm91dGUtXFxcIj48Y29kZT50YXVudXMucm91dGUuZXF1YWxzPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1zdGF0ZS1cXFwiPjxjb2RlPnRhdW51cy5zdGF0ZTwvY29kZT48L2E+IHByb3BlcnR5PC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXhoci11cmwtb3B0aW9ucy1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnhocjwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjY2xpZW50LXNpZGUtY29udHJvbGxlcnNcXFwiPkNsaWVudC1zaWRlIGNvbnRyb2xsZXJzPC9hPjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjdGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj48Y29kZT4udGF1bnVzcmM8L2NvZGU+PC9hPiBtYW5pZmVzdDwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcInNlcnZlci1zaWRlLWFwaVxcXCI+U2VydmVyLXNpZGUgQVBJPC9oMT5cXG48cD5UaGUgc2VydmVyLXNpZGUgQVBJIGlzIHVzZWQgdG8gc2V0IHVwIHRoZSB2aWV3IHJvdXRlci4gSXQgdGhlbiBnZXRzIG91dCBvZiB0aGUgd2F5LCBhbGxvd2luZyB0aGUgY2xpZW50LXNpZGUgdG8gZXZlbnR1YWxseSB0YWtlIG92ZXIgYW5kIGFkZCBhbnkgZXh0cmEgc3VnYXIgb24gdG9wLCA8ZW0+aW5jbHVkaW5nIGNsaWVudC1zaWRlIHJlbmRlcmluZzwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudChhZGRSb3V0ZSwgb3B0aW9ucz8pPC9jb2RlPjwvaDI+XFxuPHA+TW91bnRzIFRhdW51cyBvbiB0b3Agb2YgYSBzZXJ2ZXItc2lkZSByb3V0ZXIsIGJ5IHJlZ2lzdGVyaW5nIGVhY2ggcm91dGUgaW4gPGNvZGU+b3B0aW9ucy5yb3V0ZXM8L2NvZGU+IHdpdGggdGhlIDxjb2RlPmFkZFJvdXRlPC9jb2RlPiBtZXRob2QuPC9wPlxcbjxibG9ja3F1b3RlPlxcbjxwPk5vdGUgdGhhdCBtb3N0IG9mIHRoZSB0aW1lLCA8c3Ryb25nPnRoaXMgbWV0aG9kIHNob3VsZG4mIzM5O3QgYmUgaW52b2tlZCBkaXJlY3RseTwvc3Ryb25nPiwgYnV0IHJhdGhlciB0aHJvdWdoIG9uZSBvZiB0aGUgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgZnJhbWV3b3JrIHBsdWdpbnM8L2E+IHByZXNlbnRlZCBiZWxvdy48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPkhlcmUmIzM5O3MgYW4gaW5jb21wbGV0ZSBleGFtcGxlIG9mIGhvdyB0aGlzIG1ldGhvZCBtYXkgYmUgdXNlZC4gSXQgaXMgaW5jb21wbGV0ZSBiZWNhdXNlIHJvdXRlIGRlZmluaXRpb25zIGhhdmUgbW9yZSBvcHRpb25zIGJleW9uZCB0aGUgPGNvZGU+cm91dGU8L2NvZGU+IGFuZCA8Y29kZT5hY3Rpb248L2NvZGU+IHByb3BlcnRpZXMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnRhdW51cy5tb3VudChhZGRSb3V0ZSwge1xcbiAgcm91dGVzOiBbeyByb3V0ZTogJiMzOTsvJiMzOTssIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTsgfV1cXG59KTtcXG5cXG5mdW5jdGlvbiBhZGRSb3V0ZSAoZGVmaW5pdGlvbikge1xcbiAgYXBwLmdldChkZWZpbml0aW9uLnJvdXRlLCBkZWZpbml0aW9uLmFjdGlvbik7XFxufVxcbjwvY29kZT48L3ByZT5cXG48cD5MZXQmIzM5O3MgZ28gb3ZlciB0aGUgb3B0aW9ucyB5b3UgY2FuIHBhc3MgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBmaXJzdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ0aGUtb3B0aW9ucy1vYmplY3RcXFwiPlRoZSA8Y29kZT5vcHRpb25zPzwvY29kZT4gb2JqZWN0PC9oND5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBvcHRpb25zIHRoYXQgY2FuIGJlIHBhc3NlZCB0byB0aGUgc2VydmVyLXNpZGUgbW91bnRwb2ludC4gWW91JiMzOTtyZSBwcm9iYWJseSBnb2luZyB0byBiZSBwYXNzaW5nIHRoZXNlIHRvIHlvdXIgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgZnJhbWV3b3JrIHBsdWdpbjwvYT4sIHJhdGhlciB0aGFuIHVzaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZGlyZWN0bHkuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtbGF5b3V0LVxcXCI+PGNvZGU+b3B0aW9ucy5sYXlvdXQ/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgaXMgZXhwZWN0ZWQgdG8gaGF2ZSB0aGUgPGNvZGU+ZnVuY3Rpb24oZGF0YSk8L2NvZGU+IHNpZ25hdHVyZS4gSXQmIzM5O2xsIGJlIGludm9rZWQgd2hlbmV2ZXIgYSBmdWxsIEhUTUwgZG9jdW1lbnQgbmVlZHMgdG8gYmUgcmVuZGVyZWQsIGFuZCBhIDxjb2RlPmRhdGE8L2NvZGU+IG9iamVjdCB3aWxsIGJlIHBhc3NlZCB0byBpdC4gVGhhdCBvYmplY3Qgd2lsbCBjb250YWluIGV2ZXJ5dGhpbmcgeW91JiMzOTt2ZSBzZXQgYXMgdGhlIHZpZXcgbW9kZWwsIHBsdXMgYSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBjb250YWluaW5nIHRoZSByYXcgSFRNTCBvZiB0aGUgcmVuZGVyZWQgcGFydGlhbCB2aWV3LiBZb3VyIDxjb2RlPmxheW91dDwvY29kZT4gbWV0aG9kIHdpbGwgdHlwaWNhbGx5IHdyYXAgdGhlIHJhdyBIVE1MIGZvciB0aGUgcGFydGlhbCB3aXRoIHRoZSBiYXJlIGJvbmVzIG9mIGFuIEhUTUwgZG9jdW1lbnQuIENoZWNrIG91dCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvMzMyNzE3NTEzMTJkYjZlOTIwNTlkOTgyOTNkMGE3YWM2ZTllOGU1Yi92aWV3cy9zZXJ2ZXIvbGF5b3V0L2xheW91dC5qYWRlXFxcIj50aGUgPGNvZGU+bGF5b3V0LmphZGU8L2NvZGU+IHVzZWQgaW4gUG9ueSBGb288L2E+IGFzIGFuIGV4YW1wbGUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcm91dGVzLVxcXCI+PGNvZGU+b3B0aW9ucy5yb3V0ZXM8L2NvZGU+PC9oNj5cXG48cD5UaGUgb3RoZXIgYmlnIG9wdGlvbiBpcyA8Y29kZT5yb3V0ZXM8L2NvZGU+LCB3aGljaCBleHBlY3RzIGEgY29sbGVjdGlvbiBvZiByb3V0ZSBkZWZpbml0aW9ucy4gUm91dGUgZGVmaW5pdGlvbnMgdXNlIGEgbnVtYmVyIG9mIHByb3BlcnRpZXMgdG8gZGV0ZXJtaW5lIGhvdyB0aGUgcm91dGUgaXMgZ29pbmcgdG8gYmVoYXZlLjwvcD5cXG48cD5IZXJlJiMzOTtzIGFuIGV4YW1wbGUgcm91dGUgdGhhdCB1c2VzIHRoZSA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gcm91dGluZyBzY2hlbWUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPntcXG4gIHJvdXRlOiAmIzM5Oy9hcnRpY2xlcy86c2x1ZyYjMzk7LFxcbiAgYWN0aW9uOiAmIzM5O2FydGljbGVzL2FydGljbGUmIzM5OyxcXG4gIGlnbm9yZTogZmFsc2UsXFxuICBjYWNoZTogJmx0O2luaGVyaXQmZ3Q7XFxufVxcbjwvY29kZT48L3ByZT5cXG48dWw+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBpcyBhIHJvdXRlIGluIHRoZSBmb3JtYXQgeW91ciBIVFRQIGZyYW1ld29yayBvZiBjaG9pY2UgdW5kZXJzdGFuZHM8L2xpPlxcbjxsaT48Y29kZT5hY3Rpb248L2NvZGU+IGlzIHRoZSBuYW1lIG9mIHlvdXIgY29udHJvbGxlciBhY3Rpb24uIEl0JiMzOTtsbCBiZSB1c2VkIHRvIGZpbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCBzaG91bGQgYmUgdXNlZCB3aXRoIHRoaXMgcm91dGUsIGFuZCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvbGk+XFxuPGxpPjxjb2RlPmNhY2hlPC9jb2RlPiBjYW4gYmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGNsaWVudC1zaWRlIGNhY2hpbmcgYmVoYXZpb3IgaW4gdGhpcyBhcHBsaWNhdGlvbiBwYXRoLCBhbmQgaXQmIzM5O2xsIGRlZmF1bHQgdG8gaW5oZXJpdGluZyBmcm9tIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IDxlbT5vbiB0aGUgY2xpZW50LXNpZGU8L2VtPjwvbGk+XFxuPGxpPjxjb2RlPmlnbm9yZTwvY29kZT4gaXMgdXNlZCBpbiB0aG9zZSBjYXNlcyB3aGVyZSB5b3Ugd2FudCBhIFVSTCB0byBiZSBpZ25vcmVkIGJ5IHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZXZlbiBpZiB0aGVyZSYjMzk7cyBhIGNhdGNoLWFsbCByb3V0ZSB0aGF0IHdvdWxkIG1hdGNoIHRoYXQgVVJMPC9saT5cXG48L3VsPlxcbjxwPkFzIGFuIGV4YW1wbGUgb2YgdGhlIDxjb2RlPmlnbm9yZTwvY29kZT4gdXNlIGNhc2UsIGNvbnNpZGVyIHRoZSByb3V0aW5nIHRhYmxlIHNob3duIGJlbG93LiBUaGUgY2xpZW50LXNpZGUgcm91dGVyIGRvZXNuJiMzOTt0IGtub3cgPGVtPihhbmQgY2FuJiMzOTt0IGtub3cgdW5sZXNzIHlvdSBwb2ludCBpdCBvdXQpPC9lbT4gd2hhdCByb3V0ZXMgYXJlIHNlcnZlci1zaWRlIG9ubHksIGFuZCBpdCYjMzk7cyB1cCB0byB5b3UgdG8gcG9pbnQgdGhvc2Ugb3V0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj5bXFxuICB7IHJvdXRlOiAmIzM5Oy8mIzM5OywgYWN0aW9uOiAmIzM5Oy9ob21lL2luZGV4JiMzOTsgfSxcXG4gIHsgcm91dGU6ICYjMzk7L2ZlZWQmIzM5OywgaWdub3JlOiB0cnVlIH0sXFxuICB7IHJvdXRlOiAmIzM5Oy8qJiMzOTssIGFjdGlvbjogJiMzOTtlcnJvci9ub3QtZm91bmQmIzM5OyB9XFxuXVxcbjwvY29kZT48L3ByZT5cXG48cD5UaGlzIHN0ZXAgaXMgbmVjZXNzYXJ5IHdoZW5ldmVyIHlvdSBoYXZlIGFuIGFuY2hvciBsaW5rIHBvaW50ZWQgYXQgc29tZXRoaW5nIGxpa2UgYW4gUlNTIGZlZWQuIFRoZSA8Y29kZT5pZ25vcmU8L2NvZGU+IHByb3BlcnR5IGlzIGVmZmVjdGl2ZWx5IHRlbGxpbmcgdGhlIGNsaWVudC1zaWRlIDxlbT4mcXVvdDtkb24mIzM5O3QgaGlqYWNrIGxpbmtzIGNvbnRhaW5pbmcgdGhpcyBVUkwmcXVvdDs8L2VtPi48L3A+XFxuPHA+UGxlYXNlIG5vdGUgdGhhdCBleHRlcm5hbCBsaW5rcyBhcmUgbmV2ZXIgaGlqYWNrZWQuIE9ubHkgc2FtZS1vcmlnaW4gbGlua3MgY29udGFpbmluZyBhIFVSTCB0aGF0IG1hdGNoZXMgb25lIG9mIHRoZSByb3V0ZXMgd2lsbCBiZSBoaWphY2tlZCBieSBUYXVudXMuIEV4dGVybmFsIGxpbmtzIGRvbiYjMzk7dCBuZWVkIHRvIGJlIDxjb2RlPmlnbm9yZTwvY29kZT5kLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj48Y29kZT5vcHRpb25zLmdldERlZmF1bHRWaWV3TW9kZWw/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPmdldERlZmF1bHRWaWV3TW9kZWwoZG9uZSk8L2NvZGU+IHByb3BlcnR5IGNhbiBiZSBhIG1ldGhvZCB0aGF0IHB1dHMgdG9nZXRoZXIgdGhlIGJhc2UgdmlldyBtb2RlbCwgd2hpY2ggd2lsbCB0aGVuIGJlIGV4dGVuZGVkIG9uIGFuIGFjdGlvbi1ieS1hY3Rpb24gYmFzaXMuIFdoZW4geW91JiMzOTtyZSBkb25lIGNyZWF0aW5nIGEgdmlldyBtb2RlbCwgeW91IGNhbiBpbnZva2UgPGNvZGU+ZG9uZShudWxsLCBtb2RlbCk8L2NvZGU+LiBJZiBhbiBlcnJvciBvY2N1cnMgd2hpbGUgYnVpbGRpbmcgdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgY2FsbCA8Y29kZT5kb25lKGVycik8L2NvZGU+IGluc3RlYWQuPC9wPlxcbjxwPlRhdW51cyB3aWxsIHRocm93IGFuIGVycm9yIGlmIDxjb2RlPmRvbmU8L2NvZGU+IGlzIGludm9rZWQgd2l0aCBhbiBlcnJvciwgc28geW91IG1pZ2h0IHdhbnQgdG8gcHV0IHNhZmVndWFyZHMgaW4gcGxhY2UgYXMgdG8gYXZvaWQgdGhhdCBmcm9tIGhhcHBlbm5pbmcuIFRoZSByZWFzb24gdGhpcyBtZXRob2QgaXMgYXN5bmNocm9ub3VzIGlzIGJlY2F1c2UgeW91IG1heSBuZWVkIGRhdGFiYXNlIGFjY2VzcyBvciBzb21lc3VjaCB3aGVuIHB1dHRpbmcgdG9nZXRoZXIgdGhlIGRlZmF1bHRzLiBUaGUgcmVhc29uIHRoaXMgaXMgYSBtZXRob2QgYW5kIG5vdCBqdXN0IGFuIG9iamVjdCBpcyB0aGF0IHRoZSBkZWZhdWx0cyBtYXkgY2hhbmdlIGR1ZSB0byBodW1hbiBpbnRlcmFjdGlvbiB3aXRoIHRoZSBhcHBsaWNhdGlvbiwgYW5kIGluIHRob3NlIGNhc2VzIDxhIGhyZWY9XFxcIiN0YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWxcXFwiPnRoZSBkZWZhdWx0cyBjYW4gYmUgcmVidWlsdDwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcGxhaW50ZXh0LVxcXCI+PGNvZGU+b3B0aW9ucy5wbGFpbnRleHQ/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPnBsYWludGV4dDwvY29kZT4gb3B0aW9ucyBvYmplY3QgaXMgcGFzc2VkIGRpcmVjdGx5IHRvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9oZ2V0XFxcIj5oZ2V0PC9hPiwgYW5kIGl0JiMzOTtzIHVzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iL2Y2ZDZiNTA2OGZmMDNhMzg3ZjUwMzkwMDE2MGQ5ZmRjMWU3NDk3NTAvY29udHJvbGxlcnMvcm91dGluZy5qcyNMNzAtTDcyXFxcIj50d2VhayB0aGUgcGxhaW50ZXh0IHZlcnNpb248L2E+IG9mIHlvdXIgc2l0ZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1yZXNvbHZlcnMtXFxcIj48Y29kZT5vcHRpb25zLnJlc29sdmVycz88L2NvZGU+PC9oNj5cXG48cD5SZXNvbHZlcnMgYXJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBsb2NhdGlvbiBvZiBzb21lIG9mIHRoZSBkaWZmZXJlbnQgcGllY2VzIG9mIHlvdXIgYXBwbGljYXRpb24uIFR5cGljYWxseSB5b3Ugd29uJiMzOTt0IGhhdmUgdG8gdG91Y2ggdGhlc2UgaW4gdGhlIHNsaWdodGVzdC48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPlNpZ25hdHVyZTwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0U2VydmVyQ29udHJvbGxlcihhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0VmlldyhhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5UaGUgPGNvZGU+YWRkUm91dGU8L2NvZGU+IG1ldGhvZCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBvbiB0aGUgc2VydmVyLXNpZGUgaXMgbW9zdGx5IGdvaW5nIHRvIGJlIHVzZWQgaW50ZXJuYWxseSBieSB0aGUgSFRUUCBmcmFtZXdvcmsgcGx1Z2lucywgc28gZmVlbCBmcmVlIHRvIHNraXAgb3ZlciB0aGUgZm9sbG93aW5nIHNlY3Rpb24uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtdmVyc2lvbi1cXFwiPjxjb2RlPm9wdGlvbnMudmVyc2lvbj88L2NvZGU+PC9oNj5cXG48cD5SZWZlciB0byB0aGUgPGEgaHJlZj1cXFwiI3ZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2E+IHNlY3Rpb24uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiLWFkZHJvdXRlLWRlZmluaXRpb24tXFxcIj48Y29kZT5hZGRSb3V0ZShkZWZpbml0aW9uKTwvY29kZT48L2g0PlxcbjxwPlRoZSA8Y29kZT5hZGRSb3V0ZShkZWZpbml0aW9uKTwvY29kZT4gbWV0aG9kIHdpbGwgYmUgcGFzc2VkIGEgcm91dGUgZGVmaW5pdGlvbiwgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXMuIFRoaXMgbWV0aG9kIGlzIGV4cGVjdGVkIHRvIHJlZ2lzdGVyIGEgcm91dGUgaW4geW91ciBIVFRQIGZyYW1ld29yayYjMzk7cyByb3V0ZXIuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+cm91dGU8L2NvZGU+IGlzIHRoZSByb3V0ZSB0aGF0IHlvdSBzZXQgYXMgPGNvZGU+ZGVmaW5pdGlvbi5yb3V0ZTwvY29kZT48L2xpPlxcbjxsaT48Y29kZT5hY3Rpb248L2NvZGU+IGlzIHRoZSBhY3Rpb24gYXMgcGFzc2VkIHRvIHRoZSByb3V0ZSBkZWZpbml0aW9uPC9saT5cXG48bGk+PGNvZGU+YWN0aW9uRm48L2NvZGU+IHdpbGwgYmUgdGhlIGNvbnRyb2xsZXIgZm9yIHRoaXMgYWN0aW9uIG1ldGhvZDwvbGk+XFxuPGxpPjxjb2RlPm1pZGRsZXdhcmU8L2NvZGU+IHdpbGwgYmUgYW4gYXJyYXkgb2YgbWV0aG9kcyB0byBiZSBleGVjdXRlZCBiZWZvcmUgPGNvZGU+YWN0aW9uRm48L2NvZGU+PC9saT5cXG48L3VsPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yZW5kZXItYWN0aW9uLXZpZXdtb2RlbC1yZXEtcmVzLW5leHQtXFxcIj48Y29kZT50YXVudXMucmVuZGVyKGFjdGlvbiwgdmlld01vZGVsLCByZXEsIHJlcywgbmV4dCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBpcyBhbG1vc3QgYW4gaW1wbGVtZW50YXRpb24gZGV0YWlsIGFzIHlvdSBzaG91bGQgYmUgdXNpbmcgVGF1bnVzIHRocm91Z2ggb25lIG9mIHRoZSBwbHVnaW5zIGFueXdheXMsIHNvIHdlIHdvbiYjMzk7dCBnbyB2ZXJ5IGRlZXAgaW50byBpdC48L3A+XFxuPHA+VGhlIHJlbmRlciBtZXRob2QgaXMgd2hhdCBUYXVudXMgdXNlcyB0byByZW5kZXIgdmlld3MgYnkgY29uc3RydWN0aW5nIEhUTUwsIEpTT04sIG9yIHBsYWludGV4dCByZXNwb25zZXMuIFRoZSA8Y29kZT5hY3Rpb248L2NvZGU+IHByb3BlcnR5IGRldGVybWluZXMgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHdpbGwgYmUgcmVuZGVyZWQuIFRoZSA8Y29kZT52aWV3TW9kZWw8L2NvZGU+IHdpbGwgYmUgZXh0ZW5kZWQgYnkgPGEgaHJlZj1cXFwiIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj50aGUgZGVmYXVsdCB2aWV3IG1vZGVsPC9hPiwgYW5kIGl0IG1heSBhbHNvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IDxjb2RlPmFjdGlvbjwvY29kZT4gYnkgc2V0dGluZyA8Y29kZT52aWV3TW9kZWwubW9kZWwuYWN0aW9uPC9jb2RlPi48L3A+XFxuPHA+VGhlIDxjb2RlPnJlcTwvY29kZT4sIDxjb2RlPnJlczwvY29kZT4sIGFuZCA8Y29kZT5uZXh0PC9jb2RlPiBhcmd1bWVudHMgYXJlIGV4cGVjdGVkIHRvIGJlIHRoZSBFeHByZXNzIHJvdXRpbmcgYXJndW1lbnRzLCBidXQgdGhleSBjYW4gYWxzbyBiZSBtb2NrZWQgPGVtPih3aGljaCBpcyBpbiBmYWN0IHdoYXQgdGhlIEhhcGkgcGx1Z2luIGRvZXMpPC9lbT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsKGRvbmU/KTwvY29kZT48L2gyPlxcbjxwPk9uY2UgVGF1bnVzIGhhcyBiZWVuIG1vdW50ZWQsIGNhbGxpbmcgdGhpcyBtZXRob2Qgd2lsbCByZWJ1aWxkIHRoZSB2aWV3IG1vZGVsIGRlZmF1bHRzIHVzaW5nIHRoZSA8Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsPC9jb2RlPiB0aGF0IHdhcyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpbiB0aGUgb3B0aW9ucy4gQW4gb3B0aW9uYWwgPGNvZGU+ZG9uZTwvY29kZT4gY2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gdGhlIG1vZGVsIGlzIHJlYnVpbHQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwic2VydmVyLXNpZGUtY29udHJvbGxlcnNcXFwiPlNlcnZlci1TaWRlIENvbnRyb2xsZXJzPC9oMT5cXG48cD5PbiB0aGUgc2VydmVyLXNpZGUsIGNvbnRyb2xsZXJzIGFyZSBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIGZ1bmN0aW9uLiBUaGUgcGFyYW1ldGVycyBwYXNzZWQgdG8gdGhlc2UgY29udHJvbGxlcnMgZGVwZW5kIG9uIHRoZSBzZXJ2ZXItc2lkZSBIVFRQIGZyYW1ld29yayB0aGF0JiMzOTtzIGJlaW5nIHVzZWQuPC9wPlxcbjxwPkZvciBleGFtcGxlLCBFeHByZXNzIGdpdmVzIHVzIHRocmVlIHBhcmFtZXRlcnM6IDxjb2RlPnJlcTwvY29kZT4sIDxjb2RlPnJlczwvY29kZT4gYW5kIDxjb2RlPm5leHQ8L2NvZGU+LiBIYXBpIGdpdmVzIHVzIHR3byBpbnN0ZWFkOiA8Y29kZT5yZXF1ZXN0PC9jb2RlPiBhbmQgPGNvZGU+cmVwbHk8L2NvZGU+LjwvcD5cXG48cD5IZXJlJiMzOTtzIGEgc2FtcGxlIGNvbnRyb2xsZXIgdXNpbmcgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+LCBhcyA8YSBocmVmPVxcXCIjdXNpbmctdGF1bnVzLWV4cHJlc3MtXFxcIj5kZXRhaWxlZCBiZWxvdzwvYT4uIFRoaXMgaXMgYSB2ZXJ5IHNpbXBsZSBjb250cm9sbGVyIHdoZXJlIHdlIGFyZSBzZXR0aW5nIHRoZSBzcGVjaWFsIDxjb2RlPnZpZXdNb2RlbDwvY29kZT4gcHJvcGVydHkgb24gdGhlIHJlc3BvbnNlLCBhbmQgY2FsbGluZyA8Y29kZT5uZXh0PC9jb2RlPi4gU3VwcG9zZSB0aGlzIGNvbnRyb2xsZXIgaXMgdGhlIDxjb2RlPnByb2R1Y3QvaG9tZTwvY29kZT4gYWN0aW9uIGhhbmRsZXIuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICByZXMudmlld01vZGVsID0ge1xcbiAgICBtb2RlbDoge1xcbiAgICAgIHRpdGxlOiAmIzM5O3ZpZXcgdGl0bGUmIzM5O1xcbiAgICB9XFxuICB9O1xcbiAgbmV4dCgpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkFzIHlvdSBjYW4gc2VlLCBUYXVudXMgd29uJiMzOTt0IGFsdGVyIHRoZSBBUEkgcHJvdmlkZWQgYnkgRXhwcmVzcy4gSW5zdGVhZCwgaXQgYnVpbGRzIHVwb24gdGhlIG5vdGlvbiBvZiB1c2luZyBtaWRkbGV3YXJlLiBPbmNlIHRoZSA8Y29kZT5wcm9kdWN0L2hvbWU8L2NvZGU+IHZpZXcgaXMgcmVuZGVyZWQgYW5kIEphdmFTY3JpcHQgbG9hZHMsIHRoZSA8Y29kZT5wcm9kdWN0L2hvbWU8L2NvZGU+IHZpZXcgY29udHJvbGxlciBpcyBleGVjdXRlZCBvbiB0aGUgY2xpZW50LXNpZGUuPC9wPlxcbjxwPllvdSBjb3VsZCBjaGFuZ2UgdGhlIHZpZXcgdG8gYmUgcmVuZGVyZWQgYnkgc2V0dGluZyB0aGUgPGNvZGU+YWN0aW9uPC9jb2RlPiBwcm9wZXJ0eSBvbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+LiBJbiB0aGUgZXhhbXBsZSBzaG93biBiZWxvdyB0aGlzIHdvdWxkIG1lYW4gdGhhdCB0aGUgPGNvZGU+ZXJyb3Ivb2ZmbGluZTwvY29kZT4gdmlldyB3b3VsZCBiZSByZW5kZXJlZC4gVGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgd2lsbCBiZSB0aGF0IG9mIDxjb2RlPmVycm9yL29mZmxpbmU8L2NvZGU+LCBhcyB3ZWxsLiBWaWV3IGNvbnRyb2xsZXJzIGFyZSB0aWVkIHRvIHRoZSB2aWV3IHRoYXQgZ2V0cyByZW5kZXJlZC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+bW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgIG1vZGVsOiB7XFxuICAgICAgdGl0bGU6ICYjMzk7dmlldyB0aXRsZSYjMzk7XFxuICAgIH1cXG4gIH07XFxuICBpZiAob2ZmbGluZSkge1xcbiAgICByZXMudmlld01vZGVsLm1vZGVsLmFjdGlvbiA9ICYjMzk7ZXJyb3Ivb2ZmbGluZSYjMzk7O1xcbiAgfVxcbiAgbmV4dCgpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkhhdmluZyBhIGRlZmF1bHQgYWN0aW9uIGFuZCB0aGUgYWJpbGl0eSB0byByZWRpcmVjdCB0byBhbm90aGVyIGdpdmVzIHVzIGEgbG90IG9mIGZsZXhpYmlsaXR5IHdoZW4gZGV0ZXJtaW5pbmcgaG93IHRvIHJlc3BvbmQgdG8gYSByZXF1ZXN0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImh0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgRnJhbWV3b3JrIFBsdWdpbnM8L2gxPlxcbjxwPlRoZXJlJiMzOTtzIGN1cnJlbnRseSB0d28gZGlmZmVyZW50IEhUVFAgZnJhbWV3b3JrcyA8ZW0+KDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBhbmQgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+KTwvZW0+IHRoYXQgeW91IGNhbiByZWFkaWx5IHVzZSB3aXRoIFRhdW51cyB3aXRob3V0IGhhdmluZyB0byBkZWFsIHdpdGggYW55IG9mIHRoZSByb3V0ZSBwbHVtYmluZyB5b3Vyc2VsZi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCJ1c2luZy10YXVudXMtZXhwcmVzcy1cXFwiPlVzaW5nIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPjwvaDI+XFxuPHA+VGhlIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiBwbHVnaW4gaXMgcHJvYmFibHkgdGhlIGVhc2llc3QgdG8gdXNlLCBhcyBUYXVudXMgd2FzIG9yaWdpbmFsbHkgZGV2ZWxvcGVkIHdpdGgganVzdCA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gaW4gbWluZC4gSW4gYWRkaXRpb24gdG8gdGhlIG9wdGlvbnMgYWxyZWFkeSBvdXRsaW5lZCBmb3IgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPnRhdW51cy5tb3VudDwvYT4sIHlvdSBjYW4gYWRkIG1pZGRsZXdhcmUgZm9yIGFueSByb3V0ZSBpbmRpdmlkdWFsbHkuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+bWlkZGxld2FyZTwvY29kZT4gYXJlIGFueSBtZXRob2RzIHlvdSB3YW50IFRhdW51cyB0byBleGVjdXRlIGFzIG1pZGRsZXdhcmUgaW4gRXhwcmVzcyBhcHBsaWNhdGlvbnM8L2xpPlxcbjwvdWw+XFxuPHA+VG8gZ2V0IDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIHByb3ZpZGVkIHRoYXQgeW91IGNvbWUgdXAgd2l0aCBhbiA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIC8vIC4uLlxcbn07XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBtZXRob2Qgd2lsbCBtZXJlbHkgc2V0IHVwIFRhdW51cyBhbmQgYWRkIHRoZSByZWxldmFudCByb3V0ZXMgdG8geW91ciBFeHByZXNzIGFwcGxpY2F0aW9uIGJ5IGNhbGxpbmcgPGNvZGU+YXBwLmdldDwvY29kZT4gYSBidW5jaCBvZiB0aW1lcy4gWW91IGNhbiA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxcIj5maW5kIHRhdW51cy1leHByZXNzIG9uIEdpdEh1YjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwidXNpbmctdGF1bnVzLWhhcGktXFxcIj5Vc2luZyA8Y29kZT50YXVudXMtaGFwaTwvY29kZT48L2gyPlxcbjxwPlRoZSA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4gcGx1Z2luIGlzIGEgYml0IG1vcmUgaW52b2x2ZWQsIGFuZCB5b3UmIzM5O2xsIGhhdmUgdG8gY3JlYXRlIGEgUGFjayBpbiBvcmRlciB0byB1c2UgaXQuIEluIGFkZGl0aW9uIHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj50aGUgb3B0aW9ucyB3ZSYjMzk7dmUgYWxyZWFkeSBjb3ZlcmVkPC9hPiwgeW91IGNhbiBhZGQgPGNvZGU+Y29uZmlnPC9jb2RlPiBvbiBhbnkgcm91dGUuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+Y29uZmlnPC9jb2RlPiBpcyBwYXNzZWQgZGlyZWN0bHkgaW50byB0aGUgcm91dGUgcmVnaXN0ZXJlZCB3aXRoIEhhcGksIGdpdmluZyB5b3UgdGhlIG1vc3QgZmxleGliaWxpdHk8L2xpPlxcbjwvdWw+XFxuPHA+VG8gZ2V0IDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPiBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIGFuZCB5b3UgY2FuIGJyaW5nIHlvdXIgb3duIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIEhhcGkgPSByZXF1aXJlKCYjMzk7aGFwaSYjMzk7KTtcXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzSGFwaSA9IHJlcXVpcmUoJiMzOTt0YXVudXMtaGFwaSYjMzk7KSh0YXVudXMpO1xcbnZhciBwYWNrID0gbmV3IEhhcGkuUGFjaygpO1xcblxcbnBhY2sucmVnaXN0ZXIoe1xcbiAgcGx1Z2luOiB0YXVudXNIYXBpLFxcbiAgb3B0aW9uczoge1xcbiAgICAvLyAuLi5cXG4gIH1cXG59KTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPnRhdW51c0hhcGk8L2NvZGU+IHBsdWdpbiB3aWxsIG1vdW50IFRhdW51cyBhbmQgcmVnaXN0ZXIgYWxsIG9mIHRoZSBuZWNlc3Nhcnkgcm91dGVzLiBZb3UgY2FuIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPmZpbmQgdGF1bnVzLWhhcGkgb24gR2l0SHViPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJjb21tYW5kLWxpbmUtaW50ZXJmYWNlXFxcIj5Db21tYW5kLUxpbmUgSW50ZXJmYWNlPC9oMT5cXG48cD5PbmNlIHlvdSYjMzk7dmUgc2V0IHVwIHRoZSBzZXJ2ZXItc2lkZSB0byByZW5kZXIgeW91ciB2aWV3cyB1c2luZyBUYXVudXMsIGl0JiMzOTtzIG9ubHkgbG9naWNhbCB0aGF0IHlvdSYjMzk7bGwgd2FudCB0byByZW5kZXIgdGhlIHZpZXdzIGluIHRoZSBjbGllbnQtc2lkZSBhcyB3ZWxsLCBlZmZlY3RpdmVseSBjb252ZXJ0aW5nIHlvdXIgYXBwbGljYXRpb24gaW50byBhIHNpbmdsZS1wYWdlIGFwcGxpY2F0aW9uIGFmdGVyIHRoZSBmaXJzdCB2aWV3IGhhcyBiZWVuIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS48L3A+XFxuPHA+VGhlIFRhdW51cyBDTEkgaXMgYW4gdXNlZnVsIGludGVybWVkaWFyeSBpbiB0aGUgcHJvY2VzcyBvZiBnZXR0aW5nIHRoZSBjb25maWd1cmF0aW9uIHlvdSB3cm90ZSBzbyBmYXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSB0byBhbHNvIHdvcmsgd2VsbCBpbiB0aGUgY2xpZW50LXNpZGUuPC9wPlxcbjxwPkluc3RhbGwgaXQgZ2xvYmFsbHkgZm9yIGRldmVsb3BtZW50LCBidXQgcmVtZW1iZXIgdG8gdXNlIGxvY2FsIGNvcGllcyBmb3IgcHJvZHVjdGlvbi1ncmFkZSB1c2VzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtZyB0YXVudXNcXG48L2NvZGU+PC9wcmU+XFxuPHA+V2hlbiBpbnZva2VkIHdpdGhvdXQgYW55IGFyZ3VtZW50cywgdGhlIENMSSB3aWxsIHNpbXBseSBmb2xsb3cgdGhlIGRlZmF1bHQgY29udmVudGlvbnMgdG8gZmluZCB5b3VyIHJvdXRlIGRlZmluaXRpb25zLCB2aWV3cywgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXNcXG48L2NvZGU+PC9wcmU+XFxuPHA+QnkgZGVmYXVsdCwgdGhlIG91dHB1dCB3aWxsIGJlIHByaW50ZWQgdG8gdGhlIHN0YW5kYXJkIG91dHB1dCwgbWFraW5nIGZvciBhIGZhc3QgZGVidWdnaW5nIGV4cGVyaWVuY2UuIEhlcmUmIzM5O3MgdGhlIG91dHB1dCBpZiB5b3UganVzdCBoYWQgYSBzaW5nbGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gcm91dGUsIGFuZCB0aGUgbWF0Y2hpbmcgdmlldyBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlciBleGlzdGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGVtcGxhdGVzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuL3ZpZXdzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciBjb250cm9sbGVycyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li4vY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciByb3V0ZXMgPSBbXFxuICB7XFxuICAgIHJvdXRlOiAmIzM5Oy8mIzM5OyxcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbl07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+WW91IGNhbiB1c2UgYSBmZXcgb3B0aW9ucyB0byBhbHRlciB0aGUgb3V0Y29tZSBvZiBpbnZva2luZyA8Y29kZT50YXVudXM8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi1vdXRwdXQtXFxcIj48Y29kZT4tLW91dHB1dDwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1vPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+T3V0cHV0IGlzIHdyaXR0ZW4gdG8gYSBmaWxlIGluc3RlYWQgb2YgdG8gc3RhbmRhcmQgb3V0cHV0LiBUaGUgZmlsZSBwYXRoIHVzZWQgd2lsbCBiZSB0aGUgPGNvZGU+Y2xpZW50X3dpcmluZzwvY29kZT4gb3B0aW9uIGluIDxhIGhyZWY9XFxcIiN0aGUtdGF1bnVzcmMtbWFuaWZlc3RcXFwiPjxjb2RlPi50YXVudXNyYzwvY29kZT48L2E+LCB3aGljaCBkZWZhdWx0cyB0byA8Y29kZT4mIzM5Oy5iaW4vd2lyaW5nLmpzJiMzOTs8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi13YXRjaC1cXFwiPjxjb2RlPi0td2F0Y2g8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tdzwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPldoZW5ldmVyIGEgc2VydmVyLXNpZGUgcm91dGUgZGVmaW5pdGlvbiBjaGFuZ2VzLCB0aGUgb3V0cHV0IGlzIHByaW50ZWQgYWdhaW4gdG8gZWl0aGVyIHN0YW5kYXJkIG91dHB1dCBvciBhIGZpbGUsIGRlcGVuZGluZyBvbiB3aGV0aGVyIDxjb2RlPi0tb3V0cHV0PC9jb2RlPiB3YXMgdXNlZC48L3A+XFxuPHA+VGhlIHByb2dyYW0gd29uJiMzOTt0IGV4aXQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRyYW5zZm9ybS1tb2R1bGUtXFxcIj48Y29kZT4tLXRyYW5zZm9ybSAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi10PC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+VGhpcyBmbGFnIGFsbG93cyB5b3UgdG8gdHJhbnNmb3JtIHNlcnZlci1zaWRlIHJvdXRlcyBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgdW5kZXJzdGFuZHMuIEV4cHJlc3Mgcm91dGVzIGFyZSBjb21wbGV0ZWx5IGNvbXBhdGlibGUgd2l0aCB0aGUgY2xpZW50LXNpZGUgcm91dGVyLCBidXQgSGFwaSByb3V0ZXMgbmVlZCB0byBiZSB0cmFuc2Zvcm1lZCB1c2luZyB0aGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxcIj48Y29kZT5oYXBpaWZ5PC9jb2RlPjwvYT4gbW9kdWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCBoYXBpaWZ5XFxudGF1bnVzIC10IGhhcGlpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+VXNpbmcgdGhpcyB0cmFuc2Zvcm0gcmVsaWV2ZXMgeW91IGZyb20gaGF2aW5nIHRvIGRlZmluZSB0aGUgc2FtZSByb3V0ZXMgdHdpY2UgdXNpbmcgc2xpZ2h0bHkgZGlmZmVyZW50IGZvcm1hdHMgdGhhdCBjb252ZXkgdGhlIHNhbWUgbWVhbmluZy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItcmVzb2x2ZXJzLW1vZHVsZS1cXFwiPjxjb2RlPi0tcmVzb2x2ZXJzICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXI8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5TaW1pbGFybHkgdG8gdGhlIDxhIGhyZWY9XFxcIiMtb3B0aW9ucy1yZXNvbHZlcnMtXFxcIj48Y29kZT5yZXNvbHZlcnM8L2NvZGU+PC9hPiBvcHRpb24gdGhhdCB5b3UgY2FuIHBhc3MgdG8gPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudDwvY29kZT48L2E+LCB0aGVzZSByZXNvbHZlcnMgY2FuIGNoYW5nZSB0aGUgd2F5IGluIHdoaWNoIGZpbGUgcGF0aHMgYXJlIHJlc29sdmVkLjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+U2lnbmF0dXJlPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRDbGllbnRDb250cm9sbGVyKGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gY2xpZW50LXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5nZXRWaWV3KGFjdGlvbik8L2NvZGU+PC90ZD5cXG48dGQ+UmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGU8L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXN0YW5kYWxvbmUtXFxcIj48Y29kZT4tLXN0YW5kYWxvbmU8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tczwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPlVuZGVyIHRoaXMgZXhwZXJpbWVudGFsIGZsYWcsIHRoZSBDTEkgd2lsbCB1c2UgQnJvd3NlcmlmeSB0byBjb21waWxlIGEgc3RhbmRhbG9uZSBtb2R1bGUgdGhhdCBpbmNsdWRlcyB0aGUgd2lyaW5nIG5vcm1hbGx5IGV4cG9ydGVkIGJ5IHRoZSBDTEkgcGx1cyBhbGwgb2YgVGF1bnVzIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS91bWRqcy91bWRcXFwiPmFzIGEgVU1EIG1vZHVsZTwvYT4uPC9wPlxcbjxwPlRoaXMgd291bGQgYWxsb3cgeW91IHRvIHVzZSBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIGV2ZW4gaWYgeW91IGRvbiYjMzk7dCB3YW50IHRvIHVzZSA8YSBocmVmPVxcXCJodHRwOi8vYnJvd3NlcmlmeS5vcmdcXFwiPkJyb3dzZXJpZnk8L2E+IGRpcmVjdGx5LjwvcD5cXG48cD5GZWVkYmFjayBhbmQgc3VnZ2VzdGlvbnMgYWJvdXQgdGhpcyBmbGFnLCA8ZW0+YW5kIHBvc3NpYmxlIGFsdGVybmF0aXZlcyB0aGF0IHdvdWxkIG1ha2UgVGF1bnVzIGVhc2llciB0byB1c2U8L2VtPiwgYXJlIHdlbGNvbWUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiY2xpZW50LXNpZGUtYXBpXFxcIj5DbGllbnQtc2lkZSBBUEk8L2gxPlxcbjxwPkp1c3QgbGlrZSB0aGUgc2VydmVyLXNpZGUsIGV2ZXJ5dGhpbmcgaW4gdGhlIGNsaWVudC1zaWRlIGJlZ2lucyBhdCB0aGUgbW91bnRwb2ludC4gT25jZSB0aGUgYXBwbGljYXRpb24gaXMgbW91bnRlZCwgYW5jaG9yIGxpbmtzIHdpbGwgYmUgaGlqYWNrZWQgYW5kIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgd2lsbCB0YWtlIG92ZXIgdmlldyByZW5kZXJpbmcuIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleGVjdXRlZCB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcsIG9wdGlvbnM/KTwvY29kZT48L2gyPlxcbjxwPlRoZSBtb3VudHBvaW50IHRha2VzIGEgcm9vdCBjb250YWluZXIsIHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgYW4gb3B0aW9ucyBwYXJhbWV0ZXIuIFRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+IGlzIHdoZXJlIGNsaWVudC1zaWRlLXJlbmRlcmVkIHZpZXdzIHdpbGwgYmUgcGxhY2VkLCBieSByZXBsYWNpbmcgd2hhdGV2ZXIgSFRNTCBjb250ZW50cyBhbHJlYWR5IGV4aXN0LiBZb3UgY2FuIHBhc3MgaW4gdGhlIDxjb2RlPndpcmluZzwvY29kZT4gbW9kdWxlIGV4YWN0bHkgYXMgYnVpbHQgYnkgdGhlIENMSSwgYW5kIG5vIGZ1cnRoZXIgY29uZmlndXJhdGlvbiBpcyBuZWNlc3NhcnkuPC9wPlxcbjxwPldoZW4gdGhlIG1vdW50cG9pbnQgZXhlY3V0ZXMsIFRhdW51cyB3aWxsIGNvbmZpZ3VyZSBpdHMgaW50ZXJuYWwgc3RhdGUsIDxlbT5zZXQgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvZW0+LCBydW4gdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3LCBhbmQgc3RhcnQgaGlqYWNraW5nIGxpbmtzLjwvcD5cXG48cD5BcyBhbiBleGFtcGxlLCBjb25zaWRlciBhIGJyb3dzZXIgbWFrZXMgYSA8Y29kZT5HRVQ8L2NvZGU+IHJlcXVlc3QgZm9yIDxjb2RlPi9hcnRpY2xlcy90aGUtZm94PC9jb2RlPiBmb3IgdGhlIGZpcnN0IHRpbWUuIE9uY2UgPGNvZGU+dGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nKTwvY29kZT4gaXMgaW52b2tlZCBvbiB0aGUgY2xpZW50LXNpZGUsIHNldmVyYWwgdGhpbmdzIHdvdWxkIGhhcHBlbiBpbiB0aGUgb3JkZXIgbGlzdGVkIGJlbG93LjwvcD5cXG48dWw+XFxuPGxpPlRhdW51cyBzZXRzIHVwIHRoZSBjbGllbnQtc2lkZSB2aWV3IHJvdXRpbmcgZW5naW5lPC9saT5cXG48bGk+SWYgZW5hYmxlZCA8ZW0+KHZpYSA8Y29kZT5vcHRpb25zPC9jb2RlPik8L2VtPiwgdGhlIGNhY2hpbmcgZW5naW5lIGlzIGNvbmZpZ3VyZWQ8L2xpPlxcbjxsaT5UYXVudXMgb2J0YWlucyB0aGUgdmlldyBtb2RlbCA8ZW0+KG1vcmUgb24gdGhpcyBsYXRlcik8L2VtPjwvbGk+XFxuPGxpPldoZW4gYSB2aWV3IG1vZGVsIGlzIG9idGFpbmVkLCB0aGUgPGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPiBldmVudCBpcyBlbWl0dGVkPC9saT5cXG48bGk+QW5jaG9yIGxpbmtzIHN0YXJ0IGJlaW5nIG1vbml0b3JlZCBmb3IgY2xpY2tzIDxlbT4oYXQgdGhpcyBwb2ludCB5b3VyIGFwcGxpY2F0aW9uIGJlY29tZXMgYSA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NpbmdsZS1wYWdlX2FwcGxpY2F0aW9uXFxcIj5TUEE8L2E+KTwvZW0+PC9saT5cXG48bGk+VGhlIDxjb2RlPmFydGljbGVzL2FydGljbGU8L2NvZGU+IGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgZXhlY3V0ZWQ8L2xpPlxcbjwvdWw+XFxuPHA+VGhhdCYjMzk7cyBxdWl0ZSBhIGJpdCBvZiBmdW5jdGlvbmFsaXR5LCBidXQgaWYgeW91IHRoaW5rIGFib3V0IGl0LCBtb3N0IG90aGVyIGZyYW1ld29ya3MgYWxzbyByZW5kZXIgdGhlIHZpZXcgYXQgdGhpcyBwb2ludCwgPGVtPnJhdGhlciB0aGFuIG9uIHRoZSBzZXJ2ZXItc2lkZSE8L2VtPjwvcD5cXG48cD5JbiBvcmRlciB0byBiZXR0ZXIgdW5kZXJzdGFuZCB0aGUgcHJvY2VzcywgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgPGNvZGU+b3B0aW9uczwvY29kZT4gcGFyYW1ldGVyLjwvcD5cXG48cD5GaXJzdCBvZmYsIHRoZSA8Y29kZT5ib290c3RyYXA8L2NvZGU+IG9wdGlvbiBkZXRlcm1pbmVzIHRoZSBzdHJhdGVneSB1c2VkIHRvIHB1bGwgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZXJlIGFyZSB0aHJlZSBwb3NzaWJsZSBzdHJhdGVnaWVzIGF2YWlsYWJsZTogPGNvZGU+YXV0bzwvY29kZT4gPGVtPih0aGUgZGVmYXVsdCBzdHJhdGVneSk8L2VtPiwgPGNvZGU+aW5saW5lPC9jb2RlPiwgb3IgPGNvZGU+bWFudWFsPC9jb2RlPi4gVGhlIDxjb2RlPmF1dG88L2NvZGU+IHN0cmF0ZWd5IGludm9sdmVzIHRoZSBsZWFzdCB3b3JrLCB3aGljaCBpcyB3aHkgaXQmIzM5O3MgdGhlIGRlZmF1bHQuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+YXV0bzwvY29kZT4gd2lsbCBtYWtlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWw8L2xpPlxcbjxsaT48Y29kZT5pbmxpbmU8L2NvZGU+IGV4cGVjdHMgeW91IHRvIHBsYWNlIHRoZSBtb2RlbCBpbnRvIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZzwvbGk+XFxuPGxpPjxjb2RlPm1hbnVhbDwvY29kZT4gZXhwZWN0cyB5b3UgdG8gZ2V0IHRoZSB2aWV3IG1vZGVsIGhvd2V2ZXIgeW91IHdhbnQgdG8sIGFuZCB0aGVuIGxldCBUYXVudXMga25vdyB3aGVuIGl0JiMzOTtzIHJlYWR5PC9saT5cXG48L3VsPlxcbjxwPkxldCYjMzk7cyBnbyBpbnRvIGRldGFpbCBhYm91dCBlYWNoIG9mIHRoZXNlIHN0cmF0ZWdpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWF1dG8tc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5hdXRvPC9jb2RlPiBzdHJhdGVneTwvaDQ+XFxuPHA+VGhlIDxjb2RlPmF1dG88L2NvZGU+IHN0cmF0ZWd5IG1lYW5zIHRoYXQgVGF1bnVzIHdpbGwgbWFrZSB1c2Ugb2YgYW4gQUpBWCByZXF1ZXN0IHRvIG9idGFpbiB0aGUgdmlldyBtb2RlbC4gPGVtPllvdSBkb24mIzM5O3QgaGF2ZSB0byBkbyBhbnl0aGluZyBlbHNlPC9lbT4gYW5kIHRoaXMgaXMgdGhlIGRlZmF1bHQgc3RyYXRlZ3kuIFRoaXMgaXMgdGhlIDxzdHJvbmc+bW9zdCBjb252ZW5pZW50IHN0cmF0ZWd5LCBidXQgYWxzbyB0aGUgc2xvd2VzdDwvc3Ryb25nPiBvbmUuPC9wPlxcbjxwPkl0JiMzOTtzIHNsb3cgYmVjYXVzZSB0aGUgdmlldyBtb2RlbCB3b24mIzM5O3QgYmUgcmVxdWVzdGVkIHVudGlsIHRoZSBidWxrIG9mIHlvdXIgSmF2YVNjcmlwdCBjb2RlIGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgZXhlY3V0ZWQsIGFuZCA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGludm9rZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWlubGluZS1zdHJhdGVneVxcXCI+VXNpbmcgdGhlIDxjb2RlPmlubGluZTwvY29kZT4gc3RyYXRlZ3k8L2g0PlxcbjxwPlRoZSA8Y29kZT5pbmxpbmU8L2NvZGU+IHN0cmF0ZWd5IGV4cGVjdHMgeW91IHRvIGFkZCBhIDxjb2RlPmRhdGEtdGF1bnVzPC9jb2RlPiBhdHRyaWJ1dGUgb24gdGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4gZWxlbWVudC4gVGhpcyBhdHRyaWJ1dGUgbXVzdCBiZSBlcXVhbCB0byB0aGUgPGNvZGU+aWQ8L2NvZGU+IGF0dHJpYnV0ZSBvZiBhIDxjb2RlPiZsdDtzY3JpcHQmZ3Q7PC9jb2RlPiB0YWcgY29udGFpbmluZyB0aGUgc2VyaWFsaXplZCB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmVyc2lvbiBpbmZvcm1hdGlvbiBhdXRvbWF0aWNhbGx5IGluamVjdGVkIGJ5IFRhdW51cyBpbnRvIHRoZSBsYXlvdXQgdGVtcGxhdGUgZGF0YS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj5kaXYoZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KSE9cGFydGlhbFxcbnNjcmlwdCh0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OywgZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KT1KU09OLnN0cmluZ2lmeSh7IHZlcnNpb246IHZlcnNpb24sIG1vZGVsOiBtb2RlbCB9KVxcbjwvY29kZT48L3ByZT5cXG48cD5QYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gdGhlIGZhY3QgdGhhdCB0aGUgbW9kZWwgaXMgbm90IG9ubHkgbWFkZSBpbnRvIGEgSlNPTiBzdHJpbmcsIDxlbT5idXQgYWxzbyBIVE1MIGVuY29kZWQgYnkgSmFkZTwvZW0+LiBXaGVuIFRhdW51cyBleHRyYWN0cyB0aGUgbW9kZWwgZnJvbSB0aGUgPGNvZGU+Jmx0O3NjcmlwdCZndDs8L2NvZGU+IHRhZyBpdCYjMzk7bGwgdW5lc2NhcGUgaXQsIGFuZCB0aGVuIHBhcnNlIGl0IGFzIEpTT04uPC9wPlxcbjxwPlRoaXMgc3RyYXRlZ3kgaXMgYWxzbyBmYWlybHkgY29udmVuaWVudCB0byBzZXQgdXAsIGJ1dCBpdCBpbnZvbHZlcyBhIGxpdHRsZSBtb3JlIHdvcmsuIEl0IG1pZ2h0IGJlIHdvcnRod2hpbGUgdG8gdXNlIGluIGNhc2VzIHdoZXJlIG1vZGVscyBhcmUgc21hbGwsIGJ1dCBpdCB3aWxsIHNsb3cgZG93biBzZXJ2ZXItc2lkZSB2aWV3IHJlbmRlcmluZywgYXMgdGhlIG1vZGVsIGlzIGlubGluZWQgYWxvbmdzaWRlIHRoZSBIVE1MLjwvcD5cXG48cD5UaGF0IG1lYW5zIHRoYXQgdGhlIGNvbnRlbnQgeW91IGFyZSBzdXBwb3NlZCB0byBiZSBwcmlvcml0aXppbmcgaXMgZ29pbmcgdG8gdGFrZSBsb25nZXIgdG8gZ2V0IHRvIHlvdXIgaHVtYW5zLCBidXQgb25jZSB0aGV5IGdldCB0aGUgSFRNTCwgdGhpcyBzdHJhdGVneSB3aWxsIGV4ZWN1dGUgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWxtb3N0IGltbWVkaWF0ZWx5LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5tYW51YWw8L2NvZGU+IHN0cmF0ZWd5PC9oND5cXG48cD5UaGUgPGNvZGU+bWFudWFsPC9jb2RlPiBzdHJhdGVneSBpcyB0aGUgbW9zdCBpbnZvbHZlZCBvZiB0aGUgdGhyZWUsIGJ1dCBhbHNvIHRoZSBtb3N0IHBlcmZvcm1hbnQuIEluIHRoaXMgc3RyYXRlZ3kgeW91JiMzOTtyZSBzdXBwb3NlZCB0byBhZGQgdGhlIGZvbGxvd2luZyA8ZW0+KHNlZW1pbmdseSBwb2ludGxlc3MpPC9lbT4gc25pcHBldCBvZiBjb2RlIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCZndDs8L2NvZGU+IG90aGVyIHRoYW4gdGhlIG9uZSB0aGF0JiMzOTtzIHB1bGxpbmcgZG93biBUYXVudXMsIHNvIHRoYXQgdGhleSBhcmUgcHVsbGVkIGNvbmN1cnJlbnRseSByYXRoZXIgdGhhbiBzZXJpYWxseS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxud2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PbmNlIHlvdSBzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGludm9rZSA8Y29kZT50YXVudXNSZWFkeShtb2RlbCk8L2NvZGU+LiBDb25zaWRlcmluZyB5b3UmIzM5O2xsIGJlIHB1bGxpbmcgYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGF0IHRoZSBzYW1lIHRpbWUsIGEgbnVtYmVyIG9mIGRpZmZlcmVudCBzY2VuYXJpb3MgbWF5IHBsYXkgb3V0LjwvcD5cXG48dWw+XFxuPGxpPlRoZSB2aWV3IG1vZGVsIGlzIGxvYWRlZCBmaXJzdCwgeW91IGNhbGwgPGNvZGU+dGF1bnVzUmVhZHkobW9kZWwpPC9jb2RlPiBhbmQgd2FpdCBmb3IgVGF1bnVzIHRvIHRha2UgdGhlIG1vZGVsIG9iamVjdCBhbmQgYm9vdCB0aGUgYXBwbGljYXRpb24gYXMgc29vbiBhcyA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGV4ZWN1dGVkPC9saT5cXG48bGk+VGF1bnVzIGxvYWRzIGZpcnN0IGFuZCA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGlzIGNhbGxlZCBmaXJzdC4gSW4gdGhpcyBjYXNlLCBUYXVudXMgd2lsbCByZXBsYWNlIDxjb2RlPndpbmRvdy50YXVudXNSZWFkeTwvY29kZT4gd2l0aCBhIHNwZWNpYWwgPGNvZGU+Ym9vdDwvY29kZT4gbWV0aG9kLiBXaGVuIHRoZSB2aWV3IG1vZGVsIGZpbmlzaGVzIGxvYWRpbmcsIHlvdSBjYWxsIDxjb2RlPnRhdW51c1JlYWR5KG1vZGVsKTwvY29kZT4gYW5kIHRoZSBhcHBsaWNhdGlvbiBmaW5pc2hlcyBib290aW5nPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHRoaXMgc291bmRzIGEgbGl0dGxlIG1pbmQtYmVuZGluZyBpdCYjMzk7cyBiZWNhdXNlIGl0IGlzLiBJdCYjMzk7cyBub3QgZGVzaWduZWQgdG8gYmUgcHJldHR5LCBidXQgbWVyZWx5IHRvIGJlIHBlcmZvcm1hbnQuPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5Ob3cgdGhhdCB3ZSYjMzk7dmUgYWRkcmVzc2VkIHRoZSBhd2t3YXJkIGJpdHMsIGxldCYjMzk7cyBjb3ZlciB0aGUgPGVtPiZxdW90O3NvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWwmcXVvdDs8L2VtPiBhc3BlY3QuIE15IHByZWZlcnJlZCBtZXRob2QgaXMgdXNpbmcgSlNPTlAsIGFzIGl0JiMzOTtzIGFibGUgdG8gZGVsaXZlciB0aGUgc21hbGxlc3Qgc25pcHBldCBwb3NzaWJsZSwgYW5kIGl0IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBzZXJ2ZXItc2lkZSBjYWNoaW5nLiBDb25zaWRlcmluZyB5b3UmIzM5O2xsIHByb2JhYmx5IHdhbnQgdGhpcyB0byBiZSBhbiBpbmxpbmUgc2NyaXB0LCBrZWVwaW5nIGl0IHNtYWxsIGlzIGltcG9ydGFudC48L3A+XFxuPHA+VGhlIGdvb2QgbmV3cyBpcyB0aGF0IHRoZSBzZXJ2ZXItc2lkZSBzdXBwb3J0cyBKU09OUCBvdXQgdGhlIGJveC4gSGVyZSYjMzk7cyBhIHNuaXBwZXQgb2YgY29kZSB5b3UgY291bGQgdXNlIHRvIHB1bGwgZG93biB0aGUgdmlldyBtb2RlbCBhbmQgYm9vdCBUYXVudXMgdXAgYXMgc29vbiBhcyBib3RoIG9wZXJhdGlvbnMgYXJlIHJlYWR5LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5mdW5jdGlvbiBpbmplY3QgKHVybCkge1xcbiAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJiMzOTtzY3JpcHQmIzM5Oyk7XFxuICBzY3JpcHQuc3JjID0gdXJsO1xcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzY3JpcHQpO1xcbn1cXG5cXG5mdW5jdGlvbiBpbmplY3RvciAoKSB7XFxuICB2YXIgc2VhcmNoID0gbG9jYXRpb24uc2VhcmNoO1xcbiAgdmFyIHNlYXJjaFF1ZXJ5ID0gc2VhcmNoID8gJiMzOTsmYW1wOyYjMzk7ICsgc2VhcmNoLnN1YnN0cigxKSA6ICYjMzk7JiMzOTs7XFxuICB2YXIgc2VhcmNoSnNvbiA9ICYjMzk7P2pzb24mYW1wO2NhbGxiYWNrPXRhdW51c1JlYWR5JiMzOTsgKyBzZWFyY2hRdWVyeTtcXG4gIGluamVjdChsb2NhdGlvbi5wYXRobmFtZSArIHNlYXJjaEpzb24pO1xcbn1cXG5cXG53aW5kb3cudGF1bnVzUmVhZHkgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHdpbmRvdy50YXVudXNSZWFkeSA9IG1vZGVsO1xcbn07XFxuXFxuaW5qZWN0b3IoKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXMgbWVudGlvbmVkIGVhcmxpZXIsIHRoaXMgYXBwcm9hY2ggaW52b2x2ZXMgZ2V0dGluZyB5b3VyIGhhbmRzIGRpcnRpZXIgYnV0IGl0IHBheXMgb2ZmIGJ5IGJlaW5nIHRoZSBmYXN0ZXN0IG9mIHRoZSB0aHJlZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJjYWNoaW5nXFxcIj5DYWNoaW5nPC9oND5cXG48cD5UaGUgY2xpZW50LXNpZGUgaW4gVGF1bnVzIHN1cHBvcnRzIGNhY2hpbmcgaW4tbWVtb3J5IGFuZCB1c2luZyB0aGUgZW1iZWRkZWQgSW5kZXhlZERCIHN5c3RlbSBieSBtZXJlbHkgdHVybmluZyBvbiB0aGUgPGNvZGU+Y2FjaGU8L2NvZGU+IGZsYWcgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gb24gdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5JZiB5b3Ugc2V0IDxjb2RlPmNhY2hlPC9jb2RlPiB0byA8Y29kZT50cnVlPC9jb2RlPiB0aGVuIGNhY2hlZCBpdGVtcyB3aWxsIGJlIGNvbnNpZGVyZWQgPGVtPiZxdW90O2ZyZXNoJnF1b3Q7ICh2YWxpZCBjb3BpZXMgb2YgdGhlIG9yaWdpbmFsKTwvZW0+IGZvciA8c3Ryb25nPjE1IHNlY29uZHM8L3N0cm9uZz4uIFlvdSBjYW4gYWxzbyBzZXQgPGNvZGU+Y2FjaGU8L2NvZGU+IHRvIGEgbnVtYmVyLCBhbmQgdGhhdCBudW1iZXIgb2Ygc2Vjb25kcyB3aWxsIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgaW5zdGVhZC48L3A+XFxuPHA+Q2FjaGluZyBjYW4gYWxzbyBiZSB0d2Vha2VkIG9uIGluZGl2aWR1YWwgcm91dGVzLiBGb3IgaW5zdGFuY2UsIHlvdSBjb3VsZCBzZXQgPGNvZGU+eyBjYWNoZTogdHJ1ZSB9PC9jb2RlPiB3aGVuIG1vdW50aW5nIFRhdW51cyBhbmQgdGhlbiBoYXZlIDxjb2RlPnsgY2FjaGU6IDM2MDAgfTwvY29kZT4gb24gYSByb3V0ZSB0aGF0IHlvdSB3YW50IHRvIGNhY2hlIGZvciBhIGxvbmdlciBwZXJpb2Qgb2YgdGltZS48L3A+XFxuPHA+VGhlIGNhY2hpbmcgbGF5ZXIgaXMgPGVtPnNlYW1sZXNzbHkgaW50ZWdyYXRlZDwvZW0+IGludG8gVGF1bnVzLCBtZWFuaW5nIHRoYXQgYW55IHZpZXdzIHJlbmRlcmVkIGJ5IFRhdW51cyB3aWxsIGJlIGNhY2hlZCBhY2NvcmRpbmcgdG8gdGhlc2UgY2FjaGluZyBydWxlcy4gS2VlcCBpbiBtaW5kLCBob3dldmVyLCB0aGF0IHBlcnNpc3RlbmNlIGF0IHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGxheWVyIHdpbGwgb25seSBiZSBwb3NzaWJsZSBpbiA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5icm93c2VycyB0aGF0IHN1cHBvcnQgSW5kZXhlZERCPC9hPi4gSW4gdGhlIGNhc2Ugb2YgYnJvd3NlcnMgdGhhdCBkb24mIzM5O3Qgc3VwcG9ydCBJbmRleGVkREIsIFRhdW51cyB3aWxsIHVzZSBhbiBpbi1tZW1vcnkgY2FjaGUsIHdoaWNoIHdpbGwgYmUgd2lwZWQgb3V0IHdoZW5ldmVyIHRoZSBodW1hbiBkZWNpZGVzIHRvIGNsb3NlIHRoZSB0YWIgaW4gdGhlaXIgYnJvd3Nlci48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJwcmVmZXRjaGluZ1xcXCI+UHJlZmV0Y2hpbmc8L2g0PlxcbjxwPklmIGNhY2hpbmcgaXMgZW5hYmxlZCwgdGhlIG5leHQgbG9naWNhbCBzdGVwIGlzIHByZWZldGNoaW5nLiBUaGlzIGlzIGVuYWJsZWQganVzdCBieSBhZGRpbmcgPGNvZGU+cHJlZmV0Y2g6IHRydWU8L2NvZGU+IHRvIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBUaGUgcHJlZmV0Y2hpbmcgZmVhdHVyZSB3aWxsIGZpcmUgZm9yIGFueSBhbmNob3IgbGluayB0aGF0JiMzOTtzIHRyaXBzIG92ZXIgYSA8Y29kZT5tb3VzZW92ZXI8L2NvZGU+IG9yIGEgPGNvZGU+dG91Y2hzdGFydDwvY29kZT4gZXZlbnQuIElmIGEgcm91dGUgbWF0Y2hlcyB0aGUgVVJMIGluIHRoZSA8Y29kZT5ocmVmPC9jb2RlPiwgYW4gQUpBWCByZXF1ZXN0IHdpbGwgcHJlZmV0Y2ggdGhlIHZpZXcgYW5kIGNhY2hlIGl0cyBjb250ZW50cywgaW1wcm92aW5nIHBlcmNlaXZlZCBwZXJmb3JtYW5jZS48L3A+XFxuPHA+V2hlbiBsaW5rcyBhcmUgY2xpY2tlZCBiZWZvcmUgcHJlZmV0Y2hpbmcgZmluaXNoZXMsIHRoZXkmIzM5O2xsIHdhaXQgb24gdGhlIHByZWZldGNoZXIgdG8gZmluaXNoIGJlZm9yZSBpbW1lZGlhdGVseSBzd2l0Y2hpbmcgdG8gdGhlIHZpZXcsIGVmZmVjdGl2ZWx5IGN1dHRpbmcgZG93biB0aGUgcmVzcG9uc2UgdGltZS4gSWYgdGhlIGxpbmsgd2FzIGFscmVhZHkgcHJlZmV0Y2hlZCBvciBvdGhlcndpc2UgY2FjaGVkLCB0aGUgdmlldyB3aWxsIGJlIGxvYWRlZCBpbW1lZGlhdGVseS4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGEgbGluayBhbmQgYW5vdGhlciBvbmUgd2FzIGFscmVhZHkgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGF0IG9uZSBpcyBhYm9ydGVkLiBUaGlzIHByZXZlbnRzIHByZWZldGNoaW5nIGZyb20gZHJhaW5pbmcgdGhlIGJhbmR3aWR0aCBvbiBjbGllbnRzIHdpdGggbGltaXRlZCBvciBpbnRlcm1pdHRlbnQgY29ubmVjdGl2aXR5LjwvcD5cXG48aDQgaWQ9XFxcInZlcnNpb25pbmdcXFwiPlZlcnNpb25pbmc8L2g0PlxcbjxwPldoZW4gZW5hYmxlZCwgdmVyc2lvbmluZyB3aWxsIGxvb2sgb3V0IGZvciBkaXNjcmVwYW5jaWVzIGJldHdlZW4gd2hhdCYjMzk7cyBjdXJyZW50bHkgb24gdGhlIGNsaWVudCBhbmQgd2hhdCYjMzk7cyBvbiB0aGUgc2VydmVyLCBhbmQgcmVsb2FkIGV2ZXJ5dGhpbmcgbmVjZXNzYXJ5IHRvIG1ha2Ugd2hhdCYjMzk7cyBvbiB0aGUgY2xpZW50IG1hdGNoIHdoYXQmIzM5O3Mgb24gdGhlIHNlcnZlci48L3A+XFxuPHA+SW4gb3JkZXIgdG8gdHVybiBpdCBvbiwgc2V0IHRoZSA8Y29kZT52ZXJzaW9uPC9jb2RlPiBmaWVsZCBpbiB0aGUgb3B0aW9ucyB3aGVuIGludm9raW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gPHN0cm9uZz5vbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLCB1c2luZyB0aGUgc2FtZSB2YWx1ZTwvc3Ryb25nPi4gVGhlIFRhdW51cyB2ZXJzaW9uIHN0cmluZyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBvbmUgeW91IHByb3ZpZGVkLCBzbyB0aGF0IFRhdW51cyB3aWxsIGtub3cgdG8gc3RheSBhbGVydCBmb3IgY2hhbmdlcyB0byBUYXVudXMgaXRzZWxmLCBhcyB3ZWxsLjwvcD5cXG48YmxvY2txdW90ZT5cXG48cD5UbyBtYWtlIHN1cmUgeW91IGRvbiYjMzk7dCBmb3JnZXQgdG8gY2hhbmdlIHRoZSB2ZXJzaW9uIHN0cmluZyBpbiBvbmUgb2YgdGhlIG1vdW50cG9pbnRzLCBwbGVhc2UgY3JlYXRlIGEgSlNPTiBmaWxlIHdpdGgganVzdCB0aGUgdmVyc2lvbiBzdHJpbmcgYW5kIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoYXQgZmlsZSBpbiBib3RoIHNpZGVzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5lY2hvICYjMzk7JnF1b3Q7MS4wLjAmcXVvdDsmIzM5OyAmZ3Q7IHZlcnNpb24uanNvblxcbjwvY29kZT48L3ByZT5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+VGhlIGRlZmF1bHQgdmVyc2lvbiBzdHJpbmcgaXMgc2V0IHRvIDxjb2RlPjE8L2NvZGU+LiBUaGUgVGF1bnVzIHZlcnNpb24gd2lsbCBiZSBwcmVwZW5kZWQgdG8geW91cnMsIHJlc3VsdGluZyBpbiBhIHZhbHVlIHN1Y2ggYXMgPGNvZGU+dDMuMC4wO3YxPC9jb2RlPiB3aGVyZSBUYXVudXMgaXMgcnVubmluZyB2ZXJzaW9uIDxjb2RlPjMuMC4wPC9jb2RlPiBhbmQgeW91ciBhcHBsaWNhdGlvbiBpcyBydW5uaW5nIHZlcnNpb24gPGNvZGU+MTwvY29kZT4uPC9wPlxcbjxwPlJlZmVyIHRvIHRoZSBHZXR0aW5nIFN0YXJ0ZWQgZ3VpZGUgZm9yIGEgbW9yZSBkZXRhaWxlZCA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkI3ZlcnNpb25pbmdcXFwiPmFuYWx5c2lzIG9mIHRoZSB1c2VzIGZvciB2ZXJzaW9uaW5nPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub24odHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGF1bnVzIGVtaXRzIGEgc2VyaWVzIG9mIGV2ZW50cyBkdXJpbmcgaXRzIGxpZmVjeWNsZSwgYW5kIDxjb2RlPnRhdW51cy5vbjwvY29kZT4gaXMgdGhlIHdheSB5b3UgY2FuIHR1bmUgaW4gYW5kIGxpc3RlbiBmb3IgdGhlc2UgZXZlbnRzIHVzaW5nIGEgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIDxjb2RlPmZuPC9jb2RlPi48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPkV2ZW50PC90aD5cXG48dGg+QXJndW1lbnRzPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3N0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbCwgcm91dGU8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsLCByb3V0ZTwvY29kZT48L3RkPlxcbjx0ZD5BIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guc3RhcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmRvbmUmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dCwgZGF0YTwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5LjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guYWJvcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGlzIHB1cnBvc2VseSBhYm9ydGVkLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZXJyb3ImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dCwgZXJyPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLjwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+Q29uc2lkZXIgZm9yIGluc3RhbmNlIHRoYXQgeW91JiMzOTtkIGxpa2UgdG8ga2VlcCB0cmFjayBvZiBldmVyeSB2aWV3IHRoYXQgZ2V0cyByZW5kZXJlZCwgYW5kIHdoYXQgRE9NIGVsZW1lbnQgaXQgZ2V0cyBwbGFjZWQgaW50by4gVGhlIHBpZWNlIG9mIGNvZGUgYmVsb3cgd291bGQgcXVpY2tseSBkbyB0aGF0IGZvciB1cy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+dGF1bnVzLm9uKCYjMzk7cmVuZGVyJiMzOTssIGZ1bmN0aW9uIChjb250YWluZXIpIHtcXG4gIGNvbnNvbGUubG9nKCYjMzk7UmVuZGVyZWQgYSB2aWV3IG9uJiMzOTssIGNvbnRhaW5lcik7XFxufSk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vbmNlLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub25jZSh0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBpcyBlcXVpdmFsZW50IHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub248L2NvZGU+PC9hPiwgZXhjZXB0IHRoZSBldmVudCBsaXN0ZW5lcnMgd2lsbCBiZSB1c2VkIG9uY2UgYW5kIHRoZW4gaXQmIzM5O2xsIGJlIGRpc2NhcmRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9mZi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9mZih0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD5Vc2luZyB0aGlzIG1ldGhvZCB5b3UgY2FuIHJlbW92ZSBhbnkgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBwcmV2aW91c2x5IGFkZGVkIHVzaW5nIDxjb2RlPi5vbjwvY29kZT4gb3IgPGNvZGU+Lm9uY2U8L2NvZGU+LiBZb3UgbXVzdCBwcm92aWRlIHRoZSB0eXBlIG9mIGV2ZW50IHlvdSB3YW50IHRvIHJlbW92ZSBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGZ1bmN0aW9uIHRoYXQgd2FzIG9yaWdpbmFsbHkgdXNlZCB3aGVuIGNhbGxpbmcgPGNvZGU+Lm9uPC9jb2RlPiBvciA8Y29kZT4ub25jZTwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1pbnRlcmNlcHQtYWN0aW9uLWZuLVxcXCI+PGNvZGU+dGF1bnVzLmludGVyY2VwdChhY3Rpb24/LCBmbik8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBjYW4gYmUgdXNlZCB0byBhbnRpY2lwYXRlIG1vZGVsIHJlcXVlc3RzLCBiZWZvcmUgdGhleSBldmVyIG1ha2UgaXQgaW50byBYSFIgcmVxdWVzdHMuIFlvdSBjYW4gYWRkIGludGVyY2VwdG9ycyBmb3Igc3BlY2lmaWMgYWN0aW9ucywgd2hpY2ggd291bGQgYmUgdHJpZ2dlcmVkIG9ubHkgaWYgdGhlIHJlcXVlc3QgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIDxjb2RlPmFjdGlvbjwvY29kZT4uIFlvdSBjYW4gYWxzbyBhZGQgZ2xvYmFsIGludGVyY2VwdG9ycyBieSBvbWl0dGluZyB0aGUgPGNvZGU+YWN0aW9uPC9jb2RlPiBwYXJhbWV0ZXIsIG9yIHNldHRpbmcgaXQgdG8gPGNvZGU+KjwvY29kZT4uPC9wPlxcbjxwPkFuIGludGVyY2VwdG9yIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBhbiA8Y29kZT5ldmVudDwvY29kZT4gcGFyYW1ldGVyLCBjb250YWluaW5nIGEgZmV3IGRpZmZlcmVudCBwcm9wZXJ0aWVzLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPnVybDwvY29kZT4gY29udGFpbnMgdGhlIFVSTCB0aGF0IG5lZWRzIGEgdmlldyBtb2RlbDwvbGk+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBjb250YWlucyB0aGUgZnVsbCByb3V0ZSBvYmplY3QgYXMgeW91JiMzOTtkIGdldCBmcm9tIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZSh1cmwpPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48Y29kZT5wYXJ0czwvY29kZT4gaXMganVzdCBhIHNob3J0Y3V0IGZvciA8Y29kZT5yb3V0ZS5wYXJ0czwvY29kZT48L2xpPlxcbjxsaT48Y29kZT5wcmV2ZW50RGVmYXVsdChtb2RlbCk8L2NvZGU+IGFsbG93cyB5b3UgdG8gc3VwcHJlc3MgdGhlIG5lZWQgZm9yIGFuIEFKQVggcmVxdWVzdCwgY29tbWFuZGluZyBUYXVudXMgdG8gdXNlIHRoZSBtb2RlbCB5b3UmIzM5O3ZlIHByb3ZpZGVkIGluc3RlYWQ8L2xpPlxcbjxsaT48Y29kZT5kZWZhdWx0UHJldmVudGVkPC9jb2RlPiB0ZWxscyB5b3UgaWYgc29tZSBvdGhlciBoYW5kbGVyIGhhcyBwcmV2ZW50ZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3I8L2xpPlxcbjxsaT48Y29kZT5jYW5QcmV2ZW50RGVmYXVsdDwvY29kZT4gdGVsbHMgeW91IGlmIGludm9raW5nIDxjb2RlPmV2ZW50LnByZXZlbnREZWZhdWx0PC9jb2RlPiB3aWxsIGhhdmUgYW55IGVmZmVjdDwvbGk+XFxuPGxpPjxjb2RlPm1vZGVsPC9jb2RlPiBzdGFydHMgYXMgPGNvZGU+bnVsbDwvY29kZT4sIGFuZCBpdCBjYW4gbGF0ZXIgYmVjb21lIHRoZSBtb2RlbCBwYXNzZWQgdG8gPGNvZGU+cHJldmVudERlZmF1bHQ8L2NvZGU+PC9saT5cXG48L3VsPlxcbjxwPkludGVyY2VwdG9ycyBhcmUgYXN5bmNocm9ub3VzLCBidXQgaWYgYW4gaW50ZXJjZXB0b3Igc3BlbmRzIGxvbmdlciB0aGFuIDIwMG1zIGl0JiMzOTtsbCBiZSBzaG9ydC1jaXJjdWl0ZWQgYW5kIGNhbGxpbmcgPGNvZGU+ZXZlbnQucHJldmVudERlZmF1bHQ8L2NvZGU+IHBhc3QgdGhhdCBwb2ludCB3b24mIzM5O3QgaGF2ZSBhbnkgZWZmZWN0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLVxcXCI+PGNvZGU+dGF1bnVzLnBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsKTwvY29kZT48L2gyPlxcbjxwPlRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSA8Y29kZT5hY3Rpb248L2NvZGU+IHZpZXcgaW50byB0aGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiBET00gZWxlbWVudCwgdXNpbmcgdGhlIHNwZWNpZmllZCA8Y29kZT5tb2RlbDwvY29kZT4uIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSA8Y29kZT5yZW5kZXI8L2NvZGU+IGV2ZW50IHdpbGwgYmUgZmlyZWQgPGVtPih3aXRoIDxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+IGFzIGFyZ3VtZW50cyk8L2VtPiBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoYXQgdmlldyB3aWxsIGJlIGV4ZWN1dGVkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbmF2aWdhdGUtdXJsLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubmF2aWdhdGUodXJsLCBvcHRpb25zKTwvY29kZT48L2gyPlxcbjxwPldoZW5ldmVyIHlvdSB3YW50IHRvIG5hdmlnYXRlIHRvIGEgVVJMLCBzYXkgd2hlbiBhbiBBSkFYIGNhbGwgZmluaXNoZXMgYWZ0ZXIgYSBidXR0b24gY2xpY2ssIHlvdSBjYW4gdXNlIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT4gcGFzc2luZyBpdCBhIHBsYWluIFVSTCBvciBhbnl0aGluZyB0aGF0IHdvdWxkIGNhdXNlIDxjb2RlPnRhdW51cy5yb3V0ZSh1cmwpPC9jb2RlPiB0byByZXR1cm4gYSB2YWxpZCByb3V0ZS48L3A+XFxuPHA+QnkgZGVmYXVsdCwgaWYgPGNvZGU+dGF1bnVzLm5hdmlnYXRlKHVybCwgb3B0aW9ucyk8L2NvZGU+IGlzIGNhbGxlZCB3aXRoIGFuIDxjb2RlPnVybDwvY29kZT4gdGhhdCBkb2VzbiYjMzk7dCBtYXRjaCBhbnkgY2xpZW50LXNpZGUgcm91dGUsIHRoZW4gdGhlIHVzZXIgd2lsbCBiZSByZWRpcmVjdGVkIHZpYSA8Y29kZT5sb2NhdGlvbi5ocmVmPC9jb2RlPi4gSW4gY2FzZXMgd2hlcmUgdGhlIGJyb3dzZXIgZG9lc24mIzM5O3Qgc3VwcG9ydCB0aGUgaGlzdG9yeSBBUEksIDxjb2RlPmxvY2F0aW9uLmhyZWY8L2NvZGU+IHdpbGwgYmUgdXNlZCBhcyB3ZWxsLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBvcHRpb25zIHlvdSBjYW4gdXNlIHRvIHR3ZWFrIHRoZSBiZWhhdmlvciBvZiA8Y29kZT50YXVudXMubmF2aWdhdGU8L2NvZGU+LjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+T3B0aW9uPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT5jb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkEgRE9NIGVsZW1lbnQgdGhhdCBjYXVzZWQgdGhlIG5hdmlnYXRpb24gZXZlbnQsIHVzZWQgd2hlbiBlbWl0dGluZyBldmVudHM8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5zdHJpY3Q8L2NvZGU+PC90ZD5cXG48dGQ+SWYgc2V0IHRvIDxjb2RlPnRydWU8L2NvZGU+IGFuZCB0aGUgVVJMIGRvZXNuJiMzOTt0IG1hdGNoIGFueSByb3V0ZSwgdGhlbiB0aGUgbmF2aWdhdGlvbiBhdHRlbXB0IG11c3QgYmUgaWdub3JlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPnNjcm9sbDwvY29kZT48L3RkPlxcbjx0ZD5XaGVuIHRoaXMgaXMgc2V0IHRvIDxjb2RlPmZhbHNlPC9jb2RlPiwgZWxlbWVudHMgYXJlbiYjMzk7dCBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXIgbmF2aWdhdGlvbjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPmZvcmNlPC9jb2RlPjwvdGQ+XFxuPHRkPlVubGVzcyB0aGlzIGlzIHNldCB0byA8Y29kZT50cnVlPC9jb2RlPiwgbmF2aWdhdGlvbiB3b24mIzM5O3QgPGVtPmZldGNoIGEgbW9kZWw8L2VtPiBpZiB0aGUgcm91dGUgbWF0Y2hlcyB0aGUgY3VycmVudCByb3V0ZSwgYW5kIDxjb2RlPnN0YXRlLm1vZGVsPC9jb2RlPiB3aWxsIGJlIHJldXNlZCBpbnN0ZWFkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+cmVwbGFjZVN0YXRlPC9jb2RlPjwvdGQ+XFxuPHRkPlVzZSA8Y29kZT5yZXBsYWNlU3RhdGU8L2NvZGU+IGluc3RlYWQgb2YgPGNvZGU+cHVzaFN0YXRlPC9jb2RlPiB3aGVuIGNoYW5naW5nIGhpc3Rvcnk8L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPk5vdGUgdGhhdCB0aGUgbm90aW9uIG9mIDxlbT5mZXRjaGluZyBhIG1vZGVsPC9lbT4gbWlnaHQgYmUgZGVjZWl2aW5nIGFzIHRoZSBtb2RlbCBjb3VsZCBiZSBwdWxsZWQgZnJvbSB0aGUgY2FjaGUgZXZlbiBpZiA8Y29kZT5mb3JjZTwvY29kZT4gaXMgc2V0IHRvIDxjb2RlPnRydWU8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcm91dGUtdXJsLVxcXCI+PGNvZGU+dGF1bnVzLnJvdXRlKHVybCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIGNvbnZlbmllbmNlIG1ldGhvZCBhbGxvd3MgeW91IHRvIGJyZWFrIGRvd24gYSBVUkwgaW50byBpdHMgaW5kaXZpZHVhbCBjb21wb25lbnRzLiBUaGUgbWV0aG9kIGFjY2VwdHMgYW55IG9mIHRoZSBmb2xsb3dpbmcgcGF0dGVybnMsIGFuZCBpdCByZXR1cm5zIGEgVGF1bnVzIHJvdXRlIG9iamVjdC48L3A+XFxuPHVsPlxcbjxsaT5BIGZ1bGx5IHF1YWxpZmllZCBVUkwgb24gdGhlIHNhbWUgb3JpZ2luLCBlLmcgPGNvZGU+aHR0cDovL3RhdW51cy5iZXZhY3F1YS5pby9hcGk8L2NvZGU+PC9saT5cXG48bGk+QW4gYWJzb2x1dGUgVVJMIHdpdGhvdXQgYW4gb3JpZ2luLCBlLmcgPGNvZGU+L2FwaTwvY29kZT48L2xpPlxcbjxsaT5KdXN0IGEgaGFzaCwgZS5nIDxjb2RlPiNmb288L2NvZGU+IDxlbT4oPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4gaXMgdXNlZCk8L2VtPjwvbGk+XFxuPGxpPkZhbHN5IHZhbHVlcywgZS5nIDxjb2RlPm51bGw8L2NvZGU+IDxlbT4oPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4gaXMgdXNlZCk8L2VtPjwvbGk+XFxuPC91bD5cXG48cD5SZWxhdGl2ZSBVUkxzIGFyZSBub3Qgc3VwcG9ydGVkIDxlbT4oYW55dGhpbmcgdGhhdCBkb2VzbiYjMzk7dCBoYXZlIGEgbGVhZGluZyBzbGFzaCk8L2VtPiwgZS5nIDxjb2RlPmZpbGVzL2RhdGEuanNvbjwvY29kZT4uIEFueXRoaW5nIHRoYXQmIzM5O3Mgbm90IG9uIHRoZSBzYW1lIG9yaWdpbiBvciBkb2VzbiYjMzk7dCBtYXRjaCBvbmUgb2YgdGhlIHJlZ2lzdGVyZWQgcm91dGVzIGlzIGdvaW5nIHRvIHlpZWxkIDxjb2RlPm51bGw8L2NvZGU+LjwvcD5cXG48cD48ZW0+VGhpcyBtZXRob2QgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLCBhcyBpdCBnaXZlcyB5b3UgZGlyZWN0IGFjY2VzcyB0byB0aGUgcm91dGVyIHVzZWQgaW50ZXJuYWxseSBieSBUYXVudXMuPC9lbT48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCItdGF1bnVzLXJvdXRlLWVxdWFscy1yb3V0ZS1yb3V0ZS1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZS5lcXVhbHMocm91dGUsIHJvdXRlKTwvY29kZT48L2g0PlxcbjxwPkNvbXBhcmVzIHR3byByb3V0ZXMgYW5kIHJldHVybnMgPGNvZGU+dHJ1ZTwvY29kZT4gaWYgdGhleSB3b3VsZCBmZXRjaCB0aGUgc2FtZSBtb2RlbC4gTm90ZSB0aGF0IGRpZmZlcmVudCBVUkxzIG1heSBzdGlsbCByZXR1cm4gPGNvZGU+dHJ1ZTwvY29kZT4uIEZvciBpbnN0YW5jZSwgPGNvZGU+L2ZvbzwvY29kZT4gYW5kIDxjb2RlPi9mb28jYmFyPC9jb2RlPiB3b3VsZCBmZXRjaCB0aGUgc2FtZSBtb2RlbCBldmVuIGlmIHRoZXkmIzM5O3JlIGRpZmZlcmVudCBVUkxzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtc3RhdGUtXFxcIj48Y29kZT50YXVudXMuc3RhdGU8L2NvZGU+PC9oMj5cXG48cD5UaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5jb250YWluZXI8L2NvZGU+IGlzIHRoZSBET00gZWxlbWVudCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvbGk+XFxuPGxpPjxjb2RlPmNvbnRyb2xsZXJzPC9jb2RlPiBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPjxjb2RlPnRlbXBsYXRlczwvY29kZT4gYXJlIGFsbCB0aGUgdGVtcGxhdGVzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+PGNvZGU+cm91dGVzPC9jb2RlPiBhcmUgYWxsIHRoZSByb3V0ZXMsIGFzIGRlZmluZWQgaW4gdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gaXMgYSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgcm91dGU8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gaXMgYSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsIHVzZWQgdG8gcmVuZGVyIHRoZSBjdXJyZW50IHZpZXc8L2xpPlxcbjxsaT48Y29kZT5wcmVmZXRjaDwvY29kZT4gZXhwb3NlcyB3aGV0aGVyIHByZWZldGNoaW5nIGlzIHR1cm5lZCBvbjwvbGk+XFxuPGxpPjxjb2RlPmNhY2hlPC9jb2RlPiBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkPC9saT5cXG48bGk+PGNvZGU+dmVyc2lvbjwvY29kZT4gZXhwb3NlcyB0aGUgdmVyc2lvbiBzdHJpbmcgdGhhdCYjMzk7cyBjdXJyZW50bHkgaW4gdXNlPC9saT5cXG48L3VsPlxcbjxwPk9mIGNvdXJzZSwgeW91ciBub3Qgc3VwcG9zZWQgdG8gbWVkZGxlIHdpdGggaXQsIHNvIGJlIGEgZ29vZCBjaXRpemVuIGFuZCBqdXN0IGluc3BlY3QgaXRzIHZhbHVlcyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLXhoci11cmwtb3B0aW9ucy1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnhocih1cmwsIG9wdGlvbnM/LCBkb25lKTwvY29kZT48L2gyPlxcbjxwPlRoaXMgbWV0aG9kIGFsbG93cyB5b3UgdG8gaXNzdWUgeW91ciBvd24gQUpBWCByZXF1ZXN0cyB0aHJvdWdoIHRoZSA8Y29kZT54aHI8L2NvZGU+IG1vZHVsZS4gSXQgc2V0cyBhIGZldyBjb252ZW5pZW50IGRlZmF1bHRzLCA8ZW0+bGlzdGVkIGJlbG93PC9lbT4sIHdoZXJlIDxjb2RlPnVybDwvY29kZT4gcmVmZXJzIHRvIHRoZSBVUkwgcGFzc2VkIGFzIHRoZSBmaXJzdCBwYXJhbWV0ZXIuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPntcXG4gIHVybDogdXJsLFxcbiAganNvbjogdHJ1ZSxcXG4gIGhlYWRlcnM6IHsgQWNjZXB0OiAmIzM5O2FwcGxpY2F0aW9uL2pzb24mIzM5OyB9XFxufVxcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgPGNvZGU+ZG9uZShlcnIsIGJvZHksIHJlcyk8L2NvZGU+IGNhbGxiYWNrIHdpbGwgYmUgaW52b2tlZCB3aGVuIHRoZSByZXF1ZXN0IGZpbmlzaGVzLCBhbmQgaXQmIzM5O2xsIGJlIHBhc3NlZCB0aHJlZSBwYXJhbWV0ZXJzLCBhbiBvcHRpb25hbCBlcnJvciBpZiBzb21ldGhpbmcgd2VudCB3cm9uZyA8ZW0+KHJlcXVlc3QgZmFpbGVkLCB3YXMgYWJvcnRlZCwgZXRjLik8L2VtPiBhbmQgYSA8Y29kZT5ib2R5PC9jb2RlPiBwYXJhbWV0ZXIgY29udGFpbmluZyB0aGUgcmVzcG9uc2UgYm9keS4gVGhlIHJhdyA8Y29kZT5yZXM8L2NvZGU+IG9iamVjdCB0aGF0JiMzOTtzIHR5cGljYWxseSBwcm92aWRlZCBieSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vUmF5bm9zL3hoclxcXCI+PGNvZGU+eGhyPC9jb2RlPjwvYT4gYXMgdGhlIHNlY29uZCBwYXJhbWV0ZXIgaXMgcHJvdmlkZWQgYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBpbnN0ZWFkLjwvcD5cXG48cD5BcyBhbiBleGFtcGxlLCBoZXJlIGlzIGEgPGNvZGU+R0VUPC9jb2RlPiByZXF1ZXN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj50YXVudXMueGhyKCYjMzk7L2FwaS9wbGFjZXMmIzM5OywgZnVuY3Rpb24gKGVyciwgYm9keSkge1xcbiAgY29uc29sZS5sb2coYm9keSk7XFxuICAvLyAmbHQ7LSB7IHBsYWNlczogWyYjMzk7dW5kZXJ3YXRlciBmb3J0cmVzcyYjMzk7LCAmIzM5O2lzbGFuZCBtYW5zaW9uJiMzOTtdIH1cXG59KTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QWx3YXlzIHJlbWVtYmVyIHRvIGhhbmRsZSB0aGUgY2FzZSB3aGVyZSA8Y29kZT5lcnI8L2NvZGU+IGlzIHNldCE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJjbGllbnQtc2lkZS1jb250cm9sbGVyc1xcXCI+Q2xpZW50LVNpZGUgQ29udHJvbGxlcnM8L2gxPlxcbjxwPkNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleGVjdXRlZCByaWdodCBhZnRlciBhIHZpZXcgaXMgcmVuZGVyZWQsIGV2ZW4gaW4gdGhlIGNhc2Ugb2YgPGEgaHJlZj1cXFwiIy10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLVxcXCI+cGFydGlhbCB2aWV3czwvYT4uIFRoZXNlIGNvbnRyb2xsZXJzIGFyZSB1c2VkIHRvIHByb2dyZXNzaXZlbHkgYWRkIGJlaGF2aW9yIG9uIHRvcCBvZiB0aGUgSFRNTCBmb3IgdGhhdCB2aWV3LjwvcD5cXG48cD5WaWV3IGNvbnRyb2xsZXJzIHRha2UgdGhyZWUgcGFyYW1ldGVycy48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPlBhcmFtZXRlcjwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+bW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+TW9kZWwgdGhhdCB3YXMgdXNlZCB0byByZW5kZXIgdGhlIHZpZXc8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5jb250YWluZXI8L2NvZGU+PC90ZD5cXG48dGQ+VGhlIERPTSBlbGVtZW50IHdoZXJlIHRoZSB2aWV3IHdhcyByZW5kZXJlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPnJvdXRlPzwvY29kZT48L3RkPlxcbjx0ZD5Sb3V0ZSB0aGF0IHRyaWdnZXJlZCB0aGUgcmVuZGVyaW5nIGVuZ2luZS4gTWF5IGJlIDxjb2RlPm51bGw8L2NvZGU+PC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5Ob3RlIHRoYXQgVGF1bnVzIHdpbGwgPGEgaHJlZj1cXFwiIy10YXVudXMtb24tdHlwZS1mbi1cXFwiPmVtaXQgYSA8Y29kZT5yZW5kZXI8L2NvZGU+IGV2ZW50PC9hPiByaWdodCBiZWZvcmUgdGhlIHZpZXcgY29udHJvbGxlciBnZXRzIGV4ZWN1dGVkLCBnaXZpbmcgeW91IGEgY2hhbmNlIHRvIHJlYWN0IHRvIHZpZXdzIGdldHRpbmcgcmVuZGVyZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj5UaGUgPGNvZGU+LnRhdW51c3JjPC9jb2RlPiBtYW5pZmVzdDwvaDE+XFxuPHA+SWYgeW91IHdhbnQgdG8gdXNlIHZhbHVlcyBvdGhlciB0aGFuIHRoZSBjb252ZW50aW9uYWwgZGVmYXVsdHMgc2hvd24gaW4gdGhlIHRhYmxlIGJlbG93LCB0aGVuIHlvdSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LnRhdW51c3JjPC9jb2RlPiBmaWxlLiBOb3RlIHRoYXQgdGhlIGRlZmF1bHRzIG5lZWQgdG8gYmUgb3ZlcndyaXR0ZW4gaW4gYSBjYXNlLWJ5LWNhc2UgYmFzaXMuIFRoZXNlIG9wdGlvbnMgY2FuIGFsc28gYmUgY29uZmlndXJlZCBpbiB5b3VyIDxjb2RlPnBhY2thZ2UuanNvbjwvY29kZT4sIHVuZGVyIHRoZSA8Y29kZT50YXVudXM8L2NvZGU+IHByb3BlcnR5LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzb25cXFwiPntcXG4gICZxdW90O3ZpZXdzJnF1b3Q7OiAmcXVvdDsuYmluL3ZpZXdzJnF1b3Q7LFxcbiAgJnF1b3Q7c2VydmVyX3JvdXRlcyZxdW90OzogJnF1b3Q7Y29udHJvbGxlcnMvcm91dGVzLmpzJnF1b3Q7LFxcbiAgJnF1b3Q7c2VydmVyX2NvbnRyb2xsZXJzJnF1b3Q7OiAmcXVvdDtjb250cm9sbGVycyZxdW90OyxcXG4gICZxdW90O2NsaWVudF9jb250cm9sbGVycyZxdW90OzogJnF1b3Q7Y2xpZW50L2pzL2NvbnRyb2xsZXJzJnF1b3Q7LFxcbiAgJnF1b3Q7Y2xpZW50X3dpcmluZyZxdW90OzogJnF1b3Q7LmJpbi93aXJpbmcuanMmcXVvdDtcXG59XFxuPC9jb2RlPjwvcHJlPlxcbjx1bD5cXG48bGk+VGhlIDxjb2RlPnZpZXdzPC9jb2RlPiBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciB2aWV3cyA8ZW0+KGFscmVhZHkgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0KTwvZW0+IGFyZSBwbGFjZWQuIFRoZXNlIHZpZXdzIGFyZSB1c2VkIGRpcmVjdGx5IG9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5UaGUgPGNvZGU+c2VydmVyX3JvdXRlczwvY29kZT4gZmlsZSBpcyB0aGUgbW9kdWxlIHdoZXJlIHlvdSBleHBvcnQgYSBjb2xsZWN0aW9uIG9mIHJvdXRlcy4gVGhlIENMSSB3aWxsIHB1bGwgdGhlc2Ugcm91dGVzIHdoZW4gY3JlYXRpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRlcyBmb3IgdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT5UaGUgPGNvZGU+c2VydmVyX2NvbnRyb2xsZXJzPC9jb2RlPiBkaXJlY3RvcnkgaXMgdGhlIHJvb3QgZGlyZWN0b3J5IHdoZXJlIHlvdXIgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgbGl2ZS4gSXQmIzM5O3MgdXNlZCB3aGVuIHNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlIHJvdXRlcjwvbGk+XFxuPGxpPlRoZSA8Y29kZT5jbGllbnRfY29udHJvbGxlcnM8L2NvZGU+IGRpcmVjdG9yeSBpcyB3aGVyZSB5b3VyIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgbW9kdWxlcyBsaXZlLiBUaGUgQ0xJIHdpbGwgPGNvZGU+cmVxdWlyZTwvY29kZT4gdGhlc2UgY29udHJvbGxlcnMgaW4gaXRzIHJlc3VsdGluZyB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+VGhlIDxjb2RlPmNsaWVudF93aXJpbmc8L2NvZGU+IGZpbGUgaXMgd2hlcmUgeW91ciB3aXJpbmcgbW9kdWxlIHdpbGwgYmUgcGxhY2VkIGJ5IHRoZSBDTEkuIFlvdSYjMzk7bGwgdGhlbiBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGl0IGluIHlvdXIgYXBwbGljYXRpb24gd2hlbiBib290aW5nIHVwIFRhdW51czwvbGk+XFxuPC91bD5cXG48cD5IZXJlIGlzIHdoZXJlIHRoaW5ncyBnZXQgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+YSBsaXR0bGUgY29udmVudGlvbmFsPC9hPi4gVmlld3MsIGFuZCBib3RoIHNlcnZlci1zaWRlIGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhwZWN0ZWQgdG8gYmUgb3JnYW5pemVkIGJ5IGZvbGxvd2luZyB0aGUgPGNvZGU+e3Jvb3R9L3tjb250cm9sbGVyfS97YWN0aW9ufTwvY29kZT4gcGF0dGVybiwgYnV0IHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCB1c2luZyA8Y29kZT5yZXNvbHZlcnM8L2NvZGU+IHdoZW4gaW52b2tpbmcgdGhlIENMSSBhbmQgdXNpbmcgdGhlIHNlcnZlci1zaWRlIEFQSS48L3A+XFxuPHA+Vmlld3MgYW5kIGNvbnRyb2xsZXJzIGFyZSBhbHNvIGV4cGVjdGVkIHRvIGJlIENvbW1vbkpTIG1vZHVsZXMgdGhhdCBleHBvcnQgYSBzaW5nbGUgbWV0aG9kLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEFQSSBEb2N1bWVudGF0aW9uXFxuXFxuICAgIEhlcmUncyB0aGUgQVBJIGRvY3VtZW50YXRpb24gZm9yIFRhdW51cy4gSWYgeW91J3ZlIG5ldmVyIHVzZWQgaXQgYmVmb3JlLCB3ZSByZWNvbW1lbmQgZ29pbmcgb3ZlciB0aGUgW0dldHRpbmcgU3RhcnRlZF1bMV0gZ3VpZGUgYmVmb3JlIGp1bXBpbmcgaW50byB0aGUgQVBJIGRvY3VtZW50YXRpb24uIFRoYXQgd2F5LCB5b3UnbGwgZ2V0IGEgYmV0dGVyIGlkZWEgb2Ygd2hhdCB0byBsb29rIGZvciBhbmQgaG93IHRvIHB1dCB0b2dldGhlciBzaW1wbGUgYXBwbGljYXRpb25zIHVzaW5nIFRhdW51cywgYmVmb3JlIGdvaW5nIHRocm91Z2ggZG9jdW1lbnRhdGlvbiBvbiBldmVyeSBwdWJsaWMgaW50ZXJmYWNlIHRvIFRhdW51cy5cXG5cXG4gICAgVGF1bnVzIGV4cG9zZXMgX3RocmVlIGRpZmZlcmVudCBwdWJsaWMgQVBJc18sIGFuZCB0aGVyZSdzIGFsc28gKipwbHVnaW5zIHRvIGludGVncmF0ZSBUYXVudXMgYW5kIGFuIEhUVFAgc2VydmVyKiouIFRoaXMgZG9jdW1lbnQgY292ZXJzIGFsbCB0aHJlZSBBUElzIGV4dGVuc2l2ZWx5LiBJZiB5b3UncmUgY29uY2VybmVkIGFib3V0IHRoZSBpbm5lciB3b3JraW5ncyBvZiBUYXVudXMsIHBsZWFzZSByZWZlciB0byB0aGUgW0dldHRpbmcgU3RhcnRlZF1bMV0gZ3VpZGUuIFRoaXMgZG9jdW1lbnQgYWltcyB0byBvbmx5IGNvdmVyIGhvdyB0aGUgcHVibGljIGludGVyZmFjZSBhZmZlY3RzIGFwcGxpY2F0aW9uIHN0YXRlLCBidXQgKipkb2Vzbid0IGRlbHZlIGludG8gaW1wbGVtZW50YXRpb24gZGV0YWlscyoqLlxcblxcbiAgICAjIFRhYmxlIG9mIENvbnRlbnRzXFxuXFxuICAgIC0gQSBbc2VydmVyLXNpZGUgQVBJXSgjc2VydmVyLXNpZGUtYXBpKSB0aGF0IGRlYWxzIHdpdGggc2VydmVyLXNpZGUgcmVuZGVyaW5nXFxuICAgICAgLSBUaGUgW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSkgbWV0aG9kXFxuICAgICAgICAtIEl0cyBbYG9wdGlvbnNgXSgjdGhlLW9wdGlvbnMtb2JqZWN0KSBhcmd1bWVudFxcbiAgICAgICAgICAtIFtgbGF5b3V0YF0oIy1vcHRpb25zLWxheW91dC0pXFxuICAgICAgICAgIC0gW2Byb3V0ZXNgXSgjLW9wdGlvbnMtcm91dGVzLSlcXG4gICAgICAgICAgLSBbYGdldERlZmF1bHRWaWV3TW9kZWxgXSgjLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC0pXFxuICAgICAgICAgIC0gW2BwbGFpbnRleHRgXSgjLW9wdGlvbnMtcGxhaW50ZXh0LSlcXG4gICAgICAgICAgLSBbYHJlc29sdmVyc2BdKCMtb3B0aW9ucy1yZXNvbHZlcnMtKVxcbiAgICAgICAgICAtIFtgdmVyc2lvbmBdKCMtb3B0aW9ucy12ZXJzaW9uLSlcXG4gICAgICAgIC0gSXRzIFtgYWRkUm91dGVgXSgjLWFkZHJvdXRlLWRlZmluaXRpb24tKSBhcmd1bWVudFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlbmRlcmBdKCMtdGF1bnVzLXJlbmRlci1hY3Rpb24tdmlld21vZGVsLXJlcS1yZXMtbmV4dC0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsYF0oIy10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS0pIG1ldGhvZFxcbiAgICAtIFtTZXJ2ZXItc2lkZSBjb250cm9sbGVyc10oI3NlcnZlci1zaWRlLWNvbnRyb2xsZXJzKVxcbiAgICAtIEEgW3N1aXRlIG9mIHBsdWdpbnNdKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSBjYW4gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXJcXG4gICAgICAtIFVzaW5nIFtgdGF1bnVzLWV4cHJlc3NgXSgjdXNpbmctdGF1bnVzLWV4cHJlc3MtKSBmb3IgW0V4cHJlc3NdWzJdXFxuICAgICAgLSBVc2luZyBbYHRhdW51cy1oYXBpYF0oI3VzaW5nLXRhdW51cy1oYXBpLSkgZm9yIFtIYXBpXVszXVxcbiAgICAtIEEgW0NMSSB0aGF0IHByb2R1Y2VzIGEgd2lyaW5nIG1vZHVsZV0oI2NvbW1hbmQtbGluZS1pbnRlcmZhY2UpIGZvciB0aGUgY2xpZW50LXNpZGVcXG4gICAgICAtIFRoZSBbYC0tb3V0cHV0YF0oIy1vdXRwdXQtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXdhdGNoYF0oIy13YXRjaC0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0tdHJhbnNmb3JtIDxtb2R1bGU+YF0oIy10cmFuc2Zvcm0tbW9kdWxlLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS1yZXNvbHZlcnMgPG1vZHVsZT5gXSgjLXJlc29sdmVycy1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXN0YW5kYWxvbmVgXSgjLXN0YW5kYWxvbmUtKSBmbGFnXFxuICAgIC0gQSBbY2xpZW50LXNpZGUgQVBJXSgjY2xpZW50LXNpZGUtYXBpKSB0aGF0IGRlYWxzIHdpdGggY2xpZW50LXNpZGUgcmVuZGVyaW5nXFxuICAgICAgLSBUaGUgW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtKSBtZXRob2RcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgYXV0b2BdKCN1c2luZy10aGUtYXV0by1zdHJhdGVneSkgc3RyYXRlZ3lcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgaW5saW5lYF0oI3VzaW5nLXRoZS1pbmxpbmUtc3RyYXRlZ3kpIHN0cmF0ZWd5XFxuICAgICAgICAtIFVzaW5nIHRoZSBbYG1hbnVhbGBdKCN1c2luZy10aGUtbWFudWFsLXN0cmF0ZWd5KSBzdHJhdGVneVxcbiAgICAgICAgLSBbQ2FjaGluZ10oI2NhY2hpbmcpXFxuICAgICAgICAtIFtQcmVmZXRjaGluZ10oI3ByZWZldGNoaW5nKVxcbiAgICAgICAgLSBbVmVyc2lvbmluZ10oI3ZlcnNpb25pbmcpXFxuICAgICAgLSBUaGUgW2B0YXVudXMub25gXSgjLXRhdW51cy1vbi10eXBlLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMub25jZWBdKCMtdGF1bnVzLW9uY2UtdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9mZmBdKCMtdGF1bnVzLW9mZi10eXBlLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMuaW50ZXJjZXB0YF0oIy10YXVudXMtaW50ZXJjZXB0LWFjdGlvbi1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnBhcnRpYWxgXSgjLXRhdW51cy1wYXJ0aWFsLWNvbnRhaW5lci1hY3Rpb24tbW9kZWwtKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5uYXZpZ2F0ZWBdKCMtdGF1bnVzLW5hdmlnYXRlLXVybC1vcHRpb25zLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMucm91dGVgXSgjLXRhdW51cy1yb3V0ZS11cmwtKSBtZXRob2RcXG4gICAgICAgIC0gVGhlIFtgdGF1bnVzLnJvdXRlLmVxdWFsc2BdKCMtdGF1bnVzLXJvdXRlLWVxdWFscy1yb3V0ZS1yb3V0ZS0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnN0YXRlYF0oIy10YXVudXMtc3RhdGUtKSBwcm9wZXJ0eVxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnhocmBdKCMtdGF1bnVzLXhoci11cmwtb3B0aW9ucy1kb25lLSkgbWV0aG9kXFxuICAgIC0gW0NsaWVudC1zaWRlIGNvbnRyb2xsZXJzXSgjY2xpZW50LXNpZGUtY29udHJvbGxlcnMpXFxuICAgIC0gVGhlIFtgLnRhdW51c3JjYF0oI3RoZS10YXVudXNyYy1tYW5pZmVzdCkgbWFuaWZlc3RcXG5cXG4gICAgIyBTZXJ2ZXItc2lkZSBBUElcXG5cXG4gICAgVGhlIHNlcnZlci1zaWRlIEFQSSBpcyB1c2VkIHRvIHNldCB1cCB0aGUgdmlldyByb3V0ZXIuIEl0IHRoZW4gZ2V0cyBvdXQgb2YgdGhlIHdheSwgYWxsb3dpbmcgdGhlIGNsaWVudC1zaWRlIHRvIGV2ZW50dWFsbHkgdGFrZSBvdmVyIGFuZCBhZGQgYW55IGV4dHJhIHN1Z2FyIG9uIHRvcCwgX2luY2x1ZGluZyBjbGllbnQtc2lkZSByZW5kZXJpbmdfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm1vdW50KGFkZFJvdXRlLCBvcHRpb25zPylgXFxuXFxuICAgIE1vdW50cyBUYXVudXMgb24gdG9wIG9mIGEgc2VydmVyLXNpZGUgcm91dGVyLCBieSByZWdpc3RlcmluZyBlYWNoIHJvdXRlIGluIGBvcHRpb25zLnJvdXRlc2Agd2l0aCB0aGUgYGFkZFJvdXRlYCBtZXRob2QuXFxuXFxuICAgID4gTm90ZSB0aGF0IG1vc3Qgb2YgdGhlIHRpbWUsICoqdGhpcyBtZXRob2Qgc2hvdWxkbid0IGJlIGludm9rZWQgZGlyZWN0bHkqKiwgYnV0IHJhdGhlciB0aHJvdWdoIG9uZSBvZiB0aGUgW0hUVFAgZnJhbWV3b3JrIHBsdWdpbnNdKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSBwcmVzZW50ZWQgYmVsb3cuXFxuXFxuICAgIEhlcmUncyBhbiBpbmNvbXBsZXRlIGV4YW1wbGUgb2YgaG93IHRoaXMgbWV0aG9kIG1heSBiZSB1c2VkLiBJdCBpcyBpbmNvbXBsZXRlIGJlY2F1c2Ugcm91dGUgZGVmaW5pdGlvbnMgaGF2ZSBtb3JlIG9wdGlvbnMgYmV5b25kIHRoZSBgcm91dGVgIGFuZCBgYWN0aW9uYCBwcm9wZXJ0aWVzLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHRhdW51cy5tb3VudChhZGRSb3V0ZSwge1xcbiAgICAgIHJvdXRlczogW3sgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfV1cXG4gICAgfSk7XFxuXFxuICAgIGZ1bmN0aW9uIGFkZFJvdXRlIChkZWZpbml0aW9uKSB7XFxuICAgICAgYXBwLmdldChkZWZpbml0aW9uLnJvdXRlLCBkZWZpbml0aW9uLmFjdGlvbik7XFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIExldCdzIGdvIG92ZXIgdGhlIG9wdGlvbnMgeW91IGNhbiBwYXNzIHRvIGB0YXVudXMubW91bnRgIGZpcnN0LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFRoZSBgb3B0aW9ucz9gIG9iamVjdFxcblxcbiAgICBUaGVyZSdzIGEgZmV3IG9wdGlvbnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIHRoZSBzZXJ2ZXItc2lkZSBtb3VudHBvaW50LiBZb3UncmUgcHJvYmFibHkgZ29pbmcgdG8gYmUgcGFzc2luZyB0aGVzZSB0byB5b3VyIFtIVFRQIGZyYW1ld29yayBwbHVnaW5dKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSwgcmF0aGVyIHRoYW4gdXNpbmcgYHRhdW51cy5tb3VudGAgZGlyZWN0bHkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5sYXlvdXQ/YFxcblxcbiAgICBUaGUgYGxheW91dGAgcHJvcGVydHkgaXMgZXhwZWN0ZWQgdG8gaGF2ZSB0aGUgYGZ1bmN0aW9uKGRhdGEpYCBzaWduYXR1cmUuIEl0J2xsIGJlIGludm9rZWQgd2hlbmV2ZXIgYSBmdWxsIEhUTUwgZG9jdW1lbnQgbmVlZHMgdG8gYmUgcmVuZGVyZWQsIGFuZCBhIGBkYXRhYCBvYmplY3Qgd2lsbCBiZSBwYXNzZWQgdG8gaXQuIFRoYXQgb2JqZWN0IHdpbGwgY29udGFpbiBldmVyeXRoaW5nIHlvdSd2ZSBzZXQgYXMgdGhlIHZpZXcgbW9kZWwsIHBsdXMgYSBgcGFydGlhbGAgcHJvcGVydHkgY29udGFpbmluZyB0aGUgcmF3IEhUTUwgb2YgdGhlIHJlbmRlcmVkIHBhcnRpYWwgdmlldy4gWW91ciBgbGF5b3V0YCBtZXRob2Qgd2lsbCB0eXBpY2FsbHkgd3JhcCB0aGUgcmF3IEhUTUwgZm9yIHRoZSBwYXJ0aWFsIHdpdGggdGhlIGJhcmUgYm9uZXMgb2YgYW4gSFRNTCBkb2N1bWVudC4gQ2hlY2sgb3V0IFt0aGUgYGxheW91dC5qYWRlYCB1c2VkIGluIFBvbnkgRm9vXVs0XSBhcyBhbiBleGFtcGxlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucm91dGVzYFxcblxcbiAgICBUaGUgb3RoZXIgYmlnIG9wdGlvbiBpcyBgcm91dGVzYCwgd2hpY2ggZXhwZWN0cyBhIGNvbGxlY3Rpb24gb2Ygcm91dGUgZGVmaW5pdGlvbnMuIFJvdXRlIGRlZmluaXRpb25zIHVzZSBhIG51bWJlciBvZiBwcm9wZXJ0aWVzIHRvIGRldGVybWluZSBob3cgdGhlIHJvdXRlIGlzIGdvaW5nIHRvIGJlaGF2ZS5cXG5cXG4gICAgSGVyZSdzIGFuIGV4YW1wbGUgcm91dGUgdGhhdCB1c2VzIHRoZSBbRXhwcmVzc11bMl0gcm91dGluZyBzY2hlbWUuXFxuXFxuICAgIGBgYGpzXFxuICAgIHtcXG4gICAgICByb3V0ZTogJy9hcnRpY2xlcy86c2x1ZycsXFxuICAgICAgYWN0aW9uOiAnYXJ0aWNsZXMvYXJ0aWNsZScsXFxuICAgICAgaWdub3JlOiBmYWxzZSxcXG4gICAgICBjYWNoZTogPGluaGVyaXQ+XFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIC0gYHJvdXRlYCBpcyBhIHJvdXRlIGluIHRoZSBmb3JtYXQgeW91ciBIVFRQIGZyYW1ld29yayBvZiBjaG9pY2UgdW5kZXJzdGFuZHNcXG4gICAgLSBgYWN0aW9uYCBpcyB0aGUgbmFtZSBvZiB5b3VyIGNvbnRyb2xsZXIgYWN0aW9uLiBJdCdsbCBiZSB1c2VkIHRvIGZpbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCBzaG91bGQgYmUgdXNlZCB3aXRoIHRoaXMgcm91dGUsIGFuZCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlclxcbiAgICAtIGBjYWNoZWAgY2FuIGJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGJlaGF2aW9yIGluIHRoaXMgYXBwbGljYXRpb24gcGF0aCwgYW5kIGl0J2xsIGRlZmF1bHQgdG8gaW5oZXJpdGluZyBmcm9tIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBfb24gdGhlIGNsaWVudC1zaWRlX1xcbiAgICAtIGBpZ25vcmVgIGlzIHVzZWQgaW4gdGhvc2UgY2FzZXMgd2hlcmUgeW91IHdhbnQgYSBVUkwgdG8gYmUgaWdub3JlZCBieSB0aGUgY2xpZW50LXNpZGUgcm91dGVyIGV2ZW4gaWYgdGhlcmUncyBhIGNhdGNoLWFsbCByb3V0ZSB0aGF0IHdvdWxkIG1hdGNoIHRoYXQgVVJMXFxuXFxuICAgIEFzIGFuIGV4YW1wbGUgb2YgdGhlIGBpZ25vcmVgIHVzZSBjYXNlLCBjb25zaWRlciB0aGUgcm91dGluZyB0YWJsZSBzaG93biBiZWxvdy4gVGhlIGNsaWVudC1zaWRlIHJvdXRlciBkb2Vzbid0IGtub3cgXyhhbmQgY2FuJ3Qga25vdyB1bmxlc3MgeW91IHBvaW50IGl0IG91dClfIHdoYXQgcm91dGVzIGFyZSBzZXJ2ZXItc2lkZSBvbmx5LCBhbmQgaXQncyB1cCB0byB5b3UgdG8gcG9pbnQgdGhvc2Ugb3V0LlxcblxcbiAgICBgYGBqc1xcbiAgICBbXFxuICAgICAgeyByb3V0ZTogJy8nLCBhY3Rpb246ICcvaG9tZS9pbmRleCcgfSxcXG4gICAgICB7IHJvdXRlOiAnL2ZlZWQnLCBpZ25vcmU6IHRydWUgfSxcXG4gICAgICB7IHJvdXRlOiAnLyonLCBhY3Rpb246ICdlcnJvci9ub3QtZm91bmQnIH1cXG4gICAgXVxcbiAgICBgYGBcXG5cXG4gICAgVGhpcyBzdGVwIGlzIG5lY2Vzc2FyeSB3aGVuZXZlciB5b3UgaGF2ZSBhbiBhbmNob3IgbGluayBwb2ludGVkIGF0IHNvbWV0aGluZyBsaWtlIGFuIFJTUyBmZWVkLiBUaGUgYGlnbm9yZWAgcHJvcGVydHkgaXMgZWZmZWN0aXZlbHkgdGVsbGluZyB0aGUgY2xpZW50LXNpZGUgX1xcXCJkb24ndCBoaWphY2sgbGlua3MgY29udGFpbmluZyB0aGlzIFVSTFxcXCJfLlxcblxcbiAgICBQbGVhc2Ugbm90ZSB0aGF0IGV4dGVybmFsIGxpbmtzIGFyZSBuZXZlciBoaWphY2tlZC4gT25seSBzYW1lLW9yaWdpbiBsaW5rcyBjb250YWluaW5nIGEgVVJMIHRoYXQgbWF0Y2hlcyBvbmUgb2YgdGhlIHJvdXRlcyB3aWxsIGJlIGhpamFja2VkIGJ5IFRhdW51cy4gRXh0ZXJuYWwgbGlua3MgZG9uJ3QgbmVlZCB0byBiZSBgaWdub3JlYGQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5nZXREZWZhdWx0Vmlld01vZGVsP2BcXG5cXG4gICAgVGhlIGBnZXREZWZhdWx0Vmlld01vZGVsKGRvbmUpYCBwcm9wZXJ0eSBjYW4gYmUgYSBtZXRob2QgdGhhdCBwdXRzIHRvZ2V0aGVyIHRoZSBiYXNlIHZpZXcgbW9kZWwsIHdoaWNoIHdpbGwgdGhlbiBiZSBleHRlbmRlZCBvbiBhbiBhY3Rpb24tYnktYWN0aW9uIGJhc2lzLiBXaGVuIHlvdSdyZSBkb25lIGNyZWF0aW5nIGEgdmlldyBtb2RlbCwgeW91IGNhbiBpbnZva2UgYGRvbmUobnVsbCwgbW9kZWwpYC4gSWYgYW4gZXJyb3Igb2NjdXJzIHdoaWxlIGJ1aWxkaW5nIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGNhbGwgYGRvbmUoZXJyKWAgaW5zdGVhZC5cXG5cXG4gICAgVGF1bnVzIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgYGRvbmVgIGlzIGludm9rZWQgd2l0aCBhbiBlcnJvciwgc28geW91IG1pZ2h0IHdhbnQgdG8gcHV0IHNhZmVndWFyZHMgaW4gcGxhY2UgYXMgdG8gYXZvaWQgdGhhdCBmcm9tIGhhcHBlbm5pbmcuIFRoZSByZWFzb24gdGhpcyBtZXRob2QgaXMgYXN5bmNocm9ub3VzIGlzIGJlY2F1c2UgeW91IG1heSBuZWVkIGRhdGFiYXNlIGFjY2VzcyBvciBzb21lc3VjaCB3aGVuIHB1dHRpbmcgdG9nZXRoZXIgdGhlIGRlZmF1bHRzLiBUaGUgcmVhc29uIHRoaXMgaXMgYSBtZXRob2QgYW5kIG5vdCBqdXN0IGFuIG9iamVjdCBpcyB0aGF0IHRoZSBkZWZhdWx0cyBtYXkgY2hhbmdlIGR1ZSB0byBodW1hbiBpbnRlcmFjdGlvbiB3aXRoIHRoZSBhcHBsaWNhdGlvbiwgYW5kIGluIHRob3NlIGNhc2VzIFt0aGUgZGVmYXVsdHMgY2FuIGJlIHJlYnVpbHRdKCN0YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwpLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucGxhaW50ZXh0P2BcXG5cXG4gICAgVGhlIGBwbGFpbnRleHRgIG9wdGlvbnMgb2JqZWN0IGlzIHBhc3NlZCBkaXJlY3RseSB0byBbaGdldF1bNV0sIGFuZCBpdCdzIHVzZWQgdG8gW3R3ZWFrIHRoZSBwbGFpbnRleHQgdmVyc2lvbl1bNl0gb2YgeW91ciBzaXRlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMucmVzb2x2ZXJzP2BcXG5cXG4gICAgUmVzb2x2ZXJzIGFyZSB1c2VkIHRvIGRldGVybWluZSB0aGUgbG9jYXRpb24gb2Ygc29tZSBvZiB0aGUgZGlmZmVyZW50IHBpZWNlcyBvZiB5b3VyIGFwcGxpY2F0aW9uLiBUeXBpY2FsbHkgeW91IHdvbid0IGhhdmUgdG8gdG91Y2ggdGhlc2UgaW4gdGhlIHNsaWdodGVzdC5cXG5cXG4gICAgU2lnbmF0dXJlICAgICAgICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBnZXRTZXJ2ZXJDb250cm9sbGVyKGFjdGlvbilgIHwgUmV0dXJuIHBhdGggdG8gc2VydmVyLXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGVcXG4gICAgYGdldFZpZXcoYWN0aW9uKWAgICAgICAgICAgICAgfCBSZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZVxcblxcbiAgICBUaGUgYGFkZFJvdXRlYCBtZXRob2QgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgIG9uIHRoZSBzZXJ2ZXItc2lkZSBpcyBtb3N0bHkgZ29pbmcgdG8gYmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBIVFRQIGZyYW1ld29yayBwbHVnaW5zLCBzbyBmZWVsIGZyZWUgdG8gc2tpcCBvdmVyIHRoZSBmb2xsb3dpbmcgc2VjdGlvbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnZlcnNpb24/YFxcblxcbiAgICBSZWZlciB0byB0aGUgW1ZlcnNpb25pbmddKCN2ZXJzaW9uaW5nKSBzZWN0aW9uLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIGBhZGRSb3V0ZShkZWZpbml0aW9uKWBcXG5cXG4gICAgVGhlIGBhZGRSb3V0ZShkZWZpbml0aW9uKWAgbWV0aG9kIHdpbGwgYmUgcGFzc2VkIGEgcm91dGUgZGVmaW5pdGlvbiwgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXMuIFRoaXMgbWV0aG9kIGlzIGV4cGVjdGVkIHRvIHJlZ2lzdGVyIGEgcm91dGUgaW4geW91ciBIVFRQIGZyYW1ld29yaydzIHJvdXRlci5cXG5cXG4gICAgLSBgcm91dGVgIGlzIHRoZSByb3V0ZSB0aGF0IHlvdSBzZXQgYXMgYGRlZmluaXRpb24ucm91dGVgXFxuICAgIC0gYGFjdGlvbmAgaXMgdGhlIGFjdGlvbiBhcyBwYXNzZWQgdG8gdGhlIHJvdXRlIGRlZmluaXRpb25cXG4gICAgLSBgYWN0aW9uRm5gIHdpbGwgYmUgdGhlIGNvbnRyb2xsZXIgZm9yIHRoaXMgYWN0aW9uIG1ldGhvZFxcbiAgICAtIGBtaWRkbGV3YXJlYCB3aWxsIGJlIGFuIGFycmF5IG9mIG1ldGhvZHMgdG8gYmUgZXhlY3V0ZWQgYmVmb3JlIGBhY3Rpb25GbmBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5yZW5kZXIoYWN0aW9uLCB2aWV3TW9kZWwsIHJlcSwgcmVzLCBuZXh0KWBcXG5cXG4gICAgVGhpcyBtZXRob2QgaXMgYWxtb3N0IGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBhcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIFRhdW51cyB0aHJvdWdoIG9uZSBvZiB0aGUgcGx1Z2lucyBhbnl3YXlzLCBzbyB3ZSB3b24ndCBnbyB2ZXJ5IGRlZXAgaW50byBpdC5cXG5cXG4gICAgVGhlIHJlbmRlciBtZXRob2QgaXMgd2hhdCBUYXVudXMgdXNlcyB0byByZW5kZXIgdmlld3MgYnkgY29uc3RydWN0aW5nIEhUTUwsIEpTT04sIG9yIHBsYWludGV4dCByZXNwb25zZXMuIFRoZSBgYWN0aW9uYCBwcm9wZXJ0eSBkZXRlcm1pbmVzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCB3aWxsIGJlIHJlbmRlcmVkLiBUaGUgYHZpZXdNb2RlbGAgd2lsbCBiZSBleHRlbmRlZCBieSBbdGhlIGRlZmF1bHQgdmlldyBtb2RlbF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKSwgYW5kIGl0IG1heSBhbHNvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGBhY3Rpb25gIGJ5IHNldHRpbmcgYHZpZXdNb2RlbC5tb2RlbC5hY3Rpb25gLlxcblxcbiAgICBUaGUgYHJlcWAsIGByZXNgLCBhbmQgYG5leHRgIGFyZ3VtZW50cyBhcmUgZXhwZWN0ZWQgdG8gYmUgdGhlIEV4cHJlc3Mgcm91dGluZyBhcmd1bWVudHMsIGJ1dCB0aGV5IGNhbiBhbHNvIGJlIG1vY2tlZCBfKHdoaWNoIGlzIGluIGZhY3Qgd2hhdCB0aGUgSGFwaSBwbHVnaW4gZG9lcylfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsKGRvbmU/KWBcXG5cXG4gICAgT25jZSBUYXVudXMgaGFzIGJlZW4gbW91bnRlZCwgY2FsbGluZyB0aGlzIG1ldGhvZCB3aWxsIHJlYnVpbGQgdGhlIHZpZXcgbW9kZWwgZGVmYXVsdHMgdXNpbmcgdGhlIGBnZXREZWZhdWx0Vmlld01vZGVsYCB0aGF0IHdhcyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgaW4gdGhlIG9wdGlvbnMuIEFuIG9wdGlvbmFsIGBkb25lYCBjYWxsYmFjayB3aWxsIGJlIGludm9rZWQgd2hlbiB0aGUgbW9kZWwgaXMgcmVidWlsdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBTZXJ2ZXItU2lkZSBDb250cm9sbGVyc1xcblxcbiAgICBPbiB0aGUgc2VydmVyLXNpZGUsIGNvbnRyb2xsZXJzIGFyZSBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIGZ1bmN0aW9uLiBUaGUgcGFyYW1ldGVycyBwYXNzZWQgdG8gdGhlc2UgY29udHJvbGxlcnMgZGVwZW5kIG9uIHRoZSBzZXJ2ZXItc2lkZSBIVFRQIGZyYW1ld29yayB0aGF0J3MgYmVpbmcgdXNlZC5cXG5cXG4gICAgRm9yIGV4YW1wbGUsIEV4cHJlc3MgZ2l2ZXMgdXMgdGhyZWUgcGFyYW1ldGVyczogYHJlcWAsIGByZXNgIGFuZCBgbmV4dGAuIEhhcGkgZ2l2ZXMgdXMgdHdvIGluc3RlYWQ6IGByZXF1ZXN0YCBhbmQgYHJlcGx5YC5cXG5cXG4gICAgSGVyZSdzIGEgc2FtcGxlIGNvbnRyb2xsZXIgdXNpbmcgYHRhdW51cy1leHByZXNzYCwgYXMgW2RldGFpbGVkIGJlbG93XSgjdXNpbmctdGF1bnVzLWV4cHJlc3MtKS4gVGhpcyBpcyBhIHZlcnkgc2ltcGxlIGNvbnRyb2xsZXIgd2hlcmUgd2UgYXJlIHNldHRpbmcgdGhlIHNwZWNpYWwgYHZpZXdNb2RlbGAgcHJvcGVydHkgb24gdGhlIHJlc3BvbnNlLCBhbmQgY2FsbGluZyBgbmV4dGAuIFN1cHBvc2UgdGhpcyBjb250cm9sbGVyIGlzIHRoZSBgcHJvZHVjdC9ob21lYCBhY3Rpb24gaGFuZGxlci5cXG5cXG4gICAgYGBganNcXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gICAgICByZXMudmlld01vZGVsID0ge1xcbiAgICAgICAgbW9kZWw6IHtcXG4gICAgICAgICAgdGl0bGU6ICd2aWV3IHRpdGxlJ1xcbiAgICAgICAgfVxcbiAgICAgIH07XFxuICAgICAgbmV4dCgpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgQXMgeW91IGNhbiBzZWUsIFRhdW51cyB3b24ndCBhbHRlciB0aGUgQVBJIHByb3ZpZGVkIGJ5IEV4cHJlc3MuIEluc3RlYWQsIGl0IGJ1aWxkcyB1cG9uIHRoZSBub3Rpb24gb2YgdXNpbmcgbWlkZGxld2FyZS4gT25jZSB0aGUgYHByb2R1Y3QvaG9tZWAgdmlldyBpcyByZW5kZXJlZCBhbmQgSmF2YVNjcmlwdCBsb2FkcywgdGhlIGBwcm9kdWN0L2hvbWVgIHZpZXcgY29udHJvbGxlciBpcyBleGVjdXRlZCBvbiB0aGUgY2xpZW50LXNpZGUuXFxuXFxuICAgIFlvdSBjb3VsZCBjaGFuZ2UgdGhlIHZpZXcgdG8gYmUgcmVuZGVyZWQgYnkgc2V0dGluZyB0aGUgYGFjdGlvbmAgcHJvcGVydHkgb24gdGhlIGBtb2RlbGAuIEluIHRoZSBleGFtcGxlIHNob3duIGJlbG93IHRoaXMgd291bGQgbWVhbiB0aGF0IHRoZSBgZXJyb3Ivb2ZmbGluZWAgdmlldyB3b3VsZCBiZSByZW5kZXJlZC4gVGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgd2lsbCBiZSB0aGF0IG9mIGBlcnJvci9vZmZsaW5lYCwgYXMgd2VsbC4gVmlldyBjb250cm9sbGVycyBhcmUgdGllZCB0byB0aGUgdmlldyB0aGF0IGdldHMgcmVuZGVyZWQuXFxuXFxuICAgIGBgYGpzXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICAgICAgcmVzLnZpZXdNb2RlbCA9IHtcXG4gICAgICAgIG1vZGVsOiB7XFxuICAgICAgICAgIHRpdGxlOiAndmlldyB0aXRsZSdcXG4gICAgICAgIH1cXG4gICAgICB9O1xcbiAgICAgIGlmIChvZmZsaW5lKSB7XFxuICAgICAgICByZXMudmlld01vZGVsLm1vZGVsLmFjdGlvbiA9ICdlcnJvci9vZmZsaW5lJztcXG4gICAgICB9XFxuICAgICAgbmV4dCgpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgSGF2aW5nIGEgZGVmYXVsdCBhY3Rpb24gYW5kIHRoZSBhYmlsaXR5IHRvIHJlZGlyZWN0IHRvIGFub3RoZXIgZ2l2ZXMgdXMgYSBsb3Qgb2YgZmxleGliaWxpdHkgd2hlbiBkZXRlcm1pbmluZyBob3cgdG8gcmVzcG9uZCB0byBhIHJlcXVlc3QuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgSFRUUCBGcmFtZXdvcmsgUGx1Z2luc1xcblxcbiAgICBUaGVyZSdzIGN1cnJlbnRseSB0d28gZGlmZmVyZW50IEhUVFAgZnJhbWV3b3JrcyBfKFtFeHByZXNzXVsyXSBhbmQgW0hhcGldWzNdKV8gdGhhdCB5b3UgY2FuIHJlYWRpbHkgdXNlIHdpdGggVGF1bnVzIHdpdGhvdXQgaGF2aW5nIHRvIGRlYWwgd2l0aCBhbnkgb2YgdGhlIHJvdXRlIHBsdW1iaW5nIHlvdXJzZWxmLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBVc2luZyBgdGF1bnVzLWV4cHJlc3NgXFxuXFxuICAgIFRoZSBgdGF1bnVzLWV4cHJlc3NgIHBsdWdpbiBpcyBwcm9iYWJseSB0aGUgZWFzaWVzdCB0byB1c2UsIGFzIFRhdW51cyB3YXMgb3JpZ2luYWxseSBkZXZlbG9wZWQgd2l0aCBqdXN0IFtFeHByZXNzXVsyXSBpbiBtaW5kLiBJbiBhZGRpdGlvbiB0byB0aGUgb3B0aW9ucyBhbHJlYWR5IG91dGxpbmVkIGZvciBbdGF1bnVzLm1vdW50XSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSksIHlvdSBjYW4gYWRkIG1pZGRsZXdhcmUgZm9yIGFueSByb3V0ZSBpbmRpdmlkdWFsbHkuXFxuXFxuICAgIC0gYG1pZGRsZXdhcmVgIGFyZSBhbnkgbWV0aG9kcyB5b3Ugd2FudCBUYXVudXMgdG8gZXhlY3V0ZSBhcyBtaWRkbGV3YXJlIGluIEV4cHJlc3MgYXBwbGljYXRpb25zXFxuXFxuICAgIFRvIGdldCBgdGF1bnVzLWV4cHJlc3NgIGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgcHJvdmlkZWQgdGhhdCB5b3UgY29tZSB1cCB3aXRoIGFuIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICAvLyAuLi5cXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgYHRhdW51c0V4cHJlc3NgIG1ldGhvZCB3aWxsIG1lcmVseSBzZXQgdXAgVGF1bnVzIGFuZCBhZGQgdGhlIHJlbGV2YW50IHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgYXBwbGljYXRpb24gYnkgY2FsbGluZyBgYXBwLmdldGAgYSBidW5jaCBvZiB0aW1lcy4gWW91IGNhbiBbZmluZCB0YXVudXMtZXhwcmVzcyBvbiBHaXRIdWJdWzddLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBVc2luZyBgdGF1bnVzLWhhcGlgXFxuXFxuICAgIFRoZSBgdGF1bnVzLWhhcGlgIHBsdWdpbiBpcyBhIGJpdCBtb3JlIGludm9sdmVkLCBhbmQgeW91J2xsIGhhdmUgdG8gY3JlYXRlIGEgUGFjayBpbiBvcmRlciB0byB1c2UgaXQuIEluIGFkZGl0aW9uIHRvIFt0aGUgb3B0aW9ucyB3ZSd2ZSBhbHJlYWR5IGNvdmVyZWRdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgeW91IGNhbiBhZGQgYGNvbmZpZ2Agb24gYW55IHJvdXRlLlxcblxcbiAgICAtIGBjb25maWdgIGlzIHBhc3NlZCBkaXJlY3RseSBpbnRvIHRoZSByb3V0ZSByZWdpc3RlcmVkIHdpdGggSGFwaSwgZ2l2aW5nIHlvdSB0aGUgbW9zdCBmbGV4aWJpbGl0eVxcblxcbiAgICBUbyBnZXQgYHRhdW51cy1oYXBpYCBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIGFuZCB5b3UgY2FuIGJyaW5nIHlvdXIgb3duIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIEhhcGkgPSByZXF1aXJlKCdoYXBpJyk7XFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0hhcGkgPSByZXF1aXJlKCd0YXVudXMtaGFwaScpKHRhdW51cyk7XFxuICAgIHZhciBwYWNrID0gbmV3IEhhcGkuUGFjaygpO1xcblxcbiAgICBwYWNrLnJlZ2lzdGVyKHtcXG4gICAgICBwbHVnaW46IHRhdW51c0hhcGksXFxuICAgICAgb3B0aW9uczoge1xcbiAgICAgICAgLy8gLi4uXFxuICAgICAgfVxcbiAgICB9KTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgdGF1bnVzSGFwaWAgcGx1Z2luIHdpbGwgbW91bnQgVGF1bnVzIGFuZCByZWdpc3RlciBhbGwgb2YgdGhlIG5lY2Vzc2FyeSByb3V0ZXMuIFlvdSBjYW4gW2ZpbmQgdGF1bnVzLWhhcGkgb24gR2l0SHViXVs4XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBDb21tYW5kLUxpbmUgSW50ZXJmYWNlXFxuXFxuICAgIE9uY2UgeW91J3ZlIHNldCB1cCB0aGUgc2VydmVyLXNpZGUgdG8gcmVuZGVyIHlvdXIgdmlld3MgdXNpbmcgVGF1bnVzLCBpdCdzIG9ubHkgbG9naWNhbCB0aGF0IHlvdSdsbCB3YW50IHRvIHJlbmRlciB0aGUgdmlld3MgaW4gdGhlIGNsaWVudC1zaWRlIGFzIHdlbGwsIGVmZmVjdGl2ZWx5IGNvbnZlcnRpbmcgeW91ciBhcHBsaWNhdGlvbiBpbnRvIGEgc2luZ2xlLXBhZ2UgYXBwbGljYXRpb24gYWZ0ZXIgdGhlIGZpcnN0IHZpZXcgaGFzIGJlZW4gcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLlxcblxcbiAgICBUaGUgVGF1bnVzIENMSSBpcyBhbiB1c2VmdWwgaW50ZXJtZWRpYXJ5IGluIHRoZSBwcm9jZXNzIG9mIGdldHRpbmcgdGhlIGNvbmZpZ3VyYXRpb24geW91IHdyb3RlIHNvIGZhciBmb3IgdGhlIHNlcnZlci1zaWRlIHRvIGFsc28gd29yayB3ZWxsIGluIHRoZSBjbGllbnQtc2lkZS5cXG5cXG4gICAgSW5zdGFsbCBpdCBnbG9iYWxseSBmb3IgZGV2ZWxvcG1lbnQsIGJ1dCByZW1lbWJlciB0byB1c2UgbG9jYWwgY29waWVzIGZvciBwcm9kdWN0aW9uLWdyYWRlIHVzZXMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC1nIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgV2hlbiBpbnZva2VkIHdpdGhvdXQgYW55IGFyZ3VtZW50cywgdGhlIENMSSB3aWxsIHNpbXBseSBmb2xsb3cgdGhlIGRlZmF1bHQgY29udmVudGlvbnMgdG8gZmluZCB5b3VyIHJvdXRlIGRlZmluaXRpb25zLCB2aWV3cywgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXNcXG4gICAgYGBgXFxuXFxuICAgIEJ5IGRlZmF1bHQsIHRoZSBvdXRwdXQgd2lsbCBiZSBwcmludGVkIHRvIHRoZSBzdGFuZGFyZCBvdXRwdXQsIG1ha2luZyBmb3IgYSBmYXN0IGRlYnVnZ2luZyBleHBlcmllbmNlLiBIZXJlJ3MgdGhlIG91dHB1dCBpZiB5b3UganVzdCBoYWQgYSBzaW5nbGUgYGhvbWUvaW5kZXhgIHJvdXRlLCBhbmQgdGhlIG1hdGNoaW5nIHZpZXcgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZXhpc3RlZC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGVtcGxhdGVzID0ge1xcbiAgICAgICdob21lL2luZGV4JzogcmVxdWlyZSgnLi92aWV3cy9ob21lL2luZGV4LmpzJylcXG4gICAgfTtcXG5cXG4gICAgdmFyIGNvbnRyb2xsZXJzID0ge1xcbiAgICAgICdob21lL2luZGV4JzogcmVxdWlyZSgnLi4vY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgcm91dGVzID0gW1xcbiAgICAgIHtcXG4gICAgICAgIHJvdXRlOiAnLycsXFxuICAgICAgICBhY3Rpb246ICdob21lL2luZGV4J1xcbiAgICAgIH1cXG4gICAgXTtcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XFxuICAgICAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICAgICAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgICAgIHJvdXRlczogcm91dGVzXFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBZb3UgY2FuIHVzZSBhIGZldyBvcHRpb25zIHRvIGFsdGVyIHRoZSBvdXRjb21lIG9mIGludm9raW5nIGB0YXVudXNgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS1vdXRwdXRgXFxuXFxuICAgIDxzdWI+dGhlIGAtb2AgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIE91dHB1dCBpcyB3cml0dGVuIHRvIGEgZmlsZSBpbnN0ZWFkIG9mIHRvIHN0YW5kYXJkIG91dHB1dC4gVGhlIGZpbGUgcGF0aCB1c2VkIHdpbGwgYmUgdGhlIGBjbGllbnRfd2lyaW5nYCBvcHRpb24gaW4gW2AudGF1bnVzcmNgXSgjdGhlLXRhdW51c3JjLW1hbmlmZXN0KSwgd2hpY2ggZGVmYXVsdHMgdG8gYCcuYmluL3dpcmluZy5qcydgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS13YXRjaGBcXG5cXG4gICAgPHN1Yj50aGUgYC13YCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgV2hlbmV2ZXIgYSBzZXJ2ZXItc2lkZSByb3V0ZSBkZWZpbml0aW9uIGNoYW5nZXMsIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCBhZ2FpbiB0byBlaXRoZXIgc3RhbmRhcmQgb3V0cHV0IG9yIGEgZmlsZSwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgYC0tb3V0cHV0YCB3YXMgdXNlZC5cXG5cXG4gICAgVGhlIHByb2dyYW0gd29uJ3QgZXhpdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tdHJhbnNmb3JtIDxtb2R1bGU+YFxcblxcbiAgICA8c3ViPnRoZSBgLXRgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBUaGlzIGZsYWcgYWxsb3dzIHlvdSB0byB0cmFuc2Zvcm0gc2VydmVyLXNpZGUgcm91dGVzIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSB1bmRlcnN0YW5kcy4gRXhwcmVzcyByb3V0ZXMgYXJlIGNvbXBsZXRlbHkgY29tcGF0aWJsZSB3aXRoIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIsIGJ1dCBIYXBpIHJvdXRlcyBuZWVkIHRvIGJlIHRyYW5zZm9ybWVkIHVzaW5nIHRoZSBbYGhhcGlpZnlgXVs5XSBtb2R1bGUuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIGhhcGlpZnlcXG4gICAgdGF1bnVzIC10IGhhcGlpZnlcXG4gICAgYGBgXFxuXFxuICAgIFVzaW5nIHRoaXMgdHJhbnNmb3JtIHJlbGlldmVzIHlvdSBmcm9tIGhhdmluZyB0byBkZWZpbmUgdGhlIHNhbWUgcm91dGVzIHR3aWNlIHVzaW5nIHNsaWdodGx5IGRpZmZlcmVudCBmb3JtYXRzIHRoYXQgY29udmV5IHRoZSBzYW1lIG1lYW5pbmcuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXJlc29sdmVycyA8bW9kdWxlPmBcXG5cXG4gICAgPHN1Yj50aGUgYC1yYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgU2ltaWxhcmx5IHRvIHRoZSBbYHJlc29sdmVyc2BdKCMtb3B0aW9ucy1yZXNvbHZlcnMtKSBvcHRpb24gdGhhdCB5b3UgY2FuIHBhc3MgdG8gW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSksIHRoZXNlIHJlc29sdmVycyBjYW4gY2hhbmdlIHRoZSB3YXkgaW4gd2hpY2ggZmlsZSBwYXRocyBhcmUgcmVzb2x2ZWQuXFxuXFxuICAgIFNpZ25hdHVyZSAgICAgICAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgZ2V0Q2xpZW50Q29udHJvbGxlcihhY3Rpb24pYCB8IFJldHVybiBwYXRoIHRvIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlXFxuICAgIGBnZXRWaWV3KGFjdGlvbilgICAgICAgICAgICAgIHwgUmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGVcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tc3RhbmRhbG9uZWBcXG5cXG4gICAgPHN1Yj50aGUgYC1zYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgVW5kZXIgdGhpcyBleHBlcmltZW50YWwgZmxhZywgdGhlIENMSSB3aWxsIHVzZSBCcm93c2VyaWZ5IHRvIGNvbXBpbGUgYSBzdGFuZGFsb25lIG1vZHVsZSB0aGF0IGluY2x1ZGVzIHRoZSB3aXJpbmcgbm9ybWFsbHkgZXhwb3J0ZWQgYnkgdGhlIENMSSBwbHVzIGFsbCBvZiBUYXVudXMgW2FzIGEgVU1EIG1vZHVsZV1bMTBdLlxcblxcbiAgICBUaGlzIHdvdWxkIGFsbG93IHlvdSB0byB1c2UgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSBldmVuIGlmIHlvdSBkb24ndCB3YW50IHRvIHVzZSBbQnJvd3NlcmlmeV1bMTFdIGRpcmVjdGx5LlxcblxcbiAgICBGZWVkYmFjayBhbmQgc3VnZ2VzdGlvbnMgYWJvdXQgdGhpcyBmbGFnLCBfYW5kIHBvc3NpYmxlIGFsdGVybmF0aXZlcyB0aGF0IHdvdWxkIG1ha2UgVGF1bnVzIGVhc2llciB0byB1c2VfLCBhcmUgd2VsY29tZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBDbGllbnQtc2lkZSBBUElcXG5cXG4gICAgSnVzdCBsaWtlIHRoZSBzZXJ2ZXItc2lkZSwgZXZlcnl0aGluZyBpbiB0aGUgY2xpZW50LXNpZGUgYmVnaW5zIGF0IHRoZSBtb3VudHBvaW50LiBPbmNlIHRoZSBhcHBsaWNhdGlvbiBpcyBtb3VudGVkLCBhbmNob3IgbGlua3Mgd2lsbCBiZSBoaWphY2tlZCBhbmQgdGhlIGNsaWVudC1zaWRlIHJvdXRlciB3aWxsIHRha2Ugb3ZlciB2aWV3IHJlbmRlcmluZy4gQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4ZWN1dGVkIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucz8pYFxcblxcbiAgICBUaGUgbW91bnRwb2ludCB0YWtlcyBhIHJvb3QgY29udGFpbmVyLCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGFuIG9wdGlvbnMgcGFyYW1ldGVyLiBUaGUgYGNvbnRhaW5lcmAgaXMgd2hlcmUgY2xpZW50LXNpZGUtcmVuZGVyZWQgdmlld3Mgd2lsbCBiZSBwbGFjZWQsIGJ5IHJlcGxhY2luZyB3aGF0ZXZlciBIVE1MIGNvbnRlbnRzIGFscmVhZHkgZXhpc3QuIFlvdSBjYW4gcGFzcyBpbiB0aGUgYHdpcmluZ2AgbW9kdWxlIGV4YWN0bHkgYXMgYnVpbHQgYnkgdGhlIENMSSwgYW5kIG5vIGZ1cnRoZXIgY29uZmlndXJhdGlvbiBpcyBuZWNlc3NhcnkuXFxuXFxuICAgIFdoZW4gdGhlIG1vdW50cG9pbnQgZXhlY3V0ZXMsIFRhdW51cyB3aWxsIGNvbmZpZ3VyZSBpdHMgaW50ZXJuYWwgc3RhdGUsIF9zZXQgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcl8sIHJ1biB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBmb3IgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcsIGFuZCBzdGFydCBoaWphY2tpbmcgbGlua3MuXFxuXFxuICAgIEFzIGFuIGV4YW1wbGUsIGNvbnNpZGVyIGEgYnJvd3NlciBtYWtlcyBhIGBHRVRgIHJlcXVlc3QgZm9yIGAvYXJ0aWNsZXMvdGhlLWZveGAgZm9yIHRoZSBmaXJzdCB0aW1lLiBPbmNlIGB0YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcpYCBpcyBpbnZva2VkIG9uIHRoZSBjbGllbnQtc2lkZSwgc2V2ZXJhbCB0aGluZ3Mgd291bGQgaGFwcGVuIGluIHRoZSBvcmRlciBsaXN0ZWQgYmVsb3cuXFxuXFxuICAgIC0gVGF1bnVzIHNldHMgdXAgdGhlIGNsaWVudC1zaWRlIHZpZXcgcm91dGluZyBlbmdpbmVcXG4gICAgLSBJZiBlbmFibGVkIF8odmlhIGBvcHRpb25zYClfLCB0aGUgY2FjaGluZyBlbmdpbmUgaXMgY29uZmlndXJlZFxcbiAgICAtIFRhdW51cyBvYnRhaW5zIHRoZSB2aWV3IG1vZGVsIF8obW9yZSBvbiB0aGlzIGxhdGVyKV9cXG4gICAgLSBXaGVuIGEgdmlldyBtb2RlbCBpcyBvYnRhaW5lZCwgdGhlIGAnc3RhcnQnYCBldmVudCBpcyBlbWl0dGVkXFxuICAgIC0gQW5jaG9yIGxpbmtzIHN0YXJ0IGJlaW5nIG1vbml0b3JlZCBmb3IgY2xpY2tzIF8oYXQgdGhpcyBwb2ludCB5b3VyIGFwcGxpY2F0aW9uIGJlY29tZXMgYSBbU1BBXVsxM10pX1xcbiAgICAtIFRoZSBgYXJ0aWNsZXMvYXJ0aWNsZWAgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBleGVjdXRlZFxcblxcbiAgICBUaGF0J3MgcXVpdGUgYSBiaXQgb2YgZnVuY3Rpb25hbGl0eSwgYnV0IGlmIHlvdSB0aGluayBhYm91dCBpdCwgbW9zdCBvdGhlciBmcmFtZXdvcmtzIGFsc28gcmVuZGVyIHRoZSB2aWV3IGF0IHRoaXMgcG9pbnQsIF9yYXRoZXIgdGhhbiBvbiB0aGUgc2VydmVyLXNpZGUhX1xcblxcbiAgICBJbiBvcmRlciB0byBiZXR0ZXIgdW5kZXJzdGFuZCB0aGUgcHJvY2VzcywgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBgb3B0aW9uc2AgcGFyYW1ldGVyLlxcblxcbiAgICBGaXJzdCBvZmYsIHRoZSBgYm9vdHN0cmFwYCBvcHRpb24gZGV0ZXJtaW5lcyB0aGUgc3RyYXRlZ3kgdXNlZCB0byBwdWxsIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3IGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGVyZSBhcmUgdGhyZWUgcG9zc2libGUgc3RyYXRlZ2llcyBhdmFpbGFibGU6IGBhdXRvYCBfKHRoZSBkZWZhdWx0IHN0cmF0ZWd5KV8sIGBpbmxpbmVgLCBvciBgbWFudWFsYC4gVGhlIGBhdXRvYCBzdHJhdGVneSBpbnZvbHZlcyB0aGUgbGVhc3Qgd29yaywgd2hpY2ggaXMgd2h5IGl0J3MgdGhlIGRlZmF1bHQuXFxuXFxuICAgIC0gYGF1dG9gIHdpbGwgbWFrZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsXFxuICAgIC0gYGlubGluZWAgZXhwZWN0cyB5b3UgdG8gcGxhY2UgdGhlIG1vZGVsIGludG8gYSBgPHNjcmlwdCB0eXBlPSd0ZXh0L3RhdW51cyc+YCB0YWdcXG4gICAgLSBgbWFudWFsYCBleHBlY3RzIHlvdSB0byBnZXQgdGhlIHZpZXcgbW9kZWwgaG93ZXZlciB5b3Ugd2FudCB0bywgYW5kIHRoZW4gbGV0IFRhdW51cyBrbm93IHdoZW4gaXQncyByZWFkeVxcblxcbiAgICBMZXQncyBnbyBpbnRvIGRldGFpbCBhYm91dCBlYWNoIG9mIHRoZXNlIHN0cmF0ZWdpZXMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGBhdXRvYCBzdHJhdGVneVxcblxcbiAgICBUaGUgYGF1dG9gIHN0cmF0ZWd5IG1lYW5zIHRoYXQgVGF1bnVzIHdpbGwgbWFrZSB1c2Ugb2YgYW4gQUpBWCByZXF1ZXN0IHRvIG9idGFpbiB0aGUgdmlldyBtb2RlbC4gX1lvdSBkb24ndCBoYXZlIHRvIGRvIGFueXRoaW5nIGVsc2VfIGFuZCB0aGlzIGlzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5LiBUaGlzIGlzIHRoZSAqKm1vc3QgY29udmVuaWVudCBzdHJhdGVneSwgYnV0IGFsc28gdGhlIHNsb3dlc3QqKiBvbmUuXFxuXFxuICAgIEl0J3Mgc2xvdyBiZWNhdXNlIHRoZSB2aWV3IG1vZGVsIHdvbid0IGJlIHJlcXVlc3RlZCB1bnRpbCB0aGUgYnVsayBvZiB5b3VyIEphdmFTY3JpcHQgY29kZSBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGV4ZWN1dGVkLCBhbmQgYHRhdW51cy5tb3VudGAgaXMgaW52b2tlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgYGlubGluZWAgc3RyYXRlZ3lcXG5cXG4gICAgVGhlIGBpbmxpbmVgIHN0cmF0ZWd5IGV4cGVjdHMgeW91IHRvIGFkZCBhIGBkYXRhLXRhdW51c2AgYXR0cmlidXRlIG9uIHRoZSBgY29udGFpbmVyYCBlbGVtZW50LiBUaGlzIGF0dHJpYnV0ZSBtdXN0IGJlIGVxdWFsIHRvIHRoZSBgaWRgIGF0dHJpYnV0ZSBvZiBhIGA8c2NyaXB0PmAgdGFnIGNvbnRhaW5pbmcgdGhlIHNlcmlhbGl6ZWQgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZlcnNpb24gaW5mb3JtYXRpb24gYXV0b21hdGljYWxseSBpbmplY3RlZCBieSBUYXVudXMgaW50byB0aGUgbGF5b3V0IHRlbXBsYXRlIGRhdGEuXFxuXFxuICAgIGBgYGphZGVcXG4gICAgZGl2KGRhdGEtdGF1bnVzPSdtb2RlbCcpIT1wYXJ0aWFsXFxuICAgIHNjcmlwdCh0eXBlPSd0ZXh0L3RhdW51cycsIGRhdGEtdGF1bnVzPSdtb2RlbCcpPUpTT04uc3RyaW5naWZ5KHsgdmVyc2lvbjogdmVyc2lvbiwgbW9kZWw6IG1vZGVsIH0pXFxuICAgIGBgYFxcblxcbiAgICBQYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gdGhlIGZhY3QgdGhhdCB0aGUgbW9kZWwgaXMgbm90IG9ubHkgbWFkZSBpbnRvIGEgSlNPTiBzdHJpbmcsIF9idXQgYWxzbyBIVE1MIGVuY29kZWQgYnkgSmFkZV8uIFdoZW4gVGF1bnVzIGV4dHJhY3RzIHRoZSBtb2RlbCBmcm9tIHRoZSBgPHNjcmlwdD5gIHRhZyBpdCdsbCB1bmVzY2FwZSBpdCwgYW5kIHRoZW4gcGFyc2UgaXQgYXMgSlNPTi5cXG5cXG4gICAgVGhpcyBzdHJhdGVneSBpcyBhbHNvIGZhaXJseSBjb252ZW5pZW50IHRvIHNldCB1cCwgYnV0IGl0IGludm9sdmVzIGEgbGl0dGxlIG1vcmUgd29yay4gSXQgbWlnaHQgYmUgd29ydGh3aGlsZSB0byB1c2UgaW4gY2FzZXMgd2hlcmUgbW9kZWxzIGFyZSBzbWFsbCwgYnV0IGl0IHdpbGwgc2xvdyBkb3duIHNlcnZlci1zaWRlIHZpZXcgcmVuZGVyaW5nLCBhcyB0aGUgbW9kZWwgaXMgaW5saW5lZCBhbG9uZ3NpZGUgdGhlIEhUTUwuXFxuXFxuICAgIFRoYXQgbWVhbnMgdGhhdCB0aGUgY29udGVudCB5b3UgYXJlIHN1cHBvc2VkIHRvIGJlIHByaW9yaXRpemluZyBpcyBnb2luZyB0byB0YWtlIGxvbmdlciB0byBnZXQgdG8geW91ciBodW1hbnMsIGJ1dCBvbmNlIHRoZXkgZ2V0IHRoZSBIVE1MLCB0aGlzIHN0cmF0ZWd5IHdpbGwgZXhlY3V0ZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBhbG1vc3QgaW1tZWRpYXRlbHkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGBtYW51YWxgIHN0cmF0ZWd5XFxuXFxuICAgIFRoZSBgbWFudWFsYCBzdHJhdGVneSBpcyB0aGUgbW9zdCBpbnZvbHZlZCBvZiB0aGUgdGhyZWUsIGJ1dCBhbHNvIHRoZSBtb3N0IHBlcmZvcm1hbnQuIEluIHRoaXMgc3RyYXRlZ3kgeW91J3JlIHN1cHBvc2VkIHRvIGFkZCB0aGUgZm9sbG93aW5nIF8oc2VlbWluZ2x5IHBvaW50bGVzcylfIHNuaXBwZXQgb2YgY29kZSBpbiBhIGA8c2NyaXB0PmAgb3RoZXIgdGhhbiB0aGUgb25lIHRoYXQncyBwdWxsaW5nIGRvd24gVGF1bnVzLCBzbyB0aGF0IHRoZXkgYXJlIHB1bGxlZCBjb25jdXJyZW50bHkgcmF0aGVyIHRoYW4gc2VyaWFsbHkuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPbmNlIHlvdSBzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGludm9rZSBgdGF1bnVzUmVhZHkobW9kZWwpYC4gQ29uc2lkZXJpbmcgeW91J2xsIGJlIHB1bGxpbmcgYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGF0IHRoZSBzYW1lIHRpbWUsIGEgbnVtYmVyIG9mIGRpZmZlcmVudCBzY2VuYXJpb3MgbWF5IHBsYXkgb3V0LlxcblxcbiAgICAtIFRoZSB2aWV3IG1vZGVsIGlzIGxvYWRlZCBmaXJzdCwgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHdhaXQgZm9yIFRhdW51cyB0byB0YWtlIHRoZSBtb2RlbCBvYmplY3QgYW5kIGJvb3QgdGhlIGFwcGxpY2F0aW9uIGFzIHNvb24gYXMgYHRhdW51cy5tb3VudGAgaXMgZXhlY3V0ZWRcXG4gICAgLSBUYXVudXMgbG9hZHMgZmlyc3QgYW5kIGB0YXVudXMubW91bnRgIGlzIGNhbGxlZCBmaXJzdC4gSW4gdGhpcyBjYXNlLCBUYXVudXMgd2lsbCByZXBsYWNlIGB3aW5kb3cudGF1bnVzUmVhZHlgIHdpdGggYSBzcGVjaWFsIGBib290YCBtZXRob2QuIFdoZW4gdGhlIHZpZXcgbW9kZWwgZmluaXNoZXMgbG9hZGluZywgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHRoZSBhcHBsaWNhdGlvbiBmaW5pc2hlcyBib290aW5nXFxuXFxuICAgID4gSWYgdGhpcyBzb3VuZHMgYSBsaXR0bGUgbWluZC1iZW5kaW5nIGl0J3MgYmVjYXVzZSBpdCBpcy4gSXQncyBub3QgZGVzaWduZWQgdG8gYmUgcHJldHR5LCBidXQgbWVyZWx5IHRvIGJlIHBlcmZvcm1hbnQuXFxuXFxuICAgIE5vdyB0aGF0IHdlJ3ZlIGFkZHJlc3NlZCB0aGUgYXdrd2FyZCBiaXRzLCBsZXQncyBjb3ZlciB0aGUgX1xcXCJzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsXFxcIl8gYXNwZWN0LiBNeSBwcmVmZXJyZWQgbWV0aG9kIGlzIHVzaW5nIEpTT05QLCBhcyBpdCdzIGFibGUgdG8gZGVsaXZlciB0aGUgc21hbGxlc3Qgc25pcHBldCBwb3NzaWJsZSwgYW5kIGl0IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBzZXJ2ZXItc2lkZSBjYWNoaW5nLiBDb25zaWRlcmluZyB5b3UnbGwgcHJvYmFibHkgd2FudCB0aGlzIHRvIGJlIGFuIGlubGluZSBzY3JpcHQsIGtlZXBpbmcgaXQgc21hbGwgaXMgaW1wb3J0YW50LlxcblxcbiAgICBUaGUgZ29vZCBuZXdzIGlzIHRoYXQgdGhlIHNlcnZlci1zaWRlIHN1cHBvcnRzIEpTT05QIG91dCB0aGUgYm94LiBIZXJlJ3MgYSBzbmlwcGV0IG9mIGNvZGUgeW91IGNvdWxkIHVzZSB0byBwdWxsIGRvd24gdGhlIHZpZXcgbW9kZWwgYW5kIGJvb3QgVGF1bnVzIHVwIGFzIHNvb24gYXMgYm90aCBvcGVyYXRpb25zIGFyZSByZWFkeS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBmdW5jdGlvbiBpbmplY3QgKHVybCkge1xcbiAgICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcXG4gICAgICBzY3JpcHQuc3JjID0gdXJsO1xcbiAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcXG4gICAgfVxcblxcbiAgICBmdW5jdGlvbiBpbmplY3RvciAoKSB7XFxuICAgICAgdmFyIHNlYXJjaCA9IGxvY2F0aW9uLnNlYXJjaDtcXG4gICAgICB2YXIgc2VhcmNoUXVlcnkgPSBzZWFyY2ggPyAnJicgKyBzZWFyY2guc3Vic3RyKDEpIDogJyc7XFxuICAgICAgdmFyIHNlYXJjaEpzb24gPSAnP2pzb24mY2FsbGJhY2s9dGF1bnVzUmVhZHknICsgc2VhcmNoUXVlcnk7XFxuICAgICAgaW5qZWN0KGxvY2F0aW9uLnBhdGhuYW1lICsgc2VhcmNoSnNvbik7XFxuICAgIH1cXG5cXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuXFxuICAgIGluamVjdG9yKCk7XFxuICAgIGBgYFxcblxcbiAgICBBcyBtZW50aW9uZWQgZWFybGllciwgdGhpcyBhcHByb2FjaCBpbnZvbHZlcyBnZXR0aW5nIHlvdXIgaGFuZHMgZGlydGllciBidXQgaXQgcGF5cyBvZmYgYnkgYmVpbmcgdGhlIGZhc3Rlc3Qgb2YgdGhlIHRocmVlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENhY2hpbmdcXG5cXG4gICAgVGhlIGNsaWVudC1zaWRlIGluIFRhdW51cyBzdXBwb3J0cyBjYWNoaW5nIGluLW1lbW9yeSBhbmQgdXNpbmcgdGhlIGVtYmVkZGVkIEluZGV4ZWREQiBzeXN0ZW0gYnkgbWVyZWx5IHR1cm5pbmcgb24gdGhlIGBjYWNoZWAgZmxhZyBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgb24gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJZiB5b3Ugc2V0IGBjYWNoZWAgdG8gYHRydWVgIHRoZW4gY2FjaGVkIGl0ZW1zIHdpbGwgYmUgY29uc2lkZXJlZCBfXFxcImZyZXNoXFxcIiAodmFsaWQgY29waWVzIG9mIHRoZSBvcmlnaW5hbClfIGZvciAqKjE1IHNlY29uZHMqKi4gWW91IGNhbiBhbHNvIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyLCBhbmQgdGhhdCBudW1iZXIgb2Ygc2Vjb25kcyB3aWxsIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgaW5zdGVhZC5cXG5cXG4gICAgQ2FjaGluZyBjYW4gYWxzbyBiZSB0d2Vha2VkIG9uIGluZGl2aWR1YWwgcm91dGVzLiBGb3IgaW5zdGFuY2UsIHlvdSBjb3VsZCBzZXQgYHsgY2FjaGU6IHRydWUgfWAgd2hlbiBtb3VudGluZyBUYXVudXMgYW5kIHRoZW4gaGF2ZSBgeyBjYWNoZTogMzYwMCB9YCBvbiBhIHJvdXRlIHRoYXQgeW91IHdhbnQgdG8gY2FjaGUgZm9yIGEgbG9uZ2VyIHBlcmlvZCBvZiB0aW1lLlxcblxcbiAgICBUaGUgY2FjaGluZyBsYXllciBpcyBfc2VhbWxlc3NseSBpbnRlZ3JhdGVkXyBpbnRvIFRhdW51cywgbWVhbmluZyB0aGF0IGFueSB2aWV3cyByZW5kZXJlZCBieSBUYXVudXMgd2lsbCBiZSBjYWNoZWQgYWNjb3JkaW5nIHRvIHRoZXNlIGNhY2hpbmcgcnVsZXMuIEtlZXAgaW4gbWluZCwgaG93ZXZlciwgdGhhdCBwZXJzaXN0ZW5jZSBhdCB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBsYXllciB3aWxsIG9ubHkgYmUgcG9zc2libGUgaW4gW2Jyb3dzZXJzIHRoYXQgc3VwcG9ydCBJbmRleGVkREJdWzE0XS4gSW4gdGhlIGNhc2Ugb2YgYnJvd3NlcnMgdGhhdCBkb24ndCBzdXBwb3J0IEluZGV4ZWREQiwgVGF1bnVzIHdpbGwgdXNlIGFuIGluLW1lbW9yeSBjYWNoZSwgd2hpY2ggd2lsbCBiZSB3aXBlZCBvdXQgd2hlbmV2ZXIgdGhlIGh1bWFuIGRlY2lkZXMgdG8gY2xvc2UgdGhlIHRhYiBpbiB0aGVpciBicm93c2VyLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFByZWZldGNoaW5nXFxuXFxuICAgIElmIGNhY2hpbmcgaXMgZW5hYmxlZCwgdGhlIG5leHQgbG9naWNhbCBzdGVwIGlzIHByZWZldGNoaW5nLiBUaGlzIGlzIGVuYWJsZWQganVzdCBieSBhZGRpbmcgYHByZWZldGNoOiB0cnVlYCB0byB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAuIFRoZSBwcmVmZXRjaGluZyBmZWF0dXJlIHdpbGwgZmlyZSBmb3IgYW55IGFuY2hvciBsaW5rIHRoYXQncyB0cmlwcyBvdmVyIGEgYG1vdXNlb3ZlcmAgb3IgYSBgdG91Y2hzdGFydGAgZXZlbnQuIElmIGEgcm91dGUgbWF0Y2hlcyB0aGUgVVJMIGluIHRoZSBgaHJlZmAsIGFuIEFKQVggcmVxdWVzdCB3aWxsIHByZWZldGNoIHRoZSB2aWV3IGFuZCBjYWNoZSBpdHMgY29udGVudHMsIGltcHJvdmluZyBwZXJjZWl2ZWQgcGVyZm9ybWFuY2UuXFxuXFxuICAgIFdoZW4gbGlua3MgYXJlIGNsaWNrZWQgYmVmb3JlIHByZWZldGNoaW5nIGZpbmlzaGVzLCB0aGV5J2xsIHdhaXQgb24gdGhlIHByZWZldGNoZXIgdG8gZmluaXNoIGJlZm9yZSBpbW1lZGlhdGVseSBzd2l0Y2hpbmcgdG8gdGhlIHZpZXcsIGVmZmVjdGl2ZWx5IGN1dHRpbmcgZG93biB0aGUgcmVzcG9uc2UgdGltZS4gSWYgdGhlIGxpbmsgd2FzIGFscmVhZHkgcHJlZmV0Y2hlZCBvciBvdGhlcndpc2UgY2FjaGVkLCB0aGUgdmlldyB3aWxsIGJlIGxvYWRlZCBpbW1lZGlhdGVseS4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGEgbGluayBhbmQgYW5vdGhlciBvbmUgd2FzIGFscmVhZHkgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGF0IG9uZSBpcyBhYm9ydGVkLiBUaGlzIHByZXZlbnRzIHByZWZldGNoaW5nIGZyb20gZHJhaW5pbmcgdGhlIGJhbmR3aWR0aCBvbiBjbGllbnRzIHdpdGggbGltaXRlZCBvciBpbnRlcm1pdHRlbnQgY29ubmVjdGl2aXR5LlxcblxcbiAgICAjIyMjIFZlcnNpb25pbmdcXG5cXG4gICAgV2hlbiBlbmFibGVkLCB2ZXJzaW9uaW5nIHdpbGwgbG9vayBvdXQgZm9yIGRpc2NyZXBhbmNpZXMgYmV0d2VlbiB3aGF0J3MgY3VycmVudGx5IG9uIHRoZSBjbGllbnQgYW5kIHdoYXQncyBvbiB0aGUgc2VydmVyLCBhbmQgcmVsb2FkIGV2ZXJ5dGhpbmcgbmVjZXNzYXJ5IHRvIG1ha2Ugd2hhdCdzIG9uIHRoZSBjbGllbnQgbWF0Y2ggd2hhdCdzIG9uIHRoZSBzZXJ2ZXIuXFxuXFxuICAgIEluIG9yZGVyIHRvIHR1cm4gaXQgb24sIHNldCB0aGUgYHZlcnNpb25gIGZpZWxkIGluIHRoZSBvcHRpb25zIHdoZW4gaW52b2tpbmcgYHRhdW51cy5tb3VudGAgKipvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLCB1c2luZyB0aGUgc2FtZSB2YWx1ZSoqLiBUaGUgVGF1bnVzIHZlcnNpb24gc3RyaW5nIHdpbGwgYmUgYWRkZWQgdG8gdGhlIG9uZSB5b3UgcHJvdmlkZWQsIHNvIHRoYXQgVGF1bnVzIHdpbGwga25vdyB0byBzdGF5IGFsZXJ0IGZvciBjaGFuZ2VzIHRvIFRhdW51cyBpdHNlbGYsIGFzIHdlbGwuXFxuXFxuICAgID4gVG8gbWFrZSBzdXJlIHlvdSBkb24ndCBmb3JnZXQgdG8gY2hhbmdlIHRoZSB2ZXJzaW9uIHN0cmluZyBpbiBvbmUgb2YgdGhlIG1vdW50cG9pbnRzLCBwbGVhc2UgY3JlYXRlIGEgSlNPTiBmaWxlIHdpdGgganVzdCB0aGUgdmVyc2lvbiBzdHJpbmcgYW5kIGByZXF1aXJlYCB0aGF0IGZpbGUgaW4gYm90aCBzaWRlcy5cXG4gICAgPlxcbiAgICA+IGBgYHNoZWxsXFxuICAgID4gZWNobyAnXFxcIjEuMC4wXFxcIicgPiB2ZXJzaW9uLmpzb25cXG4gICAgPiBgYGBcXG5cXG4gICAgVGhlIGRlZmF1bHQgdmVyc2lvbiBzdHJpbmcgaXMgc2V0IHRvIGAxYC4gVGhlIFRhdW51cyB2ZXJzaW9uIHdpbGwgYmUgcHJlcGVuZGVkIHRvIHlvdXJzLCByZXN1bHRpbmcgaW4gYSB2YWx1ZSBzdWNoIGFzIGB0My4wLjA7djFgIHdoZXJlIFRhdW51cyBpcyBydW5uaW5nIHZlcnNpb24gYDMuMC4wYCBhbmQgeW91ciBhcHBsaWNhdGlvbiBpcyBydW5uaW5nIHZlcnNpb24gYDFgLlxcblxcbiAgICBSZWZlciB0byB0aGUgR2V0dGluZyBTdGFydGVkIGd1aWRlIGZvciBhIG1vcmUgZGV0YWlsZWQgW2FuYWx5c2lzIG9mIHRoZSB1c2VzIGZvciB2ZXJzaW9uaW5nXVsxNV0uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub24odHlwZSwgZm4pYFxcblxcbiAgICBUYXVudXMgZW1pdHMgYSBzZXJpZXMgb2YgZXZlbnRzIGR1cmluZyBpdHMgbGlmZWN5Y2xlLCBhbmQgYHRhdW51cy5vbmAgaXMgdGhlIHdheSB5b3UgY2FuIHR1bmUgaW4gYW5kIGxpc3RlbiBmb3IgdGhlc2UgZXZlbnRzIHVzaW5nIGEgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIGBmbmAuXFxuXFxuICAgIEV2ZW50ICAgICAgICAgICAgfCBBcmd1bWVudHMgICAgICAgICAgICAgICB8IERlc2NyaXB0aW9uXFxuICAgIC0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGAnc3RhcnQnYCAgICAgICAgfCBgY29udGFpbmVyLCBtb2RlbCwgcm91dGVgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWwsIHJvdXRlYCAgICAgIHwgQSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWRcXG4gICAgYCdmZXRjaC5zdGFydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuXFxuICAgIGAnZmV0Y2guZG9uZSdgICAgfCAgYHJvdXRlLCBjb250ZXh0LCBkYXRhYCB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuXFxuICAgIGAnZmV0Y2guYWJvcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuXFxuICAgIGAnZmV0Y2guZXJyb3InYCAgfCAgYHJvdXRlLCBjb250ZXh0LCBlcnJgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLlxcblxcbiAgICBDb25zaWRlciBmb3IgaW5zdGFuY2UgdGhhdCB5b3UnZCBsaWtlIHRvIGtlZXAgdHJhY2sgb2YgZXZlcnkgdmlldyB0aGF0IGdldHMgcmVuZGVyZWQsIGFuZCB3aGF0IERPTSBlbGVtZW50IGl0IGdldHMgcGxhY2VkIGludG8uIFRoZSBwaWVjZSBvZiBjb2RlIGJlbG93IHdvdWxkIHF1aWNrbHkgZG8gdGhhdCBmb3IgdXMuXFxuXFxuICAgIGBgYGpzXFxuICAgIHRhdW51cy5vbigncmVuZGVyJywgZnVuY3Rpb24gKGNvbnRhaW5lcikge1xcbiAgICAgIGNvbnNvbGUubG9nKCdSZW5kZXJlZCBhIHZpZXcgb24nLCBjb250YWluZXIpO1xcbiAgICB9KTtcXG4gICAgYGBgXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub25jZSh0eXBlLCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGlzIGVxdWl2YWxlbnQgdG8gW2B0YXVudXMub25gXSgjLXRhdW51cy1vbi10eXBlLWZuLSksIGV4Y2VwdCB0aGUgZXZlbnQgbGlzdGVuZXJzIHdpbGwgYmUgdXNlZCBvbmNlIGFuZCB0aGVuIGl0J2xsIGJlIGRpc2NhcmRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5vZmYodHlwZSwgZm4pYFxcblxcbiAgICBVc2luZyB0aGlzIG1ldGhvZCB5b3UgY2FuIHJlbW92ZSBhbnkgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBwcmV2aW91c2x5IGFkZGVkIHVzaW5nIGAub25gIG9yIGAub25jZWAuIFlvdSBtdXN0IHByb3ZpZGUgdGhlIHR5cGUgb2YgZXZlbnQgeW91IHdhbnQgdG8gcmVtb3ZlIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgZXZlbnQgbGlzdGVuZXIgZnVuY3Rpb24gdGhhdCB3YXMgb3JpZ2luYWxseSB1c2VkIHdoZW4gY2FsbGluZyBgLm9uYCBvciBgLm9uY2VgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLmludGVyY2VwdChhY3Rpb24/LCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGNhbiBiZSB1c2VkIHRvIGFudGljaXBhdGUgbW9kZWwgcmVxdWVzdHMsIGJlZm9yZSB0aGV5IGV2ZXIgbWFrZSBpdCBpbnRvIFhIUiByZXF1ZXN0cy4gWW91IGNhbiBhZGQgaW50ZXJjZXB0b3JzIGZvciBzcGVjaWZpYyBhY3Rpb25zLCB3aGljaCB3b3VsZCBiZSB0cmlnZ2VyZWQgb25seSBpZiB0aGUgcmVxdWVzdCBtYXRjaGVzIHRoZSBzcGVjaWZpZWQgYGFjdGlvbmAuIFlvdSBjYW4gYWxzbyBhZGQgZ2xvYmFsIGludGVyY2VwdG9ycyBieSBvbWl0dGluZyB0aGUgYGFjdGlvbmAgcGFyYW1ldGVyLCBvciBzZXR0aW5nIGl0IHRvIGAqYC5cXG5cXG4gICAgQW4gaW50ZXJjZXB0b3IgZnVuY3Rpb24gd2lsbCByZWNlaXZlIGFuIGBldmVudGAgcGFyYW1ldGVyLCBjb250YWluaW5nIGEgZmV3IGRpZmZlcmVudCBwcm9wZXJ0aWVzLlxcblxcbiAgICAtIGB1cmxgIGNvbnRhaW5zIHRoZSBVUkwgdGhhdCBuZWVkcyBhIHZpZXcgbW9kZWxcXG4gICAgLSBgcm91dGVgIGNvbnRhaW5zIHRoZSBmdWxsIHJvdXRlIG9iamVjdCBhcyB5b3UnZCBnZXQgZnJvbSBbYHRhdW51cy5yb3V0ZSh1cmwpYF0oIy10YXVudXMtcm91dGUtdXJsLSlcXG4gICAgLSBgcGFydHNgIGlzIGp1c3QgYSBzaG9ydGN1dCBmb3IgYHJvdXRlLnBhcnRzYFxcbiAgICAtIGBwcmV2ZW50RGVmYXVsdChtb2RlbClgIGFsbG93cyB5b3UgdG8gc3VwcHJlc3MgdGhlIG5lZWQgZm9yIGFuIEFKQVggcmVxdWVzdCwgY29tbWFuZGluZyBUYXVudXMgdG8gdXNlIHRoZSBtb2RlbCB5b3UndmUgcHJvdmlkZWQgaW5zdGVhZFxcbiAgICAtIGBkZWZhdWx0UHJldmVudGVkYCB0ZWxscyB5b3UgaWYgc29tZSBvdGhlciBoYW5kbGVyIGhhcyBwcmV2ZW50ZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3JcXG4gICAgLSBgY2FuUHJldmVudERlZmF1bHRgIHRlbGxzIHlvdSBpZiBpbnZva2luZyBgZXZlbnQucHJldmVudERlZmF1bHRgIHdpbGwgaGF2ZSBhbnkgZWZmZWN0XFxuICAgIC0gYG1vZGVsYCBzdGFydHMgYXMgYG51bGxgLCBhbmQgaXQgY2FuIGxhdGVyIGJlY29tZSB0aGUgbW9kZWwgcGFzc2VkIHRvIGBwcmV2ZW50RGVmYXVsdGBcXG5cXG4gICAgSW50ZXJjZXB0b3JzIGFyZSBhc3luY2hyb25vdXMsIGJ1dCBpZiBhbiBpbnRlcmNlcHRvciBzcGVuZHMgbG9uZ2VyIHRoYW4gMjAwbXMgaXQnbGwgYmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBjYWxsaW5nIGBldmVudC5wcmV2ZW50RGVmYXVsdGAgcGFzdCB0aGF0IHBvaW50IHdvbid0IGhhdmUgYW55IGVmZmVjdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5wYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbClgXFxuXFxuICAgIFRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSBgYWN0aW9uYCB2aWV3IGludG8gdGhlIGBjb250YWluZXJgIERPTSBlbGVtZW50LCB1c2luZyB0aGUgc3BlY2lmaWVkIGBtb2RlbGAuIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSBgcmVuZGVyYCBldmVudCB3aWxsIGJlIGZpcmVkIF8od2l0aCBgY29udGFpbmVyLCBtb2RlbGAgYXMgYXJndW1lbnRzKV8gYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGF0IHZpZXcgd2lsbCBiZSBleGVjdXRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYFxcblxcbiAgICBXaGVuZXZlciB5b3Ugd2FudCB0byBuYXZpZ2F0ZSB0byBhIFVSTCwgc2F5IHdoZW4gYW4gQUpBWCBjYWxsIGZpbmlzaGVzIGFmdGVyIGEgYnV0dG9uIGNsaWNrLCB5b3UgY2FuIHVzZSBgdGF1bnVzLm5hdmlnYXRlYCBwYXNzaW5nIGl0IGEgcGxhaW4gVVJMIG9yIGFueXRoaW5nIHRoYXQgd291bGQgY2F1c2UgYHRhdW51cy5yb3V0ZSh1cmwpYCB0byByZXR1cm4gYSB2YWxpZCByb3V0ZS5cXG5cXG4gICAgQnkgZGVmYXVsdCwgaWYgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYCBpcyBjYWxsZWQgd2l0aCBhbiBgdXJsYCB0aGF0IGRvZXNuJ3QgbWF0Y2ggYW55IGNsaWVudC1zaWRlIHJvdXRlLCB0aGVuIHRoZSB1c2VyIHdpbGwgYmUgcmVkaXJlY3RlZCB2aWEgYGxvY2F0aW9uLmhyZWZgLiBJbiBjYXNlcyB3aGVyZSB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBvcnQgdGhlIGhpc3RvcnkgQVBJLCBgbG9jYXRpb24uaHJlZmAgd2lsbCBiZSB1c2VkIGFzIHdlbGwuXFxuXFxuICAgIFRoZXJlJ3MgYSBmZXcgb3B0aW9ucyB5b3UgY2FuIHVzZSB0byB0d2VhayB0aGUgYmVoYXZpb3Igb2YgYHRhdW51cy5uYXZpZ2F0ZWAuXFxuXFxuICAgIE9wdGlvbiAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBjb250ZXh0YCAgICAgICAgfCBBIERPTSBlbGVtZW50IHRoYXQgY2F1c2VkIHRoZSBuYXZpZ2F0aW9uIGV2ZW50LCB1c2VkIHdoZW4gZW1pdHRpbmcgZXZlbnRzXFxuICAgIGBzdHJpY3RgICAgICAgICAgfCBJZiBzZXQgdG8gYHRydWVgIGFuZCB0aGUgVVJMIGRvZXNuJ3QgbWF0Y2ggYW55IHJvdXRlLCB0aGVuIHRoZSBuYXZpZ2F0aW9uIGF0dGVtcHQgbXVzdCBiZSBpZ25vcmVkXFxuICAgIGBzY3JvbGxgICAgICAgICAgfCBXaGVuIHRoaXMgaXMgc2V0IHRvIGBmYWxzZWAsIGVsZW1lbnRzIGFyZW4ndCBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXIgbmF2aWdhdGlvblxcbiAgICBgZm9yY2VgICAgICAgICAgIHwgVW5sZXNzIHRoaXMgaXMgc2V0IHRvIGB0cnVlYCwgbmF2aWdhdGlvbiB3b24ndCBfZmV0Y2ggYSBtb2RlbF8gaWYgdGhlIHJvdXRlIG1hdGNoZXMgdGhlIGN1cnJlbnQgcm91dGUsIGFuZCBgc3RhdGUubW9kZWxgIHdpbGwgYmUgcmV1c2VkIGluc3RlYWRcXG4gICAgYHJlcGxhY2VTdGF0ZWAgICB8IFVzZSBgcmVwbGFjZVN0YXRlYCBpbnN0ZWFkIG9mIGBwdXNoU3RhdGVgIHdoZW4gY2hhbmdpbmcgaGlzdG9yeVxcblxcbiAgICBOb3RlIHRoYXQgdGhlIG5vdGlvbiBvZiBfZmV0Y2hpbmcgYSBtb2RlbF8gbWlnaHQgYmUgZGVjZWl2aW5nIGFzIHRoZSBtb2RlbCBjb3VsZCBiZSBwdWxsZWQgZnJvbSB0aGUgY2FjaGUgZXZlbiBpZiBgZm9yY2VgIGlzIHNldCB0byBgdHJ1ZWAuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucm91dGUodXJsKWBcXG5cXG4gICAgVGhpcyBjb252ZW5pZW5jZSBtZXRob2QgYWxsb3dzIHlvdSB0byBicmVhayBkb3duIGEgVVJMIGludG8gaXRzIGluZGl2aWR1YWwgY29tcG9uZW50cy4gVGhlIG1ldGhvZCBhY2NlcHRzIGFueSBvZiB0aGUgZm9sbG93aW5nIHBhdHRlcm5zLCBhbmQgaXQgcmV0dXJucyBhIFRhdW51cyByb3V0ZSBvYmplY3QuXFxuXFxuICAgIC0gQSBmdWxseSBxdWFsaWZpZWQgVVJMIG9uIHRoZSBzYW1lIG9yaWdpbiwgZS5nIGBodHRwOi8vdGF1bnVzLmJldmFjcXVhLmlvL2FwaWBcXG4gICAgLSBBbiBhYnNvbHV0ZSBVUkwgd2l0aG91dCBhbiBvcmlnaW4sIGUuZyBgL2FwaWBcXG4gICAgLSBKdXN0IGEgaGFzaCwgZS5nIGAjZm9vYCBfKGBsb2NhdGlvbi5ocmVmYCBpcyB1c2VkKV9cXG4gICAgLSBGYWxzeSB2YWx1ZXMsIGUuZyBgbnVsbGAgXyhgbG9jYXRpb24uaHJlZmAgaXMgdXNlZClfXFxuXFxuICAgIFJlbGF0aXZlIFVSTHMgYXJlIG5vdCBzdXBwb3J0ZWQgXyhhbnl0aGluZyB0aGF0IGRvZXNuJ3QgaGF2ZSBhIGxlYWRpbmcgc2xhc2gpXywgZS5nIGBmaWxlcy9kYXRhLmpzb25gLiBBbnl0aGluZyB0aGF0J3Mgbm90IG9uIHRoZSBzYW1lIG9yaWdpbiBvciBkb2Vzbid0IG1hdGNoIG9uZSBvZiB0aGUgcmVnaXN0ZXJlZCByb3V0ZXMgaXMgZ29pbmcgdG8geWllbGQgYG51bGxgLlxcblxcbiAgICBfVGhpcyBtZXRob2QgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLCBhcyBpdCBnaXZlcyB5b3UgZGlyZWN0IGFjY2VzcyB0byB0aGUgcm91dGVyIHVzZWQgaW50ZXJuYWxseSBieSBUYXVudXMuX1xcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIGB0YXVudXMucm91dGUuZXF1YWxzKHJvdXRlLCByb3V0ZSlgXFxuXFxuICAgIENvbXBhcmVzIHR3byByb3V0ZXMgYW5kIHJldHVybnMgYHRydWVgIGlmIHRoZXkgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwuIE5vdGUgdGhhdCBkaWZmZXJlbnQgVVJMcyBtYXkgc3RpbGwgcmV0dXJuIGB0cnVlYC4gRm9yIGluc3RhbmNlLCBgL2Zvb2AgYW5kIGAvZm9vI2JhcmAgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwgZXZlbiBpZiB0aGV5J3JlIGRpZmZlcmVudCBVUkxzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnN0YXRlYFxcblxcbiAgICBUaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi5cXG5cXG4gICAgLSBgY29udGFpbmVyYCBpcyB0aGUgRE9NIGVsZW1lbnQgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgXFxuICAgIC0gYGNvbnRyb2xsZXJzYCBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGB0ZW1wbGF0ZXNgIGFyZSBhbGwgdGhlIHRlbXBsYXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZXNgIGFyZSBhbGwgdGhlIHJvdXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZWAgaXMgYSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgcm91dGVcXG4gICAgLSBgbW9kZWxgIGlzIGEgcmVmZXJlbmNlIHRvIHRoZSBtb2RlbCB1c2VkIHRvIHJlbmRlciB0aGUgY3VycmVudCB2aWV3XFxuICAgIC0gYHByZWZldGNoYCBleHBvc2VzIHdoZXRoZXIgcHJlZmV0Y2hpbmcgaXMgdHVybmVkIG9uXFxuICAgIC0gYGNhY2hlYCBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkXFxuICAgIC0gYHZlcnNpb25gIGV4cG9zZXMgdGhlIHZlcnNpb24gc3RyaW5nIHRoYXQncyBjdXJyZW50bHkgaW4gdXNlXFxuXFxuICAgIE9mIGNvdXJzZSwgeW91ciBub3Qgc3VwcG9zZWQgdG8gbWVkZGxlIHdpdGggaXQsIHNvIGJlIGEgZ29vZCBjaXRpemVuIGFuZCBqdXN0IGluc3BlY3QgaXRzIHZhbHVlcyFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy54aHIodXJsLCBvcHRpb25zPywgZG9uZSlgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGFsbG93cyB5b3UgdG8gaXNzdWUgeW91ciBvd24gQUpBWCByZXF1ZXN0cyB0aHJvdWdoIHRoZSBgeGhyYCBtb2R1bGUuIEl0IHNldHMgYSBmZXcgY29udmVuaWVudCBkZWZhdWx0cywgX2xpc3RlZCBiZWxvd18sIHdoZXJlIGB1cmxgIHJlZmVycyB0byB0aGUgVVJMIHBhc3NlZCBhcyB0aGUgZmlyc3QgcGFyYW1ldGVyLlxcblxcbiAgICBgYGBqc1xcbiAgICB7XFxuICAgICAgdXJsOiB1cmwsXFxuICAgICAganNvbjogdHJ1ZSxcXG4gICAgICBoZWFkZXJzOiB7IEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nIH1cXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgVGhlIGBkb25lKGVyciwgYm9keSwgcmVzKWAgY2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gdGhlIHJlcXVlc3QgZmluaXNoZXMsIGFuZCBpdCdsbCBiZSBwYXNzZWQgdGhyZWUgcGFyYW1ldGVycywgYW4gb3B0aW9uYWwgZXJyb3IgaWYgc29tZXRoaW5nIHdlbnQgd3JvbmcgXyhyZXF1ZXN0IGZhaWxlZCwgd2FzIGFib3J0ZWQsIGV0Yy4pXyBhbmQgYSBgYm9keWAgcGFyYW1ldGVyIGNvbnRhaW5pbmcgdGhlIHJlc3BvbnNlIGJvZHkuIFRoZSByYXcgYHJlc2Agb2JqZWN0IHRoYXQncyB0eXBpY2FsbHkgcHJvdmlkZWQgYnkgW2B4aHJgXVsxNl0gYXMgdGhlIHNlY29uZCBwYXJhbWV0ZXIgaXMgcHJvdmlkZWQgYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBpbnN0ZWFkLlxcblxcbiAgICBBcyBhbiBleGFtcGxlLCBoZXJlIGlzIGEgYEdFVGAgcmVxdWVzdC5cXG5cXG4gICAgYGBganNcXG4gICAgdGF1bnVzLnhocignL2FwaS9wbGFjZXMnLCBmdW5jdGlvbiAoZXJyLCBib2R5KSB7XFxuICAgICAgY29uc29sZS5sb2coYm9keSk7XFxuICAgICAgLy8gPC0geyBwbGFjZXM6IFsndW5kZXJ3YXRlciBmb3J0cmVzcycsICdpc2xhbmQgbWFuc2lvbiddIH1cXG4gICAgfSk7XFxuICAgIGBgYFxcblxcbiAgICBBbHdheXMgcmVtZW1iZXIgdG8gaGFuZGxlIHRoZSBjYXNlIHdoZXJlIGBlcnJgIGlzIHNldCFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBDbGllbnQtU2lkZSBDb250cm9sbGVyc1xcblxcbiAgICBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhlY3V0ZWQgcmlnaHQgYWZ0ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLCBldmVuIGluIHRoZSBjYXNlIG9mIFtwYXJ0aWFsIHZpZXdzXSgjLXRhdW51cy1wYXJ0aWFsLWNvbnRhaW5lci1hY3Rpb24tbW9kZWwtKS4gVGhlc2UgY29udHJvbGxlcnMgYXJlIHVzZWQgdG8gcHJvZ3Jlc3NpdmVseSBhZGQgYmVoYXZpb3Igb24gdG9wIG9mIHRoZSBIVE1MIGZvciB0aGF0IHZpZXcuXFxuXFxuICAgIFZpZXcgY29udHJvbGxlcnMgdGFrZSB0aHJlZSBwYXJhbWV0ZXJzLlxcblxcbiAgICBQYXJhbWV0ZXIgICB8IERlc2NyaXB0aW9uXFxuICAgIC0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgbW9kZWxgICAgICB8IE1vZGVsIHRoYXQgd2FzIHVzZWQgdG8gcmVuZGVyIHRoZSB2aWV3XFxuICAgIGBjb250YWluZXJgIHwgVGhlIERPTSBlbGVtZW50IHdoZXJlIHRoZSB2aWV3IHdhcyByZW5kZXJlZFxcbiAgICBgcm91dGU/YCAgICB8IFJvdXRlIHRoYXQgdHJpZ2dlcmVkIHRoZSByZW5kZXJpbmcgZW5naW5lLiBNYXkgYmUgYG51bGxgXFxuXFxuICAgIE5vdGUgdGhhdCBUYXVudXMgd2lsbCBbZW1pdCBhIGByZW5kZXJgIGV2ZW50XSgjLXRhdW51cy1vbi10eXBlLWZuLSkgcmlnaHQgYmVmb3JlIHRoZSB2aWV3IGNvbnRyb2xsZXIgZ2V0cyBleGVjdXRlZCwgZ2l2aW5nIHlvdSBhIGNoYW5jZSB0byByZWFjdCB0byB2aWV3cyBnZXR0aW5nIHJlbmRlcmVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRoZSBgLnRhdW51c3JjYCBtYW5pZmVzdFxcblxcbiAgICBJZiB5b3Ugd2FudCB0byB1c2UgdmFsdWVzIG90aGVyIHRoYW4gdGhlIGNvbnZlbnRpb25hbCBkZWZhdWx0cyBzaG93biBpbiB0aGUgdGFibGUgYmVsb3csIHRoZW4geW91IHNob3VsZCBjcmVhdGUgYSBgLnRhdW51c3JjYCBmaWxlLiBOb3RlIHRoYXQgdGhlIGRlZmF1bHRzIG5lZWQgdG8gYmUgb3ZlcndyaXR0ZW4gaW4gYSBjYXNlLWJ5LWNhc2UgYmFzaXMuIFRoZXNlIG9wdGlvbnMgY2FuIGFsc28gYmUgY29uZmlndXJlZCBpbiB5b3VyIGBwYWNrYWdlLmpzb25gLCB1bmRlciB0aGUgYHRhdW51c2AgcHJvcGVydHkuXFxuXFxuICAgIGBgYGpzb25cXG4gICAge1xcbiAgICAgIFxcXCJ2aWV3c1xcXCI6IFxcXCIuYmluL3ZpZXdzXFxcIixcXG4gICAgICBcXFwic2VydmVyX3JvdXRlc1xcXCI6IFxcXCJjb250cm9sbGVycy9yb3V0ZXMuanNcXFwiLFxcbiAgICAgIFxcXCJzZXJ2ZXJfY29udHJvbGxlcnNcXFwiOiBcXFwiY29udHJvbGxlcnNcXFwiLFxcbiAgICAgIFxcXCJjbGllbnRfY29udHJvbGxlcnNcXFwiOiBcXFwiY2xpZW50L2pzL2NvbnRyb2xsZXJzXFxcIixcXG4gICAgICBcXFwiY2xpZW50X3dpcmluZ1xcXCI6IFxcXCIuYmluL3dpcmluZy5qc1xcXCJcXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgLSBUaGUgYHZpZXdzYCBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciB2aWV3cyBfKGFscmVhZHkgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0KV8gYXJlIHBsYWNlZC4gVGhlc2Ugdmlld3MgYXJlIHVzZWQgZGlyZWN0bHkgb24gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZVxcbiAgICAtIFRoZSBgc2VydmVyX3JvdXRlc2AgZmlsZSBpcyB0aGUgbW9kdWxlIHdoZXJlIHlvdSBleHBvcnQgYSBjb2xsZWN0aW9uIG9mIHJvdXRlcy4gVGhlIENMSSB3aWxsIHB1bGwgdGhlc2Ugcm91dGVzIHdoZW4gY3JlYXRpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRlcyBmb3IgdGhlIHdpcmluZyBtb2R1bGVcXG4gICAgLSBUaGUgYHNlcnZlcl9jb250cm9sbGVyc2AgZGlyZWN0b3J5IGlzIHRoZSByb290IGRpcmVjdG9yeSB3aGVyZSB5b3VyIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGxpdmUuIEl0J3MgdXNlZCB3aGVuIHNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlIHJvdXRlclxcbiAgICAtIFRoZSBgY2xpZW50X2NvbnRyb2xsZXJzYCBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciBjbGllbnQtc2lkZSBjb250cm9sbGVyIG1vZHVsZXMgbGl2ZS4gVGhlIENMSSB3aWxsIGByZXF1aXJlYCB0aGVzZSBjb250cm9sbGVycyBpbiBpdHMgcmVzdWx0aW5nIHdpcmluZyBtb2R1bGVcXG4gICAgLSBUaGUgYGNsaWVudF93aXJpbmdgIGZpbGUgaXMgd2hlcmUgeW91ciB3aXJpbmcgbW9kdWxlIHdpbGwgYmUgcGxhY2VkIGJ5IHRoZSBDTEkuIFlvdSdsbCB0aGVuIGhhdmUgdG8gYHJlcXVpcmVgIGl0IGluIHlvdXIgYXBwbGljYXRpb24gd2hlbiBib290aW5nIHVwIFRhdW51c1xcblxcbiAgICBIZXJlIGlzIHdoZXJlIHRoaW5ncyBnZXQgW2EgbGl0dGxlIGNvbnZlbnRpb25hbF1bMTJdLiBWaWV3cywgYW5kIGJvdGggc2VydmVyLXNpZGUgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleHBlY3RlZCB0byBiZSBvcmdhbml6ZWQgYnkgZm9sbG93aW5nIHRoZSBge3Jvb3R9L3tjb250cm9sbGVyfS97YWN0aW9ufWAgcGF0dGVybiwgYnV0IHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCB1c2luZyBgcmVzb2x2ZXJzYCB3aGVuIGludm9raW5nIHRoZSBDTEkgYW5kIHVzaW5nIHRoZSBzZXJ2ZXItc2lkZSBBUEkuXFxuXFxuICAgIFZpZXdzIGFuZCBjb250cm9sbGVycyBhcmUgYWxzbyBleHBlY3RlZCB0byBiZSBDb21tb25KUyBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIG1ldGhvZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgWzFdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFsyXTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzNdOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi8zMzI3MTc1MTMxMmRiNmU5MjA1OWQ5ODI5M2QwYTdhYzZlOWU4ZTViL3ZpZXdzL3NlcnZlci9sYXlvdXQvbGF5b3V0LmphZGVcXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvaGdldFxcbiAgICBbNl06IGh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi9mNmQ2YjUwNjhmZjAzYTM4N2Y1MDM5MDAxNjBkOWZkYzFlNzQ5NzUwL2NvbnRyb2xsZXJzL3JvdXRpbmcuanMjTDcwLUw3MlxcbiAgICBbN106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzhdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFs5XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFsxMF06IGh0dHBzOi8vZ2l0aHViLmNvbS91bWRqcy91bWRcXG4gICAgWzExXTogaHR0cDovL2Jyb3dzZXJpZnkub3JnXFxuICAgIFsxMl06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG4gICAgWzEzXTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9TaW5nbGUtcGFnZV9hcHBsaWNhdGlvblxcbiAgICBbMTRdOiBodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxuICAgIFsxNV06IC9nZXR0aW5nLXN0YXJ0ZWQjdmVyc2lvbmluZ1xcbiAgICBbMTZdOiBodHRwczovL2dpdGh1Yi5jb20vUmF5bm9zL3hoclxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb21wbGVtZW50cyhsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJjb21wbGVtZW50YXJ5LW1vZHVsZXNcXFwiPkNvbXBsZW1lbnRhcnkgTW9kdWxlczwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc21hbGwgbGlicmFyeSBieSBNVkMgZnJhbWV3b3JrIHN0YW5kYXJkcywgc2l0dGluZyA8c3Ryb25nPmJlbG93IDE1a0IgbWluaWZpZWQgYW5kIGd6aXBwZWQ8L3N0cm9uZz4uIEl0IGlzIGRlc2lnbmVkIHRvIGJlIHNtYWxsLiBJdCBpcyBhbHNvIGRlc2lnbmVkIHRvIGRvIG9uZSB0aGluZyB3ZWxsLCBhbmQgdGhhdCYjMzk7cyA8ZW0+YmVpbmcgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmU8L2VtPi48L3A+XFxuPHA+VGF1bnVzIGNhbiBiZSB1c2VkIGZvciByb3V0aW5nLCBwdXR0aW5nIHRvZ2V0aGVyIGNvbnRyb2xsZXJzLCBtb2RlbHMgYW5kIHZpZXdzIHRvIGhhbmRsZSBodW1hbiBpbnRlcmFjdGlvbi4gSWYgeW91IDxhIGhyZWY9XFxcIi9hcGlcXFwiPmhlYWQgb3ZlciB0byB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+LCB5b3UmIzM5O2xsIG5vdGljZSB0aGF0IHRoZSBzZXJ2ZXItc2lkZSBBUEksIHRoZSBjb21tYW5kLWxpbmUgaW50ZXJmYWNlLCBhbmQgdGhlIDxjb2RlPi50YXVudXNyYzwvY29kZT4gbWFuaWZlc3QgYXJlIG9ubHkgY29uY2VybmVkIHdpdGggcHJvdmlkaW5nIGEgY29udmVudGlvbmFsIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZS48L3A+XFxuPHA+SW4gdGhlIHNlcnZlci1zaWRlIHlvdSBtaWdodCBuZWVkIHRvIGRvIG90aGVyIHRoaW5ncyBiZXNpZGVzIHJvdXRpbmcgYW5kIHJlbmRlcmluZyB2aWV3cywgYW5kIG90aGVyIG1vZHVsZXMgY2FuIHRha2UgY2FyZSBvZiB0aGF0LiBIb3dldmVyLCB5b3UmIzM5O3JlIHVzZWQgdG8gaGF2aW5nIGRhdGFiYXNlIGFjY2Vzcywgc2VhcmNoLCBsb2dnaW5nLCBhbmQgYSB2YXJpZXR5IG9mIHNlcnZpY2VzIGhhbmRsZWQgYnkgc2VwYXJhdGUgbGlicmFyaWVzLCBpbnN0ZWFkIG9mIGEgc2luZ2xlIGJlaGVtb3RoIHRoYXQgdHJpZXMgdG8gZG8gZXZlcnl0aGluZy48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+SW4gdGhlIGNsaWVudC1zaWRlLCB5b3UgbWlnaHQgYmUgdXNlZCB0byB5b3VyIE1WQyBmcmFtZXdvcmsgb2YgY2hvaWNlIHJlc29sdmluZyBldmVyeXRoaW5nIG9uIHlvdXIgYmVoYWxmLCBmcm9tIERPTSBtYW5pcHVsYXRpb24gYW5kIGRhdGEtYmluZGluZyB0byBob29raW5nIHVwIHdpdGggYSBSRVNUIEFQSSwgYW5kIGV2ZXJ5d2hlcmUgaW4gYmV0d2Vlbi48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPlRhdW51cyBhdHRlbXB0cyB0byBicmluZyB0aGUgc2VydmVyLXNpZGUgbWVudGFsaXR5IG9mIDxlbT4mcXVvdDtub3QgZG9pbmcgZXZlcnl0aGluZyBpcyBva2F5JnF1b3Q7PC9lbT4gaW50byB0aGUgd29ybGQgb2YgY2xpZW50LXNpZGUgd2ViIGFwcGxpY2F0aW9uIGRldmVsb3BtZW50IGFzIHdlbGwuIFRvIHRoYXQgZW5kLCBUYXVudXMgcmVjb21tZW5kcyB0aGF0IHlvdSBnaXZlIGEgc2hvdCB0byBsaWJyYXJpZXMgdGhhdCBhbHNvIGRvIDxzdHJvbmc+b25lIHRoaW5nIHdlbGw8L3N0cm9uZz4uPC9wPlxcbjxwPkluIHRoaXMgYnJpZWYgYXJ0aWNsZSB3ZSYjMzk7bGwgcmVjb21tZW5kIGEgY291cGxlIGRpZmZlcmVudCBsaWJyYXJpZXMgdGhhdCBwbGF5IHdlbGwgd2l0aCBUYXVudXMsIGFuZCB5b3UmIzM5O2xsIGFsc28gbGVhcm4gaG93IHRvIHNlYXJjaCBmb3IgbW9kdWxlcyB0aGF0IGNhbiBnaXZlIHlvdSBhY2Nlc3MgdG8gb3RoZXIgZnVuY3Rpb25hbGl0eSB5b3UgbWF5IGJlIGludGVyZXN0ZWQgaW4uPC9wPlxcbjxoMSBpZD1cXFwidXNpbmctZG9taW51cy1mb3ItZG9tLXF1ZXJ5aW5nXFxcIj5Vc2luZyA8Y29kZT5kb21pbnVzPC9jb2RlPiBmb3IgRE9NIHF1ZXJ5aW5nPC9oMT5cXG48cD48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvZG9taW51c1xcXCI+RG9taW51czwvYT4gaXMgYW4gZXh0cmEtc21hbGwgRE9NIHF1ZXJ5aW5nIGxpYnJhcnksIGN1cnJlbnRseSBjbG9ja2luZyBhcm91bmQgPHN0cm9uZz40a0IgbWluaWZpZWQgYW5kIGd6aXBwZWQ8L3N0cm9uZz4sIGFsbW9zdCA8ZW0+dGVuIHRpbWVzIHNtYWxsZXI8L2VtPiB0aGFuIGl0JiMzOTtzIGNvbXBldGl0aW9uLiBVbmxpa2UgalF1ZXJ5IGFuZCBwb3B1bGFyIGZyaWVuZHMsIERvbWludXMgZG9lc24mIzM5O3QgcHJvdmlkZSBBSkFYIGZlYXR1cmVzLCBsYXlvdXQgbWF0aCwgPGNvZGU+Jmx0O2Zvcm0mZ3Q7PC9jb2RlPiBtYW5pcHVsYXRpb24sIHByb21pc2VzLCB0ZW5zIG9mIGV2ZW50IGJpbmRpbmcgbWV0aG9kcywgYSBzZWxlY3RvciBlbmdpbmUgd3JpdHRlbiBpbiBwbGFpbiBKYXZhU2NyaXB0LCBub3IgYSBteXJpYWQgb2YgdXRpbGl0eSBmdW5jdGlvbnMuIEluc3RlYWQsIERvbWludXMgZm9jdXNlcyBzb2xlbHkgb24gcHJvdmlkaW5nIGEgcmljaCBET00gcXVlcnlpbmcgYW5kIG1hbmlwdWxhdGlvbiBBUEkgdGhhdCBnZXRzIHJpZCBvZiBpbmNvbnNpc3RlbmNpZXMgYWNyb3NzIGJyb3dzZXJzLjwvcD5cXG48cD5XaGlsZSB0aGUgQVBJIGlzbiYjMzk7dCBleGFjdGx5IGNvbXBhdGlibGUgd2l0aCBqUXVlcnksIGl0IGlzIGRlZmluaXRlbHkgZmFtaWxpYXIgdG8gdGhlIGpRdWVyeSBhZGVwdC4gQ2hhaW5pbmcsIHZlcnNhdGlsaXR5LCBleHByZXNzaXZlbmVzcywgYW5kIHJhdyBwb3dlciBhcmUgYWxsIGNvcmUgY29uY2VybnMgZm9yIERvbWludXMuIFlvdSYjMzk7bGwgZmluZCB0aGF0IERvbWludXMgaGFzIG1vcmUgY29uc2lzdGVudGx5IG5hbWVkIG1ldGhvZHMsIGdpdmVuIHRoYXQgaXQgd2FzIGJ1aWx0IHdpdGggYSBjb25jaXNlIEFQSSBpbiBtaW5kLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBkaWZmZXJlbmNlcyBpbiBzZW1hbnRpY3MsIGFuZCBJIGJlbGlldmUgdGhhdCYjMzk7cyBhIGdvb2QgdGhpbmcuIEZvciBpbnN0YW5jZSwgaWYgeW91IGRvIDxjb2RlPi52YWx1ZTwvY29kZT4gb24gYSBjaGVja2JveCBvciByYWRpbyBidXR0b24geW91JiMzOTtsbCBnZXQgYmFjayB3aGV0aGVyIHRoZSBpbnB1dCBpcyBjaGVja2VkLiBTaW1pbGFybHksIGlmIHlvdSBjYWxsIDxjb2RlPi50ZXh0PC9jb2RlPiBvbiB0aGUgaW5wdXQgeW91JiMzOTtsbCBnZXQgdGhlIHRleHQgYmFjaywgd2hpY2ggaXMgbW9zdCBvZnRlbiB3aGF0IHlvdSB3YW50ZWQgdG8gZ2V0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj52YXIgYSA9IHJlcXVpcmUoJiMzOTtkb21pbnVzJiMzOTspO1xcbnZhciBiID0galF1ZXJ5O1xcblxcbmEoJiMzOTsmbHQ7aW5wdXQmZ3Q7JiMzOTspLmF0dHIoeyB0eXBlOiAmIzM5O3JhZGlvJiMzOTssIHZhbHVlOiAmIzM5O0ZvbyYjMzk7IH0pLnRleHQoKTtcXG4vLyAmbHQ7LSAmIzM5O0ZvbyYjMzk7XFxuXFxuYSgmIzM5OyZsdDtpbnB1dCZndDsmIzM5OykuYXR0cih7IHR5cGU6ICYjMzk7cmFkaW8mIzM5OywgY2hlY2tlZDogdHJ1ZSB9KS52YWx1ZSgpO1xcbi8vICZsdDstIHRydWVcXG5cXG5iKCYjMzk7Jmx0O2lucHV0Jmd0OyYjMzk7KS5hdHRyKHsgdHlwZTogJiMzOTtyYWRpbyYjMzk7LCB2YWx1ZTogJiMzOTtGb28mIzM5OyB9KS50ZXh0KCk7XFxuLy8gJmx0Oy0gJiMzOTsmIzM5O1xcblxcbmIoJiMzOTsmbHQ7aW5wdXQmZ3Q7JiMzOTspLmF0dHIoeyB0eXBlOiAmIzM5O3JhZGlvJiMzOTssIGNoZWNrZWQ6IHRydWUgfSkudmFsKCk7XFxuLy8gJmx0Oy0gJiMzOTtGb28mIzM5O1xcbjwvY29kZT48L3ByZT5cXG48cD5PbmUgb2YgdGhlIGJlc3QgYXNwZWN0cyBvZiBEb21pbnVzLCA8ZW0+YmVzaWRlcyBpdHMgc21hbGwgc2l6ZTwvZW0+LCBpcyB0aGUgZmFjdCB0aGF0IGl0IGV4dGVuZHMgbmF0aXZlIEphdmFTY3JpcHQgYXJyYXlzIDxlbT4odXNpbmcgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL3Bvc2VyXFxcIj48Y29kZT5wb3NlcjwvY29kZT48L2E+KTwvZW0+LiBUaGF0IG1lYW5zIHlvdSBoYXZlIGFjY2VzcyB0byBhbGwgb2YgdGhlIDxjb2RlPkFycmF5PC9jb2RlPiBmdW5jdGlvbmFsIG1ldGhvZHMgb24gYW55IDxjb2RlPkRvbWludXM8L2NvZGU+IGNvbGxlY3Rpb25zLCBzdWNoIGFzIDxjb2RlPi5mb3JFYWNoPC9jb2RlPiwgPGNvZGU+Lm1hcDwvY29kZT4sIDxjb2RlPi5maWx0ZXI8L2NvZGU+LCA8Y29kZT4uc29ydDwvY29kZT4gYW5kIHNvIG9uLjwvcD5cXG48cD5UYXVudXMgZG9lc24mIzM5O3QgbWFrZSBhbnkgZXh0ZW5zaXZlIERPTSBtYW5pcHVsYXRpb24gPGVtPihub3IgcXVlcnlpbmcpPC9lbT4gYW5kIGRvZXNuJiMzOTt0IG5lZWQgdG8gdXNlIERvbWludXMsIGJ1dCBpdCBtYXkgZmluZCBhIGhvbWUgaW4geW91ciBhcHBsaWNhdGlvbi48L3A+XFxuPHA+WW91IGNhbiBjaGVjayBvdXQgdGhlIDxlbT5jb21wbGV0ZSBBUEkgZG9jdW1lbnRhdGlvbjwvZW0+IGZvciA8Y29kZT5kb21pbnVzPC9jb2RlPiBvbiA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvZG9taW51c1xcXCI+aXRzIEdpdEh1YiByZXBvc2l0b3J5PC9hPi48L3A+XFxuPGgxIGlkPVxcXCJ1c2luZy14aHItdG8tbWFrZS1hamF4LXJlcXVlc3RzXFxcIj5Vc2luZyA8Y29kZT54aHI8L2NvZGU+IHRvIG1ha2UgQUpBWCByZXF1ZXN0czwvaDE+XFxuPHA+QSBzbWFsbCBwcm9ncmFtIGNhbGxlZCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vUmF5bm9zL3hoclxcXCI+PGNvZGU+eGhyPC9jb2RlPjwvYT4gY2FuIGJlIHVzZWQgdG8gbWFrZSBBSkFYIHJlcXVlc3RzIGFuZCBpdCYjMzk7cyBidW5kbGVkIHdpdGggVGF1bnVzLCBiZWNhdXNlIGl0IG5lZWRzIGl0IGludGVybmFsbHkgdG8gY29tbXVuaWNhdGUgd2l0aCB0aGUgc2VydmVyLiBBcyBzdWNoLCBpdCB3YXMgdHJpdmlhbCBmb3IgVGF1bnVzIHRvIGV4cG9zZSB0aGlzIGVuZ2luZSBhbmQgZ2l2ZSB5b3UgdGhlIGFiaWxpdHkgdG8gbWFrZSBBSkFYIGNhbGxzIG9mIHlvdXIgb3duIHVzaW5nIGl0IGFzIHdlbGwuPC9wPlxcbjxwPllvdSBjYW4gY2hlY2sgb3V0IDxhIGhyZWY9XFxcIi9hcGkjLXRhdW51cy14aHItdXJsLW9wdGlvbnMtZG9uZS1cXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4gZm9yIGFuIGV4cGxhbmF0aW9uIG9mIGhvdyBvdXIgaW50ZXJmYWNlIHRvIDxjb2RlPnhocjwvY29kZT4gd29ya3MsIG9yIHlvdSBjb3VsZCBhbHNvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9SYXlub3MveGhyXFxcIj5zZWUgdGhlaXIgQVBJIGRvY3VtZW50YXRpb248L2E+IGFuZCB1c2UgdGhhdCBkaXJlY3RseSBpbnN0ZWFkLjwvcD5cXG48aDEgaWQ9XFxcImNvbXBsZW1lbnRpbmcteW91ci1jb2RlLXdpdGgtc21hbGwtbW9kdWxlc1xcXCI+Q29tcGxlbWVudGluZyB5b3VyIGNvZGUgd2l0aCBzbWFsbCBtb2R1bGVzPC9oMT5cXG48cD5UaGVyZSYjMzk7cyBhbiBpbmZpbml0ZSBudW1iZXIgb2YgbW9kdWxlcyB0aGF0IGRvIGp1c3Qgb25lIHRoaW5nIHdlbGwgYW5kIGFyZSBlYWdlciB0byBiZSBwYXJ0IG9mIHlvdXIgYXBwbGljYXRpb25zLiBMZXZlcmFnZSB0aGUgSW50ZXJuZXQgdG8gZmluZCB3aGF0IHlvdSBuZWVkLiBTbWFsbCBsaWJyYXJpZXMgdGVuZCB0byBiZSBiZXR0ZXIgZG9jdW1lbnRlZCwgY29uY2lzZSB0byB1c2UsIGFuZCBzaW1wbGVyLjwvcD5cXG48cD5IZXJlJiMzOTtzIGEgZmV3IGV4YW1wbGVzIG9mIG1vZHVsZXMgeW91IGNvdWxkIGNvbnNpZGVyLjwvcD5cXG48dWw+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb2x5bWVyL29ic2VydmUtanNcXFwiPjxjb2RlPm9ic2VydmUtanM8L2NvZGU+PC9hPiB0byBnZXQgZGF0YS1iaW5kaW5nPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL01hdHQtRXNjaC92aXJ0dWFsLWRvbVxcXCI+PGNvZGU+dmlydHVhbC1kb208L2NvZGU+PC9hPiB0byB1c2UgYSB2aXJ0dWFsIERPTSBkaWZmaW5nIGFsZ29yaXRobSBhIGxhIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9mYWNlYm9vay9yZWFjdFxcXCI+RmFjZWJvb2sgUmVhY3Q8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2hpbnRcXFwiPjxjb2RlPmhpbnQ8L2NvZGU+PC9hPiBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VzIHlvdXIgSFRNTCBnaXZpbmcgeW91IG1vcmUgY29sb3JmdWwgdG9vbHRpcHM8L2xpPlxcbjxsaT48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvcm9tZVxcXCI+PGNvZGU+cm9tZTwvY29kZT48L2E+IGlzIGEgc21hbGwgY2FsZW5kYXIgY29tcG9uZW50PC9saT5cXG48L3VsPlxcbjxwPllvdSBjYW4gbG9vayBmb3IgcmVsZXZhbnQgbW9kdWxlcyB1c2luZyA8YSBocmVmPVxcXCJodHRwOi8vYnJvd3NlcmlmeXNlYXJjaC5vcmcvXFxcIj5Ccm93c2VyaWZ5U2VhcmNoLm9yZzwvYT4sIHRoZSA8YSBocmVmPVxcXCJodHRwczovL3d3dy5ucG1qcy5vcmcvXFxcIj48Y29kZT5ucG08L2NvZGU+IHNlYXJjaDwvYT4sIGFza2luZyBhcm91bmQgb24gVHdpdHRlciwgb3IganVzdCBieSBHb29nbGluZyE8L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBDb21wbGVtZW50YXJ5IE1vZHVsZXNcXG5cXG4gICAgVGF1bnVzIGlzIGEgc21hbGwgbGlicmFyeSBieSBNVkMgZnJhbWV3b3JrIHN0YW5kYXJkcywgc2l0dGluZyAqKmJlbG93IDE1a0IgbWluaWZpZWQgYW5kIGd6aXBwZWQqKi4gSXQgaXMgZGVzaWduZWQgdG8gYmUgc21hbGwuIEl0IGlzIGFsc28gZGVzaWduZWQgdG8gZG8gb25lIHRoaW5nIHdlbGwsIGFuZCB0aGF0J3MgX2JlaW5nIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lXy5cXG5cXG4gICAgVGF1bnVzIGNhbiBiZSB1c2VkIGZvciByb3V0aW5nLCBwdXR0aW5nIHRvZ2V0aGVyIGNvbnRyb2xsZXJzLCBtb2RlbHMgYW5kIHZpZXdzIHRvIGhhbmRsZSBodW1hbiBpbnRlcmFjdGlvbi4gSWYgeW91IFtoZWFkIG92ZXIgdG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxXSwgeW91J2xsIG5vdGljZSB0aGF0IHRoZSBzZXJ2ZXItc2lkZSBBUEksIHRoZSBjb21tYW5kLWxpbmUgaW50ZXJmYWNlLCBhbmQgdGhlIGAudGF1bnVzcmNgIG1hbmlmZXN0IGFyZSBvbmx5IGNvbmNlcm5lZCB3aXRoIHByb3ZpZGluZyBhIGNvbnZlbnRpb25hbCBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUuXFxuXFxuICAgIEluIHRoZSBzZXJ2ZXItc2lkZSB5b3UgbWlnaHQgbmVlZCB0byBkbyBvdGhlciB0aGluZ3MgYmVzaWRlcyByb3V0aW5nIGFuZCByZW5kZXJpbmcgdmlld3MsIGFuZCBvdGhlciBtb2R1bGVzIGNhbiB0YWtlIGNhcmUgb2YgdGhhdC4gSG93ZXZlciwgeW91J3JlIHVzZWQgdG8gaGF2aW5nIGRhdGFiYXNlIGFjY2Vzcywgc2VhcmNoLCBsb2dnaW5nLCBhbmQgYSB2YXJpZXR5IG9mIHNlcnZpY2VzIGhhbmRsZWQgYnkgc2VwYXJhdGUgbGlicmFyaWVzLCBpbnN0ZWFkIG9mIGEgc2luZ2xlIGJlaGVtb3RoIHRoYXQgdHJpZXMgdG8gZG8gZXZlcnl0aGluZy5cXG5cXG4gICAgPiBJbiB0aGUgY2xpZW50LXNpZGUsIHlvdSBtaWdodCBiZSB1c2VkIHRvIHlvdXIgTVZDIGZyYW1ld29yayBvZiBjaG9pY2UgcmVzb2x2aW5nIGV2ZXJ5dGhpbmcgb24geW91ciBiZWhhbGYsIGZyb20gRE9NIG1hbmlwdWxhdGlvbiBhbmQgZGF0YS1iaW5kaW5nIHRvIGhvb2tpbmcgdXAgd2l0aCBhIFJFU1QgQVBJLCBhbmQgZXZlcnl3aGVyZSBpbiBiZXR3ZWVuLlxcblxcbiAgICBUYXVudXMgYXR0ZW1wdHMgdG8gYnJpbmcgdGhlIHNlcnZlci1zaWRlIG1lbnRhbGl0eSBvZiBfXFxcIm5vdCBkb2luZyBldmVyeXRoaW5nIGlzIG9rYXlcXFwiXyBpbnRvIHRoZSB3b3JsZCBvZiBjbGllbnQtc2lkZSB3ZWIgYXBwbGljYXRpb24gZGV2ZWxvcG1lbnQgYXMgd2VsbC4gVG8gdGhhdCBlbmQsIFRhdW51cyByZWNvbW1lbmRzIHRoYXQgeW91IGdpdmUgYSBzaG90IHRvIGxpYnJhcmllcyB0aGF0IGFsc28gZG8gKipvbmUgdGhpbmcgd2VsbCoqLlxcblxcbiAgICBJbiB0aGlzIGJyaWVmIGFydGljbGUgd2UnbGwgcmVjb21tZW5kIGEgY291cGxlIGRpZmZlcmVudCBsaWJyYXJpZXMgdGhhdCBwbGF5IHdlbGwgd2l0aCBUYXVudXMsIGFuZCB5b3UnbGwgYWxzbyBsZWFybiBob3cgdG8gc2VhcmNoIGZvciBtb2R1bGVzIHRoYXQgY2FuIGdpdmUgeW91IGFjY2VzcyB0byBvdGhlciBmdW5jdGlvbmFsaXR5IHlvdSBtYXkgYmUgaW50ZXJlc3RlZCBpbi5cXG5cXG4gICAgIyBVc2luZyBgZG9taW51c2AgZm9yIERPTSBxdWVyeWluZ1xcblxcbiAgICBbRG9taW51c11bMl0gaXMgYW4gZXh0cmEtc21hbGwgRE9NIHF1ZXJ5aW5nIGxpYnJhcnksIGN1cnJlbnRseSBjbG9ja2luZyBhcm91bmQgKio0a0IgbWluaWZpZWQgYW5kIGd6aXBwZWQqKiwgYWxtb3N0IF90ZW4gdGltZXMgc21hbGxlcl8gdGhhbiBpdCdzIGNvbXBldGl0aW9uLiBVbmxpa2UgalF1ZXJ5IGFuZCBwb3B1bGFyIGZyaWVuZHMsIERvbWludXMgZG9lc24ndCBwcm92aWRlIEFKQVggZmVhdHVyZXMsIGxheW91dCBtYXRoLCBgPGZvcm0+YCBtYW5pcHVsYXRpb24sIHByb21pc2VzLCB0ZW5zIG9mIGV2ZW50IGJpbmRpbmcgbWV0aG9kcywgYSBzZWxlY3RvciBlbmdpbmUgd3JpdHRlbiBpbiBwbGFpbiBKYXZhU2NyaXB0LCBub3IgYSBteXJpYWQgb2YgdXRpbGl0eSBmdW5jdGlvbnMuIEluc3RlYWQsIERvbWludXMgZm9jdXNlcyBzb2xlbHkgb24gcHJvdmlkaW5nIGEgcmljaCBET00gcXVlcnlpbmcgYW5kIG1hbmlwdWxhdGlvbiBBUEkgdGhhdCBnZXRzIHJpZCBvZiBpbmNvbnNpc3RlbmNpZXMgYWNyb3NzIGJyb3dzZXJzLlxcblxcbiAgICBXaGlsZSB0aGUgQVBJIGlzbid0IGV4YWN0bHkgY29tcGF0aWJsZSB3aXRoIGpRdWVyeSwgaXQgaXMgZGVmaW5pdGVseSBmYW1pbGlhciB0byB0aGUgalF1ZXJ5IGFkZXB0LiBDaGFpbmluZywgdmVyc2F0aWxpdHksIGV4cHJlc3NpdmVuZXNzLCBhbmQgcmF3IHBvd2VyIGFyZSBhbGwgY29yZSBjb25jZXJucyBmb3IgRG9taW51cy4gWW91J2xsIGZpbmQgdGhhdCBEb21pbnVzIGhhcyBtb3JlIGNvbnNpc3RlbnRseSBuYW1lZCBtZXRob2RzLCBnaXZlbiB0aGF0IGl0IHdhcyBidWlsdCB3aXRoIGEgY29uY2lzZSBBUEkgaW4gbWluZC5cXG5cXG4gICAgVGhlcmUncyBhIGZldyBkaWZmZXJlbmNlcyBpbiBzZW1hbnRpY3MsIGFuZCBJIGJlbGlldmUgdGhhdCdzIGEgZ29vZCB0aGluZy4gRm9yIGluc3RhbmNlLCBpZiB5b3UgZG8gYC52YWx1ZWAgb24gYSBjaGVja2JveCBvciByYWRpbyBidXR0b24geW91J2xsIGdldCBiYWNrIHdoZXRoZXIgdGhlIGlucHV0IGlzIGNoZWNrZWQuIFNpbWlsYXJseSwgaWYgeW91IGNhbGwgYC50ZXh0YCBvbiB0aGUgaW5wdXQgeW91J2xsIGdldCB0aGUgdGV4dCBiYWNrLCB3aGljaCBpcyBtb3N0IG9mdGVuIHdoYXQgeW91IHdhbnRlZCB0byBnZXQuXFxuXFxuICAgIGBgYGpzXFxuICAgIHZhciBhID0gcmVxdWlyZSgnZG9taW51cycpO1xcbiAgICB2YXIgYiA9IGpRdWVyeTtcXG5cXG4gICAgYSgnPGlucHV0PicpLmF0dHIoeyB0eXBlOiAncmFkaW8nLCB2YWx1ZTogJ0ZvbycgfSkudGV4dCgpO1xcbiAgICAvLyA8LSAnRm9vJ1xcblxcbiAgICBhKCc8aW5wdXQ+JykuYXR0cih7IHR5cGU6ICdyYWRpbycsIGNoZWNrZWQ6IHRydWUgfSkudmFsdWUoKTtcXG4gICAgLy8gPC0gdHJ1ZVxcblxcbiAgICBiKCc8aW5wdXQ+JykuYXR0cih7IHR5cGU6ICdyYWRpbycsIHZhbHVlOiAnRm9vJyB9KS50ZXh0KCk7XFxuICAgIC8vIDwtICcnXFxuXFxuICAgIGIoJzxpbnB1dD4nKS5hdHRyKHsgdHlwZTogJ3JhZGlvJywgY2hlY2tlZDogdHJ1ZSB9KS52YWwoKTtcXG4gICAgLy8gPC0gJ0ZvbydcXG4gICAgYGBgXFxuXFxuICAgIE9uZSBvZiB0aGUgYmVzdCBhc3BlY3RzIG9mIERvbWludXMsIF9iZXNpZGVzIGl0cyBzbWFsbCBzaXplXywgaXMgdGhlIGZhY3QgdGhhdCBpdCBleHRlbmRzIG5hdGl2ZSBKYXZhU2NyaXB0IGFycmF5cyBfKHVzaW5nIFtgcG9zZXJgXVs1XSlfLiBUaGF0IG1lYW5zIHlvdSBoYXZlIGFjY2VzcyB0byBhbGwgb2YgdGhlIGBBcnJheWAgZnVuY3Rpb25hbCBtZXRob2RzIG9uIGFueSBgRG9taW51c2AgY29sbGVjdGlvbnMsIHN1Y2ggYXMgYC5mb3JFYWNoYCwgYC5tYXBgLCBgLmZpbHRlcmAsIGAuc29ydGAgYW5kIHNvIG9uLlxcblxcbiAgICBUYXVudXMgZG9lc24ndCBtYWtlIGFueSBleHRlbnNpdmUgRE9NIG1hbmlwdWxhdGlvbiBfKG5vciBxdWVyeWluZylfIGFuZCBkb2Vzbid0IG5lZWQgdG8gdXNlIERvbWludXMsIGJ1dCBpdCBtYXkgZmluZCBhIGhvbWUgaW4geW91ciBhcHBsaWNhdGlvbi5cXG5cXG4gICAgWW91IGNhbiBjaGVjayBvdXQgdGhlIF9jb21wbGV0ZSBBUEkgZG9jdW1lbnRhdGlvbl8gZm9yIGBkb21pbnVzYCBvbiBbaXRzIEdpdEh1YiByZXBvc2l0b3J5XVsyXS5cXG5cXG4gICAgIyBVc2luZyBgeGhyYCB0byBtYWtlIEFKQVggcmVxdWVzdHNcXG5cXG4gICAgQSBzbWFsbCBwcm9ncmFtIGNhbGxlZCBbYHhocmBdWzRdIGNhbiBiZSB1c2VkIHRvIG1ha2UgQUpBWCByZXF1ZXN0cyBhbmQgaXQncyBidW5kbGVkIHdpdGggVGF1bnVzLCBiZWNhdXNlIGl0IG5lZWRzIGl0IGludGVybmFsbHkgdG8gY29tbXVuaWNhdGUgd2l0aCB0aGUgc2VydmVyLiBBcyBzdWNoLCBpdCB3YXMgdHJpdmlhbCBmb3IgVGF1bnVzIHRvIGV4cG9zZSB0aGlzIGVuZ2luZSBhbmQgZ2l2ZSB5b3UgdGhlIGFiaWxpdHkgdG8gbWFrZSBBSkFYIGNhbGxzIG9mIHlvdXIgb3duIHVzaW5nIGl0IGFzIHdlbGwuXFxuXFxuICAgIFlvdSBjYW4gY2hlY2sgb3V0IFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzZdIGZvciBhbiBleHBsYW5hdGlvbiBvZiBob3cgb3VyIGludGVyZmFjZSB0byBgeGhyYCB3b3Jrcywgb3IgeW91IGNvdWxkIGFsc28gW3NlZSB0aGVpciBBUEkgZG9jdW1lbnRhdGlvbl1bNF0gYW5kIHVzZSB0aGF0IGRpcmVjdGx5IGluc3RlYWQuXFxuXFxuICAgICMgQ29tcGxlbWVudGluZyB5b3VyIGNvZGUgd2l0aCBzbWFsbCBtb2R1bGVzXFxuXFxuICAgIFRoZXJlJ3MgYW4gaW5maW5pdGUgbnVtYmVyIG9mIG1vZHVsZXMgdGhhdCBkbyBqdXN0IG9uZSB0aGluZyB3ZWxsIGFuZCBhcmUgZWFnZXIgdG8gYmUgcGFydCBvZiB5b3VyIGFwcGxpY2F0aW9ucy4gTGV2ZXJhZ2UgdGhlIEludGVybmV0IHRvIGZpbmQgd2hhdCB5b3UgbmVlZC4gU21hbGwgbGlicmFyaWVzIHRlbmQgdG8gYmUgYmV0dGVyIGRvY3VtZW50ZWQsIGNvbmNpc2UgdG8gdXNlLCBhbmQgc2ltcGxlci5cXG5cXG4gICAgSGVyZSdzIGEgZmV3IGV4YW1wbGVzIG9mIG1vZHVsZXMgeW91IGNvdWxkIGNvbnNpZGVyLlxcblxcbiAgICAtIFtgb2JzZXJ2ZS1qc2BdWzddIHRvIGdldCBkYXRhLWJpbmRpbmdcXG4gICAgLSBbYHZpcnR1YWwtZG9tYF1bOF0gdG8gdXNlIGEgdmlydHVhbCBET00gZGlmZmluZyBhbGdvcml0aG0gYSBsYSBbRmFjZWJvb2sgUmVhY3RdWzldXFxuICAgIC0gW2BoaW50YF1bMTBdIHByb2dyZXNzaXZlbHkgZW5oYW5jZXMgeW91ciBIVE1MIGdpdmluZyB5b3UgbW9yZSBjb2xvcmZ1bCB0b29sdGlwc1xcbiAgICAtIFtgcm9tZWBdWzExXSBpcyBhIHNtYWxsIGNhbGVuZGFyIGNvbXBvbmVudFxcblxcbiAgICBZb3UgY2FuIGxvb2sgZm9yIHJlbGV2YW50IG1vZHVsZXMgdXNpbmcgW0Jyb3dzZXJpZnlTZWFyY2gub3JnXVsxM10sIHRoZSBbYG5wbWAgc2VhcmNoXVsxNF0sIGFza2luZyBhcm91bmQgb24gVHdpdHRlciwgb3IganVzdCBieSBHb29nbGluZyFcXG5cXG4gICAgWzFdOiAvYXBpXFxuICAgIFsyXTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2RvbWludXNcXG4gICAgWzRdOiBodHRwczovL2dpdGh1Yi5jb20vUmF5bm9zL3hoclxcbiAgICBbNV06IGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9wb3NlclxcbiAgICBbNl06IC9hcGkjLXRhdW51cy14aHItdXJsLW9wdGlvbnMtZG9uZS1cXG4gICAgWzddOiBodHRwczovL2dpdGh1Yi5jb20vcG9seW1lci9vYnNlcnZlLWpzXFxuICAgIFs4XTogaHR0cHM6Ly9naXRodWIuY29tL01hdHQtRXNjaC92aXJ0dWFsLWRvbVxcbiAgICBbOV06IGh0dHBzOi8vZ2l0aHViLmNvbS9mYWNlYm9vay9yZWFjdFxcbiAgICBbMTBdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvaGludFxcbiAgICBbMTFdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvcm9tZVxcbiAgICBbMTJdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvaGludFxcbiAgICBbMTNdOiBodHRwOi8vYnJvd3NlcmlmeXNlYXJjaC5vcmcvXFxuICAgIFsxNF06IGh0dHBzOi8vd3d3Lm5wbWpzLm9yZy9cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZ2V0dGluZ1N0YXJ0ZWQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImdldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9oMT5cXG48cD5UYXVudXMgaXMgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUgZm9yIE5vZGUuanMsIGFuZCBpdCYjMzk7cyA8ZW0+dXAgdG8geW91IGhvdyB0byB1c2UgaXQ8L2VtPi4gSW4gZmFjdCwgaXQgbWlnaHQgYmUgYSBnb29kIGlkZWEgZm9yIHlvdSB0byA8c3Ryb25nPnNldCB1cCBqdXN0IHRoZSBzZXJ2ZXItc2lkZSBhc3BlY3QgZmlyc3Q8L3N0cm9uZz4sIGFzIHRoYXQmIzM5O2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LjwvcD5cXG48aDEgaWQ9XFxcInRhYmxlLW9mLWNvbnRlbnRzXFxcIj5UYWJsZSBvZiBDb250ZW50czwvaDE+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCIjaG93LWl0LXdvcmtzXFxcIj5Ib3cgaXQgd29ya3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2luc3RhbGxpbmctdGF1bnVzXFxcIj5JbnN0YWxsaW5nIFRhdW51czwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjc2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9hPjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI3lvdXItZmlyc3Qtcm91dGVcXFwiPllvdXIgZmlyc3Qgcm91dGU8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2NyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctamFkZS1hcy15b3VyLXZpZXctZW5naW5lXFxcIj5Vc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmU8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3Rocm93aW5nLWluLWEtY29udHJvbGxlclxcXCI+VGhyb3dpbmcgaW4gYSBjb250cm9sbGVyPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9hPjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLXRoZS10YXVudXMtY2xpXFxcIj5Vc2luZyB0aGUgVGF1bnVzIENMSTwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjYm9vdGluZy11cC10aGUtY2xpZW50LXNpZGUtcm91dGVyXFxcIj5Cb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXI8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2FkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlclxcXCI+QWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjb21waWxpbmcteW91ci1jbGllbnQtc2lkZS1qYXZhc2NyaXB0XFxcIj5Db21waWxpbmcgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtY2xpZW50LXNpZGUtdGF1bnVzLWFwaVxcXCI+VXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2NhY2hpbmctYW5kLXByZWZldGNoaW5nXFxcIj5DYWNoaW5nIGFuZCBQcmVmZXRjaGluZzwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdmVyc2lvbmluZ1xcXCI+VmVyc2lvbmluZzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RoZS1za3ktaXMtdGhlLWxpbWl0LVxcXCI+VGhlIHNreSBpcyB0aGUgbGltaXQhPC9hPjwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcImhvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9oMT5cXG48cD5UYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgPHN0cm9uZz5wcm92ZW48L3N0cm9uZz4gc2V0IG9mIHJ1bGVzLjwvcD5cXG48dWw+XFxuPGxpPkRlZmluZSBhIDxjb2RlPmZ1bmN0aW9uKG1vZGVsKTwvY29kZT4gZm9yIGVhY2ggeW91ciB2aWV3czwvbGk+XFxuPGxpPlB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnQ8L2xpPlxcbjxsaT5EZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uPC9saT5cXG48bGk+UHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnQ8L2xpPlxcbjxsaT5FbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHM8L2xpPlxcbjxsaT5DcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5DcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXc8L2xpPlxcbjxsaT5Gb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlPC9saT5cXG48bGk+V2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCE8L2xpPlxcbjxsaT5PbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCA8c3Ryb25nPmhpamFjayBsaW5rIGNsaWNrczwvc3Ryb25nPiBhbmQgbWFrZSBBSkFYIHJlcXVlc3RzIGluc3RlYWQ8L2xpPlxcbjxsaT5XaGVuIHlvdSBnZXQgdGhlIEpTT04gbW9kZWwgYmFjaywgcmVuZGVyIHZpZXdzIG9uIHRoZSBjbGllbnQtc2lkZTwvbGk+XFxuPGxpPklmIHRoZSA8Y29kZT5oaXN0b3J5PC9jb2RlPiBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiA8c3Ryb25nPkRvbiYjMzk7dCBjb25mdXNlIHlvdXIgaHVtYW5zIHdpdGggb2JzY3VyZSBoYXNoIHJvdXRlcnMhPC9zdHJvbmc+PC9saT5cXG48L3VsPlxcbjxwPkkmIzM5O2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEkmIzM5O2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIHN0ZXBzIHlvdSBuZWVkIHRvIHRha2UgaW4gb3JkZXIgdG8gbWFrZSB0aGlzIGZsb3cgaGFwcGVuLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImluc3RhbGxpbmctdGF1bnVzXFxcIj5JbnN0YWxsaW5nIFRhdW51czwvaDE+XFxuPHA+Rmlyc3Qgb2ZmLCB5b3UmIzM5O2xsIG5lZWQgdG8gY2hvb3NlIGEgSFRUUCBzZXJ2ZXIgZnJhbWV3b3JrIGZvciB5b3VyIGFwcGxpY2F0aW9uLiBBdCB0aGUgbW9tZW50IFRhdW51cyBzdXBwb3J0cyBvbmx5IGEgY291cGxlIG9mIEhUVFAgZnJhbWV3b3JrcywgYnV0IG1vcmUgbWF5IGJlIGFkZGVkIGlmIHRoZXkgYXJlIHBvcHVsYXIgZW5vdWdoLjwvcD5cXG48dWw+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiwgdGhyb3VnaCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxcIj50YXVudXMtZXhwcmVzczwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcXCI+dGF1bnVzLWhhcGk8L2E+IGFuZCB0aGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxcIj5oYXBpaWZ5PC9hPiB0cmFuc2Zvcm08L2xpPlxcbjwvdWw+XFxuPGJsb2NrcXVvdGU+XFxuPHA+SWYgeW91JiMzOTtyZSBtb3JlIG9mIGEgPGVtPiZxdW90O3J1bW1hZ2UgdGhyb3VnaCBzb21lb25lIGVsc2UmIzM5O3MgY29kZSZxdW90OzwvZW0+IHR5cGUgb2YgZGV2ZWxvcGVyLCB5b3UgbWF5IGZlZWwgY29tZm9ydGFibGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXFwiPmdvaW5nIHRocm91Z2ggdGhpcyB3ZWJzaXRlJiMzOTtzIHNvdXJjZSBjb2RlPC9hPiwgd2hpY2ggdXNlcyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvb1xcXCI+cG9ueWZvby5jb208L2E+LCB3aGljaCBpcyA8c3Ryb25nPmEgbW9yZSBhZHZhbmNlZCB1c2UtY2FzZTwvc3Ryb25nPiB1bmRlciB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQmIzM5O3Mgb2theSB0b28uPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5PbmNlIHlvdSYjMzk7dmUgc2V0dGxlZCBmb3IgZWl0aGVyIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBvciA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4geW91JiMzOTtsbCBiZSBhYmxlIHRvIHByb2NlZWQuIEZvciB0aGUgcHVycG9zZXMgb2YgdGhpcyBndWlkZSwgd2UmIzM5O2xsIHVzZSA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4uIFN3aXRjaGluZyBiZXR3ZWVuIG9uZSBvZiB0aGUgZGlmZmVyZW50IEhUVFAgZmxhdm9ycyBpcyBzdHJpa2luZ2x5IGVhc3ksIHRob3VnaC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZVxcXCI+U2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGU8L2g0PlxcbjxwPk5hdHVyYWxseSwgeW91JiMzOTtsbCBuZWVkIHRvIGluc3RhbGwgYWxsIG9mIHRoZSBmb2xsb3dpbmcgbW9kdWxlcyBmcm9tIDxjb2RlPm5wbTwvY29kZT4gdG8gZ2V0IHN0YXJ0ZWQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm1rZGlyIGdldHRpbmctc3RhcnRlZFxcbmNkIGdldHRpbmctc3RhcnRlZFxcbm5wbSBpbml0XFxubnBtIGluc3RhbGwgLS1zYXZlIHRhdW51cyB0YXVudXMtZXhwcmVzcyBleHByZXNzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vNFA4dk5lOS5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBucG0gaW5pdGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+TGV0JiMzOTtzIGJ1aWxkIG91ciBhcHBsaWNhdGlvbiBzdGVwLWJ5LXN0ZXAsIGFuZCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZW0gYXMgd2UgZ28gYWxvbmcuIEZpcnN0IG9mIGFsbCwgeW91JiMzOTtsbCBuZWVkIHRoZSBmYW1vdXMgPGNvZGU+YXBwLmpzPC9jb2RlPiBmaWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBhcHAuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+SXQmIzM5O3MgcHJvYmFibHkgYSBnb29kIGlkZWEgdG8gcHV0IHNvbWV0aGluZyBpbiB5b3VyIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZSwgbGV0JiMzOTtzIGRvIHRoYXQgbm93LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7fTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5BbGwgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+IHJlYWxseSBkb2VzIGlzIGFkZCBhIGJ1bmNoIG9mIHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgPGNvZGU+YXBwPC9jb2RlPi4gWW91IHNob3VsZCBub3RlIHRoYXQgYW55IG1pZGRsZXdhcmUgYW5kIEFQSSByb3V0ZXMgc2hvdWxkIHByb2JhYmx5IGNvbWUgYmVmb3JlIHRoZSA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBpbnZvY2F0aW9uLiBZb3UmIzM5O2xsIHByb2JhYmx5IGJlIHVzaW5nIGEgY2F0Y2gtYWxsIHZpZXcgcm91dGUgdGhhdCByZW5kZXJzIGEgPGVtPiZxdW90O05vdCBGb3VuZCZxdW90OzwvZW0+IHZpZXcsIGJsb2NraW5nIGFueSByb3V0aW5nIGJleW9uZCB0aGF0IHJvdXRlLjwvcD5cXG48cD5JZiB5b3Ugd2VyZSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIG5vdyB5b3Ugd291bGQgZ2V0IGEgZnJpZW5kbHkgcmVtaW5lZCBmcm9tIFRhdW51cyBsZXR0aW5nIHlvdSBrbm93IHRoYXQgeW91IGZvcmdvdCB0byBkZWNsYXJlIGFueSB2aWV3IHJvdXRlcy4gU2lsbHkgeW91ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcFxcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL244bUg0bU4ucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dFxcXCI+PC9wPlxcbjxwPlRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+IGxldCYjMzk7cyB5b3UgY29uZmlndXJlIFRhdW51cy4gSW5zdGVhZCBvZiBkaXNjdXNzaW5nIGV2ZXJ5IHNpbmdsZSBjb25maWd1cmF0aW9uIG9wdGlvbiB5b3UgY291bGQgc2V0IGhlcmUsIGxldCYjMzk7cyBkaXNjdXNzIHdoYXQgbWF0dGVyczogdGhlIDxlbT5yZXF1aXJlZCBjb25maWd1cmF0aW9uPC9lbT4uIFRoZXJlJiMzOTtzIHR3byBvcHRpb25zIHRoYXQgeW91IG11c3Qgc2V0IGlmIHlvdSB3YW50IHlvdXIgVGF1bnVzIGFwcGxpY2F0aW9uIHRvIG1ha2UgYW55IHNlbnNlLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPnJvdXRlczwvY29kZT4gc2hvdWxkIGJlIGFuIGFycmF5IG9mIHZpZXcgcm91dGVzPC9saT5cXG48bGk+PGNvZGU+bGF5b3V0PC9jb2RlPiBzaG91bGQgYmUgYSBmdW5jdGlvbiB0aGF0IHRha2VzIGEgc2luZ2xlIDxjb2RlPm1vZGVsPC9jb2RlPiBhcmd1bWVudCBhbmQgcmV0dXJucyBhbiBlbnRpcmUgSFRNTCBkb2N1bWVudDwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInlvdXItZmlyc3Qtcm91dGVcXFwiPllvdXIgZmlyc3Qgcm91dGU8L2g0PlxcbjxwPlJvdXRlcyBuZWVkIHRvIGJlIHBsYWNlZCBpbiBpdHMgb3duIGRlZGljYXRlZCBtb2R1bGUsIHNvIHRoYXQgeW91IGNhbiByZXVzZSBpdCBsYXRlciBvbiA8c3Ryb25nPndoZW4gc2V0dGluZyB1cCBjbGllbnQtc2lkZSByb3V0aW5nPC9zdHJvbmc+LiBMZXQmIzM5O3MgY3JlYXRlIHRoYXQgbW9kdWxlIGFuZCBhZGQgYSByb3V0ZSB0byBpdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggcm91dGVzLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gW1xcbiAgeyByb3V0ZTogJiMzOTsvJiMzOTssIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTsgfVxcbl07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkVhY2ggaXRlbSBpbiB0aGUgZXhwb3J0ZWQgYXJyYXkgaXMgYSByb3V0ZS4gSW4gdGhpcyBjYXNlLCB3ZSBvbmx5IGhhdmUgdGhlIDxjb2RlPi88L2NvZGU+IHJvdXRlIHdpdGggdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGFjdGlvbi4gVGF1bnVzIGZvbGxvd3MgdGhlIHdlbGwga25vd24gPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb24gcGF0dGVybjwvYT4sIHdoaWNoIG1hZGUgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9SdWJ5X29uX1JhaWxzXFxcIj5SdWJ5IG9uIFJhaWxzPC9hPiBmYW1vdXMuIDxlbT5NYXliZSBvbmUgZGF5IFRhdW51cyB3aWxsIGJlIGZhbW91cyB0b28hPC9lbT4gQnkgY29udmVudGlvbiwgVGF1bnVzIHdpbGwgYXNzdW1lIHRoYXQgdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGFjdGlvbiB1c2VzIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBjb250cm9sbGVyIGFuZCByZW5kZXJzIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiB2aWV3LiBPZiBjb3Vyc2UsIDxlbT5hbGwgb2YgdGhhdCBjYW4gYmUgY2hhbmdlZCB1c2luZyBjb25maWd1cmF0aW9uPC9lbT4uPC9wPlxcbjxwPlRpbWUgdG8gZ28gYmFjayB0byA8Y29kZT5hcHAuanM8L2NvZGU+IGFuZCB1cGRhdGUgdGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9yb3V0ZXMmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIGltcG9ydGFudCB0byBrbm93IHRoYXQgaWYgeW91IG9taXQgdGhlIGNyZWF0aW9uIG9mIGEgY29udHJvbGxlciB0aGVuIFRhdW51cyB3aWxsIHNraXAgdGhhdCBzdGVwLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHBhc3NpbmcgaXQgd2hhdGV2ZXIgdGhlIGRlZmF1bHQgbW9kZWwgaXMgPGVtPihtb3JlIG9uIHRoYXQgPGEgaHJlZj1cXFwiL2FwaVxcXCI+aW4gdGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiwgYnV0IGl0IGRlZmF1bHRzIHRvIDxjb2RlPnt9PC9jb2RlPik8L2VtPi48L3A+XFxuPHA+SGVyZSYjMzk7cyB3aGF0IHlvdSYjMzk7ZCBnZXQgaWYgeW91IGF0dGVtcHRlZCB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxuY3VybCBsb2NhbGhvc3Q6MzAwMFxcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tLzA4bG5DZWMucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIHJlc3VsdHNcXFwiPjwvcD5cXG48cD5UdXJucyBvdXQgeW91JiMzOTtyZSBtaXNzaW5nIGEgbG90IG9mIHRoaW5ncyEgVGF1bnVzIGlzIHF1aXRlIGxlbmllbnQgYW5kIGl0JiMzOTtsbCB0cnkgaXRzIGJlc3QgdG8gbGV0IHlvdSBrbm93IHdoYXQgeW91IG1pZ2h0IGJlIG1pc3NpbmcsIHRob3VnaC4gQXBwYXJlbnRseSB5b3UgZG9uJiMzOTt0IGhhdmUgYSBsYXlvdXQsIGEgc2VydmVyLXNpZGUgY29udHJvbGxlciwgb3IgZXZlbiBhIHZpZXchIDxlbT5UaGF0JiMzOTtzIHJvdWdoLjwvZW0+PC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY3JlYXRpbmctYS1sYXlvdXRcXFwiPkNyZWF0aW5nIGEgbGF5b3V0PC9oND5cXG48cD5MZXQmIzM5O3MgYWxzbyBjcmVhdGUgYSBsYXlvdXQuIEZvciB0aGUgcHVycG9zZXMgb2YgbWFraW5nIG91ciB3YXkgdGhyb3VnaCB0aGlzIGd1aWRlLCBpdCYjMzk7bGwganVzdCBiZSBhIHBsYWluIEphdmFTY3JpcHQgZnVuY3Rpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIGxheW91dC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5Ob3RlIHRoYXQgdGhlIDxjb2RlPnBhcnRpYWw8L2NvZGU+IHByb3BlcnR5IGluIHRoZSA8Y29kZT5tb2RlbDwvY29kZT4gPGVtPihhcyBzZWVuIGJlbG93KTwvZW0+IGlzIGNyZWF0ZWQgb24gdGhlIGZseSBhZnRlciByZW5kZXJpbmcgcGFydGlhbCB2aWV3cy4gVGhlIGxheW91dCBmdW5jdGlvbiB3ZSYjMzk7bGwgYmUgdXNpbmcgaGVyZSBlZmZlY3RpdmVseSBtZWFucyA8ZW0+JnF1b3Q7dXNlIHRoZSBmb2xsb3dpbmcgY29tYmluYXRpb24gb2YgcGxhaW4gdGV4dCBhbmQgdGhlIDxzdHJvbmc+KG1heWJlIEhUTUwpPC9zdHJvbmc+IHBhcnRpYWwgdmlldyZxdW90OzwvZW0+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgcmV0dXJuICYjMzk7VGhpcyBpcyB0aGUgcGFydGlhbDogJnF1b3Q7JiMzOTsgKyBtb2RlbC5wYXJ0aWFsICsgJiMzOTsmcXVvdDsmIzM5OztcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIGlmIHlvdSB3ZXJlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uLCB0aGVuIHlvdSBwcm9iYWJseSB3b3VsZG4mIzM5O3Qgd2FudCB0byB3cml0ZSB2aWV3cyBhcyBKYXZhU2NyaXB0IGZ1bmN0aW9ucyBhcyB0aGF0JiMzOTtzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vamFubC9tdXN0YWNoZS5qc1xcXCI+TXVzdGFjaGU8L2E+IGlzIGEgdGVtcGxhdGluZyBlbmdpbmUgdGhhdCBjYW4gY29tcGlsZSB5b3VyIHZpZXdzIGludG8gcGxhaW4gZnVuY3Rpb25zLCB1c2luZyBhIHN5bnRheCB0aGF0JiMzOTtzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxcIj5KYWRlPC9hPiBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJiMzOTtzIG5vIGNsb3NpbmcgdGFnczwvbGk+XFxuPGxpPlRoZXJlJiMzOTtzIG1hbnkgbW9yZSBhbHRlcm5hdGl2ZXMgbGlrZSA8YSBocmVmPVxcXCJodHRwOi8vbW96aWxsYS5naXRodWIuaW8vbnVuanVja3MvXFxcIj5Nb3ppbGxhJiMzOTtzIE51bmp1Y2tzPC9hPiwgPGEgaHJlZj1cXFwiaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxcIj5IYW5kbGViYXJzPC9hPiwgYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxcIj5FSlM8L2E+LjwvbGk+XFxuPC91bD5cXG48cD5SZW1lbWJlciB0byBhZGQgdGhlIDxjb2RlPmxheW91dDwvY29kZT4gdW5kZXIgdGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspLFxcbiAgbGF5b3V0OiByZXF1aXJlKCYjMzk7Li9sYXlvdXQmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkhlcmUmIzM5O3Mgd2hhdCB5b3UmIzM5O2QgZ2V0IGlmIHlvdSByYW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxuY3VybCBsb2NhbGhvc3Q6MzAwMFxcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL3dVYm5DeWsucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dFxcXCI+PC9wPlxcbjxwPkF0IHRoaXMgcG9pbnQgd2UgaGF2ZSBhIGxheW91dCwgYnV0IHdlJiMzOTtyZSBzdGlsbCBtaXNzaW5nIHRoZSBwYXJ0aWFsIHZpZXcgYW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLiBXZSBjYW4gZG8gd2l0aG91dCB0aGUgY29udHJvbGxlciwgYnV0IGhhdmluZyBubyB2aWV3cyBpcyBraW5kIG9mIHBvaW50bGVzcyB3aGVuIHlvdSYjMzk7cmUgdHJ5aW5nIHRvIGdldCBhbiBNVkMgZW5naW5lIHVwIGFuZCBydW5uaW5nLCByaWdodD88L3A+XFxuPHA+WW91JiMzOTtsbCBmaW5kIHRvb2xzIHJlbGF0ZWQgdG8gdmlldyB0ZW1wbGF0aW5nIGluIHRoZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmNvbXBsZW1lbnRhcnkgbW9kdWxlcyBzZWN0aW9uPC9hPi4gSWYgeW91IGRvbiYjMzk7dCBwcm92aWRlIGEgPGNvZGU+bGF5b3V0PC9jb2RlPiBwcm9wZXJ0eSBhdCBhbGwsIFRhdW51cyB3aWxsIHJlbmRlciB5b3VyIG1vZGVsIGluIGEgcmVzcG9uc2UgYnkgd3JhcHBpbmcgaXQgaW4gPGNvZGU+Jmx0O3ByZSZndDs8L2NvZGU+IGFuZCA8Y29kZT4mbHQ7Y29kZSZndDs8L2NvZGU+IHRhZ3MsIHdoaWNoIG1heSBhaWQgeW91IHdoZW4gZ2V0dGluZyBzdGFydGVkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9oND5cXG48cD5MZXQmIzM5O3MgZ28gYWhlYWQgYW5kIHVzZSBKYWRlIGFzIHRoZSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgb2YgY2hvaWNlIGZvciBvdXIgdmlld3MuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm1rZGlyIC1wIHZpZXdzL2hvbWVcXG50b3VjaCB2aWV3cy9ob21lL2luZGV4LmphZGVcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2Ugd2UmIzM5O3JlIGp1c3QgZ2V0dGluZyBzdGFydGVkLCB0aGUgdmlldyB3aWxsIGp1c3QgaGF2ZSBzb21lIGJhc2ljIHN0YXRpYyBjb250ZW50LCBhbmQgdGhhdCYjMzk7cyBpdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj5wIEhlbGxvIFRhdW51cyFcXG48L2NvZGU+PC9wcmU+XFxuPHA+TmV4dCB5b3UmIzM5O2xsIHdhbnQgdG8gY29tcGlsZSB0aGUgdmlldyBpbnRvIGEgZnVuY3Rpb24uIFRvIGRvIHRoYXQgeW91IGNhbiB1c2UgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2phZHVtXFxcIj5qYWR1bTwvYT4sIGEgc3BlY2lhbGl6ZWQgSmFkZSBjb21waWxlciB0aGF0IHBsYXlzIHdlbGwgd2l0aCBUYXVudXMgYnkgYmVpbmcgYXdhcmUgb2YgPGNvZGU+cmVxdWlyZTwvY29kZT4gc3RhdGVtZW50cywgYW5kIHRodXMgc2F2aW5nIGJ5dGVzIHdoZW4gaXQgY29tZXMgdG8gY2xpZW50LXNpZGUgcmVuZGVyaW5nLiBMZXQmIzM5O3MgaW5zdGFsbCBpdCBnbG9iYWxseSwgZm9yIHRoZSBzYWtlIG9mIHRoaXMgZXhlcmNpc2UgPGVtPih5b3Ugc2hvdWxkIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHlvdSYjMzk7cmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24pPC9lbT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC0tZ2xvYmFsIGphZHVtXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRvIGNvbXBpbGUgZXZlcnkgdmlldyBpbiB0aGUgPGNvZGU+dmlld3M8L2NvZGU+IGRpcmVjdG9yeSBpbnRvIGZ1bmN0aW9ucyB0aGF0IHdvcmsgd2VsbCB3aXRoIFRhdW51cywgeW91IGNhbiB1c2UgdGhlIGNvbW1hbmQgYmVsb3cuIFRoZSA8Y29kZT4tLW91dHB1dDwvY29kZT4gZmxhZyBpbmRpY2F0ZXMgd2hlcmUgeW91IHdhbnQgdGhlIHZpZXdzIHRvIGJlIHBsYWNlZC4gV2UgY2hvc2UgdG8gdXNlIDxjb2RlPi5iaW48L2NvZGU+IGJlY2F1c2UgdGhhdCYjMzk7cyB3aGVyZSBUYXVudXMgZXhwZWN0cyB5b3VyIGNvbXBpbGVkIHZpZXdzIHRvIGJlIGJ5IGRlZmF1bHQuIEJ1dCBzaW5jZSBUYXVudXMgZm9sbG93cyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+Y29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb248L2E+IGFwcHJvYWNoLCB5b3UgY291bGQgY2hhbmdlIHRoYXQgaWYgeW91IHdhbnRlZCB0by48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+amFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbjwvY29kZT48L3ByZT5cXG48cD5Db25ncmF0dWxhdGlvbnMhIFlvdXIgZmlyc3QgdmlldyBpcyBub3cgb3BlcmF0aW9uYWwgYW5kIGJ1aWx0IHVzaW5nIGEgZnVsbC1mbGVkZ2VkIHRlbXBsYXRpbmcgZW5naW5lISBBbGwgdGhhdCYjMzk7cyBsZWZ0IGlzIGZvciB5b3UgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhbmQgdmlzaXQgaXQgb24gcG9ydCA8Y29kZT4zMDAwPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHAgJmFtcDtcXG5vcGVuIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFxcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL3pqYUpZQ3EucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dFxcXCI+PC9wPlxcbjxwPkdyYW50ZWQsIHlvdSBzaG91bGQgPGVtPnByb2JhYmx5PC9lbT4gbW92ZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIDxlbT4oYW55IHZpZXcgZW5naW5lIHdpbGwgZG8pPC9lbT4gdGVtcGxhdGUgYXMgd2VsbC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q29udHJvbGxlcnMgYXJlIGluZGVlZCBvcHRpb25hbCwgYnV0IGFuIGFwcGxpY2F0aW9uIHRoYXQgcmVuZGVycyBldmVyeSB2aWV3IHVzaW5nIHRoZSBzYW1lIG1vZGVsIHdvbiYjMzk7dCBnZXQgeW91IHZlcnkgZmFyLiBDb250cm9sbGVycyBhbGxvdyB5b3UgdG8gaGFuZGxlIHRoZSByZXF1ZXN0IGFuZCBwdXQgdG9nZXRoZXIgdGhlIG1vZGVsIHRvIGJlIHVzZWQgd2hlbiBzZW5kaW5nIGEgcmVzcG9uc2UuIENvbnRyYXJ5IHRvIHdoYXQgbW9zdCBmcmFtZXdvcmtzIHByb3Bvc2UsIFRhdW51cyBleHBlY3RzIGV2ZXJ5IGFjdGlvbiB0byBoYXZlIGl0cyBvd24gaW5kaXZpZHVhbCBjb250cm9sbGVyLiBTaW5jZSBOb2RlLmpzIG1ha2VzIGl0IGVhc3kgdG8gaW1wb3J0IGNvbXBvbmVudHMsIHRoaXMgc2V0dXAgaGVscHMgeW91IGtlZXAgeW91ciBjb2RlIG1vZHVsYXIgd2hpbGUgc3RpbGwgYmVpbmcgYWJsZSB0byByZXVzZSBsb2dpYyBieSBzaGFyaW5nIG1vZHVsZXMgYWNyb3NzIGRpZmZlcmVudCBjb250cm9sbGVycy4gTGV0JiMzOTtzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSA8Y29kZT5ob21lL3ZpZXc8L2NvZGU+IGFjdGlvbi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgY29udHJvbGxlcnMvaG9tZVxcbnRvdWNoIGNvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIGNvbnRyb2xsZXIgbW9kdWxlIHNob3VsZCBtZXJlbHkgZXhwb3J0IGEgZnVuY3Rpb24uIDxlbT5TdGFydGVkIG5vdGljaW5nIHRoZSBwYXR0ZXJuPzwvZW0+IFRoZSBzaWduYXR1cmUgZm9yIHRoZSBjb250cm9sbGVyIGlzIHRoZSBzYW1lIHNpZ25hdHVyZSBhcyB0aGF0IG9mIGFueSBvdGhlciBtaWRkbGV3YXJlIHBhc3NlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gPGVtPihvciBhbnkgcm91dGUgaGFuZGxlciBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IGluIHRoZSBjYXNlIG9mIDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPik8L2VtPi48L3A+XFxuPHA+QXMgeW91IG1heSBoYXZlIG5vdGljZWQgaW4gdGhlIGV4YW1wbGVzIHNvIGZhciwgeW91IGhhdmVuJiMzOTt0IGV2ZW4gc2V0IGEgZG9jdW1lbnQgdGl0bGUgZm9yIHlvdXIgSFRNTCBwYWdlcyEgVHVybnMgb3V0LCB0aGVyZSYjMzk7cyBhIGZldyBtb2RlbCBwcm9wZXJ0aWVzIDxlbT4odmVyeSBmZXcpPC9lbT4gdGhhdCBUYXVudXMgaXMgYXdhcmUgb2YuIE9uZSBvZiB0aG9zZSBpcyB0aGUgPGNvZGU+dGl0bGU8L2NvZGU+IHByb3BlcnR5LCBhbmQgaXQmIzM5O2xsIGJlIHVzZWQgdG8gY2hhbmdlIHRoZSA8Y29kZT5kb2N1bWVudC50aXRsZTwvY29kZT4gaW4geW91ciBwYWdlcyB3aGVuIG5hdmlnYXRpbmcgdGhyb3VnaCB0aGUgY2xpZW50LXNpZGUuIEtlZXAgaW4gbWluZCB0aGF0IGFueXRoaW5nIHRoYXQmIzM5O3Mgbm90IGluIHRoZSA8Y29kZT5tb2RlbDwvY29kZT4gcHJvcGVydHkgd29uJiMzOTt0IGJlIHRyYXNtaXR0ZWQgdG8gdGhlIGNsaWVudCwgYW5kIHdpbGwganVzdCBiZSBhY2Nlc3NpYmxlIHRvIHRoZSBsYXlvdXQuPC9wPlxcbjxwPkhlcmUgaXMgb3VyIG5ld2ZhbmdsZWQgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlci4gQXMgeW91JiMzOTtsbCBub3RpY2UsIGl0IGRvZXNuJiMzOTt0IGRpc3J1cHQgYW55IG9mIHRoZSB0eXBpY2FsIEV4cHJlc3MgZXhwZXJpZW5jZSwgYnV0IG1lcmVseSBidWlsZHMgdXBvbiBpdC4gV2hlbiA8Y29kZT5uZXh0PC9jb2RlPiBpcyBjYWxsZWQsIHRoZSBUYXVudXMgdmlldy1yZW5kZXJpbmcgaGFuZGxlciB3aWxsIGtpY2sgaW4sIGFuZCByZW5kZXIgdGhlIHZpZXcgdXNpbmcgdGhlIGluZm9ybWF0aW9uIHRoYXQgd2FzIGFzc2lnbmVkIHRvIDxjb2RlPnJlcy52aWV3TW9kZWw8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgcmVzLnZpZXdNb2RlbCA9IHtcXG4gICAgbW9kZWw6IHtcXG4gICAgICB0aXRsZTogJiMzOTtXZWxjb21lIEhvbWUsIFRhdW51cyEmIzM5O1xcbiAgICB9XFxuICB9O1xcbiAgbmV4dCgpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9mIGNvdXJzZSwgcmVseWluZyBvbiB0aGUgY2xpZW50LXNpZGUgY2hhbmdlcyB0byB5b3VyIHBhZ2UgaW4gb3JkZXIgdG8gc2V0IHRoZSB2aWV3IHRpdGxlIDxlbT53b3VsZG4mIzM5O3QgYmUgcHJvZ3Jlc3NpdmU8L2VtPiwgYW5kIHRodXMgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+aXQgd291bGQgYmUgcmVhbGx5LCA8ZW0+cmVhbGx5PC9lbT4gYmFkPC9hPi4gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgbGF5b3V0IHRvIHVzZSB3aGF0ZXZlciA8Y29kZT50aXRsZTwvY29kZT4gaGFzIGJlZW4gcGFzc2VkIHRvIHRoZSBtb2RlbC4gSW4gZmFjdCwgbGV0JiMzOTtzIGdvIGJhY2sgdG8gdGhlIGRyYXdpbmcgYm9hcmQgYW5kIG1ha2UgdGhlIGxheW91dCBpbnRvIGEgSmFkZSB0ZW1wbGF0ZSE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+cm0gbGF5b3V0LmpzXFxudG91Y2ggdmlld3MvbGF5b3V0LmphZGVcXG5qYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuPC9jb2RlPjwvcHJlPlxcbjxwPllvdSBzaG91bGQgYWxzbyByZW1lbWJlciB0byB1cGRhdGUgdGhlIDxjb2RlPmFwcC5qczwvY29kZT4gbW9kdWxlIG9uY2UgYWdhaW4hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspLFxcbiAgbGF5b3V0OiByZXF1aXJlKCYjMzk7Li8uYmluL3ZpZXdzL2xheW91dCYjMzk7KVxcbn07XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPiE9PC9jb2RlPiBzeW50YXggYmVsb3cgbWVhbnMgdGhhdCB3aGF0ZXZlciBpcyBpbiB0aGUgdmFsdWUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgd29uJiMzOTt0IGJlIGVzY2FwZWQuIFRoYXQmIzM5O3Mgb2theSBiZWNhdXNlIDxjb2RlPnBhcnRpYWw8L2NvZGU+IGlzIGEgdmlldyB3aGVyZSBKYWRlIGVzY2FwZWQgYW55dGhpbmcgdGhhdCBuZWVkZWQgZXNjYXBpbmcsIGJ1dCB3ZSB3b3VsZG4mIzM5O3Qgd2FudCBIVE1MIHRhZ3MgdG8gYmUgZXNjYXBlZCE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj50aXRsZT1tb2RlbC50aXRsZVxcbm1haW4hPXBhcnRpYWxcXG48L2NvZGU+PC9wcmU+XFxuPHA+QnkgdGhlIHdheSwgZGlkIHlvdSBrbm93IHRoYXQgPGNvZGU+Jmx0O2h0bWwmZ3Q7PC9jb2RlPiwgPGNvZGU+Jmx0O2hlYWQmZ3Q7PC9jb2RlPiwgYW5kIDxjb2RlPiZsdDtib2R5Jmd0OzwvY29kZT4gYXJlIGFsbCBvcHRpb25hbCBpbiBIVE1MIDUsIGFuZCB0aGF0IHlvdSBjYW4gc2FmZWx5IG9taXQgdGhlbSBpbiB5b3VyIEhUTUw/IE9mIGNvdXJzZSwgcmVuZGVyaW5nIGVuZ2luZXMgd2lsbCBzdGlsbCBpbnNlcnQgdGhvc2UgZWxlbWVudHMgYXV0b21hdGljYWxseSBpbnRvIHRoZSBET00gZm9yIHlvdSEgPGVtPkhvdyBjb29sIGlzIHRoYXQ/PC9lbT48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9OdkVXeDl6LnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5Zb3UgY2FuIG5vdyB2aXNpdCA8Y29kZT5sb2NhbGhvc3Q6MzAwMDwvY29kZT4gd2l0aCB5b3VyIGZhdm9yaXRlIHdlYiBicm93c2VyIGFuZCB5b3UmIzM5O2xsIG5vdGljZSB0aGF0IHRoZSB2aWV3IHJlbmRlcnMgYXMgeW91JiMzOTtkIGV4cGVjdC4gVGhlIHRpdGxlIHdpbGwgYmUgcHJvcGVybHkgc2V0LCBhbmQgYSA8Y29kZT4mbHQ7bWFpbiZndDs8L2NvZGU+IGVsZW1lbnQgd2lsbCBoYXZlIHRoZSBjb250ZW50cyBvZiB5b3VyIHZpZXcuPC9wPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vTGdaUkZuNS5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGFwcGxpY2F0aW9uIHJ1bm5pbmcgb24gR29vZ2xlIENocm9tZVxcXCI+PC9wPlxcbjxwPlRoYXQmIzM5O3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUmIzM5O3Mgbm90aGluZyBzdG9wcGluZyB5b3UgZnJvbSBhZGRpbmcgZGF0YWJhc2UgY2FsbHMgdG8gZmV0Y2ggYml0cyBhbmQgcGllY2VzIG9mIHRoZSBtb2RlbCBiZWZvcmUgaW52b2tpbmcgPGNvZGU+bmV4dDwvY29kZT4gdG8gcmVuZGVyIHRoZSB2aWV3LjwvcD5cXG48cD5UaGVuIHRoZXJlJiMzOTtzIGFsc28gdGhlIGNsaWVudC1zaWRlIGFzcGVjdCBvZiBzZXR0aW5nIHVwIFRhdW51cy4gTGV0JiMzOTtzIHNldCBpdCB1cCBhbmQgc2VlIGhvdyBpdCBvcGVucyB1cCBvdXIgcG9zc2liaWxpdGllcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0YXVudXMtaW4tdGhlLWNsaWVudFxcXCI+VGF1bnVzIGluIHRoZSBjbGllbnQ8L2gxPlxcbjxwPllvdSBhbHJlYWR5IGtub3cgaG93IHRvIHNldCB1cCB0aGUgYmFzaWNzIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmcsIGFuZCB5b3Uga25vdyB0aGF0IHlvdSBzaG91bGQgPGEgaHJlZj1cXFwiL2FwaVxcXCI+Y2hlY2sgb3V0IHRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4gdG8gZ2V0IGEgbW9yZSB0aG9yb3VnaCB1bmRlcnN0YW5kaW5nIG9mIHRoZSBwdWJsaWMgaW50ZXJmYWNlIG9uIFRhdW51cywgYW5kIHdoYXQgaXQgZW5hYmxlcyB5b3UgdG8gZG8uPC9wPlxcbjxwPlRoZSB3YXkgVGF1bnVzIHdvcmtzIG9uIHRoZSBjbGllbnQtc2lkZSBpcyBzbyB0aGF0IG9uY2UgeW91IHNldCBpdCB1cCwgaXQgd2lsbCBoaWphY2sgbGluayBjbGlja3MgYW5kIHVzZSBBSkFYIHRvIGZldGNoIG1vZGVscyBhbmQgcmVuZGVyIHRob3NlIHZpZXdzIGluIHRoZSBjbGllbnQuIElmIHRoZSBKYXZhU2NyaXB0IGNvZGUgZmFpbHMgdG8gbG9hZCwgPGVtPm9yIGlmIGl0IGhhc24mIzM5O3QgbG9hZGVkIHlldCBkdWUgdG8gYSBzbG93IGNvbm5lY3Rpb24gc3VjaCBhcyB0aG9zZSBpbiB1bnN0YWJsZSBtb2JpbGUgbmV0d29ya3M8L2VtPiwgdGhlIHJlZ3VsYXIgbGluayB3b3VsZCBiZSBmb2xsb3dlZCBpbnN0ZWFkIGFuZCBubyBoYXJtIHdvdWxkIGJlIHVubGVhc2hlZCB1cG9uIHRoZSBodW1hbiwgZXhjZXB0IHRoZXkgd291bGQgZ2V0IGEgc2xpZ2h0bHkgbGVzcyBmYW5jeSBleHBlcmllbmNlLjwvcD5cXG48cD5TZXR0aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBpbnZvbHZlcyBhIGZldyBkaWZmZXJlbnQgc3RlcHMuIEZpcnN0bHksIHdlJiMzOTtsbCBoYXZlIHRvIGNvbXBpbGUgdGhlIGFwcGxpY2F0aW9uJiMzOTtzIHdpcmluZyA8ZW0+KHRoZSByb3V0ZXMgYW5kIEphdmFTY3JpcHQgdmlldyBmdW5jdGlvbnMpPC9lbT4gaW50byBzb21ldGhpbmcgdGhlIGJyb3dzZXIgdW5kZXJzdGFuZHMuIFRoZW4sIHlvdSYjMzk7bGwgaGF2ZSB0byBtb3VudCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlLCBwYXNzaW5nIHRoZSB3aXJpbmcgc28gdGhhdCBpdCBrbm93cyB3aGljaCByb3V0ZXMgaXQgc2hvdWxkIHJlc3BvbmQgdG8sIGFuZCB3aGljaCBvdGhlcnMgaXQgc2hvdWxkIG1lcmVseSBpZ25vcmUuIE9uY2UgdGhhdCYjMzk7cyBvdXQgb2YgdGhlIHdheSwgY2xpZW50LXNpZGUgcm91dGluZyB3b3VsZCBiZSBzZXQgdXAuPC9wPlxcbjxwPkFzIHN1Z2FyIGNvYXRpbmcgb24gdG9wIG9mIHRoYXQsIHlvdSBtYXkgYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdXNpbmcgY29udHJvbGxlcnMuIFRoZXNlIGNvbnRyb2xsZXJzIHdvdWxkIGJlIGV4ZWN1dGVkIGV2ZW4gaWYgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS4gVGhleSBjYW4gYWNjZXNzIHRoZSBUYXVudXMgQVBJIGRpcmVjdGx5LCBpbiBjYXNlIHlvdSBuZWVkIHRvIG5hdmlnYXRlIHRvIGFub3RoZXIgdmlldyBpbiBzb21lIHdheSBvdGhlciB0aGFuIGJ5IGhhdmluZyBodW1hbnMgY2xpY2sgb24gYW5jaG9yIHRhZ3MuIFRoZSBBUEksIGFzIHlvdSYjMzk7bGwgbGVhcm4sIHdpbGwgYWxzbyBsZXQgeW91IHJlbmRlciBwYXJ0aWFsIHZpZXdzIHVzaW5nIHRoZSBwb3dlcmZ1bCBUYXVudXMgZW5naW5lLCBsaXN0ZW4gZm9yIGV2ZW50cyB0aGF0IG1heSBvY2N1ciBhdCBrZXkgc3RhZ2VzIG9mIHRoZSB2aWV3LXJlbmRlcmluZyBwcm9jZXNzLCBhbmQgZXZlbiBpbnRlcmNlcHQgQUpBWCByZXF1ZXN0cyBibG9ja2luZyB0aGVtIGJlZm9yZSB0aGV5IGV2ZXIgaGFwcGVuLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS10YXVudXMtY2xpXFxcIj5Vc2luZyB0aGUgVGF1bnVzIENMSTwvaDQ+XFxuPHA+VGF1bnVzIGNvbWVzIHdpdGggYSBDTEkgdGhhdCBjYW4gYmUgdXNlZCB0byB3aXJlIHlvdXIgTm9kZS5qcyByb3V0ZXMgYW5kIHZpZXdzIGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGUgc2FtZSBDTEkgY2FuIGJlIHVzZWQgdG8gd2lyZSB1cCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXMgd2VsbC4gVGhlIG1haW4gcmVhc29uIHdoeSB0aGUgVGF1bnVzIENMSSBleGlzdHMgaXMgc28gdGhhdCB5b3UgZG9uJiMzOTt0IGhhdmUgdG8gPGNvZGU+cmVxdWlyZTwvY29kZT4gZXZlcnkgc2luZ2xlIHZpZXcgYW5kIGNvbnRyb2xsZXIsIHVuZG9pbmcgYSBsb3Qgb2YgdGhlIHdvcmsgdGhhdCB3YXMgcHV0IGludG8gY29kZSByZXVzZS4gSnVzdCBsaWtlIHdlIGRpZCB3aXRoIDxjb2RlPmphZHVtPC9jb2RlPiBlYXJsaWVyLCB3ZSYjMzk7bGwgaW5zdGFsbCB0aGUgPGNvZGU+dGF1bnVzPC9jb2RlPiBDTEkgZ2xvYmFsbHkgZm9yIHRoZSBzYWtlIG9mIGV4ZXJjaXNpbmcsIGJ1dCB3ZSB1bmRlcnN0YW5kIHRoYXQgcmVseWluZyBvbiBnbG9iYWxseSBpbnN0YWxsZWQgbW9kdWxlcyBpcyBpbnN1ZmZpY2llbnQgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgYXBwbGljYXRpb25zLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLWdsb2JhbCB0YXVudXNcXG48L2NvZGU+PC9wcmU+XFxuPHA+QmVmb3JlIHlvdSBjYW4gdXNlIHRoZSBDTEksIHlvdSBzaG91bGQgbW92ZSB0aGUgcm91dGUgZGVmaW5pdGlvbnMgdG8gPGNvZGU+Y29udHJvbGxlcnMvcm91dGVzLmpzPC9jb2RlPi4gVGhhdCYjMzk7cyB3aGVyZSBUYXVudXMgZXhwZWN0cyB0aGVtIHRvIGJlLiBJZiB5b3Ugd2FudCB0byBwbGFjZSB0aGVtIHNvbWV0aGluZyBlbHNlLCA8YSBocmVmPVxcXCIvYXBpXFxcIj50aGUgQVBJIGRvY3VtZW50YXRpb24gY2FuIGhlbHAgeW91PC9hPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bXYgcm91dGVzLmpzIGNvbnRyb2xsZXJzL3JvdXRlcy5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5TaW5jZSB5b3UgbW92ZWQgdGhlIHJvdXRlcyB5b3Ugc2hvdWxkIGFsc28gdXBkYXRlIHRoZSA8Y29kZT5yZXF1aXJlPC9jb2RlPiBzdGF0ZW1lbnQgaW4gdGhlIDxjb2RlPmFwcC5qczwvY29kZT4gbW9kdWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL2NvbnRyb2xsZXJzL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vLmJpbi92aWV3cy9sYXlvdXQmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBDTEkgaXMgdGVyc2UgaW4gYm90aCBpdHMgaW5wdXRzIGFuZCBpdHMgb3V0cHV0cy4gSWYgeW91IHJ1biBpdCB3aXRob3V0IGFueSBhcmd1bWVudHMgaXQmIzM5O2xsIHByaW50IG91dCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGlmIHlvdSB3YW50IHRvIHBlcnNpc3QgaXQgeW91IHNob3VsZCBwcm92aWRlIHRoZSA8Y29kZT4tLW91dHB1dDwvY29kZT4gZmxhZy4gSW4gdHlwaWNhbCA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxcIj5jb252ZW50aW9uLW92ZXItY29uZmlndXJhdGlvbjwvYT4gZmFzaGlvbiwgdGhlIENMSSB3aWxsIGRlZmF1bHQgdG8gaW5mZXJyaW5nIHlvdXIgdmlld3MgYXJlIGxvY2F0ZWQgaW4gPGNvZGU+LmJpbi92aWV3czwvY29kZT4gYW5kIHRoYXQgeW91IHdhbnQgdGhlIHdpcmluZyBtb2R1bGUgdG8gYmUgcGxhY2VkIGluIDxjb2RlPi5iaW4vd2lyaW5nLmpzPC9jb2RlPiwgYnV0IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBjaGFuZ2UgdGhhdCBpZiBpdCBkb2VzbiYjMzk7dCBtZWV0IHlvdXIgbmVlZHMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dFxcbjwvY29kZT48L3ByZT5cXG48cD5BdCB0aGlzIHBvaW50IGluIG91ciBleGFtcGxlLCB0aGUgQ0xJIHNob3VsZCBjcmVhdGUgYSA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4gZmlsZSB3aXRoIHRoZSBjb250ZW50cyBkZXRhaWxlZCBiZWxvdy4gQXMgeW91IGNhbiBzZWUsIGV2ZW4gaWYgPGNvZGU+dGF1bnVzPC9jb2RlPiBpcyBhbiBhdXRvbWF0ZWQgY29kZS1nZW5lcmF0aW9uIHRvb2wsIGl0JiMzOTtzIG91dHB1dCBpcyBhcyBodW1hbiByZWFkYWJsZSBhcyBhbnkgb3RoZXIgbW9kdWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGVtcGxhdGVzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuL3ZpZXdzL2hvbWUvaW5kZXguanMmIzM5OyksXFxuICAmIzM5O2xheW91dCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9sYXlvdXQuanMmIzM5OylcXG59O1xcblxcbnZhciBjb250cm9sbGVycyA9IHtcXG59O1xcblxcbnZhciByb3V0ZXMgPSBbXFxuICB7XFxuICAgIHJvdXRlOiAmIzM5Oy8mIzM5OyxcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbl07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9mSUVlNVRtLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYHRhdW51c2Agb3V0cHV0XFxcIj48L3A+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5jb250cm9sbGVyczwvY29kZT4gb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJiMzOTt0IGNyZWF0ZWQgYW55IDxlbT5jbGllbnQtc2lkZSBjb250cm9sbGVyczwvZW0+IHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJiMzOTt0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+PHN0cm9uZz5UaGUgQ0xJIGNhbiBiZSBlbnRpcmVseSBpZ25vcmVkPC9zdHJvbmc+LiBZb3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhlIHdpcmluZyBtb2R1bGUgd2hlbmV2ZXIgeW91IGFkZCwgY2hhbmdlLCBvciByZW1vdmUgYSB2aWV3LCBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIsIG9yIGEgcm91dGUuIERvaW5nIHRoYXQgd291bGQgYmUgY3VtYmVyc29tZSwgYW5kIHRoZSBDTEkgc29sdmVzIHRoYXQgcHJvYmxlbSBmb3IgdXMgYXQgdGhlIGV4cGVuc2Ugb2Ygb25lIGFkZGl0aW9uYWwgYnVpbGQgc3RlcC48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPkR1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgPGNvZGU+LS13YXRjaDwvY29kZT4gZmxhZywgd2hpY2ggd2lsbCByZWJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIGlmIGEgcmVsZXZhbnQgZmlsZSBjaGFuZ2VzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXQgLS13YXRjaFxcbjwvY29kZT48L3ByZT5cXG48cD5JZiB5b3UmIzM5O3JlIHVzaW5nIEhhcGkgaW5zdGVhZCBvZiBFeHByZXNzLCB5b3UmIzM5O2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSA8Y29kZT5oYXBpaWZ5PC9jb2RlPiB0cmFuc2Zvcm0gc28gdGhhdCByb3V0ZXMgZ2V0IGNvbnZlcnRlZCBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGluZyBtb2R1bGUgdW5kZXJzdGFuZC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0tdHJhbnNmb3JtIGhhcGlpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm93IHRoYXQgeW91IHVuZGVyc3RhbmQgaG93IHRvIHVzZSB0aGUgQ0xJIG9yIGJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIG9uIHlvdXIgb3duLCBib290aW5nIHVwIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgd2lsbCBiZSBhbiBlYXN5IHRoaW5nIHRvIGRvITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImJvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9oND5cXG48cD5PbmNlIHdlIGhhdmUgdGhlIHdpcmluZyBtb2R1bGUsIGJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGVuZ2luZSBpcyBwcmV0dHkgZWFzeS4gVGF1bnVzIHN1Z2dlc3RzIHlvdSB1c2UgPGNvZGU+Y2xpZW50L2pzPC9jb2RlPiB0byBrZWVwIGFsbCBvZiB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgbG9naWMsIGJ1dCB0aGF0IGlzIHVwIHRvIHlvdSB0b28uIEZvciB0aGUgc2FrZSBvZiB0aGlzIGd1aWRlLCBsZXQmIzM5O3Mgc3RpY2sgdG8gdGhlIGNvbnZlbnRpb25zLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCBjbGllbnQvanNcXG50b3VjaCBjbGllbnQvanMvbWFpbi5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgPGNvZGU+bWFpbjwvY29kZT4gbW9kdWxlIHdpbGwgYmUgdXNlZCBhcyB0aGUgPGVtPmVudHJ5IHBvaW50PC9lbT4gb2YgeW91ciBhcHBsaWNhdGlvbiBvbiB0aGUgY2xpZW50LXNpZGUuIEhlcmUgeW91JiMzOTtsbCBuZWVkIHRvIGltcG9ydCA8Y29kZT50YXVudXM8L2NvZGU+LCB0aGUgd2lyaW5nIG1vZHVsZSB3ZSYjMzk7dmUganVzdCBidWlsdCwgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBET00gZWxlbWVudCB3aGVyZSB5b3UgYXJlIHJlbmRlcmluZyB5b3VyIHBhcnRpYWwgdmlld3MuIE9uY2UgeW91IGhhdmUgYWxsIHRoYXQsIHlvdSBjYW4gaW52b2tlIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB3aXJpbmcgPSByZXF1aXJlKCYjMzk7Li4vLi4vLmJpbi93aXJpbmcmIzM5Oyk7XFxudmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgmIzM5O21haW4mIzM5OylbMF07XFxuXFxudGF1bnVzLm1vdW50KG1haW4sIHdpcmluZyk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBtb3VudHBvaW50IHdpbGwgc2V0IHVwIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgcm91dGVyIGFuZCBmaXJlIHRoZSBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXIgZm9yIHRoZSB2aWV3IHRoYXQgaGFzIGJlZW4gcmVuZGVyZWQgaW4gdGhlIHNlcnZlci1zaWRlLiBXaGVuZXZlciBhbiBhbmNob3IgbGluayBpcyBjbGlja2VkLCBUYXVudXMgd2lsbCBiZSBhYmxlIHRvIGhpamFjayB0aGF0IGNsaWNrIGFuZCByZXF1ZXN0IHRoZSBtb2RlbCB1c2luZyBBSkFYLCBidXQgb25seSBpZiBpdCBtYXRjaGVzIGEgdmlldyByb3V0ZS4gT3RoZXJ3aXNlIHRoZSBsaW5rIHdpbGwgYmVoYXZlIGp1c3QgbGlrZSBhbnkgbm9ybWFsIGxpbmsgd291bGQuPC9wPlxcbjxwPkJ5IGRlZmF1bHQsIHRoZSBtb3VudHBvaW50IHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldy4gVGhpcyBpcyBha2luIHRvIHdoYXQgZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBmcmFtZXdvcmtzIHN1Y2ggYXMgQW5ndWxhckpTIGRvLCB3aGVyZSB2aWV3cyBhcmUgb25seSByZW5kZXJlZCBhZnRlciBhbGwgdGhlIEphdmFTY3JpcHQgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBhbmQgZXhlY3V0ZWQuIEV4Y2VwdCBUYXVudXMgcHJvdmlkZXMgaHVtYW4tcmVhZGFibGUgY29udGVudCBmYXN0ZXIsIGJlZm9yZSB0aGUgSmF2YVNjcmlwdCBldmVuIGJlZ2lucyBkb3dubG9hZGluZywgYWx0aG91Z2ggaXQgd29uJiMzOTt0IGJlIGZ1bmN0aW9uYWwgdW50aWwgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgcnVucy48L3A+XFxuPHA+QW4gYWx0ZXJuYXRpdmUgaXMgdG8gaW5saW5lIHRoZSB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmlld3MgaW4gYSA8Y29kZT4mbHQ7c2NyaXB0IHR5cGU9JiMzOTt0ZXh0L3RhdW51cyYjMzk7Jmd0OzwvY29kZT4gdGFnLCBidXQgdGhpcyB0ZW5kcyB0byBzbG93IGRvd24gdGhlIGluaXRpYWwgcmVzcG9uc2UgKG1vZGVscyBhcmUgPGVtPnR5cGljYWxseSBsYXJnZXI8L2VtPiB0aGFuIHRoZSByZXN1bHRpbmcgdmlld3MpLjwvcD5cXG48cD5BIHRoaXJkIHN0cmF0ZWd5IGlzIHRoYXQgeW91IHJlcXVlc3QgdGhlIG1vZGVsIGFzeW5jaHJvbm91c2x5IG91dHNpZGUgb2YgVGF1bnVzLCBhbGxvd2luZyB5b3UgdG8gZmV0Y2ggYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGl0c2VsZiBjb25jdXJyZW50bHksIGJ1dCB0aGF0JiMzOTtzIGhhcmRlciB0byBzZXQgdXAuPC9wPlxcbjxwPlRoZSB0aHJlZSBib290aW5nIHN0cmF0ZWdpZXMgYXJlIGV4cGxhaW5lZCBpbiA8YSBocmVmPVxcXCIvYXBpXFxcIj50aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IGFuZCBmdXJ0aGVyIGRpc2N1c3NlZCBpbiA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPnRoZSBvcHRpbWl6YXRpb24gZ3VpZGU8L2E+LiBGb3Igbm93LCB0aGUgZGVmYXVsdCBzdHJhdGVneSA8ZW0+KDxjb2RlPiYjMzk7YXV0byYjMzk7PC9jb2RlPik8L2VtPiBzaG91bGQgc3VmZmljZS4gSXQgZmV0Y2hlcyB0aGUgdmlldyBtb2RlbCB1c2luZyBhbiBBSkFYIHJlcXVlc3QgcmlnaHQgYWZ0ZXIgVGF1bnVzIGxvYWRzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImFkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlclxcXCI+QWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyPC9oND5cXG48cD5DbGllbnQtc2lkZSBjb250cm9sbGVycyBydW4gd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLCBldmVuIGlmIGl0JiMzOTtzIGEgcGFydGlhbC4gVGhlIGNvbnRyb2xsZXIgaXMgcGFzc2VkIHRoZSA8Y29kZT5tb2RlbDwvY29kZT4sIGNvbnRhaW5pbmcgdGhlIG1vZGVsIHRoYXQgd2FzIHVzZWQgdG8gcmVuZGVyIHRoZSB2aWV3OyB0aGUgPGNvZGU+cm91dGU8L2NvZGU+LCBicm9rZW4gZG93biBpbnRvIGl0cyBjb21wb25lbnRzOyBhbmQgdGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4sIHdoaWNoIGlzIHdoYXRldmVyIERPTSBlbGVtZW50IHRoZSB2aWV3IHdhcyByZW5kZXJlZCBpbnRvLjwvcD5cXG48cD5UaGVzZSBjb250cm9sbGVycyBhcmUgZW50aXJlbHkgb3B0aW9uYWwsIHdoaWNoIG1ha2VzIHNlbnNlIHNpbmNlIHdlJiMzOTtyZSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2luZyB0aGUgYXBwbGljYXRpb246IGl0IG1pZ2h0IG5vdCBldmVuIGJlIG5lY2Vzc2FyeSEgTGV0JiMzOTtzIGFkZCBzb21lIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gdGhlIGV4YW1wbGUgd2UmIzM5O3ZlIGJlZW4gYnVpbGRpbmcuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm1rZGlyIC1wIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lXFxudG91Y2ggY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+R3Vlc3Mgd2hhdD8gVGhlIGNvbnRyb2xsZXIgc2hvdWxkIGJlIGEgbW9kdWxlIHdoaWNoIGV4cG9ydHMgYSBmdW5jdGlvbi4gVGhhdCBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aGVuZXZlciB0aGUgdmlldyBpcyByZW5kZXJlZC4gRm9yIHRoZSBzYWtlIG9mIHNpbXBsaWNpdHkgd2UmIzM5O2xsIGp1c3QgcHJpbnQgdGhlIGFjdGlvbiBhbmQgdGhlIG1vZGVsIHRvIHRoZSBjb25zb2xlLiBJZiB0aGVyZSYjMzk7cyBvbmUgcGxhY2Ugd2hlcmUgeW91JiMzOTtkIHdhbnQgdG8gZW5oYW5jZSB0aGUgZXhwZXJpZW5jZSwgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIHdoZXJlIHlvdSB3YW50IHRvIHB1dCB5b3VyIGNvZGUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsLCBjb250YWluZXIsIHJvdXRlKSB7XFxuICBjb25zb2xlLmxvZygmIzM5O1JlbmRlcmVkIHZpZXcgJXMgdXNpbmcgbW9kZWw6XFxcXG4lcyYjMzk7LCByb3V0ZS5hY3Rpb24sIEpTT04uc3RyaW5naWZ5KG1vZGVsLCBudWxsLCAyKSk7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2Ugd2Ugd2VyZW4mIzM5O3QgdXNpbmcgdGhlIDxjb2RlPi0td2F0Y2g8L2NvZGU+IGZsYWcgZnJvbSB0aGUgVGF1bnVzIENMSSwgeW91JiMzOTtsbCBoYXZlIHRvIHJlY29tcGlsZSB0aGUgd2lyaW5nIGF0IHRoaXMgcG9pbnQsIHNvIHRoYXQgdGhlIGNvbnRyb2xsZXIgZ2V0cyBhZGRlZCB0byB0aGF0IG1hbmlmZXN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXRcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCB5b3UmIzM5O2xsIG5vdyBoYXZlIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgdXNpbmcgPGEgaHJlZj1cXFwiaHR0cDovL2Jyb3dzZXJpZnkub3JnL1xcXCI+QnJvd3NlcmlmeTwvYT4hPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY29tcGlsaW5nLXlvdXItY2xpZW50LXNpZGUtamF2YXNjcmlwdFxcXCI+Q29tcGlsaW5nIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdDwvaDQ+XFxuPHA+WW91JiMzOTtsbCBuZWVkIHRvIGNvbXBpbGUgdGhlIDxjb2RlPmNsaWVudC9qcy9tYWluLmpzPC9jb2RlPiBtb2R1bGUsIG91ciBjbGllbnQtc2lkZSBhcHBsaWNhdGlvbiYjMzk7cyBlbnRyeSBwb2ludCwgdXNpbmcgQnJvd3NlcmlmeSBzaW5jZSB0aGUgY29kZSBpcyB3cml0dGVuIHVzaW5nIENvbW1vbkpTLiBJbiB0aGlzIGV4YW1wbGUgeW91JiMzOTtsbCBpbnN0YWxsIDxjb2RlPmJyb3dzZXJpZnk8L2NvZGU+IGdsb2JhbGx5IHRvIGNvbXBpbGUgdGhlIGNvZGUsIGJ1dCBuYXR1cmFsbHkgeW91JiMzOTtsbCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB3b3JraW5nIG9uIGEgcmVhbC13b3JsZCBhcHBsaWNhdGlvbi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgLS1nbG9iYWwgYnJvd3NlcmlmeVxcbjwvY29kZT48L3ByZT5cXG48cD5PbmNlIHlvdSBoYXZlIHRoZSBCcm93c2VyaWZ5IENMSSwgeW91JiMzOTtsbCBiZSBhYmxlIHRvIGNvbXBpbGUgdGhlIGNvZGUgcmlnaHQgZnJvbSB5b3VyIGNvbW1hbmQgbGluZS4gVGhlIDxjb2RlPi1kPC9jb2RlPiBmbGFnIHRlbGxzIEJyb3dzZXJpZnkgdG8gYWRkIGFuIGlubGluZSBzb3VyY2UgbWFwIGludG8gdGhlIGNvbXBpbGVkIGJ1bmRsZSwgbWFraW5nIGRlYnVnZ2luZyBlYXNpZXIgZm9yIHVzLiBUaGUgPGNvZGU+LW88L2NvZGU+IGZsYWcgcmVkaXJlY3RzIG91dHB1dCB0byB0aGUgaW5kaWNhdGVkIGZpbGUsIHdoZXJlYXMgdGhlIG91dHB1dCBpcyBwcmludGVkIHRvIHN0YW5kYXJkIG91dHB1dCBieSBkZWZhdWx0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCAuYmluL3B1YmxpYy9qc1xcbmJyb3dzZXJpZnkgY2xpZW50L2pzL21haW4uanMgLWRvIC5iaW4vcHVibGljL2pzL2FsbC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5XZSBoYXZlbiYjMzk7dCBkb25lIG11Y2ggb2YgYW55dGhpbmcgd2l0aCB0aGUgRXhwcmVzcyBhcHBsaWNhdGlvbiwgc28geW91JiMzOTtsbCBuZWVkIHRvIGFkanVzdCB0aGUgPGNvZGU+YXBwLmpzPC9jb2RlPiBtb2R1bGUgdG8gc2VydmUgc3RhdGljIGFzc2V0cy4gSWYgeW91JiMzOTtyZSB1c2VkIHRvIEV4cHJlc3MsIHlvdSYjMzk7bGwgbm90aWNlIHRoZXJlJiMzOTtzIG5vdGhpbmcgc3BlY2lhbCBhYm91dCBob3cgd2UmIzM5O3JlIHVzaW5nIDxjb2RlPnNlcnZlLXN0YXRpYzwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC0tc2F2ZSBzZXJ2ZS1zdGF0aWNcXG48L2NvZGU+PC9wcmU+XFxuPHA+TGV0JiMzOTtzIGNvbmZpZ3VyZSB0aGUgYXBwbGljYXRpb24gdG8gc2VydmUgc3RhdGljIGFzc2V0cyBmcm9tIDxjb2RlPi5iaW4vcHVibGljPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgc2VydmVTdGF0aWMgPSByZXF1aXJlKCYjMzk7c2VydmUtc3RhdGljJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL2NvbnRyb2xsZXJzL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vLmJpbi92aWV3cy9sYXlvdXQmIzM5OylcXG59O1xcblxcbmFwcC51c2Uoc2VydmVTdGF0aWMoJiMzOTsuYmluL3B1YmxpYyYjMzk7KSk7XFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+TmV4dCB1cCwgeW91JiMzOTtsbCBoYXZlIHRvIGVkaXQgdGhlIGxheW91dCB0byBpbmNsdWRlIHRoZSBjb21waWxlZCBKYXZhU2NyaXB0IGJ1bmRsZSBmaWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWphZGVcXFwiPnRpdGxlPW1vZGVsLnRpdGxlXFxubWFpbiE9cGFydGlhbFxcbnNjcmlwdChzcmM9JiMzOTsvanMvYWxsLmpzJiMzOTspXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxhc3RseSwgeW91IGNhbiBleGVjdXRlIHRoZSBhcHBsaWNhdGlvbiBhbmQgc2VlIGl0IGluIGFjdGlvbiE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS82OE84NHdYLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5JZiB5b3Ugb3BlbiB0aGUgYXBwbGljYXRpb24gb24gYSB3ZWIgYnJvd3NlciwgeW91JiMzOTtsbCBub3RpY2UgdGhhdCB0aGUgYXBwcm9wcmlhdGUgaW5mb3JtYXRpb24gd2lsbCBiZSBsb2dnZWQgaW50byB0aGUgZGV2ZWxvcGVyIDxjb2RlPmNvbnNvbGU8L2NvZGU+LjwvcD5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL1pVRjZORmwucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCB0aGUgYXBwbGljYXRpb24gcnVubmluZyB1bmRlciBHb29nbGUgQ2hyb21lXFxcIj48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtY2xpZW50LXNpZGUtdGF1bnVzLWFwaVxcXCI+VXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUEk8L2g0PlxcbjxwPlRhdW51cyBkb2VzIHByb3ZpZGUgPGEgaHJlZj1cXFwiL2FwaVxcXCI+YSB0aGluIEFQSTwvYT4gaW4gdGhlIGNsaWVudC1zaWRlLiBVc2FnZSBvZiB0aGF0IEFQSSBiZWxvbmdzIG1vc3RseSBpbnNpZGUgdGhlIGJvZHkgb2YgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVycywgYnV0IHRoZXJlJiMzOTtzIGEgZmV3IG1ldGhvZHMgeW91IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBvbiBhIGdsb2JhbCBzY2FsZSBhcyB3ZWxsLjwvcD5cXG48cD5UYXVudXMgY2FuIG5vdGlmeSB5b3Ugd2hlbmV2ZXIgaW1wb3J0YW50IGV2ZW50cyBvY2N1ci48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPkV2ZW50PC90aD5cXG48dGg+QXJndW1lbnRzPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3N0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW4gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBmaW5pc2hlZCB0aGUgcm91dGUgc2V0dXAgYW5kIGlzIGFib3V0IHRvIGludm9rZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlci4gU3Vic2NyaWJlIHRvIHRoaXMgZXZlbnQgYmVmb3JlIGNhbGxpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3JlbmRlciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+QSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWQ8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLnN0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5kb25lJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGRhdGE8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmFib3J0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmVycm9yJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGVycjwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci48L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPkJlc2lkZXMgZXZlbnRzLCB0aGVyZSYjMzk7cyBhIGNvdXBsZSBtb3JlIG1ldGhvZHMgeW91IGNhbiB1c2UuIFRoZSA8Y29kZT50YXVudXMubmF2aWdhdGU8L2NvZGU+IG1ldGhvZCBhbGxvd3MgeW91IHRvIG5hdmlnYXRlIHRvIGEgVVJMIHdpdGhvdXQgdGhlIG5lZWQgZm9yIGEgaHVtYW4gdG8gY2xpY2sgb24gYW4gYW5jaG9yIGxpbmsuIFRoZW4gdGhlcmUmIzM5O3MgPGNvZGU+dGF1bnVzLnBhcnRpYWw8L2NvZGU+LCBhbmQgdGhhdCBhbGxvd3MgeW91IHRvIHJlbmRlciBhbnkgcGFydGlhbCB2aWV3IG9uIGEgRE9NIGVsZW1lbnQgb2YgeW91ciBjaG9vc2luZywgYW5kIGl0JiMzOTtsbCB0aGVuIGludm9rZSBpdHMgY29udHJvbGxlci4gWW91JiMzOTtsbCBuZWVkIHRvIGNvbWUgdXAgd2l0aCB0aGUgbW9kZWwgeW91cnNlbGYsIHRob3VnaC48L3A+XFxuPHA+QXN0b25pc2hpbmdseSwgdGhlIEFQSSBpcyBmdXJ0aGVyIGRvY3VtZW50ZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2g0PlxcbjxwPjxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+UGVyZm9ybWFuY2U8L2E+IHBsYXlzIGFuIGltcG9ydGFudCByb2xlIGluIFRhdW51cy4gVGhhdCYjMzk7cyB3aHkgdGhlIHlvdSBjYW4gcGVyZm9ybSBjYWNoaW5nIGFuZCBwcmVmZXRjaGluZyBvbiB0aGUgY2xpZW50LXNpZGUganVzdCBieSB0dXJuaW5nIG9uIGEgcGFpciBvZiBmbGFncy4gQnV0IHdoYXQgZG8gdGhlc2UgZmxhZ3MgZG8gZXhhY3RseT88L3A+XFxuPHA+V2hlbiB0dXJuZWQgb24sIGJ5IHBhc3NpbmcgPGNvZGU+eyBjYWNoZTogdHJ1ZSB9PC9jb2RlPiBhcyB0aGUgdGhpcmQgcGFyYW1ldGVyIGZvciA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LCB0aGUgY2FjaGluZyBsYXllciB3aWxsIG1ha2Ugc3VyZSB0aGF0IHJlc3BvbnNlcyBhcmUga2VwdCBhcm91bmQgZm9yIDxjb2RlPjE1PC9jb2RlPiBzZWNvbmRzLiBXaGVuZXZlciBhIHJvdXRlIG5lZWRzIGEgbW9kZWwgaW4gb3JkZXIgdG8gcmVuZGVyIGEgdmlldywgaXQmIzM5O2xsIGZpcnN0IGFzayB0aGUgY2FjaGluZyBsYXllciBmb3IgYSBmcmVzaCBjb3B5LiBJZiB0aGUgY2FjaGluZyBsYXllciBkb2VzbiYjMzk7dCBoYXZlIGEgY29weSwgb3IgaWYgdGhhdCBjb3B5IGlzIHN0YWxlIDxlbT4oaW4gdGhpcyBjYXNlLCBvbGRlciB0aGFuIDxjb2RlPjE1PC9jb2RlPiBzZWNvbmRzKTwvZW0+LCB0aGVuIGFuIEFKQVggcmVxdWVzdCB3aWxsIGJlIGlzc3VlZCB0byB0aGUgc2VydmVyLiBPZiBjb3Vyc2UsIHRoZSBkdXJhdGlvbiBpcyBjb25maWd1cmFibGUuIElmIHlvdSB3YW50IHRvIHVzZSBhIHZhbHVlIG90aGVyIHRoYW4gdGhlIGRlZmF1bHQsIHlvdSBzaG91bGQgc2V0IDxjb2RlPmNhY2hlPC9jb2RlPiB0byBhIG51bWJlciBpbiBzZWNvbmRzIGluc3RlYWQgb2YganVzdCA8Y29kZT50cnVlPC9jb2RlPi48L3A+XFxuPHA+U2luY2UgVGF1bnVzIHVuZGVyc3RhbmRzIHRoYXQgbm90IGV2ZXJ5IHZpZXcgb3BlcmF0ZXMgdW5kZXIgdGhlIHNhbWUgY29uc3RyYWludHMsIHlvdSYjMzk7cmUgYWxzbyBhYmxlIHRvIHNldCBhIDxjb2RlPmNhY2hlPC9jb2RlPiBmcmVzaG5lc3MgZHVyYXRpb24gZGlyZWN0bHkgaW4geW91ciByb3V0ZXMuIFRoZSA8Y29kZT5jYWNoZTwvY29kZT4gcHJvcGVydHkgaW4gcm91dGVzIGhhcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGRlZmF1bHQgdmFsdWUuPC9wPlxcbjxwPlRoZXJlJiMzOTtzIGN1cnJlbnRseSB0d28gY2FjaGluZyBzdG9yZXM6IGEgcmF3IGluLW1lbW9yeSBzdG9yZSwgYW5kIGFuIDxhIGhyZWY9XFxcImh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxcIj5JbmRleGVkREI8L2E+IHN0b3JlLiBJbmRleGVkREIgaXMgYW4gZW1iZWRkZWQgZGF0YWJhc2Ugc29sdXRpb24sIGFuZCB5b3UgY2FuIHRoaW5rIG9mIGl0IGxpa2UgYW4gYXN5bmNocm9ub3VzIHZlcnNpb24gb2YgPGNvZGU+bG9jYWxTdG9yYWdlPC9jb2RlPi4gSXQgaGFzIDxhIGhyZWY9XFxcImh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXFwiPnN1cnByaXNpbmdseSBicm9hZCBicm93c2VyIHN1cHBvcnQ8L2E+LCBhbmQgaW4gdGhlIGNhc2VzIHdoZXJlIGl0JiMzOTtzIG5vdCBzdXBwb3J0ZWQgdGhlbiBjYWNoaW5nIGlzIGRvbmUgc29sZWx5IGluLW1lbW9yeS48L3A+XFxuPHA+VGhlIHByZWZldGNoaW5nIG1lY2hhbmlzbSBpcyBhbiBpbnRlcmVzdGluZyBzcGluLW9mZiBvZiBjYWNoaW5nLCBhbmQgaXQgcmVxdWlyZXMgY2FjaGluZyB0byBiZSBlbmFibGVkIGluIG9yZGVyIHRvIHdvcmsuIFdoZW5ldmVyIGh1bWFucyBob3ZlciBvdmVyIGEgbGluaywgb3Igd2hlbmV2ZXIgdGhleSBwdXQgdGhlaXIgZmluZ2VyIG9uIG9uZSBvZiB0aGVtIDxlbT4odGhlIDxjb2RlPnRvdWNoc3RhcnQ8L2NvZGU+IGV2ZW50KTwvZW0+LCB0aGUgcHJlZmV0Y2hlciB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgZm9yIHRoYXQgbGluay48L3A+XFxuPHA+SWYgdGhlIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkgdGhlbiB0aGUgcmVzcG9uc2Ugd2lsbCBiZSBjYWNoZWQgaW4gdGhlIHNhbWUgd2F5IGFueSBvdGhlciB2aWV3IHdvdWxkIGJlIGNhY2hlZC4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGFub3RoZXIgbGluayB3aGlsZSB0aGUgcHJldmlvdXMgb25lIGlzIHN0aWxsIGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhlIG9sZCByZXF1ZXN0IGlzIGFib3J0ZWQsIGFzIG5vdCB0byBkcmFpbiB0aGVpciA8ZW0+KHBvc3NpYmx5IGxpbWl0ZWQpPC9lbT4gSW50ZXJuZXQgY29ubmVjdGlvbiBiYW5kd2lkdGguPC9wPlxcbjxwPklmIHRoZSBodW1hbiBjbGlja3Mgb24gdGhlIGxpbmsgYmVmb3JlIHByZWZldGNoaW5nIGlzIGNvbXBsZXRlZCwgaGUmIzM5O2xsIG5hdmlnYXRlIHRvIHRoZSB2aWV3IGFzIHNvb24gYXMgcHJlZmV0Y2hpbmcgZW5kcywgcmF0aGVyIHRoYW4gZmlyaW5nIGFub3RoZXIgcmVxdWVzdC4gVGhpcyBoZWxwcyBUYXVudXMgc2F2ZSBwcmVjaW91cyBtaWxsaXNlY29uZHMgd2hlbiBkZWFsaW5nIHdpdGggbGF0ZW5jeS1zZW5zaXRpdmUgb3BlcmF0aW9ucy48L3A+XFxuPHA+VHVybmluZyBwcmVmZXRjaGluZyBvbiBpcyBzaW1wbHkgYSBtYXR0ZXIgb2Ygc2V0dGluZyA8Y29kZT5wcmVmZXRjaDwvY29kZT4gdG8gPGNvZGU+dHJ1ZTwvY29kZT4gaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uIEZvciBhZGRpdGlvbmFsIGluc2lnaHRzIGludG8gdGhlIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50cyBUYXVudXMgY2FuIG9mZmVyLCBoZWFkIG92ZXIgdG8gdGhlIDxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+UGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uczwvYT4gZ3VpZGUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidmVyc2lvbmluZ1xcXCI+VmVyc2lvbmluZzwvaDQ+XFxuPHA+V2hlbiB5b3UgYWx0ZXIgeW91ciB2aWV3cywgY2hhbmdlIGNvbnRyb2xsZXJzLCBvciBtb2RpZnkgdGhlIG1vZGVscywgY2hhbmNlcyBhcmUgdGhlIGNsaWVudC1zaWRlIGlzIGdvaW5nIHRvIGNvbWUgYWNyb3NzIG9uZSBvZiB0aGUgZm9sbG93aW5nIGlzc3Vlcy48L3A+XFxuPHVsPlxcbjxsaT5PdXRkYXRlZCB2aWV3IHRlbXBsYXRlIGZ1bmN0aW9ucyBpbiB0aGUgY2xpZW50LXNpZGUsIGNhdXNpbmcgbmV3IG1vZGVscyB0byBicmVhazwvbGk+XFxuPGxpPk91dGRhdGVkIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzLCBjYXVzaW5nIG5ldyBtb2RlbHMgdG8gYnJlYWsgb3IgbWlzcyBvdXQgb24gZnVuY3Rpb25hbGl0eTwvbGk+XFxuPGxpPk91dGRhdGVkIG1vZGVscyBpbiB0aGUgY2FjaGUsIGNhdXNpbmcgbmV3IHZpZXdzIG9yIGNvbnRyb2xsZXJzIHRvIGJyZWFrPC9saT5cXG48L3VsPlxcbjxwPlZlcnNpb25pbmcgaGFuZGxlcyB0aGVzZSBpc3N1ZXMgZ3JhY2VmdWxseSBvbiB5b3VyIGJlaGFsZi4gVGhlIHdheSBpdCB3b3JrcyBpcyB0aGF0IHdoZW5ldmVyIHlvdSBnZXQgYSByZXNwb25zZSBmcm9tIFRhdW51cywgYSA8ZW0+dmVyc2lvbiBzdHJpbmcgKGNvbmZpZ3VyZWQgb24gdGhlIHNlcnZlci1zaWRlKTwvZW0+IGlzIGluY2x1ZGVkIHdpdGggaXQuIElmIHRoYXQgdmVyc2lvbiBzdHJpbmcgZG9lc24mIzM5O3QgbWF0Y2ggdGhlIG9uZSBzdG9yZWQgaW4gdGhlIGNsaWVudCwgdGhlbiB0aGUgY2FjaGUgd2lsbCBiZSBmbHVzaGVkIGFuZCB0aGUgaHVtYW4gd2lsbCBiZSByZWRpcmVjdGVkLCBmb3JjaW5nIGEgZnVsbCBwYWdlIHJlbG9hZC48L3A+XFxuPGJsb2NrcXVvdGU+XFxuPHA+VGhlIHZlcnNpb25pbmcgQVBJIGlzIHVuYWJsZSB0byBoYW5kbGUgY2hhbmdlcyB0byByb3V0ZXMsIGFuZCBpdCYjMzk7cyB1cCB0byB5b3UgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIGFwcGxpY2F0aW9uIHN0YXlzIGJhY2t3YXJkcyBjb21wYXRpYmxlIHdoZW4gaXQgY29tZXMgdG8gcm91dGluZy48L3A+XFxuPHA+VmVyc2lvbmluZyBjYW4mIzM5O3QgaW50ZXJ2ZW5lIHdoZW4gdGhlIGNsaWVudC1zaWRlIGlzIGhlYXZpbHkgcmVseWluZyBvbiBjYWNoZWQgdmlld3MgYW5kIG1vZGVscywgYW5kIHRoZSBodW1hbiBpcyByZWZ1c2luZyB0byByZWxvYWQgdGhlaXIgYnJvd3Nlci4gVGhlIHNlcnZlciBpc24mIzM5O3QgYmVpbmcgYWNjZXNzZWQgYW5kIHRodXMgaXQgY2FuJiMzOTt0IGNvbW11bmljYXRlIHRoYXQgZXZlcnl0aGluZyBvbiB0aGUgY2FjaGUgbWF5IGhhdmUgYmVjb21lIHN0YWxlLiBUaGUgZ29vZCBuZXdzIGlzIHRoYXQgdGhlIGh1bWFuIHdvbiYjMzk7dCBub3RpY2UgYW55IG9kZGl0aWVzLCBhcyB0aGUgc2l0ZSB3aWxsIGNvbnRpbnVlIHRvIHdvcmsgYXMgaGUga25vd3MgaXQuIFdoZW4gaGUgZmluYWxseSBhdHRlbXB0cyB0byB2aXNpdCBzb21ldGhpbmcgdGhhdCBpc24mIzM5O3QgY2FjaGVkLCBhIHJlcXVlc3QgaXMgbWFkZSwgYW5kIHRoZSB2ZXJzaW9uaW5nIGVuZ2luZSByZXNvbHZlcyB2ZXJzaW9uIGRpc2NyZXBhbmNpZXMgZm9yIHRoZW0uPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5NYWtpbmcgdXNlIG9mIHZlcnNpb25pbmcgaW52b2x2ZXMgc2V0dGluZyB0aGUgPGNvZGU+dmVyc2lvbjwvY29kZT4gZmllbGQgaW4gdGhlIG9wdGlvbnMsIHdoZW4gaW52b2tpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiA8c3Ryb25nPm9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUsIHVzaW5nIHRoZSBzYW1lIHZhbHVlPC9zdHJvbmc+LiBUaGUgVGF1bnVzIHZlcnNpb24gc3RyaW5nIHdpbGwgYmUgYWRkZWQgdG8gdGhlIG9uZSB5b3UgcHJvdmlkZWQsIHNvIHRoYXQgVGF1bnVzIHdpbGwga25vdyB0byBzdGF5IGFsZXJ0IGZvciBjaGFuZ2VzIHRvIFRhdW51cyBpdHNlbGYsIGFzIHdlbGwuPC9wPlxcbjxwPllvdSBtYXkgdXNlIHlvdXIgYnVpbGQgaWRlbnRpZmllciBvciB0aGUgPGNvZGU+dmVyc2lvbjwvY29kZT4gZmllbGQgaW4gPGNvZGU+cGFja2FnZS5qc29uPC9jb2RlPiwgYnV0IHVuZGVyc3RhbmQgdGhhdCBpdCBtYXkgY2F1c2UgdGhlIGNsaWVudC1zaWRlIHRvIGZsdXNoIHRoZSBjYWNoZSB0b28gb2Z0ZW4gPGVtPihtYXliZSBldmVuIG9uIGV2ZXJ5IGRlcGxveW1lbnQpPC9lbT4uPC9wPlxcbjxwPlRoZSBkZWZhdWx0IHZlcnNpb24gc3RyaW5nIGlzIHNldCB0byA8Y29kZT4xPC9jb2RlPi4gVGhlIFRhdW51cyB2ZXJzaW9uIHdpbGwgYmUgcHJlcGVuZGVkIHRvIHlvdXJzLCByZXN1bHRpbmcgaW4gYSB2YWx1ZSBzdWNoIGFzIDxjb2RlPnQzLjAuMDt2MTwvY29kZT4gd2hlcmUgVGF1bnVzIGlzIHJ1bm5pbmcgdmVyc2lvbiA8Y29kZT4zLjAuMDwvY29kZT4gYW5kIHlvdXIgYXBwbGljYXRpb24gaXMgcnVubmluZyB2ZXJzaW9uIDxjb2RlPjE8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS1za3ktaXMtdGhlLWxpbWl0LVxcXCI+VGhlIHNreSBpcyB0aGUgbGltaXQhPC9oMT5cXG48cD5Zb3UmIzM5O3JlIG5vdyBmYW1pbGlhciB3aXRoIGhvdyBUYXVudXMgd29ya3Mgb24gYSBoaWdoLWxldmVsLiBZb3UgaGF2ZSBjb3ZlcmVkIGEgZGVjZW50IGFtb3VudCBvZiBncm91bmQsIGJ1dCB5b3Ugc2hvdWxkbiYjMzk7dCBzdG9wIHRoZXJlLjwvcD5cXG48dWw+XFxuPGxpPkxlYXJuIG1vcmUgYWJvdXQgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBUYXVudXMgaGFzPC9hPiB0byBvZmZlcjwvbGk+XFxuPGxpPkdvIHRocm91Z2ggdGhlIDxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+cGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHRpcHM8L2E+LiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchPC9saT5cXG48bGk+PGVtPkZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQ8L2VtPjx1bD5cXG48bGk+SmVyZW15IEtlaXRoIGVudW5jaWF0ZXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly9hZGFjdGlvLmNvbS9qb3VybmFsLzc3MDZcXFwiPiZxdW90O0JlIHByb2dyZXNzaXZlJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkNocmlzdGlhbiBIZWlsbWFubiBhZHZvY2F0ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9pY2FudC5jby51ay9hcnRpY2xlcy9wcmFnbWF0aWMtcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQvXFxcIj4mcXVvdDtQcmFnbWF0aWMgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQmcXVvdDs8L2E+PC9saT5cXG48bGk+SmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IDxhIGhyZWY9XFxcImh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGlzIGZhc3RlciZxdW90OzwvYT48L2xpPlxcbjxsaT5JIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj4mcXVvdDtTdG9wIEJyZWFraW5nIHRoZSBXZWImcXVvdDs8L2E+PC9saT5cXG48bGk+R3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcXCI+JnF1b3Q7NyBQcmluY2lwbGVzIG9mIFJpY2ggV2ViIEFwcGxpY2F0aW9ucyZxdW90OzwvYT48L2xpPlxcbjxsaT5BYXJvbiBHdXN0YWZzb24gd3JpdGVzIDxhIGhyZWY9XFxcImh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxcIj4mcXVvdDtVbmRlcnN0YW5kaW5nIFByb2dyZXNzaXZlIEVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPk9yZGUgU2F1bmRlcnMgZ2l2ZXMgaGlzIHBvaW50IG9mIHZpZXcgaW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcXCI+JnF1b3Q7UHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgZm9yIGZhdWx0IHRvbGVyYW5jZSZxdW90OzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+U2lmdCB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4uIFlvdSBtYXkgZmluZCBzb21ldGhpbmcgeW91IGhhZG4mIzM5O3QgdGhvdWdodCBvZiE8L2xpPlxcbjwvdWw+XFxuPHA+QWxzbywgZ2V0IGludm9sdmVkITwvcD5cXG48dWw+XFxuPGxpPkZvcmsgdGhpcyByZXBvc2l0b3J5IGFuZCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcXCI+c2VuZCBzb21lIHB1bGwgcmVxdWVzdHM8L2E+IHRvIGltcHJvdmUgdGhlc2UgZ3VpZGVzITwvbGk+XFxuPGxpPlNlZSBzb21ldGhpbmcsIHNheSBzb21ldGhpbmchIElmIHlvdSBkZXRlY3QgYSBidWcsIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzL2lzc3Vlcy9uZXdcXFwiPnBsZWFzZSBjcmVhdGUgYW4gaXNzdWU8L2E+ITwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48YmxvY2txdW90ZT5cXG48cD5Zb3UmIzM5O2xsIGZpbmQgYSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2dldHRpbmctc3RhcnRlZFxcXCI+ZnVsbCBmbGVkZ2VkIHZlcnNpb24gb2YgdGhlIEdldHRpbmcgU3RhcnRlZDwvYT4gdHV0b3JpYWwgYXBwbGljYXRpb24gb24gR2l0SHViLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBHZXR0aW5nIFN0YXJ0ZWRcXG5cXG4gICAgVGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQncyBfdXAgdG8geW91IGhvdyB0byB1c2UgaXRfLiBJbiBmYWN0LCBpdCBtaWdodCBiZSBhIGdvb2QgaWRlYSBmb3IgeW91IHRvICoqc2V0IHVwIGp1c3QgdGhlIHNlcnZlci1zaWRlIGFzcGVjdCBmaXJzdCoqLCBhcyB0aGF0J2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LlxcblxcbiAgICAjIFRhYmxlIG9mIENvbnRlbnRzXFxuXFxuICAgIC0gW0hvdyBpdCB3b3Jrc10oI2hvdy1pdC13b3JrcylcXG4gICAgLSBbSW5zdGFsbGluZyBUYXVudXNdKCNpbnN0YWxsaW5nLXRhdW51cylcXG4gICAgLSBbU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVdKCNzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZSlcXG4gICAgICAtIFtZb3VyIGZpcnN0IHJvdXRlXSgjeW91ci1maXJzdC1yb3V0ZSlcXG4gICAgICAtIFtDcmVhdGluZyBhIGxheW91dF0oI2NyZWF0aW5nLWEtbGF5b3V0KVxcbiAgICAgIC0gW1VzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZV0oI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZSlcXG4gICAgICAtIFtUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJdKCN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXIpXFxuICAgIC0gW1RhdW51cyBpbiB0aGUgY2xpZW50XSgjdGF1bnVzLWluLXRoZS1jbGllbnQpXFxuICAgICAgLSBbVXNpbmcgdGhlIFRhdW51cyBDTEldKCN1c2luZy10aGUtdGF1bnVzLWNsaSlcXG4gICAgICAtIFtCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJdKCNib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXIpXFxuICAgICAgLSBbQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXSgjYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyKVxcbiAgICAgIC0gW0NvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHRdKCNjb21waWxpbmcteW91ci1jbGllbnQtc2lkZS1qYXZhc2NyaXB0KVxcbiAgICAgIC0gW1VzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJXSgjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGkpXFxuICAgICAgLSBbQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmddKCNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZylcXG4gICAgICAtIFtWZXJzaW9uaW5nXSgjdmVyc2lvbmluZylcXG4gICAgLSBbVGhlIHNreSBpcyB0aGUgbGltaXQhXSgjdGhlLXNreS1pcy10aGUtbGltaXQtKVxcblxcbiAgICAjIEhvdyBpdCB3b3Jrc1xcblxcbiAgICBUYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgKipwcm92ZW4qKiBzZXQgb2YgcnVsZXMuXFxuXFxuICAgIC0gRGVmaW5lIGEgYGZ1bmN0aW9uKG1vZGVsKWAgZm9yIGVhY2ggeW91ciB2aWV3c1xcbiAgICAtIFB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBEZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uXFxuICAgIC0gUHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBFbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHNcXG4gICAgLSBDcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3NcXG4gICAgLSBDcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXdcXG4gICAgLSBGb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlXFxuICAgIC0gV2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCFcXG4gICAgLSBPbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCAqKmhpamFjayBsaW5rIGNsaWNrcyoqIGFuZCBtYWtlIEFKQVggcmVxdWVzdHMgaW5zdGVhZFxcbiAgICAtIFdoZW4geW91IGdldCB0aGUgSlNPTiBtb2RlbCBiYWNrLCByZW5kZXIgdmlld3Mgb24gdGhlIGNsaWVudC1zaWRlXFxuICAgIC0gSWYgdGhlIGBoaXN0b3J5YCBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiAqKkRvbid0IGNvbmZ1c2UgeW91ciBodW1hbnMgd2l0aCBvYnNjdXJlIGhhc2ggcm91dGVycyEqKlxcblxcbiAgICBJJ2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgc3RlcHMgeW91IG5lZWQgdG8gdGFrZSBpbiBvcmRlciB0byBtYWtlIHRoaXMgZmxvdyBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgSW5zdGFsbGluZyBUYXVudXNcXG5cXG4gICAgRmlyc3Qgb2ZmLCB5b3UnbGwgbmVlZCB0byBjaG9vc2UgYSBIVFRQIHNlcnZlciBmcmFtZXdvcmsgZm9yIHlvdXIgYXBwbGljYXRpb24uIEF0IHRoZSBtb21lbnQgVGF1bnVzIHN1cHBvcnRzIG9ubHkgYSBjb3VwbGUgb2YgSFRUUCBmcmFtZXdvcmtzLCBidXQgbW9yZSBtYXkgYmUgYWRkZWQgaWYgdGhleSBhcmUgcG9wdWxhciBlbm91Z2guXFxuXFxuICAgIC0gW0V4cHJlc3NdWzZdLCB0aHJvdWdoIFt0YXVudXMtZXhwcmVzc11bMV1cXG4gICAgLSBbSGFwaV1bN10sIHRocm91Z2ggW3RhdW51cy1oYXBpXVsyXSBhbmQgdGhlIFtoYXBpaWZ5XVszXSB0cmFuc2Zvcm1cXG5cXG4gICAgPiBJZiB5b3UncmUgbW9yZSBvZiBhIF9cXFwicnVtbWFnZSB0aHJvdWdoIHNvbWVvbmUgZWxzZSdzIGNvZGVcXFwiXyB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIFtnb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSdzIHNvdXJjZSBjb2RlXVs0XSwgd2hpY2ggdXNlcyB0aGUgW0hhcGldWzddIGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgW3Bvbnlmb28uY29tXVs1XSwgd2hpY2ggaXMgKiphIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2UqKiB1bmRlciB0aGUgW0V4cHJlc3NdWzZdIGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQncyBva2F5IHRvby5cXG5cXG4gICAgT25jZSB5b3UndmUgc2V0dGxlZCBmb3IgZWl0aGVyIFtFeHByZXNzXVs2XSBvciBbSGFwaV1bN10geW91J2xsIGJlIGFibGUgdG8gcHJvY2VlZC4gRm9yIHRoZSBwdXJwb3NlcyBvZiB0aGlzIGd1aWRlLCB3ZSdsbCB1c2UgW0V4cHJlc3NdWzZdLiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVcXG5cXG4gICAgTmF0dXJhbGx5LCB5b3UnbGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSBgbnBtYCB0byBnZXQgc3RhcnRlZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgZ2V0dGluZy1zdGFydGVkXFxuICAgIGNkIGdldHRpbmctc3RhcnRlZFxcbiAgICBucG0gaW5pdFxcbiAgICBucG0gaW5zdGFsbCAtLXNhdmUgdGF1bnVzIHRhdW51cy1leHByZXNzIGV4cHJlc3NcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBucG0gaW5pdGAgb3V0cHV0XVszMF1cXG5cXG4gICAgTGV0J3MgYnVpbGQgb3VyIGFwcGxpY2F0aW9uIHN0ZXAtYnktc3RlcCwgYW5kIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSdsbCBuZWVkIHRoZSBmYW1vdXMgYGFwcC5qc2AgZmlsZS5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggYXBwLmpzXFxuICAgIGBgYFxcblxcbiAgICBJdCdzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciBgYXBwLmpzYCBmaWxlLCBsZXQncyBkbyB0aGF0IG5vdy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge307XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgQWxsIGB0YXVudXMtZXhwcmVzc2AgcmVhbGx5IGRvZXMgaXMgYWRkIGEgYnVuY2ggb2Ygcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBgYXBwYC4gWW91IHNob3VsZCBub3RlIHRoYXQgYW55IG1pZGRsZXdhcmUgYW5kIEFQSSByb3V0ZXMgc2hvdWxkIHByb2JhYmx5IGNvbWUgYmVmb3JlIHRoZSBgdGF1bnVzRXhwcmVzc2AgaW52b2NhdGlvbi4gWW91J2xsIHByb2JhYmx5IGJlIHVzaW5nIGEgY2F0Y2gtYWxsIHZpZXcgcm91dGUgdGhhdCByZW5kZXJzIGEgX1xcXCJOb3QgRm91bmRcXFwiXyB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS5cXG5cXG4gICAgSWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSFcXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszMV1cXG5cXG4gICAgVGhlIGBvcHRpb25zYCBvYmplY3QgcGFzc2VkIHRvIGB0YXVudXNFeHByZXNzYCBsZXQncyB5b3UgY29uZmlndXJlIFRhdW51cy4gSW5zdGVhZCBvZiBkaXNjdXNzaW5nIGV2ZXJ5IHNpbmdsZSBjb25maWd1cmF0aW9uIG9wdGlvbiB5b3UgY291bGQgc2V0IGhlcmUsIGxldCdzIGRpc2N1c3Mgd2hhdCBtYXR0ZXJzOiB0aGUgX3JlcXVpcmVkIGNvbmZpZ3VyYXRpb25fLiBUaGVyZSdzIHR3byBvcHRpb25zIHRoYXQgeW91IG11c3Qgc2V0IGlmIHlvdSB3YW50IHlvdXIgVGF1bnVzIGFwcGxpY2F0aW9uIHRvIG1ha2UgYW55IHNlbnNlLlxcblxcbiAgICAtIGByb3V0ZXNgIHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlc1xcbiAgICAtIGBsYXlvdXRgIHNob3VsZCBiZSBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSBzaW5nbGUgYG1vZGVsYCBhcmd1bWVudCBhbmQgcmV0dXJucyBhbiBlbnRpcmUgSFRNTCBkb2N1bWVudFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFlvdXIgZmlyc3Qgcm91dGVcXG5cXG4gICAgUm91dGVzIG5lZWQgdG8gYmUgcGxhY2VkIGluIGl0cyBvd24gZGVkaWNhdGVkIG1vZHVsZSwgc28gdGhhdCB5b3UgY2FuIHJldXNlIGl0IGxhdGVyIG9uICoqd2hlbiBzZXR0aW5nIHVwIGNsaWVudC1zaWRlIHJvdXRpbmcqKi4gTGV0J3MgY3JlYXRlIHRoYXQgbW9kdWxlIGFuZCBhZGQgYSByb3V0ZSB0byBpdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggcm91dGVzLmpzXFxuICAgIGBgYFxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gW1xcbiAgICAgIHsgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfVxcbiAgICBdO1xcbiAgICBgYGBcXG5cXG4gICAgRWFjaCBpdGVtIGluIHRoZSBleHBvcnRlZCBhcnJheSBpcyBhIHJvdXRlLiBJbiB0aGlzIGNhc2UsIHdlIG9ubHkgaGF2ZSB0aGUgYC9gIHJvdXRlIHdpdGggdGhlIGBob21lL2luZGV4YCBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbiBwYXR0ZXJuXVs4XSwgd2hpY2ggbWFkZSBbUnVieSBvbiBSYWlsc11bOV0gZmFtb3VzLiBfTWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vIV8gQnkgY29udmVudGlvbiwgVGF1bnVzIHdpbGwgYXNzdW1lIHRoYXQgdGhlIGBob21lL2luZGV4YCBhY3Rpb24gdXNlcyB0aGUgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIgYW5kIHJlbmRlcnMgdGhlIGBob21lL2luZGV4YCB2aWV3LiBPZiBjb3Vyc2UsIF9hbGwgb2YgdGhhdCBjYW4gYmUgY2hhbmdlZCB1c2luZyBjb25maWd1cmF0aW9uXy5cXG5cXG4gICAgVGltZSB0byBnbyBiYWNrIHRvIGBhcHAuanNgIGFuZCB1cGRhdGUgdGhlIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBJdCdzIGltcG9ydGFudCB0byBrbm93IHRoYXQgaWYgeW91IG9taXQgdGhlIGNyZWF0aW9uIG9mIGEgY29udHJvbGxlciB0aGVuIFRhdW51cyB3aWxsIHNraXAgdGhhdCBzdGVwLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHBhc3NpbmcgaXQgd2hhdGV2ZXIgdGhlIGRlZmF1bHQgbW9kZWwgaXMgXyhtb3JlIG9uIHRoYXQgW2luIHRoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdLCBidXQgaXQgZGVmYXVsdHMgdG8gYHt9YClfLlxcblxcbiAgICBIZXJlJ3Mgd2hhdCB5b3UnZCBnZXQgaWYgeW91IGF0dGVtcHRlZCB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgY3VybCBsb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXVszMl1cXG5cXG4gICAgVHVybnMgb3V0IHlvdSdyZSBtaXNzaW5nIGEgbG90IG9mIHRoaW5ncyEgVGF1bnVzIGlzIHF1aXRlIGxlbmllbnQgYW5kIGl0J2xsIHRyeSBpdHMgYmVzdCB0byBsZXQgeW91IGtub3cgd2hhdCB5b3UgbWlnaHQgYmUgbWlzc2luZywgdGhvdWdoLiBBcHBhcmVudGx5IHlvdSBkb24ndCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISBfVGhhdCdzIHJvdWdoLl9cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDcmVhdGluZyBhIGxheW91dFxcblxcbiAgICBMZXQncyBhbHNvIGNyZWF0ZSBhIGxheW91dC4gRm9yIHRoZSBwdXJwb3NlcyBvZiBtYWtpbmcgb3VyIHdheSB0aHJvdWdoIHRoaXMgZ3VpZGUsIGl0J2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBsYXlvdXQuanNcXG4gICAgYGBgXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYHBhcnRpYWxgIHByb3BlcnR5IGluIHRoZSBgbW9kZWxgIF8oYXMgc2VlbiBiZWxvdylfIGlzIGNyZWF0ZWQgb24gdGhlIGZseSBhZnRlciByZW5kZXJpbmcgcGFydGlhbCB2aWV3cy4gVGhlIGxheW91dCBmdW5jdGlvbiB3ZSdsbCBiZSB1c2luZyBoZXJlIGVmZmVjdGl2ZWx5IG1lYW5zIF9cXFwidXNlIHRoZSBmb2xsb3dpbmcgY29tYmluYXRpb24gb2YgcGxhaW4gdGV4dCBhbmQgdGhlICoqKG1heWJlIEhUTUwpKiogcGFydGlhbCB2aWV3XFxcIl8uXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICByZXR1cm4gJ1RoaXMgaXMgdGhlIHBhcnRpYWw6IFxcXCInICsgbW9kZWwucGFydGlhbCArICdcXFwiJztcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgaWYgeW91IHdlcmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24sIHRoZW4geW91IHByb2JhYmx5IHdvdWxkbid0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCdzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy5cXG5cXG4gICAgLSBbTXVzdGFjaGVdWzEwXSBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCdzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MXFxuICAgIC0gW0phZGVdWzExXSBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJ3Mgbm8gY2xvc2luZyB0YWdzXFxuICAgIC0gVGhlcmUncyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgW01vemlsbGEncyBOdW5qdWNrc11bMTJdLCBbSGFuZGxlYmFyc11bMTNdLCBhbmQgW0VKU11bMTRdLlxcblxcbiAgICBSZW1lbWJlciB0byBhZGQgdGhlIGBsYXlvdXRgIHVuZGVyIHRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCB0byBgdGF1bnVzRXhwcmVzc2AhXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgSGVyZSdzIHdoYXQgeW91J2QgZ2V0IGlmIHlvdSByYW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgY3VybCBsb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzMzXVxcblxcbiAgICBBdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSdyZSBzdGlsbCBtaXNzaW5nIHRoZSBwYXJ0aWFsIHZpZXcgYW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLiBXZSBjYW4gZG8gd2l0aG91dCB0aGUgY29udHJvbGxlciwgYnV0IGhhdmluZyBubyB2aWV3cyBpcyBraW5kIG9mIHBvaW50bGVzcyB3aGVuIHlvdSdyZSB0cnlpbmcgdG8gZ2V0IGFuIE1WQyBlbmdpbmUgdXAgYW5kIHJ1bm5pbmcsIHJpZ2h0P1xcblxcbiAgICBZb3UnbGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlcyBzZWN0aW9uXVsxNV0uIElmIHlvdSBkb24ndCBwcm92aWRlIGEgYGxheW91dGAgcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIGA8cHJlPmAgYW5kIGA8Y29kZT5gIHRhZ3MsIHdoaWNoIG1heSBhaWQgeW91IHdoZW4gZ2V0dGluZyBzdGFydGVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZVxcblxcbiAgICBMZXQncyBnbyBhaGVhZCBhbmQgdXNlIEphZGUgYXMgdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBjaG9pY2UgZm9yIG91ciB2aWV3cy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgdmlld3MvaG9tZVxcbiAgICB0b3VjaCB2aWV3cy9ob21lL2luZGV4LmphZGVcXG4gICAgYGBgXFxuXFxuICAgIFNpbmNlIHdlJ3JlIGp1c3QgZ2V0dGluZyBzdGFydGVkLCB0aGUgdmlldyB3aWxsIGp1c3QgaGF2ZSBzb21lIGJhc2ljIHN0YXRpYyBjb250ZW50LCBhbmQgdGhhdCdzIGl0LlxcblxcbiAgICBgYGBqYWRlXFxuICAgIHAgSGVsbG8gVGF1bnVzIVxcbiAgICBgYGBcXG5cXG4gICAgTmV4dCB5b3UnbGwgd2FudCB0byBjb21waWxlIHRoZSB2aWV3IGludG8gYSBmdW5jdGlvbi4gVG8gZG8gdGhhdCB5b3UgY2FuIHVzZSBbamFkdW1dWzE2XSwgYSBzcGVjaWFsaXplZCBKYWRlIGNvbXBpbGVyIHRoYXQgcGxheXMgd2VsbCB3aXRoIFRhdW51cyBieSBiZWluZyBhd2FyZSBvZiBgcmVxdWlyZWAgc3RhdGVtZW50cywgYW5kIHRodXMgc2F2aW5nIGJ5dGVzIHdoZW4gaXQgY29tZXMgdG8gY2xpZW50LXNpZGUgcmVuZGVyaW5nLiBMZXQncyBpbnN0YWxsIGl0IGdsb2JhbGx5LCBmb3IgdGhlIHNha2Ugb2YgdGhpcyBleGVyY2lzZSBfKHlvdSBzaG91bGQgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4geW91J3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKV8uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC0tZ2xvYmFsIGphZHVtXFxuICAgIGBgYFxcblxcbiAgICBUbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIGB2aWV3c2AgZGlyZWN0b3J5IGludG8gZnVuY3Rpb25zIHRoYXQgd29yayB3ZWxsIHdpdGggVGF1bnVzLCB5b3UgY2FuIHVzZSB0aGUgY29tbWFuZCBiZWxvdy4gVGhlIGAtLW91dHB1dGAgZmxhZyBpbmRpY2F0ZXMgd2hlcmUgeW91IHdhbnQgdGhlIHZpZXdzIHRvIGJlIHBsYWNlZC4gV2UgY2hvc2UgdG8gdXNlIGAuYmluYCBiZWNhdXNlIHRoYXQncyB3aGVyZSBUYXVudXMgZXhwZWN0cyB5b3VyIGNvbXBpbGVkIHZpZXdzIHRvIGJlIGJ5IGRlZmF1bHQuIEJ1dCBzaW5jZSBUYXVudXMgZm9sbG93cyB0aGUgW2NvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uXVsxN10gYXBwcm9hY2gsIHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCBpZiB5b3Ugd2FudGVkIHRvLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBqYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuICAgIGBgYFxcblxcbiAgICBDb25ncmF0dWxhdGlvbnMhIFlvdXIgZmlyc3QgdmlldyBpcyBub3cgb3BlcmF0aW9uYWwgYW5kIGJ1aWx0IHVzaW5nIGEgZnVsbC1mbGVkZ2VkIHRlbXBsYXRpbmcgZW5naW5lISBBbGwgdGhhdCdzIGxlZnQgaXMgZm9yIHlvdSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGFuZCB2aXNpdCBpdCBvbiBwb3J0IGAzMDAwYC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBvcGVuIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzM0XVxcblxcbiAgICBHcmFudGVkLCB5b3Ugc2hvdWxkIF9wcm9iYWJseV8gbW92ZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIF8oYW55IHZpZXcgZW5naW5lIHdpbGwgZG8pXyB0ZW1wbGF0ZSBhcyB3ZWxsLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFRocm93aW5nIGluIGEgY29udHJvbGxlclxcblxcbiAgICBDb250cm9sbGVycyBhcmUgaW5kZWVkIG9wdGlvbmFsLCBidXQgYW4gYXBwbGljYXRpb24gdGhhdCByZW5kZXJzIGV2ZXJ5IHZpZXcgdXNpbmcgdGhlIHNhbWUgbW9kZWwgd29uJ3QgZ2V0IHlvdSB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCdzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSBgaG9tZS92aWV3YCBhY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIC1wIGNvbnRyb2xsZXJzL2hvbWVcXG4gICAgdG91Y2ggY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGNvbnRyb2xsZXIgbW9kdWxlIHNob3VsZCBtZXJlbHkgZXhwb3J0IGEgZnVuY3Rpb24uIF9TdGFydGVkIG5vdGljaW5nIHRoZSBwYXR0ZXJuP18gVGhlIHNpZ25hdHVyZSBmb3IgdGhlIGNvbnRyb2xsZXIgaXMgdGhlIHNhbWUgc2lnbmF0dXJlIGFzIHRoYXQgb2YgYW55IG90aGVyIG1pZGRsZXdhcmUgcGFzc2VkIHRvIFtFeHByZXNzXVs2XSBfKG9yIGFueSByb3V0ZSBoYW5kbGVyIHBhc3NlZCB0byBbSGFwaV1bN10gaW4gdGhlIGNhc2Ugb2YgYHRhdW51cy1oYXBpYClfLlxcblxcbiAgICBBcyB5b3UgbWF5IGhhdmUgbm90aWNlZCBpbiB0aGUgZXhhbXBsZXMgc28gZmFyLCB5b3UgaGF2ZW4ndCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUncyBhIGZldyBtb2RlbCBwcm9wZXJ0aWVzIF8odmVyeSBmZXcpXyB0aGF0IFRhdW51cyBpcyBhd2FyZSBvZi4gT25lIG9mIHRob3NlIGlzIHRoZSBgdGl0bGVgIHByb3BlcnR5LCBhbmQgaXQnbGwgYmUgdXNlZCB0byBjaGFuZ2UgdGhlIGBkb2N1bWVudC50aXRsZWAgaW4geW91ciBwYWdlcyB3aGVuIG5hdmlnYXRpbmcgdGhyb3VnaCB0aGUgY2xpZW50LXNpZGUuIEtlZXAgaW4gbWluZCB0aGF0IGFueXRoaW5nIHRoYXQncyBub3QgaW4gdGhlIGBtb2RlbGAgcHJvcGVydHkgd29uJ3QgYmUgdHJhc21pdHRlZCB0byB0aGUgY2xpZW50LCBhbmQgd2lsbCBqdXN0IGJlIGFjY2Vzc2libGUgdG8gdGhlIGxheW91dC5cXG5cXG4gICAgSGVyZSBpcyBvdXIgbmV3ZmFuZ2xlZCBgaG9tZS9pbmRleGAgY29udHJvbGxlci4gQXMgeW91J2xsIG5vdGljZSwgaXQgZG9lc24ndCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gYG5leHRgIGlzIGNhbGxlZCwgdGhlIFRhdW51cyB2aWV3LXJlbmRlcmluZyBoYW5kbGVyIHdpbGwga2ljayBpbiwgYW5kIHJlbmRlciB0aGUgdmlldyB1c2luZyB0aGUgaW5mb3JtYXRpb24gdGhhdCB3YXMgYXNzaWduZWQgdG8gYHJlcy52aWV3TW9kZWxgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICAgICAgcmVzLnZpZXdNb2RlbCA9IHtcXG4gICAgICAgIG1vZGVsOiB7XFxuICAgICAgICAgIHRpdGxlOiAnV2VsY29tZSBIb21lLCBUYXVudXMhJ1xcbiAgICAgICAgfVxcbiAgICAgIH07XFxuICAgICAgbmV4dCgpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCByZWx5aW5nIG9uIHRoZSBjbGllbnQtc2lkZSBjaGFuZ2VzIHRvIHlvdXIgcGFnZSBpbiBvcmRlciB0byBzZXQgdGhlIHZpZXcgdGl0bGUgX3dvdWxkbid0IGJlIHByb2dyZXNzaXZlXywgYW5kIHRodXMgW2l0IHdvdWxkIGJlIHJlYWxseSwgX3JlYWxseV8gYmFkXVsxN10uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgYHRpdGxlYCBoYXMgYmVlbiBwYXNzZWQgdG8gdGhlIG1vZGVsLiBJbiBmYWN0LCBsZXQncyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHJtIGxheW91dC5qc1xcbiAgICB0b3VjaCB2aWV3cy9sYXlvdXQuamFkZVxcbiAgICBqYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuICAgIGBgYFxcblxcbiAgICBZb3Ugc2hvdWxkIGFsc28gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSBgYXBwLmpzYCBtb2R1bGUgb25jZSBhZ2FpbiFcXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vLmJpbi92aWV3cy9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgIT1gIHN5bnRheCBiZWxvdyBtZWFucyB0aGF0IHdoYXRldmVyIGlzIGluIHRoZSB2YWx1ZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudCB3b24ndCBiZSBlc2NhcGVkLiBUaGF0J3Mgb2theSBiZWNhdXNlIGBwYXJ0aWFsYCBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJ3Qgd2FudCBIVE1MIHRhZ3MgdG8gYmUgZXNjYXBlZCFcXG5cXG4gICAgYGBgamFkZVxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtYWluIT1wYXJ0aWFsXFxuICAgIGBgYFxcblxcbiAgICBCeSB0aGUgd2F5LCBkaWQgeW91IGtub3cgdGhhdCBgPGh0bWw+YCwgYDxoZWFkPmAsIGFuZCBgPGJvZHk+YCBhcmUgYWxsIG9wdGlvbmFsIGluIEhUTUwgNSwgYW5kIHRoYXQgeW91IGNhbiBzYWZlbHkgb21pdCB0aGVtIGluIHlvdXIgSFRNTD8gT2YgY291cnNlLCByZW5kZXJpbmcgZW5naW5lcyB3aWxsIHN0aWxsIGluc2VydCB0aG9zZSBlbGVtZW50cyBhdXRvbWF0aWNhbGx5IGludG8gdGhlIERPTSBmb3IgeW91ISBfSG93IGNvb2wgaXMgdGhhdD9fXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzVdXFxuXFxuICAgIFlvdSBjYW4gbm93IHZpc2l0IGBsb2NhbGhvc3Q6MzAwMGAgd2l0aCB5b3VyIGZhdm9yaXRlIHdlYiBicm93c2VyIGFuZCB5b3UnbGwgbm90aWNlIHRoYXQgdGhlIHZpZXcgcmVuZGVycyBhcyB5b3UnZCBleHBlY3QuIFRoZSB0aXRsZSB3aWxsIGJlIHByb3Blcmx5IHNldCwgYW5kIGEgYDxtYWluPmAgZWxlbWVudCB3aWxsIGhhdmUgdGhlIGNvbnRlbnRzIG9mIHlvdXIgdmlldy5cXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYXBwbGljYXRpb24gcnVubmluZyBvbiBHb29nbGUgQ2hyb21lXVszNl1cXG5cXG4gICAgVGhhdCdzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJ3Mgbm90aGluZyBzdG9wcGluZyB5b3UgZnJvbSBhZGRpbmcgZGF0YWJhc2UgY2FsbHMgdG8gZmV0Y2ggYml0cyBhbmQgcGllY2VzIG9mIHRoZSBtb2RlbCBiZWZvcmUgaW52b2tpbmcgYG5leHRgIHRvIHJlbmRlciB0aGUgdmlldy5cXG5cXG4gICAgVGhlbiB0aGVyZSdzIGFsc28gdGhlIGNsaWVudC1zaWRlIGFzcGVjdCBvZiBzZXR0aW5nIHVwIFRhdW51cy4gTGV0J3Mgc2V0IGl0IHVwIGFuZCBzZWUgaG93IGl0IG9wZW5zIHVwIG91ciBwb3NzaWJpbGl0aWVzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRhdW51cyBpbiB0aGUgY2xpZW50XFxuXFxuICAgIFlvdSBhbHJlYWR5IGtub3cgaG93IHRvIHNldCB1cCB0aGUgYmFzaWNzIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmcsIGFuZCB5b3Uga25vdyB0aGF0IHlvdSBzaG91bGQgW2NoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSB0byBnZXQgYSBtb3JlIHRob3JvdWdoIHVuZGVyc3RhbmRpbmcgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2Ugb24gVGF1bnVzLCBhbmQgd2hhdCBpdCBlbmFibGVzIHlvdSB0byBkby5cXG5cXG4gICAgVGhlIHdheSBUYXVudXMgd29ya3Mgb24gdGhlIGNsaWVudC1zaWRlIGlzIHNvIHRoYXQgb25jZSB5b3Ugc2V0IGl0IHVwLCBpdCB3aWxsIGhpamFjayBsaW5rIGNsaWNrcyBhbmQgdXNlIEFKQVggdG8gZmV0Y2ggbW9kZWxzIGFuZCByZW5kZXIgdGhvc2Ugdmlld3MgaW4gdGhlIGNsaWVudC4gSWYgdGhlIEphdmFTY3JpcHQgY29kZSBmYWlscyB0byBsb2FkLCBfb3IgaWYgaXQgaGFzbid0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzXywgdGhlIHJlZ3VsYXIgbGluayB3b3VsZCBiZSBmb2xsb3dlZCBpbnN0ZWFkIGFuZCBubyBoYXJtIHdvdWxkIGJlIHVubGVhc2hlZCB1cG9uIHRoZSBodW1hbiwgZXhjZXB0IHRoZXkgd291bGQgZ2V0IGEgc2xpZ2h0bHkgbGVzcyBmYW5jeSBleHBlcmllbmNlLlxcblxcbiAgICBTZXR0aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBpbnZvbHZlcyBhIGZldyBkaWZmZXJlbnQgc3RlcHMuIEZpcnN0bHksIHdlJ2xsIGhhdmUgdG8gY29tcGlsZSB0aGUgYXBwbGljYXRpb24ncyB3aXJpbmcgXyh0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKV8gaW50byBzb21ldGhpbmcgdGhlIGJyb3dzZXIgdW5kZXJzdGFuZHMuIFRoZW4sIHlvdSdsbCBoYXZlIHRvIG1vdW50IFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUsIHBhc3NpbmcgdGhlIHdpcmluZyBzbyB0aGF0IGl0IGtub3dzIHdoaWNoIHJvdXRlcyBpdCBzaG91bGQgcmVzcG9uZCB0bywgYW5kIHdoaWNoIG90aGVycyBpdCBzaG91bGQgbWVyZWx5IGlnbm9yZS4gT25jZSB0aGF0J3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLlxcblxcbiAgICBBcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UnbGwgbGVhcm4sIHdpbGwgYWxzbyBsZXQgeW91IHJlbmRlciBwYXJ0aWFsIHZpZXdzIHVzaW5nIHRoZSBwb3dlcmZ1bCBUYXVudXMgZW5naW5lLCBsaXN0ZW4gZm9yIGV2ZW50cyB0aGF0IG1heSBvY2N1ciBhdCBrZXkgc3RhZ2VzIG9mIHRoZSB2aWV3LXJlbmRlcmluZyBwcm9jZXNzLCBhbmQgZXZlbiBpbnRlcmNlcHQgQUpBWCByZXF1ZXN0cyBibG9ja2luZyB0aGVtIGJlZm9yZSB0aGV5IGV2ZXIgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBUYXVudXMgQ0xJXFxuXFxuICAgIFRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbid0IGhhdmUgdG8gYHJlcXVpcmVgIGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCBgamFkdW1gIGVhcmxpZXIsIHdlJ2xsIGluc3RhbGwgdGhlIGB0YXVudXNgIENMSSBnbG9iYWxseSBmb3IgdGhlIHNha2Ugb2YgZXhlcmNpc2luZywgYnV0IHdlIHVuZGVyc3RhbmQgdGhhdCByZWx5aW5nIG9uIGdsb2JhbGx5IGluc3RhbGxlZCBtb2R1bGVzIGlzIGluc3VmZmljaWVudCBmb3IgcHJvZHVjdGlvbi1ncmFkZSBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC0tZ2xvYmFsIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgQmVmb3JlIHlvdSBjYW4gdXNlIHRoZSBDTEksIHlvdSBzaG91bGQgbW92ZSB0aGUgcm91dGUgZGVmaW5pdGlvbnMgdG8gYGNvbnRyb2xsZXJzL3JvdXRlcy5qc2AuIFRoYXQncyB3aGVyZSBUYXVudXMgZXhwZWN0cyB0aGVtIHRvIGJlLiBJZiB5b3Ugd2FudCB0byBwbGFjZSB0aGVtIHNvbWV0aGluZyBlbHNlLCBbdGhlIEFQSSBkb2N1bWVudGF0aW9uIGNhbiBoZWxwIHlvdV1bMThdLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBtdiByb3V0ZXMuanMgY29udHJvbGxlcnMvcm91dGVzLmpzXFxuICAgIGBgYFxcblxcbiAgICBTaW5jZSB5b3UgbW92ZWQgdGhlIHJvdXRlcyB5b3Ugc2hvdWxkIGFsc28gdXBkYXRlIHRoZSBgcmVxdWlyZWAgc3RhdGVtZW50IGluIHRoZSBgYXBwLmpzYCBtb2R1bGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuLy5iaW4vdmlld3MvbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0J2xsIHByaW50IG91dCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGlmIHlvdSB3YW50IHRvIHBlcnNpc3QgaXQgeW91IHNob3VsZCBwcm92aWRlIHRoZSBgLS1vdXRwdXRgIGZsYWcuIEluIHR5cGljYWwgW2NvbnZlbnRpb24tb3Zlci1jb25maWd1cmF0aW9uXVs4XSBmYXNoaW9uLCB0aGUgQ0xJIHdpbGwgZGVmYXVsdCB0byBpbmZlcnJpbmcgeW91ciB2aWV3cyBhcmUgbG9jYXRlZCBpbiBgLmJpbi92aWV3c2AgYW5kIHRoYXQgeW91IHdhbnQgdGhlIHdpcmluZyBtb2R1bGUgdG8gYmUgcGxhY2VkIGluIGAuYmluL3dpcmluZy5qc2AsIGJ1dCB5b3UnbGwgYmUgYWJsZSB0byBjaGFuZ2UgdGhhdCBpZiBpdCBkb2Vzbid0IG1lZXQgeW91ciBuZWVkcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0XFxuICAgIGBgYFxcblxcbiAgICBBdCB0aGlzIHBvaW50IGluIG91ciBleGFtcGxlLCB0aGUgQ0xJIHNob3VsZCBjcmVhdGUgYSBgLmJpbi93aXJpbmcuanNgIGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIGB0YXVudXNgIGlzIGFuIGF1dG9tYXRlZCBjb2RlLWdlbmVyYXRpb24gdG9vbCwgaXQncyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGVtcGxhdGVzID0ge1xcbiAgICAgICdob21lL2luZGV4JzogcmVxdWlyZSgnLi92aWV3cy9ob21lL2luZGV4LmpzJyksXFxuICAgICAgJ2xheW91dCc6IHJlcXVpcmUoJy4vdmlld3MvbGF5b3V0LmpzJylcXG4gICAgfTtcXG5cXG4gICAgdmFyIGNvbnRyb2xsZXJzID0ge1xcbiAgICB9O1xcblxcbiAgICB2YXIgcm91dGVzID0gW1xcbiAgICAgIHtcXG4gICAgICAgIHJvdXRlOiAnLycsXFxuICAgICAgICBhY3Rpb246ICdob21lL2luZGV4J1xcbiAgICAgIH1cXG4gICAgXTtcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XFxuICAgICAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICAgICAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgICAgIHJvdXRlczogcm91dGVzXFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgdGF1bnVzYCBvdXRwdXRdWzM3XVxcblxcbiAgICBOb3RlIHRoYXQgdGhlIGBjb250cm9sbGVyc2Agb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJ3QgY3JlYXRlZCBhbnkgX2NsaWVudC1zaWRlIGNvbnRyb2xsZXJzXyB5ZXQuIFdlIGNyZWF0ZWQgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgYnV0IHRob3NlIGRvbid0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC5cXG5cXG4gICAgPiAqKlRoZSBDTEkgY2FuIGJlIGVudGlyZWx5IGlnbm9yZWQqKi4gWW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSB3aXJpbmcgbW9kdWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuXFxuXFxuICAgIER1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgYC0td2F0Y2hgIGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG4gICAgYGBgXFxuXFxuICAgIElmIHlvdSdyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91J2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSBgaGFwaWlmeWAgdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuICAgIGBgYFxcblxcbiAgICBOb3cgdGhhdCB5b3UgdW5kZXJzdGFuZCBob3cgdG8gdXNlIHRoZSBDTEkgb3IgYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgb24geW91ciBvd24sIGJvb3RpbmcgdXAgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSB3aWxsIGJlIGFuIGVhc3kgdGhpbmcgdG8gZG8hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXFxuXFxuICAgIE9uY2Ugd2UgaGF2ZSB0aGUgd2lyaW5nIG1vZHVsZSwgYm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgZW5naW5lIGlzIHByZXR0eSBlYXN5LiBUYXVudXMgc3VnZ2VzdHMgeW91IHVzZSBgY2xpZW50L2pzYCB0byBrZWVwIGFsbCBvZiB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgbG9naWMsIGJ1dCB0aGF0IGlzIHVwIHRvIHlvdSB0b28uIEZvciB0aGUgc2FrZSBvZiB0aGlzIGd1aWRlLCBsZXQncyBzdGljayB0byB0aGUgY29udmVudGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIC1wIGNsaWVudC9qc1xcbiAgICB0b3VjaCBjbGllbnQvanMvbWFpbi5qc1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGBtYWluYCBtb2R1bGUgd2lsbCBiZSB1c2VkIGFzIHRoZSBfZW50cnkgcG9pbnRfIG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSdsbCBuZWVkIHRvIGltcG9ydCBgdGF1bnVzYCwgdGhlIHdpcmluZyBtb2R1bGUgd2UndmUganVzdCBidWlsdCwgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBET00gZWxlbWVudCB3aGVyZSB5b3UgYXJlIHJlbmRlcmluZyB5b3VyIHBhcnRpYWwgdmlld3MuIE9uY2UgeW91IGhhdmUgYWxsIHRoYXQsIHlvdSBjYW4gaW52b2tlIGB0YXVudXMubW91bnRgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHdpcmluZyA9IHJlcXVpcmUoJy4uLy4uLy5iaW4vd2lyaW5nJyk7XFxuICAgIHZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ21haW4nKVswXTtcXG5cXG4gICAgdGF1bnVzLm1vdW50KG1haW4sIHdpcmluZyk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLlxcblxcbiAgICBCeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbid0IGJlIGZ1bmN0aW9uYWwgdW50aWwgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgcnVucy5cXG5cXG4gICAgQW4gYWx0ZXJuYXRpdmUgaXMgdG8gaW5saW5lIHRoZSB2aWV3IG1vZGVsIGFsb25nc2lkZSB0aGUgdmlld3MgaW4gYSBgPHNjcmlwdCB0eXBlPSd0ZXh0L3RhdW51cyc+YCB0YWcsIGJ1dCB0aGlzIHRlbmRzIHRvIHNsb3cgZG93biB0aGUgaW5pdGlhbCByZXNwb25zZSAobW9kZWxzIGFyZSBfdHlwaWNhbGx5IGxhcmdlcl8gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS5cXG5cXG4gICAgQSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCdzIGhhcmRlciB0byBzZXQgdXAuXFxuXFxuICAgIFRoZSB0aHJlZSBib290aW5nIHN0cmF0ZWdpZXMgYXJlIGV4cGxhaW5lZCBpbiBbdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0gYW5kIGZ1cnRoZXIgZGlzY3Vzc2VkIGluIFt0aGUgb3B0aW1pemF0aW9uIGd1aWRlXVsyNV0uIEZvciBub3csIHRoZSBkZWZhdWx0IHN0cmF0ZWd5IF8oYCdhdXRvJ2ApXyBzaG91bGQgc3VmZmljZS4gSXQgZmV0Y2hlcyB0aGUgdmlldyBtb2RlbCB1c2luZyBhbiBBSkFYIHJlcXVlc3QgcmlnaHQgYWZ0ZXIgVGF1bnVzIGxvYWRzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIEFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlclxcblxcbiAgICBDbGllbnQtc2lkZSBjb250cm9sbGVycyBydW4gd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLCBldmVuIGlmIGl0J3MgYSBwYXJ0aWFsLiBUaGUgY29udHJvbGxlciBpcyBwYXNzZWQgdGhlIGBtb2RlbGAsIGNvbnRhaW5pbmcgdGhlIG1vZGVsIHRoYXQgd2FzIHVzZWQgdG8gcmVuZGVyIHRoZSB2aWV3OyB0aGUgYHJvdXRlYCwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSBgY29udGFpbmVyYCwgd2hpY2ggaXMgd2hhdGV2ZXIgRE9NIGVsZW1lbnQgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIGludG8uXFxuXFxuICAgIFRoZXNlIGNvbnRyb2xsZXJzIGFyZSBlbnRpcmVseSBvcHRpb25hbCwgd2hpY2ggbWFrZXMgc2Vuc2Ugc2luY2Ugd2UncmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCdzIGFkZCBzb21lIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gdGhlIGV4YW1wbGUgd2UndmUgYmVlbiBidWlsZGluZy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWVcXG4gICAgdG91Y2ggY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG4gICAgYGBgXFxuXFxuICAgIEd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJ2xsIGp1c3QgcHJpbnQgdGhlIGFjdGlvbiBhbmQgdGhlIG1vZGVsIHRvIHRoZSBjb25zb2xlLiBJZiB0aGVyZSdzIG9uZSBwbGFjZSB3aGVyZSB5b3UnZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsLCBjb250YWluZXIsIHJvdXRlKSB7XFxuICAgICAgY29uc29sZS5sb2coJ1JlbmRlcmVkIHZpZXcgJXMgdXNpbmcgbW9kZWw6XFxcXG4lcycsIHJvdXRlLmFjdGlvbiwgSlNPTi5zdHJpbmdpZnkobW9kZWwsIG51bGwsIDIpKTtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIFNpbmNlIHdlIHdlcmVuJ3QgdXNpbmcgdGhlIGAtLXdhdGNoYCBmbGFnIGZyb20gdGhlIFRhdW51cyBDTEksIHlvdSdsbCBoYXZlIHRvIHJlY29tcGlsZSB0aGUgd2lyaW5nIGF0IHRoaXMgcG9pbnQsIHNvIHRoYXQgdGhlIGNvbnRyb2xsZXIgZ2V0cyBhZGRlZCB0byB0aGF0IG1hbmlmZXN0LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXRcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgeW91J2xsIG5vdyBoYXZlIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgdXNpbmcgW0Jyb3dzZXJpZnldWzM4XSFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDb21waWxpbmcgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0XFxuXFxuICAgIFlvdSdsbCBuZWVkIHRvIGNvbXBpbGUgdGhlIGBjbGllbnQvanMvbWFpbi5qc2AgbW9kdWxlLCBvdXIgY2xpZW50LXNpZGUgYXBwbGljYXRpb24ncyBlbnRyeSBwb2ludCwgdXNpbmcgQnJvd3NlcmlmeSBzaW5jZSB0aGUgY29kZSBpcyB3cml0dGVuIHVzaW5nIENvbW1vbkpTLiBJbiB0aGlzIGV4YW1wbGUgeW91J2xsIGluc3RhbGwgYGJyb3dzZXJpZnlgIGdsb2JhbGx5IHRvIGNvbXBpbGUgdGhlIGNvZGUsIGJ1dCBuYXR1cmFsbHkgeW91J2xsIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHdvcmtpbmcgb24gYSByZWFsLXdvcmxkIGFwcGxpY2F0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCAtLWdsb2JhbCBicm93c2VyaWZ5XFxuICAgIGBgYFxcblxcbiAgICBPbmNlIHlvdSBoYXZlIHRoZSBCcm93c2VyaWZ5IENMSSwgeW91J2xsIGJlIGFibGUgdG8gY29tcGlsZSB0aGUgY29kZSByaWdodCBmcm9tIHlvdXIgY29tbWFuZCBsaW5lLiBUaGUgYC1kYCBmbGFnIHRlbGxzIEJyb3dzZXJpZnkgdG8gYWRkIGFuIGlubGluZSBzb3VyY2UgbWFwIGludG8gdGhlIGNvbXBpbGVkIGJ1bmRsZSwgbWFraW5nIGRlYnVnZ2luZyBlYXNpZXIgZm9yIHVzLiBUaGUgYC1vYCBmbGFnIHJlZGlyZWN0cyBvdXRwdXQgdG8gdGhlIGluZGljYXRlZCBmaWxlLCB3aGVyZWFzIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCB0byBzdGFuZGFyZCBvdXRwdXQgYnkgZGVmYXVsdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgLmJpbi9wdWJsaWMvanNcXG4gICAgYnJvd3NlcmlmeSBjbGllbnQvanMvbWFpbi5qcyAtZG8gLmJpbi9wdWJsaWMvanMvYWxsLmpzXFxuICAgIGBgYFxcblxcbiAgICBXZSBoYXZlbid0IGRvbmUgbXVjaCBvZiBhbnl0aGluZyB3aXRoIHRoZSBFeHByZXNzIGFwcGxpY2F0aW9uLCBzbyB5b3UnbGwgbmVlZCB0byBhZGp1c3QgdGhlIGBhcHAuanNgIG1vZHVsZSB0byBzZXJ2ZSBzdGF0aWMgYXNzZXRzLiBJZiB5b3UncmUgdXNlZCB0byBFeHByZXNzLCB5b3UnbGwgbm90aWNlIHRoZXJlJ3Mgbm90aGluZyBzcGVjaWFsIGFib3V0IGhvdyB3ZSdyZSB1c2luZyBgc2VydmUtc3RhdGljYC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLS1zYXZlIHNlcnZlLXN0YXRpY1xcbiAgICBgYGBcXG5cXG4gICAgTGV0J3MgY29uZmlndXJlIHRoZSBhcHBsaWNhdGlvbiB0byBzZXJ2ZSBzdGF0aWMgYXNzZXRzIGZyb20gYC5iaW4vcHVibGljYC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBzZXJ2ZVN0YXRpYyA9IHJlcXVpcmUoJ3NlcnZlLXN0YXRpYycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuLy5iaW4vdmlld3MvbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgYXBwLnVzZShzZXJ2ZVN0YXRpYygnLmJpbi9wdWJsaWMnKSk7XFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgTmV4dCB1cCwgeW91J2xsIGhhdmUgdG8gZWRpdCB0aGUgbGF5b3V0IHRvIGluY2x1ZGUgdGhlIGNvbXBpbGVkIEphdmFTY3JpcHQgYnVuZGxlIGZpbGUuXFxuXFxuICAgIGBgYGphZGVcXG4gICAgdGl0bGU9bW9kZWwudGl0bGVcXG4gICAgbWFpbiE9cGFydGlhbFxcbiAgICBzY3JpcHQoc3JjPScvanMvYWxsLmpzJylcXG4gICAgYGBgXFxuXFxuICAgIExhc3RseSwgeW91IGNhbiBleGVjdXRlIHRoZSBhcHBsaWNhdGlvbiBhbmQgc2VlIGl0IGluIGFjdGlvbiFcXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszOV1cXG5cXG4gICAgSWYgeW91IG9wZW4gdGhlIGFwcGxpY2F0aW9uIG9uIGEgd2ViIGJyb3dzZXIsIHlvdSdsbCBub3RpY2UgdGhhdCB0aGUgYXBwcm9wcmlhdGUgaW5mb3JtYXRpb24gd2lsbCBiZSBsb2dnZWQgaW50byB0aGUgZGV2ZWxvcGVyIGBjb25zb2xlYC5cXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggdGhlIGFwcGxpY2F0aW9uIHJ1bm5pbmcgdW5kZXIgR29vZ2xlIENocm9tZV1bNDBdXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUElcXG5cXG4gICAgVGF1bnVzIGRvZXMgcHJvdmlkZSBbYSB0aGluIEFQSV1bMThdIGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSdzIGEgZmV3IG1ldGhvZHMgeW91IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBvbiBhIGdsb2JhbCBzY2FsZSBhcyB3ZWxsLlxcblxcbiAgICBUYXVudXMgY2FuIG5vdGlmeSB5b3Ugd2hlbmV2ZXIgaW1wb3J0YW50IGV2ZW50cyBvY2N1ci5cXG5cXG4gICAgRXZlbnQgICAgICAgICAgICB8IEFyZ3VtZW50cyAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYCdzdGFydCdgICAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgRW1pdHRlZCB3aGVuIGB0YXVudXMubW91bnRgIGZpbmlzaGVkIHRoZSByb3V0ZSBzZXR1cCBhbmQgaXMgYWJvdXQgdG8gaW52b2tlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyLiBTdWJzY3JpYmUgdG8gdGhpcyBldmVudCBiZWZvcmUgY2FsbGluZyBgdGF1bnVzLm1vdW50YC5cXG4gICAgYCdyZW5kZXInYCAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgQSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWRcXG4gICAgYCdmZXRjaC5zdGFydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuXFxuICAgIGAnZmV0Y2guZG9uZSdgICAgfCAgYHJvdXRlLCBjb250ZXh0LCBkYXRhYCB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuXFxuICAgIGAnZmV0Y2guYWJvcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuXFxuICAgIGAnZmV0Y2guZXJyb3InYCAgfCAgYHJvdXRlLCBjb250ZXh0LCBlcnJgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLlxcblxcbiAgICBCZXNpZGVzIGV2ZW50cywgdGhlcmUncyBhIGNvdXBsZSBtb3JlIG1ldGhvZHMgeW91IGNhbiB1c2UuIFRoZSBgdGF1bnVzLm5hdmlnYXRlYCBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJ3MgYHRhdW51cy5wYXJ0aWFsYCwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCdsbCB0aGVuIGludm9rZSBpdHMgY29udHJvbGxlci4gWW91J2xsIG5lZWQgdG8gY29tZSB1cCB3aXRoIHRoZSBtb2RlbCB5b3Vyc2VsZiwgdGhvdWdoLlxcblxcbiAgICBBc3RvbmlzaGluZ2x5LCB0aGUgQVBJIGlzIGZ1cnRoZXIgZG9jdW1lbnRlZCBpbiBbdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmdcXG5cXG4gICAgW1BlcmZvcm1hbmNlXVsyNV0gcGxheXMgYW4gaW1wb3J0YW50IHJvbGUgaW4gVGF1bnVzLiBUaGF0J3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/XFxuXFxuICAgIFdoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIGB7IGNhY2hlOiB0cnVlIH1gIGFzIHRoZSB0aGlyZCBwYXJhbWV0ZXIgZm9yIGB0YXVudXMubW91bnRgLCB0aGUgY2FjaGluZyBsYXllciB3aWxsIG1ha2Ugc3VyZSB0aGF0IHJlc3BvbnNlcyBhcmUga2VwdCBhcm91bmQgZm9yIGAxNWAgc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0J2xsIGZpcnN0IGFzayB0aGUgY2FjaGluZyBsYXllciBmb3IgYSBmcmVzaCBjb3B5LiBJZiB0aGUgY2FjaGluZyBsYXllciBkb2Vzbid0IGhhdmUgYSBjb3B5LCBvciBpZiB0aGF0IGNvcHkgaXMgc3RhbGUgXyhpbiB0aGlzIGNhc2UsIG9sZGVyIHRoYW4gYDE1YCBzZWNvbmRzKV8sIHRoZW4gYW4gQUpBWCByZXF1ZXN0IHdpbGwgYmUgaXNzdWVkIHRvIHRoZSBzZXJ2ZXIuIE9mIGNvdXJzZSwgdGhlIGR1cmF0aW9uIGlzIGNvbmZpZ3VyYWJsZS4gSWYgeW91IHdhbnQgdG8gdXNlIGEgdmFsdWUgb3RoZXIgdGhhbiB0aGUgZGVmYXVsdCwgeW91IHNob3VsZCBzZXQgYGNhY2hlYCB0byBhIG51bWJlciBpbiBzZWNvbmRzIGluc3RlYWQgb2YganVzdCBgdHJ1ZWAuXFxuXFxuICAgIFNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UncmUgYWxzbyBhYmxlIHRvIHNldCBhIGBjYWNoZWAgZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgYGNhY2hlYCBwcm9wZXJ0eSBpbiByb3V0ZXMgaGFzIHByZWNlZGVuY2Ugb3ZlciB0aGUgZGVmYXVsdCB2YWx1ZS5cXG5cXG4gICAgVGhlcmUncyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiBbSW5kZXhlZERCXVsyOF0gc3RvcmUuIEluZGV4ZWREQiBpcyBhbiBlbWJlZGRlZCBkYXRhYmFzZSBzb2x1dGlvbiwgYW5kIHlvdSBjYW4gdGhpbmsgb2YgaXQgbGlrZSBhbiBhc3luY2hyb25vdXMgdmVyc2lvbiBvZiBgbG9jYWxTdG9yYWdlYC4gSXQgaGFzIFtzdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0XVsyOV0sIGFuZCBpbiB0aGUgY2FzZXMgd2hlcmUgaXQncyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuXFxuXFxuICAgIFRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSBfKHRoZSBgdG91Y2hzdGFydGAgZXZlbnQpXywgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuXFxuXFxuICAgIElmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgXyhwb3NzaWJseSBsaW1pdGVkKV8gSW50ZXJuZXQgY29ubmVjdGlvbiBiYW5kd2lkdGguXFxuXFxuICAgIElmIHRoZSBodW1hbiBjbGlja3Mgb24gdGhlIGxpbmsgYmVmb3JlIHByZWZldGNoaW5nIGlzIGNvbXBsZXRlZCwgaGUnbGwgbmF2aWdhdGUgdG8gdGhlIHZpZXcgYXMgc29vbiBhcyBwcmVmZXRjaGluZyBlbmRzLCByYXRoZXIgdGhhbiBmaXJpbmcgYW5vdGhlciByZXF1ZXN0LiBUaGlzIGhlbHBzIFRhdW51cyBzYXZlIHByZWNpb3VzIG1pbGxpc2Vjb25kcyB3aGVuIGRlYWxpbmcgd2l0aCBsYXRlbmN5LXNlbnNpdGl2ZSBvcGVyYXRpb25zLlxcblxcbiAgICBUdXJuaW5nIHByZWZldGNoaW5nIG9uIGlzIHNpbXBseSBhIG1hdHRlciBvZiBzZXR0aW5nIGBwcmVmZXRjaGAgdG8gYHRydWVgIGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YC4gRm9yIGFkZGl0aW9uYWwgaW5zaWdodHMgaW50byB0aGUgcGVyZm9ybWFuY2UgaW1wcm92ZW1lbnRzIFRhdW51cyBjYW4gb2ZmZXIsIGhlYWQgb3ZlciB0byB0aGUgW1BlcmZvcm1hbmNlIE9wdGltaXphdGlvbnNdWzI1XSBndWlkZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBWZXJzaW9uaW5nXFxuXFxuICAgIFdoZW4geW91IGFsdGVyIHlvdXIgdmlld3MsIGNoYW5nZSBjb250cm9sbGVycywgb3IgbW9kaWZ5IHRoZSBtb2RlbHMsIGNoYW5jZXMgYXJlIHRoZSBjbGllbnQtc2lkZSBpcyBnb2luZyB0byBjb21lIGFjcm9zcyBvbmUgb2YgdGhlIGZvbGxvd2luZyBpc3N1ZXMuXFxuXFxuICAgIC0gT3V0ZGF0ZWQgdmlldyB0ZW1wbGF0ZSBmdW5jdGlvbnMgaW4gdGhlIGNsaWVudC1zaWRlLCBjYXVzaW5nIG5ldyBtb2RlbHMgdG8gYnJlYWtcXG4gICAgLSBPdXRkYXRlZCBjbGllbnQtc2lkZSBjb250cm9sbGVycywgY2F1c2luZyBuZXcgbW9kZWxzIHRvIGJyZWFrIG9yIG1pc3Mgb3V0IG9uIGZ1bmN0aW9uYWxpdHlcXG4gICAgLSBPdXRkYXRlZCBtb2RlbHMgaW4gdGhlIGNhY2hlLCBjYXVzaW5nIG5ldyB2aWV3cyBvciBjb250cm9sbGVycyB0byBicmVha1xcblxcbiAgICBWZXJzaW9uaW5nIGhhbmRsZXMgdGhlc2UgaXNzdWVzIGdyYWNlZnVsbHkgb24geW91ciBiZWhhbGYuIFRoZSB3YXkgaXQgd29ya3MgaXMgdGhhdCB3aGVuZXZlciB5b3UgZ2V0IGEgcmVzcG9uc2UgZnJvbSBUYXVudXMsIGEgX3ZlcnNpb24gc3RyaW5nIChjb25maWd1cmVkIG9uIHRoZSBzZXJ2ZXItc2lkZSlfIGlzIGluY2x1ZGVkIHdpdGggaXQuIElmIHRoYXQgdmVyc2lvbiBzdHJpbmcgZG9lc24ndCBtYXRjaCB0aGUgb25lIHN0b3JlZCBpbiB0aGUgY2xpZW50LCB0aGVuIHRoZSBjYWNoZSB3aWxsIGJlIGZsdXNoZWQgYW5kIHRoZSBodW1hbiB3aWxsIGJlIHJlZGlyZWN0ZWQsIGZvcmNpbmcgYSBmdWxsIHBhZ2UgcmVsb2FkLlxcblxcbiAgICA+IFRoZSB2ZXJzaW9uaW5nIEFQSSBpcyB1bmFibGUgdG8gaGFuZGxlIGNoYW5nZXMgdG8gcm91dGVzLCBhbmQgaXQncyB1cCB0byB5b3UgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIGFwcGxpY2F0aW9uIHN0YXlzIGJhY2t3YXJkcyBjb21wYXRpYmxlIHdoZW4gaXQgY29tZXMgdG8gcm91dGluZy5cXG4gICAgPlxcbiAgICA+IFZlcnNpb25pbmcgY2FuJ3QgaW50ZXJ2ZW5lIHdoZW4gdGhlIGNsaWVudC1zaWRlIGlzIGhlYXZpbHkgcmVseWluZyBvbiBjYWNoZWQgdmlld3MgYW5kIG1vZGVscywgYW5kIHRoZSBodW1hbiBpcyByZWZ1c2luZyB0byByZWxvYWQgdGhlaXIgYnJvd3Nlci4gVGhlIHNlcnZlciBpc24ndCBiZWluZyBhY2Nlc3NlZCBhbmQgdGh1cyBpdCBjYW4ndCBjb21tdW5pY2F0ZSB0aGF0IGV2ZXJ5dGhpbmcgb24gdGhlIGNhY2hlIG1heSBoYXZlIGJlY29tZSBzdGFsZS4gVGhlIGdvb2QgbmV3cyBpcyB0aGF0IHRoZSBodW1hbiB3b24ndCBub3RpY2UgYW55IG9kZGl0aWVzLCBhcyB0aGUgc2l0ZSB3aWxsIGNvbnRpbnVlIHRvIHdvcmsgYXMgaGUga25vd3MgaXQuIFdoZW4gaGUgZmluYWxseSBhdHRlbXB0cyB0byB2aXNpdCBzb21ldGhpbmcgdGhhdCBpc24ndCBjYWNoZWQsIGEgcmVxdWVzdCBpcyBtYWRlLCBhbmQgdGhlIHZlcnNpb25pbmcgZW5naW5lIHJlc29sdmVzIHZlcnNpb24gZGlzY3JlcGFuY2llcyBmb3IgdGhlbS5cXG5cXG4gICAgTWFraW5nIHVzZSBvZiB2ZXJzaW9uaW5nIGludm9sdmVzIHNldHRpbmcgdGhlIGB2ZXJzaW9uYCBmaWVsZCBpbiB0aGUgb3B0aW9ucywgd2hlbiBpbnZva2luZyBgdGF1bnVzLm1vdW50YCAqKm9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUsIHVzaW5nIHRoZSBzYW1lIHZhbHVlKiouIFRoZSBUYXVudXMgdmVyc2lvbiBzdHJpbmcgd2lsbCBiZSBhZGRlZCB0byB0aGUgb25lIHlvdSBwcm92aWRlZCwgc28gdGhhdCBUYXVudXMgd2lsbCBrbm93IHRvIHN0YXkgYWxlcnQgZm9yIGNoYW5nZXMgdG8gVGF1bnVzIGl0c2VsZiwgYXMgd2VsbC5cXG5cXG4gICAgWW91IG1heSB1c2UgeW91ciBidWlsZCBpZGVudGlmaWVyIG9yIHRoZSBgdmVyc2lvbmAgZmllbGQgaW4gYHBhY2thZ2UuanNvbmAsIGJ1dCB1bmRlcnN0YW5kIHRoYXQgaXQgbWF5IGNhdXNlIHRoZSBjbGllbnQtc2lkZSB0byBmbHVzaCB0aGUgY2FjaGUgdG9vIG9mdGVuIF8obWF5YmUgZXZlbiBvbiBldmVyeSBkZXBsb3ltZW50KV8uXFxuXFxuICAgIFRoZSBkZWZhdWx0IHZlcnNpb24gc3RyaW5nIGlzIHNldCB0byBgMWAuIFRoZSBUYXVudXMgdmVyc2lvbiB3aWxsIGJlIHByZXBlbmRlZCB0byB5b3VycywgcmVzdWx0aW5nIGluIGEgdmFsdWUgc3VjaCBhcyBgdDMuMC4wO3YxYCB3aGVyZSBUYXVudXMgaXMgcnVubmluZyB2ZXJzaW9uIGAzLjAuMGAgYW5kIHlvdXIgYXBwbGljYXRpb24gaXMgcnVubmluZyB2ZXJzaW9uIGAxYC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBUaGUgc2t5IGlzIHRoZSBsaW1pdCFcXG5cXG4gICAgWW91J3JlIG5vdyBmYW1pbGlhciB3aXRoIGhvdyBUYXVudXMgd29ya3Mgb24gYSBoaWdoLWxldmVsLiBZb3UgaGF2ZSBjb3ZlcmVkIGEgZGVjZW50IGFtb3VudCBvZiBncm91bmQsIGJ1dCB5b3Ugc2hvdWxkbid0IHN0b3AgdGhlcmUuXFxuXFxuICAgIC0gTGVhcm4gbW9yZSBhYm91dCBbdGhlIEFQSSBUYXVudXMgaGFzXVsxOF0gdG8gb2ZmZXJcXG4gICAgLSBHbyB0aHJvdWdoIHRoZSBbcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHRpcHNdWzI1XS4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3IVxcbiAgICAtIF9GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50X1xcbiAgICAgIC0gSmVyZW15IEtlaXRoIGVudW5jaWF0ZXMgW1xcXCJCZSBwcm9ncmVzc2l2ZVxcXCJdWzIwXVxcbiAgICAgIC0gQ2hyaXN0aWFuIEhlaWxtYW5uIGFkdm9jYXRlcyBmb3IgW1xcXCJQcmFnbWF0aWMgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnRcXFwiXVsyNl1cXG4gICAgICAtIEpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyBbXFxcIlByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGlzIGZhc3RlclxcXCJdWzIyXVxcbiAgICAgIC0gSSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgW1xcXCJTdG9wIEJyZWFraW5nIHRoZSBXZWJcXFwiXVsxN11cXG4gICAgICAtIEd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIFtcXFwiNyBQcmluY2lwbGVzIG9mIFJpY2ggV2ViIEFwcGxpY2F0aW9uc1xcXCJdWzI0XVxcbiAgICAgIC0gQWFyb24gR3VzdGFmc29uIHdyaXRlcyBbXFxcIlVuZGVyc3RhbmRpbmcgUHJvZ3Jlc3NpdmUgRW5oYW5jZW1lbnRcXFwiXVsyMV1cXG4gICAgICAtIE9yZGUgU2F1bmRlcnMgZ2l2ZXMgaGlzIHBvaW50IG9mIHZpZXcgaW4gW1xcXCJQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBmb3IgZmF1bHQgdG9sZXJhbmNlXFxcIl1bMjNdXFxuICAgIC0gU2lmdCB0aHJvdWdoIHRoZSBbY29tcGxlbWVudGFyeSBtb2R1bGVzXVsxNV0uIFlvdSBtYXkgZmluZCBzb21ldGhpbmcgeW91IGhhZG4ndCB0aG91Z2h0IG9mIVxcblxcbiAgICBBbHNvLCBnZXQgaW52b2x2ZWQhXFxuXFxuICAgIC0gRm9yayB0aGlzIHJlcG9zaXRvcnkgYW5kIFtzZW5kIHNvbWUgcHVsbCByZXF1ZXN0c11bMTldIHRvIGltcHJvdmUgdGhlc2UgZ3VpZGVzIVxcbiAgICAtIFNlZSBzb21ldGhpbmcsIHNheSBzb21ldGhpbmchIElmIHlvdSBkZXRlY3QgYSBidWcsIFtwbGVhc2UgY3JlYXRlIGFuIGlzc3VlXVsyN10hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgID4gWW91J2xsIGZpbmQgYSBbZnVsbCBmbGVkZ2VkIHZlcnNpb24gb2YgdGhlIEdldHRpbmcgU3RhcnRlZF1bNDFdIHR1dG9yaWFsIGFwcGxpY2F0aW9uIG9uIEdpdEh1Yi5cXG5cXG4gICAgWzFdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxuICAgIFsyXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcbiAgICBbM106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxuICAgIFs1XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvb1xcbiAgICBbNl06IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs3XTogaHR0cDovL2hhcGlqcy5jb21cXG4gICAgWzhdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxuICAgIFs5XTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9SdWJ5X29uX1JhaWxzXFxuICAgIFsxMF06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYW5sL211c3RhY2hlLmpzXFxuICAgIFsxMV06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcbiAgICBbMTJdOiBodHRwOi8vbW96aWxsYS5naXRodWIuaW8vbnVuanVja3MvXFxuICAgIFsxM106IGh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcbiAgICBbMTRdOiBodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcbiAgICBbMTVdOiAvY29tcGxlbWVudHNcXG4gICAgWzE2XTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2phZHVtXFxuICAgIFsxN106IGh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG4gICAgWzE4XTogL2FwaVxcbiAgICBbMTldOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcbiAgICBbMjBdOiBodHRwczovL2FkYWN0aW8uY29tL2pvdXJuYWwvNzcwNlxcbiAgICBbMjFdOiBodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcbiAgICBbMjJdOiBodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxuICAgIFsyM106IGh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXG4gICAgWzI0XTogaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcbiAgICBbMjVdOiAvcGVyZm9ybWFuY2VcXG4gICAgWzI2XTogaHR0cDovL2ljYW50LmNvLnVrL2FydGljbGVzL3ByYWdtYXRpYy1wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC9cXG4gICAgWzI3XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMvaXNzdWVzL25ld1xcbiAgICBbMjhdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbMjldOiBodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxuICAgIFszMF06IGh0dHA6Ly9pLmltZ3VyLmNvbS80UDh2TmU5LnBuZ1xcbiAgICBbMzFdOiBodHRwOi8vaS5pbWd1ci5jb20vbjhtSDRtTi5wbmdcXG4gICAgWzMyXTogaHR0cDovL2kuaW1ndXIuY29tLzA4bG5DZWMucG5nXFxuICAgIFszM106IGh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcbiAgICBbMzRdOiBodHRwOi8vaS5pbWd1ci5jb20vemphSllDcS5wbmdcXG4gICAgWzM1XTogaHR0cDovL2kuaW1ndXIuY29tL052RVd4OXoucG5nXFxuICAgIFszNl06IGh0dHA6Ly9pLmltZ3VyLmNvbS9MZ1pSRm41LnBuZ1xcbiAgICBbMzddOiBodHRwOi8vaS5pbWd1ci5jb20vZklFZTVUbS5wbmdcXG4gICAgWzM4XTogaHR0cDovL2Jyb3dzZXJpZnkub3JnL1xcbiAgICBbMzldOiBodHRwOi8vaS5pbWd1ci5jb20vNjhPODR3WC5wbmdcXG4gICAgWzQwXTogaHR0cDovL2kuaW1ndXIuY29tL1pVRjZORmwucG5nXFxuICAgIFs0MV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvZ2V0dGluZy1zdGFydGVkXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBlcmZvcm1hbmNlKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcInBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+UGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uPC9oMT5cXG48cD5HaXZlbiB0aGF0IHBlcmZvcm1hbmNlIGlzIG9uZSBvZiB0aGUgY29yZSB2YWx1ZXMgaW4gYm90aCBUYXVudXMgYW5kIFVzZXIgRXhwZXJpZW5jZSwgaXQgZGVzZXJ2ZWQgYSBmaXJzdC1jbGFzcyBhcnRpY2xlIG9uIHRoZSBzaXRlIGFzIHdlbGwuPC9wPlxcbjxwPlRoZXJlJiMzOTtzIGEgZmV3IHRoaW5ncyB0byB0YWtlIGludG8gYWNjb3VudCB3aGVuIGRldmVsb3BpbmcgYW4gYXBwbGljYXRpb24gaWYgd2Ugd2FudCB0byBzdHJpdmUgZm9yIHBlcmZvcm1hbmNlLCBhbmQgdGhpcyBhcnRpY2xlIGFpbXMgdG8gYmUgYSBjb2xsZWN0aW9uIG9mIHdlYiBwZXJmb3JtYW5jZSBiZXN0IHByYWN0aWNlcyBhbG9uZyB3aXRoIHRpcHMgb24gaG93IHRvIGltcHJvdmUgcGVyZm9ybWFuY2UgZXNwZWNpZmljYWxseSBmb3IgYXBwbGljYXRpb25zIGJ1aWx0IG9uIHRvcCBvZiBUYXVudXMuPC9wPlxcbjxoMSBpZD1cXFwicGVyZm9ybWFuY2UtY2hlY2tsaXN0XFxcIj5QZXJmb3JtYW5jZSBDaGVja2xpc3Q8L2gxPlxcbjxwPklmIHlvdSBoYXZlbiYjMzk7dCwgeW91IHNob3VsZCByZWFkIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+JnF1b3Q7Q3JpdGljYWwgUGF0aCBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb24mcXVvdDs8L2E+IGFzIGEgc21hbGwgZ3VpZGUgb2YgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9ucyB5b3Ugc2hvdWxkIGFscmVhZHkgYmUgZG9pbmcuIFRoZSBsaXN0IGJlbG93IGNvbnRhaW5zIHNvbWUgb2Ygd2hhdCYjMzk7cyBkaXNjdXNzZWQgaW4gdGhhdCBhcnRpY2xlLjwvcD5cXG48dWw+XFxuPGxpPk1vdmUgYXdheSBmcm9tIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmc8L2xpPlxcbjxsaT5Vc2UgPGEgaHJlZj1cXFwiaHR0cDovL25naW54Lm9yZy9cXFwiPjxjb2RlPm5naW54PC9jb2RlPjwvYT4gYXMgYSByZXZlcnNlIHByb3h5IGZvciB5b3VyIGZyb250LWVuZCBzZXJ2ZXJzPC9saT5cXG48bGk+UmVzaXplIGFuZCBvcHRpbWl6ZSBpbWFnZXM8L2xpPlxcbjxsaT5EZWZlciBub24tY3JpdGljYWwgc3RhdGljIGFzc2V0IGxvYWRpbmc8L2xpPlxcbjxsaT5JbmxpbmUgY3JpdGljYWwgQ1NTIGFuZCBKYXZhU2NyaXB0PC9saT5cXG48bGk+Q2FjaGUgcmVzcG9uc2VzIGFnZ3Jlc3NpdmVseTwvbGk+XFxuPGxpPkRpdGNoIGxhcmdlIGxpYnJhcmllcyBhbmQgZnJhbWV3b3JrczwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcImJvb3N0aW5nLXBlcmZvcm1hbmNlLXdpdGgtdGF1bnVzXFxcIj5Cb29zdGluZyBQZXJmb3JtYW5jZSB3aXRoIFRhdW51czwvaDE+XFxuPHA+V2hlbiBpdCBjb21lcyB0byBUYXVudXMsIHRoZXJlJiMzOTtzIGEgZmV3IG1vcmUgcGVyZm9ybWFuY2UgdHdlYWtzIHlvdSBzaG91bGQgY29uc2lkZXIgaW1wbGVtZW50aW5nLjwvcD5cXG48dWw+XFxuPGxpPkNob29zZSB0aGUgcmlnaHQgYm9vdCBzdHJhdGVneTwvbGk+XFxuPGxpPlR1cm4gb24gY2xpZW50LXNpZGUgY2FjaGluZzwvbGk+XFxuPGxpPkVuYWJsZSBwcmVmZXRjaGluZyBmb3IgcHJlZGljdGl2ZSBjYWNoZSBsb2FkaW5nPC9saT5cXG48bGk+VXNlIHZlcnNpb25pbmcgdG8gZW5zdXJlIGNhY2hlIHJlbGV2YW5jZTwvbGk+XFxuPGxpPlNlbmQgdmlld3MgYW5kIGNvbnRyb2xsZXJzIHRvIHRoZSBjbGllbnQgc2VsZWN0aXZlbHk8L2xpPlxcbjwvdWw+XFxuPHA+R2l2ZW4gdGhhdCB0aGlzIHNpdGUgaXMgYWJvdXQgVGF1bnVzLCB3ZSYjMzk7bGwgZm9jdXMgb24gdGhlIFRhdW51cyB0d2Vha3MsIGFzIHlvdSBjYW4gcmVhZGlseSBzY291ciB0aGUgd2ViIGZvciBnZW5lcmFsIHdlYiBwZXJmb3JtYW5jZSBhZHZpY2UuPC9wPlxcbjxoMSBpZD1cXFwiY2hvb3NlLXRoZS1yaWdodC1ib290LXN0cmF0ZWd5XFxcIj5DaG9vc2UgdGhlIHJpZ2h0IGJvb3Qgc3RyYXRlZ3k8L2gxPlxcbjxoMSBpZD1cXFwidHVybi1vbi1jbGllbnQtc2lkZS1jYWNoaW5nXFxcIj5UdXJuIG9uIGNsaWVudC1zaWRlIGNhY2hpbmc8L2gxPlxcbjxoMSBpZD1cXFwiZW5hYmxlLXByZWZldGNoaW5nLWZvci1wcmVkaWN0aXZlLWNhY2hlLWxvYWRpbmdcXFwiPkVuYWJsZSBwcmVmZXRjaGluZyBmb3IgcHJlZGljdGl2ZSBjYWNoZSBsb2FkaW5nPC9oMT5cXG48aDEgaWQ9XFxcInVzZS12ZXJzaW9uaW5nLXRvLWVuc3VyZS1jYWNoZS1yZWxldmFuY2VcXFwiPlVzZSB2ZXJzaW9uaW5nIHRvIGVuc3VyZSBjYWNoZSByZWxldmFuY2U8L2gxPlxcbjxoMSBpZD1cXFwic2VuZC12aWV3cy1hbmQtY29udHJvbGxlcnMtdG8tdGhlLWNsaWVudC1zZWxlY3RpdmVseVxcXCI+U2VuZCB2aWV3cyBhbmQgY29udHJvbGxlcnMgdG8gdGhlIGNsaWVudCBzZWxlY3RpdmVseTwvaDE+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cXG5cXG4gICAgR2l2ZW4gdGhhdCBwZXJmb3JtYW5jZSBpcyBvbmUgb2YgdGhlIGNvcmUgdmFsdWVzIGluIGJvdGggVGF1bnVzIGFuZCBVc2VyIEV4cGVyaWVuY2UsIGl0IGRlc2VydmVkIGEgZmlyc3QtY2xhc3MgYXJ0aWNsZSBvbiB0aGUgc2l0ZSBhcyB3ZWxsLlxcblxcbiAgICBUaGVyZSdzIGEgZmV3IHRoaW5ncyB0byB0YWtlIGludG8gYWNjb3VudCB3aGVuIGRldmVsb3BpbmcgYW4gYXBwbGljYXRpb24gaWYgd2Ugd2FudCB0byBzdHJpdmUgZm9yIHBlcmZvcm1hbmNlLCBhbmQgdGhpcyBhcnRpY2xlIGFpbXMgdG8gYmUgYSBjb2xsZWN0aW9uIG9mIHdlYiBwZXJmb3JtYW5jZSBiZXN0IHByYWN0aWNlcyBhbG9uZyB3aXRoIHRpcHMgb24gaG93IHRvIGltcHJvdmUgcGVyZm9ybWFuY2UgZXNwZWNpZmljYWxseSBmb3IgYXBwbGljYXRpb25zIGJ1aWx0IG9uIHRvcCBvZiBUYXVudXMuXFxuXFxuICAgICMgUGVyZm9ybWFuY2UgQ2hlY2tsaXN0XFxuXFxuICAgIElmIHlvdSBoYXZlbid0LCB5b3Ugc2hvdWxkIHJlYWQgW1xcXCJDcml0aWNhbCBQYXRoIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcXCJdWzFdIGFzIGEgc21hbGwgZ3VpZGUgb2YgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9ucyB5b3Ugc2hvdWxkIGFscmVhZHkgYmUgZG9pbmcuIFRoZSBsaXN0IGJlbG93IGNvbnRhaW5zIHNvbWUgb2Ygd2hhdCdzIGRpc2N1c3NlZCBpbiB0aGF0IGFydGljbGUuXFxuXFxuICAgIC0gTW92ZSBhd2F5IGZyb20gZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZ1xcbiAgICAtIFVzZSBbYG5naW54YF1bMl0gYXMgYSByZXZlcnNlIHByb3h5IGZvciB5b3VyIGZyb250LWVuZCBzZXJ2ZXJzXFxuICAgIC0gUmVzaXplIGFuZCBvcHRpbWl6ZSBpbWFnZXNcXG4gICAgLSBEZWZlciBub24tY3JpdGljYWwgc3RhdGljIGFzc2V0IGxvYWRpbmdcXG4gICAgLSBJbmxpbmUgY3JpdGljYWwgQ1NTIGFuZCBKYXZhU2NyaXB0XFxuICAgIC0gQ2FjaGUgcmVzcG9uc2VzIGFnZ3Jlc3NpdmVseVxcbiAgICAtIERpdGNoIGxhcmdlIGxpYnJhcmllcyBhbmQgZnJhbWV3b3Jrc1xcblxcbiAgICAjIEJvb3N0aW5nIFBlcmZvcm1hbmNlIHdpdGggVGF1bnVzXFxuXFxuICAgIFdoZW4gaXQgY29tZXMgdG8gVGF1bnVzLCB0aGVyZSdzIGEgZmV3IG1vcmUgcGVyZm9ybWFuY2UgdHdlYWtzIHlvdSBzaG91bGQgY29uc2lkZXIgaW1wbGVtZW50aW5nLlxcblxcbiAgICAtIENob29zZSB0aGUgcmlnaHQgYm9vdCBzdHJhdGVneVxcbiAgICAtIFR1cm4gb24gY2xpZW50LXNpZGUgY2FjaGluZ1xcbiAgICAtIEVuYWJsZSBwcmVmZXRjaGluZyBmb3IgcHJlZGljdGl2ZSBjYWNoZSBsb2FkaW5nXFxuICAgIC0gVXNlIHZlcnNpb25pbmcgdG8gZW5zdXJlIGNhY2hlIHJlbGV2YW5jZVxcbiAgICAtIFNlbmQgdmlld3MgYW5kIGNvbnRyb2xsZXJzIHRvIHRoZSBjbGllbnQgc2VsZWN0aXZlbHlcXG5cXG4gICAgR2l2ZW4gdGhhdCB0aGlzIHNpdGUgaXMgYWJvdXQgVGF1bnVzLCB3ZSdsbCBmb2N1cyBvbiB0aGUgVGF1bnVzIHR3ZWFrcywgYXMgeW91IGNhbiByZWFkaWx5IHNjb3VyIHRoZSB3ZWIgZm9yIGdlbmVyYWwgd2ViIHBlcmZvcm1hbmNlIGFkdmljZS5cXG5cXG4gICAgIyBDaG9vc2UgdGhlIHJpZ2h0IGJvb3Qgc3RyYXRlZ3lcXG4gICAgIyBUdXJuIG9uIGNsaWVudC1zaWRlIGNhY2hpbmdcXG4gICAgIyBFbmFibGUgcHJlZmV0Y2hpbmcgZm9yIHByZWRpY3RpdmUgY2FjaGUgbG9hZGluZ1xcbiAgICAjIFVzZSB2ZXJzaW9uaW5nIHRvIGVuc3VyZSBjYWNoZSByZWxldmFuY2VcXG4gICAgIyBTZW5kIHZpZXdzIGFuZCBjb250cm9sbGVycyB0byB0aGUgY2xpZW50IHNlbGVjdGl2ZWx5XFxuXFxuICAgIFsxXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2NyaXRpY2FsLXBhdGgtcGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxuICAgIFsyXTogaHR0cDovL25naW54Lm9yZy9cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbm90Rm91bmQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIk5vdCBGb3VuZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiXFxcIiB0YXJnZXQ9XFxcIl9ibGFua1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiJm1kYXNoOyBAbnpnYlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9wPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcImgxIE5vdCBGb3VuZFxcblxcbnAgVGhlcmUgZG9lc24ndCBzZWVtIHRvIGJlIGFueXRoaW5nIGhlcmUgeWV0LiBJZiB5b3UgYmVsaWV2ZSB0aGlzIHRvIGJlIGEgbWlzdGFrZSwgcGxlYXNlIGxldCB1cyBrbm93IVxcbnBcXG4gIGEoaHJlZj0naHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiJywgdGFyZ2V0PSdfYmxhbmsnKSAmbWRhc2g7IEBuemdiXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxheW91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCwgbW9kZWwsIHBhcnRpYWwpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPCFET0NUWVBFIGh0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aHRtbCBsYW5nPVxcXCJlblxcXCIgaXRlbXNjb3BlIGl0ZW10eXBlPVxcXCJodHRwOi8vc2NoZW1hLm9yZy9CbG9nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHRpdGxlPlwiICsgKGphZGUuZXNjYXBlKG51bGwgPT0gKGphZGVfaW50ZXJwID0gbW9kZWwudGl0bGUpID8gXCJcIiA6IGphZGVfaW50ZXJwKSkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3RpdGxlPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgY2hhcnNldD1cXFwidXRmLThcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzaG9ydGN1dCBpY29uXFxcIiBocmVmPVxcXCIvZmF2aWNvbi5pY29cXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgaHR0cC1lcXVpdj1cXFwiWC1VQS1Db21wYXRpYmxlXFxcIiBjb250ZW50PVxcXCJJRT1lZGdlLGNocm9tZT0xXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIG5hbWU9XFxcInZpZXdwb3J0XFxcIiBjb250ZW50PVxcXCJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCIvY3NzL2FsbC5jc3NcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic3R5bGVzaGVldFxcXCIgdHlwZT1cXFwidGV4dC9jc3NcXFwiIGhyZWY9XFxcImh0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDBcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxib2R5IGlkPVxcXCJ0b3BcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9cXFwiIGFyaWEtbGFiZWw9XFxcIkdvIHRvIGhvbWVcXFwiIGNsYXNzPVxcXCJseS10aXRsZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRhdW51c1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDIgY2xhc3M9XFxcImx5LXN1YmhlYWRpbmdcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJNaWNybyBJc29tb3JwaGljIE1WQyBFbmdpbmUgZm9yIE5vZGUuanNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2hlYWRlcj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YXNpZGUgY2xhc3M9XFxcInNiLXNpZGViYXJcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxuYXYgY2xhc3M9XFxcInNiLWNvbnRhaW5lclxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHVsIGNsYXNzPVxcXCJudi1pdGVtc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQWJvdXRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiR2V0dGluZyBTdGFydGVkXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2FwaVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFQSSBEb2N1bWVudGF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI4LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ29tcGxlbWVudGFyeSBNb2R1bGVzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMwLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3NvdXJjZS1jb2RlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiU291cmNlIENvZGVcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvY2hhbmdlbG9nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ2hhbmdlbG9nXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC91bD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbmF2PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hc2lkZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWFpbiBpZD1cXFwiYXBwbGljYXRpb24tcm9vdFxcXCIgZGF0YS10YXVudXM9XFxcIm1vZGVsXFxcIiBjbGFzcz1cXFwibHktbWFpblxcXCI+XCIgKyAobnVsbCA9PSAoamFkZV9pbnRlcnAgPSBwYXJ0aWFsKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L21haW4+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNjcmlwdCBzcmM9XFxcIi9qcy9hbGwuanNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zY3JpcHQ+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2JvZHk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2h0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCxcIm1vZGVsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5tb2RlbDp0eXBlb2YgbW9kZWwhPT1cInVuZGVmaW5lZFwiP21vZGVsOnVuZGVmaW5lZCxcInBhcnRpYWxcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnBhcnRpYWw6dHlwZW9mIHBhcnRpYWwhPT1cInVuZGVmaW5lZFwiP3BhcnRpYWw6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJkb2N0eXBlIGh0bWxcXG5odG1sKGxhbmc9J2VuJywgaXRlbXNjb3BlLCBpdGVtdHlwZT0naHR0cDovL3NjaGVtYS5vcmcvQmxvZycpXFxuICBoZWFkXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1ldGEoY2hhcnNldD0ndXRmLTgnKVxcbiAgICBsaW5rKHJlbD0nc2hvcnRjdXQgaWNvbicsIGhyZWY9Jy9mYXZpY29uLmljbycpXFxuICAgIG1ldGEoaHR0cC1lcXVpdj0nWC1VQS1Db21wYXRpYmxlJywgY29udGVudD0nSUU9ZWRnZSxjaHJvbWU9MScpXFxuICAgIG1ldGEobmFtZT0ndmlld3BvcnQnLCBjb250ZW50PSd3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MScpXFxuICAgIGxpbmsocmVsPSdzdHlsZXNoZWV0JywgdHlwZT0ndGV4dC9jc3MnLCBocmVmPScvY3NzL2FsbC5jc3MnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0naHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9VW5pY2ErT25lOjQwMHxQbGF5ZmFpcitEaXNwbGF5OjcwMHxNZWdyaW06NzAwfEZhdW5hK09uZTo0MDBpdGFsaWMsNDAwLDcwMCcpXFxuXFxuICBib2R5I3RvcFxcbiAgICBoZWFkZXJcXG4gICAgICBoMVxcbiAgICAgICAgYS5seS10aXRsZShocmVmPScvJywgYXJpYS1sYWJlbD0nR28gdG8gaG9tZScpIFRhdW51c1xcbiAgICAgIGgyLmx5LXN1YmhlYWRpbmcgTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXFxuXFxuICAgIGFzaWRlLnNiLXNpZGViYXJcXG4gICAgICBuYXYuc2ItY29udGFpbmVyXFxuICAgICAgICB1bC5udi1pdGVtc1xcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvJykgQWJvdXRcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2dldHRpbmctc3RhcnRlZCcpIEdldHRpbmcgU3RhcnRlZFxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvYXBpJykgQVBJIERvY3VtZW50YXRpb25cXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2NvbXBsZW1lbnRzJykgQ29tcGxlbWVudGFyeSBNb2R1bGVzXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9wZXJmb3JtYW5jZScpIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvc291cmNlLWNvZGUnKSBTb3VyY2UgQ29kZVxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvY2hhbmdlbG9nJykgQ2hhbmdlbG9nXFxuXFxuICAgIG1haW4ubHktbWFpbiNhcHBsaWNhdGlvbi1yb290KGRhdGEtdGF1bnVzPSdtb2RlbCcpIT1wYXJ0aWFsXFxuICAgIHNjcmlwdChzcmM9Jy9qcy9hbGwuanMnKVxcblwiKTtcbn1cbn0iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0ZW1wbGF0ZXMgPSB7XG4gICdkb2N1bWVudGF0aW9uL2Fib3V0JzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2FwaSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qcycpLFxuICAnZXJyb3Ivbm90LWZvdW5kJzogcmVxdWlyZSgnLi92aWV3cy9lcnJvci9ub3QtZm91bmQuanMnKSxcbiAgJ2xheW91dCc6IHJlcXVpcmUoJy4vdmlld3MvbGF5b3V0LmpzJylcbn07XG5cbnZhciBjb250cm9sbGVycyA9IHtcbiAgJ2RvY3VtZW50YXRpb24vYWJvdXQnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpXG59O1xuXG52YXIgcm91dGVzID0gW1xuICB7XG4gICAgcm91dGU6ICcvJyxcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2Fib3V0J1xuICB9LFxuICB7XG4gICAgcm91dGU6ICcvZ2V0dGluZy1zdGFydGVkJyxcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCdcbiAgfSxcbiAge1xuICAgIHJvdXRlOiAnL2FwaScsXG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hcGknXG4gIH0sXG4gIHtcbiAgICByb3V0ZTogJy9jb21wbGVtZW50cycsXG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cydcbiAgfSxcbiAge1xuICAgIHJvdXRlOiAnL3BlcmZvcm1hbmNlJyxcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlJ1xuICB9LFxuICB7XG4gICAgcm91dGU6ICcvc291cmNlLWNvZGUnLFxuICAgIGlnbm9yZTogdHJ1ZVxuICB9LFxuICB7XG4gICAgcm91dGU6ICcvY2hhbmdlbG9nJyxcbiAgICBpZ25vcmU6IHRydWVcbiAgfSxcbiAge1xuICAgIHJvdXRlOiAnLzpjYXRjaGFsbConLFxuICAgIGFjdGlvbjogJ2Vycm9yL25vdC1mb3VuZCdcbiAgfVxuXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXG4gIHJvdXRlczogcm91dGVzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc29sZS5sb2coJ1dlbGNvbWUgdG8gVGF1bnVzIGRvY3VtZW50YXRpb24gbWluaS1zaXRlIScpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyICQgPSByZXF1aXJlKCdkb21pbnVzJyk7XG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XG52YXIgdGhyb3R0bGUgPSByZXF1aXJlKCcuL3Rocm90dGxlJyk7XG52YXIgc2xvd1Njcm9sbENoZWNrID0gdGhyb3R0bGUoc2Nyb2xsQ2hlY2ssIDUwKTtcbnZhciBoeCA9IC9eaFsxLTZdJC9pO1xudmFyIGhlYWRpbmc7XG5cbmZ1bmN0aW9uIGNvbnZlbnRpb25zIChjb250YWluZXIpIHtcbiAgJCgnYm9keScpLm9uKCdjbGljaycsICdoMSxoMixoMyxoNCxoNSxoNicsIGhlYWRpbmdDbGljayk7XG5cbiAgcmFmKHNjcm9sbCk7XG59XG5cbmZ1bmN0aW9uIHNjcm9sbCAoKSB7XG4gIHNsb3dTY3JvbGxDaGVjaygpO1xuICByYWYoc2Nyb2xsKTtcbn1cblxuZnVuY3Rpb24gc2Nyb2xsQ2hlY2sgKCkge1xuICB2YXIgZm91bmQgPSAkKCdtYWluJykuZmluZCgnaDEsaDIsaDMsaDQsaDUsaDYnKS5maWx0ZXIoaW5WaWV3cG9ydCk7XG4gIGlmIChmb3VuZC5sZW5ndGggPT09IDAgfHwgaGVhZGluZyAmJiBmb3VuZFswXSA9PT0gaGVhZGluZ1swXSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoaGVhZGluZykge1xuICAgIGhlYWRpbmcucmVtb3ZlQ2xhc3MoJ3V2LWhpZ2hsaWdodCcpO1xuICB9XG4gIGhlYWRpbmcgPSBmb3VuZC5pKDApO1xuICBoZWFkaW5nLmFkZENsYXNzKCd1di1oaWdobGlnaHQnKTtcbn1cblxuZnVuY3Rpb24gaW5WaWV3cG9ydCAoZWxlbWVudCkge1xuICB2YXIgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHZhciB2aWV3YWJsZSA9IChcbiAgICBNYXRoLmNlaWwocmVjdC50b3ApID49IDAgJiZcbiAgICBNYXRoLmNlaWwocmVjdC5sZWZ0KSA+PSAwICYmXG4gICAgTWF0aC5mbG9vcihyZWN0LmJvdHRvbSkgPD0gKHdpbmRvdy5pbm5lckhlaWdodCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0KSAmJlxuICAgIE1hdGguZmxvb3IocmVjdC5yaWdodCkgPD0gKHdpbmRvdy5pbm5lcldpZHRoIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aClcbiAgKTtcbiAgcmV0dXJuIHZpZXdhYmxlO1xufVxuXG5mdW5jdGlvbiBmaW5kSGVhZGluZyAoZSkge1xuICB2YXIgaCA9IGUudGFyZ2V0O1xuICB3aGlsZSAoaCAmJiAhaHgudGVzdChoLnRhZ05hbWUpKSB7XG4gICAgaCA9IGgucGFyZW50RWxlbWVudDtcbiAgfVxuICByZXR1cm4gaDtcbn1cblxuZnVuY3Rpb24gaGVhZGluZ0NsaWNrIChlKSB7XG4gIHZhciBoID0gZmluZEhlYWRpbmcoZSk7XG4gIGlmIChoICYmIGguaWQpIHtcbiAgICB0YXVudXMubmF2aWdhdGUoJyMnICsgaC5pZCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjb252ZW50aW9ucztcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxuLy8gaW1wb3J0IHRoZSB0YXVudXMgbW9kdWxlXG52YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XG5cbi8vIGltcG9ydCB0aGUgd2lyaW5nIG1vZHVsZSBleHBvcnRlZCBieSBUYXVudXNcbnZhciB3aXJpbmcgPSByZXF1aXJlKCcuLi8uLi8uYmluL3dpcmluZycpO1xuXG4vLyBpbXBvcnQgY29udmVudGlvbnNcbnZhciBjb252ZW50aW9ucyA9IHJlcXVpcmUoJy4vY29udmVudGlvbnMnKTtcblxuLy8gZ2V0IHRoZSA8bWFpbj4gZWxlbWVudFxudmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwbGljYXRpb24tcm9vdCcpO1xuXG4vLyBzZXQgdXAgY29udmVudGlvbnMgdGhhdCBnZXQgZXhlY3V0ZWQgZm9yIGV2ZXJ5IHZpZXdcbnRhdW51cy5vbigncmVuZGVyJywgY29udmVudGlvbnMpO1xuXG4vLyBtb3VudCB0YXVudXMgc28gaXQgc3RhcnRzIGl0cyByb3V0aW5nIGVuZ2luZVxudGF1bnVzLm1vdW50KG1haW4sIHdpcmluZyk7XG5cbi8vIGNyZWF0ZSBnbG9iYWxzIHRvIG1ha2UgaXQgZWFzeSB0byBkZWJ1Z1xuLy8gZG9uJ3QgZG8gdGhpcyBpbiBwcm9kdWN0aW9uIVxuZ2xvYmFsLiQgPSByZXF1aXJlKCdkb21pbnVzJyk7XG5nbG9iYWwudGF1bnVzID0gdGF1bnVzO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gdGhyb3R0bGUgKGZuLCB0KSB7XG4gIHZhciBjYWNoZTtcbiAgdmFyIGxhc3QgPSAtMTtcbiAgcmV0dXJuIGZ1bmN0aW9uIHRocm90dGxlZCAoKSB7XG4gICAgdmFyIG5vdyA9IERhdGUubm93KCk7XG4gICAgaWYgKG5vdyAtIGxhc3QgPiB0KSB7XG4gICAgICBjYWNoZSA9IGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBsYXN0ID0gbm93O1xuICAgIH1cbiAgICByZXR1cm4gY2FjaGU7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdGhyb3R0bGU7XG5nbG9iYWwudGhyb3R0bGU9dGhyb3R0bGU7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwidmFyIHBvc2VyID0gcmVxdWlyZSgnLi9zcmMvbm9kZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBvc2VyO1xuXG5bJ0FycmF5JywgJ0Z1bmN0aW9uJywgJ09iamVjdCcsICdEYXRlJywgJ1N0cmluZyddLmZvckVhY2gocG9zZSk7XG5cbmZ1bmN0aW9uIHBvc2UgKHR5cGUpIHtcbiAgcG9zZXJbdHlwZV0gPSBmdW5jdGlvbiBwb3NlQ29tcHV0ZWRUeXBlICgpIHsgcmV0dXJuIHBvc2VyKHR5cGUpOyB9O1xufVxuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZCA9IGdsb2JhbC5kb2N1bWVudDtcblxuZnVuY3Rpb24gcG9zZXIgKHR5cGUpIHtcbiAgdmFyIGlmcmFtZSA9IGQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJyk7XG5cbiAgaWZyYW1lLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gIGQuYm9keS5hcHBlbmRDaGlsZChpZnJhbWUpO1xuXG4gIHJldHVybiBtYXAodHlwZSwgaWZyYW1lLmNvbnRlbnRXaW5kb3cpO1xufVxuXG5mdW5jdGlvbiBtYXAgKHR5cGUsIHNvdXJjZSkgeyAvLyBmb3J3YXJkIHBvbHlmaWxscyB0byB0aGUgc3RvbGVuIHJlZmVyZW5jZSFcbiAgdmFyIG9yaWdpbmFsID0gd2luZG93W3R5cGVdLnByb3RvdHlwZTtcbiAgdmFyIHZhbHVlID0gc291cmNlW3R5cGVdO1xuICB2YXIgcHJvcDtcblxuICBmb3IgKHByb3AgaW4gb3JpZ2luYWwpIHtcbiAgICB2YWx1ZS5wcm90b3R5cGVbcHJvcF0gPSBvcmlnaW5hbFtwcm9wXTtcbiAgfVxuXG4gIHJldHVybiB2YWx1ZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBwb3NlcjtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBleHBhbmRvID0gJ3Nla3Rvci0nICsgRGF0ZS5ub3coKTtcbnZhciByc2libGluZ3MgPSAvWyt+XS87XG52YXIgZG9jdW1lbnQgPSBnbG9iYWwuZG9jdW1lbnQ7XG52YXIgZGVsID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xudmFyIG1hdGNoID0gZGVsLm1hdGNoZXMgfHxcbiAgICAgICAgICAgIGRlbC53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHxcbiAgICAgICAgICAgIGRlbC5tb3pNYXRjaGVzU2VsZWN0b3IgfHxcbiAgICAgICAgICAgIGRlbC5vTWF0Y2hlc1NlbGVjdG9yIHx8XG4gICAgICAgICAgICBkZWwubXNNYXRjaGVzU2VsZWN0b3I7XG5cbmZ1bmN0aW9uIHFzYSAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgdmFyIGV4aXN0ZWQsIGlkLCBwcmVmaXgsIHByZWZpeGVkLCBhZGFwdGVyLCBoYWNrID0gY29udGV4dCAhPT0gZG9jdW1lbnQ7XG4gIGlmIChoYWNrKSB7IC8vIGlkIGhhY2sgZm9yIGNvbnRleHQtcm9vdGVkIHF1ZXJpZXNcbiAgICBleGlzdGVkID0gY29udGV4dC5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgaWQgPSBleGlzdGVkIHx8IGV4cGFuZG87XG4gICAgcHJlZml4ID0gJyMnICsgaWQgKyAnICc7XG4gICAgcHJlZml4ZWQgPSBwcmVmaXggKyBzZWxlY3Rvci5yZXBsYWNlKC8sL2csICcsJyArIHByZWZpeCk7XG4gICAgYWRhcHRlciA9IHJzaWJsaW5ncy50ZXN0KHNlbGVjdG9yKSAmJiBjb250ZXh0LnBhcmVudE5vZGU7XG4gICAgaWYgKCFleGlzdGVkKSB7IGNvbnRleHQuc2V0QXR0cmlidXRlKCdpZCcsIGlkKTsgfVxuICB9XG4gIHRyeSB7XG4gICAgcmV0dXJuIChhZGFwdGVyIHx8IGNvbnRleHQpLnF1ZXJ5U2VsZWN0b3JBbGwocHJlZml4ZWQgfHwgc2VsZWN0b3IpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9IGZpbmFsbHkge1xuICAgIGlmIChleGlzdGVkID09PSBudWxsKSB7IGNvbnRleHQucmVtb3ZlQXR0cmlidXRlKCdpZCcpOyB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZmluZCAoc2VsZWN0b3IsIGN0eCwgY29sbGVjdGlvbiwgc2VlZCkge1xuICB2YXIgZWxlbWVudDtcbiAgdmFyIGNvbnRleHQgPSBjdHggfHwgZG9jdW1lbnQ7XG4gIHZhciByZXN1bHRzID0gY29sbGVjdGlvbiB8fCBbXTtcbiAgdmFyIGkgPSAwO1xuICBpZiAodHlwZW9mIHNlbGVjdG9yICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG4gIGlmIChjb250ZXh0Lm5vZGVUeXBlICE9PSAxICYmIGNvbnRleHQubm9kZVR5cGUgIT09IDkpIHtcbiAgICByZXR1cm4gW107IC8vIGJhaWwgaWYgY29udGV4dCBpcyBub3QgYW4gZWxlbWVudCBvciBkb2N1bWVudFxuICB9XG4gIGlmIChzZWVkKSB7XG4gICAgd2hpbGUgKChlbGVtZW50ID0gc2VlZFtpKytdKSkge1xuICAgICAgaWYgKG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvcikpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICByZXN1bHRzLnB1c2guYXBwbHkocmVzdWx0cywgcXNhKHNlbGVjdG9yLCBjb250ZXh0KSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXMgKHNlbGVjdG9yLCBlbGVtZW50cykge1xuICByZXR1cm4gZmluZChzZWxlY3RvciwgbnVsbCwgbnVsbCwgZWxlbWVudHMpO1xufVxuXG5mdW5jdGlvbiBtYXRjaGVzU2VsZWN0b3IgKGVsZW1lbnQsIHNlbGVjdG9yKSB7XG4gIHJldHVybiBtYXRjaC5jYWxsKGVsZW1lbnQsIHNlbGVjdG9yKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmaW5kO1xuXG5maW5kLm1hdGNoZXMgPSBtYXRjaGVzO1xuZmluZC5tYXRjaGVzU2VsZWN0b3IgPSBtYXRjaGVzU2VsZWN0b3I7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcG9zZXIgPSByZXF1aXJlKCdwb3NlcicpO1xudmFyIERvbWludXMgPSBwb3Nlci5BcnJheSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IERvbWludXM7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciAkID0gcmVxdWlyZSgnLi9wdWJsaWMnKTtcbnZhciBjb3JlID0gcmVxdWlyZSgnLi9jb3JlJyk7XG52YXIgZG9tID0gcmVxdWlyZSgnLi9kb20nKTtcbnZhciBjbGFzc2VzID0gcmVxdWlyZSgnLi9jbGFzc2VzJyk7XG52YXIgRG9taW51cyA9IHJlcXVpcmUoJy4vRG9taW51cy5jdG9yJyk7XG5cbmZ1bmN0aW9uIGVxdWFscyAoc2VsZWN0b3IpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGVxdWFscyAoZWxlbSkge1xuICAgIHJldHVybiBkb20ubWF0Y2hlcyhlbGVtLCBzZWxlY3Rvcik7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHN0cmFpZ2h0IChwcm9wLCBvbmUpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGRvbU1hcHBpbmcgKHNlbGVjdG9yKSB7XG4gICAgdmFyIHJlc3VsdCA9IHRoaXMubWFwKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgICByZXR1cm4gZG9tW3Byb3BdKGVsZW0sIHNlbGVjdG9yKTtcbiAgICB9KTtcbiAgICB2YXIgcmVzdWx0cyA9IGNvcmUuZmxhdHRlbihyZXN1bHQpO1xuICAgIHJldHVybiBvbmUgPyByZXN1bHRzWzBdIDogcmVzdWx0cztcbiAgfTtcbn1cblxuRG9taW51cy5wcm90b3R5cGUucHJldiA9IHN0cmFpZ2h0KCdwcmV2Jyk7XG5Eb21pbnVzLnByb3RvdHlwZS5uZXh0ID0gc3RyYWlnaHQoJ25leHQnKTtcbkRvbWludXMucHJvdG90eXBlLnBhcmVudCA9IHN0cmFpZ2h0KCdwYXJlbnQnKTtcbkRvbWludXMucHJvdG90eXBlLnBhcmVudHMgPSBzdHJhaWdodCgncGFyZW50cycpO1xuRG9taW51cy5wcm90b3R5cGUuY2hpbGRyZW4gPSBzdHJhaWdodCgnY2hpbGRyZW4nKTtcbkRvbWludXMucHJvdG90eXBlLmZpbmQgPSBzdHJhaWdodCgncXNhJyk7XG5Eb21pbnVzLnByb3RvdHlwZS5maW5kT25lID0gc3RyYWlnaHQoJ3FzJywgdHJ1ZSk7XG5cbkRvbWludXMucHJvdG90eXBlLndoZXJlID0gZnVuY3Rpb24gKHNlbGVjdG9yKSB7XG4gIHJldHVybiB0aGlzLmZpbHRlcihlcXVhbHMoc2VsZWN0b3IpKTtcbn07XG5cbkRvbWludXMucHJvdG90eXBlLmlzID0gZnVuY3Rpb24gKHNlbGVjdG9yKSB7XG4gIHJldHVybiB0aGlzLnNvbWUoZXF1YWxzKHNlbGVjdG9yKSk7XG59O1xuXG5Eb21pbnVzLnByb3RvdHlwZS5pID0gZnVuY3Rpb24gKGluZGV4KSB7XG4gIHJldHVybiBuZXcgRG9taW51cyh0aGlzW2luZGV4XSk7XG59O1xuXG5mdW5jdGlvbiBjb21wYXJlRmFjdG9yeSAoZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGNvbXBhcmUgKCkge1xuICAgICQuYXBwbHkobnVsbCwgYXJndW1lbnRzKS5mb3JFYWNoKGZuLCB0aGlzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfTtcbn1cblxuRG9taW51cy5wcm90b3R5cGUuYW5kID0gY29tcGFyZUZhY3RvcnkoZnVuY3Rpb24gYWRkT25lIChlbGVtKSB7XG4gIGlmICh0aGlzLmluZGV4T2YoZWxlbSkgPT09IC0xKSB7XG4gICAgdGhpcy5wdXNoKGVsZW0pO1xuICB9XG4gIHJldHVybiB0aGlzO1xufSk7XG5cbkRvbWludXMucHJvdG90eXBlLmJ1dCA9IGNvbXBhcmVGYWN0b3J5KGZ1bmN0aW9uIGFkZE9uZSAoZWxlbSkge1xuICB2YXIgaW5kZXggPSB0aGlzLmluZGV4T2YoZWxlbSk7XG4gIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICB0aGlzLnNwbGljZShpbmRleCwgMSk7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59KTtcblxuRG9taW51cy5wcm90b3R5cGUuY3NzID0gZnVuY3Rpb24gKG5hbWUsIHZhbHVlKSB7XG4gIHZhciBwcm9wcztcbiAgdmFyIG1hbnkgPSBuYW1lICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JztcbiAgdmFyIGdldHRlciA9ICFtYW55ICYmICF2YWx1ZTtcbiAgaWYgKGdldHRlcikge1xuICAgIHJldHVybiB0aGlzLmxlbmd0aCA/IGRvbS5nZXRDc3ModGhpc1swXSwgbmFtZSkgOiBudWxsO1xuICB9XG4gIGlmIChtYW55KSB7XG4gICAgcHJvcHMgPSBuYW1lO1xuICB9IGVsc2Uge1xuICAgIHByb3BzID0ge307XG4gICAgcHJvcHNbbmFtZV0gPSB2YWx1ZTtcbiAgfVxuICB0aGlzLmZvckVhY2goZG9tLnNldENzcyhwcm9wcykpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkRvbWludXMucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKHR5cGVzLCBmaWx0ZXIsIGZuKSB7XG4gIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgIHR5cGVzLnNwbGl0KCcgJykuZm9yRWFjaChmdW5jdGlvbiAodHlwZSkge1xuICAgICAgZG9tLm9uKGVsZW0sIHR5cGUsIGZpbHRlciwgZm4pO1xuICAgIH0pO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5Eb21pbnVzLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbiAodHlwZXMsIGZpbHRlciwgZm4pIHtcbiAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgdHlwZXMuc3BsaXQoJyAnKS5mb3JFYWNoKGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICBkb20ub2ZmKGVsZW0sIHR5cGUsIGZpbHRlciwgZm4pO1xuICAgIH0pO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5bXG4gIFsnYWRkQ2xhc3MnLCBjbGFzc2VzLmFkZF0sXG4gIFsncmVtb3ZlQ2xhc3MnLCBjbGFzc2VzLnJlbW92ZV0sXG4gIFsnc2V0Q2xhc3MnLCBjbGFzc2VzLnNldF0sXG4gIFsncmVtb3ZlQ2xhc3MnLCBjbGFzc2VzLnJlbW92ZV0sXG4gIFsncmVtb3ZlJywgZG9tLnJlbW92ZV1cbl0uZm9yRWFjaChtYXBNZXRob2RzKTtcblxuZnVuY3Rpb24gbWFwTWV0aG9kcyAoZGF0YSkge1xuICBEb21pbnVzLnByb3RvdHlwZVtkYXRhWzBdXSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgICAgZGF0YVsxXShlbGVtLCB2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG59XG5cbltcbiAgWydhcHBlbmQnLCBkb20uYXBwZW5kXSxcbiAgWydhcHBlbmRUbycsIGRvbS5hcHBlbmRUb10sXG4gIFsncHJlcGVuZCcsIGRvbS5wcmVwZW5kXSxcbiAgWydwcmVwZW5kVG8nLCBkb20ucHJlcGVuZFRvXSxcbiAgWydiZWZvcmUnLCBkb20uYmVmb3JlXSxcbiAgWydiZWZvcmVPZicsIGRvbS5iZWZvcmVPZl0sXG4gIFsnYWZ0ZXInLCBkb20uYWZ0ZXJdLFxuICBbJ2FmdGVyT2YnLCBkb20uYWZ0ZXJPZl0sXG4gIFsnc2hvdycsIGRvbS5zaG93XSxcbiAgWydoaWRlJywgZG9tLmhpZGVdXG5dLmZvckVhY2gobWFwTWFuaXB1bGF0aW9uKTtcblxuZnVuY3Rpb24gbWFwTWFuaXB1bGF0aW9uIChkYXRhKSB7XG4gIERvbWludXMucHJvdG90eXBlW2RhdGFbMF1dID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgZGF0YVsxXSh0aGlzLCB2YWx1ZSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG59XG5cbkRvbWludXMucHJvdG90eXBlLmhhc0NsYXNzID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gIHJldHVybiB0aGlzLnNvbWUoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICByZXR1cm4gY2xhc3Nlcy5jb250YWlucyhlbGVtLCB2YWx1ZSk7XG4gIH0pO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUuYXR0ciA9IGZ1bmN0aW9uIChuYW1lLCB2YWx1ZSkge1xuICB2YXIgaGFzaCA9IG5hbWUgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnO1xuICB2YXIgc2V0ID0gaGFzaCA/IHNldE1hbnkgOiBzZXRTaW5nbGU7XG4gIHZhciBzZXR0ZXIgPSBoYXNoIHx8IGFyZ3VtZW50cy5sZW5ndGggPiAxO1xuICBpZiAoc2V0dGVyKSB7XG4gICAgdGhpcy5mb3JFYWNoKHNldCk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHRoaXMubGVuZ3RoID8gZG9tLmdldEF0dHIodGhpc1swXSwgbmFtZSkgOiBudWxsO1xuICB9XG4gIGZ1bmN0aW9uIHNldE1hbnkgKGVsZW0pIHtcbiAgICBkb20ubWFueUF0dHIoZWxlbSwgbmFtZSk7XG4gIH1cbiAgZnVuY3Rpb24gc2V0U2luZ2xlIChlbGVtKSB7XG4gICAgZG9tLmF0dHIoZWxlbSwgbmFtZSwgdmFsdWUpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBrZXlWYWx1ZSAoa2V5LCB2YWx1ZSkge1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gdGhpcy5sZW5ndGggPyBkb21ba2V5XSh0aGlzWzBdKSA6ICcnO1xuICB9XG4gIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgIGRvbVtrZXldKGVsZW0sIHZhbHVlKTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBrZXlWYWx1ZVByb3BlcnR5IChwcm9wKSB7XG4gIERvbWludXMucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24gYWNjZXNzb3IgKHZhbHVlKSB7XG4gICAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAxO1xuICAgIGlmIChnZXR0ZXIpIHtcbiAgICAgIHJldHVybiBrZXlWYWx1ZS5jYWxsKHRoaXMsIHByb3ApO1xuICAgIH1cbiAgICByZXR1cm4ga2V5VmFsdWUuY2FsbCh0aGlzLCBwcm9wLCB2YWx1ZSk7XG4gIH07XG59XG5cblsnaHRtbCcsICd0ZXh0JywgJ3ZhbHVlJ10uZm9yRWFjaChrZXlWYWx1ZVByb3BlcnR5KTtcblxuRG9taW51cy5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLm1hcChmdW5jdGlvbiAoZWxlbSkge1xuICAgIHJldHVybiBkb20uY2xvbmUoZWxlbSk7XG4gIH0pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3B1YmxpYycpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdHJpbSA9IC9eXFxzK3xcXHMrJC9nO1xudmFyIHdoaXRlc3BhY2UgPSAvXFxzKy9nO1xuXG5mdW5jdGlvbiBpbnRlcnByZXQgKGlucHV0KSB7XG4gIHJldHVybiB0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnID8gaW5wdXQucmVwbGFjZSh0cmltLCAnJykuc3BsaXQod2hpdGVzcGFjZSkgOiBpbnB1dDtcbn1cblxuZnVuY3Rpb24gY2xhc3NlcyAobm9kZSkge1xuICByZXR1cm4gbm9kZS5jbGFzc05hbWUucmVwbGFjZSh0cmltLCAnJykuc3BsaXQod2hpdGVzcGFjZSk7XG59XG5cbmZ1bmN0aW9uIHNldCAobm9kZSwgaW5wdXQpIHtcbiAgbm9kZS5jbGFzc05hbWUgPSBpbnRlcnByZXQoaW5wdXQpLmpvaW4oJyAnKTtcbn1cblxuZnVuY3Rpb24gYWRkIChub2RlLCBpbnB1dCkge1xuICB2YXIgY3VycmVudCA9IHJlbW92ZShub2RlLCBpbnB1dCk7XG4gIHZhciB2YWx1ZXMgPSBpbnRlcnByZXQoaW5wdXQpO1xuICBjdXJyZW50LnB1c2guYXBwbHkoY3VycmVudCwgdmFsdWVzKTtcbiAgc2V0KG5vZGUsIGN1cnJlbnQpO1xuICByZXR1cm4gY3VycmVudDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlIChub2RlLCBpbnB1dCkge1xuICB2YXIgY3VycmVudCA9IGNsYXNzZXMobm9kZSk7XG4gIHZhciB2YWx1ZXMgPSBpbnRlcnByZXQoaW5wdXQpO1xuICB2YWx1ZXMuZm9yRWFjaChmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgaSA9IGN1cnJlbnQuaW5kZXhPZih2YWx1ZSk7XG4gICAgaWYgKGkgIT09IC0xKSB7XG4gICAgICBjdXJyZW50LnNwbGljZShpLCAxKTtcbiAgICB9XG4gIH0pO1xuICBzZXQobm9kZSwgY3VycmVudCk7XG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBjb250YWlucyAobm9kZSwgaW5wdXQpIHtcbiAgdmFyIGN1cnJlbnQgPSBjbGFzc2VzKG5vZGUpO1xuICB2YXIgdmFsdWVzID0gaW50ZXJwcmV0KGlucHV0KTtcblxuICByZXR1cm4gdmFsdWVzLmV2ZXJ5KGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBjdXJyZW50LmluZGV4T2YodmFsdWUpICE9PSAtMTtcbiAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZCxcbiAgcmVtb3ZlOiByZW1vdmUsXG4gIGNvbnRhaW5zOiBjb250YWlucyxcbiAgc2V0OiBzZXQsXG4gIGdldDogY2xhc3Nlc1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRlc3QgPSByZXF1aXJlKCcuL3Rlc3QnKTtcbnZhciBEb21pbnVzID0gcmVxdWlyZSgnLi9Eb21pbnVzLmN0b3InKTtcbnZhciBwcm90byA9IERvbWludXMucHJvdG90eXBlO1xuXG5mdW5jdGlvbiBBcHBsaWVkIChhcmdzKSB7XG4gIHJldHVybiBEb21pbnVzLmFwcGx5KHRoaXMsIGFyZ3MpO1xufVxuXG5BcHBsaWVkLnByb3RvdHlwZSA9IHByb3RvO1xuXG5bJ21hcCcsICdmaWx0ZXInLCAnY29uY2F0J10uZm9yRWFjaChlbnN1cmUpO1xuXG5mdW5jdGlvbiBlbnN1cmUgKGtleSkge1xuICB2YXIgb3JpZ2luYWwgPSBwcm90b1trZXldO1xuICBwcm90b1trZXldID0gZnVuY3Rpb24gYXBwbGllZCAoKSB7XG4gICAgcmV0dXJuIGFwcGx5KG9yaWdpbmFsLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykpO1xuICB9O1xufVxuXG5mdW5jdGlvbiBhcHBseSAoYSkge1xuICByZXR1cm4gbmV3IEFwcGxpZWQoYSk7XG59XG5cbmZ1bmN0aW9uIGNhc3QgKGEpIHtcbiAgaWYgKGEgaW5zdGFuY2VvZiBEb21pbnVzKSB7XG4gICAgcmV0dXJuIGE7XG4gIH1cbiAgaWYgKCFhKSB7XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH1cbiAgaWYgKHRlc3QuaXNFbGVtZW50KGEpKSB7XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKGEpO1xuICB9XG4gIGlmICghdGVzdC5pc0FycmF5KGEpKSB7XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH1cbiAgcmV0dXJuIGFwcGx5KGEpLmZpbHRlcihmdW5jdGlvbiAoaSkge1xuICAgIHJldHVybiB0ZXN0LmlzRWxlbWVudChpKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4gKGEsIGNhY2hlKSB7XG4gIHJldHVybiBhLnJlZHVjZShmdW5jdGlvbiAoY3VycmVudCwgaXRlbSkge1xuICAgIGlmIChEb21pbnVzLmlzQXJyYXkoaXRlbSkpIHtcbiAgICAgIHJldHVybiBmbGF0dGVuKGl0ZW0sIGN1cnJlbnQpO1xuICAgIH0gZWxzZSBpZiAoY3VycmVudC5pbmRleE9mKGl0ZW0pID09PSAtMSkge1xuICAgICAgcmV0dXJuIGN1cnJlbnQuY29uY2F0KGl0ZW0pO1xuICAgIH1cbiAgICByZXR1cm4gY3VycmVudDtcbiAgfSwgY2FjaGUgfHwgbmV3IERvbWludXMoKSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhcHBseTogYXBwbHksXG4gIGNhc3Q6IGNhc3QsXG4gIGZsYXR0ZW46IGZsYXR0ZW5cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzZWt0b3IgPSByZXF1aXJlKCdzZWt0b3InKTtcbnZhciBEb21pbnVzID0gcmVxdWlyZSgnLi9Eb21pbnVzLmN0b3InKTtcbnZhciBjb3JlID0gcmVxdWlyZSgnLi9jb3JlJyk7XG52YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcbnZhciB0ZXh0ID0gcmVxdWlyZSgnLi90ZXh0Jyk7XG52YXIgdGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpO1xudmFyIGFwaSA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgZGVsZWdhdGVzID0ge307XG5cbmZ1bmN0aW9uIGNhc3RDb250ZXh0IChjb250ZXh0KSB7XG4gIGlmICh0eXBlb2YgY29udGV4dCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gYXBpLnFzKG51bGwsIGNvbnRleHQpO1xuICB9XG4gIGlmICh0ZXN0LmlzRWxlbWVudChjb250ZXh0KSkge1xuICAgIHJldHVybiBjb250ZXh0O1xuICB9XG4gIGlmIChjb250ZXh0IGluc3RhbmNlb2YgRG9taW51cykge1xuICAgIHJldHVybiBjb250ZXh0WzBdO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5hcGkucXNhID0gZnVuY3Rpb24gKGVsZW0sIHNlbGVjdG9yKSB7XG4gIHZhciByZXN1bHRzID0gbmV3IERvbWludXMoKTtcbiAgcmV0dXJuIHNla3RvcihzZWxlY3RvciwgY2FzdENvbnRleHQoZWxlbSksIHJlc3VsdHMpO1xufTtcblxuYXBpLnFzID0gZnVuY3Rpb24gKGVsZW0sIHNlbGVjdG9yKSB7XG4gIHJldHVybiBhcGkucXNhKGVsZW0sIHNlbGVjdG9yKVswXTtcbn07XG5cbmFwaS5tYXRjaGVzID0gZnVuY3Rpb24gKGVsZW0sIHNlbGVjdG9yKSB7XG4gIHJldHVybiBzZWt0b3IubWF0Y2hlc1NlbGVjdG9yKGVsZW0sIHNlbGVjdG9yKTtcbn07XG5cbmZ1bmN0aW9uIHJlbGF0ZWRGYWN0b3J5IChwcm9wKSB7XG4gIHJldHVybiBmdW5jdGlvbiByZWxhdGVkIChlbGVtLCBzZWxlY3Rvcikge1xuICAgIHZhciByZWxhdGl2ZSA9IGVsZW1bcHJvcF07XG4gICAgaWYgKHJlbGF0aXZlKSB7XG4gICAgICBpZiAoIXNlbGVjdG9yIHx8IGFwaS5tYXRjaGVzKHJlbGF0aXZlLCBzZWxlY3RvcikpIHtcbiAgICAgICAgcmV0dXJuIGNvcmUuY2FzdChyZWxhdGl2ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuZXcgRG9taW51cygpO1xuICB9O1xufVxuXG5hcGkucHJldiA9IHJlbGF0ZWRGYWN0b3J5KCdwcmV2aW91c0VsZW1lbnRTaWJsaW5nJyk7XG5hcGkubmV4dCA9IHJlbGF0ZWRGYWN0b3J5KCduZXh0RWxlbWVudFNpYmxpbmcnKTtcbmFwaS5wYXJlbnQgPSByZWxhdGVkRmFjdG9yeSgncGFyZW50RWxlbWVudCcpO1xuXG5mdW5jdGlvbiBtYXRjaGVzIChlbGVtLCB2YWx1ZSkge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRG9taW51cykge1xuICAgIHJldHVybiB2YWx1ZS5pbmRleE9mKGVsZW0pICE9PSAtMTtcbiAgfVxuICBpZiAodGVzdC5pc0VsZW1lbnQodmFsdWUpKSB7XG4gICAgcmV0dXJuIGVsZW0gPT09IHZhbHVlO1xuICB9XG4gIHJldHVybiBhcGkubWF0Y2hlcyhlbGVtLCB2YWx1ZSk7XG59XG5cbmFwaS5wYXJlbnRzID0gZnVuY3Rpb24gKGVsZW0sIHZhbHVlKSB7XG4gIHZhciBub2RlcyA9IFtdO1xuICB2YXIgbm9kZSA9IGVsZW07XG4gIHdoaWxlIChub2RlLnBhcmVudEVsZW1lbnQpIHtcbiAgICBpZiAobWF0Y2hlcyhub2RlLnBhcmVudEVsZW1lbnQsIHZhbHVlKSkge1xuICAgICAgbm9kZXMucHVzaChub2RlLnBhcmVudEVsZW1lbnQpO1xuICAgIH1cbiAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBjb3JlLmFwcGx5KG5vZGVzKTtcbn07XG5cbmFwaS5jaGlsZHJlbiA9IGZ1bmN0aW9uIChlbGVtLCB2YWx1ZSkge1xuICB2YXIgbm9kZXMgPSBbXTtcbiAgdmFyIGNoaWxkcmVuID0gZWxlbS5jaGlsZHJlbjtcbiAgdmFyIGNoaWxkO1xuICB2YXIgaTtcbiAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgY2hpbGQgPSBjaGlsZHJlbltpXTtcbiAgICBpZiAobWF0Y2hlcyhjaGlsZCwgdmFsdWUpKSB7XG4gICAgICBub2Rlcy5wdXNoKGNoaWxkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvcmUuYXBwbHkobm9kZXMpO1xufTtcblxuLy8gdGhpcyBtZXRob2QgY2FjaGVzIGRlbGVnYXRlcyBzbyB0aGF0IC5vZmYoKSB3b3JrcyBzZWFtbGVzc2x5XG5mdW5jdGlvbiBkZWxlZ2F0ZSAocm9vdCwgZmlsdGVyLCBmbikge1xuICBpZiAoZGVsZWdhdGVzW2ZuLl9kZF0pIHtcbiAgICByZXR1cm4gZGVsZWdhdGVzW2ZuLl9kZF07XG4gIH1cbiAgZm4uX2RkID0gRGF0ZS5ub3coKTtcbiAgZGVsZWdhdGVzW2ZuLl9kZF0gPSBkZWxlZ2F0b3I7XG4gIGZ1bmN0aW9uIGRlbGVnYXRvciAoZSkge1xuICAgIHZhciBlbGVtID0gZS50YXJnZXQ7XG4gICAgd2hpbGUgKGVsZW0gJiYgZWxlbSAhPT0gcm9vdCkge1xuICAgICAgaWYgKGFwaS5tYXRjaGVzKGVsZW0sIGZpbHRlcikpIHtcbiAgICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTsgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZWxlbSA9IGVsZW0ucGFyZW50RWxlbWVudDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlbGVnYXRvcjtcbn1cblxuYXBpLm9uID0gZnVuY3Rpb24gKGVsZW0sIHR5cGUsIGZpbHRlciwgZm4pIHtcbiAgaWYgKGZuID09PSB2b2lkIDApIHtcbiAgICBldmVudHMuYWRkKGVsZW0sIHR5cGUsIGZpbHRlcik7IC8vIGZpbHRlciBfaXNfIGZuXG4gIH0gZWxzZSB7XG4gICAgZXZlbnRzLmFkZChlbGVtLCB0eXBlLCBkZWxlZ2F0ZShlbGVtLCBmaWx0ZXIsIGZuKSk7XG4gIH1cbn07XG5cbmFwaS5vZmYgPSBmdW5jdGlvbiAoZWxlbSwgdHlwZSwgZmlsdGVyLCBmbikge1xuICBpZiAoZm4gPT09IHZvaWQgMCkge1xuICAgIGV2ZW50cy5yZW1vdmUoZWxlbSwgdHlwZSwgZmlsdGVyKTsgLy8gZmlsdGVyIF9pc18gZm5cbiAgfSBlbHNlIHtcbiAgICBldmVudHMucmVtb3ZlKGVsZW0sIHR5cGUsIGRlbGVnYXRlKGVsZW0sIGZpbHRlciwgZm4pKTtcbiAgfVxufTtcblxuYXBpLmh0bWwgPSBmdW5jdGlvbiAoZWxlbSwgaHRtbCkge1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gZWxlbS5pbm5lckhUTUw7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5pbm5lckhUTUwgPSBodG1sO1xuICB9XG59O1xuXG5hcGkudGV4dCA9IGZ1bmN0aW9uIChlbGVtLCB0ZXh0KSB7XG4gIHZhciBjaGVja2FibGUgPSB0ZXN0LmlzQ2hlY2thYmxlKGVsZW0pO1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gY2hlY2thYmxlID8gZWxlbS52YWx1ZSA6IGVsZW0uaW5uZXJUZXh0IHx8IGVsZW0udGV4dENvbnRlbnQ7XG4gIH0gZWxzZSBpZiAoY2hlY2thYmxlKSB7XG4gICAgZWxlbS52YWx1ZSA9IHRleHQ7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5pbm5lclRleHQgPSBlbGVtLnRleHRDb250ZW50ID0gdGV4dDtcbiAgfVxufTtcblxuYXBpLnZhbHVlID0gZnVuY3Rpb24gKGVsZW0sIHZhbHVlKSB7XG4gIHZhciBjaGVja2FibGUgPSB0ZXN0LmlzQ2hlY2thYmxlKGVsZW0pO1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gY2hlY2thYmxlID8gZWxlbS5jaGVja2VkIDogZWxlbS52YWx1ZTtcbiAgfSBlbHNlIGlmIChjaGVja2FibGUpIHtcbiAgICBlbGVtLmNoZWNrZWQgPSB2YWx1ZTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLnZhbHVlID0gdmFsdWU7XG4gIH1cbn07XG5cbmFwaS5hdHRyID0gZnVuY3Rpb24gKGVsZW0sIG5hbWUsIHZhbHVlKSB7XG4gIHZhciBjYW1lbCA9IHRleHQuaHlwaGVuVG9DYW1lbChuYW1lKTtcbiAgaWYgKGNhbWVsIGluIGVsZW0pIHtcbiAgICBlbGVtW2NhbWVsXSA9IHZhbHVlO1xuICB9IGVsc2UgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB2b2lkIDApIHtcbiAgICBlbGVtLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG4gIH1cbn07XG5cbmFwaS5nZXRBdHRyID0gZnVuY3Rpb24gKGVsZW0sIG5hbWUpIHtcbiAgdmFyIGNhbWVsID0gdGV4dC5oeXBoZW5Ub0NhbWVsKG5hbWUpO1xuICBpZiAoY2FtZWwgaW4gZWxlbSkge1xuICAgIHJldHVybiBlbGVtW2NhbWVsXTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZWxlbS5nZXRBdHRyaWJ1dGUobmFtZSk7XG4gIH1cbn07XG5cbmFwaS5tYW55QXR0ciA9IGZ1bmN0aW9uIChlbGVtLCBhdHRycykge1xuICBPYmplY3Qua2V5cyhhdHRycykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cikge1xuICAgIGFwaS5hdHRyKGVsZW0sIGF0dHIsIGF0dHJzW2F0dHJdKTtcbiAgfSk7XG59O1xuXG5hcGkubWFrZSA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gIHJldHVybiBuZXcgRG9taW51cyhkb2N1bWVudC5jcmVhdGVFbGVtZW50KHR5cGUpKTtcbn07XG5cbmFwaS5jbG9uZSA9IGZ1bmN0aW9uIChlbGVtKSB7XG4gIHJldHVybiBlbGVtLmNsb25lTm9kZSh0cnVlKTtcbn07XG5cbmFwaS5yZW1vdmUgPSBmdW5jdGlvbiAoZWxlbSkge1xuICBpZiAoZWxlbS5wYXJlbnRFbGVtZW50KSB7XG4gICAgZWxlbS5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKGVsZW0pO1xuICB9XG59O1xuXG5hcGkuYXBwZW5kID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICBpZiAobWFuaXB1bGF0aW9uR3VhcmQoZWxlbSwgdGFyZ2V0LCBhcGkuYXBwZW5kKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBlbGVtLmFwcGVuZENoaWxkKHRhcmdldCk7XG59O1xuXG5hcGkucHJlcGVuZCA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgaWYgKG1hbmlwdWxhdGlvbkd1YXJkKGVsZW0sIHRhcmdldCwgYXBpLnByZXBlbmQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGVsZW0uaW5zZXJ0QmVmb3JlKHRhcmdldCwgZWxlbS5maXJzdENoaWxkKTtcbn07XG5cbmFwaS5iZWZvcmUgPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gIGlmIChtYW5pcHVsYXRpb25HdWFyZChlbGVtLCB0YXJnZXQsIGFwaS5iZWZvcmUpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChlbGVtLnBhcmVudEVsZW1lbnQpIHtcbiAgICBlbGVtLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHRhcmdldCwgZWxlbSk7XG4gIH1cbn07XG5cbmFwaS5hZnRlciA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgaWYgKG1hbmlwdWxhdGlvbkd1YXJkKGVsZW0sIHRhcmdldCwgYXBpLmFmdGVyKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoZWxlbS5wYXJlbnRFbGVtZW50KSB7XG4gICAgZWxlbS5wYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZSh0YXJnZXQsIGVsZW0ubmV4dFNpYmxpbmcpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBtYW5pcHVsYXRpb25HdWFyZCAoZWxlbSwgdGFyZ2V0LCBmbikge1xuICB2YXIgcmlnaHQgPSB0YXJnZXQgaW5zdGFuY2VvZiBEb21pbnVzO1xuICB2YXIgbGVmdCA9IGVsZW0gaW5zdGFuY2VvZiBEb21pbnVzO1xuICBpZiAobGVmdCkge1xuICAgIGVsZW0uZm9yRWFjaChtYW5pcHVsYXRlTWFueSk7XG4gIH0gZWxzZSBpZiAocmlnaHQpIHtcbiAgICBtYW5pcHVsYXRlKGVsZW0sIHRydWUpO1xuICB9XG4gIHJldHVybiBsZWZ0IHx8IHJpZ2h0O1xuXG4gIGZ1bmN0aW9uIG1hbmlwdWxhdGUgKGVsZW0sIHByZWNvbmRpdGlvbikge1xuICAgIGlmIChyaWdodCkge1xuICAgICAgdGFyZ2V0LmZvckVhY2goZnVuY3Rpb24gKHRhcmdldCwgaikge1xuICAgICAgICBmbihlbGVtLCBjbG9uZVVubGVzcyh0YXJnZXQsIHByZWNvbmRpdGlvbiAmJiBqID09PSAwKSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZm4oZWxlbSwgY2xvbmVVbmxlc3ModGFyZ2V0LCBwcmVjb25kaXRpb24pKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBtYW5pcHVsYXRlTWFueSAoZWxlbSwgaSkge1xuICAgIG1hbmlwdWxhdGUoZWxlbSwgaSA9PT0gMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVVbmxlc3MgKHRhcmdldCwgY29uZGl0aW9uKSB7XG4gIHJldHVybiBjb25kaXRpb24gPyB0YXJnZXQgOiBhcGkuY2xvbmUodGFyZ2V0KTtcbn1cblxuWydhcHBlbmRUbycsICdwcmVwZW5kVG8nLCAnYmVmb3JlT2YnLCAnYWZ0ZXJPZiddLmZvckVhY2goZmxpcCk7XG5cbmZ1bmN0aW9uIGZsaXAgKGtleSkge1xuICB2YXIgb3JpZ2luYWwgPSBrZXkuc3BsaXQoL1tBLVpdLylbMF07XG4gIGFwaVtrZXldID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICAgIGFwaVtvcmlnaW5hbF0odGFyZ2V0LCBlbGVtKTtcbiAgfTtcbn1cblxuYXBpLnNob3cgPSBmdW5jdGlvbiAoZWxlbSwgc2hvdWxkLCBpbnZlcnQpIHtcbiAgaWYgKGVsZW0gaW5zdGFuY2VvZiBEb21pbnVzKSB7XG4gICAgZWxlbS5mb3JFYWNoKHNob3dUZXN0KTtcbiAgfSBlbHNlIHtcbiAgICBzaG93VGVzdChlbGVtKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dUZXN0IChjdXJyZW50KSB7XG4gICAgdmFyIG9rID0gc2hvdWxkID09PSB2b2lkIDAgfHwgc2hvdWxkID09PSB0cnVlIHx8IHR5cGVvZiBzaG91bGQgPT09ICdmdW5jdGlvbicgJiYgc2hvdWxkLmNhbGwoY3VycmVudCk7XG4gICAgZGlzcGxheShjdXJyZW50LCBpbnZlcnQgPyAhb2sgOiBvayk7XG4gIH1cbn07XG5cbmFwaS5oaWRlID0gZnVuY3Rpb24gKGVsZW0sIHNob3VsZCkge1xuICBhcGkuc2hvdyhlbGVtLCBzaG91bGQsIHRydWUpO1xufTtcblxuZnVuY3Rpb24gZGlzcGxheSAoZWxlbSwgc2hvdWxkKSB7XG4gIGVsZW0uc3R5bGUuZGlzcGxheSA9IHNob3VsZCA/ICdibG9jaycgOiAnbm9uZSc7XG59XG5cbnZhciBudW1lcmljQ3NzUHJvcGVydGllcyA9IHtcbiAgJ2NvbHVtbi1jb3VudCc6IHRydWUsXG4gICdmaWxsLW9wYWNpdHknOiB0cnVlLFxuICAnZmxleC1ncm93JzogdHJ1ZSxcbiAgJ2ZsZXgtc2hyaW5rJzogdHJ1ZSxcbiAgJ2ZvbnQtd2VpZ2h0JzogdHJ1ZSxcbiAgJ2xpbmUtaGVpZ2h0JzogdHJ1ZSxcbiAgJ29wYWNpdHknOiB0cnVlLFxuICAnb3JkZXInOiB0cnVlLFxuICAnb3JwaGFucyc6IHRydWUsXG4gICd3aWRvd3MnOiB0cnVlLFxuICAnei1pbmRleCc6IHRydWUsXG4gICd6b29tJzogdHJ1ZVxufTtcbnZhciBudW1lcmljID0gL15cXGQrJC87XG52YXIgY2FuRmxvYXQgPSAnZmxvYXQnIGluIGRvY3VtZW50LmJvZHkuc3R5bGU7XG5cbmFwaS5nZXRDc3MgPSBmdW5jdGlvbiAoZWxlbSwgcHJvcCkge1xuICB2YXIgaHByb3AgPSB0ZXh0Lmh5cGhlbmF0ZShwcm9wKTtcbiAgdmFyIGZwcm9wID0gIWNhbkZsb2F0ICYmIGhwcm9wID09PSAnZmxvYXQnID8gJ2Nzc0Zsb2F0JyA6IGhwcm9wO1xuICB2YXIgcmVzdWx0ID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbSlbaHByb3BdO1xuICBpZiAocHJvcCA9PT0gJ29wYWNpdHknICYmIHJlc3VsdCA9PT0gJycpIHtcbiAgICByZXR1cm4gMTtcbiAgfVxuICBpZiAocmVzdWx0LnN1YnN0cigtMikgPT09ICdweCcgfHwgbnVtZXJpYy50ZXN0KHJlc3VsdCkpIHtcbiAgICByZXR1cm4gcGFyc2VGbG9hdChyZXN1bHQsIDEwKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuYXBpLnNldENzcyA9IGZ1bmN0aW9uIChwcm9wcykge1xuICB2YXIgbWFwcGVkID0gT2JqZWN0LmtleXMocHJvcHMpLmZpbHRlcihiYWQpLm1hcChleHBhbmQpO1xuICBmdW5jdGlvbiBiYWQgKHByb3ApIHtcbiAgICB2YXIgdmFsdWUgPSBwcm9wc1twcm9wXTtcbiAgICByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdmFsdWUgPT09IHZhbHVlO1xuICB9XG4gIGZ1bmN0aW9uIGV4cGFuZCAocHJvcCkge1xuICAgIHZhciBocHJvcCA9IHRleHQuaHlwaGVuYXRlKHByb3ApO1xuICAgIHZhciB2YWx1ZSA9IHByb3BzW3Byb3BdO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFudW1lcmljQ3NzUHJvcGVydGllc1tocHJvcF0pIHtcbiAgICAgIHZhbHVlICs9ICdweCc7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBocHJvcCwgdmFsdWU6IHZhbHVlXG4gICAgfTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24gKGVsZW0pIHtcbiAgICBtYXBwZWQuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgZWxlbS5zdHlsZVtwcm9wLm5hbWVdID0gcHJvcC52YWx1ZTtcbiAgICB9KTtcbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9Eb21pbnVzLnByb3RvdHlwZScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYWRkRXZlbnQgPSBhZGRFdmVudEVhc3k7XG52YXIgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEVhc3k7XG52YXIgaGFyZENhY2hlID0gW107XG5cbmlmICghd2luZG93LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgYWRkRXZlbnQgPSBhZGRFdmVudEhhcmQ7XG59XG5cbmlmICghd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEhhcmQ7XG59XG5cbmZ1bmN0aW9uIGFkZEV2ZW50RWFzeSAoZWxlbWVudCwgZXZ0LCBmbikge1xuICByZXR1cm4gZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2dCwgZm4pO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEhhcmQgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuYXR0YWNoRXZlbnQoJ29uJyArIGV2dCwgd3JhcChlbGVtZW50LCBldnQsIGZuKSk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50RWFzeSAoZWxlbWVudCwgZXZ0LCBmbikge1xuICByZXR1cm4gZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2dCwgZm4pO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEhhcmQgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuZGV0YWNoRXZlbnQoJ29uJyArIGV2dCwgdW53cmFwKGVsZW1lbnQsIGV2dCwgZm4pKTtcbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIgKG9yaWdpbmFsRXZlbnQpIHtcbiAgICB2YXIgZSA9IG9yaWdpbmFsRXZlbnQgfHwgd2luZG93LmV2ZW50O1xuICAgIGUudGFyZ2V0ID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIGUucHJldmVudERlZmF1bHQgID0gZS5wcmV2ZW50RGVmYXVsdCAgfHwgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKCkgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH07XG4gICAgZS5zdG9wUHJvcGFnYXRpb24gPSBlLnN0b3BQcm9wYWdhdGlvbiB8fCBmdW5jdGlvbiBzdG9wUHJvcGFnYXRpb24gKCkgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH07XG4gICAgZm4uY2FsbChlbGVtZW50LCBlKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gd3JhcCAoZWxlbWVudCwgZXZ0LCBmbikge1xuICB2YXIgd3JhcHBlciA9IHVud3JhcChlbGVtZW50LCBldnQsIGZuKSB8fCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBldnQsIGZuKTtcbiAgaGFyZENhY2hlLnB1c2goe1xuICAgIHdyYXBwZXI6IHdyYXBwZXIsXG4gICAgZWxlbWVudDogZWxlbWVudCxcbiAgICBldnQ6IGV2dCxcbiAgICBmbjogZm5cbiAgfSk7XG4gIHJldHVybiB3cmFwcGVyO1xufVxuXG5mdW5jdGlvbiB1bndyYXAgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgdmFyIGkgPSBmaW5kKGVsZW1lbnQsIGV2dCwgZm4pO1xuICBpZiAoaSkge1xuICAgIHZhciB3cmFwcGVyID0gaGFyZENhY2hlW2ldLndyYXBwZXI7XG4gICAgaGFyZENhY2hlLnNwbGljZShpLCAxKTsgLy8gZnJlZSB1cCBhIHRhZCBvZiBtZW1vcnlcbiAgICByZXR1cm4gd3JhcHBlcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHZhciBpLCBpdGVtO1xuICBmb3IgKGkgPSAwOyBpIDwgaGFyZENhY2hlLmxlbmd0aDsgaSsrKSB7XG4gICAgaXRlbSA9IGhhcmRDYWNoZVtpXTtcbiAgICBpZiAoaXRlbS5lbGVtZW50ID09PSBlbGVtZW50ICYmIGl0ZW0uZXZ0ID09PSBldnQgJiYgaXRlbS5mbiA9PT0gZm4pIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRFdmVudCxcbiAgcmVtb3ZlOiByZW1vdmVFdmVudFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGRvbSA9IHJlcXVpcmUoJy4vZG9tJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIHRhZyA9IC9eXFxzKjwoW2Etel0rKD86LVthLXpdKyk/KVxccypcXC8/PlxccyokL2k7XG5cbmZ1bmN0aW9uIGFwaSAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgdmFyIG5vdFRleHQgPSB0eXBlb2Ygc2VsZWN0b3IgIT09ICdzdHJpbmcnO1xuICBpZiAobm90VGV4dCAmJiBhcmd1bWVudHMubGVuZ3RoIDwgMikge1xuICAgIHJldHVybiBjb3JlLmNhc3Qoc2VsZWN0b3IpO1xuICB9XG4gIGlmIChub3RUZXh0KSB7XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH1cbiAgdmFyIG1hdGNoZXMgPSBzZWxlY3Rvci5tYXRjaCh0YWcpO1xuICBpZiAobWF0Y2hlcykge1xuICAgIHJldHVybiBkb20ubWFrZShtYXRjaGVzWzFdKTtcbiAgfVxuICByZXR1cm4gYXBpLmZpbmQoc2VsZWN0b3IsIGNvbnRleHQpO1xufVxuXG5hcGkuZmluZCA9IGZ1bmN0aW9uIChzZWxlY3RvciwgY29udGV4dCkge1xuICByZXR1cm4gZG9tLnFzYShjb250ZXh0LCBzZWxlY3Rvcik7XG59O1xuXG5hcGkuZmluZE9uZSA9IGZ1bmN0aW9uIChzZWxlY3RvciwgY29udGV4dCkge1xuICByZXR1cm4gZG9tLnFzKGNvbnRleHQsIHNlbGVjdG9yKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gYXBpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbm9kZU9iamVjdHMgPSB0eXBlb2YgTm9kZSA9PT0gJ29iamVjdCc7XG52YXIgZWxlbWVudE9iamVjdHMgPSB0eXBlb2YgSFRNTEVsZW1lbnQgPT09ICdvYmplY3QnO1xuXG5mdW5jdGlvbiBpc05vZGUgKG8pIHtcbiAgcmV0dXJuIG5vZGVPYmplY3RzID8gbyBpbnN0YW5jZW9mIE5vZGUgOiBpc05vZGVPYmplY3Qobyk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZU9iamVjdCAobykge1xuICByZXR1cm4gbyAmJlxuICAgIHR5cGVvZiBvID09PSAnb2JqZWN0JyAmJlxuICAgIHR5cGVvZiBvLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBvLm5vZGVUeXBlID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNFbGVtZW50IChvKSB7XG4gIHJldHVybiBlbGVtZW50T2JqZWN0cyA/IG8gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCA6IGlzRWxlbWVudE9iamVjdChvKTtcbn1cblxuZnVuY3Rpb24gaXNFbGVtZW50T2JqZWN0IChvKSB7XG4gIHJldHVybiBvICYmXG4gICAgdHlwZW9mIG8gPT09ICdvYmplY3QnICYmXG4gICAgdHlwZW9mIG8ubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgby5ub2RlVHlwZSA9PT0gMTtcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoYSkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGEpID09PSAnW29iamVjdCBBcnJheV0nO1xufVxuXG5mdW5jdGlvbiBpc0NoZWNrYWJsZSAoZWxlbSkge1xuICByZXR1cm4gJ2NoZWNrZWQnIGluIGVsZW0gJiYgZWxlbS50eXBlID09PSAncmFkaW8nIHx8IGVsZW0udHlwZSA9PT0gJ2NoZWNrYm94Jztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGlzTm9kZTogaXNOb2RlLFxuICBpc0VsZW1lbnQ6IGlzRWxlbWVudCxcbiAgaXNBcnJheTogaXNBcnJheSxcbiAgaXNDaGVja2FibGU6IGlzQ2hlY2thYmxlXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBoeXBoZW5Ub0NhbWVsIChoeXBoZW5zKSB7XG4gIHZhciBwYXJ0ID0gLy0oW2Etel0pL2c7XG4gIHJldHVybiBoeXBoZW5zLnJlcGxhY2UocGFydCwgZnVuY3Rpb24gKGcsIG0pIHtcbiAgICByZXR1cm4gbS50b1VwcGVyQ2FzZSgpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaHlwaGVuYXRlICh0ZXh0KSB7XG4gIHZhciBjYW1lbCA9IC8oW2Etel0pKFtBLVpdKS9nO1xuICByZXR1cm4gdGV4dC5yZXBsYWNlKGNhbWVsLCAnJDEtJDInKS50b0xvd2VyQ2FzZSgpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgaHlwaGVuVG9DYW1lbDogaHlwaGVuVG9DYW1lbCxcbiAgaHlwaGVuYXRlOiBoeXBoZW5hdGVcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5qYWRlPWUoKX19KGZ1bmN0aW9uKCl7dmFyIGRlZmluZSxtb2R1bGUsZXhwb3J0cztyZXR1cm4gKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoezE6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuJ3VzZSBzdHJpY3QnO1xyXG5cclxuLyoqXHJcbiAqIE1lcmdlIHR3byBhdHRyaWJ1dGUgb2JqZWN0cyBnaXZpbmcgcHJlY2VkZW5jZVxyXG4gKiB0byB2YWx1ZXMgaW4gb2JqZWN0IGBiYC4gQ2xhc3NlcyBhcmUgc3BlY2lhbC1jYXNlZFxyXG4gKiBhbGxvd2luZyBmb3IgYXJyYXlzIGFuZCBtZXJnaW5nL2pvaW5pbmcgYXBwcm9wcmlhdGVseVxyXG4gKiByZXN1bHRpbmcgaW4gYSBzdHJpbmcuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBhXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBiXHJcbiAqIEByZXR1cm4ge09iamVjdH0gYVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLm1lcmdlID0gZnVuY3Rpb24gbWVyZ2UoYSwgYikge1xyXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICB2YXIgYXR0cnMgPSBhWzBdO1xyXG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGF0dHJzID0gbWVyZ2UoYXR0cnMsIGFbaV0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGF0dHJzO1xyXG4gIH1cclxuICB2YXIgYWMgPSBhWydjbGFzcyddO1xyXG4gIHZhciBiYyA9IGJbJ2NsYXNzJ107XHJcblxyXG4gIGlmIChhYyB8fCBiYykge1xyXG4gICAgYWMgPSBhYyB8fCBbXTtcclxuICAgIGJjID0gYmMgfHwgW107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWMpKSBhYyA9IFthY107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYmMpKSBiYyA9IFtiY107XHJcbiAgICBhWydjbGFzcyddID0gYWMuY29uY2F0KGJjKS5maWx0ZXIobnVsbHMpO1xyXG4gIH1cclxuXHJcbiAgZm9yICh2YXIga2V5IGluIGIpIHtcclxuICAgIGlmIChrZXkgIT0gJ2NsYXNzJykge1xyXG4gICAgICBhW2tleV0gPSBiW2tleV07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBGaWx0ZXIgbnVsbCBgdmFsYHMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsXHJcbiAqIEByZXR1cm4ge0Jvb2xlYW59XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmZ1bmN0aW9uIG51bGxzKHZhbCkge1xyXG4gIHJldHVybiB2YWwgIT0gbnVsbCAmJiB2YWwgIT09ICcnO1xyXG59XHJcblxyXG4vKipcclxuICogam9pbiBhcnJheSBhcyBjbGFzc2VzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmpvaW5DbGFzc2VzID0gam9pbkNsYXNzZXM7XHJcbmZ1bmN0aW9uIGpvaW5DbGFzc2VzKHZhbCkge1xyXG4gIHJldHVybiBBcnJheS5pc0FycmF5KHZhbCkgPyB2YWwubWFwKGpvaW5DbGFzc2VzKS5maWx0ZXIobnVsbHMpLmpvaW4oJyAnKSA6IHZhbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHtBcnJheX0gY2xhc3Nlc1xyXG4gKiBAcGFyYW0ge0FycmF5LjxCb29sZWFuPn0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmNscyA9IGZ1bmN0aW9uIGNscyhjbGFzc2VzLCBlc2NhcGVkKSB7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2xhc3Nlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgaWYgKGVzY2FwZWQgJiYgZXNjYXBlZFtpXSkge1xyXG4gICAgICBidWYucHVzaChleHBvcnRzLmVzY2FwZShqb2luQ2xhc3NlcyhbY2xhc3Nlc1tpXV0pKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBidWYucHVzaChqb2luQ2xhc3NlcyhjbGFzc2VzW2ldKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHZhciB0ZXh0ID0gam9pbkNsYXNzZXMoYnVmKTtcclxuICBpZiAodGV4dC5sZW5ndGgpIHtcclxuICAgIHJldHVybiAnIGNsYXNzPVwiJyArIHRleHQgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyc7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gYXR0cmlidXRlLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5XHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcclxuICogQHBhcmFtIHtCb29sZWFufSBlc2NhcGVkXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gdGVyc2VcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5hdHRyID0gZnVuY3Rpb24gYXR0cihrZXksIHZhbCwgZXNjYXBlZCwgdGVyc2UpIHtcclxuICBpZiAoJ2Jvb2xlYW4nID09IHR5cGVvZiB2YWwgfHwgbnVsbCA9PSB2YWwpIHtcclxuICAgIGlmICh2YWwpIHtcclxuICAgICAgcmV0dXJuICcgJyArICh0ZXJzZSA/IGtleSA6IGtleSArICc9XCInICsga2V5ICsgJ1wiJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gJyc7XHJcbiAgICB9XHJcbiAgfSBlbHNlIGlmICgwID09IGtleS5pbmRleE9mKCdkYXRhJykgJiYgJ3N0cmluZycgIT0gdHlwZW9mIHZhbCkge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArIFwiPSdcIiArIEpTT04uc3RyaW5naWZ5KHZhbCkucmVwbGFjZSgvJy9nLCAnJmFwb3M7JykgKyBcIidcIjtcclxuICB9IGVsc2UgaWYgKGVzY2FwZWQpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyAnPVwiJyArIGV4cG9ydHMuZXNjYXBlKHZhbCkgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyB2YWwgKyAnXCInO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZXMgb2JqZWN0LlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBlc2NhcGVkXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0cnMgPSBmdW5jdGlvbiBhdHRycyhvYmosIHRlcnNlKXtcclxuICB2YXIgYnVmID0gW107XHJcblxyXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcclxuXHJcbiAgaWYgKGtleXMubGVuZ3RoKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgdmFyIGtleSA9IGtleXNbaV1cclxuICAgICAgICAsIHZhbCA9IG9ialtrZXldO1xyXG5cclxuICAgICAgaWYgKCdjbGFzcycgPT0ga2V5KSB7XHJcbiAgICAgICAgaWYgKHZhbCA9IGpvaW5DbGFzc2VzKHZhbCkpIHtcclxuICAgICAgICAgIGJ1Zi5wdXNoKCcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGJ1Zi5wdXNoKGV4cG9ydHMuYXR0cihrZXksIHZhbCwgZmFsc2UsIHRlcnNlKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBidWYuam9pbignJyk7XHJcbn07XHJcblxyXG4vKipcclxuICogRXNjYXBlIHRoZSBnaXZlbiBzdHJpbmcgb2YgYGh0bWxgLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaHRtbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMuZXNjYXBlID0gZnVuY3Rpb24gZXNjYXBlKGh0bWwpe1xyXG4gIHZhciByZXN1bHQgPSBTdHJpbmcoaHRtbClcclxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXHJcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXHJcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpO1xyXG4gIGlmIChyZXN1bHQgPT09ICcnICsgaHRtbCkgcmV0dXJuIGh0bWw7XHJcbiAgZWxzZSByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlLXRocm93IHRoZSBnaXZlbiBgZXJyYCBpbiBjb250ZXh0IHRvIHRoZVxyXG4gKiB0aGUgamFkZSBpbiBgZmlsZW5hbWVgIGF0IHRoZSBnaXZlbiBgbGluZW5vYC5cclxuICpcclxuICogQHBhcmFtIHtFcnJvcn0gZXJyXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGluZW5vXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMucmV0aHJvdyA9IGZ1bmN0aW9uIHJldGhyb3coZXJyLCBmaWxlbmFtZSwgbGluZW5vLCBzdHIpe1xyXG4gIGlmICghKGVyciBpbnN0YW5jZW9mIEVycm9yKSkgdGhyb3cgZXJyO1xyXG4gIGlmICgodHlwZW9mIHdpbmRvdyAhPSAndW5kZWZpbmVkJyB8fCAhZmlsZW5hbWUpICYmICFzdHIpIHtcclxuICAgIGVyci5tZXNzYWdlICs9ICcgb24gbGluZSAnICsgbGluZW5vO1xyXG4gICAgdGhyb3cgZXJyO1xyXG4gIH1cclxuICB0cnkge1xyXG4gICAgc3RyID0gc3RyIHx8IF9kZXJlcV8oJ2ZzJykucmVhZEZpbGVTeW5jKGZpbGVuYW1lLCAndXRmOCcpXHJcbiAgfSBjYXRjaCAoZXgpIHtcclxuICAgIHJldGhyb3coZXJyLCBudWxsLCBsaW5lbm8pXHJcbiAgfVxyXG4gIHZhciBjb250ZXh0ID0gM1xyXG4gICAgLCBsaW5lcyA9IHN0ci5zcGxpdCgnXFxuJylcclxuICAgICwgc3RhcnQgPSBNYXRoLm1heChsaW5lbm8gLSBjb250ZXh0LCAwKVxyXG4gICAgLCBlbmQgPSBNYXRoLm1pbihsaW5lcy5sZW5ndGgsIGxpbmVubyArIGNvbnRleHQpO1xyXG5cclxuICAvLyBFcnJvciBjb250ZXh0XHJcbiAgdmFyIGNvbnRleHQgPSBsaW5lcy5zbGljZShzdGFydCwgZW5kKS5tYXAoZnVuY3Rpb24obGluZSwgaSl7XHJcbiAgICB2YXIgY3VyciA9IGkgKyBzdGFydCArIDE7XHJcbiAgICByZXR1cm4gKGN1cnIgPT0gbGluZW5vID8gJyAgPiAnIDogJyAgICAnKVxyXG4gICAgICArIGN1cnJcclxuICAgICAgKyAnfCAnXHJcbiAgICAgICsgbGluZTtcclxuICB9KS5qb2luKCdcXG4nKTtcclxuXHJcbiAgLy8gQWx0ZXIgZXhjZXB0aW9uIG1lc3NhZ2VcclxuICBlcnIucGF0aCA9IGZpbGVuYW1lO1xyXG4gIGVyci5tZXNzYWdlID0gKGZpbGVuYW1lIHx8ICdKYWRlJykgKyAnOicgKyBsaW5lbm9cclxuICAgICsgJ1xcbicgKyBjb250ZXh0ICsgJ1xcblxcbicgKyBlcnIubWVzc2FnZTtcclxuICB0aHJvdyBlcnI7XHJcbn07XHJcblxufSx7XCJmc1wiOjJ9XSwyOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnamFkZS9ydW50aW1lJyk7XG4iLCJ2YXIgbm93ID0gcmVxdWlyZSgncGVyZm9ybWFuY2Utbm93JylcbiAgLCBnbG9iYWwgPSB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IHt9IDogd2luZG93XG4gICwgdmVuZG9ycyA9IFsnbW96JywgJ3dlYmtpdCddXG4gICwgc3VmZml4ID0gJ0FuaW1hdGlvbkZyYW1lJ1xuICAsIHJhZiA9IGdsb2JhbFsncmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgY2FmID0gZ2xvYmFsWydjYW5jZWwnICsgc3VmZml4XSB8fCBnbG9iYWxbJ2NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxuICAsIGlzTmF0aXZlID0gdHJ1ZVxuXG5mb3IodmFyIGkgPSAwOyBpIDwgdmVuZG9ycy5sZW5ndGggJiYgIXJhZjsgaSsrKSB7XG4gIHJhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ1JlcXVlc3QnICsgc3VmZml4XVxuICBjYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWwnICsgc3VmZml4XVxuICAgICAgfHwgZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICBpc05hdGl2ZSA9IGZhbHNlXG5cbiAgdmFyIGxhc3QgPSAwXG4gICAgLCBpZCA9IDBcbiAgICAsIHF1ZXVlID0gW11cbiAgICAsIGZyYW1lRHVyYXRpb24gPSAxMDAwIC8gNjBcblxuICByYWYgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGlmKHF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIF9ub3cgPSBub3coKVxuICAgICAgICAsIG5leHQgPSBNYXRoLm1heCgwLCBmcmFtZUR1cmF0aW9uIC0gKF9ub3cgLSBsYXN0KSlcbiAgICAgIGxhc3QgPSBuZXh0ICsgX25vd1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNwID0gcXVldWUuc2xpY2UoMClcbiAgICAgICAgLy8gQ2xlYXIgcXVldWUgaGVyZSB0byBwcmV2ZW50XG4gICAgICAgIC8vIGNhbGxiYWNrcyBmcm9tIGFwcGVuZGluZyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdG8gdGhlIGN1cnJlbnQgZnJhbWUncyBxdWV1ZVxuICAgICAgICBxdWV1ZS5sZW5ndGggPSAwXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmKCFjcFtpXS5jYW5jZWxsZWQpIHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgY3BbaV0uY2FsbGJhY2sobGFzdClcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LCBNYXRoLnJvdW5kKG5leHQpKVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHtcbiAgICAgIGhhbmRsZTogKytpZCxcbiAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgIGNhbmNlbGxlZDogZmFsc2VcbiAgICB9KVxuICAgIHJldHVybiBpZFxuICB9XG5cbiAgY2FmID0gZnVuY3Rpb24oaGFuZGxlKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZihxdWV1ZVtpXS5oYW5kbGUgPT09IGhhbmRsZSkge1xuICAgICAgICBxdWV1ZVtpXS5jYW5jZWxsZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gV3JhcCBpbiBhIG5ldyBmdW5jdGlvbiB0byBwcmV2ZW50XG4gIC8vIGBjYW5jZWxgIHBvdGVudGlhbGx5IGJlaW5nIGFzc2lnbmVkXG4gIC8vIHRvIHRoZSBuYXRpdmUgckFGIGZ1bmN0aW9uXG4gIGlmKCFpc05hdGl2ZSkge1xuICAgIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZuKVxuICB9XG4gIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZ1bmN0aW9uKCkge1xuICAgIHRyeXtcbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICB9XG4gIH0pXG59XG5tb2R1bGUuZXhwb3J0cy5jYW5jZWwgPSBmdW5jdGlvbigpIHtcbiAgY2FmLmFwcGx5KGdsb2JhbCwgYXJndW1lbnRzKVxufVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8vIEdlbmVyYXRlZCBieSBDb2ZmZWVTY3JpcHQgMS42LjNcbihmdW5jdGlvbigpIHtcbiAgdmFyIGdldE5hbm9TZWNvbmRzLCBocnRpbWUsIGxvYWRUaW1lO1xuXG4gIGlmICgodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHBlcmZvcm1hbmNlICE9PSBudWxsKSAmJiBwZXJmb3JtYW5jZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIH07XG4gIH0gZWxzZSBpZiAoKHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MgIT09IG51bGwpICYmIHByb2Nlc3MuaHJ0aW1lKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAoZ2V0TmFub1NlY29uZHMoKSAtIGxvYWRUaW1lKSAvIDFlNjtcbiAgICB9O1xuICAgIGhydGltZSA9IHByb2Nlc3MuaHJ0aW1lO1xuICAgIGdldE5hbm9TZWNvbmRzID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaHI7XG4gICAgICBociA9IGhydGltZSgpO1xuICAgICAgcmV0dXJuIGhyWzBdICogMWU5ICsgaHJbMV07XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IGdldE5hbm9TZWNvbmRzKCk7XG4gIH0gZWxzZSBpZiAoRGF0ZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIERhdGUubm93KCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgfSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9XG5cbn0pLmNhbGwodGhpcyk7XG5cbi8qXG4vL0Agc291cmNlTWFwcGluZ1VSTD1wZXJmb3JtYW5jZS1ub3cubWFwXG4qL1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIikpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgY2xvbmUgPSByZXF1aXJlKCcuL2Nsb25lJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBwYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBuYXRpdmVGbiA9IHJlcXVpcmUoJy4vbmF0aXZlRm4nKTtcbnZhciB2ZXJzaW9uaW5nID0gcmVxdWlyZSgnLi4vdmVyc2lvbmluZycpO1xudmFyIG1vZGVybiA9ICdoaXN0b3J5JyBpbiB3aW5kb3cgJiYgJ3B1c2hTdGF0ZScgaW4gaGlzdG9yeTtcblxuLy8gR29vZ2xlIENocm9tZSAzOCBvbiBpT1MgbWFrZXMgd2VpcmQgY2hhbmdlcyB0byBoaXN0b3J5LnJlcGxhY2VTdGF0ZSwgYnJlYWtpbmcgaXRcbnZhciBuYXRpdmVSZXBsYWNlID0gbW9kZXJuICYmIG5hdGl2ZUZuKHdpbmRvdy5oaXN0b3J5LnJlcGxhY2VTdGF0ZSk7XG5cbmZ1bmN0aW9uIGdvICh1cmwsIG9wdGlvbnMpIHtcbiAgdmFyIG8gPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgZGlyZWN0aW9uID0gby5yZXBsYWNlU3RhdGUgPyAncmVwbGFjZVN0YXRlJyA6ICdwdXNoU3RhdGUnO1xuICB2YXIgY29udGV4dCA9IG8uY29udGV4dCB8fCBudWxsO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsKTtcbiAgaWYgKCFyb3V0ZSkge1xuICAgIGlmIChvLnN0cmljdCAhPT0gdHJ1ZSkge1xuICAgICAgbG9jYXRpb24uaHJlZiA9IHVybDtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHNhbWUgPSByb3V0ZXIuZXF1YWxzKHJvdXRlLCBzdGF0ZS5yb3V0ZSk7XG4gIGlmIChzYW1lICYmIG8uZm9yY2UgIT09IHRydWUpIHtcbiAgICBpZiAocm91dGUucGFydHMuaGFzaCkge1xuICAgICAgc2Nyb2xsSW50byhpZChyb3V0ZS5wYXJ0cy5oYXNoKSwgby5zY3JvbGwpO1xuICAgICAgbmF2aWdhdGlvbihyb3V0ZSwgc3RhdGUubW9kZWwsIGRpcmVjdGlvbik7XG4gICAgICByZXR1cm47IC8vIGFuY2hvciBoYXNoLW5hdmlnYXRpb24gb24gc2FtZSBwYWdlIGlnbm9yZXMgcm91dGVyXG4gICAgfVxuICAgIHJlc29sdmVkKHN0YXRlLm1vZGVsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIW1vZGVybikge1xuICAgIGxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgZmV0Y2hlci5hYm9ydFBlbmRpbmcoKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250ZXh0LCBzb3VyY2U6ICdpbnRlbnQnIH0sIG1heWJlUmVzb2x2ZWQpO1xuXG4gIGZ1bmN0aW9uIG1heWJlUmVzb2x2ZWQgKGVyciwgZGF0YSkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGRhdGEudmVyc2lvbiAhPT0gc3RhdGUudmVyc2lvbikge1xuICAgICAgbG9jYXRpb24uaHJlZiA9IHVybDsgLy8gdmVyc2lvbiBjaGFuZ2UgZGVtYW5kcyBmYWxsYmFjayB0byBzdHJpY3QgbmF2aWdhdGlvblxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXNvbHZlZChkYXRhLm1vZGVsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc29sdmVkIChtb2RlbCkge1xuICAgIG5hdmlnYXRpb24ocm91dGUsIG1vZGVsLCBkaXJlY3Rpb24pO1xuICAgIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICAgIHNjcm9sbEludG8oaWQocm91dGUucGFydHMuaGFzaCksIG8uc2Nyb2xsKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydCAoZGF0YSkge1xuICBpZiAoZGF0YS52ZXJzaW9uICE9PSBzdGF0ZS52ZXJzaW9uKSB7XG4gICAgbG9jYXRpb24ucmVsb2FkKCk7IC8vIHZlcnNpb24gbWF5IGNoYW5nZSBiZXR3ZWVuIFRhdW51cyBsb2FkaW5nIGFuZCBhIG1vZGVsIGJlY29taW5nIGF2YWlsYWJsZVxuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbW9kZWwgPSBkYXRhLm1vZGVsO1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIGVtaXR0ZXIuZW1pdCgnc3RhcnQnLCBzdGF0ZS5jb250YWluZXIsIG1vZGVsKTtcbiAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSwgeyByZW5kZXI6IGZhbHNlIH0pO1xuICB3aW5kb3cub25wb3BzdGF0ZSA9IGJhY2s7XG59XG5cbmZ1bmN0aW9uIGJhY2sgKGUpIHtcbiAgdmFyIGVtcHR5ID0gIShlICYmIGUuc3RhdGUgJiYgZS5zdGF0ZS5tb2RlbCk7XG4gIGlmIChlbXB0eSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbW9kZWwgPSBlLnN0YXRlLm1vZGVsO1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICBzY3JvbGxJbnRvKGlkKHJvdXRlLnBhcnRzLmhhc2gpKTtcbn1cblxuZnVuY3Rpb24gc2Nyb2xsSW50byAoaWQsIGVuYWJsZWQpIHtcbiAgaWYgKGVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBlbGVtID0gaWQgJiYgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgaWYgKGVsZW0gJiYgZWxlbS5zY3JvbGxJbnRvVmlldykge1xuICAgIHJhZihzY3JvbGxTb29uKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjcm9sbFNvb24gKCkge1xuICAgIGVsZW0uc2Nyb2xsSW50b1ZpZXcoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpZCAoaGFzaCkge1xuICByZXR1cm4gb3JFbXB0eShoYXNoKS5zdWJzdHIoMSk7XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VXaXRoIChtb2RlbCkge1xuICB2YXIgdXJsID0gbG9jYXRpb24ucGF0aG5hbWU7XG4gIHZhciBxdWVyeSA9IG9yRW1wdHkobG9jYXRpb24uc2VhcmNoKSArIG9yRW1wdHkobG9jYXRpb24uaGFzaCk7XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwgKyBxdWVyeSk7XG4gIG5hdmlnYXRpb24ocm91dGUsIG1vZGVsLCAncmVwbGFjZVN0YXRlJyk7XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gb3JFbXB0eSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBuYXZpZ2F0aW9uIChyb3V0ZSwgbW9kZWwsIGRpcmVjdGlvbikge1xuICBzdGF0ZS5yb3V0ZSA9IHJvdXRlO1xuICBzdGF0ZS5tb2RlbCA9IGNsb25lKG1vZGVsKTtcbiAgaWYgKG1vZGVsLnRpdGxlKSB7XG4gICAgZG9jdW1lbnQudGl0bGUgPSBtb2RlbC50aXRsZTtcbiAgfVxuICBpZiAobW9kZXJuICYmIGRpcmVjdGlvbiAhPT0gJ3JlcGxhY2VTdGF0ZScgfHwgbmF0aXZlUmVwbGFjZSkge1xuICAgIGhpc3RvcnlbZGlyZWN0aW9uXSh7IG1vZGVsOiBtb2RlbCB9LCBtb2RlbC50aXRsZSwgcm91dGUudXJsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc3RhcnQ6IHN0YXJ0LFxuICBnbzogZ29cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjbG9uZSA9IHJlcXVpcmUoJy4vY2xvbmUnKTtcbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcmF3ID0gcmVxdWlyZSgnLi9zdG9yZXMvcmF3Jyk7XG52YXIgaWRiID0gcmVxdWlyZSgnLi9zdG9yZXMvaWRiJyk7XG52YXIgdmVyc2lvbmluZyA9IHJlcXVpcmUoJy4uL3ZlcnNpb25pbmcnKTtcbnZhciBzdG9yZXMgPSBbcmF3LCBpZGJdO1xuXG5mdW5jdGlvbiBnZXQgKHVybCwgZG9uZSkge1xuICB2YXIgaSA9IDA7XG5cbiAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgdmFyIGdvdE9uY2UgPSBvbmNlKGdvdCk7XG4gICAgdmFyIHN0b3JlID0gc3RvcmVzW2krK107XG4gICAgaWYgKHN0b3JlKSB7XG4gICAgICBzdG9yZS5nZXQodXJsLCBnb3RPbmNlKTtcbiAgICAgIHNldFRpbWVvdXQoZ290T25jZSwgc3RvcmUgPT09IGlkYiA/IDEwMCA6IDUwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDE1MG1zIG9uIGNhY2hpbmcgbGF5ZXJzXG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUodHJ1ZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ290IChlcnIsIGl0ZW0pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSBlbHNlIGlmICh2YWxpZChpdGVtKSkge1xuICAgICAgICBkb25lKGZhbHNlLCBjbG9uZShpdGVtLmRhdGEpKTsgLy8gYWx3YXlzIHJldHVybiBhIHVuaXF1ZSBjb3B5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdmFsaWQgKGl0ZW0pIHtcbiAgICAgIGlmICghaXRlbSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7IC8vIGNhY2hlIG11c3QgaGF2ZSBpdGVtXG4gICAgICB9XG4gICAgICB2YXIgbWlzbWF0Y2ggPSB0eXBlb2YgaXRlbS52ZXJzaW9uICE9PSAnc3RyaW5nJyB8fCBpdGVtLnZlcnNpb24gIT09IHN0YXRlLnZlcnNpb247XG4gICAgICBpZiAobWlzbWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBjYWNoZSBtdXN0IG1hdGNoIGN1cnJlbnQgdmVyc2lvblxuICAgICAgfVxuICAgICAgdmFyIHN0YWxlID0gdHlwZW9mIGl0ZW0uZXhwaXJlcyAhPT0gJ251bWJlcicgfHwgRGF0ZS5ub3coKSA+PSBpdGVtLmV4cGlyZXM7XG4gICAgICBpZiAoc3RhbGUpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBjYWNoZSBtdXN0IGJlIGZyZXNoXG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBuZXh0KCk7XG59XG5cbmZ1bmN0aW9uIHNldCAodXJsLCBkYXRhLCBkdXJhdGlvbikge1xuICBpZiAoZHVyYXRpb24gPCAxKSB7IC8vIHNhbml0eVxuICAgIHJldHVybjtcbiAgfVxuICB2YXIgY2xvbmVkID0gY2xvbmUoZGF0YSk7IC8vIGZyZWV6ZSBhIGNvcHkgZm9yIG91ciByZWNvcmRzXG4gIHN0b3Jlcy5mb3JFYWNoKHN0b3JlKTtcbiAgZnVuY3Rpb24gc3RvcmUgKHMpIHtcbiAgICBzLnNldCh1cmwsIHtcbiAgICAgIGRhdGE6IGNsb25lZCxcbiAgICAgIHZlcnNpb246IHN0YXRlLnZlcnNpb24sXG4gICAgICBleHBpcmVzOiBEYXRlLm5vdygpICsgZHVyYXRpb25cbiAgICB9KTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2FjaGUgPSByZXF1aXJlKCcuL2NhY2hlJyk7XG52YXIgaWRiID0gcmVxdWlyZSgnLi9zdG9yZXMvaWRiJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGRlZmF1bHRzID0gMTU7XG52YXIgYmFzZWxpbmU7XG5cbmZ1bmN0aW9uIGUgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gZ2V0TW9kZWxLZXkgKHJvdXRlKSB7XG4gIHJldHVybiAnbW9kZWw6LycgKyByb3V0ZS5wYXJ0cy5wYXRobmFtZSArIGUocm91dGUucGFydHMucXVlcnkpO1xufVxuXG5mdW5jdGlvbiBzZXR1cCAoZHVyYXRpb24sIHJvdXRlKSB7XG4gIGJhc2VsaW5lID0gcGFyc2VEdXJhdGlvbihkdXJhdGlvbik7XG4gIGlmIChiYXNlbGluZSA8IDEpIHtcbiAgICBzdGF0ZS5jYWNoZSA9IGZhbHNlO1xuICAgIHJldHVybjtcbiAgfVxuICBpbnRlcmNlcHRvci5hZGQoaW50ZXJjZXB0KTtcbiAgZW1pdHRlci5vbignZmV0Y2guZG9uZScsIHBlcnNpc3QpO1xuICBzdGF0ZS5jYWNoZSA9IHRydWU7XG59XG5cbmZ1bmN0aW9uIGludGVyY2VwdCAoZSkge1xuICBjYWNoZS5nZXQoZ2V0TW9kZWxLZXkoZS5yb3V0ZSksIHJlc3VsdCk7XG5cbiAgZnVuY3Rpb24gcmVzdWx0IChlcnIsIGRhdGEpIHtcbiAgICBpZiAoIWVyciAmJiBkYXRhKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KGRhdGEpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJzZUR1cmF0aW9uICh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT09IHRydWUpIHtcbiAgICByZXR1cm4gYmFzZWxpbmUgfHwgZGVmYXVsdHM7XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3QgKHJvdXRlLCBjb250ZXh0LCBkYXRhKSB7XG4gIGlmICghc3RhdGUuY2FjaGUpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvdXRlLmNhY2hlID09PSBmYWxzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgZCA9IGJhc2VsaW5lO1xuICBpZiAodHlwZW9mIHJvdXRlLmNhY2hlID09PSAnbnVtYmVyJykge1xuICAgIGQgPSByb3V0ZS5jYWNoZTtcbiAgfVxuICB2YXIgZnJlc2huZXNzID0gcGFyc2VEdXJhdGlvbihkKSAqIDEwMDA7XG4gIGlmIChkYXRhLm1vZGVsKSB7XG4gICAgY2FjaGUuc2V0KGdldE1vZGVsS2V5KHJvdXRlKSwgdihkYXRhLCAnbW9kZWwnKSwgZnJlc2huZXNzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2IChkYXRhLCBrZXkpIHtcbiAgdmFyIHJlc3VsdCA9IHsgdmVyc2lvbjogZGF0YS52ZXJzaW9uIH07XG4gIHJlc3VsdFtrZXldID0gZGF0YVtrZXldO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiByZWFkeSAoZm4pIHtcbiAgaWYgKHN0YXRlLmNhY2hlKSB7XG4gICAgaWRiLnRlc3RlZChmbik7IC8vIHdhaXQgb24gaWRiIGNvbXBhdGliaWxpdHkgdGVzdHNcbiAgfSBlbHNlIHtcbiAgICBmbigpOyAvLyBjYWNoaW5nIGlzIGEgbm8tb3BcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2V0dXA6IHNldHVwLFxuICBwZXJzaXN0OiBwZXJzaXN0LFxuICByZWFkeTogcmVhZHlcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGNsb25lICh2YWx1ZSkge1xuICByZXR1cm4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsb25lO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZW1pdHRlcih7fSwgeyB0aHJvd3M6IGZhbHNlIH0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBhZGQgKGVsZW1lbnQsIHR5cGUsIGZuKSB7XG4gIGlmIChlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZm4pO1xuICB9IGVsc2UgaWYgKGVsZW1lbnQuYXR0YWNoRXZlbnQpIHtcbiAgICBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBmbikpO1xuICB9IGVsc2Uge1xuICAgIGVsZW1lbnRbJ29uJyArIHR5cGVdID0gZm47XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IHdpbmRvdy5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ICA9IGUucHJldmVudERlZmF1bHQgIHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGZuLmNhbGwoZWxlbWVudCwgZSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJy4veGhyJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGxhc3RYaHIgPSB7fTtcblxuZnVuY3Rpb24gZSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBqc29uaWZ5IChyb3V0ZSkge1xuICB2YXIgcGFydHMgPSByb3V0ZS5wYXJ0cztcbiAgdmFyIHFzID0gZShwYXJ0cy5zZWFyY2gpO1xuICB2YXIgcCA9IHFzID8gJyYnIDogJz8nO1xuICByZXR1cm4gcGFydHMucGF0aG5hbWUgKyBxcyArIHAgKyAnanNvbic7XG59XG5cbmZ1bmN0aW9uIGFib3J0IChzb3VyY2UpIHtcbiAgaWYgKGxhc3RYaHJbc291cmNlXSkge1xuICAgIGxhc3RYaHJbc291cmNlXS5hYm9ydCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFib3J0UGVuZGluZyAoKSB7XG4gIE9iamVjdC5rZXlzKGxhc3RYaHIpLmZvckVhY2goYWJvcnQpO1xuICBsYXN0WGhyID0ge307XG59XG5cbmZ1bmN0aW9uIGZldGNoZXIgKHJvdXRlLCBjb250ZXh0LCBkb25lKSB7XG4gIHZhciB1cmwgPSByb3V0ZS51cmw7XG4gIGlmIChsYXN0WGhyW2NvbnRleHQuc291cmNlXSkge1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdLmFib3J0KCk7XG4gICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSBudWxsO1xuICB9XG4gIGludGVyY2VwdG9yLmV4ZWN1dGUocm91dGUsIGFmdGVySW50ZXJjZXB0b3JzKTtcblxuICBmdW5jdGlvbiBhZnRlckludGVyY2VwdG9ycyAoZXJyLCByZXN1bHQpIHtcbiAgICBpZiAoIWVyciAmJiByZXN1bHQuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgZG9uZShudWxsLCByZXN1bHQubW9kZWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLnN0YXJ0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSB4aHIoanNvbmlmeShyb3V0ZSksIG5vdGlmeSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbm90aWZ5IChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBpZiAoZXJyLm1lc3NhZ2UgPT09ICdhYm9ydGVkJykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmFib3J0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5lcnJvcicsIHJvdXRlLCBjb250ZXh0LCBlcnIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZGF0YSAmJiBkYXRhLnZlcnNpb24pIHtcbiAgICAgICAgc3RhdGUudmVyc2lvbiA9IGRhdGEudmVyc2lvbjsgLy8gc3luYyB2ZXJzaW9uIGV4cGVjdGF0aW9uIHdpdGggc2VydmVyLXNpZGVcbiAgICAgIH1cbiAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guZG9uZScsIHJvdXRlLCBjb250ZXh0LCBkYXRhKTtcbiAgICB9XG4gICAgZG9uZShlcnIsIGRhdGEpO1xuICB9XG59XG5cbmZldGNoZXIuYWJvcnRQZW5kaW5nID0gYWJvcnRQZW5kaW5nO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZldGNoZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgbGlua3MgPSByZXF1aXJlKCcuL2xpbmtzJyk7XG5cbmZ1bmN0aW9uIGF0dGFjaCAoKSB7XG4gIGVtaXR0ZXIub24oJ3N0YXJ0JywgbGlua3MpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXR0YWNoOiBhdHRhY2hcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBhY3RpdmF0b3IgPSByZXF1aXJlKCcuL2FjdGl2YXRvcicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBob29rcyA9IHJlcXVpcmUoJy4vaG9va3MnKTtcbnZhciBwYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG52YXIgbW91bnQgPSByZXF1aXJlKCcuL21vdW50Jyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciB4aHIgPSByZXF1aXJlKCcuL3hocicpO1xuXG5ob29rcy5hdHRhY2goKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1vdW50OiBtb3VudCxcbiAgcGFydGlhbDogcGFydGlhbC5zdGFuZGFsb25lLFxuICBvbjogZW1pdHRlci5vbi5iaW5kKGVtaXR0ZXIpLFxuICBvbmNlOiBlbWl0dGVyLm9uY2UuYmluZChlbWl0dGVyKSxcbiAgb2ZmOiBlbWl0dGVyLm9mZi5iaW5kKGVtaXR0ZXIpLFxuICBpbnRlcmNlcHQ6IGludGVyY2VwdG9yLmFkZCxcbiAgbmF2aWdhdGU6IGFjdGl2YXRvci5nbyxcbiAgc3RhdGU6IHN0YXRlLFxuICByb3V0ZTogcm91dGVyLFxuICB4aHI6IHhoclxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xudmFyIG9uY2UgPSByZXF1aXJlKCcuL29uY2UnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGludGVyY2VwdG9ycyA9IGVtaXR0ZXIoeyBjb3VudDogMCB9LCB7IGFzeW5jOiB0cnVlIH0pO1xuXG5mdW5jdGlvbiBnZXRJbnRlcmNlcHRvckV2ZW50IChyb3V0ZSkge1xuICB2YXIgZSA9IHtcbiAgICB1cmw6IHJvdXRlLnVybCxcbiAgICByb3V0ZTogcm91dGUsXG4gICAgcGFydHM6IHJvdXRlLnBhcnRzLFxuICAgIG1vZGVsOiBudWxsLFxuICAgIGNhblByZXZlbnREZWZhdWx0OiB0cnVlLFxuICAgIGRlZmF1bHRQcmV2ZW50ZWQ6IGZhbHNlLFxuICAgIHByZXZlbnREZWZhdWx0OiBvbmNlKHByZXZlbnREZWZhdWx0KVxuICB9O1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0IChtb2RlbCkge1xuICAgIGlmICghZS5jYW5QcmV2ZW50RGVmYXVsdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBlLmNhblByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgZS5kZWZhdWx0UHJldmVudGVkID0gdHJ1ZTtcbiAgICBlLm1vZGVsID0gbW9kZWw7XG4gIH1cblxuICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gYWRkIChhY3Rpb24sIGZuKSB7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgZm4gPSBhY3Rpb247XG4gICAgYWN0aW9uID0gJyonO1xuICB9XG4gIGludGVyY2VwdG9ycy5jb3VudCsrO1xuICBpbnRlcmNlcHRvcnMub24oYWN0aW9uLCBmbik7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGVTeW5jIChyb3V0ZSkge1xuICB2YXIgZSA9IGdldEludGVyY2VwdG9yRXZlbnQocm91dGUpO1xuXG4gIGludGVyY2VwdG9ycy5lbWl0KCcqJywgZSk7XG4gIGludGVyY2VwdG9ycy5lbWl0KHJvdXRlLmFjdGlvbiwgZSk7XG5cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGUgKHJvdXRlLCBkb25lKSB7XG4gIHZhciBlID0gZ2V0SW50ZXJjZXB0b3JFdmVudChyb3V0ZSk7XG4gIGlmIChpbnRlcmNlcHRvcnMuY291bnQgPT09IDApIHsgLy8gZmFpbCBmYXN0XG4gICAgZW5kKCk7IHJldHVybjtcbiAgfVxuICB2YXIgZm4gPSBvbmNlKGVuZCk7XG4gIHZhciBwcmV2ZW50RGVmYXVsdEJhc2UgPSBlLnByZXZlbnREZWZhdWx0O1xuXG4gIGUucHJldmVudERlZmF1bHQgPSBvbmNlKHByZXZlbnREZWZhdWx0RW5kcyk7XG5cbiAgaW50ZXJjZXB0b3JzLmVtaXQoJyonLCBlKTtcbiAgaW50ZXJjZXB0b3JzLmVtaXQocm91dGUuYWN0aW9uLCBlKTtcblxuICBzZXRUaW1lb3V0KGZuLCAyMDApOyAvLyBhdCB3b3JzdCwgc3BlbmQgMjAwbXMgd2FpdGluZyBvbiBpbnRlcmNlcHRvcnNcblxuICBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdEVuZHMgKCkge1xuICAgIHByZXZlbnREZWZhdWx0QmFzZS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIGZuKCk7XG4gIH1cblxuICBmdW5jdGlvbiBlbmQgKCkge1xuICAgIGUuY2FuUHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICBkb25lKG51bGwsIGUpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZCxcbiAgZXhlY3V0ZTogZXhlY3V0ZVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBvcmlnaW4gPSBkb2N1bWVudC5sb2NhdGlvbi5vcmlnaW47XG52YXIgbGVmdENsaWNrID0gMTtcbnZhciBwcmVmZXRjaGluZyA9IFtdO1xudmFyIGNsaWNrc09uSG9sZCA9IFtdO1xuXG5mdW5jdGlvbiBsaW5rcyAoKSB7XG4gIGlmIChzdGF0ZS5wcmVmZXRjaCAmJiBzdGF0ZS5jYWNoZSkgeyAvLyBwcmVmZXRjaCB3aXRob3V0IGNhY2hlIG1ha2VzIG5vIHNlbnNlXG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAnbW91c2VvdmVyJywgbWF5YmVQcmVmZXRjaCk7XG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAndG91Y2hzdGFydCcsIG1heWJlUHJlZmV0Y2gpO1xuICB9XG4gIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ2NsaWNrJywgbWF5YmVSZXJvdXRlKTtcbn1cblxuZnVuY3Rpb24gc28gKGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLm9yaWdpbiA9PT0gb3JpZ2luO1xufVxuXG5mdW5jdGlvbiBsZWZ0Q2xpY2tPbkFuY2hvciAoZSwgYW5jaG9yKSB7XG4gIHJldHVybiBhbmNob3IucGF0aG5hbWUgJiYgZS53aGljaCA9PT0gbGVmdENsaWNrICYmICFlLm1ldGFLZXkgJiYgIWUuY3RybEtleTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0T3JBbmNob3IgKGUpIHtcbiAgdmFyIGFuY2hvciA9IGUudGFyZ2V0O1xuICB3aGlsZSAoYW5jaG9yKSB7XG4gICAgaWYgKGFuY2hvci50YWdOYW1lID09PSAnQScpIHtcbiAgICAgIHJldHVybiBhbmNob3I7XG4gICAgfVxuICAgIGFuY2hvciA9IGFuY2hvci5wYXJlbnRFbGVtZW50O1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUmVyb3V0ZSAoZSkge1xuICB2YXIgYW5jaG9yID0gdGFyZ2V0T3JBbmNob3IoZSk7XG4gIGlmIChhbmNob3IgJiYgc28oYW5jaG9yKSAmJiBsZWZ0Q2xpY2tPbkFuY2hvcihlLCBhbmNob3IpKSB7XG4gICAgcmVyb3V0ZShlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUHJlZmV0Y2ggKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikpIHtcbiAgICBwcmVmZXRjaChlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0Um91dGUgKGFuY2hvcikge1xuICB2YXIgdXJsID0gYW5jaG9yLnBhdGhuYW1lICsgYW5jaG9yLnNlYXJjaCArIGFuY2hvci5oYXNoO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS5pZ25vcmUpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiByZXJvdXRlIChlLCBhbmNob3IpIHtcbiAgdmFyIHJvdXRlID0gZ2V0Um91dGUoYW5jaG9yKTtcbiAgaWYgKCFyb3V0ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByZXZlbnQoKTtcblxuICBpZiAocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgIGNsaWNrc09uSG9sZC5wdXNoKGFuY2hvcik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYWN0aXZhdG9yLmdvKHJvdXRlLnVybCwgeyBjb250ZXh0OiBhbmNob3IgfSk7XG5cbiAgZnVuY3Rpb24gcHJldmVudCAoKSB7IGUucHJldmVudERlZmF1bHQoKTsgfVxufVxuXG5mdW5jdGlvbiBwcmVmZXRjaCAoZSwgYW5jaG9yKSB7XG4gIHZhciByb3V0ZSA9IGdldFJvdXRlKGFuY2hvcik7XG4gIGlmICghcm91dGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByZWZldGNoaW5nLnB1c2goYW5jaG9yKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBhbmNob3IsIHNvdXJjZTogJ3ByZWZldGNoJyB9LCByZXNvbHZlZCk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZWQgKCkge1xuICAgIHByZWZldGNoaW5nLnNwbGljZShwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvciksIDEpO1xuICAgIGlmIChjbGlja3NPbkhvbGQuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgICAgY2xpY2tzT25Ib2xkLnNwbGljZShjbGlja3NPbkhvbGQuaW5kZXhPZihhbmNob3IpLCAxKTtcbiAgICAgIGFjdGl2YXRvci5nbyhyb3V0ZS51cmwsIHsgY29udGV4dDogYW5jaG9yIH0pO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGxpbmtzO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdW5lc2NhcGUgPSByZXF1aXJlKCcuL3VuZXNjYXBlJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBhY3RpdmF0b3IgPSByZXF1aXJlKCcuL2FjdGl2YXRvcicpO1xudmFyIGNhY2hpbmcgPSByZXF1aXJlKCcuL2NhY2hpbmcnKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgdmVyc2lvbmluZyA9IHJlcXVpcmUoJy4uL3ZlcnNpb25pbmcnKTtcbnZhciBnID0gZ2xvYmFsO1xudmFyIG1vdW50ZWQ7XG52YXIgYm9vdGVkO1xuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG1vdW50IChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucykge1xuICB2YXIgbyA9IG9wdGlvbnMgfHwge307XG4gIGlmIChtb3VudGVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdUYXVudXMgYWxyZWFkeSBtb3VudGVkIScpO1xuICB9XG4gIGlmICghY29udGFpbmVyIHx8ICFjb250YWluZXIudGFnTmFtZSkgeyAvLyBuYcOvdmUgaXMgZW5vdWdoXG4gICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYW4gYXBwbGljYXRpb24gcm9vdCBjb250YWluZXIhJyk7XG4gIH1cblxuICBtb3VudGVkID0gdHJ1ZTtcblxuICBzdGF0ZS5jb250YWluZXIgPSBjb250YWluZXI7XG4gIHN0YXRlLmNvbnRyb2xsZXJzID0gd2lyaW5nLmNvbnRyb2xsZXJzO1xuICBzdGF0ZS50ZW1wbGF0ZXMgPSB3aXJpbmcudGVtcGxhdGVzO1xuICBzdGF0ZS5yb3V0ZXMgPSB3aXJpbmcucm91dGVzO1xuICBzdGF0ZS5wcmVmZXRjaCA9ICEhby5wcmVmZXRjaDtcbiAgc3RhdGUudmVyc2lvbiA9IHZlcnNpb25pbmcuZ2V0KG8udmVyc2lvbiB8fCAnMScpO1xuXG4gIHJvdXRlci5zZXR1cCh3aXJpbmcucm91dGVzKTtcblxuICB2YXIgdXJsID0gbG9jYXRpb24ucGF0aG5hbWU7XG4gIHZhciBxdWVyeSA9IG9yRW1wdHkobG9jYXRpb24uc2VhcmNoKSArIG9yRW1wdHkobG9jYXRpb24uaGFzaCk7XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwgKyBxdWVyeSk7XG5cbiAgY2FjaGluZy5zZXR1cChvLmNhY2hlLCByb3V0ZSk7XG4gIGNhY2hpbmcucmVhZHkoa2lja3N0YXJ0KTtcblxuICBmdW5jdGlvbiBraWNrc3RhcnQgKCkge1xuICAgIGlmICghby5ib290c3RyYXApIHsgby5ib290c3RyYXAgPSAnYXV0byc7IH1cbiAgICBpZiAoby5ib290c3RyYXAgPT09ICdhdXRvJykge1xuICAgICAgYXV0b2Jvb3QoKTtcbiAgICB9IGVsc2UgaWYgKG8uYm9vdHN0cmFwID09PSAnaW5saW5lJykge1xuICAgICAgaW5saW5lYm9vdCgpO1xuICAgIH0gZWxzZSBpZiAoby5ib290c3RyYXAgPT09ICdtYW51YWwnKSB7XG4gICAgICBtYW51YWxib290KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihvLmJvb3RzdHJhcCArICcgaXMgbm90IGEgdmFsaWQgYm9vdHN0cmFwIG1vZGUhJyk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXV0b2Jvb3QgKCkge1xuICAgIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogY29udGFpbmVyLCBzb3VyY2U6ICdib290JyB9LCBmZXRjaGVkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZldGNoZWQgKGVyciwgZGF0YSkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmV0Y2hpbmcgSlNPTiBkYXRhIG1vZGVsIGZhaWxlZCBhdCBtb3VudHBvaW50LicpO1xuICAgIH1cbiAgICBib290KGRhdGEpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5saW5lYm9vdCAoKSB7XG4gICAgdmFyIGlkID0gY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS10YXVudXMnKTtcbiAgICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBkYXRhID0gSlNPTi5wYXJzZSh1bmVzY2FwZShzY3JpcHQuaW5uZXJUZXh0IHx8IHNjcmlwdC50ZXh0Q29udGVudCkpO1xuICAgIGJvb3QoZGF0YSk7XG4gIH1cblxuICBmdW5jdGlvbiBtYW51YWxib290ICgpIHtcbiAgICBpZiAodHlwZW9mIGcudGF1bnVzUmVhZHkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGcudGF1bnVzUmVhZHkgPSBib290OyAvLyBub3QgeWV0IGFuIG9iamVjdD8gdHVybiBpdCBpbnRvIHRoZSBib290IG1ldGhvZFxuICAgIH0gZWxzZSBpZiAoZy50YXVudXNSZWFkeSAmJiB0eXBlb2YgZy50YXVudXNSZWFkeSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGJvb3QoZy50YXVudXNSZWFkeSk7IC8vIGFscmVhZHkgYW4gb2JqZWN0PyBib290IHdpdGggdGhhdCBhcyB0aGUgZGF0YSBvYmplY3RcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdEaWQgeW91IGZvcmdldCB0byBhZGQgdGhlIHRhdW51c1JlYWR5IGdsb2JhbD8nKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBib290IChkYXRhKSB7XG4gICAgaWYgKGJvb3RlZCkgeyAvLyBzYW5pdHlcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhdW51cyBkYXRhIGlzIHJlcXVpcmVkISBCb290IGZhaWxlZCcpO1xuICAgIH1cbiAgICBpZiAoIWRhdGEudmVyc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdWZXJzaW9uIGRhdGEgaXMgbWlzc2luZyEgQm9vdCBmYWlsZWQnKTtcbiAgICB9XG4gICAgaWYgKCFkYXRhLm1vZGVsIHx8IHR5cGVvZiBkYXRhLm1vZGVsICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUYXVudXMgbW9kZWwgbXVzdCBiZSBhbiBvYmplY3QhIEJvb3QgZmFpbGVkJyk7XG4gICAgfVxuICAgIGJvb3RlZCA9IHRydWU7XG4gICAgY2FjaGluZy5wZXJzaXN0KHJvdXRlLCBzdGF0ZS5jb250YWluZXIsIGRhdGEpO1xuICAgIGFjdGl2YXRvci5zdGFydChkYXRhKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1vdW50O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxuLy8gc291cmNlOiBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9qZGFsdG9uLzVlMzRkODkwMTA1YWNhNDQzOTlmXG4vLyB0aGFua3MgQGpkYWx0b24hXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7IC8vIHVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgYFtbQ2xhc3NdXWAgb2YgdmFsdWVzXG52YXIgZm5Ub1N0cmluZyA9IEZ1bmN0aW9uLnByb3RvdHlwZS50b1N0cmluZzsgLy8gdXNlZCB0byByZXNvbHZlIHRoZSBkZWNvbXBpbGVkIHNvdXJjZSBvZiBmdW5jdGlvbnNcbnZhciBob3N0ID0gL15cXFtvYmplY3QgLis/Q29uc3RydWN0b3JcXF0kLzsgLy8gdXNlZCB0byBkZXRlY3QgaG9zdCBjb25zdHJ1Y3RvcnMgKFNhZmFyaSA+IDQ7IHJlYWxseSB0eXBlZCBhcnJheSBzcGVjaWZpYylcblxuLy8gRXNjYXBlIGFueSBzcGVjaWFsIHJlZ2V4cCBjaGFyYWN0ZXJzLlxudmFyIHNwZWNpYWxzID0gL1suKis/XiR7fSgpfFtcXF1cXC9cXFxcXS9nO1xuXG4vLyBSZXBsYWNlIG1lbnRpb25zIG9mIGB0b1N0cmluZ2Agd2l0aCBgLio/YCB0byBrZWVwIHRoZSB0ZW1wbGF0ZSBnZW5lcmljLlxuLy8gUmVwbGFjZSB0aGluZyBsaWtlIGBmb3IgLi4uYCB0byBzdXBwb3J0IGVudmlyb25tZW50cywgbGlrZSBSaGlubywgd2hpY2ggYWRkIGV4dHJhXG4vLyBpbmZvIHN1Y2ggYXMgbWV0aG9kIGFyaXR5LlxudmFyIGV4dHJhcyA9IC90b1N0cmluZ3woZnVuY3Rpb24pLio/KD89XFxcXFxcKCl8IGZvciAuKz8oPz1cXFxcXFxdKS9nO1xuXG4vLyBDb21waWxlIGEgcmVnZXhwIHVzaW5nIGEgY29tbW9uIG5hdGl2ZSBtZXRob2QgYXMgYSB0ZW1wbGF0ZS5cbi8vIFdlIGNob3NlIGBPYmplY3QjdG9TdHJpbmdgIGJlY2F1c2UgdGhlcmUncyBhIGdvb2QgY2hhbmNlIGl0IGlzIG5vdCBiZWluZyBtdWNrZWQgd2l0aC5cbnZhciBmblN0cmluZyA9IFN0cmluZyh0b1N0cmluZykucmVwbGFjZShzcGVjaWFscywgJ1xcXFwkJicpLnJlcGxhY2UoZXh0cmFzLCAnJDEuKj8nKTtcbnZhciByZU5hdGl2ZSA9IG5ldyBSZWdFeHAoJ14nICsgZm5TdHJpbmcgKyAnJCcpO1xuXG5mdW5jdGlvbiBuYXRpdmVGbiAodmFsdWUpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgLy8gVXNlIGBGdW5jdGlvbiN0b1N0cmluZ2AgdG8gYnlwYXNzIHRoZSB2YWx1ZSdzIG93biBgdG9TdHJpbmdgIG1ldGhvZFxuICAgIC8vIGFuZCBhdm9pZCBiZWluZyBmYWtlZCBvdXQuXG4gICAgcmV0dXJuIHJlTmF0aXZlLnRlc3QoZm5Ub1N0cmluZy5jYWxsKHZhbHVlKSk7XG4gIH1cblxuICAvLyBGYWxsYmFjayB0byBhIGhvc3Qgb2JqZWN0IGNoZWNrIGJlY2F1c2Ugc29tZSBlbnZpcm9ubWVudHMgd2lsbCByZXByZXNlbnRcbiAgLy8gdGhpbmdzIGxpa2UgdHlwZWQgYXJyYXlzIGFzIERPTSBtZXRob2RzIHdoaWNoIG1heSBub3QgY29uZm9ybSB0byB0aGVcbiAgLy8gbm9ybWFsIG5hdGl2ZSBwYXR0ZXJuLlxuICByZXR1cm4gKHZhbHVlICYmIHR5cGUgPT09ICdvYmplY3QnICYmIGhvc3QudGVzdCh0b1N0cmluZy5jYWxsKHZhbHVlKSkpIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG5hdGl2ZUZuO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChmbikge1xuICB2YXIgdXNlZDtcbiAgcmV0dXJuIGZ1bmN0aW9uIG9uY2UgKCkge1xuICAgIGlmICh1c2VkKSB7IHJldHVybjsgfSB1c2VkID0gdHJ1ZTtcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG5cbmZ1bmN0aW9uIHBhcnRpYWwgKGNvbnRhaW5lciwgZW5mb3JjZWRBY3Rpb24sIG1vZGVsLCByb3V0ZSwgb3B0aW9ucykge1xuICB2YXIgYWN0aW9uID0gZW5mb3JjZWRBY3Rpb24gfHwgbW9kZWwgJiYgbW9kZWwuYWN0aW9uIHx8IHJvdXRlICYmIHJvdXRlLmFjdGlvbjtcbiAgdmFyIGNvbnRyb2xsZXIgPSBzdGF0ZS5jb250cm9sbGVyc1thY3Rpb25dO1xuICB2YXIgaW50ZXJuYWxzID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKGludGVybmFscy5yZW5kZXIgIT09IGZhbHNlKSB7XG4gICAgY29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlcihhY3Rpb24sIG1vZGVsKTtcbiAgfVxuICBlbWl0dGVyLmVtaXQoJ3JlbmRlcicsIGNvbnRhaW5lciwgbW9kZWwpO1xuICBpZiAoY29udHJvbGxlcikge1xuICAgIGNvbnRyb2xsZXIobW9kZWwsIGNvbnRhaW5lciwgcm91dGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlciAoYWN0aW9uLCBtb2RlbCkge1xuICB2YXIgdGVtcGxhdGUgPSBzdGF0ZS50ZW1wbGF0ZXNbYWN0aW9uXTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gdGVtcGxhdGUobW9kZWwpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciByZW5kZXJpbmcgXCInICsgYWN0aW9uICsgJ1wiIHRlbXBsYXRlXFxuJyArIGUuc3RhY2spO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YW5kYWxvbmUgKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCwgcm91dGUpIHtcbiAgcmV0dXJuIHBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSwgeyByb3V0ZWQ6IGZhbHNlIH0pO1xufVxuXG5wYXJ0aWFsLnN0YW5kYWxvbmUgPSBzdGFuZGFsb25lO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnRpYWw7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1cmwgPSByZXF1aXJlKCdmYXN0LXVybC1wYXJzZXInKTtcbnZhciByb3V0ZXMgPSByZXF1aXJlKCdyb3V0ZXMnKTtcbnZhciBtYXRjaGVyID0gcm91dGVzKCk7XG52YXIgcHJvdG9jb2wgPSAvXlthLXpdKz86XFwvXFwvL2k7XG5cbmZ1bmN0aW9uIGdldEZ1bGxVcmwgKHJhdykge1xuICB2YXIgYmFzZSA9IGxvY2F0aW9uLmhyZWYuc3Vic3RyKGxvY2F0aW9uLm9yaWdpbi5sZW5ndGgpO1xuICB2YXIgaGFzaGxlc3M7XG4gIGlmICghcmF3KSB7XG4gICAgcmV0dXJuIGJhc2U7XG4gIH1cbiAgaWYgKHJhd1swXSA9PT0gJyMnKSB7XG4gICAgaGFzaGxlc3MgPSBiYXNlLnN1YnN0cigwLCBiYXNlLmxlbmd0aCAtIGxvY2F0aW9uLmhhc2gubGVuZ3RoKTtcbiAgICByZXR1cm4gaGFzaGxlc3MgKyByYXc7XG4gIH1cbiAgaWYgKHByb3RvY29sLnRlc3QocmF3KSkge1xuICAgIGlmIChyYXcuaW5kZXhPZihsb2NhdGlvbi5vcmlnaW4pID09PSAwKSB7XG4gICAgICByZXR1cm4gcmF3LnN1YnN0cihsb2NhdGlvbi5vcmlnaW4ubGVuZ3RoKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHJhdztcbn1cblxuZnVuY3Rpb24gcm91dGVyIChyYXcpIHtcbiAgdmFyIGZ1bGwgPSBnZXRGdWxsVXJsKHJhdyk7XG4gIGlmIChmdWxsID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGZ1bGw7XG4gIH1cbiAgdmFyIHBhcnRzID0gdXJsLnBhcnNlKGZ1bGwpO1xuICB2YXIgcmVzdWx0ID0gbWF0Y2hlci5tYXRjaChwYXJ0cy5wYXRobmFtZSk7XG4gIHZhciByb3V0ZSA9IHJlc3VsdCA/IHJlc3VsdC5mbihyZXN1bHQpIDogbnVsbDtcbiAgaWYgKHJvdXRlKSB7XG4gICAgcm91dGUudXJsID0gZnVsbDtcbiAgICByb3V0ZS5wYXJ0cyA9IHBhcnRzO1xuICB9XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gc2V0dXAgKGRlZmluaXRpb25zKSB7XG4gIGRlZmluaXRpb25zLmZvckVhY2goZGVmaW5lKTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lIChkZWZpbml0aW9uKSB7XG4gIG1hdGNoZXIuYWRkUm91dGUoZGVmaW5pdGlvbi5yb3V0ZSwgZnVuY3Rpb24gYnVpbGQgKG1hdGNoKSB7XG4gICAgdmFyIHBhcmFtcyA9IG1hdGNoLnBhcmFtcztcbiAgICBwYXJhbXMuYXJncyA9IG1hdGNoLnNwbGF0cztcbiAgICByZXR1cm4ge1xuICAgICAgcm91dGU6IGRlZmluaXRpb24ucm91dGUsXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIGFjdGlvbjogZGVmaW5pdGlvbi5hY3Rpb24gfHwgbnVsbCxcbiAgICAgIGlnbm9yZTogZGVmaW5pdGlvbi5pZ25vcmUsXG4gICAgICBjYWNoZTogZGVmaW5pdGlvbi5jYWNoZVxuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBlcXVhbHMgKGxlZnQsIHJpZ2h0KSB7XG4gIHJldHVybiBsZWZ0ICYmIHJpZ2h0ICYmIGxlZnQucm91dGUgPT09IHJpZ2h0LnJvdXRlICYmIEpTT04uc3RyaW5naWZ5KGxlZnQucGFyYW1zKSA9PT0gSlNPTi5zdHJpbmdpZnkocmlnaHQucGFyYW1zKTtcbn1cblxucm91dGVyLnNldHVwID0gc2V0dXA7XG5yb3V0ZXIuZXF1YWxzID0gZXF1YWxzO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJvdXRlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNvbnRhaW5lcjogbnVsbFxufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGFwaSA9IHt9O1xudmFyIGcgPSBnbG9iYWw7XG52YXIgaWRiID0gZy5pbmRleGVkREIgfHwgZy5tb3pJbmRleGVkREIgfHwgZy53ZWJraXRJbmRleGVkREIgfHwgZy5tc0luZGV4ZWREQjtcbnZhciBzdXBwb3J0cztcbnZhciBkYjtcbnZhciBkYk5hbWUgPSAndGF1bnVzJztcbnZhciBzdG9yZSA9ICd3aWxkc3RvcmUnO1xudmFyIGtleVBhdGggPSAna2V5JztcbnZhciBzZXRRdWV1ZSA9IFtdO1xudmFyIHRlc3RlZFF1ZXVlID0gW107XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gdGVzdCAoKSB7XG4gIHZhciBrZXkgPSAnaW5kZXhlZC1kYi1mZWF0dXJlLWRldGVjdGlvbic7XG4gIHZhciByZXE7XG4gIHZhciBkYjtcblxuICBpZiAoIShpZGIgJiYgJ2RlbGV0ZURhdGFiYXNlJyBpbiBpZGIpKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7IHJldHVybjtcbiAgfVxuXG4gIHRyeSB7XG4gICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSkub25zdWNjZXNzID0gdHJhbnNhY3Rpb25hbFRlc3Q7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyYW5zYWN0aW9uYWxUZXN0ICgpIHtcbiAgICByZXEgPSBpZGIub3BlbihrZXksIDEpO1xuICAgIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gICAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICAgIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgICByZXEucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdzdG9yZScpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgICAgZGIgPSByZXEucmVzdWx0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGIudHJhbnNhY3Rpb24oJ3N0b3JlJywgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKCdzdG9yZScpLmFkZChuZXcgQmxvYigpLCAna2V5Jyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZGIuY2xvc2UoKTtcbiAgICAgICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSk7XG4gICAgICAgIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICBvcGVuKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgICBzdXBwb3J0KGZhbHNlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gb3BlbiAoKSB7XG4gIHZhciByZXEgPSBpZGIub3BlbihkYk5hbWUsIDEpO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuICByZXEub251cGdyYWRlbmVlZGVkID0gdXBnbmVlZGVkO1xuICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICBmdW5jdGlvbiB1cGduZWVkZWQgKCkge1xuICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoc3RvcmUsIHsga2V5UGF0aDoga2V5UGF0aCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIGRiID0gcmVxLnJlc3VsdDtcbiAgICBhcGkubmFtZSA9ICdJbmRleGVkREInO1xuICAgIGFwaS5nZXQgPSBnZXQ7XG4gICAgYXBpLnNldCA9IHNldDtcbiAgICBkcmFpblNldCgpO1xuICAgIHN1cHBvcnQodHJ1ZSk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmFsbGJhY2sgKCkge1xuICBhcGkubmFtZSA9ICdJbmRleGVkREItZmFsbGJhY2tTdG9yZSc7XG4gIGFwaS5nZXQgPSB1bmRlZmluZWRHZXQ7XG4gIGFwaS5zZXQgPSBlbnF1ZXVlU2V0O1xufVxuXG5mdW5jdGlvbiB1bmRlZmluZWRHZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIG51bGwpO1xufVxuXG5mdW5jdGlvbiBlbnF1ZXVlU2V0IChrZXksICB2YWx1ZSwgZG9uZSkge1xuICBpZiAoc2V0UXVldWUubGVuZ3RoID4gMikgeyAvLyBsZXQncyBub3Qgd2FzdGUgYW55IG1vcmUgbWVtb3J5XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHsgLy8gbGV0J3MgYXNzdW1lIHRoZSBjYXBhYmlsaXR5IGlzIHZhbGlkYXRlZCBzb29uXG4gICAgc2V0UXVldWUucHVzaCh7IGtleToga2V5LCB2YWx1ZTogdmFsdWUsIGRvbmU6IGRvbmUgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5TZXQgKCkge1xuICB3aGlsZSAoc2V0UXVldWUubGVuZ3RoKSB7XG4gICAgdmFyIGl0ZW0gPSBzZXRRdWV1ZS5zaGlmdCgpO1xuICAgIHNldChpdGVtLmtleSwgaXRlbS52YWx1ZSwgaXRlbS5kb25lKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBxdWVyeSAob3AsIHZhbHVlLCBkb25lKSB7XG4gIHZhciByZXEgPSBkYi50cmFuc2FjdGlvbihzdG9yZSwgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKHN0b3JlKVtvcF0odmFsdWUpO1xuXG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG51bGwsIHJlcS5yZXN1bHQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG5ldyBFcnJvcignVGF1bnVzIGNhY2hlIHF1ZXJ5IGZhaWxlZCBhdCBJbmRleGVkREIhJykpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldCAoa2V5LCBkb25lKSB7XG4gIHF1ZXJ5KCdnZXQnLCBrZXksIGRvbmUpO1xufVxuXG5mdW5jdGlvbiBzZXQgKGtleSwgdmFsdWUsIGRvbmUpIHtcbiAgdmFsdWVba2V5UGF0aF0gPSBrZXk7XG4gIHF1ZXJ5KCdhZGQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gaW5zZXJ0XG4gIHF1ZXJ5KCdwdXQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gdXBkYXRlXG59XG5cbmZ1bmN0aW9uIGRyYWluVGVzdGVkICgpIHtcbiAgd2hpbGUgKHRlc3RlZFF1ZXVlLmxlbmd0aCkge1xuICAgIHRlc3RlZFF1ZXVlLnNoaWZ0KCkoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0ZXN0ZWQgKGZuKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgZm4oKTtcbiAgfSBlbHNlIHtcbiAgICB0ZXN0ZWRRdWV1ZS5wdXNoKGZuKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdXBwb3J0ICh2YWx1ZSkge1xuICBpZiAoc3VwcG9ydHMgIT09IHZvaWQgMCkge1xuICAgIHJldHVybjsgLy8gc2FuaXR5XG4gIH1cbiAgc3VwcG9ydHMgPSB2YWx1ZTtcbiAgZHJhaW5UZXN0ZWQoKTtcbn1cblxuZnVuY3Rpb24gZmFpbGVkICgpIHtcbiAgc3VwcG9ydChmYWxzZSk7XG59XG5cbmZhbGxiYWNrKCk7XG50ZXN0KCk7XG5zZXRUaW1lb3V0KGZhaWxlZCwgNjAwKTsgLy8gdGhlIHRlc3QgY2FuIHRha2Ugc29tZXdoZXJlIG5lYXIgMzAwbXMgdG8gY29tcGxldGVcblxubW9kdWxlLmV4cG9ydHMgPSBhcGk7XG5cbmFwaS50ZXN0ZWQgPSB0ZXN0ZWQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmF3ID0ge307XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgZG9uZShudWxsLCByYXdba2V5XSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICByYXdba2V5XSA9IHZhbHVlO1xuICAoZG9uZSB8fCBub29wKShudWxsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG5hbWU6ICdtZW1vcnlTdG9yZScsXG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJlRXNjYXBlZEh0bWwgPSAvJig/OmFtcHxsdHxndHxxdW90fCMzOXwjOTYpOy9nO1xudmFyIGh0bWxVbmVzY2FwZXMgPSB7XG4gICcmYW1wOyc6ICcmJyxcbiAgJyZsdDsnOiAnPCcsXG4gICcmZ3Q7JzogJz4nLFxuICAnJnF1b3Q7JzogJ1wiJyxcbiAgJyYjMzk7JzogJ1xcJycsXG4gICcmIzk2Oyc6ICdgJ1xufTtcblxuZnVuY3Rpb24gdW5lc2NhcGVIdG1sQ2hhciAoYykge1xuICByZXR1cm4gaHRtbFVuZXNjYXBlc1tjXTtcbn1cblxuZnVuY3Rpb24gdW5lc2NhcGUgKGlucHV0KSB7XG4gIHZhciBkYXRhID0gaW5wdXQgPT0gbnVsbCA/ICcnIDogU3RyaW5nKGlucHV0KTtcbiAgaWYgKGRhdGEgJiYgKHJlRXNjYXBlZEh0bWwubGFzdEluZGV4ID0gMCwgcmVFc2NhcGVkSHRtbC50ZXN0KGRhdGEpKSkge1xuICAgIHJldHVybiBkYXRhLnJlcGxhY2UocmVFc2NhcGVkSHRtbCwgdW5lc2NhcGVIdG1sQ2hhcik7XG4gIH1cbiAgcmV0dXJuIGRhdGE7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdW5lc2NhcGU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCd4aHInKTtcblxuZnVuY3Rpb24gcmVxdWVzdCAodXJsLCBvLCBkb25lKSB7XG4gIHZhciBvcHRpb25zID0ge1xuICAgIHVybDogdXJsLFxuICAgIGpzb246IHRydWUsXG4gICAgaGVhZGVyczogeyBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyB9XG4gIH07XG4gIGlmIChkb25lKSB7XG4gICAgT2JqZWN0LmtleXMobykuZm9yRWFjaChvdmVyd3JpdGUpO1xuICB9IGVsc2Uge1xuICAgIGRvbmUgPSBvO1xuICB9XG4gIHZhciByZXEgPSB4aHIob3B0aW9ucywgaGFuZGxlKTtcblxuICByZXR1cm4gcmVxO1xuXG4gIGZ1bmN0aW9uIG92ZXJ3cml0ZSAocHJvcCkge1xuICAgIG9wdGlvbnNbcHJvcF0gPSBvW3Byb3BdO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlIChlcnIsIHJlcywgYm9keSkge1xuICAgIGlmIChlcnIgJiYgIXJlcS5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSkge1xuICAgICAgZG9uZShuZXcgRXJyb3IoJ2Fib3J0ZWQnKSwgbnVsbCwgcmVzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZShlcnIsIGJvZHksIHJlcyk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWVzdDtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zcmMvY29udHJhLmVtaXR0ZXIuanMnKTtcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4oZnVuY3Rpb24gKHJvb3QsIHVuZGVmaW5lZCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHVuZGVmID0gJycgKyB1bmRlZmluZWQ7XG4gIGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4gIGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7IGlmICghZm4pIHsgcmV0dXJuOyB9IHRpY2soZnVuY3Rpb24gcnVuICgpIHsgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pOyB9KTsgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIHRpY2tlclxuICB2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuICBpZiAoc2kpIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIHByb2Nlc3MgIT09IHVuZGVmICYmIHByb2Nlc3MubmV4dFRpY2spIHtcbiAgICB0aWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgfSBlbHNlIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX2VtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldnQgPSB7fTtcbiAgICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gICAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChjID09PSAxKSB7XG4gICAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgICAgZXZ0ID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGN0eCA9IHRoaXM7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciB0eXBlID0gYXJncy5zaGlmdCgpO1xuICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICBpZiAoIWV0KSB7IHJldHVybiB0aGluZzsgfVxuICAgICAgZXZ0W3R5cGVdID0gZXQuZmlsdGVyKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgIHJldHVybiAhbGlzdGVuLl9vbmNlO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICByZXR1cm4gdGhpbmc7XG4gIH1cblxuICAvLyBjcm9zcy1wbGF0Zm9ybSBleHBvcnRcbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09IHVuZGVmICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBfZW1pdHRlcjtcbiAgfSBlbHNlIHtcbiAgICByb290LmNvbnRyYSA9IHJvb3QuY29udHJhIHx8IHt9O1xuICAgIHJvb3QuY29udHJhLmVtaXR0ZXIgPSBfZW1pdHRlcjtcbiAgfVxufSkodGhpcyk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiKSkiLCJcInVzZSBzdHJpY3RcIjtcbi8qXG5Db3B5cmlnaHQgKGMpIDIwMTQgUGV0a2EgQW50b25vdlxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG5hbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiAgSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuVEhFIFNPRlRXQVJFLlxuKi9cbmZ1bmN0aW9uIFVybCgpIHtcbiAgICAvL0ZvciBtb3JlIGVmZmljaWVudCBpbnRlcm5hbCByZXByZXNlbnRhdGlvbiBhbmQgbGF6aW5lc3MuXG4gICAgLy9UaGUgbm9uLXVuZGVyc2NvcmUgdmVyc2lvbnMgb2YgdGhlc2UgcHJvcGVydGllcyBhcmUgYWNjZXNzb3IgZnVuY3Rpb25zXG4gICAgLy9kZWZpbmVkIG9uIHRoZSBwcm90b3R5cGUuXG4gICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgIHRoaXMuX2hyZWYgPSBcIlwiO1xuICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICB0aGlzLl9xdWVyeSA9IG51bGw7XG5cbiAgICB0aGlzLmF1dGggPSBudWxsO1xuICAgIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gICAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgICB0aGlzLmhhc2ggPSBudWxsO1xuICAgIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcblxuICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IGZhbHNlO1xufVxuXG52YXIgcXVlcnlzdHJpbmcgPSByZXF1aXJlKFwicXVlcnlzdHJpbmdcIik7XG5VcmwucHJvdG90eXBlLnBhcnNlID1cbmZ1bmN0aW9uIFVybCRwYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAodHlwZW9mIHN0ciAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUGFyYW1ldGVyICd1cmwnIG11c3QgYmUgYSBzdHJpbmcsIG5vdCBcIiArXG4gICAgICAgICAgICB0eXBlb2Ygc3RyKTtcbiAgICB9XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICB2YXIgZW5kID0gc3RyLmxlbmd0aCAtIDE7XG5cbiAgICAvL1RyaW0gbGVhZGluZyBhbmQgdHJhaWxpbmcgd3NcbiAgICB3aGlsZSAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpIDw9IDB4MjAgLyonICcqLykgc3RhcnQrKztcbiAgICB3aGlsZSAoc3RyLmNoYXJDb2RlQXQoZW5kKSA8PSAweDIwIC8qJyAnKi8pIGVuZC0tO1xuXG4gICAgc3RhcnQgPSB0aGlzLl9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCk7XG5cbiAgICAvL0phdmFzY3JpcHQgZG9lc24ndCBoYXZlIGhvc3RcbiAgICBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgIHN0YXJ0ID0gdGhpcy5fcGFyc2VIb3N0KHN0ciwgc3RhcnQsIGVuZCwgaG9zdERlbm90ZXNTbGFzaCk7XG4gICAgICAgIHZhciBwcm90byA9IHRoaXMuX3Byb3RvY29sO1xuICAgICAgICBpZiAoIXRoaXMuaG9zdG5hbWUgJiZcbiAgICAgICAgICAgICh0aGlzLnNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaFByb3RvY29sc1twcm90b10pKSkge1xuICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPD0gZW5kKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KHN0YXJ0KTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDIzIC8qJyMnKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlSGFzaChzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuX3Byb3RvY29sICE9PSBcImphdmFzY3JpcHRcIikge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7IC8vRm9yIGphdmFzY3JpcHQgdGhlIHBhdGhuYW1lIGlzIGp1c3QgdGhlIHJlc3Qgb2YgaXRcbiAgICAgICAgICAgIHRoaXMucGF0aG5hbWUgPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEgKTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBhdGhuYW1lICYmIHRoaXMuaG9zdG5hbWUgJiZcbiAgICAgICAgdGhpcy5fc2xhc2hQcm90b2NvbHNbdGhpcy5fcHJvdG9jb2xdKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICB9XG5cbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgICAgIGlmIChzZWFyY2ggPT0gbnVsbCkge1xuICAgICAgICAgICAgc2VhcmNoID0gdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guY2hhckNvZGVBdCgwKSA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSBzZWFyY2guc2xpY2UoMSk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNhbGxzIGEgc2V0dGVyIGZ1bmN0aW9uLCB0aGVyZSBpcyBubyAucXVlcnkgZGF0YSBwcm9wZXJ0eVxuICAgICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2Uoc2VhcmNoKTtcbiAgICB9XG59O1xuXG5VcmwucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkcmVzb2x2ZShyZWxhdGl2ZSkge1xuICAgIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QoVXJsLnBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuVXJsLnByb3RvdHlwZS5mb3JtYXQgPSBmdW5jdGlvbiBVcmwkZm9ybWF0KCkge1xuICAgIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8IFwiXCI7XG5cbiAgICBpZiAoYXV0aCkge1xuICAgICAgICBhdXRoID0gZW5jb2RlVVJJQ29tcG9uZW50KGF1dGgpO1xuICAgICAgICBhdXRoID0gYXV0aC5yZXBsYWNlKC8lM0EvaSwgXCI6XCIpO1xuICAgICAgICBhdXRoICs9IFwiQFwiO1xuICAgIH1cblxuICAgIHZhciBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgXCJcIjtcbiAgICB2YXIgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgdmFyIGhhc2ggPSB0aGlzLmhhc2ggfHwgXCJcIjtcbiAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgXCJcIjtcbiAgICB2YXIgcXVlcnkgPSBcIlwiO1xuICAgIHZhciBob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgcG9ydCA9IHRoaXMucG9ydCB8fCBcIlwiO1xuICAgIHZhciBob3N0ID0gZmFsc2U7XG4gICAgdmFyIHNjaGVtZSA9IFwiXCI7XG5cbiAgICAvL0NhY2hlIHRoZSByZXN1bHQgb2YgdGhlIGdldHRlciBmdW5jdGlvblxuICAgIHZhciBxID0gdGhpcy5xdWVyeTtcbiAgICBpZiAocSAmJiB0eXBlb2YgcSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeShxKTtcbiAgICB9XG5cbiAgICBpZiAoIXNlYXJjaCkge1xuICAgICAgICBzZWFyY2ggPSBxdWVyeSA/IFwiP1wiICsgcXVlcnkgOiBcIlwiO1xuICAgIH1cblxuICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5jaGFyQ29kZUF0KHByb3RvY29sLmxlbmd0aCAtIDEpICE9PSAweDNBIC8qJzonKi8pXG4gICAgICAgIHByb3RvY29sICs9IFwiOlwiO1xuXG4gICAgaWYgKHRoaXMuaG9zdCkge1xuICAgICAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgICB9XG4gICAgZWxzZSBpZiAoaG9zdG5hbWUpIHtcbiAgICAgICAgdmFyIGlwNiA9IGhvc3RuYW1lLmluZGV4T2YoXCI6XCIpID4gLTE7XG4gICAgICAgIGlmIChpcDYpIGhvc3RuYW1lID0gXCJbXCIgKyBob3N0bmFtZSArIFwiXVwiO1xuICAgICAgICBob3N0ID0gYXV0aCArIGhvc3RuYW1lICsgKHBvcnQgPyBcIjpcIiArIHBvcnQgOiBcIlwiKTtcbiAgICB9XG5cbiAgICB2YXIgc2xhc2hlcyA9IHRoaXMuc2xhc2hlcyB8fFxuICAgICAgICAoKCFwcm90b2NvbCB8fFxuICAgICAgICBzbGFzaFByb3RvY29sc1twcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKTtcblxuXG4gICAgaWYgKHByb3RvY29sKSBzY2hlbWUgPSBwcm90b2NvbCArIChzbGFzaGVzID8gXCIvL1wiIDogXCJcIik7XG4gICAgZWxzZSBpZiAoc2xhc2hlcykgc2NoZW1lID0gXCIvL1wiO1xuXG4gICAgaWYgKHNsYXNoZXMgJiYgcGF0aG5hbWUgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCgwKSAhPT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgIHBhdGhuYW1lID0gXCIvXCIgKyBwYXRobmFtZTtcbiAgICB9XG4gICAgZWxzZSBpZiAoIXNsYXNoZXMgJiYgcGF0aG5hbWUgPT09IFwiL1wiKSB7XG4gICAgICAgIHBhdGhuYW1lID0gXCJcIjtcbiAgICB9XG4gICAgaWYgKHNlYXJjaCAmJiBzZWFyY2guY2hhckNvZGVBdCgwKSAhPT0gMHgzRiAvKic/JyovKVxuICAgICAgICBzZWFyY2ggPSBcIj9cIiArIHNlYXJjaDtcbiAgICBpZiAoaGFzaCAmJiBoYXNoLmNoYXJDb2RlQXQoMCkgIT09IDB4MjMgLyonIycqLylcbiAgICAgICAgaGFzaCA9IFwiI1wiICsgaGFzaDtcblxuICAgIHBhdGhuYW1lID0gZXNjYXBlUGF0aE5hbWUocGF0aG5hbWUpO1xuICAgIHNlYXJjaCA9IGVzY2FwZVNlYXJjaChzZWFyY2gpO1xuXG4gICAgcmV0dXJuIHNjaGVtZSArIChob3N0ID09PSBmYWxzZSA/IFwiXCIgOiBob3N0KSArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlT2JqZWN0KHJlbGF0aXZlKSB7XG4gICAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gXCJzdHJpbmdcIilcbiAgICAgICAgcmVsYXRpdmUgPSBVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcblxuICAgIHZhciByZXN1bHQgPSB0aGlzLl9jbG9uZSgpO1xuXG4gICAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gICAgLy8gZXZlbiBocmVmPVwiXCIgd2lsbCByZW1vdmUgaXQuXG4gICAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gICAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZVwicyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgICBpZiAoIXJlbGF0aXZlLmhyZWYpIHtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBocmVmcyBsaWtlIC8vZm9vL2JhciBhbHdheXMgY3V0IHRvIHRoZSBwcm90b2NvbC5cbiAgICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIHRydWUpO1xuXG4gICAgICAgIGlmIChzbGFzaFByb3RvY29sc1tyZXN1bHQuX3Byb3RvY29sXSAmJlxuICAgICAgICAgICAgcmVzdWx0Lmhvc3RuYW1lICYmICFyZXN1bHQucGF0aG5hbWUpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKHJlbGF0aXZlLl9wcm90b2NvbCAmJiByZWxhdGl2ZS5fcHJvdG9jb2wgIT09IHJlc3VsdC5fcHJvdG9jb2wpIHtcbiAgICAgICAgLy8gaWYgaXRcInMgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAgICAgLy8gdGhlIHByb3RvY29sIGRvZXMgd2VpcmQgdGhpbmdzXG4gICAgICAgIC8vIGZpcnN0LCBpZiBpdFwicyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAgICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAgICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgICAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgICAgICAvLyBiZWNhdXNlIHRoYXRcInMga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICAgICAgaWYgKCFzbGFzaFByb3RvY29sc1tyZWxhdGl2ZS5fcHJvdG9jb2xdKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5fY29weVByb3BzVG8ocmVzdWx0LCBmYWxzZSk7XG4gICAgICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdC5fcHJvdG9jb2wgPSByZWxhdGl2ZS5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCAmJiByZWxhdGl2ZS5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCBcIlwiKS5zcGxpdChcIi9cIik7XG4gICAgICAgICAgICB3aGlsZSAocmVsUGF0aC5sZW5ndGggJiYgIShyZWxhdGl2ZS5ob3N0ID0gcmVsUGF0aC5zaGlmdCgpKSk7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHJlbGF0aXZlLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGhbMF0gIT09IFwiXCIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbihcIi9cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCBcIlwiO1xuICAgICAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IHJlbGF0aXZlLl9wb3J0O1xuICAgICAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgdmFyIGlzU291cmNlQWJzID1cbiAgICAgICAgKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcbiAgICB2YXIgaXNSZWxBYnMgPSAoXG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IHx8XG4gICAgICAgICAgICAocmVsYXRpdmUucGF0aG5hbWUgJiZcbiAgICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDB4MkYgLyonLycqLylcbiAgICAgICAgKTtcbiAgICB2YXIgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKSk7XG5cbiAgICB2YXIgcmVtb3ZlQWxsRG90cyA9IG11c3RFbmRBYnM7XG5cbiAgICB2YXIgc3JjUGF0aCA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoXCIvXCIpIHx8IFtdO1xuICAgIHZhciByZWxQYXRoID0gcmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoXCIvXCIpIHx8IFtdO1xuICAgIHZhciBwc3ljaG90aWMgPSByZXN1bHQuX3Byb3RvY29sICYmICFzbGFzaFByb3RvY29sc1tyZXN1bHQuX3Byb3RvY29sXTtcblxuICAgIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gICAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAgIC8vIHJlc3VsdC5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gICAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICByZXN1bHQuX3BvcnQgPSAtMTtcbiAgICAgICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICAgICAgICBpZiAoc3JjUGF0aFswXSA9PT0gXCJcIikgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gXCJcIjtcbiAgICAgICAgaWYgKHJlbGF0aXZlLl9wcm90b2NvbCkge1xuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgcmVsYXRpdmUuX3BvcnQgPSAtMTtcbiAgICAgICAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09IFwiXCIpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICAgICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09IFwiXCIgfHwgc3JjUGF0aFswXSA9PT0gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKGlzUmVsQWJzKSB7XG4gICAgICAgIC8vIGl0XCJzIGFic29sdXRlLlxuICAgICAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgP1xuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICAgIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gaXRcInMgcmVsYXRpdmVcbiAgICAgICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgICAgICBzcmNQYXRoLnBvcCgpO1xuICAgICAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgfSBlbHNlIGlmIChyZWxhdGl2ZS5zZWFyY2gpIHtcbiAgICAgICAgLy8ganVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgICAgICAvLyBsaWtlIGhyZWY9XCI/Zm9vXCIuXG4gICAgICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgICAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgICAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgICAgICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwID9cbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdChcIkBcIikgOiBmYWxzZTtcbiAgICAgICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAgICAgLy8gd2VcInZlIGFscmVhZHkgaGFuZGxlZCB0aGUgb3RoZXIgc3R1ZmYgYWJvdmUuXG4gICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gICAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gICAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICAgIHZhciBoYXNUcmFpbGluZ1NsYXNoID0gKFxuICAgICAgICAocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCkgJiYgKGxhc3QgPT09IFwiLlwiIHx8IGxhc3QgPT09IFwiLi5cIikgfHxcbiAgICAgICAgbGFzdCA9PT0gXCJcIik7XG5cbiAgICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gICAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgICB2YXIgdXAgPSAwO1xuICAgIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgICAgIGlmIChsYXN0ID09IFwiLlwiKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgfSBlbHNlIGlmIChsYXN0ID09PSBcIi4uXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgdXArKztcbiAgICAgICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cC0tO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICAgIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgICAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgICAgICAgIHNyY1BhdGgudW5zaGlmdChcIi4uXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gXCJcIiAmJlxuICAgICAgICAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiAoc3JjUGF0aC5qb2luKFwiL1wiKS5zdWJzdHIoLTEpICE9PSBcIi9cIikpIHtcbiAgICAgICAgc3JjUGF0aC5wdXNoKFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBpc0Fic29sdXRlID0gc3JjUGF0aFswXSA9PT0gXCJcIiB8fFxuICAgICAgICAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgPT09IDB4MkYgLyonLycqLyk7XG5cbiAgICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBpc0Fic29sdXRlID8gXCJcIiA6XG4gICAgICAgICAgICBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6IFwiXCI7XG4gICAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgLy91cmwucmVzb2x2ZU9iamVjdChcIm1haWx0bzpsb2NhbDFAZG9tYWluMVwiLCBcImxvY2FsMkBkb21haW4yXCIpXG4gICAgICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZihcIkBcIikgPiAwID9cbiAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgICAgICBzcmNQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgfVxuXG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5sZW5ndGggPT09IDAgPyBudWxsIDogc3JjUGF0aC5qb2luKFwiL1wiKTtcbiAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGggfHwgcmVzdWx0LmF1dGg7XG4gICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBwdW55Y29kZSA9IHJlcXVpcmUoXCJwdW55Y29kZVwiKTtcblVybC5wcm90b3R5cGUuX2hvc3RJZG5hID0gZnVuY3Rpb24gVXJsJF9ob3N0SWRuYShob3N0bmFtZSkge1xuICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnkgY29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHRoZSBwYXJ0IG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgLy8gaGFzIG5vbiBBU0NJSSBjaGFyYWN0ZXJzLiBJLmUuIGl0IGRvc2VudCBtYXR0ZXIgaWZcbiAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBpbiBBU0NJSS5cbiAgICB2YXIgZG9tYWluQXJyYXkgPSBob3N0bmFtZS5zcGxpdChcIi5cIik7XG4gICAgdmFyIG5ld091dCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZG9tYWluQXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIHMgPSBkb21haW5BcnJheVtpXTtcbiAgICAgICAgbmV3T3V0LnB1c2gocy5tYXRjaCgvW15BLVphLXowLTlfLV0vKSA/XG4gICAgICAgICAgICBcInhuLS1cIiArIHB1bnljb2RlLmVuY29kZShzKSA6IHMpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3T3V0LmpvaW4oXCIuXCIpO1xufTtcblxudmFyIGVzY2FwZVBhdGhOYW1lID0gVXJsLnByb3RvdHlwZS5fZXNjYXBlUGF0aE5hbWUgPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVQYXRoTmFtZShwYXRobmFtZSkge1xuICAgIGlmICghY29udGFpbnNDaGFyYWN0ZXIyKHBhdGhuYW1lLCAweDIzIC8qJyMnKi8sIDB4M0YgLyonPycqLykpIHtcbiAgICAgICAgcmV0dXJuIHBhdGhuYW1lO1xuICAgIH1cbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlUGF0aChwYXRobmFtZSk7XG59O1xuXG52YXIgZXNjYXBlU2VhcmNoID0gVXJsLnByb3RvdHlwZS5fZXNjYXBlU2VhcmNoID1cbmZ1bmN0aW9uIFVybCRfZXNjYXBlU2VhcmNoKHNlYXJjaCkge1xuICAgIGlmICghY29udGFpbnNDaGFyYWN0ZXIyKHNlYXJjaCwgMHgyMyAvKicjJyovLCAtMSkpIHJldHVybiBzZWFyY2g7XG4gICAgLy9Bdm9pZCBjbG9zdXJlIGNyZWF0aW9uIHRvIGtlZXAgdGhpcyBpbmxpbmFibGVcbiAgICByZXR1cm4gX2VzY2FwZVNlYXJjaChzZWFyY2gpO1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQcm90b2NvbCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQcm90b2NvbChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgZG9Mb3dlckNhc2UgPSBmYWxzZTtcbiAgICB2YXIgcHJvdG9jb2xDaGFyYWN0ZXJzID0gdGhpcy5fcHJvdG9jb2xDaGFyYWN0ZXJzO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICB2YXIgcHJvdG9jb2wgPSBzdHIuc2xpY2Uoc3RhcnQsIGkpO1xuICAgICAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBwcm90b2NvbCA9IHByb3RvY29sLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHByb3RvY29sO1xuICAgICAgICAgICAgcmV0dXJuIGkgKyAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHByb3RvY29sQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGlmIChjaCA8IDB4NjEgLyonYScqLylcbiAgICAgICAgICAgICAgICBkb0xvd2VyQ2FzZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgIH1cblxuICAgIH1cbiAgICByZXR1cm4gc3RhcnQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUF1dGggPSBmdW5jdGlvbiBVcmwkX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBlbmQsIGRlY29kZSkge1xuICAgIHZhciBhdXRoID0gc3RyLnNsaWNlKHN0YXJ0LCBlbmQgKyAxKTtcbiAgICBpZiAoZGVjb2RlKSB7XG4gICAgICAgIGF1dGggPSBkZWNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgfVxuICAgIHRoaXMuYXV0aCA9IGF1dGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVBvcnQgPSBmdW5jdGlvbiBVcmwkX3BhcnNlUG9ydChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICAvL0ludGVybmFsIGZvcm1hdCBpcyBpbnRlZ2VyIGZvciBtb3JlIGVmZmljaWVudCBwYXJzaW5nXG4gICAgLy9hbmQgZm9yIGVmZmljaWVudCB0cmltbWluZyBvZiBsZWFkaW5nIHplcm9zXG4gICAgdmFyIHBvcnQgPSAwO1xuICAgIC8vRGlzdGluZ3Vpc2ggYmV0d2VlbiA6MCBhbmQgOiAobm8gcG9ydCBudW1iZXIgYXQgYWxsKVxuICAgIHZhciBoYWRDaGFycyA9IGZhbHNlO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmICgweDMwIC8qJzAnKi8gPD0gY2ggJiYgY2ggPD0gMHgzOSAvKic5JyovKSB7XG4gICAgICAgICAgICBwb3J0ID0gKDEwICogcG9ydCkgKyAoY2ggLSAweDMwIC8qJzAnKi8pO1xuICAgICAgICAgICAgaGFkQ2hhcnMgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgYnJlYWs7XG5cbiAgICB9XG4gICAgaWYgKHBvcnQgPT09IDAgJiYgIWhhZENoYXJzKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIHRoaXMuX3BvcnQgPSBwb3J0O1xuICAgIHJldHVybiBpIC0gc3RhcnQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUhvc3QgPVxuZnVuY3Rpb24gVXJsJF9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICAgIHZhciBob3N0RW5kaW5nQ2hhcmFjdGVycyA9IHRoaXMuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzO1xuICAgIGlmIChzdHIuY2hhckNvZGVBdChzdGFydCkgPT09IDB4MkYgLyonLycqLyAmJlxuICAgICAgICBzdHIuY2hhckNvZGVBdChzdGFydCArIDEpID09PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcblxuICAgICAgICAvL1RoZSBzdHJpbmcgc3RhcnRzIHdpdGggLy9cbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSB7XG4gICAgICAgICAgICAvL1RoZSBzdHJpbmcgaXMganVzdCBcIi8vXCJcbiAgICAgICAgICAgIGlmIChlbmQgPCAyKSByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAvL0lmIHNsYXNoZXMgZG8gbm90IGRlbm90ZSBob3N0IGFuZCB0aGVyZSBpcyBubyBhdXRoLFxuICAgICAgICAgICAgLy90aGVyZSBpcyBubyBob3N0IHdoZW4gdGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICAgICAgdmFyIGhhc0F1dGggPVxuICAgICAgICAgICAgICAgIGNvbnRhaW5zQ2hhcmFjdGVyKHN0ciwgMHg0MCAvKidAJyovLCAyLCBob3N0RW5kaW5nQ2hhcmFjdGVycyk7XG4gICAgICAgICAgICBpZiAoIWhhc0F1dGggJiYgIXNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGVyZSBpcyBhIGhvc3QgdGhhdCBzdGFydHMgYWZ0ZXIgdGhlIC8vXG4gICAgICAgIHN0YXJ0ICs9IDI7XG4gICAgfVxuICAgIC8vSWYgdGhlcmUgaXMgbm8gc2xhc2hlcywgdGhlcmUgaXMgbm8gaG9zdG5hbWUgaWZcbiAgICAvLzEuIHRoZXJlIHdhcyBubyBwcm90b2NvbCBhdCBhbGxcbiAgICBlbHNlIGlmICghdGhpcy5fcHJvdG9jb2wgfHxcbiAgICAgICAgLy8yLiB0aGVyZSB3YXMgYSBwcm90b2NvbCB0aGF0IHJlcXVpcmVzIHNsYXNoZXNcbiAgICAgICAgLy9lLmcuIGluICdodHRwOmFzZCcgJ2FzZCcgaXMgbm90IGEgaG9zdG5hbWVcbiAgICAgICAgc2xhc2hQcm90b2NvbHNbdGhpcy5fcHJvdG9jb2xdXG4gICAgKSB7XG4gICAgICAgIHJldHVybiBzdGFydDtcbiAgICB9XG5cbiAgICB2YXIgZG9Mb3dlckNhc2UgPSBmYWxzZTtcbiAgICB2YXIgaWRuYSA9IGZhbHNlO1xuICAgIHZhciBob3N0TmFtZVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIGhvc3ROYW1lRW5kID0gZW5kO1xuICAgIHZhciBsYXN0Q2ggPSAtMTtcbiAgICB2YXIgcG9ydExlbmd0aCA9IDA7XG4gICAgdmFyIGNoYXJzQWZ0ZXJEb3QgPSAwO1xuICAgIHZhciBhdXRoTmVlZHNEZWNvZGluZyA9IGZhbHNlO1xuXG4gICAgdmFyIGogPSAtMTtcblxuICAgIC8vRmluZCB0aGUgbGFzdCBvY2N1cnJlbmNlIG9mIGFuIEAtc2lnbiB1bnRpbCBob3N0ZW5kaW5nIGNoYXJhY3RlciBpcyBtZXRcbiAgICAvL2Fsc28gbWFyayBpZiBkZWNvZGluZyBpcyBuZWVkZWQgZm9yIHRoZSBhdXRoIHBvcnRpb25cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDQwIC8qJ0AnKi8pIHtcbiAgICAgICAgICAgIGogPSBpO1xuICAgICAgICB9XG4gICAgICAgIC8vVGhpcyBjaGVjayBpcyB2ZXJ5LCB2ZXJ5IGNoZWFwLiBVbm5lZWRlZCBkZWNvZGVVUklDb21wb25lbnQgaXMgdmVyeVxuICAgICAgICAvL3ZlcnkgZXhwZW5zaXZlXG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDI1IC8qJyUnKi8pIHtcbiAgICAgICAgICAgIGF1dGhOZWVkc0RlY29kaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy9ALXNpZ24gd2FzIGZvdW5kIGF0IGluZGV4IGosIGV2ZXJ5dGhpbmcgdG8gdGhlIGxlZnQgZnJvbSBpdFxuICAgIC8vaXMgYXV0aCBwYXJ0XG4gICAgaWYgKGogPiAtMSkge1xuICAgICAgICB0aGlzLl9wYXJzZUF1dGgoc3RyLCBzdGFydCwgaiAtIDEsIGF1dGhOZWVkc0RlY29kaW5nKTtcbiAgICAgICAgLy9ob3N0bmFtZSBzdGFydHMgYWZ0ZXIgdGhlIGxhc3QgQC1zaWduXG4gICAgICAgIHN0YXJ0ID0gaG9zdE5hbWVTdGFydCA9IGogKyAxO1xuICAgIH1cblxuICAgIC8vSG9zdCBuYW1lIGlzIHN0YXJ0aW5nIHdpdGggYSBbXG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHg1QiAvKidbJyovKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBzdGFydCArIDE7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgICAgICAvL0Fzc3VtZSB2YWxpZCBJUDYgaXMgYmV0d2VlbiB0aGUgYnJhY2tldHNcbiAgICAgICAgICAgIGlmIChjaCA9PT0gMHg1RCAvKiddJyovKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0ci5jaGFyQ29kZUF0KGkgKyAxKSA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICAgICAgICAgIHBvcnRMZW5ndGggPSB0aGlzLl9wYXJzZVBvcnQoc3RyLCBpICsgMiwgZW5kKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBob3N0bmFtZSA9IHN0ci5zbGljZShzdGFydCArIDEsIGkpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICAgICAgICAgIHRoaXMuaG9zdCA9IHRoaXMuX3BvcnQgPiAwXG4gICAgICAgICAgICAgICAgICAgID8gXCJbXCIgKyBob3N0bmFtZSArIFwiXTpcIiArIHRoaXMuX3BvcnRcbiAgICAgICAgICAgICAgICAgICAgOiBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgICAgICAgICAgIHJldHVybiBpICsgcG9ydExlbmd0aCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9FbXB0eSBob3N0bmFtZSwgWyBzdGFydHMgYSBwYXRoXG4gICAgICAgIHJldHVybiBzdGFydDtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgaWYgKGNoYXJzQWZ0ZXJEb3QgPiA2Mikge1xuICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAxLCBlbmQpICsgMTtcbiAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA8IDB4NjEgLyonYScqLykge1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDJFIC8qJy4nKi8pIHtcbiAgICAgICAgICAgICAgICAvL05vZGUuanMgaWdub3JlcyB0aGlzIGVycm9yXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICBpZiAobGFzdENoID09PSBET1QgfHwgbGFzdENoID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNoYXJzQWZ0ZXJEb3QgPSAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKDB4NDEgLyonQScqLyA8PSBjaCAmJiBjaCA8PSAweDVBIC8qJ1onKi8pIHtcbiAgICAgICAgICAgICAgICBkb0xvd2VyQ2FzZSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICghKGNoID09PSAweDJEIC8qJy0nKi8gfHwgY2ggPT09IDB4NUYgLyonXycqLyB8fFxuICAgICAgICAgICAgICAgICgweDMwIC8qJzAnKi8gPD0gY2ggJiYgY2ggPD0gMHgzOSAvKic5JyovKSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaG9zdEVuZGluZ0NoYXJhY3RlcnNbY2hdID09PSAwICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX25vUHJlcGVuZFNsYXNoSG9zdEVuZGVyc1tjaF0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA+PSAweDdCIC8qJ3snKi8pIHtcbiAgICAgICAgICAgIGlmIChjaCA8PSAweDdFIC8qJ34nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWRuYSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdENoID0gY2g7XG4gICAgICAgIGNoYXJzQWZ0ZXJEb3QrKztcbiAgICB9XG5cbiAgICAvL05vZGUuanMgaWdub3JlcyB0aGlzIGVycm9yXG4gICAgLypcbiAgICBpZiAobGFzdENoID09PSBET1QpIHtcbiAgICAgICAgaG9zdE5hbWVFbmQtLTtcbiAgICB9XG4gICAgKi9cblxuICAgIGlmIChob3N0TmFtZUVuZCArIDEgIT09IHN0YXJ0ICYmXG4gICAgICAgIGhvc3ROYW1lRW5kIC0gaG9zdE5hbWVTdGFydCA8PSAyNTYpIHtcbiAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKGhvc3ROYW1lU3RhcnQsIGhvc3ROYW1lRW5kICsgMSk7XG4gICAgICAgIGlmIChkb0xvd2VyQ2FzZSkgaG9zdG5hbWUgPSBob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAoaWRuYSkgaG9zdG5hbWUgPSB0aGlzLl9ob3N0SWRuYShob3N0bmFtZSk7XG4gICAgICAgIHRoaXMuaG9zdG5hbWUgPSBob3N0bmFtZTtcbiAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDAgPyBob3N0bmFtZSArIFwiOlwiICsgdGhpcy5fcG9ydCA6IGhvc3RuYW1lO1xuICAgIH1cblxuICAgIHJldHVybiBob3N0TmFtZUVuZCArIDEgKyBwb3J0TGVuZ3RoO1xuXG59O1xuXG5VcmwucHJvdG90eXBlLl9jb3B5UHJvcHNUbyA9IGZ1bmN0aW9uIFVybCRfY29weVByb3BzVG8oaW5wdXQsIG5vUHJvdG9jb2wpIHtcbiAgICBpZiAoIW5vUHJvdG9jb2wpIHtcbiAgICAgICAgaW5wdXQuX3Byb3RvY29sID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgfVxuICAgIGlucHV0Ll9ocmVmID0gdGhpcy5faHJlZjtcbiAgICBpbnB1dC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgaW5wdXQuX3ByZXBlbmRTbGFzaCA9IHRoaXMuX3ByZXBlbmRTbGFzaDtcbiAgICBpbnB1dC5hdXRoID0gdGhpcy5hdXRoO1xuICAgIGlucHV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgaW5wdXQuaG9zdCA9IHRoaXMuaG9zdDtcbiAgICBpbnB1dC5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG4gICAgaW5wdXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICBpbnB1dC5zZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICBpbnB1dC5wYXRobmFtZSA9IHRoaXMucGF0aG5hbWU7XG59O1xuXG5VcmwucHJvdG90eXBlLl9jbG9uZSA9IGZ1bmN0aW9uIFVybCRfY2xvbmUoKSB7XG4gICAgdmFyIHJldCA9IG5ldyBVcmwoKTtcbiAgICByZXQuX3Byb3RvY29sID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgcmV0Ll9ocmVmID0gdGhpcy5faHJlZjtcbiAgICByZXQuX3BvcnQgPSB0aGlzLl9wb3J0O1xuICAgIHJldC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIHJldC5hdXRoID0gdGhpcy5hdXRoO1xuICAgIHJldC5zbGFzaGVzID0gdGhpcy5zbGFzaGVzO1xuICAgIHJldC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIHJldC5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG4gICAgcmV0Lmhhc2ggPSB0aGlzLmhhc2g7XG4gICAgcmV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIHJldC5wYXRobmFtZSA9IHRoaXMucGF0aG5hbWU7XG4gICAgcmV0dXJuIHJldDtcbn07XG5cblVybC5wcm90b3R5cGUuX2dldENvbXBvbmVudEVzY2FwZWQgPVxuZnVuY3Rpb24gVXJsJF9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBjdXIgPSBzdGFydDtcbiAgICB2YXIgaSA9IHN0YXJ0O1xuICAgIHZhciByZXQgPSBcIlwiO1xuICAgIHZhciBhdXRvRXNjYXBlTWFwID0gdGhpcy5fYXV0b0VzY2FwZU1hcDtcbiAgICBmb3IgKDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgICAgdmFyIGVzY2FwZWQgPSBhdXRvRXNjYXBlTWFwW2NoXTtcblxuICAgICAgICBpZiAoZXNjYXBlZCAhPT0gXCJcIikge1xuICAgICAgICAgICAgaWYgKGN1ciA8IGkpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICAgICAgICAgIHJldCArPSBlc2NhcGVkO1xuICAgICAgICAgICAgY3VyID0gaSArIDE7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGN1ciA8IGkgKyAxKSByZXQgKz0gc3RyLnNsaWNlKGN1ciwgaSk7XG4gICAgcmV0dXJuIHJldDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUGF0aCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlUGF0aChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgcGF0aFN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHBhdGhFbmQgPSBlbmQ7XG4gICAgdmFyIGVzY2FwZSA9IGZhbHNlO1xuICAgIHZhciBhdXRvRXNjYXBlQ2hhcmFjdGVycyA9IHRoaXMuX2F1dG9Fc2NhcGVDaGFyYWN0ZXJzO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHBhdGhFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlUXVlcnkoc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWVzY2FwZSAmJiBhdXRvRXNjYXBlQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocGF0aFN0YXJ0ID4gcGF0aEVuZCkge1xuICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgcGF0aDtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHBhdGggPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcGF0aFN0YXJ0LCBwYXRoRW5kKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHBhdGggPSBzdHIuc2xpY2UocGF0aFN0YXJ0LCBwYXRoRW5kICsgMSk7XG4gICAgfVxuICAgIHRoaXMucGF0aG5hbWUgPSB0aGlzLl9wcmVwZW5kU2xhc2ggPyBcIi9cIiArIHBhdGggOiBwYXRoO1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VRdWVyeSA9IGZ1bmN0aW9uIFVybCRfcGFyc2VRdWVyeShzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgcXVlcnlTdGFydCA9IHN0YXJ0O1xuICAgIHZhciBxdWVyeUVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDIzIC8qJyMnKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlSGFzaChzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBxdWVyeUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWVzY2FwZSAmJiBhdXRvRXNjYXBlQ2hhcmFjdGVyc1tjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocXVlcnlTdGFydCA+IHF1ZXJ5RW5kKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gXCJcIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBxdWVyeTtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHF1ZXJ5ID0gdGhpcy5fZ2V0Q29tcG9uZW50RXNjYXBlZChzdHIsIHF1ZXJ5U3RhcnQsIHF1ZXJ5RW5kKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0gc3RyLnNsaWNlKHF1ZXJ5U3RhcnQsIHF1ZXJ5RW5kICsgMSk7XG4gICAgfVxuICAgIHRoaXMuc2VhcmNoID0gcXVlcnk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZUhhc2ggPSBmdW5jdGlvbiBVcmwkX3BhcnNlSGFzaChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICBpZiAoc3RhcnQgPiBlbmQpIHtcbiAgICAgICAgdGhpcy5oYXNoID0gXCJcIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmhhc2ggPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgc3RhcnQsIGVuZCk7XG59O1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwb3J0XCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fcG9ydCA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gKFwiXCIgKyB0aGlzLl9wb3J0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodiA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLl9wb3J0ID0gLTE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9wb3J0ID0gcGFyc2VJbnQodiwgMTApO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInF1ZXJ5XCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcXVlcnkgPSB0aGlzLl9xdWVyeTtcbiAgICAgICAgaWYgKHF1ZXJ5ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBxdWVyeTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2g7XG5cbiAgICAgICAgaWYgKHNlYXJjaCkge1xuICAgICAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgICAgICBzZWFyY2ggPSBzZWFyY2guc2xpY2UoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2VhcmNoICE9PSBcIlwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcXVlcnkgPSBzZWFyY2g7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlYXJjaDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHRoaXMuX3F1ZXJ5ID0gdjtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicGF0aFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHAgPSB0aGlzLnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgICAgIHZhciBzID0gdGhpcy5zZWFyY2ggfHwgXCJcIjtcbiAgICAgICAgaWYgKHAgfHwgcykge1xuICAgICAgICAgICAgcmV0dXJuIHAgKyBzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAocCA9PSBudWxsICYmIHMpID8gKFwiL1wiICsgcykgOiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbigpIHt9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicHJvdG9jb2xcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBwcm90byA9IHRoaXMuX3Byb3RvY29sO1xuICAgICAgICByZXR1cm4gcHJvdG8gPyBwcm90byArIFwiOlwiIDogcHJvdG87XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB2YXIgZW5kID0gdi5sZW5ndGggLSAxO1xuICAgICAgICAgICAgaWYgKHYuY2hhckNvZGVBdChlbmQpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHYuc2xpY2UoMCwgZW5kKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJocmVmXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgaHJlZiA9IHRoaXMuX2hyZWY7XG4gICAgICAgIGlmICghaHJlZikge1xuICAgICAgICAgICAgaHJlZiA9IHRoaXMuX2hyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBocmVmO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIHRoaXMuX2hyZWYgPSB2O1xuICAgIH1cbn0pO1xuXG5VcmwucGFyc2UgPSBmdW5jdGlvbiBVcmwkUGFyc2Uoc3RyLCBwYXJzZVF1ZXJ5U3RyaW5nLCBob3N0RGVub3Rlc1NsYXNoKSB7XG4gICAgaWYgKHN0ciBpbnN0YW5jZW9mIFVybCkgcmV0dXJuIHN0cjtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5wYXJzZShzdHIsICEhcGFyc2VRdWVyeVN0cmluZywgISFob3N0RGVub3Rlc1NsYXNoKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRGb3JtYXQob2JqKSB7XG4gICAgaWYgKHR5cGVvZiBvYmogPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgb2JqID0gVXJsLnBhcnNlKG9iaik7XG4gICAgfVxuICAgIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHtcbiAgICAgICAgcmV0dXJuIFVybC5wcm90b3R5cGUuZm9ybWF0LmNhbGwob2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iai5mb3JtYXQoKTtcbn07XG5cblVybC5yZXNvbHZlID0gZnVuY3Rpb24gVXJsJFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIHJldHVybiBVcmwucGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59O1xuXG5VcmwucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uIFVybCRSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICAgIHJldHVybiBVcmwucGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59O1xuXG5mdW5jdGlvbiBfZXNjYXBlUGF0aChwYXRobmFtZSkge1xuICAgIHJldHVybiBwYXRobmFtZS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBfZXNjYXBlU2VhcmNoKHNlYXJjaCkge1xuICAgIHJldHVybiBzZWFyY2gucmVwbGFjZSgvIy9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KG1hdGNoKTtcbiAgICB9KTtcbn1cblxuLy9TZWFyY2ggYGNoYXIxYCAoaW50ZWdlciBjb2RlIGZvciBhIGNoYXJhY3RlcikgaW4gYHN0cmluZ2Bcbi8vc3RhcnRpbmcgZnJvbSBgZnJvbUluZGV4YCBhbmQgZW5kaW5nIGF0IGBzdHJpbmcubGVuZ3RoIC0gMWBcbi8vb3Igd2hlbiBhIHN0b3AgY2hhcmFjdGVyIGlzIGZvdW5kXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcihzdHJpbmcsIGNoYXIxLCBmcm9tSW5kZXgsIHN0b3BDaGFyYWN0ZXJUYWJsZSkge1xuICAgIHZhciBsZW4gPSBzdHJpbmcubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSBmcm9tSW5kZXg7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHJpbmcuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IGNoYXIxKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdG9wQ2hhcmFjdGVyVGFibGVbY2hdID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vL1NlZSBpZiBgY2hhcjFgIG9yIGBjaGFyMmAgKGludGVnZXIgY29kZXMgZm9yIGNoYXJhY3RlcnMpXG4vL2lzIGNvbnRhaW5lZCBpbiBgc3RyaW5nYFxuZnVuY3Rpb24gY29udGFpbnNDaGFyYWN0ZXIyKHN0cmluZywgY2hhcjEsIGNoYXIyKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHJpbmcuY2hhckNvZGVBdChpKTtcbiAgICAgICAgaWYgKGNoID09PSBjaGFyMSB8fCBjaCA9PT0gY2hhcjIpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vTWFrZXMgYW4gYXJyYXkgb2YgMTI4IHVpbnQ4J3Mgd2hpY2ggcmVwcmVzZW50IGJvb2xlYW4gdmFsdWVzLlxuLy9TcGVjIGlzIGFuIGFycmF5IG9mIGFzY2lpIGNvZGUgcG9pbnRzIG9yIGFzY2lpIGNvZGUgcG9pbnQgcmFuZ2VzXG4vL3JhbmdlcyBhcmUgZXhwcmVzc2VkIGFzIFtzdGFydCwgZW5kXVxuXG4vL0NyZWF0ZSBhIHRhYmxlIHdpdGggdGhlIGNoYXJhY3RlcnMgMHgzMC0weDM5IChkZWNpbWFscyAnMCcgLSAnOScpIGFuZFxuLy8weDdBIChsb3dlcmNhc2VsZXR0ZXIgJ3onKSBhcyBgdHJ1ZWA6XG4vL1xuLy92YXIgYSA9IG1ha2VBc2NpaVRhYmxlKFtbMHgzMCwgMHgzOV0sIDB4N0FdKTtcbi8vYVsweDMwXTsgLy8xXG4vL2FbMHgxNV07IC8vMFxuLy9hWzB4MzVdOyAvLzFcbmZ1bmN0aW9uIG1ha2VBc2NpaVRhYmxlKHNwZWMpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVpbnQ4QXJyYXkoMTI4KTtcbiAgICBzcGVjLmZvckVhY2goZnVuY3Rpb24oaXRlbSl7XG4gICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgcmV0W2l0ZW1dID0gMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBzdGFydCA9IGl0ZW1bMF07XG4gICAgICAgICAgICB2YXIgZW5kID0gaXRlbVsxXTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydDsgaiA8PSBlbmQ7ICsraikge1xuICAgICAgICAgICAgICAgIHJldFtqXSA9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiByZXQ7XG59XG5cblxudmFyIGF1dG9Fc2NhcGUgPSBbXCI8XCIsIFwiPlwiLCBcIlxcXCJcIiwgXCJgXCIsIFwiIFwiLCBcIlxcclwiLCBcIlxcblwiLFxuICAgIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLCBcIl5cIiwgXCJgXCIsIFwiJ1wiXTtcblxudmFyIGF1dG9Fc2NhcGVNYXAgPSBuZXcgQXJyYXkoMTI4KTtcblxuXG5cbmZvciAodmFyIGkgPSAwLCBsZW4gPSBhdXRvRXNjYXBlTWFwLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgYXV0b0VzY2FwZU1hcFtpXSA9IFwiXCI7XG59XG5cbmZvciAodmFyIGkgPSAwLCBsZW4gPSBhdXRvRXNjYXBlLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIGMgPSBhdXRvRXNjYXBlW2ldO1xuICAgIHZhciBlc2MgPSBlbmNvZGVVUklDb21wb25lbnQoYyk7XG4gICAgaWYgKGVzYyA9PT0gYykge1xuICAgICAgICBlc2MgPSBlc2NhcGUoYyk7XG4gICAgfVxuICAgIGF1dG9Fc2NhcGVNYXBbYy5jaGFyQ29kZUF0KDApXSA9IGVzYztcbn1cblxuXG52YXIgc2xhc2hQcm90b2NvbHMgPSBVcmwucHJvdG90eXBlLl9zbGFzaFByb3RvY29scyA9IHtcbiAgICBodHRwOiB0cnVlLFxuICAgIGh0dHBzOiB0cnVlLFxuICAgIGdvcGhlcjogdHJ1ZSxcbiAgICBmaWxlOiB0cnVlLFxuICAgIGZ0cDogdHJ1ZSxcblxuICAgIFwiaHR0cDpcIjogdHJ1ZSxcbiAgICBcImh0dHBzOlwiOiB0cnVlLFxuICAgIFwiZ29waGVyOlwiOiB0cnVlLFxuICAgIFwiZmlsZTpcIjogdHJ1ZSxcbiAgICBcImZ0cDpcIjogdHJ1ZVxufTtcblxuLy9PcHRpbWl6ZSBiYWNrIGZyb20gbm9ybWFsaXplZCBvYmplY3QgY2F1c2VkIGJ5IG5vbi1pZGVudGlmaWVyIGtleXNcbmZ1bmN0aW9uIGYoKXt9XG5mLnByb3RvdHlwZSA9IHNsYXNoUHJvdG9jb2xzO1xuXG5VcmwucHJvdG90eXBlLl9wcm90b2NvbENoYXJhY3RlcnMgPSBtYWtlQXNjaWlUYWJsZShbXG4gICAgWzB4NjEgLyonYScqLywgMHg3QSAvKid6JyovXSxcbiAgICBbMHg0MSAvKidBJyovLCAweDVBIC8qJ1onKi9dLFxuICAgIDB4MkUgLyonLicqLywgMHgyQiAvKicrJyovLCAweDJEIC8qJy0nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9ob3N0RW5kaW5nQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICAweDIzIC8qJyMnKi8sIDB4M0YgLyonPycqLywgMHgyRiAvKicvJyovXG5dKTtcblxuVXJsLnByb3RvdHlwZS5fYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSBtYWtlQXNjaWlUYWJsZShcbiAgICBhdXRvRXNjYXBlLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cbi8vSWYgdGhlc2UgY2hhcmFjdGVycyBlbmQgYSBob3N0IG5hbWUsIHRoZSBwYXRoIHdpbGwgbm90IGJlIHByZXBlbmRlZCBhIC9cblVybC5wcm90b3R5cGUuX25vUHJlcGVuZFNsYXNoSG9zdEVuZGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIFtcbiAgICAgICAgXCI8XCIsIFwiPlwiLCBcIidcIiwgXCJgXCIsIFwiIFwiLCBcIlxcclwiLFxuICAgICAgICBcIlxcblwiLCBcIlxcdFwiLCBcIntcIiwgXCJ9XCIsIFwifFwiLCBcIlxcXFxcIixcbiAgICAgICAgXCJeXCIsIFwiYFwiLCBcIlxcXCJcIiwgXCIlXCIsIFwiO1wiXG4gICAgXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICByZXR1cm4gdi5jaGFyQ29kZUF0KDApO1xuICAgIH0pXG4pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlTWFwID0gYXV0b0VzY2FwZU1hcDtcblxubW9kdWxlLmV4cG9ydHMgPSBVcmw7XG5cblVybC5yZXBsYWNlID0gZnVuY3Rpb24gVXJsJFJlcGxhY2UoKSB7XG4gICAgcmVxdWlyZS5jYWNoZVtcInVybFwiXSA9IHtcbiAgICAgICAgZXhwb3J0czogVXJsXG4gICAgfTtcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5yb3V0ZXM9ZSgpfX0oZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbnZhciBsb2NhbFJvdXRlcyA9IFtdO1xuXG5cbi8qKlxuICogQ29udmVydCBwYXRoIHRvIHJvdXRlIG9iamVjdFxuICpcbiAqIEEgc3RyaW5nIG9yIFJlZ0V4cCBzaG91bGQgYmUgcGFzc2VkLFxuICogd2lsbCByZXR1cm4geyByZSwgc3JjLCBrZXlzfSBvYmpcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmcgLyBSZWdFeHB9IHBhdGhcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG52YXIgUm91dGUgPSBmdW5jdGlvbihwYXRoKXtcbiAgLy91c2luZyAnbmV3JyBpcyBvcHRpb25hbFxuXG4gIHZhciBzcmMsIHJlLCBrZXlzID0gW107XG5cbiAgaWYocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCl7XG4gICAgcmUgPSBwYXRoO1xuICAgIHNyYyA9IHBhdGgudG9TdHJpbmcoKTtcbiAgfWVsc2V7XG4gICAgcmUgPSBwYXRoVG9SZWdFeHAocGF0aCwga2V5cyk7XG4gICAgc3JjID0gcGF0aDtcbiAgfVxuXG4gIHJldHVybiB7XG4gIFx0IHJlOiByZSxcbiAgXHQgc3JjOiBwYXRoLnRvU3RyaW5nKCksXG4gIFx0IGtleXM6IGtleXNcbiAgfVxufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLFxuICogcmV0dXJuaW5nIGEgcmVndWxhciBleHByZXNzaW9uLlxuICpcbiAqIEFuIGVtcHR5IGFycmF5IHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aGljaCB3aWxsIGNvbnRhaW4gdGhlIHBsYWNlaG9sZGVyXG4gKiBrZXkgbmFtZXMuIEZvciBleGFtcGxlIFwiL3VzZXIvOmlkXCIgd2lsbFxuICogdGhlbiBjb250YWluIFtcImlkXCJdLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9IGtleXNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xudmFyIHBhdGhUb1JlZ0V4cCA9IGZ1bmN0aW9uIChwYXRoLCBrZXlzKSB7XG5cdHBhdGggPSBwYXRoXG5cdFx0LmNvbmNhdCgnLz8nKVxuXHRcdC5yZXBsYWNlKC9cXC9cXCgvZywgJyg/Oi8nKVxuXHRcdC5yZXBsYWNlKC8oXFwvKT8oXFwuKT86KFxcdyspKD86KFxcKC4qP1xcKSkpPyhcXD8pP3xcXCovZywgZnVuY3Rpb24oXywgc2xhc2gsIGZvcm1hdCwga2V5LCBjYXB0dXJlLCBvcHRpb25hbCl7XG5cdFx0XHRpZiAoXyA9PT0gXCIqXCIpe1xuXHRcdFx0XHRrZXlzLnB1c2godW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIF87XG5cdFx0XHR9XG5cblx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0c2xhc2ggPSBzbGFzaCB8fCAnJztcblx0XHRcdHJldHVybiAnJ1xuXHRcdFx0XHQrIChvcHRpb25hbCA/ICcnIDogc2xhc2gpXG5cdFx0XHRcdCsgJyg/Oidcblx0XHRcdFx0KyAob3B0aW9uYWwgPyBzbGFzaCA6ICcnKVxuXHRcdFx0XHQrIChmb3JtYXQgfHwgJycpICsgKGNhcHR1cmUgfHwgJyhbXi9dKz8pJykgKyAnKSdcblx0XHRcdFx0KyAob3B0aW9uYWwgfHwgJycpO1xuXHRcdH0pXG5cdFx0LnJlcGxhY2UoLyhbXFwvLl0pL2csICdcXFxcJDEnKVxuXHRcdC5yZXBsYWNlKC9cXCovZywgJyguKiknKTtcblx0cmV0dXJuIG5ldyBSZWdFeHAoJ14nICsgcGF0aCArICckJywgJ2knKTtcbn07XG5cbi8qKlxuICogQXR0ZW1wdCB0byBtYXRjaCB0aGUgZ2l2ZW4gcmVxdWVzdCB0b1xuICogb25lIG9mIHRoZSByb3V0ZXMuIFdoZW4gc3VjY2Vzc2Z1bFxuICogYSAge2ZuLCBwYXJhbXMsIHNwbGF0c30gb2JqIGlzIHJldHVybmVkXG4gKlxuICogQHBhcmFtICB7QXJyYXl9IHJvdXRlc1xuICogQHBhcmFtICB7U3RyaW5nfSB1cmlcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xudmFyIG1hdGNoID0gZnVuY3Rpb24gKHJvdXRlcywgdXJpLCBzdGFydEF0KSB7XG5cdHZhciBjYXB0dXJlcywgaSA9IHN0YXJ0QXQgfHwgMDtcblxuXHRmb3IgKHZhciBsZW4gPSByb3V0ZXMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcblx0XHR2YXIgcm91dGUgPSByb3V0ZXNbaV0sXG5cdFx0ICAgIHJlID0gcm91dGUucmUsXG5cdFx0ICAgIGtleXMgPSByb3V0ZS5rZXlzLFxuXHRcdCAgICBzcGxhdHMgPSBbXSxcblx0XHQgICAgcGFyYW1zID0ge307XG5cblx0XHRpZiAoY2FwdHVyZXMgPSB1cmkubWF0Y2gocmUpKSB7XG5cdFx0XHRmb3IgKHZhciBqID0gMSwgbGVuID0gY2FwdHVyZXMubGVuZ3RoOyBqIDwgbGVuOyArK2opIHtcblx0XHRcdFx0dmFyIGtleSA9IGtleXNbai0xXSxcblx0XHRcdFx0XHR2YWwgPSB0eXBlb2YgY2FwdHVyZXNbal0gPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHVuZXNjYXBlKGNhcHR1cmVzW2pdKVxuXHRcdFx0XHRcdFx0OiBjYXB0dXJlc1tqXTtcblx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdHBhcmFtc1trZXldID0gdmFsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNwbGF0cy5wdXNoKHZhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBhcmFtczogcGFyYW1zLFxuXHRcdFx0XHRzcGxhdHM6IHNwbGF0cyxcblx0XHRcdFx0cm91dGU6IHJvdXRlLnNyYyxcblx0XHRcdFx0bmV4dDogaSArIDFcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIERlZmF1bHQgXCJub3JtYWxcIiByb3V0ZXIgY29uc3RydWN0b3IuXG4gKiBhY2NlcHRzIHBhdGgsIGZuIHR1cGxlcyB2aWEgYWRkUm91dGVcbiAqIHJldHVybnMge2ZuLCBwYXJhbXMsIHNwbGF0cywgcm91dGV9XG4gKiAgdmlhIG1hdGNoXG4gKlxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZXIgPSBmdW5jdGlvbigpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG4gIHJldHVybiB7XG4gICAgcm91dGVzOiBbXSxcbiAgICByb3V0ZU1hcCA6IHt9LFxuICAgIGFkZFJvdXRlOiBmdW5jdGlvbihwYXRoLCBmbil7XG4gICAgICBpZiAoIXBhdGgpIHRocm93IG5ldyBFcnJvcignIHJvdXRlIHJlcXVpcmVzIGEgcGF0aCcpO1xuICAgICAgaWYgKCFmbikgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgJyArIHBhdGgudG9TdHJpbmcoKSArICcgcmVxdWlyZXMgYSBjYWxsYmFjaycpO1xuXG4gICAgICB2YXIgcm91dGUgPSBSb3V0ZShwYXRoKTtcbiAgICAgIHJvdXRlLmZuID0gZm47XG5cbiAgICAgIHRoaXMucm91dGVzLnB1c2gocm91dGUpO1xuICAgICAgdGhpcy5yb3V0ZU1hcFtwYXRoXSA9IGZuO1xuICAgIH0sXG5cbiAgICBtYXRjaDogZnVuY3Rpb24ocGF0aG5hbWUsIHN0YXJ0QXQpe1xuICAgICAgdmFyIHJvdXRlID0gbWF0Y2godGhpcy5yb3V0ZXMsIHBhdGhuYW1lLCBzdGFydEF0KTtcbiAgICAgIGlmKHJvdXRlKXtcbiAgICAgICAgcm91dGUuZm4gPSB0aGlzLnJvdXRlTWFwW3JvdXRlLnJvdXRlXTtcbiAgICAgICAgcm91dGUubmV4dCA9IHRoaXMubWF0Y2guYmluZCh0aGlzLCBwYXRobmFtZSwgcm91dGUubmV4dClcbiAgICAgIH1cbiAgICAgIHJldHVybiByb3V0ZTtcbiAgICB9XG4gIH1cbn07XG5cblJvdXRlci5Sb3V0ZSA9IFJvdXRlXG5Sb3V0ZXIucGF0aFRvUmVnRXhwID0gcGF0aFRvUmVnRXhwXG5Sb3V0ZXIubWF0Y2ggPSBtYXRjaFxuLy8gYmFjayBjb21wYXRcblJvdXRlci5Sb3V0ZXIgPSBSb3V0ZXJcblxubW9kdWxlLmV4cG9ydHMgPSBSb3V0ZXJcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciB3aW5kb3cgPSByZXF1aXJlKFwiZ2xvYmFsL3dpbmRvd1wiKVxudmFyIG9uY2UgPSByZXF1aXJlKFwib25jZVwiKVxudmFyIHBhcnNlSGVhZGVycyA9IHJlcXVpcmUoJ3BhcnNlLWhlYWRlcnMnKVxuXG52YXIgbWVzc2FnZXMgPSB7XG4gICAgXCIwXCI6IFwiSW50ZXJuYWwgWE1MSHR0cFJlcXVlc3QgRXJyb3JcIixcbiAgICBcIjRcIjogXCI0eHggQ2xpZW50IEVycm9yXCIsXG4gICAgXCI1XCI6IFwiNXh4IFNlcnZlciBFcnJvclwiXG59XG5cbnZhciBYSFIgPSB3aW5kb3cuWE1MSHR0cFJlcXVlc3QgfHwgbm9vcFxudmFyIFhEUiA9IFwid2l0aENyZWRlbnRpYWxzXCIgaW4gKG5ldyBYSFIoKSkgPyBYSFIgOiB3aW5kb3cuWERvbWFpblJlcXVlc3RcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVYSFJcblxuZnVuY3Rpb24gY3JlYXRlWEhSKG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7IHVyaTogb3B0aW9ucyB9XG4gICAgfVxuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICBjYWxsYmFjayA9IG9uY2UoY2FsbGJhY2spXG5cbiAgICB2YXIgeGhyID0gb3B0aW9ucy54aHIgfHwgbnVsbFxuXG4gICAgaWYgKCF4aHIpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuY29ycyB8fCBvcHRpb25zLnVzZVhEUikge1xuICAgICAgICAgICAgeGhyID0gbmV3IFhEUigpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgeGhyID0gbmV3IFhIUigpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdXJpID0geGhyLnVybCA9IG9wdGlvbnMudXJpIHx8IG9wdGlvbnMudXJsXG4gICAgdmFyIG1ldGhvZCA9IHhoci5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCBcIkdFVFwiXG4gICAgdmFyIGJvZHkgPSBvcHRpb25zLmJvZHkgfHwgb3B0aW9ucy5kYXRhXG4gICAgdmFyIGhlYWRlcnMgPSB4aHIuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fVxuICAgIHZhciBzeW5jID0gISFvcHRpb25zLnN5bmNcbiAgICB2YXIgaXNKc29uID0gZmFsc2VcbiAgICB2YXIga2V5XG4gICAgdmFyIGxvYWQgPSBvcHRpb25zLnJlc3BvbnNlID8gbG9hZFJlc3BvbnNlIDogbG9hZFhoclxuXG4gICAgaWYgKFwianNvblwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaXNKc29uID0gdHJ1ZVxuICAgICAgICBoZWFkZXJzW1wiQWNjZXB0XCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgaWYgKG1ldGhvZCAhPT0gXCJHRVRcIiAmJiBtZXRob2QgIT09IFwiSEVBRFwiKSB7XG4gICAgICAgICAgICBoZWFkZXJzW1wiQ29udGVudC1UeXBlXCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgICAgIGJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gcmVhZHlzdGF0ZWNoYW5nZVxuICAgIHhoci5vbmxvYWQgPSBsb2FkXG4gICAgeGhyLm9uZXJyb3IgPSBlcnJvclxuICAgIC8vIElFOSBtdXN0IGhhdmUgb25wcm9ncmVzcyBiZSBzZXQgdG8gYSB1bmlxdWUgZnVuY3Rpb24uXG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElFIG11c3QgZGllXG4gICAgfVxuICAgIC8vIGhhdGUgSUVcbiAgICB4aHIub250aW1lb3V0ID0gbm9vcFxuICAgIHhoci5vcGVuKG1ldGhvZCwgdXJpLCAhc3luYylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIGlmIChvcHRpb25zLndpdGhDcmVkZW50aWFscyB8fCAob3B0aW9ucy5jb3JzICYmIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzICE9PSBmYWxzZSkpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG5cbiAgICAvLyBDYW5ub3Qgc2V0IHRpbWVvdXQgd2l0aCBzeW5jIHJlcXVlc3RcbiAgICBpZiAoIXN5bmMpIHtcbiAgICAgICAgeGhyLnRpbWVvdXQgPSBcInRpbWVvdXRcIiBpbiBvcHRpb25zID8gb3B0aW9ucy50aW1lb3V0IDogNTAwMFxuICAgIH1cblxuICAgIGlmICh4aHIuc2V0UmVxdWVzdEhlYWRlcikge1xuICAgICAgICBmb3Ioa2V5IGluIGhlYWRlcnMpe1xuICAgICAgICAgICAgaWYoaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkhlYWRlcnMgY2Fubm90IGJlIHNldCBvbiBhbiBYRG9tYWluUmVxdWVzdCBvYmplY3RcIilcbiAgICB9XG5cbiAgICBpZiAoXCJyZXNwb25zZVR5cGVcIiBpbiBvcHRpb25zKSB7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSBvcHRpb25zLnJlc3BvbnNlVHlwZVxuICAgIH1cbiAgICBcbiAgICBpZiAoXCJiZWZvcmVTZW5kXCIgaW4gb3B0aW9ucyAmJiBcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuYmVmb3JlU2VuZCA9PT0gXCJmdW5jdGlvblwiXG4gICAgKSB7XG4gICAgICAgIG9wdGlvbnMuYmVmb3JlU2VuZCh4aHIpXG4gICAgfVxuXG4gICAgeGhyLnNlbmQoYm9keSlcblxuICAgIHJldHVybiB4aHJcblxuICAgIGZ1bmN0aW9uIHJlYWR5c3RhdGVjaGFuZ2UoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgbG9hZCgpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRCb2R5KCkge1xuICAgICAgICAvLyBDaHJvbWUgd2l0aCByZXF1ZXN0VHlwZT1ibG9iIHRocm93cyBlcnJvcnMgYXJyb3VuZCB3aGVuIGV2ZW4gdGVzdGluZyBhY2Nlc3MgdG8gcmVzcG9uc2VUZXh0XG4gICAgICAgIHZhciBib2R5ID0gbnVsbFxuXG4gICAgICAgIGlmICh4aHIucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIGlmICh4aHIucmVzcG9uc2VUeXBlID09PSAndGV4dCcgfHwgIXhoci5yZXNwb25zZVR5cGUpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VUZXh0IHx8IHhoci5yZXNwb25zZVhNTFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzSnNvbikge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBib2R5ID0gSlNPTi5wYXJzZShib2R5KVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBib2R5XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U3RhdHVzQ29kZSgpIHtcbiAgICAgICAgcmV0dXJuIHhoci5zdGF0dXMgPT09IDEyMjMgPyAyMDQgOiB4aHIuc3RhdHVzXG4gICAgfVxuXG4gICAgLy8gaWYgd2UncmUgZ2V0dGluZyBhIG5vbmUtb2sgc3RhdHVzQ29kZSwgYnVpbGQgJiByZXR1cm4gYW4gZXJyb3JcbiAgICBmdW5jdGlvbiBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cykge1xuICAgICAgICB2YXIgZXJyb3IgPSBudWxsXG4gICAgICAgIGlmIChzdGF0dXMgPT09IDAgfHwgKHN0YXR1cyA+PSA0MDAgJiYgc3RhdHVzIDwgNjAwKSkge1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSAodHlwZW9mIGJvZHkgPT09IFwic3RyaW5nXCIgPyBib2R5IDogZmFsc2UpIHx8XG4gICAgICAgICAgICAgICAgbWVzc2FnZXNbU3RyaW5nKHN0YXR1cykuY2hhckF0KDApXVxuICAgICAgICAgICAgZXJyb3IgPSBuZXcgRXJyb3IobWVzc2FnZSlcbiAgICAgICAgICAgIGVycm9yLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlcnJvclxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSAmIHByb2Nlc3MgdGhlIHJlc3BvbnNlIGluIGEgc3BlY2lhbCByZXNwb25zZSBvYmplY3RcbiAgICBmdW5jdGlvbiBsb2FkUmVzcG9uc2UoKSB7XG4gICAgICAgIHZhciBzdGF0dXMgPSBnZXRTdGF0dXNDb2RlKClcbiAgICAgICAgdmFyIGVycm9yID0gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpXG4gICAgICAgIHZhciByZXNwb25zZSA9IHtcbiAgICAgICAgICAgIGJvZHk6IGdldEJvZHkoKSxcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IHN0YXR1cyxcbiAgICAgICAgICAgIHN0YXR1c1RleHQ6IHhoci5zdGF0dXNUZXh0LFxuICAgICAgICAgICAgcmF3OiB4aHJcbiAgICAgICAgfVxuICAgICAgICBpZih4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKXsgLy9yZW1lbWJlciB4aHIgY2FuIGluIGZhY3QgYmUgWERSIGZvciBDT1JTIGluIElFXG4gICAgICAgICAgICByZXNwb25zZS5oZWFkZXJzID0gcGFyc2VIZWFkZXJzKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIHJlc3BvbnNlLCByZXNwb25zZS5ib2R5KVxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSBhbmQgYWRkIHNvbWUgcmVzcG9uc2UgcHJvcGVydGllcyB0byB0aGUgc291cmNlIHhoclxuICAgIC8vIGFuZCB0aGVuIHJlc3BvbmQgd2l0aCB0aGF0XG4gICAgZnVuY3Rpb24gbG9hZFhocigpIHtcbiAgICAgICAgdmFyIHN0YXR1cyA9IGdldFN0YXR1c0NvZGUoKVxuICAgICAgICB2YXIgZXJyb3IgPSBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cylcblxuICAgICAgICB4aHIuc3RhdHVzID0geGhyLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgeGhyLmJvZHkgPSBnZXRCb2R5KClcbiAgICAgICAgeGhyLmhlYWRlcnMgPSBwYXJzZUhlYWRlcnMoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKVxuXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCB4aHIsIHhoci5ib2R5KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKGV2dCkge1xuICAgICAgICBjYWxsYmFjayhldnQsIHhocilcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHNlbGY7XG59IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0ge307XG59XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwibW9kdWxlLmV4cG9ydHMgPSBvbmNlXG5cbm9uY2UucHJvdG8gPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bmN0aW9uLnByb3RvdHlwZSwgJ29uY2UnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBvbmNlKHRoaXMpXG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWVcbiAgfSlcbn0pXG5cbmZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gIHZhciBjYWxsZWQgPSBmYWxzZVxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGlmIChjYWxsZWQpIHJldHVyblxuICAgIGNhbGxlZCA9IHRydWVcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICB9XG59XG4iLCJ2YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2lzLWZ1bmN0aW9uJylcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHlcblxuZnVuY3Rpb24gZm9yRWFjaChsaXN0LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXNGdW5jdGlvbihpdGVyYXRvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignaXRlcmF0b3IgbXVzdCBiZSBhIGZ1bmN0aW9uJylcbiAgICB9XG5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgY29udGV4dCA9IHRoaXNcbiAgICB9XG4gICAgXG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobGlzdCkgPT09ICdbb2JqZWN0IEFycmF5XScpXG4gICAgICAgIGZvckVhY2hBcnJheShsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlIGlmICh0eXBlb2YgbGlzdCA9PT0gJ3N0cmluZycpXG4gICAgICAgIGZvckVhY2hTdHJpbmcobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG4gICAgZWxzZVxuICAgICAgICBmb3JFYWNoT2JqZWN0KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoQXJyYXkoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5LCBpKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVtpXSwgaSwgYXJyYXkpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2hTdHJpbmcoc3RyaW5nLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgLy8gbm8gc3VjaCB0aGluZyBhcyBhIHNwYXJzZSBzdHJpbmcuXG4gICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgc3RyaW5nLmNoYXJBdChpKSwgaSwgc3RyaW5nKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaE9iamVjdChvYmplY3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgayBpbiBvYmplY3QpIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmplY3Rba10sIGssIG9iamVjdClcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gaXNGdW5jdGlvblxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24gKGZuKSB7XG4gIHZhciBzdHJpbmcgPSB0b1N0cmluZy5jYWxsKGZuKVxuICByZXR1cm4gc3RyaW5nID09PSAnW29iamVjdCBGdW5jdGlvbl0nIHx8XG4gICAgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJyAmJiBzdHJpbmcgIT09ICdbb2JqZWN0IFJlZ0V4cF0nKSB8fFxuICAgICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAvLyBJRTggYW5kIGJlbG93XG4gICAgIChmbiA9PT0gd2luZG93LnNldFRpbWVvdXQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuYWxlcnQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuY29uZmlybSB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5wcm9tcHQpKVxufTtcbiIsIlxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gdHJpbTtcblxuZnVuY3Rpb24gdHJpbShzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqfFxccyokL2csICcnKTtcbn1cblxuZXhwb3J0cy5sZWZ0ID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzKi8sICcnKTtcbn07XG5cbmV4cG9ydHMucmlnaHQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccyokLywgJycpO1xufTtcbiIsInZhciB0cmltID0gcmVxdWlyZSgndHJpbScpXG4gICwgZm9yRWFjaCA9IHJlcXVpcmUoJ2Zvci1lYWNoJylcbiAgLCBpc0FycmF5ID0gZnVuY3Rpb24oYXJnKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFyZykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChoZWFkZXJzKSB7XG4gIGlmICghaGVhZGVycylcbiAgICByZXR1cm4ge31cblxuICB2YXIgcmVzdWx0ID0ge31cblxuICBmb3JFYWNoKFxuICAgICAgdHJpbShoZWFkZXJzKS5zcGxpdCgnXFxuJylcbiAgICAsIGZ1bmN0aW9uIChyb3cpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gcm93LmluZGV4T2YoJzonKVxuICAgICAgICAgICwga2V5ID0gdHJpbShyb3cuc2xpY2UoMCwgaW5kZXgpKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgLCB2YWx1ZSA9IHRyaW0ocm93LnNsaWNlKGluZGV4ICsgMSkpXG5cbiAgICAgICAgaWYgKHR5cGVvZihyZXN1bHRba2V5XSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSB2YWx1ZVxuICAgICAgICB9IGVsc2UgaWYgKGlzQXJyYXkocmVzdWx0W2tleV0pKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IFsgcmVzdWx0W2tleV0sIHZhbHVlIF1cbiAgICAgICAgfVxuICAgICAgfVxuICApXG5cbiAgcmV0dXJuIHJlc3VsdFxufSIsIm1vZHVsZS5leHBvcnRzPVwiMi44LjZcIiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHQgPSByZXF1aXJlKCcuL3ZlcnNpb24uanNvbicpO1xuXG5mdW5jdGlvbiBnZXQgKHYpIHtcbiAgcmV0dXJuICd0JyArIHQgKyAnO3YnICsgdjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldDogZ2V0XG59O1xuIl19
