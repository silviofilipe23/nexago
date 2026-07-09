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
    path: 'atletas/:handle',
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
];
