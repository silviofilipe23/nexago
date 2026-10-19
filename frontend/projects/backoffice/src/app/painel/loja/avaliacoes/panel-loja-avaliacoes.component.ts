import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import {
  FIT_LABEL,
  MAX_HIDDEN_REASON,
  RATING_LABEL,
  REVIEW_TABS,
  TAG_LABEL,
  replaceOrder,
  rowsFor,
  sortRows,
  tabCounts,
  type ReviewFilters,
  type ReviewRow,
  type ReviewTab,
} from './data/reviews';
import { ReviewsRepository } from './data/reviews.repository';

type LoadState = 'loading' | 'ok' | 'error';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** O `not-found` genérico do backoffice fala de usuário; aqui é a avaliação que sumiu. */
function moderationError(err: unknown): string {
  const code = String((err as { code?: unknown })?.code ?? '');
  return code.includes('not-found') ? 'Avaliação não encontrada. Recarregue a lista.' : callableErrorMessage(err);
}

/**
 * Loja › Avaliações: o que os compradores publicaram (sai na hora, sem fila prévia). O time
 * esconde o que fere as regras — com motivo interno — e reexibe se foi engano.
 */
@Component({
  selector: 'bo-panel-loja-avaliacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent, IconComponent, PanelShellComponent, PillComponent, RouterLink],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Loja</div>
          <h1>Avaliações</h1>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="load()">
          <bo-icon name="swap" [size]="13" /> Atualizar
        </button>
      </header>

      <div class="tabs" role="tablist">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="setTab(t.id)">
            {{ t.label }} <span class="tab-count">{{ counts()[t.id] }}</span>
          </button>
        }
      </div>

      <div class="body">
        <div class="filters">
          <button type="button" class="bo-chip" [class.active]="filters().content" [attr.aria-pressed]="filters().content"
            (click)="toggle('content')">Com comentário ou foto</button>
          <button type="button" class="bo-chip" [class.active]="filters().low" [attr.aria-pressed]="filters().low"
            (click)="toggle('low')">Nota até 2</button>
        </div>

        @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }
        @if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Não foi possível carregar as avaliações.</span>
            <button type="button" class="bo-mini-btn" (click)="load()">Tentar de novo</button></div>
        }

        <div class="cols">
          <div class="card table-card">
            <div class="tr th"><span>Produto</span><span>Nota</span><span>Comentário</span><span>Autor</span><span>Pedido</span><span>Data</span></div>
            @if (state() === 'loading') {
              @for (s of [0, 1, 2, 3]; track s) { <div class="skeleton-row"></div> }
            } @else {
              @for (r of rows(); track r.key) {
                <button type="button" class="tr" [class.selected]="selected()?.key === r.key" (click)="selectedKey.set(r.key)">
                  <span class="item">
                    <span class="thumb" aria-hidden="true">@if (r.imageUrl) { <img [src]="r.imageUrl" alt="" width="26" height="26" /> }</span>
                    <span class="who"><span class="name">{{ r.productName }}</span><span class="sub">{{ r.variantLabel || 'único' }}</span></span>
                  </span>
                  <span class="stars" [class.low]="r.rating <= 2" [attr.aria-label]="'Nota ' + r.rating + ' de 5'">{{ stars(r.rating) }}</span>
                  <span class="comment">
                    @if (r.comment) { <span class="text">{{ r.comment }}</span> } @else { <span class="sub">Sem comentário</span> }
                    @if (r.photos.length) { <span class="photo-count"><bo-icon name="camera" [size]="12" /> {{ r.photos.length }}</span> }
                  </span>
                  <span class="who"><span class="name">{{ r.authorName }}</span>@if (r.anonymous) { <span class="sub">anônima</span> }</span>
                  <span class="mono dim">{{ r.orderNumber || '—' }}</span>
                  <span class="mono dim">{{ shortDate(r.updatedAt) }}</span>
                </button>
              } @empty {
                <div class="empty">{{ emptyLabel() }}</div>
              }
              @if (cursor()) {
                <button type="button" class="bo-mini-btn more" [disabled]="loadingMore()" (click)="loadMore()">Carregar mais</button>
              }
            }
          </div>

          <aside class="card detail">
            @if (selected(); as r) {
              <div class="d-head">
                <div>
                  <div class="kicker">Publicada {{ stamp(r.createdAt) }}@if (edited(r)) { · editada {{ stamp(r.updatedAt) }} }</div>
                  <div class="d-title">{{ r.productName }}</div>
                  <div class="sub">{{ r.variantLabel || 'único' }}</div>
                </div>
                <bo-pill [tone]="r.hiddenAt ? 'red' : 'green'">{{ r.hiddenAt ? 'Escondida' : 'Publicada' }}</bo-pill>
              </div>

              <div class="rating"><span class="stars big" [class.low]="r.rating <= 2">{{ stars(r.rating) }}</span> {{ ratingLabel(r.rating) }}</div>
              @if (r.comment) { <blockquote>“{{ r.comment }}”</blockquote> } @else { <p class="note">Sem comentário.</p> }

              @if (r.photos.length > 0) {
                <div class="photos">
                  @for (url of r.photos; track url) {
                    <button type="button" class="photo" (click)="zoom.set(url)" aria-label="Ver foto em tela cheia"><img [src]="url" alt="" /></button>
                  }
                </div>
              }

              @if (r.tags.length || r.fit) {
                <div class="tags">
                  @for (t of r.tags; track t) { <span class="tag">{{ tagLabel(t) }}</span> }
                  @if (r.fit) { <span class="tag">{{ fitLabel(r.fit) }}</span> }
                </div>
              }

              <dl class="checks">
                <div><dt>Autor</dt><dd>{{ r.authorName }}{{ r.anonymous ? ' · publicou sem o nome' : '' }}</dd></div>
                <div><dt>Pedido</dt><dd><a [routerLink]="['/painel/loja/pedidos', r.orderId]">{{ r.orderNumber || r.orderId }}</a></dd></div>
              </dl>

              @if (r.hiddenAt) {
                <div class="hidden-box">
                  <div class="kicker">Escondida {{ stamp(r.hiddenAt) }}{{ r.hiddenByName ? ' por ' + r.hiddenByName : '' }}</div>
                  <p>{{ r.hiddenReason || 'Sem motivo registrado.' }}</p>
                </div>
              }

              <div class="actions">
                @if (r.hiddenAt) {
                  <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="openShow()">
                    <bo-icon name="check" [size]="13" /> Reexibir</button>
                } @else {
                  <button type="button" class="bo-mini-btn danger" [disabled]="busy()" (click)="openHide()">
                    <bo-icon name="ban" [size]="13" /> Esconder</button>
                }
              </div>
            } @else {
              <div class="placeholder">{{ state() === 'loading' ? 'Carregando…' : 'Selecione uma avaliação' }}</div>
            }
          </aside>
        </div>
      </div>
    </bo-panel-shell>

    <bo-confirm-dialog [open]="hideOpen()" title="Esconder avaliação?" confirmLabel="Esconder" tone="danger" size="md"
      description="Sai da página do produto e da nota agora. O autor não é avisado; o motivo fica só no backoffice."
      [busy]="busy()" [confirmDisabled]="!reasonOk()" [error]="dialogError()"
      (confirmed)="moderate(true)" (dismissed)="closeDialogs()">
      <bo-field label="Motivo" [hint]="reason().length + '/' + maxReason">
        <textarea class="bo-input area" [maxLength]="maxReason" [value]="reason()" (input)="reason.set(val($event))"></textarea>
      </bo-field>
    </bo-confirm-dialog>

    <bo-confirm-dialog [open]="showOpen()" title="Reexibir avaliação?" confirmLabel="Reexibir"
      description="Volta para a página do produto e conta na nota de novo." [busy]="busy()" [error]="dialogError()"
      (confirmed)="moderate(false)" (dismissed)="closeDialogs()" />

    @if (zoom(); as url) {
      <button type="button" class="zoom" aria-label="Fechar foto" (click)="zoom.set(null)"><img [src]="url" alt="Foto da avaliação" /></button>
    }
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb, .kicker { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .spacer { flex: 1; }
    .tabs { display: flex; gap: 6px; padding: 10px 32px 0; }
    .tabs button { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; cursor: pointer; }
    .tabs button.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); font-weight: 700; }
    .tab-count { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .tabs button.active .tab-count { color: var(--nx-orange-500); }
    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; border-top: 1px solid var(--nx-line); }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    .card { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); min-width: 0; }
    .table-card { overflow: hidden; }
    .tr { width: 100%; display: grid; grid-template-columns: minmax(150px, 1.4fr) 70px minmax(160px, 2fr) minmax(90px, 1fr) 76px 52px; gap: 10px; align-items: center; min-height: 58px; padding: 0 16px; border: none; border-top: 1px solid var(--nx-line); background: none; color: var(--nx-text); text-align: left; font: inherit; cursor: pointer; }
    .tr:hover { background: var(--nx-surface-1); }
    .tr.selected { background: rgba(255, 106, 26, 0.05); }
    .th { min-height: 0; padding: 14px 16px 12px; border-top: none; cursor: default; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .th:hover { background: none; }
    .mono { font-family: var(--nx-font-mono); font-size: 11px; }
    .dim, .sub { font-size: 11px; color: var(--nx-text-dim); }
    .item { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .thumb { width: 26px; height: 26px; flex: none; border-radius: 6px; overflow: hidden; border: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stars { color: var(--nx-orange-500); font-size: 12px; letter-spacing: 1px; white-space: nowrap; }
    .stars.low { color: var(--nx-live); }
    .stars.big { font-size: 16px; }
    .comment { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--nx-text-mute); }
    .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .photo-count { display: inline-flex; align-items: center; gap: 3px; flex: none; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .empty, .placeholder { padding: 40px 16px; text-align: center; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }
    .placeholder { border-top: none; }
    .skeleton-row { height: 58px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); opacity: 0.5; }
    .more { margin: 12px auto; display: flex; }
    .detail { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .d-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .d-title { margin-top: 4px; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .rating { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; }
    blockquote { margin: 0; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); overflow-wrap: anywhere; }
    .photos { display: grid; grid-template-columns: repeat(3, minmax(0, 104px)); gap: 8px; }
    .photo { aspect-ratio: 1; padding: 0; border: none; border-radius: 10px; overflow: hidden; background: var(--nx-surface-1); cursor: zoom-in; }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { padding: 3px 9px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line); font-size: 11px; color: var(--nx-text-mute); }
    .checks { margin: 0; display: flex; flex-direction: column; gap: 9px; }
    .checks div { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; }
    .checks dt { color: var(--nx-text-mute); }
    .checks dd { margin: 0; font-weight: 600; text-align: right; }
    .checks a { color: var(--nx-orange-500); }
    .hidden-box { padding: 12px 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .hidden-box p { margin: 6px 0 0; font-size: 12.5px; line-height: 1.45; overflow-wrap: anywhere; }
    .actions { display: flex; justify-content: flex-end; }
    .danger { color: var(--nx-live); }
    .note { margin: 0; font-size: 12px; color: var(--nx-text-dim); }
    .area { height: 90px; padding: 9px 12px; resize: vertical; }
    .zoom { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 32px; border: none; background: rgba(0, 0, 0, 0.85); cursor: zoom-out; }
    .zoom img { max-width: 100%; max-height: 100%; border-radius: 12px; }
    @media (max-width: 1200px) { .cols { grid-template-columns: 1fr; } }
  `,
})
export class PanelLojaAvaliacoesComponent {
  private readonly repo = inject(ReviewsRepository);

  protected readonly tabs = REVIEW_TABS;
  protected readonly maxReason = MAX_HIDDEN_REASON;

  protected readonly state = signal<LoadState>('loading');
  protected readonly all = signal<ReviewRow[]>([]);
  protected readonly cursor = signal<QueryDocumentSnapshot | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly tab = signal<ReviewTab>('publicadas');
  protected readonly filters = signal<ReviewFilters>({ content: false, low: false });
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly hideOpen = signal(false);
  protected readonly showOpen = signal(false);
  protected readonly reason = signal('');
  protected readonly dialogError = signal<string | null>(null);
  protected readonly zoom = signal<string | null>(null);

  protected readonly counts = computed(() => tabCounts(this.all(), this.filters()));
  protected readonly rows = computed(() => rowsFor(this.all(), this.tab(), this.filters()));
  /** A linha escolhida só vale se estiver na lista visível; senão o painel abre a primeira. */
  protected readonly selected = computed(() => {
    const rows = this.rows();
    return rows.find((r) => r.key === this.selectedKey()) ?? rows.at(0) ?? null;
  });
  protected readonly reasonOk = computed(() => {
    const r = this.reason().trim();
    return r.length > 0 && r.length <= MAX_HIDDEN_REASON;
  });
  protected readonly emptyLabel = computed(() => {
    const f = this.filters();
    if (f.content || f.low) return 'Nenhuma avaliação com esses filtros';
    return this.tab() === 'publicadas' ? 'Nenhuma avaliação publicada ainda' : 'Nenhuma avaliação escondida';
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const page = await this.repo.list();
      this.all.set(sortRows(page.rows));
      this.cursor.set(page.cursor);
      this.state.set('ok');
    } catch {
      this.state.set('error');
    }
  }

  protected async loadMore(): Promise<void> {
    const after = this.cursor();
    if (!after) return;
    this.loadingMore.set(true);
    try {
      const page = await this.repo.list(after);
      this.all.update((rows) => sortRows([...rows, ...page.rows]));
      this.cursor.set(page.cursor);
    } catch {
      this.state.set('error');
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected setTab(t: ReviewTab): void {
    this.tab.set(t);
    this.selectedKey.set(null);
  }

  protected toggle(key: keyof ReviewFilters): void {
    this.filters.update((f) => ({ ...f, [key]: !f[key] }));
  }

  protected openHide(): void {
    this.reason.set('');
    this.dialogError.set(null);
    this.hideOpen.set(true);
  }

  protected openShow(): void {
    this.dialogError.set(null);
    this.showOpen.set(true);
  }

  protected closeDialogs(): void {
    this.hideOpen.set(false);
    this.showOpen.set(false);
  }

  /** Grava pela callable, relê o pedido e segue na aba: a próxima linha assume o lugar. */
  protected async moderate(hidden: boolean): Promise<void> {
    const r = this.selected();
    if (!r || (hidden && !this.reasonOk())) return;
    const index = this.rows().findIndex((x) => x.key === r.key);
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await this.repo.moderate({ orderId: r.orderId, productId: r.productId, hidden, ...(hidden ? { reason: this.reason().trim() } : {}) });
      const fresh = await this.repo.order(r.orderId);
      this.all.update((rows) => replaceOrder(rows, r.orderId, fresh));
      const rows = this.rows();
      if (!rows.some((x) => x.key === r.key)) this.selectedKey.set(rows[Math.min(index, rows.length - 1)]?.key ?? null);
      this.toast.set(hidden ? `Avaliação de ${r.productName} escondida` : `Avaliação de ${r.productName} reexibida`);
      this.closeDialogs();
    } catch (err) {
      this.dialogError.set(moderationError(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected val(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }
  protected stars(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
  }
  protected ratingLabel(n: number): string {
    return RATING_LABEL[n - 1] ?? '';
  }
  protected tagLabel(t: string): string {
    return TAG_LABEL[t] ?? t;
  }
  protected fitLabel(f: ReviewRow['fit']): string {
    return f ? FIT_LABEL[f] : '';
  }
  protected edited(r: ReviewRow): boolean {
    return !!r.createdAt && !!r.updatedAt && r.updatedAt.getTime() - r.createdAt.getTime() > 60_000;
  }
  protected shortDate(d: Date | null): string {
    return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '—';
  }
  protected stamp(d: Date | null): string {
    return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  }
}
