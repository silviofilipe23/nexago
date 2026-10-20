import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { athleteFirestore } from '../data/firestore';
import {
  arenaOptionCity,
  openInvites,
  parseProfessorLink,
  parseProfessorLinkEvent,
  sortEventsDesc,
  type ProfessorArenaOption,
  type ProfessorLink,
  type ProfessorLinkEvent,
  type ProfessorLinkResult,
  type ProfessorLinkType,
} from './professor-links.model';

const LINKS = 'arenaProfessors';

/**
 * Vínculos do professor logado com as arenas — o ÚNICO ponto de dados e ações das telas de
 * professor (Minhas arenas, detalhe, card da página da arena e o badge do menu).
 *
 * Leitura: um listener por sessão em `arenaProfessors where professorUserId == uid` (as rules
 * liberam o próprio professor) e, sob demanda, o histórico `events` de um vínculo. Escrita: SÓ
 * pelas callables — a coleção é `write: false` nas rules.
 *
 * Root e não por tela: o badge do menu e a página têm de concordar sempre, e o vínculo muda por
 * gesto da ARENA (convite, aprovação, suspensão) — sem listener só apareceria no recarregar.
 *
 * Para QA sem login: `{ provide: ProfessorLinksService, useValue: fake }` com os mesmos membros
 * públicos (`links`, `loaded`, `loadError`, `openInviteCount`, `watchEvents`, `listArenas`,
 * `respondToInvite`, `requestLink`, `cancelRequest`, `endLink`).
 */
@Injectable({ providedIn: 'root' })
export class ProfessorLinksService {
  private readonly auth = inject(AuthService);
  private readonly db = athleteFirestore();
  /** `computed` para o effect só rodar quando o uid muda de verdade. */
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);

  private readonly linksState = signal<readonly ProfessorLink[]>([]);
  private readonly loadedState = signal(false);
  private readonly loadErrorState = signal(false);

  readonly links = this.linksState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  /** Convites em aberto (não vencidos) — o badge do item "Minhas arenas". */
  readonly openInviteCount = computed(() => openInvites(this.linksState(), Date.now()).length);

  private arenas: Promise<readonly ProfessorArenaOption[]> | null = null;

  constructor() {
    effect((onCleanup) => {
      const uid = this.uid();
      const db = this.db;
      // Troca de conta no mesmo navegador: nada da conta anterior sobrevive.
      this.linksState.set([]);
      this.loadErrorState.set(false);
      if (!uid || !db) {
        this.loadedState.set(true);
        return;
      }
      this.loadedState.set(false);
      const stop = onSnapshot(
        query(collection(db, LINKS), where('professorUserId', '==', uid)),
        (snap) => {
          this.linksState.set(
            snap.docs
              .map((d) => parseProfessorLink(d.id, d.data()))
              .filter((l): l is ProfessorLink => l !== null),
          );
          this.loadErrorState.set(false);
          this.loadedState.set(true);
        },
        () => {
          this.linksState.set([]);
          this.loadErrorState.set(true);
          this.loadedState.set(true);
        },
      );
      onCleanup(() => stop());
    });
  }

  /** Histórico do vínculo, mais recente primeiro (ordenado no cliente, como manda o contrato). */
  watchEvents(
    linkId: string,
    onChange: (events: ProfessorLinkEvent[]) => void,
    onError: () => void,
  ): () => void {
    const db = this.db;
    if (!db || !linkId) {
      onChange([]);
      return () => undefined;
    }
    return onSnapshot(
      collection(db, LINKS, linkId, 'events'),
      (snap) =>
        onChange(
          sortEventsDesc(
            snap.docs
              .map((d) => parseProfessorLinkEvent(d.id, d.data()))
              .filter((e): e is ProfessorLinkEvent => e !== null),
          ),
        ),
      () => onError(),
    );
  }

  /** Arenas que podem receber pedido: as parceiras (a mesma fonte da busca de Reservar, sem as
   *  de pré-cadastro, que não têm dono). Uma leitura por sessão. Arena parceira sem gestor ainda
   *  é recusada pelo servidor com mensagem própria. */
  listArenas(): Promise<readonly ProfessorArenaOption[]> {
    const db = this.db;
    if (!db) return Promise.resolve([]);
    if (!this.arenas) {
      // `import()`: o serviço vai no shell de todas as telas; a descoberta de arenas só no seletor.
      this.arenas = import('@nexago/arena-discovery')
        .then(({ fetchPartnerArenas }) => fetchPartnerArenas(db))
        .then((items) =>
          items.map((a) => ({ id: a.id, name: a.name, city: arenaOptionCity(a.city, a.state), logoUrl: a.logoUrl })),
        )
        .catch((err: unknown) => {
          this.arenas = null;
          throw err;
        });
    }
    return this.arenas;
  }

  respondToInvite(linkId: string, accept: boolean, reason?: string | null): Promise<ProfessorLinkResult> {
    return this.call('respondToArenaProfessorInvite', { linkId, accept, reason: reason?.trim() || null });
  }

  requestLink(input: {
    arenaId: string;
    relationshipType: ProfessorLinkType;
    message?: string | null;
  }): Promise<ProfessorLinkResult> {
    return this.call('requestArenaProfessorLink', {
      arenaId: input.arenaId,
      relationshipType: input.relationshipType,
      message: input.message?.trim() || null,
    });
  }

  /** Professor cancela o PRÓPRIO pedido (`PENDING`). */
  cancelRequest(linkId: string): Promise<ProfessorLinkResult> {
    return this.call('cancelArenaProfessorLink', { linkId, side: 'PROFESSOR' });
  }

  /** Encerramento pelo professor: imediato (`ACTIVE`/`SUSPENDED` → `ENDED`). */
  endLink(linkId: string, reason?: string | null): Promise<ProfessorLinkResult> {
    return this.call('endArenaProfessorLink', { linkId, side: 'PROFESSOR', reason: reason?.trim() || null });
  }

  /** SDK de Functions por `import()`: o serviço mora no shell de todas as telas e só precisa
   *  dele no clique. */
  private async call(name: string, payload: Record<string, unknown>): Promise<ProfessorLinkResult> {
    const [{ httpsCallable }, { athleteFunctions }] = await Promise.all([
      import('firebase/functions'),
      import('../data/functions'),
    ]);
    const result = await httpsCallable<Record<string, unknown>, ProfessorLinkResult>(athleteFunctions(), name)(payload);
    return result.data;
  }
}
