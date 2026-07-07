import { Link } from "react-router-dom";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <h2 className="text-lg font-semibold text-foreground mb-3 border-b border-border pb-2">{title}</h2>
    {children}
  </div>
);

const DocTable = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="text-left px-3 py-2 bg-secondary text-secondary-foreground font-medium border border-border">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-accent/30 transition-colors">
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 border border-border text-foreground">
                {j === 1 ? <code className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono">{cell}</code> : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Documentation = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">Documentation</h1>
        </div>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Calculator
        </Link>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        <p className="text-sm text-muted-foreground mb-8">
          A complete reference of every supported function, constant, operator, and syntax feature in the calculator.
          Type the shorthand in any expression field and it will auto-convert to the rendered symbol.
        </p>

        <Section title="Arithmetic & Operators">
          <DocTable
            headers={["Operator", "How to type it", "Description"]}
            rows={[
              ["Addition", "a + b", "Adds two values"],
              ["Subtraction", "a - b", "Subtracts the second value from the first"],
              ["Multiplication", "ab  or  a b  or  a \\cdot b", "Multiplies two values. Adjacent variables/numbers like 2x or AB multiply implicitly — no * needed"],
              ["Division", "a / b  or  type frac", "Divides the first value by the second. Typing / creates a fraction"],
              ["Exponentiation", "a ^ b", "Raises a to the power of b"],
              ["Factorial", "n!", "Computes n factorial (uses the gamma function internally)"],
              ["Modulo", "mod(a, b)", "Returns the remainder of a divided by b"],
              ["Absolute value", "|x|", "Returns the absolute value of x. For matrices, computes the determinant"],
              ["Floor", "floor(x)  or type floor", "Rounds x down to the nearest integer. Renders as ⌊x⌋"],
              ["Ceiling", "ceil(x)  or type ceil", "Rounds x up to the nearest integer. Renders as ⌈x⌉"],
            ]}
          />
        </Section>

        <Section title="Constants">
          <DocTable
            headers={["Constant", "How to type it", "Value"]}
            rows={[
              ["Pi", "pi", "π ≈ 3.14159…"],
              ["Tau", "tau", "τ = 2π ≈ 6.28318…"],
              ["Phi (golden ratio)", "phi", "φ = (1+√5)/2 ≈ 1.61803…"],
              ["Euler's number", "e", "e ≈ 2.71828…"],
              ["Imaginary unit", "i", "The imaginary unit, √(−1)"],
            ]}
          />
        </Section>

        <Section title="Trigonometric Functions">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Sine", "sin(x)", "Returns the sine of x (radians)"],
              ["Cosine", "cos(x)", "Returns the cosine of x"],
              ["Tangent", "tan(x)", "Returns the tangent of x"],
              ["Secant", "sec(x)", "Returns the secant of x"],
              ["Cosecant", "csc(x)", "Returns the cosecant of x"],
              ["Cotangent", "cot(x)", "Returns the cotangent of x"],
            ]}
          />
        </Section>

        <Section title="Inverse Trigonometric Functions">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Arcsine", "arcsin(x)  or  sin^(-1)(x)", "Returns the angle whose sine is x"],
              ["Arccosine", "arccos(x)  or  cos^(-1)(x)", "Returns the angle whose cosine is x"],
              ["Arctangent", "arctan(x)  or  tan^(-1)(x)", "Returns the angle whose tangent is x"],
            ]}
          />
        </Section>

        <Section title="Hyperbolic Trigonometric Functions">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Hyperbolic sine", "sinh(x)", "Returns the hyperbolic sine of x"],
              ["Hyperbolic cosine", "cosh(x)", "Returns the hyperbolic cosine of x"],
              ["Hyperbolic tangent", "tanh(x)", "Returns the hyperbolic tangent of x"],
              ["Inverse hyp. sine", "arcsinh(x)  or  sinh^(-1)(x)", "Returns the inverse hyperbolic sine of x"],
              ["Inverse hyp. cosine", "arccosh(x)  or  cosh^(-1)(x)", "Returns the inverse hyperbolic cosine of x"],
              ["Inverse hyp. tangent", "arctanh(x)  or  tanh^(-1)(x)", "Returns the inverse hyperbolic tangent of x"],
            ]}
          />
        </Section>

        <Section title="Logarithms & Exponentials">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Natural logarithm", "ln(x)", "Returns the natural log (base e) of x"],
              ["Common logarithm", "log(x)", "Returns the base-10 logarithm of x"],
              ["Log with custom base", "log_b(x)", "Returns the base-b logarithm of x (replace b with any number)"],
              ["Exponential", "exp(x)", "Returns e raised to the power x"],
              ["Square root", "sqrt(x)  or type sqrt", "Returns the square root of x"],
              ["Nth root", "type nthroot", "Returns the nth root of x. Auto-converts to the radical symbol with index"],
              ["Error function", "erf(x)", "Returns the error function evaluated at x"],
            ]}
          />
        </Section>

        <Section title="Rounding & Number Theory">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Floor", "floor(x)", "Rounds down to the nearest integer"],
              ["Ceiling", "ceil(x)", "Rounds up to the nearest integer"],
              ["Round", "round(x)", "Rounds to the nearest integer"],
              ["Sign", "sign(x)  or  sgn(x)", "Returns −1, 0, or 1 depending on the sign of x"],
              ["Absolute value", "abs(x)  or  |x|", "Returns the magnitude of x"],
              ["GCD", "gcd(a, b)", "Returns the greatest common divisor of a and b"],
              ["Minimum", "min(a, b)", "Returns the smaller of the two values"],
              ["Maximum", "max(a, b)", "Returns the larger of the two values"],
              ["Gamma", "gamma(x)", "Returns the gamma function evaluated at x"],
              ["Gamma (symbol)", "Gamma(x)  → Γ(x)", "Capital Gamma also calls the gamma function. Accepts complex inputs"],
              ["Riemann zeta", "zeta(x)  → ζ(x)", "Returns the Riemann zeta function evaluated at x. Accepts complex inputs"],
              ["Lambert W", "W(x)", "Returns the principal branch of the Lambert W function (solves W·eᵂ = x). Accepts complex inputs"],
            ]}
          />
        </Section>

        <Section title="Complex Numbers">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Imaginary unit", "i", "Use i in expressions, e.g. 3 + 4i"],
              ["Real part", "re(z)  or type real", "Extracts the real part of a complex number"],
              ["Imaginary part", "im(z)  or type imag", "Extracts the imaginary part of a complex number"],
              ["Conjugate", "conj(z)  or type conj", "Returns the complex conjugate. Renders as z̄ (overline)"],
              ["Argument", "arg(z)", "Returns the angle (argument) of a complex number in radians"],
            ]}
          />
        </Section>

        <Section title="Calculus (Sum, Product, Integral)">
          <DocTable
            headers={["Feature", "How to type it", "Description"]}
            rows={[
              ["Summation", "type sum", "Computes Σ from n = start to end of an expression. Fill in bounds and body"],
              ["Product", "type prod", "Computes Π from n = start to end of an expression"],
              ["Definite integral", "type int", "Numerically integrates an expression over a given interval using Simpson's rule"],
              ["Derivative", "d/dx via right-click → Insert", "Computes the symbolic derivative of an expression with respect to a variable"],
            ]}
          />
        </Section>

        <Section title="User-Defined Functions & Variables">
          <DocTable
            headers={["Feature", "How to type it", "Description"]}
            rows={[
              ["Variable assignment", "A = 5", "Assigns a value to a single-letter variable. Use it on later lines"],
              ["Matrix assignment", "M = [matrix]", "Assigns a matrix to a variable for reuse on subsequent lines"],
              ["Function definition", "f(x) = x^2 + 1", "Defines a custom function with one or more parameters"],
              ["Multi-param function", "g(x, y) = x + y", "Supports multiple comma-separated parameters"],
              ["Function usage", "f(3)  or  g(2, 5)", "Call your defined function on any later line. Nested calls also work"],
              ["List range syntax", "[1, 2, ... 10]", "Generates an arithmetic sequence from the pattern to the endpoint"],
            ]}
          />
        </Section>

        <Section title="Matrix Input & Syntax">
          <DocTable
            headers={["Feature", "How to type it", "Description"]}
            rows={[
              ["Insert matrix (shorthand)", "type matrix", "Auto-inserts an editable 2×2 matrix template"],
              ["Insert matrix (button)", "Click [ ] on hover", "Inserts a 2×2 zero matrix at the cursor"],
              ["Insert matrix (right-click)", "Right-click → Insert → Matrix", "Choose from various matrix sizes to insert"],
              ["Add/remove rows/columns", "Right-click inside matrix", "Context menu options to modify matrix dimensions"],
              ["Bracket style", "Settings → Matrix brackets", "Toggle between square brackets [ ] and parentheses ( )"],
              ["Transpose", "A^T", "Appends ^T to a matrix variable or expression to transpose it"],
            ]}
          />
        </Section>

        <Section title="Basic Matrix Operations">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Determinant", "det(M)  or  |M|", "Computes the determinant of a square matrix"],
              ["Inverse", "M^(-1)  or  inv(M)", "Computes the inverse of a square matrix"],
              ["Transpose", "M^T  or  transpose(M)", "Transposes rows and columns"],
              ["Trace", "trace(M)  or  tr(M)", "Returns the sum of diagonal elements"],
              ["Rank", "rank(M)  or  rk(M)", "Returns the number of linearly independent rows/columns"],
              ["Matrix power", "M^n", "Raises a square matrix to integer or fractional power n"],
              ["Scalar × Matrix", "3M", "Multiplies every element of the matrix by the scalar (no * needed)"],
              ["Matrix multiplication", "AB  or  A \\cdot B", "Standard matrix multiplication (dimensions must be compatible)"],
              ["Dot product", "dot(u, v)", "Computes the dot product of two vectors"],
              ["Cross product", "cross(u, v)", "Computes the cross product of two 3D vectors"],
              ["Norm", "norm(M)", "Computes the Frobenius norm of a matrix (Euclidean norm for vectors)"],
              ["Diagonal", "diag(M)  or  diag([1,2,3])", "Extracts diagonal of a matrix, or creates a diagonal matrix from a list"],
            ]}
          />
        </Section>

        <Section title="Matrix Decompositions">
          <DocTable
            headers={["Decomposition", "How to type it", "Description"]}
            rows={[
              ["LU decomposition", "lu(M)  or  ludecomp(M)", "Factors a square matrix into lower (L) and upper (U) triangular matrices"],
              ["QR decomposition", "qr(M)  or  qrdecomp(M)", "Factors a matrix into an orthogonal (Q) and upper triangular (R) matrix"],
              ["SVD", "svd(M)  or  svddecomp(M)", "Computes U, S, V such that M = U·S·Vᵀ"],
              ["Schur decomposition", "schur(M)  or  schurdecomp(M)", "Computes the Schur form T and unitary matrix U such that M = U·T·Uᵀ"],
              ["Eigenvalues", "eigenvalue(M)", "Returns the eigenvalues of a square matrix"],
              ["Eigenvectors", "eigenvector(M)", "Returns the eigenvectors of a square matrix as column vectors"],
            ]}
          />
        </Section>

        <Section title="Advanced Matrix Operations">
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["RREF", "rref(M)", "Computes the reduced row echelon form of a matrix"],
              ["REF", "ref(M)", "Computes the row echelon form of a matrix"],
              ["Null space", "nullspace(M)  or  ker(M)", "Returns basis vectors spanning the null space (kernel) of M"],
              ["Column space", "colspace(M)  or  col(M)  or  image(M)", "Returns basis vectors spanning the column space of M"],
              ["Pseudoinverse", "pinv(M)", "Computes the Moore-Penrose pseudoinverse of a matrix"],
              ["Adjugate", "adjugate(M)  or  adj(M)", "Computes the adjugate (classical adjoint) of a square matrix"],
              ["Cofactor matrix", "cofactor(M)  or  cof(M)", "Computes the cofactor matrix of a square matrix"],
              ["Condition number", "cond(M)", "Returns the condition number (ratio of largest to smallest singular value)"],
              ["Characteristic polynomial", "charpoly(M)", "Returns the coefficients of the characteristic polynomial"],
              ["Spectral radius", "spectralradius(M)  or  sr(M)", "Returns the largest absolute eigenvalue"],
              ["Kronecker product", "kron(A, B)", "Computes the Kronecker (tensor) product of two matrices"],
              ["Hadamard product", "hadamard(A, B)", "Computes the element-wise product of two same-sized matrices"],
              ["Commutator", "comm(A, B)", "Computes AB − BA"],
              ["Symmetric part", "sym(M)", "Computes (M + Mᵀ) / 2"],
              ["Antisymmetric part", "antisym(M)", "Computes (M − Mᵀ) / 2"],
              ["Vectorization", "vec(M)", "Stacks columns of a matrix into a single column vector"],
              ["Projection matrix", "proj(M)", "Computes the projection matrix M(MᵀM)⁻¹Mᵀ"],
              ["Row sums", "rowsum(M)", "Returns a column vector of each row's sum"],
              ["Column sums", "colsum(M)", "Returns a row vector of each column's sum"],
              ["Row products", "rowprod(M)", "Returns a column vector of each row's product"],
              ["Column products", "colprod(M)", "Returns a row vector of each column's product"],
            ]}
          />
        </Section>

        <Section title="Matrix Functions (extended to matrices)">
          <p className="text-sm text-muted-foreground mb-3">
            These standard scalar functions can also accept a square matrix as input.
            When applied to a matrix, they operate via eigendecomposition: M = PDP⁻¹ → f(M) = P·f(D)·P⁻¹.
          </p>
          <DocTable
            headers={["Function", "How to type it", "Description"]}
            rows={[
              ["Matrix sine", "sin(M)", "Computes the matrix sine via eigendecomposition"],
              ["Matrix cosine", "cos(M)", "Computes the matrix cosine via eigendecomposition"],
              ["Matrix tangent", "tan(M)", "Computes the matrix tangent via eigendecomposition"],
              ["Matrix exponential", "exp(M)  or  expm(M)", "Computes eᴹ. exp() uses Padé approximation for matrices"],
              ["Matrix logarithm", "log(M)", "Computes the matrix natural logarithm via eigendecomposition"],
              ["Matrix square root", "sqrt(M)", "Computes M^(1/2) via eigendecomposition"],
              ["Matrix nth root", "nthRoot(M, n)", "Computes M^(1/n) via eigendecomposition"],
              ["Matrix sinh", "sinh(M)", "Computes the matrix hyperbolic sine"],
              ["Matrix cosh", "cosh(M)", "Computes the matrix hyperbolic cosine"],
              ["Matrix tanh", "tanh(M)", "Computes the matrix hyperbolic tangent"],
              ["Scalar^Matrix", "2^M", "Computes scalar raised to a matrix power via eigendecomposition"],
              ["Matrix^Matrix", "A^B", "Computes A^B = exp(B · log(A)). Both must be square and same size; A must be invertible (no zero eigenvalues)"],
            ]}
          />
        </Section>

        <div className="text-xs text-muted-foreground mt-12 mb-8 border-t border-border pt-4">
          Function names auto-format to upright as soon as the full name is typed (e.g., sin, tr, proj). Press Backspace once to unformat and continue editing letter-by-letter.
          All trigonometric functions expect radians. Results are cleaned to remove floating-point noise (values within 10⁻¹⁰ of an integer are rounded).
        </div>
      </main>
    </div>
  );
};

export default Documentation;
