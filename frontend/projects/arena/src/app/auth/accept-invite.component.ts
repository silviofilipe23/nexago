import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { getErrorCode, mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

type Mode = 'entrar' | 'criar';

/**
 * Fase da tela. `form` cobre tanto a escolha inicial (não autenticado) quanto
 * o retorno a ela depois de "usar outra conta". `blocked` é autenticado +
 * aceite que falhou por um motivo genérico (ex.: convite expirado/revogado) —
 * sem forms pra mostrar, só a mensagem do servidor e a saída pra trocar de
 * conta. `already-member` é o caso especial em que o aceite falha porque a
 * pessoa JÁ faz parte da equipe: nem repetir nem trocar de conta resolvem —
 * a saída certa é simplesmente entrar no painel. */
type Phase =
  'loading' | 'invalid' | 'form' | 'accepting' | 'blocked' | 'already-member' | 'success';

/** Mensagem mostrada quando o aceite falha logo após criar a conta NESTA
 *  mesma tentativa (`createStaffAccount` → `acceptStaffInvite`). Nesse caso a
 *  conta ficou órfã (existe, mas sem vínculo com a arena) — sem isso, o rótulo
 *  bruto do servidor ("convite não é mais válido...") não deixa claro que a
 *  conta em si foi criada com sucesso, só o convite é que não bateu com ela. */
const ACCOUNT_CREATED_MISMATCH_MESSAGE =
  'Sua conta foi criada com sucesso, mas este convite não é para este e-mail. ' +
  'Convites de equipe valem só para o endereço que recebeu o convite — confira o ' +
  'e-mail da mensagem de convite e entre com a conta correspondente.';

/**
 * Rota pública de aceite de convite de equipe (`/convite/:inviteId`). Quem
 * chega aqui foi convidado por um dono de arena para fazer parte da equipe —
 * NUNCA passa por `completeArenaSignup` (isso o faria dono de uma arena
 * própria) nem por `AuthService.signInWithEmail` (que exige a role `arena`,
 * que o convidado ainda não tem — é o aceite que concede).
 */
@Component({
  selector: 'ar-accept-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AuthShellComponent,
    FieldComponent,
    StrengthMeterComponent,
  ],
  template: `
    <ar-auth-shell>
      @switch (phase()) {
        @case ('loading') {
          <div class="center-state">
            <span class="ar-spinner" aria-hidden="true"></span>
            <p>Carregando convite…</p>
          </div>
        }
        @case ('invalid') {
          <div class="center-state">
            <div class="ar-alert" role="alert">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              Link de convite inválido.
            </div>
            <a class="ar-text-link" routerLink="/entrar">Ir para o login</a>
          </div>
        }
        @case ('accepting') {
          <div class="center-state">
            <span class="ar-spinner" aria-hidden="true"></span>
            <p>Aceitando convite…</p>
          </div>
        }
        @case ('success') {
          <div class="center-state">
            <span class="ar-spinner" aria-hidden="true"></span>
            <p>Convite aceito! Entrando no painel…</p>
          </div>
        }
        @case ('blocked') {
          <div class="center-state">
            @if (error(); as err) {
              <div class="ar-alert" role="alert">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {{ err }}
              </div>
            }
            <button class="ar-btn-primary" type="button" (click)="retry()">Tentar novamente</button>
            <button class="ar-text-link" type="button" (click)="useAnotherAccount()">
              Usar outra conta
            </button>
          </div>
        }
        @case ('already-member') {
          <div class="center-state">
            <p>Você já faz parte da equipe desta arena.</p>
            <button class="ar-btn-primary" type="button" (click)="goToPanel()">
              Ir para o painel
            </button>
          </div>
        }
        @case ('form') {
          <header class="ar-form-header">
            <span class="ar-kicker">Convite de equipe</span>
            <h1>Você foi convidado.</h1>
            <p>Entre com sua conta ou crie uma nova pra aceitar o convite e acessar o painel.</p>
          </header>

          <div class="ar-chart-tabs mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              [class.active]="mode() === 'entrar'"
              [attr.aria-selected]="mode() === 'entrar'"
              (click)="setMode('entrar')"
            >
              Já tenho conta
            </button>
            <button
              type="button"
              role="tab"
              [class.active]="mode() === 'criar'"
              [attr.aria-selected]="mode() === 'criar'"
              (click)="setMode('criar')"
            >
              Criar conta
            </button>
          </div>

          @if (error(); as err) {
            <div class="ar-alert" role="alert">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {{ err }}
            </div>
          }

          @if (mode() === 'entrar') {
            <form [formGroup]="signInForm" (ngSubmit)="signIn()">
              <div class="ar-stack">
                <ar-field
                  label="E-mail"
                  type="email"
                  placeholder="voce@exemplo.com.br"
                  autocomplete="email"
                  formControlName="email"
                  [error]="signInEmailError()"
                />
                <ar-field
                  label="Senha"
                  type="password"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  formControlName="password"
                  [error]="signInPasswordError()"
                />
              </div>

              <div style="margin-top: 24px;">
                <button class="ar-btn-primary" type="submit" [disabled]="submitting()">
                  @if (submitting()) {
                    <span class="ar-spinner" aria-hidden="true"></span>
                    Entrando…
                  } @else {
                    Entrar e aceitar convite
                  }
                </button>
              </div>
            </form>
          } @else {
            <form [formGroup]="signUpForm" (ngSubmit)="signUp()">
              <div class="ar-stack">
                <ar-field
                  label="Nome"
                  placeholder="Seu nome"
                  autocomplete="name"
                  formControlName="nome"
                  [error]="signUpNameError()"
                />
                <ar-field
                  label="E-mail"
                  type="email"
                  placeholder="voce@exemplo.com.br"
                  autocomplete="email"
                  formControlName="email"
                  [error]="signUpEmailError()"
                />
                <div class="ar-stack-sm">
                  <ar-field
                    label="Senha"
                    type="password"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    formControlName="password"
                    [error]="signUpPasswordError()"
                  />
                  <ar-strength-meter [password]="signUpPasswordValue()" />
                </div>
              </div>

              <div style="margin-top: 24px;">
                <button class="ar-btn-primary" type="submit" [disabled]="submitting()">
                  @if (submitting()) {
                    <span class="ar-spinner" aria-hidden="true"></span>
                    Criando conta…
                  } @else {
                    Criar conta e aceitar convite
                  }
                </button>
              </div>
            </form>
          }
        }
      }
    </ar-auth-shell>
  `,
  styles: `
    .center-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
      padding: 24px 0;
    }

    .center-state p {
      font-size: 14px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .center-state .ar-btn-primary,
    .center-state .ar-text-link {
      width: 100%;
    }

    .mode-tabs {
      width: 100%;
      margin-bottom: 20px;
    }

    .mode-tabs button {
      flex: 1;
    }
  `,
})
export class AcceptInviteComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly inviteId = this.route.snapshot.paramMap.get('inviteId') ?? '';

  /** Garante que a decisão inicial (autenticado x não) rode uma única vez —
   *  mudanças de sessão depois disso (login/cadastro/logout no próprio fluxo)
   *  são tratadas explicitamente pelos handlers, não por este effect. */
  private readonly dispatched = signal(false);

  protected readonly phase = signal<Phase>(this.inviteId ? 'loading' : 'invalid');
  protected readonly mode = signal<Mode>('entrar');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  /** Marca quando a conta foi criada NESTA tentativa (via `signUp`), pra
   *  diferenciar a mensagem de falha do aceite (ver `ACCOUNT_CREATED_MISMATCH_MESSAGE`).
   *  Reseta ao trocar de conta, já que aí o contexto muda. */
  private readonly justCreatedAccount = signal(false);

  protected readonly signInForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected readonly signUpForm = this.fb.group({
    nome: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly signUpPasswordValue = toSignal(
    this.signUpForm.controls.password.valueChanges,
    {
      initialValue: '',
    },
  );

  constructor() {
    effect(() => {
      if (!this.auth.authReady() || this.dispatched()) {
        return;
      }
      this.dispatched.set(true);
      if (this.phase() === 'invalid') {
        return;
      }
      if (this.auth.isAuthenticated()) {
        void this.accept();
      } else {
        this.phase.set('form');
      }
    });
  }

  protected setMode(next: Mode): void {
    this.mode.set(next);
    this.submitted.set(false);
    this.error.set(null);
  }

  protected signInEmailError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.signInForm.controls.email;
    if (control.hasError('required')) {
      return 'Informe o e-mail.';
    }
    if (control.hasError('email')) {
      return 'E-mail inválido.';
    }
    return null;
  }

  protected signInPasswordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.signInForm.controls.password.hasError('required') ? 'Informe a senha.' : null;
  }

  protected signUpNameError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.signUpForm.controls.nome.hasError('required') ? 'Informe seu nome.' : null;
  }

  protected signUpEmailError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.signUpForm.controls.email;
    if (control.hasError('required')) {
      return 'Informe o e-mail.';
    }
    if (control.hasError('email')) {
      return 'E-mail inválido.';
    }
    return null;
  }

  protected signUpPasswordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.signUpForm.controls.password;
    if (control.hasError('required')) {
      return 'Crie uma senha.';
    }
    if (control.hasError('minlength')) {
      return 'A senha precisa de pelo menos 8 caracteres.';
    }
    return null;
  }

  protected async signIn(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    this.justCreatedAccount.set(false);
    if (this.signInForm.invalid) {
      return;
    }
    this.submitting.set(true);
    try {
      const { email, password } = this.signInForm.getRawValue();
      await this.auth.signInForInvite(email, password);
      await this.accept();
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async signUp(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.signUpForm.invalid) {
      return;
    }
    this.submitting.set(true);
    try {
      const { nome, email, password } = this.signUpForm.getRawValue();
      await this.auth.createStaffAccount(email, password, nome);
      // A conta acabou de ser criada NESTA tentativa — se o aceite falhar a
      // seguir, a mensagem precisa deixar claro que a conta existe (não foi
      // o cadastro que deu errado), só o convite que não bateu com ela.
      this.justCreatedAccount.set(true);
      await this.accept();
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected retry(): void {
    void this.accept();
  }

  protected async useAnotherAccount(): Promise<void> {
    await this.auth.signOutUser();
    this.error.set(null);
    this.justCreatedAccount.set(false);
    this.phase.set('form');
  }

  protected goToPanel(): void {
    void this.router.navigateByUrl('/painel');
  }

  /** Aceita o convite; exige sessão ativa (autenticado via login ou conta
   *  nova). Nunca chama `signInWithEmail`/`completeArenaSignup` — só
   *  `acceptArenaStaffInvite`, que valida e concede a role `arena`. */
  private async accept(): Promise<void> {
    if (this.phase() === 'accepting') {
      return;
    }
    this.phase.set('accepting');
    this.error.set(null);
    try {
      await this.auth.acceptStaffInvite(this.inviteId);
      this.phase.set('success');
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      // "already-exists" = a pessoa já está na equipe: nem "tentar de novo"
      // nem "trocar de conta" resolvem, então ganha uma saída própria (ver
      // Finding 1 da revisão) em vez de cair no `blocked` genérico.
      if (getErrorCode(err) === 'functions/already-exists') {
        this.phase.set('already-member');
        return;
      }
      this.error.set(
        this.justCreatedAccount() ? ACCOUNT_CREATED_MISMATCH_MESSAGE : mapFirebaseAuthError(err),
      );
      this.phase.set(this.auth.isAuthenticated() ? 'blocked' : 'form');
    }
  }
}
