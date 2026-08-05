import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PillComponent, type PillTone } from './pill.component';

/** Card numerado de etapa (protótipo BoStepCard): usado nos fluxos de atribuição de role. */
@Component({
  selector: 'bo-step-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PillComponent],
  template: `
    <section class="card" [class.muted]="muted()">
      <header class="head">
        <div class="badge" aria-hidden="true">{{ step() }}</div>
        <div class="titles">
          <h2 class="title">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="subtitle">{{ subtitle() }}</p>
          }
        </div>
        @if (badge() && !muted()) {
          <bo-pill [tone]="badgeTone()">{{ badge() }}</bo-pill>
        }
      </header>
      @if (!muted()) {
        <div class="body">
          <ng-content />
        </div>
      }
    </section>
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
      min-width: 0;
    }

    .card.muted {
      opacity: 0.45;
    }

    .head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .badge {
      width: 28px;
      height: 28px;
      flex: none;
      border-radius: 9px;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-orange-500);
    }

    .titles {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
      margin: 0;
    }

    .subtitle {
      font-size: 12px;
      line-height: 1.25;
      color: var(--nx-text-dim);
      margin: 0;
    }

    .body {
      margin-top: 16px;
    }
  `,
})
export class StepCardComponent {
  readonly step = input.required<number>();
  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** Etapa ainda não liberada: só o cabeçalho, esmaecido. */
  readonly muted = input(false);
  /** Pill de status à direita do título (ex.: "2 de 4"). */
  readonly badge = input('');
  readonly badgeTone = input<PillTone>('dim');
}
