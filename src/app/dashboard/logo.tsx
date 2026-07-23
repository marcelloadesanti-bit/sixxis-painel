// Logomarca do cabecalho: preta (com detalhe menta) no modo claro,
// branca (com detalhe menta) no modo escuro. Arquivos extraidos e
// vetorizados a partir do PDF oficial enviado pelo usuario.
export default function Logo() {
  return (
    <span className="flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-preta.png" alt="Sixxis" className="block h-6 w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-branca.png" alt="Sixxis" className="hidden h-6 w-auto dark:block" />
    </span>
  );
}
