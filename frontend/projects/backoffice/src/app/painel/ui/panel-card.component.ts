import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Card base do painel (protótipo BoCard): kicker + título + ação, com conteúdo projetado. */
@Component({
  selector: 'bo-panel-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card" [class.pad-sm]="pad() === 'sm'" [class.pad-lg]="pad() === 'lg'" [class.accent]="accent()">
      @if (title() || kicker()) {
        <div class="head">
          <div class="titles">
            @if (kicker()) {
              <div class="kicker">{{ kicker() }}</div>
            }
            @if (title()) {
              <div class="title">{{ title() }}</div>
            }
          </div>
          <div class="spacer"></div>
          <ng-content select="[card-actions]" />
        </div>
      }
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      box-sizing: border-box;
    }

    .card.pad-sm {
      padding: 16px;
    }

    .card.pad-lg {
      padding: 24px;
    }

    .card.accent {
      border-color: rgba(255, 106, 26, 0.3);
      box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.06);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    .titles {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
    }

    .spacer {
      flex: 1;
    }
  `,
})
export class PanelCardComponent {
  readonly title = input('');
  readonly kicker = input('');
  readonly pad = input<'sm' | 'md' | 'lg'>('md');
  readonly accent = input(false);
}
