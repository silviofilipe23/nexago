import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { trackAuthEvent } from '../auth-telemetry';
import { AuthService } from '../auth.service';
import { sanitizeReturnUrl } from '../redirect-url';
import { AuthShellComponent } from '../ui/auth-shell.component';

const WEBMAIL_INBOX_URL: Record<string, string> = {
  'gmail.com': 'https://mail.google.com/mail/u/0/#search/from%3Anexago',
  'outlook.com': 'https://outlook.live.com/mail/0/inbox',
  'hotmail.com': 'https://outlook.live.com/mail/0/inbox',
  'live.com': 'https://outlook.live.com/mail/0/inbox',
  'yahoo.com': 'https://mail.yahoo.com/',
  'icloud.com': 'https://www.icloud.com/mail',
};

@Component({
  selector: 'app-athlete-reset-sent',
  standalone: true,
  imports: [RouterLink, AuthShellComponent],
  templateUrl: './athlete-reset-sent.component.html',
  styleUrl: './athlete-reset-sent.component.scss',
})
export class AthleteResetSentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly resending = signal(false);
  protected readonly resent = signal(false);

  protected readonly email = computed(() => this.route.snapshot.queryParamMap.get('email') ?? '');
  protected readonly returnUrl = computed(() =>
    sanitizeReturnUrl(this.route.snapshot.queryParamMap.get('redirect'), '/painel', {
      trustedOrigins: environment.trustedReturnOrigins,
    }),
  );
  protected readonly webmailUrl = computed(() => {
    const domain = this.email().split('@')[1]?.toLowerCase().trim();
    return domain ? (WEBMAIL_INBOX_URL[domain] ?? null) : null;
  });

  protected async resend(): Promise<void> {
    const email = this.email();
    if (!email || this.resending() || !this.auth.firebaseConfigured()) {
      return;
    }
    this.resending.set(true);
    try {
      await this.auth.sendPasswordReset(email);
    } catch {
      /* mesma política de não confirmar existência de conta — falha silenciosa aqui também */
    } finally {
      trackAuthEvent('password_reset_request');
      this.resending.set(false);
      this.resent.set(true);
    }
  }
}
