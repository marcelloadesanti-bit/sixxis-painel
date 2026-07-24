"use client";

import { useEffect, useRef, useState } from "react";

// Dropzone de fotos com pre-visualizacao, estilo mais proximo do editor real
// do Mercado Livre (area tracejada, clicavel e com arrastar-e-soltar) em vez
// de um <input type="file"> cru, que passava despercebido no formulario.
export default function SeletorFotos({
  imagens,
  onChange,
  compacto = false,
}: {
  imagens: File[];
  onChange: (arquivos: File[]) => void;
  compacto?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = imagens.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [imagens]);

  function adicionarArquivos(lista: FileList | File[]) {
    const novos = Array.from(lista).filter((f) => f.type.startsWith("image/"));
    if (novos.length === 0) return;
    onChange([...imagens, ...novos]);
  }

  function removerNoIndice(i: number) {
    onChange(imagens.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (e.dataTransfer.files) adicionarArquivos(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center transition-colors ${
          compacto ? "py-4" : "py-8"
        } ${arrastando ? "border-[var(--color-sixxis-blue)] bg-blue-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"}`}
      >
        <span className={`mb-1 text-[var(--color-sixxis-blue)] ${compacto ? "text-xl" : "text-3xl"}`}>⬆</span>
        <p className="text-sm text-gray-600">
          <span className="font-medium text-[var(--color-sixxis-blue)]">Selecionar</span> ou arrastar as fotos aqui
        </p>
        {!compacto && (
          <p className="mt-1 text-xs text-gray-400">JPG, JPEG, PNG ou WEBP. Mínimo 500px em um dos lados.</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files) adicionarArquivos(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {imagens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {imagens.map((img, i) => (
            <div key={`${img.name}-${i}`} className="group relative h-20 w-20 overflow-hidden rounded border border-gray-200">
              {previews[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]} alt={img.name} className="h-full w-full object-cover" />
              )}
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[9px] font-medium text-white">
                  CAPA
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removerNoIndice(i);
                }}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
