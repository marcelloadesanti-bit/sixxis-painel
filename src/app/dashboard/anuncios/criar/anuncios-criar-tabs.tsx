"use client";

import { useState } from "react";
import CriarAnuncioForm from "./criar-anuncio-form";
import ClonarAnuncioForm from "./clonar-anuncio-form";

type ContaOpcao = { id: string; nickname: string; cor: string };

export default function AnunciosCriarTabs({ contas }: { contas: ContaOpcao[] }) {
    const [aba, setAba] = useState<"novo" | "clonar">("novo");

  return (
        <div>
          <div className="mb-6 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setAba("novo")}
            className={`px-4 py-2 text-sm font-medium ${
                          aba === "novo"
                            ? "border-b-2 border-[var(--color-sixxis-navy)] text-[var(--color-sixxis-navy)]"
                            : "text-gray-500"
            }`}
        >
          Criar do zero
        </button>
        <button
          onClick={() => setAba("clonar")}
          className={`px-4 py-2 text-sm font-medium ${
                        aba === "clonar"
                          ? "border-b-2 border-[var(--color-sixxis-navy)] text-[var(--color-sixxis-navy)]"
                          : "text-gray-500"
          }`}
        >
          Clonar anúncio existente
        </button>
      </div>
{aba === "novo" ? <CriarAnuncioForm contas={contas} /> : <ClonarAnuncioForm />}
    </div>
  );
}

