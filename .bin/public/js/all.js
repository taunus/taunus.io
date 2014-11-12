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
},{"jadum/runtime":16}],7:[function(require,module,exports){
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
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    [1]: /getting-started\n");
}
}
},{"jadum/runtime":16}],8:[function(require,module,exports){
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
},{"jadum/runtime":16}],9:[function(require,module,exports){
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
},{"jadum/runtime":16}],10:[function(require,module,exports){
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
},{"jadum/runtime":16}],11:[function(require,module,exports){
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
},{"jadum/runtime":16}],12:[function(require,module,exports){
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
},{"jadum/runtime":16}],13:[function(require,module,exports){
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
  '/:catchall*': {
    action: 'error/not-found'
  }
};

module.exports = {
  templates: templates,
  controllers: controllers,
  routes: routes
};

},{"./views/documentation/about.js":6,"./views/documentation/api.js":7,"./views/documentation/complements.js":8,"./views/documentation/getting-started.js":9,"./views/documentation/performance.js":10,"./views/error/not-found.js":11,"./views/layout.js":12}],14:[function(require,module,exports){
'use strict';

// import the taunus module
var taunus = require('taunus');

// import the wiring module exported by Taunus
var wiring = require('../../.bin/wiring');

// get the <main> element
var main = document.getElementById('application-root');

// mount taunus so it starts its routing engine
taunus.mount(main, wiring);

},{"../../.bin/wiring":13,"taunus":24}],15:[function(require,module,exports){
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
},{}],16:[function(require,module,exports){
module.exports = require('jade/runtime');

},{"jade/runtime":15}],17:[function(require,module,exports){
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

},{"./emitter":20,"./fetcher":22,"./isNative":26,"./partial":30,"./router":31,"./state":32}],18:[function(require,module,exports){
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

},{"./once":29,"./stores/idb":33,"./stores/raw":34}],19:[function(require,module,exports){
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

},{"./cache":18,"./emitter":20,"./interceptor":25,"./state":32,"./stores/idb":33}],20:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');

module.exports = emitter({}, { throws: false });

},{"contra.emitter":37}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
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

},{"./emitter":20,"./interceptor":25,"./xhr":36}],23:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var links = require('./links');

function attach () {
  emitter.on('start', links);
}

module.exports = {
  attach: attach
};

},{"./emitter":20,"./links":27}],24:[function(require,module,exports){
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

},{"./activator":17,"./emitter":20,"./hooks":23,"./interceptor":25,"./mount":28,"./partial":30,"./router":31,"./state":32}],25:[function(require,module,exports){
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

},{"./once":29,"./router":31,"contra.emitter":37}],26:[function(require,module,exports){
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

},{}],27:[function(require,module,exports){
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

},{"./activator":17,"./events":21,"./fetcher":22,"./router":31,"./state":32}],28:[function(require,module,exports){
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
},{"./activator":17,"./caching":19,"./fetcher":22,"./router":31,"./state":32,"./unescape":35}],29:[function(require,module,exports){
'use strict';

module.exports = function (fn) {
  var used;
  return function once () {
    if (used) { return; } used = true;
    return fn.apply(this, arguments);
  };
};

},{}],30:[function(require,module,exports){
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

},{"./emitter":20,"./state":32,"raf":40}],31:[function(require,module,exports){
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

},{"fast-url-parser":39,"routes":42}],32:[function(require,module,exports){
'use strict';

module.exports = {
  container: null
};

},{}],33:[function(require,module,exports){
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
},{}],34:[function(require,module,exports){
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

},{}],35:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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

},{"./emitter":20,"xhr":43}],37:[function(require,module,exports){
module.exports = require('./src/contra.emitter.js');

},{"./src/contra.emitter.js":38}],38:[function(require,module,exports){
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
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],39:[function(require,module,exports){
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

},{"punycode":2,"querystring":5}],40:[function(require,module,exports){
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

},{"performance-now":41}],41:[function(require,module,exports){
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
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],42:[function(require,module,exports){
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
},{}],43:[function(require,module,exports){
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

},{"global/window":44,"once":45,"parse-headers":49}],44:[function(require,module,exports){
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
},{}],45:[function(require,module,exports){
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

},{}],46:[function(require,module,exports){
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

},{"is-function":47}],47:[function(require,module,exports){
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

},{}],48:[function(require,module,exports){

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

},{}],49:[function(require,module,exports){
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
},{"for-each":46,"trim":48}]},{},[14])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9tYWluLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vbm9kZV9tb2R1bGVzL2phZGUvcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9hY3RpdmF0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2NhY2hpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZXZlbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZmV0Y2hlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2hvb2tzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pbnRlcmNlcHRvci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2lzTmF0aXZlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbGlua3MuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9tb3VudC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9wYXJ0aWFsLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcm91dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RhdGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdG9yZXMvaWRiLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL3Jhdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3VuZXNjYXBlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIveGhyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvc3JjL2NvbnRyYS5lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9mYXN0LXVybC1wYXJzZXIvc3JjL3VybHBhcnNlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcmFmL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9yb3V0ZXMvZGlzdC9yb3V0ZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9nbG9iYWwvd2luZG93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL29uY2Uvb25jZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy9mb3ItZWFjaC9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy9mb3ItZWFjaC9ub2RlX21vZHVsZXMvaXMtZnVuY3Rpb24vaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvdHJpbS9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL3BhcnNlLWhlYWRlcnMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyohIGh0dHA6Ly9tdGhzLmJlL3B1bnljb2RlIHYxLjIuNCBieSBAbWF0aGlhcyAqL1xuOyhmdW5jdGlvbihyb290KSB7XG5cblx0LyoqIERldGVjdCBmcmVlIHZhcmlhYmxlcyAqL1xuXHR2YXIgZnJlZUV4cG9ydHMgPSB0eXBlb2YgZXhwb3J0cyA9PSAnb2JqZWN0JyAmJiBleHBvcnRzO1xuXHR2YXIgZnJlZU1vZHVsZSA9IHR5cGVvZiBtb2R1bGUgPT0gJ29iamVjdCcgJiYgbW9kdWxlICYmXG5cdFx0bW9kdWxlLmV4cG9ydHMgPT0gZnJlZUV4cG9ydHMgJiYgbW9kdWxlO1xuXHR2YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsO1xuXHRpZiAoZnJlZUdsb2JhbC5nbG9iYWwgPT09IGZyZWVHbG9iYWwgfHwgZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwpIHtcblx0XHRyb290ID0gZnJlZUdsb2JhbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYHB1bnljb2RlYCBvYmplY3QuXG5cdCAqIEBuYW1lIHB1bnljb2RlXG5cdCAqIEB0eXBlIE9iamVjdFxuXHQgKi9cblx0dmFyIHB1bnljb2RlLFxuXG5cdC8qKiBIaWdoZXN0IHBvc2l0aXZlIHNpZ25lZCAzMi1iaXQgZmxvYXQgdmFsdWUgKi9cblx0bWF4SW50ID0gMjE0NzQ4MzY0NywgLy8gYWthLiAweDdGRkZGRkZGIG9yIDJeMzEtMVxuXG5cdC8qKiBCb290c3RyaW5nIHBhcmFtZXRlcnMgKi9cblx0YmFzZSA9IDM2LFxuXHR0TWluID0gMSxcblx0dE1heCA9IDI2LFxuXHRza2V3ID0gMzgsXG5cdGRhbXAgPSA3MDAsXG5cdGluaXRpYWxCaWFzID0gNzIsXG5cdGluaXRpYWxOID0gMTI4LCAvLyAweDgwXG5cdGRlbGltaXRlciA9ICctJywgLy8gJ1xceDJEJ1xuXG5cdC8qKiBSZWd1bGFyIGV4cHJlc3Npb25zICovXG5cdHJlZ2V4UHVueWNvZGUgPSAvXnhuLS0vLFxuXHRyZWdleE5vbkFTQ0lJID0gL1teIC1+XS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9cXHgyRXxcXHUzMDAyfFxcdUZGMEV8XFx1RkY2MS9nLCAvLyBSRkMgMzQ5MCBzZXBhcmF0b3JzXG5cblx0LyoqIEVycm9yIG1lc3NhZ2VzICovXG5cdGVycm9ycyA9IHtcblx0XHQnb3ZlcmZsb3cnOiAnT3ZlcmZsb3c6IGlucHV0IG5lZWRzIHdpZGVyIGludGVnZXJzIHRvIHByb2Nlc3MnLFxuXHRcdCdub3QtYmFzaWMnOiAnSWxsZWdhbCBpbnB1dCA+PSAweDgwIChub3QgYSBiYXNpYyBjb2RlIHBvaW50KScsXG5cdFx0J2ludmFsaWQtaW5wdXQnOiAnSW52YWxpZCBpbnB1dCdcblx0fSxcblxuXHQvKiogQ29udmVuaWVuY2Ugc2hvcnRjdXRzICovXG5cdGJhc2VNaW51c1RNaW4gPSBiYXNlIC0gdE1pbixcblx0Zmxvb3IgPSBNYXRoLmZsb29yLFxuXHRzdHJpbmdGcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLFxuXG5cdC8qKiBUZW1wb3JhcnkgdmFyaWFibGUgKi9cblx0a2V5O1xuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgZXJyb3IgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIGVycm9yIHR5cGUuXG5cdCAqIEByZXR1cm5zIHtFcnJvcn0gVGhyb3dzIGEgYFJhbmdlRXJyb3JgIHdpdGggdGhlIGFwcGxpY2FibGUgZXJyb3IgbWVzc2FnZS5cblx0ICovXG5cdGZ1bmN0aW9uIGVycm9yKHR5cGUpIHtcblx0XHR0aHJvdyBSYW5nZUVycm9yKGVycm9yc1t0eXBlXSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGBBcnJheSNtYXBgIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeSBhcnJheVxuXHQgKiBpdGVtLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IGFycmF5IG9mIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXAoYXJyYXksIGZuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR3aGlsZSAobGVuZ3RoLS0pIHtcblx0XHRcdGFycmF5W2xlbmd0aF0gPSBmbihhcnJheVtsZW5ndGhdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5O1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncy5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeVxuXHQgKiBjaGFyYWN0ZXIuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgc3RyaW5nIG9mIGNoYXJhY3RlcnMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrXG5cdCAqIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwRG9tYWluKHN0cmluZywgZm4pIHtcblx0XHRyZXR1cm4gbWFwKHN0cmluZy5zcGxpdChyZWdleFNlcGFyYXRvcnMpLCBmbikuam9pbignLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcblx0ICogY2hhcmFjdGVyIGluIHRoZSBzdHJpbmcuIFdoaWxlIEphdmFTY3JpcHQgdXNlcyBVQ1MtMiBpbnRlcm5hbGx5LFxuXHQgKiB0aGlzIGZ1bmN0aW9uIHdpbGwgY29udmVydCBhIHBhaXIgb2Ygc3Vycm9nYXRlIGhhbHZlcyAoZWFjaCBvZiB3aGljaFxuXHQgKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcblx0ICogbWF0Y2hpbmcgVVRGLTE2LlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmVuY29kZWBcblx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZGVjb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmcgVGhlIFVuaWNvZGUgaW5wdXQgc3RyaW5nIChVQ1MtMikuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gVGhlIG5ldyBhcnJheSBvZiBjb2RlIHBvaW50cy5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJkZWNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBjb3VudGVyID0gMCxcblx0XHQgICAgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aCxcblx0XHQgICAgdmFsdWUsXG5cdFx0ICAgIGV4dHJhO1xuXHRcdHdoaWxlIChjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGhpZ2ggc3Vycm9nYXRlLCBhbmQgdGhlcmUgaXMgYSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRleHRyYSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRcdGlmICgoZXh0cmEgJiAweEZDMDApID09IDB4REMwMCkgeyAvLyBsb3cgc3Vycm9nYXRlXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1bm1hdGNoZWQgc3Vycm9nYXRlOyBvbmx5IGFwcGVuZCB0aGlzIGNvZGUgdW5pdCwgaW4gY2FzZSB0aGUgbmV4dFxuXHRcdFx0XHRcdC8vIGNvZGUgdW5pdCBpcyB0aGUgaGlnaCBzdXJyb2dhdGUgb2YgYSBzdXJyb2dhdGUgcGFpclxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRjb3VudGVyLS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3RyaW5nIGJhc2VkIG9uIGFuIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZGVjb2RlYFxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBlbmNvZGVcblx0ICogQHBhcmFtIHtBcnJheX0gY29kZVBvaW50cyBUaGUgYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHJldHVybiBtYXAoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YXIgb3V0cHV0ID0gJyc7XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGJhc2ljIGNvZGUgcG9pbnQgaW50byBhIGRpZ2l0L2ludGVnZXIuXG5cdCAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gY29kZVBvaW50IFRoZSBiYXNpYyBudW1lcmljIGNvZGUgcG9pbnQgdmFsdWUuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGluIHRoZSByYW5nZSBgMGAgdG8gYGJhc2UgLSAxYCwgb3IgYGJhc2VgIGlmXG5cdCAqIHRoZSBjb2RlIHBvaW50IGRvZXMgbm90IHJlcHJlc2VudCBhIHZhbHVlLlxuXHQgKi9cblx0ZnVuY3Rpb24gYmFzaWNUb0RpZ2l0KGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgLSA0OCA8IDEwKSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gMjI7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA2NSA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gNjU7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA5NyA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gOTc7XG5cdFx0fVxuXHRcdHJldHVybiBiYXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGlnaXQvaW50ZWdlciBpbnRvIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHNlZSBgYmFzaWNUb0RpZ2l0KClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBkaWdpdCBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBiYXNpYyBjb2RlIHBvaW50IHdob3NlIHZhbHVlICh3aGVuIHVzZWQgZm9yXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG5cdCAqIGAwYCB0byBgYmFzZSAtIDFgLiBJZiBgZmxhZ2AgaXMgbm9uLXplcm8sIHRoZSB1cHBlcmNhc2UgZm9ybSBpc1xuXHQgKiB1c2VkOyBlbHNlLCB0aGUgbG93ZXJjYXNlIGZvcm0gaXMgdXNlZC4gVGhlIGJlaGF2aW9yIGlzIHVuZGVmaW5lZFxuXHQgKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGlnaXRUb0Jhc2ljKGRpZ2l0LCBmbGFnKSB7XG5cdFx0Ly8gIDAuLjI1IG1hcCB0byBBU0NJSSBhLi56IG9yIEEuLlpcblx0XHQvLyAyNi4uMzUgbWFwIHRvIEFTQ0lJIDAuLjlcblx0XHRyZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogKGRpZ2l0IDwgMjYpIC0gKChmbGFnICE9IDApIDw8IDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG5cdCAqIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0OTIjc2VjdGlvbi0zLjRcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGFkYXB0KGRlbHRhLCBudW1Qb2ludHMsIGZpcnN0VGltZSkge1xuXHRcdHZhciBrID0gMDtcblx0XHRkZWx0YSA9IGZpcnN0VGltZSA/IGZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuXHRcdGRlbHRhICs9IGZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblx0XHRmb3IgKC8qIG5vIGluaXRpYWxpemF0aW9uICovOyBkZWx0YSA+IGJhc2VNaW51c1RNaW4gKiB0TWF4ID4+IDE7IGsgKz0gYmFzZSkge1xuXHRcdFx0ZGVsdGEgPSBmbG9vcihkZWx0YSAvIGJhc2VNaW51c1RNaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gZmxvb3IoayArIChiYXNlTWludXNUTWluICsgMSkgKiBkZWx0YSAvIChkZWx0YSArIHNrZXcpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMgdG8gYSBzdHJpbmcgb2YgVW5pY29kZVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBkZWNvZGUoaW5wdXQpIHtcblx0XHQvLyBEb24ndCB1c2UgVUNTLTJcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuXHRcdCAgICBvdXQsXG5cdFx0ICAgIGkgPSAwLFxuXHRcdCAgICBuID0gaW5pdGlhbE4sXG5cdFx0ICAgIGJpYXMgPSBpbml0aWFsQmlhcyxcblx0XHQgICAgYmFzaWMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIGluZGV4LFxuXHRcdCAgICBvbGRpLFxuXHRcdCAgICB3LFxuXHRcdCAgICBrLFxuXHRcdCAgICBkaWdpdCxcblx0XHQgICAgdCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuNCcsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoJ3B1bnljb2RlJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgIWZyZWVFeHBvcnRzLm5vZGVUeXBlKSB7XG5cdFx0aWYgKGZyZWVNb2R1bGUpIHsgLy8gaW4gTm9kZS5qcyBvciBSaW5nb0pTIHYwLjguMCtcblx0XHRcdGZyZWVNb2R1bGUuZXhwb3J0cyA9IHB1bnljb2RlO1xuXHRcdH0gZWxzZSB7IC8vIGluIE5hcndoYWwgb3IgUmluZ29KUyB2MC43LjAtXG5cdFx0XHRmb3IgKGtleSBpbiBwdW55Y29kZSkge1xuXHRcdFx0XHRwdW55Y29kZS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIChmcmVlRXhwb3J0c1trZXldID0gcHVueWNvZGVba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBpbiBSaGlubyBvciBhIHdlYiBicm93c2VyXG5cdFx0cm9vdC5wdW55Y29kZSA9IHB1bnljb2RlO1xuXHR9XG5cbn0odGhpcykpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhYm91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktdGF1bnVzLVxcXCI+V2h5IFRhdW51cz88L2gxPlxcbjxwPlRhdW51cyBmb2N1c2VzIG9uIGRlbGl2ZXJpbmcgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGV4cGVyaWVuY2UgdG8gdGhlIGVuZC11c2VyLCB3aGlsZSBwcm92aWRpbmcgPGVtPmEgcmVhc29uYWJsZSBkZXZlbG9wbWVudCBleHBlcmllbmNlPC9lbT4gYXMgd2VsbC4gPHN0cm9uZz5UYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudDwvc3Ryb25nPi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS48L3A+XFxuPHA+V2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgPHN0cm9uZz48YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXFwiPnVzYWJpbGl0eTwvYT4gYW5kIHBlcmZvcm1hbmNlIGFyZSBib3RoIGNvcmUgY29uY2VybnM8L3N0cm9uZz4gZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyA8c3Ryb25nPnN0aWxsIGV4cGVjdGVkIHRvIHdvcms8L3N0cm9uZz4uPC9wPlxcbjxwPkZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSA8Y29kZT5jbGljazwvY29kZT4gZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQmIzM5O3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0IDxzdHJvbmc+b3VyIHNpdGVzIGRvbiYjMzk7dCBuZWVkIHRvIGxvb2sgYW5kIGJlaGF2ZSB0aGUgc2FtZSBvbiBldmVyeSBicm93c2VyPC9zdHJvbmc+LiBTaW1pbGFybHksIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+cGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZDwvYT4gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC48L3A+XFxuPHA+V2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCA8ZW0+KG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSk8L2VtPiBvciBiZWNhdXNlIHRoZSB1c2VyIGJsb2NrZWQgSmF2YVNjcmlwdCwgeW91ciBhcHBsaWNhdGlvbiB3aWxsIHN0aWxsIHdvcmshPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcIndoeS1ub3Qtb3RoZXItZnJhbWV3b3Jrcy1cXFwiPldoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz88L2gxPlxcbjxwPk1hbnkgb3RoZXIgZnJhbWV3b3JrcyB3ZXJlbiYjMzk7dCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24mIzM5O3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmRvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnQ8L2E+LiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJiMzOTt0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS48L3A+XFxuPHA+TGF0ZWx5LCB3ZSBjYW4gb2JzZXJ2ZSBtYW55IG1hdHVyZSBvcGVuLXNvdXJjZSBmcmFtZXdvcmtzIGFyZSBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkmIzM5O3JlIGFyY2hpdGVjdGVkLCB3aGVyZSB0aGUgZGV2ZWxvcGVyIGlzIHB1dCBmaXJzdC4gPHN0cm9uZz5UYXVudXMgaXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9oYXNodGFnL2h1bWFuZmlyc3RcXFwiPiNodW1hbmZpcnN0PC9hPjwvc3Ryb25nPiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy48L3A+XFxuPHA+UHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSYjMzk7cmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIDxlbT4odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudCk8L2VtPiwgYW5kIHRoZW4gZW5oYW5jZSBpdCA8c3Ryb25nPmlmIHBvc3NpYmxlPC9zdHJvbmc+IHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91JiMzOTtsbCBiZSBhYmxlIHRvIHJlYWNoIHRoZSBtb3N0IHBlb3BsZSB3aXRoIHlvdXIgY29yZSBleHBlcmllbmNlLCBhbmQgeW91JiMzOTtsbCBhbHNvIGJlIGFibGUgdG8gcHJvdmlkZSBodW1hbnMgaW4gbW9yZSBtb2Rlcm4gYnJvd3NlcnMgd2l0aCBhbGwgb2YgdGhlIGxhdGVzdCBmZWF0dXJlcyBhbmQgdGVjaG5vbG9naWVzLjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA2LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmZWF0dXJlc1xcXCI+RmVhdHVyZXM8L2gxPlxcbjxwPk91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj53aXRob3V0IGFueSBjb25maWd1cmF0aW9uIG5lZWRlZDwvYT4uIEV2ZW4gd2hpbGUgVGF1bnVzIHByb3ZpZGVzIHNoYXJlZC1yZW5kZXJpbmcgY2FwYWJpbGl0aWVzLCBpdCBvZmZlcnMgY29kZSByZXVzZSBvZiB2aWV3cyBhbmQgcm91dGVzLCBtZWFuaW5nIHlvdSYjMzk7bGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSYjMzk7bGwgYmUgdXNlZCBpbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLjwvcD5cXG48cD5UYXVudXMgZmVhdHVyZXMgYSByZWFzb25hYmx5IGVuaGFuY2VkIGV4cGVyaWVuY2UsIHdoZXJlIGlmIGZlYXR1cmVzIGFyZW4mIzM5O3QgYXZhaWxhYmxlIG9uIGEgYnJvd3NlciwgdGhleSYjMzk7cmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGJ1dCBpZiB0aGF0JiMzOTtzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCYjMzk7bGwgZmFsbCBiYWNrIHRvIHNpbXBseSBub3QgbWVkZGxpbmcgd2l0aCBsaW5rcyBpbnN0ZWFkIG9mIHVzaW5nIGEgY2xpZW50LXNpZGUtb25seSBoYXNoIHJvdXRlci48L3A+XFxuPHA+VGF1bnVzIGNhbiBkZWFsIHdpdGggdmlldyBjYWNoaW5nIG9uIHlvdXIgYmVoYWxmLCBpZiB5b3Ugc28gZGVzaXJlLCB1c2luZyA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+YXN5bmNocm9ub3VzIGVtYmVkZGVkIGRhdGFiYXNlIHN0b3JlczwvYT4gb24gdGhlIGNsaWVudC1zaWRlLiBUdXJucyBvdXQsIHRoZXJlJiMzOTtzIDxhIGhyZWY9XFxcImh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcXCI+cHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREI8L2E+LiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCYjMzk7cyBhdmFpbGFibGUsIGFuZCBpZiBpdCYjMzk7cyBub3QgdGhlbiB2aWV3cyB3b24mIzM5O3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gPHN0cm9uZz5UaGUgc2l0ZSB3b24mIzM5O3Qgc2ltcGx5IHJvbGwgb3ZlciBhbmQgZGllLCB0aG91Z2guPC9zdHJvbmc+PC9wPlxcbjxwPklmIHlvdSYjMzk7dmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlIDxzdHJvbmc+dmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZTwvc3Ryb25nPiwgd2hpY2ggd2lsbCBzdGFydCBkb3dubG9hZGluZyB2aWV3cyBhcyBzb29uIGFzIGh1bWFucyBob3ZlciBvbiBsaW5rcywgYXMgdG8gZGVsaXZlciBhIDxlbT5mYXN0ZXIgcGVyY2VpdmVkIGh1bWFuIGV4cGVyaWVuY2U8L2VtPi48L3A+XFxuPHA+VGF1bnVzIHByb3ZpZGVzIHRoZSBiYXJlIGJvbmVzIGZvciB5b3VyIGFwcGxpY2F0aW9uIHNvIHRoYXQgeW91IGNhbiBzZXBhcmF0ZSBjb25jZXJucyBpbnRvIHJvdXRlcywgY29udHJvbGxlcnMsIG1vZGVscywgYW5kIHZpZXdzLiBUaGVuIGl0IGdldHMgb3V0IG9mIHRoZSB3YXksIGJ5IGRlc2lnbi4gVGhlcmUgYXJlIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+YSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzPC9hPiB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC48L3A+XFxuPHA+V2l0aCBUYXVudXMgeW91JiMzOTtsbCBiZSBpbiBjaGFyZ2UuIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkFyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/PC9hPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJmYW1pbGlhcml0eVxcXCI+RmFtaWxpYXJpdHk8L2gxPlxcbjxwPllvdSBjYW4gdXNlIFRhdW51cyB0byBkZXZlbG9wIGFwcGxpY2F0aW9ucyB1c2luZyB5b3VyIGZhdm9yaXRlIE5vZGUuanMgSFRUUCBzZXJ2ZXIsIDxzdHJvbmc+Ym90aCA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBhcmUgZnVsbHkgc3VwcG9ydGVkPC9zdHJvbmc+LiBJbiBib3RoIGNhc2VzLCB5b3UmIzM5O2xsIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPmJ1aWxkIGNvbnRyb2xsZXJzIHRoZSB3YXkgeW91JiMzOTtyZSBhbHJlYWR5IHVzZWQgdG88L2E+LCBleGNlcHQgeW91IHdvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UmIzM5O2xsIGJlIGFibGUgdG8gZG8gZXZlcnl0aGluZyB5b3UmIzM5O3JlIGFscmVhZHkgYWJsZSB0byBkbywgYW5kIHRoZW4geW91JiMzOTtsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuPC9wPlxcbjxwPllvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCYjMzk7cyBiZWNhdXNlIFRhdW51cyB0cmVhdHMgdmlld3MgYXMgbWVyZSBKYXZhU2NyaXB0IGZ1bmN0aW9ucywgcmF0aGVyIHRoYW4gYmVpbmcgdGllZCBpbnRvIGEgc3BlY2lmaWMgdmlldy1yZW5kZXJpbmcgZW5naW5lLjwvcD5cXG48cD5DbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUganVzdCBmdW5jdGlvbnMsIHRvby4gWW91IGNhbiBicmluZyB5b3VyIG93biBzZWxlY3RvciBlbmdpbmUsIHlvdXIgb3duIEFKQVggbGlicmFyaWVzLCBhbmQgeW91ciBvd24gZGF0YS1iaW5kaW5nIHNvbHV0aW9ucy4gSXQgbWlnaHQgbWVhbiB0aGVyZSYjMzk7cyBhIGJpdCBtb3JlIHdvcmsgaW52b2x2ZWQgZm9yIHlvdSwgYnV0IHlvdSYjMzk7bGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSYjMzk7cmUgbW9zdCBjb21mb3J0YWJsZSB3aXRoISBUaGF0IGJlaW5nIHNhaWQsIFRhdW51cyA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmRvZXMgcmVjb21tZW5kIGEgZmV3IGxpYnJhcmllczwvYT4gdGhhdCB3b3JrIHdlbGwgd2l0aCBpdC48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBXaHkgVGF1bnVzP1xcblxcbiAgICBUYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIF9hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZV8gYXMgd2VsbC4gKipUYXVudXMgcHJpb3JpdGl6ZXMgY29udGVudCoqLiBJdCB1c2VzIHNlcnZlci1zaWRlIHJlbmRlcmluZyB0byBnZXQgY29udGVudCB0byB5b3VyIGh1bWFucyBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgaXQgdXNlcyBjbGllbnQtc2lkZSByZW5kZXJpbmcgdG8gaW1wcm92ZSB0aGVpciBleHBlcmllbmNlLlxcblxcbiAgICBXaGlsZSBpdCBmb2N1c2VzIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCAqKlt1c2FiaWxpdHldWzJdIGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zKiogZm9yIFRhdW51cy4gSW5jaWRlbnRhbGx5LCBmb2N1c2luZyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBhbHNvIGltcHJvdmVzIGJvdGggb2YgdGhlc2UuIFVzYWJpbGl0eSBpcyBpbXByb3ZlZCBiZWNhdXNlIHRoZSBleHBlcmllbmNlIGlzIGdyYWR1YWxseSBpbXByb3ZlZCwgbWVhbmluZyB0aGF0IGlmIHNvbWV3aGVyZSBhbG9uZyB0aGUgbGluZSBhIGZlYXR1cmUgaXMgbWlzc2luZywgdGhlIGNvbXBvbmVudCBpcyAqKnN0aWxsIGV4cGVjdGVkIHRvIHdvcmsqKi5cXG5cXG4gICAgRm9yIGV4YW1wbGUsIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBzaXRlIHVzZXMgcGxhaW4tb2xkIGxpbmtzIHRvIG5hdmlnYXRlIGZyb20gb25lIHZpZXcgdG8gYW5vdGhlciwgYW5kIHRoZW4gYWRkcyBhIGBjbGlja2AgZXZlbnQgaGFuZGxlciB0aGF0IGJsb2NrcyBuYXZpZ2F0aW9uIGFuZCBpc3N1ZXMgYW4gQUpBWCByZXF1ZXN0IGluc3RlYWQuIElmIEphdmFTY3JpcHQgZmFpbHMgdG8gbG9hZCwgcGVyaGFwcyB0aGUgZXhwZXJpZW5jZSBtaWdodCBzdGF5IGEgbGl0dGxlIGJpdCB3b3JzZSwgYnV0IHRoYXQncyBva2F5LCBiZWNhdXNlIHdlIGFja25vd2xlZGdlIHRoYXQgKipvdXIgc2l0ZXMgZG9uJ3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3NlcioqLiBTaW1pbGFybHksIFtwZXJmb3JtYW5jZSBpcyBncmVhdGx5IGVuaGFuY2VkXVsxXSBieSBkZWxpdmVyaW5nIGNvbnRlbnQgdG8gdGhlIGh1bWFuIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCB0aGVuIGFkZGluZyBmdW5jdGlvbmFsaXR5IG9uIHRvcCBvZiB0aGF0LlxcblxcbiAgICBXaXRoIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCBpZiB0aGUgZnVuY3Rpb25hbGl0eSBuZXZlciBnZXRzIHRoZXJlIGJlY2F1c2UgYSBKYXZhU2NyaXB0IHJlc291cmNlIGZhaWxlZCB0byBsb2FkIGJlY2F1c2UgdGhlIG5ldHdvcmsgZmFpbGVkIF8obm90IHVuY29tbW9uIGluIHRoZSBtb2JpbGUgZXJhKV8gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrIVxcblxcbiAgICBbMV06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9jcml0aWNhbC1wYXRoLXBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9hZGp1c3RpbmctdXgtZm9yLWh1bWFuc1xcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IE5vdCBPdGhlciBGcmFtZXdvcmtzP1xcblxcbiAgICBNYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4ndCBkZXNpZ25lZCB3aXRoIHNoYXJlZC1yZW5kZXJpbmcgaW4gbWluZC4gQ29udGVudCBpc24ndCBwcmlvcml0aXplZCwgYW5kIGh1bWFucyBhcmUgZXhwZWN0ZWQgdG8gW2Rvd25sb2FkIG1vc3Qgb2YgYSB3ZWIgcGFnZSBiZWZvcmUgdGhleSBjYW4gc2VlIGFueSBodW1hbi1kaWdlc3RpYmxlIGNvbnRlbnRdWzJdLiBXaGlsZSBHb29nbGUgaXMgZ29pbmcgdG8gcmVzb2x2ZSB0aGUgU0VPIGlzc3VlcyB3aXRoIGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgc29vbiwgU0VPIGlzIGFsc28gYSBwcm9ibGVtLiBHb29nbGUgaXNuJ3QgdGhlIG9ubHkgd2ViIGNyYXdsZXIgb3BlcmF0b3Igb3V0IHRoZXJlLCBhbmQgaXQgbWlnaHQgYmUgYSB3aGlsZSBiZWZvcmUgc29jaWFsIG1lZGlhIGxpbmsgY3Jhd2xlcnMgY2F0Y2ggdXAgd2l0aCB0aGVtLlxcblxcbiAgICBMYXRlbHksIHdlIGNhbiBvYnNlcnZlIG1hbnkgbWF0dXJlIG9wZW4tc291cmNlIGZyYW1ld29ya3MgYXJlIGRyb3BwaW5nIHN1cHBvcnQgZm9yIG9sZGVyIGJyb3dzZXJzLiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZCwgd2hlcmUgdGhlIGRldmVsb3BlciBpcyBwdXQgZmlyc3QuICoqVGF1bnVzIGlzIFsjaHVtYW5maXJzdF1bMV0qKiwgbWVhbmluZyB0aGF0IGl0IGNvbmNlZGVzIHRoYXQgaHVtYW5zIGFyZSBtb3JlIGltcG9ydGFudCB0aGFuIHRoZSBkZXZlbG9wZXJzIGJ1aWxkaW5nIHRoZWlyIGFwcGxpY2F0aW9ucy5cXG5cXG4gICAgUHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBhcHBsaWNhdGlvbnMgYXJlIGFsd2F5cyBnb2luZyB0byBoYXZlIGdyZWF0IGJyb3dzZXIgc3VwcG9ydCBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSdyZSBhcmNoaXRlY3RlZC4gQXMgdGhlIG5hbWUgaW1wbGllcywgYSBiYXNlbGluZSBpcyBlc3RhYmxpc2hlZCB3aGVyZSB3ZSBkZWxpdmVyIHRoZSBjb3JlIGV4cGVyaWVuY2UgdG8gdGhlIHVzZXIgXyh0eXBpY2FsbHkgaW4gdGhlIGZvcm0gb2YgcmVhZGFibGUgSFRNTCBjb250ZW50KV8sIGFuZCB0aGVuIGVuaGFuY2UgaXQgKippZiBwb3NzaWJsZSoqIHVzaW5nIENTUyBhbmQgSmF2YVNjcmlwdC4gQnVpbGRpbmcgYXBwbGljYXRpb25zIGluIHRoaXMgd2F5IG1lYW5zIHRoYXQgeW91J2xsIGJlIGFibGUgdG8gcmVhY2ggdGhlIG1vc3QgcGVvcGxlIHdpdGggeW91ciBjb3JlIGV4cGVyaWVuY2UsIGFuZCB5b3UnbGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy5cXG5cXG4gICAgWzFdOiBodHRwczovL3R3aXR0ZXIuY29tL2hhc2h0YWcvaHVtYW5maXJzdFxcbiAgICBbMl06IGh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEZlYXR1cmVzXFxuXFxuICAgIE91dCBvZiB0aGUgYm94LCBUYXVudXMgZW5zdXJlcyB0aGF0IHlvdXIgc2l0ZSB3b3JrcyBvbiBhbnkgSFRNTC1lbmFibGVkIGRvY3VtZW50IHZpZXdlciBhbmQgZXZlbiB0aGUgdGVybWluYWwsIHByb3ZpZGluZyBzdXBwb3J0IGZvciBwbGFpbiB0ZXh0IHJlc3BvbnNlcyBbd2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWRdWzJdLiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UnbGwgb25seSBoYXZlIHRvIGRlY2xhcmUgdGhlc2Ugb25jZSBidXQgdGhleSdsbCBiZSB1c2VkIGluIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUuXFxuXFxuICAgIFRhdW51cyBmZWF0dXJlcyBhIHJlYXNvbmFibHkgZW5oYW5jZWQgZXhwZXJpZW5jZSwgd2hlcmUgaWYgZmVhdHVyZXMgYXJlbid0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkncmUganVzdCBub3QgcHJvdmlkZWQuIEZvciBleGFtcGxlLCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIG1ha2VzIHVzZSBvZiB0aGUgYGhpc3RvcnlgIEFQSSBidXQgaWYgdGhhdCdzIG5vdCBhdmFpbGFibGUgdGhlbiBpdCdsbCBmYWxsIGJhY2sgdG8gc2ltcGx5IG5vdCBtZWRkbGluZyB3aXRoIGxpbmtzIGluc3RlYWQgb2YgdXNpbmcgYSBjbGllbnQtc2lkZS1vbmx5IGhhc2ggcm91dGVyLlxcblxcbiAgICBUYXVudXMgY2FuIGRlYWwgd2l0aCB2aWV3IGNhY2hpbmcgb24geW91ciBiZWhhbGYsIGlmIHlvdSBzbyBkZXNpcmUsIHVzaW5nIFthc3luY2hyb25vdXMgZW1iZWRkZWQgZGF0YWJhc2Ugc3RvcmVzXVszXSBvbiB0aGUgY2xpZW50LXNpZGUuIFR1cm5zIG91dCwgdGhlcmUncyBbcHJldHR5IGdvb2QgYnJvd3NlciBzdXBwb3J0IGZvciBJbmRleGVkREJdWzRdLiBPZiBjb3Vyc2UsIEluZGV4ZWREQiB3aWxsIG9ubHkgYmUgdXNlZCBpZiBpdCdzIGF2YWlsYWJsZSwgYW5kIGlmIGl0J3Mgbm90IHRoZW4gdmlld3Mgd29uJ3QgYmUgY2FjaGVkIGluIHRoZSBjbGllbnQtc2lkZSBiZXNpZGVzIGFuIGluLW1lbW9yeSBzdG9yZS4gKipUaGUgc2l0ZSB3b24ndCBzaW1wbHkgcm9sbCBvdmVyIGFuZCBkaWUsIHRob3VnaC4qKlxcblxcbiAgICBJZiB5b3UndmUgdHVybmVkIGNsaWVudC1zaWRlIGNhY2hpbmcgb24sIHRoZW4geW91IGNhbiBhbHNvIHR1cm4gb24gdGhlICoqdmlldyBwcmUtZmV0Y2hpbmcgZmVhdHVyZSoqLCB3aGljaCB3aWxsIHN0YXJ0IGRvd25sb2FkaW5nIHZpZXdzIGFzIHNvb24gYXMgaHVtYW5zIGhvdmVyIG9uIGxpbmtzLCBhcyB0byBkZWxpdmVyIGEgX2Zhc3RlciBwZXJjZWl2ZWQgaHVtYW4gZXhwZXJpZW5jZV8uXFxuXFxuICAgIFRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSBbYSBmZXcgY29tcGxlbWVudGFyeSBtb2R1bGVzXVsxXSB5b3UgY2FuIHVzZSB0byBlbmhhbmNlIHlvdXIgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZSwgYXMgd2VsbC5cXG5cXG4gICAgV2l0aCBUYXVudXMgeW91J2xsIGJlIGluIGNoYXJnZS4gW0FyZSB5b3UgcmVhZHkgdG8gZ2V0IHN0YXJ0ZWQ/XVsyXVxcblxcbiAgICBbMV06IC9jb21wbGVtZW50c1xcbiAgICBbMl06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzNdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbNF06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPWluZGV4ZWRkYlxcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgRmFtaWxpYXJpdHlcXG5cXG4gICAgWW91IGNhbiB1c2UgVGF1bnVzIHRvIGRldmVsb3AgYXBwbGljYXRpb25zIHVzaW5nIHlvdXIgZmF2b3JpdGUgTm9kZS5qcyBIVFRQIHNlcnZlciwgKipib3RoIFtFeHByZXNzXVszXSBhbmQgW0hhcGldWzRdIGFyZSBmdWxseSBzdXBwb3J0ZWQqKi4gSW4gYm90aCBjYXNlcywgeW91J2xsIFtidWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSdyZSBhbHJlYWR5IHVzZWQgdG9dWzFdLCBleGNlcHQgeW91IHdvbid0IGhhdmUgdG8gYHJlcXVpcmVgIHRoZSB2aWV3IGNvbnRyb2xsZXJzIG9yIGRlZmluZSBhbnkgdmlldyByb3V0ZXMgc2luY2UgVGF1bnVzIHdpbGwgZGVhbCB3aXRoIHRoYXQgb24geW91ciBiZWhhbGYuIEluIHRoZSBjb250cm9sbGVycyB5b3UnbGwgYmUgYWJsZSB0byBkbyBldmVyeXRoaW5nIHlvdSdyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSdsbCBoYXZlIHRvIHJldHVybiBhIEpTT04gbW9kZWwgd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHJlbmRlciBhIHZpZXcuXFxuXFxuICAgIFlvdSBjYW4gdXNlIGFueSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCB5b3Ugd2FudCwgcHJvdmlkZWQgdGhhdCBpdCBjYW4gYmUgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy4gVGhhdCdzIGJlY2F1c2UgVGF1bnVzIHRyZWF0cyB2aWV3cyBhcyBtZXJlIEphdmFTY3JpcHQgZnVuY3Rpb25zLCByYXRoZXIgdGhhbiBiZWluZyB0aWVkIGludG8gYSBzcGVjaWZpYyB2aWV3LXJlbmRlcmluZyBlbmdpbmUuXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBqdXN0IGZ1bmN0aW9ucywgdG9vLiBZb3UgY2FuIGJyaW5nIHlvdXIgb3duIHNlbGVjdG9yIGVuZ2luZSwgeW91ciBvd24gQUpBWCBsaWJyYXJpZXMsIGFuZCB5b3VyIG93biBkYXRhLWJpbmRpbmcgc29sdXRpb25zLiBJdCBtaWdodCBtZWFuIHRoZXJlJ3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UnbGwgYWxzbyBiZSBmcmVlIHRvIHBpY2sgd2hhdGV2ZXIgbGlicmFyaWVzIHlvdSdyZSBtb3N0IGNvbWZvcnRhYmxlIHdpdGghIFRoYXQgYmVpbmcgc2FpZCwgVGF1bnVzIFtkb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXNdWzJdIHRoYXQgd29yayB3ZWxsIHdpdGggaXQuXFxuXFxuICAgIFsxXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbMl06IC9jb21wbGVtZW50c1xcbiAgICBbM106IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs0XTogaHR0cDovL2hhcGlqcy5jb21cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBpKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJhcGktZG9jdW1lbnRhdGlvblxcXCI+QVBJIERvY3VtZW50YXRpb248L2gxPlxcbjxwPkhlcmUmIzM5O3MgdGhlIEFQSSBkb2N1bWVudGF0aW9uIGZvciBUYXVudXMuIElmIHlvdSYjMzk7dmUgbmV2ZXIgdXNlZCBpdCBiZWZvcmUsIHdlIHJlY29tbWVuZCBnb2luZyBvdmVyIHRoZSA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5HZXR0aW5nIFN0YXJ0ZWQ8L2E+IGd1aWRlIGJlZm9yZSBqdW1waW5nIGludG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uLiBUaGF0IHdheSwgeW91JiMzOTtsbCBnZXQgYSBiZXR0ZXIgaWRlYSBvZiB3aGF0IHRvIGxvb2sgZm9yIGFuZCBob3cgdG8gcHV0IHRvZ2V0aGVyIHNpbXBsZSBhcHBsaWNhdGlvbnMgdXNpbmcgVGF1bnVzLCBiZWZvcmUgZ29pbmcgdGhyb3VnaCBkb2N1bWVudGF0aW9uIG9uIGV2ZXJ5IHB1YmxpYyBpbnRlcmZhY2UgdG8gVGF1bnVzLjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEFQSSBEb2N1bWVudGF0aW9uXFxuXFxuICAgIEhlcmUncyB0aGUgQVBJIGRvY3VtZW50YXRpb24gZm9yIFRhdW51cy4gSWYgeW91J3ZlIG5ldmVyIHVzZWQgaXQgYmVmb3JlLCB3ZSByZWNvbW1lbmQgZ29pbmcgb3ZlciB0aGUgW0dldHRpbmcgU3RhcnRlZF1bMV0gZ3VpZGUgYmVmb3JlIGp1bXBpbmcgaW50byB0aGUgQVBJIGRvY3VtZW50YXRpb24uIFRoYXQgd2F5LCB5b3UnbGwgZ2V0IGEgYmV0dGVyIGlkZWEgb2Ygd2hhdCB0byBsb29rIGZvciBhbmQgaG93IHRvIHB1dCB0b2dldGhlciBzaW1wbGUgYXBwbGljYXRpb25zIHVzaW5nIFRhdW51cywgYmVmb3JlIGdvaW5nIHRocm91Z2ggZG9jdW1lbnRhdGlvbiBvbiBldmVyeSBwdWJsaWMgaW50ZXJmYWNlIHRvIFRhdW51cy5cXG5cXG4gICAgWzFdOiAvZ2V0dGluZy1zdGFydGVkXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNvbXBsZW1lbnRzKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImNvbXBsZW1lbnRhcnktbW9kdWxlc1xcXCI+Q29tcGxlbWVudGFyeSBNb2R1bGVzPC9oMT5cXG48cD5Gb288L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBDb21wbGVtZW50YXJ5IE1vZHVsZXNcXG5cXG4gICAgRm9vXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldHRpbmdTdGFydGVkKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJnZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQmIzM5O3MgPGVtPnVwIHRvIHlvdSBob3cgdG8gdXNlIGl0PC9lbT4uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gPHN0cm9uZz5zZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0PC9zdHJvbmc+LCBhcyB0aGF0JiMzOTtsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2hvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlXFxcIj5TZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZTwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiNjcmVhdGluZy1hLWxheW91dFxcXCI+Q3JlYXRpbmcgYSBsYXlvdXQ8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3lvdXItZmlyc3Qtcm91dGVcXFwiPllvdXIgZmlyc3Qgcm91dGU8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvYT48L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJob3ctaXQtd29ya3NcXFwiPkhvdyBpdCB3b3JrczwvaDE+XFxuPHA+VGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0IDxzdHJvbmc+cHJvdmVuPC9zdHJvbmc+IHNldCBvZiBydWxlcy48L3A+XFxuPHVsPlxcbjxsaT5EZWZpbmUgYSA8Y29kZT5mdW5jdGlvbihtb2RlbCk8L2NvZGU+IGZvciBlYWNoIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5QdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvbjwvbGk+XFxuPGxpPlB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzPC9saT5cXG48bGk+Q3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzPC9saT5cXG48bGk+Q3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3PC9saT5cXG48bGk+Rm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZTwvbGk+XFxuPGxpPldoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhPC9saT5cXG48bGk+T25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgPHN0cm9uZz5oaWphY2sgbGluayBjbGlja3M8L3N0cm9uZz4gYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkPC9saT5cXG48bGk+V2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5JZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gPHN0cm9uZz5Eb24mIzM5O3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzITwvc3Ryb25nPjwvbGk+XFxuPC91bD5cXG48cD5JJiMzOTtsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2gxPlxcbjxwPkZpcnN0IG9mZiwgeW91JiMzOTtsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+dGF1bnVzLWV4cHJlc3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+LCB0aHJvdWdoIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPnRhdW51cy1oYXBpPC9hPiBhbmQgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+aGFwaWlmeTwvYT4gdHJhbnNmb3JtPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHlvdSYjMzk7cmUgbW9yZSBvZiBhIDxlbT4mcXVvdDtydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJiMzOTtzIGNvZGUmcXVvdDs8L2VtPiB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxcIj5nb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSYjMzk7cyBzb3VyY2UgY29kZTwvYT4sIHdoaWNoIHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb29cXFwiPnBvbnlmb28uY29tPC9hPiwgd2hpY2ggaXMgPHN0cm9uZz5hIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2U8L3N0cm9uZz4gdW5kZXIgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0JiMzOTtzIG9rYXkgdG9vLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldHRsZWQgZm9yIGVpdGhlciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJiMzOTtsbCB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+LiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwic2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9oND5cXG48cD5OYXR1cmFsbHksIHlvdSYjMzk7bGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSA8Y29kZT5ucG08L2NvZGU+IHRvIGdldCBzdGFydGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzcyAtLXNhdmVcXG48L2NvZGU+PC9wcmU+XFxuPHA+TGV0JiMzOTtzIGJ1aWxkIG91ciBhcHBsaWNhdGlvbiBzdGVwLWJ5LXN0ZXAsIGFuZCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZW0gYXMgd2UgZ28gYWxvbmcuIEZpcnN0IG9mIGFsbCwgeW91JiMzOTtsbCBuZWVkIHRoZSBmYW1vdXMgPGNvZGU+YXBwLmpzPC9jb2RlPiBmaWxlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBhcHAuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+SXQmIzM5O3MgcHJvYmFibHkgYSBnb29kIGlkZWEgdG8gcHV0IHNvbWV0aGluZyBpbiB5b3VyIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZSwgbGV0JiMzOTtzIGRvIHRoYXQgbm93LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7fTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5BbGwgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+IHJlYWxseSBkb2VzIGlzIGFkZCBhIGJ1bmNoIG9mIHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgPGNvZGU+YXBwPC9jb2RlPi4gWW91IHNob3VsZCBub3RlIHRoYXQgYW55IG1pZGRsZXdhcmUgYW5kIEFQSSByb3V0ZXMgc2hvdWxkIHByb2JhYmx5IGNvbWUgYmVmb3JlIHRoZSA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBpbnZvY2F0aW9uLiBZb3UmIzM5O2xsIHByb2JhYmx5IGJlIHVzaW5nIGEgY2F0Y2gtYWxsIHZpZXcgcm91dGUgdGhhdCByZW5kZXJzIGEgPGVtPiZxdW90O05vdCBGb3VuZCZxdW90OzwvZW0+IHZpZXcsIGJsb2NraW5nIGFueSByb3V0aW5nIGJleW9uZCB0aGF0IHJvdXRlLjwvcD5cXG48cD5UaGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0IHBhc3NlZCB0byA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBsZXQmIzM5O3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQmIzM5O3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSA8ZW0+cmVxdWlyZWQgY29uZmlndXJhdGlvbjwvZW0+LiBUaGVyZSYjMzk7cyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5sYXlvdXQ8L2NvZGU+IHNob3VsZCBiZSBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSBzaW5nbGUgPGNvZGU+bW9kZWw8L2NvZGU+IGFyZ3VtZW50IGFuZCByZXR1cm5zIGFuIGVudGlyZSBIVE1MIGRvY3VtZW50PC9saT5cXG48bGk+PGNvZGU+cm91dGVzPC9jb2RlPiBzaG91bGQgYmUgYW4gYXJyYXkgb2YgdmlldyByb3V0ZXM8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJjcmVhdGluZy1hLWxheW91dFxcXCI+Q3JlYXRpbmcgYSBsYXlvdXQ8L2g0PlxcbjxwPkxldCYjMzk7cyBhbHNvIGNyZWF0ZSBhIGxheW91dC4gRm9yIHRoZSBwdXJwb3NlcyBvZiBtYWtpbmcgb3VyIHdheSB0aHJvdWdoIHRoaXMgZ3VpZGUsIGl0JiMzOTtsbCBqdXN0IGJlIGEgcGxhaW4gSmF2YVNjcmlwdCBmdW5jdGlvbi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggbGF5b3V0LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdGUgdGhhdCB0aGUgPGNvZGU+cGFydGlhbDwvY29kZT4gcHJvcGVydHkgaW4gdGhlIDxjb2RlPm1vZGVsPC9jb2RlPiA8ZW0+KGFzIHNlZW4gYmVsb3cpPC9lbT4gaXMgY3JlYXRlZCBvbiB0aGUgZmx5IGFmdGVyIHJlbmRlcmluZyBwYXJ0aWFsIHZpZXdzLiBUaGUgbGF5b3V0IGZ1bmN0aW9uIHdlJiMzOTtsbCBiZSB1c2luZyBoZXJlIGVmZmVjdGl2ZWx5IG1lYW5zIDxlbT4mcXVvdDt0aGVyZSBpcyBubyBsYXlvdXQsIGp1c3QgcmVuZGVyIHRoZSBwYXJ0aWFscyZxdW90OzwvZW0+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgcmV0dXJuIG1vZGVsLnBhcnRpYWw7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJiMzOTt0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCYjMzk7cyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuPC9wPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXFwiPk11c3RhY2hlPC9hPiBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCYjMzk7cyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTDwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcXCI+SmFkZTwvYT4gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSYjMzk7cyBubyBjbG9zaW5nIHRhZ3M8L2xpPlxcbjxsaT5UaGVyZSYjMzk7cyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgPGEgaHJlZj1cXFwiaHR0cDovL21vemlsbGEuZ2l0aHViLmlvL251bmp1Y2tzL1xcXCI+TW96aWxsYSYjMzk7cyBOdW5qdWNrczwvYT4sIDxhIGhyZWY9XFxcImh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcXCI+SGFuZGxlYmFyczwvYT4sIGFuZCA8YSBocmVmPVxcXCJodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcXCI+RUpTPC9hPi48L2xpPlxcbjwvdWw+XFxuPHA+UmVtZW1iZXIgdG8gYWRkIHRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHVuZGVyIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuL2xheW91dCYjMzk7KVxcbn07XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+WW91JiMzOTtsbCBmaW5kIHRvb2xzIHJlbGF0ZWQgdG8gdmlldyB0ZW1wbGF0aW5nIGluIHRoZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmNvbXBsZW1lbnRhcnkgbW9kdWxlcyBzZWN0aW9uPC9hPi4gSWYgeW91IGRvbiYjMzk7dCBwcm92aWRlIGEgPGNvZGU+bGF5b3V0PC9jb2RlPiBwcm9wZXJ0eSBhdCBhbGwsIFRhdW51cyB3aWxsIHJlbmRlciB5b3VyIG1vZGVsIGluIGEgcmVzcG9uc2UgYnkgd3JhcHBpbmcgaXQgaW4gPGNvZGU+Jmx0O3ByZSZndDs8L2NvZGU+IGFuZCA8Y29kZT4mbHQ7Y29kZSZndDs8L2NvZGU+IHRhZ3MsIHdoaWNoIG1heSBhaWQgeW91IHdoZW4gZ2V0dGluZyBzdGFydGVkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInlvdXItZmlyc3Qtcm91dGVcXFwiPllvdXIgZmlyc3Qgcm91dGU8L2g0PlxcbjxwPlJvdXRlcyBuZWVkIHRvIGJlIHBsYWNlZCBpbiBpdHMgb3duIGRlZGljYXRlZCBtb2R1bGUsIHNvIHRoYXQgeW91IGNhbiByZXVzZSBpdCBsYXRlciBvbiA8c3Ryb25nPndoZW4gc2V0dGluZyB1cCBjbGllbnQtc2lkZSByb3V0aW5nPC9zdHJvbmc+LiBMZXQmIzM5O3MgY3JlYXRlIHRoYXQgbW9kdWxlIGFuZCBhZGQgYSByb3V0ZSB0byBpdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggcm91dGVzLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gW1xcbiAgeyByb3V0ZTogJiMzOTsvJiMzOTssIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTsgfVxcbl07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkVhY2ggaXRlbSBpbiB0aGUgZXhwb3J0ZWQgYXJyYXkgaXMgYSByb3V0ZS4gSW4gdGhpcyBjYXNlLCB3ZSBvbmx5IGhhdmUgdGhlIDxjb2RlPi88L2NvZGU+IHJvdXRlIHdpdGggdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGFjdGlvbi4gVGF1bnVzIGZvbGxvd3MgdGhlIHdlbGwga25vd24gPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb24gcGF0dGVybjwvYT4sIHdoaWNoIG1hZGUgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9SdWJ5X29uX1JhaWxzXFxcIj5SdWJ5IG9uIFJhaWxzPC9hPiBmYW1vdXMuIDxlbT5NYXliZSBvbmUgZGF5IFRhdW51cyB3aWxsIGJlIGZhbW91cyB0b28hPC9lbT4gQnkgY29udmVudGlvbiwgVGF1bnVzIHdpbGwgYXNzdW1lIHRoYXQgdGhlIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGFjdGlvbiB1c2VzIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBjb250cm9sbGVyIGFuZCByZW5kZXJzIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiB2aWV3LiBPZiBjb3Vyc2UsIDxlbT5hbGwgb2YgdGhhdCBjYW4gYmUgY2hhbmdlZCB1c2luZyBjb25maWd1cmF0aW9uPC9lbT4uPC9wPlxcbjxwPlRpbWUgdG8gZ28gYmFjayB0byA8Y29kZT5hcHAuanM8L2NvZGU+IGFuZCB1cGRhdGUgdGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgbGF5b3V0OiByZXF1aXJlKCYjMzk7Li9sYXlvdXQmIzM5OyksXFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KVxcbn07XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+SXQmIzM5O3MgaW1wb3J0YW50IHRvIGtub3cgdGhhdCBpZiB5b3Ugb21pdCB0aGUgY3JlYXRpb24gb2YgYSBjb250cm9sbGVyIHRoZW4gVGF1bnVzIHdpbGwgc2tpcCB0aGF0IHN0ZXAsIGFuZCByZW5kZXIgdGhlIHZpZXcgcGFzc2luZyBpdCB3aGF0ZXZlciB0aGUgZGVmYXVsdCBtb2RlbCBpcyA8ZW0+KG1vcmUgb24gdGhhdCBsYXRlciwgYnV0IGl0IGRlZmF1bHRzIHRvIDxjb2RlPnt9PC9jb2RlPik8L2VtPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmVcXFwiPlVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZTwvaDQ+XFxuPHA+TGV0JiMzOTtzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCB2aWV3cy9ob21lL2luZGV4LmphZGVcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2Ugd2UmIzM5O3JlIGp1c3QgZ2V0dGluZyBzdGFydGVkLCB0aGUgdmlldyB3aWxsIGp1c3QgaGF2ZSBzb21lIGJhc2ljIHN0YXRpYyBjb250ZW50LCBhbmQgdGhhdCYjMzk7cyBpdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj5wIEhlbGxvIFRhdW51cyFcXG48L2NvZGU+PC9wcmU+XFxuPHA+TmV4dCB5b3UmIzM5O2xsIHdhbnQgdG8gY29tcGlsZSB0aGUgdmlldyBpbnRvIGEgZnVuY3Rpb24uIFRvIGRvIHRoYXQgeW91IGNhbiB1c2UgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2phZHVtXFxcIj5qYWR1bTwvYT4sIGEgc3BlY2lhbGl6ZWQgSmFkZSBjb21waWxlciB0aGF0IHBsYXlzIHdlbGwgd2l0aCBUYXVudXMgYnkgYmVpbmcgYXdhcmUgb2YgPGNvZGU+cmVxdWlyZTwvY29kZT4gc3RhdGVtZW50cywgYW5kIHRodXMgc2F2aW5nIGJ5dGVzIHdoZW4gaXQgY29tZXMgdG8gY2xpZW50LXNpZGUgcmVuZGVyaW5nLiBMZXQmIzM5O3MgaW5zdGFsbCBpdCBnbG9iYWxseSwgZm9yIHRoZSBzYWtlIG9mIHRoaXMgZXhlcmNpc2UgPGVtPih5b3Ugc2hvdWxkIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHlvdSYjMzk7cmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24pPC9lbT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIGphZHVtIC1nXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRvIGNvbXBpbGUgZXZlcnkgdmlldyBpbiB0aGUgPGNvZGU+dmlld3M8L2NvZGU+IGRpcmVjdG9yeSBpbnRvIGZ1bmN0aW9ucyB0aGF0IHdvcmsgd2VsbCB3aXRoIFRhdW51cywgeW91IGNhbiB1c2UgdGhlIGNvbW1hbmQgYmVsb3cuIFRoZSA8Y29kZT4tLW91dHB1dDwvY29kZT4gZmxhZyBpbmRpY2F0ZXMgd2hlcmUgeW91IHdhbnQgdGhlIHZpZXdzIHRvIGJlIHBsYWNlZC4gV2UgY2hvc2UgdG8gdXNlIDxjb2RlPi5iaW48L2NvZGU+IGJlY2F1c2UgdGhhdCYjMzk7cyB3aGVyZSBUYXVudXMgZXhwZWN0cyB5b3VyIGNvbXBpbGVkIHZpZXdzIHRvIGJlIGJ5IGRlZmF1bHQuIEJ1dCBzaW5jZSBUYXVudXMgZm9sbG93cyB0aGUgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+Y29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb248L2E+IGFwcHJvYWNoLCB5b3UgY291bGQgY2hhbmdlIHRoYXQgaWYgeW91IHdhbnRlZCB0by48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+amFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbjwvY29kZT48L3ByZT5cXG48cD5Db25ncmF0dWxhdGlvbnMhIFRhdW51cyBpcyBub3cgb3BlcmF0aW9uYWwuIEFsbCB0aGF0JiMzOTtzIGxlZnQgaXMgZm9yIHlvdSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGFuZCB2aXNpdCBpdCBvbiBwb3J0IDxjb2RlPjMwMDA8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbm9wZW4gaHR0cDovL2xvY2FsaG9zdDozMDAwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhyb3dpbmctaW4tYS1jb250cm9sbGVyXFxcIj5UaHJvd2luZyBpbiBhIGNvbnRyb2xsZXI8L2g0PlxcbjxwPkNvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24mIzM5O3QgZ2V0IHZlcnkgZmFyLiBDb250cm9sbGVycyBhbGxvdyB5b3UgdG8gaGFuZGxlIHRoZSByZXF1ZXN0IGFuZCBwdXQgdG9nZXRoZXIgdGhlIG1vZGVsIHRvIGJlIHVzZWQgd2hlbiBzZW5kaW5nIGEgcmVzcG9uc2UuIENvbnRyYXJ5IHRvIHdoYXQgbW9zdCBmcmFtZXdvcmtzIHByb3Bvc2UsIFRhdW51cyBleHBlY3RzIGV2ZXJ5IGFjdGlvbiB0byBoYXZlIGl0cyBvd24gaW5kaXZpZHVhbCBjb250cm9sbGVyLiBTaW5jZSBOb2RlLmpzIG1ha2VzIGl0IGVhc3kgdG8gaW1wb3J0IGNvbXBvbmVudHMsIHRoaXMgc2V0dXAgaGVscHMgeW91IGtlZXAgeW91ciBjb2RlIG1vZHVsYXIgd2hpbGUgc3RpbGwgYmVpbmcgYWJsZSB0byByZXVzZSBsb2dpYyBieSBzaGFyaW5nIG1vZHVsZXMgYWNyb3NzIGRpZmZlcmVudCBjb250cm9sbGVycy4gTGV0JiMzOTtzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSA8Y29kZT5ob21lL3ZpZXc8L2NvZGU+IGFjdGlvbi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgY29udHJvbGxlciBtb2R1bGUgc2hvdWxkIG1lcmVseSBleHBvcnQgYSBmdW5jdGlvbi4gPGVtPlN0YXJ0ZWQgbm90aWNpbmcgdGhlIHBhdHRlcm4/PC9lbT4gVGhlIHNpZ25hdHVyZSBmb3IgdGhlIGNvbnRyb2xsZXIgaXMgdGhlIHNhbWUgc2lnbmF0dXJlIGFzIHRoYXQgb2YgYW55IG90aGVyIG1pZGRsZXdhcmUgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiA8ZW0+KG9yIGFueSByb3V0ZSBoYW5kbGVyIHBhc3NlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4gaW4gdGhlIGNhc2Ugb2YgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+KTwvZW0+LjwvcD5cXG48cD5BcyB5b3UgbWF5IGhhdmUgbm90aWNlZCBpbiB0aGUgZXhhbXBsZXMgc28gZmFyLCB5b3UgaGF2ZW4mIzM5O3QgZXZlbiBzZXQgYSBkb2N1bWVudCB0aXRsZSBmb3IgeW91ciBIVE1MIHBhZ2VzISBUdXJucyBvdXQsIHRoZXJlJiMzOTtzIGEgZmV3IG1vZGVsIHByb3BlcnRpZXMgPGVtPih2ZXJ5IGZldyk8L2VtPiB0aGF0IFRhdW51cyBpcyBhd2FyZSBvZi4gT25lIG9mIHRob3NlIGlzIHRoZSA8Y29kZT50aXRsZTwvY29kZT4gcHJvcGVydHksIGFuZCBpdCYjMzk7bGwgYmUgdXNlZCB0byBjaGFuZ2UgdGhlIDxjb2RlPmRvY3VtZW50LnRpdGxlPC9jb2RlPiBpbiB5b3VyIHBhZ2VzIHdoZW4gbmF2aWdhdGluZyB0aHJvdWdoIHRoZSBjbGllbnQtc2lkZS4gS2VlcCBpbiBtaW5kIHRoYXQgYW55dGhpbmcgdGhhdCYjMzk7cyBub3QgaW4gdGhlIDxjb2RlPm1vZGVsPC9jb2RlPiBwcm9wZXJ0eSB3b24mIzM5O3QgYmUgdHJhc21pdHRlZCB0byB0aGUgY2xpZW50LCBhbmQgd2lsbCBqdXN0IGJlIGFjY2Vzc2libGUgdG8gdGhlIGxheW91dC48L3A+XFxuPHA+SGVyZSBpcyBvdXIgbmV3ZmFuZ2xlZCA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBjb250cm9sbGVyLiBBcyB5b3UmIzM5O2xsIG5vdGljZSwgaXQgZG9lc24mIzM5O3QgZGlzcnVwdCBhbnkgb2YgdGhlIHR5cGljYWwgRXhwcmVzcyBleHBlcmllbmNlLCBidXQgbWVyZWx5IGJ1aWxkcyB1cG9uIGl0LiBXaGVuIDxjb2RlPm5leHQ8L2NvZGU+IGlzIGNhbGxlZCwgdGhlIFRhdW51cyB2aWV3LXJlbmRlcmluZyBoYW5kbGVyIHdpbGwga2ljayBpbiwgYW5kIHJlbmRlciB0aGUgdmlldyB1c2luZyB0aGUgaW5mb3JtYXRpb24gdGhhdCB3YXMgYXNzaWduZWQgdG8gPGNvZGU+cmVzLnZpZXdNb2RlbDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICByZXMudmlld01vZGVsID0ge1xcbiAgICBtb2RlbDoge1xcbiAgICAgIHRpdGxlOiAmIzM5O1dlbGNvbWUgSG9tZSwgVGF1bnVzISYjMzk7XFxuICAgIH1cXG4gIH07XFxuICBuZXh0KCk7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCByZWx5aW5nIG9uIHRoZSBjbGllbnQtc2lkZSBjaGFuZ2VzIHRvIHlvdXIgcGFnZSBpbiBvcmRlciB0byBzZXQgdGhlIHZpZXcgdGl0bGUgPGVtPndvdWxkbiYjMzk7dCBiZSBwcm9ncmVzc2l2ZTwvZW0+LCBhbmQgdGh1cyA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5pdCB3b3VsZCBiZSByZWFsbHksIDxlbT5yZWFsbHk8L2VtPiBiYWQ8L2E+LiBXZSBzaG91bGQgdXBkYXRlIHRoZSBsYXlvdXQgdG8gdXNlIHdoYXRldmVyIDxjb2RlPnRpdGxlPC9jb2RlPiBoYXMgYmVlbiBwYXNzZWQgdG8gdGhlIG1vZGVsLiBJbiBmYWN0LCBsZXQmIzM5O3MgZ28gYmFjayB0byB0aGUgZHJhd2luZyBib2FyZCBhbmQgbWFrZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIHRlbXBsYXRlISBUaGUgPGNvZGU+IT08L2NvZGU+IHN5bnRheCBtZWFucyB0aGF0IHdoYXRldmVyIGlzIGluIHRoZSB2YWx1ZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudCB3b24mIzM5O3QgYmUgZXNjYXBlZC4gVGhhdCYjMzk7cyBva2F5IGJlY2F1c2UgPGNvZGU+cGFydGlhbDwvY29kZT4gaXMgYSB2aWV3IHdoZXJlIEphZGUgZXNjYXBlZCBhbnl0aGluZyB0aGF0IG5lZWRlZCBlc2NhcGluZywgYnV0IHdlIHdvdWxkbiYjMzk7dCB3YW50IEhUTUwgdGFncyB0byBiZSBlc2NhcGVkITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWphZGVcXFwiPnRpdGxlPW1vZGVsLnRpdGxlXFxubWFpbiE9cGFydGlhbFxcbjwvY29kZT48L3ByZT5cXG48cD5CeSB0aGUgd2F5LCBkaWQgeW91IGtub3cgdGhhdCA8Y29kZT4mbHQ7aHRtbCZndDs8L2NvZGU+LCA8Y29kZT4mbHQ7aGVhZCZndDs8L2NvZGU+LCBhbmQgPGNvZGU+Jmx0O2JvZHkmZ3Q7PC9jb2RlPiBhcmUgYWxsIG9wdGlvbmFsIGluIEhUTUwgNSwgYW5kIHRoYXQgeW91IGNhbiBzYWZlbHkgb21pdCB0aGVtIGluIHlvdXIgSFRNTD8gT2YgY291cnNlLCByZW5kZXJpbmcgZW5naW5lcyB3aWxsIHN0aWxsIGluc2VydCB0aG9zZSBlbGVtZW50cyBhdXRvbWF0aWNhbGx5IGludG8gdGhlIERPTSBmb3IgeW91ISA8ZW0+SG93IGNvb2wgaXMgdGhhdD88L2VtPjwvcD5cXG48cD5UaGF0JiMzOTtzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJiMzOTtzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIDxjb2RlPm5leHQ8L2NvZGU+IHRvIHJlbmRlciB0aGUgdmlldy48L3A+XFxuPHA+VGhlcmUmIzM5O3MgYWxzbyB0aGUgY2xpZW50LXNpZGUgYXNwZWN0IG9mIHNldHRpbmcgdXAgVGF1bnVzLiBMZXQmIzM5O3Mgc2V0IGl0IHVwIGFuZCBzZWUgaG93IGl0IG9wZW5zIHVwIG91ciBwb3NzaWJpbGl0aWVzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvaDE+XFxuPHA+WW91IGFscmVhZHkga25vdyBob3cgdG8gc2V0IHVwIHRoZSBiYXNpY3MgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZywgYW5kIHlvdSBrbm93IHRoYXQgeW91IHNob3VsZCA8YSBocmVmPVxcXCIvYXBpXFxcIj5jaGVjayBvdXQgdGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiB0byBnZXQgYSBtb3JlIHRob3JvdWdoIHVuZGVyc3RhbmRpbmcgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2Ugb24gVGF1bnVzLCBhbmQgd2hhdCBpdCBlbmFibGVzIHlvdSB0byBkby48L3A+XFxuPHA+VGhlIHdheSBUYXVudXMgd29ya3Mgb24gdGhlIGNsaWVudC1zaWRlIGlzIHNvIHRoYXQgb25jZSB5b3Ugc2V0IGl0IHVwLCBpdCB3aWxsIGhpamFjayBsaW5rIGNsaWNrcyBhbmQgdXNlIEFKQVggdG8gZmV0Y2ggbW9kZWxzIGFuZCByZW5kZXIgdGhvc2Ugdmlld3MgaW4gdGhlIGNsaWVudC4gSWYgdGhlIEphdmFTY3JpcHQgY29kZSBmYWlscyB0byBsb2FkLCA8ZW0+b3IgaWYgaXQgaGFzbiYjMzk7dCBsb2FkZWQgeWV0IGR1ZSB0byBhIHNsb3cgY29ubmVjdGlvbiBzdWNoIGFzIHRob3NlIGluIHVuc3RhYmxlIG1vYmlsZSBuZXR3b3JrczwvZW0+LCB0aGUgcmVndWxhciBsaW5rIHdvdWxkIGJlIGZvbGxvd2VkIGluc3RlYWQgYW5kIG5vIGhhcm0gd291bGQgYmUgdW5sZWFzaGVkIHVwb24gdGhlIGh1bWFuLCBleGNlcHQgdGhleSB3b3VsZCBnZXQgYSBzbGlnaHRseSBsZXNzIGZhbmN5IGV4cGVyaWVuY2UuPC9wPlxcbjxwPlNldHRpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGludm9sdmVzIGEgZmV3IGRpZmZlcmVudCBzdGVwcy4gRmlyc3RseSwgd2UmIzM5O2xsIGhhdmUgdG8gY29tcGlsZSB0aGUgYXBwbGljYXRpb24mIzM5O3Mgd2lyaW5nIDxlbT4odGhlIHJvdXRlcyBhbmQgSmF2YVNjcmlwdCB2aWV3IGZ1bmN0aW9ucyk8L2VtPiBpbnRvIHNvbWV0aGluZyB0aGUgYnJvd3NlciB1bmRlcnN0YW5kcy4gVGhlbiwgeW91JiMzOTtsbCBoYXZlIHRvIG1vdW50IFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUsIHBhc3NpbmcgdGhlIHdpcmluZyBzbyB0aGF0IGl0IGtub3dzIHdoaWNoIHJvdXRlcyBpdCBzaG91bGQgcmVzcG9uZCB0bywgYW5kIHdoaWNoIG90aGVycyBpdCBzaG91bGQgbWVyZWx5IGlnbm9yZS4gT25jZSB0aGF0JiMzOTtzIG91dCBvZiB0aGUgd2F5LCBjbGllbnQtc2lkZSByb3V0aW5nIHdvdWxkIGJlIHNldCB1cC48L3A+XFxuPHA+QXMgc3VnYXIgY29hdGluZyBvbiB0b3Agb2YgdGhhdCwgeW91IG1heSBhZGQgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB1c2luZyBjb250cm9sbGVycy4gVGhlc2UgY29udHJvbGxlcnMgd291bGQgYmUgZXhlY3V0ZWQgZXZlbiBpZiB0aGUgdmlldyB3YXMgcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLiBUaGV5IGNhbiBhY2Nlc3MgdGhlIFRhdW51cyBBUEkgZGlyZWN0bHksIGluIGNhc2UgeW91IG5lZWQgdG8gbmF2aWdhdGUgdG8gYW5vdGhlciB2aWV3IGluIHNvbWUgd2F5IG90aGVyIHRoYW4gYnkgaGF2aW5nIGh1bWFucyBjbGljayBvbiBhbmNob3IgdGFncy4gVGhlIEFQSSwgYXMgeW91JiMzOTtsbCBsZWFybiwgd2lsbCBhbHNvIGxldCB5b3UgcmVuZGVyIHBhcnRpYWwgdmlld3MgdXNpbmcgdGhlIHBvd2VyZnVsIFRhdW51cyBlbmdpbmUsIGxpc3RlbiBmb3IgZXZlbnRzIHRoYXQgbWF5IG9jY3VyIGF0IGtleSBzdGFnZXMgb2YgdGhlIHZpZXctcmVuZGVyaW5nIHByb2Nlc3MsIGFuZCBldmVuIGludGVyY2VwdCBBSkFYIHJlcXVlc3RzIGJsb2NraW5nIHRoZW0gYmVmb3JlIHRoZXkgZXZlciBoYXBwZW4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLXRhdW51cy1jbGlcXFwiPlVzaW5nIHRoZSBUYXVudXMgQ0xJPC9oND5cXG48cD5UYXVudXMgY29tZXMgd2l0aCBhIENMSSB0aGF0IGNhbiBiZSB1c2VkIHRvIHdpcmUgeW91ciBOb2RlLmpzIHJvdXRlcyBhbmQgdmlld3MgaW50byB0aGUgY2xpZW50LXNpZGUuIFRoZSBzYW1lIENMSSBjYW4gYmUgdXNlZCB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcyB3ZWxsLiBUaGUgbWFpbiByZWFzb24gd2h5IHRoZSBUYXVudXMgQ0xJIGV4aXN0cyBpcyBzbyB0aGF0IHlvdSBkb24mIzM5O3QgaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiBldmVyeSBzaW5nbGUgdmlldyBhbmQgY29udHJvbGxlciwgdW5kb2luZyBhIGxvdCBvZiB0aGUgd29yayB0aGF0IHdhcyBwdXQgaW50byBjb2RlIHJldXNlLiBKdXN0IGxpa2Ugd2UgZGlkIHdpdGggPGNvZGU+amFkdW08L2NvZGU+IGVhcmxpZXIsIHdlJiMzOTtsbCBpbnN0YWxsIHRoZSA8Y29kZT50YXVudXM8L2NvZGU+IENMSSBnbG9iYWxseSBmb3IgdGhlIHNha2Ugb2YgZXhlcmNpc2luZywgYnV0IHdlIHVuZGVyc3RhbmQgdGhhdCByZWx5aW5nIG9uIGdsb2JhbGx5IGluc3RhbGxlZCBtb2R1bGVzIGlzIGluc3VmZmljaWVudCBmb3IgcHJvZHVjdGlvbi1ncmFkZSBhcHBsaWNhdGlvbnMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIHRhdW51cyAtZ1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0JiMzOTtsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcuIEluIHR5cGljYWwgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb248L2E+IGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIDxjb2RlPi5iaW4vdmlld3M8L2NvZGU+IGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4sIGJ1dCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24mIzM5O3QgbWVldCB5b3VyIG5lZWRzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXRcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LmJpbi93aXJpbmcuanM8L2NvZGU+IGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIDxjb2RlPnRhdW51czwvY29kZT4gaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCYjMzk7cyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxufTtcXG5cXG52YXIgcm91dGVzID0ge1xcbiAgJiMzOTsvJiMzOTs6IHtcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbn07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5jb250cm9sbGVyczwvY29kZT4gb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJiMzOTt0IGNyZWF0ZWQgYW55IDxlbT5jbGllbnQtc2lkZSBjb250cm9sbGVyczwvZW0+IHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJiMzOTt0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC48L3A+XFxuPHA+VGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCwgeW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoaXMgZmlsZSB3aGVuZXZlciB5b3UgYWRkLCBjaGFuZ2UsIG9yIHJlbW92ZSBhIHZpZXcsIGEgY2xpZW50LXNpZGUgY29udHJvbGxlciwgb3IgYSByb3V0ZS4gRG9pbmcgdGhhdCB3b3VsZCBiZSBjdW1iZXJzb21lLCBhbmQgdGhlIENMSSBzb2x2ZXMgdGhhdCBwcm9ibGVtIGZvciB1cyBhdCB0aGUgZXhwZW5zZSBvZiBvbmUgYWRkaXRpb25hbCBidWlsZCBzdGVwLjwvcD5cXG48cD5EdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIDxjb2RlPi0td2F0Y2g8L2NvZGU+IGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG48L2NvZGU+PC9wcmU+XFxuPHA+SWYgeW91JiMzOTtyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91JiMzOTtsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgPGNvZGU+aGFwaWlmeTwvY29kZT4gdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXJcXFwiPkJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvaDQ+XFxuPHA+T25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIDxjb2RlPmNsaWVudC9qczwvY29kZT4gdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0JiMzOTtzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggY2xpZW50L2pzL21haW4uanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPm1haW48L2NvZGU+IG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIDxlbT5lbnRyeSBwb2ludDwvZW0+IG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSYjMzk7bGwgbmVlZCB0byBpbXBvcnQgPGNvZGU+dGF1bnVzPC9jb2RlPiwgdGhlIHdpcmluZyBtb2R1bGUgd2UmIzM5O3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgd2lyaW5nID0gcmVxdWlyZSgmIzM5Oy4uLy4uLy5iaW4vd2lyaW5nJiMzOTspO1xcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJiMzOTttYWluJiMzOTspWzBdO1xcblxcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLjwvcD5cXG48cD5CeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbiYjMzk7dCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuPC9wPlxcbjxwPkFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIDxlbT50eXBpY2FsbHkgbGFyZ2VyPC9lbT4gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS48L3A+XFxuPHA+QSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCYjMzk7cyBoYXJkZXIgdG8gc2V0IHVwLjwvcD5cXG48cD5UaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj50aGUgb3B0aW1pemF0aW9uIGd1aWRlPC9hPi4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgPGVtPig8Y29kZT4mIzM5O2F1dG8mIzM5OzwvY29kZT4pPC9lbT4gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCYjMzk7cyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+LCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+LCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by48L3A+XFxuPHA+VGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSYjMzk7cmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCYjMzk7cyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJiMzOTt2ZSBiZWVuIGJ1aWxkaW5nLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbjwvY29kZT48L3ByZT5cXG48cD5HdWVzcyB3aGF0PyBUaGUgY29udHJvbGxlciBzaG91bGQgYmUgYSBtb2R1bGUgd2hpY2ggZXhwb3J0cyBhIGZ1bmN0aW9uLiBUaGF0IGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIHdoZW5ldmVyIHRoZSB2aWV3IGlzIHJlbmRlcmVkLiBGb3IgdGhlIHNha2Ugb2Ygc2ltcGxpY2l0eSB3ZSYjMzk7bGwganVzdCBwcmludCB0aGUgYWN0aW9uIGFuZCB0aGUgbW9kZWwgdG8gdGhlIGNvbnNvbGUuIElmIHRoZXJlJiMzOTtzIG9uZSBwbGFjZSB3aGVyZSB5b3UmIzM5O2Qgd2FudCB0byBlbmhhbmNlIHRoZSBleHBlcmllbmNlLCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgd2hlcmUgeW91IHdhbnQgdG8gcHV0IHlvdXIgY29kZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwsIHJvdXRlLCBjb250YWluZXIpIHtcXG4gIGNvbnNvbGUubG9nKCYjMzk7UmVuZGVyZWQgdmlldyAlcyB1c2luZyBtb2RlbCAlcyYjMzk7LCByb3V0ZS5hY3Rpb24sIG1vZGVsKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1jbGllbnQtc2lkZS10YXVudXMtYXBpXFxcIj5Vc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSTwvaDQ+XFxuPHA+VGF1bnVzIGRvZXMgcHJvdmlkZSA8YSBocmVmPVxcXCIvYXBpXFxcIj5hIHRoaW4gQVBJPC9hPiBpbiB0aGUgY2xpZW50LXNpZGUuIFVzYWdlIG9mIHRoYXQgQVBJIGJlbG9uZ3MgbW9zdGx5IGluc2lkZSB0aGUgYm9keSBvZiBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXJzLCBidXQgdGhlcmUmIzM5O3MgYSBmZXcgbWV0aG9kcyB5b3UgY2FuIHRha2UgYWR2YW50YWdlIG9mIG9uIGEgZ2xvYmFsIHNjYWxlIGFzIHdlbGwuPC9wPlxcbjxwPlRhdW51cyBjYW4gbm90aWZ5IHlvdSB3aGVuZXZlciBpbXBvcnRhbnQgZXZlbnRzIG9jY3VyLjwvcD5cXG48dGFibGU+XFxuPHRoZWFkPlxcbjx0cj5cXG48dGg+RXZlbnQ8L3RoPlxcbjx0aD5Bcmd1bWVudHM8L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7c3RhcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbiA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IGZpbmlzaGVkIHRoZSByb3V0ZSBzZXR1cCBhbmQgaXMgYWJvdXQgdG8gaW52b2tlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyLiBTdWJzY3JpYmUgdG8gdGhpcyBldmVudCBiZWZvcmUgY2FsbGluZyA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7cmVuZGVyJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbDwvY29kZT48L3RkPlxcbjx0ZD5BIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZDwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guc3RhcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmRvbmUmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dCwgZGF0YTwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5LjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guYWJvcnQmIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGlzIHB1cnBvc2VseSBhYm9ydGVkLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZXJyb3ImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5yb3V0ZSwgY29udGV4dCwgZXJyPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgcmVzdWx0cyBpbiBhbiBIVFRQIGVycm9yLjwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+QmVzaWRlcyBldmVudHMsIHRoZXJlJiMzOTtzIGEgY291cGxlIG1vcmUgbWV0aG9kcyB5b3UgY2FuIHVzZS4gVGhlIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT4gbWV0aG9kIGFsbG93cyB5b3UgdG8gbmF2aWdhdGUgdG8gYSBVUkwgd2l0aG91dCB0aGUgbmVlZCBmb3IgYSBodW1hbiB0byBjbGljayBvbiBhbiBhbmNob3IgbGluay4gVGhlbiB0aGVyZSYjMzk7cyA8Y29kZT50YXVudXMucGFydGlhbDwvY29kZT4sIGFuZCB0aGF0IGFsbG93cyB5b3UgdG8gcmVuZGVyIGFueSBwYXJ0aWFsIHZpZXcgb24gYSBET00gZWxlbWVudCBvZiB5b3VyIGNob29zaW5nLCBhbmQgaXQmIzM5O2xsIHRoZW4gaW52b2tlIGl0cyBjb250cm9sbGVyLiBZb3UmIzM5O2xsIG5lZWQgdG8gY29tZSB1cCB3aXRoIHRoZSBtb2RlbCB5b3Vyc2VsZiwgdGhvdWdoLjwvcD5cXG48cD5Bc3RvbmlzaGluZ2x5LCB0aGUgQVBJIGlzIGZ1cnRoZXIgZG9jdW1lbnRlZCBpbiA8YSBocmVmPVxcXCIvYXBpXFxcIj50aGUgQVBJIGRvY3VtZW50YXRpb248L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNhY2hpbmctYW5kLXByZWZldGNoaW5nXFxcIj5DYWNoaW5nIGFuZCBQcmVmZXRjaGluZzwvaDQ+XFxuPHA+PGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5QZXJmb3JtYW5jZTwvYT4gcGxheXMgYW4gaW1wb3J0YW50IHJvbGUgaW4gVGF1bnVzLiBUaGF0JiMzOTtzIHdoeSB0aGUgeW91IGNhbiBwZXJmb3JtIGNhY2hpbmcgYW5kIHByZWZldGNoaW5nIG9uIHRoZSBjbGllbnQtc2lkZSBqdXN0IGJ5IHR1cm5pbmcgb24gYSBwYWlyIG9mIGZsYWdzLiBCdXQgd2hhdCBkbyB0aGVzZSBmbGFncyBkbyBleGFjdGx5PzwvcD5cXG48cD5XaGVuIHR1cm5lZCBvbiwgYnkgcGFzc2luZyA8Y29kZT57IGNhY2hlOiB0cnVlIH08L2NvZGU+IGFzIHRoZSB0aGlyZCBwYXJhbWV0ZXIgZm9yIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4sIHRoZSBjYWNoaW5nIGxheWVyIHdpbGwgbWFrZSBzdXJlIHRoYXQgcmVzcG9uc2VzIGFyZSBrZXB0IGFyb3VuZCBmb3IgPGNvZGU+MTU8L2NvZGU+IHNlY29uZHMuIFdoZW5ldmVyIGEgcm91dGUgbmVlZHMgYSBtb2RlbCBpbiBvcmRlciB0byByZW5kZXIgYSB2aWV3LCBpdCYjMzk7bGwgZmlyc3QgYXNrIHRoZSBjYWNoaW5nIGxheWVyIGZvciBhIGZyZXNoIGNvcHkuIElmIHRoZSBjYWNoaW5nIGxheWVyIGRvZXNuJiMzOTt0IGhhdmUgYSBjb3B5LCBvciBpZiB0aGF0IGNvcHkgaXMgc3RhbGUgPGVtPihpbiB0aGlzIGNhc2UsIG9sZGVyIHRoYW4gPGNvZGU+MTU8L2NvZGU+IHNlY29uZHMpPC9lbT4sIHRoZW4gYW4gQUpBWCByZXF1ZXN0IHdpbGwgYmUgaXNzdWVkIHRvIHRoZSBzZXJ2ZXIuIE9mIGNvdXJzZSwgdGhlIGR1cmF0aW9uIGlzIGNvbmZpZ3VyYWJsZS4gSWYgeW91IHdhbnQgdG8gdXNlIGEgdmFsdWUgb3RoZXIgdGhhbiB0aGUgZGVmYXVsdCwgeW91IHNob3VsZCBzZXQgPGNvZGU+Y2FjaGU8L2NvZGU+IHRvIGEgbnVtYmVyIGluIHNlY29uZHMgaW5zdGVhZCBvZiBqdXN0IDxjb2RlPnRydWU8L2NvZGU+LjwvcD5cXG48cD5TaW5jZSBUYXVudXMgdW5kZXJzdGFuZHMgdGhhdCBub3QgZXZlcnkgdmlldyBvcGVyYXRlcyB1bmRlciB0aGUgc2FtZSBjb25zdHJhaW50cywgeW91JiMzOTtyZSBhbHNvIGFibGUgdG8gc2V0IGEgPGNvZGU+Y2FjaGU8L2NvZGU+IGZyZXNobmVzcyBkdXJhdGlvbiBkaXJlY3RseSBpbiB5b3VyIHJvdXRlcy4gVGhlIDxjb2RlPmNhY2hlPC9jb2RlPiBwcm9wZXJ0eSBpbiByb3V0ZXMgaGFzIHByZWNlZGVuY2Ugb3ZlciB0aGUgZGVmYXVsdCB2YWx1ZS48L3A+XFxuPHA+VGhlcmUmIzM5O3MgY3VycmVudGx5IHR3byBjYWNoaW5nIHN0b3JlczogYSByYXcgaW4tbWVtb3J5IHN0b3JlLCBhbmQgYW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXFwiPkluZGV4ZWREQjwvYT4gc3RvcmUuIEluZGV4ZWREQiBpcyBhbiBlbWJlZGRlZCBkYXRhYmFzZSBzb2x1dGlvbiwgYW5kIHlvdSBjYW4gdGhpbmsgb2YgaXQgbGlrZSBhbiBhc3luY2hyb25vdXMgdmVyc2lvbiBvZiA8Y29kZT5sb2NhbFN0b3JhZ2U8L2NvZGU+LiBJdCBoYXMgPGEgaHJlZj1cXFwiaHR0cDovL2Nhbml1c2UuY29tLyNmZWF0PWluZGV4ZWRkYlxcXCI+c3VycHJpc2luZ2x5IGJyb2FkIGJyb3dzZXIgc3VwcG9ydDwvYT4sIGFuZCBpbiB0aGUgY2FzZXMgd2hlcmUgaXQmIzM5O3Mgbm90IHN1cHBvcnRlZCB0aGVuIGNhY2hpbmcgaXMgZG9uZSBzb2xlbHkgaW4tbWVtb3J5LjwvcD5cXG48cD5UaGUgcHJlZmV0Y2hpbmcgbWVjaGFuaXNtIGlzIGFuIGludGVyZXN0aW5nIHNwaW4tb2ZmIG9mIGNhY2hpbmcsIGFuZCBpdCByZXF1aXJlcyBjYWNoaW5nIHRvIGJlIGVuYWJsZWQgaW4gb3JkZXIgdG8gd29yay4gV2hlbmV2ZXIgaHVtYW5zIGhvdmVyIG92ZXIgYSBsaW5rLCBvciB3aGVuZXZlciB0aGV5IHB1dCB0aGVpciBmaW5nZXIgb24gb25lIG9mIHRoZW0gPGVtPih0aGUgPGNvZGU+dG91Y2hzdGFydDwvY29kZT4gZXZlbnQpPC9lbT4sIHRoZSBwcmVmZXRjaGVyIHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBmb3IgdGhhdCBsaW5rLjwvcD5cXG48cD5JZiB0aGUgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseSB0aGVuIHRoZSByZXNwb25zZSB3aWxsIGJlIGNhY2hlZCBpbiB0aGUgc2FtZSB3YXkgYW55IG90aGVyIHZpZXcgd291bGQgYmUgY2FjaGVkLiBJZiB0aGUgaHVtYW4gaG92ZXJzIG92ZXIgYW5vdGhlciBsaW5rIHdoaWxlIHRoZSBwcmV2aW91cyBvbmUgaXMgc3RpbGwgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGUgb2xkIHJlcXVlc3QgaXMgYWJvcnRlZCwgYXMgbm90IHRvIGRyYWluIHRoZWlyIDxlbT4ocG9zc2libHkgbGltaXRlZCk8L2VtPiBJbnRlcm5ldCBjb25uZWN0aW9uIGJhbmR3aWR0aC48L3A+XFxuPHA+SWYgdGhlIGh1bWFuIGNsaWNrcyBvbiB0aGUgbGluayBiZWZvcmUgcHJlZmV0Y2hpbmcgaXMgY29tcGxldGVkLCBoZSYjMzk7bGwgbmF2aWdhdGUgdG8gdGhlIHZpZXcgYXMgc29vbiBhcyBwcmVmZXRjaGluZyBlbmRzLCByYXRoZXIgdGhhbiBmaXJpbmcgYW5vdGhlciByZXF1ZXN0LiBUaGlzIGhlbHBzIFRhdW51cyBzYXZlIHByZWNpb3VzIG1pbGxpc2Vjb25kcyB3aGVuIGRlYWxpbmcgd2l0aCBsYXRlbmN5LXNlbnNpdGl2ZSBvcGVyYXRpb25zLjwvcD5cXG48cD5UdXJuaW5nIHByZWZldGNoaW5nIG9uIGlzIHNpbXBseSBhIG1hdHRlciBvZiBzZXR0aW5nIDxjb2RlPnByZWZldGNoPC9jb2RlPiB0byA8Y29kZT50cnVlPC9jb2RlPiBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi4gRm9yIGFkZGl0aW9uYWwgaW5zaWdodHMgaW50byB0aGUgcGVyZm9ybWFuY2UgaW1wcm92ZW1lbnRzIFRhdW51cyBjYW4gb2ZmZXIsIGhlYWQgb3ZlciB0byB0aGUgPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5QZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25zPC9hPiBndWlkZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJ0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvaDE+XFxuPHA+WW91JiMzOTtyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4mIzM5O3Qgc3RvcCB0aGVyZS48L3A+XFxuPHVsPlxcbjxsaT5MZWFybiBtb3JlIGFib3V0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgVGF1bnVzIGhhczwvYT4gdG8gb2ZmZXI8L2xpPlxcbjxsaT5HbyB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPnBlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzPC9hPi4gWW91IG1heSBsZWFybiBzb21ldGhpbmcgbmV3ITwvbGk+XFxuPGxpPjxlbT5GYW1pbGlhcml6ZSB5b3Vyc2VsZiB3aXRoIHRoZSB3YXlzIG9mIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50PC9lbT48dWw+XFxuPGxpPkplcmVteSBLZWl0aCBlbnVuY2lhdGVzIDxhIGhyZWY9XFxcImh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxcIj4mcXVvdDtCZSBwcm9ncmVzc2l2ZSZxdW90OzwvYT48L2xpPlxcbjxsaT5DaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciA8YSBocmVmPVxcXCJodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcXCI+JnF1b3Q7UHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkpha2UgQXJjaGliYWxkIGV4cGxhaW5zIGhvdyA8YSBocmVmPVxcXCJodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxcIj4mcXVvdDtQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXImcXVvdDs8L2E+PC9saT5cXG48bGk+SSBibG9nZ2VkIGFib3V0IGhvdyB3ZSBzaG91bGQgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+JnF1b3Q7U3RvcCBCcmVha2luZyB0aGUgV2ViJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkd1aWxsZXJtbyBSYXVjaCBhcmd1ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9yYXVjaGcuY29tLzIwMTQvNy1wcmluY2lwbGVzLW9mLXJpY2gtd2ViLWFwcGxpY2F0aW9ucy9cXFwiPiZxdW90OzcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnMmcXVvdDs8L2E+PC9saT5cXG48bGk+QWFyb24gR3VzdGFmc29uIHdyaXRlcyA8YSBocmVmPVxcXCJodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcXCI+JnF1b3Q7VW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudCZxdW90OzwvYT48L2xpPlxcbjxsaT5PcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIDxhIGhyZWY9XFxcImh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2UmcXVvdDs8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlNpZnQgdGhyb3VnaCB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXM8L2E+LiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJiMzOTt0IHRob3VnaHQgb2YhPC9saT5cXG48L3VsPlxcbjxwPkFsc28sIGdldCBpbnZvbHZlZCE8L3A+XFxuPHVsPlxcbjxsaT5Gb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW8vcHVsbHNcXFwiPnNlbmQgc29tZSBwdWxsIHJlcXVlc3RzPC9hPiB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyE8L2xpPlxcbjxsaT5TZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxcIj5wbGVhc2UgY3JlYXRlIGFuIGlzc3VlPC9hPiE8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBHZXR0aW5nIFN0YXJ0ZWRcXG5cXG4gICAgVGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQncyBfdXAgdG8geW91IGhvdyB0byB1c2UgaXRfLiBJbiBmYWN0LCBpdCBtaWdodCBiZSBhIGdvb2QgaWRlYSBmb3IgeW91IHRvICoqc2V0IHVwIGp1c3QgdGhlIHNlcnZlci1zaWRlIGFzcGVjdCBmaXJzdCoqLCBhcyB0aGF0J2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LlxcblxcbiAgICAjIFRhYmxlIG9mIENvbnRlbnRzXFxuXFxuICAgIC0gW0hvdyBpdCB3b3Jrc10oI2hvdy1pdC13b3JrcylcXG4gICAgLSBbSW5zdGFsbGluZyBUYXVudXNdKCNpbnN0YWxsaW5nLXRhdW51cylcXG4gICAgLSBbU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVdKCNzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZSlcXG4gICAgICAtIFtDcmVhdGluZyBhIGxheW91dF0oI2NyZWF0aW5nLWEtbGF5b3V0KVxcbiAgICAgIC0gW1lvdXIgZmlyc3Qgcm91dGVdKCN5b3VyLWZpcnN0LXJvdXRlKVxcbiAgICAgIC0gW1VzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZV0oI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZSlcXG4gICAgICAtIFtUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJdKCN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXIpXFxuICAgIC0gW1RhdW51cyBpbiB0aGUgY2xpZW50XSgjdGF1bnVzLWluLXRoZS1jbGllbnQpXFxuICAgICAgLSBbVXNpbmcgdGhlIFRhdW51cyBDTEldKCN1c2luZy10aGUtdGF1bnVzLWNsaSlcXG4gICAgICAtIFtCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJdKCNib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXIpXFxuICAgICAgLSBbQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXSgjYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyKVxcbiAgICAgIC0gW1VzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJXSgjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGkpXFxuICAgICAgLSBbQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmddKCNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZylcXG4gICAgLSBbVGhlIHNreSBpcyB0aGUgbGltaXQhXSgjdGhlLXNreS1pcy10aGUtbGltaXQtKVxcblxcbiAgICAjIEhvdyBpdCB3b3Jrc1xcblxcbiAgICBUYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgKipwcm92ZW4qKiBzZXQgb2YgcnVsZXMuXFxuXFxuICAgIC0gRGVmaW5lIGEgYGZ1bmN0aW9uKG1vZGVsKWAgZm9yIGVhY2ggeW91ciB2aWV3c1xcbiAgICAtIFB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBEZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uXFxuICAgIC0gUHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBFbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHNcXG4gICAgLSBDcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3NcXG4gICAgLSBDcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXdcXG4gICAgLSBGb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlXFxuICAgIC0gV2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCFcXG4gICAgLSBPbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCAqKmhpamFjayBsaW5rIGNsaWNrcyoqIGFuZCBtYWtlIEFKQVggcmVxdWVzdHMgaW5zdGVhZFxcbiAgICAtIFdoZW4geW91IGdldCB0aGUgSlNPTiBtb2RlbCBiYWNrLCByZW5kZXIgdmlld3Mgb24gdGhlIGNsaWVudC1zaWRlXFxuICAgIC0gSWYgdGhlIGBoaXN0b3J5YCBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiAqKkRvbid0IGNvbmZ1c2UgeW91ciBodW1hbnMgd2l0aCBvYnNjdXJlIGhhc2ggcm91dGVycyEqKlxcblxcbiAgICBJJ2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgc3RlcHMgeW91IG5lZWQgdG8gdGFrZSBpbiBvcmRlciB0byBtYWtlIHRoaXMgZmxvdyBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgSW5zdGFsbGluZyBUYXVudXNcXG5cXG4gICAgRmlyc3Qgb2ZmLCB5b3UnbGwgbmVlZCB0byBjaG9vc2UgYSBIVFRQIHNlcnZlciBmcmFtZXdvcmsgZm9yIHlvdXIgYXBwbGljYXRpb24uIEF0IHRoZSBtb21lbnQgVGF1bnVzIHN1cHBvcnRzIG9ubHkgYSBjb3VwbGUgb2YgSFRUUCBmcmFtZXdvcmtzLCBidXQgbW9yZSBtYXkgYmUgYWRkZWQgaWYgdGhleSBhcmUgcG9wdWxhciBlbm91Z2guXFxuXFxuICAgIC0gW0V4cHJlc3NdWzZdLCB0aHJvdWdoIFt0YXVudXMtZXhwcmVzc11bMV1cXG4gICAgLSBbSGFwaV1bN10sIHRocm91Z2ggW3RhdW51cy1oYXBpXVsyXSBhbmQgdGhlIFtoYXBpaWZ5XVszXSB0cmFuc2Zvcm1cXG5cXG4gICAgPiBJZiB5b3UncmUgbW9yZSBvZiBhIF9cXFwicnVtbWFnZSB0aHJvdWdoIHNvbWVvbmUgZWxzZSdzIGNvZGVcXFwiXyB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIFtnb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSdzIHNvdXJjZSBjb2RlXVs0XSwgd2hpY2ggdXNlcyB0aGUgW0hhcGldWzddIGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgW3Bvbnlmb28uY29tXVs1XSwgd2hpY2ggaXMgKiphIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2UqKiB1bmRlciB0aGUgW0V4cHJlc3NdWzZdIGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQncyBva2F5IHRvby5cXG5cXG4gICAgT25jZSB5b3UndmUgc2V0dGxlZCBmb3IgZWl0aGVyIFtFeHByZXNzXVs2XSBvciBbSGFwaV1bN10geW91J2xsIGJlIGFibGUgdG8gcHJvY2VlZC4gRm9yIHRoZSBwdXJwb3NlcyBvZiB0aGlzIGd1aWRlLCB3ZSdsbCB1c2UgW0V4cHJlc3NdWzZdLiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVcXG5cXG4gICAgTmF0dXJhbGx5LCB5b3UnbGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSBgbnBtYCB0byBnZXQgc3RhcnRlZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgdGF1bnVzIHRhdW51cy1leHByZXNzIGV4cHJlc3MgLS1zYXZlXFxuICAgIGBgYFxcblxcbiAgICBMZXQncyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZW0gYXMgd2UgZ28gYWxvbmcuIEZpcnN0IG9mIGFsbCwgeW91J2xsIG5lZWQgdGhlIGZhbW91cyBgYXBwLmpzYCBmaWxlLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBhcHAuanNcXG4gICAgYGBgXFxuXFxuICAgIEl0J3MgcHJvYmFibHkgYSBnb29kIGlkZWEgdG8gcHV0IHNvbWV0aGluZyBpbiB5b3VyIGBhcHAuanNgIGZpbGUsIGxldCdzIGRvIHRoYXQgbm93LlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBBbGwgYHRhdW51cy1leHByZXNzYCByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIGBhcHBgLiBZb3Ugc2hvdWxkIG5vdGUgdGhhdCBhbnkgbWlkZGxld2FyZSBhbmQgQVBJIHJvdXRlcyBzaG91bGQgcHJvYmFibHkgY29tZSBiZWZvcmUgdGhlIGB0YXVudXNFeHByZXNzYCBpbnZvY2F0aW9uLiBZb3UnbGwgcHJvYmFibHkgYmUgdXNpbmcgYSBjYXRjaC1hbGwgdmlldyByb3V0ZSB0aGF0IHJlbmRlcnMgYSBfXFxcIk5vdCBGb3VuZFxcXCJfIHZpZXcsIGJsb2NraW5nIGFueSByb3V0aW5nIGJleW9uZCB0aGF0IHJvdXRlLlxcblxcbiAgICBUaGUgYG9wdGlvbnNgIG9iamVjdCBwYXNzZWQgdG8gYHRhdW51c0V4cHJlc3NgIGxldCdzIHlvdSBjb25maWd1cmUgVGF1bnVzLiBJbnN0ZWFkIG9mIGRpc2N1c3NpbmcgZXZlcnkgc2luZ2xlIGNvbmZpZ3VyYXRpb24gb3B0aW9uIHlvdSBjb3VsZCBzZXQgaGVyZSwgbGV0J3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSBfcmVxdWlyZWQgY29uZmlndXJhdGlvbl8uIFRoZXJlJ3MgdHdvIG9wdGlvbnMgdGhhdCB5b3UgbXVzdCBzZXQgaWYgeW91IHdhbnQgeW91ciBUYXVudXMgYXBwbGljYXRpb24gdG8gbWFrZSBhbnkgc2Vuc2UuXFxuXFxuICAgIC0gYGxheW91dGAgc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSBgbW9kZWxgIGFyZ3VtZW50IGFuZCByZXR1cm5zIGFuIGVudGlyZSBIVE1MIGRvY3VtZW50XFxuICAgIC0gYHJvdXRlc2Agc2hvdWxkIGJlIGFuIGFycmF5IG9mIHZpZXcgcm91dGVzXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ3JlYXRpbmcgYSBsYXlvdXRcXG5cXG4gICAgTGV0J3MgYWxzbyBjcmVhdGUgYSBsYXlvdXQuIEZvciB0aGUgcHVycG9zZXMgb2YgbWFraW5nIG91ciB3YXkgdGhyb3VnaCB0aGlzIGd1aWRlLCBpdCdsbCBqdXN0IGJlIGEgcGxhaW4gSmF2YVNjcmlwdCBmdW5jdGlvbi5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggbGF5b3V0LmpzXFxuICAgIGBgYFxcblxcbiAgICBOb3RlIHRoYXQgdGhlIGBwYXJ0aWFsYCBwcm9wZXJ0eSBpbiB0aGUgYG1vZGVsYCBfKGFzIHNlZW4gYmVsb3cpXyBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UnbGwgYmUgdXNpbmcgaGVyZSBlZmZlY3RpdmVseSBtZWFucyBfXFxcInRoZXJlIGlzIG5vIGxheW91dCwganVzdCByZW5kZXIgdGhlIHBhcnRpYWxzXFxcIl8uXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICByZXR1cm4gbW9kZWwucGFydGlhbDtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgaWYgeW91IHdlcmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24sIHRoZW4geW91IHByb2JhYmx5IHdvdWxkbid0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCdzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy5cXG5cXG4gICAgLSBbTXVzdGFjaGVdWzEwXSBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCdzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MXFxuICAgIC0gW0phZGVdWzExXSBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJ3Mgbm8gY2xvc2luZyB0YWdzXFxuICAgIC0gVGhlcmUncyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgW01vemlsbGEncyBOdW5qdWNrc11bMTJdLCBbSGFuZGxlYmFyc11bMTNdLCBhbmQgW0VKU11bMTRdLlxcblxcbiAgICBSZW1lbWJlciB0byBhZGQgdGhlIGBsYXlvdXRgIHVuZGVyIHRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCB0byBgdGF1bnVzRXhwcmVzc2AhXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBZb3UnbGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlcyBzZWN0aW9uXVsxNV0uIElmIHlvdSBkb24ndCBwcm92aWRlIGEgYGxheW91dGAgcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIGA8cHJlPmAgYW5kIGA8Y29kZT5gIHRhZ3MsIHdoaWNoIG1heSBhaWQgeW91IHdoZW4gZ2V0dGluZyBzdGFydGVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFlvdXIgZmlyc3Qgcm91dGVcXG5cXG4gICAgUm91dGVzIG5lZWQgdG8gYmUgcGxhY2VkIGluIGl0cyBvd24gZGVkaWNhdGVkIG1vZHVsZSwgc28gdGhhdCB5b3UgY2FuIHJldXNlIGl0IGxhdGVyIG9uICoqd2hlbiBzZXR0aW5nIHVwIGNsaWVudC1zaWRlIHJvdXRpbmcqKi4gTGV0J3MgY3JlYXRlIHRoYXQgbW9kdWxlIGFuZCBhZGQgYSByb3V0ZSB0byBpdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggcm91dGVzLmpzXFxuICAgIGBgYFxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gW1xcbiAgICAgIHsgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfVxcbiAgICBdO1xcbiAgICBgYGBcXG5cXG4gICAgRWFjaCBpdGVtIGluIHRoZSBleHBvcnRlZCBhcnJheSBpcyBhIHJvdXRlLiBJbiB0aGlzIGNhc2UsIHdlIG9ubHkgaGF2ZSB0aGUgYC9gIHJvdXRlIHdpdGggdGhlIGBob21lL2luZGV4YCBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbiBwYXR0ZXJuXVs4XSwgd2hpY2ggbWFkZSBbUnVieSBvbiBSYWlsc11bOV0gZmFtb3VzLiBfTWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vIV8gQnkgY29udmVudGlvbiwgVGF1bnVzIHdpbGwgYXNzdW1lIHRoYXQgdGhlIGBob21lL2luZGV4YCBhY3Rpb24gdXNlcyB0aGUgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIgYW5kIHJlbmRlcnMgdGhlIGBob21lL2luZGV4YCB2aWV3LiBPZiBjb3Vyc2UsIF9hbGwgb2YgdGhhdCBjYW4gYmUgY2hhbmdlZCB1c2luZyBjb25maWd1cmF0aW9uXy5cXG5cXG4gICAgVGltZSB0byBnbyBiYWNrIHRvIGBhcHAuanNgIGFuZCB1cGRhdGUgdGhlIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vbGF5b3V0JyksXFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL3JvdXRlcycpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgSXQncyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIF8obW9yZSBvbiB0aGF0IGxhdGVyLCBidXQgaXQgZGVmYXVsdHMgdG8gYHt9YClfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZVxcblxcbiAgICBMZXQncyBnbyBhaGVhZCBhbmQgdXNlIEphZGUgYXMgdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBjaG9pY2UgZm9yIG91ciB2aWV3cy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuICAgIGBgYFxcblxcbiAgICBTaW5jZSB3ZSdyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQncyBpdC5cXG5cXG4gICAgYGBgamFkZVxcbiAgICBwIEhlbGxvIFRhdW51cyFcXG4gICAgYGBgXFxuXFxuICAgIE5leHQgeW91J2xsIHdhbnQgdG8gY29tcGlsZSB0aGUgdmlldyBpbnRvIGEgZnVuY3Rpb24uIFRvIGRvIHRoYXQgeW91IGNhbiB1c2UgW2phZHVtXVsxNl0sIGEgc3BlY2lhbGl6ZWQgSmFkZSBjb21waWxlciB0aGF0IHBsYXlzIHdlbGwgd2l0aCBUYXVudXMgYnkgYmVpbmcgYXdhcmUgb2YgYHJlcXVpcmVgIHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0J3MgaW5zdGFsbCBpdCBnbG9iYWxseSwgZm9yIHRoZSBzYWtlIG9mIHRoaXMgZXhlcmNpc2UgXyh5b3Ugc2hvdWxkIGluc3RhbGwgaXQgbG9jYWxseSB3aGVuIHlvdSdyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbilfLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCBqYWR1bSAtZ1xcbiAgICBgYGBcXG5cXG4gICAgVG8gY29tcGlsZSBldmVyeSB2aWV3IGluIHRoZSBgdmlld3NgIGRpcmVjdG9yeSBpbnRvIGZ1bmN0aW9ucyB0aGF0IHdvcmsgd2VsbCB3aXRoIFRhdW51cywgeW91IGNhbiB1c2UgdGhlIGNvbW1hbmQgYmVsb3cuIFRoZSBgLS1vdXRwdXRgIGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSBgLmJpbmAgYmVjYXVzZSB0aGF0J3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbl1bMTddIGFwcHJvYWNoLCB5b3UgY291bGQgY2hhbmdlIHRoYXQgaWYgeW91IHdhbnRlZCB0by5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbiAgICBgYGBcXG5cXG4gICAgQ29uZ3JhdHVsYXRpb25zISBUYXVudXMgaXMgbm93IG9wZXJhdGlvbmFsLiBBbGwgdGhhdCdzIGxlZnQgaXMgZm9yIHlvdSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGFuZCB2aXNpdCBpdCBvbiBwb3J0IGAzMDAwYC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBvcGVuIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJcXG5cXG4gICAgQ29udHJvbGxlcnMgYXJlIGluZGVlZCBvcHRpb25hbCwgYnV0IGFuIGFwcGxpY2F0aW9uIHRoYXQgcmVuZGVycyBldmVyeSB2aWV3IHVzaW5nIHRoZSBzYW1lIG1vZGVsIHdvbid0IGdldCB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCdzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSBgaG9tZS92aWV3YCBhY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGNvbnRyb2xsZXJzL2hvbWUvaW5kZXguanNcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiBfU3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj9fIFRoZSBzaWduYXR1cmUgZm9yIHRoZSBjb250cm9sbGVyIGlzIHRoZSBzYW1lIHNpZ25hdHVyZSBhcyB0aGF0IG9mIGFueSBvdGhlciBtaWRkbGV3YXJlIHBhc3NlZCB0byBbRXhwcmVzc11bNl0gXyhvciBhbnkgcm91dGUgaGFuZGxlciBwYXNzZWQgdG8gW0hhcGldWzddIGluIHRoZSBjYXNlIG9mIGB0YXVudXMtaGFwaWApXy5cXG5cXG4gICAgQXMgeW91IG1heSBoYXZlIG5vdGljZWQgaW4gdGhlIGV4YW1wbGVzIHNvIGZhciwgeW91IGhhdmVuJ3QgZXZlbiBzZXQgYSBkb2N1bWVudCB0aXRsZSBmb3IgeW91ciBIVE1MIHBhZ2VzISBUdXJucyBvdXQsIHRoZXJlJ3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyBfKHZlcnkgZmV3KV8gdGhhdCBUYXVudXMgaXMgYXdhcmUgb2YuIE9uZSBvZiB0aG9zZSBpcyB0aGUgYHRpdGxlYCBwcm9wZXJ0eSwgYW5kIGl0J2xsIGJlIHVzZWQgdG8gY2hhbmdlIHRoZSBgZG9jdW1lbnQudGl0bGVgIGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0J3Mgbm90IGluIHRoZSBgbW9kZWxgIHByb3BlcnR5IHdvbid0IGJlIHRyYXNtaXR0ZWQgdG8gdGhlIGNsaWVudCwgYW5kIHdpbGwganVzdCBiZSBhY2Nlc3NpYmxlIHRvIHRoZSBsYXlvdXQuXFxuXFxuICAgIEhlcmUgaXMgb3VyIG5ld2ZhbmdsZWQgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIuIEFzIHlvdSdsbCBub3RpY2UsIGl0IGRvZXNuJ3QgZGlzcnVwdCBhbnkgb2YgdGhlIHR5cGljYWwgRXhwcmVzcyBleHBlcmllbmNlLCBidXQgbWVyZWx5IGJ1aWxkcyB1cG9uIGl0LiBXaGVuIGBuZXh0YCBpcyBjYWxsZWQsIHRoZSBUYXVudXMgdmlldy1yZW5kZXJpbmcgaGFuZGxlciB3aWxsIGtpY2sgaW4sIGFuZCByZW5kZXIgdGhlIHZpZXcgdXNpbmcgdGhlIGluZm9ybWF0aW9uIHRoYXQgd2FzIGFzc2lnbmVkIHRvIGByZXMudmlld01vZGVsYC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xcbiAgICAgIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgICAgICBtb2RlbDoge1xcbiAgICAgICAgICB0aXRsZTogJ1dlbGNvbWUgSG9tZSwgVGF1bnVzISdcXG4gICAgICAgIH1cXG4gICAgICB9O1xcbiAgICAgIG5leHQoKTtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgcmVseWluZyBvbiB0aGUgY2xpZW50LXNpZGUgY2hhbmdlcyB0byB5b3VyIHBhZ2UgaW4gb3JkZXIgdG8gc2V0IHRoZSB2aWV3IHRpdGxlIF93b3VsZG4ndCBiZSBwcm9ncmVzc2l2ZV8sIGFuZCB0aHVzIFtpdCB3b3VsZCBiZSByZWFsbHksIF9yZWFsbHlfIGJhZF1bMTddLiBXZSBzaG91bGQgdXBkYXRlIHRoZSBsYXlvdXQgdG8gdXNlIHdoYXRldmVyIGB0aXRsZWAgaGFzIGJlZW4gcGFzc2VkIHRvIHRoZSBtb2RlbC4gSW4gZmFjdCwgbGV0J3MgZ28gYmFjayB0byB0aGUgZHJhd2luZyBib2FyZCBhbmQgbWFrZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIHRlbXBsYXRlISBUaGUgYCE9YCBzeW50YXggbWVhbnMgdGhhdCB3aGF0ZXZlciBpcyBpbiB0aGUgdmFsdWUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgd29uJ3QgYmUgZXNjYXBlZC4gVGhhdCdzIG9rYXkgYmVjYXVzZSBgcGFydGlhbGAgaXMgYSB2aWV3IHdoZXJlIEphZGUgZXNjYXBlZCBhbnl0aGluZyB0aGF0IG5lZWRlZCBlc2NhcGluZywgYnV0IHdlIHdvdWxkbid0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhXFxuXFxuICAgIGBgYGphZGVcXG4gICAgdGl0bGU9bW9kZWwudGl0bGVcXG4gICAgbWFpbiE9cGFydGlhbFxcbiAgICBgYGBcXG5cXG4gICAgQnkgdGhlIHdheSwgZGlkIHlvdSBrbm93IHRoYXQgYDxodG1sPmAsIGA8aGVhZD5gLCBhbmQgYDxib2R5PmAgYXJlIGFsbCBvcHRpb25hbCBpbiBIVE1MIDUsIGFuZCB0aGF0IHlvdSBjYW4gc2FmZWx5IG9taXQgdGhlbSBpbiB5b3VyIEhUTUw/IE9mIGNvdXJzZSwgcmVuZGVyaW5nIGVuZ2luZXMgd2lsbCBzdGlsbCBpbnNlcnQgdGhvc2UgZWxlbWVudHMgYXV0b21hdGljYWxseSBpbnRvIHRoZSBET00gZm9yIHlvdSEgX0hvdyBjb29sIGlzIHRoYXQ/X1xcblxcbiAgICBUaGF0J3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUncyBub3RoaW5nIHN0b3BwaW5nIHlvdSBmcm9tIGFkZGluZyBkYXRhYmFzZSBjYWxscyB0byBmZXRjaCBiaXRzIGFuZCBwaWVjZXMgb2YgdGhlIG1vZGVsIGJlZm9yZSBpbnZva2luZyBgbmV4dGAgdG8gcmVuZGVyIHRoZSB2aWV3LlxcblxcbiAgICBUaGVyZSdzIGFsc28gdGhlIGNsaWVudC1zaWRlIGFzcGVjdCBvZiBzZXR0aW5nIHVwIFRhdW51cy4gTGV0J3Mgc2V0IGl0IHVwIGFuZCBzZWUgaG93IGl0IG9wZW5zIHVwIG91ciBwb3NzaWJpbGl0aWVzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRhdW51cyBpbiB0aGUgY2xpZW50XFxuXFxuICAgIFlvdSBhbHJlYWR5IGtub3cgaG93IHRvIHNldCB1cCB0aGUgYmFzaWNzIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmcsIGFuZCB5b3Uga25vdyB0aGF0IHlvdSBzaG91bGQgW2NoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSB0byBnZXQgYSBtb3JlIHRob3JvdWdoIHVuZGVyc3RhbmRpbmcgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2Ugb24gVGF1bnVzLCBhbmQgd2hhdCBpdCBlbmFibGVzIHlvdSB0byBkby5cXG5cXG4gICAgVGhlIHdheSBUYXVudXMgd29ya3Mgb24gdGhlIGNsaWVudC1zaWRlIGlzIHNvIHRoYXQgb25jZSB5b3Ugc2V0IGl0IHVwLCBpdCB3aWxsIGhpamFjayBsaW5rIGNsaWNrcyBhbmQgdXNlIEFKQVggdG8gZmV0Y2ggbW9kZWxzIGFuZCByZW5kZXIgdGhvc2Ugdmlld3MgaW4gdGhlIGNsaWVudC4gSWYgdGhlIEphdmFTY3JpcHQgY29kZSBmYWlscyB0byBsb2FkLCBfb3IgaWYgaXQgaGFzbid0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzXywgdGhlIHJlZ3VsYXIgbGluayB3b3VsZCBiZSBmb2xsb3dlZCBpbnN0ZWFkIGFuZCBubyBoYXJtIHdvdWxkIGJlIHVubGVhc2hlZCB1cG9uIHRoZSBodW1hbiwgZXhjZXB0IHRoZXkgd291bGQgZ2V0IGEgc2xpZ2h0bHkgbGVzcyBmYW5jeSBleHBlcmllbmNlLlxcblxcbiAgICBTZXR0aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBpbnZvbHZlcyBhIGZldyBkaWZmZXJlbnQgc3RlcHMuIEZpcnN0bHksIHdlJ2xsIGhhdmUgdG8gY29tcGlsZSB0aGUgYXBwbGljYXRpb24ncyB3aXJpbmcgXyh0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKV8gaW50byBzb21ldGhpbmcgdGhlIGJyb3dzZXIgdW5kZXJzdGFuZHMuIFRoZW4sIHlvdSdsbCBoYXZlIHRvIG1vdW50IFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUsIHBhc3NpbmcgdGhlIHdpcmluZyBzbyB0aGF0IGl0IGtub3dzIHdoaWNoIHJvdXRlcyBpdCBzaG91bGQgcmVzcG9uZCB0bywgYW5kIHdoaWNoIG90aGVycyBpdCBzaG91bGQgbWVyZWx5IGlnbm9yZS4gT25jZSB0aGF0J3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLlxcblxcbiAgICBBcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UnbGwgbGVhcm4sIHdpbGwgYWxzbyBsZXQgeW91IHJlbmRlciBwYXJ0aWFsIHZpZXdzIHVzaW5nIHRoZSBwb3dlcmZ1bCBUYXVudXMgZW5naW5lLCBsaXN0ZW4gZm9yIGV2ZW50cyB0aGF0IG1heSBvY2N1ciBhdCBrZXkgc3RhZ2VzIG9mIHRoZSB2aWV3LXJlbmRlcmluZyBwcm9jZXNzLCBhbmQgZXZlbiBpbnRlcmNlcHQgQUpBWCByZXF1ZXN0cyBibG9ja2luZyB0aGVtIGJlZm9yZSB0aGV5IGV2ZXIgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBUYXVudXMgQ0xJXFxuXFxuICAgIFRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbid0IGhhdmUgdG8gYHJlcXVpcmVgIGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCBgamFkdW1gIGVhcmxpZXIsIHdlJ2xsIGluc3RhbGwgdGhlIGB0YXVudXNgIENMSSBnbG9iYWxseSBmb3IgdGhlIHNha2Ugb2YgZXhlcmNpc2luZywgYnV0IHdlIHVuZGVyc3RhbmQgdGhhdCByZWx5aW5nIG9uIGdsb2JhbGx5IGluc3RhbGxlZCBtb2R1bGVzIGlzIGluc3VmZmljaWVudCBmb3IgcHJvZHVjdGlvbi1ncmFkZSBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIHRhdW51cyAtZ1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIENMSSBpcyB0ZXJzZSBpbiBib3RoIGl0cyBpbnB1dHMgYW5kIGl0cyBvdXRwdXRzLiBJZiB5b3UgcnVuIGl0IHdpdGhvdXQgYW55IGFyZ3VtZW50cyBpdCdsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgYC0tb3V0cHV0YCBmbGFnLiBJbiB0eXBpY2FsIFtjb252ZW50aW9uLW92ZXItY29uZmlndXJhdGlvbl1bOF0gZmFzaGlvbiwgdGhlIENMSSB3aWxsIGRlZmF1bHQgdG8gaW5mZXJyaW5nIHlvdXIgdmlld3MgYXJlIGxvY2F0ZWQgaW4gYC5iaW4vdmlld3NgIGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiBgLmJpbi93aXJpbmcuanNgLCBidXQgeW91J2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24ndCBtZWV0IHlvdXIgbmVlZHMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dFxcbiAgICBgYGBcXG5cXG4gICAgQXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgYC5iaW4vd2lyaW5nLmpzYCBmaWxlIHdpdGggdGhlIGNvbnRlbnRzIGRldGFpbGVkIGJlbG93LiBBcyB5b3UgY2FuIHNlZSwgZXZlbiBpZiBgdGF1bnVzYCBpcyBhbiBhdXRvbWF0ZWQgY29kZS1nZW5lcmF0aW9uIHRvb2wsIGl0J3Mgb3V0cHV0IGlzIGFzIGh1bWFuIHJlYWRhYmxlIGFzIGFueSBvdGhlciBtb2R1bGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRlbXBsYXRlcyA9IHtcXG4gICAgICAnaG9tZS9pbmRleCc6IHJlcXVpcmUoJy4vdmlld3MvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciBjb250cm9sbGVycyA9IHtcXG4gICAgfTtcXG5cXG4gICAgdmFyIHJvdXRlcyA9IHtcXG4gICAgICAnLyc6IHtcXG4gICAgICAgIGFjdGlvbjogJ2hvbWUvaW5kZXgnXFxuICAgICAgfVxcbiAgICB9O1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcXG4gICAgICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gICAgICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICAgICAgcm91dGVzOiByb3V0ZXNcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYGNvbnRyb2xsZXJzYCBvYmplY3QgaXMgZW1wdHkgYmVjYXVzZSB5b3UgaGF2ZW4ndCBjcmVhdGVkIGFueSBfY2xpZW50LXNpZGUgY29udHJvbGxlcnNfIHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJ3QgaGF2ZSBhbnkgZWZmZWN0IGluIHRoZSBjbGllbnQtc2lkZSwgYmVzaWRlcyBkZXRlcm1pbmluZyB3aGF0IGdldHMgc2VudCB0byB0aGUgY2xpZW50LlxcblxcbiAgICBUaGUgQ0xJIGNhbiBiZSBlbnRpcmVseSBpZ25vcmVkLCB5b3UgY291bGQgd3JpdGUgdGhlc2UgZGVmaW5pdGlvbnMgYnkgeW91cnNlbGYsIGJ1dCB5b3Ugd291bGQgaGF2ZSB0byByZW1lbWJlciB0byB1cGRhdGUgdGhpcyBmaWxlIHdoZW5ldmVyIHlvdSBhZGQsIGNoYW5nZSwgb3IgcmVtb3ZlIGEgdmlldywgYSBjbGllbnQtc2lkZSBjb250cm9sbGVyLCBvciBhIHJvdXRlLiBEb2luZyB0aGF0IHdvdWxkIGJlIGN1bWJlcnNvbWUsIGFuZCB0aGUgQ0xJIHNvbHZlcyB0aGF0IHByb2JsZW0gZm9yIHVzIGF0IHRoZSBleHBlbnNlIG9mIG9uZSBhZGRpdGlvbmFsIGJ1aWxkIHN0ZXAuXFxuXFxuICAgIER1cmluZyBkZXZlbG9wbWVudCwgeW91IGNhbiBhbHNvIGFkZCB0aGUgYC0td2F0Y2hgIGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG4gICAgYGBgXFxuXFxuICAgIElmIHlvdSdyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91J2xsIGFsc28gbmVlZCB0byBwYXNzIGluIHRoZSBgaGFwaWlmeWAgdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuICAgIGBgYFxcblxcbiAgICBOb3cgdGhhdCB5b3UgdW5kZXJzdGFuZCBob3cgdG8gdXNlIHRoZSBDTEkgb3IgYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgb24geW91ciBvd24sIGJvb3RpbmcgdXAgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSB3aWxsIGJlIGFuIGVhc3kgdGhpbmcgdG8gZG8hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyXFxuXFxuICAgIE9uY2Ugd2UgaGF2ZSB0aGUgd2lyaW5nIG1vZHVsZSwgYm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgZW5naW5lIGlzIHByZXR0eSBlYXN5LiBUYXVudXMgc3VnZ2VzdHMgeW91IHVzZSBgY2xpZW50L2pzYCB0byBrZWVwIGFsbCBvZiB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQgbG9naWMsIGJ1dCB0aGF0IGlzIHVwIHRvIHlvdSB0b28uIEZvciB0aGUgc2FrZSBvZiB0aGlzIGd1aWRlLCBsZXQncyBzdGljayB0byB0aGUgY29udmVudGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGNsaWVudC9qcy9tYWluLmpzXFxuICAgIGBgYFxcblxcbiAgICBUaGUgYG1haW5gIG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIF9lbnRyeSBwb2ludF8gb2YgeW91ciBhcHBsaWNhdGlvbiBvbiB0aGUgY2xpZW50LXNpZGUuIEhlcmUgeW91J2xsIG5lZWQgdG8gaW1wb3J0IGB0YXVudXNgLCB0aGUgd2lyaW5nIG1vZHVsZSB3ZSd2ZSBqdXN0IGJ1aWx0LCBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIERPTSBlbGVtZW50IHdoZXJlIHlvdSBhcmUgcmVuZGVyaW5nIHlvdXIgcGFydGlhbCB2aWV3cy4gT25jZSB5b3UgaGF2ZSBhbGwgdGhhdCwgeW91IGNhbiBpbnZva2UgYHRhdW51cy5tb3VudGAuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcXG4gICAgdmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbWFpbicpWzBdO1xcblxcbiAgICB0YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBtb3VudHBvaW50IHdpbGwgc2V0IHVwIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgcm91dGVyIGFuZCBmaXJlIHRoZSBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXIgZm9yIHRoZSB2aWV3IHRoYXQgaGFzIGJlZW4gcmVuZGVyZWQgaW4gdGhlIHNlcnZlci1zaWRlLiBXaGVuZXZlciBhbiBhbmNob3IgbGluayBpcyBjbGlja2VkLCBUYXVudXMgd2lsbCBiZSBhYmxlIHRvIGhpamFjayB0aGF0IGNsaWNrIGFuZCByZXF1ZXN0IHRoZSBtb2RlbCB1c2luZyBBSkFYLCBidXQgb25seSBpZiBpdCBtYXRjaGVzIGEgdmlldyByb3V0ZS4gT3RoZXJ3aXNlIHRoZSBsaW5rIHdpbGwgYmVoYXZlIGp1c3QgbGlrZSBhbnkgbm9ybWFsIGxpbmsgd291bGQuXFxuXFxuICAgIEJ5IGRlZmF1bHQsIHRoZSBtb3VudHBvaW50IHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldy4gVGhpcyBpcyBha2luIHRvIHdoYXQgZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBmcmFtZXdvcmtzIHN1Y2ggYXMgQW5ndWxhckpTIGRvLCB3aGVyZSB2aWV3cyBhcmUgb25seSByZW5kZXJlZCBhZnRlciBhbGwgdGhlIEphdmFTY3JpcHQgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBhbmQgZXhlY3V0ZWQuIEV4Y2VwdCBUYXVudXMgcHJvdmlkZXMgaHVtYW4tcmVhZGFibGUgY29udGVudCBmYXN0ZXIsIGJlZm9yZSB0aGUgSmF2YVNjcmlwdCBldmVuIGJlZ2lucyBkb3dubG9hZGluZywgYWx0aG91Z2ggaXQgd29uJ3QgYmUgZnVuY3Rpb25hbCB1bnRpbCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBydW5zLlxcblxcbiAgICBBbiBhbHRlcm5hdGl2ZSBpcyB0byBpbmxpbmUgdGhlIHZpZXcgbW9kZWwgYWxvbmdzaWRlIHRoZSB2aWV3cyBpbiBhIGA8c2NyaXB0IHR5cGU9J3RleHQvdGF1bnVzJz5gIHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIF90eXBpY2FsbHkgbGFyZ2VyXyB0aGFuIHRoZSByZXN1bHRpbmcgdmlld3MpLlxcblxcbiAgICBBIHRoaXJkIHN0cmF0ZWd5IGlzIHRoYXQgeW91IHJlcXVlc3QgdGhlIG1vZGVsIGFzeW5jaHJvbm91c2x5IG91dHNpZGUgb2YgVGF1bnVzLCBhbGxvd2luZyB5b3UgdG8gZmV0Y2ggYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGl0c2VsZiBjb25jdXJyZW50bHksIGJ1dCB0aGF0J3MgaGFyZGVyIHRvIHNldCB1cC5cXG5cXG4gICAgVGhlIHRocmVlIGJvb3Rpbmcgc3RyYXRlZ2llcyBhcmUgZXhwbGFpbmVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gW3RoZSBvcHRpbWl6YXRpb24gZ3VpZGVdWzI1XS4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgXyhgJ2F1dG8nYClfIHNob3VsZCBzdWZmaWNlLiBJdCBmZXRjaGVzIHRoZSB2aWV3IG1vZGVsIHVzaW5nIGFuIEFKQVggcmVxdWVzdCByaWdodCBhZnRlciBUYXVudXMgbG9hZHMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIHJ1biB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQsIGV2ZW4gaWYgaXQncyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgYG1vZGVsYCwgY29udGFpbmluZyB0aGUgbW9kZWwgdGhhdCB3YXMgdXNlZCB0byByZW5kZXIgdGhlIHZpZXc7IHRoZSBgcm91dGVgLCBicm9rZW4gZG93biBpbnRvIGl0cyBjb21wb25lbnRzOyBhbmQgdGhlIGBjb250YWluZXJgLCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by5cXG5cXG4gICAgVGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSdyZSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2luZyB0aGUgYXBwbGljYXRpb246IGl0IG1pZ2h0IG5vdCBldmVuIGJlIG5lY2Vzc2FyeSEgTGV0J3MgYWRkIHNvbWUgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byB0aGUgZXhhbXBsZSB3ZSd2ZSBiZWVuIGJ1aWxkaW5nLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbiAgICBgYGBcXG5cXG4gICAgR3Vlc3Mgd2hhdD8gVGhlIGNvbnRyb2xsZXIgc2hvdWxkIGJlIGEgbW9kdWxlIHdoaWNoIGV4cG9ydHMgYSBmdW5jdGlvbi4gVGhhdCBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aGVuZXZlciB0aGUgdmlldyBpcyByZW5kZXJlZC4gRm9yIHRoZSBzYWtlIG9mIHNpbXBsaWNpdHkgd2UnbGwganVzdCBwcmludCB0aGUgYWN0aW9uIGFuZCB0aGUgbW9kZWwgdG8gdGhlIGNvbnNvbGUuIElmIHRoZXJlJ3Mgb25lIHBsYWNlIHdoZXJlIHlvdSdkIHdhbnQgdG8gZW5oYW5jZSB0aGUgZXhwZXJpZW5jZSwgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIHdoZXJlIHlvdSB3YW50IHRvIHB1dCB5b3VyIGNvZGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwsIHJvdXRlLCBjb250YWluZXIpIHtcXG4gICAgICBjb25zb2xlLmxvZygnUmVuZGVyZWQgdmlldyAlcyB1c2luZyBtb2RlbCAlcycsIHJvdXRlLmFjdGlvbiwgbW9kZWwpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSVxcblxcbiAgICBUYXVudXMgZG9lcyBwcm92aWRlIFthIHRoaW4gQVBJXVsxOF0gaW4gdGhlIGNsaWVudC1zaWRlLiBVc2FnZSBvZiB0aGF0IEFQSSBiZWxvbmdzIG1vc3RseSBpbnNpZGUgdGhlIGJvZHkgb2YgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVycywgYnV0IHRoZXJlJ3MgYSBmZXcgbWV0aG9kcyB5b3UgY2FuIHRha2UgYWR2YW50YWdlIG9mIG9uIGEgZ2xvYmFsIHNjYWxlIGFzIHdlbGwuXFxuXFxuICAgIFRhdW51cyBjYW4gbm90aWZ5IHlvdSB3aGVuZXZlciBpbXBvcnRhbnQgZXZlbnRzIG9jY3VyLlxcblxcbiAgICBFdmVudCAgICAgICAgICAgIHwgQXJndW1lbnRzICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgJ3N0YXJ0J2AgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2ZldGNoLnN0YXJ0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy5cXG4gICAgYCdmZXRjaC5kb25lJ2AgICB8ICBgcm91dGUsIGNvbnRleHQsIGRhdGFgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS5cXG4gICAgYCdmZXRjaC5hYm9ydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC5cXG4gICAgYCdmZXRjaC5lcnJvcidgICB8ICBgcm91dGUsIGNvbnRleHQsIGVycmAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuXFxuXFxuICAgIEJlc2lkZXMgZXZlbnRzLCB0aGVyZSdzIGEgY291cGxlIG1vcmUgbWV0aG9kcyB5b3UgY2FuIHVzZS4gVGhlIGB0YXVudXMubmF2aWdhdGVgIG1ldGhvZCBhbGxvd3MgeW91IHRvIG5hdmlnYXRlIHRvIGEgVVJMIHdpdGhvdXQgdGhlIG5lZWQgZm9yIGEgaHVtYW4gdG8gY2xpY2sgb24gYW4gYW5jaG9yIGxpbmsuIFRoZW4gdGhlcmUncyBgdGF1bnVzLnBhcnRpYWxgLCBhbmQgdGhhdCBhbGxvd3MgeW91IHRvIHJlbmRlciBhbnkgcGFydGlhbCB2aWV3IG9uIGEgRE9NIGVsZW1lbnQgb2YgeW91ciBjaG9vc2luZywgYW5kIGl0J2xsIHRoZW4gaW52b2tlIGl0cyBjb250cm9sbGVyLiBZb3UnbGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guXFxuXFxuICAgIEFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDYWNoaW5nIGFuZCBQcmVmZXRjaGluZ1xcblxcbiAgICBbUGVyZm9ybWFuY2VdWzI1XSBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQncyB3aHkgdGhlIHlvdSBjYW4gcGVyZm9ybSBjYWNoaW5nIGFuZCBwcmVmZXRjaGluZyBvbiB0aGUgY2xpZW50LXNpZGUganVzdCBieSB0dXJuaW5nIG9uIGEgcGFpciBvZiBmbGFncy4gQnV0IHdoYXQgZG8gdGhlc2UgZmxhZ3MgZG8gZXhhY3RseT9cXG5cXG4gICAgV2hlbiB0dXJuZWQgb24sIGJ5IHBhc3NpbmcgYHsgY2FjaGU6IHRydWUgfWAgYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgYHRhdW51cy5tb3VudGAsIHRoZSBjYWNoaW5nIGxheWVyIHdpbGwgbWFrZSBzdXJlIHRoYXQgcmVzcG9uc2VzIGFyZSBrZXB0IGFyb3VuZCBmb3IgYDE1YCBzZWNvbmRzLiBXaGVuZXZlciBhIHJvdXRlIG5lZWRzIGEgbW9kZWwgaW4gb3JkZXIgdG8gcmVuZGVyIGEgdmlldywgaXQnbGwgZmlyc3QgYXNrIHRoZSBjYWNoaW5nIGxheWVyIGZvciBhIGZyZXNoIGNvcHkuIElmIHRoZSBjYWNoaW5nIGxheWVyIGRvZXNuJ3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSBfKGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiBgMTVgIHNlY29uZHMpXywgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyIGluIHNlY29uZHMgaW5zdGVhZCBvZiBqdXN0IGB0cnVlYC5cXG5cXG4gICAgU2luY2UgVGF1bnVzIHVuZGVyc3RhbmRzIHRoYXQgbm90IGV2ZXJ5IHZpZXcgb3BlcmF0ZXMgdW5kZXIgdGhlIHNhbWUgY29uc3RyYWludHMsIHlvdSdyZSBhbHNvIGFibGUgdG8gc2V0IGEgYGNhY2hlYCBmcmVzaG5lc3MgZHVyYXRpb24gZGlyZWN0bHkgaW4geW91ciByb3V0ZXMuIFRoZSBgY2FjaGVgIHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLlxcblxcbiAgICBUaGVyZSdzIGN1cnJlbnRseSB0d28gY2FjaGluZyBzdG9yZXM6IGEgcmF3IGluLW1lbW9yeSBzdG9yZSwgYW5kIGFuIFtJbmRleGVkREJdWzI4XSBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIGBsb2NhbFN0b3JhZ2VgLiBJdCBoYXMgW3N1cnByaXNpbmdseSBicm9hZCBicm93c2VyIHN1cHBvcnRdWzI5XSwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCdzIG5vdCBzdXBwb3J0ZWQgdGhlbiBjYWNoaW5nIGlzIGRvbmUgc29sZWx5IGluLW1lbW9yeS5cXG5cXG4gICAgVGhlIHByZWZldGNoaW5nIG1lY2hhbmlzbSBpcyBhbiBpbnRlcmVzdGluZyBzcGluLW9mZiBvZiBjYWNoaW5nLCBhbmQgaXQgcmVxdWlyZXMgY2FjaGluZyB0byBiZSBlbmFibGVkIGluIG9yZGVyIHRvIHdvcmsuIFdoZW5ldmVyIGh1bWFucyBob3ZlciBvdmVyIGEgbGluaywgb3Igd2hlbmV2ZXIgdGhleSBwdXQgdGhlaXIgZmluZ2VyIG9uIG9uZSBvZiB0aGVtIF8odGhlIGB0b3VjaHN0YXJ0YCBldmVudClfLCB0aGUgcHJlZmV0Y2hlciB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgZm9yIHRoYXQgbGluay5cXG5cXG4gICAgSWYgdGhlIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkgdGhlbiB0aGUgcmVzcG9uc2Ugd2lsbCBiZSBjYWNoZWQgaW4gdGhlIHNhbWUgd2F5IGFueSBvdGhlciB2aWV3IHdvdWxkIGJlIGNhY2hlZC4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGFub3RoZXIgbGluayB3aGlsZSB0aGUgcHJldmlvdXMgb25lIGlzIHN0aWxsIGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhlIG9sZCByZXF1ZXN0IGlzIGFib3J0ZWQsIGFzIG5vdCB0byBkcmFpbiB0aGVpciBfKHBvc3NpYmx5IGxpbWl0ZWQpXyBJbnRlcm5ldCBjb25uZWN0aW9uIGJhbmR3aWR0aC5cXG5cXG4gICAgSWYgdGhlIGh1bWFuIGNsaWNrcyBvbiB0aGUgbGluayBiZWZvcmUgcHJlZmV0Y2hpbmcgaXMgY29tcGxldGVkLCBoZSdsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuXFxuXFxuICAgIFR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgYHByZWZldGNoYCB0byBgdHJ1ZWAgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgLiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSBbUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uc11bMjVdIGd1aWRlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRoZSBza3kgaXMgdGhlIGxpbWl0IVxcblxcbiAgICBZb3UncmUgbm93IGZhbWlsaWFyIHdpdGggaG93IFRhdW51cyB3b3JrcyBvbiBhIGhpZ2gtbGV2ZWwuIFlvdSBoYXZlIGNvdmVyZWQgYSBkZWNlbnQgYW1vdW50IG9mIGdyb3VuZCwgYnV0IHlvdSBzaG91bGRuJ3Qgc3RvcCB0aGVyZS5cXG5cXG4gICAgLSBMZWFybiBtb3JlIGFib3V0IFt0aGUgQVBJIFRhdW51cyBoYXNdWzE4XSB0byBvZmZlclxcbiAgICAtIEdvIHRocm91Z2ggdGhlIFtwZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gdGlwc11bMjVdLiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchXFxuICAgIC0gX0ZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnRfXFxuICAgICAgLSBKZXJlbXkgS2VpdGggZW51bmNpYXRlcyBbXFxcIkJlIHByb2dyZXNzaXZlXFxcIl1bMjBdXFxuICAgICAgLSBDaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciBbXFxcIlByYWdtYXRpYyBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudFxcXCJdWzI2XVxcbiAgICAgIC0gSmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IFtcXFwiUHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgaXMgZmFzdGVyXFxcIl1bMjJdXFxuICAgICAgLSBJIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCBbXFxcIlN0b3AgQnJlYWtpbmcgdGhlIFdlYlxcXCJdWzE3XVxcbiAgICAgIC0gR3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgW1xcXCI3IFByaW5jaXBsZXMgb2YgUmljaCBXZWIgQXBwbGljYXRpb25zXFxcIl1bMjRdXFxuICAgICAgLSBBYXJvbiBHdXN0YWZzb24gd3JpdGVzIFtcXFwiVW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudFxcXCJdWzIxXVxcbiAgICAgIC0gT3JkZSBTYXVuZGVycyBnaXZlcyBoaXMgcG9pbnQgb2YgdmlldyBpbiBbXFxcIlByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2VcXFwiXVsyM11cXG4gICAgLSBTaWZ0IHRocm91Z2ggdGhlIFtjb21wbGVtZW50YXJ5IG1vZHVsZXNdWzE1XS4gWW91IG1heSBmaW5kIHNvbWV0aGluZyB5b3UgaGFkbid0IHRob3VnaHQgb2YhXFxuXFxuICAgIEFsc28sIGdldCBpbnZvbHZlZCFcXG5cXG4gICAgLSBGb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgW3NlbmQgc29tZSBwdWxsIHJlcXVlc3RzXVsxOV0gdG8gaW1wcm92ZSB0aGVzZSBndWlkZXMhXFxuICAgIC0gU2VlIHNvbWV0aGluZywgc2F5IHNvbWV0aGluZyEgSWYgeW91IGRldGVjdCBhIGJ1ZywgW3BsZWFzZSBjcmVhdGUgYW4gaXNzdWVdWzI3XSFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgWzFdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxuICAgIFsyXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcbiAgICBbM106IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcbiAgICBbNF06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxuICAgIFs1XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvb1xcbiAgICBbNl06IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFs3XTogaHR0cDovL2hhcGlqcy5jb21cXG4gICAgWzhdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxuICAgIFs5XTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9SdWJ5X29uX1JhaWxzXFxuICAgIFsxMF06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYW5sL211c3RhY2hlLmpzXFxuICAgIFsxMV06IGh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcbiAgICBbMTJdOiBodHRwOi8vbW96aWxsYS5naXRodWIuaW8vbnVuanVja3MvXFxuICAgIFsxM106IGh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcbiAgICBbMTRdOiBodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcbiAgICBbMTVdOiAvY29tcGxlbWVudHNcXG4gICAgWzE2XTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2phZHVtXFxuICAgIFsxN106IGh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXG4gICAgWzE4XTogL2FwaVxcbiAgICBbMTldOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcbiAgICBbMjBdOiBodHRwczovL2FkYWN0aW8uY29tL2pvdXJuYWwvNzcwNlxcbiAgICBbMjFdOiBodHRwOi8vYWxpc3RhcGFydC5jb20vYXJ0aWNsZS91bmRlcnN0YW5kaW5ncHJvZ3Jlc3NpdmVlbmhhbmNlbWVudFxcbiAgICBbMjJdOiBodHRwOi8vamFrZWFyY2hpYmFsZC5jb20vMjAxMy9wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC1pcy1mYXN0ZXIvXFxuICAgIFsyM106IGh0dHBzOi8vZGVjYWRlY2l0eS5uZXQvYmxvZy8yMDEzLzA5LzE2L3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWZvci1mYXVsdC10b2xlcmFuY2VcXG4gICAgWzI0XTogaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcbiAgICBbMjVdOiAvcGVyZm9ybWFuY2VcXG4gICAgWzI2XTogaHR0cDovL2ljYW50LmNvLnVrL2FydGljbGVzL3ByYWdtYXRpYy1wcm9ncmVzc2l2ZS1lbmhhbmNlbWVudC9cXG4gICAgWzI3XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMvaXNzdWVzL25ld1xcbiAgICBbMjhdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcbiAgICBbMjldOiBodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBlcmZvcm1hbmNlKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcInBlcmZvcm1hbmNlLW9wdGltaXphdGlvblxcXCI+UGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uPC9oMT5cXG48cD5Gb288L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25cXG5cXG4gICAgRm9vXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG5vdEZvdW5kKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJOb3QgRm91bmRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUaGVyZSBkb2Vzbid0IHNlZW0gdG8gYmUgYW55dGhpbmcgaGVyZSB5ZXQuIElmIHlvdSBiZWxpZXZlIHRoaXMgdG8gYmUgYSBtaXN0YWtlLCBwbGVhc2UgbGV0IHVzIGtub3chXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3A+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9lcnJvci9ub3QtZm91bmQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8cD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcImh0dHBzOi8vdHdpdHRlci5jb20vbnpnYlxcXCIgdGFyZ2V0PVxcXCJfYmxhbmtcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIiZtZGFzaDsgQG56Z2JcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJoMSBOb3QgRm91bmRcXG5cXG5wIFRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcXG5wXFxuICBhKGhyZWY9J2h0dHBzOi8vdHdpdHRlci5jb20vbnpnYicsIHRhcmdldD0nX2JsYW5rJykgJm1kYXNoOyBAbnpnYlxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsYXlvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQsIG1vZGVsLCBwYXJ0aWFsKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjwhRE9DVFlQRSBodG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGh0bWwgbGFuZz1cXFwiZW5cXFwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cXFwiaHR0cDovL3NjaGVtYS5vcmcvQmxvZ1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZD5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjx0aXRsZT5cIiArIChqYWRlLmVzY2FwZShudWxsID09IChqYWRlX2ludGVycCA9IG1vZGVsLnRpdGxlKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC90aXRsZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGNoYXJzZXQ9XFxcInV0Zi04XFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDYsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic2hvcnRjdXQgaWNvblxcXCIgaHJlZj1cXFwiL2Zhdmljb24uaWNvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIGh0dHAtZXF1aXY9XFxcIlgtVUEtQ29tcGF0aWJsZVxcXCIgY29udGVudD1cXFwiSUU9ZWRnZSxjaHJvbWU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWV0YSBuYW1lPVxcXCJ2aWV3cG9ydFxcXCIgY29udGVudD1cXFwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTFcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzdHlsZXNoZWV0XFxcIiB0eXBlPVxcXCJ0ZXh0L2Nzc1xcXCIgaHJlZj1cXFwiL2Nzcy9hbGwuY3NzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEwLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCJodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT1VbmljYStPbmU6NDAwfFBsYXlmYWlyK0Rpc3BsYXk6NzAwfE1lZ3JpbTo3MDB8RmF1bmErT25lOjQwMGl0YWxpYyw0MDAsNzAwXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaGVhZD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8Ym9keSBpZD1cXFwidG9wXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEzLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aGVhZGVyPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMT5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE1LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIiBhcmlhLWxhYmVsPVxcXCJHbyB0byBob21lXFxcIiBjbGFzcz1cXFwibHktdGl0bGVcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJUYXVudXNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDE+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgyIGNsYXNzPVxcXCJseS1zdWJoZWFkaW5nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2gyPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGFzaWRlPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxuYXYgY2xhc3M9XFxcIm52LWNvbnRhaW5lclxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHVsIGNsYXNzPVxcXCJudi1pdGVtc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQWJvdXRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiR2V0dGluZyBTdGFydGVkXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2FwaVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFQSSBEb2N1bWVudGF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI4LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ29tcGxlbWVudGFyeSBNb2R1bGVzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMwLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3NvdXJjZS1jb2RlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiU291cmNlIENvZGVcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3VsPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9uYXY+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2FzaWRlPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzQsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtYWluIGlkPVxcXCJhcHBsaWNhdGlvbi1yb290XFxcIiBkYXRhLXRhdW51cz1cXFwibW9kZWxcXFwiPlwiICsgKG51bGwgPT0gKGphZGVfaW50ZXJwID0gcGFydGlhbCkgPyBcIlwiIDogamFkZV9pbnRlcnApKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9tYWluPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzY3JpcHQgc3JjPVxcXCIvanMvYWxsLmpzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2NyaXB0PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9ib2R5PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9odG1sPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQsXCJtb2RlbFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgubW9kZWw6dHlwZW9mIG1vZGVsIT09XCJ1bmRlZmluZWRcIj9tb2RlbDp1bmRlZmluZWQsXCJwYXJ0aWFsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5wYXJ0aWFsOnR5cGVvZiBwYXJ0aWFsIT09XCJ1bmRlZmluZWRcIj9wYXJ0aWFsOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwiZG9jdHlwZSBodG1sXFxuaHRtbChsYW5nPSdlbicsIGl0ZW1zY29wZSwgaXRlbXR5cGU9J2h0dHA6Ly9zY2hlbWEub3JnL0Jsb2cnKVxcbiAgaGVhZFxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtZXRhKGNoYXJzZXQ9J3V0Zi04JylcXG4gICAgbGluayhyZWw9J3Nob3J0Y3V0IGljb24nLCBocmVmPScvZmF2aWNvbi5pY28nKVxcbiAgICBtZXRhKGh0dHAtZXF1aXY9J1gtVUEtQ29tcGF0aWJsZScsIGNvbnRlbnQ9J0lFPWVkZ2UsY2hyb21lPTEnKVxcbiAgICBtZXRhKG5hbWU9J3ZpZXdwb3J0JywgY29udGVudD0nd2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0nL2Nzcy9hbGwuY3NzJylcXG4gICAgbGluayhyZWw9J3N0eWxlc2hlZXQnLCB0eXBlPSd0ZXh0L2NzcycsIGhyZWY9J2h0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDAnKVxcblxcbiAgYm9keSN0b3BcXG4gICAgaGVhZGVyXFxuICAgICAgaDFcXG4gICAgICAgIGEubHktdGl0bGUoaHJlZj0nLycsIGFyaWEtbGFiZWw9J0dvIHRvIGhvbWUnKSBUYXVudXNcXG4gICAgICBoMi5seS1zdWJoZWFkaW5nIE1pY3JvIElzb21vcnBoaWMgTVZDIEVuZ2luZSBmb3IgTm9kZS5qc1xcblxcbiAgICBhc2lkZVxcbiAgICAgIG5hdi5udi1jb250YWluZXJcXG4gICAgICAgIHVsLm52LWl0ZW1zXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy8nKSBBYm91dFxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvZ2V0dGluZy1zdGFydGVkJykgR2V0dGluZyBTdGFydGVkXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9hcGknKSBBUEkgRG9jdW1lbnRhdGlvblxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvY29tcGxlbWVudHMnKSBDb21wbGVtZW50YXJ5IE1vZHVsZXNcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL3BlcmZvcm1hbmNlJykgUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9zb3VyY2UtY29kZScpIFNvdXJjZSBDb2RlXFxuXFxuICAgIG1haW4jYXBwbGljYXRpb24tcm9vdChkYXRhLXRhdW51cz0nbW9kZWwnKSE9cGFydGlhbFxcbiAgICBzY3JpcHQoc3JjPScvanMvYWxsLmpzJylcXG5cIik7XG59XG59IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGVtcGxhdGVzID0ge1xuICAnZG9jdW1lbnRhdGlvbi9hYm91dCc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9hcGknOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMnKSxcbiAgJ2Vycm9yL25vdC1mb3VuZCc6IHJlcXVpcmUoJy4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzJyksXG4gICdsYXlvdXQnOiByZXF1aXJlKCcuL3ZpZXdzL2xheW91dC5qcycpXG59O1xuXG52YXIgY29udHJvbGxlcnMgPSB7XG59O1xuXG52YXIgcm91dGVzID0ge1xuICAnLyc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2Fib3V0J1xuICB9LFxuICAnL2dldHRpbmctc3RhcnRlZCc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCdcbiAgfSxcbiAgJy9hcGknOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hcGknXG4gIH0sXG4gICcvY29tcGxlbWVudHMnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cydcbiAgfSxcbiAgJy9wZXJmb3JtYW5jZSc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlJ1xuICB9LFxuICAnL3NvdXJjZS1jb2RlJzoge1xuICAgIGlnbm9yZTogdHJ1ZVxuICB9LFxuICAnLzpjYXRjaGFsbConOiB7XG4gICAgYWN0aW9uOiAnZXJyb3Ivbm90LWZvdW5kJ1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcbiAgcm91dGVzOiByb3V0ZXNcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8vIGltcG9ydCB0aGUgdGF1bnVzIG1vZHVsZVxudmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xuXG4vLyBpbXBvcnQgdGhlIHdpcmluZyBtb2R1bGUgZXhwb3J0ZWQgYnkgVGF1bnVzXG52YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcblxuLy8gZ2V0IHRoZSA8bWFpbj4gZWxlbWVudFxudmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwbGljYXRpb24tcm9vdCcpO1xuXG4vLyBtb3VudCB0YXVudXMgc28gaXQgc3RhcnRzIGl0cyByb3V0aW5nIGVuZ2luZVxudGF1bnVzLm1vdW50KG1haW4sIHdpcmluZyk7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5qYWRlPWUoKX19KGZ1bmN0aW9uKCl7dmFyIGRlZmluZSxtb2R1bGUsZXhwb3J0cztyZXR1cm4gKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoezE6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuJ3VzZSBzdHJpY3QnO1xyXG5cclxuLyoqXHJcbiAqIE1lcmdlIHR3byBhdHRyaWJ1dGUgb2JqZWN0cyBnaXZpbmcgcHJlY2VkZW5jZVxyXG4gKiB0byB2YWx1ZXMgaW4gb2JqZWN0IGBiYC4gQ2xhc3NlcyBhcmUgc3BlY2lhbC1jYXNlZFxyXG4gKiBhbGxvd2luZyBmb3IgYXJyYXlzIGFuZCBtZXJnaW5nL2pvaW5pbmcgYXBwcm9wcmlhdGVseVxyXG4gKiByZXN1bHRpbmcgaW4gYSBzdHJpbmcuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBhXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBiXHJcbiAqIEByZXR1cm4ge09iamVjdH0gYVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLm1lcmdlID0gZnVuY3Rpb24gbWVyZ2UoYSwgYikge1xyXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICB2YXIgYXR0cnMgPSBhWzBdO1xyXG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGF0dHJzID0gbWVyZ2UoYXR0cnMsIGFbaV0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGF0dHJzO1xyXG4gIH1cclxuICB2YXIgYWMgPSBhWydjbGFzcyddO1xyXG4gIHZhciBiYyA9IGJbJ2NsYXNzJ107XHJcblxyXG4gIGlmIChhYyB8fCBiYykge1xyXG4gICAgYWMgPSBhYyB8fCBbXTtcclxuICAgIGJjID0gYmMgfHwgW107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWMpKSBhYyA9IFthY107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYmMpKSBiYyA9IFtiY107XHJcbiAgICBhWydjbGFzcyddID0gYWMuY29uY2F0KGJjKS5maWx0ZXIobnVsbHMpO1xyXG4gIH1cclxuXHJcbiAgZm9yICh2YXIga2V5IGluIGIpIHtcclxuICAgIGlmIChrZXkgIT0gJ2NsYXNzJykge1xyXG4gICAgICBhW2tleV0gPSBiW2tleV07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBGaWx0ZXIgbnVsbCBgdmFsYHMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsXHJcbiAqIEByZXR1cm4ge0Jvb2xlYW59XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmZ1bmN0aW9uIG51bGxzKHZhbCkge1xyXG4gIHJldHVybiB2YWwgIT0gbnVsbCAmJiB2YWwgIT09ICcnO1xyXG59XHJcblxyXG4vKipcclxuICogam9pbiBhcnJheSBhcyBjbGFzc2VzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmpvaW5DbGFzc2VzID0gam9pbkNsYXNzZXM7XHJcbmZ1bmN0aW9uIGpvaW5DbGFzc2VzKHZhbCkge1xyXG4gIHJldHVybiBBcnJheS5pc0FycmF5KHZhbCkgPyB2YWwubWFwKGpvaW5DbGFzc2VzKS5maWx0ZXIobnVsbHMpLmpvaW4oJyAnKSA6IHZhbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHtBcnJheX0gY2xhc3Nlc1xyXG4gKiBAcGFyYW0ge0FycmF5LjxCb29sZWFuPn0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmNscyA9IGZ1bmN0aW9uIGNscyhjbGFzc2VzLCBlc2NhcGVkKSB7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2xhc3Nlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgaWYgKGVzY2FwZWQgJiYgZXNjYXBlZFtpXSkge1xyXG4gICAgICBidWYucHVzaChleHBvcnRzLmVzY2FwZShqb2luQ2xhc3NlcyhbY2xhc3Nlc1tpXV0pKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBidWYucHVzaChqb2luQ2xhc3NlcyhjbGFzc2VzW2ldKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHZhciB0ZXh0ID0gam9pbkNsYXNzZXMoYnVmKTtcclxuICBpZiAodGV4dC5sZW5ndGgpIHtcclxuICAgIHJldHVybiAnIGNsYXNzPVwiJyArIHRleHQgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyc7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gYXR0cmlidXRlLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5XHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcclxuICogQHBhcmFtIHtCb29sZWFufSBlc2NhcGVkXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gdGVyc2VcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5hdHRyID0gZnVuY3Rpb24gYXR0cihrZXksIHZhbCwgZXNjYXBlZCwgdGVyc2UpIHtcclxuICBpZiAoJ2Jvb2xlYW4nID09IHR5cGVvZiB2YWwgfHwgbnVsbCA9PSB2YWwpIHtcclxuICAgIGlmICh2YWwpIHtcclxuICAgICAgcmV0dXJuICcgJyArICh0ZXJzZSA/IGtleSA6IGtleSArICc9XCInICsga2V5ICsgJ1wiJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gJyc7XHJcbiAgICB9XHJcbiAgfSBlbHNlIGlmICgwID09IGtleS5pbmRleE9mKCdkYXRhJykgJiYgJ3N0cmluZycgIT0gdHlwZW9mIHZhbCkge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArIFwiPSdcIiArIEpTT04uc3RyaW5naWZ5KHZhbCkucmVwbGFjZSgvJy9nLCAnJmFwb3M7JykgKyBcIidcIjtcclxuICB9IGVsc2UgaWYgKGVzY2FwZWQpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyAnPVwiJyArIGV4cG9ydHMuZXNjYXBlKHZhbCkgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyB2YWwgKyAnXCInO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZXMgb2JqZWN0LlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBlc2NhcGVkXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0cnMgPSBmdW5jdGlvbiBhdHRycyhvYmosIHRlcnNlKXtcclxuICB2YXIgYnVmID0gW107XHJcblxyXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcclxuXHJcbiAgaWYgKGtleXMubGVuZ3RoKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgdmFyIGtleSA9IGtleXNbaV1cclxuICAgICAgICAsIHZhbCA9IG9ialtrZXldO1xyXG5cclxuICAgICAgaWYgKCdjbGFzcycgPT0ga2V5KSB7XHJcbiAgICAgICAgaWYgKHZhbCA9IGpvaW5DbGFzc2VzKHZhbCkpIHtcclxuICAgICAgICAgIGJ1Zi5wdXNoKCcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGJ1Zi5wdXNoKGV4cG9ydHMuYXR0cihrZXksIHZhbCwgZmFsc2UsIHRlcnNlKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBidWYuam9pbignJyk7XHJcbn07XHJcblxyXG4vKipcclxuICogRXNjYXBlIHRoZSBnaXZlbiBzdHJpbmcgb2YgYGh0bWxgLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaHRtbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMuZXNjYXBlID0gZnVuY3Rpb24gZXNjYXBlKGh0bWwpe1xyXG4gIHZhciByZXN1bHQgPSBTdHJpbmcoaHRtbClcclxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXHJcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXHJcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpO1xyXG4gIGlmIChyZXN1bHQgPT09ICcnICsgaHRtbCkgcmV0dXJuIGh0bWw7XHJcbiAgZWxzZSByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlLXRocm93IHRoZSBnaXZlbiBgZXJyYCBpbiBjb250ZXh0IHRvIHRoZVxyXG4gKiB0aGUgamFkZSBpbiBgZmlsZW5hbWVgIGF0IHRoZSBnaXZlbiBgbGluZW5vYC5cclxuICpcclxuICogQHBhcmFtIHtFcnJvcn0gZXJyXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGluZW5vXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMucmV0aHJvdyA9IGZ1bmN0aW9uIHJldGhyb3coZXJyLCBmaWxlbmFtZSwgbGluZW5vLCBzdHIpe1xyXG4gIGlmICghKGVyciBpbnN0YW5jZW9mIEVycm9yKSkgdGhyb3cgZXJyO1xyXG4gIGlmICgodHlwZW9mIHdpbmRvdyAhPSAndW5kZWZpbmVkJyB8fCAhZmlsZW5hbWUpICYmICFzdHIpIHtcclxuICAgIGVyci5tZXNzYWdlICs9ICcgb24gbGluZSAnICsgbGluZW5vO1xyXG4gICAgdGhyb3cgZXJyO1xyXG4gIH1cclxuICB0cnkge1xyXG4gICAgc3RyID0gc3RyIHx8IF9kZXJlcV8oJ2ZzJykucmVhZEZpbGVTeW5jKGZpbGVuYW1lLCAndXRmOCcpXHJcbiAgfSBjYXRjaCAoZXgpIHtcclxuICAgIHJldGhyb3coZXJyLCBudWxsLCBsaW5lbm8pXHJcbiAgfVxyXG4gIHZhciBjb250ZXh0ID0gM1xyXG4gICAgLCBsaW5lcyA9IHN0ci5zcGxpdCgnXFxuJylcclxuICAgICwgc3RhcnQgPSBNYXRoLm1heChsaW5lbm8gLSBjb250ZXh0LCAwKVxyXG4gICAgLCBlbmQgPSBNYXRoLm1pbihsaW5lcy5sZW5ndGgsIGxpbmVubyArIGNvbnRleHQpO1xyXG5cclxuICAvLyBFcnJvciBjb250ZXh0XHJcbiAgdmFyIGNvbnRleHQgPSBsaW5lcy5zbGljZShzdGFydCwgZW5kKS5tYXAoZnVuY3Rpb24obGluZSwgaSl7XHJcbiAgICB2YXIgY3VyciA9IGkgKyBzdGFydCArIDE7XHJcbiAgICByZXR1cm4gKGN1cnIgPT0gbGluZW5vID8gJyAgPiAnIDogJyAgICAnKVxyXG4gICAgICArIGN1cnJcclxuICAgICAgKyAnfCAnXHJcbiAgICAgICsgbGluZTtcclxuICB9KS5qb2luKCdcXG4nKTtcclxuXHJcbiAgLy8gQWx0ZXIgZXhjZXB0aW9uIG1lc3NhZ2VcclxuICBlcnIucGF0aCA9IGZpbGVuYW1lO1xyXG4gIGVyci5tZXNzYWdlID0gKGZpbGVuYW1lIHx8ICdKYWRlJykgKyAnOicgKyBsaW5lbm9cclxuICAgICsgJ1xcbicgKyBjb250ZXh0ICsgJ1xcblxcbicgKyBlcnIubWVzc2FnZTtcclxuICB0aHJvdyBlcnI7XHJcbn07XHJcblxufSx7XCJmc1wiOjJ9XSwyOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnamFkZS9ydW50aW1lJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIHBhcnRpYWwgPSByZXF1aXJlKCcuL3BhcnRpYWwnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGlzTmF0aXZlID0gcmVxdWlyZSgnLi9pc05hdGl2ZScpO1xudmFyIG1vZGVybiA9ICdoaXN0b3J5JyBpbiB3aW5kb3cgJiYgJ3B1c2hTdGF0ZScgaW4gaGlzdG9yeTtcblxuLy8gR29vZ2xlIENocm9tZSAzOCBvbiBpT1MgbWFrZXMgd2VpcmQgY2hhbmdlcyB0byBoaXN0b3J5LnJlcGxhY2VTdGF0ZSwgYnJlYWtpbmcgaXRcbnZhciBuYXRpdmVSZXBsYWNlID0gbW9kZXJuICYmIGlzTmF0aXZlKHdpbmRvdy5oaXN0b3J5LnJlcGxhY2VTdGF0ZSk7XG5cbmZ1bmN0aW9uIGdvICh1cmwsIG8pIHtcbiAgdmFyIG9wdGlvbnMgPSBvIHx8IHt9O1xuICB2YXIgY29udGV4dCA9IG9wdGlvbnMuY29udGV4dCB8fCBudWxsO1xuXG4gIGlmICghbW9kZXJuKSB7XG4gICAgbG9jYXRpb24uaHJlZiA9IHVybDsgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCk7XG5cbiAgZmV0Y2hlci5hYm9ydFBlbmRpbmcoKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250ZXh0LCBzb3VyY2U6ICdpbnRlbnQnIH0sIHJlc29sdmVkKTtcblxuICBmdW5jdGlvbiByZXNvbHZlZCAoZXJyLCBtb2RlbCkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdwdXNoU3RhdGUnKTtcbiAgICBwYXJ0aWFsKHN0YXRlLmNvbnRhaW5lciwgbnVsbCwgbW9kZWwsIHJvdXRlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydCAobW9kZWwpIHtcbiAgdmFyIHJvdXRlID0gcmVwbGFjZVdpdGgobW9kZWwpO1xuICBlbWl0dGVyLmVtaXQoJ3N0YXJ0Jywgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUsIHsgcmVuZGVyOiBmYWxzZSB9KTtcbiAgd2luZG93Lm9ucG9wc3RhdGUgPSBiYWNrO1xufVxuXG5mdW5jdGlvbiBiYWNrIChlKSB7XG4gIHZhciBlbXB0eSA9ICEoZSAmJiBlLnN0YXRlICYmIGUuc3RhdGUubW9kZWwpO1xuICBpZiAoZW1wdHkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG1vZGVsID0gZS5zdGF0ZS5tb2RlbDtcbiAgdmFyIHJvdXRlID0gcmVwbGFjZVdpdGgobW9kZWwpO1xuICBwYXJ0aWFsKHN0YXRlLmNvbnRhaW5lciwgbnVsbCwgbW9kZWwsIHJvdXRlKTtcbn1cblxuZnVuY3Rpb24gcmVwbGFjZVdpdGggKG1vZGVsKSB7XG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcbiAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdyZXBsYWNlU3RhdGUnKTtcbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRpb24gKHJvdXRlLCBtb2RlbCwgZGlyZWN0aW9uKSB7XG4gIHN0YXRlLm1vZGVsID0gbW9kZWw7XG4gIGlmIChtb2RlbC50aXRsZSkge1xuICAgIGRvY3VtZW50LnRpdGxlID0gbW9kZWwudGl0bGU7XG4gIH1cbiAgaWYgKG1vZGVybiAmJiBkaXJlY3Rpb24gIT09ICdyZXBsYWNlU3RhdGUnIHx8IG5hdGl2ZVJlcGxhY2UpIHtcbiAgICBoaXN0b3J5W2RpcmVjdGlvbl0oeyBtb2RlbDogbW9kZWwgfSwgbW9kZWwudGl0bGUsIHJvdXRlLnVybCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHN0YXJ0OiBzdGFydCxcbiAgZ286IGdvXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgb25jZSA9IHJlcXVpcmUoJy4vb25jZScpO1xudmFyIHJhdyA9IHJlcXVpcmUoJy4vc3RvcmVzL3JhdycpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0b3JlcyA9IFtyYXcsIGlkYl07XG5cbmZ1bmN0aW9uIGNsb25lICh2YWx1ZSkge1xuICByZXR1cm4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpO1xufVxuXG5mdW5jdGlvbiBnZXQgKHVybCwgZG9uZSkge1xuICB2YXIgaSA9IDA7XG5cbiAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgdmFyIGdvdE9uY2UgPSBvbmNlKGdvdCk7XG4gICAgdmFyIHN0b3JlID0gc3RvcmVzW2krK107XG4gICAgaWYgKHN0b3JlKSB7XG4gICAgICBzdG9yZS5nZXQodXJsLCBnb3RPbmNlKTtcbiAgICAgIHNldFRpbWVvdXQoZ290T25jZSwgc3RvcmUgPT09IGlkYiA/IDEwMCA6IDUwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDE1MG1zIG9uIGNhY2hpbmcgbGF5ZXJzXG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUodHJ1ZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ290IChlcnIsIGl0ZW0pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSBlbHNlIGlmIChpdGVtICYmIHR5cGVvZiBpdGVtLmV4cGlyZXMgPT09ICdudW1iZXInICYmIERhdGUubm93KCkgPCBpdGVtLmV4cGlyZXMpIHtcbiAgICAgICAgZG9uZShmYWxzZSwgY2xvbmUoaXRlbS5kYXRhKSk7IC8vIGFsd2F5cyByZXR1cm4gYSB1bmlxdWUgY29weVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIG5leHQoKTtcbn1cblxuZnVuY3Rpb24gc2V0ICh1cmwsIGRhdGEsIGR1cmF0aW9uKSB7XG4gIGlmIChkdXJhdGlvbiA8IDEpIHsgLy8gc2FuaXR5XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBjbG9uZWQgPSBjbG9uZShkYXRhKTsgLy8gZnJlZXplIGEgY29weSBmb3Igb3VyIHJlY29yZHNcbiAgc3RvcmVzLmZvckVhY2goc3RvcmUpO1xuICBmdW5jdGlvbiBzdG9yZSAocykge1xuICAgIHMuc2V0KHVybCwge1xuICAgICAgZGF0YTogY2xvbmVkLFxuICAgICAgZXhwaXJlczogRGF0ZS5ub3coKSArIGR1cmF0aW9uXG4gICAgfSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNhY2hlID0gcmVxdWlyZSgnLi9jYWNoZScpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBkZWZhdWx0cyA9IDE1O1xudmFyIGJhc2VsaW5lO1xuXG5mdW5jdGlvbiBlICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkdXJhdGlvbiwgcm91dGUpIHtcbiAgYmFzZWxpbmUgPSBwYXJzZUR1cmF0aW9uKGR1cmF0aW9uKTtcbiAgaWYgKGJhc2VsaW5lIDwgMSkge1xuICAgIHN0YXRlLmNhY2hlID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG4gIGludGVyY2VwdG9yLmFkZChpbnRlcmNlcHQpO1xuICBlbWl0dGVyLm9uKCdmZXRjaC5kb25lJywgcGVyc2lzdCk7XG4gIHN0YXRlLmNhY2hlID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW50ZXJjZXB0IChlKSB7XG4gIGNhY2hlLmdldChlLnVybCwgcmVzdWx0KTtcblxuICBmdW5jdGlvbiByZXN1bHQgKGVyciwgZGF0YSkge1xuICAgIGlmICghZXJyICYmIGRhdGEpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoZGF0YSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlRHVyYXRpb24gKHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBiYXNlbGluZSB8fCBkZWZhdWx0cztcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdCAocm91dGUsIGNvbnRleHQsIGRhdGEpIHtcbiAgaWYgKCFzdGF0ZS5jYWNoZSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIga2V5ID0gcm91dGUucGFydHMucGF0aG5hbWUgKyBlKHJvdXRlLnBhcnRzLnF1ZXJ5KTtcbiAgdmFyIGQgPSByb3V0ZS5jYWNoZSAhPT0gdm9pZCAwID8gcm91dGUuY2FjaGUgOiBiYXNlbGluZTtcbiAgY2FjaGUuc2V0KGtleSwgZGF0YSwgcGFyc2VEdXJhdGlvbihkKSAqIDEwMDApO1xufVxuXG5mdW5jdGlvbiByZWFkeSAoZm4pIHtcbiAgaWYgKHN0YXRlLmNhY2hlKSB7XG4gICAgaWRiLnRlc3RlZChmbik7IC8vIHdhaXQgb24gaWRiIGNvbXBhdGliaWxpdHkgdGVzdHNcbiAgfSBlbHNlIHtcbiAgICBmbigpOyAvLyBjYWNoaW5nIGlzIGEgbm8tb3BcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2V0dXA6IHNldHVwLFxuICBwZXJzaXN0OiBwZXJzaXN0LFxuICByZWFkeTogcmVhZHlcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhLmVtaXR0ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBlbWl0dGVyKHt9LCB7IHRocm93czogZmFsc2UgfSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGFkZCAoZWxlbWVudCwgdHlwZSwgZm4pIHtcbiAgaWYgKGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBmbik7XG4gIH0gZWxzZSBpZiAoZWxlbWVudC5hdHRhY2hFdmVudCkge1xuICAgIGVsZW1lbnQuYXR0YWNoRXZlbnQoJ29uJyArIHR5cGUsIHdyYXBwZXJGYWN0b3J5KGVsZW1lbnQsIGZuKSk7XG4gIH0gZWxzZSB7XG4gICAgZWxlbWVudFsnb24nICsgdHlwZV0gPSBmbjtcbiAgfVxufVxuXG5mdW5jdGlvbiB3cmFwcGVyRmFjdG9yeSAoZWxlbWVudCwgZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIgKG9yaWdpbmFsRXZlbnQpIHtcbiAgICB2YXIgZSA9IG9yaWdpbmFsRXZlbnQgfHwgd2luZG93LmV2ZW50O1xuICAgIGUudGFyZ2V0ID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIGUucHJldmVudERlZmF1bHQgID0gZS5wcmV2ZW50RGVmYXVsdCAgfHwgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKCkgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH07XG4gICAgZS5zdG9wUHJvcGFnYXRpb24gPSBlLnN0b3BQcm9wYWdhdGlvbiB8fCBmdW5jdGlvbiBzdG9wUHJvcGFnYXRpb24gKCkgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH07XG4gICAgZm4uY2FsbChlbGVtZW50LCBlKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgeGhyID0gcmVxdWlyZSgnLi94aHInKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgbGFzdFhociA9IHt9O1xuXG5mdW5jdGlvbiBlICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIGpzb25pZnkgKHJvdXRlKSB7XG4gIHZhciBwYXJ0cyA9IHJvdXRlLnBhcnRzO1xuICB2YXIgcXMgPSBlKHBhcnRzLnNlYXJjaCk7XG4gIHZhciBwID0gcXMgPyAnJicgOiAnPyc7XG4gIHJldHVybiBwYXJ0cy5wYXRobmFtZSArIHFzICsgcCArICdqc29uJztcbn1cblxuZnVuY3Rpb24gYWJvcnQgKHNvdXJjZSkge1xuICBpZiAobGFzdFhocltzb3VyY2VdKSB7XG4gICAgbGFzdFhocltzb3VyY2VdLmFib3J0KCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gYWJvcnRQZW5kaW5nICgpIHtcbiAgT2JqZWN0LmtleXMobGFzdFhocikuZm9yRWFjaChhYm9ydCk7XG4gIGxhc3RYaHIgPSB7fTtcbn1cblxuZnVuY3Rpb24gZmV0Y2hlciAocm91dGUsIGNvbnRleHQsIGRvbmUpIHtcbiAgdmFyIHVybCA9IHJvdXRlLnVybDtcbiAgaWYgKGxhc3RYaHJbY29udGV4dC5zb3VyY2VdKSB7XG4gICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0uYWJvcnQoKTtcbiAgICBsYXN0WGhyW2NvbnRleHQuc291cmNlXSA9IG51bGw7XG4gIH1cbiAgaW50ZXJjZXB0b3IuZXhlY3V0ZShyb3V0ZSwgYWZ0ZXJJbnRlcmNlcHRvcnMpO1xuXG4gIGZ1bmN0aW9uIGFmdGVySW50ZXJjZXB0b3JzIChlcnIsIHJlc3VsdCkge1xuICAgIGlmICghZXJyICYmIHJlc3VsdC5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICBkb25lKG51bGwsIHJlc3VsdC5tb2RlbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guc3RhcnQnLCByb3V0ZSwgY29udGV4dCk7XG4gICAgICBsYXN0WGhyW2NvbnRleHQuc291cmNlXSA9IHhocihqc29uaWZ5KHJvdXRlKSwgbm90aWZ5KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBub3RpZnkgKGVyciwgZGF0YSkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIGlmIChlcnIubWVzc2FnZSA9PT0gJ2Fib3J0ZWQnKSB7XG4gICAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guYWJvcnQnLCByb3V0ZSwgY29udGV4dCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmVycm9yJywgcm91dGUsIGNvbnRleHQsIGVycik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guZG9uZScsIHJvdXRlLCBjb250ZXh0LCBkYXRhKTtcbiAgICB9XG4gICAgZG9uZShlcnIsIGRhdGEpO1xuICB9XG59XG5cbmZldGNoZXIuYWJvcnRQZW5kaW5nID0gYWJvcnRQZW5kaW5nO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZldGNoZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgbGlua3MgPSByZXF1aXJlKCcuL2xpbmtzJyk7XG5cbmZ1bmN0aW9uIGF0dGFjaCAoKSB7XG4gIGVtaXR0ZXIub24oJ3N0YXJ0JywgbGlua3MpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXR0YWNoOiBhdHRhY2hcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBhY3RpdmF0b3IgPSByZXF1aXJlKCcuL2FjdGl2YXRvcicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBob29rcyA9IHJlcXVpcmUoJy4vaG9va3MnKTtcbnZhciBwYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG52YXIgbW91bnQgPSByZXF1aXJlKCcuL21vdW50Jyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcblxuaG9va3MuYXR0YWNoKCk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBtb3VudDogbW91bnQsXG4gIHBhcnRpYWw6IHBhcnRpYWwuc3RhbmRhbG9uZSxcbiAgb246IGVtaXR0ZXIub24uYmluZChlbWl0dGVyKSxcbiAgb25jZTogZW1pdHRlci5vbmNlLmJpbmQoZW1pdHRlciksXG4gIG9mZjogZW1pdHRlci5vZmYuYmluZChlbWl0dGVyKSxcbiAgaW50ZXJjZXB0OiBpbnRlcmNlcHRvci5hZGQsXG4gIG5hdmlnYXRlOiBhY3RpdmF0b3IuZ28sXG4gIHN0YXRlOiBzdGF0ZSxcbiAgcm91dGU6IHJvdXRlclxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xudmFyIG9uY2UgPSByZXF1aXJlKCcuL29uY2UnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGludGVyY2VwdG9ycyA9IGVtaXR0ZXIoeyBjb3VudDogMCB9LCB7IGFzeW5jOiB0cnVlIH0pO1xuXG5mdW5jdGlvbiBnZXRJbnRlcmNlcHRvckV2ZW50ICh1cmwsIHJvdXRlKSB7XG4gIHZhciBlID0ge1xuICAgIHVybDogdXJsLFxuICAgIHJvdXRlOiByb3V0ZSxcbiAgICBwYXJ0czogcm91dGUucGFydHMsXG4gICAgbW9kZWw6IG51bGwsXG4gICAgZGVmYXVsdFByZXZlbnRlZDogZmFsc2UsXG4gICAgcHJldmVudERlZmF1bHQ6IG9uY2UocHJldmVudERlZmF1bHQpXG4gIH07XG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKG1vZGVsKSB7XG4gICAgZS5kZWZhdWx0UHJldmVudGVkID0gdHJ1ZTtcbiAgICBlLm1vZGVsID0gbW9kZWw7XG4gIH1cblxuICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gYWRkIChhY3Rpb24sIGZuKSB7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgZm4gPSBhY3Rpb247XG4gICAgYWN0aW9uID0gJyonO1xuICB9XG4gIGludGVyY2VwdG9ycy5jb3VudCsrO1xuICBpbnRlcmNlcHRvcnMub24oYWN0aW9uLCBmbik7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGVTeW5jIChyb3V0ZSkge1xuICB2YXIgZSA9IGdldEludGVyY2VwdG9yRXZlbnQocm91dGUudXJsLCByb3V0ZSk7XG5cbiAgaW50ZXJjZXB0b3JzLmVtaXQoJyonLCBlKTtcbiAgaW50ZXJjZXB0b3JzLmVtaXQocm91dGUuYWN0aW9uLCBlKTtcblxuICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZSAocm91dGUsIGRvbmUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlLnVybCwgcm91dGUpO1xuICBpZiAoaW50ZXJjZXB0b3JzLmNvdW50ID09PSAwKSB7IC8vIGZhaWwgZmFzdFxuICAgIGVuZCgpOyByZXR1cm47XG4gIH1cbiAgdmFyIGZuID0gb25jZShlbmQpO1xuICB2YXIgcHJldmVudERlZmF1bHRCYXNlID0gZS5wcmV2ZW50RGVmYXVsdDtcblxuICBlLnByZXZlbnREZWZhdWx0ID0gb25jZShwcmV2ZW50RGVmYXVsdEVuZHMpO1xuXG4gIGludGVyY2VwdG9ycy5lbWl0KCcqJywgZSk7XG4gIGludGVyY2VwdG9ycy5lbWl0KHJvdXRlLmFjdGlvbiwgZSk7XG5cbiAgc2V0VGltZW91dChmbiwgMjAwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDIwMG1zIHdhaXRpbmcgb24gaW50ZXJjZXB0b3JzXG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHRFbmRzICgpIHtcbiAgICBwcmV2ZW50RGVmYXVsdEJhc2UuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICBmbigpO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kICgpIHtcbiAgICBkb25lKG51bGwsIGUpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZCxcbiAgZXhlY3V0ZTogZXhlY3V0ZVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLy8gc291cmNlOiBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9qZGFsdG9uLzVlMzRkODkwMTA1YWNhNDQzOTlmXG4vLyB0aGFua3MgQGpkYWx0b24hXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7IC8vIHVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgYFtbQ2xhc3NdXWAgb2YgdmFsdWVzXG52YXIgZm5Ub1N0cmluZyA9IEZ1bmN0aW9uLnByb3RvdHlwZS50b1N0cmluZzsgLy8gdXNlZCB0byByZXNvbHZlIHRoZSBkZWNvbXBpbGVkIHNvdXJjZSBvZiBmdW5jdGlvbnNcbnZhciBob3N0ID0gL15cXFtvYmplY3QgLis/Q29uc3RydWN0b3JcXF0kLzsgLy8gdXNlZCB0byBkZXRlY3QgaG9zdCBjb25zdHJ1Y3RvcnMgKFNhZmFyaSA+IDQ7IHJlYWxseSB0eXBlZCBhcnJheSBzcGVjaWZpYylcblxuLy8gRXNjYXBlIGFueSBzcGVjaWFsIHJlZ2V4cCBjaGFyYWN0ZXJzLlxudmFyIHNwZWNpYWxzID0gL1suKis/XiR7fSgpfFtcXF1cXC9cXFxcXS9nO1xuXG4vLyBSZXBsYWNlIG1lbnRpb25zIG9mIGB0b1N0cmluZ2Agd2l0aCBgLio/YCB0byBrZWVwIHRoZSB0ZW1wbGF0ZSBnZW5lcmljLlxuLy8gUmVwbGFjZSB0aGluZyBsaWtlIGBmb3IgLi4uYCB0byBzdXBwb3J0IGVudmlyb25tZW50cywgbGlrZSBSaGlubywgd2hpY2ggYWRkIGV4dHJhXG4vLyBpbmZvIHN1Y2ggYXMgbWV0aG9kIGFyaXR5LlxudmFyIGV4dHJhcyA9IC90b1N0cmluZ3woZnVuY3Rpb24pLio/KD89XFxcXFxcKCl8IGZvciAuKz8oPz1cXFxcXFxdKS9nO1xuXG4vLyBDb21waWxlIGEgcmVnZXhwIHVzaW5nIGEgY29tbW9uIG5hdGl2ZSBtZXRob2QgYXMgYSB0ZW1wbGF0ZS5cbi8vIFdlIGNob3NlIGBPYmplY3QjdG9TdHJpbmdgIGJlY2F1c2UgdGhlcmUncyBhIGdvb2QgY2hhbmNlIGl0IGlzIG5vdCBiZWluZyBtdWNrZWQgd2l0aC5cbnZhciBmblN0cmluZyA9IFN0cmluZyh0b1N0cmluZykucmVwbGFjZShzcGVjaWFscywgJ1xcXFwkJicpLnJlcGxhY2UoZXh0cmFzLCAnJDEuKj8nKTtcbnZhciByZU5hdGl2ZSA9IG5ldyBSZWdFeHAoJ14nICsgZm5TdHJpbmcgKyAnJCcpO1xuXG5mdW5jdGlvbiBpc05hdGl2ZSAodmFsdWUpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIGlmICh0eXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgLy8gVXNlIGBGdW5jdGlvbiN0b1N0cmluZ2AgdG8gYnlwYXNzIHRoZSB2YWx1ZSdzIG93biBgdG9TdHJpbmdgIG1ldGhvZFxuICAgIC8vIGFuZCBhdm9pZCBiZWluZyBmYWtlZCBvdXQuXG4gICAgcmV0dXJuIHJlTmF0aXZlLnRlc3QoZm5Ub1N0cmluZy5jYWxsKHZhbHVlKSk7XG4gIH1cblxuICAvLyBGYWxsYmFjayB0byBhIGhvc3Qgb2JqZWN0IGNoZWNrIGJlY2F1c2Ugc29tZSBlbnZpcm9ubWVudHMgd2lsbCByZXByZXNlbnRcbiAgLy8gdGhpbmdzIGxpa2UgdHlwZWQgYXJyYXlzIGFzIERPTSBtZXRob2RzIHdoaWNoIG1heSBub3QgY29uZm9ybSB0byB0aGVcbiAgLy8gbm9ybWFsIG5hdGl2ZSBwYXR0ZXJuLlxuICByZXR1cm4gKHZhbHVlICYmIHR5cGUgPT09ICdvYmplY3QnICYmIGhvc3QudGVzdCh0b1N0cmluZy5jYWxsKHZhbHVlKSkpIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzTmF0aXZlO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBhY3RpdmF0b3IgPSByZXF1aXJlKCcuL2FjdGl2YXRvcicpO1xudmFyIG9yaWdpbiA9IGRvY3VtZW50LmxvY2F0aW9uLm9yaWdpbjtcbnZhciBsZWZ0Q2xpY2sgPSAxO1xudmFyIHByZWZldGNoaW5nID0gW107XG52YXIgY2xpY2tzT25Ib2xkID0gW107XG5cbmZ1bmN0aW9uIGxpbmtzICgpIHtcbiAgaWYgKHN0YXRlLnByZWZldGNoICYmIHN0YXRlLmNhY2hlKSB7IC8vIHByZWZldGNoIHdpdGhvdXQgY2FjaGUgbWFrZXMgbm8gc2Vuc2VcbiAgICBldmVudHMuYWRkKGRvY3VtZW50LmJvZHksICdtb3VzZW92ZXInLCBtYXliZVByZWZldGNoKTtcbiAgICBldmVudHMuYWRkKGRvY3VtZW50LmJvZHksICd0b3VjaHN0YXJ0JywgbWF5YmVQcmVmZXRjaCk7XG4gIH1cbiAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAnY2xpY2snLCBtYXliZVJlcm91dGUpO1xufVxuXG5mdW5jdGlvbiBzbyAoYW5jaG9yKSB7XG4gIHJldHVybiBhbmNob3Iub3JpZ2luID09PSBvcmlnaW47XG59XG5cbmZ1bmN0aW9uIGxlZnRDbGlja09uQW5jaG9yIChlLCBhbmNob3IpIHtcbiAgcmV0dXJuIGFuY2hvci5wYXRobmFtZSAmJiBlLndoaWNoID09PSBsZWZ0Q2xpY2sgJiYgIWUubWV0YUtleSAmJiAhZS5jdHJsS2V5O1xufVxuXG5mdW5jdGlvbiB0YXJnZXRPckFuY2hvciAoZSkge1xuICB2YXIgYW5jaG9yID0gZS50YXJnZXQ7XG4gIHdoaWxlIChhbmNob3IpIHtcbiAgICBpZiAoYW5jaG9yLnRhZ05hbWUgPT09ICdBJykge1xuICAgICAgcmV0dXJuIGFuY2hvcjtcbiAgICB9XG4gICAgYW5jaG9yID0gYW5jaG9yLnBhcmVudEVsZW1lbnQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWF5YmVSZXJvdXRlIChlKSB7XG4gIHZhciBhbmNob3IgPSB0YXJnZXRPckFuY2hvcihlKTtcbiAgaWYgKGFuY2hvciAmJiBzbyhhbmNob3IpICYmIGxlZnRDbGlja09uQW5jaG9yKGUsIGFuY2hvcikpIHtcbiAgICByZXJvdXRlKGUsIGFuY2hvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWF5YmVQcmVmZXRjaCAoZSkge1xuICB2YXIgYW5jaG9yID0gdGFyZ2V0T3JBbmNob3IoZSk7XG4gIGlmIChhbmNob3IgJiYgc28oYW5jaG9yKSkge1xuICAgIHByZWZldGNoKGUsIGFuY2hvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2Nyb2xsSW50byAoaWQpIHtcbiAgdmFyIGVsZW0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gIGlmIChlbGVtICYmIGVsZW0uc2Nyb2xsSW50b1ZpZXcpIHtcbiAgICBlbGVtLnNjcm9sbEludG9WaWV3KCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiBnZXRSb3V0ZSAoYW5jaG9yLCBmYWlsKSB7XG4gIHZhciB1cmwgPSBhbmNob3IucGF0aG5hbWUgKyBhbmNob3Iuc2VhcmNoICsgYW5jaG9yLmhhc2g7XG4gIGlmICh1cmwgPT09IGxvY2F0aW9uLnBhdGhuYW1lICsgbG9jYXRpb24uc2VhcmNoICsgYW5jaG9yLmhhc2gpIHtcbiAgICAoZmFpbCB8fCBub29wKSgpO1xuICAgIHJldHVybjsgLy8gYW5jaG9yIGhhc2gtbmF2aWdhdGlvbiBvbiBzYW1lIHBhZ2UgaWdub3JlcyByb3V0ZXJcbiAgfVxuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS5pZ25vcmUpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiByZXJvdXRlIChlLCBhbmNob3IpIHtcbiAgdmFyIHJvdXRlID0gZ2V0Um91dGUoYW5jaG9yLCBmYWlsKTtcbiAgaWYgKCFyb3V0ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByZXZlbnQoKTtcblxuICBpZiAocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgIGNsaWNrc09uSG9sZC5wdXNoKGFuY2hvcik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYWN0aXZhdG9yLmdvKHJvdXRlLnVybCwgeyBjb250ZXh0OiBhbmNob3IgfSk7XG5cbiAgZnVuY3Rpb24gZmFpbCAoKSB7XG4gICAgaWYgKGFuY2hvci5oYXNoID09PSBsb2NhdGlvbi5oYXNoKSB7XG4gICAgICBzY3JvbGxJbnRvKGFuY2hvci5oYXNoLnN1YnN0cigxKSk7XG4gICAgICBwcmV2ZW50KCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcHJldmVudCAoKSB7IGUucHJldmVudERlZmF1bHQoKTsgfVxufVxuXG5mdW5jdGlvbiBwcmVmZXRjaCAoZSwgYW5jaG9yKSB7XG4gIHZhciByb3V0ZSA9IGdldFJvdXRlKGFuY2hvcik7XG4gIGlmICghcm91dGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByZWZldGNoaW5nLnB1c2goYW5jaG9yKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBhbmNob3IsIHNvdXJjZTogJ3ByZWZldGNoJyB9LCByZXNvbHZlZCk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZWQgKGVyciwgZGF0YSkge1xuICAgIHByZWZldGNoaW5nLnNwbGljZShwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvciksIDEpO1xuICAgIGlmIChjbGlja3NPbkhvbGQuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgICAgY2xpY2tzT25Ib2xkLnNwbGljZShjbGlja3NPbkhvbGQuaW5kZXhPZihhbmNob3IpLCAxKTtcbiAgICAgIGFjdGl2YXRvci5nbyhyb3V0ZS51cmwsIHsgY29udGV4dDogYW5jaG9yIH0pO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGxpbmtzO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdW5lc2NhcGUgPSByZXF1aXJlKCcuL3VuZXNjYXBlJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBhY3RpdmF0b3IgPSByZXF1aXJlKCcuL2FjdGl2YXRvcicpO1xudmFyIGNhY2hpbmcgPSByZXF1aXJlKCcuL2NhY2hpbmcnKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgZyA9IGdsb2JhbDtcbnZhciBtb3VudGVkO1xudmFyIGJvb3RlZDtcblxuZnVuY3Rpb24gb3JFbXB0eSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBtb3VudCAoY29udGFpbmVyLCB3aXJpbmcsIG9wdGlvbnMpIHtcbiAgdmFyIG8gPSBvcHRpb25zIHx8IHt9O1xuICBpZiAobW91bnRlZCkge1xuICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIGFscmVhZHkgbW91bnRlZCEnKTtcbiAgfVxuICBpZiAoIWNvbnRhaW5lciB8fCAhY29udGFpbmVyLnRhZ05hbWUpIHsgLy8gbmHDr3ZlIGlzIGVub3VnaFxuICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgZGVmaW5lIGFuIGFwcGxpY2F0aW9uIHJvb3QgY29udGFpbmVyIScpO1xuICB9XG5cbiAgbW91bnRlZCA9IHRydWU7XG5cbiAgc3RhdGUuY29udGFpbmVyID0gY29udGFpbmVyO1xuICBzdGF0ZS5jb250cm9sbGVycyA9IHdpcmluZy5jb250cm9sbGVycztcbiAgc3RhdGUudGVtcGxhdGVzID0gd2lyaW5nLnRlbXBsYXRlcztcbiAgc3RhdGUucm91dGVzID0gd2lyaW5nLnJvdXRlcztcbiAgc3RhdGUucHJlZmV0Y2ggPSAhIW8ucHJlZmV0Y2g7XG5cbiAgcm91dGVyLnNldHVwKHdpcmluZy5yb3V0ZXMpO1xuXG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcblxuICBjYWNoaW5nLnNldHVwKG8uY2FjaGUsIHJvdXRlKTtcbiAgY2FjaGluZy5yZWFkeShraWNrc3RhcnQpO1xuXG4gIGZ1bmN0aW9uIGtpY2tzdGFydCAoKSB7XG4gICAgaWYgKCFvLmJvb3RzdHJhcCkgeyBvLmJvb3RzdHJhcCA9ICdhdXRvJzsgfVxuICAgIGlmIChvLmJvb3RzdHJhcCA9PT0gJ2F1dG8nKSB7XG4gICAgICBhdXRvYm9vdCgpO1xuICAgIH0gZWxzZSBpZiAoby5ib290c3RyYXAgPT09ICdpbmxpbmUnKSB7XG4gICAgICBpbmxpbmVib290KCk7XG4gICAgfSBlbHNlIGlmIChvLmJvb3RzdHJhcCA9PT0gJ21hbnVhbCcpIHtcbiAgICAgIG1hbnVhbGJvb3QoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhdXRvYm9vdCAoKSB7XG4gICAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250YWluZXIsIHNvdXJjZTogJ2Jvb3QnIH0sIGZldGNoZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZmV0Y2hlZCAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGZXRjaGluZyBKU09OIGRhdGEgbW9kZWwgZm9yIGZpcnN0IHZpZXcgZmFpbGVkLicpO1xuICAgIH1cbiAgICBib290KGRhdGEpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5saW5lYm9vdCAoKSB7XG4gICAgdmFyIGlkID0gY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS10YXVudXMnKTtcbiAgICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBtb2RlbCA9IEpTT04ucGFyc2UodW5lc2NhcGUoc2NyaXB0LmlubmVyVGV4dCB8fCBzY3JpcHQudGV4dENvbnRlbnQpKTtcbiAgICBib290KG1vZGVsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1hbnVhbGJvb3QgKCkge1xuICAgIGlmICh0eXBlb2YgZy50YXVudXNSZWFkeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgZy50YXVudXNSZWFkeSA9IGJvb3Q7IC8vIG5vdCB5ZXQgYW4gb2JqZWN0PyB0dXJuIGl0IGludG8gdGhlIGJvb3QgbWV0aG9kXG4gICAgfSBlbHNlIHtcbiAgICAgIGJvb3QoZy50YXVudXNSZWFkeSk7IC8vIGFscmVhZHkgYW4gb2JqZWN0PyBib290IHdpdGggdGhhdCBhcyB0aGUgbW9kZWxcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBib290IChtb2RlbCkge1xuICAgIGlmIChib290ZWQpIHsgLy8gc2FuaXR5XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghbW9kZWwgfHwgdHlwZW9mIG1vZGVsICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUYXVudXMgbW9kZWwgbXVzdCBiZSBhbiBvYmplY3QhJyk7XG4gICAgfVxuICAgIGJvb3RlZCA9IHRydWU7XG4gICAgY2FjaGluZy5wZXJzaXN0KHJvdXRlLCBzdGF0ZS5jb250YWluZXIsIG1vZGVsKTtcbiAgICBhY3RpdmF0b3Iuc3RhcnQobW9kZWwpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbW91bnQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChmbikge1xuICB2YXIgdXNlZDtcbiAgcmV0dXJuIGZ1bmN0aW9uIG9uY2UgKCkge1xuICAgIGlmICh1c2VkKSB7IHJldHVybjsgfSB1c2VkID0gdHJ1ZTtcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciByYWYgPSByZXF1aXJlKCdyYWYnKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG5cbmZ1bmN0aW9uIHBvc2l0aW9uaW5nICgpIHtcbiAgdmFyIHRhcmdldDtcbiAgdmFyIGhhc2ggPSBsb2NhdGlvbi5oYXNoO1xuICBpZiAoaGFzaCkge1xuICAgIHRhcmdldCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGhhc2guc2xpY2UoMSkpO1xuICB9XG4gIGlmICghdGFyZ2V0KSB7XG4gICAgdGFyZ2V0ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICB9XG4gIHJhZihmb2N1c2luKTtcbiAgZnVuY3Rpb24gZm9jdXNpbiAoKSB7XG4gICAgdGFyZ2V0LnNjcm9sbEludG9WaWV3KCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFydGlhbCAoY29udGFpbmVyLCBlbmZvcmNlZEFjdGlvbiwgbW9kZWwsIHJvdXRlLCBvcHRpb25zKSB7XG4gIHZhciBhY3Rpb24gPSBlbmZvcmNlZEFjdGlvbiB8fCBtb2RlbCAmJiBtb2RlbC5hY3Rpb24gfHwgcm91dGUgJiYgcm91dGUuYWN0aW9uO1xuICB2YXIgY29udHJvbGxlciA9IHN0YXRlLmNvbnRyb2xsZXJzW2FjdGlvbl07XG4gIHZhciBpbnRlcm5hbHMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoaW50ZXJuYWxzLnJlbmRlciAhPT0gZmFsc2UpIHtcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gcmVuZGVyKGFjdGlvbiwgbW9kZWwpO1xuICAgIGlmIChpbnRlcm5hbHMucm91dGVkICE9PSBmYWxzZSkge1xuICAgICAgcG9zaXRpb25pbmcoKTtcbiAgICB9XG4gIH1cbiAgZW1pdHRlci5lbWl0KCdyZW5kZXInLCBjb250YWluZXIsIG1vZGVsKTtcbiAgaWYgKGNvbnRyb2xsZXIpIHtcbiAgICBjb250cm9sbGVyKG1vZGVsLCBjb250YWluZXIsIHJvdXRlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXIgKGFjdGlvbiwgbW9kZWwpIHtcbiAgdmFyIHRlbXBsYXRlID0gc3RhdGUudGVtcGxhdGVzW2FjdGlvbl07XG4gIHRyeSB7XG4gICAgcmV0dXJuIHRlbXBsYXRlKG1vZGVsKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHRocm93IG5ldyBFcnJvcignRXJyb3IgcmVuZGVyaW5nIFwiJyArIGFjdGlvbiArICdcIiB0ZW1wbGF0ZVxcbicgKyBlLnN0YWNrKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFuZGFsb25lIChjb250YWluZXIsIGFjdGlvbiwgbW9kZWwsIHJvdXRlKSB7XG4gIHJldHVybiBwYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbCwgcm91dGUsIHsgcm91dGVkOiBmYWxzZSB9KTtcbn1cblxucGFydGlhbC5zdGFuZGFsb25lID0gc3RhbmRhbG9uZTtcblxubW9kdWxlLmV4cG9ydHMgPSBwYXJ0aWFsO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXJsID0gcmVxdWlyZSgnZmFzdC11cmwtcGFyc2VyJyk7XG52YXIgcm91dGVzID0gcmVxdWlyZSgncm91dGVzJyk7XG52YXIgbWF0Y2hlciA9IHJvdXRlcygpO1xuXG5mdW5jdGlvbiByb3V0ZXIgKHJhdykge1xuICB2YXIgcGFydHMgPSB1cmwucGFyc2UocmF3KTtcbiAgdmFyIHJlc3VsdCA9IG1hdGNoZXIubWF0Y2gocGFydHMucGF0aG5hbWUpO1xuICB2YXIgcm91dGUgPSByZXN1bHQgPyByZXN1bHQuZm4ocmVzdWx0KSA6IG51bGw7XG4gIGlmIChyb3V0ZSkge1xuICAgIHJvdXRlLnVybCA9IHJhdztcbiAgICByb3V0ZS5wYXJ0cyA9IHBhcnRzO1xuICB9XG4gIHJldHVybiByb3V0ZTtcbn1cblxuZnVuY3Rpb24gc2V0dXAgKGRlZmluaXRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmluaXRpb25zKS5mb3JFYWNoKGRlZmluZS5iaW5kKG51bGwsIGRlZmluaXRpb25zKSk7XG59XG5cbmZ1bmN0aW9uIGRlZmluZSAoZGVmaW5pdGlvbnMsIGtleSkge1xuICBtYXRjaGVyLmFkZFJvdXRlKGtleSwgZnVuY3Rpb24gZGVmaW5pdGlvbiAobWF0Y2gpIHtcbiAgICB2YXIgcGFyYW1zID0gbWF0Y2gucGFyYW1zO1xuICAgIHBhcmFtcy5hcmdzID0gbWF0Y2guc3BsYXRzO1xuICAgIHJldHVybiB7XG4gICAgICByb3V0ZToga2V5LFxuICAgICAgcGFyYW1zOiBwYXJhbXMsXG4gICAgICBhY3Rpb246IGRlZmluaXRpb25zW2tleV0uYWN0aW9uIHx8IG51bGwsXG4gICAgICBpZ25vcmU6IGRlZmluaXRpb25zW2tleV0uaWdub3JlLFxuICAgICAgY2FjaGU6IGRlZmluaXRpb25zW2tleV0uY2FjaGVcbiAgICB9O1xuICB9KTtcbn1cblxucm91dGVyLnNldHVwID0gc2V0dXA7XG5cbm1vZHVsZS5leHBvcnRzID0gcm91dGVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgY29udGFpbmVyOiBudWxsXG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXBpID0ge307XG52YXIgZyA9IGdsb2JhbDtcbnZhciBpZGIgPSBnLmluZGV4ZWREQiB8fCBnLm1vekluZGV4ZWREQiB8fCBnLndlYmtpdEluZGV4ZWREQiB8fCBnLm1zSW5kZXhlZERCO1xudmFyIHN1cHBvcnRzO1xudmFyIGRiO1xudmFyIGRiTmFtZSA9ICd0YXVudXMtY2FjaGUnO1xudmFyIHN0b3JlID0gJ3ZpZXctbW9kZWxzJztcbnZhciBrZXlQYXRoID0gJ3VybCc7XG52YXIgc2V0UXVldWUgPSBbXTtcbnZhciB0ZXN0ZWRRdWV1ZSA9IFtdO1xuXG5mdW5jdGlvbiBub29wICgpIHt9XG5cbmZ1bmN0aW9uIHRlc3QgKCkge1xuICB2YXIga2V5ID0gJ2luZGV4ZWQtZGItZmVhdHVyZS1kZXRlY3Rpb24nO1xuICB2YXIgcmVxO1xuICB2YXIgZGI7XG5cbiAgaWYgKCEoaWRiICYmICdkZWxldGVEYXRhYmFzZScgaW4gaWRiKSkge1xuICAgIHN1cHBvcnQoZmFsc2UpOyByZXR1cm47XG4gIH1cblxuICB0cnkge1xuICAgIGlkYi5kZWxldGVEYXRhYmFzZShrZXkpLm9uc3VjY2VzcyA9IHRyYW5zYWN0aW9uYWxUZXN0O1xuICB9IGNhdGNoIChlKSB7XG4gICAgc3VwcG9ydChmYWxzZSk7XG4gIH1cblxuICBmdW5jdGlvbiB0cmFuc2FjdGlvbmFsVGVzdCAoKSB7XG4gICAgcmVxID0gaWRiLm9wZW4oa2V5LCAxKTtcbiAgICByZXEub251cGdyYWRlbmVlZGVkID0gdXBnbmVlZGVkO1xuICAgIHJlcS5vbmVycm9yID0gZXJyb3I7XG4gICAgcmVxLm9uc3VjY2VzcyA9IHN1Y2Nlc3M7XG5cbiAgICBmdW5jdGlvbiB1cGduZWVkZWQgKCkge1xuICAgICAgcmVxLnJlc3VsdC5jcmVhdGVPYmplY3RTdG9yZSgnc3RvcmUnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWNjZXNzICgpIHtcbiAgICAgIGRiID0gcmVxLnJlc3VsdDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGRiLnRyYW5zYWN0aW9uKCdzdG9yZScsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZSgnc3RvcmUnKS5hZGQobmV3IEJsb2IoKSwgJ2tleScpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBzdXBwb3J0KGZhbHNlKTtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIGRiLmNsb3NlKCk7XG4gICAgICAgIGlkYi5kZWxldGVEYXRhYmFzZShrZXkpO1xuICAgICAgICBpZiAoc3VwcG9ydHMgIT09IGZhbHNlKSB7XG4gICAgICAgICAgb3BlbigpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgICAgc3VwcG9ydChmYWxzZSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIG9wZW4gKCkge1xuICB2YXIgcmVxID0gaWRiLm9wZW4oZGJOYW1lLCAxKTtcbiAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcbiAgcmVxLm9udXBncmFkZW5lZWRlZCA9IHVwZ25lZWRlZDtcbiAgcmVxLm9uc3VjY2VzcyA9IHN1Y2Nlc3M7XG5cbiAgZnVuY3Rpb24gdXBnbmVlZGVkICgpIHtcbiAgICByZXEucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKHN0b3JlLCB7IGtleVBhdGg6IGtleVBhdGggfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzdWNjZXNzICgpIHtcbiAgICBkYiA9IHJlcS5yZXN1bHQ7XG4gICAgYXBpLm5hbWUgPSAnSW5kZXhlZERCJztcbiAgICBhcGkuZ2V0ID0gZ2V0O1xuICAgIGFwaS5zZXQgPSBzZXQ7XG4gICAgZHJhaW5TZXQoKTtcbiAgICBzdXBwb3J0KHRydWUpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXJyb3IgKCkge1xuICAgIHN1cHBvcnQoZmFsc2UpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZhbGxiYWNrICgpIHtcbiAgYXBpLm5hbWUgPSAnSW5kZXhlZERCLWZhbGxiYWNrU3RvcmUnO1xuICBhcGkuZ2V0ID0gdW5kZWZpbmVkR2V0O1xuICBhcGkuc2V0ID0gZW5xdWV1ZVNldDtcbn1cblxuZnVuY3Rpb24gdW5kZWZpbmVkR2V0IChrZXksIGRvbmUpIHtcbiAgZG9uZShudWxsLCBudWxsKTtcbn1cblxuZnVuY3Rpb24gZW5xdWV1ZVNldCAoa2V5LCAgdmFsdWUsIGRvbmUpIHtcbiAgaWYgKHNldFF1ZXVlLmxlbmd0aCA+IDIpIHsgLy8gbGV0J3Mgbm90IHdhc3RlIGFueSBtb3JlIG1lbW9yeVxuICAgIHJldHVybjtcbiAgfVxuICBpZiAoc3VwcG9ydHMgIT09IGZhbHNlKSB7IC8vIGxldCdzIGFzc3VtZSB0aGUgY2FwYWJpbGl0eSBpcyB2YWxpZGF0ZWQgc29vblxuICAgIHNldFF1ZXVlLnB1c2goeyBrZXk6IGtleSwgdmFsdWU6IHZhbHVlLCBkb25lOiBkb25lIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluU2V0ICgpIHtcbiAgd2hpbGUgKHNldFF1ZXVlLmxlbmd0aCkge1xuICAgIHZhciBpdGVtID0gc2V0UXVldWUuc2hpZnQoKTtcbiAgICBzZXQoaXRlbS5rZXksIGl0ZW0udmFsdWUsIGl0ZW0uZG9uZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcXVlcnkgKG9wLCB2YWx1ZSwgZG9uZSkge1xuICB2YXIgcmVxID0gZGIudHJhbnNhY3Rpb24oc3RvcmUsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZShzdG9yZSlbb3BdKHZhbHVlKTtcblxuICByZXEub25zdWNjZXNzID0gc3VjY2VzcztcbiAgcmVxLm9uZXJyb3IgPSBlcnJvcjtcblxuICBmdW5jdGlvbiBzdWNjZXNzICgpIHtcbiAgICAoZG9uZSB8fCBub29wKShudWxsLCByZXEucmVzdWx0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICAoZG9uZSB8fCBub29wKShuZXcgRXJyb3IoJ1RhdW51cyBjYWNoZSBxdWVyeSBmYWlsZWQgYXQgSW5kZXhlZERCIScpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXQgKGtleSwgZG9uZSkge1xuICBxdWVyeSgnZ2V0Jywga2V5LCBkb25lKTtcbn1cblxuZnVuY3Rpb24gc2V0IChrZXksIHZhbHVlLCBkb25lKSB7XG4gIHZhbHVlW2tleVBhdGhdID0ga2V5O1xuICBxdWVyeSgnYWRkJywgdmFsdWUsIGRvbmUpOyAvLyBhdHRlbXB0IHRvIGluc2VydFxuICBxdWVyeSgncHV0JywgdmFsdWUsIGRvbmUpOyAvLyBhdHRlbXB0IHRvIHVwZGF0ZVxufVxuXG5mdW5jdGlvbiBkcmFpblRlc3RlZCAoKSB7XG4gIHdoaWxlICh0ZXN0ZWRRdWV1ZS5sZW5ndGgpIHtcbiAgICB0ZXN0ZWRRdWV1ZS5zaGlmdCgpKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdGVzdGVkIChmbikge1xuICBpZiAoc3VwcG9ydHMgIT09IHZvaWQgMCkge1xuICAgIGZuKCk7XG4gIH0gZWxzZSB7XG4gICAgdGVzdGVkUXVldWUucHVzaChmbik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3VwcG9ydCAodmFsdWUpIHtcbiAgaWYgKHN1cHBvcnRzICE9PSB2b2lkIDApIHtcbiAgICByZXR1cm47IC8vIHNhbml0eVxuICB9XG4gIHN1cHBvcnRzID0gdmFsdWU7XG4gIGRyYWluVGVzdGVkKCk7XG59XG5cbmZ1bmN0aW9uIGZhaWxlZCAoKSB7XG4gIHN1cHBvcnQoZmFsc2UpO1xufVxuXG5mYWxsYmFjaygpO1xudGVzdCgpO1xuc2V0VGltZW91dChmYWlsZWQsIDYwMCk7IC8vIHRoZSB0ZXN0IGNhbiB0YWtlIHNvbWV3aGVyZSBuZWFyIDMwMG1zIHRvIGNvbXBsZXRlXG5cbm1vZHVsZS5leHBvcnRzID0gYXBpO1xuXG5hcGkudGVzdGVkID0gdGVzdGVkO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJhdyA9IHt9O1xuXG5mdW5jdGlvbiBub29wICgpIHt9XG5cbmZ1bmN0aW9uIGdldCAoa2V5LCBkb25lKSB7XG4gIGRvbmUobnVsbCwgcmF3W2tleV0pO1xufVxuXG5mdW5jdGlvbiBzZXQgKGtleSwgdmFsdWUsIGRvbmUpIHtcbiAgcmF3W2tleV0gPSB2YWx1ZTtcbiAgKGRvbmUgfHwgbm9vcCkobnVsbCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBuYW1lOiAnbWVtb3J5U3RvcmUnLFxuICBnZXQ6IGdldCxcbiAgc2V0OiBzZXRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciByZUVzY2FwZWRIdG1sID0gLyYoPzphbXB8bHR8Z3R8cXVvdHwjMzl8Izk2KTsvZztcbnZhciBodG1sVW5lc2NhcGVzID0ge1xuICAnJmFtcDsnOiAnJicsXG4gICcmbHQ7JzogJzwnLFxuICAnJmd0Oyc6ICc+JyxcbiAgJyZxdW90Oyc6ICdcIicsXG4gICcmIzM5Oyc6ICdcXCcnLFxuICAnJiM5NjsnOiAnYCdcbn07XG5cbmZ1bmN0aW9uIHVuZXNjYXBlSHRtbENoYXIgKGMpIHtcbiAgcmV0dXJuIGh0bWxVbmVzY2FwZXNbY107XG59XG5cbmZ1bmN0aW9uIHVuZXNjYXBlIChpbnB1dCkge1xuICB2YXIgZGF0YSA9IGlucHV0ID09IG51bGwgPyAnJyA6IFN0cmluZyhpbnB1dCk7XG4gIGlmIChkYXRhICYmIChyZUVzY2FwZWRIdG1sLmxhc3RJbmRleCA9IDAsIHJlRXNjYXBlZEh0bWwudGVzdChkYXRhKSkpIHtcbiAgICByZXR1cm4gZGF0YS5yZXBsYWNlKHJlRXNjYXBlZEh0bWwsIHVuZXNjYXBlSHRtbENoYXIpO1xuICB9XG4gIHJldHVybiBkYXRhO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHVuZXNjYXBlO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgeGhyID0gcmVxdWlyZSgneGhyJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh1cmwsIGRvbmUpIHtcbiAgdmFyIG9wdGlvbnMgPSB7XG4gICAgdXJsOiB1cmwsXG4gICAganNvbjogdHJ1ZSxcbiAgICBoZWFkZXJzOiB7IEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nIH1cbiAgfTtcbiAgdmFyIHJlcSA9IHhocihvcHRpb25zLCBoYW5kbGUpO1xuXG4gIHJldHVybiByZXE7XG5cbiAgZnVuY3Rpb24gaGFuZGxlIChlcnIsIHJlcywgYm9keSkge1xuICAgIGlmIChlcnIgJiYgIXJlcS5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSkge1xuICAgICAgZG9uZShuZXcgRXJyb3IoJ2Fib3J0ZWQnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUoZXJyLCBib2R5KTtcbiAgICB9XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vc3JjL2NvbnRyYS5lbWl0dGVyLmpzJyk7XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuKGZ1bmN0aW9uIChyb290LCB1bmRlZmluZWQpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciB1bmRlZiA9ICcnICsgdW5kZWZpbmVkO1xuICBmdW5jdGlvbiBhdG9hIChhLCBuKSB7IHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhLCBuKTsgfVxuICBmdW5jdGlvbiBkZWJvdW5jZSAoZm4sIGFyZ3MsIGN0eCkgeyBpZiAoIWZuKSB7IHJldHVybjsgfSB0aWNrKGZ1bmN0aW9uIHJ1biAoKSB7IGZuLmFwcGx5KGN0eCB8fCBudWxsLCBhcmdzIHx8IFtdKTsgfSk7IH1cblxuICAvLyBjcm9zcy1wbGF0Zm9ybSB0aWNrZXJcbiAgdmFyIHNpID0gdHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gJ2Z1bmN0aW9uJywgdGljaztcbiAgaWYgKHNpKSB7XG4gICAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRJbW1lZGlhdGUoZm4pOyB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9jZXNzICE9PSB1bmRlZiAmJiBwcm9jZXNzLm5leHRUaWNrKSB7XG4gICAgdGljayA9IHByb2Nlc3MubmV4dFRpY2s7XG4gIH0gZWxzZSB7XG4gICAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRUaW1lb3V0KGZuLCAwKTsgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF9lbWl0dGVyICh0aGluZywgb3B0aW9ucykge1xuICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgZXZ0ID0ge307XG4gICAgaWYgKHRoaW5nID09PSB1bmRlZmluZWQpIHsgdGhpbmcgPSB7fTsgfVxuICAgIHRoaW5nLm9uID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBpZiAoIWV2dFt0eXBlXSkge1xuICAgICAgICBldnRbdHlwZV0gPSBbZm5dO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXZ0W3R5cGVdLnB1c2goZm4pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gICAgdGhpbmcub25jZSA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgZm4uX29uY2UgPSB0cnVlOyAvLyB0aGluZy5vZmYoZm4pIHN0aWxsIHdvcmtzIVxuICAgICAgdGhpbmcub24odHlwZSwgZm4pO1xuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gICAgdGhpbmcub2ZmID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICB2YXIgYyA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICBpZiAoYyA9PT0gMSkge1xuICAgICAgICBkZWxldGUgZXZ0W3R5cGVdO1xuICAgICAgfSBlbHNlIGlmIChjID09PSAwKSB7XG4gICAgICAgIGV2dCA9IHt9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgICBpZiAoIWV0KSB7IHJldHVybiB0aGluZzsgfVxuICAgICAgICBldC5zcGxpY2UoZXQuaW5kZXhPZihmbiksIDEpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gICAgdGhpbmcuZW1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBjdHggPSB0aGlzO1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICB2YXIgdHlwZSA9IGFyZ3Muc2hpZnQoKTtcbiAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgIGlmICh0eXBlID09PSAnZXJyb3InICYmIG9wdHMudGhyb3dzICE9PSBmYWxzZSAmJiAhZXQpIHsgdGhyb3cgYXJncy5sZW5ndGggPT09IDEgPyBhcmdzWzBdIDogYXJnczsgfVxuICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgIGV2dFt0eXBlXSA9IGV0LmZpbHRlcihmdW5jdGlvbiBlbWl0dGVyIChsaXN0ZW4pIHtcbiAgICAgICAgaWYgKG9wdHMuYXN5bmMpIHsgZGVib3VuY2UobGlzdGVuLCBhcmdzLCBjdHgpOyB9IGVsc2UgeyBsaXN0ZW4uYXBwbHkoY3R4LCBhcmdzKTsgfVxuICAgICAgICByZXR1cm4gIWxpc3Rlbi5fb25jZTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gZXhwb3J0XG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSB1bmRlZiAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gX2VtaXR0ZXI7XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5jb250cmEgPSByb290LmNvbnRyYSB8fCB7fTtcbiAgICByb290LmNvbnRyYS5lbWl0dGVyID0gX2VtaXR0ZXI7XG4gIH1cbn0pKHRoaXMpO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIikpIiwiXCJ1c2Ugc3RyaWN0XCI7XG4vKlxuQ29weXJpZ2h0IChjKSAyMDE0IFBldGthIEFudG9ub3ZcblxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxub2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xudG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG5mdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbklNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cblRIRSBTT0ZUV0FSRS5cbiovXG5mdW5jdGlvbiBVcmwoKSB7XG4gICAgLy9Gb3IgbW9yZSBlZmZpY2llbnQgaW50ZXJuYWwgcmVwcmVzZW50YXRpb24gYW5kIGxhemluZXNzLlxuICAgIC8vVGhlIG5vbi11bmRlcnNjb3JlIHZlcnNpb25zIG9mIHRoZXNlIHByb3BlcnRpZXMgYXJlIGFjY2Vzc29yIGZ1bmN0aW9uc1xuICAgIC8vZGVmaW5lZCBvbiB0aGUgcHJvdG90eXBlLlxuICAgIHRoaXMuX3Byb3RvY29sID0gbnVsbDtcbiAgICB0aGlzLl9ocmVmID0gXCJcIjtcbiAgICB0aGlzLl9wb3J0ID0gLTE7XG4gICAgdGhpcy5fcXVlcnkgPSBudWxsO1xuXG4gICAgdGhpcy5hdXRoID0gbnVsbDtcbiAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgIHRoaXMuaG9zdCA9IG51bGw7XG4gICAgdGhpcy5ob3N0bmFtZSA9IG51bGw7XG4gICAgdGhpcy5oYXNoID0gbnVsbDtcbiAgICB0aGlzLnNlYXJjaCA9IG51bGw7XG4gICAgdGhpcy5wYXRobmFtZSA9IG51bGw7XG5cbiAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSBmYWxzZTtcbn1cblxudmFyIHF1ZXJ5c3RyaW5nID0gcmVxdWlyZShcInF1ZXJ5c3RyaW5nXCIpO1xuVXJsLnByb3RvdHlwZS5wYXJzZSA9XG5mdW5jdGlvbiBVcmwkcGFyc2Uoc3RyLCBwYXJzZVF1ZXJ5U3RyaW5nLCBob3N0RGVub3Rlc1NsYXNoKSB7XG4gICAgaWYgKHR5cGVvZiBzdHIgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlBhcmFtZXRlciAndXJsJyBtdXN0IGJlIGEgc3RyaW5nLCBub3QgXCIgK1xuICAgICAgICAgICAgdHlwZW9mIHN0cik7XG4gICAgfVxuICAgIHZhciBzdGFydCA9IDA7XG4gICAgdmFyIGVuZCA9IHN0ci5sZW5ndGggLSAxO1xuXG4gICAgLy9UcmltIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdzXG4gICAgd2hpbGUgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA8PSAweDIwIC8qJyAnKi8pIHN0YXJ0Kys7XG4gICAgd2hpbGUgKHN0ci5jaGFyQ29kZUF0KGVuZCkgPD0gMHgyMCAvKicgJyovKSBlbmQtLTtcblxuICAgIHN0YXJ0ID0gdGhpcy5fcGFyc2VQcm90b2NvbChzdHIsIHN0YXJ0LCBlbmQpO1xuXG4gICAgLy9KYXZhc2NyaXB0IGRvZXNuJ3QgaGF2ZSBob3N0XG4gICAgaWYgKHRoaXMuX3Byb3RvY29sICE9PSBcImphdmFzY3JpcHRcIikge1xuICAgICAgICBzdGFydCA9IHRoaXMuX3BhcnNlSG9zdChzdHIsIHN0YXJ0LCBlbmQsIGhvc3REZW5vdGVzU2xhc2gpO1xuICAgICAgICB2YXIgcHJvdG8gPSB0aGlzLl9wcm90b2NvbDtcbiAgICAgICAgaWYgKCF0aGlzLmhvc3RuYW1lICYmXG4gICAgICAgICAgICAodGhpcy5zbGFzaGVzIHx8IChwcm90byAmJiAhc2xhc2hQcm90b2NvbHNbcHJvdG9dKSkpIHtcbiAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBcIlwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0IDw9IGVuZCkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChzdGFydCk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlUGF0aChzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlUXVlcnkoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlUGF0aChzdHIsIHN0YXJ0LCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgeyAvL0ZvciBqYXZhc2NyaXB0IHRoZSBwYXRobmFtZSBpcyBqdXN0IHRoZSByZXN0IG9mIGl0XG4gICAgICAgICAgICB0aGlzLnBhdGhuYW1lID0gc3RyLnNsaWNlKHN0YXJ0LCBlbmQgKyAxICk7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIGlmICghdGhpcy5wYXRobmFtZSAmJiB0aGlzLmhvc3RuYW1lICYmXG4gICAgICAgIHRoaXMuX3NsYXNoUHJvdG9jb2xzW3RoaXMuX3Byb3RvY29sXSkge1xuICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgfVxuXG4gICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgdmFyIHNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgICAgICBpZiAoc2VhcmNoID09IG51bGwpIHtcbiAgICAgICAgICAgIHNlYXJjaCA9IHRoaXMuc2VhcmNoID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLmNoYXJDb2RlQXQoMCkgPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgc2VhcmNoID0gc2VhcmNoLnNsaWNlKDEpO1xuICAgICAgICB9XG4gICAgICAgIC8vVGhpcyBjYWxscyBhIHNldHRlciBmdW5jdGlvbiwgdGhlcmUgaXMgbm8gLnF1ZXJ5IGRhdGEgcHJvcGVydHlcbiAgICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHNlYXJjaCk7XG4gICAgfVxufTtcblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24gVXJsJHJlc29sdmUocmVsYXRpdmUpIHtcbiAgICByZXR1cm4gdGhpcy5yZXNvbHZlT2JqZWN0KFVybC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpKS5mb3JtYXQoKTtcbn07XG5cblVybC5wcm90b3R5cGUuZm9ybWF0ID0gZnVuY3Rpb24gVXJsJGZvcm1hdCgpIHtcbiAgICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCBcIlwiO1xuXG4gICAgaWYgKGF1dGgpIHtcbiAgICAgICAgYXV0aCA9IGVuY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICAgICAgYXV0aCA9IGF1dGgucmVwbGFjZSgvJTNBL2ksIFwiOlwiKTtcbiAgICAgICAgYXV0aCArPSBcIkBcIjtcbiAgICB9XG5cbiAgICB2YXIgcHJvdG9jb2wgPSB0aGlzLnByb3RvY29sIHx8IFwiXCI7XG4gICAgdmFyIHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCBcIlwiO1xuICAgIHZhciBoYXNoID0gdGhpcy5oYXNoIHx8IFwiXCI7XG4gICAgdmFyIHNlYXJjaCA9IHRoaXMuc2VhcmNoIHx8IFwiXCI7XG4gICAgdmFyIHF1ZXJ5ID0gXCJcIjtcbiAgICB2YXIgaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lIHx8IFwiXCI7XG4gICAgdmFyIHBvcnQgPSB0aGlzLnBvcnQgfHwgXCJcIjtcbiAgICB2YXIgaG9zdCA9IGZhbHNlO1xuICAgIHZhciBzY2hlbWUgPSBcIlwiO1xuXG4gICAgLy9DYWNoZSB0aGUgcmVzdWx0IG9mIHRoZSBnZXR0ZXIgZnVuY3Rpb25cbiAgICB2YXIgcSA9IHRoaXMucXVlcnk7XG4gICAgaWYgKHEgJiYgdHlwZW9mIHEgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkocSk7XG4gICAgfVxuXG4gICAgaWYgKCFzZWFyY2gpIHtcbiAgICAgICAgc2VhcmNoID0gcXVlcnkgPyBcIj9cIiArIHF1ZXJ5IDogXCJcIjtcbiAgICB9XG5cbiAgICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuY2hhckNvZGVBdChwcm90b2NvbC5sZW5ndGggLSAxKSAhPT0gMHgzQSAvKic6JyovKVxuICAgICAgICBwcm90b2NvbCArPSBcIjpcIjtcblxuICAgIGlmICh0aGlzLmhvc3QpIHtcbiAgICAgICAgaG9zdCA9IGF1dGggKyB0aGlzLmhvc3Q7XG4gICAgfVxuICAgIGVsc2UgaWYgKGhvc3RuYW1lKSB7XG4gICAgICAgIHZhciBpcDYgPSBob3N0bmFtZS5pbmRleE9mKFwiOlwiKSA+IC0xO1xuICAgICAgICBpZiAoaXA2KSBob3N0bmFtZSA9IFwiW1wiICsgaG9zdG5hbWUgKyBcIl1cIjtcbiAgICAgICAgaG9zdCA9IGF1dGggKyBob3N0bmFtZSArIChwb3J0ID8gXCI6XCIgKyBwb3J0IDogXCJcIik7XG4gICAgfVxuXG4gICAgdmFyIHNsYXNoZXMgPSB0aGlzLnNsYXNoZXMgfHxcbiAgICAgICAgKCghcHJvdG9jb2wgfHxcbiAgICAgICAgc2xhc2hQcm90b2NvbHNbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSk7XG5cblxuICAgIGlmIChwcm90b2NvbCkgc2NoZW1lID0gcHJvdG9jb2wgKyAoc2xhc2hlcyA/IFwiLy9cIiA6IFwiXCIpO1xuICAgIGVsc2UgaWYgKHNsYXNoZXMpIHNjaGVtZSA9IFwiLy9cIjtcblxuICAgIGlmIChzbGFzaGVzICYmIHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgIT09IDB4MkYgLyonLycqLykge1xuICAgICAgICBwYXRobmFtZSA9IFwiL1wiICsgcGF0aG5hbWU7XG4gICAgfVxuICAgIGVsc2UgaWYgKCFzbGFzaGVzICYmIHBhdGhuYW1lID09PSBcIi9cIikge1xuICAgICAgICBwYXRobmFtZSA9IFwiXCI7XG4gICAgfVxuICAgIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJDb2RlQXQoMCkgIT09IDB4M0YgLyonPycqLylcbiAgICAgICAgc2VhcmNoID0gXCI/XCIgKyBzZWFyY2g7XG4gICAgaWYgKGhhc2ggJiYgaGFzaC5jaGFyQ29kZUF0KDApICE9PSAweDIzIC8qJyMnKi8pXG4gICAgICAgIGhhc2ggPSBcIiNcIiArIGhhc2g7XG5cbiAgICBwYXRobmFtZSA9IGVzY2FwZVBhdGhOYW1lKHBhdGhuYW1lKTtcbiAgICBzZWFyY2ggPSBlc2NhcGVTZWFyY2goc2VhcmNoKTtcblxuICAgIHJldHVybiBzY2hlbWUgKyAoaG9zdCA9PT0gZmFsc2UgPyBcIlwiIDogaG9zdCkgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG59O1xuXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbiBVcmwkcmVzb2x2ZU9iamVjdChyZWxhdGl2ZSkge1xuICAgIGlmICh0eXBlb2YgcmVsYXRpdmUgPT09IFwic3RyaW5nXCIpXG4gICAgICAgIHJlbGF0aXZlID0gVXJsLnBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSk7XG5cbiAgICB2YXIgcmVzdWx0ID0gdGhpcy5fY2xvbmUoKTtcblxuICAgIC8vIGhhc2ggaXMgYWx3YXlzIG92ZXJyaWRkZW4sIG5vIG1hdHRlciB3aGF0LlxuICAgIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICAgIHJlc3VsdC5oYXNoID0gcmVsYXRpdmUuaGFzaDtcblxuICAgIC8vIGlmIHRoZSByZWxhdGl2ZSB1cmwgaXMgZW1wdHksIHRoZW4gdGhlcmVcInMgbm90aGluZyBsZWZ0IHRvIGRvIGhlcmUuXG4gICAgaWYgKCFyZWxhdGl2ZS5ocmVmKSB7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gICAgaWYgKHJlbGF0aXZlLnNsYXNoZXMgJiYgIXJlbGF0aXZlLl9wcm90b2NvbCkge1xuICAgICAgICByZWxhdGl2ZS5fY29weVByb3BzVG8ocmVzdWx0LCB0cnVlKTtcblxuICAgICAgICBpZiAoc2xhc2hQcm90b2NvbHNbcmVzdWx0Ll9wcm90b2NvbF0gJiZcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0bmFtZSAmJiAhcmVzdWx0LnBhdGhuYW1lKSB7XG4gICAgICAgICAgICByZXN1bHQucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmIChyZWxhdGl2ZS5fcHJvdG9jb2wgJiYgcmVsYXRpdmUuX3Byb3RvY29sICE9PSByZXN1bHQuX3Byb3RvY29sKSB7XG4gICAgICAgIC8vIGlmIGl0XCJzIGEga25vd24gdXJsIHByb3RvY29sLCB0aGVuIGNoYW5naW5nXG4gICAgICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgICAgICAvLyBmaXJzdCwgaWYgaXRcInMgbm90IGZpbGU6LCB0aGVuIHdlIE1VU1QgaGF2ZSBhIGhvc3QsXG4gICAgICAgIC8vIGFuZCBpZiB0aGVyZSB3YXMgYSBwYXRoXG4gICAgICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAgICAgLy8gaWYgaXQgaXMgZmlsZTosIHRoZW4gdGhlIGhvc3QgaXMgZHJvcHBlZCxcbiAgICAgICAgLy8gYmVjYXVzZSB0aGF0XCJzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgICAgICAvLyBhbnl0aGluZyBlbHNlIGlzIGFzc3VtZWQgdG8gYmUgYWJzb2x1dGUuXG4gICAgICAgIGlmICghc2xhc2hQcm90b2NvbHNbcmVsYXRpdmUuX3Byb3RvY29sXSkge1xuICAgICAgICAgICAgcmVsYXRpdmUuX2NvcHlQcm9wc1RvKHJlc3VsdCwgZmFsc2UpO1xuICAgICAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHQuX3Byb3RvY29sID0gcmVsYXRpdmUuX3Byb3RvY29sO1xuICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3QgJiYgcmVsYXRpdmUuX3Byb3RvY29sICE9PSBcImphdmFzY3JpcHRcIikge1xuICAgICAgICAgICAgdmFyIHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgfHwgXCJcIikuc3BsaXQoXCIvXCIpO1xuICAgICAgICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSkpO1xuICAgICAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0KSByZWxhdGl2ZS5ob3N0ID0gXCJcIjtcbiAgICAgICAgICAgIGlmICghcmVsYXRpdmUuaG9zdG5hbWUpIHJlbGF0aXZlLmhvc3RuYW1lID0gXCJcIjtcbiAgICAgICAgICAgIGlmIChyZWxQYXRoWzBdICE9PSBcIlwiKSByZWxQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgICAgICAgICBpZiAocmVsUGF0aC5sZW5ndGggPCAyKSByZWxQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgICAgICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxQYXRoLmpvaW4oXCIvXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsYXRpdmUucGF0aG5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgXCJcIjtcbiAgICAgICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0O1xuICAgICAgICByZXN1bHQuX3BvcnQgPSByZWxhdGl2ZS5fcG9ydDtcbiAgICAgICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHZhciBpc1NvdXJjZUFicyA9XG4gICAgICAgIChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDB4MkYgLyonLycqLyk7XG4gICAgdmFyIGlzUmVsQWJzID0gKFxuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCB8fFxuICAgICAgICAgICAgKHJlbGF0aXZlLnBhdGhuYW1lICYmXG4gICAgICAgICAgICByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pXG4gICAgICAgICk7XG4gICAgdmFyIG11c3RFbmRBYnMgPSAoaXNSZWxBYnMgfHwgaXNTb3VyY2VBYnMgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIChyZXN1bHQuaG9zdCAmJiByZWxhdGl2ZS5wYXRobmFtZSkpO1xuXG4gICAgdmFyIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzO1xuXG4gICAgdmFyIHNyY1BhdGggPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KFwiL1wiKSB8fCBbXTtcbiAgICB2YXIgcmVsUGF0aCA9IHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLnNwbGl0KFwiL1wiKSB8fCBbXTtcbiAgICB2YXIgcHN5Y2hvdGljID0gcmVzdWx0Ll9wcm90b2NvbCAmJiAhc2xhc2hQcm90b2NvbHNbcmVzdWx0Ll9wcm90b2NvbF07XG5cbiAgICAvLyBpZiB0aGUgdXJsIGlzIGEgbm9uLXNsYXNoZWQgdXJsLCB0aGVuIHJlbGF0aXZlXG4gICAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAgIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgICAvLyByZXN1bHQucHJvdG9jb2wgaGFzIGFscmVhZHkgYmVlbiBzZXQgYnkgbm93LlxuICAgIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gXCJcIjtcbiAgICAgICAgcmVzdWx0Ll9wb3J0ID0gLTE7XG4gICAgICAgIGlmIChyZXN1bHQuaG9zdCkge1xuICAgICAgICAgICAgaWYgKHNyY1BhdGhbMF0gPT09IFwiXCIpIHNyY1BhdGhbMF0gPSByZXN1bHQuaG9zdDtcbiAgICAgICAgICAgIGVsc2Ugc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTtcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuaG9zdCA9IFwiXCI7XG4gICAgICAgIGlmIChyZWxhdGl2ZS5fcHJvdG9jb2wpIHtcbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lID0gXCJcIjtcbiAgICAgICAgICAgIHJlbGF0aXZlLl9wb3J0ID0gLTE7XG4gICAgICAgICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICAgICAgICAgIGlmIChyZWxQYXRoWzBdID09PSBcIlwiKSByZWxQYXRoWzBdID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgICAgICAgICBlbHNlIHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgPSBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSBcIlwiIHx8IHNyY1BhdGhbMF0gPT09IFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChpc1JlbEFicykge1xuICAgICAgICAvLyBpdFwicyBhYnNvbHV0ZS5cbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0ID9cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgOiByZXN1bHQuaG9zdDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgP1xuICAgICAgICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgOiByZXN1bHQuaG9zdG5hbWU7XG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgICAgIHNyY1BhdGggPSByZWxQYXRoO1xuICAgICAgICAvLyBmYWxsIHRocm91Z2ggdG8gdGhlIGRvdC1oYW5kbGluZyBiZWxvdy5cbiAgICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgICAgIC8vIGl0XCJzIHJlbGF0aXZlXG4gICAgICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgICAgICBpZiAoIXNyY1BhdGgpIHNyY1BhdGggPSBbXTtcbiAgICAgICAgc3JjUGF0aC5wb3AoKTtcbiAgICAgICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIH0gZWxzZSBpZiAocmVsYXRpdmUuc2VhcmNoKSB7XG4gICAgICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAgICAgLy8gbGlrZSBocmVmPVwiP2Zvb1wiLlxuICAgICAgICAvLyBQdXQgdGhpcyBhZnRlciB0aGUgb3RoZXIgdHdvIGNhc2VzIGJlY2F1c2UgaXQgc2ltcGxpZmllcyB0aGUgYm9vbGVhbnNcbiAgICAgICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLnNoaWZ0KCk7XG4gICAgICAgICAgICAvL29jY2F0aW9uYWx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgICAgICAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgICAgICAgLy91cmwucmVzb2x2ZU9iamVjdChcIm1haWx0bzpsb2NhbDFAZG9tYWluMVwiLCBcImxvY2FsMkBkb21haW4yXCIpXG4gICAgICAgICAgICB2YXIgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoXCJAXCIpID4gMCA/XG4gICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpIDogZmFsc2U7XG4gICAgICAgICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgICAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgICAgIC8vIHdlXCJ2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgICAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIC8vIGhvd2V2ZXIsIGlmIGl0IGVuZHMgaW4gYW55dGhpbmcgZWxzZSBub24tc2xhc2h5LFxuICAgIC8vIHRoZW4gaXQgbXVzdCBOT1QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gICAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgICB2YXIgaGFzVHJhaWxpbmdTbGFzaCA9IChcbiAgICAgICAgKHJlc3VsdC5ob3N0IHx8IHJlbGF0aXZlLmhvc3QpICYmIChsYXN0ID09PSBcIi5cIiB8fCBsYXN0ID09PSBcIi4uXCIpIHx8XG4gICAgICAgIGxhc3QgPT09IFwiXCIpO1xuXG4gICAgLy8gc3RyaXAgc2luZ2xlIGRvdHMsIHJlc29sdmUgZG91YmxlIGRvdHMgdG8gcGFyZW50IGRpclxuICAgIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gICAgdmFyIHVwID0gMDtcbiAgICBmb3IgKHZhciBpID0gc3JjUGF0aC5sZW5ndGg7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgICAgICBpZiAobGFzdCA9PSBcIi5cIikge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gXCIuLlwiKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHVwKys7XG4gICAgICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgdXAtLTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgICBpZiAoIW11c3RFbmRBYnMgJiYgIXJlbW92ZUFsbERvdHMpIHtcbiAgICAgICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnVuc2hpZnQoXCIuLlwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtdXN0RW5kQWJzICYmIHNyY1BhdGhbMF0gIT09IFwiXCIgJiZcbiAgICAgICAgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckNvZGVBdCgwKSAhPT0gMHgyRiAvKicvJyovKSkge1xuICAgICAgICBzcmNQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKGhhc1RyYWlsaW5nU2xhc2ggJiYgKHNyY1BhdGguam9pbihcIi9cIikuc3Vic3RyKC0xKSAhPT0gXCIvXCIpKSB7XG4gICAgICAgIHNyY1BhdGgucHVzaChcIlwiKTtcbiAgICB9XG5cbiAgICB2YXIgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09IFwiXCIgfHxcbiAgICAgICAgKHNyY1BhdGhbMF0gJiYgc3JjUGF0aFswXS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pO1xuXG4gICAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gaXNBYnNvbHV0ZSA/IFwiXCIgOlxuICAgICAgICAgICAgc3JjUGF0aC5sZW5ndGggPyBzcmNQYXRoLnNoaWZ0KCkgOiBcIlwiO1xuICAgICAgICAvL29jY2F0aW9uYWx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoXCJtYWlsdG86bG9jYWwxQGRvbWFpbjFcIiwgXCJsb2NhbDJAZG9tYWluMlwiKVxuICAgICAgICB2YXIgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoXCJAXCIpID4gMCA/XG4gICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdChcIkBcIikgOiBmYWxzZTtcbiAgICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyB8fCAocmVzdWx0Lmhvc3QgJiYgc3JjUGF0aC5sZW5ndGgpO1xuXG4gICAgaWYgKG11c3RFbmRBYnMgJiYgIWlzQWJzb2x1dGUpIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIHJlc3VsdC5wYXRobmFtZSA9IHNyY1BhdGgubGVuZ3RoID09PSAwID8gbnVsbCA6IHNyY1BhdGguam9pbihcIi9cIik7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG52YXIgcHVueWNvZGUgPSByZXF1aXJlKFwicHVueWNvZGVcIik7XG5VcmwucHJvdG90eXBlLl9ob3N0SWRuYSA9IGZ1bmN0aW9uIFVybCRfaG9zdElkbmEoaG9zdG5hbWUpIHtcbiAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55IGNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgLy8gSXQgb25seSBjb252ZXJ0cyB0aGUgcGFydCBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgIC8vIGhhcyBub24gQVNDSUkgY2hhcmFjdGVycy4gSS5lLiBpdCBkb3NlbnQgbWF0dGVyIGlmXG4gICAgLy8geW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0IGFscmVhZHkgaXMgaW4gQVNDSUkuXG4gICAgdmFyIGRvbWFpbkFycmF5ID0gaG9zdG5hbWUuc3BsaXQoXCIuXCIpO1xuICAgIHZhciBuZXdPdXQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRvbWFpbkFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBzID0gZG9tYWluQXJyYXlbaV07XG4gICAgICAgIG5ld091dC5wdXNoKHMubWF0Y2goL1teQS1aYS16MC05Xy1dLykgP1xuICAgICAgICAgICAgXCJ4bi0tXCIgKyBwdW55Y29kZS5lbmNvZGUocykgOiBzKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld091dC5qb2luKFwiLlwiKTtcbn07XG5cbnZhciBlc2NhcGVQYXRoTmFtZSA9IFVybC5wcm90b3R5cGUuX2VzY2FwZVBhdGhOYW1lID1cbmZ1bmN0aW9uIFVybCRfZXNjYXBlUGF0aE5hbWUocGF0aG5hbWUpIHtcbiAgICBpZiAoIWNvbnRhaW5zQ2hhcmFjdGVyMihwYXRobmFtZSwgMHgyMyAvKicjJyovLCAweDNGIC8qJz8nKi8pKSB7XG4gICAgICAgIHJldHVybiBwYXRobmFtZTtcbiAgICB9XG4gICAgLy9Bdm9pZCBjbG9zdXJlIGNyZWF0aW9uIHRvIGtlZXAgdGhpcyBpbmxpbmFibGVcbiAgICByZXR1cm4gX2VzY2FwZVBhdGgocGF0aG5hbWUpO1xufTtcblxudmFyIGVzY2FwZVNlYXJjaCA9IFVybC5wcm90b3R5cGUuX2VzY2FwZVNlYXJjaCA9XG5mdW5jdGlvbiBVcmwkX2VzY2FwZVNlYXJjaChzZWFyY2gpIHtcbiAgICBpZiAoIWNvbnRhaW5zQ2hhcmFjdGVyMihzZWFyY2gsIDB4MjMgLyonIycqLywgLTEpKSByZXR1cm4gc2VhcmNoO1xuICAgIC8vQXZvaWQgY2xvc3VyZSBjcmVhdGlvbiB0byBrZWVwIHRoaXMgaW5saW5hYmxlXG4gICAgcmV0dXJuIF9lc2NhcGVTZWFyY2goc2VhcmNoKTtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUHJvdG9jb2wgPSBmdW5jdGlvbiBVcmwkX3BhcnNlUHJvdG9jb2woc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIGRvTG93ZXJDYXNlID0gZmFsc2U7XG4gICAgdmFyIHByb3RvY29sQ2hhcmFjdGVycyA9IHRoaXMuX3Byb3RvY29sQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgdmFyIHByb3RvY29sID0gc3RyLnNsaWNlKHN0YXJ0LCBpKTtcbiAgICAgICAgICAgIGlmIChkb0xvd2VyQ2FzZSkgcHJvdG9jb2wgPSBwcm90b2NvbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBwcm90b2NvbDtcbiAgICAgICAgICAgIHJldHVybiBpICsgMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChwcm90b2NvbENoYXJhY3RlcnNbY2hdID09PSAxKSB7XG4gICAgICAgICAgICBpZiAoY2ggPCAweDYxIC8qJ2EnKi8pXG4gICAgICAgICAgICAgICAgZG9Mb3dlckNhc2UgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgICAgICB9XG5cbiAgICB9XG4gICAgcmV0dXJuIHN0YXJ0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VBdXRoID0gZnVuY3Rpb24gVXJsJF9wYXJzZUF1dGgoc3RyLCBzdGFydCwgZW5kLCBkZWNvZGUpIHtcbiAgICB2YXIgYXV0aCA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSk7XG4gICAgaWYgKGRlY29kZSkge1xuICAgICAgICBhdXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KGF1dGgpO1xuICAgIH1cbiAgICB0aGlzLmF1dGggPSBhdXRoO1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQb3J0ID0gZnVuY3Rpb24gVXJsJF9wYXJzZVBvcnQoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgLy9JbnRlcm5hbCBmb3JtYXQgaXMgaW50ZWdlciBmb3IgbW9yZSBlZmZpY2llbnQgcGFyc2luZ1xuICAgIC8vYW5kIGZvciBlZmZpY2llbnQgdHJpbW1pbmcgb2YgbGVhZGluZyB6ZXJvc1xuICAgIHZhciBwb3J0ID0gMDtcbiAgICAvL0Rpc3Rpbmd1aXNoIGJldHdlZW4gOjAgYW5kIDogKG5vIHBvcnQgbnVtYmVyIGF0IGFsbClcbiAgICB2YXIgaGFkQ2hhcnMgPSBmYWxzZTtcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoMHgzMCAvKicwJyovIDw9IGNoICYmIGNoIDw9IDB4MzkgLyonOScqLykge1xuICAgICAgICAgICAgcG9ydCA9ICgxMCAqIHBvcnQpICsgKGNoIC0gMHgzMCAvKicwJyovKTtcbiAgICAgICAgICAgIGhhZENoYXJzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGJyZWFrO1xuXG4gICAgfVxuICAgIGlmIChwb3J0ID09PSAwICYmICFoYWRDaGFycykge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICB0aGlzLl9wb3J0ID0gcG9ydDtcbiAgICByZXR1cm4gaSAtIHN0YXJ0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VIb3N0ID1cbmZ1bmN0aW9uIFVybCRfcGFyc2VIb3N0KHN0ciwgc3RhcnQsIGVuZCwgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgICB2YXIgaG9zdEVuZGluZ0NoYXJhY3RlcnMgPSB0aGlzLl9ob3N0RW5kaW5nQ2hhcmFjdGVycztcbiAgICBpZiAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpID09PSAweDJGIC8qJy8nKi8gJiZcbiAgICAgICAgc3RyLmNoYXJDb2RlQXQoc3RhcnQgKyAxKSA9PT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgIHRoaXMuc2xhc2hlcyA9IHRydWU7XG5cbiAgICAgICAgLy9UaGUgc3RyaW5nIHN0YXJ0cyB3aXRoIC8vXG4gICAgICAgIGlmIChzdGFydCA9PT0gMCkge1xuICAgICAgICAgICAgLy9UaGUgc3RyaW5nIGlzIGp1c3QgXCIvL1wiXG4gICAgICAgICAgICBpZiAoZW5kIDwgMikgcmV0dXJuIHN0YXJ0O1xuICAgICAgICAgICAgLy9JZiBzbGFzaGVzIGRvIG5vdCBkZW5vdGUgaG9zdCBhbmQgdGhlcmUgaXMgbm8gYXV0aCxcbiAgICAgICAgICAgIC8vdGhlcmUgaXMgbm8gaG9zdCB3aGVuIHRoZSBzdHJpbmcgc3RhcnRzIHdpdGggLy9cbiAgICAgICAgICAgIHZhciBoYXNBdXRoID1cbiAgICAgICAgICAgICAgICBjb250YWluc0NoYXJhY3RlcihzdHIsIDB4NDAgLyonQCcqLywgMiwgaG9zdEVuZGluZ0NoYXJhY3RlcnMpO1xuICAgICAgICAgICAgaWYgKCFoYXNBdXRoICYmICFzbGFzaGVzRGVub3RlSG9zdCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vVGhlcmUgaXMgYSBob3N0IHRoYXQgc3RhcnRzIGFmdGVyIHRoZSAvL1xuICAgICAgICBzdGFydCArPSAyO1xuICAgIH1cbiAgICAvL0lmIHRoZXJlIGlzIG5vIHNsYXNoZXMsIHRoZXJlIGlzIG5vIGhvc3RuYW1lIGlmXG4gICAgLy8xLiB0aGVyZSB3YXMgbm8gcHJvdG9jb2wgYXQgYWxsXG4gICAgZWxzZSBpZiAoIXRoaXMuX3Byb3RvY29sIHx8XG4gICAgICAgIC8vMi4gdGhlcmUgd2FzIGEgcHJvdG9jb2wgdGhhdCByZXF1aXJlcyBzbGFzaGVzXG4gICAgICAgIC8vZS5nLiBpbiAnaHR0cDphc2QnICdhc2QnIGlzIG5vdCBhIGhvc3RuYW1lXG4gICAgICAgIHNsYXNoUHJvdG9jb2xzW3RoaXMuX3Byb3RvY29sXVxuICAgICkge1xuICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgfVxuXG4gICAgdmFyIGRvTG93ZXJDYXNlID0gZmFsc2U7XG4gICAgdmFyIGlkbmEgPSBmYWxzZTtcbiAgICB2YXIgaG9zdE5hbWVTdGFydCA9IHN0YXJ0O1xuICAgIHZhciBob3N0TmFtZUVuZCA9IGVuZDtcbiAgICB2YXIgbGFzdENoID0gLTE7XG4gICAgdmFyIHBvcnRMZW5ndGggPSAwO1xuICAgIHZhciBjaGFyc0FmdGVyRG90ID0gMDtcbiAgICB2YXIgYXV0aE5lZWRzRGVjb2RpbmcgPSBmYWxzZTtcblxuICAgIHZhciBqID0gLTE7XG5cbiAgICAvL0ZpbmQgdGhlIGxhc3Qgb2NjdXJyZW5jZSBvZiBhbiBALXNpZ24gdW50aWwgaG9zdGVuZGluZyBjaGFyYWN0ZXIgaXMgbWV0XG4gICAgLy9hbHNvIG1hcmsgaWYgZGVjb2RpbmcgaXMgbmVlZGVkIGZvciB0aGUgYXV0aCBwb3J0aW9uXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHg0MCAvKidAJyovKSB7XG4gICAgICAgICAgICBqID0gaTtcbiAgICAgICAgfVxuICAgICAgICAvL1RoaXMgY2hlY2sgaXMgdmVyeSwgdmVyeSBjaGVhcC4gVW5uZWVkZWQgZGVjb2RlVVJJQ29tcG9uZW50IGlzIHZlcnlcbiAgICAgICAgLy92ZXJ5IGV4cGVuc2l2ZVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgyNSAvKiclJyovKSB7XG4gICAgICAgICAgICBhdXRoTmVlZHNEZWNvZGluZyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaG9zdEVuZGluZ0NoYXJhY3RlcnNbY2hdID09PSAxKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vQC1zaWduIHdhcyBmb3VuZCBhdCBpbmRleCBqLCBldmVyeXRoaW5nIHRvIHRoZSBsZWZ0IGZyb20gaXRcbiAgICAvL2lzIGF1dGggcGFydFxuICAgIGlmIChqID4gLTEpIHtcbiAgICAgICAgdGhpcy5fcGFyc2VBdXRoKHN0ciwgc3RhcnQsIGogLSAxLCBhdXRoTmVlZHNEZWNvZGluZyk7XG4gICAgICAgIC8vaG9zdG5hbWUgc3RhcnRzIGFmdGVyIHRoZSBsYXN0IEAtc2lnblxuICAgICAgICBzdGFydCA9IGhvc3ROYW1lU3RhcnQgPSBqICsgMTtcbiAgICB9XG5cbiAgICAvL0hvc3QgbmFtZSBpcyBzdGFydGluZyB3aXRoIGEgW1xuICAgIGlmIChzdHIuY2hhckNvZGVBdChzdGFydCkgPT09IDB4NUIgLyonWycqLykge1xuICAgICAgICBmb3IgKHZhciBpID0gc3RhcnQgKyAxOyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICAgICAgLy9Bc3N1bWUgdmFsaWQgSVA2IGlzIGJldHdlZW4gdGhlIGJyYWNrZXRzXG4gICAgICAgICAgICBpZiAoY2ggPT09IDB4NUQgLyonXScqLykge1xuICAgICAgICAgICAgICAgIGlmIChzdHIuY2hhckNvZGVBdChpICsgMSkgPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgICAgICAgICBwb3J0TGVuZ3RoID0gdGhpcy5fcGFyc2VQb3J0KHN0ciwgaSArIDIsIGVuZCkgKyAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgaG9zdG5hbWUgPSBzdHIuc2xpY2Uoc3RhcnQgKyAxLCBpKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSBob3N0bmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzLmhvc3QgPSB0aGlzLl9wb3J0ID4gMFxuICAgICAgICAgICAgICAgICAgICA/IFwiW1wiICsgaG9zdG5hbWUgKyBcIl06XCIgKyB0aGlzLl9wb3J0XG4gICAgICAgICAgICAgICAgICAgIDogXCJbXCIgKyBob3N0bmFtZSArIFwiXVwiO1xuICAgICAgICAgICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgICAgICAgICByZXR1cm4gaSArIHBvcnRMZW5ndGggKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vRW1wdHkgaG9zdG5hbWUsIFsgc3RhcnRzIGEgcGF0aFxuICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIGlmIChjaGFyc0FmdGVyRG90ID4gNjIpIHtcbiAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBzdHIuc2xpY2Uoc3RhcnQsIGkpO1xuICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgIHBvcnRMZW5ndGggPSB0aGlzLl9wYXJzZVBvcnQoc3RyLCBpICsgMSwgZW5kKSArIDE7XG4gICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPCAweDYxIC8qJ2EnKi8pIHtcbiAgICAgICAgICAgIGlmIChjaCA9PT0gMHgyRSAvKicuJyovKSB7XG4gICAgICAgICAgICAgICAgLy9Ob2RlLmpzIGlnbm9yZXMgdGhpcyBlcnJvclxuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgaWYgKGxhc3RDaCA9PT0gRE9UIHx8IGxhc3RDaCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBjaGFyc0FmdGVyRG90ID0gLTE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICgweDQxIC8qJ0EnKi8gPD0gY2ggJiYgY2ggPD0gMHg1QSAvKidaJyovKSB7XG4gICAgICAgICAgICAgICAgZG9Mb3dlckNhc2UgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoIShjaCA9PT0gMHgyRCAvKictJyovIHx8IGNoID09PSAweDVGIC8qJ18nKi8gfHxcbiAgICAgICAgICAgICAgICAoMHgzMCAvKicwJyovIDw9IGNoICYmIGNoIDw9IDB4MzkgLyonOScqLykpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhvc3RFbmRpbmdDaGFyYWN0ZXJzW2NoXSA9PT0gMCAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnNbY2hdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPj0gMHg3QiAvKid7JyovKSB7XG4gICAgICAgICAgICBpZiAoY2ggPD0gMHg3RSAvKid+JyovKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX25vUHJlcGVuZFNsYXNoSG9zdEVuZGVyc1tjaF0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlkbmEgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGxhc3RDaCA9IGNoO1xuICAgICAgICBjaGFyc0FmdGVyRG90Kys7XG4gICAgfVxuXG4gICAgLy9Ob2RlLmpzIGlnbm9yZXMgdGhpcyBlcnJvclxuICAgIC8qXG4gICAgaWYgKGxhc3RDaCA9PT0gRE9UKSB7XG4gICAgICAgIGhvc3ROYW1lRW5kLS07XG4gICAgfVxuICAgICovXG5cbiAgICBpZiAoaG9zdE5hbWVFbmQgKyAxICE9PSBzdGFydCAmJlxuICAgICAgICBob3N0TmFtZUVuZCAtIGhvc3ROYW1lU3RhcnQgPD0gMjU2KSB7XG4gICAgICAgIHZhciBob3N0bmFtZSA9IHN0ci5zbGljZShob3N0TmFtZVN0YXJ0LCBob3N0TmFtZUVuZCArIDEpO1xuICAgICAgICBpZiAoZG9Mb3dlckNhc2UpIGhvc3RuYW1lID0gaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgaWYgKGlkbmEpIGhvc3RuYW1lID0gdGhpcy5faG9zdElkbmEoaG9zdG5hbWUpO1xuICAgICAgICB0aGlzLmhvc3RuYW1lID0gaG9zdG5hbWU7XG4gICAgICAgIHRoaXMuaG9zdCA9IHRoaXMuX3BvcnQgPiAwID8gaG9zdG5hbWUgKyBcIjpcIiArIHRoaXMuX3BvcnQgOiBob3N0bmFtZTtcbiAgICB9XG5cbiAgICByZXR1cm4gaG9zdE5hbWVFbmQgKyAxICsgcG9ydExlbmd0aDtcblxufTtcblxuVXJsLnByb3RvdHlwZS5fY29weVByb3BzVG8gPSBmdW5jdGlvbiBVcmwkX2NvcHlQcm9wc1RvKGlucHV0LCBub1Byb3RvY29sKSB7XG4gICAgaWYgKCFub1Byb3RvY29sKSB7XG4gICAgICAgIGlucHV0Ll9wcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sO1xuICAgIH1cbiAgICBpbnB1dC5faHJlZiA9IHRoaXMuX2hyZWY7XG4gICAgaW5wdXQuX3BvcnQgPSB0aGlzLl9wb3J0O1xuICAgIGlucHV0Ll9wcmVwZW5kU2xhc2ggPSB0aGlzLl9wcmVwZW5kU2xhc2g7XG4gICAgaW5wdXQuYXV0aCA9IHRoaXMuYXV0aDtcbiAgICBpbnB1dC5zbGFzaGVzID0gdGhpcy5zbGFzaGVzO1xuICAgIGlucHV0Lmhvc3QgPSB0aGlzLmhvc3Q7XG4gICAgaW5wdXQuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuICAgIGlucHV0Lmhhc2ggPSB0aGlzLmhhc2g7XG4gICAgaW5wdXQuc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgaW5wdXQucGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lO1xufTtcblxuVXJsLnByb3RvdHlwZS5fY2xvbmUgPSBmdW5jdGlvbiBVcmwkX2Nsb25lKCkge1xuICAgIHZhciByZXQgPSBuZXcgVXJsKCk7XG4gICAgcmV0Ll9wcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sO1xuICAgIHJldC5faHJlZiA9IHRoaXMuX2hyZWY7XG4gICAgcmV0Ll9wb3J0ID0gdGhpcy5fcG9ydDtcbiAgICByZXQuX3ByZXBlbmRTbGFzaCA9IHRoaXMuX3ByZXBlbmRTbGFzaDtcbiAgICByZXQuYXV0aCA9IHRoaXMuYXV0aDtcbiAgICByZXQuc2xhc2hlcyA9IHRoaXMuc2xhc2hlcztcbiAgICByZXQuaG9zdCA9IHRoaXMuaG9zdDtcbiAgICByZXQuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuICAgIHJldC5oYXNoID0gdGhpcy5oYXNoO1xuICAgIHJldC5zZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICByZXQucGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9nZXRDb21wb25lbnRFc2NhcGVkID1cbmZ1bmN0aW9uIFVybCRfZ2V0Q29tcG9uZW50RXNjYXBlZChzdHIsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgY3VyID0gc3RhcnQ7XG4gICAgdmFyIGkgPSBzdGFydDtcbiAgICB2YXIgcmV0ID0gXCJcIjtcbiAgICB2YXIgYXV0b0VzY2FwZU1hcCA9IHRoaXMuX2F1dG9Fc2NhcGVNYXA7XG4gICAgZm9yICg7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIHZhciBlc2NhcGVkID0gYXV0b0VzY2FwZU1hcFtjaF07XG5cbiAgICAgICAgaWYgKGVzY2FwZWQgIT09IFwiXCIpIHtcbiAgICAgICAgICAgIGlmIChjdXIgPCBpKSByZXQgKz0gc3RyLnNsaWNlKGN1ciwgaSk7XG4gICAgICAgICAgICByZXQgKz0gZXNjYXBlZDtcbiAgICAgICAgICAgIGN1ciA9IGkgKyAxO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChjdXIgPCBpICsgMSkgcmV0ICs9IHN0ci5zbGljZShjdXIsIGkpO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVBhdGggPVxuZnVuY3Rpb24gVXJsJF9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIHBhdGhTdGFydCA9IHN0YXJ0O1xuICAgIHZhciBwYXRoRW5kID0gZW5kO1xuICAgIHZhciBlc2NhcGUgPSBmYWxzZTtcbiAgICB2YXIgYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSB0aGlzLl9hdXRvRXNjYXBlQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgICAgaWYgKGNoID09PSAweDIzIC8qJyMnKi8pIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlSGFzaChzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBwYXRoRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVF1ZXJ5KHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHBhdGhFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFlc2NhcGUgJiYgYXV0b0VzY2FwZUNoYXJhY3RlcnNbY2hdID09PSAxKSB7XG4gICAgICAgICAgICBlc2NhcGUgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBhdGhTdGFydCA+IHBhdGhFbmQpIHtcbiAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHBhdGg7XG4gICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBwYXRoID0gdGhpcy5fZ2V0Q29tcG9uZW50RXNjYXBlZChzdHIsIHBhdGhTdGFydCwgcGF0aEVuZCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBwYXRoID0gc3RyLnNsaWNlKHBhdGhTdGFydCwgcGF0aEVuZCArIDEpO1xuICAgIH1cbiAgICB0aGlzLnBhdGhuYW1lID0gdGhpcy5fcHJlcGVuZFNsYXNoID8gXCIvXCIgKyBwYXRoIDogcGF0aDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUXVlcnkgPSBmdW5jdGlvbiBVcmwkX3BhcnNlUXVlcnkoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIHF1ZXJ5U3RhcnQgPSBzdGFydDtcbiAgICB2YXIgcXVlcnlFbmQgPSBlbmQ7XG4gICAgdmFyIGVzY2FwZSA9IGZhbHNlO1xuICAgIHZhciBhdXRvRXNjYXBlQ2hhcmFjdGVycyA9IHRoaXMuX2F1dG9Fc2NhcGVDaGFyYWN0ZXJzO1xuXG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcXVlcnlFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFlc2NhcGUgJiYgYXV0b0VzY2FwZUNoYXJhY3RlcnNbY2hdID09PSAxKSB7XG4gICAgICAgICAgICBlc2NhcGUgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHF1ZXJ5U3RhcnQgPiBxdWVyeUVuZCkge1xuICAgICAgICB0aGlzLnNlYXJjaCA9IFwiXCI7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgcXVlcnk7XG4gICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBxdWVyeSA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBxdWVyeVN0YXJ0LCBxdWVyeUVuZCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHN0ci5zbGljZShxdWVyeVN0YXJ0LCBxdWVyeUVuZCArIDEpO1xuICAgIH1cbiAgICB0aGlzLnNlYXJjaCA9IHF1ZXJ5O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VIYXNoID0gZnVuY3Rpb24gVXJsJF9wYXJzZUhhc2goc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgaWYgKHN0YXJ0ID4gZW5kKSB7XG4gICAgICAgIHRoaXMuaGFzaCA9IFwiXCI7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5oYXNoID0gdGhpcy5fZ2V0Q29tcG9uZW50RXNjYXBlZChzdHIsIHN0YXJ0LCBlbmQpO1xufTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicG9ydFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BvcnQgPj0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIChcIlwiICsgdGhpcy5fcG9ydCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5fcG9ydCA9IC0xO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fcG9ydCA9IHBhcnNlSW50KHYsIDEwKTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJxdWVyeVwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcnk7XG4gICAgICAgIGlmIChxdWVyeSAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gcXVlcnk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuXG4gICAgICAgIGlmIChzZWFyY2gpIHtcbiAgICAgICAgICAgIGlmIChzZWFyY2guY2hhckNvZGVBdCgwKSA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICAgICAgc2VhcmNoID0gc2VhcmNoLnNsaWNlKDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNlYXJjaCAhPT0gXCJcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3F1ZXJ5ID0gc2VhcmNoO1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWFyY2g7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNlYXJjaDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICB0aGlzLl9xdWVyeSA9IHY7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInBhdGhcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBwID0gdGhpcy5wYXRobmFtZSB8fCBcIlwiO1xuICAgICAgICB2YXIgcyA9IHRoaXMuc2VhcmNoIHx8IFwiXCI7XG4gICAgICAgIGlmIChwIHx8IHMpIHtcbiAgICAgICAgICAgIHJldHVybiBwICsgcztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gKHAgPT0gbnVsbCAmJiBzKSA/IChcIi9cIiArIHMpIDogbnVsbDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24oKSB7fVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInByb3RvY29sXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcHJvdG8gPSB0aGlzLl9wcm90b2NvbDtcbiAgICAgICAgcmV0dXJuIHByb3RvID8gcHJvdG8gKyBcIjpcIiA6IHByb3RvO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIGVuZCA9IHYubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIGlmICh2LmNoYXJDb2RlQXQoZW5kKSA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSB2LnNsaWNlKDAsIGVuZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHY7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodiA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLl9wcm90b2NvbCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwiaHJlZlwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGhyZWYgPSB0aGlzLl9ocmVmO1xuICAgICAgICBpZiAoIWhyZWYpIHtcbiAgICAgICAgICAgIGhyZWYgPSB0aGlzLl9ocmVmID0gdGhpcy5mb3JtYXQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaHJlZjtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICB0aGlzLl9ocmVmID0gdjtcbiAgICB9XG59KTtcblxuVXJsLnBhcnNlID0gZnVuY3Rpb24gVXJsJFBhcnNlKHN0ciwgcGFyc2VRdWVyeVN0cmluZywgaG9zdERlbm90ZXNTbGFzaCkge1xuICAgIGlmIChzdHIgaW5zdGFuY2VvZiBVcmwpIHJldHVybiBzdHI7XG4gICAgdmFyIHJldCA9IG5ldyBVcmwoKTtcbiAgICByZXQucGFyc2Uoc3RyLCAhIXBhcnNlUXVlcnlTdHJpbmcsICEhaG9zdERlbm90ZXNTbGFzaCk7XG4gICAgcmV0dXJuIHJldDtcbn07XG5cblVybC5mb3JtYXQgPSBmdW5jdGlvbiBVcmwkRm9ybWF0KG9iaikge1xuICAgIGlmICh0eXBlb2Ygb2JqID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIG9iaiA9IFVybC5wYXJzZShvYmopO1xuICAgIH1cbiAgICBpZiAoIShvYmogaW5zdGFuY2VvZiBVcmwpKSB7XG4gICAgICAgIHJldHVybiBVcmwucHJvdG90eXBlLmZvcm1hdC5jYWxsKG9iaik7XG4gICAgfVxuICAgIHJldHVybiBvYmouZm9ybWF0KCk7XG59O1xuXG5VcmwucmVzb2x2ZSA9IGZ1bmN0aW9uIFVybCRSZXNvbHZlKHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgICByZXR1cm4gVXJsLnBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmUocmVsYXRpdmUpO1xufTtcblxuVXJsLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbiBVcmwkUmVzb2x2ZU9iamVjdChzb3VyY2UsIHJlbGF0aXZlKSB7XG4gICAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcbiAgICByZXR1cm4gVXJsLnBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufTtcblxuZnVuY3Rpb24gX2VzY2FwZVBhdGgocGF0aG5hbWUpIHtcbiAgICByZXR1cm4gcGF0aG5hbWUucmVwbGFjZSgvWz8jXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KG1hdGNoKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gX2VzY2FwZVNlYXJjaChzZWFyY2gpIHtcbiAgICByZXR1cm4gc2VhcmNoLnJlcGxhY2UoLyMvZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gICAgfSk7XG59XG5cbi8vU2VhcmNoIGBjaGFyMWAgKGludGVnZXIgY29kZSBmb3IgYSBjaGFyYWN0ZXIpIGluIGBzdHJpbmdgXG4vL3N0YXJ0aW5nIGZyb20gYGZyb21JbmRleGAgYW5kIGVuZGluZyBhdCBgc3RyaW5nLmxlbmd0aCAtIDFgXG4vL29yIHdoZW4gYSBzdG9wIGNoYXJhY3RlciBpcyBmb3VuZFxuZnVuY3Rpb24gY29udGFpbnNDaGFyYWN0ZXIoc3RyaW5nLCBjaGFyMSwgZnJvbUluZGV4LCBzdG9wQ2hhcmFjdGVyVGFibGUpIHtcbiAgICB2YXIgbGVuID0gc3RyaW5nLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gZnJvbUluZGV4OyBpIDwgbGVuOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSBjaGFyMSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc3RvcENoYXJhY3RlclRhYmxlW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy9TZWUgaWYgYGNoYXIxYCBvciBgY2hhcjJgIChpbnRlZ2VyIGNvZGVzIGZvciBjaGFyYWN0ZXJzKVxuLy9pcyBjb250YWluZWQgaW4gYHN0cmluZ2BcbmZ1bmN0aW9uIGNvbnRhaW5zQ2hhcmFjdGVyMihzdHJpbmcsIGNoYXIxLCBjaGFyMikge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyaW5nLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGlmIChjaCA9PT0gY2hhcjEgfHwgY2ggPT09IGNoYXIyKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vL01ha2VzIGFuIGFycmF5IG9mIDEyOCB1aW50OCdzIHdoaWNoIHJlcHJlc2VudCBib29sZWFuIHZhbHVlcy5cbi8vU3BlYyBpcyBhbiBhcnJheSBvZiBhc2NpaSBjb2RlIHBvaW50cyBvciBhc2NpaSBjb2RlIHBvaW50IHJhbmdlc1xuLy9yYW5nZXMgYXJlIGV4cHJlc3NlZCBhcyBbc3RhcnQsIGVuZF1cblxuLy9DcmVhdGUgYSB0YWJsZSB3aXRoIHRoZSBjaGFyYWN0ZXJzIDB4MzAtMHgzOSAoZGVjaW1hbHMgJzAnIC0gJzknKSBhbmRcbi8vMHg3QSAobG93ZXJjYXNlbGV0dGVyICd6JykgYXMgYHRydWVgOlxuLy9cbi8vdmFyIGEgPSBtYWtlQXNjaWlUYWJsZShbWzB4MzAsIDB4MzldLCAweDdBXSk7XG4vL2FbMHgzMF07IC8vMVxuLy9hWzB4MTVdOyAvLzBcbi8vYVsweDM1XTsgLy8xXG5mdW5jdGlvbiBtYWtlQXNjaWlUYWJsZShzcGVjKSB7XG4gICAgdmFyIHJldCA9IG5ldyBVaW50OEFycmF5KDEyOCk7XG4gICAgc3BlYy5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0pe1xuICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgIHJldFtpdGVtXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgc3RhcnQgPSBpdGVtWzBdO1xuICAgICAgICAgICAgdmFyIGVuZCA9IGl0ZW1bMV07XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gc3RhcnQ7IGogPD0gZW5kOyArK2opIHtcbiAgICAgICAgICAgICAgICByZXRbal0gPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmV0O1xufVxuXG5cbnZhciBhdXRvRXNjYXBlID0gW1wiPFwiLCBcIj5cIiwgXCJcXFwiXCIsIFwiYFwiLCBcIiBcIiwgXCJcXHJcIiwgXCJcXG5cIixcbiAgICBcIlxcdFwiLCBcIntcIiwgXCJ9XCIsIFwifFwiLCBcIlxcXFxcIiwgXCJeXCIsIFwiYFwiLCBcIidcIl07XG5cbnZhciBhdXRvRXNjYXBlTWFwID0gbmV3IEFycmF5KDEyOCk7XG5cblxuXG5mb3IgKHZhciBpID0gMCwgbGVuID0gYXV0b0VzY2FwZU1hcC5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIGF1dG9Fc2NhcGVNYXBbaV0gPSBcIlwiO1xufVxuXG5mb3IgKHZhciBpID0gMCwgbGVuID0gYXV0b0VzY2FwZS5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIHZhciBjID0gYXV0b0VzY2FwZVtpXTtcbiAgICB2YXIgZXNjID0gZW5jb2RlVVJJQ29tcG9uZW50KGMpO1xuICAgIGlmIChlc2MgPT09IGMpIHtcbiAgICAgICAgZXNjID0gZXNjYXBlKGMpO1xuICAgIH1cbiAgICBhdXRvRXNjYXBlTWFwW2MuY2hhckNvZGVBdCgwKV0gPSBlc2M7XG59XG5cblxudmFyIHNsYXNoUHJvdG9jb2xzID0gVXJsLnByb3RvdHlwZS5fc2xhc2hQcm90b2NvbHMgPSB7XG4gICAgaHR0cDogdHJ1ZSxcbiAgICBodHRwczogdHJ1ZSxcbiAgICBnb3BoZXI6IHRydWUsXG4gICAgZmlsZTogdHJ1ZSxcbiAgICBmdHA6IHRydWUsXG5cbiAgICBcImh0dHA6XCI6IHRydWUsXG4gICAgXCJodHRwczpcIjogdHJ1ZSxcbiAgICBcImdvcGhlcjpcIjogdHJ1ZSxcbiAgICBcImZpbGU6XCI6IHRydWUsXG4gICAgXCJmdHA6XCI6IHRydWVcbn07XG5cbi8vT3B0aW1pemUgYmFjayBmcm9tIG5vcm1hbGl6ZWQgb2JqZWN0IGNhdXNlZCBieSBub24taWRlbnRpZmllciBrZXlzXG5mdW5jdGlvbiBmKCl7fVxuZi5wcm90b3R5cGUgPSBzbGFzaFByb3RvY29scztcblxuVXJsLnByb3RvdHlwZS5fcHJvdG9jb2xDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoW1xuICAgIFsweDYxIC8qJ2EnKi8sIDB4N0EgLyoneicqL10sXG4gICAgWzB4NDEgLyonQScqLywgMHg1QSAvKidaJyovXSxcbiAgICAweDJFIC8qJy4nKi8sIDB4MkIgLyonKycqLywgMHgyRCAvKictJyovXG5dKTtcblxuVXJsLnByb3RvdHlwZS5faG9zdEVuZGluZ0NoYXJhY3RlcnMgPSBtYWtlQXNjaWlUYWJsZShbXG4gICAgMHgyMyAvKicjJyovLCAweDNGIC8qJz8nKi8sIDB4MkYgLyonLycqL1xuXSk7XG5cblVybC5wcm90b3R5cGUuX2F1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoXG4gICAgYXV0b0VzY2FwZS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICByZXR1cm4gdi5jaGFyQ29kZUF0KDApO1xuICAgIH0pXG4pO1xuXG4vL0lmIHRoZXNlIGNoYXJhY3RlcnMgZW5kIGEgaG9zdCBuYW1lLCB0aGUgcGF0aCB3aWxsIG5vdCBiZSBwcmVwZW5kZWQgYSAvXG5VcmwucHJvdG90eXBlLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnMgPSBtYWtlQXNjaWlUYWJsZShcbiAgICBbXG4gICAgICAgIFwiPFwiLCBcIj5cIiwgXCInXCIsIFwiYFwiLCBcIiBcIiwgXCJcXHJcIixcbiAgICAgICAgXCJcXG5cIiwgXCJcXHRcIiwgXCJ7XCIsIFwifVwiLCBcInxcIiwgXCJcXFxcXCIsXG4gICAgICAgIFwiXlwiLCBcImBcIiwgXCJcXFwiXCIsIFwiJVwiLCBcIjtcIlxuICAgIF0ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgcmV0dXJuIHYuY2hhckNvZGVBdCgwKTtcbiAgICB9KVxuKTtcblxuVXJsLnByb3RvdHlwZS5fYXV0b0VzY2FwZU1hcCA9IGF1dG9Fc2NhcGVNYXA7XG5cbm1vZHVsZS5leHBvcnRzID0gVXJsO1xuXG5VcmwucmVwbGFjZSA9IGZ1bmN0aW9uIFVybCRSZXBsYWNlKCkge1xuICAgIHJlcXVpcmUuY2FjaGVbXCJ1cmxcIl0gPSB7XG4gICAgICAgIGV4cG9ydHM6IFVybFxuICAgIH07XG59O1xuIiwidmFyIG5vdyA9IHJlcXVpcmUoJ3BlcmZvcm1hbmNlLW5vdycpXG4gICwgZ2xvYmFsID0gdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyB7fSA6IHdpbmRvd1xuICAsIHZlbmRvcnMgPSBbJ21veicsICd3ZWJraXQnXVxuICAsIHN1ZmZpeCA9ICdBbmltYXRpb25GcmFtZSdcbiAgLCByYWYgPSBnbG9iYWxbJ3JlcXVlc3QnICsgc3VmZml4XVxuICAsIGNhZiA9IGdsb2JhbFsnY2FuY2VsJyArIHN1ZmZpeF0gfHwgZ2xvYmFsWydjYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBpc05hdGl2ZSA9IHRydWVcblxuZm9yKHZhciBpID0gMDsgaSA8IHZlbmRvcnMubGVuZ3RoICYmICFyYWY7IGkrKykge1xuICByYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgY2FmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsJyArIHN1ZmZpeF1cbiAgICAgIHx8IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxufVxuXG4vLyBTb21lIHZlcnNpb25zIG9mIEZGIGhhdmUgckFGIGJ1dCBub3QgY0FGXG5pZighcmFmIHx8ICFjYWYpIHtcbiAgaXNOYXRpdmUgPSBmYWxzZVxuXG4gIHZhciBsYXN0ID0gMFxuICAgICwgaWQgPSAwXG4gICAgLCBxdWV1ZSA9IFtdXG4gICAgLCBmcmFtZUR1cmF0aW9uID0gMTAwMCAvIDYwXG5cbiAgcmFmID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICBpZihxdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHZhciBfbm93ID0gbm93KClcbiAgICAgICAgLCBuZXh0ID0gTWF0aC5tYXgoMCwgZnJhbWVEdXJhdGlvbiAtIChfbm93IC0gbGFzdCkpXG4gICAgICBsYXN0ID0gbmV4dCArIF9ub3dcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjcCA9IHF1ZXVlLnNsaWNlKDApXG4gICAgICAgIC8vIENsZWFyIHF1ZXVlIGhlcmUgdG8gcHJldmVudFxuICAgICAgICAvLyBjYWxsYmFja3MgZnJvbSBhcHBlbmRpbmcgbGlzdGVuZXJzXG4gICAgICAgIC8vIHRvIHRoZSBjdXJyZW50IGZyYW1lJ3MgcXVldWVcbiAgICAgICAgcXVldWUubGVuZ3RoID0gMFxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY3AubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZighY3BbaV0uY2FuY2VsbGVkKSB7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgIGNwW2ldLmNhbGxiYWNrKGxhc3QpXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSwgTWF0aC5yb3VuZChuZXh0KSlcbiAgICB9XG4gICAgcXVldWUucHVzaCh7XG4gICAgICBoYW5kbGU6ICsraWQsXG4gICAgICBjYWxsYmFjazogY2FsbGJhY2ssXG4gICAgICBjYW5jZWxsZWQ6IGZhbHNlXG4gICAgfSlcbiAgICByZXR1cm4gaWRcbiAgfVxuXG4gIGNhZiA9IGZ1bmN0aW9uKGhhbmRsZSkge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYocXVldWVbaV0uaGFuZGxlID09PSBoYW5kbGUpIHtcbiAgICAgICAgcXVldWVbaV0uY2FuY2VsbGVkID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIFdyYXAgaW4gYSBuZXcgZnVuY3Rpb24gdG8gcHJldmVudFxuICAvLyBgY2FuY2VsYCBwb3RlbnRpYWxseSBiZWluZyBhc3NpZ25lZFxuICAvLyB0byB0aGUgbmF0aXZlIHJBRiBmdW5jdGlvblxuICBpZighaXNOYXRpdmUpIHtcbiAgICByZXR1cm4gcmFmLmNhbGwoZ2xvYmFsLCBmbilcbiAgfVxuICByZXR1cm4gcmFmLmNhbGwoZ2xvYmFsLCBmdW5jdGlvbigpIHtcbiAgICB0cnl7XG4gICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgfSBjYXRjaChlKSB7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgfVxuICB9KVxufVxubW9kdWxlLmV4cG9ydHMuY2FuY2VsID0gZnVuY3Rpb24oKSB7XG4gIGNhZi5hcHBseShnbG9iYWwsIGFyZ3VtZW50cylcbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNi4zXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBnZXROYW5vU2Vjb25kcywgaHJ0aW1lLCBsb2FkVGltZTtcblxuICBpZiAoKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwZXJmb3JtYW5jZSAhPT0gbnVsbCkgJiYgcGVyZm9ybWFuY2Uubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB9O1xuICB9IGVsc2UgaWYgKCh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzICE9PSBudWxsKSAmJiBwcm9jZXNzLmhydGltZSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gKGdldE5hbm9TZWNvbmRzKCkgLSBsb2FkVGltZSkgLyAxZTY7XG4gICAgfTtcbiAgICBocnRpbWUgPSBwcm9jZXNzLmhydGltZTtcbiAgICBnZXROYW5vU2Vjb25kcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGhyO1xuICAgICAgaHIgPSBocnRpbWUoKTtcbiAgICAgIHJldHVybiBoclswXSAqIDFlOSArIGhyWzFdO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBnZXROYW5vU2Vjb25kcygpO1xuICB9IGVsc2UgaWYgKERhdGUubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBEYXRlLm5vdygpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IERhdGUubm93KCk7XG4gIH0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfVxuXG59KS5jYWxsKHRoaXMpO1xuXG4vKlxuLy9AIHNvdXJjZU1hcHBpbmdVUkw9cGVyZm9ybWFuY2Utbm93Lm1hcFxuKi9cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbiFmdW5jdGlvbihlKXtpZihcIm9iamVjdFwiPT10eXBlb2YgZXhwb3J0cyltb2R1bGUuZXhwb3J0cz1lKCk7ZWxzZSBpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQpZGVmaW5lKGUpO2Vsc2V7dmFyIGY7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdz9mPXdpbmRvdzpcInVuZGVmaW5lZFwiIT10eXBlb2YgZ2xvYmFsP2Y9Z2xvYmFsOlwidW5kZWZpbmVkXCIhPXR5cGVvZiBzZWxmJiYoZj1zZWxmKSxmLnJvdXRlcz1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblxudmFyIGxvY2FsUm91dGVzID0gW107XG5cblxuLyoqXG4gKiBDb252ZXJ0IHBhdGggdG8gcm91dGUgb2JqZWN0XG4gKlxuICogQSBzdHJpbmcgb3IgUmVnRXhwIHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aWxsIHJldHVybiB7IHJlLCBzcmMsIGtleXN9IG9ialxuICpcbiAqIEBwYXJhbSAge1N0cmluZyAvIFJlZ0V4cH0gcGF0aFxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZSA9IGZ1bmN0aW9uKHBhdGgpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG5cbiAgdmFyIHNyYywgcmUsIGtleXMgPSBbXTtcblxuICBpZihwYXRoIGluc3RhbmNlb2YgUmVnRXhwKXtcbiAgICByZSA9IHBhdGg7XG4gICAgc3JjID0gcGF0aC50b1N0cmluZygpO1xuICB9ZWxzZXtcbiAgICByZSA9IHBhdGhUb1JlZ0V4cChwYXRoLCBrZXlzKTtcbiAgICBzcmMgPSBwYXRoO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgXHQgcmU6IHJlLFxuICBcdCBzcmM6IHBhdGgudG9TdHJpbmcoKSxcbiAgXHQga2V5czoga2V5c1xuICB9XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSB0aGUgZ2l2ZW4gcGF0aCBzdHJpbmcsXG4gKiByZXR1cm5pbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKlxuICogQW4gZW1wdHkgYXJyYXkgc2hvdWxkIGJlIHBhc3NlZCxcbiAqIHdoaWNoIHdpbGwgY29udGFpbiB0aGUgcGxhY2Vob2xkZXJcbiAqIGtleSBuYW1lcy4gRm9yIGV4YW1wbGUgXCIvdXNlci86aWRcIiB3aWxsXG4gKiB0aGVuIGNvbnRhaW4gW1wiaWRcIl0uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBwYXRoXG4gKiBAcGFyYW0gIHtBcnJheX0ga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG52YXIgcGF0aFRvUmVnRXhwID0gZnVuY3Rpb24gKHBhdGgsIGtleXMpIHtcblx0cGF0aCA9IHBhdGhcblx0XHQuY29uY2F0KCcvPycpXG5cdFx0LnJlcGxhY2UoL1xcL1xcKC9nLCAnKD86LycpXG5cdFx0LnJlcGxhY2UoLyhcXC8pPyhcXC4pPzooXFx3KykoPzooXFwoLio/XFwpKSk/KFxcPyk/fFxcKi9nLCBmdW5jdGlvbihfLCBzbGFzaCwgZm9ybWF0LCBrZXksIGNhcHR1cmUsIG9wdGlvbmFsKXtcblx0XHRcdGlmIChfID09PSBcIipcIil7XG5cdFx0XHRcdGtleXMucHVzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4gXztcblx0XHRcdH1cblxuXHRcdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0XHRzbGFzaCA9IHNsYXNoIHx8ICcnO1xuXHRcdFx0cmV0dXJuICcnXG5cdFx0XHRcdCsgKG9wdGlvbmFsID8gJycgOiBzbGFzaClcblx0XHRcdFx0KyAnKD86J1xuXHRcdFx0XHQrIChvcHRpb25hbCA/IHNsYXNoIDogJycpXG5cdFx0XHRcdCsgKGZvcm1hdCB8fCAnJykgKyAoY2FwdHVyZSB8fCAnKFteL10rPyknKSArICcpJ1xuXHRcdFx0XHQrIChvcHRpb25hbCB8fCAnJyk7XG5cdFx0fSlcblx0XHQucmVwbGFjZSgvKFtcXC8uXSkvZywgJ1xcXFwkMScpXG5cdFx0LnJlcGxhY2UoL1xcKi9nLCAnKC4qKScpO1xuXHRyZXR1cm4gbmV3IFJlZ0V4cCgnXicgKyBwYXRoICsgJyQnLCAnaScpO1xufTtcblxuLyoqXG4gKiBBdHRlbXB0IHRvIG1hdGNoIHRoZSBnaXZlbiByZXF1ZXN0IHRvXG4gKiBvbmUgb2YgdGhlIHJvdXRlcy4gV2hlbiBzdWNjZXNzZnVsXG4gKiBhICB7Zm4sIHBhcmFtcywgc3BsYXRzfSBvYmogaXMgcmV0dXJuZWRcbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gcm91dGVzXG4gKiBAcGFyYW0gIHtTdHJpbmd9IHVyaVxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG52YXIgbWF0Y2ggPSBmdW5jdGlvbiAocm91dGVzLCB1cmksIHN0YXJ0QXQpIHtcblx0dmFyIGNhcHR1cmVzLCBpID0gc3RhcnRBdCB8fCAwO1xuXG5cdGZvciAodmFyIGxlbiA9IHJvdXRlcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuXHRcdHZhciByb3V0ZSA9IHJvdXRlc1tpXSxcblx0XHQgICAgcmUgPSByb3V0ZS5yZSxcblx0XHQgICAga2V5cyA9IHJvdXRlLmtleXMsXG5cdFx0ICAgIHNwbGF0cyA9IFtdLFxuXHRcdCAgICBwYXJhbXMgPSB7fTtcblxuXHRcdGlmIChjYXB0dXJlcyA9IHVyaS5tYXRjaChyZSkpIHtcblx0XHRcdGZvciAodmFyIGogPSAxLCBsZW4gPSBjYXB0dXJlcy5sZW5ndGg7IGogPCBsZW47ICsraikge1xuXHRcdFx0XHR2YXIga2V5ID0ga2V5c1tqLTFdLFxuXHRcdFx0XHRcdHZhbCA9IHR5cGVvZiBjYXB0dXJlc1tqXSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHRcdD8gdW5lc2NhcGUoY2FwdHVyZXNbal0pXG5cdFx0XHRcdFx0XHQ6IGNhcHR1cmVzW2pdO1xuXHRcdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdFx0cGFyYW1zW2tleV0gPSB2YWw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3BsYXRzLnB1c2godmFsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGFyYW1zOiBwYXJhbXMsXG5cdFx0XHRcdHNwbGF0czogc3BsYXRzLFxuXHRcdFx0XHRyb3V0ZTogcm91dGUuc3JjLFxuXHRcdFx0XHRuZXh0OiBpICsgMVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogRGVmYXVsdCBcIm5vcm1hbFwiIHJvdXRlciBjb25zdHJ1Y3Rvci5cbiAqIGFjY2VwdHMgcGF0aCwgZm4gdHVwbGVzIHZpYSBhZGRSb3V0ZVxuICogcmV0dXJucyB7Zm4sIHBhcmFtcywgc3BsYXRzLCByb3V0ZX1cbiAqICB2aWEgbWF0Y2hcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxudmFyIFJvdXRlciA9IGZ1bmN0aW9uKCl7XG4gIC8vdXNpbmcgJ25ldycgaXMgb3B0aW9uYWxcbiAgcmV0dXJuIHtcbiAgICByb3V0ZXM6IFtdLFxuICAgIHJvdXRlTWFwIDoge30sXG4gICAgYWRkUm91dGU6IGZ1bmN0aW9uKHBhdGgsIGZuKXtcbiAgICAgIGlmICghcGF0aCkgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgcmVxdWlyZXMgYSBwYXRoJyk7XG4gICAgICBpZiAoIWZuKSB0aHJvdyBuZXcgRXJyb3IoJyByb3V0ZSAnICsgcGF0aC50b1N0cmluZygpICsgJyByZXF1aXJlcyBhIGNhbGxiYWNrJyk7XG5cbiAgICAgIHZhciByb3V0ZSA9IFJvdXRlKHBhdGgpO1xuICAgICAgcm91dGUuZm4gPSBmbjtcblxuICAgICAgdGhpcy5yb3V0ZXMucHVzaChyb3V0ZSk7XG4gICAgICB0aGlzLnJvdXRlTWFwW3BhdGhdID0gZm47XG4gICAgfSxcblxuICAgIG1hdGNoOiBmdW5jdGlvbihwYXRobmFtZSwgc3RhcnRBdCl7XG4gICAgICB2YXIgcm91dGUgPSBtYXRjaCh0aGlzLnJvdXRlcywgcGF0aG5hbWUsIHN0YXJ0QXQpO1xuICAgICAgaWYocm91dGUpe1xuICAgICAgICByb3V0ZS5mbiA9IHRoaXMucm91dGVNYXBbcm91dGUucm91dGVdO1xuICAgICAgICByb3V0ZS5uZXh0ID0gdGhpcy5tYXRjaC5iaW5kKHRoaXMsIHBhdGhuYW1lLCByb3V0ZS5uZXh0KVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJvdXRlO1xuICAgIH1cbiAgfVxufTtcblxuUm91dGVyLlJvdXRlID0gUm91dGVcblJvdXRlci5wYXRoVG9SZWdFeHAgPSBwYXRoVG9SZWdFeHBcblJvdXRlci5tYXRjaCA9IG1hdGNoXG4vLyBiYWNrIGNvbXBhdFxuUm91dGVyLlJvdXRlciA9IFJvdXRlclxuXG5tb2R1bGUuZXhwb3J0cyA9IFJvdXRlclxuXG59LHt9XX0se30sWzFdKVxuKDEpXG59KTtcbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwidmFyIHdpbmRvdyA9IHJlcXVpcmUoXCJnbG9iYWwvd2luZG93XCIpXG52YXIgb25jZSA9IHJlcXVpcmUoXCJvbmNlXCIpXG52YXIgcGFyc2VIZWFkZXJzID0gcmVxdWlyZSgncGFyc2UtaGVhZGVycycpXG5cbnZhciBtZXNzYWdlcyA9IHtcbiAgICBcIjBcIjogXCJJbnRlcm5hbCBYTUxIdHRwUmVxdWVzdCBFcnJvclwiLFxuICAgIFwiNFwiOiBcIjR4eCBDbGllbnQgRXJyb3JcIixcbiAgICBcIjVcIjogXCI1eHggU2VydmVyIEVycm9yXCJcbn1cblxudmFyIFhIUiA9IHdpbmRvdy5YTUxIdHRwUmVxdWVzdCB8fCBub29wXG52YXIgWERSID0gXCJ3aXRoQ3JlZGVudGlhbHNcIiBpbiAobmV3IFhIUigpKSA/IFhIUiA6IHdpbmRvdy5YRG9tYWluUmVxdWVzdFxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVhIUlxuXG5mdW5jdGlvbiBjcmVhdGVYSFIob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHsgdXJpOiBvcHRpb25zIH1cbiAgICB9XG5cbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIGNhbGxiYWNrID0gb25jZShjYWxsYmFjaylcblxuICAgIHZhciB4aHIgPSBvcHRpb25zLnhociB8fCBudWxsXG5cbiAgICBpZiAoIXhocikge1xuICAgICAgICBpZiAob3B0aW9ucy5jb3JzIHx8IG9wdGlvbnMudXNlWERSKSB7XG4gICAgICAgICAgICB4aHIgPSBuZXcgWERSKClcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICB4aHIgPSBuZXcgWEhSKClcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciB1cmkgPSB4aHIudXJsID0gb3B0aW9ucy51cmkgfHwgb3B0aW9ucy51cmxcbiAgICB2YXIgbWV0aG9kID0geGhyLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8IFwiR0VUXCJcbiAgICB2YXIgYm9keSA9IG9wdGlvbnMuYm9keSB8fCBvcHRpb25zLmRhdGFcbiAgICB2YXIgaGVhZGVycyA9IHhoci5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9XG4gICAgdmFyIHN5bmMgPSAhIW9wdGlvbnMuc3luY1xuICAgIHZhciBpc0pzb24gPSBmYWxzZVxuICAgIHZhciBrZXlcbiAgICB2YXIgbG9hZCA9IG9wdGlvbnMucmVzcG9uc2UgPyBsb2FkUmVzcG9uc2UgOiBsb2FkWGhyXG5cbiAgICBpZiAoXCJqc29uXCIgaW4gb3B0aW9ucykge1xuICAgICAgICBpc0pzb24gPSB0cnVlXG4gICAgICAgIGhlYWRlcnNbXCJBY2NlcHRcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIlxuICAgICAgICBpZiAobWV0aG9kICE9PSBcIkdFVFwiICYmIG1ldGhvZCAhPT0gXCJIRUFEXCIpIHtcbiAgICAgICAgICAgIGhlYWRlcnNbXCJDb250ZW50LVR5cGVcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIlxuICAgICAgICAgICAgYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSByZWFkeXN0YXRlY2hhbmdlXG4gICAgeGhyLm9ubG9hZCA9IGxvYWRcbiAgICB4aHIub25lcnJvciA9IGVycm9yXG4gICAgLy8gSUU5IG11c3QgaGF2ZSBvbnByb2dyZXNzIGJlIHNldCB0byBhIHVuaXF1ZSBmdW5jdGlvbi5cbiAgICB4aHIub25wcm9ncmVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gSUUgbXVzdCBkaWVcbiAgICB9XG4gICAgLy8gaGF0ZSBJRVxuICAgIHhoci5vbnRpbWVvdXQgPSBub29wXG4gICAgeGhyLm9wZW4obWV0aG9kLCB1cmksICFzeW5jKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9iYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgaWYgKG9wdGlvbnMud2l0aENyZWRlbnRpYWxzIHx8IChvcHRpb25zLmNvcnMgJiYgb3B0aW9ucy53aXRoQ3JlZGVudGlhbHMgIT09IGZhbHNlKSkge1xuICAgICAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIENhbm5vdCBzZXQgdGltZW91dCB3aXRoIHN5bmMgcmVxdWVzdFxuICAgIGlmICghc3luYykge1xuICAgICAgICB4aHIudGltZW91dCA9IFwidGltZW91dFwiIGluIG9wdGlvbnMgPyBvcHRpb25zLnRpbWVvdXQgOiA1MDAwXG4gICAgfVxuXG4gICAgaWYgKHhoci5zZXRSZXF1ZXN0SGVhZGVyKSB7XG4gICAgICAgIGZvcihrZXkgaW4gaGVhZGVycyl7XG4gICAgICAgICAgICBpZihoZWFkZXJzLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgaGVhZGVyc1trZXldKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChvcHRpb25zLmhlYWRlcnMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSGVhZGVycyBjYW5ub3QgYmUgc2V0IG9uIGFuIFhEb21haW5SZXF1ZXN0IG9iamVjdFwiKVxuICAgIH1cblxuICAgIGlmIChcInJlc3BvbnNlVHlwZVwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9IG9wdGlvbnMucmVzcG9uc2VUeXBlXG4gICAgfVxuICAgIFxuICAgIGlmIChcImJlZm9yZVNlbmRcIiBpbiBvcHRpb25zICYmIFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5iZWZvcmVTZW5kID09PSBcImZ1bmN0aW9uXCJcbiAgICApIHtcbiAgICAgICAgb3B0aW9ucy5iZWZvcmVTZW5kKHhocilcbiAgICB9XG5cbiAgICB4aHIuc2VuZChib2R5KVxuXG4gICAgcmV0dXJuIHhoclxuXG4gICAgZnVuY3Rpb24gcmVhZHlzdGF0ZWNoYW5nZSgpIHtcbiAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICBsb2FkKClcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEJvZHkoKSB7XG4gICAgICAgIC8vIENocm9tZSB3aXRoIHJlcXVlc3RUeXBlPWJsb2IgdGhyb3dzIGVycm9ycyBhcnJvdW5kIHdoZW4gZXZlbiB0ZXN0aW5nIGFjY2VzcyB0byByZXNwb25zZVRleHRcbiAgICAgICAgdmFyIGJvZHkgPSBudWxsXG5cbiAgICAgICAgaWYgKHhoci5yZXNwb25zZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5yZXNwb25zZVxuICAgICAgICB9IGVsc2UgaWYgKHhoci5yZXNwb25zZVR5cGUgPT09ICd0ZXh0JyB8fCAheGhyLnJlc3BvbnNlVHlwZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5yZXNwb25zZVRleHQgfHwgeGhyLnJlc3BvbnNlWE1MXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNKc29uKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJvZHkgPSBKU09OLnBhcnNlKGJvZHkpXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJvZHlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTdGF0dXNDb2RlKCkge1xuICAgICAgICByZXR1cm4geGhyLnN0YXR1cyA9PT0gMTIyMyA/IDIwNCA6IHhoci5zdGF0dXNcbiAgICB9XG5cbiAgICAvLyBpZiB3ZSdyZSBnZXR0aW5nIGEgbm9uZS1vayBzdGF0dXNDb2RlLCBidWlsZCAmIHJldHVybiBhbiBlcnJvclxuICAgIGZ1bmN0aW9uIGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKSB7XG4gICAgICAgIHZhciBlcnJvciA9IG51bGxcbiAgICAgICAgaWYgKHN0YXR1cyA9PT0gMCB8fCAoc3RhdHVzID49IDQwMCAmJiBzdGF0dXMgPCA2MDApKSB7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9ICh0eXBlb2YgYm9keSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkgOiBmYWxzZSkgfHxcbiAgICAgICAgICAgICAgICBtZXNzYWdlc1tTdHJpbmcoc3RhdHVzKS5jaGFyQXQoMCldXG4gICAgICAgICAgICBlcnJvciA9IG5ldyBFcnJvcihtZXNzYWdlKVxuICAgICAgICAgICAgZXJyb3Iuc3RhdHVzQ29kZSA9IHN0YXR1c1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVycm9yXG4gICAgfVxuXG4gICAgLy8gd2lsbCBsb2FkIHRoZSBkYXRhICYgcHJvY2VzcyB0aGUgcmVzcG9uc2UgaW4gYSBzcGVjaWFsIHJlc3BvbnNlIG9iamVjdFxuICAgIGZ1bmN0aW9uIGxvYWRSZXNwb25zZSgpIHtcbiAgICAgICAgdmFyIHN0YXR1cyA9IGdldFN0YXR1c0NvZGUoKVxuICAgICAgICB2YXIgZXJyb3IgPSBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cylcbiAgICAgICAgdmFyIHJlc3BvbnNlID0ge1xuICAgICAgICAgICAgYm9keTogZ2V0Qm9keSgpLFxuICAgICAgICAgICAgc3RhdHVzQ29kZTogc3RhdHVzLFxuICAgICAgICAgICAgc3RhdHVzVGV4dDogeGhyLnN0YXR1c1RleHQsXG4gICAgICAgICAgICByYXc6IHhoclxuICAgICAgICB9XG4gICAgICAgIGlmKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMpeyAvL3JlbWVtYmVyIHhociBjYW4gaW4gZmFjdCBiZSBYRFIgZm9yIENPUlMgaW4gSUVcbiAgICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSBwYXJzZUhlYWRlcnMoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzcG9uc2UuaGVhZGVycyA9IHt9XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhlcnJvciwgcmVzcG9uc2UsIHJlc3BvbnNlLmJvZHkpXG4gICAgfVxuXG4gICAgLy8gd2lsbCBsb2FkIHRoZSBkYXRhIGFuZCBhZGQgc29tZSByZXNwb25zZSBwcm9wZXJ0aWVzIHRvIHRoZSBzb3VyY2UgeGhyXG4gICAgLy8gYW5kIHRoZW4gcmVzcG9uZCB3aXRoIHRoYXRcbiAgICBmdW5jdGlvbiBsb2FkWGhyKCkge1xuICAgICAgICB2YXIgc3RhdHVzID0gZ2V0U3RhdHVzQ29kZSgpXG4gICAgICAgIHZhciBlcnJvciA9IGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKVxuXG4gICAgICAgIHhoci5zdGF0dXMgPSB4aHIuc3RhdHVzQ29kZSA9IHN0YXR1c1xuICAgICAgICB4aHIuYm9keSA9IGdldEJvZHkoKVxuICAgICAgICB4aHIuaGVhZGVycyA9IHBhcnNlSGVhZGVycyh4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpXG5cbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIHhociwgeGhyLmJvZHkpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IoZXZ0KSB7XG4gICAgICAgIGNhbGxiYWNrKGV2dCwgeGhyKVxuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBub29wKCkge31cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbmlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbDtcbn0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIpe1xuICAgIG1vZHVsZS5leHBvcnRzID0gc2VsZjtcbn0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7fTtcbn1cblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IG9uY2Vcblxub25jZS5wcm90byA9IG9uY2UoZnVuY3Rpb24gKCkge1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRnVuY3Rpb24ucHJvdG90eXBlLCAnb25jZScsIHtcbiAgICB2YWx1ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIG9uY2UodGhpcylcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICB9KVxufSlcblxuZnVuY3Rpb24gb25jZSAoZm4pIHtcbiAgdmFyIGNhbGxlZCA9IGZhbHNlXG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGNhbGxlZCkgcmV0dXJuXG4gICAgY2FsbGVkID0gdHJ1ZVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gIH1cbn1cbiIsInZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnaXMtZnVuY3Rpb24nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZvckVhY2hcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ1xudmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eVxuXG5mdW5jdGlvbiBmb3JFYWNoKGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGl0ZXJhdG9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdpdGVyYXRvciBtdXN0IGJlIGEgZnVuY3Rpb24nKVxuICAgIH1cblxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMykge1xuICAgICAgICBjb250ZXh0ID0gdGhpc1xuICAgIH1cbiAgICBcbiAgICBpZiAodG9TdHJpbmcuY2FsbChsaXN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJylcbiAgICAgICAgZm9yRWFjaEFycmF5KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxuICAgIGVsc2UgaWYgKHR5cGVvZiBsaXN0ID09PSAnc3RyaW5nJylcbiAgICAgICAgZm9yRWFjaFN0cmluZyhsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlXG4gICAgICAgIGZvckVhY2hPYmplY3QobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG59XG5cbmZ1bmN0aW9uIGZvckVhY2hBcnJheShhcnJheSwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoYXJyYXksIGkpKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIGFycmF5W2ldLCBpLCBhcnJheSlcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaFN0cmluZyhzdHJpbmcsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAvLyBubyBzdWNoIHRoaW5nIGFzIGEgc3BhcnNlIHN0cmluZy5cbiAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBzdHJpbmcuY2hhckF0KGkpLCBpLCBzdHJpbmcpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoT2JqZWN0KG9iamVjdCwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBrIGluIG9iamVjdCkge1xuICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGspKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9iamVjdFtrXSwgaywgb2JqZWN0KVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBpc0Z1bmN0aW9uXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcblxuZnVuY3Rpb24gaXNGdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHN0cmluZyA9IHRvU3RyaW5nLmNhbGwoZm4pXG4gIHJldHVybiBzdHJpbmcgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXScgfHxcbiAgICAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nICYmIHN0cmluZyAhPT0gJ1tvYmplY3QgUmVnRXhwXScpIHx8XG4gICAgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmXG4gICAgIC8vIElFOCBhbmQgYmVsb3dcbiAgICAgKGZuID09PSB3aW5kb3cuc2V0VGltZW91dCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5hbGVydCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5jb25maXJtIHx8XG4gICAgICBmbiA9PT0gd2luZG93LnByb21wdCkpXG59O1xuIiwiXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB0cmltO1xuXG5mdW5jdGlvbiB0cmltKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyp8XFxzKiQvZywgJycpO1xufVxuXG5leHBvcnRzLmxlZnQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqLywgJycpO1xufTtcblxuZXhwb3J0cy5yaWdodCA9IGZ1bmN0aW9uKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG59O1xuIiwidmFyIHRyaW0gPSByZXF1aXJlKCd0cmltJylcbiAgLCBmb3JFYWNoID0gcmVxdWlyZSgnZm9yLWVhY2gnKVxuICAsIGlzQXJyYXkgPSBmdW5jdGlvbihhcmcpIHtcbiAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJnKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICB9XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGhlYWRlcnMpIHtcbiAgaWYgKCFoZWFkZXJzKVxuICAgIHJldHVybiB7fVxuXG4gIHZhciByZXN1bHQgPSB7fVxuXG4gIGZvckVhY2goXG4gICAgICB0cmltKGhlYWRlcnMpLnNwbGl0KCdcXG4nKVxuICAgICwgZnVuY3Rpb24gKHJvdykge1xuICAgICAgICB2YXIgaW5kZXggPSByb3cuaW5kZXhPZignOicpXG4gICAgICAgICAgLCBrZXkgPSB0cmltKHJvdy5zbGljZSgwLCBpbmRleCkpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAsIHZhbHVlID0gdHJpbShyb3cuc2xpY2UoaW5kZXggKyAxKSlcblxuICAgICAgICBpZiAodHlwZW9mKHJlc3VsdFtrZXldKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHZhbHVlXG4gICAgICAgIH0gZWxzZSBpZiAoaXNBcnJheShyZXN1bHRba2V5XSkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XS5wdXNoKHZhbHVlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gWyByZXN1bHRba2V5XSwgdmFsdWUgXVxuICAgICAgICB9XG4gICAgICB9XG4gIClcblxuICByZXR1cm4gcmVzdWx0XG59Il19
