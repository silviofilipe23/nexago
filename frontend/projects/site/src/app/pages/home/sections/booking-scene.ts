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
import { BOOKING, BOOKING_BEATS, COURTS, TIMES, cellState, isChosen, reached, type CellState } from './booking-beats';
import { BookingPhone } from './booking-phone';

/** O que cada casa do quadro diz. "Ocupada" não aparece escrita (a casa fica hachurada), mas é
 *  lida por leitor de tela. */
const CELL_LABEL: Record<CellState, string> = {
  unknown: '',
  busy: 'Ocupada',
  free: 'Livre',
  picked: 'Escolhida',
  holding: 'Pagando',
  yours: 'Você',
};

const PIN_VIEWPORTS = 3;

/**
 * Segunda cena jogada pela rolagem, logo depois do placar: a reserva de uma quadra, do "bora
 * jogar?" ao "reservado". De um lado o quadro de horários da arena, do outro a tela do app; a
 * cada trecho rolado a reserva avança uma etapa e a casa das 18h muda de dono.
 *
 * Mesma mecânica do placar (`beat-scene.ts`), com os lados trocados no desktop para as duas cenas
 * não parecerem a mesma tela. O desfecho aqui é o carimbo no quadro — o confete fica com a vitória.
 */
@Component({
  selector: 'app-booking-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, PhoneFrame, BookingPhone, ReplayAnimationDirective, RouterLink],
  host: { class: 'block' },
  templateUrl: './booking-scene.html',
  styleUrls: ['./beat-scene.scss', './booking-scene.scss'],
})
export class BookingScene {
  protected readonly beats = BOOKING_BEATS;
  protected readonly booking = BOOKING;
  protected readonly times = TIMES;
  protected readonly downloadPath = DOWNLOAD_PATH;

  protected readonly beat = signal(0);
  protected readonly current = computed(() => BOOKING_BEATS[this.beat()]);
  protected readonly step = computed(() => this.current().step);
  protected readonly done = computed(() => this.step() === 'done');
  /** O esporte já foi escolhido: a agenda da arena aparece no quadro. */
  protected readonly sportChosen = computed(() => reached(this.step(), 'sport'));
  /** Um horário já foi escolhido: a coluna e a quadra dele ganham destaque. */
  protected readonly slotChosen = computed(() => reached(this.step(), 'slot'));

  /** O quadro de horários no passo atual: uma linha por quadra, uma casa por horário. */
  protected readonly rows = computed(() => {
    const step = this.step();
    return COURTS.map((court) => ({
      court,
      chosen: court === BOOKING.court,
      cells: TIMES.map((time) => {
        const state = cellState(step, court, time);
        return { time, state, label: CELL_LABEL[state], chosen: isChosen(court, time) };
      }),
    }));
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');

  constructor() {
    afterNextRender(() => {
      if (prefersReducedMotion()) {
        this.beat.set(BOOKING_BEATS.length - 1);
        return;
      }
      const release = pinBeatScene({
        host: this.host.nativeElement,
        stage: this.stage().nativeElement,
        backdrop: this.backdrop().nativeElement,
        beats: BOOKING_BEATS.length,
        viewports: PIN_VIEWPORTS,
        onBeat: (beat) => this.beat.set(beat),
      });
      this.destroyRef.onDestroy(release);
    });
  }
}
