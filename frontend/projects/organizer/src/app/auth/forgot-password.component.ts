import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';

@Component({
  selector: 'og-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent],
  template: `
    <og-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <a class="og-back-link" routerLink="/entrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="og-form-header">
          <span class="og-kicker">Recuperar acesso</span>
          <h1>Esqueceu a senha?</h1>
          <p>Informa o e-mail cadastrado do organizador e a gente manda um link de redefinição.</p>
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

        <og-field
          label="E-mail do organizador"
          type="email"
          placeholder="voce@email.com"
          autocomplete="email"
          formControlName="email"
          [error]="emailError()"
        />

        <div style="margin-top: 24px;">
          <button class="og-btn-primary" type="submit" [disabled]="loading()">
            @if (loading()) {
              <span class="og-spinner" aria-hidden="true"></span>
              Enviando…
            } @else {
              Enviar link de redefinição
            }
          </button>
        </div>

        <p class="og-fine">O link expira em 1 hora e só funciona uma vez.</p>
      </form>
    </og-auth-shell>
  `,
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
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

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    try {
      const { email } = this.form.getRawValue();
      await this.auth.sendPasswordReset(email);
      void this.router.navigate(['/entrar/enviado'], { state: { email } });
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
