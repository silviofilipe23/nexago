import { Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { waitUntil } from './wait-until';
import { getApps, initializeApp } from 'firebase/app';
import { collection, doc, getFirestore, onSnapshot, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { buildContexts, resolveActiveCoach, type CoachContext, type CoachMembership } from './coach-context.logic';
import { roleCanAccess, type AccessMode, type PanelArea } from './coach-roles.model';

const STORAGE_KEY = 'nexago.coach.activeCoachUid';

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Conveniência por navegador — pode lançar (aba anônima, dados bloqueados): nunca é requisito. */
function readStoredCoach(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeCoach(coachUid: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, coachUid);
  } catch {
    /* sem persistência: a escolha vale só nesta sessão */
  }
}

function readMembership(d: QueryDocumentSnapshot): CoachMembership {
  const data = d.data();
  return { coachUid: d.id, role: data['role'], coachName: String(data['coachName'] ?? '') };
}

/**
 * De qual treinador o usuário está vendo os dados. Só DESCOBERTA: a autorização de verdade é das
 * rules/functions, que leem `coaches/{coachUid}/staff/{uid}` ao vivo. A claim `coach` não entra
 * aqui — um membro também a tem.
 */
@Injectable({ providedIn: 'root' })
export class CoachContextService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();
  private readonly injector = inject(Injector);

  private readonly ownExists = signal(false);
  private readonly memberships = signal<CoachMembership[]>([]);
  private readonly preferredUid = signal<string | null>(readStoredCoach());
  private readonly ownReady = signal(false);
  private readonly membershipsReady = signal(false);

  /** `true` quando os dois listeners já responderam (ou falharam) pelo menos uma vez. */
  readonly ready = computed(() => this.ownReady() && this.membershipsReady());

  readonly contexts = computed<CoachContext[]>(() =>
    buildContexts(this.auth.user()?.uid ?? null, this.ownExists(), this.memberships()),
  );
  readonly activeContext = computed(() => resolveActiveCoach(this.contexts(), this.preferredUid()));
  readonly activeCoachUid = computed(() => this.activeContext()?.coachUid ?? null);
  readonly role = computed(() => this.activeContext()?.role ?? null);

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      this.ownExists.set(false);
      this.memberships.set([]);
      this.ownReady.set(false);
      this.membershipsReady.set(false);
      if (!uid) {
        return;
      }

      const stopOwn = onSnapshot(
        doc(this.firestore, 'coaches', uid),
        (snap) => {
          this.ownExists.set(snap.exists());
          this.ownReady.set(true);
        },
        (error) => {
          console.warn('CoachContext: listener falhou', error);
          this.ownExists.set(false);
          this.ownReady.set(true);
        },
      );
      const stopMemberships = onSnapshot(
        collection(this.firestore, 'users', uid, 'coachStaff'),
        (snap) => {
          this.memberships.set(snap.docs.map(readMembership));
          this.membershipsReady.set(true);
        },
        (error) => {
          console.warn('CoachContext: listener falhou', error);
          this.memberships.set([]);
          this.membershipsReady.set(true);
        },
      );
      onCleanup(() => {
        stopOwn();
        stopMemberships();
      });
    });
  }

  /** O cargo do painel ativo cobre a área no modo pedido? Sem painel ativo, não. */
  can(area: PanelArea, mode: AccessMode = 'read'): boolean {
    const role = this.role();
    return role !== null && roleCanAccess(role, area, mode);
  }

  /** Espera o painel de `coachUid` aparecer em `contexts()` (o espelho do membro chega por trigger,
   *  ~1 s depois de aceitar o convite). `false` se não chegar no prazo. Não altera `select()`. */
  whenHasContext(coachUid: string, timeoutMs: number): Promise<boolean> {
    // O effect vive só enquanto houver assinante: firstValueFrom/timeout cancelam a assinatura quando a
    // promessa resolve e o teardown destrói o effect (toObservable no injector raiz vazaria um por chamada).
    const contexts$ = new Observable<CoachContext[]>((subscriber) => {
      const ref = effect(() => subscriber.next(this.contexts()), { injector: this.injector });
      return () => ref.destroy();
    });
    return waitUntil(
      contexts$,
      (list) => list.some((c) => c.coachUid === coachUid),
      timeoutMs,
    );
  }

  select(coachUid: string): void {
    if (!this.contexts().some((c) => c.coachUid === coachUid)) {
      return;
    }
    this.preferredUid.set(coachUid);
    storeCoach(coachUid);
  }
}
