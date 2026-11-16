import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PhoneAppShell } from '../../../shared/ui/phone-app-shell';
import { PhoneFrame } from '../../../shared/ui/phone-frame';
import { ReplayAnimationDirective } from '../../../shared/replay-animation.directive';
import { DOWNLOAD_PATH } from '../../../../lib/store-links';
import { pinBeatScene, prefersReducedMotion } from './beat-scene';
import { FIRST_SET, MATCH_BEATS, SETS_BEFORE, TEAMS, pointLog, type Side } from './match-point-beats';

const PIN_VIEWPORTS = 3;

/**
 * Cena-assinatura da home: os últimos pontos de uma semifinal, jogados pela rolagem da página.
 * O placar de transmissão (esquerda) e a tela do app (direita) mostram o mesmo jogo; a cada
 * trecho rolado sai um ponto, até o match point virar vitória.
 *
 * A rolagem só escolhe o `beat` atual (mecânica em `beat-scene.ts`, a mesma da cena de reserva) —
 * o que aparece em cada um é template comum, guiado por signal. Sem linha do tempo imperativa
 * para manter em sincronia com o markup.
 * Com `prefers-reduced-motion` nada fica preso: a seção mostra direto o placar final.
 */
@Component({
  selector: 'app-match-point',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, PhoneAppShell, PhoneFrame, ReplayAnimationDirective, RouterLink],
  host: { class: 'block' },
  templateUrl: './match-point.html',
  styleUrls: ['./beat-scene.scss', './match-point.scss'],
})
export class MatchPoint {
  protected readonly beats = MATCH_BEATS;
  protected readonly teams = TEAMS;
  protected readonly sides: Side[] = ['us', 'them'];
  protected readonly firstSet = FIRST_SET;
  protected readonly downloadPath = DOWNLOAD_PATH;

  protected readonly beat = signal(0);
  protected readonly current = computed(() => MATCH_BEATS[this.beat()]);
  protected readonly won = computed(() => this.beat() === MATCH_BEATS.length - 1);
  protected readonly log = computed(() => pointLog(this.beat()));
  /** Um ponto para fechar o jogo: 20 ou mais, na frente, já com um set no bolso. */
  protected readonly matchPoint = computed(() => {
    const { us, them } = this.current();
    return !this.won() && us >= 20 && us > them;
  });

  protected setsFor(side: Side): number {
    return SETS_BEFORE[side] + (this.won() && side === 'us' ? 1 : 0);
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');

  constructor() {
    afterNextRender(() => {
      if (prefersReducedMotion()) {
        this.beat.set(MATCH_BEATS.length - 1);
        return;
      }
      const release = pinBeatScene({
        host: this.host.nativeElement,
        stage: this.stage().nativeElement,
        backdrop: this.backdrop().nativeElement,
        beats: MATCH_BEATS.length,
        viewports: PIN_VIEWPORTS,
        onBeat: (beat) => this.goTo(beat),
      });
      this.destroyRef.onDestroy(release);
    });
  }

  private goTo(next: number): void {
    const previous = this.beat();
    if (next === previous) return;
    this.beat.set(next);
    if (next === MATCH_BEATS.length - 1 && next > previous) this.celebrate();
  }

  /** Confete só na chegada à vitória (não ao rolar de volta), carregado sob demanda. */
  private celebrate(): void {
    import('canvas-confetti').then(({ default: confetti }) => {
      const wide = window.innerWidth >= 1024;
      confetti({
        particleCount: wide ? 110 : 70,
        spread: 75,
        startVelocity: 46,
        origin: { x: wide ? 0.3 : 0.5, y: 0.45 },
        colors: ['#ff6a1a', '#e6cfa4', '#f4f4f5'],
        disableForReducedMotion: true,
      });
    });
  }
}
