import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { CodeInputComponent } from './ui/code-input.component';

/**
 * Segunda etapa do login (MFA). Concluída com código TOTP do app autenticador
 * quando a conta tem verificação em 2 etapas habilitada no Firebase.
 */
@Component({
  selector: 'bo-two-factor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AuthShellComponent, CodeInputComponent],
  template: `
    <bo-auth-shell>
      <div>
        <a class="bo-back-link" routerLink="/entrar" (click)="auth.clearPendingMfa()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="bo-form-header">
          <span class="bo-kicker">Verificação em 2 etapas</span>
          <h1>Confirma que é você.</h1>
          <p>Informe o código de 6 dígitos do seu app autenticador.</p>
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

        <bo-code-input [value]="code()" [error]="error() != null" (valueChange)="code.set($event)" />

        <div style="margin-top: 28px;">
          <button class="bo-btn-primary" type="button" [disabled]="!canSubmit()" (click)="submit()">
            @if (loading()) {
              <span class="bo-spinner" aria-hidden="true"></span>
              Verificando…
            } @else {
              Verificar
            }
          </button>
        </div>

        <div class="bo-info-card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--nx-text-dim)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <p>O código muda a cada 30 segundos no seu app autenticador. Se perdeu o acesso ao app, fale com um admin.</p>
        </div>
      </div>
    </bo-auth-shell>
  `,
})
export class TwoFactorComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly code = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(() => this.code().length === 6 && !this.loading());

  constructor() {
    // Sem login pendente (acesso direto à URL) → volta pro início do fluxo.
    if (!this.auth.mfaPending()) {
      void this.router.navigateByUrl('/entrar');
    }
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.resolveMfaCode(this.code());
      const redirect = this.route.snapshot.queryParamMap.get('redirect');
      const target =
        redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/painel';
      void this.router.navigateByUrl(target);
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
      this.code.set('');
    } finally {
      this.loading.set(false);
    }
  }
}
