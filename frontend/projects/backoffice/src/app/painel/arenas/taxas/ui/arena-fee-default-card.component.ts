import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import { pctLabel } from '../../../torneios/taxas/data/tournament-fees';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import {
  ARENA_FEE_TIERS,
  DEFAULT_ARENA_FEE_DEFAULTS,
  TIER_LABEL,
  defaultsIssues,
  sameDefaults,
  type ArenaFeeDefaults,
  type ArenaFeeTier,
} from '../data/arena-fees';

/** Card "Taxa padrão das arenas": % por plano (reservas, planos, aulas, CRM) e % do clubinho. */
@Component({
  selector: 'bo-arena-fee-default-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, NumFieldComponent, IconComponent],
  template: `
    <bo-panel-card kicker="Vale para todas as arenas sem exceção" title="Taxa padrão das arenas">
      <div card-actions class="actions">
        @if (editing()) {
          <button type="button" class="bo-ghost-btn" [disabled]="saving()" (click)="editing.set(false)">Cancelar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canSave()" (click)="submit()">
            {{ saving() ? 'Salvando…' : 'Salvar padrão' }}
          </button>
        } @else if (canEdit()) {
          <button type="button" class="bo-mini-btn" (click)="startEdit()"><bo-icon name="edit" [size]="13" /> Editar padrão</button>
        }
      </div>

      <span class="group">Reservas, planos de horário, aulas e cobranças do CRM · pelo plano da arena</span>
      <div class="grid">
        @for (t of tiers; track t) {
          <div class="f">
            <span class="lbl">{{ tierLabel[t] }}</span>
            @if (editing()) {
              <bo-num-field [label]="'Taxa ' + tierLabel[t]" suffix="%" [value]="draft().tierPercent[t]" [invalid]="!!issues()[t]" (valueChange)="setTier(t, $event)" />
              @if (issues()[t]; as e) { <span class="err">{{ e }}</span> }
            } @else {
              <span class="stat">{{ pct(defaults().tierPercent[t]) }}</span>
            }
          </div>
        }
        <div class="f club">
          <span class="lbl">Clubinho · todos os planos</span>
          @if (editing()) {
            <bo-num-field label="Taxa do clubinho" suffix="%" [value]="draft().clubPercent" [invalid]="!!issues()['club']" (valueChange)="setClub($event)" />
            @if (issues()['club']; as e) { <span class="err">{{ e }}</span> }
          } @else {
            <span class="stat">{{ pct(defaults().clubPercent) }}</span>
          }
        </div>
      </div>

      @if (editing()) {
        <p class="warn">
          <bo-icon name="alert" [size]="14" />
          Vale para os pagamentos confirmados a partir de agora. Arenas com exceção mantêm a delas nos produtos da exceção.
          O mínimo por pagamento (R$ 1,50; nenhum no clubinho) não muda.
        </p>
      } @else if (updatedLine()) {
        <p class="meta">{{ updatedLine() }}</p>
      }
      @if (error(); as e) {
        <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
      }
    </bo-panel-card>
  `,
  styles: `
    .actions { display: flex; gap: 8px; }
    .group { display: block; margin-bottom: 12px; font-size: 12px; color: var(--nx-text-mute); }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.3fr); gap: 16px; align-items: start; }
    .f { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .club { padding-left: 16px; border-left: 1px solid var(--nx-line); }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .stat { height: 40px; display: flex; align-items: center; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: -0.02em; }
    .err { font-size: 11.5px; color: var(--nx-live); }
    .warn { display: flex; align-items: center; gap: 8px; margin: 14px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-pending); }
    .warn bo-icon { flex: none; }
    .meta { margin: 14px 0 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .bo-alert { margin-top: 12px; }
    @media (max-width: 1100px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .club { padding-left: 0; border-left: none; }
    }
    @media (max-width: 560px) {
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class ArenaFeeDefaultCardComponent {
  readonly defaults = input.required<ArenaFeeDefaults>();
  readonly version = input(1);
  readonly updatedAt = input<Date | null>(null);
  readonly updatedBy = input<string | null>(null);
  readonly canEdit = input(false);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly save = output<ArenaFeeDefaults>();

  protected readonly pct = pctLabel;
  protected readonly tiers = ARENA_FEE_TIERS;
  protected readonly tierLabel = TIER_LABEL;

  protected readonly editing = signal(false);
  protected readonly draft = signal<ArenaFeeDefaults>(DEFAULT_ARENA_FEE_DEFAULTS);

  protected readonly issues = computed(() => defaultsIssues(this.draft()));
  protected readonly dirty = computed(() => !sameDefaults(this.draft(), this.defaults()));
  protected readonly canSave = computed(
    () => this.dirty() && Object.keys(this.issues()).length === 0 && !this.saving(),
  );
  protected readonly updatedLine = computed(() => {
    const at = this.updatedAt();
    if (!at) {
      return this.version() <= 1 ? 'Tabela de lançamento (8/6/5%, 8% sem plano, 5% no clubinho) · nunca alterada' : '';
    }
    const day = at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `v${this.version()} · alterado em ${day}${this.updatedBy() ? ' por ' + this.updatedBy() : ''}`;
  });

  isDirty(): boolean {
    return this.editing() && this.dirty();
  }

  finishEdit(): void {
    this.editing.set(false);
  }

  protected startEdit(): void {
    const d = this.defaults();
    this.draft.set({ tierPercent: { ...d.tierPercent }, clubPercent: d.clubPercent });
    this.editing.set(true);
  }

  protected setTier(t: ArenaFeeTier, v: unknown): void {
    this.draft.update((d) => ({ ...d, tierPercent: { ...d.tierPercent, [t]: asNumber(v) } }));
  }

  protected setClub(v: unknown): void {
    this.draft.update((d) => ({ ...d, clubPercent: asNumber(v) }));
  }

  protected submit(): void {
    if (this.canSave()) {
      this.save.emit(this.draft());
    }
  }
}

function asNumber(v: unknown): number {
  return typeof v === 'number' ? v : NaN;
}
