import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../../data/callable-error';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelShellComponent } from '../../../ui/panel-shell.component';
import { PillComponent } from '../../../ui/pill.component';
import { cancelBlock, pillOf, primaryAction, type Order, type OrderAction } from '../data/order';
import { OrdersRepository } from '../data/orders.repository';
import { printLabels } from '../data/print';
import { OrderItemsCardComponent } from './order-items-card.component';
import { OrderNoteComponent } from './order-note.component';
import { OrderSideComponent } from './order-side.component';
import { OrderTimelineComponent } from './order-timeline.component';
import { RefundDialogComponent, type RefundRequest } from './refund-dialog.component';

type LoadState = 'loading' | 'ok' | 'missing' | 'error';
type Dialog = 'cancel' | 'pickup' | 'ship' | 'refund' | null;

/** Loja › Pedidos › #NX-xxxx (03). */
@Component({
  selector: 'bo-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ConfirmDialogComponent, FieldComponent, IconComponent, OrderItemsCardComponent, OrderNoteComponent, OrderSideComponent,
    OrderTimelineComponent, PanelShellComponent, PillComponent, RefundDialogComponent, RouterLink,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Trilha"><a routerLink="/painel/loja/visao-geral">Loja</a> › <a routerLink="/painel/loja/pedidos">Pedidos</a></nav>
          <div class="title-row">
            <h1>Pedido {{ order() ? '#' + order()!.number : '' }}</h1>
            @if (order(); as o) { <bo-pill [tone]="pill().tone">{{ pill().label }}</bo-pill> }
          </div>
          @if (order()?.status === 'can') { <p class="reason">Cancelado: {{ order()!.cancelReason }}</p> }
        </div>
        <div class="spacer"></div>
        @if (order(); as o) {
          @if (o.status !== 'can') {
            <span [title]="cancelWhy() ?? ''">
              <button type="button" class="danger-ghost" [disabled]="cancelWhy() !== null || busy()" (click)="openDialog('cancel')">Cancelar pedido</button>
            </span>
          }
          <button type="button" class="bo-mini-btn" (click)="print()"><bo-icon name="printer" [size]="14" /> Imprimir</button>
          @if (primary(); as p) {
            <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="runPrimary()">
              <bo-icon name="check" [size]="13" /> {{ p.label }}</button>
          }
        }
      </header>

      <div class="body">
        @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }
        @if (error(); as e) { <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div> }
        @switch (state()) {
          @case ('loading') { <div class="grid"><div class="skel tall"></div><div class="skel"></div></div> }
          @case ('missing') { <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Pedido não encontrado.</span></div> }
          @case ('error') {
            <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Não foi possível carregar o pedido.</span>
              <button type="button" class="bo-mini-btn" (click)="load()">Tentar de novo</button></div>
          }
          @case ('ok') {
            @if (order(); as o) {
              @if (o.status === 'tra') { <p class="hint">Em trânsito não dá para cancelar: quando chegar, abra uma <a routerLink="/painel/loja/trocas">troca/devolução</a>.</p> }
              @if (o.status === 'sepd' && o.separatedAt && o.delivery.type === 'arena' && o.transferCode) {
                <p class="hint">Separado e a caminho da arena na remessa {{ o.transferCode }}: fica pronto para retirar quando a arena confirmar o recebimento.</p>
              }
              <div class="grid">
                <div class="main">
                  <bo-order-items-card [order]="o" />
                  <bo-order-timeline [order]="o" />
                </div>
                <div class="side">
                  <bo-order-side [order]="o" [busy]="busy()" (resendCode)="resend('pickup_code')" (refund)="openDialog('refund')" />
                  <bo-order-note [order]="o" />
                </div>
              </div>
            }
          }
        }
      </div>
    </bo-panel-shell>

    @if (order(); as o) {
      <bo-confirm-dialog [open]="dialog() === 'cancel'" [title]="'Cancelar pedido #' + o.number + '?'" confirmLabel="Cancelar pedido"
        tone="danger" size="md" [busy]="busy()" [error]="dialogError()" [confirmDisabled]="!reason().trim()"
        [description]="cancelDescription()" (confirmed)="cancel()" (dismissed)="closeDialog()">
        <bo-field label="Motivo"><textarea class="bo-input area" [value]="reason()" (input)="reason.set(val($event))"></textarea></bo-field>
        @if (o.status !== 'pag') {
          <div class="radios" role="radiogroup" aria-label="Destino do reembolso">
            <label><input type="radio" name="cx-dest" [checked]="refundTo() === 'original'" (change)="refundTo.set('original')" /> Reembolso no meio original</label>
            <label><input type="radio" name="cx-dest" [checked]="refundTo() === 'saldo'" (change)="refundTo.set('saldo')" /> Saldo na carteira</label>
          </div>
        }
      </bo-confirm-dialog>

      <bo-confirm-dialog [open]="dialog() === 'pickup'" title="Confirmar retirada" confirmLabel="Confirmar retirada" [busy]="busy()"
        [error]="dialogError()" [confirmDisabled]="!codeOk()"
        description="Peça o código de 4 dígitos que o cliente recebeu (ou leia o QR do app com o leitor). Confirmar gera a Saída de estoque na arena."
        (confirmed)="act('confirmar_retirada', { pickupCode: code() })" (dismissed)="closeDialog()">
        <bo-field label="Código de retirada">
          <input class="bo-input code" inputmode="numeric" autocomplete="off" maxlength="40" aria-label="Código de retirada"
            [value]="code()" (input)="setCode($event)" (keydown.enter)="codeOk() && act('confirmar_retirada', { pickupCode: code() })" />
        </bo-field>
      </bo-confirm-dialog>

      <bo-confirm-dialog [open]="dialog() === 'ship'" title="Marcar como enviado" confirmLabel="Marcar como enviado" size="md"
        [busy]="busy()" [error]="dialogError()" [confirmDisabled]="!ship().carrier.trim()"
        description="Gera a Saída de estoque no CD e avisa o cliente."
        (confirmed)="act('enviar', ship())" (dismissed)="closeDialog()">
        <div class="two">
          <bo-field label="Transportadora"><input class="bo-input" [value]="ship().carrier" (input)="setShip('carrier', $event)" /></bo-field>
          <bo-field label="Código de rastreio"><input class="bo-input" [value]="ship().tracking" (input)="setShip('tracking', $event)" /></bo-field>
          <bo-field label="Link de rastreio (https://)"><input class="bo-input" type="url" [value]="ship().trackingUrl" (input)="setShip('trackingUrl', $event)" /></bo-field>
          <bo-field label="Previsão de entrega"><input class="bo-input" type="date" [value]="ship().eta" (input)="setShip('eta', $event)" /></bo-field>
        </div>
      </bo-confirm-dialog>

      <bo-refund-dialog [order]="o" [open]="dialog() === 'refund'" [busy]="busy()" [error]="dialogError()"
        (submitted)="refund($event)" (dismissed)="closeDialog()" />
    }
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumb a { color: inherit; text-decoration: none; }
    .crumb a:hover { color: var(--nx-text); }
    .title-row { display: flex; align-items: center; gap: 12px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .reason { margin: 2px 0 0; font-size: 12px; color: var(--nx-live); }
    .spacer { flex: 1; }
    .danger-ghost { height: 32px; padding: 0 10px; border: none; background: none; color: var(--nx-live); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .danger-ghost:hover:not(:disabled) { text-decoration: underline; }
    .danger-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 14px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    .main, .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .hint { margin: 0; font-size: 12.5px; color: var(--nx-text-mute); }
    .hint a { color: var(--nx-orange-500); }
    .skel { height: 220px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); opacity: 0.6; }
    .skel.tall { height: 420px; }
    .area { height: 80px; padding: 9px 12px; resize: vertical; }
    .code { height: 48px; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: 0.3em; text-align: center; }
    .radios { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; font-size: 13px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class OrderDetailComponent {
  private readonly repo = inject(OrdersRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly order = signal<Order | null>(null);
  protected readonly busy = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly refundTo = signal<'original' | 'saldo'>('original');
  protected readonly code = signal('');
  protected readonly ship = signal({ carrier: '', tracking: '', trackingUrl: '', eta: '' });

  protected readonly pill = computed(() => pillOf(this.order()!));
  protected readonly primary = computed(() => (this.order() ? primaryAction(this.order()!) : null));
  protected readonly cancelWhy = computed(() => (this.order() ? cancelBlock(this.order()!) : null));
  protected readonly codeOk = computed(() => /^\d{4}$/.test(this.code()));
  protected readonly cancelDescription = computed(() => {
    const o = this.order();
    if (!o) return '';
    const stock = o.status === 'ret' ? 'As peças estão na arena: abre uma transferência de volta ao CD em rascunho.' : 'A reserva volta para o estoque.';
    return o.status === 'pag' ? `${stock} Nada foi cobrado ainda.` : `${stock} O reembolso fica registrado como pendente no Financeiro.`;
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.state.set(this.order() ? 'ok' : 'loading');
    try {
      const o = await this.repo.get(id);
      this.order.set(o);
      this.state.set(o ? 'ok' : 'missing');
    } catch {
      this.state.set('error');
    }
  }

  protected openDialog(d: Exclude<Dialog, null>): void {
    this.dialogError.set(null);
    this.reason.set('');
    this.refundTo.set('original');
    this.code.set('');
    this.ship.set({ carrier: '', tracking: '', trackingUrl: '', eta: '' });
    this.dialog.set(d);
  }

  protected closeDialog(): void {
    if (!this.busy()) this.dialog.set(null);
  }

  protected runPrimary(): void {
    const p = this.primary();
    const o = this.order();
    if (!p || !o) return;
    switch (p.kind) {
      case 'reenviar_cobranca': return void this.resend('payment');
      case 'criar_remessa': return void this.router.navigate(['/painel/loja/estoque/transferencia/nova'], { queryParams: { pedidos: o.id } });
      case 'confirmar_retirada': return this.openDialog('pickup');
      case 'enviar': return this.openDialog('ship');
      default: return void this.act(p.kind);
    }
  }

  protected async act(action: OrderAction, extra: Record<string, unknown> = {}): Promise<void> {
    const o = this.order();
    if (!o) return;
    this.busy.set(true);
    this.error.set(null);
    this.dialogError.set(null);
    try {
      const r = await this.repo.act({ orderId: o.id, version: o.version, action, ...extra });
      this.dialog.set(null);
      this.toast.set(DONE[action] + (r.returnTransferId ? ' Transferência de volta aberta em rascunho no Estoque.' : ''));
      await this.load();
    } catch (err) {
      if (this.dialog()) this.dialogError.set(callableErrorMessage(err));
      else this.error.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    void this.act('cancelar', { reason: this.reason().trim(), refundTo: this.refundTo() });
  }

  protected async refund(req: RefundRequest): Promise<void> {
    const o = this.order();
    if (!o) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      const r = await this.repo.refund({ orderId: o.id, version: o.version, ...req });
      this.dialog.set(null);
      this.toast.set(`Reembolso de ${(r.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrado (pendente no Financeiro).`);
      await this.load();
    } catch (err) {
      this.dialogError.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(kind: 'pickup_code' | 'payment'): Promise<void> {
    const o = this.order();
    if (!o) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.repo.resend(o.id, kind);
      const what = kind === 'payment' ? 'Cobrança reenviada' : 'Código reenviado';
      this.toast.set(r.sent > 0 ? `${what} ao cliente.` : `${what}: ficou na caixa de avisos do app (o cliente não tem push ativo).`);
      await this.load();
    } catch (err) {
      this.error.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected print(): void {
    const o = this.order();
    if (o && !printLabels([o])) this.error.set('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
  }

  /** Leitor de QR digita o conteúdo inteiro: fica com os 4 últimos dígitos. */
  protected setCode(e: Event): void {
    const el = e.target as HTMLInputElement;
    this.code.set(el.value.replace(/\D+/g, '').slice(-4));
    el.value = this.code();
  }

  protected setShip(key: 'carrier' | 'tracking' | 'trackingUrl' | 'eta', e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.ship.update((s) => ({ ...s, [key]: v }));
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

const DONE: Record<OrderAction, string> = {
  iniciar_separacao: 'Separação iniciada.',
  marcar_separado: 'Pedido separado.',
  enviar: 'Pedido enviado: o cliente foi avisado.',
  entregue: 'Pedido entregue.',
  confirmar_retirada: 'Retirada confirmada: saída registrada no estoque da arena.',
  cancelar: 'Pedido cancelado.',
};
