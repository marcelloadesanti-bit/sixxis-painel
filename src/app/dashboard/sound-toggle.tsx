"use client";

import { useEffect, useState } from "react";

// Botao de mutar/ativar o som das notificacoes (sino) -- fica ao lado do
// sino e do modo claro/escuro no cabecalho. Estado persistido no
// localStorage (mesmo padrao do modo escuro), lido diretamente por
// notification-bell.tsx antes de tocar qualquer som.
const CHAVE_SOM_MUDO = "sixxis-som-mudo";

export function somEstaMudo(): boolean {
  try {
    return localStorage.getItem(CHAVE_SOM_MUDO) === "1";
  } catch {
    return false;
  }
}

export default function SoundToggle() {
  const [mudo, setMudo] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setMudo(somEstaMudo());
    setPronto(true);
  }, []);

  const alternar = () => {
    const novo = !mudo;
    setMudo(novo);
    try {
      localStorage.setItem(CHAVE_SOM_MUDO, novo ? "1" : "0");
    } catch {
      // ignora falha de storage
    }
  };

  // Evita "flash" com o icone errado antes de ler o localStorage no cliente.
  if (!pronto) {
    return <div className="h-8 w-8" />;
  }

  return (
    <button
      onClick={alternar}
      aria-label={mudo ? "Ativar som das notificações" : "Mutar som das notificações"}
      title={mudo ? "Som das notificações desativado" : "Som das notificações ativado"}
      className="flex h-8 w-8 items-center justify-center rounded text-base text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {mudo ? "🔇" : "🔊"}
    </button>
  );
}
