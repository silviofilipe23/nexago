import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { validRedirect } from './invite-redirect';
import { FieldComponent } from './ui/field.component';

@Component({
  selector: 'ct-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent],
  template: `
    <ct-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <header class="ct-form-header">
          <span class="ct-kicker">Entrar</span>
          <h1>Acesse seu centro.</h1>
          <p>Use a mesma conta NexaGO dos torneios. Agenda, alunos e financeiro ficam separados por centro.</p>
        </header>

        @if (error(); as err) {
          <div class="ct-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <button class="ct-btn-social" type="button" [disabled]="busy()" (click)="signInWithGoogle()">
          @if (googleLoading()) {
            <span class="ct-spinner" aria-hidden="true"></span>
            Entrando…
          } @else {
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
            </svg>
            Continuar com Google
          }
        </button>
        <div class="ct-divider"><span>ou</span></div>

        <div class="ct-stack">
          <ct-field-input
            label="E-mail"
            type="email"
            placeholder="voce@email.com"
            autocomplete="email"
            formControlName="email"
            [error]="emailError()"
          />
          <ct-field-input
            label="Senha"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            formControlName="password"
            [error]="passwordError()"
          />
        </div>

        <div class="ct-row-between">
          <label class="ct-remember">
            <input
              type="checkbox"
              class="ct-checkbox-input"
              formControlName="remember"
            />
            <span class="ct-checkbox-box" aria-hidden="true">
              @if (rememberValue()) {
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              }
            </span>
            Manter conectado
          </label>
          <a class="ct-text-link" routerLink="/entrar/recuperar">Esqueceu a senha?</a>
        </div>

        <button class="ct-btn-primary" type="submit" [disabled]="busy()">
          @if (loading()) {
            <span class="ct-spinner" aria-hidden="true"></span>
            Entrando…
          } @else {
            Entrar no painel
          }
        </button>

        <p class="ct-fine">
          Ainda não tem conta? <a class="ct-text-link" routerLink="/cadastro" [queryParams]="signupQueryParams()">Criar conta e cadastrar centro</a>
        </p>
      </form>
    </ct-auth-shell>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly googleLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = computed(() => this.loading() || this.googleLoading());
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

  /** Não passa pela validação do formulário: Google dispensa e-mail e senha. */
  protected async signInWithGoogle(): Promise<void> {
    this.error.set(null);
    this.googleLoading.set(true);
    try {
      const ok = await this.auth.signInWithGoogle(this.form.getRawValue().remember);
      if (ok) {
        this.redirectAfterLogin();
      }
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.googleLoading.set(false);
    }
  }

  private rawRedirect(): string | null {
    return this.route.snapshot.queryParamMap.get('redirect');
  }

  private validRedirect(): string | null {
    return validRedirect(this.rawRedirect());
  }

  /** O link "Cadastrar" repassa o destino pedido (ex.: convite da comissão). */
  protected signupQueryParams(): { redirect: string } | null {
    const redirect = this.validRedirect();
    return redirect ? { redirect } : null;
  }

  private redirectAfterLogin(): void {
    void this.router.navigateByUrl(this.validRedirect() ?? '/centros');
  }
}
