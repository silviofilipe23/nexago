import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

const CNPJ_PATTERN = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

/**
 * Cadastro self-service de uma nova arena. Só cria a conta no Firebase Auth;
 * CNPJ/cidade/WhatsApp ainda não têm um destino no backend (não existe fluxo
 * de onboarding/verificação de arena hoje), então por enquanto ficam apenas
 * validados no formulário.
 */
@Component({
  selector: 'ar-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <ar-auth-shell [wide]="true">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <a class="ar-back-link" routerLink="/entrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="ar-form-header">
          <span class="ar-kicker">Cadastrar arena</span>
          <h1>Coloca sua arena no NexaGO.</h1>
          <p>Alguns dados básicos pra criar o painel. Você completa quadras, preços e fotos depois.</p>
        </header>

        @if (error(); as err) {
          <div class="ar-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <div class="ar-stack">
          <ar-field
            label="Nome da arena"
            placeholder="Arena CFC"
            autocomplete="organization"
            formControlName="nome"
            [error]="fieldError('nome', 'Informe o nome da arena.')"
          />

          <div class="ar-grid-2">
            <ar-field
              label="CNPJ"
              placeholder="00.000.000/0000-00"
              formControlName="cnpj"
              [error]="cnpjError()"
            />
            <ar-field
              label="Cidade / UF"
              placeholder="Florianópolis, SC"
              formControlName="cidade"
              [error]="fieldError('cidade', 'Informe a cidade.')"
            />
          </div>

          <div class="ar-grid-2">
            <ar-field
              label="WhatsApp"
              type="tel"
              placeholder="(48) 99999-0000"
              autocomplete="tel"
              formControlName="whatsapp"
              [error]="fieldError('whatsapp', 'Informe o WhatsApp.')"
            />
            <ar-field
              label="E-mail"
              type="email"
              placeholder="contato@suaarena.com.br"
              autocomplete="email"
              formControlName="email"
              [error]="emailError()"
            />
          </div>

          <div class="ar-stack-sm">
            <ar-field
              label="Senha"
              type="password"
              placeholder="••••••••"
              autocomplete="new-password"
              formControlName="password"
              [error]="passwordError()"
            />
            <ar-strength-meter [password]="passwordValue()" />
          </div>
        </div>

        <div style="margin-top: 24px;">
          <button class="ar-btn-primary" type="submit" [disabled]="loading()">
            @if (loading()) {
              <span class="ar-spinner" aria-hidden="true"></span>
              Criando conta…
            } @else {
              Criar painel da arena
            }
          </button>
        </div>

        <p class="ar-fine">Sua conta passa por uma verificação rápida antes de aparecer para atletas no app.</p>
      </form>
    </ar-auth-shell>
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
    cnpj: ['', [Validators.required, Validators.pattern(CNPJ_PATTERN)]],
    cidade: ['', Validators.required],
    whatsapp: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  protected fieldError(control: 'nome' | 'cidade' | 'whatsapp', message: string): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.form.controls[control].hasError('required') ? message : null;
  }

  protected cnpjError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.form.controls.cnpj;
    if (control.hasError('required')) {
      return 'Informe o CNPJ.';
    }
    if (control.hasError('pattern')) {
      return 'CNPJ inválido. Use o formato 00.000.000/0000-00.';
    }
    return null;
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
      const { nome, email, password } = this.form.getRawValue();
      await this.auth.createArenaAccount(email, password, nome);
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
