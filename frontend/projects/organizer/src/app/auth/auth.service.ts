import { Injectable, computed, signal } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
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

/** Papéis e privilégio de plataforma lidos do ID token. */
export interface PanelClaims {
  roles: string[];
  superAdmin: boolean;
}

export const EMPTY_CLAIMS: PanelClaims = { roles: [], superAdmin: false };

export function claimsFromToken(claims: Record<string, unknown>): PanelClaims {
  const roles = claims['roles'];
  return {
    roles: Array.isArray(roles) ? roles.map(String) : [],
    superAdmin: claims['superAdmin'] === true,
  };
}

/** Quem tem direito ao `/painel`: o organizador (papel `organizer`) e o super
 *  admin, que entra para dar suporte a torneio alheio. O papel `admin` sozinho
 *  não basta — ele é o acesso do backoffice, não deste portal. */
export function claimsAllowPanel(claims: PanelClaims): boolean {
  return claims.roles.includes('organizer') || claims.superAdmin;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  /** updateProfile() muta o User do Firebase in-place; sem isso, signals que leem user()?.displayName não notificariam. */
  private readonly displayNameOverride = signal<string | null>(null);
  private readonly roleClaims = signal<string[]>([]);
  private readonly superAdminClaim = signal(false);

  readonly authReady = signal(false);
  readonly user = computed(() => this.firebaseUser());
  readonly isAuthenticated = computed(() => this.firebaseUser() != null);
  readonly isOrganizer = computed(() => this.roleClaims().includes('organizer'));
  /** Super admin da plataforma — dá suporte a torneio de qualquer organizador.
   *  A claim nunca chega sozinha numa conta comum: `applyRolesToClaims`
   *  (functions) a apaga quando a conta perde o papel `admin`. */
  readonly isSuperAdmin = computed(() => this.superAdminClaim());
  /** Quem pode abrir o `/painel`: o organizador e o super admin em suporte. */
  readonly canAccessPanel = computed(() => this.isOrganizer() || this.isSuperAdmin());
  readonly displayName = computed(
    () => this.displayNameOverride() ?? this.firebaseUser()?.displayName ?? null,
  );

  private readonly app: FirebaseApp;

  constructor() {
    this.app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
    onAuthStateChanged(this.auth, async (u) => {
      this.firebaseUser.set(u);
      this.displayNameOverride.set(null);
      this.applyClaims(u ? await this.readClaims(u) : EMPTY_CLAIMS);
      this.authReady.set(true);
    });
  }

  private get auth(): Auth {
    return getAuth(this.app);
  }

  private get functions(): Functions {
    return getFunctions(this.app);
  }

  private async readClaims(user: User, forceRefresh = false): Promise<PanelClaims> {
    const token = await user.getIdTokenResult(forceRefresh);
    return claimsFromToken(token.claims);
  }

  private applyClaims(claims: PanelClaims): void {
    this.roleClaims.set(claims.roles);
    this.superAdminClaim.set(claims.superAdmin);
  }

  /** `remember=false` derruba a sessão ao fechar o navegador (browserSessionPersistence). */
  async signInWithEmail(email: string, password: string, remember: boolean): Promise<void> {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    await this.assertPanelAccess(credential.user);
  }

  /** Conta criada com Google (caso comum: o atleta se cadastrou pelo app/portal
   *  do atleta com Google e depois recebeu o papel `organizer`) não tem senha,
   *  então o login por e-mail é impossível pra ela. O popup emite um ID token
   *  novo, então `assertPanelAccess` já enxerga a claim recém-concedida sem
   *  precisar de `getIdToken(true)`. */
  async signInWithGoogle(remember: boolean): Promise<void> {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const credential = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.assertPanelAccess(credential.user);
  }

  /** Confere as claims de acesso de forma síncrona ANTES do login resolver — o
   *  `onAuthStateChanged` do construtor também as atualiza, mas de forma
   *  assíncrona e desacoplada do redirect pós-login; esperar só por ele cria
   *  uma corrida em que `organizerGuard` roda com as claims ainda
   *  desatualizadas (conta some sem erro nenhum — sobretudo pra contas
   *  multi-role recém-promovidas). Mesmo padrão do `assertArenaRole` do
   *  portal arena. */
  private async assertPanelAccess(user: User): Promise<void> {
    const claims = await this.readClaims(user);
    this.applyClaims(claims);
    if (claimsAllowPanel(claims)) return;
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

    this.applyClaims(await this.readClaims(credential.user, true));
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
