import { Injectable, computed, signal } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  TotpMultiFactorGenerator,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  getMultiFactorResolver,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type Auth,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import { environment } from '../../environments/environment';

/** 'mfa' indica que o login exige a etapa de verificação em /entrar/verificacao. */
export type SignInResult = 'ok' | 'mfa';

function isMfaRequired(error: unknown): error is MultiFactorError {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === 'auth/multi-factor-auth-required'
  );
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  private readonly pendingMfaResolver = signal<MultiFactorResolver | null>(null);
  /** updateProfile() muta o User do Firebase in-place; sem isso, signals que leem user()?.displayName não notificariam. */
  private readonly displayNameOverride = signal<string | null>(null);

  readonly authReady = signal(false);
  readonly user = computed(() => this.firebaseUser());
  readonly isAuthenticated = computed(() => this.firebaseUser() != null);
  readonly mfaPending = computed(() => this.pendingMfaResolver() != null);
  readonly displayName = computed(
    () => this.displayNameOverride() ?? this.firebaseUser()?.displayName ?? null,
  );

  private readonly app: FirebaseApp;

  constructor() {
    this.app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
    onAuthStateChanged(this.auth, (u) => {
      this.firebaseUser.set(u);
      this.displayNameOverride.set(null);
      this.authReady.set(true);
    });
  }

  private get auth(): Auth {
    return getAuth(this.app);
  }

  async signInWithEmail(email: string, password: string): Promise<SignInResult> {
    return this.runSignIn(() => signInWithEmailAndPassword(this.auth, email.trim(), password));
  }

  async signInWithGoogle(): Promise<SignInResult> {
    return this.runSignIn(() => signInWithPopup(this.auth, new GoogleAuthProvider()));
  }

  async signInWithApple(): Promise<SignInResult> {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return this.runSignIn(() => signInWithPopup(this.auth, provider));
  }

  private async runSignIn(fn: () => Promise<unknown>): Promise<SignInResult> {
    this.pendingMfaResolver.set(null);
    try {
      await fn();
      return 'ok';
    } catch (error) {
      if (isMfaRequired(error)) {
        this.pendingMfaResolver.set(getMultiFactorResolver(this.auth, error));
        return 'mfa';
      }
      throw error;
    }
  }

  /** Conclui o login com o código TOTP do app autenticador (segunda etapa). */
  async resolveMfaCode(code: string): Promise<void> {
    const resolver = this.pendingMfaResolver();
    if (resolver == null) {
      throw new Error('Nenhuma verificação pendente. Faça login de novo.');
    }
    const totpHint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (totpHint == null) {
      throw new Error('Método de verificação não suportado neste painel.');
    }
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, code);
    await resolver.resolveSignIn(assertion);
    this.pendingMfaResolver.set(null);
  }

  clearPendingMfa(): void {
    this.pendingMfaResolver.set(null);
  }

  async sendPasswordReset(email: string): Promise<void> {
    const settings = { url: `${location.origin}/entrar` };
    try {
      await sendPasswordResetEmail(this.auth, email.trim(), settings);
    } catch (error) {
      // Domínio de continuação não autorizado no console → envia sem continueUrl.
      if (
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'auth/unauthorized-continue-uri'
      ) {
        await sendPasswordResetEmail(this.auth, email.trim());
        return;
      }
      throw error;
    }
  }

  /** Valida o oobCode do link de redefinição e retorna o e-mail da conta. */
  async verifyResetCode(code: string): Promise<string> {
    return verifyPasswordResetCode(this.auth, code);
  }

  async confirmReset(code: string, newPassword: string): Promise<void> {
    await confirmPasswordReset(this.auth, code, newPassword);
  }

  async createInviteAccount(email: string, password: string, name: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: name.trim() });
  }

  async updateDisplayName(name: string): Promise<void> {
    const user = this.auth.currentUser;
    if (user == null) {
      throw new Error('Sem sessão ativa.');
    }
    const trimmed = name.trim();
    await updateProfile(user, { displayName: trimmed });
    this.displayNameOverride.set(trimmed);
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
  }
}
