import { ChangeDetectionStrategy, Component } from '@angular/core';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

/** Análise pós-torneio (protótipo TrAnalisePosTorneioScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-analise-pos-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Análise pós-torneio" subtitle="Etapa Garden · Encerrado em 10/07" />

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Rating da equipe" value="+62" delta="No torneio" deltaTone="green" />
          <co-kpi-card label="Vitórias" value="5" delta="de 6 jogos" deltaTone="green" />
          <co-kpi-card label="Pódios" value="2" delta="Intermediário e Open" deltaTone="flat" />
        </div>
        <div class="grid">
          <co-panel-card title="Pontos fortes" kicker="Análise automática">
            <p class="text">Recepção consistente em todos os jogos. Duplas formadas pela IA tiveram 83% de aproveitamento.</p>
          </co-panel-card>
          <co-panel-card title="Pontos fracos" kicker="Análise automática">
            <p class="text">Bloqueio abaixo da média da categoria — recomenda-se treino específico nas próximas semanas.</p>
          </co-panel-card>
          <co-panel-card title="Comparação com torneio anterior">
            <co-row title="Aproveitamento">
              <span row-trailing class="stat win">+9pp</span>
            </co-row>
            <co-row title="Rating médio ganho" [last]="true">
              <span row-trailing class="stat win">+18</span>
            </co-row>
          </co-panel-card>
          <co-panel-card title="Treino recomendado" kicker="Sugestão da IA">
            <p class="text">Bloqueio duplo e leitura de ataque adversário.</p>
            <button type="button" class="co-mini-btn co-mini-btn-primary">Criar treino</button>
          </co-panel-card>
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .text {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      line-height: 1.6;
      margin: 0 0 10px;
    }
    .stat {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-win);
    }
  `,
})
export class PanelAnalisePosTorneioComponent {}
