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
buf.push("<h1 id=\"complementary-modules\">Complementary Modules</h1>\n<p>Taunus is a small library by MVC framework standards, sitting at <strong>around 12kB minified and gzipped</strong>. It is designed to be small. It is also designed to do one thing well, and that&#39;s <em>being a shared-rendering MVC engine</em>.</p>\n<p>Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you <a href=\"/api\">head over to the API documentation</a>, you&#39;ll notice that the server-side API, the command-line interface, and the <code>.taunusrc</code> manifest are only concerned with providing a conventional shared-rendering MVC engine.</p>\n<p>In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.</p>\n<p><code>dominus</code>\n<code>xhr</code>\n<code>measly</code></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Complementary Modules\n\n    Taunus is a small library by MVC framework standards, sitting at **around 12kB minified and gzipped**. It is designed to be small. It is also designed to do one thing well, and that's _being a shared-rendering MVC engine_.\n\n    Taunus can be used for routing, putting together controllers, models and views to handle human interaction. If you [head over to the API documentation][1], you'll notice that the server-side API, the command-line interface, and the `.taunusrc` manifest are only concerned with providing a conventional shared-rendering MVC engine.\n\n    In the server-side you might need to do other things besides routing and rendering views, and other modules can take care of that. In the client-side, you might be used to your MVC framework of choice resolving everything on your behalf, from DOM manipulation and data-binding to hooking up with a REST API, and everywhere in between.\n\n    `dominus`\n    `xhr`\n    `measly`\n\n    [1]: /api\n");
}
}