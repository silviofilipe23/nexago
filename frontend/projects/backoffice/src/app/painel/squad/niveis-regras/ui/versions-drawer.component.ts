import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import type { RulesVersion } from '../data/squad-rules.repository';
import { versionLabel } from '../data/squad-rules';

function stamp(date: Date | null): string {
  if (!date) {
    return '';
  }
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}

/** Histórico de versões: quem salvou, quando, o que mudou — e "Restaurar" para o rascunho. */
@Component({
  selector: 'bo-versions-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="versions-title">
      <header>
        <h2 id="versions-title">Histórico de versões</h2>
        <button type="button" class="close" aria-label="Fechar histórico" (click)="closed.emit()">✕</button>
      </header>
      <p class="intro">Restaurar carrega a versão no rascunho; ao salvar, ela vira a v{{ current() + 1 }}.0.</p>

      @if (error(); as e) {
        <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
      } @else if (versions() === null) {
        @for (s of [0, 1, 2]; track s) {
          <div class="skeleton"></div>
        }
      } @else {
        <ol class="list">
          @for (v of versions(); track v.version) {
            <li class="item" [class.current]="v.version === current()">
              <div class="top">
                <strong class="ver">{{ label(v.version) }}</strong>
                @if (v.version === current()) {
                  <bo-pill tone="orange">Vigente</bo-pill>
                }
                @if (v.affectsContracts) {
                  <bo-pill tone="dim">Contratos novos</bo-pill>
                }
                <span class="spacer"></span>
                @if (v.version !== current() && canRestore()) {
                  <button type="button" class="bo-mini-btn" (click)="restore.emit(v)">Restaurar</button>
                }
              </div>
              <div class="meta">{{ v.createdBy ?? 'Padrão do programa' }}{{ v.createdAt ? ' · ' + stamp(v.createdAt) : '' }}</div>
              @if (v.changes.length > 0) {
                <div class="changes">{{ v.changes.join(' · ') }}</div>
              }
              @if (v.restoredFrom !== null) {
                <div class="note">Restaurada da {{ label(v.restoredFrom) }}</div>
              }
              @if (v.note) {
                <div class="note">{{ v.note }}</div>
              }
            </li>
          }
        </ol>
      }
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.5); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(420px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 22px; overflow-y: auto; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45); }
    header { display: flex; align-items: center; gap: 10px; }
    h2 { flex: 1; margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; }
    .close { width: 32px; height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .close:hover { background: var(--nx-surface-1); color: var(--nx-text); }
    .intro { margin: 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .item { padding: 12px 14px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 5px; }
    .item.current { border-color: rgba(255, 106, 26, 0.35); background: rgba(255, 106, 26, 0.04); }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ver { font-family: var(--nx-font-mono); font-size: 13px; }
    .spacer { flex: 1; }
    .meta { font-size: 12px; color: var(--nx-text-mute); }
    .changes { font-size: 12.5px; color: var(--nx-text); }
    .note { font-size: 12px; color: var(--nx-text-dim); }
    .skeleton { height: 78px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); }
  `,
})
export class VersionsDrawerComponent {
  /** `null` enquanto carrega. */
  readonly versions = input<RulesVersion[] | null>(null);
  readonly error = input<string | null>(null);
  readonly current = input.required<number>();
  readonly canRestore = input(true);

  readonly restore = output<RulesVersion>();
  readonly closed = output<void>();

  protected readonly label = versionLabel;
  protected readonly stamp = stamp;
}
