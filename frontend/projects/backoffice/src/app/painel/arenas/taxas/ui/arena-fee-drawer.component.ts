import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import { SegComponent } from '../../../torneios/planos/ui/seg.component';
import { pctLabel } from '../../../torneios/taxas/data/tournament-fees';
import {
  ARENA_FEE_PRODUCTS,
  ARENA_FEE_REASONS,
  PRODUCT_HINT,
  PRODUCT_LABEL,
  TIER_LABEL,
  defaultPercentOf,
  draftIssues,
  draftOf,
  sameDraft,
  type ArenaFeeDefaults,
  type ArenaFeeDraft,
  type ArenaFeeOverride,
  type ArenaFeeProduct,
  type ArenaFeeTier,
} from '../data/arena-fees';
import type { ArenaFeeLogEntry } from '../data/arena-fees.repository';

const STAMP = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Drawer "Editar taxa" de uma arena: padrão ou personalizada por produto, com motivo, validade e histórico. */
@Component({
  selector: 'bo-arena-fee-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumFieldComponent, SegComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="arena-fee-title">
      <header>
        <div class="titles">
          <span class="lbl">Editar taxa · plano {{ tierLabel[tier()] }}</span>
          <h2 id="arena-fee-title">{{ arenaName() }}</h2>
        </div>
        <button type="button" class="close" aria-label="Fechar" (click)="closed.emit()">✕</button>
      </header>

      <div class="body">
        <div class="f">
          <span class="lbl">Taxa aplicada</span>
          <bo-seg label="Taxa aplicada" [options]="modes" [value]="draft().mode" [disabled]="!canEdit()" (valueChange)="setMode($event)" />
        </div>

        @if (draft().mode === 'custom') {
          <div class="prods">
            @for (p of products; track p) {
              <div class="prod">
                <div class="pt">
                  <strong>{{ productLabel[p] }}</strong>
                  <span>{{ productHint[p] }} · padrão {{ pct(base(p)) }}</span>
                  @if (issues()[p]; as e) { <span class="bad">{{ e }}</span> }
                </div>
                <bo-num-field size="sm" suffix="%" [nullable]="true" [label]="'Taxa ' + productLabel[p]" [value]="draft().products[p]" [invalid]="!!issues()[p]" [disabled]="!canEdit()" (valueChange)="setProduct(p, $event)" />
              </div>
            }
          </div>
          <p class="note">
            Vazio = o produto segue o padrão. 0% isenta (sem o mínimo por pagamento).
            @if (canEdit()) {
              <button type="button" class="link" (click)="exemptAll()">Isentar todos</button>
            }
          </p>
          @if (issues()['products']; as e) { <p class="hint bad">{{ e }}</p> }

          <div class="f">
            <span class="lbl">Motivo da exceção · obrigatório</span>
            <div class="chips">
              @for (r of reasons; track r) {
                <button type="button" class="bo-chip" [class.active]="draft().reason === r" [disabled]="!canEdit()" (click)="patch({ reason: r })">{{ r }}</button>
              }
            </div>
          </div>
          <div class="f">
            <span class="lbl">Válida até</span>
            <input class="date" type="date" aria-label="Válida até" [min]="today()" [value]="draft().until" [disabled]="!canEdit()" [class.invalid]="!!issues()['until']" (input)="patch({ until: value($event) })" />
            <span class="hint" [class.bad]="!!issues()['until']">{{ issues()['until'] || 'Vazio = sem data de fim. Depois do dia, volta ao padrão sozinha.' }}</span>
          </div>
        } @else {
          <p class="note">
            A arena segue o padrão: {{ pct(base('booking')) }} em reservas, planos de horário, aulas e CRM (plano
            {{ tierLabel[tier()] }}) e {{ pct(base('club')) }} no clubinho.
          </p>
        }

        <div class="f">
          <span class="lbl">Histórico</span>
          @if (historyError(); as e) {
            <p class="hint bad">{{ e }}</p>
          } @else if (history() === null) {
            <div class="skel"></div>
          } @else {
            <ol class="hist">
              @for (h of history(); track h.id) {
                <li>
                  <span class="when">{{ h.createdAt ? stamp(h.createdAt) : '—' }}</span>
                  <span><b>{{ h.changes.join(' · ') }}</b><span class="dim">{{ h.reason ? ' · ' + h.reason : '' }} · {{ h.createdBy ?? '—' }}</span></span>
                </li>
              } @empty {
                <li><span class="when">—</span><span><b>Padrão</b><span class="dim"> · nunca alterada aqui</span></span></li>
              }
            </ol>
          }
        </div>
      </div>

      <footer>
        @if (error(); as e) {
          <div class="msg bad" role="alert">
            {{ e }}
            @if (conflict()) {
              <button type="button" class="bo-ghost-btn" (click)="reload.emit()">Recarregar</button>
            }
          </div>
        } @else {
          <div class="msg" [class.warn]="!!issues()['reason']">
            {{ !canEdit() ? 'Só administradores editam a taxa.' : issues()['reason'] || 'Vale para pagamentos confirmados a partir de agora.' }}
          </div>
        }
        <button type="button" class="bo-mini-btn" (click)="closed.emit()">{{ canEdit() ? 'Cancelar' : 'Fechar' }}</button>
        @if (canEdit()) {
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canSave()" (click)="submit()">
            {{ saving() ? 'Salvando…' : 'Salvar taxa' }}
          </button>
        }
      </footer>
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.55); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(540px, 100%); box-sizing: border-box; display: flex; flex-direction: column; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45); }
    header { display: flex; align-items: flex-start; gap: 12px; padding: 22px 24px; border-bottom: 1px solid var(--nx-line); }
    .titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.01em; }
    .close { width: 34px; height: 34px; flex: none; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); color: var(--nx-text-mute); cursor: pointer; }
    .close:hover { color: var(--nx-text); }
    .body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .f { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .prods { display: flex; flex-direction: column; }
    .prod { display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--nx-line); }
    .prod:first-child { border-top: none; padding-top: 0; }
    .pt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .pt strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .pt span { font-size: 11.5px; color: var(--nx-text-dim); }
    .pt .bad, .hint.bad { color: var(--nx-live); }
    .hint { margin: 0; font-size: 11.5px; line-height: 1.4; color: var(--nx-text-dim); }
    .note { margin: -6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-dim); }
    .link { margin-left: 4px; padding: 0; border: none; background: none; color: var(--nx-orange-500); font: inherit; font-weight: 600; cursor: pointer; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .date { height: 40px; padding: 0 11px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 13px; color-scheme: dark; }
    .date:focus { outline: none; border-color: rgba(255, 106, 26, 0.5); }
    .date.invalid { border-color: rgba(255, 59, 48, 0.7); }
    .hist { margin: 0; padding: 0; list-style: none; }
    .hist li { display: grid; grid-template-columns: 104px 1fr; gap: 10px; padding: 9px 0; border-top: 1px solid var(--nx-line); font-size: 12px; }
    .hist b { font-weight: 600; }
    .when { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .dim { color: var(--nx-text-dim); }
    .skel { height: 64px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    footer { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .msg { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; line-height: 1.4; color: var(--nx-text-dim); }
    .msg.warn { color: var(--nx-pending); }
    .msg.bad { color: var(--nx-live); }
    @media (max-width: 560px) {
      header, .body, footer { padding-left: 16px; padding-right: 16px; }
      footer { flex-wrap: wrap; }
      .msg { flex-basis: 100%; }
    }
  `,
})
export class ArenaFeeDrawerComponent {
  readonly arenaName = input.required<string>();
  readonly tier = input.required<ArenaFeeTier>();
  readonly defaults = input.required<ArenaFeeDefaults>();
  /** Exceção gravada (vencida ou não); `null` = padrão. */
  readonly override = input<ArenaFeeOverride | null>(null);
  readonly today = input.required<string>();
  /** `null` enquanto carrega. */
  readonly history = input<ArenaFeeLogEntry[] | null>(null);
  readonly historyError = input<string | null>(null);
  readonly canEdit = input(false);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly conflict = input(false);

  readonly closed = output<void>();
  readonly save = output<ArenaFeeDraft>();
  readonly reload = output<void>();

  protected readonly pct = pctLabel;
  protected readonly products = ARENA_FEE_PRODUCTS;
  protected readonly productLabel = PRODUCT_LABEL;
  protected readonly productHint = PRODUCT_HINT;
  protected readonly tierLabel = TIER_LABEL;
  protected readonly reasons = ARENA_FEE_REASONS;
  protected readonly modes: ReadonlyArray<readonly ['padrao' | 'custom', string]> = [
    ['padrao', 'Padrão'],
    ['custom', 'Personalizada'],
  ];

  private readonly initial = computed(() => draftOf(this.override()));
  protected readonly draft = linkedSignal(() => this.initial());

  protected readonly issues = computed(() => draftIssues(this.draft(), this.today()));
  protected readonly dirty = computed(() => !sameDraft(this.draft(), this.initial()));
  protected readonly canSave = computed(
    () => this.dirty() && Object.keys(this.issues()).length === 0 && !this.saving(),
  );

  isDirty(): boolean {
    return this.dirty();
  }

  protected base(p: ArenaFeeProduct): number {
    return defaultPercentOf(this.defaults(), this.tier(), p);
  }

  protected setMode(mode: 'padrao' | 'custom'): void {
    this.draft.update((d) => ({ ...d, mode }));
  }

  protected setProduct(p: ArenaFeeProduct, v: unknown): void {
    const n = v === null ? null : typeof v === 'number' ? v : NaN;
    this.draft.update((d) => ({ ...d, products: { ...d.products, [p]: n } }));
  }

  protected exemptAll(): void {
    this.draft.update((d) => {
      const products = { ...d.products };
      for (const p of ARENA_FEE_PRODUCTS) products[p] = 0;
      return { ...d, products };
    });
  }

  protected patch(p: Partial<ArenaFeeDraft>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected submit(): void {
    if (this.canSave()) {
      this.save.emit(this.draft());
    }
  }

  protected stamp(d: Date): string {
    return STAMP.format(d);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
