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
import { PhoneFrame } from '../../../shared/ui/phone-frame';
import { ReplayAnimationDirective } from '../../../shared/replay-animation.directive';
import { pinBeatScene, prefersReducedMotion } from './beat-scene';
import { EVENT, ORGANIZER_BEATS, ROUNDS, TEAMS, matchView, reached } from './organizer-beats';
import { OrganizerPhone } from './organizer-phone';

const PIN_VIEWPORTS = 3;

/** Onde o organizador começa: o guia do painel, com o cadastro que libera o acesso na hora. */
const ORGANIZER_GUIDE = '/docs/organizadores';

/**
 * Quarta cena jogada pela rolagem, depois da do atleta: o mesmo torneio visto do outro lado da
 * mesa. O quadro é a chave da categoria — nasce como lista de inscritos, vira chave no sorteio,
 * ganha hora e quadra, recebe os placares da mesa e termina com os campeões. O celular mostra a
 * tela do painel do organizador em cada passo.
 *
 * Mesma mecânica das outras (`beat-scene.ts`), com os lados da reserva (celular à esquerda, quadro
 * à direita) para alternar com a cena do atleta. Sem confete. O link do desfecho não é o download:
 * leva ao guia do organizador, que é por onde ele começa.
 */
@Component({
  selector: 'app-organizer-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, PhoneFrame, OrganizerPhone, ReplayAnimationDirective, RouterLink],
  host: { class: 'block' },
  templateUrl: './organizer-scene.html',
  styleUrls: ['./beat-scene.scss', './organizer-scene.scss'],
})
export class OrganizerScene {
  protected readonly beats = ORGANIZER_BEATS;
  protected readonly event = EVENT;
  protected readonly teams = TEAMS;
  protected readonly guide = ORGANIZER_GUIDE;

  protected readonly beat = signal(0);
  protected readonly current = computed(() => ORGANIZER_BEATS[this.beat()]);
  protected readonly step = computed(() => this.current().step);
  /** A chave já foi sorteada: o quadro troca a lista de inscritos pela chave. */
  protected readonly drawn = computed(() => reached(this.step(), 'draw'));
  protected readonly live = computed(() => this.step() === 'live');
  protected readonly finished = computed(() => this.step() === 'podium');

  /** A chave no passo atual: fases → pares de partidas que se encontram na fase seguinte. */
  protected readonly rounds = computed(() => {
    const step = this.step();
    return ROUNDS.map((round) => ({
      title: round.title,
      pairs: round.pairs.map((pair) => pair.map((id) => matchView(step, id))),
    }));
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');

  constructor() {
    afterNextRender(() => {
      if (prefersReducedMotion()) {
        this.beat.set(ORGANIZER_BEATS.length - 1);
        return;
      }
      const release = pinBeatScene({
        host: this.host.nativeElement,
        stage: this.stage().nativeElement,
        backdrop: this.backdrop().nativeElement,
        beats: ORGANIZER_BEATS.length,
        viewports: PIN_VIEWPORTS,
        onBeat: (beat) => this.beat.set(beat),
      });
      this.destroyRef.onDestroy(release);
    });
  }
}
