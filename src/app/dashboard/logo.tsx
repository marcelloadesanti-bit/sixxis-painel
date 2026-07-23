// Logomarca do cabecalho. Por enquanto e um wordmark de texto (ate o
// usuario enviar os arquivos PNG/SVG oficiais - preta para modo claro,
// branca para modo escuro). Quando os arquivos chegarem, trocar por:
//   <img src="/logo-preta.svg" className="block dark:hidden h-8" />
//   <img src="/logo-branca.svg" className="hidden dark:block h-8" />
export default function Logo() {
  return (
    <span className="select-none text-lg font-extrabold tracking-tight text-[var(--color-sixxis-navy)] dark:text-white">
      SIXXIS
    </span>
  );
}
