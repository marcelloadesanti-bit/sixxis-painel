"use client";

import { useState, useTransition } from "react";
import { TODAS_SECOES, PERMISSOES_PADRAO_ADMINISTRADOR, type PermissoesUsuario } from "@/lib/permissoes";
import { SeletorPermissoes, resumoPermissoes } from "./gerenciar-colaboradores";
import {
  criarAdministradorAction,
  atualizarAdministradorAction,
  excluirAdministradorAction,
} from "./actions";

type Administrador = {
  id: string;
  fullName: string;
  email: string;
  permissoes: PermissoesUsuario;
};

function clonarPadrao(): PermissoesUsuario {
  return JSON.parse(JSON.stringify(PERMISSOES_PADRAO_ADMINISTRADOR));
}

// Mesma UI de GerenciarColaboradores, mas: (a) usa TODAS_SECOES no seletor de
// permissoes (inclui as 3 secoes administrativas), (b) chama as actions de
// administrador (restritas ao admin master no backend) e (c) so e renderizado
// pela pagina de Configuracoes quando o usuario logado e o admin master -
// um administrador comum nunca ve nem gerencia outros administradores.
export default function GerenciarAdministradores({
  administradoresIniciais,
}: {
  administradoresIniciais: Administrador[];
}) {
  const [administradores, setAdministradores] = useState(administradoresIniciais);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novasPermissoes, setNovasPermissoes] = useState<PermissoesUsuario>(clonarPadrao());

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

  function abrirEdicao(a: Administrador) {
    setEditandoId(a.id);
    setMostrarNovo(false);
    setEditNome(a.fullName);
    setEditSenha("");
    setEditPermissoes({ ...clonarPadrao(), ...a.permissoes });
    setErro(null);
  }

  function salvarNovo() {
    setErro(null);
    startTransition(async () => {
      try {
        await criarAdministradorAction({
          nomeCompleto: novoNome,
          email: novoEmail,
          senha: novaSenha,
          permissoes: novasPermissoes,
        });
        setAdministradores((atual) => [
          ...atual,
          { id: crypto.randomUUID(), fullName: novoNome, email: novoEmail, permissoes: novasPermissoes },
        ]);
        setMostrarNovo(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao criar administrador.");
      }
    });
  }

  function salvarEdicao(id: string) {
    setErro(null);
    startTransition(async () => {
      try {
        await atualizarAdministradorAction({
          userId: id,
          nomeCompleto: editNome,
          permissoes: editPermissoes,
          novaSenha: editSenha || undefined,
        });
        setAdministradores((atual) =>
          atual.map((a) => (a.id === id ? { ...a, fullName: editNome, permissoes: editPermissoes } : a))
        );
        setEditandoId(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar alterações.");
      }
    });
  }

  function excluir(id: string) {
    if (!confirm("Remover este administrador? O acesso dele será revogado imediatamente.")) return;
    setErro(null);
    startTransition(async () => {
      try {
        await excluirAdministradorAction(id);
        setAdministradores((atual) => atual.filter((a) => a.id !== id));
        if (editandoId === id) setEditandoId(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao remover administrador.");
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
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Administradores</h2>
          {!mostrarNovo && (
            <button
              onClick={abrirNovo}
              className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
            >
              + Novo administrador
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-400">
          Além das seções normais, um administrador pode receber acesso a Configurações, Contas
          conectadas e Metas — com leitura ou edição, como qualquer outra seção. Só você (admin master)
          pode criar, editar ou remover administradores.
        </p>

        {administradores.length === 0 && !mostrarNovo && (
          <p className="text-sm text-gray-400">Nenhum administrador cadastrado ainda.</p>
        )}

        <ul className="flex flex-col gap-2">
          {administradores.map((a) => (
            <li key={a.id} className="rounded border border-gray-200">
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">{a.fullName || a.email}</p>
                  <p className="text-xs text-gray-500">{a.email}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{resumoPermissoes(a.permissoes, TODAS_SECOES)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => (editandoId === a.id ? setEditandoId(null) : abrirEdicao(a))}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    {editandoId === a.id ? "Fechar" : "Editar"}
                  </button>
                  <button
                    onClick={() => excluir(a.id)}
                    disabled={pending}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </div>
              </div>

              {editandoId === a.id && (
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
                  <SeletorPermissoes permissoes={editPermissoes} onChange={setEditPermissoes} secoes={TODAS_SECOES} />
                  <button
                    onClick={() => salvarEdicao(a.id)}
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

      {mostrarNovo && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Novo administrador</h2>
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
          <SeletorPermissoes permissoes={novasPermissoes} onChange={setNovasPermissoes} secoes={TODAS_SECOES} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={salvarNovo}
              disabled={pending}
              className="rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Criando..." : "Criar administrador"}
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
