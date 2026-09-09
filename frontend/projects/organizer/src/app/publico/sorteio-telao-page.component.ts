import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  input,
} from '@angular/core';
import { TelaoStageComponent } from '../painel/telao/telao-stage.component';
import { DrawClockService } from '../painel/sorteio/draw-clock.service';
import { DrawSessionStore } from '../painel/sorteio/draw-session.store';
import { SorteioTelaoScreenComponent } from '../painel/sorteio/sorteio-telao-screen.component';
import { drawCanvasFor, isPortraitViewport } from '../painel/sorteio/draw-canvas-orientation';

/**
 * `/sorteio/:sessionId` — o telão de transmissão, PÚBLICO.
 *
 * Sem guard nenhum, de propósito: é o link que abre na TV da arena, a janela
 * que o OBS captura — e o link que o atleta abre no celular. A leitura é segura
 * porque as rules abrem só `drawSessions` (e o id é gerado pelo Firestore, não
 * derivável do id do torneio), e porque nenhum cliente escreve nessa coleção.
 *
 * O canvas vira EM PÉ quando a tela é estreita e mais alta que larga. Num
 * iPhone em pé o canvas 16:9 escalaria pra 375×211, com o texto de 25px virando
 * 5px no meio de uma tela preta — o link é público justamente pra ser aberto
 * daquele jeito.
 */
@Component({
  selector: 'og-sorteio-telao-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DrawSessionStore, DrawClockService],
  imports: [TelaoStageComponent, SorteioTelaoScreenComponent],
  template: `
    @if (store.session(); as session) {
      <og-telao-stage
        class="og-sorteio-page-stage"
        [canvasWidth]="canvas().width"
        [canvasHeight]="canvas().height"
      >
        <og-sorteio-telao-screen
          [session]="session"
          [now]="clock.now()"
          [portrait]="portrait()"
        />
      </og-telao-stage>
    } @else {
      <div class="og-sorteio-vazio">
        @if (store.loading()) {
          <p>Carregando o sorteio…</p>
        } @else if (store.notFound()) {
          <p class="og-sorteio-vazio-titulo">Sorteio não encontrado</p>
          <p>Confira o link com a organização do torneio.</p>
        } @else {
          <p class="og-sorteio-vazio-titulo">Não foi possível carregar</p>
          <p>Verifique a conexão. A tela volta sozinha assim que a rede voltar.</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100vw;
      /* dvh e NÃO vh: no celular a barra do navegador entra e sai, e vh congela
         na altura maior — o telão ficaria cortado embaixo. */
      height: 100dvh;
      background: var(--nx-bg);
    }
    .og-sorteio-page-stage {
      width: 100%;
      height: 100%;
    }
    .og-sorteio-vazio {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 100%;
      padding: 24px;
      text-align: center;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-ui);
      font-size: 16px;
    }
    .og-sorteio-vazio-titulo {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 24px;
      color: var(--nx-text);
      margin: 0;
    }
    .og-sorteio-vazio p {
      margin: 0;
    }
  `,
})
export class SorteioTelaoPageComponent {
  /** Preenchido pelo router (`withComponentInputBinding`). */
  readonly sessionId = input.required<string>();

  protected readonly store = inject(DrawSessionStore);
  protected readonly clock = inject(DrawClockService);

  private readonly viewport = signal({ width: 0, height: 0 });

  protected readonly portrait = computed(() => {
    const { width, height } = this.viewport();
    return isPortraitViewport(width, height);
  });

  protected readonly canvas = computed(() => drawCanvasFor(this.portrait()));

  constructor() {
    effect(() => this.store.sessionId.set(this.sessionId()));

    const measure = () =>
      this.viewport.set({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('orientationchange', measure);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    });
  }
}
