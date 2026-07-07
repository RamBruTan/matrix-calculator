import { useState, useRef, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import type { BracketStyle } from "@/components/ExpressionLine";

interface SettingsMenuProps {
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
  bracketStyle: BracketStyle;
  onBracketStyleChange: (value: BracketStyle) => void;
}

const BRACKET_OPTIONS: { value: BracketStyle; label: string; preview: string }[] = [
  { value: "b", label: "Square brackets", preview: "[ ]" },
  { value: "p", label: "Parentheses", preview: "( )" },
];

const SettingsMenu = ({ darkMode, onDarkModeChange, bracketStyle, onBracketStyleChange }: SettingsMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  //Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        title="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-lg shadow-lg p-4 min-w-[220px]">
          <div className="text-sm font-medium text-foreground mb-3">Settings</div>

          <div className="flex items-center justify-between mb-4">
            <label className="text-sm text-muted-foreground">Dark mode</label>
            <Switch checked={darkMode} onCheckedChange={onDarkModeChange} />
          </div>

          <div className="border-t border-border pt-3">
            <div className="text-xs text-muted-foreground mb-2">Matrix brackets</div>
            <div className="flex flex-col gap-1.5">
              {BRACKET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onBracketStyleChange(opt.value)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-sm transition-colors ${
                    bracketStyle === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className="font-mono text-xs opacity-70">{opt.preview}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsMenu;
