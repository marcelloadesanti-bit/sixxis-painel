"use client";

import { useState, useTransition } from "react";
import {
  SECOES,
  PERMISSOES_PADRAO_COLABORADOR,
  type PermissoesUsuario,
  type CodigoSecao,
  type DefinicaoSecao,
} from "@/lib/permissoes";
import {
  criarColaboradorAction,
  atualizarColaboradorAction,
  excluirColaboradorAction,
} from "./actions";

type Colaborador = {
  id: string;
  fullName: string;
  email: string;
  permissoes: PermissoesUsuario;
};

function clonarPadrao(): PermissoesUsuario {
  return JSON.parse(JSON.stringify(PERMISSOES_PADRAO_COLABORADOR));
}

// Reutilizado tambem por GerenciarAdministradores, passando `secoes` com a
// lista estendida (operacionais + administrativas).
export function SeletorPermissoes({
  permissoes,
  onChange,
  secoes = SECOES,
}: {
  permissoes: PermissoesUsuario;
  onChange: (p: PermissoesUsuario) => void;
  secoes?: DefinicaoSecao[];
}) {
  function alternarAcesso(secao: CodigoSecao, acesso: boolean) {
    const atual = permissoes[secao] ?? { acesso: false, nivel: "leitura" as const };
    onChange({ ...permissoes, [secao]: { ...atual, acesso } });
  }

  function definirNivel(secao: CodigoSecao, nivel: "leitura" | "edicao") {
    const atual = permissoes[secao] ?? { acesso: true, nivel: "leitura" as const };
    onChange({ ...permissoes, [secao]: { ...atual, nivel } });
  }

  function alternarSubsecao(secao: CodigoSecao, subsecao: string, todasSubsecoes: string[]) {
    const atual = permissoes[secao] ?? { acesso: true, nivel: "leitura" as const };
    // subsecoes undefined = todas liberadas; ao desmarcar uma pela 1a vez, partimos de "todas"
    const atuaisSelecionadas = atual.subsecoes ?? todasSubsecoes;
    const jaTem = atuaisSelecionadas.includes(subsecao);
    const novasSubsecoes = jaTem
      ? atuaisSelecionadas.filter((s) => s !== subsecao)
      : [...atuaisSelecionadas, subsecao];
    onChange({ ...permissoes, [secao]: { ...atual, subsecoes: novasSubsecoes } });
  }

  return (
    <div className="flex flex-col gap-3">
      {secoes.map((secao) => {
        const config = permissoes[secao.codigo] ?? { acesso: false, nivel: "leitura" as const };
        const todasSubsecoes = secao.subsecoes?.map((s) => s.codigo) ?? [];
        const subsecoesSelecionadas = config.subsecoes ?? todasSubsecoes;

        return (
          <div key={secao.codigo} className="rounded border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={config.acesso}
                  onChange={(e) => alternarAcesso(secao.codigo, e.target.checked)}
                />
                {secao.icon} {secao.label}
              </label>

              {config.acesso && (
                <div className="flex gap-3 text-xs text-gray-600">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`nivel-${secao.codigo}`}
                      checked={config.nivel === "leitura"}
                      onChange={() => definirNivel(secao.codigo, "leitura")}
                    />
                    Apenas leitura
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`nivel-${secao.codigo}`}
                      checked={config.nivel === "edicao"}
                      onChange={() => definirNivel(secao.codigo, "edicao")}
                    />
                    Leitura e edição
                  </label>
                </div>
              )}
            </div>

            {config.acesso && secao.subsecoes && (
              <div className="mt-2 flex flex-wrap gap-3 border-t border-gray-100 pt-2 pl-6 text-xs text-gray-600">
                {secao.subsecoes.map((sub) => (
                  <label key={sub.codigo} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={subsecoesSelecionadas.includes(sub.codigo)}
                      onChange={() => alternarSubsecao(secao.codigo, sub.codigo, todasSubsecoes)}
                    />
                    {sub.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function resumoPermissoes(permissoes: PermissoesUsuario, secoes: DefinicaoSecao[] = SECOES): string {
  const ativas = secoes.filter((s) => permissoes[s.codigo]?.acesso);
  if (ativas.length === 0) return "Sem acesso a nenhuma seção";
  return ativas
    .map((s) => `${s.label} (${permissoes[s.codigo]?.nivel === "edicao" ? "edição" : "leitura"})`)
    .join(", ");
}

export default function GerenciarColaboradores({
  colaboradoresIniciais,
  podeGerenciar = true,
}: {
  colaboradoresIniciais: Colaborador[];
  podeGerenciar?: boolean;
}) {
  const [colaboradores, setColaboradores] = useState(colaboradoresIniciais);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // estado do form de novo colaborador
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novasPermissoes, setNovasPermissoes] = useState<PermissoesUsuario>(clonarPadrao());

  // estado do form de edicao
  const [editNome, setEditNome] = useState("");
  const [editSenha, setEditSenha] = useState("");
  const [editPermissoes, setEditPermissoes] = useState<PermissoesUsuario>(clonarPadrao());

  function abrirNovo() {
    setMostrarNovo(true);
    setEditandoId(null);
    setNovoNome("");
    setNovoEmail("");
    setNovaSenha("");
    setNovasPermissoes(clonarPadrao());
    setErro(null);
  }

  function abrirEdicao(c: Colaborador) {
    setEditandoId(c.id);
    setMostrarNovo(false);
    setEditNome(c.fullName);
    setEditSenha("");
    setEditPermissoes({ ...clonarPadrao(), ...c.permissoes });
    setErro(null);
  }

  function salvarNovo() {
    setErro(null);
    startTransition(async () => {
      try {
        await criarColaboradorAction({
          nomeCompleto: novoNome,
          email: novoEmail,
          senha: novaSenha,
          permissoes: novasPermissoes,
        });
        setColaboradores((atual) => [
          ...atual,
          { id: crypto.randomUUID(), fullName: novoNome, email: novoEmail, permissoes: novasPermissoes },
        ]);
        setMostrarNovo(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao criar colaborador.");
      }
    });
  }

  function salvarEdicao(id: string) {
    setErro(null);
    startTransition(async () => {
      try {
        await atualizarColaboradorAction({
          userId: id,
          nomeCompleto: editNome,
          permissoes: editPermissoes,
          novaSenha: editSenha || undefined,
        });
        setColaboradores((atual) =>
          atual.map((c) => (c.id === id ? { ...c, fullName: editNome, permissoes: editPermissoes } : c))
        );
        setEditandoId(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar alterações.");
      }
    });
  }

  function excluir(id: string) {
    if (!confirm("Remover este colaborador? O acesso dele será revogado imediatamente.")) return;
    setErro(null);
    startTransition(async () => {
      try {
        await excluirColaboradorAction(id);
        setColaboradores((atual) => atual.filter((c) => c.id !== id));
        if (editandoId === id) setEditandoId(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao remover colaborador.");
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {erro && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Colaboradores</h2>
          {podeGerenciar && !mostrarNovo && (
            <button
              onClick={abrirNovo}
              className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
            >
              + Novo colaborador
            </button>
          )}
        </div>

        {colaboradores.length === 0 && !mostrarNovo && (
          <p className="text-sm text-gray-400">Nenhum colaborador cadastrado ainda.</p>
        )}

        <ul className="flex flex-col gap-2">
          {colaboradores.map((c) => (
            <li key={c.id} className="rounded border border-gray-200">
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.fullName || c.email}</p>
                  <p className="text-xs text-gray-500">{c.email}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{resumoPermissoes(c.permissoes)}</p>
                </div>
                {podeGerenciar && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => (editandoId === c.id ? setEditandoId(null) : abrirEdicao(c))}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      {editandoId === c.id ? "Fechar" : "Editar"}
                    </button>
                    <button
                      onClick={() => excluir(c.id)}
                      disabled={pending}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>

              {podeGerenciar && editandoId === c.id && (
                <div className="border-t border-gray-100 p-3">
                  <div className="mb-3 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Nome completo"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="password"
                      placeholder="Nova senha (deixe em branco para manter)"
                      value={editSenha}
                      onChange={(e) => setEditSenha(e.target.value)}
                      className="rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <SeletorPermissoes permissoes={editPermissoes} onChange={setEditPermissoes} />
                  <button
                    onClick={() => salvarEdicao(c.id)}
                    disabled={pending}
                    className="mt-3 rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {pending ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {podeGerenciar && mostrarNovo && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Novo colaborador</h2>
          <div className="mb-3 flex flex-col gap-2">
            <input
              type="text"
              placeholder="Nome completo"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="E-mail de acesso"
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="Senha inicial (mín. 6 caracteres)"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <SeletorPermissoes permissoes={novasPermissoes} onChange={setNovasPermissoes} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={salvarNovo}
              disabled={pending}
              className="rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Criando..." : "Criar colaborador"}
            </button>
            <button
              onClick={() => setMostrarNovo(false)}
              className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
