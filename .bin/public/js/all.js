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
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#using-the-taunus-api\">Using the Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">npm install taunus taunus-express express --save\n</code></pre>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n<li><code>routes</code> should be an array of view routes</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;there is no layout, just render the partials&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return model.partial;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  layout: require(&#39;./layout&#39;),\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that later, but it defaults to <code>{}</code>)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">touch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install jadum -g\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Taunus is now operational. All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">touch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template! The <code>!=</code> syntax means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>There&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install taunus -g\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<p>The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>....</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>....</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-api\">Using the Taunus API</h4>\n<p>....</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p>....</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Creating a layout](#creating-a-layout)\n      - [Your first route](#your-first-route)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Using the Taunus API](#using-the-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    npm install taunus taunus-express express --save\n    ```\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n    - `routes` should be an array of view routes\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"there is no layout, just render the partials\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return model.partial;\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      layout: require('./layout'),\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that later, but it defaults to `{}`)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install jadum -g\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Taunus is now operational. All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template! The `!=` syntax means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    There's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install taunus -g\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    ....\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    ....\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus API\n\n    ....\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    ....\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n");
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
'use strict';

var unescape = require('./unescape');
var state = require('./state');
var router = require('./router');
var activator = require('./activator');
var caching = require('./caching');
var fetcher = require('./fetcher');
var w = window;
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

  function boot (model) {
    if (booted) {
      return;
    }
    if (!model || typeof model !== 'object') {
      throw new Error('Taunus model must be an object!');
    }
    booted = true;
    if (o.bootstrap !== 'auto') { // autoboot uses fetcher, which would've persisted
      caching.persist(route, state.container, model);
    }
    activator.start(model);
  }
}

module.exports = mount;

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
    controller(model, route);
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
      var args = atoa(arguments);
      var type = args.shift();
      var et = evt[type];
      if (type === 'error' && opts.throws !== false && !et) { throw args.length === 1 ? args[0] : args; }
      if (!et) { return thing; }
      evt[type] = et.filter(function emitter (listen) {
        if (opts.async) { debounce(listen, args, thing); } else { listen.apply(thing, args); }
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

    var uri = xhr.url = options.uri || options.url;
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var key

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
        throw new Error("Headers cannot be set on an XDomainRequest object");
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

    function load() {
        var error = null
        var status = xhr.statusCode = xhr.status
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = null

        if (xhr.response) {
            body = xhr.body = xhr.response
        } else if (xhr.responseType === 'text' || !xhr.responseType) {
            body = xhr.body = xhr.responseText || xhr.responseXML
        }

        if (status === 1223) {
            status = 204
        }

        if (status === 0 || (status >= 400 && status < 600)) {
            var message = (typeof body === "string" ? body : false) ||
                messages[String(status).charAt(0)]
            error = new Error(message)
            error.statusCode = status
        }
        
        xhr.status = xhr.statusCode = status;

        if (isJson) {
            try {
                body = xhr.body = JSON.parse(body)
            } catch (e) {}
        }

        callback(error, xhr, body)
    }

    function error(evt) {
        callback(evt, xhr)
    }
}


function noop() {}

},{"global/window":41,"once":42}],41:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window
} else if (typeof global !== "undefined") {
    module.exports = global
} else {
    module.exports = {}
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

},{}]},{},[11])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9lcnJvci9ub3QtZm91bmQuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvbGF5b3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3dpcmluZy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vY2xpZW50L2pzL21haW4uanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9qYWR1bS9ub2RlX21vZHVsZXMvamFkZS9ydW50aW1lLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2FjdGl2YXRvci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2NhY2hlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGluZy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2VtaXR0ZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9ldmVudHMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9mZXRjaGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaG9va3MuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2ludGVyY2VwdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaXNOYXRpdmUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9saW5rcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL21vdW50LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvb25jZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3BhcnRpYWwuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9yb3V0ZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdGF0ZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0b3Jlcy9pZGIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdG9yZXMvcmF3LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvdW5lc2NhcGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci94aHIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL2NvbnRyYS5lbWl0dGVyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9zcmMvY29udHJhLmVtaXR0ZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL2Zhc3QtdXJsLXBhcnNlci9zcmMvdXJscGFyc2VyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3JhZi9ub2RlX21vZHVsZXMvcGVyZm9ybWFuY2Utbm93L2xpYi9wZXJmb3JtYW5jZS1ub3cuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3JvdXRlcy9kaXN0L3JvdXRlcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL2dsb2JhbC93aW5kb3cuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvb25jZS9vbmNlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3ZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk5BO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyohIGh0dHA6Ly9tdGhzLmJlL3B1bnljb2RlIHYxLjIuNCBieSBAbWF0aGlhcyAqL1xuOyhmdW5jdGlvbihyb290KSB7XG5cblx0LyoqIERldGVjdCBmcmVlIHZhcmlhYmxlcyAqL1xuXHR2YXIgZnJlZUV4cG9ydHMgPSB0eXBlb2YgZXhwb3J0cyA9PSAnb2JqZWN0JyAmJiBleHBvcnRzO1xuXHR2YXIgZnJlZU1vZHVsZSA9IHR5cGVvZiBtb2R1bGUgPT0gJ29iamVjdCcgJiYgbW9kdWxlICYmXG5cdFx0bW9kdWxlLmV4cG9ydHMgPT0gZnJlZUV4cG9ydHMgJiYgbW9kdWxlO1xuXHR2YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsO1xuXHRpZiAoZnJlZUdsb2JhbC5nbG9iYWwgPT09IGZyZWVHbG9iYWwgfHwgZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwpIHtcblx0XHRyb290ID0gZnJlZUdsb2JhbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYHB1bnljb2RlYCBvYmplY3QuXG5cdCAqIEBuYW1lIHB1bnljb2RlXG5cdCAqIEB0eXBlIE9iamVjdFxuXHQgKi9cblx0dmFyIHB1bnljb2RlLFxuXG5cdC8qKiBIaWdoZXN0IHBvc2l0aXZlIHNpZ25lZCAzMi1iaXQgZmxvYXQgdmFsdWUgKi9cblx0bWF4SW50ID0gMjE0NzQ4MzY0NywgLy8gYWthLiAweDdGRkZGRkZGIG9yIDJeMzEtMVxuXG5cdC8qKiBCb290c3RyaW5nIHBhcmFtZXRlcnMgKi9cblx0YmFzZSA9IDM2LFxuXHR0TWluID0gMSxcblx0dE1heCA9IDI2LFxuXHRza2V3ID0gMzgsXG5cdGRhbXAgPSA3MDAsXG5cdGluaXRpYWxCaWFzID0gNzIsXG5cdGluaXRpYWxOID0gMTI4LCAvLyAweDgwXG5cdGRlbGltaXRlciA9ICctJywgLy8gJ1xceDJEJ1xuXG5cdC8qKiBSZWd1bGFyIGV4cHJlc3Npb25zICovXG5cdHJlZ2V4UHVueWNvZGUgPSAvXnhuLS0vLFxuXHRyZWdleE5vbkFTQ0lJID0gL1teIC1+XS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9cXHgyRXxcXHUzMDAyfFxcdUZGMEV8XFx1RkY2MS9nLCAvLyBSRkMgMzQ5MCBzZXBhcmF0b3JzXG5cblx0LyoqIEVycm9yIG1lc3NhZ2VzICovXG5cdGVycm9ycyA9IHtcblx0XHQnb3ZlcmZsb3cnOiAnT3ZlcmZsb3c6IGlucHV0IG5lZWRzIHdpZGVyIGludGVnZXJzIHRvIHByb2Nlc3MnLFxuXHRcdCdub3QtYmFzaWMnOiAnSWxsZWdhbCBpbnB1dCA+PSAweDgwIChub3QgYSBiYXNpYyBjb2RlIHBvaW50KScsXG5cdFx0J2ludmFsaWQtaW5wdXQnOiAnSW52YWxpZCBpbnB1dCdcblx0fSxcblxuXHQvKiogQ29udmVuaWVuY2Ugc2hvcnRjdXRzICovXG5cdGJhc2VNaW51c1RNaW4gPSBiYXNlIC0gdE1pbixcblx0Zmxvb3IgPSBNYXRoLmZsb29yLFxuXHRzdHJpbmdGcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLFxuXG5cdC8qKiBUZW1wb3JhcnkgdmFyaWFibGUgKi9cblx0a2V5O1xuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgZXJyb3IgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIGVycm9yIHR5cGUuXG5cdCAqIEByZXR1cm5zIHtFcnJvcn0gVGhyb3dzIGEgYFJhbmdlRXJyb3JgIHdpdGggdGhlIGFwcGxpY2FibGUgZXJyb3IgbWVzc2FnZS5cblx0ICovXG5cdGZ1bmN0aW9uIGVycm9yKHR5cGUpIHtcblx0XHR0aHJvdyBSYW5nZUVycm9yKGVycm9yc1t0eXBlXSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGBBcnJheSNtYXBgIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeSBhcnJheVxuXHQgKiBpdGVtLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IGFycmF5IG9mIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXAoYXJyYXksIGZuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR3aGlsZSAobGVuZ3RoLS0pIHtcblx0XHRcdGFycmF5W2xlbmd0aF0gPSBmbihhcnJheVtsZW5ndGhdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5O1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncy5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeVxuXHQgKiBjaGFyYWN0ZXIuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgc3RyaW5nIG9mIGNoYXJhY3RlcnMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrXG5cdCAqIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwRG9tYWluKHN0cmluZywgZm4pIHtcblx0XHRyZXR1cm4gbWFwKHN0cmluZy5zcGxpdChyZWdleFNlcGFyYXRvcnMpLCBmbikuam9pbignLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcblx0ICogY2hhcmFjdGVyIGluIHRoZSBzdHJpbmcuIFdoaWxlIEphdmFTY3JpcHQgdXNlcyBVQ1MtMiBpbnRlcm5hbGx5LFxuXHQgKiB0aGlzIGZ1bmN0aW9uIHdpbGwgY29udmVydCBhIHBhaXIgb2Ygc3Vycm9nYXRlIGhhbHZlcyAoZWFjaCBvZiB3aGljaFxuXHQgKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcblx0ICogbWF0Y2hpbmcgVVRGLTE2LlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmVuY29kZWBcblx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZGVjb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmcgVGhlIFVuaWNvZGUgaW5wdXQgc3RyaW5nIChVQ1MtMikuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gVGhlIG5ldyBhcnJheSBvZiBjb2RlIHBvaW50cy5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJkZWNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBjb3VudGVyID0gMCxcblx0XHQgICAgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aCxcblx0XHQgICAgdmFsdWUsXG5cdFx0ICAgIGV4dHJhO1xuXHRcdHdoaWxlIChjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGhpZ2ggc3Vycm9nYXRlLCBhbmQgdGhlcmUgaXMgYSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRleHRyYSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRcdGlmICgoZXh0cmEgJiAweEZDMDApID09IDB4REMwMCkgeyAvLyBsb3cgc3Vycm9nYXRlXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1bm1hdGNoZWQgc3Vycm9nYXRlOyBvbmx5IGFwcGVuZCB0aGlzIGNvZGUgdW5pdCwgaW4gY2FzZSB0aGUgbmV4dFxuXHRcdFx0XHRcdC8vIGNvZGUgdW5pdCBpcyB0aGUgaGlnaCBzdXJyb2dhdGUgb2YgYSBzdXJyb2dhdGUgcGFpclxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRjb3VudGVyLS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3RyaW5nIGJhc2VkIG9uIGFuIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZGVjb2RlYFxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBlbmNvZGVcblx0ICogQHBhcmFtIHtBcnJheX0gY29kZVBvaW50cyBUaGUgYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHJldHVybiBtYXAoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YXIgb3V0cHV0ID0gJyc7XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGJhc2ljIGNvZGUgcG9pbnQgaW50byBhIGRpZ2l0L2ludGVnZXIuXG5cdCAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gY29kZVBvaW50IFRoZSBiYXNpYyBudW1lcmljIGNvZGUgcG9pbnQgdmFsdWUuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGluIHRoZSByYW5nZSBgMGAgdG8gYGJhc2UgLSAxYCwgb3IgYGJhc2VgIGlmXG5cdCAqIHRoZSBjb2RlIHBvaW50IGRvZXMgbm90IHJlcHJlc2VudCBhIHZhbHVlLlxuXHQgKi9cblx0ZnVuY3Rpb24gYmFzaWNUb0RpZ2l0KGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgLSA0OCA8IDEwKSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gMjI7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA2NSA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gNjU7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA5NyA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gOTc7XG5cdFx0fVxuXHRcdHJldHVybiBiYXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGlnaXQvaW50ZWdlciBpbnRvIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHNlZSBgYmFzaWNUb0RpZ2l0KClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBkaWdpdCBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBiYXNpYyBjb2RlIHBvaW50IHdob3NlIHZhbHVlICh3aGVuIHVzZWQgZm9yXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG5cdCAqIGAwYCB0byBgYmFzZSAtIDFgLiBJZiBgZmxhZ2AgaXMgbm9uLXplcm8sIHRoZSB1cHBlcmNhc2UgZm9ybSBpc1xuXHQgKiB1c2VkOyBlbHNlLCB0aGUgbG93ZXJjYXNlIGZvcm0gaXMgdXNlZC4gVGhlIGJlaGF2aW9yIGlzIHVuZGVmaW5lZFxuXHQgKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGlnaXRUb0Jhc2ljKGRpZ2l0LCBmbGFnKSB7XG5cdFx0Ly8gIDAuLjI1IG1hcCB0byBBU0NJSSBhLi56IG9yIEEuLlpcblx0XHQvLyAyNi4uMzUgbWFwIHRvIEFTQ0lJIDAuLjlcblx0XHRyZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogKGRpZ2l0IDwgMjYpIC0gKChmbGFnICE9IDApIDw8IDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG5cdCAqIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0OTIjc2VjdGlvbi0zLjRcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGFkYXB0KGRlbHRhLCBudW1Qb2ludHMsIGZpcnN0VGltZSkge1xuXHRcdHZhciBrID0gMDtcblx0XHRkZWx0YSA9IGZpcnN0VGltZSA/IGZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuXHRcdGRlbHRhICs9IGZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblx0XHRmb3IgKC8qIG5vIGluaXRpYWxpemF0aW9uICovOyBkZWx0YSA+IGJhc2VNaW51c1RNaW4gKiB0TWF4ID4+IDE7IGsgKz0gYmFzZSkge1xuXHRcdFx0ZGVsdGEgPSBmbG9vcihkZWx0YSAvIGJhc2VNaW51c1RNaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gZmxvb3IoayArIChiYXNlTWludXNUTWluICsgMSkgKiBkZWx0YSAvIChkZWx0YSArIHNrZXcpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMgdG8gYSBzdHJpbmcgb2YgVW5pY29kZVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBkZWNvZGUoaW5wdXQpIHtcblx0XHQvLyBEb24ndCB1c2UgVUNTLTJcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuXHRcdCAgICBvdXQsXG5cdFx0ICAgIGkgPSAwLFxuXHRcdCAgICBuID0gaW5pdGlhbE4sXG5cdFx0ICAgIGJpYXMgPSBpbml0aWFsQmlhcyxcblx0XHQgICAgYmFzaWMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIGluZGV4LFxuXHRcdCAgICBvbGRpLFxuXHRcdCAgICB3LFxuXHRcdCAgICBrLFxuXHRcdCAgICBkaWdpdCxcblx0XHQgICAgdCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuNCcsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoJ3B1bnljb2RlJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgIWZyZWVFeHBvcnRzLm5vZGVUeXBlKSB7XG5cdFx0aWYgKGZyZWVNb2R1bGUpIHsgLy8gaW4gTm9kZS5qcyBvciBSaW5nb0pTIHYwLjguMCtcblx0XHRcdGZyZWVNb2R1bGUuZXhwb3J0cyA9IHB1bnljb2RlO1xuXHRcdH0gZWxzZSB7IC8vIGluIE5hcndoYWwgb3IgUmluZ29KUyB2MC43LjAtXG5cdFx0XHRmb3IgKGtleSBpbiBwdW55Y29kZSkge1xuXHRcdFx0XHRwdW55Y29kZS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIChmcmVlRXhwb3J0c1trZXldID0gcHVueWNvZGVba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBpbiBSaGlubyBvciBhIHdlYiBicm93c2VyXG5cdFx0cm9vdC5wdW55Y29kZSA9IHB1bnljb2RlO1xuXHR9XG5cbn0odGhpcykpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhYm91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktdGF1bnVzLVxcXCI+V2h5IFRhdW51cz88L2gxPlxcbjxwPlRhdW51cyBmb2N1c2VzIG9uIGRlbGl2ZXJpbmcgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGV4cGVyaWVuY2UgdG8gdGhlIGVuZC11c2VyLCB3aGlsZSBwcm92aWRpbmcgPGVtPmEgcmVhc29uYWJsZSBkZXZlbG9wbWVudCBleHBlcmllbmNlPC9lbT4gYXMgd2VsbC4gPHN0cm9uZz5UYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudDwvc3Ryb25nPi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS48L3A+XFxuPHA+V2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgPHN0cm9uZz48YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXFwiPnVzYWJpbGl0eTwvYT4gYW5kIHBlcmZvcm1hbmNlIGFyZSBib3RoIGNvcmUgY29uY2VybnM8L3N0cm9uZz4gZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyA8c3Ryb25nPnN0aWxsIGV4cGVjdGVkIHRvIHdvcms8L3N0cm9uZz4uPC9wPlxcbjxwPkZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSA8Y29kZT5jbGljazwvY29kZT4gZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQmIzM5O3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0IDxzdHJvbmc+b3VyIHNpdGVzIGRvbiYjMzk7dCBuZWVkIHRvIGxvb2sgYW5kIGJlaGF2ZSB0aGUgc2FtZSBvbiBldmVyeSBicm93c2VyPC9zdHJvbmc+LiBTaW1pbGFybHksIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+cGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZDwvYT4gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC48L3A+XFxuPHA+V2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCA8ZW0+KG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSk8L2VtPiBvciBiZWNhdXNlIHRoZSB1c2VyIGJsb2NrZWQgSmF2YVNjcmlwdCwgeW91ciBhcHBsaWNhdGlvbiB3aWxsIHN0aWxsIHdvcmshPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcIndoeS1ub3Qtb3RoZXItZnJhbWV3b3Jrcy1cXFwiPldoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz88L2gxPlxcbjxwPk1hbnkgb3RoZXIgZnJhbWV3b3JrcyB3ZXJlbiYjMzk7dCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24mIzM5O3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmRvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnQ8L2E+LiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJiMzOTt0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS48L3A+XFxuPHA+TGF0ZWx5LCB3ZSBjYW4gb2JzZXJ2ZSBtYW55IG1hdHVyZSBvcGVuLXNvdXJjZSBmcmFtZXdvcmtzIGFyZSBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkmIzM5O3JlIGFyY2hpdGVjdGVkLCB3aGVyZSB0aGUgZGV2ZWxvcGVyIGlzIHB1dCBmaXJzdC4gPHN0cm9uZz5UYXVudXMgaXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9oYXNodGFnL2h1bWFuZmlyc3RcXFwiPiNodW1hbmZpcnN0PC9hPjwvc3Ryb25nPiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy48L3A+XFxuPHA+UHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSYjMzk7cmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIDxlbT4odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudCk8L2VtPiwgYW5kIHRoZW4gZW5oYW5jZSBpdCA8c3Ryb25nPmlmIHBvc3NpYmxlPC9zdHJvbmc+IHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91JiMzOTtsbCBiZSBhYmxlIHRvIHJlYWNoIHRoZSBtb3N0IHBlb3BsZSB3aXRoIHlvdXIgY29yZSBleHBlcmllbmNlLCBhbmQgeW91JiMzOTtsbCBhbHNvIGJlIGFibGUgdG8gcHJvdmlkZSBodW1hbnMgaW4gbW9yZSBtb2Rlcm4gYnJvd3NlcnMgd2l0aCBhbGwgb2YgdGhlIGxhdGVzdCBmZWF0dXJlcyBhbmQgdGVjaG5vbG9naWVzLjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA2LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmZWF0dXJlc1xcXCI+RmVhdHVyZXM8L2gxPlxcbjxwPk91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj53aXRob3V0IGFueSBjb25maWd1cmF0aW9uIG5lZWRlZDwvYT4uIEV2ZW4gd2hpbGUgVGF1bnVzIHByb3ZpZGVzIHNoYXJlZC1yZW5kZXJpbmcgY2FwYWJpbGl0aWVzLCBpdCBvZmZlcnMgY29kZSByZXVzZSBvZiB2aWV3cyBhbmQgcm91dGVzLCBtZWFuaW5nIHlvdSYjMzk7bGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSYjMzk7bGwgYmUgdXNlZCBpbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5UYXVudXMgZmVhdHVyZXMgYSByZWFzb25hYmx5IGVuaGFuY2VkIGV4cGVyaWVuY2UsIHdoZXJlIGlmIGZlYXR1cmVzIGFyZW4mIzM5O3QgYXZhaWxhYmxlIG9uIGEgYnJvd3NlciwgdGhleSYjMzk7cmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGJ1dCBpZiB0aGF0JiMzOTtzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCYjMzk7bGwgZmFsbCBiYWNrIHRvIHNpbXBseSBub3QgbWVkZGxpbmcgd2l0aCBsaW5rcyBpbnN0ZWFkIG9mIHVzaW5nIGEgY2xpZW50LXNpZGUtb25seSBoYXNoIHJvdXRlci48L3A+XFxuPHA+VGF1bnVzIGNhbiBkZWFsIHdpdGggdmlldyBjYWNoaW5nIG9uIHlvdXIgYmVoYWxmLCBpZiB5b3Ugc28gZGVzaXJlLCB1c2luZyA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+YXN5bmNocm9ub3VzIGVtYmVkZGVkIGRhdGFiYXNlIHN0b3JlczwvYT4gb24gdGhlIGNsaWVudC1zaWRlLiBUdXJucyBvdXQsIHRoZXJlJiMzOTtzIDxhIGhyZWY9XFxcImh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcXCI+cHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREI8L2E+LiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCYjMzk7cyBhdmFpbGFibGUsIGFuZCBpZiBpdCYjMzk7cyBub3QgdGhlbiB2aWV3cyB3b24mIzM5O3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gPHN0cm9uZz5UaGUgc2l0ZSB3b24mIzM5O3Qgc2ltcGx5IHJvbGwgb3ZlciBhbmQgZGllLCB0aG91Z2guPC9zdHJvbmc+PC9wPlxcbjxwPklmIHlvdSYjMzk7dmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlIDxzdHJvbmc+dmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZTwvc3Ryb25nPiwgd2hpY2ggd2lsbCBzdGFydCBkb3dubG9hZGluZyB2aWV3cyBhcyBzb29uIGFzIGh1bWFucyBob3ZlciBvbiBsaW5rcywgYXMgdG8gZGVsaXZlciBhIDxlbT5mYXN0ZXIgcGVyY2VpdmVkIGh1bWFuIGV4cGVyaWVuY2U8L2VtPi48L3A+XFxuPHA+VGF1bnVzIHByb3ZpZGVzIHRoZSBiYXJlIGJvbmVzIGZvciB5b3VyIGFwcGxpY2F0aW9uIHNvIHRoYXQgeW91IGNhbiBzZXBhcmF0ZSBjb25jZXJucyBpbnRvIHJvdXRlcywgY29udHJvbGxlcnMsIG1vZGVscywgYW5kIHZpZXdzLiBUaGVuIGl0IGdldHMgb3V0IG9mIHRoZSB3YXksIGJ5IGRlc2lnbi4gVGhlcmUgYXJlIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+YSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzPC9hPiB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC48L3A+XFxuPHA+V2l0aCBUYXVudXMgeW91JiMzOTtsbCBiZSBpbiBjaGFyZ2UuIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkFyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/PC9hPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmYW1pbGlhcml0eVxcXCI+RmFtaWxpYXJpdHk8L2gxPlxcbjxwPllvdSBjYW4gdXNlIFRhdW51cyB0byBkZXZlbG9wIGFwcGxpY2F0aW9ucyB1c2luZyB5b3VyIGZhdm9yaXRlIE5vZGUuanMgSFRUUCBzZXJ2ZXIsIDxzdHJvbmc+Ym90aCA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBhcmUgZnVsbHkgc3VwcG9ydGVkPC9zdHJvbmc+LiBJbiBib3RoIGNhc2VzLCB5b3UmIzM5O2xsIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPmJ1aWxkIGNvbnRyb2xsZXJzIHRoZSB3YXkgeW91JiMzOTtyZSBhbHJlYWR5IHVzZWQgdG88L2E+LCBleGNlcHQgeW91IHdvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UmIzM5O2xsIGJlIGFibGUgdG8gZG8gZXZlcnl0aGluZyB5b3UmIzM5O3JlIGFscmVhZHkgYWJsZSB0byBkbywgYW5kIHRoZW4geW91JiMzOTtsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuPC9wPlxcbjxwPllvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCYjMzk7cyBiZWNhdXNlIFRhdW51cyB0cmVhdHMgdmlld3MgYXMgbWVyZSBKYXZhU2NyaXB0IGZ1bmN0aW9ucywgcmF0aGVyIHRoYW4gYmVpbmcgdGllZCBpbnRvIGEgc3BlY2lmaWMgdmlldy1yZW5kZXJpbmcgZW5naW5lLjwvcD5cXG48cD5DbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUganVzdCBmdW5jdGlvbnMsIHRvby4gWW91IGNhbiBicmluZyB5b3VyIG93biBzZWxlY3RvciBlbmdpbmUsIHlvdXIgb3duIEFKQVggbGlicmFyaWVzLCBhbmQgeW91ciBvd24gZGF0YS1iaW5kaW5nIHNvbHV0aW9ucy4gSXQgbWlnaHQgbWVhbiB0aGVyZSYjMzk7cyBhIGJpdCBtb3JlIHdvcmsgaW52b2x2ZWQgZm9yIHlvdSwgYnV0IHlvdSYjMzk7bGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSYjMzk7cmUgbW9zdCBjb21mb3J0YWJsZSB3aXRoISBUaGF0IGJlaW5nIHNhaWQsIFRhdW51cyA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmRvZXMgcmVjb21tZW5kIGEgZmV3IGxpYnJhcmllczwvYT4gdGhhdCB3b3JrIHdlbGwgd2l0aCBpdC48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBXaHkgVGF1bnVzP1xcblxcbiAgICBUYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIF9hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZV8gYXMgd2VsbC4gKipUYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudCoqLiBJdCB1c2VzIHNlcnZlci1zaWRlIHJlbmRlcmluZyB0byBnZXQgY29udGVudCB0byB5b3VyIGh1bWFucyBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgaXQgdXNlcyBjbGllbnQtc2lkZSByZW5kZXJpbmcgdG8gaW1wcm92ZSB0aGVpciBleHBlcmllbmNlLlxcblxcbiAgICBXaGlsZSBpdCBmb2N1c2VzIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCAqKlt1c2FiaWxpdHldWzJdIGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zKiogZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyAqKnN0aWxsIGV4cGVjdGVkIHRvIHdvcmsqKi5cXG5cXG4gICAgRm9yIGV4YW1wbGUsIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBzaXRlIHVzZXMgcGxhaW4tb2xkIGxpbmtzIHRvIG5hdmlnYXRlIGZyb20gb25lIHZpZXcgdG8gYW5vdGhlciwgYW5kIHRoZW4gYWRkcyBhIGBjbGlja2AgZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQncyBva2F5LCBiZWNhdXNlIHdlIGFja25vd2xlZGdlIHRoYXQgKipvdXIgc2l0ZXMgZG9uJ3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3NlcioqLiBTaW1pbGFybHksIFtwZXJmb3JtYW5jZSBpcyBncmVhdGx5IGVuaGFuY2VkXVsxXSBieSBkZWxpdmVyaW5nIGNvbnRlbnQgdG8gdGhlIGh1bWFuIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCB0aGVuIGFkZGluZyBmdW5jdGlvbmFsaXR5IG9uIHRvcCBvZiB0aGF0LlxcblxcbiAgICBXaXRoIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCBpZiB0aGUgZnVuY3Rpb25hbGl0eSBuZXZlciBnZXRzIHRoZXJlIGJlY2F1c2UgYSBKYXZhU2NyaXB0IHJlc291cmNlIGZhaWxlZCB0byBsb2FkIGJlY2F1c2UgdGhlIG5ldHdvcmsgZmFpbGVkIF8obm90IHVuY29tbW9uIGluIHRoZSBtb2JpbGUgZXJhKV8gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrIVxcblxcbiAgICBbMV06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9hZGp1c3RpbmctdXgtZm9yLWh1bWFuc1xcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IE5vdCBPdGhlciBGcmFtZXdvcmtzP1xcblxcbiAgICBNYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4ndCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24ndCBwcmlvcml0aXplZCwgYW5kIGh1bWFucyBhcmUgZXhwZWN0ZWQgdG8gW2Rvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnRdWzJdLiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJ3QgdGhlIG9ubHkgd2ViIGNyYXdsZXIgb3BlcmF0b3Igb3V0IHRoZXJlLCBhbmQgaXQgbWlnaHQgYmUgYSB3aGlsZSBiZWZvcmUgc29jaWFsIG1lZGlhIGxpbmsgY3Jhd2xlcnMgY2F0Y2ggdXAgd2l0aCB0aGVtLlxcblxcbiAgICBMYXRlbHksIHdlIGNhbiBvYnNlcnZlIG1hbnkgbWF0dXJlIG9wZW4tc291cmNlIGZyYW1ld29ya3MgYXJlIGRyb3BwaW5nIHN1cHBvcnQgZm9yIG9sZGVyIGJyb3dzZXJzLiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZCwgd2hlcmUgdGhlIGRldmVsb3BlciBpcyBwdXQgZmlyc3QuICoqVGF1bnVzIGlzIFsjaHVtYW5maXJzdF1bMV0qKiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy5cXG5cXG4gICAgUHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZC4gQXMgdGhlIG5hbWUgaW1wbGllcywgYSBiYXNlbGluZSBpcyBlc3RhYmxpc2hlZCB3aGVyZSB3ZSBkZWxpdmVyIHRoZSBjb3JlIGV4cGVyaWVuY2UgdG8gdGhlIHVzZXIgXyh0eXBpY2FsbHkgaW4gdGhlIGZvcm0gb2YgcmVhZGFibGUgSFRNTCBjb250ZW50KV8sIGFuZCB0aGVuIGVuaGFuY2UgaXQgKippZiBwb3NzaWJsZSoqIHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91J2xsIGJlIGFibGUgdG8gcmVhY2ggdGhlIG1vc3QgcGVvcGxlIHdpdGggeW91ciBjb3JlIGV4cGVyaWVuY2UsIGFuZCB5b3UnbGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy5cXG5cXG4gICAgWzFdOiBodHRwczovL3R3aXR0ZXIuY29tL2hhc2h0YWcvaHVtYW5maXJzdFxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEZlYXR1cmVzXFxuXFxuICAgIE91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyBbd2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWRdWzJdLiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UnbGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSdsbCBiZSB1c2VkIGluIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUuXFxuXFxuICAgIFRhdW51cyBmZWF0dXJlcyBhIHJlYXNvbmFibHkgZW5oYW5jZWQgZXhwZXJpZW5jZSwgd2hlcmUgaWYgZmVhdHVyZXMgYXJlbid0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkncmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgYGhpc3RvcnlgIEFQSSBidXQgaWYgdGhhdCdzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCdsbCBmYWxsIGJhY2sgdG8gc2ltcGx5IG5vdCBtZWRkbGluZyB3aXRoIGxpbmtzIGluc3RlYWQgb2YgdXNpbmcgYSBjbGllbnQtc2lkZS1vbmx5IGhhc2ggcm91dGVyLlxcblxcbiAgICBUYXVudXMgY2FuIGRlYWwgd2l0aCB2aWV3IGNhY2hpbmcgb24geW91ciBiZWhhbGYsIGlmIHlvdSBzbyBkZXNpcmUsIHVzaW5nIFthc3luY2hyb25vdXMgZW1iZWRkZWQgZGF0YWJhc2Ugc3RvcmVzXVszXSBvbiB0aGUgY2xpZW50LXNpZGUuIFR1cm5zIG91dCwgdGhlcmUncyBbcHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREJdWzRdLiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCdzIGF2YWlsYWJsZSwgYW5kIGlmIGl0J3Mgbm90IHRoZW4gdmlld3Mgd29uJ3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gKipUaGUgc2l0ZSB3b24ndCBzaW1wbHkgcm9sbCBvdmVyIGFuZCBkaWUsIHRob3VnaC4qKlxcblxcbiAgICBJZiB5b3UndmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlICoqdmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZSoqLCB3aGljaCB3aWxsIHN0YXJ0IGRvd25sb2FkaW5nIHZpZXdzIGFzIHNvb24gYXMgaHVtYW5zIGhvdmVyIG9uIGxpbmtzLCBhcyB0byBkZWxpdmVyIGEgX2Zhc3RlciBwZXJjZWl2ZWQgaHVtYW4gZXhwZXJpZW5jZV8uXFxuXFxuICAgIFRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSBbYSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzXVsxXSB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC5cXG5cXG4gICAgV2l0aCBUYXVudXMgeW91J2xsIGJlIGluIGNoYXJnZS4gW0FyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/XVsyXVxcblxcbiAgICBbMV06IC9jb21wbGVtZW50c1xcbiAgICBbMl06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzNdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbNF06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgRmFtaWxpYXJpdHlcXG5cXG4gICAgWW91IGNhbiB1c2UgVGF1bnVzIHRvIGRldmVsb3AgYXBwbGljYXRpb25zIHVzaW5nIHlvdXIgZmF2b3JpdGUgTm9kZS5qcyBIVFRQIHNlcnZlciwgKipib3RoIFtFeHByZXNzXVszXSBhbmQgW0hhcGldWzRdIGFyZSBmdWxseSBzdXBwb3J0ZWQqKi4gSW4gYm90aCBjYXNlcywgeW91J2xsIFtidWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSdyZSBhbHJlYWR5IHVzZWQgdG9dWzFdLCBleGNlcHQgeW91IHdvbid0IGhhdmUgdG8gYHJlcXVpcmVgIHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UnbGwgYmUgYWJsZSB0byBkbyBldmVyeXRoaW5nIHlvdSdyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSdsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuXFxuXFxuICAgIFlvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCdzIGJlY2F1c2UgVGF1bnVzIHRyZWF0cyB2aWV3cyBhcyBtZXJlIEphdmFTY3JpcHQgZnVuY3Rpb25zLCByYXRoZXIgdGhhbiBiZWluZyB0aWVkIGludG8gYSBzcGVjaWZpYyB2aWV3LXJlbmRlcmluZyBlbmdpbmUuXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBqdXN0IGZ1bmN0aW9ucywgdG9vLiBZb3UgY2FuIGJyaW5nIHlvdXIgb3duIHNlbGVjdG9yIGVuZ2luZSwgeW91ciBvd24gQUpBWCBsaWJyYXJpZXMsIGFuZCB5b3VyIG93biBkYXRhLWJpbmRpbmcgc29sdXRpb25zLiBJdCBtaWdodCBtZWFuIHRoZXJlJ3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UnbGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSdyZSBtb3N0IGNvbWZvcnRhYmxlIHdpdGghIFRoYXQgYmVpbmcgc2FpZCwgVGF1bnVzIFtkb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXNdWzJdIHRoYXQgd29yayB3ZWxsIHdpdGggaXQuXFxuXFxuICAgIFsxXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbMl06IC9jb21wbGVtZW50c1xcbiAgICBbM106IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs0XTogaHR0cDovL2hhcGlqcy5jb21cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZ2V0dGluZ1N0YXJ0ZWQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImdldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9oMT5cXG48cD5UYXVudXMgaXMgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUgZm9yIE5vZGUuanMsIGFuZCBpdCYjMzk7cyA8ZW0+dXAgdG8geW91IGhvdyB0byB1c2UgaXQ8L2VtPi4gSW4gZmFjdCwgaXQgbWlnaHQgYmUgYSBnb29kIGlkZWEgZm9yIHlvdSB0byA8c3Ryb25nPnNldCB1cCBqdXN0IHRoZSBzZXJ2ZXItc2lkZSBhc3BlY3QgZmlyc3Q8L3N0cm9uZz4sIGFzIHRoYXQmIzM5O2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LjwvcD5cXG48aDEgaWQ9XFxcInRhYmxlLW9mLWNvbnRlbnRzXFxcIj5UYWJsZSBvZiBDb250ZW50czwvaDE+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCIjaG93LWl0LXdvcmtzXFxcIj5Ib3cgaXQgd29ya3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2luc3RhbGxpbmctdGF1bnVzXFxcIj5JbnN0YWxsaW5nIFRhdW51czwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjc2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9hPjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2NyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjeW91ci1maXJzdC1yb3V0ZVxcXCI+WW91ciBmaXJzdCByb3V0ZTwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctamFkZS1hcy15b3VyLXZpZXctZW5naW5lXFxcIj5Vc2luZyBKYWRlIGFzIHlvdXIgdmlldyBlbmdpbmU8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3Rocm93aW5nLWluLWEtY29udHJvbGxlclxcXCI+VGhyb3dpbmcgaW4gYSBjb250cm9sbGVyPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9hPjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLXRoZS10YXVudXMtY2xpXFxcIj5Vc2luZyB0aGUgVGF1bnVzIENMSTwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjYm9vdGluZy11cC10aGUtY2xpZW50LXNpZGUtcm91dGVyXFxcIj5Cb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXI8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2FkZGluZy1mdW5jdGlvbmFsaXR5LWluLWEtY2xpZW50LXNpZGUtY29udHJvbGxlclxcXCI+QWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtdGF1bnVzLWFwaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBBUEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2NhY2hpbmctYW5kLXByZWZldGNoaW5nXFxcIj5DYWNoaW5nIGFuZCBQcmVmZXRjaGluZzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RoZS1za3ktaXMtdGhlLWxpbWl0LVxcXCI+VGhlIHNreSBpcyB0aGUgbGltaXQhPC9hPjwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcImhvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9oMT5cXG48cD5UYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgPHN0cm9uZz5wcm92ZW48L3N0cm9uZz4gc2V0IG9mIHJ1bGVzLjwvcD5cXG48dWw+XFxuPGxpPkRlZmluZSBhIDxjb2RlPmZ1bmN0aW9uKG1vZGVsKTwvY29kZT4gZm9yIGVhY2ggeW91ciB2aWV3czwvbGk+XFxuPGxpPlB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnQ8L2xpPlxcbjxsaT5EZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uPC9saT5cXG48bGk+UHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnQ8L2xpPlxcbjxsaT5FbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHM8L2xpPlxcbjxsaT5DcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5DcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXc8L2xpPlxcbjxsaT5Gb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlPC9saT5cXG48bGk+V2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCE8L2xpPlxcbjxsaT5PbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCA8c3Ryb25nPmhpamFjayBsaW5rIGNsaWNrczwvc3Ryb25nPiBhbmQgbWFrZSBBSkFYIHJlcXVlc3RzIGluc3RlYWQ8L2xpPlxcbjxsaT5XaGVuIHlvdSBnZXQgdGhlIEpTT04gbW9kZWwgYmFjaywgcmVuZGVyIHZpZXdzIG9uIHRoZSBjbGllbnQtc2lkZTwvbGk+XFxuPGxpPklmIHRoZSA8Y29kZT5oaXN0b3J5PC9jb2RlPiBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiA8c3Ryb25nPkRvbiYjMzk7dCBjb25mdXNlIHlvdXIgaHVtYW5zIHdpdGggb2JzY3VyZSBoYXNoIHJvdXRlcnMhPC9zdHJvbmc+PC9saT5cXG48L3VsPlxcbjxwPkkmIzM5O2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEkmIzM5O2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIHN0ZXBzIHlvdSBuZWVkIHRvIHRha2UgaW4gb3JkZXIgdG8gbWFrZSB0aGlzIGZsb3cgaGFwcGVuLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImluc3RhbGxpbmctdGF1bnVzXFxcIj5JbnN0YWxsaW5nIFRhdW51czwvaDE+XFxuPHA+Rmlyc3Qgb2ZmLCB5b3UmIzM5O2xsIG5lZWQgdG8gY2hvb3NlIGEgSFRUUCBzZXJ2ZXIgZnJhbWV3b3JrIGZvciB5b3VyIGFwcGxpY2F0aW9uLiBBdCB0aGUgbW9tZW50IFRhdW51cyBzdXBwb3J0cyBvbmx5IGEgY291cGxlIG9mIEhUVFAgZnJhbWV3b3JrcywgYnV0IG1vcmUgbWF5IGJlIGFkZGVkIGlmIHRoZXkgYXJlIHBvcHVsYXIgZW5vdWdoLjwvcD5cXG48dWw+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiwgdGhyb3VnaCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxcIj50YXVudXMtZXhwcmVzczwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcXCI+dGF1bnVzLWhhcGk8L2E+IGFuZCB0aGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxcIj5oYXBpaWZ5PC9hPiB0cmFuc2Zvcm08L2xpPlxcbjwvdWw+XFxuPGJsb2NrcXVvdGU+XFxuPHA+SWYgeW91JiMzOTtyZSBtb3JlIG9mIGEgPGVtPiZxdW90O3J1bW1hZ2UgdGhyb3VnaCBzb21lb25lIGVsc2UmIzM5O3MgY29kZSZxdW90OzwvZW0+IHR5cGUgb2YgZGV2ZWxvcGVyLCB5b3UgbWF5IGZlZWwgY29tZm9ydGFibGUgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXFwiPmdvaW5nIHRocm91Z2ggdGhpcyB3ZWJzaXRlJiMzOTtzIHNvdXJjZSBjb2RlPC9hPiwgd2hpY2ggdXNlcyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvb1xcXCI+cG9ueWZvby5jb208L2E+LCB3aGljaCBpcyA8c3Ryb25nPmEgbW9yZSBhZHZhbmNlZCB1c2UtY2FzZTwvc3Ryb25nPiB1bmRlciB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQmIzM5O3Mgb2theSB0b28uPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5PbmNlIHlvdSYjMzk7dmUgc2V0dGxlZCBmb3IgZWl0aGVyIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBvciA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4geW91JiMzOTtsbCBiZSBhYmxlIHRvIHByb2NlZWQuIEZvciB0aGUgcHVycG9zZXMgb2YgdGhpcyBndWlkZSwgd2UmIzM5O2xsIHVzZSA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4uIFN3aXRjaGluZyBiZXR3ZWVuIG9uZSBvZiB0aGUgZGlmZmVyZW50IEhUVFAgZmxhdm9ycyBpcyBzdHJpa2luZ2x5IGVhc3ksIHRob3VnaC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZVxcXCI+U2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGU8L2g0PlxcbjxwPk5hdHVyYWxseSwgeW91JiMzOTtsbCBuZWVkIHRvIGluc3RhbGwgYWxsIG9mIHRoZSBmb2xsb3dpbmcgbW9kdWxlcyBmcm9tIDxjb2RlPm5wbTwvY29kZT4gdG8gZ2V0IHN0YXJ0ZWQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIHRhdW51cyB0YXVudXMtZXhwcmVzcyBleHByZXNzIC0tc2F2ZVxcbjwvY29kZT48L3ByZT5cXG48cD5MZXQmIzM5O3MgYnVpbGQgb3VyIGFwcGxpY2F0aW9uIHN0ZXAtYnktc3RlcCwgYW5kIEkmIzM5O2xsIHdhbGsgeW91IHRocm91Z2ggdGhlbSBhcyB3ZSBnbyBhbG9uZy4gRmlyc3Qgb2YgYWxsLCB5b3UmIzM5O2xsIG5lZWQgdGhlIGZhbW91cyA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIGFwcC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBwcm9iYWJseSBhIGdvb2QgaWRlYSB0byBwdXQgc29tZXRoaW5nIGluIHlvdXIgPGNvZGU+YXBwLmpzPC9jb2RlPiBmaWxlLCBsZXQmIzM5O3MgZG8gdGhhdCBub3cuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHt9O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkFsbCA8Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT4gcmVhbGx5IGRvZXMgaXMgYWRkIGEgYnVuY2ggb2Ygcm91dGVzIHRvIHlvdXIgRXhwcmVzcyA8Y29kZT5hcHA8L2NvZGU+LiBZb3Ugc2hvdWxkIG5vdGUgdGhhdCBhbnkgbWlkZGxld2FyZSBhbmQgQVBJIHJvdXRlcyBzaG91bGQgcHJvYmFibHkgY29tZSBiZWZvcmUgdGhlIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+IGludm9jYXRpb24uIFlvdSYjMzk7bGwgcHJvYmFibHkgYmUgdXNpbmcgYSBjYXRjaC1hbGwgdmlldyByb3V0ZSB0aGF0IHJlbmRlcnMgYSA8ZW0+JnF1b3Q7Tm90IEZvdW5kJnF1b3Q7PC9lbT4gdmlldywgYmxvY2tpbmcgYW55IHJvdXRpbmcgYmV5b25kIHRoYXQgcm91dGUuPC9wPlxcbjxwPlRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+IGxldCYjMzk7cyB5b3UgY29uZmlndXJlIFRhdW51cy4gSW5zdGVhZCBvZiBkaXNjdXNzaW5nIGV2ZXJ5IHNpbmdsZSBjb25maWd1cmF0aW9uIG9wdGlvbiB5b3UgY291bGQgc2V0IGhlcmUsIGxldCYjMzk7cyBkaXNjdXNzIHdoYXQgbWF0dGVyczogdGhlIDxlbT5yZXF1aXJlZCBjb25maWd1cmF0aW9uPC9lbT4uIFRoZXJlJiMzOTtzIHR3byBvcHRpb25zIHRoYXQgeW91IG11c3Qgc2V0IGlmIHlvdSB3YW50IHlvdXIgVGF1bnVzIGFwcGxpY2F0aW9uIHRvIG1ha2UgYW55IHNlbnNlLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmxheW91dDwvY29kZT4gc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSA8Y29kZT5tb2RlbDwvY29kZT4gYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnQ8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlczwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvaDQ+XFxuPHA+TGV0JiMzOTtzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQmIzM5O2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBsYXlvdXQuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IDxlbT4oYXMgc2VlbiBiZWxvdyk8L2VtPiBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UmIzM5O2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgPGVtPiZxdW90O3RoZXJlIGlzIG5vIGxheW91dCwganVzdCByZW5kZXIgdGhlIHBhcnRpYWxzJnF1b3Q7PC9lbT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICByZXR1cm4gbW9kZWwucGFydGlhbDtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIGlmIHlvdSB3ZXJlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uLCB0aGVuIHlvdSBwcm9iYWJseSB3b3VsZG4mIzM5O3Qgd2FudCB0byB3cml0ZSB2aWV3cyBhcyBKYXZhU2NyaXB0IGZ1bmN0aW9ucyBhcyB0aGF0JiMzOTtzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vamFubC9tdXN0YWNoZS5qc1xcXCI+TXVzdGFjaGU8L2E+IGlzIGEgdGVtcGxhdGluZyBlbmdpbmUgdGhhdCBjYW4gY29tcGlsZSB5b3VyIHZpZXdzIGludG8gcGxhaW4gZnVuY3Rpb25zLCB1c2luZyBhIHN5bnRheCB0aGF0JiMzOTtzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxcIj5KYWRlPC9hPiBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJiMzOTtzIG5vIGNsb3NpbmcgdGFnczwvbGk+XFxuPGxpPlRoZXJlJiMzOTtzIG1hbnkgbW9yZSBhbHRlcm5hdGl2ZXMgbGlrZSA8YSBocmVmPVxcXCJodHRwOi8vbW96aWxsYS5naXRodWIuaW8vbnVuanVja3MvXFxcIj5Nb3ppbGxhJiMzOTtzIE51bmp1Y2tzPC9hPiwgPGEgaHJlZj1cXFwiaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxcIj5IYW5kbGViYXJzPC9hPiwgYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxcIj5FSlM8L2E+LjwvbGk+XFxuPC91bD5cXG48cD5SZW1lbWJlciB0byBhZGQgdGhlIDxjb2RlPmxheW91dDwvY29kZT4gdW5kZXIgdGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5Zb3UmIzM5O2xsIGZpbmQgdG9vbHMgcmVsYXRlZCB0byB2aWV3IHRlbXBsYXRpbmcgaW4gdGhlIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+Y29tcGxlbWVudGFyeSBtb2R1bGVzIHNlY3Rpb248L2E+LiBJZiB5b3UgZG9uJiMzOTt0IHByb3ZpZGUgYSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHByb3BlcnR5IGF0IGFsbCwgVGF1bnVzIHdpbGwgcmVuZGVyIHlvdXIgbW9kZWwgaW4gYSByZXNwb25zZSBieSB3cmFwcGluZyBpdCBpbiA8Y29kZT4mbHQ7cHJlJmd0OzwvY29kZT4gYW5kIDxjb2RlPiZsdDtjb2RlJmd0OzwvY29kZT4gdGFncywgd2hpY2ggbWF5IGFpZCB5b3Ugd2hlbiBnZXR0aW5nIHN0YXJ0ZWQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwieW91ci1maXJzdC1yb3V0ZVxcXCI+WW91ciBmaXJzdCByb3V0ZTwvaDQ+XFxuPHA+Um91dGVzIG5lZWQgdG8gYmUgcGxhY2VkIGluIGl0cyBvd24gZGVkaWNhdGVkIG1vZHVsZSwgc28gdGhhdCB5b3UgY2FuIHJldXNlIGl0IGxhdGVyIG9uIDxzdHJvbmc+d2hlbiBzZXR0aW5nIHVwIGNsaWVudC1zaWRlIHJvdXRpbmc8L3N0cm9uZz4uIExldCYjMzk7cyBjcmVhdGUgdGhhdCBtb2R1bGUgYW5kIGFkZCBhIHJvdXRlIHRvIGl0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCByb3V0ZXMuanNcXG48L2NvZGU+PC9wcmU+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBbXFxuICB7IHJvdXRlOiAmIzM5Oy8mIzM5OywgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5OyB9XFxuXTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+RWFjaCBpdGVtIGluIHRoZSBleHBvcnRlZCBhcnJheSBpcyBhIHJvdXRlLiBJbiB0aGlzIGNhc2UsIHdlIG9ubHkgaGF2ZSB0aGUgPGNvZGU+LzwvY29kZT4gcm91dGUgd2l0aCB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gYWN0aW9uLiBUYXVudXMgZm9sbG93cyB0aGUgd2VsbCBrbm93biA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxcIj5jb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbiBwYXR0ZXJuPC9hPiwgd2hpY2ggbWFkZSA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1J1Ynlfb25fUmFpbHNcXFwiPlJ1Ynkgb24gUmFpbHM8L2E+IGZhbW91cy4gPGVtPk1heWJlIG9uZSBkYXkgVGF1bnVzIHdpbGwgYmUgZmFtb3VzIHRvbyE8L2VtPiBCeSBjb252ZW50aW9uLCBUYXVudXMgd2lsbCBhc3N1bWUgdGhhdCB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gYWN0aW9uIHVzZXMgdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIgYW5kIHJlbmRlcnMgdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IHZpZXcuIE9mIGNvdXJzZSwgPGVtPmFsbCBvZiB0aGF0IGNhbiBiZSBjaGFuZ2VkIHVzaW5nIGNvbmZpZ3VyYXRpb248L2VtPi48L3A+XFxuPHA+VGltZSB0byBnbyBiYWNrIHRvIDxjb2RlPmFwcC5qczwvY29kZT4gYW5kIHVwZGF0ZSB0aGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuL2xheW91dCYjMzk7KSxcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIDxlbT4obW9yZSBvbiB0aGF0IGxhdGVyLCBidXQgaXQgZGVmYXVsdHMgdG8gPGNvZGU+e308L2NvZGU+KTwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9oND5cXG48cD5MZXQmIzM5O3MgZ28gYWhlYWQgYW5kIHVzZSBKYWRlIGFzIHRoZSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgb2YgY2hvaWNlIGZvciBvdXIgdmlld3MuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHZpZXdzL2hvbWUvaW5kZXguamFkZVxcbjwvY29kZT48L3ByZT5cXG48cD5TaW5jZSB3ZSYjMzk7cmUganVzdCBnZXR0aW5nIHN0YXJ0ZWQsIHRoZSB2aWV3IHdpbGwganVzdCBoYXZlIHNvbWUgYmFzaWMgc3RhdGljIGNvbnRlbnQsIGFuZCB0aGF0JiMzOTtzIGl0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWphZGVcXFwiPnAgSGVsbG8gVGF1bnVzIVxcbjwvY29kZT48L3ByZT5cXG48cD5OZXh0IHlvdSYjMzk7bGwgd2FudCB0byBjb21waWxlIHRoZSB2aWV3IGludG8gYSBmdW5jdGlvbi4gVG8gZG8gdGhhdCB5b3UgY2FuIHVzZSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvamFkdW1cXFwiPmphZHVtPC9hPiwgYSBzcGVjaWFsaXplZCBKYWRlIGNvbXBpbGVyIHRoYXQgcGxheXMgd2VsbCB3aXRoIFRhdW51cyBieSBiZWluZyBhd2FyZSBvZiA8Y29kZT5yZXF1aXJlPC9jb2RlPiBzdGF0ZW1lbnRzLCBhbmQgdGh1cyBzYXZpbmcgYnl0ZXMgd2hlbiBpdCBjb21lcyB0byBjbGllbnQtc2lkZSByZW5kZXJpbmcuIExldCYjMzk7cyBpbnN0YWxsIGl0IGdsb2JhbGx5LCBmb3IgdGhlIHNha2Ugb2YgdGhpcyBleGVyY2lzZSA8ZW0+KHlvdSBzaG91bGQgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4geW91JiMzOTtyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbik8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgamFkdW0gLWdcXG48L2NvZGU+PC9wcmU+XFxuPHA+VG8gY29tcGlsZSBldmVyeSB2aWV3IGluIHRoZSA8Y29kZT52aWV3czwvY29kZT4gZGlyZWN0b3J5IGludG8gZnVuY3Rpb25zIHRoYXQgd29yayB3ZWxsIHdpdGggVGF1bnVzLCB5b3UgY2FuIHVzZSB0aGUgY29tbWFuZCBiZWxvdy4gVGhlIDxjb2RlPi0tb3V0cHV0PC9jb2RlPiBmbGFnIGluZGljYXRlcyB3aGVyZSB5b3Ugd2FudCB0aGUgdmlld3MgdG8gYmUgcGxhY2VkLiBXZSBjaG9zZSB0byB1c2UgPGNvZGU+LmJpbjwvY29kZT4gYmVjYXVzZSB0aGF0JiMzOTtzIHdoZXJlIFRhdW51cyBleHBlY3RzIHlvdXIgY29tcGlsZWQgdmlld3MgdG8gYmUgYnkgZGVmYXVsdC4gQnV0IHNpbmNlIFRhdW51cyBmb2xsb3dzIHRoZSA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5jb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbjwvYT4gYXBwcm9hY2gsIHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCBpZiB5b3Ugd2FudGVkIHRvLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5qYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkNvbmdyYXR1bGF0aW9ucyEgVGF1bnVzIGlzIG5vdyBvcGVyYXRpb25hbC4gQWxsIHRoYXQmIzM5O3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgPGNvZGU+MzAwMDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxub3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q29udHJvbGxlcnMgYXJlIGluZGVlZCBvcHRpb25hbCwgYnV0IGFuIGFwcGxpY2F0aW9uIHRoYXQgcmVuZGVycyBldmVyeSB2aWV3IHVzaW5nIHRoZSBzYW1lIG1vZGVsIHdvbiYjMzk7dCBnZXQgdmVyeSBmYXIuIENvbnRyb2xsZXJzIGFsbG93IHlvdSB0byBoYW5kbGUgdGhlIHJlcXVlc3QgYW5kIHB1dCB0b2dldGhlciB0aGUgbW9kZWwgdG8gYmUgdXNlZCB3aGVuIHNlbmRpbmcgYSByZXNwb25zZS4gQ29udHJhcnkgdG8gd2hhdCBtb3N0IGZyYW1ld29ya3MgcHJvcG9zZSwgVGF1bnVzIGV4cGVjdHMgZXZlcnkgYWN0aW9uIHRvIGhhdmUgaXRzIG93biBpbmRpdmlkdWFsIGNvbnRyb2xsZXIuIFNpbmNlIE5vZGUuanMgbWFrZXMgaXQgZWFzeSB0byBpbXBvcnQgY29tcG9uZW50cywgdGhpcyBzZXR1cCBoZWxwcyB5b3Uga2VlcCB5b3VyIGNvZGUgbW9kdWxhciB3aGlsZSBzdGlsbCBiZWluZyBhYmxlIHRvIHJldXNlIGxvZ2ljIGJ5IHNoYXJpbmcgbW9kdWxlcyBhY3Jvc3MgZGlmZmVyZW50IGNvbnRyb2xsZXJzLiBMZXQmIzM5O3MgY3JlYXRlIGEgY29udHJvbGxlciBmb3IgdGhlIDxjb2RlPmhvbWUvdmlldzwvY29kZT4gYWN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiA8ZW0+U3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj88L2VtPiBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IDxlbT4ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBpbiB0aGUgY2FzZSBvZiA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbiYjMzk7dCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyA8ZW0+KHZlcnkgZmV3KTwvZW0+IHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIDxjb2RlPnRpdGxlPC9jb2RlPiBwcm9wZXJ0eSwgYW5kIGl0JiMzOTtsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgPGNvZGU+ZG9jdW1lbnQudGl0bGU8L2NvZGU+IGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0JiMzOTtzIG5vdCBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IHByb3BlcnR5IHdvbiYjMzk7dCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LjwvcD5cXG48cD5IZXJlIGlzIG91ciBuZXdmYW5nbGVkIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIuIEFzIHlvdSYjMzk7bGwgbm90aWNlLCBpdCBkb2VzbiYjMzk7dCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gPGNvZGU+bmV4dDwvY29kZT4gaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byA8Y29kZT5yZXMudmlld01vZGVsPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgIG1vZGVsOiB7XFxuICAgICAgdGl0bGU6ICYjMzk7V2VsY29tZSBIb21lLCBUYXVudXMhJiMzOTtcXG4gICAgfVxcbiAgfTtcXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSA8ZW0+d291bGRuJiMzOTt0IGJlIHByb2dyZXNzaXZlPC9lbT4sIGFuZCB0aHVzIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPml0IHdvdWxkIGJlIHJlYWxseSwgPGVtPnJlYWxseTwvZW0+IGJhZDwvYT4uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgPGNvZGU+dGl0bGU8L2NvZGU+IGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCYjMzk7cyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhIFRoZSA8Y29kZT4hPTwvY29kZT4gc3ludGF4IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbiYjMzk7dCBiZSBlc2NhcGVkLiBUaGF0JiMzOTtzIG9rYXkgYmVjYXVzZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJiMzOTt0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+dGl0bGU9bW9kZWwudGl0bGVcXG5tYWluIT1wYXJ0aWFsXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IDxjb2RlPiZsdDtodG1sJmd0OzwvY29kZT4sIDxjb2RlPiZsdDtoZWFkJmd0OzwvY29kZT4sIGFuZCA8Y29kZT4mbHQ7Ym9keSZndDs8L2NvZGU+IGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIDxlbT5Ib3cgY29vbCBpcyB0aGF0PzwvZW0+PC9wPlxcbjxwPlRoYXQmIzM5O3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUmIzM5O3Mgbm90aGluZyBzdG9wcGluZyB5b3UgZnJvbSBhZGRpbmcgZGF0YWJhc2UgY2FsbHMgdG8gZmV0Y2ggYml0cyBhbmQgcGllY2VzIG9mIHRoZSBtb2RlbCBiZWZvcmUgaW52b2tpbmcgPGNvZGU+bmV4dDwvY29kZT4gdG8gcmVuZGVyIHRoZSB2aWV3LjwvcD5cXG48cD5UaGVyZSYjMzk7cyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCYjMzk7cyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9oMT5cXG48cD5Zb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmNoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLjwvcD5cXG48cD5UaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIDxlbT5vciBpZiBpdCBoYXNuJiMzOTt0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzPC9lbT4sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS48L3A+XFxuPHA+U2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSYjMzk7bGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbiYjMzk7cyB3aXJpbmcgPGVtPih0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKTwvZW0+IGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UmIzM5O2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQmIzM5O3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLjwvcD5cXG48cD5BcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UmIzM5O2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2g0PlxcbjxwPlRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCA8Y29kZT5qYWR1bTwvY29kZT4gZWFybGllciwgd2UmIzM5O2xsIGluc3RhbGwgdGhlIDxjb2RlPnRhdW51czwvY29kZT4gQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgdGF1bnVzIC1nXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBDTEkgaXMgdGVyc2UgaW4gYm90aCBpdHMgaW5wdXRzIGFuZCBpdHMgb3V0cHV0cy4gSWYgeW91IHJ1biBpdCB3aXRob3V0IGFueSBhcmd1bWVudHMgaXQmIzM5O2xsIHByaW50IG91dCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGlmIHlvdSB3YW50IHRvIHBlcnNpc3QgaXQgeW91IHNob3VsZCBwcm92aWRlIHRoZSA8Y29kZT4tLW91dHB1dDwvY29kZT4gZmxhZy4gSW4gdHlwaWNhbCA8YSBocmVmPVxcXCJodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxcIj5jb252ZW50aW9uLW92ZXItY29uZmlndXJhdGlvbjwvYT4gZmFzaGlvbiwgdGhlIENMSSB3aWxsIGRlZmF1bHQgdG8gaW5mZXJyaW5nIHlvdXIgdmlld3MgYXJlIGxvY2F0ZWQgaW4gPGNvZGU+LmJpbi92aWV3czwvY29kZT4gYW5kIHRoYXQgeW91IHdhbnQgdGhlIHdpcmluZyBtb2R1bGUgdG8gYmUgcGxhY2VkIGluIDxjb2RlPi5iaW4vd2lyaW5nLmpzPC9jb2RlPiwgYnV0IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBjaGFuZ2UgdGhhdCBpZiBpdCBkb2VzbiYjMzk7dCBtZWV0IHlvdXIgbmVlZHMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dFxcbjwvY29kZT48L3ByZT5cXG48cD5BdCB0aGlzIHBvaW50IGluIG91ciBleGFtcGxlLCB0aGUgQ0xJIHNob3VsZCBjcmVhdGUgYSA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4gZmlsZSB3aXRoIHRoZSBjb250ZW50cyBkZXRhaWxlZCBiZWxvdy4gQXMgeW91IGNhbiBzZWUsIGV2ZW4gaWYgPGNvZGU+dGF1bnVzPC9jb2RlPiBpcyBhbiBhdXRvbWF0ZWQgY29kZS1nZW5lcmF0aW9uIHRvb2wsIGl0JiMzOTtzIG91dHB1dCBpcyBhcyBodW1hbiByZWFkYWJsZSBhcyBhbnkgb3RoZXIgbW9kdWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGVtcGxhdGVzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuL3ZpZXdzL2hvbWUvaW5kZXguanMmIzM5OylcXG59O1xcblxcbnZhciBjb250cm9sbGVycyA9IHtcXG59O1xcblxcbnZhciByb3V0ZXMgPSB7XFxuICAmIzM5Oy8mIzM5Ozoge1xcbiAgICBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7XFxuICB9XFxufTtcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IHtcXG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxcbiAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgcm91dGVzOiByb3V0ZXNcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5Ob3RlIHRoYXQgdGhlIDxjb2RlPmNvbnRyb2xsZXJzPC9jb2RlPiBvYmplY3QgaXMgZW1wdHkgYmVjYXVzZSB5b3UgaGF2ZW4mIzM5O3QgY3JlYXRlZCBhbnkgPGVtPmNsaWVudC1zaWRlIGNvbnRyb2xsZXJzPC9lbT4geWV0LiBXZSBjcmVhdGVkIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGJ1dCB0aG9zZSBkb24mIzM5O3QgaGF2ZSBhbnkgZWZmZWN0IGluIHRoZSBjbGllbnQtc2lkZSwgYmVzaWRlcyBkZXRlcm1pbmluZyB3aGF0IGdldHMgc2VudCB0byB0aGUgY2xpZW50LjwvcD5cXG48cD5UaGUgQ0xJIGNhbiBiZSBlbnRpcmVseSBpZ25vcmVkLCB5b3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhpcyBmaWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuPC9wPlxcbjxwPkR1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgPGNvZGU+LS13YXRjaDwvY29kZT4gZmxhZywgd2hpY2ggd2lsbCByZWJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIGlmIGEgcmVsZXZhbnQgZmlsZSBjaGFuZ2VzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXQgLS13YXRjaFxcbjwvY29kZT48L3ByZT5cXG48cD5JZiB5b3UmIzM5O3JlIHVzaW5nIEhhcGkgaW5zdGVhZCBvZiBFeHByZXNzLCB5b3UmIzM5O2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSA8Y29kZT5oYXBpaWZ5PC9jb2RlPiB0cmFuc2Zvcm0gc28gdGhhdCByb3V0ZXMgZ2V0IGNvbnZlcnRlZCBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGluZyBtb2R1bGUgdW5kZXJzdGFuZC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0tdHJhbnNmb3JtIGhhcGlpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm93IHRoYXQgeW91IHVuZGVyc3RhbmQgaG93IHRvIHVzZSB0aGUgQ0xJIG9yIGJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIG9uIHlvdXIgb3duLCBib290aW5nIHVwIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgd2lsbCBiZSBhbiBlYXN5IHRoaW5nIHRvIGRvITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImJvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9oND5cXG48cD4uLi4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyXFxcIj5BZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXI8L2g0PlxcbjxwPi4uLi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtdGF1bnVzLWFwaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBBUEk8L2g0PlxcbjxwPi4uLi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2g0PlxcbjxwPi4uLi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvaDE+XFxuPHA+WW91JiMzOTtyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4mIzM5O3Qgc3RvcCB0aGVyZS48L3A+XFxuPHVsPlxcbjxsaT5MZWFybiBtb3JlIGFib3V0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgVGF1bnVzIGhhczwvYT4gdG8gb2ZmZXI8L2xpPlxcbjxsaT5HbyB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPnBlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzPC9hPi4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3ITwvbGk+XFxuPGxpPjxlbT5GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50PC9lbT48dWw+XFxuPGxpPkplcmVteSBLZWl0aCBlbnVuY2lhdGVzIDxhIGhyZWY9XFxcImh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxcIj4mcXVvdDtCZSBwcm9ncmVzc2l2ZSZxdW90OzwvYT48L2xpPlxcbjxsaT5DaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciA8YSBocmVmPVxcXCJodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcXCI+JnF1b3Q7UHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyA8YSBocmVmPVxcXCJodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxcIj4mcXVvdDtQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXImcXVvdDs8L2E+PC9saT5cXG48bGk+SSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+JnF1b3Q7U3RvcCBCcmVha2luZyB0aGUgV2ViJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9yYXVjaGcuY29tLzIwMTQvNy1wcmluY2lwbGVzLW9mLXJpY2gtd2ViLWFwcGxpY2F0aW9ucy9cXFwiPiZxdW90OzcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnMmcXVvdDs8L2E+PC9saT5cXG48bGk+QWFyb24gR3VzdGFmc29uIHdyaXRlcyA8YSBocmVmPVxcXCJodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcXCI+JnF1b3Q7VW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudCZxdW90OzwvYT48L2xpPlxcbjxsaT5PcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIDxhIGhyZWY9XFxcImh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2UmcXVvdDs8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlNpZnQgdGhyb3VnaCB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXM8L2E+LiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJiMzOTt0IHRob3VnaHQgb2YhPC9saT5cXG48L3VsPlxcbjxwPkFsc28sIGdldCBpbnZvbHZlZCE8L3A+XFxuPHVsPlxcbjxsaT5Gb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW8vcHVsbHNcXFwiPnNlbmQgc29tZSBwdWxsIHJlcXVlc3RzPC9hPiB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyE8L2xpPlxcbjxsaT5TZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxcIj5wbGVhc2UgY3JlYXRlIGFuIGlzc3VlPC9hPiE8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBHZXR0aW5nIFN0YXJ0ZWRcXG5cXG4gICAgVGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQncyBfdXAgdG8geW91IGhvdyB0byB1c2UgaXRfLiBJbiBmYWN0LCBpdCBtaWdodCBiZSBhIGdvb2QgaWRlYSBmb3IgeW91IHRvICoqc2V0IHVwIGp1c3QgdGhlIHNlcnZlci1zaWRlIGFzcGVjdCBmaXJzdCoqLCBhcyB0aGF0J2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LlxcblxcbiAgICAjIFRhYmxlIG9mIENvbnRlbnRzXFxuXFxuICAgIC0gW0hvdyBpdCB3b3Jrc10oI2hvdy1pdC13b3JrcylcXG4gICAgLSBbSW5zdGFsbGluZyBUYXVudXNdKCNpbnN0YWxsaW5nLXRhdW51cylcXG4gICAgLSBbU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVdKCNzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZSlcXG4gICAgICAtIFtDcmVhdGluZyBhIGxheW91dF0oI2NyZWF0aW5nLWEtbGF5b3V0KVxcbiAgICAgIC0gW1lvdXIgZmlyc3Qgcm91dGVdKCN5b3VyLWZpcnN0LXJvdXRlKVxcbiAgICAgIC0gW1VzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZV0oI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZSlcXG4gICAgICAtIFtUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJdKCN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXIpXFxuICAgIC0gW1RhdW51cyBpbiB0aGUgY2xpZW50XSgjdGF1bnVzLWluLXRoZS1jbGllbnQpXFxuICAgICAgLSBbVXNpbmcgdGhlIFRhdW51cyBDTEldKCN1c2luZy10aGUtdGF1bnVzLWNsaSlcXG4gICAgICAtIFtCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJdKCNib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXIpXFxuICAgICAgLSBbQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXSgjYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyKVxcbiAgICAgIC0gW1VzaW5nIHRoZSBUYXVudXMgQVBJXSgjdXNpbmctdGhlLXRhdW51cy1hcGkpXFxuICAgICAgLSBbQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmddKCNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZylcXG4gICAgLSBbVGhlIHNreSBpcyB0aGUgbGltaXQhXSgjdGhlLXNreS1pcy10aGUtbGltaXQtKVxcblxcbiAgICAjIEhvdyBpdCB3b3Jrc1xcblxcbiAgICBUYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgKipwcm92ZW4qKiBzZXQgb2YgcnVsZXMuXFxuXFxuICAgIC0gRGVmaW5lIGEgYGZ1bmN0aW9uKG1vZGVsKWAgZm9yIGVhY2ggeW91ciB2aWV3c1xcbiAgICAtIFB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBEZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uXFxuICAgIC0gUHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBFbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHNcXG4gICAgLSBDcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3NcXG4gICAgLSBDcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXdcXG4gICAgLSBGb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlXFxuICAgIC0gV2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCFcXG4gICAgLSBPbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCAqKmhpamFjayBsaW5rIGNsaWNrcyoqIGFuZCBtYWtlIEFKQVggcmVxdWVzdHMgaW5zdGVhZFxcbiAgICAtIFdoZW4geW91IGdldCB0aGUgSlNPTiBtb2RlbCBiYWNrLCByZW5kZXIgdmlld3Mgb24gdGhlIGNsaWVudC1zaWRlXFxuICAgIC0gSWYgdGhlIGBoaXN0b3J5YCBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiAqKkRvbid0IGNvbmZ1c2UgeW91ciBodW1hbnMgd2l0aCBvYnNjdXJlIGhhc2ggcm91dGVycyEqKlxcblxcbiAgICBJJ2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgc3RlcHMgeW91IG5lZWQgdG8gdGFrZSBpbiBvcmRlciB0byBtYWtlIHRoaXMgZmxvdyBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgSW5zdGFsbGluZyBUYXVudXNcXG5cXG4gICAgRmlyc3Qgb2ZmLCB5b3UnbGwgbmVlZCB0byBjaG9vc2UgYSBIVFRQIHNlcnZlciBmcmFtZXdvcmsgZm9yIHlvdXIgYXBwbGljYXRpb24uIEF0IHRoZSBtb21lbnQgVGF1bnVzIHN1cHBvcnRzIG9ubHkgYSBjb3VwbGUgb2YgSFRUUCBmcmFtZXdvcmtzLCBidXQgbW9yZSBtYXkgYmUgYWRkZWQgaWYgdGhleSBhcmUgcG9wdWxhciBlbm91Z2guXFxuXFxuICAgIC0gW0V4cHJlc3NdWzZdLCB0aHJvdWdoIFt0YXVudXMtZXhwcmVzc11bMV1cXG4gICAgLSBbSGFwaV1bN10sIHRocm91Z2ggW3RhdW51cy1oYXBpXVsyXSBhbmQgdGhlIFtoYXBpaWZ5XVszXSB0cmFuc2Zvcm1cXG5cXG4gICAgPiBJZiB5b3UncmUgbW9yZSBvZiBhIF9cXFwicnVtbWFnZSB0aHJvdWdoIHNvbWVvbmUgZWxzZSdzIGNvZGVcXFwiXyB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIFtnb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSdzIHNvdXJjZSBjb2RlXVs0XSwgd2hpY2ggdXNlcyB0aGUgW0hhcGldWzddIGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgW3Bvbnlmb28uY29tXVs1XSwgd2hpY2ggaXMgKiphIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2UqKiB1bmRlciB0aGUgW0V4cHJlc3NdWzZdIGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQncyBva2F5IHRvby5cXG5cXG4gICAgT25jZSB5b3UndmUgc2V0dGxlZCBmb3IgZWl0aGVyIFtFeHByZXNzXVs2XSBvciBbSGFwaV1bN10geW91J2xsIGJlIGFibGUgdG8gcHJvY2VlZC4gRm9yIHRoZSBwdXJwb3NlcyBvZiB0aGlzIGd1aWRlLCB3ZSdsbCB1c2UgW0V4cHJlc3NdWzZdLiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVcXG5cXG4gICAgTmF0dXJhbGx5LCB5b3UnbGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSBgbnBtYCB0byBnZXQgc3RhcnRlZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgdGF1bnVzIHRhdW51cy1leHByZXNzIGV4cHJlc3MgLS1zYXZlXFxuICAgIGBgYFxcblxcbiAgICBMZXQncyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZW0gYXMgd2UgZ28gYWxvbmcuIEZpcnN0IG9mIGFsbCwgeW91J2xsIG5lZWQgdGhlIGZhbW91cyBgYXBwLmpzYCBmaWxlLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBhcHAuanNcXG4gICAgYGBgXFxuXFxuICAgIEl0J3MgcHJvYmFibHkgYSBnb29kIGlkZWEgdG8gcHV0IHNvbWV0aGluZyBpbiB5b3VyIGBhcHAuanNgIGZpbGUsIGxldCdzIGRvIHRoYXQgbm93LlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBBbGwgYHRhdW51cy1leHByZXNzYCByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIGBhcHBgLiBZb3Ugc2hvdWxkIG5vdGUgdGhhdCBhbnkgbWlkZGxld2FyZSBhbmQgQVBJIHJvdXRlcyBzaG91bGQgcHJvYmFibHkgY29tZSBiZWZvcmUgdGhlIGB0YXVudXNFeHByZXNzYCBpbnZvY2F0aW9uLiBZb3UnbGwgcHJvYmFibHkgYmUgdXNpbmcgYSBjYXRjaC1hbGwgdmlldyByb3V0ZSB0aGF0IHJlbmRlcnMgYSBfXFxcIk5vdCBGb3VuZFxcXCJfIHZpZXcsIGJsb2NraW5nIGFueSByb3V0aW5nIGJleW9uZCB0aGF0IHJvdXRlLlxcblxcbiAgICBUaGUgYG9wdGlvbnNgIG9iamVjdCBwYXNzZWQgdG8gYHRhdW51c0V4cHJlc3NgIGxldCdzIHlvdSBjb25maWd1cmUgVGF1bnVzLiBJbnN0ZWFkIG9mIGRpc2N1c3NpbmcgZXZlcnkgc2luZ2xlIGNvbmZpZ3VyYXRpb24gb3B0aW9uIHlvdSBjb3VsZCBzZXQgaGVyZSwgbGV0J3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSBfcmVxdWlyZWQgY29uZmlndXJhdGlvbl8uIFRoZXJlJ3MgdHdvIG9wdGlvbnMgdGhhdCB5b3UgbXVzdCBzZXQgaWYgeW91IHdhbnQgeW91ciBUYXVudXMgYXBwbGljYXRpb24gdG8gbWFrZSBhbnkgc2Vuc2UuXFxuXFxuICAgIC0gYGxheW91dGAgc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSBgbW9kZWxgIGFyZ3VtZW50IGFuZCByZXR1cm5zIGFuIGVudGlyZSBIVE1MIGRvY3VtZW50XFxuICAgIC0gYHJvdXRlc2Agc2hvdWxkIGJlIGFuIGFycmF5IG9mIHZpZXcgcm91dGVzXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ3JlYXRpbmcgYSBsYXlvdXRcXG5cXG4gICAgTGV0J3MgYWxzbyBjcmVhdGUgYSBsYXlvdXQuIEZvciB0aGUgcHVycG9zZXMgb2YgbWFraW5nIG91ciB3YXkgdGhyb3VnaCB0aGlzIGd1aWRlLCBpdCdsbCBqdXN0IGJlIGEgcGxhaW4gSmF2YVNjcmlwdCBmdW5jdGlvbi5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggbGF5b3V0LmpzXFxuICAgIGBgYFxcblxcbiAgICBOb3RlIHRoYXQgdGhlIGBwYXJ0aWFsYCBwcm9wZXJ0eSBpbiB0aGUgYG1vZGVsYCBfKGFzIHNlZW4gYmVsb3cpXyBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UnbGwgYmUgdXNpbmcgaGVyZSBlZmZlY3RpdmVseSBtZWFucyBfXFxcInRoZXJlIGlzIG5vIGxheW91dCwganVzdCByZW5kZXIgdGhlIHBhcnRpYWxzXFxcIl8uXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICByZXR1cm4gbW9kZWwucGFydGlhbDtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgaWYgeW91IHdlcmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24sIHRoZW4geW91IHByb2JhYmx5IHdvdWxkbid0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCdzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy5cXG5cXG4gICAgLSBbTXVzdGFjaGVdWzEwXSBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCdzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MXFxuICAgIC0gW0phZGVdWzExXSBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJ3Mgbm8gY2xvc2luZyB0YWdzXFxuICAgIC0gVGhlcmUncyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgW01vemlsbGEncyBOdW5qdWNrc11bMTJdLCBbSGFuZGxlYmFyc11bMTNdLCBhbmQgW0VKU11bMTRdLlxcblxcbiAgICBSZW1lbWJlciB0byBhZGQgdGhlIGBsYXlvdXRgIHVuZGVyIHRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCB0byBgdGF1bnVzRXhwcmVzc2AhXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBZb3UnbGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlcyBzZWN0aW9uXVsxNV0uIElmIHlvdSBkb24ndCBwcm92aWRlIGEgYGxheW91dGAgcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIGA8cHJlPmAgYW5kIGA8Y29kZT5gIHRhZ3MsIHdoaWNoIG1heSBhaWQgeW91IHdoZW4gZ2V0dGluZyBzdGFydGVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFlvdXIgZmlyc3Qgcm91dGVcXG5cXG4gICAgUm91dGVzIG5lZWQgdG8gYmUgcGxhY2VkIGluIGl0cyBvd24gZGVkaWNhdGVkIG1vZHVsZSwgc28gdGhhdCB5b3UgY2FuIHJldXNlIGl0IGxhdGVyIG9uICoqd2hlbiBzZXR0aW5nIHVwIGNsaWVudC1zaWRlIHJvdXRpbmcqKi4gTGV0J3MgY3JlYXRlIHRoYXQgbW9kdWxlIGFuZCBhZGQgYSByb3V0ZSB0byBpdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggcm91dGVzLmpzXFxuICAgIGBgYFxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gW1xcbiAgICAgIHsgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfVxcbiAgICBdO1xcbiAgICBgYGBcXG5cXG4gICAgRWFjaCBpdGVtIGluIHRoZSBleHBvcnRlZCBhcnJheSBpcyBhIHJvdXRlLiBJbiB0aGlzIGNhc2UsIHdlIG9ubHkgaGF2ZSB0aGUgYC9gIHJvdXRlIHdpdGggdGhlIGBob21lL2luZGV4YCBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbiBwYXR0ZXJuXVs4XSwgd2hpY2ggbWFkZSBbUnVieSBvbiBSYWlsc11bOV0gZmFtb3VzLiBfTWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vIV8gQnkgY29udmVudGlvbiwgVGF1bnVzIHdpbGwgYXNzdW1lIHRoYXQgdGhlIGBob21lL2luZGV4YCBhY3Rpb24gdXNlcyB0aGUgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIgYW5kIHJlbmRlcnMgdGhlIGBob21lL2luZGV4YCB2aWV3LiBPZiBjb3Vyc2UsIF9hbGwgb2YgdGhhdCBjYW4gYmUgY2hhbmdlZCB1c2luZyBjb25maWd1cmF0aW9uXy5cXG5cXG4gICAgVGltZSB0byBnbyBiYWNrIHRvIGBhcHAuanNgIGFuZCB1cGRhdGUgdGhlIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vbGF5b3V0JyksXFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL3JvdXRlcycpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgSXQncyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIF8obW9yZSBvbiB0aGF0IGxhdGVyLCBidXQgaXQgZGVmYXVsdHMgdG8gYHt9YClfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZVxcblxcbiAgICBMZXQncyBnbyBhaGVhZCBhbmQgdXNlIEphZGUgYXMgdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBjaG9pY2UgZm9yIG91ciB2aWV3cy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuICAgIGBgYFxcblxcbiAgICBTaW5jZSB3ZSdyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQncyBpdC5cXG5cXG4gICAgYGBgamFkZVxcbiAgICBwIEhlbGxvIFRhdW51cyFcXG4gICAgYGBgXFxuXFxuICAgIE5leHQgeW91J2xsIHdhbnQgdG8gY29tcGlsZSB0aGUgdmlldyBpbnRvIGEgZnVuY3Rpb24uIFRvIGRvIHRoYXQgeW91IGNhbiB1c2UgW2phZHVtXVsxNl0sIGEgc3BlY2lhbGl6ZWQgSmFkZSBjb21waWxlciB0aGF0IHBsYXlzIHdlbGwgd2l0aCBUYXVudXMgYnkgYmVpbmcgYXdhcmUgb2YgYHJlcXVpcmVgIHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0J3MgaW5zdGFsbCBpdCBnbG9iYWxseSwgZm9yIHRoZSBzYWtlIG9mIHRoaXMgZXhlcmNpc2UgXyh5b3Ugc2hvdWxkIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHlvdSdyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbilfLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCBqYWR1bSAtZ1xcbiAgICBgYGBcXG5cXG4gICAgVG8gY29tcGlsZSBldmVyeSB2aWV3IGluIHRoZSBgdmlld3NgIGRpcmVjdG9yeSBpbnRvIGZ1bmN0aW9ucyB0aGF0IHdvcmsgd2VsbCB3aXRoIFRhdW51cywgeW91IGNhbiB1c2UgdGhlIGNvbW1hbmQgYmVsb3cuIFRoZSBgLS1vdXRwdXRgIGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSBgLmJpbmAgYmVjYXVzZSB0aGF0J3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbl1bMTddIGFwcHJvYWNoLCB5b3UgY291bGQgY2hhbmdlIHRoYXQgaWYgeW91IHdhbnRlZCB0by5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbiAgICBgYGBcXG5cXG4gICAgQ29uZ3JhdHVsYXRpb25zISBUYXVudXMgaXMgbm93IG9wZXJhdGlvbmFsLiBBbGwgdGhhdCdzIGxlZnQgaXMgZm9yIHlvdSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGFuZCB2aXNpdCBpdCBvbiBwb3J0IGAzMDAwYC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBvcGVuIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJcXG5cXG4gICAgQ29udHJvbGxlcnMgYXJlIGluZGVlZCBvcHRpb25hbCwgYnV0IGFuIGFwcGxpY2F0aW9uIHRoYXQgcmVuZGVycyBldmVyeSB2aWV3IHVzaW5nIHRoZSBzYW1lIG1vZGVsIHdvbid0IGdldCB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCdzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSBgaG9tZS92aWV3YCBhY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGNvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiBfU3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj9fIFRoZSBzaWduYXR1cmUgZm9yIHRoZSBjb250cm9sbGVyIGlzIHRoZSBzYW1lIHNpZ25hdHVyZSBhcyB0aGF0IG9mIGFueSBvdGhlciBtaWRkbGV3YXJlIHBhc3NlZCB0byBbRXhwcmVzc11bNl0gXyhvciBhbnkgcm91dGUgaGFuZGxlciBwYXNzZWQgdG8gW0hhcGldWzddIGluIHRoZSBjYXNlIG9mIGB0YXVudXMtaGFwaWApXy5cXG5cXG4gICAgQXMgeW91IG1heSBoYXZlIG5vdGljZWQgaW4gdGhlIGV4YW1wbGVzIHNvIGZhciwgeW91IGhhdmVuJ3QgZXZlbiBzZXQgYSBkb2N1bWVudCB0aXRsZSBmb3IgeW91ciBIVE1MIHBhZ2VzISBUdXJucyBvdXQsIHRoZXJlJ3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyBfKHZlcnkgZmV3KV8gdGhhdCBUYXVudXMgaXMgYXdhcmUgb2YuIE9uZSBvZiB0aG9zZSBpcyB0aGUgYHRpdGxlYCBwcm9wZXJ0eSwgYW5kIGl0J2xsIGJlIHVzZWQgdG8gY2hhbmdlIHRoZSBgZG9jdW1lbnQudGl0bGVgIGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0J3Mgbm90IGluIHRoZSBgbW9kZWxgIHByb3BlcnR5IHdvbid0IGJlIHRyYXNtaXR0ZWQgdG8gdGhlIGNsaWVudCwgYW5kIHdpbGwganVzdCBiZSBhY2Nlc3NpYmxlIHRvIHRoZSBsYXlvdXQuXFxuXFxuICAgIEhlcmUgaXMgb3VyIG5ld2ZhbmdsZWQgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIuIEFzIHlvdSdsbCBub3RpY2UsIGl0IGRvZXNuJ3QgZGlzcnVwdCBhbnkgb2YgdGhlIHR5cGljYWwgRXhwcmVzcyBleHBlcmllbmNlLCBidXQgbWVyZWx5IGJ1aWxkcyB1cG9uIGl0LiBXaGVuIGBuZXh0YCBpcyBjYWxsZWQsIHRoZSBUYXVudXMgdmlldy1yZW5kZXJpbmcgaGFuZGxlciB3aWxsIGtpY2sgaW4sIGFuZCByZW5kZXIgdGhlIHZpZXcgdXNpbmcgdGhlIGluZm9ybWF0aW9uIHRoYXQgd2FzIGFzc2lnbmVkIHRvIGByZXMudmlld01vZGVsYC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgICAgIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgICAgICBtb2RlbDoge1xcbiAgICAgICAgICB0aXRsZTogJ1dlbGNvbWUgSG9tZSwgVGF1bnVzISdcXG4gICAgICAgIH1cXG4gICAgICB9O1xcbiAgICAgIG5leHQoKTtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgcmVseWluZyBvbiB0aGUgY2xpZW50LXNpZGUgY2hhbmdlcyB0byB5b3VyIHBhZ2UgaW4gb3JkZXIgdG8gc2V0IHRoZSB2aWV3IHRpdGxlIF93b3VsZG4ndCBiZSBwcm9ncmVzc2l2ZV8sIGFuZCB0aHVzIFtpdCB3b3VsZCBiZSByZWFsbHksIF9yZWFsbHlfIGJhZF1bMTddLiBXZSBzaG91bGQgdXBkYXRlIHRoZSBsYXlvdXQgdG8gdXNlIHdoYXRldmVyIGB0aXRsZWAgaGFzIGJlZW4gcGFzc2VkIHRvIHRoZSBtb2RlbC4gSW4gZmFjdCwgbGV0J3MgZ28gYmFjayB0byB0aGUgZHJhd2luZyBib2FyZCBhbmQgbWFrZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIHRlbXBsYXRlISBUaGUgYCE9YCBzeW50YXggbWVhbnMgdGhhdCB3aGF0ZXZlciBpcyBpbiB0aGUgdmFsdWUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgd29uJ3QgYmUgZXNjYXBlZC4gVGhhdCdzIG9rYXkgYmVjYXVzZSBgcGFydGlhbGAgaXMgYSB2aWV3IHdoZXJlIEphZGUgZXNjYXBlZCBhbnl0aGluZyB0aGF0IG5lZWRlZCBlc2NhcGluZywgYnV0IHdlIHdvdWxkbid0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhXFxuXFxuICAgIGBgYGphZGVcXG4gICAgdGl0bGU9bW9kZWwudGl0bGVcXG4gICAgbWFpbiE9cGFydGlhbFxcbiAgICBgYGBcXG5cXG4gICAgQnkgdGhlIHdheSwgZGlkIHlvdSBrbm93IHRoYXQgYDxodG1sPmAsIGA8aGVhZD5gLCBhbmQgYDxib2R5PmAgYXJlIGFsbCBvcHRpb25hbCBpbiBIVE1MIDUsIGFuZCB0aGF0IHlvdSBjYW4gc2FmZWx5IG9taXQgdGhlbSBpbiB5b3VyIEhUTUw/IE9mIGNvdXJzZSwgcmVuZGVyaW5nIGVuZ2luZXMgd2lsbCBzdGlsbCBpbnNlcnQgdGhvc2UgZWxlbWVudHMgYXV0b21hdGljYWxseSBpbnRvIHRoZSBET00gZm9yIHlvdSEgX0hvdyBjb29sIGlzIHRoYXQ/X1xcblxcbiAgICBUaGF0J3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUncyBub3RoaW5nIHN0b3BwaW5nIHlvdSBmcm9tIGFkZGluZyBkYXRhYmFzZSBjYWxscyB0byBmZXRjaCBiaXRzIGFuZCBwaWVjZXMgb2YgdGhlIG1vZGVsIGJlZm9yZSBpbnZva2luZyBgbmV4dGAgdG8gcmVuZGVyIHRoZSB2aWV3LlxcblxcbiAgICBUaGVyZSdzIGFsc28gdGhlIGNsaWVudC1zaWRlIGFzcGVjdCBvZiBzZXR0aW5nIHVwIFRhdW51cy4gTGV0J3Mgc2V0IGl0IHVwIGFuZCBzZWUgaG93IGl0IG9wZW5zIHVwIG91ciBwb3NzaWJpbGl0aWVzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRhdW51cyBpbiB0aGUgY2xpZW50XFxuXFxuICAgIFlvdSBhbHJlYWR5IGtub3cgaG93IHRvIHNldCB1cCB0aGUgYmFzaWNzIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmcsIGFuZCB5b3Uga25vdyB0aGF0IHlvdSBzaG91bGQgW2NoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSB0byBnZXQgYSBtb3JlIHRob3JvdWdoIHVuZGVyc3RhbmRpbmcgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2Ugb24gVGF1bnVzLCBhbmQgd2hhdCBpdCBlbmFibGVzIHlvdSB0byBkby5cXG5cXG4gICAgVGhlIHdheSBUYXVudXMgd29ya3Mgb24gdGhlIGNsaWVudC1zaWRlIGlzIHNvIHRoYXQgb25jZSB5b3Ugc2V0IGl0IHVwLCBpdCB3aWxsIGhpamFjayBsaW5rIGNsaWNrcyBhbmQgdXNlIEFKQVggdG8gZmV0Y2ggbW9kZWxzIGFuZCByZW5kZXIgdGhvc2Ugdmlld3MgaW4gdGhlIGNsaWVudC4gSWYgdGhlIEphdmFTY3JpcHQgY29kZSBmYWlscyB0byBsb2FkLCBfb3IgaWYgaXQgaGFzbid0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzXywgdGhlIHJlZ3VsYXIgbGluayB3b3VsZCBiZSBmb2xsb3dlZCBpbnN0ZWFkIGFuZCBubyBoYXJtIHdvdWxkIGJlIHVubGVhc2hlZCB1cG9uIHRoZSBodW1hbiwgZXhjZXB0IHRoZXkgd291bGQgZ2V0IGEgc2xpZ2h0bHkgbGVzcyBmYW5jeSBleHBlcmllbmNlLlxcblxcbiAgICBTZXR0aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBpbnZvbHZlcyBhIGZldyBkaWZmZXJlbnQgc3RlcHMuIEZpcnN0bHksIHdlJ2xsIGhhdmUgdG8gY29tcGlsZSB0aGUgYXBwbGljYXRpb24ncyB3aXJpbmcgXyh0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKV8gaW50byBzb21ldGhpbmcgdGhlIGJyb3dzZXIgdW5kZXJzdGFuZHMuIFRoZW4sIHlvdSdsbCBoYXZlIHRvIG1vdW50IFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUsIHBhc3NpbmcgdGhlIHdpcmluZyBzbyB0aGF0IGl0IGtub3dzIHdoaWNoIHJvdXRlcyBpdCBzaG91bGQgcmVzcG9uZCB0bywgYW5kIHdoaWNoIG90aGVycyBpdCBzaG91bGQgbWVyZWx5IGlnbm9yZS4gT25jZSB0aGF0J3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLlxcblxcbiAgICBBcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UnbGwgbGVhcm4sIHdpbGwgYWxzbyBsZXQgeW91IHJlbmRlciBwYXJ0aWFsIHZpZXdzIHVzaW5nIHRoZSBwb3dlcmZ1bCBUYXVudXMgZW5naW5lLCBsaXN0ZW4gZm9yIGV2ZW50cyB0aGF0IG1heSBvY2N1ciBhdCBrZXkgc3RhZ2VzIG9mIHRoZSB2aWV3LXJlbmRlcmluZyBwcm9jZXNzLCBhbmQgZXZlbiBpbnRlcmNlcHQgQUpBWCByZXF1ZXN0cyBibG9ja2luZyB0aGVtIGJlZm9yZSB0aGV5IGV2ZXIgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBUYXVudXMgQ0xJXFxuXFxuICAgIFRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbid0IGhhdmUgdG8gYHJlcXVpcmVgIGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCBgamFkdW1gIGVhcmxpZXIsIHdlJ2xsIGluc3RhbGwgdGhlIGB0YXVudXNgIENMSSBnbG9iYWxseSBmb3IgdGhlIHNha2Ugb2YgZXhlcmNpc2luZywgYnV0IHdlIHVuZGVyc3RhbmQgdGhhdCByZWx5aW5nIG9uIGdsb2JhbGx5IGluc3RhbGxlZCBtb2R1bGVzIGlzIGluc3VmZmljaWVudCBmb3IgcHJvZHVjdGlvbi1ncmFkZSBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIHRhdW51cyAtZ1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIENMSSBpcyB0ZXJzZSBpbiBib3RoIGl0cyBpbnB1dHMgYW5kIGl0cyBvdXRwdXRzLiBJZiB5b3UgcnVuIGl0IHdpdGhvdXQgYW55IGFyZ3VtZW50cyBpdCdsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgYC0tb3V0cHV0YCBmbGFnLiBJbiB0eXBpY2FsIFtjb252ZW50aW9uLW92ZXItY29uZmlndXJhdGlvbl1bOF0gZmFzaGlvbiwgdGhlIENMSSB3aWxsIGRlZmF1bHQgdG8gaW5mZXJyaW5nIHlvdXIgdmlld3MgYXJlIGxvY2F0ZWQgaW4gYC5iaW4vdmlld3NgIGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiBgLmJpbi93aXJpbmcuanNgLCBidXQgeW91J2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24ndCBtZWV0IHlvdXIgbmVlZHMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dFxcbiAgICBgYGBcXG5cXG4gICAgQXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgYC5iaW4vd2lyaW5nLmpzYCBmaWxlIHdpdGggdGhlIGNvbnRlbnRzIGRldGFpbGVkIGJlbG93LiBBcyB5b3UgY2FuIHNlZSwgZXZlbiBpZiBgdGF1bnVzYCBpcyBhbiBhdXRvbWF0ZWQgY29kZS1nZW5lcmF0aW9uIHRvb2wsIGl0J3Mgb3V0cHV0IGlzIGFzIGh1bWFuIHJlYWRhYmxlIGFzIGFueSBvdGhlciBtb2R1bGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRlbXBsYXRlcyA9IHtcXG4gICAgICAnaG9tZS9pbmRleCc6IHJlcXVpcmUoJy4vdmlld3MvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciBjb250cm9sbGVycyA9IHtcXG4gICAgfTtcXG5cXG4gICAgdmFyIHJvdXRlcyA9IHtcXG4gICAgICAnLyc6IHtcXG4gICAgICAgIGFjdGlvbjogJ2hvbWUvaW5kZXgnXFxuICAgICAgfVxcbiAgICB9O1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcXG4gICAgICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gICAgICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICAgICAgcm91dGVzOiByb3V0ZXNcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYGNvbnRyb2xsZXJzYCBvYmplY3QgaXMgZW1wdHkgYmVjYXVzZSB5b3UgaGF2ZW4ndCBjcmVhdGVkIGFueSBfY2xpZW50LXNpZGUgY29udHJvbGxlcnNfIHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJ3QgaGF2ZSBhbnkgZWZmZWN0IGluIHRoZSBjbGllbnQtc2lkZSwgYmVzaWRlcyBkZXRlcm1pbmluZyB3aGF0IGdldHMgc2VudCB0byB0aGUgY2xpZW50LlxcblxcbiAgICBUaGUgQ0xJIGNhbiBiZSBlbnRpcmVseSBpZ25vcmVkLCB5b3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhpcyBmaWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuXFxuXFxuICAgIER1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgYC0td2F0Y2hgIGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG4gICAgYGBgXFxuXFxuICAgIElmIHlvdSdyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91J2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSBgaGFwaWlmeWAgdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuICAgIGBgYFxcblxcbiAgICBOb3cgdGhhdCB5b3UgdW5kZXJzdGFuZCBob3cgdG8gdXNlIHRoZSBDTEkgb3IgYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgb24geW91ciBvd24sIGJvb3RpbmcgdXAgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSB3aWxsIGJlIGFuIGVhc3kgdGhpbmcgdG8gZG8hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXFxuXFxuICAgIC4uLi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBBZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJcXG5cXG4gICAgLi4uLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBUYXVudXMgQVBJXFxuXFxuICAgIC4uLi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDYWNoaW5nIGFuZCBQcmVmZXRjaGluZ1xcblxcbiAgICAuLi4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGhlIHNreSBpcyB0aGUgbGltaXQhXFxuXFxuICAgIFlvdSdyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4ndCBzdG9wIHRoZXJlLlxcblxcbiAgICAtIExlYXJuIG1vcmUgYWJvdXQgW3RoZSBBUEkgVGF1bnVzIGhhc11bMThdIHRvIG9mZmVyXFxuICAgIC0gR28gdGhyb3VnaCB0aGUgW3BlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzXVsyNV0uIFlvdSBtYXkgbGVhcm4gc29tZXRoaW5nIG5ldyFcXG4gICAgLSBfRmFtaWxpYXJpemUgeW91cnNlbGYgd2l0aCB0aGUgd2F5cyBvZiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudF9cXG4gICAgICAtIEplcmVteSBLZWl0aCBlbnVuY2lhdGVzIFtcXFwiQmUgcHJvZ3Jlc3NpdmVcXFwiXVsyMF1cXG4gICAgICAtIENocmlzdGlhbiBIZWlsbWFubiBhZHZvY2F0ZXMgZm9yIFtcXFwiUHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50XFxcIl1bMjZdXFxuICAgICAgLSBKYWtlIEFyY2hpYmFsZCBleHBsYWlucyBob3cgW1xcXCJQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXJcXFwiXVsyMl1cXG4gICAgICAtIEkgYmxvZ2dlZCBhYm91dCBob3cgd2Ugc2hvdWxkIFtcXFwiU3RvcCBCcmVha2luZyB0aGUgV2ViXFxcIl1bMTddXFxuICAgICAgLSBHdWlsbGVybW8gUmF1Y2ggYXJndWVzIGZvciBbXFxcIjcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnNcXFwiXVsyNF1cXG4gICAgICAtIEFhcm9uIEd1c3RhZnNvbiB3cml0ZXMgW1xcXCJVbmRlcnN0YW5kaW5nIFByb2dyZXNzaXZlIEVuaGFuY2VtZW50XFxcIl1bMjFdXFxuICAgICAgLSBPcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIFtcXFwiUHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgZm9yIGZhdWx0IHRvbGVyYW5jZVxcXCJdWzIzXVxcbiAgICAtIFNpZnQgdGhyb3VnaCB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlc11bMTVdLiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJ3QgdGhvdWdodCBvZiFcXG5cXG4gICAgQWxzbywgZ2V0IGludm9sdmVkIVxcblxcbiAgICAtIEZvcmsgdGhpcyByZXBvc2l0b3J5IGFuZCBbc2VuZCBzb21lIHB1bGwgcmVxdWVzdHNdWzE5XSB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyFcXG4gICAgLSBTZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCBbcGxlYXNlIGNyZWF0ZSBhbiBpc3N1ZV1bMjddIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICBbMV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzJdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFszXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vXFxuICAgIFs2XTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzddOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbOF06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG4gICAgWzldOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1J1Ynlfb25fUmFpbHNcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXG4gICAgWzExXTogaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxuICAgIFsxMl06IGh0dHA6Ly9tb3ppbGxhLmdpdGh1Yi5pby9udW5qdWNrcy9cXG4gICAgWzEzXTogaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxuICAgIFsxNF06IGh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxuICAgIFsxNV06IC9jb21wbGVtZW50c1xcbiAgICBbMTZdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvamFkdW1cXG4gICAgWzE3XTogaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcbiAgICBbMThdOiAvYXBpXFxuICAgIFsxOV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvL3B1bGxzXFxuICAgIFsyMF06IGh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxuICAgIFsyMV06IGh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxuICAgIFsyMl06IGh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXG4gICAgWzIzXTogaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcbiAgICBbMjRdOiBodHRwOi8vcmF1Y2hnLmNvbS8yMDE0LzctcHJpbmNpcGxlcy1vZi1yaWNoLXdlYi1hcHBsaWNhdGlvbnMvXFxuICAgIFsyNV06IC9wZXJmb3JtYW5jZVxcbiAgICBbMjZdOiBodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcbiAgICBbMjddOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG5vdEZvdW5kKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJOb3QgRm91bmRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUaGVyZSBkb2Vzbid0IHNlZW0gdG8gYmUgYW55dGhpbmcgaGVyZSB5ZXQuIElmIHlvdSBiZWxpZXZlIHRoaXMgdG8gYmUgYSBtaXN0YWtlLCBwbGVhc2UgbGV0IHVzIGtub3chXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3A+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcImh0dHBzOi8vdHdpdHRlci5jb20vbnpnYlxcXCIgdGFyZ2V0PVxcXCJfYmxhbmtcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIiZtZGFzaDsgQG56Z2JcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJoMSBOb3QgRm91bmRcXG5cXG5wIFRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcXG5wXFxuICBhKGhyZWY9J2h0dHBzOi8vdHdpdHRlci5jb20vbnpnYicsIHRhcmdldD0nX2JsYW5rJykgJm1kYXNoOyBAbnpnYlxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsYXlvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQsIG1vZGVsLCBwYXJ0aWFsKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjwhRE9DVFlQRSBodG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGh0bWwgbGFuZz1cXFwiZW5cXFwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cXFwiaHR0cDovL3NjaGVtYS5vcmcvQmxvZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx0aXRsZT5cIiArIChqYWRlLmVzY2FwZShudWxsID09IChqYWRlX2ludGVycCA9IG1vZGVsLnRpdGxlKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC90aXRsZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGNoYXJzZXQ9XFxcInV0Zi04XFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic2hvcnRjdXQgaWNvblxcXCIgaHJlZj1cXFwiL2Zhdmljb24uaWNvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGh0dHAtZXF1aXY9XFxcIlgtVUEtQ29tcGF0aWJsZVxcXCIgY29udGVudD1cXFwiSUU9ZWRnZSxjaHJvbWU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBuYW1lPVxcXCJ2aWV3cG9ydFxcXCIgY29udGVudD1cXFwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTFcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzdHlsZXNoZWV0XFxcIiB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCIgaHJlZj1cXFwiL2Nzcy9hbGwuY3NzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCJodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT1VbmljYStPbmU6NDAwfFBsYXlmYWlyK0Rpc3BsYXk6NzAwfE1lZ3JpbTo3MDB8RmF1bmErT25lOjQwMGl0YWxpYyw0MDAsNzAwXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaGVhZD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8Ym9keSBpZD1cXFwidG9wXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZGVyPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIiBhcmlhLWxhYmVsPVxcXCJHbyB0byBob21lXFxcIiBjbGFzcz1cXFwibHktdGl0bGVcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUYXVudXNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgyIGNsYXNzPVxcXCJseS1zdWJoZWFkaW5nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gyPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGFzaWRlPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxuYXYgY2xhc3M9XFxcIm52LWNvbnRhaW5lclxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHVsIGNsYXNzPVxcXCJudi1pdGVtc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQWJvdXRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiR2V0dGluZyBTdGFydGVkXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2FwaVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFQSSBEb2N1bWVudGF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI4LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ29tcGxlbWVudGFyeSBNb2R1bGVzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMwLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3NvdXJjZS1jb2RlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiU291cmNlIENvZGVcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3VsPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9uYXY+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2FzaWRlPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtYWluIGlkPVxcXCJhcHBsaWNhdGlvbi1yb290XFxcIiBkYXRhLXRhdW51cz1cXFwibW9kZWxcXFwiPlwiICsgKG51bGwgPT0gKGphZGVfaW50ZXJwID0gcGFydGlhbCkgPyBcIlwiIDogamFkZV9pbnRlcnApKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9tYWluPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzY3JpcHQgc3JjPVxcXCIvanMvYWxsLmpzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2NyaXB0PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9ib2R5PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9odG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQsXCJtb2RlbFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgubW9kZWw6dHlwZW9mIG1vZGVsIT09XCJ1bmRlZmluZWRcIj9tb2RlbDp1bmRlZmluZWQsXCJwYXJ0aWFsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5wYXJ0aWFsOnR5cGVvZiBwYXJ0aWFsIT09XCJ1bmRlZmluZWRcIj9wYXJ0aWFsOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwiZG9jdHlwZSBodG1sXFxuaHRtbChsYW5nPSdlbicsIGl0ZW1zY29wZSwgaXRlbXR5cGU9J2h0dHA6Ly9zY2hlbWEub3JnL0Jsb2cnKVxcbiAgaGVhZFxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtZXRhKGNoYXJzZXQ9J3V0Zi04JylcXG4gICAgbGluayhyZWw9J3Nob3J0Y3V0IGljb24nLCBocmVmPScvZmF2aWNvbi5pY28nKVxcbiAgICBtZXRhKGh0dHAtZXF1aXY9J1gtVUEtQ29tcGF0aWJsZScsIGNvbnRlbnQ9J0lFPWVkZ2UsY2hyb21lPTEnKVxcbiAgICBtZXRhKG5hbWU9J3ZpZXdwb3J0JywgY29udGVudD0nd2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0nL2Nzcy9hbGwuY3NzJylcXG4gICAgbGluayhyZWw9J3N0eWxlc2hlZXQnLCB0eXBlPSd0ZXh0L2NzcycsIGhyZWY9J2h0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDAnKVxcblxcbiAgYm9keSN0b3BcXG4gICAgaGVhZGVyXFxuICAgICAgaDFcXG4gICAgICAgIGEubHktdGl0bGUoaHJlZj0nLycsIGFyaWEtbGFiZWw9J0dvIHRvIGhvbWUnKSBUYXVudXNcXG4gICAgICBoMi5seS1zdWJoZWFkaW5nIE1pY3JvIElzb21vcnBoaWMgTVZDIEVuZ2luZSBmb3IgTm9kZS5qc1xcblxcbiAgICBhc2lkZVxcbiAgICAgIG5hdi5udi1jb250YWluZXJcXG4gICAgICAgIHVsLm52LWl0ZW1zXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy8nKSBBYm91dFxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvZ2V0dGluZy1zdGFydGVkJykgR2V0dGluZyBTdGFydGVkXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9hcGknKSBBUEkgRG9jdW1lbnRhdGlvblxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvY29tcGxlbWVudHMnKSBDb21wbGVtZW50YXJ5IE1vZHVsZXNcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL3BlcmZvcm1hbmNlJykgUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9zb3VyY2UtY29kZScpIFNvdXJjZSBDb2RlXFxuXFxuICAgIG1haW4jYXBwbGljYXRpb24tcm9vdChkYXRhLXRhdW51cz0nbW9kZWwnKSE9cGFydGlhbFxcbiAgICBzY3JpcHQoc3JjPScvanMvYWxsLmpzJylcXG5cIik7XG59XG59IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGVtcGxhdGVzID0ge1xuICAnZG9jdW1lbnRhdGlvbi9hYm91dCc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzJyksXG4gICdlcnJvci9ub3QtZm91bmQnOiByZXF1aXJlKCcuL3ZpZXdzL2Vycm9yL25vdC1mb3VuZC5qcycpLFxuICAnbGF5b3V0JzogcmVxdWlyZSgnLi92aWV3cy9sYXlvdXQuanMnKVxufTtcblxudmFyIGNvbnRyb2xsZXJzID0ge1xufTtcblxudmFyIHJvdXRlcyA9IHtcbiAgJy8nOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hYm91dCdcbiAgfSxcbiAgJy9nZXR0aW5nLXN0YXJ0ZWQnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQnXG4gIH0sXG4gICcvYXBpJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vYXBpJ1xuICB9LFxuICAnL2NvbXBsZW1lbnRzJzoge1xuICAgIGFjdGlvbjogJ2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMnXG4gIH0sXG4gICcvcGVyZm9ybWFuY2UnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZSdcbiAgfSxcbiAgJy9zb3VyY2UtY29kZSc6IHtcbiAgICBpZ25vcmU6IHRydWVcbiAgfSxcbiAgJy8qJzoge1xuICAgIGFjdGlvbjogJ2Vycm9yL25vdC1mb3VuZCdcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXG4gIHJvdXRlczogcm91dGVzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBpbXBvcnQgdGhlIHRhdW51cyBtb2R1bGVcbnZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcblxuLy8gaW1wb3J0IHRoZSB3aXJpbmcgbW9kdWxlIGV4cG9ydGVkIGJ5IFRhdW51c1xudmFyIHdpcmluZyA9IHJlcXVpcmUoJy4uLy4uLy5iaW4vd2lyaW5nJyk7XG5cbi8vIGdldCB0aGUgPG1haW4+IGVsZW1lbnRcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGxpY2F0aW9uLXJvb3QnKTtcblxuLy8gbW91bnQgdGF1bnVzIHNvIGl0IHN0YXJ0cyBpdHMgcm91dGluZyBlbmdpbmVcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuIWZ1bmN0aW9uKGUpe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgZjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P2Y9d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/Zj1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihmPXNlbGYpLGYuamFkZT1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbid1c2Ugc3RyaWN0JztcclxuXHJcbi8qKlxyXG4gKiBNZXJnZSB0d28gYXR0cmlidXRlIG9iamVjdHMgZ2l2aW5nIHByZWNlZGVuY2VcclxuICogdG8gdmFsdWVzIGluIG9iamVjdCBgYmAuIENsYXNzZXMgYXJlIHNwZWNpYWwtY2FzZWRcclxuICogYWxsb3dpbmcgZm9yIGFycmF5cyBhbmQgbWVyZ2luZy9qb2luaW5nIGFwcHJvcHJpYXRlbHlcclxuICogcmVzdWx0aW5nIGluIGEgc3RyaW5nLlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gYVxyXG4gKiBAcGFyYW0ge09iamVjdH0gYlxyXG4gKiBAcmV0dXJuIHtPYmplY3R9IGFcclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5tZXJnZSA9IGZ1bmN0aW9uIG1lcmdlKGEsIGIpIHtcclxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgdmFyIGF0dHJzID0gYVswXTtcclxuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYS5sZW5ndGg7IGkrKykge1xyXG4gICAgICBhdHRycyA9IG1lcmdlKGF0dHJzLCBhW2ldKTtcclxuICAgIH1cclxuICAgIHJldHVybiBhdHRycztcclxuICB9XHJcbiAgdmFyIGFjID0gYVsnY2xhc3MnXTtcclxuICB2YXIgYmMgPSBiWydjbGFzcyddO1xyXG5cclxuICBpZiAoYWMgfHwgYmMpIHtcclxuICAgIGFjID0gYWMgfHwgW107XHJcbiAgICBiYyA9IGJjIHx8IFtdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjKSkgYWMgPSBbYWNdO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGJjKSkgYmMgPSBbYmNdO1xyXG4gICAgYVsnY2xhc3MnXSA9IGFjLmNvbmNhdChiYykuZmlsdGVyKG51bGxzKTtcclxuICB9XHJcblxyXG4gIGZvciAodmFyIGtleSBpbiBiKSB7XHJcbiAgICBpZiAoa2V5ICE9ICdjbGFzcycpIHtcclxuICAgICAgYVtrZXldID0gYltrZXldO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGE7XHJcbn07XHJcblxyXG4vKipcclxuICogRmlsdGVyIG51bGwgYHZhbGBzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtCb29sZWFufVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5mdW5jdGlvbiBudWxscyh2YWwpIHtcclxuICByZXR1cm4gdmFsICE9IG51bGwgJiYgdmFsICE9PSAnJztcclxufVxyXG5cclxuLyoqXHJcbiAqIGpvaW4gYXJyYXkgYXMgY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5qb2luQ2xhc3NlcyA9IGpvaW5DbGFzc2VzO1xyXG5mdW5jdGlvbiBqb2luQ2xhc3Nlcyh2YWwpIHtcclxuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpID8gdmFsLm1hcChqb2luQ2xhc3NlcykuZmlsdGVyKG51bGxzKS5qb2luKCcgJykgOiB2YWw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGNsYXNzZXMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXJyYXl9IGNsYXNzZXNcclxuICogQHBhcmFtIHtBcnJheS48Qm9vbGVhbj59IGVzY2FwZWRcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5jbHMgPSBmdW5jdGlvbiBjbHMoY2xhc3NlcywgZXNjYXBlZCkge1xyXG4gIHZhciBidWYgPSBbXTtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGlmIChlc2NhcGVkICYmIGVzY2FwZWRbaV0pIHtcclxuICAgICAgYnVmLnB1c2goZXhwb3J0cy5lc2NhcGUoam9pbkNsYXNzZXMoW2NsYXNzZXNbaV1dKSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgYnVmLnB1c2goam9pbkNsYXNzZXMoY2xhc3Nlc1tpXSkpO1xyXG4gICAgfVxyXG4gIH1cclxuICB2YXIgdGV4dCA9IGpvaW5DbGFzc2VzKGJ1Zik7XHJcbiAgaWYgKHRleHQubGVuZ3RoKSB7XHJcbiAgICByZXR1cm4gJyBjbGFzcz1cIicgKyB0ZXh0ICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcnO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZS5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGtleVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZXNjYXBlZFxyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IHRlcnNlXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0ciA9IGZ1bmN0aW9uIGF0dHIoa2V5LCB2YWwsIGVzY2FwZWQsIHRlcnNlKSB7XHJcbiAgaWYgKCdib29sZWFuJyA9PSB0eXBlb2YgdmFsIHx8IG51bGwgPT0gdmFsKSB7XHJcbiAgICBpZiAodmFsKSB7XHJcbiAgICAgIHJldHVybiAnICcgKyAodGVyc2UgPyBrZXkgOiBrZXkgKyAnPVwiJyArIGtleSArICdcIicpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuICcnO1xyXG4gICAgfVxyXG4gIH0gZWxzZSBpZiAoMCA9PSBrZXkuaW5kZXhPZignZGF0YScpICYmICdzdHJpbmcnICE9IHR5cGVvZiB2YWwpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyBcIj0nXCIgKyBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2UoLycvZywgJyZhcG9zOycpICsgXCInXCI7XHJcbiAgfSBlbHNlIGlmIChlc2NhcGVkKSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyBleHBvcnRzLmVzY2FwZSh2YWwpICsgJ1wiJztcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJztcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogUmVuZGVyIHRoZSBnaXZlbiBhdHRyaWJ1dGVzIG9iamVjdC5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IG9ialxyXG4gKiBAcGFyYW0ge09iamVjdH0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmF0dHJzID0gZnVuY3Rpb24gYXR0cnMob2JqLCB0ZXJzZSl7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG5cclxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iaik7XHJcblxyXG4gIGlmIChrZXlzLmxlbmd0aCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldXHJcbiAgICAgICAgLCB2YWwgPSBvYmpba2V5XTtcclxuXHJcbiAgICAgIGlmICgnY2xhc3MnID09IGtleSkge1xyXG4gICAgICAgIGlmICh2YWwgPSBqb2luQ2xhc3Nlcyh2YWwpKSB7XHJcbiAgICAgICAgICBidWYucHVzaCgnICcgKyBrZXkgKyAnPVwiJyArIHZhbCArICdcIicpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBidWYucHVzaChleHBvcnRzLmF0dHIoa2V5LCB2YWwsIGZhbHNlLCB0ZXJzZSkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYnVmLmpvaW4oJycpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEVzY2FwZSB0aGUgZ2l2ZW4gc3RyaW5nIG9mIGBodG1sYC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGh0bWxcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLmVzY2FwZSA9IGZ1bmN0aW9uIGVzY2FwZShodG1sKXtcclxuICB2YXIgcmVzdWx0ID0gU3RyaW5nKGh0bWwpXHJcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxyXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxyXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcclxuICBpZiAocmVzdWx0ID09PSAnJyArIGh0bWwpIHJldHVybiBodG1sO1xyXG4gIGVsc2UgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZS10aHJvdyB0aGUgZ2l2ZW4gYGVycmAgaW4gY29udGV4dCB0byB0aGVcclxuICogdGhlIGphZGUgaW4gYGZpbGVuYW1lYCBhdCB0aGUgZ2l2ZW4gYGxpbmVub2AuXHJcbiAqXHJcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZW5hbWVcclxuICogQHBhcmFtIHtTdHJpbmd9IGxpbmVub1xyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLnJldGhyb3cgPSBmdW5jdGlvbiByZXRocm93KGVyciwgZmlsZW5hbWUsIGxpbmVubywgc3RyKXtcclxuICBpZiAoIShlcnIgaW5zdGFuY2VvZiBFcnJvcikpIHRocm93IGVycjtcclxuICBpZiAoKHR5cGVvZiB3aW5kb3cgIT0gJ3VuZGVmaW5lZCcgfHwgIWZpbGVuYW1lKSAmJiAhc3RyKSB7XHJcbiAgICBlcnIubWVzc2FnZSArPSAnIG9uIGxpbmUgJyArIGxpbmVubztcclxuICAgIHRocm93IGVycjtcclxuICB9XHJcbiAgdHJ5IHtcclxuICAgIHN0ciA9IHN0ciB8fCBfZGVyZXFfKCdmcycpLnJlYWRGaWxlU3luYyhmaWxlbmFtZSwgJ3V0ZjgnKVxyXG4gIH0gY2F0Y2ggKGV4KSB7XHJcbiAgICByZXRocm93KGVyciwgbnVsbCwgbGluZW5vKVxyXG4gIH1cclxuICB2YXIgY29udGV4dCA9IDNcclxuICAgICwgbGluZXMgPSBzdHIuc3BsaXQoJ1xcbicpXHJcbiAgICAsIHN0YXJ0ID0gTWF0aC5tYXgobGluZW5vIC0gY29udGV4dCwgMClcclxuICAgICwgZW5kID0gTWF0aC5taW4obGluZXMubGVuZ3RoLCBsaW5lbm8gKyBjb250ZXh0KTtcclxuXHJcbiAgLy8gRXJyb3IgY29udGV4dFxyXG4gIHZhciBjb250ZXh0ID0gbGluZXMuc2xpY2Uoc3RhcnQsIGVuZCkubWFwKGZ1bmN0aW9uKGxpbmUsIGkpe1xyXG4gICAgdmFyIGN1cnIgPSBpICsgc3RhcnQgKyAxO1xyXG4gICAgcmV0dXJuIChjdXJyID09IGxpbmVubyA/ICcgID4gJyA6ICcgICAgJylcclxuICAgICAgKyBjdXJyXHJcbiAgICAgICsgJ3wgJ1xyXG4gICAgICArIGxpbmU7XHJcbiAgfSkuam9pbignXFxuJyk7XHJcblxyXG4gIC8vIEFsdGVyIGV4Y2VwdGlvbiBtZXNzYWdlXHJcbiAgZXJyLnBhdGggPSBmaWxlbmFtZTtcclxuICBlcnIubWVzc2FnZSA9IChmaWxlbmFtZSB8fCAnSmFkZScpICsgJzonICsgbGluZW5vXHJcbiAgICArICdcXG4nICsgY29udGV4dCArICdcXG5cXG4nICsgZXJyLm1lc3NhZ2U7XHJcbiAgdGhyb3cgZXJyO1xyXG59O1xyXG5cbn0se1wiZnNcIjoyfV0sMjpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbn0se31dfSx7fSxbMV0pXG4oMSlcbn0pO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJ2phZGUvcnVudGltZScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBwYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4vaXNOYXRpdmUnKTtcbnZhciBtb2Rlcm4gPSAnaGlzdG9yeScgaW4gd2luZG93ICYmICdwdXNoU3RhdGUnIGluIGhpc3Rvcnk7XG5cbi8vIEdvb2dsZSBDaHJvbWUgMzggb24gaU9TIG1ha2VzIHdlaXJkIGNoYW5nZXMgdG8gaGlzdG9yeS5yZXBsYWNlU3RhdGUsIGJyZWFraW5nIGl0XG52YXIgbmF0aXZlUmVwbGFjZSA9IG1vZGVybiAmJiBpc05hdGl2ZSh3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUpO1xuXG5mdW5jdGlvbiBnbyAodXJsLCBvKSB7XG4gIHZhciBvcHRpb25zID0gbyB8fCB7fTtcbiAgdmFyIGNvbnRleHQgPSBvcHRpb25zLmNvbnRleHQgfHwgbnVsbDtcblxuICBpZiAoIW1vZGVybikge1xuICAgIGxvY2F0aW9uLmhyZWYgPSB1cmw7IHJldHVybjtcbiAgfVxuXG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwpO1xuXG4gIGZldGNoZXIuYWJvcnRQZW5kaW5nKCk7XG4gIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogY29udGV4dCwgc291cmNlOiAnaW50ZW50JyB9LCByZXNvbHZlZCk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZWQgKGVyciwgbW9kZWwpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5hdmlnYXRpb24ocm91dGUsIG1vZGVsLCAncHVzaFN0YXRlJyk7XG4gICAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RhcnQgKG1vZGVsKSB7XG4gIHZhciByb3V0ZSA9IHJlcGxhY2VXaXRoKG1vZGVsKTtcbiAgZW1pdHRlci5lbWl0KCdzdGFydCcsIHN0YXRlLmNvbnRhaW5lciwgbW9kZWwpO1xuICBwYXJ0aWFsKHN0YXRlLmNvbnRhaW5lciwgbnVsbCwgbW9kZWwsIHJvdXRlLCB7IHJlbmRlcjogZmFsc2UgfSk7XG4gIHdpbmRvdy5vbnBvcHN0YXRlID0gYmFjaztcbn1cblxuZnVuY3Rpb24gYmFjayAoZSkge1xuICB2YXIgZW1wdHkgPSAhKGUgJiYgZS5zdGF0ZSAmJiBlLnN0YXRlLm1vZGVsKTtcbiAgaWYgKGVtcHR5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBtb2RlbCA9IGUuc3RhdGUubW9kZWw7XG4gIHZhciByb3V0ZSA9IHJlcGxhY2VXaXRoKG1vZGVsKTtcbiAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSk7XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VXaXRoIChtb2RlbCkge1xuICB2YXIgdXJsID0gbG9jYXRpb24ucGF0aG5hbWU7XG4gIHZhciBxdWVyeSA9IG9yRW1wdHkobG9jYXRpb24uc2VhcmNoKSArIG9yRW1wdHkobG9jYXRpb24uaGFzaCk7XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwgKyBxdWVyeSk7XG4gIG5hdmlnYXRpb24ocm91dGUsIG1vZGVsLCAncmVwbGFjZVN0YXRlJyk7XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gb3JFbXB0eSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBuYXZpZ2F0aW9uIChyb3V0ZSwgbW9kZWwsIGRpcmVjdGlvbikge1xuICBzdGF0ZS5tb2RlbCA9IG1vZGVsO1xuICBpZiAobW9kZWwudGl0bGUpIHtcbiAgICBkb2N1bWVudC50aXRsZSA9IG1vZGVsLnRpdGxlO1xuICB9XG4gIGlmIChtb2Rlcm4gJiYgZGlyZWN0aW9uICE9PSAncmVwbGFjZVN0YXRlJyB8fCBuYXRpdmVSZXBsYWNlKSB7XG4gICAgaGlzdG9yeVtkaXJlY3Rpb25dKHsgbW9kZWw6IG1vZGVsIH0sIG1vZGVsLnRpdGxlLCByb3V0ZS51cmwpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzdGFydDogc3RhcnQsXG4gIGdvOiBnb1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIG9uY2UgPSByZXF1aXJlKCcuL29uY2UnKTtcbnZhciByYXcgPSByZXF1aXJlKCcuL3N0b3Jlcy9yYXcnKTtcbnZhciBpZGIgPSByZXF1aXJlKCcuL3N0b3Jlcy9pZGInKTtcbnZhciBzdG9yZXMgPSBbcmF3LCBpZGJdO1xuXG5mdW5jdGlvbiBjbG9uZSAodmFsdWUpIHtcbiAgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTtcbn1cblxuZnVuY3Rpb24gZ2V0ICh1cmwsIGRvbmUpIHtcbiAgdmFyIGkgPSAwO1xuXG4gIGZ1bmN0aW9uIG5leHQgKCkge1xuICAgIHZhciBnb3RPbmNlID0gb25jZShnb3QpO1xuICAgIHZhciBzdG9yZSA9IHN0b3Jlc1tpKytdO1xuICAgIGlmIChzdG9yZSkge1xuICAgICAgc3RvcmUuZ2V0KHVybCwgZ290T25jZSk7XG4gICAgICBzZXRUaW1lb3V0KGdvdE9uY2UsIHN0b3JlID09PSBpZGIgPyAxMDAgOiA1MCk7IC8vIGF0IHdvcnN0LCBzcGVuZCAxNTBtcyBvbiBjYWNoaW5nIGxheWVyc1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKHRydWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdvdCAoZXJyLCBpdGVtKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIG5leHQoKTtcbiAgICAgIH0gZWxzZSBpZiAoaXRlbSAmJiB0eXBlb2YgaXRlbS5leHBpcmVzID09PSAnbnVtYmVyJyAmJiBEYXRlLm5vdygpIDwgaXRlbS5leHBpcmVzKSB7XG4gICAgICAgIGRvbmUoZmFsc2UsIGNsb25lKGl0ZW0uZGF0YSkpOyAvLyBhbHdheXMgcmV0dXJuIGEgdW5pcXVlIGNvcHlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5leHQoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBuZXh0KCk7XG59XG5cbmZ1bmN0aW9uIHNldCAodXJsLCBkYXRhLCBkdXJhdGlvbikge1xuICBpZiAoZHVyYXRpb24gPCAxKSB7IC8vIHNhbml0eVxuICAgIHJldHVybjtcbiAgfVxuICB2YXIgY2xvbmVkID0gY2xvbmUoZGF0YSk7IC8vIGZyZWV6ZSBhIGNvcHkgZm9yIG91ciByZWNvcmRzXG4gIHN0b3Jlcy5mb3JFYWNoKHN0b3JlKTtcbiAgZnVuY3Rpb24gc3RvcmUgKHMpIHtcbiAgICBzLnNldCh1cmwsIHtcbiAgICAgIGRhdGE6IGNsb25lZCxcbiAgICAgIGV4cGlyZXM6IERhdGUubm93KCkgKyBkdXJhdGlvblxuICAgIH0pO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBnZXQ6IGdldCxcbiAgc2V0OiBzZXRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjYWNoZSA9IHJlcXVpcmUoJy4vY2FjaGUnKTtcbnZhciBpZGIgPSByZXF1aXJlKCcuL3N0b3Jlcy9pZGInKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgZGVmYXVsdHMgPSAxNTtcbnZhciBiYXNlbGluZTtcblxuZnVuY3Rpb24gZSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBzZXR1cCAoZHVyYXRpb24sIHJvdXRlKSB7XG4gIGJhc2VsaW5lID0gcGFyc2VEdXJhdGlvbihkdXJhdGlvbik7XG4gIGlmIChiYXNlbGluZSA8IDEpIHtcbiAgICBzdGF0ZS5jYWNoZSA9IGZhbHNlO1xuICAgIHJldHVybjtcbiAgfVxuICBpbnRlcmNlcHRvci5hZGQoaW50ZXJjZXB0KTtcbiAgZW1pdHRlci5vbignZmV0Y2guZG9uZScsIHBlcnNpc3QpO1xuICBzdGF0ZS5jYWNoZSA9IHRydWU7XG59XG5cbmZ1bmN0aW9uIGludGVyY2VwdCAoZSkge1xuICBjYWNoZS5nZXQoZS51cmwsIHJlc3VsdCk7XG5cbiAgZnVuY3Rpb24gcmVzdWx0IChlcnIsIGRhdGEpIHtcbiAgICBpZiAoIWVyciAmJiBkYXRhKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KGRhdGEpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJzZUR1cmF0aW9uICh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT09IHRydWUpIHtcbiAgICByZXR1cm4gYmFzZWxpbmUgfHwgZGVmYXVsdHM7XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3QgKHJvdXRlLCBjb250ZXh0LCBkYXRhKSB7XG4gIGlmICghc3RhdGUuY2FjaGUpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGtleSA9IHJvdXRlLnBhcnRzLnBhdGhuYW1lICsgZShyb3V0ZS5wYXJ0cy5xdWVyeSk7XG4gIHZhciBkID0gcm91dGUuY2FjaGUgIT09IHZvaWQgMCA/IHJvdXRlLmNhY2hlIDogYmFzZWxpbmU7XG4gIGNhY2hlLnNldChrZXksIGRhdGEsIHBhcnNlRHVyYXRpb24oZCkgKiAxMDAwKTtcbn1cblxuZnVuY3Rpb24gcmVhZHkgKGZuKSB7XG4gIGlmIChzdGF0ZS5jYWNoZSkge1xuICAgIGlkYi50ZXN0ZWQoZm4pOyAvLyB3YWl0IG9uIGlkYiBjb21wYXRpYmlsaXR5IHRlc3RzXG4gIH0gZWxzZSB7XG4gICAgZm4oKTsgLy8gY2FjaGluZyBpcyBhIG5vLW9wXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHNldHVwOiBzZXR1cCxcbiAgcGVyc2lzdDogcGVyc2lzdCxcbiAgcmVhZHk6IHJlYWR5XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZW1pdHRlcih7fSwgeyB0aHJvd3M6IGZhbHNlIH0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBhZGQgKGVsZW1lbnQsIHR5cGUsIGZuKSB7XG4gIGlmIChlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZm4pO1xuICB9IGVsc2UgaWYgKGVsZW1lbnQuYXR0YWNoRXZlbnQpIHtcbiAgICBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBmbikpO1xuICB9IGVsc2Uge1xuICAgIGVsZW1lbnRbJ29uJyArIHR5cGVdID0gZm47XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IHdpbmRvdy5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ICA9IGUucHJldmVudERlZmF1bHQgIHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGZuLmNhbGwoZWxlbWVudCwgZSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJy4veGhyJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGxhc3RYaHIgPSB7fTtcblxuZnVuY3Rpb24gZSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBqc29uaWZ5IChyb3V0ZSkge1xuICB2YXIgcGFydHMgPSByb3V0ZS5wYXJ0cztcbiAgdmFyIHFzID0gZShwYXJ0cy5zZWFyY2gpO1xuICB2YXIgcCA9IHFzID8gJyYnIDogJz8nO1xuICByZXR1cm4gcGFydHMucGF0aG5hbWUgKyBxcyArIHAgKyAnanNvbic7XG59XG5cbmZ1bmN0aW9uIGFib3J0IChzb3VyY2UpIHtcbiAgaWYgKGxhc3RYaHJbc291cmNlXSkge1xuICAgIGxhc3RYaHJbc291cmNlXS5hYm9ydCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFib3J0UGVuZGluZyAoKSB7XG4gIE9iamVjdC5rZXlzKGxhc3RYaHIpLmZvckVhY2goYWJvcnQpO1xuICBsYXN0WGhyID0ge307XG59XG5cbmZ1bmN0aW9uIGZldGNoZXIgKHJvdXRlLCBjb250ZXh0LCBkb25lKSB7XG4gIHZhciB1cmwgPSByb3V0ZS51cmw7XG4gIGlmIChsYXN0WGhyW2NvbnRleHQuc291cmNlXSkge1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdLmFib3J0KCk7XG4gICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSBudWxsO1xuICB9XG4gIGludGVyY2VwdG9yLmV4ZWN1dGUocm91dGUsIGFmdGVySW50ZXJjZXB0b3JzKTtcblxuICBmdW5jdGlvbiBhZnRlckludGVyY2VwdG9ycyAoZXJyLCByZXN1bHQpIHtcbiAgICBpZiAoIWVyciAmJiByZXN1bHQuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgZG9uZShudWxsLCByZXN1bHQubW9kZWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLnN0YXJ0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSB4aHIoanNvbmlmeShyb3V0ZSksIG5vdGlmeSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbm90aWZ5IChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBpZiAoZXJyLm1lc3NhZ2UgPT09ICdhYm9ydGVkJykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmFib3J0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5lcnJvcicsIHJvdXRlLCBjb250ZXh0LCBlcnIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmRvbmUnLCByb3V0ZSwgY29udGV4dCwgZGF0YSk7XG4gICAgfVxuICAgIGRvbmUoZXJyLCBkYXRhKTtcbiAgfVxufVxuXG5mZXRjaGVyLmFib3J0UGVuZGluZyA9IGFib3J0UGVuZGluZztcblxubW9kdWxlLmV4cG9ydHMgPSBmZXRjaGVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGxpbmtzID0gcmVxdWlyZSgnLi9saW5rcycpO1xuXG5mdW5jdGlvbiBhdHRhY2ggKCkge1xuICBlbWl0dGVyLm9uKCdzdGFydCcsIGxpbmtzKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF0dGFjaDogYXR0YWNoXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaG9va3MgPSByZXF1aXJlKCcuL2hvb2tzJyk7XG52YXIgcGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xudmFyIG1vdW50ID0gcmVxdWlyZSgnLi9tb3VudCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG5cbmhvb2tzLmF0dGFjaCgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbW91bnQ6IG1vdW50LFxuICBwYXJ0aWFsOiBwYXJ0aWFsLnN0YW5kYWxvbmUsXG4gIG9uOiBlbWl0dGVyLm9uLmJpbmQoZW1pdHRlciksXG4gIG9uY2U6IGVtaXR0ZXIub25jZS5iaW5kKGVtaXR0ZXIpLFxuICBvZmY6IGVtaXR0ZXIub2ZmLmJpbmQoZW1pdHRlciksXG4gIGludGVyY2VwdDogaW50ZXJjZXB0b3IuYWRkLFxuICBuYXZpZ2F0ZTogYWN0aXZhdG9yLmdvLFxuICBzdGF0ZTogc3RhdGUsXG4gIHJvdXRlOiByb3V0ZXJcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhLmVtaXR0ZXInKTtcbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBpbnRlcmNlcHRvcnMgPSBlbWl0dGVyKHsgY291bnQ6IDAgfSwgeyBhc3luYzogdHJ1ZSB9KTtcblxuZnVuY3Rpb24gZ2V0SW50ZXJjZXB0b3JFdmVudCAodXJsLCByb3V0ZSkge1xuICB2YXIgZSA9IHtcbiAgICB1cmw6IHVybCxcbiAgICByb3V0ZTogcm91dGUsXG4gICAgcGFydHM6IHJvdXRlLnBhcnRzLFxuICAgIG1vZGVsOiBudWxsLFxuICAgIGRlZmF1bHRQcmV2ZW50ZWQ6IGZhbHNlLFxuICAgIHByZXZlbnREZWZhdWx0OiBvbmNlKHByZXZlbnREZWZhdWx0KVxuICB9O1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0IChtb2RlbCkge1xuICAgIGUuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgZS5tb2RlbCA9IG1vZGVsO1xuICB9XG5cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGFkZCAoYWN0aW9uLCBmbikge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGZuID0gYWN0aW9uO1xuICAgIGFjdGlvbiA9ICcqJztcbiAgfVxuICBpbnRlcmNlcHRvcnMuY291bnQrKztcbiAgaW50ZXJjZXB0b3JzLm9uKGFjdGlvbiwgZm4pO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlU3luYyAocm91dGUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlLnVybCwgcm91dGUpO1xuXG4gIGludGVyY2VwdG9ycy5lbWl0KCcqJywgZSk7XG4gIGludGVyY2VwdG9ycy5lbWl0KHJvdXRlLmFjdGlvbiwgZSk7XG5cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGUgKHJvdXRlLCBkb25lKSB7XG4gIHZhciBlID0gZ2V0SW50ZXJjZXB0b3JFdmVudChyb3V0ZS51cmwsIHJvdXRlKTtcbiAgaWYgKGludGVyY2VwdG9ycy5jb3VudCA9PT0gMCkgeyAvLyBmYWlsIGZhc3RcbiAgICBlbmQoKTsgcmV0dXJuO1xuICB9XG4gIHZhciBmbiA9IG9uY2UoZW5kKTtcbiAgdmFyIHByZXZlbnREZWZhdWx0QmFzZSA9IGUucHJldmVudERlZmF1bHQ7XG5cbiAgZS5wcmV2ZW50RGVmYXVsdCA9IG9uY2UocHJldmVudERlZmF1bHRFbmRzKTtcblxuICBpbnRlcmNlcHRvcnMuZW1pdCgnKicsIGUpO1xuICBpbnRlcmNlcHRvcnMuZW1pdChyb3V0ZS5hY3Rpb24sIGUpO1xuXG4gIHNldFRpbWVvdXQoZm4sIDIwMCk7IC8vIGF0IHdvcnN0LCBzcGVuZCAyMDBtcyB3YWl0aW5nIG9uIGludGVyY2VwdG9yc1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0RW5kcyAoKSB7XG4gICAgcHJldmVudERlZmF1bHRCYXNlLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgZm4oKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZCAoKSB7XG4gICAgZG9uZShudWxsLCBlKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGQsXG4gIGV4ZWN1dGU6IGV4ZWN1dGVcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8vIHNvdXJjZTogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vamRhbHRvbi81ZTM0ZDg5MDEwNWFjYTQ0Mzk5ZlxuLy8gdGhhbmtzIEBqZGFsdG9uIVxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nOyAvLyB1c2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIGBbW0NsYXNzXV1gIG9mIHZhbHVlc1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7IC8vIHVzZWQgdG8gcmVzb2x2ZSB0aGUgZGVjb21waWxlZCBzb3VyY2Ugb2YgZnVuY3Rpb25zXG52YXIgaG9zdCA9IC9eXFxbb2JqZWN0IC4rP0NvbnN0cnVjdG9yXFxdJC87IC8vIHVzZWQgdG8gZGV0ZWN0IGhvc3QgY29uc3RydWN0b3JzIChTYWZhcmkgPiA0OyByZWFsbHkgdHlwZWQgYXJyYXkgc3BlY2lmaWMpXG5cbi8vIEVzY2FwZSBhbnkgc3BlY2lhbCByZWdleHAgY2hhcmFjdGVycy5cbnZhciBzcGVjaWFscyA9IC9bLiorP14ke30oKXxbXFxdXFwvXFxcXF0vZztcblxuLy8gUmVwbGFjZSBtZW50aW9ucyBvZiBgdG9TdHJpbmdgIHdpdGggYC4qP2AgdG8ga2VlcCB0aGUgdGVtcGxhdGUgZ2VuZXJpYy5cbi8vIFJlcGxhY2UgdGhpbmcgbGlrZSBgZm9yIC4uLmAgdG8gc3VwcG9ydCBlbnZpcm9ubWVudHMsIGxpa2UgUmhpbm8sIHdoaWNoIGFkZCBleHRyYVxuLy8gaW5mbyBzdWNoIGFzIG1ldGhvZCBhcml0eS5cbnZhciBleHRyYXMgPSAvdG9TdHJpbmd8KGZ1bmN0aW9uKS4qPyg/PVxcXFxcXCgpfCBmb3IgLis/KD89XFxcXFxcXSkvZztcblxuLy8gQ29tcGlsZSBhIHJlZ2V4cCB1c2luZyBhIGNvbW1vbiBuYXRpdmUgbWV0aG9kIGFzIGEgdGVtcGxhdGUuXG4vLyBXZSBjaG9zZSBgT2JqZWN0I3RvU3RyaW5nYCBiZWNhdXNlIHRoZXJlJ3MgYSBnb29kIGNoYW5jZSBpdCBpcyBub3QgYmVpbmcgbXVja2VkIHdpdGguXG52YXIgZm5TdHJpbmcgPSBTdHJpbmcodG9TdHJpbmcpLnJlcGxhY2Uoc3BlY2lhbHMsICdcXFxcJCYnKS5yZXBsYWNlKGV4dHJhcywgJyQxLio/Jyk7XG52YXIgcmVOYXRpdmUgPSBuZXcgUmVnRXhwKCdeJyArIGZuU3RyaW5nICsgJyQnKTtcblxuZnVuY3Rpb24gaXNOYXRpdmUgKHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIC8vIFVzZSBgRnVuY3Rpb24jdG9TdHJpbmdgIHRvIGJ5cGFzcyB0aGUgdmFsdWUncyBvd24gYHRvU3RyaW5nYCBtZXRob2RcbiAgICAvLyBhbmQgYXZvaWQgYmVpbmcgZmFrZWQgb3V0LlxuICAgIHJldHVybiByZU5hdGl2ZS50ZXN0KGZuVG9TdHJpbmcuY2FsbCh2YWx1ZSkpO1xuICB9XG5cbiAgLy8gRmFsbGJhY2sgdG8gYSBob3N0IG9iamVjdCBjaGVjayBiZWNhdXNlIHNvbWUgZW52aXJvbm1lbnRzIHdpbGwgcmVwcmVzZW50XG4gIC8vIHRoaW5ncyBsaWtlIHR5cGVkIGFycmF5cyBhcyBET00gbWV0aG9kcyB3aGljaCBtYXkgbm90IGNvbmZvcm0gdG8gdGhlXG4gIC8vIG5vcm1hbCBuYXRpdmUgcGF0dGVybi5cbiAgcmV0dXJuICh2YWx1ZSAmJiB0eXBlID09PSAnb2JqZWN0JyAmJiBob3N0LnRlc3QodG9TdHJpbmcuY2FsbCh2YWx1ZSkpKSB8fCBmYWxzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc05hdGl2ZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBvcmlnaW4gPSBkb2N1bWVudC5sb2NhdGlvbi5vcmlnaW47XG52YXIgbGVmdENsaWNrID0gMTtcbnZhciBwcmVmZXRjaGluZyA9IFtdO1xudmFyIGNsaWNrc09uSG9sZCA9IFtdO1xuXG5mdW5jdGlvbiBsaW5rcyAoKSB7XG4gIGlmIChzdGF0ZS5wcmVmZXRjaCAmJiBzdGF0ZS5jYWNoZSkgeyAvLyBwcmVmZXRjaCB3aXRob3V0IGNhY2hlIG1ha2VzIG5vIHNlbnNlXG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAnbW91c2VvdmVyJywgbWF5YmVQcmVmZXRjaCk7XG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAndG91Y2hzdGFydCcsIG1heWJlUHJlZmV0Y2gpO1xuICB9XG4gIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ2NsaWNrJywgbWF5YmVSZXJvdXRlKTtcbn1cblxuZnVuY3Rpb24gc28gKGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLm9yaWdpbiA9PT0gb3JpZ2luO1xufVxuXG5mdW5jdGlvbiBsZWZ0Q2xpY2tPbkFuY2hvciAoZSwgYW5jaG9yKSB7XG4gIHJldHVybiBhbmNob3IucGF0aG5hbWUgJiYgZS53aGljaCA9PT0gbGVmdENsaWNrICYmICFlLm1ldGFLZXkgJiYgIWUuY3RybEtleTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0T3JBbmNob3IgKGUpIHtcbiAgdmFyIGFuY2hvciA9IGUudGFyZ2V0O1xuICB3aGlsZSAoYW5jaG9yKSB7XG4gICAgaWYgKGFuY2hvci50YWdOYW1lID09PSAnQScpIHtcbiAgICAgIHJldHVybiBhbmNob3I7XG4gICAgfVxuICAgIGFuY2hvciA9IGFuY2hvci5wYXJlbnRFbGVtZW50O1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUmVyb3V0ZSAoZSkge1xuICB2YXIgYW5jaG9yID0gdGFyZ2V0T3JBbmNob3IoZSk7XG4gIGlmIChhbmNob3IgJiYgc28oYW5jaG9yKSAmJiBsZWZ0Q2xpY2tPbkFuY2hvcihlLCBhbmNob3IpKSB7XG4gICAgcmVyb3V0ZShlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUHJlZmV0Y2ggKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikpIHtcbiAgICBwcmVmZXRjaChlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNjcm9sbEludG8gKGlkKSB7XG4gIHZhciBlbGVtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICBpZiAoZWxlbSAmJiBlbGVtLnNjcm9sbEludG9WaWV3KSB7XG4gICAgZWxlbS5zY3JvbGxJbnRvVmlldygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0Um91dGUgKGFuY2hvciwgZmFpbCkge1xuICB2YXIgdXJsID0gYW5jaG9yLnBhdGhuYW1lICsgYW5jaG9yLnNlYXJjaCArIGFuY2hvci5oYXNoO1xuICBpZiAodXJsID09PSBsb2NhdGlvbi5wYXRobmFtZSArIGxvY2F0aW9uLnNlYXJjaCArIGFuY2hvci5oYXNoKSB7XG4gICAgKGZhaWwgfHwgbm9vcCkoKTtcbiAgICByZXR1cm47IC8vIGFuY2hvciBoYXNoLW5hdmlnYXRpb24gb24gc2FtZSBwYWdlIGlnbm9yZXMgcm91dGVyXG4gIH1cbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUuaWdub3JlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gcmVyb3V0ZSAoZSwgYW5jaG9yKSB7XG4gIHZhciByb3V0ZSA9IGdldFJvdXRlKGFuY2hvciwgZmFpbCk7XG4gIGlmICghcm91dGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcmV2ZW50KCk7XG5cbiAgaWYgKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICBjbGlja3NPbkhvbGQucHVzaChhbmNob3IpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGFjdGl2YXRvci5nbyhyb3V0ZS51cmwsIHsgY29udGV4dDogYW5jaG9yIH0pO1xuXG4gIGZ1bmN0aW9uIGZhaWwgKCkge1xuICAgIGlmIChhbmNob3IuaGFzaCA9PT0gbG9jYXRpb24uaGFzaCkge1xuICAgICAgc2Nyb2xsSW50byhhbmNob3IuaGFzaC5zdWJzdHIoMSkpO1xuICAgICAgcHJldmVudCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXZlbnQgKCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IH1cbn1cblxuZnVuY3Rpb24gcHJlZmV0Y2ggKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcmVmZXRjaGluZy5wdXNoKGFuY2hvcik7XG4gIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogYW5jaG9yLCBzb3VyY2U6ICdwcmVmZXRjaCcgfSwgcmVzb2x2ZWQpO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVkIChlcnIsIGRhdGEpIHtcbiAgICBwcmVmZXRjaGluZy5zcGxpY2UocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpLCAxKTtcbiAgICBpZiAoY2xpY2tzT25Ib2xkLmluZGV4T2YoYW5jaG9yKSAhPT0gLTEpIHtcbiAgICAgIGNsaWNrc09uSG9sZC5zcGxpY2UoY2xpY2tzT25Ib2xkLmluZGV4T2YoYW5jaG9yKSwgMSk7XG4gICAgICBhY3RpdmF0b3IuZ28ocm91dGUudXJsLCB7IGNvbnRleHQ6IGFuY2hvciB9KTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBsaW5rcztcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHVuZXNjYXBlID0gcmVxdWlyZSgnLi91bmVzY2FwZScpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBjYWNoaW5nID0gcmVxdWlyZSgnLi9jYWNoaW5nJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIHcgPSB3aW5kb3c7XG52YXIgbW91bnRlZDtcbnZhciBib290ZWQ7XG5cbmZ1bmN0aW9uIG9yRW1wdHkgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24gbW91bnQgKGNvbnRhaW5lciwgd2lyaW5nLCBvcHRpb25zKSB7XG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKG1vdW50ZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhdW51cyBhbHJlYWR5IG1vdW50ZWQhJyk7XG4gIH1cbiAgaWYgKCFjb250YWluZXIgfHwgIWNvbnRhaW5lci50YWdOYW1lKSB7IC8vIG5hw692ZSBpcyBlbm91Z2hcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhbiBhcHBsaWNhdGlvbiByb290IGNvbnRhaW5lciEnKTtcbiAgfVxuXG4gIG1vdW50ZWQgPSB0cnVlO1xuXG4gIHN0YXRlLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcbiAgc3RhdGUuY29udHJvbGxlcnMgPSB3aXJpbmcuY29udHJvbGxlcnM7XG4gIHN0YXRlLnRlbXBsYXRlcyA9IHdpcmluZy50ZW1wbGF0ZXM7XG4gIHN0YXRlLnJvdXRlcyA9IHdpcmluZy5yb3V0ZXM7XG4gIHN0YXRlLnByZWZldGNoID0gISFvLnByZWZldGNoO1xuXG4gIHJvdXRlci5zZXR1cCh3aXJpbmcucm91dGVzKTtcblxuICB2YXIgdXJsID0gbG9jYXRpb24ucGF0aG5hbWU7XG4gIHZhciBxdWVyeSA9IG9yRW1wdHkobG9jYXRpb24uc2VhcmNoKSArIG9yRW1wdHkobG9jYXRpb24uaGFzaCk7XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwgKyBxdWVyeSk7XG5cbiAgY2FjaGluZy5zZXR1cChvLmNhY2hlLCByb3V0ZSk7XG4gIGNhY2hpbmcucmVhZHkoa2lja3N0YXJ0KTtcblxuICBmdW5jdGlvbiBraWNrc3RhcnQgKCkge1xuICAgIGlmICghby5ib290c3RyYXApIHsgby5ib290c3RyYXAgPSAnYXV0byc7IH1cbiAgICBpZiAoby5ib290c3RyYXAgPT09ICdhdXRvJykge1xuICAgICAgYXV0b2Jvb3QoKTtcbiAgICB9IGVsc2UgaWYgKG8uYm9vdHN0cmFwID09PSAnaW5saW5lJykge1xuICAgICAgaW5saW5lYm9vdCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF1dG9ib290ICgpIHtcbiAgICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgc291cmNlOiAnYm9vdCcgfSwgZmV0Y2hlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBmZXRjaGVkIChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZldGNoaW5nIEpTT04gZGF0YSBtb2RlbCBmb3IgZmlyc3QgdmlldyBmYWlsZWQuJyk7XG4gICAgfVxuICAgIGJvb3QoZGF0YSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmxpbmVib290ICgpIHtcbiAgICB2YXIgaWQgPSBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLXRhdW51cycpO1xuICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIG1vZGVsID0gSlNPTi5wYXJzZSh1bmVzY2FwZShzY3JpcHQuaW5uZXJUZXh0IHx8IHNjcmlwdC50ZXh0Q29udGVudCkpO1xuICAgIGJvb3QobW9kZWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gYm9vdCAobW9kZWwpIHtcbiAgICBpZiAoYm9vdGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghbW9kZWwgfHwgdHlwZW9mIG1vZGVsICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUYXVudXMgbW9kZWwgbXVzdCBiZSBhbiBvYmplY3QhJyk7XG4gICAgfVxuICAgIGJvb3RlZCA9IHRydWU7XG4gICAgaWYgKG8uYm9vdHN0cmFwICE9PSAnYXV0bycpIHsgLy8gYXV0b2Jvb3QgdXNlcyBmZXRjaGVyLCB3aGljaCB3b3VsZCd2ZSBwZXJzaXN0ZWRcbiAgICAgIGNhY2hpbmcucGVyc2lzdChyb3V0ZSwgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gICAgfVxuICAgIGFjdGl2YXRvci5zdGFydChtb2RlbCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBtb3VudDtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHVzZWQ7XG4gIHJldHVybiBmdW5jdGlvbiBvbmNlICgpIHtcbiAgICBpZiAodXNlZCkgeyByZXR1cm47IH0gdXNlZCA9IHRydWU7XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xuXG5mdW5jdGlvbiBwb3NpdGlvbmluZyAoKSB7XG4gIHZhciB0YXJnZXQ7XG4gIHZhciBoYXNoID0gbG9jYXRpb24uaGFzaDtcbiAgaWYgKGhhc2gpIHtcbiAgICB0YXJnZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChoYXNoLnNsaWNlKDEpKTtcbiAgfVxuICBpZiAoIXRhcmdldCkge1xuICAgIHRhcmdldCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgfVxuICByYWYoZm9jdXNpbik7XG4gIGZ1bmN0aW9uIGZvY3VzaW4gKCkge1xuICAgIHRhcmdldC5zY3JvbGxJbnRvVmlldygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnRpYWwgKGNvbnRhaW5lciwgZW5mb3JjZWRBY3Rpb24sIG1vZGVsLCByb3V0ZSwgb3B0aW9ucykge1xuICB2YXIgYWN0aW9uID0gZW5mb3JjZWRBY3Rpb24gfHwgbW9kZWwgJiYgbW9kZWwuYWN0aW9uIHx8IHJvdXRlICYmIHJvdXRlLmFjdGlvbjtcbiAgdmFyIGNvbnRyb2xsZXIgPSBzdGF0ZS5jb250cm9sbGVyc1thY3Rpb25dO1xuICB2YXIgaW50ZXJuYWxzID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKGludGVybmFscy5yZW5kZXIgIT09IGZhbHNlKSB7XG4gICAgY29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlcihhY3Rpb24sIG1vZGVsKTtcbiAgICBpZiAoaW50ZXJuYWxzLnJvdXRlZCAhPT0gZmFsc2UpIHtcbiAgICAgIHBvc2l0aW9uaW5nKCk7XG4gICAgfVxuICB9XG4gIGVtaXR0ZXIuZW1pdCgncmVuZGVyJywgY29udGFpbmVyLCBtb2RlbCk7XG4gIGlmIChjb250cm9sbGVyKSB7XG4gICAgY29udHJvbGxlcihtb2RlbCwgcm91dGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlciAoYWN0aW9uLCBtb2RlbCkge1xuICB2YXIgdGVtcGxhdGUgPSBzdGF0ZS50ZW1wbGF0ZXNbYWN0aW9uXTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gdGVtcGxhdGUobW9kZWwpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFcnJvciByZW5kZXJpbmcgXCInICsgYWN0aW9uICsgJ1wiIHRlbXBsYXRlXFxuJyArIGUuc3RhY2spO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YW5kYWxvbmUgKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCwgcm91dGUpIHtcbiAgcmV0dXJuIHBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSwgeyByb3V0ZWQ6IGZhbHNlIH0pO1xufVxuXG5wYXJ0aWFsLnN0YW5kYWxvbmUgPSBzdGFuZGFsb25lO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnRpYWw7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1cmwgPSByZXF1aXJlKCdmYXN0LXVybC1wYXJzZXInKTtcbnZhciByb3V0ZXMgPSByZXF1aXJlKCdyb3V0ZXMnKTtcbnZhciBtYXRjaGVyID0gcm91dGVzKCk7XG5cbmZ1bmN0aW9uIHJvdXRlciAocmF3KSB7XG4gIHZhciBwYXJ0cyA9IHVybC5wYXJzZShyYXcpO1xuICB2YXIgcmVzdWx0ID0gbWF0Y2hlci5tYXRjaChwYXJ0cy5wYXRobmFtZSk7XG4gIHZhciByb3V0ZSA9IHJlc3VsdCA/IHJlc3VsdC5mbihyZXN1bHQpIDogbnVsbDtcbiAgaWYgKHJvdXRlKSB7XG4gICAgcm91dGUudXJsID0gcmF3O1xuICAgIHJvdXRlLnBhcnRzID0gcGFydHM7XG4gIH1cbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBzZXR1cCAoZGVmaW5pdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmaW5pdGlvbnMpLmZvckVhY2goZGVmaW5lLmJpbmQobnVsbCwgZGVmaW5pdGlvbnMpKTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lIChkZWZpbml0aW9ucywga2V5KSB7XG4gIG1hdGNoZXIuYWRkUm91dGUoa2V5LCBmdW5jdGlvbiBkZWZpbml0aW9uIChtYXRjaCkge1xuICAgIHZhciBwYXJhbXMgPSBtYXRjaC5wYXJhbXM7XG4gICAgcGFyYW1zLmFyZ3MgPSBtYXRjaC5zcGxhdHM7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJvdXRlOiBrZXksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIGFjdGlvbjogZGVmaW5pdGlvbnNba2V5XS5hY3Rpb24gfHwgbnVsbCxcbiAgICAgIGlnbm9yZTogZGVmaW5pdGlvbnNba2V5XS5pZ25vcmUsXG4gICAgICBjYWNoZTogZGVmaW5pdGlvbnNba2V5XS5jYWNoZVxuICAgIH07XG4gIH0pO1xufVxuXG5yb3V0ZXIuc2V0dXAgPSBzZXR1cDtcblxubW9kdWxlLmV4cG9ydHMgPSByb3V0ZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBjb250YWluZXI6IG51bGxcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBhcGkgPSB7fTtcbnZhciBnID0gZ2xvYmFsO1xudmFyIGlkYiA9IGcuaW5kZXhlZERCIHx8IGcubW96SW5kZXhlZERCIHx8IGcud2Via2l0SW5kZXhlZERCIHx8IGcubXNJbmRleGVkREI7XG52YXIgc3VwcG9ydHM7XG52YXIgZGI7XG52YXIgZGJOYW1lID0gJ3RhdW51cy1jYWNoZSc7XG52YXIgc3RvcmUgPSAndmlldy1tb2RlbHMnO1xudmFyIGtleVBhdGggPSAndXJsJztcbnZhciBzZXRRdWV1ZSA9IFtdO1xudmFyIHRlc3RlZFF1ZXVlID0gW107XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gdGVzdCAoKSB7XG4gIHZhciBrZXkgPSAnaW5kZXhlZC1kYi1mZWF0dXJlLWRldGVjdGlvbic7XG4gIHZhciByZXE7XG4gIHZhciBkYjtcblxuICBpZiAoIShpZGIgJiYgJ2RlbGV0ZURhdGFiYXNlJyBpbiBpZGIpKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7IHJldHVybjtcbiAgfVxuXG4gIHRyeSB7XG4gICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSkub25zdWNjZXNzID0gdHJhbnNhY3Rpb25hbFRlc3Q7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyYW5zYWN0aW9uYWxUZXN0ICgpIHtcbiAgICByZXEgPSBpZGIub3BlbihrZXksIDEpO1xuICAgIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gICAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICAgIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgICByZXEucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdzdG9yZScpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgICAgZGIgPSByZXEucmVzdWx0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGIudHJhbnNhY3Rpb24oJ3N0b3JlJywgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKCdzdG9yZScpLmFkZChuZXcgQmxvYigpLCAna2V5Jyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZGIuY2xvc2UoKTtcbiAgICAgICAgaWRiLmRlbGV0ZURhdGFiYXNlKGtleSk7XG4gICAgICAgIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICBvcGVuKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgICBzdXBwb3J0KGZhbHNlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gb3BlbiAoKSB7XG4gIHZhciByZXEgPSBpZGIub3BlbihkYk5hbWUsIDEpO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuICByZXEub251cGdyYWRlbmVlZGVkID0gdXBnbmVlZGVkO1xuICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcblxuICBmdW5jdGlvbiB1cGduZWVkZWQgKCkge1xuICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoc3RvcmUsIHsga2V5UGF0aDoga2V5UGF0aCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIGRiID0gcmVxLnJlc3VsdDtcbiAgICBhcGkubmFtZSA9ICdJbmRleGVkREInO1xuICAgIGFwaS5nZXQgPSBnZXQ7XG4gICAgYXBpLnNldCA9IHNldDtcbiAgICBkcmFpblNldCgpO1xuICAgIHN1cHBvcnQodHJ1ZSk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmFsbGJhY2sgKCkge1xuICBhcGkubmFtZSA9ICdJbmRleGVkREItZmFsbGJhY2tTdG9yZSc7XG4gIGFwaS5nZXQgPSB1bmRlZmluZWRHZXQ7XG4gIGFwaS5zZXQgPSBlbnF1ZXVlU2V0O1xufVxuXG5mdW5jdGlvbiB1bmRlZmluZWRHZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIG51bGwpO1xufVxuXG5mdW5jdGlvbiBlbnF1ZXVlU2V0IChrZXksICB2YWx1ZSwgZG9uZSkge1xuICBpZiAoc2V0UXVldWUubGVuZ3RoID4gMikgeyAvLyBsZXQncyBub3Qgd2FzdGUgYW55IG1vcmUgbWVtb3J5XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChzdXBwb3J0cyAhPT0gZmFsc2UpIHsgLy8gbGV0J3MgYXNzdW1lIHRoZSBjYXBhYmlsaXR5IGlzIHZhbGlkYXRlZCBzb29uXG4gICAgc2V0UXVldWUucHVzaCh7IGtleToga2V5LCB2YWx1ZTogdmFsdWUsIGRvbmU6IGRvbmUgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5TZXQgKCkge1xuICB3aGlsZSAoc2V0UXVldWUubGVuZ3RoKSB7XG4gICAgdmFyIGl0ZW0gPSBzZXRRdWV1ZS5zaGlmdCgpO1xuICAgIHNldChpdGVtLmtleSwgaXRlbS52YWx1ZSwgaXRlbS5kb25lKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBxdWVyeSAob3AsIHZhbHVlLCBkb25lKSB7XG4gIHZhciByZXEgPSBkYi50cmFuc2FjdGlvbihzdG9yZSwgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKHN0b3JlKVtvcF0odmFsdWUpO1xuXG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuICByZXEub25lcnJvciA9IGVycm9yO1xuXG4gIGZ1bmN0aW9uIHN1Y2Nlc3MgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG51bGwsIHJlcS5yZXN1bHQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgIChkb25lIHx8IG5vb3ApKG5ldyBFcnJvcignVGF1bnVzIGNhY2hlIHF1ZXJ5IGZhaWxlZCBhdCBJbmRleGVkREIhJykpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldCAoa2V5LCBkb25lKSB7XG4gIHF1ZXJ5KCdnZXQnLCBrZXksIGRvbmUpO1xufVxuXG5mdW5jdGlvbiBzZXQgKGtleSwgdmFsdWUsIGRvbmUpIHtcbiAgdmFsdWVba2V5UGF0aF0gPSBrZXk7XG4gIHF1ZXJ5KCdhZGQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gaW5zZXJ0XG4gIHF1ZXJ5KCdwdXQnLCB2YWx1ZSwgZG9uZSk7IC8vIGF0dGVtcHQgdG8gdXBkYXRlXG59XG5cbmZ1bmN0aW9uIGRyYWluVGVzdGVkICgpIHtcbiAgd2hpbGUgKHRlc3RlZFF1ZXVlLmxlbmd0aCkge1xuICAgIHRlc3RlZFF1ZXVlLnNoaWZ0KCkoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB0ZXN0ZWQgKGZuKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgZm4oKTtcbiAgfSBlbHNlIHtcbiAgICB0ZXN0ZWRRdWV1ZS5wdXNoKGZuKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdXBwb3J0ICh2YWx1ZSkge1xuICBpZiAoc3VwcG9ydHMgIT09IHZvaWQgMCkge1xuICAgIHJldHVybjsgLy8gc2FuaXR5XG4gIH1cbiAgc3VwcG9ydHMgPSB2YWx1ZTtcbiAgZHJhaW5UZXN0ZWQoKTtcbn1cblxuZnVuY3Rpb24gZmFpbGVkICgpIHtcbiAgc3VwcG9ydChmYWxzZSk7XG59XG5cbmZhbGxiYWNrKCk7XG50ZXN0KCk7XG5zZXRUaW1lb3V0KGZhaWxlZCwgNjAwKTsgLy8gdGhlIHRlc3QgY2FuIHRha2Ugc29tZXdoZXJlIG5lYXIgMzAwbXMgdG8gY29tcGxldGVcblxubW9kdWxlLmV4cG9ydHMgPSBhcGk7XG5cbmFwaS50ZXN0ZWQgPSB0ZXN0ZWQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmF3ID0ge307XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgZG9uZShudWxsLCByYXdba2V5XSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICByYXdba2V5XSA9IHZhbHVlO1xuICAoZG9uZSB8fCBub29wKShudWxsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG5hbWU6ICdtZW1vcnlTdG9yZScsXG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJlRXNjYXBlZEh0bWwgPSAvJig/OmFtcHxsdHxndHxxdW90fCMzOXwjOTYpOy9nO1xudmFyIGh0bWxVbmVzY2FwZXMgPSB7XG4gICcmYW1wOyc6ICcmJyxcbiAgJyZsdDsnOiAnPCcsXG4gICcmZ3Q7JzogJz4nLFxuICAnJnF1b3Q7JzogJ1wiJyxcbiAgJyYjMzk7JzogJ1xcJycsXG4gICcmIzk2Oyc6ICdgJ1xufTtcblxuZnVuY3Rpb24gdW5lc2NhcGVIdG1sQ2hhciAoYykge1xuICByZXR1cm4gaHRtbFVuZXNjYXBlc1tjXTtcbn1cblxuZnVuY3Rpb24gdW5lc2NhcGUgKGlucHV0KSB7XG4gIHZhciBkYXRhID0gaW5wdXQgPT0gbnVsbCA/ICcnIDogU3RyaW5nKGlucHV0KTtcbiAgaWYgKGRhdGEgJiYgKHJlRXNjYXBlZEh0bWwubGFzdEluZGV4ID0gMCwgcmVFc2NhcGVkSHRtbC50ZXN0KGRhdGEpKSkge1xuICAgIHJldHVybiBkYXRhLnJlcGxhY2UocmVFc2NhcGVkSHRtbCwgdW5lc2NhcGVIdG1sQ2hhcik7XG4gIH1cbiAgcmV0dXJuIGRhdGE7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdW5lc2NhcGU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCd4aHInKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHVybCwgZG9uZSkge1xuICB2YXIgb3B0aW9ucyA9IHtcbiAgICB1cmw6IHVybCxcbiAgICBqc29uOiB0cnVlLFxuICAgIGhlYWRlcnM6IHsgQWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicgfVxuICB9O1xuICB2YXIgcmVxID0geGhyKG9wdGlvbnMsIGhhbmRsZSk7XG5cbiAgcmV0dXJuIHJlcTtcblxuICBmdW5jdGlvbiBoYW5kbGUgKGVyciwgcmVzLCBib2R5KSB7XG4gICAgaWYgKGVyciAmJiAhcmVxLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKSB7XG4gICAgICBkb25lKG5ldyBFcnJvcignYWJvcnRlZCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZShlcnIsIGJvZHkpO1xuICAgIH1cbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zcmMvY29udHJhLmVtaXR0ZXIuanMnKTtcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4oZnVuY3Rpb24gKHJvb3QsIHVuZGVmaW5lZCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHVuZGVmID0gJycgKyB1bmRlZmluZWQ7XG4gIGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4gIGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7IGlmICghZm4pIHsgcmV0dXJuOyB9IHRpY2soZnVuY3Rpb24gcnVuICgpIHsgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pOyB9KTsgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIHRpY2tlclxuICB2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuICBpZiAoc2kpIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIHByb2Nlc3MgIT09IHVuZGVmICYmIHByb2Nlc3MubmV4dFRpY2spIHtcbiAgICB0aWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgfSBlbHNlIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX2VtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldnQgPSB7fTtcbiAgICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gICAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChjID09PSAxKSB7XG4gICAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgICAgZXZ0ID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICB2YXIgdHlwZSA9IGFyZ3Muc2hpZnQoKTtcbiAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgIGlmICh0eXBlID09PSAnZXJyb3InICYmIG9wdHMudGhyb3dzICE9PSBmYWxzZSAmJiAhZXQpIHsgdGhyb3cgYXJncy5sZW5ndGggPT09IDEgPyBhcmdzWzBdIDogYXJnczsgfVxuICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgIGV2dFt0eXBlXSA9IGV0LmZpbHRlcihmdW5jdGlvbiBlbWl0dGVyIChsaXN0ZW4pIHtcbiAgICAgICAgaWYgKG9wdHMuYXN5bmMpIHsgZGVib3VuY2UobGlzdGVuLCBhcmdzLCB0aGluZyk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseSh0aGluZywgYXJncyk7IH1cbiAgICAgICAgcmV0dXJuICFsaXN0ZW4uX29uY2U7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IF9lbWl0dGVyO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gcm9vdC5jb250cmEgfHwge307XG4gICAgcm9vdC5jb250cmEuZW1pdHRlciA9IF9lbWl0dGVyO1xuICB9XG59KSh0aGlzKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIlwidXNlIHN0cmljdFwiO1xuLypcbkNvcHlyaWdodCAoYykgMjAxNCBQZXRrYSBBbnRvbm92XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuICBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG4qL1xuZnVuY3Rpb24gVXJsKCkge1xuICAgIC8vRm9yIG1vcmUgZWZmaWNpZW50IGludGVybmFsIHJlcHJlc2VudGF0aW9uIGFuZCBsYXppbmVzcy5cbiAgICAvL1RoZSBub24tdW5kZXJzY29yZSB2ZXJzaW9ucyBvZiB0aGVzZSBwcm9wZXJ0aWVzIGFyZSBhY2Nlc3NvciBmdW5jdGlvbnNcbiAgICAvL2RlZmluZWQgb24gdGhlIHByb3RvdHlwZS5cbiAgICB0aGlzLl9wcm90b2NvbCA9IG51bGw7XG4gICAgdGhpcy5faHJlZiA9IFwiXCI7XG4gICAgdGhpcy5fcG9ydCA9IC0xO1xuICAgIHRoaXMuX3F1ZXJ5ID0gbnVsbDtcblxuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICB0aGlzLmhvc3QgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuXG4gICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gZmFsc2U7XG59XG5cbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoXCJxdWVyeXN0cmluZ1wiKTtcblVybC5wcm90b3R5cGUucGFyc2UgPVxuZnVuY3Rpb24gVXJsJHBhcnNlKHN0ciwgcGFyc2VRdWVyeVN0cmluZywgaG9zdERlbm90ZXNTbGFzaCkge1xuICAgIGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICtcbiAgICAgICAgICAgIHR5cGVvZiBzdHIpO1xuICAgIH1cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSBzdHIubGVuZ3RoIC0gMTtcblxuICAgIC8vVHJpbSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3c1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChzdGFydCkgPD0gMHgyMCAvKicgJyovKSBzdGFydCsrO1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChlbmQpIDw9IDB4MjAgLyonICcqLykgZW5kLS07XG5cbiAgICBzdGFydCA9IHRoaXMuX3BhcnNlUHJvdG9jb2woc3RyLCBzdGFydCwgZW5kKTtcblxuICAgIC8vSmF2YXNjcmlwdCBkb2Vzbid0IGhhdmUgaG9zdFxuICAgIGlmICh0aGlzLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgc3RhcnQgPSB0aGlzLl9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBob3N0RGVub3Rlc1NsYXNoKTtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICAgICAgKHRoaXMuc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoUHJvdG9jb2xzW3Byb3RvXSkpKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFydCA8PSBlbmQpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHsgLy9Gb3IgamF2YXNjcmlwdCB0aGUgcGF0aG5hbWUgaXMganVzdCB0aGUgcmVzdCBvZiBpdFxuICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGF0aG5hbWUgJiYgdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICB0aGlzLl9zbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF0pIHtcbiAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgIH1cblxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICAgICAgaWYgKHNlYXJjaCA9PSBudWxsKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSB0aGlzLnNlYXJjaCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgICAvL1RoaXMgY2FsbHMgYSBzZXR0ZXIgZnVuY3Rpb24sIHRoZXJlIGlzIG5vIC5xdWVyeSBkYXRhIHByb3BlcnR5XG4gICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZShzZWFyY2gpO1xuICAgIH1cbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlKHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdChVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRmb3JtYXQoKSB7XG4gICAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgXCJcIjtcblxuICAgIGlmIChhdXRoKSB7XG4gICAgICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCBcIjpcIik7XG4gICAgICAgIGF1dGggKz0gXCJAXCI7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCBcIlwiO1xuICAgIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCBcIlwiO1xuICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgIHZhciBxdWVyeSA9IFwiXCI7XG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0IHx8IFwiXCI7XG4gICAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgICB2YXIgc2NoZW1lID0gXCJcIjtcblxuICAgIC8vQ2FjaGUgdGhlIHJlc3VsdCBvZiB0aGUgZ2V0dGVyIGZ1bmN0aW9uXG4gICAgdmFyIHEgPSB0aGlzLnF1ZXJ5O1xuICAgIGlmIChxICYmIHR5cGVvZiBxID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHEpO1xuICAgIH1cblxuICAgIGlmICghc2VhcmNoKSB7XG4gICAgICAgIHNlYXJjaCA9IHF1ZXJ5ID8gXCI/XCIgKyBxdWVyeSA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDB4M0EgLyonOicqLylcbiAgICAgICAgcHJvdG9jb2wgKz0gXCI6XCI7XG5cbiAgICBpZiAodGhpcy5ob3N0KSB7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICAgIH1cbiAgICBlbHNlIGlmIChob3N0bmFtZSkge1xuICAgICAgICB2YXIgaXA2ID0gaG9zdG5hbWUuaW5kZXhPZihcIjpcIikgPiAtMTtcbiAgICAgICAgaWYgKGlwNikgaG9zdG5hbWUgPSBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgaG9zdG5hbWUgKyAocG9ydCA/IFwiOlwiICsgcG9ydCA6IFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBzbGFzaGVzID0gdGhpcy5zbGFzaGVzIHx8XG4gICAgICAgICgoIXByb3RvY29sIHx8XG4gICAgICAgIHNsYXNoUHJvdG9jb2xzW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpO1xuXG5cbiAgICBpZiAocHJvdG9jb2wpIHNjaGVtZSA9IHByb3RvY29sICsgKHNsYXNoZXMgPyBcIi8vXCIgOiBcIlwiKTtcbiAgICBlbHNlIGlmIChzbGFzaGVzKSBzY2hlbWUgPSBcIi8vXCI7XG5cbiAgICBpZiAoc2xhc2hlcyAmJiBwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIi9cIiArIHBhdGhuYW1lO1xuICAgIH1cbiAgICBlbHNlIGlmICghc2xhc2hlcyAmJiBwYXRobmFtZSA9PT0gXCIvXCIpIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSAweDNGIC8qJz8nKi8pXG4gICAgICAgIHNlYXJjaCA9IFwiP1wiICsgc2VhcmNoO1xuICAgIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMHgyMyAvKicjJyovKVxuICAgICAgICBoYXNoID0gXCIjXCIgKyBoYXNoO1xuXG4gICAgcGF0aG5hbWUgPSBlc2NhcGVQYXRoTmFtZShwYXRobmFtZSk7XG4gICAgc2VhcmNoID0gZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG5cbiAgICByZXR1cm4gc2NoZW1lICsgKGhvc3QgPT09IGZhbHNlID8gXCJcIiA6IGhvc3QpICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJHJlc29sdmVPYmplY3QocmVsYXRpdmUpIHtcbiAgICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZWxhdGl2ZSA9IFVybC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMuX2Nsb25lKCk7XG5cbiAgICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlXCJzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICAgIGlmICghcmVsYXRpdmUuaHJlZikge1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICAgIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5fcHJvdG9jb2wpIHtcbiAgICAgICAgcmVsYXRpdmUuX2NvcHlQcm9wc1RvKHJlc3VsdCwgdHJ1ZSk7XG5cbiAgICAgICAgaWYgKHNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdICYmXG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gcmVzdWx0Ll9wcm90b2NvbCkge1xuICAgICAgICAvLyBpZiBpdFwicyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgICAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAgICAgLy8gZmlyc3QsIGlmIGl0XCJzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgICAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgICAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGJlY2F1c2UgdGhhdFwicyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAgICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgICAgICBpZiAoIXNsYXNoUHJvdG9jb2xzW3JlbGF0aXZlLl9wcm90b2NvbF0pIHtcbiAgICAgICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIGZhbHNlKTtcbiAgICAgICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Ll9wcm90b2NvbCA9IHJlbGF0aXZlLl9wcm90b2NvbDtcbiAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0ICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8IFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAocmVsUGF0aFswXSAhPT0gXCJcIikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKFwiL1wiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IFwiXCI7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgcmVzdWx0Ll9wb3J0ID0gcmVsYXRpdmUuX3BvcnQ7XG4gICAgICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICB2YXIgaXNTb3VyY2VBYnMgPVxuICAgICAgICAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pO1xuICAgIHZhciBpc1JlbEFicyA9IChcbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICAgIChyZWxhdGl2ZS5wYXRobmFtZSAmJlxuICAgICAgICAgICAgcmVsYXRpdmUucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKVxuICAgICAgICApO1xuICAgIHZhciBtdXN0RW5kQWJzID0gKGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKTtcblxuICAgIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcblxuICAgIHZhciBzcmNQYXRoID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5fcHJvdG9jb2wgJiYgIXNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdO1xuXG4gICAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAgIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gICAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IC0xO1xuICAgICAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgICAgICAgIGlmIChzcmNQYXRoWzBdID09PSBcIlwiKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICAgICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Lmhvc3QgPSBcIlwiO1xuICAgICAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICByZWxhdGl2ZS5fcG9ydCA9IC0xO1xuICAgICAgICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gXCJcIikgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgICAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gXCJcIiB8fCBzcmNQYXRoWzBdID09PSBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaXNSZWxBYnMpIHtcbiAgICAgICAgLy8gaXRcInMgYWJzb2x1dGUuXG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lID9cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAgICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gICAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgICAgICAvLyBpdFwicyByZWxhdGl2ZVxuICAgICAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICAgICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgICAgIHNyY1BhdGgucG9wKCk7XG4gICAgICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCkge1xuICAgICAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgICAgIC8vIGxpa2UgaHJlZj1cIj9mb29cIi5cbiAgICAgICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoXCJtYWlsdG86bG9jYWwxQGRvbWFpbjFcIiwgXCJsb2NhbDJAZG9tYWluMlwiKVxuICAgICAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgICAgICAvLyB3ZVwidmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gICAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAgIChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gXCIuXCIgfHwgbGFzdCA9PT0gXCIuLlwiKSB8fFxuICAgICAgICBsYXN0ID09PSBcIlwiKTtcblxuICAgIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICAgIHZhciB1cCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgICAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICAgICAgaWYgKGxhc3QgPT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICB9IGVsc2UgaWYgKGxhc3QgPT09IFwiLi5cIikge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cCsrO1xuICAgICAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHVwLS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gICAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiLi5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSBcIlwiICYmXG4gICAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgIT09IDB4MkYgLyonLycqLykpIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oXCIvXCIpLnN1YnN0cigtMSkgIT09IFwiL1wiKSkge1xuICAgICAgICBzcmNQYXRoLnB1c2goXCJcIik7XG4gICAgfVxuXG4gICAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSBcIlwiIHx8XG4gICAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcblxuICAgIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IGlzQWJzb2x1dGUgPyBcIlwiIDpcbiAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogXCJcIjtcbiAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpIDogZmFsc2U7XG4gICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICAgIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmxlbmd0aCA9PT0gMCA/IG51bGwgOiBzcmNQYXRoLmpvaW4oXCIvXCIpO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIHB1bnljb2RlID0gcmVxdWlyZShcInB1bnljb2RlXCIpO1xuVXJsLnByb3RvdHlwZS5faG9zdElkbmEgPSBmdW5jdGlvbiBVcmwkX2hvc3RJZG5hKGhvc3RuYW1lKSB7XG4gICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgIHZhciBkb21haW5BcnJheSA9IGhvc3RuYW1lLnNwbGl0KFwiLlwiKTtcbiAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgIFwieG4tLVwiICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgfVxuICAgIHJldHVybiBuZXdPdXQuam9pbihcIi5cIik7XG59O1xuXG52YXIgZXNjYXBlUGF0aE5hbWUgPSBVcmwucHJvdG90eXBlLl9lc2NhcGVQYXRoTmFtZSA9XG5mdW5jdGlvbiBVcmwkX2VzY2FwZVBhdGhOYW1lKHBhdGhuYW1lKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIocGF0aG5hbWUsIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovKSkge1xuICAgICAgICByZXR1cm4gcGF0aG5hbWU7XG4gICAgfVxuICAgIC8vQXZvaWQgY2xvc3VyZSBjcmVhdGlvbiB0byBrZWVwIHRoaXMgaW5saW5hYmxlXG4gICAgcmV0dXJuIF9lc2NhcGVQYXRoKHBhdGhuYW1lKTtcbn07XG5cbnZhciBlc2NhcGVTZWFyY2ggPSBVcmwucHJvdG90eXBlLl9lc2NhcGVTZWFyY2ggPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIoc2VhcmNoLCAweDIzIC8qJyMnKi8sIC0xKSkgcmV0dXJuIHNlYXJjaDtcbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVByb3RvY29sID0gZnVuY3Rpb24gVXJsJF9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBwcm90b2NvbENoYXJhY3RlcnMgPSB0aGlzLl9wcm90b2NvbENoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgIHZhciBwcm90b2NvbCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICBpZiAoZG9Mb3dlckNhc2UpIHByb3RvY29sID0gcHJvdG9jb2wudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJvdG9jb2xDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGNoIDwgMHg2MSAvKidhJyovKVxuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlQXV0aCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VBdXRoKHN0ciwgc3RhcnQsIGVuZCwgZGVjb2RlKSB7XG4gICAgdmFyIGF1dGggPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEpO1xuICAgIGlmIChkZWNvZGUpIHtcbiAgICAgICAgYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG4gICAgdGhpcy5hdXRoID0gYXV0aDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUG9ydCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQb3J0KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIC8vSW50ZXJuYWwgZm9ybWF0IGlzIGludGVnZXIgZm9yIG1vcmUgZWZmaWNpZW50IHBhcnNpbmdcbiAgICAvL2FuZCBmb3IgZWZmaWNpZW50IHRyaW1taW5nIG9mIGxlYWRpbmcgemVyb3NcbiAgICB2YXIgcG9ydCA9IDA7XG4gICAgLy9EaXN0aW5ndWlzaCBiZXR3ZWVuIDowIGFuZCA6IChubyBwb3J0IG51bWJlciBhdCBhbGwpXG4gICAgdmFyIGhhZENoYXJzID0gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pIHtcbiAgICAgICAgICAgIHBvcnQgPSAoMTAgKiBwb3J0KSArIChjaCAtIDB4MzAgLyonMCcqLyk7XG4gICAgICAgICAgICBoYWRDaGFycyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBicmVhaztcblxuICAgIH1cbiAgICBpZiAocG9ydCA9PT0gMCAmJiAhaGFkQ2hhcnMpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgdGhpcy5fcG9ydCA9IHBvcnQ7XG4gICAgcmV0dXJuIGkgLSBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSG9zdCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlSG9zdChzdHIsIHN0YXJ0LCBlbmQsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgdmFyIGhvc3RFbmRpbmdDaGFyYWN0ZXJzID0gdGhpcy5faG9zdEVuZGluZ0NoYXJhY3RlcnM7XG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHgyRiAvKicvJyovICYmXG4gICAgICAgIHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgMSkgPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuXG4gICAgICAgIC8vVGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHtcbiAgICAgICAgICAgIC8vVGhlIHN0cmluZyBpcyBqdXN0IFwiLy9cIlxuICAgICAgICAgICAgaWYgKGVuZCA8IDIpIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIC8vSWYgc2xhc2hlcyBkbyBub3QgZGVub3RlIGhvc3QgYW5kIHRoZXJlIGlzIG5vIGF1dGgsXG4gICAgICAgICAgICAvL3RoZXJlIGlzIG5vIGhvc3Qgd2hlbiB0aGUgc3RyaW5nIHN0YXJ0cyB3aXRoIC8vXG4gICAgICAgICAgICB2YXIgaGFzQXV0aCA9XG4gICAgICAgICAgICAgICAgY29udGFpbnNDaGFyYWN0ZXIoc3RyLCAweDQwIC8qJ0AnKi8sIDIsIGhvc3RFbmRpbmdDaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIGlmICghaGFzQXV0aCAmJiAhc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL1RoZXJlIGlzIGEgaG9zdCB0aGF0IHN0YXJ0cyBhZnRlciB0aGUgLy9cbiAgICAgICAgc3RhcnQgKz0gMjtcbiAgICB9XG4gICAgLy9JZiB0aGVyZSBpcyBubyBzbGFzaGVzLCB0aGVyZSBpcyBubyBob3N0bmFtZSBpZlxuICAgIC8vMS4gdGhlcmUgd2FzIG5vIHByb3RvY29sIGF0IGFsbFxuICAgIGVsc2UgaWYgKCF0aGlzLl9wcm90b2NvbCB8fFxuICAgICAgICAvLzIuIHRoZXJlIHdhcyBhIHByb3RvY29sIHRoYXQgcmVxdWlyZXMgc2xhc2hlc1xuICAgICAgICAvL2UuZy4gaW4gJ2h0dHA6YXNkJyAnYXNkJyBpcyBub3QgYSBob3N0bmFtZVxuICAgICAgICBzbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF1cbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBpZG5hID0gZmFsc2U7XG4gICAgdmFyIGhvc3ROYW1lU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgaG9zdE5hbWVFbmQgPSBlbmQ7XG4gICAgdmFyIGxhc3RDaCA9IC0xO1xuICAgIHZhciBwb3J0TGVuZ3RoID0gMDtcbiAgICB2YXIgY2hhcnNBZnRlckRvdCA9IDA7XG4gICAgdmFyIGF1dGhOZWVkc0RlY29kaW5nID0gZmFsc2U7XG5cbiAgICB2YXIgaiA9IC0xO1xuXG4gICAgLy9GaW5kIHRoZSBsYXN0IG9jY3VycmVuY2Ugb2YgYW4gQC1zaWduIHVudGlsIGhvc3RlbmRpbmcgY2hhcmFjdGVyIGlzIG1ldFxuICAgIC8vYWxzbyBtYXJrIGlmIGRlY29kaW5nIGlzIG5lZWRlZCBmb3IgdGhlIGF1dGggcG9ydGlvblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4NDAgLyonQCcqLykge1xuICAgICAgICAgICAgaiA9IGk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNoZWNrIGlzIHZlcnksIHZlcnkgY2hlYXAuIFVubmVlZGVkIGRlY29kZVVSSUNvbXBvbmVudCBpcyB2ZXJ5XG4gICAgICAgIC8vdmVyeSBleHBlbnNpdmVcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjUgLyonJScqLykge1xuICAgICAgICAgICAgYXV0aE5lZWRzRGVjb2RpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhvc3RFbmRpbmdDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvL0Atc2lnbiB3YXMgZm91bmQgYXQgaW5kZXggaiwgZXZlcnl0aGluZyB0byB0aGUgbGVmdCBmcm9tIGl0XG4gICAgLy9pcyBhdXRoIHBhcnRcbiAgICBpZiAoaiA+IC0xKSB7XG4gICAgICAgIHRoaXMuX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBqIC0gMSwgYXV0aE5lZWRzRGVjb2RpbmcpO1xuICAgICAgICAvL2hvc3RuYW1lIHN0YXJ0cyBhZnRlciB0aGUgbGFzdCBALXNpZ25cbiAgICAgICAgc3RhcnQgPSBob3N0TmFtZVN0YXJ0ID0gaiArIDE7XG4gICAgfVxuXG4gICAgLy9Ib3N0IG5hbWUgaXMgc3RhcnRpbmcgd2l0aCBhIFtcbiAgICBpZiAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpID09PSAweDVCIC8qJ1snKi8pIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0ICsgMTsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgICAgIC8vQXNzdW1lIHZhbGlkIElQNiBpcyBiZXR3ZWVuIHRoZSBicmFja2V0c1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDVEIC8qJ10nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAyLCBlbmQpICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKHN0YXJ0ICsgMSwgaSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBcIltcIiArIGhvc3RuYW1lICsgXCJdOlwiICsgdGhpcy5fcG9ydFxuICAgICAgICAgICAgICAgICAgICA6IFwiW1wiICsgaG9zdG5hbWUgKyBcIl1cIjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGkgKyBwb3J0TGVuZ3RoICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL0VtcHR5IGhvc3RuYW1lLCBbIHN0YXJ0cyBhIHBhdGhcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICBpZiAoY2hhcnNBZnRlckRvdCA+IDYyKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gc3RyLnNsaWNlKHN0YXJ0LCBpKTtcbiAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICBwb3J0TGVuZ3RoID0gdGhpcy5fcGFyc2VQb3J0KHN0ciwgaSArIDEsIGVuZCkgKyAxO1xuICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoIDwgMHg2MSAvKidhJyovKSB7XG4gICAgICAgICAgICBpZiAoY2ggPT09IDB4MkUgLyonLicqLykge1xuICAgICAgICAgICAgICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGlmIChsYXN0Q2ggPT09IERPVCB8fCBsYXN0Q2ggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2hhcnNBZnRlckRvdCA9IC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoMHg0MSAvKidBJyovIDw9IGNoICYmIGNoIDw9IDB4NUEgLyonWicqLykge1xuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCEoY2ggPT09IDB4MkQgLyonLScqLyB8fCBjaCA9PT0gMHg1RiAvKidfJyovIHx8XG4gICAgICAgICAgICAgICAgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pKSkge1xuICAgICAgICAgICAgICAgIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDAgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID49IDB4N0IgLyoneycqLykge1xuICAgICAgICAgICAgaWYgKGNoIDw9IDB4N0UgLyonficqLykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnNbY2hdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZG5hID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0Q2ggPSBjaDtcbiAgICAgICAgY2hhcnNBZnRlckRvdCsrO1xuICAgIH1cblxuICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAvKlxuICAgIGlmIChsYXN0Q2ggPT09IERPVCkge1xuICAgICAgICBob3N0TmFtZUVuZC0tO1xuICAgIH1cbiAgICAqL1xuXG4gICAgaWYgKGhvc3ROYW1lRW5kICsgMSAhPT0gc3RhcnQgJiZcbiAgICAgICAgaG9zdE5hbWVFbmQgLSBob3N0TmFtZVN0YXJ0IDw9IDI1Nikge1xuICAgICAgICB2YXIgaG9zdG5hbWUgPSBzdHIuc2xpY2UoaG9zdE5hbWVTdGFydCwgaG9zdE5hbWVFbmQgKyAxKTtcbiAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBob3N0bmFtZSA9IGhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChpZG5hKSBob3N0bmFtZSA9IHRoaXMuX2hvc3RJZG5hKGhvc3RuYW1lKTtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICB0aGlzLmhvc3QgPSB0aGlzLl9wb3J0ID4gMCA/IGhvc3RuYW1lICsgXCI6XCIgKyB0aGlzLl9wb3J0IDogaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhvc3ROYW1lRW5kICsgMSArIHBvcnRMZW5ndGg7XG5cbn07XG5cblVybC5wcm90b3R5cGUuX2NvcHlQcm9wc1RvID0gZnVuY3Rpb24gVXJsJF9jb3B5UHJvcHNUbyhpbnB1dCwgbm9Qcm90b2NvbCkge1xuICAgIGlmICghbm9Qcm90b2NvbCkge1xuICAgICAgICBpbnB1dC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICB9XG4gICAgaW5wdXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIGlucHV0Ll9wb3J0ID0gdGhpcy5fcG9ydDtcbiAgICBpbnB1dC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIGlucHV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgaW5wdXQuc2xhc2hlcyA9IHRoaXMuc2xhc2hlcztcbiAgICBpbnB1dC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIGlucHV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICBpbnB1dC5oYXNoID0gdGhpcy5oYXNoO1xuICAgIGlucHV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIGlucHV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbn07XG5cblVybC5wcm90b3R5cGUuX2Nsb25lID0gZnVuY3Rpb24gVXJsJF9jbG9uZSgpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICByZXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIHJldC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgcmV0Ll9wcmVwZW5kU2xhc2ggPSB0aGlzLl9wcmVwZW5kU2xhc2g7XG4gICAgcmV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgcmV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgcmV0Lmhvc3QgPSB0aGlzLmhvc3Q7XG4gICAgcmV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICByZXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICByZXQuc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgcmV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fZ2V0Q29tcG9uZW50RXNjYXBlZCA9XG5mdW5jdGlvbiBVcmwkX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIGN1ciA9IHN0YXJ0O1xuICAgIHZhciBpID0gc3RhcnQ7XG4gICAgdmFyIHJldCA9IFwiXCI7XG4gICAgdmFyIGF1dG9Fc2NhcGVNYXAgPSB0aGlzLl9hdXRvRXNjYXBlTWFwO1xuICAgIGZvciAoOyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB2YXIgZXNjYXBlZCA9IGF1dG9Fc2NhcGVNYXBbY2hdO1xuXG4gICAgICAgIGlmIChlc2NhcGVkICE9PSBcIlwiKSB7XG4gICAgICAgICAgICBpZiAoY3VyIDwgaSkgcmV0ICs9IHN0ci5zbGljZShjdXIsIGkpO1xuICAgICAgICAgICAgcmV0ICs9IGVzY2FwZWQ7XG4gICAgICAgICAgICBjdXIgPSBpICsgMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VyIDwgaSArIDEpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQYXRoID1cbmZ1bmN0aW9uIFVybCRfcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBwYXRoU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgcGF0aEVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBwYXRoRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXRoU3RhcnQgPiBwYXRoRW5kKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwYXRoO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcGF0aCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBwYXRoU3RhcnQsIHBhdGhFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcGF0aCA9IHN0ci5zbGljZShwYXRoU3RhcnQsIHBhdGhFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5wYXRobmFtZSA9IHRoaXMuX3ByZXBlbmRTbGFzaCA/IFwiL1wiICsgcGF0aCA6IHBhdGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVF1ZXJ5ID0gZnVuY3Rpb24gVXJsJF9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBxdWVyeVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHF1ZXJ5RW5kID0gZW5kO1xuICAgIHZhciBlc2NhcGUgPSBmYWxzZTtcbiAgICB2YXIgYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSB0aGlzLl9hdXRvRXNjYXBlQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHF1ZXJ5RW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChxdWVyeVN0YXJ0ID4gcXVlcnlFbmQpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5O1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcXVlcnkgPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcXVlcnlTdGFydCwgcXVlcnlFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSBzdHIuc2xpY2UocXVlcnlTdGFydCwgcXVlcnlFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5zZWFyY2ggPSBxdWVyeTtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSGFzaCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIGlmIChzdGFydCA+IGVuZCkge1xuICAgICAgICB0aGlzLmhhc2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaGFzaCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInBvcnRcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wb3J0ID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiAoXCJcIiArIHRoaXMuX3BvcnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSBwYXJzZUludCh2LCAxMCk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicXVlcnlcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5O1xuICAgICAgICBpZiAocXVlcnkgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcblxuICAgICAgICBpZiAoc2VhcmNoKSB7XG4gICAgICAgICAgICBpZiAoc2VhcmNoLmNoYXJDb2RlQXQoMCkgPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzZWFyY2ggIT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHNlYXJjaDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWFyY2g7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5fcXVlcnkgPSB2O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwYXRoXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgICAgICBpZiAocCB8fCBzKSB7XG4gICAgICAgICAgICByZXR1cm4gcCArIHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChwID09IG51bGwgJiYgcykgPyAoXCIvXCIgKyBzKSA6IG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKCkge31cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwcm90b2NvbFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIHJldHVybiBwcm90byA/IHByb3RvICsgXCI6XCIgOiBwcm90bztcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBlbmQgPSB2Lmxlbmd0aCAtIDE7XG4gICAgICAgICAgICBpZiAodi5jaGFyQ29kZUF0KGVuZCkgPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdi5zbGljZSgwLCBlbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSB2O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcImhyZWZcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBocmVmID0gdGhpcy5faHJlZjtcbiAgICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgICAgICBocmVmID0gdGhpcy5faHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhyZWY7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5faHJlZiA9IHY7XG4gICAgfVxufSk7XG5cblVybC5wYXJzZSA9IGZ1bmN0aW9uIFVybCRQYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAoc3RyIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gc3RyO1xuICAgIHZhciByZXQgPSBuZXcgVXJsKCk7XG4gICAgcmV0LnBhcnNlKHN0ciwgISFwYXJzZVF1ZXJ5U3RyaW5nLCAhIWhvc3REZW5vdGVzU2xhc2gpO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwuZm9ybWF0ID0gZnVuY3Rpb24gVXJsJEZvcm1hdChvYmopIHtcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvYmogPSBVcmwucGFyc2Uob2JqKTtcbiAgICB9XG4gICAgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkge1xuICAgICAgICByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufTtcblxuVXJsLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn07XG5cblVybC5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIGlmICghc291cmNlKSByZXR1cm4gcmVsYXRpdmU7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlT2JqZWN0KHJlbGF0aXZlKTtcbn07XG5cbmZ1bmN0aW9uIF9lc2NhcGVQYXRoKHBhdGhuYW1lKSB7XG4gICAgcmV0dXJuIHBhdGhuYW1lLnJlcGxhY2UoL1s/I10vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgcmV0dXJuIHNlYXJjaC5yZXBsYWNlKC8jL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG4vL1NlYXJjaCBgY2hhcjFgIChpbnRlZ2VyIGNvZGUgZm9yIGEgY2hhcmFjdGVyKSBpbiBgc3RyaW5nYFxuLy9zdGFydGluZyBmcm9tIGBmcm9tSW5kZXhgIGFuZCBlbmRpbmcgYXQgYHN0cmluZy5sZW5ndGggLSAxYFxuLy9vciB3aGVuIGEgc3RvcCBjaGFyYWN0ZXIgaXMgZm91bmRcbmZ1bmN0aW9uIGNvbnRhaW5zQ2hhcmFjdGVyKHN0cmluZywgY2hhcjEsIGZyb21JbmRleCwgc3RvcENoYXJhY3RlclRhYmxlKSB7XG4gICAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IGZyb21JbmRleDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gY2hhcjEpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHN0b3BDaGFyYWN0ZXJUYWJsZVtjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vU2VlIGlmIGBjaGFyMWAgb3IgYGNoYXIyYCAoaW50ZWdlciBjb2RlcyBmb3IgY2hhcmFjdGVycylcbi8vaXMgY29udGFpbmVkIGluIGBzdHJpbmdgXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcjIoc3RyaW5nLCBjaGFyMSwgY2hhcjIpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IGNoYXIxIHx8IGNoID09PSBjaGFyMikgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy9NYWtlcyBhbiBhcnJheSBvZiAxMjggdWludDgncyB3aGljaCByZXByZXNlbnQgYm9vbGVhbiB2YWx1ZXMuXG4vL1NwZWMgaXMgYW4gYXJyYXkgb2YgYXNjaWkgY29kZSBwb2ludHMgb3IgYXNjaWkgY29kZSBwb2ludCByYW5nZXNcbi8vcmFuZ2VzIGFyZSBleHByZXNzZWQgYXMgW3N0YXJ0LCBlbmRdXG5cbi8vQ3JlYXRlIGEgdGFibGUgd2l0aCB0aGUgY2hhcmFjdGVycyAweDMwLTB4MzkgKGRlY2ltYWxzICcwJyAtICc5JykgYW5kXG4vLzB4N0EgKGxvd2VyY2FzZWxldHRlciAneicpIGFzIGB0cnVlYDpcbi8vXG4vL3ZhciBhID0gbWFrZUFzY2lpVGFibGUoW1sweDMwLCAweDM5XSwgMHg3QV0pO1xuLy9hWzB4MzBdOyAvLzFcbi8vYVsweDE1XTsgLy8wXG4vL2FbMHgzNV07IC8vMVxuZnVuY3Rpb24gbWFrZUFzY2lpVGFibGUoc3BlYykge1xuICAgIHZhciByZXQgPSBuZXcgVWludDhBcnJheSgxMjgpO1xuICAgIHNwZWMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICByZXRbaXRlbV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gaXRlbVswXTtcbiAgICAgICAgICAgIHZhciBlbmQgPSBpdGVtWzFdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0OyBqIDw9IGVuZDsgKytqKSB7XG4gICAgICAgICAgICAgICAgcmV0W2pdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJldDtcbn1cblxuXG52YXIgYXV0b0VzY2FwZSA9IFtcIjxcIiwgXCI+XCIsIFwiXFxcIlwiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsIFwiXFxuXCIsXG4gICAgXCJcXHRcIiwgXCJ7XCIsIFwifVwiLCBcInxcIiwgXCJcXFxcXCIsIFwiXlwiLCBcImBcIiwgXCInXCJdO1xuXG52YXIgYXV0b0VzY2FwZU1hcCA9IG5ldyBBcnJheSgxMjgpO1xuXG5cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGVNYXAubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBhdXRvRXNjYXBlTWFwW2ldID0gXCJcIjtcbn1cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgYyA9IGF1dG9Fc2NhcGVbaV07XG4gICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChjKTtcbiAgICBpZiAoZXNjID09PSBjKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShjKTtcbiAgICB9XG4gICAgYXV0b0VzY2FwZU1hcFtjLmNoYXJDb2RlQXQoMCldID0gZXNjO1xufVxuXG5cbnZhciBzbGFzaFByb3RvY29scyA9IFVybC5wcm90b3R5cGUuX3NsYXNoUHJvdG9jb2xzID0ge1xuICAgIGh0dHA6IHRydWUsXG4gICAgaHR0cHM6IHRydWUsXG4gICAgZ29waGVyOiB0cnVlLFxuICAgIGZpbGU6IHRydWUsXG4gICAgZnRwOiB0cnVlLFxuXG4gICAgXCJodHRwOlwiOiB0cnVlLFxuICAgIFwiaHR0cHM6XCI6IHRydWUsXG4gICAgXCJnb3BoZXI6XCI6IHRydWUsXG4gICAgXCJmaWxlOlwiOiB0cnVlLFxuICAgIFwiZnRwOlwiOiB0cnVlXG59O1xuXG4vL09wdGltaXplIGJhY2sgZnJvbSBub3JtYWxpemVkIG9iamVjdCBjYXVzZWQgYnkgbm9uLWlkZW50aWZpZXIga2V5c1xuZnVuY3Rpb24gZigpe31cbmYucHJvdG90eXBlID0gc2xhc2hQcm90b2NvbHM7XG5cblVybC5wcm90b3R5cGUuX3Byb3RvY29sQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICBbMHg2MSAvKidhJyovLCAweDdBIC8qJ3onKi9dLFxuICAgIFsweDQxIC8qJ0EnKi8sIDB4NUEgLyonWicqL10sXG4gICAgMHgyRSAvKicuJyovLCAweDJCIC8qJysnKi8sIDB4MkQgLyonLScqL1xuXSk7XG5cblVybC5wcm90b3R5cGUuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoW1xuICAgIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovLCAweDJGIC8qJy8nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIGF1dG9Fc2NhcGUubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgcmV0dXJuIHYuY2hhckNvZGVBdCgwKTtcbiAgICB9KVxuKTtcblxuLy9JZiB0aGVzZSBjaGFyYWN0ZXJzIGVuZCBhIGhvc3QgbmFtZSwgdGhlIHBhdGggd2lsbCBub3QgYmUgcHJlcGVuZGVkIGEgL1xuVXJsLnByb3RvdHlwZS5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzID0gbWFrZUFzY2lpVGFibGUoXG4gICAgW1xuICAgICAgICBcIjxcIiwgXCI+XCIsIFwiJ1wiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsXG4gICAgICAgIFwiXFxuXCIsIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLFxuICAgICAgICBcIl5cIiwgXCJgXCIsIFwiXFxcIlwiLCBcIiVcIiwgXCI7XCJcbiAgICBdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cblVybC5wcm90b3R5cGUuX2F1dG9Fc2NhcGVNYXAgPSBhdXRvRXNjYXBlTWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVybDtcblxuVXJsLnJlcGxhY2UgPSBmdW5jdGlvbiBVcmwkUmVwbGFjZSgpIHtcbiAgICByZXF1aXJlLmNhY2hlW1widXJsXCJdID0ge1xuICAgICAgICBleHBvcnRzOiBVcmxcbiAgICB9O1xufTtcbiIsInZhciBub3cgPSByZXF1aXJlKCdwZXJmb3JtYW5jZS1ub3cnKVxuICAsIGdsb2JhbCA9IHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8ge30gOiB3aW5kb3dcbiAgLCB2ZW5kb3JzID0gWydtb3onLCAnd2Via2l0J11cbiAgLCBzdWZmaXggPSAnQW5pbWF0aW9uRnJhbWUnXG4gICwgcmFmID0gZ2xvYmFsWydyZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBjYWYgPSBnbG9iYWxbJ2NhbmNlbCcgKyBzdWZmaXhdIHx8IGdsb2JhbFsnY2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgbmF0aXZlID0gdHJ1ZVxuXG5mb3IodmFyIGkgPSAwOyBpIDwgdmVuZG9ycy5sZW5ndGggJiYgIXJhZjsgaSsrKSB7XG4gIHJhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ1JlcXVlc3QnICsgc3VmZml4XVxuICBjYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWwnICsgc3VmZml4XVxuICAgICAgfHwgZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICBuYXRpdmUgPSBmYWxzZVxuXG4gIHZhciBsYXN0ID0gMFxuICAgICwgaWQgPSAwXG4gICAgLCBxdWV1ZSA9IFtdXG4gICAgLCBmcmFtZUR1cmF0aW9uID0gMTAwMCAvIDYwXG5cbiAgcmFmID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICBpZihxdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHZhciBfbm93ID0gbm93KClcbiAgICAgICAgLCBuZXh0ID0gTWF0aC5tYXgoMCwgZnJhbWVEdXJhdGlvbiAtIChfbm93IC0gbGFzdCkpXG4gICAgICBsYXN0ID0gbmV4dCArIF9ub3dcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjcCA9IHF1ZXVlLnNsaWNlKDApXG4gICAgICAgIC8vIENsZWFyIHF1ZXVlIGhlcmUgdG8gcHJldmVudFxuICAgICAgICAvLyBjYWxsYmFja3MgZnJvbSBhcHBlbmRpbmcgbGlzdGVuZXJzXG4gICAgICAgIC8vIHRvIHRoZSBjdXJyZW50IGZyYW1lJ3MgcXVldWVcbiAgICAgICAgcXVldWUubGVuZ3RoID0gMFxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY3AubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZighY3BbaV0uY2FuY2VsbGVkKSB7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgIGNwW2ldLmNhbGxiYWNrKGxhc3QpXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSwgTWF0aC5yb3VuZChuZXh0KSlcbiAgICB9XG4gICAgcXVldWUucHVzaCh7XG4gICAgICBoYW5kbGU6ICsraWQsXG4gICAgICBjYWxsYmFjazogY2FsbGJhY2ssXG4gICAgICBjYW5jZWxsZWQ6IGZhbHNlXG4gICAgfSlcbiAgICByZXR1cm4gaWRcbiAgfVxuXG4gIGNhZiA9IGZ1bmN0aW9uKGhhbmRsZSkge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYocXVldWVbaV0uaGFuZGxlID09PSBoYW5kbGUpIHtcbiAgICAgICAgcXVldWVbaV0uY2FuY2VsbGVkID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIFdyYXAgaW4gYSBuZXcgZnVuY3Rpb24gdG8gcHJldmVudFxuICAvLyBgY2FuY2VsYCBwb3RlbnRpYWxseSBiZWluZyBhc3NpZ25lZFxuICAvLyB0byB0aGUgbmF0aXZlIHJBRiBmdW5jdGlvblxuICBpZighbmF0aXZlKSB7XG4gICAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZm4pXG4gIH1cbiAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZnVuY3Rpb24oKSB7XG4gICAgdHJ5e1xuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgIH1cbiAgfSlcbn1cbm1vZHVsZS5leHBvcnRzLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICBjYWYuYXBwbHkoZ2xvYmFsLCBhcmd1bWVudHMpXG59XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuLy8gR2VuZXJhdGVkIGJ5IENvZmZlZVNjcmlwdCAxLjYuM1xuKGZ1bmN0aW9uKCkge1xuICB2YXIgZ2V0TmFub1NlY29uZHMsIGhydGltZSwgbG9hZFRpbWU7XG5cbiAgaWYgKCh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcGVyZm9ybWFuY2UgIT09IG51bGwpICYmIHBlcmZvcm1hbmNlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgfTtcbiAgfSBlbHNlIGlmICgodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2VzcyAhPT0gbnVsbCkgJiYgcHJvY2Vzcy5ocnRpbWUpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIChnZXROYW5vU2Vjb25kcygpIC0gbG9hZFRpbWUpIC8gMWU2O1xuICAgIH07XG4gICAgaHJ0aW1lID0gcHJvY2Vzcy5ocnRpbWU7XG4gICAgZ2V0TmFub1NlY29uZHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBocjtcbiAgICAgIGhyID0gaHJ0aW1lKCk7XG4gICAgICByZXR1cm4gaHJbMF0gKiAxZTkgKyBoclsxXTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gZ2V0TmFub1NlY29uZHMoKTtcbiAgfSBlbHNlIGlmIChEYXRlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gRGF0ZS5ub3coKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxufSkuY2FsbCh0aGlzKTtcblxuLypcbi8vQCBzb3VyY2VNYXBwaW5nVVJMPXBlcmZvcm1hbmNlLW5vdy5tYXBcbiovXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiKSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5yb3V0ZXM9ZSgpfX0oZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbnZhciBsb2NhbFJvdXRlcyA9IFtdO1xuXG5cbi8qKlxuICogQ29udmVydCBwYXRoIHRvIHJvdXRlIG9iamVjdFxuICpcbiAqIEEgc3RyaW5nIG9yIFJlZ0V4cCBzaG91bGQgYmUgcGFzc2VkLFxuICogd2lsbCByZXR1cm4geyByZSwgc3JjLCBrZXlzfSBvYmpcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmcgLyBSZWdFeHB9IHBhdGhcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG52YXIgUm91dGUgPSBmdW5jdGlvbihwYXRoKXtcbiAgLy91c2luZyAnbmV3JyBpcyBvcHRpb25hbFxuXG4gIHZhciBzcmMsIHJlLCBrZXlzID0gW107XG5cbiAgaWYocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCl7XG4gICAgcmUgPSBwYXRoO1xuICAgIHNyYyA9IHBhdGgudG9TdHJpbmcoKTtcbiAgfWVsc2V7XG4gICAgcmUgPSBwYXRoVG9SZWdFeHAocGF0aCwga2V5cyk7XG4gICAgc3JjID0gcGF0aDtcbiAgfVxuXG4gIHJldHVybiB7XG4gIFx0IHJlOiByZSxcbiAgXHQgc3JjOiBwYXRoLnRvU3RyaW5nKCksXG4gIFx0IGtleXM6IGtleXNcbiAgfVxufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLFxuICogcmV0dXJuaW5nIGEgcmVndWxhciBleHByZXNzaW9uLlxuICpcbiAqIEFuIGVtcHR5IGFycmF5IHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aGljaCB3aWxsIGNvbnRhaW4gdGhlIHBsYWNlaG9sZGVyXG4gKiBrZXkgbmFtZXMuIEZvciBleGFtcGxlIFwiL3VzZXIvOmlkXCIgd2lsbFxuICogdGhlbiBjb250YWluIFtcImlkXCJdLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9IGtleXNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xudmFyIHBhdGhUb1JlZ0V4cCA9IGZ1bmN0aW9uIChwYXRoLCBrZXlzKSB7XG5cdHBhdGggPSBwYXRoXG5cdFx0LmNvbmNhdCgnLz8nKVxuXHRcdC5yZXBsYWNlKC9cXC9cXCgvZywgJyg/Oi8nKVxuXHRcdC5yZXBsYWNlKC8oXFwvKT8oXFwuKT86KFxcdyspKD86KFxcKC4qP1xcKSkpPyhcXD8pP3xcXCovZywgZnVuY3Rpb24oXywgc2xhc2gsIGZvcm1hdCwga2V5LCBjYXB0dXJlLCBvcHRpb25hbCl7XG5cdFx0XHRpZiAoXyA9PT0gXCIqXCIpe1xuXHRcdFx0XHRrZXlzLnB1c2godW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIF87XG5cdFx0XHR9XG5cblx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0c2xhc2ggPSBzbGFzaCB8fCAnJztcblx0XHRcdHJldHVybiAnJ1xuXHRcdFx0XHQrIChvcHRpb25hbCA/ICcnIDogc2xhc2gpXG5cdFx0XHRcdCsgJyg/Oidcblx0XHRcdFx0KyAob3B0aW9uYWwgPyBzbGFzaCA6ICcnKVxuXHRcdFx0XHQrIChmb3JtYXQgfHwgJycpICsgKGNhcHR1cmUgfHwgJyhbXi9dKz8pJykgKyAnKSdcblx0XHRcdFx0KyAob3B0aW9uYWwgfHwgJycpO1xuXHRcdH0pXG5cdFx0LnJlcGxhY2UoLyhbXFwvLl0pL2csICdcXFxcJDEnKVxuXHRcdC5yZXBsYWNlKC9cXCovZywgJyguKiknKTtcblx0cmV0dXJuIG5ldyBSZWdFeHAoJ14nICsgcGF0aCArICckJywgJ2knKTtcbn07XG5cbi8qKlxuICogQXR0ZW1wdCB0byBtYXRjaCB0aGUgZ2l2ZW4gcmVxdWVzdCB0b1xuICogb25lIG9mIHRoZSByb3V0ZXMuIFdoZW4gc3VjY2Vzc2Z1bFxuICogYSAge2ZuLCBwYXJhbXMsIHNwbGF0c30gb2JqIGlzIHJldHVybmVkXG4gKlxuICogQHBhcmFtICB7QXJyYXl9IHJvdXRlc1xuICogQHBhcmFtICB7U3RyaW5nfSB1cmlcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xudmFyIG1hdGNoID0gZnVuY3Rpb24gKHJvdXRlcywgdXJpLCBzdGFydEF0KSB7XG5cdHZhciBjYXB0dXJlcywgaSA9IHN0YXJ0QXQgfHwgMDtcblxuXHRmb3IgKHZhciBsZW4gPSByb3V0ZXMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcblx0XHR2YXIgcm91dGUgPSByb3V0ZXNbaV0sXG5cdFx0ICAgIHJlID0gcm91dGUucmUsXG5cdFx0ICAgIGtleXMgPSByb3V0ZS5rZXlzLFxuXHRcdCAgICBzcGxhdHMgPSBbXSxcblx0XHQgICAgcGFyYW1zID0ge307XG5cblx0XHRpZiAoY2FwdHVyZXMgPSB1cmkubWF0Y2gocmUpKSB7XG5cdFx0XHRmb3IgKHZhciBqID0gMSwgbGVuID0gY2FwdHVyZXMubGVuZ3RoOyBqIDwgbGVuOyArK2opIHtcblx0XHRcdFx0dmFyIGtleSA9IGtleXNbai0xXSxcblx0XHRcdFx0XHR2YWwgPSB0eXBlb2YgY2FwdHVyZXNbal0gPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHVuZXNjYXBlKGNhcHR1cmVzW2pdKVxuXHRcdFx0XHRcdFx0OiBjYXB0dXJlc1tqXTtcblx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdHBhcmFtc1trZXldID0gdmFsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNwbGF0cy5wdXNoKHZhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBhcmFtczogcGFyYW1zLFxuXHRcdFx0XHRzcGxhdHM6IHNwbGF0cyxcblx0XHRcdFx0cm91dGU6IHJvdXRlLnNyYyxcblx0XHRcdFx0bmV4dDogaSArIDFcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIERlZmF1bHQgXCJub3JtYWxcIiByb3V0ZXIgY29uc3RydWN0b3IuXG4gKiBhY2NlcHRzIHBhdGgsIGZuIHR1cGxlcyB2aWEgYWRkUm91dGVcbiAqIHJldHVybnMge2ZuLCBwYXJhbXMsIHNwbGF0cywgcm91dGV9XG4gKiAgdmlhIG1hdGNoXG4gKlxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZXIgPSBmdW5jdGlvbigpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG4gIHJldHVybiB7XG4gICAgcm91dGVzOiBbXSxcbiAgICByb3V0ZU1hcCA6IHt9LFxuICAgIGFkZFJvdXRlOiBmdW5jdGlvbihwYXRoLCBmbil7XG4gICAgICBpZiAoIXBhdGgpIHRocm93IG5ldyBFcnJvcignIHJvdXRlIHJlcXVpcmVzIGEgcGF0aCcpO1xuICAgICAgaWYgKCFmbikgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgJyArIHBhdGgudG9TdHJpbmcoKSArICcgcmVxdWlyZXMgYSBjYWxsYmFjaycpO1xuXG4gICAgICB2YXIgcm91dGUgPSBSb3V0ZShwYXRoKTtcbiAgICAgIHJvdXRlLmZuID0gZm47XG5cbiAgICAgIHRoaXMucm91dGVzLnB1c2gocm91dGUpO1xuICAgICAgdGhpcy5yb3V0ZU1hcFtwYXRoXSA9IGZuO1xuICAgIH0sXG5cbiAgICBtYXRjaDogZnVuY3Rpb24ocGF0aG5hbWUsIHN0YXJ0QXQpe1xuICAgICAgdmFyIHJvdXRlID0gbWF0Y2godGhpcy5yb3V0ZXMsIHBhdGhuYW1lLCBzdGFydEF0KTtcbiAgICAgIGlmKHJvdXRlKXtcbiAgICAgICAgcm91dGUuZm4gPSB0aGlzLnJvdXRlTWFwW3JvdXRlLnJvdXRlXTtcbiAgICAgICAgcm91dGUubmV4dCA9IHRoaXMubWF0Y2guYmluZCh0aGlzLCBwYXRobmFtZSwgcm91dGUubmV4dClcbiAgICAgIH1cbiAgICAgIHJldHVybiByb3V0ZTtcbiAgICB9XG4gIH1cbn07XG5cblJvdXRlci5Sb3V0ZSA9IFJvdXRlXG5Sb3V0ZXIucGF0aFRvUmVnRXhwID0gcGF0aFRvUmVnRXhwXG5Sb3V0ZXIubWF0Y2ggPSBtYXRjaFxuLy8gYmFjayBjb21wYXRcblJvdXRlci5Sb3V0ZXIgPSBSb3V0ZXJcblxubW9kdWxlLmV4cG9ydHMgPSBSb3V0ZXJcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciB3aW5kb3cgPSByZXF1aXJlKFwiZ2xvYmFsL3dpbmRvd1wiKVxudmFyIG9uY2UgPSByZXF1aXJlKFwib25jZVwiKVxuXG52YXIgbWVzc2FnZXMgPSB7XG4gICAgXCIwXCI6IFwiSW50ZXJuYWwgWE1MSHR0cFJlcXVlc3QgRXJyb3JcIixcbiAgICBcIjRcIjogXCI0eHggQ2xpZW50IEVycm9yXCIsXG4gICAgXCI1XCI6IFwiNXh4IFNlcnZlciBFcnJvclwiXG59XG5cbnZhciBYSFIgPSB3aW5kb3cuWE1MSHR0cFJlcXVlc3QgfHwgbm9vcFxudmFyIFhEUiA9IFwid2l0aENyZWRlbnRpYWxzXCIgaW4gKG5ldyBYSFIoKSkgPyBYSFIgOiB3aW5kb3cuWERvbWFpblJlcXVlc3RcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVYSFJcblxuZnVuY3Rpb24gY3JlYXRlWEhSKG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7IHVyaTogb3B0aW9ucyB9XG4gICAgfVxuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICBjYWxsYmFjayA9IG9uY2UoY2FsbGJhY2spXG5cbiAgICB2YXIgeGhyID0gb3B0aW9ucy54aHIgfHwgbnVsbFxuXG4gICAgaWYgKCF4aHIpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuY29ycyB8fCBvcHRpb25zLnVzZVhEUikge1xuICAgICAgICAgICAgeGhyID0gbmV3IFhEUigpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgeGhyID0gbmV3IFhIUigpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdXJpID0geGhyLnVybCA9IG9wdGlvbnMudXJpIHx8IG9wdGlvbnMudXJsO1xuICAgIHZhciBtZXRob2QgPSB4aHIubWV0aG9kID0gb3B0aW9ucy5tZXRob2QgfHwgXCJHRVRcIlxuICAgIHZhciBib2R5ID0gb3B0aW9ucy5ib2R5IHx8IG9wdGlvbnMuZGF0YVxuICAgIHZhciBoZWFkZXJzID0geGhyLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge31cbiAgICB2YXIgc3luYyA9ICEhb3B0aW9ucy5zeW5jXG4gICAgdmFyIGlzSnNvbiA9IGZhbHNlXG4gICAgdmFyIGtleVxuXG4gICAgaWYgKFwianNvblwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaXNKc29uID0gdHJ1ZVxuICAgICAgICBoZWFkZXJzW1wiQWNjZXB0XCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgaWYgKG1ldGhvZCAhPT0gXCJHRVRcIiAmJiBtZXRob2QgIT09IFwiSEVBRFwiKSB7XG4gICAgICAgICAgICBoZWFkZXJzW1wiQ29udGVudC1UeXBlXCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgICAgIGJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gcmVhZHlzdGF0ZWNoYW5nZVxuICAgIHhoci5vbmxvYWQgPSBsb2FkXG4gICAgeGhyLm9uZXJyb3IgPSBlcnJvclxuICAgIC8vIElFOSBtdXN0IGhhdmUgb25wcm9ncmVzcyBiZSBzZXQgdG8gYSB1bmlxdWUgZnVuY3Rpb24uXG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElFIG11c3QgZGllXG4gICAgfVxuICAgIC8vIGhhdGUgSUVcbiAgICB4aHIub250aW1lb3V0ID0gbm9vcFxuICAgIHhoci5vcGVuKG1ldGhvZCwgdXJpLCAhc3luYylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIGlmIChvcHRpb25zLndpdGhDcmVkZW50aWFscyB8fCAob3B0aW9ucy5jb3JzICYmIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzICE9PSBmYWxzZSkpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG5cbiAgICAvLyBDYW5ub3Qgc2V0IHRpbWVvdXQgd2l0aCBzeW5jIHJlcXVlc3RcbiAgICBpZiAoIXN5bmMpIHtcbiAgICAgICAgeGhyLnRpbWVvdXQgPSBcInRpbWVvdXRcIiBpbiBvcHRpb25zID8gb3B0aW9ucy50aW1lb3V0IDogNTAwMFxuICAgIH1cblxuICAgIGlmICh4aHIuc2V0UmVxdWVzdEhlYWRlcikge1xuICAgICAgICBmb3Ioa2V5IGluIGhlYWRlcnMpe1xuICAgICAgICAgICAgaWYoaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkhlYWRlcnMgY2Fubm90IGJlIHNldCBvbiBhbiBYRG9tYWluUmVxdWVzdCBvYmplY3RcIik7XG4gICAgfVxuXG4gICAgaWYgKFwicmVzcG9uc2VUeXBlXCIgaW4gb3B0aW9ucykge1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gb3B0aW9ucy5yZXNwb25zZVR5cGVcbiAgICB9XG4gICAgXG4gICAgaWYgKFwiYmVmb3JlU2VuZFwiIGluIG9wdGlvbnMgJiYgXG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmJlZm9yZVNlbmQgPT09IFwiZnVuY3Rpb25cIlxuICAgICkge1xuICAgICAgICBvcHRpb25zLmJlZm9yZVNlbmQoeGhyKVxuICAgIH1cblxuICAgIHhoci5zZW5kKGJvZHkpXG5cbiAgICByZXR1cm4geGhyXG5cbiAgICBmdW5jdGlvbiByZWFkeXN0YXRlY2hhbmdlKCkge1xuICAgICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICAgIGxvYWQoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZCgpIHtcbiAgICAgICAgdmFyIGVycm9yID0gbnVsbFxuICAgICAgICB2YXIgc3RhdHVzID0geGhyLnN0YXR1c0NvZGUgPSB4aHIuc3RhdHVzXG4gICAgICAgIC8vIENocm9tZSB3aXRoIHJlcXVlc3RUeXBlPWJsb2IgdGhyb3dzIGVycm9ycyBhcnJvdW5kIHdoZW4gZXZlbiB0ZXN0aW5nIGFjY2VzcyB0byByZXNwb25zZVRleHRcbiAgICAgICAgdmFyIGJvZHkgPSBudWxsXG5cbiAgICAgICAgaWYgKHhoci5yZXNwb25zZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5ib2R5ID0geGhyLnJlc3BvbnNlXG4gICAgICAgIH0gZWxzZSBpZiAoeGhyLnJlc3BvbnNlVHlwZSA9PT0gJ3RleHQnIHx8ICF4aHIucmVzcG9uc2VUeXBlKSB7XG4gICAgICAgICAgICBib2R5ID0geGhyLmJvZHkgPSB4aHIucmVzcG9uc2VUZXh0IHx8IHhoci5yZXNwb25zZVhNTFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXR1cyA9PT0gMTIyMykge1xuICAgICAgICAgICAgc3RhdHVzID0gMjA0XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdHVzID09PSAwIHx8IChzdGF0dXMgPj0gNDAwICYmIHN0YXR1cyA8IDYwMCkpIHtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlID0gKHR5cGVvZiBib2R5ID09PSBcInN0cmluZ1wiID8gYm9keSA6IGZhbHNlKSB8fFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VzW1N0cmluZyhzdGF0dXMpLmNoYXJBdCgwKV1cbiAgICAgICAgICAgIGVycm9yID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gICAgICAgICAgICBlcnJvci5zdGF0dXNDb2RlID0gc3RhdHVzXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHhoci5zdGF0dXMgPSB4aHIuc3RhdHVzQ29kZSA9IHN0YXR1cztcblxuICAgICAgICBpZiAoaXNKc29uKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJvZHkgPSB4aHIuYm9keSA9IEpTT04ucGFyc2UoYm9keSlcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhlcnJvciwgeGhyLCBib2R5KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKGV2dCkge1xuICAgICAgICBjYWxsYmFjayhldnQsIHhocilcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gd2luZG93XG59IGVsc2UgaWYgKHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbFxufSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHt9XG59XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwibW9kdWxlLmV4cG9ydHMgPSBvbmNlXG5cbm9uY2UucHJvdG8gPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bmN0aW9uLnByb3RvdHlwZSwgJ29uY2UnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBvbmNlKHRoaXMpXG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWVcbiAgfSlcbn0pXG5cbmZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gIHZhciBjYWxsZWQgPSBmYWxzZVxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGlmIChjYWxsZWQpIHJldHVyblxuICAgIGNhbGxlZCA9IHRydWVcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICB9XG59XG4iXX0=
