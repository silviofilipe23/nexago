import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { LEAGUE_STATUS_LABEL, type League, type LeagueListingStatus } from '@nexago/leagues';
import { listMyLeagues } from '../data/leagues-repository';
import { listInscriptions } from '../data/inscriptions-repository';
import type { OrganizerTournament, OrganizerTournamentStatus } from '../data/tournament.model';
import { listAllTournaments, listMyTournaments, listOrganizerNames } from '../data/tournaments-repository';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

/** `plataforma` só existe pra super admin — ver `tabs()`. */
type Tab = 'todos' | 'ativos' | 'encerrados' | 'plataforma';
type Bucket = 'ativos' | 'encerrados';
type Tone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

/** Torneios com um destes status contam como evento ativo (mesmo critério do Início). */
const ACTIVE_TOURNAMENT_STATUSES: readonly OrganizerTournamentStatus[] = ['inscricoes', 'andamento'];
/** Teto de torneios consultados em paralelo pra contar inscritos na listagem — evita N+1 sem limite. */
const MAX_INSCRITOS_FETCH = 20;

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

const STATUS_LABEL: Record<OrganizerTournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_TONE: Record<OrganizerTournamentStatus, Tone> = {
  inscricoes: 'orange',
  andamento: 'green',
  concluido: 'dim',
  cancelado: 'red',
};

const LEAGUE_STATUS_TONE: Record<LeagueListingStatus, Tone> = {
  draft: 'yellow',
  open: 'green',
  closed: 'dim',
  cancelled: 'red',
};

interface EventoCard {
  key: string;
  kind: 'Liga' | 'Torneio';
  name: string;
  metaLabel: string;
  statusLabel: string;
  statusTone: Tone;
  coverUrl: string | null;
  inscritos: number | null;
  vagas: number | null;
  etapas: number | null;
  link: string[] | null;
  bucket: Bucket;
  /** Dono do torneio, só nos cards da aba Plataforma (torneio alheio). */
  ownerLabel: string | null;
}

/** Lista de ligas e torneios organizados, com progresso de inscrição por evento. */
@Component({
  selector: 'og-eventos-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent],
  template: `
    <og-page-header title="Meus eventos" subtitle="Ligas e torneios que você organiza">
      <a class="og-mini-btn" routerLink="/painel/nova-liga"><og-icon name="flag" [size]="14" />Criar liga</a>
      <a class="og-mini-btn og-mini-btn-primary" routerLink="/painel/novo-torneio"><og-icon name="plus" [size]="14" />Criar torneio</a>
    </og-page-header>

    <div class="og-content">
      <og-chart-tabs [tabs]="tabs()" [active]="tab()" (changed)="onTabChange($event)" />

      @if (tab() === 'plataforma') {
        <div class="og-plataforma-bar">
          <input
            type="search"
            class="og-plataforma-search"
            placeholder="Buscar torneio pelo nome…"
            aria-label="Buscar torneio pelo nome"
            [value]="termDraft()"
            (input)="termDraft.set($any($event.target).value)"
            (keyup.enter)="searchPlatform()"
          />
          <button type="button" class="og-mini-btn" (click)="searchPlatform()">
            <og-icon name="search" [size]="14" />Buscar
          </button>
        </div>
        <p class="og-plataforma-hint">
          Torneios de todos os organizadores, para suporte. A lista por data não traz torneios sem data
          de início — esses aparecem na busca pelo nome.
        </p>
      }

      @if (showSkeleton()) {
        <div class="og-eventos-grid">
          @for (i of [1, 2, 3]; track i) {
            <div class="og-evento-card">
              <div class="og-evento-card-cover og-skeleton-cover"></div>
              <div class="og-evento-card-body">
                <div class="og-skeleton-line" style="width:40%"></div>
                <div class="og-skeleton-line" style="width:80%"></div>
                <div class="og-skeleton-line" style="width:60%"></div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="og-eventos-grid">
          @for (e of filtered(); track e.key) {
            <a class="og-evento-card" [class.og-evento-card-disabled]="!e.link" [routerLink]="e.link">
              <div class="og-evento-card-cover">
                @if (e.coverUrl && !coverFailed(e.key)) {
                  <img [src]="e.coverUrl" alt="" loading="lazy" (error)="onCoverError(e.key)" />
                } @else {
                  <span class="og-evento-card-cover-fallback">
                    <og-icon [name]="e.kind === 'Liga' ? 'flag' : 'trophy'" [size]="28" [strokeWidth]="1.6" />
                  </span>
                }
                <span class="og-evento-card-cover-pill">
                  <og-pill [tone]="e.statusTone">{{ e.statusLabel }}</og-pill>
                </span>
              </div>
              <div class="og-evento-card-body">
                <div>
                  <div class="og-evento-card-name">{{ e.name }}</div>
                  <div class="og-evento-card-meta">{{ e.metaLabel }}</div>
                  @if (e.ownerLabel) {
                    <div class="og-evento-card-owner">
                      <og-icon name="users" [size]="12" [strokeWidth]="1.9" />{{ e.ownerLabel }}
                    </div>
                  }
                </div>
                @if (e.kind === 'Torneio') {
                  <div>
                    <div class="og-evento-card-progress-row">
                      <span>Inscritos</span>
                      <span class="val">{{ e.inscritos ?? '—' }}{{ e.vagas ? '/' + e.vagas : '' }}</span>
                    </div>
                    <div class="og-progress"><span [style.width.%]="progressPct(e)"></span></div>
                  </div>
                } @else {
                  <div class="og-evento-card-progress-row">
                    <span>Etapas</span>
                    <span class="val">{{ e.etapas }}</span>
                  </div>
                }
                <div class="og-evento-card-footer">
                  <div>
                    <div class="og-evento-card-footer-label">Arrecadado</div>
                    <!-- mock (fase 2): arrecadação por evento fica no Financeiro (Task O7); sem dado real por evento ainda -->
                    <div class="og-evento-card-footer-value">—</div>
                  </div>
                  <span class="og-ghost-btn">{{ e.link ? 'Gerenciar' : 'Indisponível' }}</span>
                </div>
              </div>
            </a>
          } @empty {
            @if (tab() === 'plataforma') {
              @if (allError()) {
                <p class="og-empty">
                  Não foi possível carregar os torneios da plataforma.
                  <button type="button" class="og-link-btn" (click)="searchPlatform()">Tentar de novo</button>
                </p>
              } @else {
                <p class="og-empty">Nenhum torneio encontrado.</p>
              }
            } @else {
              <p class="og-empty">
                Nenhum torneio ou liga ainda —
                <a class="og-link-btn" routerLink="/painel/novo-evento">crie seu primeiro evento</a>
              </p>
            }
          }
        </div>

        @if (tab() === 'plataforma' && allHasMore()) {
          <div class="og-plataforma-more">
            <button type="button" class="og-mini-btn" [disabled]="allLoading()" (click)="loadMorePlatform()">
              {{ allLoading() ? 'Carregando…' : 'Carregar mais' }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .og-eventos-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-plataforma-bar {
      display: flex;
      gap: 8px;
      margin: 14px 0 8px;
    }
    .og-plataforma-search {
      flex: 1;
      min-width: 0;
      padding: 8px 12px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      color: inherit;
      font: inherit;
    }
    .og-plataforma-search:focus-visible {
      outline: none;
      border-color: var(--nx-line-strong);
    }
    .og-plataforma-hint {
      margin: 0 0 14px;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-plataforma-more {
      display: flex;
      justify-content: center;
      margin-top: 16px;
    }
    .og-link-btn {
      margin-left: 6px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--nx-orange-400);
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
    .og-evento-card-owner {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 4px;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-evento-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      transition: border-color 140ms var(--nx-ease-out);
    }
    .og-evento-card:not(.og-evento-card-disabled):hover {
      border-color: var(--nx-line-strong);
    }
    .og-evento-card-disabled {
      opacity: 0.6;
      cursor: default;
    }
    /* Capa do evento — altura fixa reserva o espaço (sem layout shift ao carregar). */
    .og-evento-card-cover {
      position: relative;
      height: 116px;
      flex: none;
      background: linear-gradient(135deg, rgba(255, 106, 26, 0.14), var(--nx-surface-1) 70%);
    }
    .og-evento-card-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .og-evento-card-cover-fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--nx-orange-500);
      opacity: 0.55;
    }
    /* Scrim atrás da pill garante contraste sobre qualquer foto. */
    .og-evento-card-cover-pill {
      position: absolute;
      top: 10px;
      right: 10px;
      display: inline-flex;
      padding: 2px;
      border-radius: var(--nx-r-pill);
      background: rgba(7, 7, 8, 0.62);
      backdrop-filter: blur(6px);
    }
    .og-evento-card-body {
      padding: 14px 18px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
    }
    .og-evento-card-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-evento-card-meta {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }
    .og-evento-card-progress-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 6px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-evento-card-progress-row .val {
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-evento-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 10px;
      border-top: 1px solid var(--nx-line);
    }
    .og-evento-card-footer-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .og-evento-card-footer-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 2px;
    }
    .og-empty {
      grid-column: 1 / -1;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-skeleton-cover {
      position: relative;
      overflow: hidden;
    }
    .og-skeleton-cover::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, var(--nx-surface-2), transparent);
      animation: og-shimmer 1.2s infinite;
    }
    .og-skeleton-line {
      height: 12px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      margin: 8px 0;
      position: relative;
      overflow: hidden;
    }
    .og-skeleton-line::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, var(--nx-surface-2), transparent);
      animation: og-shimmer 1.2s infinite;
    }
    @keyframes og-shimmer {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(100%);
      }
    }
  `,
})
export class EventosListComponent {
  private readonly auth = inject(AuthService);

  /** A aba Plataforma só aparece pra super admin — as demais são os eventos do próprio usuário. */
  protected readonly tabs = computed(() =>
    this.auth.isSuperAdmin() ? ['todos', 'ativos', 'encerrados', 'plataforma'] : ['todos', 'ativos', 'encerrados'],
  );
  protected readonly tab = signal<Tab>('todos');
  protected readonly loading = signal(true);

  // --- Aba Plataforma (super admin) ---
  protected readonly allTournaments = signal<OrganizerTournament[]>([]);
  protected readonly organizerNames = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly allLoading = signal(false);
  protected readonly allHasMore = signal(false);
  /** Falha da consulta precisa se distinguir de "não há torneios" — sem isso um erro de
   *  permissão ou de rede é lido como base vazia. */
  protected readonly allError = signal(false);
  protected readonly allTerm = signal('');
  /** Rascunho do campo de busca; só vira `allTerm` ao confirmar (Enter/botão). */
  protected readonly termDraft = signal('');
  private allCursor: QueryDocumentSnapshot<DocumentData> | null = null;
  /** Evita refazer a primeira página a cada volta pra aba. */
  private allLoaded = false;

  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly leagues = signal<League[]>([]);
  protected readonly inscritosPorTorneio = signal<Map<string, number>>(new Map());
  /** Capas que falharam ao carregar — o card volta pro fallback de gradiente + ícone. */
  protected readonly failedCovers = signal<ReadonlySet<string>>(new Set());

  protected readonly cards = computed<EventoCard[]>(() => {
    const inscritosMap = this.inscritosPorTorneio();

    const torneios: EventoCard[] = this.tournaments().map((t) => ({
      key: `t:${t.id}`,
      kind: 'Torneio',
      name: t.name,
      metaLabel: `Torneio · ${t.sportLabel} · ${this.dateRangeLabel(t.startAt, t.endAt)}`,
      statusLabel: STATUS_LABEL[t.status],
      statusTone: STATUS_TONE[t.status],
      coverUrl: t.coverUrl,
      inscritos: inscritosMap.get(t.id) ?? null,
      vagas: t.capacity,
      etapas: null,
      link: ['/painel/eventos', t.id],
      bucket: t.status === 'concluido' || t.status === 'cancelado' ? 'encerrados' : 'ativos',
      ownerLabel: null,
    }));

    const ligas: EventoCard[] = this.leagues().map((l) => ({
      key: `l:${l.id}`,
      kind: 'Liga',
      name: l.name,
      metaLabel: `Liga · ${l.sportLabel}${l.seasonLabel ? ' · ' + l.seasonLabel : ''}`,
      statusLabel: LEAGUE_STATUS_LABEL[l.listingStatus],
      statusTone: LEAGUE_STATUS_TONE[l.listingStatus],
      coverUrl: l.coverUrl,
      inscritos: null,
      vagas: null,
      etapas: l.stages.length,
      link: ['/painel/ligas', l.id],
      bucket: l.listingStatus === 'closed' || l.listingStatus === 'cancelled' ? 'encerrados' : 'ativos',
      ownerLabel: null,
    }));

    return [...torneios, ...ligas];
  });

  /** Cards da aba Plataforma: só torneios, sem contagem de inscritos (seriam 40 queries
   *  por página) e com o dono anotado. Ligas não entram — a aba é de torneios. */
  protected readonly platformCards = computed<EventoCard[]>(() => {
    const names = this.organizerNames();
    const myUid = this.auth.user()?.uid;
    return this.allTournaments().map((t) => ({
      key: `p:${t.id}`,
      kind: 'Torneio' as const,
      name: t.name,
      metaLabel: `Torneio · ${t.sportLabel} · ${this.dateRangeLabel(t.startAt, t.endAt)}`,
      statusLabel: STATUS_LABEL[t.status],
      statusTone: STATUS_TONE[t.status],
      coverUrl: t.coverUrl,
      inscritos: null,
      vagas: t.capacity,
      etapas: null,
      link: ['/painel/eventos', t.id],
      bucket: t.status === 'concluido' || t.status === 'cancelado' ? 'encerrados' : 'ativos',
      ownerLabel: t.managerId === myUid ? 'Você' : (names.get(t.managerId) ?? 'Organizador não identificado'),
    }));
  });

  /** Na Plataforma o esqueleto é só da primeira página — paginar não pode apagar o que já está na tela. */
  protected readonly showSkeleton = computed(() =>
    this.tab() === 'plataforma' ? this.allLoading() && this.allTournaments().length === 0 : this.loading(),
  );

  protected readonly filtered = computed<EventoCard[]>(() => {
    const t = this.tab();
    if (t === 'plataforma') return this.platformCards();
    if (t === 'todos') return this.cards();
    return this.cards().filter((c) => c.bucket === t);
  });

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }
    void this.load(uid);
  }

  private async load(uid: string): Promise<void> {
    try {
      const [tournaments, leagues] = await Promise.all([listMyTournaments(uid), listMyLeagues(uid)]);
      this.tournaments.set(tournaments);
      this.leagues.set(leagues);

      const active = tournaments.filter((t) => ACTIVE_TOURNAMENT_STATUSES.includes(t.status)).slice(0, MAX_INSCRITOS_FETCH);
      const rest = tournaments.filter((t) => !active.includes(t)).slice(0, Math.max(0, MAX_INSCRITOS_FETCH - active.length));
      const toCount = [...active, ...rest];
      const lists = await Promise.all(toCount.map((t) => listInscriptions(t.id)));
      const map = new Map<string, number>();
      toCount.forEach((t, i) => map.set(t.id, lists[i]!.length));
      this.inscritosPorTorneio.set(map);
    } finally {
      this.loading.set(false);
    }
  }

  /** A aba Plataforma carrega sob demanda: nunca na abertura da tela. */
  protected onTabChange(next: string): void {
    this.tab.set(next as Tab);
    if (next === 'plataforma' && !this.allLoaded) {
      this.allLoaded = true;
      void this.loadPlatformPage(true);
    }
  }

  protected searchPlatform(): void {
    this.allTerm.set(this.termDraft().trim());
    void this.loadPlatformPage(true);
  }

  protected loadMorePlatform(): void {
    void this.loadPlatformPage(false);
  }

  /** `reset` recomeça da primeira página (troca de busca); senão pagina a partir do cursor. */
  private async loadPlatformPage(reset: boolean): Promise<void> {
    if (this.allLoading()) return;
    this.allLoading.set(true);
    this.allError.set(false);
    try {
      if (reset) {
        this.allCursor = null;
      }
      const page = await listAllTournaments({ term: this.allTerm(), cursor: this.allCursor });
      const tournaments = reset ? page.tournaments : [...this.allTournaments(), ...page.tournaments];
      this.allTournaments.set(tournaments);
      this.allCursor = page.cursor;
      this.allHasMore.set(page.hasMore);

      const missing = tournaments.map((t) => t.managerId).filter((uid) => uid && !this.organizerNames().has(uid));
      if (missing.length > 0) {
        const names = await listOrganizerNames(missing);
        this.organizerNames.update((prev) => new Map([...prev, ...names]));
      }
    } catch {
      // Deixa a próxima abertura da aba tentar de novo, em vez de fixar a lista vazia.
      this.allLoaded = false;
      this.allError.set(true);
    } finally {
      this.allLoading.set(false);
    }
  }

  protected dateRangeLabel(start: Date | null, end: Date | null): string {
    if (!start) return 'Data a definir';
    if (!end || end.getTime() === start.getTime()) return SHORT_DATE.format(start);
    return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
  }

  protected progressPct(e: EventoCard): number {
    if (!e.vagas || e.inscritos == null) return 0;
    return Math.min(100, (e.inscritos / e.vagas) * 100);
  }

  protected coverFailed(key: string): boolean {
    return this.failedCovers().has(key);
  }

  protected onCoverError(key: string): void {
    this.failedCovers.update((set) => new Set(set).add(key));
  }
}
