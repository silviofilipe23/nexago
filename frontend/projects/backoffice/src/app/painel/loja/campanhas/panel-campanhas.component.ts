import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import { todaySaoPaulo } from '../cupons/data/coupon';
import {
  MAX_CAMPAIGNS,
  MAX_LIVE,
  campaignIdFrom,
  campaignStatuses,
  ctaSummary,
  liveCampaigns,
  moveItem,
  periodLabel,
  type CampaignBanner,
  type CampaignStatus,
} from './data/campaign';
import { CampaignsRepository } from './data/campaigns.repository';
import { CampaignPanelComponent, type CampaignPanelMode } from './ui/campaign-panel.component';
import { CampaignPreviewComponent } from './ui/campaign-preview.component';

const STATUS: Record<CampaignStatus, { label: string; tone: PillTone; hint: string }> = {
  'no-ar': { label: 'No ar', tone: 'green', hint: 'Aparece na vitrine hoje' },
  fila: { label: 'Na fila', tone: 'yellow', hint: `Já há ${MAX_LIVE} no ar antes dela: suba na lista para entrar` },
  agendada: { label: 'Agendada', tone: 'orange', hint: 'Entra no ar na data de início' },
  encerrada: { label: 'Encerrada', tone: 'dim', hint: 'Passou da data de fim' },
  pausada: { label: 'Pausada', tone: 'dim', hint: 'Guardada, fora da vitrine' },
};

interface CampaignRow {
  banner: CampaignBanner;
  status: CampaignStatus;
  period: string;
  cta: string;
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

/** Loja › Campanhas: banners da vitrine (portal e app), na ordem em que aparecem. */
@Component({
  selector: 'bo-panel-campanhas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menuOpenId.set(null)', '(document:keydown.escape)': 'onEscape()' },
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    PillComponent,
    ToggleComponent,
    ConfirmDialogComponent,
    CampaignPanelComponent,
    CampaignPreviewComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Campanhas" subtitle="Loja">
        <button
          type="button"
          class="bo-mini-btn bo-mini-btn-primary"
          [disabled]="loading() || full()"
          [attr.title]="full() ? 'Limite de ' + maxCampaigns + ' campanhas: exclua uma antiga' : null"
          (click)="openPanel({ kind: 'new' })"
        >
          <bo-icon name="plus" [size]="13" />
          Nova campanha
        </button>
      </bo-page-header>

      <div class="body" [class.with-panel]="panel() !== null">
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

          <bo-panel-card [kicker]="previewKicker()" [title]="previewTitle()">
            <div card-actions class="formats" role="radiogroup" aria-label="Formato da prévia">
              @for (f of formats; track f.id) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="previewFormat() === f.id"
                  [class.on]="previewFormat() === f.id"
                  (click)="previewFormat.set(f.id)"
                >
                  {{ f.label }}
                </button>
              }
            </div>
            @if (previewBanner(); as b) {
              <bo-campaign-preview [banner]="b" [format]="previewFormat()" />
              @if (!draft() && live().length > 1) {
                <div class="live-tabs" role="tablist" aria-label="Campanhas no ar">
                  @for (l of live(); track l.id; let i = $index) {
                    <button
                      type="button"
                      role="tab"
                      [attr.aria-selected]="b.id === l.id"
                      [class.on]="b.id === l.id"
                      (click)="liveIndex.set(i)"
                    >
                      {{ i + 1 }} · {{ l.title }}
                    </button>
                  }
                </div>
              }
            } @else if (!loading()) {
              <div class="empty-preview">
                <p>Nenhuma campanha no ar hoje.</p>
                <span>Sem banner, a vitrine esconde o bloco e a grade de produtos sobe.</span>
              </div>
            }
          </bo-panel-card>

          <bo-panel-card pad="sm" kicker="Ordem na vitrine" [title]="listTitle()">
            @if (loading()) {
              @for (slot of [0, 1, 2]; track slot) {
                <div class="skeleton-row"></div>
              }
            } @else if (loadError(); as err) {
              <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
              <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
            } @else if (rows().length === 0) {
              <div class="empty">
                <bo-icon name="flag" [size]="20" />
                <p>Nenhuma campanha ainda</p>
                <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="openPanel({ kind: 'new' })">
                  <bo-icon name="plus" [size]="13" />
                  Criar primeira campanha
                </button>
              </div>
            } @else {
              <p class="rule">
                A vitrine mostra até {{ maxLive }} campanhas no ar, nesta ordem. Arraste ou use as setas para reordenar.
              </p>
              <ol class="list" aria-label="Campanhas" (dragover)="$event.preventDefault()">
                @for (r of rows(); track r.banner.id; let i = $index, first = $first, last = $last) {
                  <li
                    class="row"
                    [class.selected]="selectedId() === r.banner.id"
                    [class.dragging]="dragFrom() === i"
                    [attr.draggable]="!saving()"
                    (dragstart)="onDragStart($event, i)"
                    (dragend)="dragFrom.set(-1)"
                    (drop)="onDrop($event, i)"
                  >
                    <span class="pos" aria-hidden="true">{{ i + 1 }}</span>
                    <span class="thumb" aria-hidden="true">
                      @if (r.banner.imageUrl; as img) {
                        <img [src]="img" alt="" />
                      }
                    </span>
                    <button
                      type="button"
                      class="info"
                      [attr.aria-label]="'Editar ' + r.banner.title"
                      (click)="openPanel({ kind: 'edit', banner: r.banner })"
                    >
                      @if (r.banner.kicker) {
                        <span class="kicker">{{ r.banner.kicker }}</span>
                      }
                      <span class="name">{{ r.banner.title }}</span>
                      <span class="cta"><span class="when">{{ r.period }} · </span>{{ r.cta }}</span>
                    </button>
                    <span class="period">{{ r.period }}</span>
                    <span class="status" [attr.title]="statusOf(r.status).hint">
                      <bo-pill [tone]="statusOf(r.status).tone">{{ statusOf(r.status).label }}</bo-pill>
                    </span>
                    <bo-toggle
                      class="toggle"
                      [ariaLabel]="(r.banner.active ? 'Pausar ' : 'Ativar ') + r.banner.title"
                      [checked]="r.banner.active"
                      [disabled]="saving()"
                      (checkedChange)="setActive(r.banner, $event)"
                    />
                    <span class="order">
                      <button
                        type="button"
                        class="icon-btn"
                        [attr.aria-label]="'Subir ' + r.banner.title"
                        [disabled]="first || saving()"
                        (click)="move(i, i - 1)"
                      >
                        <bo-icon name="chevron-down" [size]="14" class="up" />
                      </button>
                      <button
                        type="button"
                        class="icon-btn"
                        [attr.aria-label]="'Descer ' + r.banner.title"
                        [disabled]="last || saving()"
                        (click)="move(i, i + 1)"
                      >
                        <bo-icon name="chevron-down" [size]="14" />
                      </button>
                    </span>
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
                          <button type="button" role="menuitem" (click)="openPanel({ kind: 'edit', banner: r.banner })">Editar</button>
                          <button type="button" role="menuitem" [disabled]="full()" (click)="openPanel({ kind: 'duplicate', banner: r.banner })">
                            Duplicar
                          </button>
                          <button type="button" role="menuitem" class="danger" (click)="askDelete(r.banner)">Excluir</button>
                        </div>
                      }
                    </span>
                  </li>
                }
              </ol>
            }
          </bo-panel-card>
        </div>

        @for (p of panelList(); track p.key) {
          <bo-campaign-panel
            class="side"
            [mode]="p.mode"
            [saving]="saving()"
            [serverError]="panelError()"
            (closed)="closePanel()"
            (draftChange)="draft.set($event)"
            (submitted)="onSubmitted(p.mode, $event)"
          />
        }
      </div>

      @if (deleting(); as b) {
        <bo-confirm-dialog
          [open]="true"
          [title]="'Excluir ' + b.title + '?'"
          description="A campanha sai da vitrine e da lista. Para tirar só por um tempo, pause em vez de excluir."
          confirmLabel="Excluir campanha"
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
    .body { padding: 20px 32px 40px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; min-width: 0; }
    .body.with-panel { grid-template-columns: minmax(0, 1fr) 400px; }
    @media (max-width: 1180px) { .body.with-panel { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .alert-action { margin-left: auto; flex: none; }

    .formats { display: inline-grid; grid-template-columns: 1fr 1fr; padding: 3px; gap: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .formats button { height: 28px; padding: 0 14px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; cursor: pointer; }
    .formats button.on { background: var(--nx-surface-0); color: var(--nx-text); }
    .live-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .live-tabs button { max-width: 260px; padding: 6px 10px; border: 1px solid var(--nx-line); border-radius: var(--nx-r-pill); background: transparent; color: var(--nx-text-mute); font-size: 11.5px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .live-tabs button.on { border-color: rgba(255, 106, 26, 0.5); color: var(--nx-text); }
    .empty-preview { display: flex; flex-direction: column; gap: 4px; padding: 28px 0 8px; }
    .empty-preview p { margin: 0; font-family: var(--nx-font-display); font-weight: 600; font-size: 14px; color: var(--nx-text); }
    .empty-preview span { font-size: 12px; color: var(--nx-text-dim); }

    .rule { margin: 0 0 10px; padding: 0 4px; font-size: 12px; color: var(--nx-text-dim); }
    /* A lista quebra pela própria largura: com o painel aberto ela encolhe sem a janela mudar. */
    .list { margin: 0; padding: 0; list-style: none; container-type: inline-size; }
    .row { display: grid; grid-template-columns: 22px 88px minmax(0, 1fr) 128px 92px 38px 64px 32px; gap: 12px; align-items: center; min-height: 72px; padding: 8px 10px; border-top: 1px solid var(--nx-line); border-radius: var(--nx-r-2); }
    .when { display: none; }
    .row:hover, .row.selected { background: var(--nx-surface-1); }
    .row.dragging { opacity: 0.45; }
    .row[draggable='true'] { cursor: grab; }
    .pos { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); text-align: center; }
    .thumb { position: relative; width: 88px; height: 50px; border-radius: 8px; overflow: hidden; background-color: #16120f; background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0 6px, transparent 6px 12px); border: 1px solid var(--nx-line); }
    .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 0; border: none; background: transparent; text-align: left; cursor: pointer; }
    .info:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 4px; border-radius: 4px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--nx-orange-500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cta { font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .period { font-size: 12px; color: var(--nx-text-mute); }
    .order { display: flex; gap: 2px; }
    .icon-btn { width: 30px; height: 30px; display: grid; place-items: center; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .icon-btn:hover:not(:disabled) { background: var(--nx-surface-2); color: var(--nx-text); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .up { display: inline-flex; transform: rotate(180deg); }
    .more { font-size: 16px; line-height: 1; }

    .menu-wrap { position: relative; }
    .menu { position: absolute; right: 0; top: 34px; z-index: 5; min-width: 150px; padding: 4px; display: flex; flex-direction: column; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }
    .menu button { text-align: left; padding: 8px 10px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text); font-family: var(--nx-font-display); font-size: 12.5px; cursor: pointer; }
    .menu button:hover:not(:disabled) { background: var(--nx-surface-2); }
    .menu button:disabled { opacity: 0.5; cursor: default; }
    .menu button.danger { color: var(--nx-live); }

    @container (max-width: 780px) {
      .row { grid-template-columns: 22px 72px minmax(0, 1fr) 92px 38px 64px 32px; }
      .thumb { width: 72px; height: 42px; }
      .period { display: none; }
      .when { display: inline; }
    }
    @container (max-width: 520px) {
      .row {
        grid-template-columns: 18px 56px minmax(0, 1fr) 38px 32px;
        grid-template-areas: 'pos thumb info toggle menu' 'pos thumb status order order';
        row-gap: 6px;
        padding: 10px 6px;
      }
      .pos { grid-area: pos; }
      .thumb { grid-area: thumb; width: 56px; height: 36px; }
      .info { grid-area: info; }
      .status { grid-area: status; }
      .toggle { grid-area: toggle; }
      .order { grid-area: order; justify-content: flex-end; }
      .menu-wrap { grid-area: menu; }
    }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 0; color: var(--nx-text-dim); }
    .empty p { margin: 0; font-size: 13px; }
    .skeleton-row { height: 72px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); opacity: 0.6; }
    .retry { margin-top: 12px; align-self: flex-start; }
    .side { min-width: 0; }
  `,
})
export class PanelCampanhasComponent {
  private readonly repository = inject(CampaignsRepository);

  protected readonly today = todaySaoPaulo();
  protected readonly maxLive = MAX_LIVE;
  protected readonly maxCampaigns = MAX_CAMPAIGNS;
  protected readonly formats: ReadonlyArray<{ id: 'web' | 'app'; label: string }> = [
    { id: 'web', label: 'Web' },
    { id: 'app', label: 'App' },
  ];

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly banners = signal<CampaignBanner[]>([]);
  private readonly version = signal(0);
  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly actionError = signal('');
  protected readonly conflict = signal(false);
  protected readonly panelError = signal('');
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly dragFrom = signal(-1);

  protected readonly panel = signal<{ key: number; mode: CampaignPanelMode } | null>(null);
  /** Lista de um item só: o `track` pela chave recria o painel a cada abertura. */
  protected readonly panelList = computed(() => {
    const p = this.panel();
    return p ? [p] : [];
  });
  protected readonly selectedId = computed(() => {
    const m = this.panel()?.mode;
    return m?.kind === 'edit' ? m.banner.id : null;
  });
  /** O banner que o painel aberto está montando — a prévia segue a digitação. */
  protected readonly draft = signal<CampaignBanner | null>(null);
  protected readonly previewFormat = signal<'web' | 'app'>('web');
  protected readonly liveIndex = signal(0);

  protected readonly deleting = signal<CampaignBanner | null>(null);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly full = computed(() => this.banners().length >= MAX_CAMPAIGNS);
  protected readonly live = computed(() => liveCampaigns(this.banners(), this.today));
  protected readonly rows = computed<CampaignRow[]>(() => {
    const statuses = campaignStatuses(this.banners(), this.today);
    return this.banners().map((banner, i) => ({
      banner,
      status: statuses[i]!,
      period: periodLabel(banner),
      cta: ctaSummary(banner),
    }));
  });
  protected readonly previewBanner = computed<CampaignBanner | null>(() => {
    const draft = this.draft();
    if (draft) {
      return draft;
    }
    const live = this.live();
    return live[Math.min(this.liveIndex(), live.length - 1)] ?? null;
  });
  protected readonly previewKicker = computed(() => (this.draft() ? 'Prévia do rascunho' : 'Na vitrine hoje'));
  protected readonly previewTitle = computed(() => {
    if (this.draft()) {
      return this.previewFormat() === 'web' ? 'Portal do atleta · /loja' : 'App · carrossel da Loja';
    }
    const n = this.live().length;
    return n === 0 ? 'Nada no ar' : n === 1 ? '1 campanha no ar' : `${n} campanhas no ar`;
  });
  protected readonly listTitle = computed(() => {
    const n = this.banners().length;
    return n === 1 ? '1 campanha' : `${n} campanhas`;
  });

  private panelKey = 0;
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
      const state = await this.repository.load();
      this.banners.set(state.banners);
      this.version.set(state.version);
    } catch (error) {
      this.loadError.set(errorText(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusOf(status: CampaignStatus): { label: string; tone: PillTone; hint: string } {
    return STATUS[status];
  }

  protected openPanel(mode: CampaignPanelMode): void {
    this.menuOpenId.set(null);
    this.panelError.set('');
    this.panel.set({ key: ++this.panelKey, mode });
  }

  protected closePanel(): void {
    this.panel.set(null);
    this.draft.set(null);
  }

  protected onEscape(): void {
    if (this.menuOpenId()) {
      this.menuOpenId.set(null);
    } else if (!this.deleting() && !this.saving()) {
      this.closePanel();
    }
  }

  protected toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.menuOpenId.update((current) => (current === id ? null : id));
  }

  /** Nova (ou cópia) entra em 1º: quem cria campanha quer vê-la no ar. Edição fica no lugar. */
  protected async onSubmitted(mode: CampaignPanelMode, banner: CampaignBanner): Promise<void> {
    const list = this.banners();
    let next: CampaignBanner[];
    if (mode.kind === 'edit') {
      next = list.map((b) => (b.id === mode.banner.id ? banner : b));
    } else {
      const id = campaignIdFrom(banner.title, new Set(list.map((b) => b.id)));
      next = [{ ...banner, id }, ...list];
    }
    this.panelError.set('');
    const ok = await this.persist(next, mode.kind === 'edit' ? 'Campanha salva' : 'Campanha criada', (msg) =>
      this.panelError.set(msg),
    );
    if (ok) {
      this.closePanel();
    }
  }

  protected setActive(banner: CampaignBanner, active: boolean): void {
    const next = this.banners().map((b) => (b.id === banner.id ? { ...b, active } : b));
    void this.persist(next, active ? `${banner.title} ativada` : `${banner.title} pausada`);
  }

  protected move(from: number, to: number): void {
    const next = moveItem(this.banners(), from, to);
    if (next.some((b, i) => b !== this.banners()[i])) {
      void this.persist(next, 'Ordem salva');
    }
  }

  protected onDragStart(event: DragEvent, index: number): void {
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
    if (from >= 0 && !this.saving()) {
      this.move(from, to);
    }
  }

  protected askDelete(banner: CampaignBanner): void {
    this.menuOpenId.set(null);
    this.deleteError.set(null);
    this.deleting.set(banner);
  }

  protected async confirmDelete(banner: CampaignBanner): Promise<void> {
    const next = this.banners().filter((b) => b.id !== banner.id);
    const ok = await this.persist(next, 'Campanha excluída', (msg) => this.deleteError.set(msg));
    if (ok) {
      this.deleting.set(null);
      if (this.selectedId() === banner.id) {
        this.closePanel();
      }
    }
  }

  /**
   * Grava a lista inteira com a versão lida. Mostra o novo estado na hora e desfaz se o servidor
   * recusar; versão velha (outra pessoa salvou) pede recarregar em vez de sobrescrever.
   */
  private async persist(next: CampaignBanner[], success: string, onError?: (message: string) => void): Promise<boolean> {
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
