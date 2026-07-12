import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';

const RESEND_COOLDOWN_S = 30;

/**
 * Substitui a etapa "Verificar código" do protótipo original: o Firebase Auth
 * não emite OTP numérico por e-mail, só o link de redefinição com oobCode —
 * mesma solução já usada no backoffice e no athlete.
 */
@Component({
  selector: 'co-email-sent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthShellComponent],
  template: `
    <co-auth-shell>
      <div class="co-center">
        <div class="co-icon-badge">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--nx-orange-500)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>

        <header class="co-form-header">
          <h1>Confira seu e-mail.</h1>
          <p>
            Se <strong>{{ email() }}</strong> tiver conta, o link de redefinição chega em instantes.
          </p>
        </header>

        @if (error(); as err) {
          <div class="co-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <a class="co-btn-primary" href="https://mail.google.com" target="_blank" rel="noopener">
          Abrir e-mail
        </a>

        <div class="co-resend-row">
          Não chegou? Confira o spam ou
          <button class="co-text-link" type="button" [disabled]="cooldown() > 0" (click)="resend()">reenviar</button>
          @if (cooldown() > 0) {
            <span class="co-timer">({{ cooldownLabel() }})</span>
          }
        </div>
      </div>
    </co-auth-shell>
  `,
})
export class EmailSentComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly cooldown = signal(RESEND_COOLDOWN_S);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const state = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    const email = typeof state?.['email'] === 'string' ? state['email'] : '';
    if (!email) {
      // Sem contexto (URL acessada direto) → volta pro início da recuperação.
      void this.router.navigateByUrl('/entrar/recuperar');
      return;
    }
    this.email.set(email);
    this.startCooldown();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  protected cooldownLabel(): string {
    const s = this.cooldown();
    return `0:${String(s).padStart(2, '0')}`;
  }

  protected async resend(): Promise<void> {
    this.error.set(null);
    try {
      await this.auth.sendPasswordReset(this.email());
      this.startCooldown();
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    }
  }

  private startCooldown(): void {
    this.stopTimer();
    this.cooldown.set(RESEND_COOLDOWN_S);
    this.timer = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(next);
      if (next <= 0) {
        this.stopTimer();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
