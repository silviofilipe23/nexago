import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FocusAutoOpenService } from './focus-auto-open.service';

/** Card do Perfil: entrar sozinho no Modo Focus no dia do torneio. */
@Component({
  selector: 'app-focus-auto-open-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="at-card">
      <div class="at-card-head">
        <span class="at-card-title">Modo Focus</span>
      </div>
      <div class="focus-auto-open">
        <div class="focus-auto-open__copy">
          <strong id="focus-auto-open-label">Abrir o Modo Focus sozinho</strong>
          <p>No dia do torneio, o portal já abre no Focus. Desligado, você entra pelo "Entrar no Focus" do painel.</p>
        </div>
        <button
          type="button"
          role="switch"
          class="focus-auto-open__switch"
          data-testid="focus-auto-open-switch"
          aria-labelledby="focus-auto-open-label"
          [attr.aria-checked]="pref.enabled()"
          (click)="pref.set(!pref.enabled())"
        >
          <span class="focus-auto-open__thumb"></span>
        </button>
      </div>
    </section>
  `,
  styles: `
    .focus-auto-open {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0 0;
    }
    .focus-auto-open__copy {
      flex: 1;
      min-width: 0;
    }
    .focus-auto-open__copy strong {
      display: block;
      font-family: var(--nx-font-display);
      font-size: 13px;
      color: var(--nx-text);
      margin-bottom: 2px;
    }
    .focus-auto-open__copy p {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .focus-auto-open__switch {
      position: relative;
      flex: none;
      width: 48px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--nx-line);
      border-radius: 999px;
      background: var(--nx-surface-2);
      cursor: pointer;
      transition: background-color 160ms ease, border-color 160ms ease;
    }
    .focus-auto-open__switch:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .focus-auto-open__switch[aria-checked='true'] {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }
    .focus-auto-open__thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      transition: transform 160ms ease;
    }
    .focus-auto-open__switch[aria-checked='true'] .focus-auto-open__thumb {
      transform: translateX(20px);
    }
    @media (prefers-reduced-motion: reduce) {
      .focus-auto-open__switch,
      .focus-auto-open__thumb {
        transition: none;
      }
    }
  `,
})
export class FocusAutoOpenToggleComponent {
  protected readonly pref = inject(FocusAutoOpenService);
}
