"use strict";

function quote(xs) {
  return xs
    .map(function (s) {
      if (s && typeof s === "object") {
        return s.pattern;
      }
      s = String(s);
      if (/["\s]/.test(s) && !/'/.test(s)) {
        return "'" + s.replace(/(['\\])/g, "\\$1") + "'";
      }
      if (/["'\s]/.test(s)) {
        return '"' + s.replace(/(["\\$`!])/g, "\\$1") + '"';
      }
      return String(s).replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}~])/g, "$1\\$2");
    })
    .join(" ");
}

const CONTROL = "(?:" +
  ["\\|\\|", "\\&\\&", ";;", "\\|\\&", "\\<\\(", "\\<\\<\\<", ">>", ">\\&", "<\\&", "[&;()|<>]"].join("|") +
  ")";
const CONTROL_RE = new RegExp("^" + CONTROL + "$");
const META = "|(?:" + CONTROL + ")";
const BAREWORD = "(\\\\['\"" + META + "]|[^\\s'\"" + META + "])+";
const SINGLE_QUOTE = "'((\\\\'|[^'])*)'";
const DOUBLE_QUOTE = '"((\\\\"|[^"])*)"';

const TOKEN =
  "(?:" +
  ["(" + META + ")", "(" + BAREWORD + ")", SINGLE_QUOTE, DOUBLE_QUOTE].join("|") +
  ")";
const TOKEN_RE = new RegExp(TOKEN, "g");

function parse(s, env, opts) {
  const mapped = parseInternal(s, env, opts);
  if (typeof env !== "function") return mapped;
  return mapped.reduce(function (acc, s2) {
    if (typeof s2 === "object") return acc.concat(s2);
    const xs = s2.split(RegExp("(" + META + ")", "g"));
    if (xs.length === 1) return acc.concat(xs[0]);
    return acc.concat(
      xs.filter(Boolean).map(function (x) {
        return CONTROL_RE.test(x) ? { op: x } : x;
      })
    );
  }, []);
}

function parseInternal(s) {
  const chunker = new RegExp(
    "([\\s]+|" + [CONTROL, "(?:\\\\.|[^\\s'\"" + META + "])+", SINGLE_QUOTE, DOUBLE_QUOTE].join("|") + ")",
    "g"
  );
  const matches = s.match(chunker) || [];
  const result = [];
  for (let i = 0; i < matches.length; i++) {
    const part = matches[i];
    if (/^\s+$/.test(part)) continue;
    if (CONTROL_RE.test(part)) {
      result.push({ op: part });
      continue;
    }
    let unquoted = part;
    if (/^'.*'$/.test(unquoted)) {
      unquoted = unquoted.slice(1, -1).replace(/\\'/g, "'");
    } else if (/^".*"$/.test(unquoted)) {
      unquoted = unquoted.slice(1, -1).replace(/\\"/g, '"');
    } else {
      unquoted = unquoted.replace(/\\(.)/g, "$1");
    }
    result.push(unquoted);
  }
  return result;
}

module.exports = { quote, parse };
