import { useState, useEffect } from "react";

//Single source of truth for MathLive readiness. Resolves true once the
//<math-field> custom element is defined, document.fonts.ready has resolved,
//and the KaTeX families used for bracket sizing have actually loaded.
//Gate calculator content on this so the first <math-field> mounts after
//fonts are guaranteed available — otherwise matrix brackets miss-measure.
export function useMathLiveReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await customElements.whenDefined("math-field");
      await document.fonts.ready;
      await Promise.allSettled([
        document.fonts.load("1em KaTeX_Main"),
        document.fonts.load("1em KaTeX_Math"),
        document.fonts.load("1em KaTeX_Size1"),
        document.fonts.load("1em KaTeX_Size2"),
        document.fonts.load("1em KaTeX_Size3"),
        document.fonts.load("1em KaTeX_Size4"),
      ]);

      if (cancelled) return;
      //MathLive may have added this class prematurely before fonts resolved
      document.body.classList.remove("ML__fonts-did-not-load");
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
