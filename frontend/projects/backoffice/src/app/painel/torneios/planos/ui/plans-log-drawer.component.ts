import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import type { LogEntry } from '../data/tournament-plans.repository';
import { dayLabel } from '../data/tournament-plans';

function stamp(date: Date | null): string {
  if (!date) {
    return '';
  }
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}

const SCOPE_TITLE: Record<LogEntry['scope'], string> = {
  plan: '',
  rules: 'Estrutura financeira',
  sponsors: 'Sponsors',
};

/** Linha do tempo das publicações (planos, estrutura financeira ou Sponsors). */
@Component({
  selector: 'bo-plans-log-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="plans-log-title">
      <header>
        <h2 id="plans-log-title">Histórico</h2>
        <button type="button" class="close" aria-label="Fechar histórico" (click)="closed.emit()">✕</button>
      </header>
      <p class="intro">{{ intro() }}</p>

      @if (error(); as e) {
        <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
      } @else if (entries() === null) {
        @for (s of [0, 1, 2]; track s) {
          <div class="skeleton"></div>
        }
      } @else if (entries()!.length === 0) {
        <p class="empty">Nada publicado ainda. Os valores vigentes são o padrão (v1).</p>
      } @else {
        <ol class="list">
          @for (e of entries(); track e.id) {
            <li class="item">
              <div class="top">
                <strong>{{ e.planName ?? title(e) }}</strong>
                <span class="ver">v{{ e.version }}</span>
                @if (e.effectiveFrom) {
                  <bo-pill tone="orange">A partir de {{ day(e.effectiveFrom) }}</bo-pill>
                }
              </div>
              <div class="meta">{{ e.createdBy ?? '—' }}{{ e.createdAt ? ' · ' + stamp(e.createdAt) : '' }}</div>
              @if (e.changes.length > 0) {
                <div class="changes">{{ e.changes.join(' · ') }}</div>
              }
            </li>
          }
        </ol>
      }
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.5); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(420px, 100%); box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 22px; overflow-y: auto; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45); }
    header { display: flex; align-items: center; gap: 10px; }
    h2 { flex: 1; margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; }
    .close { width: 32px; height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .close:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .intro, .empty { margin: 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .item { padding: 12px 14px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 5px; }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-family: var(--nx-font-display); font-size: 13px; }
    .ver { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .meta { font-size: 12px; color: var(--nx-text-mute); }
    .changes { font-size: 12.5px; color: var(--nx-text); }
    .skeleton { height: 78px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); }
  `,
})
export class PlansLogDrawerComponent {
  /** `null` enquanto carrega. */
  readonly entries = input<LogEntry[] | null>(null);
  readonly error = input<string | null>(null);
  readonly intro = input('');

  readonly closed = output<void>();

  protected readonly stamp = stamp;
  protected readonly day = dayLabel;
  protected title(e: LogEntry): string {
    return SCOPE_TITLE[e.scope] || 'Plano';
  }
}
