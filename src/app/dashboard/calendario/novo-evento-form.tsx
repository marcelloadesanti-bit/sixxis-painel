"use client";

import { useState, useTransition } from "react";
import { criarEventoAction } from "./actions";

export default function NovoEventoForm() {
    const [aberto, setAberto] = useState(false);
    const [pending, startTransition] = useTransition();
    const [erro, setErro] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
        setErro(null);
        startTransition(async () => {
                const resultado = await criarEventoAction(formData);
                if (resultado?.erro) {
                          setErro(resultado.erro);
                } else {
                          setAberto(false);
                }
        });
  }

  if (!aberto) {
        return (
                <button
                  type="button"
                  onClick={() => setAberto(true)}
          className="w-fit rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          + Novo evento
        </button>
      );
}

  return (
        <form
          action={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Título</label>
          <input
            name="titulo"
            required
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Data</label>
          <input
            type="date"
            name="data"
            required
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Início</label>
            <input
              type="time"
              name="horaInicio"
              required
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Fim</label>
            <input
              type="time"
              name="horaFim"
              required
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Descrição (opcional)</label>
          <textarea
            name="descricao"
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
            Convidados (Gmails separados por vírgula, opcional)
          </label>
          <input
            name="convidados"
            placeholder="ex: pessoa@gmail.com, outra@gmail.com"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

{erro && <p className="text-xs text-red-500">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
{pending ? "Salvando..." : "Criar evento"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
