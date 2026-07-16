import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ChaveamentoContextService } from '../chaveamento/chaveamento-context.service';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';

export type PanelLevel = 'global' | 'torneio' | 'categoria';

export interface PanelCrumb {
  label: string;
  link: string;
}

/** Contexto da navegação em cascata (Portal → Torneio → Categoria), derivado da URL.
 *
 *  A cascata é toda dirigida pela rota: `/painel/eventos/:id` põe o painel no nível
 *  "torneio" e `/painel/eventos/:id/categorias/:catId` no nível "categoria". O shell lê
 *  `level`/`tournament`/`category` daqui pra trocar a sidebar, e este serviço também dirige
 *  o `ChaveamentoContextService` existente (torneio/categoria selecionados) pra que as telas
 *  de grupos/chave/jogos/agendamento/placar continuem funcionando sem o seletor manual que
 *  tinham antes. */
@Injectable({ providedIn: 'root' })
export class PanelContextService {
  private readonly router = inject(Router);
  private readonly chav = inject(ChaveamentoContextService);

  /** Cache por sessão dos docs de torneio já vistos — evita refetch a cada troca de tela. */
  private readonly tournamentCache = new Map<string, OrganizerTournament>();

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly path = computed(() => this.url().split('?')[0]!.split('#')[0]!);

  readonly tournamentId = computed<string | null>(() => {
    const m = this.path().match(/^\/painel\/eventos\/([^/]+)/);
    return m ? decodeURIComponent(m[1]!) : null;
  });

  readonly categoryId = computed<string | null>(() => {
    const m = this.path().match(/^\/painel\/eventos\/[^/]+\/categorias\/([^/]+)/);
    return m ? decodeURIComponent(m[1]!) : null;
  });

  readonly level = computed<PanelLevel>(() =>
    this.categoryId() ? 'categoria' : this.tournamentId() ? 'torneio' : 'global',
  );

  readonly tournament = signal<OrganizerTournament | null>(null);

  readonly category = computed<OrganizerTournamentCategory | null>(() => {
    const cid = this.categoryId();
    if (!cid) return null;
    return this.tournament()?.categories.find((c) => c.id === cid) ?? null;
  });

  /** Base das rotas do torneio atual (`/painel/eventos/:id`) — nulo fora do contexto. */
  readonly tournamentBase = computed<string | null>(() => {
    const tid = this.tournamentId();
    return tid ? `/painel/eventos/${tid}` : null;
  });

  /** Base das rotas da categoria atual (`…/categorias/:catId`) — nulo fora do contexto. */
  readonly categoryBase = computed<string | null>(() => {
    const base = this.tournamentBase();
    const cid = this.categoryId();
    return base && cid ? `${base}/categorias/${cid}` : null;
  });

  /** Trilha de ancestrais pro breadcrumb do cabeçalho (o nível atual fica no título). */
  readonly crumbs = computed<PanelCrumb[]>(() => {
    const level = this.level();
    if (level === 'global') return [];
    const crumbs: PanelCrumb[] = [{ label: 'Meus eventos', link: '/painel/eventos' }];
    if (level === 'categoria') {
      crumbs.push({ label: this.tournament()?.name ?? 'Torneio', link: this.tournamentBase()! });
    }
    return crumbs;
  });

  constructor() {
    // Carrega o doc do torneio pro card de contexto da sidebar (e nomes do breadcrumb).
    effect(() => {
      const tid = this.tournamentId();
      if (!tid) {
        this.tournament.set(null);
        return;
      }
      if (this.tournament()?.id === tid) return;
      const cached = this.tournamentCache.get(tid);
      if (cached) {
        this.tournament.set(cached);
        return;
      }
      this.tournament.set(null);
      void this.loadTournament(tid);
    });

    // Dirige o contexto compartilhado do chaveamento a partir da rota — as telas de
    // grupos/chave/jogos/agendamento/placar continuam lendo dele como antes.
    effect(() => {
      const tid = this.tournamentId();
      if (!tid) return;
      const cid = this.categoryId();
      this.chav.ensureLoaded();
      this.chav.selectTournament(tid);
      this.chav.selectCategory(cid);
    });
  }

  /** Recarrega o doc do torneio atual (após editar torneio/categorias). */
  async refreshTournament(): Promise<void> {
    const tid = this.tournamentId();
    if (!tid) return;
    this.tournamentCache.delete(tid);
    await this.loadTournament(tid);
  }

  private async loadTournament(tid: string): Promise<void> {
    const tournament = await getTournament(tid);
    if (!tournament) return;
    this.tournamentCache.set(tid, tournament);
    if (this.tournamentId() === tid) this.tournament.set(tournament);
  }
}
