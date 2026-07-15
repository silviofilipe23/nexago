import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';

@Component({
  selector: 'og-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent],
  template: `
    <og-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <header class="og-form-header">
          <span class="og-kicker">Entrar</span>
          <h1>Acesse seu painel.</h1>
          <p>Entre com a conta do organizador pra gerenciar torneios e ligas.</p>
        </header>

        @if (error(); as err) {
          <div class="og-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <div class="og-stack">
          <og-field
            label="E-mail"
            type="email"
            placeholder="voce@email.com"
            autocomplete="email"
            formControlName="email"
            [error]="emailError()"
          />
          <og-field
            label="Senha"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            formControlName="password"
            [error]="passwordError()"
          />
        </div>

        <div class="og-row-between">
          <label class="og-remember">
            <input
              type="checkbox"
              class="og-checkbox-input"
              formControlName="remember"
            />
            <span class="og-checkbox-box" aria-hidden="true">
              @if (rememberValue()) {
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              }
            </span>
            Manter conectado
          </label>
          <a class="og-text-link" routerLink="/entrar/recuperar">Esqueceu a senha?</a>
        </div>

        <button class="og-btn-primary" type="submit" [disabled]="loading()">
          @if (loading()) {
            <span class="og-spinner" aria-hidden="true"></span>
            Entrando…
          } @else {
            Entrar no painel
          }
        </button>

        <p class="og-fine">
          Ainda não tem conta? <a class="og-text-link" routerLink="/cadastro">Cadastrar como organizador</a>
        </p>
      </form>
    </og-auth-shell>
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
    remember: [true],
  });

  protected readonly rememberValue = toSignal(this.form.controls.remember.valueChanges, {
    initialValue: true,
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
      const { email, password, remember } = this.form.getRawValue();
      await this.auth.signInWithEmail(email, password, remember);
      this.redirectAfterLogin();
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }

  private redirectAfterLogin(): void {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/painel';
    void this.router.navigateByUrl(target);
  }
}
