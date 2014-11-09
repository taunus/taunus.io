var jade = require("jadum/runtime");
module.exports = function home(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/home.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/home.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/home.jade" });
buf.push("<h1>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 1, filename: jade_debug[0].filename });
buf.push("Taunus Documentation Home");
jade_debug.shift();
jade_debug.shift();
buf.push("</h1>");
jade_debug.shift();
jade_debug.unshift({ lineno: 3, filename: "views/documentation/home.jade" });
buf.push("<h1 id=\"foo\">foo</h1>\n");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "h1 Taunus Documentation Home\n\n:markdown\n  # foo\n");
}
}