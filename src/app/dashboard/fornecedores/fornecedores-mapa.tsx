"use client";

// Mapa de fornecedores (Fase 14, 04/08/2026). So renderiza o mapa de verdade
// quando NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY existir (variavel de ambiente
// publica, definida em build-time na Vercel) -- ate a integracao com o
// Google Maps ser ativada (pendente de liberacao de cobranca no Google
// Cloud), mostra um placeholder no mesmo espaco/altura, para o layout nao
// pular quando o mapa for ligado.
//
// Cores dos pinos: fornecedores estrela ficam maiores e na cor de estrela
// (dourado); fornecedores da categoria Samples ficam amarelos; os demais
// (fornecedores novos/regulares) ficam vermelhos.

import { useMemo, useState } from "react";
import { GoogleMap, MarkerF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { Map as MapIcon } from "lucide-react";
import type { Fornecedor } from "@/lib/fornecedores";

const CHAVE_MAPS_BROWSER = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const ALTURA_MAPA = "420px";

type FornecedorComCoordenadas = Fornecedor & { latitude: number; longitude: number };

export default function FornecedoresMapa({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const comCoordenadas = useMemo(
    () =>
      fornecedores.filter(
        (f): f is FornecedorComCoordenadas => f.latitude != null && f.longitude != null
      ),
    [fornecedores]
  );

  if (!CHAVE_MAPS_BROWSER) {
    return <MapaIndisponivel total={fornecedores.length} geocodificados={comCoordenadas.length} />;
  }

  return <MapaGoogle fornecedores={comCoordenadas} chave={CHAVE_MAPS_BROWSER} />;
}

function MapaIndisponivel({ total, geocodificados }: { total: number; geocodificados: number }) {
  return (
    <div
      style={{ height: ALTURA_MAPA }}
      className="mb-6 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-900/40"
    >
      <MapIcon className="h-8 w-8 text-gray-400" />
      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Mapa de fornecedores em breve</p>
      <p className="max-w-md text-xs text-gray-500 dark:text-gray-400">
        A integração com o Google Maps já está pronta e será ativada assim que a cobrança do Google Cloud for
        liberada.
        {total > 0 &&
          (geocodificados > 0
            ? ` ${geocodificados} de ${total} fornecedor${total === 1 ? "" : "es"} já ${geocodificados === 1 ? "tem" : "têm"} localização salva.`
            : ` ${total} fornecedor${total === 1 ? "" : "es"} cadastrado${total === 1 ? "" : "s"} aguardando geocodificação.`)}
      </p>
    </div>
  );
}

const CORES = {
  estrela: "#F59E0B",
  amostras: "#EAB308",
  regular: "#EF4444",
} as const;

function corDoPino(f: FornecedorComCoordenadas) {
  if (f.estrela) return { cor: CORES.estrela, escala: 11 };
  if (f.categoria === "Samples") return { cor: CORES.amostras, escala: 8 };
  return { cor: CORES.regular, escala: 8 };
}

function MapaGoogle({ fornecedores, chave }: { fornecedores: FornecedorComCoordenadas[]; chave: string }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: chave, id: "sixxis-google-maps-script" });
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const centro = useMemo(() => {
    if (fornecedores.length === 0) return { lat: -14.235, lng: -51.9253 };
    const soma = fornecedores.reduce(
      (acc, f) => ({ lat: acc.lat + f.latitude, lng: acc.lng + f.longitude }),
      { lat: 0, lng: 0 }
    );
    return { lat: soma.lat / fornecedores.length, lng: soma.lng / fornecedores.length };
  }, [fornecedores]);

  if (!isLoaded) {
    return (
      <div
        style={{ height: ALTURA_MAPA }}
        className="mb-6 flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40"
      >
        <p className="text-sm text-gray-400">Carregando mapa...</p>
      </div>
    );
  }

  const fornecedorSelecionado = fornecedores.find((f) => f.id === selecionadoId) ?? null;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: ALTURA_MAPA }}
        center={centro}
        zoom={fornecedores.length > 0 ? 4 : 2}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
      >
        {fornecedores.map((f) => {
          const { cor, escala } = corDoPino(f);
          return (
            <MarkerF
              key={f.id}
              position={{ lat: f.latitude, lng: f.longitude }}
              onClick={() => setSelecionadoId(f.id)}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: escala,
                fillColor: cor,
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              }}
            />
          );
        })}
        {fornecedorSelecionado && (
          <InfoWindowF
            position={{ lat: fornecedorSelecionado.latitude, lng: fornecedorSelecionado.longitude }}
            onCloseClick={() => setSelecionadoId(null)}
          >
            <div className="text-sm text-gray-800">
              <div className="font-semibold">{fornecedorSelecionado.nome}</div>
              <div className="text-xs text-gray-500">{fornecedorSelecionado.categoria}</div>
              {fornecedorSelecionado.localizacao && (
                <div className="text-xs text-gray-500">{fornecedorSelecionado.localizacao}</div>
              )}
              {fornecedorSelecionado.estrela && (
                <div className="mt-1 text-xs font-medium text-amber-600">★ Fornecedor estrela</div>
              )}
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
      <Legenda />
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 bg-white px-4 py-2 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      <LegendaItem cor={CORES.estrela} label="Estrela" />
      <LegendaItem cor={CORES.amostras} label="Samples" />
      <LegendaItem cor={CORES.regular} label="Demais fornecedores" />
    </div>
  );
}

function LegendaItem({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor }} />
      {label}
    </span>
  );
}
