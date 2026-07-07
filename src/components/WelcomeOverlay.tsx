import { useState, useEffect } from "react";

const STORAGE_KEY = "matrix-calc-visited";

interface WelcomeOverlayProps {
  onStartGuide: () => void;
}

const WelcomeOverlay = ({ onStartGuide }: WelcomeOverlayProps) => {
  const [visible, setVisible] = useState(false);

  //Show on first visit
  useEffect(() => {
    const visited = localStorage.getItem(STORAGE_KEY);
    if (!visited) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  const startGuide = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
    onStartGuide();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">Welcome to Matrix Calculator</h2>
        <p className="text-sm text-muted-foreground mb-6">
          A powerful calculator for matrices, linear algebra, and general math — type naturally and see results instantly.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={startGuide}
            className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            How to Use
          </button>
          <button
            onClick={dismiss}
            className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            Go to Calculator
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
