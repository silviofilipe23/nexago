import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { trackAuthEvent } from '../auth-telemetry';
import { mapFirebaseAuthError } from '../firebase-auth-errors';
import { AuthService } from '../auth.service';
import { sanitizeReturnUrl } from '../redirect-url';
import { AuthShellComponent } from '../ui/auth-shell.component';

@Component({
  selector: 'app-athlete-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  templateUrl: './athlete-forgot-password.component.html',
  styleUrl: './athlete-forgot-password.component.scss',
})
export class AthleteForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly authError = signal<string | null>(null);
  returnUrl = '/painel';

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    const q = this.route.snapshot.queryParamMap.get('redirect');
    this.returnUrl = sanitizeReturnUrl(q, '/painel', { trustedOrigins: environment.trustedReturnOrigins });
  }

  protected firebaseConfigured(): boolean {
    return this.auth.firebaseConfigured();
  }

  protected async submit(): Promise<void> {
    this.authError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.auth.firebaseConfigured()) {
      this.authError.set('Firebase não configurado.');
      return;
    }

    const email = this.form.controls.email.value.trim();
    this.submitting.set(true);
    try {
      await this.auth.sendPasswordReset(email);
      trackAuthEvent('password_reset_request');
    } catch (e) {
      trackAuthEvent('password_reset_request_error');
      // auth/user-not-found não vira erro visível: a cópia da tela seguinte já é
      // condicional ("se X tiver conta...") de propósito, pra não confirmar pra
      // quem está tentando se existe conta com aquele e-mail.
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (code !== 'auth/user-not-found') {
        this.authError.set(mapFirebaseAuthError(e));
        this.submitting.set(false);
        return;
      }
    }
    await this.router.navigate(['/email-enviado'], {
      queryParams: { email, redirect: this.returnUrl },
    });
  }
}
