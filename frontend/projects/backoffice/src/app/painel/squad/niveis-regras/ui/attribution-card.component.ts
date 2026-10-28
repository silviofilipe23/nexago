import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import type { AttributionModel, AttributionRules, FollowerDiscountKind, RulesIssues } from '../data/squad-rules';
import { NumFieldComponent } from './num-field.component';

type ToggleKey = 'requirePaidConfirmation' | 'cancelOnRefund' | 'followerDiscountFirstOnly' | 'blockSelfReferral';

interface RuleRow {
  key: ToggleKey;
  title: string;
  description: string;
  /** Regra do programa: sempre ligada, não desliga pela tela. */
  locked: boolean;
}

const ROWS: readonly RuleRow[] = [
  {
    key: 'requirePaidConfirmation',
    title: 'Comissão só após pagamento confirmado',
    description: 'Nasce pendente e é liberada no webhook de pagamento aprovado',
    locked: true,
  },
  {
    key: 'cancelOnRefund',
    title: 'Cancelar comissão em reembolso ou cancelamento',
    description: 'Estorna automaticamente, inclusive se já liberada; se já foi paga, desconta no próximo repasse',
    locked: true,
  },
  {
    key: 'followerDiscountFirstOnly',
    title: 'Desconto do seguidor só na primeira compra',
    description: 'Uma vez de cada: primeira inscrição, primeira reserva e primeiro clubinho',
    locked: false,
  },
  {
    key: 'blockSelfReferral',
    title: 'Proibir autoindicação',
    description: 'Embaixador não ganha comissão sobre a própria inscrição ou da dupla',
    locked: false,
  },
];

const SCOPES: ReadonlyArray<{ kind: FollowerDiscountKind; label: string }> = [
  { kind: 'registration', label: 'Inscrições em torneios' },
  { kind: 'booking', label: 'Reservas de quadra' },
  { kind: 'club', label: 'Clubinho' },
];

const MODELS: ReadonlyArray<{ id: AttributionModel; label: string }> = [
  { id: 'lastTouch', label: 'Último código / link usado' },
  { id: 'firstTouch', label: 'Primeiro toque' },
];

/** Card "Regras de atribuição": toggles + janela do link + modelo. Vale para todos ao salvar. */
@Component({
  selector: 'bo-attribution-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent, ToggleComponent, NumFieldComponent],
  template: `
    <bo-panel-card title="Regras de atribuição" pad="lg">
      <ul class="rules">
        @for (row of rows; track row.key) {
          <li class="rule">
            <div class="text">
              <strong>
                {{ row.title }}
                @if (row.locked) {
                  <span class="lock" title="Regra do programa"><bo-icon name="lock" [size]="12" /></span>
                }
              </strong>
              <span>{{ row.description }}</span>
            </div>
            <span [attr.title]="row.locked ? 'Regra do programa' : null">
              <bo-toggle
                [checked]="value()[row.key]"
                [disabled]="row.locked || readonly()"
                [ariaLabel]="row.title"
                (checkedChange)="setToggle(row.key, $event)"
              />
            </span>
          </li>
        }
      </ul>

      <div class="scope">
        <div class="text">
          <strong>Onde o desconto do seguidor vale</strong>
          @if (noScope()) {
            <span class="warn">Nenhum marcado: quem usa o código não ganha desconto. A comissão das inscrições continua.</span>
          } @else {
            <span>Desligado num tipo, o código ainda é aceito e atribuído, só sem desconto</span>
          }
        </div>
        <ul class="kinds">
          @for (s of scopes; track s.kind) {
            <li class="kind">
              <span>{{ s.label }}</span>
              <bo-toggle
                [checked]="value().followerDiscountScope[s.kind]"
                [disabled]="readonly()"
                [ariaLabel]="'Desconto do seguidor em ' + s.label"
                (checkedChange)="setScope(s.kind, $event)"
              />
            </li>
          }
        </ul>
      </div>

      <div class="fields">
        <div class="cell">
          <span class="lbl">Janela de atribuição do link</span>
          <bo-num-field
            [value]="value().windowDays"
            suffix="dias"
            label="Janela de atribuição do link, em dias"
            [invalid]="!!windowIssue()"
            [disabled]="readonly()"
            (valueChange)="patch({ windowDays: num($event) })"
          />
          @if (windowIssue(); as m) {
            <span class="err">{{ m }}</span>
          } @else {
            <span class="hint">Clique no link ou QR grava a atribuição na conta.</span>
          }
        </div>
        <div class="cell">
          <span class="lbl">Modelo</span>
          <select class="bo-select" aria-label="Modelo de atribuição" [disabled]="readonly()" (change)="setModel($event)">
            @for (m of models; track m.id) {
              <option [value]="m.id" [selected]="m.id === value().model">{{ m.label }}</option>
            }
          </select>
          <span class="hint">Código digitado no checkout sempre vence o link.</span>
        </div>
      </div>
    </bo-panel-card>
  `,
  styles: `
    .rules { margin: 0; padding: 0; list-style: none; }
    .rule { display: flex; align-items: center; gap: 16px; padding: 13px 0; border-top: 1px solid var(--nx-line); }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    strong { display: inline-flex; align-items: center; gap: 7px; font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .text > span { font-size: 12px; color: var(--nx-text-dim); }
    .lock { display: inline-flex; color: var(--nx-text-dim); }
    .scope { display: flex; flex-direction: column; gap: 10px; padding: 13px 0 16px; border-top: 1px solid var(--nx-line); }
    .warn { font-size: 12px; color: var(--nx-live); }
    .kinds { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .kind { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--nx-line); border-radius: 10px; font-size: 13px; color: var(--nx-text); }
    .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding-top: 16px; border-top: 1px solid var(--nx-line); }
    .cell { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .bo-select { height: 40px; }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .err { font-size: 12px; color: var(--nx-live); }
    @media (max-width: 640px) {
      .fields, .kinds { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class AttributionCardComponent {
  readonly value = input.required<AttributionRules>();
  readonly issues = input.required<RulesIssues>();
  readonly readonly = input(false);

  readonly valueChange = output<AttributionRules>();

  protected readonly rows = ROWS;
  protected readonly models = MODELS;
  protected readonly scopes = SCOPES;
  protected readonly noScope = computed(() => SCOPES.every((s) => !this.value().followerDiscountScope[s.kind]));
  protected readonly windowIssue = computed(() => this.issues()['attribution.windowDays'] ?? null);

  protected patch(patch: Partial<AttributionRules>): void {
    this.valueChange.emit({ ...this.value(), ...patch });
  }

  protected setToggle(key: ToggleKey, on: boolean): void {
    if (ROWS.find((r) => r.key === key)?.locked) {
      return;
    }
    this.patch({ [key]: on });
  }

  protected setScope(kind: FollowerDiscountKind, on: boolean): void {
    this.patch({ followerDiscountScope: { ...this.value().followerDiscountScope, [kind]: on } });
  }

  protected setModel(event: Event): void {
    this.patch({ model: (event.target as HTMLSelectElement).value as AttributionModel });
  }

  protected num(v: number | [number, number] | null): number {
    return v === null || Array.isArray(v) ? NaN : v;
  }
}
