import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, type SignInResult } from './auth.service';
import { isPopupDismissed, mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';

@Component({
  selector: 'bo-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent],
  template: `
    <bo-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <header class="bo-form-header">
          <span class="bo-kicker">Entrar</span>
          <h1>Bem-vindo de volta.</h1>
          <p>Use sua conta &#64;nexago pra acessar o painel.</p>
        </header>

        @if (error(); as err) {
          <div class="bo-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <div class="bo-stack">
          <bo-field
            label="E-mail"
            type="email"
            placeholder="voce@nexago.com"
            autocomplete="email"
            formControlName="email"
            [error]="emailError()"
          />
          <bo-field
            label="Senha"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            formControlName="password"
            [error]="passwordError()"
          />
        </div>

        <div class="bo-row-end">
          <a class="bo-text-link" routerLink="/entrar/recuperar">Esqueceu a senha?</a>
        </div>

        <button class="bo-btn-primary" type="submit" [disabled]="loading()">
          @if (loading()) {
            <span class="bo-spinner" aria-hidden="true"></span>
            Entrando…
          } @else {
            Entrar
          }
        </button>

        <div class="bo-divider"><span>ou</span></div>

        <div class="bo-stack-sm">
          <button type="button" class="bo-btn-sso" [disabled]="loading()" (click)="loginWith('google')">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
            </svg>
            Continuar com Google
          </button>
          <button type="button" class="bo-btn-sso" [disabled]="loading()" (click)="loginWith('apple')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--nx-text)" aria-hidden="true">
              <path d="M17.05 12.04c-.03-2.96 2.42-4.38 2.53-4.45-1.38-2.02-3.53-2.3-4.29-2.33-1.83-.19-3.57 1.08-4.5 1.08-.94 0-2.36-1.05-3.88-1.02-2 .03-3.84 1.16-4.87 2.95-2.08 3.6-.53 8.93 1.49 11.86.99 1.43 2.16 3.04 3.69 2.99 1.48-.06 2.04-.96 3.83-.96 1.79 0 2.29.96 3.86.93 1.59-.03 2.6-1.46 3.57-2.9 1.13-1.66 1.6-3.27 1.62-3.36-.04-.02-3.11-1.19-3.15-4.79zM14.32 3.65c.82-.99 1.37-2.37 1.22-3.75-1.18.05-2.61.79-3.45 1.78-.75.87-1.41 2.27-1.23 3.62 1.31.1 2.65-.66 3.46-1.65z" />
            </svg>
            Continuar com Apple
          </button>
        </div>

        <p class="bo-fine">
          Acesso por convite. Sem conta? <strong>Fale com um admin.</strong>
        </p>
      </form>
    </bo-auth-shell>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected emailError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.form.controls.email;
    if (control.hasError('required')) {
      return 'Informe o e-mail.';
    }
    if (control.hasError('email')) {
      return 'E-mail inválido.';
    }
    return null;
  }

  protected passwordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.form.controls.password.hasError('required') ? 'Informe a senha.' : null;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      this.afterSignIn(await this.auth.signInWithEmail(email, password));
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected async loginWith(provider: 'google' | 'apple'): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      const result =
        provider === 'google'
          ? await this.auth.signInWithGoogle()
          : await this.auth.signInWithApple();
      this.afterSignIn(result);
    } catch (err) {
      if (!isPopupDismissed(err)) {
        this.error.set(mapFirebaseAuthError(err));
      }
    } finally {
      this.loading.set(false);
    }
  }

  private afterSignIn(result: SignInResult): void {
    if (result === 'mfa') {
      void this.router.navigate(['/entrar/verificacao'], { queryParamsHandling: 'preserve' });
      return;
    }
    this.redirectAfterLogin();
  }

  private redirectAfterLogin(): void {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/painel';
    void this.router.navigateByUrl(target);
  }
}
