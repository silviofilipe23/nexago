import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TournamentMatch } from '../data/matches-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ChaveamentoContextService } from './chaveamento-context.service';
import { ChaveamentoSelectorComponent } from './chaveamento-selector.component';
import { ChaveamentoSubnavComponent } from './chaveamento-subnav.component';

interface GrupoReal {
  label: string;
  matches: TournamentMatch[];
}

/** Fase de grupos — jogos reais (`listMatches`) agrupados pelo rótulo de pool ("Grupo A",
 *  "Grupo B", …) que `matches-repository.ts` já deriva de `poolId`. A classificação
 *  (V/D/saldo de sets/pontos) do protótipo NÃO é recomputada aqui: esse cálculo é regra de
 *  negócio com desempates (confronto direto, saldos) que já vive em
 *  `functions/src/group-standings.ts` — duplicá-la no front, sem os teamIds (o contrato de
 *  `TournamentMatch` só expõe labels de texto), arriscaria divergir do critério oficial. Em
 *  vez disso mostramos os confrontos do grupo com placar/quadra/horário reais. Sorteio de
 *  grupos e fechamento de chave continuam mock/fase 2 (operação real fica no app). */
@Component({
  selector: 'og-grupos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgIconComponent, ChaveamentoSubnavComponent, ChaveamentoSelectorComponent],
  template: `
    <og-page-header title="Fase de grupos" [subtitle]="headerSubtitle()">
      @if (seedsLink(); as link) {
        <a class="og-mini-btn og-mini-btn-primary" [routerLink]="link"><og-icon name="whistle" [size]="14" />Sortear grupos & gerar chave</a>
      }
    </og-page-header>

    <div class="og-content">
      <og-chaveamento-subnav active="grupos" />
      <og-chaveamento-selector />

      @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando jogos…</div>
      } @else if (ctx.tournaments().length > 0 && ctx.matches().length === 0) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chaves ainda não geradas</div>
      } @else if (grupos().length > 0) {
        <div class="og-grupos-grid">
          @for (g of grupos(); track g.label) {
            <og-card kicker="Fase de grupos" [title]="g.label" pad="0">
              <div class="og-grupos-head">
                <span style="flex:1">Confronto</span>
                <span style="width:70px;text-align:center">Placar</span>
                <span style="width:70px">Quadra</span>
              </div>
              @for (m of g.matches; track m.id) {
                <div class="og-grupos-row">
                  <span class="og-grupos-teams">{{ m.team1Label }} <em>×</em> {{ m.team2Label }}</span>
                  <span class="og-grupos-cell">{{ m.score ?? 'Não jogado' }}</span>
                  <span class="og-grupos-cell dim">{{ m.court ?? '—' }}</span>
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
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-grupos-head {
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
      width: 70px;
      text-align: center;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text);
    }
    .og-grupos-cell.dim {
      color: var(--nx-text-dim);
    }
  `,
})
export class GruposComponent {
  protected readonly ctx = inject(ChaveamentoContextService);

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    if (!t) return '';
    const cat = this.ctx.categoryName();
    return cat ? `${t.name} · categoria ${cat}` : t.name;
  });

  /** Link pro fluxo real de sorteio/geração — precisa de torneio + categoria selecionados. */
  protected readonly seedsLink = computed<string[] | null>(() => {
    const tid = this.ctx.selectedTournamentId();
    const cid = this.ctx.selectedCategoryId();
    return tid && cid ? ['/painel/eventos', tid, 'categorias', cid, 'seeds'] : null;
  });

  protected readonly grupos = computed<GrupoReal[]>(() => {
    const groupMatches = this.ctx.matchesFiltered().filter((m) => m.round?.startsWith('Grupo '));
    const byLabel = new Map<string, TournamentMatch[]>();
    for (const m of groupMatches) {
      const label = m.round!;
      const list = byLabel.get(label) ?? [];
      list.push(m);
      byLabel.set(label, list);
    }
    return [...byLabel.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, matches]) => ({ label, matches }));
  });
}
