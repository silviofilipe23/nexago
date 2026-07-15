import { Injectable, computed, signal } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth';
import { environment } from '../../environments/environment';

const DEV_KEY = 'nexago-athlete-dev-auth';

/** Roles que nunca devem acessar o portal do atleta (papéis de outros portais). */
const NON_ATHLETE_ROLES = ['admin', 'arena', 'organizer'];

/** Doc ausente ou sem `roles` conta como atleta (default do cadastro). Só
 *  bloqueia quando `roles[]` traz, de forma explícita, papel de outro portal. */
function docHasNonAthleteRole(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const roles = data['roles'];
  return Array.isArray(roles) && roles.some((r) => NON_ATHLETE_ROLES.includes(String(r)));
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  private readonly devSessionEmail = signal<string | null>(null);

  readonly authReady = signal(false);
  readonly user = computed<User | null>(() => this.firebaseUser());
  readonly devEmail = computed(() => this.devSessionEmail());

  readonly isAuthenticated = computed(() => {
    if (this.firebaseUser() != null) {
      return true;
    }
    if (environment.devAuthBypass && !environment.production && this.devSessionEmail() != null) {
      return true;
    }
    return false;
  });

  private app: FirebaseApp | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    const cfg = environment.firebase;
    const hasFirebase = (cfg?.apiKey ?? '').length > 0;

    if (hasFirebase && cfg != null) {
      this.app = getApps().length ? getApps()[0]! : initializeApp(cfg);
      const auth = getAuth(this.app);
      onAuthStateChanged(auth, (u) => {
        this.firebaseUser.set(u);
        this.authReady.set(true);
      });
    } else {
      if (environment.devAuthBypass && !environment.production) {
        try {
          const raw = sessionStorage.getItem(DEV_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as { email?: string };
            if (typeof parsed.email === 'string' && parsed.email.length > 0) {
              this.devSessionEmail.set(parsed.email);
            }
          }
        } catch {
          sessionStorage.removeItem(DEV_KEY);
        }
      }
      this.authReady.set(true);
    }
  }

  private ensureAuth() {
    const cfg = environment.firebase;
    if (cfg == null || (cfg.apiKey ?? '').length === 0) {
      throw new Error('Firebase não configurado (environment.firebase).');
    }
    if (this.app == null) {
      this.app = getApps().length ? getApps()[0]! : initializeApp(cfg);
    }
    return getAuth(this.app);
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    const auth = this.ensureAuth();
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    await this.assertAthleteRole(credential.user.uid);
  }

  async signInWithGoogle(): Promise<void> {
    const auth = this.ensureAuth();
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    await this.assertAthleteRole(credential.user.uid);
  }

  async signInWithApple(): Promise<void> {
    const auth = this.ensureAuth();
    const provider = new OAuthProvider('apple.com');
    const credential = await signInWithPopup(auth, provider);
    await this.assertAthleteRole(credential.user.uid);
  }

  async signUpWithEmail(name: string, email: string, password: string): Promise<void> {
    const auth = this.ensureAuth();
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const trimmedName = name.trim();
    if (trimmedName) {
      await updateProfile(credential.user, { displayName: trimmedName });
    }
    // Defesa extra: cobre o caso raro de já existir um users/{uid} com outro
    // papel (ex.: pré-cadastro por convite) antes do próprio cadastro Auth.
    await this.assertAthleteRole(credential.user.uid);
  }

  /** Bloqueia e desloga quem tem papel de outro portal (arena/organizador/admin).
   *  Doc ausente ou sem `roles[]` é tratado como atleta (mesma regra do
   *  firestore.rules na criação do doc — roles[] é opcional, padrão é atleta). */
  private async assertAthleteRole(uid: string): Promise<void> {
    const cfg = environment.firebase;
    if (cfg == null || (cfg.apiKey ?? '').length === 0) return;
    try {
      const [{ doc, getDoc, getFirestore }] = await Promise.all([import('firebase/firestore')]);
      const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
      const snap = await getDoc(doc(getFirestore(app), 'users', uid));
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
      if (!docHasNonAthleteRole(data)) return;
    } catch {
      // Falha ao ler o perfil não deve travar o login de um atleta legítimo —
      // segue sem bloquear; o bloqueio só age quando a checagem POSITIVAMENTE
      // encontra um papel de outro portal.
      return;
    }
    await this.signOutUser();
    throw new Error(
      'Esta conta não é uma conta de atleta. Use o portal correspondente ao seu perfil (arena, organizador ou administrador).',
    );
  }

  async sendPasswordReset(email: string): Promise<void> {
    const auth = this.ensureAuth();
    await sendPasswordResetEmail(auth, email.trim());
  }

  /** Retorna o e-mail associado ao link de redefinição (lança se o oobCode for inválido/expirado). */
  async verifyResetCode(oobCode: string): Promise<string> {
    const auth = this.ensureAuth();
    return verifyPasswordResetCode(auth, oobCode);
  }

  async confirmReset(oobCode: string, newPassword: string): Promise<void> {
    const auth = this.ensureAuth();
    await confirmPasswordReset(auth, oobCode, newPassword);
  }

  async signOutUser(): Promise<void> {
    this.clearDevSession();
    const cfg = environment.firebase;
    if (cfg != null && (cfg.apiKey ?? '').length > 0 && this.app != null) {
      await signOut(getAuth(this.app));
    }
    this.firebaseUser.set(null);
  }

  devSignIn(email = 'atleta@dev.local'): void {
    if (!environment.devAuthBypass || environment.production) {
      return;
    }
    const trimmed = email.trim() || 'atleta@dev.local';
    sessionStorage.setItem(DEV_KEY, JSON.stringify({ email: trimmed }));
    this.devSessionEmail.set(trimmed);
  }

  clearDevSession(): void {
    sessionStorage.removeItem(DEV_KEY);
    this.devSessionEmail.set(null);
  }

  showDevBypass(): boolean {
    return environment.devAuthBypass && !environment.production;
  }

  firebaseConfigured(): boolean {
    const cfg = environment.firebase;
    return cfg != null && (cfg.apiKey ?? '').length > 0;
  }
}
