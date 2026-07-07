import { describe, it, expect } from "vitest";
import { evaluateExpressions, formatResult } from "@/lib/mathEngine";

function evalSingle(latex: string) {
  const results = evaluateExpressions([{ id: "1", latex }]);
  return results.get("1");
}

describe("mathEngine", () => {
  it("floor(3.7) works", () => {
    const r = evalSingle("\\lfloor3.7\\rfloor");
    expect(r?.value).toBe(3);
    expect(r?.error).toBeUndefined();
  });

  it("arcsin(0.5) works", () => {
    const r = evalSingle("\\arcsin\\left(0.5\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBeCloseTo(Math.asin(0.5));
  });

  it("log_2(8) works", () => {
    const r = evalSingle("\\log_{2}\\left(8\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBeCloseTo(3);
  });

  it("log_2 without braces", () => {
    const r = evalSingle("\\log_2\\left(8\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBeCloseTo(3);
  });

  it("i*pi implicit multiplication", () => {
    const r = evalSingle("i\\pi");
    expect(r?.error).toBeUndefined();
  });

  it("sqrt works", () => {
    const r = evalSingle("\\sqrt{4}");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBe(2);
  });

  it("det of matrix", () => {
    const r = evalSingle("\\det\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBe(-2);
  });

  it("arg(1+i) works", () => {
    const r = evalSingle("\\arg\\left(1+i\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBeCloseTo(Math.PI / 4);
  });

  it("Re(3+4i) works", () => {
    const r = evalSingle("\\Re\\left(3+4i\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBe(3);
  });

  it("Im(3+4i) works", () => {
    const r = evalSingle("\\Im\\left(3+4i\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBe(4);
  });

  it("overline (conj) works", () => {
    const r = evalSingle("\\overline{3+4i}");
    expect(r?.error).toBeUndefined();
  });

  it("real(3) works as text", () => {
    const r = evalSingle("real\\left(3\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBe(3);
  });

  it("d/dx(4x) derivative works", () => {
    const r = evalSingle("\\frac{d}{dx}\\left(4x\\right)");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toBe(4);
  });

  //List tests
  it("list literal [3,5,4]", () => {
    const r = evalSingle("[3,5,4]");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toEqual([3, 5, 4]);
  });

  it("list range [1,2...5]", () => {
    const r = evalSingle("[1,2\\ldots5]");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toEqual([1, 2, 3, 4, 5]);
  });

  it("list * scalar", () => {
    const results = evaluateExpressions([
      { id: "1", latex: "L=[2,3,4]" },
      { id: "2", latex: "L\\cdot3" },
    ]);
    expect(results.get("2")?.value).toEqual([6, 9, 12]);
  });

  it("list + list element-wise", () => {
    const results = evaluateExpressions([
      { id: "1", latex: "A=[1,2,3]" },
      { id: "2", latex: "B=[10,20,30]" },
      { id: "3", latex: "A+B" },
    ]);
    expect(results.get("3")?.value).toEqual([11, 22, 33]);
  });

  it("list * list element-wise (shorter wins)", () => {
    const results = evaluateExpressions([
      { id: "1", latex: "A=[2,3]" },
      { id: "2", latex: "B=[4,5,6]" },
      { id: "3", latex: "A\\cdot B" },
    ]);
    expect(results.get("3")?.value).toEqual([8, 15]);
  });

  it("list range with step 2: [1,3...9]", () => {
    const r = evalSingle("[1,3\\ldots9]");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toEqual([1, 3, 5, 7, 9]);
  });

  it("list with \\lbrack and \\rbrack", () => {
    const r = evalSingle("\\lbrack4,2,1\\rbrack");
    expect(r?.error).toBeUndefined();
    expect(r?.value).toEqual([4, 2, 1]);
  });

  it("transpose of matrix", () => {
    const r = evalSingle("\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}^{T}");
    expect(r?.error).toBeUndefined();
  });

  it("matrix to non-integer power", () => {
    const r = evalSingle("\\begin{bmatrix}4 & 0 \\\\ 0 & 9\\end{bmatrix}^{0.5}");
    expect(r?.error).toBeUndefined();
    //sqrt of diagonal matrix should give [2,0;0,3]
    const arr = r?.value?.toArray ? r.value.toArray() : r?.value;
    expect(arr[0][0]).toBeCloseTo(2);
    expect(arr[1][1]).toBeCloseTo(3);
  });

  it("eigenvalue of matrix", () => {
    const r = evalSingle("eigenvalue\\left(\\begin{bmatrix}2 & 0 \\\\ 0 & 3\\end{bmatrix}\\right)");
    expect(r?.error).toBeUndefined();
    const vals = (r?.value as number[]).sort((a, b) => a - b);
    expect(vals[0]).toBeCloseTo(2);
    expect(vals[1]).toBeCloseTo(3);
  });

  it("eigenvector of matrix", () => {
    const r = evalSingle("eigenvector\\left(\\begin{bmatrix}2 & 0 \\\\ 0 & 3\\end{bmatrix}\\right)");
    expect(r?.error).toBeUndefined();
    expect(Array.isArray(r?.value)).toBe(true);
    expect(r?.value.length).toBe(2);
  });
});
