// Sistema de permissoes por colaborador.
// O admin sempre tem acesso total (nao passa por essas checagens).
// Colaboradores tem um objeto `permissoes` (jsonb na tabela profiles) no formato:
// {
//   resumo: { acesso: true, nivel: "edicao" },
//   vendas: { acesso: true, nivel: "leitura" },
//   publicidade: { acesso: false, nivel: "leitura" },
//   promocoes: { acesso: false, nivel: "leitura" },
//   amazon: { acesso: false, nivel: "leitura" },
//   pos_venda: { acesso: true, nivel: "edicao", subsecoes: ["mensagens"] },
//   faturamento: { acesso: false, nivel: "leitura" },
// }
// `subsecoes` (opcional): lista de sub-abas liberadas. Se omitido/undefined,
// todas as sub-abas da secao ficam liberadas.

export type NivelAcesso = "leitura" | "edicao";

export type SubsecaoPosVenda = "perguntas" | "mensagens" | "reclamacoes";
export type SubsecaoVendas = "resumo_vendas" | "metricas_vendas" | "historico_vendas";
// Fase 11 (31/07/2026): "qualidade" - Central de Qualidade (score oficial
// do ML + status de catalogo), sub-aba de Anuncios.
export type SubsecaoAnuncios = "resumo_anuncios" | "gestao" | "criar" | "tendencias_busca" | "qualidade";
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
// 03/08/2026: "faturamento" deixou de ser uma secao unica e virou o grupo
// Financeiro (Faturamento + Margem Bruta + Custos), no mesmo padrao de
// subsecoes ja usado por vendas/anuncios/amazon/sige -- nao muda o codigo
// da secao em si (continua "faturamento", preservando as permissoes ja
// concedidas a colaboradores existentes), so passa a ter subsecoes.
export type SubsecaoFaturamento = "fat_faturamento" | "fat_margem" | "fat_custos";
// 03/08/2026 (parte 2): "estoque" ganha 3 sub-abas -- Estoque (resumo lido
// da planilha), Metricas de estoque (velocidade + risco de ruptura) e
// Containers (CRUD manual de pedidos de importacao, substitui a planilha
// "Pedidos Containers"). Mesmo padrao de faturamento/vendas/amazon/sige.
export type SubsecaoEstoque = "estoque_resumo" | "estoque_metricas" | "estoque_containers";

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
  | "estoque"
  // Fase 14 (03/08/2026): cadastro de fornecedores (independente de
  // Estoque), usado tambem para popular o seletor de fornecedor na aba
  // Containers.
  | "fornecedores"
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

// Codigo dos grupos visuais da sidebar (ver GRUPOS_SIDEBAR abaixo). Secoes
// sem `grupo` (ex: Resumo) aparecem soltas, fora de qualquer grupo, no topo.
export type CodigoGrupoSidebar =
  | "vendas_anuncios"
  | "canais"
  | "atendimento"
  | "financeiro"
  | "gestao"
  | "administracao";

export type DefinicaoSecao = {
  codigo: CodigoSecao;
  label: string;
  href: string;
  // Chave de icone, resolvida via IconeSecao (src/lib/icone-secao.tsx) em um
  // componente lucide-react. Nao e mais um emoji literal.
  icon: string;
  // Grupo visual da sidebar. Ausente = fica solto, fora de qualquer grupo.
  grupo?: CodigoGrupoSidebar;
  // `href` na subsecao e opcional: quando presente, vira um item navegavel
  // proprio no submenu do sidebar (ex: Anuncios, Amazon). Quando ausente, a
  // subsecao e usada apenas para controle de acesso dentro de uma pagina
  // unica (ex: Pos-venda, onde as 3 sub-abas convivem na mesma tela).
  subsecoes?: { codigo: string; label: string; href?: string }[];
};

// Rotulos dos grupos visuais da sidebar, na ordem em que devem aparecer.
// Reagrupamento puramente visual -- nao altera href, permissao ou nome de
// nenhuma secao.
export const GRUPOS_SIDEBAR: { codigo: CodigoGrupoSidebar; label: string }[] = [
  { codigo: "vendas_anuncios", label: "Vendas & Anúncios" },
  { codigo: "canais", label: "Canais" },
  { codigo: "atendimento", label: "Atendimento" },
  { codigo: "financeiro", label: "Financeiro" },
  { codigo: "gestao", label: "Gestão" },
  { codigo: "administracao", label: "Administração" },
];

// Fonte unica de verdade da lista de secoes do painel.
// Ao criar uma nova secao no futuro, basta adiciona-la aqui para que
// ela apareca automaticamente na tela de Configuracoes.
export const SECOES: DefinicaoSecao[] = [
  {
        codigo: "resumo",
        label: "Resumo",
        href: "/dashboard",
        icon: "Home",
        subsecoes: [
          { codigo: "resumo_geral", label: "Resumo", href: "/dashboard" },
          { codigo: "calendario", label: "Calendário", href: "/dashboard/calendario" },
              ],
  },
  {
    codigo: "vendas",
    label: "Vendas",
    href: "/dashboard/vendas",
    icon: "Receipt",
    grupo: "vendas_anuncios",
    subsecoes: [
      { codigo: "resumo_vendas", label: "Resumo", href: "/dashboard/vendas" },
      { codigo: "metricas_vendas", label: "Métricas", href: "/dashboard/vendas/metricas" },
      { codigo: "historico_vendas", label: "Histórico", href: "/dashboard/vendas/historico" },
    ],
  },
  {
    codigo: "anuncios",
    label: "Anúncios",
    href: "/dashboard/anuncios",
    icon: "ShoppingBag",
    grupo: "vendas_anuncios",
    subsecoes: [
      { codigo: "resumo_anuncios", label: "Resumo", href: "/dashboard/anuncios" },
      { codigo: "gestao", label: "Editar anúncios", href: "/dashboard/anuncios/gestao" },
      { codigo: "criar", label: "Criar anúncios", href: "/dashboard/anuncios/criar" },
      { codigo: "qualidade", label: "Central de Qualidade", href: "/dashboard/anuncios/qualidade" },
      { codigo: "tendencias_busca", label: "Tendências de busca", href: "/dashboard/anuncios/tendencias" },
    ],
  },
  {
        codigo: "publicidade",
        label: "Publicidade",
        href: "/dashboard/publicidade",
        icon: "Megaphone",
        grupo: "vendas_anuncios",
        subsecoes: [
          { codigo: "publicidade_visao_geral", label: "Visão geral", href: "/dashboard/publicidade" },
          { codigo: "publicidade_metricas_desempenho", label: "Métricas de Desempenho", href: "/dashboard/publicidade/metricas" },
              ],
  },
  { codigo: "promocoes", label: "Central de promoções", href: "/dashboard/promocoes", icon: "BadgePercent", grupo: "vendas_anuncios" },
  {
    codigo: "amazon",
    label: "Amazon",
    href: "/dashboard/amazon/vendas",
    icon: "Package",
    grupo: "canais",
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
    icon: "Headset",
    grupo: "atendimento",
    subsecoes: [
      { codigo: "perguntas", label: "Perguntas" },
      { codigo: "mensagens", label: "Mensagens" },
      { codigo: "reclamacoes", label: "Reclamações" },
    ],
  },
  {
    codigo: "faturamento",
    label: "Financeiro",
    href: "/dashboard/faturamento",
    icon: "FileText",
    grupo: "financeiro",
    // 03/08/2026: item passou a ter subsecoes -- vira automaticamente um
    // submenu no sidebar (mesmo mecanismo de vendas/anuncios/amazon, ver
    // app-sidebar.tsx). Colaboradores que ja tinham acesso a "faturamento"
    // sem `subsecoes` definido continuam vendo as 3 sub-abas normalmente
    // (temAcessoSubsecao libera tudo quando subsecoes esta vazio/ausente).
    subsecoes: [
      { codigo: "fat_faturamento", label: "Faturamento", href: "/dashboard/faturamento" },
      { codigo: "fat_margem", label: "Margem Bruta", href: "/dashboard/financeiro/margem" },
      { codigo: "fat_custos", label: "Custos", href: "/dashboard/financeiro/custos" },
    ],
  },
  {
    codigo: "concorrencia",
    label: "Concorrência",
    href: "/dashboard/concorrencia",
    icon: "Telescope",
    grupo: "vendas_anuncios",
    subsecoes: [
      { codigo: "benchmark_preco", label: "Benchmark de Preço" },
      { codigo: "mais_vendidos", label: "Mais Vendidos por Categoria" },
    ],
  },
  // Fase 12 (31/07/2026): le a planilha "CONTROLE DE ESTOQUE SIXXIS"
  // (Google Sheets, SOMENTE LEITURA) e cruza com a velocidade de venda por
  // SKU (ultimos 60 dias) para projetar risco de ruptura.
  // 03/08/2026 (parte 2): ganhou subsecoes -- Estoque (resumo), Metricas de
  // estoque (velocidade/risco) e Containers (CRUD manual de pedidos de
  // importacao, substitui a planilha externa "Pedidos Containers").
  {
    codigo: "estoque",
    label: "Estoque",
    href: "/dashboard/estoque",
    icon: "Boxes",
    grupo: "vendas_anuncios",
    subsecoes: [
      { codigo: "estoque_resumo", label: "Estoque", href: "/dashboard/estoque" },
      { codigo: "estoque_metricas", label: "Métricas de estoque", href: "/dashboard/estoque/metricas" },
      { codigo: "estoque_containers", label: "Containers", href: "/dashboard/estoque/containers" },
    ],
  },
  // Fase 14 (03/08/2026): cadastro de fornecedores, independente de
  // Estoque. Fornecedores ativos ficam selecionaveis no formulario de
  // Containers (em vez de digitar o nome manualmente a cada pedido).
  {
    codigo: "fornecedores",
    label: "Fornecedores",
    href: "/dashboard/fornecedores",
    icon: "Truck",
    grupo: "vendas_anuncios",
  },
];

// Secoes administrativas: gestao de equipe, contas ML/Amazon conectadas,
// SIGE (fechamento mensal/relatorios/historico) e metas.
// So aparecem no seletor de permissoes ao criar/editar um ADMINISTRADOR
// (nunca um colaborador comum) e so ficam visiveis no sidebar/cabecalho para
// quem tiver acesso concedido a elas (ou for o admin master).
export const SECOES_ADMIN: DefinicaoSecao[] = [
  { codigo: "equipe", label: "Configurações", href: "/dashboard/configuracoes", icon: "Settings", grupo: "administracao" },
  { codigo: "contas", label: "Contas conectadas", href: "/dashboard/contas", icon: "Link2", grupo: "administracao" },
  {
    codigo: "sige",
    label: "SIGE",
    href: "/dashboard/sige/relatorios",
    icon: "BarChart3",
    grupo: "gestao",
    subsecoes: [
      { codigo: "sige_relatorios", label: "Relatórios", href: "/dashboard/sige/relatorios" },
      { codigo: "sige_fechamento", label: "Fechamento Mensal", href: "/dashboard/sige/fechamento" },
      { codigo: "sige_historico", label: "Histórico de Desempenho", href: "/dashboard/sige/historico" },
    ],
  },
  { codigo: "metas", label: "Metas", href: "/dashboard/configuracoes/metas", icon: "Target", grupo: "gestao" },
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
