import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

/**
 * Cadastro por convite: /convite?email=…&por=…&papel=…
 * O e-mail vem travado do convite. A validação real do convite (e o papel via
 * custom claims) fica numa Cloud Function; aqui é a criação da conta.
 */
@Component({
  selector: 'bo-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <bo-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        @if (inviter(); as who) {
          <div class="bo-invite-card">
            <div class="bo-avatar" aria-hidden="true">{{ initials() }}</div>
            <div class="who">
              <div class="line"><strong>{{ who }}</strong> te convidou</div>
              @if (role()) {
                <div class="role">Papel · {{ role() }}</div>
              }
            </div>
          </div>
        }

        <header class="bo-form-header">
          <span class="bo-kicker">Criar conta</span>
          <h1>Entra pro time.</h1>
          <p>Completa teu cadastro pra ativar o acesso ao painel.</p>
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
          <bo-field label="E-mail do convite" type="email" [locked]="true" formControlName="email" />
          <bo-field
            label="Nome completo"
            placeholder="Ana Souza"
            autocomplete="name"
            formControlName="name"
            [error]="nameError()"
          />
          <div class="bo-stack-sm">
            <bo-field
              label="Senha"
              type="password"
              placeholder="••••••••"
              autocomplete="new-password"
              formControlName="password"
              [error]="passwordError()"
            />
            <bo-strength-meter [password]="passwordValue()" />
          </div>
        </div>

        <div style="margin-top: 24px;">
          <button class="bo-btn-primary" type="submit" [disabled]="loading()">
            @if (loading()) {
              <span class="bo-spinner" aria-hidden="true"></span>
              Criando conta…
            } @else {
              Criar conta e entrar
            }
          </button>
        </div>
      </form>
    </bo-auth-shell>
  `,
})
export class InviteComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly inviter = signal('');
  protected readonly role = signal('');
  protected readonly initials = computed(() => {
    const parts = this.inviter().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '·';
    }
    const first = parts[0]![0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
    return (first + last).toUpperCase();
  });

  protected readonly form = this.fb.group({
    email: [{ value: '', disabled: true }],
    name: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const email = params.get('email') ?? '';
    if (!email) {
      // Convite sem e-mail não tem como seguir → volta pro login.
      void this.router.navigateByUrl('/entrar');
      return;
    }
    this.form.controls.email.setValue(email);
    this.inviter.set(params.get('por') ?? '');
    this.role.set(params.get('papel') ?? '');
  }

  protected nameError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.form.controls.name.hasError('required') ? 'Informe teu nome.' : null;
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
      const email = this.form.controls.email.value;
      const { name, password } = this.form.getRawValue();
      await this.auth.createInviteAccount(email, password, name);
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
