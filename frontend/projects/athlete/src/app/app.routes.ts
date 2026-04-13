import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./athlete-home.component').then((m) => m.AthleteHomeComponent),
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
    path: 'painel',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./athlete-painel.component').then((m) => m.AthletePainelComponent),
  },
  {
    path: 'agenda',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./agenda/athlete-agenda.component').then((m) => m.AthleteAgendaComponent),
  },
  {
    path: 'torneios',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./tournaments/tournament-discovery.component').then(
        (m) => m.TournamentDiscoveryComponent,
      ),
  },
  {
    path: 'ligas/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./tournaments/league-detail-shell.component').then((m) => m.LeagueDetailShellComponent),
  },
  {
    path: 'torneios/:id/inscricao',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./tournaments/registration/tournament-registration-shell.component').then(
        (m) => m.TournamentRegistrationShellComponent,
      ),
  },
  {
    path: 'torneios/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./tournaments/tournament-detail-shell.component').then(
        (m) => m.TournamentDetailShellComponent,
      ),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile/athlete-profile-settings.component').then(
        (m) => m.AthleteProfileSettingsComponent,
      ),
  },
];
