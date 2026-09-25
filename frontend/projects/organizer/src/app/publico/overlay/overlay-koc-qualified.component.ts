import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import { ledIniciaisDe } from '../led/led-iniciais';
import { OverlayMarkComponent } from './overlay-mark.component';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocQualifiedBoard, KocQualifiedEntry } from './overlay-koc-qualified';

/** Tempos da revelação, na especificação do dono. */
const ROW_FIRST_DELAY_MS = 260;
const ROW_STAGGER_MS = 120;
const SEG_FIRST_DELAY_MS = 200;
const SEG_STAGGER_MS = 60;
/** Quanto tempo a dupla recém-classificada fica marcada como nova. */
const NOVA_MS = 12_000;
const AVATAR_SIZE = 44;

interface QualifiedAthlete {
  name: string;
  initials: string;
  photoUrl: string | null;
}

/** Quem já garantiu vaga na fase classificatória.
 *
 *  VERDE de ponta a ponta, contra o laranja da classificação da rodada: são duas telas com
 *  recortes diferentes e confundi-las na transmissão seria pior que não ter nenhuma. */
@Component({
  selector: 'og-overlay-koc-qualified',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OverlayMarkComponent],
  template: `
    @if (visible() && board(); as b) {
      <div class="card" [class.card--out]="saindo()">
        <header class="head">
          <div class="eyebrow">
            @if (tournamentName()) {
              <span>{{ tournamentName() }}</span><span class="bar">|</span>
            }
            <span>{{ phaseName() }}</span><span class="bar">|</span>
            <span>{{ categoryName() }}</span>
          </div>

          <div class="headline">
            <div>
              <h1 class="title">Classificadas</h1>
              <div class="sub">{{ subtitulo() }}</div>
            </div>

            <div class="progress">
              <div class="count"><strong>{{ b.roundsDone }}</strong> de {{ b.totalRounds }} rodadas</div>
              <div class="bars">
                @for (seg of segmentos(); track $index) {
                  <span
                    class="seg"
                    [class.seg--done]="seg"
                    [style.animation-delay.ms]="atrasoDoSegmento($index)"
                  ></span>
                }
              </div>
            </div>
          </div>
        </header>

        <div class="rows">
          @for (entry of b.entries; track entry.teamId; let i = $index) {
            <div
              class="row"
              [class.row--nova]="ehNova(entry)"
              [style.animation-delay.ms]="atrasoDaLinha(i)"
            >
              <span class="avatares">
                @for (p of atletasDe(entry.teamId); track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="avatarSize" />
                }
              </span>
              <span class="names">{{ nomesDe(entry.teamId) }}</span>
              @if (ehNova(entry)) {
                <span class="nova">Nova</span>
              }
              <span class="origem">{{ entry.place }}º · Rodada {{ entry.roundLabel }}</span>
            </div>
          }
        </div>

        <footer class="foot">
          <span>{{ b.vagasPorRodada }} {{ b.vagasPorRodada === 1 ? 'vaga' : 'vagas' }} por rodada</span>
          @if (faltam() > 0) {
            <span>Faltam <strong>{{ faltam() }}</strong> {{ faltam() === 1 ? 'rodada' : 'rodadas' }}</span>
          }
        </footer>
      </div>
      <og-overlay-mark />
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
      font-family: var(--nx-font, system-ui, sans-serif);
    }

    .card {
      width: 800px;
      max-width: calc(100% - 96px);
      border-radius: 18px;
      overflow: hidden;
      background: #0f1412;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
      animation: cardIn 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .card--out {
      animation: cardOut 380ms cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes cardIn {
      from {
        opacity: 0;
        transform: translateY(40px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes cardOut {
      from {
        opacity: 1;
        transform: none;
      }
      to {
        opacity: 0;
        transform: translateY(30px) scale(0.98);
      }
    }

    .head {
      padding: 28px 32px 24px;
      background: linear-gradient(135deg, #10321f 0%, #0f1412 68%);
    }
    .eyebrow {
      display: flex;
      gap: 11px;
      color: #8a938d;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .bar {
      color: #4d5651;
    }
    .headline {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      margin-top: 14px;
    }
    .title {
      margin: 0 0 6px;
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: #2fd97a;
    }
    .sub {
      color: #8a938d;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .progress {
      text-align: right;
    }
    .count {
      color: #8a938d;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .count strong {
      color: #fff;
      font-size: 26px;
      font-variant-numeric: tabular-nums;
    }
    .bars {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      margin-top: 10px;
    }
    .seg {
      width: 30px;
      height: 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.12);
      transform-origin: left center;
    }
    /* Só o segmento encerrado se preenche — os que faltam ficam apagados, sem animação. */
    .seg--done {
      background: #2fd97a;
      animation: segFill 300ms ease-out both;
    }
    @keyframes segFill {
      from {
        transform: scaleX(0);
      }
      to {
        transform: scaleX(1);
      }
    }

    .rows {
      padding: 18px 24px 10px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 10px;
      padding: 16px 18px;
      border: 1px solid rgba(47, 217, 122, 0.22);
      border-radius: 12px;
      background: rgba(47, 217, 122, 0.07);
      animation: rowIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes rowIn {
      from {
        opacity: 0;
        transform: translateX(-32px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .row--nova {
      border-color: rgba(47, 217, 122, 0.6);
      background: rgba(47, 217, 122, 0.16);
      animation:
        novaIn 480ms cubic-bezier(0.22, 1, 0.36, 1) both,
        novaFlash 800ms ease-out 480ms both;
    }
    @keyframes novaIn {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes novaFlash {
      from {
        filter: brightness(2);
      }
      to {
        filter: brightness(1);
      }
    }

    .avatares {
      display: flex;
      align-items: center;
      flex: none;
    }
    .avatares og-avatar {
      background: #0f1412;
      border: 2px solid rgba(47, 217, 122, 0.35);
      color: #8a938d;
      box-sizing: border-box;
    }
    .avatares og-avatar + og-avatar {
      margin-left: -12px;
    }
    .row--nova .avatares og-avatar {
      border-color: #2fd97a;
      color: #2fd97a;
    }

    .names {
      flex: 1;
      min-width: 0;
      font-size: 26px;
      font-weight: 800;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nova {
      flex: none;
      padding: 5px 11px;
      border-radius: 999px;
      background: #2fd97a;
      color: #06210f;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .origem {
      flex: none;
      color: #2fd97a;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;
    }

    .foot {
      display: flex;
      justify-content: space-between;
      padding: 18px 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
      color: #8a938d;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .foot strong {
      color: #efeaef;
    }

    @media (prefers-reduced-motion: reduce) {
      .card,
      .card--out,
      .row,
      .row--nova,
      .seg--done {
        animation: none;
      }
    }
  `,
})
export class OverlayKocQualifiedComponent {
  readonly board = input<KocQualifiedBoard | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayKocTeam>>(new Map<string, OverlayKocTeam>());
  readonly tournamentName = input<string | null>(null);
  readonly phaseName = input<string | null>(null);
  readonly categoryName = input<string | null>(null);

  protected readonly avatarSize = AVATAR_SIZE;
  protected readonly visible = signal(true);
  protected readonly saindo = signal(false);

  /** Dupla que acabou de garantir vaga. Derivada da CHEGADA de uma entrada nova entre dois
   *  quadros — assim a marca aparece sozinha ao vivo, sem ninguém precisar chamar `encerrar()`. */
  private readonly nova = signal<string | null>(null);
  private conhecidas: string[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly segmentos = computed(() => {
    const b = this.board();
    if (!b) return [];
    return Array.from({ length: b.totalRounds }, (_, i) => i < b.roundsDone);
  });

  /** Frase inteira montada aqui: separar em dois nós de texto no template faria o espaço sumir
   *  (o portal compila com `preserveWhitespaces` desligado). */
  protected readonly subtitulo = computed(() => {
    const destino = this.board()?.destino;
    return destino ? `Vagas garantidas na ${destino}` : 'Vagas garantidas';
  });

  protected readonly faltam = computed(() => {
    const b = this.board();
    return b ? Math.max(0, b.totalRounds - b.roundsDone) : 0;
  });

  constructor() {
    effect(() => {
      const ids = (this.board()?.entries ?? []).map((e) => e.teamId);
      const antes = this.conhecidas;
      this.conhecidas = ids;
      if (antes === null) return; // primeiro quadro não tem "novidade"
      const chegou = ids.find((id) => !antes.includes(id));
      if (!chegou) return;
      this.nova.set(chegou);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.nova.set(null), NOVA_MS);
    });
  }

  protected atrasoDaLinha(index: number): number {
    return ROW_FIRST_DELAY_MS + index * ROW_STAGGER_MS;
  }

  protected atrasoDoSegmento(index: number): number {
    return SEG_FIRST_DELAY_MS + index * SEG_STAGGER_MS;
  }

  protected ehNova(entry: KocQualifiedEntry): boolean {
    return this.nova() === entry.teamId;
  }

  protected nomesDe(teamId: string): string {
    return this.atletasDe(teamId)
      .map((p) => p.name)
      .join(' · ');
  }

  protected atletasDe(teamId: string): QualifiedAthlete[] {
    const team = this.teams().get(teamId);
    if (!team) return [];
    return team.players
      .map((name, i) => ({
        name,
        initials: ledIniciaisDe(name),
        photoUrl: team.photos?.[i] ?? null,
      }))
      .filter((p) => p.name !== '');
  }

  mostrar(): void {
    this.saindo.set(false);
    this.visible.set(false);
    queueMicrotask(() => this.visible.set(true));
  }

  entrar(): void {
    this.saindo.set(false);
    this.visible.set(true);
  }

  sair(): void {
    this.saindo.set(true);
  }
}
