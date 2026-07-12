import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { coachGuard } from './auth/coach.guard';

@Component({
  selector: 'app-painel-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="font-family: system-ui; padding: 24px; color: #F4F4F5; background: #050505; min-height: 100dvh; margin: 0;">Painel do treinador — em construção.</p>`,
})
class PainelPlaceholderComponent {}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Treinador',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Treinador',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Treinador',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Treinador',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar treinador — NexaGO Treinador',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel',
    title: 'Painel — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    component: PainelPlaceholderComponent,
  },
  { path: '**', redirectTo: '' },
];
