// Sistema de permissoes por colaborador.
// O admin sempre tem acesso total (nao passa por essas checagens).
// Colaboradores tem um objeto `permissoes` (jsonb na tabela profiles) no formato:
// {
// resumo: { acesso: true, nivel: "edicao" },
// vendas: { acesso: true, nivel: "leitura" },
// publicidade: { acesso: false, nivel: "leitura" },
// promocoes: { acesso: false, nivel: "leitura" },
// amazon: { acesso: false, nivel: "leitura" },
// pos_venda: { acesso: true, nivel: "edicao", subsecoes: ["mensagens"] },
// faturamento: { acesso: false, nivel: "leitura" },
// }
// `subsecoes` (opcional): lista de sub-abas liberadas. Se omitido/undefined,
// todas as sub-abas da secao ficam liberadas.

export type NivelAcesso = "leitura" | "edicao";

export type SubsecaoPosVenda = "perguntas" | "mensagens" | "reclamacoes";
export type SubsecaoAnuncios = "resumo_anuncios" | "gestao" | "criar" | "tendencias_busca";
export type SubsecaoAmazon =
  | "amz_vendas"
  | "amz_faturamento"
  | "amz_publicidade"
  | "amz_conteudo_a"
  | "amz_anuncios";
// SIGE: sistema de gestao/fechamento mensal (equivalente automatizado da
// planilha SIEGE). "sige_metas_comissao" fica de fora por ora -- essa parte
// (calculo de comissao) mora dentro da aba Metas existente, nao no SIGE.
export type SubsecaoSige = "sige_relatorios" | "sige_fechamento" | "sige_historico";
export type SubsecaoConcorrencia = "benchmark_preco" | "mais_vendidos";

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
  | "amazon"
  | "pos_venda"
  | "faturamento"
  | "concorrencia"
  // Secoes administrativas: nunca ficam disponiveis para colaboradores comuns.
  // So podem ser concedidas a usuarios com role "administrador" (ou ao admin
  // master, que sempre tem acesso total). Ver README de seguranca em
  // configuracoes/actions.ts sobre por que essa distincao existe.
  | "equipe"
  | "contas"
  | "sige"
  | "metas";

// Codigos de secao que sao exclusivamente administrativas. Usados para
// impedir, em profundidade (defesa em camadas), que essas chaves entrem no
// objeto `permissoes` de um colaborador comum mesmo que alguem tente burlar
// a UI.
export const CODIGOS_SECOES_ADMIN: CodigoSecao[] = ["equipe", "contas", "sige", "metas"];

export type PermissoesUsuario = Partial<Record<CodigoSecao, PermissaoSecao>>;

export type DefinicaoSecao = {
  codigo: CodigoSecao;
  label: string;
  href: string;
  icon: string;
  // `href` na subsecao e opcional: quando presente, vira um item navegavel
  // proprio no submenu do sidebar (ex: Anuncios, Amazon). Quando ausente, a
  // subsecao e usada apenas para controle de acesso dentro de uma pagina
  // unica (ex: Pos-venda, onde as 3 sub-abas convivem na mesma tela).
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
    codigo: "amazon",
    label: "Amazon",
    href: "/dashboard/amazon/vendas",
    icon: "🛒",
    subsecoes: [
      { codigo: "amz_vendas", label: "Vendas", href: "/dashboard/amazon/vendas" },
      { codigo: "amz_faturamento", label: "Faturamento", href: "/dashboard/amazon/faturamento" },
      { codigo: "amz_publicidade", label: "Publicidade", href: "/dashboard/amazon/publicidade" },
      { codigo: "amz_conteudo_a", label: "Conteúdo A+", href: "/dashboard/amazon/conteudo-a" },
      { codigo: "amz_anuncios", label: "Anúncios", href: "/dashboard/amazon/anuncios" },
    ],
  },
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
  {
    codigo: "concorrencia",
    label: "Concorrência",
    href: "/dashboard/concorrencia",
    icon: "🔭",
    subsecoes: [
      { codigo: "benchmark_preco", label: "Benchmark de Preço" },
      { codigo: "mais_vendidos", label: "Mais Vendidos por Categoria" },
    ],
  },
];

// Secoes administrativas: gestao de equipe, contas ML/Amazon conectadas,
// SIGE (fechamento mensal/relatorios/historico) e metas.
// So aparecem no seletor de permissoes ao criar/editar um ADMINISTRADOR
// (nunca um colaborador comum) e so ficam visiveis no sidebar/cabecalho para
// quem tiver acesso concedido a elas (ou for o admin master).
export const SECOES_ADMIN: DefinicaoSecao[] = [
  { codigo: "equipe", label: "Configurações", href: "/dashboard/configuracoes", icon: "⚙️" },
  { codigo: "contas", label: "Contas conectadas", href: "/dashboard/contas", icon: "🔗" },
  {
    codigo: "sige",
    label: "SIGE",
    href: "/dashboard/sige/relatorios",
    icon: "📊",
    subsecoes: [
      { codigo: "sige_relatorios", label: "Relatórios", href: "/dashboard/sige/relatorios" },
      { codigo: "sige_fechamento", label: "Fechamento Mensal", href: "/dashboard/sige/fechamento" },
      { codigo: "sige_historico", label: "Histórico de Desempenho", href: "/dashboard/sige/historico" },
    ],
  },
  { codigo: "metas", label: "Metas", href: "/dashboard/configuracoes/metas", icon: "🎯" },
];

// Todas as secoes existentes no painel (operacionais + administrativas).
// Usada no seletor de permissoes ao gerenciar ADMINISTRADORES.
export const TODAS_SECOES: DefinicaoSecao[] = [...SECOES, ...SECOES_ADMIN];

export const PERMISSOES_PADRAO_COLABORADOR: PermissoesUsuario = Object.fromEntries(
  SECOES.map((s) => [s.codigo, { acesso: false, nivel: "leitura" as NivelAcesso }])
) as PermissoesUsuario;

export const PERMISSOES_PADRAO_ADMINISTRADOR: PermissoesUsuario = Object.fromEntries(
  TODAS_SECOES.map((s) => [s.codigo, { acesso: false, nivel: "leitura" as NivelAcesso }])
) as PermissoesUsuario;

// Remove qualquer chave de secao administrativa de um objeto de permissoes.
// Defesa em profundidade: usada no server action de colaborador comum para
// garantir que, mesmo que alguem tente enviar `equipe`/`contas`/`sige`/`metas`
// via uma requisicao manipulada, essas chaves nunca sejam persistidas para
// uma role que nao seja "administrador" ou "admin".
export function removerPermissoesAdmin(permissoes: PermissoesUsuario): PermissoesUsuario {
  const limpo = { ...permissoes };
  for (const codigo of CODIGOS_SECOES_ADMIN) {
    delete limpo[codigo];
  }
  return limpo;
}

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

// Lista de secoes operacionais (com href) que o usuario deve ver no sidebar.
// Secoes administrativas (equipe/contas/sige/metas) tem visibilidade propria
// via `secoesAdminVisiveis`.
export function secoesVisiveis(
  isAdmin: boolean,
  permissoes: PermissoesUsuario | null | undefined
): DefinicaoSecao[] {
  if (isAdmin) return SECOES;
  return SECOES.filter((s) => temAcessoSecao(isAdmin, permissoes, s.codigo));
}

// Secoes administrativas que o usuario pode ver (admin master sempre ve
// todas; administrador só as que tiverem `acesso: true`; colaborador nunca
// ve nenhuma, pois essas chaves sao removidas do seu `permissoes`).
export function secoesAdminVisiveis(
  isAdmin: boolean,
  permissoes: PermissoesUsuario | null | undefined
): DefinicaoSecao[] {
  if (isAdmin) return SECOES_ADMIN;
  return SECOES_ADMIN.filter((s) => temAcessoSecao(isAdmin, permissoes, s.codigo));
}
