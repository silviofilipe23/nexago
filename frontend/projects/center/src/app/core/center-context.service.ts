import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { collectionGroup, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { CENTERS, db } from '../data/firebase';
import { readCenter, readInvite, readMember } from '../data/mappers';
import type { CenterInvite, CenterMember, TrainingCenter } from '../domain/models';
import { canAccessArea, hasPermission, isManager, type CenterArea, type CenterPermission } from '../domain/roles';

const STORAGE_KEY = 'nexago.center.activeCenterId';

/** Conveniência por navegador — pode lançar (aba anônima, dados bloqueados). */
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* sem persistência: vale só nesta sessão */
  }
}

/**
 * Quais centros o usuário tem vínculo, qual está ativo (vem da URL `/centro/:centerId`) e qual o
 * papel dele ali. É só DESCOBERTA pra montar a UI — quem autoriza é a rule, que relê
 * `centerMembers/{uid}` a cada requisição (revogar vale na próxima ação, mesmo com a aba aberta).
 */
@Injectable({ providedIn: 'root' })
export class CenterContextService {
  private readonly auth = inject(AuthService);

  private readonly membershipsState = signal<CenterMember[]>([]);
  private readonly invitesState = signal<CenterInvite[]>([]);
  private readonly centerState = signal<TrainingCenter | null>(null);
  private readonly membershipsLoaded = signal(false);
  /** Falha ao listar vínculos (ex.: índice do collection group ainda construindo). NÃO é "sem vínculo". */
  private readonly membershipsErrorState = signal<string | null>(null);
  /** Incrementar reabre os listeners de vínculo e convite. */
  private readonly reloadKey = signal(0);
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly invitesLoaded = signal(false);
  private readonly centerLoaded = signal(false);

  /** Centro pedido pela rota atual. */
  readonly activeCenterId = signal<string | null>(null);

  readonly memberships = this.membershipsState.asReadonly();
  readonly membershipsError = this.membershipsErrorState.asReadonly();
  /** Vínculos que ainda dão acesso (revogados ficam de fora do seletor). */
  readonly activeMemberships = computed(() => this.membershipsState().filter((m) => m.status === 'active'));
  readonly pendingInvites = computed(() => this.invitesState().filter((i) => i.status === 'pending'));
  readonly ready = computed(() => this.membershipsLoaded() && this.invitesLoaded());

  readonly me = computed(() => {
    const id = this.activeCenterId();
    return id ? (this.membershipsState().find((m) => m.centerId === id) ?? null) : null;
  });
  /** Booleano (não o objeto): o doc do vínculo muda por outros motivos sem reabrir o listener. */
  private readonly meActive = computed(() => this.me()?.status === 'active');
  readonly center = this.centerState.asReadonly();
  readonly centerReady = computed(() => this.centerLoaded());
  readonly isSuspended = computed(() => this.centerState()?.status === 'suspended');
  readonly isPending = computed(() => this.centerState()?.status === 'pending');
  /** Escritas operacionais liberadas (centro não suspenso). */
  readonly canWrite = computed(() => this.centerState() != null && !this.isSuspended());
  readonly isManager = computed(() => isManager(this.me()));
  /** Dono do centro — só ele mexe na conta que recebe o dinheiro. */
  readonly isOwner = computed(() => this.me()?.status === 'active' && this.me()?.role === 'center_owner');

  /** Último centro usado (pra cair direto nele depois do login). */
  readonly lastCenterId = computed(() => {
    const stored = readStored();
    const list = this.activeMemberships();
    return list.find((m) => m.centerId === stored)?.centerId ?? list[0]?.centerId ?? null;
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.uid();
      const email = this.auth.email();
      this.reloadKey();
      untracked(() => {
        this.membershipsErrorState.set(null);
        this.membershipsState.set([]);
        this.invitesState.set([]);
        this.membershipsLoaded.set(false);
        this.invitesLoaded.set(false);
      });
      if (!uid) {
        return;
      }
      const stopMembers = onSnapshot(
        query(collectionGroup(db(), 'centerMembers'), where('uid', '==', uid)),
        { includeMetadataChanges: true },
        (snap) => {
          // Vínculo recém-gravado (aceite de convite, centro novo) aparece primeiro como escrita
          // LOCAL. Se o painel abrisse os listeners nesse instante, a rule ainda não enxergaria o
          // vínculo, negaria, e o listener morreria. Espera a confirmação do servidor.
          if (snap.metadata.hasPendingWrites) {
            return;
          }
          this.membershipsState.set(
            snap.docs.map((d) => {
              const m = readMember(d.id, d.data());
              // centerId vem do caminho: trainingCenters/{centerId}/centerMembers/{uid}
              return { ...m, centerId: d.ref.parent.parent?.id ?? m.centerId };
            }),
          );
          this.membershipsLoaded.set(true);
        },
        (err) => {
          console.warn('[center-context] vínculos', err.code ?? err);
          this.membershipsState.set([]);
          this.membershipsErrorState.set(
            err.code === 'failed-precondition'
              ? 'O NexaGO ainda está preparando o acesso aos centros. Tentamos de novo sozinhos em alguns segundos.'
              : 'Não foi possível carregar seus centros. Verifique a conexão.',
          );
          this.membershipsLoaded.set(true);
          // Índice recém-criado leva alguns minutos para ficar pronto: tenta de novo sozinho.
          this.retryTimer ??= setTimeout(() => {
            this.retryTimer = null;
            this.retry();
          }, 20_000);
        },
      );
      let stopInvites = () => {};
      if (email) {
        stopInvites = onSnapshot(
          query(collectionGroup(db(), 'centerInvites'), where('email', '==', email)),
          (snap) => {
            this.invitesState.set(
              snap.docs.map((d) => {
                const inv = readInvite(d.id, d.data());
                return { ...inv, centerId: d.ref.parent.parent?.id ?? inv.centerId };
              }),
            );
            this.invitesLoaded.set(true);
          },
          () => {
            this.invitesState.set([]);
            this.invitesLoaded.set(true);
          },
        );
      } else {
        this.invitesLoaded.set(true);
      }
      onCleanup(() => {
        stopMembers();
        stopInvites();
      });
    });

    effect((onCleanup) => {
      const id = this.activeCenterId();
      const active = this.meActive();
      untracked(() => {
        this.centerState.set(null);
        this.centerLoaded.set(false);
      });
      if (!id || !active) {
        untracked(() => this.centerLoaded.set(true));
        return;
      }
      store(id);
      const stop = onSnapshot(
        doc(db(), CENTERS, id),
        (snap) => {
          this.centerState.set(snap.exists() ? readCenter(snap.id, snap.data()) : null);
          this.centerLoaded.set(true);
        },
        () => {
          this.centerState.set(null);
          this.centerLoaded.set(true);
        },
      );
      onCleanup(stop);
    });
  }

  retry(): void {
    this.reloadKey.update((k) => k + 1);
  }

  can(area: CenterArea): boolean {
    return canAccessArea(this.me(), area);
  }

  has(perm: CenterPermission): boolean {
    return hasPermission(this.me(), perm);
  }

  membershipFor(centerId: string): CenterMember | null {
    return this.membershipsState().find((m) => m.centerId === centerId) ?? null;
  }
}
