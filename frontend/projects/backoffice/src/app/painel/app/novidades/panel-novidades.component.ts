import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { moveItem } from '../../loja/campanhas/data/campaign';
import { todaySaoPaulo } from '../../loja/cupons/data/coupon';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { KpiMiniComponent } from '../../ui/kpi-mini.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import {
  MAX_HOME_BANNERS,
  NO_STATS,
  audienceLabel,
  destinationLabel,
  homeBannerIdFrom,
  homeBannerStatus,
  homeSlot,
  liveHomeBanners,
  num,
  pct,
  shortPeriod,
  type HomeBanner,
  type HomeBannerStats,
  type HomeBannerStatus,
} from './data/home-banner';
import type { HomeBannerContent, SaveIntent } from './data/home-banner-form';
import { HomeBannersRepository } from './data/home-banners.repository';
import { HomeBannerDrawerComponent, STATUS_META, type HomeBannerDrawerMode } from './ui/home-banner-drawer.component';
import { HomeBannerPreviewComponent } from './ui/home-banner-preview.component';

type Filter = 'todos' | HomeBannerStatus;

interface BannerRow {
  banner: HomeBanner;
  status: HomeBannerStatus;
  period: string;
  ctr: string;
  /** O toggle "No ar" só vale para publicado dentro do prazo: rascunho e encerrado não ligam. */
  toggleable: boolean;
}

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

function isConflict(error: unknown): boolean {
  return String((error as { code?: unknown })?.code ?? '').includes('failed-precondition');
}

/** App do atleta › Banner de novidades: o carrossel abaixo dos atalhos da Home, na ordem da lista. */
@Component({
  selector: 'bo-panel-novidades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menuOpenId.set(null)', '(document:keydown.escape)': 'menuOpenId.set(null)' },
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    KpiMiniComponent,
    PillComponent,
    ToggleComponent,
    ConfirmDialogComponent,
    HomeBannerDrawerComponent,
    HomeBannerPreviewComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="App do atleta" [subtitle]="subtitle()">
        <button
          type="button"
          class="bo-mini-btn bo-mini-btn-primary"
          [disabled]="loading() || full()"
          [attr.title]="full() ? 'Limite de ' + maxBanners + ' banners: exclua um antigo' : null"
          (click)="openDrawer({ kind: 'new' })"
        >
          <bo-icon name="plus" [size]="13" />
          Novo banner
        </button>
      </bo-page-header>

      <div class="body">
        <div class="main">
          @if (notice(); as text) {
            <div class="bo-feedback" role="status" aria-live="polite">
              <bo-icon name="check" [size]="15" />
              <span>{{ text }}</span>
            </div>
          }
          @if (actionError(); as text) {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ text }}</span>
              @if (conflict()) {
                <button type="button" class="bo-mini-btn alert-action" (click)="reload()">Recarregar</button>
              }
            </div>
          }

          <div class="kpis">
            <bo-kpi-mini label="No ar agora" [value]="loading() ? '—' : live().length + ''" />
            <bo-kpi-mini label="Viram · banners no ar" [value]="loading() ? '—' : num(liveStats().seen)" />
            <bo-kpi-mini label="Taxa de toque" [value]="pct(liveStats().clicked, liveStats().seen)" tone="green" />
            <bo-kpi-mini label="Dispensaram" [value]="pct(liveStats().dismissed, liveStats().seen)" />
          </div>

          <bo-panel-card pad="sm" kicker="Ordem = posição no carrossel" title="Banners da Home">
            <div card-actions class="filters" role="tablist" aria-label="Filtrar por status">
              @for (f of filters(); track f.id) {
                <button type="button" role="tab" [attr.aria-selected]="filter() === f.id" [class.on]="filter() === f.id" (click)="filter.set(f.id)">
                  {{ f.label }} · {{ f.count }}
                </button>
              }
            </div>

            @if (loading()) {
              @for (slot of [0, 1, 2]; track slot) {
                <div class="skeleton-row"></div>
              }
            } @else if (loadError(); as err) {
              <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
              <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
            } @else if (banners().length === 0) {
              <div class="empty">
                <bo-icon name="phone" [size]="20" />
                <p>Nenhum banner ainda</p>
                <span>Sem banner no ar, o bloco não aparece na Home.</span>
                <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="openDrawer({ kind: 'new' })">
                  <bo-icon name="plus" [size]="13" />
                  Criar o primeiro
                </button>
              </div>
            } @else {
              <div class="table">
              <div class="cols" aria-hidden="true">
                <span></span><span>Banner</span><span>Destino · público</span><span>Período</span><span>Status</span>
                <span class="right">Toque</span><span class="right">No ar</span><span></span>
              </div>
              <ol class="list" aria-label="Banners" (dragover)="$event.preventDefault()">
                @for (r of visibleRows(); track r.banner.id) {
                  @let i = indexOf(r.banner);
                  <li
                    class="row"
                    [class.selected]="selectedId() === r.banner.id"
                    [class.dragging]="dragFrom() === i"
                    [class.faded]="r.status === 'encerrado'"
                    [attr.draggable]="canReorder()"
                    (dragstart)="onDragStart($event, i)"
                    (dragend)="dragFrom.set(-1)"
                    (drop)="onDrop($event, i)"
                  >
                    <span class="pos" aria-hidden="true">{{ i + 1 }}</span>
                    <button type="button" class="info" [attr.aria-label]="'Editar ' + (r.banner.title || 'banner sem título')" (click)="openDrawer({ kind: 'edit', banner: r.banner })">
                      <span class="name-line">
                        <span class="name">{{ r.banner.title || 'Sem título' }}</span>
                        <span class="fmt">{{ r.banner.format === 'compact' ? 'compacto' : 'carrossel' }}</span>
                      </span>
                      <span class="desc">{{ r.banner.description || '—' }}</span>
                    </button>
                    <span class="target">
                      <span class="dest">{{ destinationOf(r.banner) }}</span>
                      <span class="aud">{{ audienceOf(r.banner) }}</span>
                    </span>
                    <span class="period">{{ r.period }}</span>
                    <span class="status" [attr.title]="statusMeta(r.status).hint">
                      <bo-pill [tone]="statusMeta(r.status).tone">{{ statusMeta(r.status).label }}</bo-pill>
                    </span>
                    <span class="ctr" [class.none]="r.ctr === '—'">{{ r.ctr }}</span>
                    <bo-toggle
                      class="toggle"
                      [ariaLabel]="(r.banner.active ? 'Pausar ' : 'Reativar ') + (r.banner.title || 'banner')"
                      [checked]="r.toggleable && r.banner.active"
                      [disabled]="!r.toggleable || saving()"
                      (checkedChange)="setActive(r.banner, $event)"
                    />
                    <span class="menu-wrap">
                      <button
                        type="button"
                        class="icon-btn more"
                        [attr.aria-label]="'Ações de ' + r.banner.title"
                        aria-haspopup="menu"
                        [attr.aria-expanded]="menuOpenId() === r.banner.id"
                        (click)="toggleMenu($event, r.banner.id)"
                      >
                        ⋯
                      </button>
                      @if (menuOpenId() === r.banner.id) {
                        <div class="menu" role="menu" (click)="$event.stopPropagation()">
                          <button type="button" role="menuitem" (click)="openDrawer({ kind: 'edit', banner: r.banner })">Editar</button>
                          <button type="button" role="menuitem" [disabled]="!canReorder() || i === 0" (click)="moveFromMenu(i, i - 1)">
                            Subir no carrossel
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            [disabled]="!canReorder() || i === banners().length - 1"
                            (click)="moveFromMenu(i, i + 1)"
                          >
                            Descer no carrossel
                          </button>
                          <button type="button" role="menuitem" [disabled]="full()" (click)="openDrawer({ kind: 'duplicate', banner: r.banner })">
                            Duplicar
                          </button>
                          @if (r.banner.published) {
                            <button type="button" role="menuitem" (click)="unpublish(r.banner)">Voltar a rascunho</button>
                          }
                          <button type="button" role="menuitem" class="danger" (click)="askDelete(r.banner)">Excluir</button>
                        </div>
                      }
                    </span>
                  </li>
                } @empty {
                  <li class="none">Nenhum banner com esse status.</li>
                }
              </ol>
              </div>
              <p class="rule">
                {{ filter() === 'todos' ? 'Arraste a linha ou use o menu ⋯ para mudar a posição no carrossel.' : 'Para reordenar, volte para “Todos”.' }}
              </p>
            }
          </bo-panel-card>
        </div>

        <div class="side">
          <div class="phone">
            <div class="phone-head">
              <span>Prévia no app</span>
              <span>{{ slotCaption() }}</span>
            </div>
            @if (slot(); as s) {
              <bo-home-banner-preview [banner]="previewBanner()!" [total]="s.banners.length" [position]="previewIndex() + 1" />
              @if (s.banners.length > 1) {
                <div class="slot-tabs" role="tablist" aria-label="Cards no carrossel">
                  @for (b of s.banners; track b.id; let i = $index) {
                    <button type="button" role="tab" [attr.aria-selected]="previewIndex() === i" [class.on]="previewIndex() === i" (click)="previewPick.set(i)">
                      {{ i + 1 }} · {{ b.title }}
                    </button>
                  }
                </div>
              }
            } @else if (!loading()) {
              <p class="phone-empty">Nenhum banner no ar — o bloco não aparece na Home.</p>
            }
          </div>
          <p class="explain">
            O carrossel mostra os banners no ar na ordem da lista, filtrados pelo público de cada atleta, e troca de card a
            cada 5 s. Sem nenhum card de carrossel para o atleta, o primeiro compacto ocupa o mesmo lugar.
          </p>
        </div>
      </div>

      @for (d of drawerList(); track d.key) {
        <bo-home-banner-drawer
          [mode]="d.mode"
          [today]="today"
          [stats]="statsOf(d.mode)"
          [otherLiveCarousel]="otherLiveCarousel(d.mode)"
          [saving]="saving()"
          [serverError]="drawerError()"
          (closed)="closeDrawer()"
          (submitted)="onSubmitted(d.mode, $event.content, $event.intent)"
        />
      }

      @if (deleting(); as b) {
        <bo-confirm-dialog
          [open]="true"
          [title]="'Excluir ' + (b.title || 'banner') + '?'"
          description="O banner sai do app e da lista; os números dele também somem daqui. Para tirar só por um tempo, pause em vez de excluir."
          confirmLabel="Excluir banner"
          tone="danger"
          [busy]="saving()"
          [error]="deleteError()"
          (confirmed)="confirmDelete(b)"
          (dismissed)="deleting.set(null)"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 24px 32px 40px; display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; min-width: 0; }
    @media (max-width: 1180px) { .body { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .alert-action { margin-left: auto; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 760px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

    .filters { display: flex; flex-wrap: wrap; gap: 6px; }
    .filters button { height: 28px; padding: 0 11px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 11.5px; cursor: pointer; white-space: nowrap; }
    .filters button.on { border-color: rgba(255, 106, 26, 0.5); background: rgba(255, 106, 26, 0.1); color: var(--nx-text); }

    /* A tabela quebra pela própria largura (o painel lateral some abaixo de 1180px). */
    .table { container-type: inline-size; }
    .list { margin: 0; padding: 0; list-style: none; }
    .cols, .row { display: grid; grid-template-columns: 16px minmax(0, 1fr) 128px 92px 84px 48px 40px 30px; gap: 10px; align-items: center; }
    .cols { padding: 4px 10px 10px; border-bottom: 1px solid var(--nx-line); font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .cols .right, .ctr { text-align: right; }
    .row { min-height: 64px; padding: 8px 10px; border-bottom: 1px solid var(--nx-line); border-radius: var(--nx-r-2); }
    .row:last-child { border-bottom: none; }
    .row:hover, .row.selected { background: var(--nx-surface-1); }
    .row.dragging { opacity: 0.45; }
    .row.faded { opacity: 0.6; }
    .row[draggable='true'] { cursor: grab; }
    .pos { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); text-align: center; }
    .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 0; border: none; background: transparent; text-align: left; cursor: pointer; color: inherit; }
    .info:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 4px; border-radius: 4px; }
    .name-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .fmt { flex: none; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--nx-text-dim); }
    .desc, .aud { font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .target { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .dest { font-size: 12.5px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .period { font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text-mute); white-space: nowrap; }
    .ctr { font-family: var(--nx-font-mono); font-size: 12.5px; color: var(--nx-text); }
    .ctr.none { color: var(--nx-text-dim); }
    .toggle { justify-self: end; }
    .icon-btn { width: 30px; height: 30px; display: grid; place-items: center; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .icon-btn:hover:not(:disabled) { background: var(--nx-surface-2); color: var(--nx-text); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .more { font-size: 16px; line-height: 1; }
    .menu-wrap { position: relative; }
    .menu { position: absolute; right: 0; top: 34px; z-index: 5; min-width: 170px; padding: 4px; display: flex; flex-direction: column; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }
    .menu button { text-align: left; padding: 8px 10px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text); font-family: var(--nx-font-display); font-size: 12.5px; cursor: pointer; }
    .menu button:hover:not(:disabled) { background: var(--nx-surface-2); }
    .menu button:disabled { opacity: 0.5; cursor: default; }
    .menu button.danger { color: var(--nx-live); }
    .none { padding: 24px 10px; font-size: 12.5px; color: var(--nx-text-dim); }
    .rule { margin: 8px 4px 0; font-size: 11.5px; color: var(--nx-text-dim); }

    @container (max-width: 620px) {
      .cols { display: none; }
      .row { grid-template-columns: 16px minmax(0, 1fr) 84px 40px 30px; grid-template-areas: 'pos info status toggle menu' 'pos target ctr ctr ctr'; row-gap: 6px; padding: 10px 6px; }
      .pos { grid-area: pos; }
      .info { grid-area: info; }
      .target { grid-area: target; }
      .status { grid-area: status; }
      .ctr { grid-area: ctr; }
      .toggle { grid-area: toggle; }
      .menu-wrap { grid-area: menu; }
      .period { display: none; }
    }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 0; color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 13px; color: var(--nx-text); }
    .empty span { font-size: 12px; }
    .empty button { margin-top: 6px; }
    .skeleton-row { height: 64px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); opacity: 0.6; }
    .retry { margin-top: 12px; align-self: flex-start; }

    .side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .phone { padding: 20px 24px 22px; border-radius: var(--nx-r-4); background: #050505; border: 1px solid var(--nx-line); }
    .phone-head { display: flex; justify-content: space-between; margin-bottom: 16px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .phone-empty { margin: 0; padding: 30px 0; font-size: 12.5px; color: var(--nx-text-dim); text-align: center; }
    .slot-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
    .slot-tabs button { max-width: 100%; padding: 6px 10px; border: 1px solid var(--nx-line); border-radius: var(--nx-r-pill); background: transparent; color: var(--nx-text-mute); font-size: 11.5px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .slot-tabs button.on { border-color: rgba(255, 106, 26, 0.5); color: var(--nx-text); }
    .explain { margin: 0; padding: 14px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); font-size: 12px; line-height: 1.55; color: var(--nx-text-mute); }
  `,
})
export class PanelNovidadesComponent {
  private readonly repository = inject(HomeBannersRepository);

  protected readonly today = todaySaoPaulo();
  protected readonly maxBanners = MAX_HOME_BANNERS;
  protected readonly num = num;
  protected readonly pct = pct;

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly banners = signal<HomeBanner[]>([]);
  protected readonly stats = signal<Map<string, HomeBannerStats>>(new Map());
  private readonly version = signal(0);
  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly actionError = signal('');
  protected readonly conflict = signal(false);
  protected readonly drawerError = signal('');
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly dragFrom = signal(-1);
  protected readonly filter = signal<Filter>('todos');
  protected readonly previewPick = signal(0);

  protected readonly drawer = signal<{ key: number; mode: HomeBannerDrawerMode } | null>(null);
  /** Lista de um item só: o `track` pela chave recria o drawer a cada abertura. */
  protected readonly drawerList = computed(() => {
    const d = this.drawer();
    return d ? [d] : [];
  });
  protected readonly selectedId = computed(() => {
    const m = this.drawer()?.mode;
    return m?.kind === 'edit' ? m.banner.id : null;
  });

  protected readonly deleting = signal<HomeBanner | null>(null);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly full = computed(() => this.banners().length >= MAX_HOME_BANNERS);
  protected readonly live = computed(() => liveHomeBanners(this.banners(), this.today));
  protected readonly slot = computed(() => homeSlot(this.live()));
  protected readonly previewIndex = computed(() => Math.min(this.previewPick(), (this.slot()?.banners.length ?? 1) - 1));
  protected readonly previewBanner = computed(() => this.slot()?.banners[this.previewIndex()] ?? null);
  protected readonly slotCaption = computed(() => {
    const s = this.slot();
    if (!s) {
      return '';
    }
    return s.format === 'compact' ? 'Compacto' : s.banners.length === 1 ? '1 card' : `${s.banners.length} cards`;
  });
  protected readonly subtitle = computed(() => {
    const n = this.live().length;
    return `Banner de novidades · ${n === 1 ? '1 no ar' : `${n} no ar`}`;
  });
  protected readonly liveStats = computed<HomeBannerStats>(() =>
    this.live().reduce(
      (acc, b) => {
        const s = this.stats().get(b.id) ?? NO_STATS;
        return { seen: acc.seen + s.seen, clicked: acc.clicked + s.clicked, dismissed: acc.dismissed + s.dismissed };
      },
      { ...NO_STATS },
    ),
  );
  protected readonly rows = computed<BannerRow[]>(() =>
    this.banners().map((banner) => {
      const status = homeBannerStatus(banner, this.today);
      const s = this.stats().get(banner.id) ?? NO_STATS;
      return {
        banner,
        status,
        period: banner.published || banner.startDate || banner.endDate ? shortPeriod(banner) : '—',
        ctr: pct(s.clicked, s.seen),
        toggleable: status !== 'rascunho' && status !== 'encerrado',
      };
    }),
  );
  protected readonly visibleRows = computed(() => {
    const f = this.filter();
    return f === 'todos' ? this.rows() : this.rows().filter((r) => r.status === f);
  });
  protected readonly filters = computed(() => {
    const rows = this.rows();
    const countOf = (s: HomeBannerStatus) => rows.filter((r) => r.status === s).length;
    const all: Array<{ id: Filter; label: string; count: number }> = [
      { id: 'todos', label: 'Todos', count: rows.length },
      { id: 'no-ar', label: 'No ar', count: countOf('no-ar') },
      { id: 'agendado', label: 'Agendados', count: countOf('agendado') },
      { id: 'pausado', label: 'Pausados', count: countOf('pausado') },
      { id: 'rascunho', label: 'Rascunhos', count: countOf('rascunho') },
      { id: 'encerrado', label: 'Encerrados', count: countOf('encerrado') },
    ];
    // Status sem nenhum banner some, exceto o filtro aberto (senão a pessoa fica sem saída).
    return all.filter((f) => f.id === 'todos' || f.count > 0 || f.id === this.filter());
  });
  /** Posição é da lista inteira: com filtro, mover um item pularia os escondidos. */
  protected readonly canReorder = computed(() => this.filter() === 'todos' && !this.saving());

  private drawerKey = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.actionError.set('');
    this.conflict.set(false);
    try {
      // Sem os números a tela ainda serve: contador que falhou vira "—", não erro.
      const [state, stats] = await Promise.all([
        this.repository.load(),
        this.repository.loadStats().catch(() => new Map<string, HomeBannerStats>()),
      ]);
      this.banners.set(state.banners);
      this.version.set(state.version);
      this.stats.set(stats);
    } catch (error) {
      this.loadError.set(errorText(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusMeta(status: HomeBannerStatus) {
    return STATUS_META[status];
  }

  protected destinationOf(b: HomeBanner): string {
    return b.destination === 'url' && b.url ? b.url.replace(/^https:\/\//, '') : destinationLabel(b.destination);
  }

  protected audienceOf(b: HomeBanner): string {
    return audienceLabel(b.audience);
  }

  protected indexOf(b: HomeBanner): number {
    return this.banners().indexOf(b);
  }

  protected statsOf(mode: HomeBannerDrawerMode): HomeBannerStats {
    return mode.kind === 'edit' ? (this.stats().get(mode.banner.id) ?? NO_STATS) : NO_STATS;
  }

  /** Cards de carrossel no ar sem contar o que está aberto: total da prévia e aviso de lotação. */
  protected otherLiveCarousel(mode: HomeBannerDrawerMode): number {
    const self = mode.kind === 'edit' ? mode.banner.id : null;
    return this.live().filter((b) => b.format === 'carousel' && b.id !== self).length;
  }

  protected openDrawer(mode: HomeBannerDrawerMode): void {
    this.menuOpenId.set(null);
    this.drawerError.set('');
    this.drawer.set({ key: ++this.drawerKey, mode });
  }

  protected closeDrawer(): void {
    this.drawer.set(null);
  }

  protected toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.menuOpenId.update((current) => (current === id ? null : id));
  }

  /**
   * Novo (ou cópia) entra em 1º: a novidade mais recente abre o carrossel. Edição fica no lugar;
   * "Publicar" num rascunho o põe no ar, e editar um publicado mantém publicado e pausa como estão.
   */
  protected async onSubmitted(mode: HomeBannerDrawerMode, content: HomeBannerContent, intent: SaveIntent): Promise<void> {
    const list = this.banners();
    const publish = intent === 'publish';
    let saved: HomeBanner;
    let next: HomeBanner[];
    if (mode.kind === 'edit') {
      const prev = mode.banner;
      saved = {
        ...content,
        id: prev.id,
        published: prev.published || publish,
        active: prev.published ? prev.active : true,
      };
      next = list.map((b) => (b.id === prev.id ? saved : b));
    } else {
      const id = homeBannerIdFrom(content.title, new Set(list.map((b) => b.id)));
      saved = { ...content, id, published: publish, active: true };
      next = [saved, ...list];
    }
    this.drawerError.set('');
    const ok = await this.persist(next, this.savedMessage(mode, saved), (msg) => this.drawerError.set(msg));
    if (ok) {
      this.closeDrawer();
    }
  }

  private savedMessage(mode: HomeBannerDrawerMode, b: HomeBanner): string {
    const name = b.title || 'Sem título';
    if (!b.published) {
      return `Rascunho “${name}” salvo`;
    }
    if (mode.kind === 'edit' && mode.banner.published) {
      return `“${name}” salvo`;
    }
    return homeBannerStatus(b, this.today) === 'agendado' ? `“${name}” agendado` : `“${name}” publicado na Home`;
  }

  protected setActive(banner: HomeBanner, active: boolean): void {
    const next = this.banners().map((b) => (b.id === banner.id ? { ...b, active } : b));
    void this.persist(next, active ? `“${banner.title}” de volta ao app` : `“${banner.title}” pausado`);
  }

  protected unpublish(banner: HomeBanner): void {
    this.menuOpenId.set(null);
    const next = this.banners().map((b) => (b.id === banner.id ? { ...b, published: false, active: true } : b));
    void this.persist(next, `“${banner.title}” voltou a rascunho`);
  }

  protected moveFromMenu(from: number, to: number): void {
    this.menuOpenId.set(null);
    this.move(from, to);
  }

  protected move(from: number, to: number): void {
    const next = moveItem(this.banners(), from, to);
    if (next.some((b, i) => b !== this.banners()[i])) {
      void this.persist(next, 'Ordem salva');
    }
  }

  protected onDragStart(event: DragEvent, index: number): void {
    if (!this.canReorder()) {
      event.preventDefault();
      return;
    }
    this.dragFrom.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected onDrop(event: DragEvent, to: number): void {
    event.preventDefault();
    const from = this.dragFrom();
    this.dragFrom.set(-1);
    if (from >= 0 && this.canReorder()) {
      this.move(from, to);
    }
  }

  protected askDelete(banner: HomeBanner): void {
    this.menuOpenId.set(null);
    this.deleteError.set(null);
    this.deleting.set(banner);
  }

  protected async confirmDelete(banner: HomeBanner): Promise<void> {
    const next = this.banners().filter((b) => b.id !== banner.id);
    const ok = await this.persist(next, 'Banner excluído', (msg) => this.deleteError.set(msg));
    if (ok) {
      this.deleting.set(null);
      if (this.selectedId() === banner.id) {
        this.closeDrawer();
      }
    }
  }

  /**
   * Grava a lista inteira com a versão lida. Mostra o novo estado na hora e desfaz se o servidor
   * recusar; versão velha (outra pessoa salvou) pede recarregar em vez de sobrescrever.
   */
  private async persist(next: HomeBanner[], success: string, onError?: (message: string) => void): Promise<boolean> {
    if (this.saving()) {
      return false;
    }
    const previous = this.banners();
    this.saving.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    this.banners.set(next);
    try {
      const saved = await this.repository.save(next, this.version());
      this.banners.set(saved.banners);
      this.version.set(saved.version);
      this.showNotice(success);
      return true;
    } catch (error) {
      this.banners.set(previous);
      const message = errorText(error);
      if (isConflict(error)) {
        this.conflict.set(true);
        this.actionError.set(message);
      } else if (!onError) {
        this.actionError.set(message);
      }
      onError?.(message);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3000);
  }
}
