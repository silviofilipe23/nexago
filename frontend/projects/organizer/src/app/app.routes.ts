import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { organizerGuard } from './auth/organizer.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Organizador',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Organizador',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Organizador',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Organizador',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar organizador — NexaGO Organizador',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel',
    canActivate: [authGuard, organizerGuard],
    loadComponent: () => import('./painel/panel-shell.component').then((m) => m.PanelShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Início — NexaGO Organizador',
        loadComponent: () => import('./painel/inicio/panel-inicio.component').then((m) => m.PanelInicioComponent),
      },
      {
        path: 'torneios',
        title: 'Torneios — NexaGO Organizador',
        loadComponent: () => import('./painel/torneios/panel-torneios.component').then((m) => m.PanelTorneiosComponent),
      },
      {
        path: 'torneios/:id',
        title: 'Torneio — NexaGO Organizador',
        loadComponent: () => import('./painel/torneios/torneio-detail.component').then((m) => m.TorneioDetailComponent),
      },
      {
        path: 'ligas',
        title: 'Ligas — NexaGO Organizador',
        loadComponent: () => import('./painel/ligas/panel-ligas.component').then((m) => m.PanelLigasComponent),
      },
      {
        path: 'ligas/:id',
        title: 'Liga — NexaGO Organizador',
        loadComponent: () => import('./painel/ligas/liga-detail.component').then((m) => m.LigaDetailComponent),
      },
      {
        path: 'financeiro',
        title: 'Financeiro — NexaGO Organizador',
        loadComponent: () => import('./painel/financeiro/panel-financeiro.component').then((m) => m.PanelFinanceiroComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
