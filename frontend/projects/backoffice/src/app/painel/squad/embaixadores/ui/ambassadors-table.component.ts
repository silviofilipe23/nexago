import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../ui/icon.component';
import { AmbassadorAvatarComponent } from '../../comissoes/ui/ambassador-avatar.component';
import { brl, dayMonthOfKey } from '../../comissoes/data/commission';
import { TierPillComponent } from '../../niveis-regras/ui/tier-pill.component';
import { TIER_LABELS } from '../../niveis-regras/data/squad-rules';
import { roiTone, scoreTone } from '../../data/squad-program';
import { roiLabel, statusLabel, type AmbassadorRow } from '../data/ambassador';

export type RowAction = 'copy' | 'changeTier' | 'pause' | 'resume' | 'end';

export const STATUS_TONE: Record<string, string> = {
  active: 'green',
  active_start: 'green',
  eligible: 'orange',
  below_goal: 'yellow',
  at_risk: 'red',
  paused: 'neutral',
  ended: 'neutral',
};

/** Tabela de embaixadores. Clique na linha (ou no nome) abre a tela 03 · Perfil. */
@Component({
  selector: 'bo-ambassadors-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, AmbassadorAvatarComponent, TierPillComponent, RouterLink],
  host: { '(document:click)': 'menuFor.set(null)', '(document:keydown.escape)': 'menuFor.set(null)' },
  template: `
    <div class="table" role="table" aria-label="Embaixadores">
      <div class="row head" role="row">
        <span role="columnheader">Embaixador</span>
        <span role="columnheader">Nível</span>
        <span role="columnheader">Código</span>
        <span role="columnheader" class="num">Conv.</span>
        <span role="columnheader" class="num">Receita</span>
        <span role="columnheader" class="num" title="Comissões + kit. Inscrições gratuitas, cachês e bônus ainda sem fonte.">Custo</span>
        <span role="columnheader" class="num">ROI</span>
        <span role="columnheader">Score</span>
        <span role="columnheader">Status</span>
        <span role="columnheader"><span class="sr">Ações</span></span>
      </div>
      @for (r of rows(); track r.contract.uid) {
        @let c = r.contract;
        <div class="row" role="row" [class.dim-row]="c.state === 'ended'" (click)="open(c.uid)">
          <span role="cell" class="amb">
            <bo-ambassador-avatar [id]="c.uid" [name]="c.name" [size]="38" />
            <span class="who">
              <a class="name" [routerLink]="profileRoute(c.uid)" (click)="$event.stopPropagation()">{{ c.name }}</a>
              <span>{{ place(r) }}</span>
            </span>
          </span>
          <span role="cell" class="tier">
            <bo-tier-pill [tier]="c.tier" size="sm" />
            @if (c.pendingTier) {
              <span class="hint" [title]="'Aditivo enviado: aguardando o aceite do atleta no app'">→ {{ tierLabels[c.pendingTier] }} · aceite pendente</span>
            }
          </span>
          <span role="cell" class="mono">{{ c.code || '—' }}</span>
          <span role="cell" class="num mono">{{ r.conversions }}</span>
          <span role="cell" class="num mono">{{ money(r.revenueCents) }}</span>
          <span role="cell" class="num mono">{{ money(r.costCents) }}</span>
          <span role="cell" class="num mono roi" [class]="'num mono roi ' + roiTone(r.roi)">{{ roi(r.roi) }}</span>
          <span role="cell" class="score" [class]="'score ' + scoreTone(c.score)" [attr.title]="recalculating() && c.score !== null ? 'Atualizando' : null">
            @if (c.score === null) {
              <span class="mono none" title="Score diário ainda não calculado">—</span>
            } @else {
              <span class="mono">{{ c.score }}</span>
              <span class="bar" aria-hidden="true"><i [style.width.%]="c.score"></i></span>
            }
          </span>
          <span role="cell" class="status-cell">
            <span class="status" [class]="'status ' + tone(r)">{{ label(r) }}</span>
            @if (c.endsAt && c.state !== 'ended') {
              <span class="hint">encerra {{ day(c.endsAt) }}</span>
            } @else if (c.state === 'paused' && c.pausedUntil) {
              <span class="hint">volta {{ day(c.pausedUntil) }}</span>
            }
          </span>
          <span role="cell" class="more-cell" (click)="$event.stopPropagation()">
            <button type="button" class="more" [attr.aria-label]="'Ações de ' + c.name" aria-haspopup="true"
              [attr.aria-expanded]="menuFor() === c.uid" (click)="toggle(c.uid)">
              <bo-icon name="more" [size]="16" />
            </button>
            @if (menuFor() === c.uid) {
              <div class="menu" role="menu">
                <a role="menuitem" [routerLink]="profileRoute(c.uid)">Ver perfil</a>
                <button type="button" role="menuitem" [disabled]="!c.code" (click)="act('copy', r)">Copiar código</button>
                @if (canEdit() && c.state !== 'ended') {
                  <button type="button" role="menuitem" (click)="act('changeTier', r)">Mudar nível</button>
                  @if (c.state === 'paused') {
                    <button type="button" role="menuitem" (click)="act('resume', r)">Retomar</button>
                  } @else {
                    <button type="button" role="menuitem" (click)="act('pause', r)">Pausar</button>
                  }
                  <button type="button" role="menuitem" class="danger" (click)="act('end', r)">Encerrar</button>
                }
              </div>
            }
          </span>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .table { border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); overflow-x: auto; position: relative; }
    .row { display: grid; grid-template-columns: minmax(220px, 1.6fr) minmax(150px, 1fr) 110px 56px 100px 96px 64px 140px minmax(150px, 1fr) 40px; gap: 12px; align-items: center; min-width: 1180px; min-height: 80px; padding: 0 16px 0 24px; border-top: 1px solid var(--nx-line); font-size: 13.5px; }
    .row:hover { background: rgba(255, 255, 255, 0.025); }
    .row.head { min-height: 54px; border-top: none; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .row.head:hover { background: none; }
    .dim-row { opacity: 0.6; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .amb { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .row:not(.head) { cursor: pointer; }
    .who .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who .name:hover { color: var(--nx-orange-500); }
    .who span { font-size: 12.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tier { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .hint { font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; }
    .num { text-align: right; }
    .mono { font-family: var(--nx-font-mono); font-weight: 500; font-size: 13px; }
    .roi { font-weight: 700; }
    .roi.green { color: var(--nx-win); }
    .roi.red { color: var(--nx-live); }
    .roi.none { color: var(--nx-text-dim); }
    .score { display: flex; align-items: center; gap: 10px; }
    .score .mono { width: 22px; font-weight: 700; }
    .score .none { color: var(--nx-text-dim); font-weight: 500; }
    .bar { flex: 1; height: 4px; border-radius: 2px; background: var(--nx-surface-2); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 2px; background: var(--nx-orange-500); }
    .score.warm .bar i { background: #b5562a; }
    .score.red .bar i { background: var(--nx-live); }
    .status-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .status { display: inline-flex; align-items: center; height: 26px; padding: 0 11px; border-radius: var(--nx-r-pill); border: 1px solid currentColor; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; }
    .status.green { color: var(--nx-win); background: rgba(43, 209, 126, 0.08); border-color: rgba(43, 209, 126, 0.35); }
    .status.orange { color: var(--nx-orange-500); background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); }
    .status.yellow { color: var(--nx-pending); background: rgba(244, 197, 67, 0.08); border-color: rgba(244, 197, 67, 0.4); }
    .status.red { color: var(--nx-live); background: rgba(255, 59, 48, 0.08); border-color: rgba(255, 59, 48, 0.4); }
    .status.neutral { color: var(--nx-text-mute); border-color: var(--nx-line-strong); }
    .more-cell { position: relative; display: flex; justify-content: flex-end; }
    .more { width: 32px; height: 32px; display: grid; place-items: center; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; opacity: 0; }
    .row:hover .more, .more:focus-visible, .more[aria-expanded='true'] { opacity: 1; }
    .more:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .menu { position: absolute; z-index: 20; top: calc(100% + 4px); right: 0; min-width: 190px; padding: 6px; display: flex; flex-direction: column; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-3); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .menu button, .menu a { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 10px; border: none; border-radius: var(--nx-r-2); background: none; color: var(--nx-text); font-size: 13px; text-align: left; cursor: pointer; }
    .menu a { text-decoration: none; }
    .menu button:hover:not(:disabled), .menu a:hover { background: var(--nx-surface-2); }
    .menu button:disabled { color: var(--nx-text-dim); cursor: default; }
    .menu .danger { color: var(--nx-live); }
    @media (hover: none) { .more { opacity: 1; } }
  `,
})
export class AmbassadorsTableComponent {
  readonly rows = input.required<AmbassadorRow[]>();
  readonly canEdit = input(false);
  readonly recalculating = input(false);
  readonly action = output<{ kind: RowAction; row: AmbassadorRow }>();

  private readonly router = inject(Router);
  protected readonly menuFor = signal<string | null>(null);
  protected readonly tierLabels = TIER_LABELS;
  protected readonly roiTone = roiTone;
  protected readonly scoreTone = scoreTone;

  protected place(r: AmbassadorRow): string {
    return [r.contract.city, r.contract.arenaName].filter(Boolean).join(' · ') || '—';
  }

  protected money(cents: number): string {
    return brl(cents, false);
  }

  protected roi(v: number | null): string {
    return roiLabel(v);
  }

  protected label(r: AmbassadorRow): string {
    return statusLabel(r.status);
  }

  protected tone(r: AmbassadorRow): string {
    return STATUS_TONE[r.status];
  }

  protected day(key: string): string {
    return dayMonthOfKey(key);
  }

  protected profileRoute(uid: string): string {
    return `/painel/squad/embaixadores/${uid}`;
  }

  protected open(uid: string): void {
    void this.router.navigateByUrl(this.profileRoute(uid));
  }

  protected toggle(uid: string): void {
    this.menuFor.update((m) => (m === uid ? null : uid));
  }

  protected act(kind: RowAction, row: AmbassadorRow): void {
    this.menuFor.set(null);
    this.action.emit({ kind, row });
  }
}
