import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/terravest-theme.css"; // Import the new theme
import { applyTheme, getTheme } from "./theme";

// Apply the saved theme (light/dark/glass) before first paint.
applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
