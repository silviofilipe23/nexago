import { Routes } from '@angular/router';
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
    path: 'painel',
    title: 'Painel — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/home/panel-home.component').then((m) => m.PanelHomeComponent),
  },
  {
    path: 'painel/agenda',
    title: 'Agenda — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/agenda/panel-agenda.component').then((m) => m.PanelAgendaComponent),
  },
  {
    path: 'painel/financeiro',
    title: 'Financeiro — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/finance/panel-finance.component').then((m) => m.PanelFinanceComponent),
  },
  {
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/tournaments/panel-tournaments.component').then((m) => m.PanelTournamentsComponent),
  },
  {
    path: 'painel/quadras',
    title: 'Quadras — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/courts/panel-courts.component').then((m) => m.PanelCourtsComponent),
  },
  {
    path: 'painel/equipe',
    title: 'Equipe — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/team/panel-team.component').then((m) => m.PanelTeamComponent),
  },
  {
    path: 'painel/perfil',
    title: 'Perfil — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/profile/panel-profile.component').then((m) => m.PanelProfileComponent),
  },
  { path: '**', redirectTo: '' },
];
