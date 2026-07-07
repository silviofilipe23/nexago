import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { trackAuthEvent } from '../auth-telemetry';
import { mapFirebaseAuthError } from '../firebase-auth-errors';
import { AuthService } from '../auth.service';
import { AuthShellComponent } from '../ui/auth-shell.component';
import { PasswordStrengthMeterComponent } from '../ui/password-strength-meter.component';

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;

type ResetState = 'verifying' | 'invalid' | 'ready' | 'done';

@Component({
  selector: 'app-athlete-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, PasswordStrengthMeterComponent],
  templateUrl: './athlete-reset-password.component.html',
  styleUrl: './athlete-reset-password.component.scss',
})
export class AthleteResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private oobCode = '';
  protected readonly state = signal<ResetState>('verifying');
  protected readonly email = signal<string | null>(null);
  protected readonly invalidReason = signal('Este link é inválido ou expirou.');
  protected readonly submitting = signal(false);
  protected readonly authError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    confirmPassword: ['', [Validators.required]],
  });

  constructor() {
    this.oobCode = this.route.snapshot.queryParamMap.get('oobCode') ?? '';
    if (!this.oobCode) {
      this.state.set('invalid');
      return;
    }
    if (!this.auth.firebaseConfigured()) {
      this.invalidReason.set('Firebase não configurado.');
      this.state.set('invalid');
      return;
    }
    void this.verify();
  }

  private async verify(): Promise<void> {
    try {
      const email = await this.auth.verifyResetCode(this.oobCode);
      this.email.set(email);
      this.state.set('ready');
    } catch (e) {
      this.invalidReason.set(mapFirebaseAuthError(e));
      this.state.set('invalid');
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected passwordsMismatch(): boolean {
    const { password, confirmPassword } = this.form.controls;
    return confirmPassword.touched && !!confirmPassword.value && confirmPassword.value !== password.value;
  }

  protected async submit(): Promise<void> {
    this.authError.set(null);
    if (this.form.invalid || this.passwordsMismatch()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.confirmReset(this.oobCode, this.form.controls.password.value);
      trackAuthEvent('password_reset_confirm');
      this.state.set('done');
      await new Promise((r) => window.setTimeout(r, 900));
      await this.router.navigateByUrl('/entrar');
    } catch (e) {
      trackAuthEvent('password_reset_confirm_error');
      this.authError.set(mapFirebaseAuthError(e));
      this.submitting.set(false);
    }
  }
}
