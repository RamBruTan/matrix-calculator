import { describe, it, expect } from "vitest";
import { evaluateExpressions } from "@/lib/mathEngine";
import { sanitizeError, PLACEHOLDER_ERROR } from "@/lib/errorSanitizer";

function err(latex: string): string | undefined {
  const r = evaluateExpressions([{ id: "1", latex }]);
  return r.get("1")?.error;
}

describe("sanitizeError unit", () => {
  it("placeholder sentinel", () => {
    expect(sanitizeError(PLACEHOLDER_ERROR)).toMatch(/placeholder/i);
  });

  it("typed-function dispatcher leak", () => {
    const leak = new Error(
      `function theTypedFn(arg0, arg1) "use strict"; if(arguments.length === len0 && test00(arg0) && test01(arg1)) return fn0.apply(this`
    );
    expect(sanitizeError(leak, { lastCall: "sgn" })).toBe(
      "Wrong argument type for sgn()"
    );
  });

  it("typed-function jargon", () => {
    const raw = new Error(
      "Unexpected type of argument in function sqrt (expected: number or Complex or BigNumber or Unit or bigint or Fraction or string or boolean, actual: identifier | undefined, index: 0)"
    );
    expect(sanitizeError(raw)).toBe("Wrong argument type for sqrt()");
  });

  it("_mkmat: cell count mismatch", () => {
    expect(sanitizeError(new Error("_mkmat: cell count mismatch"))).toMatch(
      /same number of columns/
    );
  });

  it("_mkmat: expected (rows, cols, ...cells)", () => {
    expect(sanitizeError(new Error("_mkmat: expected (rows, cols, ...cells)"))).toBe(
      "Malformed matrix"
    );
  });

  it("Value expected without placeholder is incomplete", () => {
    expect(sanitizeError(new Error("Value expected (char 27)"))).toBe(
      "Incomplete expression"
    );
  });

  it("Value expected with placeholder shows placeholder message", () => {
    const out = sanitizeError(new Error("Value expected (char 5)"), {
      latex: "\\sqrt{\\placeholder{}}",
    });
    expect(out).toMatch(/placeholder/i);
  });

  it("Parenthesis expected becomes missing closing parenthesis", () => {
    expect(sanitizeError(new Error("Parenthesis ) expected (char 10)"))).toBe(
      "Missing closing parenthesis"
    );
  });

  it("Undefined symbol X becomes undefined variable", () => {
    expect(sanitizeError(new Error("Undefined symbol foo"))).toBe(
      "Undefined variable: foo"
    );
  });

  it("Dimension mismatch shows sizes", () => {
    expect(sanitizeError(new Error("Dimension mismatch (2, 2 != 3, 3)"))).toMatch(
      /Matrix dimensions don't match.*2.*3/
    );
  });

  it("raw BigNumber jargon is rejected", () => {
    const out = sanitizeError(
      new Error("got a BigNumber here in some internal SymbolNode path")
    );
    expect(out).toBe("Could not evaluate expression");
  });

  it("clean unknown message passes through", () => {
    expect(sanitizeError(new Error("Some clean human message"))).toBe(
      "Some clean human message"
    );
  });
});

describe("end-to-end error sanitization (evaluateExpressions)", () => {
  it("placeholder in sqrt", () => {
    expect(err("\\sqrt{\\placeholder{}}")).toMatch(/placeholder/i);
  });

  it("undefined variable", () => {
    expect(err("x+1")).toBe("Undefined variable: x");
  });

  it("incomplete expression", () => {
    const e = err("5+");
    expect(e).toBeDefined();
    expect(e).not.toMatch(/char\s+\d/);
  });

  it("direct circular reference produces a path", () => {
    const r = evaluateExpressions([
      { id: "1", latex: "a=b" },
      { id: "2", latex: "b=a" },
    ]);
    expect(r.get("1")?.error).toMatch(/Circular reference:.*→/);
    expect(r.get("2")?.error).toMatch(/Circular reference:.*→/);
  });

  it("0/0 is indeterminate form", () => {
    expect(err("0/0")).toBe("Indeterminate form");
  });

  it("1/0 is infinity as result", () => {
    const r = evaluateExpressions([{ id: "1", latex: "1/0" }]);
    expect(r.get("1")?.error).toBeUndefined();
    expect(r.get("1")?.value).toBe(Infinity);
  });

  it("any error contains no internal jargon", () => {
    const cases = [
      "\\sqrt{\\placeholder{}}",
      "5+",
      "(5+3",
      "x+1",
      "\\begin{matrix}1 & 2 \\\\ 3\\end{matrix}",
    ];
    for (const latex of cases) {
      const e = err(latex);
      if (e) expect(e).not.toMatch(/arg0|theTypedFn|BigNumber|typed-function|_mkmat|_absdet/);
    }
  });
});
