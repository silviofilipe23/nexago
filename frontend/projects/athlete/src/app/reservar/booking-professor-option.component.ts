import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { ProfessorLinkType } from '../professor/professor-links.model';
import { PfTypeTagComponent } from '../professor/ui/professor-ui.components';
import { bookingAsProfessorHint } from './booking-as-professor';

let nextId = 0;

/** "Reservar como professor" no pagamento da reserva — o pai só mostra quando o vínculo com a
 *  arena deixa (`bookingProfessorLink`). Começa DESLIGADO: o professor também joga, e reserva sem
 *  a chave é de atleta. Trava (`disabled`) depois que a reserva existe, como o esporte. */
@Component({
  selector: 'app-booking-professor-option',
  imports: [PfTypeTagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bpo-head">
      <span class="bpo-eyebrow">Como professor</span>
      <app-pf-type-tag [type]="type()" [small]="true" />
    </div>
    <button
      type="button"
      class="bpo-switch"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-describedby]="subId"
      [disabled]="disabled()"
      (click)="checked.set(!checked())"
    >
      <span class="bpo-copy">
        <span class="bpo-title">Reservar como professor</span>
        <span class="bpo-sub" [id]="subId">{{ hint() }}</span>
      </span>
      <span class="bpo-track" [class.bpo-track--on]="checked()" aria-hidden="true"><span class="bpo-knob"></span></span>
    </button>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .bpo-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bpo-eyebrow {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .bpo-switch {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      min-height: 56px;
      padding: 10px 14px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out), background var(--nx-d-fast) var(--nx-ease-out);
    }

    .bpo-switch[aria-checked='true'] {
      border-color: rgba(91, 155, 255, 0.45);
      background: rgba(91, 155, 255, 0.1);
    }

    .bpo-switch:disabled {
      cursor: default;
      opacity: 0.6;
    }

    .bpo-switch:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .bpo-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .bpo-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
    }

    .bpo-sub {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.4;
      color: var(--nx-text-mute);
    }

    .bpo-track {
      flex: none;
      width: 44px;
      height: 24px;
      padding: 2px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .bpo-track--on {
      background: #5b9bff;
      border-color: #5b9bff;
    }

    .bpo-knob {
      display: block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--nx-text);
      transition: transform var(--nx-d-fast) var(--nx-ease-out);
    }

    .bpo-track--on .bpo-knob {
      transform: translateX(20px);
    }

    @media (prefers-reduced-motion: reduce) {
      .bpo-switch,
      .bpo-track,
      .bpo-knob {
        transition: none;
      }
    }
  `,
})
export class BookingProfessorOptionComponent {
  readonly arenaName = input<string | null>(null);
  readonly type = input.required<ProfessorLinkType>();
  readonly disabled = input(false);
  readonly checked = model(false);

  protected readonly subId = `bpo-sub-${nextId++}`;
  protected readonly hint = computed(() => bookingAsProfessorHint(this.arenaName()));
}
