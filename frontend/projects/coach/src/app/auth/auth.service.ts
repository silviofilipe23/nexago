import { Injectable, computed, signal } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { FUNCTIONS_REGION } from '@nexago/firebase-config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  /** updateProfile() muta o User do Firebase in-place; sem isso, signals que leem user()?.displayName não notificariam. */
  private readonly displayNameOverride = signal<string | null>(null);
  private readonly roleClaims = signal<string[]>([]);

  readonly authReady = signal(false);
  readonly user = computed(() => this.firebaseUser());
  readonly isAuthenticated = computed(() => this.firebaseUser() != null);
  readonly isCoach = computed(() => this.roleClaims().includes('coach'));
  readonly displayName = computed(
    () => this.displayNameOverride() ?? this.firebaseUser()?.displayName ?? null,
  );

  private readonly app: FirebaseApp;

  constructor() {
    this.app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
    onAuthStateChanged(this.auth, async (u) => {
      this.firebaseUser.set(u);
      this.displayNameOverride.set(null);
      this.roleClaims.set(u ? await this.readRoleClaims(u) : []);
      this.authReady.set(true);
    });
  }

  private get auth(): Auth {
    return getAuth(this.app);
  }

  private get functions(): Functions {
    return getFunctions(this.app, FUNCTIONS_REGION);
  }

  private async readRoleClaims(user: User): Promise<string[]> {
    const token = await user.getIdTokenResult();
    const roles = token.claims['roles'];
    return Array.isArray(roles) ? roles.map(String) : [];
  }

  /** Relê as claims do ID token (forçando refresh) — usado depois de entrar numa comissão,
   *  quando o servidor acabou de conceder a claim `coach`. */
  async refreshClaims(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }
    const roles = (await user.getIdTokenResult(true)).claims['roles'];
    this.roleClaims.set(Array.isArray(roles) ? roles.map(String) : []);
  }

  /** `remember=false` derruba a sessão ao fechar o navegador (browserSessionPersistence). */
  async signInWithEmail(email: string, password: string, remember: boolean): Promise<void> {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  /** Login com Google. `provision=false` (tela de entrar) só admite quem já é
   *  treinador — conta sem a claim é deslogada e recebe erro, pra um atleta não
   *  virar treinador sem querer. `provision=true` (tela de cadastro) completa o
   *  autocadastro via Cloud Function, preservando os papéis existentes.
   *  Retorna `false` se o usuário fechou o popup. */
  async signInWithGoogle(remember: boolean, provision: boolean): Promise<boolean> {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    let user: User;
    try {
      user = (await signInWithPopup(this.auth, new GoogleAuthProvider())).user;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return false;
      }
      throw error;
    }

    let roles = await this.readRoleClaims(user);
    if (!roles.includes('coach')) {
      if (!provision) {
        await this.signOutUser();
        throw new Error(
          'Esta conta Google ainda não é de treinador. Use "Cadastrar como treinador".',
        );
      }
      const displayName = user.displayName?.trim() || user.email?.split('@')[0] || 'Treinador';
      await httpsCallable(this.functions, 'completeCoachSignup')({ displayName, phone: '' });
      const refreshed = (await user.getIdTokenResult(true)).claims['roles'];
      roles = Array.isArray(refreshed) ? refreshed.map(String) : [];
    }
    // Atualiza já, pra o coachGuard não rodar com claims antigas antes do onAuthStateChanged.
    this.roleClaims.set(roles);
    return true;
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

  /** Cria a conta do treinador (Firebase Auth) e completa o autocadastro via
   *  Cloud Function, que define a claim `coach` e cria `coaches/{uid}` — o
   *  client nunca escreve claims/perfil diretamente. Força o refresh do ID
   *  token pra `isCoach()` já refletir a claim nova sem precisar relogar. */
  async createCoachAccount(email: string, password: string, displayName: string, phone: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: displayName.trim() });

    const complete = httpsCallable(this.functions, 'completeCoachSignup');
    await complete({ displayName: displayName.trim(), phone: phone.trim() });

    const refreshed = await credential.user.getIdTokenResult(true);
    const roles = refreshed.claims['roles'];
    this.roleClaims.set(Array.isArray(roles) ? roles.map(String) : []);
  }

  /** Mantém o displayName do Firebase Auth (usado no rodapé da sidebar) em sincronia com o editado no Perfil. */
  async updateDisplayName(name: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Usuário não autenticado.');
    }
    await updateProfile(user, { displayName: name.trim() });
    this.displayNameOverride.set(name.trim());
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
  }
}
