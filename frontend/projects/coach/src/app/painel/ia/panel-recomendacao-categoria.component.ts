import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

interface AnalysisCard {
  title: string;
  description: string;
  tone: 'win' | 'pending' | 'live';
}

const ANALYSIS: AnalysisCard[] = [
  { title: 'Dominante na categoria', description: '9 pódios em 14 torneios no Intermediário', tone: 'win' },
  { title: 'Recomendado subir', description: 'Rating 2.015, acima da média do Open (1.960)', tone: 'pending' },
  { title: 'Não atende ao Open ainda', description: 'Não se aplica a esta atleta — critério de referência', tone: 'live' },
];

/** Recomendação de categoria (protótipo TrRecomendacaoCategoriaScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-recomendacao-categoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Recomendação de categoria" subtitle="Ana Beatriz · Análise automática" />

      <div class="body">
        <co-panel-card pad="lg" class="highlight-card">
          <div class="highlight-row">
            <co-athlete-avatar initials="AB" [size]="48" status="ativo" />
            <div class="highlight-body">
              <div class="highlight-title">Dominante na categoria Intermediário</div>
              <div class="highlight-desc">Recomendado subir para Open — critérios de rating e resultados atendidos</div>
            </div>
            <button type="button" class="co-mini-btn co-mini-btn-primary">Aprovar promoção</button>
          </div>
        </co-panel-card>

        <div class="grid">
          @for (a of analysis; track a.title) {
            <co-panel-card pad="sm">
              <div class="analysis-title" [class]="'tone-' + a.tone">{{ a.title }}</div>
              <div class="analysis-desc">{{ a.description }}</div>
            </co-panel-card>
          }
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
    }
    .highlight-card {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .highlight-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .highlight-body {
      flex: 1;
    }
    .highlight-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .highlight-desc {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .analysis-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .analysis-title.tone-win { color: var(--nx-win); }
    .analysis-title.tone-pending { color: var(--nx-pending); }
    .analysis-title.tone-live { color: var(--nx-live); }
    .analysis-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }
  `,
})
export class PanelRecomendacaoCategoriaComponent {
  protected readonly analysis = ANALYSIS;
}
