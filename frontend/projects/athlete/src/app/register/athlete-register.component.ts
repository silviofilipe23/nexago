import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { trackAuthEvent } from '../auth/auth-telemetry';
import { mapFirebaseAuthError } from '../auth/firebase-auth-errors';
import { AuthService } from '../auth/auth.service';
import { sanitizeReturnUrl } from '../auth/redirect-url';
import { AuthShellComponent } from '../auth/ui/auth-shell.component';
import { PasswordStrengthMeterComponent } from '../auth/ui/password-strength-meter.component';

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;

@Component({
  selector: 'app-athlete-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, PasswordStrengthMeterComponent],
  templateUrl: './athlete-register.component.html',
  styleUrl: './athlete-register.component.scss',
})
export class AthleteRegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly authError = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  returnUrl = '/onboarding';

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
  });

  constructor() {
    const q = this.route.snapshot.queryParamMap.get('redirect');
    this.returnUrl = sanitizeReturnUrl(q, '/onboarding', { trustedOrigins: environment.trustedReturnOrigins });
    toObservable(this.auth.authReady)
      .pipe(filter((ready) => ready), take(1), takeUntilDestroyed())
      .subscribe(() => {
        if (this.auth.isAuthenticated()) {
          void this.router.navigateByUrl(this.returnUrl);
        }
      });
  }

  protected firebaseConfigured(): boolean {
    return this.auth.firebaseConfigured();
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  private authErrorCode(e: unknown): string | undefined {
    if (e && typeof e === 'object' && 'code' in e) {
      return String((e as { code: string }).code);
    }
    return undefined;
  }

  protected async submit(): Promise<void> {
    this.authError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.auth.firebaseConfigured()) {
      this.authError.set('Configure o Firebase em environment para criar conta com e-mail e senha.');
      return;
    }

    const { name, email, password } = this.form.getRawValue();
    trackAuthEvent('signup_attempt', { method: 'email' });
    this.submitting.set(true);
    try {
      await this.auth.signUpWithEmail(name, email, password);
      trackAuthEvent('signup_success', { method: 'email' });
      await this.router.navigateByUrl(this.returnUrl);
    } catch (e) {
      trackAuthEvent('signup_error', { method: 'email', code: this.authErrorCode(e) });
      this.authError.set(mapFirebaseAuthError(e));
      this.submitting.set(false);
    }
  }

  protected async google(): Promise<void> {
    this.authError.set(null);
    if (!this.auth.firebaseConfigured()) {
      this.authError.set('Configure o Firebase para usar Google.');
      return;
    }
    trackAuthEvent('signup_attempt', { method: 'google' });
    this.submitting.set(true);
    try {
      await this.auth.signInWithGoogle();
      trackAuthEvent('signup_success', { method: 'google' });
      await this.router.navigateByUrl(this.returnUrl);
    } catch (e) {
      trackAuthEvent('signup_error', { method: 'google', code: this.authErrorCode(e) });
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
    trackAuthEvent('signup_attempt', { method: 'apple' });
    this.submitting.set(true);
    try {
      await this.auth.signInWithApple();
      trackAuthEvent('signup_success', { method: 'apple' });
      await this.router.navigateByUrl(this.returnUrl);
    } catch (e) {
      trackAuthEvent('signup_error', { method: 'apple', code: this.authErrorCode(e) });
      this.authError.set(mapFirebaseAuthError(e));
      this.submitting.set(false);
    }
  }
}
