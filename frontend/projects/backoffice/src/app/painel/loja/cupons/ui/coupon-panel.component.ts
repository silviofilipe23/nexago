import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import {
  SCOPE_LABELS,
  generateCode,
  previewDiscountCents,
  shortBrl,
  type Coupon,
  type CouponType,
  type ScopeType,
} from '../data/coupon';
import {
  duplicateForm,
  emptyCouponForm,
  formFromCoupon,
  validateCouponForm,
  type CouponForm,
  type CouponFormErrors,
} from '../data/coupon-form';
import { CouponsRepository, type ScopeOption } from '../data/coupons.repository';
import { parseBrlToCents } from '../../retirada/retirada-format';

export type CouponPanelMode =
  | { kind: 'new' }
  | { kind: 'edit'; coupon: Coupon }
  | { kind: 'duplicate'; coupon: Coupon };

const PREVIEW_CART_CENTS = 20000;

/** Painel lateral "Novo cupom" / edição. Recriado a cada abertura: o form nasce do `mode`. */
@Component({
  selector: 'bo-coupon-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent, IconComponent, ToggleComponent],
  template: `
    <aside class="panel" aria-labelledby="coupon-panel-title">
      <header class="head">
        <h2 id="coupon-panel-title">{{ title() }}</h2>
        <button type="button" class="close" aria-label="Fechar" [disabled]="saving()" (click)="closed.emit()">
          ✕
        </button>
      </header>

      <div class="body">
        <bo-field label="Código" [hint]="errors().code ?? (locked() ? 'Cupom já usado: o código não muda.' : '')">
          <span class="affix">
            <input
              class="bo-input mono"
              maxlength="20"
              autocapitalize="characters"
              [class.invalid]="errors().code"
              [disabled]="locked()"
              [value]="form().code"
              (input)="patch({ code: upper($event) })"
            />
            @if (!locked()) {
              <button type="button" class="affix-action" (click)="patch({ code: newCode() })">Gerar</button>
            }
          </span>
        </bo-field>

        <div class="segmented" role="radiogroup" aria-label="Tipo de desconto">
          @for (t of types; track t.id) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="form().type === t.id"
              [class.on]="form().type === t.id"
              [disabled]="locked()"
              (click)="setType(t.id)"
            >
              {{ t.label }}
            </button>
          }
        </div>

        <div class="two">
          <bo-field label="Desconto" [hint]="errors().value ?? ''">
            <span class="affix">
              @if (form().type === 'fixed') {
                <span class="pre">R$</span>
              }
              <input
                class="bo-input"
                inputmode="decimal"
                [class.invalid]="errors().value"
                [value]="form().value"
                (input)="patch({ value: text($event) })"
              />
              @if (form().type === 'percent') {
                <span class="post">%</span>
              }
            </span>
          </bo-field>
          @if (form().type === 'percent') {
            <bo-field label="Máximo" [hint]="errors().max ?? 'Opcional'">
              <span class="affix">
                <span class="pre">R$</span>
                <input class="bo-input" inputmode="decimal" [value]="form().max" (input)="patch({ max: text($event) })" />
              </span>
            </bo-field>
          }
        </div>

        <bo-field label="Vale para" [hint]="errors().scope ?? ''">
          <select class="bo-select" (change)="setScope(text($event))">
            @for (s of scopes; track s.id) {
              <option [value]="s.id" [selected]="form().scopeType === s.id">{{ s.label }}</option>
            }
          </select>
        </bo-field>

        @if (form().scopeType !== 'store') {
          @if (optionsLoading()) {
            <p class="muted">Carregando opções…</p>
          } @else if (optionsError(); as err) {
            <p class="err">{{ err }}</p>
          } @else if (options().length === 0) {
            <p class="muted">Nada para escolher aqui ainda.</p>
          } @else if (form().scopeType === 'products') {
            <div class="pick-list" role="group" aria-label="Produtos">
              @for (o of options(); track o.id) {
                <label class="pick">
                  <input type="checkbox" [checked]="form().scopeIds.includes(o.id)" (change)="toggleTarget(o)" />
                  <span>{{ o.label }}</span>
                </label>
              }
            </div>
          } @else {
            <select class="bo-select" [attr.aria-label]="scopeLabel()" (change)="pickTarget(text($event))">
              <option value="" [selected]="form().scopeIds.length === 0">Escolha…</option>
              @for (o of options(); track o.id) {
                <option [value]="o.id" [selected]="form().scopeIds[0] === o.id">{{ o.label }}</option>
              }
            </select>
          }
        }

        <div class="two">
          <bo-field label="Pedido mínimo" [hint]="errors().minOrder ?? ''">
            <span class="affix">
              <span class="pre">R$</span>
              <input class="bo-input" inputmode="decimal" [value]="form().minOrder" (input)="patch({ minOrder: text($event) })" />
            </span>
          </bo-field>
          <bo-field label="Limite de usos" [hint]="errors().usageLimit ?? ''">
            <input class="bo-input" inputmode="numeric" [value]="form().usageLimit" (input)="patch({ usageLimit: digits($event) })" />
          </bo-field>
        </div>

        <div class="two">
          <bo-field label="Início" [hint]="errors().startDate ?? ''">
            <input class="bo-input mono" type="date" [value]="form().startDate" (input)="patch({ startDate: text($event) })" />
          </bo-field>
          <bo-field label="Fim" [hint]="errors().endDate ?? 'Vazio = sem prazo'">
            <input class="bo-input mono" type="date" [value]="form().endDate" (input)="patch({ endDate: text($event) })" />
          </bo-field>
        </div>

        <div class="toggle-row">
          <span>1 uso por atleta</span>
          <bo-toggle ariaLabel="1 uso por atleta" [checked]="form().onePerAthlete" (checkedChange)="patch({ onePerAthlete: $event })" />
        </div>
        <div class="toggle-row">
          <span>Acumula com desconto Pix</span>
          <bo-toggle ariaLabel="Acumula com desconto Pix" [checked]="form().stacksWithPix" (checkedChange)="patch({ stacksWithPix: $event })" />
        </div>
        <div class="toggle-row">
          <span>Só no app</span>
          <bo-toggle ariaLabel="Só no app" [checked]="form().appOnly" (checkedChange)="patch({ appOnly: $event })" />
        </div>

        @if (preview(); as text) {
          <p class="preview">{{ text }}</p>
        }

        @if (serverError(); as err) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
        }
      </div>

      <footer class="foot">
        <button type="button" class="bo-ghost-btn" [disabled]="saving()" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving()" (click)="save()">
          {{ saving() ? 'Salvando…' : mode().kind === 'edit' ? 'Salvar' : 'Criar cupom' }}
        </button>
      </footer>
    </aside>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .panel { position: sticky; top: 20px; display: flex; flex-direction: column; max-height: calc(100vh - 120px); background: var(--nx-surface-0); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-4); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45); }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--nx-line); }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; color: var(--nx-text); }
    .close { width: 28px; height: 28px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .close:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    .foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--nx-line); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .affix { position: relative; display: block; }
    .affix .pre { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--nx-text-dim); pointer-events: none; }
    .affix .pre + .bo-input { padding-left: 38px; }
    .affix .post { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--nx-text-dim); pointer-events: none; }
    .affix-action { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); border: none; background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-mono); font-size: 11px; cursor: pointer; padding: 6px; border-radius: var(--nx-r-2); }
    .affix-action:hover { color: var(--nx-orange-500); }
    .mono { font-family: var(--nx-font-mono); letter-spacing: 0.04em; }
    .bo-input.invalid { border-color: rgba(255, 59, 48, 0.6); }
    .segmented { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; gap: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .segmented button { height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .segmented button.on { background: var(--nx-surface-0); color: var(--nx-text); }
    .segmented button:disabled { cursor: default; opacity: 0.6; }
    .pick-list { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding: 6px; border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    .pick { display: flex; align-items: center; gap: 8px; padding: 6px; font-size: 13px; color: var(--nx-text); cursor: pointer; border-radius: var(--nx-r-2); }
    .pick:hover { background: var(--nx-surface-2); }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--nx-text); }
    .muted, .preview { margin: 0; font-size: 12px; color: var(--nx-text-dim); }
    .preview { padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); color: var(--nx-text-mute); }
    .err { margin: 0; font-size: 12px; color: var(--nx-live); }
  `,
})
export class CouponPanelComponent implements OnInit {
  private readonly repository = inject(CouponsRepository);

  readonly mode = input.required<CouponPanelMode>();
  readonly today = input.required<string>();

  readonly closed = output<void>();
  readonly saved = output<string>();

  protected readonly types: ReadonlyArray<{ id: CouponType; label: string }> = [
    { id: 'percent', label: 'Porcentagem' },
    { id: 'fixed', label: 'Valor fixo' },
  ];
  protected readonly scopes = (Object.keys(SCOPE_LABELS) as ScopeType[]).map((id) => ({ id, label: SCOPE_LABELS[id] }));

  protected readonly form = signal<CouponForm>(emptyCouponForm(''));
  protected readonly errors = signal<CouponFormErrors>({});
  protected readonly serverError = signal('');
  protected readonly saving = signal(false);
  protected readonly options = signal<ScopeOption[]>([]);
  protected readonly optionsLoading = signal(false);
  protected readonly optionsError = signal('');

  protected readonly title = computed(() => (this.mode().kind === 'edit' ? `Editar ${this.form().code}` : 'Novo cupom'));
  /** Cupom já usado: quem usou guardou aquele código e aquele tipo. */
  protected readonly locked = computed(() => {
    const m = this.mode();
    return m.kind === 'edit' && m.coupon.uses > 0;
  });
  protected readonly scopeLabel = computed(() => SCOPE_LABELS[this.form().scopeType]);

  protected readonly preview = computed(() => {
    const f = this.form();
    const value = f.type === 'percent' ? Number(f.value) : (parseBrlToCents(f.value) ?? 0);
    if (!(value > 0)) {
      return '';
    }
    const cents = previewDiscountCents(
      {
        type: f.type,
        value,
        maxDiscountCents: f.type === 'percent' ? parseBrlToCents(f.max) : null,
        minOrderCents: parseBrlToCents(f.minOrder),
      },
      PREVIEW_CART_CENTS,
    );
    return cents === 0
      ? `Um carrinho de ${shortBrl(PREVIEW_CART_CENTS)} não atinge o pedido mínimo.`
      : `Em um carrinho de ${shortBrl(PREVIEW_CART_CENTS)} o desconto seria ${shortBrl(cents)}.`;
  });

  ngOnInit(): void {
    const m = this.mode();
    this.form.set(
      m.kind === 'new'
        ? { ...emptyCouponForm(this.today()), code: generateCode() }
        : m.kind === 'edit'
          ? formFromCoupon(m.coupon)
          : duplicateForm(m.coupon, generateCode(), this.today()),
    );
    void this.loadOptions(this.form().scopeType);
  }

  protected patch(patch: Partial<CouponForm>): void {
    this.form.update((f) => ({ ...f, ...patch }));
    this.serverError.set('');
    // O erro some do campo que a pessoa está corrigindo.
    const keys = Object.keys(patch);
    this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k) && !(k === 'scope' && keys.includes('scopeIds')))));
  }

  protected setType(type: CouponType): void {
    if (type !== this.form().type) {
      this.patch({ type, value: '', max: '' });
    }
  }

  protected setScope(value: string): void {
    const scopeType = (Object.keys(SCOPE_LABELS) as ScopeType[]).find((s) => s === value) ?? 'store';
    this.patch({ scopeType, scopeIds: [], scopeLabels: [] });
    void this.loadOptions(scopeType);
  }

  protected pickTarget(id: string): void {
    const option = this.options().find((o) => o.id === id);
    this.patch(option ? { scopeIds: [option.id], scopeLabels: [option.label] } : { scopeIds: [], scopeLabels: [] });
  }

  protected toggleTarget(option: ScopeOption): void {
    const f = this.form();
    const has = f.scopeIds.includes(option.id);
    const pairs = f.scopeIds.map((id, i) => ({ id, label: f.scopeLabels[i] ?? id })).filter((p) => p.id !== option.id);
    if (!has) {
      pairs.push(option);
    }
    this.patch({ scopeIds: pairs.map((p) => p.id), scopeLabels: pairs.map((p) => p.label) });
  }

  private async loadOptions(type: ScopeType): Promise<void> {
    this.options.set([]);
    this.optionsError.set('');
    if (type === 'store') {
      return;
    }
    this.optionsLoading.set(true);
    try {
      const options = await this.repository.scopeOptions(type);
      // A pessoa pode ter trocado o "Vale para" enquanto carregava.
      if (this.form().scopeType === type) {
        this.options.set(options);
      }
    } catch (error) {
      this.optionsError.set(callableErrorMessage(error));
    } finally {
      this.optionsLoading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    const result = validateCouponForm(this.form());
    if (!result.ok) {
      this.errors.set(result.errors);
      return;
    }
    const m = this.mode();
    const payload = m.kind === 'edit' ? { ...result.payload, couponId: m.coupon.id } : result.payload;
    this.saving.set(true);
    this.serverError.set('');
    try {
      this.saved.emit(await this.repository.save(payload));
    } catch (error) {
      const code = String((error as { code?: unknown })?.code ?? '');
      const message = String((error as { message?: unknown })?.message ?? '');
      if (code.includes('already-exists')) {
        this.errors.update((e) => ({ ...e, code: message || 'Já existe um cupom com este código.' }));
      } else if (code.includes('not-found') && (message === '' || message === 'NOT FOUND')) {
        this.serverError.set('Função ainda não publicada no servidor.');
      } else {
        this.serverError.set(callableErrorMessage(error));
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected newCode(): string {
    return generateCode();
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected upper(event: Event): string {
    return this.text(event).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  protected digits(event: Event): string {
    return this.text(event).replace(/\D/g, '');
  }
}
