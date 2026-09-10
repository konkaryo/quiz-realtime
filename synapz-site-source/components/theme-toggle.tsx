"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.dataset.theme === "dark");
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    document.documentElement.dataset.theme = nextIsDark ? "dark" : "light";
    window.localStorage.setItem("synapz-theme", nextIsDark ? "dark" : "light");
    setIsDark(nextIsDark);
  };

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
      title={isDark ? "Mode clair" : "Mode sombre"}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
