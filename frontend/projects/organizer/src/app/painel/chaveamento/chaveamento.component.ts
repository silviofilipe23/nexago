import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { initialsOf, truncateName, type PillTone } from '../data/mock-data';
import type { MatchDisplayStatus, TournamentMatch } from '../data/matches-repository';
import { matchMetaLabel, matchScheduleLabel } from '../data/schedule-format';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { BRACKET_MATCH_WIDTH, type DoubleEliminationLayout, buildDoubleEliminationLayout, buildKnockoutTreeLayout, isDoubleElimination } from './bracket-tree';
import { ChaveamentoContextService } from './chaveamento-context.service';

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

/** Quebra o nome da dupla ("Martins / Silva") em até 2 nomes de atleta pro stack de avatares —
 *  mesmo separador que `initialsOf` já usa nas outras telas do organizer (categoria-detalhe,
 *  seeds). Rótulos sem "/" (equipe única, "A definir", "Vencedor Jogo #N") caem no fallback de
 *  1 avatar com o rótulo inteiro, igual já acontecia antes. */
function athleteNamesOf(teamLabel: string): string[] {
  const parts = teamLabel
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.slice(0, 2) : [teamLabel];
}

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
 *  nº do jogo + quadra no topo (`#2 · Quadra 1`), selo de status, avatar de iniciais por
 *  dupla, placar em sets e rodapé com data/hora + chip da quadra — card inteiro clicável
 *  pro placar. "Sortear chave" leva ao fluxo real de geração (seeds); só a exportação
 *  (PDF/imagem) segue mock — não existe no app também. */
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
      <!-- mock (fase 2): exportação de chave (PDF/imagem) ainda não existe no app nem na web -->
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="download" [size]="14" />Exportar</button>
    </og-page-header>

    <div class="og-content" style="overflow:auto">
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
        <div class="og-bracket-side" [class.winner]="m.winnerSide === 1">
          <span class="og-bracket-side-team">
            <span class="og-bracket-avatar-stack">
              @for (name of athleteNames(m.team1Label); track $index; let i = $index) {
                <og-avatar [initials]="initialsOf(name)" [size]="20" [style.margin-left.px]="i ? -8 : 0" [style.z-index]="2 - i" />
              }
            </span>
            <span class="og-bracket-side-name" [title]="m.team1Label">{{ truncate(m.team1Label) }}</span>
          </span>
          <span class="og-bracket-side-score">{{ sideScore(m, 1) }}</span>
        </div>
        <div class="og-bracket-side" [class.winner]="m.winnerSide === 2">
          <span class="og-bracket-side-team">
            <span class="og-bracket-avatar-stack">
              @for (name of athleteNames(m.team2Label); track $index; let i = $index) {
                <og-avatar [initials]="initialsOf(name)" [size]="20" [style.margin-left.px]="i ? -8 : 0" [style.z-index]="2 - i" />
              }
            </span>
            <span class="og-bracket-side-name" [title]="m.team2Label">{{ truncate(m.team2Label) }}</span>
          </span>
          <span class="og-bracket-side-score">{{ sideScore(m, 2) }}</span>
        </div>
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
        <div class="og-de-canvas" [style.width.px]="tree.width" [style.height.px]="tree.height">
          <svg class="og-de-lines" [attr.width]="tree.width" [attr.height]="tree.height">
            @for (e of tree.edges; track $index) {
              <path [attr.d]="e.d" />
            }
          </svg>
          @for (lbl of tree.labels; track lbl.key) {
            <div class="og-bracket-round-label og-de-col-label" [style.left.px]="lbl.left" [style.top.px]="lbl.top" [style.width.px]="matchWidth">{{ lbl.label }}</div>
          }
          @for (n of tree.nodes; track n.match.id) {
            @if (canOpenScore(n.match)) {
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
      }
    </div>
  `,
})
export class ChaveamentoComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly ctx = inject(ChaveamentoContextService);
  protected readonly matchWidth = BRACKET_MATCH_WIDTH;
  protected readonly initialsOf = initialsOf;
  protected readonly athleteNames = athleteNamesOf;
  protected readonly truncate = truncateName;

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
}
