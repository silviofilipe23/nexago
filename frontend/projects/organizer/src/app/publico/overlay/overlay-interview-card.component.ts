import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BroadcastInterview } from '../../painel/data/broadcast-control';
import { initialsOf } from '../../painel/data/mock-data';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import { podiumToneOf } from './overlay-interview';

/** Card principal da entrevista: foto à esquerda, informação à direita.
 *
 *  Atleta é um círculo; dupla, dois sobrepostos; equipe, o monograma do nome (o modelo não tem
 *  logo de equipe). Ranking 1–3 troca o laranja pela cor do pódio em borda, tinta do fundo,
 *  selo, separador e chip de ranking — por variáveis, não por regra em cada peça.
 *
 *  Cores do pódio convertidas de `oklch()` pra RGB: o navegador do OBS pode ser anterior ao
 *  suporte a `oklch` e `color-mix`. */
@Component({
  selector: 'og-overlay-interview-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent],
  host: {
    '[attr.data-kind]': 'data().kind',
    '[attr.data-tone]': 'tone()',
  },
  template: `
    @let d = data();
    <div class="foto">
      @switch (d.kind) {
        @case ('dupla') {
          <span class="par">
            @for (n of d.names; track $index) {
              <span class="anel"><og-avatar [initials]="iniciais(n)" [photoUrl]="d.photos[$index] ?? null" [size]="120" /></span>
            }
          </span>
        }
        @case ('equipe') {
          <span class="monograma">{{ monograma() }}</span>
        }
        @default {
          <og-avatar [initials]="monograma()" [photoUrl]="d.photos[0] ?? null" [size]="128" />
        }
      }
    </div>
    <div class="info">
      <div class="topo">
        <span class="selo">{{ d.badge }}</span>
        @if (d.context) {
          <span class="ctx">{{ d.context }}</span>
        }
        @if (podio(); as p) {
          <span class="podio"><i aria-hidden="true"></i>{{ p }}</span>
        }
      </div>
      <div class="nome">
        @for (n of d.names; track $index) {
          @if ($index > 0) {
            <span class="sep">/</span>
          }
          <span>{{ n }}</span>
        }
      </div>
      @if (d.kind === 'atleta' && d.subtitle) {
        <div class="sub">{{ d.subtitle }}</div>
      }
      @if (d.kind === 'equipe' && d.members.length > 0) {
        <div class="elenco" [style.--cols]="colunas()">
          @for (m of d.members; track $index) {
            <span class="membro">
              <og-avatar [initials]="iniciais(m.name)" [photoUrl]="m.photoUrl" [size]="40" />
              <span class="membro-nome">{{ m.name }}</span>
            </span>
          }
        </div>
      }
      @if (d.chips.length > 0) {
        <div class="chips">
          @for (c of d.chips; track c.label) {
            <span class="chip" [class.rank]="c.label === 'Ranking'">
              <span class="rot">{{ c.label }}</span>
              <b>{{ c.value }}</b>
            </span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      --tone: #ff6a1a;
      --tone-borda: rgba(255, 106, 26, 0.28);
      --tone-tinta: transparent;
      display: flex;
      align-items: stretch;
      max-width: 1180px;
      border: 1px solid var(--tone-borda);
      border-radius: 10px;
      /* box-shadow, não drop-shadow: o host é o bloco animado, e o filtro do desfoque da entrada
         substituiria a sombra. */
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5);
      color: #f4f4f5;
    }
    :host([data-tone='ouro']) {
      --tone: rgb(244, 195, 82);
      --tone-borda: rgba(244, 195, 82, 0.55);
      --tone-tinta: rgba(244, 195, 82, 0.16);
    }
    :host([data-tone='prata']) {
      --tone: rgb(199, 210, 222);
      --tone-borda: rgba(199, 210, 222, 0.55);
      --tone-tinta: rgba(199, 210, 222, 0.16);
    }
    :host([data-tone='bronze']) {
      --tone: rgb(215, 137, 81);
      --tone-borda: rgba(215, 137, 81, 0.55);
      --tone-tinta: rgba(215, 137, 81, 0.16);
    }

    .foto {
      flex: none;
      display: grid;
      place-items: center;
      padding: 12px;
      border-radius: 9px 0 0 9px;
      background: #0e0e10;
    }
    .par {
      display: flex;
    }
    .anel {
      display: block;
      border-radius: 50%;
      box-shadow: 0 0 0 3px #0e0e10;
    }
    .anel + .anel {
      margin-left: -16px;
    }
    .monograma {
      display: grid;
      place-items: center;
      width: 128px;
      height: 128px;
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.28)), var(--tone);
      color: #120600;
      font-family: var(--nx-font-display, 'Sora', sans-serif);
      font-size: 46px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .info {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 12px;
      min-width: 560px;
      padding: 18px 34px 18px 28px;
      border-radius: 0 9px 9px 0;
      background:
        linear-gradient(var(--tone-tinta), var(--tone-tinta)),
        linear-gradient(90deg, #17171a, #0d0d0f);
      overflow: hidden;
    }

    .topo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .selo {
      flex: none;
      padding: 5px 10px;
      border-radius: 6px;
      background: var(--tone);
      color: #120600;
    }
    :host([data-kind='equipe']) .selo {
      padding: 4px 9px;
      border: 1px solid var(--tone);
      background: transparent;
      color: var(--tone);
    }
    .ctx {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      color: rgba(244, 244, 245, 0.62);
    }
    .podio {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      padding-left: 12px;
      color: var(--tone);
    }
    .podio i {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--tone);
      box-shadow: 0 0 10px 2px var(--tone);
    }

    .nome {
      font-family: var(--nx-font-display, 'Sora', sans-serif);
      font-size: 52px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.01em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    :host([data-kind='dupla']) .nome {
      font-size: 42px;
    }
    .sep {
      margin: 0 0.3em;
      color: var(--tone);
    }
    .sub {
      margin-top: -4px;
      font-family: var(--nx-font-ui, 'Inter', sans-serif);
      font-size: 20px;
      font-weight: 700;
      color: rgba(244, 244, 245, 0.62);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .elenco {
      display: grid;
      grid-template-columns: repeat(var(--cols, 3), max-content);
      gap: 8px 10px;
    }
    .membro {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 16px 4px 4px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
    }
    .membro-nome {
      max-width: 210px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-display, 'Sora', sans-serif);
      font-size: 17px;
      font-weight: 600;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
      padding: 6px 12px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .rot {
      color: rgba(244, 244, 245, 0.62);
    }
    .chip b {
      font-weight: 800;
      color: #f4f4f5;
    }
    :host([data-tone]) .chip.rank {
      border-color: var(--tone);
    }
    :host([data-tone]) .chip.rank b {
      color: var(--tone);
    }
  `,
})
export class OverlayInterviewCardComponent {
  readonly data = input.required<BroadcastInterview>();

  protected readonly tone = computed(() => podiumToneOf(this.data().rankingPos));
  protected readonly podio = computed(() => (this.tone() ? `${this.data().rankingPos}º no ranking` : null));
  /** Iniciais do 1º nome (atleta) ou da equipe — o parser garante ao menos um nome. */
  protected readonly monograma = computed(() => initialsOf(this.data().names[0] ?? this.data().name) || '?');
  /** Até 4 cabem numa linha; 5 e 6 viram duas linhas de 3. */
  protected readonly colunas = computed(() => {
    const n = this.data().members.length;
    return n <= 4 ? n : 3;
  });

  protected iniciais(name: string): string {
    return initialsOf(name) || '?';
  }
}
