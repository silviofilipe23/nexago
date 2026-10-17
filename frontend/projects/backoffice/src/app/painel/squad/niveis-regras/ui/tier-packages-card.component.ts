import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import type { KitSkuOption } from '../data/squad-rules.repository';
import {
  SQUAD_TIERS,
  TIER_LABELS,
  brl,
  toCents,
  type KitSku,
  type RegistrationType,
  type RulesIssues,
  type SquadTier,
  type TierPackage,
} from '../data/squad-rules';
import { NumFieldComponent } from './num-field.component';
import { TierPillComponent } from './tier-pill.component';

export interface TierPatch {
  tier: SquadTier;
  patch: Partial<TierPackage>;
}

const REGISTRATION_OPTIONS: ReadonlyArray<{ type: RegistrationType; label: string; fallback: number }> = [
  { type: 'discount', label: '% desc.', fallback: 20 },
  { type: 'freePerMonth', label: 'grátis/mês', fallback: 1 },
  { type: 'freeUnlimited', label: 'Grátis ilimitadas', fallback: 4 },
];

/** Campos do grid, na ordem em que as mensagens aparecem embaixo dele. */
const GRID_FIELDS: ReadonlyArray<{ field: string; label: string }> = [
  { field: 'commissionPct', label: 'Comissão' },
  { field: 'ladder', label: 'Comissão' },
  { field: 'followerDiscountPct', label: 'Desc. seguidor' },
  { field: 'margin', label: '' },
  { field: 'registrations', label: 'Inscrições' },
  { field: 'kit', label: 'Kit' },
  { field: 'kitCostCents', label: 'Custo kit' },
];

/** Campos que moram em "Mais benefícios": com erro, o bloco abre sozinho. */
const HIDDEN_FIELDS = ['events', 'kitSku', 'campaignFeeCapCents', 'tournamentOriginBonusCents'];

const skuKeyOf = (s: KitSku) => `${s.productId}/${s.skuId}`;

/** Card "Pacote por nível": um bloco por nível com comissão, desconto, inscrições e kit. */
@Component({
  selector: 'bo-tier-packages-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent, ToggleComponent, NumFieldComponent, TierPillComponent],
  template: `
    <bo-panel-card title="Pacote por nível" pad="lg">
      <span card-actions class="note">Alterar vale para novos contratos</span>
      <div class="tiers">
        @for (key of tierKeys; track key) {
          @let t = tiers()[key];
          <section class="tier" [attr.aria-label]="labels[key]">
            <header class="tier-head">
              <bo-tier-pill [tier]="key" />
              <span class="spacer"></span>
              @if (key === 'pro') {
                <span class="extra">+ cachê por campanha · teto {{ money(t.campaignFeeCapCents) }}</span>
              }
              @if (key === 'cap') {
                <span class="extra">+ {{ money(t.tournamentOriginBonusCents) }} por torneio originado</span>
              }
            </header>

            <div class="grid">
              <div class="cell">
                <span class="lbl">Comissão</span>
                <bo-num-field
                  [value]="t.commissionPct"
                  [allowRange]="key === 'pro'"
                  suffix="%"
                  [label]="'Comissão do ' + labels[key]"
                  [invalid]="has(key, 'commissionPct') || has(key, 'ladder') || has(key, 'margin')"
                  [disabled]="readonly()"
                  (valueChange)="patch(key, { commissionPct: commission($event) })"
                />
              </div>
              <div class="cell">
                <span class="lbl">Desc. seguidor</span>
                <bo-num-field
                  [value]="t.followerDiscountPct"
                  suffix="%"
                  [label]="'Desconto do seguidor no ' + labels[key]"
                  [invalid]="has(key, 'followerDiscountPct') || has(key, 'margin')"
                  [disabled]="readonly()"
                  (valueChange)="patch(key, { followerDiscountPct: num($event) })"
                />
              </div>
              <div class="cell">
                <span class="lbl">Inscrições</span>
                <div class="reg">
                  @if (t.registrations.type !== 'freeUnlimited') {
                    <bo-num-field
                      class="reg-n"
                      [value]="t.registrations.value"
                      [label]="'Valor das inscrições do ' + labels[key]"
                      [invalid]="has(key, 'registrations')"
                      [disabled]="readonly()"
                      (valueChange)="patch(key, { registrations: { type: t.registrations.type, value: num($event) } })"
                    />
                  }
                  <select
                    class="bo-select"
                    title="Desconto % na inscrição, N inscrições grátis por mês ou grátis ilimitadas (com teto mensal oculto)"
                    [attr.aria-label]="'Tipo de benefício de inscrição do ' + labels[key]"
                    [disabled]="readonly()"
                    (change)="setRegistrationType(key, $event)"
                  >
                    @for (o of registrationOptions; track o.type) {
                      <option [value]="o.type" [selected]="o.type === t.registrations.type">{{ o.label }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="cell">
                <span class="lbl">Kit</span>
                <input
                  class="bo-input"
                  [class.bad]="has(key, 'kit')"
                  [value]="t.kit"
                  [attr.aria-label]="'Kit do ' + labels[key]"
                  [attr.aria-invalid]="has(key, 'kit')"
                  [disabled]="readonly()"
                  (input)="patch(key, { kit: text($event) })"
                />
              </div>
              <div class="cell">
                <span class="lbl">Custo kit</span>
                <bo-num-field
                  [value]="t.kitCostCents / 100"
                  prefix="R$"
                  [grouping]="true"
                  [label]="'Custo do kit do ' + labels[key]"
                  [invalid]="has(key, 'kitCostCents')"
                  [disabled]="readonly()"
                  (valueChange)="patch(key, { kitCostCents: cents($event) })"
                />
              </div>
            </div>

            @for (m of gridMessages(key); track m) {
              <p class="err" role="alert">{{ m }}</p>
            }

            <button type="button" class="more-btn" [attr.aria-expanded]="isOpen(key)" (click)="toggle(key)">
              Mais benefícios
              <bo-icon name="chevron-down" [size]="13" [class.up]="isOpen(key)" />
            </button>

            @if (isOpen(key)) {
              <div class="more">
                <label class="cell">
                  <span class="lbl">Eventos</span>
                  <input
                    class="bo-input"
                    placeholder="Ex.: Prioridade + exclusivos"
                    [class.bad]="has(key, 'events')"
                    [value]="t.events"
                    [attr.aria-invalid]="has(key, 'events')"
                    [disabled]="readonly()"
                    (input)="patch(key, { events: text($event) })"
                  />
                  @if (issue(key, 'events'); as m) { <span class="err">{{ m }}</span> }
                </label>
                <label class="cell">
                  <span class="lbl">SKU do kit na Loja</span>
                  <select class="bo-select" [disabled]="readonly() || skus() === null" (change)="pickSku(key, $event)">
                    <option value="" [selected]="!t.kitSku">Sem SKU (não dá baixa no estoque)</option>
                    @if (t.kitSku && !knownSku(t.kitSku)) {
                      <option [value]="skuKey(t.kitSku)" selected>{{ skus() === null ? 'Carregando…' : 'SKU fora do catálogo ativo' }}</option>
                    }
                    @for (o of skus() ?? []; track o.key) {
                      <option [value]="o.key" [selected]="!!t.kitSku && skuKey(t.kitSku) === o.key">{{ o.label }}</option>
                    }
                  </select>
                  <span class="hint">{{ skuHint() }}</span>
                </label>
                @if (t.registrations.type === 'freeUnlimited') {
                  <div class="cell">
                    <span class="lbl">Teto mensal das gratuitas</span>
                    <bo-num-field
                      [value]="t.registrations.value"
                      suffix="por mês"
                      [label]="'Teto mensal oculto das gratuitas do ' + labels[key]"
                      [invalid]="has(key, 'registrations')"
                      [disabled]="readonly()"
                      (valueChange)="patch(key, { registrations: { type: 'freeUnlimited', value: num($event) } })"
                    />
                    <span class="hint">Não aparece para o embaixador.</span>
                  </div>
                }
                @if (key === 'pro') {
                  <div class="cell">
                    <span class="lbl">Teto de cachê por campanha</span>
                    <bo-num-field
                      [value]="(t.campaignFeeCapCents ?? 0) / 100"
                      prefix="R$"
                      [grouping]="true"
                      label="Teto de cachê por campanha do Pro"
                      [invalid]="has(key, 'campaignFeeCapCents')"
                      [disabled]="readonly()"
                      (valueChange)="patch(key, { campaignFeeCapCents: cents($event) })"
                    />
                    @if (issue(key, 'campaignFeeCapCents'); as m) { <span class="err">{{ m }}</span> }
                  </div>
                }
                @if (key === 'cap') {
                  <div class="cell">
                    <span class="lbl">Bônus por torneio originado</span>
                    <bo-num-field
                      [value]="(t.tournamentOriginBonusCents ?? 0) / 100"
                      prefix="R$"
                      [grouping]="true"
                      label="Bônus por torneio originado do Captain"
                      [invalid]="has(key, 'tournamentOriginBonusCents')"
                      [disabled]="readonly()"
                      (valueChange)="patch(key, { tournamentOriginBonusCents: cents($event) })"
                    />
                    @if (issue(key, 'tournamentOriginBonusCents'); as m) { <span class="err">{{ m }}</span> }
                  </div>
                }
                <div class="half">
                  <strong>50% para a dupla em ações selecionadas</strong>
                  <bo-toggle
                    [checked]="t.partnerHalfOff"
                    [disabled]="readonly()"
                    [ariaLabel]="'50% para a dupla no ' + labels[key]"
                    (checkedChange)="patch(key, { partnerHalfOff: $event })"
                  />
                </div>
              </div>
            }
          </section>
        }
      </div>

      <footer class="margin">
        <div class="mtext">
          <strong>Margem máxima por inscrição</strong>
          <span>Comissão + desconto do seguidor. No Pro vale o piso da faixa; o contrato fixa o valor exato.</span>
        </div>
        <bo-num-field
          class="margin-n"
          suffix="%"
          [value]="marginMaxPct()"
          label="Margem máxima por inscrição"
          [invalid]="!!issues()['marginMaxPct']"
          [disabled]="readonly()"
          (valueChange)="marginChange.emit(num($event))"
        />
      </footer>
      @if (issues()['marginMaxPct']; as m) { <p class="err">Margem: {{ m }}</p> }
    </bo-panel-card>
  `,
  styles: `
    .note { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-orange-500); }
    .tiers { display: flex; flex-direction: column; gap: 12px; }
    .tier { container-type: inline-size; padding: 16px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: rgba(255, 255, 255, 0.015); }
    .tier-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
    .spacer { flex: 1; }
    .extra { font-size: 12.5px; color: var(--nx-text-mute); }
    .grid { display: grid; grid-template-columns: minmax(64px, 0.8fr) minmax(64px, 0.8fr) minmax(150px, 1.7fr) minmax(0, 1.7fr) minmax(84px, 0.9fr); gap: 10px; align-items: end; }
    .cell { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; line-height: 1.35; text-transform: uppercase; color: var(--nx-text-dim); }
    .reg { display: flex; gap: 6px; min-width: 0; }
    .reg-n { width: 48px; flex: none; }
    .reg .bo-select { flex: 1; min-width: 0; height: 40px; padding: 0 26px 0 10px; background-position: calc(100% - 14px) 18px, calc(100% - 9px) 18px; font-size: 12.5px; text-overflow: ellipsis; }
    .bo-input { height: 40px; font-size: 13px; text-overflow: ellipsis; }
    .bo-input.bad { border-color: rgba(255, 59, 48, 0.7); }
    .err { margin: 8px 0 0; font-size: 12px; color: var(--nx-live); }
    .cell .err { margin: 0; }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .more-btn { margin-top: 12px; padding: 0; border: none; background: none; display: inline-flex; align-items: center; gap: 5px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; color: var(--nx-text-mute); cursor: pointer; }
    .more-btn:hover { color: var(--nx-text); }
    .up { display: inline-flex; transform: rotate(180deg); }
    .more { margin-top: 12px; padding-top: 14px; border-top: 1px dashed var(--nx-line-strong); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; }
    .more .bo-select { height: 40px; font-size: 12.5px; }
    .half { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; }
    .half strong { flex: 1; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .margin { margin-top: 16px; display: flex; align-items: center; gap: 16px; }
    .mtext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .mtext strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .mtext span { font-size: 12px; color: var(--nx-text-dim); }
    .margin-n { width: 88px; flex: none; }
    @container (max-width: 560px) {
      /* Comissão, desconto e custo numa linha; inscrições e kit em linha cheia. */
      .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-flow: row dense; }
      .cell:nth-child(3), .cell:nth-child(4) { grid-column: 1 / -1; }
      .more { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class TierPackagesCardComponent {
  readonly tiers = input.required<Record<SquadTier, TierPackage>>();
  readonly marginMaxPct = input.required<number>();
  readonly issues = input.required<RulesIssues>();
  /** `null` enquanto carrega (ou sem acesso ao catálogo). */
  readonly skus = input<KitSkuOption[] | null>(null);
  readonly readonly = input(false);

  readonly tierChange = output<TierPatch>();
  readonly marginChange = output<number>();

  protected readonly tierKeys = SQUAD_TIERS;
  protected readonly labels = TIER_LABELS;
  protected readonly registrationOptions = REGISTRATION_OPTIONS;
  protected readonly skuKey = skuKeyOf;
  private readonly open = signal<ReadonlySet<SquadTier>>(new Set());

  protected issue(tier: SquadTier, field: string): string | undefined {
    return this.issues()[`tiers.${tier}.${field}`];
  }

  protected has(tier: SquadTier, field: string): boolean {
    return this.issue(tier, field) !== undefined;
  }

  protected gridMessages(tier: SquadTier): string[] {
    return GRID_FIELDS.flatMap(({ field, label }) => {
      const m = this.issue(tier, field);
      return m ? [label ? `${label}: ${m}` : m] : [];
    });
  }

  protected isOpen(tier: SquadTier): boolean {
    return this.open().has(tier) || HIDDEN_FIELDS.some((f) => this.has(tier, f));
  }

  protected toggle(tier: SquadTier): void {
    const next = new Set(this.open());
    if (next.has(tier)) {
      next.delete(tier);
    } else {
      next.add(tier);
    }
    this.open.set(next);
  }

  protected patch(tier: SquadTier, patch: Partial<TierPackage>): void {
    this.tierChange.emit({ tier, patch });
  }

  protected setRegistrationType(tier: SquadTier, event: Event): void {
    const type = (event.target as HTMLSelectElement).value as RegistrationType;
    const option = REGISTRATION_OPTIONS.find((o) => o.type === type)!;
    this.patch(tier, { registrations: { type, value: option.fallback } });
  }

  protected knownSku(sku: KitSku): boolean {
    return (this.skus() ?? []).some((o) => o.key === skuKeyOf(sku));
  }

  protected skuHint(): string {
    return this.skus() === null
      ? 'Carregando o catálogo da Loja…'
      : 'Escolher o SKU preenche o custo do kit com o custo médio dele; dá para ajustar.';
  }

  protected pickSku(tier: SquadTier, event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    const option = (this.skus() ?? []).find((o) => o.key === key);
    if (!option) {
      this.patch(tier, { kitSku: null });
      return;
    }
    this.patch(tier, {
      kitSku: { productId: option.productId, skuId: option.skuId },
      ...(option.costCents !== null ? { kitCostCents: option.costCents } : {}),
    });
  }

  protected money(cents: number | undefined): string {
    return cents !== undefined && Number.isFinite(cents) ? brl(cents) : 'R$ —';
  }

  protected num(v: number | [number, number] | null): number {
    return v === null || Array.isArray(v) ? NaN : v;
  }

  protected commission(v: number | [number, number] | null): number | [number, number] {
    return v ?? NaN;
  }

  protected cents(v: number | [number, number] | null): number {
    return toCents(this.num(v));
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
