import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { trackAuthEvent } from '../auth/auth-telemetry';
import { mapFirebaseAuthError } from '../auth/firebase-auth-errors';
import { AuthService } from '../auth/auth.service';
import { ATHLETE_REDIRECT_INTENT_KEY, takeRedirectIntent } from '../auth/redirect-intent';
import { sanitizeReturnUrl } from '../auth/redirect-url';
import { AuthShellComponent } from '../auth/ui/auth-shell.component';

@Component({
  selector: 'app-athlete-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  templateUrl: './athlete-login.component.html',
  styleUrl: './athlete-login.component.scss',
})
export class AthleteLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly loginSuccess = signal(false);
  protected readonly authError = signal<string | null>(null);
  protected readonly formShake = signal(false);
  protected readonly contextMessage = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  /** Destino pós-login (também repassado para /cadastro e /esqueci-senha). */
  returnUrl = '/painel';

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    this.syncReturnUrl();
    toObservable(this.auth.authReady)
      .pipe(filter((ready) => ready), take(1), takeUntilDestroyed())
      .subscribe(() => {
        if (this.auth.isAuthenticated()) {
          void this.router.navigateByUrl(this.returnUrl);
        }
      });
  }

  private syncReturnUrl(): void {
    const q = this.route.snapshot.queryParamMap.get('redirect');
    const opts = { trustedOrigins: environment.trustedReturnOrigins };

    if (q != null && q !== '') {
      this.returnUrl = sanitizeReturnUrl(q, '/painel', opts);
      try {
        localStorage.removeItem(ATHLETE_REDIRECT_INTENT_KEY);
      } catch {
        /* ignore */
      }
    } else {
      const stored = takeRedirectIntent();
      this.returnUrl = stored ? sanitizeReturnUrl(stored, '/painel', opts) : '/painel';
    }

    this.applyContextMessage();
  }

  private applyContextMessage(): void {
    const u = this.returnUrl.toLowerCase();
    // Prefixo antes dos `includes()` abaixo: um uid no path poderia casar por acidente
    // com uma das substrings ('/pag', 'reserva'...) e trocar a mensagem.
    if (u.startsWith('/atletas/')) {
      // Link de perfil compartilhado: sem isso a tela pede login sem dizer por quê.
      this.contextMessage.set('Entre para ver o perfil do atleta.');
    } else if (u.includes('inscricao') || u.includes('inscri')) {
      this.contextMessage.set('Faça login para confirmar sua inscrição.');
    } else if (u.includes('checkout') || u.includes('reserva')) {
      this.contextMessage.set('Entre para continuar sua reserva.');
    } else if (u.includes('torneio')) {
      this.contextMessage.set('Entre para continuar no torneio.');
    } else if (u.includes('pagamento') || u.includes('/pag')) {
      this.contextMessage.set('Faça login para seguir com o pagamento.');
    } else {
      this.contextMessage.set(null);
    }
  }

  protected showDevBypass(): boolean {
    return this.auth.showDevBypass();
  }

  protected firebaseConfigured(): boolean {
    return this.auth.firebaseConfigured();
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  private triggerShake(): void {
    this.formShake.set(true);
    window.setTimeout(() => this.formShake.set(false), 480);
  }

  private authErrorCode(e: unknown): string | undefined {
    if (e && typeof e === 'object' && 'code' in e) {
      return String((e as { code: string }).code);
    }
    return undefined;
  }

  private async afterAuthSuccess(method: 'email' | 'google' | 'apple'): Promise<void> {
    trackAuthEvent('login_success', { method });
    this.submitting.set(false);
    this.loginSuccess.set(true);
    await new Promise((r) => window.setTimeout(r, 480));
    this.loginSuccess.set(false);
    await this.router.navigateByUrl(this.returnUrl);
  }

  protected async submit(): Promise<void> {
    this.authError.set(null);
    this.loginSuccess.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.triggerShake();
      return;
    }
    const { email, password } = this.form.getRawValue();

    if (!this.auth.firebaseConfigured()) {
      this.authError.set('Configure o Firebase em environment para entrar com e-mail e conta.');
      this.triggerShake();
      return;
    }

    trackAuthEvent('login_attempt', { method: 'email' });
    this.submitting.set(true);
    try {
      await this.auth.signInWithEmail(email, password);
      await this.afterAuthSuccess('email');
    } catch (e) {
      trackAuthEvent('login_error', { method: 'email', code: this.authErrorCode(e) });
      this.authError.set(mapFirebaseAuthError(e));
      this.triggerShake();
      this.submitting.set(false);
    }
  }

  protected async google(): Promise<void> {
    this.authError.set(null);
    if (!this.auth.firebaseConfigured()) {
      this.authError.set('Configure o Firebase para usar Google.');
      return;
    }
    trackAuthEvent('login_attempt', { method: 'google' });
    this.submitting.set(true);
    try {
      await this.auth.signInWithGoogle();
      await this.afterAuthSuccess('google');
    } catch (e) {
      trackAuthEvent('login_error', { method: 'google', code: this.authErrorCode(e) });
      this.authError.set(mapFirebaseAuthError(e));
      this.submitting.set(false);
    }
  }

  protected async apple(): Promise<void> {
    this.authError.set(null);
    if (!this.auth.firebaseConfigured()) {
      this.authError.set('Configure o Firebase para usar Apple.');
      return;
    }
    trackAuthEvent('login_attempt', { method: 'apple' });
    this.submitting.set(true);
    try {
      await this.auth.signInWithApple();
      await this.afterAuthSuccess('apple');
    } catch (e) {
      trackAuthEvent('login_error', { method: 'apple', code: this.authErrorCode(e) });
      this.authError.set(mapFirebaseAuthError(e));
      this.submitting.set(false);
    }
  }

  protected devContinue(): void {
    const email = this.form.controls.email.value.trim() || 'atleta@dev.local';
    this.auth.devSignIn(email);
    void this.router.navigateByUrl(this.returnUrl);
  }
}
