import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OG_JOGOS, OG_JOGO_LABEL, OG_JOGO_TONE } from '../data/mock-data';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { ChaveamentoSubnavComponent } from './chaveamento-subnav.component';

/** Lista de partidas da rodada — horário, confronto, placar, quadra e status. */
@Component({
  selector: 'og-jogos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgPillComponent, ChaveamentoSubnavComponent],
  template: `
    <og-page-header title="Jogos" subtitle="Liga Municipal de Beach Tennis · rodada 5">
      <a class="og-mini-btn og-mini-btn-primary" routerLink="/painel/chaveamento/agendamento"><og-icon name="plus" [size]="14" />Agendar partida</a>
    </og-page-header>

    <div class="og-content">
      <og-chaveamento-subnav active="jogos" />
      <og-card pad="0" flex="1">
        <div class="og-table-head">
          <span style="width:50px">Hora</span>
          <span style="flex:1">Partida</span>
          <span style="width:60px;text-align:center">Placar</span>
          <span style="width:90px">Quadra</span>
          <span style="width:100px">Status</span>
          <span style="width:70px"></span>
        </div>
        <div class="og-table-body">
          @for (j of jogos; track $index) {
            <div class="og-row">
              <span style="width:50px" class="og-jogos-time">{{ j.time }}</span>
              <span style="flex:1;display:flex;align-items:center;gap:8px;min-width:0">
                <span class="og-jogos-team">{{ j.a }}</span>
                <span class="og-jogos-vs">vs</span>
                <span class="og-jogos-team">{{ j.b }}</span>
              </span>
              <span style="width:60px;text-align:center" class="og-jogos-score">{{ j.sa }} – {{ j.sb }}</span>
              <span style="width:90px" class="og-jogos-quadra">{{ j.quadra }}</span>
              <span style="width:100px"><og-pill [tone]="jogoTone[j.status]">{{ jogoLabel[j.status] }}</og-pill></span>
              @if (j.status === 'agendado') {
                <button type="button" class="og-ghost-btn">Editar</button>
              } @else {
                <a class="og-ghost-btn" routerLink="/painel/chaveamento/placar">Placar</a>
              }
            </div>
          }
        </div>
      </og-card>
    </div>
  `,
  styles: `
    .og-jogos-time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-orange-500);
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
    .og-jogos-score {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .og-jogos-quadra {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class JogosComponent {
  protected readonly jogos = OG_JOGOS;
  protected readonly jogoTone = OG_JOGO_TONE;
  protected readonly jogoLabel = OG_JOGO_LABEL;
}
