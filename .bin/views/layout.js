var jade = require("jadum/runtime");
module.exports = function layout(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (model, partial) {
buf.push("<!DOCTYPE html><html lang=\"en\" itemscope itemtype=\"http://schema.org/Blog\"><head><title>" + (jade.escape(null == (jade_interp = model.title) ? "" : jade_interp)) + "</title><meta charset=\"utf-8\"><link rel=\"shortcut icon\" href=\"/favicon.ico\"><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge,chrome=1\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body id=\"top\"><header><h1><a href=\"/\" aria-label=\"Go to home\">Taunus</a></h1></header><main data-taunus=\"model\">" + (null == (jade_interp = partial) ? "" : jade_interp) + "</main></body></html>");}.call(this,"model" in locals_for_with?locals_for_with.model:typeof model!=="undefined"?model:undefined,"partial" in locals_for_with?locals_for_with.partial:typeof partial!=="undefined"?partial:undefined));;return buf.join("");
}