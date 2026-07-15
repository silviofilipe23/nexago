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

/** Papéis (roles[]) que autorizam login no portal arena. */
const ARENA_ROLE = 'arena';

/** Só autoriza quando o doc TEM, de forma explícita, a role `arena` em
 *  `roles[]` — allowlist, diferente do blocklist do portal atleta. */
function docHasArenaRole(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const roles = data['roles'];
  return Array.isArray(roles) && roles.some((r) => String(r) === ARENA_ROLE);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  /** updateProfile() muta o User do Firebase in-place; sem isso, signals que leem user()?.displayName não notificariam. */
  private readonly displayNameOverride = signal<string | null>(null);

  readonly authReady = signal(false);
  readonly user = computed(() => this.firebaseUser());
  readonly isAuthenticated = computed(() => this.firebaseUser() != null);
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

  private get functions(): Functions {
    return getFunctions(this.app);
  }

  /** `remember=false` derruba a sessão ao fechar o navegador (browserSessionPersistence). */
  async signInWithEmail(email: string, password: string, remember: boolean): Promise<void> {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    await this.assertArenaRole(credential.user.uid);
  }

  /** Só deixa entrar quem tem a role `arena` em `users/{uid}` (allowlist — ao
   *  contrário do portal atleta, ausência de role NÃO passa). Falha de leitura
   *  também bloqueia (fail-closed): este portal expõe dados sensíveis de
   *  gestão/financeiro, então não dá pra deixar passar sem confirmar a role. */
  private async assertArenaRole(uid: string): Promise<void> {
    let hasArenaRole: boolean;
    try {
      const [{ doc, getDoc, getFirestore }] = await Promise.all([import('firebase/firestore')]);
      const snap = await getDoc(doc(getFirestore(this.app), 'users', uid));
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
      hasArenaRole = docHasArenaRole(data);
    } catch {
      await this.signOutUser();
      throw new Error('Não foi possível verificar sua conta. Tente novamente.');
    }
    if (hasArenaRole) return;
    await this.signOutUser();
    throw new Error(
      'Esta conta não é uma conta de arena. Use o portal correspondente ao seu perfil.',
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

  /** Cria a conta da arena (etapa "Cadastrar arena") e completa o autocadastro via
   *  Cloud Function, que define a claim/role `arena` e mirra em `users/{uid}` — o
   *  client nunca escreve role diretamente (firestore.rules recusa). Dados de perfil
   *  (CNPJ, cidade, WhatsApp) ainda não têm um destino no backend — ficam só no
   *  formulário por enquanto. */
  async createArenaAccount(email: string, password: string, arenaName: string): Promise<void> {
    const trimmedName = arenaName.trim();
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: trimmedName });

    const complete = httpsCallable(this.functions, 'completeArenaSignup');
    await complete({ arenaName: trimmedName });
    await credential.user.getIdToken(true);

    await this.assertArenaRole(credential.user.uid);
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
  }
}
