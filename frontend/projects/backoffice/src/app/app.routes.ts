import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

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
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/torneios/panel-torneios.component').then((m) => m.PanelTorneiosComponent),
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
