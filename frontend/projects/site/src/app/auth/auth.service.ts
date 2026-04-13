import { Injectable, computed, signal } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { environment } from '../../environments/environment';

const DEV_KEY = 'nexago-site-dev-auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  /** Sessão local só quando `environment.devAuthBypass` e sem Firebase. */
  private readonly devSessionEmail = signal<string | null>(null);

  /** True depois do primeiro tick do Auth (Firebase ou restore dev). */
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

  async signInWithGoogle(): Promise<void> {
    const cfg = environment.firebase;
    if (cfg == null || (cfg.apiKey ?? '').length === 0) {
      throw new Error('Firebase não configurado (environment.firebase).');
    }
    if (this.app == null) {
      this.app = getApps().length ? getApps()[0]! : initializeApp(cfg);
    }
    const auth = getAuth(this.app);
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }

  async signOutUser(): Promise<void> {
    this.clearDevSession();
    const cfg = environment.firebase;
    if (cfg != null && (cfg.apiKey ?? '').length > 0 && this.app != null) {
      await signOut(getAuth(this.app));
    }
    this.firebaseUser.set(null);
  }

  /**
   * Só disponível com `devAuthBypass` em build não produção. Útil para testar checkout sem credenciais.
   */
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
