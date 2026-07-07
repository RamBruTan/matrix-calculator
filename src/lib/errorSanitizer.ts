export const PLACEHOLDER_ERROR = "__PLACEHOLDER__";

interface Ctx {
  latex?: string;
  lastCall?: string;
}

export function sanitizeError(raw: unknown, ctx: Ctx = {}): string {
  let msg: string;
  if (raw == null) msg = "";
  else if (typeof raw === "string") msg = raw;
  else if (raw instanceof Error) msg = raw.message ?? String(raw);
  else if (typeof (raw as any)?.message === "string") msg = (raw as any).message;
  else msg = String(raw);

  const trimmed = msg.trim();

  for (const rule of RULES) {
    const out = rule(trimmed, ctx);
    if (out) return out;
  }

  const stripped = stripCharOffset(trimmed);
  if (looksClean(stripped)) return stripped;
  return "Could not evaluate expression";
}

//Post-evaluation result formatter for special floating-point values.
//Returns `{ replacementLatex?, errorMessage? }`:
// - errorMessage set → caller shows the error and suppresses the result
// - replacementLatex set → render this instead of running through formatResult
// - neither set → use the value as normal
export function sanitizeResult(val: any): { error?: string; latex?: string } | null {
  if (typeof val === "number") {
    if (Number.isNaN(val)) return { error: "Indeterminate form" };
    if (val === Infinity) return { latex: "\\infty" };
    if (val === -Infinity) return { latex: "-\\infty" };
  }
  return null;
}

type Rule = (raw: string, ctx: Ctx) => string | null;

const FN_DISPLAY: Record<string, string> = {};

function friendlyFn(n?: string): string {
  return n ? (FN_DISPLAY[n] ?? n) : "function";
}

//Classify a runtime value into a user-facing "kind" word.
function kindOf(v: any): string {
  if (v === undefined || v === null) return "nothing";
  if (typeof v === "number") return "a number";
  if (typeof v === "boolean") return "a boolean";
  if (typeof v === "string") return "text";
  if (v && typeof v === "object") {
    if (v.isComplex) return "a complex number";
    if (v.__block) return "a block matrix";
    if (typeof v.toArray === "function") return "a matrix";
    if (Array.isArray(v)) return Array.isArray(v[0]) ? "a matrix" : "a list";
  }
  if (Array.isArray(v)) return Array.isArray(v[0]) ? "a matrix" : "a list";
  return "a value";
}

//Detect a typed-function dispatcher source-code leak.
function isTypedFnLeak(s: string): boolean {
  return (
    /theTypedFn/.test(s) ||
    /arguments\.length\s*===\s*len\d/.test(s) ||
    /^function\s*\w*\s*\(arg0/.test(s) ||
    /test\d+\d?\(arg\d\)/.test(s)
  );
}

//Strip "(char N)" suffixes from mathjs parser errors.
function stripCharOffset(s: string): string {
  return s.replace(/\s*\(char\s+\d+\)\s*$/, "");
}

//Final "looks user-friendly" guard.
function looksClean(s: string): boolean {
  if (!s) return false;
  if (s.length > 200) return false;
  if (/\n/.test(s)) return false;
  if (/arg0|theTypedFn|arguments\.length|test\d\d/.test(s)) return false;
  if (/BigNumber|typed-function|isUnit|SymbolNode/.test(s)) return false;
  return true;
}

const RULES: Rule[] = [
  //Placeholder sentinel
  (s) => (s === PLACEHOLDER_ERROR ? "Fill in all placeholders before evaluating" : null),

  //Typed-function dispatcher leak — match before anything else
  (s, ctx) => (isTypedFnLeak(s) ? `Wrong argument type for ${friendlyFn(ctx.lastCall)}()` : null),

  //mathjs argument-type message
  (s) => {
    const m = s.match(/^Unexpected type of argument in function (\w+).*actual:\s*([^,]+),\s*index:\s*(\d+)/);
    if (!m) return null;
    return `Wrong argument type for ${m[1]}()`;
  },

  //Internal _mkmat errors
  (s) => (/^_mkmat:\s*cell count mismatch/.test(s) ? "Matrix rows must all have the same number of columns" : null),
  (s) => (/^_mkmat:/.test(s) ? "Malformed matrix" : null),

  //_absdet / blockDet leaks
  (s) => (/_absdet|blockDet/.test(s) ? "Could not evaluate |·|" : null),

  //Block matrix errors
  (s) => (s === "Block matrix dimension mismatch" ? "Block matrices have different shapes" : null),
  (s) => (s.startsWith("Block matrix multiplication dimension mismatch")
    ? s.replace("Block matrix multiplication dimension mismatch", "Block matrix multiplication requires inner dimensions to match")
    : null),
  (s) => (s === "Cannot add block matrix to non-block value" ? "Cannot mix block matrices with scalars or plain matrices in addition" : null),
  (s) => (s === "Cannot subtract block matrix and non-block value" ? "Cannot mix block matrices with scalars or plain matrices in subtraction" : null),
  (s) => (s === "Cannot divide by a block matrix" ? "Cannot divide by a block matrix" : null),
  (s) => (s === "Cannot raise to a block-matrix power" ? "Cannot raise to a block-matrix power" : null),

  //Undefined symbols
  (s) => {
    const m = s.match(/^Undefined symbol\s+(\S+)$/);
    if (!m) return null;
    return `Undefined variable: ${m[1]}`;
  },
  (s) => (s === "Undefined symbol(s) in expression" ? "Undefined variable in expression" : null),
  (s) => {
    const m = s.match(/^Undefined symbol (\S+)$/);
    return m ? `Undefined variable: ${m[1]}` : null;
  },

  //Undefined function
  (s) => {
    const m = s.match(/^Undefined function\s+(\S+)/);
    return m ? `Undefined function: ${m[1]}` : null;
  },

  //mathjs parser errors
  (s, ctx) => {
    const stripped = stripCharOffset(s);
    if (/^Value expected/i.test(stripped)) {
      if (ctx.latex && /\\placeholder/.test(ctx.latex)) {
        return "Fill in all placeholders before evaluating";
      }
      return "Incomplete expression";
    }
    if (/^Parenthesis .* expected/i.test(stripped)) return "Missing closing parenthesis";
    if (/^Unexpected end of expression/i.test(stripped)) return "Incomplete expression";
    if (/^Unexpected operator/i.test(stripped)) return "Unexpected operator";
    if (/^Unexpected part/i.test(stripped)) return "Unexpected token in expression";
    if (/^Symbol .* is no function/i.test(stripped)) return stripped;
    return null;
  },

  //mathjs dimension errors
  (s) => {
    const m = s.match(/^Dimension mismatch.*\((\d+(?:,\s*\d+)*)\s*(?:!=|vs)\s*(\d+(?:,\s*\d+)*)\)/i);
    if (!m) return null;
    return `Matrix dimensions don't match (${m[1]} vs ${m[2]})`;
  },
  (s) => (/^Dimension mismatch/i.test(s) ? "Matrix dimensions don't match" : null),

  //Singular matrix
  (s) => (/inverse.*determinant is zero|cannot compute inverse, determinant is zero/i.test(s)
    ? "Matrix is singular; inverse does not exist"
    : null),

  //Square-matrix requirement leaks
  (s) => (s === "Matrix must be square" ? "This operation requires a square matrix" : null),

  //Det/inv/etc. messages that are already readable
  (s) => (/^(det|inv|tr|rank|charpoly|schur|lu|qr|svd|pinv|eigen|adjugate|cofactor).*requires/i.test(s) ? s : null),
];
