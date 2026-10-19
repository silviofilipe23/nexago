import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

/**
 * Pergunta antes de sair com alteração não salva (produto, entrada de estoque).
 * Estrutural: não importa o componente, para a tela continuar lazy.
 */
const leaveWithConfirm = (c: { canLeave(): boolean | Promise<boolean> }) => c.canLeave();

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Backoffice',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/verificacao',
    title: 'Verificação em 2 etapas — NexaGO Backoffice',
    loadComponent: () => import('./auth/two-factor.component').then((m) => m.TwoFactorComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Backoffice',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Backoffice',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Backoffice',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'convite',
    title: 'Criar conta — NexaGO Backoffice',
    loadComponent: () => import('./auth/invite.component').then((m) => m.InviteComponent),
  },
  {
    path: 'painel',
    title: 'Painel — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () => import('./painel/home/panel-home.component').then((m) => m.PanelHomeComponent),
  },
  {
    path: 'painel/arenas',
    title: 'Arenas — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/arenas/panel-arenas.component').then((m) => m.PanelArenasComponent),
  },
  {
    path: 'painel/arenas/pre-cadastro',
    title: 'Arenas pré-cadastradas — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/arenas/panel-unclaimed-arenas.component').then(
        (m) => m.PanelUnclaimedArenasComponent,
      ),
  },
  {
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/torneios/panel-torneios.component').then((m) => m.PanelTorneiosComponent),
  },
  {
    path: 'painel/torneios/planos',
    title: 'Planos de torneio — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/torneios/planos/panel-planos.component').then((m) => m.PanelPlanosComponent),
  },
  {
    // `novo` = plano novo; depois de salvar a URL troca para o id.
    path: 'painel/torneios/planos/:id',
    title: 'Editar plano — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/torneios/planos/editar/plan-editor.component').then((m) => m.PlanEditorComponent),
  },
  {
    path: 'painel/torneios/contratos',
    title: 'Contratos de plano — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/torneios/contratos/panel-contratos.component').then((m) => m.PanelContratosComponent),
  },
  {
    path: 'painel/torneios/contratos/:id',
    title: 'Contrato de plano — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/torneios/contratos/contrato-detail.component').then((m) => m.ContratoDetailComponent),
  },
  {
    path: 'painel/torneios/sponsors',
    title: 'NexaGO Sponsors — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/torneios/sponsors/panel-sponsors.component').then((m) => m.PanelSponsorsComponent),
  },
  {
    path: 'painel/avaliacoes',
    title: 'Avaliações de torneios — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/panel-avaliacoes.component').then((m) => m.PanelAvaliacoesComponent),
  },
  {
    path: 'painel/avaliacoes/:id',
    title: 'Avaliações do torneio — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/avaliacao-torneio.component').then((m) => m.AvaliacaoTorneioComponent),
  },
  {
    path: 'painel/organizadores',
    title: 'Organizadores — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/organizadores/panel-organizadores.component').then(
        (m) => m.PanelOrganizadoresComponent,
      ),
  },
  {
    path: 'painel/organizadores/promover',
    title: 'Promover atleta — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/organizadores/promover-atleta.component').then((m) => m.PromoverAtletaComponent),
  },
  {
    path: 'painel/organizadores/solicitacoes/:id',
    title: 'Analisar solicitação — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/organizadores/analisar-solicitacao.component').then(
        (m) => m.AnalisarSolicitacaoComponent,
      ),
  },
  {
    path: 'painel/financeiro',
    title: 'Financeiro — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/financeiro/panel-financeiro.component').then((m) => m.PanelFinanceiroComponent),
  },
  {
    path: 'painel/atletas',
    title: 'Atletas — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/atletas/panel-atletas.component').then((m) => m.PanelAtletasComponent),
  },
  {
    path: 'painel/equipe',
    title: 'Equipe — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/equipe/panel-equipe.component').then((m) => m.PanelEquipeComponent),
  },
  { path: 'painel/loja', pathMatch: 'full', redirectTo: 'painel/loja/visao-geral' },
  {
    path: 'painel/loja/visao-geral',
    title: 'Loja — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/visao-geral/panel-visao-geral.component').then((m) => m.PanelVisaoGeralComponent),
  },
  {
    path: 'painel/loja/pedidos',
    title: 'Pedidos — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/pedidos/panel-pedidos.component').then((m) => m.PanelPedidosComponent),
  },
  {
    path: 'painel/loja/pedidos/:id',
    title: 'Pedido — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/pedidos/detalhe/order-detail.component').then((m) => m.OrderDetailComponent),
  },
  {
    path: 'painel/loja/produtos',
    title: 'Produtos — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/produtos/panel-produtos.component').then(
        (m) => m.PanelProdutosComponent,
      ),
  },
  {
    path: 'painel/loja/estoque/entrada/nova',
    title: 'Registrar entrada — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/loja/estoque/entrada/stock-entry.component').then((m) => m.StockEntryComponent),
  },
  {
    path: 'painel/loja/estoque/entrada/:id',
    title: 'Registrar entrada — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/loja/estoque/entrada/stock-entry.component').then((m) => m.StockEntryComponent),
  },
  {
    path: 'painel/loja/estoque/transferencia/nova',
    title: 'Nova transferência — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/estoque/transferencia/stock-transfer.component').then((m) => m.StockTransferComponent),
  },
  {
    path: 'painel/loja/estoque/transferencia/:id',
    title: 'Transferência — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/estoque/transferencia/stock-transfer.component').then((m) => m.StockTransferComponent),
  },
  {
    path: 'painel/loja/trocas',
    title: 'Trocas & devoluções — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/trocas/panel-trocas.component').then((m) => m.PanelTrocasComponent),
  },
  {
    path: 'painel/loja/estoque',
    title: 'Estoque — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/estoque/panel-estoque.component').then((m) => m.PanelEstoqueComponent),
  },
  {
    path: 'painel/loja/produtos/novo',
    title: 'Novo produto — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/loja/produtos/editar/product-edit.component').then((m) => m.ProductEditComponent),
  },
  {
    path: 'painel/loja/produtos/:id/personalizacao',
    title: 'Personalização do produto — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/loja/produtos/personalizacao/product-customization.component').then(
        (m) => m.ProductCustomizationComponent,
      ),
  },
  {
    path: 'painel/loja/produtos/:id',
    title: 'Editar produto — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/loja/produtos/editar/product-edit.component').then((m) => m.ProductEditComponent),
  },
  {
    path: 'painel/loja/retirada',
    title: 'Retirada & frete — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/retirada/panel-retirada.component').then(
        (m) => m.PanelRetiradaComponent,
      ),
  },
  {
    path: 'painel/loja/personalizados',
    title: 'Personalizados — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/personalizados/panel-personalizados.component').then(
        (m) => m.PanelPersonalizadosComponent,
      ),
  },
  {
    path: 'painel/loja/cupons',
    title: 'Cupons & promoções — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/cupons/panel-cupons.component').then((m) => m.PanelCuponsComponent),
  },
  {
    path: 'painel/loja/avaliacoes',
    title: 'Avaliações da Loja — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/avaliacoes/panel-loja-avaliacoes.component').then((m) => m.PanelLojaAvaliacoesComponent),
  },
  {
    path: 'painel/loja/campanhas',
    title: 'Campanhas — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/loja/campanhas/panel-campanhas.component').then((m) => m.PanelCampanhasComponent),
  },
  { path: 'painel/squad', pathMatch: 'full', redirectTo: 'painel/squad/visao-geral' },
  {
    path: 'painel/squad/visao-geral',
    title: 'NexaGO Squad — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/squad/visao-geral/panel-visao-geral.component').then((m) => m.PanelVisaoGeralComponent),
  },
  {
    path: 'painel/squad/embaixadores',
    title: 'Embaixadores — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/squad/embaixadores/panel-embaixadores.component').then((m) => m.PanelEmbaixadoresComponent),
  },
  {
    path: 'painel/squad/embaixadores/:uid',
    title: 'Perfil do embaixador — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () => import('./painel/squad/perfil/panel-perfil.component').then((m) => m.PanelPerfilComponent),
  },
  {
    path: 'painel/squad/candidaturas',
    title: 'Candidaturas & convites — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/squad/candidaturas/panel-candidaturas.component').then((m) => m.PanelCandidaturasComponent),
  },
  {
    path: 'painel/squad/comissoes',
    title: 'Comissões — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/squad/comissoes/panel-comissoes.component').then((m) => m.PanelComissoesComponent),
  },
  {
    path: 'painel/squad/niveis-regras',
    title: 'Níveis & regras — NexaGO Backoffice',
    canActivate: [authGuard],
    canDeactivate: [leaveWithConfirm],
    loadComponent: () =>
      import('./painel/squad/niveis-regras/panel-niveis-regras.component').then(
        (m) => m.PanelNiveisRegrasComponent,
      ),
  },
  {
    path: 'painel/perfil',
    title: 'Meu perfil — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/profile/panel-profile.component').then((m) => m.PanelProfileComponent),
  },
  { path: '**', redirectTo: '' },
];
