// Sistema de permissoes por colaborador.
// O admin sempre tem acesso total (nao passa por essas checagens).
// Colaboradores tem um objeto `permissoes` (jsonb na tabela profiles) no formato:
// {
//   resumo: { acesso: true, nivel: "edicao" },
//   vendas: { acesso: true, nivel: "leitura" },
//   publicidade: { acesso: false, nivel: "leitura" },
//   promocoes: { acesso: false, nivel: "leitura" },
//   pos_venda: { acesso: true, nivel: "edicao", subsecoes: ["mensagens"] },
//   faturamento: { acesso: false, nivel: "leitura" },
// }
// `subsecoes` (opcional, apenas pos_venda por enquanto): lista de sub-abas liberadas.
// Se omitido/undefined, todas as sub-abas da secao ficam liberadas.

export type NivelAcesso = "leitura" | "edicao";

export type SubsecaoPosVenda = "perguntas" | "mensagens" | "reclamacoes";
export type SubsecaoAnuncios = "resumo_anuncios" | "gestao" | "criar" | "tendencias_busca";

export type PermissaoSecao = {
  acesso: boolean;
  nivel: NivelAcesso;
  subsecoes?: string[];
};

export type CodigoSecao =
  | "resumo"
  | "vendas"
  | "anuncios"
  | "publicidade"
  | "promocoes"
  | "pos_venda"
  | "faturamento";

export type PermissoesUsuario = Partial<Record<CodigoSecao, PermissaoSecao>>;

export type DefinicaoSecao = {
  codigo: CodigoSecao;
  label: string;
  href: string;
  icon: string;
  // `href` na subsecao e opcional: quando presente, vira um item navegavel
  // proprio no submenu do sidebar (ex: Anuncios). Quando ausente, a subsecao
  // e usada apenas para controle de acesso dentro de uma pagina unica
  // (ex: Pos-venda, onde as 3 sub-abas convivem na mesma tela).
  subsecoes?: { codigo: string; label: string; href?: string }[];
};

// Fonte unica de verdade da lista de secoes do painel.
// Ao criar uma nova secao no futuro, basta adiciona-la aqui para que
// ela apareca automaticamente na tela de Configuracoes.
export const SECOES: DefinicaoSecao[] = [
  { codigo: "resumo", label: "Resumo", href: "/dashboard", icon: "🏠" },
  { codigo: "vendas", label: "Vendas", href: "/dashboard/vendas", icon: "🏷️" },
  {
    codigo: "anuncios",
    label: "Anúncios",
    href: "/dashboard/anuncios",
    icon: "🛍️",
    subsecoes: [
      { codigo: "resumo_anuncios", label: "Resumo", href: "/dashboard/anuncios" },
      { codigo: "gestao", label: "Editar anúncios", href: "/dashboard/anuncios/gestao" },
      { codigo: "criar", label: "Criar anúncios", href: "/dashboard/anuncios/criar" },
      { codigo: "tendencias_busca", label: "Tendências de busca", href: "/dashboard/anuncios/tendencias" },
    ],
  },
  { codigo: "publicidade", label: "Publicidade", href: "/dashboard/publicidade", icon: "📣" },
  { codigo: "promocoes", label: "Central de promoções", href: "/dashboard/promocoes", icon: "🏷" },
  {
    codigo: "pos_venda",
    label: "Pós-venda",
    href: "/dashboard/pos-venda",
    icon: "📦",
    subsecoes: [
      { codigo: "perguntas", label: "Perguntas" },
      { codigo: "mensagens", label: "Mensagens" },
      { codigo: "reclamacoes", label: "Reclamações" },
    ],
  },
  { codigo: "faturamento", label: "Faturamento", href: "/dashboard/faturamento", icon: "🧾" },
];

export const PERMISSOES_PADRAO_COLABORADOR: PermissoesUsuario = Object.fromEntries(
  SECOES.map((s) => [s.codigo, { acesso: false, nivel: "leitura" as NivelAcesso }])
) as PermissoesUsuario;

export function temAcessoSecao(
  isAdmin: boolean,
  permissoes: PermissoesUsuario | null | undefined,
  secao: CodigoSecao
): boolean {
  if (isAdmin) return true;
  return permissoes?.[secao]?.acesso === true;
}

export function nivelSecao(
  isAdmin: boolean,
  permissoes: PermissoesUsuario | null | undefined,
  secao: CodigoSecao
): NivelAcesso {
  if (isAdmin) return "edicao";
  return permissoes?.[secao]?.nivel ?? "leitura";
}

export function podeEditar(
  isAdmin: boolean,
  permissoes: PermissoesUsuario | null | undefined,
  secao: CodigoSecao
): boolean {
  return nivelSecao(isAdmin, permissoes, secao) === "edicao";
}

export function temAcessoSubsecao(
  isAdmin: boolean,
  permissoes: PermissoesUsuario | null | undefined,
  secao: CodigoSecao,
  subsecao: string
): boolean {
  if (isAdmin) return true;
  const config = permissoes?.[secao];
  if (!config?.acesso) return false;
  if (!config.subsecoes || config.subsecoes.length === 0) return true;
  return config.subsecoes.includes(subsecao);
}

// Lista de secoes (com href) que o usuario deve ver no sidebar.
export function secoesVisiveis(
  isAdmin: boolean,
  permissoes: PermissoesUsuario | null | undefined
): DefinicaoSecao[] {
  if (isAdmin) return SECOES;
  return SECOES.filter((s) => temAcessoSecao(isAdmin, permissoes, s.codigo));
}
