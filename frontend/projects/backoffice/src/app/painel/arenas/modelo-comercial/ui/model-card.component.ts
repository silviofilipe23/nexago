import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import {
  DEFAULT_BILLING_MODEL,
  MAX_TIERS,
  NOTE_MAX,
  appendTier,
  brlCents,
  cloneModel,
  modelIssues,
  monthLongLabel,
  pctLabel,
  sameModel,
  tierRangeLabel,
  type BillingModel,
  type BillingTier,
} from '../data/billing-model';

export interface ModelSaveRequest {
  model: BillingModel;
  note: string | null;
  restoredFrom: number | null;
}

/** Card "Regras": faixas (mínimo de reservas, mensalidade, comissão), vigência e meses grátis. */
@Component({
  selector: 'bo-billing-model-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, NumFieldComponent, IconComponent],
  template: `
    <bo-panel-card [kicker]="kicker()" title="Faixas por reservas pagas no mês" [accent]="editing()">
      <div card-actions class="actions">
        @if (editing()) {
          <button type="button" class="bo-ghost-btn" [disabled]="saving()" (click)="cancel()">Cancelar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canSave()" (click)="submit()">
            {{ saving() ? 'Salvando…' : 'Salvar nova versão' }}
          </button>
        } @else if (canEdit()) {
          <button type="button" class="bo-mini-btn" (click)="startEdit(null)"><bo-icon name="edit" [size]="13" /> Editar modelo</button>
        }
      </div>

      @if (restoredFrom(); as v) {
        <p class="restore"><bo-icon name="history" [size]="14" /> Conteúdo da v{{ v }} carregado. Revise e salve para virar a versão vigente.</p>
      }

      <div class="t-head">
        <span>Faixa</span><span>Reservas pagas no mês</span><span>Mensalidade</span><span>Comissão NexaGO</span><span></span>
      </div>
      @for (t of shown().tiers; track $index; let i = $index) {
        <div class="t-row">
          <span class="badge">{{ i + 1 }}</span>
          @if (editing()) {
            <span class="f">
              <span class="range-edit">
                <span class="dim">a partir de</span>
                <bo-num-field size="sm" [label]="'Mínimo de reservas da faixa ' + (i + 1)" [value]="t.minBookings" [disabled]="i === 0" [invalid]="!!issues()['tiers.' + i + '.minBookings']" (valueChange)="patchTier(i, { minBookings: asNumber($event) })" />
              </span>
              @if (issues()['tiers.' + i + '.minBookings']; as e) { <span class="err">{{ e }}</span> }
            </span>
            <span class="f">
              <bo-num-field size="sm" prefix="R$" [label]="'Mensalidade da faixa ' + (i + 1)" [value]="t.monthlyFeeCents / 100" [invalid]="!!issues()['tiers.' + i + '.monthlyFeeCents']" (valueChange)="patchTier(i, { monthlyFeeCents: toCents($event) })" />
              @if (issues()['tiers.' + i + '.monthlyFeeCents']; as e) { <span class="err">{{ e }}</span> }
            </span>
            <span class="f">
              <bo-num-field size="sm" suffix="%" [label]="'Comissão da faixa ' + (i + 1)" [value]="t.commissionPercent" [invalid]="!!issues()['tiers.' + i + '.commissionPercent']" (valueChange)="patchTier(i, { commissionPercent: asNumber($event) })" />
              @if (issues()['tiers.' + i + '.commissionPercent']; as e) { <span class="err">{{ e }}</span> }
            </span>
            <span class="rm">
              @if (i > 0) {
                <button type="button" class="bo-ghost-btn danger" [attr.aria-label]="'Remover faixa ' + (i + 1)" (click)="removeTier(i)"><bo-icon name="trash" [size]="13" /></button>
              }
            </span>
          } @else {
            <span class="mono">{{ range(i) }}</span>
            <span class="mono" [class.dim]="t.monthlyFeeCents === 0">{{ t.monthlyFeeCents === 0 ? 'sem mensalidade' : brl(t.monthlyFeeCents) }}</span>
            <span class="stat">{{ pct(t.commissionPercent) }}</span>
            <span></span>
          }
        </div>
      }
      @if (editing() && draft().tiers.length < maxTiers) {
        <button type="button" class="bo-mini-btn add" (click)="addTier()"><bo-icon name="plus" [size]="13" /> Adicionar faixa</button>
      }

      <div class="grid">
        <div class="f">
          <span class="lbl">Começa a cobrar em</span>
          @if (editing()) {
            <input class="month" type="month" aria-label="Mês de início da cobrança" [value]="draft().effectiveFrom" [class.invalid]="!!issues()['effectiveFrom']" (input)="patch({ effectiveFrom: inputValue($event) })" />
            @if (issues()['effectiveFrom']; as e) { <span class="err">{{ e }}</span> }
          } @else {
            <span class="val">{{ monthLong(shown().effectiveFrom) }}</span>
          }
          <span class="hint">Antes disso é o período gratuito de implantação.</span>
        </div>
        <div class="f">
          <span class="lbl">Meses grátis para arena nova</span>
          @if (editing()) {
            <bo-num-field label="Meses grátis para arena nova" suffix="meses" [value]="draft().newArenaFreeMonths" [invalid]="!!issues()['newArenaFreeMonths']" (valueChange)="patch({ newArenaFreeMonths: asNumber($event) })" />
            @if (issues()['newArenaFreeMonths']; as e) { <span class="err">{{ e }}</span> }
          } @else {
            <span class="val">{{ shown().newArenaFreeMonths === 0 ? 'nenhum' : shown().newArenaFreeMonths + (shown().newArenaFreeMonths === 1 ? ' mês' : ' meses') }}</span>
          }
          <span class="hint">Para quem entra depois do início, contados do mês de entrada.</span>
        </div>
        @if (editing()) {
          <div class="f wide">
            <span class="lbl">Nota da versão (opcional)</span>
            <input class="note" type="text" [maxLength]="noteMax" placeholder="Ex.: proposta após conversa com as arenas" aria-label="Nota da versão" [value]="note()" (input)="note.set(inputValue($event))" />
          </div>
        }
      </div>

      <p class="rules">
        A faixa alcançada vale para o mês inteiro. Abaixo do mínimo da 2ª faixa a arena paga a mensalidade da 1ª, além
        da comissão. Mais reservas nunca aumenta comissão nem mensalidade.
      </p>
      @if (!editing() && updatedLine()) {
        <p class="meta">{{ updatedLine() }}</p>
      }
      @if (error(); as e) {
        <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
      }
    </bo-panel-card>
  `,
  styles: `
    .actions { display: flex; gap: 8px; }
    .restore { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 12px; color: var(--nx-pending); }
    .t-head, .t-row { display: grid; grid-template-columns: 36px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 44px; gap: 14px; align-items: center; }
    .t-head { padding: 0 4px 10px; border-bottom: 1px solid var(--nx-line); }
    .t-head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .t-row { padding: 10px 4px; border-bottom: 1px solid var(--nx-line); }
    .badge { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--nx-surface-1); font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 700; }
    .mono { font-family: var(--nx-font-mono); font-size: 13px; }
    .dim { color: var(--nx-text-dim); }
    .stat { font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
    .f { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .range-edit { display: flex; align-items: center; gap: 8px; }
    .range-edit .dim { font-size: 12px; flex: none; }
    .range-edit bo-num-field { width: 96px; }
    .err { font-size: 11px; color: var(--nx-live); }
    .rm { display: flex; justify-content: flex-end; }
    .add { align-self: flex-start; margin-top: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
    .wide { grid-column: 1 / -1; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .val { font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; }
    .hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .month, .note { height: 40px; padding: 0 11px; box-sizing: border-box; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 13px; color-scheme: dark; }
    .note { font-family: var(--nx-font-ui); }
    .month:focus, .note:focus { outline: none; border-color: rgba(255, 106, 26, 0.5); }
    .month.invalid { border-color: rgba(255, 59, 48, 0.7); }
    .rules { margin: 16px 0 0; padding: 10px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 12px; line-height: 1.5; color: var(--nx-text-mute); }
    .meta { margin: 12px 0 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .bo-alert { margin-top: 12px; }
    @media (max-width: 760px) {
      .t-head { display: none; }
      .t-row { grid-template-columns: 30px minmax(0, 1fr) minmax(0, 1fr); }
      .t-row > :nth-child(4) { grid-column: 2; }
      .t-row > :nth-child(5) { grid-column: 3; justify-content: flex-start; }
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class BillingModelCardComponent {
  readonly model = input.required<BillingModel>();
  readonly saved = input(false);
  readonly version = input(1);
  readonly updatedAt = input<Date | null>(null);
  readonly updatedBy = input<string | null>(null);
  readonly canEdit = input(false);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly save = output<ModelSaveRequest>();

  protected readonly brl = brlCents;
  protected readonly pct = pctLabel;
  protected readonly monthLong = monthLongLabel;
  protected readonly maxTiers = MAX_TIERS;
  protected readonly noteMax = NOTE_MAX;

  readonly editing = signal(false);
  readonly draft = signal<BillingModel>(cloneModel(DEFAULT_BILLING_MODEL));
  protected readonly note = signal('');
  protected readonly restoredFrom = signal<number | null>(null);

  protected readonly shown = computed(() => (this.editing() ? this.draft() : this.model()));
  readonly issues = computed(() => modelIssues(this.draft()));
  private readonly dirty = computed(() => !sameModel(this.draft(), this.model()) || !this.saved());
  protected readonly canSave = computed(
    () => this.editing() && this.dirty() && Object.keys(this.issues()).length === 0 && !this.saving(),
  );
  protected readonly kicker = computed(() =>
    this.editing() ? 'Editando — vale a partir da próxima versão salva' : this.saved() ? `Versão vigente · v${this.version()}` : 'Valores de exemplo · nunca salvos',
  );
  protected readonly updatedLine = computed(() => {
    const at = this.updatedAt();
    if (!at) {
      return '';
    }
    const day = at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `v${this.version()} · salva em ${day}${this.updatedBy() ? ' por ' + this.updatedBy() : ''}`;
  });

  /** Rascunho válido em edição, senão o salvo: o simulador e a prévia seguem a tela. */
  readonly working = computed(() =>
    this.editing() && Object.keys(this.issues()).length === 0 ? this.draft() : this.model(),
  );

  isDirty(): boolean {
    return this.editing() && !sameModel(this.draft(), this.model());
  }

  finishEdit(): void {
    this.editing.set(false);
    this.restoredFrom.set(null);
    this.note.set('');
  }

  /** Abre a edição com o modelo vigente ou com o de uma versão antiga (restaurar). */
  startEdit(from: { model: BillingModel; version: number } | null): void {
    this.draft.set(cloneModel(from?.model ?? this.model()));
    this.restoredFrom.set(from?.version ?? null);
    this.note.set(from ? `Restaurada da v${from.version}` : '');
    this.editing.set(true);
  }

  protected range(i: number): string {
    return `${tierRangeLabel(this.shown(), i)} reservas`;
  }

  protected cancel(): void {
    this.finishEdit();
  }

  protected patch(p: Partial<BillingModel>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected patchTier(index: number, p: Partial<BillingTier>): void {
    this.draft.update((d) => ({ ...d, tiers: d.tiers.map((t, i) => (i === index ? { ...t, ...p } : t)) }));
  }

  protected addTier(): void {
    this.draft.update((d) => appendTier(d));
  }

  protected removeTier(index: number): void {
    this.draft.update((d) => ({ ...d, tiers: d.tiers.filter((_, i) => i !== index) }));
  }

  protected asNumber(v: unknown): number {
    return typeof v === 'number' ? v : NaN;
  }

  protected toCents(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : NaN;
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected submit(): void {
    if (this.canSave()) {
      this.save.emit({ model: cloneModel(this.draft()), note: this.note().trim() || null, restoredFrom: this.restoredFrom() });
    }
  }
}
