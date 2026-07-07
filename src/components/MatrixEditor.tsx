import { useState, useRef, useEffect, useCallback } from "react";

interface MatrixEditorProps {
  onInsert: (latex: string) => void;
  onCancel: () => void;
}

const MatrixEditor = ({ onInsert, onCancel }: MatrixEditorProps) => {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [cells, setCells] = useState<string[][]>(() =>
    Array.from({ length: 2 }, () => Array(2).fill(""))
  );
  const cellRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cellRefs.current[0]?.[0]?.focus();
  }, []);

  //Dismiss when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const resizeCells = useCallback((newRows: number, newCols: number) => {
    setCells((prev) => {
      const next: string[][] = [];
      for (let r = 0; r < newRows; r++) {
        const row: string[] = [];
        for (let c = 0; c < newCols; c++) {
          row.push(prev[r]?.[c] ?? "");
        }
        next.push(row);
      }
      return next;
    });
    setRows(newRows);
    setCols(newCols);
  }, []);

  const updateCell = (r: number, c: number, val: string) => {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = val;
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const nextC = c + 1;
      if (nextC < cols) {
        cellRefs.current[r]?.[nextC]?.focus();
      } else if (r + 1 < rows) {
        cellRefs.current[r + 1]?.[0]?.focus();
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      const prevC = c - 1;
      if (prevC >= 0) {
        cellRefs.current[r]?.[prevC]?.focus();
      } else if (r - 1 >= 0) {
        cellRefs.current[r - 1]?.[cols - 1]?.focus();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleInsert();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInsert = () => {
    const rowStrs = cells.map((row) =>
      row.map((cell) => cell.trim() || "0").join(" & ")
    );
    const latex = `\\begin{bmatrix} ${rowStrs.join(" \\\\ ")} \\end{bmatrix}`;
    onInsert(latex);
  };

  return (
    <div
      ref={containerRef}
      className="inline-flex flex-col items-center gap-2 p-3 bg-card border border-border rounded-lg shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0">
        <div
          className="border-l-2 border-t-2 border-b-2 border-foreground rounded-l-sm"
          style={{ width: 6, alignSelf: "stretch" }}
        />
        <div
          className="grid gap-1 p-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(36px, auto))` }}
        >
          {cells.map((row, r) =>
            row.map((cell, c) => (
              <input
                key={`${r}-${c}`}
                ref={(el) => {
                  if (!cellRefs.current[r]) cellRefs.current[r] = [];
                  cellRefs.current[r][c] = el;
                }}
                type="text"
                value={cell}
                onChange={(e) => updateCell(r, c, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
                className="w-10 h-7 text-center text-sm bg-secondary/50 border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="0"
              />
            ))
          )}
        </div>
        <div
          className="border-r-2 border-t-2 border-b-2 border-foreground rounded-r-sm"
          style={{ width: 6, alignSelf: "stretch" }}
        />
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Rows</span>
          <button
            onClick={() => rows > 1 && resizeCells(rows - 1, cols)}
            className="w-5 h-5 rounded bg-secondary text-foreground hover:bg-accent flex items-center justify-center"
          >−</button>
          <span className="w-4 text-center text-foreground">{rows}</span>
          <button
            onClick={() => rows < 6 && resizeCells(rows + 1, cols)}
            className="w-5 h-5 rounded bg-secondary text-foreground hover:bg-accent flex items-center justify-center"
          >+</button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Cols</span>
          <button
            onClick={() => cols > 1 && resizeCells(rows, cols - 1)}
            className="w-5 h-5 rounded bg-secondary text-foreground hover:bg-accent flex items-center justify-center"
          >−</button>
          <span className="w-4 text-center text-foreground">{cols}</span>
          <button
            onClick={() => cols < 6 && resizeCells(rows, cols + 1)}
            className="w-5 h-5 rounded bg-secondary text-foreground hover:bg-accent flex items-center justify-center"
          >+</button>
        </div>
      </div>

      <button
        onClick={handleInsert}
        className="w-full py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
      >
        Insert (Enter)
      </button>
    </div>
  );
};

export default MatrixEditor;
