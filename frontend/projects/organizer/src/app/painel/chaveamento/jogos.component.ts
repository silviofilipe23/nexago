import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { truncateName, type PillTone } from '../data/mock-data';
import type { MatchDisplayStatus, TournamentMatch } from '../data/matches-repository';
import { spDayLabel, spTimeLabel } from '../data/schedule-format';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

const JOGO_TONE: Record<MatchDisplayStatus, PillTone> = { scheduled: 'orange', in_progress: 'red', completed: 'dim', canceled: 'dim' };
const JOGO_LABEL: Record<MatchDisplayStatus, string> = { scheduled: 'Agendado', in_progress: 'Ao vivo', completed: 'Encerrado', canceled: 'Cancelado' };

/** Lista de partidas — dados reais de `listMatches` (Task O6): horário, confronto, placar,
 *  quadra e status REAL do doc (incluindo "Ao vivo" quando a mesa está rodando). Cada linha
 *  leva pra mesa ao vivo (`ao-vivo/:matchId` — iniciar/marcar ponto a ponto) e pro placar
 *  completo (`placar/:matchId`). O status só atualiza no reload (a lista segue one-shot;
 *  tempo real é da mesa e do portal do atleta). */
@Component({
  selector: 'og-jogos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgPillComponent],
  template: `
    <og-page-header title="Jogos & placares" [subtitle]="headerSubtitle()">
      <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'agendamento']"><og-icon name="plus" [size]="14" />Agendar partida</a>
    </og-page-header>

    <div class="og-content">
      @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
        <og-card pad="0" flex="1">
          <div class="og-table-body">
            @for (i of [1, 2, 3]; track i) {
              <div class="og-row"><div class="og-skeleton-line" style="width:100%"></div></div>
            }
          </div>
        </og-card>
      } @else if (ctx.tournaments().length > 0 && ctx.matches().length === 0) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chaves ainda não geradas</div>
      } @else {
        <og-card pad="0" flex="1" class="og-jogos-card">
          <div class="og-table-head og-jogos-grid">
            <span class="col-num">Nº</span>
            <span>Quando</span>
            <span>Partida</span>
            <span class="col-score">Placar</span>
            <span class="col-court">Quadra</span>
            <span>Status</span>
            <span></span>
          </div>
          <div class="og-table-body">
            @for (j of jogos(); track j.match.id) {
              <div class="og-row og-jogos-grid">
                <span class="og-jogos-number col-num">#{{ j.match.matchNumber }}</span>
                <span class="og-jogos-when">
                  <span class="og-jogos-time">{{ j.time }}</span>
                  @if (j.day) {
                    <span class="og-jogos-day">{{ j.day }}</span>
                  }
                </span>
                <span class="og-jogos-match">
                  <span class="og-jogos-teams">
                    <span class="og-jogos-team" [title]="j.match.team1Label">{{ truncate(j.match.team1Label, 20) }}</span>
                    <span class="og-jogos-vs">vs</span>
                    <span class="og-jogos-team" [title]="j.match.team2Label">{{ truncate(j.match.team2Label, 20) }}</span>
                  </span>
                  <!-- Linha de apoio: recebe o que as colunas soltarem quando o card aperta,
                       pra o dado descer em vez de sumir da tela (padrão da lista de inscrições).
                       Cada pedaço nasce oculto e só acende no @container que derruba a coluna. -->
                  <span class="og-jogos-meta">
                    <span class="m-num">#{{ j.match.matchNumber }} · </span>{{ j.meta }}<span class="m-court"> · quadra {{ j.match.court ?? '—' }}</span
                    ><span class="m-score"> · {{ j.match.score ?? 'Não jogado' }}</span>
                  </span>
                </span>
                <span class="og-jogos-score col-score">{{ j.match.score ?? 'Não jogado' }}</span>
                <span class="og-jogos-quadra col-court">{{ j.match.court ?? '—' }}</span>
                <span class="og-jogos-status">
                  @if (j.status === 'in_progress') {
                    <span class="og-dot og-dot-red og-dot-pulse"></span>
                  }
                  <og-pill [tone]="jogoTone[j.status]">{{ jogoLabel[j.status] }}</og-pill>
                </span>
                @if (canOpenScore(j.match)) {
                  <span class="og-jogos-actions">
                    @if (j.status === 'in_progress') {
                      <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'ao-vivo', j.match.id]">Ao vivo</a>
                    } @else if (j.status === 'scheduled') {
                      <a class="og-mini-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'ao-vivo', j.match.id]">Iniciar</a>
                    }
                    <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'placar', j.match.id]">{{ j.status === 'scheduled' ? 'Lançar placar' : 'Placar' }}</a>
                  </span>
                } @else {
                  <span class="og-jogos-actions">
                    <span class="og-ghost-btn" style="opacity:0.45;pointer-events:none" title="Aguardando as duas equipes">Aguardando</span>
                  </span>
                }
              </div>
            } @empty {
              <p class="og-empty">Nenhum jogo nesta categoria</p>
            }
          </div>
        </og-card>
      }
    </div>
  `,
  styles: `
    /* Cabeçalho e linha declaram as colunas no MESMO lugar (a variável), senão saem
       do prumo assim que uma delas muda — o erro que a antiga tabela em flex tinha,
       com as larguras repetidas inline nos dois. */
    .og-jogos-card {
      container-type: inline-size;
    }

    .og-jogos-grid {
      display: grid;
      grid-template-columns: var(--jogos-cols);
      gap: 14px;
      align-items: center;
      --jogos-cols: 40px 76px minmax(0, 1fr) 110px 90px 100px 170px;
    }

    .col-score {
      text-align: center;
    }

    .og-jogos-when {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .og-jogos-match {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .og-jogos-teams {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .og-jogos-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .og-jogos-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
    }

    .og-jogos-meta .m-num,
    .og-jogos-meta .m-court,
    .og-jogos-meta .m-score {
      display: none;
    }

    /* Ordem de queda pelo que decide a operação em quadra: quadra e nº são
       referência, placar se lê no card do confronto, mas HORÁRIO, quem joga,
       status e o botão de ação ficam até o fim. */
    @container (max-width: 900px) {
      .og-jogos-grid {
        --jogos-cols: 40px 76px minmax(0, 1fr) 110px 100px 170px;
      }

      .col-court {
        display: none;
      }

      .og-jogos-meta .m-court {
        display: inline;
      }
    }

    @container (max-width: 760px) {
      .og-jogos-grid {
        --jogos-cols: 76px minmax(0, 1fr) 110px 100px 154px;
      }

      .col-num {
        display: none;
      }

      .og-jogos-meta .m-num {
        display: inline;
      }
    }

    @container (max-width: 620px) {
      .og-jogos-grid {
        --jogos-cols: 76px minmax(0, 1fr) 100px 154px;
      }

      .col-score {
        display: none;
      }

      .og-jogos-meta .m-score {
        display: inline;
      }
    }

    .og-jogos-number {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-jogos-time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-orange-500);
    }
    .og-jogos-day {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
    .og-jogos-team {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-jogos-vs {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-jogos-meta {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-jogos-score {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-jogos-quadra {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 16px 18px;
      margin: 0;
    }
    .og-skeleton-line {
      height: 34px;
      border-radius: 6px;
      background: var(--nx-surface-1);
      position: relative;
      overflow: hidden;
    }
    .og-skeleton-line::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, var(--nx-surface-2), transparent);
      animation: og-shimmer 1.2s infinite;
    }
    @keyframes og-shimmer {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(100%);
      }
    }
  `,
})
export class JogosComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly ctx = inject(ChaveamentoContextService);
  protected readonly jogoTone = JOGO_TONE;
  protected readonly jogoLabel = JOGO_LABEL;
  protected readonly truncate = truncateName;

  protected canOpenScore(m: TournamentMatch): boolean {
    return m.teamAId.length > 0 && m.teamBId.length > 0;
  }

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    if (!t) return '';
    const cat = this.ctx.categoryName();
    return cat ? `${t.name} · categoria ${cat}` : `${t.name} · todas as categorias`;
  });

  protected readonly jogos = computed(() => {
    const t = this.ctx.tournament();
    const categoryNameOf = new Map((t?.categories ?? []).map((c) => [c.id, c.name]));
    const showCategory = this.ctx.selectedCategoryId() === null;

    return [...this.ctx.matchesFiltered()]
      .sort((a, b) => a.matchNumber - b.matchNumber)
      .map((match) => {
        const status = match.status;
        const roundLabel = match.round ?? '—';
        const catLabel = showCategory ? (categoryNameOf.get(match.categoryId ?? '') ?? 'Sem categoria') : null;
        return {
          match,
          time: match.scheduledAt ? spTimeLabel(match.scheduledAt) : '—',
          day: match.scheduledAt ? spDayLabel(match.scheduledAt) : '',
          status,
          meta: catLabel ? `${roundLabel} · ${catLabel}` : roundLabel,
        };
      });
  });
}
