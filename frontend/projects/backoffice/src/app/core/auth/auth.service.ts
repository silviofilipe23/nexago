import { Injectable, signal } from '@angular/core';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';

import { firebaseAuth } from '../../firebase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = firebaseAuth;

  /** Current Firebase user, or null when signed out. */
  readonly user = signal<User | null>(null);

  private resolveReady!: () => void;
  private readyDone = false;

  /** Resolves after the first auth state event (initial session restored or signed out). */
  readonly whenReady = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      if (!this.readyDone) {
        this.readyDone = true;
        this.resolveReady();
      }
    });
  }

  signIn(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  signOut() {
    return signOut(this.auth);
  }
}
