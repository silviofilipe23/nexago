import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PillTone } from '../data/mock-data';
import type { TournamentMatch } from '../data/matches-repository';
import { spDayLabel, spTimeLabel } from '../data/schedule-format';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

type JogoStatus = 'encerrado' | 'agendado';

const JOGO_TONE: Record<JogoStatus, PillTone> = { encerrado: 'dim', agendado: 'orange' };
const JOGO_LABEL: Record<JogoStatus, string> = { encerrado: 'Encerrado', agendado: 'Agendado' };

/** Lista de partidas — dados reais de `listMatches` (Task O6): horário, confronto, placar,
 *  quadra e status (encerrado quando há placar, agendado quando não). Não existe conceito de
 *  "ao vivo" no modelo `TournamentMatch` (só placar final ou nulo), então essa 3ª variação do
 *  protótipo não é reproduzida aqui. Agendar/editar partida continuam mock/fase 2. */
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
        <og-card pad="0" flex="1">
          <div class="og-table-head">
            <span style="width:76px">Quando</span>
            <span style="flex:1">Partida</span>
            <span style="width:110px;text-align:center">Placar</span>
            <span style="width:90px">Quadra</span>
            <span style="width:100px">Status</span>
            <span style="width:70px"></span>
          </div>
          <div class="og-table-body">
            @for (j of jogos(); track j.match.id) {
              <div class="og-row">
                <span style="width:76px;display:flex;flex-direction:column;gap:1px">
                  <span class="og-jogos-time">{{ j.time }}</span>
                  @if (j.day) {
                    <span class="og-jogos-day">{{ j.day }}</span>
                  }
                </span>
                <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0">
                  <span style="display:flex;align-items:center;gap:8px">
                    <span class="og-jogos-team">{{ j.match.team1Label }}</span>
                    <span class="og-jogos-vs">vs</span>
                    <span class="og-jogos-team">{{ j.match.team2Label }}</span>
                  </span>
                  <span class="og-jogos-meta">{{ j.meta }}</span>
                </span>
                <span style="width:110px;text-align:center" class="og-jogos-score">{{ j.match.score ?? 'Não jogado' }}</span>
                <span style="width:90px" class="og-jogos-quadra">{{ j.match.court ?? '—' }}</span>
                <span style="width:100px"><og-pill [tone]="jogoTone[j.status]">{{ jogoLabel[j.status] }}</og-pill></span>
                <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'placar', j.match.id]">{{ j.status === 'agendado' ? 'Lançar placar' : 'Placar' }}</a>
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
      .sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity))
      .map((match) => {
        const status: JogoStatus = match.score != null ? 'encerrado' : 'agendado';
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
