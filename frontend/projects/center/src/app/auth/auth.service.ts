import { Injectable, computed, signal } from '@angular/core';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth';
import { auth } from '../data/firebase';

/**
 * Sessão do portal. Diferente do portal do treinador, aqui não existe claim de papel: qualquer
 * conta NexaGO entra, e o que ela vê depende dos vínculos com centros
 * (`trainingCenters/{id}/centerMembers/{uid}`), lidos pelo `CenterContextService`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  /** `updateProfile`/`reload` mutam o User in-place; o contador força os computeds a recalcular. */
  private readonly version = signal(0);

  readonly authReady = signal(false);
  readonly user = computed(() => {
    this.version();
    return this.firebaseUser();
  });
  readonly isAuthenticated = computed(() => this.firebaseUser() != null);
  readonly uid = computed(() => this.firebaseUser()?.uid ?? null);
  readonly email = computed(() => this.user()?.email?.toLowerCase() ?? null);
  readonly emailVerified = computed(() => this.user()?.emailVerified ?? false);
  readonly displayName = computed(() => {
    const u = this.user();
    return u?.displayName?.trim() || u?.email?.split('@')[0] || 'Você';
  });

  constructor() {
    onAuthStateChanged(auth(), (u) => {
      this.firebaseUser.set(u);
      this.version.update((v) => v + 1);
      this.authReady.set(true);
    });
  }

  /** `remember=false` derruba a sessão ao fechar o navegador. */
  async signInWithEmail(email: string, password: string, remember: boolean): Promise<void> {
    await setPersistence(auth(), remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth(), email.trim(), password);
  }

  /** Retorna `false` se o usuário fechou o popup. */
  async signInWithGoogle(remember: boolean): Promise<boolean> {
    await setPersistence(auth(), remember ? browserLocalPersistence : browserSessionPersistence);
    try {
      await signInWithPopup(auth(), new GoogleAuthProvider());
      return true;
    } catch (error) {
      const code = errorCode(error);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return false;
      }
      throw error;
    }
  }

  /** Conta NexaGO nova (a mesma conta serve pros torneios no app). Já dispara a verificação. */
  async createAccount(email: string, password: string, displayName: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(auth(), email.trim(), password);
    await updateProfile(credential.user, { displayName: displayName.trim() });
    this.version.update((v) => v + 1);
    await this.sendVerification().catch(() => undefined);
  }

  async sendVerification(): Promise<void> {
    const u = auth().currentUser;
    if (!u) {
      throw new Error('Usuário não autenticado.');
    }
    try {
      await sendEmailVerification(u, { url: `${location.origin}/centros` });
    } catch (error) {
      if (errorCode(error) === 'auth/unauthorized-continue-uri') {
        await sendEmailVerification(u);
        return;
      }
      throw error;
    }
  }

  /** Relê o usuário (ex.: depois de clicar no link de verificação) e renova o token. */
  async refreshUser(): Promise<void> {
    const u = auth().currentUser;
    if (!u) {
      return;
    }
    await reload(u);
    await u.getIdToken(true);
    this.version.update((v) => v + 1);
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth(), email.trim(), { url: `${location.origin}/entrar` });
    } catch (error) {
      if (errorCode(error) === 'auth/unauthorized-continue-uri') {
        await sendPasswordResetEmail(auth(), email.trim());
        return;
      }
      throw error;
    }
  }

  verifyResetCode(code: string): Promise<string> {
    return verifyPasswordResetCode(auth(), code);
  }

  confirmReset(code: string, newPassword: string): Promise<void> {
    return confirmPasswordReset(auth(), code, newPassword);
  }

  async signOutUser(): Promise<void> {
    await signOut(auth());
  }
}

export function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
}
