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
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n<p>Taunus exposes <em>three different public APIs</em>, and there&#39;s also <strong>plugins to integrate Taunus and an HTTP server</strong>. This document covers all three APIs extensively. If you&#39;re concerned about the inner workings of Taunus, please refer to the <a href=\"/getting-started\">Getting Started</a> guide. This document aims to only cover how the public interface affects application state, but <strong>doesn&#39;t delve into implementation details</strong>.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li>A <a href=\"#server-side-api\">server-side API</a> that deals with server-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Its <a href=\"#the-options-object\"><code>options</code></a> argument<ul>\n<li><a href=\"#-options-layout-\"><code>layout</code></a></li>\n<li><a href=\"#-options-routes-\"><code>routes</code></a></li>\n<li><a href=\"#-options-getdefaultviewmodel-\"><code>getDefaultViewModel</code></a></li>\n<li><a href=\"#-options-plaintext-\"><code>plaintext</code></a></li>\n<li><a href=\"#-options-resolvers-\"><code>resolvers</code></a></li>\n</ul>\n</li>\n<li>Its <a href=\"#-addroute-definition-\"><code>addRoute</code></a> argument</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render</code></a> method</li>\n<li>The <a href=\"#-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel</code></a> method</li>\n</ul>\n</li>\n<li>A <a href=\"#http-framework-plugins\">suite of plugins</a> can integrate Taunus and an HTTP server<ul>\n<li>Using <a href=\"#using-taunus-express-\"><code>taunus-express</code></a> for <a href=\"http://expressjs.com\">Express</a></li>\n<li>Using <a href=\"#using-taunus-hapi-\"><code>taunus-hapi</code></a> for <a href=\"http://hapijs.com\">Hapi</a></li>\n</ul>\n</li>\n<li>A <a href=\"#command-line-interface\">CLI that produces a wiring module</a> for the client-side<ul>\n<li>The <a href=\"#-output-\"><code>--output</code></a> flag</li>\n<li>The <a href=\"#-watch-\"><code>--watch</code></a> flag</li>\n<li>The <a href=\"#-transform-module-\"><code>--transform &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-standalone-\"><code>--standalone</code></a> flag</li>\n</ul>\n</li>\n<li>A <a href=\"#client-side-api\">client-side API</a> that deals with client-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Using the <a href=\"#using-the-auto-strategy\"><code>auto</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-inline-strategy\"><code>inline</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-manual-strategy\"><code>manual</code></a> strategy</li>\n<li><a href=\"#caching\">Caching</a></li>\n<li><a href=\"#prefetching\">Prefetching</a></li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a> method</li>\n<li>The <a href=\"#-taunus-once-type-fn-\"><code>taunus.once</code></a> method</li>\n<li>The <a href=\"#-taunus-off-type-fn-\"><code>taunus.off</code></a> method</li>\n<li>The <a href=\"#-taunus-intercept-action-fn-\"><code>taunus.intercept</code></a> method</li>\n<li>The <a href=\"#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a> method</li>\n<li>The <a href=\"#-taunus-navigate-url-options-\"><code>taunus.navigate</code></a> method</li>\n<li>The <a href=\"#-taunus-route-url-\"><code>taunus.route</code></a> method<ul>\n<li>The <a href=\"#-taunus-route-equals-route-route-\"><code>taunus.route.equals</code></a> method</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-state-\"><code>taunus.state</code></a> property</li>\n</ul>\n</li>\n<li>The <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a> manifest</li>\n</ul>\n<h1 id=\"server-side-api\">Server-side API</h1>\n<p>The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, <em>including client-side rendering</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-addroute-options-\"><code>taunus.mount(addRoute, options?)</code></h2>\n<p>Mounts Taunus on top of a server-side router, by registering each route in <code>options.routes</code> with the <code>addRoute</code> method.</p>\n<blockquote>\n<p>Note that most of the time, <strong>this method shouldn&#39;t be invoked directly</strong>, but rather through one of the <a href=\"#http-framework-plugins\">HTTP framework plugins</a> presented below.</p>\n</blockquote>\n<p>Here&#39;s an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the <code>route</code> and <code>action</code> properties.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\ntaunus.mount(addRoute, {\n  routes: [{ route: &#39;/&#39;, action: &#39;home/index&#39; }]\n});\n\nfunction addRoute (definition) {\n  app.get(definition.route, definition.action);\n}\n</code></pre>\n<p>Let&#39;s go over the options you can pass to <code>taunus.mount</code> first.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"the-options-object\">The <code>options?</code> object</h4>\n<p>There&#39;s a few options that can be passed to the server-side mountpoint. You&#39;re probably going to be passing these to your <a href=\"#http-framework-plugins\">HTTP framework plugin</a>, rather than using <code>taunus.mount</code> directly.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-layout-\"><code>options.layout?</code></h6>\n<p>The <code>layout</code> property is expected to have the <code>function(data)</code> signature. It&#39;ll be invoked whenever a full HTML document needs to be rendered, and a <code>data</code> object will be passed to it. That object will contain everything you&#39;ve set as the view model, plus a <code>partial</code> property containing the raw HTML of the rendered partial view. Your <code>layout</code> method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out <a href=\"https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\">the <code>layout.jade</code> used in Pony Foo</a> as an example.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-routes-\"><code>options.routes</code></h6>\n<p>The other big option is <code>routes</code>, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.</p>\n<p>Here&#39;s an example route that uses the <a href=\"http://expressjs.com\">Express</a> routing scheme.</p>\n<pre><code class=\"lang-js\">{\n  route: &#39;/articles/:slug&#39;,\n  action: &#39;articles/article&#39;,\n  ignore: false,\n  cache: &lt;inherit&gt;\n}\n</code></pre>\n<ul>\n<li><code>route</code> is a route in the format your HTTP framework of choice understands</li>\n<li><code>action</code> is the name of your controller action. It&#39;ll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller</li>\n<li><code>cache</code> can be used to determine the client-side caching behavior in this application path, and it&#39;ll default to inheriting from the options passed to <code>taunus.mount</code> <em>on the client-side</em></li>\n<li><code>ignore</code> is used in those cases where you want a URL to be ignored by the client-side router even if there&#39;s a catch-all route that would match that URL</li>\n</ul>\n<p>As an example of the <code>ignore</code> use case, consider the routing table shown below. The client-side router doesn&#39;t know <em>(and can&#39;t know unless you point it out)</em> what routes are server-side only, and it&#39;s up to you to point those out.</p>\n<pre><code class=\"lang-js\">[\n  { route: &#39;/&#39;, action: &#39;/home/index&#39; },\n  { route: &#39;/feed&#39;, ignore: true },\n  { route: &#39;/*&#39;, action: &#39;error/not-found&#39; }\n]\n</code></pre>\n<p>This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The <code>ignore</code> property is effectively telling the client-side <em>&quot;don&#39;t hijack links containing this URL&quot;</em>.</p>\n<p>Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don&#39;t need to be <code>ignore</code>d.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getdefaultviewmodel-\"><code>options.getDefaultViewModel?</code></h6>\n<p>The <code>getDefaultViewModel(done)</code> property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you&#39;re done creating a view model, you can invoke <code>done(null, model)</code>. If an error occurs while building the view model, you should call <code>done(err)</code> instead.</p>\n<p>Taunus will throw an error if <code>done</code> is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases <a href=\"#taunus-rebuilddefaultviewmodel\">the defaults can be rebuilt</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-plaintext-\"><code>options.plaintext?</code></h6>\n<p>The <code>plaintext</code> options object is passed directly to <a href=\"https://github.com/bevacqua/hget\">hget</a>, and it&#39;s used to <a href=\"https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\">tweak the plaintext version</a> of your site.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-resolvers-\"><code>options.resolvers?</code></h6>\n<p>Resolvers are used to determine the location of some of the different pieces of your application. Typically you won&#39;t have to touch these in the slightest.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getServerController(action)</code></td>\n<td>Return path to server-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p>The <code>addRoute</code> method passed to <code>taunus.mount</code> on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-addroute-definition-\"><code>addRoute(definition)</code></h4>\n<p>The <code>addRoute(definition)</code> method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework&#39;s router.</p>\n<ul>\n<li><code>route</code> is the route that you set as <code>definition.route</code></li>\n<li><code>action</code> is the action as passed to the route definition</li>\n<li><code>actionFn</code> will be the controller for this action method</li>\n<li><code>middleware</code> will be an array of methods to be executed before <code>actionFn</code></li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render(action, viewModel, req, res, next)</code></h2>\n<p>This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won&#39;t go very deep into it.</p>\n<p>The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The <code>action</code> property determines the default view that will be rendered. The <code>viewModel</code> will be extended by <a href=\"#-options-getdefaultviewmodel-\">the default view model</a>, and it may also override the default <code>action</code> by setting <code>viewModel.model.action</code>.</p>\n<p>The <code>req</code>, <code>res</code>, and <code>next</code> arguments are expected to be the Express routing arguments, but they can also be mocked <em>(which is in fact what the Hapi plugin does)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel(done?)</code></h2>\n<p>Once Taunus has been mounted, calling this method will rebuild the view model defaults using the <code>getDefaultViewModel</code> that was passed to <code>taunus.mount</code> in the options. An optional <code>done</code> callback will be invoked when the model is rebuilt.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"http-framework-plugins\">HTTP Framework Plugins</h1>\n<p>There&#39;s currently two different HTTP frameworks <em>(<a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a>)</em> that you can readily use with Taunus without having to deal with any of the route plumbing yourself.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-express-\">Using <code>taunus-express</code></h2>\n<p>The <code>taunus-express</code> plugin is probably the easiest to use, as Taunus was originally developed with just <a href=\"http://expressjs.com\">Express</a> in mind. In addition to the options already outlined for <a href=\"#-taunus-mount-addroute-options-\">taunus.mount</a>, you can add middleware for any route individually.</p>\n<ul>\n<li><code>middleware</code> are any methods you want Taunus to execute as middleware in Express applications</li>\n</ul>\n<p>To get <code>taunus-express</code> going you can use the following piece of code, provided that you come up with an <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  // ...\n};\n\ntaunusExpress(taunus, app, options);\n</code></pre>\n<p>The <code>taunusExpress</code> method will merely set up Taunus and add the relevant routes to your Express application by calling <code>app.get</code> a bunch of times. You can <a href=\"https://github.com/taunus/taunus-express\">find taunus-express on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-hapi-\">Using <code>taunus-hapi</code></h2>\n<p>The <code>taunus-hapi</code> plugin is a bit more involved, and you&#39;ll have to create a Pack in order to use it. In addition to <a href=\"#-taunus-mount-addroute-options-\">the options we&#39;ve already covered</a>, you can add <code>config</code> on any route.</p>\n<ul>\n<li><code>config</code> is passed directly into the route registered with Hapi, giving you the most flexibility</li>\n</ul>\n<p>To get <code>taunus-hapi</code> going you can use the following piece of code, and you can bring your own <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar Hapi = require(&#39;hapi&#39;);\nvar taunus = require(&#39;taunus&#39;);\nvar taunusHapi = require(&#39;taunus-hapi&#39;)(taunus);\nvar pack = new Hapi.Pack();\n\npack.register({\n  plugin: taunusHapi,\n  options: {\n    // ...\n  }\n});\n</code></pre>\n<p>The <code>taunusHapi</code> plugin will mount Taunus and register all of the necessary routes. You can <a href=\"https://github.com/taunus/taunus-hapi\">find taunus-hapi on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"command-line-interface\">Command-Line Interface</h1>\n<p>Once you&#39;ve set up the server-side to render your views using Taunus, it&#39;s only logical that you&#39;ll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.</p>\n<p>The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.</p>\n<p>Install it globally for development, but remember to use local copies for production-grade uses.</p>\n<pre><code class=\"lang-shell\">npm install -g taunus\n</code></pre>\n<p>When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.</p>\n<pre><code class=\"lang-shell\">taunus\n</code></pre>\n<p>By default, the output will be printed to the standard output, making for a fast debugging experience. Here&#39;s the output if you just had a single <code>home/index</code> route, and the matching view and client-side controller existed.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n  &#39;home/index&#39;: require(&#39;../client/js/controllers/home/index.js&#39;)\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>You can use a few options to alter the outcome of invoking <code>taunus</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-output-\"><code>--output</code></h2>\n<p><sub>the <code>-o</code> alias is available</sub></p>\n<p>Output is written to a file instead of to standard output. The file path used will be the <code>client_wiring</code> option in <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a>, which defaults to <code>&#39;.bin/wiring.js&#39;</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-watch-\"><code>--watch</code></h2>\n<p><sub>the <code>-w</code> alias is available</sub></p>\n<p>Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether <code>--output</code> was used.</p>\n<p>The program won&#39;t exit.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-transform-module-\"><code>--transform &lt;module&gt;</code></h2>\n<p><sub>the <code>-t</code> alias is available</sub></p>\n<p>This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the <a href=\"https://github.com/taunus/hapiify\"><code>hapiify</code></a> module.</p>\n<pre><code class=\"lang-shell\">npm install hapiify\ntaunus -t hapiify\n</code></pre>\n<p>Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></h2>\n<p><sub>the <code>-r</code> alias is available</sub></p>\n<p>Similarly to the <a href=\"#-options-resolvers-\"><code>resolvers</code></a> option that you can pass to <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a>, these resolvers can change the way in which file paths are resolved.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getClientController(action)</code></td>\n<td>Return path to client-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-standalone-\"><code>--standalone</code></h2>\n<p><sub>the <code>-s</code> alias is available</sub></p>\n<p>Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus <a href=\"https://github.com/umdjs/umd\">as a UMD module</a>.</p>\n<p>This would allow you to use Taunus on the client-side even if you don&#39;t want to use <a href=\"http://browserify.org\">Browserify</a> directly.</p>\n<p>Feedback and suggestions about this flag, <em>and possible alternatives that would make Taunus easier to use</em>, are welcome.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-api\">Client-side API</h1>\n<p>Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-container-wiring-options-\"><code>taunus.mount(container, wiring, options?)</code></h2>\n<p>The mountpoint takes a root container, the wiring module, and an options parameter. The <code>container</code> is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the <code>wiring</code> module exactly as built by the CLI, and no further configuration is necessary.</p>\n<p>When the mountpoint executes, Taunus will configure its internal state, <em>set up the client-side router</em>, run the client-side controller for the server-side rendered view, and start hijacking links.</p>\n<p>As an example, consider a browser makes a <code>GET</code> request for <code>/articles/the-fox</code> for the first time. Once <code>taunus.mount(container, wiring)</code> is invoked on the client-side, several things would happen in the order listed below.</p>\n<ul>\n<li>Taunus sets up the client-side view routing engine</li>\n<li>If enabled <em>(via <code>options</code>)</em>, the caching engine is configured</li>\n<li>Taunus obtains the view model <em>(more on this later)</em></li>\n<li>When a view model is obtained, the <code>&#39;start&#39;</code> event is emitted</li>\n<li>Anchor links start being monitored for clicks <em>(at this point your application becomes a <a href=\"http://en.wikipedia.org/wiki/Single-page_application\">SPA</a>)</em></li>\n<li>The <code>articles/article</code> client-side controller is executed</li>\n</ul>\n<p>That&#39;s quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, <em>rather than on the server-side!</em></p>\n<p>In order to better understand the process, I&#39;ll walk you through the <code>options</code> parameter.</p>\n<p>First off, the <code>bootstrap</code> option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: <code>auto</code> <em>(the default strategy)</em>, <code>inline</code>, or <code>manual</code>. The <code>auto</code> strategy involves the least work, which is why it&#39;s the default.</p>\n<ul>\n<li><code>auto</code> will make an AJAX request for the view model</li>\n<li><code>inline</code> expects you to place the model into a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag</li>\n<li><code>manual</code> expects you to get the view model however you want to, and then let Taunus know when it&#39;s ready</li>\n</ul>\n<p>Let&#39;s go into detail about each of these strategies.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-auto-strategy\">Using the <code>auto</code> strategy</h4>\n<p>The <code>auto</code> strategy means that Taunus will make use of an AJAX request to obtain the view model. <em>You don&#39;t have to do anything else</em> and this is the default strategy. This is the <strong>most convenient strategy, but also the slowest</strong> one.</p>\n<p>It&#39;s slow because the view model won&#39;t be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and <code>taunus.mount</code> is invoked.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-inline-strategy\">Using the <code>inline</code> strategy</h4>\n<p>The <code>inline</code> strategy expects you to add a <code>data-taunus</code> attribute on the <code>container</code> element. This attribute must be equal to the <code>id</code> attribute of a <code>&lt;script&gt;</code> tag containing the serialized view model.</p>\n<pre><code class=\"lang-jade\">div(data-taunus=&#39;model&#39;)!=partial\nscript(type=&#39;text/taunus&#39;, data-taunus=&#39;model&#39;)=JSON.stringify(model)\n</code></pre>\n<p>Pay special attention to the fact that the model is not only made into a JSON string, <em>but also HTML encoded by Jade</em>. When Taunus extracts the model from the <code>&lt;script&gt;</code> tag it&#39;ll unescape it, and then parse it as JSON.</p>\n<p>This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.</p>\n<p>That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-manual-strategy\">Using the <code>manual</code> strategy</h4>\n<p>The <code>manual</code> strategy is the most involved of the three, but also the most performant. In this strategy you&#39;re supposed to add the following <em>(seemingly pointless)</em> snippet of code in a <code>&lt;script&gt;</code> other than the one that&#39;s pulling down Taunus, so that they are pulled concurrently rather than serially.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n</code></pre>\n<p>Once you somehow get your hands on the view model, you should invoke <code>taunusReady(model)</code>. Considering you&#39;ll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.</p>\n<ul>\n<li>The view model is loaded first, you call <code>taunusReady(model)</code> and wait for Taunus to take the model object and boot the application as soon as <code>taunus.mount</code> is executed</li>\n<li>Taunus loads first and <code>taunus.mount</code> is called first. In this case, Taunus will replace <code>window.taunusReady</code> with a special <code>boot</code> method. When the view model finishes loading, you call <code>taunusReady(model)</code> and the application finishes booting</li>\n</ul>\n<blockquote>\n<p>If this sounds a little mind-bending it&#39;s because it is. It&#39;s not designed to be pretty, but merely to be performant.</p>\n</blockquote>\n<p>Now that we&#39;ve addressed the awkward bits, let&#39;s cover the <em>&quot;somehow get your hands on the view model&quot;</em> aspect. My preferred method is using JSONP, as it&#39;s able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you&#39;ll probably want this to be an inline script, keeping it small is important.</p>\n<p>The good news is that the server-side supports JSONP out the box. Here&#39;s a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nfunction inject (url) {\n  var script = document.createElement(&#39;script&#39;);\n  script.src = url;\n  document.body.appendChild(script);\n}\n\nfunction injector () {\n  var search = location.search;\n  var searchQuery = search ? &#39;&amp;&#39; + search.substr(1) : &#39;&#39;;\n  var searchJson = &#39;?json&amp;callback=taunusReady&#39; + searchQuery;\n  inject(location.pathname + searchJson);\n}\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n\ninjector();\n</code></pre>\n<p>As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching\">Caching</h4>\n<p>The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the <code>cache</code> flag in the options passed to <code>taunus.mount</code> on the client-side.</p>\n<p>If you set <code>cache</code> to <code>true</code> then cached items will be considered <em>&quot;fresh&quot; (valid copies of the original)</em> for <strong>15 seconds</strong>. You can also set <code>cache</code> to a number, and that number of seconds will be used as the default instead.</p>\n<p>Caching can also be tweaked on individual routes. For instance, you could set <code>{ cache: true }</code> when mounting Taunus and then have <code>{ cache: 3600 }</code> on a route that you want to cache for a longer period of time.</p>\n<p>The caching layer is <em>seamlessly integrated</em> into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in <a href=\"http://caniuse.com/#feat=indexeddb\">browsers that support IndexedDB</a>. In the case of browsers that don&#39;t support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"prefetching\">Prefetching</h4>\n<p>If caching is enabled, the next logical step is prefetching. This is enabled just by adding <code>prefetch: true</code> to the options passed to <code>taunus.mount</code>. The prefetching feature will fire for any anchor link that&#39;s trips over a <code>mouseover</code> or a <code>touchstart</code> event. If a route matches the URL in the <code>href</code>, an AJAX request will prefetch the view and cache its contents, improving perceived performance.</p>\n<p>When links are clicked before prefetching finishes, they&#39;ll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-on-type-fn-\"><code>taunus.on(type, fn)</code></h2>\n<p>Taunus emits a series of events during its lifecycle, and <code>taunus.on</code> is the way you can tune in and listen for these events using a subscription function <code>fn</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-once-type-fn-\"><code>taunus.once(type, fn)</code></h2>\n<p>This method is equivalent to <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a>, except the event listeners will be used once and then it&#39;ll be discarded.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-off-type-fn-\"><code>taunus.off(type, fn)</code></h2>\n<p>Using this method you can remove any event listeners that were previously added using <code>.on</code> or <code>.once</code>. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling <code>.on</code> or <code>.once</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-intercept-action-fn-\"><code>taunus.intercept(action?, fn)</code></h2>\n<p>This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified <code>action</code>. You can also add global interceptors by omitting the <code>action</code> parameter, or setting it to <code>*</code>.</p>\n<p>An interceptor function will receive an <code>event</code> parameter, containing a few different properties.</p>\n<ul>\n<li><code>url</code> contains the URL that needs a view model</li>\n<li><code>route</code> contains the full route object as you&#39;d get from <a href=\"#-taunus-route-url-\"><code>taunus.route(url)</code></a></li>\n<li><code>parts</code> is just a shortcut for <code>route.parts</code></li>\n<li><code>preventDefault(model)</code> allows you to suppress the need for an AJAX request, commanding Taunus to use the model you&#39;ve provided instead</li>\n<li><code>defaultPrevented</code> tells you if some other handler has prevented the default behavior</li>\n<li><code>canPreventDefault</code> tells you if invoking <code>event.preventDefault</code> will have any effect</li>\n<li><code>model</code> starts as <code>null</code>, and it can later become the model passed to <code>preventDefault</code></li>\n</ul>\n<p>Interceptors are asynchronous, but if an interceptor spends longer than 200ms it&#39;ll be short-circuited and calling <code>event.preventDefault</code> past that point won&#39;t have any effect.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-partial-container-action-model-\"><code>taunus.partial(container, action, model)</code></h2>\n<p>This method provides you with access to the view-rendering engine of Taunus. You can use it to render the <code>action</code> view into the <code>container</code> DOM element, using the specified <code>model</code>. Once the view is rendered, the <code>render</code> event will be fired <em>(with <code>container, model</code> as arguments)</em> and the client-side controller for that view will be executed.</p>\n<p>While <code>taunus.partial</code> takes a <code>route</code> as the fourth parameter, you should omit that since it&#39;s used for internal purposes only.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-navigate-url-options-\"><code>taunus.navigate(url, options)</code></h2>\n<p>Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use <code>taunus.navigate</code> passing it a plain URL or anything that would cause <code>taunus.route(url)</code> to return a valid route.</p>\n<p>By default, if <code>taunus.navigate(url, options)</code> is called with an <code>url</code> that doesn&#39;t match any client-side route, then the user will be redirected via <code>location.href</code>. In cases where the browser doesn&#39;t support the history API, <code>location.href</code> will be used as well.</p>\n<p>There&#39;s a few options you can use to tweak the behavior of <code>taunus.navigate</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Option</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>context</code></td>\n<td>A DOM element that caused the navigation event, used when emitting events</td>\n</tr>\n<tr>\n<td><code>strict</code></td>\n<td>If set to <code>true</code> and the URL doesn&#39;t match any route, then the navigation attempt must be ignored</td>\n</tr>\n<tr>\n<td><code>scroll</code></td>\n<td>When this is set to <code>false</code>, elements aren&#39;t scrolled into view after navigation</td>\n</tr>\n<tr>\n<td><code>force</code></td>\n<td>Unless this is set to <code>true</code>, navigation won&#39;t <em>fetch a model</em> if the route matches the current route, and <code>state.model</code> will be reused instead</td>\n</tr>\n<tr>\n<td><code>replaceState</code></td>\n<td>Use <code>replaceState</code> instead of <code>pushState</code> when changing history</td>\n</tr>\n</tbody>\n</table>\n<p>Note that the notion of <em>fetching a model</em> might be deceiving as the model could be pulled from the cache even if <code>force</code> is set to <code>true</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-route-url-\"><code>taunus.route(url)</code></h2>\n<p>This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.</p>\n<ul>\n<li>A fully qualified URL on the same origin, e.g <code>http://taunus.bevacqua.io/api</code></li>\n<li>An absolute URL without an origin, e.g <code>/api</code></li>\n<li>Just a hash, e.g <code>#foo</code> <em>(<code>location.href</code> is used)</em></li>\n<li>Falsy values, e.g <code>null</code> <em>(<code>location.href</code> is used)</em></li>\n</ul>\n<p>Relative URLs are not supported <em>(anything that doesn&#39;t have a leading slash)</em>, e.g <code>files/data.json</code>. Anything that&#39;s not on the same origin or doesn&#39;t match one of the registered routes is going to yield <code>null</code>.</p>\n<p><em>This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"-taunus-route-equals-route-route-\"><code>taunus.route.equals(route, route)</code></h1>\n<p>Compares two routes and returns <code>true</code> if they would fetch the same model. Note that different URLs may still return <code>true</code>. For instance, <code>/foo</code> and <code>/foo#bar</code> would fetch the same model even if they&#39;re different URLs.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-state-\"><code>taunus.state</code></h2>\n<p>This is an internal state variable, and it contains a lot of useful debugging information.</p>\n<ul>\n<li><code>container</code> is the DOM element passed to <code>taunus.mount</code></li>\n<li><code>controllers</code> are all the controllers, as defined in the wiring module</li>\n<li><code>templates</code> are all the templates, as defined in the wiring module</li>\n<li><code>routes</code> are all the routes, as defined in the wiring module</li>\n<li><code>route</code> is a reference to the current route</li>\n<li><code>model</code> is a reference to the model used to render the current view</li>\n<li><code>prefetch</code> exposes whether prefetching is turned on</li>\n<li><code>cache</code> exposes whether caching is enabled</li>\n</ul>\n<p>Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-taunusrc-manifest\">The <code>.taunusrc</code> manifest</h1>\n<p>If you want to use values other than the conventional defaults shown in the table below, then you should create a <code>.taunusrc</code> file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your <code>package.json</code>, under the <code>taunus</code> property.</p>\n<pre><code class=\"lang-json\">{\n  &quot;views&quot;: &quot;.bin/views&quot;,\n  &quot;server_routes&quot;: &quot;controllers/routes.js&quot;,\n  &quot;server_controllers&quot;: &quot;controllers&quot;,\n  &quot;client_controllers&quot;: &quot;client/js/controllers&quot;,\n  &quot;client_wiring&quot;: &quot;.bin/wiring.js&quot;\n}\n</code></pre>\n<ul>\n<li>The <code>views</code> directory is where your views <em>(already compiled into JavaScript)</em> are placed. These views are used directly on both the server-side and the client-side</li>\n<li>The <code>server_routes</code> file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module</li>\n<li>The <code>server_controllers</code> directory is the root directory where your server-side controllers live. It&#39;s used when setting up the server-side router</li>\n<li>The <code>client_controllers</code> directory is where your client-side controller modules live. The CLI will <code>require</code> these controllers in its resulting wiring module</li>\n<li>The <code>client_wiring</code> file is where your wiring module will be placed by the CLI. You&#39;ll then have to <code>require</code> it in your application when booting up Taunus</li>\n</ul>\n<p>Here is where things get <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">a little conventional</a>. Views, and both server-side and client-side controllers are expected to be organized by following the <code>{root}/{controller}/{action}</code> pattern, but you could change that using <code>resolvers</code> when invoking the CLI and using the server-side API.</p>\n<p>Views and controllers are also expected to be CommonJS modules that export a single method.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    Taunus exposes _three different public APIs_, and there's also **plugins to integrate Taunus and an HTTP server**. This document covers all three APIs extensively. If you're concerned about the inner workings of Taunus, please refer to the [Getting Started][1] guide. This document aims to only cover how the public interface affects application state, but **doesn't delve into implementation details**.\n\n    # Table of Contents\n\n    - A [server-side API](#server-side-api) that deals with server-side rendering\n      - The [`taunus.mount`](#-taunus-mount-addroute-options-) method\n        - Its [`options`](#the-options-object) argument\n          - [`layout`](#-options-layout-)\n          - [`routes`](#-options-routes-)\n          - [`getDefaultViewModel`](#-options-getdefaultviewmodel-)\n          - [`plaintext`](#-options-plaintext-)\n          - [`resolvers`](#-options-resolvers-)\n        - Its [`addRoute`](#-addroute-definition-) argument\n      - The [`taunus.render`](#-taunus-render-action-viewmodel-req-res-next-) method\n      - The [`taunus.rebuildDefaultViewModel`](#-taunus-rebuilddefaultviewmodel-done-) method\n    - A [suite of plugins](#http-framework-plugins) can integrate Taunus and an HTTP server\n      - Using [`taunus-express`](#using-taunus-express-) for [Express][2]\n      - Using [`taunus-hapi`](#using-taunus-hapi-) for [Hapi][3]\n    - A [CLI that produces a wiring module](#command-line-interface) for the client-side\n      - The [`--output`](#-output-) flag\n      - The [`--watch`](#-watch-) flag\n      - The [`--transform <module>`](#-transform-module-) flag\n      - The [`--resolvers <module>`](#-resolvers-module-) flag\n      - The [`--standalone`](#-standalone-) flag\n    - A [client-side API](#client-side-api) that deals with client-side rendering\n      - The [`taunus.mount`](#-taunus-mount-container-wiring-options-) method\n        - Using the [`auto`](#using-the-auto-strategy) strategy\n        - Using the [`inline`](#using-the-inline-strategy) strategy\n        - Using the [`manual`](#using-the-manual-strategy) strategy\n        - [Caching](#caching)\n        - [Prefetching](#prefetching)\n      - The [`taunus.on`](#-taunus-on-type-fn-) method\n      - The [`taunus.once`](#-taunus-once-type-fn-) method\n      - The [`taunus.off`](#-taunus-off-type-fn-) method\n      - The [`taunus.intercept`](#-taunus-intercept-action-fn-) method\n      - The [`taunus.partial`](#-taunus-partial-container-action-model-) method\n      - The [`taunus.navigate`](#-taunus-navigate-url-options-) method\n      - The [`taunus.route`](#-taunus-route-url-) method\n        - The [`taunus.route.equals`](#-taunus-route-equals-route-route-) method\n      - The [`taunus.state`](#-taunus-state-) property\n    - The [`.taunusrc`](#the-taunusrc-manifest) manifest\n\n    # Server-side API\n\n    The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, _including client-side rendering_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(addRoute, options?)`\n\n    Mounts Taunus on top of a server-side router, by registering each route in `options.routes` with the `addRoute` method.\n\n    > Note that most of the time, **this method shouldn't be invoked directly**, but rather through one of the [HTTP framework plugins](#http-framework-plugins) presented below.\n\n    Here's an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the `route` and `action` properties.\n\n    ```js\n    'use strict';\n\n    taunus.mount(addRoute, {\n      routes: [{ route: '/', action: 'home/index' }]\n    });\n\n    function addRoute (definition) {\n      app.get(definition.route, definition.action);\n    }\n    ```\n\n    Let's go over the options you can pass to `taunus.mount` first.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### The `options?` object\n\n    There's a few options that can be passed to the server-side mountpoint. You're probably going to be passing these to your [HTTP framework plugin](#http-framework-plugins), rather than using `taunus.mount` directly.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.layout?`\n\n    The `layout` property is expected to have the `function(data)` signature. It'll be invoked whenever a full HTML document needs to be rendered, and a `data` object will be passed to it. That object will contain everything you've set as the view model, plus a `partial` property containing the raw HTML of the rendered partial view. Your `layout` method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out [the `layout.jade` used in Pony Foo][4] as an example.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.routes`\n\n    The other big option is `routes`, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.\n\n    Here's an example route that uses the [Express][2] routing scheme.\n\n    ```js\n    {\n      route: '/articles/:slug',\n      action: 'articles/article',\n      ignore: false,\n      cache: <inherit>\n    }\n    ```\n\n    - `route` is a route in the format your HTTP framework of choice understands\n    - `action` is the name of your controller action. It'll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller\n    - `cache` can be used to determine the client-side caching behavior in this application path, and it'll default to inheriting from the options passed to `taunus.mount` _on the client-side_\n    - `ignore` is used in those cases where you want a URL to be ignored by the client-side router even if there's a catch-all route that would match that URL\n\n    As an example of the `ignore` use case, consider the routing table shown below. The client-side router doesn't know _(and can't know unless you point it out)_ what routes are server-side only, and it's up to you to point those out.\n\n    ```js\n    [\n      { route: '/', action: '/home/index' },\n      { route: '/feed', ignore: true },\n      { route: '/*', action: 'error/not-found' }\n    ]\n    ```\n\n    This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The `ignore` property is effectively telling the client-side _\"don't hijack links containing this URL\"_.\n\n    Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don't need to be `ignore`d.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getDefaultViewModel?`\n\n    The `getDefaultViewModel(done)` property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you're done creating a view model, you can invoke `done(null, model)`. If an error occurs while building the view model, you should call `done(err)` instead.\n\n    Taunus will throw an error if `done` is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases [the defaults can be rebuilt](#taunus-rebuilddefaultviewmodel).\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.plaintext?`\n\n    The `plaintext` options object is passed directly to [hget][5], and it's used to [tweak the plaintext version][6] of your site.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.resolvers?`\n\n    Resolvers are used to determine the location of some of the different pieces of your application. Typically you won't have to touch these in the slightest.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getServerController(action)` | Return path to server-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    The `addRoute` method passed to `taunus.mount` on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `addRoute(definition)`\n\n    The `addRoute(definition)` method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework's router.\n\n    - `route` is the route that you set as `definition.route`\n    - `action` is the action as passed to the route definition\n    - `actionFn` will be the controller for this action method\n    - `middleware` will be an array of methods to be executed before `actionFn`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.render(action, viewModel, req, res, next)`\n\n    This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won't go very deep into it.\n\n    The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The `action` property determines the default view that will be rendered. The `viewModel` will be extended by [the default view model](#-options-getdefaultviewmodel-), and it may also override the default `action` by setting `viewModel.model.action`.\n\n    The `req`, `res`, and `next` arguments are expected to be the Express routing arguments, but they can also be mocked _(which is in fact what the Hapi plugin does)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.rebuildDefaultViewModel(done?)`\n\n    Once Taunus has been mounted, calling this method will rebuild the view model defaults using the `getDefaultViewModel` that was passed to `taunus.mount` in the options. An optional `done` callback will be invoked when the model is rebuilt.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # HTTP Framework Plugins\n\n    There's currently two different HTTP frameworks _([Express][2] and [Hapi][3])_ that you can readily use with Taunus without having to deal with any of the route plumbing yourself.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-express`\n\n    The `taunus-express` plugin is probably the easiest to use, as Taunus was originally developed with just [Express][2] in mind. In addition to the options already outlined for [taunus.mount](#-taunus-mount-addroute-options-), you can add middleware for any route individually.\n\n    - `middleware` are any methods you want Taunus to execute as middleware in Express applications\n\n    To get `taunus-express` going you can use the following piece of code, provided that you come up with an `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      // ...\n    };\n\n    taunusExpress(taunus, app, options);\n    ```\n\n    The `taunusExpress` method will merely set up Taunus and add the relevant routes to your Express application by calling `app.get` a bunch of times. You can [find taunus-express on GitHub][7].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-hapi`\n\n    The `taunus-hapi` plugin is a bit more involved, and you'll have to create a Pack in order to use it. In addition to [the options we've already covered](#-taunus-mount-addroute-options-), you can add `config` on any route.\n\n    - `config` is passed directly into the route registered with Hapi, giving you the most flexibility\n\n    To get `taunus-hapi` going you can use the following piece of code, and you can bring your own `options` object.\n\n    ```js\n    'use strict';\n\n    var Hapi = require('hapi');\n    var taunus = require('taunus');\n    var taunusHapi = require('taunus-hapi')(taunus);\n    var pack = new Hapi.Pack();\n\n    pack.register({\n      plugin: taunusHapi,\n      options: {\n        // ...\n      }\n    });\n    ```\n\n    The `taunusHapi` plugin will mount Taunus and register all of the necessary routes. You can [find taunus-hapi on GitHub][8].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Command-Line Interface\n\n    Once you've set up the server-side to render your views using Taunus, it's only logical that you'll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.\n\n    The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.\n\n    Install it globally for development, but remember to use local copies for production-grade uses.\n\n    ```shell\n    npm install -g taunus\n    ```\n\n    When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.\n\n    ```shell\n    taunus\n    ```\n\n    By default, the output will be printed to the standard output, making for a fast debugging experience. Here's the output if you just had a single `home/index` route, and the matching view and client-side controller existed.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n      'home/index': require('../client/js/controllers/home/index.js')\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    You can use a few options to alter the outcome of invoking `taunus`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--output`\n\n    <sub>the `-o` alias is available</sub>\n\n    Output is written to a file instead of to standard output. The file path used will be the `client_wiring` option in [`.taunusrc`](#the-taunusrc-manifest), which defaults to `'.bin/wiring.js'`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--watch`\n\n    <sub>the `-w` alias is available</sub>\n\n    Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether `--output` was used.\n\n    The program won't exit.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--transform <module>`\n\n    <sub>the `-t` alias is available</sub>\n\n    This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the [`hapiify`][9] module.\n\n    ```shell\n    npm install hapiify\n    taunus -t hapiify\n    ```\n\n    Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--resolvers <module>`\n\n    <sub>the `-r` alias is available</sub>\n\n    Similarly to the [`resolvers`](#-options-resolvers-) option that you can pass to [`taunus.mount`](#-taunus-mount-addroute-options-), these resolvers can change the way in which file paths are resolved.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getClientController(action)` | Return path to client-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--standalone`\n\n    <sub>the `-s` alias is available</sub>\n\n    Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus [as a UMD module][10].\n\n    This would allow you to use Taunus on the client-side even if you don't want to use [Browserify][11] directly.\n\n    Feedback and suggestions about this flag, _and possible alternatives that would make Taunus easier to use_, are welcome.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-side API\n\n    Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(container, wiring, options?)`\n\n    The mountpoint takes a root container, the wiring module, and an options parameter. The `container` is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the `wiring` module exactly as built by the CLI, and no further configuration is necessary.\n\n    When the mountpoint executes, Taunus will configure its internal state, _set up the client-side router_, run the client-side controller for the server-side rendered view, and start hijacking links.\n\n    As an example, consider a browser makes a `GET` request for `/articles/the-fox` for the first time. Once `taunus.mount(container, wiring)` is invoked on the client-side, several things would happen in the order listed below.\n\n    - Taunus sets up the client-side view routing engine\n    - If enabled _(via `options`)_, the caching engine is configured\n    - Taunus obtains the view model _(more on this later)_\n    - When a view model is obtained, the `'start'` event is emitted\n    - Anchor links start being monitored for clicks _(at this point your application becomes a [SPA][13])_\n    - The `articles/article` client-side controller is executed\n\n    That's quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, _rather than on the server-side!_\n\n    In order to better understand the process, I'll walk you through the `options` parameter.\n\n    First off, the `bootstrap` option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: `auto` _(the default strategy)_, `inline`, or `manual`. The `auto` strategy involves the least work, which is why it's the default.\n\n    - `auto` will make an AJAX request for the view model\n    - `inline` expects you to place the model into a `<script type='text/taunus'>` tag\n    - `manual` expects you to get the view model however you want to, and then let Taunus know when it's ready\n\n    Let's go into detail about each of these strategies.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `auto` strategy\n\n    The `auto` strategy means that Taunus will make use of an AJAX request to obtain the view model. _You don't have to do anything else_ and this is the default strategy. This is the **most convenient strategy, but also the slowest** one.\n\n    It's slow because the view model won't be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and `taunus.mount` is invoked.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `inline` strategy\n\n    The `inline` strategy expects you to add a `data-taunus` attribute on the `container` element. This attribute must be equal to the `id` attribute of a `<script>` tag containing the serialized view model.\n\n    ```jade\n    div(data-taunus='model')!=partial\n    script(type='text/taunus', data-taunus='model')=JSON.stringify(model)\n    ```\n\n    Pay special attention to the fact that the model is not only made into a JSON string, _but also HTML encoded by Jade_. When Taunus extracts the model from the `<script>` tag it'll unescape it, and then parse it as JSON.\n\n    This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.\n\n    That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `manual` strategy\n\n    The `manual` strategy is the most involved of the three, but also the most performant. In this strategy you're supposed to add the following _(seemingly pointless)_ snippet of code in a `<script>` other than the one that's pulling down Taunus, so that they are pulled concurrently rather than serially.\n\n    ```js\n    'use strict';\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n    ```\n\n    Once you somehow get your hands on the view model, you should invoke `taunusReady(model)`. Considering you'll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.\n\n    - The view model is loaded first, you call `taunusReady(model)` and wait for Taunus to take the model object and boot the application as soon as `taunus.mount` is executed\n    - Taunus loads first and `taunus.mount` is called first. In this case, Taunus will replace `window.taunusReady` with a special `boot` method. When the view model finishes loading, you call `taunusReady(model)` and the application finishes booting\n\n    > If this sounds a little mind-bending it's because it is. It's not designed to be pretty, but merely to be performant.\n\n    Now that we've addressed the awkward bits, let's cover the _\"somehow get your hands on the view model\"_ aspect. My preferred method is using JSONP, as it's able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you'll probably want this to be an inline script, keeping it small is important.\n\n    The good news is that the server-side supports JSONP out the box. Here's a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.\n\n    ```js\n    'use strict';\n\n    function inject (url) {\n      var script = document.createElement('script');\n      script.src = url;\n      document.body.appendChild(script);\n    }\n\n    function injector () {\n      var search = location.search;\n      var searchQuery = search ? '&' + search.substr(1) : '';\n      var searchJson = '?json&callback=taunusReady' + searchQuery;\n      inject(location.pathname + searchJson);\n    }\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n\n    injector();\n    ```\n\n    As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching\n\n    The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the `cache` flag in the options passed to `taunus.mount` on the client-side.\n\n    If you set `cache` to `true` then cached items will be considered _\"fresh\" (valid copies of the original)_ for **15 seconds**. You can also set `cache` to a number, and that number of seconds will be used as the default instead.\n\n    Caching can also be tweaked on individual routes. For instance, you could set `{ cache: true }` when mounting Taunus and then have `{ cache: 3600 }` on a route that you want to cache for a longer period of time.\n\n    The caching layer is _seamlessly integrated_ into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in [browsers that support IndexedDB][14]. In the case of browsers that don't support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Prefetching\n\n    If caching is enabled, the next logical step is prefetching. This is enabled just by adding `prefetch: true` to the options passed to `taunus.mount`. The prefetching feature will fire for any anchor link that's trips over a `mouseover` or a `touchstart` event. If a route matches the URL in the `href`, an AJAX request will prefetch the view and cache its contents, improving perceived performance.\n\n    When links are clicked before prefetching finishes, they'll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.on(type, fn)`\n\n    Taunus emits a series of events during its lifecycle, and `taunus.on` is the way you can tune in and listen for these events using a subscription function `fn`.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.once(type, fn)`\n\n    This method is equivalent to [`taunus.on`](#-taunus-on-type-fn-), except the event listeners will be used once and then it'll be discarded.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.off(type, fn)`\n\n    Using this method you can remove any event listeners that were previously added using `.on` or `.once`. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling `.on` or `.once`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.intercept(action?, fn)`\n\n    This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified `action`. You can also add global interceptors by omitting the `action` parameter, or setting it to `*`.\n\n    An interceptor function will receive an `event` parameter, containing a few different properties.\n\n    - `url` contains the URL that needs a view model\n    - `route` contains the full route object as you'd get from [`taunus.route(url)`](#-taunus-route-url-)\n    - `parts` is just a shortcut for `route.parts`\n    - `preventDefault(model)` allows you to suppress the need for an AJAX request, commanding Taunus to use the model you've provided instead\n    - `defaultPrevented` tells you if some other handler has prevented the default behavior\n    - `canPreventDefault` tells you if invoking `event.preventDefault` will have any effect\n    - `model` starts as `null`, and it can later become the model passed to `preventDefault`\n\n    Interceptors are asynchronous, but if an interceptor spends longer than 200ms it'll be short-circuited and calling `event.preventDefault` past that point won't have any effect.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.partial(container, action, model)`\n\n    This method provides you with access to the view-rendering engine of Taunus. You can use it to render the `action` view into the `container` DOM element, using the specified `model`. Once the view is rendered, the `render` event will be fired _(with `container, model` as arguments)_ and the client-side controller for that view will be executed.\n\n    While `taunus.partial` takes a `route` as the fourth parameter, you should omit that since it's used for internal purposes only.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.navigate(url, options)`\n\n    Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use `taunus.navigate` passing it a plain URL or anything that would cause `taunus.route(url)` to return a valid route.\n\n    By default, if `taunus.navigate(url, options)` is called with an `url` that doesn't match any client-side route, then the user will be redirected via `location.href`. In cases where the browser doesn't support the history API, `location.href` will be used as well.\n\n    There's a few options you can use to tweak the behavior of `taunus.navigate`.\n\n    Option           | Description\n    -----------------|-------------------------------------------------------------------\n    `context`        | A DOM element that caused the navigation event, used when emitting events\n    `strict`         | If set to `true` and the URL doesn't match any route, then the navigation attempt must be ignored\n    `scroll`         | When this is set to `false`, elements aren't scrolled into view after navigation\n    `force`          | Unless this is set to `true`, navigation won't _fetch a model_ if the route matches the current route, and `state.model` will be reused instead\n    `replaceState`   | Use `replaceState` instead of `pushState` when changing history\n\n    Note that the notion of _fetching a model_ might be deceiving as the model could be pulled from the cache even if `force` is set to `true`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.route(url)`\n\n    This convenience method allows you to break down a URL into its individual components. The method accepts any of the following patterns, and it returns a Taunus route object.\n\n    - A fully qualified URL on the same origin, e.g `http://taunus.bevacqua.io/api`\n    - An absolute URL without an origin, e.g `/api`\n    - Just a hash, e.g `#foo` _(`location.href` is used)_\n    - Falsy values, e.g `null` _(`location.href` is used)_\n\n    Relative URLs are not supported _(anything that doesn't have a leading slash)_, e.g `files/data.json`. Anything that's not on the same origin or doesn't match one of the registered routes is going to yield `null`.\n\n    _This method is particularly useful when debugging your routing tables, as it gives you direct access to the router used internally by Taunus._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # `taunus.route.equals(route, route)`\n\n    Compares two routes and returns `true` if they would fetch the same model. Note that different URLs may still return `true`. For instance, `/foo` and `/foo#bar` would fetch the same model even if they're different URLs.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.state`\n\n    This is an internal state variable, and it contains a lot of useful debugging information.\n\n    - `container` is the DOM element passed to `taunus.mount`\n    - `controllers` are all the controllers, as defined in the wiring module\n    - `templates` are all the templates, as defined in the wiring module\n    - `routes` are all the routes, as defined in the wiring module\n    - `route` is a reference to the current route\n    - `model` is a reference to the model used to render the current view\n    - `prefetch` exposes whether prefetching is turned on\n    - `cache` exposes whether caching is enabled\n\n    Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The `.taunusrc` manifest\n\n    If you want to use values other than the conventional defaults shown in the table below, then you should create a `.taunusrc` file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your `package.json`, under the `taunus` property.\n\n    ```json\n    {\n      \"views\": \".bin/views\",\n      \"server_routes\": \"controllers/routes.js\",\n      \"server_controllers\": \"controllers\",\n      \"client_controllers\": \"client/js/controllers\",\n      \"client_wiring\": \".bin/wiring.js\"\n    }\n    ```\n\n    - The `views` directory is where your views _(already compiled into JavaScript)_ are placed. These views are used directly on both the server-side and the client-side\n    - The `server_routes` file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module\n    - The `server_controllers` directory is the root directory where your server-side controllers live. It's used when setting up the server-side router\n    - The `client_controllers` directory is where your client-side controller modules live. The CLI will `require` these controllers in its resulting wiring module\n    - The `client_wiring` file is where your wiring module will be placed by the CLI. You'll then have to `require` it in your application when booting up Taunus\n\n    Here is where things get [a little conventional][12]. Views, and both server-side and client-side controllers are expected to be organized by following the `{root}/{controller}/{action}` pattern, but you could change that using `resolvers` when invoking the CLI and using the server-side API.\n\n    Views and controllers are also expected to be CommonJS modules that export a single method.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: /getting-started\n    [2]: http://expressjs.com\n    [3]: http://hapijs.com\n    [4]: https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\n    [5]: https://github.com/bevacqua/hget\n    [6]: https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\n    [7]: https://github.com/taunus/taunus-express\n    [8]: https://github.com/taunus/taunus-hapi\n    [9]: https://github.com/taunus/hapiify\n    [10]: https://github.com/umdjs/umd\n    [11]: http://browserify.org\n    [12]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [13]: http://en.wikipedia.org/wiki/Single-page_application\n    [14]: http://caniuse.com/#feat=indexeddb\n");
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
buf.push("<h1 id=\"complementary-modules\">Complementary Modules</h1>\n<p>Taunus is a small library by MVC framework standards, sitting at <strong>around 12kB minified and gzipped</strong>. It is designed to be small. It is also designed to do one thing well, and that&#39;s <em>being a shared-rendering MVC engine</em>.</p>\n<p>Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you <a href=\"/api\">head over to the API documentation</a>, you&#39;ll notice that the server-side API, the command-line interface, and the <code>.taunusrc</code> manifest are only concerned with providing a conventional shared-rendering MVC engine.</p>\n<p>In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you&#39;re used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.</p>\n<blockquote>\n<p>In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.</p>\n</blockquote>\n<p>Taunus attempts to bring the server-side mentality of <em>&quot;not doing everything is okay&quot;</em> into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do <strong>one thing well</strong>.</p>\n<p>In this brief article we&#39;ll recommend three different libraries that play well with Taunus, and you&#39;ll also learn how to search for modules that can give you access to other functionality you may be interested in.</p>\n<p><code>dominus</code>\n<code>xhr</code>\n<code>measly</code></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Complementary Modules\n\n    Taunus is a small library by MVC framework standards, sitting at **around 12kB minified and gzipped**. It is designed to be small. It is also designed to do one thing well, and that's _being a shared-rendering MVC engine_.\n\n    Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you [head over to the API documentation][1], you'll notice that the server-side API, the command-line interface, and the `.taunusrc` manifest are only concerned with providing a conventional shared-rendering MVC engine.\n\n    In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. However, you're used to having database access, search, logging, and a variety of services handled by separate libraries, instead of a single behemoth that tries to do everything.\n\n    > In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.\n\n    Taunus attempts to bring the server-side mentality of _\"not doing everything is okay\"_ into the world of client-side web application development as well. To that end, Taunus recommends that you give a shot to libraries that also do **one thing well**.\n\n    In this brief article we'll recommend three different libraries that play well with Taunus, and you'll also learn how to search for modules that can give you access to other functionality you may be interested in.\n\n    `dominus`\n    `xhr`\n    `measly`\n\n    [1]: /api\n");
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
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#compiling-your-client-side-javascript\">Compiling your client-side JavaScript</a></li>\n<li><a href=\"#using-the-client-side-taunus-api\">Using the client-side Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">mkdir getting-started\ncd getting-started\nnpm init\nnpm install --save taunus taunus-express express\n</code></pre>\n<p><img src=\"http://i.imgur.com/4P8vNe9.png\" alt=\"Screenshot with `npm init` output\"></p>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/n8mH4mN.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>routes</code> should be an array of view routes</li>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that <a href=\"/api\">in the API documentation</a>, but it defaults to <code>{}</code>)</em>.</p>\n<p>Here&#39;s what you&#39;d get if you attempted to run the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/08lnCec.png\" alt=\"Screenshot with `node app` results\"></p>\n<p>Turns out you&#39;re missing a lot of things! Taunus is quite lenient and it&#39;ll try its best to let you know what you might be missing, though. Apparently you don&#39;t have a layout, a server-side controller, or even a view! <em>That&#39;s rough.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;use the following combination of plain text and the <strong>(maybe HTML)</strong> partial view&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return &#39;This is the partial: &quot;&#39; + model.partial + &#39;&quot;&#39;;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Here&#39;s what you&#39;d get if you ran the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/wUbnCyk.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>At this point we have a layout, but we&#39;re still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you&#39;re trying to get an MVC engine up and running, right?</p>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">mkdir -p views/home\ntouch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install --global jadum\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/zjaJYCq.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>Granted, you should <em>probably</em> move the layout into a Jade <em>(any view engine will do)</em> template as well.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">mkdir -p controllers/home\ntouch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template!</p>\n<pre><code class=\"lang-shell\">rm layout.js\ntouch views/layout.jade\njadum views/** --output .bin\n</code></pre>\n<p>You should also remember to update the <code>app.js</code> module once again!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The <code>!=</code> syntax below means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/NvEWx9z.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>You can now visit <code>localhost:3000</code> with your favorite web browser and you&#39;ll notice that the view renders as you&#39;d expect. The title will be properly set, and a <code>&lt;main&gt;</code> element will have the contents of your view.</p>\n<p><img src=\"http://i.imgur.com/LgZRFn5.png\" alt=\"Screenshot with application running on Google Chrome\"></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>Then there&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install --global taunus\n</code></pre>\n<p>Before you can use the CLI, you should move the route definitions to <code>controllers/routes.js</code>. That&#39;s where Taunus expects them to be. If you want to place them something else, <a href=\"/api\">the API documentation can help you</a>.</p>\n<pre><code class=\"lang-shell\">mv routes.js controllers/routes.js\n</code></pre>\n<p>Since you moved the routes you should also update the <code>require</code> statement in the <code>app.js</code> module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;),\n  &#39;layout&#39;: require(&#39;./views/layout.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p><img src=\"http://i.imgur.com/fJnHdYi.png\" alt=\"Screenshot with `taunus` output\"></p>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<p>The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use <code>client/js</code> to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let&#39;s stick to the conventions.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js\ntouch client/js/main.js\n</code></pre>\n<p>The <code>main</code> module will be used as the <em>entry point</em> of your application on the client-side. Here you&#39;ll need to import <code>taunus</code>, the wiring module we&#39;ve just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke <code>taunus.mount</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar wiring = require(&#39;../../.bin/wiring&#39;);\nvar main = document.getElementsByTagName(&#39;main&#39;)[0];\n\ntaunus.mount(main, wiring);\n</code></pre>\n<p>The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.</p>\n<p>By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won&#39;t be functional until the client-side controller runs.</p>\n<p>An alternative is to inline the view model alongside the views in a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag, but this tends to slow down the initial response (models are <em>typically larger</em> than the resulting views).</p>\n<p>A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that&#39;s harder to set up.</p>\n<p>The three booting strategies are explained in <a href=\"/api\">the API documentation</a> and further discussed in <a href=\"/performance\">the optimization guide</a>. For now, the default strategy <em>(<code>&#39;auto&#39;</code>)</em> should suffice. It fetches the view model using an AJAX request right after Taunus loads.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>Client-side controllers run whenever a view is rendered, even if it&#39;s a partial. The controller is passed the <code>model</code>, containing the model that was used to render the view; the <code>route</code>, broken down into its components; and the <code>container</code>, which is whatever DOM element the view was rendered into.</p>\n<p>These controllers are entirely optional, which makes sense since we&#39;re progressively enhancing the application: it might not even be necessary! Let&#39;s add some client-side functionality to the example we&#39;ve been building.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js/controllers/home\ntouch client/js/controllers/home/index.js\n</code></pre>\n<p>Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we&#39;ll just print the action and the model to the console. If there&#39;s one place where you&#39;d want to enhance the experience, client-side controllers are where you want to put your code.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model, container, route) {\n  console.log(&#39;Rendered view %s using model:\\n%s&#39;, route.action, JSON.stringify(model, null, 2));\n};\n</code></pre>\n<p>Since we weren&#39;t using the <code>--watch</code> flag from the Taunus CLI, you&#39;ll have to recompile the wiring at this point, so that the controller gets added to that manifest.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>Of course, you&#39;ll now have to wire up the client-side JavaScript using <a href=\"http://browserify.org/\">Browserify</a>!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"compiling-your-client-side-javascript\">Compiling your client-side JavaScript</h4>\n<p>You&#39;ll need to compile the <code>client/js/main.js</code> module, our client-side application&#39;s entry point, using Browserify since the code is written using CommonJS. In this example you&#39;ll install <code>browserify</code> globally to compile the code, but naturally you&#39;ll install it locally when working on a real-world application.</p>\n<pre><code class=\"lang-shell\">npm install --global browserify\n</code></pre>\n<p>Once you have the Browserify CLI, you&#39;ll be able to compile the code right from your command line. The <code>-d</code> flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The <code>-o</code> flag redirects output to the indicated file, whereas the output is printed to standard output by default.</p>\n<pre><code class=\"lang-shell\">mkdir -p .bin/public/js\nbrowserify client/js/main.js -do .bin/public/js/all.js\n</code></pre>\n<p>We haven&#39;t done much of anything with the Express application, so you&#39;ll need to adjust the <code>app.js</code> module to serve static assets. If you&#39;re used to Express, you&#39;ll notice there&#39;s nothing special about how we&#39;re using <code>serve-static</code>.</p>\n<pre><code class=\"lang-shell\">npm install --save serve-static\n</code></pre>\n<p>Let&#39;s configure the application to serve static assets from <code>.bin/public</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar serveStatic = require(&#39;serve-static&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\napp.use(serveStatic(&#39;.bin/public&#39;));\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Next up, you&#39;ll have to edit the layout to include the compiled JavaScript bundle file.</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\nscript(src=&#39;/js/all.js&#39;)\n</code></pre>\n<p>Lastly, you can execute the application and see it in action!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/68O84wX.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>If you open the application on a web browser, you&#39;ll notice that the appropriate information will be logged into the developer <code>console</code>.</p>\n<p><img src=\"http://i.imgur.com/ZUF6NFl.png\" alt=\"Screenshot with the application running under Google Chrome\"></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-client-side-taunus-api\">Using the client-side Taunus API</h4>\n<p>Taunus does provide <a href=\"/api\">a thin API</a> in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there&#39;s a few methods you can take advantage of on a global scale as well.</p>\n<p>Taunus can notify you whenever important events occur.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Besides events, there&#39;s a couple more methods you can use. The <code>taunus.navigate</code> method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there&#39;s <code>taunus.partial</code>, and that allows you to render any partial view on a DOM element of your choosing, and it&#39;ll then invoke its controller. You&#39;ll need to come up with the model yourself, though.</p>\n<p>Astonishingly, the API is further documented in <a href=\"/api\">the API documentation</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p><a href=\"/performance\">Performance</a> plays an important role in Taunus. That&#39;s why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?</p>\n<p>When turned on, by passing <code>{ cache: true }</code> as the third parameter for <code>taunus.mount</code>, the caching layer will make sure that responses are kept around for <code>15</code> seconds. Whenever a route needs a model in order to render a view, it&#39;ll first ask the caching layer for a fresh copy. If the caching layer doesn&#39;t have a copy, or if that copy is stale <em>(in this case, older than <code>15</code> seconds)</em>, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set <code>cache</code> to a number in seconds instead of just <code>true</code>.</p>\n<p>Since Taunus understands that not every view operates under the same constraints, you&#39;re also able to set a <code>cache</code> freshness duration directly in your routes. The <code>cache</code> property in routes has precedence over the default value.</p>\n<p>There&#39;s currently two caching stores: a raw in-memory store, and an <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">IndexedDB</a> store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of <code>localStorage</code>. It has <a href=\"http://caniuse.com/#feat=indexeddb\">surprisingly broad browser support</a>, and in the cases where it&#39;s not supported then caching is done solely in-memory.</p>\n<p>The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them <em>(the <code>touchstart</code> event)</em>, the prefetcher will issue an AJAX request for the view model for that link.</p>\n<p>If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their <em>(possibly limited)</em> Internet connection bandwidth.</p>\n<p>If the human clicks on the link before prefetching is completed, he&#39;ll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.</p>\n<p>Turning prefetching on is simply a matter of setting <code>prefetch</code> to <code>true</code> in the options passed to <code>taunus.mount</code>. For additional insights into the performance improvements Taunus can offer, head over to the <a href=\"/performance\">Performance Optimizations</a> guide.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<blockquote>\n<p>You&#39;ll find a <a href=\"https://github.com/taunus/getting-started\">full fledged version of the Getting Started</a> tutorial application on GitHub.</p>\n</blockquote>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Your first route](#your-first-route)\n      - [Creating a layout](#creating-a-layout)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Compiling your client-side JavaScript](#compiling-your-client-side-javascript)\n      - [Using the client-side Taunus API](#using-the-client-side-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    mkdir getting-started\n    cd getting-started\n    npm init\n    npm install --save taunus taunus-express express\n    ```\n\n    ![Screenshot with `npm init` output][30]\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][31]\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `routes` should be an array of view routes\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that [in the API documentation][18], but it defaults to `{}`)_.\n\n    Here's what you'd get if you attempted to run the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` results][32]\n\n    Turns out you're missing a lot of things! Taunus is quite lenient and it'll try its best to let you know what you might be missing, though. Apparently you don't have a layout, a server-side controller, or even a view! _That's rough._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"use the following combination of plain text and the **(maybe HTML)** partial view\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return 'This is the partial: \"' + model.partial + '\"';\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Here's what you'd get if you ran the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][33]\n\n    At this point we have a layout, but we're still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you're trying to get an MVC engine up and running, right?\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    mkdir -p views/home\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install --global jadum\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][34]\n\n    Granted, you should _probably_ move the layout into a Jade _(any view engine will do)_ template as well.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    mkdir -p controllers/home\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template!\n\n    ```shell\n    rm layout.js\n    touch views/layout.jade\n    jadum views/** --output .bin\n    ```\n\n    You should also remember to update the `app.js` module once again!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The `!=` syntax below means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][35]\n\n    You can now visit `localhost:3000` with your favorite web browser and you'll notice that the view renders as you'd expect. The title will be properly set, and a `<main>` element will have the contents of your view.\n\n    ![Screenshot with application running on Google Chrome][36]\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    Then there's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install --global taunus\n    ```\n\n    Before you can use the CLI, you should move the route definitions to `controllers/routes.js`. That's where Taunus expects them to be. If you want to place them something else, [the API documentation can help you][18].\n\n    ```shell\n    mv routes.js controllers/routes.js\n    ```\n\n    Since you moved the routes you should also update the `require` statement in the `app.js` module.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js'),\n      'layout': require('./views/layout.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    ![Screenshot with `taunus` output][37]\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use `client/js` to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let's stick to the conventions.\n\n    ```shell\n    mkdir -p client/js\n    touch client/js/main.js\n    ```\n\n    The `main` module will be used as the _entry point_ of your application on the client-side. Here you'll need to import `taunus`, the wiring module we've just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke `taunus.mount`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var wiring = require('../../.bin/wiring');\n    var main = document.getElementsByTagName('main')[0];\n\n    taunus.mount(main, wiring);\n    ```\n\n    The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.\n\n    By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won't be functional until the client-side controller runs.\n\n    An alternative is to inline the view model alongside the views in a `<script type='text/taunus'>` tag, but this tends to slow down the initial response (models are _typically larger_ than the resulting views).\n\n    A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that's harder to set up.\n\n    The three booting strategies are explained in [the API documentation][18] and further discussed in [the optimization guide][25]. For now, the default strategy _(`'auto'`)_ should suffice. It fetches the view model using an AJAX request right after Taunus loads.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    Client-side controllers run whenever a view is rendered, even if it's a partial. The controller is passed the `model`, containing the model that was used to render the view; the `route`, broken down into its components; and the `container`, which is whatever DOM element the view was rendered into.\n\n    These controllers are entirely optional, which makes sense since we're progressively enhancing the application: it might not even be necessary! Let's add some client-side functionality to the example we've been building.\n\n    ```shell\n    mkdir -p client/js/controllers/home\n    touch client/js/controllers/home/index.js\n    ```\n\n    Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we'll just print the action and the model to the console. If there's one place where you'd want to enhance the experience, client-side controllers are where you want to put your code.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model, container, route) {\n      console.log('Rendered view %s using model:\\n%s', route.action, JSON.stringify(model, null, 2));\n    };\n    ```\n\n    Since we weren't using the `--watch` flag from the Taunus CLI, you'll have to recompile the wiring at this point, so that the controller gets added to that manifest.\n\n    ```shell\n    taunus --output\n    ```\n\n    Of course, you'll now have to wire up the client-side JavaScript using [Browserify][38]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Compiling your client-side JavaScript\n\n    You'll need to compile the `client/js/main.js` module, our client-side application's entry point, using Browserify since the code is written using CommonJS. In this example you'll install `browserify` globally to compile the code, but naturally you'll install it locally when working on a real-world application.\n\n    ```shell\n    npm install --global browserify\n    ```\n\n    Once you have the Browserify CLI, you'll be able to compile the code right from your command line. The `-d` flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The `-o` flag redirects output to the indicated file, whereas the output is printed to standard output by default.\n\n    ```shell\n    mkdir -p .bin/public/js\n    browserify client/js/main.js -do .bin/public/js/all.js\n    ```\n\n    We haven't done much of anything with the Express application, so you'll need to adjust the `app.js` module to serve static assets. If you're used to Express, you'll notice there's nothing special about how we're using `serve-static`.\n\n    ```shell\n    npm install --save serve-static\n    ```\n\n    Let's configure the application to serve static assets from `.bin/public`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var serveStatic = require('serve-static');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    app.use(serveStatic('.bin/public'));\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Next up, you'll have to edit the layout to include the compiled JavaScript bundle file.\n\n    ```jade\n    title=model.title\n    main!=partial\n    script(src='/js/all.js')\n    ```\n\n    Lastly, you can execute the application and see it in action!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][39]\n\n    If you open the application on a web browser, you'll notice that the appropriate information will be logged into the developer `console`.\n\n    ![Screenshot with the application running under Google Chrome][40]\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the client-side Taunus API\n\n    Taunus does provide [a thin API][18] in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there's a few methods you can take advantage of on a global scale as well.\n\n    Taunus can notify you whenever important events occur.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Besides events, there's a couple more methods you can use. The `taunus.navigate` method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there's `taunus.partial`, and that allows you to render any partial view on a DOM element of your choosing, and it'll then invoke its controller. You'll need to come up with the model yourself, though.\n\n    Astonishingly, the API is further documented in [the API documentation][18].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    [Performance][25] plays an important role in Taunus. That's why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?\n\n    When turned on, by passing `{ cache: true }` as the third parameter for `taunus.mount`, the caching layer will make sure that responses are kept around for `15` seconds. Whenever a route needs a model in order to render a view, it'll first ask the caching layer for a fresh copy. If the caching layer doesn't have a copy, or if that copy is stale _(in this case, older than `15` seconds)_, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set `cache` to a number in seconds instead of just `true`.\n\n    Since Taunus understands that not every view operates under the same constraints, you're also able to set a `cache` freshness duration directly in your routes. The `cache` property in routes has precedence over the default value.\n\n    There's currently two caching stores: a raw in-memory store, and an [IndexedDB][28] store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of `localStorage`. It has [surprisingly broad browser support][29], and in the cases where it's not supported then caching is done solely in-memory.\n\n    The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them _(the `touchstart` event)_, the prefetcher will issue an AJAX request for the view model for that link.\n\n    If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their _(possibly limited)_ Internet connection bandwidth.\n\n    If the human clicks on the link before prefetching is completed, he'll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.\n\n    Turning prefetching on is simply a matter of setting `prefetch` to `true` in the options passed to `taunus.mount`. For additional insights into the performance improvements Taunus can offer, head over to the [Performance Optimizations][25] guide.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    > You'll find a [full fledged version of the Getting Started][41] tutorial application on GitHub.\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n    [28]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [29]: http://caniuse.com/#feat=indexeddb\n    [30]: http://i.imgur.com/4P8vNe9.png\n    [31]: http://i.imgur.com/n8mH4mN.png\n    [32]: http://i.imgur.com/08lnCec.png\n    [33]: http://i.imgur.com/wUbnCyk.png\n    [34]: http://i.imgur.com/zjaJYCq.png\n    [35]: http://i.imgur.com/NvEWx9z.png\n    [36]: http://i.imgur.com/LgZRFn5.png\n    [37]: http://i.imgur.com/fJnHdYi.png\n    [38]: http://browserify.org/\n    [39]: http://i.imgur.com/68O84wX.png\n    [40]: http://i.imgur.com/ZUF6NFl.png\n    [41]: https://github.com/taunus/getting-started\n");
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
var tracking;
var heading;

$('body').on('click', 'h1,h2,h3,h4,h5,h6', headingClick);

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

api.prev = relatedFactory('previousSibling');
api.next = relatedFactory('nextSibling');
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
  if (should) {
    elem.style.display = 'block';
  } else {
    elem.style.display = 'none';
  }
}

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

module.exports = {
  hyphenToCamel: hyphenToCamel
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
var isNative = require('./isNative');
var modern = 'history' in window && 'pushState' in history;

// Google Chrome 38 on iOS makes weird changes to history.replaceState, breaking it
var nativeReplace = modern && isNative(window.history.replaceState);

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
      scrollInto(route.parts.hash.substr(1), o.scroll);
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
    navigation(route, model, direction);
    partial(state.container, null, model, route);
    scrollInto(null, o.scroll);
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
  raf(scroll);

  function scroll () {
    scrollInto(orEmpty(route.parts.hash).substr(1));
  }
}

function scrollInto (id, enabled) {
  if (enabled === false) {
    return;
  }
  var elem = id && document.getElementById(id) || document.documentElement;
  if (elem && elem.scrollIntoView) {
    elem.scrollIntoView();
  }
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

},{"./clone":38,"./emitter":39,"./fetcher":41,"./isNative":45,"./partial":49,"./router":50,"./state":51,"raf":59}],36:[function(require,module,exports){
'use strict';

var clone = require('./clone');
var once = require('./once');
var raw = require('./stores/raw');
var idb = require('./stores/idb');
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

},{"./clone":38,"./once":48,"./stores/idb":52,"./stores/raw":53}],37:[function(require,module,exports){
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

},{"./emitter":39,"./interceptor":44,"./xhr":55}],42:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var links = require('./links');

function attach () {
  emitter.on('start', links);
}

module.exports = {
  attach: attach
};

},{"./emitter":39,"./links":46}],43:[function(require,module,exports){
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

},{"./activator":35,"./emitter":39,"./hooks":42,"./interceptor":44,"./mount":47,"./partial":49,"./router":50,"./state":51}],44:[function(require,module,exports){
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

},{}],46:[function(require,module,exports){
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

},{"./activator":35,"./events":40,"./fetcher":41,"./router":50,"./state":51}],47:[function(require,module,exports){
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
},{"./activator":35,"./caching":37,"./fetcher":41,"./router":50,"./state":51,"./unescape":54}],48:[function(require,module,exports){
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
  return left
      && right
      && left.route === right.route
      && JSON.stringify(left.params) === JSON.stringify(right.params);
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
},{"for-each":65,"trim":67}]},{},[16])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvY29udmVudGlvbnMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9tYWluLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvdGhyb3R0bGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL25vZGVfbW9kdWxlcy9wb3Nlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvbm9kZV9tb2R1bGVzL3Bvc2VyL3NyYy9icm93c2VyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9ub2RlX21vZHVsZXMvc2VrdG9yL3NyYy9zZWt0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLmN0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLnByb3RvdHlwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2NsYXNzZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9jb3JlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9tLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9taW51cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3B1YmxpYy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3Rlc3QuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy90ZXh0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vbm9kZV9tb2R1bGVzL2phZGUvcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvYWN0aXZhdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoaW5nLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2xvbmUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZXZlbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZmV0Y2hlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2hvb2tzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pbnRlcmNlcHRvci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2lzTmF0aXZlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbGlua3MuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9tb3VudC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL29uY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9wYXJ0aWFsLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcm91dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RhdGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9zdG9yZXMvaWRiLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL3Jhdy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3VuZXNjYXBlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIveGhyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9jb250cmEuZW1pdHRlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvc3JjL2NvbnRyYS5lbWl0dGVyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9mYXN0LXVybC1wYXJzZXIvc3JjL3VybHBhcnNlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvcmFmL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy9yb3V0ZXMvZGlzdC9yb3V0ZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9nbG9iYWwvd2luZG93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL29uY2Uvb25jZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy9mb3ItZWFjaC9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy9mb3ItZWFjaC9ub2RlX21vZHVsZXMvaXMtZnVuY3Rpb24vaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvdHJpbS9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL3BhcnNlLWhlYWRlcnMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvUkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk5BO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8qISBodHRwOi8vbXRocy5iZS9wdW55Y29kZSB2MS4yLjQgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cztcblx0dmFyIGZyZWVNb2R1bGUgPSB0eXBlb2YgbW9kdWxlID09ICdvYmplY3QnICYmIG1vZHVsZSAmJlxuXHRcdG1vZHVsZS5leHBvcnRzID09IGZyZWVFeHBvcnRzICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8IGZyZWVHbG9iYWwud2luZG93ID09PSBmcmVlR2xvYmFsKSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXiAtfl0vLCAvLyB1bnByaW50YWJsZSBBU0NJSSBjaGFycyArIG5vbi1BU0NJSSBjaGFyc1xuXHRyZWdleFNlcGFyYXRvcnMgPSAvXFx4MkV8XFx1MzAwMnxcXHVGRjBFfFxcdUZGNjEvZywgLy8gUkZDIDM0OTAgc2VwYXJhdG9yc1xuXG5cdC8qKiBFcnJvciBtZXNzYWdlcyAqL1xuXHRlcnJvcnMgPSB7XG5cdFx0J292ZXJmbG93JzogJ092ZXJmbG93OiBpbnB1dCBuZWVkcyB3aWRlciBpbnRlZ2VycyB0byBwcm9jZXNzJyxcblx0XHQnbm90LWJhc2ljJzogJ0lsbGVnYWwgaW5wdXQgPj0gMHg4MCAobm90IGEgYmFzaWMgY29kZSBwb2ludCknLFxuXHRcdCdpbnZhbGlkLWlucHV0JzogJ0ludmFsaWQgaW5wdXQnXG5cdH0sXG5cblx0LyoqIENvbnZlbmllbmNlIHNob3J0Y3V0cyAqL1xuXHRiYXNlTWludXNUTWluID0gYmFzZSAtIHRNaW4sXG5cdGZsb29yID0gTWF0aC5mbG9vcixcblx0c3RyaW5nRnJvbUNoYXJDb2RlID0gU3RyaW5nLmZyb21DaGFyQ29kZSxcblxuXHQvKiogVGVtcG9yYXJ5IHZhcmlhYmxlICovXG5cdGtleTtcblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGVycm9yIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSBlcnJvciB0eXBlLlxuXHQgKiBAcmV0dXJucyB7RXJyb3J9IFRocm93cyBhIGBSYW5nZUVycm9yYCB3aXRoIHRoZSBhcHBsaWNhYmxlIGVycm9yIG1lc3NhZ2UuXG5cdCAqL1xuXHRmdW5jdGlvbiBlcnJvcih0eXBlKSB7XG5cdFx0dGhyb3cgUmFuZ2VFcnJvcihlcnJvcnNbdHlwZV0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBgQXJyYXkjbWFwYCB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnkgYXJyYXlcblx0ICogaXRlbS5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBhcnJheSBvZiB2YWx1ZXMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwKGFycmF5LCBmbikge1xuXHRcdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdFx0d2hpbGUgKGxlbmd0aC0tKSB7XG5cdFx0XHRhcnJheVtsZW5ndGhdID0gZm4oYXJyYXlbbGVuZ3RoXSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHNpbXBsZSBgQXJyYXkjbWFwYC1saWtlIHdyYXBwZXIgdG8gd29yayB3aXRoIGRvbWFpbiBuYW1lIHN0cmluZ3MuXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdGhhdCBnZXRzIGNhbGxlZCBmb3IgZXZlcnlcblx0ICogY2hhcmFjdGVyLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IHN0cmluZyBvZiBjaGFyYWN0ZXJzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFja1xuXHQgKiBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcERvbWFpbihzdHJpbmcsIGZuKSB7XG5cdFx0cmV0dXJuIG1hcChzdHJpbmcuc3BsaXQocmVnZXhTZXBhcmF0b3JzKSwgZm4pLmpvaW4oJy4nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIG51bWVyaWMgY29kZSBwb2ludHMgb2YgZWFjaCBVbmljb2RlXG5cdCAqIGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLiBXaGlsZSBKYXZhU2NyaXB0IHVzZXMgVUNTLTIgaW50ZXJuYWxseSxcblx0ICogdGhpcyBmdW5jdGlvbiB3aWxsIGNvbnZlcnQgYSBwYWlyIG9mIHN1cnJvZ2F0ZSBoYWx2ZXMgKGVhY2ggb2Ygd2hpY2hcblx0ICogVUNTLTIgZXhwb3NlcyBhcyBzZXBhcmF0ZSBjaGFyYWN0ZXJzKSBpbnRvIGEgc2luZ2xlIGNvZGUgcG9pbnQsXG5cdCAqIG1hdGNoaW5nIFVURi0xNi5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5lbmNvZGVgXG5cdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGRlY29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBuZXcgYXJyYXkgb2YgY29kZSBwb2ludHMuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgY291bnRlciA9IDAsXG5cdFx0ICAgIGxlbmd0aCA9IHN0cmluZy5sZW5ndGgsXG5cdFx0ICAgIHZhbHVlLFxuXHRcdCAgICBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmRlY29kZWBcblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZW5jb2RlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGNvZGVQb2ludHMgVGhlIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuZXcgVW5pY29kZSBzdHJpbmcgKFVDUy0yKS5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJlbmNvZGUoYXJyYXkpIHtcblx0XHRyZXR1cm4gbWFwKGFycmF5LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdFx0aWYgKHZhbHVlID4gMHhGRkZGKSB7XG5cdFx0XHRcdHZhbHVlIC09IDB4MTAwMDA7XG5cdFx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApO1xuXHRcdFx0XHR2YWx1ZSA9IDB4REMwMCB8IHZhbHVlICYgMHgzRkY7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBiYXNpYyBjb2RlIHBvaW50IGludG8gYSBkaWdpdC9pbnRlZ2VyLlxuXHQgKiBAc2VlIGBkaWdpdFRvQmFzaWMoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVQb2ludCBUaGUgYmFzaWMgbnVtZXJpYyBjb2RlIHBvaW50IHZhbHVlLlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQgKGZvciB1c2UgaW5cblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuXHQgKiB0aGUgY29kZSBwb2ludCBkb2VzIG5vdCByZXByZXNlbnQgYSB2YWx1ZS5cblx0ICovXG5cdGZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQpIHtcblx0XHRpZiAoY29kZVBvaW50IC0gNDggPCAxMCkge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDIyO1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gNjUgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDY1O1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gOTcgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDk3O1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEBzZWUgYGJhc2ljVG9EaWdpdCgpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gZGlnaXQgVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzaWMgY29kZSBwb2ludCB3aG9zZSB2YWx1ZSAod2hlbiB1c2VkIGZvclxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGlzIGBkaWdpdGAsIHdoaWNoIG5lZWRzIHRvIGJlIGluIHRoZSByYW5nZVxuXHQgKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcblx0ICogdXNlZDsgZWxzZSwgdGhlIGxvd2VyY2FzZSBmb3JtIGlzIHVzZWQuIFRoZSBiZWhhdmlvciBpcyB1bmRlZmluZWRcblx0ICogaWYgYGZsYWdgIGlzIG5vbi16ZXJvIGFuZCBgZGlnaXRgIGhhcyBubyB1cHBlcmNhc2UgZm9ybS5cblx0ICovXG5cdGZ1bmN0aW9uIGRpZ2l0VG9CYXNpYyhkaWdpdCwgZmxhZykge1xuXHRcdC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG5cdFx0Ly8gMjYuLjM1IG1hcCB0byBBU0NJSSAwLi45XG5cdFx0cmV0dXJuIGRpZ2l0ICsgMjIgKyA3NSAqIChkaWdpdCA8IDI2KSAtICgoZmxhZyAhPSAwKSA8PCA1KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaWFzIGFkYXB0YXRpb24gZnVuY3Rpb24gYXMgcGVyIHNlY3Rpb24gMy40IG9mIFJGQyAzNDkyLlxuXHQgKiBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNDkyI3NlY3Rpb24tMy40XG5cdCAqIEBwcml2YXRlXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGFwdChkZWx0YSwgbnVtUG9pbnRzLCBmaXJzdFRpbWUpIHtcblx0XHR2YXIgayA9IDA7XG5cdFx0ZGVsdGEgPSBmaXJzdFRpbWUgPyBmbG9vcihkZWx0YSAvIGRhbXApIDogZGVsdGEgPj4gMTtcblx0XHRkZWx0YSArPSBmbG9vcihkZWx0YSAvIG51bVBvaW50cyk7XG5cdFx0Zm9yICgvKiBubyBpbml0aWFsaXphdGlvbiAqLzsgZGVsdGEgPiBiYXNlTWludXNUTWluICogdE1heCA+PiAxOyBrICs9IGJhc2UpIHtcblx0XHRcdGRlbHRhID0gZmxvb3IoZGVsdGEgLyBiYXNlTWludXNUTWluKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZsb29yKGsgKyAoYmFzZU1pbnVzVE1pbiArIDEpICogZGVsdGEgLyAoZGVsdGEgKyBza2V3KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzIHRvIGEgc3RyaW5nIG9mIFVuaWNvZGVcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGVjb2RlKGlucHV0KSB7XG5cdFx0Ly8gRG9uJ3QgdXNlIFVDUy0yXG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aCxcblx0XHQgICAgb3V0LFxuXHRcdCAgICBpID0gMCxcblx0XHQgICAgbiA9IGluaXRpYWxOLFxuXHRcdCAgICBiaWFzID0gaW5pdGlhbEJpYXMsXG5cdFx0ICAgIGJhc2ljLFxuXHRcdCAgICBqLFxuXHRcdCAgICBpbmRleCxcblx0XHQgICAgb2xkaSxcblx0XHQgICAgdyxcblx0XHQgICAgayxcblx0XHQgICAgZGlnaXQsXG5cdFx0ICAgIHQsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBiYXNlTWludXNUO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50czogbGV0IGBiYXNpY2AgYmUgdGhlIG51bWJlciBvZiBpbnB1dCBjb2RlXG5cdFx0Ly8gcG9pbnRzIGJlZm9yZSB0aGUgbGFzdCBkZWxpbWl0ZXIsIG9yIGAwYCBpZiB0aGVyZSBpcyBub25lLCB0aGVuIGNvcHlcblx0XHQvLyB0aGUgZmlyc3QgYmFzaWMgY29kZSBwb2ludHMgdG8gdGhlIG91dHB1dC5cblxuXHRcdGJhc2ljID0gaW5wdXQubGFzdEluZGV4T2YoZGVsaW1pdGVyKTtcblx0XHRpZiAoYmFzaWMgPCAwKSB7XG5cdFx0XHRiYXNpYyA9IDA7XG5cdFx0fVxuXG5cdFx0Zm9yIChqID0gMDsgaiA8IGJhc2ljOyArK2opIHtcblx0XHRcdC8vIGlmIGl0J3Mgbm90IGEgYmFzaWMgY29kZSBwb2ludFxuXHRcdFx0aWYgKGlucHV0LmNoYXJDb2RlQXQoaikgPj0gMHg4MCkge1xuXHRcdFx0XHRlcnJvcignbm90LWJhc2ljJyk7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQucHVzaChpbnB1dC5jaGFyQ29kZUF0KGopKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGRlY29kaW5nIGxvb3A6IHN0YXJ0IGp1c3QgYWZ0ZXIgdGhlIGxhc3QgZGVsaW1pdGVyIGlmIGFueSBiYXNpYyBjb2RlXG5cdFx0Ly8gcG9pbnRzIHdlcmUgY29waWVkOyBzdGFydCBhdCB0aGUgYmVnaW5uaW5nIG90aGVyd2lzZS5cblxuXHRcdGZvciAoaW5kZXggPSBiYXNpYyA+IDAgPyBiYXNpYyArIDEgOiAwOyBpbmRleCA8IGlucHV0TGVuZ3RoOyAvKiBubyBmaW5hbCBleHByZXNzaW9uICovKSB7XG5cblx0XHRcdC8vIGBpbmRleGAgaXMgdGhlIGluZGV4IG9mIHRoZSBuZXh0IGNoYXJhY3RlciB0byBiZSBjb25zdW1lZC5cblx0XHRcdC8vIERlY29kZSBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyIGludG8gYGRlbHRhYCxcblx0XHRcdC8vIHdoaWNoIGdldHMgYWRkZWQgdG8gYGlgLiBUaGUgb3ZlcmZsb3cgY2hlY2tpbmcgaXMgZWFzaWVyXG5cdFx0XHQvLyBpZiB3ZSBpbmNyZWFzZSBgaWAgYXMgd2UgZ28sIHRoZW4gc3VidHJhY3Qgb2ZmIGl0cyBzdGFydGluZ1xuXHRcdFx0Ly8gdmFsdWUgYXQgdGhlIGVuZCB0byBvYnRhaW4gYGRlbHRhYC5cblx0XHRcdGZvciAob2xkaSA9IGksIHcgPSAxLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblxuXHRcdFx0XHRpZiAoaW5kZXggPj0gaW5wdXRMZW5ndGgpIHtcblx0XHRcdFx0XHRlcnJvcignaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlnaXQgPSBiYXNpY1RvRGlnaXQoaW5wdXQuY2hhckNvZGVBdChpbmRleCsrKSk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0ID49IGJhc2UgfHwgZGlnaXQgPiBmbG9vcigobWF4SW50IC0gaSkgLyB3KSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aSArPSBkaWdpdCAqIHc7XG5cdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA8IHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0aWYgKHcgPiBmbG9vcihtYXhJbnQgLyBiYXNlTWludXNUKSkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dyAqPSBiYXNlTWludXNUO1xuXG5cdFx0XHR9XG5cblx0XHRcdG91dCA9IG91dHB1dC5sZW5ndGggKyAxO1xuXHRcdFx0YmlhcyA9IGFkYXB0KGkgLSBvbGRpLCBvdXQsIG9sZGkgPT0gMCk7XG5cblx0XHRcdC8vIGBpYCB3YXMgc3VwcG9zZWQgdG8gd3JhcCBhcm91bmQgZnJvbSBgb3V0YCB0byBgMGAsXG5cdFx0XHQvLyBpbmNyZW1lbnRpbmcgYG5gIGVhY2ggdGltZSwgc28gd2UnbGwgZml4IHRoYXQgbm93OlxuXHRcdFx0aWYgKGZsb29yKGkgLyBvdXQpID4gbWF4SW50IC0gbikge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0biArPSBmbG9vcihpIC8gb3V0KTtcblx0XHRcdGkgJT0gb3V0O1xuXG5cdFx0XHQvLyBJbnNlcnQgYG5gIGF0IHBvc2l0aW9uIGBpYCBvZiB0aGUgb3V0cHV0XG5cdFx0XHRvdXRwdXQuc3BsaWNlKGkrKywgMCwgbik7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdWNzMmVuY29kZShvdXRwdXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scyB0byBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5XG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGVuY29kZShpbnB1dCkge1xuXHRcdHZhciBuLFxuXHRcdCAgICBkZWx0YSxcblx0XHQgICAgaGFuZGxlZENQQ291bnQsXG5cdFx0ICAgIGJhc2ljTGVuZ3RoLFxuXHRcdCAgICBiaWFzLFxuXHRcdCAgICBqLFxuXHRcdCAgICBtLFxuXHRcdCAgICBxLFxuXHRcdCAgICBrLFxuXHRcdCAgICB0LFxuXHRcdCAgICBjdXJyZW50VmFsdWUsXG5cdFx0ICAgIG91dHB1dCA9IFtdLFxuXHRcdCAgICAvKiogYGlucHV0TGVuZ3RoYCB3aWxsIGhvbGQgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyBpbiBgaW5wdXRgLiAqL1xuXHRcdCAgICBpbnB1dExlbmd0aCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50UGx1c09uZSxcblx0XHQgICAgYmFzZU1pbnVzVCxcblx0XHQgICAgcU1pbnVzVDtcblxuXHRcdC8vIENvbnZlcnQgdGhlIGlucHV0IGluIFVDUy0yIHRvIFVuaWNvZGVcblx0XHRpbnB1dCA9IHVjczJkZWNvZGUoaW5wdXQpO1xuXG5cdFx0Ly8gQ2FjaGUgdGhlIGxlbmd0aFxuXHRcdGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgc3RhdGVcblx0XHRuID0gaW5pdGlhbE47XG5cdFx0ZGVsdGEgPSAwO1xuXHRcdGJpYXMgPSBpbml0aWFsQmlhcztcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHNcblx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgMHg4MCkge1xuXHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoY3VycmVudFZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aGFuZGxlZENQQ291bnQgPSBiYXNpY0xlbmd0aCA9IG91dHB1dC5sZW5ndGg7XG5cblx0XHQvLyBgaGFuZGxlZENQQ291bnRgIGlzIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgdGhhdCBoYXZlIGJlZW4gaGFuZGxlZDtcblx0XHQvLyBgYmFzaWNMZW5ndGhgIGlzIHRoZSBudW1iZXIgb2YgYmFzaWMgY29kZSBwb2ludHMuXG5cblx0XHQvLyBGaW5pc2ggdGhlIGJhc2ljIHN0cmluZyAtIGlmIGl0IGlzIG5vdCBlbXB0eSAtIHdpdGggYSBkZWxpbWl0ZXJcblx0XHRpZiAoYmFzaWNMZW5ndGgpIHtcblx0XHRcdG91dHB1dC5wdXNoKGRlbGltaXRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBlbmNvZGluZyBsb29wOlxuXHRcdHdoaWxlIChoYW5kbGVkQ1BDb3VudCA8IGlucHV0TGVuZ3RoKSB7XG5cblx0XHRcdC8vIEFsbCBub24tYmFzaWMgY29kZSBwb2ludHMgPCBuIGhhdmUgYmVlbiBoYW5kbGVkIGFscmVhZHkuIEZpbmQgdGhlIG5leHRcblx0XHRcdC8vIGxhcmdlciBvbmU6XG5cdFx0XHRmb3IgKG0gPSBtYXhJbnQsIGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA+PSBuICYmIGN1cnJlbnRWYWx1ZSA8IG0pIHtcblx0XHRcdFx0XHRtID0gY3VycmVudFZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluY3JlYXNlIGBkZWx0YWAgZW5vdWdoIHRvIGFkdmFuY2UgdGhlIGRlY29kZXIncyA8bixpPiBzdGF0ZSB0byA8bSwwPixcblx0XHRcdC8vIGJ1dCBndWFyZCBhZ2FpbnN0IG92ZXJmbG93XG5cdFx0XHRoYW5kbGVkQ1BDb3VudFBsdXNPbmUgPSBoYW5kbGVkQ1BDb3VudCArIDE7XG5cdFx0XHRpZiAobSAtIG4gPiBmbG9vcigobWF4SW50IC0gZGVsdGEpIC8gaGFuZGxlZENQQ291bnRQbHVzT25lKSkge1xuXHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsdGEgKz0gKG0gLSBuKSAqIGhhbmRsZWRDUENvdW50UGx1c09uZTtcblx0XHRcdG4gPSBtO1xuXG5cdFx0XHRmb3IgKGogPSAwOyBqIDwgaW5wdXRMZW5ndGg7ICsraikge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlIDwgbiAmJiArK2RlbHRhID4gbWF4SW50KSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID09IG4pIHtcblx0XHRcdFx0XHQvLyBSZXByZXNlbnQgZGVsdGEgYXMgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlclxuXHRcdFx0XHRcdGZvciAocSA9IGRlbHRhLCBrID0gYmFzZTsgLyogbm8gY29uZGl0aW9uICovOyBrICs9IGJhc2UpIHtcblx0XHRcdFx0XHRcdHQgPSBrIDw9IGJpYXMgPyB0TWluIDogKGsgPj0gYmlhcyArIHRNYXggPyB0TWF4IDogayAtIGJpYXMpO1xuXHRcdFx0XHRcdFx0aWYgKHEgPCB0KSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cU1pbnVzVCA9IHEgLSB0O1xuXHRcdFx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goXG5cdFx0XHRcdFx0XHRcdHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWModCArIHFNaW51c1QgJSBiYXNlTWludXNULCAwKSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRxID0gZmxvb3IocU1pbnVzVCAvIGJhc2VNaW51c1QpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShkaWdpdFRvQmFzaWMocSwgMCkpKTtcblx0XHRcdFx0XHRiaWFzID0gYWRhcHQoZGVsdGEsIGhhbmRsZWRDUENvdW50UGx1c09uZSwgaGFuZGxlZENQQ291bnQgPT0gYmFzaWNMZW5ndGgpO1xuXHRcdFx0XHRcdGRlbHRhID0gMDtcblx0XHRcdFx0XHQrK2hhbmRsZWRDUENvdW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdCsrZGVsdGE7XG5cdFx0XHQrK247XG5cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dC5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBVbmljb2RlLiBPbmx5IHRoZVxuXHQgKiBQdW55Y29kZWQgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IG9uIGEgc3RyaW5nIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBjb252ZXJ0ZWQgdG9cblx0ICogVW5pY29kZS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIFB1bnljb2RlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQgdG8gVW5pY29kZS5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFVuaWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIFB1bnljb2RlXG5cdCAqIHN0cmluZy5cblx0ICovXG5cdGZ1bmN0aW9uIHRvVW5pY29kZShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhQdW55Y29kZS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyBkZWNvZGUoc3RyaW5nLnNsaWNlKDQpLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgVW5pY29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gUHVueWNvZGUuIE9ubHkgdGhlXG5cdCAqIG5vbi1BU0NJSSBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0J3MgYWxyZWFkeSBpbiBBU0NJSS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lIHRvIGNvbnZlcnQsIGFzIGEgVW5pY29kZSBzdHJpbmcuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBQdW55Y29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gZG9tYWluIG5hbWUuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b0FTQ0lJKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleE5vbkFTQ0lJLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/ICd4bi0tJyArIGVuY29kZShzdHJpbmcpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqIERlZmluZSB0aGUgcHVibGljIEFQSSAqL1xuXHRwdW55Y29kZSA9IHtcblx0XHQvKipcblx0XHQgKiBBIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGN1cnJlbnQgUHVueWNvZGUuanMgdmVyc2lvbiBudW1iZXIuXG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgU3RyaW5nXG5cdFx0ICovXG5cdFx0J3ZlcnNpb24nOiAnMS4yLjQnLFxuXHRcdC8qKlxuXHRcdCAqIEFuIG9iamVjdCBvZiBtZXRob2RzIHRvIGNvbnZlcnQgZnJvbSBKYXZhU2NyaXB0J3MgaW50ZXJuYWwgY2hhcmFjdGVyXG5cdFx0ICogcmVwcmVzZW50YXRpb24gKFVDUy0yKSB0byBVbmljb2RlIGNvZGUgcG9pbnRzLCBhbmQgYmFjay5cblx0XHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIE9iamVjdFxuXHRcdCAqL1xuXHRcdCd1Y3MyJzoge1xuXHRcdFx0J2RlY29kZSc6IHVjczJkZWNvZGUsXG5cdFx0XHQnZW5jb2RlJzogdWNzMmVuY29kZVxuXHRcdH0sXG5cdFx0J2RlY29kZSc6IGRlY29kZSxcblx0XHQnZW5jb2RlJzogZW5jb2RlLFxuXHRcdCd0b0FTQ0lJJzogdG9BU0NJSSxcblx0XHQndG9Vbmljb2RlJzogdG9Vbmljb2RlXG5cdH07XG5cblx0LyoqIEV4cG9zZSBgcHVueWNvZGVgICovXG5cdC8vIFNvbWUgQU1EIGJ1aWxkIG9wdGltaXplcnMsIGxpa2Ugci5qcywgY2hlY2sgZm9yIHNwZWNpZmljIGNvbmRpdGlvbiBwYXR0ZXJuc1xuXHQvLyBsaWtlIHRoZSBmb2xsb3dpbmc6XG5cdGlmIChcblx0XHR0eXBlb2YgZGVmaW5lID09ICdmdW5jdGlvbicgJiZcblx0XHR0eXBlb2YgZGVmaW5lLmFtZCA9PSAnb2JqZWN0JyAmJlxuXHRcdGRlZmluZS5hbWRcblx0KSB7XG5cdFx0ZGVmaW5lKCdwdW55Y29kZScsIGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHB1bnljb2RlO1xuXHRcdH0pO1xuXHR9IGVsc2UgaWYgKGZyZWVFeHBvcnRzICYmICFmcmVlRXhwb3J0cy5ub2RlVHlwZSkge1xuXHRcdGlmIChmcmVlTW9kdWxlKSB7IC8vIGluIE5vZGUuanMgb3IgUmluZ29KUyB2MC44LjArXG5cdFx0XHRmcmVlTW9kdWxlLmV4cG9ydHMgPSBwdW55Y29kZTtcblx0XHR9IGVsc2UgeyAvLyBpbiBOYXJ3aGFsIG9yIFJpbmdvSlMgdjAuNy4wLVxuXHRcdFx0Zm9yIChrZXkgaW4gcHVueWNvZGUpIHtcblx0XHRcdFx0cHVueWNvZGUuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAoZnJlZUV4cG9ydHNba2V5XSA9IHB1bnljb2RlW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHsgLy8gaW4gUmhpbm8gb3IgYSB3ZWIgYnJvd3NlclxuXHRcdHJvb3QucHVueWNvZGUgPSBwdW55Y29kZTtcblx0fVxuXG59KHRoaXMpKTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBvYmpba10ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYWJvdXQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwid2h5LXRhdW51cy1cXFwiPldoeSBUYXVudXM/PC9oMT5cXG48cD5UYXVudXMgZm9jdXNlcyBvbiBkZWxpdmVyaW5nIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBleHBlcmllbmNlIHRvIHRoZSBlbmQtdXNlciwgd2hpbGUgcHJvdmlkaW5nIDxlbT5hIHJlYXNvbmFibGUgZGV2ZWxvcG1lbnQgZXhwZXJpZW5jZTwvZW0+IGFzIHdlbGwuIDxzdHJvbmc+VGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQ8L3N0cm9uZz4uIEl0IHVzZXMgc2VydmVyLXNpZGUgcmVuZGVyaW5nIHRvIGdldCBjb250ZW50IHRvIHlvdXIgaHVtYW5zIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCBpdCB1c2VzIGNsaWVudC1zaWRlIHJlbmRlcmluZyB0byBpbXByb3ZlIHRoZWlyIGV4cGVyaWVuY2UuPC9wPlxcbjxwPldoaWxlIGl0IGZvY3VzZXMgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIDxzdHJvbmc+PGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2FkanVzdGluZy11eC1mb3ItaHVtYW5zXFxcIj51c2FiaWxpdHk8L2E+IGFuZCBwZXJmb3JtYW5jZSBhcmUgYm90aCBjb3JlIGNvbmNlcm5zPC9zdHJvbmc+IGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgPHN0cm9uZz5zdGlsbCBleHBlY3RlZCB0byB3b3JrPC9zdHJvbmc+LjwvcD5cXG48cD5Gb3IgZXhhbXBsZSwgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIHNpdGUgdXNlcyBwbGFpbi1vbGQgbGlua3MgdG8gbmF2aWdhdGUgZnJvbSBvbmUgdmlldyB0byBhbm90aGVyLCBhbmQgdGhlbiBhZGRzIGEgPGNvZGU+Y2xpY2s8L2NvZGU+IGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0JiMzOTtzIG9rYXksIGJlY2F1c2Ugd2UgYWNrbm93bGVkZ2UgdGhhdCA8c3Ryb25nPm91ciBzaXRlcyBkb24mIzM5O3QgbmVlZCB0byBsb29rIGFuZCBiZWhhdmUgdGhlIHNhbWUgb24gZXZlcnkgYnJvd3Nlcjwvc3Ryb25nPi4gU2ltaWxhcmx5LCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXFwiPnBlcmZvcm1hbmNlIGlzIGdyZWF0bHkgZW5oYW5jZWQ8L2E+IGJ5IGRlbGl2ZXJpbmcgY29udGVudCB0byB0aGUgaHVtYW4gYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIHRoZW4gYWRkaW5nIGZ1bmN0aW9uYWxpdHkgb24gdG9wIG9mIHRoYXQuPC9wPlxcbjxwPldpdGggcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIGlmIHRoZSBmdW5jdGlvbmFsaXR5IG5ldmVyIGdldHMgdGhlcmUgYmVjYXVzZSBhIEphdmFTY3JpcHQgcmVzb3VyY2UgZmFpbGVkIHRvIGxvYWQgYmVjYXVzZSB0aGUgbmV0d29yayBmYWlsZWQgPGVtPihub3QgdW5jb21tb24gaW4gdGhlIG1vYmlsZSBlcmEpPC9lbT4gb3IgYmVjYXVzZSB0aGUgdXNlciBibG9ja2VkIEphdmFTY3JpcHQsIHlvdXIgYXBwbGljYXRpb24gd2lsbCBzdGlsbCB3b3JrITwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA0LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJ3aHktbm90LW90aGVyLWZyYW1ld29ya3MtXFxcIj5XaHkgTm90IE90aGVyIEZyYW1ld29ya3M/PC9oMT5cXG48cD5NYW55IG90aGVyIGZyYW1ld29ya3Mgd2VyZW4mIzM5O3QgZGVzaWduZWQgd2l0aCBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJiMzOTt0IHByaW9yaXRpemVkLCBhbmQgaHVtYW5zIGFyZSBleHBlY3RlZCB0byA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj5kb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgaHVtYW4tZGlnZXN0aWJsZSBjb250ZW50PC9hPi4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIFNFTyBpcyBhbHNvIGEgcHJvYmxlbS4gR29vZ2xlIGlzbiYjMzk7dCB0aGUgb25seSB3ZWIgY3Jhd2xlciBvcGVyYXRvciBvdXQgdGhlcmUsIGFuZCBpdCBtaWdodCBiZSBhIHdoaWxlIGJlZm9yZSBzb2NpYWwgbWVkaWEgbGluayBjcmF3bGVycyBjYXRjaCB1cCB3aXRoIHRoZW0uPC9wPlxcbjxwPkxhdGVseSwgd2UgY2FuIG9ic2VydmUgbWFueSBtYXR1cmUgb3Blbi1zb3VyY2UgZnJhbWV3b3JrcyBhcmUgZHJvcHBpbmcgc3VwcG9ydCBmb3Igb2xkZXIgYnJvd3NlcnMuIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5JiMzOTtyZSBhcmNoaXRlY3RlZCwgd2hlcmUgdGhlIGRldmVsb3BlciBpcyBwdXQgZmlyc3QuIDxzdHJvbmc+VGF1bnVzIGlzIDxhIGhyZWY9XFxcImh0dHBzOi8vdHdpdHRlci5jb20vaGFzaHRhZy9odW1hbmZpcnN0XFxcIj4jaHVtYW5maXJzdDwvYT48L3N0cm9uZz4sIG1lYW5pbmcgdGhhdCBpdCBjb25jZWRlcyB0aGF0IGh1bWFucyBhcmUgbW9yZSBpbXBvcnRhbnQgdGhhbiB0aGUgZGV2ZWxvcGVycyBidWlsZGluZyB0aGVpciBhcHBsaWNhdGlvbnMuPC9wPlxcbjxwPlByb2dyZXNzaXZlbHkgZW5oYW5jZWQgYXBwbGljYXRpb25zIGFyZSBhbHdheXMgZ29pbmcgdG8gaGF2ZSBncmVhdCBicm93c2VyIHN1cHBvcnQgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkmIzM5O3JlIGFyY2hpdGVjdGVkLiBBcyB0aGUgbmFtZSBpbXBsaWVzLCBhIGJhc2VsaW5lIGlzIGVzdGFibGlzaGVkIHdoZXJlIHdlIGRlbGl2ZXIgdGhlIGNvcmUgZXhwZXJpZW5jZSB0byB0aGUgdXNlciA8ZW0+KHR5cGljYWxseSBpbiB0aGUgZm9ybSBvZiByZWFkYWJsZSBIVE1MIGNvbnRlbnQpPC9lbT4sIGFuZCB0aGVuIGVuaGFuY2UgaXQgPHN0cm9uZz5pZiBwb3NzaWJsZTwvc3Ryb25nPiB1c2luZyBDU1MgYW5kIEphdmFTY3JpcHQuIEJ1aWxkaW5nIGFwcGxpY2F0aW9ucyBpbiB0aGlzIHdheSBtZWFucyB0aGF0IHlvdSYjMzk7bGwgYmUgYWJsZSB0byByZWFjaCB0aGUgbW9zdCBwZW9wbGUgd2l0aCB5b3VyIGNvcmUgZXhwZXJpZW5jZSwgYW5kIHlvdSYjMzk7bGwgYWxzbyBiZSBhYmxlIHRvIHByb3ZpZGUgaHVtYW5zIGluIG1vcmUgbW9kZXJuIGJyb3dzZXJzIHdpdGggYWxsIG9mIHRoZSBsYXRlc3QgZmVhdHVyZXMgYW5kIHRlY2hub2xvZ2llcy48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmVhdHVyZXNcXFwiPkZlYXR1cmVzPC9oMT5cXG48cD5PdXQgb2YgdGhlIGJveCwgVGF1bnVzIGVuc3VyZXMgdGhhdCB5b3VyIHNpdGUgd29ya3Mgb24gYW55IEhUTUwtZW5hYmxlZCBkb2N1bWVudCB2aWV3ZXIgYW5kIGV2ZW4gdGhlIHRlcm1pbmFsLCBwcm92aWRpbmcgc3VwcG9ydCBmb3IgcGxhaW4gdGV4dCByZXNwb25zZXMgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+d2l0aG91dCBhbnkgY29uZmlndXJhdGlvbiBuZWVkZWQ8L2E+LiBFdmVuIHdoaWxlIFRhdW51cyBwcm92aWRlcyBzaGFyZWQtcmVuZGVyaW5nIGNhcGFiaWxpdGllcywgaXQgb2ZmZXJzIGNvZGUgcmV1c2Ugb2Ygdmlld3MgYW5kIHJvdXRlcywgbWVhbmluZyB5b3UmIzM5O2xsIG9ubHkgaGF2ZSB0byBkZWNsYXJlIHRoZXNlIG9uY2UgYnV0IHRoZXkmIzM5O2xsIGJlIHVzZWQgaW4gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+VGF1bnVzIGZlYXR1cmVzIGEgcmVhc29uYWJseSBlbmhhbmNlZCBleHBlcmllbmNlLCB3aGVyZSBpZiBmZWF0dXJlcyBhcmVuJiMzOTt0IGF2YWlsYWJsZSBvbiBhIGJyb3dzZXIsIHRoZXkmIzM5O3JlIGp1c3Qgbm90IHByb3ZpZGVkLiBGb3IgZXhhbXBsZSwgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBtYWtlcyB1c2Ugb2YgdGhlIDxjb2RlPmhpc3Rvcnk8L2NvZGU+IEFQSSBidXQgaWYgdGhhdCYjMzk7cyBub3QgYXZhaWxhYmxlIHRoZW4gaXQmIzM5O2xsIGZhbGwgYmFjayB0byBzaW1wbHkgbm90IG1lZGRsaW5nIHdpdGggbGlua3MgaW5zdGVhZCBvZiB1c2luZyBhIGNsaWVudC1zaWRlLW9ubHkgaGFzaCByb3V0ZXIuPC9wPlxcbjxwPlRhdW51cyBjYW4gZGVhbCB3aXRoIHZpZXcgY2FjaGluZyBvbiB5b3VyIGJlaGFsZiwgaWYgeW91IHNvIGRlc2lyZSwgdXNpbmcgPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXFwiPmFzeW5jaHJvbm91cyBlbWJlZGRlZCBkYXRhYmFzZSBzdG9yZXM8L2E+IG9uIHRoZSBjbGllbnQtc2lkZS4gVHVybnMgb3V0LCB0aGVyZSYjMzk7cyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI3NlYXJjaD1pbmRleGVkZGJcXFwiPnByZXR0eSBnb29kIGJyb3dzZXIgc3VwcG9ydCBmb3IgSW5kZXhlZERCPC9hPi4gT2YgY291cnNlLCBJbmRleGVkREIgd2lsbCBvbmx5IGJlIHVzZWQgaWYgaXQmIzM5O3MgYXZhaWxhYmxlLCBhbmQgaWYgaXQmIzM5O3Mgbm90IHRoZW4gdmlld3Mgd29uJiMzOTt0IGJlIGNhY2hlZCBpbiB0aGUgY2xpZW50LXNpZGUgYmVzaWRlcyBhbiBpbi1tZW1vcnkgc3RvcmUuIDxzdHJvbmc+VGhlIHNpdGUgd29uJiMzOTt0IHNpbXBseSByb2xsIG92ZXIgYW5kIGRpZSwgdGhvdWdoLjwvc3Ryb25nPjwvcD5cXG48cD5JZiB5b3UmIzM5O3ZlIHR1cm5lZCBjbGllbnQtc2lkZSBjYWNoaW5nIG9uLCB0aGVuIHlvdSBjYW4gYWxzbyB0dXJuIG9uIHRoZSA8c3Ryb25nPnZpZXcgcHJlLWZldGNoaW5nIGZlYXR1cmU8L3N0cm9uZz4sIHdoaWNoIHdpbGwgc3RhcnQgZG93bmxvYWRpbmcgdmlld3MgYXMgc29vbiBhcyBodW1hbnMgaG92ZXIgb24gbGlua3MsIGFzIHRvIGRlbGl2ZXIgYSA8ZW0+ZmFzdGVyIHBlcmNlaXZlZCBodW1hbiBleHBlcmllbmNlPC9lbT4uPC9wPlxcbjxwPlRhdW51cyBwcm92aWRlcyB0aGUgYmFyZSBib25lcyBmb3IgeW91ciBhcHBsaWNhdGlvbiBzbyB0aGF0IHlvdSBjYW4gc2VwYXJhdGUgY29uY2VybnMgaW50byByb3V0ZXMsIGNvbnRyb2xsZXJzLCBtb2RlbHMsIGFuZCB2aWV3cy4gVGhlbiBpdCBnZXRzIG91dCBvZiB0aGUgd2F5LCBieSBkZXNpZ24uIFRoZXJlIGFyZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmEgZmV3IGNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4geW91IGNhbiB1c2UgdG8gZW5oYW5jZSB5b3VyIGRldmVsb3BtZW50IGV4cGVyaWVuY2UsIGFzIHdlbGwuPC9wPlxcbjxwPldpdGggVGF1bnVzIHlvdSYjMzk7bGwgYmUgaW4gY2hhcmdlLiA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5BcmUgeW91IHJlYWR5IHRvIGdldCBzdGFydGVkPzwvYT48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA3LCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogOCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiZmFtaWxpYXJpdHlcXFwiPkZhbWlsaWFyaXR5PC9oMT5cXG48cD5Zb3UgY2FuIHVzZSBUYXVudXMgdG8gZGV2ZWxvcCBhcHBsaWNhdGlvbnMgdXNpbmcgeW91ciBmYXZvcml0ZSBOb2RlLmpzIEhUVFAgc2VydmVyLCA8c3Ryb25nPmJvdGggPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGFuZCA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4gYXJlIGZ1bGx5IHN1cHBvcnRlZDwvc3Ryb25nPi4gSW4gYm90aCBjYXNlcywgeW91JiMzOTtsbCA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5idWlsZCBjb250cm9sbGVycyB0aGUgd2F5IHlvdSYjMzk7cmUgYWxyZWFkeSB1c2VkIHRvPC9hPiwgZXhjZXB0IHlvdSB3b24mIzM5O3QgaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiB0aGUgdmlldyBjb250cm9sbGVycyBvciBkZWZpbmUgYW55IHZpZXcgcm91dGVzIHNpbmNlIFRhdW51cyB3aWxsIGRlYWwgd2l0aCB0aGF0IG9uIHlvdXIgYmVoYWxmLiBJbiB0aGUgY29udHJvbGxlcnMgeW91JiMzOTtsbCBiZSBhYmxlIHRvIGRvIGV2ZXJ5dGhpbmcgeW91JiMzOTtyZSBhbHJlYWR5IGFibGUgdG8gZG8sIGFuZCB0aGVuIHlvdSYjMzk7bGwgaGF2ZSB0byByZXR1cm4gYSBKU09OIG1vZGVsIHdoaWNoIHdpbGwgYmUgdXNlZCB0byByZW5kZXIgYSB2aWV3LjwvcD5cXG48cD5Zb3UgY2FuIHVzZSBhbnkgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgeW91IHdhbnQsIHByb3ZpZGVkIHRoYXQgaXQgY2FuIGJlIGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuIFRoYXQmIzM5O3MgYmVjYXVzZSBUYXVudXMgdHJlYXRzIHZpZXdzIGFzIG1lcmUgSmF2YVNjcmlwdCBmdW5jdGlvbnMsIHJhdGhlciB0aGFuIGJlaW5nIHRpZWQgaW50byBhIHNwZWNpZmljIHZpZXctcmVuZGVyaW5nIGVuZ2luZS48L3A+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGp1c3QgZnVuY3Rpb25zLCB0b28uIFlvdSBjYW4gYnJpbmcgeW91ciBvd24gc2VsZWN0b3IgZW5naW5lLCB5b3VyIG93biBBSkFYIGxpYnJhcmllcywgYW5kIHlvdXIgb3duIGRhdGEtYmluZGluZyBzb2x1dGlvbnMuIEl0IG1pZ2h0IG1lYW4gdGhlcmUmIzM5O3MgYSBiaXQgbW9yZSB3b3JrIGludm9sdmVkIGZvciB5b3UsIGJ1dCB5b3UmIzM5O2xsIGFsc28gYmUgZnJlZSB0byBwaWNrIHdoYXRldmVyIGxpYnJhcmllcyB5b3UmIzM5O3JlIG1vc3QgY29tZm9ydGFibGUgd2l0aCEgVGhhdCBiZWluZyBzYWlkLCBUYXVudXMgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5kb2VzIHJlY29tbWVuZCBhIGZldyBsaWJyYXJpZXM8L2E+IHRoYXQgd29yayB3ZWxsIHdpdGggaXQuPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgV2h5IFRhdW51cz9cXG5cXG4gICAgVGF1bnVzIGZvY3VzZXMgb24gZGVsaXZlcmluZyBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgZXhwZXJpZW5jZSB0byB0aGUgZW5kLXVzZXIsIHdoaWxlIHByb3ZpZGluZyBfYSByZWFzb25hYmxlIGRldmVsb3BtZW50IGV4cGVyaWVuY2VfIGFzIHdlbGwuICoqVGF1bnVzIHByaW9yaXRpemVzIGNvbnRlbnQqKi4gSXQgdXNlcyBzZXJ2ZXItc2lkZSByZW5kZXJpbmcgdG8gZ2V0IGNvbnRlbnQgdG8geW91ciBodW1hbnMgYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIGl0IHVzZXMgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHRvIGltcHJvdmUgdGhlaXIgZXhwZXJpZW5jZS5cXG5cXG4gICAgV2hpbGUgaXQgZm9jdXNlcyBvbiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgKipbdXNhYmlsaXR5XVsyXSBhbmQgcGVyZm9ybWFuY2UgYXJlIGJvdGggY29yZSBjb25jZXJucyoqIGZvciBUYXVudXMuIEluY2lkZW50YWxseSwgZm9jdXNpbmcgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgYWxzbyBpbXByb3ZlcyBib3RoIG9mIHRoZXNlLiBVc2FiaWxpdHkgaXMgaW1wcm92ZWQgYmVjYXVzZSB0aGUgZXhwZXJpZW5jZSBpcyBncmFkdWFsbHkgaW1wcm92ZWQsIG1lYW5pbmcgdGhhdCBpZiBzb21ld2hlcmUgYWxvbmcgdGhlIGxpbmUgYSBmZWF0dXJlIGlzIG1pc3NpbmcsIHRoZSBjb21wb25lbnQgaXMgKipzdGlsbCBleHBlY3RlZCB0byB3b3JrKiouXFxuXFxuICAgIEZvciBleGFtcGxlLCBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgc2l0ZSB1c2VzIHBsYWluLW9sZCBsaW5rcyB0byBuYXZpZ2F0ZSBmcm9tIG9uZSB2aWV3IHRvIGFub3RoZXIsIGFuZCB0aGVuIGFkZHMgYSBgY2xpY2tgIGV2ZW50IGhhbmRsZXIgdGhhdCBibG9ja3MgbmF2aWdhdGlvbiBhbmQgaXNzdWVzIGFuIEFKQVggcmVxdWVzdCBpbnN0ZWFkLiBJZiBKYXZhU2NyaXB0IGZhaWxzIHRvIGxvYWQsIHBlcmhhcHMgdGhlIGV4cGVyaWVuY2UgbWlnaHQgc3RheSBhIGxpdHRsZSBiaXQgd29yc2UsIGJ1dCB0aGF0J3Mgb2theSwgYmVjYXVzZSB3ZSBhY2tub3dsZWRnZSB0aGF0ICoqb3VyIHNpdGVzIGRvbid0IG5lZWQgdG8gbG9vayBhbmQgYmVoYXZlIHRoZSBzYW1lIG9uIGV2ZXJ5IGJyb3dzZXIqKi4gU2ltaWxhcmx5LCBbcGVyZm9ybWFuY2UgaXMgZ3JlYXRseSBlbmhhbmNlZF1bMV0gYnkgZGVsaXZlcmluZyBjb250ZW50IHRvIHRoZSBodW1hbiBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgdGhlbiBhZGRpbmcgZnVuY3Rpb25hbGl0eSBvbiB0b3Agb2YgdGhhdC5cXG5cXG4gICAgV2l0aCBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCwgaWYgdGhlIGZ1bmN0aW9uYWxpdHkgbmV2ZXIgZ2V0cyB0aGVyZSBiZWNhdXNlIGEgSmF2YVNjcmlwdCByZXNvdXJjZSBmYWlsZWQgdG8gbG9hZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGZhaWxlZCBfKG5vdCB1bmNvbW1vbiBpbiB0aGUgbW9iaWxlIGVyYSlfIG9yIGJlY2F1c2UgdGhlIHVzZXIgYmxvY2tlZCBKYXZhU2NyaXB0LCB5b3VyIGFwcGxpY2F0aW9uIHdpbGwgc3RpbGwgd29yayFcXG5cXG4gICAgWzFdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvY3JpdGljYWwtcGF0aC1wZXJmb3JtYW5jZS1vcHRpbWl6YXRpb25cXG4gICAgWzJdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvYWRqdXN0aW5nLXV4LWZvci1odW1hbnNcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFdoeSBOb3QgT3RoZXIgRnJhbWV3b3Jrcz9cXG5cXG4gICAgTWFueSBvdGhlciBmcmFtZXdvcmtzIHdlcmVuJ3QgZGVzaWduZWQgd2l0aCBzaGFyZWQtcmVuZGVyaW5nIGluIG1pbmQuIENvbnRlbnQgaXNuJ3QgcHJpb3JpdGl6ZWQsIGFuZCBodW1hbnMgYXJlIGV4cGVjdGVkIHRvIFtkb3dubG9hZCBtb3N0IG9mIGEgd2ViIHBhZ2UgYmVmb3JlIHRoZXkgY2FuIHNlZSBhbnkgaHVtYW4tZGlnZXN0aWJsZSBjb250ZW50XVsyXS4gV2hpbGUgR29vZ2xlIGlzIGdvaW5nIHRvIHJlc29sdmUgdGhlIFNFTyBpc3N1ZXMgd2l0aCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIHNvb24sIFNFTyBpcyBhbHNvIGEgcHJvYmxlbS4gR29vZ2xlIGlzbid0IHRoZSBvbmx5IHdlYiBjcmF3bGVyIG9wZXJhdG9yIG91dCB0aGVyZSwgYW5kIGl0IG1pZ2h0IGJlIGEgd2hpbGUgYmVmb3JlIHNvY2lhbCBtZWRpYSBsaW5rIGNyYXdsZXJzIGNhdGNoIHVwIHdpdGggdGhlbS5cXG5cXG4gICAgTGF0ZWx5LCB3ZSBjYW4gb2JzZXJ2ZSBtYW55IG1hdHVyZSBvcGVuLXNvdXJjZSBmcmFtZXdvcmtzIGFyZSBkcm9wcGluZyBzdXBwb3J0IGZvciBvbGRlciBicm93c2Vycy4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQsIHdoZXJlIHRoZSBkZXZlbG9wZXIgaXMgcHV0IGZpcnN0LiAqKlRhdW51cyBpcyBbI2h1bWFuZmlyc3RdWzFdKiosIG1lYW5pbmcgdGhhdCBpdCBjb25jZWRlcyB0aGF0IGh1bWFucyBhcmUgbW9yZSBpbXBvcnRhbnQgdGhhbiB0aGUgZGV2ZWxvcGVycyBidWlsZGluZyB0aGVpciBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIFByb2dyZXNzaXZlbHkgZW5oYW5jZWQgYXBwbGljYXRpb25zIGFyZSBhbHdheXMgZ29pbmcgdG8gaGF2ZSBncmVhdCBicm93c2VyIHN1cHBvcnQgYmVjYXVzZSBvZiB0aGUgd2F5IHRoZXkncmUgYXJjaGl0ZWN0ZWQuIEFzIHRoZSBuYW1lIGltcGxpZXMsIGEgYmFzZWxpbmUgaXMgZXN0YWJsaXNoZWQgd2hlcmUgd2UgZGVsaXZlciB0aGUgY29yZSBleHBlcmllbmNlIHRvIHRoZSB1c2VyIF8odHlwaWNhbGx5IGluIHRoZSBmb3JtIG9mIHJlYWRhYmxlIEhUTUwgY29udGVudClfLCBhbmQgdGhlbiBlbmhhbmNlIGl0ICoqaWYgcG9zc2libGUqKiB1c2luZyBDU1MgYW5kIEphdmFTY3JpcHQuIEJ1aWxkaW5nIGFwcGxpY2F0aW9ucyBpbiB0aGlzIHdheSBtZWFucyB0aGF0IHlvdSdsbCBiZSBhYmxlIHRvIHJlYWNoIHRoZSBtb3N0IHBlb3BsZSB3aXRoIHlvdXIgY29yZSBleHBlcmllbmNlLCBhbmQgeW91J2xsIGFsc28gYmUgYWJsZSB0byBwcm92aWRlIGh1bWFucyBpbiBtb3JlIG1vZGVybiBicm93c2VycyB3aXRoIGFsbCBvZiB0aGUgbGF0ZXN0IGZlYXR1cmVzIGFuZCB0ZWNobm9sb2dpZXMuXFxuXFxuICAgIFsxXTogaHR0cHM6Ly90d2l0dGVyLmNvbS9oYXNodGFnL2h1bWFuZmlyc3RcXG4gICAgWzJdOiBodHRwOi8vcG9ueWZvby5jb20vYXJ0aWNsZXMvc3RvcC1icmVha2luZy10aGUtd2ViXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBGZWF0dXJlc1xcblxcbiAgICBPdXQgb2YgdGhlIGJveCwgVGF1bnVzIGVuc3VyZXMgdGhhdCB5b3VyIHNpdGUgd29ya3Mgb24gYW55IEhUTUwtZW5hYmxlZCBkb2N1bWVudCB2aWV3ZXIgYW5kIGV2ZW4gdGhlIHRlcm1pbmFsLCBwcm92aWRpbmcgc3VwcG9ydCBmb3IgcGxhaW4gdGV4dCByZXNwb25zZXMgW3dpdGhvdXQgYW55IGNvbmZpZ3VyYXRpb24gbmVlZGVkXVsyXS4gRXZlbiB3aGlsZSBUYXVudXMgcHJvdmlkZXMgc2hhcmVkLXJlbmRlcmluZyBjYXBhYmlsaXRpZXMsIGl0IG9mZmVycyBjb2RlIHJldXNlIG9mIHZpZXdzIGFuZCByb3V0ZXMsIG1lYW5pbmcgeW91J2xsIG9ubHkgaGF2ZSB0byBkZWNsYXJlIHRoZXNlIG9uY2UgYnV0IHRoZXknbGwgYmUgdXNlZCBpbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBUYXVudXMgZmVhdHVyZXMgYSByZWFzb25hYmx5IGVuaGFuY2VkIGV4cGVyaWVuY2UsIHdoZXJlIGlmIGZlYXR1cmVzIGFyZW4ndCBhdmFpbGFibGUgb24gYSBicm93c2VyLCB0aGV5J3JlIGp1c3Qgbm90IHByb3ZpZGVkLiBGb3IgZXhhbXBsZSwgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBtYWtlcyB1c2Ugb2YgdGhlIGBoaXN0b3J5YCBBUEkgYnV0IGlmIHRoYXQncyBub3QgYXZhaWxhYmxlIHRoZW4gaXQnbGwgZmFsbCBiYWNrIHRvIHNpbXBseSBub3QgbWVkZGxpbmcgd2l0aCBsaW5rcyBpbnN0ZWFkIG9mIHVzaW5nIGEgY2xpZW50LXNpZGUtb25seSBoYXNoIHJvdXRlci5cXG5cXG4gICAgVGF1bnVzIGNhbiBkZWFsIHdpdGggdmlldyBjYWNoaW5nIG9uIHlvdXIgYmVoYWxmLCBpZiB5b3Ugc28gZGVzaXJlLCB1c2luZyBbYXN5bmNocm9ub3VzIGVtYmVkZGVkIGRhdGFiYXNlIHN0b3Jlc11bM10gb24gdGhlIGNsaWVudC1zaWRlLiBUdXJucyBvdXQsIHRoZXJlJ3MgW3ByZXR0eSBnb29kIGJyb3dzZXIgc3VwcG9ydCBmb3IgSW5kZXhlZERCXVs0XS4gT2YgY291cnNlLCBJbmRleGVkREIgd2lsbCBvbmx5IGJlIHVzZWQgaWYgaXQncyBhdmFpbGFibGUsIGFuZCBpZiBpdCdzIG5vdCB0aGVuIHZpZXdzIHdvbid0IGJlIGNhY2hlZCBpbiB0aGUgY2xpZW50LXNpZGUgYmVzaWRlcyBhbiBpbi1tZW1vcnkgc3RvcmUuICoqVGhlIHNpdGUgd29uJ3Qgc2ltcGx5IHJvbGwgb3ZlciBhbmQgZGllLCB0aG91Z2guKipcXG5cXG4gICAgSWYgeW91J3ZlIHR1cm5lZCBjbGllbnQtc2lkZSBjYWNoaW5nIG9uLCB0aGVuIHlvdSBjYW4gYWxzbyB0dXJuIG9uIHRoZSAqKnZpZXcgcHJlLWZldGNoaW5nIGZlYXR1cmUqKiwgd2hpY2ggd2lsbCBzdGFydCBkb3dubG9hZGluZyB2aWV3cyBhcyBzb29uIGFzIGh1bWFucyBob3ZlciBvbiBsaW5rcywgYXMgdG8gZGVsaXZlciBhIF9mYXN0ZXIgcGVyY2VpdmVkIGh1bWFuIGV4cGVyaWVuY2VfLlxcblxcbiAgICBUYXVudXMgcHJvdmlkZXMgdGhlIGJhcmUgYm9uZXMgZm9yIHlvdXIgYXBwbGljYXRpb24gc28gdGhhdCB5b3UgY2FuIHNlcGFyYXRlIGNvbmNlcm5zIGludG8gcm91dGVzLCBjb250cm9sbGVycywgbW9kZWxzLCBhbmQgdmlld3MuIFRoZW4gaXQgZ2V0cyBvdXQgb2YgdGhlIHdheSwgYnkgZGVzaWduLiBUaGVyZSBhcmUgW2EgZmV3IGNvbXBsZW1lbnRhcnkgbW9kdWxlc11bMV0geW91IGNhbiB1c2UgdG8gZW5oYW5jZSB5b3VyIGRldmVsb3BtZW50IGV4cGVyaWVuY2UsIGFzIHdlbGwuXFxuXFxuICAgIFdpdGggVGF1bnVzIHlvdSdsbCBiZSBpbiBjaGFyZ2UuIFtBcmUgeW91IHJlYWR5IHRvIGdldCBzdGFydGVkP11bMl1cXG5cXG4gICAgWzFdOiAvY29tcGxlbWVudHNcXG4gICAgWzJdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFszXTogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0luZGV4ZWREQl9BUElcXG4gICAgWzRdOiBodHRwOi8vY2FuaXVzZS5jb20vI3NlYXJjaD1pbmRleGVkZGJcXG5cXG5zZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEZhbWlsaWFyaXR5XFxuXFxuICAgIFlvdSBjYW4gdXNlIFRhdW51cyB0byBkZXZlbG9wIGFwcGxpY2F0aW9ucyB1c2luZyB5b3VyIGZhdm9yaXRlIE5vZGUuanMgSFRUUCBzZXJ2ZXIsICoqYm90aCBbRXhwcmVzc11bM10gYW5kIFtIYXBpXVs0XSBhcmUgZnVsbHkgc3VwcG9ydGVkKiouIEluIGJvdGggY2FzZXMsIHlvdSdsbCBbYnVpbGQgY29udHJvbGxlcnMgdGhlIHdheSB5b3UncmUgYWxyZWFkeSB1c2VkIHRvXVsxXSwgZXhjZXB0IHlvdSB3b24ndCBoYXZlIHRvIGByZXF1aXJlYCB0aGUgdmlldyBjb250cm9sbGVycyBvciBkZWZpbmUgYW55IHZpZXcgcm91dGVzIHNpbmNlIFRhdW51cyB3aWxsIGRlYWwgd2l0aCB0aGF0IG9uIHlvdXIgYmVoYWxmLiBJbiB0aGUgY29udHJvbGxlcnMgeW91J2xsIGJlIGFibGUgdG8gZG8gZXZlcnl0aGluZyB5b3UncmUgYWxyZWFkeSBhYmxlIHRvIGRvLCBhbmQgdGhlbiB5b3UnbGwgaGF2ZSB0byByZXR1cm4gYSBKU09OIG1vZGVsIHdoaWNoIHdpbGwgYmUgdXNlZCB0byByZW5kZXIgYSB2aWV3LlxcblxcbiAgICBZb3UgY2FuIHVzZSBhbnkgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgeW91IHdhbnQsIHByb3ZpZGVkIHRoYXQgaXQgY2FuIGJlIGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuIFRoYXQncyBiZWNhdXNlIFRhdW51cyB0cmVhdHMgdmlld3MgYXMgbWVyZSBKYXZhU2NyaXB0IGZ1bmN0aW9ucywgcmF0aGVyIHRoYW4gYmVpbmcgdGllZCBpbnRvIGEgc3BlY2lmaWMgdmlldy1yZW5kZXJpbmcgZW5naW5lLlxcblxcbiAgICBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUganVzdCBmdW5jdGlvbnMsIHRvby4gWW91IGNhbiBicmluZyB5b3VyIG93biBzZWxlY3RvciBlbmdpbmUsIHlvdXIgb3duIEFKQVggbGlicmFyaWVzLCBhbmQgeW91ciBvd24gZGF0YS1iaW5kaW5nIHNvbHV0aW9ucy4gSXQgbWlnaHQgbWVhbiB0aGVyZSdzIGEgYml0IG1vcmUgd29yayBpbnZvbHZlZCBmb3IgeW91LCBidXQgeW91J2xsIGFsc28gYmUgZnJlZSB0byBwaWNrIHdoYXRldmVyIGxpYnJhcmllcyB5b3UncmUgbW9zdCBjb21mb3J0YWJsZSB3aXRoISBUaGF0IGJlaW5nIHNhaWQsIFRhdW51cyBbZG9lcyByZWNvbW1lbmQgYSBmZXcgbGlicmFyaWVzXVsyXSB0aGF0IHdvcmsgd2VsbCB3aXRoIGl0LlxcblxcbiAgICBbMV06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzJdOiAvY29tcGxlbWVudHNcXG4gICAgWzNdOiBodHRwOi8vZXhwcmVzc2pzLmNvbVxcbiAgICBbNF06IGh0dHA6Ly9oYXBpanMuY29tXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwaShsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiYXBpLWRvY3VtZW50YXRpb25cXFwiPkFQSSBEb2N1bWVudGF0aW9uPC9oMT5cXG48cD5IZXJlJiMzOTtzIHRoZSBBUEkgZG9jdW1lbnRhdGlvbiBmb3IgVGF1bnVzLiBJZiB5b3UmIzM5O3ZlIG5ldmVyIHVzZWQgaXQgYmVmb3JlLCB3ZSByZWNvbW1lbmQgZ29pbmcgb3ZlciB0aGUgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+R2V0dGluZyBTdGFydGVkPC9hPiBndWlkZSBiZWZvcmUganVtcGluZyBpbnRvIHRoZSBBUEkgZG9jdW1lbnRhdGlvbi4gVGhhdCB3YXksIHlvdSYjMzk7bGwgZ2V0IGEgYmV0dGVyIGlkZWEgb2Ygd2hhdCB0byBsb29rIGZvciBhbmQgaG93IHRvIHB1dCB0b2dldGhlciBzaW1wbGUgYXBwbGljYXRpb25zIHVzaW5nIFRhdW51cywgYmVmb3JlIGdvaW5nIHRocm91Z2ggZG9jdW1lbnRhdGlvbiBvbiBldmVyeSBwdWJsaWMgaW50ZXJmYWNlIHRvIFRhdW51cy48L3A+XFxuPHA+VGF1bnVzIGV4cG9zZXMgPGVtPnRocmVlIGRpZmZlcmVudCBwdWJsaWMgQVBJczwvZW0+LCBhbmQgdGhlcmUmIzM5O3MgYWxzbyA8c3Ryb25nPnBsdWdpbnMgdG8gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXI8L3N0cm9uZz4uIFRoaXMgZG9jdW1lbnQgY292ZXJzIGFsbCB0aHJlZSBBUElzIGV4dGVuc2l2ZWx5LiBJZiB5b3UmIzM5O3JlIGNvbmNlcm5lZCBhYm91dCB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgVGF1bnVzLCBwbGVhc2UgcmVmZXIgdG8gdGhlIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvYT4gZ3VpZGUuIFRoaXMgZG9jdW1lbnQgYWltcyB0byBvbmx5IGNvdmVyIGhvdyB0aGUgcHVibGljIGludGVyZmFjZSBhZmZlY3RzIGFwcGxpY2F0aW9uIHN0YXRlLCBidXQgPHN0cm9uZz5kb2VzbiYjMzk7dCBkZWx2ZSBpbnRvIGltcGxlbWVudGF0aW9uIGRldGFpbHM8L3N0cm9uZz4uPC9wPlxcbjxoMSBpZD1cXFwidGFibGUtb2YtY29udGVudHNcXFwiPlRhYmxlIG9mIENvbnRlbnRzPC9oMT5cXG48dWw+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI3NlcnZlci1zaWRlLWFwaVxcXCI+c2VydmVyLXNpZGUgQVBJPC9hPiB0aGF0IGRlYWxzIHdpdGggc2VydmVyLXNpZGUgcmVuZGVyaW5nPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudDwvY29kZT48L2E+IG1ldGhvZDx1bD5cXG48bGk+SXRzIDxhIGhyZWY9XFxcIiN0aGUtb3B0aW9ucy1vYmplY3RcXFwiPjxjb2RlPm9wdGlvbnM8L2NvZGU+PC9hPiBhcmd1bWVudDx1bD5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLWxheW91dC1cXFwiPjxjb2RlPmxheW91dDwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXJvdXRlcy1cXFwiPjxjb2RlPnJvdXRlczwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj48Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcGxhaW50ZXh0LVxcXCI+PGNvZGU+cGxhaW50ZXh0PC9jb2RlPjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+cmVzb2x2ZXJzPC9jb2RlPjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+SXRzIDxhIGhyZWY9XFxcIiMtYWRkcm91dGUtZGVmaW5pdGlvbi1cXFwiPjxjb2RlPmFkZFJvdXRlPC9jb2RlPjwvYT4gYXJndW1lbnQ8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJlbmRlci1hY3Rpb24tdmlld21vZGVsLXJlcS1yZXMtbmV4dC1cXFwiPjxjb2RlPnRhdW51cy5yZW5kZXI8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS1cXFwiPjxjb2RlPnRhdW51cy5yZWJ1aWxkRGVmYXVsdFZpZXdNb2RlbDwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNodHRwLWZyYW1ld29yay1wbHVnaW5zXFxcIj5zdWl0ZSBvZiBwbHVnaW5zPC9hPiBjYW4gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXI8dWw+XFxuPGxpPlVzaW5nIDxhIGhyZWY9XFxcIiN1c2luZy10YXVudXMtZXhwcmVzcy1cXFwiPjxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPjwvYT4gZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPjwvbGk+XFxuPGxpPlVzaW5nIDxhIGhyZWY9XFxcIiN1c2luZy10YXVudXMtaGFwaS1cXFwiPjxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPjwvYT4gZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNjb21tYW5kLWxpbmUtaW50ZXJmYWNlXFxcIj5DTEkgdGhhdCBwcm9kdWNlcyBhIHdpcmluZyBtb2R1bGU8L2E+IGZvciB0aGUgY2xpZW50LXNpZGU8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLW91dHB1dC1cXFwiPjxjb2RlPi0tb3V0cHV0PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXdhdGNoLVxcXCI+PGNvZGU+LS13YXRjaDwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10cmFuc2Zvcm0tbW9kdWxlLVxcXCI+PGNvZGU+LS10cmFuc2Zvcm0gJmx0O21vZHVsZSZndDs8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtcmVzb2x2ZXJzLW1vZHVsZS1cXFwiPjxjb2RlPi0tcmVzb2x2ZXJzICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXN0YW5kYWxvbmUtXFxcIj48Y29kZT4tLXN0YW5kYWxvbmU8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkEgPGEgaHJlZj1cXFwiI2NsaWVudC1zaWRlLWFwaVxcXCI+Y2xpZW50LXNpZGUgQVBJPC9hPiB0aGF0IGRlYWxzIHdpdGggY2xpZW50LXNpZGUgcmVuZGVyaW5nPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtY29udGFpbmVyLXdpcmluZy1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPjwvYT4gbWV0aG9kPHVsPlxcbjxsaT5Vc2luZyB0aGUgPGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1hdXRvLXN0cmF0ZWd5XFxcIj48Y29kZT5hdXRvPC9jb2RlPjwvYT4gc3RyYXRlZ3k8L2xpPlxcbjxsaT5Vc2luZyB0aGUgPGEgaHJlZj1cXFwiI3VzaW5nLXRoZS1pbmxpbmUtc3RyYXRlZ3lcXFwiPjxjb2RlPmlubGluZTwvY29kZT48L2E+IHN0cmF0ZWd5PC9saT5cXG48bGk+VXNpbmcgdGhlIDxhIGhyZWY9XFxcIiN1c2luZy10aGUtbWFudWFsLXN0cmF0ZWd5XFxcIj48Y29kZT5tYW51YWw8L2NvZGU+PC9hPiBzdHJhdGVneTwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nXFxcIj5DYWNoaW5nPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNwcmVmZXRjaGluZ1xcXCI+UHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1vbi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9uPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uY2UtdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vbmNlPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9mZi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9mZjwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1pbnRlcmNlcHQtYWN0aW9uLWZuLVxcXCI+PGNvZGU+dGF1bnVzLmludGVyY2VwdDwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1wYXJ0aWFsLWNvbnRhaW5lci1hY3Rpb24tbW9kZWwtXFxcIj48Y29kZT50YXVudXMucGFydGlhbDwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1uYXZpZ2F0ZS11cmwtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMucm91dGU8L2NvZGU+PC9hPiBtZXRob2Q8dWw+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yb3V0ZS1lcXVhbHMtcm91dGUtcm91dGUtXFxcIj48Y29kZT50YXVudXMucm91dGUuZXF1YWxzPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1zdGF0ZS1cXFwiPjxjb2RlPnRhdW51cy5zdGF0ZTwvY29kZT48L2E+IHByb3BlcnR5PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjdGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj48Y29kZT4udGF1bnVzcmM8L2NvZGU+PC9hPiBtYW5pZmVzdDwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcInNlcnZlci1zaWRlLWFwaVxcXCI+U2VydmVyLXNpZGUgQVBJPC9oMT5cXG48cD5UaGUgc2VydmVyLXNpZGUgQVBJIGlzIHVzZWQgdG8gc2V0IHVwIHRoZSB2aWV3IHJvdXRlci4gSXQgdGhlbiBnZXRzIG91dCBvZiB0aGUgd2F5LCBhbGxvd2luZyB0aGUgY2xpZW50LXNpZGUgdG8gZXZlbnR1YWxseSB0YWtlIG92ZXIgYW5kIGFkZCBhbnkgZXh0cmEgc3VnYXIgb24gdG9wLCA8ZW0+aW5jbHVkaW5nIGNsaWVudC1zaWRlIHJlbmRlcmluZzwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudChhZGRSb3V0ZSwgb3B0aW9ucz8pPC9jb2RlPjwvaDI+XFxuPHA+TW91bnRzIFRhdW51cyBvbiB0b3Agb2YgYSBzZXJ2ZXItc2lkZSByb3V0ZXIsIGJ5IHJlZ2lzdGVyaW5nIGVhY2ggcm91dGUgaW4gPGNvZGU+b3B0aW9ucy5yb3V0ZXM8L2NvZGU+IHdpdGggdGhlIDxjb2RlPmFkZFJvdXRlPC9jb2RlPiBtZXRob2QuPC9wPlxcbjxibG9ja3F1b3RlPlxcbjxwPk5vdGUgdGhhdCBtb3N0IG9mIHRoZSB0aW1lLCA8c3Ryb25nPnRoaXMgbWV0aG9kIHNob3VsZG4mIzM5O3QgYmUgaW52b2tlZCBkaXJlY3RseTwvc3Ryb25nPiwgYnV0IHJhdGhlciB0aHJvdWdoIG9uZSBvZiB0aGUgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgZnJhbWV3b3JrIHBsdWdpbnM8L2E+IHByZXNlbnRlZCBiZWxvdy48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPkhlcmUmIzM5O3MgYW4gaW5jb21wbGV0ZSBleGFtcGxlIG9mIGhvdyB0aGlzIG1ldGhvZCBtYXkgYmUgdXNlZC4gSXQgaXMgaW5jb21wbGV0ZSBiZWNhdXNlIHJvdXRlIGRlZmluaXRpb25zIGhhdmUgbW9yZSBvcHRpb25zIGJleW9uZCB0aGUgPGNvZGU+cm91dGU8L2NvZGU+IGFuZCA8Y29kZT5hY3Rpb248L2NvZGU+IHByb3BlcnRpZXMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnRhdW51cy5tb3VudChhZGRSb3V0ZSwge1xcbiAgcm91dGVzOiBbeyByb3V0ZTogJiMzOTsvJiMzOTssIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTsgfV1cXG59KTtcXG5cXG5mdW5jdGlvbiBhZGRSb3V0ZSAoZGVmaW5pdGlvbikge1xcbiAgYXBwLmdldChkZWZpbml0aW9uLnJvdXRlLCBkZWZpbml0aW9uLmFjdGlvbik7XFxufVxcbjwvY29kZT48L3ByZT5cXG48cD5MZXQmIzM5O3MgZ28gb3ZlciB0aGUgb3B0aW9ucyB5b3UgY2FuIHBhc3MgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBmaXJzdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ0aGUtb3B0aW9ucy1vYmplY3RcXFwiPlRoZSA8Y29kZT5vcHRpb25zPzwvY29kZT4gb2JqZWN0PC9oND5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBvcHRpb25zIHRoYXQgY2FuIGJlIHBhc3NlZCB0byB0aGUgc2VydmVyLXNpZGUgbW91bnRwb2ludC4gWW91JiMzOTtyZSBwcm9iYWJseSBnb2luZyB0byBiZSBwYXNzaW5nIHRoZXNlIHRvIHlvdXIgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgZnJhbWV3b3JrIHBsdWdpbjwvYT4sIHJhdGhlciB0aGFuIHVzaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZGlyZWN0bHkuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtbGF5b3V0LVxcXCI+PGNvZGU+b3B0aW9ucy5sYXlvdXQ/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgaXMgZXhwZWN0ZWQgdG8gaGF2ZSB0aGUgPGNvZGU+ZnVuY3Rpb24oZGF0YSk8L2NvZGU+IHNpZ25hdHVyZS4gSXQmIzM5O2xsIGJlIGludm9rZWQgd2hlbmV2ZXIgYSBmdWxsIEhUTUwgZG9jdW1lbnQgbmVlZHMgdG8gYmUgcmVuZGVyZWQsIGFuZCBhIDxjb2RlPmRhdGE8L2NvZGU+IG9iamVjdCB3aWxsIGJlIHBhc3NlZCB0byBpdC4gVGhhdCBvYmplY3Qgd2lsbCBjb250YWluIGV2ZXJ5dGhpbmcgeW91JiMzOTt2ZSBzZXQgYXMgdGhlIHZpZXcgbW9kZWwsIHBsdXMgYSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBjb250YWluaW5nIHRoZSByYXcgSFRNTCBvZiB0aGUgcmVuZGVyZWQgcGFydGlhbCB2aWV3LiBZb3VyIDxjb2RlPmxheW91dDwvY29kZT4gbWV0aG9kIHdpbGwgdHlwaWNhbGx5IHdyYXAgdGhlIHJhdyBIVE1MIGZvciB0aGUgcGFydGlhbCB3aXRoIHRoZSBiYXJlIGJvbmVzIG9mIGFuIEhUTUwgZG9jdW1lbnQuIENoZWNrIG91dCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvMzMyNzE3NTEzMTJkYjZlOTIwNTlkOTgyOTNkMGE3YWM2ZTllOGU1Yi92aWV3cy9zZXJ2ZXIvbGF5b3V0L2xheW91dC5qYWRlXFxcIj50aGUgPGNvZGU+bGF5b3V0LmphZGU8L2NvZGU+IHVzZWQgaW4gUG9ueSBGb288L2E+IGFzIGFuIGV4YW1wbGUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcm91dGVzLVxcXCI+PGNvZGU+b3B0aW9ucy5yb3V0ZXM8L2NvZGU+PC9oNj5cXG48cD5UaGUgb3RoZXIgYmlnIG9wdGlvbiBpcyA8Y29kZT5yb3V0ZXM8L2NvZGU+LCB3aGljaCBleHBlY3RzIGEgY29sbGVjdGlvbiBvZiByb3V0ZSBkZWZpbml0aW9ucy4gUm91dGUgZGVmaW5pdGlvbnMgdXNlIGEgbnVtYmVyIG9mIHByb3BlcnRpZXMgdG8gZGV0ZXJtaW5lIGhvdyB0aGUgcm91dGUgaXMgZ29pbmcgdG8gYmVoYXZlLjwvcD5cXG48cD5IZXJlJiMzOTtzIGFuIGV4YW1wbGUgcm91dGUgdGhhdCB1c2VzIHRoZSA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gcm91dGluZyBzY2hlbWUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPntcXG4gIHJvdXRlOiAmIzM5Oy9hcnRpY2xlcy86c2x1ZyYjMzk7LFxcbiAgYWN0aW9uOiAmIzM5O2FydGljbGVzL2FydGljbGUmIzM5OyxcXG4gIGlnbm9yZTogZmFsc2UsXFxuICBjYWNoZTogJmx0O2luaGVyaXQmZ3Q7XFxufVxcbjwvY29kZT48L3ByZT5cXG48dWw+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBpcyBhIHJvdXRlIGluIHRoZSBmb3JtYXQgeW91ciBIVFRQIGZyYW1ld29yayBvZiBjaG9pY2UgdW5kZXJzdGFuZHM8L2xpPlxcbjxsaT48Y29kZT5hY3Rpb248L2NvZGU+IGlzIHRoZSBuYW1lIG9mIHlvdXIgY29udHJvbGxlciBhY3Rpb24uIEl0JiMzOTtsbCBiZSB1c2VkIHRvIGZpbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCBzaG91bGQgYmUgdXNlZCB3aXRoIHRoaXMgcm91dGUsIGFuZCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvbGk+XFxuPGxpPjxjb2RlPmNhY2hlPC9jb2RlPiBjYW4gYmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGNsaWVudC1zaWRlIGNhY2hpbmcgYmVoYXZpb3IgaW4gdGhpcyBhcHBsaWNhdGlvbiBwYXRoLCBhbmQgaXQmIzM5O2xsIGRlZmF1bHQgdG8gaW5oZXJpdGluZyBmcm9tIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IDxlbT5vbiB0aGUgY2xpZW50LXNpZGU8L2VtPjwvbGk+XFxuPGxpPjxjb2RlPmlnbm9yZTwvY29kZT4gaXMgdXNlZCBpbiB0aG9zZSBjYXNlcyB3aGVyZSB5b3Ugd2FudCBhIFVSTCB0byBiZSBpZ25vcmVkIGJ5IHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZXZlbiBpZiB0aGVyZSYjMzk7cyBhIGNhdGNoLWFsbCByb3V0ZSB0aGF0IHdvdWxkIG1hdGNoIHRoYXQgVVJMPC9saT5cXG48L3VsPlxcbjxwPkFzIGFuIGV4YW1wbGUgb2YgdGhlIDxjb2RlPmlnbm9yZTwvY29kZT4gdXNlIGNhc2UsIGNvbnNpZGVyIHRoZSByb3V0aW5nIHRhYmxlIHNob3duIGJlbG93LiBUaGUgY2xpZW50LXNpZGUgcm91dGVyIGRvZXNuJiMzOTt0IGtub3cgPGVtPihhbmQgY2FuJiMzOTt0IGtub3cgdW5sZXNzIHlvdSBwb2ludCBpdCBvdXQpPC9lbT4gd2hhdCByb3V0ZXMgYXJlIHNlcnZlci1zaWRlIG9ubHksIGFuZCBpdCYjMzk7cyB1cCB0byB5b3UgdG8gcG9pbnQgdGhvc2Ugb3V0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj5bXFxuICB7IHJvdXRlOiAmIzM5Oy8mIzM5OywgYWN0aW9uOiAmIzM5Oy9ob21lL2luZGV4JiMzOTsgfSxcXG4gIHsgcm91dGU6ICYjMzk7L2ZlZWQmIzM5OywgaWdub3JlOiB0cnVlIH0sXFxuICB7IHJvdXRlOiAmIzM5Oy8qJiMzOTssIGFjdGlvbjogJiMzOTtlcnJvci9ub3QtZm91bmQmIzM5OyB9XFxuXVxcbjwvY29kZT48L3ByZT5cXG48cD5UaGlzIHN0ZXAgaXMgbmVjZXNzYXJ5IHdoZW5ldmVyIHlvdSBoYXZlIGFuIGFuY2hvciBsaW5rIHBvaW50ZWQgYXQgc29tZXRoaW5nIGxpa2UgYW4gUlNTIGZlZWQuIFRoZSA8Y29kZT5pZ25vcmU8L2NvZGU+IHByb3BlcnR5IGlzIGVmZmVjdGl2ZWx5IHRlbGxpbmcgdGhlIGNsaWVudC1zaWRlIDxlbT4mcXVvdDtkb24mIzM5O3QgaGlqYWNrIGxpbmtzIGNvbnRhaW5pbmcgdGhpcyBVUkwmcXVvdDs8L2VtPi48L3A+XFxuPHA+UGxlYXNlIG5vdGUgdGhhdCBleHRlcm5hbCBsaW5rcyBhcmUgbmV2ZXIgaGlqYWNrZWQuIE9ubHkgc2FtZS1vcmlnaW4gbGlua3MgY29udGFpbmluZyBhIFVSTCB0aGF0IG1hdGNoZXMgb25lIG9mIHRoZSByb3V0ZXMgd2lsbCBiZSBoaWphY2tlZCBieSBUYXVudXMuIEV4dGVybmFsIGxpbmtzIGRvbiYjMzk7dCBuZWVkIHRvIGJlIDxjb2RlPmlnbm9yZTwvY29kZT5kLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj48Y29kZT5vcHRpb25zLmdldERlZmF1bHRWaWV3TW9kZWw/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPmdldERlZmF1bHRWaWV3TW9kZWwoZG9uZSk8L2NvZGU+IHByb3BlcnR5IGNhbiBiZSBhIG1ldGhvZCB0aGF0IHB1dHMgdG9nZXRoZXIgdGhlIGJhc2UgdmlldyBtb2RlbCwgd2hpY2ggd2lsbCB0aGVuIGJlIGV4dGVuZGVkIG9uIGFuIGFjdGlvbi1ieS1hY3Rpb24gYmFzaXMuIFdoZW4geW91JiMzOTtyZSBkb25lIGNyZWF0aW5nIGEgdmlldyBtb2RlbCwgeW91IGNhbiBpbnZva2UgPGNvZGU+ZG9uZShudWxsLCBtb2RlbCk8L2NvZGU+LiBJZiBhbiBlcnJvciBvY2N1cnMgd2hpbGUgYnVpbGRpbmcgdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgY2FsbCA8Y29kZT5kb25lKGVycik8L2NvZGU+IGluc3RlYWQuPC9wPlxcbjxwPlRhdW51cyB3aWxsIHRocm93IGFuIGVycm9yIGlmIDxjb2RlPmRvbmU8L2NvZGU+IGlzIGludm9rZWQgd2l0aCBhbiBlcnJvciwgc28geW91IG1pZ2h0IHdhbnQgdG8gcHV0IHNhZmVndWFyZHMgaW4gcGxhY2UgYXMgdG8gYXZvaWQgdGhhdCBmcm9tIGhhcHBlbm5pbmcuIFRoZSByZWFzb24gdGhpcyBtZXRob2QgaXMgYXN5bmNocm9ub3VzIGlzIGJlY2F1c2UgeW91IG1heSBuZWVkIGRhdGFiYXNlIGFjY2VzcyBvciBzb21lc3VjaCB3aGVuIHB1dHRpbmcgdG9nZXRoZXIgdGhlIGRlZmF1bHRzLiBUaGUgcmVhc29uIHRoaXMgaXMgYSBtZXRob2QgYW5kIG5vdCBqdXN0IGFuIG9iamVjdCBpcyB0aGF0IHRoZSBkZWZhdWx0cyBtYXkgY2hhbmdlIGR1ZSB0byBodW1hbiBpbnRlcmFjdGlvbiB3aXRoIHRoZSBhcHBsaWNhdGlvbiwgYW5kIGluIHRob3NlIGNhc2VzIDxhIGhyZWY9XFxcIiN0YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWxcXFwiPnRoZSBkZWZhdWx0cyBjYW4gYmUgcmVidWlsdDwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcGxhaW50ZXh0LVxcXCI+PGNvZGU+b3B0aW9ucy5wbGFpbnRleHQ/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPnBsYWludGV4dDwvY29kZT4gb3B0aW9ucyBvYmplY3QgaXMgcGFzc2VkIGRpcmVjdGx5IHRvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9oZ2V0XFxcIj5oZ2V0PC9hPiwgYW5kIGl0JiMzOTtzIHVzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iL2Y2ZDZiNTA2OGZmMDNhMzg3ZjUwMzkwMDE2MGQ5ZmRjMWU3NDk3NTAvY29udHJvbGxlcnMvcm91dGluZy5qcyNMNzAtTDcyXFxcIj50d2VhayB0aGUgcGxhaW50ZXh0IHZlcnNpb248L2E+IG9mIHlvdXIgc2l0ZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1yZXNvbHZlcnMtXFxcIj48Y29kZT5vcHRpb25zLnJlc29sdmVycz88L2NvZGU+PC9oNj5cXG48cD5SZXNvbHZlcnMgYXJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBsb2NhdGlvbiBvZiBzb21lIG9mIHRoZSBkaWZmZXJlbnQgcGllY2VzIG9mIHlvdXIgYXBwbGljYXRpb24uIFR5cGljYWxseSB5b3Ugd29uJiMzOTt0IGhhdmUgdG8gdG91Y2ggdGhlc2UgaW4gdGhlIHNsaWdodGVzdC48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPlNpZ25hdHVyZTwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0U2VydmVyQ29udHJvbGxlcihhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0VmlldyhhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5UaGUgPGNvZGU+YWRkUm91dGU8L2NvZGU+IG1ldGhvZCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBvbiB0aGUgc2VydmVyLXNpZGUgaXMgbW9zdGx5IGdvaW5nIHRvIGJlIHVzZWQgaW50ZXJuYWxseSBieSB0aGUgSFRUUCBmcmFtZXdvcmsgcGx1Z2lucywgc28gZmVlbCBmcmVlIHRvIHNraXAgb3ZlciB0aGUgZm9sbG93aW5nIHNlY3Rpb24uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiLWFkZHJvdXRlLWRlZmluaXRpb24tXFxcIj48Y29kZT5hZGRSb3V0ZShkZWZpbml0aW9uKTwvY29kZT48L2g0PlxcbjxwPlRoZSA8Y29kZT5hZGRSb3V0ZShkZWZpbml0aW9uKTwvY29kZT4gbWV0aG9kIHdpbGwgYmUgcGFzc2VkIGEgcm91dGUgZGVmaW5pdGlvbiwgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXMuIFRoaXMgbWV0aG9kIGlzIGV4cGVjdGVkIHRvIHJlZ2lzdGVyIGEgcm91dGUgaW4geW91ciBIVFRQIGZyYW1ld29yayYjMzk7cyByb3V0ZXIuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+cm91dGU8L2NvZGU+IGlzIHRoZSByb3V0ZSB0aGF0IHlvdSBzZXQgYXMgPGNvZGU+ZGVmaW5pdGlvbi5yb3V0ZTwvY29kZT48L2xpPlxcbjxsaT48Y29kZT5hY3Rpb248L2NvZGU+IGlzIHRoZSBhY3Rpb24gYXMgcGFzc2VkIHRvIHRoZSByb3V0ZSBkZWZpbml0aW9uPC9saT5cXG48bGk+PGNvZGU+YWN0aW9uRm48L2NvZGU+IHdpbGwgYmUgdGhlIGNvbnRyb2xsZXIgZm9yIHRoaXMgYWN0aW9uIG1ldGhvZDwvbGk+XFxuPGxpPjxjb2RlPm1pZGRsZXdhcmU8L2NvZGU+IHdpbGwgYmUgYW4gYXJyYXkgb2YgbWV0aG9kcyB0byBiZSBleGVjdXRlZCBiZWZvcmUgPGNvZGU+YWN0aW9uRm48L2NvZGU+PC9saT5cXG48L3VsPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yZW5kZXItYWN0aW9uLXZpZXdtb2RlbC1yZXEtcmVzLW5leHQtXFxcIj48Y29kZT50YXVudXMucmVuZGVyKGFjdGlvbiwgdmlld01vZGVsLCByZXEsIHJlcywgbmV4dCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBpcyBhbG1vc3QgYW4gaW1wbGVtZW50YXRpb24gZGV0YWlsIGFzIHlvdSBzaG91bGQgYmUgdXNpbmcgVGF1bnVzIHRocm91Z2ggb25lIG9mIHRoZSBwbHVnaW5zIGFueXdheXMsIHNvIHdlIHdvbiYjMzk7dCBnbyB2ZXJ5IGRlZXAgaW50byBpdC48L3A+XFxuPHA+VGhlIHJlbmRlciBtZXRob2QgaXMgd2hhdCBUYXVudXMgdXNlcyB0byByZW5kZXIgdmlld3MgYnkgY29uc3RydWN0aW5nIEhUTUwsIEpTT04sIG9yIHBsYWludGV4dCByZXNwb25zZXMuIFRoZSA8Y29kZT5hY3Rpb248L2NvZGU+IHByb3BlcnR5IGRldGVybWluZXMgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHdpbGwgYmUgcmVuZGVyZWQuIFRoZSA8Y29kZT52aWV3TW9kZWw8L2NvZGU+IHdpbGwgYmUgZXh0ZW5kZWQgYnkgPGEgaHJlZj1cXFwiIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj50aGUgZGVmYXVsdCB2aWV3IG1vZGVsPC9hPiwgYW5kIGl0IG1heSBhbHNvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IDxjb2RlPmFjdGlvbjwvY29kZT4gYnkgc2V0dGluZyA8Y29kZT52aWV3TW9kZWwubW9kZWwuYWN0aW9uPC9jb2RlPi48L3A+XFxuPHA+VGhlIDxjb2RlPnJlcTwvY29kZT4sIDxjb2RlPnJlczwvY29kZT4sIGFuZCA8Y29kZT5uZXh0PC9jb2RlPiBhcmd1bWVudHMgYXJlIGV4cGVjdGVkIHRvIGJlIHRoZSBFeHByZXNzIHJvdXRpbmcgYXJndW1lbnRzLCBidXQgdGhleSBjYW4gYWxzbyBiZSBtb2NrZWQgPGVtPih3aGljaCBpcyBpbiBmYWN0IHdoYXQgdGhlIEhhcGkgcGx1Z2luIGRvZXMpPC9lbT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsKGRvbmU/KTwvY29kZT48L2gyPlxcbjxwPk9uY2UgVGF1bnVzIGhhcyBiZWVuIG1vdW50ZWQsIGNhbGxpbmcgdGhpcyBtZXRob2Qgd2lsbCByZWJ1aWxkIHRoZSB2aWV3IG1vZGVsIGRlZmF1bHRzIHVzaW5nIHRoZSA8Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsPC9jb2RlPiB0aGF0IHdhcyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpbiB0aGUgb3B0aW9ucy4gQW4gb3B0aW9uYWwgPGNvZGU+ZG9uZTwvY29kZT4gY2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gdGhlIG1vZGVsIGlzIHJlYnVpbHQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+SFRUUCBGcmFtZXdvcmsgUGx1Z2luczwvaDE+XFxuPHA+VGhlcmUmIzM5O3MgY3VycmVudGx5IHR3byBkaWZmZXJlbnQgSFRUUCBmcmFtZXdvcmtzIDxlbT4oPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGFuZCA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4pPC9lbT4gdGhhdCB5b3UgY2FuIHJlYWRpbHkgdXNlIHdpdGggVGF1bnVzIHdpdGhvdXQgaGF2aW5nIHRvIGRlYWwgd2l0aCBhbnkgb2YgdGhlIHJvdXRlIHBsdW1iaW5nIHlvdXJzZWxmLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcInVzaW5nLXRhdW51cy1leHByZXNzLVxcXCI+VXNpbmcgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+PC9oMj5cXG48cD5UaGUgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+IHBsdWdpbiBpcyBwcm9iYWJseSB0aGUgZWFzaWVzdCB0byB1c2UsIGFzIFRhdW51cyB3YXMgb3JpZ2luYWxseSBkZXZlbG9wZWQgd2l0aCBqdXN0IDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBpbiBtaW5kLiBJbiBhZGRpdGlvbiB0byB0aGUgb3B0aW9ucyBhbHJlYWR5IG91dGxpbmVkIGZvciA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+dGF1bnVzLm1vdW50PC9hPiwgeW91IGNhbiBhZGQgbWlkZGxld2FyZSBmb3IgYW55IHJvdXRlIGluZGl2aWR1YWxseS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5taWRkbGV3YXJlPC9jb2RlPiBhcmUgYW55IG1ldGhvZHMgeW91IHdhbnQgVGF1bnVzIHRvIGV4ZWN1dGUgYXMgbWlkZGxld2FyZSBpbiBFeHByZXNzIGFwcGxpY2F0aW9uczwvbGk+XFxuPC91bD5cXG48cD5UbyBnZXQgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+IGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgcHJvdmlkZWQgdGhhdCB5b3UgY29tZSB1cCB3aXRoIGFuIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgLy8gLi4uXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+IG1ldGhvZCB3aWxsIG1lcmVseSBzZXQgdXAgVGF1bnVzIGFuZCBhZGQgdGhlIHJlbGV2YW50IHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgYXBwbGljYXRpb24gYnkgY2FsbGluZyA8Y29kZT5hcHAuZ2V0PC9jb2RlPiBhIGJ1bmNoIG9mIHRpbWVzLiBZb3UgY2FuIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXFwiPmZpbmQgdGF1bnVzLWV4cHJlc3Mgb24gR2l0SHViPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCJ1c2luZy10YXVudXMtaGFwaS1cXFwiPlVzaW5nIDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPjwvaDI+XFxuPHA+VGhlIDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPiBwbHVnaW4gaXMgYSBiaXQgbW9yZSBpbnZvbHZlZCwgYW5kIHlvdSYjMzk7bGwgaGF2ZSB0byBjcmVhdGUgYSBQYWNrIGluIG9yZGVyIHRvIHVzZSBpdC4gSW4gYWRkaXRpb24gdG8gPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPnRoZSBvcHRpb25zIHdlJiMzOTt2ZSBhbHJlYWR5IGNvdmVyZWQ8L2E+LCB5b3UgY2FuIGFkZCA8Y29kZT5jb25maWc8L2NvZGU+IG9uIGFueSByb3V0ZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5jb25maWc8L2NvZGU+IGlzIHBhc3NlZCBkaXJlY3RseSBpbnRvIHRoZSByb3V0ZSByZWdpc3RlcmVkIHdpdGggSGFwaSwgZ2l2aW5nIHlvdSB0aGUgbW9zdCBmbGV4aWJpbGl0eTwvbGk+XFxuPC91bD5cXG48cD5UbyBnZXQgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+IGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgYW5kIHlvdSBjYW4gYnJpbmcgeW91ciBvd24gPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgSGFwaSA9IHJlcXVpcmUoJiMzOTtoYXBpJiMzOTspO1xcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNIYXBpID0gcmVxdWlyZSgmIzM5O3RhdW51cy1oYXBpJiMzOTspKHRhdW51cyk7XFxudmFyIHBhY2sgPSBuZXcgSGFwaS5QYWNrKCk7XFxuXFxucGFjay5yZWdpc3Rlcih7XFxuICBwbHVnaW46IHRhdW51c0hhcGksXFxuICBvcHRpb25zOiB7XFxuICAgIC8vIC4uLlxcbiAgfVxcbn0pO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgPGNvZGU+dGF1bnVzSGFwaTwvY29kZT4gcGx1Z2luIHdpbGwgbW91bnQgVGF1bnVzIGFuZCByZWdpc3RlciBhbGwgb2YgdGhlIG5lY2Vzc2FyeSByb3V0ZXMuIFlvdSBjYW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcXCI+ZmluZCB0YXVudXMtaGFwaSBvbiBHaXRIdWI8L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImNvbW1hbmQtbGluZS1pbnRlcmZhY2VcXFwiPkNvbW1hbmQtTGluZSBJbnRlcmZhY2U8L2gxPlxcbjxwPk9uY2UgeW91JiMzOTt2ZSBzZXQgdXAgdGhlIHNlcnZlci1zaWRlIHRvIHJlbmRlciB5b3VyIHZpZXdzIHVzaW5nIFRhdW51cywgaXQmIzM5O3Mgb25seSBsb2dpY2FsIHRoYXQgeW91JiMzOTtsbCB3YW50IHRvIHJlbmRlciB0aGUgdmlld3MgaW4gdGhlIGNsaWVudC1zaWRlIGFzIHdlbGwsIGVmZmVjdGl2ZWx5IGNvbnZlcnRpbmcgeW91ciBhcHBsaWNhdGlvbiBpbnRvIGEgc2luZ2xlLXBhZ2UgYXBwbGljYXRpb24gYWZ0ZXIgdGhlIGZpcnN0IHZpZXcgaGFzIGJlZW4gcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLjwvcD5cXG48cD5UaGUgVGF1bnVzIENMSSBpcyBhbiB1c2VmdWwgaW50ZXJtZWRpYXJ5IGluIHRoZSBwcm9jZXNzIG9mIGdldHRpbmcgdGhlIGNvbmZpZ3VyYXRpb24geW91IHdyb3RlIHNvIGZhciBmb3IgdGhlIHNlcnZlci1zaWRlIHRvIGFsc28gd29yayB3ZWxsIGluIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+SW5zdGFsbCBpdCBnbG9iYWxseSBmb3IgZGV2ZWxvcG1lbnQsIGJ1dCByZW1lbWJlciB0byB1c2UgbG9jYWwgY29waWVzIGZvciBwcm9kdWN0aW9uLWdyYWRlIHVzZXMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC1nIHRhdW51c1xcbjwvY29kZT48L3ByZT5cXG48cD5XaGVuIGludm9rZWQgd2l0aG91dCBhbnkgYXJndW1lbnRzLCB0aGUgQ0xJIHdpbGwgc2ltcGx5IGZvbGxvdyB0aGUgZGVmYXVsdCBjb252ZW50aW9ucyB0byBmaW5kIHlvdXIgcm91dGUgZGVmaW5pdGlvbnMsIHZpZXdzLCBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51c1xcbjwvY29kZT48L3ByZT5cXG48cD5CeSBkZWZhdWx0LCB0aGUgb3V0cHV0IHdpbGwgYmUgcHJpbnRlZCB0byB0aGUgc3RhbmRhcmQgb3V0cHV0LCBtYWtpbmcgZm9yIGEgZmFzdCBkZWJ1Z2dpbmcgZXhwZXJpZW5jZS4gSGVyZSYjMzk7cyB0aGUgb3V0cHV0IGlmIHlvdSBqdXN0IGhhZCBhIHNpbmdsZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiByb3V0ZSwgYW5kIHRoZSBtYXRjaGluZyB2aWV3IGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVyIGV4aXN0ZWQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0ZW1wbGF0ZXMgPSB7XFxuICAmIzM5O2hvbWUvaW5kZXgmIzM5OzogcmVxdWlyZSgmIzM5Oy4vdmlld3MvaG9tZS9pbmRleC5qcyYjMzk7KVxcbn07XFxuXFxudmFyIGNvbnRyb2xsZXJzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuLi9jbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qcyYjMzk7KVxcbn07XFxuXFxudmFyIHJvdXRlcyA9IHtcXG4gICYjMzk7LyYjMzk7OiB7XFxuICAgIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTtcXG4gIH1cXG59O1xcblxcbm1vZHVsZS5leHBvcnRzID0ge1xcbiAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICByb3V0ZXM6IHJvdXRlc1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPllvdSBjYW4gdXNlIGEgZmV3IG9wdGlvbnMgdG8gYWx0ZXIgdGhlIG91dGNvbWUgb2YgaW52b2tpbmcgPGNvZGU+dGF1bnVzPC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItb3V0cHV0LVxcXCI+PGNvZGU+LS1vdXRwdXQ8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tbzwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPk91dHB1dCBpcyB3cml0dGVuIHRvIGEgZmlsZSBpbnN0ZWFkIG9mIHRvIHN0YW5kYXJkIG91dHB1dC4gVGhlIGZpbGUgcGF0aCB1c2VkIHdpbGwgYmUgdGhlIDxjb2RlPmNsaWVudF93aXJpbmc8L2NvZGU+IG9wdGlvbiBpbiA8YSBocmVmPVxcXCIjdGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj48Y29kZT4udGF1bnVzcmM8L2NvZGU+PC9hPiwgd2hpY2ggZGVmYXVsdHMgdG8gPGNvZGU+JiMzOTsuYmluL3dpcmluZy5qcyYjMzk7PC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItd2F0Y2gtXFxcIj48Y29kZT4tLXdhdGNoPC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXc8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5XaGVuZXZlciBhIHNlcnZlci1zaWRlIHJvdXRlIGRlZmluaXRpb24gY2hhbmdlcywgdGhlIG91dHB1dCBpcyBwcmludGVkIGFnYWluIHRvIGVpdGhlciBzdGFuZGFyZCBvdXRwdXQgb3IgYSBmaWxlLCBkZXBlbmRpbmcgb24gd2hldGhlciA8Y29kZT4tLW91dHB1dDwvY29kZT4gd2FzIHVzZWQuPC9wPlxcbjxwPlRoZSBwcm9ncmFtIHdvbiYjMzk7dCBleGl0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10cmFuc2Zvcm0tbW9kdWxlLVxcXCI+PGNvZGU+LS10cmFuc2Zvcm0gJmx0O21vZHVsZSZndDs8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tdDwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPlRoaXMgZmxhZyBhbGxvd3MgeW91IHRvIHRyYW5zZm9ybSBzZXJ2ZXItc2lkZSByb3V0ZXMgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHVuZGVyc3RhbmRzLiBFeHByZXNzIHJvdXRlcyBhcmUgY29tcGxldGVseSBjb21wYXRpYmxlIHdpdGggdGhlIGNsaWVudC1zaWRlIHJvdXRlciwgYnV0IEhhcGkgcm91dGVzIG5lZWQgdG8gYmUgdHJhbnNmb3JtZWQgdXNpbmcgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+PGNvZGU+aGFwaWlmeTwvY29kZT48L2E+IG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgaGFwaWlmeVxcbnRhdW51cyAtdCBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlVzaW5nIHRoaXMgdHJhbnNmb3JtIHJlbGlldmVzIHlvdSBmcm9tIGhhdmluZyB0byBkZWZpbmUgdGhlIHNhbWUgcm91dGVzIHR3aWNlIHVzaW5nIHNsaWdodGx5IGRpZmZlcmVudCBmb3JtYXRzIHRoYXQgY29udmV5IHRoZSBzYW1lIG1lYW5pbmcuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXJlc29sdmVycy1tb2R1bGUtXFxcIj48Y29kZT4tLXJlc29sdmVycyAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1yPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+U2ltaWxhcmx5IHRvIHRoZSA8YSBocmVmPVxcXCIjLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+cmVzb2x2ZXJzPC9jb2RlPjwvYT4gb3B0aW9uIHRoYXQgeW91IGNhbiBwYXNzIHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiwgdGhlc2UgcmVzb2x2ZXJzIGNhbiBjaGFuZ2UgdGhlIHdheSBpbiB3aGljaCBmaWxlIHBhdGhzIGFyZSByZXNvbHZlZC48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPlNpZ25hdHVyZTwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0Q2xpZW50Q29udHJvbGxlcihhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0VmlldyhhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi1zdGFuZGFsb25lLVxcXCI+PGNvZGU+LS1zdGFuZGFsb25lPC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXM8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5VbmRlciB0aGlzIGV4cGVyaW1lbnRhbCBmbGFnLCB0aGUgQ0xJIHdpbGwgdXNlIEJyb3dzZXJpZnkgdG8gY29tcGlsZSBhIHN0YW5kYWxvbmUgbW9kdWxlIHRoYXQgaW5jbHVkZXMgdGhlIHdpcmluZyBub3JtYWxseSBleHBvcnRlZCBieSB0aGUgQ0xJIHBsdXMgYWxsIG9mIFRhdW51cyA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdW1kanMvdW1kXFxcIj5hcyBhIFVNRCBtb2R1bGU8L2E+LjwvcD5cXG48cD5UaGlzIHdvdWxkIGFsbG93IHlvdSB0byB1c2UgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSBldmVuIGlmIHlvdSBkb24mIzM5O3Qgd2FudCB0byB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2Jyb3dzZXJpZnkub3JnXFxcIj5Ccm93c2VyaWZ5PC9hPiBkaXJlY3RseS48L3A+XFxuPHA+RmVlZGJhY2sgYW5kIHN1Z2dlc3Rpb25zIGFib3V0IHRoaXMgZmxhZywgPGVtPmFuZCBwb3NzaWJsZSBhbHRlcm5hdGl2ZXMgdGhhdCB3b3VsZCBtYWtlIFRhdW51cyBlYXNpZXIgdG8gdXNlPC9lbT4sIGFyZSB3ZWxjb21lLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImNsaWVudC1zaWRlLWFwaVxcXCI+Q2xpZW50LXNpZGUgQVBJPC9oMT5cXG48cD5KdXN0IGxpa2UgdGhlIHNlcnZlci1zaWRlLCBldmVyeXRoaW5nIGluIHRoZSBjbGllbnQtc2lkZSBiZWdpbnMgYXQgdGhlIG1vdW50cG9pbnQuIE9uY2UgdGhlIGFwcGxpY2F0aW9uIGlzIG1vdW50ZWQsIGFuY2hvciBsaW5rcyB3aWxsIGJlIGhpamFja2VkIGFuZCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIHdpbGwgdGFrZSBvdmVyIHZpZXcgcmVuZGVyaW5nLiBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhlY3V0ZWQgd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbW91bnQtY29udGFpbmVyLXdpcmluZy1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nLCBvcHRpb25zPyk8L2NvZGU+PC9oMj5cXG48cD5UaGUgbW91bnRwb2ludCB0YWtlcyBhIHJvb3QgY29udGFpbmVyLCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGFuIG9wdGlvbnMgcGFyYW1ldGVyLiBUaGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiBpcyB3aGVyZSBjbGllbnQtc2lkZS1yZW5kZXJlZCB2aWV3cyB3aWxsIGJlIHBsYWNlZCwgYnkgcmVwbGFjaW5nIHdoYXRldmVyIEhUTUwgY29udGVudHMgYWxyZWFkeSBleGlzdC4gWW91IGNhbiBwYXNzIGluIHRoZSA8Y29kZT53aXJpbmc8L2NvZGU+IG1vZHVsZSBleGFjdGx5IGFzIGJ1aWx0IGJ5IHRoZSBDTEksIGFuZCBubyBmdXJ0aGVyIGNvbmZpZ3VyYXRpb24gaXMgbmVjZXNzYXJ5LjwvcD5cXG48cD5XaGVuIHRoZSBtb3VudHBvaW50IGV4ZWN1dGVzLCBUYXVudXMgd2lsbCBjb25maWd1cmUgaXRzIGludGVybmFsIHN0YXRlLCA8ZW0+c2V0IHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXI8L2VtPiwgcnVuIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldywgYW5kIHN0YXJ0IGhpamFja2luZyBsaW5rcy48L3A+XFxuPHA+QXMgYW4gZXhhbXBsZSwgY29uc2lkZXIgYSBicm93c2VyIG1ha2VzIGEgPGNvZGU+R0VUPC9jb2RlPiByZXF1ZXN0IGZvciA8Y29kZT4vYXJ0aWNsZXMvdGhlLWZveDwvY29kZT4gZm9yIHRoZSBmaXJzdCB0aW1lLiBPbmNlIDxjb2RlPnRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZyk8L2NvZGU+IGlzIGludm9rZWQgb24gdGhlIGNsaWVudC1zaWRlLCBzZXZlcmFsIHRoaW5ncyB3b3VsZCBoYXBwZW4gaW4gdGhlIG9yZGVyIGxpc3RlZCBiZWxvdy48L3A+XFxuPHVsPlxcbjxsaT5UYXVudXMgc2V0cyB1cCB0aGUgY2xpZW50LXNpZGUgdmlldyByb3V0aW5nIGVuZ2luZTwvbGk+XFxuPGxpPklmIGVuYWJsZWQgPGVtPih2aWEgPGNvZGU+b3B0aW9uczwvY29kZT4pPC9lbT4sIHRoZSBjYWNoaW5nIGVuZ2luZSBpcyBjb25maWd1cmVkPC9saT5cXG48bGk+VGF1bnVzIG9idGFpbnMgdGhlIHZpZXcgbW9kZWwgPGVtPihtb3JlIG9uIHRoaXMgbGF0ZXIpPC9lbT48L2xpPlxcbjxsaT5XaGVuIGEgdmlldyBtb2RlbCBpcyBvYnRhaW5lZCwgdGhlIDxjb2RlPiYjMzk7c3RhcnQmIzM5OzwvY29kZT4gZXZlbnQgaXMgZW1pdHRlZDwvbGk+XFxuPGxpPkFuY2hvciBsaW5rcyBzdGFydCBiZWluZyBtb25pdG9yZWQgZm9yIGNsaWNrcyA8ZW0+KGF0IHRoaXMgcG9pbnQgeW91ciBhcHBsaWNhdGlvbiBiZWNvbWVzIGEgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9TaW5nbGUtcGFnZV9hcHBsaWNhdGlvblxcXCI+U1BBPC9hPik8L2VtPjwvbGk+XFxuPGxpPlRoZSA8Y29kZT5hcnRpY2xlcy9hcnRpY2xlPC9jb2RlPiBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGV4ZWN1dGVkPC9saT5cXG48L3VsPlxcbjxwPlRoYXQmIzM5O3MgcXVpdGUgYSBiaXQgb2YgZnVuY3Rpb25hbGl0eSwgYnV0IGlmIHlvdSB0aGluayBhYm91dCBpdCwgbW9zdCBvdGhlciBmcmFtZXdvcmtzIGFsc28gcmVuZGVyIHRoZSB2aWV3IGF0IHRoaXMgcG9pbnQsIDxlbT5yYXRoZXIgdGhhbiBvbiB0aGUgc2VydmVyLXNpZGUhPC9lbT48L3A+XFxuPHA+SW4gb3JkZXIgdG8gYmV0dGVyIHVuZGVyc3RhbmQgdGhlIHByb2Nlc3MsIEkmIzM5O2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IHBhcmFtZXRlci48L3A+XFxuPHA+Rmlyc3Qgb2ZmLCB0aGUgPGNvZGU+Ym9vdHN0cmFwPC9jb2RlPiBvcHRpb24gZGV0ZXJtaW5lcyB0aGUgc3RyYXRlZ3kgdXNlZCB0byBwdWxsIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3IGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGVyZSBhcmUgdGhyZWUgcG9zc2libGUgc3RyYXRlZ2llcyBhdmFpbGFibGU6IDxjb2RlPmF1dG88L2NvZGU+IDxlbT4odGhlIGRlZmF1bHQgc3RyYXRlZ3kpPC9lbT4sIDxjb2RlPmlubGluZTwvY29kZT4sIG9yIDxjb2RlPm1hbnVhbDwvY29kZT4uIFRoZSA8Y29kZT5hdXRvPC9jb2RlPiBzdHJhdGVneSBpbnZvbHZlcyB0aGUgbGVhc3Qgd29yaywgd2hpY2ggaXMgd2h5IGl0JiMzOTtzIHRoZSBkZWZhdWx0LjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmF1dG88L2NvZGU+IHdpbGwgbWFrZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsPC9saT5cXG48bGk+PGNvZGU+aW5saW5lPC9jb2RlPiBleHBlY3RzIHlvdSB0byBwbGFjZSB0aGUgbW9kZWwgaW50byBhIDxjb2RlPiZsdDtzY3JpcHQgdHlwZT0mIzM5O3RleHQvdGF1bnVzJiMzOTsmZ3Q7PC9jb2RlPiB0YWc8L2xpPlxcbjxsaT48Y29kZT5tYW51YWw8L2NvZGU+IGV4cGVjdHMgeW91IHRvIGdldCB0aGUgdmlldyBtb2RlbCBob3dldmVyIHlvdSB3YW50IHRvLCBhbmQgdGhlbiBsZXQgVGF1bnVzIGtub3cgd2hlbiBpdCYjMzk7cyByZWFkeTwvbGk+XFxuPC91bD5cXG48cD5MZXQmIzM5O3MgZ28gaW50byBkZXRhaWwgYWJvdXQgZWFjaCBvZiB0aGVzZSBzdHJhdGVnaWVzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1hdXRvLXN0cmF0ZWd5XFxcIj5Vc2luZyB0aGUgPGNvZGU+YXV0bzwvY29kZT4gc3RyYXRlZ3k8L2g0PlxcbjxwPlRoZSA8Y29kZT5hdXRvPC9jb2RlPiBzdHJhdGVneSBtZWFucyB0aGF0IFRhdW51cyB3aWxsIG1ha2UgdXNlIG9mIGFuIEFKQVggcmVxdWVzdCB0byBvYnRhaW4gdGhlIHZpZXcgbW9kZWwuIDxlbT5Zb3UgZG9uJiMzOTt0IGhhdmUgdG8gZG8gYW55dGhpbmcgZWxzZTwvZW0+IGFuZCB0aGlzIGlzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5LiBUaGlzIGlzIHRoZSA8c3Ryb25nPm1vc3QgY29udmVuaWVudCBzdHJhdGVneSwgYnV0IGFsc28gdGhlIHNsb3dlc3Q8L3N0cm9uZz4gb25lLjwvcD5cXG48cD5JdCYjMzk7cyBzbG93IGJlY2F1c2UgdGhlIHZpZXcgbW9kZWwgd29uJiMzOTt0IGJlIHJlcXVlc3RlZCB1bnRpbCB0aGUgYnVsayBvZiB5b3VyIEphdmFTY3JpcHQgY29kZSBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGV4ZWN1dGVkLCBhbmQgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpcyBpbnZva2VkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1pbmxpbmUtc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5pbmxpbmU8L2NvZGU+IHN0cmF0ZWd5PC9oND5cXG48cD5UaGUgPGNvZGU+aW5saW5lPC9jb2RlPiBzdHJhdGVneSBleHBlY3RzIHlvdSB0byBhZGQgYSA8Y29kZT5kYXRhLXRhdW51czwvY29kZT4gYXR0cmlidXRlIG9uIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+IGVsZW1lbnQuIFRoaXMgYXR0cmlidXRlIG11c3QgYmUgZXF1YWwgdG8gdGhlIDxjb2RlPmlkPC9jb2RlPiBhdHRyaWJ1dGUgb2YgYSA8Y29kZT4mbHQ7c2NyaXB0Jmd0OzwvY29kZT4gdGFnIGNvbnRhaW5pbmcgdGhlIHNlcmlhbGl6ZWQgdmlldyBtb2RlbC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj5kaXYoZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KSE9cGFydGlhbFxcbnNjcmlwdCh0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OywgZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KT1KU09OLnN0cmluZ2lmeShtb2RlbClcXG48L2NvZGU+PC9wcmU+XFxuPHA+UGF5IHNwZWNpYWwgYXR0ZW50aW9uIHRvIHRoZSBmYWN0IHRoYXQgdGhlIG1vZGVsIGlzIG5vdCBvbmx5IG1hZGUgaW50byBhIEpTT04gc3RyaW5nLCA8ZW0+YnV0IGFsc28gSFRNTCBlbmNvZGVkIGJ5IEphZGU8L2VtPi4gV2hlbiBUYXVudXMgZXh0cmFjdHMgdGhlIG1vZGVsIGZyb20gdGhlIDxjb2RlPiZsdDtzY3JpcHQmZ3Q7PC9jb2RlPiB0YWcgaXQmIzM5O2xsIHVuZXNjYXBlIGl0LCBhbmQgdGhlbiBwYXJzZSBpdCBhcyBKU09OLjwvcD5cXG48cD5UaGlzIHN0cmF0ZWd5IGlzIGFsc28gZmFpcmx5IGNvbnZlbmllbnQgdG8gc2V0IHVwLCBidXQgaXQgaW52b2x2ZXMgYSBsaXR0bGUgbW9yZSB3b3JrLiBJdCBtaWdodCBiZSB3b3J0aHdoaWxlIHRvIHVzZSBpbiBjYXNlcyB3aGVyZSBtb2RlbHMgYXJlIHNtYWxsLCBidXQgaXQgd2lsbCBzbG93IGRvd24gc2VydmVyLXNpZGUgdmlldyByZW5kZXJpbmcsIGFzIHRoZSBtb2RlbCBpcyBpbmxpbmVkIGFsb25nc2lkZSB0aGUgSFRNTC48L3A+XFxuPHA+VGhhdCBtZWFucyB0aGF0IHRoZSBjb250ZW50IHlvdSBhcmUgc3VwcG9zZWQgdG8gYmUgcHJpb3JpdGl6aW5nIGlzIGdvaW5nIHRvIHRha2UgbG9uZ2VyIHRvIGdldCB0byB5b3VyIGh1bWFucywgYnV0IG9uY2UgdGhleSBnZXQgdGhlIEhUTUwsIHRoaXMgc3RyYXRlZ3kgd2lsbCBleGVjdXRlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGFsbW9zdCBpbW1lZGlhdGVseS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtbWFudWFsLXN0cmF0ZWd5XFxcIj5Vc2luZyB0aGUgPGNvZGU+bWFudWFsPC9jb2RlPiBzdHJhdGVneTwvaDQ+XFxuPHA+VGhlIDxjb2RlPm1hbnVhbDwvY29kZT4gc3RyYXRlZ3kgaXMgdGhlIG1vc3QgaW52b2x2ZWQgb2YgdGhlIHRocmVlLCBidXQgYWxzbyB0aGUgbW9zdCBwZXJmb3JtYW50LiBJbiB0aGlzIHN0cmF0ZWd5IHlvdSYjMzk7cmUgc3VwcG9zZWQgdG8gYWRkIHRoZSBmb2xsb3dpbmcgPGVtPihzZWVtaW5nbHkgcG9pbnRsZXNzKTwvZW0+IHNuaXBwZXQgb2YgY29kZSBpbiBhIDxjb2RlPiZsdDtzY3JpcHQmZ3Q7PC9jb2RlPiBvdGhlciB0aGFuIHRoZSBvbmUgdGhhdCYjMzk7cyBwdWxsaW5nIGRvd24gVGF1bnVzLCBzbyB0aGF0IHRoZXkgYXJlIHB1bGxlZCBjb25jdXJyZW50bHkgcmF0aGVyIHRoYW4gc2VyaWFsbHkuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbndpbmRvdy50YXVudXNSZWFkeSA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T25jZSB5b3Ugc29tZWhvdyBnZXQgeW91ciBoYW5kcyBvbiB0aGUgdmlldyBtb2RlbCwgeW91IHNob3VsZCBpbnZva2UgPGNvZGU+dGF1bnVzUmVhZHkobW9kZWwpPC9jb2RlPi4gQ29uc2lkZXJpbmcgeW91JiMzOTtsbCBiZSBwdWxsaW5nIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBhdCB0aGUgc2FtZSB0aW1lLCBhIG51bWJlciBvZiBkaWZmZXJlbnQgc2NlbmFyaW9zIG1heSBwbGF5IG91dC48L3A+XFxuPHVsPlxcbjxsaT5UaGUgdmlldyBtb2RlbCBpcyBsb2FkZWQgZmlyc3QsIHlvdSBjYWxsIDxjb2RlPnRhdW51c1JlYWR5KG1vZGVsKTwvY29kZT4gYW5kIHdhaXQgZm9yIFRhdW51cyB0byB0YWtlIHRoZSBtb2RlbCBvYmplY3QgYW5kIGJvb3QgdGhlIGFwcGxpY2F0aW9uIGFzIHNvb24gYXMgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpcyBleGVjdXRlZDwvbGk+XFxuPGxpPlRhdW51cyBsb2FkcyBmaXJzdCBhbmQgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpcyBjYWxsZWQgZmlyc3QuIEluIHRoaXMgY2FzZSwgVGF1bnVzIHdpbGwgcmVwbGFjZSA8Y29kZT53aW5kb3cudGF1bnVzUmVhZHk8L2NvZGU+IHdpdGggYSBzcGVjaWFsIDxjb2RlPmJvb3Q8L2NvZGU+IG1ldGhvZC4gV2hlbiB0aGUgdmlldyBtb2RlbCBmaW5pc2hlcyBsb2FkaW5nLCB5b3UgY2FsbCA8Y29kZT50YXVudXNSZWFkeShtb2RlbCk8L2NvZGU+IGFuZCB0aGUgYXBwbGljYXRpb24gZmluaXNoZXMgYm9vdGluZzwvbGk+XFxuPC91bD5cXG48YmxvY2txdW90ZT5cXG48cD5JZiB0aGlzIHNvdW5kcyBhIGxpdHRsZSBtaW5kLWJlbmRpbmcgaXQmIzM5O3MgYmVjYXVzZSBpdCBpcy4gSXQmIzM5O3Mgbm90IGRlc2lnbmVkIHRvIGJlIHByZXR0eSwgYnV0IG1lcmVseSB0byBiZSBwZXJmb3JtYW50LjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+Tm93IHRoYXQgd2UmIzM5O3ZlIGFkZHJlc3NlZCB0aGUgYXdrd2FyZCBiaXRzLCBsZXQmIzM5O3MgY292ZXIgdGhlIDxlbT4mcXVvdDtzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsJnF1b3Q7PC9lbT4gYXNwZWN0LiBNeSBwcmVmZXJyZWQgbWV0aG9kIGlzIHVzaW5nIEpTT05QLCBhcyBpdCYjMzk7cyBhYmxlIHRvIGRlbGl2ZXIgdGhlIHNtYWxsZXN0IHNuaXBwZXQgcG9zc2libGUsIGFuZCBpdCBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygc2VydmVyLXNpZGUgY2FjaGluZy4gQ29uc2lkZXJpbmcgeW91JiMzOTtsbCBwcm9iYWJseSB3YW50IHRoaXMgdG8gYmUgYW4gaW5saW5lIHNjcmlwdCwga2VlcGluZyBpdCBzbWFsbCBpcyBpbXBvcnRhbnQuPC9wPlxcbjxwPlRoZSBnb29kIG5ld3MgaXMgdGhhdCB0aGUgc2VydmVyLXNpZGUgc3VwcG9ydHMgSlNPTlAgb3V0IHRoZSBib3guIEhlcmUmIzM5O3MgYSBzbmlwcGV0IG9mIGNvZGUgeW91IGNvdWxkIHVzZSB0byBwdWxsIGRvd24gdGhlIHZpZXcgbW9kZWwgYW5kIGJvb3QgVGF1bnVzIHVwIGFzIHNvb24gYXMgYm90aCBvcGVyYXRpb25zIGFyZSByZWFkeS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxuZnVuY3Rpb24gaW5qZWN0ICh1cmwpIHtcXG4gIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCYjMzk7c2NyaXB0JiMzOTspO1xcbiAgc2NyaXB0LnNyYyA9IHVybDtcXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcXG59XFxuXFxuZnVuY3Rpb24gaW5qZWN0b3IgKCkge1xcbiAgdmFyIHNlYXJjaCA9IGxvY2F0aW9uLnNlYXJjaDtcXG4gIHZhciBzZWFyY2hRdWVyeSA9IHNlYXJjaCA/ICYjMzk7JmFtcDsmIzM5OyArIHNlYXJjaC5zdWJzdHIoMSkgOiAmIzM5OyYjMzk7O1xcbiAgdmFyIHNlYXJjaEpzb24gPSAmIzM5Oz9qc29uJmFtcDtjYWxsYmFjaz10YXVudXNSZWFkeSYjMzk7ICsgc2VhcmNoUXVlcnk7XFxuICBpbmplY3QobG9jYXRpb24ucGF0aG5hbWUgKyBzZWFyY2hKc29uKTtcXG59XFxuXFxud2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG59O1xcblxcbmluamVjdG9yKCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkFzIG1lbnRpb25lZCBlYXJsaWVyLCB0aGlzIGFwcHJvYWNoIGludm9sdmVzIGdldHRpbmcgeW91ciBoYW5kcyBkaXJ0aWVyIGJ1dCBpdCBwYXlzIG9mZiBieSBiZWluZyB0aGUgZmFzdGVzdCBvZiB0aGUgdGhyZWUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY2FjaGluZ1xcXCI+Q2FjaGluZzwvaDQ+XFxuPHA+VGhlIGNsaWVudC1zaWRlIGluIFRhdW51cyBzdXBwb3J0cyBjYWNoaW5nIGluLW1lbW9yeSBhbmQgdXNpbmcgdGhlIGVtYmVkZGVkIEluZGV4ZWREQiBzeXN0ZW0gYnkgbWVyZWx5IHR1cm5pbmcgb24gdGhlIDxjb2RlPmNhY2hlPC9jb2RlPiBmbGFnIGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IG9uIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+SWYgeW91IHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gPGNvZGU+dHJ1ZTwvY29kZT4gdGhlbiBjYWNoZWQgaXRlbXMgd2lsbCBiZSBjb25zaWRlcmVkIDxlbT4mcXVvdDtmcmVzaCZxdW90OyAodmFsaWQgY29waWVzIG9mIHRoZSBvcmlnaW5hbCk8L2VtPiBmb3IgPHN0cm9uZz4xNSBzZWNvbmRzPC9zdHJvbmc+LiBZb3UgY2FuIGFsc28gc2V0IDxjb2RlPmNhY2hlPC9jb2RlPiB0byBhIG51bWJlciwgYW5kIHRoYXQgbnVtYmVyIG9mIHNlY29uZHMgd2lsbCBiZSB1c2VkIGFzIHRoZSBkZWZhdWx0IGluc3RlYWQuPC9wPlxcbjxwPkNhY2hpbmcgY2FuIGFsc28gYmUgdHdlYWtlZCBvbiBpbmRpdmlkdWFsIHJvdXRlcy4gRm9yIGluc3RhbmNlLCB5b3UgY291bGQgc2V0IDxjb2RlPnsgY2FjaGU6IHRydWUgfTwvY29kZT4gd2hlbiBtb3VudGluZyBUYXVudXMgYW5kIHRoZW4gaGF2ZSA8Y29kZT57IGNhY2hlOiAzNjAwIH08L2NvZGU+IG9uIGEgcm91dGUgdGhhdCB5b3Ugd2FudCB0byBjYWNoZSBmb3IgYSBsb25nZXIgcGVyaW9kIG9mIHRpbWUuPC9wPlxcbjxwPlRoZSBjYWNoaW5nIGxheWVyIGlzIDxlbT5zZWFtbGVzc2x5IGludGVncmF0ZWQ8L2VtPiBpbnRvIFRhdW51cywgbWVhbmluZyB0aGF0IGFueSB2aWV3cyByZW5kZXJlZCBieSBUYXVudXMgd2lsbCBiZSBjYWNoZWQgYWNjb3JkaW5nIHRvIHRoZXNlIGNhY2hpbmcgcnVsZXMuIEtlZXAgaW4gbWluZCwgaG93ZXZlciwgdGhhdCBwZXJzaXN0ZW5jZSBhdCB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBsYXllciB3aWxsIG9ubHkgYmUgcG9zc2libGUgaW4gPGEgaHJlZj1cXFwiaHR0cDovL2Nhbml1c2UuY29tLyNmZWF0PWluZGV4ZWRkYlxcXCI+YnJvd3NlcnMgdGhhdCBzdXBwb3J0IEluZGV4ZWREQjwvYT4uIEluIHRoZSBjYXNlIG9mIGJyb3dzZXJzIHRoYXQgZG9uJiMzOTt0IHN1cHBvcnQgSW5kZXhlZERCLCBUYXVudXMgd2lsbCB1c2UgYW4gaW4tbWVtb3J5IGNhY2hlLCB3aGljaCB3aWxsIGJlIHdpcGVkIG91dCB3aGVuZXZlciB0aGUgaHVtYW4gZGVjaWRlcyB0byBjbG9zZSB0aGUgdGFiIGluIHRoZWlyIGJyb3dzZXIuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwicHJlZmV0Y2hpbmdcXFwiPlByZWZldGNoaW5nPC9oND5cXG48cD5JZiBjYWNoaW5nIGlzIGVuYWJsZWQsIHRoZSBuZXh0IGxvZ2ljYWwgc3RlcCBpcyBwcmVmZXRjaGluZy4gVGhpcyBpcyBlbmFibGVkIGp1c3QgYnkgYWRkaW5nIDxjb2RlPnByZWZldGNoOiB0cnVlPC9jb2RlPiB0byB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi4gVGhlIHByZWZldGNoaW5nIGZlYXR1cmUgd2lsbCBmaXJlIGZvciBhbnkgYW5jaG9yIGxpbmsgdGhhdCYjMzk7cyB0cmlwcyBvdmVyIGEgPGNvZGU+bW91c2VvdmVyPC9jb2RlPiBvciBhIDxjb2RlPnRvdWNoc3RhcnQ8L2NvZGU+IGV2ZW50LiBJZiBhIHJvdXRlIG1hdGNoZXMgdGhlIFVSTCBpbiB0aGUgPGNvZGU+aHJlZjwvY29kZT4sIGFuIEFKQVggcmVxdWVzdCB3aWxsIHByZWZldGNoIHRoZSB2aWV3IGFuZCBjYWNoZSBpdHMgY29udGVudHMsIGltcHJvdmluZyBwZXJjZWl2ZWQgcGVyZm9ybWFuY2UuPC9wPlxcbjxwPldoZW4gbGlua3MgYXJlIGNsaWNrZWQgYmVmb3JlIHByZWZldGNoaW5nIGZpbmlzaGVzLCB0aGV5JiMzOTtsbCB3YWl0IG9uIHRoZSBwcmVmZXRjaGVyIHRvIGZpbmlzaCBiZWZvcmUgaW1tZWRpYXRlbHkgc3dpdGNoaW5nIHRvIHRoZSB2aWV3LCBlZmZlY3RpdmVseSBjdXR0aW5nIGRvd24gdGhlIHJlc3BvbnNlIHRpbWUuIElmIHRoZSBsaW5rIHdhcyBhbHJlYWR5IHByZWZldGNoZWQgb3Igb3RoZXJ3aXNlIGNhY2hlZCwgdGhlIHZpZXcgd2lsbCBiZSBsb2FkZWQgaW1tZWRpYXRlbHkuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhIGxpbmsgYW5kIGFub3RoZXIgb25lIHdhcyBhbHJlYWR5IGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhhdCBvbmUgaXMgYWJvcnRlZC4gVGhpcyBwcmV2ZW50cyBwcmVmZXRjaGluZyBmcm9tIGRyYWluaW5nIHRoZSBiYW5kd2lkdGggb24gY2xpZW50cyB3aXRoIGxpbWl0ZWQgb3IgaW50ZXJtaXR0ZW50IGNvbm5lY3Rpdml0eS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub24odHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGF1bnVzIGVtaXRzIGEgc2VyaWVzIG9mIGV2ZW50cyBkdXJpbmcgaXRzIGxpZmVjeWNsZSwgYW5kIDxjb2RlPnRhdW51cy5vbjwvY29kZT4gaXMgdGhlIHdheSB5b3UgY2FuIHR1bmUgaW4gYW5kIGxpc3RlbiBmb3IgdGhlc2UgZXZlbnRzIHVzaW5nIGEgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIDxjb2RlPmZuPC9jb2RlPi48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPkV2ZW50PC90aD5cXG48dGg+QXJndW1lbnRzPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3N0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW4gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBmaW5pc2hlZCB0aGUgcm91dGUgc2V0dXAgYW5kIGlzIGFib3V0IHRvIGludm9rZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlci4gU3Vic2NyaWJlIHRvIHRoaXMgZXZlbnQgYmVmb3JlIGNhbGxpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3JlbmRlciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+QSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWQ8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLnN0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5kb25lJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGRhdGE8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmFib3J0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmVycm9yJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGVycjwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci48L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vbmNlLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub25jZSh0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBpcyBlcXVpdmFsZW50IHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub248L2NvZGU+PC9hPiwgZXhjZXB0IHRoZSBldmVudCBsaXN0ZW5lcnMgd2lsbCBiZSB1c2VkIG9uY2UgYW5kIHRoZW4gaXQmIzM5O2xsIGJlIGRpc2NhcmRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9mZi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9mZih0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD5Vc2luZyB0aGlzIG1ldGhvZCB5b3UgY2FuIHJlbW92ZSBhbnkgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBwcmV2aW91c2x5IGFkZGVkIHVzaW5nIDxjb2RlPi5vbjwvY29kZT4gb3IgPGNvZGU+Lm9uY2U8L2NvZGU+LiBZb3UgbXVzdCBwcm92aWRlIHRoZSB0eXBlIG9mIGV2ZW50IHlvdSB3YW50IHRvIHJlbW92ZSBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGZ1bmN0aW9uIHRoYXQgd2FzIG9yaWdpbmFsbHkgdXNlZCB3aGVuIGNhbGxpbmcgPGNvZGU+Lm9uPC9jb2RlPiBvciA8Y29kZT4ub25jZTwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1pbnRlcmNlcHQtYWN0aW9uLWZuLVxcXCI+PGNvZGU+dGF1bnVzLmludGVyY2VwdChhY3Rpb24/LCBmbik8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBjYW4gYmUgdXNlZCB0byBhbnRpY2lwYXRlIG1vZGVsIHJlcXVlc3RzLCBiZWZvcmUgdGhleSBldmVyIG1ha2UgaXQgaW50byBYSFIgcmVxdWVzdHMuIFlvdSBjYW4gYWRkIGludGVyY2VwdG9ycyBmb3Igc3BlY2lmaWMgYWN0aW9ucywgd2hpY2ggd291bGQgYmUgdHJpZ2dlcmVkIG9ubHkgaWYgdGhlIHJlcXVlc3QgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIDxjb2RlPmFjdGlvbjwvY29kZT4uIFlvdSBjYW4gYWxzbyBhZGQgZ2xvYmFsIGludGVyY2VwdG9ycyBieSBvbWl0dGluZyB0aGUgPGNvZGU+YWN0aW9uPC9jb2RlPiBwYXJhbWV0ZXIsIG9yIHNldHRpbmcgaXQgdG8gPGNvZGU+KjwvY29kZT4uPC9wPlxcbjxwPkFuIGludGVyY2VwdG9yIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBhbiA8Y29kZT5ldmVudDwvY29kZT4gcGFyYW1ldGVyLCBjb250YWluaW5nIGEgZmV3IGRpZmZlcmVudCBwcm9wZXJ0aWVzLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPnVybDwvY29kZT4gY29udGFpbnMgdGhlIFVSTCB0aGF0IG5lZWRzIGEgdmlldyBtb2RlbDwvbGk+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBjb250YWlucyB0aGUgZnVsbCByb3V0ZSBvYmplY3QgYXMgeW91JiMzOTtkIGdldCBmcm9tIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZSh1cmwpPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48Y29kZT5wYXJ0czwvY29kZT4gaXMganVzdCBhIHNob3J0Y3V0IGZvciA8Y29kZT5yb3V0ZS5wYXJ0czwvY29kZT48L2xpPlxcbjxsaT48Y29kZT5wcmV2ZW50RGVmYXVsdChtb2RlbCk8L2NvZGU+IGFsbG93cyB5b3UgdG8gc3VwcHJlc3MgdGhlIG5lZWQgZm9yIGFuIEFKQVggcmVxdWVzdCwgY29tbWFuZGluZyBUYXVudXMgdG8gdXNlIHRoZSBtb2RlbCB5b3UmIzM5O3ZlIHByb3ZpZGVkIGluc3RlYWQ8L2xpPlxcbjxsaT48Y29kZT5kZWZhdWx0UHJldmVudGVkPC9jb2RlPiB0ZWxscyB5b3UgaWYgc29tZSBvdGhlciBoYW5kbGVyIGhhcyBwcmV2ZW50ZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3I8L2xpPlxcbjxsaT48Y29kZT5jYW5QcmV2ZW50RGVmYXVsdDwvY29kZT4gdGVsbHMgeW91IGlmIGludm9raW5nIDxjb2RlPmV2ZW50LnByZXZlbnREZWZhdWx0PC9jb2RlPiB3aWxsIGhhdmUgYW55IGVmZmVjdDwvbGk+XFxuPGxpPjxjb2RlPm1vZGVsPC9jb2RlPiBzdGFydHMgYXMgPGNvZGU+bnVsbDwvY29kZT4sIGFuZCBpdCBjYW4gbGF0ZXIgYmVjb21lIHRoZSBtb2RlbCBwYXNzZWQgdG8gPGNvZGU+cHJldmVudERlZmF1bHQ8L2NvZGU+PC9saT5cXG48L3VsPlxcbjxwPkludGVyY2VwdG9ycyBhcmUgYXN5bmNocm9ub3VzLCBidXQgaWYgYW4gaW50ZXJjZXB0b3Igc3BlbmRzIGxvbmdlciB0aGFuIDIwMG1zIGl0JiMzOTtsbCBiZSBzaG9ydC1jaXJjdWl0ZWQgYW5kIGNhbGxpbmcgPGNvZGU+ZXZlbnQucHJldmVudERlZmF1bHQ8L2NvZGU+IHBhc3QgdGhhdCBwb2ludCB3b24mIzM5O3QgaGF2ZSBhbnkgZWZmZWN0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLVxcXCI+PGNvZGU+dGF1bnVzLnBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsKTwvY29kZT48L2gyPlxcbjxwPlRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSA8Y29kZT5hY3Rpb248L2NvZGU+IHZpZXcgaW50byB0aGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiBET00gZWxlbWVudCwgdXNpbmcgdGhlIHNwZWNpZmllZCA8Y29kZT5tb2RlbDwvY29kZT4uIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSA8Y29kZT5yZW5kZXI8L2NvZGU+IGV2ZW50IHdpbGwgYmUgZmlyZWQgPGVtPih3aXRoIDxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+IGFzIGFyZ3VtZW50cyk8L2VtPiBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoYXQgdmlldyB3aWxsIGJlIGV4ZWN1dGVkLjwvcD5cXG48cD5XaGlsZSA8Y29kZT50YXVudXMucGFydGlhbDwvY29kZT4gdGFrZXMgYSA8Y29kZT5yb3V0ZTwvY29kZT4gYXMgdGhlIGZvdXJ0aCBwYXJhbWV0ZXIsIHlvdSBzaG91bGQgb21pdCB0aGF0IHNpbmNlIGl0JiMzOTtzIHVzZWQgZm9yIGludGVybmFsIHB1cnBvc2VzIG9ubHkuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1uYXZpZ2F0ZS11cmwtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpPC9jb2RlPjwvaDI+XFxuPHA+V2hlbmV2ZXIgeW91IHdhbnQgdG8gbmF2aWdhdGUgdG8gYSBVUkwsIHNheSB3aGVuIGFuIEFKQVggY2FsbCBmaW5pc2hlcyBhZnRlciBhIGJ1dHRvbiBjbGljaywgeW91IGNhbiB1c2UgPGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPiBwYXNzaW5nIGl0IGEgcGxhaW4gVVJMIG9yIGFueXRoaW5nIHRoYXQgd291bGQgY2F1c2UgPGNvZGU+dGF1bnVzLnJvdXRlKHVybCk8L2NvZGU+IHRvIHJldHVybiBhIHZhbGlkIHJvdXRlLjwvcD5cXG48cD5CeSBkZWZhdWx0LCBpZiA8Y29kZT50YXVudXMubmF2aWdhdGUodXJsLCBvcHRpb25zKTwvY29kZT4gaXMgY2FsbGVkIHdpdGggYW4gPGNvZGU+dXJsPC9jb2RlPiB0aGF0IGRvZXNuJiMzOTt0IG1hdGNoIGFueSBjbGllbnQtc2lkZSByb3V0ZSwgdGhlbiB0aGUgdXNlciB3aWxsIGJlIHJlZGlyZWN0ZWQgdmlhIDxjb2RlPmxvY2F0aW9uLmhyZWY8L2NvZGU+LiBJbiBjYXNlcyB3aGVyZSB0aGUgYnJvd3NlciBkb2VzbiYjMzk7dCBzdXBwb3J0IHRoZSBoaXN0b3J5IEFQSSwgPGNvZGU+bG9jYXRpb24uaHJlZjwvY29kZT4gd2lsbCBiZSB1c2VkIGFzIHdlbGwuPC9wPlxcbjxwPlRoZXJlJiMzOTtzIGEgZmV3IG9wdGlvbnMgeW91IGNhbiB1c2UgdG8gdHdlYWsgdGhlIGJlaGF2aW9yIG9mIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT4uPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5PcHRpb248L3RoPlxcbjx0aD5EZXNjcmlwdGlvbjwvdGg+XFxuPC90cj5cXG48L3RoZWFkPlxcbjx0Ym9keT5cXG48dHI+XFxuPHRkPjxjb2RlPmNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+QSBET00gZWxlbWVudCB0aGF0IGNhdXNlZCB0aGUgbmF2aWdhdGlvbiBldmVudCwgdXNlZCB3aGVuIGVtaXR0aW5nIGV2ZW50czwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPnN0cmljdDwvY29kZT48L3RkPlxcbjx0ZD5JZiBzZXQgdG8gPGNvZGU+dHJ1ZTwvY29kZT4gYW5kIHRoZSBVUkwgZG9lc24mIzM5O3QgbWF0Y2ggYW55IHJvdXRlLCB0aGVuIHRoZSBuYXZpZ2F0aW9uIGF0dGVtcHQgbXVzdCBiZSBpZ25vcmVkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+c2Nyb2xsPC9jb2RlPjwvdGQ+XFxuPHRkPldoZW4gdGhpcyBpcyBzZXQgdG8gPGNvZGU+ZmFsc2U8L2NvZGU+LCBlbGVtZW50cyBhcmVuJiMzOTt0IHNjcm9sbGVkIGludG8gdmlldyBhZnRlciBuYXZpZ2F0aW9uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Zm9yY2U8L2NvZGU+PC90ZD5cXG48dGQ+VW5sZXNzIHRoaXMgaXMgc2V0IHRvIDxjb2RlPnRydWU8L2NvZGU+LCBuYXZpZ2F0aW9uIHdvbiYjMzk7dCA8ZW0+ZmV0Y2ggYSBtb2RlbDwvZW0+IGlmIHRoZSByb3V0ZSBtYXRjaGVzIHRoZSBjdXJyZW50IHJvdXRlLCBhbmQgPGNvZGU+c3RhdGUubW9kZWw8L2NvZGU+IHdpbGwgYmUgcmV1c2VkIGluc3RlYWQ8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT5yZXBsYWNlU3RhdGU8L2NvZGU+PC90ZD5cXG48dGQ+VXNlIDxjb2RlPnJlcGxhY2VTdGF0ZTwvY29kZT4gaW5zdGVhZCBvZiA8Y29kZT5wdXNoU3RhdGU8L2NvZGU+IHdoZW4gY2hhbmdpbmcgaGlzdG9yeTwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PlxcbjwvdGFibGU+XFxuPHA+Tm90ZSB0aGF0IHRoZSBub3Rpb24gb2YgPGVtPmZldGNoaW5nIGEgbW9kZWw8L2VtPiBtaWdodCBiZSBkZWNlaXZpbmcgYXMgdGhlIG1vZGVsIGNvdWxkIGJlIHB1bGxlZCBmcm9tIHRoZSBjYWNoZSBldmVuIGlmIDxjb2RlPmZvcmNlPC9jb2RlPiBpcyBzZXQgdG8gPGNvZGU+dHJ1ZTwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yb3V0ZS11cmwtXFxcIj48Y29kZT50YXVudXMucm91dGUodXJsKTwvY29kZT48L2gyPlxcbjxwPlRoaXMgY29udmVuaWVuY2UgbWV0aG9kIGFsbG93cyB5b3UgdG8gYnJlYWsgZG93biBhIFVSTCBpbnRvIGl0cyBpbmRpdmlkdWFsIGNvbXBvbmVudHMuIFRoZSBtZXRob2QgYWNjZXB0cyBhbnkgb2YgdGhlIGZvbGxvd2luZyBwYXR0ZXJucywgYW5kIGl0IHJldHVybnMgYSBUYXVudXMgcm91dGUgb2JqZWN0LjwvcD5cXG48dWw+XFxuPGxpPkEgZnVsbHkgcXVhbGlmaWVkIFVSTCBvbiB0aGUgc2FtZSBvcmlnaW4sIGUuZyA8Y29kZT5odHRwOi8vdGF1bnVzLmJldmFjcXVhLmlvL2FwaTwvY29kZT48L2xpPlxcbjxsaT5BbiBhYnNvbHV0ZSBVUkwgd2l0aG91dCBhbiBvcmlnaW4sIGUuZyA8Y29kZT4vYXBpPC9jb2RlPjwvbGk+XFxuPGxpPkp1c3QgYSBoYXNoLCBlLmcgPGNvZGU+I2ZvbzwvY29kZT4gPGVtPig8Y29kZT5sb2NhdGlvbi5ocmVmPC9jb2RlPiBpcyB1c2VkKTwvZW0+PC9saT5cXG48bGk+RmFsc3kgdmFsdWVzLCBlLmcgPGNvZGU+bnVsbDwvY29kZT4gPGVtPig8Y29kZT5sb2NhdGlvbi5ocmVmPC9jb2RlPiBpcyB1c2VkKTwvZW0+PC9saT5cXG48L3VsPlxcbjxwPlJlbGF0aXZlIFVSTHMgYXJlIG5vdCBzdXBwb3J0ZWQgPGVtPihhbnl0aGluZyB0aGF0IGRvZXNuJiMzOTt0IGhhdmUgYSBsZWFkaW5nIHNsYXNoKTwvZW0+LCBlLmcgPGNvZGU+ZmlsZXMvZGF0YS5qc29uPC9jb2RlPi4gQW55dGhpbmcgdGhhdCYjMzk7cyBub3Qgb24gdGhlIHNhbWUgb3JpZ2luIG9yIGRvZXNuJiMzOTt0IG1hdGNoIG9uZSBvZiB0aGUgcmVnaXN0ZXJlZCByb3V0ZXMgaXMgZ29pbmcgdG8geWllbGQgPGNvZGU+bnVsbDwvY29kZT4uPC9wPlxcbjxwPjxlbT5UaGlzIG1ldGhvZCBpcyBwYXJ0aWN1bGFybHkgdXNlZnVsIHdoZW4gZGVidWdnaW5nIHlvdXIgcm91dGluZyB0YWJsZXMsIGFzIGl0IGdpdmVzIHlvdSBkaXJlY3QgYWNjZXNzIHRvIHRoZSByb3V0ZXIgdXNlZCBpbnRlcm5hbGx5IGJ5IFRhdW51cy48L2VtPjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcIi10YXVudXMtcm91dGUtZXF1YWxzLXJvdXRlLXJvdXRlLVxcXCI+PGNvZGU+dGF1bnVzLnJvdXRlLmVxdWFscyhyb3V0ZSwgcm91dGUpPC9jb2RlPjwvaDE+XFxuPHA+Q29tcGFyZXMgdHdvIHJvdXRlcyBhbmQgcmV0dXJucyA8Y29kZT50cnVlPC9jb2RlPiBpZiB0aGV5IHdvdWxkIGZldGNoIHRoZSBzYW1lIG1vZGVsLiBOb3RlIHRoYXQgZGlmZmVyZW50IFVSTHMgbWF5IHN0aWxsIHJldHVybiA8Y29kZT50cnVlPC9jb2RlPi4gRm9yIGluc3RhbmNlLCA8Y29kZT4vZm9vPC9jb2RlPiBhbmQgPGNvZGU+L2ZvbyNiYXI8L2NvZGU+IHdvdWxkIGZldGNoIHRoZSBzYW1lIG1vZGVsIGV2ZW4gaWYgdGhleSYjMzk7cmUgZGlmZmVyZW50IFVSTHMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1zdGF0ZS1cXFwiPjxjb2RlPnRhdW51cy5zdGF0ZTwvY29kZT48L2gyPlxcbjxwPlRoaXMgaXMgYW4gaW50ZXJuYWwgc3RhdGUgdmFyaWFibGUsIGFuZCBpdCBjb250YWlucyBhIGxvdCBvZiB1c2VmdWwgZGVidWdnaW5nIGluZm9ybWF0aW9uLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmNvbnRhaW5lcjwvY29kZT4gaXMgdGhlIERPTSBlbGVtZW50IHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9saT5cXG48bGk+PGNvZGU+Y29udHJvbGxlcnM8L2NvZGU+IGFyZSBhbGwgdGhlIGNvbnRyb2xsZXJzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+PGNvZGU+dGVtcGxhdGVzPC9jb2RlPiBhcmUgYWxsIHRoZSB0ZW1wbGF0ZXMsIGFzIGRlZmluZWQgaW4gdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IGFyZSBhbGwgdGhlIHJvdXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBpcyBhIHJlZmVyZW5jZSB0byB0aGUgY3VycmVudCByb3V0ZTwvbGk+XFxuPGxpPjxjb2RlPm1vZGVsPC9jb2RlPiBpcyBhIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgdXNlZCB0byByZW5kZXIgdGhlIGN1cnJlbnQgdmlldzwvbGk+XFxuPGxpPjxjb2RlPnByZWZldGNoPC9jb2RlPiBleHBvc2VzIHdoZXRoZXIgcHJlZmV0Y2hpbmcgaXMgdHVybmVkIG9uPC9saT5cXG48bGk+PGNvZGU+Y2FjaGU8L2NvZGU+IGV4cG9zZXMgd2hldGhlciBjYWNoaW5nIGlzIGVuYWJsZWQ8L2xpPlxcbjwvdWw+XFxuPHA+T2YgY291cnNlLCB5b3VyIG5vdCBzdXBwb3NlZCB0byBtZWRkbGUgd2l0aCBpdCwgc28gYmUgYSBnb29kIGNpdGl6ZW4gYW5kIGp1c3QgaW5zcGVjdCBpdHMgdmFsdWVzITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS10YXVudXNyYy1tYW5pZmVzdFxcXCI+VGhlIDxjb2RlPi50YXVudXNyYzwvY29kZT4gbWFuaWZlc3Q8L2gxPlxcbjxwPklmIHlvdSB3YW50IHRvIHVzZSB2YWx1ZXMgb3RoZXIgdGhhbiB0aGUgY29udmVudGlvbmFsIGRlZmF1bHRzIHNob3duIGluIHRoZSB0YWJsZSBiZWxvdywgdGhlbiB5b3Ugc2hvdWxkIGNyZWF0ZSBhIDxjb2RlPi50YXVudXNyYzwvY29kZT4gZmlsZS4gTm90ZSB0aGF0IHRoZSBkZWZhdWx0cyBuZWVkIHRvIGJlIG92ZXJ3cml0dGVuIGluIGEgY2FzZS1ieS1jYXNlIGJhc2lzLiBUaGVzZSBvcHRpb25zIGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgaW4geW91ciA8Y29kZT5wYWNrYWdlLmpzb248L2NvZGU+LCB1bmRlciB0aGUgPGNvZGU+dGF1bnVzPC9jb2RlPiBwcm9wZXJ0eS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc29uXFxcIj57XFxuICAmcXVvdDt2aWV3cyZxdW90OzogJnF1b3Q7LmJpbi92aWV3cyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9yb3V0ZXMmcXVvdDs6ICZxdW90O2NvbnRyb2xsZXJzL3JvdXRlcy5qcyZxdW90OyxcXG4gICZxdW90O3NlcnZlcl9jb250cm9sbGVycyZxdW90OzogJnF1b3Q7Y29udHJvbGxlcnMmcXVvdDssXFxuICAmcXVvdDtjbGllbnRfY29udHJvbGxlcnMmcXVvdDs6ICZxdW90O2NsaWVudC9qcy9jb250cm9sbGVycyZxdW90OyxcXG4gICZxdW90O2NsaWVudF93aXJpbmcmcXVvdDs6ICZxdW90Oy5iaW4vd2lyaW5nLmpzJnF1b3Q7XFxufVxcbjwvY29kZT48L3ByZT5cXG48dWw+XFxuPGxpPlRoZSA8Y29kZT52aWV3czwvY29kZT4gZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgdmlld3MgPGVtPihhbHJlYWR5IGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdCk8L2VtPiBhcmUgcGxhY2VkLiBUaGVzZSB2aWV3cyBhcmUgdXNlZCBkaXJlY3RseSBvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9yb3V0ZXM8L2NvZGU+IGZpbGUgaXMgdGhlIG1vZHVsZSB3aGVyZSB5b3UgZXhwb3J0IGEgY29sbGVjdGlvbiBvZiByb3V0ZXMuIFRoZSBDTEkgd2lsbCBwdWxsIHRoZXNlIHJvdXRlcyB3aGVuIGNyZWF0aW5nIHRoZSBjbGllbnQtc2lkZSByb3V0ZXMgZm9yIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+VGhlIDxjb2RlPnNlcnZlcl9jb250cm9sbGVyczwvY29kZT4gZGlyZWN0b3J5IGlzIHRoZSByb290IGRpcmVjdG9yeSB3aGVyZSB5b3VyIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGxpdmUuIEl0JiMzOTtzIHVzZWQgd2hlbiBzZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZSByb3V0ZXI8L2xpPlxcbjxsaT5UaGUgPGNvZGU+Y2xpZW50X2NvbnRyb2xsZXJzPC9jb2RlPiBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciBjbGllbnQtc2lkZSBjb250cm9sbGVyIG1vZHVsZXMgbGl2ZS4gVGhlIENMSSB3aWxsIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHRoZXNlIGNvbnRyb2xsZXJzIGluIGl0cyByZXN1bHRpbmcgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPlRoZSA8Y29kZT5jbGllbnRfd2lyaW5nPC9jb2RlPiBmaWxlIGlzIHdoZXJlIHlvdXIgd2lyaW5nIG1vZHVsZSB3aWxsIGJlIHBsYWNlZCBieSB0aGUgQ0xJLiBZb3UmIzM5O2xsIHRoZW4gaGF2ZSB0byA8Y29kZT5yZXF1aXJlPC9jb2RlPiBpdCBpbiB5b3VyIGFwcGxpY2F0aW9uIHdoZW4gYm9vdGluZyB1cCBUYXVudXM8L2xpPlxcbjwvdWw+XFxuPHA+SGVyZSBpcyB3aGVyZSB0aGluZ3MgZ2V0IDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmEgbGl0dGxlIGNvbnZlbnRpb25hbDwvYT4uIFZpZXdzLCBhbmQgYm90aCBzZXJ2ZXItc2lkZSBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4cGVjdGVkIHRvIGJlIG9yZ2FuaXplZCBieSBmb2xsb3dpbmcgdGhlIDxjb2RlPntyb290fS97Y29udHJvbGxlcn0ve2FjdGlvbn08L2NvZGU+IHBhdHRlcm4sIGJ1dCB5b3UgY291bGQgY2hhbmdlIHRoYXQgdXNpbmcgPGNvZGU+cmVzb2x2ZXJzPC9jb2RlPiB3aGVuIGludm9raW5nIHRoZSBDTEkgYW5kIHVzaW5nIHRoZSBzZXJ2ZXItc2lkZSBBUEkuPC9wPlxcbjxwPlZpZXdzIGFuZCBjb250cm9sbGVycyBhcmUgYWxzbyBleHBlY3RlZCB0byBiZSBDb21tb25KUyBtb2R1bGVzIHRoYXQgZXhwb3J0IGEgc2luZ2xlIG1ldGhvZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBBUEkgRG9jdW1lbnRhdGlvblxcblxcbiAgICBIZXJlJ3MgdGhlIEFQSSBkb2N1bWVudGF0aW9uIGZvciBUYXVudXMuIElmIHlvdSd2ZSBuZXZlciB1c2VkIGl0IGJlZm9yZSwgd2UgcmVjb21tZW5kIGdvaW5nIG92ZXIgdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlIGJlZm9yZSBqdW1waW5nIGludG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uLiBUaGF0IHdheSwgeW91J2xsIGdldCBhIGJldHRlciBpZGVhIG9mIHdoYXQgdG8gbG9vayBmb3IgYW5kIGhvdyB0byBwdXQgdG9nZXRoZXIgc2ltcGxlIGFwcGxpY2F0aW9ucyB1c2luZyBUYXVudXMsIGJlZm9yZSBnb2luZyB0aHJvdWdoIGRvY3VtZW50YXRpb24gb24gZXZlcnkgcHVibGljIGludGVyZmFjZSB0byBUYXVudXMuXFxuXFxuICAgIFRhdW51cyBleHBvc2VzIF90aHJlZSBkaWZmZXJlbnQgcHVibGljIEFQSXNfLCBhbmQgdGhlcmUncyBhbHNvICoqcGx1Z2lucyB0byBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlcioqLiBUaGlzIGRvY3VtZW50IGNvdmVycyBhbGwgdGhyZWUgQVBJcyBleHRlbnNpdmVseS4gSWYgeW91J3JlIGNvbmNlcm5lZCBhYm91dCB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgVGF1bnVzLCBwbGVhc2UgcmVmZXIgdG8gdGhlIFtHZXR0aW5nIFN0YXJ0ZWRdWzFdIGd1aWRlLiBUaGlzIGRvY3VtZW50IGFpbXMgdG8gb25seSBjb3ZlciBob3cgdGhlIHB1YmxpYyBpbnRlcmZhY2UgYWZmZWN0cyBhcHBsaWNhdGlvbiBzdGF0ZSwgYnV0ICoqZG9lc24ndCBkZWx2ZSBpbnRvIGltcGxlbWVudGF0aW9uIGRldGFpbHMqKi5cXG5cXG4gICAgIyBUYWJsZSBvZiBDb250ZW50c1xcblxcbiAgICAtIEEgW3NlcnZlci1zaWRlIEFQSV0oI3NlcnZlci1zaWRlLWFwaSkgdGhhdCBkZWFscyB3aXRoIHNlcnZlci1zaWRlIHJlbmRlcmluZ1xcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm1vdW50YF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgICAgLSBJdHMgW2BvcHRpb25zYF0oI3RoZS1vcHRpb25zLW9iamVjdCkgYXJndW1lbnRcXG4gICAgICAgICAgLSBbYGxheW91dGBdKCMtb3B0aW9ucy1sYXlvdXQtKVxcbiAgICAgICAgICAtIFtgcm91dGVzYF0oIy1vcHRpb25zLXJvdXRlcy0pXFxuICAgICAgICAgIC0gW2BnZXREZWZhdWx0Vmlld01vZGVsYF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKVxcbiAgICAgICAgICAtIFtgcGxhaW50ZXh0YF0oIy1vcHRpb25zLXBsYWludGV4dC0pXFxuICAgICAgICAgIC0gW2ByZXNvbHZlcnNgXSgjLW9wdGlvbnMtcmVzb2x2ZXJzLSlcXG4gICAgICAgIC0gSXRzIFtgYWRkUm91dGVgXSgjLWFkZHJvdXRlLWRlZmluaXRpb24tKSBhcmd1bWVudFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlbmRlcmBdKCMtdGF1bnVzLXJlbmRlci1hY3Rpb24tdmlld21vZGVsLXJlcS1yZXMtbmV4dC0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsYF0oIy10YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWwtZG9uZS0pIG1ldGhvZFxcbiAgICAtIEEgW3N1aXRlIG9mIHBsdWdpbnNdKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSBjYW4gaW50ZWdyYXRlIFRhdW51cyBhbmQgYW4gSFRUUCBzZXJ2ZXJcXG4gICAgICAtIFVzaW5nIFtgdGF1bnVzLWV4cHJlc3NgXSgjdXNpbmctdGF1bnVzLWV4cHJlc3MtKSBmb3IgW0V4cHJlc3NdWzJdXFxuICAgICAgLSBVc2luZyBbYHRhdW51cy1oYXBpYF0oI3VzaW5nLXRhdW51cy1oYXBpLSkgZm9yIFtIYXBpXVszXVxcbiAgICAtIEEgW0NMSSB0aGF0IHByb2R1Y2VzIGEgd2lyaW5nIG1vZHVsZV0oI2NvbW1hbmQtbGluZS1pbnRlcmZhY2UpIGZvciB0aGUgY2xpZW50LXNpZGVcXG4gICAgICAtIFRoZSBbYC0tb3V0cHV0YF0oIy1vdXRwdXQtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXdhdGNoYF0oIy13YXRjaC0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0tdHJhbnNmb3JtIDxtb2R1bGU+YF0oIy10cmFuc2Zvcm0tbW9kdWxlLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS1yZXNvbHZlcnMgPG1vZHVsZT5gXSgjLXJlc29sdmVycy1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXN0YW5kYWxvbmVgXSgjLXN0YW5kYWxvbmUtKSBmbGFnXFxuICAgIC0gQSBbY2xpZW50LXNpZGUgQVBJXSgjY2xpZW50LXNpZGUtYXBpKSB0aGF0IGRlYWxzIHdpdGggY2xpZW50LXNpZGUgcmVuZGVyaW5nXFxuICAgICAgLSBUaGUgW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1jb250YWluZXItd2lyaW5nLW9wdGlvbnMtKSBtZXRob2RcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgYXV0b2BdKCN1c2luZy10aGUtYXV0by1zdHJhdGVneSkgc3RyYXRlZ3lcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgaW5saW5lYF0oI3VzaW5nLXRoZS1pbmxpbmUtc3RyYXRlZ3kpIHN0cmF0ZWd5XFxuICAgICAgICAtIFVzaW5nIHRoZSBbYG1hbnVhbGBdKCN1c2luZy10aGUtbWFudWFsLXN0cmF0ZWd5KSBzdHJhdGVneVxcbiAgICAgICAgLSBbQ2FjaGluZ10oI2NhY2hpbmcpXFxuICAgICAgICAtIFtQcmVmZXRjaGluZ10oI3ByZWZldGNoaW5nKVxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9uYF0oIy10YXVudXMtb24tdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9uY2VgXSgjLXRhdW51cy1vbmNlLXR5cGUtZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5vZmZgXSgjLXRhdW51cy1vZmYtdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLmludGVyY2VwdGBdKCMtdGF1bnVzLWludGVyY2VwdC1hY3Rpb24tZm4tKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5wYXJ0aWFsYF0oIy10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMubmF2aWdhdGVgXSgjLXRhdW51cy1uYXZpZ2F0ZS11cmwtb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnJvdXRlYF0oIy10YXVudXMtcm91dGUtdXJsLSkgbWV0aG9kXFxuICAgICAgICAtIFRoZSBbYHRhdW51cy5yb3V0ZS5lcXVhbHNgXSgjLXRhdW51cy1yb3V0ZS1lcXVhbHMtcm91dGUtcm91dGUtKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5zdGF0ZWBdKCMtdGF1bnVzLXN0YXRlLSkgcHJvcGVydHlcXG4gICAgLSBUaGUgW2AudGF1bnVzcmNgXSgjdGhlLXRhdW51c3JjLW1hbmlmZXN0KSBtYW5pZmVzdFxcblxcbiAgICAjIFNlcnZlci1zaWRlIEFQSVxcblxcbiAgICBUaGUgc2VydmVyLXNpZGUgQVBJIGlzIHVzZWQgdG8gc2V0IHVwIHRoZSB2aWV3IHJvdXRlci4gSXQgdGhlbiBnZXRzIG91dCBvZiB0aGUgd2F5LCBhbGxvd2luZyB0aGUgY2xpZW50LXNpZGUgdG8gZXZlbnR1YWxseSB0YWtlIG92ZXIgYW5kIGFkZCBhbnkgZXh0cmEgc3VnYXIgb24gdG9wLCBfaW5jbHVkaW5nIGNsaWVudC1zaWRlIHJlbmRlcmluZ18uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMubW91bnQoYWRkUm91dGUsIG9wdGlvbnM/KWBcXG5cXG4gICAgTW91bnRzIFRhdW51cyBvbiB0b3Agb2YgYSBzZXJ2ZXItc2lkZSByb3V0ZXIsIGJ5IHJlZ2lzdGVyaW5nIGVhY2ggcm91dGUgaW4gYG9wdGlvbnMucm91dGVzYCB3aXRoIHRoZSBgYWRkUm91dGVgIG1ldGhvZC5cXG5cXG4gICAgPiBOb3RlIHRoYXQgbW9zdCBvZiB0aGUgdGltZSwgKip0aGlzIG1ldGhvZCBzaG91bGRuJ3QgYmUgaW52b2tlZCBkaXJlY3RseSoqLCBidXQgcmF0aGVyIHRocm91Z2ggb25lIG9mIHRoZSBbSFRUUCBmcmFtZXdvcmsgcGx1Z2luc10oI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnMpIHByZXNlbnRlZCBiZWxvdy5cXG5cXG4gICAgSGVyZSdzIGFuIGluY29tcGxldGUgZXhhbXBsZSBvZiBob3cgdGhpcyBtZXRob2QgbWF5IGJlIHVzZWQuIEl0IGlzIGluY29tcGxldGUgYmVjYXVzZSByb3V0ZSBkZWZpbml0aW9ucyBoYXZlIG1vcmUgb3B0aW9ucyBiZXlvbmQgdGhlIGByb3V0ZWAgYW5kIGBhY3Rpb25gIHByb3BlcnRpZXMuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdGF1bnVzLm1vdW50KGFkZFJvdXRlLCB7XFxuICAgICAgcm91dGVzOiBbeyByb3V0ZTogJy8nLCBhY3Rpb246ICdob21lL2luZGV4JyB9XVxcbiAgICB9KTtcXG5cXG4gICAgZnVuY3Rpb24gYWRkUm91dGUgKGRlZmluaXRpb24pIHtcXG4gICAgICBhcHAuZ2V0KGRlZmluaXRpb24ucm91dGUsIGRlZmluaXRpb24uYWN0aW9uKTtcXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgTGV0J3MgZ28gb3ZlciB0aGUgb3B0aW9ucyB5b3UgY2FuIHBhc3MgdG8gYHRhdW51cy5tb3VudGAgZmlyc3QuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVGhlIGBvcHRpb25zP2Agb2JqZWN0XFxuXFxuICAgIFRoZXJlJ3MgYSBmZXcgb3B0aW9ucyB0aGF0IGNhbiBiZSBwYXNzZWQgdG8gdGhlIHNlcnZlci1zaWRlIG1vdW50cG9pbnQuIFlvdSdyZSBwcm9iYWJseSBnb2luZyB0byBiZSBwYXNzaW5nIHRoZXNlIHRvIHlvdXIgW0hUVFAgZnJhbWV3b3JrIHBsdWdpbl0oI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnMpLCByYXRoZXIgdGhhbiB1c2luZyBgdGF1bnVzLm1vdW50YCBkaXJlY3RseS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLmxheW91dD9gXFxuXFxuICAgIFRoZSBgbGF5b3V0YCBwcm9wZXJ0eSBpcyBleHBlY3RlZCB0byBoYXZlIHRoZSBgZnVuY3Rpb24oZGF0YSlgIHNpZ25hdHVyZS4gSXQnbGwgYmUgaW52b2tlZCB3aGVuZXZlciBhIGZ1bGwgSFRNTCBkb2N1bWVudCBuZWVkcyB0byBiZSByZW5kZXJlZCwgYW5kIGEgYGRhdGFgIG9iamVjdCB3aWxsIGJlIHBhc3NlZCB0byBpdC4gVGhhdCBvYmplY3Qgd2lsbCBjb250YWluIGV2ZXJ5dGhpbmcgeW91J3ZlIHNldCBhcyB0aGUgdmlldyBtb2RlbCwgcGx1cyBhIGBwYXJ0aWFsYCBwcm9wZXJ0eSBjb250YWluaW5nIHRoZSByYXcgSFRNTCBvZiB0aGUgcmVuZGVyZWQgcGFydGlhbCB2aWV3LiBZb3VyIGBsYXlvdXRgIG1ldGhvZCB3aWxsIHR5cGljYWxseSB3cmFwIHRoZSByYXcgSFRNTCBmb3IgdGhlIHBhcnRpYWwgd2l0aCB0aGUgYmFyZSBib25lcyBvZiBhbiBIVE1MIGRvY3VtZW50LiBDaGVjayBvdXQgW3RoZSBgbGF5b3V0LmphZGVgIHVzZWQgaW4gUG9ueSBGb29dWzRdIGFzIGFuIGV4YW1wbGUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5yb3V0ZXNgXFxuXFxuICAgIFRoZSBvdGhlciBiaWcgb3B0aW9uIGlzIGByb3V0ZXNgLCB3aGljaCBleHBlY3RzIGEgY29sbGVjdGlvbiBvZiByb3V0ZSBkZWZpbml0aW9ucy4gUm91dGUgZGVmaW5pdGlvbnMgdXNlIGEgbnVtYmVyIG9mIHByb3BlcnRpZXMgdG8gZGV0ZXJtaW5lIGhvdyB0aGUgcm91dGUgaXMgZ29pbmcgdG8gYmVoYXZlLlxcblxcbiAgICBIZXJlJ3MgYW4gZXhhbXBsZSByb3V0ZSB0aGF0IHVzZXMgdGhlIFtFeHByZXNzXVsyXSByb3V0aW5nIHNjaGVtZS5cXG5cXG4gICAgYGBganNcXG4gICAge1xcbiAgICAgIHJvdXRlOiAnL2FydGljbGVzLzpzbHVnJyxcXG4gICAgICBhY3Rpb246ICdhcnRpY2xlcy9hcnRpY2xlJyxcXG4gICAgICBpZ25vcmU6IGZhbHNlLFxcbiAgICAgIGNhY2hlOiA8aW5oZXJpdD5cXG4gICAgfVxcbiAgICBgYGBcXG5cXG4gICAgLSBgcm91dGVgIGlzIGEgcm91dGUgaW4gdGhlIGZvcm1hdCB5b3VyIEhUVFAgZnJhbWV3b3JrIG9mIGNob2ljZSB1bmRlcnN0YW5kc1xcbiAgICAtIGBhY3Rpb25gIGlzIHRoZSBuYW1lIG9mIHlvdXIgY29udHJvbGxlciBhY3Rpb24uIEl0J2xsIGJlIHVzZWQgdG8gZmluZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlciwgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHNob3VsZCBiZSB1c2VkIHdpdGggdGhpcyByb3V0ZSwgYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyXFxuICAgIC0gYGNhY2hlYCBjYW4gYmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGNsaWVudC1zaWRlIGNhY2hpbmcgYmVoYXZpb3IgaW4gdGhpcyBhcHBsaWNhdGlvbiBwYXRoLCBhbmQgaXQnbGwgZGVmYXVsdCB0byBpbmhlcml0aW5nIGZyb20gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgIF9vbiB0aGUgY2xpZW50LXNpZGVfXFxuICAgIC0gYGlnbm9yZWAgaXMgdXNlZCBpbiB0aG9zZSBjYXNlcyB3aGVyZSB5b3Ugd2FudCBhIFVSTCB0byBiZSBpZ25vcmVkIGJ5IHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZXZlbiBpZiB0aGVyZSdzIGEgY2F0Y2gtYWxsIHJvdXRlIHRoYXQgd291bGQgbWF0Y2ggdGhhdCBVUkxcXG5cXG4gICAgQXMgYW4gZXhhbXBsZSBvZiB0aGUgYGlnbm9yZWAgdXNlIGNhc2UsIGNvbnNpZGVyIHRoZSByb3V0aW5nIHRhYmxlIHNob3duIGJlbG93LiBUaGUgY2xpZW50LXNpZGUgcm91dGVyIGRvZXNuJ3Qga25vdyBfKGFuZCBjYW4ndCBrbm93IHVubGVzcyB5b3UgcG9pbnQgaXQgb3V0KV8gd2hhdCByb3V0ZXMgYXJlIHNlcnZlci1zaWRlIG9ubHksIGFuZCBpdCdzIHVwIHRvIHlvdSB0byBwb2ludCB0aG9zZSBvdXQuXFxuXFxuICAgIGBgYGpzXFxuICAgIFtcXG4gICAgICB7IHJvdXRlOiAnLycsIGFjdGlvbjogJy9ob21lL2luZGV4JyB9LFxcbiAgICAgIHsgcm91dGU6ICcvZmVlZCcsIGlnbm9yZTogdHJ1ZSB9LFxcbiAgICAgIHsgcm91dGU6ICcvKicsIGFjdGlvbjogJ2Vycm9yL25vdC1mb3VuZCcgfVxcbiAgICBdXFxuICAgIGBgYFxcblxcbiAgICBUaGlzIHN0ZXAgaXMgbmVjZXNzYXJ5IHdoZW5ldmVyIHlvdSBoYXZlIGFuIGFuY2hvciBsaW5rIHBvaW50ZWQgYXQgc29tZXRoaW5nIGxpa2UgYW4gUlNTIGZlZWQuIFRoZSBgaWdub3JlYCBwcm9wZXJ0eSBpcyBlZmZlY3RpdmVseSB0ZWxsaW5nIHRoZSBjbGllbnQtc2lkZSBfXFxcImRvbid0IGhpamFjayBsaW5rcyBjb250YWluaW5nIHRoaXMgVVJMXFxcIl8uXFxuXFxuICAgIFBsZWFzZSBub3RlIHRoYXQgZXh0ZXJuYWwgbGlua3MgYXJlIG5ldmVyIGhpamFja2VkLiBPbmx5IHNhbWUtb3JpZ2luIGxpbmtzIGNvbnRhaW5pbmcgYSBVUkwgdGhhdCBtYXRjaGVzIG9uZSBvZiB0aGUgcm91dGVzIHdpbGwgYmUgaGlqYWNrZWQgYnkgVGF1bnVzLiBFeHRlcm5hbCBsaW5rcyBkb24ndCBuZWVkIHRvIGJlIGBpZ25vcmVgZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLmdldERlZmF1bHRWaWV3TW9kZWw/YFxcblxcbiAgICBUaGUgYGdldERlZmF1bHRWaWV3TW9kZWwoZG9uZSlgIHByb3BlcnR5IGNhbiBiZSBhIG1ldGhvZCB0aGF0IHB1dHMgdG9nZXRoZXIgdGhlIGJhc2UgdmlldyBtb2RlbCwgd2hpY2ggd2lsbCB0aGVuIGJlIGV4dGVuZGVkIG9uIGFuIGFjdGlvbi1ieS1hY3Rpb24gYmFzaXMuIFdoZW4geW91J3JlIGRvbmUgY3JlYXRpbmcgYSB2aWV3IG1vZGVsLCB5b3UgY2FuIGludm9rZSBgZG9uZShudWxsLCBtb2RlbClgLiBJZiBhbiBlcnJvciBvY2N1cnMgd2hpbGUgYnVpbGRpbmcgdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgY2FsbCBgZG9uZShlcnIpYCBpbnN0ZWFkLlxcblxcbiAgICBUYXVudXMgd2lsbCB0aHJvdyBhbiBlcnJvciBpZiBgZG9uZWAgaXMgaW52b2tlZCB3aXRoIGFuIGVycm9yLCBzbyB5b3UgbWlnaHQgd2FudCB0byBwdXQgc2FmZWd1YXJkcyBpbiBwbGFjZSBhcyB0byBhdm9pZCB0aGF0IGZyb20gaGFwcGVubmluZy4gVGhlIHJlYXNvbiB0aGlzIG1ldGhvZCBpcyBhc3luY2hyb25vdXMgaXMgYmVjYXVzZSB5b3UgbWF5IG5lZWQgZGF0YWJhc2UgYWNjZXNzIG9yIHNvbWVzdWNoIHdoZW4gcHV0dGluZyB0b2dldGhlciB0aGUgZGVmYXVsdHMuIFRoZSByZWFzb24gdGhpcyBpcyBhIG1ldGhvZCBhbmQgbm90IGp1c3QgYW4gb2JqZWN0IGlzIHRoYXQgdGhlIGRlZmF1bHRzIG1heSBjaGFuZ2UgZHVlIHRvIGh1bWFuIGludGVyYWN0aW9uIHdpdGggdGhlIGFwcGxpY2F0aW9uLCBhbmQgaW4gdGhvc2UgY2FzZXMgW3RoZSBkZWZhdWx0cyBjYW4gYmUgcmVidWlsdF0oI3RhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbCkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5wbGFpbnRleHQ/YFxcblxcbiAgICBUaGUgYHBsYWludGV4dGAgb3B0aW9ucyBvYmplY3QgaXMgcGFzc2VkIGRpcmVjdGx5IHRvIFtoZ2V0XVs1XSwgYW5kIGl0J3MgdXNlZCB0byBbdHdlYWsgdGhlIHBsYWludGV4dCB2ZXJzaW9uXVs2XSBvZiB5b3VyIHNpdGUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMjIyBgb3B0aW9ucy5yZXNvbHZlcnM/YFxcblxcbiAgICBSZXNvbHZlcnMgYXJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBsb2NhdGlvbiBvZiBzb21lIG9mIHRoZSBkaWZmZXJlbnQgcGllY2VzIG9mIHlvdXIgYXBwbGljYXRpb24uIFR5cGljYWxseSB5b3Ugd29uJ3QgaGF2ZSB0byB0b3VjaCB0aGVzZSBpbiB0aGUgc2xpZ2h0ZXN0LlxcblxcbiAgICBTaWduYXR1cmUgICAgICAgICAgICAgICAgICAgICB8IERlc2NyaXB0aW9uXFxuICAgIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYGdldFNlcnZlckNvbnRyb2xsZXIoYWN0aW9uKWAgfCBSZXR1cm4gcGF0aCB0byBzZXJ2ZXItc2lkZSBjb250cm9sbGVyIGFjdGlvbiBoYW5kbGVyIG1vZHVsZVxcbiAgICBgZ2V0VmlldyhhY3Rpb24pYCAgICAgICAgICAgICB8IFJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlXFxuXFxuICAgIFRoZSBgYWRkUm91dGVgIG1ldGhvZCBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgb24gdGhlIHNlcnZlci1zaWRlIGlzIG1vc3RseSBnb2luZyB0byBiZSB1c2VkIGludGVybmFsbHkgYnkgdGhlIEhUVFAgZnJhbWV3b3JrIHBsdWdpbnMsIHNvIGZlZWwgZnJlZSB0byBza2lwIG92ZXIgdGhlIGZvbGxvd2luZyBzZWN0aW9uLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIGBhZGRSb3V0ZShkZWZpbml0aW9uKWBcXG5cXG4gICAgVGhlIGBhZGRSb3V0ZShkZWZpbml0aW9uKWAgbWV0aG9kIHdpbGwgYmUgcGFzc2VkIGEgcm91dGUgZGVmaW5pdGlvbiwgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXMuIFRoaXMgbWV0aG9kIGlzIGV4cGVjdGVkIHRvIHJlZ2lzdGVyIGEgcm91dGUgaW4geW91ciBIVFRQIGZyYW1ld29yaydzIHJvdXRlci5cXG5cXG4gICAgLSBgcm91dGVgIGlzIHRoZSByb3V0ZSB0aGF0IHlvdSBzZXQgYXMgYGRlZmluaXRpb24ucm91dGVgXFxuICAgIC0gYGFjdGlvbmAgaXMgdGhlIGFjdGlvbiBhcyBwYXNzZWQgdG8gdGhlIHJvdXRlIGRlZmluaXRpb25cXG4gICAgLSBgYWN0aW9uRm5gIHdpbGwgYmUgdGhlIGNvbnRyb2xsZXIgZm9yIHRoaXMgYWN0aW9uIG1ldGhvZFxcbiAgICAtIGBtaWRkbGV3YXJlYCB3aWxsIGJlIGFuIGFycmF5IG9mIG1ldGhvZHMgdG8gYmUgZXhlY3V0ZWQgYmVmb3JlIGBhY3Rpb25GbmBcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5yZW5kZXIoYWN0aW9uLCB2aWV3TW9kZWwsIHJlcSwgcmVzLCBuZXh0KWBcXG5cXG4gICAgVGhpcyBtZXRob2QgaXMgYWxtb3N0IGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBhcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIFRhdW51cyB0aHJvdWdoIG9uZSBvZiB0aGUgcGx1Z2lucyBhbnl3YXlzLCBzbyB3ZSB3b24ndCBnbyB2ZXJ5IGRlZXAgaW50byBpdC5cXG5cXG4gICAgVGhlIHJlbmRlciBtZXRob2QgaXMgd2hhdCBUYXVudXMgdXNlcyB0byByZW5kZXIgdmlld3MgYnkgY29uc3RydWN0aW5nIEhUTUwsIEpTT04sIG9yIHBsYWludGV4dCByZXNwb25zZXMuIFRoZSBgYWN0aW9uYCBwcm9wZXJ0eSBkZXRlcm1pbmVzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCB3aWxsIGJlIHJlbmRlcmVkLiBUaGUgYHZpZXdNb2RlbGAgd2lsbCBiZSBleHRlbmRlZCBieSBbdGhlIGRlZmF1bHQgdmlldyBtb2RlbF0oIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtKSwgYW5kIGl0IG1heSBhbHNvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGBhY3Rpb25gIGJ5IHNldHRpbmcgYHZpZXdNb2RlbC5tb2RlbC5hY3Rpb25gLlxcblxcbiAgICBUaGUgYHJlcWAsIGByZXNgLCBhbmQgYG5leHRgIGFyZ3VtZW50cyBhcmUgZXhwZWN0ZWQgdG8gYmUgdGhlIEV4cHJlc3Mgcm91dGluZyBhcmd1bWVudHMsIGJ1dCB0aGV5IGNhbiBhbHNvIGJlIG1vY2tlZCBfKHdoaWNoIGlzIGluIGZhY3Qgd2hhdCB0aGUgSGFwaSBwbHVnaW4gZG9lcylfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsKGRvbmU/KWBcXG5cXG4gICAgT25jZSBUYXVudXMgaGFzIGJlZW4gbW91bnRlZCwgY2FsbGluZyB0aGlzIG1ldGhvZCB3aWxsIHJlYnVpbGQgdGhlIHZpZXcgbW9kZWwgZGVmYXVsdHMgdXNpbmcgdGhlIGBnZXREZWZhdWx0Vmlld01vZGVsYCB0aGF0IHdhcyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgaW4gdGhlIG9wdGlvbnMuIEFuIG9wdGlvbmFsIGBkb25lYCBjYWxsYmFjayB3aWxsIGJlIGludm9rZWQgd2hlbiB0aGUgbW9kZWwgaXMgcmVidWlsdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBIVFRQIEZyYW1ld29yayBQbHVnaW5zXFxuXFxuICAgIFRoZXJlJ3MgY3VycmVudGx5IHR3byBkaWZmZXJlbnQgSFRUUCBmcmFtZXdvcmtzIF8oW0V4cHJlc3NdWzJdIGFuZCBbSGFwaV1bM10pXyB0aGF0IHlvdSBjYW4gcmVhZGlseSB1c2Ugd2l0aCBUYXVudXMgd2l0aG91dCBoYXZpbmcgdG8gZGVhbCB3aXRoIGFueSBvZiB0aGUgcm91dGUgcGx1bWJpbmcgeW91cnNlbGYuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtZXhwcmVzc2BcXG5cXG4gICAgVGhlIGB0YXVudXMtZXhwcmVzc2AgcGx1Z2luIGlzIHByb2JhYmx5IHRoZSBlYXNpZXN0IHRvIHVzZSwgYXMgVGF1bnVzIHdhcyBvcmlnaW5hbGx5IGRldmVsb3BlZCB3aXRoIGp1c3QgW0V4cHJlc3NdWzJdIGluIG1pbmQuIEluIGFkZGl0aW9uIHRvIHRoZSBvcHRpb25zIGFscmVhZHkgb3V0bGluZWQgZm9yIFt0YXVudXMubW91bnRdKCMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtKSwgeW91IGNhbiBhZGQgbWlkZGxld2FyZSBmb3IgYW55IHJvdXRlIGluZGl2aWR1YWxseS5cXG5cXG4gICAgLSBgbWlkZGxld2FyZWAgYXJlIGFueSBtZXRob2RzIHlvdSB3YW50IFRhdW51cyB0byBleGVjdXRlIGFzIG1pZGRsZXdhcmUgaW4gRXhwcmVzcyBhcHBsaWNhdGlvbnNcXG5cXG4gICAgVG8gZ2V0IGB0YXVudXMtZXhwcmVzc2AgZ29pbmcgeW91IGNhbiB1c2UgdGhlIGZvbGxvd2luZyBwaWVjZSBvZiBjb2RlLCBwcm92aWRlZCB0aGF0IHlvdSBjb21lIHVwIHdpdGggYW4gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIC8vIC4uLlxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgdGF1bnVzRXhwcmVzc2AgbWV0aG9kIHdpbGwgbWVyZWx5IHNldCB1cCBUYXVudXMgYW5kIGFkZCB0aGUgcmVsZXZhbnQgcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBhcHBsaWNhdGlvbiBieSBjYWxsaW5nIGBhcHAuZ2V0YCBhIGJ1bmNoIG9mIHRpbWVzLiBZb3UgY2FuIFtmaW5kIHRhdW51cy1leHByZXNzIG9uIEdpdEh1Yl1bN10uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtaGFwaWBcXG5cXG4gICAgVGhlIGB0YXVudXMtaGFwaWAgcGx1Z2luIGlzIGEgYml0IG1vcmUgaW52b2x2ZWQsIGFuZCB5b3UnbGwgaGF2ZSB0byBjcmVhdGUgYSBQYWNrIGluIG9yZGVyIHRvIHVzZSBpdC4gSW4gYWRkaXRpb24gdG8gW3RoZSBvcHRpb25zIHdlJ3ZlIGFscmVhZHkgY292ZXJlZF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pLCB5b3UgY2FuIGFkZCBgY29uZmlnYCBvbiBhbnkgcm91dGUuXFxuXFxuICAgIC0gYGNvbmZpZ2AgaXMgcGFzc2VkIGRpcmVjdGx5IGludG8gdGhlIHJvdXRlIHJlZ2lzdGVyZWQgd2l0aCBIYXBpLCBnaXZpbmcgeW91IHRoZSBtb3N0IGZsZXhpYmlsaXR5XFxuXFxuICAgIFRvIGdldCBgdGF1bnVzLWhhcGlgIGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgYW5kIHlvdSBjYW4gYnJpbmcgeW91ciBvd24gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgSGFwaSA9IHJlcXVpcmUoJ2hhcGknKTtcXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzSGFwaSA9IHJlcXVpcmUoJ3RhdW51cy1oYXBpJykodGF1bnVzKTtcXG4gICAgdmFyIHBhY2sgPSBuZXcgSGFwaS5QYWNrKCk7XFxuXFxuICAgIHBhY2sucmVnaXN0ZXIoe1xcbiAgICAgIHBsdWdpbjogdGF1bnVzSGFwaSxcXG4gICAgICBvcHRpb25zOiB7XFxuICAgICAgICAvLyAuLi5cXG4gICAgICB9XFxuICAgIH0pO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGB0YXVudXNIYXBpYCBwbHVnaW4gd2lsbCBtb3VudCBUYXVudXMgYW5kIHJlZ2lzdGVyIGFsbCBvZiB0aGUgbmVjZXNzYXJ5IHJvdXRlcy4gWW91IGNhbiBbZmluZCB0YXVudXMtaGFwaSBvbiBHaXRIdWJdWzhdLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIENvbW1hbmQtTGluZSBJbnRlcmZhY2VcXG5cXG4gICAgT25jZSB5b3UndmUgc2V0IHVwIHRoZSBzZXJ2ZXItc2lkZSB0byByZW5kZXIgeW91ciB2aWV3cyB1c2luZyBUYXVudXMsIGl0J3Mgb25seSBsb2dpY2FsIHRoYXQgeW91J2xsIHdhbnQgdG8gcmVuZGVyIHRoZSB2aWV3cyBpbiB0aGUgY2xpZW50LXNpZGUgYXMgd2VsbCwgZWZmZWN0aXZlbHkgY29udmVydGluZyB5b3VyIGFwcGxpY2F0aW9uIGludG8gYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbiBhZnRlciB0aGUgZmlyc3QgdmlldyBoYXMgYmVlbiByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuXFxuXFxuICAgIFRoZSBUYXVudXMgQ0xJIGlzIGFuIHVzZWZ1bCBpbnRlcm1lZGlhcnkgaW4gdGhlIHByb2Nlc3Mgb2YgZ2V0dGluZyB0aGUgY29uZmlndXJhdGlvbiB5b3Ugd3JvdGUgc28gZmFyIGZvciB0aGUgc2VydmVyLXNpZGUgdG8gYWxzbyB3b3JrIHdlbGwgaW4gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJbnN0YWxsIGl0IGdsb2JhbGx5IGZvciBkZXZlbG9wbWVudCwgYnV0IHJlbWVtYmVyIHRvIHVzZSBsb2NhbCBjb3BpZXMgZm9yIHByb2R1Y3Rpb24tZ3JhZGUgdXNlcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLWcgdGF1bnVzXFxuICAgIGBgYFxcblxcbiAgICBXaGVuIGludm9rZWQgd2l0aG91dCBhbnkgYXJndW1lbnRzLCB0aGUgQ0xJIHdpbGwgc2ltcGx5IGZvbGxvdyB0aGUgZGVmYXVsdCBjb252ZW50aW9ucyB0byBmaW5kIHlvdXIgcm91dGUgZGVmaW5pdGlvbnMsIHZpZXdzLCBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgQnkgZGVmYXVsdCwgdGhlIG91dHB1dCB3aWxsIGJlIHByaW50ZWQgdG8gdGhlIHN0YW5kYXJkIG91dHB1dCwgbWFraW5nIGZvciBhIGZhc3QgZGVidWdnaW5nIGV4cGVyaWVuY2UuIEhlcmUncyB0aGUgb3V0cHV0IGlmIHlvdSBqdXN0IGhhZCBhIHNpbmdsZSBgaG9tZS9pbmRleGAgcm91dGUsIGFuZCB0aGUgbWF0Y2hpbmcgdmlldyBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlciBleGlzdGVkLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0ZW1wbGF0ZXMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuL3ZpZXdzL2hvbWUvaW5kZXguanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgY29udHJvbGxlcnMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qcycpXFxuICAgIH07XFxuXFxuICAgIHZhciByb3V0ZXMgPSB7XFxuICAgICAgJy8nOiB7XFxuICAgICAgICBhY3Rpb246ICdob21lL2luZGV4J1xcbiAgICAgIH1cXG4gICAgfTtcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XFxuICAgICAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICAgICAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgICAgIHJvdXRlczogcm91dGVzXFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBZb3UgY2FuIHVzZSBhIGZldyBvcHRpb25zIHRvIGFsdGVyIHRoZSBvdXRjb21lIG9mIGludm9raW5nIGB0YXVudXNgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS1vdXRwdXRgXFxuXFxuICAgIDxzdWI+dGhlIGAtb2AgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIE91dHB1dCBpcyB3cml0dGVuIHRvIGEgZmlsZSBpbnN0ZWFkIG9mIHRvIHN0YW5kYXJkIG91dHB1dC4gVGhlIGZpbGUgcGF0aCB1c2VkIHdpbGwgYmUgdGhlIGBjbGllbnRfd2lyaW5nYCBvcHRpb24gaW4gW2AudGF1bnVzcmNgXSgjdGhlLXRhdW51c3JjLW1hbmlmZXN0KSwgd2hpY2ggZGVmYXVsdHMgdG8gYCcuYmluL3dpcmluZy5qcydgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS13YXRjaGBcXG5cXG4gICAgPHN1Yj50aGUgYC13YCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgV2hlbmV2ZXIgYSBzZXJ2ZXItc2lkZSByb3V0ZSBkZWZpbml0aW9uIGNoYW5nZXMsIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCBhZ2FpbiB0byBlaXRoZXIgc3RhbmRhcmQgb3V0cHV0IG9yIGEgZmlsZSwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgYC0tb3V0cHV0YCB3YXMgdXNlZC5cXG5cXG4gICAgVGhlIHByb2dyYW0gd29uJ3QgZXhpdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tdHJhbnNmb3JtIDxtb2R1bGU+YFxcblxcbiAgICA8c3ViPnRoZSBgLXRgIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBUaGlzIGZsYWcgYWxsb3dzIHlvdSB0byB0cmFuc2Zvcm0gc2VydmVyLXNpZGUgcm91dGVzIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSB1bmRlcnN0YW5kcy4gRXhwcmVzcyByb3V0ZXMgYXJlIGNvbXBsZXRlbHkgY29tcGF0aWJsZSB3aXRoIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIsIGJ1dCBIYXBpIHJvdXRlcyBuZWVkIHRvIGJlIHRyYW5zZm9ybWVkIHVzaW5nIHRoZSBbYGhhcGlpZnlgXVs5XSBtb2R1bGUuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIGhhcGlpZnlcXG4gICAgdGF1bnVzIC10IGhhcGlpZnlcXG4gICAgYGBgXFxuXFxuICAgIFVzaW5nIHRoaXMgdHJhbnNmb3JtIHJlbGlldmVzIHlvdSBmcm9tIGhhdmluZyB0byBkZWZpbmUgdGhlIHNhbWUgcm91dGVzIHR3aWNlIHVzaW5nIHNsaWdodGx5IGRpZmZlcmVudCBmb3JtYXRzIHRoYXQgY29udmV5IHRoZSBzYW1lIG1lYW5pbmcuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXJlc29sdmVycyA8bW9kdWxlPmBcXG5cXG4gICAgPHN1Yj50aGUgYC1yYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgU2ltaWxhcmx5IHRvIHRoZSBbYHJlc29sdmVyc2BdKCMtb3B0aW9ucy1yZXNvbHZlcnMtKSBvcHRpb24gdGhhdCB5b3UgY2FuIHBhc3MgdG8gW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSksIHRoZXNlIHJlc29sdmVycyBjYW4gY2hhbmdlIHRoZSB3YXkgaW4gd2hpY2ggZmlsZSBwYXRocyBhcmUgcmVzb2x2ZWQuXFxuXFxuICAgIFNpZ25hdHVyZSAgICAgICAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgZ2V0Q2xpZW50Q29udHJvbGxlcihhY3Rpb24pYCB8IFJldHVybiBwYXRoIHRvIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlXFxuICAgIGBnZXRWaWV3KGFjdGlvbilgICAgICAgICAgICAgIHwgUmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGVcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tc3RhbmRhbG9uZWBcXG5cXG4gICAgPHN1Yj50aGUgYC1zYCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgVW5kZXIgdGhpcyBleHBlcmltZW50YWwgZmxhZywgdGhlIENMSSB3aWxsIHVzZSBCcm93c2VyaWZ5IHRvIGNvbXBpbGUgYSBzdGFuZGFsb25lIG1vZHVsZSB0aGF0IGluY2x1ZGVzIHRoZSB3aXJpbmcgbm9ybWFsbHkgZXhwb3J0ZWQgYnkgdGhlIENMSSBwbHVzIGFsbCBvZiBUYXVudXMgW2FzIGEgVU1EIG1vZHVsZV1bMTBdLlxcblxcbiAgICBUaGlzIHdvdWxkIGFsbG93IHlvdSB0byB1c2UgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSBldmVuIGlmIHlvdSBkb24ndCB3YW50IHRvIHVzZSBbQnJvd3NlcmlmeV1bMTFdIGRpcmVjdGx5LlxcblxcbiAgICBGZWVkYmFjayBhbmQgc3VnZ2VzdGlvbnMgYWJvdXQgdGhpcyBmbGFnLCBfYW5kIHBvc3NpYmxlIGFsdGVybmF0aXZlcyB0aGF0IHdvdWxkIG1ha2UgVGF1bnVzIGVhc2llciB0byB1c2VfLCBhcmUgd2VsY29tZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBDbGllbnQtc2lkZSBBUElcXG5cXG4gICAgSnVzdCBsaWtlIHRoZSBzZXJ2ZXItc2lkZSwgZXZlcnl0aGluZyBpbiB0aGUgY2xpZW50LXNpZGUgYmVnaW5zIGF0IHRoZSBtb3VudHBvaW50LiBPbmNlIHRoZSBhcHBsaWNhdGlvbiBpcyBtb3VudGVkLCBhbmNob3IgbGlua3Mgd2lsbCBiZSBoaWphY2tlZCBhbmQgdGhlIGNsaWVudC1zaWRlIHJvdXRlciB3aWxsIHRha2Ugb3ZlciB2aWV3IHJlbmRlcmluZy4gQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4ZWN1dGVkIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucz8pYFxcblxcbiAgICBUaGUgbW91bnRwb2ludCB0YWtlcyBhIHJvb3QgY29udGFpbmVyLCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGFuIG9wdGlvbnMgcGFyYW1ldGVyLiBUaGUgYGNvbnRhaW5lcmAgaXMgd2hlcmUgY2xpZW50LXNpZGUtcmVuZGVyZWQgdmlld3Mgd2lsbCBiZSBwbGFjZWQsIGJ5IHJlcGxhY2luZyB3aGF0ZXZlciBIVE1MIGNvbnRlbnRzIGFscmVhZHkgZXhpc3QuIFlvdSBjYW4gcGFzcyBpbiB0aGUgYHdpcmluZ2AgbW9kdWxlIGV4YWN0bHkgYXMgYnVpbHQgYnkgdGhlIENMSSwgYW5kIG5vIGZ1cnRoZXIgY29uZmlndXJhdGlvbiBpcyBuZWNlc3NhcnkuXFxuXFxuICAgIFdoZW4gdGhlIG1vdW50cG9pbnQgZXhlY3V0ZXMsIFRhdW51cyB3aWxsIGNvbmZpZ3VyZSBpdHMgaW50ZXJuYWwgc3RhdGUsIF9zZXQgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcl8sIHJ1biB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBmb3IgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcsIGFuZCBzdGFydCBoaWphY2tpbmcgbGlua3MuXFxuXFxuICAgIEFzIGFuIGV4YW1wbGUsIGNvbnNpZGVyIGEgYnJvd3NlciBtYWtlcyBhIGBHRVRgIHJlcXVlc3QgZm9yIGAvYXJ0aWNsZXMvdGhlLWZveGAgZm9yIHRoZSBmaXJzdCB0aW1lLiBPbmNlIGB0YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcpYCBpcyBpbnZva2VkIG9uIHRoZSBjbGllbnQtc2lkZSwgc2V2ZXJhbCB0aGluZ3Mgd291bGQgaGFwcGVuIGluIHRoZSBvcmRlciBsaXN0ZWQgYmVsb3cuXFxuXFxuICAgIC0gVGF1bnVzIHNldHMgdXAgdGhlIGNsaWVudC1zaWRlIHZpZXcgcm91dGluZyBlbmdpbmVcXG4gICAgLSBJZiBlbmFibGVkIF8odmlhIGBvcHRpb25zYClfLCB0aGUgY2FjaGluZyBlbmdpbmUgaXMgY29uZmlndXJlZFxcbiAgICAtIFRhdW51cyBvYnRhaW5zIHRoZSB2aWV3IG1vZGVsIF8obW9yZSBvbiB0aGlzIGxhdGVyKV9cXG4gICAgLSBXaGVuIGEgdmlldyBtb2RlbCBpcyBvYnRhaW5lZCwgdGhlIGAnc3RhcnQnYCBldmVudCBpcyBlbWl0dGVkXFxuICAgIC0gQW5jaG9yIGxpbmtzIHN0YXJ0IGJlaW5nIG1vbml0b3JlZCBmb3IgY2xpY2tzIF8oYXQgdGhpcyBwb2ludCB5b3VyIGFwcGxpY2F0aW9uIGJlY29tZXMgYSBbU1BBXVsxM10pX1xcbiAgICAtIFRoZSBgYXJ0aWNsZXMvYXJ0aWNsZWAgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBleGVjdXRlZFxcblxcbiAgICBUaGF0J3MgcXVpdGUgYSBiaXQgb2YgZnVuY3Rpb25hbGl0eSwgYnV0IGlmIHlvdSB0aGluayBhYm91dCBpdCwgbW9zdCBvdGhlciBmcmFtZXdvcmtzIGFsc28gcmVuZGVyIHRoZSB2aWV3IGF0IHRoaXMgcG9pbnQsIF9yYXRoZXIgdGhhbiBvbiB0aGUgc2VydmVyLXNpZGUhX1xcblxcbiAgICBJbiBvcmRlciB0byBiZXR0ZXIgdW5kZXJzdGFuZCB0aGUgcHJvY2VzcywgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBgb3B0aW9uc2AgcGFyYW1ldGVyLlxcblxcbiAgICBGaXJzdCBvZmYsIHRoZSBgYm9vdHN0cmFwYCBvcHRpb24gZGV0ZXJtaW5lcyB0aGUgc3RyYXRlZ3kgdXNlZCB0byBwdWxsIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3IGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGVyZSBhcmUgdGhyZWUgcG9zc2libGUgc3RyYXRlZ2llcyBhdmFpbGFibGU6IGBhdXRvYCBfKHRoZSBkZWZhdWx0IHN0cmF0ZWd5KV8sIGBpbmxpbmVgLCBvciBgbWFudWFsYC4gVGhlIGBhdXRvYCBzdHJhdGVneSBpbnZvbHZlcyB0aGUgbGVhc3Qgd29yaywgd2hpY2ggaXMgd2h5IGl0J3MgdGhlIGRlZmF1bHQuXFxuXFxuICAgIC0gYGF1dG9gIHdpbGwgbWFrZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsXFxuICAgIC0gYGlubGluZWAgZXhwZWN0cyB5b3UgdG8gcGxhY2UgdGhlIG1vZGVsIGludG8gYSBgPHNjcmlwdCB0eXBlPSd0ZXh0L3RhdW51cyc+YCB0YWdcXG4gICAgLSBgbWFudWFsYCBleHBlY3RzIHlvdSB0byBnZXQgdGhlIHZpZXcgbW9kZWwgaG93ZXZlciB5b3Ugd2FudCB0bywgYW5kIHRoZW4gbGV0IFRhdW51cyBrbm93IHdoZW4gaXQncyByZWFkeVxcblxcbiAgICBMZXQncyBnbyBpbnRvIGRldGFpbCBhYm91dCBlYWNoIG9mIHRoZXNlIHN0cmF0ZWdpZXMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGBhdXRvYCBzdHJhdGVneVxcblxcbiAgICBUaGUgYGF1dG9gIHN0cmF0ZWd5IG1lYW5zIHRoYXQgVGF1bnVzIHdpbGwgbWFrZSB1c2Ugb2YgYW4gQUpBWCByZXF1ZXN0IHRvIG9idGFpbiB0aGUgdmlldyBtb2RlbC4gX1lvdSBkb24ndCBoYXZlIHRvIGRvIGFueXRoaW5nIGVsc2VfIGFuZCB0aGlzIGlzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5LiBUaGlzIGlzIHRoZSAqKm1vc3QgY29udmVuaWVudCBzdHJhdGVneSwgYnV0IGFsc28gdGhlIHNsb3dlc3QqKiBvbmUuXFxuXFxuICAgIEl0J3Mgc2xvdyBiZWNhdXNlIHRoZSB2aWV3IG1vZGVsIHdvbid0IGJlIHJlcXVlc3RlZCB1bnRpbCB0aGUgYnVsayBvZiB5b3VyIEphdmFTY3JpcHQgY29kZSBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGV4ZWN1dGVkLCBhbmQgYHRhdW51cy5tb3VudGAgaXMgaW52b2tlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgYGlubGluZWAgc3RyYXRlZ3lcXG5cXG4gICAgVGhlIGBpbmxpbmVgIHN0cmF0ZWd5IGV4cGVjdHMgeW91IHRvIGFkZCBhIGBkYXRhLXRhdW51c2AgYXR0cmlidXRlIG9uIHRoZSBgY29udGFpbmVyYCBlbGVtZW50LiBUaGlzIGF0dHJpYnV0ZSBtdXN0IGJlIGVxdWFsIHRvIHRoZSBgaWRgIGF0dHJpYnV0ZSBvZiBhIGA8c2NyaXB0PmAgdGFnIGNvbnRhaW5pbmcgdGhlIHNlcmlhbGl6ZWQgdmlldyBtb2RlbC5cXG5cXG4gICAgYGBgamFkZVxcbiAgICBkaXYoZGF0YS10YXVudXM9J21vZGVsJykhPXBhcnRpYWxcXG4gICAgc2NyaXB0KHR5cGU9J3RleHQvdGF1bnVzJywgZGF0YS10YXVudXM9J21vZGVsJyk9SlNPTi5zdHJpbmdpZnkobW9kZWwpXFxuICAgIGBgYFxcblxcbiAgICBQYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gdGhlIGZhY3QgdGhhdCB0aGUgbW9kZWwgaXMgbm90IG9ubHkgbWFkZSBpbnRvIGEgSlNPTiBzdHJpbmcsIF9idXQgYWxzbyBIVE1MIGVuY29kZWQgYnkgSmFkZV8uIFdoZW4gVGF1bnVzIGV4dHJhY3RzIHRoZSBtb2RlbCBmcm9tIHRoZSBgPHNjcmlwdD5gIHRhZyBpdCdsbCB1bmVzY2FwZSBpdCwgYW5kIHRoZW4gcGFyc2UgaXQgYXMgSlNPTi5cXG5cXG4gICAgVGhpcyBzdHJhdGVneSBpcyBhbHNvIGZhaXJseSBjb252ZW5pZW50IHRvIHNldCB1cCwgYnV0IGl0IGludm9sdmVzIGEgbGl0dGxlIG1vcmUgd29yay4gSXQgbWlnaHQgYmUgd29ydGh3aGlsZSB0byB1c2UgaW4gY2FzZXMgd2hlcmUgbW9kZWxzIGFyZSBzbWFsbCwgYnV0IGl0IHdpbGwgc2xvdyBkb3duIHNlcnZlci1zaWRlIHZpZXcgcmVuZGVyaW5nLCBhcyB0aGUgbW9kZWwgaXMgaW5saW5lZCBhbG9uZ3NpZGUgdGhlIEhUTUwuXFxuXFxuICAgIFRoYXQgbWVhbnMgdGhhdCB0aGUgY29udGVudCB5b3UgYXJlIHN1cHBvc2VkIHRvIGJlIHByaW9yaXRpemluZyBpcyBnb2luZyB0byB0YWtlIGxvbmdlciB0byBnZXQgdG8geW91ciBodW1hbnMsIGJ1dCBvbmNlIHRoZXkgZ2V0IHRoZSBIVE1MLCB0aGlzIHN0cmF0ZWd5IHdpbGwgZXhlY3V0ZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBhbG1vc3QgaW1tZWRpYXRlbHkuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGBtYW51YWxgIHN0cmF0ZWd5XFxuXFxuICAgIFRoZSBgbWFudWFsYCBzdHJhdGVneSBpcyB0aGUgbW9zdCBpbnZvbHZlZCBvZiB0aGUgdGhyZWUsIGJ1dCBhbHNvIHRoZSBtb3N0IHBlcmZvcm1hbnQuIEluIHRoaXMgc3RyYXRlZ3kgeW91J3JlIHN1cHBvc2VkIHRvIGFkZCB0aGUgZm9sbG93aW5nIF8oc2VlbWluZ2x5IHBvaW50bGVzcylfIHNuaXBwZXQgb2YgY29kZSBpbiBhIGA8c2NyaXB0PmAgb3RoZXIgdGhhbiB0aGUgb25lIHRoYXQncyBwdWxsaW5nIGRvd24gVGF1bnVzLCBzbyB0aGF0IHRoZXkgYXJlIHB1bGxlZCBjb25jdXJyZW50bHkgcmF0aGVyIHRoYW4gc2VyaWFsbHkuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPbmNlIHlvdSBzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsLCB5b3Ugc2hvdWxkIGludm9rZSBgdGF1bnVzUmVhZHkobW9kZWwpYC4gQ29uc2lkZXJpbmcgeW91J2xsIGJlIHB1bGxpbmcgYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGF0IHRoZSBzYW1lIHRpbWUsIGEgbnVtYmVyIG9mIGRpZmZlcmVudCBzY2VuYXJpb3MgbWF5IHBsYXkgb3V0LlxcblxcbiAgICAtIFRoZSB2aWV3IG1vZGVsIGlzIGxvYWRlZCBmaXJzdCwgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHdhaXQgZm9yIFRhdW51cyB0byB0YWtlIHRoZSBtb2RlbCBvYmplY3QgYW5kIGJvb3QgdGhlIGFwcGxpY2F0aW9uIGFzIHNvb24gYXMgYHRhdW51cy5tb3VudGAgaXMgZXhlY3V0ZWRcXG4gICAgLSBUYXVudXMgbG9hZHMgZmlyc3QgYW5kIGB0YXVudXMubW91bnRgIGlzIGNhbGxlZCBmaXJzdC4gSW4gdGhpcyBjYXNlLCBUYXVudXMgd2lsbCByZXBsYWNlIGB3aW5kb3cudGF1bnVzUmVhZHlgIHdpdGggYSBzcGVjaWFsIGBib290YCBtZXRob2QuIFdoZW4gdGhlIHZpZXcgbW9kZWwgZmluaXNoZXMgbG9hZGluZywgeW91IGNhbGwgYHRhdW51c1JlYWR5KG1vZGVsKWAgYW5kIHRoZSBhcHBsaWNhdGlvbiBmaW5pc2hlcyBib290aW5nXFxuXFxuICAgID4gSWYgdGhpcyBzb3VuZHMgYSBsaXR0bGUgbWluZC1iZW5kaW5nIGl0J3MgYmVjYXVzZSBpdCBpcy4gSXQncyBub3QgZGVzaWduZWQgdG8gYmUgcHJldHR5LCBidXQgbWVyZWx5IHRvIGJlIHBlcmZvcm1hbnQuXFxuXFxuICAgIE5vdyB0aGF0IHdlJ3ZlIGFkZHJlc3NlZCB0aGUgYXdrd2FyZCBiaXRzLCBsZXQncyBjb3ZlciB0aGUgX1xcXCJzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsXFxcIl8gYXNwZWN0LiBNeSBwcmVmZXJyZWQgbWV0aG9kIGlzIHVzaW5nIEpTT05QLCBhcyBpdCdzIGFibGUgdG8gZGVsaXZlciB0aGUgc21hbGxlc3Qgc25pcHBldCBwb3NzaWJsZSwgYW5kIGl0IGNhbiB0YWtlIGFkdmFudGFnZSBvZiBzZXJ2ZXItc2lkZSBjYWNoaW5nLiBDb25zaWRlcmluZyB5b3UnbGwgcHJvYmFibHkgd2FudCB0aGlzIHRvIGJlIGFuIGlubGluZSBzY3JpcHQsIGtlZXBpbmcgaXQgc21hbGwgaXMgaW1wb3J0YW50LlxcblxcbiAgICBUaGUgZ29vZCBuZXdzIGlzIHRoYXQgdGhlIHNlcnZlci1zaWRlIHN1cHBvcnRzIEpTT05QIG91dCB0aGUgYm94LiBIZXJlJ3MgYSBzbmlwcGV0IG9mIGNvZGUgeW91IGNvdWxkIHVzZSB0byBwdWxsIGRvd24gdGhlIHZpZXcgbW9kZWwgYW5kIGJvb3QgVGF1bnVzIHVwIGFzIHNvb24gYXMgYm90aCBvcGVyYXRpb25zIGFyZSByZWFkeS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBmdW5jdGlvbiBpbmplY3QgKHVybCkge1xcbiAgICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcXG4gICAgICBzY3JpcHQuc3JjID0gdXJsO1xcbiAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcXG4gICAgfVxcblxcbiAgICBmdW5jdGlvbiBpbmplY3RvciAoKSB7XFxuICAgICAgdmFyIHNlYXJjaCA9IGxvY2F0aW9uLnNlYXJjaDtcXG4gICAgICB2YXIgc2VhcmNoUXVlcnkgPSBzZWFyY2ggPyAnJicgKyBzZWFyY2guc3Vic3RyKDEpIDogJyc7XFxuICAgICAgdmFyIHNlYXJjaEpzb24gPSAnP2pzb24mY2FsbGJhY2s9dGF1bnVzUmVhZHknICsgc2VhcmNoUXVlcnk7XFxuICAgICAgaW5qZWN0KGxvY2F0aW9uLnBhdGhuYW1lICsgc2VhcmNoSnNvbik7XFxuICAgIH1cXG5cXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuXFxuICAgIGluamVjdG9yKCk7XFxuICAgIGBgYFxcblxcbiAgICBBcyBtZW50aW9uZWQgZWFybGllciwgdGhpcyBhcHByb2FjaCBpbnZvbHZlcyBnZXR0aW5nIHlvdXIgaGFuZHMgZGlydGllciBidXQgaXQgcGF5cyBvZmYgYnkgYmVpbmcgdGhlIGZhc3Rlc3Qgb2YgdGhlIHRocmVlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENhY2hpbmdcXG5cXG4gICAgVGhlIGNsaWVudC1zaWRlIGluIFRhdW51cyBzdXBwb3J0cyBjYWNoaW5nIGluLW1lbW9yeSBhbmQgdXNpbmcgdGhlIGVtYmVkZGVkIEluZGV4ZWREQiBzeXN0ZW0gYnkgbWVyZWx5IHR1cm5pbmcgb24gdGhlIGBjYWNoZWAgZmxhZyBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgb24gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJZiB5b3Ugc2V0IGBjYWNoZWAgdG8gYHRydWVgIHRoZW4gY2FjaGVkIGl0ZW1zIHdpbGwgYmUgY29uc2lkZXJlZCBfXFxcImZyZXNoXFxcIiAodmFsaWQgY29waWVzIG9mIHRoZSBvcmlnaW5hbClfIGZvciAqKjE1IHNlY29uZHMqKi4gWW91IGNhbiBhbHNvIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyLCBhbmQgdGhhdCBudW1iZXIgb2Ygc2Vjb25kcyB3aWxsIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgaW5zdGVhZC5cXG5cXG4gICAgQ2FjaGluZyBjYW4gYWxzbyBiZSB0d2Vha2VkIG9uIGluZGl2aWR1YWwgcm91dGVzLiBGb3IgaW5zdGFuY2UsIHlvdSBjb3VsZCBzZXQgYHsgY2FjaGU6IHRydWUgfWAgd2hlbiBtb3VudGluZyBUYXVudXMgYW5kIHRoZW4gaGF2ZSBgeyBjYWNoZTogMzYwMCB9YCBvbiBhIHJvdXRlIHRoYXQgeW91IHdhbnQgdG8gY2FjaGUgZm9yIGEgbG9uZ2VyIHBlcmlvZCBvZiB0aW1lLlxcblxcbiAgICBUaGUgY2FjaGluZyBsYXllciBpcyBfc2VhbWxlc3NseSBpbnRlZ3JhdGVkXyBpbnRvIFRhdW51cywgbWVhbmluZyB0aGF0IGFueSB2aWV3cyByZW5kZXJlZCBieSBUYXVudXMgd2lsbCBiZSBjYWNoZWQgYWNjb3JkaW5nIHRvIHRoZXNlIGNhY2hpbmcgcnVsZXMuIEtlZXAgaW4gbWluZCwgaG93ZXZlciwgdGhhdCBwZXJzaXN0ZW5jZSBhdCB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBsYXllciB3aWxsIG9ubHkgYmUgcG9zc2libGUgaW4gW2Jyb3dzZXJzIHRoYXQgc3VwcG9ydCBJbmRleGVkREJdWzE0XS4gSW4gdGhlIGNhc2Ugb2YgYnJvd3NlcnMgdGhhdCBkb24ndCBzdXBwb3J0IEluZGV4ZWREQiwgVGF1bnVzIHdpbGwgdXNlIGFuIGluLW1lbW9yeSBjYWNoZSwgd2hpY2ggd2lsbCBiZSB3aXBlZCBvdXQgd2hlbmV2ZXIgdGhlIGh1bWFuIGRlY2lkZXMgdG8gY2xvc2UgdGhlIHRhYiBpbiB0aGVpciBicm93c2VyLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFByZWZldGNoaW5nXFxuXFxuICAgIElmIGNhY2hpbmcgaXMgZW5hYmxlZCwgdGhlIG5leHQgbG9naWNhbCBzdGVwIGlzIHByZWZldGNoaW5nLiBUaGlzIGlzIGVuYWJsZWQganVzdCBieSBhZGRpbmcgYHByZWZldGNoOiB0cnVlYCB0byB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAuIFRoZSBwcmVmZXRjaGluZyBmZWF0dXJlIHdpbGwgZmlyZSBmb3IgYW55IGFuY2hvciBsaW5rIHRoYXQncyB0cmlwcyBvdmVyIGEgYG1vdXNlb3ZlcmAgb3IgYSBgdG91Y2hzdGFydGAgZXZlbnQuIElmIGEgcm91dGUgbWF0Y2hlcyB0aGUgVVJMIGluIHRoZSBgaHJlZmAsIGFuIEFKQVggcmVxdWVzdCB3aWxsIHByZWZldGNoIHRoZSB2aWV3IGFuZCBjYWNoZSBpdHMgY29udGVudHMsIGltcHJvdmluZyBwZXJjZWl2ZWQgcGVyZm9ybWFuY2UuXFxuXFxuICAgIFdoZW4gbGlua3MgYXJlIGNsaWNrZWQgYmVmb3JlIHByZWZldGNoaW5nIGZpbmlzaGVzLCB0aGV5J2xsIHdhaXQgb24gdGhlIHByZWZldGNoZXIgdG8gZmluaXNoIGJlZm9yZSBpbW1lZGlhdGVseSBzd2l0Y2hpbmcgdG8gdGhlIHZpZXcsIGVmZmVjdGl2ZWx5IGN1dHRpbmcgZG93biB0aGUgcmVzcG9uc2UgdGltZS4gSWYgdGhlIGxpbmsgd2FzIGFscmVhZHkgcHJlZmV0Y2hlZCBvciBvdGhlcndpc2UgY2FjaGVkLCB0aGUgdmlldyB3aWxsIGJlIGxvYWRlZCBpbW1lZGlhdGVseS4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGEgbGluayBhbmQgYW5vdGhlciBvbmUgd2FzIGFscmVhZHkgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGF0IG9uZSBpcyBhYm9ydGVkLiBUaGlzIHByZXZlbnRzIHByZWZldGNoaW5nIGZyb20gZHJhaW5pbmcgdGhlIGJhbmR3aWR0aCBvbiBjbGllbnRzIHdpdGggbGltaXRlZCBvciBpbnRlcm1pdHRlbnQgY29ubmVjdGl2aXR5LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm9uKHR5cGUsIGZuKWBcXG5cXG4gICAgVGF1bnVzIGVtaXRzIGEgc2VyaWVzIG9mIGV2ZW50cyBkdXJpbmcgaXRzIGxpZmVjeWNsZSwgYW5kIGB0YXVudXMub25gIGlzIHRoZSB3YXkgeW91IGNhbiB0dW5lIGluIGFuZCBsaXN0ZW4gZm9yIHRoZXNlIGV2ZW50cyB1c2luZyBhIHN1YnNjcmlwdGlvbiBmdW5jdGlvbiBgZm5gLlxcblxcbiAgICBFdmVudCAgICAgICAgICAgIHwgQXJndW1lbnRzICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgJ3N0YXJ0J2AgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2ZldGNoLnN0YXJ0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy5cXG4gICAgYCdmZXRjaC5kb25lJ2AgICB8ICBgcm91dGUsIGNvbnRleHQsIGRhdGFgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS5cXG4gICAgYCdmZXRjaC5hYm9ydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC5cXG4gICAgYCdmZXRjaC5lcnJvcidgICB8ICBgcm91dGUsIGNvbnRleHQsIGVycmAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub25jZSh0eXBlLCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGlzIGVxdWl2YWxlbnQgdG8gW2B0YXVudXMub25gXSgjLXRhdW51cy1vbi10eXBlLWZuLSksIGV4Y2VwdCB0aGUgZXZlbnQgbGlzdGVuZXJzIHdpbGwgYmUgdXNlZCBvbmNlIGFuZCB0aGVuIGl0J2xsIGJlIGRpc2NhcmRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5vZmYodHlwZSwgZm4pYFxcblxcbiAgICBVc2luZyB0aGlzIG1ldGhvZCB5b3UgY2FuIHJlbW92ZSBhbnkgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBwcmV2aW91c2x5IGFkZGVkIHVzaW5nIGAub25gIG9yIGAub25jZWAuIFlvdSBtdXN0IHByb3ZpZGUgdGhlIHR5cGUgb2YgZXZlbnQgeW91IHdhbnQgdG8gcmVtb3ZlIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgZXZlbnQgbGlzdGVuZXIgZnVuY3Rpb24gdGhhdCB3YXMgb3JpZ2luYWxseSB1c2VkIHdoZW4gY2FsbGluZyBgLm9uYCBvciBgLm9uY2VgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLmludGVyY2VwdChhY3Rpb24/LCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGNhbiBiZSB1c2VkIHRvIGFudGljaXBhdGUgbW9kZWwgcmVxdWVzdHMsIGJlZm9yZSB0aGV5IGV2ZXIgbWFrZSBpdCBpbnRvIFhIUiByZXF1ZXN0cy4gWW91IGNhbiBhZGQgaW50ZXJjZXB0b3JzIGZvciBzcGVjaWZpYyBhY3Rpb25zLCB3aGljaCB3b3VsZCBiZSB0cmlnZ2VyZWQgb25seSBpZiB0aGUgcmVxdWVzdCBtYXRjaGVzIHRoZSBzcGVjaWZpZWQgYGFjdGlvbmAuIFlvdSBjYW4gYWxzbyBhZGQgZ2xvYmFsIGludGVyY2VwdG9ycyBieSBvbWl0dGluZyB0aGUgYGFjdGlvbmAgcGFyYW1ldGVyLCBvciBzZXR0aW5nIGl0IHRvIGAqYC5cXG5cXG4gICAgQW4gaW50ZXJjZXB0b3IgZnVuY3Rpb24gd2lsbCByZWNlaXZlIGFuIGBldmVudGAgcGFyYW1ldGVyLCBjb250YWluaW5nIGEgZmV3IGRpZmZlcmVudCBwcm9wZXJ0aWVzLlxcblxcbiAgICAtIGB1cmxgIGNvbnRhaW5zIHRoZSBVUkwgdGhhdCBuZWVkcyBhIHZpZXcgbW9kZWxcXG4gICAgLSBgcm91dGVgIGNvbnRhaW5zIHRoZSBmdWxsIHJvdXRlIG9iamVjdCBhcyB5b3UnZCBnZXQgZnJvbSBbYHRhdW51cy5yb3V0ZSh1cmwpYF0oIy10YXVudXMtcm91dGUtdXJsLSlcXG4gICAgLSBgcGFydHNgIGlzIGp1c3QgYSBzaG9ydGN1dCBmb3IgYHJvdXRlLnBhcnRzYFxcbiAgICAtIGBwcmV2ZW50RGVmYXVsdChtb2RlbClgIGFsbG93cyB5b3UgdG8gc3VwcHJlc3MgdGhlIG5lZWQgZm9yIGFuIEFKQVggcmVxdWVzdCwgY29tbWFuZGluZyBUYXVudXMgdG8gdXNlIHRoZSBtb2RlbCB5b3UndmUgcHJvdmlkZWQgaW5zdGVhZFxcbiAgICAtIGBkZWZhdWx0UHJldmVudGVkYCB0ZWxscyB5b3UgaWYgc29tZSBvdGhlciBoYW5kbGVyIGhhcyBwcmV2ZW50ZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3JcXG4gICAgLSBgY2FuUHJldmVudERlZmF1bHRgIHRlbGxzIHlvdSBpZiBpbnZva2luZyBgZXZlbnQucHJldmVudERlZmF1bHRgIHdpbGwgaGF2ZSBhbnkgZWZmZWN0XFxuICAgIC0gYG1vZGVsYCBzdGFydHMgYXMgYG51bGxgLCBhbmQgaXQgY2FuIGxhdGVyIGJlY29tZSB0aGUgbW9kZWwgcGFzc2VkIHRvIGBwcmV2ZW50RGVmYXVsdGBcXG5cXG4gICAgSW50ZXJjZXB0b3JzIGFyZSBhc3luY2hyb25vdXMsIGJ1dCBpZiBhbiBpbnRlcmNlcHRvciBzcGVuZHMgbG9uZ2VyIHRoYW4gMjAwbXMgaXQnbGwgYmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBjYWxsaW5nIGBldmVudC5wcmV2ZW50RGVmYXVsdGAgcGFzdCB0aGF0IHBvaW50IHdvbid0IGhhdmUgYW55IGVmZmVjdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5wYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbClgXFxuXFxuICAgIFRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSBgYWN0aW9uYCB2aWV3IGludG8gdGhlIGBjb250YWluZXJgIERPTSBlbGVtZW50LCB1c2luZyB0aGUgc3BlY2lmaWVkIGBtb2RlbGAuIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSBgcmVuZGVyYCBldmVudCB3aWxsIGJlIGZpcmVkIF8od2l0aCBgY29udGFpbmVyLCBtb2RlbGAgYXMgYXJndW1lbnRzKV8gYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGF0IHZpZXcgd2lsbCBiZSBleGVjdXRlZC5cXG5cXG4gICAgV2hpbGUgYHRhdW51cy5wYXJ0aWFsYCB0YWtlcyBhIGByb3V0ZWAgYXMgdGhlIGZvdXJ0aCBwYXJhbWV0ZXIsIHlvdSBzaG91bGQgb21pdCB0aGF0IHNpbmNlIGl0J3MgdXNlZCBmb3IgaW50ZXJuYWwgcHVycG9zZXMgb25seS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYFxcblxcbiAgICBXaGVuZXZlciB5b3Ugd2FudCB0byBuYXZpZ2F0ZSB0byBhIFVSTCwgc2F5IHdoZW4gYW4gQUpBWCBjYWxsIGZpbmlzaGVzIGFmdGVyIGEgYnV0dG9uIGNsaWNrLCB5b3UgY2FuIHVzZSBgdGF1bnVzLm5hdmlnYXRlYCBwYXNzaW5nIGl0IGEgcGxhaW4gVVJMIG9yIGFueXRoaW5nIHRoYXQgd291bGQgY2F1c2UgYHRhdW51cy5yb3V0ZSh1cmwpYCB0byByZXR1cm4gYSB2YWxpZCByb3V0ZS5cXG5cXG4gICAgQnkgZGVmYXVsdCwgaWYgYHRhdW51cy5uYXZpZ2F0ZSh1cmwsIG9wdGlvbnMpYCBpcyBjYWxsZWQgd2l0aCBhbiBgdXJsYCB0aGF0IGRvZXNuJ3QgbWF0Y2ggYW55IGNsaWVudC1zaWRlIHJvdXRlLCB0aGVuIHRoZSB1c2VyIHdpbGwgYmUgcmVkaXJlY3RlZCB2aWEgYGxvY2F0aW9uLmhyZWZgLiBJbiBjYXNlcyB3aGVyZSB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBvcnQgdGhlIGhpc3RvcnkgQVBJLCBgbG9jYXRpb24uaHJlZmAgd2lsbCBiZSB1c2VkIGFzIHdlbGwuXFxuXFxuICAgIFRoZXJlJ3MgYSBmZXcgb3B0aW9ucyB5b3UgY2FuIHVzZSB0byB0d2VhayB0aGUgYmVoYXZpb3Igb2YgYHRhdW51cy5uYXZpZ2F0ZWAuXFxuXFxuICAgIE9wdGlvbiAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGBjb250ZXh0YCAgICAgICAgfCBBIERPTSBlbGVtZW50IHRoYXQgY2F1c2VkIHRoZSBuYXZpZ2F0aW9uIGV2ZW50LCB1c2VkIHdoZW4gZW1pdHRpbmcgZXZlbnRzXFxuICAgIGBzdHJpY3RgICAgICAgICAgfCBJZiBzZXQgdG8gYHRydWVgIGFuZCB0aGUgVVJMIGRvZXNuJ3QgbWF0Y2ggYW55IHJvdXRlLCB0aGVuIHRoZSBuYXZpZ2F0aW9uIGF0dGVtcHQgbXVzdCBiZSBpZ25vcmVkXFxuICAgIGBzY3JvbGxgICAgICAgICAgfCBXaGVuIHRoaXMgaXMgc2V0IHRvIGBmYWxzZWAsIGVsZW1lbnRzIGFyZW4ndCBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXIgbmF2aWdhdGlvblxcbiAgICBgZm9yY2VgICAgICAgICAgIHwgVW5sZXNzIHRoaXMgaXMgc2V0IHRvIGB0cnVlYCwgbmF2aWdhdGlvbiB3b24ndCBfZmV0Y2ggYSBtb2RlbF8gaWYgdGhlIHJvdXRlIG1hdGNoZXMgdGhlIGN1cnJlbnQgcm91dGUsIGFuZCBgc3RhdGUubW9kZWxgIHdpbGwgYmUgcmV1c2VkIGluc3RlYWRcXG4gICAgYHJlcGxhY2VTdGF0ZWAgICB8IFVzZSBgcmVwbGFjZVN0YXRlYCBpbnN0ZWFkIG9mIGBwdXNoU3RhdGVgIHdoZW4gY2hhbmdpbmcgaGlzdG9yeVxcblxcbiAgICBOb3RlIHRoYXQgdGhlIG5vdGlvbiBvZiBfZmV0Y2hpbmcgYSBtb2RlbF8gbWlnaHQgYmUgZGVjZWl2aW5nIGFzIHRoZSBtb2RlbCBjb3VsZCBiZSBwdWxsZWQgZnJvbSB0aGUgY2FjaGUgZXZlbiBpZiBgZm9yY2VgIGlzIHNldCB0byBgdHJ1ZWAuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucm91dGUodXJsKWBcXG5cXG4gICAgVGhpcyBjb252ZW5pZW5jZSBtZXRob2QgYWxsb3dzIHlvdSB0byBicmVhayBkb3duIGEgVVJMIGludG8gaXRzIGluZGl2aWR1YWwgY29tcG9uZW50cy4gVGhlIG1ldGhvZCBhY2NlcHRzIGFueSBvZiB0aGUgZm9sbG93aW5nIHBhdHRlcm5zLCBhbmQgaXQgcmV0dXJucyBhIFRhdW51cyByb3V0ZSBvYmplY3QuXFxuXFxuICAgIC0gQSBmdWxseSBxdWFsaWZpZWQgVVJMIG9uIHRoZSBzYW1lIG9yaWdpbiwgZS5nIGBodHRwOi8vdGF1bnVzLmJldmFjcXVhLmlvL2FwaWBcXG4gICAgLSBBbiBhYnNvbHV0ZSBVUkwgd2l0aG91dCBhbiBvcmlnaW4sIGUuZyBgL2FwaWBcXG4gICAgLSBKdXN0IGEgaGFzaCwgZS5nIGAjZm9vYCBfKGBsb2NhdGlvbi5ocmVmYCBpcyB1c2VkKV9cXG4gICAgLSBGYWxzeSB2YWx1ZXMsIGUuZyBgbnVsbGAgXyhgbG9jYXRpb24uaHJlZmAgaXMgdXNlZClfXFxuXFxuICAgIFJlbGF0aXZlIFVSTHMgYXJlIG5vdCBzdXBwb3J0ZWQgXyhhbnl0aGluZyB0aGF0IGRvZXNuJ3QgaGF2ZSBhIGxlYWRpbmcgc2xhc2gpXywgZS5nIGBmaWxlcy9kYXRhLmpzb25gLiBBbnl0aGluZyB0aGF0J3Mgbm90IG9uIHRoZSBzYW1lIG9yaWdpbiBvciBkb2Vzbid0IG1hdGNoIG9uZSBvZiB0aGUgcmVnaXN0ZXJlZCByb3V0ZXMgaXMgZ29pbmcgdG8geWllbGQgYG51bGxgLlxcblxcbiAgICBfVGhpcyBtZXRob2QgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIGRlYnVnZ2luZyB5b3VyIHJvdXRpbmcgdGFibGVzLCBhcyBpdCBnaXZlcyB5b3UgZGlyZWN0IGFjY2VzcyB0byB0aGUgcm91dGVyIHVzZWQgaW50ZXJuYWxseSBieSBUYXVudXMuX1xcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIGB0YXVudXMucm91dGUuZXF1YWxzKHJvdXRlLCByb3V0ZSlgXFxuXFxuICAgIENvbXBhcmVzIHR3byByb3V0ZXMgYW5kIHJldHVybnMgYHRydWVgIGlmIHRoZXkgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwuIE5vdGUgdGhhdCBkaWZmZXJlbnQgVVJMcyBtYXkgc3RpbGwgcmV0dXJuIGB0cnVlYC4gRm9yIGluc3RhbmNlLCBgL2Zvb2AgYW5kIGAvZm9vI2JhcmAgd291bGQgZmV0Y2ggdGhlIHNhbWUgbW9kZWwgZXZlbiBpZiB0aGV5J3JlIGRpZmZlcmVudCBVUkxzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnN0YXRlYFxcblxcbiAgICBUaGlzIGlzIGFuIGludGVybmFsIHN0YXRlIHZhcmlhYmxlLCBhbmQgaXQgY29udGFpbnMgYSBsb3Qgb2YgdXNlZnVsIGRlYnVnZ2luZyBpbmZvcm1hdGlvbi5cXG5cXG4gICAgLSBgY29udGFpbmVyYCBpcyB0aGUgRE9NIGVsZW1lbnQgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgXFxuICAgIC0gYGNvbnRyb2xsZXJzYCBhcmUgYWxsIHRoZSBjb250cm9sbGVycywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGB0ZW1wbGF0ZXNgIGFyZSBhbGwgdGhlIHRlbXBsYXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZXNgIGFyZSBhbGwgdGhlIHJvdXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIGByb3V0ZWAgaXMgYSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgcm91dGVcXG4gICAgLSBgbW9kZWxgIGlzIGEgcmVmZXJlbmNlIHRvIHRoZSBtb2RlbCB1c2VkIHRvIHJlbmRlciB0aGUgY3VycmVudCB2aWV3XFxuICAgIC0gYHByZWZldGNoYCBleHBvc2VzIHdoZXRoZXIgcHJlZmV0Y2hpbmcgaXMgdHVybmVkIG9uXFxuICAgIC0gYGNhY2hlYCBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkXFxuXFxuICAgIE9mIGNvdXJzZSwgeW91ciBub3Qgc3VwcG9zZWQgdG8gbWVkZGxlIHdpdGggaXQsIHNvIGJlIGEgZ29vZCBjaXRpemVuIGFuZCBqdXN0IGluc3BlY3QgaXRzIHZhbHVlcyFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBUaGUgYC50YXVudXNyY2AgbWFuaWZlc3RcXG5cXG4gICAgSWYgeW91IHdhbnQgdG8gdXNlIHZhbHVlcyBvdGhlciB0aGFuIHRoZSBjb252ZW50aW9uYWwgZGVmYXVsdHMgc2hvd24gaW4gdGhlIHRhYmxlIGJlbG93LCB0aGVuIHlvdSBzaG91bGQgY3JlYXRlIGEgYC50YXVudXNyY2AgZmlsZS4gTm90ZSB0aGF0IHRoZSBkZWZhdWx0cyBuZWVkIHRvIGJlIG92ZXJ3cml0dGVuIGluIGEgY2FzZS1ieS1jYXNlIGJhc2lzLiBUaGVzZSBvcHRpb25zIGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgaW4geW91ciBgcGFja2FnZS5qc29uYCwgdW5kZXIgdGhlIGB0YXVudXNgIHByb3BlcnR5LlxcblxcbiAgICBgYGBqc29uXFxuICAgIHtcXG4gICAgICBcXFwidmlld3NcXFwiOiBcXFwiLmJpbi92aWV3c1xcXCIsXFxuICAgICAgXFxcInNlcnZlcl9yb3V0ZXNcXFwiOiBcXFwiY29udHJvbGxlcnMvcm91dGVzLmpzXFxcIixcXG4gICAgICBcXFwic2VydmVyX2NvbnRyb2xsZXJzXFxcIjogXFxcImNvbnRyb2xsZXJzXFxcIixcXG4gICAgICBcXFwiY2xpZW50X2NvbnRyb2xsZXJzXFxcIjogXFxcImNsaWVudC9qcy9jb250cm9sbGVyc1xcXCIsXFxuICAgICAgXFxcImNsaWVudF93aXJpbmdcXFwiOiBcXFwiLmJpbi93aXJpbmcuanNcXFwiXFxuICAgIH1cXG4gICAgYGBgXFxuXFxuICAgIC0gVGhlIGB2aWV3c2AgZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgdmlld3MgXyhhbHJlYWR5IGNvbXBpbGVkIGludG8gSmF2YVNjcmlwdClfIGFyZSBwbGFjZWQuIFRoZXNlIHZpZXdzIGFyZSB1c2VkIGRpcmVjdGx5IG9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGVcXG4gICAgLSBUaGUgYHNlcnZlcl9yb3V0ZXNgIGZpbGUgaXMgdGhlIG1vZHVsZSB3aGVyZSB5b3UgZXhwb3J0IGEgY29sbGVjdGlvbiBvZiByb3V0ZXMuIFRoZSBDTEkgd2lsbCBwdWxsIHRoZXNlIHJvdXRlcyB3aGVuIGNyZWF0aW5nIHRoZSBjbGllbnQtc2lkZSByb3V0ZXMgZm9yIHRoZSB3aXJpbmcgbW9kdWxlXFxuICAgIC0gVGhlIGBzZXJ2ZXJfY29udHJvbGxlcnNgIGRpcmVjdG9yeSBpcyB0aGUgcm9vdCBkaXJlY3Rvcnkgd2hlcmUgeW91ciBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBsaXZlLiBJdCdzIHVzZWQgd2hlbiBzZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZSByb3V0ZXJcXG4gICAgLSBUaGUgYGNsaWVudF9jb250cm9sbGVyc2AgZGlyZWN0b3J5IGlzIHdoZXJlIHlvdXIgY2xpZW50LXNpZGUgY29udHJvbGxlciBtb2R1bGVzIGxpdmUuIFRoZSBDTEkgd2lsbCBgcmVxdWlyZWAgdGhlc2UgY29udHJvbGxlcnMgaW4gaXRzIHJlc3VsdGluZyB3aXJpbmcgbW9kdWxlXFxuICAgIC0gVGhlIGBjbGllbnRfd2lyaW5nYCBmaWxlIGlzIHdoZXJlIHlvdXIgd2lyaW5nIG1vZHVsZSB3aWxsIGJlIHBsYWNlZCBieSB0aGUgQ0xJLiBZb3UnbGwgdGhlbiBoYXZlIHRvIGByZXF1aXJlYCBpdCBpbiB5b3VyIGFwcGxpY2F0aW9uIHdoZW4gYm9vdGluZyB1cCBUYXVudXNcXG5cXG4gICAgSGVyZSBpcyB3aGVyZSB0aGluZ3MgZ2V0IFthIGxpdHRsZSBjb252ZW50aW9uYWxdWzEyXS4gVmlld3MsIGFuZCBib3RoIHNlcnZlci1zaWRlIGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhwZWN0ZWQgdG8gYmUgb3JnYW5pemVkIGJ5IGZvbGxvd2luZyB0aGUgYHtyb290fS97Y29udHJvbGxlcn0ve2FjdGlvbn1gIHBhdHRlcm4sIGJ1dCB5b3UgY291bGQgY2hhbmdlIHRoYXQgdXNpbmcgYHJlc29sdmVyc2Agd2hlbiBpbnZva2luZyB0aGUgQ0xJIGFuZCB1c2luZyB0aGUgc2VydmVyLXNpZGUgQVBJLlxcblxcbiAgICBWaWV3cyBhbmQgY29udHJvbGxlcnMgYXJlIGFsc28gZXhwZWN0ZWQgdG8gYmUgQ29tbW9uSlMgbW9kdWxlcyB0aGF0IGV4cG9ydCBhIHNpbmdsZSBtZXRob2QuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgIFsxXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbMl06IGh0dHA6Ly9leHByZXNzanMuY29tXFxuICAgIFszXTogaHR0cDovL2hhcGlqcy5jb21cXG4gICAgWzRdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvMzMyNzE3NTEzMTJkYjZlOTIwNTlkOTgyOTNkMGE3YWM2ZTllOGU1Yi92aWV3cy9zZXJ2ZXIvbGF5b3V0L2xheW91dC5qYWRlXFxuICAgIFs1XTogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2hnZXRcXG4gICAgWzZdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvZjZkNmI1MDY4ZmYwM2EzODdmNTAzOTAwMTYwZDlmZGMxZTc0OTc1MC9jb250cm9sbGVycy9yb3V0aW5nLmpzI0w3MC1MNzJcXG4gICAgWzddOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1leHByZXNzXFxuICAgIFs4XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcbiAgICBbOV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcbiAgICBbMTBdOiBodHRwczovL2dpdGh1Yi5jb20vdW1kanMvdW1kXFxuICAgIFsxMV06IGh0dHA6Ly9icm93c2VyaWZ5Lm9yZ1xcbiAgICBbMTJdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NvbnZlbnRpb25fb3Zlcl9jb25maWd1cmF0aW9uXFxuICAgIFsxM106IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvU2luZ2xlLXBhZ2VfYXBwbGljYXRpb25cXG4gICAgWzE0XTogaHR0cDovL2Nhbml1c2UuY29tLyNmZWF0PWluZGV4ZWRkYlxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjb21wbGVtZW50cyhsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8c2VjdGlvbiBjbGFzcz1cXFwibHktc2VjdGlvbiBtZC1tYXJrZG93blxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJjb21wbGVtZW50YXJ5LW1vZHVsZXNcXFwiPkNvbXBsZW1lbnRhcnkgTW9kdWxlczwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc21hbGwgbGlicmFyeSBieSBNVkMgZnJhbWV3b3JrIHN0YW5kYXJkcywgc2l0dGluZyBhdCA8c3Ryb25nPmFyb3VuZCAxMmtCIG1pbmlmaWVkIGFuZCBnemlwcGVkPC9zdHJvbmc+LiBJdCBpcyBkZXNpZ25lZCB0byBiZSBzbWFsbC4gSXQgaXMgYWxzbyBkZXNpZ25lZCB0byBkbyBvbmUgdGhpbmcgd2VsbCwgYW5kIHRoYXQmIzM5O3MgPGVtPmJlaW5nIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lPC9lbT4uPC9wPlxcbjxwPlRhdW51cyBjYW4gYmUgdXNlZCBmb3Igcm91dGluZywgcHV0dGluZyB0b2dldGhlciBjb250cm9sbGVycywgbW9kZWxzIGFuZCB2aWV3cyB0byBoYW5kbGUgaHVtYW4gaW50ZXJhY3Rpb24uIElmIHlvdSA8YSBocmVmPVxcXCIvYXBpXFxcIj5oZWFkIG92ZXIgdG8gdGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiwgeW91JiMzOTtsbCBub3RpY2UgdGhhdCB0aGUgc2VydmVyLXNpZGUgQVBJLCB0aGUgY29tbWFuZC1saW5lIGludGVyZmFjZSwgYW5kIHRoZSA8Y29kZT4udGF1bnVzcmM8L2NvZGU+IG1hbmlmZXN0IGFyZSBvbmx5IGNvbmNlcm5lZCB3aXRoIHByb3ZpZGluZyBhIGNvbnZlbnRpb25hbCBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUuPC9wPlxcbjxwPkluIHRoZSBzZXJ2ZXItc2lkZSB5b3UgbWlnaHQgbmVlZCB0byBkbyBvdGhlciB0aGluZ3MgYmVzaWRlcyByb3V0aW5nIGFuZCByZW5kZXJpbmcgdmlld3MsIGFuZCBvdGhlciBtb2R1bGVzIGNhbiB0YWtlIGNhcmUgb2YgdGhhdC4gSG93ZXZlciwgeW91JiMzOTtyZSB1c2VkIHRvIGhhdmluZyBkYXRhYmFzZSBhY2Nlc3MsIHNlYXJjaCwgbG9nZ2luZywgYW5kIGEgdmFyaWV0eSBvZiBzZXJ2aWNlcyBoYW5kbGVkIGJ5IHNlcGFyYXRlIGxpYnJhcmllcywgaW5zdGVhZCBvZiBhIHNpbmdsZSBiZWhlbW90aCB0aGF0IHRyaWVzIHRvIGRvIGV2ZXJ5dGhpbmcuPC9wPlxcbjxibG9ja3F1b3RlPlxcbjxwPkluIHRoZSBjbGllbnQtc2lkZSwgeW91IG1pZ2h0IGJlIHVzZWQgdG8geW91ciBNVkMgZnJhbWV3b3JrIG9mIGNob2ljZSByZXNvbHZpbmcgZXZlcnl0aGluZyBvbiB5b3VyIGJlaGFsZiwgZnJvbSBET00gbWFuaXB1bGF0aW9uIGFuZCBkYXRhLWJpbmRpbmcgdG8gaG9va2luZyB1cCB3aXRoIGEgUkVTVCBBUEksIGFuZCBldmVyeXdoZXJlIGluIGJldHdlZW4uPC9wPlxcbjwvYmxvY2txdW90ZT5cXG48cD5UYXVudXMgYXR0ZW1wdHMgdG8gYnJpbmcgdGhlIHNlcnZlci1zaWRlIG1lbnRhbGl0eSBvZiA8ZW0+JnF1b3Q7bm90IGRvaW5nIGV2ZXJ5dGhpbmcgaXMgb2theSZxdW90OzwvZW0+IGludG8gdGhlIHdvcmxkIG9mIGNsaWVudC1zaWRlIHdlYiBhcHBsaWNhdGlvbiBkZXZlbG9wbWVudCBhcyB3ZWxsLiBUbyB0aGF0IGVuZCwgVGF1bnVzIHJlY29tbWVuZHMgdGhhdCB5b3UgZ2l2ZSBhIHNob3QgdG8gbGlicmFyaWVzIHRoYXQgYWxzbyBkbyA8c3Ryb25nPm9uZSB0aGluZyB3ZWxsPC9zdHJvbmc+LjwvcD5cXG48cD5JbiB0aGlzIGJyaWVmIGFydGljbGUgd2UmIzM5O2xsIHJlY29tbWVuZCB0aHJlZSBkaWZmZXJlbnQgbGlicmFyaWVzIHRoYXQgcGxheSB3ZWxsIHdpdGggVGF1bnVzLCBhbmQgeW91JiMzOTtsbCBhbHNvIGxlYXJuIGhvdyB0byBzZWFyY2ggZm9yIG1vZHVsZXMgdGhhdCBjYW4gZ2l2ZSB5b3UgYWNjZXNzIHRvIG90aGVyIGZ1bmN0aW9uYWxpdHkgeW91IG1heSBiZSBpbnRlcmVzdGVkIGluLjwvcD5cXG48cD48Y29kZT5kb21pbnVzPC9jb2RlPlxcbjxjb2RlPnhocjwvY29kZT5cXG48Y29kZT5tZWFzbHk8L2NvZGU+PC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcInNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgQ29tcGxlbWVudGFyeSBNb2R1bGVzXFxuXFxuICAgIFRhdW51cyBpcyBhIHNtYWxsIGxpYnJhcnkgYnkgTVZDIGZyYW1ld29yayBzdGFuZGFyZHMsIHNpdHRpbmcgYXQgKiphcm91bmQgMTJrQiBtaW5pZmllZCBhbmQgZ3ppcHBlZCoqLiBJdCBpcyBkZXNpZ25lZCB0byBiZSBzbWFsbC4gSXQgaXMgYWxzbyBkZXNpZ25lZCB0byBkbyBvbmUgdGhpbmcgd2VsbCwgYW5kIHRoYXQncyBfYmVpbmcgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmVfLlxcblxcbiAgICBUYXVudXMgY2FuIGJlIHVzZWQgZm9yIHJvdXRpbmcsIHB1dHRpbmcgdG9nZXRoZXIgY29udHJvbGxlcnMsIG1vZGVscyBhbmQgdmlld3MgdG8gaGFuZGxlIGh1bWFuIGludGVyYWN0aW9uLiBJZiB5b3UgW2hlYWQgb3ZlciB0byB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzFdLCB5b3UnbGwgbm90aWNlIHRoYXQgdGhlIHNlcnZlci1zaWRlIEFQSSwgdGhlIGNvbW1hbmQtbGluZSBpbnRlcmZhY2UsIGFuZCB0aGUgYC50YXVudXNyY2AgbWFuaWZlc3QgYXJlIG9ubHkgY29uY2VybmVkIHdpdGggcHJvdmlkaW5nIGEgY29udmVudGlvbmFsIHNoYXJlZC1yZW5kZXJpbmcgTVZDIGVuZ2luZS5cXG5cXG4gICAgSW4gdGhlIHNlcnZlci1zaWRlIHlvdSBtaWdodCBuZWVkIHRvIGRvIG90aGVyIHRoaW5ncyBiZXNpZGVzIHJvdXRpbmcgYW5kIHJlbmRlcmluZyB2aWV3cywgYW5kIG90aGVyIG1vZHVsZXMgY2FuIHRha2UgY2FyZSBvZiB0aGF0LiBIb3dldmVyLCB5b3UncmUgdXNlZCB0byBoYXZpbmcgZGF0YWJhc2UgYWNjZXNzLCBzZWFyY2gsIGxvZ2dpbmcsIGFuZCBhIHZhcmlldHkgb2Ygc2VydmljZXMgaGFuZGxlZCBieSBzZXBhcmF0ZSBsaWJyYXJpZXMsIGluc3RlYWQgb2YgYSBzaW5nbGUgYmVoZW1vdGggdGhhdCB0cmllcyB0byBkbyBldmVyeXRoaW5nLlxcblxcbiAgICA+IEluIHRoZSBjbGllbnQtc2lkZSwgeW91IG1pZ2h0IGJlIHVzZWQgdG8geW91ciBNVkMgZnJhbWV3b3JrIG9mIGNob2ljZSByZXNvbHZpbmcgZXZlcnl0aGluZyBvbiB5b3VyIGJlaGFsZiwgZnJvbSBET00gbWFuaXB1bGF0aW9uIGFuZCBkYXRhLWJpbmRpbmcgdG8gaG9va2luZyB1cCB3aXRoIGEgUkVTVCBBUEksIGFuZCBldmVyeXdoZXJlIGluIGJldHdlZW4uXFxuXFxuICAgIFRhdW51cyBhdHRlbXB0cyB0byBicmluZyB0aGUgc2VydmVyLXNpZGUgbWVudGFsaXR5IG9mIF9cXFwibm90IGRvaW5nIGV2ZXJ5dGhpbmcgaXMgb2theVxcXCJfIGludG8gdGhlIHdvcmxkIG9mIGNsaWVudC1zaWRlIHdlYiBhcHBsaWNhdGlvbiBkZXZlbG9wbWVudCBhcyB3ZWxsLiBUbyB0aGF0IGVuZCwgVGF1bnVzIHJlY29tbWVuZHMgdGhhdCB5b3UgZ2l2ZSBhIHNob3QgdG8gbGlicmFyaWVzIHRoYXQgYWxzbyBkbyAqKm9uZSB0aGluZyB3ZWxsKiouXFxuXFxuICAgIEluIHRoaXMgYnJpZWYgYXJ0aWNsZSB3ZSdsbCByZWNvbW1lbmQgdGhyZWUgZGlmZmVyZW50IGxpYnJhcmllcyB0aGF0IHBsYXkgd2VsbCB3aXRoIFRhdW51cywgYW5kIHlvdSdsbCBhbHNvIGxlYXJuIGhvdyB0byBzZWFyY2ggZm9yIG1vZHVsZXMgdGhhdCBjYW4gZ2l2ZSB5b3UgYWNjZXNzIHRvIG90aGVyIGZ1bmN0aW9uYWxpdHkgeW91IG1heSBiZSBpbnRlcmVzdGVkIGluLlxcblxcbiAgICBgZG9taW51c2BcXG4gICAgYHhocmBcXG4gICAgYG1lYXNseWBcXG5cXG4gICAgWzFdOiAvYXBpXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldHRpbmdTdGFydGVkKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJnZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQmIzM5O3MgPGVtPnVwIHRvIHlvdSBob3cgdG8gdXNlIGl0PC9lbT4uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gPHN0cm9uZz5zZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0PC9zdHJvbmc+LCBhcyB0aGF0JiMzOTtsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2hvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlXFxcIj5TZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZTwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjcmVhdGluZy1hLWxheW91dFxcXCI+Q3JlYXRpbmcgYSBsYXlvdXQ8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjY29tcGlsaW5nLXlvdXItY2xpZW50LXNpZGUtamF2YXNjcmlwdFxcXCI+Q29tcGlsaW5nIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdDwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvYT48L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJob3ctaXQtd29ya3NcXFwiPkhvdyBpdCB3b3JrczwvaDE+XFxuPHA+VGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0IDxzdHJvbmc+cHJvdmVuPC9zdHJvbmc+IHNldCBvZiBydWxlcy48L3A+XFxuPHVsPlxcbjxsaT5EZWZpbmUgYSA8Y29kZT5mdW5jdGlvbihtb2RlbCk8L2NvZGU+IGZvciBlYWNoIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5QdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvbjwvbGk+XFxuPGxpPlB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzPC9saT5cXG48bGk+Q3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzPC9saT5cXG48bGk+Q3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3PC9saT5cXG48bGk+Rm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZTwvbGk+XFxuPGxpPldoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhPC9saT5cXG48bGk+T25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgPHN0cm9uZz5oaWphY2sgbGluayBjbGlja3M8L3N0cm9uZz4gYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkPC9saT5cXG48bGk+V2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5JZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gPHN0cm9uZz5Eb24mIzM5O3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzITwvc3Ryb25nPjwvbGk+XFxuPC91bD5cXG48cD5JJiMzOTtsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2gxPlxcbjxwPkZpcnN0IG9mZiwgeW91JiMzOTtsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+dGF1bnVzLWV4cHJlc3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+LCB0aHJvdWdoIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPnRhdW51cy1oYXBpPC9hPiBhbmQgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+aGFwaWlmeTwvYT4gdHJhbnNmb3JtPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHlvdSYjMzk7cmUgbW9yZSBvZiBhIDxlbT4mcXVvdDtydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJiMzOTtzIGNvZGUmcXVvdDs8L2VtPiB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxcIj5nb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSYjMzk7cyBzb3VyY2UgY29kZTwvYT4sIHdoaWNoIHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb29cXFwiPnBvbnlmb28uY29tPC9hPiwgd2hpY2ggaXMgPHN0cm9uZz5hIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2U8L3N0cm9uZz4gdW5kZXIgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0JiMzOTtzIG9rYXkgdG9vLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldHRsZWQgZm9yIGVpdGhlciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJiMzOTtsbCB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+LiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwic2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9oND5cXG48cD5OYXR1cmFsbHksIHlvdSYjMzk7bGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSA8Y29kZT5ucG08L2NvZGU+IHRvIGdldCBzdGFydGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciBnZXR0aW5nLXN0YXJ0ZWRcXG5jZCBnZXR0aW5nLXN0YXJ0ZWRcXG5ucG0gaW5pdFxcbm5wbSBpbnN0YWxsIC0tc2F2ZSB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzc1xcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbnBtIGluaXRgIG91dHB1dFxcXCI+PC9wPlxcbjxwPkxldCYjMzk7cyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSYjMzk7bGwgbmVlZCB0aGUgZmFtb3VzIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggYXBwLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUsIGxldCYjMzk7cyBkbyB0aGF0IG5vdy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge307XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QWxsIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIDxjb2RlPmFwcDwvY29kZT4uIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gaW52b2NhdGlvbi4gWW91JiMzOTtsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIDxlbT4mcXVvdDtOb3QgRm91bmQmcXVvdDs8L2VtPiB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS48L3A+XFxuPHA+SWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5UaGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0IHBhc3NlZCB0byA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBsZXQmIzM5O3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQmIzM5O3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSA8ZW0+cmVxdWlyZWQgY29uZmlndXJhdGlvbjwvZW0+LiBUaGVyZSYjMzk7cyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlczwvbGk+XFxuPGxpPjxjb2RlPmxheW91dDwvY29kZT4gc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSA8Y29kZT5tb2RlbDwvY29kZT4gYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnQ8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9oND5cXG48cD5Sb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gPHN0cm9uZz53aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZzwvc3Ryb25nPi4gTGV0JiMzOTtzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHJvdXRlcy5qc1xcbjwvY29kZT48L3ByZT5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IFtcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1cXG5dO1xcbjwvY29kZT48L3ByZT5cXG48cD5FYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSA8Y29kZT4vPC9jb2RlPiByb3V0ZSB3aXRoIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm48L2E+LCB3aGljaCBtYWRlIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvUnVieV9vbl9SYWlsc1xcXCI+UnVieSBvbiBSYWlsczwvYT4gZmFtb3VzLiA8ZW0+TWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vITwvZW0+IEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24gdXNlcyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gdmlldy4gT2YgY291cnNlLCA8ZW0+YWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbjwvZW0+LjwvcD5cXG48cD5UaW1lIHRvIGdvIGJhY2sgdG8gPGNvZGU+YXBwLmpzPC9jb2RlPiBhbmQgdXBkYXRlIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIDxlbT4obW9yZSBvbiB0aGF0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPmluIHRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4sIGJ1dCBpdCBkZWZhdWx0cyB0byA8Y29kZT57fTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkhlcmUmIzM5O3Mgd2hhdCB5b3UmIzM5O2QgZ2V0IGlmIHlvdSBhdHRlbXB0ZWQgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS8wOGxuQ2VjLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXFxcIj48L3A+XFxuPHA+VHVybnMgb3V0IHlvdSYjMzk7cmUgbWlzc2luZyBhIGxvdCBvZiB0aGluZ3MhIFRhdW51cyBpcyBxdWl0ZSBsZW5pZW50IGFuZCBpdCYjMzk7bGwgdHJ5IGl0cyBiZXN0IHRvIGxldCB5b3Uga25vdyB3aGF0IHlvdSBtaWdodCBiZSBtaXNzaW5nLCB0aG91Z2guIEFwcGFyZW50bHkgeW91IGRvbiYjMzk7dCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISA8ZW0+VGhhdCYjMzk7cyByb3VnaC48L2VtPjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvaDQ+XFxuPHA+TGV0JiMzOTtzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQmIzM5O2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBsYXlvdXQuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IDxlbT4oYXMgc2VlbiBiZWxvdyk8L2VtPiBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UmIzM5O2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgPGVtPiZxdW90O3VzZSB0aGUgZm9sbG93aW5nIGNvbWJpbmF0aW9uIG9mIHBsYWluIHRleHQgYW5kIHRoZSA8c3Ryb25nPihtYXliZSBIVE1MKTwvc3Ryb25nPiBwYXJ0aWFsIHZpZXcmcXVvdDs8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHJldHVybiAmIzM5O1RoaXMgaXMgdGhlIHBhcnRpYWw6ICZxdW90OyYjMzk7ICsgbW9kZWwucGFydGlhbCArICYjMzk7JnF1b3Q7JiMzOTs7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJiMzOTt0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCYjMzk7cyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuPC9wPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXFwiPk11c3RhY2hlPC9hPiBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCYjMzk7cyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTDwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcXCI+SmFkZTwvYT4gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSYjMzk7cyBubyBjbG9zaW5nIHRhZ3M8L2xpPlxcbjxsaT5UaGVyZSYjMzk7cyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgPGEgaHJlZj1cXFwiaHR0cDovL21vemlsbGEuZ2l0aHViLmlvL251bmp1Y2tzL1xcXCI+TW96aWxsYSYjMzk7cyBOdW5qdWNrczwvYT4sIDxhIGhyZWY9XFxcImh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcXCI+SGFuZGxlYmFyczwvYT4sIGFuZCA8YSBocmVmPVxcXCJodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcXCI+RUpTPC9hPi48L2xpPlxcbjwvdWw+XFxuPHA+UmVtZW1iZXIgdG8gYWRkIHRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHVuZGVyIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5IZXJlJiMzOTtzIHdoYXQgeW91JiMzOTtkIGdldCBpZiB5b3UgcmFuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5BdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSYjMzk7cmUgc3RpbGwgbWlzc2luZyB0aGUgcGFydGlhbCB2aWV3IGFuZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlci4gV2UgY2FuIGRvIHdpdGhvdXQgdGhlIGNvbnRyb2xsZXIsIGJ1dCBoYXZpbmcgbm8gdmlld3MgaXMga2luZCBvZiBwb2ludGxlc3Mgd2hlbiB5b3UmIzM5O3JlIHRyeWluZyB0byBnZXQgYW4gTVZDIGVuZ2luZSB1cCBhbmQgcnVubmluZywgcmlnaHQ/PC9wPlxcbjxwPllvdSYjMzk7bGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbjwvYT4uIElmIHlvdSBkb24mIzM5O3QgcHJvdmlkZSBhIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIDxjb2RlPiZsdDtwcmUmZ3Q7PC9jb2RlPiBhbmQgPGNvZGU+Jmx0O2NvZGUmZ3Q7PC9jb2RlPiB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmVcXFwiPlVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZTwvaDQ+XFxuPHA+TGV0JiMzOTtzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCB2aWV3cy9ob21lXFxudG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlJiMzOTtyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQmIzM5O3MgaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+cCBIZWxsbyBUYXVudXMhXFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgeW91JiMzOTtsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9qYWR1bVxcXCI+amFkdW08L2E+LCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0JiMzOTtzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIDxlbT4oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UmIzM5O3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKTwvZW0+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLWdsb2JhbCBqYWR1bVxcbjwvY29kZT48L3ByZT5cXG48cD5UbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIDxjb2RlPnZpZXdzPC9jb2RlPiBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSA8Y29kZT4uYmluPC9jb2RlPiBiZWNhdXNlIHRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uPC9hPiBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPmphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG48L2NvZGU+PC9wcmU+XFxuPHA+Q29uZ3JhdHVsYXRpb25zISBZb3VyIGZpcnN0IHZpZXcgaXMgbm93IG9wZXJhdGlvbmFsIGFuZCBidWlsdCB1c2luZyBhIGZ1bGwtZmxlZGdlZCB0ZW1wbGF0aW5nIGVuZ2luZSEgQWxsIHRoYXQmIzM5O3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgPGNvZGU+MzAwMDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxub3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS96amFKWUNxLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5HcmFudGVkLCB5b3Ugc2hvdWxkIDxlbT5wcm9iYWJseTwvZW0+IG1vdmUgdGhlIGxheW91dCBpbnRvIGEgSmFkZSA8ZW0+KGFueSB2aWV3IGVuZ2luZSB3aWxsIGRvKTwvZW0+IHRlbXBsYXRlIGFzIHdlbGwuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhyb3dpbmctaW4tYS1jb250cm9sbGVyXFxcIj5UaHJvd2luZyBpbiBhIGNvbnRyb2xsZXI8L2g0PlxcbjxwPkNvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24mIzM5O3QgZ2V0IHlvdSB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCYjMzk7cyBjcmVhdGUgYSBjb250cm9sbGVyIGZvciB0aGUgPGNvZGU+aG9tZS92aWV3PC9jb2RlPiBhY3Rpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm1rZGlyIC1wIGNvbnRyb2xsZXJzL2hvbWVcXG50b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiA8ZW0+U3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj88L2VtPiBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IDxlbT4ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBpbiB0aGUgY2FzZSBvZiA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbiYjMzk7dCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyA8ZW0+KHZlcnkgZmV3KTwvZW0+IHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIDxjb2RlPnRpdGxlPC9jb2RlPiBwcm9wZXJ0eSwgYW5kIGl0JiMzOTtsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgPGNvZGU+ZG9jdW1lbnQudGl0bGU8L2NvZGU+IGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0JiMzOTtzIG5vdCBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IHByb3BlcnR5IHdvbiYjMzk7dCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LjwvcD5cXG48cD5IZXJlIGlzIG91ciBuZXdmYW5nbGVkIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIuIEFzIHlvdSYjMzk7bGwgbm90aWNlLCBpdCBkb2VzbiYjMzk7dCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gPGNvZGU+bmV4dDwvY29kZT4gaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byA8Y29kZT5yZXMudmlld01vZGVsPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgIG1vZGVsOiB7XFxuICAgICAgdGl0bGU6ICYjMzk7V2VsY29tZSBIb21lLCBUYXVudXMhJiMzOTtcXG4gICAgfVxcbiAgfTtcXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSA8ZW0+d291bGRuJiMzOTt0IGJlIHByb2dyZXNzaXZlPC9lbT4sIGFuZCB0aHVzIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPml0IHdvdWxkIGJlIHJlYWxseSwgPGVtPnJlYWxseTwvZW0+IGJhZDwvYT4uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgPGNvZGU+dGl0bGU8L2NvZGU+IGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCYjMzk7cyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnJtIGxheW91dC5qc1xcbnRvdWNoIHZpZXdzL2xheW91dC5qYWRlXFxuamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbjwvY29kZT48L3ByZT5cXG48cD5Zb3Ugc2hvdWxkIGFsc28gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZSBvbmNlIGFnYWluITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vLmJpbi92aWV3cy9sYXlvdXQmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT4hPTwvY29kZT4gc3ludGF4IGJlbG93IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbiYjMzk7dCBiZSBlc2NhcGVkLiBUaGF0JiMzOTtzIG9rYXkgYmVjYXVzZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJiMzOTt0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+dGl0bGU9bW9kZWwudGl0bGVcXG5tYWluIT1wYXJ0aWFsXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IDxjb2RlPiZsdDtodG1sJmd0OzwvY29kZT4sIDxjb2RlPiZsdDtoZWFkJmd0OzwvY29kZT4sIGFuZCA8Y29kZT4mbHQ7Ym9keSZndDs8L2NvZGU+IGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIDxlbT5Ib3cgY29vbCBpcyB0aGF0PzwvZW0+PC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vTnZFV3g5ei5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+WW91IGNhbiBub3cgdmlzaXQgPGNvZGU+bG9jYWxob3N0OjMwMDA8L2NvZGU+IHdpdGggeW91ciBmYXZvcml0ZSB3ZWIgYnJvd3NlciBhbmQgeW91JiMzOTtsbCBub3RpY2UgdGhhdCB0aGUgdmlldyByZW5kZXJzIGFzIHlvdSYjMzk7ZCBleHBlY3QuIFRoZSB0aXRsZSB3aWxsIGJlIHByb3Blcmx5IHNldCwgYW5kIGEgPGNvZGU+Jmx0O21haW4mZ3Q7PC9jb2RlPiBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgY29udGVudHMgb2YgeW91ciB2aWV3LjwvcD5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL0xnWlJGbjUucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBhcHBsaWNhdGlvbiBydW5uaW5nIG9uIEdvb2dsZSBDaHJvbWVcXFwiPjwvcD5cXG48cD5UaGF0JiMzOTtzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJiMzOTtzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIDxjb2RlPm5leHQ8L2NvZGU+IHRvIHJlbmRlciB0aGUgdmlldy48L3A+XFxuPHA+VGhlbiB0aGVyZSYjMzk7cyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCYjMzk7cyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9oMT5cXG48cD5Zb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmNoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLjwvcD5cXG48cD5UaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIDxlbT5vciBpZiBpdCBoYXNuJiMzOTt0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzPC9lbT4sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS48L3A+XFxuPHA+U2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSYjMzk7bGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbiYjMzk7cyB3aXJpbmcgPGVtPih0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKTwvZW0+IGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UmIzM5O2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQmIzM5O3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLjwvcD5cXG48cD5BcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UmIzM5O2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2g0PlxcbjxwPlRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCA8Y29kZT5qYWR1bTwvY29kZT4gZWFybGllciwgd2UmIzM5O2xsIGluc3RhbGwgdGhlIDxjb2RlPnRhdW51czwvY29kZT4gQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgLS1nbG9iYWwgdGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJlZm9yZSB5b3UgY2FuIHVzZSB0aGUgQ0xJLCB5b3Ugc2hvdWxkIG1vdmUgdGhlIHJvdXRlIGRlZmluaXRpb25zIHRvIDxjb2RlPmNvbnRyb2xsZXJzL3JvdXRlcy5qczwvY29kZT4uIFRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgdGhlbSB0byBiZS4gSWYgeW91IHdhbnQgdG8gcGxhY2UgdGhlbSBzb21ldGhpbmcgZWxzZSwgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uIGNhbiBoZWxwIHlvdTwvYT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm12IHJvdXRlcy5qcyBjb250cm9sbGVycy9yb3V0ZXMuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2UgeW91IG1vdmVkIHRoZSByb3V0ZXMgeW91IHNob3VsZCBhbHNvIHVwZGF0ZSB0aGUgPGNvZGU+cmVxdWlyZTwvY29kZT4gc3RhdGVtZW50IGluIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0JiMzOTtsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcuIEluIHR5cGljYWwgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb248L2E+IGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIDxjb2RlPi5iaW4vdmlld3M8L2NvZGU+IGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4sIGJ1dCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24mIzM5O3QgbWVldCB5b3VyIG5lZWRzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXRcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LmJpbi93aXJpbmcuanM8L2NvZGU+IGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIDxjb2RlPnRhdW51czwvY29kZT4gaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCYjMzk7cyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspLFxcbiAgJiMzOTtsYXlvdXQmIzM5OzogcmVxdWlyZSgmIzM5Oy4vdmlld3MvbGF5b3V0LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxufTtcXG5cXG52YXIgcm91dGVzID0ge1xcbiAgJiMzOTsvJiMzOTs6IHtcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbn07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9mSm5IZFlpLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYHRhdW51c2Agb3V0cHV0XFxcIj48L3A+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5jb250cm9sbGVyczwvY29kZT4gb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJiMzOTt0IGNyZWF0ZWQgYW55IDxlbT5jbGllbnQtc2lkZSBjb250cm9sbGVyczwvZW0+IHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJiMzOTt0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC48L3A+XFxuPHA+VGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCwgeW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoaXMgZmlsZSB3aGVuZXZlciB5b3UgYWRkLCBjaGFuZ2UsIG9yIHJlbW92ZSBhIHZpZXcsIGEgY2xpZW50LXNpZGUgY29udHJvbGxlciwgb3IgYSByb3V0ZS4gRG9pbmcgdGhhdCB3b3VsZCBiZSBjdW1iZXJzb21lLCBhbmQgdGhlIENMSSBzb2x2ZXMgdGhhdCBwcm9ibGVtIGZvciB1cyBhdCB0aGUgZXhwZW5zZSBvZiBvbmUgYWRkaXRpb25hbCBidWlsZCBzdGVwLjwvcD5cXG48cD5EdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIDxjb2RlPi0td2F0Y2g8L2NvZGU+IGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG48L2NvZGU+PC9wcmU+XFxuPHA+SWYgeW91JiMzOTtyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91JiMzOTtsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgPGNvZGU+aGFwaWlmeTwvY29kZT4gdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXJcXFwiPkJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvaDQ+XFxuPHA+T25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIDxjb2RlPmNsaWVudC9qczwvY29kZT4gdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0JiMzOTtzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgY2xpZW50L2pzXFxudG91Y2ggY2xpZW50L2pzL21haW4uanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPm1haW48L2NvZGU+IG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIDxlbT5lbnRyeSBwb2ludDwvZW0+IG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSYjMzk7bGwgbmVlZCB0byBpbXBvcnQgPGNvZGU+dGF1bnVzPC9jb2RlPiwgdGhlIHdpcmluZyBtb2R1bGUgd2UmIzM5O3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgd2lyaW5nID0gcmVxdWlyZSgmIzM5Oy4uLy4uLy5iaW4vd2lyaW5nJiMzOTspO1xcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJiMzOTttYWluJiMzOTspWzBdO1xcblxcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLjwvcD5cXG48cD5CeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbiYjMzk7dCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuPC9wPlxcbjxwPkFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIDxlbT50eXBpY2FsbHkgbGFyZ2VyPC9lbT4gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS48L3A+XFxuPHA+QSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCYjMzk7cyBoYXJkZXIgdG8gc2V0IHVwLjwvcD5cXG48cD5UaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj50aGUgb3B0aW1pemF0aW9uIGd1aWRlPC9hPi4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgPGVtPig8Y29kZT4mIzM5O2F1dG8mIzM5OzwvY29kZT4pPC9lbT4gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCYjMzk7cyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+LCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+LCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by48L3A+XFxuPHA+VGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSYjMzk7cmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCYjMzk7cyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJiMzOTt2ZSBiZWVuIGJ1aWxkaW5nLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZVxcbnRvdWNoIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJiMzOTtsbCBqdXN0IHByaW50IHRoZSBhY3Rpb24gYW5kIHRoZSBtb2RlbCB0byB0aGUgY29uc29sZS4gSWYgdGhlcmUmIzM5O3Mgb25lIHBsYWNlIHdoZXJlIHlvdSYjMzk7ZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCwgY29udGFpbmVyLCByb3V0ZSkge1xcbiAgY29uc29sZS5sb2coJiMzOTtSZW5kZXJlZCB2aWV3ICVzIHVzaW5nIG1vZGVsOlxcXFxuJXMmIzM5Oywgcm91dGUuYWN0aW9uLCBKU09OLnN0cmluZ2lmeShtb2RlbCwgbnVsbCwgMikpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlIHdlcmVuJiMzOTt0IHVzaW5nIHRoZSA8Y29kZT4tLXdhdGNoPC9jb2RlPiBmbGFnIGZyb20gdGhlIFRhdW51cyBDTEksIHlvdSYjMzk7bGwgaGF2ZSB0byByZWNvbXBpbGUgdGhlIHdpcmluZyBhdCB0aGlzIHBvaW50LCBzbyB0aGF0IHRoZSBjb250cm9sbGVyIGdldHMgYWRkZWQgdG8gdGhhdCBtYW5pZmVzdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9mIGNvdXJzZSwgeW91JiMzOTtsbCBub3cgaGF2ZSB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IHVzaW5nIDxhIGhyZWY9XFxcImh0dHA6Ly9icm93c2VyaWZ5Lm9yZy9cXFwiPkJyb3dzZXJpZnk8L2E+ITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNvbXBpbGluZy15b3VyLWNsaWVudC1zaWRlLWphdmFzY3JpcHRcXFwiPkNvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQ8L2g0PlxcbjxwPllvdSYjMzk7bGwgbmVlZCB0byBjb21waWxlIHRoZSA8Y29kZT5jbGllbnQvanMvbWFpbi5qczwvY29kZT4gbW9kdWxlLCBvdXIgY2xpZW50LXNpZGUgYXBwbGljYXRpb24mIzM5O3MgZW50cnkgcG9pbnQsIHVzaW5nIEJyb3dzZXJpZnkgc2luY2UgdGhlIGNvZGUgaXMgd3JpdHRlbiB1c2luZyBDb21tb25KUy4gSW4gdGhpcyBleGFtcGxlIHlvdSYjMzk7bGwgaW5zdGFsbCA8Y29kZT5icm93c2VyaWZ5PC9jb2RlPiBnbG9iYWxseSB0byBjb21waWxlIHRoZSBjb2RlLCBidXQgbmF0dXJhbGx5IHlvdSYjMzk7bGwgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4gd29ya2luZyBvbiBhIHJlYWwtd29ybGQgYXBwbGljYXRpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC0tZ2xvYmFsIGJyb3dzZXJpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+T25jZSB5b3UgaGF2ZSB0aGUgQnJvd3NlcmlmeSBDTEksIHlvdSYjMzk7bGwgYmUgYWJsZSB0byBjb21waWxlIHRoZSBjb2RlIHJpZ2h0IGZyb20geW91ciBjb21tYW5kIGxpbmUuIFRoZSA8Y29kZT4tZDwvY29kZT4gZmxhZyB0ZWxscyBCcm93c2VyaWZ5IHRvIGFkZCBhbiBpbmxpbmUgc291cmNlIG1hcCBpbnRvIHRoZSBjb21waWxlZCBidW5kbGUsIG1ha2luZyBkZWJ1Z2dpbmcgZWFzaWVyIGZvciB1cy4gVGhlIDxjb2RlPi1vPC9jb2RlPiBmbGFnIHJlZGlyZWN0cyBvdXRwdXQgdG8gdGhlIGluZGljYXRlZCBmaWxlLCB3aGVyZWFzIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCB0byBzdGFuZGFyZCBvdXRwdXQgYnkgZGVmYXVsdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgLmJpbi9wdWJsaWMvanNcXG5icm93c2VyaWZ5IGNsaWVudC9qcy9tYWluLmpzIC1kbyAuYmluL3B1YmxpYy9qcy9hbGwuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+V2UgaGF2ZW4mIzM5O3QgZG9uZSBtdWNoIG9mIGFueXRoaW5nIHdpdGggdGhlIEV4cHJlc3MgYXBwbGljYXRpb24sIHNvIHlvdSYjMzk7bGwgbmVlZCB0byBhZGp1c3QgdGhlIDxjb2RlPmFwcC5qczwvY29kZT4gbW9kdWxlIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMuIElmIHlvdSYjMzk7cmUgdXNlZCB0byBFeHByZXNzLCB5b3UmIzM5O2xsIG5vdGljZSB0aGVyZSYjMzk7cyBub3RoaW5nIHNwZWNpYWwgYWJvdXQgaG93IHdlJiMzOTtyZSB1c2luZyA8Y29kZT5zZXJ2ZS1zdGF0aWM8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLXNhdmUgc2VydmUtc3RhdGljXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxldCYjMzk7cyBjb25maWd1cmUgdGhlIGFwcGxpY2F0aW9uIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMgZnJvbSA8Y29kZT4uYmluL3B1YmxpYzwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIHNlcnZlU3RhdGljID0gcmVxdWlyZSgmIzM5O3NlcnZlLXN0YXRpYyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG5hcHAudXNlKHNlcnZlU3RhdGljKCYjMzk7LmJpbi9wdWJsaWMmIzM5OykpO1xcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgdXAsIHlvdSYjMzk7bGwgaGF2ZSB0byBlZGl0IHRoZSBsYXlvdXQgdG8gaW5jbHVkZSB0aGUgY29tcGlsZWQgSmF2YVNjcmlwdCBidW5kbGUgZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj50aXRsZT1tb2RlbC50aXRsZVxcbm1haW4hPXBhcnRpYWxcXG5zY3JpcHQoc3JjPSYjMzk7L2pzL2FsbC5qcyYjMzk7KVxcbjwvY29kZT48L3ByZT5cXG48cD5MYXN0bHksIHlvdSBjYW4gZXhlY3V0ZSB0aGUgYXBwbGljYXRpb24gYW5kIHNlZSBpdCBpbiBhY3Rpb24hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vNjhPODR3WC5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+SWYgeW91IG9wZW4gdGhlIGFwcGxpY2F0aW9uIG9uIGEgd2ViIGJyb3dzZXIsIHlvdSYjMzk7bGwgbm90aWNlIHRoYXQgdGhlIGFwcHJvcHJpYXRlIGluZm9ybWF0aW9uIHdpbGwgYmUgbG9nZ2VkIGludG8gdGhlIGRldmVsb3BlciA8Y29kZT5jb25zb2xlPC9jb2RlPi48L3A+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9aVUY2TkZsLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggdGhlIGFwcGxpY2F0aW9uIHJ1bm5pbmcgdW5kZXIgR29vZ2xlIENocm9tZVxcXCI+PC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9oND5cXG48cD5UYXVudXMgZG9lcyBwcm92aWRlIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmEgdGhpbiBBUEk8L2E+IGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSYjMzk7cyBhIGZldyBtZXRob2RzIHlvdSBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygb24gYSBnbG9iYWwgc2NhbGUgYXMgd2VsbC48L3A+XFxuPHA+VGF1bnVzIGNhbiBub3RpZnkgeW91IHdoZW5ldmVyIGltcG9ydGFudCBldmVudHMgb2NjdXIuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5FdmVudDwvdGg+XFxuPHRoPkFyZ3VtZW50czwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5zdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZG9uZSYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBkYXRhPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5hYm9ydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5lcnJvciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBlcnI8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5CZXNpZGVzIGV2ZW50cywgdGhlcmUmIzM5O3MgYSBjb3VwbGUgbW9yZSBtZXRob2RzIHlvdSBjYW4gdXNlLiBUaGUgPGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPiBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJiMzOTtzIDxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPiwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCYjMzk7bGwgdGhlbiBpbnZva2UgaXRzIGNvbnRyb2xsZXIuIFlvdSYjMzk7bGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guPC9wPlxcbjxwPkFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmdcXFwiPkNhY2hpbmcgYW5kIFByZWZldGNoaW5nPC9oND5cXG48cD48YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlPC9hPiBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQmIzM5O3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/PC9wPlxcbjxwPldoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIDxjb2RlPnsgY2FjaGU6IHRydWUgfTwvY29kZT4gYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiwgdGhlIGNhY2hpbmcgbGF5ZXIgd2lsbCBtYWtlIHN1cmUgdGhhdCByZXNwb25zZXMgYXJlIGtlcHQgYXJvdW5kIGZvciA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0JiMzOTtsbCBmaXJzdCBhc2sgdGhlIGNhY2hpbmcgbGF5ZXIgZm9yIGEgZnJlc2ggY29weS4gSWYgdGhlIGNhY2hpbmcgbGF5ZXIgZG9lc24mIzM5O3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSA8ZW0+KGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcyk8L2VtPiwgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gYSBudW1iZXIgaW4gc2Vjb25kcyBpbnN0ZWFkIG9mIGp1c3QgPGNvZGU+dHJ1ZTwvY29kZT4uPC9wPlxcbjxwPlNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UmIzM5O3JlIGFsc28gYWJsZSB0byBzZXQgYSA8Y29kZT5jYWNoZTwvY29kZT4gZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgPGNvZGU+Y2FjaGU8L2NvZGU+IHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+SW5kZXhlZERCPC9hPiBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIDxjb2RlPmxvY2FsU3RvcmFnZTwvY29kZT4uIEl0IGhhcyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5zdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0PC9hPiwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCYjMzk7cyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuPC9wPlxcbjxwPlRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSA8ZW0+KHRoZSA8Y29kZT50b3VjaHN0YXJ0PC9jb2RlPiBldmVudCk8L2VtPiwgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuPC9wPlxcbjxwPklmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgPGVtPihwb3NzaWJseSBsaW1pdGVkKTwvZW0+IEludGVybmV0IGNvbm5lY3Rpb24gYmFuZHdpZHRoLjwvcD5cXG48cD5JZiB0aGUgaHVtYW4gY2xpY2tzIG9uIHRoZSBsaW5rIGJlZm9yZSBwcmVmZXRjaGluZyBpcyBjb21wbGV0ZWQsIGhlJiMzOTtsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuPC9wPlxcbjxwPlR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgPGNvZGU+cHJlZmV0Y2g8L2NvZGU+IHRvIDxjb2RlPnRydWU8L2NvZGU+IGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlIE9wdGltaXphdGlvbnM8L2E+IGd1aWRlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS1za3ktaXMtdGhlLWxpbWl0LVxcXCI+VGhlIHNreSBpcyB0aGUgbGltaXQhPC9oMT5cXG48cD5Zb3UmIzM5O3JlIG5vdyBmYW1pbGlhciB3aXRoIGhvdyBUYXVudXMgd29ya3Mgb24gYSBoaWdoLWxldmVsLiBZb3UgaGF2ZSBjb3ZlcmVkIGEgZGVjZW50IGFtb3VudCBvZiBncm91bmQsIGJ1dCB5b3Ugc2hvdWxkbiYjMzk7dCBzdG9wIHRoZXJlLjwvcD5cXG48dWw+XFxuPGxpPkxlYXJuIG1vcmUgYWJvdXQgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBUYXVudXMgaGFzPC9hPiB0byBvZmZlcjwvbGk+XFxuPGxpPkdvIHRocm91Z2ggdGhlIDxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+cGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHRpcHM8L2E+LiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchPC9saT5cXG48bGk+PGVtPkZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQ8L2VtPjx1bD5cXG48bGk+SmVyZW15IEtlaXRoIGVudW5jaWF0ZXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly9hZGFjdGlvLmNvbS9qb3VybmFsLzc3MDZcXFwiPiZxdW90O0JlIHByb2dyZXNzaXZlJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkNocmlzdGlhbiBIZWlsbWFubiBhZHZvY2F0ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9pY2FudC5jby51ay9hcnRpY2xlcy9wcmFnbWF0aWMtcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQvXFxcIj4mcXVvdDtQcmFnbWF0aWMgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQmcXVvdDs8L2E+PC9saT5cXG48bGk+SmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IDxhIGhyZWY9XFxcImh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGlzIGZhc3RlciZxdW90OzwvYT48L2xpPlxcbjxsaT5JIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj4mcXVvdDtTdG9wIEJyZWFraW5nIHRoZSBXZWImcXVvdDs8L2E+PC9saT5cXG48bGk+R3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcXCI+JnF1b3Q7NyBQcmluY2lwbGVzIG9mIFJpY2ggV2ViIEFwcGxpY2F0aW9ucyZxdW90OzwvYT48L2xpPlxcbjxsaT5BYXJvbiBHdXN0YWZzb24gd3JpdGVzIDxhIGhyZWY9XFxcImh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxcIj4mcXVvdDtVbmRlcnN0YW5kaW5nIFByb2dyZXNzaXZlIEVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPk9yZGUgU2F1bmRlcnMgZ2l2ZXMgaGlzIHBvaW50IG9mIHZpZXcgaW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcXCI+JnF1b3Q7UHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgZm9yIGZhdWx0IHRvbGVyYW5jZSZxdW90OzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+U2lmdCB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4uIFlvdSBtYXkgZmluZCBzb21ldGhpbmcgeW91IGhhZG4mIzM5O3QgdGhvdWdodCBvZiE8L2xpPlxcbjwvdWw+XFxuPHA+QWxzbywgZ2V0IGludm9sdmVkITwvcD5cXG48dWw+XFxuPGxpPkZvcmsgdGhpcyByZXBvc2l0b3J5IGFuZCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcXCI+c2VuZCBzb21lIHB1bGwgcmVxdWVzdHM8L2E+IHRvIGltcHJvdmUgdGhlc2UgZ3VpZGVzITwvbGk+XFxuPGxpPlNlZSBzb21ldGhpbmcsIHNheSBzb21ldGhpbmchIElmIHlvdSBkZXRlY3QgYSBidWcsIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzL2lzc3Vlcy9uZXdcXFwiPnBsZWFzZSBjcmVhdGUgYW4gaXNzdWU8L2E+ITwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48YmxvY2txdW90ZT5cXG48cD5Zb3UmIzM5O2xsIGZpbmQgYSA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2dldHRpbmctc3RhcnRlZFxcXCI+ZnVsbCBmbGVkZ2VkIHZlcnNpb24gb2YgdGhlIEdldHRpbmcgU3RhcnRlZDwvYT4gdHV0b3JpYWwgYXBwbGljYXRpb24gb24gR2l0SHViLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBHZXR0aW5nIFN0YXJ0ZWRcXG5cXG4gICAgVGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQncyBfdXAgdG8geW91IGhvdyB0byB1c2UgaXRfLiBJbiBmYWN0LCBpdCBtaWdodCBiZSBhIGdvb2QgaWRlYSBmb3IgeW91IHRvICoqc2V0IHVwIGp1c3QgdGhlIHNlcnZlci1zaWRlIGFzcGVjdCBmaXJzdCoqLCBhcyB0aGF0J2xsIHRlYWNoIHlvdSBob3cgaXQgd29ya3MgZXZlbiB3aGVuIEphdmFTY3JpcHQgbmV2ZXIgZ2V0cyB0byB0aGUgY2xpZW50LlxcblxcbiAgICAjIFRhYmxlIG9mIENvbnRlbnRzXFxuXFxuICAgIC0gW0hvdyBpdCB3b3Jrc10oI2hvdy1pdC13b3JrcylcXG4gICAgLSBbSW5zdGFsbGluZyBUYXVudXNdKCNpbnN0YWxsaW5nLXRhdW51cylcXG4gICAgLSBbU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVdKCNzZXR0aW5nLXVwLXRoZS1zZXJ2ZXItc2lkZSlcXG4gICAgICAtIFtZb3VyIGZpcnN0IHJvdXRlXSgjeW91ci1maXJzdC1yb3V0ZSlcXG4gICAgICAtIFtDcmVhdGluZyBhIGxheW91dF0oI2NyZWF0aW5nLWEtbGF5b3V0KVxcbiAgICAgIC0gW1VzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZV0oI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZSlcXG4gICAgICAtIFtUaHJvd2luZyBpbiBhIGNvbnRyb2xsZXJdKCN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXIpXFxuICAgIC0gW1RhdW51cyBpbiB0aGUgY2xpZW50XSgjdGF1bnVzLWluLXRoZS1jbGllbnQpXFxuICAgICAgLSBbVXNpbmcgdGhlIFRhdW51cyBDTEldKCN1c2luZy10aGUtdGF1bnVzLWNsaSlcXG4gICAgICAtIFtCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJdKCNib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXIpXFxuICAgICAgLSBbQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXSgjYWRkaW5nLWZ1bmN0aW9uYWxpdHktaW4tYS1jbGllbnQtc2lkZS1jb250cm9sbGVyKVxcbiAgICAgIC0gW0NvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHRdKCNjb21waWxpbmcteW91ci1jbGllbnQtc2lkZS1qYXZhc2NyaXB0KVxcbiAgICAgIC0gW1VzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJXSgjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGkpXFxuICAgICAgLSBbQ2FjaGluZyBhbmQgUHJlZmV0Y2hpbmddKCNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZylcXG4gICAgLSBbVGhlIHNreSBpcyB0aGUgbGltaXQhXSgjdGhlLXNreS1pcy10aGUtbGltaXQtKVxcblxcbiAgICAjIEhvdyBpdCB3b3Jrc1xcblxcbiAgICBUYXVudXMgZm9sbG93cyBhIHNpbXBsZSBidXQgKipwcm92ZW4qKiBzZXQgb2YgcnVsZXMuXFxuXFxuICAgIC0gRGVmaW5lIGEgYGZ1bmN0aW9uKG1vZGVsKWAgZm9yIGVhY2ggeW91ciB2aWV3c1xcbiAgICAtIFB1dCB0aGVzZSB2aWV3cyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBEZWZpbmUgcm91dGVzIGZvciB5b3VyIGFwcGxpY2F0aW9uXFxuICAgIC0gUHV0IHRob3NlIHJvdXRlcyBpbiBib3RoIHRoZSBzZXJ2ZXIgYW5kIHRoZSBjbGllbnRcXG4gICAgLSBFbnN1cmUgcm91dGUgbWF0Y2hlcyB3b3JrIHRoZSBzYW1lIHdheSBvbiBib3RoIGVuZHNcXG4gICAgLSBDcmVhdGUgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgdGhhdCB5aWVsZCB0aGUgbW9kZWwgZm9yIHlvdXIgdmlld3NcXG4gICAgLSBDcmVhdGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgaWYgeW91IG5lZWQgdG8gYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdG8gYSBwYXJ0aWN1bGFyIHZpZXdcXG4gICAgLSBGb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFsd2F5cyByZW5kZXIgdmlld3Mgb24gdGhlIHNlcnZlci1zaWRlXFxuICAgIC0gV2hlbiByZW5kZXJpbmcgYSB2aWV3IG9uIHRoZSBzZXJ2ZXItc2lkZSwgaW5jbHVkZSB0aGUgZnVsbCBsYXlvdXQgYXMgd2VsbCFcXG4gICAgLSBPbmNlIHRoZSBjbGllbnQtc2lkZSBjb2RlIGtpY2tzIGluLCAqKmhpamFjayBsaW5rIGNsaWNrcyoqIGFuZCBtYWtlIEFKQVggcmVxdWVzdHMgaW5zdGVhZFxcbiAgICAtIFdoZW4geW91IGdldCB0aGUgSlNPTiBtb2RlbCBiYWNrLCByZW5kZXIgdmlld3Mgb24gdGhlIGNsaWVudC1zaWRlXFxuICAgIC0gSWYgdGhlIGBoaXN0b3J5YCBBUEkgaXMgdW5hdmFpbGFibGUsIGZhbGwgYmFjayB0byBnb29kIG9sZCByZXF1ZXN0LXJlc3BvbnNlLiAqKkRvbid0IGNvbmZ1c2UgeW91ciBodW1hbnMgd2l0aCBvYnNjdXJlIGhhc2ggcm91dGVycyEqKlxcblxcbiAgICBJJ2xsIHN0ZXAgeW91IHRocm91Z2ggdGhlc2UsIGJ1dCByYXRoZXIgdGhhbiBsb29raW5nIGF0IGltcGxlbWVudGF0aW9uIGRldGFpbHMsIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgc3RlcHMgeW91IG5lZWQgdG8gdGFrZSBpbiBvcmRlciB0byBtYWtlIHRoaXMgZmxvdyBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgSW5zdGFsbGluZyBUYXVudXNcXG5cXG4gICAgRmlyc3Qgb2ZmLCB5b3UnbGwgbmVlZCB0byBjaG9vc2UgYSBIVFRQIHNlcnZlciBmcmFtZXdvcmsgZm9yIHlvdXIgYXBwbGljYXRpb24uIEF0IHRoZSBtb21lbnQgVGF1bnVzIHN1cHBvcnRzIG9ubHkgYSBjb3VwbGUgb2YgSFRUUCBmcmFtZXdvcmtzLCBidXQgbW9yZSBtYXkgYmUgYWRkZWQgaWYgdGhleSBhcmUgcG9wdWxhciBlbm91Z2guXFxuXFxuICAgIC0gW0V4cHJlc3NdWzZdLCB0aHJvdWdoIFt0YXVudXMtZXhwcmVzc11bMV1cXG4gICAgLSBbSGFwaV1bN10sIHRocm91Z2ggW3RhdW51cy1oYXBpXVsyXSBhbmQgdGhlIFtoYXBpaWZ5XVszXSB0cmFuc2Zvcm1cXG5cXG4gICAgPiBJZiB5b3UncmUgbW9yZSBvZiBhIF9cXFwicnVtbWFnZSB0aHJvdWdoIHNvbWVvbmUgZWxzZSdzIGNvZGVcXFwiXyB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIFtnb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSdzIHNvdXJjZSBjb2RlXVs0XSwgd2hpY2ggdXNlcyB0aGUgW0hhcGldWzddIGZsYXZvciBvZiBUYXVudXMuIEFsdGVybmF0aXZlbHkgeW91IGNhbiBsb29rIGF0IHRoZSBzb3VyY2UgY29kZSBmb3IgW3Bvbnlmb28uY29tXVs1XSwgd2hpY2ggaXMgKiphIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2UqKiB1bmRlciB0aGUgW0V4cHJlc3NdWzZdIGZsYXZvci4gT3IsIHlvdSBjb3VsZCBqdXN0IGtlZXAgb24gcmVhZGluZyB0aGlzIHBhZ2UsIHRoYXQncyBva2F5IHRvby5cXG5cXG4gICAgT25jZSB5b3UndmUgc2V0dGxlZCBmb3IgZWl0aGVyIFtFeHByZXNzXVs2XSBvciBbSGFwaV1bN10geW91J2xsIGJlIGFibGUgdG8gcHJvY2VlZC4gRm9yIHRoZSBwdXJwb3NlcyBvZiB0aGlzIGd1aWRlLCB3ZSdsbCB1c2UgW0V4cHJlc3NdWzZdLiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgU2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGVcXG5cXG4gICAgTmF0dXJhbGx5LCB5b3UnbGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSBgbnBtYCB0byBnZXQgc3RhcnRlZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgZ2V0dGluZy1zdGFydGVkXFxuICAgIGNkIGdldHRpbmctc3RhcnRlZFxcbiAgICBucG0gaW5pdFxcbiAgICBucG0gaW5zdGFsbCAtLXNhdmUgdGF1bnVzIHRhdW51cy1leHByZXNzIGV4cHJlc3NcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBucG0gaW5pdGAgb3V0cHV0XVszMF1cXG5cXG4gICAgTGV0J3MgYnVpbGQgb3VyIGFwcGxpY2F0aW9uIHN0ZXAtYnktc3RlcCwgYW5kIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSdsbCBuZWVkIHRoZSBmYW1vdXMgYGFwcC5qc2AgZmlsZS5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggYXBwLmpzXFxuICAgIGBgYFxcblxcbiAgICBJdCdzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciBgYXBwLmpzYCBmaWxlLCBsZXQncyBkbyB0aGF0IG5vdy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge307XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgQWxsIGB0YXVudXMtZXhwcmVzc2AgcmVhbGx5IGRvZXMgaXMgYWRkIGEgYnVuY2ggb2Ygcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBgYXBwYC4gWW91IHNob3VsZCBub3RlIHRoYXQgYW55IG1pZGRsZXdhcmUgYW5kIEFQSSByb3V0ZXMgc2hvdWxkIHByb2JhYmx5IGNvbWUgYmVmb3JlIHRoZSBgdGF1bnVzRXhwcmVzc2AgaW52b2NhdGlvbi4gWW91J2xsIHByb2JhYmx5IGJlIHVzaW5nIGEgY2F0Y2gtYWxsIHZpZXcgcm91dGUgdGhhdCByZW5kZXJzIGEgX1xcXCJOb3QgRm91bmRcXFwiXyB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS5cXG5cXG4gICAgSWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSFcXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszMV1cXG5cXG4gICAgVGhlIGBvcHRpb25zYCBvYmplY3QgcGFzc2VkIHRvIGB0YXVudXNFeHByZXNzYCBsZXQncyB5b3UgY29uZmlndXJlIFRhdW51cy4gSW5zdGVhZCBvZiBkaXNjdXNzaW5nIGV2ZXJ5IHNpbmdsZSBjb25maWd1cmF0aW9uIG9wdGlvbiB5b3UgY291bGQgc2V0IGhlcmUsIGxldCdzIGRpc2N1c3Mgd2hhdCBtYXR0ZXJzOiB0aGUgX3JlcXVpcmVkIGNvbmZpZ3VyYXRpb25fLiBUaGVyZSdzIHR3byBvcHRpb25zIHRoYXQgeW91IG11c3Qgc2V0IGlmIHlvdSB3YW50IHlvdXIgVGF1bnVzIGFwcGxpY2F0aW9uIHRvIG1ha2UgYW55IHNlbnNlLlxcblxcbiAgICAtIGByb3V0ZXNgIHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlc1xcbiAgICAtIGBsYXlvdXRgIHNob3VsZCBiZSBhIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSBzaW5nbGUgYG1vZGVsYCBhcmd1bWVudCBhbmQgcmV0dXJucyBhbiBlbnRpcmUgSFRNTCBkb2N1bWVudFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFlvdXIgZmlyc3Qgcm91dGVcXG5cXG4gICAgUm91dGVzIG5lZWQgdG8gYmUgcGxhY2VkIGluIGl0cyBvd24gZGVkaWNhdGVkIG1vZHVsZSwgc28gdGhhdCB5b3UgY2FuIHJldXNlIGl0IGxhdGVyIG9uICoqd2hlbiBzZXR0aW5nIHVwIGNsaWVudC1zaWRlIHJvdXRpbmcqKi4gTGV0J3MgY3JlYXRlIHRoYXQgbW9kdWxlIGFuZCBhZGQgYSByb3V0ZSB0byBpdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdG91Y2ggcm91dGVzLmpzXFxuICAgIGBgYFxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gW1xcbiAgICAgIHsgcm91dGU6ICcvJywgYWN0aW9uOiAnaG9tZS9pbmRleCcgfVxcbiAgICBdO1xcbiAgICBgYGBcXG5cXG4gICAgRWFjaCBpdGVtIGluIHRoZSBleHBvcnRlZCBhcnJheSBpcyBhIHJvdXRlLiBJbiB0aGlzIGNhc2UsIHdlIG9ubHkgaGF2ZSB0aGUgYC9gIHJvdXRlIHdpdGggdGhlIGBob21lL2luZGV4YCBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIFtjb252ZW50aW9uIG92ZXIgY29uZmlndXJhdGlvbiBwYXR0ZXJuXVs4XSwgd2hpY2ggbWFkZSBbUnVieSBvbiBSYWlsc11bOV0gZmFtb3VzLiBfTWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vIV8gQnkgY29udmVudGlvbiwgVGF1bnVzIHdpbGwgYXNzdW1lIHRoYXQgdGhlIGBob21lL2luZGV4YCBhY3Rpb24gdXNlcyB0aGUgYGhvbWUvaW5kZXhgIGNvbnRyb2xsZXIgYW5kIHJlbmRlcnMgdGhlIGBob21lL2luZGV4YCB2aWV3LiBPZiBjb3Vyc2UsIF9hbGwgb2YgdGhhdCBjYW4gYmUgY2hhbmdlZCB1c2luZyBjb25maWd1cmF0aW9uXy5cXG5cXG4gICAgVGltZSB0byBnbyBiYWNrIHRvIGBhcHAuanNgIGFuZCB1cGRhdGUgdGhlIGBvcHRpb25zYCBvYmplY3QuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBJdCdzIGltcG9ydGFudCB0byBrbm93IHRoYXQgaWYgeW91IG9taXQgdGhlIGNyZWF0aW9uIG9mIGEgY29udHJvbGxlciB0aGVuIFRhdW51cyB3aWxsIHNraXAgdGhhdCBzdGVwLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHBhc3NpbmcgaXQgd2hhdGV2ZXIgdGhlIGRlZmF1bHQgbW9kZWwgaXMgXyhtb3JlIG9uIHRoYXQgW2luIHRoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdLCBidXQgaXQgZGVmYXVsdHMgdG8gYHt9YClfLlxcblxcbiAgICBIZXJlJ3Mgd2hhdCB5b3UnZCBnZXQgaWYgeW91IGF0dGVtcHRlZCB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgY3VybCBsb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXVszMl1cXG5cXG4gICAgVHVybnMgb3V0IHlvdSdyZSBtaXNzaW5nIGEgbG90IG9mIHRoaW5ncyEgVGF1bnVzIGlzIHF1aXRlIGxlbmllbnQgYW5kIGl0J2xsIHRyeSBpdHMgYmVzdCB0byBsZXQgeW91IGtub3cgd2hhdCB5b3UgbWlnaHQgYmUgbWlzc2luZywgdGhvdWdoLiBBcHBhcmVudGx5IHlvdSBkb24ndCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISBfVGhhdCdzIHJvdWdoLl9cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDcmVhdGluZyBhIGxheW91dFxcblxcbiAgICBMZXQncyBhbHNvIGNyZWF0ZSBhIGxheW91dC4gRm9yIHRoZSBwdXJwb3NlcyBvZiBtYWtpbmcgb3VyIHdheSB0aHJvdWdoIHRoaXMgZ3VpZGUsIGl0J2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBsYXlvdXQuanNcXG4gICAgYGBgXFxuXFxuICAgIE5vdGUgdGhhdCB0aGUgYHBhcnRpYWxgIHByb3BlcnR5IGluIHRoZSBgbW9kZWxgIF8oYXMgc2VlbiBiZWxvdylfIGlzIGNyZWF0ZWQgb24gdGhlIGZseSBhZnRlciByZW5kZXJpbmcgcGFydGlhbCB2aWV3cy4gVGhlIGxheW91dCBmdW5jdGlvbiB3ZSdsbCBiZSB1c2luZyBoZXJlIGVmZmVjdGl2ZWx5IG1lYW5zIF9cXFwidXNlIHRoZSBmb2xsb3dpbmcgY29tYmluYXRpb24gb2YgcGxhaW4gdGV4dCBhbmQgdGhlICoqKG1heWJlIEhUTUwpKiogcGFydGlhbCB2aWV3XFxcIl8uXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICByZXR1cm4gJ1RoaXMgaXMgdGhlIHBhcnRpYWw6IFxcXCInICsgbW9kZWwucGFydGlhbCArICdcXFwiJztcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9mIGNvdXJzZSwgaWYgeW91IHdlcmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24sIHRoZW4geW91IHByb2JhYmx5IHdvdWxkbid0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCdzIHVucHJvZHVjdGl2ZSwgY29uZnVzaW5nLCBhbmQgaGFyZCB0byBtYWludGFpbi4gV2hhdCB5b3UgY291bGQgZG8gaW5zdGVhZCwgaXMgdXNlIGEgdmlldy1yZW5kZXJpbmcgZW5naW5lIHRoYXQgYWxsb3dzIHlvdSB0byBjb21waWxlIHlvdXIgdmlldyB0ZW1wbGF0ZXMgaW50byBKYXZhU2NyaXB0IGZ1bmN0aW9ucy5cXG5cXG4gICAgLSBbTXVzdGFjaGVdWzEwXSBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCdzIG1pbmltYWxseSBkaWZmZXJlbnQgZnJvbSBIVE1MXFxuICAgIC0gW0phZGVdWzExXSBpcyBhbm90aGVyIG9wdGlvbiwgYW5kIGl0IGhhcyBhIHRlcnNlIHN5bnRheCB3aGVyZSBzcGFjaW5nIG1hdHRlcnMgYnV0IHRoZXJlJ3Mgbm8gY2xvc2luZyB0YWdzXFxuICAgIC0gVGhlcmUncyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgW01vemlsbGEncyBOdW5qdWNrc11bMTJdLCBbSGFuZGxlYmFyc11bMTNdLCBhbmQgW0VKU11bMTRdLlxcblxcbiAgICBSZW1lbWJlciB0byBhZGQgdGhlIGBsYXlvdXRgIHVuZGVyIHRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCB0byBgdGF1bnVzRXhwcmVzc2AhXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgSGVyZSdzIHdoYXQgeW91J2QgZ2V0IGlmIHlvdSByYW4gdGhlIGFwcGxpY2F0aW9uIGF0IHRoaXMgcG9pbnQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwICZcXG4gICAgY3VybCBsb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzMzXVxcblxcbiAgICBBdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSdyZSBzdGlsbCBtaXNzaW5nIHRoZSBwYXJ0aWFsIHZpZXcgYW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLiBXZSBjYW4gZG8gd2l0aG91dCB0aGUgY29udHJvbGxlciwgYnV0IGhhdmluZyBubyB2aWV3cyBpcyBraW5kIG9mIHBvaW50bGVzcyB3aGVuIHlvdSdyZSB0cnlpbmcgdG8gZ2V0IGFuIE1WQyBlbmdpbmUgdXAgYW5kIHJ1bm5pbmcsIHJpZ2h0P1xcblxcbiAgICBZb3UnbGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlcyBzZWN0aW9uXVsxNV0uIElmIHlvdSBkb24ndCBwcm92aWRlIGEgYGxheW91dGAgcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIGA8cHJlPmAgYW5kIGA8Y29kZT5gIHRhZ3MsIHdoaWNoIG1heSBhaWQgeW91IHdoZW4gZ2V0dGluZyBzdGFydGVkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZVxcblxcbiAgICBMZXQncyBnbyBhaGVhZCBhbmQgdXNlIEphZGUgYXMgdGhlIHZpZXctcmVuZGVyaW5nIGVuZ2luZSBvZiBjaG9pY2UgZm9yIG91ciB2aWV3cy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgdmlld3MvaG9tZVxcbiAgICB0b3VjaCB2aWV3cy9ob21lL2luZGV4LmphZGVcXG4gICAgYGBgXFxuXFxuICAgIFNpbmNlIHdlJ3JlIGp1c3QgZ2V0dGluZyBzdGFydGVkLCB0aGUgdmlldyB3aWxsIGp1c3QgaGF2ZSBzb21lIGJhc2ljIHN0YXRpYyBjb250ZW50LCBhbmQgdGhhdCdzIGl0LlxcblxcbiAgICBgYGBqYWRlXFxuICAgIHAgSGVsbG8gVGF1bnVzIVxcbiAgICBgYGBcXG5cXG4gICAgTmV4dCB5b3UnbGwgd2FudCB0byBjb21waWxlIHRoZSB2aWV3IGludG8gYSBmdW5jdGlvbi4gVG8gZG8gdGhhdCB5b3UgY2FuIHVzZSBbamFkdW1dWzE2XSwgYSBzcGVjaWFsaXplZCBKYWRlIGNvbXBpbGVyIHRoYXQgcGxheXMgd2VsbCB3aXRoIFRhdW51cyBieSBiZWluZyBhd2FyZSBvZiBgcmVxdWlyZWAgc3RhdGVtZW50cywgYW5kIHRodXMgc2F2aW5nIGJ5dGVzIHdoZW4gaXQgY29tZXMgdG8gY2xpZW50LXNpZGUgcmVuZGVyaW5nLiBMZXQncyBpbnN0YWxsIGl0IGdsb2JhbGx5LCBmb3IgdGhlIHNha2Ugb2YgdGhpcyBleGVyY2lzZSBfKHlvdSBzaG91bGQgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4geW91J3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKV8uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC0tZ2xvYmFsIGphZHVtXFxuICAgIGBgYFxcblxcbiAgICBUbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIGB2aWV3c2AgZGlyZWN0b3J5IGludG8gZnVuY3Rpb25zIHRoYXQgd29yayB3ZWxsIHdpdGggVGF1bnVzLCB5b3UgY2FuIHVzZSB0aGUgY29tbWFuZCBiZWxvdy4gVGhlIGAtLW91dHB1dGAgZmxhZyBpbmRpY2F0ZXMgd2hlcmUgeW91IHdhbnQgdGhlIHZpZXdzIHRvIGJlIHBsYWNlZC4gV2UgY2hvc2UgdG8gdXNlIGAuYmluYCBiZWNhdXNlIHRoYXQncyB3aGVyZSBUYXVudXMgZXhwZWN0cyB5b3VyIGNvbXBpbGVkIHZpZXdzIHRvIGJlIGJ5IGRlZmF1bHQuIEJ1dCBzaW5jZSBUYXVudXMgZm9sbG93cyB0aGUgW2NvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uXVsxN10gYXBwcm9hY2gsIHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCBpZiB5b3Ugd2FudGVkIHRvLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBqYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuICAgIGBgYFxcblxcbiAgICBDb25ncmF0dWxhdGlvbnMhIFlvdXIgZmlyc3QgdmlldyBpcyBub3cgb3BlcmF0aW9uYWwgYW5kIGJ1aWx0IHVzaW5nIGEgZnVsbC1mbGVkZ2VkIHRlbXBsYXRpbmcgZW5naW5lISBBbGwgdGhhdCdzIGxlZnQgaXMgZm9yIHlvdSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIGFuZCB2aXNpdCBpdCBvbiBwb3J0IGAzMDAwYC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBvcGVuIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzM0XVxcblxcbiAgICBHcmFudGVkLCB5b3Ugc2hvdWxkIF9wcm9iYWJseV8gbW92ZSB0aGUgbGF5b3V0IGludG8gYSBKYWRlIF8oYW55IHZpZXcgZW5naW5lIHdpbGwgZG8pXyB0ZW1wbGF0ZSBhcyB3ZWxsLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFRocm93aW5nIGluIGEgY29udHJvbGxlclxcblxcbiAgICBDb250cm9sbGVycyBhcmUgaW5kZWVkIG9wdGlvbmFsLCBidXQgYW4gYXBwbGljYXRpb24gdGhhdCByZW5kZXJzIGV2ZXJ5IHZpZXcgdXNpbmcgdGhlIHNhbWUgbW9kZWwgd29uJ3QgZ2V0IHlvdSB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCdzIGNyZWF0ZSBhIGNvbnRyb2xsZXIgZm9yIHRoZSBgaG9tZS92aWV3YCBhY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIC1wIGNvbnRyb2xsZXJzL2hvbWVcXG4gICAgdG91Y2ggY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGNvbnRyb2xsZXIgbW9kdWxlIHNob3VsZCBtZXJlbHkgZXhwb3J0IGEgZnVuY3Rpb24uIF9TdGFydGVkIG5vdGljaW5nIHRoZSBwYXR0ZXJuP18gVGhlIHNpZ25hdHVyZSBmb3IgdGhlIGNvbnRyb2xsZXIgaXMgdGhlIHNhbWUgc2lnbmF0dXJlIGFzIHRoYXQgb2YgYW55IG90aGVyIG1pZGRsZXdhcmUgcGFzc2VkIHRvIFtFeHByZXNzXVs2XSBfKG9yIGFueSByb3V0ZSBoYW5kbGVyIHBhc3NlZCB0byBbSGFwaV1bN10gaW4gdGhlIGNhc2Ugb2YgYHRhdW51cy1oYXBpYClfLlxcblxcbiAgICBBcyB5b3UgbWF5IGhhdmUgbm90aWNlZCBpbiB0aGUgZXhhbXBsZXMgc28gZmFyLCB5b3UgaGF2ZW4ndCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUncyBhIGZldyBtb2RlbCBwcm9wZXJ0aWVzIF8odmVyeSBmZXcpXyB0aGF0IFRhdW51cyBpcyBhd2FyZSBvZi4gT25lIG9mIHRob3NlIGlzIHRoZSBgdGl0bGVgIHByb3BlcnR5LCBhbmQgaXQnbGwgYmUgdXNlZCB0byBjaGFuZ2UgdGhlIGBkb2N1bWVudC50aXRsZWAgaW4geW91ciBwYWdlcyB3aGVuIG5hdmlnYXRpbmcgdGhyb3VnaCB0aGUgY2xpZW50LXNpZGUuIEtlZXAgaW4gbWluZCB0aGF0IGFueXRoaW5nIHRoYXQncyBub3QgaW4gdGhlIGBtb2RlbGAgcHJvcGVydHkgd29uJ3QgYmUgdHJhc21pdHRlZCB0byB0aGUgY2xpZW50LCBhbmQgd2lsbCBqdXN0IGJlIGFjY2Vzc2libGUgdG8gdGhlIGxheW91dC5cXG5cXG4gICAgSGVyZSBpcyBvdXIgbmV3ZmFuZ2xlZCBgaG9tZS9pbmRleGAgY29udHJvbGxlci4gQXMgeW91J2xsIG5vdGljZSwgaXQgZG9lc24ndCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gYG5leHRgIGlzIGNhbGxlZCwgdGhlIFRhdW51cyB2aWV3LXJlbmRlcmluZyBoYW5kbGVyIHdpbGwga2ljayBpbiwgYW5kIHJlbmRlciB0aGUgdmlldyB1c2luZyB0aGUgaW5mb3JtYXRpb24gdGhhdCB3YXMgYXNzaWduZWQgdG8gYHJlcy52aWV3TW9kZWxgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHJlcSwgcmVzLCBuZXh0KSB7XFxuICAgICAgcmVzLnZpZXdNb2RlbCA9IHtcXG4gICAgICAgIG1vZGVsOiB7XFxuICAgICAgICAgIHRpdGxlOiAnV2VsY29tZSBIb21lLCBUYXVudXMhJ1xcbiAgICAgICAgfVxcbiAgICAgIH07XFxuICAgICAgbmV4dCgpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCByZWx5aW5nIG9uIHRoZSBjbGllbnQtc2lkZSBjaGFuZ2VzIHRvIHlvdXIgcGFnZSBpbiBvcmRlciB0byBzZXQgdGhlIHZpZXcgdGl0bGUgX3dvdWxkbid0IGJlIHByb2dyZXNzaXZlXywgYW5kIHRodXMgW2l0IHdvdWxkIGJlIHJlYWxseSwgX3JlYWxseV8gYmFkXVsxN10uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgYHRpdGxlYCBoYXMgYmVlbiBwYXNzZWQgdG8gdGhlIG1vZGVsLiBJbiBmYWN0LCBsZXQncyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHJtIGxheW91dC5qc1xcbiAgICB0b3VjaCB2aWV3cy9sYXlvdXQuamFkZVxcbiAgICBqYWR1bSB2aWV3cy8qKiAtLW91dHB1dCAuYmluXFxuICAgIGBgYFxcblxcbiAgICBZb3Ugc2hvdWxkIGFsc28gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSBgYXBwLmpzYCBtb2R1bGUgb25jZSBhZ2FpbiFcXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vLmJpbi92aWV3cy9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgIT1gIHN5bnRheCBiZWxvdyBtZWFucyB0aGF0IHdoYXRldmVyIGlzIGluIHRoZSB2YWx1ZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudCB3b24ndCBiZSBlc2NhcGVkLiBUaGF0J3Mgb2theSBiZWNhdXNlIGBwYXJ0aWFsYCBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJ3Qgd2FudCBIVE1MIHRhZ3MgdG8gYmUgZXNjYXBlZCFcXG5cXG4gICAgYGBgamFkZVxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtYWluIT1wYXJ0aWFsXFxuICAgIGBgYFxcblxcbiAgICBCeSB0aGUgd2F5LCBkaWQgeW91IGtub3cgdGhhdCBgPGh0bWw+YCwgYDxoZWFkPmAsIGFuZCBgPGJvZHk+YCBhcmUgYWxsIG9wdGlvbmFsIGluIEhUTUwgNSwgYW5kIHRoYXQgeW91IGNhbiBzYWZlbHkgb21pdCB0aGVtIGluIHlvdXIgSFRNTD8gT2YgY291cnNlLCByZW5kZXJpbmcgZW5naW5lcyB3aWxsIHN0aWxsIGluc2VydCB0aG9zZSBlbGVtZW50cyBhdXRvbWF0aWNhbGx5IGludG8gdGhlIERPTSBmb3IgeW91ISBfSG93IGNvb2wgaXMgdGhhdD9fXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzVdXFxuXFxuICAgIFlvdSBjYW4gbm93IHZpc2l0IGBsb2NhbGhvc3Q6MzAwMGAgd2l0aCB5b3VyIGZhdm9yaXRlIHdlYiBicm93c2VyIGFuZCB5b3UnbGwgbm90aWNlIHRoYXQgdGhlIHZpZXcgcmVuZGVycyBhcyB5b3UnZCBleHBlY3QuIFRoZSB0aXRsZSB3aWxsIGJlIHByb3Blcmx5IHNldCwgYW5kIGEgYDxtYWluPmAgZWxlbWVudCB3aWxsIGhhdmUgdGhlIGNvbnRlbnRzIG9mIHlvdXIgdmlldy5cXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYXBwbGljYXRpb24gcnVubmluZyBvbiBHb29nbGUgQ2hyb21lXVszNl1cXG5cXG4gICAgVGhhdCdzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJ3Mgbm90aGluZyBzdG9wcGluZyB5b3UgZnJvbSBhZGRpbmcgZGF0YWJhc2UgY2FsbHMgdG8gZmV0Y2ggYml0cyBhbmQgcGllY2VzIG9mIHRoZSBtb2RlbCBiZWZvcmUgaW52b2tpbmcgYG5leHRgIHRvIHJlbmRlciB0aGUgdmlldy5cXG5cXG4gICAgVGhlbiB0aGVyZSdzIGFsc28gdGhlIGNsaWVudC1zaWRlIGFzcGVjdCBvZiBzZXR0aW5nIHVwIFRhdW51cy4gTGV0J3Mgc2V0IGl0IHVwIGFuZCBzZWUgaG93IGl0IG9wZW5zIHVwIG91ciBwb3NzaWJpbGl0aWVzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRhdW51cyBpbiB0aGUgY2xpZW50XFxuXFxuICAgIFlvdSBhbHJlYWR5IGtub3cgaG93IHRvIHNldCB1cCB0aGUgYmFzaWNzIGZvciBzZXJ2ZXItc2lkZSByZW5kZXJpbmcsIGFuZCB5b3Uga25vdyB0aGF0IHlvdSBzaG91bGQgW2NoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSB0byBnZXQgYSBtb3JlIHRob3JvdWdoIHVuZGVyc3RhbmRpbmcgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2Ugb24gVGF1bnVzLCBhbmQgd2hhdCBpdCBlbmFibGVzIHlvdSB0byBkby5cXG5cXG4gICAgVGhlIHdheSBUYXVudXMgd29ya3Mgb24gdGhlIGNsaWVudC1zaWRlIGlzIHNvIHRoYXQgb25jZSB5b3Ugc2V0IGl0IHVwLCBpdCB3aWxsIGhpamFjayBsaW5rIGNsaWNrcyBhbmQgdXNlIEFKQVggdG8gZmV0Y2ggbW9kZWxzIGFuZCByZW5kZXIgdGhvc2Ugdmlld3MgaW4gdGhlIGNsaWVudC4gSWYgdGhlIEphdmFTY3JpcHQgY29kZSBmYWlscyB0byBsb2FkLCBfb3IgaWYgaXQgaGFzbid0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzXywgdGhlIHJlZ3VsYXIgbGluayB3b3VsZCBiZSBmb2xsb3dlZCBpbnN0ZWFkIGFuZCBubyBoYXJtIHdvdWxkIGJlIHVubGVhc2hlZCB1cG9uIHRoZSBodW1hbiwgZXhjZXB0IHRoZXkgd291bGQgZ2V0IGEgc2xpZ2h0bHkgbGVzcyBmYW5jeSBleHBlcmllbmNlLlxcblxcbiAgICBTZXR0aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBpbnZvbHZlcyBhIGZldyBkaWZmZXJlbnQgc3RlcHMuIEZpcnN0bHksIHdlJ2xsIGhhdmUgdG8gY29tcGlsZSB0aGUgYXBwbGljYXRpb24ncyB3aXJpbmcgXyh0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKV8gaW50byBzb21ldGhpbmcgdGhlIGJyb3dzZXIgdW5kZXJzdGFuZHMuIFRoZW4sIHlvdSdsbCBoYXZlIHRvIG1vdW50IFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUsIHBhc3NpbmcgdGhlIHdpcmluZyBzbyB0aGF0IGl0IGtub3dzIHdoaWNoIHJvdXRlcyBpdCBzaG91bGQgcmVzcG9uZCB0bywgYW5kIHdoaWNoIG90aGVycyBpdCBzaG91bGQgbWVyZWx5IGlnbm9yZS4gT25jZSB0aGF0J3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLlxcblxcbiAgICBBcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UnbGwgbGVhcm4sIHdpbGwgYWxzbyBsZXQgeW91IHJlbmRlciBwYXJ0aWFsIHZpZXdzIHVzaW5nIHRoZSBwb3dlcmZ1bCBUYXVudXMgZW5naW5lLCBsaXN0ZW4gZm9yIGV2ZW50cyB0aGF0IG1heSBvY2N1ciBhdCBrZXkgc3RhZ2VzIG9mIHRoZSB2aWV3LXJlbmRlcmluZyBwcm9jZXNzLCBhbmQgZXZlbiBpbnRlcmNlcHQgQUpBWCByZXF1ZXN0cyBibG9ja2luZyB0aGVtIGJlZm9yZSB0aGV5IGV2ZXIgaGFwcGVuLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBUYXVudXMgQ0xJXFxuXFxuICAgIFRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbid0IGhhdmUgdG8gYHJlcXVpcmVgIGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCBgamFkdW1gIGVhcmxpZXIsIHdlJ2xsIGluc3RhbGwgdGhlIGB0YXVudXNgIENMSSBnbG9iYWxseSBmb3IgdGhlIHNha2Ugb2YgZXhlcmNpc2luZywgYnV0IHdlIHVuZGVyc3RhbmQgdGhhdCByZWx5aW5nIG9uIGdsb2JhbGx5IGluc3RhbGxlZCBtb2R1bGVzIGlzIGluc3VmZmljaWVudCBmb3IgcHJvZHVjdGlvbi1ncmFkZSBhcHBsaWNhdGlvbnMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC0tZ2xvYmFsIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgQmVmb3JlIHlvdSBjYW4gdXNlIHRoZSBDTEksIHlvdSBzaG91bGQgbW92ZSB0aGUgcm91dGUgZGVmaW5pdGlvbnMgdG8gYGNvbnRyb2xsZXJzL3JvdXRlcy5qc2AuIFRoYXQncyB3aGVyZSBUYXVudXMgZXhwZWN0cyB0aGVtIHRvIGJlLiBJZiB5b3Ugd2FudCB0byBwbGFjZSB0aGVtIHNvbWV0aGluZyBlbHNlLCBbdGhlIEFQSSBkb2N1bWVudGF0aW9uIGNhbiBoZWxwIHlvdV1bMThdLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBtdiByb3V0ZXMuanMgY29udHJvbGxlcnMvcm91dGVzLmpzXFxuICAgIGBgYFxcblxcbiAgICBTaW5jZSB5b3UgbW92ZWQgdGhlIHJvdXRlcyB5b3Ugc2hvdWxkIGFsc28gdXBkYXRlIHRoZSBgcmVxdWlyZWAgc3RhdGVtZW50IGluIHRoZSBgYXBwLmpzYCBtb2R1bGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xcbiAgICB2YXIgb3B0aW9ucyA9IHtcXG4gICAgICByb3V0ZXM6IHJlcXVpcmUoJy4vY29udHJvbGxlcnMvcm91dGVzJyksXFxuICAgICAgbGF5b3V0OiByZXF1aXJlKCcuLy5iaW4vdmlld3MvbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBUaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0J2xsIHByaW50IG91dCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGlmIHlvdSB3YW50IHRvIHBlcnNpc3QgaXQgeW91IHNob3VsZCBwcm92aWRlIHRoZSBgLS1vdXRwdXRgIGZsYWcuIEluIHR5cGljYWwgW2NvbnZlbnRpb24tb3Zlci1jb25maWd1cmF0aW9uXVs4XSBmYXNoaW9uLCB0aGUgQ0xJIHdpbGwgZGVmYXVsdCB0byBpbmZlcnJpbmcgeW91ciB2aWV3cyBhcmUgbG9jYXRlZCBpbiBgLmJpbi92aWV3c2AgYW5kIHRoYXQgeW91IHdhbnQgdGhlIHdpcmluZyBtb2R1bGUgdG8gYmUgcGxhY2VkIGluIGAuYmluL3dpcmluZy5qc2AsIGJ1dCB5b3UnbGwgYmUgYWJsZSB0byBjaGFuZ2UgdGhhdCBpZiBpdCBkb2Vzbid0IG1lZXQgeW91ciBuZWVkcy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0XFxuICAgIGBgYFxcblxcbiAgICBBdCB0aGlzIHBvaW50IGluIG91ciBleGFtcGxlLCB0aGUgQ0xJIHNob3VsZCBjcmVhdGUgYSBgLmJpbi93aXJpbmcuanNgIGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIGB0YXVudXNgIGlzIGFuIGF1dG9tYXRlZCBjb2RlLWdlbmVyYXRpb24gdG9vbCwgaXQncyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGVtcGxhdGVzID0ge1xcbiAgICAgICdob21lL2luZGV4JzogcmVxdWlyZSgnLi92aWV3cy9ob21lL2luZGV4LmpzJyksXFxuICAgICAgJ2xheW91dCc6IHJlcXVpcmUoJy4vdmlld3MvbGF5b3V0LmpzJylcXG4gICAgfTtcXG5cXG4gICAgdmFyIGNvbnRyb2xsZXJzID0ge1xcbiAgICB9O1xcblxcbiAgICB2YXIgcm91dGVzID0ge1xcbiAgICAgICcvJzoge1xcbiAgICAgICAgYWN0aW9uOiAnaG9tZS9pbmRleCdcXG4gICAgICB9XFxuICAgIH07XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0ge1xcbiAgICAgIHRlbXBsYXRlczogdGVtcGxhdGVzLFxcbiAgICAgIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gICAgICByb3V0ZXM6IHJvdXRlc1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYHRhdW51c2Agb3V0cHV0XVszN11cXG5cXG4gICAgTm90ZSB0aGF0IHRoZSBgY29udHJvbGxlcnNgIG9iamVjdCBpcyBlbXB0eSBiZWNhdXNlIHlvdSBoYXZlbid0IGNyZWF0ZWQgYW55IF9jbGllbnQtc2lkZSBjb250cm9sbGVyc18geWV0LiBXZSBjcmVhdGVkIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIGJ1dCB0aG9zZSBkb24ndCBoYXZlIGFueSBlZmZlY3QgaW4gdGhlIGNsaWVudC1zaWRlLCBiZXNpZGVzIGRldGVybWluaW5nIHdoYXQgZ2V0cyBzZW50IHRvIHRoZSBjbGllbnQuXFxuXFxuICAgIFRoZSBDTEkgY2FuIGJlIGVudGlyZWx5IGlnbm9yZWQsIHlvdSBjb3VsZCB3cml0ZSB0aGVzZSBkZWZpbml0aW9ucyBieSB5b3Vyc2VsZiwgYnV0IHlvdSB3b3VsZCBoYXZlIHRvIHJlbWVtYmVyIHRvIHVwZGF0ZSB0aGlzIGZpbGUgd2hlbmV2ZXIgeW91IGFkZCwgY2hhbmdlLCBvciByZW1vdmUgYSB2aWV3LCBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIsIG9yIGEgcm91dGUuIERvaW5nIHRoYXQgd291bGQgYmUgY3VtYmVyc29tZSwgYW5kIHRoZSBDTEkgc29sdmVzIHRoYXQgcHJvYmxlbSBmb3IgdXMgYXQgdGhlIGV4cGVuc2Ugb2Ygb25lIGFkZGl0aW9uYWwgYnVpbGQgc3RlcC5cXG5cXG4gICAgRHVyaW5nIGRldmVsb3BtZW50LCB5b3UgY2FuIGFsc28gYWRkIHRoZSBgLS13YXRjaGAgZmxhZywgd2hpY2ggd2lsbCByZWJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIGlmIGEgcmVsZXZhbnQgZmlsZSBjaGFuZ2VzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXQgLS13YXRjaFxcbiAgICBgYGBcXG5cXG4gICAgSWYgeW91J3JlIHVzaW5nIEhhcGkgaW5zdGVhZCBvZiBFeHByZXNzLCB5b3UnbGwgYWxzbyBuZWVkIHRvIHBhc3MgaW4gdGhlIGBoYXBpaWZ5YCB0cmFuc2Zvcm0gc28gdGhhdCByb3V0ZXMgZ2V0IGNvbnZlcnRlZCBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGluZyBtb2R1bGUgdW5kZXJzdGFuZC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0IC0tdHJhbnNmb3JtIGhhcGlpZnlcXG4gICAgYGBgXFxuXFxuICAgIE5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBCb290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJcXG5cXG4gICAgT25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIGBjbGllbnQvanNgIHRvIGtlZXAgYWxsIG9mIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdCBsb2dpYywgYnV0IHRoYXQgaXMgdXAgdG8geW91IHRvby4gRm9yIHRoZSBzYWtlIG9mIHRoaXMgZ3VpZGUsIGxldCdzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgY2xpZW50L2pzXFxuICAgIHRvdWNoIGNsaWVudC9qcy9tYWluLmpzXFxuICAgIGBgYFxcblxcbiAgICBUaGUgYG1haW5gIG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIF9lbnRyeSBwb2ludF8gb2YgeW91ciBhcHBsaWNhdGlvbiBvbiB0aGUgY2xpZW50LXNpZGUuIEhlcmUgeW91J2xsIG5lZWQgdG8gaW1wb3J0IGB0YXVudXNgLCB0aGUgd2lyaW5nIG1vZHVsZSB3ZSd2ZSBqdXN0IGJ1aWx0LCBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIERPTSBlbGVtZW50IHdoZXJlIHlvdSBhcmUgcmVuZGVyaW5nIHlvdXIgcGFydGlhbCB2aWV3cy4gT25jZSB5b3UgaGF2ZSBhbGwgdGhhdCwgeW91IGNhbiBpbnZva2UgYHRhdW51cy5tb3VudGAuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcXG4gICAgdmFyIG1haW4gPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbWFpbicpWzBdO1xcblxcbiAgICB0YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBtb3VudHBvaW50IHdpbGwgc2V0IHVwIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgcm91dGVyIGFuZCBmaXJlIHRoZSBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXIgZm9yIHRoZSB2aWV3IHRoYXQgaGFzIGJlZW4gcmVuZGVyZWQgaW4gdGhlIHNlcnZlci1zaWRlLiBXaGVuZXZlciBhbiBhbmNob3IgbGluayBpcyBjbGlja2VkLCBUYXVudXMgd2lsbCBiZSBhYmxlIHRvIGhpamFjayB0aGF0IGNsaWNrIGFuZCByZXF1ZXN0IHRoZSBtb2RlbCB1c2luZyBBSkFYLCBidXQgb25seSBpZiBpdCBtYXRjaGVzIGEgdmlldyByb3V0ZS4gT3RoZXJ3aXNlIHRoZSBsaW5rIHdpbGwgYmVoYXZlIGp1c3QgbGlrZSBhbnkgbm9ybWFsIGxpbmsgd291bGQuXFxuXFxuICAgIEJ5IGRlZmF1bHQsIHRoZSBtb3VudHBvaW50IHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldy4gVGhpcyBpcyBha2luIHRvIHdoYXQgZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBmcmFtZXdvcmtzIHN1Y2ggYXMgQW5ndWxhckpTIGRvLCB3aGVyZSB2aWV3cyBhcmUgb25seSByZW5kZXJlZCBhZnRlciBhbGwgdGhlIEphdmFTY3JpcHQgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBhbmQgZXhlY3V0ZWQuIEV4Y2VwdCBUYXVudXMgcHJvdmlkZXMgaHVtYW4tcmVhZGFibGUgY29udGVudCBmYXN0ZXIsIGJlZm9yZSB0aGUgSmF2YVNjcmlwdCBldmVuIGJlZ2lucyBkb3dubG9hZGluZywgYWx0aG91Z2ggaXQgd29uJ3QgYmUgZnVuY3Rpb25hbCB1bnRpbCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlciBydW5zLlxcblxcbiAgICBBbiBhbHRlcm5hdGl2ZSBpcyB0byBpbmxpbmUgdGhlIHZpZXcgbW9kZWwgYWxvbmdzaWRlIHRoZSB2aWV3cyBpbiBhIGA8c2NyaXB0IHR5cGU9J3RleHQvdGF1bnVzJz5gIHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIF90eXBpY2FsbHkgbGFyZ2VyXyB0aGFuIHRoZSByZXN1bHRpbmcgdmlld3MpLlxcblxcbiAgICBBIHRoaXJkIHN0cmF0ZWd5IGlzIHRoYXQgeW91IHJlcXVlc3QgdGhlIG1vZGVsIGFzeW5jaHJvbm91c2x5IG91dHNpZGUgb2YgVGF1bnVzLCBhbGxvd2luZyB5b3UgdG8gZmV0Y2ggYm90aCB0aGUgdmlldyBtb2RlbCBhbmQgVGF1bnVzIGl0c2VsZiBjb25jdXJyZW50bHksIGJ1dCB0aGF0J3MgaGFyZGVyIHRvIHNldCB1cC5cXG5cXG4gICAgVGhlIHRocmVlIGJvb3Rpbmcgc3RyYXRlZ2llcyBhcmUgZXhwbGFpbmVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XSBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gW3RoZSBvcHRpbWl6YXRpb24gZ3VpZGVdWzI1XS4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgXyhgJ2F1dG8nYClfIHNob3VsZCBzdWZmaWNlLiBJdCBmZXRjaGVzIHRoZSB2aWV3IG1vZGVsIHVzaW5nIGFuIEFKQVggcmVxdWVzdCByaWdodCBhZnRlciBUYXVudXMgbG9hZHMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQWRkaW5nIGZ1bmN0aW9uYWxpdHkgaW4gYSBjbGllbnQtc2lkZSBjb250cm9sbGVyXFxuXFxuICAgIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIHJ1biB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQsIGV2ZW4gaWYgaXQncyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgYG1vZGVsYCwgY29udGFpbmluZyB0aGUgbW9kZWwgdGhhdCB3YXMgdXNlZCB0byByZW5kZXIgdGhlIHZpZXc7IHRoZSBgcm91dGVgLCBicm9rZW4gZG93biBpbnRvIGl0cyBjb21wb25lbnRzOyBhbmQgdGhlIGBjb250YWluZXJgLCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by5cXG5cXG4gICAgVGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSdyZSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2luZyB0aGUgYXBwbGljYXRpb246IGl0IG1pZ2h0IG5vdCBldmVuIGJlIG5lY2Vzc2FyeSEgTGV0J3MgYWRkIHNvbWUgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byB0aGUgZXhhbXBsZSB3ZSd2ZSBiZWVuIGJ1aWxkaW5nLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZVxcbiAgICB0b3VjaCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qc1xcbiAgICBgYGBcXG5cXG4gICAgR3Vlc3Mgd2hhdD8gVGhlIGNvbnRyb2xsZXIgc2hvdWxkIGJlIGEgbW9kdWxlIHdoaWNoIGV4cG9ydHMgYSBmdW5jdGlvbi4gVGhhdCBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aGVuZXZlciB0aGUgdmlldyBpcyByZW5kZXJlZC4gRm9yIHRoZSBzYWtlIG9mIHNpbXBsaWNpdHkgd2UnbGwganVzdCBwcmludCB0aGUgYWN0aW9uIGFuZCB0aGUgbW9kZWwgdG8gdGhlIGNvbnNvbGUuIElmIHRoZXJlJ3Mgb25lIHBsYWNlIHdoZXJlIHlvdSdkIHdhbnQgdG8gZW5oYW5jZSB0aGUgZXhwZXJpZW5jZSwgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIHdoZXJlIHlvdSB3YW50IHRvIHB1dCB5b3VyIGNvZGUuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwsIGNvbnRhaW5lciwgcm91dGUpIHtcXG4gICAgICBjb25zb2xlLmxvZygnUmVuZGVyZWQgdmlldyAlcyB1c2luZyBtb2RlbDpcXFxcbiVzJywgcm91dGUuYWN0aW9uLCBKU09OLnN0cmluZ2lmeShtb2RlbCwgbnVsbCwgMikpO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgU2luY2Ugd2Ugd2VyZW4ndCB1c2luZyB0aGUgYC0td2F0Y2hgIGZsYWcgZnJvbSB0aGUgVGF1bnVzIENMSSwgeW91J2xsIGhhdmUgdG8gcmVjb21waWxlIHRoZSB3aXJpbmcgYXQgdGhpcyBwb2ludCwgc28gdGhhdCB0aGUgY29udHJvbGxlciBnZXRzIGFkZGVkIHRvIHRoYXQgbWFuaWZlc3QuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dFxcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCB5b3UnbGwgbm93IGhhdmUgdG8gd2lyZSB1cCB0aGUgY2xpZW50LXNpZGUgSmF2YVNjcmlwdCB1c2luZyBbQnJvd3NlcmlmeV1bMzhdIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHRcXG5cXG4gICAgWW91J2xsIG5lZWQgdG8gY29tcGlsZSB0aGUgYGNsaWVudC9qcy9tYWluLmpzYCBtb2R1bGUsIG91ciBjbGllbnQtc2lkZSBhcHBsaWNhdGlvbidzIGVudHJ5IHBvaW50LCB1c2luZyBCcm93c2VyaWZ5IHNpbmNlIHRoZSBjb2RlIGlzIHdyaXR0ZW4gdXNpbmcgQ29tbW9uSlMuIEluIHRoaXMgZXhhbXBsZSB5b3UnbGwgaW5zdGFsbCBgYnJvd3NlcmlmeWAgZ2xvYmFsbHkgdG8gY29tcGlsZSB0aGUgY29kZSwgYnV0IG5hdHVyYWxseSB5b3UnbGwgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4gd29ya2luZyBvbiBhIHJlYWwtd29ybGQgYXBwbGljYXRpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC0tZ2xvYmFsIGJyb3dzZXJpZnlcXG4gICAgYGBgXFxuXFxuICAgIE9uY2UgeW91IGhhdmUgdGhlIEJyb3dzZXJpZnkgQ0xJLCB5b3UnbGwgYmUgYWJsZSB0byBjb21waWxlIHRoZSBjb2RlIHJpZ2h0IGZyb20geW91ciBjb21tYW5kIGxpbmUuIFRoZSBgLWRgIGZsYWcgdGVsbHMgQnJvd3NlcmlmeSB0byBhZGQgYW4gaW5saW5lIHNvdXJjZSBtYXAgaW50byB0aGUgY29tcGlsZWQgYnVuZGxlLCBtYWtpbmcgZGVidWdnaW5nIGVhc2llciBmb3IgdXMuIFRoZSBgLW9gIGZsYWcgcmVkaXJlY3RzIG91dHB1dCB0byB0aGUgaW5kaWNhdGVkIGZpbGUsIHdoZXJlYXMgdGhlIG91dHB1dCBpcyBwcmludGVkIHRvIHN0YW5kYXJkIG91dHB1dCBieSBkZWZhdWx0LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCAuYmluL3B1YmxpYy9qc1xcbiAgICBicm93c2VyaWZ5IGNsaWVudC9qcy9tYWluLmpzIC1kbyAuYmluL3B1YmxpYy9qcy9hbGwuanNcXG4gICAgYGBgXFxuXFxuICAgIFdlIGhhdmVuJ3QgZG9uZSBtdWNoIG9mIGFueXRoaW5nIHdpdGggdGhlIEV4cHJlc3MgYXBwbGljYXRpb24sIHNvIHlvdSdsbCBuZWVkIHRvIGFkanVzdCB0aGUgYGFwcC5qc2AgbW9kdWxlIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMuIElmIHlvdSdyZSB1c2VkIHRvIEV4cHJlc3MsIHlvdSdsbCBub3RpY2UgdGhlcmUncyBub3RoaW5nIHNwZWNpYWwgYWJvdXQgaG93IHdlJ3JlIHVzaW5nIGBzZXJ2ZS1zdGF0aWNgLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCAtLXNhdmUgc2VydmUtc3RhdGljXFxuICAgIGBgYFxcblxcbiAgICBMZXQncyBjb25maWd1cmUgdGhlIGFwcGxpY2F0aW9uIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMgZnJvbSBgLmJpbi9wdWJsaWNgLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIHNlcnZlU3RhdGljID0gcmVxdWlyZSgnc2VydmUtc3RhdGljJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9jb250cm9sbGVycy9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vLmJpbi92aWV3cy9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICBhcHAudXNlKHNlcnZlU3RhdGljKCcuYmluL3B1YmxpYycpKTtcXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBOZXh0IHVwLCB5b3UnbGwgaGF2ZSB0byBlZGl0IHRoZSBsYXlvdXQgdG8gaW5jbHVkZSB0aGUgY29tcGlsZWQgSmF2YVNjcmlwdCBidW5kbGUgZmlsZS5cXG5cXG4gICAgYGBgamFkZVxcbiAgICB0aXRsZT1tb2RlbC50aXRsZVxcbiAgICBtYWluIT1wYXJ0aWFsXFxuICAgIHNjcmlwdChzcmM9Jy9qcy9hbGwuanMnKVxcbiAgICBgYGBcXG5cXG4gICAgTGFzdGx5LCB5b3UgY2FuIGV4ZWN1dGUgdGhlIGFwcGxpY2F0aW9uIGFuZCBzZWUgaXQgaW4gYWN0aW9uIVxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzM5XVxcblxcbiAgICBJZiB5b3Ugb3BlbiB0aGUgYXBwbGljYXRpb24gb24gYSB3ZWIgYnJvd3NlciwgeW91J2xsIG5vdGljZSB0aGF0IHRoZSBhcHByb3ByaWF0ZSBpbmZvcm1hdGlvbiB3aWxsIGJlIGxvZ2dlZCBpbnRvIHRoZSBkZXZlbG9wZXIgYGNvbnNvbGVgLlxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCB0aGUgYXBwbGljYXRpb24gcnVubmluZyB1bmRlciBHb29nbGUgQ2hyb21lXVs0MF1cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBVc2luZyB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIEFQSVxcblxcbiAgICBUYXVudXMgZG9lcyBwcm92aWRlIFthIHRoaW4gQVBJXVsxOF0gaW4gdGhlIGNsaWVudC1zaWRlLiBVc2FnZSBvZiB0aGF0IEFQSSBiZWxvbmdzIG1vc3RseSBpbnNpZGUgdGhlIGJvZHkgb2YgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVycywgYnV0IHRoZXJlJ3MgYSBmZXcgbWV0aG9kcyB5b3UgY2FuIHRha2UgYWR2YW50YWdlIG9mIG9uIGEgZ2xvYmFsIHNjYWxlIGFzIHdlbGwuXFxuXFxuICAgIFRhdW51cyBjYW4gbm90aWZ5IHlvdSB3aGVuZXZlciBpbXBvcnRhbnQgZXZlbnRzIG9jY3VyLlxcblxcbiAgICBFdmVudCAgICAgICAgICAgIHwgQXJndW1lbnRzICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgJ3N0YXJ0J2AgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2ZldGNoLnN0YXJ0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy5cXG4gICAgYCdmZXRjaC5kb25lJ2AgICB8ICBgcm91dGUsIGNvbnRleHQsIGRhdGFgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS5cXG4gICAgYCdmZXRjaC5hYm9ydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC5cXG4gICAgYCdmZXRjaC5lcnJvcidgICB8ICBgcm91dGUsIGNvbnRleHQsIGVycmAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuXFxuXFxuICAgIEJlc2lkZXMgZXZlbnRzLCB0aGVyZSdzIGEgY291cGxlIG1vcmUgbWV0aG9kcyB5b3UgY2FuIHVzZS4gVGhlIGB0YXVudXMubmF2aWdhdGVgIG1ldGhvZCBhbGxvd3MgeW91IHRvIG5hdmlnYXRlIHRvIGEgVVJMIHdpdGhvdXQgdGhlIG5lZWQgZm9yIGEgaHVtYW4gdG8gY2xpY2sgb24gYW4gYW5jaG9yIGxpbmsuIFRoZW4gdGhlcmUncyBgdGF1bnVzLnBhcnRpYWxgLCBhbmQgdGhhdCBhbGxvd3MgeW91IHRvIHJlbmRlciBhbnkgcGFydGlhbCB2aWV3IG9uIGEgRE9NIGVsZW1lbnQgb2YgeW91ciBjaG9vc2luZywgYW5kIGl0J2xsIHRoZW4gaW52b2tlIGl0cyBjb250cm9sbGVyLiBZb3UnbGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guXFxuXFxuICAgIEFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIFt0aGUgQVBJIGRvY3VtZW50YXRpb25dWzE4XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBDYWNoaW5nIGFuZCBQcmVmZXRjaGluZ1xcblxcbiAgICBbUGVyZm9ybWFuY2VdWzI1XSBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQncyB3aHkgdGhlIHlvdSBjYW4gcGVyZm9ybSBjYWNoaW5nIGFuZCBwcmVmZXRjaGluZyBvbiB0aGUgY2xpZW50LXNpZGUganVzdCBieSB0dXJuaW5nIG9uIGEgcGFpciBvZiBmbGFncy4gQnV0IHdoYXQgZG8gdGhlc2UgZmxhZ3MgZG8gZXhhY3RseT9cXG5cXG4gICAgV2hlbiB0dXJuZWQgb24sIGJ5IHBhc3NpbmcgYHsgY2FjaGU6IHRydWUgfWAgYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgYHRhdW51cy5tb3VudGAsIHRoZSBjYWNoaW5nIGxheWVyIHdpbGwgbWFrZSBzdXJlIHRoYXQgcmVzcG9uc2VzIGFyZSBrZXB0IGFyb3VuZCBmb3IgYDE1YCBzZWNvbmRzLiBXaGVuZXZlciBhIHJvdXRlIG5lZWRzIGEgbW9kZWwgaW4gb3JkZXIgdG8gcmVuZGVyIGEgdmlldywgaXQnbGwgZmlyc3QgYXNrIHRoZSBjYWNoaW5nIGxheWVyIGZvciBhIGZyZXNoIGNvcHkuIElmIHRoZSBjYWNoaW5nIGxheWVyIGRvZXNuJ3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSBfKGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiBgMTVgIHNlY29uZHMpXywgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyIGluIHNlY29uZHMgaW5zdGVhZCBvZiBqdXN0IGB0cnVlYC5cXG5cXG4gICAgU2luY2UgVGF1bnVzIHVuZGVyc3RhbmRzIHRoYXQgbm90IGV2ZXJ5IHZpZXcgb3BlcmF0ZXMgdW5kZXIgdGhlIHNhbWUgY29uc3RyYWludHMsIHlvdSdyZSBhbHNvIGFibGUgdG8gc2V0IGEgYGNhY2hlYCBmcmVzaG5lc3MgZHVyYXRpb24gZGlyZWN0bHkgaW4geW91ciByb3V0ZXMuIFRoZSBgY2FjaGVgIHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLlxcblxcbiAgICBUaGVyZSdzIGN1cnJlbnRseSB0d28gY2FjaGluZyBzdG9yZXM6IGEgcmF3IGluLW1lbW9yeSBzdG9yZSwgYW5kIGFuIFtJbmRleGVkREJdWzI4XSBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIGBsb2NhbFN0b3JhZ2VgLiBJdCBoYXMgW3N1cnByaXNpbmdseSBicm9hZCBicm93c2VyIHN1cHBvcnRdWzI5XSwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCdzIG5vdCBzdXBwb3J0ZWQgdGhlbiBjYWNoaW5nIGlzIGRvbmUgc29sZWx5IGluLW1lbW9yeS5cXG5cXG4gICAgVGhlIHByZWZldGNoaW5nIG1lY2hhbmlzbSBpcyBhbiBpbnRlcmVzdGluZyBzcGluLW9mZiBvZiBjYWNoaW5nLCBhbmQgaXQgcmVxdWlyZXMgY2FjaGluZyB0byBiZSBlbmFibGVkIGluIG9yZGVyIHRvIHdvcmsuIFdoZW5ldmVyIGh1bWFucyBob3ZlciBvdmVyIGEgbGluaywgb3Igd2hlbmV2ZXIgdGhleSBwdXQgdGhlaXIgZmluZ2VyIG9uIG9uZSBvZiB0aGVtIF8odGhlIGB0b3VjaHN0YXJ0YCBldmVudClfLCB0aGUgcHJlZmV0Y2hlciB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgZm9yIHRoYXQgbGluay5cXG5cXG4gICAgSWYgdGhlIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkgdGhlbiB0aGUgcmVzcG9uc2Ugd2lsbCBiZSBjYWNoZWQgaW4gdGhlIHNhbWUgd2F5IGFueSBvdGhlciB2aWV3IHdvdWxkIGJlIGNhY2hlZC4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGFub3RoZXIgbGluayB3aGlsZSB0aGUgcHJldmlvdXMgb25lIGlzIHN0aWxsIGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhlIG9sZCByZXF1ZXN0IGlzIGFib3J0ZWQsIGFzIG5vdCB0byBkcmFpbiB0aGVpciBfKHBvc3NpYmx5IGxpbWl0ZWQpXyBJbnRlcm5ldCBjb25uZWN0aW9uIGJhbmR3aWR0aC5cXG5cXG4gICAgSWYgdGhlIGh1bWFuIGNsaWNrcyBvbiB0aGUgbGluayBiZWZvcmUgcHJlZmV0Y2hpbmcgaXMgY29tcGxldGVkLCBoZSdsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuXFxuXFxuICAgIFR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgYHByZWZldGNoYCB0byBgdHJ1ZWAgaW4gdGhlIG9wdGlvbnMgcGFzc2VkIHRvIGB0YXVudXMubW91bnRgLiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSBbUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uc11bMjVdIGd1aWRlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIFRoZSBza3kgaXMgdGhlIGxpbWl0IVxcblxcbiAgICBZb3UncmUgbm93IGZhbWlsaWFyIHdpdGggaG93IFRhdW51cyB3b3JrcyBvbiBhIGhpZ2gtbGV2ZWwuIFlvdSBoYXZlIGNvdmVyZWQgYSBkZWNlbnQgYW1vdW50IG9mIGdyb3VuZCwgYnV0IHlvdSBzaG91bGRuJ3Qgc3RvcCB0aGVyZS5cXG5cXG4gICAgLSBMZWFybiBtb3JlIGFib3V0IFt0aGUgQVBJIFRhdW51cyBoYXNdWzE4XSB0byBvZmZlclxcbiAgICAtIEdvIHRocm91Z2ggdGhlIFtwZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gdGlwc11bMjVdLiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchXFxuICAgIC0gX0ZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnRfXFxuICAgICAgLSBKZXJlbXkgS2VpdGggZW51bmNpYXRlcyBbXFxcIkJlIHByb2dyZXNzaXZlXFxcIl1bMjBdXFxuICAgICAgLSBDaHJpc3RpYW4gSGVpbG1hbm4gYWR2b2NhdGVzIGZvciBbXFxcIlByYWdtYXRpYyBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudFxcXCJdWzI2XVxcbiAgICAgIC0gSmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IFtcXFwiUHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgaXMgZmFzdGVyXFxcIl1bMjJdXFxuICAgICAgLSBJIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCBbXFxcIlN0b3AgQnJlYWtpbmcgdGhlIFdlYlxcXCJdWzE3XVxcbiAgICAgIC0gR3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgW1xcXCI3IFByaW5jaXBsZXMgb2YgUmljaCBXZWIgQXBwbGljYXRpb25zXFxcIl1bMjRdXFxuICAgICAgLSBBYXJvbiBHdXN0YWZzb24gd3JpdGVzIFtcXFwiVW5kZXJzdGFuZGluZyBQcm9ncmVzc2l2ZSBFbmhhbmNlbWVudFxcXCJdWzIxXVxcbiAgICAgIC0gT3JkZSBTYXVuZGVycyBnaXZlcyBoaXMgcG9pbnQgb2YgdmlldyBpbiBbXFxcIlByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGZvciBmYXVsdCB0b2xlcmFuY2VcXFwiXVsyM11cXG4gICAgLSBTaWZ0IHRocm91Z2ggdGhlIFtjb21wbGVtZW50YXJ5IG1vZHVsZXNdWzE1XS4gWW91IG1heSBmaW5kIHNvbWV0aGluZyB5b3UgaGFkbid0IHRob3VnaHQgb2YhXFxuXFxuICAgIEFsc28sIGdldCBpbnZvbHZlZCFcXG5cXG4gICAgLSBGb3JrIHRoaXMgcmVwb3NpdG9yeSBhbmQgW3NlbmQgc29tZSBwdWxsIHJlcXVlc3RzXVsxOV0gdG8gaW1wcm92ZSB0aGVzZSBndWlkZXMhXFxuICAgIC0gU2VlIHNvbWV0aGluZywgc2F5IHNvbWV0aGluZyEgSWYgeW91IGRldGVjdCBhIGJ1ZywgW3BsZWFzZSBjcmVhdGUgYW4gaXNzdWVdWzI3XSFcXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgPiBZb3UnbGwgZmluZCBhIFtmdWxsIGZsZWRnZWQgdmVyc2lvbiBvZiB0aGUgR2V0dGluZyBTdGFydGVkXVs0MV0gdHV0b3JpYWwgYXBwbGljYXRpb24gb24gR2l0SHViLlxcblxcbiAgICBbMV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzJdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFszXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vXFxuICAgIFs2XTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzddOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbOF06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG4gICAgWzldOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1J1Ynlfb25fUmFpbHNcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXG4gICAgWzExXTogaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxuICAgIFsxMl06IGh0dHA6Ly9tb3ppbGxhLmdpdGh1Yi5pby9udW5qdWNrcy9cXG4gICAgWzEzXTogaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxuICAgIFsxNF06IGh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxuICAgIFsxNV06IC9jb21wbGVtZW50c1xcbiAgICBbMTZdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvamFkdW1cXG4gICAgWzE3XTogaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcbiAgICBbMThdOiAvYXBpXFxuICAgIFsxOV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvL3B1bGxzXFxuICAgIFsyMF06IGh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxuICAgIFsyMV06IGh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxuICAgIFsyMl06IGh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXG4gICAgWzIzXTogaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcbiAgICBbMjRdOiBodHRwOi8vcmF1Y2hnLmNvbS8yMDE0LzctcHJpbmNpcGxlcy1vZi1yaWNoLXdlYi1hcHBsaWNhdGlvbnMvXFxuICAgIFsyNV06IC9wZXJmb3JtYW5jZVxcbiAgICBbMjZdOiBodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcbiAgICBbMjddOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxuICAgIFsyOF06IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxuICAgIFsyOV06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXG4gICAgWzMwXTogaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxuICAgIFszMV06IGh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcbiAgICBbMzJdOiBodHRwOi8vaS5pbWd1ci5jb20vMDhsbkNlYy5wbmdcXG4gICAgWzMzXTogaHR0cDovL2kuaW1ndXIuY29tL3dVYm5DeWsucG5nXFxuICAgIFszNF06IGh0dHA6Ly9pLmltZ3VyLmNvbS96amFKWUNxLnBuZ1xcbiAgICBbMzVdOiBodHRwOi8vaS5pbWd1ci5jb20vTnZFV3g5ei5wbmdcXG4gICAgWzM2XTogaHR0cDovL2kuaW1ndXIuY29tL0xnWlJGbjUucG5nXFxuICAgIFszN106IGh0dHA6Ly9pLmltZ3VyLmNvbS9mSm5IZFlpLnBuZ1xcbiAgICBbMzhdOiBodHRwOi8vYnJvd3NlcmlmeS5vcmcvXFxuICAgIFszOV06IGh0dHA6Ly9pLmltZ3VyLmNvbS82OE84NHdYLnBuZ1xcbiAgICBbNDBdOiBodHRwOi8vaS5pbWd1ci5jb20vWlVGNk5GbC5wbmdcXG4gICAgWzQxXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9nZXR0aW5nLXN0YXJ0ZWRcXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGVyZm9ybWFuY2UobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwicGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxcIj5QZXJmb3JtYW5jZSBPcHRpbWl6YXRpb248L2gxPlxcbjxwPkZvbzwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcblxcbiAgICBGb29cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbm90Rm91bmQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIk5vdCBGb3VuZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiXFxcIiB0YXJnZXQ9XFxcIl9ibGFua1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiJm1kYXNoOyBAbnpnYlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9wPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcImgxIE5vdCBGb3VuZFxcblxcbnAgVGhlcmUgZG9lc24ndCBzZWVtIHRvIGJlIGFueXRoaW5nIGhlcmUgeWV0LiBJZiB5b3UgYmVsaWV2ZSB0aGlzIHRvIGJlIGEgbWlzdGFrZSwgcGxlYXNlIGxldCB1cyBrbm93IVxcbnBcXG4gIGEoaHJlZj0naHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiJywgdGFyZ2V0PSdfYmxhbmsnKSAmbWRhc2g7IEBuemdiXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxheW91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCwgbW9kZWwsIHBhcnRpYWwpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPCFET0NUWVBFIGh0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aHRtbCBsYW5nPVxcXCJlblxcXCIgaXRlbXNjb3BlIGl0ZW10eXBlPVxcXCJodHRwOi8vc2NoZW1hLm9yZy9CbG9nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHRpdGxlPlwiICsgKGphZGUuZXNjYXBlKG51bGwgPT0gKGphZGVfaW50ZXJwID0gbW9kZWwudGl0bGUpID8gXCJcIiA6IGphZGVfaW50ZXJwKSkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3RpdGxlPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgY2hhcnNldD1cXFwidXRmLThcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzaG9ydGN1dCBpY29uXFxcIiBocmVmPVxcXCIvZmF2aWNvbi5pY29cXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgaHR0cC1lcXVpdj1cXFwiWC1VQS1Db21wYXRpYmxlXFxcIiBjb250ZW50PVxcXCJJRT1lZGdlLGNocm9tZT0xXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIG5hbWU9XFxcInZpZXdwb3J0XFxcIiBjb250ZW50PVxcXCJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCIvY3NzL2FsbC5jc3NcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic3R5bGVzaGVldFxcXCIgdHlwZT1cXFwidGV4dC9jc3NcXFwiIGhyZWY9XFxcImh0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDBcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxib2R5IGlkPVxcXCJ0b3BcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9cXFwiIGFyaWEtbGFiZWw9XFxcIkdvIHRvIGhvbWVcXFwiIGNsYXNzPVxcXCJseS10aXRsZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRhdW51c1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDIgY2xhc3M9XFxcImx5LXN1YmhlYWRpbmdcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJNaWNybyBJc29tb3JwaGljIE1WQyBFbmdpbmUgZm9yIE5vZGUuanNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2hlYWRlcj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YXNpZGUgY2xhc3M9XFxcInNiLXNpZGViYXJcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxuYXYgY2xhc3M9XFxcInNiLWNvbnRhaW5lclxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHVsIGNsYXNzPVxcXCJudi1pdGVtc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQWJvdXRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiR2V0dGluZyBTdGFydGVkXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2FwaVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFQSSBEb2N1bWVudGF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI4LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ29tcGxlbWVudGFyeSBNb2R1bGVzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMwLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3NvdXJjZS1jb2RlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiU291cmNlIENvZGVcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvY2hhbmdlbG9nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ2hhbmdlbG9nXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC91bD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbmF2PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hc2lkZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWFpbiBpZD1cXFwiYXBwbGljYXRpb24tcm9vdFxcXCIgZGF0YS10YXVudXM9XFxcIm1vZGVsXFxcIiBjbGFzcz1cXFwibHktbWFpblxcXCI+XCIgKyAobnVsbCA9PSAoamFkZV9pbnRlcnAgPSBwYXJ0aWFsKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L21haW4+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNjcmlwdCBzcmM9XFxcIi9qcy9hbGwuanNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zY3JpcHQ+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2JvZHk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2h0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCxcIm1vZGVsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5tb2RlbDp0eXBlb2YgbW9kZWwhPT1cInVuZGVmaW5lZFwiP21vZGVsOnVuZGVmaW5lZCxcInBhcnRpYWxcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnBhcnRpYWw6dHlwZW9mIHBhcnRpYWwhPT1cInVuZGVmaW5lZFwiP3BhcnRpYWw6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJkb2N0eXBlIGh0bWxcXG5odG1sKGxhbmc9J2VuJywgaXRlbXNjb3BlLCBpdGVtdHlwZT0naHR0cDovL3NjaGVtYS5vcmcvQmxvZycpXFxuICBoZWFkXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1ldGEoY2hhcnNldD0ndXRmLTgnKVxcbiAgICBsaW5rKHJlbD0nc2hvcnRjdXQgaWNvbicsIGhyZWY9Jy9mYXZpY29uLmljbycpXFxuICAgIG1ldGEoaHR0cC1lcXVpdj0nWC1VQS1Db21wYXRpYmxlJywgY29udGVudD0nSUU9ZWRnZSxjaHJvbWU9MScpXFxuICAgIG1ldGEobmFtZT0ndmlld3BvcnQnLCBjb250ZW50PSd3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MScpXFxuICAgIGxpbmsocmVsPSdzdHlsZXNoZWV0JywgdHlwZT0ndGV4dC9jc3MnLCBocmVmPScvY3NzL2FsbC5jc3MnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0naHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9VW5pY2ErT25lOjQwMHxQbGF5ZmFpcitEaXNwbGF5OjcwMHxNZWdyaW06NzAwfEZhdW5hK09uZTo0MDBpdGFsaWMsNDAwLDcwMCcpXFxuXFxuICBib2R5I3RvcFxcbiAgICBoZWFkZXJcXG4gICAgICBoMVxcbiAgICAgICAgYS5seS10aXRsZShocmVmPScvJywgYXJpYS1sYWJlbD0nR28gdG8gaG9tZScpIFRhdW51c1xcbiAgICAgIGgyLmx5LXN1YmhlYWRpbmcgTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXFxuXFxuICAgIGFzaWRlLnNiLXNpZGViYXJcXG4gICAgICBuYXYuc2ItY29udGFpbmVyXFxuICAgICAgICB1bC5udi1pdGVtc1xcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvJykgQWJvdXRcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2dldHRpbmctc3RhcnRlZCcpIEdldHRpbmcgU3RhcnRlZFxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvYXBpJykgQVBJIERvY3VtZW50YXRpb25cXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2NvbXBsZW1lbnRzJykgQ29tcGxlbWVudGFyeSBNb2R1bGVzXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9wZXJmb3JtYW5jZScpIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvc291cmNlLWNvZGUnKSBTb3VyY2UgQ29kZVxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvY2hhbmdlbG9nJykgQ2hhbmdlbG9nXFxuXFxuICAgIG1haW4ubHktbWFpbiNhcHBsaWNhdGlvbi1yb290KGRhdGEtdGF1bnVzPSdtb2RlbCcpIT1wYXJ0aWFsXFxuICAgIHNjcmlwdChzcmM9Jy9qcy9hbGwuanMnKVxcblwiKTtcbn1cbn0iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0ZW1wbGF0ZXMgPSB7XG4gICdkb2N1bWVudGF0aW9uL2Fib3V0JzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2FwaSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qcycpLFxuICAnZXJyb3Ivbm90LWZvdW5kJzogcmVxdWlyZSgnLi92aWV3cy9lcnJvci9ub3QtZm91bmQuanMnKSxcbiAgJ2xheW91dCc6IHJlcXVpcmUoJy4vdmlld3MvbGF5b3V0LmpzJylcbn07XG5cbnZhciBjb250cm9sbGVycyA9IHtcbiAgJ2RvY3VtZW50YXRpb24vYWJvdXQnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpXG59O1xuXG52YXIgcm91dGVzID0ge1xuICAnLyc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2Fib3V0J1xuICB9LFxuICAnL2dldHRpbmctc3RhcnRlZCc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCdcbiAgfSxcbiAgJy9hcGknOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hcGknXG4gIH0sXG4gICcvY29tcGxlbWVudHMnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cydcbiAgfSxcbiAgJy9wZXJmb3JtYW5jZSc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlJ1xuICB9LFxuICAnL3NvdXJjZS1jb2RlJzoge1xuICAgIGlnbm9yZTogdHJ1ZVxuICB9LFxuICAnL2NoYW5nZWxvZyc6IHtcbiAgICBpZ25vcmU6IHRydWVcbiAgfSxcbiAgJy86Y2F0Y2hhbGwqJzoge1xuICAgIGFjdGlvbjogJ2Vycm9yL25vdC1mb3VuZCdcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXG4gIHJvdXRlczogcm91dGVzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc29sZS5sb2coJ1dlbGNvbWUgdG8gVGF1bnVzIGRvY3VtZW50YXRpb24gbWluaS1zaXRlIScpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyICQgPSByZXF1aXJlKCdkb21pbnVzJyk7XG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XG52YXIgdGhyb3R0bGUgPSByZXF1aXJlKCcuL3Rocm90dGxlJyk7XG52YXIgc2xvd1Njcm9sbENoZWNrID0gdGhyb3R0bGUoc2Nyb2xsQ2hlY2ssIDUwKTtcbnZhciBoeCA9IC9eaFsxLTZdJC9pO1xudmFyIHRyYWNraW5nO1xudmFyIGhlYWRpbmc7XG5cbiQoJ2JvZHknKS5vbignY2xpY2snLCAnaDEsaDIsaDMsaDQsaDUsaDYnLCBoZWFkaW5nQ2xpY2spO1xuXG5yYWYoc2Nyb2xsKTtcblxuZnVuY3Rpb24gY29udmVudGlvbnMgKGNvbnRhaW5lcikge1xuICB0cmFja2luZyA9ICQoY29udGFpbmVyKS5maW5kKCcjdGFibGUtb2YtY29udGVudHMnKS5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHNjcm9sbCAoKSB7XG4gIHNsb3dTY3JvbGxDaGVjaygpO1xuICByYWYoc2Nyb2xsKTtcbn1cblxuZnVuY3Rpb24gc2Nyb2xsQ2hlY2sgKCkge1xuICBpZiAoIXRyYWNraW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBmb3VuZCA9ICQoJ21haW4nKS5maW5kKCdoMSxoMixoMyxoNCxoNSxoNicpLmZpbHRlcihpblZpZXdwb3J0KTtcbiAgaWYgKGZvdW5kLmxlbmd0aCA9PT0gMCB8fCBoZWFkaW5nICYmIGZvdW5kWzBdID09PSBoZWFkaW5nWzBdKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChoZWFkaW5nKSB7XG4gICAgaGVhZGluZy5yZW1vdmVDbGFzcygndXYtaGlnaGxpZ2h0Jyk7XG4gIH1cbiAgaGVhZGluZyA9IGZvdW5kLmkoMCk7XG4gIGhlYWRpbmcuYWRkQ2xhc3MoJ3V2LWhpZ2hsaWdodCcpO1xufVxuXG5mdW5jdGlvbiBpblZpZXdwb3J0IChlbGVtZW50KSB7XG4gIHZhciByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgdmFyIHZpZXdhYmxlID0gKFxuICAgIE1hdGguY2VpbChyZWN0LnRvcCkgPj0gMCAmJlxuICAgIE1hdGguY2VpbChyZWN0LmxlZnQpID49IDAgJiZcbiAgICBNYXRoLmZsb29yKHJlY3QuYm90dG9tKSA8PSAod2luZG93LmlubmVySGVpZ2h0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQpICYmXG4gICAgTWF0aC5mbG9vcihyZWN0LnJpZ2h0KSA8PSAod2luZG93LmlubmVyV2lkdGggfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoKVxuICApO1xuICByZXR1cm4gdmlld2FibGU7XG59XG5cbmZ1bmN0aW9uIGZpbmRIZWFkaW5nIChlKSB7XG4gIHZhciBoID0gZS50YXJnZXQ7XG4gIHdoaWxlIChoICYmICFoeC50ZXN0KGgudGFnTmFtZSkpIHtcbiAgICBoID0gaC5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBoO1xufVxuXG5mdW5jdGlvbiBoZWFkaW5nQ2xpY2sgKGUpIHtcbiAgdmFyIGggPSBmaW5kSGVhZGluZyhlKTtcbiAgaWYgKGggJiYgaC5pZCkge1xuICAgIHRhdW51cy5uYXZpZ2F0ZSgnIycgKyBoLmlkKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbnZlbnRpb25zO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG4vLyBpbXBvcnQgdGhlIHRhdW51cyBtb2R1bGVcbnZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcblxuLy8gaW1wb3J0IHRoZSB3aXJpbmcgbW9kdWxlIGV4cG9ydGVkIGJ5IFRhdW51c1xudmFyIHdpcmluZyA9IHJlcXVpcmUoJy4uLy4uLy5iaW4vd2lyaW5nJyk7XG5cbi8vIGltcG9ydCBjb252ZW50aW9uc1xudmFyIGNvbnZlbnRpb25zID0gcmVxdWlyZSgnLi9jb252ZW50aW9ucycpO1xuXG4vLyBnZXQgdGhlIDxtYWluPiBlbGVtZW50XG52YXIgbWFpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHBsaWNhdGlvbi1yb290Jyk7XG5cbi8vIHNldCB1cCBjb252ZW50aW9ucyB0aGF0IGdldCBleGVjdXRlZCBmb3IgZXZlcnkgdmlld1xudGF1bnVzLm9uKCdyZW5kZXInLCBjb252ZW50aW9ucyk7XG5cbi8vIG1vdW50IHRhdW51cyBzbyBpdCBzdGFydHMgaXRzIHJvdXRpbmcgZW5naW5lXG50YXVudXMubW91bnQobWFpbiwgd2lyaW5nKTtcblxuLy8gY3JlYXRlIGdsb2JhbHMgdG8gbWFrZSBpdCBlYXN5IHRvIGRlYnVnXG4vLyBkb24ndCBkbyB0aGlzIGluIHByb2R1Y3Rpb24hXG5nbG9iYWwuJCA9IHJlcXVpcmUoJ2RvbWludXMnKTtcbmdsb2JhbC50YXVudXMgPSB0YXVudXM7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiB0aHJvdHRsZSAoZm4sIHQpIHtcbiAgdmFyIGNhY2hlO1xuICB2YXIgbGFzdCA9IC0xO1xuICByZXR1cm4gZnVuY3Rpb24gdGhyb3R0bGVkICgpIHtcbiAgICB2YXIgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBpZiAobm93IC0gbGFzdCA+IHQpIHtcbiAgICAgIGNhY2hlID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIGxhc3QgPSBub3c7XG4gICAgfVxuICAgIHJldHVybiBjYWNoZTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0aHJvdHRsZTtcbmdsb2JhbC50aHJvdHRsZT10aHJvdHRsZTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJ2YXIgcG9zZXIgPSByZXF1aXJlKCcuL3NyYy9ub2RlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gcG9zZXI7XG5cblsnQXJyYXknLCAnRnVuY3Rpb24nLCAnT2JqZWN0JywgJ0RhdGUnLCAnU3RyaW5nJ10uZm9yRWFjaChwb3NlKTtcblxuZnVuY3Rpb24gcG9zZSAodHlwZSkge1xuICBwb3Nlclt0eXBlXSA9IGZ1bmN0aW9uIHBvc2VDb21wdXRlZFR5cGUgKCkgeyByZXR1cm4gcG9zZXIodHlwZSk7IH07XG59XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBkID0gZ2xvYmFsLmRvY3VtZW50O1xuXG5mdW5jdGlvbiBwb3NlciAodHlwZSkge1xuICB2YXIgaWZyYW1lID0gZC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcblxuICBpZnJhbWUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgZC5ib2R5LmFwcGVuZENoaWxkKGlmcmFtZSk7XG5cbiAgcmV0dXJuIG1hcCh0eXBlLCBpZnJhbWUuY29udGVudFdpbmRvdyk7XG59XG5cbmZ1bmN0aW9uIG1hcCAodHlwZSwgc291cmNlKSB7IC8vIGZvcndhcmQgcG9seWZpbGxzIHRvIHRoZSBzdG9sZW4gcmVmZXJlbmNlIVxuICB2YXIgb3JpZ2luYWwgPSB3aW5kb3dbdHlwZV0ucHJvdG90eXBlO1xuICB2YXIgdmFsdWUgPSBzb3VyY2VbdHlwZV07XG4gIHZhciBwcm9wO1xuXG4gIGZvciAocHJvcCBpbiBvcmlnaW5hbCkge1xuICAgIHZhbHVlLnByb3RvdHlwZVtwcm9wXSA9IG9yaWdpbmFsW3Byb3BdO1xuICB9XG5cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHBvc2VyO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGV4cGFuZG8gPSAnc2VrdG9yLScgKyBEYXRlLm5vdygpO1xudmFyIHJzaWJsaW5ncyA9IC9bK35dLztcbnZhciBkb2N1bWVudCA9IGdsb2JhbC5kb2N1bWVudDtcbnZhciBkZWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG52YXIgbWF0Y2ggPSBkZWwubWF0Y2hlcyB8fFxuICAgICAgICAgICAgZGVsLndlYmtpdE1hdGNoZXNTZWxlY3RvciB8fFxuICAgICAgICAgICAgZGVsLm1vek1hdGNoZXNTZWxlY3RvciB8fFxuICAgICAgICAgICAgZGVsLm9NYXRjaGVzU2VsZWN0b3IgfHxcbiAgICAgICAgICAgIGRlbC5tc01hdGNoZXNTZWxlY3RvcjtcblxuZnVuY3Rpb24gcXNhIChzZWxlY3RvciwgY29udGV4dCkge1xuICB2YXIgZXhpc3RlZCwgaWQsIHByZWZpeCwgcHJlZml4ZWQsIGFkYXB0ZXIsIGhhY2sgPSBjb250ZXh0ICE9PSBkb2N1bWVudDtcbiAgaWYgKGhhY2spIHsgLy8gaWQgaGFjayBmb3IgY29udGV4dC1yb290ZWQgcXVlcmllc1xuICAgIGV4aXN0ZWQgPSBjb250ZXh0LmdldEF0dHJpYnV0ZSgnaWQnKTtcbiAgICBpZCA9IGV4aXN0ZWQgfHwgZXhwYW5kbztcbiAgICBwcmVmaXggPSAnIycgKyBpZCArICcgJztcbiAgICBwcmVmaXhlZCA9IHByZWZpeCArIHNlbGVjdG9yLnJlcGxhY2UoLywvZywgJywnICsgcHJlZml4KTtcbiAgICBhZGFwdGVyID0gcnNpYmxpbmdzLnRlc3Qoc2VsZWN0b3IpICYmIGNvbnRleHQucGFyZW50Tm9kZTtcbiAgICBpZiAoIWV4aXN0ZWQpIHsgY29udGV4dC5zZXRBdHRyaWJ1dGUoJ2lkJywgaWQpOyB9XG4gIH1cbiAgdHJ5IHtcbiAgICByZXR1cm4gKGFkYXB0ZXIgfHwgY29udGV4dCkucXVlcnlTZWxlY3RvckFsbChwcmVmaXhlZCB8fCBzZWxlY3Rvcik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gW107XG4gIH0gZmluYWxseSB7XG4gICAgaWYgKGV4aXN0ZWQgPT09IG51bGwpIHsgY29udGV4dC5yZW1vdmVBdHRyaWJ1dGUoJ2lkJyk7IH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kIChzZWxlY3RvciwgY3R4LCBjb2xsZWN0aW9uLCBzZWVkKSB7XG4gIHZhciBlbGVtZW50O1xuICB2YXIgY29udGV4dCA9IGN0eCB8fCBkb2N1bWVudDtcbiAgdmFyIHJlc3VsdHMgPSBjb2xsZWN0aW9uIHx8IFtdO1xuICB2YXIgaSA9IDA7XG4gIGlmICh0eXBlb2Ygc2VsZWN0b3IgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cbiAgaWYgKGNvbnRleHQubm9kZVR5cGUgIT09IDEgJiYgY29udGV4dC5ub2RlVHlwZSAhPT0gOSkge1xuICAgIHJldHVybiBbXTsgLy8gYmFpbCBpZiBjb250ZXh0IGlzIG5vdCBhbiBlbGVtZW50IG9yIGRvY3VtZW50XG4gIH1cbiAgaWYgKHNlZWQpIHtcbiAgICB3aGlsZSAoKGVsZW1lbnQgPSBzZWVkW2krK10pKSB7XG4gICAgICBpZiAobWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIHNlbGVjdG9yKSkge1xuICAgICAgICByZXN1bHRzLnB1c2goZWxlbWVudCk7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMucHVzaC5hcHBseShyZXN1bHRzLCBxc2Eoc2VsZWN0b3IsIGNvbnRleHQpKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gbWF0Y2hlcyAoc2VsZWN0b3IsIGVsZW1lbnRzKSB7XG4gIHJldHVybiBmaW5kKHNlbGVjdG9yLCBudWxsLCBudWxsLCBlbGVtZW50cyk7XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXNTZWxlY3RvciAoZWxlbWVudCwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIG1hdGNoLmNhbGwoZWxlbWVudCwgc2VsZWN0b3IpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZpbmQ7XG5cbmZpbmQubWF0Y2hlcyA9IG1hdGNoZXM7XG5maW5kLm1hdGNoZXNTZWxlY3RvciA9IG1hdGNoZXNTZWxlY3RvcjtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBwb3NlciA9IHJlcXVpcmUoJ3Bvc2VyJyk7XG52YXIgRG9taW51cyA9IHBvc2VyLkFycmF5KCk7XG5cbm1vZHVsZS5leHBvcnRzID0gRG9taW51cztcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyICQgPSByZXF1aXJlKCcuL3B1YmxpYycpO1xudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NvcmUnKTtcbnZhciBkb20gPSByZXF1aXJlKCcuL2RvbScpO1xudmFyIGNsYXNzZXMgPSByZXF1aXJlKCcuL2NsYXNzZXMnKTtcbnZhciBEb21pbnVzID0gcmVxdWlyZSgnLi9Eb21pbnVzLmN0b3InKTtcblxuZnVuY3Rpb24gZXF1YWxzIChzZWxlY3Rvcikge1xuICByZXR1cm4gZnVuY3Rpb24gZXF1YWxzIChlbGVtKSB7XG4gICAgcmV0dXJuIGRvbS5tYXRjaGVzKGVsZW0sIHNlbGVjdG9yKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gc3RyYWlnaHQgKHByb3AsIG9uZSkge1xuICByZXR1cm4gZnVuY3Rpb24gZG9tTWFwcGluZyAoc2VsZWN0b3IpIHtcbiAgICB2YXIgcmVzdWx0ID0gdGhpcy5tYXAoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICAgIHJldHVybiBkb21bcHJvcF0oZWxlbSwgc2VsZWN0b3IpO1xuICAgIH0pO1xuICAgIHZhciByZXN1bHRzID0gY29yZS5mbGF0dGVuKHJlc3VsdCk7XG4gICAgcmV0dXJuIG9uZSA/IHJlc3VsdHNbMF0gOiByZXN1bHRzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5wcmV2ID0gc3RyYWlnaHQoJ3ByZXYnKTtcbkRvbWludXMucHJvdG90eXBlLm5leHQgPSBzdHJhaWdodCgnbmV4dCcpO1xuRG9taW51cy5wcm90b3R5cGUucGFyZW50ID0gc3RyYWlnaHQoJ3BhcmVudCcpO1xuRG9taW51cy5wcm90b3R5cGUucGFyZW50cyA9IHN0cmFpZ2h0KCdwYXJlbnRzJyk7XG5Eb21pbnVzLnByb3RvdHlwZS5jaGlsZHJlbiA9IHN0cmFpZ2h0KCdjaGlsZHJlbicpO1xuRG9taW51cy5wcm90b3R5cGUuZmluZCA9IHN0cmFpZ2h0KCdxc2EnKTtcbkRvbWludXMucHJvdG90eXBlLmZpbmRPbmUgPSBzdHJhaWdodCgncXMnLCB0cnVlKTtcblxuRG9taW51cy5wcm90b3R5cGUud2hlcmUgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgcmV0dXJuIHRoaXMuZmlsdGVyKGVxdWFscyhzZWxlY3RvcikpO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUuaXMgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgcmV0dXJuIHRoaXMuc29tZShlcXVhbHMoc2VsZWN0b3IpKTtcbn07XG5cbkRvbWludXMucHJvdG90eXBlLmkgPSBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgcmV0dXJuIG5ldyBEb21pbnVzKHRoaXNbaW5kZXhdKTtcbn07XG5cbmZ1bmN0aW9uIGNvbXBhcmVGYWN0b3J5IChmbikge1xuICByZXR1cm4gZnVuY3Rpb24gY29tcGFyZSAoKSB7XG4gICAgJC5hcHBseShudWxsLCBhcmd1bWVudHMpLmZvckVhY2goZm4sIHRoaXMpO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5hbmQgPSBjb21wYXJlRmFjdG9yeShmdW5jdGlvbiBhZGRPbmUgKGVsZW0pIHtcbiAgaWYgKHRoaXMuaW5kZXhPZihlbGVtKSA9PT0gLTEpIHtcbiAgICB0aGlzLnB1c2goZWxlbSk7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59KTtcblxuRG9taW51cy5wcm90b3R5cGUuYnV0ID0gY29tcGFyZUZhY3RvcnkoZnVuY3Rpb24gYWRkT25lIChlbGVtKSB7XG4gIHZhciBpbmRleCA9IHRoaXMuaW5kZXhPZihlbGVtKTtcbiAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgIHRoaXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgfVxuICByZXR1cm4gdGhpcztcbn0pO1xuXG5Eb21pbnVzLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uICh0eXBlcywgZmlsdGVyLCBmbikge1xuICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICB0eXBlcy5zcGxpdCgnICcpLmZvckVhY2goZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgIGRvbS5vbihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24gKHR5cGVzLCBmaWx0ZXIsIGZuKSB7XG4gIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgIHR5cGVzLnNwbGl0KCcgJykuZm9yRWFjaChmdW5jdGlvbiAodHlwZSkge1xuICAgICAgZG9tLm9mZihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuW1xuICBbJ2FkZENsYXNzJywgY2xhc3Nlcy5hZGRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3NldENsYXNzJywgY2xhc3Nlcy5zZXRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3JlbW92ZScsIGRvbS5yZW1vdmVdXG5dLmZvckVhY2gobWFwTWV0aG9kcyk7XG5cbmZ1bmN0aW9uIG1hcE1ldGhvZHMgKGRhdGEpIHtcbiAgRG9taW51cy5wcm90b3R5cGVbZGF0YVswXV0gPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICAgIGRhdGFbMV0oZWxlbSwgdmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5bXG4gIFsnYXBwZW5kJywgZG9tLmFwcGVuZF0sXG4gIFsnYXBwZW5kVG8nLCBkb20uYXBwZW5kVG9dLFxuICBbJ3ByZXBlbmQnLCBkb20ucHJlcGVuZF0sXG4gIFsncHJlcGVuZFRvJywgZG9tLnByZXBlbmRUb10sXG4gIFsnYmVmb3JlJywgZG9tLmJlZm9yZV0sXG4gIFsnYmVmb3JlT2YnLCBkb20uYmVmb3JlT2ZdLFxuICBbJ2FmdGVyJywgZG9tLmFmdGVyXSxcbiAgWydhZnRlck9mJywgZG9tLmFmdGVyT2ZdLFxuICBbJ3Nob3cnLCBkb20uc2hvd10sXG4gIFsnaGlkZScsIGRvbS5oaWRlXVxuXS5mb3JFYWNoKG1hcE1hbmlwdWxhdGlvbik7XG5cbmZ1bmN0aW9uIG1hcE1hbmlwdWxhdGlvbiAoZGF0YSkge1xuICBEb21pbnVzLnByb3RvdHlwZVtkYXRhWzBdXSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIGRhdGFbMV0odGhpcywgdmFsdWUpO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5oYXNDbGFzcyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICByZXR1cm4gdGhpcy5zb21lKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgcmV0dXJuIGNsYXNzZXMuY29udGFpbnMoZWxlbSwgdmFsdWUpO1xuICB9KTtcbn07XG5cbkRvbWludXMucHJvdG90eXBlLmF0dHIgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAyO1xuICB2YXIgcmVzdWx0ID0gdGhpcy5tYXAoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICByZXR1cm4gZ2V0dGVyID8gZG9tLmF0dHIoZWxlbSwgbmFtZSkgOiBkb20uYXR0cihlbGVtLCBuYW1lLCB2YWx1ZSk7XG4gIH0pO1xuICByZXR1cm4gZ2V0dGVyID8gcmVzdWx0WzBdIDogdGhpcztcbn07XG5cbmZ1bmN0aW9uIGtleVZhbHVlIChrZXksIHZhbHVlKSB7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMjtcbiAgaWYgKGdldHRlcikge1xuICAgIHJldHVybiB0aGlzLmxlbmd0aCA/IGRvbVtrZXldKHRoaXNbMF0pIDogJyc7XG4gIH1cbiAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgZG9tW2tleV0oZWxlbSwgdmFsdWUpO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGtleVZhbHVlUHJvcGVydHkgKHByb3ApIHtcbiAgRG9taW51cy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbiBhY2Nlc3NvciAodmFsdWUpIHtcbiAgICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDE7XG4gICAgaWYgKGdldHRlcikge1xuICAgICAgcmV0dXJuIGtleVZhbHVlLmNhbGwodGhpcywgcHJvcCk7XG4gICAgfVxuICAgIHJldHVybiBrZXlWYWx1ZS5jYWxsKHRoaXMsIHByb3AsIHZhbHVlKTtcbiAgfTtcbn1cblxuWydodG1sJywgJ3RleHQnLCAndmFsdWUnXS5mb3JFYWNoKGtleVZhbHVlUHJvcGVydHkpO1xuXG5Eb21pbnVzLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMubWFwKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgcmV0dXJuIGRvbS5jbG9uZShlbGVtKTtcbiAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vcHVibGljJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0cmltID0gL15cXHMrfFxccyskL2c7XG52YXIgd2hpdGVzcGFjZSA9IC9cXHMrL2c7XG5cbmZ1bmN0aW9uIGludGVycHJldCAoaW5wdXQpIHtcbiAgcmV0dXJuIHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgPyBpbnB1dC5yZXBsYWNlKHRyaW0sICcnKS5zcGxpdCh3aGl0ZXNwYWNlKSA6IGlucHV0O1xufVxuXG5mdW5jdGlvbiBjbGFzc2VzIChub2RlKSB7XG4gIHJldHVybiBub2RlLmNsYXNzTmFtZS5yZXBsYWNlKHRyaW0sICcnKS5zcGxpdCh3aGl0ZXNwYWNlKTtcbn1cblxuZnVuY3Rpb24gc2V0IChub2RlLCBpbnB1dCkge1xuICBub2RlLmNsYXNzTmFtZSA9IGludGVycHJldChpbnB1dCkuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBhZGQgKG5vZGUsIGlucHV0KSB7XG4gIHZhciBjdXJyZW50ID0gcmVtb3ZlKG5vZGUsIGlucHV0KTtcbiAgdmFyIHZhbHVlcyA9IGludGVycHJldChpbnB1dCk7XG4gIGN1cnJlbnQucHVzaC5hcHBseShjdXJyZW50LCB2YWx1ZXMpO1xuICBzZXQobm9kZSwgY3VycmVudCk7XG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiByZW1vdmUgKG5vZGUsIGlucHV0KSB7XG4gIHZhciBjdXJyZW50ID0gY2xhc3Nlcyhub2RlKTtcbiAgdmFyIHZhbHVlcyA9IGludGVycHJldChpbnB1dCk7XG4gIHZhbHVlcy5mb3JFYWNoKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHZhciBpID0gY3VycmVudC5pbmRleE9mKHZhbHVlKTtcbiAgICBpZiAoaSAhPT0gLTEpIHtcbiAgICAgIGN1cnJlbnQuc3BsaWNlKGksIDEpO1xuICAgIH1cbiAgfSk7XG4gIHNldChub2RlLCBjdXJyZW50KTtcbiAgcmV0dXJuIGN1cnJlbnQ7XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zIChub2RlLCBpbnB1dCkge1xuICB2YXIgY3VycmVudCA9IGNsYXNzZXMobm9kZSk7XG4gIHZhciB2YWx1ZXMgPSBpbnRlcnByZXQoaW5wdXQpO1xuXG4gIHJldHVybiB2YWx1ZXMuZXZlcnkoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGN1cnJlbnQuaW5kZXhPZih2YWx1ZSkgIT09IC0xO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkLFxuICByZW1vdmU6IHJlbW92ZSxcbiAgY29udGFpbnM6IGNvbnRhaW5zLFxuICBzZXQ6IHNldCxcbiAgZ2V0OiBjbGFzc2VzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIHByb3RvID0gRG9taW51cy5wcm90b3R5cGU7XG5cbmZ1bmN0aW9uIEFwcGxpZWQgKGFyZ3MpIHtcbiAgcmV0dXJuIERvbWludXMuYXBwbHkodGhpcywgYXJncyk7XG59XG5cbkFwcGxpZWQucHJvdG90eXBlID0gcHJvdG87XG5cblsnbWFwJywgJ2ZpbHRlcicsICdjb25jYXQnXS5mb3JFYWNoKGVuc3VyZSk7XG5cbmZ1bmN0aW9uIGVuc3VyZSAoa2V5KSB7XG4gIHZhciBvcmlnaW5hbCA9IHByb3RvW2tleV07XG4gIHByb3RvW2tleV0gPSBmdW5jdGlvbiBhcHBsaWVkICgpIHtcbiAgICByZXR1cm4gYXBwbHkob3JpZ2luYWwuYXBwbHkodGhpcywgYXJndW1lbnRzKSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGFwcGx5IChhKSB7XG4gIHJldHVybiBuZXcgQXBwbGllZChhKTtcbn1cblxuZnVuY3Rpb24gY2FzdCAoYSkge1xuICBpZiAoYSBpbnN0YW5jZW9mIERvbWludXMpIHtcbiAgICByZXR1cm4gYTtcbiAgfVxuICBpZiAoIWEpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoKTtcbiAgfVxuICBpZiAodGVzdC5pc0VsZW1lbnQoYSkpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoYSk7XG4gIH1cbiAgaWYgKCF0ZXN0LmlzQXJyYXkoYSkpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoKTtcbiAgfVxuICByZXR1cm4gYXBwbHkoYSkuZmlsdGVyKGZ1bmN0aW9uIChpKSB7XG4gICAgcmV0dXJuIHRlc3QuaXNFbGVtZW50KGkpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmxhdHRlbiAoYSwgY2FjaGUpIHtcbiAgcmV0dXJuIGEucmVkdWNlKGZ1bmN0aW9uIChjdXJyZW50LCBpdGVtKSB7XG4gICAgaWYgKERvbWludXMuaXNBcnJheShpdGVtKSkge1xuICAgICAgcmV0dXJuIGZsYXR0ZW4oaXRlbSwgY3VycmVudCk7XG4gICAgfSBlbHNlIGlmIChjdXJyZW50LmluZGV4T2YoaXRlbSkgPT09IC0xKSB7XG4gICAgICByZXR1cm4gY3VycmVudC5jb25jYXQoaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiBjdXJyZW50O1xuICB9LCBjYWNoZSB8fCBuZXcgRG9taW51cygpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFwcGx5OiBhcHBseSxcbiAgY2FzdDogY2FzdCxcbiAgZmxhdHRlbjogZmxhdHRlblxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHNla3RvciA9IHJlcXVpcmUoJ3Nla3RvcicpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NvcmUnKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xudmFyIHRleHQgPSByZXF1aXJlKCcuL3RleHQnKTtcbnZhciB0ZXN0ID0gcmVxdWlyZSgnLi90ZXN0Jyk7XG52YXIgYXBpID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBkZWxlZ2F0ZXMgPSB7fTtcblxuZnVuY3Rpb24gY2FzdENvbnRleHQgKGNvbnRleHQpIHtcbiAgaWYgKHR5cGVvZiBjb250ZXh0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBhcGkucXMobnVsbCwgY29udGV4dCk7XG4gIH1cbiAgaWYgKHRlc3QuaXNFbGVtZW50KGNvbnRleHQpKSB7XG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgaWYgKGNvbnRleHQgaW5zdGFuY2VvZiBEb21pbnVzKSB7XG4gICAgcmV0dXJuIGNvbnRleHRbMF07XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmFwaS5xc2EgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgdmFyIHJlc3VsdHMgPSBuZXcgRG9taW51cygpO1xuICByZXR1cm4gc2VrdG9yKHNlbGVjdG9yLCBjYXN0Q29udGV4dChlbGVtKSwgcmVzdWx0cyk7XG59O1xuXG5hcGkucXMgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIGFwaS5xc2EoZWxlbSwgc2VsZWN0b3IpWzBdO1xufTtcblxuYXBpLm1hdGNoZXMgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIHNla3Rvci5tYXRjaGVzU2VsZWN0b3IoZWxlbSwgc2VsZWN0b3IpO1xufTtcblxuZnVuY3Rpb24gcmVsYXRlZEZhY3RvcnkgKHByb3ApIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHJlbGF0ZWQgKGVsZW0sIHNlbGVjdG9yKSB7XG4gICAgdmFyIHJlbGF0aXZlID0gZWxlbVtwcm9wXTtcbiAgICBpZiAocmVsYXRpdmUpIHtcbiAgICAgIGlmICghc2VsZWN0b3IgfHwgYXBpLm1hdGNoZXMocmVsYXRpdmUsIHNlbGVjdG9yKSkge1xuICAgICAgICByZXR1cm4gY29yZS5jYXN0KHJlbGF0aXZlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH07XG59XG5cbmFwaS5wcmV2ID0gcmVsYXRlZEZhY3RvcnkoJ3ByZXZpb3VzU2libGluZycpO1xuYXBpLm5leHQgPSByZWxhdGVkRmFjdG9yeSgnbmV4dFNpYmxpbmcnKTtcbmFwaS5wYXJlbnQgPSByZWxhdGVkRmFjdG9yeSgncGFyZW50RWxlbWVudCcpO1xuXG5mdW5jdGlvbiBtYXRjaGVzIChlbGVtLCB2YWx1ZSkge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRG9taW51cykge1xuICAgIHJldHVybiB2YWx1ZS5pbmRleE9mKGVsZW0pICE9PSAtMTtcbiAgfVxuICBpZiAodGVzdC5pc0VsZW1lbnQodmFsdWUpKSB7XG4gICAgcmV0dXJuIGVsZW0gPT09IHZhbHVlO1xuICB9XG4gIHJldHVybiBhcGkubWF0Y2hlcyhlbGVtLCB2YWx1ZSk7XG59XG5cbmFwaS5wYXJlbnRzID0gZnVuY3Rpb24gKGVsZW0sIHZhbHVlKSB7XG4gIHZhciBub2RlcyA9IFtdO1xuICB2YXIgbm9kZSA9IGVsZW07XG4gIHdoaWxlIChub2RlLnBhcmVudEVsZW1lbnQpIHtcbiAgICBpZiAobWF0Y2hlcyhub2RlLnBhcmVudEVsZW1lbnQsIHZhbHVlKSkge1xuICAgICAgbm9kZXMucHVzaChub2RlLnBhcmVudEVsZW1lbnQpO1xuICAgIH1cbiAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBjb3JlLmFwcGx5KG5vZGVzKTtcbn07XG5cbmFwaS5jaGlsZHJlbiA9IGZ1bmN0aW9uIChlbGVtLCB2YWx1ZSkge1xuICB2YXIgbm9kZXMgPSBbXTtcbiAgdmFyIGNoaWxkcmVuID0gZWxlbS5jaGlsZHJlbjtcbiAgdmFyIGNoaWxkO1xuICB2YXIgaTtcbiAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgY2hpbGQgPSBjaGlsZHJlbltpXTtcbiAgICBpZiAobWF0Y2hlcyhjaGlsZCwgdmFsdWUpKSB7XG4gICAgICBub2Rlcy5wdXNoKGNoaWxkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvcmUuYXBwbHkobm9kZXMpO1xufTtcblxuLy8gdGhpcyBtZXRob2QgY2FjaGVzIGRlbGVnYXRlcyBzbyB0aGF0IC5vZmYoKSB3b3JrcyBzZWFtbGVzc2x5XG5mdW5jdGlvbiBkZWxlZ2F0ZSAocm9vdCwgZmlsdGVyLCBmbikge1xuICBpZiAoZGVsZWdhdGVzW2ZuLl9kZF0pIHtcbiAgICByZXR1cm4gZGVsZWdhdGVzW2ZuLl9kZF07XG4gIH1cbiAgZm4uX2RkID0gRGF0ZS5ub3coKTtcbiAgZGVsZWdhdGVzW2ZuLl9kZF0gPSBkZWxlZ2F0b3I7XG4gIGZ1bmN0aW9uIGRlbGVnYXRvciAoZSkge1xuICAgIHZhciBlbGVtID0gZS50YXJnZXQ7XG4gICAgd2hpbGUgKGVsZW0gJiYgZWxlbSAhPT0gcm9vdCkge1xuICAgICAgaWYgKGFwaS5tYXRjaGVzKGVsZW0sIGZpbHRlcikpIHtcbiAgICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTsgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZWxlbSA9IGVsZW0ucGFyZW50RWxlbWVudDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlbGVnYXRvcjtcbn1cblxuYXBpLm9uID0gZnVuY3Rpb24gKGVsZW0sIHR5cGUsIGZpbHRlciwgZm4pIHtcbiAgaWYgKGZuID09PSB2b2lkIDApIHtcbiAgICBldmVudHMuYWRkKGVsZW0sIHR5cGUsIGZpbHRlcik7IC8vIGZpbHRlciBfaXNfIGZuXG4gIH0gZWxzZSB7XG4gICAgZXZlbnRzLmFkZChlbGVtLCB0eXBlLCBkZWxlZ2F0ZShlbGVtLCBmaWx0ZXIsIGZuKSk7XG4gIH1cbn07XG5cbmFwaS5vZmYgPSBmdW5jdGlvbiAoZWxlbSwgdHlwZSwgZmlsdGVyLCBmbikge1xuICBpZiAoZm4gPT09IHZvaWQgMCkge1xuICAgIGV2ZW50cy5yZW1vdmUoZWxlbSwgdHlwZSwgZmlsdGVyKTsgLy8gZmlsdGVyIF9pc18gZm5cbiAgfSBlbHNlIHtcbiAgICBldmVudHMucmVtb3ZlKGVsZW0sIHR5cGUsIGRlbGVnYXRlKGVsZW0sIGZpbHRlciwgZm4pKTtcbiAgfVxufTtcblxuYXBpLmh0bWwgPSBmdW5jdGlvbiAoZWxlbSwgaHRtbCkge1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gZWxlbS5pbm5lckhUTUw7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5pbm5lckhUTUwgPSBodG1sO1xuICB9XG59O1xuXG5hcGkudGV4dCA9IGZ1bmN0aW9uIChlbGVtLCB0ZXh0KSB7XG4gIHZhciBjaGVja2FibGUgPSB0ZXN0LmlzQ2hlY2thYmxlKGVsZW0pO1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gY2hlY2thYmxlID8gZWxlbS52YWx1ZSA6IGVsZW0uaW5uZXJUZXh0IHx8IGVsZW0udGV4dENvbnRlbnQ7XG4gIH0gZWxzZSBpZiAoY2hlY2thYmxlKSB7XG4gICAgZWxlbS52YWx1ZSA9IHRleHQ7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5pbm5lclRleHQgPSBlbGVtLnRleHRDb250ZW50ID0gdGV4dDtcbiAgfVxufTtcblxuYXBpLnZhbHVlID0gZnVuY3Rpb24gKGVsZW0sIHZhbHVlKSB7XG4gIHZhciBjaGVja2FibGUgPSB0ZXN0LmlzQ2hlY2thYmxlKGVsZW0pO1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gY2hlY2thYmxlID8gZWxlbS5jaGVja2VkIDogZWxlbS52YWx1ZTtcbiAgfSBlbHNlIGlmIChjaGVja2FibGUpIHtcbiAgICBlbGVtLmNoZWNrZWQgPSB2YWx1ZTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLnZhbHVlID0gdmFsdWU7XG4gIH1cbn07XG5cbmFwaS5hdHRyID0gZnVuY3Rpb24gKGVsZW0sIG5hbWUsIHZhbHVlKSB7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMztcbiAgdmFyIGNhbWVsID0gdGV4dC5oeXBoZW5Ub0NhbWVsKG5hbWUpO1xuICBpZiAoZ2V0dGVyKSB7XG4gICAgaWYgKGNhbWVsIGluIGVsZW0pIHtcbiAgICAgIHJldHVybiBlbGVtW2NhbWVsXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGVsZW0uZ2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcbiAgICB9XG4gIH1cbiAgaWYgKGNhbWVsIGluIGVsZW0pIHtcbiAgICBlbGVtW2NhbWVsXSA9IHZhbHVlO1xuICB9IGVsc2UgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB2b2lkIDApIHtcbiAgICBlbGVtLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG4gIH1cbn07XG5cbmFwaS5tYWtlID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgcmV0dXJuIG5ldyBEb21pbnVzKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodHlwZSkpO1xufTtcblxuYXBpLmNsb25lID0gZnVuY3Rpb24gKGVsZW0pIHtcbiAgcmV0dXJuIGVsZW0uY2xvbmVOb2RlKHRydWUpO1xufTtcblxuYXBpLnJlbW92ZSA9IGZ1bmN0aW9uIChlbGVtKSB7XG4gIGlmIChlbGVtLnBhcmVudEVsZW1lbnQpIHtcbiAgICBlbGVtLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQoZWxlbSk7XG4gIH1cbn07XG5cbmFwaS5hcHBlbmQgPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gIGlmIChtYW5pcHVsYXRpb25HdWFyZChlbGVtLCB0YXJnZXQsIGFwaS5hcHBlbmQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGVsZW0uYXBwZW5kQ2hpbGQodGFyZ2V0KTtcbn07XG5cbmFwaS5wcmVwZW5kID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICBpZiAobWFuaXB1bGF0aW9uR3VhcmQoZWxlbSwgdGFyZ2V0LCBhcGkucHJlcGVuZCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZWxlbS5pbnNlcnRCZWZvcmUodGFyZ2V0LCBlbGVtLmZpcnN0Q2hpbGQpO1xufTtcblxuYXBpLmJlZm9yZSA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgaWYgKG1hbmlwdWxhdGlvbkd1YXJkKGVsZW0sIHRhcmdldCwgYXBpLmJlZm9yZSkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGVsZW0ucGFyZW50RWxlbWVudCkge1xuICAgIGVsZW0ucGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUodGFyZ2V0LCBlbGVtKTtcbiAgfVxufTtcblxuYXBpLmFmdGVyID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICBpZiAobWFuaXB1bGF0aW9uR3VhcmQoZWxlbSwgdGFyZ2V0LCBhcGkuYWZ0ZXIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChlbGVtLnBhcmVudEVsZW1lbnQpIHtcbiAgICBlbGVtLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHRhcmdldCwgZWxlbS5uZXh0U2libGluZyk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIG1hbmlwdWxhdGlvbkd1YXJkIChlbGVtLCB0YXJnZXQsIGZuKSB7XG4gIHZhciByaWdodCA9IHRhcmdldCBpbnN0YW5jZW9mIERvbWludXM7XG4gIHZhciBsZWZ0ID0gZWxlbSBpbnN0YW5jZW9mIERvbWludXM7XG4gIGlmIChsZWZ0KSB7XG4gICAgZWxlbS5mb3JFYWNoKG1hbmlwdWxhdGVNYW55KTtcbiAgfSBlbHNlIGlmIChyaWdodCkge1xuICAgIG1hbmlwdWxhdGUoZWxlbSwgdHJ1ZSk7XG4gIH1cbiAgcmV0dXJuIGxlZnQgfHwgcmlnaHQ7XG5cbiAgZnVuY3Rpb24gbWFuaXB1bGF0ZSAoZWxlbSwgcHJlY29uZGl0aW9uKSB7XG4gICAgaWYgKHJpZ2h0KSB7XG4gICAgICB0YXJnZXQuZm9yRWFjaChmdW5jdGlvbiAodGFyZ2V0LCBqKSB7XG4gICAgICAgIGZuKGVsZW0sIGNsb25lVW5sZXNzKHRhcmdldCwgcHJlY29uZGl0aW9uICYmIGogPT09IDApKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBmbihlbGVtLCBjbG9uZVVubGVzcyh0YXJnZXQsIHByZWNvbmRpdGlvbikpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG1hbmlwdWxhdGVNYW55IChlbGVtLCBpKSB7XG4gICAgbWFuaXB1bGF0ZShlbGVtLCBpID09PSAwKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjbG9uZVVubGVzcyAodGFyZ2V0LCBjb25kaXRpb24pIHtcbiAgcmV0dXJuIGNvbmRpdGlvbiA/IHRhcmdldCA6IGFwaS5jbG9uZSh0YXJnZXQpO1xufVxuXG5bJ2FwcGVuZFRvJywgJ3ByZXBlbmRUbycsICdiZWZvcmVPZicsICdhZnRlck9mJ10uZm9yRWFjaChmbGlwKTtcblxuZnVuY3Rpb24gZmxpcCAoa2V5KSB7XG4gIHZhciBvcmlnaW5hbCA9IGtleS5zcGxpdCgvW0EtWl0vKVswXTtcbiAgYXBpW2tleV0gPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gICAgYXBpW29yaWdpbmFsXSh0YXJnZXQsIGVsZW0pO1xuICB9O1xufVxuXG5hcGkuc2hvdyA9IGZ1bmN0aW9uIChlbGVtLCBzaG91bGQsIGludmVydCkge1xuICBpZiAoZWxlbSBpbnN0YW5jZW9mIERvbWludXMpIHtcbiAgICBlbGVtLmZvckVhY2goc2hvd1Rlc3QpO1xuICB9IGVsc2Uge1xuICAgIHNob3dUZXN0KGVsZW0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd1Rlc3QgKGN1cnJlbnQpIHtcbiAgICB2YXIgb2sgPSBzaG91bGQgPT09IHZvaWQgMCB8fCBzaG91bGQgPT09IHRydWUgfHwgdHlwZW9mIHNob3VsZCA9PT0gJ2Z1bmN0aW9uJyAmJiBzaG91bGQuY2FsbChjdXJyZW50KTtcbiAgICBkaXNwbGF5KGN1cnJlbnQsIGludmVydCA/ICFvayA6IG9rKTtcbiAgfVxufTtcblxuYXBpLmhpZGUgPSBmdW5jdGlvbiAoZWxlbSwgc2hvdWxkKSB7XG4gIGFwaS5zaG93KGVsZW0sIHNob3VsZCwgdHJ1ZSk7XG59O1xuXG5mdW5jdGlvbiBkaXNwbGF5IChlbGVtLCBzaG91bGQpIHtcbiAgaWYgKHNob3VsZCkge1xuICAgIGVsZW0uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9Eb21pbnVzLnByb3RvdHlwZScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYWRkRXZlbnQgPSBhZGRFdmVudEVhc3k7XG52YXIgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEVhc3k7XG52YXIgaGFyZENhY2hlID0gW107XG5cbmlmICghd2luZG93LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgYWRkRXZlbnQgPSBhZGRFdmVudEhhcmQ7XG59XG5cbmlmICghd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEhhcmQ7XG59XG5cbmZ1bmN0aW9uIGFkZEV2ZW50RWFzeSAoZWxlbWVudCwgZXZ0LCBmbikge1xuICByZXR1cm4gZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2dCwgZm4pO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEhhcmQgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuYXR0YWNoRXZlbnQoJ29uJyArIGV2dCwgd3JhcChlbGVtZW50LCBldnQsIGZuKSk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50RWFzeSAoZWxlbWVudCwgZXZ0LCBmbikge1xuICByZXR1cm4gZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2dCwgZm4pO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEhhcmQgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuZGV0YWNoRXZlbnQoJ29uJyArIGV2dCwgdW53cmFwKGVsZW1lbnQsIGV2dCwgZm4pKTtcbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIgKG9yaWdpbmFsRXZlbnQpIHtcbiAgICB2YXIgZSA9IG9yaWdpbmFsRXZlbnQgfHwgd2luZG93LmV2ZW50O1xuICAgIGUudGFyZ2V0ID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIGUucHJldmVudERlZmF1bHQgID0gZS5wcmV2ZW50RGVmYXVsdCAgfHwgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKCkgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH07XG4gICAgZS5zdG9wUHJvcGFnYXRpb24gPSBlLnN0b3BQcm9wYWdhdGlvbiB8fCBmdW5jdGlvbiBzdG9wUHJvcGFnYXRpb24gKCkgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH07XG4gICAgZm4uY2FsbChlbGVtZW50LCBlKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gd3JhcCAoZWxlbWVudCwgZXZ0LCBmbikge1xuICB2YXIgd3JhcHBlciA9IHVud3JhcChlbGVtZW50LCBldnQsIGZuKSB8fCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBldnQsIGZuKTtcbiAgaGFyZENhY2hlLnB1c2goe1xuICAgIHdyYXBwZXI6IHdyYXBwZXIsXG4gICAgZWxlbWVudDogZWxlbWVudCxcbiAgICBldnQ6IGV2dCxcbiAgICBmbjogZm5cbiAgfSk7XG4gIHJldHVybiB3cmFwcGVyO1xufVxuXG5mdW5jdGlvbiB1bndyYXAgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgdmFyIGkgPSBmaW5kKGVsZW1lbnQsIGV2dCwgZm4pO1xuICBpZiAoaSkge1xuICAgIHZhciB3cmFwcGVyID0gaGFyZENhY2hlW2ldLndyYXBwZXI7XG4gICAgaGFyZENhY2hlLnNwbGljZShpLCAxKTsgLy8gZnJlZSB1cCBhIHRhZCBvZiBtZW1vcnlcbiAgICByZXR1cm4gd3JhcHBlcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHZhciBpLCBpdGVtO1xuICBmb3IgKGkgPSAwOyBpIDwgaGFyZENhY2hlLmxlbmd0aDsgaSsrKSB7XG4gICAgaXRlbSA9IGhhcmRDYWNoZVtpXTtcbiAgICBpZiAoaXRlbS5lbGVtZW50ID09PSBlbGVtZW50ICYmIGl0ZW0uZXZ0ID09PSBldnQgJiYgaXRlbS5mbiA9PT0gZm4pIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRFdmVudCxcbiAgcmVtb3ZlOiByZW1vdmVFdmVudFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGRvbSA9IHJlcXVpcmUoJy4vZG9tJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIHRhZyA9IC9eXFxzKjwoW2Etel0rKD86LVthLXpdKyk/KVxccypcXC8/PlxccyokL2k7XG5cbmZ1bmN0aW9uIGFwaSAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgdmFyIG5vdFRleHQgPSB0eXBlb2Ygc2VsZWN0b3IgIT09ICdzdHJpbmcnO1xuICBpZiAobm90VGV4dCAmJiBhcmd1bWVudHMubGVuZ3RoIDwgMikge1xuICAgIHJldHVybiBjb3JlLmNhc3Qoc2VsZWN0b3IpO1xuICB9XG4gIGlmIChub3RUZXh0KSB7XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH1cbiAgdmFyIG1hdGNoZXMgPSBzZWxlY3Rvci5tYXRjaCh0YWcpO1xuICBpZiAobWF0Y2hlcykge1xuICAgIHJldHVybiBkb20ubWFrZShtYXRjaGVzWzFdKTtcbiAgfVxuICByZXR1cm4gYXBpLmZpbmQoc2VsZWN0b3IsIGNvbnRleHQpO1xufVxuXG5hcGkuZmluZCA9IGZ1bmN0aW9uIChzZWxlY3RvciwgY29udGV4dCkge1xuICByZXR1cm4gZG9tLnFzYShjb250ZXh0LCBzZWxlY3Rvcik7XG59O1xuXG5hcGkuZmluZE9uZSA9IGZ1bmN0aW9uIChzZWxlY3RvciwgY29udGV4dCkge1xuICByZXR1cm4gZG9tLnFzKGNvbnRleHQsIHNlbGVjdG9yKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gYXBpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbm9kZU9iamVjdHMgPSB0eXBlb2YgTm9kZSA9PT0gJ29iamVjdCc7XG52YXIgZWxlbWVudE9iamVjdHMgPSB0eXBlb2YgSFRNTEVsZW1lbnQgPT09ICdvYmplY3QnO1xuXG5mdW5jdGlvbiBpc05vZGUgKG8pIHtcbiAgcmV0dXJuIG5vZGVPYmplY3RzID8gbyBpbnN0YW5jZW9mIE5vZGUgOiBpc05vZGVPYmplY3Qobyk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZU9iamVjdCAobykge1xuICByZXR1cm4gbyAmJlxuICAgIHR5cGVvZiBvID09PSAnb2JqZWN0JyAmJlxuICAgIHR5cGVvZiBvLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBvLm5vZGVUeXBlID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNFbGVtZW50IChvKSB7XG4gIHJldHVybiBlbGVtZW50T2JqZWN0cyA/IG8gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCA6IGlzRWxlbWVudE9iamVjdChvKTtcbn1cblxuZnVuY3Rpb24gaXNFbGVtZW50T2JqZWN0IChvKSB7XG4gIHJldHVybiBvICYmXG4gICAgdHlwZW9mIG8gPT09ICdvYmplY3QnICYmXG4gICAgdHlwZW9mIG8ubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgby5ub2RlVHlwZSA9PT0gMTtcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoYSkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGEpID09PSAnW29iamVjdCBBcnJheV0nO1xufVxuXG5mdW5jdGlvbiBpc0NoZWNrYWJsZSAoZWxlbSkge1xuICByZXR1cm4gJ2NoZWNrZWQnIGluIGVsZW0gJiYgZWxlbS50eXBlID09PSAncmFkaW8nIHx8IGVsZW0udHlwZSA9PT0gJ2NoZWNrYm94Jztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGlzTm9kZTogaXNOb2RlLFxuICBpc0VsZW1lbnQ6IGlzRWxlbWVudCxcbiAgaXNBcnJheTogaXNBcnJheSxcbiAgaXNDaGVja2FibGU6IGlzQ2hlY2thYmxlXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBoeXBoZW5Ub0NhbWVsIChoeXBoZW5zKSB7XG4gIHZhciBwYXJ0ID0gLy0oW2Etel0pL2c7XG4gIHJldHVybiBoeXBoZW5zLnJlcGxhY2UocGFydCwgZnVuY3Rpb24gKGcsIG0pIHtcbiAgICByZXR1cm4gbS50b1VwcGVyQ2FzZSgpO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGh5cGhlblRvQ2FtZWw6IGh5cGhlblRvQ2FtZWxcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5qYWRlPWUoKX19KGZ1bmN0aW9uKCl7dmFyIGRlZmluZSxtb2R1bGUsZXhwb3J0cztyZXR1cm4gKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoezE6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuJ3VzZSBzdHJpY3QnO1xyXG5cclxuLyoqXHJcbiAqIE1lcmdlIHR3byBhdHRyaWJ1dGUgb2JqZWN0cyBnaXZpbmcgcHJlY2VkZW5jZVxyXG4gKiB0byB2YWx1ZXMgaW4gb2JqZWN0IGBiYC4gQ2xhc3NlcyBhcmUgc3BlY2lhbC1jYXNlZFxyXG4gKiBhbGxvd2luZyBmb3IgYXJyYXlzIGFuZCBtZXJnaW5nL2pvaW5pbmcgYXBwcm9wcmlhdGVseVxyXG4gKiByZXN1bHRpbmcgaW4gYSBzdHJpbmcuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBhXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBiXHJcbiAqIEByZXR1cm4ge09iamVjdH0gYVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLm1lcmdlID0gZnVuY3Rpb24gbWVyZ2UoYSwgYikge1xyXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICB2YXIgYXR0cnMgPSBhWzBdO1xyXG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGF0dHJzID0gbWVyZ2UoYXR0cnMsIGFbaV0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGF0dHJzO1xyXG4gIH1cclxuICB2YXIgYWMgPSBhWydjbGFzcyddO1xyXG4gIHZhciBiYyA9IGJbJ2NsYXNzJ107XHJcblxyXG4gIGlmIChhYyB8fCBiYykge1xyXG4gICAgYWMgPSBhYyB8fCBbXTtcclxuICAgIGJjID0gYmMgfHwgW107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWMpKSBhYyA9IFthY107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYmMpKSBiYyA9IFtiY107XHJcbiAgICBhWydjbGFzcyddID0gYWMuY29uY2F0KGJjKS5maWx0ZXIobnVsbHMpO1xyXG4gIH1cclxuXHJcbiAgZm9yICh2YXIga2V5IGluIGIpIHtcclxuICAgIGlmIChrZXkgIT0gJ2NsYXNzJykge1xyXG4gICAgICBhW2tleV0gPSBiW2tleV07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBGaWx0ZXIgbnVsbCBgdmFsYHMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsXHJcbiAqIEByZXR1cm4ge0Jvb2xlYW59XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmZ1bmN0aW9uIG51bGxzKHZhbCkge1xyXG4gIHJldHVybiB2YWwgIT0gbnVsbCAmJiB2YWwgIT09ICcnO1xyXG59XHJcblxyXG4vKipcclxuICogam9pbiBhcnJheSBhcyBjbGFzc2VzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmpvaW5DbGFzc2VzID0gam9pbkNsYXNzZXM7XHJcbmZ1bmN0aW9uIGpvaW5DbGFzc2VzKHZhbCkge1xyXG4gIHJldHVybiBBcnJheS5pc0FycmF5KHZhbCkgPyB2YWwubWFwKGpvaW5DbGFzc2VzKS5maWx0ZXIobnVsbHMpLmpvaW4oJyAnKSA6IHZhbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHtBcnJheX0gY2xhc3Nlc1xyXG4gKiBAcGFyYW0ge0FycmF5LjxCb29sZWFuPn0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmNscyA9IGZ1bmN0aW9uIGNscyhjbGFzc2VzLCBlc2NhcGVkKSB7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2xhc3Nlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgaWYgKGVzY2FwZWQgJiYgZXNjYXBlZFtpXSkge1xyXG4gICAgICBidWYucHVzaChleHBvcnRzLmVzY2FwZShqb2luQ2xhc3NlcyhbY2xhc3Nlc1tpXV0pKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBidWYucHVzaChqb2luQ2xhc3NlcyhjbGFzc2VzW2ldKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHZhciB0ZXh0ID0gam9pbkNsYXNzZXMoYnVmKTtcclxuICBpZiAodGV4dC5sZW5ndGgpIHtcclxuICAgIHJldHVybiAnIGNsYXNzPVwiJyArIHRleHQgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyc7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gYXR0cmlidXRlLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5XHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcclxuICogQHBhcmFtIHtCb29sZWFufSBlc2NhcGVkXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gdGVyc2VcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5hdHRyID0gZnVuY3Rpb24gYXR0cihrZXksIHZhbCwgZXNjYXBlZCwgdGVyc2UpIHtcclxuICBpZiAoJ2Jvb2xlYW4nID09IHR5cGVvZiB2YWwgfHwgbnVsbCA9PSB2YWwpIHtcclxuICAgIGlmICh2YWwpIHtcclxuICAgICAgcmV0dXJuICcgJyArICh0ZXJzZSA/IGtleSA6IGtleSArICc9XCInICsga2V5ICsgJ1wiJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gJyc7XHJcbiAgICB9XHJcbiAgfSBlbHNlIGlmICgwID09IGtleS5pbmRleE9mKCdkYXRhJykgJiYgJ3N0cmluZycgIT0gdHlwZW9mIHZhbCkge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArIFwiPSdcIiArIEpTT04uc3RyaW5naWZ5KHZhbCkucmVwbGFjZSgvJy9nLCAnJmFwb3M7JykgKyBcIidcIjtcclxuICB9IGVsc2UgaWYgKGVzY2FwZWQpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyAnPVwiJyArIGV4cG9ydHMuZXNjYXBlKHZhbCkgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyB2YWwgKyAnXCInO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZXMgb2JqZWN0LlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBlc2NhcGVkXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0cnMgPSBmdW5jdGlvbiBhdHRycyhvYmosIHRlcnNlKXtcclxuICB2YXIgYnVmID0gW107XHJcblxyXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcclxuXHJcbiAgaWYgKGtleXMubGVuZ3RoKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgdmFyIGtleSA9IGtleXNbaV1cclxuICAgICAgICAsIHZhbCA9IG9ialtrZXldO1xyXG5cclxuICAgICAgaWYgKCdjbGFzcycgPT0ga2V5KSB7XHJcbiAgICAgICAgaWYgKHZhbCA9IGpvaW5DbGFzc2VzKHZhbCkpIHtcclxuICAgICAgICAgIGJ1Zi5wdXNoKCcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGJ1Zi5wdXNoKGV4cG9ydHMuYXR0cihrZXksIHZhbCwgZmFsc2UsIHRlcnNlKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBidWYuam9pbignJyk7XHJcbn07XHJcblxyXG4vKipcclxuICogRXNjYXBlIHRoZSBnaXZlbiBzdHJpbmcgb2YgYGh0bWxgLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaHRtbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMuZXNjYXBlID0gZnVuY3Rpb24gZXNjYXBlKGh0bWwpe1xyXG4gIHZhciByZXN1bHQgPSBTdHJpbmcoaHRtbClcclxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXHJcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXHJcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpO1xyXG4gIGlmIChyZXN1bHQgPT09ICcnICsgaHRtbCkgcmV0dXJuIGh0bWw7XHJcbiAgZWxzZSByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlLXRocm93IHRoZSBnaXZlbiBgZXJyYCBpbiBjb250ZXh0IHRvIHRoZVxyXG4gKiB0aGUgamFkZSBpbiBgZmlsZW5hbWVgIGF0IHRoZSBnaXZlbiBgbGluZW5vYC5cclxuICpcclxuICogQHBhcmFtIHtFcnJvcn0gZXJyXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGluZW5vXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMucmV0aHJvdyA9IGZ1bmN0aW9uIHJldGhyb3coZXJyLCBmaWxlbmFtZSwgbGluZW5vLCBzdHIpe1xyXG4gIGlmICghKGVyciBpbnN0YW5jZW9mIEVycm9yKSkgdGhyb3cgZXJyO1xyXG4gIGlmICgodHlwZW9mIHdpbmRvdyAhPSAndW5kZWZpbmVkJyB8fCAhZmlsZW5hbWUpICYmICFzdHIpIHtcclxuICAgIGVyci5tZXNzYWdlICs9ICcgb24gbGluZSAnICsgbGluZW5vO1xyXG4gICAgdGhyb3cgZXJyO1xyXG4gIH1cclxuICB0cnkge1xyXG4gICAgc3RyID0gc3RyIHx8IF9kZXJlcV8oJ2ZzJykucmVhZEZpbGVTeW5jKGZpbGVuYW1lLCAndXRmOCcpXHJcbiAgfSBjYXRjaCAoZXgpIHtcclxuICAgIHJldGhyb3coZXJyLCBudWxsLCBsaW5lbm8pXHJcbiAgfVxyXG4gIHZhciBjb250ZXh0ID0gM1xyXG4gICAgLCBsaW5lcyA9IHN0ci5zcGxpdCgnXFxuJylcclxuICAgICwgc3RhcnQgPSBNYXRoLm1heChsaW5lbm8gLSBjb250ZXh0LCAwKVxyXG4gICAgLCBlbmQgPSBNYXRoLm1pbihsaW5lcy5sZW5ndGgsIGxpbmVubyArIGNvbnRleHQpO1xyXG5cclxuICAvLyBFcnJvciBjb250ZXh0XHJcbiAgdmFyIGNvbnRleHQgPSBsaW5lcy5zbGljZShzdGFydCwgZW5kKS5tYXAoZnVuY3Rpb24obGluZSwgaSl7XHJcbiAgICB2YXIgY3VyciA9IGkgKyBzdGFydCArIDE7XHJcbiAgICByZXR1cm4gKGN1cnIgPT0gbGluZW5vID8gJyAgPiAnIDogJyAgICAnKVxyXG4gICAgICArIGN1cnJcclxuICAgICAgKyAnfCAnXHJcbiAgICAgICsgbGluZTtcclxuICB9KS5qb2luKCdcXG4nKTtcclxuXHJcbiAgLy8gQWx0ZXIgZXhjZXB0aW9uIG1lc3NhZ2VcclxuICBlcnIucGF0aCA9IGZpbGVuYW1lO1xyXG4gIGVyci5tZXNzYWdlID0gKGZpbGVuYW1lIHx8ICdKYWRlJykgKyAnOicgKyBsaW5lbm9cclxuICAgICsgJ1xcbicgKyBjb250ZXh0ICsgJ1xcblxcbicgKyBlcnIubWVzc2FnZTtcclxuICB0aHJvdyBlcnI7XHJcbn07XHJcblxufSx7XCJmc1wiOjJ9XSwyOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnamFkZS9ydW50aW1lJyk7XG4iLCJ2YXIgbm93ID0gcmVxdWlyZSgncGVyZm9ybWFuY2Utbm93JylcbiAgLCBnbG9iYWwgPSB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IHt9IDogd2luZG93XG4gICwgdmVuZG9ycyA9IFsnbW96JywgJ3dlYmtpdCddXG4gICwgc3VmZml4ID0gJ0FuaW1hdGlvbkZyYW1lJ1xuICAsIHJhZiA9IGdsb2JhbFsncmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgY2FmID0gZ2xvYmFsWydjYW5jZWwnICsgc3VmZml4XSB8fCBnbG9iYWxbJ2NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxuICAsIGlzTmF0aXZlID0gdHJ1ZVxuXG5mb3IodmFyIGkgPSAwOyBpIDwgdmVuZG9ycy5sZW5ndGggJiYgIXJhZjsgaSsrKSB7XG4gIHJhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ1JlcXVlc3QnICsgc3VmZml4XVxuICBjYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWwnICsgc3VmZml4XVxuICAgICAgfHwgZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICBpc05hdGl2ZSA9IGZhbHNlXG5cbiAgdmFyIGxhc3QgPSAwXG4gICAgLCBpZCA9IDBcbiAgICAsIHF1ZXVlID0gW11cbiAgICAsIGZyYW1lRHVyYXRpb24gPSAxMDAwIC8gNjBcblxuICByYWYgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGlmKHF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIF9ub3cgPSBub3coKVxuICAgICAgICAsIG5leHQgPSBNYXRoLm1heCgwLCBmcmFtZUR1cmF0aW9uIC0gKF9ub3cgLSBsYXN0KSlcbiAgICAgIGxhc3QgPSBuZXh0ICsgX25vd1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNwID0gcXVldWUuc2xpY2UoMClcbiAgICAgICAgLy8gQ2xlYXIgcXVldWUgaGVyZSB0byBwcmV2ZW50XG4gICAgICAgIC8vIGNhbGxiYWNrcyBmcm9tIGFwcGVuZGluZyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdG8gdGhlIGN1cnJlbnQgZnJhbWUncyBxdWV1ZVxuICAgICAgICBxdWV1ZS5sZW5ndGggPSAwXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmKCFjcFtpXS5jYW5jZWxsZWQpIHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgY3BbaV0uY2FsbGJhY2sobGFzdClcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LCBNYXRoLnJvdW5kKG5leHQpKVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHtcbiAgICAgIGhhbmRsZTogKytpZCxcbiAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgIGNhbmNlbGxlZDogZmFsc2VcbiAgICB9KVxuICAgIHJldHVybiBpZFxuICB9XG5cbiAgY2FmID0gZnVuY3Rpb24oaGFuZGxlKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZihxdWV1ZVtpXS5oYW5kbGUgPT09IGhhbmRsZSkge1xuICAgICAgICBxdWV1ZVtpXS5jYW5jZWxsZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gV3JhcCBpbiBhIG5ldyBmdW5jdGlvbiB0byBwcmV2ZW50XG4gIC8vIGBjYW5jZWxgIHBvdGVudGlhbGx5IGJlaW5nIGFzc2lnbmVkXG4gIC8vIHRvIHRoZSBuYXRpdmUgckFGIGZ1bmN0aW9uXG4gIGlmKCFpc05hdGl2ZSkge1xuICAgIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZuKVxuICB9XG4gIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZ1bmN0aW9uKCkge1xuICAgIHRyeXtcbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICB9XG4gIH0pXG59XG5tb2R1bGUuZXhwb3J0cy5jYW5jZWwgPSBmdW5jdGlvbigpIHtcbiAgY2FmLmFwcGx5KGdsb2JhbCwgYXJndW1lbnRzKVxufVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8vIEdlbmVyYXRlZCBieSBDb2ZmZWVTY3JpcHQgMS42LjNcbihmdW5jdGlvbigpIHtcbiAgdmFyIGdldE5hbm9TZWNvbmRzLCBocnRpbWUsIGxvYWRUaW1lO1xuXG4gIGlmICgodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHBlcmZvcm1hbmNlICE9PSBudWxsKSAmJiBwZXJmb3JtYW5jZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIH07XG4gIH0gZWxzZSBpZiAoKHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MgIT09IG51bGwpICYmIHByb2Nlc3MuaHJ0aW1lKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAoZ2V0TmFub1NlY29uZHMoKSAtIGxvYWRUaW1lKSAvIDFlNjtcbiAgICB9O1xuICAgIGhydGltZSA9IHByb2Nlc3MuaHJ0aW1lO1xuICAgIGdldE5hbm9TZWNvbmRzID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaHI7XG4gICAgICBociA9IGhydGltZSgpO1xuICAgICAgcmV0dXJuIGhyWzBdICogMWU5ICsgaHJbMV07XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IGdldE5hbm9TZWNvbmRzKCk7XG4gIH0gZWxzZSBpZiAoRGF0ZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIERhdGUubm93KCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgfSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9XG5cbn0pLmNhbGwodGhpcyk7XG5cbi8qXG4vL0Agc291cmNlTWFwcGluZ1VSTD1wZXJmb3JtYW5jZS1ub3cubWFwXG4qL1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIikpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgY2xvbmUgPSByZXF1aXJlKCcuL2Nsb25lJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBwYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4vaXNOYXRpdmUnKTtcbnZhciBtb2Rlcm4gPSAnaGlzdG9yeScgaW4gd2luZG93ICYmICdwdXNoU3RhdGUnIGluIGhpc3Rvcnk7XG5cbi8vIEdvb2dsZSBDaHJvbWUgMzggb24gaU9TIG1ha2VzIHdlaXJkIGNoYW5nZXMgdG8gaGlzdG9yeS5yZXBsYWNlU3RhdGUsIGJyZWFraW5nIGl0XG52YXIgbmF0aXZlUmVwbGFjZSA9IG1vZGVybiAmJiBpc05hdGl2ZSh3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUpO1xuXG5mdW5jdGlvbiBnbyAodXJsLCBvcHRpb25zKSB7XG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIGRpcmVjdGlvbiA9IG8ucmVwbGFjZVN0YXRlID8gJ3JlcGxhY2VTdGF0ZScgOiAncHVzaFN0YXRlJztcbiAgdmFyIGNvbnRleHQgPSBvLmNvbnRleHQgfHwgbnVsbDtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCk7XG4gIGlmICghcm91dGUpIHtcbiAgICBpZiAoby5zdHJpY3QgIT09IHRydWUpIHtcbiAgICAgIGxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBzYW1lID0gcm91dGVyLmVxdWFscyhyb3V0ZSwgc3RhdGUucm91dGUpO1xuICBpZiAoc2FtZSAmJiBvLmZvcmNlICE9PSB0cnVlKSB7XG4gICAgaWYgKHJvdXRlLnBhcnRzLmhhc2gpIHtcbiAgICAgIHNjcm9sbEludG8ocm91dGUucGFydHMuaGFzaC5zdWJzdHIoMSksIG8uc2Nyb2xsKTtcbiAgICAgIG5hdmlnYXRpb24ocm91dGUsIHN0YXRlLm1vZGVsLCBkaXJlY3Rpb24pO1xuICAgICAgcmV0dXJuOyAvLyBhbmNob3IgaGFzaC1uYXZpZ2F0aW9uIG9uIHNhbWUgcGFnZSBpZ25vcmVzIHJvdXRlclxuICAgIH1cbiAgICByZXNvbHZlZChudWxsLCBzdGF0ZS5tb2RlbCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCFtb2Rlcm4pIHtcbiAgICBsb2NhdGlvbi5ocmVmID0gdXJsO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGZldGNoZXIuYWJvcnRQZW5kaW5nKCk7XG4gIGZldGNoZXIocm91dGUsIHsgZWxlbWVudDogY29udGV4dCwgc291cmNlOiAnaW50ZW50JyB9LCByZXNvbHZlZCk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZWQgKGVyciwgbW9kZWwpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5hdmlnYXRpb24ocm91dGUsIG1vZGVsLCBkaXJlY3Rpb24pO1xuICAgIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICAgIHNjcm9sbEludG8obnVsbCwgby5zY3JvbGwpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0IChtb2RlbCkge1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIGVtaXR0ZXIuZW1pdCgnc3RhcnQnLCBzdGF0ZS5jb250YWluZXIsIG1vZGVsKTtcbiAgcGFydGlhbChzdGF0ZS5jb250YWluZXIsIG51bGwsIG1vZGVsLCByb3V0ZSwgeyByZW5kZXI6IGZhbHNlIH0pO1xuICB3aW5kb3cub25wb3BzdGF0ZSA9IGJhY2s7XG59XG5cbmZ1bmN0aW9uIGJhY2sgKGUpIHtcbiAgdmFyIGVtcHR5ID0gIShlICYmIGUuc3RhdGUgJiYgZS5zdGF0ZS5tb2RlbCk7XG4gIGlmIChlbXB0eSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbW9kZWwgPSBlLnN0YXRlLm1vZGVsO1xuICB2YXIgcm91dGUgPSByZXBsYWNlV2l0aChtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUpO1xuICByYWYoc2Nyb2xsKTtcblxuICBmdW5jdGlvbiBzY3JvbGwgKCkge1xuICAgIHNjcm9sbEludG8ob3JFbXB0eShyb3V0ZS5wYXJ0cy5oYXNoKS5zdWJzdHIoMSkpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNjcm9sbEludG8gKGlkLCBlbmFibGVkKSB7XG4gIGlmIChlbmFibGVkID09PSBmYWxzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgZWxlbSA9IGlkICYmIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIGlmIChlbGVtICYmIGVsZW0uc2Nyb2xsSW50b1ZpZXcpIHtcbiAgICBlbGVtLnNjcm9sbEludG9WaWV3KCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVwbGFjZVdpdGggKG1vZGVsKSB7XG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcbiAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdyZXBsYWNlU3RhdGUnKTtcbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRpb24gKHJvdXRlLCBtb2RlbCwgZGlyZWN0aW9uKSB7XG4gIHN0YXRlLnJvdXRlID0gcm91dGU7XG4gIHN0YXRlLm1vZGVsID0gY2xvbmUobW9kZWwpO1xuICBpZiAobW9kZWwudGl0bGUpIHtcbiAgICBkb2N1bWVudC50aXRsZSA9IG1vZGVsLnRpdGxlO1xuICB9XG4gIGlmIChtb2Rlcm4gJiYgZGlyZWN0aW9uICE9PSAncmVwbGFjZVN0YXRlJyB8fCBuYXRpdmVSZXBsYWNlKSB7XG4gICAgaGlzdG9yeVtkaXJlY3Rpb25dKHsgbW9kZWw6IG1vZGVsIH0sIG1vZGVsLnRpdGxlLCByb3V0ZS51cmwpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzdGFydDogc3RhcnQsXG4gIGdvOiBnb1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xudmFyIG9uY2UgPSByZXF1aXJlKCcuL29uY2UnKTtcbnZhciByYXcgPSByZXF1aXJlKCcuL3N0b3Jlcy9yYXcnKTtcbnZhciBpZGIgPSByZXF1aXJlKCcuL3N0b3Jlcy9pZGInKTtcbnZhciBzdG9yZXMgPSBbcmF3LCBpZGJdO1xuXG5mdW5jdGlvbiBnZXQgKHVybCwgZG9uZSkge1xuICB2YXIgaSA9IDA7XG5cbiAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgdmFyIGdvdE9uY2UgPSBvbmNlKGdvdCk7XG4gICAgdmFyIHN0b3JlID0gc3RvcmVzW2krK107XG4gICAgaWYgKHN0b3JlKSB7XG4gICAgICBzdG9yZS5nZXQodXJsLCBnb3RPbmNlKTtcbiAgICAgIHNldFRpbWVvdXQoZ290T25jZSwgc3RvcmUgPT09IGlkYiA/IDEwMCA6IDUwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDE1MG1zIG9uIGNhY2hpbmcgbGF5ZXJzXG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUodHJ1ZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ290IChlcnIsIGl0ZW0pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSBlbHNlIGlmIChpdGVtICYmIHR5cGVvZiBpdGVtLmV4cGlyZXMgPT09ICdudW1iZXInICYmIERhdGUubm93KCkgPCBpdGVtLmV4cGlyZXMpIHtcbiAgICAgICAgZG9uZShmYWxzZSwgY2xvbmUoaXRlbS5kYXRhKSk7IC8vIGFsd2F5cyByZXR1cm4gYSB1bmlxdWUgY29weVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIG5leHQoKTtcbn1cblxuZnVuY3Rpb24gc2V0ICh1cmwsIGRhdGEsIGR1cmF0aW9uKSB7XG4gIGlmIChkdXJhdGlvbiA8IDEpIHsgLy8gc2FuaXR5XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBjbG9uZWQgPSBjbG9uZShkYXRhKTsgLy8gZnJlZXplIGEgY29weSBmb3Igb3VyIHJlY29yZHNcbiAgc3RvcmVzLmZvckVhY2goc3RvcmUpO1xuICBmdW5jdGlvbiBzdG9yZSAocykge1xuICAgIHMuc2V0KHVybCwge1xuICAgICAgZGF0YTogY2xvbmVkLFxuICAgICAgZXhwaXJlczogRGF0ZS5ub3coKSArIGR1cmF0aW9uXG4gICAgfSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNhY2hlID0gcmVxdWlyZSgnLi9jYWNoZScpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBkZWZhdWx0cyA9IDE1O1xudmFyIGJhc2VsaW5lO1xuXG5mdW5jdGlvbiBlICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIGdldEtleSAocm91dGUpIHtcbiAgcmV0dXJuIHJvdXRlLnBhcnRzLnBhdGhuYW1lICsgZShyb3V0ZS5wYXJ0cy5xdWVyeSk7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkdXJhdGlvbiwgcm91dGUpIHtcbiAgYmFzZWxpbmUgPSBwYXJzZUR1cmF0aW9uKGR1cmF0aW9uKTtcbiAgaWYgKGJhc2VsaW5lIDwgMSkge1xuICAgIHN0YXRlLmNhY2hlID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG4gIGludGVyY2VwdG9yLmFkZChpbnRlcmNlcHQpO1xuICBlbWl0dGVyLm9uKCdmZXRjaC5kb25lJywgcGVyc2lzdCk7XG4gIHN0YXRlLmNhY2hlID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW50ZXJjZXB0IChlKSB7XG4gIGNhY2hlLmdldChnZXRLZXkoZS5yb3V0ZSksIHJlc3VsdCk7XG5cbiAgZnVuY3Rpb24gcmVzdWx0IChlcnIsIGRhdGEpIHtcbiAgICBpZiAoIWVyciAmJiBkYXRhKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KGRhdGEpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJzZUR1cmF0aW9uICh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT09IHRydWUpIHtcbiAgICByZXR1cm4gYmFzZWxpbmUgfHwgZGVmYXVsdHM7XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3QgKHJvdXRlLCBjb250ZXh0LCBkYXRhKSB7XG4gIGlmICghc3RhdGUuY2FjaGUpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvdXRlLmNhY2hlID09PSBmYWxzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgZCA9IGJhc2VsaW5lO1xuICBpZiAodHlwZW9mIHJvdXRlLmNhY2hlID09PSAnbnVtYmVyJykge1xuICAgIGQgPSByb3V0ZS5jYWNoZTtcbiAgfVxuICBjYWNoZS5zZXQoZ2V0S2V5KHJvdXRlKSwgZGF0YSwgcGFyc2VEdXJhdGlvbihkKSAqIDEwMDApO1xufVxuXG5mdW5jdGlvbiByZWFkeSAoZm4pIHtcbiAgaWYgKHN0YXRlLmNhY2hlKSB7XG4gICAgaWRiLnRlc3RlZChmbik7IC8vIHdhaXQgb24gaWRiIGNvbXBhdGliaWxpdHkgdGVzdHNcbiAgfSBlbHNlIHtcbiAgICBmbigpOyAvLyBjYWNoaW5nIGlzIGEgbm8tb3BcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2V0dXA6IHNldHVwLFxuICBwZXJzaXN0OiBwZXJzaXN0LFxuICByZWFkeTogcmVhZHlcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGNsb25lICh2YWx1ZSkge1xuICByZXR1cm4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsb25lO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZW1pdHRlcih7fSwgeyB0aHJvd3M6IGZhbHNlIH0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBhZGQgKGVsZW1lbnQsIHR5cGUsIGZuKSB7XG4gIGlmIChlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZm4pO1xuICB9IGVsc2UgaWYgKGVsZW1lbnQuYXR0YWNoRXZlbnQpIHtcbiAgICBlbGVtZW50LmF0dGFjaEV2ZW50KCdvbicgKyB0eXBlLCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBmbikpO1xuICB9IGVsc2Uge1xuICAgIGVsZW1lbnRbJ29uJyArIHR5cGVdID0gZm47XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IHdpbmRvdy5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ICA9IGUucHJldmVudERlZmF1bHQgIHx8IGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0ICgpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9O1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uID0gZS5zdG9wUHJvcGFnYXRpb24gfHwgZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uICgpIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9O1xuICAgIGZuLmNhbGwoZWxlbWVudCwgZSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJy4veGhyJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGxhc3RYaHIgPSB7fTtcblxuZnVuY3Rpb24gZSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBqc29uaWZ5IChyb3V0ZSkge1xuICB2YXIgcGFydHMgPSByb3V0ZS5wYXJ0cztcbiAgdmFyIHFzID0gZShwYXJ0cy5zZWFyY2gpO1xuICB2YXIgcCA9IHFzID8gJyYnIDogJz8nO1xuICByZXR1cm4gcGFydHMucGF0aG5hbWUgKyBxcyArIHAgKyAnanNvbic7XG59XG5cbmZ1bmN0aW9uIGFib3J0IChzb3VyY2UpIHtcbiAgaWYgKGxhc3RYaHJbc291cmNlXSkge1xuICAgIGxhc3RYaHJbc291cmNlXS5hYm9ydCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFib3J0UGVuZGluZyAoKSB7XG4gIE9iamVjdC5rZXlzKGxhc3RYaHIpLmZvckVhY2goYWJvcnQpO1xuICBsYXN0WGhyID0ge307XG59XG5cbmZ1bmN0aW9uIGZldGNoZXIgKHJvdXRlLCBjb250ZXh0LCBkb25lKSB7XG4gIHZhciB1cmwgPSByb3V0ZS51cmw7XG4gIGlmIChsYXN0WGhyW2NvbnRleHQuc291cmNlXSkge1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdLmFib3J0KCk7XG4gICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSBudWxsO1xuICB9XG4gIGludGVyY2VwdG9yLmV4ZWN1dGUocm91dGUsIGFmdGVySW50ZXJjZXB0b3JzKTtcblxuICBmdW5jdGlvbiBhZnRlckludGVyY2VwdG9ycyAoZXJyLCByZXN1bHQpIHtcbiAgICBpZiAoIWVyciAmJiByZXN1bHQuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgZG9uZShudWxsLCByZXN1bHQubW9kZWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLnN0YXJ0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgbGFzdFhocltjb250ZXh0LnNvdXJjZV0gPSB4aHIoanNvbmlmeShyb3V0ZSksIG5vdGlmeSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbm90aWZ5IChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBpZiAoZXJyLm1lc3NhZ2UgPT09ICdhYm9ydGVkJykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmFib3J0Jywgcm91dGUsIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5lcnJvcicsIHJvdXRlLCBjb250ZXh0LCBlcnIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2ZldGNoLmRvbmUnLCByb3V0ZSwgY29udGV4dCwgZGF0YSk7XG4gICAgfVxuICAgIGRvbmUoZXJyLCBkYXRhKTtcbiAgfVxufVxuXG5mZXRjaGVyLmFib3J0UGVuZGluZyA9IGFib3J0UGVuZGluZztcblxubW9kdWxlLmV4cG9ydHMgPSBmZXRjaGVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGxpbmtzID0gcmVxdWlyZSgnLi9saW5rcycpO1xuXG5mdW5jdGlvbiBhdHRhY2ggKCkge1xuICBlbWl0dGVyLm9uKCdzdGFydCcsIGxpbmtzKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF0dGFjaDogYXR0YWNoXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgaW50ZXJjZXB0b3IgPSByZXF1aXJlKCcuL2ludGVyY2VwdG9yJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9lbWl0dGVyJyk7XG52YXIgaG9va3MgPSByZXF1aXJlKCcuL2hvb2tzJyk7XG52YXIgcGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xudmFyIG1vdW50ID0gcmVxdWlyZSgnLi9tb3VudCcpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG5cbmhvb2tzLmF0dGFjaCgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbW91bnQ6IG1vdW50LFxuICBwYXJ0aWFsOiBwYXJ0aWFsLnN0YW5kYWxvbmUsXG4gIG9uOiBlbWl0dGVyLm9uLmJpbmQoZW1pdHRlciksXG4gIG9uY2U6IGVtaXR0ZXIub25jZS5iaW5kKGVtaXR0ZXIpLFxuICBvZmY6IGVtaXR0ZXIub2ZmLmJpbmQoZW1pdHRlciksXG4gIGludGVyY2VwdDogaW50ZXJjZXB0b3IuYWRkLFxuICBuYXZpZ2F0ZTogYWN0aXZhdG9yLmdvLFxuICBzdGF0ZTogc3RhdGUsXG4gIHJvdXRlOiByb3V0ZXJcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhLmVtaXR0ZXInKTtcbnZhciBvbmNlID0gcmVxdWlyZSgnLi9vbmNlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBpbnRlcmNlcHRvcnMgPSBlbWl0dGVyKHsgY291bnQ6IDAgfSwgeyBhc3luYzogdHJ1ZSB9KTtcblxuZnVuY3Rpb24gZ2V0SW50ZXJjZXB0b3JFdmVudCAocm91dGUpIHtcbiAgdmFyIGUgPSB7XG4gICAgdXJsOiByb3V0ZS51cmwsXG4gICAgcm91dGU6IHJvdXRlLFxuICAgIHBhcnRzOiByb3V0ZS5wYXJ0cyxcbiAgICBtb2RlbDogbnVsbCxcbiAgICBjYW5QcmV2ZW50RGVmYXVsdDogdHJ1ZSxcbiAgICBkZWZhdWx0UHJldmVudGVkOiBmYWxzZSxcbiAgICBwcmV2ZW50RGVmYXVsdDogb25jZShwcmV2ZW50RGVmYXVsdClcbiAgfTtcblxuICBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAobW9kZWwpIHtcbiAgICBpZiAoIWUuY2FuUHJldmVudERlZmF1bHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZS5jYW5QcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgIGUuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgZS5tb2RlbCA9IG1vZGVsO1xuICB9XG5cbiAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGFkZCAoYWN0aW9uLCBmbikge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIGZuID0gYWN0aW9uO1xuICAgIGFjdGlvbiA9ICcqJztcbiAgfVxuICBpbnRlcmNlcHRvcnMuY291bnQrKztcbiAgaW50ZXJjZXB0b3JzLm9uKGFjdGlvbiwgZm4pO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlU3luYyAocm91dGUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlKTtcblxuICBpbnRlcmNlcHRvcnMuZW1pdCgnKicsIGUpO1xuICBpbnRlcmNlcHRvcnMuZW1pdChyb3V0ZS5hY3Rpb24sIGUpO1xuXG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBleGVjdXRlIChyb3V0ZSwgZG9uZSkge1xuICB2YXIgZSA9IGdldEludGVyY2VwdG9yRXZlbnQocm91dGUpO1xuICBpZiAoaW50ZXJjZXB0b3JzLmNvdW50ID09PSAwKSB7IC8vIGZhaWwgZmFzdFxuICAgIGVuZCgpOyByZXR1cm47XG4gIH1cbiAgdmFyIGZuID0gb25jZShlbmQpO1xuICB2YXIgcHJldmVudERlZmF1bHRCYXNlID0gZS5wcmV2ZW50RGVmYXVsdDtcblxuICBlLnByZXZlbnREZWZhdWx0ID0gb25jZShwcmV2ZW50RGVmYXVsdEVuZHMpO1xuXG4gIGludGVyY2VwdG9ycy5lbWl0KCcqJywgZSk7XG4gIGludGVyY2VwdG9ycy5lbWl0KHJvdXRlLmFjdGlvbiwgZSk7XG5cbiAgc2V0VGltZW91dChmbiwgMjAwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDIwMG1zIHdhaXRpbmcgb24gaW50ZXJjZXB0b3JzXG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHRFbmRzICgpIHtcbiAgICBwcmV2ZW50RGVmYXVsdEJhc2UuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICBmbigpO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kICgpIHtcbiAgICBlLmNhblByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgZG9uZShudWxsLCBlKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGQsXG4gIGV4ZWN1dGU6IGV4ZWN1dGVcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8vIHNvdXJjZTogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vamRhbHRvbi81ZTM0ZDg5MDEwNWFjYTQ0Mzk5ZlxuLy8gdGhhbmtzIEBqZGFsdG9uIVxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nOyAvLyB1c2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIGBbW0NsYXNzXV1gIG9mIHZhbHVlc1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7IC8vIHVzZWQgdG8gcmVzb2x2ZSB0aGUgZGVjb21waWxlZCBzb3VyY2Ugb2YgZnVuY3Rpb25zXG52YXIgaG9zdCA9IC9eXFxbb2JqZWN0IC4rP0NvbnN0cnVjdG9yXFxdJC87IC8vIHVzZWQgdG8gZGV0ZWN0IGhvc3QgY29uc3RydWN0b3JzIChTYWZhcmkgPiA0OyByZWFsbHkgdHlwZWQgYXJyYXkgc3BlY2lmaWMpXG5cbi8vIEVzY2FwZSBhbnkgc3BlY2lhbCByZWdleHAgY2hhcmFjdGVycy5cbnZhciBzcGVjaWFscyA9IC9bLiorP14ke30oKXxbXFxdXFwvXFxcXF0vZztcblxuLy8gUmVwbGFjZSBtZW50aW9ucyBvZiBgdG9TdHJpbmdgIHdpdGggYC4qP2AgdG8ga2VlcCB0aGUgdGVtcGxhdGUgZ2VuZXJpYy5cbi8vIFJlcGxhY2UgdGhpbmcgbGlrZSBgZm9yIC4uLmAgdG8gc3VwcG9ydCBlbnZpcm9ubWVudHMsIGxpa2UgUmhpbm8sIHdoaWNoIGFkZCBleHRyYVxuLy8gaW5mbyBzdWNoIGFzIG1ldGhvZCBhcml0eS5cbnZhciBleHRyYXMgPSAvdG9TdHJpbmd8KGZ1bmN0aW9uKS4qPyg/PVxcXFxcXCgpfCBmb3IgLis/KD89XFxcXFxcXSkvZztcblxuLy8gQ29tcGlsZSBhIHJlZ2V4cCB1c2luZyBhIGNvbW1vbiBuYXRpdmUgbWV0aG9kIGFzIGEgdGVtcGxhdGUuXG4vLyBXZSBjaG9zZSBgT2JqZWN0I3RvU3RyaW5nYCBiZWNhdXNlIHRoZXJlJ3MgYSBnb29kIGNoYW5jZSBpdCBpcyBub3QgYmVpbmcgbXVja2VkIHdpdGguXG52YXIgZm5TdHJpbmcgPSBTdHJpbmcodG9TdHJpbmcpLnJlcGxhY2Uoc3BlY2lhbHMsICdcXFxcJCYnKS5yZXBsYWNlKGV4dHJhcywgJyQxLio/Jyk7XG52YXIgcmVOYXRpdmUgPSBuZXcgUmVnRXhwKCdeJyArIGZuU3RyaW5nICsgJyQnKTtcblxuZnVuY3Rpb24gaXNOYXRpdmUgKHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIC8vIFVzZSBgRnVuY3Rpb24jdG9TdHJpbmdgIHRvIGJ5cGFzcyB0aGUgdmFsdWUncyBvd24gYHRvU3RyaW5nYCBtZXRob2RcbiAgICAvLyBhbmQgYXZvaWQgYmVpbmcgZmFrZWQgb3V0LlxuICAgIHJldHVybiByZU5hdGl2ZS50ZXN0KGZuVG9TdHJpbmcuY2FsbCh2YWx1ZSkpO1xuICB9XG5cbiAgLy8gRmFsbGJhY2sgdG8gYSBob3N0IG9iamVjdCBjaGVjayBiZWNhdXNlIHNvbWUgZW52aXJvbm1lbnRzIHdpbGwgcmVwcmVzZW50XG4gIC8vIHRoaW5ncyBsaWtlIHR5cGVkIGFycmF5cyBhcyBET00gbWV0aG9kcyB3aGljaCBtYXkgbm90IGNvbmZvcm0gdG8gdGhlXG4gIC8vIG5vcm1hbCBuYXRpdmUgcGF0dGVybi5cbiAgcmV0dXJuICh2YWx1ZSAmJiB0eXBlID09PSAnb2JqZWN0JyAmJiBob3N0LnRlc3QodG9TdHJpbmcuY2FsbCh2YWx1ZSkpKSB8fCBmYWxzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc05hdGl2ZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMnKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgYWN0aXZhdG9yID0gcmVxdWlyZSgnLi9hY3RpdmF0b3InKTtcbnZhciBvcmlnaW4gPSBkb2N1bWVudC5sb2NhdGlvbi5vcmlnaW47XG52YXIgbGVmdENsaWNrID0gMTtcbnZhciBwcmVmZXRjaGluZyA9IFtdO1xudmFyIGNsaWNrc09uSG9sZCA9IFtdO1xuXG5mdW5jdGlvbiBsaW5rcyAoKSB7XG4gIGlmIChzdGF0ZS5wcmVmZXRjaCAmJiBzdGF0ZS5jYWNoZSkgeyAvLyBwcmVmZXRjaCB3aXRob3V0IGNhY2hlIG1ha2VzIG5vIHNlbnNlXG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAnbW91c2VvdmVyJywgbWF5YmVQcmVmZXRjaCk7XG4gICAgZXZlbnRzLmFkZChkb2N1bWVudC5ib2R5LCAndG91Y2hzdGFydCcsIG1heWJlUHJlZmV0Y2gpO1xuICB9XG4gIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ2NsaWNrJywgbWF5YmVSZXJvdXRlKTtcbn1cblxuZnVuY3Rpb24gc28gKGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLm9yaWdpbiA9PT0gb3JpZ2luO1xufVxuXG5mdW5jdGlvbiBsZWZ0Q2xpY2tPbkFuY2hvciAoZSwgYW5jaG9yKSB7XG4gIHJldHVybiBhbmNob3IucGF0aG5hbWUgJiYgZS53aGljaCA9PT0gbGVmdENsaWNrICYmICFlLm1ldGFLZXkgJiYgIWUuY3RybEtleTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0T3JBbmNob3IgKGUpIHtcbiAgdmFyIGFuY2hvciA9IGUudGFyZ2V0O1xuICB3aGlsZSAoYW5jaG9yKSB7XG4gICAgaWYgKGFuY2hvci50YWdOYW1lID09PSAnQScpIHtcbiAgICAgIHJldHVybiBhbmNob3I7XG4gICAgfVxuICAgIGFuY2hvciA9IGFuY2hvci5wYXJlbnRFbGVtZW50O1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUmVyb3V0ZSAoZSkge1xuICB2YXIgYW5jaG9yID0gdGFyZ2V0T3JBbmNob3IoZSk7XG4gIGlmIChhbmNob3IgJiYgc28oYW5jaG9yKSAmJiBsZWZ0Q2xpY2tPbkFuY2hvcihlLCBhbmNob3IpKSB7XG4gICAgcmVyb3V0ZShlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUHJlZmV0Y2ggKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikpIHtcbiAgICBwcmVmZXRjaChlLCBhbmNob3IpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG5vb3AgKCkge31cblxuZnVuY3Rpb24gZ2V0Um91dGUgKGFuY2hvcikge1xuICB2YXIgdXJsID0gYW5jaG9yLnBhdGhuYW1lICsgYW5jaG9yLnNlYXJjaCArIGFuY2hvci5oYXNoO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS5pZ25vcmUpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiByZXJvdXRlIChlLCBhbmNob3IpIHtcbiAgdmFyIHJvdXRlID0gZ2V0Um91dGUoYW5jaG9yKTtcbiAgaWYgKCFyb3V0ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByZXZlbnQoKTtcblxuICBpZiAocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgIGNsaWNrc09uSG9sZC5wdXNoKGFuY2hvcik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYWN0aXZhdG9yLmdvKHJvdXRlLnVybCwgeyBjb250ZXh0OiBhbmNob3IgfSk7XG5cbiAgZnVuY3Rpb24gcHJldmVudCAoKSB7IGUucHJldmVudERlZmF1bHQoKTsgfVxufVxuXG5mdW5jdGlvbiBwcmVmZXRjaCAoZSwgYW5jaG9yKSB7XG4gIHZhciByb3V0ZSA9IGdldFJvdXRlKGFuY2hvcik7XG4gIGlmICghcm91dGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAocHJlZmV0Y2hpbmcuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByZWZldGNoaW5nLnB1c2goYW5jaG9yKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBhbmNob3IsIHNvdXJjZTogJ3ByZWZldGNoJyB9LCByZXNvbHZlZCk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZWQgKGVyciwgZGF0YSkge1xuICAgIHByZWZldGNoaW5nLnNwbGljZShwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvciksIDEpO1xuICAgIGlmIChjbGlja3NPbkhvbGQuaW5kZXhPZihhbmNob3IpICE9PSAtMSkge1xuICAgICAgY2xpY2tzT25Ib2xkLnNwbGljZShjbGlja3NPbkhvbGQuaW5kZXhPZihhbmNob3IpLCAxKTtcbiAgICAgIGFjdGl2YXRvci5nbyhyb3V0ZS51cmwsIHsgY29udGV4dDogYW5jaG9yIH0pO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGxpbmtzO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdW5lc2NhcGUgPSByZXF1aXJlKCcuL3VuZXNjYXBlJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBhY3RpdmF0b3IgPSByZXF1aXJlKCcuL2FjdGl2YXRvcicpO1xudmFyIGNhY2hpbmcgPSByZXF1aXJlKCcuL2NhY2hpbmcnKTtcbnZhciBmZXRjaGVyID0gcmVxdWlyZSgnLi9mZXRjaGVyJyk7XG52YXIgZyA9IGdsb2JhbDtcbnZhciBtb3VudGVkO1xudmFyIGJvb3RlZDtcblxuZnVuY3Rpb24gb3JFbXB0eSAodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBtb3VudCAoY29udGFpbmVyLCB3aXJpbmcsIG9wdGlvbnMpIHtcbiAgdmFyIG8gPSBvcHRpb25zIHx8IHt9O1xuICBpZiAobW91bnRlZCkge1xuICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIGFscmVhZHkgbW91bnRlZCEnKTtcbiAgfVxuICBpZiAoIWNvbnRhaW5lciB8fCAhY29udGFpbmVyLnRhZ05hbWUpIHsgLy8gbmHDr3ZlIGlzIGVub3VnaFxuICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgZGVmaW5lIGFuIGFwcGxpY2F0aW9uIHJvb3QgY29udGFpbmVyIScpO1xuICB9XG5cbiAgbW91bnRlZCA9IHRydWU7XG5cbiAgc3RhdGUuY29udGFpbmVyID0gY29udGFpbmVyO1xuICBzdGF0ZS5jb250cm9sbGVycyA9IHdpcmluZy5jb250cm9sbGVycztcbiAgc3RhdGUudGVtcGxhdGVzID0gd2lyaW5nLnRlbXBsYXRlcztcbiAgc3RhdGUucm91dGVzID0gd2lyaW5nLnJvdXRlcztcbiAgc3RhdGUucHJlZmV0Y2ggPSAhIW8ucHJlZmV0Y2g7XG5cbiAgcm91dGVyLnNldHVwKHdpcmluZy5yb3V0ZXMpO1xuXG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcblxuICBjYWNoaW5nLnNldHVwKG8uY2FjaGUsIHJvdXRlKTtcbiAgY2FjaGluZy5yZWFkeShraWNrc3RhcnQpO1xuXG4gIGZ1bmN0aW9uIGtpY2tzdGFydCAoKSB7XG4gICAgaWYgKCFvLmJvb3RzdHJhcCkgeyBvLmJvb3RzdHJhcCA9ICdhdXRvJzsgfVxuICAgIGlmIChvLmJvb3RzdHJhcCA9PT0gJ2F1dG8nKSB7XG4gICAgICBhdXRvYm9vdCgpO1xuICAgIH0gZWxzZSBpZiAoby5ib290c3RyYXAgPT09ICdpbmxpbmUnKSB7XG4gICAgICBpbmxpbmVib290KCk7XG4gICAgfSBlbHNlIGlmIChvLmJvb3RzdHJhcCA9PT0gJ21hbnVhbCcpIHtcbiAgICAgIG1hbnVhbGJvb3QoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKG8uYm9vdHN0cmFwICsgJyBpcyBub3QgYSB2YWxpZCBib290c3RyYXAgbW9kZSEnKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhdXRvYm9vdCAoKSB7XG4gICAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250YWluZXIsIHNvdXJjZTogJ2Jvb3QnIH0sIGZldGNoZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZmV0Y2hlZCAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGZXRjaGluZyBKU09OIGRhdGEgbW9kZWwgZm9yIGZpcnN0IHZpZXcgZmFpbGVkLicpO1xuICAgIH1cbiAgICBib290KGRhdGEpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5saW5lYm9vdCAoKSB7XG4gICAgdmFyIGlkID0gY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnZGF0YS10YXVudXMnKTtcbiAgICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIHZhciBtb2RlbCA9IEpTT04ucGFyc2UodW5lc2NhcGUoc2NyaXB0LmlubmVyVGV4dCB8fCBzY3JpcHQudGV4dENvbnRlbnQpKTtcbiAgICBib290KG1vZGVsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1hbnVhbGJvb3QgKCkge1xuICAgIGlmICh0eXBlb2YgZy50YXVudXNSZWFkeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgZy50YXVudXNSZWFkeSA9IGJvb3Q7IC8vIG5vdCB5ZXQgYW4gb2JqZWN0PyB0dXJuIGl0IGludG8gdGhlIGJvb3QgbWV0aG9kXG4gICAgfSBlbHNlIGlmIChnLnRhdW51c1JlYWR5ICYmIHR5cGVvZiBnLnRhdW51c1JlYWR5ID09PSAnb2JqZWN0Jykge1xuICAgICAgYm9vdChnLnRhdW51c1JlYWR5KTsgLy8gYWxyZWFkeSBhbiBvYmplY3Q/IGJvb3Qgd2l0aCB0aGF0IGFzIHRoZSBtb2RlbFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0RpZCB5b3UgZm9yZ2V0IHRvIGFkZCB0aGUgdGF1bnVzUmVhZHkgZ2xvYmFsPycpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGJvb3QgKG1vZGVsKSB7XG4gICAgaWYgKGJvb3RlZCkgeyAvLyBzYW5pdHlcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFtb2RlbCB8fCB0eXBlb2YgbW9kZWwgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhdW51cyBtb2RlbCBtdXN0IGJlIGFuIG9iamVjdCEnKTtcbiAgICB9XG4gICAgYm9vdGVkID0gdHJ1ZTtcbiAgICBjYWNoaW5nLnBlcnNpc3Qocm91dGUsIHN0YXRlLmNvbnRhaW5lciwgbW9kZWwpO1xuICAgIGFjdGl2YXRvci5zdGFydChtb2RlbCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBtb3VudDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGZuKSB7XG4gIHZhciB1c2VkO1xuICByZXR1cm4gZnVuY3Rpb24gb25jZSAoKSB7XG4gICAgaWYgKHVzZWQpIHsgcmV0dXJuOyB9IHVzZWQgPSB0cnVlO1xuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcblxuZnVuY3Rpb24gcGFydGlhbCAoY29udGFpbmVyLCBlbmZvcmNlZEFjdGlvbiwgbW9kZWwsIHJvdXRlLCBvcHRpb25zKSB7XG4gIHZhciBhY3Rpb24gPSBlbmZvcmNlZEFjdGlvbiB8fCBtb2RlbCAmJiBtb2RlbC5hY3Rpb24gfHwgcm91dGUgJiYgcm91dGUuYWN0aW9uO1xuICB2YXIgY29udHJvbGxlciA9IHN0YXRlLmNvbnRyb2xsZXJzW2FjdGlvbl07XG4gIHZhciBpbnRlcm5hbHMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoaW50ZXJuYWxzLnJlbmRlciAhPT0gZmFsc2UpIHtcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gcmVuZGVyKGFjdGlvbiwgbW9kZWwpO1xuICB9XG4gIGVtaXR0ZXIuZW1pdCgncmVuZGVyJywgY29udGFpbmVyLCBtb2RlbCk7XG4gIGlmIChjb250cm9sbGVyKSB7XG4gICAgY29udHJvbGxlcihtb2RlbCwgY29udGFpbmVyLCByb3V0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyIChhY3Rpb24sIG1vZGVsKSB7XG4gIHZhciB0ZW1wbGF0ZSA9IHN0YXRlLnRlbXBsYXRlc1thY3Rpb25dO1xuICB0cnkge1xuICAgIHJldHVybiB0ZW1wbGF0ZShtb2RlbCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIHJlbmRlcmluZyBcIicgKyBhY3Rpb24gKyAnXCIgdGVtcGxhdGVcXG4nICsgZS5zdGFjayk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RhbmRhbG9uZSAoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSkge1xuICByZXR1cm4gcGFydGlhbChjb250YWluZXIsIGFjdGlvbiwgbW9kZWwsIHJvdXRlLCB7IHJvdXRlZDogZmFsc2UgfSk7XG59XG5cbnBhcnRpYWwuc3RhbmRhbG9uZSA9IHN0YW5kYWxvbmU7XG5cbm1vZHVsZS5leHBvcnRzID0gcGFydGlhbDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHVybCA9IHJlcXVpcmUoJ2Zhc3QtdXJsLXBhcnNlcicpO1xudmFyIHJvdXRlcyA9IHJlcXVpcmUoJ3JvdXRlcycpO1xudmFyIG1hdGNoZXIgPSByb3V0ZXMoKTtcbnZhciBwcm90b2NvbCA9IC9eW2Etel0rPzpcXC9cXC8vaTtcblxuZnVuY3Rpb24gZ2V0RnVsbFVybCAocmF3KSB7XG4gIHZhciBiYXNlID0gbG9jYXRpb24uaHJlZi5zdWJzdHIobG9jYXRpb24ub3JpZ2luLmxlbmd0aCk7XG4gIHZhciBoYXNobGVzcztcbiAgaWYgKCFyYXcpIHtcbiAgICByZXR1cm4gYmFzZTtcbiAgfVxuICBpZiAocmF3WzBdID09PSAnIycpIHtcbiAgICBoYXNobGVzcyA9IGJhc2Uuc3Vic3RyKDAsIGJhc2UubGVuZ3RoIC0gbG9jYXRpb24uaGFzaC5sZW5ndGgpO1xuICAgIHJldHVybiBoYXNobGVzcyArIHJhdztcbiAgfVxuICBpZiAocHJvdG9jb2wudGVzdChyYXcpKSB7XG4gICAgaWYgKHJhdy5pbmRleE9mKGxvY2F0aW9uLm9yaWdpbikgPT09IDApIHtcbiAgICAgIHJldHVybiByYXcuc3Vic3RyKGxvY2F0aW9uLm9yaWdpbi5sZW5ndGgpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gcmF3O1xufVxuXG5mdW5jdGlvbiByb3V0ZXIgKHJhdykge1xuICB2YXIgZnVsbCA9IGdldEZ1bGxVcmwocmF3KTtcbiAgaWYgKGZ1bGwgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZnVsbDtcbiAgfVxuICB2YXIgcGFydHMgPSB1cmwucGFyc2UoZnVsbCk7XG4gIHZhciByZXN1bHQgPSBtYXRjaGVyLm1hdGNoKHBhcnRzLnBhdGhuYW1lKTtcbiAgdmFyIHJvdXRlID0gcmVzdWx0ID8gcmVzdWx0LmZuKHJlc3VsdCkgOiBudWxsO1xuICBpZiAocm91dGUpIHtcbiAgICByb3V0ZS51cmwgPSBmdWxsO1xuICAgIHJvdXRlLnBhcnRzID0gcGFydHM7XG4gIH1cbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBzZXR1cCAoZGVmaW5pdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmaW5pdGlvbnMpLmZvckVhY2goZGVmaW5lLmJpbmQobnVsbCwgZGVmaW5pdGlvbnMpKTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lIChkZWZpbml0aW9ucywga2V5KSB7XG4gIG1hdGNoZXIuYWRkUm91dGUoa2V5LCBmdW5jdGlvbiBkZWZpbml0aW9uIChtYXRjaCkge1xuICAgIHZhciBwYXJhbXMgPSBtYXRjaC5wYXJhbXM7XG4gICAgcGFyYW1zLmFyZ3MgPSBtYXRjaC5zcGxhdHM7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJvdXRlOiBrZXksXG4gICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgIGFjdGlvbjogZGVmaW5pdGlvbnNba2V5XS5hY3Rpb24gfHwgbnVsbCxcbiAgICAgIGlnbm9yZTogZGVmaW5pdGlvbnNba2V5XS5pZ25vcmUsXG4gICAgICBjYWNoZTogZGVmaW5pdGlvbnNba2V5XS5jYWNoZVxuICAgIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBlcXVhbHMgKGxlZnQsIHJpZ2h0KSB7XG4gIHJldHVybiBsZWZ0XG4gICAgICAmJiByaWdodFxuICAgICAgJiYgbGVmdC5yb3V0ZSA9PT0gcmlnaHQucm91dGVcbiAgICAgICYmIEpTT04uc3RyaW5naWZ5KGxlZnQucGFyYW1zKSA9PT0gSlNPTi5zdHJpbmdpZnkocmlnaHQucGFyYW1zKTtcbn1cblxucm91dGVyLnNldHVwID0gc2V0dXA7XG5yb3V0ZXIuZXF1YWxzID0gZXF1YWxzO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJvdXRlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNvbnRhaW5lcjogbnVsbFxufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGFwaSA9IHt9O1xudmFyIGcgPSBnbG9iYWw7XG52YXIgaWRiID0gZy5pbmRleGVkREIgfHwgZy5tb3pJbmRleGVkREIgfHwgZy53ZWJraXRJbmRleGVkREIgfHwgZy5tc0luZGV4ZWREQjtcbnZhciBzdXBwb3J0cztcbnZhciBkYjtcbnZhciBkYk5hbWUgPSAndGF1bnVzLWNhY2hlJztcbnZhciBzdG9yZSA9ICd2aWV3LW1vZGVscyc7XG52YXIga2V5UGF0aCA9ICd1cmwnO1xudmFyIHNldFF1ZXVlID0gW107XG52YXIgdGVzdGVkUXVldWUgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiB0ZXN0ICgpIHtcbiAgdmFyIGtleSA9ICdpbmRleGVkLWRiLWZlYXR1cmUtZGV0ZWN0aW9uJztcbiAgdmFyIHJlcTtcbiAgdmFyIGRiO1xuXG4gIGlmICghKGlkYiAmJiAnZGVsZXRlRGF0YWJhc2UnIGluIGlkYikpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTsgcmV0dXJuO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KS5vbnN1Y2Nlc3MgPSB0cmFuc2FjdGlvbmFsVGVzdDtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN1cHBvcnQoZmFsc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJhbnNhY3Rpb25hbFRlc3QgKCkge1xuICAgIHJlcSA9IGlkYi5vcGVuKGtleSwgMSk7XG4gICAgcmVxLm9udXBncmFkZW5lZWRlZCA9IHVwZ25lZWRlZDtcbiAgICByZXEub25lcnJvciA9IGVycm9yO1xuICAgIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gICAgZnVuY3Rpb24gdXBnbmVlZGVkICgpIHtcbiAgICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoJ3N0b3JlJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgICBkYiA9IHJlcS5yZXN1bHQ7XG4gICAgICB0cnkge1xuICAgICAgICBkYi50cmFuc2FjdGlvbignc3RvcmUnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3N0b3JlJykuYWRkKG5ldyBCbG9iKCksICdrZXknKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgc3VwcG9ydChmYWxzZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkYi5jbG9zZSgpO1xuICAgICAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KTtcbiAgICAgICAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkge1xuICAgICAgICAgIG9wZW4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvcGVuICgpIHtcbiAgdmFyIHJlcSA9IGlkYi5vcGVuKGRiTmFtZSwgMSk7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG4gIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgcmVxLnJlc3VsdC5jcmVhdGVPYmplY3RTdG9yZShzdG9yZSwgeyBrZXlQYXRoOiBrZXlQYXRoIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgZGIgPSByZXEucmVzdWx0O1xuICAgIGFwaS5uYW1lID0gJ0luZGV4ZWREQic7XG4gICAgYXBpLmdldCA9IGdldDtcbiAgICBhcGkuc2V0ID0gc2V0O1xuICAgIGRyYWluU2V0KCk7XG4gICAgc3VwcG9ydCh0cnVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmYWxsYmFjayAoKSB7XG4gIGFwaS5uYW1lID0gJ0luZGV4ZWREQi1mYWxsYmFja1N0b3JlJztcbiAgYXBpLmdldCA9IHVuZGVmaW5lZEdldDtcbiAgYXBpLnNldCA9IGVucXVldWVTZXQ7XG59XG5cbmZ1bmN0aW9uIHVuZGVmaW5lZEdldCAoa2V5LCBkb25lKSB7XG4gIGRvbmUobnVsbCwgbnVsbCk7XG59XG5cbmZ1bmN0aW9uIGVucXVldWVTZXQgKGtleSwgIHZhbHVlLCBkb25lKSB7XG4gIGlmIChzZXRRdWV1ZS5sZW5ndGggPiAyKSB7IC8vIGxldCdzIG5vdCB3YXN0ZSBhbnkgbW9yZSBtZW1vcnlcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkgeyAvLyBsZXQncyBhc3N1bWUgdGhlIGNhcGFiaWxpdHkgaXMgdmFsaWRhdGVkIHNvb25cbiAgICBzZXRRdWV1ZS5wdXNoKHsga2V5OiBrZXksIHZhbHVlOiB2YWx1ZSwgZG9uZTogZG9uZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblNldCAoKSB7XG4gIHdoaWxlIChzZXRRdWV1ZS5sZW5ndGgpIHtcbiAgICB2YXIgaXRlbSA9IHNldFF1ZXVlLnNoaWZ0KCk7XG4gICAgc2V0KGl0ZW0ua2V5LCBpdGVtLnZhbHVlLCBpdGVtLmRvbmUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHF1ZXJ5IChvcCwgdmFsdWUsIGRvbmUpIHtcbiAgdmFyIHJlcSA9IGRiLnRyYW5zYWN0aW9uKHN0b3JlLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoc3RvcmUpW29wXSh2YWx1ZSk7XG5cbiAgcmVxLm9uc3VjY2VzcyA9IHN1Y2Nlc3M7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobnVsbCwgcmVxLnJlc3VsdCk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobmV3IEVycm9yKCdUYXVudXMgY2FjaGUgcXVlcnkgZmFpbGVkIGF0IEluZGV4ZWREQiEnKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgcXVlcnkoJ2dldCcsIGtleSwgZG9uZSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICB2YWx1ZVtrZXlQYXRoXSA9IGtleTtcbiAgcXVlcnkoJ2FkZCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byBpbnNlcnRcbiAgcXVlcnkoJ3B1dCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byB1cGRhdGVcbn1cblxuZnVuY3Rpb24gZHJhaW5UZXN0ZWQgKCkge1xuICB3aGlsZSAodGVzdGVkUXVldWUubGVuZ3RoKSB7XG4gICAgdGVzdGVkUXVldWUuc2hpZnQoKSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRlc3RlZCAoZm4pIHtcbiAgaWYgKHN1cHBvcnRzICE9PSB2b2lkIDApIHtcbiAgICBmbigpO1xuICB9IGVsc2Uge1xuICAgIHRlc3RlZFF1ZXVlLnB1c2goZm4pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN1cHBvcnQgKHZhbHVlKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgcmV0dXJuOyAvLyBzYW5pdHlcbiAgfVxuICBzdXBwb3J0cyA9IHZhbHVlO1xuICBkcmFpblRlc3RlZCgpO1xufVxuXG5mdW5jdGlvbiBmYWlsZWQgKCkge1xuICBzdXBwb3J0KGZhbHNlKTtcbn1cblxuZmFsbGJhY2soKTtcbnRlc3QoKTtcbnNldFRpbWVvdXQoZmFpbGVkLCA2MDApOyAvLyB0aGUgdGVzdCBjYW4gdGFrZSBzb21ld2hlcmUgbmVhciAzMDBtcyB0byBjb21wbGV0ZVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcblxuYXBpLnRlc3RlZCA9IHRlc3RlZDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciByYXcgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiBnZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIHJhd1trZXldKTtcbn1cblxuZnVuY3Rpb24gc2V0IChrZXksIHZhbHVlLCBkb25lKSB7XG4gIHJhd1trZXldID0gdmFsdWU7XG4gIChkb25lIHx8IG5vb3ApKG51bGwpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbmFtZTogJ21lbW9yeVN0b3JlJyxcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVFc2NhcGVkSHRtbCA9IC8mKD86YW1wfGx0fGd0fHF1b3R8IzM5fCM5Nik7L2c7XG52YXIgaHRtbFVuZXNjYXBlcyA9IHtcbiAgJyZhbXA7JzogJyYnLFxuICAnJmx0Oyc6ICc8JyxcbiAgJyZndDsnOiAnPicsXG4gICcmcXVvdDsnOiAnXCInLFxuICAnJiMzOTsnOiAnXFwnJyxcbiAgJyYjOTY7JzogJ2AnXG59O1xuXG5mdW5jdGlvbiB1bmVzY2FwZUh0bWxDaGFyIChjKSB7XG4gIHJldHVybiBodG1sVW5lc2NhcGVzW2NdO1xufVxuXG5mdW5jdGlvbiB1bmVzY2FwZSAoaW5wdXQpIHtcbiAgdmFyIGRhdGEgPSBpbnB1dCA9PSBudWxsID8gJycgOiBTdHJpbmcoaW5wdXQpO1xuICBpZiAoZGF0YSAmJiAocmVFc2NhcGVkSHRtbC5sYXN0SW5kZXggPSAwLCByZUVzY2FwZWRIdG1sLnRlc3QoZGF0YSkpKSB7XG4gICAgcmV0dXJuIGRhdGEucmVwbGFjZShyZUVzY2FwZWRIdG1sLCB1bmVzY2FwZUh0bWxDaGFyKTtcbiAgfVxuICByZXR1cm4gZGF0YTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB1bmVzY2FwZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJ3hocicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAodXJsLCBkb25lKSB7XG4gIHZhciBvcHRpb25zID0ge1xuICAgIHVybDogdXJsLFxuICAgIGpzb246IHRydWUsXG4gICAgaGVhZGVyczogeyBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyB9XG4gIH07XG4gIHZhciByZXEgPSB4aHIob3B0aW9ucywgaGFuZGxlKTtcblxuICByZXR1cm4gcmVxO1xuXG4gIGZ1bmN0aW9uIGhhbmRsZSAoZXJyLCByZXMsIGJvZHkpIHtcbiAgICBpZiAoZXJyICYmICFyZXEuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpIHtcbiAgICAgIGRvbmUobmV3IEVycm9yKCdhYm9ydGVkJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKGVyciwgYm9keSk7XG4gICAgfVxuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9jb250cmEuZW1pdHRlci5qcycpO1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbihmdW5jdGlvbiAocm9vdCwgdW5kZWZpbmVkKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgdW5kZWYgPSAnJyArIHVuZGVmaW5lZDtcbiAgZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiAgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHsgaWYgKCFmbikgeyByZXR1cm47IH0gdGljayhmdW5jdGlvbiBydW4gKCkgeyBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7IH0pOyB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gdGlja2VyXG4gIHZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG4gIGlmIChzaSkge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gdW5kZWYgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgIHRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICB9IGVsc2Uge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG4gIH1cblxuICBmdW5jdGlvbiBfZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2dCA9IHt9O1xuICAgIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGMgPT09IDEpIHtcbiAgICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgICBldnQgPSB7fTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgY3R4ID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIHR5cGUgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0KSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldnRbdHlwZV0gPSBldC5maWx0ZXIoZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgcmV0dXJuICFsaXN0ZW4uX29uY2U7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IF9lbWl0dGVyO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gcm9vdC5jb250cmEgfHwge307XG4gICAgcm9vdC5jb250cmEuZW1pdHRlciA9IF9lbWl0dGVyO1xuICB9XG59KSh0aGlzKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIlwidXNlIHN0cmljdFwiO1xuLypcbkNvcHlyaWdodCAoYykgMjAxNCBQZXRrYSBBbnRvbm92XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuICBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG4qL1xuZnVuY3Rpb24gVXJsKCkge1xuICAgIC8vRm9yIG1vcmUgZWZmaWNpZW50IGludGVybmFsIHJlcHJlc2VudGF0aW9uIGFuZCBsYXppbmVzcy5cbiAgICAvL1RoZSBub24tdW5kZXJzY29yZSB2ZXJzaW9ucyBvZiB0aGVzZSBwcm9wZXJ0aWVzIGFyZSBhY2Nlc3NvciBmdW5jdGlvbnNcbiAgICAvL2RlZmluZWQgb24gdGhlIHByb3RvdHlwZS5cbiAgICB0aGlzLl9wcm90b2NvbCA9IG51bGw7XG4gICAgdGhpcy5faHJlZiA9IFwiXCI7XG4gICAgdGhpcy5fcG9ydCA9IC0xO1xuICAgIHRoaXMuX3F1ZXJ5ID0gbnVsbDtcblxuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICB0aGlzLmhvc3QgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuXG4gICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gZmFsc2U7XG59XG5cbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoXCJxdWVyeXN0cmluZ1wiKTtcblVybC5wcm90b3R5cGUucGFyc2UgPVxuZnVuY3Rpb24gVXJsJHBhcnNlKHN0ciwgcGFyc2VRdWVyeVN0cmluZywgaG9zdERlbm90ZXNTbGFzaCkge1xuICAgIGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICtcbiAgICAgICAgICAgIHR5cGVvZiBzdHIpO1xuICAgIH1cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSBzdHIubGVuZ3RoIC0gMTtcblxuICAgIC8vVHJpbSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3c1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChzdGFydCkgPD0gMHgyMCAvKicgJyovKSBzdGFydCsrO1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChlbmQpIDw9IDB4MjAgLyonICcqLykgZW5kLS07XG5cbiAgICBzdGFydCA9IHRoaXMuX3BhcnNlUHJvdG9jb2woc3RyLCBzdGFydCwgZW5kKTtcblxuICAgIC8vSmF2YXNjcmlwdCBkb2Vzbid0IGhhdmUgaG9zdFxuICAgIGlmICh0aGlzLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgc3RhcnQgPSB0aGlzLl9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBob3N0RGVub3Rlc1NsYXNoKTtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICAgICAgKHRoaXMuc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoUHJvdG9jb2xzW3Byb3RvXSkpKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFydCA8PSBlbmQpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHsgLy9Gb3IgamF2YXNjcmlwdCB0aGUgcGF0aG5hbWUgaXMganVzdCB0aGUgcmVzdCBvZiBpdFxuICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGF0aG5hbWUgJiYgdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICB0aGlzLl9zbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF0pIHtcbiAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgIH1cblxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICAgICAgaWYgKHNlYXJjaCA9PSBudWxsKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSB0aGlzLnNlYXJjaCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgICAvL1RoaXMgY2FsbHMgYSBzZXR0ZXIgZnVuY3Rpb24sIHRoZXJlIGlzIG5vIC5xdWVyeSBkYXRhIHByb3BlcnR5XG4gICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZShzZWFyY2gpO1xuICAgIH1cbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlKHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdChVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRmb3JtYXQoKSB7XG4gICAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgXCJcIjtcblxuICAgIGlmIChhdXRoKSB7XG4gICAgICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCBcIjpcIik7XG4gICAgICAgIGF1dGggKz0gXCJAXCI7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCBcIlwiO1xuICAgIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCBcIlwiO1xuICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgIHZhciBxdWVyeSA9IFwiXCI7XG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0IHx8IFwiXCI7XG4gICAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgICB2YXIgc2NoZW1lID0gXCJcIjtcblxuICAgIC8vQ2FjaGUgdGhlIHJlc3VsdCBvZiB0aGUgZ2V0dGVyIGZ1bmN0aW9uXG4gICAgdmFyIHEgPSB0aGlzLnF1ZXJ5O1xuICAgIGlmIChxICYmIHR5cGVvZiBxID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHEpO1xuICAgIH1cblxuICAgIGlmICghc2VhcmNoKSB7XG4gICAgICAgIHNlYXJjaCA9IHF1ZXJ5ID8gXCI/XCIgKyBxdWVyeSA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDB4M0EgLyonOicqLylcbiAgICAgICAgcHJvdG9jb2wgKz0gXCI6XCI7XG5cbiAgICBpZiAodGhpcy5ob3N0KSB7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICAgIH1cbiAgICBlbHNlIGlmIChob3N0bmFtZSkge1xuICAgICAgICB2YXIgaXA2ID0gaG9zdG5hbWUuaW5kZXhPZihcIjpcIikgPiAtMTtcbiAgICAgICAgaWYgKGlwNikgaG9zdG5hbWUgPSBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgaG9zdG5hbWUgKyAocG9ydCA/IFwiOlwiICsgcG9ydCA6IFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBzbGFzaGVzID0gdGhpcy5zbGFzaGVzIHx8XG4gICAgICAgICgoIXByb3RvY29sIHx8XG4gICAgICAgIHNsYXNoUHJvdG9jb2xzW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpO1xuXG5cbiAgICBpZiAocHJvdG9jb2wpIHNjaGVtZSA9IHByb3RvY29sICsgKHNsYXNoZXMgPyBcIi8vXCIgOiBcIlwiKTtcbiAgICBlbHNlIGlmIChzbGFzaGVzKSBzY2hlbWUgPSBcIi8vXCI7XG5cbiAgICBpZiAoc2xhc2hlcyAmJiBwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIi9cIiArIHBhdGhuYW1lO1xuICAgIH1cbiAgICBlbHNlIGlmICghc2xhc2hlcyAmJiBwYXRobmFtZSA9PT0gXCIvXCIpIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSAweDNGIC8qJz8nKi8pXG4gICAgICAgIHNlYXJjaCA9IFwiP1wiICsgc2VhcmNoO1xuICAgIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMHgyMyAvKicjJyovKVxuICAgICAgICBoYXNoID0gXCIjXCIgKyBoYXNoO1xuXG4gICAgcGF0aG5hbWUgPSBlc2NhcGVQYXRoTmFtZShwYXRobmFtZSk7XG4gICAgc2VhcmNoID0gZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG5cbiAgICByZXR1cm4gc2NoZW1lICsgKGhvc3QgPT09IGZhbHNlID8gXCJcIiA6IGhvc3QpICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJHJlc29sdmVPYmplY3QocmVsYXRpdmUpIHtcbiAgICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZWxhdGl2ZSA9IFVybC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMuX2Nsb25lKCk7XG5cbiAgICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlXCJzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICAgIGlmICghcmVsYXRpdmUuaHJlZikge1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICAgIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5fcHJvdG9jb2wpIHtcbiAgICAgICAgcmVsYXRpdmUuX2NvcHlQcm9wc1RvKHJlc3VsdCwgdHJ1ZSk7XG5cbiAgICAgICAgaWYgKHNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdICYmXG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gcmVzdWx0Ll9wcm90b2NvbCkge1xuICAgICAgICAvLyBpZiBpdFwicyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgICAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAgICAgLy8gZmlyc3QsIGlmIGl0XCJzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgICAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgICAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGJlY2F1c2UgdGhhdFwicyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAgICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgICAgICBpZiAoIXNsYXNoUHJvdG9jb2xzW3JlbGF0aXZlLl9wcm90b2NvbF0pIHtcbiAgICAgICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIGZhbHNlKTtcbiAgICAgICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Ll9wcm90b2NvbCA9IHJlbGF0aXZlLl9wcm90b2NvbDtcbiAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0ICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8IFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAocmVsUGF0aFswXSAhPT0gXCJcIikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKFwiL1wiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IFwiXCI7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgcmVzdWx0Ll9wb3J0ID0gcmVsYXRpdmUuX3BvcnQ7XG4gICAgICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICB2YXIgaXNTb3VyY2VBYnMgPVxuICAgICAgICAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pO1xuICAgIHZhciBpc1JlbEFicyA9IChcbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICAgIChyZWxhdGl2ZS5wYXRobmFtZSAmJlxuICAgICAgICAgICAgcmVsYXRpdmUucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKVxuICAgICAgICApO1xuICAgIHZhciBtdXN0RW5kQWJzID0gKGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKTtcblxuICAgIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcblxuICAgIHZhciBzcmNQYXRoID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5fcHJvdG9jb2wgJiYgIXNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdO1xuXG4gICAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAgIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gICAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IC0xO1xuICAgICAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgICAgICAgIGlmIChzcmNQYXRoWzBdID09PSBcIlwiKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICAgICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Lmhvc3QgPSBcIlwiO1xuICAgICAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICByZWxhdGl2ZS5fcG9ydCA9IC0xO1xuICAgICAgICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gXCJcIikgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgICAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gXCJcIiB8fCBzcmNQYXRoWzBdID09PSBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaXNSZWxBYnMpIHtcbiAgICAgICAgLy8gaXRcInMgYWJzb2x1dGUuXG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lID9cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAgICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gICAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgICAgICAvLyBpdFwicyByZWxhdGl2ZVxuICAgICAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICAgICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgICAgIHNyY1BhdGgucG9wKCk7XG4gICAgICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCkge1xuICAgICAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgICAgIC8vIGxpa2UgaHJlZj1cIj9mb29cIi5cbiAgICAgICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoXCJtYWlsdG86bG9jYWwxQGRvbWFpbjFcIiwgXCJsb2NhbDJAZG9tYWluMlwiKVxuICAgICAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgICAgICAvLyB3ZVwidmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gICAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAgIChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gXCIuXCIgfHwgbGFzdCA9PT0gXCIuLlwiKSB8fFxuICAgICAgICBsYXN0ID09PSBcIlwiKTtcblxuICAgIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICAgIHZhciB1cCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgICAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICAgICAgaWYgKGxhc3QgPT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICB9IGVsc2UgaWYgKGxhc3QgPT09IFwiLi5cIikge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cCsrO1xuICAgICAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHVwLS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gICAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiLi5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSBcIlwiICYmXG4gICAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgIT09IDB4MkYgLyonLycqLykpIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oXCIvXCIpLnN1YnN0cigtMSkgIT09IFwiL1wiKSkge1xuICAgICAgICBzcmNQYXRoLnB1c2goXCJcIik7XG4gICAgfVxuXG4gICAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSBcIlwiIHx8XG4gICAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcblxuICAgIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IGlzQWJzb2x1dGUgPyBcIlwiIDpcbiAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogXCJcIjtcbiAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpIDogZmFsc2U7XG4gICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICAgIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmxlbmd0aCA9PT0gMCA/IG51bGwgOiBzcmNQYXRoLmpvaW4oXCIvXCIpO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIHB1bnljb2RlID0gcmVxdWlyZShcInB1bnljb2RlXCIpO1xuVXJsLnByb3RvdHlwZS5faG9zdElkbmEgPSBmdW5jdGlvbiBVcmwkX2hvc3RJZG5hKGhvc3RuYW1lKSB7XG4gICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgIHZhciBkb21haW5BcnJheSA9IGhvc3RuYW1lLnNwbGl0KFwiLlwiKTtcbiAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgIFwieG4tLVwiICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgfVxuICAgIHJldHVybiBuZXdPdXQuam9pbihcIi5cIik7XG59O1xuXG52YXIgZXNjYXBlUGF0aE5hbWUgPSBVcmwucHJvdG90eXBlLl9lc2NhcGVQYXRoTmFtZSA9XG5mdW5jdGlvbiBVcmwkX2VzY2FwZVBhdGhOYW1lKHBhdGhuYW1lKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIocGF0aG5hbWUsIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovKSkge1xuICAgICAgICByZXR1cm4gcGF0aG5hbWU7XG4gICAgfVxuICAgIC8vQXZvaWQgY2xvc3VyZSBjcmVhdGlvbiB0byBrZWVwIHRoaXMgaW5saW5hYmxlXG4gICAgcmV0dXJuIF9lc2NhcGVQYXRoKHBhdGhuYW1lKTtcbn07XG5cbnZhciBlc2NhcGVTZWFyY2ggPSBVcmwucHJvdG90eXBlLl9lc2NhcGVTZWFyY2ggPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIoc2VhcmNoLCAweDIzIC8qJyMnKi8sIC0xKSkgcmV0dXJuIHNlYXJjaDtcbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVByb3RvY29sID0gZnVuY3Rpb24gVXJsJF9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBwcm90b2NvbENoYXJhY3RlcnMgPSB0aGlzLl9wcm90b2NvbENoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgIHZhciBwcm90b2NvbCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICBpZiAoZG9Mb3dlckNhc2UpIHByb3RvY29sID0gcHJvdG9jb2wudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJvdG9jb2xDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGNoIDwgMHg2MSAvKidhJyovKVxuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlQXV0aCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VBdXRoKHN0ciwgc3RhcnQsIGVuZCwgZGVjb2RlKSB7XG4gICAgdmFyIGF1dGggPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEpO1xuICAgIGlmIChkZWNvZGUpIHtcbiAgICAgICAgYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG4gICAgdGhpcy5hdXRoID0gYXV0aDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUG9ydCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQb3J0KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIC8vSW50ZXJuYWwgZm9ybWF0IGlzIGludGVnZXIgZm9yIG1vcmUgZWZmaWNpZW50IHBhcnNpbmdcbiAgICAvL2FuZCBmb3IgZWZmaWNpZW50IHRyaW1taW5nIG9mIGxlYWRpbmcgemVyb3NcbiAgICB2YXIgcG9ydCA9IDA7XG4gICAgLy9EaXN0aW5ndWlzaCBiZXR3ZWVuIDowIGFuZCA6IChubyBwb3J0IG51bWJlciBhdCBhbGwpXG4gICAgdmFyIGhhZENoYXJzID0gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pIHtcbiAgICAgICAgICAgIHBvcnQgPSAoMTAgKiBwb3J0KSArIChjaCAtIDB4MzAgLyonMCcqLyk7XG4gICAgICAgICAgICBoYWRDaGFycyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBicmVhaztcblxuICAgIH1cbiAgICBpZiAocG9ydCA9PT0gMCAmJiAhaGFkQ2hhcnMpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgdGhpcy5fcG9ydCA9IHBvcnQ7XG4gICAgcmV0dXJuIGkgLSBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSG9zdCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlSG9zdChzdHIsIHN0YXJ0LCBlbmQsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgdmFyIGhvc3RFbmRpbmdDaGFyYWN0ZXJzID0gdGhpcy5faG9zdEVuZGluZ0NoYXJhY3RlcnM7XG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHgyRiAvKicvJyovICYmXG4gICAgICAgIHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgMSkgPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuXG4gICAgICAgIC8vVGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHtcbiAgICAgICAgICAgIC8vVGhlIHN0cmluZyBpcyBqdXN0IFwiLy9cIlxuICAgICAgICAgICAgaWYgKGVuZCA8IDIpIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIC8vSWYgc2xhc2hlcyBkbyBub3QgZGVub3RlIGhvc3QgYW5kIHRoZXJlIGlzIG5vIGF1dGgsXG4gICAgICAgICAgICAvL3RoZXJlIGlzIG5vIGhvc3Qgd2hlbiB0aGUgc3RyaW5nIHN0YXJ0cyB3aXRoIC8vXG4gICAgICAgICAgICB2YXIgaGFzQXV0aCA9XG4gICAgICAgICAgICAgICAgY29udGFpbnNDaGFyYWN0ZXIoc3RyLCAweDQwIC8qJ0AnKi8sIDIsIGhvc3RFbmRpbmdDaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIGlmICghaGFzQXV0aCAmJiAhc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL1RoZXJlIGlzIGEgaG9zdCB0aGF0IHN0YXJ0cyBhZnRlciB0aGUgLy9cbiAgICAgICAgc3RhcnQgKz0gMjtcbiAgICB9XG4gICAgLy9JZiB0aGVyZSBpcyBubyBzbGFzaGVzLCB0aGVyZSBpcyBubyBob3N0bmFtZSBpZlxuICAgIC8vMS4gdGhlcmUgd2FzIG5vIHByb3RvY29sIGF0IGFsbFxuICAgIGVsc2UgaWYgKCF0aGlzLl9wcm90b2NvbCB8fFxuICAgICAgICAvLzIuIHRoZXJlIHdhcyBhIHByb3RvY29sIHRoYXQgcmVxdWlyZXMgc2xhc2hlc1xuICAgICAgICAvL2UuZy4gaW4gJ2h0dHA6YXNkJyAnYXNkJyBpcyBub3QgYSBob3N0bmFtZVxuICAgICAgICBzbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF1cbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBpZG5hID0gZmFsc2U7XG4gICAgdmFyIGhvc3ROYW1lU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgaG9zdE5hbWVFbmQgPSBlbmQ7XG4gICAgdmFyIGxhc3RDaCA9IC0xO1xuICAgIHZhciBwb3J0TGVuZ3RoID0gMDtcbiAgICB2YXIgY2hhcnNBZnRlckRvdCA9IDA7XG4gICAgdmFyIGF1dGhOZWVkc0RlY29kaW5nID0gZmFsc2U7XG5cbiAgICB2YXIgaiA9IC0xO1xuXG4gICAgLy9GaW5kIHRoZSBsYXN0IG9jY3VycmVuY2Ugb2YgYW4gQC1zaWduIHVudGlsIGhvc3RlbmRpbmcgY2hhcmFjdGVyIGlzIG1ldFxuICAgIC8vYWxzbyBtYXJrIGlmIGRlY29kaW5nIGlzIG5lZWRlZCBmb3IgdGhlIGF1dGggcG9ydGlvblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4NDAgLyonQCcqLykge1xuICAgICAgICAgICAgaiA9IGk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNoZWNrIGlzIHZlcnksIHZlcnkgY2hlYXAuIFVubmVlZGVkIGRlY29kZVVSSUNvbXBvbmVudCBpcyB2ZXJ5XG4gICAgICAgIC8vdmVyeSBleHBlbnNpdmVcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjUgLyonJScqLykge1xuICAgICAgICAgICAgYXV0aE5lZWRzRGVjb2RpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhvc3RFbmRpbmdDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvL0Atc2lnbiB3YXMgZm91bmQgYXQgaW5kZXggaiwgZXZlcnl0aGluZyB0byB0aGUgbGVmdCBmcm9tIGl0XG4gICAgLy9pcyBhdXRoIHBhcnRcbiAgICBpZiAoaiA+IC0xKSB7XG4gICAgICAgIHRoaXMuX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBqIC0gMSwgYXV0aE5lZWRzRGVjb2RpbmcpO1xuICAgICAgICAvL2hvc3RuYW1lIHN0YXJ0cyBhZnRlciB0aGUgbGFzdCBALXNpZ25cbiAgICAgICAgc3RhcnQgPSBob3N0TmFtZVN0YXJ0ID0gaiArIDE7XG4gICAgfVxuXG4gICAgLy9Ib3N0IG5hbWUgaXMgc3RhcnRpbmcgd2l0aCBhIFtcbiAgICBpZiAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpID09PSAweDVCIC8qJ1snKi8pIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0ICsgMTsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgICAgIC8vQXNzdW1lIHZhbGlkIElQNiBpcyBiZXR3ZWVuIHRoZSBicmFja2V0c1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDVEIC8qJ10nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAyLCBlbmQpICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKHN0YXJ0ICsgMSwgaSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBcIltcIiArIGhvc3RuYW1lICsgXCJdOlwiICsgdGhpcy5fcG9ydFxuICAgICAgICAgICAgICAgICAgICA6IFwiW1wiICsgaG9zdG5hbWUgKyBcIl1cIjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGkgKyBwb3J0TGVuZ3RoICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL0VtcHR5IGhvc3RuYW1lLCBbIHN0YXJ0cyBhIHBhdGhcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICBpZiAoY2hhcnNBZnRlckRvdCA+IDYyKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gc3RyLnNsaWNlKHN0YXJ0LCBpKTtcbiAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICBwb3J0TGVuZ3RoID0gdGhpcy5fcGFyc2VQb3J0KHN0ciwgaSArIDEsIGVuZCkgKyAxO1xuICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoIDwgMHg2MSAvKidhJyovKSB7XG4gICAgICAgICAgICBpZiAoY2ggPT09IDB4MkUgLyonLicqLykge1xuICAgICAgICAgICAgICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGlmIChsYXN0Q2ggPT09IERPVCB8fCBsYXN0Q2ggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2hhcnNBZnRlckRvdCA9IC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoMHg0MSAvKidBJyovIDw9IGNoICYmIGNoIDw9IDB4NUEgLyonWicqLykge1xuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCEoY2ggPT09IDB4MkQgLyonLScqLyB8fCBjaCA9PT0gMHg1RiAvKidfJyovIHx8XG4gICAgICAgICAgICAgICAgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pKSkge1xuICAgICAgICAgICAgICAgIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDAgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID49IDB4N0IgLyoneycqLykge1xuICAgICAgICAgICAgaWYgKGNoIDw9IDB4N0UgLyonficqLykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnNbY2hdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZG5hID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0Q2ggPSBjaDtcbiAgICAgICAgY2hhcnNBZnRlckRvdCsrO1xuICAgIH1cblxuICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAvKlxuICAgIGlmIChsYXN0Q2ggPT09IERPVCkge1xuICAgICAgICBob3N0TmFtZUVuZC0tO1xuICAgIH1cbiAgICAqL1xuXG4gICAgaWYgKGhvc3ROYW1lRW5kICsgMSAhPT0gc3RhcnQgJiZcbiAgICAgICAgaG9zdE5hbWVFbmQgLSBob3N0TmFtZVN0YXJ0IDw9IDI1Nikge1xuICAgICAgICB2YXIgaG9zdG5hbWUgPSBzdHIuc2xpY2UoaG9zdE5hbWVTdGFydCwgaG9zdE5hbWVFbmQgKyAxKTtcbiAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBob3N0bmFtZSA9IGhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChpZG5hKSBob3N0bmFtZSA9IHRoaXMuX2hvc3RJZG5hKGhvc3RuYW1lKTtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICB0aGlzLmhvc3QgPSB0aGlzLl9wb3J0ID4gMCA/IGhvc3RuYW1lICsgXCI6XCIgKyB0aGlzLl9wb3J0IDogaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhvc3ROYW1lRW5kICsgMSArIHBvcnRMZW5ndGg7XG5cbn07XG5cblVybC5wcm90b3R5cGUuX2NvcHlQcm9wc1RvID0gZnVuY3Rpb24gVXJsJF9jb3B5UHJvcHNUbyhpbnB1dCwgbm9Qcm90b2NvbCkge1xuICAgIGlmICghbm9Qcm90b2NvbCkge1xuICAgICAgICBpbnB1dC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICB9XG4gICAgaW5wdXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIGlucHV0Ll9wb3J0ID0gdGhpcy5fcG9ydDtcbiAgICBpbnB1dC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIGlucHV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgaW5wdXQuc2xhc2hlcyA9IHRoaXMuc2xhc2hlcztcbiAgICBpbnB1dC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIGlucHV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICBpbnB1dC5oYXNoID0gdGhpcy5oYXNoO1xuICAgIGlucHV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIGlucHV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbn07XG5cblVybC5wcm90b3R5cGUuX2Nsb25lID0gZnVuY3Rpb24gVXJsJF9jbG9uZSgpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICByZXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIHJldC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgcmV0Ll9wcmVwZW5kU2xhc2ggPSB0aGlzLl9wcmVwZW5kU2xhc2g7XG4gICAgcmV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgcmV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgcmV0Lmhvc3QgPSB0aGlzLmhvc3Q7XG4gICAgcmV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICByZXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICByZXQuc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgcmV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fZ2V0Q29tcG9uZW50RXNjYXBlZCA9XG5mdW5jdGlvbiBVcmwkX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIGN1ciA9IHN0YXJ0O1xuICAgIHZhciBpID0gc3RhcnQ7XG4gICAgdmFyIHJldCA9IFwiXCI7XG4gICAgdmFyIGF1dG9Fc2NhcGVNYXAgPSB0aGlzLl9hdXRvRXNjYXBlTWFwO1xuICAgIGZvciAoOyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB2YXIgZXNjYXBlZCA9IGF1dG9Fc2NhcGVNYXBbY2hdO1xuXG4gICAgICAgIGlmIChlc2NhcGVkICE9PSBcIlwiKSB7XG4gICAgICAgICAgICBpZiAoY3VyIDwgaSkgcmV0ICs9IHN0ci5zbGljZShjdXIsIGkpO1xuICAgICAgICAgICAgcmV0ICs9IGVzY2FwZWQ7XG4gICAgICAgICAgICBjdXIgPSBpICsgMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VyIDwgaSArIDEpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQYXRoID1cbmZ1bmN0aW9uIFVybCRfcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBwYXRoU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgcGF0aEVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBwYXRoRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXRoU3RhcnQgPiBwYXRoRW5kKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwYXRoO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcGF0aCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBwYXRoU3RhcnQsIHBhdGhFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcGF0aCA9IHN0ci5zbGljZShwYXRoU3RhcnQsIHBhdGhFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5wYXRobmFtZSA9IHRoaXMuX3ByZXBlbmRTbGFzaCA/IFwiL1wiICsgcGF0aCA6IHBhdGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVF1ZXJ5ID0gZnVuY3Rpb24gVXJsJF9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBxdWVyeVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHF1ZXJ5RW5kID0gZW5kO1xuICAgIHZhciBlc2NhcGUgPSBmYWxzZTtcbiAgICB2YXIgYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSB0aGlzLl9hdXRvRXNjYXBlQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHF1ZXJ5RW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChxdWVyeVN0YXJ0ID4gcXVlcnlFbmQpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5O1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcXVlcnkgPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcXVlcnlTdGFydCwgcXVlcnlFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSBzdHIuc2xpY2UocXVlcnlTdGFydCwgcXVlcnlFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5zZWFyY2ggPSBxdWVyeTtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSGFzaCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIGlmIChzdGFydCA+IGVuZCkge1xuICAgICAgICB0aGlzLmhhc2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaGFzaCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInBvcnRcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wb3J0ID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiAoXCJcIiArIHRoaXMuX3BvcnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSBwYXJzZUludCh2LCAxMCk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicXVlcnlcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5O1xuICAgICAgICBpZiAocXVlcnkgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcblxuICAgICAgICBpZiAoc2VhcmNoKSB7XG4gICAgICAgICAgICBpZiAoc2VhcmNoLmNoYXJDb2RlQXQoMCkgPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzZWFyY2ggIT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHNlYXJjaDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWFyY2g7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5fcXVlcnkgPSB2O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwYXRoXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgICAgICBpZiAocCB8fCBzKSB7XG4gICAgICAgICAgICByZXR1cm4gcCArIHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChwID09IG51bGwgJiYgcykgPyAoXCIvXCIgKyBzKSA6IG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKCkge31cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwcm90b2NvbFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIHJldHVybiBwcm90byA/IHByb3RvICsgXCI6XCIgOiBwcm90bztcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBlbmQgPSB2Lmxlbmd0aCAtIDE7XG4gICAgICAgICAgICBpZiAodi5jaGFyQ29kZUF0KGVuZCkgPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdi5zbGljZSgwLCBlbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSB2O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcImhyZWZcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBocmVmID0gdGhpcy5faHJlZjtcbiAgICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgICAgICBocmVmID0gdGhpcy5faHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhyZWY7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5faHJlZiA9IHY7XG4gICAgfVxufSk7XG5cblVybC5wYXJzZSA9IGZ1bmN0aW9uIFVybCRQYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAoc3RyIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gc3RyO1xuICAgIHZhciByZXQgPSBuZXcgVXJsKCk7XG4gICAgcmV0LnBhcnNlKHN0ciwgISFwYXJzZVF1ZXJ5U3RyaW5nLCAhIWhvc3REZW5vdGVzU2xhc2gpO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwuZm9ybWF0ID0gZnVuY3Rpb24gVXJsJEZvcm1hdChvYmopIHtcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvYmogPSBVcmwucGFyc2Uob2JqKTtcbiAgICB9XG4gICAgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkge1xuICAgICAgICByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufTtcblxuVXJsLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn07XG5cblVybC5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIGlmICghc291cmNlKSByZXR1cm4gcmVsYXRpdmU7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlT2JqZWN0KHJlbGF0aXZlKTtcbn07XG5cbmZ1bmN0aW9uIF9lc2NhcGVQYXRoKHBhdGhuYW1lKSB7XG4gICAgcmV0dXJuIHBhdGhuYW1lLnJlcGxhY2UoL1s/I10vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgcmV0dXJuIHNlYXJjaC5yZXBsYWNlKC8jL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG4vL1NlYXJjaCBgY2hhcjFgIChpbnRlZ2VyIGNvZGUgZm9yIGEgY2hhcmFjdGVyKSBpbiBgc3RyaW5nYFxuLy9zdGFydGluZyBmcm9tIGBmcm9tSW5kZXhgIGFuZCBlbmRpbmcgYXQgYHN0cmluZy5sZW5ndGggLSAxYFxuLy9vciB3aGVuIGEgc3RvcCBjaGFyYWN0ZXIgaXMgZm91bmRcbmZ1bmN0aW9uIGNvbnRhaW5zQ2hhcmFjdGVyKHN0cmluZywgY2hhcjEsIGZyb21JbmRleCwgc3RvcENoYXJhY3RlclRhYmxlKSB7XG4gICAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IGZyb21JbmRleDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gY2hhcjEpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHN0b3BDaGFyYWN0ZXJUYWJsZVtjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vU2VlIGlmIGBjaGFyMWAgb3IgYGNoYXIyYCAoaW50ZWdlciBjb2RlcyBmb3IgY2hhcmFjdGVycylcbi8vaXMgY29udGFpbmVkIGluIGBzdHJpbmdgXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcjIoc3RyaW5nLCBjaGFyMSwgY2hhcjIpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IGNoYXIxIHx8IGNoID09PSBjaGFyMikgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy9NYWtlcyBhbiBhcnJheSBvZiAxMjggdWludDgncyB3aGljaCByZXByZXNlbnQgYm9vbGVhbiB2YWx1ZXMuXG4vL1NwZWMgaXMgYW4gYXJyYXkgb2YgYXNjaWkgY29kZSBwb2ludHMgb3IgYXNjaWkgY29kZSBwb2ludCByYW5nZXNcbi8vcmFuZ2VzIGFyZSBleHByZXNzZWQgYXMgW3N0YXJ0LCBlbmRdXG5cbi8vQ3JlYXRlIGEgdGFibGUgd2l0aCB0aGUgY2hhcmFjdGVycyAweDMwLTB4MzkgKGRlY2ltYWxzICcwJyAtICc5JykgYW5kXG4vLzB4N0EgKGxvd2VyY2FzZWxldHRlciAneicpIGFzIGB0cnVlYDpcbi8vXG4vL3ZhciBhID0gbWFrZUFzY2lpVGFibGUoW1sweDMwLCAweDM5XSwgMHg3QV0pO1xuLy9hWzB4MzBdOyAvLzFcbi8vYVsweDE1XTsgLy8wXG4vL2FbMHgzNV07IC8vMVxuZnVuY3Rpb24gbWFrZUFzY2lpVGFibGUoc3BlYykge1xuICAgIHZhciByZXQgPSBuZXcgVWludDhBcnJheSgxMjgpO1xuICAgIHNwZWMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICByZXRbaXRlbV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gaXRlbVswXTtcbiAgICAgICAgICAgIHZhciBlbmQgPSBpdGVtWzFdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0OyBqIDw9IGVuZDsgKytqKSB7XG4gICAgICAgICAgICAgICAgcmV0W2pdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJldDtcbn1cblxuXG52YXIgYXV0b0VzY2FwZSA9IFtcIjxcIiwgXCI+XCIsIFwiXFxcIlwiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsIFwiXFxuXCIsXG4gICAgXCJcXHRcIiwgXCJ7XCIsIFwifVwiLCBcInxcIiwgXCJcXFxcXCIsIFwiXlwiLCBcImBcIiwgXCInXCJdO1xuXG52YXIgYXV0b0VzY2FwZU1hcCA9IG5ldyBBcnJheSgxMjgpO1xuXG5cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGVNYXAubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBhdXRvRXNjYXBlTWFwW2ldID0gXCJcIjtcbn1cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgYyA9IGF1dG9Fc2NhcGVbaV07XG4gICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChjKTtcbiAgICBpZiAoZXNjID09PSBjKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShjKTtcbiAgICB9XG4gICAgYXV0b0VzY2FwZU1hcFtjLmNoYXJDb2RlQXQoMCldID0gZXNjO1xufVxuXG5cbnZhciBzbGFzaFByb3RvY29scyA9IFVybC5wcm90b3R5cGUuX3NsYXNoUHJvdG9jb2xzID0ge1xuICAgIGh0dHA6IHRydWUsXG4gICAgaHR0cHM6IHRydWUsXG4gICAgZ29waGVyOiB0cnVlLFxuICAgIGZpbGU6IHRydWUsXG4gICAgZnRwOiB0cnVlLFxuXG4gICAgXCJodHRwOlwiOiB0cnVlLFxuICAgIFwiaHR0cHM6XCI6IHRydWUsXG4gICAgXCJnb3BoZXI6XCI6IHRydWUsXG4gICAgXCJmaWxlOlwiOiB0cnVlLFxuICAgIFwiZnRwOlwiOiB0cnVlXG59O1xuXG4vL09wdGltaXplIGJhY2sgZnJvbSBub3JtYWxpemVkIG9iamVjdCBjYXVzZWQgYnkgbm9uLWlkZW50aWZpZXIga2V5c1xuZnVuY3Rpb24gZigpe31cbmYucHJvdG90eXBlID0gc2xhc2hQcm90b2NvbHM7XG5cblVybC5wcm90b3R5cGUuX3Byb3RvY29sQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICBbMHg2MSAvKidhJyovLCAweDdBIC8qJ3onKi9dLFxuICAgIFsweDQxIC8qJ0EnKi8sIDB4NUEgLyonWicqL10sXG4gICAgMHgyRSAvKicuJyovLCAweDJCIC8qJysnKi8sIDB4MkQgLyonLScqL1xuXSk7XG5cblVybC5wcm90b3R5cGUuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoW1xuICAgIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovLCAweDJGIC8qJy8nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIGF1dG9Fc2NhcGUubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgcmV0dXJuIHYuY2hhckNvZGVBdCgwKTtcbiAgICB9KVxuKTtcblxuLy9JZiB0aGVzZSBjaGFyYWN0ZXJzIGVuZCBhIGhvc3QgbmFtZSwgdGhlIHBhdGggd2lsbCBub3QgYmUgcHJlcGVuZGVkIGEgL1xuVXJsLnByb3RvdHlwZS5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzID0gbWFrZUFzY2lpVGFibGUoXG4gICAgW1xuICAgICAgICBcIjxcIiwgXCI+XCIsIFwiJ1wiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsXG4gICAgICAgIFwiXFxuXCIsIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLFxuICAgICAgICBcIl5cIiwgXCJgXCIsIFwiXFxcIlwiLCBcIiVcIiwgXCI7XCJcbiAgICBdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cblVybC5wcm90b3R5cGUuX2F1dG9Fc2NhcGVNYXAgPSBhdXRvRXNjYXBlTWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVybDtcblxuVXJsLnJlcGxhY2UgPSBmdW5jdGlvbiBVcmwkUmVwbGFjZSgpIHtcbiAgICByZXF1aXJlLmNhY2hlW1widXJsXCJdID0ge1xuICAgICAgICBleHBvcnRzOiBVcmxcbiAgICB9O1xufTtcbiIsInZhciBub3cgPSByZXF1aXJlKCdwZXJmb3JtYW5jZS1ub3cnKVxuICAsIGdsb2JhbCA9IHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8ge30gOiB3aW5kb3dcbiAgLCB2ZW5kb3JzID0gWydtb3onLCAnd2Via2l0J11cbiAgLCBzdWZmaXggPSAnQW5pbWF0aW9uRnJhbWUnXG4gICwgcmFmID0gZ2xvYmFsWydyZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBjYWYgPSBnbG9iYWxbJ2NhbmNlbCcgKyBzdWZmaXhdIHx8IGdsb2JhbFsnY2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgbmF0aXZlID0gdHJ1ZVxuXG5mb3IodmFyIGkgPSAwOyBpIDwgdmVuZG9ycy5sZW5ndGggJiYgIXJhZjsgaSsrKSB7XG4gIHJhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ1JlcXVlc3QnICsgc3VmZml4XVxuICBjYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWwnICsgc3VmZml4XVxuICAgICAgfHwgZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICBuYXRpdmUgPSBmYWxzZVxuXG4gIHZhciBsYXN0ID0gMFxuICAgICwgaWQgPSAwXG4gICAgLCBxdWV1ZSA9IFtdXG4gICAgLCBmcmFtZUR1cmF0aW9uID0gMTAwMCAvIDYwXG5cbiAgcmFmID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICBpZihxdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHZhciBfbm93ID0gbm93KClcbiAgICAgICAgLCBuZXh0ID0gTWF0aC5tYXgoMCwgZnJhbWVEdXJhdGlvbiAtIChfbm93IC0gbGFzdCkpXG4gICAgICBsYXN0ID0gbmV4dCArIF9ub3dcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjcCA9IHF1ZXVlLnNsaWNlKDApXG4gICAgICAgIC8vIENsZWFyIHF1ZXVlIGhlcmUgdG8gcHJldmVudFxuICAgICAgICAvLyBjYWxsYmFja3MgZnJvbSBhcHBlbmRpbmcgbGlzdGVuZXJzXG4gICAgICAgIC8vIHRvIHRoZSBjdXJyZW50IGZyYW1lJ3MgcXVldWVcbiAgICAgICAgcXVldWUubGVuZ3RoID0gMFxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY3AubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZighY3BbaV0uY2FuY2VsbGVkKSB7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgIGNwW2ldLmNhbGxiYWNrKGxhc3QpXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSwgTWF0aC5yb3VuZChuZXh0KSlcbiAgICB9XG4gICAgcXVldWUucHVzaCh7XG4gICAgICBoYW5kbGU6ICsraWQsXG4gICAgICBjYWxsYmFjazogY2FsbGJhY2ssXG4gICAgICBjYW5jZWxsZWQ6IGZhbHNlXG4gICAgfSlcbiAgICByZXR1cm4gaWRcbiAgfVxuXG4gIGNhZiA9IGZ1bmN0aW9uKGhhbmRsZSkge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYocXVldWVbaV0uaGFuZGxlID09PSBoYW5kbGUpIHtcbiAgICAgICAgcXVldWVbaV0uY2FuY2VsbGVkID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIFdyYXAgaW4gYSBuZXcgZnVuY3Rpb24gdG8gcHJldmVudFxuICAvLyBgY2FuY2VsYCBwb3RlbnRpYWxseSBiZWluZyBhc3NpZ25lZFxuICAvLyB0byB0aGUgbmF0aXZlIHJBRiBmdW5jdGlvblxuICBpZighbmF0aXZlKSB7XG4gICAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZm4pXG4gIH1cbiAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZnVuY3Rpb24oKSB7XG4gICAgdHJ5e1xuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgIH1cbiAgfSlcbn1cbm1vZHVsZS5leHBvcnRzLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICBjYWYuYXBwbHkoZ2xvYmFsLCBhcmd1bWVudHMpXG59XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5yb3V0ZXM9ZSgpfX0oZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cbnZhciBsb2NhbFJvdXRlcyA9IFtdO1xuXG5cbi8qKlxuICogQ29udmVydCBwYXRoIHRvIHJvdXRlIG9iamVjdFxuICpcbiAqIEEgc3RyaW5nIG9yIFJlZ0V4cCBzaG91bGQgYmUgcGFzc2VkLFxuICogd2lsbCByZXR1cm4geyByZSwgc3JjLCBrZXlzfSBvYmpcbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmcgLyBSZWdFeHB9IHBhdGhcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG52YXIgUm91dGUgPSBmdW5jdGlvbihwYXRoKXtcbiAgLy91c2luZyAnbmV3JyBpcyBvcHRpb25hbFxuXG4gIHZhciBzcmMsIHJlLCBrZXlzID0gW107XG5cbiAgaWYocGF0aCBpbnN0YW5jZW9mIFJlZ0V4cCl7XG4gICAgcmUgPSBwYXRoO1xuICAgIHNyYyA9IHBhdGgudG9TdHJpbmcoKTtcbiAgfWVsc2V7XG4gICAgcmUgPSBwYXRoVG9SZWdFeHAocGF0aCwga2V5cyk7XG4gICAgc3JjID0gcGF0aDtcbiAgfVxuXG4gIHJldHVybiB7XG4gIFx0IHJlOiByZSxcbiAgXHQgc3JjOiBwYXRoLnRvU3RyaW5nKCksXG4gIFx0IGtleXM6IGtleXNcbiAgfVxufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIGdpdmVuIHBhdGggc3RyaW5nLFxuICogcmV0dXJuaW5nIGEgcmVndWxhciBleHByZXNzaW9uLlxuICpcbiAqIEFuIGVtcHR5IGFycmF5IHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aGljaCB3aWxsIGNvbnRhaW4gdGhlIHBsYWNlaG9sZGVyXG4gKiBrZXkgbmFtZXMuIEZvciBleGFtcGxlIFwiL3VzZXIvOmlkXCIgd2lsbFxuICogdGhlbiBjb250YWluIFtcImlkXCJdLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gcGF0aFxuICogQHBhcmFtICB7QXJyYXl9IGtleXNcbiAqIEByZXR1cm4ge1JlZ0V4cH1cbiAqL1xudmFyIHBhdGhUb1JlZ0V4cCA9IGZ1bmN0aW9uIChwYXRoLCBrZXlzKSB7XG5cdHBhdGggPSBwYXRoXG5cdFx0LmNvbmNhdCgnLz8nKVxuXHRcdC5yZXBsYWNlKC9cXC9cXCgvZywgJyg/Oi8nKVxuXHRcdC5yZXBsYWNlKC8oXFwvKT8oXFwuKT86KFxcdyspKD86KFxcKC4qP1xcKSkpPyhcXD8pP3xcXCovZywgZnVuY3Rpb24oXywgc2xhc2gsIGZvcm1hdCwga2V5LCBjYXB0dXJlLCBvcHRpb25hbCl7XG5cdFx0XHRpZiAoXyA9PT0gXCIqXCIpe1xuXHRcdFx0XHRrZXlzLnB1c2godW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIF87XG5cdFx0XHR9XG5cblx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0c2xhc2ggPSBzbGFzaCB8fCAnJztcblx0XHRcdHJldHVybiAnJ1xuXHRcdFx0XHQrIChvcHRpb25hbCA/ICcnIDogc2xhc2gpXG5cdFx0XHRcdCsgJyg/Oidcblx0XHRcdFx0KyAob3B0aW9uYWwgPyBzbGFzaCA6ICcnKVxuXHRcdFx0XHQrIChmb3JtYXQgfHwgJycpICsgKGNhcHR1cmUgfHwgJyhbXi9dKz8pJykgKyAnKSdcblx0XHRcdFx0KyAob3B0aW9uYWwgfHwgJycpO1xuXHRcdH0pXG5cdFx0LnJlcGxhY2UoLyhbXFwvLl0pL2csICdcXFxcJDEnKVxuXHRcdC5yZXBsYWNlKC9cXCovZywgJyguKiknKTtcblx0cmV0dXJuIG5ldyBSZWdFeHAoJ14nICsgcGF0aCArICckJywgJ2knKTtcbn07XG5cbi8qKlxuICogQXR0ZW1wdCB0byBtYXRjaCB0aGUgZ2l2ZW4gcmVxdWVzdCB0b1xuICogb25lIG9mIHRoZSByb3V0ZXMuIFdoZW4gc3VjY2Vzc2Z1bFxuICogYSAge2ZuLCBwYXJhbXMsIHNwbGF0c30gb2JqIGlzIHJldHVybmVkXG4gKlxuICogQHBhcmFtICB7QXJyYXl9IHJvdXRlc1xuICogQHBhcmFtICB7U3RyaW5nfSB1cmlcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xudmFyIG1hdGNoID0gZnVuY3Rpb24gKHJvdXRlcywgdXJpLCBzdGFydEF0KSB7XG5cdHZhciBjYXB0dXJlcywgaSA9IHN0YXJ0QXQgfHwgMDtcblxuXHRmb3IgKHZhciBsZW4gPSByb3V0ZXMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcblx0XHR2YXIgcm91dGUgPSByb3V0ZXNbaV0sXG5cdFx0ICAgIHJlID0gcm91dGUucmUsXG5cdFx0ICAgIGtleXMgPSByb3V0ZS5rZXlzLFxuXHRcdCAgICBzcGxhdHMgPSBbXSxcblx0XHQgICAgcGFyYW1zID0ge307XG5cblx0XHRpZiAoY2FwdHVyZXMgPSB1cmkubWF0Y2gocmUpKSB7XG5cdFx0XHRmb3IgKHZhciBqID0gMSwgbGVuID0gY2FwdHVyZXMubGVuZ3RoOyBqIDwgbGVuOyArK2opIHtcblx0XHRcdFx0dmFyIGtleSA9IGtleXNbai0xXSxcblx0XHRcdFx0XHR2YWwgPSB0eXBlb2YgY2FwdHVyZXNbal0gPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHVuZXNjYXBlKGNhcHR1cmVzW2pdKVxuXHRcdFx0XHRcdFx0OiBjYXB0dXJlc1tqXTtcblx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdHBhcmFtc1trZXldID0gdmFsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNwbGF0cy5wdXNoKHZhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBhcmFtczogcGFyYW1zLFxuXHRcdFx0XHRzcGxhdHM6IHNwbGF0cyxcblx0XHRcdFx0cm91dGU6IHJvdXRlLnNyYyxcblx0XHRcdFx0bmV4dDogaSArIDFcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIERlZmF1bHQgXCJub3JtYWxcIiByb3V0ZXIgY29uc3RydWN0b3IuXG4gKiBhY2NlcHRzIHBhdGgsIGZuIHR1cGxlcyB2aWEgYWRkUm91dGVcbiAqIHJldHVybnMge2ZuLCBwYXJhbXMsIHNwbGF0cywgcm91dGV9XG4gKiAgdmlhIG1hdGNoXG4gKlxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZXIgPSBmdW5jdGlvbigpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG4gIHJldHVybiB7XG4gICAgcm91dGVzOiBbXSxcbiAgICByb3V0ZU1hcCA6IHt9LFxuICAgIGFkZFJvdXRlOiBmdW5jdGlvbihwYXRoLCBmbil7XG4gICAgICBpZiAoIXBhdGgpIHRocm93IG5ldyBFcnJvcignIHJvdXRlIHJlcXVpcmVzIGEgcGF0aCcpO1xuICAgICAgaWYgKCFmbikgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgJyArIHBhdGgudG9TdHJpbmcoKSArICcgcmVxdWlyZXMgYSBjYWxsYmFjaycpO1xuXG4gICAgICB2YXIgcm91dGUgPSBSb3V0ZShwYXRoKTtcbiAgICAgIHJvdXRlLmZuID0gZm47XG5cbiAgICAgIHRoaXMucm91dGVzLnB1c2gocm91dGUpO1xuICAgICAgdGhpcy5yb3V0ZU1hcFtwYXRoXSA9IGZuO1xuICAgIH0sXG5cbiAgICBtYXRjaDogZnVuY3Rpb24ocGF0aG5hbWUsIHN0YXJ0QXQpe1xuICAgICAgdmFyIHJvdXRlID0gbWF0Y2godGhpcy5yb3V0ZXMsIHBhdGhuYW1lLCBzdGFydEF0KTtcbiAgICAgIGlmKHJvdXRlKXtcbiAgICAgICAgcm91dGUuZm4gPSB0aGlzLnJvdXRlTWFwW3JvdXRlLnJvdXRlXTtcbiAgICAgICAgcm91dGUubmV4dCA9IHRoaXMubWF0Y2guYmluZCh0aGlzLCBwYXRobmFtZSwgcm91dGUubmV4dClcbiAgICAgIH1cbiAgICAgIHJldHVybiByb3V0ZTtcbiAgICB9XG4gIH1cbn07XG5cblJvdXRlci5Sb3V0ZSA9IFJvdXRlXG5Sb3V0ZXIucGF0aFRvUmVnRXhwID0gcGF0aFRvUmVnRXhwXG5Sb3V0ZXIubWF0Y2ggPSBtYXRjaFxuLy8gYmFjayBjb21wYXRcblJvdXRlci5Sb3V0ZXIgPSBSb3V0ZXJcblxubW9kdWxlLmV4cG9ydHMgPSBSb3V0ZXJcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsInZhciB3aW5kb3cgPSByZXF1aXJlKFwiZ2xvYmFsL3dpbmRvd1wiKVxudmFyIG9uY2UgPSByZXF1aXJlKFwib25jZVwiKVxudmFyIHBhcnNlSGVhZGVycyA9IHJlcXVpcmUoJ3BhcnNlLWhlYWRlcnMnKVxuXG52YXIgbWVzc2FnZXMgPSB7XG4gICAgXCIwXCI6IFwiSW50ZXJuYWwgWE1MSHR0cFJlcXVlc3QgRXJyb3JcIixcbiAgICBcIjRcIjogXCI0eHggQ2xpZW50IEVycm9yXCIsXG4gICAgXCI1XCI6IFwiNXh4IFNlcnZlciBFcnJvclwiXG59XG5cbnZhciBYSFIgPSB3aW5kb3cuWE1MSHR0cFJlcXVlc3QgfHwgbm9vcFxudmFyIFhEUiA9IFwid2l0aENyZWRlbnRpYWxzXCIgaW4gKG5ldyBYSFIoKSkgPyBYSFIgOiB3aW5kb3cuWERvbWFpblJlcXVlc3RcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVYSFJcblxuZnVuY3Rpb24gY3JlYXRlWEhSKG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIG9wdGlvbnMgPSB7IHVyaTogb3B0aW9ucyB9XG4gICAgfVxuXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICBjYWxsYmFjayA9IG9uY2UoY2FsbGJhY2spXG5cbiAgICB2YXIgeGhyID0gb3B0aW9ucy54aHIgfHwgbnVsbFxuXG4gICAgaWYgKCF4aHIpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMuY29ycyB8fCBvcHRpb25zLnVzZVhEUikge1xuICAgICAgICAgICAgeGhyID0gbmV3IFhEUigpXG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgeGhyID0gbmV3IFhIUigpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgdXJpID0geGhyLnVybCA9IG9wdGlvbnMudXJpIHx8IG9wdGlvbnMudXJsXG4gICAgdmFyIG1ldGhvZCA9IHhoci5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCBcIkdFVFwiXG4gICAgdmFyIGJvZHkgPSBvcHRpb25zLmJvZHkgfHwgb3B0aW9ucy5kYXRhXG4gICAgdmFyIGhlYWRlcnMgPSB4aHIuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fVxuICAgIHZhciBzeW5jID0gISFvcHRpb25zLnN5bmNcbiAgICB2YXIgaXNKc29uID0gZmFsc2VcbiAgICB2YXIga2V5XG4gICAgdmFyIGxvYWQgPSBvcHRpb25zLnJlc3BvbnNlID8gbG9hZFJlc3BvbnNlIDogbG9hZFhoclxuXG4gICAgaWYgKFwianNvblwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaXNKc29uID0gdHJ1ZVxuICAgICAgICBoZWFkZXJzW1wiQWNjZXB0XCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgaWYgKG1ldGhvZCAhPT0gXCJHRVRcIiAmJiBtZXRob2QgIT09IFwiSEVBRFwiKSB7XG4gICAgICAgICAgICBoZWFkZXJzW1wiQ29udGVudC1UeXBlXCJdID0gXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAgICAgICAgIGJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gcmVhZHlzdGF0ZWNoYW5nZVxuICAgIHhoci5vbmxvYWQgPSBsb2FkXG4gICAgeGhyLm9uZXJyb3IgPSBlcnJvclxuICAgIC8vIElFOSBtdXN0IGhhdmUgb25wcm9ncmVzcyBiZSBzZXQgdG8gYSB1bmlxdWUgZnVuY3Rpb24uXG4gICAgeGhyLm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElFIG11c3QgZGllXG4gICAgfVxuICAgIC8vIGhhdGUgSUVcbiAgICB4aHIub250aW1lb3V0ID0gbm9vcFxuICAgIHhoci5vcGVuKG1ldGhvZCwgdXJpLCAhc3luYylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgIGlmIChvcHRpb25zLndpdGhDcmVkZW50aWFscyB8fCAob3B0aW9ucy5jb3JzICYmIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzICE9PSBmYWxzZSkpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICB9XG5cbiAgICAvLyBDYW5ub3Qgc2V0IHRpbWVvdXQgd2l0aCBzeW5jIHJlcXVlc3RcbiAgICBpZiAoIXN5bmMpIHtcbiAgICAgICAgeGhyLnRpbWVvdXQgPSBcInRpbWVvdXRcIiBpbiBvcHRpb25zID8gb3B0aW9ucy50aW1lb3V0IDogNTAwMFxuICAgIH1cblxuICAgIGlmICh4aHIuc2V0UmVxdWVzdEhlYWRlcikge1xuICAgICAgICBmb3Ioa2V5IGluIGhlYWRlcnMpe1xuICAgICAgICAgICAgaWYoaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkhlYWRlcnMgY2Fubm90IGJlIHNldCBvbiBhbiBYRG9tYWluUmVxdWVzdCBvYmplY3RcIilcbiAgICB9XG5cbiAgICBpZiAoXCJyZXNwb25zZVR5cGVcIiBpbiBvcHRpb25zKSB7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSBvcHRpb25zLnJlc3BvbnNlVHlwZVxuICAgIH1cbiAgICBcbiAgICBpZiAoXCJiZWZvcmVTZW5kXCIgaW4gb3B0aW9ucyAmJiBcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuYmVmb3JlU2VuZCA9PT0gXCJmdW5jdGlvblwiXG4gICAgKSB7XG4gICAgICAgIG9wdGlvbnMuYmVmb3JlU2VuZCh4aHIpXG4gICAgfVxuXG4gICAgeGhyLnNlbmQoYm9keSlcblxuICAgIHJldHVybiB4aHJcblxuICAgIGZ1bmN0aW9uIHJlYWR5c3RhdGVjaGFuZ2UoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgbG9hZCgpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRCb2R5KCkge1xuICAgICAgICAvLyBDaHJvbWUgd2l0aCByZXF1ZXN0VHlwZT1ibG9iIHRocm93cyBlcnJvcnMgYXJyb3VuZCB3aGVuIGV2ZW4gdGVzdGluZyBhY2Nlc3MgdG8gcmVzcG9uc2VUZXh0XG4gICAgICAgIHZhciBib2R5ID0gbnVsbFxuXG4gICAgICAgIGlmICh4aHIucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIGlmICh4aHIucmVzcG9uc2VUeXBlID09PSAndGV4dCcgfHwgIXhoci5yZXNwb25zZVR5cGUpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VUZXh0IHx8IHhoci5yZXNwb25zZVhNTFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzSnNvbikge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBib2R5ID0gSlNPTi5wYXJzZShib2R5KVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBib2R5XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U3RhdHVzQ29kZSgpIHtcbiAgICAgICAgcmV0dXJuIHhoci5zdGF0dXMgPT09IDEyMjMgPyAyMDQgOiB4aHIuc3RhdHVzXG4gICAgfVxuXG4gICAgLy8gaWYgd2UncmUgZ2V0dGluZyBhIG5vbmUtb2sgc3RhdHVzQ29kZSwgYnVpbGQgJiByZXR1cm4gYW4gZXJyb3JcbiAgICBmdW5jdGlvbiBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cykge1xuICAgICAgICB2YXIgZXJyb3IgPSBudWxsXG4gICAgICAgIGlmIChzdGF0dXMgPT09IDAgfHwgKHN0YXR1cyA+PSA0MDAgJiYgc3RhdHVzIDwgNjAwKSkge1xuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSAodHlwZW9mIGJvZHkgPT09IFwic3RyaW5nXCIgPyBib2R5IDogZmFsc2UpIHx8XG4gICAgICAgICAgICAgICAgbWVzc2FnZXNbU3RyaW5nKHN0YXR1cykuY2hhckF0KDApXVxuICAgICAgICAgICAgZXJyb3IgPSBuZXcgRXJyb3IobWVzc2FnZSlcbiAgICAgICAgICAgIGVycm9yLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlcnJvclxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSAmIHByb2Nlc3MgdGhlIHJlc3BvbnNlIGluIGEgc3BlY2lhbCByZXNwb25zZSBvYmplY3RcbiAgICBmdW5jdGlvbiBsb2FkUmVzcG9uc2UoKSB7XG4gICAgICAgIHZhciBzdGF0dXMgPSBnZXRTdGF0dXNDb2RlKClcbiAgICAgICAgdmFyIGVycm9yID0gZXJyb3JGcm9tU3RhdHVzQ29kZShzdGF0dXMpXG4gICAgICAgIHZhciByZXNwb25zZSA9IHtcbiAgICAgICAgICAgIGJvZHk6IGdldEJvZHkoKSxcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IHN0YXR1cyxcbiAgICAgICAgICAgIHN0YXR1c1RleHQ6IHhoci5zdGF0dXNUZXh0LFxuICAgICAgICAgICAgcmF3OiB4aHJcbiAgICAgICAgfVxuICAgICAgICBpZih4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKXsgLy9yZW1lbWJlciB4aHIgY2FuIGluIGZhY3QgYmUgWERSIGZvciBDT1JTIGluIElFXG4gICAgICAgICAgICByZXNwb25zZS5oZWFkZXJzID0gcGFyc2VIZWFkZXJzKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIHJlc3BvbnNlLCByZXNwb25zZS5ib2R5KVxuICAgIH1cblxuICAgIC8vIHdpbGwgbG9hZCB0aGUgZGF0YSBhbmQgYWRkIHNvbWUgcmVzcG9uc2UgcHJvcGVydGllcyB0byB0aGUgc291cmNlIHhoclxuICAgIC8vIGFuZCB0aGVuIHJlc3BvbmQgd2l0aCB0aGF0XG4gICAgZnVuY3Rpb24gbG9hZFhocigpIHtcbiAgICAgICAgdmFyIHN0YXR1cyA9IGdldFN0YXR1c0NvZGUoKVxuICAgICAgICB2YXIgZXJyb3IgPSBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cylcblxuICAgICAgICB4aHIuc3RhdHVzID0geGhyLnN0YXR1c0NvZGUgPSBzdGF0dXNcbiAgICAgICAgeGhyLmJvZHkgPSBnZXRCb2R5KClcbiAgICAgICAgeGhyLmhlYWRlcnMgPSBwYXJzZUhlYWRlcnMoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKVxuXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCB4aHIsIHhoci5ib2R5KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKGV2dCkge1xuICAgICAgICBjYWxsYmFjayhldnQsIHhocilcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG5pZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHNlbGY7XG59IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0ge307XG59XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwibW9kdWxlLmV4cG9ydHMgPSBvbmNlXG5cbm9uY2UucHJvdG8gPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bmN0aW9uLnByb3RvdHlwZSwgJ29uY2UnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBvbmNlKHRoaXMpXG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWVcbiAgfSlcbn0pXG5cbmZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gIHZhciBjYWxsZWQgPSBmYWxzZVxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGlmIChjYWxsZWQpIHJldHVyblxuICAgIGNhbGxlZCA9IHRydWVcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICB9XG59XG4iLCJ2YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2lzLWZ1bmN0aW9uJylcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHlcblxuZnVuY3Rpb24gZm9yRWFjaChsaXN0LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXNGdW5jdGlvbihpdGVyYXRvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignaXRlcmF0b3IgbXVzdCBiZSBhIGZ1bmN0aW9uJylcbiAgICB9XG5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgY29udGV4dCA9IHRoaXNcbiAgICB9XG4gICAgXG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobGlzdCkgPT09ICdbb2JqZWN0IEFycmF5XScpXG4gICAgICAgIGZvckVhY2hBcnJheShsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlIGlmICh0eXBlb2YgbGlzdCA9PT0gJ3N0cmluZycpXG4gICAgICAgIGZvckVhY2hTdHJpbmcobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG4gICAgZWxzZVxuICAgICAgICBmb3JFYWNoT2JqZWN0KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoQXJyYXkoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5LCBpKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVtpXSwgaSwgYXJyYXkpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2hTdHJpbmcoc3RyaW5nLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgLy8gbm8gc3VjaCB0aGluZyBhcyBhIHNwYXJzZSBzdHJpbmcuXG4gICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgc3RyaW5nLmNoYXJBdChpKSwgaSwgc3RyaW5nKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaE9iamVjdChvYmplY3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgayBpbiBvYmplY3QpIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmplY3Rba10sIGssIG9iamVjdClcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gaXNGdW5jdGlvblxuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24gKGZuKSB7XG4gIHZhciBzdHJpbmcgPSB0b1N0cmluZy5jYWxsKGZuKVxuICByZXR1cm4gc3RyaW5nID09PSAnW29iamVjdCBGdW5jdGlvbl0nIHx8XG4gICAgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJyAmJiBzdHJpbmcgIT09ICdbb2JqZWN0IFJlZ0V4cF0nKSB8fFxuICAgICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAvLyBJRTggYW5kIGJlbG93XG4gICAgIChmbiA9PT0gd2luZG93LnNldFRpbWVvdXQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuYWxlcnQgfHxcbiAgICAgIGZuID09PSB3aW5kb3cuY29uZmlybSB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5wcm9tcHQpKVxufTtcbiIsIlxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gdHJpbTtcblxuZnVuY3Rpb24gdHJpbShzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqfFxccyokL2csICcnKTtcbn1cblxuZXhwb3J0cy5sZWZ0ID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzKi8sICcnKTtcbn07XG5cbmV4cG9ydHMucmlnaHQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccyokLywgJycpO1xufTtcbiIsInZhciB0cmltID0gcmVxdWlyZSgndHJpbScpXG4gICwgZm9yRWFjaCA9IHJlcXVpcmUoJ2Zvci1lYWNoJylcbiAgLCBpc0FycmF5ID0gZnVuY3Rpb24oYXJnKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFyZykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChoZWFkZXJzKSB7XG4gIGlmICghaGVhZGVycylcbiAgICByZXR1cm4ge31cblxuICB2YXIgcmVzdWx0ID0ge31cblxuICBmb3JFYWNoKFxuICAgICAgdHJpbShoZWFkZXJzKS5zcGxpdCgnXFxuJylcbiAgICAsIGZ1bmN0aW9uIChyb3cpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gcm93LmluZGV4T2YoJzonKVxuICAgICAgICAgICwga2V5ID0gdHJpbShyb3cuc2xpY2UoMCwgaW5kZXgpKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgLCB2YWx1ZSA9IHRyaW0ocm93LnNsaWNlKGluZGV4ICsgMSkpXG5cbiAgICAgICAgaWYgKHR5cGVvZihyZXN1bHRba2V5XSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSB2YWx1ZVxuICAgICAgICB9IGVsc2UgaWYgKGlzQXJyYXkocmVzdWx0W2tleV0pKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IFsgcmVzdWx0W2tleV0sIHZhbHVlIF1cbiAgICAgICAgfVxuICAgICAgfVxuICApXG5cbiAgcmV0dXJuIHJlc3VsdFxufSJdfQ==
