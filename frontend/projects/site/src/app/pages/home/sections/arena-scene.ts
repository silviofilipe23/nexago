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
import { COURTS, TIMES } from './booking-beats';
import {
  ARENA,
  ARENA_BEATS,
  KIND_LABEL,
  TABS,
  agendaRow,
  formatMoney,
  hasTab,
  isYours,
  occupancy,
  reached,
  revenue,
} from './arena-beats';
import { ArenaPhone } from './arena-phone';

const PIN_VIEWPORTS = 3;

/** A cena fala com quem tem arena: o desfecho leva à página das arenas (planos e contato), não ao download. */
const ARENA_PAGE = '/arenas';

/**
 * Quinta cena jogada pela rolagem: a mesma quinta-feira da cena da reserva, vista do balcão da
 * arena. O quadro é a agenda do dia, o mesmo quadro de horários que o atleta viu, agora com dono
 * em cada casa: entra a reserva paga (a de "Você", feita lá em cima), depois os horários fixos, o
 * clubinho e a aula, as comandas do bar e, por fim, o caixa fechado. Embaixo da grade, o placar do
 * dia (faturamento, ocupação, comandas) sobe a cada passo. O celular mostra a tela do painel do
 * gestor de onde aquilo vem.
 *
 * Mesma mecânica do placar (`beat-scene.ts`) e mesmos lados (quadro à esquerda), sem confete.
 */
@Component({
  selector: 'app-arena-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, PhoneFrame, ArenaPhone, ReplayAnimationDirective, RouterLink],
  host: { class: 'block' },
  templateUrl: './arena-scene.html',
  styleUrls: ['./beat-scene.scss', './arena-scene.scss'],
})
export class ArenaScene {
  protected readonly beats = ARENA_BEATS;
  protected readonly arena = ARENA;
  protected readonly times = TIMES;
  protected readonly page = ARENA_PAGE;
  protected readonly tabsCount = TABS.length;

  protected readonly beat = signal(0);
  protected readonly current = computed(() => ARENA_BEATS[this.beat()]);
  protected readonly step = computed(() => this.current().step);
  /** O bar já abriu: as comandas aparecem na agenda e no placar do dia. */
  protected readonly barOpen = computed(() => reached(this.step(), 'tab'));
  protected readonly closed = computed(() => this.step() === 'close');

  /** A agenda no passo atual: uma linha por quadra, uma casa por horário (ou por bloco). */
  protected readonly rows = computed(() => {
    const step = this.step();
    const barOpen = this.barOpen();
    return COURTS.map((court) => ({
      court,
      cells: agendaRow(step, court).map((cell) => {
        const tab = barOpen && !!cell.block && hasTab(cell.block);
        return {
          ...cell,
          label: cell.block ? KIND_LABEL[cell.block.kind] : '',
          yours: !!cell.block && isYours(cell.block),
          tab,
          // Em destaque: o que acabou de entrar na agenda e, no passo do bar, quem abriu comanda.
          now: cell.fresh || (tab && step === 'tab'),
        };
      }),
    }));
  });

  protected readonly revenue = computed(() => formatMoney(revenue(this.step())));
  protected readonly occupancy = computed(() => occupancy(this.step()));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');

  constructor() {
    afterNextRender(() => {
      if (prefersReducedMotion()) {
        this.beat.set(ARENA_BEATS.length - 1);
        return;
      }
      const release = pinBeatScene({
        host: this.host.nativeElement,
        stage: this.stage().nativeElement,
        backdrop: this.backdrop().nativeElement,
        beats: ARENA_BEATS.length,
        viewports: PIN_VIEWPORTS,
        onBeat: (beat) => this.beat.set(beat),
      });
      this.destroyRef.onDestroy(release);
    });
  }
}
