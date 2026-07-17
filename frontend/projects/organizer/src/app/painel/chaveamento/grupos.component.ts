import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { truncateName } from '../data/mock-data';
import { buildGroupStandings, type GroupStanding, type TournamentMatch } from '../data/matches-repository';
import { spDayLabel, spTimeLabel } from '../data/schedule-format';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

interface GrupoReal {
  label: string;
  standings: GroupStanding[];
  matches: TournamentMatch[];
}

/** Fase de grupos — jogos reais agrupados por pool + CLASSIFICAÇÃO ao vivo (V/D, saldo de
 *  sets, pontos), a mesma conta do athlete/app (`buildGroupStandings`, que espelha
 *  `tournament_group_standings_logic.dart`: vitórias → saldo de sets → saldo de games, 2 pts
 *  por vitória; sem head-to-head, que é regra do servidor no fechamento). Os N primeiros
 *  (qualifiersPerGroup da categoria) ganham destaque de classificação — consistente com o
 *  crossover que a geração de chave usa. "Sortear grupos & gerar chave" leva ao fluxo real. */
@Component({
  selector: 'og-grupos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgIconComponent],
  template: `
    <og-page-header title="Fase de grupos" [subtitle]="headerSubtitle()">
      @if (seedsLink(); as link) {
        <a class="og-mini-btn og-mini-btn-primary" [routerLink]="link"><og-icon name="whistle" [size]="14" />Sortear grupos & gerar chave</a>
      }
    </og-page-header>

    <div class="og-content">
      @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando jogos…</div>
      } @else if (ctx.tournaments().length > 0 && ctx.matches().length === 0) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chaves ainda não geradas</div>
      } @else if (grupos().length > 0) {
        <div class="og-grupos-grid">
          @for (g of grupos(); track g.label) {
            <og-card kicker="Fase de grupos" [title]="g.label" pad="0">
              <div class="og-grupos-head">
                <span style="width:22px">#</span>
                <span style="flex:1">Dupla</span>
                <span class="num">V</span>
                <span class="num">D</span>
                <span class="num wide">Sets</span>
                <span class="num">Pts</span>
              </div>
              @for (s of g.standings; track s.teamId; let i = $index) {
                <div class="og-grupos-row" [class.classified]="i < qualifiersPerGroup()">
                  <span class="og-grupos-pos" [class.top]="i < qualifiersPerGroup()">{{ i + 1 }}</span>
                  <span class="og-grupos-team-name" [title]="s.teamLabel">{{ truncate(s.teamLabel) }}</span>
                  <span class="og-grupos-cell num">{{ s.wins }}</span>
                  <span class="og-grupos-cell num dim">{{ s.losses }}</span>
                  <span class="og-grupos-cell num wide dim">{{ s.setsWon }}-{{ s.setsLost }}</span>
                  <span class="og-grupos-cell num strong">{{ s.points }}</span>
                </div>
              }
              <div class="og-grupos-subhead">
                <span style="flex:1">Confronto</span>
                <span style="width:74px">Quando</span>
                <span style="width:70px;text-align:center">Placar</span>
                <span style="width:70px">Quadra</span>
              </div>
              @for (m of g.matches; track m.id) {
                <div class="og-grupos-row">
                  <span class="og-grupos-teams" [title]="m.team1Label + ' × ' + m.team2Label">{{ truncate(m.team1Label, 18) }} <em>×</em> {{ truncate(m.team2Label, 18) }}</span>
                  <span class="og-grupos-when" style="width:74px">
                    @if (m.scheduledAt) {
                      <span class="time">{{ timeLabel(m.scheduledAt) }}</span>
                      <span class="day">{{ dayLabel(m.scheduledAt) }}</span>
                    } @else {
                      <span class="day">Sem horário</span>
                    }
                  </span>
                  <span class="og-grupos-cell" style="width:70px;text-align:center">{{ m.score ?? 'Não jogado' }}</span>
                  <span class="og-grupos-cell dim" style="width:70px">{{ m.court ?? '—' }}</span>
                </div>
              }
            </og-card>
          }
        </div>
      } @else {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Nenhum jogo de grupo nesta categoria</div>
      }
    </div>
  `,
  styles: `
    .og-grupos-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 900px) {
      .og-grupos-grid {
        grid-template-columns: 1fr;
      }
    }
    .og-grupos-head,
    .og-grupos-subhead {
      display: flex;
      gap: 10px;
      padding: 12px 18px;
      border-bottom: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-grupos-subhead {
      border-top: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
    }
    .og-grupos-head .num,
    .og-grupos-cell.num {
      width: 26px;
      text-align: center;
    }
    .og-grupos-head .num.wide,
    .og-grupos-cell.num.wide {
      width: 44px;
    }
    .og-grupos-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 18px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-grupos-row:last-child {
      border-bottom: none;
    }
    .og-grupos-row.classified {
      background: rgba(43, 209, 126, 0.05);
    }
    .og-grupos-pos {
      width: 22px;
      height: 22px;
      border-radius: 7px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-grupos-pos.top {
      background: rgba(43, 209, 126, 0.18);
      color: var(--nx-win);
    }
    .og-grupos-team-name {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-grupos-teams {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 500;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-grupos-teams em {
      font-style: normal;
      color: var(--nx-text-dim);
      margin: 0 3px;
    }
    .og-grupos-cell {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text);
      flex: none;
    }
    .og-grupos-cell.dim {
      color: var(--nx-text-dim);
    }
    .og-grupos-cell.strong {
      font-weight: 700;
    }
    .og-grupos-when {
      flex: none;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .og-grupos-when .time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text);
    }
    .og-grupos-when .day {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
  `,
})
export class GruposComponent {
  protected readonly ctx = inject(ChaveamentoContextService);
  protected readonly timeLabel = spTimeLabel;
  protected readonly dayLabel = spDayLabel;
  protected readonly truncate = truncateName;

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    if (!t) return '';
    const cat = this.ctx.categoryName();
    return cat ? `${t.name} · categoria ${cat}` : t.name;
  });

  /** Link pro fluxo real de sorteio/geração — só com torneio + categoria selecionados e
   *  enquanto a chave AINDA NÃO existe (categoria sem jogos); depois de gerada, some. */
  protected readonly seedsLink = computed<string[] | null>(() => {
    const tid = this.ctx.selectedTournamentId();
    const cid = this.ctx.selectedCategoryId();
    if (!tid || !cid) return null;
    if (this.ctx.matchesFiltered().length > 0) return null;
    return ['/painel/eventos', tid, 'categorias', cid, 'seeds'];
  });

  /** Quantos classificam por grupo — config real da categoria selecionada (default 2, igual
   *  ao servidor). Com "todas as categorias" selecionadas usa o default. */
  protected readonly qualifiersPerGroup = computed(() => {
    const catId = this.ctx.selectedCategoryId();
    if (!catId) return 2;
    return this.ctx.tournament()?.categories.find((c) => c.id === catId)?.qualifiersPerGroup ?? 2;
  });

  protected readonly grupos = computed<GrupoReal[]>(() => {
    const groupMatches = this.ctx.matchesFiltered().filter((m) => m.round?.startsWith('Grupo '));
    // Agrupa por categoria + pool: "Grupo A" existe em TODA categoria, então com "todas as
    // categorias" selecionadas os pools homônimos não podem se fundir numa tabela só.
    const categoryNameOf = new Map((this.ctx.tournament()?.categories ?? []).map((c) => [c.id, c.name]));
    const showCategory = this.ctx.selectedCategoryId() === null;
    const byKey = new Map<string, { label: string; matches: TournamentMatch[] }>();
    for (const m of groupMatches) {
      const key = `${m.categoryId ?? ''}:${m.round!}`;
      const catPrefix = showCategory ? `${categoryNameOf.get(m.categoryId ?? '') ?? 'Sem categoria'} · ` : '';
      const entry = byKey.get(key) ?? { label: `${catPrefix}${m.round!}`, matches: [] };
      entry.matches.push(m);
      byKey.set(key, entry);
    }
    return [...byKey.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ label, matches }) => ({
        label,
        standings: buildGroupStandings(matches),
        matches: [...matches].sort((a, b) => a.matchNumber - b.matchNumber),
      }));
  });
}
