import { useState } from "react";

const STEPS = [
  {
    title: "Typing Math",
    body: "Type math naturally. For example, type sqrt and it automatically becomes a square root symbol. Type / to create a fraction. Type pi, tau, or phi for Greek constants.",
  },
  {
    title: "Multiple Lines",
    body: "Press Enter to add a new line. Each line is evaluated in order. You can reference results from earlier lines.",
  },
  {
    title: "Variables",
    body: "Assign variables by typing something like A = 5 on one line, then use A on any later line.",
  },
  {
    title: "Inserting a Matrix (typing)",
    body: "To insert a matrix, type matrix and it will automatically be replaced with an editable 2×2 matrix.",
  },
  {
    title: "Inserting a Matrix (right-click)",
    body: "You can also right-click anywhere in an expression field to open the insert menu, where you can insert a matrix, sum, integral, and more. Once you have a matrix, right-clicking while your cursor is inside it gives you additional options to add or remove rows and columns.",
  },
  {
    title: "That's It!",
    body: "That covers the basics. For a full list of supported functions, constants, and syntax, visit the Documentation page linked in the top bar. You can also run this guide again any time by clicking How to Use in the top bar.",
  },
];

interface QuickGuideProps {
  onClose: () => void;
}

const QuickGuide = ({ onClose }: QuickGuideProps) => {
  const [step, setStep] = useState(0);

  const next = () => {
    if (step === STEPS.length - 1) {
      onClose();
      return;
    }
    setStep(step + 1);
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Skip guide"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="text-xs text-muted-foreground mb-1">
          Step {step + 1} of {STEPS.length}
        </div>
        <h3 className="text-base font-semibold text-foreground mb-3">{current.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{current.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? "bg-primary" : "bg-secondary"
                }`}
              />
            ))}
          </div>
          <button
            onClick={next}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {step < STEPS.length - 1 ? "Next" : "Get Started"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickGuide;
