import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { kocColumnLabel, kocHasStarted, kocLiveOrder, kocPointsOf } from '../data/koc';
import { truncateName, type PillTone } from '../data/mock-data';
import type { MatchDisplayStatus, TournamentMatch } from '../data/matches-repository';
import { matchMetaLabel, matchScheduleLabel } from '../data/schedule-format';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import {
  fetchBracketFaces,
  facesForTeam,
  type BracketFace,
} from './bracket-faces';
import {
  BRACKET_MATCH_WIDTH,
  type DoubleEliminationLayout,
  buildDoubleEliminationLayout,
  buildKnockoutTreeLayout,
  isDoubleElimination,
} from './bracket-tree';
import { ChaveamentoContextService } from './chaveamento-context.service';
import {
  BRACKET_ZOOM_DEFAULT,
  BRACKET_ZOOM_MAX,
  BRACKET_ZOOM_MIN,
  clampBracketZoom,
  scrollAfterBracketZoom,
  stepBracketZoom,
  wheelBracketZoom,
} from './chaveamento-zoom';

const STATUS_TONE: Record<MatchDisplayStatus, PillTone> = {
  scheduled: 'orange',
  in_progress: 'red',
  completed: 'green',
  canceled: 'dim',
};

const STATUS_LABEL: Record<MatchDisplayStatus, string> = {
  scheduled: 'Agendado',
  in_progress: 'Ao vivo',
  completed: 'Finalizado',
  canceled: 'Cancelado',
};

/** Conta quantos sets cada lado venceu a partir do placar formatado ("2-1, 3-2, …") — mesma
 *  lógica de `PlacarComponent.setsWonA/B`, aqui reaproveitada pro número exibido em cada card
 *  da chave (placar em sets, não o placar de games do set). */
function setsWonOf(score: string): [number, number] {
  let a = 0;
  let b = 0;
  for (const pair of score.split(',')) {
    const [sa, sb] = pair.trim().split('-').map((n) => Number(n) || 0);
    if (sa > sb) a++;
    else if (sb > sa) b++;
  }
  return [a, b];
}

/** Chave de mata-mata da categoria selecionada — dados reais (`listMatches`, Task O6).
 *
 *  Dupla eliminação (`matchType` WB/LB gravado por `category-bracket-builders.ts`) ganha a
 *  árvore completa (`bracket-tree.ts`, porta do layout canônico do app
 *  `double_elimination_bracket_layout.dart`): canvas único com o track da WB em cima —
 *  incluindo 3º Lugar e Final como colunas à direita, a Final centralizada no track — e o da
 *  LB embaixo; jogos em ordem de matchNumber com espaçamento binário, conectores dos ponteiros
 *  reais de avanço dentro de cada chave. Eliminatória simples e grupos+mata-mata (sem ponteiro
 *  salvo) continuam com o bracket genérico em coluna única.
 *
 *  Card da partida espelha o que o app mostra no card da árvore (`BracketMatchNode`, Flutter):
 *  nº do jogo + quadra no topo (`#2 · Quadra 1`), selo de status, avatar com foto quando o
 *  perfil tem (senão iniciais), placar em sets e rodapé com data/hora — card inteiro clicável
 *  pro placar. "Sortear chave" leva ao fluxo real de geração (seeds); só a exportação
 *  (PDF/imagem) segue mock — não existe no app também.
 *
 *  Zoom no desktop: botões ± no header e Ctrl/Cmd + scroll (mantém o ponto sob o cursor),
 *  espelhando o `InteractiveViewer` do app sem engolir o pan normal da chave. */
@Component({
  selector: 'og-chaveamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    OgPageHeaderComponent,
    OgIconComponent,
    OgAvatarComponent,
    OgPillComponent,
  ],
  template: `
    <og-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()">
      @if (seedsLink(); as link) {
        <a class="og-mini-btn" [routerLink]="link"><og-icon name="whistle" [size]="14" />Sortear chave</a>
      }
      @if (treeLayout()) {
        <div class="og-bracket-zoom" role="group" aria-label="Zoom da chave">
          <button
            type="button"
            class="og-mini-btn og-bracket-zoom-btn"
            [disabled]="zoom() <= zoomMin"
            title="Diminuir zoom"
            aria-label="Diminuir zoom"
            (click)="zoomOut()"
          >
            −
          </button>
          <button
            type="button"
            class="og-mini-btn og-bracket-zoom-pct"
            title="Voltar a 100%"
            aria-label="Resetar zoom para 100%"
            (click)="resetZoom()"
          >
            {{ zoomPercent() }}%
          </button>
          <button
            type="button"
            class="og-mini-btn og-bracket-zoom-btn"
            [disabled]="zoom() >= zoomMax"
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
            (click)="zoomIn()"
          >
            +
          </button>
        </div>
      }
      <!-- mock (fase 2): exportação de chave (PDF/imagem) ainda não existe no app nem na web -->
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="download" [size]="14" />Exportar</button>
    </og-page-header>

    <div
      #viewport
      class="og-content og-bracket-scroll"
      (wheel)="onWheel($event)"
    >
      <ng-template #cardBody let-m>
        <div class="og-bracket-match-head">
          <span class="og-bracket-match-num">{{ metaLabel(m) }}</span>
          <og-pill [tone]="statusTone(m)">
            @if (m.status === 'in_progress') {
              <span class="og-dot og-dot-red og-dot-pulse"></span>
            }
            {{ statusLabel(m) }}
          </og-pill>
        </div>
        @if (m.koc; as round) {
          <!-- Rodada King of the Court: o card mostra o ELENCO, não dois lados.
               Enquanto a fase anterior não termina o elenco não existe — e aí
               o que descreve a chave são as VAGAS ("1º Rodada 1"), que é
               justamente o que se quer ler numa chave. -->
          <div class="og-bracket-koc">
            <span class="og-bracket-koc-phase">{{ kocCardLabel(m) }}</span>
            @for (entry of kocEntries(m); track $index) {
              <div class="og-bracket-koc-row" [class.slot]="entry.isSlot">
                <span class="og-bracket-koc-place">{{ $index + 1 }}</span>
                <span class="og-bracket-koc-name" [title]="entry.label">{{ truncate(entry.label) }}</span>
                @if (entry.points !== null) {
                  <span class="og-bracket-koc-pts">{{ entry.points }}</span>
                }
              </div>
            } @empty {
              <div class="og-bracket-koc-row slot">
                <span class="og-bracket-koc-name">Elenco a definir</span>
              </div>
            }
          </div>
        } @else {
        <div class="og-bracket-side" [class.winner]="m.winnerSide === 1">
          <span class="og-bracket-side-team">
            <span class="og-bracket-avatar-stack">
              @for (face of facesFor(m.teamAId, m.team1Label); track $index; let i = $index; let n = $count) {
                <og-avatar
                  zoomable
                  [initials]="face.initials"
                  [photoUrl]="face.photoUrl"
                  [personName]="face.name"
                  [meta]="m.team1Label"
                  [size]="32"
                  [style.margin-left.px]="i ? -12 : 0"
                  [style.z-index]="n - i"
                />
              }
            </span>
            <span class="og-bracket-side-name" [title]="m.team1Label">{{ truncate(m.team1Label) }}</span>
          </span>
          <span class="og-bracket-side-score">{{ sideScore(m, 1) }}</span>
        </div>
        <div class="og-bracket-side" [class.winner]="m.winnerSide === 2">
          <span class="og-bracket-side-team">
            <span class="og-bracket-avatar-stack">
              @for (face of facesFor(m.teamBId, m.team2Label); track $index; let i = $index; let n = $count) {
                <og-avatar
                  zoomable
                  [initials]="face.initials"
                  [photoUrl]="face.photoUrl"
                  [personName]="face.name"
                  [meta]="m.team2Label"
                  [size]="32"
                  [style.margin-left.px]="i ? -12 : 0"
                  [style.z-index]="n - i"
                />
              }
            </span>
            <span class="og-bracket-side-name" [title]="m.team2Label">{{ truncate(m.team2Label) }}</span>
          </span>
          <span class="og-bracket-side-score">{{ sideScore(m, 2) }}</span>
        </div>
        }
        <div class="og-bracket-match-sched" [class.set]="!!m.scheduledAt">
          <span class="og-bracket-sched-when">
            @if (m.scheduledAt) {
              <og-icon name="clock" [size]="11" />
            }
            <span>{{ scheduleLabel(m) }}</span>
          </span>
        </div>
      </ng-template>

      @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando chave…</div>
      } @else if (knockoutMatches().length === 0) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chave ainda não gerada pra esta categoria.</div>
      } @else if (treeLayout(); as tree) {
        <!-- Espaço reservado = canvas × zoom: o transform scale não ocupa layout, então
             sem este wrapper o scroll cortaria o conteúdo ampliado. -->
        <div
          class="og-bracket-zoom-space"
          [style.width.px]="tree.width * zoom()"
          [style.height.px]="tree.height * zoom()"
        >
          <div
            class="og-de-canvas"
            [style.width.px]="tree.width"
            [style.height.px]="tree.height"
            [style.transform]="'scale(' + zoom() + ')'"
          >
            <svg class="og-de-lines" [attr.width]="tree.width" [attr.height]="tree.height">
              @for (e of tree.edges; track $index) {
                <path [attr.d]="e.d" />
              }
            </svg>
            @for (lbl of tree.labels; track lbl.key) {
              <div class="og-bracket-round-label og-de-col-label" [style.left.px]="lbl.left" [style.top.px]="lbl.top" [style.width.px]="matchWidth">{{ lbl.label }}</div>
            }
            @for (n of tree.nodes; track n.match.id) {
              @if (n.match.koc; as round) {
                <!-- Rodada: o destino é a MESA (elenco, fila, tabela), não o
                     placar por sets, que não existe aqui. -->
                @if (round.teamIds.length > 0) {
                  <a
                    class="og-bracket-match og-de-match"
                    [style.left.px]="n.left"
                    [style.top.px]="n.top"
                    [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'ao-vivo', n.match.id]"
                  >
                    <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: n.match }" />
                  </a>
                } @else {
                  <div
                    class="og-bracket-match og-de-match is-pending"
                    [style.left.px]="n.left"
                    [style.top.px]="n.top"
                    title="Elenco definido quando a fase anterior terminar"
                  >
                    <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: n.match }" />
                  </div>
                }
              } @else if (canOpenScore(n.match)) {
                <a
                  class="og-bracket-match og-de-match"
                  [style.left.px]="n.left"
                  [style.top.px]="n.top"
                  [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'placar', n.match.id]"
                >
                  <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: n.match }" />
                </a>
              } @else {
                <div
                  class="og-bracket-match og-de-match is-pending"
                  [style.left.px]="n.left"
                  [style.top.px]="n.top"
                  title="Aguardando as duas equipes pra lançar placar"
                >
                  <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: n.match }" />
                </div>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    /* A chave é um canvas de largura fixa (a árvore não reflui — os conectores SVG
       são desenhados em coordenadas absolutas), então no tablet ela se navega por
       arrasto mesmo. O que precisa de cuidado é o encadeamento: sem
       \`overscroll-behavior\`, chegar na borda da chave passa o arrasto adiante e o
       iOS rola a página (ou dispara o "voltar" do gesto de borda) no meio do pan. */
    .og-bracket-scroll {
      overflow: auto;
      overscroll-behavior: contain;
      touch-action: pan-x pan-y;
      -webkit-overflow-scrolling: touch;
    }
    /* Card da rodada KOTC: lista de elenco, não dois lados. */
    .og-bracket-koc {
      display: flex;
      flex-direction: column;
      gap: 3px;
      /* Mesmo recuo lateral do lado do duelo, pro card não trocar de
         alinhamento entre o duelo e a rodada. */
      padding: 8px 12px 6px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-bracket-koc-phase {
      font-size: 10px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 2px;
    }
    .og-bracket-koc-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .og-bracket-koc-row.slot {
      color: var(--nx-text-dim);
      font-style: italic;
    }
    .og-bracket-koc-place {
      min-width: 12px;
      color: var(--nx-text-dim);
      font-size: 11px;
    }
    .og-bracket-koc-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-bracket-koc-pts {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .og-bracket-zoom-space {
      position: relative;
      flex: none;
    }
    .og-bracket-zoom-space .og-de-canvas {
      transform-origin: 0 0;
    }
    /* Controles de zoom só no desktop com ponteiro fino — no touch o pan
       já cobre a navegação e botões extras competem com Exportar. */
    .og-bracket-zoom {
      display: none;
      align-items: center;
      gap: 2px;
    }
    @media (hover: hover) and (pointer: fine) {
      .og-bracket-zoom {
        display: inline-flex;
      }
    }
    .og-bracket-zoom-btn {
      min-width: 32px;
      padding-inline: 0;
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
    }
    .og-bracket-zoom-pct {
      min-width: 52px;
      font-family: var(--nx-font-mono);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ChaveamentoComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly ctx = inject(ChaveamentoContextService);
  protected readonly matchWidth = BRACKET_MATCH_WIDTH;
  protected readonly truncate = truncateName;
  protected readonly zoomMin = BRACKET_ZOOM_MIN;
  protected readonly zoomMax = BRACKET_ZOOM_MAX;

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');

  /** Escala do canvas (1 = 100%). Reseta ao trocar de categoria. */
  protected readonly zoom = signal(BRACKET_ZOOM_DEFAULT);
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  /** Fotos por `teamId` — hidratadas sob demanda a partir de `teams` + `public_profiles`. */
  private readonly facesByTeam = signal<ReadonlyMap<string, BracketFace[]>>(new Map());
  private readonly hydratedTeamIds = new Set<string>();
  private hydrateGeneration = 0;

  constructor() {
    effect(() => {
      const matches = this.knockoutMatches();
      void this.hydrateFaces(matches);
    });
    // Trocar de categoria (ou de torneio) não deve herdar o zoom da chave anterior —
    // a árvore muda de tamanho e o usuário espera partir de 100%.
    effect(() => {
      this.catId();
      this.id();
      this.zoom.set(BRACKET_ZOOM_DEFAULT);
    });
  }

  protected facesFor(teamId: string, fallbackLabel: string): BracketFace[] {
    return facesForTeam(this.facesByTeam(), teamId, fallbackLabel);
  }

  /** Título do card da rodada — a fase já está no cabeçalho da coluna, então
   *  aqui vale o número da rodada dentro dela. */
  protected kocCardLabel(m: TournamentMatch): string {
    const round = m.koc;
    if (!round) return '';
    const n = round.roundLabel > 0 ? round.roundLabel : m.matchNumber;
    return kocColumnLabel(m.matchType) === 'Classificatória' ? `Rodada ${n}` : kocColumnLabel(m.matchType);
  }

  /** Linhas do card: o elenco quando existe, senão as VAGAS que a fase anterior
   *  vai preencher. Pontos só depois de a rodada começar — antes disso um zero
   *  na chave passaria por resultado. */
  protected kocEntries(m: TournamentMatch): { label: string; points: number | null; isSlot: boolean }[] {
    const round = m.koc;
    if (!round) return [];
    if (round.teamIds.length === 0) {
      return round.qualifierSlots.map((label) => ({ label, points: null, isSlot: true }));
    }
    const started = kocHasStarted(round);
    const order = started ? kocLiveOrder(round) : round.teamIds;
    return order.map((teamId) => ({
      label: this.kocTeamLabel(teamId),
      points: started ? kocPointsOf(round, teamId) : null,
      isSlot: false,
    }));
  }

  /** Nome da dupla a partir dos rostos já hidratados — o mesmo mapa que os
   *  avatares usam, para a chave não abrir uma segunda fonte de nomes. */
  private kocTeamLabel(teamId: string): string {
    const faces = this.facesByTeam().get(teamId) ?? [];
    const names = faces.map((f) => f.name.trim().split(/\s+/)[0] ?? '').filter((n) => n.length > 0);
    return names.length > 0 ? names.join(' / ') : 'Dupla';
  }

  private async hydrateFaces(matches: TournamentMatch[]): Promise<void> {
    const ids = [
      // O elenco entra aqui porque a rodada KOTC grava os dois lados VAZIOS:
      // colher só `teamAId`/`teamBId` deixaria a chave inteira sem nomes.
      ...new Set(matches.flatMap((m) => [m.teamAId, m.teamBId, ...(m.koc?.teamIds ?? [])])),
    ].filter((id) => id.length > 0 && !this.hydratedTeamIds.has(id));
    if (ids.length === 0) return;

    const generation = ++this.hydrateGeneration;
    for (const id of ids) this.hydratedTeamIds.add(id);
    try {
      const fetched = await fetchBracketFaces(ids);
      if (generation !== this.hydrateGeneration) return;
      this.facesByTeam.update((current) => {
        const next = new Map(current);
        for (const [teamId, faces] of fetched) next.set(teamId, faces);
        return next;
      });
    } catch {
      // Falha de rede: cards ficam com iniciais e a próxima mudança de partidas tenta de novo.
      if (generation === this.hydrateGeneration) {
        for (const id of ids) this.hydratedTeamIds.delete(id);
      }
    }
  }

  protected statusTone(m: TournamentMatch): PillTone {
    return STATUS_TONE[m.status];
  }

  protected metaLabel(m: TournamentMatch): string {
    return matchMetaLabel(m);
  }

  protected scheduleLabel(m: TournamentMatch): string {
    return matchScheduleLabel(m);
  }

  /** Placar só com as duas duplas definidas — slot vazio ainda é placeholder
   *  ("Vencedor Jogo #N" / "A definir") e o servidor rejeitaria o submit. */
  protected canOpenScore(m: TournamentMatch): boolean {
    return m.teamAId.length > 0 && m.teamBId.length > 0;
  }

  protected statusLabel(m: TournamentMatch): string {
    return STATUS_LABEL[m.status];
  }

  protected readonly headerTitle = computed(() => (isDoubleElimination(this.knockoutMatches()) ? 'Chaveamento · dupla eliminação' : 'Chaveamento'));

  /** Link pro fluxo real de sorteio/geração — só com torneio + categoria selecionados e
   *  enquanto a chave AINDA NÃO existe (categoria sem jogos). Regerar uma chave publicada é
   *  operação destrutiva (apaga resultados) e sai do caminho comum — o botão some. */
  protected readonly seedsLink = computed<string[] | null>(() => {
    const tid = this.ctx.selectedTournamentId();
    const cid = this.ctx.selectedCategoryId();
    if (!tid || !cid) return null;
    if (this.ctx.matchesFiltered().length > 0) return null;
    return ['/painel/eventos', tid, 'categorias', cid, 'seeds'];
  });

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    if (!t) return '';
    const cat = this.ctx.categoryName();
    return cat ? `${t.name} · categoria ${cat}` : t.name;
  });

  /** Partidas de mata-mata da categoria selecionada — exclui fase de grupos (ver GruposComponent, que usa o mesmo rótulo "Grupo "). */
  protected readonly knockoutMatches = computed<TournamentMatch[]>(() => this.ctx.matchesFiltered().filter((m) => !m.round?.startsWith('Grupo ')));

  /** Árvore da chave — DE quando há partidas WB/LB; senão a árvore do mata-mata simples
   *  (mesmo visual, ligações posicionais/ponteiros — ver `buildKnockoutTreeLayout`). */
  protected readonly treeLayout = computed<DoubleEliminationLayout | null>(() => {
    if (!this.ctx.selectedCategoryId()) return null;
    const matches = this.knockoutMatches();
    return buildDoubleEliminationLayout(matches) ?? buildKnockoutTreeLayout(matches);
  });

  protected sideScore(m: TournamentMatch, side: 1 | 2): number | string {
    if (!m.score) return '–';
    const [a, b] = setsWonOf(m.score);
    return side === 1 ? a : b;
  }

  protected zoomIn(): void {
    this.applyZoom(stepBracketZoom(this.zoom(), 1));
  }

  protected zoomOut(): void {
    this.applyZoom(stepBracketZoom(this.zoom(), -1));
  }

  protected resetZoom(): void {
    this.applyZoom(BRACKET_ZOOM_DEFAULT);
  }

  /** Ctrl/Cmd + scroll: zoom em direção ao cursor. Sem modificador, deixa o pan
   *  nativo do overflow rolar a chave. */
  protected onWheel(event: WheelEvent): void {
    if (!this.treeLayout()) return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) {
      this.zoom.set(wheelBracketZoom(this.zoom(), event.deltaY));
      return;
    }
    const rect = viewport.getBoundingClientRect();
    this.applyZoom(wheelBracketZoom(this.zoom(), event.deltaY), {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  }

  private applyZoom(
    next: number,
    anchor?: { offsetX: number; offsetY: number },
  ): void {
    const prev = this.zoom();
    const clamped = clampBracketZoom(next);
    if (clamped === prev) return;
    this.zoom.set(clamped);
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) return;
    const offsetX = anchor?.offsetX ?? viewport.clientWidth / 2;
    const offsetY = anchor?.offsetY ?? viewport.clientHeight / 2;
    const nextScroll = scrollAfterBracketZoom({
      prevZoom: prev,
      nextZoom: clamped,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      offsetX,
      offsetY,
    });
    // O layout do wrapper só atualiza no próximo frame — aplicar o scroll
    // antes deixaria o browser clampar no tamanho antigo.
    requestAnimationFrame(() => {
      viewport.scrollLeft = nextScroll.scrollLeft;
      viewport.scrollTop = nextScroll.scrollTop;
    });
  }
}
