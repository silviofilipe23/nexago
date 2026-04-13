import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { trackAuthEvent } from '../auth/auth-telemetry';
import { mapFirebaseAuthError } from '../auth/firebase-auth-errors';
import { AuthService } from '../auth/auth.service';
import {
  ATHLETE_REDIRECT_INTENT_KEY,
  takeRedirectIntent,
} from '../auth/redirect-intent';
import { sanitizeReturnUrl } from '../auth/redirect-url';

const AUTH_ERROR_MICRO_DELAY_MS = 150;
const LOGIN_SUCCESS_PAUSE_MS = 480;

@Component({
  selector: 'app-athlete-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './athlete-login.component.html',
  styleUrl: './athlete-login.component.scss',
})
export class AthleteLoginComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly emailField =
    viewChild<ElementRef<HTMLInputElement>>('emailField');
  private readonly passwordField =
    viewChild<ElementRef<HTMLInputElement>>('passwordField');
  private readonly brandVideo =
    viewChild<ElementRef<HTMLVideoElement>>('brandVideo');

  protected readonly submitting = signal(false);
  protected readonly loginSuccess = signal(false);
  protected readonly authError = signal<string | null>(null);
  protected readonly resetSent = signal(false);
  protected readonly formShake = signal(false);
  protected readonly glowTransform = signal('translate(0px, 0px)');
  protected readonly contextMessage = signal<string | null>(null);
  /** Destino pós-login (também repassado para /cadastro). */
  returnUrl = '/';

  protected onMouseMove(ev: MouseEvent): void {
    const x = (ev.clientX / window.innerWidth - 0.5) * 48;
    const y = (ev.clientY / window.innerHeight - 0.5) * 48;
    this.glowTransform.set(`translate(${x}px, ${y}px)`);
  }

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

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      const emailVal = this.form.controls.email.value?.trim();
      if (!emailVal) {
        this.emailField()?.nativeElement?.focus();
      } else {
        this.passwordField()?.nativeElement?.focus();
      }
    });
    queueMicrotask(() => this.enforceBrandVideoSilent());
  }

  /**
   * Vídeo de fundo: sem autoplay no HTML para evitar som antes do mute aplicar.
   * Reforça mute em play / volumechange (Safari/Chrome).
   */
  private enforceBrandVideoSilent(): void {
    const el = this.brandVideo()?.nativeElement;
    if (!el) {
      return;
    }

    const lockAudio = (): void => {
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      el.setAttribute('muted', '');
    };

    const tryPlay = (): void => {
      lockAudio();
      void el.play().catch(() => {
        /* autoplay bloqueado: primeiro gesto do user destrava; continua mudo */
        lockAudio();
      });
    };

    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');

    const onVolumeChange = (): void => {
      if (!el.muted || el.volume > 0) {
        lockAudio();
      }
    };

    lockAudio();
    el.addEventListener('volumechange', onVolumeChange, { passive: true });
    el.addEventListener('play', lockAudio, { passive: true });
    el.addEventListener('playing', lockAudio, { passive: true });
    el.addEventListener('loadedmetadata', tryPlay, { once: true, passive: true });
    tryPlay();
  }

  private syncReturnUrl(): void {
    const q = this.route.snapshot.queryParamMap.get('redirect');
    const opts = { trustedOrigins: environment.trustedReturnOrigins };

    if (q != null && q !== '') {
      this.returnUrl = sanitizeReturnUrl(q, '/', opts);
      try {
        localStorage.removeItem(ATHLETE_REDIRECT_INTENT_KEY);
      } catch {
        /* ignore */
      }
    } else {
      const stored = takeRedirectIntent();
      this.returnUrl = stored
        ? sanitizeReturnUrl(stored, '/', opts)
        : '/';
    }

    this.applyContextMessage();
  }

  private applyContextMessage(): void {
    const u = this.returnUrl.toLowerCase();
    if (u.includes('inscricao') || u.includes('inscri')) {
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

  protected triggerShake(): void {
    this.formShake.set(true);
    window.setTimeout(() => this.formShake.set(false), 480);
  }

  private setAuthErrorDelayed(message: string): void {
    window.setTimeout(() => {
      this.authError.set(message);
    }, AUTH_ERROR_MICRO_DELAY_MS);
  }

  private authErrorCode(e: unknown): string | undefined {
    if (e && typeof e === 'object' && 'code' in e) {
      return String((e as { code: string }).code);
    }
    return undefined;
  }

  private async afterAuthSuccess(method: 'email' | 'google'): Promise<void> {
    trackAuthEvent('login_success', { method });
    this.submitting.set(false);
    this.loginSuccess.set(true);
    await new Promise((r) => window.setTimeout(r, LOGIN_SUCCESS_PAUSE_MS));
    this.loginSuccess.set(false);
    await this.router.navigateByUrl(this.returnUrl);
  }

  protected async submit(): Promise<void> {
    this.authError.set(null);
    this.resetSent.set(false);
    this.loginSuccess.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.triggerShake();
      return;
    }
    const { email, password } = this.form.getRawValue();

    if (!this.auth.firebaseConfigured()) {
      this.authError.set(
        'Configure o Firebase em environment para entrar com e-mail e conta.',
      );
      this.triggerShake();
      return;
    }

    trackAuthEvent('login_attempt', { method: 'email' });
    this.submitting.set(true);
    try {
      await this.auth.signInWithEmail(email, password);
      await this.afterAuthSuccess('email');
    } catch (e) {
      trackAuthEvent('login_error', {
        method: 'email',
        code: this.authErrorCode(e),
      });
      this.setAuthErrorDelayed(mapFirebaseAuthError(e));
      this.triggerShake();
      this.submitting.set(false);
    }
  }

  protected async google(): Promise<void> {
    this.authError.set(null);
    this.resetSent.set(false);
    this.loginSuccess.set(false);
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
      trackAuthEvent('login_error', {
        method: 'google',
        code: this.authErrorCode(e),
      });
      this.setAuthErrorDelayed(mapFirebaseAuthError(e));
      this.submitting.set(false);
    }
  }

  protected async forgot(): Promise<void> {
    this.authError.set(null);
    this.resetSent.set(false);
    const email = this.form.controls.email.value.trim();
    if (!email || this.form.controls.email.invalid) {
      this.form.controls.email.markAsTouched();
      this.authError.set('Informe um e-mail válido para recuperar a senha.');
      return;
    }
    if (!this.auth.firebaseConfigured()) {
      this.authError.set('Firebase não configurado.');
      return;
    }
    this.submitting.set(true);
    try {
      await this.auth.sendPasswordReset(email);
      this.resetSent.set(true);
    } catch (e) {
      this.setAuthErrorDelayed(mapFirebaseAuthError(e));
    } finally {
      this.submitting.set(false);
    }
  }

  protected devContinue(): void {
    const email = this.form.controls.email.value.trim() || 'atleta@dev.local';
    this.auth.devSignIn(email);
    void this.router.navigateByUrl(this.returnUrl);
  }
}
