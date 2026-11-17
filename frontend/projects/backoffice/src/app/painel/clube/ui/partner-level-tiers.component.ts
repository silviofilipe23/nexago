import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import type { PartnerFormField } from '../data/partner';
import {
  LEVEL_TIERS_MAX,
  LEVEL_TIER_RANKS,
  LEVEL_TIER_RANK_LABELS,
  emptyLevelTier,
  levelTierErrors,
  type LevelTierForm,
  type LevelTierRank,
} from '../data/partner-level-tiers';

/**
 * Seção "Desconto por elo" do editor do parceiro (só com cupom fixo): faixas a partir de um elo do
 * SandRanking, cada uma com selo, benefício e cupom. O editor é dono do form; aqui só se emite a
 * lista nova. Mesmo padrão dos "Lugares" (`partner-premium-fields`).
 */
@Component({
  selector: 'bo-partner-level-tiers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent],
  template: `
    <bo-panel-card title="Desconto por elo">
      <div class="stack">
        <p class="explain">
          <bo-icon name="trophy" [size]="13" />
          O benefício principal (selo, benefício e código fixo acima) vale para Iniciante e para quem ainda não tem elo. Cada
          faixa vale a partir do elo escolhido no SandRanking: o atleta recebe a faixa mais alta que o elo dele alcança.
        </p>
        @for (t of tiers(); track $index; let i = $index) {
          <fieldset class="tier" [class.bad]="showErrors() && rowErrors()[i]">
            <legend>Faixa {{ i + 1 }}</legend>
            <div class="g2">
              <select class="bo-select" [attr.aria-label]="'Elo da faixa ' + (i + 1)" [disabled]="disabled()" (change)="setRank(i, value($event))" (blur)="touch.emit('levelTiers')">
                @for (r of ranks; track r) {
                  @if (r === t.minRank || !usedRanks().has(r)) {
                    <option [value]="r" [selected]="r === t.minRank">A partir de {{ rankLabels[r] }}</option>
                  }
                }
              </select>
              <input class="bo-input" placeholder="Selo (15% OFF)" [attr.aria-label]="'Selo da faixa ' + (i + 1)" [value]="t.benefitHighlight" (input)="setTier(i, { benefitHighlight: value($event) })" (blur)="touch.emit('levelTiers')" />
            </div>
            <div class="g2">
              <input class="bo-input" placeholder="Benefício (15% de desconto em todo pedido)" [attr.aria-label]="'Benefício da faixa ' + (i + 1)" [value]="t.benefitTitle" (input)="setTier(i, { benefitTitle: value($event) })" (blur)="touch.emit('levelTiers')" />
              <input class="bo-input mono" placeholder="Cupom (NEXAGO15)" [attr.aria-label]="'Cupom da faixa ' + (i + 1)" [value]="t.couponCode" (input)="setTier(i, { couponCode: value($event) })" (blur)="touch.emit('levelTiers')" />
            </div>
            <div class="tier-foot">
              @if (showErrors() && rowErrors()[i]; as e) {
                <span class="err">{{ e }}</span>
              }
              <button type="button" class="bo-ghost-btn" [disabled]="disabled()" (click)="removeTier(i)">
                <bo-icon name="trash" [size]="12" /> Tirar
              </button>
            </div>
          </fieldset>
        } @empty {
          <p class="hint">Nenhuma faixa: todo atleta recebe o benefício principal.</p>
        }
        <div class="add-row">
          <button type="button" class="bo-mini-btn" [disabled]="disabled() || tiers().length >= max" (click)="addTier()">
            <bo-icon name="plus" [size]="13" /> Adicionar faixa
          </button>
          <span class="hint">{{ tiers().length }}/{{ max }} · Um elo por faixa. O cupom de cada faixa fica guardado à parte: só a equipe vê.</span>
        </div>
      </div>
    </bo-panel-card>
  `,
  styles: `
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    @media (max-width: 760px) { .g2 { grid-template-columns: minmax(0, 1fr); } }
    .hint { margin: 0; font-size: 11px; line-height: 1.35; color: var(--nx-text-dim); }
    .err { font-size: 11.5px; line-height: 1.3; color: #ff9b94; }
    .mono { font-family: var(--nx-font-mono); }
    .tier { margin: 0; padding: 12px; border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .tier.bad { border-color: rgba(255, 59, 48, 0.5); }
    legend { padding: 0 6px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .tier-foot { display: flex; align-items: center; gap: 10px; }
    .tier-foot .bo-ghost-btn { margin-left: auto; }
    .add-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .explain { margin: 0; display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.5; color: var(--nx-text-mute); }
  `,
})
export class PartnerLevelTiersComponent {
  readonly tiers = input.required<LevelTierForm[]>();
  /** Mostra o erro de cada faixa (depois de passar por ela ou de tentar salvar). */
  readonly showErrors = input(false);
  readonly disabled = input(false);
  readonly tiersChange = output<LevelTierForm[]>();
  readonly touch = output<PartnerFormField>();

  protected readonly ranks = LEVEL_TIER_RANKS;
  protected readonly rankLabels = LEVEL_TIER_RANK_LABELS;
  protected readonly max = LEVEL_TIERS_MAX;
  protected readonly rowErrors = computed(() => levelTierErrors(this.tiers()));
  protected readonly usedRanks = computed(() => new Set(this.tiers().map((t) => t.minRank)));

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected addTier(): void {
    const tier = emptyLevelTier(this.tiers());
    if (tier) this.tiersChange.emit([...this.tiers(), tier]);
  }

  protected removeTier(index: number): void {
    this.tiersChange.emit(this.tiers().filter((_, i) => i !== index));
    this.touch.emit('levelTiers');
  }

  protected setRank(index: number, rank: string): void {
    this.setTier(index, { minRank: rank as LevelTierRank });
  }

  protected setTier(index: number, change: Partial<LevelTierForm>): void {
    this.tiersChange.emit(this.tiers().map((t, i) => (i === index ? { ...t, ...change } : t)));
  }
}
