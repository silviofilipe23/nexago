import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import { LedFitTextDirective } from './led-fit-text.directive';
import { ledIniciaisDe } from './led-iniciais';
import type { LedProximos } from './led-proximos';
import type { LedPlayer, LedTeam } from './led-round.component';

/** Tela "Próximos em quadra" do painel de LED (1920×1080).
 *
 *  Duas faixas de mesma altura: o TRONO em laranja na largura toda, e os cards da fila (2 a 4
 *  colunas) embaixo. No início de rodada a tela é "Entrada na quadra" — todo mundo com 0 ponto
 *  e rótulos de ENTRADA; durante a rodada vira "Próximos em quadra", com a sequência do rei.
 *
 *  Troca de rei com a tela aberta refaz o corpo com outra animação (o trono sobe, os cards
 *  entram pela direita) — o painel mostra que algo mudou em vez de só trocar o texto. */
@Component({
  selector: 'og-led-proximos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, LedFitTextDirective],
  template: `
    @if (proximos(); as px) {
      <div class="tela" [class.troca]="trocou()">
        <header class="topo">
          <div class="topo-textos">
            <h1 class="titulo">{{ px.inicio ? 'Entrada na quadra' : 'Próximos em quadra' }}</h1>
            <div class="contexto">{{ contexto() }}</div>
          </div>
          @if (px.inicio && rodada()) {
            <div class="inicio" [attr.aria-label]="'Início da ' + rodada()">
              <span class="inicio-de">Início da</span>
              <span class="inicio-rodada">{{ rodada() }}</span>
            </div>
          }
        </header>

        @for (k of [px.trono.teamId]; track k) {
          <div class="corpo">
            <section class="pxh tr">
              <span class="avatares avatares--tr">
                @for (p of atletasDe(px.trono.teamId); track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="200" />
                }
              </span>
              <div class="tr-corpo">
                <span class="rotulo rotulo--tr">{{ px.trono.rotulo }}</span>
                <div class="nomes nomes--tr">
                  @for (p of atletasDe(px.trono.teamId); track $index) {
                    <span [ledFitText]="p.name">{{ p.name }}</span>
                  }
                </div>
              </div>
              <span class="numero numero--tr">{{ px.trono.numero }}</span>
            </section>

            <div class="fila" [style.--cols]="colunas()">
              @for (row of fila(); track row.teamId; let i = $index) {
                <article class="pxc" [class.pxc--desafia]="row.papel === 'desafia'" [style.--i]="i">
                  <div class="pxc-topo">
                    <span class="avatares">
                      @for (p of atletasDe(row.teamId); track $index) {
                        <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="84" />
                      }
                    </span>
                    <span class="numero">{{ row.posicao }}</span>
                  </div>
                  <div class="pxc-corpo">
                    <span class="rotulo" [ledFitText]="row.rotulo">{{ row.rotulo }}</span>
                    <div class="nomes">
                      @for (p of atletasDe(row.teamId); track $index) {
                        <span [ledFitText]="p.name">{{ p.name }}</span>
                      }
                    </div>
                  </div>
                </article>
              }
            </div>
          </div>
        }

        <footer class="assinatura">NEXAGO · KOTC</footer>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
      color: #fff;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
    }

    .tela {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 28px;
      height: 100%;
      padding: 40px 48px 28px;
      box-sizing: border-box;
    }

    /* ── Cabeçalho ── */
    .topo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
    }
    .topo-textos {
      min-width: 0;
    }
    .titulo {
      margin: 0;
      font-size: 64px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.01em;
    }
    .contexto {
      margin-top: 12px;
      color: #9a9a9e;
      font-size: 30px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .inicio {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-size: 56px;
      font-weight: 800;
      line-height: 1;
      text-transform: uppercase;
      animation: px-fade 0.5s ease-out 0.3s both;
    }
    .inicio-de {
      color: #6f6f76;
    }
    .inicio-rodada {
      color: var(--nx-orange-500, #ff6a1a);
    }

    /* ── Corpo: duas faixas de mesma altura ── */
    .corpo {
      display: grid;
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
      gap: 28px;
      min-height: 0;
    }

    .pxh.tr {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 40px;
      min-height: 0;
      padding: 0 48px;
      border-radius: 24px;
      background: var(--nx-orange-500, #ff6a1a);
      color: #000;
      animation:
        px-tr-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) 250ms both,
        px-pisca 0.6s ease-in-out 800ms;
    }
    .tr-corpo {
      min-width: 0;
    }

    .fila {
      display: grid;
      grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
      gap: 24px;
      min-height: 0;
    }
    .pxc {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      align-content: space-between;
      gap: 16px;
      min-width: 0;
      min-height: 0;
      padding: 24px 28px 26px;
      box-sizing: border-box;
      border: 4px solid transparent;
      border-radius: 22px;
      background: #1c1c20;
      animation: px-card-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-delay: calc(480ms + var(--i, 0) * 110ms);
    }
    /* O desafiante já está em quadra: moldura branca, visível do fundo do ginásio. */
    .pxc--desafia {
      border-color: #fff;
    }
    .pxc-topo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .pxc-corpo {
      align-self: end;
      min-width: 0;
    }

    /* ── Avatares ── */
    .avatares {
      display: flex;
      flex: none;
    }
    .avatares og-avatar {
      border-radius: 50%;
      overflow: hidden;
      box-sizing: border-box;
      background: #0b0b0c;
      border: 3px solid #3a3a40;
      color: #cfcfd4;
      font-weight: 800;
    }
    .avatares og-avatar + og-avatar {
      margin-left: -22px;
    }
    .avatares--tr og-avatar {
      border: 4px solid #000;
      background: #000;
      color: var(--nx-orange-500, #ff6a1a);
    }
    .avatares--tr og-avatar + og-avatar {
      margin-left: -64px;
    }

    /* ── Tipografia ── */
    .numero {
      flex: none;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 76px;
      font-weight: 800;
      line-height: 1;
      color: #6f6f76;
      font-variant-numeric: tabular-nums;
    }
    .rotulo {
      display: block;
      margin-bottom: 10px;
      white-space: nowrap;
      overflow: hidden;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #8f8f96;
    }
    .nomes {
      display: grid;
      min-width: 0;
      font-size: 52px;
      font-weight: 800;
      line-height: 1.08;
    }
    .nomes span {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pxc--desafia .numero,
    .pxc--desafia .rotulo {
      color: #fff;
    }
    /* Modificadores do trono DEPOIS da base: mesma especificidade, o último ganha. */
    .rotulo--tr {
      margin-bottom: 14px;
      font-size: 48px;
      color: #000;
      opacity: 0.8;
    }
    .nomes--tr {
      font-size: 104px;
      line-height: 1;
    }
    .numero--tr {
      font-size: 220px;
      color: #000;
      letter-spacing: -0.04em;
    }

    .assinatura {
      justify-self: end;
      color: #5c5c62;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.3em;
    }

    /* ── Entrada da tela ── (a cortina é do painel) */
    @keyframes px-tr-in {
      from {
        opacity: 0;
        transform: translateX(80px);
      }
    }
    @keyframes px-card-in {
      from {
        opacity: 0;
        transform: translateY(40px);
      }
    }
    @keyframes px-pisca {
      50% {
        filter: brightness(0.75);
      }
    }
    @keyframes px-fade {
      from {
        opacity: 0;
      }
    }

    /* ── Troca de rei com a tela aberta ── */
    .troca .pxh.tr {
      animation: px-tr-troca 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .troca .pxc {
      animation: px-card-troca 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-delay: calc(120ms + var(--i, 0) * 90ms);
    }
    @keyframes px-tr-troca {
      from {
        opacity: 0;
        transform: translateY(60px);
      }
    }
    @keyframes px-card-troca {
      from {
        opacity: 0;
        transform: translateX(120px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pxh.tr,
      .pxc,
      .inicio,
      .troca .pxh.tr,
      .troca .pxc {
        animation: none;
      }
    }
  `,
})
export class LedProximosComponent {
  readonly proximos = input<LedProximos | null>(null);
  readonly teams = input<ReadonlyMap<string, LedTeam>>(new Map<string, LedTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  readonly roundTitle = input('');
  /** "Rodada 3" — ou "Bateria 2" quando a chave tem baterias: aí o número da rodada da fase
   *  não identifica nada, e o resto do painel já fala em chave e bateria. Vazio esconde o selo. */
  readonly rodada = input('');

  protected readonly contexto = computed(() =>
    [this.categoryName(), this.courtName(), this.roundTitle()].filter((p) => !!p).join(' · '),
  );

  protected readonly fila = computed(() => this.proximos()?.fila ?? []);
  /** 2 a 4 colunas conforme a fila; a rodada tem no máximo 5 duplas. */
  protected readonly colunas = computed(() => Math.min(4, Math.max(2, this.fila().length)));

  /** Virou `true` na primeira troca de rei vista com a tela aberta — dali em diante o corpo
   *  refeito usa a animação de troca, não a de entrada. */
  protected readonly trocou = signal(false);
  private readonly reiAtual = computed(() => this.proximos()?.trono.teamId ?? null);

  constructor() {
    let anterior: string | null = null;
    effect(() => {
      const rei = this.reiAtual();
      untracked(() => {
        if (anterior != null && rei != null && rei !== anterior) this.trocou.set(true);
        if (rei == null) this.trocou.set(false);
      });
      anterior = rei;
    });
  }

  /** Descarta slot vazio e completa a inicial quando o servidor não mandou. */
  protected atletasDe(teamId: string): LedPlayer[] {
    return (this.teams().get(teamId)?.players ?? [])
      .filter((p) => p.name.trim() !== '')
      .map((p) => ({ ...p, initials: p.initials || ledIniciaisDe(p.name) }));
  }
}
