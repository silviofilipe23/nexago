import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import { OverlayMarkComponent } from './overlay-mark.component';
import { ledIniciaisDe } from '../led/led-iniciais';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocPreRound, PreRoundRow } from './overlay-koc-preround';

const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const ROW_FIRST_DELAY_MS = 240;
const ROW_STAGGER_MS = 110;
const FLIP_MS = 540;
const ENTER_MS = 440;
const ENTER_DELAY_MS = 180;
const FLASH_MS = 700;
const FLASH_DELAY_MS = 200;
const AVATAR_SIZE = 38;

const PAPEL: Record<PreRoundRow['papel'], string> = {
  trono: 'Começa no trono',
  desafia: 'Entra agora · Desafia o trono',
  sequencia: 'Na sequência',
  aguardando: 'Aguardando',
};

interface PreRoundAthlete {
  name: string;
  initials: string;
  photoUrl: string | null;
}

/** Elenco da rodada KOTC que ainda não começou.
 *
 *  Preenche um buraco real da transmissão: antes do apito não existe rei nem desafiante, então o
 *  placar não tem o que desenhar e a tela ficava vazia. Aqui o que há de verdade é a ORDEM DE
 *  ENTRADA — quem começa no trono e quem desafia primeiro. */
@Component({
  selector: 'og-overlay-koc-preround',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OverlayMarkComponent],
  template: `
    @if (preRound(); as pre) {
      <div class="card" animate.enter="pre-card-in" animate.leave="pre-card-out">
        <header class="head">
          <div class="eyebrow">
            @if (courtName()) {
              <span>{{ courtName() }}</span><span class="bar">|</span>
            }
            @if (categoryName()) {
              <span>{{ categoryName() }}</span><span class="bar">|</span>
            }
            <span>{{ roundTitle() }}</span>
          </div>
          <h1 class="titulo"><span class="destaque">Próximos</span> em quadra</h1>
        </header>

        <div class="linhas">
          @for (row of pre.rows; track row.teamId; let i = $index) {
            <div
              class="linha"
              [class.linha--agora]="row.papel === 'trono'"
              [class.linha--prox]="row.papel === 'desafia'"
              [attr.data-team-id]="row.teamId"
              [style.animation-delay.ms]="atrasoDaLinha(i)"
            >
              <span class="pos">{{ row.posicao }}</span>
              <span class="avatares">
                @for (p of atletasDe(row.teamId); track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="avatarSize" />
                }
              </span>
              <span class="quem">
                <span class="nomes">{{ nomesDe(row.teamId).join(' · ') }}</span>
                <span class="papel">{{ papelDe(row) }}</span>
              </span>
            </div>
          }
        </div>

        <footer class="trono">
          No trono: <strong>{{ nomesDe(pre.tronoTeamId).join(' · ') }}</strong>
        </footer>
      </div>
      <!-- O card é centralizado nesta tela, então a marca no canto inferior direito não disputa
           espaço com ele — sem desvio pro topo, ao contrário do placar de duelo. -->
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
      width: 470px;
      max-width: calc(100% - 96px);
      border-radius: 14px;
      overflow: hidden;
      /* Opaco: é leitura por cima da câmera. */
      background: #0b0b0c;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    }

    .pre-card-in {
      animation: preCardIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .pre-card-out {
      animation: preCardOut 380ms cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes preCardIn {
      from {
        opacity: 0;
        transform: translateY(40px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes preCardOut {
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
      padding: 18px 20px 14px;
      background: linear-gradient(135deg, #3a1c0c 0%, #141116 68%);
    }
    .eyebrow {
      display: flex;
      gap: 9px;
      color: #8f878f;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .bar {
      color: #56505a;
    }
    .titulo {
      margin: 8px 0 0;
      font-size: 27px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.01em;
    }
    .destaque {
      color: var(--nx-orange-500, #ff6a1a);
    }

    .linhas {
      display: grid;
      gap: 6px;
      padding: 12px;
    }

    .linha {
      display: grid;
      grid-template-columns: 26px auto 1fr;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: #17171a;
      animation: preRowIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes preRowIn {
      from {
        opacity: 0;
        transform: translateX(32px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .linha--agora {
      padding: 14px 12px;
      border-color: var(--nx-orange-500, #ff6a1a);
      background: linear-gradient(100deg, #4a2409 0%, #1e1512 100%);
    }
    .linha--prox .papel {
      color: #fff;
    }

    .pos {
      text-align: center;
      color: #8f878f;
      font-size: 18px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .linha--agora .pos {
      color: #fff;
    }

    .avatares {
      display: flex;
      align-items: center;
    }
    .avatares og-avatar {
      background: #0b0b0c;
      border: 2px solid #3a3a40;
      color: #cfc7cf;
      box-sizing: border-box;
    }
    .avatares og-avatar + og-avatar {
      margin-left: -10px;
    }
    .linha--agora .avatares og-avatar {
      border-color: var(--nx-orange-500, #ff6a1a);
      color: var(--nx-orange-500, #ff6a1a);
    }

    .quem {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .nomes {
      font-size: 19px;
      font-weight: 800;
      color: #e9e4e9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .linha--agora .nomes {
      color: #fff;
      font-size: 22px;
    }
    .papel {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8f878f;
    }
    .linha--agora .papel {
      color: var(--nx-orange-500, #ff6a1a);
    }

    .trono {
      padding: 13px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      color: #8f878f;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .trono strong {
      color: #efeaef;
    }

    @media (prefers-reduced-motion: reduce) {
      .pre-card-in,
      .pre-card-out,
      .linha {
        animation: none;
      }
    }
  `,
})
export class OverlayKocPreRoundComponent {
  private readonly host = inject(ElementRef);

  readonly preRound = input<KocPreRound | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayKocTeam>>(new Map<string, OverlayKocTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  readonly roundTitle = input('');

  protected readonly avatarSize = AVATAR_SIZE;
  protected readonly vazio = computed(() => this.preRound() == null);

  /** Ordem da fila + trono — só isto dispara FLIP; o rodapé troca o nome na hora, sem animação. */
  private readonly motionKey = computed(() => {
    const pre = this.preRound();
    if (!pre) return '';
    return `${pre.tronoTeamId}>${pre.rows.map((r) => r.teamId).join('|')}`;
  });

  private primed = false;
  private lastMotionKey = '';
  private prevTop = new Map<string, number>();
  private prevFirstId: string | null = null;

  constructor() {
    afterRenderEffect(() => {
      const key = this.motionKey();
      if (!key) {
        this.resetMotionState();
        return;
      }
      if (key === this.lastMotionKey) return;
      this.lastMotionKey = key;
      this.runMotion();
    });
  }

  protected atrasoDaLinha(index: number): number {
    return ROW_FIRST_DELAY_MS + index * ROW_STAGGER_MS;
  }

  protected nomesDe(teamId: string): string[] {
    return this.atletasDe(teamId).map((p) => p.name);
  }

  protected atletasDe(teamId: string): PreRoundAthlete[] {
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

  protected papelDe(row: PreRoundRow): string {
    return PAPEL[row.papel];
  }

  private resetMotionState(): void {
    this.primed = false;
    this.lastMotionKey = '';
    this.prevTop = new Map();
    this.prevFirstId = null;
  }

  private prefersReducedMotion(): boolean {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Só WAAPI — cancelar CSS mataria o stagger de entrada do card. */
  private cancelWaapi(el: HTMLElement): void {
    for (const a of el.getAnimations()) {
      if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
      a.cancel();
    }
  }

  private cancelAll(el: HTMLElement): void {
    for (const a of el.getAnimations()) a.cancel();
  }

  private runMotion(): void {
    const root = this.host.nativeElement as HTMLElement;
    const nodes = Array.from(root.querySelectorAll('.linha[data-team-id]')) as HTMLElement[];
    const motionOk = this.primed && !this.prefersReducedMotion();

    for (const el of nodes) this.cancelWaapi(el);
    void root.offsetWidth;

    const nextTop = new Map<string, number>();
    let firstId: string | null = null;
    let firstEl: HTMLElement | null = null;

    for (const el of nodes) {
      const id = el.dataset['teamId'];
      if (!id) continue;
      const top = el.getBoundingClientRect().top;
      nextTop.set(id, top);
      if (firstId === null) {
        firstId = id;
        firstEl = el;
      }

      if (!motionOk) continue;

      const prev = this.prevTop.get(id);
      if (prev === undefined) {
        // Quem perdeu o trono entra no fim da fila — sobe enquanto aparece.
        // Cancela o preRowIn do CSS: a entrada pós-FLIP é vertical, não o stagger lateral.
        this.cancelAll(el);
        el.animate(
          [
            { opacity: 0, transform: 'translateY(24px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: ENTER_MS, delay: ENTER_DELAY_MS, easing: EASE_OUT, fill: 'both' },
        );
      } else {
        const dy = prev - top;
        if (Math.abs(dy) > 0.5) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
            duration: FLIP_MS,
            easing: EASE_OUT,
          });
        }
      }
    }

    if (motionOk && firstEl && firstId && firstId !== this.prevFirstId) {
      firstEl.animate([{ filter: 'brightness(1.9)' }, { filter: 'brightness(1)' }], {
        duration: FLASH_MS,
        delay: FLASH_DELAY_MS,
        easing: EASE_OUT,
        fill: 'both',
      });
    }

    this.prevTop = nextTop;
    this.prevFirstId = firstId;
    this.primed = true;
  }
}
