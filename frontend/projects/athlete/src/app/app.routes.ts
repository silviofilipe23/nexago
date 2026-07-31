import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { onboardingGuard } from './auth/onboarding.guard';

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
    path: 'painel',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./athlete-painel.component').then((m) => m.AthletePainelComponent),
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
    path: 'torneios/:id/chaves',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/tournament-brackets.component').then(
        (m) => m.TournamentBracketsComponent,
      ),
  },
  {
    path: 'torneios/:id/inscricao/pagamento',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/registration/tournament-payment.component').then(
        (m) => m.TournamentPaymentComponent,
      ),
  },
  {
    path: 'torneios/:id/inscricao',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/registration/tournament-registration-shell.component').then(
        (m) => m.TournamentRegistrationShellComponent,
      ),
  },
  {
    path: 'torneios/:id',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/tournament-detail-shell.component').then(
        (m) => m.TournamentDetailShellComponent,
      ),
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
