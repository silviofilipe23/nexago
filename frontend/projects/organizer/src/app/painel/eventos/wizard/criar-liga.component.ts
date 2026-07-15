import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OgAddTileComponent } from '../../ui/add-tile.component';
import { OgCardComponent } from '../../ui/card.component';
import { OgCategoryCardComponent } from '../../ui/category-card.component';
import { OgDisplayInputComponent } from '../../ui/display-input.component';
import { OgFormFieldComponent } from '../../ui/form-field.component';
import { OgIconComponent } from '../../ui/icon.component';
import { OgPointsTableComponent } from '../../ui/points-table.component';
import { OgReviewRowComponent } from '../../ui/review-row.component';
import { OgStepperStaticComponent } from '../../ui/stepper-static.component';
import { OgToggleRowComponent } from '../../ui/toggle-row.component';
import { OgWizardShellComponent } from '../../ui/wizard-shell.component';

const TOTAL = 6;

interface StageRow {
  n: number;
  name: string;
  place: string;
  date: string;
  defined: boolean;
  final: boolean;
}

const STAGES: StageRow[] = [
  { n: 1, name: 'Etapa Goiânia', place: 'Goiânia', date: '21–23 Fev', defined: true, final: false },
  { n: 2, name: 'Open Anápolis', place: 'Anápolis', date: '14–16 Mar', defined: true, final: false },
  { n: 3, name: 'Etapa 3', place: 'Local a definir', date: 'Abr', defined: false, final: false },
  { n: 4, name: 'Etapa 4', place: 'Local a definir', date: 'Mai', defined: false, final: false },
  { n: 5, name: 'Etapa 5', place: 'Local a definir', date: 'Ago', defined: false, final: false },
  { n: 6, name: 'Grande Final', place: 'Goiânia', date: '11–13 Out', defined: true, final: true },
];

const RANKING_POINTS: [string, number][] = [
  ['1º lugar', 450], ['2º lugar', 280], ['3º lugar', 180], ['4º lugar', 120], ['Quartas', 80], ['Fase de grupos', 40],
];

const TITLES = ['', 'Identidade da liga', 'Temporada', 'Categorias da liga', 'Ranking & Grande Final', 'Etapas da temporada', 'Revisar a liga'];
const SUBTITLES = [
  '',
  'O circuito completo — as etapas você adiciona depois.',
  'O intervalo do circuito e quantas etapas você planeja.',
  'Valem para todas as etapas. Cada etapa pode abrir ou fechar uma delas.',
  'Como os pontos somam e quem chega à decisão.',
  'Adicione as etapas agora ou ao longo do ano.',
  'Publique para abrir o circuito. Etapas podem ser adicionadas depois.',
];

/** Wizard de criação de liga/circuito — 6 passos + calendário de etapas + revisão. */
@Component({
  selector: 'og-criar-liga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    OgWizardShellComponent,
    OgCardComponent,
    OgFormFieldComponent,
    OgDisplayInputComponent,
    OgStepperStaticComponent,
    OgToggleRowComponent,
    OgCategoryCardComponent,
    OgAddTileComponent,
    OgReviewRowComponent,
    OgPointsTableComponent,
    OgIconComponent,
  ],
  template: `
    @if (published()) {
      <div class="og-wizard-done" style="background:radial-gradient(60% 50% at 50% 30%, rgba(255,106,26,0.18) 0%, transparent 65%)">
        <div class="og-wizard-done-badge" style="background:var(--nx-orange-500);box-shadow:0 0 0 1px rgba(255,106,26,0.4),0 16px 48px rgba(255,106,26,0.30)">
          <og-icon name="flag" [size]="40" style="color:#0a0a0a" />
        </div>
        <div>
          <div class="og-wizard-done-kicker" style="color:var(--nx-orange-500)">Circuito no ar</div>
          <h1>Copa Goiás Beach 2026 começou!</h1>
          <p>A liga está visível no Competir. Abra as inscrições da próxima etapa quando quiser.</p>
        </div>
        <div class="og-wizard-done-actions">
          <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="download" [size]="14" />Ver página da liga</button>
          <a class="og-ghost-btn" routerLink="/painel/inicio">Voltar ao painel</a>
        </div>
      </div>
    } @else {
      <og-wizard-shell
        [flow]="'Criar liga'"
        [total]="6"
        [step]="step()"
        [title]="title()"
        [subtitle]="subtitle()"
        [ctaLabel]="ctaLabel()"
        (cta)="onCta()"
        (back)="onBack()"
      >
        @switch (step()) {
          @case (1) {
            <og-card title="Detalhes">
              <div class="og-field-grid">
                <og-form-field label="Esporte"><og-display-input value="Vôlei de praia" /></og-form-field>
                <og-form-field label="Nome da liga"><og-display-input value="Copa Goiás Beach 2026" /></og-form-field>
                <div class="span-2"><og-form-field label="Organização"><og-display-input value="Federação Goiana de Vôlei de Praia" /></og-form-field></div>
              </div>
              <div style="margin-top:16px">
                <og-form-field label="Imagem de capa"><div class="og-dropzone">JPG ou PNG · proporção 16:9</div></og-form-field>
              </div>
              <div style="margin-top:16px">
                <og-form-field label="Descrição (opcional)">
                  <div class="og-textarea">Circuito estadual oficial. As 16 melhores duplas do ranking garantem vaga na Grande Final em outubro.</div>
                </og-form-field>
              </div>
            </og-card>
          }
          @case (2) {
            <og-card kicker="Período" title="Duração da temporada">
              <div class="og-field-grid">
                <og-form-field label="Começa em"><og-display-input value="Fev 2026" /></og-form-field>
                <og-form-field label="Termina em"><og-display-input value="Out 2026" /></og-form-field>
              </div>
            </og-card>
            <og-card kicker="Estrutura" title="Etapas">
              <og-stepper-static label="Etapas planejadas" value="6" suffix="etapas" />
              <div style="margin-top:14px">
                <og-toggle-row title="Encerrar com Grande Final" desc="Uma etapa final reúne os melhores do ranking." [on]="true" />
              </div>
            </og-card>
            <div class="og-banner">Cada etapa é um <strong>torneio completo</strong> com chave própria. O ranking soma os resultados ao longo da temporada.</div>
          }
          @case (3) {
            <og-card title="Categorias herdadas">
              <div style="display:flex;flex-direction:column;gap:12px">
                <og-category-card name="Masculino Open" [tags]="['Masc', 'Dupla', 'Open']" vagas="32 / etapa" price="R$ 90" format="Herdado" />
                <og-category-card name="Feminino Open" [tags]="['Fem', 'Dupla', 'Open']" vagas="24 / etapa" price="R$ 90" format="Herdado" />
                <og-category-card name="Misto Sub-23" [tags]="['Misto', 'Dupla', 'Sub-23']" vagas="16 / etapa" price="R$ 70" format="Herdado" />
                <og-add-tile label="Adicionar categoria" sub="Aplicada a todas as etapas" />
              </div>
            </og-card>
          }
          @case (4) {
            <og-card kicker="Cálculo" title="Ranking geral">
              <og-form-field label="Etapas que contam"><og-display-input value="4 melhores de 6 etapas" /></og-form-field>
              <div style="margin-top:14px">
                <og-form-field label="Tabela de pontuação"><og-display-input value="Padrão circuito estadual" /></og-form-field>
              </div>
              <div class="og-points-box"><og-points-table [pts]="rankingPoints" /></div>
            </og-card>
            <og-card kicker="Classificação" title="Grande Final">
              <div class="og-field-grid">
                <og-stepper-static label="Vagas na Grande Final" value="16" suffix="duplas" />
              </div>
              <div style="margin-top:14px">
                <og-toggle-row title="Vagas de convite (wildcard)" desc="Reserve vagas para indicação da organização." [on]="true" />
              </div>
            </og-card>
          }
          @case (5) {
            <og-card kicker="2 de 6 definidas" title="Calendário">
              <div style="display:grid;gap:10px">
                @for (s of stages; track s.n) {
                  <div class="og-liga-stage-row" [class.final]="s.final">
                    <div class="og-liga-stage-badge" [class.final]="s.final">
                      @if (s.final) {
                        <og-icon name="flag" [size]="16" />
                      } @else {
                        {{ s.n }}
                      }
                    </div>
                    <div style="flex:1">
                      <div class="og-liga-stage-name-row">
                        <span class="og-liga-stage-name" [class.final]="s.final">{{ s.name }}</span>
                        @if (s.final) {
                          <span class="og-liga-stage-final-badge">FINAL</span>
                        }
                      </div>
                      <div class="og-liga-stage-meta">{{ s.place }} · {{ s.date }}</div>
                    </div>
                    @if (s.defined) {
                      <og-icon name="chevron" [size]="16" style="color:var(--nx-text-dim)" />
                    } @else {
                      <span class="og-liga-stage-todo">A definir</span>
                    }
                  </div>
                }
                <og-add-tile label="Adicionar etapa" sub="Herda categorias, formato e ranking" />
              </div>
            </og-card>
          }
          @case (6) {
            <og-card title="Copa Goiás Beach 2026">
              <og-review-row label="Temporada" value="Fevereiro a Outubro 2026 · 6 etapas + Grande Final" />
              <og-review-row label="Categorias" value="3 categorias herdadas por todas as etapas" />
              <og-review-row label="Ranking" value="Soma das 4 melhores de 6 · tabela do circuito estadual" />
              <og-review-row label="Grande Final" value="16 vagas por ranking + 2 wildcards" />
              <og-review-row label="Etapas" value="2 de 6 com local e data definidos" />
            </og-card>
          }
        }
      </og-wizard-shell>
    }
  `,
  styles: `
    .og-liga-stage-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 13px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-liga-stage-row.final {
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-liga-stage-badge {
      width: 34px;
      height: 34px;
      border-radius: 9px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }
    .og-liga-stage-badge.final {
      background: var(--nx-orange-500);
      color: #0a0a0a;
    }
    .og-liga-stage-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .og-liga-stage-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .og-liga-stage-name.final {
      color: var(--nx-orange-500);
    }
    .og-liga-stage-final-badge {
      padding: 2px 7px;
      border-radius: 5px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .og-liga-stage-meta {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }
    .og-liga-stage-todo {
      font-family: var(--nx-font-display);
      font-size: 11px;
      font-weight: 600;
      color: var(--nx-pending);
    }
  `,
})
export class CriarLigaComponent {
  protected readonly step = signal(1);
  protected readonly published = signal(false);
  protected readonly stages = STAGES;
  protected readonly rankingPoints = RANKING_POINTS;

  protected readonly title = computed(() => TITLES[this.step()]);
  protected readonly subtitle = computed(() => SUBTITLES[this.step()]);
  protected readonly ctaLabel = computed(() => {
    if (this.step() === 3) return 'Continuar · 3 categorias';
    if (this.step() === TOTAL) return 'Publicar liga';
    return 'Continuar';
  });

  protected onCta(): void {
    if (this.step() < TOTAL) {
      this.step.update((s) => s + 1);
      return;
    }
    this.published.set(true);
  }

  protected onBack(): void {
    if (this.step() > 1) {
      this.step.update((s) => s - 1);
    }
  }
}
