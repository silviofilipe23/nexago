import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { TelaoDataService } from './telao-data.service';
import { TelaoScreenComponent } from './telao-screen.component';
import { TelaoStageComponent } from './telao-stage.component';

/** Rota fullscreen `/telao/:tournamentId` — o que fica aberto na TV da arena. Fora do shell
 *  do painel (sem sidebar), atrás só do `authGuard`: staff logado também pode exibir. Provê o
 *  `TelaoDataService` da transmissão; a arte escala pra ocupar a viewport inteira. */
@Component({
  selector: 'og-telao-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TelaoDataService],
  imports: [TelaoStageComponent, TelaoScreenComponent],
  host: { class: 'og-telao-page' },
  template: `
    <og-telao-stage class="og-telao-page-stage">
      <og-telao-screen />
    </og-telao-stage>
  `,
  styles: `
    :host {
      display: block;
      width: 100vw;
      height: 100dvh;
      background: var(--nx-bg);
    }
    .og-telao-page-stage {
      width: 100%;
      height: 100%;
    }
  `,
})
export class TelaoPageComponent {
  /** Preenchido pelo router (`withComponentInputBinding`). */
  readonly tournamentId = input.required<string>();

  private readonly svc = inject(TelaoDataService);

  constructor() {
    effect(() => this.svc.tournamentId.set(this.tournamentId()));
  }
}
