import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

/** Autocadastro do organizador — cria a conta e completa o papel `organizer` via
 *  Cloud Function. Sem etapa de verificação: o painel fica disponível assim
 *  que a conta é criada (diferente do fluxo de arena, que passa por revisão). */
@Component({
  selector: 'og-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <og-auth-shell [wide]="true">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <a class="og-back-link" routerLink="/entrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="og-form-header">
          <span class="og-kicker">Cadastrar organizador</span>
          <h1>Leve seus torneios pro NexaGO.</h1>
          <p>Alguns dados básicos pra criar seu painel. Você cria torneios e ligas depois.</p>
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
            label="Nome completo"
            placeholder="Carla Mendes"
            autocomplete="name"
            formControlName="nome"
            [error]="fieldError('nome', 'Informe seu nome completo.')"
          />

          <div class="og-grid-2">
            <og-field
              label="Telefone"
              type="tel"
              placeholder="(62) 99999-0000"
              autocomplete="tel"
              formControlName="telefone"
              [error]="fieldError('telefone', 'Informe seu telefone.')"
            />
            <og-field
              label="E-mail"
              type="email"
              placeholder="voce@email.com"
              autocomplete="email"
              formControlName="email"
              [error]="emailError()"
            />
          </div>

          <div class="og-stack-sm">
            <og-field
              label="Senha"
              type="password"
              placeholder="••••••••"
              autocomplete="new-password"
              formControlName="password"
              [error]="passwordError()"
            />
            <og-strength-meter [password]="passwordValue()" />
          </div>
        </div>

        <div style="margin-top: 24px;">
          <button class="og-btn-primary" type="submit" [disabled]="loading()">
            @if (loading()) {
              <span class="og-spinner" aria-hidden="true"></span>
              Criando conta…
            } @else {
              Criar painel do organizador
            }
          </button>
        </div>
      </form>
    </og-auth-shell>
  `,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    nome: ['', Validators.required],
    telefone: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  protected fieldError(control: 'nome' | 'telefone', message: string): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.form.controls[control].hasError('required') ? message : null;
  }

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
    const control = this.form.controls.password;
    if (control.hasError('required')) {
      return 'Crie uma senha.';
    }
    if (control.hasError('minlength')) {
      return 'A senha precisa de pelo menos 8 caracteres.';
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
      const { nome, telefone, email, password } = this.form.getRawValue();
      await this.auth.createOrganizerAccount(email, password, nome, telefone);
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
