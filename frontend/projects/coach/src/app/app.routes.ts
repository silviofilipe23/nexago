import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { coachGuard } from './auth/coach.guard';
import { PanelShellComponent } from './painel/ui/panel-shell.component';

@Component({
  selector: 'app-painel-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent],
  template: `
    <co-panel-shell>
      <p style="font-family: system-ui; padding: 24px; color: var(--nx-text-dim);">Início — em construção (Task 17).</p>
    </co-panel-shell>
  `,
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
