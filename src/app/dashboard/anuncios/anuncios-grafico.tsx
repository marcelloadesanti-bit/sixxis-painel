"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

type Serie = { contaId: string; nickname: string; cor: string; pontos: { data: string; total: number }[] };

const formatarDataEixo = (iso: string) => {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
};

export default function AnunciosGrafico({ series }: { series: Serie[] }) {
  const datas = Array.from(new Set(series.flatMap((s) => s.pontos.map((p) => p.data)))).sort();

  if (datas.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sem dados de visitas para o período.</p>;
  }

  const dadosGrafico = datas.map((data) => {
    const linha: Record<string, string | number> = { data };
    for (const serie of series) {
      const ponto = serie.pontos.find((p) => p.data === data);
      linha[serie.contaId] = ponto?.total ?? 0;
    }
    return linha;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={dadosGrafico}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="data" tickFormatter={formatarDataEixo} fontSize={12} />
        <YAxis fontSize={12} allowDecimals={false} />
        <Tooltip labelFormatter={(label) => formatarDataEixo(String(label))} />
        <Legend />
        {series.map((serie) => (
          <Line
            key={serie.contaId}
            type="monotone"
            dataKey={serie.contaId}
            name={serie.nickname}
            stroke={serie.cor}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
