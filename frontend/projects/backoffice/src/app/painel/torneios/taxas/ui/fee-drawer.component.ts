import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import { PillComponent } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { STATUS_LABEL, STATUS_TONE } from '../../data/tournament-status-label';
import { SegComponent } from '../../planos/ui/seg.component';
import { simulateOnPaid, type FeeRow } from '../data/fee-rows';
import type { FeeLogEntry, TournamentRevenue } from '../data/tournament-fees.repository';
import {
  FEE_REASONS,
  SOURCE_LABEL,
  brl,
  dayLabel,
  draftIssues,
  draftOf,
  draftRule,
  feeSplit,
  pctLabel,
  ruleLabel,
  sameDraft,
  type FeeDraft,
  type FeeMode,
} from '../data/tournament-fees';

export interface FeeSaveRequest {
  draft: FeeDraft;
  notify: boolean;
}

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const STAMP = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Drawer "Editar taxa" de um torneio: padrão, personalizada ou isento, com impacto e histórico. */
@Component({
  selector: 'bo-fee-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumFieldComponent, PillComponent, ToggleComponent, SegComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="fee-drawer-title">
      <header>
        <div class="titles">
          <span class="lbl">Editar taxa{{ row().organizerName ? ' · ' + row().organizerName : '' }}</span>
          <h2 id="fee-drawer-title">{{ t().name }}</h2>
          <div class="sub">
            <bo-pill [tone]="statusTone[t().status]">{{ statusLabel[t().status] }}</bo-pill>
            <span>{{ subline() }}</span>
          </div>
        </div>
        <button type="button" class="close" aria-label="Fechar" (click)="closed.emit()">✕</button>
      </header>

      <div class="body">
        <div class="f">
          <span class="lbl">Taxa aplicada</span>
          <bo-seg label="Taxa aplicada" [options]="modes()" [value]="draft().mode" [disabled]="!canEdit()" (valueChange)="setMode($event)" />
        </div>

        @switch (draft().mode) {
          @case ('custom') {
            <div class="g2">
              <div class="f">
                <span class="lbl">Comissão</span>
                <bo-num-field label="Comissão" suffix="%" [value]="draft().percent" [invalid]="!!issues()['percent']" [disabled]="!canEdit()" (valueChange)="patch({ percent: asNumber($event) })" />
                <span class="hint" [class.bad]="!!issues()['percent']">{{ issues()['percent'] || percentHint() }}</span>
              </div>
              <div class="f">
                <span class="lbl">Mínimo por inscrição</span>
                <bo-num-field label="Mínimo por inscrição" prefix="R$" [value]="draft().floorReais" [invalid]="!!issues()['floorReais']" [disabled]="!canEdit()" (valueChange)="patch({ floorReais: asNumber($event) })" />
                <span class="hint" [class.bad]="!!issues()['floorReais']">{{ issues()['floorReais'] || 'Por pagamento: cobre o custo do PIX em valores baixos.' }}</span>
              </div>
            </div>
            <p class="note">A taxa sai do repasse ao organizador; o preço para o atleta não muda.</p>
          }
          @case ('padrao') {
            <p class="note">{{ padraoNote() }}</p>
          }
          @case ('isento') {
            <p class="note">A NexaGO não cobra comissão das inscrições. A taxa do meio de pagamento continua sendo descontada do repasse.</p>
          }
        }

        @if (price(); as p) {
          <div class="cmp">
            <div class="cmp-row head">
              <span class="lbl">Inscrição de {{ brl(p) }}{{ priceNote() }}</span>
              <span class="lbl right">Atual</span>
              <span class="lbl right">Nova</span>
            </div>
            <div class="cmp-row"><span>Taxa</span><span class="a">{{ ruleLabel(row().rule) }}</span><span class="b" [class.hl]="ruleChanged()">{{ ruleLabel(nextRule()) }}</span></div>
            <div class="cmp-row"><span>Atleta paga</span><span class="a">{{ brl(now().athlete) }}</span><span class="b">{{ brl(next().athlete) }}</span></div>
            <div class="cmp-row"><span>Organizador recebe</span><span class="a">{{ brl(now().organizer) }}</span><span class="b">{{ brl(next().organizer) }}</span></div>
            <div class="cmp-row"><span>NexaGO recebe</span><span class="a">{{ brl(now().fee) }}</span><span class="b" [class.hl]="ruleChanged()">{{ brl(next().fee) }}</span></div>
          </div>
        } @else {
          <p class="note">Nenhuma categoria com inscrição paga: a taxa não incide neste torneio.</p>
        }

        @if (revenue(); as r) {
          @if (r.payments > 0) {
            <div class="sim">
              <div>
                <span class="sim-t">Já pago: {{ r.payments }} {{ r.payments === 1 ? 'pagamento' : 'pagamentos' }} · {{ brl(r.grossReais) }}</span>
                <span class="sim-s">A NexaGO recebeu {{ brl(r.feeReais) }}. A nova regra não muda o que já foi pago.</span>
              </div>
              @if (ruleChanged()) {
                <div class="sim-v">
                  <span class="sim-s">Mesmo volume na nova regra</span>
                  <b>≈ {{ brl(simulated()) }}</b>
                  @if (simDelta() !== 0) {
                    <span class="delta" [class.down]="simDelta() < 0">{{ simDelta() > 0 ? '+' : '−' }} {{ brl(abs(simDelta())) }}</span>
                  }
                </div>
              }
            </div>
          }
        }

        @if (draft().mode !== 'padrao') {
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
            <span class="hint" [class.bad]="!!issues()['until']">{{ issues()['until'] || 'Vazio = enquanto o torneio existir. Depois do dia, volta ao padrão sozinha.' }}</span>
          </div>
        }

        @if (canEdit()) {
          <div class="notify">
            <div class="t">
              <strong>Avisar o organizador</strong>
              <span>Notificação no app e no Portal do Organizador.</span>
            </div>
            <bo-toggle ariaLabel="Avisar o organizador" [checked]="notify()" (checkedChange)="notify.set($event)" />
          </div>
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
                <li><span class="when">—</span><span><b>{{ baseLabel() }}</b><span class="dim"> · nunca alterada aqui</span></span></li>
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
            {{ !canEdit() ? 'Só administradores editam a taxa.' : issues()['reason'] || 'Vale para novas inscrições. As já pagas não mudam.' }}
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
    .sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 3px; font-size: 12px; color: var(--nx-text-dim); }
    .close { width: 34px; height: 34px; flex: none; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); color: var(--nx-text-mute); cursor: pointer; }
    .close:hover { color: var(--nx-text); }
    .body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .right { text-align: right; }
    .f { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .hint { font-size: 11.5px; line-height: 1.4; color: var(--nx-text-dim); }
    .hint.bad { color: var(--nx-live); }
    .note { margin: -6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-dim); }
    .cmp-row { display: grid; grid-template-columns: 1fr 96px 96px; gap: 8px; padding: 9px 0; border-top: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-mute); }
    .cmp-row.head { border-top: none; padding-top: 0; }
    .cmp-row .a, .cmp-row .b { font-family: var(--nx-font-mono); text-align: right; }
    .cmp-row .a { color: var(--nx-text-dim); }
    .cmp-row .b { font-weight: 700; color: var(--nx-text); }
    .cmp-row .b.hl { color: var(--nx-orange-500); }
    .sim { display: flex; align-items: flex-end; gap: 14px; justify-content: space-between; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    .sim > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .sim-t { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .sim-s { font-size: 11.5px; color: var(--nx-text-dim); }
    .sim-v { align-items: flex-end; text-align: right; flex: none; }
    .sim-v b { font-family: var(--nx-font-display); font-weight: 800; font-size: 18px; }
    .delta { font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 600; color: var(--nx-win); }
    .delta.down { color: var(--nx-live); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .date { height: 40px; padding: 0 11px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-family: var(--nx-font-mono); font-size: 13px; color-scheme: dark; }
    .date:focus { outline: none; border-color: rgba(255, 106, 26, 0.5); }
    .date.invalid { border-color: rgba(255, 59, 48, 0.7); }
    .notify { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    .notify .t { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .notify strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .notify span { font-size: 11.5px; color: var(--nx-text-dim); }
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
      .g2 { grid-template-columns: minmax(0, 1fr); }
      footer { flex-wrap: wrap; }
      .msg { flex-basis: 100%; }
    }
  `,
})
export class FeeDrawerComponent {
  readonly row = input.required<FeeRow>();
  readonly today = input.required<string>();
  readonly revenue = input<TournamentRevenue | null>(null);
  /** `null` enquanto carrega. */
  readonly history = input<FeeLogEntry[] | null>(null);
  readonly historyError = input<string | null>(null);
  readonly canEdit = input(false);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly conflict = input(false);

  readonly closed = output<void>();
  readonly save = output<FeeSaveRequest>();
  readonly reload = output<void>();

  protected readonly brl = brl;
  protected readonly ruleLabel = ruleLabel;
  protected readonly reasons = FEE_REASONS;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly abs = Math.abs;

  protected readonly t = computed(() => this.row().tournament);
  /** O que está gravado: exceção vencida volta ao padrão no rascunho (é o que a cobrança faz). */
  private readonly initial = computed(() => draftOf(this.row().expired ? null : this.row().override, this.row().base));
  protected readonly draft = linkedSignal(() => this.initial());
  protected readonly notify = signal(true);

  protected readonly modes = computed<ReadonlyArray<readonly [FeeMode, string]>>(() => [
    ['padrao', `Padrão · ${pctLabel(this.row().base.percent)}`],
    ['custom', 'Personalizada'],
    ['isento', 'Isento'],
  ]);
  protected readonly issues = computed(() => draftIssues(this.draft(), this.today()));
  protected readonly changed = computed(() => !sameDraft(this.draft(), this.initial()));
  protected readonly canSave = computed(
    () => this.canEdit() && this.changed() && Object.keys(this.issues()).length === 0 && !this.saving(),
  );
  protected readonly nextRule = computed(() => draftRule(this.draft(), this.row().base));
  protected readonly ruleChanged = computed(
    () =>
      Object.keys(this.issues()).filter((k) => k === 'percent' || k === 'floorReais').length === 0 &&
      (this.nextRule().percent !== this.row().rule.percent || this.nextRule().floorReais !== this.row().rule.floorReais),
  );

  protected readonly price = computed(() => this.t().entryFeeReais?.max ?? null);
  protected readonly priceNote = computed(() => {
    const p = this.t().entryFeeReais;
    return p && p.min !== p.max ? ` · maior categoria` : '';
  });
  protected readonly now = computed(() => feeSplit(this.price() ?? 0, this.row().rule));
  protected readonly next = computed(() => feeSplit(this.price() ?? 0, this.safeNextRule()));
  protected readonly simulated = computed(() => {
    const r = this.revenue();
    return r ? simulateOnPaid(r, this.safeNextRule()) : 0;
  });
  protected readonly simDelta = computed(() => {
    const r = this.revenue();
    return r ? Math.round((this.simulated() - simulateOnPaid(r, this.row().rule)) * 100) / 100 : 0;
  });

  protected readonly subline = computed(() => {
    const t = this.t();
    const parts = [t.startAt ? DATE.format(t.startAt) : 'sem data'];
    const p = t.entryFeeReais;
    if (p) {
      parts.push(p.min === p.max ? `inscrição ${brl(p.min)}` : `inscrição ${brl(p.min)} a ${brl(p.max)}`);
    }
    return parts.join(' · ');
  });

  protected readonly baseLabel = computed(() => {
    const b = this.row().base;
    return `${pctLabel(b.percent)} · ${SOURCE_LABEL[b.source]}`;
  });

  protected readonly padraoNote = computed(() => {
    const b = this.row().base;
    const expired = this.row().expired && this.row().override?.until
      ? ` A exceção anterior venceu em ${dayLabel(this.row().override!.until!)}.`
      : '';
    return b.source === 'organizer'
      ? `O torneio segue a comissão do cadastro do organizador (${pctLabel(b.percent)}, mínimo ${brl(b.floorReais)}).${expired}`
      : `O torneio segue a taxa padrão da plataforma e acompanha futuras mudanças nela.${expired}`;
  });

  protected readonly percentHint = computed(() => {
    const diff = Math.round((this.row().base.percent - this.draft().percent) * 100) / 100;
    if (diff === 0) {
      return 'Igual ao padrão do torneio';
    }
    return diff > 0 ? `${pctLabel(diff).replace('%', '')} p.p. abaixo do padrão` : 'Acima do padrão';
  });

  /** Campo inválido não vira número na prévia (NaN no meio da digitação). */
  private safeNextRule() {
    const k = Object.keys(this.issues());
    return k.includes('percent') || k.includes('floorReais') ? this.row().rule : this.nextRule();
  }

  /** Alteração não salva no drawer (a tela pergunta antes de sair). */
  isDirty(): boolean {
    return this.canEdit() && this.changed();
  }

  protected setMode(mode: FeeMode): void {
    this.draft.update((d) => ({ ...d, mode }));
  }

  protected patch(p: Partial<FeeDraft>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected asNumber(v: unknown): number {
    return typeof v === 'number' ? v : NaN;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected stamp(d: Date): string {
    return STAMP.format(d).replace(',', ' ·');
  }

  protected submit(): void {
    if (this.canSave()) {
      this.save.emit({ draft: this.draft(), notify: this.notify() });
    }
  }
}
