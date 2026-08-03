"use client";

import {
  Home,
  Receipt,
  ShoppingBag,
  Megaphone,
  BadgePercent,
  Package,
  Headset,
  FileText,
  Telescope,
  Settings,
  Link2,
  BarChart3,
  Target,
  Boxes,
  Truck,
  type LucideIcon,
} from "lucide-react";

// Mapa central: chave de icone (armazenada em DefinicaoSecao.icon, ver
// src/lib/permissoes.ts) -> componente lucide-react. Unica fonte de verdade
// usada por app-sidebar.tsx e gerenciar-colaboradores.tsx, para nunca
// divergir entre os dois lugares que hoje consomem esse campo.
const MAPA_ICONES: Record<string, LucideIcon> = {
  Home,
  Receipt,
  ShoppingBag,
  Megaphone,
  BadgePercent,
  Package,
  Headset,
  FileText,
  Telescope,
  Settings,
  Link2,
  BarChart3,
  Target,
  Boxes,
  Truck,
};

export function IconeSecao({ chave, className }: { chave: string; className?: string }) {
  const Icone = MAPA_ICONES[chave] ?? Home;
  return <Icone className={className} aria-hidden="true" />;
}
