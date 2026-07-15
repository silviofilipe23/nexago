import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OG_EVENTOS, OG_STATUS_LABEL, OG_STATUS_TONE } from '../data/mock-data';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgLineChartComponent } from '../ui/line-chart.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

const PROXIMOS_JOGOS = [
  { time: '09:00', partida: 'Duo Martins/Silva vs Duo Costa/Reis', evento: 'Liga Beach Tennis', quadra: 'Quadra 2' },
  { time: '10:30', partida: 'Equipe Norte vs Equipe Sul', evento: 'Liga Beach Tennis', quadra: 'Quadra 1' },
  { time: '14:00', partida: 'Ana/Bia vs Carla/Duda', evento: 'Liga Beach Tennis', quadra: 'Quadra 3' },
];

/** Dashboard geral: KPIs, receita mensal, eventos ativos, agenda e avisos. */
@Component({
  selector: 'og-panel-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgPillComponent, OgLineChartComponent],
  template: `
    <og-page-header title="Início" subtitle="Liga Amadora Goiânia · visão geral">
      <div class="og-search-box"><og-icon name="search" [size]="15" /><span>Buscar…</span></div>
      <button type="button" class="og-bell-btn"><og-icon name="bell" [size]="17" /><span class="dot"></span></button>
      <a class="og-mini-btn og-mini-btn-primary" routerLink="/painel/novo-torneio"><og-icon name="plus" [size]="14" />Criar evento</a>
    </og-page-header>

    <div class="og-content">
      <div class="og-kpi-row">
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Eventos ativos</div>
          <div class="og-kpi-value">{{ ativos.length }}</div>
          <div class="og-kpi-sub">2 em inscrições</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Inscritos no total</div>
          <div class="og-kpi-value">{{ totalInscritos }}</div>
          <div class="og-kpi-sub green">+18 esta semana</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Arrecadado (ano)</div>
          <div class="og-kpi-value">R$ {{ totalReceita.toLocaleString('pt-BR') }}</div>
          <div class="og-kpi-sub green">+R$ 1.400 vs mês anterior</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Jogos hoje</div>
          <div class="og-kpi-value">3</div>
          <div class="og-kpi-sub">Próximo às 09:00</div>
        </og-card>
      </div>

      <div class="og-inicio-grid">
        <og-card kicker="Arrecadação" title="Receita mensal">
          <og-line-chart [data]="[420, 680, 540, 900, 1180, 1400, 1620]" [labels]="['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']" />
          <div class="og-inicio-eventos-label">Meus eventos</div>
          @for (e of ativos; track e.id) {
            <a class="og-inicio-evento-row" [routerLink]="['/painel/eventos', e.id]">
              <span class="og-inicio-evento-icon"><og-icon name="trophy" [size]="18" /></span>
              <span class="og-inicio-evento-body">
                <span class="og-inicio-evento-name">{{ e.name }}</span>
                <span class="og-inicio-evento-meta">{{ e.kind }} · {{ e.sport }} · {{ e.inicio }}</span>
              </span>
              <span class="og-inicio-evento-progress">
                <span class="row">
                  <span class="lbl">Inscritos</span>
                  <span class="val">{{ e.inscritos }}/{{ e.vagas }}</span>
                </span>
                <span class="og-progress"><span [style.width.%]="(e.inscritos / e.vagas) * 100"></span></span>
              </span>
              <og-pill [tone]="statusTone[e.status]">{{ statusLabel[e.status] }}</og-pill>
              <span class="og-ghost-btn">Abrir</span>
            </a>
          }
        </og-card>

        <div class="og-inicio-side">
          <og-card kicker="Agenda" title="Próximos jogos">
            <button card-action type="button" class="og-ghost-btn">Ver todos</button>
            @for (j of proximosJogos; track j.time; let last = $last) {
              <div class="og-inicio-jogo-row" [class.last]="last">
                <span class="time">{{ j.time }}</span>
                <span class="body">
                  <span class="partida">{{ j.partida }}</span>
                  <span class="meta">{{ j.evento }} · {{ j.quadra }}</span>
                </span>
              </div>
            }
          </og-card>

          <og-card kicker="Comunicação" title="Avisos recentes" flex="1">
            <div class="og-inicio-aviso-row">
              <span class="og-dot og-dot-yellow"></span>
              <div>
                <div class="txt">3 inscrições pendentes de pagamento — Copa Verão</div>
                <div class="time">há 2 horas</div>
              </div>
            </div>
            <div class="og-inicio-aviso-row">
              <span class="og-dot"></span>
              <div>
                <div class="txt">Rodada 5 da Liga Beach Tennis publicada</div>
                <div class="time">ontem</div>
              </div>
            </div>
          </og-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .og-inicio-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      flex: 1;
      min-height: 0;
    }
    .og-inicio-eventos-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin: 18px 0 10px;
    }
    .og-inicio-evento-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
      text-decoration: none;
      color: inherit;
    }
    .og-inicio-evento-row:last-child {
      border-bottom: none;
    }
    .og-inicio-evento-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }
    .og-inicio-evento-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-inicio-evento-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .og-inicio-evento-meta {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-inicio-evento-progress {
      width: 130px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .og-inicio-evento-progress .row {
      display: flex;
      justify-content: space-between;
    }
    .og-inicio-evento-progress .lbl {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-inicio-evento-progress .val {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text);
    }
    .og-inicio-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
    }
    .og-inicio-jogo-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-inicio-jogo-row.last {
      border-bottom: none;
    }
    .og-inicio-jogo-row .time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-orange-500);
      width: 44px;
    }
    .og-inicio-jogo-row .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .og-inicio-jogo-row .partida {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-inicio-jogo-row .meta {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-inicio-aviso-row {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }
    .og-inicio-aviso-row .txt {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-inicio-aviso-row .time {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }
  `,
})
export class PanelInicioComponent {
  protected readonly ativos = OG_EVENTOS.filter((e) => e.status !== 'concluido');
  protected readonly totalInscritos = OG_EVENTOS.reduce((s, e) => s + e.inscritos, 0);
  protected readonly totalReceita = OG_EVENTOS.reduce((s, e) => s + e.receita, 0);
  protected readonly proximosJogos = PROXIMOS_JOGOS;
  protected readonly statusTone = OG_STATUS_TONE;
  protected readonly statusLabel = OG_STATUS_LABEL;
}
