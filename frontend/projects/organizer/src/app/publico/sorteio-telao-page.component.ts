import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { TelaoStageComponent } from '../painel/telao/telao-stage.component';
import { DrawClockService } from '../painel/sorteio/draw-clock.service';
import { DrawSessionStore } from '../painel/sorteio/draw-session.store';
import { SorteioTelaoScreenComponent } from '../painel/sorteio/sorteio-telao-screen.component';

/**
 * `/sorteio/:sessionId` — o telão de transmissão, PÚBLICO.
 *
 * Sem guard nenhum, de propósito: é o link que abre na TV da arena e a janela
 * que o OBS captura, e exigir login ali significaria alguém digitando senha
 * numa smart TV minutos antes de começar. A leitura é segura porque as rules
 * abrem só `drawSessions` (e o id é gerado pelo Firestore, não derivável do id
 * do torneio), e porque nenhum cliente escreve nessa coleção.
 *
 * A arte é desenhada num canvas de 1920×1080 e escalada pelo `og-telao-stage`
 * — o mesmo palco que o telão de jogos já usa.
 */
@Component({
  selector: 'og-sorteio-telao-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DrawSessionStore, DrawClockService],
  imports: [TelaoStageComponent, SorteioTelaoScreenComponent],
  template: `
    @if (store.session(); as session) {
      <og-telao-stage class="og-sorteio-page-stage">
        <og-sorteio-telao-screen [session]="session" [now]="clock.now()" />
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

  constructor() {
    effect(() => this.store.sessionId.set(this.sessionId()));
  }
}
