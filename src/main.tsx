import { Buffer } from 'buffer';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// Polyfill Buffer for browser environment (required for Solana libraries)
window.Buffer = Buffer;

createRoot(document.getElementById("root")!).render(<App />);
