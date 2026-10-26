import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { brl, defaultIssues, feeSplit, pctLabel, type FeeRule } from '../data/tournament-fees';

const EXAMPLE_PRICE = 100;

/** Card "Taxa padrão da plataforma": leitura e edição (comissão e mínimo por inscrição). */
@Component({
  selector: 'bo-fee-default-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, NumFieldComponent, IconComponent],
  template: `
    <bo-panel-card kicker="Vale para todos os torneios sem exceção" title="Taxa padrão da plataforma">
      <div card-actions class="actions">
        @if (editing()) {
          <button type="button" class="bo-ghost-btn" [disabled]="saving()" (click)="cancel()">Cancelar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canSave()" (click)="submit()">
            {{ saving() ? 'Salvando…' : 'Salvar padrão' }}
          </button>
        } @else if (canEdit()) {
          <button type="button" class="bo-mini-btn" (click)="startEdit()"><bo-icon name="edit" [size]="13" /> Editar padrão</button>
        }
      </div>

      <div class="grid">
        <div class="f">
          <span class="lbl">Comissão sobre inscrição</span>
          @if (editing()) {
            <bo-num-field label="Comissão sobre inscrição" suffix="%" [value]="draft().percent" [invalid]="!!issues()['percent']" (valueChange)="patch({ percent: asNumber($event) })" />
            @if (issues()['percent']; as e) { <span class="err">{{ e }}</span> }
          } @else {
            <span class="stat">{{ pct(rule().percent) }}</span>
          }
        </div>
        <div class="f">
          <span class="lbl">Mínimo por inscrição</span>
          @if (editing()) {
            <bo-num-field label="Mínimo por inscrição" prefix="R$" [value]="draft().floorReais" [invalid]="!!issues()['floorReais']" (valueChange)="patch({ floorReais: asNumber($event) })" />
            @if (issues()['floorReais']; as e) { <span class="err">{{ e }}</span> }
          } @else {
            <span class="stat">{{ brl(rule().floorReais) }}</span>
          }
        </div>
        <div class="f">
          <span class="lbl">Quem paga</span>
          <span class="stat">Organizador</span>
        </div>
        <div class="example">
          Inscrição de {{ brl(examplePrice) }} → atleta paga <b>{{ brl(example().athlete) }}</b>, organizador recebe
          <b>{{ brl(example().organizer) }}</b> antes da taxa do meio de pagamento.
        </div>
      </div>

      @if (editing()) {
        <p class="warn">
          <bo-icon name="alert" [size]="14" />
          Vale para novas inscrições dos torneios no padrão. Torneios com exceção e organizadores com comissão no
          cadastro mantêm a deles.
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
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr minmax(0, 1.4fr); gap: 16px; align-items: end; }
    .f { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .stat { height: 40px; display: flex; align-items: center; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: -0.02em; }
    .err { font-size: 11.5px; color: var(--nx-live); }
    .example { padding: 10px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 12px; line-height: 1.5; color: var(--nx-text-mute); }
    .example b { color: var(--nx-text); }
    .warn { display: flex; align-items: center; gap: 8px; margin: 14px 0 0; font-size: 11.5px; color: var(--nx-pending); }
    .warn bo-icon { flex: none; }
    .meta { margin: 14px 0 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .bo-alert { margin-top: 12px; }
    @media (max-width: 1100px) {
      .grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class FeeDefaultCardComponent {
  readonly rule = input.required<FeeRule>();
  readonly version = input(1);
  readonly updatedAt = input<Date | null>(null);
  readonly updatedBy = input<string | null>(null);
  readonly canEdit = input(false);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly save = output<FeeRule>();

  protected readonly brl = brl;
  protected readonly pct = pctLabel;
  protected readonly examplePrice = EXAMPLE_PRICE;

  protected readonly editing = signal(false);
  protected readonly draft = signal<FeeRule>({ percent: 0, floorReais: 0 });

  protected readonly issues = computed(() => defaultIssues(this.draft()));
  protected readonly dirty = computed(
    () => this.draft().percent !== this.rule().percent || this.draft().floorReais !== this.rule().floorReais,
  );
  protected readonly canSave = computed(
    () => this.dirty() && Object.keys(this.issues()).length === 0 && !this.saving(),
  );
  protected readonly example = computed(() => {
    const r = this.editing() && Object.keys(this.issues()).length === 0 ? this.draft() : this.rule();
    return feeSplit(EXAMPLE_PRICE, r);
  });
  protected readonly updatedLine = computed(() => {
    const at = this.updatedAt();
    if (!at) {
      return this.version() <= 1 ? 'Padrão de lançamento · nunca alterado' : '';
    }
    const day = at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `v${this.version()} · alterado em ${day}${this.updatedBy() ? ' por ' + this.updatedBy() : ''}`;
  });

  /** Edição em andamento conta como alteração não salva na tela. */
  isDirty(): boolean {
    return this.editing() && this.dirty();
  }

  /** A tela fecha a edição depois do salvamento confirmado. */
  finishEdit(): void {
    this.setEditing(false);
  }

  protected startEdit(): void {
    this.draft.set({ ...this.rule() });
    this.setEditing(true);
  }

  protected cancel(): void {
    this.setEditing(false);
  }

  protected patch(p: Partial<FeeRule>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected asNumber(v: unknown): number {
    return typeof v === 'number' ? v : NaN;
  }

  protected submit(): void {
    if (this.canSave()) {
      this.save.emit({ ...this.draft() });
    }
  }

  private setEditing(on: boolean): void {
    this.editing.set(on);
  }
}
