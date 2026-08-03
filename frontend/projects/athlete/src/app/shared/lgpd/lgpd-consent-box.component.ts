import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { LGPD_CHECKBOX_LABEL, LGPD_TERM_PARAGRAPHS, LGPD_TERM_TITLE } from './lgpd-term';

/** Checkbox inline do termo LGPD/uso de imagem — gate dos CTAs de inscrição.
 *  O aceite marcado aqui vira `lgpdAccepted: true` no payload das callables. */
@Component({
  selector: 'app-lgpd-consent-box',
  template: `
    <div class="lgpd-box">
      <label class="lgpd-check">
        <input
          type="checkbox"
          [checked]="accepted()"
          [disabled]="disabled()"
          (change)="accepted.set($any($event.target).checked)"
        />
        <span class="lgpd-label">
          {{ label }}
          <button type="button" class="lgpd-link" (click)="showTerm.set(!showTerm())">
            {{ showTerm() ? 'Ocultar termo' : 'Ler termo completo' }}
          </button>
        </span>
      </label>

      @if (showTerm()) {
        <div class="lgpd-term">
          <h3>{{ title }}</h3>
          @for (paragraph of paragraphs; track $index) {
            <p>{{ paragraph }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .lgpd-box {
      margin: 4px 0 12px;
      padding: 12px 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
    }

    .lgpd-check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
    }

    .lgpd-check input {
      flex: none;
      width: 16px;
      height: 16px;
      margin-top: 2px;
      accent-color: var(--nx-orange-500);
      cursor: pointer;
    }

    .lgpd-label {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 19.5px;
      color: var(--nx-text-mute);
    }

    .lgpd-link {
      padding: 0;
      background: none;
      border: none;
      font: inherit;
      font-weight: 600;
      color: var(--nx-orange-500);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .lgpd-term {
      margin-top: 12px;
      padding: 12px 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      max-height: 220px;
      overflow-y: auto;
    }

    .lgpd-term h3 {
      margin: 0 0 8px;
      font-family: var(--nx-font-display);
      font-size: 13px;
      font-weight: 700;
      color: var(--nx-text);
    }

    .lgpd-term p {
      margin: 0 0 8px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 19px;
      color: var(--nx-text-mute);
    }

    .lgpd-term p:last-child {
      margin-bottom: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LgpdConsentBoxComponent {
  readonly accepted = model(false);
  readonly disabled = input(false);

  protected readonly showTerm = signal(false);
  protected readonly label = LGPD_CHECKBOX_LABEL;
  protected readonly title = LGPD_TERM_TITLE;
  protected readonly paragraphs = LGPD_TERM_PARAGRAPHS;
}
