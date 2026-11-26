import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { AacApp } from "./AacApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AacApp />
  </StrictMode>
);
