import { type Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { onboardingGuard } from './auth/onboarding.guard';
import { staffGuard } from './auth/staff.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'entrar',
  },
  {
    path: 'atletas',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./atletas/athlete-directory.component').then((m) => m.AthleteDirectoryComponent),
  },
  {
    // Link de perfil compartilhado. Exige login porque as rules de `public_profiles` só
    // liberam leitura autenticada (anti-scraping) — sem o guard, o visitante deslogado
    // tomava permission-denied e via o card "LINK INVÁLIDO / PERFIL_404" em vez do login.
    // Sem `onboardingGuard` de propósito: quem se cadastra pelo link volta direto ao perfil.
    path: 'atletas/:handle',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile/athlete-public-profile.component').then(
        (m) => m.AthletePublicProfileComponent,
      ),
  },
  {
    path: 'entrar',
    loadComponent: () =>
      import('./login/athlete-login.component').then((m) => m.AthleteLoginComponent),
  },
  {
    path: 'cadastro',
    loadComponent: () =>
      import('./register/athlete-register.component').then((m) => m.AthleteRegisterComponent),
  },
  {
    path: 'esqueci-senha',
    loadComponent: () =>
      import('./auth/forgot-password/athlete-forgot-password.component').then(
        (m) => m.AthleteForgotPasswordComponent,
      ),
  },
  {
    path: 'email-enviado',
    loadComponent: () =>
      import('./auth/reset-sent/athlete-reset-sent.component').then(
        (m) => m.AthleteResetSentComponent,
      ),
  },
  {
    path: 'redefinir-senha',
    loadComponent: () =>
      import('./auth/reset-password/athlete-reset-password.component').then(
        (m) => m.AthleteResetPasswordComponent,
      ),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./onboarding/athlete-onboarding.component').then(
        (m) => m.AthleteOnboardingComponent,
      ),
  },
  {
    // Confirmação da vaga NOMINAL. Vem ANTES da rota com token para 'pessoal' não ser lido
    // como um. `/vaga/**` não é reivindicado como App Link por nenhuma plataforma — é o que
    // faz o link abrir no navegador em vez de cair no app publicado, que bloqueia a categoria
    // lotada antes de consultar o servidor.
    path: 'vaga/pessoal',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/spot-pass/spot-pass-personal.component').then(
        (m) => m.SpotPassPersonalComponent,
      ),
  },
  {
    // Resgate de vaga liberada por link. O id É o token; quem abre precisa estar logado, e o
    // `authGuard` traz de volta para cá depois do login.
    path: 'vaga/:linkId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/spot-pass/spot-pass-claim.component').then(
        (m) => m.SpotPassClaimComponent,
      ),
  },
  {
    path: 'painel',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./athlete-painel.component').then((m) => m.AthletePainelComponent),
  },
  {
    // Meu cashback: abre mesmo com o recurso desligado (o saldo já ganho segue visível). Sem item
    // de menu — chega-se pelo card do painel e pelo `webUrl: '/cashback'` dos pushes.
    path: 'cashback',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./cashback/athlete-cashback.component').then((m) => m.AthleteCashbackComponent),
  },
  {
    path: 'agenda',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./agenda/athlete-agenda.component').then((m) => m.AthleteAgendaComponent),
  },
  {
    path: 'agenda/reserva/:bookingId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./agenda/booking-detail/athlete-booking-detail.component').then(
        (m) => m.AthleteBookingDetailComponent,
      ),
  },
  {
    path: 'reservar',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/athlete-reservar.component').then((m) => m.AthleteReservarComponent),
  },
  {
    path: 'reservar/:arenaId/agendar/pagamento/confirmada',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-booking-confirmed.component').then(
        (m) => m.ArenaBookingConfirmedComponent,
      ),
  },
  {
    path: 'reservar/:arenaId/agendar/pagamento',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-payment.component').then((m) => m.ArenaPaymentComponent),
  },
  {
    path: 'reservar/:arenaId/agendar',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-booking.component').then((m) => m.ArenaBookingComponent),
  },
  {
    path: 'clubinho',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./clubinho/clubinho-hub.component').then((m) => m.ClubinhoHubComponent),
  },
  {
    path: 'reservar/:arenaId/clubinho/:sessionId/pagamento',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./clubinho/club-session-payment.component').then((m) => m.ClubSessionPaymentComponent),
  },
  {
    path: 'reservar/:arenaId/clubinho/:sessionId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./clubinho/club-session-detail.component').then((m) => m.ClubSessionDetailComponent),
  },
  {
    path: 'reservar/:arenaId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-detail.component').then((m) => m.ArenaDetailComponent),
  },
  {
    path: 'ranking',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./ranking/athlete-ranking.component').then((m) => m.AthleteRankingComponent),
  },
  {
    path: 'historico',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./history/athlete-history.component').then((m) => m.AthleteHistoryComponent),
  },
  {
    path: 'equipes',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./equipes/athlete-equipes.component').then((m) => m.AthleteEquipesComponent),
  },
  {
    path: 'equipes/:teamId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./equipes/team-public-profile.component').then((m) => m.TeamPublicProfileComponent),
  },
  {
    path: 'competir',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./competir/competir-hub.component').then((m) => m.CompetirHubComponent),
  },
  {
    // Operação do mesário (e do gestor) — os torneios em que ELE é equipe, não em que joga.
    // O `staffGuard` só evita tela vazia por link solto; quem autoriza a escrita são as rules
    // (`canScoreTournament`) e o `assertCanScoreTournament` dos callables.
    path: 'mesa',
    canActivate: [authGuard, onboardingGuard, staffGuard],
    loadComponent: () => import('./mesa/mesa-tournaments.component').then((m) => m.MesaTournamentsComponent),
  },
  {
    path: 'mesa/:tournamentId/partida/:matchId',
    canActivate: [authGuard, onboardingGuard, staffGuard],
    loadComponent: () => import('./mesa/mesa-live.component').then((m) => m.MesaLiveComponent),
  },
  {
    path: 'mesa/:tournamentId',
    canActivate: [authGuard, onboardingGuard, staffGuard],
    loadComponent: () => import('./mesa/mesa-matches.component').then((m) => m.MesaMatchesComponent),
  },
  {
    path: 'notificacoes',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./notificacoes/athlete-notifications.component').then(
        (m) => m.AthleteNotificationsComponent,
      ),
  },
  {
    path: 'comunidade',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./comunidade/athlete-community.component').then((m) => m.AthleteCommunityComponent),
  },
  {
    path: 'bora-jogar',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./bora-jogar/bora-jogar.component').then((m) => m.BoraJogarComponent),
  },
  {
    path: 'torneios',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/tournament-discovery.component').then(
        (m) => m.TournamentDiscoveryComponent,
      ),
  },
  {
    path: 'ligas/:id',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/league-detail-shell.component').then((m) => m.LeagueDetailShellComponent),
  },
  {
    // Wizard de inscrição: uma rota por etapa. A árvore (e por que a rota-mãe é componentless)
    // mora em `registration-wizard.routes.ts`, carregada sob demanda junto com o store.
    path: 'torneios/:id/inscricao',
    canActivate: [authGuard, onboardingGuard],
    loadChildren: () =>
      import('./tournaments/registration/wizard/registration-wizard.routes').then(
        (m) => m.registrationWizardRoutes,
      ),
  },
  {
    // Casca de abas, partida e Focus dividem um único `TournamentLiveStore` — a árvore mora em
    // `tournament.routes.ts`, carregada sob demanda junto com o store.
    path: 'torneios/:id',
    canActivate: [authGuard, onboardingGuard],
    loadChildren: () => import('./tournaments/tournament.routes').then((m) => m.tournamentRoutes),
  },
  {
    path: 'perfil',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./profile/athlete-profile-settings.component').then(
        (m) => m.AthleteProfileSettingsComponent,
      ),
  },
  {
    path: 'perfil/esportes',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./profile/athlete-sports-levels.component').then(
        (m) => m.AthleteSportsLevelsComponent,
      ),
  },
  // Fallback: URL desconhecida cai no painel (deslogado, o authGuard manda pro login).
  { path: '**', redirectTo: 'painel' },
];
