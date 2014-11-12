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
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n<p>Taunus exposes <em>three different public APIs</em>, and there&#39;s also <strong>plugins to integrate Taunus and an HTTP server</strong>. This document covers all three APIs extensively. If you&#39;re concerned about the inner workings of Taunus, please refer to the <a href=\"/getting-started\">Getting Started</a> guide. This document aims to only cover how the public interface affects application state, but <strong>doesn&#39;t delve into implementation details</strong>.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li>A <a href=\"#server-side-api\">server-side API</a> that deals with server-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Its <a href=\"#the-options-object\"><code>options</code></a> argument<ul>\n<li><a href=\"#-options-layout-\"><code>layout</code></a></li>\n<li><a href=\"#-options-routes-\"><code>routes</code></a></li>\n<li><a href=\"#-options-getdefaultviewmodel-\"><code>getDefaultViewModel</code></a></li>\n<li><a href=\"#-options-plaintext-\"><code>plaintext</code></a></li>\n<li><a href=\"#-options-resolvers-\"><code>resolvers</code></a></li>\n</ul>\n</li>\n<li>Its <a href=\"#-addroute-definition-\"><code>addRoute</code></a> argument</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render</code></a> method</li>\n<li>The <a href=\"#-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel</code></a> method</li>\n</ul>\n</li>\n<li>A <a href=\"#http-framework-plugins\">suite of plugins</a> can integrate Taunus and an HTTP server<ul>\n<li>Using <a href=\"#using-taunus-express-\"><code>taunus-express</code></a> for <a href=\"http://expressjs.com\">Express</a></li>\n<li>Using <a href=\"#using-taunus-hapi-\"><code>taunus-hapi</code></a> for <a href=\"http://hapijs.com\">Hapi</a></li>\n</ul>\n</li>\n<li>A <a href=\"#command-line-interface\">CLI that produces a wiring module</a> for the client-side<ul>\n<li>The <a href=\"#-output-\"><code>--output</code></a> flag</li>\n<li>The <a href=\"#-watch-\"><code>--watch</code></a> flag</li>\n<li>The <a href=\"#-transform-module-\"><code>--transform &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-standalone-\"><code>--standalone</code></a> flag</li>\n</ul>\n</li>\n<li>A <a href=\"#client-side-api\">client-side API</a> that deals with client-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Using the <a href=\"#using-the-auto-strategy\"><code>auto</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-inline-strategy\"><code>inline</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-manual-strategy\"><code>manual</code></a> strategy</li>\n<li><a href=\"#caching\">Caching</a></li>\n<li><a href=\"#prefetching\">Prefetching</a></li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a> method</li>\n<li>The <a href=\"#-taunus-once-type-fn-\"><code>taunus.once</code></a> method</li>\n<li>The <a href=\"#-taunus-off-type-fn-\"><code>taunus.off</code></a> method</li>\n<li>The <a href=\"#-taunus-intercept-action-fn-\"><code>taunus.intercept</code></a> method</li>\n<li>The <a href=\"#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a> method</li>\n<li>The <a href=\"#-taunus-navigate-url-\"><code>taunus.navigate</code></a> method</li>\n<li>The <a href=\"#-taunus-route-url-\"><code>taunus.state</code></a> property</li>\n<li>The <a href=\"#-taunus-state-\"><code>taunus.route</code></a> method</li>\n</ul>\n</li>\n<li>The <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a> manifest</li>\n</ul>\n<h1 id=\"server-side-api\">Server-side API</h1>\n<p>The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, <em>including client-side rendering</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-addroute-options-\"><code>taunus.mount(addRoute, options?)</code></h2>\n<p>Mounts Taunus on top of a server-side router, by registering each route in <code>options.routes</code> with the <code>addRoute</code> method.</p>\n<blockquote>\n<p>Note that most of the time, <strong>this method shouldn&#39;t be invoked directly</strong>, but rather through one of the <a href=\"#http-framework-plugins\">HTTP framework plugins</a> presented below.</p>\n</blockquote>\n<p>Here&#39;s an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the <code>route</code> and <code>action</code> properties.</p>\n<pre><code class=\"lang-js\">taunus.mount(addRoute, {\n  routes: [{ route: &#39;/&#39;, action: &#39;home/index&#39; }]\n});\n\nfunction addRoute (definition) {\n  app.get(definition.route, definition.action);\n}\n</code></pre>\n<p>Let&#39;s go over the options you can pass to <code>taunus.mount</code> first.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"the-options-object\">The <code>options?</code> object</h4>\n<p>There&#39;s a few options that can be passed to the server-side mountpoint. You&#39;re probably going to be passing these to your <a href=\"#http-framework-plugins\">HTTP framework plugin</a>, rather than using <code>taunus.mount</code> directly.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-layout-\"><code>options.layout?</code></h6>\n<p>The <code>layout</code> property is expected to have the <code>function(data)</code> signature. It&#39;ll be invoked whenever a full HTML document needs to be rendered, and a <code>data</code> object will be passed to it. That object will contain everything you&#39;ve set as the view model, plus a <code>partial</code> property containing the raw HTML of the rendered partial view. Your <code>layout</code> method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out <a href=\"https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\">the <code>layout.jade</code> used in Pony Foo</a> as an example.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-routes-\"><code>options.routes</code></h6>\n<p>The other big option is <code>routes</code>, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.</p>\n<p>Here&#39;s an example route that uses the <a href=\"http://expressjs.com\">Express</a> routing scheme.</p>\n<pre><code class=\"lang-js\">{\n  route: &#39;/articles/:slug&#39;,\n  action: &#39;articles/article&#39;,\n  ignore: false,\n  cache: &lt;inherit&gt;\n}\n</code></pre>\n<ul>\n<li><code>route</code> is a route in the format your HTTP framework of choice understands</li>\n<li><code>action</code> is the name of your controller action. It&#39;ll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller</li>\n<li><code>cache</code> can be used to determine the client-side caching behavior in this application path, and it&#39;ll default to inheriting from the options passed to <code>taunus.mount</code> <em>on the client-side</em></li>\n<li><code>ignore</code> is used in those cases where you want a URL to be ignored by the client-side router even if there&#39;s a catch-all route that would match that URL</li>\n</ul>\n<p>As an example of the <code>ignore</code> use case, consider the routing table shown below. The client-side router doesn&#39;t know <em>(and can&#39;t know unless you point it out)</em> what routes are server-side only, and it&#39;s up to you to point those out.</p>\n<pre><code class=\"lang-js\">[\n  { route: &#39;/&#39;, action: &#39;/home/index&#39; },\n  { route: &#39;/feed&#39;, ignore: true },\n  { route: &#39;/*&#39;, action: &#39;error/not-found&#39; }\n]\n</code></pre>\n<p>This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The <code>ignore</code> property is effectively telling the client-side <em>&quot;don&#39;t hijack links containing this URL&quot;</em>.</p>\n<p>Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don&#39;t need to be <code>ignore</code>d.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getdefaultviewmodel-\"><code>options.getDefaultViewModel?</code></h6>\n<p>The <code>getDefaultViewModel(done)</code> property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you&#39;re done creating a view model, you can invoke <code>done(null, model)</code>. If an error occurs while building the view model, you should call <code>done(err)</code> instead.</p>\n<p>Taunus will throw an error if <code>done</code> is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases <a href=\"#taunus-rebuilddefaultviewmodel\">the defaults can be rebuilt</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-plaintext-\"><code>options.plaintext?</code></h6>\n<p>The <code>plaintext</code> options object is passed directly to <a href=\"https://github.com/bevacqua/hget\">hget</a>, and it&#39;s used to <a href=\"https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\">tweak the plaintext version</a> of your site.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-resolvers-\"><code>options.resolvers?</code></h6>\n<p>Resolvers are used to determine the location of some of the different pieces of your application. Typically you won&#39;t have to touch these in the slightest.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getServerController(action)</code></td>\n<td>Return path to server-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p>The <code>addRoute</code> method passed to <code>taunus.mount</code> on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-addroute-definition-\"><code>addRoute(definition)</code></h4>\n<p>The <code>addRoute(definition)</code> method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework&#39;s router.</p>\n<ul>\n<li><code>route</code> is the route that you set as <code>definition.route</code></li>\n<li><code>action</code> is the action as passed to the route definition</li>\n<li><code>actionFn</code> will be the controller for this action method</li>\n<li><code>middleware</code> will be an array of methods to be executed before <code>actionFn</code></li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render(action, viewModel, req, res, next)</code></h2>\n<p>This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won&#39;t go very deep into it.</p>\n<p>The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The <code>action</code> property determines the default view that will be rendered. The <code>viewModel</code> will be extended by <a href=\"#-options-getdefaultviewmodel-\">the default view model</a>, and it may also override the default <code>action</code> by setting <code>viewModel.model.action</code>.</p>\n<p>The <code>req</code>, <code>res</code>, and <code>next</code> arguments are expected to be the Express routing arguments, but they can also be mocked <em>(which is in fact what the Hapi plugin does)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel(done?)</code></h2>\n<p>Once Taunus has been mounted, calling this method will rebuild the view model defaults using the <code>getDefaultViewModel</code> that was passed to <code>taunus.mount</code> in the options. An optional <code>done</code> callback will be invoked when the model is rebuilt.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"http-framework-plugins\">HTTP Framework Plugins</h1>\n<p>There&#39;s currently two different HTTP frameworks <em>(<a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a>)</em> that you can readily use with Taunus without having to deal with any of the route plumbing yourself.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-express-\">Using <code>taunus-express</code></h2>\n<p>The <code>taunus-express</code> plugin is probably the easiest to use, as Taunus was originally developed with just <a href=\"http://expressjs.com\">Express</a> in mind. In addition to the options already outlined for <a href=\"#-taunus-mount-addroute-options-\">taunus.mount</a>, you can add middleware for any route individually.</p>\n<ul>\n<li><code>middleware</code> are any methods you want Taunus to execute as middleware in Express applications</li>\n</ul>\n<p>To get <code>taunus-express</code> going you can use the following piece of code, provided that you come up with an <code>options</code> object.</p>\n<pre><code class=\"lang-js\">var taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  // ...\n};\n\ntaunusExpress(taunus, app, options);\n</code></pre>\n<p>The <code>taunusExpress</code> method will merely set up Taunus and add the relevant routes to your Express application by calling <code>app.get</code> a bunch of times. You can <a href=\"https://github.com/taunus/taunus-express\">find taunus-express on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-hapi-\">Using <code>taunus-hapi</code></h2>\n<p>The <code>taunus-hapi</code> plugin is a bit more involved, and you&#39;ll have to create a Pack in order to use it. In addition to <a href=\"#-taunus-mount-addroute-options-\">the options we&#39;ve already covered</a>, you can add <code>config</code> on any route.</p>\n<ul>\n<li><code>config</code> is passed directly into the route registered with Hapi, giving you the most flexibility</li>\n</ul>\n<p>To get <code>taunus-hapi</code> going you can use the following piece of code, and you can bring your own <code>options</code> object.</p>\n<pre><code class=\"lang-js\">var Hapi = require(&#39;hapi&#39;);\nvar taunus = require(&#39;taunus&#39;);\nvar taunusHapi = require(&#39;taunus-hapi&#39;)(taunus);\nvar pack = new Hapi.Pack();\n\npack.register({\n  plugin: taunusHapi,\n  options: {\n    // ...\n  }\n});\n</code></pre>\n<p>The <code>taunusHapi</code> plugin will mount Taunus and register all of the necessary routes. You can <a href=\"https://github.com/taunus/taunus-hapi\">find taunus-hapi on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"command-line-interface\">Command-Line Interface</h1>\n<p>Once you&#39;ve set up the server-side to render your views using Taunus, it&#39;s only logical that you&#39;ll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.</p>\n<p>The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.</p>\n<p>Install it globally for development, but remember to use local copies for production-grade uses.</p>\n<pre><code class=\"lang-shell\">npm install -g taunus\n</code></pre>\n<p>When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.</p>\n<pre><code class=\"lang-shell\">taunus\n</code></pre>\n<p>By default, the output will be printed to the standard output, making for a fast debugging experience. Here&#39;s the output if you just had a single <code>home/index</code> route, and the matching view and client-side controller existed.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n  &#39;home/index&#39;: require(&#39;../client/js/controllers/home/index.js&#39;)\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>You can use a few options to alter the outcome of invoking <code>taunus</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-output-\"><code>--output</code></h2>\n<p><sub>the <code>-o</code> alias is available</sub></p>\n<p>Output is written to a file instead of to standard output. The file path used will be the <code>client_wiring</code> option in <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a>, which defaults to <code>&#39;.bin/wiring.js&#39;</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-watch-\"><code>--watch</code></h2>\n<p><sub>the <code>-w</code> alias is available</sub></p>\n<p>Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether <code>--output</code> was used.</p>\n<p>The program won&#39;t exit.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-transform-module-\"><code>--transform &lt;module&gt;</code></h2>\n<p><sub>the <code>-t</code> alias is available</sub></p>\n<p>This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the <a href=\"https://github.com/taunus/hapiify\"><code>hapiify</code></a> module.</p>\n<pre><code class=\"lang-shell\">npm install hapiify\ntaunus -t hapiify\n</code></pre>\n<p>Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></h2>\n<p><sub>the <code>-r</code> alias is available</sub></p>\n<p>Similarly to the <a href=\"#-options-resolvers-\"><code>resolvers</code></a> option that you can pass to <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a>, these resolvers can change the way in which file paths are resolved.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getClientController(action)</code></td>\n<td>Return path to client-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-standalone-\"><code>--standalone</code></h2>\n<p><sub>the <code>-s</code> alias is available</sub></p>\n<p>Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus <a href=\"https://github.com/umdjs/umd\">as a UMD module</a>.</p>\n<p>This would allow you to use Taunus on the client-side even if you don&#39;t want to use <a href=\"http://browserify.org\">Browserify</a> directly.</p>\n<p>Feedback and suggestions about this flag, <em>and possible alternatives that would make Taunus easier to use</em>, are welcome.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-api\">Client-side API</h1>\n<p>Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-container-wiring-options-\"><code>taunus.mount(container, wiring, options?)</code></h2>\n<p>The mountpoint takes a root container, the wiring module, and an options parameter. The <code>container</code> is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the <code>wiring</code> module exactly as built by the CLI, and no further configuration is necessary.</p>\n<p>When the mountpoint executes, Taunus will configure its internal state, <em>set up the client-side router</em>, run the client-side controller for the server-side rendered view, and start hijacking links.</p>\n<p>As an example, consider a browser makes a <code>GET</code> request for <code>/articles/the-fox</code> for the first time. Once <code>taunus.mount(container, wiring)</code> is invoked on the client-side, several things would happen in the order listed below.</p>\n<ul>\n<li>Taunus sets up the client-side view routing engine</li>\n<li>If enabled <em>(via <code>options</code>)</em>, the caching engine is configured</li>\n<li>Taunus obtains the view model <em>(more on this later)</em></li>\n<li>When a view model is obtained, the <code>&#39;start&#39;</code> event is emitted</li>\n<li>Anchor links start being monitored for clicks <em>(at this point your application becomes a <a href=\"http://en.wikipedia.org/wiki/Single-page_application\">SPA</a>)</em></li>\n<li>The <code>articles/article</code> client-side controller is executed</li>\n</ul>\n<p>That&#39;s quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, <em>rather than on the server-side!</em></p>\n<p>In order to better understand the process, I&#39;ll walk you through the <code>options</code> parameter.</p>\n<p>First off, the <code>bootstrap</code> option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: <code>auto</code> <em>(the default strategy)</em>, <code>inline</code>, or <code>manual</code>. The <code>auto</code> strategy involves the least work, which is why it&#39;s the default.</p>\n<ul>\n<li><code>auto</code> will make an AJAX request for the view model</li>\n<li><code>inline</code> expects you to place the model into a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag</li>\n<li><code>manual</code> expects you to get the view model however you want to, and then let Taunus know when it&#39;s ready</li>\n</ul>\n<p>Let&#39;s go into detail about each of these strategies.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-auto-strategy\">Using the <code>auto</code> strategy</h4>\n<p>The <code>auto</code> strategy means that Taunus will make use of an AJAX request to obtain the view model. <em>You don&#39;t have to do anything else</em> and this is the default strategy. This is the <strong>most convenient strategy, but also the slowest</strong> one.</p>\n<p>It&#39;s slow because the view model won&#39;t be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and <code>taunus.mount</code> is invoked.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-inline-strategy\">Using the <code>inline</code> strategy</h4>\n<p>The <code>inline</code> strategy expects you to add a <code>data-taunus</code> attribute on the <code>container</code> element. This attribute must be equal to the <code>id</code> attribute of a <code>&lt;script&gt;</code> tag containing the serialized view model.</p>\n<pre><code class=\"lang-jade\">div(data-taunus=&#39;model&#39;)!=partial\nscript(type=&#39;text/taunus&#39;, data-taunus=&#39;model&#39;)=JSON.stringify(model)\n</code></pre>\n<p>Pay special attention to the fact that the model is not only made into a JSON string, <em>but also HTML encoded by Jade</em>. When Taunus extracts the model from the <code>&lt;script&gt;</code> tag it&#39;ll unescape it, and then parse it as JSON.</p>\n<p>This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.</p>\n<p>That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-manual-strategy\">Using the <code>manual</code> strategy</h4>\n<p>The <code>manual</code> strategy is the most involved of the three, but also the most performant. In this strategy you&#39;re supposed to add the following <em>(seemingly pointless)</em> snippet of code in a <code>&lt;script&gt;</code> other than the one that&#39;s pulling down Taunus, so that they are pulled concurrently rather than serially.</p>\n<pre><code class=\"lang-js\">window.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n</code></pre>\n<p>Once you somehow get your hands on the view model, you should invoke <code>taunusReady(model)</code>. Considering you&#39;ll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.</p>\n<ul>\n<li>The view model is loaded first, you call <code>taunusReady(model)</code> and wait for Taunus to take the model object and boot the application as soon as <code>taunus.mount</code> is executed</li>\n<li>Taunus loads first and <code>taunus.mount</code> is called first. In this case, Taunus will replace <code>window.taunusReady</code> with a special <code>boot</code> method. When the view model finishes loading, you call <code>taunusReady(model)</code> and the application finishes booting</li>\n</ul>\n<blockquote>\n<p>If this sounds a little mind-bending it&#39;s because it is. It&#39;s not designed to be pretty, but merely to be performant.</p>\n</blockquote>\n<p>Now that we&#39;ve addressed the awkward bits, let&#39;s cover the <em>&quot;somehow get your hands on the view model&quot;</em> aspect. My preferred method is using JSONP, as it&#39;s able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you&#39;ll probably want this to be an inline script, keeping it small is important.</p>\n<p>The good news is that the server-side supports JSONP out the box. Here&#39;s a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.</p>\n<pre><code class=\"lang-js\">function inject (url) {\n  var script = document.createElement(&#39;script&#39;);\n  script.src = url;\n  document.body.appendChild(script);\n}\n\nfunction injector () {\n  var search = location.search;\n  var searchQuery = search ? &#39;&amp;&#39; + search.substr(1) : &#39;&#39;;\n  var searchJson = &#39;?json&amp;callback=taunusReady&#39; + searchQuery;\n  inject(location.pathname + searchJson);\n}\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n\ninjector();\n</code></pre>\n<p>As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching\">Caching</h4>\n<p>The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the <code>cache</code> flag in the options passed to <code>taunus.mount</code> on the client-side.</p>\n<p>If you set <code>cache</code> to <code>true</code> then cached items will be considered <em>&quot;fresh&quot; (valid copies of the original)</em> for <strong>15 seconds</strong>. You can also set <code>cache</code> to a number, and that number of seconds will be used as the default instead.</p>\n<p>Caching can also be tweaked on individual routes. For instance, you could set <code>{ cache: true }</code> when mounting Taunus and then have <code>{ cache: 3600 }</code> on a route that you want to cache for a longer period of time.</p>\n<p>The caching layer is <em>seamlessly integrated</em> into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in <a href=\"http://caniuse.com/#feat=indexeddb\">browsers that support IndexedDB</a>. In the case of browsers that don&#39;t support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"prefetching\">Prefetching</h4>\n<p>If caching is enabled, the next logical step is prefetching. This is enabled just by adding <code>prefetch: true</code> to the options passed to <code>taunus.mount</code>. The prefetching feature will fire for any anchor link that&#39;s trips over a <code>mouseover</code> or a <code>touchstart</code> event. If a route matches the URL in the <code>href</code>, an AJAX request will prefetch the view and cache its contents, improving perceived performance.</p>\n<p>When links are clicked before prefetching finishes, they&#39;ll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-on-type-fn-\"><code>taunus.on(type, fn)</code></h2>\n<p>Taunus emits a series of events during its lifecycle, and <code>taunus.on</code> is the way you can tune in and listen for these events using a subscription function <code>fn</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-once-type-fn-\"><code>taunus.once(type, fn)</code></h2>\n<p>This method is equivalent to <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a>, except the event listeners will be used once and then it&#39;ll be discarded.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-off-type-fn-\"><code>taunus.off(type, fn)</code></h2>\n<p>Using this method you can remove any event listeners that were previously added using <code>.on</code> or <code>.once</code>. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling <code>.on</code> or <code>.once</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-intercept-action-fn-\"><code>taunus.intercept(action?, fn)</code></h2>\n<p>This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified <code>action</code>. You can also add global interceptors by omitting the <code>action</code> parameter, or setting it to <code>*</code>.</p>\n<p>An interceptor function will receive an <code>event</code> parameter, containing a few different properties.</p>\n<ul>\n<li><code>url</code> contains the URL that needs a view model</li>\n<li><code>route</code> contains the full route object as you&#39;d get from <a href=\"#-taunus-route-url-\"><code>taunus.route(url)</code></a></li>\n<li><code>parts</code> is just a shortcut for <code>route.parts</code></li>\n<li><code>preventDefault(model)</code> allows you to suppress the need for an AJAX request, commanding Taunus to use the model you&#39;ve provided instead</li>\n<li><code>defaultPrevented</code> tells you if some other handler has prevented the default behavior</li>\n<li><code>canPreventDefault</code> tells you if invoking <code>event.preventDefault</code> will have any effect</li>\n<li><code>model</code> starts as <code>null</code>, and it can later become the model passed to <code>preventDefault</code></li>\n</ul>\n<p>Interceptors are asynchronous, but if an interceptor spends longer than 200ms it&#39;ll be short-circuited and calling <code>event.preventDefault</code> past that point won&#39;t have any effect.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-partial-container-action-model-\"><code>taunus.partial(container, action, model)</code></h2>\n<p>This method provides you with access to the view-rendering engine of Taunus. You can use it to render the <code>action</code> view into the <code>container</code> DOM element, using the specified <code>model</code>. Once the view is rendered, the <code>render</code> event will be fired <em>(with <code>container, model</code> as arguments)</em> and the client-side controller for that view will be executed.</p>\n<p>While <code>taunus.partial</code> takes a <code>route</code> as the fourth parameter, you should omit that since it&#39;s used for internal purposes only.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-navigate-url-\"><code>taunus.navigate(url)</code></h2>\n<p>Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use <code>taunus.navigate</code> passing it a plain URL.</p>\n<p>If <code>taunus.navigate(url)</code> is called with an <code>url</code> that doesn&#39;t match any client-side route, then the user will be redirected via <code>location.href</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-route-url-\"><code>taunus.route(url)</code></h2>\n<p>This convenience method allows you to break down a URL into its individual components. This method shouldn&#39;t be needed during normal usage of Taunus, but it&#39;s useful when debugging your routing tables.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-state-\"><code>taunus.state</code></h2>\n<p>This is an internal state variable, and it contains a lot of useful debugging information.</p>\n<ul>\n<li><code>container</code> is the DOM element passed to <code>taunus.mount</code></li>\n<li><code>controllers</code> are all the controllers, as defined in the wiring module</li>\n<li><code>templates</code> are all the templates, as defined in the wiring module</li>\n<li><code>routes</code> are all the routes, as defined in the wiring module</li>\n<li><code>prefetch</code> exposes whether prefetching is turned on</li>\n<li><code>cache</code> exposes whether caching is enabled</li>\n<li><code>model</code> is a reference to the model used to render the current view</li>\n</ul>\n<p>Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-taunusrc-manifest\">The <code>.taunusrc</code> manifest</h1>\n<p>If you want to use values other than the conventional defaults shown in the table below, then you should create a <code>.taunusrc</code> file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your <code>package.json</code>, under the <code>taunus</code> property.</p>\n<pre><code class=\"lang-json\">{\n  &quot;views&quot;: &quot;.bin/views&quot;,\n  &quot;server_routes&quot;: &quot;controllers/routes.js&quot;,\n  &quot;server_controllers&quot;: &quot;controllers&quot;,\n  &quot;client_controllers&quot;: &quot;client/js/controllers&quot;,\n  &quot;client_wiring&quot;: &quot;.bin/wiring.js&quot;\n}\n</code></pre>\n<ul>\n<li>The <code>views</code> directory is where your views <em>(already compiled into JavaScript)</em> are placed. These views are used directly on both the server-side and the client-side</li>\n<li>The <code>server_routes</code> file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module</li>\n<li>The <code>server_controllers</code> directory is the root directory where your server-side controllers live. It&#39;s used when setting up the server-side router</li>\n<li>The <code>client_controllers</code> directory is where your client-side controller modules live. The CLI will <code>require</code> these controllers in its resulting wiring module</li>\n<li>The <code>client_wiring</code> file is where your wiring module will be placed by the CLI. You&#39;ll then have to <code>require</code> it in your application when booting up Taunus</li>\n</ul>\n<p>Here is where things get <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">a little conventional</a>. Views, and both server-side and client-side controllers are expected to be organized by following the <code>{root}/{controller}/{action}</code> pattern, but you could change that using <code>resolvers</code> when invoking the CLI and using the server-side API.</p>\n<p>Views and controllers are also expected to be CommonJS modules that export a single method.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    Taunus exposes _three different public APIs_, and there's also **plugins to integrate Taunus and an HTTP server**. This document covers all three APIs extensively. If you're concerned about the inner workings of Taunus, please refer to the [Getting Started][1] guide. This document aims to only cover how the public interface affects application state, but **doesn't delve into implementation details**.\n\n    # Table of Contents\n\n    - A [server-side API](#server-side-api) that deals with server-side rendering\n      - The [`taunus.mount`](#-taunus-mount-addroute-options-) method\n        - Its [`options`](#the-options-object) argument\n          - [`layout`](#-options-layout-)\n          - [`routes`](#-options-routes-)\n          - [`getDefaultViewModel`](#-options-getdefaultviewmodel-)\n          - [`plaintext`](#-options-plaintext-)\n          - [`resolvers`](#-options-resolvers-)\n        - Its [`addRoute`](#-addroute-definition-) argument\n      - The [`taunus.render`](#-taunus-render-action-viewmodel-req-res-next-) method\n      - The [`taunus.rebuildDefaultViewModel`](#-taunus-rebuilddefaultviewmodel-done-) method\n    - A [suite of plugins](#http-framework-plugins) can integrate Taunus and an HTTP server\n      - Using [`taunus-express`](#using-taunus-express-) for [Express][2]\n      - Using [`taunus-hapi`](#using-taunus-hapi-) for [Hapi][3]\n    - A [CLI that produces a wiring module](#command-line-interface) for the client-side\n      - The [`--output`](#-output-) flag\n      - The [`--watch`](#-watch-) flag\n      - The [`--transform <module>`](#-transform-module-) flag\n      - The [`--resolvers <module>`](#-resolvers-module-) flag\n      - The [`--standalone`](#-standalone-) flag\n    - A [client-side API](#client-side-api) that deals with client-side rendering\n      - The [`taunus.mount`](#-taunus-mount-container-wiring-options-) method\n        - Using the [`auto`](#using-the-auto-strategy) strategy\n        - Using the [`inline`](#using-the-inline-strategy) strategy\n        - Using the [`manual`](#using-the-manual-strategy) strategy\n        - [Caching](#caching)\n        - [Prefetching](#prefetching)\n      - The [`taunus.on`](#-taunus-on-type-fn-) method\n      - The [`taunus.once`](#-taunus-once-type-fn-) method\n      - The [`taunus.off`](#-taunus-off-type-fn-) method\n      - The [`taunus.intercept`](#-taunus-intercept-action-fn-) method\n      - The [`taunus.partial`](#-taunus-partial-container-action-model-) method\n      - The [`taunus.navigate`](#-taunus-navigate-url-) method\n      - The [`taunus.state`](#-taunus-route-url-) property\n      - The [`taunus.route`](#-taunus-state-) method\n    - The [`.taunusrc`](#the-taunusrc-manifest) manifest\n\n    # Server-side API\n\n    The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, _including client-side rendering_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(addRoute, options?)`\n\n    Mounts Taunus on top of a server-side router, by registering each route in `options.routes` with the `addRoute` method.\n\n    > Note that most of the time, **this method shouldn't be invoked directly**, but rather through one of the [HTTP framework plugins](#http-framework-plugins) presented below.\n\n    Here's an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the `route` and `action` properties.\n\n    ```js\n    taunus.mount(addRoute, {\n      routes: [{ route: '/', action: 'home/index' }]\n    });\n\n    function addRoute (definition) {\n      app.get(definition.route, definition.action);\n    }\n    ```\n\n    Let's go over the options you can pass to `taunus.mount` first.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### The `options?` object\n\n    There's a few options that can be passed to the server-side mountpoint. You're probably going to be passing these to your [HTTP framework plugin](#http-framework-plugins), rather than using `taunus.mount` directly.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.layout?`\n\n    The `layout` property is expected to have the `function(data)` signature. It'll be invoked whenever a full HTML document needs to be rendered, and a `data` object will be passed to it. That object will contain everything you've set as the view model, plus a `partial` property containing the raw HTML of the rendered partial view. Your `layout` method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out [the `layout.jade` used in Pony Foo][4] as an example.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.routes`\n\n    The other big option is `routes`, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.\n\n    Here's an example route that uses the [Express][2] routing scheme.\n\n    ```js\n    {\n      route: '/articles/:slug',\n      action: 'articles/article',\n      ignore: false,\n      cache: <inherit>\n    }\n    ```\n\n    - `route` is a route in the format your HTTP framework of choice understands\n    - `action` is the name of your controller action. It'll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller\n    - `cache` can be used to determine the client-side caching behavior in this application path, and it'll default to inheriting from the options passed to `taunus.mount` _on the client-side_\n    - `ignore` is used in those cases where you want a URL to be ignored by the client-side router even if there's a catch-all route that would match that URL\n\n    As an example of the `ignore` use case, consider the routing table shown below. The client-side router doesn't know _(and can't know unless you point it out)_ what routes are server-side only, and it's up to you to point those out.\n\n    ```js\n    [\n      { route: '/', action: '/home/index' },\n      { route: '/feed', ignore: true },\n      { route: '/*', action: 'error/not-found' }\n    ]\n    ```\n\n    This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The `ignore` property is effectively telling the client-side _\"don't hijack links containing this URL\"_.\n\n    Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don't need to be `ignore`d.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getDefaultViewModel?`\n\n    The `getDefaultViewModel(done)` property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you're done creating a view model, you can invoke `done(null, model)`. If an error occurs while building the view model, you should call `done(err)` instead.\n\n    Taunus will throw an error if `done` is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases [the defaults can be rebuilt](#taunus-rebuilddefaultviewmodel).\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.plaintext?`\n\n    The `plaintext` options object is passed directly to [hget][5], and it's used to [tweak the plaintext version][6] of your site.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.resolvers?`\n\n    Resolvers are used to determine the location of some of the different pieces of your application. Typically you won't have to touch these in the slightest.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getServerController(action)` | Return path to server-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    The `addRoute` method passed to `taunus.mount` on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `addRoute(definition)`\n\n    The `addRoute(definition)` method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework's router.\n\n    - `route` is the route that you set as `definition.route`\n    - `action` is the action as passed to the route definition\n    - `actionFn` will be the controller for this action method\n    - `middleware` will be an array of methods to be executed before `actionFn`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.render(action, viewModel, req, res, next)`\n\n    This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won't go very deep into it.\n\n    The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The `action` property determines the default view that will be rendered. The `viewModel` will be extended by [the default view model](#-options-getdefaultviewmodel-), and it may also override the default `action` by setting `viewModel.model.action`.\n\n    The `req`, `res`, and `next` arguments are expected to be the Express routing arguments, but they can also be mocked _(which is in fact what the Hapi plugin does)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.rebuildDefaultViewModel(done?)`\n\n    Once Taunus has been mounted, calling this method will rebuild the view model defaults using the `getDefaultViewModel` that was passed to `taunus.mount` in the options. An optional `done` callback will be invoked when the model is rebuilt.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # HTTP Framework Plugins\n\n    There's currently two different HTTP frameworks _([Express][2] and [Hapi][3])_ that you can readily use with Taunus without having to deal with any of the route plumbing yourself.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-express`\n\n    The `taunus-express` plugin is probably the easiest to use, as Taunus was originally developed with just [Express][2] in mind. In addition to the options already outlined for [taunus.mount](#-taunus-mount-addroute-options-), you can add middleware for any route individually.\n\n    - `middleware` are any methods you want Taunus to execute as middleware in Express applications\n\n    To get `taunus-express` going you can use the following piece of code, provided that you come up with an `options` object.\n\n    ```js\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      // ...\n    };\n\n    taunusExpress(taunus, app, options);\n    ```\n\n    The `taunusExpress` method will merely set up Taunus and add the relevant routes to your Express application by calling `app.get` a bunch of times. You can [find taunus-express on GitHub][7].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-hapi`\n\n    The `taunus-hapi` plugin is a bit more involved, and you'll have to create a Pack in order to use it. In addition to [the options we've already covered](#-taunus-mount-addroute-options-), you can add `config` on any route.\n\n    - `config` is passed directly into the route registered with Hapi, giving you the most flexibility\n\n    To get `taunus-hapi` going you can use the following piece of code, and you can bring your own `options` object.\n\n    ```js\n    var Hapi = require('hapi');\n    var taunus = require('taunus');\n    var taunusHapi = require('taunus-hapi')(taunus);\n    var pack = new Hapi.Pack();\n\n    pack.register({\n      plugin: taunusHapi,\n      options: {\n        // ...\n      }\n    });\n    ```\n\n    The `taunusHapi` plugin will mount Taunus and register all of the necessary routes. You can [find taunus-hapi on GitHub][8].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Command-Line Interface\n\n    Once you've set up the server-side to render your views using Taunus, it's only logical that you'll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.\n\n    The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.\n\n    Install it globally for development, but remember to use local copies for production-grade uses.\n\n    ```shell\n    npm install -g taunus\n    ```\n\n    When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.\n\n    ```shell\n    taunus\n    ```\n\n    By default, the output will be printed to the standard output, making for a fast debugging experience. Here's the output if you just had a single `home/index` route, and the matching view and client-side controller existed.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n      'home/index': require('../client/js/controllers/home/index.js')\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    You can use a few options to alter the outcome of invoking `taunus`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--output`\n\n    <sub>the `-o` alias is available</sub>\n\n    Output is written to a file instead of to standard output. The file path used will be the `client_wiring` option in [`.taunusrc`](#the-taunusrc-manifest), which defaults to `'.bin/wiring.js'`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--watch`\n\n    <sub>the `-w` alias is available</sub>\n\n    Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether `--output` was used.\n\n    The program won't exit.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--transform <module>`\n\n    <sub>the `-t` alias is available</sub>\n\n    This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the [`hapiify`][9] module.\n\n    ```shell\n    npm install hapiify\n    taunus -t hapiify\n    ```\n\n    Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--resolvers <module>`\n\n    <sub>the `-r` alias is available</sub>\n\n    Similarly to the [`resolvers`](#-options-resolvers-) option that you can pass to [`taunus.mount`](#-taunus-mount-addroute-options-), these resolvers can change the way in which file paths are resolved.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getClientController(action)` | Return path to client-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--standalone`\n\n    <sub>the `-s` alias is available</sub>\n\n    Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus [as a UMD module][10].\n\n    This would allow you to use Taunus on the client-side even if you don't want to use [Browserify][11] directly.\n\n    Feedback and suggestions about this flag, _and possible alternatives that would make Taunus easier to use_, are welcome.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-side API\n\n    Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(container, wiring, options?)`\n\n    The mountpoint takes a root container, the wiring module, and an options parameter. The `container` is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the `wiring` module exactly as built by the CLI, and no further configuration is necessary.\n\n    When the mountpoint executes, Taunus will configure its internal state, _set up the client-side router_, run the client-side controller for the server-side rendered view, and start hijacking links.\n\n    As an example, consider a browser makes a `GET` request for `/articles/the-fox` for the first time. Once `taunus.mount(container, wiring)` is invoked on the client-side, several things would happen in the order listed below.\n\n    - Taunus sets up the client-side view routing engine\n    - If enabled _(via `options`)_, the caching engine is configured\n    - Taunus obtains the view model _(more on this later)_\n    - When a view model is obtained, the `'start'` event is emitted\n    - Anchor links start being monitored for clicks _(at this point your application becomes a [SPA][13])_\n    - The `articles/article` client-side controller is executed\n\n    That's quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, _rather than on the server-side!_\n\n    In order to better understand the process, I'll walk you through the `options` parameter.\n\n    First off, the `bootstrap` option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: `auto` _(the default strategy)_, `inline`, or `manual`. The `auto` strategy involves the least work, which is why it's the default.\n\n    - `auto` will make an AJAX request for the view model\n    - `inline` expects you to place the model into a `<script type='text/taunus'>` tag\n    - `manual` expects you to get the view model however you want to, and then let Taunus know when it's ready\n\n    Let's go into detail about each of these strategies.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `auto` strategy\n\n    The `auto` strategy means that Taunus will make use of an AJAX request to obtain the view model. _You don't have to do anything else_ and this is the default strategy. This is the **most convenient strategy, but also the slowest** one.\n\n    It's slow because the view model won't be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and `taunus.mount` is invoked.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `inline` strategy\n\n    The `inline` strategy expects you to add a `data-taunus` attribute on the `container` element. This attribute must be equal to the `id` attribute of a `<script>` tag containing the serialized view model.\n\n    ```jade\n    div(data-taunus='model')!=partial\n    script(type='text/taunus', data-taunus='model')=JSON.stringify(model)\n    ```\n\n    Pay special attention to the fact that the model is not only made into a JSON string, _but also HTML encoded by Jade_. When Taunus extracts the model from the `<script>` tag it'll unescape it, and then parse it as JSON.\n\n    This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.\n\n    That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `manual` strategy\n\n    The `manual` strategy is the most involved of the three, but also the most performant. In this strategy you're supposed to add the following _(seemingly pointless)_ snippet of code in a `<script>` other than the one that's pulling down Taunus, so that they are pulled concurrently rather than serially.\n\n    ```js\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n    ```\n\n    Once you somehow get your hands on the view model, you should invoke `taunusReady(model)`. Considering you'll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.\n\n    - The view model is loaded first, you call `taunusReady(model)` and wait for Taunus to take the model object and boot the application as soon as `taunus.mount` is executed\n    - Taunus loads first and `taunus.mount` is called first. In this case, Taunus will replace `window.taunusReady` with a special `boot` method. When the view model finishes loading, you call `taunusReady(model)` and the application finishes booting\n\n    > If this sounds a little mind-bending it's because it is. It's not designed to be pretty, but merely to be performant.\n\n    Now that we've addressed the awkward bits, let's cover the _\"somehow get your hands on the view model\"_ aspect. My preferred method is using JSONP, as it's able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you'll probably want this to be an inline script, keeping it small is important.\n\n    The good news is that the server-side supports JSONP out the box. Here's a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.\n\n    ```js\n    function inject (url) {\n      var script = document.createElement('script');\n      script.src = url;\n      document.body.appendChild(script);\n    }\n\n    function injector () {\n      var search = location.search;\n      var searchQuery = search ? '&' + search.substr(1) : '';\n      var searchJson = '?json&callback=taunusReady' + searchQuery;\n      inject(location.pathname + searchJson);\n    }\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n\n    injector();\n    ```\n\n    As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching\n\n    The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the `cache` flag in the options passed to `taunus.mount` on the client-side.\n\n    If you set `cache` to `true` then cached items will be considered _\"fresh\" (valid copies of the original)_ for **15 seconds**. You can also set `cache` to a number, and that number of seconds will be used as the default instead.\n\n    Caching can also be tweaked on individual routes. For instance, you could set `{ cache: true }` when mounting Taunus and then have `{ cache: 3600 }` on a route that you want to cache for a longer period of time.\n\n    The caching layer is _seamlessly integrated_ into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in [browsers that support IndexedDB][14]. In the case of browsers that don't support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Prefetching\n\n    If caching is enabled, the next logical step is prefetching. This is enabled just by adding `prefetch: true` to the options passed to `taunus.mount`. The prefetching feature will fire for any anchor link that's trips over a `mouseover` or a `touchstart` event. If a route matches the URL in the `href`, an AJAX request will prefetch the view and cache its contents, improving perceived performance.\n\n    When links are clicked before prefetching finishes, they'll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.on(type, fn)`\n\n    Taunus emits a series of events during its lifecycle, and `taunus.on` is the way you can tune in and listen for these events using a subscription function `fn`.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.once(type, fn)`\n\n    This method is equivalent to [`taunus.on`](#-taunus-on-type-fn-), except the event listeners will be used once and then it'll be discarded.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.off(type, fn)`\n\n    Using this method you can remove any event listeners that were previously added using `.on` or `.once`. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling `.on` or `.once`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.intercept(action?, fn)`\n\n    This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified `action`. You can also add global interceptors by omitting the `action` parameter, or setting it to `*`.\n\n    An interceptor function will receive an `event` parameter, containing a few different properties.\n\n    - `url` contains the URL that needs a view model\n    - `route` contains the full route object as you'd get from [`taunus.route(url)`](#-taunus-route-url-)\n    - `parts` is just a shortcut for `route.parts`\n    - `preventDefault(model)` allows you to suppress the need for an AJAX request, commanding Taunus to use the model you've provided instead\n    - `defaultPrevented` tells you if some other handler has prevented the default behavior\n    - `canPreventDefault` tells you if invoking `event.preventDefault` will have any effect\n    - `model` starts as `null`, and it can later become the model passed to `preventDefault`\n\n    Interceptors are asynchronous, but if an interceptor spends longer than 200ms it'll be short-circuited and calling `event.preventDefault` past that point won't have any effect.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.partial(container, action, model)`\n\n    This method provides you with access to the view-rendering engine of Taunus. You can use it to render the `action` view into the `container` DOM element, using the specified `model`. Once the view is rendered, the `render` event will be fired _(with `container, model` as arguments)_ and the client-side controller for that view will be executed.\n\n    While `taunus.partial` takes a `route` as the fourth parameter, you should omit that since it's used for internal purposes only.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.navigate(url)`\n\n    Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use `taunus.navigate` passing it a plain URL.\n\n    If `taunus.navigate(url)` is called with an `url` that doesn't match any client-side route, then the user will be redirected via `location.href`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.route(url)`\n\n    This convenience method allows you to break down a URL into its individual components. This method shouldn't be needed during normal usage of Taunus, but it's useful when debugging your routing tables.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.state`\n\n    This is an internal state variable, and it contains a lot of useful debugging information.\n\n    - `container` is the DOM element passed to `taunus.mount`\n    - `controllers` are all the controllers, as defined in the wiring module\n    - `templates` are all the templates, as defined in the wiring module\n    - `routes` are all the routes, as defined in the wiring module\n    - `prefetch` exposes whether prefetching is turned on\n    - `cache` exposes whether caching is enabled\n    - `model` is a reference to the model used to render the current view\n\n    Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The `.taunusrc` manifest\n\n    If you want to use values other than the conventional defaults shown in the table below, then you should create a `.taunusrc` file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your `package.json`, under the `taunus` property.\n\n    ```json\n    {\n      \"views\": \".bin/views\",\n      \"server_routes\": \"controllers/routes.js\",\n      \"server_controllers\": \"controllers\",\n      \"client_controllers\": \"client/js/controllers\",\n      \"client_wiring\": \".bin/wiring.js\"\n    }\n    ```\n\n    - The `views` directory is where your views _(already compiled into JavaScript)_ are placed. These views are used directly on both the server-side and the client-side\n    - The `server_routes` file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module\n    - The `server_controllers` directory is the root directory where your server-side controllers live. It's used when setting up the server-side router\n    - The `client_controllers` directory is where your client-side controller modules live. The CLI will `require` these controllers in its resulting wiring module\n    - The `client_wiring` file is where your wiring module will be placed by the CLI. You'll then have to `require` it in your application when booting up Taunus\n\n    Here is where things get [a little conventional][12]. Views, and both server-side and client-side controllers are expected to be organized by following the `{root}/{controller}/{action}` pattern, but you could change that using `resolvers` when invoking the CLI and using the server-side API.\n\n    Views and controllers are also expected to be CommonJS modules that export a single method.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: /getting-started\n    [2]: http://expressjs.com\n    [3]: http://hapijs.com\n    [4]: https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\n    [5]: https://github.com/bevacqua/hget\n    [6]: https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\n    [7]: https://github.com/taunus/taunus-express\n    [8]: https://github.com/taunus/taunus-hapi\n    [9]: https://github.com/taunus/hapiify\n    [10]: https://github.com/umdjs/umd\n    [11]: http://browserify.org\n    [12]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [13]: http://en.wikipedia.org/wiki/Single-page_application\n    [14]: http://caniuse.com/#feat=indexeddb\n");
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
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#using-the-client-side-taunus-api\">Using the client-side Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">mkdir getting-started\ncd getting-started\nnpm init\nnpm install taunus taunus-express express --save\n</code></pre>\n<p><img src=\"http://i.imgur.com/4P8vNe9.png\" alt=\"Screenshot with `npm init` output\"></p>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/n8mH4mN.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>routes</code> should be an array of view routes</li>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that <a href=\"/api\">in the API documentation</a>, but it defaults to <code>{}</code>)</em>.</p>\n<p>Here&#39;s what you&#39;d get if you attempted to run the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/08lnCec.png\" alt=\"Screenshot with `node app` results\"></p>\n<p>Turns out you&#39;re missing a lot of things! Taunus is quite lenient and it&#39;ll try its best to let you know what you might be missing, though. Apparently you don&#39;t have a layout, a server-side controller, or even a view! <em>That&#39;s rough.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;use the following combination of plain text and the <strong>(maybe HTML)</strong> partial view&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return &#39;This is the partial: &quot;&#39; + model.partial + &#39;&quot;&#39;;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Here&#39;s what you&#39;d get if you ran the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/wUbnCyk.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>At this point we have a layout, but we&#39;re still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you&#39;re trying to get an MVC engine up and running, right?</p>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">touch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install jadum -g\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Taunus is now operational. All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">touch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template! The <code>!=</code> syntax means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>There&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install taunus -g\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<p>The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use <code>client/js</code> to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let&#39;s stick to the conventions.</p>\n<pre><code class=\"lang-shell\">touch client/js/main.js\n</code></pre>\n<p>The <code>main</code> module will be used as the <em>entry point</em> of your application on the client-side. Here you&#39;ll need to import <code>taunus</code>, the wiring module we&#39;ve just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke <code>taunus.mount</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar wiring = require(&#39;../../.bin/wiring&#39;);\nvar main = document.getElementsByTagName(&#39;main&#39;)[0];\n\ntaunus.mount(main, wiring);\n</code></pre>\n<p>The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.</p>\n<p>By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won&#39;t be functional until the client-side controller runs.</p>\n<p>An alternative is to inline the view model alongside the views in a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag, but this tends to slow down the initial response (models are <em>typically larger</em> than the resulting views).</p>\n<p>A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that&#39;s harder to set up.</p>\n<p>The three booting strategies are explained in <a href=\"/api\">the API documentation</a> and further discussed in <a href=\"/performance\">the optimization guide</a>. For now, the default strategy <em>(<code>&#39;auto&#39;</code>)</em> should suffice. It fetches the view model using an AJAX request right after Taunus loads.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>Client-side controllers run whenever a view is rendered, even if it&#39;s a partial. The controller is passed the <code>model</code>, containing the model that was used to render the view; the <code>route</code>, broken down into its components; and the <code>container</code>, which is whatever DOM element the view was rendered into.</p>\n<p>These controllers are entirely optional, which makes sense since we&#39;re progressively enhancing the application: it might not even be necessary! Let&#39;s add some client-side functionality to the example we&#39;ve been building.</p>\n<pre><code class=\"lang-shell\">touch client/js/controllers/home/index.js\n</code></pre>\n<p>Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we&#39;ll just print the action and the model to the console. If there&#39;s one place where you&#39;d want to enhance the experience, client-side controllers are where you want to put your code.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model, route, container) {\n  console.log(&#39;Rendered view %s using model %s&#39;, route.action, model);\n};\n</code></pre>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-client-side-taunus-api\">Using the client-side Taunus API</h4>\n<p>Taunus does provide <a href=\"/api\">a thin API</a> in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there&#39;s a few methods you can take advantage of on a global scale as well.</p>\n<p>Taunus can notify you whenever important events occur.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Besides events, there&#39;s a couple more methods you can use. The <code>taunus.navigate</code> method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there&#39;s <code>taunus.partial</code>, and that allows you to render any partial view on a DOM element of your choosing, and it&#39;ll then invoke its controller. You&#39;ll need to come up with the model yourself, though.</p>\n<p>Astonishingly, the API is further documented in <a href=\"/api\">the API documentation</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p><a href=\"/performance\">Performance</a> plays an important role in Taunus. That&#39;s why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?</p>\n<p>When turned on, by passing <code>{ cache: true }</code> as the third parameter for <code>taunus.mount</code>, the caching layer will make sure that responses are kept around for <code>15</code> seconds. Whenever a route needs a model in order to render a view, it&#39;ll first ask the caching layer for a fresh copy. If the caching layer doesn&#39;t have a copy, or if that copy is stale <em>(in this case, older than <code>15</code> seconds)</em>, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set <code>cache</code> to a number in seconds instead of just <code>true</code>.</p>\n<p>Since Taunus understands that not every view operates under the same constraints, you&#39;re also able to set a <code>cache</code> freshness duration directly in your routes. The <code>cache</code> property in routes has precedence over the default value.</p>\n<p>There&#39;s currently two caching stores: a raw in-memory store, and an <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">IndexedDB</a> store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of <code>localStorage</code>. It has <a href=\"http://caniuse.com/#feat=indexeddb\">surprisingly broad browser support</a>, and in the cases where it&#39;s not supported then caching is done solely in-memory.</p>\n<p>The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them <em>(the <code>touchstart</code> event)</em>, the prefetcher will issue an AJAX request for the view model for that link.</p>\n<p>If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their <em>(possibly limited)</em> Internet connection bandwidth.</p>\n<p>If the human clicks on the link before prefetching is completed, he&#39;ll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.</p>\n<p>Turning prefetching on is simply a matter of setting <code>prefetch</code> to <code>true</code> in the options passed to <code>taunus.mount</code>. For additional insights into the performance improvements Taunus can offer, head over to the <a href=\"/performance\">Performance Optimizations</a> guide.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Your first route](#your-first-route)\n      - [Creating a layout](#creating-a-layout)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Using the client-side Taunus API](#using-the-client-side-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    mkdir getting-started\n    cd getting-started\n    npm init\n    npm install taunus taunus-express express --save\n    ```\n\n    ![Screenshot with `npm init` output][30]\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][31]\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `routes` should be an array of view routes\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that [in the API documentation][18], but it defaults to `{}`)_.\n\n    Here's what you'd get if you attempted to run the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` results][32]\n\n    Turns out you're missing a lot of things! Taunus is quite lenient and it'll try its best to let you know what you might be missing, though. Apparently you don't have a layout, a server-side controller, or even a view! _That's rough._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"use the following combination of plain text and the **(maybe HTML)** partial view\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return 'This is the partial: \"' + model.partial + '\"';\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Here's what you'd get if you ran the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][33]\n\n    At this point we have a layout, but we're still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you're trying to get an MVC engine up and running, right?\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install jadum -g\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Taunus is now operational. All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template! The `!=` syntax means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    There's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install taunus -g\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use `client/js` to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let's stick to the conventions.\n\n    ```shell\n    touch client/js/main.js\n    ```\n\n    The `main` module will be used as the _entry point_ of your application on the client-side. Here you'll need to import `taunus`, the wiring module we've just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke `taunus.mount`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var wiring = require('../../.bin/wiring');\n    var main = document.getElementsByTagName('main')[0];\n\n    taunus.mount(main, wiring);\n    ```\n\n    The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.\n\n    By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won't be functional until the client-side controller runs.\n\n    An alternative is to inline the view model alongside the views in a `<script type='text/taunus'>` tag, but this tends to slow down the initial response (models are _typically larger_ than the resulting views).\n\n    A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that's harder to set up.\n\n    The three booting strategies are explained in [the API documentation][18] and further discussed in [the optimization guide][25]. For now, the default strategy _(`'auto'`)_ should suffice. It fetches the view model using an AJAX request right after Taunus loads.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    Client-side controllers run whenever a view is rendered, even if it's a partial. The controller is passed the `model`, containing the model that was used to render the view; the `route`, broken down into its components; and the `container`, which is whatever DOM element the view was rendered into.\n\n    These controllers are entirely optional, which makes sense since we're progressively enhancing the application: it might not even be necessary! Let's add some client-side functionality to the example we've been building.\n\n    ```shell\n    touch client/js/controllers/home/index.js\n    ```\n\n    Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we'll just print the action and the model to the console. If there's one place where you'd want to enhance the experience, client-side controllers are where you want to put your code.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model, route, container) {\n      console.log('Rendered view %s using model %s', route.action, model);\n    };\n    ```\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the client-side Taunus API\n\n    Taunus does provide [a thin API][18] in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there's a few methods you can take advantage of on a global scale as well.\n\n    Taunus can notify you whenever important events occur.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Besides events, there's a couple more methods you can use. The `taunus.navigate` method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there's `taunus.partial`, and that allows you to render any partial view on a DOM element of your choosing, and it'll then invoke its controller. You'll need to come up with the model yourself, though.\n\n    Astonishingly, the API is further documented in [the API documentation][18].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    [Performance][25] plays an important role in Taunus. That's why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?\n\n    When turned on, by passing `{ cache: true }` as the third parameter for `taunus.mount`, the caching layer will make sure that responses are kept around for `15` seconds. Whenever a route needs a model in order to render a view, it'll first ask the caching layer for a fresh copy. If the caching layer doesn't have a copy, or if that copy is stale _(in this case, older than `15` seconds)_, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set `cache` to a number in seconds instead of just `true`.\n\n    Since Taunus understands that not every view operates under the same constraints, you're also able to set a `cache` freshness duration directly in your routes. The `cache` property in routes has precedence over the default value.\n\n    There's currently two caching stores: a raw in-memory store, and an [IndexedDB][28] store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of `localStorage`. It has [surprisingly broad browser support][29], and in the cases where it's not supported then caching is done solely in-memory.\n\n    The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them _(the `touchstart` event)_, the prefetcher will issue an AJAX request for the view model for that link.\n\n    If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their _(possibly limited)_ Internet connection bandwidth.\n\n    If the human clicks on the link before prefetching is completed, he'll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.\n\n    Turning prefetching on is simply a matter of setting `prefetch` to `true` in the options passed to `taunus.mount`. For additional insights into the performance improvements Taunus can offer, head over to the [Performance Optimizations][25] guide.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n    [28]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [29]: http://caniuse.com/#feat=indexeddb\n    [30]: http://i.imgur.com/4P8vNe9.png\n    [31]: http://i.imgur.com/n8mH4mN.png\n    [32]: http://i.imgur.com/08lnCec.png\n    [33]: http://i.imgur.com/wUbnCyk.png\n");
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
  if (!route) {
    location.href = url; return;
  }

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvbWFpbi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL25vZGVfbW9kdWxlcy9qYWRlL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9qYWR1bS9ydW50aW1lLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvYWN0aXZhdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoaW5nLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZW1pdHRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2ZldGNoZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9ob29rcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW50ZXJjZXB0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pc05hdGl2ZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2xpbmtzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbW91bnQuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9vbmNlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcGFydGlhbC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3JvdXRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0YXRlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL2lkYi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0b3Jlcy9yYXcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci91bmVzY2FwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3hoci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL2NvbnRyYS5lbWl0dGVyL3NyYy9jb250cmEuZW1pdHRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvZmFzdC11cmwtcGFyc2VyL3NyYy91cmxwYXJzZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3JhZi9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcmFmL25vZGVfbW9kdWxlcy9wZXJmb3JtYW5jZS1ub3cvbGliL3BlcmZvcm1hbmNlLW5vdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcm91dGVzL2Rpc3Qvcm91dGVzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvZ2xvYmFsL3dpbmRvdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9vbmNlL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvbm9kZV9tb2R1bGVzL2lzLWZ1bmN0aW9uL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL3RyaW0vaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9wYXJzZS1oZWFkZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3ZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk5BO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyohIGh0dHA6Ly9tdGhzLmJlL3B1bnljb2RlIHYxLjIuNCBieSBAbWF0aGlhcyAqL1xuOyhmdW5jdGlvbihyb290KSB7XG5cblx0LyoqIERldGVjdCBmcmVlIHZhcmlhYmxlcyAqL1xuXHR2YXIgZnJlZUV4cG9ydHMgPSB0eXBlb2YgZXhwb3J0cyA9PSAnb2JqZWN0JyAmJiBleHBvcnRzO1xuXHR2YXIgZnJlZU1vZHVsZSA9IHR5cGVvZiBtb2R1bGUgPT0gJ29iamVjdCcgJiYgbW9kdWxlICYmXG5cdFx0bW9kdWxlLmV4cG9ydHMgPT0gZnJlZUV4cG9ydHMgJiYgbW9kdWxlO1xuXHR2YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsO1xuXHRpZiAoZnJlZUdsb2JhbC5nbG9iYWwgPT09IGZyZWVHbG9iYWwgfHwgZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwpIHtcblx0XHRyb290ID0gZnJlZUdsb2JhbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYHB1bnljb2RlYCBvYmplY3QuXG5cdCAqIEBuYW1lIHB1bnljb2RlXG5cdCAqIEB0eXBlIE9iamVjdFxuXHQgKi9cblx0dmFyIHB1bnljb2RlLFxuXG5cdC8qKiBIaWdoZXN0IHBvc2l0aXZlIHNpZ25lZCAzMi1iaXQgZmxvYXQgdmFsdWUgKi9cblx0bWF4SW50ID0gMjE0NzQ4MzY0NywgLy8gYWthLiAweDdGRkZGRkZGIG9yIDJeMzEtMVxuXG5cdC8qKiBCb290c3RyaW5nIHBhcmFtZXRlcnMgKi9cblx0YmFzZSA9IDM2LFxuXHR0TWluID0gMSxcblx0dE1heCA9IDI2LFxuXHRza2V3ID0gMzgsXG5cdGRhbXAgPSA3MDAsXG5cdGluaXRpYWxCaWFzID0gNzIsXG5cdGluaXRpYWxOID0gMTI4LCAvLyAweDgwXG5cdGRlbGltaXRlciA9ICctJywgLy8gJ1xceDJEJ1xuXG5cdC8qKiBSZWd1bGFyIGV4cHJlc3Npb25zICovXG5cdHJlZ2V4UHVueWNvZGUgPSAvXnhuLS0vLFxuXHRyZWdleE5vbkFTQ0lJID0gL1teIC1+XS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9cXHgyRXxcXHUzMDAyfFxcdUZGMEV8XFx1RkY2MS9nLCAvLyBSRkMgMzQ5MCBzZXBhcmF0b3JzXG5cblx0LyoqIEVycm9yIG1lc3NhZ2VzICovXG5cdGVycm9ycyA9IHtcblx0XHQnb3ZlcmZsb3cnOiAnT3ZlcmZsb3c6IGlucHV0IG5lZWRzIHdpZGVyIGludGVnZXJzIHRvIHByb2Nlc3MnLFxuXHRcdCdub3QtYmFzaWMnOiAnSWxsZWdhbCBpbnB1dCA+PSAweDgwIChub3QgYSBiYXNpYyBjb2RlIHBvaW50KScsXG5cdFx0J2ludmFsaWQtaW5wdXQnOiAnSW52YWxpZCBpbnB1dCdcblx0fSxcblxuXHQvKiogQ29udmVuaWVuY2Ugc2hvcnRjdXRzICovXG5cdGJhc2VNaW51c1RNaW4gPSBiYXNlIC0gdE1pbixcblx0Zmxvb3IgPSBNYXRoLmZsb29yLFxuXHRzdHJpbmdGcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLFxuXG5cdC8qKiBUZW1wb3JhcnkgdmFyaWFibGUgKi9cblx0a2V5O1xuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgZXJyb3IgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIGVycm9yIHR5cGUuXG5cdCAqIEByZXR1cm5zIHtFcnJvcn0gVGhyb3dzIGEgYFJhbmdlRXJyb3JgIHdpdGggdGhlIGFwcGxpY2FibGUgZXJyb3IgbWVzc2FnZS5cblx0ICovXG5cdGZ1bmN0aW9uIGVycm9yKHR5cGUpIHtcblx0XHR0aHJvdyBSYW5nZUVycm9yKGVycm9yc1t0eXBlXSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGBBcnJheSNtYXBgIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeSBhcnJheVxuXHQgKiBpdGVtLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IGFycmF5IG9mIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXAoYXJyYXksIGZuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR3aGlsZSAobGVuZ3RoLS0pIHtcblx0XHRcdGFycmF5W2xlbmd0aF0gPSBmbihhcnJheVtsZW5ndGhdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5O1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncy5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeVxuXHQgKiBjaGFyYWN0ZXIuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgc3RyaW5nIG9mIGNoYXJhY3RlcnMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrXG5cdCAqIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwRG9tYWluKHN0cmluZywgZm4pIHtcblx0XHRyZXR1cm4gbWFwKHN0cmluZy5zcGxpdChyZWdleFNlcGFyYXRvcnMpLCBmbikuam9pbignLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcblx0ICogY2hhcmFjdGVyIGluIHRoZSBzdHJpbmcuIFdoaWxlIEphdmFTY3JpcHQgdXNlcyBVQ1MtMiBpbnRlcm5hbGx5LFxuXHQgKiB0aGlzIGZ1bmN0aW9uIHdpbGwgY29udmVydCBhIHBhaXIgb2Ygc3Vycm9nYXRlIGhhbHZlcyAoZWFjaCBvZiB3aGljaFxuXHQgKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcblx0ICogbWF0Y2hpbmcgVVRGLTE2LlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmVuY29kZWBcblx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZGVjb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmcgVGhlIFVuaWNvZGUgaW5wdXQgc3RyaW5nIChVQ1MtMikuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gVGhlIG5ldyBhcnJheSBvZiBjb2RlIHBvaW50cy5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJkZWNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBjb3VudGVyID0gMCxcblx0XHQgICAgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aCxcblx0XHQgICAgdmFsdWUsXG5cdFx0ICAgIGV4dHJhO1xuXHRcdHdoaWxlIChjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGhpZ2ggc3Vycm9nYXRlLCBhbmQgdGhlcmUgaXMgYSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRleHRyYSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRcdGlmICgoZXh0cmEgJiAweEZDMDApID09IDB4REMwMCkgeyAvLyBsb3cgc3Vycm9nYXRlXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1bm1hdGNoZWQgc3Vycm9nYXRlOyBvbmx5IGFwcGVuZCB0aGlzIGNvZGUgdW5pdCwgaW4gY2FzZSB0aGUgbmV4dFxuXHRcdFx0XHRcdC8vIGNvZGUgdW5pdCBpcyB0aGUgaGlnaCBzdXJyb2dhdGUgb2YgYSBzdXJyb2dhdGUgcGFpclxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRjb3VudGVyLS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3RyaW5nIGJhc2VkIG9uIGFuIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZGVjb2RlYFxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBlbmNvZGVcblx0ICogQHBhcmFtIHtBcnJheX0gY29kZVBvaW50cyBUaGUgYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHJldHVybiBtYXAoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YXIgb3V0cHV0ID0gJyc7XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGJhc2ljIGNvZGUgcG9pbnQgaW50byBhIGRpZ2l0L2ludGVnZXIuXG5cdCAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gY29kZVBvaW50IFRoZSBiYXNpYyBudW1lcmljIGNvZGUgcG9pbnQgdmFsdWUuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGluIHRoZSByYW5nZSBgMGAgdG8gYGJhc2UgLSAxYCwgb3IgYGJhc2VgIGlmXG5cdCAqIHRoZSBjb2RlIHBvaW50IGRvZXMgbm90IHJlcHJlc2VudCBhIHZhbHVlLlxuXHQgKi9cblx0ZnVuY3Rpb24gYmFzaWNUb0RpZ2l0KGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgLSA0OCA8IDEwKSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gMjI7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA2NSA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gNjU7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA5NyA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gOTc7XG5cdFx0fVxuXHRcdHJldHVybiBiYXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGlnaXQvaW50ZWdlciBpbnRvIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHNlZSBgYmFzaWNUb0RpZ2l0KClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBkaWdpdCBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBiYXNpYyBjb2RlIHBvaW50IHdob3NlIHZhbHVlICh3aGVuIHVzZWQgZm9yXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG5cdCAqIGAwYCB0byBgYmFzZSAtIDFgLiBJZiBgZmxhZ2AgaXMgbm9uLXplcm8sIHRoZSB1cHBlcmNhc2UgZm9ybSBpc1xuXHQgKiB1c2VkOyBlbHNlLCB0aGUgbG93ZXJjYXNlIGZvcm0gaXMgdXNlZC4gVGhlIGJlaGF2aW9yIGlzIHVuZGVmaW5lZFxuXHQgKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGlnaXRUb0Jhc2ljKGRpZ2l0LCBmbGFnKSB7XG5cdFx0Ly8gIDAuLjI1IG1hcCB0byBBU0NJSSBhLi56IG9yIEEuLlpcblx0XHQvLyAyNi4uMzUgbWFwIHRvIEFTQ0lJIDAuLjlcblx0XHRyZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogKGRpZ2l0IDwgMjYpIC0gKChmbGFnICE9IDApIDw8IDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG5cdCAqIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0OTIjc2VjdGlvbi0zLjRcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGFkYXB0KGRlbHRhLCBudW1Qb2ludHMsIGZpcnN0VGltZSkge1xuXHRcdHZhciBrID0gMDtcblx0XHRkZWx0YSA9IGZpcnN0VGltZSA/IGZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuXHRcdGRlbHRhICs9IGZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblx0XHRmb3IgKC8qIG5vIGluaXRpYWxpemF0aW9uICovOyBkZWx0YSA+IGJhc2VNaW51c1RNaW4gKiB0TWF4ID4+IDE7IGsgKz0gYmFzZSkge1xuXHRcdFx0ZGVsdGEgPSBmbG9vcihkZWx0YSAvIGJhc2VNaW51c1RNaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gZmxvb3IoayArIChiYXNlTWludXNUTWluICsgMSkgKiBkZWx0YSAvIChkZWx0YSArIHNrZXcpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMgdG8gYSBzdHJpbmcgb2YgVW5pY29kZVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBkZWNvZGUoaW5wdXQpIHtcblx0XHQvLyBEb24ndCB1c2UgVUNTLTJcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuXHRcdCAgICBvdXQsXG5cdFx0ICAgIGkgPSAwLFxuXHRcdCAgICBuID0gaW5pdGlhbE4sXG5cdFx0ICAgIGJpYXMgPSBpbml0aWFsQmlhcyxcblx0XHQgICAgYmFzaWMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIGluZGV4LFxuXHRcdCAgICBvbGRpLFxuXHRcdCAgICB3LFxuXHRcdCAgICBrLFxuXHRcdCAgICBkaWdpdCxcblx0XHQgICAgdCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuNCcsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoJ3B1bnljb2RlJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgIWZyZWVFeHBvcnRzLm5vZGVUeXBlKSB7XG5cdFx0aWYgKGZyZWVNb2R1bGUpIHsgLy8gaW4gTm9kZS5qcyBvciBSaW5nb0pTIHYwLjguMCtcblx0XHRcdGZyZWVNb2R1bGUuZXhwb3J0cyA9IHB1bnljb2RlO1xuXHRcdH0gZWxzZSB7IC8vIGluIE5hcndoYWwgb3IgUmluZ29KUyB2MC43LjAtXG5cdFx0XHRmb3IgKGtleSBpbiBwdW55Y29kZSkge1xuXHRcdFx0XHRwdW55Y29kZS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIChmcmVlRXhwb3J0c1trZXldID0gcHVueWNvZGVba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBpbiBSaGlubyBvciBhIHdlYiBicm93c2VyXG5cdFx0cm9vdC5wdW55Y29kZSA9IHB1bnljb2RlO1xuXHR9XG5cbn0odGhpcykpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhYm91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktdGF1bnVzLVxcXCI+V2h5IFRhdW51cz88L2gxPlxcbjxwPlRhdW51cyBmb2N1c2VzIG9uIGRlbGl2ZXJpbmcgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGV4cGVyaWVuY2UgdG8gdGhlIGVuZC11c2VyLCB3aGlsZSBwcm92aWRpbmcgPGVtPmEgcmVhc29uYWJsZSBkZXZlbG9wbWVudCBleHBlcmllbmNlPC9lbT4gYXMgd2VsbC4gPHN0cm9uZz5UYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudDwvc3Ryb25nPi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS48L3A+XFxuPHA+V2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgPHN0cm9uZz48YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXFwiPnVzYWJpbGl0eTwvYT4gYW5kIHBlcmZvcm1hbmNlIGFyZSBib3RoIGNvcmUgY29uY2VybnM8L3N0cm9uZz4gZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyA8c3Ryb25nPnN0aWxsIGV4cGVjdGVkIHRvIHdvcms8L3N0cm9uZz4uPC9wPlxcbjxwPkZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSA8Y29kZT5jbGljazwvY29kZT4gZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQmIzM5O3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0IDxzdHJvbmc+b3VyIHNpdGVzIGRvbiYjMzk7dCBuZWVkIHRvIGxvb2sgYW5kIGJlaGF2ZSB0aGUgc2FtZSBvbiBldmVyeSBicm93c2VyPC9zdHJvbmc+LiBTaW1pbGFybHksIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+cGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZDwvYT4gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC48L3A+XFxuPHA+V2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCA8ZW0+KG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSk8L2VtPiBvciBiZWNhdXNlIHRoZSB1c2VyIGJsb2NrZWQgSmF2YVNjcmlwdCwgeW91ciBhcHBsaWNhdGlvbiB3aWxsIHN0aWxsIHdvcmshPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcIndoeS1ub3Qtb3RoZXItZnJhbWV3b3Jrcy1cXFwiPldoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz88L2gxPlxcbjxwPk1hbnkgb3RoZXIgZnJhbWV3b3JrcyB3ZXJlbiYjMzk7dCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24mIzM5O3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmRvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnQ8L2E+LiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJiMzOTt0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS48L3A+XFxuPHA+TGF0ZWx5LCB3ZSBjYW4gb2JzZXJ2ZSBtYW55IG1hdHVyZSBvcGVuLXNvdXJjZSBmcmFtZXdvcmtzIGFyZSBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkmIzM5O3JlIGFyY2hpdGVjdGVkLCB3aGVyZSB0aGUgZGV2ZWxvcGVyIGlzIHB1dCBmaXJzdC4gPHN0cm9uZz5UYXVudXMgaXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9oYXNodGFnL2h1bWFuZmlyc3RcXFwiPiNodW1hbmZpcnN0PC9hPjwvc3Ryb25nPiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy48L3A+XFxuPHA+UHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSYjMzk7cmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIDxlbT4odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudCk8L2VtPiwgYW5kIHRoZW4gZW5oYW5jZSBpdCA8c3Ryb25nPmlmIHBvc3NpYmxlPC9zdHJvbmc+IHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91JiMzOTtsbCBiZSBhYmxlIHRvIHJlYWNoIHRoZSBtb3N0IHBlb3BsZSB3aXRoIHlvdXIgY29yZSBleHBlcmllbmNlLCBhbmQgeW91JiMzOTtsbCBhbHNvIGJlIGFibGUgdG8gcHJvdmlkZSBodW1hbnMgaW4gbW9yZSBtb2Rlcm4gYnJvd3NlcnMgd2l0aCBhbGwgb2YgdGhlIGxhdGVzdCBmZWF0dXJlcyBhbmQgdGVjaG5vbG9naWVzLjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA2LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmZWF0dXJlc1xcXCI+RmVhdHVyZXM8L2gxPlxcbjxwPk91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj53aXRob3V0IGFueSBjb25maWd1cmF0aW9uIG5lZWRlZDwvYT4uIEV2ZW4gd2hpbGUgVGF1bnVzIHByb3ZpZGVzIHNoYXJlZC1yZW5kZXJpbmcgY2FwYWJpbGl0aWVzLCBpdCBvZmZlcnMgY29kZSByZXVzZSBvZiB2aWV3cyBhbmQgcm91dGVzLCBtZWFuaW5nIHlvdSYjMzk7bGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSYjMzk7bGwgYmUgdXNlZCBpbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5UYXVudXMgZmVhdHVyZXMgYSByZWFzb25hYmx5IGVuaGFuY2VkIGV4cGVyaWVuY2UsIHdoZXJlIGlmIGZlYXR1cmVzIGFyZW4mIzM5O3QgYXZhaWxhYmxlIG9uIGEgYnJvd3NlciwgdGhleSYjMzk7cmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGJ1dCBpZiB0aGF0JiMzOTtzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCYjMzk7bGwgZmFsbCBiYWNrIHRvIHNpbXBseSBub3QgbWVkZGxpbmcgd2l0aCBsaW5rcyBpbnN0ZWFkIG9mIHVzaW5nIGEgY2xpZW50LXNpZGUtb25seSBoYXNoIHJvdXRlci48L3A+XFxuPHA+VGF1bnVzIGNhbiBkZWFsIHdpdGggdmlldyBjYWNoaW5nIG9uIHlvdXIgYmVoYWxmLCBpZiB5b3Ugc28gZGVzaXJlLCB1c2luZyA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+YXN5bmNocm9ub3VzIGVtYmVkZGVkIGRhdGFiYXNlIHN0b3JlczwvYT4gb24gdGhlIGNsaWVudC1zaWRlLiBUdXJucyBvdXQsIHRoZXJlJiMzOTtzIDxhIGhyZWY9XFxcImh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcXCI+cHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREI8L2E+LiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCYjMzk7cyBhdmFpbGFibGUsIGFuZCBpZiBpdCYjMzk7cyBub3QgdGhlbiB2aWV3cyB3b24mIzM5O3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gPHN0cm9uZz5UaGUgc2l0ZSB3b24mIzM5O3Qgc2ltcGx5IHJvbGwgb3ZlciBhbmQgZGllLCB0aG91Z2guPC9zdHJvbmc+PC9wPlxcbjxwPklmIHlvdSYjMzk7dmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlIDxzdHJvbmc+dmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZTwvc3Ryb25nPiwgd2hpY2ggd2lsbCBzdGFydCBkb3dubG9hZGluZyB2aWV3cyBhcyBzb29uIGFzIGh1bWFucyBob3ZlciBvbiBsaW5rcywgYXMgdG8gZGVsaXZlciBhIDxlbT5mYXN0ZXIgcGVyY2VpdmVkIGh1bWFuIGV4cGVyaWVuY2U8L2VtPi48L3A+XFxuPHA+VGF1bnVzIHByb3ZpZGVzIHRoZSBiYXJlIGJvbmVzIGZvciB5b3VyIGFwcGxpY2F0aW9uIHNvIHRoYXQgeW91IGNhbiBzZXBhcmF0ZSBjb25jZXJucyBpbnRvIHJvdXRlcywgY29udHJvbGxlcnMsIG1vZGVscywgYW5kIHZpZXdzLiBUaGVuIGl0IGdldHMgb3V0IG9mIHRoZSB3YXksIGJ5IGRlc2lnbi4gVGhlcmUgYXJlIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+YSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzPC9hPiB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC48L3A+XFxuPHA+V2l0aCBUYXVudXMgeW91JiMzOTtsbCBiZSBpbiBjaGFyZ2UuIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkFyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/PC9hPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmYW1pbGlhcml0eVxcXCI+RmFtaWxpYXJpdHk8L2gxPlxcbjxwPllvdSBjYW4gdXNlIFRhdW51cyB0byBkZXZlbG9wIGFwcGxpY2F0aW9ucyB1c2luZyB5b3VyIGZhdm9yaXRlIE5vZGUuanMgSFRUUCBzZXJ2ZXIsIDxzdHJvbmc+Ym90aCA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBhcmUgZnVsbHkgc3VwcG9ydGVkPC9zdHJvbmc+LiBJbiBib3RoIGNhc2VzLCB5b3UmIzM5O2xsIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPmJ1aWxkIGNvbnRyb2xsZXJzIHRoZSB3YXkgeW91JiMzOTtyZSBhbHJlYWR5IHVzZWQgdG88L2E+LCBleGNlcHQgeW91IHdvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UmIzM5O2xsIGJlIGFibGUgdG8gZG8gZXZlcnl0aGluZyB5b3UmIzM5O3JlIGFscmVhZHkgYWJsZSB0byBkbywgYW5kIHRoZW4geW91JiMzOTtsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuPC9wPlxcbjxwPllvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCYjMzk7cyBiZWNhdXNlIFRhdW51cyB0cmVhdHMgdmlld3MgYXMgbWVyZSBKYXZhU2NyaXB0IGZ1bmN0aW9ucywgcmF0aGVyIHRoYW4gYmVpbmcgdGllZCBpbnRvIGEgc3BlY2lmaWMgdmlldy1yZW5kZXJpbmcgZW5naW5lLjwvcD5cXG48cD5DbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUganVzdCBmdW5jdGlvbnMsIHRvby4gWW91IGNhbiBicmluZyB5b3VyIG93biBzZWxlY3RvciBlbmdpbmUsIHlvdXIgb3duIEFKQVggbGlicmFyaWVzLCBhbmQgeW91ciBvd24gZGF0YS1iaW5kaW5nIHNvbHV0aW9ucy4gSXQgbWlnaHQgbWVhbiB0aGVyZSYjMzk7cyBhIGJpdCBtb3JlIHdvcmsgaW52b2x2ZWQgZm9yIHlvdSwgYnV0IHlvdSYjMzk7bGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSYjMzk7cmUgbW9zdCBjb21mb3J0YWJsZSB3aXRoISBUaGF0IGJlaW5nIHNhaWQsIFRhdW51cyA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmRvZXMgcmVjb21tZW5kIGEgZmV3IGxpYnJhcmllczwvYT4gdGhhdCB3b3JrIHdlbGwgd2l0aCBpdC48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBXaHkgVGF1bnVzP1xcblxcbiAgICBUYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIF9hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZV8gYXMgd2VsbC4gKipUYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudCoqLiBJdCB1c2VzIHNlcnZlci1zaWRlIHJlbmRlcmluZyB0byBnZXQgY29udGVudCB0byB5b3VyIGh1bWFucyBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgaXQgdXNlcyBjbGllbnQtc2lkZSByZW5kZXJpbmcgdG8gaW1wcm92ZSB0aGVpciBleHBlcmllbmNlLlxcblxcbiAgICBXaGlsZSBpdCBmb2N1c2VzIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCAqKlt1c2FiaWxpdHldWzJdIGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zKiogZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyAqKnN0aWxsIGV4cGVjdGVkIHRvIHdvcmsqKi5cXG5cXG4gICAgRm9yIGV4YW1wbGUsIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBzaXRlIHVzZXMgcGxhaW4tb2xkIGxpbmtzIHRvIG5hdmlnYXRlIGZyb20gb25lIHZpZXcgdG8gYW5vdGhlciwgYW5kIHRoZW4gYWRkcyBhIGBjbGlja2AgZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQncyBva2F5LCBiZWNhdXNlIHdlIGFja25vd2xlZGdlIHRoYXQgKipvdXIgc2l0ZXMgZG9uJ3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3NlcioqLiBTaW1pbGFybHksIFtwZXJmb3JtYW5jZSBpcyBncmVhdGx5IGVuaGFuY2VkXVsxXSBieSBkZWxpdmVyaW5nIGNvbnRlbnQgdG8gdGhlIGh1bWFuIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCB0aGVuIGFkZGluZyBmdW5jdGlvbmFsaXR5IG9uIHRvcCBvZiB0aGF0LlxcblxcbiAgICBXaXRoIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCBpZiB0aGUgZnVuY3Rpb25hbGl0eSBuZXZlciBnZXRzIHRoZXJlIGJlY2F1c2UgYSBKYXZhU2NyaXB0IHJlc291cmNlIGZhaWxlZCB0byBsb2FkIGJlY2F1c2UgdGhlIG5ldHdvcmsgZmFpbGVkIF8obm90IHVuY29tbW9uIGluIHRoZSBtb2JpbGUgZXJhKV8gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrIVxcblxcbiAgICBbMV06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9hZGp1c3RpbmctdXgtZm9yLWh1bWFuc1xcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IE5vdCBPdGhlciBGcmFtZXdvcmtzP1xcblxcbiAgICBNYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4ndCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24ndCBwcmlvcml0aXplZCwgYW5kIGh1bWFucyBhcmUgZXhwZWN0ZWQgdG8gW2Rvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnRdWzJdLiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJ3QgdGhlIG9ubHkgd2ViIGNyYXdsZXIgb3BlcmF0b3Igb3V0IHRoZXJlLCBhbmQgaXQgbWlnaHQgYmUgYSB3aGlsZSBiZWZvcmUgc29jaWFsIG1lZGlhIGxpbmsgY3Jhd2xlcnMgY2F0Y2ggdXAgd2l0aCB0aGVtLlxcblxcbiAgICBMYXRlbHksIHdlIGNhbiBvYnNlcnZlIG1hbnkgbWF0dXJlIG9wZW4tc291cmNlIGZyYW1ld29ya3MgYXJlIGRyb3BwaW5nIHN1cHBvcnQgZm9yIG9sZGVyIGJyb3dzZXJzLiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZCwgd2hlcmUgdGhlIGRldmVsb3BlciBpcyBwdXQgZmlyc3QuICoqVGF1bnVzIGlzIFsjaHVtYW5maXJzdF1bMV0qKiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy5cXG5cXG4gICAgUHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZC4gQXMgdGhlIG5hbWUgaW1wbGllcywgYSBiYXNlbGluZSBpcyBlc3RhYmxpc2hlZCB3aGVyZSB3ZSBkZWxpdmVyIHRoZSBjb3JlIGV4cGVyaWVuY2UgdG8gdGhlIHVzZXIgXyh0eXBpY2FsbHkgaW4gdGhlIGZvcm0gb2YgcmVhZGFibGUgSFRNTCBjb250ZW50KV8sIGFuZCB0aGVuIGVuaGFuY2UgaXQgKippZiBwb3NzaWJsZSoqIHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91J2xsIGJlIGFibGUgdG8gcmVhY2ggdGhlIG1vc3QgcGVvcGxlIHdpdGggeW91ciBjb3JlIGV4cGVyaWVuY2UsIGFuZCB5b3UnbGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy5cXG5cXG4gICAgWzFdOiBodHRwczovL3R3aXR0ZXIuY29tL2hhc2h0YWcvaHVtYW5maXJzdFxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEZlYXR1cmVzXFxuXFxuICAgIE91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyBbd2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWRdWzJdLiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UnbGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSdsbCBiZSB1c2VkIGluIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUuXFxuXFxuICAgIFRhdW51cyBmZWF0dXJlcyBhIHJlYXNvbmFibHkgZW5oYW5jZWQgZXhwZXJpZW5jZSwgd2hlcmUgaWYgZmVhdHVyZXMgYXJlbid0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkncmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgYGhpc3RvcnlgIEFQSSBidXQgaWYgdGhhdCdzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCdsbCBmYWxsIGJhY2sgdG8gc2ltcGx5IG5vdCBtZWRkbGluZyB3aXRoIGxpbmtzIGluc3RlYWQgb2YgdXNpbmcgYSBjbGllbnQtc2lkZS1vbmx5IGhhc2ggcm91dGVyLlxcblxcbiAgICBUYXVudXMgY2FuIGRlYWwgd2l0aCB2aWV3IGNhY2hpbmcgb24geW91ciBiZWhhbGYsIGlmIHlvdSBzbyBkZXNpcmUsIHVzaW5nIFthc3luY2hyb25vdXMgZW1iZWRkZWQgZGF0YWJhc2Ugc3RvcmVzXVszXSBvbiB0aGUgY2xpZW50LXNpZGUuIFR1cm5zIG91dCwgdGhlcmUncyBbcHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREJdWzRdLiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCdzIGF2YWlsYWJsZSwgYW5kIGlmIGl0J3Mgbm90IHRoZW4gdmlld3Mgd29uJ3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gKipUaGUgc2l0ZSB3b24ndCBzaW1wbHkgcm9sbCBvdmVyIGFuZCBkaWUsIHRob3VnaC4qKlxcblxcbiAgICBJZiB5b3UndmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlICoqdmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZSoqLCB3aGljaCB3aWxsIHN0YXJ0IGRvd25sb2FkaW5nIHZpZXdzIGFzIHNvb24gYXMgaHVtYW5zIGhvdmVyIG9uIGxpbmtzLCBhcyB0byBkZWxpdmVyIGEgX2Zhc3RlciBwZXJjZWl2ZWQgaHVtYW4gZXhwZXJpZW5jZV8uXFxuXFxuICAgIFRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSBbYSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzXVsxXSB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC5cXG5cXG4gICAgV2l0aCBUYXVudXMgeW91J2xsIGJlIGluIGNoYXJnZS4gW0FyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/XVsyXVxcblxcbiAgICBbMV06IC9jb21wbGVtZW50c1xcbiAgICBbMl06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzNdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbNF06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgRmFtaWxpYXJpdHlcXG5cXG4gICAgWW91IGNhbiB1c2UgVGF1bnVzIHRvIGRldmVsb3AgYXBwbGljYXRpb25zIHVzaW5nIHlvdXIgZmF2b3JpdGUgTm9kZS5qcyBIVFRQIHNlcnZlciwgKipib3RoIFtFeHByZXNzXVszXSBhbmQgW0hhcGldWzRdIGFyZSBmdWxseSBzdXBwb3J0ZWQqKi4gSW4gYm90aCBjYXNlcywgeW91J2xsIFtidWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSdyZSBhbHJlYWR5IHVzZWQgdG9dWzFdLCBleGNlcHQgeW91IHdvbid0IGhhdmUgdG8gYHJlcXVpcmVgIHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UnbGwgYmUgYWJsZSB0byBkbyBldmVyeXRoaW5nIHlvdSdyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSdsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuXFxuXFxuICAgIFlvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCdzIGJlY2F1c2UgVGF1bnVzIHRyZWF0cyB2aWV3cyBhcyBtZXJlIEphdmFTY3JpcHQgZnVuY3Rpb25zLCByYXRoZXIgdGhhbiBiZWluZyB0aWVkIGludG8gYSBzcGVjaWZpYyB2aWV3LXJlbmRlcmluZyBlbmdpbmUuXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBqdXN0IGZ1bmN0aW9ucywgdG9vLiBZb3UgY2FuIGJyaW5nIHlvdXIgb3duIHNlbGVjdG9yIGVuZ2luZSwgeW91ciBvd24gQUpBWCBsaWJyYXJpZXMsIGFuZCB5b3VyIG93biBkYXRhLWJpbmRpbmcgc29sdXRpb25zLiBJdCBtaWdodCBtZWFuIHRoZXJlJ3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UnbGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSdyZSBtb3N0IGNvbWZvcnRhYmxlIHdpdGghIFRoYXQgYmVpbmcgc2FpZCwgVGF1bnVzIFtkb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXNdWzJdIHRoYXQgd29yayB3ZWxsIHdpdGggaXQuXFxuXFxuICAgIFsxXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbMl06IC9jb21wbGVtZW50c1xcbiAgICBbM106IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs0XTogaHR0cDovL2hhcGlqcy5jb21cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBpKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJhcGktZG9jdW1lbnRhdGlvblxcXCI+QVBJIERvY3VtZW50YXRpb248L2gxPlxcbjxwPkhlcmUmIzM5O3MgdGhlIEFQSSBkb2N1bWVudGF0aW9uIGZvciBUYXVudXMuIElmIHlvdSYjMzk7dmUgbmV2ZXIgdXNlZCBpdCBiZWZvcmUsIHdlIHJlY29tbWVuZCBnb2luZyBvdmVyIHRoZSA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5HZXR0aW5nIFN0YXJ0ZWQ8L2E+IGd1aWRlIGJlZm9yZSBqdW1waW5nIGludG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uLiBUaGF0IHdheSwgeW91JiMzOTtsbCBnZXQgYSBiZXR0ZXIgaWRlYSBvZiB3aGF0IHRvIGxvb2sgZm9yIGFuZCBob3cgdG8gcHV0IHRvZ2V0aGVyIHNpbXBsZSBhcHBsaWNhdGlvbnMgdXNpbmcgVGF1bnVzLCBiZWZvcmUgZ29pbmcgdGhyb3VnaCBkb2N1bWVudGF0aW9uIG9uIGV2ZXJ5IHB1YmxpYyBpbnRlcmZhY2UgdG8gVGF1bnVzLjwvcD5cXG48cD5UYXVudXMgZXhwb3NlcyA8ZW0+dGhyZWUgZGlmZmVyZW50IHB1YmxpYyBBUElzPC9lbT4sIGFuZCB0aGVyZSYjMzk7cyBhbHNvIDxzdHJvbmc+cGx1Z2lucyB0byBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcjwvc3Ryb25nPi4gVGhpcyBkb2N1bWVudCBjb3ZlcnMgYWxsIHRocmVlIEFQSXMgZXh0ZW5zaXZlbHkuIElmIHlvdSYjMzk7cmUgY29uY2VybmVkIGFib3V0IHRoZSBpbm5lciB3b3JraW5ncyBvZiBUYXVudXMsIHBsZWFzZSByZWZlciB0byB0aGUgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9hPiBndWlkZS4gVGhpcyBkb2N1bWVudCBhaW1zIHRvIG9ubHkgY292ZXIgaG93IHRoZSBwdWJsaWMgaW50ZXJmYWNlIGFmZmVjdHMgYXBwbGljYXRpb24gc3RhdGUsIGJ1dCA8c3Ryb25nPmRvZXNuJiMzOTt0IGRlbHZlIGludG8gaW1wbGVtZW50YXRpb24gZGV0YWlsczwvc3Ryb25nPi48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+QSA8YSBocmVmPVxcXCIjc2VydmVyLXNpZGUtYXBpXFxcIj5zZXJ2ZXItc2lkZSBBUEk8L2E+IHRoYXQgZGVhbHMgd2l0aCBzZXJ2ZXItc2lkZSByZW5kZXJpbmc8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvYT4gbWV0aG9kPHVsPlxcbjxsaT5JdHMgPGEgaHJlZj1cXFwiI3RoZS1vcHRpb25zLW9iamVjdFxcXCI+PGNvZGU+b3B0aW9uczwvY29kZT48L2E+IGFyZ3VtZW50PHVsPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtbGF5b3V0LVxcXCI+PGNvZGU+bGF5b3V0PC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcm91dGVzLVxcXCI+PGNvZGU+cm91dGVzPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC1cXFwiPjxjb2RlPmdldERlZmF1bHRWaWV3TW9kZWw8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1wbGFpbnRleHQtXFxcIj48Y29kZT5wbGFpbnRleHQ8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1yZXNvbHZlcnMtXFxcIj48Y29kZT5yZXNvbHZlcnM8L2NvZGU+PC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5JdHMgPGEgaHJlZj1cXFwiIy1hZGRyb3V0ZS1kZWZpbml0aW9uLVxcXCI+PGNvZGU+YWRkUm91dGU8L2NvZGU+PC9hPiBhcmd1bWVudDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LVxcXCI+PGNvZGU+dGF1bnVzLnJlbmRlcjwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPnN1aXRlIG9mIHBsdWdpbnM8L2E+IGNhbiBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcjx1bD5cXG48bGk+VXNpbmcgPGEgaHJlZj1cXFwiI3VzaW5nLXRhdW51cy1leHByZXNzLVxcXCI+PGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+PC9hPiBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+PC9saT5cXG48bGk+VXNpbmcgPGEgaHJlZj1cXFwiI3VzaW5nLXRhdW51cy1oYXBpLVxcXCI+PGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+PC9hPiBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI2NvbW1hbmQtbGluZS1pbnRlcmZhY2VcXFwiPkNMSSB0aGF0IHByb2R1Y2VzIGEgd2lyaW5nIG1vZHVsZTwvYT4gZm9yIHRoZSBjbGllbnQtc2lkZTx1bD5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtb3V0cHV0LVxcXCI+PGNvZGU+LS1vdXRwdXQ8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtd2F0Y2gtXFxcIj48Y29kZT4tLXdhdGNoPC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRyYW5zZm9ybS1tb2R1bGUtXFxcIj48Y29kZT4tLXRyYW5zZm9ybSAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy1yZXNvbHZlcnMtbW9kdWxlLVxcXCI+PGNvZGU+LS1yZXNvbHZlcnMgJmx0O21vZHVsZSZndDs8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtc3RhbmRhbG9uZS1cXFwiPjxjb2RlPi0tc3RhbmRhbG9uZTwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+QSA8YSBocmVmPVxcXCIjY2xpZW50LXNpZGUtYXBpXFxcIj5jbGllbnQtc2lkZSBBUEk8L2E+IHRoYXQgZGVhbHMgd2l0aCBjbGllbnQtc2lkZSByZW5kZXJpbmc8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiBtZXRob2Q8dWw+XFxuPGxpPlVzaW5nIHRoZSA8YSBocmVmPVxcXCIjdXNpbmctdGhlLWF1dG8tc3RyYXRlZ3lcXFwiPjxjb2RlPmF1dG88L2NvZGU+PC9hPiBzdHJhdGVneTwvbGk+XFxuPGxpPlVzaW5nIHRoZSA8YSBocmVmPVxcXCIjdXNpbmctdGhlLWlubGluZS1zdHJhdGVneVxcXCI+PGNvZGU+aW5saW5lPC9jb2RlPjwvYT4gc3RyYXRlZ3k8L2xpPlxcbjxsaT5Vc2luZyB0aGUgPGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3lcXFwiPjxjb2RlPm1hbnVhbDwvY29kZT48L2E+IHN0cmF0ZWd5PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2NhY2hpbmdcXFwiPkNhY2hpbmc8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3ByZWZldGNoaW5nXFxcIj5QcmVmZXRjaGluZzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub248L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2U8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb2ZmLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub2ZmPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLWludGVyY2VwdC1hY3Rpb24tZm4tXFxcIj48Y29kZT50YXVudXMuaW50ZXJjZXB0PC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1cXFwiPjxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW5hdmlnYXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMuc3RhdGU8L2NvZGU+PC9hPiBwcm9wZXJ0eTwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1zdGF0ZS1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZTwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiI3RoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+PGNvZGU+LnRhdW51c3JjPC9jb2RlPjwvYT4gbWFuaWZlc3Q8L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJzZXJ2ZXItc2lkZS1hcGlcXFwiPlNlcnZlci1zaWRlIEFQSTwvaDE+XFxuPHA+VGhlIHNlcnZlci1zaWRlIEFQSSBpcyB1c2VkIHRvIHNldCB1cCB0aGUgdmlldyByb3V0ZXIuIEl0IHRoZW4gZ2V0cyBvdXQgb2YgdGhlIHdheSwgYWxsb3dpbmcgdGhlIGNsaWVudC1zaWRlIHRvIGV2ZW50dWFsbHkgdGFrZSBvdmVyIGFuZCBhZGQgYW55IGV4dHJhIHN1Z2FyIG9uIHRvcCwgPGVtPmluY2x1ZGluZyBjbGllbnQtc2lkZSByZW5kZXJpbmc8L2VtPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQoYWRkUm91dGUsIG9wdGlvbnM/KTwvY29kZT48L2gyPlxcbjxwPk1vdW50cyBUYXVudXMgb24gdG9wIG9mIGEgc2VydmVyLXNpZGUgcm91dGVyLCBieSByZWdpc3RlcmluZyBlYWNoIHJvdXRlIGluIDxjb2RlPm9wdGlvbnMucm91dGVzPC9jb2RlPiB3aXRoIHRoZSA8Y29kZT5hZGRSb3V0ZTwvY29kZT4gbWV0aG9kLjwvcD5cXG48YmxvY2txdW90ZT5cXG48cD5Ob3RlIHRoYXQgbW9zdCBvZiB0aGUgdGltZSwgPHN0cm9uZz50aGlzIG1ldGhvZCBzaG91bGRuJiMzOTt0IGJlIGludm9rZWQgZGlyZWN0bHk8L3N0cm9uZz4sIGJ1dCByYXRoZXIgdGhyb3VnaCBvbmUgb2YgdGhlIDxhIGhyZWY9XFxcIiNodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5IVFRQIGZyYW1ld29yayBwbHVnaW5zPC9hPiBwcmVzZW50ZWQgYmVsb3cuPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5IZXJlJiMzOTtzIGFuIGluY29tcGxldGUgZXhhbXBsZSBvZiBob3cgdGhpcyBtZXRob2QgbWF5IGJlIHVzZWQuIEl0IGlzIGluY29tcGxldGUgYmVjYXVzZSByb3V0ZSBkZWZpbml0aW9ucyBoYXZlIG1vcmUgb3B0aW9ucyBiZXlvbmQgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiBhbmQgPGNvZGU+YWN0aW9uPC9jb2RlPiBwcm9wZXJ0aWVzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj50YXVudXMubW91bnQoYWRkUm91dGUsIHtcXG4gIHJvdXRlczogW3sgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1dXFxufSk7XFxuXFxuZnVuY3Rpb24gYWRkUm91dGUgKGRlZmluaXRpb24pIHtcXG4gIGFwcC5nZXQoZGVmaW5pdGlvbi5yb3V0ZSwgZGVmaW5pdGlvbi5hY3Rpb24pO1xcbn1cXG48L2NvZGU+PC9wcmU+XFxuPHA+TGV0JiMzOTtzIGdvIG92ZXIgdGhlIG9wdGlvbnMgeW91IGNhbiBwYXNzIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmlyc3QuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhlLW9wdGlvbnMtb2JqZWN0XFxcIj5UaGUgPGNvZGU+b3B0aW9ucz88L2NvZGU+IG9iamVjdDwvaDQ+XFxuPHA+VGhlcmUmIzM5O3MgYSBmZXcgb3B0aW9ucyB0aGF0IGNhbiBiZSBwYXNzZWQgdG8gdGhlIHNlcnZlci1zaWRlIG1vdW50cG9pbnQuIFlvdSYjMzk7cmUgcHJvYmFibHkgZ29pbmcgdG8gYmUgcGFzc2luZyB0aGVzZSB0byB5b3VyIDxhIGhyZWY9XFxcIiNodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5IVFRQIGZyYW1ld29yayBwbHVnaW48L2E+LCByYXRoZXIgdGhhbiB1c2luZyA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGRpcmVjdGx5LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLWxheW91dC1cXFwiPjxjb2RlPm9wdGlvbnMubGF5b3V0PzwvY29kZT48L2g2PlxcbjxwPlRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHByb3BlcnR5IGlzIGV4cGVjdGVkIHRvIGhhdmUgdGhlIDxjb2RlPmZ1bmN0aW9uKGRhdGEpPC9jb2RlPiBzaWduYXR1cmUuIEl0JiMzOTtsbCBiZSBpbnZva2VkIHdoZW5ldmVyIGEgZnVsbCBIVE1MIGRvY3VtZW50IG5lZWRzIHRvIGJlIHJlbmRlcmVkLCBhbmQgYSA8Y29kZT5kYXRhPC9jb2RlPiBvYmplY3Qgd2lsbCBiZSBwYXNzZWQgdG8gaXQuIFRoYXQgb2JqZWN0IHdpbGwgY29udGFpbiBldmVyeXRoaW5nIHlvdSYjMzk7dmUgc2V0IGFzIHRoZSB2aWV3IG1vZGVsLCBwbHVzIGEgPGNvZGU+cGFydGlhbDwvY29kZT4gcHJvcGVydHkgY29udGFpbmluZyB0aGUgcmF3IEhUTUwgb2YgdGhlIHJlbmRlcmVkIHBhcnRpYWwgdmlldy4gWW91ciA8Y29kZT5sYXlvdXQ8L2NvZGU+IG1ldGhvZCB3aWxsIHR5cGljYWxseSB3cmFwIHRoZSByYXcgSFRNTCBmb3IgdGhlIHBhcnRpYWwgd2l0aCB0aGUgYmFyZSBib25lcyBvZiBhbiBIVE1MIGRvY3VtZW50LiBDaGVjayBvdXQgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iLzMzMjcxNzUxMzEyZGI2ZTkyMDU5ZDk4MjkzZDBhN2FjNmU5ZThlNWIvdmlld3Mvc2VydmVyL2xheW91dC9sYXlvdXQuamFkZVxcXCI+dGhlIDxjb2RlPmxheW91dC5qYWRlPC9jb2RlPiB1c2VkIGluIFBvbnkgRm9vPC9hPiBhcyBhbiBleGFtcGxlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLXJvdXRlcy1cXFwiPjxjb2RlPm9wdGlvbnMucm91dGVzPC9jb2RlPjwvaDY+XFxuPHA+VGhlIG90aGVyIGJpZyBvcHRpb24gaXMgPGNvZGU+cm91dGVzPC9jb2RlPiwgd2hpY2ggZXhwZWN0cyBhIGNvbGxlY3Rpb24gb2Ygcm91dGUgZGVmaW5pdGlvbnMuIFJvdXRlIGRlZmluaXRpb25zIHVzZSBhIG51bWJlciBvZiBwcm9wZXJ0aWVzIHRvIGRldGVybWluZSBob3cgdGhlIHJvdXRlIGlzIGdvaW5nIHRvIGJlaGF2ZS48L3A+XFxuPHA+SGVyZSYjMzk7cyBhbiBleGFtcGxlIHJvdXRlIHRoYXQgdXNlcyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IHJvdXRpbmcgc2NoZW1lLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj57XFxuICByb3V0ZTogJiMzOTsvYXJ0aWNsZXMvOnNsdWcmIzM5OyxcXG4gIGFjdGlvbjogJiMzOTthcnRpY2xlcy9hcnRpY2xlJiMzOTssXFxuICBpZ25vcmU6IGZhbHNlLFxcbiAgY2FjaGU6ICZsdDtpbmhlcml0Jmd0O1xcbn1cXG48L2NvZGU+PC9wcmU+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gaXMgYSByb3V0ZSBpbiB0aGUgZm9ybWF0IHlvdXIgSFRUUCBmcmFtZXdvcmsgb2YgY2hvaWNlIHVuZGVyc3RhbmRzPC9saT5cXG48bGk+PGNvZGU+YWN0aW9uPC9jb2RlPiBpcyB0aGUgbmFtZSBvZiB5b3VyIGNvbnRyb2xsZXIgYWN0aW9uLiBJdCYjMzk7bGwgYmUgdXNlZCB0byBmaW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLCB0aGUgZGVmYXVsdCB2aWV3IHRoYXQgc2hvdWxkIGJlIHVzZWQgd2l0aCB0aGlzIHJvdXRlLCBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXI8L2xpPlxcbjxsaT48Y29kZT5jYWNoZTwvY29kZT4gY2FuIGJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBjbGllbnQtc2lkZSBjYWNoaW5nIGJlaGF2aW9yIGluIHRoaXMgYXBwbGljYXRpb24gcGF0aCwgYW5kIGl0JiMzOTtsbCBkZWZhdWx0IHRvIGluaGVyaXRpbmcgZnJvbSB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiA8ZW0+b24gdGhlIGNsaWVudC1zaWRlPC9lbT48L2xpPlxcbjxsaT48Y29kZT5pZ25vcmU8L2NvZGU+IGlzIHVzZWQgaW4gdGhvc2UgY2FzZXMgd2hlcmUgeW91IHdhbnQgYSBVUkwgdG8gYmUgaWdub3JlZCBieSB0aGUgY2xpZW50LXNpZGUgcm91dGVyIGV2ZW4gaWYgdGhlcmUmIzM5O3MgYSBjYXRjaC1hbGwgcm91dGUgdGhhdCB3b3VsZCBtYXRjaCB0aGF0IFVSTDwvbGk+XFxuPC91bD5cXG48cD5BcyBhbiBleGFtcGxlIG9mIHRoZSA8Y29kZT5pZ25vcmU8L2NvZGU+IHVzZSBjYXNlLCBjb25zaWRlciB0aGUgcm91dGluZyB0YWJsZSBzaG93biBiZWxvdy4gVGhlIGNsaWVudC1zaWRlIHJvdXRlciBkb2VzbiYjMzk7dCBrbm93IDxlbT4oYW5kIGNhbiYjMzk7dCBrbm93IHVubGVzcyB5b3UgcG9pbnQgaXQgb3V0KTwvZW0+IHdoYXQgcm91dGVzIGFyZSBzZXJ2ZXItc2lkZSBvbmx5LCBhbmQgaXQmIzM5O3MgdXAgdG8geW91IHRvIHBvaW50IHRob3NlIG91dC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+W1xcbiAgeyByb3V0ZTogJiMzOTsvJiMzOTssIGFjdGlvbjogJiMzOTsvaG9tZS9pbmRleCYjMzk7IH0sXFxuICB7IHJvdXRlOiAmIzM5Oy9mZWVkJiMzOTssIGlnbm9yZTogdHJ1ZSB9LFxcbiAgeyByb3V0ZTogJiMzOTsvKiYjMzk7LCBhY3Rpb246ICYjMzk7ZXJyb3Ivbm90LWZvdW5kJiMzOTsgfVxcbl1cXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhpcyBzdGVwIGlzIG5lY2Vzc2FyeSB3aGVuZXZlciB5b3UgaGF2ZSBhbiBhbmNob3IgbGluayBwb2ludGVkIGF0IHNvbWV0aGluZyBsaWtlIGFuIFJTUyBmZWVkLiBUaGUgPGNvZGU+aWdub3JlPC9jb2RlPiBwcm9wZXJ0eSBpcyBlZmZlY3RpdmVseSB0ZWxsaW5nIHRoZSBjbGllbnQtc2lkZSA8ZW0+JnF1b3Q7ZG9uJiMzOTt0IGhpamFjayBsaW5rcyBjb250YWluaW5nIHRoaXMgVVJMJnF1b3Q7PC9lbT4uPC9wPlxcbjxwPlBsZWFzZSBub3RlIHRoYXQgZXh0ZXJuYWwgbGlua3MgYXJlIG5ldmVyIGhpamFja2VkLiBPbmx5IHNhbWUtb3JpZ2luIGxpbmtzIGNvbnRhaW5pbmcgYSBVUkwgdGhhdCBtYXRjaGVzIG9uZSBvZiB0aGUgcm91dGVzIHdpbGwgYmUgaGlqYWNrZWQgYnkgVGF1bnVzLiBFeHRlcm5hbCBsaW5rcyBkb24mIzM5O3QgbmVlZCB0byBiZSA8Y29kZT5pZ25vcmU8L2NvZGU+ZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLVxcXCI+PGNvZGU+b3B0aW9ucy5nZXREZWZhdWx0Vmlld01vZGVsPzwvY29kZT48L2g2PlxcbjxwPlRoZSA8Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsKGRvbmUpPC9jb2RlPiBwcm9wZXJ0eSBjYW4gYmUgYSBtZXRob2QgdGhhdCBwdXRzIHRvZ2V0aGVyIHRoZSBiYXNlIHZpZXcgbW9kZWwsIHdoaWNoIHdpbGwgdGhlbiBiZSBleHRlbmRlZCBvbiBhbiBhY3Rpb24tYnktYWN0aW9uIGJhc2lzLiBXaGVuIHlvdSYjMzk7cmUgZG9uZSBjcmVhdGluZyBhIHZpZXcgbW9kZWwsIHlvdSBjYW4gaW52b2tlIDxjb2RlPmRvbmUobnVsbCwgbW9kZWwpPC9jb2RlPi4gSWYgYW4gZXJyb3Igb2NjdXJzIHdoaWxlIGJ1aWxkaW5nIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGNhbGwgPGNvZGU+ZG9uZShlcnIpPC9jb2RlPiBpbnN0ZWFkLjwvcD5cXG48cD5UYXVudXMgd2lsbCB0aHJvdyBhbiBlcnJvciBpZiA8Y29kZT5kb25lPC9jb2RlPiBpcyBpbnZva2VkIHdpdGggYW4gZXJyb3IsIHNvIHlvdSBtaWdodCB3YW50IHRvIHB1dCBzYWZlZ3VhcmRzIGluIHBsYWNlIGFzIHRvIGF2b2lkIHRoYXQgZnJvbSBoYXBwZW5uaW5nLiBUaGUgcmVhc29uIHRoaXMgbWV0aG9kIGlzIGFzeW5jaHJvbm91cyBpcyBiZWNhdXNlIHlvdSBtYXkgbmVlZCBkYXRhYmFzZSBhY2Nlc3Mgb3Igc29tZXN1Y2ggd2hlbiBwdXR0aW5nIHRvZ2V0aGVyIHRoZSBkZWZhdWx0cy4gVGhlIHJlYXNvbiB0aGlzIGlzIGEgbWV0aG9kIGFuZCBub3QganVzdCBhbiBvYmplY3QgaXMgdGhhdCB0aGUgZGVmYXVsdHMgbWF5IGNoYW5nZSBkdWUgdG8gaHVtYW4gaW50ZXJhY3Rpb24gd2l0aCB0aGUgYXBwbGljYXRpb24sIGFuZCBpbiB0aG9zZSBjYXNlcyA8YSBocmVmPVxcXCIjdGF1bnVzLXJlYnVpbGRkZWZhdWx0dmlld21vZGVsXFxcIj50aGUgZGVmYXVsdHMgY2FuIGJlIHJlYnVpbHQ8L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLXBsYWludGV4dC1cXFwiPjxjb2RlPm9wdGlvbnMucGxhaW50ZXh0PzwvY29kZT48L2g2PlxcbjxwPlRoZSA8Y29kZT5wbGFpbnRleHQ8L2NvZGU+IG9wdGlvbnMgb2JqZWN0IGlzIHBhc3NlZCBkaXJlY3RseSB0byA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvaGdldFxcXCI+aGdldDwvYT4sIGFuZCBpdCYjMzk7cyB1c2VkIHRvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi9mNmQ2YjUwNjhmZjAzYTM4N2Y1MDM5MDAxNjBkOWZkYzFlNzQ5NzUwL2NvbnRyb2xsZXJzL3JvdXRpbmcuanMjTDcwLUw3MlxcXCI+dHdlYWsgdGhlIHBsYWludGV4dCB2ZXJzaW9uPC9hPiBvZiB5b3VyIHNpdGUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+b3B0aW9ucy5yZXNvbHZlcnM/PC9jb2RlPjwvaDY+XFxuPHA+UmVzb2x2ZXJzIGFyZSB1c2VkIHRvIGRldGVybWluZSB0aGUgbG9jYXRpb24gb2Ygc29tZSBvZiB0aGUgZGlmZmVyZW50IHBpZWNlcyBvZiB5b3VyIGFwcGxpY2F0aW9uLiBUeXBpY2FsbHkgeW91IHdvbiYjMzk7dCBoYXZlIHRvIHRvdWNoIHRoZXNlIGluIHRoZSBzbGlnaHRlc3QuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5TaWduYXR1cmU8L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPmdldFNlcnZlckNvbnRyb2xsZXIoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byBzZXJ2ZXItc2lkZSBjb250cm9sbGVyIGFjdGlvbiBoYW5kbGVyIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPmdldFZpZXcoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+VGhlIDxjb2RlPmFkZFJvdXRlPC9jb2RlPiBtZXRob2QgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gb24gdGhlIHNlcnZlci1zaWRlIGlzIG1vc3RseSBnb2luZyB0byBiZSB1c2VkIGludGVybmFsbHkgYnkgdGhlIEhUVFAgZnJhbWV3b3JrIHBsdWdpbnMsIHNvIGZlZWwgZnJlZSB0byBza2lwIG92ZXIgdGhlIGZvbGxvd2luZyBzZWN0aW9uLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcIi1hZGRyb3V0ZS1kZWZpbml0aW9uLVxcXCI+PGNvZGU+YWRkUm91dGUoZGVmaW5pdGlvbik8L2NvZGU+PC9oND5cXG48cD5UaGUgPGNvZGU+YWRkUm91dGUoZGVmaW5pdGlvbik8L2NvZGU+IG1ldGhvZCB3aWxsIGJlIHBhc3NlZCBhIHJvdXRlIGRlZmluaXRpb24sIGNvbnRhaW5pbmcgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzLiBUaGlzIG1ldGhvZCBpcyBleHBlY3RlZCB0byByZWdpc3RlciBhIHJvdXRlIGluIHlvdXIgSFRUUCBmcmFtZXdvcmsmIzM5O3Mgcm91dGVyLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBpcyB0aGUgcm91dGUgdGhhdCB5b3Ugc2V0IGFzIDxjb2RlPmRlZmluaXRpb24ucm91dGU8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+YWN0aW9uPC9jb2RlPiBpcyB0aGUgYWN0aW9uIGFzIHBhc3NlZCB0byB0aGUgcm91dGUgZGVmaW5pdGlvbjwvbGk+XFxuPGxpPjxjb2RlPmFjdGlvbkZuPC9jb2RlPiB3aWxsIGJlIHRoZSBjb250cm9sbGVyIGZvciB0aGlzIGFjdGlvbiBtZXRob2Q8L2xpPlxcbjxsaT48Y29kZT5taWRkbGV3YXJlPC9jb2RlPiB3aWxsIGJlIGFuIGFycmF5IG9mIG1ldGhvZHMgdG8gYmUgZXhlY3V0ZWQgYmVmb3JlIDxjb2RlPmFjdGlvbkZuPC9jb2RlPjwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LVxcXCI+PGNvZGU+dGF1bnVzLnJlbmRlcihhY3Rpb24sIHZpZXdNb2RlbCwgcmVxLCByZXMsIG5leHQpPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgaXMgYWxtb3N0IGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBhcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIFRhdW51cyB0aHJvdWdoIG9uZSBvZiB0aGUgcGx1Z2lucyBhbnl3YXlzLCBzbyB3ZSB3b24mIzM5O3QgZ28gdmVyeSBkZWVwIGludG8gaXQuPC9wPlxcbjxwPlRoZSByZW5kZXIgbWV0aG9kIGlzIHdoYXQgVGF1bnVzIHVzZXMgdG8gcmVuZGVyIHZpZXdzIGJ5IGNvbnN0cnVjdGluZyBIVE1MLCBKU09OLCBvciBwbGFpbnRleHQgcmVzcG9uc2VzLiBUaGUgPGNvZGU+YWN0aW9uPC9jb2RlPiBwcm9wZXJ0eSBkZXRlcm1pbmVzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCB3aWxsIGJlIHJlbmRlcmVkLiBUaGUgPGNvZGU+dmlld01vZGVsPC9jb2RlPiB3aWxsIGJlIGV4dGVuZGVkIGJ5IDxhIGhyZWY9XFxcIiMtb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLVxcXCI+dGhlIGRlZmF1bHQgdmlldyBtb2RlbDwvYT4sIGFuZCBpdCBtYXkgYWxzbyBvdmVycmlkZSB0aGUgZGVmYXVsdCA8Y29kZT5hY3Rpb248L2NvZGU+IGJ5IHNldHRpbmcgPGNvZGU+dmlld01vZGVsLm1vZGVsLmFjdGlvbjwvY29kZT4uPC9wPlxcbjxwPlRoZSA8Y29kZT5yZXE8L2NvZGU+LCA8Y29kZT5yZXM8L2NvZGU+LCBhbmQgPGNvZGU+bmV4dDwvY29kZT4gYXJndW1lbnRzIGFyZSBleHBlY3RlZCB0byBiZSB0aGUgRXhwcmVzcyByb3V0aW5nIGFyZ3VtZW50cywgYnV0IHRoZXkgY2FuIGFsc28gYmUgbW9ja2VkIDxlbT4od2hpY2ggaXMgaW4gZmFjdCB3aGF0IHRoZSBIYXBpIHBsdWdpbiBkb2VzKTwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS1cXFwiPjxjb2RlPnRhdW51cy5yZWJ1aWxkRGVmYXVsdFZpZXdNb2RlbChkb25lPyk8L2NvZGU+PC9oMj5cXG48cD5PbmNlIFRhdW51cyBoYXMgYmVlbiBtb3VudGVkLCBjYWxsaW5nIHRoaXMgbWV0aG9kIHdpbGwgcmVidWlsZCB0aGUgdmlldyBtb2RlbCBkZWZhdWx0cyB1c2luZyB0aGUgPGNvZGU+Z2V0RGVmYXVsdFZpZXdNb2RlbDwvY29kZT4gdGhhdCB3YXMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gaW4gdGhlIG9wdGlvbnMuIEFuIG9wdGlvbmFsIDxjb2RlPmRvbmU8L2NvZGU+IGNhbGxiYWNrIHdpbGwgYmUgaW52b2tlZCB3aGVuIHRoZSBtb2RlbCBpcyByZWJ1aWx0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImh0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgRnJhbWV3b3JrIFBsdWdpbnM8L2gxPlxcbjxwPlRoZXJlJiMzOTtzIGN1cnJlbnRseSB0d28gZGlmZmVyZW50IEhUVFAgZnJhbWV3b3JrcyA8ZW0+KDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBhbmQgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+KTwvZW0+IHRoYXQgeW91IGNhbiByZWFkaWx5IHVzZSB3aXRoIFRhdW51cyB3aXRob3V0IGhhdmluZyB0byBkZWFsIHdpdGggYW55IG9mIHRoZSByb3V0ZSBwbHVtYmluZyB5b3Vyc2VsZi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCJ1c2luZy10YXVudXMtZXhwcmVzcy1cXFwiPlVzaW5nIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPjwvaDI+XFxuPHA+VGhlIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiBwbHVnaW4gaXMgcHJvYmFibHkgdGhlIGVhc2llc3QgdG8gdXNlLCBhcyBUYXVudXMgd2FzIG9yaWdpbmFsbHkgZGV2ZWxvcGVkIHdpdGgganVzdCA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gaW4gbWluZC4gSW4gYWRkaXRpb24gdG8gdGhlIG9wdGlvbnMgYWxyZWFkeSBvdXRsaW5lZCBmb3IgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPnRhdW51cy5tb3VudDwvYT4sIHlvdSBjYW4gYWRkIG1pZGRsZXdhcmUgZm9yIGFueSByb3V0ZSBpbmRpdmlkdWFsbHkuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+bWlkZGxld2FyZTwvY29kZT4gYXJlIGFueSBtZXRob2RzIHlvdSB3YW50IFRhdW51cyB0byBleGVjdXRlIGFzIG1pZGRsZXdhcmUgaW4gRXhwcmVzcyBhcHBsaWNhdGlvbnM8L2xpPlxcbjwvdWw+XFxuPHA+VG8gZ2V0IDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIHByb3ZpZGVkIHRoYXQgeW91IGNvbWUgdXAgd2l0aCBhbiA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIC8vIC4uLlxcbn07XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBtZXRob2Qgd2lsbCBtZXJlbHkgc2V0IHVwIFRhdW51cyBhbmQgYWRkIHRoZSByZWxldmFudCByb3V0ZXMgdG8geW91ciBFeHByZXNzIGFwcGxpY2F0aW9uIGJ5IGNhbGxpbmcgPGNvZGU+YXBwLmdldDwvY29kZT4gYSBidW5jaCBvZiB0aW1lcy4gWW91IGNhbiA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxcIj5maW5kIHRhdW51cy1leHByZXNzIG9uIEdpdEh1YjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwidXNpbmctdGF1bnVzLWhhcGktXFxcIj5Vc2luZyA8Y29kZT50YXVudXMtaGFwaTwvY29kZT48L2gyPlxcbjxwPlRoZSA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4gcGx1Z2luIGlzIGEgYml0IG1vcmUgaW52b2x2ZWQsIGFuZCB5b3UmIzM5O2xsIGhhdmUgdG8gY3JlYXRlIGEgUGFjayBpbiBvcmRlciB0byB1c2UgaXQuIEluIGFkZGl0aW9uIHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj50aGUgb3B0aW9ucyB3ZSYjMzk7dmUgYWxyZWFkeSBjb3ZlcmVkPC9hPiwgeW91IGNhbiBhZGQgPGNvZGU+Y29uZmlnPC9jb2RlPiBvbiBhbnkgcm91dGUuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+Y29uZmlnPC9jb2RlPiBpcyBwYXNzZWQgZGlyZWN0bHkgaW50byB0aGUgcm91dGUgcmVnaXN0ZXJlZCB3aXRoIEhhcGksIGdpdmluZyB5b3UgdGhlIG1vc3QgZmxleGliaWxpdHk8L2xpPlxcbjwvdWw+XFxuPHA+VG8gZ2V0IDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPiBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIGFuZCB5b3UgY2FuIGJyaW5nIHlvdXIgb3duIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+dmFyIEhhcGkgPSByZXF1aXJlKCYjMzk7aGFwaSYjMzk7KTtcXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzSGFwaSA9IHJlcXVpcmUoJiMzOTt0YXVudXMtaGFwaSYjMzk7KSh0YXVudXMpO1xcbnZhciBwYWNrID0gbmV3IEhhcGkuUGFjaygpO1xcblxcbnBhY2sucmVnaXN0ZXIoe1xcbiAgcGx1Z2luOiB0YXVudXNIYXBpLFxcbiAgb3B0aW9uczoge1xcbiAgICAvLyAuLi5cXG4gIH1cXG59KTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPnRhdW51c0hhcGk8L2NvZGU+IHBsdWdpbiB3aWxsIG1vdW50IFRhdW51cyBhbmQgcmVnaXN0ZXIgYWxsIG9mIHRoZSBuZWNlc3Nhcnkgcm91dGVzLiBZb3UgY2FuIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPmZpbmQgdGF1bnVzLWhhcGkgb24gR2l0SHViPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJjb21tYW5kLWxpbmUtaW50ZXJmYWNlXFxcIj5Db21tYW5kLUxpbmUgSW50ZXJmYWNlPC9oMT5cXG48cD5PbmNlIHlvdSYjMzk7dmUgc2V0IHVwIHRoZSBzZXJ2ZXItc2lkZSB0byByZW5kZXIgeW91ciB2aWV3cyB1c2luZyBUYXVudXMsIGl0JiMzOTtzIG9ubHkgbG9naWNhbCB0aGF0IHlvdSYjMzk7bGwgd2FudCB0byByZW5kZXIgdGhlIHZpZXdzIGluIHRoZSBjbGllbnQtc2lkZSBhcyB3ZWxsLCBlZmZlY3RpdmVseSBjb252ZXJ0aW5nIHlvdXIgYXBwbGljYXRpb24gaW50byBhIHNpbmdsZS1wYWdlIGFwcGxpY2F0aW9uIGFmdGVyIHRoZSBmaXJzdCB2aWV3IGhhcyBiZWVuIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS48L3A+XFxuPHA+VGhlIFRhdW51cyBDTEkgaXMgYW4gdXNlZnVsIGludGVybWVkaWFyeSBpbiB0aGUgcHJvY2VzcyBvZiBnZXR0aW5nIHRoZSBjb25maWd1cmF0aW9uIHlvdSB3cm90ZSBzbyBmYXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSB0byBhbHNvIHdvcmsgd2VsbCBpbiB0aGUgY2xpZW50LXNpZGUuPC9wPlxcbjxwPkluc3RhbGwgaXQgZ2xvYmFsbHkgZm9yIGRldmVsb3BtZW50LCBidXQgcmVtZW1iZXIgdG8gdXNlIGxvY2FsIGNvcGllcyBmb3IgcHJvZHVjdGlvbi1ncmFkZSB1c2VzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtZyB0YXVudXNcXG48L2NvZGU+PC9wcmU+XFxuPHA+V2hlbiBpbnZva2VkIHdpdGhvdXQgYW55IGFyZ3VtZW50cywgdGhlIENMSSB3aWxsIHNpbXBseSBmb2xsb3cgdGhlIGRlZmF1bHQgY29udmVudGlvbnMgdG8gZmluZCB5b3VyIHJvdXRlIGRlZmluaXRpb25zLCB2aWV3cywgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXNcXG48L2NvZGU+PC9wcmU+XFxuPHA+QnkgZGVmYXVsdCwgdGhlIG91dHB1dCB3aWxsIGJlIHByaW50ZWQgdG8gdGhlIHN0YW5kYXJkIG91dHB1dCwgbWFraW5nIGZvciBhIGZhc3QgZGVidWdnaW5nIGV4cGVyaWVuY2UuIEhlcmUmIzM5O3MgdGhlIG91dHB1dCBpZiB5b3UganVzdCBoYWQgYSBzaW5nbGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gcm91dGUsIGFuZCB0aGUgbWF0Y2hpbmcgdmlldyBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlciBleGlzdGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGVtcGxhdGVzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuL3ZpZXdzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciBjb250cm9sbGVycyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li4vY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciByb3V0ZXMgPSB7XFxuICAmIzM5Oy8mIzM5Ozoge1xcbiAgICBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7XFxuICB9XFxufTtcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IHtcXG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxcbiAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgcm91dGVzOiByb3V0ZXNcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5Zb3UgY2FuIHVzZSBhIGZldyBvcHRpb25zIHRvIGFsdGVyIHRoZSBvdXRjb21lIG9mIGludm9raW5nIDxjb2RlPnRhdW51czwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLW91dHB1dC1cXFwiPjxjb2RlPi0tb3V0cHV0PC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LW88L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5PdXRwdXQgaXMgd3JpdHRlbiB0byBhIGZpbGUgaW5zdGVhZCBvZiB0byBzdGFuZGFyZCBvdXRwdXQuIFRoZSBmaWxlIHBhdGggdXNlZCB3aWxsIGJlIHRoZSA8Y29kZT5jbGllbnRfd2lyaW5nPC9jb2RlPiBvcHRpb24gaW4gPGEgaHJlZj1cXFwiI3RoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+PGNvZGU+LnRhdW51c3JjPC9jb2RlPjwvYT4sIHdoaWNoIGRlZmF1bHRzIHRvIDxjb2RlPiYjMzk7LmJpbi93aXJpbmcuanMmIzM5OzwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXdhdGNoLVxcXCI+PGNvZGU+LS13YXRjaDwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi13PC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+V2hlbmV2ZXIgYSBzZXJ2ZXItc2lkZSByb3V0ZSBkZWZpbml0aW9uIGNoYW5nZXMsIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCBhZ2FpbiB0byBlaXRoZXIgc3RhbmRhcmQgb3V0cHV0IG9yIGEgZmlsZSwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IHdhcyB1c2VkLjwvcD5cXG48cD5UaGUgcHJvZ3JhbSB3b24mIzM5O3QgZXhpdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdHJhbnNmb3JtLW1vZHVsZS1cXFwiPjxjb2RlPi0tdHJhbnNmb3JtICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXQ8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5UaGlzIGZsYWcgYWxsb3dzIHlvdSB0byB0cmFuc2Zvcm0gc2VydmVyLXNpZGUgcm91dGVzIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSB1bmRlcnN0YW5kcy4gRXhwcmVzcyByb3V0ZXMgYXJlIGNvbXBsZXRlbHkgY29tcGF0aWJsZSB3aXRoIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIsIGJ1dCBIYXBpIHJvdXRlcyBuZWVkIHRvIGJlIHRyYW5zZm9ybWVkIHVzaW5nIHRoZSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2hhcGlpZnlcXFwiPjxjb2RlPmhhcGlpZnk8L2NvZGU+PC9hPiBtb2R1bGUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIGhhcGlpZnlcXG50YXVudXMgLXQgaGFwaWlmeVxcbjwvY29kZT48L3ByZT5cXG48cD5Vc2luZyB0aGlzIHRyYW5zZm9ybSByZWxpZXZlcyB5b3UgZnJvbSBoYXZpbmcgdG8gZGVmaW5lIHRoZSBzYW1lIHJvdXRlcyB0d2ljZSB1c2luZyBzbGlnaHRseSBkaWZmZXJlbnQgZm9ybWF0cyB0aGF0IGNvbnZleSB0aGUgc2FtZSBtZWFuaW5nLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi1yZXNvbHZlcnMtbW9kdWxlLVxcXCI+PGNvZGU+LS1yZXNvbHZlcnMgJmx0O21vZHVsZSZndDs8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tcjwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPlNpbWlsYXJseSB0byB0aGUgPGEgaHJlZj1cXFwiIy1vcHRpb25zLXJlc29sdmVycy1cXFwiPjxjb2RlPnJlc29sdmVyczwvY29kZT48L2E+IG9wdGlvbiB0aGF0IHlvdSBjYW4gcGFzcyB0byA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvYT4sIHRoZXNlIHJlc29sdmVycyBjYW4gY2hhbmdlIHRoZSB3YXkgaW4gd2hpY2ggZmlsZSBwYXRocyBhcmUgcmVzb2x2ZWQuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5TaWduYXR1cmU8L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPmdldENsaWVudENvbnRyb2xsZXIoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byBjbGllbnQtc2lkZSBjb250cm9sbGVyIGFjdGlvbiBoYW5kbGVyIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPmdldFZpZXcoYWN0aW9uKTwvY29kZT48L3RkPlxcbjx0ZD5SZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZTwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItc3RhbmRhbG9uZS1cXFwiPjxjb2RlPi0tc3RhbmRhbG9uZTwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1zPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+VW5kZXIgdGhpcyBleHBlcmltZW50YWwgZmxhZywgdGhlIENMSSB3aWxsIHVzZSBCcm93c2VyaWZ5IHRvIGNvbXBpbGUgYSBzdGFuZGFsb25lIG1vZHVsZSB0aGF0IGluY2x1ZGVzIHRoZSB3aXJpbmcgbm9ybWFsbHkgZXhwb3J0ZWQgYnkgdGhlIENMSSBwbHVzIGFsbCBvZiBUYXVudXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3VtZGpzL3VtZFxcXCI+YXMgYSBVTUQgbW9kdWxlPC9hPi48L3A+XFxuPHA+VGhpcyB3b3VsZCBhbGxvdyB5b3UgdG8gdXNlIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgZXZlbiBpZiB5b3UgZG9uJiMzOTt0IHdhbnQgdG8gdXNlIDxhIGhyZWY9XFxcImh0dHA6Ly9icm93c2VyaWZ5Lm9yZ1xcXCI+QnJvd3NlcmlmeTwvYT4gZGlyZWN0bHkuPC9wPlxcbjxwPkZlZWRiYWNrIGFuZCBzdWdnZXN0aW9ucyBhYm91dCB0aGlzIGZsYWcsIDxlbT5hbmQgcG9zc2libGUgYWx0ZXJuYXRpdmVzIHRoYXQgd291bGQgbWFrZSBUYXVudXMgZWFzaWVyIHRvIHVzZTwvZW0+LCBhcmUgd2VsY29tZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJjbGllbnQtc2lkZS1hcGlcXFwiPkNsaWVudC1zaWRlIEFQSTwvaDE+XFxuPHA+SnVzdCBsaWtlIHRoZSBzZXJ2ZXItc2lkZSwgZXZlcnl0aGluZyBpbiB0aGUgY2xpZW50LXNpZGUgYmVnaW5zIGF0IHRoZSBtb3VudHBvaW50LiBPbmNlIHRoZSBhcHBsaWNhdGlvbiBpcyBtb3VudGVkLCBhbmNob3IgbGlua3Mgd2lsbCBiZSBoaWphY2tlZCBhbmQgdGhlIGNsaWVudC1zaWRlIHJvdXRlciB3aWxsIHRha2Ugb3ZlciB2aWV3IHJlbmRlcmluZy4gQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4ZWN1dGVkIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW1vdW50LWNvbnRhaW5lci13aXJpbmctb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucz8pPC9jb2RlPjwvaDI+XFxuPHA+VGhlIG1vdW50cG9pbnQgdGFrZXMgYSByb290IGNvbnRhaW5lciwgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBhbiBvcHRpb25zIHBhcmFtZXRlci4gVGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4gaXMgd2hlcmUgY2xpZW50LXNpZGUtcmVuZGVyZWQgdmlld3Mgd2lsbCBiZSBwbGFjZWQsIGJ5IHJlcGxhY2luZyB3aGF0ZXZlciBIVE1MIGNvbnRlbnRzIGFscmVhZHkgZXhpc3QuIFlvdSBjYW4gcGFzcyBpbiB0aGUgPGNvZGU+d2lyaW5nPC9jb2RlPiBtb2R1bGUgZXhhY3RseSBhcyBidWlsdCBieSB0aGUgQ0xJLCBhbmQgbm8gZnVydGhlciBjb25maWd1cmF0aW9uIGlzIG5lY2Vzc2FyeS48L3A+XFxuPHA+V2hlbiB0aGUgbW91bnRwb2ludCBleGVjdXRlcywgVGF1bnVzIHdpbGwgY29uZmlndXJlIGl0cyBpbnRlcm5hbCBzdGF0ZSwgPGVtPnNldCB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9lbT4sIHJ1biB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBmb3IgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcsIGFuZCBzdGFydCBoaWphY2tpbmcgbGlua3MuPC9wPlxcbjxwPkFzIGFuIGV4YW1wbGUsIGNvbnNpZGVyIGEgYnJvd3NlciBtYWtlcyBhIDxjb2RlPkdFVDwvY29kZT4gcmVxdWVzdCBmb3IgPGNvZGU+L2FydGljbGVzL3RoZS1mb3g8L2NvZGU+IGZvciB0aGUgZmlyc3QgdGltZS4gT25jZSA8Y29kZT50YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcpPC9jb2RlPiBpcyBpbnZva2VkIG9uIHRoZSBjbGllbnQtc2lkZSwgc2V2ZXJhbCB0aGluZ3Mgd291bGQgaGFwcGVuIGluIHRoZSBvcmRlciBsaXN0ZWQgYmVsb3cuPC9wPlxcbjx1bD5cXG48bGk+VGF1bnVzIHNldHMgdXAgdGhlIGNsaWVudC1zaWRlIHZpZXcgcm91dGluZyBlbmdpbmU8L2xpPlxcbjxsaT5JZiBlbmFibGVkIDxlbT4odmlhIDxjb2RlPm9wdGlvbnM8L2NvZGU+KTwvZW0+LCB0aGUgY2FjaGluZyBlbmdpbmUgaXMgY29uZmlndXJlZDwvbGk+XFxuPGxpPlRhdW51cyBvYnRhaW5zIHRoZSB2aWV3IG1vZGVsIDxlbT4obW9yZSBvbiB0aGlzIGxhdGVyKTwvZW0+PC9saT5cXG48bGk+V2hlbiBhIHZpZXcgbW9kZWwgaXMgb2J0YWluZWQsIHRoZSA8Y29kZT4mIzM5O3N0YXJ0JiMzOTs8L2NvZGU+IGV2ZW50IGlzIGVtaXR0ZWQ8L2xpPlxcbjxsaT5BbmNob3IgbGlua3Mgc3RhcnQgYmVpbmcgbW9uaXRvcmVkIGZvciBjbGlja3MgPGVtPihhdCB0aGlzIHBvaW50IHlvdXIgYXBwbGljYXRpb24gYmVjb21lcyBhIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvU2luZ2xlLXBhZ2VfYXBwbGljYXRpb25cXFwiPlNQQTwvYT4pPC9lbT48L2xpPlxcbjxsaT5UaGUgPGNvZGU+YXJ0aWNsZXMvYXJ0aWNsZTwvY29kZT4gY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBleGVjdXRlZDwvbGk+XFxuPC91bD5cXG48cD5UaGF0JiMzOTtzIHF1aXRlIGEgYml0IG9mIGZ1bmN0aW9uYWxpdHksIGJ1dCBpZiB5b3UgdGhpbmsgYWJvdXQgaXQsIG1vc3Qgb3RoZXIgZnJhbWV3b3JrcyBhbHNvIHJlbmRlciB0aGUgdmlldyBhdCB0aGlzIHBvaW50LCA8ZW0+cmF0aGVyIHRoYW4gb24gdGhlIHNlcnZlci1zaWRlITwvZW0+PC9wPlxcbjxwPkluIG9yZGVyIHRvIGJldHRlciB1bmRlcnN0YW5kIHRoZSBwcm9jZXNzLCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBwYXJhbWV0ZXIuPC9wPlxcbjxwPkZpcnN0IG9mZiwgdGhlIDxjb2RlPmJvb3RzdHJhcDwvY29kZT4gb3B0aW9uIGRldGVybWluZXMgdGhlIHN0cmF0ZWd5IHVzZWQgdG8gcHVsbCB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlcmUgYXJlIHRocmVlIHBvc3NpYmxlIHN0cmF0ZWdpZXMgYXZhaWxhYmxlOiA8Y29kZT5hdXRvPC9jb2RlPiA8ZW0+KHRoZSBkZWZhdWx0IHN0cmF0ZWd5KTwvZW0+LCA8Y29kZT5pbmxpbmU8L2NvZGU+LCBvciA8Y29kZT5tYW51YWw8L2NvZGU+LiBUaGUgPGNvZGU+YXV0bzwvY29kZT4gc3RyYXRlZ3kgaW52b2x2ZXMgdGhlIGxlYXN0IHdvcmssIHdoaWNoIGlzIHdoeSBpdCYjMzk7cyB0aGUgZGVmYXVsdC48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5hdXRvPC9jb2RlPiB3aWxsIG1ha2UgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbDwvbGk+XFxuPGxpPjxjb2RlPmlubGluZTwvY29kZT4gZXhwZWN0cyB5b3UgdG8gcGxhY2UgdGhlIG1vZGVsIGludG8gYSA8Y29kZT4mbHQ7c2NyaXB0IHR5cGU9JiMzOTt0ZXh0L3RhdW51cyYjMzk7Jmd0OzwvY29kZT4gdGFnPC9saT5cXG48bGk+PGNvZGU+bWFudWFsPC9jb2RlPiBleHBlY3RzIHlvdSB0byBnZXQgdGhlIHZpZXcgbW9kZWwgaG93ZXZlciB5b3Ugd2FudCB0bywgYW5kIHRoZW4gbGV0IFRhdW51cyBrbm93IHdoZW4gaXQmIzM5O3MgcmVhZHk8L2xpPlxcbjwvdWw+XFxuPHA+TGV0JiMzOTtzIGdvIGludG8gZGV0YWlsIGFib3V0IGVhY2ggb2YgdGhlc2Ugc3RyYXRlZ2llcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtYXV0by1zdHJhdGVneVxcXCI+VXNpbmcgdGhlIDxjb2RlPmF1dG88L2NvZGU+IHN0cmF0ZWd5PC9oND5cXG48cD5UaGUgPGNvZGU+YXV0bzwvY29kZT4gc3RyYXRlZ3kgbWVhbnMgdGhhdCBUYXVudXMgd2lsbCBtYWtlIHVzZSBvZiBhbiBBSkFYIHJlcXVlc3QgdG8gb2J0YWluIHRoZSB2aWV3IG1vZGVsLiA8ZW0+WW91IGRvbiYjMzk7dCBoYXZlIHRvIGRvIGFueXRoaW5nIGVsc2U8L2VtPiBhbmQgdGhpcyBpcyB0aGUgZGVmYXVsdCBzdHJhdGVneS4gVGhpcyBpcyB0aGUgPHN0cm9uZz5tb3N0IGNvbnZlbmllbnQgc3RyYXRlZ3ksIGJ1dCBhbHNvIHRoZSBzbG93ZXN0PC9zdHJvbmc+IG9uZS48L3A+XFxuPHA+SXQmIzM5O3Mgc2xvdyBiZWNhdXNlIHRoZSB2aWV3IG1vZGVsIHdvbiYjMzk7dCBiZSByZXF1ZXN0ZWQgdW50aWwgdGhlIGJ1bGsgb2YgeW91ciBKYXZhU2NyaXB0IGNvZGUgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBleGVjdXRlZCwgYW5kIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gaXMgaW52b2tlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtaW5saW5lLXN0cmF0ZWd5XFxcIj5Vc2luZyB0aGUgPGNvZGU+aW5saW5lPC9jb2RlPiBzdHJhdGVneTwvaDQ+XFxuPHA+VGhlIDxjb2RlPmlubGluZTwvY29kZT4gc3RyYXRlZ3kgZXhwZWN0cyB5b3UgdG8gYWRkIGEgPGNvZGU+ZGF0YS10YXVudXM8L2NvZGU+IGF0dHJpYnV0ZSBvbiB0aGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiBlbGVtZW50LiBUaGlzIGF0dHJpYnV0ZSBtdXN0IGJlIGVxdWFsIHRvIHRoZSA8Y29kZT5pZDwvY29kZT4gYXR0cmlidXRlIG9mIGEgPGNvZGU+Jmx0O3NjcmlwdCZndDs8L2NvZGU+IHRhZyBjb250YWluaW5nIHRoZSBzZXJpYWxpemVkIHZpZXcgbW9kZWwuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+ZGl2KGRhdGEtdGF1bnVzPSYjMzk7bW9kZWwmIzM5OykhPXBhcnRpYWxcXG5zY3JpcHQodHlwZT0mIzM5O3RleHQvdGF1bnVzJiMzOTssIGRhdGEtdGF1bnVzPSYjMzk7bW9kZWwmIzM5Oyk9SlNPTi5zdHJpbmdpZnkobW9kZWwpXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlBheSBzcGVjaWFsIGF0dGVudGlvbiB0byB0aGUgZmFjdCB0aGF0IHRoZSBtb2RlbCBpcyBub3Qgb25seSBtYWRlIGludG8gYSBKU09OIHN0cmluZywgPGVtPmJ1dCBhbHNvIEhUTUwgZW5jb2RlZCBieSBKYWRlPC9lbT4uIFdoZW4gVGF1bnVzIGV4dHJhY3RzIHRoZSBtb2RlbCBmcm9tIHRoZSA8Y29kZT4mbHQ7c2NyaXB0Jmd0OzwvY29kZT4gdGFnIGl0JiMzOTtsbCB1bmVzY2FwZSBpdCwgYW5kIHRoZW4gcGFyc2UgaXQgYXMgSlNPTi48L3A+XFxuPHA+VGhpcyBzdHJhdGVneSBpcyBhbHNvIGZhaXJseSBjb252ZW5pZW50IHRvIHNldCB1cCwgYnV0IGl0IGludm9sdmVzIGEgbGl0dGxlIG1vcmUgd29yay4gSXQgbWlnaHQgYmUgd29ydGh3aGlsZSB0byB1c2UgaW4gY2FzZXMgd2hlcmUgbW9kZWxzIGFyZSBzbWFsbCwgYnV0IGl0IHdpbGwgc2xvdyBkb3duIHNlcnZlci1zaWRlIHZpZXcgcmVuZGVyaW5nLCBhcyB0aGUgbW9kZWwgaXMgaW5saW5lZCBhbG9uZ3NpZGUgdGhlIEhUTUwuPC9wPlxcbjxwPlRoYXQgbWVhbnMgdGhhdCB0aGUgY29udGVudCB5b3UgYXJlIHN1cHBvc2VkIHRvIGJlIHByaW9yaXRpemluZyBpcyBnb2luZyB0byB0YWtlIGxvbmdlciB0byBnZXQgdG8geW91ciBodW1hbnMsIGJ1dCBvbmNlIHRoZXkgZ2V0IHRoZSBIVE1MLCB0aGlzIHN0cmF0ZWd5IHdpbGwgZXhlY3V0ZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBhbG1vc3QgaW1tZWRpYXRlbHkuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLW1hbnVhbC1zdHJhdGVneVxcXCI+VXNpbmcgdGhlIDxjb2RlPm1hbnVhbDwvY29kZT4gc3RyYXRlZ3k8L2g0PlxcbjxwPlRoZSA8Y29kZT5tYW51YWw8L2NvZGU+IHN0cmF0ZWd5IGlzIHRoZSBtb3N0IGludm9sdmVkIG9mIHRoZSB0aHJlZSwgYnV0IGFsc28gdGhlIG1vc3QgcGVyZm9ybWFudC4gSW4gdGhpcyBzdHJhdGVneSB5b3UmIzM5O3JlIHN1cHBvc2VkIHRvIGFkZCB0aGUgZm9sbG93aW5nIDxlbT4oc2VlbWluZ2x5IHBvaW50bGVzcyk8L2VtPiBzbmlwcGV0IG9mIGNvZGUgaW4gYSA8Y29kZT4mbHQ7c2NyaXB0Jmd0OzwvY29kZT4gb3RoZXIgdGhhbiB0aGUgb25lIHRoYXQmIzM5O3MgcHVsbGluZyBkb3duIFRhdW51cywgc28gdGhhdCB0aGV5IGFyZSBwdWxsZWQgY29uY3VycmVudGx5IHJhdGhlciB0aGFuIHNlcmlhbGx5LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj53aW5kb3cudGF1bnVzUmVhZHkgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHdpbmRvdy50YXVudXNSZWFkeSA9IG1vZGVsO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9uY2UgeW91IHNvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgaW52b2tlIDxjb2RlPnRhdW51c1JlYWR5KG1vZGVsKTwvY29kZT4uIENvbnNpZGVyaW5nIHlvdSYjMzk7bGwgYmUgcHVsbGluZyBib3RoIHRoZSB2aWV3IG1vZGVsIGFuZCBUYXVudXMgYXQgdGhlIHNhbWUgdGltZSwgYSBudW1iZXIgb2YgZGlmZmVyZW50IHNjZW5hcmlvcyBtYXkgcGxheSBvdXQuPC9wPlxcbjx1bD5cXG48bGk+VGhlIHZpZXcgbW9kZWwgaXMgbG9hZGVkIGZpcnN0LCB5b3UgY2FsbCA8Y29kZT50YXVudXNSZWFkeShtb2RlbCk8L2NvZGU+IGFuZCB3YWl0IGZvciBUYXVudXMgdG8gdGFrZSB0aGUgbW9kZWwgb2JqZWN0IGFuZCBib290IHRoZSBhcHBsaWNhdGlvbiBhcyBzb29uIGFzIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gaXMgZXhlY3V0ZWQ8L2xpPlxcbjxsaT5UYXVudXMgbG9hZHMgZmlyc3QgYW5kIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gaXMgY2FsbGVkIGZpcnN0LiBJbiB0aGlzIGNhc2UsIFRhdW51cyB3aWxsIHJlcGxhY2UgPGNvZGU+d2luZG93LnRhdW51c1JlYWR5PC9jb2RlPiB3aXRoIGEgc3BlY2lhbCA8Y29kZT5ib290PC9jb2RlPiBtZXRob2QuIFdoZW4gdGhlIHZpZXcgbW9kZWwgZmluaXNoZXMgbG9hZGluZywgeW91IGNhbGwgPGNvZGU+dGF1bnVzUmVhZHkobW9kZWwpPC9jb2RlPiBhbmQgdGhlIGFwcGxpY2F0aW9uIGZpbmlzaGVzIGJvb3Rpbmc8L2xpPlxcbjwvdWw+XFxuPGJsb2NrcXVvdGU+XFxuPHA+SWYgdGhpcyBzb3VuZHMgYSBsaXR0bGUgbWluZC1iZW5kaW5nIGl0JiMzOTtzIGJlY2F1c2UgaXQgaXMuIEl0JiMzOTtzIG5vdCBkZXNpZ25lZCB0byBiZSBwcmV0dHksIGJ1dCBtZXJlbHkgdG8gYmUgcGVyZm9ybWFudC48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPk5vdyB0aGF0IHdlJiMzOTt2ZSBhZGRyZXNzZWQgdGhlIGF3a3dhcmQgYml0cywgbGV0JiMzOTtzIGNvdmVyIHRoZSA8ZW0+JnF1b3Q7c29tZWhvdyBnZXQgeW91ciBoYW5kcyBvbiB0aGUgdmlldyBtb2RlbCZxdW90OzwvZW0+IGFzcGVjdC4gTXkgcHJlZmVycmVkIG1ldGhvZCBpcyB1c2luZyBKU09OUCwgYXMgaXQmIzM5O3MgYWJsZSB0byBkZWxpdmVyIHRoZSBzbWFsbGVzdCBzbmlwcGV0IHBvc3NpYmxlLCBhbmQgaXQgY2FuIHRha2UgYWR2YW50YWdlIG9mIHNlcnZlci1zaWRlIGNhY2hpbmcuIENvbnNpZGVyaW5nIHlvdSYjMzk7bGwgcHJvYmFibHkgd2FudCB0aGlzIHRvIGJlIGFuIGlubGluZSBzY3JpcHQsIGtlZXBpbmcgaXQgc21hbGwgaXMgaW1wb3J0YW50LjwvcD5cXG48cD5UaGUgZ29vZCBuZXdzIGlzIHRoYXQgdGhlIHNlcnZlci1zaWRlIHN1cHBvcnRzIEpTT05QIG91dCB0aGUgYm94LiBIZXJlJiMzOTtzIGEgc25pcHBldCBvZiBjb2RlIHlvdSBjb3VsZCB1c2UgdG8gcHVsbCBkb3duIHRoZSB2aWV3IG1vZGVsIGFuZCBib290IFRhdW51cyB1cCBhcyBzb29uIGFzIGJvdGggb3BlcmF0aW9ucyBhcmUgcmVhZHkuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPmZ1bmN0aW9uIGluamVjdCAodXJsKSB7XFxuICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgmIzM5O3NjcmlwdCYjMzk7KTtcXG4gIHNjcmlwdC5zcmMgPSB1cmw7XFxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNjcmlwdCk7XFxufVxcblxcbmZ1bmN0aW9uIGluamVjdG9yICgpIHtcXG4gIHZhciBzZWFyY2ggPSBsb2NhdGlvbi5zZWFyY2g7XFxuICB2YXIgc2VhcmNoUXVlcnkgPSBzZWFyY2ggPyAmIzM5OyZhbXA7JiMzOTsgKyBzZWFyY2guc3Vic3RyKDEpIDogJiMzOTsmIzM5OztcXG4gIHZhciBzZWFyY2hKc29uID0gJiMzOTs/anNvbiZhbXA7Y2FsbGJhY2s9dGF1bnVzUmVhZHkmIzM5OyArIHNlYXJjaFF1ZXJ5O1xcbiAgaW5qZWN0KGxvY2F0aW9uLnBhdGhuYW1lICsgc2VhcmNoSnNvbik7XFxufVxcblxcbndpbmRvdy50YXVudXNSZWFkeSA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxufTtcXG5cXG5pbmplY3RvcigpO1xcbjwvY29kZT48L3ByZT5cXG48cD5BcyBtZW50aW9uZWQgZWFybGllciwgdGhpcyBhcHByb2FjaCBpbnZvbHZlcyBnZXR0aW5nIHlvdXIgaGFuZHMgZGlydGllciBidXQgaXQgcGF5cyBvZmYgYnkgYmVpbmcgdGhlIGZhc3Rlc3Qgb2YgdGhlIHRocmVlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNhY2hpbmdcXFwiPkNhY2hpbmc8L2g0PlxcbjxwPlRoZSBjbGllbnQtc2lkZSBpbiBUYXVudXMgc3VwcG9ydHMgY2FjaGluZyBpbi1tZW1vcnkgYW5kIHVzaW5nIHRoZSBlbWJlZGRlZCBJbmRleGVkREIgc3lzdGVtIGJ5IG1lcmVseSB0dXJuaW5nIG9uIHRoZSA8Y29kZT5jYWNoZTwvY29kZT4gZmxhZyBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBvbiB0aGUgY2xpZW50LXNpZGUuPC9wPlxcbjxwPklmIHlvdSBzZXQgPGNvZGU+Y2FjaGU8L2NvZGU+IHRvIDxjb2RlPnRydWU8L2NvZGU+IHRoZW4gY2FjaGVkIGl0ZW1zIHdpbGwgYmUgY29uc2lkZXJlZCA8ZW0+JnF1b3Q7ZnJlc2gmcXVvdDsgKHZhbGlkIGNvcGllcyBvZiB0aGUgb3JpZ2luYWwpPC9lbT4gZm9yIDxzdHJvbmc+MTUgc2Vjb25kczwvc3Ryb25nPi4gWW91IGNhbiBhbHNvIHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gYSBudW1iZXIsIGFuZCB0aGF0IG51bWJlciBvZiBzZWNvbmRzIHdpbGwgYmUgdXNlZCBhcyB0aGUgZGVmYXVsdCBpbnN0ZWFkLjwvcD5cXG48cD5DYWNoaW5nIGNhbiBhbHNvIGJlIHR3ZWFrZWQgb24gaW5kaXZpZHVhbCByb3V0ZXMuIEZvciBpbnN0YW5jZSwgeW91IGNvdWxkIHNldCA8Y29kZT57IGNhY2hlOiB0cnVlIH08L2NvZGU+IHdoZW4gbW91bnRpbmcgVGF1bnVzIGFuZCB0aGVuIGhhdmUgPGNvZGU+eyBjYWNoZTogMzYwMCB9PC9jb2RlPiBvbiBhIHJvdXRlIHRoYXQgeW91IHdhbnQgdG8gY2FjaGUgZm9yIGEgbG9uZ2VyIHBlcmlvZCBvZiB0aW1lLjwvcD5cXG48cD5UaGUgY2FjaGluZyBsYXllciBpcyA8ZW0+c2VhbWxlc3NseSBpbnRlZ3JhdGVkPC9lbT4gaW50byBUYXVudXMsIG1lYW5pbmcgdGhhdCBhbnkgdmlld3MgcmVuZGVyZWQgYnkgVGF1bnVzIHdpbGwgYmUgY2FjaGVkIGFjY29yZGluZyB0byB0aGVzZSBjYWNoaW5nIHJ1bGVzLiBLZWVwIGluIG1pbmQsIGhvd2V2ZXIsIHRoYXQgcGVyc2lzdGVuY2UgYXQgdGhlIGNsaWVudC1zaWRlIGNhY2hpbmcgbGF5ZXIgd2lsbCBvbmx5IGJlIHBvc3NpYmxlIGluIDxhIGhyZWY9XFxcImh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXFwiPmJyb3dzZXJzIHRoYXQgc3VwcG9ydCBJbmRleGVkREI8L2E+LiBJbiB0aGUgY2FzZSBvZiBicm93c2VycyB0aGF0IGRvbiYjMzk7dCBzdXBwb3J0IEluZGV4ZWREQiwgVGF1bnVzIHdpbGwgdXNlIGFuIGluLW1lbW9yeSBjYWNoZSwgd2hpY2ggd2lsbCBiZSB3aXBlZCBvdXQgd2hlbmV2ZXIgdGhlIGh1bWFuIGRlY2lkZXMgdG8gY2xvc2UgdGhlIHRhYiBpbiB0aGVpciBicm93c2VyLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInByZWZldGNoaW5nXFxcIj5QcmVmZXRjaGluZzwvaDQ+XFxuPHA+SWYgY2FjaGluZyBpcyBlbmFibGVkLCB0aGUgbmV4dCBsb2dpY2FsIHN0ZXAgaXMgcHJlZmV0Y2hpbmcuIFRoaXMgaXMgZW5hYmxlZCBqdXN0IGJ5IGFkZGluZyA8Y29kZT5wcmVmZXRjaDogdHJ1ZTwvY29kZT4gdG8gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uIFRoZSBwcmVmZXRjaGluZyBmZWF0dXJlIHdpbGwgZmlyZSBmb3IgYW55IGFuY2hvciBsaW5rIHRoYXQmIzM5O3MgdHJpcHMgb3ZlciBhIDxjb2RlPm1vdXNlb3ZlcjwvY29kZT4gb3IgYSA8Y29kZT50b3VjaHN0YXJ0PC9jb2RlPiBldmVudC4gSWYgYSByb3V0ZSBtYXRjaGVzIHRoZSBVUkwgaW4gdGhlIDxjb2RlPmhyZWY8L2NvZGU+LCBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBwcmVmZXRjaCB0aGUgdmlldyBhbmQgY2FjaGUgaXRzIGNvbnRlbnRzLCBpbXByb3ZpbmcgcGVyY2VpdmVkIHBlcmZvcm1hbmNlLjwvcD5cXG48cD5XaGVuIGxpbmtzIGFyZSBjbGlja2VkIGJlZm9yZSBwcmVmZXRjaGluZyBmaW5pc2hlcywgdGhleSYjMzk7bGwgd2FpdCBvbiB0aGUgcHJlZmV0Y2hlciB0byBmaW5pc2ggYmVmb3JlIGltbWVkaWF0ZWx5IHN3aXRjaGluZyB0byB0aGUgdmlldywgZWZmZWN0aXZlbHkgY3V0dGluZyBkb3duIHRoZSByZXNwb25zZSB0aW1lLiBJZiB0aGUgbGluayB3YXMgYWxyZWFkeSBwcmVmZXRjaGVkIG9yIG90aGVyd2lzZSBjYWNoZWQsIHRoZSB2aWV3IHdpbGwgYmUgbG9hZGVkIGltbWVkaWF0ZWx5LiBJZiB0aGUgaHVtYW4gaG92ZXJzIG92ZXIgYSBsaW5rIGFuZCBhbm90aGVyIG9uZSB3YXMgYWxyZWFkeSBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoYXQgb25lIGlzIGFib3J0ZWQuIFRoaXMgcHJldmVudHMgcHJlZmV0Y2hpbmcgZnJvbSBkcmFpbmluZyB0aGUgYmFuZHdpZHRoIG9uIGNsaWVudHMgd2l0aCBsaW1pdGVkIG9yIGludGVybWl0dGVudCBjb25uZWN0aXZpdHkuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vbi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uKHR5cGUsIGZuKTwvY29kZT48L2gyPlxcbjxwPlRhdW51cyBlbWl0cyBhIHNlcmllcyBvZiBldmVudHMgZHVyaW5nIGl0cyBsaWZlY3ljbGUsIGFuZCA8Y29kZT50YXVudXMub248L2NvZGU+IGlzIHRoZSB3YXkgeW91IGNhbiB0dW5lIGluIGFuZCBsaXN0ZW4gZm9yIHRoZXNlIGV2ZW50cyB1c2luZyBhIHN1YnNjcmlwdGlvbiBmdW5jdGlvbiA8Y29kZT5mbjwvY29kZT4uPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5FdmVudDwvdGg+XFxuPHRoPkFyZ3VtZW50czwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5zdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZG9uZSYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBkYXRhPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5hYm9ydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5lcnJvciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBlcnI8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtb25jZS10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uY2UodHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgaXMgZXF1aXZhbGVudCB0byA8YSBocmVmPVxcXCIjLXRhdW51cy1vbi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uPC9jb2RlPjwvYT4sIGV4Y2VwdCB0aGUgZXZlbnQgbGlzdGVuZXJzIHdpbGwgYmUgdXNlZCBvbmNlIGFuZCB0aGVuIGl0JiMzOTtsbCBiZSBkaXNjYXJkZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vZmYtdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vZmYodHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VXNpbmcgdGhpcyBtZXRob2QgeW91IGNhbiByZW1vdmUgYW55IGV2ZW50IGxpc3RlbmVycyB0aGF0IHdlcmUgcHJldmlvdXNseSBhZGRlZCB1c2luZyA8Y29kZT4ub248L2NvZGU+IG9yIDxjb2RlPi5vbmNlPC9jb2RlPi4gWW91IG11c3QgcHJvdmlkZSB0aGUgdHlwZSBvZiBldmVudCB5b3Ugd2FudCB0byByZW1vdmUgYW5kIGEgcmVmZXJlbmNlIHRvIHRoZSBldmVudCBsaXN0ZW5lciBmdW5jdGlvbiB0aGF0IHdhcyBvcmlnaW5hbGx5IHVzZWQgd2hlbiBjYWxsaW5nIDxjb2RlPi5vbjwvY29kZT4gb3IgPGNvZGU+Lm9uY2U8L2NvZGU+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtaW50ZXJjZXB0LWFjdGlvbi1mbi1cXFwiPjxjb2RlPnRhdW51cy5pbnRlcmNlcHQoYWN0aW9uPywgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBtZXRob2QgY2FuIGJlIHVzZWQgdG8gYW50aWNpcGF0ZSBtb2RlbCByZXF1ZXN0cywgYmVmb3JlIHRoZXkgZXZlciBtYWtlIGl0IGludG8gWEhSIHJlcXVlc3RzLiBZb3UgY2FuIGFkZCBpbnRlcmNlcHRvcnMgZm9yIHNwZWNpZmljIGFjdGlvbnMsIHdoaWNoIHdvdWxkIGJlIHRyaWdnZXJlZCBvbmx5IGlmIHRoZSByZXF1ZXN0IG1hdGNoZXMgdGhlIHNwZWNpZmllZCA8Y29kZT5hY3Rpb248L2NvZGU+LiBZb3UgY2FuIGFsc28gYWRkIGdsb2JhbCBpbnRlcmNlcHRvcnMgYnkgb21pdHRpbmcgdGhlIDxjb2RlPmFjdGlvbjwvY29kZT4gcGFyYW1ldGVyLCBvciBzZXR0aW5nIGl0IHRvIDxjb2RlPio8L2NvZGU+LjwvcD5cXG48cD5BbiBpbnRlcmNlcHRvciBmdW5jdGlvbiB3aWxsIHJlY2VpdmUgYW4gPGNvZGU+ZXZlbnQ8L2NvZGU+IHBhcmFtZXRlciwgY29udGFpbmluZyBhIGZldyBkaWZmZXJlbnQgcHJvcGVydGllcy48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT51cmw8L2NvZGU+IGNvbnRhaW5zIHRoZSBVUkwgdGhhdCBuZWVkcyBhIHZpZXcgbW9kZWw8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZTwvY29kZT4gY29udGFpbnMgdGhlIGZ1bGwgcm91dGUgb2JqZWN0IGFzIHlvdSYjMzk7ZCBnZXQgZnJvbSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMucm91dGUodXJsKTwvY29kZT48L2E+PC9saT5cXG48bGk+PGNvZGU+cGFydHM8L2NvZGU+IGlzIGp1c3QgYSBzaG9ydGN1dCBmb3IgPGNvZGU+cm91dGUucGFydHM8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+cHJldmVudERlZmF1bHQobW9kZWwpPC9jb2RlPiBhbGxvd3MgeW91IHRvIHN1cHByZXNzIHRoZSBuZWVkIGZvciBhbiBBSkFYIHJlcXVlc3QsIGNvbW1hbmRpbmcgVGF1bnVzIHRvIHVzZSB0aGUgbW9kZWwgeW91JiMzOTt2ZSBwcm92aWRlZCBpbnN0ZWFkPC9saT5cXG48bGk+PGNvZGU+ZGVmYXVsdFByZXZlbnRlZDwvY29kZT4gdGVsbHMgeW91IGlmIHNvbWUgb3RoZXIgaGFuZGxlciBoYXMgcHJldmVudGVkIHRoZSBkZWZhdWx0IGJlaGF2aW9yPC9saT5cXG48bGk+PGNvZGU+Y2FuUHJldmVudERlZmF1bHQ8L2NvZGU+IHRlbGxzIHlvdSBpZiBpbnZva2luZyA8Y29kZT5ldmVudC5wcmV2ZW50RGVmYXVsdDwvY29kZT4gd2lsbCBoYXZlIGFueSBlZmZlY3Q8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gc3RhcnRzIGFzIDxjb2RlPm51bGw8L2NvZGU+LCBhbmQgaXQgY2FuIGxhdGVyIGJlY29tZSB0aGUgbW9kZWwgcGFzc2VkIHRvIDxjb2RlPnByZXZlbnREZWZhdWx0PC9jb2RlPjwvbGk+XFxuPC91bD5cXG48cD5JbnRlcmNlcHRvcnMgYXJlIGFzeW5jaHJvbm91cywgYnV0IGlmIGFuIGludGVyY2VwdG9yIHNwZW5kcyBsb25nZXIgdGhhbiAyMDBtcyBpdCYjMzk7bGwgYmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBjYWxsaW5nIDxjb2RlPmV2ZW50LnByZXZlbnREZWZhdWx0PC9jb2RlPiBwYXN0IHRoYXQgcG9pbnQgd29uJiMzOTt0IGhhdmUgYW55IGVmZmVjdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLXBhcnRpYWwtY29udGFpbmVyLWFjdGlvbi1tb2RlbC1cXFwiPjxjb2RlPnRhdW51cy5wYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBwcm92aWRlcyB5b3Ugd2l0aCBhY2Nlc3MgdG8gdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBUYXVudXMuIFlvdSBjYW4gdXNlIGl0IHRvIHJlbmRlciB0aGUgPGNvZGU+YWN0aW9uPC9jb2RlPiB2aWV3IGludG8gdGhlIDxjb2RlPmNvbnRhaW5lcjwvY29kZT4gRE9NIGVsZW1lbnQsIHVzaW5nIHRoZSBzcGVjaWZpZWQgPGNvZGU+bW9kZWw8L2NvZGU+LiBPbmNlIHRoZSB2aWV3IGlzIHJlbmRlcmVkLCB0aGUgPGNvZGU+cmVuZGVyPC9jb2RlPiBldmVudCB3aWxsIGJlIGZpcmVkIDxlbT4od2l0aCA8Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPiBhcyBhcmd1bWVudHMpPC9lbT4gYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGF0IHZpZXcgd2lsbCBiZSBleGVjdXRlZC48L3A+XFxuPHA+V2hpbGUgPGNvZGU+dGF1bnVzLnBhcnRpYWw8L2NvZGU+IHRha2VzIGEgPGNvZGU+cm91dGU8L2NvZGU+IGFzIHRoZSBmb3VydGggcGFyYW1ldGVyLCB5b3Ugc2hvdWxkIG9taXQgdGhhdCBzaW5jZSBpdCYjMzk7cyB1c2VkIGZvciBpbnRlcm5hbCBwdXJwb3NlcyBvbmx5LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbmF2aWdhdGUtdXJsLVxcXCI+PGNvZGU+dGF1bnVzLm5hdmlnYXRlKHVybCk8L2NvZGU+PC9oMj5cXG48cD5XaGVuZXZlciB5b3Ugd2FudCB0byBuYXZpZ2F0ZSB0byBhIFVSTCwgc2F5IHdoZW4gYW4gQUpBWCBjYWxsIGZpbmlzaGVzIGFmdGVyIGEgYnV0dG9uIGNsaWNrLCB5b3UgY2FuIHVzZSA8Y29kZT50YXVudXMubmF2aWdhdGU8L2NvZGU+IHBhc3NpbmcgaXQgYSBwbGFpbiBVUkwuPC9wPlxcbjxwPklmIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZSh1cmwpPC9jb2RlPiBpcyBjYWxsZWQgd2l0aCBhbiA8Y29kZT51cmw8L2NvZGU+IHRoYXQgZG9lc24mIzM5O3QgbWF0Y2ggYW55IGNsaWVudC1zaWRlIHJvdXRlLCB0aGVuIHRoZSB1c2VyIHdpbGwgYmUgcmVkaXJlY3RlZCB2aWEgPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMucm91dGUodXJsKTwvY29kZT48L2gyPlxcbjxwPlRoaXMgY29udmVuaWVuY2UgbWV0aG9kIGFsbG93cyB5b3UgdG8gYnJlYWsgZG93biBhIFVSTCBpbnRvIGl0cyBpbmRpdmlkdWFsIGNvbXBvbmVudHMuIFRoaXMgbWV0aG9kIHNob3VsZG4mIzM5O3QgYmUgbmVlZGVkIGR1cmluZyBub3JtYWwgdXNhZ2Ugb2YgVGF1bnVzLCBidXQgaXQmIzM5O3MgdXNlZnVsIHdoZW4gZGVidWdnaW5nIHlvdXIgcm91dGluZyB0YWJsZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1zdGF0ZS1cXFwiPjxjb2RlPnRhdW51cy5zdGF0ZTwvY29kZT48L2gyPlxcbjxwPlRoaXMgaXMgYW4gaW50ZXJuYWwgc3RhdGUgdmFyaWFibGUsIGFuZCBpdCBjb250YWlucyBhIGxvdCBvZiB1c2VmdWwgZGVidWdnaW5nIGluZm9ybWF0aW9uLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmNvbnRhaW5lcjwvY29kZT4gaXMgdGhlIERPTSBlbGVtZW50IHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+Y29udHJvbGxlcnM8L2NvZGU+IGFyZSBhbGwgdGhlIGNvbnRyb2xsZXJzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+PGNvZGU+dGVtcGxhdGVzPC9jb2RlPiBhcmUgYWxsIHRoZSB0ZW1wbGF0ZXMsIGFzIGRlZmluZWQgaW4gdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IGFyZSBhbGwgdGhlIHJvdXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPjxjb2RlPnByZWZldGNoPC9jb2RlPiBleHBvc2VzIHdoZXRoZXIgcHJlZmV0Y2hpbmcgaXMgdHVybmVkIG9uPC9saT5cXG48bGk+PGNvZGU+Y2FjaGU8L2NvZGU+IGV4cG9zZXMgd2hldGhlciBjYWNoaW5nIGlzIGVuYWJsZWQ8L2xpPlxcbjxsaT48Y29kZT5tb2RlbDwvY29kZT4gaXMgYSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsIHVzZWQgdG8gcmVuZGVyIHRoZSBjdXJyZW50IHZpZXc8L2xpPlxcbjwvdWw+XFxuPHA+T2YgY291cnNlLCB5b3VyIG5vdCBzdXBwb3NlZCB0byBtZWRkbGUgd2l0aCBpdCwgc28gYmUgYSBnb29kIGNpdGl6ZW4gYW5kIGp1c3QgaW5zcGVjdCBpdHMgdmFsdWVzITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+VGhlIDxjb2RlPi50YXVudXNyYzwvY29kZT4gbWFuaWZlc3Q8L2gxPlxcbjxwPklmIHlvdSB3YW50IHRvIHVzZSB2YWx1ZXMgb3RoZXIgdGhhbiB0aGUgY29udmVudGlvbmFsIGRlZmF1bHRzIHNob3duIGluIHRoZSB0YWJsZSBiZWxvdywgdGhlbiB5b3Ugc2hvdWxkIGNyZWF0ZSBhIDxjb2RlPi50YXVudXNyYzwvY29kZT4gZmlsZS4gTm90ZSB0aGF0IHRoZSBkZWZhdWx0cyBuZWVkIHRvIGJlIG92ZXJ3cml0dGVuIGluIGEgY2FzZS1ieS1jYXNlIGJhc2lzLiBUaGVzZSBvcHRpb25zIGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgaW4geW91ciA8Y29kZT5wYWNrYWdlLmpzb248L2NvZGU+LCB1bmRlciB0aGUgPGNvZGU+dGF1bnVzPC9jb2RlPiBwcm9wZXJ0eS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc29uXFxcIj57XFxuICAmcXVvdDt2aWV3cyZxdW90OzogJnF1b3Q7LmJpbi92aWV3cyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9yb3V0ZXMmcXVvdDs6ICZxdW90O2NvbnRyb2xsZXJzL3JvdXRlcy5qcyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9jb250cm9sbGVycyZxdW90OzogJnF1b3Q7Y29udHJvbGxlcnMmcXVvdDssXFxuICAmcXVvdDtjbGllbnRfY29udHJvbGxlcnMmcXVvdDs6ICZxdW90O2NsaWVudC9qcy9jb250cm9sbGVycyZxdW90OyxcXG4gICZxdW90O2NsaWVudF93aXJpbmcmcXVvdDs6ICZxdW90Oy5iaW4vd2lyaW5nLmpzJnF1b3Q7XFxufVxcbjwvY29kZT48L3ByZT5cXG48dWw+XFxuPGxpPlRoZSA8Y29kZT52aWV3czwvY29kZT4gZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgdmlld3MgPGVtPihhbHJlYWR5IGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCk8L2VtPiBhcmUgcGxhY2VkLiBUaGVzZSB2aWV3cyBhcmUgdXNlZCBkaXJlY3RseSBvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9yb3V0ZXM8L2NvZGU+IGZpbGUgaXMgdGhlIG1vZHVsZSB3aGVyZSB5b3UgZXhwb3J0IGEgY29sbGVjdGlvbiBvZiByb3V0ZXMuIFRoZSBDTEkgd2lsbCBwdWxsIHRoZXNlIHJvdXRlcyB3aGVuIGNyZWF0aW5nIHRoZSBjbGllbnQtc2lkZSByb3V0ZXMgZm9yIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9jb250cm9sbGVyczwvY29kZT4gZGlyZWN0b3J5IGlzIHRoZSByb290IGRpcmVjdG9yeSB3aGVyZSB5b3VyIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGxpdmUuIEl0JiMzOTtzIHVzZWQgd2hlbiBzZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZSByb3V0ZXI8L2xpPlxcbjxsaT5UaGUgPGNvZGU+Y2xpZW50X2NvbnRyb2xsZXJzPC9jb2RlPiBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciBjbGllbnQtc2lkZSBjb250cm9sbGVyIG1vZHVsZXMgbGl2ZS4gVGhlIENMSSB3aWxsIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZXNlIGNvbnRyb2xsZXJzIGluIGl0cyByZXN1bHRpbmcgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPlRoZSA8Y29kZT5jbGllbnRfd2lyaW5nPC9jb2RlPiBmaWxlIGlzIHdoZXJlIHlvdXIgd2lyaW5nIG1vZHVsZSB3aWxsIGJlIHBsYWNlZCBieSB0aGUgQ0xJLiBZb3UmIzM5O2xsIHRoZW4gaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiBpdCBpbiB5b3VyIGFwcGxpY2F0aW9uIHdoZW4gYm9vdGluZyB1cCBUYXVudXM8L2xpPlxcbjwvdWw+XFxuPHA+SGVyZSBpcyB3aGVyZSB0aGluZ3MgZ2V0IDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmEgbGl0dGxlIGNvbnZlbnRpb25hbDwvYT4uIFZpZXdzLCBhbmQgYm90aCBzZXJ2ZXItc2lkZSBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4cGVjdGVkIHRvIGJlIG9yZ2FuaXplZCBieSBmb2xsb3dpbmcgdGhlIDxjb2RlPntyb290fS97Y29udHJvbGxlcn0ve2FjdGlvbn08L2NvZGU+IHBhdHRlcm4sIGJ1dCB5b3UgY291bGQgY2hhbmdlIHRoYXQgdXNpbmcgPGNvZGU+cmVzb2x2ZXJzPC9jb2RlPiB3aGVuIGludm9raW5nIHRoZSBDTEkgYW5kIHVzaW5nIHRoZSBzZXJ2ZXItc2lkZSBBUEkuPC9wPlxcbjxwPlZpZXdzIGFuZCBjb250cm9sbGVycyBhcmUgYWxzbyBleHBlY3RlZCB0byBiZSBDb21tb25KUyBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIG1ldGhvZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBBUEkgRG9jdW1lbnRhdGlvblxcblxcbiAgICBIZXJlJ3MgdGhlIEFQSSBkb2N1bWVudGF0aW9uIGZvciBUYXVudXMuIElmIHlvdSd2ZSBuZXZlciB1c2VkIGl0IGJlZm9yZSwgd2UgcmVjb21tZW5kIGdvaW5nIG92ZXIgdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlIGJlZm9yZSBqdW1waW5nIGludG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uLiBUaGF0IHdheSwgeW91J2xsIGdldCBhIGJldHRlciBpZGVhIG9mIHdoYXQgdG8gbG9vayBmb3IgYW5kIGhvdyB0byBwdXQgdG9nZXRoZXIgc2ltcGxlIGFwcGxpY2F0aW9ucyB1c2luZyBUYXVudXMsIGJlZm9yZSBnb2luZyB0aHJvdWdoIGRvY3VtZW50YXRpb24gb24gZXZlcnkgcHVibGljIGludGVyZmFjZSB0byBUYXVudXMuXFxuXFxuICAgIFRhdW51cyBleHBvc2VzIF90aHJlZSBkaWZmZXJlbnQgcHVibGljIEFQSXNfLCBhbmQgdGhlcmUncyBhbHNvICoqcGx1Z2lucyB0byBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcioqLiBUaGlzIGRvY3VtZW50IGNvdmVycyBhbGwgdGhyZWUgQVBJcyBleHRlbnNpdmVseS4gSWYgeW91J3JlIGNvbmNlcm5lZCBhYm91dCB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgVGF1bnVzLCBwbGVhc2UgcmVmZXIgdG8gdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlLiBUaGlzIGRvY3VtZW50IGFpbXMgdG8gb25seSBjb3ZlciBob3cgdGhlIHB1YmxpYyBpbnRlcmZhY2UgYWZmZWN0cyBhcHBsaWNhdGlvbiBzdGF0ZSwgYnV0ICoqZG9lc24ndCBkZWx2ZSBpbnRvIGltcGxlbWVudGF0aW9uIGRldGFpbHMqKi5cXG5cXG4gICAgIyBUYWJsZSBvZiBDb250ZW50c1xcblxcbiAgICAtIEEgW3NlcnZlci1zaWRlIEFQSV0oI3NlcnZlci1zaWRlLWFwaSkgdGhhdCBkZWFscyB3aXRoIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm1vdW50YF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgICAgLSBJdHMgW2BvcHRpb25zYF0oI3RoZS1vcHRpb25zLW9iamVjdCkgYXJndW1lbnRcXG4gICAgICAgICAgLSBbYGxheW91dGBdKCMtb3B0aW9ucy1sYXlvdXQtKVxcbiAgICAgICAgICAtIFtgcm91dGVzYF0oIy1vcHRpb25zLXJvdXRlcy0pXFxuICAgICAgICAgIC0gW2BnZXREZWZhdWx0Vmlld01vZGVsYF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKVxcbiAgICAgICAgICAtIFtgcGxhaW50ZXh0YF0oIy1vcHRpb25zLXBsYWludGV4dC0pXFxuICAgICAgICAgIC0gW2ByZXNvbHZlcnNgXSgjLW9wdGlvbnMtcmVzb2x2ZXJzLSlcXG4gICAgICAgIC0gSXRzIFtgYWRkUm91dGVgXSgjLWFkZHJvdXRlLWRlZmluaXRpb24tKSBhcmd1bWVudFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlbmRlcmBdKCMtdGF1bnVzLXJlbmRlci1hY3Rpb24tdmlld21vZGVsLXJlcS1yZXMtbmV4dC0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsYF0oIy10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS0pIG1ldGhvZFxcbiAgICAtIEEgW3N1aXRlIG9mIHBsdWdpbnNdKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSBjYW4gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXJcXG4gICAgICAtIFVzaW5nIFtgdGF1bnVzLWV4cHJlc3NgXSgjdXNpbmctdGF1bnVzLWV4cHJlc3MtKSBmb3IgW0V4cHJlc3NdWzJdXFxuICAgICAgLSBVc2luZyBbYHRhdW51cy1oYXBpYF0oI3VzaW5nLXRhdW51cy1oYXBpLSkgZm9yIFtIYXBpXVszXVxcbiAgICAtIEEgW0NMSSB0aGF0IHByb2R1Y2VzIGEgd2lyaW5nIG1vZHVsZV0oI2NvbW1hbmQtbGluZS1pbnRlcmZhY2UpIGZvciB0aGUgY2xpZW50LXNpZGVcXG4gICAgICAtIFRoZSBbYC0tb3V0cHV0YF0oIy1vdXRwdXQtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXdhdGNoYF0oIy13YXRjaC0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0tdHJhbnNmb3JtIDxtb2R1bGU+YF0oIy10cmFuc2Zvcm0tbW9kdWxlLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS1yZXNvbHZlcnMgPG1vZHVsZT5gXSgjLXJlc29sdmVycy1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXN0YW5kYWxvbmVgXSgjLXN0YW5kYWxvbmUtKSBmbGFnXFxuICAgIC0gQSBbY2xpZW50LXNpZGUgQVBJXSgjY2xpZW50LXNpZGUtYXBpKSB0aGF0IGRlYWxzIHdpdGggY2xpZW50LXNpZGUgcmVuZGVyaW5nXFxuICAgICAgLSBUaGUgW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtKSBtZXRob2RcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgYXV0b2BdKCN1c2luZy10aGUtYXV0by1zdHJhdGVneSkgc3RyYXRlZ3lcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgaW5saW5lYF0oI3VzaW5nLXRoZS1pbmxpbmUtc3RyYXRlZ3kpIHN0cmF0ZWd5XFxuICAgICAgICAtIFVzaW5nIHRoZSBbYG1hbnVhbGBdKCN1c2luZy10aGUtbWFudWFsLXN0cmF0ZWd5KSBzdHJhdGVneVxcbiAgICAgICAgLSBbQ2FjaGluZ10oI2NhY2hpbmcpXFxuICAgICAgICAtIFtQcmVmZXRjaGluZ10oI3ByZWZldGNoaW5nKVxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9uYF0oIy10YXVudXMtb24tdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9uY2VgXSgjLXRhdW51cy1vbmNlLXR5cGUtZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5vZmZgXSgjLXRhdW51cy1vZmYtdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLmludGVyY2VwdGBdKCMtdGF1bnVzLWludGVyY2VwdC1hY3Rpb24tZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5wYXJ0aWFsYF0oIy10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMubmF2aWdhdGVgXSgjLXRhdW51cy1uYXZpZ2F0ZS11cmwtKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5zdGF0ZWBdKCMtdGF1bnVzLXJvdXRlLXVybC0pIHByb3BlcnR5XFxuICAgICAgLSBUaGUgW2B0YXVudXMucm91dGVgXSgjLXRhdW51cy1zdGF0ZS0pIG1ldGhvZFxcbiAgICAtIFRoZSBbYC50YXVudXNyY2BdKCN0aGUtdGF1bnVzcmMtbWFuaWZlc3QpIG1hbmlmZXN0XFxuXFxuICAgICMgU2VydmVyLXNpZGUgQVBJXFxuXFxuICAgIFRoZSBzZXJ2ZXItc2lkZSBBUEkgaXMgdXNlZCB0byBzZXQgdXAgdGhlIHZpZXcgcm91dGVyLiBJdCB0aGVuIGdldHMgb3V0IG9mIHRoZSB3YXksIGFsbG93aW5nIHRoZSBjbGllbnQtc2lkZSB0byBldmVudHVhbGx5IHRha2Ugb3ZlciBhbmQgYWRkIGFueSBleHRyYSBzdWdhciBvbiB0b3AsIF9pbmNsdWRpbmcgY2xpZW50LXNpZGUgcmVuZGVyaW5nXy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5tb3VudChhZGRSb3V0ZSwgb3B0aW9ucz8pYFxcblxcbiAgICBNb3VudHMgVGF1bnVzIG9uIHRvcCBvZiBhIHNlcnZlci1zaWRlIHJvdXRlciwgYnkgcmVnaXN0ZXJpbmcgZWFjaCByb3V0ZSBpbiBgb3B0aW9ucy5yb3V0ZXNgIHdpdGggdGhlIGBhZGRSb3V0ZWAgbWV0aG9kLlxcblxcbiAgICA+IE5vdGUgdGhhdCBtb3N0IG9mIHRoZSB0aW1lLCAqKnRoaXMgbWV0aG9kIHNob3VsZG4ndCBiZSBpbnZva2VkIGRpcmVjdGx5KiosIGJ1dCByYXRoZXIgdGhyb3VnaCBvbmUgb2YgdGhlIFtIVFRQIGZyYW1ld29yayBwbHVnaW5zXSgjaHR0cC1mcmFtZXdvcmstcGx1Z2lucykgcHJlc2VudGVkIGJlbG93LlxcblxcbiAgICBIZXJlJ3MgYW4gaW5jb21wbGV0ZSBleGFtcGxlIG9mIGhvdyB0aGlzIG1ldGhvZCBtYXkgYmUgdXNlZC4gSXQgaXMgaW5jb21wbGV0ZSBiZWNhdXNlIHJvdXRlIGRlZmluaXRpb25zIGhhdmUgbW9yZSBvcHRpb25zIGJleW9uZCB0aGUgYHJvdXRlYCBhbmQgYGFjdGlvbmAgcHJvcGVydGllcy5cXG5cXG4gICAgYGBganNcXG4gICAgdGF1bnVzLm1vdW50KGFkZFJvdXRlLCB7XFxuICAgICAgcm91dGVzOiBbeyByb3V0ZTogJy8nLCBhY3Rpb246ICdob21lL2luZGV4JyB9XVxcbiAgICB9KTtcXG5cXG4gICAgZnVuY3Rpb24gYWRkUm91dGUgKGRlZmluaXRpb24pIHtcXG4gICAgICBhcHAuZ2V0KGRlZmluaXRpb24ucm91dGUsIGRlZmluaXRpb24uYWN0aW9uKTtcXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgTGV0J3MgZ28gb3ZlciB0aGUgb3B0aW9ucyB5b3UgY2FuIHBhc3MgdG8gYHRhdW51cy5tb3VudGAgZmlyc3QuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVGhlIGBvcHRpb25zP2Agb2JqZWN0XFxuXFxuICAgIFRoZXJlJ3MgYSBmZXcgb3B0aW9ucyB0aGF0IGNhbiBiZSBwYXNzZWQgdG8gdGhlIHNlcnZlci1zaWRlIG1vdW50cG9pbnQuIFlvdSdyZSBwcm9iYWJseSBnb2luZyB0byBiZSBwYXNzaW5nIHRoZXNlIHRvIHlvdXIgW0hUVFAgZnJhbWV3b3JrIHBsdWdpbl0oI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnMpLCByYXRoZXIgdGhhbiB1c2luZyBgdGF1bnVzLm1vdW50YCBkaXJlY3RseS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLmxheW91dD9gXFxuXFxuICAgIFRoZSBgbGF5b3V0YCBwcm9wZXJ0eSBpcyBleHBlY3RlZCB0byBoYXZlIHRoZSBgZnVuY3Rpb24oZGF0YSlgIHNpZ25hdHVyZS4gSXQnbGwgYmUgaW52b2tlZCB3aGVuZXZlciBhIGZ1bGwgSFRNTCBkb2N1bWVudCBuZWVkcyB0byBiZSByZW5kZXJlZCwgYW5kIGEgYGRhdGFgIG9iamVjdCB3aWxsIGJlIHBhc3NlZCB0byBpdC4gVGhhdCBvYmplY3Qgd2lsbCBjb250YWluIGV2ZXJ5dGhpbmcgeW91J3ZlIHNldCBhcyB0aGUgdmlldyBtb2RlbCwgcGx1cyBhIGBwYXJ0aWFsYCBwcm9wZXJ0eSBjb250YWluaW5nIHRoZSByYXcgSFRNTCBvZiB0aGUgcmVuZGVyZWQgcGFydGlhbCB2aWV3LiBZb3VyIGBsYXlvdXRgIG1ldGhvZCB3aWxsIHR5cGljYWxseSB3cmFwIHRoZSByYXcgSFRNTCBmb3IgdGhlIHBhcnRpYWwgd2l0aCB0aGUgYmFyZSBib25lcyBvZiBhbiBIVE1MIGRvY3VtZW50LiBDaGVjayBvdXQgW3RoZSBgbGF5b3V0LmphZGVgIHVzZWQgaW4gUG9ueSBGb29dWzRdIGFzIGFuIGV4YW1wbGUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5yb3V0ZXNgXFxuXFxuICAgIFRoZSBvdGhlciBiaWcgb3B0aW9uIGlzIGByb3V0ZXNgLCB3aGljaCBleHBlY3RzIGEgY29sbGVjdGlvbiBvZiByb3V0ZSBkZWZpbml0aW9ucy4gUm91dGUgZGVmaW5pdGlvbnMgdXNlIGEgbnVtYmVyIG9mIHByb3BlcnRpZXMgdG8gZGV0ZXJtaW5lIGhvdyB0aGUgcm91dGUgaXMgZ29pbmcgdG8gYmVoYXZlLlxcblxcbiAgICBIZXJlJ3MgYW4gZXhhbXBsZSByb3V0ZSB0aGF0IHVzZXMgdGhlIFtFeHByZXNzXVsyXSByb3V0aW5nIHNjaGVtZS5cXG5cXG4gICAgYGBganNcXG4gICAge1xcbiAgICAgIHJvdXRlOiAnL2FydGljbGVzLzpzbHVnJyxcXG4gICAgICBhY3Rpb246ICdhcnRpY2xlcy9hcnRpY2xlJyxcXG4gICAgICBpZ25vcmU6IGZhbHNlLFxcbiAgICAgIGNhY2hlOiA8aW5oZXJpdD5cXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgLSBgcm91dGVgIGlzIGEgcm91dGUgaW4gdGhlIGZvcm1hdCB5b3VyIEhUVFAgZnJhbWV3b3JrIG9mIGNob2ljZSB1bmRlcnN0YW5kc1xcbiAgICAtIGBhY3Rpb25gIGlzIHRoZSBuYW1lIG9mIHlvdXIgY29udHJvbGxlciBhY3Rpb24uIEl0J2xsIGJlIHVzZWQgdG8gZmluZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlciwgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHNob3VsZCBiZSB1c2VkIHdpdGggdGhpcyByb3V0ZSwgYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyXFxuICAgIC0gYGNhY2hlYCBjYW4gYmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGNsaWVudC1zaWRlIGNhY2hpbmcgYmVoYXZpb3IgaW4gdGhpcyBhcHBsaWNhdGlvbiBwYXRoLCBhbmQgaXQnbGwgZGVmYXVsdCB0byBpbmhlcml0aW5nIGZyb20gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgIF9vbiB0aGUgY2xpZW50LXNpZGVfXFxuICAgIC0gYGlnbm9yZWAgaXMgdXNlZCBpbiB0aG9zZSBjYXNlcyB3aGVyZSB5b3Ugd2FudCBhIFVSTCB0byBiZSBpZ25vcmVkIGJ5IHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZXZlbiBpZiB0aGVyZSdzIGEgY2F0Y2gtYWxsIHJvdXRlIHRoYXQgd291bGQgbWF0Y2ggdGhhdCBVUkxcXG5cXG4gICAgQXMgYW4gZXhhbXBsZSBvZiB0aGUgYGlnbm9yZWAgdXNlIGNhc2UsIGNvbnNpZGVyIHRoZSByb3V0aW5nIHRhYmxlIHNob3duIGJlbG93LiBUaGUgY2xpZW50LXNpZGUgcm91dGVyIGRvZXNuJ3Qga25vdyBfKGFuZCBjYW4ndCBrbm93IHVubGVzcyB5b3UgcG9pbnQgaXQgb3V0KV8gd2hhdCByb3V0ZXMgYXJlIHNlcnZlci1zaWRlIG9ubHksIGFuZCBpdCdzIHVwIHRvIHlvdSB0byBwb2ludCB0aG9zZSBvdXQuXFxuXFxuICAgIGBgYGpzXFxuICAgIFtcXG4gICAgICB7IHJvdXRlOiAnLycsIGFjdGlvbjogJy9ob21lL2luZGV4JyB9LFxcbiAgICAgIHsgcm91dGU6ICcvZmVlZCcsIGlnbm9yZTogdHJ1ZSB9LFxcbiAgICAgIHsgcm91dGU6ICcvKicsIGFjdGlvbjogJ2Vycm9yL25vdC1mb3VuZCcgfVxcbiAgICBdXFxuICAgIGBgYFxcblxcbiAgICBUaGlzIHN0ZXAgaXMgbmVjZXNzYXJ5IHdoZW5ldmVyIHlvdSBoYXZlIGFuIGFuY2hvciBsaW5rIHBvaW50ZWQgYXQgc29tZXRoaW5nIGxpa2UgYW4gUlNTIGZlZWQuIFRoZSBgaWdub3JlYCBwcm9wZXJ0eSBpcyBlZmZlY3RpdmVseSB0ZWxsaW5nIHRoZSBjbGllbnQtc2lkZSBfXFxcImRvbid0IGhpamFjayBsaW5rcyBjb250YWluaW5nIHRoaXMgVVJMXFxcIl8uXFxuXFxuICAgIFBsZWFzZSBub3RlIHRoYXQgZXh0ZXJuYWwgbGlua3MgYXJlIG5ldmVyIGhpamFja2VkLiBPbmx5IHNhbWUtb3JpZ2luIGxpbmtzIGNvbnRhaW5pbmcgYSBVUkwgdGhhdCBtYXRjaGVzIG9uZSBvZiB0aGUgcm91dGVzIHdpbGwgYmUgaGlqYWNrZWQgYnkgVGF1bnVzLiBFeHRlcm5hbCBsaW5rcyBkb24ndCBuZWVkIHRvIGJlIGBpZ25vcmVgZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLmdldERlZmF1bHRWaWV3TW9kZWw/YFxcblxcbiAgICBUaGUgYGdldERlZmF1bHRWaWV3TW9kZWwoZG9uZSlgIHByb3BlcnR5IGNhbiBiZSBhIG1ldGhvZCB0aGF0IHB1dHMgdG9nZXRoZXIgdGhlIGJhc2UgdmlldyBtb2RlbCwgd2hpY2ggd2lsbCB0aGVuIGJlIGV4dGVuZGVkIG9uIGFuIGFjdGlvbi1ieS1hY3Rpb24gYmFzaXMuIFdoZW4geW91J3JlIGRvbmUgY3JlYXRpbmcgYSB2aWV3IG1vZGVsLCB5b3UgY2FuIGludm9rZSBgZG9uZShudWxsLCBtb2RlbClgLiBJZiBhbiBlcnJvciBvY2N1cnMgd2hpbGUgYnVpbGRpbmcgdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgY2FsbCBgZG9uZShlcnIpYCBpbnN0ZWFkLlxcblxcbiAgICBUYXVudXMgd2lsbCB0aHJvdyBhbiBlcnJvciBpZiBgZG9uZWAgaXMgaW52b2tlZCB3aXRoIGFuIGVycm9yLCBzbyB5b3UgbWlnaHQgd2FudCB0byBwdXQgc2FmZWd1YXJkcyBpbiBwbGFjZSBhcyB0byBhdm9pZCB0aGF0IGZyb20gaGFwcGVubmluZy4gVGhlIHJlYXNvbiB0aGlzIG1ldGhvZCBpcyBhc3luY2hyb25vdXMgaXMgYmVjYXVzZSB5b3UgbWF5IG5lZWQgZGF0YWJhc2UgYWNjZXNzIG9yIHNvbWVzdWNoIHdoZW4gcHV0dGluZyB0b2dldGhlciB0aGUgZGVmYXVsdHMuIFRoZSByZWFzb24gdGhpcyBpcyBhIG1ldGhvZCBhbmQgbm90IGp1c3QgYW4gb2JqZWN0IGlzIHRoYXQgdGhlIGRlZmF1bHRzIG1heSBjaGFuZ2UgZHVlIHRvIGh1bWFuIGludGVyYWN0aW9uIHdpdGggdGhlIGFwcGxpY2F0aW9uLCBhbmQgaW4gdGhvc2UgY2FzZXMgW3RoZSBkZWZhdWx0cyBjYW4gYmUgcmVidWlsdF0oI3RhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbCkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5wbGFpbnRleHQ/YFxcblxcbiAgICBUaGUgYHBsYWludGV4dGAgb3B0aW9ucyBvYmplY3QgaXMgcGFzc2VkIGRpcmVjdGx5IHRvIFtoZ2V0XVs1XSwgYW5kIGl0J3MgdXNlZCB0byBbdHdlYWsgdGhlIHBsYWludGV4dCB2ZXJzaW9uXVs2XSBvZiB5b3VyIHNpdGUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5yZXNvbHZlcnM/YFxcblxcbiAgICBSZXNvbHZlcnMgYXJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBsb2NhdGlvbiBvZiBzb21lIG9mIHRoZSBkaWZmZXJlbnQgcGllY2VzIG9mIHlvdXIgYXBwbGljYXRpb24uIFR5cGljYWxseSB5b3Ugd29uJ3QgaGF2ZSB0byB0b3VjaCB0aGVzZSBpbiB0aGUgc2xpZ2h0ZXN0LlxcblxcbiAgICBTaWduYXR1cmUgICAgICAgICAgICAgICAgICAgICB8IERlc2NyaXB0aW9uXFxuICAgIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYGdldFNlcnZlckNvbnRyb2xsZXIoYWN0aW9uKWAgfCBSZXR1cm4gcGF0aCB0byBzZXJ2ZXItc2lkZSBjb250cm9sbGVyIGFjdGlvbiBoYW5kbGVyIG1vZHVsZVxcbiAgICBgZ2V0VmlldyhhY3Rpb24pYCAgICAgICAgICAgICB8IFJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlXFxuXFxuICAgIFRoZSBgYWRkUm91dGVgIG1ldGhvZCBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgb24gdGhlIHNlcnZlci1zaWRlIGlzIG1vc3RseSBnb2luZyB0byBiZSB1c2VkIGludGVybmFsbHkgYnkgdGhlIEhUVFAgZnJhbWV3b3JrIHBsdWdpbnMsIHNvIGZlZWwgZnJlZSB0byBza2lwIG92ZXIgdGhlIGZvbGxvd2luZyBzZWN0aW9uLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIGBhZGRSb3V0ZShkZWZpbml0aW9uKWBcXG5cXG4gICAgVGhlIGBhZGRSb3V0ZShkZWZpbml0aW9uKWAgbWV0aG9kIHdpbGwgYmUgcGFzc2VkIGEgcm91dGUgZGVmaW5pdGlvbiwgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXMuIFRoaXMgbWV0aG9kIGlzIGV4cGVjdGVkIHRvIHJlZ2lzdGVyIGEgcm91dGUgaW4geW91ciBIVFRQIGZyYW1ld29yaydzIHJvdXRlci5cXG5cXG4gICAgLSBgcm91dGVgIGlzIHRoZSByb3V0ZSB0aGF0IHlvdSBzZXQgYXMgYGRlZmluaXRpb24ucm91dGVgXFxuICAgIC0gYGFjdGlvbmAgaXMgdGhlIGFjdGlvbiBhcyBwYXNzZWQgdG8gdGhlIHJvdXRlIGRlZmluaXRpb25cXG4gICAgLSBgYWN0aW9uRm5gIHdpbGwgYmUgdGhlIGNvbnRyb2xsZXIgZm9yIHRoaXMgYWN0aW9uIG1ldGhvZFxcbiAgICAtIGBtaWRkbGV3YXJlYCB3aWxsIGJlIGFuIGFycmF5IG9mIG1ldGhvZHMgdG8gYmUgZXhlY3V0ZWQgYmVmb3JlIGBhY3Rpb25GbmBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5yZW5kZXIoYWN0aW9uLCB2aWV3TW9kZWwsIHJlcSwgcmVzLCBuZXh0KWBcXG5cXG4gICAgVGhpcyBtZXRob2QgaXMgYWxtb3N0IGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBhcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIFRhdW51cyB0aHJvdWdoIG9uZSBvZiB0aGUgcGx1Z2lucyBhbnl3YXlzLCBzbyB3ZSB3b24ndCBnbyB2ZXJ5IGRlZXAgaW50byBpdC5cXG5cXG4gICAgVGhlIHJlbmRlciBtZXRob2QgaXMgd2hhdCBUYXVudXMgdXNlcyB0byByZW5kZXIgdmlld3MgYnkgY29uc3RydWN0aW5nIEhUTUwsIEpTT04sIG9yIHBsYWludGV4dCByZXNwb25zZXMuIFRoZSBgYWN0aW9uYCBwcm9wZXJ0eSBkZXRlcm1pbmVzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCB3aWxsIGJlIHJlbmRlcmVkLiBUaGUgYHZpZXdNb2RlbGAgd2lsbCBiZSBleHRlbmRlZCBieSBbdGhlIGRlZmF1bHQgdmlldyBtb2RlbF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKSwgYW5kIGl0IG1heSBhbHNvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGBhY3Rpb25gIGJ5IHNldHRpbmcgYHZpZXdNb2RlbC5tb2RlbC5hY3Rpb25gLlxcblxcbiAgICBUaGUgYHJlcWAsIGByZXNgLCBhbmQgYG5leHRgIGFyZ3VtZW50cyBhcmUgZXhwZWN0ZWQgdG8gYmUgdGhlIEV4cHJlc3Mgcm91dGluZyBhcmd1bWVudHMsIGJ1dCB0aGV5IGNhbiBhbHNvIGJlIG1vY2tlZCBfKHdoaWNoIGlzIGluIGZhY3Qgd2hhdCB0aGUgSGFwaSBwbHVnaW4gZG9lcylfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsKGRvbmU/KWBcXG5cXG4gICAgT25jZSBUYXVudXMgaGFzIGJlZW4gbW91bnRlZCwgY2FsbGluZyB0aGlzIG1ldGhvZCB3aWxsIHJlYnVpbGQgdGhlIHZpZXcgbW9kZWwgZGVmYXVsdHMgdXNpbmcgdGhlIGBnZXREZWZhdWx0Vmlld01vZGVsYCB0aGF0IHdhcyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgaW4gdGhlIG9wdGlvbnMuIEFuIG9wdGlvbmFsIGBkb25lYCBjYWxsYmFjayB3aWxsIGJlIGludm9rZWQgd2hlbiB0aGUgbW9kZWwgaXMgcmVidWlsdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBIVFRQIEZyYW1ld29yayBQbHVnaW5zXFxuXFxuICAgIFRoZXJlJ3MgY3VycmVudGx5IHR3byBkaWZmZXJlbnQgSFRUUCBmcmFtZXdvcmtzIF8oW0V4cHJlc3NdWzJdIGFuZCBbSGFwaV1bM10pXyB0aGF0IHlvdSBjYW4gcmVhZGlseSB1c2Ugd2l0aCBUYXVudXMgd2l0aG91dCBoYXZpbmcgdG8gZGVhbCB3aXRoIGFueSBvZiB0aGUgcm91dGUgcGx1bWJpbmcgeW91cnNlbGYuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtZXhwcmVzc2BcXG5cXG4gICAgVGhlIGB0YXVudXMtZXhwcmVzc2AgcGx1Z2luIGlzIHByb2JhYmx5IHRoZSBlYXNpZXN0IHRvIHVzZSwgYXMgVGF1bnVzIHdhcyBvcmlnaW5hbGx5IGRldmVsb3BlZCB3aXRoIGp1c3QgW0V4cHJlc3NdWzJdIGluIG1pbmQuIEluIGFkZGl0aW9uIHRvIHRoZSBvcHRpb25zIGFscmVhZHkgb3V0bGluZWQgZm9yIFt0YXVudXMubW91bnRdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgeW91IGNhbiBhZGQgbWlkZGxld2FyZSBmb3IgYW55IHJvdXRlIGluZGl2aWR1YWxseS5cXG5cXG4gICAgLSBgbWlkZGxld2FyZWAgYXJlIGFueSBtZXRob2RzIHlvdSB3YW50IFRhdW51cyB0byBleGVjdXRlIGFzIG1pZGRsZXdhcmUgaW4gRXhwcmVzcyBhcHBsaWNhdGlvbnNcXG5cXG4gICAgVG8gZ2V0IGB0YXVudXMtZXhwcmVzc2AgZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBwcm92aWRlZCB0aGF0IHlvdSBjb21lIHVwIHdpdGggYW4gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICAvLyAuLi5cXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgYHRhdW51c0V4cHJlc3NgIG1ldGhvZCB3aWxsIG1lcmVseSBzZXQgdXAgVGF1bnVzIGFuZCBhZGQgdGhlIHJlbGV2YW50IHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgYXBwbGljYXRpb24gYnkgY2FsbGluZyBgYXBwLmdldGAgYSBidW5jaCBvZiB0aW1lcy4gWW91IGNhbiBbZmluZCB0YXVudXMtZXhwcmVzcyBvbiBHaXRIdWJdWzddLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBVc2luZyBgdGF1bnVzLWhhcGlgXFxuXFxuICAgIFRoZSBgdGF1bnVzLWhhcGlgIHBsdWdpbiBpcyBhIGJpdCBtb3JlIGludm9sdmVkLCBhbmQgeW91J2xsIGhhdmUgdG8gY3JlYXRlIGEgUGFjayBpbiBvcmRlciB0byB1c2UgaXQuIEluIGFkZGl0aW9uIHRvIFt0aGUgb3B0aW9ucyB3ZSd2ZSBhbHJlYWR5IGNvdmVyZWRdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgeW91IGNhbiBhZGQgYGNvbmZpZ2Agb24gYW55IHJvdXRlLlxcblxcbiAgICAtIGBjb25maWdgIGlzIHBhc3NlZCBkaXJlY3RseSBpbnRvIHRoZSByb3V0ZSByZWdpc3RlcmVkIHdpdGggSGFwaSwgZ2l2aW5nIHlvdSB0aGUgbW9zdCBmbGV4aWJpbGl0eVxcblxcbiAgICBUbyBnZXQgYHRhdW51cy1oYXBpYCBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIGFuZCB5b3UgY2FuIGJyaW5nIHlvdXIgb3duIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgIHZhciBIYXBpID0gcmVxdWlyZSgnaGFwaScpO1xcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNIYXBpID0gcmVxdWlyZSgndGF1bnVzLWhhcGknKSh0YXVudXMpO1xcbiAgICB2YXIgcGFjayA9IG5ldyBIYXBpLlBhY2soKTtcXG5cXG4gICAgcGFjay5yZWdpc3Rlcih7XFxuICAgICAgcGx1Z2luOiB0YXVudXNIYXBpLFxcbiAgICAgIG9wdGlvbnM6IHtcXG4gICAgICAgIC8vIC4uLlxcbiAgICAgIH1cXG4gICAgfSk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgYHRhdW51c0hhcGlgIHBsdWdpbiB3aWxsIG1vdW50IFRhdW51cyBhbmQgcmVnaXN0ZXIgYWxsIG9mIHRoZSBuZWNlc3Nhcnkgcm91dGVzLiBZb3UgY2FuIFtmaW5kIHRhdW51cy1oYXBpIG9uIEdpdEh1Yl1bOF0uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgQ29tbWFuZC1MaW5lIEludGVyZmFjZVxcblxcbiAgICBPbmNlIHlvdSd2ZSBzZXQgdXAgdGhlIHNlcnZlci1zaWRlIHRvIHJlbmRlciB5b3VyIHZpZXdzIHVzaW5nIFRhdW51cywgaXQncyBvbmx5IGxvZ2ljYWwgdGhhdCB5b3UnbGwgd2FudCB0byByZW5kZXIgdGhlIHZpZXdzIGluIHRoZSBjbGllbnQtc2lkZSBhcyB3ZWxsLCBlZmZlY3RpdmVseSBjb252ZXJ0aW5nIHlvdXIgYXBwbGljYXRpb24gaW50byBhIHNpbmdsZS1wYWdlIGFwcGxpY2F0aW9uIGFmdGVyIHRoZSBmaXJzdCB2aWV3IGhhcyBiZWVuIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS5cXG5cXG4gICAgVGhlIFRhdW51cyBDTEkgaXMgYW4gdXNlZnVsIGludGVybWVkaWFyeSBpbiB0aGUgcHJvY2VzcyBvZiBnZXR0aW5nIHRoZSBjb25maWd1cmF0aW9uIHlvdSB3cm90ZSBzbyBmYXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSB0byBhbHNvIHdvcmsgd2VsbCBpbiB0aGUgY2xpZW50LXNpZGUuXFxuXFxuICAgIEluc3RhbGwgaXQgZ2xvYmFsbHkgZm9yIGRldmVsb3BtZW50LCBidXQgcmVtZW1iZXIgdG8gdXNlIGxvY2FsIGNvcGllcyBmb3IgcHJvZHVjdGlvbi1ncmFkZSB1c2VzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCAtZyB0YXVudXNcXG4gICAgYGBgXFxuXFxuICAgIFdoZW4gaW52b2tlZCB3aXRob3V0IGFueSBhcmd1bWVudHMsIHRoZSBDTEkgd2lsbCBzaW1wbHkgZm9sbG93IHRoZSBkZWZhdWx0IGNvbnZlbnRpb25zIHRvIGZpbmQgeW91ciByb3V0ZSBkZWZpbml0aW9ucywgdmlld3MsIGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVycy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzXFxuICAgIGBgYFxcblxcbiAgICBCeSBkZWZhdWx0LCB0aGUgb3V0cHV0IHdpbGwgYmUgcHJpbnRlZCB0byB0aGUgc3RhbmRhcmQgb3V0cHV0LCBtYWtpbmcgZm9yIGEgZmFzdCBkZWJ1Z2dpbmcgZXhwZXJpZW5jZS4gSGVyZSdzIHRoZSBvdXRwdXQgaWYgeW91IGp1c3QgaGFkIGEgc2luZ2xlIGBob21lL2luZGV4YCByb3V0ZSwgYW5kIHRoZSBtYXRjaGluZyB2aWV3IGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVyIGV4aXN0ZWQuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRlbXBsYXRlcyA9IHtcXG4gICAgICAnaG9tZS9pbmRleCc6IHJlcXVpcmUoJy4vdmlld3MvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciBjb250cm9sbGVycyA9IHtcXG4gICAgICAnaG9tZS9pbmRleCc6IHJlcXVpcmUoJy4uL2NsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzJylcXG4gICAgfTtcXG5cXG4gICAgdmFyIHJvdXRlcyA9IHtcXG4gICAgICAnLyc6IHtcXG4gICAgICAgIGFjdGlvbjogJ2hvbWUvaW5kZXgnXFxuICAgICAgfVxcbiAgICB9O1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcXG4gICAgICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gICAgICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICAgICAgcm91dGVzOiByb3V0ZXNcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIFlvdSBjYW4gdXNlIGEgZmV3IG9wdGlvbnMgdG8gYWx0ZXIgdGhlIG91dGNvbWUgb2YgaW52b2tpbmcgYHRhdW51c2AuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLW91dHB1dGBcXG5cXG4gICAgPHN1Yj50aGUgYC1vYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgT3V0cHV0IGlzIHdyaXR0ZW4gdG8gYSBmaWxlIGluc3RlYWQgb2YgdG8gc3RhbmRhcmQgb3V0cHV0LiBUaGUgZmlsZSBwYXRoIHVzZWQgd2lsbCBiZSB0aGUgYGNsaWVudF93aXJpbmdgIG9wdGlvbiBpbiBbYC50YXVudXNyY2BdKCN0aGUtdGF1bnVzcmMtbWFuaWZlc3QpLCB3aGljaCBkZWZhdWx0cyB0byBgJy5iaW4vd2lyaW5nLmpzJ2AuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXdhdGNoYFxcblxcbiAgICA8c3ViPnRoZSBgLXdgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBXaGVuZXZlciBhIHNlcnZlci1zaWRlIHJvdXRlIGRlZmluaXRpb24gY2hhbmdlcywgdGhlIG91dHB1dCBpcyBwcmludGVkIGFnYWluIHRvIGVpdGhlciBzdGFuZGFyZCBvdXRwdXQgb3IgYSBmaWxlLCBkZXBlbmRpbmcgb24gd2hldGhlciBgLS1vdXRwdXRgIHdhcyB1c2VkLlxcblxcbiAgICBUaGUgcHJvZ3JhbSB3b24ndCBleGl0LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS10cmFuc2Zvcm0gPG1vZHVsZT5gXFxuXFxuICAgIDxzdWI+dGhlIGAtdGAgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIFRoaXMgZmxhZyBhbGxvd3MgeW91IHRvIHRyYW5zZm9ybSBzZXJ2ZXItc2lkZSByb3V0ZXMgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHVuZGVyc3RhbmRzLiBFeHByZXNzIHJvdXRlcyBhcmUgY29tcGxldGVseSBjb21wYXRpYmxlIHdpdGggdGhlIGNsaWVudC1zaWRlIHJvdXRlciwgYnV0IEhhcGkgcm91dGVzIG5lZWQgdG8gYmUgdHJhbnNmb3JtZWQgdXNpbmcgdGhlIFtgaGFwaWlmeWBdWzldIG1vZHVsZS5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgaGFwaWlmeVxcbiAgICB0YXVudXMgLXQgaGFwaWlmeVxcbiAgICBgYGBcXG5cXG4gICAgVXNpbmcgdGhpcyB0cmFuc2Zvcm0gcmVsaWV2ZXMgeW91IGZyb20gaGF2aW5nIHRvIGRlZmluZSB0aGUgc2FtZSByb3V0ZXMgdHdpY2UgdXNpbmcgc2xpZ2h0bHkgZGlmZmVyZW50IGZvcm1hdHMgdGhhdCBjb252ZXkgdGhlIHNhbWUgbWVhbmluZy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tcmVzb2x2ZXJzIDxtb2R1bGU+YFxcblxcbiAgICA8c3ViPnRoZSBgLXJgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBTaW1pbGFybHkgdG8gdGhlIFtgcmVzb2x2ZXJzYF0oIy1vcHRpb25zLXJlc29sdmVycy0pIG9wdGlvbiB0aGF0IHlvdSBjYW4gcGFzcyB0byBbYHRhdW51cy5tb3VudGBdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgdGhlc2UgcmVzb2x2ZXJzIGNhbiBjaGFuZ2UgdGhlIHdheSBpbiB3aGljaCBmaWxlIHBhdGhzIGFyZSByZXNvbHZlZC5cXG5cXG4gICAgU2lnbmF0dXJlICAgICAgICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBnZXRDbGllbnRDb250cm9sbGVyKGFjdGlvbilgIHwgUmV0dXJuIHBhdGggdG8gY2xpZW50LXNpZGUgY29udHJvbGxlciBhY3Rpb24gaGFuZGxlciBtb2R1bGVcXG4gICAgYGdldFZpZXcoYWN0aW9uKWAgICAgICAgICAgICAgfCBSZXR1cm4gcGF0aCB0byB2aWV3IHRlbXBsYXRlIG1vZHVsZVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS1zdGFuZGFsb25lYFxcblxcbiAgICA8c3ViPnRoZSBgLXNgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBVbmRlciB0aGlzIGV4cGVyaW1lbnRhbCBmbGFnLCB0aGUgQ0xJIHdpbGwgdXNlIEJyb3dzZXJpZnkgdG8gY29tcGlsZSBhIHN0YW5kYWxvbmUgbW9kdWxlIHRoYXQgaW5jbHVkZXMgdGhlIHdpcmluZyBub3JtYWxseSBleHBvcnRlZCBieSB0aGUgQ0xJIHBsdXMgYWxsIG9mIFRhdW51cyBbYXMgYSBVTUQgbW9kdWxlXVsxMF0uXFxuXFxuICAgIFRoaXMgd291bGQgYWxsb3cgeW91IHRvIHVzZSBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIGV2ZW4gaWYgeW91IGRvbid0IHdhbnQgdG8gdXNlIFtCcm93c2VyaWZ5XVsxMV0gZGlyZWN0bHkuXFxuXFxuICAgIEZlZWRiYWNrIGFuZCBzdWdnZXN0aW9ucyBhYm91dCB0aGlzIGZsYWcsIF9hbmQgcG9zc2libGUgYWx0ZXJuYXRpdmVzIHRoYXQgd291bGQgbWFrZSBUYXVudXMgZWFzaWVyIHRvIHVzZV8sIGFyZSB3ZWxjb21lLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIENsaWVudC1zaWRlIEFQSVxcblxcbiAgICBKdXN0IGxpa2UgdGhlIHNlcnZlci1zaWRlLCBldmVyeXRoaW5nIGluIHRoZSBjbGllbnQtc2lkZSBiZWdpbnMgYXQgdGhlIG1vdW50cG9pbnQuIE9uY2UgdGhlIGFwcGxpY2F0aW9uIGlzIG1vdW50ZWQsIGFuY2hvciBsaW5rcyB3aWxsIGJlIGhpamFja2VkIGFuZCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIHdpbGwgdGFrZSBvdmVyIHZpZXcgcmVuZGVyaW5nLiBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhlY3V0ZWQgd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nLCBvcHRpb25zPylgXFxuXFxuICAgIFRoZSBtb3VudHBvaW50IHRha2VzIGEgcm9vdCBjb250YWluZXIsIHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgYW4gb3B0aW9ucyBwYXJhbWV0ZXIuIFRoZSBgY29udGFpbmVyYCBpcyB3aGVyZSBjbGllbnQtc2lkZS1yZW5kZXJlZCB2aWV3cyB3aWxsIGJlIHBsYWNlZCwgYnkgcmVwbGFjaW5nIHdoYXRldmVyIEhUTUwgY29udGVudHMgYWxyZWFkeSBleGlzdC4gWW91IGNhbiBwYXNzIGluIHRoZSBgd2lyaW5nYCBtb2R1bGUgZXhhY3RseSBhcyBidWlsdCBieSB0aGUgQ0xJLCBhbmQgbm8gZnVydGhlciBjb25maWd1cmF0aW9uIGlzIG5lY2Vzc2FyeS5cXG5cXG4gICAgV2hlbiB0aGUgbW91bnRwb2ludCBleGVjdXRlcywgVGF1bnVzIHdpbGwgY29uZmlndXJlIGl0cyBpbnRlcm5hbCBzdGF0ZSwgX3NldCB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXywgcnVuIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldywgYW5kIHN0YXJ0IGhpamFja2luZyBsaW5rcy5cXG5cXG4gICAgQXMgYW4gZXhhbXBsZSwgY29uc2lkZXIgYSBicm93c2VyIG1ha2VzIGEgYEdFVGAgcmVxdWVzdCBmb3IgYC9hcnRpY2xlcy90aGUtZm94YCBmb3IgdGhlIGZpcnN0IHRpbWUuIE9uY2UgYHRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZylgIGlzIGludm9rZWQgb24gdGhlIGNsaWVudC1zaWRlLCBzZXZlcmFsIHRoaW5ncyB3b3VsZCBoYXBwZW4gaW4gdGhlIG9yZGVyIGxpc3RlZCBiZWxvdy5cXG5cXG4gICAgLSBUYXVudXMgc2V0cyB1cCB0aGUgY2xpZW50LXNpZGUgdmlldyByb3V0aW5nIGVuZ2luZVxcbiAgICAtIElmIGVuYWJsZWQgXyh2aWEgYG9wdGlvbnNgKV8sIHRoZSBjYWNoaW5nIGVuZ2luZSBpcyBjb25maWd1cmVkXFxuICAgIC0gVGF1bnVzIG9idGFpbnMgdGhlIHZpZXcgbW9kZWwgXyhtb3JlIG9uIHRoaXMgbGF0ZXIpX1xcbiAgICAtIFdoZW4gYSB2aWV3IG1vZGVsIGlzIG9idGFpbmVkLCB0aGUgYCdzdGFydCdgIGV2ZW50IGlzIGVtaXR0ZWRcXG4gICAgLSBBbmNob3IgbGlua3Mgc3RhcnQgYmVpbmcgbW9uaXRvcmVkIGZvciBjbGlja3MgXyhhdCB0aGlzIHBvaW50IHlvdXIgYXBwbGljYXRpb24gYmVjb21lcyBhIFtTUEFdWzEzXSlfXFxuICAgIC0gVGhlIGBhcnRpY2xlcy9hcnRpY2xlYCBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGV4ZWN1dGVkXFxuXFxuICAgIFRoYXQncyBxdWl0ZSBhIGJpdCBvZiBmdW5jdGlvbmFsaXR5LCBidXQgaWYgeW91IHRoaW5rIGFib3V0IGl0LCBtb3N0IG90aGVyIGZyYW1ld29ya3MgYWxzbyByZW5kZXIgdGhlIHZpZXcgYXQgdGhpcyBwb2ludCwgX3JhdGhlciB0aGFuIG9uIHRoZSBzZXJ2ZXItc2lkZSFfXFxuXFxuICAgIEluIG9yZGVyIHRvIGJldHRlciB1bmRlcnN0YW5kIHRoZSBwcm9jZXNzLCBJJ2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIGBvcHRpb25zYCBwYXJhbWV0ZXIuXFxuXFxuICAgIEZpcnN0IG9mZiwgdGhlIGBib290c3RyYXBgIG9wdGlvbiBkZXRlcm1pbmVzIHRoZSBzdHJhdGVneSB1c2VkIHRvIHB1bGwgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZXJlIGFyZSB0aHJlZSBwb3NzaWJsZSBzdHJhdGVnaWVzIGF2YWlsYWJsZTogYGF1dG9gIF8odGhlIGRlZmF1bHQgc3RyYXRlZ3kpXywgYGlubGluZWAsIG9yIGBtYW51YWxgLiBUaGUgYGF1dG9gIHN0cmF0ZWd5IGludm9sdmVzIHRoZSBsZWFzdCB3b3JrLCB3aGljaCBpcyB3aHkgaXQncyB0aGUgZGVmYXVsdC5cXG5cXG4gICAgLSBgYXV0b2Agd2lsbCBtYWtlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWxcXG4gICAgLSBgaW5saW5lYCBleHBlY3RzIHlvdSB0byBwbGFjZSB0aGUgbW9kZWwgaW50byBhIGA8c2NyaXB0IHR5cGU9J3RleHQvdGF1bnVzJz5gIHRhZ1xcbiAgICAtIGBtYW51YWxgIGV4cGVjdHMgeW91IHRvIGdldCB0aGUgdmlldyBtb2RlbCBob3dldmVyIHlvdSB3YW50IHRvLCBhbmQgdGhlbiBsZXQgVGF1bnVzIGtub3cgd2hlbiBpdCdzIHJlYWR5XFxuXFxuICAgIExldCdzIGdvIGludG8gZGV0YWlsIGFib3V0IGVhY2ggb2YgdGhlc2Ugc3RyYXRlZ2llcy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgYGF1dG9gIHN0cmF0ZWd5XFxuXFxuICAgIFRoZSBgYXV0b2Agc3RyYXRlZ3kgbWVhbnMgdGhhdCBUYXVudXMgd2lsbCBtYWtlIHVzZSBvZiBhbiBBSkFYIHJlcXVlc3QgdG8gb2J0YWluIHRoZSB2aWV3IG1vZGVsLiBfWW91IGRvbid0IGhhdmUgdG8gZG8gYW55dGhpbmcgZWxzZV8gYW5kIHRoaXMgaXMgdGhlIGRlZmF1bHQgc3RyYXRlZ3kuIFRoaXMgaXMgdGhlICoqbW9zdCBjb252ZW5pZW50IHN0cmF0ZWd5LCBidXQgYWxzbyB0aGUgc2xvd2VzdCoqIG9uZS5cXG5cXG4gICAgSXQncyBzbG93IGJlY2F1c2UgdGhlIHZpZXcgbW9kZWwgd29uJ3QgYmUgcmVxdWVzdGVkIHVudGlsIHRoZSBidWxrIG9mIHlvdXIgSmF2YVNjcmlwdCBjb2RlIGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgZXhlY3V0ZWQsIGFuZCBgdGF1bnVzLm1vdW50YCBpcyBpbnZva2VkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBgaW5saW5lYCBzdHJhdGVneVxcblxcbiAgICBUaGUgYGlubGluZWAgc3RyYXRlZ3kgZXhwZWN0cyB5b3UgdG8gYWRkIGEgYGRhdGEtdGF1bnVzYCBhdHRyaWJ1dGUgb24gdGhlIGBjb250YWluZXJgIGVsZW1lbnQuIFRoaXMgYXR0cmlidXRlIG11c3QgYmUgZXF1YWwgdG8gdGhlIGBpZGAgYXR0cmlidXRlIG9mIGEgYDxzY3JpcHQ+YCB0YWcgY29udGFpbmluZyB0aGUgc2VyaWFsaXplZCB2aWV3IG1vZGVsLlxcblxcbiAgICBgYGBqYWRlXFxuICAgIGRpdihkYXRhLXRhdW51cz0nbW9kZWwnKSE9cGFydGlhbFxcbiAgICBzY3JpcHQodHlwZT0ndGV4dC90YXVudXMnLCBkYXRhLXRhdW51cz0nbW9kZWwnKT1KU09OLnN0cmluZ2lmeShtb2RlbClcXG4gICAgYGBgXFxuXFxuICAgIFBheSBzcGVjaWFsIGF0dGVudGlvbiB0byB0aGUgZmFjdCB0aGF0IHRoZSBtb2RlbCBpcyBub3Qgb25seSBtYWRlIGludG8gYSBKU09OIHN0cmluZywgX2J1dCBhbHNvIEhUTUwgZW5jb2RlZCBieSBKYWRlXy4gV2hlbiBUYXVudXMgZXh0cmFjdHMgdGhlIG1vZGVsIGZyb20gdGhlIGA8c2NyaXB0PmAgdGFnIGl0J2xsIHVuZXNjYXBlIGl0LCBhbmQgdGhlbiBwYXJzZSBpdCBhcyBKU09OLlxcblxcbiAgICBUaGlzIHN0cmF0ZWd5IGlzIGFsc28gZmFpcmx5IGNvbnZlbmllbnQgdG8gc2V0IHVwLCBidXQgaXQgaW52b2x2ZXMgYSBsaXR0bGUgbW9yZSB3b3JrLiBJdCBtaWdodCBiZSB3b3J0aHdoaWxlIHRvIHVzZSBpbiBjYXNlcyB3aGVyZSBtb2RlbHMgYXJlIHNtYWxsLCBidXQgaXQgd2lsbCBzbG93IGRvd24gc2VydmVyLXNpZGUgdmlldyByZW5kZXJpbmcsIGFzIHRoZSBtb2RlbCBpcyBpbmxpbmVkIGFsb25nc2lkZSB0aGUgSFRNTC5cXG5cXG4gICAgVGhhdCBtZWFucyB0aGF0IHRoZSBjb250ZW50IHlvdSBhcmUgc3VwcG9zZWQgdG8gYmUgcHJpb3JpdGl6aW5nIGlzIGdvaW5nIHRvIHRha2UgbG9uZ2VyIHRvIGdldCB0byB5b3VyIGh1bWFucywgYnV0IG9uY2UgdGhleSBnZXQgdGhlIEhUTUwsIHRoaXMgc3RyYXRlZ3kgd2lsbCBleGVjdXRlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGFsbW9zdCBpbW1lZGlhdGVseS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgYG1hbnVhbGAgc3RyYXRlZ3lcXG5cXG4gICAgVGhlIGBtYW51YWxgIHN0cmF0ZWd5IGlzIHRoZSBtb3N0IGludm9sdmVkIG9mIHRoZSB0aHJlZSwgYnV0IGFsc28gdGhlIG1vc3QgcGVyZm9ybWFudC4gSW4gdGhpcyBzdHJhdGVneSB5b3UncmUgc3VwcG9zZWQgdG8gYWRkIHRoZSBmb2xsb3dpbmcgXyhzZWVtaW5nbHkgcG9pbnRsZXNzKV8gc25pcHBldCBvZiBjb2RlIGluIGEgYDxzY3JpcHQ+YCBvdGhlciB0aGFuIHRoZSBvbmUgdGhhdCdzIHB1bGxpbmcgZG93biBUYXVudXMsIHNvIHRoYXQgdGhleSBhcmUgcHVsbGVkIGNvbmN1cnJlbnRseSByYXRoZXIgdGhhbiBzZXJpYWxseS5cXG5cXG4gICAgYGBganNcXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPbmNlIHlvdSBzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGludm9rZSBgdGF1bnVzUmVhZHkobW9kZWwpYC4gQ29uc2lkZXJpbmcgeW91J2xsIGJlIHB1bGxpbmcgYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGF0IHRoZSBzYW1lIHRpbWUsIGEgbnVtYmVyIG9mIGRpZmZlcmVudCBzY2VuYXJpb3MgbWF5IHBsYXkgb3V0LlxcblxcbiAgICAtIFRoZSB2aWV3IG1vZGVsIGlzIGxvYWRlZCBmaXJzdCwgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHdhaXQgZm9yIFRhdW51cyB0byB0YWtlIHRoZSBtb2RlbCBvYmplY3QgYW5kIGJvb3QgdGhlIGFwcGxpY2F0aW9uIGFzIHNvb24gYXMgYHRhdW51cy5tb3VudGAgaXMgZXhlY3V0ZWRcXG4gICAgLSBUYXVudXMgbG9hZHMgZmlyc3QgYW5kIGB0YXVudXMubW91bnRgIGlzIGNhbGxlZCBmaXJzdC4gSW4gdGhpcyBjYXNlLCBUYXVudXMgd2lsbCByZXBsYWNlIGB3aW5kb3cudGF1bnVzUmVhZHlgIHdpdGggYSBzcGVjaWFsIGBib290YCBtZXRob2QuIFdoZW4gdGhlIHZpZXcgbW9kZWwgZmluaXNoZXMgbG9hZGluZywgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHRoZSBhcHBsaWNhdGlvbiBmaW5pc2hlcyBib290aW5nXFxuXFxuICAgID4gSWYgdGhpcyBzb3VuZHMgYSBsaXR0bGUgbWluZC1iZW5kaW5nIGl0J3MgYmVjYXVzZSBpdCBpcy4gSXQncyBub3QgZGVzaWduZWQgdG8gYmUgcHJldHR5LCBidXQgbWVyZWx5IHRvIGJlIHBlcmZvcm1hbnQuXFxuXFxuICAgIE5vdyB0aGF0IHdlJ3ZlIGFkZHJlc3NlZCB0aGUgYXdrd2FyZCBiaXRzLCBsZXQncyBjb3ZlciB0aGUgX1xcXCJzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsXFxcIl8gYXNwZWN0LiBNeSBwcmVmZXJyZWQgbWV0aG9kIGlzIHVzaW5nIEpTT05QLCBhcyBpdCdzIGFibGUgdG8gZGVsaXZlciB0aGUgc21hbGxlc3Qgc25pcHBldCBwb3NzaWJsZSwgYW5kIGl0IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBzZXJ2ZXItc2lkZSBjYWNoaW5nLiBDb25zaWRlcmluZyB5b3UnbGwgcHJvYmFibHkgd2FudCB0aGlzIHRvIGJlIGFuIGlubGluZSBzY3JpcHQsIGtlZXBpbmcgaXQgc21hbGwgaXMgaW1wb3J0YW50LlxcblxcbiAgICBUaGUgZ29vZCBuZXdzIGlzIHRoYXQgdGhlIHNlcnZlci1zaWRlIHN1cHBvcnRzIEpTT05QIG91dCB0aGUgYm94LiBIZXJlJ3MgYSBzbmlwcGV0IG9mIGNvZGUgeW91IGNvdWxkIHVzZSB0byBwdWxsIGRvd24gdGhlIHZpZXcgbW9kZWwgYW5kIGJvb3QgVGF1bnVzIHVwIGFzIHNvb24gYXMgYm90aCBvcGVyYXRpb25zIGFyZSByZWFkeS5cXG5cXG4gICAgYGBganNcXG4gICAgZnVuY3Rpb24gaW5qZWN0ICh1cmwpIHtcXG4gICAgICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XFxuICAgICAgc2NyaXB0LnNyYyA9IHVybDtcXG4gICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNjcmlwdCk7XFxuICAgIH1cXG5cXG4gICAgZnVuY3Rpb24gaW5qZWN0b3IgKCkge1xcbiAgICAgIHZhciBzZWFyY2ggPSBsb2NhdGlvbi5zZWFyY2g7XFxuICAgICAgdmFyIHNlYXJjaFF1ZXJ5ID0gc2VhcmNoID8gJyYnICsgc2VhcmNoLnN1YnN0cigxKSA6ICcnO1xcbiAgICAgIHZhciBzZWFyY2hKc29uID0gJz9qc29uJmNhbGxiYWNrPXRhdW51c1JlYWR5JyArIHNlYXJjaFF1ZXJ5O1xcbiAgICAgIGluamVjdChsb2NhdGlvbi5wYXRobmFtZSArIHNlYXJjaEpzb24pO1xcbiAgICB9XFxuXFxuICAgIHdpbmRvdy50YXVudXNSZWFkeSA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgICAgIHdpbmRvdy50YXVudXNSZWFkeSA9IG1vZGVsO1xcbiAgICB9O1xcblxcbiAgICBpbmplY3RvcigpO1xcbiAgICBgYGBcXG5cXG4gICAgQXMgbWVudGlvbmVkIGVhcmxpZXIsIHRoaXMgYXBwcm9hY2ggaW52b2x2ZXMgZ2V0dGluZyB5b3VyIGhhbmRzIGRpcnRpZXIgYnV0IGl0IHBheXMgb2ZmIGJ5IGJlaW5nIHRoZSBmYXN0ZXN0IG9mIHRoZSB0aHJlZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDYWNoaW5nXFxuXFxuICAgIFRoZSBjbGllbnQtc2lkZSBpbiBUYXVudXMgc3VwcG9ydHMgY2FjaGluZyBpbi1tZW1vcnkgYW5kIHVzaW5nIHRoZSBlbWJlZGRlZCBJbmRleGVkREIgc3lzdGVtIGJ5IG1lcmVseSB0dXJuaW5nIG9uIHRoZSBgY2FjaGVgIGZsYWcgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgIG9uIHRoZSBjbGllbnQtc2lkZS5cXG5cXG4gICAgSWYgeW91IHNldCBgY2FjaGVgIHRvIGB0cnVlYCB0aGVuIGNhY2hlZCBpdGVtcyB3aWxsIGJlIGNvbnNpZGVyZWQgX1xcXCJmcmVzaFxcXCIgKHZhbGlkIGNvcGllcyBvZiB0aGUgb3JpZ2luYWwpXyBmb3IgKioxNSBzZWNvbmRzKiouIFlvdSBjYW4gYWxzbyBzZXQgYGNhY2hlYCB0byBhIG51bWJlciwgYW5kIHRoYXQgbnVtYmVyIG9mIHNlY29uZHMgd2lsbCBiZSB1c2VkIGFzIHRoZSBkZWZhdWx0IGluc3RlYWQuXFxuXFxuICAgIENhY2hpbmcgY2FuIGFsc28gYmUgdHdlYWtlZCBvbiBpbmRpdmlkdWFsIHJvdXRlcy4gRm9yIGluc3RhbmNlLCB5b3UgY291bGQgc2V0IGB7IGNhY2hlOiB0cnVlIH1gIHdoZW4gbW91bnRpbmcgVGF1bnVzIGFuZCB0aGVuIGhhdmUgYHsgY2FjaGU6IDM2MDAgfWAgb24gYSByb3V0ZSB0aGF0IHlvdSB3YW50IHRvIGNhY2hlIGZvciBhIGxvbmdlciBwZXJpb2Qgb2YgdGltZS5cXG5cXG4gICAgVGhlIGNhY2hpbmcgbGF5ZXIgaXMgX3NlYW1sZXNzbHkgaW50ZWdyYXRlZF8gaW50byBUYXVudXMsIG1lYW5pbmcgdGhhdCBhbnkgdmlld3MgcmVuZGVyZWQgYnkgVGF1bnVzIHdpbGwgYmUgY2FjaGVkIGFjY29yZGluZyB0byB0aGVzZSBjYWNoaW5nIHJ1bGVzLiBLZWVwIGluIG1pbmQsIGhvd2V2ZXIsIHRoYXQgcGVyc2lzdGVuY2UgYXQgdGhlIGNsaWVudC1zaWRlIGNhY2hpbmcgbGF5ZXIgd2lsbCBvbmx5IGJlIHBvc3NpYmxlIGluIFticm93c2VycyB0aGF0IHN1cHBvcnQgSW5kZXhlZERCXVsxNF0uIEluIHRoZSBjYXNlIG9mIGJyb3dzZXJzIHRoYXQgZG9uJ3Qgc3VwcG9ydCBJbmRleGVkREIsIFRhdW51cyB3aWxsIHVzZSBhbiBpbi1tZW1vcnkgY2FjaGUsIHdoaWNoIHdpbGwgYmUgd2lwZWQgb3V0IHdoZW5ldmVyIHRoZSBodW1hbiBkZWNpZGVzIHRvIGNsb3NlIHRoZSB0YWIgaW4gdGhlaXIgYnJvd3Nlci5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBQcmVmZXRjaGluZ1xcblxcbiAgICBJZiBjYWNoaW5nIGlzIGVuYWJsZWQsIHRoZSBuZXh0IGxvZ2ljYWwgc3RlcCBpcyBwcmVmZXRjaGluZy4gVGhpcyBpcyBlbmFibGVkIGp1c3QgYnkgYWRkaW5nIGBwcmVmZXRjaDogdHJ1ZWAgdG8gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgLiBUaGUgcHJlZmV0Y2hpbmcgZmVhdHVyZSB3aWxsIGZpcmUgZm9yIGFueSBhbmNob3IgbGluayB0aGF0J3MgdHJpcHMgb3ZlciBhIGBtb3VzZW92ZXJgIG9yIGEgYHRvdWNoc3RhcnRgIGV2ZW50LiBJZiBhIHJvdXRlIG1hdGNoZXMgdGhlIFVSTCBpbiB0aGUgYGhyZWZgLCBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBwcmVmZXRjaCB0aGUgdmlldyBhbmQgY2FjaGUgaXRzIGNvbnRlbnRzLCBpbXByb3ZpbmcgcGVyY2VpdmVkIHBlcmZvcm1hbmNlLlxcblxcbiAgICBXaGVuIGxpbmtzIGFyZSBjbGlja2VkIGJlZm9yZSBwcmVmZXRjaGluZyBmaW5pc2hlcywgdGhleSdsbCB3YWl0IG9uIHRoZSBwcmVmZXRjaGVyIHRvIGZpbmlzaCBiZWZvcmUgaW1tZWRpYXRlbHkgc3dpdGNoaW5nIHRvIHRoZSB2aWV3LCBlZmZlY3RpdmVseSBjdXR0aW5nIGRvd24gdGhlIHJlc3BvbnNlIHRpbWUuIElmIHRoZSBsaW5rIHdhcyBhbHJlYWR5IHByZWZldGNoZWQgb3Igb3RoZXJ3aXNlIGNhY2hlZCwgdGhlIHZpZXcgd2lsbCBiZSBsb2FkZWQgaW1tZWRpYXRlbHkuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhIGxpbmsgYW5kIGFub3RoZXIgb25lIHdhcyBhbHJlYWR5IGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhhdCBvbmUgaXMgYWJvcnRlZC4gVGhpcyBwcmV2ZW50cyBwcmVmZXRjaGluZyBmcm9tIGRyYWluaW5nIHRoZSBiYW5kd2lkdGggb24gY2xpZW50cyB3aXRoIGxpbWl0ZWQgb3IgaW50ZXJtaXR0ZW50IGNvbm5lY3Rpdml0eS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5vbih0eXBlLCBmbilgXFxuXFxuICAgIFRhdW51cyBlbWl0cyBhIHNlcmllcyBvZiBldmVudHMgZHVyaW5nIGl0cyBsaWZlY3ljbGUsIGFuZCBgdGF1bnVzLm9uYCBpcyB0aGUgd2F5IHlvdSBjYW4gdHVuZSBpbiBhbmQgbGlzdGVuIGZvciB0aGVzZSBldmVudHMgdXNpbmcgYSBzdWJzY3JpcHRpb24gZnVuY3Rpb24gYGZuYC5cXG5cXG4gICAgRXZlbnQgICAgICAgICAgICB8IEFyZ3VtZW50cyAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYCdzdGFydCdgICAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgRW1pdHRlZCB3aGVuIGB0YXVudXMubW91bnRgIGZpbmlzaGVkIHRoZSByb3V0ZSBzZXR1cCBhbmQgaXMgYWJvdXQgdG8gaW52b2tlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyLiBTdWJzY3JpYmUgdG8gdGhpcyBldmVudCBiZWZvcmUgY2FsbGluZyBgdGF1bnVzLm1vdW50YC5cXG4gICAgYCdyZW5kZXInYCAgICAgICB8IGBjb250YWluZXIsIG1vZGVsYCAgICAgIHwgQSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWRcXG4gICAgYCdmZXRjaC5zdGFydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuXFxuICAgIGAnZmV0Y2guZG9uZSdgICAgfCAgYHJvdXRlLCBjb250ZXh0LCBkYXRhYCB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuXFxuICAgIGAnZmV0Y2guYWJvcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuXFxuICAgIGAnZmV0Y2guZXJyb3InYCAgfCAgYHJvdXRlLCBjb250ZXh0LCBlcnJgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm9uY2UodHlwZSwgZm4pYFxcblxcbiAgICBUaGlzIG1ldGhvZCBpcyBlcXVpdmFsZW50IHRvIFtgdGF1bnVzLm9uYF0oIy10YXVudXMtb24tdHlwZS1mbi0pLCBleGNlcHQgdGhlIGV2ZW50IGxpc3RlbmVycyB3aWxsIGJlIHVzZWQgb25jZSBhbmQgdGhlbiBpdCdsbCBiZSBkaXNjYXJkZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub2ZmKHR5cGUsIGZuKWBcXG5cXG4gICAgVXNpbmcgdGhpcyBtZXRob2QgeW91IGNhbiByZW1vdmUgYW55IGV2ZW50IGxpc3RlbmVycyB0aGF0IHdlcmUgcHJldmlvdXNseSBhZGRlZCB1c2luZyBgLm9uYCBvciBgLm9uY2VgLiBZb3UgbXVzdCBwcm92aWRlIHRoZSB0eXBlIG9mIGV2ZW50IHlvdSB3YW50IHRvIHJlbW92ZSBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGZ1bmN0aW9uIHRoYXQgd2FzIG9yaWdpbmFsbHkgdXNlZCB3aGVuIGNhbGxpbmcgYC5vbmAgb3IgYC5vbmNlYC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5pbnRlcmNlcHQoYWN0aW9uPywgZm4pYFxcblxcbiAgICBUaGlzIG1ldGhvZCBjYW4gYmUgdXNlZCB0byBhbnRpY2lwYXRlIG1vZGVsIHJlcXVlc3RzLCBiZWZvcmUgdGhleSBldmVyIG1ha2UgaXQgaW50byBYSFIgcmVxdWVzdHMuIFlvdSBjYW4gYWRkIGludGVyY2VwdG9ycyBmb3Igc3BlY2lmaWMgYWN0aW9ucywgd2hpY2ggd291bGQgYmUgdHJpZ2dlcmVkIG9ubHkgaWYgdGhlIHJlcXVlc3QgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIGBhY3Rpb25gLiBZb3UgY2FuIGFsc28gYWRkIGdsb2JhbCBpbnRlcmNlcHRvcnMgYnkgb21pdHRpbmcgdGhlIGBhY3Rpb25gIHBhcmFtZXRlciwgb3Igc2V0dGluZyBpdCB0byBgKmAuXFxuXFxuICAgIEFuIGludGVyY2VwdG9yIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBhbiBgZXZlbnRgIHBhcmFtZXRlciwgY29udGFpbmluZyBhIGZldyBkaWZmZXJlbnQgcHJvcGVydGllcy5cXG5cXG4gICAgLSBgdXJsYCBjb250YWlucyB0aGUgVVJMIHRoYXQgbmVlZHMgYSB2aWV3IG1vZGVsXFxuICAgIC0gYHJvdXRlYCBjb250YWlucyB0aGUgZnVsbCByb3V0ZSBvYmplY3QgYXMgeW91J2QgZ2V0IGZyb20gW2B0YXVudXMucm91dGUodXJsKWBdKCMtdGF1bnVzLXJvdXRlLXVybC0pXFxuICAgIC0gYHBhcnRzYCBpcyBqdXN0IGEgc2hvcnRjdXQgZm9yIGByb3V0ZS5wYXJ0c2BcXG4gICAgLSBgcHJldmVudERlZmF1bHQobW9kZWwpYCBhbGxvd3MgeW91IHRvIHN1cHByZXNzIHRoZSBuZWVkIGZvciBhbiBBSkFYIHJlcXVlc3QsIGNvbW1hbmRpbmcgVGF1bnVzIHRvIHVzZSB0aGUgbW9kZWwgeW91J3ZlIHByb3ZpZGVkIGluc3RlYWRcXG4gICAgLSBgZGVmYXVsdFByZXZlbnRlZGAgdGVsbHMgeW91IGlmIHNvbWUgb3RoZXIgaGFuZGxlciBoYXMgcHJldmVudGVkIHRoZSBkZWZhdWx0IGJlaGF2aW9yXFxuICAgIC0gYGNhblByZXZlbnREZWZhdWx0YCB0ZWxscyB5b3UgaWYgaW52b2tpbmcgYGV2ZW50LnByZXZlbnREZWZhdWx0YCB3aWxsIGhhdmUgYW55IGVmZmVjdFxcbiAgICAtIGBtb2RlbGAgc3RhcnRzIGFzIGBudWxsYCwgYW5kIGl0IGNhbiBsYXRlciBiZWNvbWUgdGhlIG1vZGVsIHBhc3NlZCB0byBgcHJldmVudERlZmF1bHRgXFxuXFxuICAgIEludGVyY2VwdG9ycyBhcmUgYXN5bmNocm9ub3VzLCBidXQgaWYgYW4gaW50ZXJjZXB0b3Igc3BlbmRzIGxvbmdlciB0aGFuIDIwMG1zIGl0J2xsIGJlIHNob3J0LWNpcmN1aXRlZCBhbmQgY2FsbGluZyBgZXZlbnQucHJldmVudERlZmF1bHRgIHBhc3QgdGhhdCBwb2ludCB3b24ndCBoYXZlIGFueSBlZmZlY3QuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucGFydGlhbChjb250YWluZXIsIGFjdGlvbiwgbW9kZWwpYFxcblxcbiAgICBUaGlzIG1ldGhvZCBwcm92aWRlcyB5b3Ugd2l0aCBhY2Nlc3MgdG8gdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBUYXVudXMuIFlvdSBjYW4gdXNlIGl0IHRvIHJlbmRlciB0aGUgYGFjdGlvbmAgdmlldyBpbnRvIHRoZSBgY29udGFpbmVyYCBET00gZWxlbWVudCwgdXNpbmcgdGhlIHNwZWNpZmllZCBgbW9kZWxgLiBPbmNlIHRoZSB2aWV3IGlzIHJlbmRlcmVkLCB0aGUgYHJlbmRlcmAgZXZlbnQgd2lsbCBiZSBmaXJlZCBfKHdpdGggYGNvbnRhaW5lciwgbW9kZWxgIGFzIGFyZ3VtZW50cylfIGFuZCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBmb3IgdGhhdCB2aWV3IHdpbGwgYmUgZXhlY3V0ZWQuXFxuXFxuICAgIFdoaWxlIGB0YXVudXMucGFydGlhbGAgdGFrZXMgYSBgcm91dGVgIGFzIHRoZSBmb3VydGggcGFyYW1ldGVyLCB5b3Ugc2hvdWxkIG9taXQgdGhhdCBzaW5jZSBpdCdzIHVzZWQgZm9yIGludGVybmFsIHB1cnBvc2VzIG9ubHkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMubmF2aWdhdGUodXJsKWBcXG5cXG4gICAgV2hlbmV2ZXIgeW91IHdhbnQgdG8gbmF2aWdhdGUgdG8gYSBVUkwsIHNheSB3aGVuIGFuIEFKQVggY2FsbCBmaW5pc2hlcyBhZnRlciBhIGJ1dHRvbiBjbGljaywgeW91IGNhbiB1c2UgYHRhdW51cy5uYXZpZ2F0ZWAgcGFzc2luZyBpdCBhIHBsYWluIFVSTC5cXG5cXG4gICAgSWYgYHRhdW51cy5uYXZpZ2F0ZSh1cmwpYCBpcyBjYWxsZWQgd2l0aCBhbiBgdXJsYCB0aGF0IGRvZXNuJ3QgbWF0Y2ggYW55IGNsaWVudC1zaWRlIHJvdXRlLCB0aGVuIHRoZSB1c2VyIHdpbGwgYmUgcmVkaXJlY3RlZCB2aWEgYGxvY2F0aW9uLmhyZWZgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnJvdXRlKHVybClgXFxuXFxuICAgIFRoaXMgY29udmVuaWVuY2UgbWV0aG9kIGFsbG93cyB5b3UgdG8gYnJlYWsgZG93biBhIFVSTCBpbnRvIGl0cyBpbmRpdmlkdWFsIGNvbXBvbmVudHMuIFRoaXMgbWV0aG9kIHNob3VsZG4ndCBiZSBuZWVkZWQgZHVyaW5nIG5vcm1hbCB1c2FnZSBvZiBUYXVudXMsIGJ1dCBpdCdzIHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnN0YXRlYFxcblxcbiAgICBUaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi5cXG5cXG4gICAgLSBgY29udGFpbmVyYCBpcyB0aGUgRE9NIGVsZW1lbnQgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgXFxuICAgIC0gYGNvbnRyb2xsZXJzYCBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGB0ZW1wbGF0ZXNgIGFyZSBhbGwgdGhlIHRlbXBsYXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZXNgIGFyZSBhbGwgdGhlIHJvdXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGBwcmVmZXRjaGAgZXhwb3NlcyB3aGV0aGVyIHByZWZldGNoaW5nIGlzIHR1cm5lZCBvblxcbiAgICAtIGBjYWNoZWAgZXhwb3NlcyB3aGV0aGVyIGNhY2hpbmcgaXMgZW5hYmxlZFxcbiAgICAtIGBtb2RlbGAgaXMgYSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsIHVzZWQgdG8gcmVuZGVyIHRoZSBjdXJyZW50IHZpZXdcXG5cXG4gICAgT2YgY291cnNlLCB5b3VyIG5vdCBzdXBwb3NlZCB0byBtZWRkbGUgd2l0aCBpdCwgc28gYmUgYSBnb29kIGNpdGl6ZW4gYW5kIGp1c3QgaW5zcGVjdCBpdHMgdmFsdWVzIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRoZSBgLnRhdW51c3JjYCBtYW5pZmVzdFxcblxcbiAgICBJZiB5b3Ugd2FudCB0byB1c2UgdmFsdWVzIG90aGVyIHRoYW4gdGhlIGNvbnZlbnRpb25hbCBkZWZhdWx0cyBzaG93biBpbiB0aGUgdGFibGUgYmVsb3csIHRoZW4geW91IHNob3VsZCBjcmVhdGUgYSBgLnRhdW51c3JjYCBmaWxlLiBOb3RlIHRoYXQgdGhlIGRlZmF1bHRzIG5lZWQgdG8gYmUgb3ZlcndyaXR0ZW4gaW4gYSBjYXNlLWJ5LWNhc2UgYmFzaXMuIFRoZXNlIG9wdGlvbnMgY2FuIGFsc28gYmUgY29uZmlndXJlZCBpbiB5b3VyIGBwYWNrYWdlLmpzb25gLCB1bmRlciB0aGUgYHRhdW51c2AgcHJvcGVydHkuXFxuXFxuICAgIGBgYGpzb25cXG4gICAge1xcbiAgICAgIFxcXCJ2aWV3c1xcXCI6IFxcXCIuYmluL3ZpZXdzXFxcIixcXG4gICAgICBcXFwic2VydmVyX3JvdXRlc1xcXCI6IFxcXCJjb250cm9sbGVycy9yb3V0ZXMuanNcXFwiLFxcbiAgICAgIFxcXCJzZXJ2ZXJfY29udHJvbGxlcnNcXFwiOiBcXFwiY29udHJvbGxlcnNcXFwiLFxcbiAgICAgIFxcXCJjbGllbnRfY29udHJvbGxlcnNcXFwiOiBcXFwiY2xpZW50L2pzL2NvbnRyb2xsZXJzXFxcIixcXG4gICAgICBcXFwiY2xpZW50X3dpcmluZ1xcXCI6IFxcXCIuYmluL3dpcmluZy5qc1xcXCJcXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgLSBUaGUgYHZpZXdzYCBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciB2aWV3cyBfKGFscmVhZHkgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0KV8gYXJlIHBsYWNlZC4gVGhlc2Ugdmlld3MgYXJlIHVzZWQgZGlyZWN0bHkgb24gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZVxcbiAgICAtIFRoZSBgc2VydmVyX3JvdXRlc2AgZmlsZSBpcyB0aGUgbW9kdWxlIHdoZXJlIHlvdSBleHBvcnQgYSBjb2xsZWN0aW9uIG9mIHJvdXRlcy4gVGhlIENMSSB3aWxsIHB1bGwgdGhlc2Ugcm91dGVzIHdoZW4gY3JlYXRpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRlcyBmb3IgdGhlIHdpcmluZyBtb2R1bGVcXG4gICAgLSBUaGUgYHNlcnZlcl9jb250cm9sbGVyc2AgZGlyZWN0b3J5IGlzIHRoZSByb290IGRpcmVjdG9yeSB3aGVyZSB5b3VyIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGxpdmUuIEl0J3MgdXNlZCB3aGVuIHNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlIHJvdXRlclxcbiAgICAtIFRoZSBgY2xpZW50X2NvbnRyb2xsZXJzYCBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciBjbGllbnQtc2lkZSBjb250cm9sbGVyIG1vZHVsZXMgbGl2ZS4gVGhlIENMSSB3aWxsIGByZXF1aXJlYCB0aGVzZSBjb250cm9sbGVycyBpbiBpdHMgcmVzdWx0aW5nIHdpcmluZyBtb2R1bGVcXG4gICAgLSBUaGUgYGNsaWVudF93aXJpbmdgIGZpbGUgaXMgd2hlcmUgeW91ciB3aXJpbmcgbW9kdWxlIHdpbGwgYmUgcGxhY2VkIGJ5IHRoZSBDTEkuIFlvdSdsbCB0aGVuIGhhdmUgdG8gYHJlcXVpcmVgIGl0IGluIHlvdXIgYXBwbGljYXRpb24gd2hlbiBib290aW5nIHVwIFRhdW51c1xcblxcbiAgICBIZXJlIGlzIHdoZXJlIHRoaW5ncyBnZXQgW2EgbGl0dGxlIGNvbnZlbnRpb25hbF1bMTJdLiBWaWV3cywgYW5kIGJvdGggc2VydmVyLXNpZGUgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleHBlY3RlZCB0byBiZSBvcmdhbml6ZWQgYnkgZm9sbG93aW5nIHRoZSBge3Jvb3R9L3tjb250cm9sbGVyfS97YWN0aW9ufWAgcGF0dGVybiwgYnV0IHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCB1c2luZyBgcmVzb2x2ZXJzYCB3aGVuIGludm9raW5nIHRoZSBDTEkgYW5kIHVzaW5nIHRoZSBzZXJ2ZXItc2lkZSBBUEkuXFxuXFxuICAgIFZpZXdzIGFuZCBjb250cm9sbGVycyBhcmUgYWxzbyBleHBlY3RlZCB0byBiZSBDb21tb25KUyBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIG1ldGhvZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgWzFdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFsyXTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzNdOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi8zMzI3MTc1MTMxMmRiNmU5MjA1OWQ5ODI5M2QwYTdhYzZlOWU4ZTViL3ZpZXdzL3NlcnZlci9sYXlvdXQvbGF5b3V0LmphZGVcXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvaGdldFxcbiAgICBbNl06IGh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb28vYmxvYi9mNmQ2YjUwNjhmZjAzYTM4N2Y1MDM5MDAxNjBkOWZkYzFlNzQ5NzUwL2NvbnRyb2xsZXJzL3JvdXRpbmcuanMjTDcwLUw3MlxcbiAgICBbN106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzhdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFs5XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFsxMF06IGh0dHBzOi8vZ2l0aHViLmNvbS91bWRqcy91bWRcXG4gICAgWzExXTogaHR0cDovL2Jyb3dzZXJpZnkub3JnXFxuICAgIFsxMl06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG4gICAgWzEzXTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9TaW5nbGUtcGFnZV9hcHBsaWNhdGlvblxcbiAgICBbMTRdOiBodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbXBsZW1lbnRzKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImNvbXBsZW1lbnRhcnktbW9kdWxlc1xcXCI+Q29tcGxlbWVudGFyeSBNb2R1bGVzPC9oMT5cXG48cD5Gb288L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBDb21wbGVtZW50YXJ5IE1vZHVsZXNcXG5cXG4gICAgRm9vXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldHRpbmdTdGFydGVkKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJnZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQmIzM5O3MgPGVtPnVwIHRvIHlvdSBob3cgdG8gdXNlIGl0PC9lbT4uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gPHN0cm9uZz5zZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0PC9zdHJvbmc+LCBhcyB0aGF0JiMzOTtsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2hvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlXFxcIj5TZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZTwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjcmVhdGluZy1hLWxheW91dFxcXCI+Q3JlYXRpbmcgYSBsYXlvdXQ8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvYT48L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJob3ctaXQtd29ya3NcXFwiPkhvdyBpdCB3b3JrczwvaDE+XFxuPHA+VGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0IDxzdHJvbmc+cHJvdmVuPC9zdHJvbmc+IHNldCBvZiBydWxlcy48L3A+XFxuPHVsPlxcbjxsaT5EZWZpbmUgYSA8Y29kZT5mdW5jdGlvbihtb2RlbCk8L2NvZGU+IGZvciBlYWNoIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5QdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvbjwvbGk+XFxuPGxpPlB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzPC9saT5cXG48bGk+Q3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzPC9saT5cXG48bGk+Q3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3PC9saT5cXG48bGk+Rm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZTwvbGk+XFxuPGxpPldoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhPC9saT5cXG48bGk+T25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgPHN0cm9uZz5oaWphY2sgbGluayBjbGlja3M8L3N0cm9uZz4gYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkPC9saT5cXG48bGk+V2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5JZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gPHN0cm9uZz5Eb24mIzM5O3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzITwvc3Ryb25nPjwvbGk+XFxuPC91bD5cXG48cD5JJiMzOTtsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2gxPlxcbjxwPkZpcnN0IG9mZiwgeW91JiMzOTtsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+dGF1bnVzLWV4cHJlc3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+LCB0aHJvdWdoIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPnRhdW51cy1oYXBpPC9hPiBhbmQgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+aGFwaWlmeTwvYT4gdHJhbnNmb3JtPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHlvdSYjMzk7cmUgbW9yZSBvZiBhIDxlbT4mcXVvdDtydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJiMzOTtzIGNvZGUmcXVvdDs8L2VtPiB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxcIj5nb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSYjMzk7cyBzb3VyY2UgY29kZTwvYT4sIHdoaWNoIHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb29cXFwiPnBvbnlmb28uY29tPC9hPiwgd2hpY2ggaXMgPHN0cm9uZz5hIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2U8L3N0cm9uZz4gdW5kZXIgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0JiMzOTtzIG9rYXkgdG9vLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldHRsZWQgZm9yIGVpdGhlciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJiMzOTtsbCB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+LiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwic2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9oND5cXG48cD5OYXR1cmFsbHksIHlvdSYjMzk7bGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSA8Y29kZT5ucG08L2NvZGU+IHRvIGdldCBzdGFydGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciBnZXR0aW5nLXN0YXJ0ZWRcXG5jZCBnZXR0aW5nLXN0YXJ0ZWRcXG5ucG0gaW5pdFxcbm5wbSBpbnN0YWxsIHRhdW51cyB0YXVudXMtZXhwcmVzcyBleHByZXNzIC0tc2F2ZVxcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbnBtIGluaXRgIG91dHB1dFxcXCI+PC9wPlxcbjxwPkxldCYjMzk7cyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSYjMzk7bGwgbmVlZCB0aGUgZmFtb3VzIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggYXBwLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUsIGxldCYjMzk7cyBkbyB0aGF0IG5vdy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge307XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QWxsIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIDxjb2RlPmFwcDwvY29kZT4uIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gaW52b2NhdGlvbi4gWW91JiMzOTtsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIDxlbT4mcXVvdDtOb3QgRm91bmQmcXVvdDs8L2VtPiB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS48L3A+XFxuPHA+SWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5UaGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0IHBhc3NlZCB0byA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBsZXQmIzM5O3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQmIzM5O3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSA8ZW0+cmVxdWlyZWQgY29uZmlndXJhdGlvbjwvZW0+LiBUaGVyZSYjMzk7cyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlczwvbGk+XFxuPGxpPjxjb2RlPmxheW91dDwvY29kZT4gc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSA8Y29kZT5tb2RlbDwvY29kZT4gYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnQ8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9oND5cXG48cD5Sb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gPHN0cm9uZz53aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZzwvc3Ryb25nPi4gTGV0JiMzOTtzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHJvdXRlcy5qc1xcbjwvY29kZT48L3ByZT5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IFtcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1cXG5dO1xcbjwvY29kZT48L3ByZT5cXG48cD5FYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSA8Y29kZT4vPC9jb2RlPiByb3V0ZSB3aXRoIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm48L2E+LCB3aGljaCBtYWRlIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvUnVieV9vbl9SYWlsc1xcXCI+UnVieSBvbiBSYWlsczwvYT4gZmFtb3VzLiA8ZW0+TWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vITwvZW0+IEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24gdXNlcyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gdmlldy4gT2YgY291cnNlLCA8ZW0+YWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbjwvZW0+LjwvcD5cXG48cD5UaW1lIHRvIGdvIGJhY2sgdG8gPGNvZGU+YXBwLmpzPC9jb2RlPiBhbmQgdXBkYXRlIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIDxlbT4obW9yZSBvbiB0aGF0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPmluIHRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4sIGJ1dCBpdCBkZWZhdWx0cyB0byA8Y29kZT57fTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkhlcmUmIzM5O3Mgd2hhdCB5b3UmIzM5O2QgZ2V0IGlmIHlvdSBhdHRlbXB0ZWQgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS8wOGxuQ2VjLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXFxcIj48L3A+XFxuPHA+VHVybnMgb3V0IHlvdSYjMzk7cmUgbWlzc2luZyBhIGxvdCBvZiB0aGluZ3MhIFRhdW51cyBpcyBxdWl0ZSBsZW5pZW50IGFuZCBpdCYjMzk7bGwgdHJ5IGl0cyBiZXN0IHRvIGxldCB5b3Uga25vdyB3aGF0IHlvdSBtaWdodCBiZSBtaXNzaW5nLCB0aG91Z2guIEFwcGFyZW50bHkgeW91IGRvbiYjMzk7dCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISA8ZW0+VGhhdCYjMzk7cyByb3VnaC48L2VtPjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvaDQ+XFxuPHA+TGV0JiMzOTtzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQmIzM5O2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBsYXlvdXQuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IDxlbT4oYXMgc2VlbiBiZWxvdyk8L2VtPiBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UmIzM5O2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgPGVtPiZxdW90O3VzZSB0aGUgZm9sbG93aW5nIGNvbWJpbmF0aW9uIG9mIHBsYWluIHRleHQgYW5kIHRoZSA8c3Ryb25nPihtYXliZSBIVE1MKTwvc3Ryb25nPiBwYXJ0aWFsIHZpZXcmcXVvdDs8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHJldHVybiAmIzM5O1RoaXMgaXMgdGhlIHBhcnRpYWw6ICZxdW90OyYjMzk7ICsgbW9kZWwucGFydGlhbCArICYjMzk7JnF1b3Q7JiMzOTs7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJiMzOTt0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCYjMzk7cyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuPC9wPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXFwiPk11c3RhY2hlPC9hPiBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCYjMzk7cyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTDwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcXCI+SmFkZTwvYT4gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSYjMzk7cyBubyBjbG9zaW5nIHRhZ3M8L2xpPlxcbjxsaT5UaGVyZSYjMzk7cyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgPGEgaHJlZj1cXFwiaHR0cDovL21vemlsbGEuZ2l0aHViLmlvL251bmp1Y2tzL1xcXCI+TW96aWxsYSYjMzk7cyBOdW5qdWNrczwvYT4sIDxhIGhyZWY9XFxcImh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcXCI+SGFuZGxlYmFyczwvYT4sIGFuZCA8YSBocmVmPVxcXCJodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcXCI+RUpTPC9hPi48L2xpPlxcbjwvdWw+XFxuPHA+UmVtZW1iZXIgdG8gYWRkIHRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHVuZGVyIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5IZXJlJiMzOTtzIHdoYXQgeW91JiMzOTtkIGdldCBpZiB5b3UgcmFuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5BdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSYjMzk7cmUgc3RpbGwgbWlzc2luZyB0aGUgcGFydGlhbCB2aWV3IGFuZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlci4gV2UgY2FuIGRvIHdpdGhvdXQgdGhlIGNvbnRyb2xsZXIsIGJ1dCBoYXZpbmcgbm8gdmlld3MgaXMga2luZCBvZiBwb2ludGxlc3Mgd2hlbiB5b3UmIzM5O3JlIHRyeWluZyB0byBnZXQgYW4gTVZDIGVuZ2luZSB1cCBhbmQgcnVubmluZywgcmlnaHQ/PC9wPlxcbjxwPllvdSYjMzk7bGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbjwvYT4uIElmIHlvdSBkb24mIzM5O3QgcHJvdmlkZSBhIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIDxjb2RlPiZsdDtwcmUmZ3Q7PC9jb2RlPiBhbmQgPGNvZGU+Jmx0O2NvZGUmZ3Q7PC9jb2RlPiB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmVcXFwiPlVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZTwvaDQ+XFxuPHA+TGV0JiMzOTtzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCB2aWV3cy9ob21lL2luZGV4LmphZGVcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2Ugd2UmIzM5O3JlIGp1c3QgZ2V0dGluZyBzdGFydGVkLCB0aGUgdmlldyB3aWxsIGp1c3QgaGF2ZSBzb21lIGJhc2ljIHN0YXRpYyBjb250ZW50LCBhbmQgdGhhdCYjMzk7cyBpdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj5wIEhlbGxvIFRhdW51cyFcXG48L2NvZGU+PC9wcmU+XFxuPHA+TmV4dCB5b3UmIzM5O2xsIHdhbnQgdG8gY29tcGlsZSB0aGUgdmlldyBpbnRvIGEgZnVuY3Rpb24uIFRvIGRvIHRoYXQgeW91IGNhbiB1c2UgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2phZHVtXFxcIj5qYWR1bTwvYT4sIGEgc3BlY2lhbGl6ZWQgSmFkZSBjb21waWxlciB0aGF0IHBsYXlzIHdlbGwgd2l0aCBUYXVudXMgYnkgYmVpbmcgYXdhcmUgb2YgPGNvZGU+cmVxdWlyZTwvY29kZT4gc3RhdGVtZW50cywgYW5kIHRodXMgc2F2aW5nIGJ5dGVzIHdoZW4gaXQgY29tZXMgdG8gY2xpZW50LXNpZGUgcmVuZGVyaW5nLiBMZXQmIzM5O3MgaW5zdGFsbCBpdCBnbG9iYWxseSwgZm9yIHRoZSBzYWtlIG9mIHRoaXMgZXhlcmNpc2UgPGVtPih5b3Ugc2hvdWxkIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHlvdSYjMzk7cmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24pPC9lbT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIGphZHVtIC1nXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRvIGNvbXBpbGUgZXZlcnkgdmlldyBpbiB0aGUgPGNvZGU+dmlld3M8L2NvZGU+IGRpcmVjdG9yeSBpbnRvIGZ1bmN0aW9ucyB0aGF0IHdvcmsgd2VsbCB3aXRoIFRhdW51cywgeW91IGNhbiB1c2UgdGhlIGNvbW1hbmQgYmVsb3cuIFRoZSA8Y29kZT4tLW91dHB1dDwvY29kZT4gZmxhZyBpbmRpY2F0ZXMgd2hlcmUgeW91IHdhbnQgdGhlIHZpZXdzIHRvIGJlIHBsYWNlZC4gV2UgY2hvc2UgdG8gdXNlIDxjb2RlPi5iaW48L2NvZGU+IGJlY2F1c2UgdGhhdCYjMzk7cyB3aGVyZSBUYXVudXMgZXhwZWN0cyB5b3VyIGNvbXBpbGVkIHZpZXdzIHRvIGJlIGJ5IGRlZmF1bHQuIEJ1dCBzaW5jZSBUYXVudXMgZm9sbG93cyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+Y29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb248L2E+IGFwcHJvYWNoLCB5b3UgY291bGQgY2hhbmdlIHRoYXQgaWYgeW91IHdhbnRlZCB0by48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+amFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbjwvY29kZT48L3ByZT5cXG48cD5Db25ncmF0dWxhdGlvbnMhIFRhdW51cyBpcyBub3cgb3BlcmF0aW9uYWwuIEFsbCB0aGF0JiMzOTtzIGxlZnQgaXMgZm9yIHlvdSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGFuZCB2aXNpdCBpdCBvbiBwb3J0IDxjb2RlPjMwMDA8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbm9wZW4gaHR0cDovL2xvY2FsaG9zdDozMDAwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhyb3dpbmctaW4tYS1jb250cm9sbGVyXFxcIj5UaHJvd2luZyBpbiBhIGNvbnRyb2xsZXI8L2g0PlxcbjxwPkNvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24mIzM5O3QgZ2V0IHZlcnkgZmFyLiBDb250cm9sbGVycyBhbGxvdyB5b3UgdG8gaGFuZGxlIHRoZSByZXF1ZXN0IGFuZCBwdXQgdG9nZXRoZXIgdGhlIG1vZGVsIHRvIGJlIHVzZWQgd2hlbiBzZW5kaW5nIGEgcmVzcG9uc2UuIENvbnRyYXJ5IHRvIHdoYXQgbW9zdCBmcmFtZXdvcmtzIHByb3Bvc2UsIFRhdW51cyBleHBlY3RzIGV2ZXJ5IGFjdGlvbiB0byBoYXZlIGl0cyBvd24gaW5kaXZpZHVhbCBjb250cm9sbGVyLiBTaW5jZSBOb2RlLmpzIG1ha2VzIGl0IGVhc3kgdG8gaW1wb3J0IGNvbXBvbmVudHMsIHRoaXMgc2V0dXAgaGVscHMgeW91IGtlZXAgeW91ciBjb2RlIG1vZHVsYXIgd2hpbGUgc3RpbGwgYmVpbmcgYWJsZSB0byByZXVzZSBsb2dpYyBieSBzaGFyaW5nIG1vZHVsZXMgYWNyb3NzIGRpZmZlcmVudCBjb250cm9sbGVycy4gTGV0JiMzOTtzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSA8Y29kZT5ob21lL3ZpZXc8L2NvZGU+IGFjdGlvbi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgY29udHJvbGxlciBtb2R1bGUgc2hvdWxkIG1lcmVseSBleHBvcnQgYSBmdW5jdGlvbi4gPGVtPlN0YXJ0ZWQgbm90aWNpbmcgdGhlIHBhdHRlcm4/PC9lbT4gVGhlIHNpZ25hdHVyZSBmb3IgdGhlIGNvbnRyb2xsZXIgaXMgdGhlIHNhbWUgc2lnbmF0dXJlIGFzIHRoYXQgb2YgYW55IG90aGVyIG1pZGRsZXdhcmUgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiA8ZW0+KG9yIGFueSByb3V0ZSBoYW5kbGVyIHBhc3NlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4gaW4gdGhlIGNhc2Ugb2YgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+KTwvZW0+LjwvcD5cXG48cD5BcyB5b3UgbWF5IGhhdmUgbm90aWNlZCBpbiB0aGUgZXhhbXBsZXMgc28gZmFyLCB5b3UgaGF2ZW4mIzM5O3QgZXZlbiBzZXQgYSBkb2N1bWVudCB0aXRsZSBmb3IgeW91ciBIVE1MIHBhZ2VzISBUdXJucyBvdXQsIHRoZXJlJiMzOTtzIGEgZmV3IG1vZGVsIHByb3BlcnRpZXMgPGVtPih2ZXJ5IGZldyk8L2VtPiB0aGF0IFRhdW51cyBpcyBhd2FyZSBvZi4gT25lIG9mIHRob3NlIGlzIHRoZSA8Y29kZT50aXRsZTwvY29kZT4gcHJvcGVydHksIGFuZCBpdCYjMzk7bGwgYmUgdXNlZCB0byBjaGFuZ2UgdGhlIDxjb2RlPmRvY3VtZW50LnRpdGxlPC9jb2RlPiBpbiB5b3VyIHBhZ2VzIHdoZW4gbmF2aWdhdGluZyB0aHJvdWdoIHRoZSBjbGllbnQtc2lkZS4gS2VlcCBpbiBtaW5kIHRoYXQgYW55dGhpbmcgdGhhdCYjMzk7cyBub3QgaW4gdGhlIDxjb2RlPm1vZGVsPC9jb2RlPiBwcm9wZXJ0eSB3b24mIzM5O3QgYmUgdHJhc21pdHRlZCB0byB0aGUgY2xpZW50LCBhbmQgd2lsbCBqdXN0IGJlIGFjY2Vzc2libGUgdG8gdGhlIGxheW91dC48L3A+XFxuPHA+SGVyZSBpcyBvdXIgbmV3ZmFuZ2xlZCA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBjb250cm9sbGVyLiBBcyB5b3UmIzM5O2xsIG5vdGljZSwgaXQgZG9lc24mIzM5O3QgZGlzcnVwdCBhbnkgb2YgdGhlIHR5cGljYWwgRXhwcmVzcyBleHBlcmllbmNlLCBidXQgbWVyZWx5IGJ1aWxkcyB1cG9uIGl0LiBXaGVuIDxjb2RlPm5leHQ8L2NvZGU+IGlzIGNhbGxlZCwgdGhlIFRhdW51cyB2aWV3LXJlbmRlcmluZyBoYW5kbGVyIHdpbGwga2ljayBpbiwgYW5kIHJlbmRlciB0aGUgdmlldyB1c2luZyB0aGUgaW5mb3JtYXRpb24gdGhhdCB3YXMgYXNzaWduZWQgdG8gPGNvZGU+cmVzLnZpZXdNb2RlbDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICByZXMudmlld01vZGVsID0ge1xcbiAgICBtb2RlbDoge1xcbiAgICAgIHRpdGxlOiAmIzM5O1dlbGNvbWUgSG9tZSwgVGF1bnVzISYjMzk7XFxuICAgIH1cXG4gIH07XFxuICBuZXh0KCk7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCByZWx5aW5nIG9uIHRoZSBjbGllbnQtc2lkZSBjaGFuZ2VzIHRvIHlvdXIgcGFnZSBpbiBvcmRlciB0byBzZXQgdGhlIHZpZXcgdGl0bGUgPGVtPndvdWxkbiYjMzk7dCBiZSBwcm9ncmVzc2l2ZTwvZW0+LCBhbmQgdGh1cyA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5pdCB3b3VsZCBiZSByZWFsbHksIDxlbT5yZWFsbHk8L2VtPiBiYWQ8L2E+LiBXZSBzaG91bGQgdXBkYXRlIHRoZSBsYXlvdXQgdG8gdXNlIHdoYXRldmVyIDxjb2RlPnRpdGxlPC9jb2RlPiBoYXMgYmVlbiBwYXNzZWQgdG8gdGhlIG1vZGVsLiBJbiBmYWN0LCBsZXQmIzM5O3MgZ28gYmFjayB0byB0aGUgZHJhd2luZyBib2FyZCBhbmQgbWFrZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIHRlbXBsYXRlISBUaGUgPGNvZGU+IT08L2NvZGU+IHN5bnRheCBtZWFucyB0aGF0IHdoYXRldmVyIGlzIGluIHRoZSB2YWx1ZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudCB3b24mIzM5O3QgYmUgZXNjYXBlZC4gVGhhdCYjMzk7cyBva2F5IGJlY2F1c2UgPGNvZGU+cGFydGlhbDwvY29kZT4gaXMgYSB2aWV3IHdoZXJlIEphZGUgZXNjYXBlZCBhbnl0aGluZyB0aGF0IG5lZWRlZCBlc2NhcGluZywgYnV0IHdlIHdvdWxkbiYjMzk7dCB3YW50IEhUTUwgdGFncyB0byBiZSBlc2NhcGVkITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWphZGVcXFwiPnRpdGxlPW1vZGVsLnRpdGxlXFxubWFpbiE9cGFydGlhbFxcbjwvY29kZT48L3ByZT5cXG48cD5CeSB0aGUgd2F5LCBkaWQgeW91IGtub3cgdGhhdCA8Y29kZT4mbHQ7aHRtbCZndDs8L2NvZGU+LCA8Y29kZT4mbHQ7aGVhZCZndDs8L2NvZGU+LCBhbmQgPGNvZGU+Jmx0O2JvZHkmZ3Q7PC9jb2RlPiBhcmUgYWxsIG9wdGlvbmFsIGluIEhUTUwgNSwgYW5kIHRoYXQgeW91IGNhbiBzYWZlbHkgb21pdCB0aGVtIGluIHlvdXIgSFRNTD8gT2YgY291cnNlLCByZW5kZXJpbmcgZW5naW5lcyB3aWxsIHN0aWxsIGluc2VydCB0aG9zZSBlbGVtZW50cyBhdXRvbWF0aWNhbGx5IGludG8gdGhlIERPTSBmb3IgeW91ISA8ZW0+SG93IGNvb2wgaXMgdGhhdD88L2VtPjwvcD5cXG48cD5UaGF0JiMzOTtzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJiMzOTtzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIDxjb2RlPm5leHQ8L2NvZGU+IHRvIHJlbmRlciB0aGUgdmlldy48L3A+XFxuPHA+VGhlcmUmIzM5O3MgYWxzbyB0aGUgY2xpZW50LXNpZGUgYXNwZWN0IG9mIHNldHRpbmcgdXAgVGF1bnVzLiBMZXQmIzM5O3Mgc2V0IGl0IHVwIGFuZCBzZWUgaG93IGl0IG9wZW5zIHVwIG91ciBwb3NzaWJpbGl0aWVzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvaDE+XFxuPHA+WW91IGFscmVhZHkga25vdyBob3cgdG8gc2V0IHVwIHRoZSBiYXNpY3MgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZywgYW5kIHlvdSBrbm93IHRoYXQgeW91IHNob3VsZCA8YSBocmVmPVxcXCIvYXBpXFxcIj5jaGVjayBvdXQgdGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiB0byBnZXQgYSBtb3JlIHRob3JvdWdoIHVuZGVyc3RhbmRpbmcgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2Ugb24gVGF1bnVzLCBhbmQgd2hhdCBpdCBlbmFibGVzIHlvdSB0byBkby48L3A+XFxuPHA+VGhlIHdheSBUYXVudXMgd29ya3Mgb24gdGhlIGNsaWVudC1zaWRlIGlzIHNvIHRoYXQgb25jZSB5b3Ugc2V0IGl0IHVwLCBpdCB3aWxsIGhpamFjayBsaW5rIGNsaWNrcyBhbmQgdXNlIEFKQVggdG8gZmV0Y2ggbW9kZWxzIGFuZCByZW5kZXIgdGhvc2Ugdmlld3MgaW4gdGhlIGNsaWVudC4gSWYgdGhlIEphdmFTY3JpcHQgY29kZSBmYWlscyB0byBsb2FkLCA8ZW0+b3IgaWYgaXQgaGFzbiYjMzk7dCBsb2FkZWQgeWV0IGR1ZSB0byBhIHNsb3cgY29ubmVjdGlvbiBzdWNoIGFzIHRob3NlIGluIHVuc3RhYmxlIG1vYmlsZSBuZXR3b3JrczwvZW0+LCB0aGUgcmVndWxhciBsaW5rIHdvdWxkIGJlIGZvbGxvd2VkIGluc3RlYWQgYW5kIG5vIGhhcm0gd291bGQgYmUgdW5sZWFzaGVkIHVwb24gdGhlIGh1bWFuLCBleGNlcHQgdGhleSB3b3VsZCBnZXQgYSBzbGlnaHRseSBsZXNzIGZhbmN5IGV4cGVyaWVuY2UuPC9wPlxcbjxwPlNldHRpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGludm9sdmVzIGEgZmV3IGRpZmZlcmVudCBzdGVwcy4gRmlyc3RseSwgd2UmIzM5O2xsIGhhdmUgdG8gY29tcGlsZSB0aGUgYXBwbGljYXRpb24mIzM5O3Mgd2lyaW5nIDxlbT4odGhlIHJvdXRlcyBhbmQgSmF2YVNjcmlwdCB2aWV3IGZ1bmN0aW9ucyk8L2VtPiBpbnRvIHNvbWV0aGluZyB0aGUgYnJvd3NlciB1bmRlcnN0YW5kcy4gVGhlbiwgeW91JiMzOTtsbCBoYXZlIHRvIG1vdW50IFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUsIHBhc3NpbmcgdGhlIHdpcmluZyBzbyB0aGF0IGl0IGtub3dzIHdoaWNoIHJvdXRlcyBpdCBzaG91bGQgcmVzcG9uZCB0bywgYW5kIHdoaWNoIG90aGVycyBpdCBzaG91bGQgbWVyZWx5IGlnbm9yZS4gT25jZSB0aGF0JiMzOTtzIG91dCBvZiB0aGUgd2F5LCBjbGllbnQtc2lkZSByb3V0aW5nIHdvdWxkIGJlIHNldCB1cC48L3A+XFxuPHA+QXMgc3VnYXIgY29hdGluZyBvbiB0b3Agb2YgdGhhdCwgeW91IG1heSBhZGQgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB1c2luZyBjb250cm9sbGVycy4gVGhlc2UgY29udHJvbGxlcnMgd291bGQgYmUgZXhlY3V0ZWQgZXZlbiBpZiB0aGUgdmlldyB3YXMgcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLiBUaGV5IGNhbiBhY2Nlc3MgdGhlIFRhdW51cyBBUEkgZGlyZWN0bHksIGluIGNhc2UgeW91IG5lZWQgdG8gbmF2aWdhdGUgdG8gYW5vdGhlciB2aWV3IGluIHNvbWUgd2F5IG90aGVyIHRoYW4gYnkgaGF2aW5nIGh1bWFucyBjbGljayBvbiBhbmNob3IgdGFncy4gVGhlIEFQSSwgYXMgeW91JiMzOTtsbCBsZWFybiwgd2lsbCBhbHNvIGxldCB5b3UgcmVuZGVyIHBhcnRpYWwgdmlld3MgdXNpbmcgdGhlIHBvd2VyZnVsIFRhdW51cyBlbmdpbmUsIGxpc3RlbiBmb3IgZXZlbnRzIHRoYXQgbWF5IG9jY3VyIGF0IGtleSBzdGFnZXMgb2YgdGhlIHZpZXctcmVuZGVyaW5nIHByb2Nlc3MsIGFuZCBldmVuIGludGVyY2VwdCBBSkFYIHJlcXVlc3RzIGJsb2NraW5nIHRoZW0gYmVmb3JlIHRoZXkgZXZlciBoYXBwZW4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLXRhdW51cy1jbGlcXFwiPlVzaW5nIHRoZSBUYXVudXMgQ0xJPC9oND5cXG48cD5UYXVudXMgY29tZXMgd2l0aCBhIENMSSB0aGF0IGNhbiBiZSB1c2VkIHRvIHdpcmUgeW91ciBOb2RlLmpzIHJvdXRlcyBhbmQgdmlld3MgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZSBzYW1lIENMSSBjYW4gYmUgdXNlZCB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcyB3ZWxsLiBUaGUgbWFpbiByZWFzb24gd2h5IHRoZSBUYXVudXMgQ0xJIGV4aXN0cyBpcyBzbyB0aGF0IHlvdSBkb24mIzM5O3QgaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiBldmVyeSBzaW5nbGUgdmlldyBhbmQgY29udHJvbGxlciwgdW5kb2luZyBhIGxvdCBvZiB0aGUgd29yayB0aGF0IHdhcyBwdXQgaW50byBjb2RlIHJldXNlLiBKdXN0IGxpa2Ugd2UgZGlkIHdpdGggPGNvZGU+amFkdW08L2NvZGU+IGVhcmxpZXIsIHdlJiMzOTtsbCBpbnN0YWxsIHRoZSA8Y29kZT50YXVudXM8L2NvZGU+IENMSSBnbG9iYWxseSBmb3IgdGhlIHNha2Ugb2YgZXhlcmNpc2luZywgYnV0IHdlIHVuZGVyc3RhbmQgdGhhdCByZWx5aW5nIG9uIGdsb2JhbGx5IGluc3RhbGxlZCBtb2R1bGVzIGlzIGluc3VmZmljaWVudCBmb3IgcHJvZHVjdGlvbi1ncmFkZSBhcHBsaWNhdGlvbnMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIHRhdW51cyAtZ1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0JiMzOTtsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcuIEluIHR5cGljYWwgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb248L2E+IGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIDxjb2RlPi5iaW4vdmlld3M8L2NvZGU+IGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4sIGJ1dCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24mIzM5O3QgbWVldCB5b3VyIG5lZWRzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXRcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LmJpbi93aXJpbmcuanM8L2NvZGU+IGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIDxjb2RlPnRhdW51czwvY29kZT4gaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCYjMzk7cyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxufTtcXG5cXG52YXIgcm91dGVzID0ge1xcbiAgJiMzOTsvJiMzOTs6IHtcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbn07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5jb250cm9sbGVyczwvY29kZT4gb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJiMzOTt0IGNyZWF0ZWQgYW55IDxlbT5jbGllbnQtc2lkZSBjb250cm9sbGVyczwvZW0+IHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJiMzOTt0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC48L3A+XFxuPHA+VGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCwgeW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoaXMgZmlsZSB3aGVuZXZlciB5b3UgYWRkLCBjaGFuZ2UsIG9yIHJlbW92ZSBhIHZpZXcsIGEgY2xpZW50LXNpZGUgY29udHJvbGxlciwgb3IgYSByb3V0ZS4gRG9pbmcgdGhhdCB3b3VsZCBiZSBjdW1iZXJzb21lLCBhbmQgdGhlIENMSSBzb2x2ZXMgdGhhdCBwcm9ibGVtIGZvciB1cyBhdCB0aGUgZXhwZW5zZSBvZiBvbmUgYWRkaXRpb25hbCBidWlsZCBzdGVwLjwvcD5cXG48cD5EdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIDxjb2RlPi0td2F0Y2g8L2NvZGU+IGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG48L2NvZGU+PC9wcmU+XFxuPHA+SWYgeW91JiMzOTtyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91JiMzOTtsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgPGNvZGU+aGFwaWlmeTwvY29kZT4gdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXJcXFwiPkJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvaDQ+XFxuPHA+T25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIDxjb2RlPmNsaWVudC9qczwvY29kZT4gdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0JiMzOTtzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggY2xpZW50L2pzL21haW4uanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPm1haW48L2NvZGU+IG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIDxlbT5lbnRyeSBwb2ludDwvZW0+IG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSYjMzk7bGwgbmVlZCB0byBpbXBvcnQgPGNvZGU+dGF1bnVzPC9jb2RlPiwgdGhlIHdpcmluZyBtb2R1bGUgd2UmIzM5O3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgd2lyaW5nID0gcmVxdWlyZSgmIzM5Oy4uLy4uLy5iaW4vd2lyaW5nJiMzOTspO1xcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJiMzOTttYWluJiMzOTspWzBdO1xcblxcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLjwvcD5cXG48cD5CeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbiYjMzk7dCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuPC9wPlxcbjxwPkFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIDxlbT50eXBpY2FsbHkgbGFyZ2VyPC9lbT4gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS48L3A+XFxuPHA+QSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCYjMzk7cyBoYXJkZXIgdG8gc2V0IHVwLjwvcD5cXG48cD5UaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj50aGUgb3B0aW1pemF0aW9uIGd1aWRlPC9hPi4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgPGVtPig8Y29kZT4mIzM5O2F1dG8mIzM5OzwvY29kZT4pPC9lbT4gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCYjMzk7cyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+LCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+LCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by48L3A+XFxuPHA+VGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSYjMzk7cmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCYjMzk7cyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJiMzOTt2ZSBiZWVuIGJ1aWxkaW5nLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5HdWVzcyB3aGF0PyBUaGUgY29udHJvbGxlciBzaG91bGQgYmUgYSBtb2R1bGUgd2hpY2ggZXhwb3J0cyBhIGZ1bmN0aW9uLiBUaGF0IGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIHdoZW5ldmVyIHRoZSB2aWV3IGlzIHJlbmRlcmVkLiBGb3IgdGhlIHNha2Ugb2Ygc2ltcGxpY2l0eSB3ZSYjMzk7bGwganVzdCBwcmludCB0aGUgYWN0aW9uIGFuZCB0aGUgbW9kZWwgdG8gdGhlIGNvbnNvbGUuIElmIHRoZXJlJiMzOTtzIG9uZSBwbGFjZSB3aGVyZSB5b3UmIzM5O2Qgd2FudCB0byBlbmhhbmNlIHRoZSBleHBlcmllbmNlLCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgd2hlcmUgeW91IHdhbnQgdG8gcHV0IHlvdXIgY29kZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwsIHJvdXRlLCBjb250YWluZXIpIHtcXG4gIGNvbnNvbGUubG9nKCYjMzk7UmVuZGVyZWQgdmlldyAlcyB1c2luZyBtb2RlbCAlcyYjMzk7LCByb3V0ZS5hY3Rpb24sIG1vZGVsKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1jbGllbnQtc2lkZS10YXVudXMtYXBpXFxcIj5Vc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSTwvaDQ+XFxuPHA+VGF1bnVzIGRvZXMgcHJvdmlkZSA8YSBocmVmPVxcXCIvYXBpXFxcIj5hIHRoaW4gQVBJPC9hPiBpbiB0aGUgY2xpZW50LXNpZGUuIFVzYWdlIG9mIHRoYXQgQVBJIGJlbG9uZ3MgbW9zdGx5IGluc2lkZSB0aGUgYm9keSBvZiBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXJzLCBidXQgdGhlcmUmIzM5O3MgYSBmZXcgbWV0aG9kcyB5b3UgY2FuIHRha2UgYWR2YW50YWdlIG9mIG9uIGEgZ2xvYmFsIHNjYWxlIGFzIHdlbGwuPC9wPlxcbjxwPlRhdW51cyBjYW4gbm90aWZ5IHlvdSB3aGVuZXZlciBpbXBvcnRhbnQgZXZlbnRzIG9jY3VyLjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+RXZlbnQ8L3RoPlxcbjx0aD5Bcmd1bWVudHM8L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7c3RhcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbiA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGZpbmlzaGVkIHRoZSByb3V0ZSBzZXR1cCBhbmQgaXMgYWJvdXQgdG8gaW52b2tlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyLiBTdWJzY3JpYmUgdG8gdGhpcyBldmVudCBiZWZvcmUgY2FsbGluZyA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7cmVuZGVyJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbDwvY29kZT48L3RkPlxcbjx0ZD5BIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guc3RhcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmRvbmUmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dCwgZGF0YTwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5LjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guYWJvcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGlzIHB1cnBvc2VseSBhYm9ydGVkLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZXJyb3ImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dCwgZXJyPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLjwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+QmVzaWRlcyBldmVudHMsIHRoZXJlJiMzOTtzIGEgY291cGxlIG1vcmUgbWV0aG9kcyB5b3UgY2FuIHVzZS4gVGhlIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT4gbWV0aG9kIGFsbG93cyB5b3UgdG8gbmF2aWdhdGUgdG8gYSBVUkwgd2l0aG91dCB0aGUgbmVlZCBmb3IgYSBodW1hbiB0byBjbGljayBvbiBhbiBhbmNob3IgbGluay4gVGhlbiB0aGVyZSYjMzk7cyA8Y29kZT50YXVudXMucGFydGlhbDwvY29kZT4sIGFuZCB0aGF0IGFsbG93cyB5b3UgdG8gcmVuZGVyIGFueSBwYXJ0aWFsIHZpZXcgb24gYSBET00gZWxlbWVudCBvZiB5b3VyIGNob29zaW5nLCBhbmQgaXQmIzM5O2xsIHRoZW4gaW52b2tlIGl0cyBjb250cm9sbGVyLiBZb3UmIzM5O2xsIG5lZWQgdG8gY29tZSB1cCB3aXRoIHRoZSBtb2RlbCB5b3Vyc2VsZiwgdGhvdWdoLjwvcD5cXG48cD5Bc3RvbmlzaGluZ2x5LCB0aGUgQVBJIGlzIGZ1cnRoZXIgZG9jdW1lbnRlZCBpbiA8YSBocmVmPVxcXCIvYXBpXFxcIj50aGUgQVBJIGRvY3VtZW50YXRpb248L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNhY2hpbmctYW5kLXByZWZldGNoaW5nXFxcIj5DYWNoaW5nIGFuZCBQcmVmZXRjaGluZzwvaDQ+XFxuPHA+PGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5QZXJmb3JtYW5jZTwvYT4gcGxheXMgYW4gaW1wb3J0YW50IHJvbGUgaW4gVGF1bnVzLiBUaGF0JiMzOTtzIHdoeSB0aGUgeW91IGNhbiBwZXJmb3JtIGNhY2hpbmcgYW5kIHByZWZldGNoaW5nIG9uIHRoZSBjbGllbnQtc2lkZSBqdXN0IGJ5IHR1cm5pbmcgb24gYSBwYWlyIG9mIGZsYWdzLiBCdXQgd2hhdCBkbyB0aGVzZSBmbGFncyBkbyBleGFjdGx5PzwvcD5cXG48cD5XaGVuIHR1cm5lZCBvbiwgYnkgcGFzc2luZyA8Y29kZT57IGNhY2hlOiB0cnVlIH08L2NvZGU+IGFzIHRoZSB0aGlyZCBwYXJhbWV0ZXIgZm9yIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4sIHRoZSBjYWNoaW5nIGxheWVyIHdpbGwgbWFrZSBzdXJlIHRoYXQgcmVzcG9uc2VzIGFyZSBrZXB0IGFyb3VuZCBmb3IgPGNvZGU+MTU8L2NvZGU+IHNlY29uZHMuIFdoZW5ldmVyIGEgcm91dGUgbmVlZHMgYSBtb2RlbCBpbiBvcmRlciB0byByZW5kZXIgYSB2aWV3LCBpdCYjMzk7bGwgZmlyc3QgYXNrIHRoZSBjYWNoaW5nIGxheWVyIGZvciBhIGZyZXNoIGNvcHkuIElmIHRoZSBjYWNoaW5nIGxheWVyIGRvZXNuJiMzOTt0IGhhdmUgYSBjb3B5LCBvciBpZiB0aGF0IGNvcHkgaXMgc3RhbGUgPGVtPihpbiB0aGlzIGNhc2UsIG9sZGVyIHRoYW4gPGNvZGU+MTU8L2NvZGU+IHNlY29uZHMpPC9lbT4sIHRoZW4gYW4gQUpBWCByZXF1ZXN0IHdpbGwgYmUgaXNzdWVkIHRvIHRoZSBzZXJ2ZXIuIE9mIGNvdXJzZSwgdGhlIGR1cmF0aW9uIGlzIGNvbmZpZ3VyYWJsZS4gSWYgeW91IHdhbnQgdG8gdXNlIGEgdmFsdWUgb3RoZXIgdGhhbiB0aGUgZGVmYXVsdCwgeW91IHNob3VsZCBzZXQgPGNvZGU+Y2FjaGU8L2NvZGU+IHRvIGEgbnVtYmVyIGluIHNlY29uZHMgaW5zdGVhZCBvZiBqdXN0IDxjb2RlPnRydWU8L2NvZGU+LjwvcD5cXG48cD5TaW5jZSBUYXVudXMgdW5kZXJzdGFuZHMgdGhhdCBub3QgZXZlcnkgdmlldyBvcGVyYXRlcyB1bmRlciB0aGUgc2FtZSBjb25zdHJhaW50cywgeW91JiMzOTtyZSBhbHNvIGFibGUgdG8gc2V0IGEgPGNvZGU+Y2FjaGU8L2NvZGU+IGZyZXNobmVzcyBkdXJhdGlvbiBkaXJlY3RseSBpbiB5b3VyIHJvdXRlcy4gVGhlIDxjb2RlPmNhY2hlPC9jb2RlPiBwcm9wZXJ0eSBpbiByb3V0ZXMgaGFzIHByZWNlZGVuY2Ugb3ZlciB0aGUgZGVmYXVsdCB2YWx1ZS48L3A+XFxuPHA+VGhlcmUmIzM5O3MgY3VycmVudGx5IHR3byBjYWNoaW5nIHN0b3JlczogYSByYXcgaW4tbWVtb3J5IHN0b3JlLCBhbmQgYW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXFwiPkluZGV4ZWREQjwvYT4gc3RvcmUuIEluZGV4ZWREQiBpcyBhbiBlbWJlZGRlZCBkYXRhYmFzZSBzb2x1dGlvbiwgYW5kIHlvdSBjYW4gdGhpbmsgb2YgaXQgbGlrZSBhbiBhc3luY2hyb25vdXMgdmVyc2lvbiBvZiA8Y29kZT5sb2NhbFN0b3JhZ2U8L2NvZGU+LiBJdCBoYXMgPGEgaHJlZj1cXFwiaHR0cDovL2Nhbml1c2UuY29tLyNmZWF0PWluZGV4ZWRkYlxcXCI+c3VycHJpc2luZ2x5IGJyb2FkIGJyb3dzZXIgc3VwcG9ydDwvYT4sIGFuZCBpbiB0aGUgY2FzZXMgd2hlcmUgaXQmIzM5O3Mgbm90IHN1cHBvcnRlZCB0aGVuIGNhY2hpbmcgaXMgZG9uZSBzb2xlbHkgaW4tbWVtb3J5LjwvcD5cXG48cD5UaGUgcHJlZmV0Y2hpbmcgbWVjaGFuaXNtIGlzIGFuIGludGVyZXN0aW5nIHNwaW4tb2ZmIG9mIGNhY2hpbmcsIGFuZCBpdCByZXF1aXJlcyBjYWNoaW5nIHRvIGJlIGVuYWJsZWQgaW4gb3JkZXIgdG8gd29yay4gV2hlbmV2ZXIgaHVtYW5zIGhvdmVyIG92ZXIgYSBsaW5rLCBvciB3aGVuZXZlciB0aGV5IHB1dCB0aGVpciBmaW5nZXIgb24gb25lIG9mIHRoZW0gPGVtPih0aGUgPGNvZGU+dG91Y2hzdGFydDwvY29kZT4gZXZlbnQpPC9lbT4sIHRoZSBwcmVmZXRjaGVyIHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBmb3IgdGhhdCBsaW5rLjwvcD5cXG48cD5JZiB0aGUgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseSB0aGVuIHRoZSByZXNwb25zZSB3aWxsIGJlIGNhY2hlZCBpbiB0aGUgc2FtZSB3YXkgYW55IG90aGVyIHZpZXcgd291bGQgYmUgY2FjaGVkLiBJZiB0aGUgaHVtYW4gaG92ZXJzIG92ZXIgYW5vdGhlciBsaW5rIHdoaWxlIHRoZSBwcmV2aW91cyBvbmUgaXMgc3RpbGwgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGUgb2xkIHJlcXVlc3QgaXMgYWJvcnRlZCwgYXMgbm90IHRvIGRyYWluIHRoZWlyIDxlbT4ocG9zc2libHkgbGltaXRlZCk8L2VtPiBJbnRlcm5ldCBjb25uZWN0aW9uIGJhbmR3aWR0aC48L3A+XFxuPHA+SWYgdGhlIGh1bWFuIGNsaWNrcyBvbiB0aGUgbGluayBiZWZvcmUgcHJlZmV0Y2hpbmcgaXMgY29tcGxldGVkLCBoZSYjMzk7bGwgbmF2aWdhdGUgdG8gdGhlIHZpZXcgYXMgc29vbiBhcyBwcmVmZXRjaGluZyBlbmRzLCByYXRoZXIgdGhhbiBmaXJpbmcgYW5vdGhlciByZXF1ZXN0LiBUaGlzIGhlbHBzIFRhdW51cyBzYXZlIHByZWNpb3VzIG1pbGxpc2Vjb25kcyB3aGVuIGRlYWxpbmcgd2l0aCBsYXRlbmN5LXNlbnNpdGl2ZSBvcGVyYXRpb25zLjwvcD5cXG48cD5UdXJuaW5nIHByZWZldGNoaW5nIG9uIGlzIHNpbXBseSBhIG1hdHRlciBvZiBzZXR0aW5nIDxjb2RlPnByZWZldGNoPC9jb2RlPiB0byA8Y29kZT50cnVlPC9jb2RlPiBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi4gRm9yIGFkZGl0aW9uYWwgaW5zaWdodHMgaW50byB0aGUgcGVyZm9ybWFuY2UgaW1wcm92ZW1lbnRzIFRhdW51cyBjYW4gb2ZmZXIsIGhlYWQgb3ZlciB0byB0aGUgPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5QZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25zPC9hPiBndWlkZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvaDE+XFxuPHA+WW91JiMzOTtyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4mIzM5O3Qgc3RvcCB0aGVyZS48L3A+XFxuPHVsPlxcbjxsaT5MZWFybiBtb3JlIGFib3V0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgVGF1bnVzIGhhczwvYT4gdG8gb2ZmZXI8L2xpPlxcbjxsaT5HbyB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPnBlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzPC9hPi4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3ITwvbGk+XFxuPGxpPjxlbT5GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50PC9lbT48dWw+XFxuPGxpPkplcmVteSBLZWl0aCBlbnVuY2lhdGVzIDxhIGhyZWY9XFxcImh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxcIj4mcXVvdDtCZSBwcm9ncmVzc2l2ZSZxdW90OzwvYT48L2xpPlxcbjxsaT5DaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciA8YSBocmVmPVxcXCJodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcXCI+JnF1b3Q7UHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyA8YSBocmVmPVxcXCJodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxcIj4mcXVvdDtQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXImcXVvdDs8L2E+PC9saT5cXG48bGk+SSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+JnF1b3Q7U3RvcCBCcmVha2luZyB0aGUgV2ViJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9yYXVjaGcuY29tLzIwMTQvNy1wcmluY2lwbGVzLW9mLXJpY2gtd2ViLWFwcGxpY2F0aW9ucy9cXFwiPiZxdW90OzcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnMmcXVvdDs8L2E+PC9saT5cXG48bGk+QWFyb24gR3VzdGFmc29uIHdyaXRlcyA8YSBocmVmPVxcXCJodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcXCI+JnF1b3Q7VW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudCZxdW90OzwvYT48L2xpPlxcbjxsaT5PcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIDxhIGhyZWY9XFxcImh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2UmcXVvdDs8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlNpZnQgdGhyb3VnaCB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXM8L2E+LiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJiMzOTt0IHRob3VnaHQgb2YhPC9saT5cXG48L3VsPlxcbjxwPkFsc28sIGdldCBpbnZvbHZlZCE8L3A+XFxuPHVsPlxcbjxsaT5Gb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW8vcHVsbHNcXFwiPnNlbmQgc29tZSBwdWxsIHJlcXVlc3RzPC9hPiB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyE8L2xpPlxcbjxsaT5TZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxcIj5wbGVhc2UgY3JlYXRlIGFuIGlzc3VlPC9hPiE8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBHZXR0aW5nIFN0YXJ0ZWRcXG5cXG4gICAgVGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQncyBfdXAgdG8geW91IGhvdyB0byB1c2UgaXRfLiBJbiBmYWN0LCBpdCBtaWdodCBiZSBhIGdvb2QgaWRlYSBmb3IgeW91IHRvICoqc2V0IHVwIGp1c3QgdGhlIHNlcnZlci1zaWRlIGFzcGVjdCBmaXJzdCoqLCBhcyB0aGF0J2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LlxcblxcbiAgICAjIFRhYmxlIG9mIENvbnRlbnRzXFxuXFxuICAgIC0gW0hvdyBpdCB3b3Jrc10oI2hvdy1pdC13b3JrcylcXG4gICAgLSBbSW5zdGFsbGluZyBUYXVudXNdKCNpbnN0YWxsaW5nLXRhdW51cylcXG4gICAgLSBbU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVdKCNzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZSlcXG4gICAgICAtIFtZb3VyIGZpcnN0IHJvdXRlXSgjeW91ci1maXJzdC1yb3V0ZSlcXG4gICAgICAtIFtDcmVhdGluZyBhIGxheW91dF0oI2NyZWF0aW5nLWEtbGF5b3V0KVxcbiAgICAgIC0gW1VzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZV0oI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZSlcXG4gICAgICAtIFtUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJdKCN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXIpXFxuICAgIC0gW1RhdW51cyBpbiB0aGUgY2xpZW50XSgjdGF1bnVzLWluLXRoZS1jbGllbnQpXFxuICAgICAgLSBbVXNpbmcgdGhlIFRhdW51cyBDTEldKCN1c2luZy10aGUtdGF1bnVzLWNsaSlcXG4gICAgICAtIFtCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJdKCNib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXIpXFxuICAgICAgLSBbQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXSgjYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyKVxcbiAgICAgIC0gW1VzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJXSgjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGkpXFxuICAgICAgLSBbQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmddKCNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZylcXG4gICAgLSBbVGhlIHNreSBpcyB0aGUgbGltaXQhXSgjdGhlLXNreS1pcy10aGUtbGltaXQtKVxcblxcbiAgICAjIEhvdyBpdCB3b3Jrc1xcblxcbiAgICBUYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgKipwcm92ZW4qKiBzZXQgb2YgcnVsZXMuXFxuXFxuICAgIC0gRGVmaW5lIGEgYGZ1bmN0aW9uKG1vZGVsKWAgZm9yIGVhY2ggeW91ciB2aWV3c1xcbiAgICAtIFB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBEZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uXFxuICAgIC0gUHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBFbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHNcXG4gICAgLSBDcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3NcXG4gICAgLSBDcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXdcXG4gICAgLSBGb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlXFxuICAgIC0gV2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCFcXG4gICAgLSBPbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCAqKmhpamFjayBsaW5rIGNsaWNrcyoqIGFuZCBtYWtlIEFKQVggcmVxdWVzdHMgaW5zdGVhZFxcbiAgICAtIFdoZW4geW91IGdldCB0aGUgSlNPTiBtb2RlbCBiYWNrLCByZW5kZXIgdmlld3Mgb24gdGhlIGNsaWVudC1zaWRlXFxuICAgIC0gSWYgdGhlIGBoaXN0b3J5YCBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiAqKkRvbid0IGNvbmZ1c2UgeW91ciBodW1hbnMgd2l0aCBvYnNjdXJlIGhhc2ggcm91dGVycyEqKlxcblxcbiAgICBJJ2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgc3RlcHMgeW91IG5lZWQgdG8gdGFrZSBpbiBvcmRlciB0byBtYWtlIHRoaXMgZmxvdyBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgSW5zdGFsbGluZyBUYXVudXNcXG5cXG4gICAgRmlyc3Qgb2ZmLCB5b3UnbGwgbmVlZCB0byBjaG9vc2UgYSBIVFRQIHNlcnZlciBmcmFtZXdvcmsgZm9yIHlvdXIgYXBwbGljYXRpb24uIEF0IHRoZSBtb21lbnQgVGF1bnVzIHN1cHBvcnRzIG9ubHkgYSBjb3VwbGUgb2YgSFRUUCBmcmFtZXdvcmtzLCBidXQgbW9yZSBtYXkgYmUgYWRkZWQgaWYgdGhleSBhcmUgcG9wdWxhciBlbm91Z2guXFxuXFxuICAgIC0gW0V4cHJlc3NdWzZdLCB0aHJvdWdoIFt0YXVudXMtZXhwcmVzc11bMV1cXG4gICAgLSBbSGFwaV1bN10sIHRocm91Z2ggW3RhdW51cy1oYXBpXVsyXSBhbmQgdGhlIFtoYXBpaWZ5XVszXSB0cmFuc2Zvcm1cXG5cXG4gICAgPiBJZiB5b3UncmUgbW9yZSBvZiBhIF9cXFwicnVtbWFnZSB0aHJvdWdoIHNvbWVvbmUgZWxzZSdzIGNvZGVcXFwiXyB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIFtnb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSdzIHNvdXJjZSBjb2RlXVs0XSwgd2hpY2ggdXNlcyB0aGUgW0hhcGldWzddIGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgW3Bvbnlmb28uY29tXVs1XSwgd2hpY2ggaXMgKiphIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2UqKiB1bmRlciB0aGUgW0V4cHJlc3NdWzZdIGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQncyBva2F5IHRvby5cXG5cXG4gICAgT25jZSB5b3UndmUgc2V0dGxlZCBmb3IgZWl0aGVyIFtFeHByZXNzXVs2XSBvciBbSGFwaV1bN10geW91J2xsIGJlIGFibGUgdG8gcHJvY2VlZC4gRm9yIHRoZSBwdXJwb3NlcyBvZiB0aGlzIGd1aWRlLCB3ZSdsbCB1c2UgW0V4cHJlc3NdWzZdLiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVcXG5cXG4gICAgTmF0dXJhbGx5LCB5b3UnbGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSBgbnBtYCB0byBnZXQgc3RhcnRlZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgZ2V0dGluZy1zdGFydGVkXFxuICAgIGNkIGdldHRpbmctc3RhcnRlZFxcbiAgICBucG0gaW5pdFxcbiAgICBucG0gaW5zdGFsbCB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzcyAtLXNhdmVcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBucG0gaW5pdGAgb3V0cHV0XVszMF1cXG5cXG4gICAgTGV0J3MgYnVpbGQgb3VyIGFwcGxpY2F0aW9uIHN0ZXAtYnktc3RlcCwgYW5kIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSdsbCBuZWVkIHRoZSBmYW1vdXMgYGFwcC5qc2AgZmlsZS5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggYXBwLmpzXFxuICAgIGBgYFxcblxcbiAgICBJdCdzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciBgYXBwLmpzYCBmaWxlLCBsZXQncyBkbyB0aGF0IG5vdy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge307XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgQWxsIGB0YXVudXMtZXhwcmVzc2AgcmVhbGx5IGRvZXMgaXMgYWRkIGEgYnVuY2ggb2Ygcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBgYXBwYC4gWW91IHNob3VsZCBub3RlIHRoYXQgYW55IG1pZGRsZXdhcmUgYW5kIEFQSSByb3V0ZXMgc2hvdWxkIHByb2JhYmx5IGNvbWUgYmVmb3JlIHRoZSBgdGF1bnVzRXhwcmVzc2AgaW52b2NhdGlvbi4gWW91J2xsIHByb2JhYmx5IGJlIHVzaW5nIGEgY2F0Y2gtYWxsIHZpZXcgcm91dGUgdGhhdCByZW5kZXJzIGEgX1xcXCJOb3QgRm91bmRcXFwiXyB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS5cXG5cXG4gICAgSWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSFcXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszMV1cXG5cXG4gICAgVGhlIGBvcHRpb25zYCBvYmplY3QgcGFzc2VkIHRvIGB0YXVudXNFeHByZXNzYCBsZXQncyB5b3UgY29uZmlndXJlIFRhdW51cy4gSW5zdGVhZCBvZiBkaXNjdXNzaW5nIGV2ZXJ5IHNpbmdsZSBjb25maWd1cmF0aW9uIG9wdGlvbiB5b3UgY291bGQgc2V0IGhlcmUsIGxldCdzIGRpc2N1c3Mgd2hhdCBtYXR0ZXJzOiB0aGUgX3JlcXVpcmVkIGNvbmZpZ3VyYXRpb25fLiBUaGVyZSdzIHR3byBvcHRpb25zIHRoYXQgeW91IG11c3Qgc2V0IGlmIHlvdSB3YW50IHlvdXIgVGF1bnVzIGFwcGxpY2F0aW9uIHRvIG1ha2UgYW55IHNlbnNlLlxcblxcbiAgICAtIGByb3V0ZXNgIHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlc1xcbiAgICAtIGBsYXlvdXRgIHNob3VsZCBiZSBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSBzaW5nbGUgYG1vZGVsYCBhcmd1bWVudCBhbmQgcmV0dXJucyBhbiBlbnRpcmUgSFRNTCBkb2N1bWVudFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFlvdXIgZmlyc3Qgcm91dGVcXG5cXG4gICAgUm91dGVzIG5lZWQgdG8gYmUgcGxhY2VkIGluIGl0cyBvd24gZGVkaWNhdGVkIG1vZHVsZSwgc28gdGhhdCB5b3UgY2FuIHJldXNlIGl0IGxhdGVyIG9uICoqd2hlbiBzZXR0aW5nIHVwIGNsaWVudC1zaWRlIHJvdXRpbmcqKi4gTGV0J3MgY3JlYXRlIHRoYXQgbW9kdWxlIGFuZCBhZGQgYSByb3V0ZSB0byBpdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggcm91dGVzLmpzXFxuICAgIGBgYFxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gW1xcbiAgICAgIHsgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfVxcbiAgICBdO1xcbiAgICBgYGBcXG5cXG4gICAgRWFjaCBpdGVtIGluIHRoZSBleHBvcnRlZCBhcnJheSBpcyBhIHJvdXRlLiBJbiB0aGlzIGNhc2UsIHdlIG9ubHkgaGF2ZSB0aGUgYC9gIHJvdXRlIHdpdGggdGhlIGBob21lL2luZGV4YCBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbiBwYXR0ZXJuXVs4XSwgd2hpY2ggbWFkZSBbUnVieSBvbiBSYWlsc11bOV0gZmFtb3VzLiBfTWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vIV8gQnkgY29udmVudGlvbiwgVGF1bnVzIHdpbGwgYXNzdW1lIHRoYXQgdGhlIGBob21lL2luZGV4YCBhY3Rpb24gdXNlcyB0aGUgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIgYW5kIHJlbmRlcnMgdGhlIGBob21lL2luZGV4YCB2aWV3LiBPZiBjb3Vyc2UsIF9hbGwgb2YgdGhhdCBjYW4gYmUgY2hhbmdlZCB1c2luZyBjb25maWd1cmF0aW9uXy5cXG5cXG4gICAgVGltZSB0byBnbyBiYWNrIHRvIGBhcHAuanNgIGFuZCB1cGRhdGUgdGhlIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBJdCdzIGltcG9ydGFudCB0byBrbm93IHRoYXQgaWYgeW91IG9taXQgdGhlIGNyZWF0aW9uIG9mIGEgY29udHJvbGxlciB0aGVuIFRhdW51cyB3aWxsIHNraXAgdGhhdCBzdGVwLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHBhc3NpbmcgaXQgd2hhdGV2ZXIgdGhlIGRlZmF1bHQgbW9kZWwgaXMgXyhtb3JlIG9uIHRoYXQgW2luIHRoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdLCBidXQgaXQgZGVmYXVsdHMgdG8gYHt9YClfLlxcblxcbiAgICBIZXJlJ3Mgd2hhdCB5b3UnZCBnZXQgaWYgeW91IGF0dGVtcHRlZCB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgY3VybCBsb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXVszMl1cXG5cXG4gICAgVHVybnMgb3V0IHlvdSdyZSBtaXNzaW5nIGEgbG90IG9mIHRoaW5ncyEgVGF1bnVzIGlzIHF1aXRlIGxlbmllbnQgYW5kIGl0J2xsIHRyeSBpdHMgYmVzdCB0byBsZXQgeW91IGtub3cgd2hhdCB5b3UgbWlnaHQgYmUgbWlzc2luZywgdGhvdWdoLiBBcHBhcmVudGx5IHlvdSBkb24ndCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISBfVGhhdCdzIHJvdWdoLl9cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDcmVhdGluZyBhIGxheW91dFxcblxcbiAgICBMZXQncyBhbHNvIGNyZWF0ZSBhIGxheW91dC4gRm9yIHRoZSBwdXJwb3NlcyBvZiBtYWtpbmcgb3VyIHdheSB0aHJvdWdoIHRoaXMgZ3VpZGUsIGl0J2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBsYXlvdXQuanNcXG4gICAgYGBgXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYHBhcnRpYWxgIHByb3BlcnR5IGluIHRoZSBgbW9kZWxgIF8oYXMgc2VlbiBiZWxvdylfIGlzIGNyZWF0ZWQgb24gdGhlIGZseSBhZnRlciByZW5kZXJpbmcgcGFydGlhbCB2aWV3cy4gVGhlIGxheW91dCBmdW5jdGlvbiB3ZSdsbCBiZSB1c2luZyBoZXJlIGVmZmVjdGl2ZWx5IG1lYW5zIF9cXFwidXNlIHRoZSBmb2xsb3dpbmcgY29tYmluYXRpb24gb2YgcGxhaW4gdGV4dCBhbmQgdGhlICoqKG1heWJlIEhUTUwpKiogcGFydGlhbCB2aWV3XFxcIl8uXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICByZXR1cm4gJ1RoaXMgaXMgdGhlIHBhcnRpYWw6IFxcXCInICsgbW9kZWwucGFydGlhbCArICdcXFwiJztcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgaWYgeW91IHdlcmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24sIHRoZW4geW91IHByb2JhYmx5IHdvdWxkbid0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCdzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy5cXG5cXG4gICAgLSBbTXVzdGFjaGVdWzEwXSBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCdzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MXFxuICAgIC0gW0phZGVdWzExXSBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJ3Mgbm8gY2xvc2luZyB0YWdzXFxuICAgIC0gVGhlcmUncyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgW01vemlsbGEncyBOdW5qdWNrc11bMTJdLCBbSGFuZGxlYmFyc11bMTNdLCBhbmQgW0VKU11bMTRdLlxcblxcbiAgICBSZW1lbWJlciB0byBhZGQgdGhlIGBsYXlvdXRgIHVuZGVyIHRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCB0byBgdGF1bnVzRXhwcmVzc2AhXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgSGVyZSdzIHdoYXQgeW91J2QgZ2V0IGlmIHlvdSByYW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgY3VybCBsb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzMzXVxcblxcbiAgICBBdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSdyZSBzdGlsbCBtaXNzaW5nIHRoZSBwYXJ0aWFsIHZpZXcgYW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLiBXZSBjYW4gZG8gd2l0aG91dCB0aGUgY29udHJvbGxlciwgYnV0IGhhdmluZyBubyB2aWV3cyBpcyBraW5kIG9mIHBvaW50bGVzcyB3aGVuIHlvdSdyZSB0cnlpbmcgdG8gZ2V0IGFuIE1WQyBlbmdpbmUgdXAgYW5kIHJ1bm5pbmcsIHJpZ2h0P1xcblxcbiAgICBZb3UnbGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlcyBzZWN0aW9uXVsxNV0uIElmIHlvdSBkb24ndCBwcm92aWRlIGEgYGxheW91dGAgcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIGA8cHJlPmAgYW5kIGA8Y29kZT5gIHRhZ3MsIHdoaWNoIG1heSBhaWQgeW91IHdoZW4gZ2V0dGluZyBzdGFydGVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZVxcblxcbiAgICBMZXQncyBnbyBhaGVhZCBhbmQgdXNlIEphZGUgYXMgdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBjaG9pY2UgZm9yIG91ciB2aWV3cy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuICAgIGBgYFxcblxcbiAgICBTaW5jZSB3ZSdyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQncyBpdC5cXG5cXG4gICAgYGBgamFkZVxcbiAgICBwIEhlbGxvIFRhdW51cyFcXG4gICAgYGBgXFxuXFxuICAgIE5leHQgeW91J2xsIHdhbnQgdG8gY29tcGlsZSB0aGUgdmlldyBpbnRvIGEgZnVuY3Rpb24uIFRvIGRvIHRoYXQgeW91IGNhbiB1c2UgW2phZHVtXVsxNl0sIGEgc3BlY2lhbGl6ZWQgSmFkZSBjb21waWxlciB0aGF0IHBsYXlzIHdlbGwgd2l0aCBUYXVudXMgYnkgYmVpbmcgYXdhcmUgb2YgYHJlcXVpcmVgIHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0J3MgaW5zdGFsbCBpdCBnbG9iYWxseSwgZm9yIHRoZSBzYWtlIG9mIHRoaXMgZXhlcmNpc2UgXyh5b3Ugc2hvdWxkIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHlvdSdyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbilfLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCBqYWR1bSAtZ1xcbiAgICBgYGBcXG5cXG4gICAgVG8gY29tcGlsZSBldmVyeSB2aWV3IGluIHRoZSBgdmlld3NgIGRpcmVjdG9yeSBpbnRvIGZ1bmN0aW9ucyB0aGF0IHdvcmsgd2VsbCB3aXRoIFRhdW51cywgeW91IGNhbiB1c2UgdGhlIGNvbW1hbmQgYmVsb3cuIFRoZSBgLS1vdXRwdXRgIGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSBgLmJpbmAgYmVjYXVzZSB0aGF0J3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbl1bMTddIGFwcHJvYWNoLCB5b3UgY291bGQgY2hhbmdlIHRoYXQgaWYgeW91IHdhbnRlZCB0by5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbiAgICBgYGBcXG5cXG4gICAgQ29uZ3JhdHVsYXRpb25zISBUYXVudXMgaXMgbm93IG9wZXJhdGlvbmFsLiBBbGwgdGhhdCdzIGxlZnQgaXMgZm9yIHlvdSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGFuZCB2aXNpdCBpdCBvbiBwb3J0IGAzMDAwYC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBvcGVuIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJcXG5cXG4gICAgQ29udHJvbGxlcnMgYXJlIGluZGVlZCBvcHRpb25hbCwgYnV0IGFuIGFwcGxpY2F0aW9uIHRoYXQgcmVuZGVycyBldmVyeSB2aWV3IHVzaW5nIHRoZSBzYW1lIG1vZGVsIHdvbid0IGdldCB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCdzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSBgaG9tZS92aWV3YCBhY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGNvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiBfU3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj9fIFRoZSBzaWduYXR1cmUgZm9yIHRoZSBjb250cm9sbGVyIGlzIHRoZSBzYW1lIHNpZ25hdHVyZSBhcyB0aGF0IG9mIGFueSBvdGhlciBtaWRkbGV3YXJlIHBhc3NlZCB0byBbRXhwcmVzc11bNl0gXyhvciBhbnkgcm91dGUgaGFuZGxlciBwYXNzZWQgdG8gW0hhcGldWzddIGluIHRoZSBjYXNlIG9mIGB0YXVudXMtaGFwaWApXy5cXG5cXG4gICAgQXMgeW91IG1heSBoYXZlIG5vdGljZWQgaW4gdGhlIGV4YW1wbGVzIHNvIGZhciwgeW91IGhhdmVuJ3QgZXZlbiBzZXQgYSBkb2N1bWVudCB0aXRsZSBmb3IgeW91ciBIVE1MIHBhZ2VzISBUdXJucyBvdXQsIHRoZXJlJ3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyBfKHZlcnkgZmV3KV8gdGhhdCBUYXVudXMgaXMgYXdhcmUgb2YuIE9uZSBvZiB0aG9zZSBpcyB0aGUgYHRpdGxlYCBwcm9wZXJ0eSwgYW5kIGl0J2xsIGJlIHVzZWQgdG8gY2hhbmdlIHRoZSBgZG9jdW1lbnQudGl0bGVgIGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0J3Mgbm90IGluIHRoZSBgbW9kZWxgIHByb3BlcnR5IHdvbid0IGJlIHRyYXNtaXR0ZWQgdG8gdGhlIGNsaWVudCwgYW5kIHdpbGwganVzdCBiZSBhY2Nlc3NpYmxlIHRvIHRoZSBsYXlvdXQuXFxuXFxuICAgIEhlcmUgaXMgb3VyIG5ld2ZhbmdsZWQgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIuIEFzIHlvdSdsbCBub3RpY2UsIGl0IGRvZXNuJ3QgZGlzcnVwdCBhbnkgb2YgdGhlIHR5cGljYWwgRXhwcmVzcyBleHBlcmllbmNlLCBidXQgbWVyZWx5IGJ1aWxkcyB1cG9uIGl0LiBXaGVuIGBuZXh0YCBpcyBjYWxsZWQsIHRoZSBUYXVudXMgdmlldy1yZW5kZXJpbmcgaGFuZGxlciB3aWxsIGtpY2sgaW4sIGFuZCByZW5kZXIgdGhlIHZpZXcgdXNpbmcgdGhlIGluZm9ybWF0aW9uIHRoYXQgd2FzIGFzc2lnbmVkIHRvIGByZXMudmlld01vZGVsYC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgICAgIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgICAgICBtb2RlbDoge1xcbiAgICAgICAgICB0aXRsZTogJ1dlbGNvbWUgSG9tZSwgVGF1bnVzISdcXG4gICAgICAgIH1cXG4gICAgICB9O1xcbiAgICAgIG5leHQoKTtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgcmVseWluZyBvbiB0aGUgY2xpZW50LXNpZGUgY2hhbmdlcyB0byB5b3VyIHBhZ2UgaW4gb3JkZXIgdG8gc2V0IHRoZSB2aWV3IHRpdGxlIF93b3VsZG4ndCBiZSBwcm9ncmVzc2l2ZV8sIGFuZCB0aHVzIFtpdCB3b3VsZCBiZSByZWFsbHksIF9yZWFsbHlfIGJhZF1bMTddLiBXZSBzaG91bGQgdXBkYXRlIHRoZSBsYXlvdXQgdG8gdXNlIHdoYXRldmVyIGB0aXRsZWAgaGFzIGJlZW4gcGFzc2VkIHRvIHRoZSBtb2RlbC4gSW4gZmFjdCwgbGV0J3MgZ28gYmFjayB0byB0aGUgZHJhd2luZyBib2FyZCBhbmQgbWFrZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIHRlbXBsYXRlISBUaGUgYCE9YCBzeW50YXggbWVhbnMgdGhhdCB3aGF0ZXZlciBpcyBpbiB0aGUgdmFsdWUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgd29uJ3QgYmUgZXNjYXBlZC4gVGhhdCdzIG9rYXkgYmVjYXVzZSBgcGFydGlhbGAgaXMgYSB2aWV3IHdoZXJlIEphZGUgZXNjYXBlZCBhbnl0aGluZyB0aGF0IG5lZWRlZCBlc2NhcGluZywgYnV0IHdlIHdvdWxkbid0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhXFxuXFxuICAgIGBgYGphZGVcXG4gICAgdGl0bGU9bW9kZWwudGl0bGVcXG4gICAgbWFpbiE9cGFydGlhbFxcbiAgICBgYGBcXG5cXG4gICAgQnkgdGhlIHdheSwgZGlkIHlvdSBrbm93IHRoYXQgYDxodG1sPmAsIGA8aGVhZD5gLCBhbmQgYDxib2R5PmAgYXJlIGFsbCBvcHRpb25hbCBpbiBIVE1MIDUsIGFuZCB0aGF0IHlvdSBjYW4gc2FmZWx5IG9taXQgdGhlbSBpbiB5b3VyIEhUTUw/IE9mIGNvdXJzZSwgcmVuZGVyaW5nIGVuZ2luZXMgd2lsbCBzdGlsbCBpbnNlcnQgdGhvc2UgZWxlbWVudHMgYXV0b21hdGljYWxseSBpbnRvIHRoZSBET00gZm9yIHlvdSEgX0hvdyBjb29sIGlzIHRoYXQ/X1xcblxcbiAgICBUaGF0J3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUncyBub3RoaW5nIHN0b3BwaW5nIHlvdSBmcm9tIGFkZGluZyBkYXRhYmFzZSBjYWxscyB0byBmZXRjaCBiaXRzIGFuZCBwaWVjZXMgb2YgdGhlIG1vZGVsIGJlZm9yZSBpbnZva2luZyBgbmV4dGAgdG8gcmVuZGVyIHRoZSB2aWV3LlxcblxcbiAgICBUaGVyZSdzIGFsc28gdGhlIGNsaWVudC1zaWRlIGFzcGVjdCBvZiBzZXR0aW5nIHVwIFRhdW51cy4gTGV0J3Mgc2V0IGl0IHVwIGFuZCBzZWUgaG93IGl0IG9wZW5zIHVwIG91ciBwb3NzaWJpbGl0aWVzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRhdW51cyBpbiB0aGUgY2xpZW50XFxuXFxuICAgIFlvdSBhbHJlYWR5IGtub3cgaG93IHRvIHNldCB1cCB0aGUgYmFzaWNzIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmcsIGFuZCB5b3Uga25vdyB0aGF0IHlvdSBzaG91bGQgW2NoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSB0byBnZXQgYSBtb3JlIHRob3JvdWdoIHVuZGVyc3RhbmRpbmcgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2Ugb24gVGF1bnVzLCBhbmQgd2hhdCBpdCBlbmFibGVzIHlvdSB0byBkby5cXG5cXG4gICAgVGhlIHdheSBUYXVudXMgd29ya3Mgb24gdGhlIGNsaWVudC1zaWRlIGlzIHNvIHRoYXQgb25jZSB5b3Ugc2V0IGl0IHVwLCBpdCB3aWxsIGhpamFjayBsaW5rIGNsaWNrcyBhbmQgdXNlIEFKQVggdG8gZmV0Y2ggbW9kZWxzIGFuZCByZW5kZXIgdGhvc2Ugdmlld3MgaW4gdGhlIGNsaWVudC4gSWYgdGhlIEphdmFTY3JpcHQgY29kZSBmYWlscyB0byBsb2FkLCBfb3IgaWYgaXQgaGFzbid0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzXywgdGhlIHJlZ3VsYXIgbGluayB3b3VsZCBiZSBmb2xsb3dlZCBpbnN0ZWFkIGFuZCBubyBoYXJtIHdvdWxkIGJlIHVubGVhc2hlZCB1cG9uIHRoZSBodW1hbiwgZXhjZXB0IHRoZXkgd291bGQgZ2V0IGEgc2xpZ2h0bHkgbGVzcyBmYW5jeSBleHBlcmllbmNlLlxcblxcbiAgICBTZXR0aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBpbnZvbHZlcyBhIGZldyBkaWZmZXJlbnQgc3RlcHMuIEZpcnN0bHksIHdlJ2xsIGhhdmUgdG8gY29tcGlsZSB0aGUgYXBwbGljYXRpb24ncyB3aXJpbmcgXyh0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKV8gaW50byBzb21ldGhpbmcgdGhlIGJyb3dzZXIgdW5kZXJzdGFuZHMuIFRoZW4sIHlvdSdsbCBoYXZlIHRvIG1vdW50IFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUsIHBhc3NpbmcgdGhlIHdpcmluZyBzbyB0aGF0IGl0IGtub3dzIHdoaWNoIHJvdXRlcyBpdCBzaG91bGQgcmVzcG9uZCB0bywgYW5kIHdoaWNoIG90aGVycyBpdCBzaG91bGQgbWVyZWx5IGlnbm9yZS4gT25jZSB0aGF0J3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLlxcblxcbiAgICBBcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UnbGwgbGVhcm4sIHdpbGwgYWxzbyBsZXQgeW91IHJlbmRlciBwYXJ0aWFsIHZpZXdzIHVzaW5nIHRoZSBwb3dlcmZ1bCBUYXVudXMgZW5naW5lLCBsaXN0ZW4gZm9yIGV2ZW50cyB0aGF0IG1heSBvY2N1ciBhdCBrZXkgc3RhZ2VzIG9mIHRoZSB2aWV3LXJlbmRlcmluZyBwcm9jZXNzLCBhbmQgZXZlbiBpbnRlcmNlcHQgQUpBWCByZXF1ZXN0cyBibG9ja2luZyB0aGVtIGJlZm9yZSB0aGV5IGV2ZXIgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBUYXVudXMgQ0xJXFxuXFxuICAgIFRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbid0IGhhdmUgdG8gYHJlcXVpcmVgIGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCBgamFkdW1gIGVhcmxpZXIsIHdlJ2xsIGluc3RhbGwgdGhlIGB0YXVudXNgIENMSSBnbG9iYWxseSBmb3IgdGhlIHNha2Ugb2YgZXhlcmNpc2luZywgYnV0IHdlIHVuZGVyc3RhbmQgdGhhdCByZWx5aW5nIG9uIGdsb2JhbGx5IGluc3RhbGxlZCBtb2R1bGVzIGlzIGluc3VmZmljaWVudCBmb3IgcHJvZHVjdGlvbi1ncmFkZSBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIHRhdW51cyAtZ1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIENMSSBpcyB0ZXJzZSBpbiBib3RoIGl0cyBpbnB1dHMgYW5kIGl0cyBvdXRwdXRzLiBJZiB5b3UgcnVuIGl0IHdpdGhvdXQgYW55IGFyZ3VtZW50cyBpdCdsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgYC0tb3V0cHV0YCBmbGFnLiBJbiB0eXBpY2FsIFtjb252ZW50aW9uLW92ZXItY29uZmlndXJhdGlvbl1bOF0gZmFzaGlvbiwgdGhlIENMSSB3aWxsIGRlZmF1bHQgdG8gaW5mZXJyaW5nIHlvdXIgdmlld3MgYXJlIGxvY2F0ZWQgaW4gYC5iaW4vdmlld3NgIGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiBgLmJpbi93aXJpbmcuanNgLCBidXQgeW91J2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24ndCBtZWV0IHlvdXIgbmVlZHMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dFxcbiAgICBgYGBcXG5cXG4gICAgQXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgYC5iaW4vd2lyaW5nLmpzYCBmaWxlIHdpdGggdGhlIGNvbnRlbnRzIGRldGFpbGVkIGJlbG93LiBBcyB5b3UgY2FuIHNlZSwgZXZlbiBpZiBgdGF1bnVzYCBpcyBhbiBhdXRvbWF0ZWQgY29kZS1nZW5lcmF0aW9uIHRvb2wsIGl0J3Mgb3V0cHV0IGlzIGFzIGh1bWFuIHJlYWRhYmxlIGFzIGFueSBvdGhlciBtb2R1bGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRlbXBsYXRlcyA9IHtcXG4gICAgICAnaG9tZS9pbmRleCc6IHJlcXVpcmUoJy4vdmlld3MvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciBjb250cm9sbGVycyA9IHtcXG4gICAgfTtcXG5cXG4gICAgdmFyIHJvdXRlcyA9IHtcXG4gICAgICAnLyc6IHtcXG4gICAgICAgIGFjdGlvbjogJ2hvbWUvaW5kZXgnXFxuICAgICAgfVxcbiAgICB9O1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcXG4gICAgICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gICAgICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICAgICAgcm91dGVzOiByb3V0ZXNcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYGNvbnRyb2xsZXJzYCBvYmplY3QgaXMgZW1wdHkgYmVjYXVzZSB5b3UgaGF2ZW4ndCBjcmVhdGVkIGFueSBfY2xpZW50LXNpZGUgY29udHJvbGxlcnNfIHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJ3QgaGF2ZSBhbnkgZWZmZWN0IGluIHRoZSBjbGllbnQtc2lkZSwgYmVzaWRlcyBkZXRlcm1pbmluZyB3aGF0IGdldHMgc2VudCB0byB0aGUgY2xpZW50LlxcblxcbiAgICBUaGUgQ0xJIGNhbiBiZSBlbnRpcmVseSBpZ25vcmVkLCB5b3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhpcyBmaWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuXFxuXFxuICAgIER1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgYC0td2F0Y2hgIGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG4gICAgYGBgXFxuXFxuICAgIElmIHlvdSdyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91J2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSBgaGFwaWlmeWAgdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuICAgIGBgYFxcblxcbiAgICBOb3cgdGhhdCB5b3UgdW5kZXJzdGFuZCBob3cgdG8gdXNlIHRoZSBDTEkgb3IgYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgb24geW91ciBvd24sIGJvb3RpbmcgdXAgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSB3aWxsIGJlIGFuIGVhc3kgdGhpbmcgdG8gZG8hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXFxuXFxuICAgIE9uY2Ugd2UgaGF2ZSB0aGUgd2lyaW5nIG1vZHVsZSwgYm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgZW5naW5lIGlzIHByZXR0eSBlYXN5LiBUYXVudXMgc3VnZ2VzdHMgeW91IHVzZSBgY2xpZW50L2pzYCB0byBrZWVwIGFsbCBvZiB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgbG9naWMsIGJ1dCB0aGF0IGlzIHVwIHRvIHlvdSB0b28uIEZvciB0aGUgc2FrZSBvZiB0aGlzIGd1aWRlLCBsZXQncyBzdGljayB0byB0aGUgY29udmVudGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGNsaWVudC9qcy9tYWluLmpzXFxuICAgIGBgYFxcblxcbiAgICBUaGUgYG1haW5gIG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIF9lbnRyeSBwb2ludF8gb2YgeW91ciBhcHBsaWNhdGlvbiBvbiB0aGUgY2xpZW50LXNpZGUuIEhlcmUgeW91J2xsIG5lZWQgdG8gaW1wb3J0IGB0YXVudXNgLCB0aGUgd2lyaW5nIG1vZHVsZSB3ZSd2ZSBqdXN0IGJ1aWx0LCBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIERPTSBlbGVtZW50IHdoZXJlIHlvdSBhcmUgcmVuZGVyaW5nIHlvdXIgcGFydGlhbCB2aWV3cy4gT25jZSB5b3UgaGF2ZSBhbGwgdGhhdCwgeW91IGNhbiBpbnZva2UgYHRhdW51cy5tb3VudGAuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcXG4gICAgdmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbWFpbicpWzBdO1xcblxcbiAgICB0YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBtb3VudHBvaW50IHdpbGwgc2V0IHVwIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgcm91dGVyIGFuZCBmaXJlIHRoZSBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXIgZm9yIHRoZSB2aWV3IHRoYXQgaGFzIGJlZW4gcmVuZGVyZWQgaW4gdGhlIHNlcnZlci1zaWRlLiBXaGVuZXZlciBhbiBhbmNob3IgbGluayBpcyBjbGlja2VkLCBUYXVudXMgd2lsbCBiZSBhYmxlIHRvIGhpamFjayB0aGF0IGNsaWNrIGFuZCByZXF1ZXN0IHRoZSBtb2RlbCB1c2luZyBBSkFYLCBidXQgb25seSBpZiBpdCBtYXRjaGVzIGEgdmlldyByb3V0ZS4gT3RoZXJ3aXNlIHRoZSBsaW5rIHdpbGwgYmVoYXZlIGp1c3QgbGlrZSBhbnkgbm9ybWFsIGxpbmsgd291bGQuXFxuXFxuICAgIEJ5IGRlZmF1bHQsIHRoZSBtb3VudHBvaW50IHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldy4gVGhpcyBpcyBha2luIHRvIHdoYXQgZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBmcmFtZXdvcmtzIHN1Y2ggYXMgQW5ndWxhckpTIGRvLCB3aGVyZSB2aWV3cyBhcmUgb25seSByZW5kZXJlZCBhZnRlciBhbGwgdGhlIEphdmFTY3JpcHQgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBhbmQgZXhlY3V0ZWQuIEV4Y2VwdCBUYXVudXMgcHJvdmlkZXMgaHVtYW4tcmVhZGFibGUgY29udGVudCBmYXN0ZXIsIGJlZm9yZSB0aGUgSmF2YVNjcmlwdCBldmVuIGJlZ2lucyBkb3dubG9hZGluZywgYWx0aG91Z2ggaXQgd29uJ3QgYmUgZnVuY3Rpb25hbCB1bnRpbCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBydW5zLlxcblxcbiAgICBBbiBhbHRlcm5hdGl2ZSBpcyB0byBpbmxpbmUgdGhlIHZpZXcgbW9kZWwgYWxvbmdzaWRlIHRoZSB2aWV3cyBpbiBhIGA8c2NyaXB0IHR5cGU9J3RleHQvdGF1bnVzJz5gIHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIF90eXBpY2FsbHkgbGFyZ2VyXyB0aGFuIHRoZSByZXN1bHRpbmcgdmlld3MpLlxcblxcbiAgICBBIHRoaXJkIHN0cmF0ZWd5IGlzIHRoYXQgeW91IHJlcXVlc3QgdGhlIG1vZGVsIGFzeW5jaHJvbm91c2x5IG91dHNpZGUgb2YgVGF1bnVzLCBhbGxvd2luZyB5b3UgdG8gZmV0Y2ggYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGl0c2VsZiBjb25jdXJyZW50bHksIGJ1dCB0aGF0J3MgaGFyZGVyIHRvIHNldCB1cC5cXG5cXG4gICAgVGhlIHRocmVlIGJvb3Rpbmcgc3RyYXRlZ2llcyBhcmUgZXhwbGFpbmVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gW3RoZSBvcHRpbWl6YXRpb24gZ3VpZGVdWzI1XS4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgXyhgJ2F1dG8nYClfIHNob3VsZCBzdWZmaWNlLiBJdCBmZXRjaGVzIHRoZSB2aWV3IG1vZGVsIHVzaW5nIGFuIEFKQVggcmVxdWVzdCByaWdodCBhZnRlciBUYXVudXMgbG9hZHMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIHJ1biB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQsIGV2ZW4gaWYgaXQncyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgYG1vZGVsYCwgY29udGFpbmluZyB0aGUgbW9kZWwgdGhhdCB3YXMgdXNlZCB0byByZW5kZXIgdGhlIHZpZXc7IHRoZSBgcm91dGVgLCBicm9rZW4gZG93biBpbnRvIGl0cyBjb21wb25lbnRzOyBhbmQgdGhlIGBjb250YWluZXJgLCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by5cXG5cXG4gICAgVGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSdyZSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2luZyB0aGUgYXBwbGljYXRpb246IGl0IG1pZ2h0IG5vdCBldmVuIGJlIG5lY2Vzc2FyeSEgTGV0J3MgYWRkIHNvbWUgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byB0aGUgZXhhbXBsZSB3ZSd2ZSBiZWVuIGJ1aWxkaW5nLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbiAgICBgYGBcXG5cXG4gICAgR3Vlc3Mgd2hhdD8gVGhlIGNvbnRyb2xsZXIgc2hvdWxkIGJlIGEgbW9kdWxlIHdoaWNoIGV4cG9ydHMgYSBmdW5jdGlvbi4gVGhhdCBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aGVuZXZlciB0aGUgdmlldyBpcyByZW5kZXJlZC4gRm9yIHRoZSBzYWtlIG9mIHNpbXBsaWNpdHkgd2UnbGwganVzdCBwcmludCB0aGUgYWN0aW9uIGFuZCB0aGUgbW9kZWwgdG8gdGhlIGNvbnNvbGUuIElmIHRoZXJlJ3Mgb25lIHBsYWNlIHdoZXJlIHlvdSdkIHdhbnQgdG8gZW5oYW5jZSB0aGUgZXhwZXJpZW5jZSwgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIHdoZXJlIHlvdSB3YW50IHRvIHB1dCB5b3VyIGNvZGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwsIHJvdXRlLCBjb250YWluZXIpIHtcXG4gICAgICBjb25zb2xlLmxvZygnUmVuZGVyZWQgdmlldyAlcyB1c2luZyBtb2RlbCAlcycsIHJvdXRlLmFjdGlvbiwgbW9kZWwpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSVxcblxcbiAgICBUYXVudXMgZG9lcyBwcm92aWRlIFthIHRoaW4gQVBJXVsxOF0gaW4gdGhlIGNsaWVudC1zaWRlLiBVc2FnZSBvZiB0aGF0IEFQSSBiZWxvbmdzIG1vc3RseSBpbnNpZGUgdGhlIGJvZHkgb2YgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVycywgYnV0IHRoZXJlJ3MgYSBmZXcgbWV0aG9kcyB5b3UgY2FuIHRha2UgYWR2YW50YWdlIG9mIG9uIGEgZ2xvYmFsIHNjYWxlIGFzIHdlbGwuXFxuXFxuICAgIFRhdW51cyBjYW4gbm90aWZ5IHlvdSB3aGVuZXZlciBpbXBvcnRhbnQgZXZlbnRzIG9jY3VyLlxcblxcbiAgICBFdmVudCAgICAgICAgICAgIHwgQXJndW1lbnRzICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgJ3N0YXJ0J2AgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2ZldGNoLnN0YXJ0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy5cXG4gICAgYCdmZXRjaC5kb25lJ2AgICB8ICBgcm91dGUsIGNvbnRleHQsIGRhdGFgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS5cXG4gICAgYCdmZXRjaC5hYm9ydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC5cXG4gICAgYCdmZXRjaC5lcnJvcidgICB8ICBgcm91dGUsIGNvbnRleHQsIGVycmAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuXFxuXFxuICAgIEJlc2lkZXMgZXZlbnRzLCB0aGVyZSdzIGEgY291cGxlIG1vcmUgbWV0aG9kcyB5b3UgY2FuIHVzZS4gVGhlIGB0YXVudXMubmF2aWdhdGVgIG1ldGhvZCBhbGxvd3MgeW91IHRvIG5hdmlnYXRlIHRvIGEgVVJMIHdpdGhvdXQgdGhlIG5lZWQgZm9yIGEgaHVtYW4gdG8gY2xpY2sgb24gYW4gYW5jaG9yIGxpbmsuIFRoZW4gdGhlcmUncyBgdGF1bnVzLnBhcnRpYWxgLCBhbmQgdGhhdCBhbGxvd3MgeW91IHRvIHJlbmRlciBhbnkgcGFydGlhbCB2aWV3IG9uIGEgRE9NIGVsZW1lbnQgb2YgeW91ciBjaG9vc2luZywgYW5kIGl0J2xsIHRoZW4gaW52b2tlIGl0cyBjb250cm9sbGVyLiBZb3UnbGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guXFxuXFxuICAgIEFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDYWNoaW5nIGFuZCBQcmVmZXRjaGluZ1xcblxcbiAgICBbUGVyZm9ybWFuY2VdWzI1XSBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQncyB3aHkgdGhlIHlvdSBjYW4gcGVyZm9ybSBjYWNoaW5nIGFuZCBwcmVmZXRjaGluZyBvbiB0aGUgY2xpZW50LXNpZGUganVzdCBieSB0dXJuaW5nIG9uIGEgcGFpciBvZiBmbGFncy4gQnV0IHdoYXQgZG8gdGhlc2UgZmxhZ3MgZG8gZXhhY3RseT9cXG5cXG4gICAgV2hlbiB0dXJuZWQgb24sIGJ5IHBhc3NpbmcgYHsgY2FjaGU6IHRydWUgfWAgYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgYHRhdW51cy5tb3VudGAsIHRoZSBjYWNoaW5nIGxheWVyIHdpbGwgbWFrZSBzdXJlIHRoYXQgcmVzcG9uc2VzIGFyZSBrZXB0IGFyb3VuZCBmb3IgYDE1YCBzZWNvbmRzLiBXaGVuZXZlciBhIHJvdXRlIG5lZWRzIGEgbW9kZWwgaW4gb3JkZXIgdG8gcmVuZGVyIGEgdmlldywgaXQnbGwgZmlyc3QgYXNrIHRoZSBjYWNoaW5nIGxheWVyIGZvciBhIGZyZXNoIGNvcHkuIElmIHRoZSBjYWNoaW5nIGxheWVyIGRvZXNuJ3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSBfKGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiBgMTVgIHNlY29uZHMpXywgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyIGluIHNlY29uZHMgaW5zdGVhZCBvZiBqdXN0IGB0cnVlYC5cXG5cXG4gICAgU2luY2UgVGF1bnVzIHVuZGVyc3RhbmRzIHRoYXQgbm90IGV2ZXJ5IHZpZXcgb3BlcmF0ZXMgdW5kZXIgdGhlIHNhbWUgY29uc3RyYWludHMsIHlvdSdyZSBhbHNvIGFibGUgdG8gc2V0IGEgYGNhY2hlYCBmcmVzaG5lc3MgZHVyYXRpb24gZGlyZWN0bHkgaW4geW91ciByb3V0ZXMuIFRoZSBgY2FjaGVgIHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLlxcblxcbiAgICBUaGVyZSdzIGN1cnJlbnRseSB0d28gY2FjaGluZyBzdG9yZXM6IGEgcmF3IGluLW1lbW9yeSBzdG9yZSwgYW5kIGFuIFtJbmRleGVkREJdWzI4XSBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIGBsb2NhbFN0b3JhZ2VgLiBJdCBoYXMgW3N1cnByaXNpbmdseSBicm9hZCBicm93c2VyIHN1cHBvcnRdWzI5XSwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCdzIG5vdCBzdXBwb3J0ZWQgdGhlbiBjYWNoaW5nIGlzIGRvbmUgc29sZWx5IGluLW1lbW9yeS5cXG5cXG4gICAgVGhlIHByZWZldGNoaW5nIG1lY2hhbmlzbSBpcyBhbiBpbnRlcmVzdGluZyBzcGluLW9mZiBvZiBjYWNoaW5nLCBhbmQgaXQgcmVxdWlyZXMgY2FjaGluZyB0byBiZSBlbmFibGVkIGluIG9yZGVyIHRvIHdvcmsuIFdoZW5ldmVyIGh1bWFucyBob3ZlciBvdmVyIGEgbGluaywgb3Igd2hlbmV2ZXIgdGhleSBwdXQgdGhlaXIgZmluZ2VyIG9uIG9uZSBvZiB0aGVtIF8odGhlIGB0b3VjaHN0YXJ0YCBldmVudClfLCB0aGUgcHJlZmV0Y2hlciB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgZm9yIHRoYXQgbGluay5cXG5cXG4gICAgSWYgdGhlIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkgdGhlbiB0aGUgcmVzcG9uc2Ugd2lsbCBiZSBjYWNoZWQgaW4gdGhlIHNhbWUgd2F5IGFueSBvdGhlciB2aWV3IHdvdWxkIGJlIGNhY2hlZC4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGFub3RoZXIgbGluayB3aGlsZSB0aGUgcHJldmlvdXMgb25lIGlzIHN0aWxsIGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhlIG9sZCByZXF1ZXN0IGlzIGFib3J0ZWQsIGFzIG5vdCB0byBkcmFpbiB0aGVpciBfKHBvc3NpYmx5IGxpbWl0ZWQpXyBJbnRlcm5ldCBjb25uZWN0aW9uIGJhbmR3aWR0aC5cXG5cXG4gICAgSWYgdGhlIGh1bWFuIGNsaWNrcyBvbiB0aGUgbGluayBiZWZvcmUgcHJlZmV0Y2hpbmcgaXMgY29tcGxldGVkLCBoZSdsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuXFxuXFxuICAgIFR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgYHByZWZldGNoYCB0byBgdHJ1ZWAgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgLiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSBbUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uc11bMjVdIGd1aWRlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRoZSBza3kgaXMgdGhlIGxpbWl0IVxcblxcbiAgICBZb3UncmUgbm93IGZhbWlsaWFyIHdpdGggaG93IFRhdW51cyB3b3JrcyBvbiBhIGhpZ2gtbGV2ZWwuIFlvdSBoYXZlIGNvdmVyZWQgYSBkZWNlbnQgYW1vdW50IG9mIGdyb3VuZCwgYnV0IHlvdSBzaG91bGRuJ3Qgc3RvcCB0aGVyZS5cXG5cXG4gICAgLSBMZWFybiBtb3JlIGFib3V0IFt0aGUgQVBJIFRhdW51cyBoYXNdWzE4XSB0byBvZmZlclxcbiAgICAtIEdvIHRocm91Z2ggdGhlIFtwZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gdGlwc11bMjVdLiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchXFxuICAgIC0gX0ZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnRfXFxuICAgICAgLSBKZXJlbXkgS2VpdGggZW51bmNpYXRlcyBbXFxcIkJlIHByb2dyZXNzaXZlXFxcIl1bMjBdXFxuICAgICAgLSBDaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciBbXFxcIlByYWdtYXRpYyBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudFxcXCJdWzI2XVxcbiAgICAgIC0gSmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IFtcXFwiUHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgaXMgZmFzdGVyXFxcIl1bMjJdXFxuICAgICAgLSBJIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCBbXFxcIlN0b3AgQnJlYWtpbmcgdGhlIFdlYlxcXCJdWzE3XVxcbiAgICAgIC0gR3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgW1xcXCI3IFByaW5jaXBsZXMgb2YgUmljaCBXZWIgQXBwbGljYXRpb25zXFxcIl1bMjRdXFxuICAgICAgLSBBYXJvbiBHdXN0YWZzb24gd3JpdGVzIFtcXFwiVW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudFxcXCJdWzIxXVxcbiAgICAgIC0gT3JkZSBTYXVuZGVycyBnaXZlcyBoaXMgcG9pbnQgb2YgdmlldyBpbiBbXFxcIlByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2VcXFwiXVsyM11cXG4gICAgLSBTaWZ0IHRocm91Z2ggdGhlIFtjb21wbGVtZW50YXJ5IG1vZHVsZXNdWzE1XS4gWW91IG1heSBmaW5kIHNvbWV0aGluZyB5b3UgaGFkbid0IHRob3VnaHQgb2YhXFxuXFxuICAgIEFsc28sIGdldCBpbnZvbHZlZCFcXG5cXG4gICAgLSBGb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgW3NlbmQgc29tZSBwdWxsIHJlcXVlc3RzXVsxOV0gdG8gaW1wcm92ZSB0aGVzZSBndWlkZXMhXFxuICAgIC0gU2VlIHNvbWV0aGluZywgc2F5IHNvbWV0aGluZyEgSWYgeW91IGRldGVjdCBhIGJ1ZywgW3BsZWFzZSBjcmVhdGUgYW4gaXNzdWVdWzI3XSFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgWzFdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxuICAgIFsyXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcbiAgICBbM106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxuICAgIFs1XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvb1xcbiAgICBbNl06IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs3XTogaHR0cDovL2hhcGlqcy5jb21cXG4gICAgWzhdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxuICAgIFs5XTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9SdWJ5X29uX1JhaWxzXFxuICAgIFsxMF06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYW5sL211c3RhY2hlLmpzXFxuICAgIFsxMV06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcbiAgICBbMTJdOiBodHRwOi8vbW96aWxsYS5naXRodWIuaW8vbnVuanVja3MvXFxuICAgIFsxM106IGh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcbiAgICBbMTRdOiBodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcbiAgICBbMTVdOiAvY29tcGxlbWVudHNcXG4gICAgWzE2XTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2phZHVtXFxuICAgIFsxN106IGh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG4gICAgWzE4XTogL2FwaVxcbiAgICBbMTldOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcbiAgICBbMjBdOiBodHRwczovL2FkYWN0aW8uY29tL2pvdXJuYWwvNzcwNlxcbiAgICBbMjFdOiBodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcbiAgICBbMjJdOiBodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxuICAgIFsyM106IGh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXG4gICAgWzI0XTogaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcbiAgICBbMjVdOiAvcGVyZm9ybWFuY2VcXG4gICAgWzI2XTogaHR0cDovL2ljYW50LmNvLnVrL2FydGljbGVzL3ByYWdtYXRpYy1wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC9cXG4gICAgWzI3XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMvaXNzdWVzL25ld1xcbiAgICBbMjhdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbMjldOiBodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxuICAgIFszMF06IGh0dHA6Ly9pLmltZ3VyLmNvbS80UDh2TmU5LnBuZ1xcbiAgICBbMzFdOiBodHRwOi8vaS5pbWd1ci5jb20vbjhtSDRtTi5wbmdcXG4gICAgWzMyXTogaHR0cDovL2kuaW1ndXIuY29tLzA4bG5DZWMucG5nXFxuICAgIFszM106IGh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwZXJmb3JtYW5jZShsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJwZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXFwiPlBlcmZvcm1hbmNlIE9wdGltaXphdGlvbjwvaDE+XFxuPHA+Rm9vPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXFxuXFxuICAgIEZvb1xcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBub3RGb3VuZChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDE+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiTm90IEZvdW5kXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gxPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHA+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiVGhlcmUgZG9lc24ndCBzZWVtIHRvIGJlIGFueXRoaW5nIGhlcmUgeWV0LiBJZiB5b3UgYmVsaWV2ZSB0aGlzIHRvIGJlIGEgbWlzdGFrZSwgcGxlYXNlIGxldCB1cyBrbm93IVwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9wPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHA+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCJodHRwczovL3R3aXR0ZXIuY29tL256Z2JcXFwiIHRhcmdldD1cXFwiX2JsYW5rXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCImbWRhc2g7IEBuemdiXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3A+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwiaDEgTm90IEZvdW5kXFxuXFxucCBUaGVyZSBkb2Vzbid0IHNlZW0gdG8gYmUgYW55dGhpbmcgaGVyZSB5ZXQuIElmIHlvdSBiZWxpZXZlIHRoaXMgdG8gYmUgYSBtaXN0YWtlLCBwbGVhc2UgbGV0IHVzIGtub3chXFxucFxcbiAgYShocmVmPSdodHRwczovL3R3aXR0ZXIuY29tL256Z2InLCB0YXJnZXQ9J19ibGFuaycpICZtZGFzaDsgQG56Z2JcXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbGF5b3V0KGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkLCBtb2RlbCwgcGFydGlhbCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8IURPQ1RZUEUgaHRtbD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxodG1sIGxhbmc9XFxcImVuXFxcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XFxcImh0dHA6Ly9zY2hlbWEub3JnL0Jsb2dcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGhlYWQ+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8dGl0bGU+XCIgKyAoamFkZS5lc2NhcGUobnVsbCA9PSAoamFkZV9pbnRlcnAgPSBtb2RlbC50aXRsZSkgPyBcIlwiIDogamFkZV9pbnRlcnApKSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvdGl0bGU+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBjaGFyc2V0PVxcXCJ1dGYtOFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInNob3J0Y3V0IGljb25cXFwiIGhyZWY9XFxcIi9mYXZpY29uLmljb1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA3LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBodHRwLWVxdWl2PVxcXCJYLVVBLUNvbXBhdGlibGVcXFwiIGNvbnRlbnQ9XFxcIklFPWVkZ2UsY2hyb21lPTFcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgbmFtZT1cXFwidmlld3BvcnRcXFwiIGNvbnRlbnQ9XFxcIndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic3R5bGVzaGVldFxcXCIgdHlwZT1cXFwidGV4dC9jc3NcXFwiIGhyZWY9XFxcIi9jc3MvYWxsLmNzc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzdHlsZXNoZWV0XFxcIiB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCIgaHJlZj1cXFwiaHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9VW5pY2ErT25lOjQwMHxQbGF5ZmFpcitEaXNwbGF5OjcwMHxNZWdyaW06NzAwfEZhdW5hK09uZTo0MDBpdGFsaWMsNDAwLDcwMFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2hlYWQ+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGJvZHkgaWQ9XFxcInRvcFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGhlYWRlcj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDE+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL1xcXCIgYXJpYS1sYWJlbD1cXFwiR28gdG8gaG9tZVxcXCIgY2xhc3M9XFxcImx5LXRpdGxlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE1LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiVGF1bnVzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gxPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMiBjbGFzcz1cXFwibHktc3ViaGVhZGluZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIk1pY3JvIElzb21vcnBoaWMgTVZDIEVuZ2luZSBmb3IgTm9kZS5qc1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaGVhZGVyPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhc2lkZT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bmF2IGNsYXNzPVxcXCJudi1jb250YWluZXJcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx1bCBjbGFzcz1cXFwibnYtaXRlbXNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFib3V0XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkdldHRpbmcgU3RhcnRlZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9hcGlcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJBUEkgRG9jdW1lbnRhdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI3LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkNvbXBsZW1lbnRhcnkgTW9kdWxlc1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlBlcmZvcm1hbmNlIE9wdGltaXphdGlvblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGkgY2xhc3M9XFxcIm52LWl0ZW1cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9zb3VyY2UtY29kZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlNvdXJjZSBDb2RlXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NoYW5nZWxvZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkNoYW5nZWxvZ1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9saT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvdWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L25hdj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYXNpZGU+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1haW4gaWQ9XFxcImFwcGxpY2F0aW9uLXJvb3RcXFwiIGRhdGEtdGF1bnVzPVxcXCJtb2RlbFxcXCI+XCIgKyAobnVsbCA9PSAoamFkZV9pbnRlcnAgPSBwYXJ0aWFsKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L21haW4+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNjcmlwdCBzcmM9XFxcIi9qcy9hbGwuanNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zY3JpcHQ+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2JvZHk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2h0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCxcIm1vZGVsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5tb2RlbDp0eXBlb2YgbW9kZWwhPT1cInVuZGVmaW5lZFwiP21vZGVsOnVuZGVmaW5lZCxcInBhcnRpYWxcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnBhcnRpYWw6dHlwZW9mIHBhcnRpYWwhPT1cInVuZGVmaW5lZFwiP3BhcnRpYWw6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJkb2N0eXBlIGh0bWxcXG5odG1sKGxhbmc9J2VuJywgaXRlbXNjb3BlLCBpdGVtdHlwZT0naHR0cDovL3NjaGVtYS5vcmcvQmxvZycpXFxuICBoZWFkXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1ldGEoY2hhcnNldD0ndXRmLTgnKVxcbiAgICBsaW5rKHJlbD0nc2hvcnRjdXQgaWNvbicsIGhyZWY9Jy9mYXZpY29uLmljbycpXFxuICAgIG1ldGEoaHR0cC1lcXVpdj0nWC1VQS1Db21wYXRpYmxlJywgY29udGVudD0nSUU9ZWRnZSxjaHJvbWU9MScpXFxuICAgIG1ldGEobmFtZT0ndmlld3BvcnQnLCBjb250ZW50PSd3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MScpXFxuICAgIGxpbmsocmVsPSdzdHlsZXNoZWV0JywgdHlwZT0ndGV4dC9jc3MnLCBocmVmPScvY3NzL2FsbC5jc3MnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0naHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9VW5pY2ErT25lOjQwMHxQbGF5ZmFpcitEaXNwbGF5OjcwMHxNZWdyaW06NzAwfEZhdW5hK09uZTo0MDBpdGFsaWMsNDAwLDcwMCcpXFxuXFxuICBib2R5I3RvcFxcbiAgICBoZWFkZXJcXG4gICAgICBoMVxcbiAgICAgICAgYS5seS10aXRsZShocmVmPScvJywgYXJpYS1sYWJlbD0nR28gdG8gaG9tZScpIFRhdW51c1xcbiAgICAgIGgyLmx5LXN1YmhlYWRpbmcgTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXFxuXFxuICAgIGFzaWRlXFxuICAgICAgbmF2Lm52LWNvbnRhaW5lclxcbiAgICAgICAgdWwubnYtaXRlbXNcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nLycpIEFib3V0XFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9nZXR0aW5nLXN0YXJ0ZWQnKSBHZXR0aW5nIFN0YXJ0ZWRcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2FwaScpIEFQSSBEb2N1bWVudGF0aW9uXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9jb21wbGVtZW50cycpIENvbXBsZW1lbnRhcnkgTW9kdWxlc1xcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvcGVyZm9ybWFuY2UnKSBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL3NvdXJjZS1jb2RlJykgU291cmNlIENvZGVcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2NoYW5nZWxvZycpIENoYW5nZWxvZ1xcblxcbiAgICBtYWluI2FwcGxpY2F0aW9uLXJvb3QoZGF0YS10YXVudXM9J21vZGVsJykhPXBhcnRpYWxcXG4gICAgc2NyaXB0KHNyYz0nL2pzL2FsbC5qcycpXFxuXCIpO1xufVxufSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRlbXBsYXRlcyA9IHtcbiAgJ2RvY3VtZW50YXRpb24vYWJvdXQnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vYXBpJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cyc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzJyksXG4gICdkb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmpzJyksXG4gICdlcnJvci9ub3QtZm91bmQnOiByZXF1aXJlKCcuL3ZpZXdzL2Vycm9yL25vdC1mb3VuZC5qcycpLFxuICAnbGF5b3V0JzogcmVxdWlyZSgnLi92aWV3cy9sYXlvdXQuanMnKVxufTtcblxudmFyIGNvbnRyb2xsZXJzID0ge1xuICAnZG9jdW1lbnRhdGlvbi9hYm91dCc6IHJlcXVpcmUoJy4uL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzJylcbn07XG5cbnZhciByb3V0ZXMgPSB7XG4gICcvJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vYWJvdXQnXG4gIH0sXG4gICcvZ2V0dGluZy1zdGFydGVkJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkJ1xuICB9LFxuICAnL2FwaSc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2FwaSdcbiAgfSxcbiAgJy9jb21wbGVtZW50cyc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzJ1xuICB9LFxuICAnL3BlcmZvcm1hbmNlJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UnXG4gIH0sXG4gICcvc291cmNlLWNvZGUnOiB7XG4gICAgaWdub3JlOiB0cnVlXG4gIH0sXG4gICcvY2hhbmdlbG9nJzoge1xuICAgIGlnbm9yZTogdHJ1ZVxuICB9LFxuICAnLzpjYXRjaGFsbConOiB7XG4gICAgYWN0aW9uOiAnZXJyb3Ivbm90LWZvdW5kJ1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcbiAgcm91dGVzOiByb3V0ZXNcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICBjb25zb2xlLmxvZygnV2VsY29tZSB0byBUYXVudXMgZG9jdW1lbnRhdGlvbiBtaW5pLXNpdGUhJyk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBpbXBvcnQgdGhlIHRhdW51cyBtb2R1bGVcbnZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcblxuLy8gaW1wb3J0IHRoZSB3aXJpbmcgbW9kdWxlIGV4cG9ydGVkIGJ5IFRhdW51c1xudmFyIHdpcmluZyA9IHJlcXVpcmUoJy4uLy4uLy5iaW4vd2lyaW5nJyk7XG5cbi8vIGdldCB0aGUgPG1haW4+IGVsZW1lbnRcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGxpY2F0aW9uLXJvb3QnKTtcblxuLy8gbW91bnQgdGF1bnVzIHNvIGl0IHN0YXJ0cyBpdHMgcm91dGluZyBlbmdpbmVcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuIWZ1bmN0aW9uKGUpe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgZjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P2Y9d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/Zj1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihmPXNlbGYpLGYuamFkZT1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbid1c2Ugc3RyaWN0JztcclxuXHJcbi8qKlxyXG4gKiBNZXJnZSB0d28gYXR0cmlidXRlIG9iamVjdHMgZ2l2aW5nIHByZWNlZGVuY2VcclxuICogdG8gdmFsdWVzIGluIG9iamVjdCBgYmAuIENsYXNzZXMgYXJlIHNwZWNpYWwtY2FzZWRcclxuICogYWxsb3dpbmcgZm9yIGFycmF5cyBhbmQgbWVyZ2luZy9qb2luaW5nIGFwcHJvcHJpYXRlbHlcclxuICogcmVzdWx0aW5nIGluIGEgc3RyaW5nLlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gYVxyXG4gKiBAcGFyYW0ge09iamVjdH0gYlxyXG4gKiBAcmV0dXJuIHtPYmplY3R9IGFcclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5tZXJnZSA9IGZ1bmN0aW9uIG1lcmdlKGEsIGIpIHtcclxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgdmFyIGF0dHJzID0gYVswXTtcclxuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYS5sZW5ndGg7IGkrKykge1xyXG4gICAgICBhdHRycyA9IG1lcmdlKGF0dHJzLCBhW2ldKTtcclxuICAgIH1cclxuICAgIHJldHVybiBhdHRycztcclxuICB9XHJcbiAgdmFyIGFjID0gYVsnY2xhc3MnXTtcclxuICB2YXIgYmMgPSBiWydjbGFzcyddO1xyXG5cclxuICBpZiAoYWMgfHwgYmMpIHtcclxuICAgIGFjID0gYWMgfHwgW107XHJcbiAgICBiYyA9IGJjIHx8IFtdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjKSkgYWMgPSBbYWNdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGJjKSkgYmMgPSBbYmNdO1xyXG4gICAgYVsnY2xhc3MnXSA9IGFjLmNvbmNhdChiYykuZmlsdGVyKG51bGxzKTtcclxuICB9XHJcblxyXG4gIGZvciAodmFyIGtleSBpbiBiKSB7XHJcbiAgICBpZiAoa2V5ICE9ICdjbGFzcycpIHtcclxuICAgICAgYVtrZXldID0gYltrZXldO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGE7XHJcbn07XHJcblxyXG4vKipcclxuICogRmlsdGVyIG51bGwgYHZhbGBzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtCb29sZWFufVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5mdW5jdGlvbiBudWxscyh2YWwpIHtcclxuICByZXR1cm4gdmFsICE9IG51bGwgJiYgdmFsICE9PSAnJztcclxufVxyXG5cclxuLyoqXHJcbiAqIGpvaW4gYXJyYXkgYXMgY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5qb2luQ2xhc3NlcyA9IGpvaW5DbGFzc2VzO1xyXG5mdW5jdGlvbiBqb2luQ2xhc3Nlcyh2YWwpIHtcclxuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpID8gdmFsLm1hcChqb2luQ2xhc3NlcykuZmlsdGVyKG51bGxzKS5qb2luKCcgJykgOiB2YWw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGNsYXNzZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IGNsYXNzZXNcclxuICogQHBhcmFtIHtBcnJheS48Qm9vbGVhbj59IGVzY2FwZWRcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5jbHMgPSBmdW5jdGlvbiBjbHMoY2xhc3NlcywgZXNjYXBlZCkge1xyXG4gIHZhciBidWYgPSBbXTtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGlmIChlc2NhcGVkICYmIGVzY2FwZWRbaV0pIHtcclxuICAgICAgYnVmLnB1c2goZXhwb3J0cy5lc2NhcGUoam9pbkNsYXNzZXMoW2NsYXNzZXNbaV1dKSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgYnVmLnB1c2goam9pbkNsYXNzZXMoY2xhc3Nlc1tpXSkpO1xyXG4gICAgfVxyXG4gIH1cclxuICB2YXIgdGV4dCA9IGpvaW5DbGFzc2VzKGJ1Zik7XHJcbiAgaWYgKHRleHQubGVuZ3RoKSB7XHJcbiAgICByZXR1cm4gJyBjbGFzcz1cIicgKyB0ZXh0ICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcnO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZS5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGtleVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZXNjYXBlZFxyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IHRlcnNlXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0ciA9IGZ1bmN0aW9uIGF0dHIoa2V5LCB2YWwsIGVzY2FwZWQsIHRlcnNlKSB7XHJcbiAgaWYgKCdib29sZWFuJyA9PSB0eXBlb2YgdmFsIHx8IG51bGwgPT0gdmFsKSB7XHJcbiAgICBpZiAodmFsKSB7XHJcbiAgICAgIHJldHVybiAnICcgKyAodGVyc2UgPyBrZXkgOiBrZXkgKyAnPVwiJyArIGtleSArICdcIicpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuICcnO1xyXG4gICAgfVxyXG4gIH0gZWxzZSBpZiAoMCA9PSBrZXkuaW5kZXhPZignZGF0YScpICYmICdzdHJpbmcnICE9IHR5cGVvZiB2YWwpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyBcIj0nXCIgKyBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2UoLycvZywgJyZhcG9zOycpICsgXCInXCI7XHJcbiAgfSBlbHNlIGlmIChlc2NhcGVkKSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyBleHBvcnRzLmVzY2FwZSh2YWwpICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJztcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBhdHRyaWJ1dGVzIG9iamVjdC5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IG9ialxyXG4gKiBAcGFyYW0ge09iamVjdH0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmF0dHJzID0gZnVuY3Rpb24gYXR0cnMob2JqLCB0ZXJzZSl7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG5cclxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iaik7XHJcblxyXG4gIGlmIChrZXlzLmxlbmd0aCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldXHJcbiAgICAgICAgLCB2YWwgPSBvYmpba2V5XTtcclxuXHJcbiAgICAgIGlmICgnY2xhc3MnID09IGtleSkge1xyXG4gICAgICAgIGlmICh2YWwgPSBqb2luQ2xhc3Nlcyh2YWwpKSB7XHJcbiAgICAgICAgICBidWYucHVzaCgnICcgKyBrZXkgKyAnPVwiJyArIHZhbCArICdcIicpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBidWYucHVzaChleHBvcnRzLmF0dHIoa2V5LCB2YWwsIGZhbHNlLCB0ZXJzZSkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYnVmLmpvaW4oJycpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEVzY2FwZSB0aGUgZ2l2ZW4gc3RyaW5nIG9mIGBodG1sYC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGh0bWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLmVzY2FwZSA9IGZ1bmN0aW9uIGVzY2FwZShodG1sKXtcclxuICB2YXIgcmVzdWx0ID0gU3RyaW5nKGh0bWwpXHJcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxyXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxyXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcclxuICBpZiAocmVzdWx0ID09PSAnJyArIGh0bWwpIHJldHVybiBodG1sO1xyXG4gIGVsc2UgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZS10aHJvdyB0aGUgZ2l2ZW4gYGVycmAgaW4gY29udGV4dCB0byB0aGVcclxuICogdGhlIGphZGUgaW4gYGZpbGVuYW1lYCBhdCB0aGUgZ2l2ZW4gYGxpbmVub2AuXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZW5hbWVcclxuICogQHBhcmFtIHtTdHJpbmd9IGxpbmVub1xyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLnJldGhyb3cgPSBmdW5jdGlvbiByZXRocm93KGVyciwgZmlsZW5hbWUsIGxpbmVubywgc3RyKXtcclxuICBpZiAoIShlcnIgaW5zdGFuY2VvZiBFcnJvcikpIHRocm93IGVycjtcclxuICBpZiAoKHR5cGVvZiB3aW5kb3cgIT0gJ3VuZGVmaW5lZCcgfHwgIWZpbGVuYW1lKSAmJiAhc3RyKSB7XHJcbiAgICBlcnIubWVzc2FnZSArPSAnIG9uIGxpbmUgJyArIGxpbmVubztcclxuICAgIHRocm93IGVycjtcclxuICB9XHJcbiAgdHJ5IHtcclxuICAgIHN0ciA9IHN0ciB8fCBfZGVyZXFfKCdmcycpLnJlYWRGaWxlU3luYyhmaWxlbmFtZSwgJ3V0ZjgnKVxyXG4gIH0gY2F0Y2ggKGV4KSB7XHJcbiAgICByZXRocm93KGVyciwgbnVsbCwgbGluZW5vKVxyXG4gIH1cclxuICB2YXIgY29udGV4dCA9IDNcclxuICAgICwgbGluZXMgPSBzdHIuc3BsaXQoJ1xcbicpXHJcbiAgICAsIHN0YXJ0ID0gTWF0aC5tYXgobGluZW5vIC0gY29udGV4dCwgMClcclxuICAgICwgZW5kID0gTWF0aC5taW4obGluZXMubGVuZ3RoLCBsaW5lbm8gKyBjb250ZXh0KTtcclxuXHJcbiAgLy8gRXJyb3IgY29udGV4dFxyXG4gIHZhciBjb250ZXh0ID0gbGluZXMuc2xpY2Uoc3RhcnQsIGVuZCkubWFwKGZ1bmN0aW9uKGxpbmUsIGkpe1xyXG4gICAgdmFyIGN1cnIgPSBpICsgc3RhcnQgKyAxO1xyXG4gICAgcmV0dXJuIChjdXJyID09IGxpbmVubyA/ICcgID4gJyA6ICcgICAgJylcclxuICAgICAgKyBjdXJyXHJcbiAgICAgICsgJ3wgJ1xyXG4gICAgICArIGxpbmU7XHJcbiAgfSkuam9pbignXFxuJyk7XHJcblxyXG4gIC8vIEFsdGVyIGV4Y2VwdGlvbiBtZXNzYWdlXHJcbiAgZXJyLnBhdGggPSBmaWxlbmFtZTtcclxuICBlcnIubWVzc2FnZSA9IChmaWxlbmFtZSB8fCAnSmFkZScpICsgJzonICsgbGluZW5vXHJcbiAgICArICdcXG4nICsgY29udGV4dCArICdcXG5cXG4nICsgZXJyLm1lc3NhZ2U7XHJcbiAgdGhyb3cgZXJyO1xyXG59O1xyXG5cbn0se1wiZnNcIjoyfV0sMjpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbn0se31dfSx7fSxbMV0pXG4oMSlcbn0pO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJ2phZGUvcnVudGltZScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBwYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4vaXNOYXRpdmUnKTtcbnZhciBtb2Rlcm4gPSAnaGlzdG9yeScgaW4gd2luZG93ICYmICdwdXNoU3RhdGUnIGluIGhpc3Rvcnk7XG5cbi8vIEdvb2dsZSBDaHJvbWUgMzggb24gaU9TIG1ha2VzIHdlaXJkIGNoYW5nZXMgdG8gaGlzdG9yeS5yZXBsYWNlU3RhdGUsIGJyZWFraW5nIGl0XG52YXIgbmF0aXZlUmVwbGFjZSA9IG1vZGVybiAmJiBpc05hdGl2ZSh3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUpO1xuXG5mdW5jdGlvbiBnbyAodXJsLCBvKSB7XG4gIHZhciBvcHRpb25zID0gbyB8fCB7fTtcbiAgdmFyIGNvbnRleHQgPSBvcHRpb25zLmNvbnRleHQgfHwgbnVsbDtcblxuICBpZiAoIW1vZGVybikge1xuICAgIGxvY2F0aW9uLmhyZWYgPSB1cmw7IHJldHVybjtcbiAgfVxuXG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgbG9jYXRpb24uaHJlZiA9IHVybDsgcmV0dXJuO1xuICB9XG5cbiAgZmV0Y2hlci5hYm9ydFBlbmRpbmcoKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250ZXh0LCBzb3VyY2U6ICdpbnRlbnQnIH0sIHJlc29sdmVkKTtcblxuICBmdW5jdGlvbiByZXNvbHZlZCAoZXJyLCBtb2RlbCkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdwdXNoU3RhdGUnKTtcbiAgICBwYXJ0aWFsKHN0YXRlLmNvbnRhaW5lciwgbnVsbCwgbW9kZWwsIHJvdXRlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydCAobW9kZWwpIHtcbiAgdmFyIHJvdXRlID0gcmVwbGFjZVdpdGgobW9kZWwpO1xuICBlbWl0dGVyLmVtaXQoJ3N0YXJ0Jywgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUsIHsgcmVuZGVyOiBmYWxzZSB9KTtcbiAgd2luZG93Lm9ucG9wc3RhdGUgPSBiYWNrO1xufVxuXG5mdW5jdGlvbiBiYWNrIChlKSB7XG4gIHZhciBlbXB0eSA9ICEoZSAmJiBlLnN0YXRlICYmIGUuc3RhdGUubW9kZWwpO1xuICBpZiAoZW1wdHkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG1vZGVsID0gZS5zdGF0ZS5tb2RlbDtcbiAgdmFyIHJvdXRlID0gcmVwbGFjZVdpdGgobW9kZWwpO1xuICBwYXJ0aWFsKHN0YXRlLmNvbnRhaW5lciwgbnVsbCwgbW9kZWwsIHJvdXRlKTtcbn1cblxuZnVuY3Rpb24gcmVwbGFjZVdpdGggKG1vZGVsKSB7XG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcbiAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdyZXBsYWNlU3RhdGUnKTtcbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRpb24gKHJvdXRlLCBtb2RlbCwgZGlyZWN0aW9uKSB7XG4gIHN0YXRlLm1vZGVsID0gbW9kZWw7XG4gIGlmIChtb2RlbC50aXRsZSkge1xuICAgIGRvY3VtZW50LnRpdGxlID0gbW9kZWwudGl0bGU7XG4gIH1cbiAgaWYgKG1vZGVybiAmJiBkaXJlY3Rpb24gIT09ICdyZXBsYWNlU3RhdGUnIHx8IG5hdGl2ZVJlcGxhY2UpIHtcbiAgICBoaXN0b3J5W2RpcmVjdGlvbl0oeyBtb2RlbDogbW9kZWwgfSwgbW9kZWwudGl0bGUsIHJvdXRlLnVybCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHN0YXJ0OiBzdGFydCxcbiAgZ286IGdvXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgb25jZSA9IHJlcXVpcmUoJy4vb25jZScpO1xudmFyIHJhdyA9IHJlcXVpcmUoJy4vc3RvcmVzL3JhdycpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0b3JlcyA9IFtyYXcsIGlkYl07XG5cbmZ1bmN0aW9uIGNsb25lICh2YWx1ZSkge1xuICByZXR1cm4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpO1xufVxuXG5mdW5jdGlvbiBnZXQgKHVybCwgZG9uZSkge1xuICB2YXIgaSA9IDA7XG5cbiAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgdmFyIGdvdE9uY2UgPSBvbmNlKGdvdCk7XG4gICAgdmFyIHN0b3JlID0gc3RvcmVzW2krK107XG4gICAgaWYgKHN0b3JlKSB7XG4gICAgICBzdG9yZS5nZXQodXJsLCBnb3RPbmNlKTtcbiAgICAgIHNldFRpbWVvdXQoZ290T25jZSwgc3RvcmUgPT09IGlkYiA/IDEwMCA6IDUwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDE1MG1zIG9uIGNhY2hpbmcgbGF5ZXJzXG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUodHJ1ZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ290IChlcnIsIGl0ZW0pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSBlbHNlIGlmIChpdGVtICYmIHR5cGVvZiBpdGVtLmV4cGlyZXMgPT09ICdudW1iZXInICYmIERhdGUubm93KCkgPCBpdGVtLmV4cGlyZXMpIHtcbiAgICAgICAgZG9uZShmYWxzZSwgY2xvbmUoaXRlbS5kYXRhKSk7IC8vIGFsd2F5cyByZXR1cm4gYSB1bmlxdWUgY29weVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIG5leHQoKTtcbn1cblxuZnVuY3Rpb24gc2V0ICh1cmwsIGRhdGEsIGR1cmF0aW9uKSB7XG4gIGlmIChkdXJhdGlvbiA8IDEpIHsgLy8gc2FuaXR5XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBjbG9uZWQgPSBjbG9uZShkYXRhKTsgLy8gZnJlZXplIGEgY29weSBmb3Igb3VyIHJlY29yZHNcbiAgc3RvcmVzLmZvckVhY2goc3RvcmUpO1xuICBmdW5jdGlvbiBzdG9yZSAocykge1xuICAgIHMuc2V0KHVybCwge1xuICAgICAgZGF0YTogY2xvbmVkLFxuICAgICAgZXhwaXJlczogRGF0ZS5ub3coKSArIGR1cmF0aW9uXG4gICAgfSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNhY2hlID0gcmVxdWlyZSgnLi9jYWNoZScpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBkZWZhdWx0cyA9IDE1O1xudmFyIGJhc2VsaW5lO1xuXG5mdW5jdGlvbiBlICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkdXJhdGlvbiwgcm91dGUpIHtcbiAgYmFzZWxpbmUgPSBwYXJzZUR1cmF0aW9uKGR1cmF0aW9uKTtcbiAgaWYgKGJhc2VsaW5lIDwgMSkge1xuICAgIHN0YXRlLmNhY2hlID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG4gIGludGVyY2VwdG9yLmFkZChpbnRlcmNlcHQpO1xuICBlbWl0dGVyLm9uKCdmZXRjaC5kb25lJywgcGVyc2lzdCk7XG4gIHN0YXRlLmNhY2hlID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW50ZXJjZXB0IChlKSB7XG4gIGNhY2hlLmdldChlLnVybCwgcmVzdWx0KTtcblxuICBmdW5jdGlvbiByZXN1bHQgKGVyciwgZGF0YSkge1xuICAgIGlmICghZXJyICYmIGRhdGEpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoZGF0YSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlRHVyYXRpb24gKHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBiYXNlbGluZSB8fCBkZWZhdWx0cztcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdCAocm91dGUsIGNvbnRleHQsIGRhdGEpIHtcbiAgaWYgKCFzdGF0ZS5jYWNoZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocm91dGUuY2FjaGUgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBkID0gYmFzZWxpbmU7XG4gIGlmICh0eXBlb2Ygcm91dGUuY2FjaGUgPT09ICdudW1iZXInKSB7XG4gICAgZCA9IHJvdXRlLmNhY2hlO1xuICB9XG4gIHZhciBrZXkgPSByb3V0ZS5wYXJ0cy5wYXRobmFtZSArIGUocm91dGUucGFydHMucXVlcnkpO1xuICBjYWNoZS5zZXQoa2V5LCBkYXRhLCBwYXJzZUR1cmF0aW9uKGQpICogMTAwMCk7XG59XG5cbmZ1bmN0aW9uIHJlYWR5IChmbikge1xuICBpZiAoc3RhdGUuY2FjaGUpIHtcbiAgICBpZGIudGVzdGVkKGZuKTsgLy8gd2FpdCBvbiBpZGIgY29tcGF0aWJpbGl0eSB0ZXN0c1xuICB9IGVsc2Uge1xuICAgIGZuKCk7IC8vIGNhY2hpbmcgaXMgYSBuby1vcFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzZXR1cDogc2V0dXAsXG4gIHBlcnNpc3Q6IHBlcnNpc3QsXG4gIHJlYWR5OiByZWFkeVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGVtaXR0ZXIoe30sIHsgdGhyb3dzOiBmYWxzZSB9KTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gYWRkIChlbGVtZW50LCB0eXBlLCBmbikge1xuICBpZiAoZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGZuKTtcbiAgfSBlbHNlIGlmIChlbGVtZW50LmF0dGFjaEV2ZW50KSB7XG4gICAgZWxlbWVudC5hdHRhY2hFdmVudCgnb24nICsgdHlwZSwgd3JhcHBlckZhY3RvcnkoZWxlbWVudCwgZm4pKTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtZW50WydvbicgKyB0eXBlXSA9IGZuO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbGVtZW50LCBmbikge1xuICByZXR1cm4gZnVuY3Rpb24gd3JhcHBlciAob3JpZ2luYWxFdmVudCkge1xuICAgIHZhciBlID0gb3JpZ2luYWxFdmVudCB8fCB3aW5kb3cuZXZlbnQ7XG4gICAgZS50YXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCAgPSBlLnByZXZlbnREZWZhdWx0ICB8fCBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAoKSB7IGUucmV0dXJuVmFsdWUgPSBmYWxzZTsgfTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbiA9IGUuc3RvcFByb3BhZ2F0aW9uIHx8IGZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbiAoKSB7IGUuY2FuY2VsQnViYmxlID0gdHJ1ZTsgfTtcbiAgICBmbi5jYWxsKGVsZW1lbnQsIGUpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCcuL3hocicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBsYXN0WGhyID0ge307XG5cbmZ1bmN0aW9uIGUgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24ganNvbmlmeSAocm91dGUpIHtcbiAgdmFyIHBhcnRzID0gcm91dGUucGFydHM7XG4gIHZhciBxcyA9IGUocGFydHMuc2VhcmNoKTtcbiAgdmFyIHAgPSBxcyA/ICcmJyA6ICc/JztcbiAgcmV0dXJuIHBhcnRzLnBhdGhuYW1lICsgcXMgKyBwICsgJ2pzb24nO1xufVxuXG5mdW5jdGlvbiBhYm9ydCAoc291cmNlKSB7XG4gIGlmIChsYXN0WGhyW3NvdXJjZV0pIHtcbiAgICBsYXN0WGhyW3NvdXJjZV0uYWJvcnQoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhYm9ydFBlbmRpbmcgKCkge1xuICBPYmplY3Qua2V5cyhsYXN0WGhyKS5mb3JFYWNoKGFib3J0KTtcbiAgbGFzdFhociA9IHt9O1xufVxuXG5mdW5jdGlvbiBmZXRjaGVyIChyb3V0ZSwgY29udGV4dCwgZG9uZSkge1xuICB2YXIgdXJsID0gcm91dGUudXJsO1xuICBpZiAobGFzdFhocltjb250ZXh0LnNvdXJjZV0pIHtcbiAgICBsYXN0WGhyW2NvbnRleHQuc291cmNlXS5hYm9ydCgpO1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0gbnVsbDtcbiAgfVxuICBpbnRlcmNlcHRvci5leGVjdXRlKHJvdXRlLCBhZnRlckludGVyY2VwdG9ycyk7XG5cbiAgZnVuY3Rpb24gYWZ0ZXJJbnRlcmNlcHRvcnMgKGVyciwgcmVzdWx0KSB7XG4gICAgaWYgKCFlcnIgJiYgcmVzdWx0LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgIGRvbmUobnVsbCwgcmVzdWx0Lm1vZGVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5zdGFydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0geGhyKGpzb25pZnkocm91dGUpLCBub3RpZnkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeSAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgaWYgKGVyci5tZXNzYWdlID09PSAnYWJvcnRlZCcpIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5hYm9ydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guZXJyb3InLCByb3V0ZSwgY29udGV4dCwgZXJyKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5kb25lJywgcm91dGUsIGNvbnRleHQsIGRhdGEpO1xuICAgIH1cbiAgICBkb25lKGVyciwgZGF0YSk7XG4gIH1cbn1cblxuZmV0Y2hlci5hYm9ydFBlbmRpbmcgPSBhYm9ydFBlbmRpbmc7XG5cbm1vZHVsZS5leHBvcnRzID0gZmV0Y2hlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBsaW5rcyA9IHJlcXVpcmUoJy4vbGlua3MnKTtcblxuZnVuY3Rpb24gYXR0YWNoICgpIHtcbiAgZW1pdHRlci5vbignc3RhcnQnLCBsaW5rcyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRhY2g6IGF0dGFjaFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGhvb2tzID0gcmVxdWlyZSgnLi9ob29rcycpO1xudmFyIHBhcnRpYWwgPSByZXF1aXJlKCcuL3BhcnRpYWwnKTtcbnZhciBtb3VudCA9IHJlcXVpcmUoJy4vbW91bnQnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xuXG5ob29rcy5hdHRhY2goKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1vdW50OiBtb3VudCxcbiAgcGFydGlhbDogcGFydGlhbC5zdGFuZGFsb25lLFxuICBvbjogZW1pdHRlci5vbi5iaW5kKGVtaXR0ZXIpLFxuICBvbmNlOiBlbWl0dGVyLm9uY2UuYmluZChlbWl0dGVyKSxcbiAgb2ZmOiBlbWl0dGVyLm9mZi5iaW5kKGVtaXR0ZXIpLFxuICBpbnRlcmNlcHQ6IGludGVyY2VwdG9yLmFkZCxcbiAgbmF2aWdhdGU6IGFjdGl2YXRvci5nbyxcbiAgc3RhdGU6IHN0YXRlLFxuICByb3V0ZTogcm91dGVyXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG52YXIgb25jZSA9IHJlcXVpcmUoJy4vb25jZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgaW50ZXJjZXB0b3JzID0gZW1pdHRlcih7IGNvdW50OiAwIH0sIHsgYXN5bmM6IHRydWUgfSk7XG5cbmZ1bmN0aW9uIGdldEludGVyY2VwdG9yRXZlbnQgKHJvdXRlKSB7XG4gIHZhciBlID0ge1xuICAgIHVybDogcm91dGUudXJsLFxuICAgIHJvdXRlOiByb3V0ZSxcbiAgICBwYXJ0czogcm91dGUucGFydHMsXG4gICAgbW9kZWw6IG51bGwsXG4gICAgY2FuUHJldmVudERlZmF1bHQ6IHRydWUsXG4gICAgZGVmYXVsdFByZXZlbnRlZDogZmFsc2UsXG4gICAgcHJldmVudERlZmF1bHQ6IG9uY2UocHJldmVudERlZmF1bHQpXG4gIH07XG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKG1vZGVsKSB7XG4gICAgaWYgKCFlLmNhblByZXZlbnREZWZhdWx0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGUuY2FuUHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICBlLmRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlO1xuICAgIGUubW9kZWwgPSBtb2RlbDtcbiAgfVxuXG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBhZGQgKGFjdGlvbiwgZm4pIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICBmbiA9IGFjdGlvbjtcbiAgICBhY3Rpb24gPSAnKic7XG4gIH1cbiAgaW50ZXJjZXB0b3JzLmNvdW50Kys7XG4gIGludGVyY2VwdG9ycy5vbihhY3Rpb24sIGZuKTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZVN5bmMgKHJvdXRlKSB7XG4gIHZhciBlID0gZ2V0SW50ZXJjZXB0b3JFdmVudChyb3V0ZSk7XG5cbiAgaW50ZXJjZXB0b3JzLmVtaXQoJyonLCBlKTtcbiAgaW50ZXJjZXB0b3JzLmVtaXQocm91dGUuYWN0aW9uLCBlKTtcblxuICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZSAocm91dGUsIGRvbmUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlKTtcbiAgaWYgKGludGVyY2VwdG9ycy5jb3VudCA9PT0gMCkgeyAvLyBmYWlsIGZhc3RcbiAgICBlbmQoKTsgcmV0dXJuO1xuICB9XG4gIHZhciBmbiA9IG9uY2UoZW5kKTtcbiAgdmFyIHByZXZlbnREZWZhdWx0QmFzZSA9IGUucHJldmVudERlZmF1bHQ7XG5cbiAgZS5wcmV2ZW50RGVmYXVsdCA9IG9uY2UocHJldmVudERlZmF1bHRFbmRzKTtcblxuICBpbnRlcmNlcHRvcnMuZW1pdCgnKicsIGUpO1xuICBpbnRlcmNlcHRvcnMuZW1pdChyb3V0ZS5hY3Rpb24sIGUpO1xuXG4gIHNldFRpbWVvdXQoZm4sIDIwMCk7IC8vIGF0IHdvcnN0LCBzcGVuZCAyMDBtcyB3YWl0aW5nIG9uIGludGVyY2VwdG9yc1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0RW5kcyAoKSB7XG4gICAgcHJldmVudERlZmF1bHRCYXNlLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgZm4oKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZCAoKSB7XG4gICAgZS5jYW5QcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgIGRvbmUobnVsbCwgZSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkLFxuICBleGVjdXRlOiBleGVjdXRlXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBzb3VyY2U6IGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2pkYWx0b24vNWUzNGQ4OTAxMDVhY2E0NDM5OWZcbi8vIHRoYW5rcyBAamRhbHRvbiFcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZzsgLy8gdXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBgW1tDbGFzc11dYCBvZiB2YWx1ZXNcbnZhciBmblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nOyAvLyB1c2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9uc1xudmFyIGhvc3QgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvOyAvLyB1c2VkIHRvIGRldGVjdCBob3N0IGNvbnN0cnVjdG9ycyAoU2FmYXJpID4gNDsgcmVhbGx5IHR5cGVkIGFycmF5IHNwZWNpZmljKVxuXG4vLyBFc2NhcGUgYW55IHNwZWNpYWwgcmVnZXhwIGNoYXJhY3RlcnMuXG52YXIgc3BlY2lhbHMgPSAvWy4qKz9eJHt9KCl8W1xcXVxcL1xcXFxdL2c7XG5cbi8vIFJlcGxhY2UgbWVudGlvbnMgb2YgYHRvU3RyaW5nYCB3aXRoIGAuKj9gIHRvIGtlZXAgdGhlIHRlbXBsYXRlIGdlbmVyaWMuXG4vLyBSZXBsYWNlIHRoaW5nIGxpa2UgYGZvciAuLi5gIHRvIHN1cHBvcnQgZW52aXJvbm1lbnRzLCBsaWtlIFJoaW5vLCB3aGljaCBhZGQgZXh0cmFcbi8vIGluZm8gc3VjaCBhcyBtZXRob2QgYXJpdHkuXG52YXIgZXh0cmFzID0gL3RvU3RyaW5nfChmdW5jdGlvbikuKj8oPz1cXFxcXFwoKXwgZm9yIC4rPyg/PVxcXFxcXF0pL2c7XG5cbi8vIENvbXBpbGUgYSByZWdleHAgdXNpbmcgYSBjb21tb24gbmF0aXZlIG1ldGhvZCBhcyBhIHRlbXBsYXRlLlxuLy8gV2UgY2hvc2UgYE9iamVjdCN0b1N0cmluZ2AgYmVjYXVzZSB0aGVyZSdzIGEgZ29vZCBjaGFuY2UgaXQgaXMgbm90IGJlaW5nIG11Y2tlZCB3aXRoLlxudmFyIGZuU3RyaW5nID0gU3RyaW5nKHRvU3RyaW5nKS5yZXBsYWNlKHNwZWNpYWxzLCAnXFxcXCQmJykucmVwbGFjZShleHRyYXMsICckMS4qPycpO1xudmFyIHJlTmF0aXZlID0gbmV3IFJlZ0V4cCgnXicgKyBmblN0cmluZyArICckJyk7XG5cbmZ1bmN0aW9uIGlzTmF0aXZlICh2YWx1ZSkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgaWYgKHR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAvLyBVc2UgYEZ1bmN0aW9uI3RvU3RyaW5nYCB0byBieXBhc3MgdGhlIHZhbHVlJ3Mgb3duIGB0b1N0cmluZ2AgbWV0aG9kXG4gICAgLy8gYW5kIGF2b2lkIGJlaW5nIGZha2VkIG91dC5cbiAgICByZXR1cm4gcmVOYXRpdmUudGVzdChmblRvU3RyaW5nLmNhbGwodmFsdWUpKTtcbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGEgaG9zdCBvYmplY3QgY2hlY2sgYmVjYXVzZSBzb21lIGVudmlyb25tZW50cyB3aWxsIHJlcHJlc2VudFxuICAvLyB0aGluZ3MgbGlrZSB0eXBlZCBhcnJheXMgYXMgRE9NIG1ldGhvZHMgd2hpY2ggbWF5IG5vdCBjb25mb3JtIHRvIHRoZVxuICAvLyBub3JtYWwgbmF0aXZlIHBhdHRlcm4uXG4gIHJldHVybiAodmFsdWUgJiYgdHlwZSA9PT0gJ29iamVjdCcgJiYgaG9zdC50ZXN0KHRvU3RyaW5nLmNhbGwodmFsdWUpKSkgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNOYXRpdmU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgb3JpZ2luID0gZG9jdW1lbnQubG9jYXRpb24ub3JpZ2luO1xudmFyIGxlZnRDbGljayA9IDE7XG52YXIgcHJlZmV0Y2hpbmcgPSBbXTtcbnZhciBjbGlja3NPbkhvbGQgPSBbXTtcblxuZnVuY3Rpb24gbGlua3MgKCkge1xuICBpZiAoc3RhdGUucHJlZmV0Y2ggJiYgc3RhdGUuY2FjaGUpIHsgLy8gcHJlZmV0Y2ggd2l0aG91dCBjYWNoZSBtYWtlcyBubyBzZW5zZVxuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ21vdXNlb3ZlcicsIG1heWJlUHJlZmV0Y2gpO1xuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ3RvdWNoc3RhcnQnLCBtYXliZVByZWZldGNoKTtcbiAgfVxuICBldmVudHMuYWRkKGRvY3VtZW50LmJvZHksICdjbGljaycsIG1heWJlUmVyb3V0ZSk7XG59XG5cbmZ1bmN0aW9uIHNvIChhbmNob3IpIHtcbiAgcmV0dXJuIGFuY2hvci5vcmlnaW4gPT09IG9yaWdpbjtcbn1cblxuZnVuY3Rpb24gbGVmdENsaWNrT25BbmNob3IgKGUsIGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLnBhdGhuYW1lICYmIGUud2hpY2ggPT09IGxlZnRDbGljayAmJiAhZS5tZXRhS2V5ICYmICFlLmN0cmxLZXk7XG59XG5cbmZ1bmN0aW9uIHRhcmdldE9yQW5jaG9yIChlKSB7XG4gIHZhciBhbmNob3IgPSBlLnRhcmdldDtcbiAgd2hpbGUgKGFuY2hvcikge1xuICAgIGlmIChhbmNob3IudGFnTmFtZSA9PT0gJ0EnKSB7XG4gICAgICByZXR1cm4gYW5jaG9yO1xuICAgIH1cbiAgICBhbmNob3IgPSBhbmNob3IucGFyZW50RWxlbWVudDtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVJlcm91dGUgKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikgJiYgbGVmdENsaWNrT25BbmNob3IoZSwgYW5jaG9yKSkge1xuICAgIHJlcm91dGUoZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVByZWZldGNoIChlKSB7XG4gIHZhciBhbmNob3IgPSB0YXJnZXRPckFuY2hvcihlKTtcbiAgaWYgKGFuY2hvciAmJiBzbyhhbmNob3IpKSB7XG4gICAgcHJlZmV0Y2goZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzY3JvbGxJbnRvIChpZCkge1xuICB2YXIgZWxlbSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgaWYgKGVsZW0gJiYgZWxlbS5zY3JvbGxJbnRvVmlldykge1xuICAgIGVsZW0uc2Nyb2xsSW50b1ZpZXcoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBub29wICgpIHt9XG5cbmZ1bmN0aW9uIGdldFJvdXRlIChhbmNob3IsIGZhaWwpIHtcbiAgdmFyIHVybCA9IGFuY2hvci5wYXRobmFtZSArIGFuY2hvci5zZWFyY2ggKyBhbmNob3IuaGFzaDtcbiAgaWYgKHVybCA9PT0gbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBhbmNob3IuaGFzaCkge1xuICAgIChmYWlsIHx8IG5vb3ApKCk7XG4gICAgcmV0dXJuOyAvLyBhbmNob3IgaGFzaC1uYXZpZ2F0aW9uIG9uIHNhbWUgcGFnZSBpZ25vcmVzIHJvdXRlclxuICB9XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLmlnbm9yZSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIHJlcm91dGUgKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IsIGZhaWwpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJldmVudCgpO1xuXG4gIGlmIChwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgY2xpY2tzT25Ib2xkLnB1c2goYW5jaG9yKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBhY3RpdmF0b3IuZ28ocm91dGUudXJsLCB7IGNvbnRleHQ6IGFuY2hvciB9KTtcblxuICBmdW5jdGlvbiBmYWlsICgpIHtcbiAgICBpZiAoYW5jaG9yLmhhc2ggPT09IGxvY2F0aW9uLmhhc2gpIHtcbiAgICAgIHNjcm9sbEludG8oYW5jaG9yLmhhc2guc3Vic3RyKDEpKTtcbiAgICAgIHByZXZlbnQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwcmV2ZW50ICgpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB9XG59XG5cbmZ1bmN0aW9uIHByZWZldGNoIChlLCBhbmNob3IpIHtcbiAgdmFyIHJvdXRlID0gZ2V0Um91dGUoYW5jaG9yKTtcbiAgaWYgKCFyb3V0ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJlZmV0Y2hpbmcucHVzaChhbmNob3IpO1xuICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGFuY2hvciwgc291cmNlOiAncHJlZmV0Y2gnIH0sIHJlc29sdmVkKTtcblxuICBmdW5jdGlvbiByZXNvbHZlZCAoZXJyLCBkYXRhKSB7XG4gICAgcHJlZmV0Y2hpbmcuc3BsaWNlKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSwgMSk7XG4gICAgaWYgKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgICBjbGlja3NPbkhvbGQuc3BsaWNlKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvciksIDEpO1xuICAgICAgYWN0aXZhdG9yLmdvKHJvdXRlLnVybCwgeyBjb250ZXh0OiBhbmNob3IgfSk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbGlua3M7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciB1bmVzY2FwZSA9IHJlcXVpcmUoJy4vdW5lc2NhcGUnKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgY2FjaGluZyA9IHJlcXVpcmUoJy4vY2FjaGluZycpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBnID0gZ2xvYmFsO1xudmFyIG1vdW50ZWQ7XG52YXIgYm9vdGVkO1xuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG1vdW50IChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucykge1xuICB2YXIgbyA9IG9wdGlvbnMgfHwge307XG4gIGlmIChtb3VudGVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdUYXVudXMgYWxyZWFkeSBtb3VudGVkIScpO1xuICB9XG4gIGlmICghY29udGFpbmVyIHx8ICFjb250YWluZXIudGFnTmFtZSkgeyAvLyBuYcOvdmUgaXMgZW5vdWdoXG4gICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYW4gYXBwbGljYXRpb24gcm9vdCBjb250YWluZXIhJyk7XG4gIH1cblxuICBtb3VudGVkID0gdHJ1ZTtcblxuICBzdGF0ZS5jb250YWluZXIgPSBjb250YWluZXI7XG4gIHN0YXRlLmNvbnRyb2xsZXJzID0gd2lyaW5nLmNvbnRyb2xsZXJzO1xuICBzdGF0ZS50ZW1wbGF0ZXMgPSB3aXJpbmcudGVtcGxhdGVzO1xuICBzdGF0ZS5yb3V0ZXMgPSB3aXJpbmcucm91dGVzO1xuICBzdGF0ZS5wcmVmZXRjaCA9ICEhby5wcmVmZXRjaDtcblxuICByb3V0ZXIuc2V0dXAod2lyaW5nLnJvdXRlcyk7XG5cbiAgdmFyIHVybCA9IGxvY2F0aW9uLnBhdGhuYW1lO1xuICB2YXIgcXVlcnkgPSBvckVtcHR5KGxvY2F0aW9uLnNlYXJjaCkgKyBvckVtcHR5KGxvY2F0aW9uLmhhc2gpO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsICsgcXVlcnkpO1xuXG4gIGNhY2hpbmcuc2V0dXAoby5jYWNoZSwgcm91dGUpO1xuICBjYWNoaW5nLnJlYWR5KGtpY2tzdGFydCk7XG5cbiAgZnVuY3Rpb24ga2lja3N0YXJ0ICgpIHtcbiAgICBpZiAoIW8uYm9vdHN0cmFwKSB7IG8uYm9vdHN0cmFwID0gJ2F1dG8nOyB9XG4gICAgaWYgKG8uYm9vdHN0cmFwID09PSAnYXV0bycpIHtcbiAgICAgIGF1dG9ib290KCk7XG4gICAgfSBlbHNlIGlmIChvLmJvb3RzdHJhcCA9PT0gJ2lubGluZScpIHtcbiAgICAgIGlubGluZWJvb3QoKTtcbiAgICB9IGVsc2UgaWYgKG8uYm9vdHN0cmFwID09PSAnbWFudWFsJykge1xuICAgICAgbWFudWFsYm9vdCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3Ioby5ib290c3RyYXAgKyAnIGlzIG5vdCBhIHZhbGlkIGJvb3RzdHJhcCBtb2RlIScpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF1dG9ib290ICgpIHtcbiAgICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgc291cmNlOiAnYm9vdCcgfSwgZmV0Y2hlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBmZXRjaGVkIChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZldGNoaW5nIEpTT04gZGF0YSBtb2RlbCBmb3IgZmlyc3QgdmlldyBmYWlsZWQuJyk7XG4gICAgfVxuICAgIGJvb3QoZGF0YSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmxpbmVib290ICgpIHtcbiAgICB2YXIgaWQgPSBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLXRhdW51cycpO1xuICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIG1vZGVsID0gSlNPTi5wYXJzZSh1bmVzY2FwZShzY3JpcHQuaW5uZXJUZXh0IHx8IHNjcmlwdC50ZXh0Q29udGVudCkpO1xuICAgIGJvb3QobW9kZWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gbWFudWFsYm9vdCAoKSB7XG4gICAgaWYgKHR5cGVvZiBnLnRhdW51c1JlYWR5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBnLnRhdW51c1JlYWR5ID0gYm9vdDsgLy8gbm90IHlldCBhbiBvYmplY3Q/IHR1cm4gaXQgaW50byB0aGUgYm9vdCBtZXRob2RcbiAgICB9IGVsc2UgaWYgKGcudGF1bnVzUmVhZHkgJiYgdHlwZW9mIGcudGF1bnVzUmVhZHkgPT09ICdvYmplY3QnKSB7XG4gICAgICBib290KGcudGF1bnVzUmVhZHkpOyAvLyBhbHJlYWR5IGFuIG9iamVjdD8gYm9vdCB3aXRoIHRoYXQgYXMgdGhlIG1vZGVsXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRGlkIHlvdSBmb3JnZXQgdG8gYWRkIHRoZSB0YXVudXNSZWFkeSBnbG9iYWw/Jyk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYm9vdCAobW9kZWwpIHtcbiAgICBpZiAoYm9vdGVkKSB7IC8vIHNhbml0eVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIW1vZGVsIHx8IHR5cGVvZiBtb2RlbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIG1vZGVsIG11c3QgYmUgYW4gb2JqZWN0IScpO1xuICAgIH1cbiAgICBib290ZWQgPSB0cnVlO1xuICAgIGNhY2hpbmcucGVyc2lzdChyb3V0ZSwgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gICAgYWN0aXZhdG9yLnN0YXJ0KG1vZGVsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1vdW50O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHVzZWQ7XG4gIHJldHVybiBmdW5jdGlvbiBvbmNlICgpIHtcbiAgICBpZiAodXNlZCkgeyByZXR1cm47IH0gdXNlZCA9IHRydWU7XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xuXG5mdW5jdGlvbiBwb3NpdGlvbmluZyAoKSB7XG4gIHZhciB0YXJnZXQ7XG4gIHZhciBoYXNoID0gbG9jYXRpb24uaGFzaDtcbiAgaWYgKGhhc2gpIHtcbiAgICB0YXJnZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChoYXNoLnNsaWNlKDEpKTtcbiAgfVxuICBpZiAoIXRhcmdldCkge1xuICAgIHRhcmdldCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgfVxuICByYWYoZm9jdXNpbik7XG4gIGZ1bmN0aW9uIGZvY3VzaW4gKCkge1xuICAgIHRhcmdldC5zY3JvbGxJbnRvVmlldygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnRpYWwgKGNvbnRhaW5lciwgZW5mb3JjZWRBY3Rpb24sIG1vZGVsLCByb3V0ZSwgb3B0aW9ucykge1xuICB2YXIgYWN0aW9uID0gZW5mb3JjZWRBY3Rpb24gfHwgbW9kZWwgJiYgbW9kZWwuYWN0aW9uIHx8IHJvdXRlICYmIHJvdXRlLmFjdGlvbjtcbiAgdmFyIGNvbnRyb2xsZXIgPSBzdGF0ZS5jb250cm9sbGVyc1thY3Rpb25dO1xuICB2YXIgaW50ZXJuYWxzID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKGludGVybmFscy5yZW5kZXIgIT09IGZhbHNlKSB7XG4gICAgY29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlcihhY3Rpb24sIG1vZGVsKTtcbiAgICBpZiAoaW50ZXJuYWxzLnJvdXRlZCAhPT0gZmFsc2UpIHtcbiAgICAgIHBvc2l0aW9uaW5nKCk7XG4gICAgfVxuICB9XG4gIGVtaXR0ZXIuZW1pdCgncmVuZGVyJywgY29udGFpbmVyLCBtb2RlbCk7XG4gIGlmIChjb250cm9sbGVyKSB7XG4gICAgY29udHJvbGxlcihtb2RlbCwgY29udGFpbmVyLCByb3V0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyIChhY3Rpb24sIG1vZGVsKSB7XG4gIHZhciB0ZW1wbGF0ZSA9IHN0YXRlLnRlbXBsYXRlc1thY3Rpb25dO1xuICB0cnkge1xuICAgIHJldHVybiB0ZW1wbGF0ZShtb2RlbCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIHJlbmRlcmluZyBcIicgKyBhY3Rpb24gKyAnXCIgdGVtcGxhdGVcXG4nICsgZS5zdGFjayk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RhbmRhbG9uZSAoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSkge1xuICByZXR1cm4gcGFydGlhbChjb250YWluZXIsIGFjdGlvbiwgbW9kZWwsIHJvdXRlLCB7IHJvdXRlZDogZmFsc2UgfSk7XG59XG5cbnBhcnRpYWwuc3RhbmRhbG9uZSA9IHN0YW5kYWxvbmU7XG5cbm1vZHVsZS5leHBvcnRzID0gcGFydGlhbDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHVybCA9IHJlcXVpcmUoJ2Zhc3QtdXJsLXBhcnNlcicpO1xudmFyIHJvdXRlcyA9IHJlcXVpcmUoJ3JvdXRlcycpO1xudmFyIG1hdGNoZXIgPSByb3V0ZXMoKTtcblxuZnVuY3Rpb24gcm91dGVyIChyYXcpIHtcbiAgdmFyIHBhcnRzID0gdXJsLnBhcnNlKHJhdyk7XG4gIHZhciByZXN1bHQgPSBtYXRjaGVyLm1hdGNoKHBhcnRzLnBhdGhuYW1lKTtcbiAgdmFyIHJvdXRlID0gcmVzdWx0ID8gcmVzdWx0LmZuKHJlc3VsdCkgOiBudWxsO1xuICBpZiAocm91dGUpIHtcbiAgICByb3V0ZS51cmwgPSByYXc7XG4gICAgcm91dGUucGFydHMgPSBwYXJ0cztcbiAgfVxuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkZWZpbml0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZpbml0aW9ucykuZm9yRWFjaChkZWZpbmUuYmluZChudWxsLCBkZWZpbml0aW9ucykpO1xufVxuXG5mdW5jdGlvbiBkZWZpbmUgKGRlZmluaXRpb25zLCBrZXkpIHtcbiAgbWF0Y2hlci5hZGRSb3V0ZShrZXksIGZ1bmN0aW9uIGRlZmluaXRpb24gKG1hdGNoKSB7XG4gICAgdmFyIHBhcmFtcyA9IG1hdGNoLnBhcmFtcztcbiAgICBwYXJhbXMuYXJncyA9IG1hdGNoLnNwbGF0cztcbiAgICByZXR1cm4ge1xuICAgICAgcm91dGU6IGtleSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgYWN0aW9uOiBkZWZpbml0aW9uc1trZXldLmFjdGlvbiB8fCBudWxsLFxuICAgICAgaWdub3JlOiBkZWZpbml0aW9uc1trZXldLmlnbm9yZSxcbiAgICAgIGNhY2hlOiBkZWZpbml0aW9uc1trZXldLmNhY2hlXG4gICAgfTtcbiAgfSk7XG59XG5cbnJvdXRlci5zZXR1cCA9IHNldHVwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJvdXRlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNvbnRhaW5lcjogbnVsbFxufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGFwaSA9IHt9O1xudmFyIGcgPSBnbG9iYWw7XG52YXIgaWRiID0gZy5pbmRleGVkREIgfHwgZy5tb3pJbmRleGVkREIgfHwgZy53ZWJraXRJbmRleGVkREIgfHwgZy5tc0luZGV4ZWREQjtcbnZhciBzdXBwb3J0cztcbnZhciBkYjtcbnZhciBkYk5hbWUgPSAndGF1bnVzLWNhY2hlJztcbnZhciBzdG9yZSA9ICd2aWV3LW1vZGVscyc7XG52YXIga2V5UGF0aCA9ICd1cmwnO1xudmFyIHNldFF1ZXVlID0gW107XG52YXIgdGVzdGVkUXVldWUgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiB0ZXN0ICgpIHtcbiAgdmFyIGtleSA9ICdpbmRleGVkLWRiLWZlYXR1cmUtZGV0ZWN0aW9uJztcbiAgdmFyIHJlcTtcbiAgdmFyIGRiO1xuXG4gIGlmICghKGlkYiAmJiAnZGVsZXRlRGF0YWJhc2UnIGluIGlkYikpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTsgcmV0dXJuO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KS5vbnN1Y2Nlc3MgPSB0cmFuc2FjdGlvbmFsVGVzdDtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN1cHBvcnQoZmFsc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJhbnNhY3Rpb25hbFRlc3QgKCkge1xuICAgIHJlcSA9IGlkYi5vcGVuKGtleSwgMSk7XG4gICAgcmVxLm9udXBncmFkZW5lZWRlZCA9IHVwZ25lZWRlZDtcbiAgICByZXEub25lcnJvciA9IGVycm9yO1xuICAgIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gICAgZnVuY3Rpb24gdXBnbmVlZGVkICgpIHtcbiAgICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoJ3N0b3JlJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgICBkYiA9IHJlcS5yZXN1bHQ7XG4gICAgICB0cnkge1xuICAgICAgICBkYi50cmFuc2FjdGlvbignc3RvcmUnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3N0b3JlJykuYWRkKG5ldyBCbG9iKCksICdrZXknKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgc3VwcG9ydChmYWxzZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkYi5jbG9zZSgpO1xuICAgICAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KTtcbiAgICAgICAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkge1xuICAgICAgICAgIG9wZW4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvcGVuICgpIHtcbiAgdmFyIHJlcSA9IGlkYi5vcGVuKGRiTmFtZSwgMSk7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG4gIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgcmVxLnJlc3VsdC5jcmVhdGVPYmplY3RTdG9yZShzdG9yZSwgeyBrZXlQYXRoOiBrZXlQYXRoIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgZGIgPSByZXEucmVzdWx0O1xuICAgIGFwaS5uYW1lID0gJ0luZGV4ZWREQic7XG4gICAgYXBpLmdldCA9IGdldDtcbiAgICBhcGkuc2V0ID0gc2V0O1xuICAgIGRyYWluU2V0KCk7XG4gICAgc3VwcG9ydCh0cnVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmYWxsYmFjayAoKSB7XG4gIGFwaS5uYW1lID0gJ0luZGV4ZWREQi1mYWxsYmFja1N0b3JlJztcbiAgYXBpLmdldCA9IHVuZGVmaW5lZEdldDtcbiAgYXBpLnNldCA9IGVucXVldWVTZXQ7XG59XG5cbmZ1bmN0aW9uIHVuZGVmaW5lZEdldCAoa2V5LCBkb25lKSB7XG4gIGRvbmUobnVsbCwgbnVsbCk7XG59XG5cbmZ1bmN0aW9uIGVucXVldWVTZXQgKGtleSwgIHZhbHVlLCBkb25lKSB7XG4gIGlmIChzZXRRdWV1ZS5sZW5ndGggPiAyKSB7IC8vIGxldCdzIG5vdCB3YXN0ZSBhbnkgbW9yZSBtZW1vcnlcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkgeyAvLyBsZXQncyBhc3N1bWUgdGhlIGNhcGFiaWxpdHkgaXMgdmFsaWRhdGVkIHNvb25cbiAgICBzZXRRdWV1ZS5wdXNoKHsga2V5OiBrZXksIHZhbHVlOiB2YWx1ZSwgZG9uZTogZG9uZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblNldCAoKSB7XG4gIHdoaWxlIChzZXRRdWV1ZS5sZW5ndGgpIHtcbiAgICB2YXIgaXRlbSA9IHNldFF1ZXVlLnNoaWZ0KCk7XG4gICAgc2V0KGl0ZW0ua2V5LCBpdGVtLnZhbHVlLCBpdGVtLmRvbmUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHF1ZXJ5IChvcCwgdmFsdWUsIGRvbmUpIHtcbiAgdmFyIHJlcSA9IGRiLnRyYW5zYWN0aW9uKHN0b3JlLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoc3RvcmUpW29wXSh2YWx1ZSk7XG5cbiAgcmVxLm9uc3VjY2VzcyA9IHN1Y2Nlc3M7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobnVsbCwgcmVxLnJlc3VsdCk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobmV3IEVycm9yKCdUYXVudXMgY2FjaGUgcXVlcnkgZmFpbGVkIGF0IEluZGV4ZWREQiEnKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgcXVlcnkoJ2dldCcsIGtleSwgZG9uZSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICB2YWx1ZVtrZXlQYXRoXSA9IGtleTtcbiAgcXVlcnkoJ2FkZCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byBpbnNlcnRcbiAgcXVlcnkoJ3B1dCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byB1cGRhdGVcbn1cblxuZnVuY3Rpb24gZHJhaW5UZXN0ZWQgKCkge1xuICB3aGlsZSAodGVzdGVkUXVldWUubGVuZ3RoKSB7XG4gICAgdGVzdGVkUXVldWUuc2hpZnQoKSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRlc3RlZCAoZm4pIHtcbiAgaWYgKHN1cHBvcnRzICE9PSB2b2lkIDApIHtcbiAgICBmbigpO1xuICB9IGVsc2Uge1xuICAgIHRlc3RlZFF1ZXVlLnB1c2goZm4pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN1cHBvcnQgKHZhbHVlKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgcmV0dXJuOyAvLyBzYW5pdHlcbiAgfVxuICBzdXBwb3J0cyA9IHZhbHVlO1xuICBkcmFpblRlc3RlZCgpO1xufVxuXG5mdW5jdGlvbiBmYWlsZWQgKCkge1xuICBzdXBwb3J0KGZhbHNlKTtcbn1cblxuZmFsbGJhY2soKTtcbnRlc3QoKTtcbnNldFRpbWVvdXQoZmFpbGVkLCA2MDApOyAvLyB0aGUgdGVzdCBjYW4gdGFrZSBzb21ld2hlcmUgbmVhciAzMDBtcyB0byBjb21wbGV0ZVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcblxuYXBpLnRlc3RlZCA9IHRlc3RlZDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciByYXcgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiBnZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIHJhd1trZXldKTtcbn1cblxuZnVuY3Rpb24gc2V0IChrZXksIHZhbHVlLCBkb25lKSB7XG4gIHJhd1trZXldID0gdmFsdWU7XG4gIChkb25lIHx8IG5vb3ApKG51bGwpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbmFtZTogJ21lbW9yeVN0b3JlJyxcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVFc2NhcGVkSHRtbCA9IC8mKD86YW1wfGx0fGd0fHF1b3R8IzM5fCM5Nik7L2c7XG52YXIgaHRtbFVuZXNjYXBlcyA9IHtcbiAgJyZhbXA7JzogJyYnLFxuICAnJmx0Oyc6ICc8JyxcbiAgJyZndDsnOiAnPicsXG4gICcmcXVvdDsnOiAnXCInLFxuICAnJiMzOTsnOiAnXFwnJyxcbiAgJyYjOTY7JzogJ2AnXG59O1xuXG5mdW5jdGlvbiB1bmVzY2FwZUh0bWxDaGFyIChjKSB7XG4gIHJldHVybiBodG1sVW5lc2NhcGVzW2NdO1xufVxuXG5mdW5jdGlvbiB1bmVzY2FwZSAoaW5wdXQpIHtcbiAgdmFyIGRhdGEgPSBpbnB1dCA9PSBudWxsID8gJycgOiBTdHJpbmcoaW5wdXQpO1xuICBpZiAoZGF0YSAmJiAocmVFc2NhcGVkSHRtbC5sYXN0SW5kZXggPSAwLCByZUVzY2FwZWRIdG1sLnRlc3QoZGF0YSkpKSB7XG4gICAgcmV0dXJuIGRhdGEucmVwbGFjZShyZUVzY2FwZWRIdG1sLCB1bmVzY2FwZUh0bWxDaGFyKTtcbiAgfVxuICByZXR1cm4gZGF0YTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB1bmVzY2FwZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJ3hocicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAodXJsLCBkb25lKSB7XG4gIHZhciBvcHRpb25zID0ge1xuICAgIHVybDogdXJsLFxuICAgIGpzb246IHRydWUsXG4gICAgaGVhZGVyczogeyBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyB9XG4gIH07XG4gIHZhciByZXEgPSB4aHIob3B0aW9ucywgaGFuZGxlKTtcblxuICByZXR1cm4gcmVxO1xuXG4gIGZ1bmN0aW9uIGhhbmRsZSAoZXJyLCByZXMsIGJvZHkpIHtcbiAgICBpZiAoZXJyICYmICFyZXEuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpIHtcbiAgICAgIGRvbmUobmV3IEVycm9yKCdhYm9ydGVkJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKGVyciwgYm9keSk7XG4gICAgfVxuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9jb250cmEuZW1pdHRlci5qcycpO1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbihmdW5jdGlvbiAocm9vdCwgdW5kZWZpbmVkKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgdW5kZWYgPSAnJyArIHVuZGVmaW5lZDtcbiAgZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiAgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHsgaWYgKCFmbikgeyByZXR1cm47IH0gdGljayhmdW5jdGlvbiBydW4gKCkgeyBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7IH0pOyB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gdGlja2VyXG4gIHZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG4gIGlmIChzaSkge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gdW5kZWYgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgIHRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICB9IGVsc2Uge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG4gIH1cblxuICBmdW5jdGlvbiBfZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2dCA9IHt9O1xuICAgIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGMgPT09IDEpIHtcbiAgICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgICBldnQgPSB7fTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgY3R4ID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIHR5cGUgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0KSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldnRbdHlwZV0gPSBldC5maWx0ZXIoZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgcmV0dXJuICFsaXN0ZW4uX29uY2U7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IF9lbWl0dGVyO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gcm9vdC5jb250cmEgfHwge307XG4gICAgcm9vdC5jb250cmEuZW1pdHRlciA9IF9lbWl0dGVyO1xuICB9XG59KSh0aGlzKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIlwidXNlIHN0cmljdFwiO1xuLypcbkNvcHlyaWdodCAoYykgMjAxNCBQZXRrYSBBbnRvbm92XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuICBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG4qL1xuZnVuY3Rpb24gVXJsKCkge1xuICAgIC8vRm9yIG1vcmUgZWZmaWNpZW50IGludGVybmFsIHJlcHJlc2VudGF0aW9uIGFuZCBsYXppbmVzcy5cbiAgICAvL1RoZSBub24tdW5kZXJzY29yZSB2ZXJzaW9ucyBvZiB0aGVzZSBwcm9wZXJ0aWVzIGFyZSBhY2Nlc3NvciBmdW5jdGlvbnNcbiAgICAvL2RlZmluZWQgb24gdGhlIHByb3RvdHlwZS5cbiAgICB0aGlzLl9wcm90b2NvbCA9IG51bGw7XG4gICAgdGhpcy5faHJlZiA9IFwiXCI7XG4gICAgdGhpcy5fcG9ydCA9IC0xO1xuICAgIHRoaXMuX3F1ZXJ5ID0gbnVsbDtcblxuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICB0aGlzLmhvc3QgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuXG4gICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gZmFsc2U7XG59XG5cbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoXCJxdWVyeXN0cmluZ1wiKTtcblVybC5wcm90b3R5cGUucGFyc2UgPVxuZnVuY3Rpb24gVXJsJHBhcnNlKHN0ciwgcGFyc2VRdWVyeVN0cmluZywgaG9zdERlbm90ZXNTbGFzaCkge1xuICAgIGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICtcbiAgICAgICAgICAgIHR5cGVvZiBzdHIpO1xuICAgIH1cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSBzdHIubGVuZ3RoIC0gMTtcblxuICAgIC8vVHJpbSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3c1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChzdGFydCkgPD0gMHgyMCAvKicgJyovKSBzdGFydCsrO1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChlbmQpIDw9IDB4MjAgLyonICcqLykgZW5kLS07XG5cbiAgICBzdGFydCA9IHRoaXMuX3BhcnNlUHJvdG9jb2woc3RyLCBzdGFydCwgZW5kKTtcblxuICAgIC8vSmF2YXNjcmlwdCBkb2Vzbid0IGhhdmUgaG9zdFxuICAgIGlmICh0aGlzLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgc3RhcnQgPSB0aGlzLl9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBob3N0RGVub3Rlc1NsYXNoKTtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICAgICAgKHRoaXMuc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoUHJvdG9jb2xzW3Byb3RvXSkpKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFydCA8PSBlbmQpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHsgLy9Gb3IgamF2YXNjcmlwdCB0aGUgcGF0aG5hbWUgaXMganVzdCB0aGUgcmVzdCBvZiBpdFxuICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGF0aG5hbWUgJiYgdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICB0aGlzLl9zbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF0pIHtcbiAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgIH1cblxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICAgICAgaWYgKHNlYXJjaCA9PSBudWxsKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSB0aGlzLnNlYXJjaCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgICAvL1RoaXMgY2FsbHMgYSBzZXR0ZXIgZnVuY3Rpb24sIHRoZXJlIGlzIG5vIC5xdWVyeSBkYXRhIHByb3BlcnR5XG4gICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZShzZWFyY2gpO1xuICAgIH1cbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlKHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdChVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRmb3JtYXQoKSB7XG4gICAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgXCJcIjtcblxuICAgIGlmIChhdXRoKSB7XG4gICAgICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCBcIjpcIik7XG4gICAgICAgIGF1dGggKz0gXCJAXCI7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCBcIlwiO1xuICAgIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCBcIlwiO1xuICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgIHZhciBxdWVyeSA9IFwiXCI7XG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0IHx8IFwiXCI7XG4gICAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgICB2YXIgc2NoZW1lID0gXCJcIjtcblxuICAgIC8vQ2FjaGUgdGhlIHJlc3VsdCBvZiB0aGUgZ2V0dGVyIGZ1bmN0aW9uXG4gICAgdmFyIHEgPSB0aGlzLnF1ZXJ5O1xuICAgIGlmIChxICYmIHR5cGVvZiBxID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHEpO1xuICAgIH1cblxuICAgIGlmICghc2VhcmNoKSB7XG4gICAgICAgIHNlYXJjaCA9IHF1ZXJ5ID8gXCI/XCIgKyBxdWVyeSA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDB4M0EgLyonOicqLylcbiAgICAgICAgcHJvdG9jb2wgKz0gXCI6XCI7XG5cbiAgICBpZiAodGhpcy5ob3N0KSB7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICAgIH1cbiAgICBlbHNlIGlmIChob3N0bmFtZSkge1xuICAgICAgICB2YXIgaXA2ID0gaG9zdG5hbWUuaW5kZXhPZihcIjpcIikgPiAtMTtcbiAgICAgICAgaWYgKGlwNikgaG9zdG5hbWUgPSBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgaG9zdG5hbWUgKyAocG9ydCA/IFwiOlwiICsgcG9ydCA6IFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBzbGFzaGVzID0gdGhpcy5zbGFzaGVzIHx8XG4gICAgICAgICgoIXByb3RvY29sIHx8XG4gICAgICAgIHNsYXNoUHJvdG9jb2xzW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpO1xuXG5cbiAgICBpZiAocHJvdG9jb2wpIHNjaGVtZSA9IHByb3RvY29sICsgKHNsYXNoZXMgPyBcIi8vXCIgOiBcIlwiKTtcbiAgICBlbHNlIGlmIChzbGFzaGVzKSBzY2hlbWUgPSBcIi8vXCI7XG5cbiAgICBpZiAoc2xhc2hlcyAmJiBwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIi9cIiArIHBhdGhuYW1lO1xuICAgIH1cbiAgICBlbHNlIGlmICghc2xhc2hlcyAmJiBwYXRobmFtZSA9PT0gXCIvXCIpIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSAweDNGIC8qJz8nKi8pXG4gICAgICAgIHNlYXJjaCA9IFwiP1wiICsgc2VhcmNoO1xuICAgIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMHgyMyAvKicjJyovKVxuICAgICAgICBoYXNoID0gXCIjXCIgKyBoYXNoO1xuXG4gICAgcGF0aG5hbWUgPSBlc2NhcGVQYXRoTmFtZShwYXRobmFtZSk7XG4gICAgc2VhcmNoID0gZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG5cbiAgICByZXR1cm4gc2NoZW1lICsgKGhvc3QgPT09IGZhbHNlID8gXCJcIiA6IGhvc3QpICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJHJlc29sdmVPYmplY3QocmVsYXRpdmUpIHtcbiAgICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZWxhdGl2ZSA9IFVybC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMuX2Nsb25lKCk7XG5cbiAgICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlXCJzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICAgIGlmICghcmVsYXRpdmUuaHJlZikge1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICAgIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5fcHJvdG9jb2wpIHtcbiAgICAgICAgcmVsYXRpdmUuX2NvcHlQcm9wc1RvKHJlc3VsdCwgdHJ1ZSk7XG5cbiAgICAgICAgaWYgKHNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdICYmXG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gcmVzdWx0Ll9wcm90b2NvbCkge1xuICAgICAgICAvLyBpZiBpdFwicyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgICAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAgICAgLy8gZmlyc3QsIGlmIGl0XCJzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgICAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgICAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGJlY2F1c2UgdGhhdFwicyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAgICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgICAgICBpZiAoIXNsYXNoUHJvdG9jb2xzW3JlbGF0aXZlLl9wcm90b2NvbF0pIHtcbiAgICAgICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIGZhbHNlKTtcbiAgICAgICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Ll9wcm90b2NvbCA9IHJlbGF0aXZlLl9wcm90b2NvbDtcbiAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0ICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8IFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAocmVsUGF0aFswXSAhPT0gXCJcIikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKFwiL1wiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IFwiXCI7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgcmVzdWx0Ll9wb3J0ID0gcmVsYXRpdmUuX3BvcnQ7XG4gICAgICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICB2YXIgaXNTb3VyY2VBYnMgPVxuICAgICAgICAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pO1xuICAgIHZhciBpc1JlbEFicyA9IChcbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICAgIChyZWxhdGl2ZS5wYXRobmFtZSAmJlxuICAgICAgICAgICAgcmVsYXRpdmUucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKVxuICAgICAgICApO1xuICAgIHZhciBtdXN0RW5kQWJzID0gKGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKTtcblxuICAgIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcblxuICAgIHZhciBzcmNQYXRoID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5fcHJvdG9jb2wgJiYgIXNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdO1xuXG4gICAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAgIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gICAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IC0xO1xuICAgICAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgICAgICAgIGlmIChzcmNQYXRoWzBdID09PSBcIlwiKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICAgICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Lmhvc3QgPSBcIlwiO1xuICAgICAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICByZWxhdGl2ZS5fcG9ydCA9IC0xO1xuICAgICAgICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gXCJcIikgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgICAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gXCJcIiB8fCBzcmNQYXRoWzBdID09PSBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaXNSZWxBYnMpIHtcbiAgICAgICAgLy8gaXRcInMgYWJzb2x1dGUuXG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lID9cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAgICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gICAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgICAgICAvLyBpdFwicyByZWxhdGl2ZVxuICAgICAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICAgICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgICAgIHNyY1BhdGgucG9wKCk7XG4gICAgICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCkge1xuICAgICAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgICAgIC8vIGxpa2UgaHJlZj1cIj9mb29cIi5cbiAgICAgICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoXCJtYWlsdG86bG9jYWwxQGRvbWFpbjFcIiwgXCJsb2NhbDJAZG9tYWluMlwiKVxuICAgICAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgICAgICAvLyB3ZVwidmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gICAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAgIChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gXCIuXCIgfHwgbGFzdCA9PT0gXCIuLlwiKSB8fFxuICAgICAgICBsYXN0ID09PSBcIlwiKTtcblxuICAgIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICAgIHZhciB1cCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgICAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICAgICAgaWYgKGxhc3QgPT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICB9IGVsc2UgaWYgKGxhc3QgPT09IFwiLi5cIikge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cCsrO1xuICAgICAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHVwLS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gICAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiLi5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSBcIlwiICYmXG4gICAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgIT09IDB4MkYgLyonLycqLykpIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oXCIvXCIpLnN1YnN0cigtMSkgIT09IFwiL1wiKSkge1xuICAgICAgICBzcmNQYXRoLnB1c2goXCJcIik7XG4gICAgfVxuXG4gICAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSBcIlwiIHx8XG4gICAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcblxuICAgIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IGlzQWJzb2x1dGUgPyBcIlwiIDpcbiAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogXCJcIjtcbiAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpIDogZmFsc2U7XG4gICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICAgIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmxlbmd0aCA9PT0gMCA/IG51bGwgOiBzcmNQYXRoLmpvaW4oXCIvXCIpO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIHB1bnljb2RlID0gcmVxdWlyZShcInB1bnljb2RlXCIpO1xuVXJsLnByb3RvdHlwZS5faG9zdElkbmEgPSBmdW5jdGlvbiBVcmwkX2hvc3RJZG5hKGhvc3RuYW1lKSB7XG4gICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgIHZhciBkb21haW5BcnJheSA9IGhvc3RuYW1lLnNwbGl0KFwiLlwiKTtcbiAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgIFwieG4tLVwiICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgfVxuICAgIHJldHVybiBuZXdPdXQuam9pbihcIi5cIik7XG59O1xuXG52YXIgZXNjYXBlUGF0aE5hbWUgPSBVcmwucHJvdG90eXBlLl9lc2NhcGVQYXRoTmFtZSA9XG5mdW5jdGlvbiBVcmwkX2VzY2FwZVBhdGhOYW1lKHBhdGhuYW1lKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIocGF0aG5hbWUsIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovKSkge1xuICAgICAgICByZXR1cm4gcGF0aG5hbWU7XG4gICAgfVxuICAgIC8vQXZvaWQgY2xvc3VyZSBjcmVhdGlvbiB0byBrZWVwIHRoaXMgaW5saW5hYmxlXG4gICAgcmV0dXJuIF9lc2NhcGVQYXRoKHBhdGhuYW1lKTtcbn07XG5cbnZhciBlc2NhcGVTZWFyY2ggPSBVcmwucHJvdG90eXBlLl9lc2NhcGVTZWFyY2ggPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIoc2VhcmNoLCAweDIzIC8qJyMnKi8sIC0xKSkgcmV0dXJuIHNlYXJjaDtcbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVByb3RvY29sID0gZnVuY3Rpb24gVXJsJF9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBwcm90b2NvbENoYXJhY3RlcnMgPSB0aGlzLl9wcm90b2NvbENoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgIHZhciBwcm90b2NvbCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICBpZiAoZG9Mb3dlckNhc2UpIHByb3RvY29sID0gcHJvdG9jb2wudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJvdG9jb2xDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGNoIDwgMHg2MSAvKidhJyovKVxuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlQXV0aCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VBdXRoKHN0ciwgc3RhcnQsIGVuZCwgZGVjb2RlKSB7XG4gICAgdmFyIGF1dGggPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEpO1xuICAgIGlmIChkZWNvZGUpIHtcbiAgICAgICAgYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG4gICAgdGhpcy5hdXRoID0gYXV0aDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUG9ydCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQb3J0KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIC8vSW50ZXJuYWwgZm9ybWF0IGlzIGludGVnZXIgZm9yIG1vcmUgZWZmaWNpZW50IHBhcnNpbmdcbiAgICAvL2FuZCBmb3IgZWZmaWNpZW50IHRyaW1taW5nIG9mIGxlYWRpbmcgemVyb3NcbiAgICB2YXIgcG9ydCA9IDA7XG4gICAgLy9EaXN0aW5ndWlzaCBiZXR3ZWVuIDowIGFuZCA6IChubyBwb3J0IG51bWJlciBhdCBhbGwpXG4gICAgdmFyIGhhZENoYXJzID0gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pIHtcbiAgICAgICAgICAgIHBvcnQgPSAoMTAgKiBwb3J0KSArIChjaCAtIDB4MzAgLyonMCcqLyk7XG4gICAgICAgICAgICBoYWRDaGFycyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBicmVhaztcblxuICAgIH1cbiAgICBpZiAocG9ydCA9PT0gMCAmJiAhaGFkQ2hhcnMpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgdGhpcy5fcG9ydCA9IHBvcnQ7XG4gICAgcmV0dXJuIGkgLSBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSG9zdCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlSG9zdChzdHIsIHN0YXJ0LCBlbmQsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgdmFyIGhvc3RFbmRpbmdDaGFyYWN0ZXJzID0gdGhpcy5faG9zdEVuZGluZ0NoYXJhY3RlcnM7XG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHgyRiAvKicvJyovICYmXG4gICAgICAgIHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgMSkgPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuXG4gICAgICAgIC8vVGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHtcbiAgICAgICAgICAgIC8vVGhlIHN0cmluZyBpcyBqdXN0IFwiLy9cIlxuICAgICAgICAgICAgaWYgKGVuZCA8IDIpIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIC8vSWYgc2xhc2hlcyBkbyBub3QgZGVub3RlIGhvc3QgYW5kIHRoZXJlIGlzIG5vIGF1dGgsXG4gICAgICAgICAgICAvL3RoZXJlIGlzIG5vIGhvc3Qgd2hlbiB0aGUgc3RyaW5nIHN0YXJ0cyB3aXRoIC8vXG4gICAgICAgICAgICB2YXIgaGFzQXV0aCA9XG4gICAgICAgICAgICAgICAgY29udGFpbnNDaGFyYWN0ZXIoc3RyLCAweDQwIC8qJ0AnKi8sIDIsIGhvc3RFbmRpbmdDaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIGlmICghaGFzQXV0aCAmJiAhc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL1RoZXJlIGlzIGEgaG9zdCB0aGF0IHN0YXJ0cyBhZnRlciB0aGUgLy9cbiAgICAgICAgc3RhcnQgKz0gMjtcbiAgICB9XG4gICAgLy9JZiB0aGVyZSBpcyBubyBzbGFzaGVzLCB0aGVyZSBpcyBubyBob3N0bmFtZSBpZlxuICAgIC8vMS4gdGhlcmUgd2FzIG5vIHByb3RvY29sIGF0IGFsbFxuICAgIGVsc2UgaWYgKCF0aGlzLl9wcm90b2NvbCB8fFxuICAgICAgICAvLzIuIHRoZXJlIHdhcyBhIHByb3RvY29sIHRoYXQgcmVxdWlyZXMgc2xhc2hlc1xuICAgICAgICAvL2UuZy4gaW4gJ2h0dHA6YXNkJyAnYXNkJyBpcyBub3QgYSBob3N0bmFtZVxuICAgICAgICBzbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF1cbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBpZG5hID0gZmFsc2U7XG4gICAgdmFyIGhvc3ROYW1lU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgaG9zdE5hbWVFbmQgPSBlbmQ7XG4gICAgdmFyIGxhc3RDaCA9IC0xO1xuICAgIHZhciBwb3J0TGVuZ3RoID0gMDtcbiAgICB2YXIgY2hhcnNBZnRlckRvdCA9IDA7XG4gICAgdmFyIGF1dGhOZWVkc0RlY29kaW5nID0gZmFsc2U7XG5cbiAgICB2YXIgaiA9IC0xO1xuXG4gICAgLy9GaW5kIHRoZSBsYXN0IG9jY3VycmVuY2Ugb2YgYW4gQC1zaWduIHVudGlsIGhvc3RlbmRpbmcgY2hhcmFjdGVyIGlzIG1ldFxuICAgIC8vYWxzbyBtYXJrIGlmIGRlY29kaW5nIGlzIG5lZWRlZCBmb3IgdGhlIGF1dGggcG9ydGlvblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4NDAgLyonQCcqLykge1xuICAgICAgICAgICAgaiA9IGk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNoZWNrIGlzIHZlcnksIHZlcnkgY2hlYXAuIFVubmVlZGVkIGRlY29kZVVSSUNvbXBvbmVudCBpcyB2ZXJ5XG4gICAgICAgIC8vdmVyeSBleHBlbnNpdmVcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjUgLyonJScqLykge1xuICAgICAgICAgICAgYXV0aE5lZWRzRGVjb2RpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhvc3RFbmRpbmdDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvL0Atc2lnbiB3YXMgZm91bmQgYXQgaW5kZXggaiwgZXZlcnl0aGluZyB0byB0aGUgbGVmdCBmcm9tIGl0XG4gICAgLy9pcyBhdXRoIHBhcnRcbiAgICBpZiAoaiA+IC0xKSB7XG4gICAgICAgIHRoaXMuX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBqIC0gMSwgYXV0aE5lZWRzRGVjb2RpbmcpO1xuICAgICAgICAvL2hvc3RuYW1lIHN0YXJ0cyBhZnRlciB0aGUgbGFzdCBALXNpZ25cbiAgICAgICAgc3RhcnQgPSBob3N0TmFtZVN0YXJ0ID0gaiArIDE7XG4gICAgfVxuXG4gICAgLy9Ib3N0IG5hbWUgaXMgc3RhcnRpbmcgd2l0aCBhIFtcbiAgICBpZiAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpID09PSAweDVCIC8qJ1snKi8pIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0ICsgMTsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgICAgIC8vQXNzdW1lIHZhbGlkIElQNiBpcyBiZXR3ZWVuIHRoZSBicmFja2V0c1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDVEIC8qJ10nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAyLCBlbmQpICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKHN0YXJ0ICsgMSwgaSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBcIltcIiArIGhvc3RuYW1lICsgXCJdOlwiICsgdGhpcy5fcG9ydFxuICAgICAgICAgICAgICAgICAgICA6IFwiW1wiICsgaG9zdG5hbWUgKyBcIl1cIjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGkgKyBwb3J0TGVuZ3RoICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL0VtcHR5IGhvc3RuYW1lLCBbIHN0YXJ0cyBhIHBhdGhcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICBpZiAoY2hhcnNBZnRlckRvdCA+IDYyKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gc3RyLnNsaWNlKHN0YXJ0LCBpKTtcbiAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICBwb3J0TGVuZ3RoID0gdGhpcy5fcGFyc2VQb3J0KHN0ciwgaSArIDEsIGVuZCkgKyAxO1xuICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoIDwgMHg2MSAvKidhJyovKSB7XG4gICAgICAgICAgICBpZiAoY2ggPT09IDB4MkUgLyonLicqLykge1xuICAgICAgICAgICAgICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGlmIChsYXN0Q2ggPT09IERPVCB8fCBsYXN0Q2ggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2hhcnNBZnRlckRvdCA9IC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoMHg0MSAvKidBJyovIDw9IGNoICYmIGNoIDw9IDB4NUEgLyonWicqLykge1xuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCEoY2ggPT09IDB4MkQgLyonLScqLyB8fCBjaCA9PT0gMHg1RiAvKidfJyovIHx8XG4gICAgICAgICAgICAgICAgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pKSkge1xuICAgICAgICAgICAgICAgIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDAgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID49IDB4N0IgLyoneycqLykge1xuICAgICAgICAgICAgaWYgKGNoIDw9IDB4N0UgLyonficqLykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnNbY2hdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZG5hID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0Q2ggPSBjaDtcbiAgICAgICAgY2hhcnNBZnRlckRvdCsrO1xuICAgIH1cblxuICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAvKlxuICAgIGlmIChsYXN0Q2ggPT09IERPVCkge1xuICAgICAgICBob3N0TmFtZUVuZC0tO1xuICAgIH1cbiAgICAqL1xuXG4gICAgaWYgKGhvc3ROYW1lRW5kICsgMSAhPT0gc3RhcnQgJiZcbiAgICAgICAgaG9zdE5hbWVFbmQgLSBob3N0TmFtZVN0YXJ0IDw9IDI1Nikge1xuICAgICAgICB2YXIgaG9zdG5hbWUgPSBzdHIuc2xpY2UoaG9zdE5hbWVTdGFydCwgaG9zdE5hbWVFbmQgKyAxKTtcbiAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBob3N0bmFtZSA9IGhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChpZG5hKSBob3N0bmFtZSA9IHRoaXMuX2hvc3RJZG5hKGhvc3RuYW1lKTtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICB0aGlzLmhvc3QgPSB0aGlzLl9wb3J0ID4gMCA/IGhvc3RuYW1lICsgXCI6XCIgKyB0aGlzLl9wb3J0IDogaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhvc3ROYW1lRW5kICsgMSArIHBvcnRMZW5ndGg7XG5cbn07XG5cblVybC5wcm90b3R5cGUuX2NvcHlQcm9wc1RvID0gZnVuY3Rpb24gVXJsJF9jb3B5UHJvcHNUbyhpbnB1dCwgbm9Qcm90b2NvbCkge1xuICAgIGlmICghbm9Qcm90b2NvbCkge1xuICAgICAgICBpbnB1dC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICB9XG4gICAgaW5wdXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIGlucHV0Ll9wb3J0ID0gdGhpcy5fcG9ydDtcbiAgICBpbnB1dC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIGlucHV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgaW5wdXQuc2xhc2hlcyA9IHRoaXMuc2xhc2hlcztcbiAgICBpbnB1dC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIGlucHV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICBpbnB1dC5oYXNoID0gdGhpcy5oYXNoO1xuICAgIGlucHV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIGlucHV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbn07XG5cblVybC5wcm90b3R5cGUuX2Nsb25lID0gZnVuY3Rpb24gVXJsJF9jbG9uZSgpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICByZXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIHJldC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgcmV0Ll9wcmVwZW5kU2xhc2ggPSB0aGlzLl9wcmVwZW5kU2xhc2g7XG4gICAgcmV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgcmV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgcmV0Lmhvc3QgPSB0aGlzLmhvc3Q7XG4gICAgcmV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICByZXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICByZXQuc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgcmV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fZ2V0Q29tcG9uZW50RXNjYXBlZCA9XG5mdW5jdGlvbiBVcmwkX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIGN1ciA9IHN0YXJ0O1xuICAgIHZhciBpID0gc3RhcnQ7XG4gICAgdmFyIHJldCA9IFwiXCI7XG4gICAgdmFyIGF1dG9Fc2NhcGVNYXAgPSB0aGlzLl9hdXRvRXNjYXBlTWFwO1xuICAgIGZvciAoOyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB2YXIgZXNjYXBlZCA9IGF1dG9Fc2NhcGVNYXBbY2hdO1xuXG4gICAgICAgIGlmIChlc2NhcGVkICE9PSBcIlwiKSB7XG4gICAgICAgICAgICBpZiAoY3VyIDwgaSkgcmV0ICs9IHN0ci5zbGljZShjdXIsIGkpO1xuICAgICAgICAgICAgcmV0ICs9IGVzY2FwZWQ7XG4gICAgICAgICAgICBjdXIgPSBpICsgMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VyIDwgaSArIDEpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQYXRoID1cbmZ1bmN0aW9uIFVybCRfcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBwYXRoU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgcGF0aEVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBwYXRoRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXRoU3RhcnQgPiBwYXRoRW5kKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwYXRoO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcGF0aCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBwYXRoU3RhcnQsIHBhdGhFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcGF0aCA9IHN0ci5zbGljZShwYXRoU3RhcnQsIHBhdGhFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5wYXRobmFtZSA9IHRoaXMuX3ByZXBlbmRTbGFzaCA/IFwiL1wiICsgcGF0aCA6IHBhdGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVF1ZXJ5ID0gZnVuY3Rpb24gVXJsJF9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBxdWVyeVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHF1ZXJ5RW5kID0gZW5kO1xuICAgIHZhciBlc2NhcGUgPSBmYWxzZTtcbiAgICB2YXIgYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSB0aGlzLl9hdXRvRXNjYXBlQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHF1ZXJ5RW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChxdWVyeVN0YXJ0ID4gcXVlcnlFbmQpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5O1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcXVlcnkgPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcXVlcnlTdGFydCwgcXVlcnlFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSBzdHIuc2xpY2UocXVlcnlTdGFydCwgcXVlcnlFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5zZWFyY2ggPSBxdWVyeTtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSGFzaCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIGlmIChzdGFydCA+IGVuZCkge1xuICAgICAgICB0aGlzLmhhc2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaGFzaCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInBvcnRcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wb3J0ID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiAoXCJcIiArIHRoaXMuX3BvcnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSBwYXJzZUludCh2LCAxMCk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicXVlcnlcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5O1xuICAgICAgICBpZiAocXVlcnkgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcblxuICAgICAgICBpZiAoc2VhcmNoKSB7XG4gICAgICAgICAgICBpZiAoc2VhcmNoLmNoYXJDb2RlQXQoMCkgPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzZWFyY2ggIT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHNlYXJjaDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWFyY2g7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5fcXVlcnkgPSB2O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwYXRoXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgICAgICBpZiAocCB8fCBzKSB7XG4gICAgICAgICAgICByZXR1cm4gcCArIHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChwID09IG51bGwgJiYgcykgPyAoXCIvXCIgKyBzKSA6IG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKCkge31cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwcm90b2NvbFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIHJldHVybiBwcm90byA/IHByb3RvICsgXCI6XCIgOiBwcm90bztcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBlbmQgPSB2Lmxlbmd0aCAtIDE7XG4gICAgICAgICAgICBpZiAodi5jaGFyQ29kZUF0KGVuZCkgPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdi5zbGljZSgwLCBlbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSB2O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcImhyZWZcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBocmVmID0gdGhpcy5faHJlZjtcbiAgICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgICAgICBocmVmID0gdGhpcy5faHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhyZWY7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5faHJlZiA9IHY7XG4gICAgfVxufSk7XG5cblVybC5wYXJzZSA9IGZ1bmN0aW9uIFVybCRQYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAoc3RyIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gc3RyO1xuICAgIHZhciByZXQgPSBuZXcgVXJsKCk7XG4gICAgcmV0LnBhcnNlKHN0ciwgISFwYXJzZVF1ZXJ5U3RyaW5nLCAhIWhvc3REZW5vdGVzU2xhc2gpO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwuZm9ybWF0ID0gZnVuY3Rpb24gVXJsJEZvcm1hdChvYmopIHtcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvYmogPSBVcmwucGFyc2Uob2JqKTtcbiAgICB9XG4gICAgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkge1xuICAgICAgICByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufTtcblxuVXJsLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn07XG5cblVybC5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIGlmICghc291cmNlKSByZXR1cm4gcmVsYXRpdmU7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlT2JqZWN0KHJlbGF0aXZlKTtcbn07XG5cbmZ1bmN0aW9uIF9lc2NhcGVQYXRoKHBhdGhuYW1lKSB7XG4gICAgcmV0dXJuIHBhdGhuYW1lLnJlcGxhY2UoL1s/I10vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgcmV0dXJuIHNlYXJjaC5yZXBsYWNlKC8jL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG4vL1NlYXJjaCBgY2hhcjFgIChpbnRlZ2VyIGNvZGUgZm9yIGEgY2hhcmFjdGVyKSBpbiBgc3RyaW5nYFxuLy9zdGFydGluZyBmcm9tIGBmcm9tSW5kZXhgIGFuZCBlbmRpbmcgYXQgYHN0cmluZy5sZW5ndGggLSAxYFxuLy9vciB3aGVuIGEgc3RvcCBjaGFyYWN0ZXIgaXMgZm91bmRcbmZ1bmN0aW9uIGNvbnRhaW5zQ2hhcmFjdGVyKHN0cmluZywgY2hhcjEsIGZyb21JbmRleCwgc3RvcENoYXJhY3RlclRhYmxlKSB7XG4gICAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IGZyb21JbmRleDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gY2hhcjEpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHN0b3BDaGFyYWN0ZXJUYWJsZVtjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vU2VlIGlmIGBjaGFyMWAgb3IgYGNoYXIyYCAoaW50ZWdlciBjb2RlcyBmb3IgY2hhcmFjdGVycylcbi8vaXMgY29udGFpbmVkIGluIGBzdHJpbmdgXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcjIoc3RyaW5nLCBjaGFyMSwgY2hhcjIpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IGNoYXIxIHx8IGNoID09PSBjaGFyMikgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy9NYWtlcyBhbiBhcnJheSBvZiAxMjggdWludDgncyB3aGljaCByZXByZXNlbnQgYm9vbGVhbiB2YWx1ZXMuXG4vL1NwZWMgaXMgYW4gYXJyYXkgb2YgYXNjaWkgY29kZSBwb2ludHMgb3IgYXNjaWkgY29kZSBwb2ludCByYW5nZXNcbi8vcmFuZ2VzIGFyZSBleHByZXNzZWQgYXMgW3N0YXJ0LCBlbmRdXG5cbi8vQ3JlYXRlIGEgdGFibGUgd2l0aCB0aGUgY2hhcmFjdGVycyAweDMwLTB4MzkgKGRlY2ltYWxzICcwJyAtICc5JykgYW5kXG4vLzB4N0EgKGxvd2VyY2FzZWxldHRlciAneicpIGFzIGB0cnVlYDpcbi8vXG4vL3ZhciBhID0gbWFrZUFzY2lpVGFibGUoW1sweDMwLCAweDM5XSwgMHg3QV0pO1xuLy9hWzB4MzBdOyAvLzFcbi8vYVsweDE1XTsgLy8wXG4vL2FbMHgzNV07IC8vMVxuZnVuY3Rpb24gbWFrZUFzY2lpVGFibGUoc3BlYykge1xuICAgIHZhciByZXQgPSBuZXcgVWludDhBcnJheSgxMjgpO1xuICAgIHNwZWMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICByZXRbaXRlbV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gaXRlbVswXTtcbiAgICAgICAgICAgIHZhciBlbmQgPSBpdGVtWzFdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0OyBqIDw9IGVuZDsgKytqKSB7XG4gICAgICAgICAgICAgICAgcmV0W2pdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJldDtcbn1cblxuXG52YXIgYXV0b0VzY2FwZSA9IFtcIjxcIiwgXCI+XCIsIFwiXFxcIlwiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsIFwiXFxuXCIsXG4gICAgXCJcXHRcIiwgXCJ7XCIsIFwifVwiLCBcInxcIiwgXCJcXFxcXCIsIFwiXlwiLCBcImBcIiwgXCInXCJdO1xuXG52YXIgYXV0b0VzY2FwZU1hcCA9IG5ldyBBcnJheSgxMjgpO1xuXG5cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGVNYXAubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBhdXRvRXNjYXBlTWFwW2ldID0gXCJcIjtcbn1cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgYyA9IGF1dG9Fc2NhcGVbaV07XG4gICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChjKTtcbiAgICBpZiAoZXNjID09PSBjKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShjKTtcbiAgICB9XG4gICAgYXV0b0VzY2FwZU1hcFtjLmNoYXJDb2RlQXQoMCldID0gZXNjO1xufVxuXG5cbnZhciBzbGFzaFByb3RvY29scyA9IFVybC5wcm90b3R5cGUuX3NsYXNoUHJvdG9jb2xzID0ge1xuICAgIGh0dHA6IHRydWUsXG4gICAgaHR0cHM6IHRydWUsXG4gICAgZ29waGVyOiB0cnVlLFxuICAgIGZpbGU6IHRydWUsXG4gICAgZnRwOiB0cnVlLFxuXG4gICAgXCJodHRwOlwiOiB0cnVlLFxuICAgIFwiaHR0cHM6XCI6IHRydWUsXG4gICAgXCJnb3BoZXI6XCI6IHRydWUsXG4gICAgXCJmaWxlOlwiOiB0cnVlLFxuICAgIFwiZnRwOlwiOiB0cnVlXG59O1xuXG4vL09wdGltaXplIGJhY2sgZnJvbSBub3JtYWxpemVkIG9iamVjdCBjYXVzZWQgYnkgbm9uLWlkZW50aWZpZXIga2V5c1xuZnVuY3Rpb24gZigpe31cbmYucHJvdG90eXBlID0gc2xhc2hQcm90b2NvbHM7XG5cblVybC5wcm90b3R5cGUuX3Byb3RvY29sQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICBbMHg2MSAvKidhJyovLCAweDdBIC8qJ3onKi9dLFxuICAgIFsweDQxIC8qJ0EnKi8sIDB4NUEgLyonWicqL10sXG4gICAgMHgyRSAvKicuJyovLCAweDJCIC8qJysnKi8sIDB4MkQgLyonLScqL1xuXSk7XG5cblVybC5wcm90b3R5cGUuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoW1xuICAgIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovLCAweDJGIC8qJy8nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIGF1dG9Fc2NhcGUubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgcmV0dXJuIHYuY2hhckNvZGVBdCgwKTtcbiAgICB9KVxuKTtcblxuLy9JZiB0aGVzZSBjaGFyYWN0ZXJzIGVuZCBhIGhvc3QgbmFtZSwgdGhlIHBhdGggd2lsbCBub3QgYmUgcHJlcGVuZGVkIGEgL1xuVXJsLnByb3RvdHlwZS5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzID0gbWFrZUFzY2lpVGFibGUoXG4gICAgW1xuICAgICAgICBcIjxcIiwgXCI+XCIsIFwiJ1wiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsXG4gICAgICAgIFwiXFxuXCIsIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLFxuICAgICAgICBcIl5cIiwgXCJgXCIsIFwiXFxcIlwiLCBcIiVcIiwgXCI7XCJcbiAgICBdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cblVybC5wcm90b3R5cGUuX2F1dG9Fc2NhcGVNYXAgPSBhdXRvRXNjYXBlTWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVybDtcblxuVXJsLnJlcGxhY2UgPSBmdW5jdGlvbiBVcmwkUmVwbGFjZSgpIHtcbiAgICByZXF1aXJlLmNhY2hlW1widXJsXCJdID0ge1xuICAgICAgICBleHBvcnRzOiBVcmxcbiAgICB9O1xufTtcbiIsInZhciBub3cgPSByZXF1aXJlKCdwZXJmb3JtYW5jZS1ub3cnKVxuICAsIGdsb2JhbCA9IHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8ge30gOiB3aW5kb3dcbiAgLCB2ZW5kb3JzID0gWydtb3onLCAnd2Via2l0J11cbiAgLCBzdWZmaXggPSAnQW5pbWF0aW9uRnJhbWUnXG4gICwgcmFmID0gZ2xvYmFsWydyZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBjYWYgPSBnbG9iYWxbJ2NhbmNlbCcgKyBzdWZmaXhdIHx8IGdsb2JhbFsnY2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgaXNOYXRpdmUgPSB0cnVlXG5cbmZvcih2YXIgaSA9IDA7IGkgPCB2ZW5kb3JzLmxlbmd0aCAmJiAhcmFmOyBpKyspIHtcbiAgcmFmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnUmVxdWVzdCcgKyBzdWZmaXhdXG4gIGNhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbCcgKyBzdWZmaXhdXG4gICAgICB8fCBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cbn1cblxuLy8gU29tZSB2ZXJzaW9ucyBvZiBGRiBoYXZlIHJBRiBidXQgbm90IGNBRlxuaWYoIXJhZiB8fCAhY2FmKSB7XG4gIGlzTmF0aXZlID0gZmFsc2VcblxuICB2YXIgbGFzdCA9IDBcbiAgICAsIGlkID0gMFxuICAgICwgcXVldWUgPSBbXVxuICAgICwgZnJhbWVEdXJhdGlvbiA9IDEwMDAgLyA2MFxuXG4gIHJhZiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgaWYocXVldWUubGVuZ3RoID09PSAwKSB7XG4gICAgICB2YXIgX25vdyA9IG5vdygpXG4gICAgICAgICwgbmV4dCA9IE1hdGgubWF4KDAsIGZyYW1lRHVyYXRpb24gLSAoX25vdyAtIGxhc3QpKVxuICAgICAgbGFzdCA9IG5leHQgKyBfbm93XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY3AgPSBxdWV1ZS5zbGljZSgwKVxuICAgICAgICAvLyBDbGVhciBxdWV1ZSBoZXJlIHRvIHByZXZlbnRcbiAgICAgICAgLy8gY2FsbGJhY2tzIGZyb20gYXBwZW5kaW5nIGxpc3RlbmVyc1xuICAgICAgICAvLyB0byB0aGUgY3VycmVudCBmcmFtZSdzIHF1ZXVlXG4gICAgICAgIHF1ZXVlLmxlbmd0aCA9IDBcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGNwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYoIWNwW2ldLmNhbmNlbGxlZCkge1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICBjcFtpXS5jYWxsYmFjayhsYXN0KVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sIE1hdGgucm91bmQobmV4dCkpXG4gICAgfVxuICAgIHF1ZXVlLnB1c2goe1xuICAgICAgaGFuZGxlOiArK2lkLFxuICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxuICAgICAgY2FuY2VsbGVkOiBmYWxzZVxuICAgIH0pXG4gICAgcmV0dXJuIGlkXG4gIH1cblxuICBjYWYgPSBmdW5jdGlvbihoYW5kbGUpIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmKHF1ZXVlW2ldLmhhbmRsZSA9PT0gaGFuZGxlKSB7XG4gICAgICAgIHF1ZXVlW2ldLmNhbmNlbGxlZCA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihmbikge1xuICAvLyBXcmFwIGluIGEgbmV3IGZ1bmN0aW9uIHRvIHByZXZlbnRcbiAgLy8gYGNhbmNlbGAgcG90ZW50aWFsbHkgYmVpbmcgYXNzaWduZWRcbiAgLy8gdG8gdGhlIG5hdGl2ZSByQUYgZnVuY3Rpb25cbiAgaWYoIWlzTmF0aXZlKSB7XG4gICAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZm4pXG4gIH1cbiAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZnVuY3Rpb24oKSB7XG4gICAgdHJ5e1xuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgIH1cbiAgfSlcbn1cbm1vZHVsZS5leHBvcnRzLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICBjYWYuYXBwbHkoZ2xvYmFsLCBhcmd1bWVudHMpXG59XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuLy8gR2VuZXJhdGVkIGJ5IENvZmZlZVNjcmlwdCAxLjYuM1xuKGZ1bmN0aW9uKCkge1xuICB2YXIgZ2V0TmFub1NlY29uZHMsIGhydGltZSwgbG9hZFRpbWU7XG5cbiAgaWYgKCh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcGVyZm9ybWFuY2UgIT09IG51bGwpICYmIHBlcmZvcm1hbmNlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgfTtcbiAgfSBlbHNlIGlmICgodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2VzcyAhPT0gbnVsbCkgJiYgcHJvY2Vzcy5ocnRpbWUpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIChnZXROYW5vU2Vjb25kcygpIC0gbG9hZFRpbWUpIC8gMWU2O1xuICAgIH07XG4gICAgaHJ0aW1lID0gcHJvY2Vzcy5ocnRpbWU7XG4gICAgZ2V0TmFub1NlY29uZHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBocjtcbiAgICAgIGhyID0gaHJ0aW1lKCk7XG4gICAgICByZXR1cm4gaHJbMF0gKiAxZTkgKyBoclsxXTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gZ2V0TmFub1NlY29uZHMoKTtcbiAgfSBlbHNlIGlmIChEYXRlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gRGF0ZS5ub3coKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxufSkuY2FsbCh0aGlzKTtcblxuLypcbi8vQCBzb3VyY2VNYXBwaW5nVVJMPXBlcmZvcm1hbmNlLW5vdy5tYXBcbiovXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiKSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5yb3V0ZXM9ZSgpfX0oZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbnZhciBsb2NhbFJvdXRlcyA9IFtdO1xuXG5cbi8qKlxuICogQ29udmVydCBwYXRoIHRvIHJvdXRlIG9iamVjdFxuICpcbiAqIEEgc3RyaW5nIG9yIFJlZ0V4cCBzaG91bGQgYmUgcGFzc2VkLFxuICogd2lsbCByZXR1cm4geyByZSwgc3JjLCBrZXlzfSBvYmpcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmcgLyBSZWdFeHB9IHBhdGhcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG52YXIgUm91dGUgPSBmdW5jdGlvbihwYXRoKXtcbiAgLy91c2luZyAnbmV3JyBpcyBvcHRpb25hbFxuXG4gIHZhciBzcmMsIHJlLCBrZXlzID0gW107XG5cbiAgaWYocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCl7XG4gICAgcmUgPSBwYXRoO1xuICAgIHNyYyA9IHBhdGgudG9TdHJpbmcoKTtcbiAgfWVsc2V7XG4gICAgcmUgPSBwYXRoVG9SZWdFeHAocGF0aCwga2V5cyk7XG4gICAgc3JjID0gcGF0aDtcbiAgfVxuXG4gIHJldHVybiB7XG4gIFx0IHJlOiByZSxcbiAgXHQgc3JjOiBwYXRoLnRvU3RyaW5nKCksXG4gIFx0IGtleXM6IGtleXNcbiAgfVxufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLFxuICogcmV0dXJuaW5nIGEgcmVndWxhciBleHByZXNzaW9uLlxuICpcbiAqIEFuIGVtcHR5IGFycmF5IHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aGljaCB3aWxsIGNvbnRhaW4gdGhlIHBsYWNlaG9sZGVyXG4gKiBrZXkgbmFtZXMuIEZvciBleGFtcGxlIFwiL3VzZXIvOmlkXCIgd2lsbFxuICogdGhlbiBjb250YWluIFtcImlkXCJdLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9IGtleXNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xudmFyIHBhdGhUb1JlZ0V4cCA9IGZ1bmN0aW9uIChwYXRoLCBrZXlzKSB7XG5cdHBhdGggPSBwYXRoXG5cdFx0LmNvbmNhdCgnLz8nKVxuXHRcdC5yZXBsYWNlKC9cXC9cXCgvZywgJyg/Oi8nKVxuXHRcdC5yZXBsYWNlKC8oXFwvKT8oXFwuKT86KFxcdyspKD86KFxcKC4qP1xcKSkpPyhcXD8pP3xcXCovZywgZnVuY3Rpb24oXywgc2xhc2gsIGZvcm1hdCwga2V5LCBjYXB0dXJlLCBvcHRpb25hbCl7XG5cdFx0XHRpZiAoXyA9PT0gXCIqXCIpe1xuXHRcdFx0XHRrZXlzLnB1c2godW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIF87XG5cdFx0XHR9XG5cblx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0c2xhc2ggPSBzbGFzaCB8fCAnJztcblx0XHRcdHJldHVybiAnJ1xuXHRcdFx0XHQrIChvcHRpb25hbCA/ICcnIDogc2xhc2gpXG5cdFx0XHRcdCsgJyg/Oidcblx0XHRcdFx0KyAob3B0aW9uYWwgPyBzbGFzaCA6ICcnKVxuXHRcdFx0XHQrIChmb3JtYXQgfHwgJycpICsgKGNhcHR1cmUgfHwgJyhbXi9dKz8pJykgKyAnKSdcblx0XHRcdFx0KyAob3B0aW9uYWwgfHwgJycpO1xuXHRcdH0pXG5cdFx0LnJlcGxhY2UoLyhbXFwvLl0pL2csICdcXFxcJDEnKVxuXHRcdC5yZXBsYWNlKC9cXCovZywgJyguKiknKTtcblx0cmV0dXJuIG5ldyBSZWdFeHAoJ14nICsgcGF0aCArICckJywgJ2knKTtcbn07XG5cbi8qKlxuICogQXR0ZW1wdCB0byBtYXRjaCB0aGUgZ2l2ZW4gcmVxdWVzdCB0b1xuICogb25lIG9mIHRoZSByb3V0ZXMuIFdoZW4gc3VjY2Vzc2Z1bFxuICogYSAge2ZuLCBwYXJhbXMsIHNwbGF0c30gb2JqIGlzIHJldHVybmVkXG4gKlxuICogQHBhcmFtICB7QXJyYXl9IHJvdXRlc1xuICogQHBhcmFtICB7U3RyaW5nfSB1cmlcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xudmFyIG1hdGNoID0gZnVuY3Rpb24gKHJvdXRlcywgdXJpLCBzdGFydEF0KSB7XG5cdHZhciBjYXB0dXJlcywgaSA9IHN0YXJ0QXQgfHwgMDtcblxuXHRmb3IgKHZhciBsZW4gPSByb3V0ZXMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcblx0XHR2YXIgcm91dGUgPSByb3V0ZXNbaV0sXG5cdFx0ICAgIHJlID0gcm91dGUucmUsXG5cdFx0ICAgIGtleXMgPSByb3V0ZS5rZXlzLFxuXHRcdCAgICBzcGxhdHMgPSBbXSxcblx0XHQgICAgcGFyYW1zID0ge307XG5cblx0XHRpZiAoY2FwdHVyZXMgPSB1cmkubWF0Y2gocmUpKSB7XG5cdFx0XHRmb3IgKHZhciBqID0gMSwgbGVuID0gY2FwdHVyZXMubGVuZ3RoOyBqIDwgbGVuOyArK2opIHtcblx0XHRcdFx0dmFyIGtleSA9IGtleXNbai0xXSxcblx0XHRcdFx0XHR2YWwgPSB0eXBlb2YgY2FwdHVyZXNbal0gPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHVuZXNjYXBlKGNhcHR1cmVzW2pdKVxuXHRcdFx0XHRcdFx0OiBjYXB0dXJlc1tqXTtcblx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdHBhcmFtc1trZXldID0gdmFsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNwbGF0cy5wdXNoKHZhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBhcmFtczogcGFyYW1zLFxuXHRcdFx0XHRzcGxhdHM6IHNwbGF0cyxcblx0XHRcdFx0cm91dGU6IHJvdXRlLnNyYyxcblx0XHRcdFx0bmV4dDogaSArIDFcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIERlZmF1bHQgXCJub3JtYWxcIiByb3V0ZXIgY29uc3RydWN0b3IuXG4gKiBhY2NlcHRzIHBhdGgsIGZuIHR1cGxlcyB2aWEgYWRkUm91dGVcbiAqIHJldHVybnMge2ZuLCBwYXJhbXMsIHNwbGF0cywgcm91dGV9XG4gKiAgdmlhIG1hdGNoXG4gKlxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZXIgPSBmdW5jdGlvbigpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG4gIHJldHVybiB7XG4gICAgcm91dGVzOiBbXSxcbiAgICByb3V0ZU1hcCA6IHt9LFxuICAgIGFkZFJvdXRlOiBmdW5jdGlvbihwYXRoLCBmbil7XG4gICAgICBpZiAoIXBhdGgpIHRocm93IG5ldyBFcnJvcignIHJvdXRlIHJlcXVpcmVzIGEgcGF0aCcpO1xuICAgICAgaWYgKCFmbikgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgJyArIHBhdGgudG9TdHJpbmcoKSArICcgcmVxdWlyZXMgYSBjYWxsYmFjaycpO1xuXG4gICAgICB2YXIgcm91dGUgPSBSb3V0ZShwYXRoKTtcbiAgICAgIHJvdXRlLmZuID0gZm47XG5cbiAgICAgIHRoaXMucm91dGVzLnB1c2gocm91dGUpO1xuICAgICAgdGhpcy5yb3V0ZU1hcFtwYXRoXSA9IGZuO1xuICAgIH0sXG5cbiAgICBtYXRjaDogZnVuY3Rpb24ocGF0aG5hbWUsIHN0YXJ0QXQpe1xuICAgICAgdmFyIHJvdXRlID0gbWF0Y2godGhpcy5yb3V0ZXMsIHBhdGhuYW1lLCBzdGFydEF0KTtcbiAgICAgIGlmKHJvdXRlKXtcbiAgICAgICAgcm91dGUuZm4gPSB0aGlzLnJvdXRlTWFwW3JvdXRlLnJvdXRlXTtcbiAgICAgICAgcm91dGUubmV4dCA9IHRoaXMubWF0Y2guYmluZCh0aGlzLCBwYXRobmFtZSwgcm91dGUubmV4dClcbiAgICAgIH1cbiAgICAgIHJldHVybiByb3V0ZTtcbiAgICB9XG4gIH1cbn07XG5cblJvdXRlci5Sb3V0ZSA9IFJvdXRlXG5Sb3V0ZXIucGF0aFRvUmVnRXhwID0gcGF0aFRvUmVnRXhwXG5Sb3V0ZXIubWF0Y2ggPSBtYXRjaFxuLy8gYmFjayBjb21wYXRcblJvdXRlci5Sb3V0ZXIgPSBSb3V0ZXJcblxubW9kdWxlLmV4cG9ydHMgPSBSb3V0ZXJcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciB3aW5kb3cgPSByZXF1aXJlKFwiZ2xvYmFsL3dpbmRvd1wiKVxudmFyIG9uY2UgPSByZXF1aXJlKFwib25jZVwiKVxudmFyIHBhcnNlSGVhZGVycyA9IHJlcXVpcmUoJ3BhcnNlLWhlYWRlcnMnKVxuXG52YXIgbWVzc2FnZXMgPSB7XG4gICAgXCIwXCI6IFwiSW50ZXJuYWwgWE1MSHR0cFJlcXVlc3QgRXJyb3JcIixcbiAgICBcIjRcIjogXCI0eHggQ2xpZW50IEVycm9yXCIsXG4gICAgXCI1XCI6IFwiNXh4IFNlcnZlciBFcnJvclwiXG59XG5cbnZhciBYSFIgPSB3aW5kb3cuWE1MSHR0cFJlcXVlc3QgfHwgbm9vcFxudmFyIFhEUiA9IFwid2l0aENyZWRlbnRpYWxzXCIgaW4gKG5ldyBYSFIoKSkgPyBYSFIgOiB3aW5kb3cuWERvbWFpblJlcXVlc3RcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVYSFJcblxuZnVuY3Rpb24gY3JlYXRlWEhSKG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7IHVyaTogb3B0aW9ucyB9XG4gICAgfVxuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICBjYWxsYmFjayA9IG9uY2UoY2FsbGJhY2spXG5cbiAgICB2YXIgeGhyID0gb3B0aW9ucy54aHIgfHwgbnVsbFxuXG4gICAgaWYgKCF4aHIpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuY29ycyB8fCBvcHRpb25zLnVzZVhEUikge1xuICAgICAgICAgICAgeGhyID0gbmV3IFhEUigpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgeGhyID0gbmV3IFhIUigpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdXJpID0geGhyLnVybCA9IG9wdGlvbnMudXJpIHx8IG9wdGlvbnMudXJsXG4gICAgdmFyIG1ldGhvZCA9IHhoci5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCBcIkdFVFwiXG4gICAgdmFyIGJvZHkgPSBvcHRpb25zLmJvZHkgfHwgb3B0aW9ucy5kYXRhXG4gICAgdmFyIGhlYWRlcnMgPSB4aHIuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fVxuICAgIHZhciBzeW5jID0gISFvcHRpb25zLnN5bmNcbiAgICB2YXIgaXNKc29uID0gZmFsc2VcbiAgICB2YXIga2V5XG4gICAgdmFyIGxvYWQgPSBvcHRpb25zLnJlc3BvbnNlID8gbG9hZFJlc3BvbnNlIDogbG9hZFhoclxuXG4gICAgaWYgKFwianNvblwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaXNKc29uID0gdHJ1ZVxuICAgICAgICBoZWFkZXJzW1wiQWNjZXB0XCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgaWYgKG1ldGhvZCAhPT0gXCJHRVRcIiAmJiBtZXRob2QgIT09IFwiSEVBRFwiKSB7XG4gICAgICAgICAgICBoZWFkZXJzW1wiQ29udGVudC1UeXBlXCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgICAgIGJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gcmVhZHlzdGF0ZWNoYW5nZVxuICAgIHhoci5vbmxvYWQgPSBsb2FkXG4gICAgeGhyLm9uZXJyb3IgPSBlcnJvclxuICAgIC8vIElFOSBtdXN0IGhhdmUgb25wcm9ncmVzcyBiZSBzZXQgdG8gYSB1bmlxdWUgZnVuY3Rpb24uXG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElFIG11c3QgZGllXG4gICAgfVxuICAgIC8vIGhhdGUgSUVcbiAgICB4aHIub250aW1lb3V0ID0gbm9vcFxuICAgIHhoci5vcGVuKG1ldGhvZCwgdXJpLCAhc3luYylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIGlmIChvcHRpb25zLndpdGhDcmVkZW50aWFscyB8fCAob3B0aW9ucy5jb3JzICYmIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzICE9PSBmYWxzZSkpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG5cbiAgICAvLyBDYW5ub3Qgc2V0IHRpbWVvdXQgd2l0aCBzeW5jIHJlcXVlc3RcbiAgICBpZiAoIXN5bmMpIHtcbiAgICAgICAgeGhyLnRpbWVvdXQgPSBcInRpbWVvdXRcIiBpbiBvcHRpb25zID8gb3B0aW9ucy50aW1lb3V0IDogNTAwMFxuICAgIH1cblxuICAgIGlmICh4aHIuc2V0UmVxdWVzdEhlYWRlcikge1xuICAgICAgICBmb3Ioa2V5IGluIGhlYWRlcnMpe1xuICAgICAgICAgICAgaWYoaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkhlYWRlcnMgY2Fubm90IGJlIHNldCBvbiBhbiBYRG9tYWluUmVxdWVzdCBvYmplY3RcIilcbiAgICB9XG5cbiAgICBpZiAoXCJyZXNwb25zZVR5cGVcIiBpbiBvcHRpb25zKSB7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSBvcHRpb25zLnJlc3BvbnNlVHlwZVxuICAgIH1cbiAgICBcbiAgICBpZiAoXCJiZWZvcmVTZW5kXCIgaW4gb3B0aW9ucyAmJiBcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuYmVmb3JlU2VuZCA9PT0gXCJmdW5jdGlvblwiXG4gICAgKSB7XG4gICAgICAgIG9wdGlvbnMuYmVmb3JlU2VuZCh4aHIpXG4gICAgfVxuXG4gICAgeGhyLnNlbmQoYm9keSlcblxuICAgIHJldHVybiB4aHJcblxuICAgIGZ1bmN0aW9uIHJlYWR5c3RhdGVjaGFuZ2UoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgbG9hZCgpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRCb2R5KCkge1xuICAgICAgICAvLyBDaHJvbWUgd2l0aCByZXF1ZXN0VHlwZT1ibG9iIHRocm93cyBlcnJvcnMgYXJyb3VuZCB3aGVuIGV2ZW4gdGVzdGluZyBhY2Nlc3MgdG8gcmVzcG9uc2VUZXh0XG4gICAgICAgIHZhciBib2R5ID0gbnVsbFxuXG4gICAgICAgIGlmICh4aHIucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIGlmICh4aHIucmVzcG9uc2VUeXBlID09PSAndGV4dCcgfHwgIXhoci5yZXNwb25zZVR5cGUpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VUZXh0IHx8IHhoci5yZXNwb25zZVhNTFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzSnNvbikge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBib2R5ID0gSlNPTi5wYXJzZShib2R5KVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBib2R5XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U3RhdHVzQ29kZSgpIHtcbiAgICAgICAgcmV0dXJuIHhoci5zdGF0dXMgPT09IDEyMjMgPyAyMDQgOiB4aHIuc3RhdHVzXG4gICAgfVxuXG4gICAgLy8gaWYgd2UncmUgZ2V0dGluZyBhIG5vbmUtb2sgc3RhdHVzQ29kZSwgYnVpbGQgJiByZXR1cm4gYW4gZXJyb3JcbiAgICBmdW5jdGlvbiBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cykge1xuICAgICAgICB2YXIgZXJyb3IgPSBudWxsXG4gICAgICAgIGlmIChzdGF0dXMgPT09IDAgfHwgKHN0YXR1cyA+PSA0MDAgJiYgc3RhdHVzIDwgNjAwKSkge1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSAodHlwZW9mIGJvZHkgPT09IFwic3RyaW5nXCIgPyBib2R5IDogZmFsc2UpIHx8XG4gICAgICAgICAgICAgICAgbWVzc2FnZXNbU3RyaW5nKHN0YXR1cykuY2hhckF0KDApXVxuICAgICAgICAgICAgZXJyb3IgPSBuZXcgRXJyb3IobWVzc2FnZSlcbiAgICAgICAgICAgIGVycm9yLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlcnJvclxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSAmIHByb2Nlc3MgdGhlIHJlc3BvbnNlIGluIGEgc3BlY2lhbCByZXNwb25zZSBvYmplY3RcbiAgICBmdW5jdGlvbiBsb2FkUmVzcG9uc2UoKSB7XG4gICAgICAgIHZhciBzdGF0dXMgPSBnZXRTdGF0dXNDb2RlKClcbiAgICAgICAgdmFyIGVycm9yID0gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpXG4gICAgICAgIHZhciByZXNwb25zZSA9IHtcbiAgICAgICAgICAgIGJvZHk6IGdldEJvZHkoKSxcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IHN0YXR1cyxcbiAgICAgICAgICAgIHN0YXR1c1RleHQ6IHhoci5zdGF0dXNUZXh0LFxuICAgICAgICAgICAgcmF3OiB4aHJcbiAgICAgICAgfVxuICAgICAgICBpZih4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKXsgLy9yZW1lbWJlciB4aHIgY2FuIGluIGZhY3QgYmUgWERSIGZvciBDT1JTIGluIElFXG4gICAgICAgICAgICByZXNwb25zZS5oZWFkZXJzID0gcGFyc2VIZWFkZXJzKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIHJlc3BvbnNlLCByZXNwb25zZS5ib2R5KVxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSBhbmQgYWRkIHNvbWUgcmVzcG9uc2UgcHJvcGVydGllcyB0byB0aGUgc291cmNlIHhoclxuICAgIC8vIGFuZCB0aGVuIHJlc3BvbmQgd2l0aCB0aGF0XG4gICAgZnVuY3Rpb24gbG9hZFhocigpIHtcbiAgICAgICAgdmFyIHN0YXR1cyA9IGdldFN0YXR1c0NvZGUoKVxuICAgICAgICB2YXIgZXJyb3IgPSBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cylcblxuICAgICAgICB4aHIuc3RhdHVzID0geGhyLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgeGhyLmJvZHkgPSBnZXRCb2R5KClcbiAgICAgICAgeGhyLmhlYWRlcnMgPSBwYXJzZUhlYWRlcnMoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKVxuXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCB4aHIsIHhoci5ib2R5KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKGV2dCkge1xuICAgICAgICBjYWxsYmFjayhldnQsIHhocilcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHNlbGY7XG59IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0ge307XG59XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwibW9kdWxlLmV4cG9ydHMgPSBvbmNlXG5cbm9uY2UucHJvdG8gPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bmN0aW9uLnByb3RvdHlwZSwgJ29uY2UnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBvbmNlKHRoaXMpXG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWVcbiAgfSlcbn0pXG5cbmZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gIHZhciBjYWxsZWQgPSBmYWxzZVxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGlmIChjYWxsZWQpIHJldHVyblxuICAgIGNhbGxlZCA9IHRydWVcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICB9XG59XG4iLCJ2YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2lzLWZ1bmN0aW9uJylcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHlcblxuZnVuY3Rpb24gZm9yRWFjaChsaXN0LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXNGdW5jdGlvbihpdGVyYXRvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignaXRlcmF0b3IgbXVzdCBiZSBhIGZ1bmN0aW9uJylcbiAgICB9XG5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgY29udGV4dCA9IHRoaXNcbiAgICB9XG4gICAgXG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobGlzdCkgPT09ICdbb2JqZWN0IEFycmF5XScpXG4gICAgICAgIGZvckVhY2hBcnJheShsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlIGlmICh0eXBlb2YgbGlzdCA9PT0gJ3N0cmluZycpXG4gICAgICAgIGZvckVhY2hTdHJpbmcobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG4gICAgZWxzZVxuICAgICAgICBmb3JFYWNoT2JqZWN0KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoQXJyYXkoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5LCBpKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVtpXSwgaSwgYXJyYXkpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2hTdHJpbmcoc3RyaW5nLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgLy8gbm8gc3VjaCB0aGluZyBhcyBhIHNwYXJzZSBzdHJpbmcuXG4gICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgc3RyaW5nLmNoYXJBdChpKSwgaSwgc3RyaW5nKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaE9iamVjdChvYmplY3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgayBpbiBvYmplY3QpIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmplY3Rba10sIGssIG9iamVjdClcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gaXNGdW5jdGlvblxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24gKGZuKSB7XG4gIHZhciBzdHJpbmcgPSB0b1N0cmluZy5jYWxsKGZuKVxuICByZXR1cm4gc3RyaW5nID09PSAnW29iamVjdCBGdW5jdGlvbl0nIHx8XG4gICAgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJyAmJiBzdHJpbmcgIT09ICdbb2JqZWN0IFJlZ0V4cF0nKSB8fFxuICAgICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAvLyBJRTggYW5kIGJlbG93XG4gICAgIChmbiA9PT0gd2luZG93LnNldFRpbWVvdXQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuYWxlcnQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuY29uZmlybSB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5wcm9tcHQpKVxufTtcbiIsIlxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gdHJpbTtcblxuZnVuY3Rpb24gdHJpbShzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqfFxccyokL2csICcnKTtcbn1cblxuZXhwb3J0cy5sZWZ0ID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzKi8sICcnKTtcbn07XG5cbmV4cG9ydHMucmlnaHQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccyokLywgJycpO1xufTtcbiIsInZhciB0cmltID0gcmVxdWlyZSgndHJpbScpXG4gICwgZm9yRWFjaCA9IHJlcXVpcmUoJ2Zvci1lYWNoJylcbiAgLCBpc0FycmF5ID0gZnVuY3Rpb24oYXJnKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFyZykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChoZWFkZXJzKSB7XG4gIGlmICghaGVhZGVycylcbiAgICByZXR1cm4ge31cblxuICB2YXIgcmVzdWx0ID0ge31cblxuICBmb3JFYWNoKFxuICAgICAgdHJpbShoZWFkZXJzKS5zcGxpdCgnXFxuJylcbiAgICAsIGZ1bmN0aW9uIChyb3cpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gcm93LmluZGV4T2YoJzonKVxuICAgICAgICAgICwga2V5ID0gdHJpbShyb3cuc2xpY2UoMCwgaW5kZXgpKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgLCB2YWx1ZSA9IHRyaW0ocm93LnNsaWNlKGluZGV4ICsgMSkpXG5cbiAgICAgICAgaWYgKHR5cGVvZihyZXN1bHRba2V5XSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSB2YWx1ZVxuICAgICAgICB9IGVsc2UgaWYgKGlzQXJyYXkocmVzdWx0W2tleV0pKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IFsgcmVzdWx0W2tleV0sIHZhbHVlIF1cbiAgICAgICAgfVxuICAgICAgfVxuICApXG5cbiAgcmV0dXJuIHJlc3VsdFxufSJdfQ==
