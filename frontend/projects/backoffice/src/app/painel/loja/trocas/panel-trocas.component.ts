import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { StoreBadgesService } from '../../data/store-badges.service';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import type { StockLocation, StockRow } from '../estoque/data/stock';
import { StockRepository } from '../estoque/data/stock.repository';
import {
  DEFAULT_RETURNS_CONFIG,
  REASON_LABEL,
  RESOLUTION_LABEL,
  RETURN_TABS,
  STATUS_PILL,
  approveLabel,
  canSkipReturn,
  daysAgo,
  itemVariantLabel,
  newVariantStock,
  returnMethodLabel,
  rowsForTab,
  tabCounts,
  windowCheck,
  type ReturnRequest,
  type ReturnResolution,
  type ReturnTab,
  type ReturnsConfig,
} from './data/returns';
import { ReturnsRepository } from './data/returns.repository';
import { NewReturnDialogComponent } from './ui/new-return-dialog.component';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SHORT_DATE = (iso: string | null) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return '';
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]}`;
};

type LoadState = 'loading' | 'ok' | 'error';

/** Loja › Trocas & devoluções: fila de solicitações, decisão e recebimento do produto. */
@Component({
  selector: 'bo-panel-trocas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent, IconComponent, NewReturnDialogComponent, PanelShellComponent, PillComponent],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Loja</div>
          <div class="title-row">
            <h1>Trocas &amp; devoluções</h1>
            @if (counts().analisar > 0) { <bo-pill tone="orange">{{ counts().analisar }} para analisar</bo-pill> }
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" [disabled]="state() !== 'ok'" (click)="newOpen.set(true)">
          <bo-icon name="plus" [size]="13" /> Nova solicitação
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
        @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }
        @if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Não foi possível carregar as solicitações.</span>
            <button type="button" class="bo-mini-btn" (click)="load()">Tentar de novo</button></div>
        }

        <div class="cols">
          <div class="card table-card">
            <div class="tr th">
              <span>Solicitação</span><span>Cliente</span><span>Item</span><span>Motivo</span><span>Pedido</span><span>Resolução</span><span>Status</span>
            </div>
            @if (state() === 'loading') {
              @for (s of [0, 1, 2, 3]; track s) { <div class="skeleton-row"></div> }
            } @else {
              @for (r of rows(); track r.id) {
                <button type="button" class="tr" [class.selected]="selected()?.id === r.id" (click)="select(r.id)">
                  <span class="mono code">{{ r.code }}</span>
                  <span class="strong">{{ r.customerName }}</span>
                  <span class="item">
                    <span class="thumb" aria-hidden="true">@if (imageOf(r)) { <img [src]="imageOf(r)" alt="" width="26" height="26" /> }</span>
                    <span class="who"><span class="name">{{ r.item.productName }}</span><span class="variant">{{ variantOf(r) }}</span></span>
                  </span>
                  <span class="dim">{{ reasonLabel(r) }}</span>
                  <span class="mono dim">{{ r.orderRef || '—' }}{{ r.orderDate ? ' · ' + shortDate(r.orderDate) : '' }}</span>
                  <span class="dim">{{ resolutionLabel(r.resolution) }}</span>
                  <span><bo-pill [tone]="pill(r).tone">{{ pill(r).label }}</bo-pill></span>
                </button>
              } @empty {
                <div class="empty">{{ emptyLabel() }}</div>
              }
            }
          </div>

          <aside class="card detail">
            @if (selected(); as r) {
              <div class="d-head">
                <div>
                  <div class="kicker">Solicitada {{ ago(r) }}</div>
                  <div class="d-title">{{ r.code }} · {{ r.customerName }}</div>
                </div>
                <bo-pill [tone]="pill(r).tone">{{ pill(r).label }}</bo-pill>
              </div>

              <div class="d-item">
                <span class="thumb big" aria-hidden="true">@if (imageOf(r)) { <img [src]="imageOf(r)" alt="" width="52" height="52" /> }</span>
                <span class="who">
                  <span class="name big">{{ r.item.productName }}</span>
                  <span class="variant">{{ r.item.variantLabel || 'único' }}@if (r.resolution === 'troca' && r.newItem) { → trocar por {{ r.newItem.variantLabel }} }</span>
                </span>
              </div>

              @if (r.message) { <blockquote>“{{ r.message }}”</blockquote> }

              @if (r.photos.length > 0) {
                <div class="photos">
                  @for (p of r.photos; track p.path) {
                    <button type="button" class="photo" (click)="zoom.set(p.url)" aria-label="Ver foto em tela cheia"><img [src]="p.url" alt="" /></button>
                  }
                </div>
              }

              <dl class="checks">
                @if (stockInfo(r); as s) {
                  <div [class.bad]="s.available < 1">
                    <dt>Estoque do {{ r.newItem?.variantLabel }}</dt>
                    <dd>{{ s.total }} un. · {{ returnPlace(r) }}: {{ s.atReturn }}</dd>
                  </div>
                }
                <div><dt>Devolução</dt><dd>{{ methodLabel(r) }}</dd></div>
                <div [class.bad]="!window(r).ok" [class.good]="window(r).ok && r.deliveredAt">
                  <dt>Prazo de {{ config().windowDays }} dias</dt><dd>{{ window(r).label }}</dd>
                </div>
                @if (r.paidCents !== null) { <div><dt>Valor pago no item</dt><dd>{{ money(r.paidCents) }}</dd></div> }
                @if (r.refusalReason) { <div class="bad"><dt>Motivo da recusa</dt><dd>{{ r.refusalReason }}</dd></div> }
                @if (r.inspection) { <div><dt>Conferência</dt><dd>{{ r.inspection === 'ok' ? 'OK · voltou ao estoque' : 'Avariado · não voltou ao estoque' }}</dd></div> }
                @if (r.settlement) {
                  <div><dt>{{ r.settlement.type === 'reembolso' ? 'Estorno' : 'Crédito na carteira' }}</dt>
                    <dd>{{ r.settlement.amountCents !== null ? money(r.settlement.amountCents) : 'valor a definir' }} · pendente no Financeiro</dd></div>
                }
              </dl>

              @switch (r.status) {
                @case ('analisar') {
                  <bo-field label="Resolução">
                    <select class="bo-select" [value]="resolution()" (change)="setResolution($any(val($event)))">
                      @for (o of resolutions; track o.id) { <option [value]="o.id" [selected]="resolution() === o.id">{{ o.label }}</option> }
                    </select>
                  </bo-field>
                  @if (canSkip(r)) {
                    <label class="check"><input type="checkbox" [checked]="skipReturn()" (change)="skipReturn.set(!skipReturn())" />
                      Reenviar sem esperar o produto voltar</label>
                  }
                  <div class="actions">
                    <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="refuseOpen.set(true)">Recusar</button>
                    @if (noStockForExchange(r)) {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="approveAs(r, 'saldo')">
                        <bo-icon name="check" [size]="13" /> Aprovar como saldo na carteira</button>
                    } @else {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="approveAs(r, resolution())">
                        <bo-icon name="check" [size]="13" /> {{ approve(r) }}</button>
                    }
                  </div>
                  @if (noStockForExchange(r)) { <p class="note bad">Sem a variação nova no local da devolução: troque por saldo ou transfira antes.</p> }
                }
                @case ('aprovada') {
                  <div class="actions">
                    @if (r.skipReturn) {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="act(r, 'concluir')">Concluir reenvio</button>
                    } @else {
                      <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="act(r, 'em_transito')">Cliente enviou</button>
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="receiveOpen.set(true)">Registrar recebimento</button>
                    }
                  </div>
                }
                @case ('em_transito') {
                  <div class="actions">
                    <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="receiveOpen.set(true)">Registrar recebimento</button>
                  </div>
                }
              }
              @if (actionError(); as e) { <p class="note bad">{{ e }}</p> }

              @if (r.history.length > 0) {
                <ol class="history">
                  @for (h of r.history; track $index) {
                    <li><strong>{{ statusLabel(h.status) }}</strong> · {{ h.actorName }}{{ h.at ? ' · ' + stamp(h.at) : '' }}@if (h.note) { <span> — {{ h.note }}</span> }</li>
                  }
                </ol>
              }
            } @else {
              <div class="placeholder">Selecione uma solicitação</div>
            }
          </aside>
        </div>
      </div>
    </bo-panel-shell>

    <bo-new-return-dialog [open]="newOpen()" [rows]="stock()" [locations]="locations()" [config]="config()"
      (created)="onCreated($event)" (closed)="newOpen.set(false)" />

    <bo-confirm-dialog [open]="refuseOpen()" title="Recusar solicitação?" confirmLabel="Recusar" tone="danger" size="md"
      description="O motivo vai para o cliente." [busy]="busy()" [confirmDisabled]="!refusal().trim()"
      (confirmed)="refuse()" (dismissed)="refuseOpen.set(false)">
      <bo-field label="Motivo"><textarea class="bo-input area" [value]="refusal()" (input)="refusal.set(val($event))"></textarea></bo-field>
    </bo-confirm-dialog>

    <bo-confirm-dialog [open]="outOfWindowOpen()" title="Fora do prazo" confirmLabel="Aprovar mesmo assim" [busy]="busy()"
      [description]="'A entrega passou dos ' + config().windowDays + ' dias. Aprovar fica registrado no histórico.'"
      (confirmed)="confirmOutOfWindow()" (dismissed)="outOfWindowOpen.set(false)" />

    <bo-confirm-dialog [open]="receiveOpen()" title="Registrar recebimento" confirmLabel="Concluir" size="md" [busy]="busy()"
      description="Confira o produto devolvido. OK volta ao estoque; avariado não entra."
      (confirmed)="receive()" (dismissed)="receiveOpen.set(false)">
      <div class="radios">
        <label><input type="radio" name="insp" [checked]="inspection() === 'ok'" (change)="inspection.set('ok')" /> OK — volta ao estoque</label>
        <label><input type="radio" name="insp" [checked]="inspection() === 'avariado'" (change)="inspection.set('avariado')" /> Avariado — descartar</label>
      </div>
    </bo-confirm-dialog>

    @if (zoom(); as url) {
      <button type="button" class="zoom" aria-label="Fechar foto" (click)="zoom.set(null)"><img [src]="url" alt="Foto do cliente" /></button>
    }
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .title-row { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .spacer { flex: 1; }
    .tabs { display: flex; gap: 6px; padding: 10px 32px 0; margin: 0 0 0; }
    .tabs button { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; cursor: pointer; }
    .tabs button.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); font-weight: 700; }
    .tab-count { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .tabs button.active .tab-count { color: var(--nx-orange-500); }
    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; border-top: 1px solid var(--nx-line); }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; align-items: start; }
    .card { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); min-width: 0; }
    .table-card { overflow: hidden; }
    .tr { width: 100%; display: grid; grid-template-columns: 96px minmax(90px, 1fr) minmax(150px, 1.6fr) minmax(90px, 1fr) 110px minmax(90px, 1fr) 104px; gap: 10px; align-items: center; min-height: 60px; padding: 0 16px; border: none; border-top: 1px solid var(--nx-line); background: none; color: var(--nx-text); text-align: left; font: inherit; cursor: pointer; }
    .tr:hover { background: var(--nx-surface-1); }
    .tr.selected { background: rgba(255, 106, 26, 0.05); }
    .th { min-height: 0; padding: 14px 16px 12px; border-top: none; cursor: default; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .th:hover { background: none; }
    .mono { font-family: var(--nx-font-mono); font-size: 11px; }
    .code { font-weight: 600; }
    .strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; }
    .dim { font-size: 12px; color: var(--nx-text-mute); }
    .item { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .thumb { width: 26px; height: 26px; flex: none; border-radius: 6px; overflow: hidden; border: 1px solid var(--nx-line); background: repeating-linear-gradient(-45deg, var(--nx-surface-1), var(--nx-surface-1) 4px, var(--nx-surface-2) 4px, var(--nx-surface-2) 8px); }
    .thumb.big { width: 52px; height: 52px; border-radius: 10px; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name.big { font-size: 14px; white-space: normal; }
    .variant { font-size: 11px; color: var(--nx-text-dim); }
    .empty, .placeholder { padding: 40px 16px; text-align: center; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }
    .placeholder { border-top: none; }
    .skeleton-row { height: 60px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); opacity: 0.5; }

    .detail { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .d-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .d-title { margin-top: 4px; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .d-item { display: flex; align-items: center; gap: 12px; }
    blockquote { margin: 0; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); }
    .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .photo { aspect-ratio: 1.5; padding: 0; border: none; border-radius: 10px; overflow: hidden; background: var(--nx-surface-1); cursor: zoom-in; }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .checks { margin: 0; display: flex; flex-direction: column; gap: 9px; }
    .checks div { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; }
    .checks dt { color: var(--nx-text-mute); }
    .checks dd { margin: 0; font-weight: 600; text-align: right; }
    .checks .good dd { color: var(--nx-win); }
    .checks .bad dd { color: var(--nx-live); }
    .actions { display: flex; justify-content: space-between; gap: 8px; }
    .check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--nx-text-mute); }
    .note { margin: 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .note.bad { color: var(--nx-live); }
    .history { margin: 0; padding: 12px 0 0 16px; border-top: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; color: var(--nx-text-dim); }
    .history strong { color: var(--nx-text-mute); }
    .area { height: 80px; padding: 9px 12px; resize: vertical; }
    .radios { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
    .zoom { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 32px; border: none; background: rgba(0, 0, 0, 0.85); cursor: zoom-out; }
    .zoom img { max-width: 100%; max-height: 100%; border-radius: 12px; }
    @media (max-width: 1200px) { .cols { grid-template-columns: 1fr; } }
  `,
})
export class PanelTrocasComponent {
  private readonly repo = inject(ReturnsRepository);
  private readonly stockRepo = inject(StockRepository);
  private readonly badges = inject(StoreBadgesService);

  protected readonly tabs = RETURN_TABS;
  protected readonly resolutions = Object.entries(RESOLUTION_LABEL).map(([id, label]) => ({ id, label }));

  protected readonly state = signal<LoadState>('loading');
  protected readonly all = signal<ReturnRequest[]>([]);
  protected readonly stock = signal<StockRow[]>([]);
  protected readonly locations = signal<StockLocation[]>([]);
  protected readonly config = signal<ReturnsConfig>(DEFAULT_RETURNS_CONFIG);
  protected readonly tab = signal<ReturnTab>('analisar');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly newOpen = signal(false);
  protected readonly refuseOpen = signal(false);
  protected readonly refusal = signal('');
  protected readonly receiveOpen = signal(false);
  protected readonly inspection = signal<'ok' | 'avariado'>('ok');
  protected readonly outOfWindowOpen = signal(false);
  protected readonly zoom = signal<string | null>(null);
  /** Resolução escolhida no painel ("alterar resolução"); nasce da pedida pelo cliente. */
  protected readonly resolutionOverride = signal<ReturnResolution | null>(null);
  protected readonly skipReturn = signal(false);
  private pendingApproval: ReturnResolution | null = null;

  private readonly now = new Date();
  protected readonly counts = computed(() => tabCounts(this.all()));
  protected readonly rows = computed(() => rowsForTab(this.all(), this.tab()));
  /** A linha selecionada só vale se estiver na aba; senão o painel abre a primeira. */
  protected readonly selected = computed(() => {
    const rows = this.rows();
    return rows.find((r) => r.id === this.selectedId()) ?? rows.at(0) ?? null;
  });
  protected readonly resolution = computed<ReturnResolution>(() => this.resolutionOverride() ?? this.selected()?.resolution ?? 'reembolso');
  protected readonly emptyLabel = computed(() => {
    const t = this.tab();
    return t === 'analisar' ? 'Nenhuma solicitação para analisar' : t === 'aguardando' ? 'Nenhum produto a caminho' : t === 'concluidas' ? 'Nenhuma troca concluída ainda' : 'Nenhuma solicitação recusada';
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [list, config, snap] = await Promise.all([
        this.repo.list(),
        this.repo.config(),
        this.stockRepo.load().catch(() => ({ rows: [] as StockRow[], locations: [] as StockLocation[], movements: [] })),
      ]);
      this.all.set(list);
      this.config.set(config);
      this.stock.set(snap.rows);
      this.locations.set(snap.locations);
      this.state.set('ok');
      this.badges.setReturns(tabCounts(list).analisar);
    } catch {
      this.state.set('error');
    }
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.resetPanel();
  }

  protected setTab(t: ReturnTab): void {
    this.tab.set(t);
    this.selectedId.set(null);
    this.resetPanel();
  }

  private resetPanel(): void {
    this.resolutionOverride.set(null);
    this.skipReturn.set(false);
    this.actionError.set(null);
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
  protected money(c: number): string {
    return BRL.format(c / 100);
  }
  protected shortDate(iso: string | null): string {
    return SHORT_DATE(iso);
  }
  protected stamp(d: Date): string {
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  protected pill(r: ReturnRequest) {
    return STATUS_PILL[r.status];
  }
  protected statusLabel(s: ReturnRequest['status']): string {
    return STATUS_PILL[s]?.label ?? s;
  }
  protected reasonLabel(r: ReturnRequest): string {
    return REASON_LABEL[r.reason];
  }
  protected resolutionLabel(res: ReturnResolution): string {
    return RESOLUTION_LABEL[res];
  }
  protected variantOf(r: ReturnRequest): string {
    return itemVariantLabel(r);
  }
  protected ago(r: ReturnRequest): string {
    return daysAgo(r.createdAt, this.now);
  }
  protected imageOf(r: ReturnRequest): string | null {
    return this.stock().find((s) => s.productId === r.item.productId)?.imageUrl ?? null;
  }
  private locationName(id: string): string {
    return this.locations().find((l) => l.id === id)?.name ?? id;
  }
  protected returnPlace(r: ReturnRequest): string {
    return r.returnMethod.type === 'arena' ? this.locationName(r.returnMethod.locationId ?? '') : this.locationName('cd');
  }
  protected methodLabel(r: ReturnRequest): string {
    return returnMethodLabel(r, (id) => this.locationName(id), (c) => this.money(c));
  }
  protected window(r: ReturnRequest) {
    return windowCheck(r, this.now, this.config());
  }
  protected stockInfo(r: ReturnRequest) {
    return this.resolution() === 'troca' ? newVariantStock({ ...r, resolution: 'troca' }, this.stock()) : null;
  }
  protected noStockForExchange(r: ReturnRequest): boolean {
    const s = this.stockInfo(r);
    return this.resolution() === 'troca' && s !== null && s.available < 1;
  }
  protected approve(r: ReturnRequest): string {
    return approveLabel(this.resolution(), r.returnMethod);
  }
  protected canSkip(r: ReturnRequest): boolean {
    return canSkipReturn(r.reason, this.resolution());
  }
  protected setResolution(res: ReturnResolution): void {
    this.resolutionOverride.set(res);
    this.skipReturn.set(false);
  }

  protected approveAs(r: ReturnRequest, res: ReturnResolution): void {
    this.pendingApproval = res;
    if (!this.window(r).ok) {
      this.outOfWindowOpen.set(true);
      return;
    }
    void this.send(r, { action: 'aprovar', resolution: res, skipReturn: this.skipReturn() && canSkipReturn(r.reason, res) });
  }

  protected confirmOutOfWindow(): void {
    const r = this.selected();
    if (!r || !this.pendingApproval) return;
    this.outOfWindowOpen.set(false);
    const res = this.pendingApproval;
    void this.send(r, { action: 'aprovar', resolution: res, skipReturn: this.skipReturn() && canSkipReturn(r.reason, res), confirmOutOfWindow: true });
  }

  protected act(r: ReturnRequest, action: 'em_transito' | 'concluir'): void {
    void this.send(r, { action });
  }

  protected refuse(): void {
    const r = this.selected();
    if (!r) return;
    void this.send(r, { action: 'recusar', refusalReason: this.refusal() }).then(() => {
      this.refuseOpen.set(false);
      this.refusal.set('');
    });
  }

  protected receive(): void {
    const r = this.selected();
    if (!r) return;
    void this.send(r, { action: 'receber', inspection: this.inspection() }).then(() => this.receiveOpen.set(false));
  }

  private async send(r: ReturnRequest, payload: Record<string, unknown>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const res = await this.repo.act({ returnId: r.id, version: r.version, ...payload });
      this.toast.set(`${r.code}: ${STATUS_PILL[res.status as ReturnRequest['status']]?.label ?? res.status}`);
      this.resetPanel();
      await this.reloadKeeping(r.id);
    } catch (err) {
      this.refuseOpen.set(false);
      this.receiveOpen.set(false);
      this.actionError.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  /** Recarrega e segue a solicitação para a aba em que ela foi parar. */
  private async reloadKeeping(id: string): Promise<void> {
    await this.load();
    const r = this.all().find((x) => x.id === id);
    if (r) {
      this.tab.set(RETURN_TABS.find((t) => t.statuses.includes(r.status))!.id);
      this.selectedId.set(id);
    }
  }

  protected async onCreated(id: string): Promise<void> {
    this.newOpen.set(false);
    this.toast.set('Solicitação aberta');
    await this.reloadKeeping(id);
  }
}
