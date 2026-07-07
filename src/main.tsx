import { createRoot } from "react-dom/client";
import { MathfieldElement } from "mathlive";
import "mathlive"; //registers the <math-field> custom element
import App from "./App.tsx";
import "./index.css";

//Configure MathLive font directory before any math-field renders
//The @font-face declarations themselves are loaded through mathlive-fonts.css in index.html
MathfieldElement.fontsDirectory = `${import.meta.env.BASE_URL}fonts/`;

createRoot(document.getElementById("root")!).render(<App />);
