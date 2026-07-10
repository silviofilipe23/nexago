import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

type DiscountType = 'percent' | 'fixed';
type CourtScope = 'Todas' | 'Quadra 1' | 'Quadra 2' | 'Quadra 3';

interface PromotionFormData {
  name: string;
  scope: CourtScope;
  days: boolean[];
  timeStart: string;
  timeEnd: string;
  validityStart: string;
  validityEnd: string;
  discountType: DiscountType;
  discountValue: string;
  usageLimit: string;
}

const SCOPE_OPTIONS: CourtScope[] = ['Todas', 'Quadra 1', 'Quadra 2', 'Quadra 3'];
const DAY_SHORT_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const REFERENCE_PRICE = 60;

const DEFAULT_FORM: PromotionFormData = {
  name: '',
  scope: 'Todas',
  days: [true, true, true, true, true, false, false],
  timeStart: '14:00',
  timeEnd: '17:00',
  validityStart: 'Hoje',
  validityEnd: '',
  discountType: 'percent',
  discountValue: '20',
  usageLimit: '',
};

const MOCK_PROMOTIONS: Record<string, PromotionFormData> = {
  p1: { ...DEFAULT_FORM, name: 'Happy Hour da Tarde', scope: 'Todas' },
  p2: {
    name: 'Domingo em Dobro',
    scope: 'Quadra 2',
    days: [false, false, false, false, false, false, true],
    timeStart: '08:00',
    timeEnd: '12:00',
    validityStart: 'Hoje',
    validityEnd: '',
    discountType: 'fixed',
    discountValue: '15',
    usageLimit: '40',
  },
  p3: {
    name: 'Madrugada Beach Tennis',
    scope: 'Quadra 1',
    days: [false, false, false, false, true, true, false],
    timeStart: '06:00',
    timeEnd: '08:00',
    validityStart: '15 Jul',
    validityEnd: '',
    discountType: 'percent',
    discountValue: '30',
    usageLimit: '',
  },
  p4: {
    name: 'Volta às Aulas',
    scope: 'Todas',
    days: [true, true, true, true, true, false, false],
    timeStart: '09:00',
    timeEnd: '12:00',
    validityStart: '01 Jun',
    validityEnd: '30 Jun',
    discountType: 'percent',
    discountValue: '15',
    usageLimit: '60',
  },
};

function formatDiscount(type: DiscountType, value: number): string {
  return type === 'percent' ? `${value}%` : `R$${value}`;
}

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function parseNumber(raw: string): number {
  return Number(raw.replace(',', '.')) || 0;
}

/** Tela Nova/Editar promoção do painel (protótipo ArPromoFormScreen): informações básicas, dias/horários e desconto com prévia ao vivo. */
@Component({
  selector: 'ar-panel-promotion-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" subtitle="Desconto automático em dias e horários definidos">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          Salvar promoção
        </button>
      </ar-page-header>

      <div class="body">
        <div class="col-left">
          <ar-panel-card title="Informações básicas">
            <div class="field-label">Nome da promoção</div>
            <input
              type="text"
              class="input-box name-input"
              placeholder="Ex.: Happy Hour da Tarde"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />

            <div class="field-label">Quadras aplicáveis</div>
            <div class="ar-filter-bar">
              @for (opt of scopeOptions; track opt) {
                <button type="button" class="ar-chip" [class.active]="scope() === opt" (click)="scope.set(opt)">{{ opt }}</button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Quando aplicar">
            <div class="field-label">Dias da semana</div>
            <div class="ar-filter-bar filter-block">
              @for (label of dayLabels; track $index) {
                <button type="button" class="ar-chip" [class.active]="days().has($index)" (click)="toggleDay($index)">{{ label }}</button>
              }
            </div>

            <div class="row-2">
              <div>
                <div class="field-label">Horário inicial</div>
                <input type="time" class="input-box" [value]="timeStart()" (input)="timeStart.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Horário final</div>
                <input type="time" class="input-box" [value]="timeEnd()" (input)="timeEnd.set($any($event.target).value)" />
              </div>
            </div>

            <div class="row-2 row-gap">
              <div>
                <div class="field-label">Início da vigência</div>
                <input type="text" class="input-box" placeholder="Hoje" [value]="validityStart()" (input)="validityStart.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Fim da vigência (opcional)</div>
                <input type="text" class="input-box" placeholder="Sem data final" [value]="validityEnd()" (input)="validityEnd.set($any($event.target).value)" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Desconto">
            <div class="type-toggle">
              <button type="button" class="type-btn" [class.active]="discountType() === 'percent'" (click)="discountType.set('percent')">% Percentual</button>
              <button type="button" class="type-btn" [class.active]="discountType() === 'fixed'" (click)="discountType.set('fixed')">R$ Valor fixo</button>
            </div>

            <div class="row-2">
              <div>
                <div class="field-label">{{ discountFieldLabel() }}</div>
                <input type="text" inputmode="decimal" class="input-box" [value]="discountValue()" (input)="discountValue.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Limite de usos (opcional)</div>
                <input type="text" inputmode="numeric" class="input-box" placeholder="Ilimitado" [value]="usageLimit()" (input)="usageLimit.set($any($event.target).value)" />
              </div>
            </div>
          </ar-panel-card>
        </div>

        <div class="col-right">
          <ar-panel-card title="Resumo">
            <div class="resumo-name">{{ name() || 'Nome da promoção' }}</div>
            <div class="resumo-meta">{{ scope() }} · {{ daysLabel() || 'nenhum dia selecionado' }}</div>
            <div class="resumo-highlight">
              <div class="field-label tone-orange">Desconto aplicado</div>
              <div class="resumo-value">{{ discountDisplay() }}</div>
              <div class="resumo-time">{{ timeStart() }}-{{ timeEnd() }}</div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Exemplo de preço">
            <div class="price-row">
              <span>Preço normal</span>
              <span class="price-old">{{ formatBRL(referencePrice) }}</span>
            </div>
            <div class="price-row">
              <span>Com promoção</span>
              <span class="price-new">{{ formatBRL(discountedPrice()) }}</span>
            </div>
          </ar-panel-card>

          <div class="hint-box">
            O desconto aparece automaticamente para o cliente ao escolher um horário elegível — sem necessidade de cupom.
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
      overflow: auto;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .field-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .filter-block {
      margin-bottom: 18px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .name-input {
      margin-bottom: 18px;
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .row-gap {
      margin-top: 18px;
    }

    .type-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }

    .type-btn {
      height: 52px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .type-btn:hover {
      background: var(--nx-surface-2);
    }

    .type-btn.active {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .resumo-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .resumo-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
      margin-bottom: 16px;
    }

    .resumo-highlight {
      padding: 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
    }

    .resumo-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: var(--nx-orange-500);
      margin-top: 4px;
    }

    .resumo-time {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .price-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
    }

    .price-row span:first-child {
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .price-old {
      font-family: var(--nx-font-mono);
      font-size: 14px;
      color: var(--nx-text-dim);
      text-decoration: line-through;
    }

    .price-new {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      color: var(--nx-win);
    }

    .hint-box {
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .row-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelPromotionFormComponent {
  private readonly router = inject(Router);

  readonly id = input<string | null>(null);

  protected readonly scopeOptions = SCOPE_OPTIONS;
  protected readonly dayLabels = DAY_SHORT_LABELS;
  protected readonly referencePrice = REFERENCE_PRICE;
  protected readonly formatBRL = formatBRL;

  private readonly promoData = computed(() => (this.id() ? (MOCK_PROMOTIONS[this.id()!] ?? null) : null));

  protected readonly isEdit = computed(() => this.id() != null);

  protected readonly name = linkedSignal(() => this.promoData()?.name ?? DEFAULT_FORM.name);
  protected readonly scope = linkedSignal<CourtScope>(() => this.promoData()?.scope ?? DEFAULT_FORM.scope);
  protected readonly days = linkedSignal(() => {
    const source = this.promoData()?.days ?? DEFAULT_FORM.days;
    return new Set(source.map((active, i) => (active ? i : -1)).filter((i) => i >= 0));
  });
  protected readonly timeStart = linkedSignal(() => this.promoData()?.timeStart ?? DEFAULT_FORM.timeStart);
  protected readonly timeEnd = linkedSignal(() => this.promoData()?.timeEnd ?? DEFAULT_FORM.timeEnd);
  protected readonly validityStart = linkedSignal(() => this.promoData()?.validityStart ?? DEFAULT_FORM.validityStart);
  protected readonly validityEnd = linkedSignal(() => this.promoData()?.validityEnd ?? DEFAULT_FORM.validityEnd);
  protected readonly discountType = linkedSignal<DiscountType>(() => this.promoData()?.discountType ?? DEFAULT_FORM.discountType);
  protected readonly discountValue = linkedSignal(() => this.promoData()?.discountValue ?? DEFAULT_FORM.discountValue);
  protected readonly usageLimit = linkedSignal(() => this.promoData()?.usageLimit ?? DEFAULT_FORM.usageLimit);

  protected readonly headerTitle = computed(() => (this.isEdit() ? 'Editar promoção' : 'Nova promoção'));

  protected readonly daysLabel = computed(() =>
    this.dayLabels.filter((_, i) => this.days().has(i)).join(', '),
  );

  protected readonly discountFieldLabel = computed(() => (this.discountType() === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'));

  protected readonly discountDisplay = computed(() => formatDiscount(this.discountType(), parseNumber(this.discountValue())));

  protected readonly discountedPrice = computed(() => {
    const value = parseNumber(this.discountValue());
    const result = this.discountType() === 'percent' ? this.referencePrice * (1 - value / 100) : this.referencePrice - value;
    return Math.max(0, result);
  });

  protected readonly canSave = computed(() => this.name().trim().length > 0 && this.days().size > 0);

  protected toggleDay(index: number): void {
    this.days.update((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    this.router.navigate(['/painel/promocoes']);
  }
}
