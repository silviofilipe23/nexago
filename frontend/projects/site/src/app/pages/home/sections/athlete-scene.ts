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
import { DOWNLOAD_PATH } from '../../../../lib/store-links';
import { pinBeatScene, prefersReducedMotion } from './beat-scene';
import {
  ATHLETE,
  ATHLETE_BEATS,
  RANKING_CLIMB,
  formatThousands,
  levelProgress,
  myPosition,
  pointsToPromotion,
  reached,
  recentForm,
  winRate,
  type Stat,
} from './athlete-beats';
import { AthletePhone } from './athlete-phone';

/** Seis passos em vez dos cinco das outras cenas: a mesma meia tela de rolagem por passo. */
const PIN_VIEWPORTS = 3.6;

/**
 * Terceira cena jogada pela rolagem, fechando o "dia de jogo": o que fica com o atleta depois da
 * partida. O quadro é a ficha do atleta, como a cartela de uma transmissão; a cada trecho rolado
 * uma casa dela acende (histórico, nível, ranking, XP) e o celular mostra a tela do app de onde
 * aquilo vem. Começa no Modo Focus e termina com a ficha virando card de story.
 *
 * Mesma mecânica e mesmos lados do placar (`beat-scene.ts`), sem confete. O atleta é o "Você" que
 * venceu a semifinal lá em cima.
 */
@Component({
  selector: 'app-athlete-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, PhoneFrame, AthletePhone, ReplayAnimationDirective, RouterLink],
  host: { class: 'block' },
  templateUrl: './athlete-scene.html',
  styleUrls: ['./beat-scene.scss', './athlete-scene.scss'],
})
export class AthleteScene {
  protected readonly beats = ATHLETE_BEATS;
  protected readonly athlete = ATHLETE;
  protected readonly downloadPath = DOWNLOAD_PATH;

  protected readonly form = recentForm();
  protected readonly winRate = winRate(ATHLETE.wins, ATHLETE.games);
  protected readonly levelProgress = levelProgress(ATHLETE.level);
  protected readonly pointsToPromotion = pointsToPromotion(ATHLETE.level);
  protected readonly position = myPosition();
  protected readonly climb = RANKING_CLIMB;
  protected readonly xpTotal = formatThousands(ATHLETE.xp.total);

  protected readonly beat = signal(0);
  protected readonly current = computed(() => ATHLETE_BEATS[this.beat()]);
  protected readonly step = computed(() => this.current().step);
  protected readonly shared = computed(() => this.step() === 'share');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');

  constructor() {
    afterNextRender(() => {
      if (prefersReducedMotion()) {
        this.beat.set(ATHLETE_BEATS.length - 1);
        return;
      }
      const release = pinBeatScene({
        host: this.host.nativeElement,
        stage: this.stage().nativeElement,
        backdrop: this.backdrop().nativeElement,
        beats: ATHLETE_BEATS.length,
        viewports: PIN_VIEWPORTS,
        onBeat: (beat) => this.beat.set(beat),
      });
      this.destroyRef.onDestroy(release);
    });
  }

  /** A casa já acendeu? Acende no passo de mesmo nome e fica acesa até o fim. */
  protected lit(stat: Stat): boolean {
    return reached(this.step(), stat);
  }

  /** É a casa do passo em cena? Ganha o destaque laranja. */
  protected now(stat: Stat): boolean {
    return this.step() === stat;
  }
}
