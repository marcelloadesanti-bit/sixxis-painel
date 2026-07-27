"use client";

import { useSidebar } from "./sidebar-context";

// 27/07/2026: envolve o cabecalho + conteudo da area logada, ajustando o
// recuo esquerdo conforme o AppSidebar esta aberto (w-64) ou fechado (w-16).
export default function DashboardContent({ children }: { children: React.ReactNode }) {
  const { aberto } = useSidebar();

  return (
    <div className={`transition-[padding] duration-150 ${aberto ? "pl-64" : "pl-16"}`}>
      {children}
    </div>
  );
}
