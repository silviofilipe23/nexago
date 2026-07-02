import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';

const RESEND_COOLDOWN_S = 30;

@Component({
  selector: 'bo-email-sent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthShellComponent],
  template: `
    <bo-auth-shell>
      <div class="bo-center">
        <div class="bo-icon-badge">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--nx-orange-500)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>

        <header class="bo-form-header">
          <h1>Confere teu e-mail.</h1>
          <p>
            Se <strong>{{ email() }}</strong> tiver conta, o link de redefinição chega em instantes.
          </p>
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

        <a class="bo-btn-primary" href="https://mail.google.com" target="_blank" rel="noopener" style="text-decoration: none;">
          Abrir e-mail
        </a>

        <div class="bo-resend-row">
          Não chegou? Olha o spam ou
          <button class="bo-text-link" type="button" [disabled]="cooldown() > 0" (click)="resend()">reenviar</button>
          @if (cooldown() > 0) {
            <span class="bo-timer">({{ cooldownLabel() }})</span>
          }
        </div>
      </div>
    </bo-auth-shell>
  `,
  styles: `
    .bo-text-link:disabled {
      color: var(--nx-text-dim);
      cursor: default;
      text-decoration: none;
    }
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
