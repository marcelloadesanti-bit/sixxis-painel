"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { secoesVisiveis, secoesAdminVisiveis, temAcessoSubsecao, type PermissoesUsuario } from "@/lib/permissoes";
import { useSidebar } from "./sidebar-context";

type SubItemMenu = { href: string; label: string };

type ItemMenu = {
  href: string;
  label: string;
  icon: string;
  subitens?: SubItemMenu[];
};

// Icone de "colapsar/expandir barra lateral", mesmo estilo do botao usado
// pelo Claude (retangulo com uma divisao vertical perto da borda esquerda).
function IconeAlternar() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <line x1="8" y1="3.5" x2="8" y2="16.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export default function AppSidebar({
  isAdmin,
  permissoes,
}: {
  isAdmin: boolean;
  permissoes: PermissoesUsuario;
}) {
  const { aberto, alternar } = useSidebar();
  const pathname = usePathname();

  const itensSecoes: ItemMenu[] = secoesVisiveis(isAdmin, permissoes).map((s) => {
    const subitens = (s.subsecoes ?? [])
      .filter((sub) => sub.href && temAcessoSubsecao(isAdmin, permissoes, s.codigo, sub.codigo))
      .map((sub) => ({ href: sub.href!, label: sub.label }));
    return {
      href: s.href,
      label: s.label,
      icon: s.icon,
      subitens: subitens.length > 0 ? subitens : undefined,
    };
  });

  // Mesma logica de subitens de itensSecoes -- secoes administrativas (ex:
  // SIGE) tambem podem ter subsecoes navegaveis (Relatorios / Fechamento
  // Mensal / Historico) e precisam do mesmo tratamento, senao o item vira
  // um link unico direto para a primeira subsecao e as demais ficam
  // invisiveis no menu (bug corrigido aqui).
  const itensAdmin: ItemMenu[] = secoesAdminVisiveis(isAdmin, permissoes).map((s) => {
    const subitens = (s.subsecoes ?? [])
      .filter((sub) => sub.href && temAcessoSubsecao(isAdmin, permissoes, s.codigo, sub.codigo))
      .map((sub) => ({ href: sub.href!, label: sub.label }));
    return {
      href: s.href,
      label: s.label,
      icon: s.icon,
      subitens: subitens.length > 0 ? subitens : undefined,
    };
  });

  const itens: ItemMenu[] = [...itensSecoes, ...itensAdmin];

  // Metas & Comissao nunca fica concedivel via permissoes JSONB (ver
  // exigirMaster em lib/permissoes-guard.ts) -- por isso entra direto aqui,
  // fora do sistema generico de SECOES_ADMIN, visivel so para o master.
  if (isAdmin) {
    itens.push({ href: "/dashboard/sige/comissao", label: "Metas & Comissão", icon: "💰" });
  }

  const ativo = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);

  // Para itens com submenu, destaca apenas o sub-item mais especifico (maior
  // prefixo) que bate com a rota atual, evitando que "Resumo" e "Editar
  // anuncios" fiquem ativos ao mesmo tempo (ambos comecam com /dashboard/anuncios).
  const subitemAtivo = (sub: SubItemMenu, todos: SubItemMenu[]) => {
    if (!pathname) return false;
    const candidatos = todos.filter((s) => pathname.startsWith(s.href));
    if (candidatos.length === 0) return false;
    const maisEspecifico = candidatos.reduce((a, b) => (b.href.length > a.href.length ? b : a));
    return maisEspecifico.href === sub.href;
  };

  return (
    <nav
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-gray-200 bg-white transition-[width] duration-150 ${
        aberto ? "w-64" : "w-16"
      }`}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-gray-200 ${
          aberto ? "justify-between px-4" : "justify-center"
        }`}
      >
        {aberto && <p className="truncate text-sm font-semibold text-gray-800">Painel Sixxis</p>}
        <button
          onClick={alternar}
          title={aberto ? "Fechar barra lateral" : "Abrir barra lateral"}
          aria-label={aberto ? "Fechar barra lateral" : "Abrir barra lateral"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
        >
          <IconeAlternar />
        </button>
      </div>

      <ul className={`flex flex-1 flex-col gap-1 overflow-y-auto py-3 ${aberto ? "px-3" : "items-center px-2"}`}>
        {itens.map((item) => (
          <li key={item.href} className="w-full">
            {!aberto ? (
              <Link
                href={item.href}
                title={item.label}
                className={`flex h-10 w-10 items-center justify-center rounded text-xl hover:bg-gray-100 ${
                  ativo(item.href) ? "bg-[var(--color-sixxis-navy)]/10 text-[var(--color-sixxis-navy)]" : "text-gray-500"
                }`}
              >
                {item.icon}
              </Link>
            ) : item.subitens ? (
              <>
                <div className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-gray-800">
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </div>
                <ul className="ml-4 flex flex-col gap-0.5 border-l border-gray-200 pl-4">
                  {item.subitens.map((sub) => (
                    <li key={sub.href}>
                      <Link
                        href={sub.href}
                        className={`block rounded px-3 py-1.5 text-sm hover:bg-gray-50 ${
                          subitemAtivo(sub, item.subitens!)
                            ? "bg-gray-100 font-medium text-[var(--color-sixxis-navy)]"
                            : "text-gray-600"
                        }`}
                      >
                        {sub.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded px-3 py-2 text-sm hover:bg-gray-50 ${
                  ativo(item.href) ? "bg-gray-100 font-medium text-[var(--color-sixxis-navy)]" : "text-gray-700"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
