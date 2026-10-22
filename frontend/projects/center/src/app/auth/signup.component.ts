import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { validRedirect } from './invite-redirect';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

/**
 * Cria a conta NexaGO (Firebase Auth). O centro em si é cadastrado no passo seguinte
 * (`/centros/novo`) — quem chega por convite de equipe pula esse passo e só aceita o convite.
 */
@Component({
  selector: 'ct-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <ct-auth-shell [wide]="true">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <a class="ct-back-link" routerLink="/entrar" [queryParams]="redirectParams">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="ct-form-header">
          <span class="ct-kicker">Criar conta</span>
          <h1>Leve seu centro de treinamento pro NexaGO.</h1>
          <p>Primeiro a sua conta. Depois você cadastra o centro — ou aceita o convite de um centro que já usa o NexaGO.</p>
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
            label="Nome completo"
            placeholder="Renata Moreira"
            autocomplete="name"
            formControlName="nome"
            [error]="submitted() && form.controls.nome.invalid ? 'Informe seu nome completo.' : null"
          />
          <ct-field-input
            label="E-mail"
            type="email"
            placeholder="voce@email.com"
            autocomplete="email"
            formControlName="email"
            [error]="emailError()"
          />
          <div class="ct-stack-sm">
            <ct-field-input
              label="Senha"
              type="password"
              placeholder="••••••••"
              autocomplete="new-password"
              formControlName="password"
              [error]="passwordError()"
            />
            <ct-strength-meter [password]="passwordValue()" />
          </div>
        </div>

        <div style="margin-top: 24px;">
          <button class="ct-btn-primary" type="submit" [disabled]="busy()">
            @if (loading()) {
              <span class="ct-spinner" aria-hidden="true"></span>
              Criando conta…
            } @else {
              Criar conta
            }
          </button>
        </div>

        <p class="ct-fine">
          Já tem conta NexaGO? <a class="ct-text-link" routerLink="/entrar" [queryParams]="redirectParams">Entrar</a>
        </p>
      </form>
    </ct-auth-shell>
  `,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly redirect = validRedirect(this.route.snapshot.queryParamMap.get('redirect'));
  protected readonly redirectParams = this.redirect ? { redirect: this.redirect } : null;

  protected readonly loading = signal(false);
  protected readonly googleLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = computed(() => this.loading() || this.googleLoading());
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    nome: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly passwordValue = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });

  protected emailError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const c = this.form.controls.email;
    return c.hasError('required') ? 'Informe o e-mail.' : c.hasError('email') ? 'E-mail inválido.' : null;
  }

  protected passwordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const c = this.form.controls.password;
    return c.hasError('required') ? 'Crie uma senha.' : c.hasError('minlength') ? 'Use no mínimo 8 caracteres.' : null;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    try {
      const { nome, email, password } = this.form.getRawValue();
      await this.auth.createAccount(email, password, nome);
      void this.router.navigateByUrl(this.redirect ?? '/centros');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected async signInWithGoogle(): Promise<void> {
    this.error.set(null);
    this.googleLoading.set(true);
    try {
      if (await this.auth.signInWithGoogle(true)) {
        void this.router.navigateByUrl(this.redirect ?? '/centros');
      }
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.googleLoading.set(false);
    }
  }
}
