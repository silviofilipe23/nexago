import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { winRateOf } from '../data/draw-session-selectors';
import type { DrawSessionEntrant, DrawSessionReveal } from '../data/draw-session.model';

/**
 * O momento full na tela: a dupla sorteada toma o telão inteiro.
 *
 * É o pedaço mais recortável da transmissão e o que o atleta espera ver do
 * próprio nome, então a hierarquia é deliberada: nomes em escala de pôster
 * primeiro, destino em seguida, estatística como legenda, frase por último.
 *
 * Cinco estatísticas, não quinze — nível, aproveitamento, cartel, títulos e os
 * últimos cinco resultados. Todas vêm do snapshot congelado na sessão; nenhuma
 * leitura extra, que é o que mantém o telão público barato.
 */
@Component({
  selector: 'og-sorteio-spotlight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = entrant();
    <div class="og-spot">
      <div class="og-spot-glow"></div>
      <div class="og-spot-bar"><div class="og-spot-bar-fill" [style.width.%]="progress() * 100"></div></div>

      <div class="og-spot-head">
        <span class="og-spot-kicker">{{ kicker() }}</span>
      </div>

      <div class="og-spot-body">
        <div class="og-spot-names">
          @if (e.photoUrls.length > 0) {
            <div class="og-spot-photos">
              @for (photo of e.photoUrls; track $index) {
                <div class="og-spot-photo" [style.background-image]="photo ? 'url(' + photo + ')' : null">
                  @if (!photo) {
                    <span>{{ initialOf($index) }}</span>
                  }
                </div>
              }
            </div>
          }
          @for (name of displayNames(); track name) {
            <div class="og-spot-name">{{ name }}</div>
          }
          <div class="og-spot-meta">
            @if (e.city) {
              <span class="og-spot-city">{{ e.city }}</span>
              <span class="og-spot-dot"></span>
            }
            <span>{{ e.levelLabel || 'Nível não informado' }}</span>
          </div>
        </div>

        <div class="og-spot-side">
          <div class="og-spot-dest">{{ destinationLabel() }}</div>

          <div class="og-spot-stats">
            @for (stat of stats(); track stat.label) {
              <div class="og-spot-stat">
                <span class="og-spot-stat-label">{{ stat.label }}</span>
                <span class="og-spot-stat-value">{{ stat.value }}</span>
              </div>
            }
          </div>

          @if (e.stats.last5.length > 0) {
            <div class="og-spot-last5">
              <span class="og-spot-stat-label">Últimos jogos</span>
              <div class="og-spot-last5-row">
                @for (r of e.stats.last5; track $index) {
                  <span class="og-spot-chip" [class.win]="r === 'V'">{{ r }}</span>
                }
              </div>
            </div>
          }

          @if (consequence()) {
            <div class="og-spot-consequence">{{ consequence() }}</div>
          }
        </div>
      </div>

      @if (reveal().phrase; as phrase) {
        <div class="og-spot-phrase">{{ phrase.text }}</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: absolute;
      inset: 0;
      background: var(--nx-bg);
      overflow: hidden;
    }
    .og-spot {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 48px 72px 44px;
      box-sizing: border-box;
    }
    .og-spot-glow {
      position: absolute;
      inset: 0;
      background: radial-gradient(1100px 620px at 22% 8%, rgb(255 106 26 / 22%), transparent 66%);
      pointer-events: none;
    }
    .og-spot-bar {
      position: absolute;
      inset: 0 0 auto;
      height: 6px;
      background: var(--nx-surface-2);
    }
    .og-spot-bar-fill {
      height: 100%;
      background: var(--nx-orange-500);
    }
    .og-spot-head {
      position: relative;
      flex: none;
      margin-bottom: 22px;
    }
    .og-spot-kicker {
      font-family: var(--nx-font-mono);
      font-size: 20px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-spot-body {
      position: relative;
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: 56px;
      align-items: center;
    }
    .og-spot-photos {
      display: flex;
      gap: 14px;
      margin-bottom: 26px;
    }
    .og-spot-photo {
      width: 132px;
      height: 132px;
      border-radius: 50%;
      background-color: var(--nx-surface-2);
      background-size: cover;
      background-position: center;
      border: 3px solid var(--nx-orange-500);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 46px;
      color: var(--nx-text-mute);
    }
    .og-spot-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 92px;
      line-height: 0.96;
      letter-spacing: -0.04em;
      color: var(--nx-text);
      /* Nome longo encolhe em vez de estourar a caixa do telão. */
      overflow-wrap: anywhere;
    }
    .og-spot-meta {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 22px;
      font-size: 24px;
      color: var(--nx-text-mute);
    }
    .og-spot-city {
      font-family: var(--nx-font-mono);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .og-spot-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-text-dim);
    }
    .og-spot-side {
      display: flex;
      flex-direction: column;
      gap: 22px;
      min-width: 0;
    }
    .og-spot-dest {
      align-self: flex-start;
      padding: 14px 32px;
      border-radius: 18px;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 52px;
      letter-spacing: -0.02em;
      line-height: 1;
    }
    .og-spot-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .og-spot-stat {
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-spot-stat-label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 13px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-spot-stat-value {
      display: block;
      margin-top: 5px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 27px;
      /* Números de larguras iguais: sem isso a linha "dança" entre revelações. */
      font-variant-numeric: tabular-nums;
      color: var(--nx-text);
    }
    .og-spot-last5-row {
      display: flex;
      gap: 7px;
      margin-top: 8px;
    }
    .og-spot-chip {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 11px;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-text-mute);
    }
    .og-spot-chip.win {
      background: rgb(43 209 126 / 16%);
      border-color: rgb(43 209 126 / 45%);
      color: var(--nx-win);
    }
    .og-spot-consequence {
      padding: 16px 18px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-size: 22px;
      line-height: 1.45;
      color: var(--nx-text-mute);
    }
    .og-spot-phrase {
      position: relative;
      flex: none;
      margin-top: 22px;
      padding: 20px 26px;
      border-radius: 18px;
      background: var(--nx-orange-tint);
      border: 1px solid rgb(255 106 26 / 35%);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 30px;
      line-height: 1.3;
      color: var(--nx-text);
    }
  `,
})
export class SorteioSpotlightComponent {
  readonly entrant = input.required<DrawSessionEntrant>();
  readonly reveal = input.required<DrawSessionReveal>();
  readonly destinationLabel = input.required<string>();
  /** 0 a 1 — move a barra de tempo no topo. */
  readonly progress = input(0);

  protected readonly kicker = computed(() => {
    const e = this.entrant();
    if (e.lockedSeed != null) return `Cabeça de chave ${e.lockedSeed}`;
    return e.potIndex === 1 ? 'Pote 1 · cabeça de chave' : `Pote ${e.potIndex} · acabou de sair`;
  });

  /** Nomes dos atletas quando existem; senão o rótulo da equipe. */
  protected readonly displayNames = computed(() => {
    const e = this.entrant();
    return e.playerNames.length > 0 ? e.playerNames : [e.label];
  });

  protected readonly stats = computed(() => {
    const e = this.entrant();
    const rate = winRateOf(e);
    return [
      { label: 'pontos', value: e.points == null ? '—' : String(e.points) },
      { label: 'aprov.', value: rate == null ? '—' : `${rate}%` },
      { label: 'cartel', value: `${e.stats.wins}–${e.stats.losses}` },
      { label: 'títulos', value: String(e.stats.titles) },
    ];
  });

  /**
   * A "consequência imediata" da dupla eliminatória — o que dá a dramaturgia
   * do formato. Já vem resolvida do servidor: nenhuma tela conhece planta.
   */
  protected readonly consequence = computed(() => {
    const placement = this.reveal().dePlacement;
    if (!placement) return null;

    const debut = placement.hasBye ?
      'Entra direto na segunda rodada — tem bye.' :
      placement.opponentSeed != null ?
        `Estreia contra a cabeça ${placement.opponentSeed}.` :
        placement.opponentFromMatch != null ?
          `Estreia contra o vencedor do jogo ${placement.opponentFromMatch}.` :
          null;

    const meeting = placement.meetsSeed;
    if (!meeting) return debut;
    const path =
      meeting.winsNeeded === 0 ?
        `Cruza com a cabeça ${meeting.seed} já na estreia.` :
        `Se ganhar ${meeting.winsNeeded === 1 ? 'uma' : meeting.winsNeeded}, cruza com a cabeça ${meeting.seed}.`;
    return debut && !debut.includes(`cabeça ${meeting.seed}`) ? `${debut} ${path}` : path;
  });

  protected initialOf(index: number): string {
    const names = this.entrant().playerNames;
    return (names[index] ?? this.entrant().label).trim().charAt(0).toUpperCase() || '?';
  }
}
