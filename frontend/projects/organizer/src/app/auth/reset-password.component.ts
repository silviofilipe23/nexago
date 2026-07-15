import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

type ResetState = 'verifying' | 'ready' | 'invalid';

/**
 * Tela de redefinição via link do e-mail (?oobCode=…). Para cair aqui em vez
 * da página hospedada do Firebase, configure a action URL do template de
 * e-mail para {origem}/entrar/redefinir.
 */
@Component({
  selector: 'og-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <og-auth-shell>
      @switch (state()) {
        @case ('verifying') {
          <div class="og-center">
            <p style="color: var(--nx-text-mute); font-size: 14px;">Validando o link…</p>
          </div>
        }
        @case ('invalid') {
          <div class="og-center">
            <header class="og-form-header">
              <span class="og-kicker">Redefinir senha</span>
              <h1>Link inválido ou expirado.</h1>
              <p>{{ invalidReason() }}</p>
            </header>
            <a class="og-btn-primary" routerLink="/entrar/recuperar">
              Pedir um novo link
            </a>
          </div>
        }
        @case ('ready') {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <header class="og-form-header">
              <span class="og-kicker">Redefinir senha</span>
              <h1>Cria uma senha nova.</h1>
              <p>
                Redefinindo o acesso de <strong>{{ email() }}</strong>.
              </p>
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
              <div class="og-stack-sm">
                <og-field
                  label="Nova senha"
                  type="password"
                  placeholder="••••••••"
                  autocomplete="new-password"
                  formControlName="password"
                  [error]="passwordError()"
                />
                <og-strength-meter [password]="passwordValue()" />
              </div>
              <og-field
                label="Confirmar senha"
                type="password"
                placeholder="••••••••"
                autocomplete="new-password"
                formControlName="confirm"
                [error]="confirmError()"
              />
            </div>

            <div style="margin-top: 28px;">
              <button class="og-btn-primary" type="submit" [disabled]="loading()">
                @if (loading()) {
                  <span class="og-spinner" aria-hidden="true"></span>
                  Salvando…
                } @else {
                  Salvar e entrar no painel
                }
              </button>
            </div>

            <p class="og-fine">Isso desconecta as outras sessões ativas do painel.</p>
          </form>
        }
      }
    </og-auth-shell>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly state = signal<ResetState>('verifying');
  protected readonly invalidReason = signal('O link de redefinição não é mais válido. Peça um novo que a gente reenvia.');
  protected readonly email = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  private oobCode = '';

  protected readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', Validators.required],
  });

  protected readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  async ngOnInit(): Promise<void> {
    this.oobCode = this.route.snapshot.queryParamMap.get('oobCode') ?? '';
    if (!this.oobCode) {
      this.state.set('invalid');
      return;
    }
    try {
      this.email.set(await this.auth.verifyResetCode(this.oobCode));
      this.state.set('ready');
    } catch (err) {
      this.invalidReason.set(mapFirebaseAuthError(err));
      this.state.set('invalid');
    }
  }

  protected passwordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.form.controls.password;
    if (control.hasError('required')) {
      return 'Informe a nova senha.';
    }
    if (control.hasError('minlength')) {
      return 'A senha precisa de pelo menos 8 caracteres.';
    }
    return null;
  }

  protected confirmError(): string | null {
    const { password, confirm } = this.form.getRawValue();
    if (confirm && confirm !== password) {
      return 'As senhas não batem.';
    }
    if (this.submitted() && this.form.controls.confirm.hasError('required')) {
      return 'Confirme a senha.';
    }
    return null;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    const { password, confirm } = this.form.getRawValue();
    if (this.form.invalid || password !== confirm) {
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.confirmReset(this.oobCode, password);
      await this.auth.signInWithEmail(this.email(), password, true);
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
