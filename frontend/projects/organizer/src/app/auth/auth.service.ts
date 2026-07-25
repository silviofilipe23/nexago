import { Injectable, computed, signal } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  /** updateProfile() muta o User do Firebase in-place; sem isso, signals que leem user()?.displayName não notificariam. */
  private readonly displayNameOverride = signal<string | null>(null);
  private readonly roleClaims = signal<string[]>([]);

  readonly authReady = signal(false);
  readonly user = computed(() => this.firebaseUser());
  readonly isAuthenticated = computed(() => this.firebaseUser() != null);
  readonly isOrganizer = computed(() => this.roleClaims().includes('organizer'));
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
    return getFunctions(this.app);
  }

  private async readRoleClaims(user: User): Promise<string[]> {
    const token = await user.getIdTokenResult();
    const roles = token.claims['roles'];
    return Array.isArray(roles) ? roles.map(String) : [];
  }

  /** `remember=false` derruba a sessão ao fechar o navegador (browserSessionPersistence). */
  async signInWithEmail(email: string, password: string, remember: boolean): Promise<void> {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    await this.assertOrganizerRole(credential.user);
  }

  /** Confere a claim `organizer` de forma síncrona ANTES do login resolver — o
   *  `onAuthStateChanged` do construtor também atualiza `roleClaims`, mas de
   *  forma assíncrona e desacoplada do redirect pós-login; esperar só por ele
   *  cria uma corrida em que `organizerGuard` roda com `roleClaims` ainda
   *  desatualizado (conta some sem erro nenhum — sobretudo pra contas
   *  multi-role recém-promovidas). Mesmo padrão do `assertArenaRole` do
   *  portal arena. */
  private async assertOrganizerRole(user: User): Promise<void> {
    const roles = await this.readRoleClaims(user);
    this.roleClaims.set(roles);
    if (roles.includes('organizer')) return;
    await this.signOutUser();
    throw new Error(
      'Esta conta não tem acesso ao painel do organizador. Use o portal correspondente ao seu perfil.',
    );
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

  /** Cria a conta do organizador (Firebase Auth) e completa o autocadastro via
   *  Cloud Function, que define a claim `organizer` — o client nunca escreve
   *  claims diretamente. Força o refresh do ID token pra `isOrganizer()` já
   *  refletir a claim nova sem precisar relogar. */
  async createOrganizerAccount(email: string, password: string, displayName: string, phone: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: displayName.trim() });

    const complete = httpsCallable(this.functions, 'completeOrganizerSignup');
    await complete({ displayName: displayName.trim(), phone: phone.trim() });

    const refreshed = await credential.user.getIdTokenResult(true);
    const roles = refreshed.claims['roles'];
    this.roleClaims.set(Array.isArray(roles) ? roles.map(String) : []);
  }

  /** Mantém o displayName do Firebase Auth em sincronia com o editado no Perfil (tela futura). */
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
