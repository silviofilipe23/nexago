import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
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
import { isArenaStaffRole, type ArenaStaffRole } from './arena-roles.model';
import { watchStaffArenaDocs, type StaffArenaDocsWatcher } from './arena-staff-docs';

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

/** Entrada bruta de uma arena candidata (dono ou equipe) antes de virar `ArenaDocData`. */
interface ArenaEntry {
  id: string;
  data: Record<string, unknown>;
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

function parseArenaDocData(id: string, data: Record<string, unknown>): ArenaDocData {
  return {
    id,
    name: arenaNameOf(data),
    logoUrl: arenaLogoOf(data),
    planStatus: arenaPlanStatusFromDoc(data),
    courtsCount: typeof data['courtsCount'] === 'number' ? data['courtsCount'] : 0,
  };
}

/** Resolve a(s) arena(s) que o usuário logado pode acessar — como dono
 *  (`arenas` onde `managerUserId == uid`) ou como equipe (espelho
 *  `users/{uid}/arenaStaff/{arenaId}`, escrito pelo trigger do convite) — e deriva
 *  titularidade/cargo/capabilities de plano. Fonte única para todas as telas do painel.
 *
 *  Tudo aqui é `onSnapshot`, nunca leitura única: o plano da arena muda no servidor sem
 *  nenhuma ação do usuário no painel (webhook do Asaas confirmando pagamento, o sweeper diário
 *  `finalizeLapsedArenaPlans` pausando plano vencido, o trigger que incrementa/decrementa
 *  `courtsCount`), e a equipe muda quando o dono convida/revoga — com leitura única, essas
 *  mudanças só apareciam após recarregar a página inteira. São três frentes: a query das
 *  arenas do dono, o espelho de equipe, e um listener por arena de equipe
 *  (`watchStaffArenaDocs`) — esta última era a exceção que ainda lia uma vez só.
 *
 *  Por ser tudo ao vivo, `arenaDocData()` é a fonte do doc `arenas/{id}` para as telas que
 *  precisam dele inteiro (Perfil, Contatos, Financeiro): elas não refazem a leitura.
 *
 *  Um usuário pode ter mais de uma arena (várias como dono, várias como equipe, ou as duas
 *  combinações). Nesse caso nenhuma é escolhida automaticamente — `needsSelection()` fica
 *  true até `selectArena()` ser chamado, e `arenaSelectionGuard` força a rota
 *  `/painel/selecionar-arena` enquanto isso. */
@Injectable({ providedIn: 'root' })
export class ArenaContextService {
  private readonly auth = inject(AuthService);

  private readonly managedDocs = signal<QueryDocumentSnapshot[]>([]);
  private readonly loadingSignal = signal(true);
  private unsubscribe: Unsubscribe | null = null;

  /** Espelho `users/{uid}/arenaStaff/{arenaId}` → cargo em cada arena onde este usuário é
   *  equipe (só entradas com `status === 'active'` contam). */
  private readonly staffMirror = signal<Map<string, ArenaStaffRole>>(new Map());
  /** O espelho traz nome/logo, mas as telas precisam do doc completo da arena (plano,
   *  courtsCount, e os campos de Perfil/Contatos/Financeiro) — acompanhados por id, já que
   *  `arenas` é de leitura pública. */
  private readonly staffArenaDocs = signal<Map<string, Record<string, unknown>>>(new Map());
  private readonly staffLoadingSignal = signal(true);
  private staffUnsubscribe: Unsubscribe | null = null;
  private staffDocsWatcher: StaffArenaDocsWatcher | null = null;

  private readonly selectedArenaIdSignal = signal<string | null>(null);
  private currentUid: string | null = null;

  /** True só depois que as duas fontes (dono e equipe) já reportaram ao menos uma vez. Um
   *  guard downstream espera `loading` virar false antes de decidir acesso — se qualquer uma
   *  das duas fontes ainda não respondeu, uma equipe fica sem tela por falso negativo. */
  readonly loading = computed(() => this.loadingSignal() || this.staffLoadingSignal());

  /** Autenticado com role arena, mas nenhuma arena aponta pra este uid nem como dono nem
   *  como equipe — ex.: cadastro self-service, que hoje só cria o usuário/role, sem o doc
   *  `arenas/{arenaId}`. Só fica true quando as duas fontes já resolveram E as duas vieram
   *  vazias — nunca por causa de uma fonte isolada. */
  readonly notFound = computed(() => !this.loading() && this.allArenaEntries().length === 0);

  private readonly ownerEntries = computed<ArenaEntry[]>(() =>
    this.managedDocs().map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
  );

  private readonly staffEntries = computed<ArenaEntry[]>(() =>
    [...this.staffArenaDocs().entries()].map(([id, data]) => ({ id, data })),
  );

  /** Dono e equipe combinados. Se por algum motivo a mesma arena aparecer nas duas fontes
   *  (não deveria — convite não se aplica ao próprio dono), a titularidade de dono prevalece. */
  private readonly allArenaEntries = computed<ArenaEntry[]>(() => {
    const owner = this.ownerEntries();
    const ownerIds = new Set(owner.map((e) => e.id));
    const staff = this.staffEntries().filter((e) => !ownerIds.has(e.id));
    return [...owner, ...staff];
  });

  readonly managedArenas = computed<ArenaBrief[]>(() =>
    this.allArenaEntries().map((e) => ({ id: e.id, name: arenaNameOf(e.data) })),
  );

  /** True quando há mais de uma arena acessível por este usuário e nenhuma foi escolhida ainda. */
  readonly needsSelection = computed(
    () => this.managedArenas().length > 1 && this.selectedArenaIdSignal() == null,
  );

  readonly selectedArenaId = computed(() => this.selectedArenaIdSignal());

  private readonly selectedEntry = computed<ArenaEntry | null>(() => {
    const entries = this.allArenaEntries();
    if (entries.length === 0) return null;
    const targetId = this.selectedArenaIdSignal() ?? (entries.length === 1 ? entries[0]!.id : null);
    if (!targetId) return null;
    return entries.find((e) => e.id === targetId) ?? null;
  });

  private readonly arenaDoc = computed<ArenaDocData | null>(() => {
    const entry = this.selectedEntry();
    return entry ? parseArenaDocData(entry.id, entry.data) : null;
  });

  /** Doc cru de `arenas/{arenaId}` da arena selecionada. As telas que precisam de campos além
   *  de nome/logo/plano (Perfil, Contatos, Financeiro) leem daqui em vez de refazer um `getDoc`
   *  do mesmo doc que este serviço já mantém — era uma ida ao servidor a mais só pra abrir a
   *  tela. Só é seguro porque as duas fontes (dono e equipe) são listeners: o valor acompanha o
   *  servidor, inclusive depois da própria tela salvar.
   *
   *  Quem semeia formulário com isto deve ler UMA vez (`untracked`), não reagir: um retorno do
   *  servidor no meio da digitação reescreveria os campos por baixo de quem está editando. */
  readonly arenaDocData = computed<Record<string, unknown> | null>(() => this.selectedEntry()?.data ?? null);

  readonly arenaId = computed(() => this.arenaDoc()?.id ?? null);
  readonly arenaName = computed(() => this.arenaDoc()?.name ?? null);
  readonly arenaLogoUrl = computed(() => this.arenaDoc()?.logoUrl ?? null);
  readonly planStatus = computed(() => this.arenaDoc()?.planStatus ?? ARENA_PLAN_STATUS_NONE);
  readonly courtsCount = computed(() => this.arenaDoc()?.courtsCount ?? 0);

  /** True só para a arena selecionada estar entre as geridas como dono (não como equipe). */
  readonly isOwner = computed(() => {
    const id = this.arenaId();
    return id != null && this.managedDocs().some((d) => d.id === id);
  });

  /** Cargo do usuário na arena selecionada — `null` quando ele é o dono (dono não tem cargo,
   *  tem acesso total) ou quando não há vínculo de equipe algum. */
  readonly staffRole = computed<ArenaStaffRole | null>(() => {
    const id = this.arenaId();
    if (id == null || this.isOwner()) return null;
    return this.staffMirror().get(id) ?? null;
  });

  readonly entitled = computed(() => {
    const current = this.arenaDoc();
    return current != null && arenaPlanEntitledAt(current.planStatus, new Date());
  });

  readonly capabilities = computed<ReadonlySet<ArenaCapability>>(() => {
    const current = this.arenaDoc();
    if (current == null) return new Set<ArenaCapability>();
    return arenaCapabilitiesFor(current.planStatus.tier, this.entitled());
  });

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      const user = this.auth.user();

      this.unsubscribe?.();
      this.unsubscribe = null;
      this.staffUnsubscribe?.();
      this.staffUnsubscribe = null;
      // Corta os listeners de doc de equipe desta troca de usuário/logout em diante — sem isso,
      // um callback posterior reintroduziria dados do usuário anterior (achado de review,
      // task 8 round 1). `stop()` também zera `staffArenaDocs` na hora.
      this.staffDocsWatcher?.stop();
      this.staffDocsWatcher = null;

      if (!ready) return;
      if (!user) {
        this.currentUid = null;
        this.managedDocs.set([]);
        this.staffMirror.set(new Map());
        this.staffArenaDocs.set(new Map());
        this.selectedArenaIdSignal.set(null);
        this.loadingSignal.set(false);
        this.staffLoadingSignal.set(false);
        return;
      }
      this.watchArenas(user.uid);
      this.watchStaffMirror(user.uid);
    });

    // Seleção automática: só decide depois que as duas fontes já resolveram (`loading`
    // false). Mantém a seleção atual se ainda for válida; senão tenta a persistida no
    // localStorage; senão, com exatamente uma arena acessível, escolhe ela; caso contrário
    // (nenhuma ou mais de uma) deixa null — `needsSelection`/`notFound` tratam esses casos.
    effect(() => {
      if (this.loading()) return;
      const arenas = this.managedArenas();
      const validIds = new Set(arenas.map((a) => a.id));
      const stored = this.currentUid ? this.readStoredSelection(this.currentUid) : null;
      this.selectedArenaIdSignal.update((current) => {
        if (current && validIds.has(current)) return current;
        if (stored && validIds.has(stored)) return stored;
        return arenas.length === 1 ? arenas[0]!.id : null;
      });
    });
  }

  hasCapability(capability: ArenaCapability): boolean {
    return this.capabilities().has(capability);
  }

  /** Escolhe qual das arenas acessíveis fica ativa (persistida no localStorage por uid, então
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
        this.managedDocs.set(snap.empty ? [] : snap.docs);
        this.loadingSignal.set(false);
      },
      () => {
        this.managedDocs.set([]);
        this.loadingSignal.set(false);
      },
    );
  }

  private watchStaffMirror(uid: string): void {
    const db = arenaFirestore();
    this.staffLoadingSignal.set(true);

    // Um listener por arena de equipe (ver `watchStaffArenaDocs`). Não há mais `await` no
    // caminho — o que dispensa o token de geração que existia só pra descartar resposta
    // atrasada de um usuário já trocado: `stop()` cancela as assinaturas, e depois disso
    // nenhum callback roda.
    this.staffDocsWatcher = watchStaffArenaDocs(
      (arenaId, onDoc) =>
        onSnapshot(
          doc(db, 'arenas', arenaId),
          (snap) => onDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : null),
          () => onDoc(null),
        ),
      (docs, settled) => {
        this.staffArenaDocs.set(docs);
        if (settled) this.staffLoadingSignal.set(false);
      },
    );

    this.staffUnsubscribe = onSnapshot(
      collection(db, 'users', uid, 'arenaStaff'),
      (snap) => {
        const roles = new Map<string, ArenaStaffRole>();
        for (const d of snap.docs) {
          const role = (d.data() as Record<string, unknown>)['role'];
          const status = (d.data() as Record<string, unknown>)['status'];
          if (isArenaStaffRole(role) && status === 'active') roles.set(d.id, role);
        }
        this.staffMirror.set(roles);
        this.staffDocsWatcher?.sync([...roles.keys()]);
      },
      () => {
        this.staffMirror.set(new Map());
        this.staffDocsWatcher?.sync([]);
        this.staffLoadingSignal.set(false);
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
