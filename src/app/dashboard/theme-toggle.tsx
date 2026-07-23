"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  if (!montado) {
    return <div className="h-8 w-8" />;
  }

  const escuro = theme === "dark";

  return (
    <button
      onClick={() => setTheme(escuro ? "light" : "dark")}
      aria-label={escuro ? "Ativar modo claro" : "Ativar modo escuro"}
      title={escuro ? "Modo claro" : "Modo escuro"}
      className="flex h-8 w-8 items-center justify-center rounded text-base text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {escuro ? "☀️" : "🌙"}
    </button>
  );
}
