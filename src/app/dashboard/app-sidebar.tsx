"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { secoesVisiveis, temAcessoSubsecao, type PermissoesUsuario } from "@/lib/permissoes";

type SubItemMenu = { href: string; label: string };

type ItemMenu = {
  href: string;
  label: string;
  icon: string;
  subitens?: SubItemMenu[];
};

export default function AppSidebar({
  isAdmin,
  permissoes,
}: {
  isAdmin: boolean;
  permissoes: PermissoesUsuario;
}) {
  const [aberto, setAberto] = useState(false);
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

  const itens: ItemMenu[] = isAdmin
    ? [...itensSecoes, { href: "/dashboard/configuracoes", label: "Configurações", icon: "⚙️" }]
    : itensSecoes;

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
    <>
      {/* Trilho de icones, sempre visivel */}
      <nav className="fixed left-0 top-0 z-30 flex h-screen w-16 flex-col items-center gap-1 border-r border-gray-200 bg-white py-4">
        <button
          onClick={() => setAberto((v) => !v)}
          aria-label="Abrir menu"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded text-xl text-gray-600 hover:bg-gray-100"
        >
          ☰
        </button>
        {itens.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`flex h-10 w-10 items-center justify-center rounded text-xl hover:bg-gray-100 ${
              ativo(item.href) ? "bg-[var(--color-sixxis-navy)]/10 text-[var(--color-sixxis-navy)]" : "text-gray-500"
            }`}
          >
            {item.icon}
          </Link>
        ))}
      </nav>

      {/* Painel expandido, sobrepondo o conteudo, igual ao menu do ML */}
      {aberto && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/20"
            onClick={() => setAberto(false)}
          />
          <div className="fixed left-16 top-0 z-30 h-screen w-72 overflow-y-auto border-r border-gray-200 bg-white p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Painel Sixxis</p>
              <button
                onClick={() => setAberto(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Fechar menu"
              >
                ✕
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {itens.map((item) => (
                <li key={item.href}>
                  {item.subitens ? (
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
                              onClick={() => setAberto(false)}
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
                      onClick={() => setAberto(false)}
                      className={`flex items-center gap-3 rounded px-3 py-2 text-sm hover:bg-gray-50 ${
                        ativo(item.href)
                          ? "bg-gray-100 font-medium text-[var(--color-sixxis-navy)]"
                          : "text-gray-700"
                      }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
