import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import ExpressionLine from "@/components/ExpressionLine";
import SettingsMenu from "@/components/SettingsMenu";
import WelcomeOverlay from "@/components/WelcomeOverlay";
import QuickGuide from "@/components/QuickGuide";
import { evaluateExpressions, formatResult } from "@/lib/mathEngine";
import { useMathLiveReady } from "@/hooks/useMathLiveReady";

interface Expression {
  id: string;
  latex: string;
}

let nextId = 1;
const makeId = () => `expr-${nextId++}`;

const Index = () => {
  const mathReady = useMathLiveReady();
  const [expressions, setExpressions] = useState<Expression[]>([
    { id: makeId(), latex: "" },
  ]);
  const [focusedId, setFocusedId] = useState<string | null>(expressions[0].id);
  const [results, setResults] = useState<
    Map<string, { value: any; error?: string }>
  >(new Map());
  const [darkMode, setDarkMode] = useState(false);
  const [bracketStyle, setBracketStyle] = useState<"b" | "p">("b");
  const [showGuide, setShowGuide] = useState(false);

  //Apply dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  //Re-evaluate after a short pause when input changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const r = evaluateExpressions(
        expressions.map((e) => ({ id: e.id, latex: e.latex }))
      );
      setResults(r);
    }, 150);
    return () => clearTimeout(timer);
  }, [expressions]);

  const handleChange = useCallback((id: string, latex: string) => {
    setExpressions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, latex } : e))
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setExpressions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const handleEnter = useCallback((id: string) => {
    const newId = makeId();
    setExpressions((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, { id: newId, latex: "" });
      return next;
    });
    setTimeout(() => setFocusedId(newId), 50);
  }, []);

  const addLine = () => {
    const newId = makeId();
    setExpressions((prev) => [...prev, { id: newId, latex: "" }]);
    setTimeout(() => setFocusedId(newId), 50);
  };

  //Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setExpressions((prev) => {
      const oldIdx = prev.findIndex((x) => x.id === active.id);
      const newIdx = prev.findIndex((x) => x.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WelcomeOverlay onStartGuide={() => setShowGuide(true)} />
      {showGuide && <QuickGuide onClose={() => setShowGuide(false)} />}

      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">
            Matrix Calculator
          </h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
          Desmos style typing - Type matrix for a matrix - Press Enter for new line
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            onClick={() => setShowGuide(true)}
            className="hover:text-foreground transition-colors"
          >
            How to Use
          </button>
          <Link
            to="/docs"
            className="hover:text-foreground transition-colors"
          >
            Documentation
          </Link>
          <SettingsMenu
            darkMode={darkMode}
            onDarkModeChange={setDarkMode}
            bracketStyle={bracketStyle}
            onBracketStyleChange={setBracketStyle}
          />
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto">
        <div className="border-x border-border min-h-full">
          {!mathReady ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading calculator…
            </div>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={expressions.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {expressions.map((expr, i) => {
                    const res = results.get(expr.id);
                    const resultLatex =
                      res?.value !== undefined
                        ? formatResult(res.value, bracketStyle)
                        : undefined;

                    return (
                      <ExpressionLine
                        key={expr.id}
                        id={expr.id}
                        latex={expr.latex}
                        index={i}
                        resultLatex={resultLatex}
                        error={res?.error}
                        onChange={handleChange}
                        onDelete={handleDelete}
                        onEnter={handleEnter}
                        focused={focusedId === expr.id}
                        onFocus={setFocusedId}
                        bracketStyle={bracketStyle}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>

              <button
                onClick={addLine}
                className="w-full py-3 text-sm text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors border-b border-border"
              >
                + Add expression
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
