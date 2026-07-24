"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

export type VendasHoje = {
  vendasBrutas: number;
  quantidadeVendas: number;
  visualizacoes: number;
  conversao: number;
  moeda: string;
};

export type MetaMesDados = {
  ano: number;
  mes: number;
  faturamento: number;
  metaValor: number | null;
  moeda: string;
};

type AoVivoDados = { vendasHoje: VendasHoje; metaMes: MetaMesDados; ts: number };

type AoVivoContextValue = {
  dados: AoVivoDados | null;
  carregando: boolean;
  erro: boolean;
};

const AoVivoContext = createContext<AoVivoContextValue>({ dados: null, carregando: true, erro: false });

// 2 minutos: intervalo escolhido para dar uma sensacao de "ao vivo" com
// custo baixo (poucas chamadas a API do ML por hora) e baixa chance de
// esbarrar em rate limit -- decisao explicita do usuario (2026-07-24),
// priorizando custo/estabilidade sobre velocidade maxima de atualizacao.
const INTERVALO_MS = 120_000;

export function AoVivoProvider({
  contaIds,
  children,
}: {
  contaIds: string[];
  children: React.ReactNode;
}) {
  const [dados, setDados] = useState<AoVivoDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const idsChave = contaIds.join(",");

  const buscar = useCallback(async () => {
    try {
      const params = idsChave ? `?contas=${idsChave}` : "";
      const res = await fetch(`/api/resumo/ao-vivo${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("falha ao buscar dados ao vivo");
      const json = (await res.json()) as AoVivoDados;
      setDados(json);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [idsChave]);

  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  useEffect(() => {
    buscarRef.current();
    const id = setInterval(() => buscarRef.current(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [idsChave]);

  return (
    <AoVivoContext.Provider value={{ dados, carregando, erro }}>{children}</AoVivoContext.Provider>
  );
}

export function useAoVivo() {
  return useContext(AoVivoContext);
}
