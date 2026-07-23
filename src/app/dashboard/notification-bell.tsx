"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Contadores = { perguntas: number; mensagens: number; reclamacoes: number; vendas: number };

type Categoria = keyof Contadores;

const CONFIG: Record<Categoria, { label: string; som: string; href: string }> = {
  vendas: { label: "Nova venda", som: "/sounds/venda.mp3", href: "/dashboard/vendas" },
  perguntas: { label: "Nova pergunta", som: "/sounds/pergunta.mp3", href: "/dashboard/pos-venda" },
  mensagens: { label: "Nova mensagem", som: "/sounds/mensagem.mp3", href: "/dashboard/pos-venda" },
  reclamacoes: { label: "Nova reclamação", som: "/sounds/reclamacao.mp3", href: "/dashboard/pos-venda" },
};

const CHAVE_STORAGE = "sixxis-ultimos-contadores";
const INTERVALO_MS = 45_000;

type Notificacao = { id: string; categoria: Categoria; quantidade: number; hora: string };

export default function NotificationBell() {
  const [contadores, setContadores] = useState<Contadores | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const iniciado = useRef(false);

  const tocarSom = useCallback((categoria: Categoria) => {
    try {
      const audio = new Audio(CONFIG[categoria].som);
      audio.volume = 0.6;
      audio.play().catch(() => {
        // Autoplay pode ser bloqueado ate o usuario interagir com a pagina
        // pelo menos uma vez - nesse caso a notificacao visual ainda aparece.
      });
    } catch {
      // ignora falha de audio (arquivo indisponivel, navegador sem suporte, etc)
    }
  }, []);

  const verificar = useCallback(async () => {
    try {
      const res = await fetch("/api/notificacoes/contadores", { cache: "no-store" });
      if (!res.ok) return;
      const atual = (await res.json()) as Contadores;

      const salvosRaw = localStorage.getItem(CHAVE_STORAGE);
      const salvos: Contadores | null = salvosRaw ? JSON.parse(salvosRaw) : null;

      if (salvos) {
        const novas: Notificacao[] = [];
        (Object.keys(CONFIG) as Categoria[]).forEach((cat) => {
          const diff = atual[cat] - salvos[cat];
          if (diff > 0) {
            novas.push({
              id: `${cat}-${Date.now()}`,
              categoria: cat,
              quantidade: diff,
              hora: new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              }).format(new Date()),
            });
            tocarSom(cat);
          }
        });
        if (novas.length > 0) {
          setNotificacoes((prev) => [...novas, ...prev].slice(0, 20));
          setNaoLidas((n) => n + novas.length);
        }
      }

      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(atual));
      setContadores(atual);
    } catch {
      // silencioso - tenta de novo no proximo ciclo
    }
  }, [tocarSom]);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    verificar();
    const id = setInterval(verificar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [verificar]);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setAberto((v) => !v);
          setNaoLidas(0);
        }}
        aria-label="Notificações"
        className="relative flex h-8 w-8 items-center justify-center rounded text-base text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        🔔
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-700">Notificações</p>
              {contadores && (
                <p className="mt-1 text-xs text-gray-400">
                  {contadores.perguntas} pergunta(s) · {contadores.mensagens} mensagem(ns) ·{" "}
                  {contadores.reclamacoes} reclamação(ões) em aberto
                </p>
              )}
            </div>
            {notificacoes.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-400">
                Nenhuma novidade ainda. Você será avisado quando algo novo chegar.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
                {notificacoes.map((n) => (
                  <li key={n.id}>
                    <a
                      href={CONFIG[n.categoria].href}
                      className="flex items-center justify-between p-3 text-sm hover:bg-gray-50"
                    >
                      <span className="text-gray-700">
                        {CONFIG[n.categoria].label}
                        {n.quantidade > 1 ? ` (${n.quantidade})` : ""}
                      </span>
                      <span className="text-xs text-gray-400">{n.hora}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
