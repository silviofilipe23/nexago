import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  AGENDA_GRID_START_MIN,
  AGENDA_ROW_HEIGHT,
  AGENDA_SLOT_MIN,
  formatMinutes,
  gridEndMinFor,
  isWithinGrid,
  minutesToRowOffset,
  nowInMinutes,
} from './agenda-grid-math';

/** `available` = horário livre (clicável pra bloquear); `bloqueado` = horário específico
 *  bloqueado pelo gestor (clicável pra desbloquear); `manutencao` = quadra inteira fora do ar
 *  (não é por horário, não clicável — ver `ArenaCourt.status`). */
export type AgendaBlockStatus = 'available' | 'confirmada' | 'pendente' | 'bloqueado' | 'manutencao';

export interface AgendaCourt {
  id: string;
  name: string;
  sport: string;
}

export interface AgendaBlock {
  id: string;
  courtId: string;
  start: number;
  dur: number;
  status: AgendaBlockStatus;
  client: string;
}

interface PositionedBlock extends AgendaBlock {
  top: number;
  height: number;
  label: string;
  timeLabel: string;
}

interface RowMark {
  offset: number;
  isHour: boolean;
  label: string;
}

const NON_CLICKABLE: ReadonlySet<AgendaBlockStatus> = new Set(['manutencao']);

/** Piso de legibilidade por quadra: abaixo disso o bloco de reserva não cabe título + horário.
 *  Quadras que não couberem lado a lado empurram a grade pra rolagem horizontal em vez de
 *  espremer em silêncio (mesmo raciocínio da classe global de tabela larga, aplicado aqui à
 *  mão porque o layout é de blocos posicionados por cálculo, não uma tabela de
 *  `grid-template-columns`). */
const MIN_COURT_COL_PX = 120;

/** Grade de quadras × horário (protótipo ArAgendaGrade), com blocos posicionados por cálculo —
 *  inclui horários disponíveis (clicáveis pra bloquear) além de reservados/bloqueados. */
@Component({
  selector: 'ar-agenda-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="body">
        <!-- Cabeçalho de quadras entra na MESMA rolagem (vertical e horizontal) da grade —
             fixo em 'top' pra não sumir ao rolar pra baixo; a coluna de horário abaixo se
             fixa em 'left'. Cabeçalho fora daqui desalinharia das colunas ao rolar de lado,
             igual ao cuidado da Task 9 com '.table-head'/'.table-row'. -->
        <div class="court-header">
          <!-- Canto congelado: sem isto, ao rolar pra o lado o cabeçalho de quadra desliza
               por baixo do espaço vazio e fica "colado" acima da coluna de horário fixada. -->
          <div class="gutter-spacer"></div>
          @for (c of courts(); track c.id) {
            <div class="court-head" [style.minWidth.px]="minCourtColPx">
              <div class="court-name">{{ c.name }}</div>
              <div class="court-sport">{{ c.sport }}</div>
            </div>
          }
        </div>

        <div class="grid" [style.height.px]="gridHeight()">
          <!-- Coluna de horário fixada: precisa ser filho de fluxo normal (não 'position:
               absolute') pra 'position: sticky; left: 0' funcionar — os rótulos de hora
               continuam posicionados por cálculo dentro dela. -->
          <div class="time-gutter" [style.height.px]="gridHeight()">
            @for (row of rowMarks(); track row.offset) {
              @if (row.isHour) {
                <div class="hour-label" [style.top.px]="row.offset - 6">{{ row.label }}</div>
              }
            }
          </div>

          @for (row of rowMarks(); track row.offset) {
            <div class="hour-line" [class.solid]="row.isHour" [style.top.px]="row.offset"></div>
          }

          <div class="columns">
            @for (c of courts(); track c.id) {
              <div class="column" [style.minWidth.px]="minCourtColPx">
                @for (b of positionedByCourt()[c.id] ?? []; track b.start) {
                  <div
                    class="block"
                    [class]="'tone-' + b.status"
                    [class.clickable]="isClickable(b.status)"
                    [style.top.px]="b.top"
                    [style.height.px]="b.height"
                    (click)="isClickable(b.status) && blockClick.emit(b.id)"
                  >
                    <div class="block-title">{{ b.label }}</div>
                    @if (b.height > 30) {
                      <div class="block-time">{{ b.timeLabel }}</div>
                    }
                  </div>
                }
              </div>
            }
          </div>

          @if (nowOffset() >= 0) {
            <div class="now-line" [style.top.px]="nowOffset()">
              <div class="now-line-bar"></div>
              <span class="now-line-dot"></span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .court-header {
      display: flex;
      padding-bottom: 10px;
      /* Fixo no topo da rolagem vertical de '.body' — some ao rolar pra baixo seria perder
         a referência de qual coluna é qual quadra. Fundo opaco: sem isso os blocos passam
         por baixo transparentes enquanto a grade rola.
         'width: max-content' + 'min-width: 100%' é o que faz esta linha ficar tão larga
         quanto o conteúdo real (soma das quadras) em vez de só a largura do viewport — sem
         isso a caixa fica estreita demais e o fundo opaco "acaba" no meio da rolagem
         horizontal, revelando os blocos por baixo (medido: borda direita ia a -75px em
         scrollLeft 400 antes deste ajuste).
         'z-index: 7', acima de '.time-gutter' (6): os dois só têm 'top'/'left' como offset
         de sticky, então nenhum escapa da ordem normal de empilhamento — empate de z-index
         entre irmãos do mesmo contexto resolve por ordem de árvore, e '.time-gutter' (dentro
         de '.grid', que vem DEPOIS de '.court-header' no DOM) ganharia o empate se os dois
         ficassem em 6. Sem este degrau a mais, a caixa de altura cheia da gutter (que rola
         pra cima junto com '.grid') pinta por cima da faixa do cabeçalho sticky assim que
         scrollTop > 0 — medido com 'elementsFromPoint' no canto (x=20, dentro da faixa do
         cabeçalho): o topo virava 'hour-label' em vez do cabeçalho. */
      position: sticky;
      top: 0;
      z-index: 7;
      background: var(--nx-surface-0);
      width: max-content;
      min-width: 100%;
    }

    /* Canto congelado, irmão real de largura fixa (não 'padding-left') — só assim dá pra
       fixar em 'left' igual à coluna de horário abaixo. Sem isto, ao rolar de lado o
       cabeçalho de quadra desliza por baixo do espaço vazio e fica "colado" acima da coluna
       de horário fixada, como se fosse o cabeçalho dela. */
    .gutter-spacer {
      width: 52px;
      flex: none;
      position: sticky;
      left: 0;
      z-index: 1;
      background: var(--nx-surface-0);
    }

    .court-head {
      flex: 1;
      text-align: center;
    }

    .court-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .court-sport {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .body {
      flex: 1;
      min-height: 0;
      /* Container rola nos dois eixos — vertical (como já era) e horizontal (novo: quadra
         nunca mais espreme abaixo de MIN_COURT_COL_PX, o excesso vira scroll). A página em
         volta nunca rola na horizontal. */
      overflow: auto;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .body::-webkit-scrollbar {
      display: none;
    }

    /* 'display: flex' + 'width: max-content' + 'min-width: 100%': a caixa da grade tem que
       ser tão larga quanto o conteúdo de verdade (gutter + colunas), não só o viewport —
       senão o bloco contentor da coluna de horário fixada (abaixo) fica estreito demais e o
       'position: sticky' desgruda dele no meio da rolagem, porque sticky nunca escapa do
       próprio bloco contentor. Medido: sem isto, a gutter ficava em x=0 só até ~35% do
       curso e terminava em valores negativos (ex.: -174 no fim, numa grade de 772px de
       conteúdo rolável dentro de 306px de viewport). Com 'min-width: 100%', telas largas
       (poucas quadras) continuam preenchendo 100% via 'flex: 1' de '.columns'/'.column' —
       sem isso é regressão de desktop. */
    .grid {
      position: relative;
      display: flex;
      width: max-content;
      min-width: 100%;
    }

    /* Coluna de horário fixada: sticky em 'left', fundo opaco e z-index acima de
       '.hour-line'/'.columns'/'.block' (todos z-index automático) E acima de '.now-line'
       (z-index 5) — a barra "agora" passa a se mover na horizontal junto com a grade desde
       que existe rolagem, então sem isto ela atravessa por cima do rótulo de hora fixado a
       partir de qualquer scrollLeft > 0. Fica ABAIXO de '.court-header' (z-index 7): a
       ordem que o layout precisa é cabeçalho > gutter > now-line, e a caixa de altura cheia
       da gutter rola por baixo da faixa do cabeçalho sticky ao rolar verticalmente — sem
       este degrau, ela pintaria por cima e cortaria um 'hour-label' dentro do canto
       congelado. */
    .time-gutter {
      position: sticky;
      left: 0;
      width: 52px;
      flex: none;
      z-index: 6;
      background: var(--nx-surface-0);
    }

    .hour-label {
      position: absolute;
      left: 0;
      width: 42px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .hour-line {
      position: absolute;
      left: 52px;
      right: 0;
      border-top: 1px dotted var(--nx-line);
    }

    .hour-line.solid {
      border-top-style: solid;
    }

    /* Irmã real de '.time-gutter' no fluxo do flex (não mais overlay 'position: absolute')
       — é o que dá a '.grid' largura intrínseca de verdade; um overlay absoluto não
       contribui largura nenhuma pro bloco contentor (ver comentário de '.grid' acima). A
       causa do bug era o 'position: absolute', não o valor de 'flex' — 'flex: 1 1 auto' e o
       atalho 'flex: 1' ('flex-basis: 0%') dão o mesmo resultado aqui (medido: mesmo
       scrollWidth estreito e mesma largura de coluna larga nos dois), porque o §9.9.1 do
       spec de Flexbox já leva os fatores de flex em conta no cálculo do tamanho intrínseco
       do container. */
    .columns {
      flex: 1 1 auto;
      display: flex;
    }

    .column {
      flex: 1;
      position: relative;
      border-left: 1px solid var(--nx-line);
    }

    .block {
      position: absolute;
      left: 3px;
      right: 3px;
      box-sizing: border-box;
      border-radius: 8px;
      padding: 5px 8px;
      overflow: hidden;
      cursor: default;
      border: 1px solid;
    }

    .block.clickable {
      cursor: pointer;
    }

    .block.tone-available {
      background: transparent;
      border: 1px dashed var(--nx-line-strong);
    }

    .block.tone-available:hover {
      background: var(--nx-surface-1);
      border-color: var(--nx-text-dim);
    }

    .block.tone-available .block-title,
    .block.tone-available .block-time {
      color: var(--nx-text-dim);
    }

    .block.tone-confirmada {
      background: rgba(43, 209, 126, 0.12);
      border-color: rgba(43, 209, 126, 0.35);
      border-left: 3px solid var(--nx-win);
    }

    .block.tone-pendente {
      background: rgba(244, 197, 67, 0.12);
      border-color: rgba(244, 197, 67, 0.35);
      border-left: 3px solid var(--nx-pending);
    }

    .block.tone-bloqueado {
      background: rgba(255, 106, 26, 0.08);
      border-color: rgba(255, 106, 26, 0.3);
      border-left: 3px solid var(--nx-orange-500);
    }

    .block.tone-manutencao {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.14);
      border-left: 3px solid var(--nx-text-dim);
    }

    .block-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .block-time {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .now-line {
      position: absolute;
      left: 42px;
      right: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      pointer-events: none;
    }

    .now-line-bar {
      flex: 1;
      height: 2px;
      background: var(--nx-live);
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.6);
    }

    .now-line-dot {
      width: 7px;
      height: 7px;
      border-radius: 99px;
      background: var(--nx-live);
    }
  `,
})
export class AgendaGridComponent {
  readonly courts = input.required<AgendaCourt[]>();
  readonly blocks = input.required<AgendaBlock[]>();
  /** Cargo sem escrita em `agenda` (ex.: manutenção): horários disponíveis/bloqueados deixam
   *  de ser clicáveis — só reservados seguem abrindo o detalhe (ação de leitura). */
  readonly readOnly = input(false);
  readonly blockClick = output<string>();

  protected readonly minCourtColPx = MIN_COURT_COL_PX;

  private readonly nowMinutes = signal(nowInMinutes());

  protected readonly gridEndMin = computed(() => gridEndMinFor(this.blocks()));

  protected readonly rowCount = computed(
    () => (this.gridEndMin() - AGENDA_GRID_START_MIN) / AGENDA_SLOT_MIN,
  );

  protected readonly gridHeight = computed(() => this.rowCount() * AGENDA_ROW_HEIGHT + 10);

  protected readonly rowMarks = computed<RowMark[]>(() =>
    Array.from({ length: this.rowCount() }, (_, i) => {
      const minute = AGENDA_GRID_START_MIN + i * AGENDA_SLOT_MIN;
      return { offset: i * AGENDA_ROW_HEIGHT, isHour: minute % 60 === 0, label: formatMinutes(minute) };
    }),
  );

  protected readonly positionedByCourt = computed<Partial<Record<string, PositionedBlock[]>>>(() => {
    const result: Partial<Record<string, PositionedBlock[]>> = {};
    for (const b of this.blocks()) {
      const top = minutesToRowOffset(b.start) + 1;
      const height = (b.dur / AGENDA_SLOT_MIN) * AGENDA_ROW_HEIGHT - 3;
      const label = b.status === 'available' ? 'Disponível' : b.status === 'manutencao' ? 'Manutenção' : b.status === 'bloqueado' ? 'Bloqueado' : b.client;
      const timeLabel = `${formatMinutes(b.start)}–${formatMinutes(b.start + b.dur)}`;
      const positioned: PositionedBlock = { ...b, top, height, label, timeLabel };
      (result[b.courtId] ??= []).push(positioned);
    }
    return result;
  });

  protected isClickable(status: AgendaBlockStatus): boolean {
    if (NON_CLICKABLE.has(status)) return false;
    // available/bloqueado exigem escrita (bloquear/desbloquear); reservado só abre o
    // detalhe da reserva (leitura), então continua clicável mesmo sem escrita em agenda.
    if (this.readOnly() && (status === 'available' || status === 'bloqueado')) return false;
    return true;
  }

  /** -1 quando a hora atual está fora da janela 07:00–22:00 (linha "agora" não aparece). */
  protected readonly nowOffset = computed(() => {
    const minutes = this.nowMinutes();
    return isWithinGrid(minutes) ? minutesToRowOffset(minutes) : -1;
  });
}
