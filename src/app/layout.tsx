import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sixxis | Painel Mercado Livre",
  description: "Painel unificado de gestao, metricas e atendimento das contas Mercado Livre da Sixxis.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
