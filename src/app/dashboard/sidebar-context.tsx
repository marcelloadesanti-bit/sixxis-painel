"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// 27/07/2026: estado global de aberto/fechado da barra lateral, compartilhado
// entre o AppSidebar (que renderiza o menu) e o DashboardContent (que ajusta
// o recuo do conteudo). Comeca ABERTO por padrao e lembra a preferencia do
// usuario entre sessoes via localStorage -- igual ao botao de colapsar do
// Claude.
type SidebarContextValue = {
  aberto: boolean;
  alternar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

const CHAVE_STORAGE = "sixxis-sidebar-aberto";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(true);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE);
    if (salvo !== null) setAberto(salvo === "1");
    setPronto(true);
  }, []);

  useEffect(() => {
    if (pronto) window.localStorage.setItem(CHAVE_STORAGE, aberto ? "1" : "0");
  }, [aberto, pronto]);

  return (
    <SidebarContext.Provider value={{ aberto, alternar: () => setAberto((v) => !v) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar deve ser usado dentro de SidebarProvider");
  return ctx;
}
