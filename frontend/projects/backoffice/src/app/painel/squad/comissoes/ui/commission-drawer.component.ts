import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { TierPillComponent } from '../../niveis-regras/ui/tier-pill.component';
import type { AmbassadorOption } from '../data/commissions.repository';
import {
  ORIGIN_LABEL,
  STATUS_META,
  TIMELINE_LABEL,
  brl,
  dayMonthOfKey,
  stamp,
  statusLabel,
  type Commission,
} from '../data/commission';
import { AmbassadorAvatarComponent } from './ambassador-avatar.component';

type Mode = 'view' | 'cancel' | 'reassign';

/** Drawer de uma comissão: linha do tempo, cálculo, dados da inscrição e as ações manuais. */
@Component({
  selector: 'bo-commission-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TierPillComponent, AmbassadorAvatarComponent],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="backdrop" (click)="close()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="commission-title">
      @let c = commission();
      <header>
        <bo-ambassador-avatar [id]="c.ambassadorId" [name]="c.ambassadorName" [size]="38" />
        <div class="who">
          <h2 id="commission-title">{{ c.ambassadorName }}</h2>
          <span class="meta">
            @if (c.ambassadorTier) {
              <bo-tier-pill [tier]="c.ambassadorTier" size="sm" />
            }
            @if (c.ambassadorCode) {
              <code>{{ c.ambassadorCode }}</code>
            }
          </span>
        </div>
        <button type="button" class="x" aria-label="Fechar" (click)="close()">✕</button>
      </header>

      <section class="calc">
        <span class="status" [class]="'status ' + tone()"><i aria-hidden="true"></i>{{ label() }}</span>
        <strong [class.void]="c.status === 'canceled'">{{ brl(c.amountCents) }}</strong>
        <span class="formula">{{ brl(c.netCents) }} × {{ pct() }}% = {{ brl(c.amountCents) }}</span>
        <span class="rules">Regras {{ c.rulesVersion ? 'v' + c.rulesVersion + '.0' : '—' }} · receita líquida = {{ brl(c.grossCents) }} pagos − {{ brl(c.feeCents) }} de taxa</span>
        @if (c.hold) {
          <span class="hold">Retida no repasse de {{ day(c.hold.payoutDate) }}: {{ c.hold.reason }}</span>
        }
        @if (c.status === 'canceled' && c.cancelNote) {
          <span class="hold">Motivo: {{ c.cancelNote }}</span>
        }
      </section>

      <section>
        <h3>Linha do tempo</h3>
        <ol class="timeline">
          @for (t of c.timeline; track $index) {
            <li>
              <span class="dot" aria-hidden="true"></span>
              <div>
                <strong>{{ eventLabel(t.event) }}</strong>
                <span>{{ stamp(t.at) }}{{ t.by ? ' · ' + t.by : '' }}</span>
                @if (t.note) {
                  <span class="note">{{ t.note }}</span>
                }
              </div>
            </li>
          } @empty {
            <li class="empty">Sem eventos registrados.</li>
          }
        </ol>
      </section>

      <section>
        <h3>Inscrição</h3>
        <dl>
          <dt>Atleta</dt><dd>{{ c.convertedLabel }}</dd>
          <dt>Torneio</dt><dd>{{ c.tournamentName || '—' }}</dd>
          <dt>Categoria</dt><dd>{{ c.categoryName || '—' }}</dd>
          <dt>Origem</dt><dd>{{ originLabel[c.origin] }}</dd>
          <dt>Pagamento (Asaas)</dt>
          <dd class="copy">
            <code>{{ c.paymentId || '—' }}</code>
            @if (c.paymentId) {
              <button type="button" class="icon" [attr.aria-label]="copied() ? 'Copiado' : 'Copiar id do pagamento'" (click)="copy(c.paymentId)">
                <bo-icon [name]="copied() ? 'check' : 'copy'" [size]="13" />
              </button>
            }
          </dd>
          @if (c.payoutId) {
            <dt>Repasse</dt><dd>{{ day(c.payoutId) }} <code>{{ c.payoutId }}</code></dd>
          }
        </dl>
      </section>

      @if (canAdmin() && c.status !== 'canceled') {
        <section class="actions">
          <h3>Ações manuais</h3>
          @switch (mode()) {
            @case ('cancel') {
              <label class="field">
                <span>Motivo do cancelamento</span>
                <textarea class="bo-input" rows="3" maxlength="280" [value]="reason()" (input)="reason.set(value($event))"></textarea>
              </label>
              @if (c.status === 'paid') {
                <p class="warn">Já foi paga: vira um ajuste de −{{ brl(c.amountCents) }} no próximo repasse.</p>
              }
              <div class="row">
                <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="mode.set('view')">Voltar</button>
                <button type="button" class="bo-mini-btn danger" [disabled]="busy() || reason().trim().length < 3" (click)="cancelRequested.emit(reason().trim())">
                  Cancelar comissão
                </button>
              </div>
            }
            @case ('reassign') {
              <label class="field">
                <span>Novo embaixador</span>
                <select class="bo-select" (change)="target.set(value($event))">
                  <option value="" [selected]="!target()">Escolha…</option>
                  @for (a of others(); track a.id) {
                    <option [value]="a.id" [selected]="a.id === target()">{{ a.name }}{{ a.pct !== null ? ' · ' + a.pct + '%' : '' }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span>Motivo</span>
                <textarea class="bo-input" rows="3" maxlength="280" [value]="reason()" (input)="reason.set(value($event))"></textarea>
              </label>
              <div class="row">
                <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="mode.set('view')">Voltar</button>
                <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || !target() || reason().trim().length < 3"
                  (click)="reassign.emit({ ambassadorId: target(), reason: reason().trim() })">
                  Reatribuir
                </button>
              </div>
            }
            @default {
              <div class="row">
                <button type="button" class="bo-mini-btn danger" (click)="start('cancel')">Cancelar comissão</button>
                @if (c.status === 'pending' || c.status === 'released') {
                  <button type="button" class="bo-mini-btn" (click)="start('reassign')">Reatribuir a outro embaixador</button>
                }
              </div>
            }
          }
          @if (error(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
        </section>
      }
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.5); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(460px, 100%); display: flex; flex-direction: column; gap: 18px; padding: 22px; overflow-y: auto; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45); }
    header { display: flex; align-items: center; gap: 12px; }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 17px; }
    .meta { display: flex; align-items: center; gap: 8px; }
    code { font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text-mute); }
    .x { width: 32px; height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .x:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .calc { display: flex; flex-direction: column; gap: 5px; padding: 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .calc strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; }
    .void { color: var(--nx-text-dim); text-decoration: line-through; }
    .formula { font-family: var(--nx-font-mono); font-size: 12.5px; color: var(--nx-text); }
    .rules, .hold { font-size: 12px; color: var(--nx-text-dim); }
    .hold { color: var(--nx-pending); }
    .status { display: flex; align-items: center; gap: 7px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; }
    .status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .yellow { color: var(--nx-pending); }
    .green { color: var(--nx-win); }
    .red { color: var(--nx-live); }
    .dim { color: var(--nx-text-mute); }
    h3 { margin: 0 0 10px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .timeline { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
    .timeline li { position: relative; display: flex; gap: 12px; padding: 0 0 14px; }
    .timeline li:not(:last-child)::before { content: ''; position: absolute; left: 4px; top: 12px; bottom: 0; width: 1px; background: var(--nx-line-strong); }
    .dot { width: 9px; height: 9px; flex: none; margin-top: 4px; border-radius: 50%; background: var(--nx-orange-500); }
    .timeline div { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--nx-text-dim); }
    .timeline strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .note { color: var(--nx-text-mute); }
    .empty { font-size: 12.5px; color: var(--nx-text-dim); }
    dl { margin: 0; display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px 12px; font-size: 13px; }
    dt { color: var(--nx-text-dim); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .copy { display: flex; align-items: center; gap: 6px; }
    .icon { width: 26px; height: 26px; flex: none; display: grid; place-items: center; border: 1px solid var(--nx-line); border-radius: 7px; background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .actions { padding-top: 16px; border-top: 1px solid var(--nx-line); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; font-size: 12px; color: var(--nx-text-mute); }
    textarea.bo-input { height: auto; padding: 10px 12px; resize: vertical; }
    .bo-mini-btn.danger { color: var(--nx-live); border-color: rgba(255, 59, 48, 0.35); }
    .warn { margin: 0 0 10px; font-size: 12px; color: var(--nx-pending); }
    .error { margin: 10px 0 0; font-size: 12.5px; color: var(--nx-live); }
  `,
})
export class CommissionDrawerComponent {
  readonly commission = input.required<Commission>();
  readonly ambassadors = input<AmbassadorOption[]>([]);
  readonly canAdmin = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly closed = output<void>();
  readonly cancelRequested = output<string>();
  readonly reassign = output<{ ambassadorId: string; reason: string }>();
  /** Pede a lista de contratos ao abrir "Reatribuir" (carrega só quando precisa). */
  readonly needAmbassadors = output<void>();

  protected readonly mode = signal<Mode>('view');
  protected readonly reason = signal('');
  protected readonly target = signal('');
  protected readonly copied = signal(false);

  protected readonly originLabel = ORIGIN_LABEL;
  protected readonly brl = brl;
  protected readonly stamp = stamp;
  protected readonly day = dayMonthOfKey;
  protected readonly label = computed(() => statusLabel(this.commission()));
  protected readonly tone = computed(() => STATUS_META[this.commission().status].tone);
  protected readonly pct = computed(() => this.commission().pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  protected readonly others = computed(() => this.ambassadors().filter((a) => a.id !== this.commission().ambassadorId));

  protected eventLabel(event: string): string {
    return TIMELINE_LABEL[event] ?? event;
  }

  protected start(mode: Exclude<Mode, 'view'>): void {
    this.reason.set('');
    this.target.set('');
    this.mode.set(mode);
    if (mode === 'reassign') this.needAmbassadors.emit();
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Sem permissão de área de transferência: o id segue visível para copiar à mão.
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
