import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import {
  LIMITS,
  formatNumber,
  type PromotionRule,
  type RulesIssues,
  type TerminationRule,
} from '../data/squad-rules';
import { NumFieldComponent } from './num-field.component';
import { TierPillComponent } from './tier-pill.component';

type Editing = number | 'term' | null;

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase('pt-BR') + s.slice(1);

/** "Bom comportamento · participação · conteúdo adequado", como no desenho. */
export function criteriaLine(items: string[], separator = ' · ', lowerAll = false): string {
  return items.map((s, i) => (i === 0 && !lowerAll ? s.trim() : lowerFirst(s.trim()))).join(separator);
}

/**
 * Card "Promoção e encerramento". Critério numérico é automático (marca "Elegível" ou "Em risco"
 * no dia 90); o checklist é manual. Promoção nunca é automática: o admin confirma no perfil.
 */
@Component({
  selector: 'bo-promotion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent, NumFieldComponent, TierPillComponent],
  template: `
    <bo-panel-card title="Promoção e encerramento" pad="lg">
      <span card-actions class="note">Avaliado no dia 90</span>

      @for (p of promotion(); track p.from; let i = $index) {
        <div class="rule" [class.open]="editing() === i">
          <button type="button" class="summary" [disabled]="readonly()" [attr.aria-expanded]="editing() === i" (click)="toggle(i)">
            <span class="steps">
              <bo-tier-pill [tier]="p.from" size="sm" />
              <span class="arrow" aria-hidden="true">→</span>
              <bo-tier-pill [tier]="p.to" size="sm" />
            </span>
            <span class="crit">≥ {{ fmt(p.minConversions) }} conversões</span>
            <span class="sub">{{ promotionLine(p) }}</span>
            @if (hasAny('promotion.' + i)) {
              <span class="err">Revise esta regra</span>
            }
          </button>

          @if (editing() === i) {
            <div class="edit">
              <div class="nums">
                <label class="cell">
                  <span class="lbl">Conversões mínimas</span>
                  <bo-num-field
                    [value]="p.minConversions"
                    label="Conversões mínimas para promover"
                    [invalid]="!!issue('promotion.' + i + '.minConversions')"
                    (valueChange)="patchPromotion(i, { minConversions: num($event) })"
                  />
                  @if (issue('promotion.' + i + '.minConversions'); as m) { <span class="err">{{ m }}</span> }
                </label>
                <label class="cell">
                  <span class="lbl">ROI mínimo (opcional)</span>
                  <bo-num-field
                    [value]="p.minRoi"
                    [nullable]="true"
                    suffix="x"
                    label="ROI mínimo para promover"
                    [invalid]="!!issue('promotion.' + i + '.minRoi')"
                    (valueChange)="patchPromotion(i, { minRoi: $event === null ? null : num($event) })"
                  />
                  @if (issue('promotion.' + i + '.minRoi'); as m) { <span class="err">{{ m }}</span> }
                </label>
              </div>
              <span class="lbl">Critérios manuais</span>
              <ul class="checklist">
                @for (item of p.checklist; track $index; let j = $index) {
                  <li>
                    <input class="bo-input" [value]="item" [attr.aria-label]="'Critério ' + (j + 1)" [class.bad]="!item.trim()"
                      (input)="setPromotionItem(i, j, $event)" />
                    <button type="button" class="x" [attr.aria-label]="'Remover ' + item" (click)="patchPromotion(i, { checklist: without(p.checklist, j) })">
                      <bo-icon name="trash" [size]="13" />
                    </button>
                  </li>
                }
              </ul>
              @if (issue('promotion.' + i + '.checklist'); as m) { <span class="err">{{ m }}</span> }
              <div class="actions">
                <button type="button" class="bo-mini-btn" [disabled]="p.checklist.length >= maxItems" (click)="patchPromotion(i, { checklist: p.checklist.concat('') })">
                  <bo-icon name="plus" [size]="12" /> Adicionar critério
                </button>
                <button type="button" class="bo-mini-btn" (click)="editing.set(null)">Concluir</button>
              </div>
            </div>
          }
        </div>
      }

      <div class="rule end" [class.open]="editing() === 'term'">
        <button type="button" class="summary" [disabled]="readonly()" [attr.aria-expanded]="editing() === 'term'" (click)="toggle('term')">
          <span class="steps"><strong>Encerrar parceria</strong></span>
          <span class="crit red">ROI &lt; {{ fmt(termination().maxRoi) }}x</span>
          <span class="sub">ou {{ terminationLine() }}</span>
          @if (hasAny('termination')) {
            <span class="err">Revise esta regra</span>
          }
        </button>

        @if (editing() === 'term') {
          <div class="edit">
            <div class="nums">
              <label class="cell">
                <span class="lbl">Encerrar com ROI abaixo de</span>
                <bo-num-field
                  [value]="termination().maxRoi"
                  suffix="x"
                  label="ROI abaixo do qual a parceria é encerrada"
                  [invalid]="!!issue('termination.maxRoi')"
                  (valueChange)="patchTermination({ maxRoi: num($event) })"
                />
                @if (issue('termination.maxRoi'); as m) { <span class="err">{{ m }}</span> }
              </label>
            </div>
            <span class="lbl">Ou, avaliado pelo time</span>
            <ul class="checklist">
              @for (item of termination().checklist; track $index; let j = $index) {
                <li>
                  <input class="bo-input" [value]="item" [attr.aria-label]="'Motivo ' + (j + 1)" [class.bad]="!item.trim()"
                    (input)="setTerminationItem(j, $event)" />
                  <button type="button" class="x" [attr.aria-label]="'Remover ' + item" (click)="patchTermination({ checklist: without(termination().checklist, j) })">
                    <bo-icon name="trash" [size]="13" />
                  </button>
                </li>
              }
            </ul>
            @if (issue('termination.checklist'); as m) { <span class="err">{{ m }}</span> }
            <div class="actions">
              <button type="button" class="bo-mini-btn" [disabled]="termination().checklist.length >= maxItems" (click)="patchTermination({ checklist: termination().checklist.concat('') })">
                <bo-icon name="plus" [size]="12" /> Adicionar motivo
              </button>
              <button type="button" class="bo-mini-btn" (click)="editing.set(null)">Concluir</button>
            </div>
          </div>
        }
      </div>

      <p class="foot">
        Números são conferidos pelo sistema; o checklist, pelo time. A promoção nunca é automática: um admin
        confirma no perfil. Na revisão de 45 dias, ROI abaixo do limite de encerramento já vira alerta.
      </p>
    </bo-panel-card>
  `,
  styles: `
    .note { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-orange-500); }
    .rule { border-top: 1px solid var(--nx-line); }
    .summary { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; padding: 14px 4px; border: none; background: none; color: inherit; text-align: left; cursor: pointer; border-radius: var(--nx-r-2); }
    .summary:hover:not(:disabled) { background: var(--nx-surface-1); }
    .summary:disabled { cursor: default; }
    .steps { display: inline-flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
    .steps strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; }
    .arrow { color: var(--nx-text-dim); font-size: 13px; }
    .crit { font-family: var(--nx-font-mono); font-weight: 700; font-size: 12.5px; color: var(--nx-orange-500); white-space: nowrap; }
    .crit.red { color: var(--nx-live); }
    .sub { grid-column: 1 / -1; font-size: 12.5px; color: var(--nx-text-mute); }
    .err { grid-column: 1 / -1; font-size: 12px; color: var(--nx-live); }
    .edit { display: flex; flex-direction: column; gap: 8px; padding: 4px 4px 16px; }
    .nums { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 6px; }
    .cell { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .checklist { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .checklist li { display: flex; gap: 6px; }
    .checklist .bo-input { height: 36px; font-size: 13px; }
    .bo-input.bad { border-color: rgba(255, 59, 48, 0.7); }
    .x { width: 36px; flex: none; display: grid; place-items: center; border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .x:hover { color: var(--nx-live); border-color: rgba(255, 59, 48, 0.4); }
    .actions { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; }
    .foot { margin: 6px 0 0; padding-top: 12px; border-top: 1px solid var(--nx-line); font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
  `,
})
export class PromotionCardComponent {
  readonly promotion = input.required<PromotionRule[]>();
  readonly termination = input.required<TerminationRule>();
  readonly issues = input.required<RulesIssues>();
  readonly readonly = input(false);

  readonly promotionChange = output<PromotionRule[]>();
  readonly terminationChange = output<TerminationRule>();

  protected readonly editing = signal<Editing>(null);
  protected readonly maxItems = LIMITS.checklistItems;

  protected toggle(target: Exclude<Editing, null>): void {
    this.editing.update((current) => (current === target ? null : target));
  }

  protected issue(path: string): string | undefined {
    return this.issues()[path];
  }

  protected hasAny(prefix: string): boolean {
    return Object.keys(this.issues()).some((k) => k.startsWith(prefix + '.'));
  }

  protected promotionLine(p: PromotionRule): string {
    const roi = p.minRoi !== null && Number.isFinite(p.minRoi) ? [`ROI ≥ ${formatNumber(p.minRoi)}x`] : [];
    return criteriaLine([...roi, ...p.checklist.filter((s) => s.trim())]) || 'Sem critério manual';
  }

  protected terminationLine(): string {
    return criteriaLine(this.termination().checklist.filter((s) => s.trim()), ', ', true) || 'decisão do time';
  }

  protected patchPromotion(index: number, patch: Partial<PromotionRule>): void {
    this.promotionChange.emit(this.promotion().map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  protected patchTermination(patch: Partial<TerminationRule>): void {
    this.terminationChange.emit({ ...this.termination(), ...patch });
  }

  protected setPromotionItem(index: number, item: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchPromotion(index, { checklist: this.promotion()[index]!.checklist.map((s, j) => (j === item ? value : s)) });
  }

  protected setTerminationItem(item: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchTermination({ checklist: this.termination().checklist.map((s, j) => (j === item ? value : s)) });
  }

  protected without(list: string[], index: number): string[] {
    return list.filter((_, i) => i !== index);
  }

  protected fmt(n: number): string {
    return formatNumber(n);
  }

  protected num(v: number | [number, number] | null): number {
    return v === null || Array.isArray(v) ? NaN : v;
  }
}
