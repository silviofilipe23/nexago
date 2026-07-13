import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

const FAQ_PROMPTS = [
  'Quais atletas mais evoluíram este mês?',
  'Quem está faltando muito?',
  'Quem deveria subir de categoria?',
  'Quem pode jogar Open?',
  'Sugira duplas para o próximo torneio.',
  'Monte um treino focado em recepção.',
];

interface DifferentialLink {
  title: string;
  description: string;
  route: string;
}

const DIFFERENTIALS: DifferentialLink[] = [
  { title: 'Evolução do rating', description: 'Linha do tempo completa de um atleta', route: '/painel/ia/evolucao-rating' },
  { title: 'Recomendação de categoria', description: 'Análise automática de promoção', route: '/painel/ia/recomendacao-categoria' },
  { title: 'Descoberta de talentos', description: 'Atletas promissores da região', route: '/painel/ia/descoberta-talentos' },
  { title: 'Gestão de metas', description: 'Metas individuais e coletivas', route: '/painel/ia/gestao-metas' },
  { title: 'Análise pós-torneio', description: 'Relatório automático após cada torneio', route: '/painel/ia/analise-pos-torneio' },
];

/** IA do treinador (protótipo TrIaScreen) — tela mock, sem Firestore. Ganha uma seção
 *  "Diferenciais do ecossistema" que não existe no protótipo original, centralizando
 *  o acesso às 5 telas de diferencial em vez de espalhar botões por Atletas/Torneios.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-ia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AthleteAvatarComponent, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="IA do treinador" subtitle="Assistente de decisões da comissão técnica" />

      <div class="body">
        <div class="grid">
          <co-panel-card title="Perguntas frequentes" kicker="Toque para perguntar">
            @for (p of faqPrompts; track p) {
              <div class="prompt">{{ p }}</div>
            }
          </co-panel-card>

          <div class="answer-column">
            <co-panel-card class="question-card">
              <div class="question-row">
                <co-icon name="sparkle" [size]="18" style="color: var(--nx-orange-500)" />
                <div class="question-text">"Quem deveria subir de categoria?"</div>
              </div>
            </co-panel-card>

            <co-panel-card title="Resposta da IA" kicker="Baseado em rating, evolução e resultados">
              <co-row title="Ana Beatriz" sub="Dominante na categoria Intermediário há 3 torneios">
                <co-athlete-avatar row-avatar initials="AB" [size]="34" status="ativo" />
                <co-pill row-trailing tone="green">Subir para Open</co-pill>
              </co-row>
              <co-row title="Lucas Ramos" sub="Rating estável, aguardar retorno da lesão" [last]="true">
                <co-athlete-avatar row-avatar initials="LR" [size]="34" status="lesionado" />
                <co-pill row-trailing tone="dim">Manter</co-pill>
              </co-row>
            </co-panel-card>
          </div>
        </div>

        <co-panel-card title="Diferenciais do ecossistema" kicker="Inteligência NexaGO">
          <div class="diff-grid">
            @for (d of differentials; track d.route) {
              <a class="diff-card" [routerLink]="d.route">
                <div class="diff-title">{{ d.title }}</div>
                <div class="diff-desc">{{ d.description }}</div>
              </a>
            }
          </div>
        </co-panel-card>
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
    .grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 16px;
    }
    .prompt {
      padding: 9px 13px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-bottom: 8px;
    }
    .prompt:last-child {
      margin-bottom: 0;
    }
    .answer-column {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .question-card {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .question-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .question-text {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .diff-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
    }
    .diff-card {
      display: block;
      padding: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      text-decoration: none;
      cursor: pointer;
    }
    .diff-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      margin-bottom: 5px;
    }
    .diff-desc {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-mute);
      line-height: 1.4;
    }
  `,
})
export class PanelIaComponent {
  protected readonly faqPrompts = FAQ_PROMPTS;
  protected readonly differentials = DIFFERENTIALS;
}
