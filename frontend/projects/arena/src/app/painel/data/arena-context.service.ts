import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { collection, limit, onSnapshot, query, where, type QueryDocumentSnapshot, type Unsubscribe } from 'firebase/firestore';
import { AuthService } from '../../auth/auth.service';
import {
  ARENA_PLAN_STATUS_NONE,
  arenaCapabilitiesFor,
  arenaPlanEntitledAt,
  arenaPlanStatusFromDoc,
  type ArenaCapability,
  type ArenaPlanStatus,
} from './arena-plan.model';
import { arenaFirestore } from './firestore';

export interface ArenaBrief {
  id: string;
  name: string;
}

interface ArenaDocData {
  id: string;
  name: string;
  logoUrl: string | null;
  planStatus: ArenaPlanStatus;
  courtsCount: number;
}

const SELECTED_ARENA_STORAGE_PREFIX = 'nx_arena_selected_';

function arenaNameOf(data: Record<string, unknown>): string {
  return typeof data['name'] === 'string' && data['name'].trim() ? data['name'] : 'Minha arena';
}

/** Mesma precedência que o site usa para a marca da arena (`logoUrl` → `logo` → `coverUrl`). */
function arenaLogoOf(data: Record<string, unknown>): string | null {
  for (const key of ['logoUrl', 'logo', 'coverUrl']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function parseArenaDoc(doc: QueryDocumentSnapshot): ArenaDocData {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    name: arenaNameOf(data),
    logoUrl: arenaLogoOf(data),
    planStatus: arenaPlanStatusFromDoc(data),
    courtsCount: typeof data['courtsCount'] === 'number' ? data['courtsCount'] : 0,
  };
}

/** Resolve a(s) arena(s) gerida(s) pelo usuário logado (`arenas` onde `managerUserId == uid`) e
 *  deriva titularidade/capabilities de plano — fonte única para todas as telas do painel.
 *
 *  Mantém um listener ao vivo (`onSnapshot`), não uma leitura única: o plano da arena muda no
 *  servidor sem nenhuma ação do usuário no painel (webhook do Asaas confirmando pagamento,
 *  o sweeper diário `finalizeLapsedArenaPlans` pausando plano vencido, o trigger que
 *  incrementa/decrementa `courtsCount`) — com leitura única, essas mudanças só apareciam após
 *  recarregar a página inteira.
 *
 *  Um gestor pode ter mais de uma arena (mesmo `managerUserId` em vários docs `arenas`). Nesse
 *  caso nenhuma é escolhida automaticamente — `needsSelection()` fica true até `selectArena()`
 *  ser chamado, e `arenaSelectionGuard` força a rota `/painel/selecionar-arena` enquanto isso. */
@Injectable({ providedIn: 'root' })
export class ArenaContextService {
  private readonly auth = inject(AuthService);

  private readonly managedDocs = signal<QueryDocumentSnapshot[]>([]);
  private readonly selectedArenaIdSignal = signal<string | null>(null);
  private readonly loadingSignal = signal(true);
  /** Autenticado com role arena, mas nenhuma arena aponta pra este uid — ex.: cadastro
   *  self-service, que hoje só cria o usuário/role, sem o doc `arenas/{arenaId}`. */
  private readonly notFoundSignal = signal(false);
  private unsubscribe: Unsubscribe | null = null;
  private currentUid: string | null = null;

  readonly loading = computed(() => this.loadingSignal());
  readonly notFound = computed(() => this.notFoundSignal());

  readonly managedArenas = computed<ArenaBrief[]>(() =>
    this.managedDocs().map((doc) => ({ id: doc.id, name: arenaNameOf(doc.data() as Record<string, unknown>) })),
  );

  /** True quando há mais de uma arena gerida por este usuário e nenhuma foi escolhida ainda. */
  readonly needsSelection = computed(() => this.managedArenas().length > 1 && this.selectedArenaIdSignal() == null);

  readonly selectedArenaId = computed(() => this.selectedArenaIdSignal());

  private readonly arenaDoc = computed<ArenaDocData | null>(() => {
    const docs = this.managedDocs();
    if (docs.length === 0) return null;
    const targetId = this.selectedArenaIdSignal() ?? (docs.length === 1 ? docs[0]!.id : null);
    if (!targetId) return null;
    const doc = docs.find((d) => d.id === targetId);
    return doc ? parseArenaDoc(doc) : null;
  });

  readonly arenaId = computed(() => this.arenaDoc()?.id ?? null);
  readonly arenaName = computed(() => this.arenaDoc()?.name ?? null);
  readonly arenaLogoUrl = computed(() => this.arenaDoc()?.logoUrl ?? null);
  readonly planStatus = computed(() => this.arenaDoc()?.planStatus ?? ARENA_PLAN_STATUS_NONE);
  readonly courtsCount = computed(() => this.arenaDoc()?.courtsCount ?? 0);

  readonly entitled = computed(() => {
    const doc = this.arenaDoc();
    return doc != null && arenaPlanEntitledAt(doc.planStatus, new Date());
  });

  readonly capabilities = computed<ReadonlySet<ArenaCapability>>(() => {
    const doc = this.arenaDoc();
    if (doc == null) return new Set<ArenaCapability>();
    return arenaCapabilitiesFor(doc.planStatus.tier, this.entitled());
  });

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      const user = this.auth.user();

      this.unsubscribe?.();
      this.unsubscribe = null;

      if (!ready) return;
      if (!user) {
        this.currentUid = null;
        this.managedDocs.set([]);
        this.selectedArenaIdSignal.set(null);
        this.notFoundSignal.set(false);
        this.loadingSignal.set(false);
        return;
      }
      this.watchArenas(user.uid);
    });
  }

  hasCapability(capability: ArenaCapability): boolean {
    return this.capabilities().has(capability);
  }

  /** Escolhe qual das arenas geridas fica ativa (persistida no localStorage por uid, então
   *  sobrevive a um F5 — mas é só uma preferência de sessão, não afeta o backend). */
  selectArena(arenaId: string): void {
    this.selectedArenaIdSignal.set(arenaId);
    if (this.currentUid) {
      try {
        localStorage.setItem(SELECTED_ARENA_STORAGE_PREFIX + this.currentUid, arenaId);
      } catch {
        // localStorage indisponível (ex.: modo privado) — seleção dura só a sessão em memória.
      }
    }
  }

  private watchArenas(uid: string): void {
    this.currentUid = uid;
    this.loadingSignal.set(true);
    const db = arenaFirestore();
    this.unsubscribe = onSnapshot(
      query(collection(db, 'arenas'), where('managerUserId', '==', uid), limit(30)),
      (snap) => {
        if (snap.empty) {
          this.managedDocs.set([]);
          this.selectedArenaIdSignal.set(null);
          this.notFoundSignal.set(true);
          this.loadingSignal.set(false);
          return;
        }

        this.managedDocs.set(snap.docs);

        console.log('snap.docs', snap.docs);

        const validIds = new Set(snap.docs.map((d) => d.id));
        const stored = this.readStoredSelection(uid);
        this.selectedArenaIdSignal.update((current) => {
          if (current && validIds.has(current)) return current;
          if (stored && validIds.has(stored)) return stored;
          return snap.docs.length === 1 ? snap.docs[0]!.id : null;
        });

        this.notFoundSignal.set(false);
        this.loadingSignal.set(false);
      },
      () => {
        this.managedDocs.set([]);
        this.notFoundSignal.set(true);
        this.loadingSignal.set(false);
      },
    );
  }

  private readStoredSelection(uid: string): string | null {
    try {
      return localStorage.getItem(SELECTED_ARENA_STORAGE_PREFIX + uid);
    } catch {
      return null;
    }
  }
}
