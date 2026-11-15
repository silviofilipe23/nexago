import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Moldura de celular desenhada em CSS para mostrar telas do app montadas em HTML (nítidas em
 * qualquer tamanho e animáveis, ao contrário de um print). A largura vem de `--phone-w`; a tela é
 * um contêiner de consulta, então quem desenha dentro usa `cqw` e tudo escala junto com o aparelho.
 * Sempre noturna (`nx-night`): o app é escuro por padrão.
 */
@Component({
  selector: 'app-phone-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nx-night' },
  template: `
    <div class="screen"><ng-content /></div>
    <span class="island" aria-hidden="true"></span>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      width: var(--phone-w, 280px);
      aspect-ratio: 9 / 19.4;
      padding: calc(var(--phone-w, 280px) * 0.03);
      border-radius: calc(var(--phone-w, 280px) * 0.165);
      background: linear-gradient(150deg, #34343a 0%, #0d0d0f 38%, #1d1d21 100%);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.14) inset,
        0 0 0 1px rgba(0, 0, 0, 0.7),
        0 50px 90px -30px rgba(0, 0, 0, 0.85);
    }

    .screen {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: calc(var(--phone-w, 280px) * 0.137);
      background: var(--color-bg);
      container-type: inline-size;
    }

    .island {
      position: absolute;
      top: calc(var(--phone-w, 280px) * 0.062);
      left: 50%;
      width: 29%;
      height: calc(var(--phone-w, 280px) * 0.078);
      border-radius: 999px;
      background: #000;
      transform: translateX(-50%);
    }
  `,
})
export class PhoneFrame {}
