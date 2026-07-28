"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { somEstaMudo } from "./sound-toggle";

type Categoria = "vendas" | "perguntas" | "mensagens" | "reclamacoes";

type ContaContagem = {
  contaId: string;
  nickname: string;
  cor: string;
  perguntas: number;
  mensagens: number;
  reclamacoes: number;
  vendas: number;
};

type RespostaContadores = { contas: ContaContagem[]; ts: number };

const CONFIG: Record<Categoria, { label: string; som: string; href: string }> = {
  vendas: { label: "Nova venda", som: "/sounds/venda.mp3", href: "/dashboard/vendas" },
  perguntas: { label: "Nova pergunta", som: "/sounds/pergunta.mp3", href: "/dashboard/pos-venda" },
  mensagens: { label: "Nova mensagem", som: "/sounds/mensagem.mp3", href: "/dashboard/pos-venda" },
  reclamacoes: { label: "Nova reclamação", som: "/sounds/reclamacao.mp3", href: "/dashboard/pos-venda" },
};

const CHAVE_CONTAGEM = "sixxis-ultimos-contadores-v2";
const CHAVE_NOTIFICACOES = "sixxis-notificacoes-v2";
const MAX_NOTIFICACOES = 50;
const INTERVALO_VERIFICACAO_MS = 45_000;
const INTERVALO_LEMBRETE_MS = 30_000;
const REPETIR_APOS_MS = 5 * 60_000; // 5 minutos

type Notificacao = {
  id: string;
  categoria: Categoria;
  contaId: string;
  contaNickname: string;
  cor: string;
  quantidade: number;
  hora: string;
  lida: boolean;
  ultimoAlerta: number;
};

function carregarNotificacoes(): Notificacao[] {
  try {
    const raw = localStorage.getItem(CHAVE_NOTIFICACOES);
    return raw ? (JSON.parse(raw) as Notificacao[]) : [];
  } catch {
    return [];
  }
}

function salvarNotificacoes(lista: Notificacao[]) {
  try {
    localStorage.setItem(CHAVE_NOTIFICACOES, JSON.stringify(lista.slice(0, MAX_NOTIFICACOES)));
  } catch {
    // ignora falha de storage
  }
}

export default function NotificationBell() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const iniciado = useRef(false);
  const audioPronto = useRef(false);

  const tocarSom = useCallback((categoria: Categoria) => {
    if (somEstaMudo()) return;
    try {
      const audio = new Audio(CONFIG[categoria].som);
      audio.volume = 0.6;
      audio.play().catch(() => {
        // Autoplay pode ser bloqueado ate o usuario interagir com a pagina
        // pelo menos uma vez - a notificacao visual ainda aparece normalmente.
      });
    } catch {
      // ignora falha de audio
    }
  }, []);

  // "Destrava" o audio na primeira interacao do usuario com a pagina, para
  // reduzir a chance do navegador bloquear o som quando ele tocar sozinho
  // (disparado pelo timer, sem clique direto no momento).
  useEffect(() => {
    if (audioPronto.current) return;
    const destravar = () => {
      audioPronto.current = true;
      Object.values(CONFIG).forEach(({ som }) => {
        const audio = new Audio(som);
        audio.volume = 0;
        audio.play().then(() => audio.pause()).catch(() => {});
      });
      window.removeEventListener("click", destravar);
      window.removeEventListener("keydown", destravar);
    };
    window.addEventListener("click", destravar, { once: true });
    window.addEventListener("keydown", destravar, { once: true });
    return () => {
      window.removeEventListener("click", destravar);
      window.removeEventListener("keydown", destravar);
    };
  }, []);

  const verificar = useCallback(async () => {
    try {
      const res = await fetch("/api/notificacoes/contadores", { cache: "no-store" });
      if (!res.ok) return;
      const atual = (await res.json()) as RespostaContadores;

      const salvosRaw = localStorage.getItem(CHAVE_CONTAGEM);
      const salvos: Record<string, Record<Categoria, number>> | null = salvosRaw
        ? JSON.parse(salvosRaw)
        : null;

      const categorias: Categoria[] = ["vendas", "perguntas", "mensagens", "reclamacoes"];
      const categoriasComNovidade = new Set<Categoria>();
      const novas: Notificacao[] = [];
      const agora = Date.now();

      if (salvos) {
        for (const conta of atual.contas) {
          const anterior = salvos[conta.contaId];
          if (!anterior) continue; // conta nova apareceu agora - so passa a acompanhar dai pra frente
          for (const cat of categorias) {
            const diff = conta[cat] - anterior[cat];
            if (diff > 0) {
              categoriasComNovidade.add(cat);
              novas.push({
                id: `${conta.contaId}-${cat}-${agora}-${Math.random().toString(36).slice(2, 7)}`,
                categoria: cat,
                contaId: conta.contaId,
                contaNickname: conta.nickname,
                cor: conta.cor,
                quantidade: diff,
                hora: new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                }).format(new Date()),
                lida: false,
                ultimoAlerta: agora,
              });
            }
          }
        }
      }

      const novoMapaContagem: Record<string, Record<Categoria, number>> = {};
      for (const conta of atual.contas) {
        novoMapaContagem[conta.contaId] = {
          vendas: conta.vendas,
          perguntas: conta.perguntas,
          mensagens: conta.mensagens,
          reclamacoes: conta.reclamacoes,
        };
      }
      localStorage.setItem(CHAVE_CONTAGEM, JSON.stringify(novoMapaContagem));

      if (novas.length > 0) {
        categoriasComNovidade.forEach((cat) => tocarSom(cat));
        setNotificacoes((prev) => {
          const combinada = [...novas, ...prev].slice(0, MAX_NOTIFICACOES);
          salvarNotificacoes(combinada);
          return combinada;
        });
      }
    } catch {
      // silencioso - tenta de novo no proximo ciclo
    }
  }, [tocarSom]);

  // A cada notificacao nao lida que passou de 5 minutos sem ser aberta, o
  // som daquela categoria toca de novo - continua repetindo ate o usuario
  // abrir (marca como lida) ou excluir a notificacao.
  const repetirLembretes = useCallback(() => {
    setNotificacoes((prev) => {
      const agora = Date.now();
      const categoriasParaTocar = new Set<Categoria>();
      let mudou = false;
      const atualizada = prev.map((n) => {
        if (!n.lida && agora - n.ultimoAlerta >= REPETIR_APOS_MS) {
          categoriasParaTocar.add(n.categoria);
          mudou = true;
          return { ...n, ultimoAlerta: agora };
        }
        return n;
      });
      if (mudou) {
        categoriasParaTocar.forEach((cat) => tocarSom(cat));
        salvarNotificacoes(atualizada);
        return atualizada;
      }
      return prev;
    });
  }, [tocarSom]);

  useEffect(() => {
    setNotificacoes(carregarNotificacoes());
    if (iniciado.current) return;
    iniciado.current = true;
    verificar();
    const idVerificacao = setInterval(verificar, INTERVALO_VERIFICACAO_MS);
    const idLembrete = setInterval(repetirLembretes, INTERVALO_LEMBRETE_MS);
    return () => {
      clearInterval(idVerificacao);
      clearInterval(idLembrete);
    };
  }, [verificar, repetirLembretes]);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  const marcarTodasComoLidas = () => {
    setNotificacoes((prev) => {
      const atualizada = prev.map((n) => ({ ...n, lida: true }));
      salvarNotificacoes(atualizada);
      return atualizada;
    });
  };

  const abrirNotificacao = (id: string) => {
    setNotificacoes((prev) => {
      const atualizada = prev.map((n) => (n.id === id ? { ...n, lida: true } : n));
      salvarNotificacoes(atualizada);
      return atualizada;
    });
  };

  const excluirNotificacao = (id: string) => {
    setNotificacoes((prev) => {
      const atualizada = prev.filter((n) => n.id !== id);
      salvarNotificacoes(atualizada);
      return atualizada;
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
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
          <div className="absolute right-0 z-40 mt-2 w-96 rounded border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-700">Notificações</p>
              {naoLidas > 0 && (
                <button
                  onClick={marcarTodasComoLidas}
                  className="text-xs text-[var(--color-sixxis-blue)] hover:underline"
                >
                  Marcar tudo como lido
                </button>
              )}
            </div>
            {notificacoes.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-400">
                Nenhuma novidade ainda. Você será avisado quando algo novo chegar.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
                {notificacoes.map((n) => (
                  <li
                    key={n.id}
                    className={`flex items-center gap-2 p-3 text-sm hover:bg-gray-50 ${
                      n.lida ? "opacity-60" : ""
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: n.cor }}
                      title={n.contaNickname}
                    />
                    <a
                      href={CONFIG[n.categoria].href}
                      onClick={() => abrirNotificacao(n.id)}
                      className="min-w-0 flex-1"
                    >
                      <span className="block truncate text-gray-700">
                        {CONFIG[n.categoria].label}
                        {n.quantidade > 1 ? ` (${n.quantidade})` : ""} · {n.contaNickname}
                      </span>
                      <span className="text-xs text-gray-400">
                        {n.hora}
                        {!n.lida ? " · toca de novo em até 5 min" : ""}
                      </span>
                    </a>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        excluirNotificacao(n.id);
                      }}
                      aria-label="Excluir notificação"
                      title="Excluir notificação"
                      className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                    >
                      🗑
                    </button>
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
