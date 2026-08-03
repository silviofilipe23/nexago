import { Routes } from '@angular/router';
import { arenaAreaGuard, arenaOwnerGuard } from './auth/arena-area.guard';
import { arenaSelectionGuard } from './auth/arena-selection.guard';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Arena',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Arena',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Arena',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Arena',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar arena — NexaGO Arena',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel/selecionar-arena',
    title: 'Selecionar arena — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/arena-selection/panel-arena-selection.component').then(
        (m) => m.PanelArenaSelectionComponent,
      ),
  },
  {
    path: 'painel',
    title: 'Painel — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard],
    loadComponent: () =>
      import('./painel/home/panel-home.component').then((m) => m.PanelHomeComponent),
  },
  {
    path: 'painel/agenda',
    title: 'Agenda — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/agenda/panel-agenda.component').then((m) => m.PanelAgendaComponent),
  },
  {
    path: 'painel/reservas',
    title: 'Reservas — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/bookings/panel-bookings.component').then((m) => m.PanelBookingsComponent),
  },
  {
    path: 'painel/reservas/:id',
    title: 'Detalhe da reserva — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/bookings/panel-booking-detail.component').then(
        (m) => m.PanelBookingDetailComponent,
      ),
  },
  {
    path: 'painel/horarios-fixos',
    title: 'Horários fixos — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/recurring/panel-recurring.component').then((m) => m.PanelRecurringComponent),
  },
  {
    path: 'painel/clubinho',
    title: 'Clubinho — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/clubinho/panel-clubs.component').then((m) => m.PanelClubsComponent),
  },
  {
    path: 'painel/clubinho/novo',
    title: 'Novo clubinho — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/clubinho/panel-club-form.component').then((m) => m.PanelClubFormComponent),
  },
  {
    path: 'painel/clubinho/:clubId/editar',
    title: 'Editar clubinho — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/clubinho/panel-club-form.component').then((m) => m.PanelClubFormComponent),
  },
  {
    path: 'painel/clubinho/:clubId/sessao/:sessionId',
    title: 'Sessão do clubinho — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/clubinho/panel-club-session.component').then(
        (m) => m.PanelClubSessionComponent,
      ),
  },
  {
    path: 'painel/clubinho/:clubId',
    title: 'Clubinho — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('agenda')],
    loadComponent: () =>
      import('./painel/clubinho/panel-club-detail.component').then(
        (m) => m.PanelClubDetailComponent,
      ),
  },
  {
    path: 'painel/financeiro',
    title: 'Financeiro — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('financeiro')],
    loadComponent: () =>
      import('./painel/finance/panel-finance.component').then((m) => m.PanelFinanceComponent),
  },
  {
    path: 'painel/financeiro/relatorios',
    title: 'Relatórios — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('financeiro')],
    loadComponent: () =>
      import('./painel/finance/panel-finance-reports.component').then(
        (m) => m.PanelFinanceReportsComponent,
      ),
  },
  {
    path: 'painel/comandas',
    title: 'Comandas — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('comandas')],
    loadComponent: () =>
      import('./painel/orders/panel-orders.component').then((m) => m.PanelOrdersComponent),
  },
  {
    path: 'painel/comandas/:id',
    title: 'Comanda — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('comandas')],
    loadComponent: () =>
      import('./painel/orders/panel-order-detail.component').then(
        (m) => m.PanelOrderDetailComponent,
      ),
  },
  {
    path: 'painel/estoque',
    title: 'Estoque — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('estoque')],
    loadComponent: () =>
      import('./painel/stock/panel-stock.component').then((m) => m.PanelStockComponent),
  },
  {
    path: 'painel/estoque/novo',
    title: 'Novo produto — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('estoque')],
    loadComponent: () =>
      import('./painel/stock/panel-stock-form.component').then((m) => m.PanelStockFormComponent),
  },
  {
    path: 'painel/estoque/:id/editar',
    title: 'Produto — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('estoque')],
    loadComponent: () =>
      import('./painel/stock/panel-stock-detail.component').then(
        (m) => m.PanelStockDetailComponent,
      ),
  },
  {
    path: 'painel/promocoes',
    title: 'Promoções — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/promotions/panel-promotions.component').then((m) => m.PanelPromotionsComponent),
  },
  {
    path: 'painel/promocoes/nova',
    title: 'Nova promoção — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/promotions/panel-promotion-form.component').then(
        (m) => m.PanelPromotionFormComponent,
      ),
  },
  {
    path: 'painel/promocoes/:id/editar',
    title: 'Editar promoção — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/promotions/panel-promotion-form.component').then(
        (m) => m.PanelPromotionFormComponent,
      ),
  },
  {
    path: 'painel/horarios-pico',
    title: 'Horários de pico — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/peak-rules/panel-peak-rules.component').then((m) => m.PanelPeakRulesComponent),
  },
  {
    path: 'painel/horarios-pico/nova',
    title: 'Nova regra de pico — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/peak-rules/panel-peak-rule-form.component').then(
        (m) => m.PanelPeakRuleFormComponent,
      ),
  },
  {
    path: 'painel/horarios-pico/:id/editar',
    title: 'Editar regra de pico — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/peak-rules/panel-peak-rule-form.component').then(
        (m) => m.PanelPeakRuleFormComponent,
      ),
  },
  {
    path: 'painel/cupons',
    title: 'Cupons — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/coupons/panel-coupons.component').then((m) => m.PanelCouponsComponent),
  },
  {
    path: 'painel/cupons/novo',
    title: 'Novo cupom — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
    loadComponent: () =>
      import('./painel/coupons/panel-coupon-form.component').then((m) => m.PanelCouponFormComponent),
  },
  {
    path: 'painel/links',
    title: 'Links — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('site')],
    loadComponent: () =>
      import('./painel/links/panel-links.component').then((m) => m.PanelLinksComponent),
  },
  {
    path: 'painel/meu-site',
    title: 'Meu site — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('site')],
    loadComponent: () =>
      import('./painel/site/panel-site.component').then((m) => m.PanelSiteComponent),
  },
  {
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('torneios')],
    loadComponent: () =>
      import('./painel/tournaments/panel-tournaments.component').then((m) => m.PanelTournamentsComponent),
  },
  {
    path: 'painel/quadras',
    title: 'Quadras — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('quadras')],
    loadComponent: () =>
      import('./painel/courts/panel-courts.component').then((m) => m.PanelCourtsComponent),
  },
  {
    path: 'painel/quadras/nova',
    title: 'Nova quadra — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('quadras')],
    loadComponent: () =>
      import('./painel/courts/panel-court-form.component').then((m) => m.PanelCourtFormComponent),
  },
  {
    path: 'painel/quadras/:id/editar',
    title: 'Editar quadra — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('quadras')],
    loadComponent: () =>
      import('./painel/courts/panel-court-form.component').then((m) => m.PanelCourtFormComponent),
  },
  {
    path: 'painel/relatorios/ocupacao',
    title: 'Ocupação — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('financeiro')],
    loadComponent: () =>
      import('./painel/reports/panel-occupancy-report.component').then(
        (m) => m.PanelOccupancyReportComponent,
      ),
  },
  {
    path: 'painel/avaliacoes',
    title: 'Avaliações — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('comunidade')],
    loadComponent: () =>
      import('./painel/reviews/panel-reviews.component').then((m) => m.PanelReviewsComponent),
  },
  {
    path: 'painel/seguidores',
    title: 'Seguidores — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('comunidade')],
    loadComponent: () =>
      import('./painel/followers/panel-followers.component').then((m) => m.PanelFollowersComponent),
  },
  {
    path: 'painel/ranking',
    title: 'Ranking de clientes — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('comunidade')],
    loadComponent: () =>
      import('./painel/ranking/panel-ranking.component').then((m) => m.PanelRankingComponent),
  },
  {
    path: 'painel/equipe',
    title: 'Equipe — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaOwnerGuard],
    loadComponent: () =>
      import('./painel/team/panel-team.component').then((m) => m.PanelTeamComponent),
  },
  {
    path: 'painel/planos',
    title: 'Planos — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaOwnerGuard],
    loadComponent: () => import('./painel/plans/panel-plans.component').then((m) => m.PanelPlansComponent),
  },
  {
    path: 'painel/perfil',
    title: 'Perfil — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('perfil')],
    loadComponent: () =>
      import('./painel/profile/panel-profile.component').then((m) => m.PanelProfileComponent),
  },
  {
    path: 'painel/perfil/horarios',
    title: 'Horários de funcionamento — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('perfil')],
    loadComponent: () =>
      import('./painel/profile/panel-profile-hours.component').then(
        (m) => m.PanelProfileHoursComponent,
      ),
  },
  {
    path: 'painel/perfil/contatos',
    title: 'Contatos da arena — NexaGO Arena',
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('perfil')],
    loadComponent: () =>
      import('./painel/profile/panel-profile-contacts.component').then(
        (m) => m.PanelProfileContactsComponent,
      ),
  },
  {
    path: 'convite/:inviteId',
    title: 'Convite de equipe — NexaGO Arena',
    loadComponent: () =>
      import('./auth/accept-invite.component').then((m) => m.AcceptInviteComponent),
  },
  { path: '**', redirectTo: '' },
];
