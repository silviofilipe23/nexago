import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { compactTeamLabel, type PillTone } from '../data/mock-data';
import type { MatchDisplayStatus, TournamentMatch } from '../data/matches-repository';
import { formatCourtLabel, spDayLabel, spTimeLabel } from '../data/schedule-format';
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
 *  tempo real é da mesa e do portal do atleta).
 *
 *  No TABLET (card entre ~520px e ~980px, que é todo iPad em retrato e também o de paisagem
 *  com a sidebar fixa) a partida cabe em UMA linha: nome de cada atleta em dois nomes
 *  (`compactTeamLabel`), confronto sem quebra, e as colunas que não cabem saem em ordem — nº,
 *  fase e a linha de apoio somem, e o SELO DE STATUS passa a dividir a coluna do placar (ou
 *  existe placar, ou existe o motivo de não existir). HORÁRIO, confronto, placar, QUADRA e a
 *  ação ficam de pé até o telefone. O que sai da linha continua no `title` da célula do
 *  confronto. */
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
            <span class="col-status">Status</span>
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
                <span class="og-jogos-match" [title]="j.info">
                  <span class="og-jogos-teams">
                    <span class="og-jogos-team" [title]="j.match.team1Label">{{ compact(j.match.team1Label) }}</span>
                    <span class="og-jogos-vs">vs</span>
                    <span class="og-jogos-team" [title]="j.match.team2Label">{{ compact(j.match.team2Label) }}</span>
                  </span>
                  <!-- Linha de apoio: a fase, e o que as colunas soltarem quando o card aperta,
                       pra o dado descer em vez de sumir da tela (padrão da lista de inscrições).
                       APAGA na faixa do tablet, onde a partida tem de caber em uma linha. -->
                  <span class="og-jogos-meta">
                    <span class="m-num">#{{ j.match.matchNumber }} · </span>{{ j.meta }}<span class="m-court"> · {{ j.court }}</span
                    ><span class="m-score"> · {{ j.score }}</span><span class="m-status"> · {{ jogoLabel[j.status] }}</span>
                  </span>
                </span>
                <span class="og-jogos-score col-score">
                  @if (j.status === 'in_progress') {
                    <span class="og-dot og-dot-red og-dot-pulse only-tight"></span>
                  }
                  <span class="only-wide">{{ j.score }}</span>
                  @if (j.match.score) {
                    <span class="only-tight">{{ j.scoreTight }}</span>
                  } @else {
                    <!-- Sem placar, a coluna diz POR QUE não tem: é o selo de status, que na
                         faixa do tablet não cabe em coluna própria. -->
                    <span class="only-tight"><og-pill [tone]="jogoTone[j.status]">{{ jogoLabel[j.status] }}</og-pill></span>
                  }
                </span>
                <span class="og-jogos-quadra col-court" [title]="j.court"><span class="only-wide">{{ j.match.court ?? '—' }}</span><span class="only-tight">{{ j.courtShort }}</span></span>
                <span class="og-jogos-status col-status">
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
                    <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'placar', j.match.id]"
                      ><span class="only-wide">{{ j.status === 'scheduled' ? 'Lançar placar' : 'Placar' }}</span><span class="only-tight">Placar</span></a
                    >
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
      --jogos-cols: 40px 76px minmax(0, 1fr) 158px 88px 100px 190px;
    }

    .col-score {
      text-align: center;
    }

    .og-jogos-when {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    /* Confronto e linha de apoio no mesmo container: a de apoio nasce com 100% de base, então
       desce inteira quando existe, e some sem deixar buraco quando a faixa a apaga. */
    .og-jogos-match {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      column-gap: 10px;
      row-gap: 2px;
      min-width: 0;
    }

    .og-jogos-teams {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
      flex: 1 1 auto;
    }

    /* Nome nunca quebra: o que não couber vira reticências e o nome cheio fica no title.
       Os dois lados encolhem juntos, na proporção do que cada um ocupa. */
    .og-jogos-team {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .og-jogos-meta .m-score,
    .og-jogos-meta .m-status,
    .only-tight {
      display: none;
    }

    .og-jogos-meta {
      flex: 0 0 100%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Faixa do tablet: a partida inteira em UMA linha. O que sai (nº, fase, linha de apoio e a
       coluna de status) vira largura pro confronto. QUADRA FICA: é operação de quadra, o dono
       pediu de volta — ela custa ~56px do confronto e por isso vem no rótulo curto. */
    @container (max-width: 980px) {
      .og-jogos-grid {
        --jogos-cols: 52px minmax(0, 1fr) 136px 44px 140px;
        gap: 6px;
      }

      .og-table-head,
      .og-table-body {
        padding-left: 12px;
        padding-right: 12px;
      }

      .col-num,
      .col-status,
      .og-jogos-meta {
        display: none;
      }

      .og-jogos-teams {
        gap: 6px;
      }

      .og-jogos-team {
        font-size: 12.5px;
      }

      .og-jogos-day {
        font-size: 9.5px;
      }

      /* O selo de status divide a coluna do placar (flex pra caber o ponto de "ao vivo"). */
      .og-jogos-score {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 11.5px;
      }

      .only-wide {
        display: none;
      }

      .only-tight {
        display: inline-block;
      }

      /* Recuo lateral menor que os 16px do @media (pointer: coarse) do styles.scss: quem faz o
         alvo de toque é a ALTURA de 44px, que fica de pé. São ~16px que voltam pro confronto,
         com os botões ainda em ~70x44px — acima do mínimo de 44x44 da HIG/Material. */
      .og-mini-btn,
      .og-ghost-btn {
        padding-left: 10px;
        padding-right: 10px;
      }
    }

    /* Telefone: sem largura pra colunas, o que sobrou desce pra linha de apoio — a quadra
       inclusive, que até aqui aguenta coluna própria. */
    @container (max-width: 620px) {
      .og-jogos-grid {
        --jogos-cols: 54px minmax(0, 1fr) 136px 148px;
      }

      .col-court {
        display: none;
      }

      .og-jogos-meta {
        display: block;
        /* Aqui sobra altura e falta largura: a linha de apoio quebra em duas em vez de
           esconder metade atrás de reticências. */
        white-space: normal;
        overflow: visible;
      }

      .og-jogos-meta .m-num,
      .og-jogos-meta .m-court {
        display: inline;
      }
    }

    /* Telefone estreito: não cabem confronto E ação na mesma linha, então a ação desce pra
       segunda linha do próprio bloco da partida. */
    @container (max-width: 520px) {
      .og-jogos-grid {
        --jogos-cols: 54px minmax(0, 1fr);
        row-gap: 8px;
      }

      .col-score {
        display: none;
      }

      .og-jogos-when {
        grid-column: 1;
        grid-row: 1;
      }

      .og-jogos-match {
        grid-column: 2;
        grid-row: 1;
      }

      .og-jogos-actions {
        grid-column: 2;
        grid-row: 2;
        justify-content: flex-start;
      }

      .og-jogos-meta .m-score,
      .og-jogos-meta .m-status {
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
      flex: none;
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
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-jogos-quadra {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
  protected readonly compact = compactTeamLabel;

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
        const meta = catLabel ? `${roundLabel} · ${catLabel}` : roundLabel;
        const score = match.score ?? 'Não jogado';
        const court = formatCourtLabel(match.court) || 'Sem quadra';
        return {
          match,
          time: match.scheduledAt ? spTimeLabel(match.scheduledAt) : '—',
          day: match.scheduledAt ? spDayLabel(match.scheduledAt) : '',
          status,
          meta,
          score,
          // Placar do tablet sem a vírgula entre sets: são ~15px por set que voltam pro
          // confronto, e o hífen já separa os games.
          scoreTight: score.replace(/,\s*/g, ' '),
          court,
          // Coluna estreita do tablet: o cabeçalho já diz "Quadra", então a célula fica só com
          // o que distingue uma da outra ("Quadra 1" → "1"; "Central" segue "Central").
          courtShort: (match.court ?? '—').replace(/^quadra\s+/i, ''),
          info: `#${match.matchNumber} · ${meta} · ${court}`,
        };
      });
  });
}
