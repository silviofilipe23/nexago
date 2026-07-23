import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import type { RecaptchaVerifier } from 'firebase/auth';
import { mapFirebaseAuthError } from '../../auth/firebase-auth-errors';
import { PhoneVerificationService, type PhoneVerificationSession } from './phone-verification.service';
import { isValidPhoneNumber } from './phone-verification.util';

type Step = 'phone' | 'code';

const RESEND_COOLDOWN_SECONDS = 30;

let nextInstanceId = 0;

/** Verificação de telefone por SMS (Firebase Phone Auth), em 2 passos: número
 *  + reCAPTCHA invisível, depois código de 6 dígitos. Usado no onboarding
 *  (primeira verificação) e na tela de perfil (troca de número) — a
 *  ramificação link/update fica no `PhoneVerificationService`. */
@Component({
  selector: 'app-phone-verification',
  standalone: true,
  templateUrl: './phone-verification.component.html',
  styleUrl: './phone-verification.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhoneVerificationComponent {
  private readonly service = inject(PhoneVerificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly recaptchaContainerId = `phone-verification-recaptcha-${nextInstanceId++}`;

  protected readonly step = signal<Step>('phone');
  protected readonly phone = signal('');
  protected readonly code = signal('');
  protected readonly sending = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resendCooldown = signal(0);

  protected readonly phoneValid = computed(() => isValidPhoneNumber(this.phone()));
  protected readonly codeValid = computed(() => /^\d{6}$/.test(this.code()));

  private session: PhoneVerificationSession | null = null;
  private verifier: RecaptchaVerifier | null = null;
  private cooldownTimer: ReturnType<typeof setInterval> | undefined;

  readonly verified = output<{ phoneNumber: string }>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearInterval(this.cooldownTimer);
      this.verifier?.clear();
    });
  }

  protected setPhone(value: string): void {
    this.phone.set(value);
  }

  protected setCode(value: string): void {
    this.code.set(value.replace(/\D/g, '').slice(0, 6));
  }

  protected async sendCode(): Promise<void> {
    if (!this.phoneValid() || this.sending() || this.resendCooldown() > 0) return;
    this.error.set(null);
    this.sending.set(true);
    try {
      // Instância nova a cada envio — a anterior não pode ser reaproveitada.
      this.verifier?.clear();
      this.verifier = this.service.createRecaptchaVerifier(this.recaptchaContainerId);
      this.session = await this.service.sendCode(this.phone(), this.verifier);
      this.code.set('');
      this.step.set('code');
      this.startCooldown();
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.sending.set(false);
    }
  }

  protected async confirmCode(): Promise<void> {
    const session = this.session;
    if (!this.codeValid() || this.confirming() || !session) return;
    this.error.set(null);
    this.confirming.set(true);
    try {
      const phoneNumber = await this.service.confirmCode(session, this.code());
      this.verified.emit({ phoneNumber });
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.confirming.set(false);
    }
  }

  protected changeNumber(): void {
    this.step.set('phone');
    this.code.set('');
    this.error.set(null);
    this.session = null;
  }

  private startCooldown(): void {
    this.resendCooldown.set(RESEND_COOLDOWN_SECONDS);
    clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      if (next <= 0) {
        clearInterval(this.cooldownTimer);
        this.resendCooldown.set(0);
      } else {
        this.resendCooldown.set(next);
      }
    }, 1000);
  }
}
