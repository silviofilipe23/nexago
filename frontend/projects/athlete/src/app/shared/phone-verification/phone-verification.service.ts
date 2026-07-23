import { Injectable, inject } from '@angular/core';
import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  updatePhoneNumber,
} from 'firebase/auth';
import { AuthService } from '../../auth/auth.service';
import { athleteFunctions } from '../../data/functions';
import { confirmPhoneVerification } from '../../data/phone-verification-repository';
import { phoneLinkMethod, toE164BR } from './phone-verification.util';

/** Abstrai as duas formas de confirmar o código SMS do Firebase Phone Auth —
 *  `ConfirmationResult.confirm` (primeira verificação, via `linkWithPhoneNumber`)
 *  e `updatePhoneNumber` com credential manual (troca de número, ver
 *  `phoneLinkMethod`) — atrás da mesma interface pro componente. */
export interface PhoneVerificationSession {
  confirm(code: string): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class PhoneVerificationService {
  private readonly auth = inject(AuthService);

  /** Uma instância nova a cada tentativa de envio — não reusar entre "enviar" e "reenviar". */
  createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
    return new RecaptchaVerifier(this.auth.getAuthInstance(), containerId, { size: 'invisible' });
  }

  /** Envia o SMS com o código. Ramifica entre `linkWithPhoneNumber` (primeira
   *  verificação) e `verifyPhoneNumber`+`updatePhoneNumber` (troca de número,
   *  quando a conta já tem uma credencial de telefone vinculada). */
  async sendCode(phoneNumberRaw: string, verifier: RecaptchaVerifier): Promise<PhoneVerificationSession> {
    const phone = toE164BR(phoneNumberRaw);
    if (!phone) {
      throw new Error('Número de telefone inválido.');
    }
    const user = this.auth.user();
    if (!user) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const method = phoneLinkMethod(user.providerData.map((p) => p.providerId));
    if (method === 'link') {
      const confirmationResult = await linkWithPhoneNumber(user, phone, verifier);
      return {
        confirm: async (code) => {
          await confirmationResult.confirm(code);
        },
      };
    }

    const provider = new PhoneAuthProvider(this.auth.getAuthInstance());
    const verificationId = await provider.verifyPhoneNumber(phone, verifier);
    return {
      confirm: async (code) => {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        await updatePhoneNumber(user, credential);
      },
    };
  }

  /** Confirma o código digitado e grava o telefone verificado em `users/{uid}`
   *  via `confirmPhoneVerification` (Cloud Function, Admin SDK). */
  async confirmCode(session: PhoneVerificationSession, code: string): Promise<string> {
    await session.confirm(code);
    const result = await confirmPhoneVerification(athleteFunctions());
    return result.phoneNumber;
  }
}
