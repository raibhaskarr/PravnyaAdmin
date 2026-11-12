import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom doesn't implement scrolling; Home scrolls its feed to the bottom on every render.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
