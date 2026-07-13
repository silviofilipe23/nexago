import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

/** Relatórios (protótipo TrRelatoriosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-relatorios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Relatórios" subtitle="Gerar relatório">
        <button type="button" class="co-mini-btn">
          <co-icon name="download" [size]="14" />
          Excel
        </button>
        <button type="button" class="co-mini-btn co-mini-btn-primary">
          <co-icon name="download" [size]="14" />
          PDF
        </button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Configurar relatório" kicker="Escopo e período">
          <div class="field"><div class="f-label">Escopo</div><div class="f-value">Equipe Adulto Masculino</div></div>
          <div class="field"><div class="f-label">Período</div><div class="f-value">Mensal — julho de 2026</div></div>
          <div class="field"><div class="f-label">Incluir</div><div class="f-value">Presença, avaliações, rating e resultados</div></div>
        </co-panel-card>

        <co-panel-card title="Pré-visualização" kicker="Relatório mensal · Equipe Adulto Masculino">
          <co-row title="Frequência média">
            <span row-trailing class="stat">86%</span>
          </co-row>
          <co-row title="Rating médio">
            <span row-trailing class="stat">1.978</span>
          </co-row>
          <co-row title="Vitórias × derrotas">
            <span row-trailing class="stat">18–7</span>
          </co-row>
          <co-row title="Pódios no período" [last]="true">
            <span row-trailing class="stat win">3</span>
          </co-row>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 16px;
      min-height: 0;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }
    .field:last-child {
      margin-bottom: 0;
    }
    .f-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .f-value {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
    .stat {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .stat.win {
      color: var(--nx-win);
    }
  `,
})
export class PanelRelatoriosComponent {}
