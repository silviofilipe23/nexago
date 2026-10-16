import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import type { StockLocation, StockRow } from '../../estoque/data/stock';
import { SkuPickerComponent } from '../../estoque/ui/sku-picker.component';
import {
  REASON_LABEL,
  RESOLUTION_LABEL,
  shippingFor,
  type ReturnReason,
  type ReturnResolution,
  type ReturnsConfig,
} from '../data/returns';
import { ReturnsRepository } from '../data/returns.repository';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

interface Draft {
  returnId: string;
  customerName: string;
  customerContact: string;
  orderRef: string;
  orderDate: string;
  deliveredAt: string;
  sku: StockRow | null;
  newSkuId: string;
  reason: ReturnReason;
  resolution: ReturnResolution;
  methodType: 'arena' | 'correios';
  locationId: string;
  paid: string;
  message: string;
  photos: { url: string; path: string }[];
}

function blank(locationId: string): Draft {
  return {
    returnId: crypto.randomUUID().replace(/-/g, ''),
    customerName: '', customerContact: '', orderRef: '', orderDate: '', deliveredAt: '',
    sku: null, newSkuId: '', reason: 'tamanho', resolution: 'troca', methodType: 'arena', locationId,
    paid: '', message: '', photos: [],
  };
}

/** "Nova solicitação" de balcão: o cliente pede a troca pessoalmente, até o app ter pedidos. */
@Component({
  selector: 'bo-new-return-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent, SkuPickerComponent],
  template: `
    <bo-confirm-dialog [open]="open()" title="Nova solicitação" size="md" confirmLabel="Abrir solicitação"
      description="Para trocas pedidas no balcão. Pelo app, a solicitação chega sozinha." [busy]="busy()" [error]="error()"
      (confirmed)="submit()" (dismissed)="closed.emit()">
      <div class="form">
        <div class="grid two">
          <bo-field label="Cliente"><input class="bo-input" [class.err]="miss('customerName')" [value]="d().customerName" (input)="set('customerName', val($event))" /></bo-field>
          <bo-field label="Contato" hint="Opcional"><input class="bo-input" placeholder="Telefone ou e-mail" [value]="d().customerContact" (input)="set('customerContact', val($event))" /></bo-field>
        </div>
        <div class="grid three">
          <bo-field label="Pedido"><input class="bo-input mono" placeholder="NX-0000" [value]="d().orderRef" (input)="set('orderRef', val($event))" /></bo-field>
          <bo-field label="Data do pedido"><input class="bo-input" type="date" [value]="d().orderDate" (input)="set('orderDate', val($event))" /></bo-field>
          <bo-field label="Entregue/retirado em" hint="Conta o prazo"><input class="bo-input" type="date" [value]="d().deliveredAt" (input)="set('deliveredAt', val($event))" /></bo-field>
        </div>

        <div class="field-block">
          <span class="label">Item</span>
          @if (d().sku; as s) {
            <div class="chosen" [class.err]="miss('skuId')">
              <span><strong>{{ s.productName }}</strong> · {{ s.variantLabel }}</span>
              <button type="button" class="link" (click)="set('sku', null)">trocar</button>
            </div>
          } @else {
            <bo-sku-picker [rows]="rows()" placeholder="Buscar o produto devolvido" (picked)="pickSku($event)" (scanned)="scan($event)" />
          }
        </div>

        <div class="grid two">
          <bo-field label="Motivo">
            <select class="bo-select" (change)="set('reason', $any(val($event)))">
              @for (r of reasons; track r.id) { <option [value]="r.id" [selected]="d().reason === r.id">{{ r.label }}</option> }
            </select>
          </bo-field>
          <bo-field label="Resolução pedida">
            <select class="bo-select" (change)="set('resolution', $any(val($event)))">
              @for (r of resolutions; track r.id) { <option [value]="r.id" [selected]="d().resolution === r.id">{{ r.label }}</option> }
            </select>
          </bo-field>
        </div>
        @if (d().resolution === 'troca') {
          <bo-field label="Trocar por" [hint]="siblings().length === 0 ? 'O produto não tem outra variação' : ''">
            <select class="bo-select" [class.err]="miss('newSkuId')" (change)="set('newSkuId', val($event))">
              <option value="">Escolha a variação</option>
              @for (s of siblings(); track s.skuId) { <option [value]="s.skuId" [selected]="d().newSkuId === s.skuId">{{ s.variantLabel }} · {{ s.total }} un.</option> }
            </select>
          </bo-field>
        }

        <div class="grid two">
          <bo-field label="Devolução">
            <select class="bo-select" (change)="set('methodType', $any(val($event)))">
              <option value="arena" [selected]="d().methodType === 'arena'">Na arena</option>
              <option value="correios" [selected]="d().methodType === 'correios'">Correios</option>
            </select>
          </bo-field>
          @if (d().methodType === 'arena') {
            <bo-field label="Arena">
              <select class="bo-select" (change)="set('locationId', val($event))">
                @for (l of locations(); track l.id) { <option [value]="l.id" [selected]="d().locationId === l.id">{{ l.name }}</option> }
              </select>
            </bo-field>
          }
        </div>
        <p class="hint">{{ shippingHint() }}</p>
        <bo-field label="Valor pago no item (R$)" hint="Base do reembolso/crédito (com cupom e Pix rateados)">
          <input class="bo-input" inputmode="decimal" [value]="d().paid" (input)="set('paid', val($event))" />
        </bo-field>

        <bo-field label="Mensagem do cliente">
          <textarea class="bo-input area" [value]="d().message" (input)="set('message', val($event))"></textarea>
        </bo-field>
        <div class="field-block">
          <span class="label">Fotos (até 3)</span>
          <div class="photos">
            @for (p of d().photos; track p.path) { <img [src]="p.url" alt="Foto anexada" width="64" height="64" /> }
            @if (d().photos.length < 3) {
              <label class="add">{{ uploading() ? 'Enviando…' : '+ foto' }}
                <input type="file" hidden accept="image/jpeg,image/png,image/webp" (change)="addPhoto($event)" />
              </label>
            }
          </div>
        </div>
      </div>
    </bo-confirm-dialog>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 12px; }
    .grid { display: grid; gap: 10px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .field-block { display: flex; flex-direction: column; gap: 8px; }
    .mono { font-family: var(--nx-font-mono); }
    .err { border-color: var(--nx-live) !important; }
    .chosen { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 12.5px; }
    .link { background: none; border: none; color: var(--nx-orange-500); cursor: pointer; font-weight: 600; }
    .hint { margin: -4px 0 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .area { height: 70px; padding: 9px 12px; resize: vertical; }
    .photos { display: flex; gap: 8px; align-items: center; }
    .photos img { width: 64px; height: 64px; object-fit: cover; border-radius: 10px; border: 1px solid var(--nx-line); }
    .add { width: 64px; height: 64px; display: grid; place-items: center; border: 1px dashed var(--nx-line-strong); border-radius: 10px; font-size: 11.5px; color: var(--nx-text-dim); cursor: pointer; }
  `,
})
export class NewReturnDialogComponent {
  private readonly repo = inject(ReturnsRepository);

  readonly open = input(false);
  readonly rows = input.required<StockRow[]>();
  readonly locations = input.required<StockLocation[]>();
  readonly config = input.required<ReturnsConfig>();
  readonly created = output<string>();
  readonly closed = output<void>();

  protected readonly reasons = Object.entries(REASON_LABEL).map(([id, label]) => ({ id, label }));
  protected readonly resolutions = Object.entries(RESOLUTION_LABEL).map(([id, label]) => ({ id, label }));
  protected readonly d = signal<Draft>(blank(''));
  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly missing = signal<string[]>([]);

  protected readonly siblings = computed(() => {
    const s = this.d().sku;
    return s ? this.rows().filter((r) => r.productId === s.productId && r.skuId !== s.skuId) : [];
  });
  protected readonly shippingHint = computed(() => {
    const { costCents, paidBy } = shippingFor(this.d().methodType, this.d().reason, this.config());
    const who = paidBy === 'loja' ? 'por conta da loja' : 'por conta do cliente';
    return costCents === 0 ? 'Devolução sem custo.' : `Etiqueta de ${BRL.format(costCents / 100)} ${who}.`;
  });

  constructor() {
    // Cada abertura começa um formulário novo (id novo também: as fotos vão para a pasta dele).
    // Só `open()` é rastreado: o resto vai em untracked, senão mudar `locations` no meio
    // apagaria o que a pessoa já digitou.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          const arena = this.locations().find((l) => l.type === 'arena')?.id ?? this.locations()[0]?.id ?? '';
          this.d.set(blank(arena));
          this.error.set(null);
          this.missing.set([]);
        });
      }
    });
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
  protected miss(field: string): boolean {
    return this.missing().includes(field);
  }
  protected set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }
  protected pickSku(row: StockRow): void {
    this.d.update((d) => ({ ...d, sku: row, newSkuId: '' }));
  }
  protected scan(code: string): void {
    const row = this.rows().find((r) => r.barcode === code || r.skuCode.toUpperCase() === code.toUpperCase());
    if (row) this.pickSku(row);
  }

  protected async addPhoto(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
      this.error.set('Foto em JPG, PNG ou WebP, até 10 MB.');
      return;
    }
    this.uploading.set(true);
    try {
      const p = await this.repo.uploadPhoto(this.d().returnId, file);
      this.d.update((d) => ({ ...d, photos: [...d.photos, p] }));
    } catch (err) {
      this.error.set(callableErrorMessage(err));
    } finally {
      this.uploading.set(false);
    }
  }

  private paidCents(): number | null {
    const t = this.d().paid.trim().replace(/^R\$\s*/, '');
    if (t === '') return null;
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  }

  protected async submit(): Promise<void> {
    const d = this.d();
    const missing = [
      ...(!d.customerName.trim() ? ['customerName'] : []),
      ...(!d.sku ? ['skuId'] : []),
      ...(d.resolution === 'troca' && !d.newSkuId ? ['newSkuId'] : []),
    ];
    this.missing.set(missing);
    if (missing.length > 0) {
      this.error.set('Preencha cliente, item e, na troca, a variação nova.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.repo.create({
        returnId: d.returnId,
        customerName: d.customerName,
        customerContact: d.customerContact,
        orderRef: d.orderRef,
        orderDate: d.orderDate,
        deliveredAt: d.deliveredAt,
        productId: d.sku!.productId,
        skuId: d.sku!.skuId,
        newSkuId: d.resolution === 'troca' ? d.newSkuId : null,
        reason: d.reason,
        message: d.message,
        photos: d.photos,
        resolution: d.resolution,
        returnMethod: { type: d.methodType, locationId: d.methodType === 'arena' ? d.locationId : null },
        paidCents: this.paidCents(),
      });
      this.created.emit(r.returnId);
    } catch (err) {
      this.error.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
