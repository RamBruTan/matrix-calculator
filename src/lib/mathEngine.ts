import { create, all } from "mathjs";
import { sanitizeError, PLACEHOLDER_ERROR } from "./errorSanitizer";

const math = create(all);

const TAU = 2 * Math.PI;
const PHI = (1 + Math.sqrt(5)) / 2;

math.import({ tau: TAU, phi: PHI }, { override: true });

//BlockMatrix: a matrix whose cells may themselves be matrices.
//Wraps a 2-D JS array so math.js doesn't flatten the nested structure into
//a higher-rank tensor. Cell values may be numbers, complex, math.Matrix,
//or other BlockMatrix instances. Operations dispatch through math.add /
//math.multiply on each cell so they recurse naturally.
interface BlockMatrix {
  __block: true;
  rows: any[][];
  R: number;
  C: number;
}

function isBlock(x: any): x is BlockMatrix {
  return x && typeof x === "object" && x.__block === true;
}

function isInnerMatrix(x: any): boolean {
  if (isBlock(x)) return true;
  if (x && typeof x === "object" && typeof x.toArray === "function") {
    const s = (x as any).size?.();
    return Array.isArray(s) && s.length >= 1;
  }
  return false;
}

function makeBlock(rows: any[][]): BlockMatrix {
  return { __block: true, rows, R: rows.length, C: rows[0].length };
}

//Build a matrix literal from a 2-D array of values. If any cell is itself
//a matrix (math.Matrix or BlockMatrix), wrap as BlockMatrix; otherwise
//build a normal math.matrix.
function _mkmat(...args: any[]): any {
  if (args.length < 2 || typeof args[0] !== "number" || typeof args[1] !== "number") {
    throw new Error("_mkmat: expected (rows, cols, ...cells)");
  }
  const R = args[0] as number;
  const C = args[1] as number;
  const cells = args.slice(2);
  if (cells.length !== R * C) throw new Error("_mkmat: cell count mismatch");

  const rows: any[][] = [];
  for (let i = 0; i < R; i++) {
    rows.push(cells.slice(i * C, (i + 1) * C));
  }

  let hasInner = false;
  for (const r of rows) for (const c of r) if (isInnerMatrix(c)) { hasInner = true; break; }
  if (hasInner) return makeBlock(rows);
  return math.matrix(rows);
}

//Save originals so block overrides can fall through to scalar/matrix paths.
const _origAdd = math.add.bind(math);
const _origSub = math.subtract.bind(math);
const _origMul = math.multiply.bind(math);
const _origDiv = math.divide.bind(math);
const _origUM = math.unaryMinus.bind(math);
const _origPow = math.pow.bind(math);
const _origTranspose = math.transpose.bind(math);
const _origDet = math.det.bind(math);

function blockEwise(a: BlockMatrix, b: BlockMatrix, op: (x: any, y: any) => any): BlockMatrix {
  if (a.R !== b.R || a.C !== b.C) throw new Error("Block matrix dimension mismatch");
  const rows: any[][] = [];
  for (let i = 0; i < a.R; i++) {
    const row: any[] = [];
    for (let j = 0; j < a.C; j++) row.push(op(a.rows[i][j], b.rows[i][j]));
    rows.push(row);
  }
  return makeBlock(rows);
}

function blockScalarOp(s: any, b: BlockMatrix, op: (x: any, y: any) => any, scalarLeft: boolean): BlockMatrix {
  const rows: any[][] = [];
  for (let i = 0; i < b.R; i++) {
    const row: any[] = [];
    for (let j = 0; j < b.C; j++) {
      row.push(scalarLeft ? op(s, b.rows[i][j]) : op(b.rows[i][j], s));
    }
    rows.push(row);
  }
  return makeBlock(rows);
}

function blockMatMul(a: BlockMatrix, b: BlockMatrix): BlockMatrix {
  if (a.C !== b.R) throw new Error(`Block matrix multiplication dimension mismatch (${a.R}x${a.C} * ${b.R}x${b.C})`);
  const rows: any[][] = [];
  for (let i = 0; i < a.R; i++) {
    const row: any[] = [];
    for (let j = 0; j < b.C; j++) {
      let acc: any = null;
      for (let k = 0; k < a.C; k++) {
        //Use the (overridden) math.multiply / math.add so this recurses
        const prod = math.multiply(a.rows[i][k], b.rows[k][j]);
        acc = acc === null ? prod : math.add(acc, prod);
      }
      row.push(acc);
    }
    rows.push(row);
  }
  return makeBlock(rows);
}

function blockTranspose(b: BlockMatrix): BlockMatrix {
  const rows: any[][] = [];
  for (let j = 0; j < b.C; j++) {
    const row: any[] = [];
    for (let i = 0; i < b.R; i++) {
      //Transpose individual cells too so a block of column-vector cells
      //becomes a block of row-vector cells, etc.
      const c = b.rows[i][j];
      row.push(isInnerMatrix(c) ? math.transpose(c) : c);
    }
    rows.push(row);
  }
  return makeBlock(rows);
}

function blockDet(b: BlockMatrix): any {
  if (b.R !== b.C) throw new Error("det requires a square matrix");
  const n = b.R;
  if (n === 1) return b.rows[0][0];
  if (n === 2) {
    return math.subtract(
      math.multiply(b.rows[0][0], b.rows[1][1]),
      math.multiply(b.rows[0][1], b.rows[1][0])
    );
  }

  //Cofactor expansion along row 0
  let acc: any = null;
  for (let j = 0; j < n; j++) {
    const minor: any[][] = [];
    for (let i = 1; i < n; i++) {
      const row: any[] = [];
      for (let k = 0; k < n; k++) if (k !== j) row.push(b.rows[i][k]);
      minor.push(row);
    }
    const term = math.multiply(b.rows[0][j], blockDet(makeBlock(minor)));
    const signed = j % 2 === 0 ? term : math.unaryMinus(term);
    acc = acc === null ? signed : math.add(acc, signed);
  }
  return acc;
}

function blockPow(b: BlockMatrix, p: any): BlockMatrix {
  if (b.R !== b.C) throw new Error("Block matrix power requires a square matrix");
  if (typeof p !== "number" || !Number.isInteger(p) || p < 0) {
    throw new Error("Block matrix power supports only non-negative integers");
  }
  //p=0 is unsupported because cell identities aren't well-defined without
  //knowing cell shapes.
  if (p === 0) throw new Error("Block matrix to the 0-th power is not supported");
  let result: BlockMatrix = b;
  for (let i = 1; i < p; i++) result = blockMatMul(result, b);
  return result;
}

math.import({
  add: (a: any, b: any) => {
    if (isBlock(a) && isBlock(b)) return blockEwise(a, b, math.add);
    if (isBlock(a) || isBlock(b)) throw new Error("Cannot add block matrix to non-block value");
    return _origAdd(a, b);
  },
  subtract: (a: any, b: any) => {
    if (isBlock(a) && isBlock(b)) return blockEwise(a, b, math.subtract);
    if (isBlock(a) || isBlock(b)) throw new Error("Cannot subtract block matrix and non-block value");
    return _origSub(a, b);
  },
  multiply: (a: any, b: any) => {
    if (isBlock(a) && isBlock(b)) return blockMatMul(a, b);
    if (isBlock(a)) return blockScalarOp(b, a, math.multiply, false);
    if (isBlock(b)) return blockScalarOp(a, b, math.multiply, true);
    return _origMul(a, b);
  },
  divide: (a: any, b: any) => {
    if (isBlock(a) && !isBlock(b)) return blockScalarOp(b, a, math.divide, false);
    if (isBlock(b)) throw new Error("Cannot divide by a block matrix");
    return _origDiv(a, b);
  },
  unaryMinus: (a: any) => {
    if (isBlock(a)) {
      return makeBlock(a.rows.map(r => r.map(c => math.unaryMinus(c))));
    }
    return _origUM(a);
  },
  pow: (a: any, b: any) => {
    if (isBlock(a)) return blockPow(a, b);
    if (isBlock(b)) throw new Error("Cannot raise to a block-matrix power");
    return _origPow(a, b);
  },
  transpose: (a: any) => {
    if (isBlock(a)) return blockTranspose(a);
    return _origTranspose(a);
  },
  det: (a: any) => {
    if (isBlock(a)) return blockDet(a);
    return _origDet(a);
  },
  _mkmat: _mkmat,
  _absdet: (a: any) => {
    if (isBlock(a)) return blockDet(a);
    if (a && typeof a === "object" && typeof a.size === "function") {
      const sz = a.size();
      if (sz.length === 2) return _origDet(a);
    }
    return math.abs(a);
  },
}, { override: true });

//Matrix exponential via Padé(6) approximant
function matExpm(M: any): any {
  const size = M.size();
  if (size.length !== 2 || size[0] !== size[1]) throw new Error("expm requires a square matrix");
  const n = size[0];
  const I = math.identity(n) as any;

  let s = 0;
  let norm = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      norm += Math.abs(math.subset(M, math.index(i, j)) as number);
  while (norm > 1) { norm /= 2; s++; }

  const A = math.multiply(M, Math.pow(2, -s)) as any;
  const padeCoeffs = [1, 1/2, 1/10, 1/120, 1/1680, 1/30240, 1/665280];
  let Ak = I;
  let N = math.multiply(I, padeCoeffs[0]) as any;
  let D = math.multiply(I, padeCoeffs[0]) as any;
  for (let k = 1; k <= 6; k++) {
    Ak = math.multiply(Ak, A) as any;
    N = math.add(N, math.multiply(Ak, padeCoeffs[k])) as any;
    D = math.add(D, math.multiply(Ak, padeCoeffs[k] * (k % 2 === 0 ? 1 : -1))) as any;
  }

  let result = math.multiply(math.inv(D), N) as any;
  for (let i = 0; i < s; i++) result = math.multiply(result, result) as any;
  return result;
}

function cleanNumeric(v: any): any {
  if (typeof v === 'number') {
    const rounded = Math.round(v);
    return Math.abs(v - rounded) < 1e-10 ? rounded : parseFloat(v.toFixed(10));
  }
  if (v && typeof v === 'object' && ('re' in v || 'im' in v)) return v;
  return v;
}

function cleanMatrixResult(M: any): any {
  const arr = (M.toArray ? M.toArray() : M) as any[][];
  const cleaned = arr.map(row => row.map(v => {
    if (typeof v === 'number') {
      const rounded = Math.round(v);
      return Math.abs(v - rounded) < 1e-10 ? rounded : parseFloat(v.toFixed(10));
    }
    if (v && typeof v === 'object' && 're' in v) {
      const re = Math.abs(v.re) < 1e-10 ? 0 : (Math.abs(v.re - Math.round(v.re)) < 1e-10 ? Math.round(v.re) : v.re);
      const im = Math.abs(v.im) < 1e-10 ? 0 : (Math.abs(v.im - Math.round(v.im)) < 1e-10 ? Math.round(v.im) : v.im);
      if (im === 0) return re;
      return math.complex(re, im);
    }
    return v;
  }));
  return math.matrix(cleaned);
}

function eigenDecomp(M: any): { values: any[]; vectors: any[][] } {
  const result = math.eigs(M);
  const values = (result.values as any).toArray
    ? (result.values as any).toArray()
    : Array.isArray(result.values) ? result.values : [result.values];
  const vecMatrix = (result.eigenvectors || (result as any).vectors);

  let vectors: any[][] = [];
  if (Array.isArray(vecMatrix) && vecMatrix.length > 0 && vecMatrix[0].vector) {
    vectors = vecMatrix.map((ev: any) => {
      const v = ev.vector.toArray ? ev.vector.toArray() : ev.vector;
      return v.map((x: any) => cleanNumeric(x));
    });
  }

  return { values: values.map((v: any) => cleanNumeric(v)), vectors };
}

//Matrix power via eigendecomposition (integer fast path, general via D^p)
function matPow(M: any, p: number): any {
  const arr = (M.toArray ? M.toArray() : M) as number[][];
  const n = arr.length;
  if (arr.some(row => row.length !== n)) throw new Error("Matrix must be square for exponentiation");

  if (Number.isInteger(p) && p >= 0) {
    let result = math.identity(n) as any;
    let base = math.matrix(arr);
    let exp = p;
    while (exp > 0) {
      if (exp % 2 === 1) result = math.multiply(result, base);
      base = math.multiply(base, base);
      exp = Math.floor(exp / 2);
    }
    return cleanMatrixResult(result);
  }
  if (Number.isInteger(p) && p < 0) return matPow(math.inv(math.matrix(arr)), -p);

  const { values, vectors } = eigenDecomp(math.matrix(arr));
  const n2 = values.length;
  const Pdata: any[][] = Array.from({ length: n2 }, (_, i) => vectors.map(v => v[i]));
  const Pcols = math.matrix(Pdata);
  const Dp = math.diag(values.map(v => math.pow(v, p)) as any);
  const Pinv = math.inv(Pcols);
  return cleanMatrixResult(math.multiply(math.multiply(Pcols, Dp), Pinv));
}

//Scalar^Matrix via eigendecomposition
function scalarPowMatrix(scalar: any, M: any): any {
  const arr = (M.toArray ? M.toArray() : M) as any[][];
  const n = arr.length;
  if (arr.some(row => row.length !== n)) throw new Error("Matrix must be square for exponentiation");

  if (scalar === 0) {
    const { values } = eigenDecomp(math.matrix(arr));
    if (values.some((v: any) => {
      const re = typeof v === 'number' ? v : v.re;
      return re < 0;
    })) throw new Error("Result is undefined: 0 raised to a negative matrix power");
    return math.zeros(n, n);
  }

  const { values, vectors } = eigenDecomp(math.matrix(arr));
  const n2 = values.length;
  const Pdata: any[][] = Array.from({ length: n2 }, (_, i) => vectors.map(v => v[i]));
  const Pcols = math.matrix(Pdata);
  const Dp = math.diag(values.map(v => math.pow(scalar, v)) as any);
  const Pinv = math.inv(Pcols);
  return cleanMatrixResult(math.multiply(math.multiply(Pcols, Dp), Pinv));
}

//Matrix logarithm via eigendecomposition (principal branch)
function matLog(M: any): any {
  const arr = (M.toArray ? M.toArray() : M) as any[][];
  const n = arr.length;
  if (arr.some(row => row.length !== n)) throw new Error("Matrix must be square for logarithm");
  const { values, vectors } = eigenDecomp(math.matrix(arr));
  if (values.some((v: any) => {
    const re = typeof v === 'number' ? v : v.re;
    const im = typeof v === 'number' ? 0 : v.im;
    return Math.abs(re) < 1e-12 && Math.abs(im) < 1e-12;
  })) throw new Error("Matrix logarithm undefined: matrix has a zero eigenvalue");
  const Pdata: any[][] = Array.from({ length: values.length }, (_, i) => vectors.map(v => v[i]));
  const P = math.matrix(Pdata);
  const D = math.diag(values.map((v: any) => math.log(v)) as any);
  const Pinv = math.inv(P);
  return math.multiply(math.multiply(P, D), Pinv);
}

//Matrix ^ Matrix:  A^B = expm(B · log(A))
function matMatPow(A: any, B: any): any {
  const sa = A.size();
  const sb = B.size();
  if (sa.length !== 2 || sa[0] !== sa[1]) throw new Error("Matrix ^ Matrix requires square base");
  if (sb.length !== 2 || sb[0] !== sb[1]) throw new Error("Matrix ^ Matrix requires square exponent");
  if (sa[0] !== sb[0]) throw new Error("Matrix ^ Matrix requires matrices of the same size");
  const logA = matLog(A);
  const BlogA = math.multiply(B, logA);
  return cleanMatrixResult(matExpm(BlogA));
}

function applyMatrixFunc(M: any, scalarFn: (x: any) => any): any {
  const size = M.size();
  if (size.length !== 2 || size[0] !== size[1]) throw new Error("Matrix must be square for this operation");
  const { values, vectors } = eigenDecomp(M);
  const n = values.length;
  const Pdata: any[][] = Array.from({ length: n }, (_, i) => vectors.map(v => v[i]));
  const P = math.matrix(Pdata);
  const D = math.diag(values.map(v => scalarFn(v)) as any);
  const Pinv = math.inv(P);
  return cleanMatrixResult(math.multiply(math.multiply(P, D), Pinv));
}

function isMatrixArg(x: any): boolean {
  return x && typeof x === 'object' && typeof x.size === 'function' &&
    x.size().length === 2;
}

//RREF: Gauss-Jordan with partial pivoting
function computeRref(M: any): { matrix: any; pivotCols: number[] } {
  const arr = (M.toArray ? M.toArray() : M) as number[][];
  const rows = arr.length;
  const cols = arr[0].length;
  const A = arr.map(r => [...r]);
  const pivotCols: number[] = [];

  let pivotRow = 0;
  for (let col = 0; col < cols && pivotRow < rows; col++) {
    //Partial pivoting
    let maxRow = pivotRow;
    let maxVal = Math.abs(A[pivotRow][col]);
    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(A[r][col]) > maxVal) { maxVal = Math.abs(A[r][col]); maxRow = r; }
    }
    if (maxVal < 1e-12) continue;

    [A[pivotRow], A[maxRow]] = [A[maxRow], A[pivotRow]];
    const pivot = A[pivotRow][col];
    for (let j = 0; j < cols; j++) A[pivotRow][j] /= pivot;

    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = A[r][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = 0; j < cols; j++) A[r][j] -= factor * A[pivotRow][j];
    }

    pivotCols.push(col);
    pivotRow++;
  }

  //Clean near-zero entries
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      if (Math.abs(A[i][j]) < 1e-10) A[i][j] = 0;
      else A[i][j] = cleanNumeric(A[i][j]) as number;

  return { matrix: math.matrix(A), pivotCols };
}

//REF: Gaussian elimination with partial pivoting
function computeRef(M: any): any {
  const arr = (M.toArray ? M.toArray() : M) as number[][];
  const rows = arr.length;
  const cols = arr[0].length;
  const A = arr.map(r => [...r]);

  let pivotRow = 0;
  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let maxRow = pivotRow;
    let maxVal = Math.abs(A[pivotRow][col]);
    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(A[r][col]) > maxVal) { maxVal = Math.abs(A[r][col]); maxRow = r; }
    }
    if (maxVal < 1e-12) continue;

    [A[pivotRow], A[maxRow]] = [A[maxRow], A[pivotRow]];
    const pivot = A[pivotRow][col];
    for (let j = 0; j < cols; j++) A[pivotRow][j] /= pivot;

    for (let r = pivotRow + 1; r < rows; r++) {
      const factor = A[r][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = 0; j < cols; j++) A[r][j] -= factor * A[pivotRow][j];
    }
    pivotRow++;
  }

  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      if (Math.abs(A[i][j]) < 1e-10) A[i][j] = 0;
      else A[i][j] = cleanNumeric(A[i][j]) as number;

  return math.matrix(A);
}

//SVD via eigendecomposition of M^T M
function computeSvd(M: any): { U: any; S: any; V: any } {
  const arr = (M.toArray ? M.toArray() : M) as number[][];
  const m = arr.length;
  const n = arr[0].length;
  const Mt = math.transpose(M);
  const MtM = math.multiply(Mt, M);

  const { values: eigVals, vectors: eigVecs } = eigenDecomp(MtM);

  //Sort by eigenvalue descending
  const indexed = eigVals.map((v: any, i: number) => ({ val: typeof v === 'number' ? v : Math.abs(v), idx: i }));
  indexed.sort((a: any, b: any) => b.val - a.val);

  const singularValues = indexed.map((e: any) => Math.sqrt(Math.max(0, e.val)));
  const sortedVecs = indexed.map((e: any) => eigVecs[e.idx]);

  //V matrix (n x n)
  const Vdata: number[][] = Array.from({ length: n }, (_, i) =>
    sortedVecs.map((v: any) => typeof v[i] === 'number' ? v[i] : 0)
  );
  const V = math.matrix(Vdata);

  //S matrix (m x n)
  const Sdata: number[][] = Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) => i === j && i < singularValues.length ? singularValues[i] : 0)
  );
  const S = math.matrix(Sdata);

  //U = M * V * Sigma^{-1} for non-zero singular values
  const Udata: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  const MV = math.multiply(M, V);
  const MVarr = (MV.toArray ? MV.toArray() : MV) as number[][];

  for (let j = 0; j < Math.min(m, n); j++) {
    if (singularValues[j] > 1e-12) {
      for (let i = 0; i < m; i++) {
        Udata[i][j] = MVarr[i][j] / singularValues[j];
      }
    }
  }
  //Fill remaining columns of U with identity for unfilled columns
  for (let j = Math.min(m, n); j < m; j++) {
    Udata[j][j] = 1;
  }

  return {
    U: cleanMatrixResult(math.matrix(Udata)),
    S: cleanMatrixResult(S),
    V: cleanMatrixResult(V),
  };
}

//Schur decomposition via iterative QR algorithm
function computeSchur(M: any): { T: any; U: any } {
  const size = M.size();
  if (size[0] !== size[1]) throw new Error("Matrix must be square for Schur decomposition");
  const n = size[0];

  let T = math.matrix((M.toArray ? M.toArray() : M) as number[][]);
  let U = math.identity(n) as any;

  for (let iter = 0; iter < 1000; iter++) {
    const { Q, R } = math.qr(T) as any;
    T = math.multiply(R, Q) as any;
    U = math.multiply(U, Q) as any;

    //Check convergence: sub-diagonal entries near zero
    let converged = true;
    const Tarr = (T.toArray ? T.toArray() : T) as number[][];
    for (let i = 1; i < n; i++) {
      if (Math.abs(Tarr[i][i - 1]) > 1e-10) { converged = false; break; }
    }
    if (converged) break;
  }

  return { T: cleanMatrixResult(T), U: cleanMatrixResult(U) };
}

function computeCofactor(M: any): any {
  const arr = (M.toArray ? M.toArray() : M) as number[][];
  const n = arr.length;
  if (n !== arr[0].length) throw new Error("Matrix must be square for cofactor");

  const cof: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const minor = arr
        .filter((_, r) => r !== i)
        .map(row => row.filter((_, c) => c !== j));
      return ((i + j) % 2 === 0 ? 1 : -1) * (math.det(math.matrix(minor)) as number);
    })
  );
  return cleanMatrixResult(math.matrix(cof));
}

//Null space / kernel via RREF
function computeNullspace(M: any): any[] {
  const arr = (M.toArray ? M.toArray() : M) as number[][];
  const n = arr[0].length;
  const { matrix: rref, pivotCols } = computeRref(M);
  const R = (rref.toArray ? rref.toArray() : rref) as number[][];

  const pivotSet = new Set(pivotCols);
  const freeCols = [];
  for (let j = 0; j < n; j++) if (!pivotSet.has(j)) freeCols.push(j);

  if (freeCols.length === 0) return [];

  const basis: any[] = [];
  for (const fc of freeCols) {
    const vec = Array(n).fill(0);
    vec[fc] = 1;
    for (let i = 0; i < pivotCols.length; i++) {
      vec[pivotCols[i]] = -R[i][fc];
    }
    basis.push(math.matrix(vec.map(x => [cleanNumeric(x)])));
  }
  return basis;
}

//Column space via RREF
function computeColspace(M: any): any[] {
  const arr = (M.toArray ? M.toArray() : M) as number[][];
  const { pivotCols } = computeRref(M);
  return pivotCols.map(j =>
    math.matrix(arr.map(row => [cleanNumeric(row[j])]))
  );
}

//Kronecker product
function computeKron(A: any, B: any): any {
  const a = (A.toArray ? A.toArray() : A) as number[][];
  const b = (B.toArray ? B.toArray() : B) as number[][];
  const ma = a.length, na = a[0].length;
  const mb = b.length, nb = b[0].length;
  const result: number[][] = Array.from({ length: ma * mb }, (_, i) =>
    Array.from({ length: na * nb }, (_, j) => {
      const ai = Math.floor(i / mb), bi = i % mb;
      const aj = Math.floor(j / nb), bj = j % nb;
      return a[ai][aj] * b[bi][bj];
    })
  );
  return math.matrix(result);
}

//Store originals before overriding
const originalPow = math.pow;
const originalSin = math.sin;
const originalCos = math.cos;
const originalTan = math.tan;
const originalExp = math.exp;
const originalLog = math.log;
const originalLog10 = math.log10;
const originalSinh = math.sinh;
const originalCosh = math.cosh;
const originalTanh = math.tanh;
const originalSqrt = math.sqrt;
const originalNthRoot = math.nthRoot;
const originalNorm = math.norm;

//Import all custom functions into mathjs
math.import({
  eigenvalue: function(M: any) {
    const { values } = eigenDecomp(M);
    return values.map(v => cleanNumeric(v));
  },
  eigenvector: function(M: any) {
    const { vectors } = eigenDecomp(M);
    return vectors.map(v => math.matrix(v.map(x => [cleanNumeric(x)])));
  },

  //Lambert W function (principal branch, real & complex)
  lambertW: function lambertW(z: any): any {
    const isComplex = z && typeof z === 'object' && 're' in z;
    if (!isComplex) {
      if (z < -1 / Math.E - 1e-15) {
        //Below -1/e on the real line: principal branch is complex
        return lambertW(math.complex(z as number, 0));
      }
      let w = z === 0 ? 0 : (z < 1 ? 0 : Math.log(z as number));
      for (let i = 0; i < 200; i++) {
        const ew = Math.exp(w);
        const wew = w * ew;
        const num = wew - (z as number);
        const denom = ew * (w + 1) - ((w + 2) * num) / (2 * w + 2);
        const dw = num / denom;
        w -= dw;
        if (Math.abs(dw) < 1e-15) break;
      }
      return w;
    }
    //Complex case: Halley's method with safe initial guess
    let w: any = (math.abs(z) as number) < 1
      ? math.complex(0.1, 0.1)
      : math.log(z);
    for (let i = 0; i < 300; i++) {
      const ew = math.exp(w);
      const wew = math.multiply(w, ew);
      const num = math.subtract(wew, z);
      const term1 = math.multiply(ew, math.add(w, 1));
      const term2 = math.divide(
        math.multiply(math.add(w, 2), num),
        math.multiply(2, math.add(w, 1))
      );
      const denom = math.subtract(term1, term2);
      const dw = math.divide(num, denom);
      w = math.subtract(w, dw);
      if ((math.abs(dw) as number) < 1e-14) break;
    }
    return w;
  },

  //Error function (Abramowitz & Stegun rational approximation)
  erf: function(x: number) {
    const sign = x < 0 ? -1 : 1;
    const a = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * a);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return sign * y;
  },

  expm: matExpm,

  //Power overrides: dispatch on matrix vs scalar in each arg
  pow: function(base: any, exp: any) {
    const baseIsMatrix = isMatrixArg(base);
    const expIsMatrix = isMatrixArg(exp);
    if (baseIsMatrix && typeof exp === 'number') return matPow(base, exp);
    if ((typeof base === 'number' || (base && typeof base === 'object' && 're' in base)) && expIsMatrix)
      return scalarPowMatrix(base, exp);
    if (baseIsMatrix && expIsMatrix) return matMatPow(base, exp);
    return originalPow(base, exp);
  },

  rank: function(M: any) {
    const { pivotCols } = computeRref(M);
    return pivotCols.length;
  },

  nullspace: function(M: any) { return computeNullspace(M); },
  colspace: function(M: any) { return computeColspace(M); },
  ref: function(M: any) { return computeRef(M); },
  rref: function(M: any) { return computeRref(M).matrix; },

  ludecomp: function(M: any) {
    const size = M.size();
    if (size[0] !== size[1]) throw new Error("LU decomposition requires a square matrix");
    const result = math.lup(M);
    return { __decomp: true, parts: [
      { name: 'L', value: cleanMatrixResult(result.L) },
      { name: 'U', value: cleanMatrixResult(result.U) },
    ]};
  },

  qrdecomp: function(M: any) {
    const result = math.qr(M) as any;
    return { __decomp: true, parts: [
      { name: 'Q', value: cleanMatrixResult(result.Q) },
      { name: 'R', value: cleanMatrixResult(result.R) },
    ]};
  },

  svddecomp: function(M: any) {
    const { U, S, V } = computeSvd(M);
    return { __decomp: true, parts: [
      { name: 'U', value: U },
      { name: 'S', value: S },
      { name: 'V', value: V },
    ]};
  },

  //Moore-Penrose pseudoinverse: pinv = V * S+ * U^T
  pinv: function(M: any) {
    const { U, S, V } = computeSvd(M);
    const Sarr = (S.toArray ? S.toArray() : S) as number[][];
    const m = Sarr.length, n = Sarr[0].length;
    //S+ : transpose and invert non-zero singular values
    const Splus: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: m }, (_, j) =>
        i === j && i < Math.min(m, n) && Math.abs(Sarr[j][i]) > 1e-12
          ? 1 / Sarr[j][i] : 0
      )
    );
    return cleanMatrixResult(
      math.multiply(math.multiply(V, math.matrix(Splus)), math.transpose(U))
    );
  },

  adjugate: function(M: any) {
    const arr = (M.toArray ? M.toArray() : M) as number[][];
    const n = arr.length;
    if (n !== arr[0].length) throw new Error("Matrix must be square for adjugate");
    const d = math.det(M) as number;
    if (Math.abs(d) > 1e-12) {
      return cleanMatrixResult(math.multiply(d, math.inv(M)));
    }
    //Singular: transpose of cofactor matrix
    return cleanMatrixResult(math.transpose(computeCofactor(M)));
  },

  cofactor: function(M: any) { return computeCofactor(M); },

  //Default to Frobenius norm for matrices
  norm: function(x: any, ...args: any[]) {
    if (isMatrixArg(x) && args.length === 0) return originalNorm(x, 'fro');
    return (originalNorm as any)(x, ...args);
  },

  cond: function(M: any) {
    const size = M.size();
    if (size[0] !== size[1]) throw new Error("Condition number requires a square matrix");
    const { S } = computeSvd(M);
    const Sarr = (S.toArray ? S.toArray() : S) as number[][];
    const n = Math.min(size[0], size[1]);
    const svs = Array.from({ length: n }, (_, i) => Math.abs(Sarr[i][i]));
    const maxSv = Math.max(...svs);
    const minSv = Math.min(...svs);
    if (minSv < 1e-15) return Infinity;
    return maxSv / minSv;
  },

  kron: function(A: any, B: any) { return computeKron(A, B); },

  //Hadamard (element-wise) product
  hadamard: function(A: any, B: any) { return math.dotMultiply(A, B); },

  //Commutator
  comm: function(A: any, B: any) {
    return math.subtract(math.multiply(A, B), math.multiply(B, A));
  },

  sym: function(M: any) {
    return cleanMatrixResult(math.multiply(0.5, math.add(M, math.transpose(M))));
  },
  antisym: function(M: any) {
    return cleanMatrixResult(math.multiply(0.5, math.subtract(M, math.transpose(M))));
  },

  //Vectorize: stack columns into a single column vector
  vec: function(M: any) {
    const arr = (M.toArray ? M.toArray() : M) as number[][];
    const m = arr.length, n = arr[0].length;
    const result: number[][] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < m; i++)
        result.push([arr[i][j]]);
    return math.matrix(result);
  },

  //Projection matrix onto column space of M
  proj: function(M: any) {
    const Mt = math.transpose(M);
    const MtM = math.multiply(Mt, M);
    try {
      const MtMInv = math.inv(MtM);
      return cleanMatrixResult(math.multiply(math.multiply(M, MtMInv), Mt));
    } catch {
      throw new Error("M^T M is singular; projection matrix is undefined");
    }
  },

  rowsum: function(M: any) {
    const arr = (M.toArray ? M.toArray() : M) as number[][];
    return math.matrix(arr.map(row => [row.reduce((a, b) => a + b, 0)]));
  },
  colsum: function(M: any) {
    const arr = (M.toArray ? M.toArray() : M) as number[][];
    const cols = arr[0].length;
    return math.matrix([Array.from({ length: cols }, (_, j) =>
      arr.reduce((sum, row) => sum + row[j], 0)
    )]);
  },
  rowprod: function(M: any) {
    const arr = (M.toArray ? M.toArray() : M) as number[][];
    return math.matrix(arr.map(row => [row.reduce((a, b) => a * b, 1)]));
  },
  colprod: function(M: any) {
    const arr = (M.toArray ? M.toArray() : M) as number[][];
    const cols = arr[0].length;
    return math.matrix([Array.from({ length: cols }, (_, j) =>
      arr.reduce((prod, row) => prod * row[j], 1)
    )]);
  },

  schurdecomp: function(M: any) {
    const { T, U } = computeSchur(M);
    return { __decomp: true, parts: [
      { name: 'T', value: T },
      { name: 'U', value: U },
    ]};
  },

  //Characteristic polynomial: expand product of (λ - λ_i)
  charpoly: function(M: any) {
    const size = M.size();
    if (size[0] !== size[1]) throw new Error("Matrix must be square for characteristic polynomial");
    const { values } = eigenDecomp(M);
    let coeffs = [1];
    for (const lam of values) {
      const newCoeffs = Array(coeffs.length + 1).fill(0);
      for (let i = 0; i < coeffs.length; i++) {
        newCoeffs[i] += coeffs[i];
        const negLam = typeof lam === 'number' ? -lam : -lam;
        newCoeffs[i + 1] += (coeffs[i] as number) * (negLam as number);
      }
      coeffs = newCoeffs;
    }
    return coeffs.map(c => cleanNumeric(c));
  },

  spectralradius: function(M: any) {
    const { values } = eigenDecomp(M);
    return Math.max(...values.map((v: any) =>
      typeof v === 'number' ? Math.abs(v) : math.abs(v) as number
    ));
  },

  //Scalar functions extended to matrices via eigendecomposition
  sin: function(x: any) {
    if (isMatrixArg(x)) return applyMatrixFunc(x, v => originalSin(v));
    return originalSin(x);
  },
  cos: function(x: any) {
    if (isMatrixArg(x)) return applyMatrixFunc(x, v => originalCos(v));
    return originalCos(x);
  },
  tan: function(x: any) {
    if (isMatrixArg(x)) return applyMatrixFunc(x, v => originalTan(v));
    return originalTan(x);
  },
  exp: function(x: any) {
    if (isMatrixArg(x)) return matExpm(x);
    return originalExp(x);
  },
  log: function(x: any, base?: any) {
    if (isMatrixArg(x)) {
      if (base !== undefined) {
        return applyMatrixFunc(x, v => {
          if (typeof v === 'number' && v <= 0) throw new Error("Logarithm undefined for non-positive eigenvalue");
          return math.divide(originalLog(v), originalLog(base));
        });
      }
      return applyMatrixFunc(x, v => {
        if (typeof v === 'number' && v <= 0) throw new Error("Logarithm undefined for non-positive eigenvalue");
        return originalLog(v);
      });
    }
    if (base !== undefined) return (originalLog as any)(x, base);
    return originalLog(x);
  },
  log10: function(x: any) {
    if (isMatrixArg(x)) {
      return applyMatrixFunc(x, v => {
        if (typeof v === 'number' && v <= 0) throw new Error("log10 undefined for non-positive eigenvalue");
        return originalLog10(v);
      });
    }
    return originalLog10(x);
  },
  sinh: function(x: any) {
    if (isMatrixArg(x)) return applyMatrixFunc(x, v => originalSinh(v));
    return originalSinh(x);
  },
  cosh: function(x: any) {
    if (isMatrixArg(x)) return applyMatrixFunc(x, v => originalCosh(v));
    return originalCosh(x);
  },
  tanh: function(x: any) {
    if (isMatrixArg(x)) return applyMatrixFunc(x, v => originalTanh(v));
    return originalTanh(x);
  },
  sqrt: function(x: any) {
    if (isMatrixArg(x)) return matPow(x, 0.5);
    return originalSqrt(x);
  },
  nthRoot: function(x: any, n: any = 2) {
    if (isMatrixArg(x)) {
      const degree = typeof n === "number" ? n : Number(n);
      if (!Number.isFinite(degree) || degree === 0) {
        throw new Error("nthRoot index must be a non-zero real number");
      }
      return matPow(x, 1 / degree);
    }
    return originalNthRoot(x, n);
  },
}, { override: true });

//List helpers
function isPlainList(val: any): val is any[] {
  if (Array.isArray(val) && val.length > 0 && !Array.isArray(val[0])) return true;
  if (val && typeof val === "object" && typeof val.toArray === "function") {
    const arr = val.toArray();
    return Array.isArray(arr) && arr.length > 0 && !Array.isArray(arr[0]);
  }
  return false;
}

function toPlainArray(val: any): any {
  if (val && typeof val === "object" && typeof val.toArray === "function") {
    const arr = val.toArray();
    if (Array.isArray(arr) && arr.length > 0 && !Array.isArray(arr[0])) return arr;
  }
  return val;
}

function asList(val: any): any[] | null {
  if (Array.isArray(val) && val.length > 0 && !Array.isArray(val[0])) return val;
  if (val && typeof val === "object" && typeof val.toArray === "function") {
    const arr = val.toArray();
    if (Array.isArray(arr) && arr.length > 0 && !Array.isArray(arr[0])) return arr;
  }
  return null;
}

//User-defined function type
interface UserFunc {
  __userFunc: true;
  params: string[];
  bodyLatex: string;
}

function isUserFunc(v: any): v is UserFunc {
  return v && typeof v === 'object' && v.__userFunc === true;
}

//Expand user-defined function calls in raw LaTeX before conversion.
//e.g. if f(x)=x^2 is defined, then f(3) → (3)^2
function expandUserFunctions(latex: string, variables: Record<string, any>): string {
  let s = latex;
  let safety = 0;
  //Iterate until no more expansions (handles nested calls like f(g(2)))
  while (safety++ < 20) {
    let changed = false;
    for (const [name, def] of Object.entries(variables)) {
      if (!isUserFunc(def)) continue;
      let i = 0;
      while (i < s.length) {
        const nameIdx = s.indexOf(name, i);
        if (nameIdx === -1) break;
        //Skip if part of a larger word
        if (nameIdx > 0 && /[a-zA-Z]/.test(s[nameIdx - 1])) { i = nameIdx + 1; continue; }
        const afterName = nameIdx + name.length;
        if (afterName >= s.length) { i = afterName; continue; }

        //Check for \left( or (
        let parenStart: number;
        let openParen: string;
        let closeParen: string;
        if (s.substring(afterName).startsWith('\\left(')) {
          parenStart = afterName + 6;
          openParen = '\\left(';
          closeParen = '\\right)';
        } else if (s[afterName] === '(') {
          parenStart = afterName + 1;
          openParen = '(';
          closeParen = ')';
        } else {
          i = afterName;
          continue;
        }

        const argStr = extractBalancedArgs(s, parenStart, closeParen);
        if (argStr === null) { i = afterName; continue; }

        const fullEnd = argStr.endIdx;
        const args = splitTopLevelCommas(argStr.content);

        if (args.length !== def.params.length) { i = afterName; continue; }

        //Substitute params in body, wrapping each arg in parens
        let body = def.bodyLatex;
        for (let p = 0; p < def.params.length; p++) {
          const param = def.params[p];
          body = body.replace(new RegExp(`(?<![a-zA-Z])${param}(?![a-zA-Z])`, 'g'), `(${args[p]})`);
        }

        s = s.substring(0, nameIdx) + `(${body})` + s.substring(fullEnd);
        changed = true;
        break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  return s;
}

//Extract content between balanced parens; returns content and end index (after closing).
function extractBalancedArgs(s: string, start: number, closeParen: string): { content: string; endIdx: number } | null {
  let depth = 1;
  let i = start;
  const closeLen = closeParen.length;
  while (i < s.length && depth > 0) {
    if (closeParen === '\\right)' && s.substring(i).startsWith('\\left(')) {
      depth++; i += 6; continue;
    }
    if (closeParen === '\\right)' && s.substring(i).startsWith('\\right)')) {
      depth--; if (depth === 0) return { content: s.substring(start, i), endIdx: i + 7 };
      i += 7; continue;
    }
    if (closeParen === ')') {
      if (s[i] === '(') { depth++; i++; continue; }
      if (s[i] === ')') { depth--; if (depth === 0) return { content: s.substring(start, i), endIdx: i + 1 }; i++; continue; }
    }
    i++;
  }
  return null;
}

//Split a string by top-level commas (not inside parens/braces/brackets).
function splitTopLevelCommas(s: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

//Extract the LHS name (variable or function) of an assignment, if any.
//Mirrors the patterns recognized by evaluateSingle.
function extractDefName(latex: string): string | null {
  const funcDefMatch = latex.match(
    /^([a-zA-Z])\s*(?:\\left)?\(\s*([a-zA-Z](?:\s*,\s*[a-zA-Z])*)\s*(?:\\right)?\)\s*=\s*(.+)$/
  );
  if (funcDefMatch) return funcDefMatch[1];
  const assignMatch = latex.match(/^([A-Za-z]|\\[A-Za-z]+)\s*=\s*(.+)$/);
  if (assignMatch) {
    return latexToMathjs(assignMatch[1]).trim();
  }
  return null;
}

//Find symbol references in latex (after stripping the LHS of an assignment).
//Returns ASCII identifiers and Greek-letter command names converted to their
//unicode form, matching how variables are stored.
function extractRefs(latex: string): Set<string> {
  const refs = new Set<string>();
  //Strip LHS so we don't pick up the defined symbol as a self-reference
  let body = latex;
  const funcDefMatch = body.match(
    /^[a-zA-Z]\s*(?:\\left)?\(\s*[a-zA-Z](?:\s*,\s*[a-zA-Z])*\s*(?:\\right)?\)\s*=\s*(.+)$/
  );
  if (funcDefMatch) body = funcDefMatch[1];
  else {
    const am = body.match(/^(?:[A-Za-z]|\\[A-Za-z]+)\s*=\s*(.+)$/);
    if (am) body = am[1];
  }

  //Greek/command tokens: \alpha, \beta, ...
  const cmdRe = /\\([A-Za-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = cmdRe.exec(body))) {
    const name = m[1];
    if (FUNC_NAMES.has(name)) continue;
    if (["left", "right", "begin", "end", "frac", "sqrt", "cdot", "times",
         "div", "pm", "lfloor", "rfloor", "lceil", "rceil", "ldots",
         "cdots", "dots", "displaystyle", "mathrm", "mathit", "mathbf",
         "mleft", "mright", "operatorname", "lbrack", "rbrack",
         "vert", "imaginaryI", "quad", "qquad", "hspace", "placeholder",
         "log", "sum", "prod", "int", "overline"].includes(name)) continue;
    //Convert Greek command name to its single-char form
    const converted = latexToMathjs(`\\${name}`).trim().replace(/[()]/g, "");
    if (converted) refs.add(converted);
  }

  //ASCII identifiers
  const idRe = /[A-Za-z]/g;
  while ((m = idRe.exec(body))) {
    const ch = m[0];
    const before = body[m.index - 1];
    if (before === "\\") continue;
    //Walk back: if part of \name continuation, skip
    let k = m.index - 1;
    while (k >= 0 && /[A-Za-z]/.test(body[k])) k--;
    if (k >= 0 && body[k] === "\\") continue;
    refs.add(ch);
  }
  return refs;
}

export function evaluateExpressions(
  expressions: { id: string; latex: string }[]
): Map<string, { value: any; error?: string }> {
  const results = new Map<string, { value: any; error?: string }>();
  const variables: Record<string, any> = {};

  //Build dependency info per expression
  type Node = { id: string; latex: string; defines: string | null; refs: Set<string> };
  const nodes: Node[] = expressions.map((e) => {
    const trimmed = e.latex.trim();
    if (!trimmed) return { id: e.id, latex: "", defines: null, refs: new Set() };
    return {
      id: e.id,
      latex: trimmed,
      defines: extractDefName(trimmed),
      refs: extractRefs(trimmed),
    };
  });

  //Map definedName -> indices that define it (last one wins on conflict)
  const definers = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (n.defines) {
      const arr = definers.get(n.defines) ?? [];
      arr.push(i);
      definers.set(n.defines, arr);
    }
  });

  //Edges: i -> j means i must be evaluated AFTER j.
  //For multiple definers of the same name, depend on the last one (most
  //recent definition takes precedence — matches typical scripting semantics).
  const deps: Set<number>[] = nodes.map(() => new Set());
  nodes.forEach((n, i) => {
    n.refs.forEach((s) => {
      const list = definers.get(s);
      if (!list) return;
      const j = list[list.length - 1];
      if (j !== i) deps[i].add(j);
    });
  });

  //Kahn's algorithm
  const indeg = nodes.map(() => 0);
  const reverse: number[][] = nodes.map(() => []);
  deps.forEach((set, i) => {
    set.forEach((j) => {
      indeg[i]++;
      reverse[j].push(i);
    });
  });
  const order: number[] = [];
  const queue: number[] = [];
  for (let i = 0; i < nodes.length; i++) if (indeg[i] === 0) queue.push(i);
  while (queue.length) {
    const i = queue.shift()!;
    order.push(i);
    for (const k of reverse[i]) {
      indeg[k]--;
      if (indeg[k] === 0) queue.push(k);
    }
  }
  const inCycle = new Set<number>();
  if (order.length < nodes.length) {
    for (let i = 0; i < nodes.length; i++) if (indeg[i] > 0) inCycle.add(i);
    //Append cycle nodes at the end so they still get an error message
    for (const i of inCycle) order.push(i);
  }

  //Build per-node cycle path. For each cycle node, DFS through
  //deps (restricted to inCycle) to find a path that returns to itself.
  const cyclePaths = new Map<number, string>();
  for (const start of inCycle) {
    const startName = nodes[start].defines ?? `expr ${start + 1}`;
    const path: string[] = [startName];
    const seen = new Set<number>([start]);
    const dfs = (i: number): boolean => {
      for (const j of deps[i]) {
        if (!inCycle.has(j)) continue;
        if (j === start) { path.push(startName); return true; }
        if (seen.has(j)) continue;
        seen.add(j);
        path.push(nodes[j].defines ?? `expr ${j + 1}`);
        if (dfs(j)) return true;
        path.pop();
        seen.delete(j);
      }
      return false;
    };
    dfs(start);
    cyclePaths.set(start, path.join(" → "));
  }

  //Evaluate in topological order, populating the variables scope
  const evalResults = new Map<string, { value: any; error?: string }>();
  for (const i of order) {
    const n = nodes[i];
    if (!n.latex) {
      evalResults.set(n.id, { value: undefined });
      continue;
    }
    if (inCycle.has(i)) {
      const path = cyclePaths.get(i);
      evalResults.set(n.id, {
        value: undefined,
        error: path ? `Circular reference: ${path}` : "Circular reference",
      });
      continue;
    }
    //Pre-check: detect unfilled MathLive placeholders before any parsing
    if (/\\placeholder(\s*\{[^}]*\}|\b)/.test(n.latex)) {
      evalResults.set(n.id, {
        value: undefined,
        error: sanitizeError(PLACEHOLDER_ERROR, { latex: n.latex }),
      });
      continue;
    }
    try {
      const { name, value } = evaluateSingle(n.latex, variables);
      if (name) variables[name] = value;
      if (typeof value === "number" && Number.isNaN(value)) {
        evalResults.set(n.id, { value: undefined, error: "Indeterminate form" });
      } else {
        evalResults.set(n.id, { value });
      }
    } catch (e: any) {
      evalResults.set(n.id, {
        value: undefined,
        error: sanitizeError(e, { latex: n.latex, lastCall: (e && e.__lastCall) || undefined }),
      });
    }
  }

  //Preserve original expression order in returned map
  for (const e of expressions) {
    results.set(e.id, evalResults.get(e.id) ?? { value: undefined });
  }
  return results;
}

function evaluateSingle(
  latex: string,
  variables: Record<string, any>
): { name?: string; value: any } {
  //Function definition: f(x) = expr  or  g(x,y) = expr
  const funcDefMatch = latex.match(
    /^([a-zA-Z])\s*(?:\\left)?\(\s*([a-zA-Z](?:\s*,\s*[a-zA-Z])*)\s*(?:\\right)?\)\s*=\s*(.+)$/
  );
  if (funcDefMatch) {
    const name = funcDefMatch[1];
    const params = funcDefMatch[2].split(',').map(p => p.trim());
    const bodyLatex = funcDefMatch[3];
    const funcDef: UserFunc = { __userFunc: true, params, bodyLatex };
    return { name, value: funcDef };
  }

  const assignMatch = latex.match(
    /^([A-Za-z]|\\[A-Za-z]+)\s*=\s*(.+)$/
  );
  if (assignMatch) {
    const rawName = assignMatch[1];
    const symName = latexToMathjs(rawName).trim();
    const value = computeLatex(assignMatch[2], variables);
    return { name: symName, value };
  }
  return { value: computeLatex(latex, variables) };
}

function extractInlineLists(expr: string): { expr: string; lists: string[][] } {
  const lists: string[][] = [];
  let out = "";
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "[") {
      //Find matching ], tracking nested [/] depth
      let depth = 1;
      let j = i + 1;
      while (j < expr.length && depth > 0) {
        const c = expr[j];
        if (c === "[") depth++;
        else if (c === "]") { depth--; if (depth === 0) break; }
        j++;
      }
      if (depth === 0) {
        const content = expr.substring(i + 1, j);
        //Split on top-level commas, tracking (), {}, [], and matrix sentinels \x01/\x02
        const parts: string[] = [];
        let pd = 0, bd = 0, sd = 0, md = 0, start = 0;
        for (let k = 0; k < content.length; k++) {
          const c = content[k];
          if (c === "(") pd++;
          else if (c === ")") pd--;
          else if (c === "{") bd++;
          else if (c === "}") bd--;
          else if (c === "[") sd++;
          else if (c === "]") sd--;
          else if (c === "\x01") md++;
          else if (c === "\x02") md--;
          else if (c === "," && pd === 0 && bd === 0 && sd === 0 && md === 0) {
            parts.push(content.substring(start, k).trim());
            start = k + 1;
          }
        }
        parts.push(content.substring(start).trim());
        if (parts.length >= 1 && parts.every(p => p.length > 0)) {
          const idx = lists.length;
          lists.push(parts);
          out += `__inlst${idx}__`;
          i = j + 1;
          continue;
        }
      }
    }
    out += expr[i];
    i++;
  }
  return { expr: out, lists };
}

//Restore matrix sentinel brackets back to real [/] before math.evaluate
function restoreMatrixBrackets(s: string): string {
  return s.replace(/\x01/g, "[").replace(/\x02/g, "]");
}

//If a 2D matrix has every cell as an equal-length list, restructure into
//a list of matrices. Enforces "lists are always the outermost layer".
function normalizeResult(val: any): any {
  const arr = (val && typeof val === "object" && typeof val.toArray === "function")
    ? val.toArray() : val;
  if (!Array.isArray(arr) || arr.length === 0 || !Array.isArray(arr[0])) return val;
  const rows = arr.length;
  const cols = arr[0].length;
  let n: number | null = null;
  const cells: any[][][] = [];
  for (let i = 0; i < rows; i++) {
    if (!Array.isArray(arr[i]) || arr[i].length !== cols) return val;
    cells.push([]);
    for (let j = 0; j < cols; j++) {
      const c = arr[i][j];
      const cArr = Array.isArray(c) ? c
        : (c && typeof c === "object" && typeof c.toArray === "function" ? c.toArray() : null);
      if (!cArr || !Array.isArray(cArr) || cArr.some((x: any) => Array.isArray(x))) return val;
      if (n === null) n = cArr.length;
      else if (cArr.length !== n) return val;
      cells[i].push(cArr);
    }
  }
  if (n === null || n < 1) return val;
  const out: any[] = [];
  for (let k = 0; k < n; k++) {
    const m: any[][] = [];
    for (let i = 0; i < rows; i++) {
      const row: any[] = [];
      for (let j = 0; j < cols; j++) row.push(cells[i][j][k]);
      m.push(row);
    }
    out.push(cleanMatrixResult(math.matrix(m)));
  }
  return out;
}

function computeLatex(latex: string, variables: Record<string, any>): any {
  //Expand user-defined function calls before conversion
  const expanded = expandUserFunctions(latex, variables);
  let expr = latexToMathjs(expanded);

  //Extract inline 1D list literals so they broadcast like list variables
  const inlineExtract = extractInlineLists(expr);
  expr = inlineExtract.expr;
  const inlineLists = inlineExtract.lists;

  const listVars: Record<string, any[]> = {};
  const scalarVars: Record<string, any> = {};

  for (const [name, val] of Object.entries(variables)) {
    if (isUserFunc(val)) continue;
    const list = asList(val);
    if (list) {
      const regex = new RegExp(`(?<![a-zA-Z])${name}(?![a-zA-Z])`);
      if (regex.test(expr)) {
        listVars[name] = list;
      } else {
        scalarVars[name] = val;
      }
    } else {
      scalarVars[name] = val;
    }
  }

  const hasListVars = Object.keys(listVars).length > 0;
  const hasInline = inlineLists.length > 0;

  if (hasListVars || hasInline) {
    const lens: number[] = [
      ...Object.values(listVars).map(l => l.length),
      ...inlineLists.map(l => l.length),
    ];
    const minLen = Math.min(...lens);
    const results: any[] = [];
    for (let i = 0; i < minLen; i++) {
      let s = expr;
      for (let k = 0; k < inlineLists.length; k++) {
        s = s.split(`__inlst${k}__`).join(`(${inlineLists[k][i]})`);
      }
      const localVars: Record<string, any> = { ...scalarVars };
      for (const [name, list] of Object.entries(listVars)) {
        localVars[name] = list[i];
      }
      results.push(evaluateScalarExpr(s, localVars));
    }
    return results;
  }

  return evaluateScalarExpr(expr, scalarVars);
}

function evaluateScalarExpr(expr: string, variables: Record<string, any>): any {
  //Matrix sentinel brackets are restored just before evaluation
  let s = restoreMatrixBrackets(expr);

  for (const [name, val] of Object.entries(variables)) {
    const regex = new RegExp(`(?<![a-zA-Z])${name}(?![a-zA-Z])`, "g");
    if (typeof val === "number") {
      s = s.replace(regex, `(${val})`);
    }
  }

  const scope: Record<string, any> = {};
  for (const [name, val] of Object.entries(variables)) {
    if (val && typeof val === "object" && typeof val.toArray === "function") {
      scope[name] = val;
    } else if (Array.isArray(val)) {
      scope[name] = math.matrix(val);
    } else if (typeof val === "object" && val !== null) {
      scope[name] = val;
    }
  }

  checkUndefinedSymbols(s, scope);
  let result: any;
  try {
    result = math.evaluate(s, scope);
  } catch (err: any) {
    //Attach a best-guess function name so sanitizeError can label leaks
    const m = s.match(/([a-zA-Z_]\w*)\s*\(/);
    if (m && err && typeof err === "object") err.__lastCall = m[1];
    throw err;
  }
  if (result && typeof result === "object" && (result as any).isUnit) {
    throw new Error("Undefined symbol(s) in expression");
  }
  return normalizeResult(toPlainArray(result));
}

//Walk the parse tree and reject SymbolNodes that resolve to math.js Units
//(so e.g. `s` is reported as Undefined instead of silently being parsed as
//the SI unit `seconds`). Also rejects symbols mathjs doesn't know at all.
function checkUndefinedSymbols(s: string, scope: Record<string, any>): void {
  let tree: any;
  try { tree = math.parse(s); } catch { return; }
  const seen = new Set<string>();
  const visit = (node: any) => {
    if (!node) return;
    if (node.isSymbolNode) {
      const n = node.name as string;
      if (seen.has(n)) return;
      seen.add(n);
      if (n in scope) return;
      if (/^__inlst\d+__$/.test(n) || n === "_mkmat") return;
      const v = (math as any)[n];
      if (v === undefined) throw new Error(`Undefined symbol ${n}`);
      //Reject any symbol that resolves to a unit (e.g. s = seconds, A = ampere)
      try {
        if (typeof v === "object" && v !== null && (v.isUnit || (math as any).typeOf?.(v) === "Unit")) {
          throw new Error(`Undefined symbol ${n}`);
        }
      } catch (e: any) {
        if (e.message?.startsWith("Undefined symbol")) throw e;
      }
    }
    if (typeof node.forEach === "function") node.forEach(visit);
  };
  visit(tree);
}

//All known function names (prevent implicit multiplication splitting)
const FUNC_NAMES = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "arcsin", "arccos", "arctan", "arcsinh", "arccosh", "arctanh",
  "sqrt", "log", "log10", "det", "inv", "transpose",
  "trace", "tr", "rank", "rk",
  "floor", "ceil", "nthRoot",
  "abs", "sign", "sum", "prod", "exp", "round", "mod",
  "max", "min", "gamma", "zeta", "lambertW", "factorial",
  "arg", "re", "im", "conj",
  "real", "imag",
  "eigenvalue", "eigenvector",
  "matpow", "expm", "erf",
  "nullspace", "null", "ker",
  "colspace", "col", "image",
  "ref", "rref",
  "ludecomp", "lu",
  "qrdecomp", "qr",
  "svddecomp", "svd",
  "pinv",
  "adjugate", "adj",
  "cofactor", "cof",
  "norm", "cond",
  "diag", "dot", "cross",
  "kron", "hadamard",
  "comm", "sym", "antisym",
  "vec", "proj",
  "rowsum", "colsum", "rowprod", "colprod",
  "schurdecomp", "schur",
  "charpoly",
  "spectralradius", "sr",
]);

function latexToMathjs(latex: string): string {
  let s = latex;

  //0. Strip \displaystyle and its MathLive nesting braces
  s = s.replace(/\{*\\displaystyle\s*/g, "");
  s = stripOrphanBraces(s);

  //0a. Strip MathLive-specific commands
  s = s.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  s = s.replace(/\\mathit\{([^}]*)\}/g, "$1");
  s = s.replace(/\\mathbf\{([^}]*)\}/g, "$1");
  s = s.replace(/\\mleft/g, "\\left");
  s = s.replace(/\\mright/g, "\\right");
  s = s.replace(/\\[,;:!]/g, "");
  s = s.replace(/\\quad/g, " ");
  s = s.replace(/\\qquad/g, " ");
  s = s.replace(/\\hspace\{[^}]*\}/g, "");
  s = s.replace(/\\placeholder\{[^}]*\}/g, "");
  s = s.replace(/#\?/g, "");

  //0a2. Convert \lbrack / \rbrack to plain brackets
  s = s.replace(/\\lbrack/g, "[");
  s = s.replace(/\\rbrack/g, "]");

  //0b. Normalize ellipsis
  s = s.replace(/\\ldots/g, "...");
  s = s.replace(/\\cdots/g, "...");
  s = s.replace(/\\dots/g, "...");
  s = s.replace(/#\?/g, "");

  //1. Remove \left / \right
  s = s.replace(/\\left/g, "");
  s = s.replace(/\\right/g, "");

  //1a. Derivatives
  s = s.replace(
    /\\frac\{d(?:\^\{?\d+\}?)?\}\{d([a-zA-Z])(?:\^\{?\d+\}?)?\}\s*\(([^)]+)\)/g,
    (_, v, expr) => `derivative(${v}, ${latexToMathjs(expr.trim())})`
  );

  //2. Fractions
  s = replaceFrac(s);

  //3. Summation / product
  s = s.replace(
    /\\sum\s*_\{?\s*([a-zA-Z])\s*=\s*([^}^]+)\}?\s*\^\{?([^}()]+)\}?\s*\(([^)]+)\)/g,
    (_, v, start, end, expr) =>
      `sum_range(${v}, ${latexToMathjs(start.trim())}, ${latexToMathjs(end.trim())}, ${latexToMathjs(expr.trim())})`
  );
  s = s.replace(
    /\\prod\s*_\{?\s*([a-zA-Z])\s*=\s*([^}^]+)\}?\s*\^\{?([^}()]+)\}?\s*\(([^)]+)\)/g,
    (_, v, start, end, expr) =>
      `prod_range(${v}, ${latexToMathjs(start.trim())}, ${latexToMathjs(end.trim())}, ${latexToMathjs(expr.trim())})`
  );
  s = s.replace(/\\sum/g, "SUM_UNMATCHED");
  s = s.replace(/\\prod/g, "PROD_UNMATCHED");

  //4. Integrals
  s = s.replace(
    /\\int\s*_\{?([^}^]+)\}?\s*\^\{?([^}()]+)\}?\s*\(([^)]+)\)\s*d([a-zA-Z])/g,
    (_, lower, upper, expr, v) =>
      `integrate(${v}, ${latexToMathjs(lower.trim())}, ${latexToMathjs(upper.trim())}, ${latexToMathjs(expr.trim())})`
  );
  s = s.replace(/\\int/g, "INT_UNMATCHED");

  //5. Roots (supports nested content like matrix environments)
  s = replaceSqrt(s);

  //6. Operators
  s = s.replace(/\\cdot/g, "*");
  s = s.replace(/\\times/g, "*");
  s = s.replace(/\\div/g, "/");
  s = s.replace(/\\pm/g, "+");

  //7. Absolute value / determinant.
  //Iteratively collapse innermost |...| pairs. _absdet dispatches at runtime
  //on whether the inner value is scalar or a matrix (so ||M|| → det(det(M))).
  s = s.replace(/\\vert/g, "|");
  for (let guard = 0; guard < 50; guard++) {
    const next = s.replace(/\|([^|]+)\|/g, (_, inner) => {
      return `_absdet(${latexToMathjs(inner)})`;
    });
    if (next === s) break;
    s = next;
  }

  //8. Floor / ceil
  s = s.replace(/\\lfloor\s*(.*?)\s*\\rfloor/g, (_, inner) => `floor(${latexToMathjs(inner)})`);
  s = s.replace(/\\lceil\s*(.*?)\s*\\rceil/g, (_, inner) => `ceil(${latexToMathjs(inner)})`);
  s = s.replace(/\\lfloor/g, "floor(");
  s = s.replace(/\\rfloor/g, ")");
  s = s.replace(/\\lceil/g, "ceil(");
  s = s.replace(/\\rceil/g, ")");

  //9. Operator names — specific aliases BEFORE catch-all
  s = s.replace(/\\operatorname\{arcsinh\}/g, "asinh");
  s = s.replace(/\\operatorname\{arccosh\}/g, "acosh");
  s = s.replace(/\\operatorname\{arctanh\}/g, "atanh");
  s = s.replace(/\\operatorname\{sgn\}/g, "sign");
  s = s.replace(/\\operatorname\{signum\}/g, "sign");
  s = s.replace(/\\operatorname\{sign\}/g, "sign");
  s = s.replace(/\\operatorname\{abs\}/g, "abs");
  s = s.replace(/\\operatorname\{floor\}/g, "floor");
  s = s.replace(/\\operatorname\{ceil\}/g, "ceil");
  s = s.replace(/\\operatorname\{eigenvalue\}/g, "eigenvalue");
  s = s.replace(/\\operatorname\{eigenvector\}/g, "eigenvector");
  s = s.replace(/\\operatorname\{erf\}/g, "erf");
  s = s.replace(/\\operatorname\{rk\}/g, "rank");
  s = s.replace(/\\operatorname\{tr\}/g, "trace");
  s = s.replace(/\\operatorname\{null\}/g, "nullspace");
  s = s.replace(/\\operatorname\{ker\}/g, "nullspace");
  s = s.replace(/\\operatorname\{col\}/g, "colspace");
  s = s.replace(/\\operatorname\{colspace\}/g, "colspace");
  s = s.replace(/\\operatorname\{image\}/g, "colspace");
  s = s.replace(/\\operatorname\{adj\}/g, "adjugate");
  s = s.replace(/\\operatorname\{cof\}/g, "cofactor");
  s = s.replace(/\\operatorname\{sr\}/g, "spectralradius");
  s = s.replace(/\\operatorname\{lu\}/g, "ludecomp");
  s = s.replace(/\\operatorname\{qr\}/g, "qrdecomp");
  s = s.replace(/\\operatorname\{svd\}/g, "svddecomp");
  s = s.replace(/\\operatorname\{schur\}/g, "schurdecomp");
  //Catch-all for operatorname
  s = s.replace(/\\operatorname\{([^}]+)\}/g, "$1");

  //10a. Complex functions
  s = s.replace(/\\arg/g, "arg");
  s = s.replace(/\\Re/g, "re");
  s = s.replace(/\\Im/g, "im");
  s = s.replace(/\\overline\{([^}]+)\}/g, (_, inner) => `conj(${latexToMathjs(inner)})`);
  s = s.replace(/\breal\b/g, "re");
  s = s.replace(/\bimag\b/g, "im");

  //10. Trig / hyperbolic
  s = s.replace(/\\arcsinh/g, "asinh");
  s = s.replace(/\\arccosh/g, "acosh");
  s = s.replace(/\\arctanh/g, "atanh");
  s = s.replace(/\\arcsin/g, "asin");
  s = s.replace(/\\arccos/g, "acos");
  s = s.replace(/\\arctan/g, "atan");
  s = s.replace(/\\sinh/g, "sinh");
  s = s.replace(/\\cosh/g, "cosh");
  s = s.replace(/\\tanh/g, "tanh");
  s = s.replace(/\\det/g, "det");
  s = s.replace(/\\sin/g, "sin");
  s = s.replace(/\\cos/g, "cos");
  s = s.replace(/\\tan/g, "tan");
  s = s.replace(/\\ln/g, "log");
  s = s.replace(/\\abs/g, "abs");
  s = s.replace(/\\sgn/g, "sign");
  s = s.replace(/\\sign/g, "sign");
  s = s.replace(/\\signum/g, "sign");

  //11. Logarithms
  s = s.replace(/\\log_\{([^}]+)\}/g, (_, base) => `log_base_${latexToMathjs(base)}_`);
  s = s.replace(/\\log_([A-Za-z0-9])/g, (_, base) => `log_base_${base}_`);
  s = s.replace(/\\log/g, "log10");

  //11b. Special functions: Gamma, zeta as function calls (must precede greek-letter map)
  s = s.replace(/\\Gamma\s*(?=\()/g, "gamma");
  s = s.replace(/\\zeta\s*(?=\()/g, "zeta");
  //Capital W followed by paren is the Lambert W function
  s = s.replace(/(^|[^A-Za-z_])W\s*(?=\()/g, "$1lambertW");

  //12. Constants (negative-letter lookahead so e.g. \pi2 still matches)
  s = s.replace(/\\tau(?![A-Za-z])/g, "(tau)");
  s = s.replace(/\\phi(?![A-Za-z])/g, "(phi)");
  s = s.replace(/\\pi(?![A-Za-z])/g, "(pi)");

  //12b. Other Greek letters → unicode single-char identifiers.
  //(Constants tau/phi/pi handled above; e and i remain as-is.)
  const greekMap: Record<string, string> = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
    varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "θ",
    iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ",
    omicron: "ο", rho: "ρ", varrho: "ρ", sigma: "σ", varsigma: "σ",
    upsilon: "υ", varphi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ",
    Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  };
  for (const [name, ch] of Object.entries(greekMap)) {
    s = s.replace(new RegExp(`\\\\${name}(?![A-Za-z])`, "g"), ch);
  }

  //13. Inverse trig via ^{-1}
  s = s.replace(/sin\^\{-1\}/g, "asin");
  s = s.replace(/cos\^\{-1\}/g, "acos");
  s = s.replace(/tan\^\{-1\}/g, "atan");
  s = s.replace(/sinh\^\{-1\}/g, "asinh");
  s = s.replace(/cosh\^\{-1\}/g, "acosh");
  s = s.replace(/tanh\^\{-1\}/g, "atanh");
  s = s.replace(/sin\^\(-1\)/g, "asin");
  s = s.replace(/cos\^\(-1\)/g, "acos");
  s = s.replace(/tan\^\(-1\)/g, "atan");

  //13b. Transpose marker
  s = s.replace(/\^\{T\}/g, "⊤");
  s = s.replace(/\^T(?![a-zA-Z0-9{])/g, "⊤");

  //14. Superscripts
  s = replaceSupscripts(s);

  //15. Log base resolution
  s = s.replace(/log_base_([^_]+)_\(([^)]+)\)/g, "log($2, $1)");
  s = s.replace(/log_base_([^_]+)_([A-Za-z0-9.]+)/g, "log($2, $1)");

  //16. Remove unhandled subscripts
  s = s.replace(/_\{([^}]+)\}/g, "");

  //17. Matrix environments → mathjs array notation.
  //Emit sentinel brackets \x01/\x02 (instead of [/]) so inline list literals
  //inside matrix cells can be distinguished from matrix structure by
  //extractInlineLists. computeLatex / evaluateScalarExpr restore them to [/]
  //before math.evaluate.
  //Innermost-first replacement so nested matrices (matrix-of-matrices) work:
  //match only \begin{…matrix}…\end{…matrix} pairs that contain no further
  //\begin{…matrix} inside.
  {
    const matrixRe = /\\begin\{([bBpPvV]?)matrix\}((?:(?!\\begin\{[bBpPvV]?matrix\})[\s\S])*?)\\end\{[bBpPvV]?matrix\}/g;
    let prev: string;
    let safety = 0;
    do {
      prev = s;
      s = s.replace(matrixRe, (_m, _kind, content) => {
        const rowsOfCells: string[][] = (content as string)
          .split(/\\\\/)
          .map((row: string) =>
            row
              .split(/&&|(?<!&)&(?!&)/)
              .map((cell: string) => latexToMathjs(cell.trim()))
              .filter((cell: string) => cell.length > 0)
          )
          .filter((r: string[]) => r.length > 0);
        const R = rowsOfCells.length;
        const C = R > 0 ? rowsOfCells[0].length : 0;
        const flat = rowsOfCells.flat().join(", ");
        return `_mkmat(${R}, ${C}, ${flat})`;
      });
    } while (s !== prev && ++safety < 32);
  }

  //17b. Resolve transpose markers
  s = resolveTransposeMarkers(s);

  //17c. Matrix function-name normalization: `det_mkmat(...)` (no explicit
  //parens) → `det(_mkmat(...))`. Must run BEFORE implicit-mul so the
  //identifier `det_mkmat` is never produced.
  {
    const fnNames = ["det", "inv", "transpose", "trace", "rank", "adjugate", "cofactor"];
    const fnRe = new RegExp(`(?<![A-Za-z0-9_])(${fnNames.join("|")})\\s*_mkmat\\(`);
    let guard = 0;
    while (guard++ < 64) {
      const m = fnRe.exec(s);
      if (!m) break;
      const openIdx = m.index + m[0].length - 1;
      let depth = 1, j = openIdx + 1;
      while (j < s.length && depth > 0) {
        const c = s[j];
        if (c === "(") depth++;
        else if (c === ")") depth--;
        j++;
      }
      if (depth !== 0) break;
      s = s.substring(0, m.index) + m[1] + "(_mkmat(" + s.substring(openIdx + 1, j) + ")" + s.substring(j);
    }
  }

  //18. Implicit matrix multiplication. Matrix literals are now wrapped in
  //_mkmat(...), so two adjacent matrices look like ")_mkmat(" and a
  //letter-times-matrix looks like "X_mkmat(". Insert "*" so they're not
  //parsed as a single identifier or as function-call chaining.
  s = s.replace(/\)\s*_mkmat\(/g, ")*_mkmat(");
  //Insert * between an identifier and _mkmat(, but NOT after function names
  //(so `det _mkmat(...)` stays as a function call) and NOT inside `_mkmat`.
  s = s.replace(/([A-Za-z][A-Za-z0-9]*)\s*_mkmat\(/g, (m, word) => {
    if (FUNC_NAMES.has(word) || word === "_mkmat") return m;
    return `${word}*_mkmat(`;
  });
  s = s.replace(/(\d)\s*_mkmat\(/g, "$1*_mkmat(");

  //19. Imaginary unit
  s = s.replace(/\\imaginaryI/g, "(i)");

  //19b. Function name aliases (before word splitting)
  s = s.replace(/\brk\b/g, "rank");
  s = s.replace(/\btr\b(?!\s*a)/g, "trace"); //avoid matching 'trace' → 'traceace'
  s = s.replace(/\bnull\b/g, "nullspace");
  s = s.replace(/\bker\b/g, "nullspace");
  s = s.replace(/\bcol\b(?!\s*[su])/g, "colspace"); //avoid colsum/colprod
  s = s.replace(/\bimage\b/g, "colspace");
  s = s.replace(/\badj\b/g, "adjugate");
  s = s.replace(/\bcof\b/g, "cofactor");
  s = s.replace(/\bsr\b/g, "spectralradius");
  s = s.replace(/\blu\b/g, "ludecomp");
  s = s.replace(/\bqr\b/g, "qrdecomp");
  s = s.replace(/\bsvd\b/g, "svddecomp");
  s = s.replace(/\bschur\b/g, "schurdecomp");
  s = s.replace(/\barcsinh\b/g, "asinh");
  s = s.replace(/\barccosh\b/g, "acosh");
  s = s.replace(/\barctanh\b/g, "atanh");

  //20. Implicit scalar multiplication.
  //Letter↔digit covers ASCII and Greek unicode chars in both directions, so
  //`e2`, `\pi2`, `α2`, `2α` all become explicit multiplications.
  //Greek ranges: lowercase α-ω (U+03B1..U+03C9), uppercase Α-Ω (U+0391..U+03A9), ϕ (U+03D5).
  //Letter→digit only fires when the letter is *not* part of a multi-letter
  //word (lookbehind), so identifiers like `log10` stay intact.
  s = s.replace(/(\d)([A-Za-z(\u0391-\u03A9\u03B1-\u03C9\u03D5])/g, "$1*$2");
  s = s.replace(
    /(?<![A-Za-z_\u0391-\u03A9\u03B1-\u03C9\u03D5])([A-Za-z\u0391-\u03A9\u03B1-\u03C9\u03D5])(\d)/g,
    "$1*$2"
  );
  s = s.replace(/\)(\()/g, ")*$1");

  s = s.replace(/([a-zA-Z_][a-zA-Z0-9_]*)(\()/g, (match, word) => {
    if (FUNC_NAMES.has(word) || word === "_mkmat" || word === "_absdet") return match;
    if (
      word.startsWith("sum_range") ||
      word.startsWith("prod_range") ||
      word.startsWith("integrate") ||
      word.startsWith("derivative") ||
      word.startsWith("log_base")
    ) return match;
    return `${word}*(`;
  });

  s = s.replace(/\)([A-Za-z0-9])/g, ")*$1");
  s = s.replace(/([A-Z])([A-Z])/g, "$1*$2");

  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
    if (FUNC_NAMES.has(match)) return match;
    if (/^(pi|e|i|tau|phi|Infinity|NaN|true|false)$/.test(match)) return match;
    if (
      match.startsWith("sum_range") ||
      match.startsWith("prod_range") ||
      match.startsWith("integrate") ||
      match.startsWith("derivative") ||
      match.startsWith("log_base")
    ) return match;
    if (
      match === "SUM_UNMATCHED" ||
      match === "PROD_UNMATCHED" ||
      match === "INT_UNMATCHED"
    ) return match;
    if (match.length === 1) return match;
    if (/^[a-z]+$/.test(match)) return match.split("").join("*");
    return match;
  });

  s = s.replace(/\*\*/g, "^");

  //21. Factorial
  s = s.replace(/(\([^)]+\))!/g, "gamma($1+1)");
  s = s.replace(/(\d+(?:\.\d+)?)!/g, "gamma($1+1)");
  s = s.replace(/([a-zA-Z])!/g, "gamma($1+1)");

  //23. Resolve range functions and derivatives
  s = resolveRangeFunctions(s);
  s = resolveDerivatives(s);

  //24. Expand list range syntax
  s = expandListRanges(s);

  //25. Final safety net
  s = s.replace(/[{}]/g, "");

  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function stripOrphanBraces(s: string): string {
  let depth = 0;
  let result = "";
  for (const ch of s) {
    if (ch === "{") { depth++; result += ch; }
    else if (ch === "}") { if (depth > 0) { depth--; result += ch; } }
    else { result += ch; }
  }
  return result;
}

function resolveTransposeMarkers(s: string): string {
  let result = s;
  while (result.includes("⊤")) {
    const idx = result.indexOf("⊤");
    let end = idx;
    let start = idx - 1;
    if (start < 0) { result = result.replace("⊤", ""); continue; }

    const ch = result[start];
    if (ch === "]" || ch === "\x02") {
      const open = ch === "]" ? "[" : "\x01";
      const close = ch;
      let depth = 0;
      for (let i = start; i >= 0; i--) {
        if (result[i] === close) depth++;
        else if (result[i] === open) { depth--; if (depth === 0) { start = i; break; } }
      }
    } else if (ch === ")") {
      let depth = 0;
      for (let i = start; i >= 0; i--) {
        if (result[i] === ")") depth++;
        else if (result[i] === "(") { depth--; if (depth === 0) { start = i; break; } }
      }
      //Extend back through any preceding identifier (e.g. _mkmat)
      while (start > 0 && /[A-Za-z0-9_]/.test(result[start - 1])) start--;
    } else if (/[A-Za-z0-9_]/.test(ch)) {
      while (start > 0 && /[A-Za-z0-9_]/.test(result[start - 1])) start--;
    }

    const expr = result.substring(start, end);
    result = result.substring(0, start) + "transpose(" + expr + ")" + result.substring(idx + 1);
  }
  return result;
}

function replaceSupscripts(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "^" && i + 1 < s.length && s[i + 1] === "{") {
      const braced = extractBraced(s.substring(i + 1));
      if (braced) {
        result += "^(" + replaceSupscripts(braced.content) + ")";
        i += 1 + braced.end;
        continue;
      }
    }
    result += s[i];
    i++;
  }
  return result;
}

function resolveRangeFunctions(s: string): string {
  s = s.replace(
    /sum_range\(([a-zA-Z]),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g,
    (_, v, startStr, endStr, bodyStr) => {
      try {
        const start = Math.round(math.evaluate(startStr));
        const end = Math.round(math.evaluate(endStr));
        const terms: string[] = [];
        for (let i = start; i <= end; i++) {
          terms.push(`(${bodyStr.replace(new RegExp(`\\b${v}\\b`, "g"), `(${i})`)})`)
        }
        return `(${terms.join("+")})`;
      } catch { return `sum_range(${v}, ${startStr}, ${endStr}, ${bodyStr})`; }
    }
  );

  s = s.replace(
    /prod_range\(([a-zA-Z]),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g,
    (_, v, startStr, endStr, bodyStr) => {
      try {
        const start = Math.round(math.evaluate(startStr));
        const end = Math.round(math.evaluate(endStr));
        const terms: string[] = [];
        for (let i = start; i <= end; i++) {
          terms.push(`(${bodyStr.replace(new RegExp(`\\b${v}\\b`, "g"), `(${i})`)})`)
        }
        return `(${terms.join("*")})`;
      } catch { return `prod_range(${v}, ${startStr}, ${endStr}, ${bodyStr})`; }
    }
  );

  //Composite Simpson's rule
  s = s.replace(
    /integrate\(([a-zA-Z]),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/g,
    (_, v, lowerStr, upperStr, bodyStr) => {
      try {
        const a = math.evaluate(lowerStr) as number;
        const b = math.evaluate(upperStr) as number;
        const N = 1000;
        const h = (b - a) / N;
        let sum = 0;
        for (let i = 0; i <= N; i++) {
          const x = a + i * h;
          const val = math.evaluate(
            bodyStr.replace(new RegExp(`\\b${v}\\b`, "g"), `(${x})`)
          ) as number;
          if (i === 0 || i === N) sum += val;
          else if (i % 2 === 1) sum += 4 * val;
          else sum += 2 * val;
        }
        return `(${(h / 3) * sum})`;
      } catch { return `integrate(${v}, ${lowerStr}, ${upperStr}, ${bodyStr})`; }
    }
  );

  return s;
}

function expandListRanges(s: string): string {
  return s.replace(
    /\[([^\[\]]*?)\.\.\.\s*([^\]\[\]]+)\]/g,
    (whole, beforeDots, endStr) => {
      try {
        const parts = beforeDots.split(",").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
        if (parts.length < 2) return whole;

        const nums = parts.map((p: string) => math.evaluate(p) as number);
        const end = math.evaluate(endStr.trim()) as number;

        const step = nums[1] - nums[0];
        for (let i = 2; i < nums.length; i++) {
          const diff = nums[i] - nums[i - 1];
          if (Math.abs(diff - step) > 1e-10) return whole;
        }

        if (step === 0) return `[${nums[0]}]`;
        const elements: number[] = [...nums];
        const last = nums[nums.length - 1];
        if (step > 0) {
          for (let v = last + step; v <= end + 1e-12; v += step) elements.push(parseFloat(v.toFixed(10)));
        } else {
          for (let v = last + step; v >= end - 1e-12; v += step) elements.push(parseFloat(v.toFixed(10)));
        }
        return `[${elements.join(", ")}]`;
      } catch { return whole; }
    }
  );
}

function resolveDerivatives(s: string): string {
  return s.replace(
    /derivative\(([a-zA-Z]),\s*([^)]+)\)/g,
    (_, v, bodyStr) => {
      try {
        const derived = math.derivative(bodyStr, v);
        return `(${derived.toString()})`;
      } catch { return `derivative(${v}, ${bodyStr})`; }
    }
  );
}

function replaceSqrt(s: string): string {
  let result = "";
  let i = 0;

  while (i < s.length) {
    const idx = s.indexOf("\\sqrt", i);
    if (idx === -1) {
      result += s.substring(i);
      break;
    }

    result += s.substring(i, idx);

    let cursor = idx + 5;
    while (cursor < s.length && /\s/.test(s[cursor])) cursor++;

    let degree: string | null = null;
    if (s[cursor] === "[") {
      const bracketed = extractBracketed(s.substring(cursor));
      if (!bracketed) {
        result += "\\sqrt";
        i = idx + 5;
        continue;
      }
      degree = bracketed.content;
      cursor += bracketed.end;
      while (cursor < s.length && /\s/.test(s[cursor])) cursor++;
    }

    const radicand = extractArg(s.substring(cursor));
    if (!radicand) {
      result += "\\sqrt";
      i = idx + 5;
      continue;
    }

    const convertedRadicand = latexToMathjs(radicand.content);
    const replacement = degree
      ? `nthRoot(${convertedRadicand}, ${latexToMathjs(degree)})`
      : `sqrt(${convertedRadicand})`;

    result += replacement;
    i = cursor + radicand.end;
  }

  return result;
}

function extractBracketed(s: string): { content: string; end: number } | null {
  const trimmed = s.trimStart();
  const offset = s.length - trimmed.length;
  if (trimmed[0] !== "[") return null;

  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "[") depth++;
    else if (trimmed[i] === "]") {
      depth--;
      if (depth === 0) return { content: trimmed.substring(1, i), end: offset + i + 1 };
    }
  }

  return null;
}

function replaceFrac(s: string): string {
  let result = s;
  let safety = 0;
  while (result.includes("\\frac") && safety < 50) {
    safety++;
    const idx = result.indexOf("\\frac");
    const after = result.substring(idx + 5);
    const first = extractArg(after);
    if (!first) break;
    const after2 = after.substring(first.end);
    const second = extractArg(after2);
    if (!second) break;
    const replacement = `((${first.content})/(${second.content}))`;
    result = result.substring(0, idx) + replacement + after2.substring(second.end);
  }
  return result;
}

function extractArg(s: string): { content: string; end: number } | null {
  const trimmed = s.trimStart();
  const offset = s.length - trimmed.length;
  if (trimmed.length === 0) return null;
  if (trimmed[0] === "{") return extractBraced(s);
  return { content: trimmed[0], end: offset + 1 };
}

function extractBraced(s: string): { content: string; end: number } | null {
  const trimmed = s.trimStart();
  const offset = s.length - trimmed.length;
  if (trimmed[0] !== "{") return null;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "{") depth++;
    else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0) return { content: trimmed.substring(1, i), end: offset + i + 1 };
    }
  }
  return null;
}

export function formatResult(val: any, bracketStyle: "b" | "p" = "b"): string {
  if (val === undefined || val === null) return "";

  //User-defined function definitions — show confirmation
  if (val && typeof val === 'object' && val.__userFunc) {
    const params = val.params.join(', ');
    return `\\text{function defined: }${params}`;
  }

  //Decomposition results (LU, QR, SVD, Schur)
  if (val && typeof val === 'object' && val.__decomp) {
    return val.parts.map((p: any) =>
      `${p.name} = ${formatResult(p.value, bracketStyle)}`
    ).join(",\\quad ");
  }

  //BlockMatrix: render as a matrix whose cells are themselves formatted
  //recursively (so nested matrices appear visually nested).
  if (val && typeof val === "object" && val.__block) {
    const env = `${bracketStyle}matrix`;
    const rows = (val as BlockMatrix).rows.map((row) =>
      row.map((v) => formatResult(v, bracketStyle)).join(" & ")
    );
    return `\\begin{${env}} ${rows.join(" \\\\ ")} \\end{${env}}`;
  }

  if (val && typeof val === "object" && typeof val.toArray === "function") {
    return formatMatrixLatex(val.toArray(), bracketStyle);
  }

  if (Array.isArray(val)) {
    if (Array.isArray(val[0])) return formatMatrixLatex(val, bracketStyle);
    return `[${val.map((v: any) => formatResult(v, bracketStyle)).join(", ")}]`;
  }

  if (typeof val === "number") return formatNum(val);

  return String(val);
}

function formatMatrixLatex(matrix: any[][], bracketStyle: "b" | "p"): string {
  const env = `${bracketStyle}matrix`;
  const rows = matrix.map((row) =>
    (Array.isArray(row) ? row : [row]).map((v) => {
      if (v && typeof v === "object" && (v.__block || typeof v.toArray === "function")) {
        return formatResult(v, bracketStyle);
      }
      return formatNum(v);
    }).join(" & ")
  );
  return `\\begin{${env}} ${rows.join(" \\\\ ")} \\end{${env}}`;
}

function formatNum(n: any): string {
  if (typeof n !== "number") return String(n);
  if (Number.isNaN(n)) return "\\text{undefined}";
  if (n === Infinity) return "\\infty";
  if (n === -Infinity) return "-\\infty";
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(6)).toString();
}

export function isMatrixResult(val: any): boolean {
  if (val && typeof val === "object" && typeof val.toArray === "function") return true;
  if (val && typeof val === "object" && val.__block) return true;
  if (Array.isArray(val) && Array.isArray(val[0])) return true;
  return false;
}
