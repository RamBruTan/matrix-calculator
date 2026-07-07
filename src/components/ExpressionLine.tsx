import { useEffect, useRef, useCallback, memo } from "react";
import { convertLatexToMarkup } from "mathlive";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { value?: string },
        HTMLElement
      >;
    }
  }
}

export type BracketStyle = "b" | "p";

//Swap internal matrix env for the bracketed variant
function toDisplayEnv(latex: string, style: BracketStyle): string {
  return latex
    .replace(/\\begin\{matrix\}/g, `\\begin{${style}matrix}`)
    .replace(/\\end\{matrix\}/g, `\\end{${style}matrix}`);
}

//Normalize any bracketed variant back to plain matrix for storage
function toStorageEnv(latex: string): string {
  return latex
    .replace(/\\begin\{[bBpP]matrix\}/g, "\\begin{matrix}")
    .replace(/\\end\{[bBpP]matrix\}/g, "\\end{matrix}");
}

interface ExpressionLineProps {
  id: string;
  latex: string;
  index: number;
  resultLatex?: string;
  error?: string;
  onChange: (id: string, latex: string) => void;
  onDelete: (id: string) => void;
  onEnter: (id: string) => void;
  focused: boolean;
  onFocus: (id: string) => void;
  bracketStyle: BracketStyle;
}

const SHADOW_STYLE = `
  .ML__latex, .ML__latex .ML__mathfield {
    overflow: visible !important;
  }
  .ML__delim--ext, .ML__delim--top, .ML__delim--bot, .ML__delim {
    overflow: visible !important;
  }
  .ML__sqrt-index {
    padding-right: 3px;
    position: relative;
    top: -0.15em;
  }
  .ML__sqrt {
    overflow: visible !important;
  }
`;

//Push style overrides into the math-field shadow root, once per element
function injectShadowStyles(mf: any): void {
  if (!mf?.shadowRoot) return;
  if (mf.shadowRoot.querySelector("#ml-custom-styles")) return;
  const style = document.createElement("style");
  style.id = "ml-custom-styles";
  style.textContent = SHADOW_STYLE;
  mf.shadowRoot.appendChild(style);
}

//Render a result with a real math-field so styling matches the input
const StaticMath = memo(({ latex }: { latex: string }) => {
  const ref = useRef<any>(null);

  useEffect(() => {
    const mf = ref.current;
    if (!mf) return;
    injectShadowStyles(mf);
    mf.readOnly = true;
    mf.removeExtraneousParentheses = false;
    mf.smartSuperscript = false;
    mf.setValue("\\displaystyle " + latex);
  }, [latex]);

  return (
    <math-field
      ref={ref}
      style={{
        fontSize: "0.95rem",
        pointerEvents: "none",
        border: "none",
        outline: "none",
        background: "transparent",
        display: "inline-block",
      }}
    />
  );
});
StaticMath.displayName = "StaticMath";

//Menu entries that don't apply here
const HIDDEN_MENU_IDS = new Set([
  "mode", "variant", "color", "background-color", "accent", "decoration",
  "ce-evaluate", "ce-simplify", "ce-solve",
  "borders",
]);

//Swap icons and inserted latex for the insert submenu
const INSERT_ID_OVERRIDES: Record<string, { displayLatex?: string; insertLatex: string }> = {
  "insert-derivative": {
    displayLatex: "\\frac{d}{dx}f(x)",
    insertLatex: "\\frac{d}{dx}\\left(\\placeholder{}\\right)",
  },
  "insert-nth-derivative": {
    displayLatex: "\\frac{d^n}{dx^n}f(x)",
    insertLatex: "\\frac{d^n}{dx^n}\\left(\\placeholder{}\\right)",
  },
  "insert-integral": {
    insertLatex: "\\int_{\\placeholder{}}^{\\placeholder{}}\\placeholder{}\\,dx",
  },
  "insert-sum": {
    insertLatex: "\\sum_{n=\\placeholder{}}^{\\placeholder{}}\\placeholder{}",
  },
  "insert-product": {
    insertLatex: "\\prod_{n=\\placeholder{}}^{\\placeholder{}}\\placeholder{}",
  },
};

//Walk the menu tree and apply overrides by id
function patchMenuItems(items: any[], mf: any): any[] {
  return items.map((item: any) => {
    if (item.submenu) {
      return { ...item, submenu: patchMenuItems(item.submenu, mf) };
    }
    const override = INSERT_ID_OVERRIDES[item.id];
    if (!override) return item;
    const patched: any = { ...item };
    if (override.displayLatex) {
      const markup = convertLatexToMarkup(override.displayLatex);
      patched.label = () => `<span class='ML__insert-template'>${markup}</span>`;
    }
    patched.onMenuSelect = () => {
      mf.insert(override.insertLatex, { selectionMode: "after" });
    };
    return patched;
  });
}

//Hide unused items, apply insert overrides, route matrix inserts through the active bracket style
function configureMenuItems(mf: any, style: BracketStyle) {
  const env = `${style}matrix`;

  const items = mf.menuItems.filter((item: any) => {
    if (item.type === "divider") return true;
    return !HIDDEN_MENU_IDS.has(item.id);
  });

  const patched = patchMenuItems(items, mf);

  const configured = patched.map((item: any) => {
    if (item.id === "insert-matrix" && item.submenu) {
      return {
        ...item,
        submenu: item.submenu.map((sub: any) => ({
          ...sub,
          onMenuSelect: () => {
            const { row, col } = sub.data;
            const cells = Array(row).fill(null).map(() =>
              Array(col).fill("0").join("&")
            ).join("\\\\");
            mf.insert(`\\begin{${env}}${cells}\\end{${env}}`, { selectionMode: "after" });
          },
        })),
      };
    }
    return item;
  });

  //Drop leading, trailing and duplicate dividers
  mf.menuItems = configured.filter((item: any, i: number, arr: any[]) => {
    if (item.type !== "divider") return true;
    if (i === 0 || i === arr.length - 1) return false;
    return arr[i - 1]?.type !== "divider";
  });
}

//Logic shortcuts collide with function names
const LOGIC_SHORTCUTS_TO_REMOVE = [
  "or", "Or", "OR",
  "and", "And", "AND",
  "not", "Not", "NOT",
  "xor", "XOR",
  "nor", "NOR",
  "nand", "NAND",
  "vee", "wedge",
  "lnot", "lor", "land",
  "implies", "iff",
  "forall", "exists",
  "in", "inn", "notin",
  "sub", "subset", "superset", "sup",
  "sube", "supe",
  "cup", "cap",
  "empty", "emptyset",
  "union", "intersection",
  "setminus",
];

//Strip built-in function shortcuts since we de-italicize on ( ourselves
const BUILTIN_FUNC_SHORTCUTS_TO_REMOVE = [
  "sin", "cos", "tan", "sec", "csc", "cot",
  "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh",
  "log", "ln", "exp", "lim",
  "det", "mod", "max", "min", "gcd",
  "deg", "dim", "hom", "lg", "Pr", "arg",
  "inf", "sup",
];

//Greek single-atom commands that allow trailing-letter reformat,
//so pin -> backspace -> pi -> \pi works the same way function names do
const GREEK_TO_LATEX: Record<string, string> = {
  pi: "\\pi",
  nu: "\\nu",
};

const FUNC_TO_LATEX: Record<string, string> = {
  spectralradius: "\\operatorname{spectralradius}",
  eigenvector: "\\operatorname{eigenvector}",
  eigenvalue: "\\operatorname{eigenvalue}",
  nullspace: "\\operatorname{nullspace}",
  colspace: "\\operatorname{colspace}",
  cofactor: "\\operatorname{cofactor}",
  adjugate: "\\operatorname{adjugate}",
  hadamard: "\\operatorname{hadamard}",
  charpoly: "\\operatorname{charpoly}",
  antisym: "\\operatorname{antisym}",
  arcsinh: "\\operatorname{arcsinh}",
  arccosh: "\\operatorname{arccosh}",
  arctanh: "\\operatorname{arctanh}",
  colprod: "\\operatorname{colprod}",
  rowprod: "\\operatorname{rowprod}",
  colsum: "\\operatorname{colsum}",
  rowsum: "\\operatorname{rowsum}",
  arcsin: "\\arcsin",
  arccos: "\\arccos",
  arctan: "\\arctan",
  trace: "\\operatorname{trace}",
  cross: "\\operatorname{cross}",
  image: "\\operatorname{image}",
  schur: "\\operatorname{schur}",
  norm: "\\operatorname{norm}",
  cond: "\\operatorname{cond}",
  diag: "\\operatorname{diag}",
  kron: "\\operatorname{kron}",
  comm: "\\operatorname{comm}",
  proj: "\\operatorname{proj}",
  pinv: "\\operatorname{pinv}",
  rref: "\\operatorname{rref}",
  rank: "\\operatorname{rank}",
  sinh: "\\sinh",
  cosh: "\\cosh",
  tanh: "\\tanh",
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  sec: "\\sec",
  csc: "\\csc",
  cot: "\\cot",
  log: "\\log",
  exp: "\\exp",
  det: "\\det",
  min: "\\min",
  max: "\\max",
  gcd: "\\gcd",
  arg: "\\arg",
  dim: "\\dim",
  deg: "\\deg",
  lim: "\\lim",
  sign: "\\operatorname{sign}",
  sym: "\\operatorname{sym}",
  vec: "\\operatorname{vec}",
  adj: "\\operatorname{adj}",
  cof: "\\operatorname{cof}",
  col: "\\operatorname{col}",
  ref: "\\operatorname{ref}",
  dot: "\\operatorname{dot}",
  sgn: "\\operatorname{sgn}",
  erf: "\\operatorname{erf}",
  ker: "\\operatorname{ker}",
  svd: "\\operatorname{svd}",
  rk: "\\operatorname{rk}",
  tr: "\\operatorname{tr}",
  lu: "\\operatorname{lu}",
  qr: "\\operatorname{qr}",
  sr: "\\operatorname{sr}",
  ln: "\\ln",
};

//Reverse lookup: serialized atom latex -> function name
const LATEX_TO_FUNC: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [name, lx] of Object.entries(FUNC_TO_LATEX)) m[lx] = name;
  return m;
})();

//Fires only when the full keyword sits at a non-letter boundary, so rowsum
//never expands the inner sum and partial input like nth never previews nthroot
const STRUCTURAL_EXPANSIONS: Record<string, string> = {
  matrix:  "\\begin{bmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{bmatrix}",
  nthroot: "\\sqrt[\\placeholder{}]{\\placeholder{}}",
  floor:   "\\lfloor\\placeholder{}\\rfloor",
  ceil:    "\\lceil\\placeholder{}\\rceil",
  sum:     "\\sum_{n=\\placeholder{}}^{\\placeholder{}}\\left(\\placeholder{}\\right)",
  prod:    "\\prod_{n=\\placeholder{}}^{\\placeholder{}}\\left(\\placeholder{}\\right)",
  int:     "\\int_{\\placeholder{}}^{\\placeholder{}}\\left(\\placeholder{}\\right)\\mathrm{d}x",
  conj:    "\\overline{\\placeholder{}}",
  real:    "\\Re\\left(\\placeholder{}\\right)",
  imag:    "\\Im\\left(\\placeholder{}\\right)",
  tau:     "\\tau ",
  phi:     "\\phi ",
};
const STRUCTURAL_KEYS = Object.keys(STRUCTURAL_EXPANSIONS).sort((a, b) => b.length - a.length);

//Check for a trailing structural keyword in the caret prefix
function matchStructuralExpansion(prefix: string): { trimmed: string; template: string } | null {
  for (const key of STRUCTURAL_KEYS) {
    if (!prefix.endsWith(key)) continue;
    const before = prefix[prefix.length - key.length - 1];
    if (before && /[a-zA-Z\\{]/.test(before)) continue;
    return { trimmed: prefix.slice(0, prefix.length - key.length), template: STRUCTURAL_EXPANSIONS[key] };
  }
  return null;
}

//Commands kept intact when normalizing pasted latex; everything else loses its backslash
const KNOWN_LATEX_COMMANDS = new Set<string>([
  ...Object.keys(FUNC_TO_LATEX),
  "frac", "sqrt", "sum", "prod", "int", "left", "right", "begin", "end",
  "displaystyle", "operatorname", "pi", "tau", "theta", "phi", "alpha",
  "beta", "gamma", "delta", "epsilon", "lambda", "mu", "sigma", "omega",
  "Pi", "Theta", "Phi", "Sigma", "Omega", "Delta", "Gamma", "Lambda",
  "cdot", "times", "div", "pm", "mp", "Re", "Im", "lfloor", "rfloor",
  "lceil", "rceil", "overline", "mathrm", "mathbf", "mathit", "mathbb",
  "placeholder", "infty", "partial", "nabla", "to", "rightarrow",
  "leftarrow", "neq", "leq", "geq", "approx", "equiv", "sim", "propto",
  "in", "notin", "subset", "supset", "cup", "cap", "emptyset", "forall",
  "exists", "land", "lor", "neg", "implies", "iff", "text",
  "backslash", "ldots", "cdots", "vdots", "ddots",
]);

//Drop the leading backslash off any unknown command in pasted text
function normalizePastedLatex(text: string): string {
  return text.replace(/\\([a-zA-Z]+)/g, (match, name) =>
    KNOWN_LATEX_COMMANDS.has(name) ? match : name
  );
}

//Pick out the trailing function-name region at the caret: either a recognized
//command atom with optional trailing italic letters, or a bare letter run
//preceded by a non-letter boundary
function parseFunctionBuffer(
  prefix: string
): { name: string; atomCount: number; hasCommand: boolean } | null {
  const cmdMatch = prefix.match(
    /(\\operatorname\{([a-zA-Z]+)\}|\\([a-zA-Z]+))([a-z]*)$/
  );
  if (cmdMatch) {
    const opName = cmdMatch[2];
    const slashName = cmdMatch[3];
    const trailing = cmdMatch[4] || "";
    const cmd = opName ? `\\operatorname{${opName}}` : `\\${slashName}`;
    const funcName = LATEX_TO_FUNC[cmd];
    if (funcName) {
      return {
        name: funcName + trailing,
        atomCount: 1 + trailing.length,
        hasCommand: true,
      };
    }
  }
  const letterMatch = prefix.match(/(?:^|[^a-zA-Z\\{}])([a-z]+)$/);
  if (letterMatch) {
    const letters = letterMatch[1];
    return { name: letters, atomCount: letters.length, hasCommand: false };
  }
  return null;
}

//Delete count atoms before the caret, then insert replacement
function replaceAtomsBeforeCaret(mf: any, count: number, replacement: string) {
  for (let i = 0; i < count; i++) {
    mf.executeCommand("deleteBackward");
  }
  if (replacement) {
    mf.insert(replacement, { selectionMode: "after", format: "latex" });
  }
}

const ExpressionLine = memo(({
  id, latex, index, resultLatex, error,
  onChange, onDelete, onEnter, focused, onFocus, bracketStyle,
}: ExpressionLineProps) => {
  const mfRef = useRef<any>(null);
  const userEditRef = useRef(false);
  const isFormattingRef = useRef(false);
  const justUnformattedRef = useRef(false);

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;

    injectShadowStyles(mf);
    mf.smartSuperscript = false;

    //Wipe conflicting shortcuts and the structural template names so partial
    //input never previews the full template
    const shortcuts = { ...(mf.inlineShortcuts ?? {}) };
    [
      ...LOGIC_SHORTCUTS_TO_REMOVE,
      ...BUILTIN_FUNC_SHORTCUTS_TO_REMOVE,
      ...Object.keys(STRUCTURAL_EXPANSIONS),
      "ee", "EE", "th",
    ].forEach((key) => {
      shortcuts[key] = null;
    });
    mf.inlineShortcuts = shortcuts;

    configureMenuItems(mf, bracketStyle);

    //Fonts are ready before mount so brackets size correctly on first paint
    const displayLatex = toDisplayEnv(latex, bracketStyle);
    mf.setValue("\\displaystyle " + displayLatex, { selectionMode: "after" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;

    //Latex from offset 0 to the caret with the displaystyle prefix removed
    const getCaretPrefix = (): string => {
      try {
        const sel = mf.selection;
        const end = sel?.ranges?.[0]?.[1] ?? mf.position;
        return (mf.getValue(0, end, "latex") as string).replace(
          /^\\displaystyle\s*/,
          ""
        );
      } catch {
        return "";
      }
    };

    //Look at the single atom left of the caret and return its function name
    //if it's a recognized command. MathLive may append whitespace or {} after
    //a command, so checking the last atom is more reliable than a prefix regex
    const getTrailingCommandName = (): string | null => {
      try {
        const sel = mf.selection;
        const end = sel?.ranges?.[0]?.[1] ?? mf.position;
        if (typeof end !== "number" || end <= 0) return null;
        const atom = (mf.getValue(end - 1, end, "latex") as string).trim();
        const m = atom.match(
          /^(\\operatorname\{([a-zA-Z]+)\}|\\([a-zA-Z]+))(?:\s|\{\})*$/
        );
        if (!m) return null;
        const cmd = m[2] ? `\\operatorname{${m[2]}}` : `\\${m[3]}`;
        return LATEX_TO_FUNC[cmd] ?? null;
      } catch {
        return null;
      }
    };

    //Promote a recognized name to its command, or revert a recognized command
    //followed by stray letters back to plain italics. returns true on change
    const applyFormatting = (): boolean => {
      const prefix = getCaretPrefix();
      const buf = parseFunctionBuffer(prefix);
      if (!buf) return false;

      const target = FUNC_TO_LATEX[buf.name];
      if (target) {
        if (buf.hasCommand && buf.atomCount === 1) return false;
        isFormattingRef.current = true;
        replaceAtomsBeforeCaret(mf, buf.atomCount, target);
        return true;
      }
      const greek = GREEK_TO_LATEX[buf.name];
      if (greek && !buf.hasCommand) {
        isFormattingRef.current = true;
        replaceAtomsBeforeCaret(mf, buf.atomCount, greek);
        return true;
      }
      if (buf.hasCommand) {
        //\cos + b -> revert to plain cosb
        isFormattingRef.current = true;
        replaceAtomsBeforeCaret(mf, buf.atomCount, buf.name);
        return true;
      }
      return false;
    };

    const handleInput = () => {
      if (isFormattingRef.current) {
        isFormattingRef.current = false;
        const currentValue = mf.value as string;
        const raw = toStorageEnv(currentValue.replace(/^\\displaystyle\s*/, ""));
        userEditRef.current = true;
        onChange(id, raw);
        return;
      }

      const fullLatex = mf.value as string;
      const prefix = getCaretPrefix();

      //Structural expansion first (matrix, nthroot, sum, ...)
      const struct = matchStructuralExpansion(prefix);
      if (struct) {
        const wordLen = prefix.length - struct.trimmed.length;
        try {
          const caretPos = mf.position;
          mf.selection = { ranges: [[caretPos - wordLen, caretPos]], direction: "forward" };
          isFormattingRef.current = true;
          mf.insert(struct.template, { selectionMode: "placeholder" });
        } catch {}
        return;
      }

      //Skip reformatting immediately after a backspace-unformat
      if (!justUnformattedRef.current && applyFormatting()) return;
      justUnformattedRef.current = false;

      const raw = toStorageEnv(fullLatex.replace(/^\\displaystyle\s*/, ""));
      userEditRef.current = true;
      onChange(id, raw);
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onEnter(id);
        return;
      }

      //Lowercase letter after a recognized command atom: MathLive would render
      //it as a separate atom with visible space. pop the command, append the
      //letter, re-insert as the longer command or as plain letters
      if (
        e.key.length === 1 &&
        /^[a-z]$/.test(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        try {
          if (!mf.selectionIsCollapsed) return;
          const baseName = getTrailingCommandName();
          if (baseName) {
            e.preventDefault();
            const newWord = baseName + e.key;
            const replacement = FUNC_TO_LATEX[newWord] ?? newWord;
            isFormattingRef.current = true;
            replaceAtomsBeforeCaret(mf, 1, replacement);
            return;
          }

          //Greek revert: \pi + n -> pin, \nu + l -> nul so typing can reach
          //pinv / nullspace
          const sel = mf.selection;
          const end = sel?.ranges?.[0]?.[1] ?? mf.position;
          if (typeof end === "number" && end > 0) {
            const atom = (mf.getValue(end - 1, end, "latex") as string).trim();
            const gm = atom.match(/^\\(pi|nu)(?:\s|\{\})*$/);
            if (gm) {
              const greek = gm[1];
              if ((greek === "pi" && e.key === "n") || (greek === "nu" && e.key === "l")) {
                e.preventDefault();
                isFormattingRef.current = true;
                replaceAtomsBeforeCaret(mf, 1, greek + e.key);
                return;
              }
            }
          }
        } catch {}
        return;
      }

      //Intercept ( so the trailing buffer gets formatted before parens go in
      if (e.key === "(" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        try {
          if (!mf.selectionIsCollapsed) return;
          const prefix = getCaretPrefix();
          const buf = parseFunctionBuffer(prefix);
          if (buf && FUNC_TO_LATEX[buf.name]) {
            if (!(buf.hasCommand && buf.atomCount === 1)) {
              e.preventDefault();
              isFormattingRef.current = true;
              replaceAtomsBeforeCaret(
                mf,
                buf.atomCount,
                FUNC_TO_LATEX[buf.name] + "\\left(\\right)"
              );
              try {
                mf.position = Math.max(0, (mf.position as number) - 1);
              } catch {}
              return;
            }
            //Already the bare command -- let smart-fence build \cmd\left(\right) with caret between
          }
        } catch {}
      }

      //Backspace on a recognized command atom: swap the whole atom for
      //name.slice(0, -1) so \sin -> si rather than vanishing
      if (e.key === "Backspace") {
        try {
          if (justUnformattedRef.current) return;
          if (!mf.selectionIsCollapsed) return;

          const name = getTrailingCommandName();
          if (!name) return;

          e.preventDefault();
          isFormattingRef.current = true;
          justUnformattedRef.current = true;
          replaceAtomsBeforeCaret(mf, 1, name.slice(0, -1));
        } catch {}
      } else {
        justUnformattedRef.current = false;
      }
    };

    //Strip \displaystyle from clipboard data on copy/cut
    const handleCopy = (e: ClipboardEvent) => {
      try {
        const sel = mf.selection;
        if (!sel?.ranges?.length) return;
        const [start, end] = sel.ranges[0];
        if (start === end) return;
        const raw = mf.getValue(start, end, "latex") as string;
        const cleaned = toStorageEnv(raw.replace(/^\\displaystyle\s*/, ""));
        e.preventDefault();
        e.clipboardData?.setData("text/plain", cleaned);
      } catch {}
    };

    const handleCut = (e: ClipboardEvent) => {
      try {
        const sel = mf.selection;
        if (!sel?.ranges?.length) return;
        const [start, end] = sel.ranges[0];
        if (start === end) return;
        const raw = mf.getValue(start, end, "latex") as string;
        const cleaned = toStorageEnv(raw.replace(/^\\displaystyle\s*/, ""));
        e.preventDefault();
        e.clipboardData?.setData("text/plain", cleaned);
        mf.executeCommand("deleteBackward");
      } catch {}
    };

    //Clean up unknown command backslashes on paste
    const handlePaste = (e: ClipboardEvent) => {
      try {
        const text = e.clipboardData?.getData("text/plain");
        if (!text) return;
        const normalized = normalizePastedLatex(text);
        if (normalized === text) return;
        e.preventDefault();
        isFormattingRef.current = true;
        mf.insert(normalized, { selectionMode: "after", format: "latex" });
      } catch {}
    };

    mf.addEventListener("input", handleInput);
    mf.addEventListener("keydown", handleKeydown);
    mf.addEventListener("copy", handleCopy);
    mf.addEventListener("cut", handleCut);
    mf.addEventListener("paste", handlePaste);
    return () => {
      mf.removeEventListener("input", handleInput);
      mf.removeEventListener("keydown", handleKeydown);
      mf.removeEventListener("copy", handleCopy);
      mf.removeEventListener("cut", handleCut);
      mf.removeEventListener("paste", handlePaste);
    };
  }, [id, onChange, onEnter]);

  //Pull latex from parent, but skip when the change came from local typing
  useEffect(() => {
    if (userEditRef.current) {
      userEditRef.current = false;
      return;
    }
    const mf = mfRef.current;
    if (!mf) return;
    const displayLatex = toDisplayEnv(latex, bracketStyle);
    const targetValue = "\\displaystyle " + displayLatex;
    const currentRaw = toStorageEnv((mf.value as string).replace(/^\\displaystyle\s*/, ""));
    if (currentRaw !== latex) {
      mf.setValue(targetValue);
    }
  }, [latex, bracketStyle]);

  //Re-render and reconfigure the menu when bracket style flips
  const prevBracketRef = useRef(bracketStyle);
  useEffect(() => {
    if (prevBracketRef.current === bracketStyle) return;
    prevBracketRef.current = bracketStyle;
    const mf = mfRef.current;
    if (!mf) return;
    const raw = toStorageEnv((mf.value as string).replace(/^\\displaystyle\s*/, ""));
    const displayLatex = toDisplayEnv(raw, bracketStyle);
    mf.setValue("\\displaystyle " + displayLatex);
    configureMenuItems(mf, bracketStyle);
  }, [bracketStyle]);

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;
    if (focused) {
      mf.focus();
      return;
    }
    if (document.activeElement === mf) {
      mf.blur();
    }
  }, [focused]);

  //Drop stale caret when the preview window loses focus
  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;
    const handleWindowBlur = () => {
      try { mf.blur(); } catch {}
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, []);

  const insertMatrix = useCallback(() => {
    const mf = mfRef.current;
    if (!mf) return;
    const env = `${bracketStyle}matrix`;
    mf.insert(`\\begin{${env}}0&0\\\\0&0\\end{${env}}`, { selectionMode: "after" });
    mf.focus();
  }, [bracketStyle]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      className={`group flex items-stretch border-b border-border transition-colors ${
        focused ? "bg-accent/30" : "hover:bg-accent/10"
      } ${isDragging ? "shadow-lg bg-card" : ""}`}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("[data-drag-handle]")) return;
        onFocus(id);
        requestAnimationFrame(() => mfRef.current?.focus());
      }}
    >
      <div
        {...attributes}
        {...listeners}
        data-drag-handle
        className="w-10 flex-shrink-0 flex items-center justify-center text-xs text-muted-foreground border-r border-border select-none cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
      >
        {index + 1}
      </div>

      <div
        className="w-1 flex-shrink-0"
        style={{
          backgroundColor: error
            ? "hsl(var(--destructive))"
            : resultLatex
            ? "hsl(var(--primary))"
            : "transparent",
        }}
      />

      <div className="flex-1 min-w-0 py-1 px-3">
        <math-field
          ref={mfRef}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "1.1rem",
          }}
        />

        {error && (
          <div className="mt-1 text-xs text-destructive">{error}</div>
        )}
        {resultLatex && !error && (
          <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <span className="text-xs">=</span>
            <StaticMath latex={resultLatex} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); insertMatrix(); }}
          className="p-1 rounded text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Insert 2×2 zero matrix"
        >
          [ ]
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="p-1 rounded text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          title="Delete line"
        >
          ×
        </button>
      </div>
    </div>
  );
});

ExpressionLine.displayName = "ExpressionLine";
export default ExpressionLine;
