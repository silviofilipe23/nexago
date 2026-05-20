import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/user-disabled':
      return 'Esta conta foi desativada.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Tente novamente em instantes.';
    case 'auth/network-request-failed':
      return 'Falha de rede. Verifique sua conexão.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login com Google cancelado.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou o popup. Permita popups para este site.';
    case 'auth/backoffice-access-denied':
      return 'Sua conta não tem acesso ao backoffice.';
    default:
      return 'Não foi possível entrar. Tente de novo.';
  }
}

function errorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code?: string }).code);
  }
  return '';
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required, Validators.minLength(6)]),
  });

  protected async onSubmit(): Promise<void> {
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);

    try {
      await this.auth.signIn(email, password);
      await this.router.navigateByUrl(this.auth.defaultRouteAfterLogin());
    } catch (err: unknown) {
      this.errorMessage.set(authErrorMessage(errorCode(err)));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async onGoogleSignIn(): Promise<void> {
    this.errorMessage.set(null);
    this.submitting.set(true);

    try {
      await this.auth.signInWithGoogle();
      await this.router.navigateByUrl(this.auth.defaultRouteAfterLogin());
    } catch (err: unknown) {
      this.errorMessage.set(authErrorMessage(errorCode(err)));
    } finally {
      this.submitting.set(false);
    }
  }
}
