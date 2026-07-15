import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OgAddTileComponent } from '../../ui/add-tile.component';
import { OgCardComponent } from '../../ui/card.component';
import { OgCategoryCardComponent } from '../../ui/category-card.component';
import { OgChipsMultiComponent } from '../../ui/chips-multi.component';
import { OgDisplayInputComponent } from '../../ui/display-input.component';
import { OgFormFieldComponent } from '../../ui/form-field.component';
import { OgIconComponent } from '../../ui/icon.component';
import { OgPointsTableComponent } from '../../ui/points-table.component';
import { OgRadioRowComponent } from '../../ui/radio-row.component';
import { OgReviewRowComponent } from '../../ui/review-row.component';
import { OgSelectChipsComponent } from '../../ui/select-chips.component';
import { OgStepperStaticComponent } from '../../ui/stepper-static.component';
import { OgToggleRowComponent } from '../../ui/toggle-row.component';
import { OgWizardShellComponent } from '../../ui/wizard-shell.component';

type SubView = 'categoria' | 'premio' | null;

const TOTAL = 8;

const PREMIOS = [
  { name: 'Masculino Open', tags: ['Masc', 'Open'], total: 'R$ 8.000', dist: [{ place: '1º', color: '#FF6A1A', value: 'R$ 4.000' }, { place: '2º', color: '#D7D7D7', value: 'R$ 2.500' }, { place: '3º', color: '#CD7F32', value: 'R$ 1.500' }] },
  { name: 'Feminino Open', tags: ['Fem', 'Open'], total: 'R$ 6.000', dist: [{ place: '1º', color: '#FF6A1A', value: 'R$ 3.000' }, { place: '2º', color: '#D7D7D7', value: 'R$ 2.000' }, { place: '3º', color: '#CD7F32', value: 'R$ 1.000' }] },
  { name: 'Misto Sub-23', tags: ['Misto', 'Sub-23'], total: 'R$ 2.400', dist: [{ place: '1º', color: '#FF6A1A', value: 'R$ 1.200' }, { place: '2º', color: '#D7D7D7', value: 'R$ 800' }, { place: '3º', color: '#CD7F32', value: 'R$ 400' }] },
];

const PREMIO_PLACES: [string, string, string, string][] = [
  ['1º', '#FF6A1A', 'Campeão', '4.000,00'],
  ['2º', '#D7D7D7', 'Vice-campeão', '2.500,00'],
  ['3º', '#CD7F32', 'Terceiro lugar', '1.500,00'],
];

const RANKING_POINTS: [string, number][] = [
  ['1º', 450], ['2º', 280], ['3º', 180], ['4º', 120], ['Quartas', 80], ['Fase de grupos', 40],
];

/** Wizard de criação de torneio avulso — 8 passos + builder de categoria + editor de premiação. */
@Component({
  selector: 'og-criar-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    OgWizardShellComponent,
    OgCardComponent,
    OgFormFieldComponent,
    OgDisplayInputComponent,
    OgSelectChipsComponent,
    OgChipsMultiComponent,
    OgStepperStaticComponent,
    OgToggleRowComponent,
    OgRadioRowComponent,
    OgCategoryCardComponent,
    OgAddTileComponent,
    OgReviewRowComponent,
    OgPointsTableComponent,
    OgIconComponent,
  ],
  template: `
    @if (published()) {
      <div class="og-wizard-done" style="background:radial-gradient(60% 50% at 50% 30%, rgba(43,209,126,0.14) 0%, transparent 65%)">
        <div class="og-wizard-done-badge" style="background:var(--nx-win);box-shadow:0 0 0 1px rgba(43,209,126,0.4),0 16px 48px rgba(43,209,126,0.30)">
          <og-icon name="check" [size]="44" style="color:#0a0a0a" />
        </div>
        <div>
          <div class="og-wizard-done-kicker" style="color:var(--nx-win)">No ar · inscrições abertas</div>
          <h1>Open Goiânia Beach está publicado!</h1>
          <p>Os atletas já podem encontrar e se inscrever. Compartilhe para lotar mais rápido.</p>
        </div>
        <div class="og-wizard-done-actions">
          <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="download" [size]="14" />Ver página do torneio</button>
          <a class="og-ghost-btn" routerLink="/painel/inicio">Voltar ao painel</a>
        </div>
      </div>
    } @else {
      <og-wizard-shell
        [flow]="flow()"
        [total]="8"
        [step]="step()"
        [title]="title()"
        [subtitle]="subtitle()"
        [ctaLabel]="ctaLabel()"
        (cta)="onCta()"
        (back)="onBack()"
      >
        @switch (subView()) {
          @case ('categoria') {
            <og-card title="Identidade">
              <og-form-field label="Nome da categoria"><og-display-input value="Masculino Open" /></og-form-field>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Gênero"><og-select-chips [options]="['Masculino', 'Feminino', 'Misto']" active="Masculino" /></og-form-field>
                <og-form-field label="Disputa"><og-select-chips [options]="['Individual', 'Dupla', 'Equipe']" active="Dupla" /></og-form-field>
              </div>
              <div style="margin-top:16px">
                <og-form-field label="Faixa etária"><og-chips-multi [options]="['Livre', 'Sub-19', 'Sub-23', '+30', '+35', '+40']" [selected]="['Livre']" /></og-form-field>
              </div>
              <div style="margin-top:16px">
                <og-form-field label="Nível"><og-chips-multi [options]="['Iniciante', 'Intermediário', 'Avançado', 'Open']" [selected]="['Open']" /></og-form-field>
              </div>
            </og-card>
            <og-card kicker="Vagas & preço" title="Configuração">
              <div class="og-field-grid">
                <og-stepper-static label="Vagas" value="16" suffix="duplas" />
                <og-form-field label="Preço desta categoria"><og-display-input value="180,00" suffix="R$" /></og-form-field>
              </div>
              <div style="margin-top:14px">
                <og-toggle-row title="Usar preço padrão do torneio" desc="R$ 180 por dupla" [on]="true" />
              </div>
            </og-card>
            <og-card kicker="Avançado" title="Regras específicas">
              <og-toggle-row title="Formato próprio" desc="Por padrão usa o formato geral do torneio. Ative para definir uma chave só desta categoria." [on]="false" />
              <div style="margin-top:14px">
                <og-stepper-static label="Limite de inscrições por atleta" value="2" suffix="categorias" />
              </div>
            </og-card>
          }
          @case ('premio') {
            <og-card title="Categoria"><og-select-chips [options]="['Masculino Open', 'Feminino Open', 'Misto Sub-23']" active="Masculino Open" /></og-card>
            <og-card kicker="Total" title="Premiação total da categoria">
              <og-form-field label="Valor total"><og-display-input value="8.000,00" suffix="R$" /></og-form-field>
            </og-card>
            <og-card title="Distribuição por colocação">
              @for (row of premioPlaces; track row[0]) {
                <div class="og-premio-place-row">
                  <div class="og-premio-place-badge" [style.background]="row[1]">{{ row[0] }}</div>
                  <span class="og-premio-place-label">{{ row[2] }}</span>
                  <og-display-input [value]="row[3]" suffix="R$" />
                </div>
              }
              <div style="margin-top:12px">
                <og-add-tile label="Premiar mais colocações" sub="4º lugar, melhor da fase de grupos…" />
              </div>
            </og-card>
            <og-card title="Aplicar">
              <og-toggle-row title="Aplicar a todas as categorias" desc="Usa esta mesma distribuição nas outras categorias." [on]="false" />
            </og-card>
          }
          @default {
            @switch (step()) {
              @case (1) {
                <og-card title="Detalhes">
                  <div class="og-field-grid">
                    <og-form-field label="Esporte"><og-display-input value="Vôlei de praia" /></og-form-field>
                    <og-form-field label="Nome do torneio"><og-display-input value="Open Goiânia Beach" /></og-form-field>
                  </div>
                  <div style="margin-top:16px">
                    <og-form-field label="Imagem de capa"><div class="og-dropzone">JPG ou PNG · proporção 16:9</div></og-form-field>
                  </div>
                  <div style="margin-top:16px">
                    <og-form-field label="Descrição (opcional)">
                      <div class="og-textarea">Etapa avulsa do circuito independente de praia. Fase de grupos seguida de eliminatória simples, com final em MD5.</div>
                    </og-form-field>
                  </div>
                </og-card>
              }
              @case (2) {
                <og-card kicker="Local" title="Onde acontece">
                  <div class="og-field-grid">
                    <og-form-field label="Arena / clube"><og-display-input value="Arena ErreJota" /></og-form-field>
                    <og-form-field label="Endereço"><og-display-input value="Av. T-63 · Setor Bueno, Goiânia" /></og-form-field>
                    <og-stepper-static label="Quadras disponíveis" value="4" suffix="quadras" />
                  </div>
                </og-card>
                <og-card kicker="Quando" title="Data e horário">
                  <div class="og-field-grid">
                    <og-form-field label="Início"><og-display-input value="28 Mar 2026" /></og-form-field>
                    <og-form-field label="Fim"><og-display-input value="30 Mar 2026" /></og-form-field>
                    <og-form-field label="Horário do 1º jogo"><og-display-input value="Sexta · 18:00" /></og-form-field>
                  </div>
                </og-card>
              }
              @case (3) {
                <og-card title="Categorias do torneio">
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <og-category-card name="Masculino Open" [tags]="['Masc', 'Dupla', 'Open']" vagas="16 duplas" price="R$ 180" format="Grupos + SE" />
                    <og-category-card name="Feminino Open" [tags]="['Fem', 'Dupla', 'Open']" vagas="12 duplas" price="R$ 180" format="Grupos + SE" />
                    <og-category-card name="Misto Sub-23" [tags]="['Misto', 'Dupla', 'Sub-23']" vagas="8 duplas" price="R$ 120" format="Chave simples" />
                    <og-add-tile label="Adicionar categoria" sub="Gênero, idade, nível, vagas e preço" (click)="openCategoriaBuilder()" />
                  </div>
                </og-card>
                <div class="og-banner">Um atleta pode se inscrever em até <strong>2 categorias</strong>. Ajuste esse limite ao criar cada categoria.</div>
              }
              @case (4) {
                <og-card title="Sistema de disputa">
                  <div style="display:grid;gap:10px">
                    <og-radio-row [selected]="true" title="Fase de grupos + mata-mata" desc="Grupos classificatórios e depois eliminatória. O mais comum em torneios de praia." />
                    <og-radio-row title="Mata-mata (chave simples)" desc="Eliminação direta do início ao fim." />
                    <og-radio-row title="Todos contra todos" desc="Pontos corridos — todos se enfrentam." />
                    <og-radio-row title="Grupos + repescagem" desc="Quem perde cedo ganha uma segunda chance." />
                  </div>
                </og-card>
                <og-card kicker="Configuração dos grupos" title="Grupos">
                  <div class="og-field-grid">
                    <og-stepper-static label="Duplas por grupo" value="4" />
                    <og-stepper-static label="Classificam" value="2" />
                  </div>
                </og-card>
                <og-card kicker="Sets" title="Melhor de">
                  <og-select-chips [options]="['Set único', 'MD3', 'MD5']" active="MD3" />
                  <div style="margin-top:14px">
                    <og-toggle-row title="Final em MD5" desc="A decisão do título usa melhor de 5 sets." [on]="true" />
                  </div>
                </og-card>
              }
              @case (5) {
                <og-card kicker="Período" title="Janela de inscrição">
                  <div class="og-field-grid">
                    <og-form-field label="Abrem em"><og-display-input value="01 Mar 2026" /></og-form-field>
                    <og-form-field label="Fecham em"><og-display-input value="26 Mar 2026" /></og-form-field>
                  </div>
                </og-card>
                <og-card kicker="Pagamento" title="Como o organizador recebe">
                  <div style="display:grid;gap:10px">
                    <og-radio-row [selected]="true" title="Pelo app — Pix e cartão" desc="O atleta paga na inscrição. Repasse em D+2." right="taxa 6%" />
                    <og-radio-row title="Direto com o organizador" desc="Você combina e recebe por fora. O app só reserva a vaga." />
                  </div>
                </og-card>
                <og-card kicker="Vagas" title="Regras de vagas">
                  <og-toggle-row title="Lista de espera" desc="Quando lotar, novas duplas entram na fila automaticamente." [on]="true" />
                  <og-toggle-row title="Confirmar dupla por convite" desc="A inscrição só conta quando o parceiro aceita." [on]="true" />
                </og-card>
              }
              @case (6) {
                <og-card title="Premiação em dinheiro">
                  <og-toggle-row title="Premiação em dinheiro" desc="Desligue para premiar só com troféus/brindes." [on]="true" />
                </og-card>
                <og-card kicker="R$ 16.400 no total" title="Por categoria">
                  <div style="display:grid;gap:12px">
                    @for (p of premios; track p.name) {
                      <div class="og-premio-card">
                        <div class="og-premio-card-top">
                          <div>
                            <div class="og-premio-card-name">{{ p.name }}</div>
                            <div class="og-tag-row" style="margin-top:7px">
                              @for (t of p.tags; track t) {
                                <span class="og-tag">{{ t }}</span>
                              }
                            </div>
                          </div>
                          <div style="text-align:right">
                            <div class="og-premio-card-total">{{ p.total }}</div>
                            <div class="og-premio-card-total-label">em jogo</div>
                          </div>
                        </div>
                        <div class="og-premio-card-dist">
                          @for (d of p.dist; track d.place) {
                            <div class="og-premio-card-dist-item">
                              <div [style.color]="d.color">{{ d.place }}</div>
                              <div class="value">{{ d.value }}</div>
                            </div>
                          }
                        </div>
                        <div class="og-premio-card-footer">
                          <button type="button" class="og-ghost-btn" (click)="openPremioEditor()"><og-icon name="edit" [size]="13" />Editar premiação</button>
                        </div>
                      </div>
                    }
                  </div>
                </og-card>
              }
              @case (7) {
                <og-card kicker="Documento" title="Regulamento">
                  <div class="og-doc-row">
                    <div class="og-doc-row-icon"><og-icon name="download" [size]="19" /></div>
                    <div style="flex:1">
                      <div class="og-doc-row-name">regulamento-open-2026.pdf</div>
                      <div class="og-doc-row-meta">PDF · 240 KB · anexado</div>
                    </div>
                    <button type="button" class="og-ghost-btn">Trocar</button>
                  </div>
                  <div style="margin-top:12px">
                    <og-form-field label="Observações (opcional)">
                      <div class="og-textarea">Súmula digital obrigatória. Bola Mikasa VLS300. Tempo técnico aos 21 pontos somados.</div>
                    </og-form-field>
                  </div>
                </og-card>
                <og-card kicker="Uniforme" title="Regras de uniforme">
                  <og-toggle-row title="Uniforme obrigatório" desc="As duplas precisam jogar com camisa padronizada." [on]="true" />
                  <og-toggle-row title="Número na camisa" desc="Cada atleta com um número de identificação." [on]="true" />
                  <og-toggle-row title="Nome do atleta" desc="Sobrenome impresso na camisa." [on]="true" />
                </og-card>
                <og-card kicker="Ranking NexaGO" title="Pontuação">
                  <og-toggle-row title="Vale pontos no ranking" desc="Resultados contam para o ranking oficial da categoria." [on]="true" />
                  <div style="margin-top:14px">
                    <og-form-field label="Tabela de pontuação"><og-display-input value="Padrão NexaGO · Etapa avulsa" /></og-form-field>
                  </div>
                  <div class="og-points-box"><og-points-table [pts]="rankingPoints" /></div>
                </og-card>
              }
              @case (8) {
                <og-card title="Open Goiânia Beach">
                  <og-review-row label="Esporte & formato" value="Vôlei de praia · Grupos + mata-mata · MD3" />
                  <og-review-row label="Local & datas" value="Arena ErreJota, Goiânia · 28 a 30 de março · 4 quadras" />
                  <og-review-row label="Categorias" value="3 categorias · 36 vagas no total" />
                  <og-review-row label="Inscrições" value="01–26 Mar · Pix e cartão pelo app · lista de espera ativa" />
                  <og-review-row label="Premiação" value="Por categoria · R$ 16.400 no total · 1º ao 3º" />
                  <og-review-row label="Uniforme" value="Obrigatório · com número e nome do atleta" />
                  <og-review-row label="Ranking" value="Vale pontos · tabela padrão NexaGO" />
                </og-card>
                <og-card title="Visibilidade">
                  <div style="display:grid;gap:10px">
                    <og-radio-row [selected]="true" title="Público" desc="Aparece na busca e no Competir para todos." />
                    <og-radio-row title="Por link" desc="Só quem tem o link consegue ver e se inscrever." />
                  </div>
                </og-card>
              }
            }
          }
        }
      </og-wizard-shell>
    }
  `,
  styles: `
    .og-premio-place-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-premio-place-row:last-of-type {
      border-bottom: none;
    }
    .og-premio-place-badge {
      width: 34px;
      height: 34px;
      border-radius: 9px;
      flex: none;
      color: #0a0a0a;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 13px;
    }
    .og-premio-place-label {
      flex: 1;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-premio-card {
      padding: 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-premio-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .og-premio-card-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-premio-card-total {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-premio-card-total-label {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      letter-spacing: 0.1em;
      color: var(--nx-text-dim);
      font-weight: 600;
      text-transform: uppercase;
    }
    .og-premio-card-dist {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .og-premio-card-dist-item {
      padding: 9px 6px;
      border-radius: 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      text-align: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 11px;
    }
    .og-premio-card-dist-item .value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
      margin-top: 3px;
    }
    .og-premio-card-footer {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      justify-content: flex-end;
    }
    .og-doc-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-doc-row-icon {
      width: 40px;
      height: 40px;
      border-radius: 11px;
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }
    .og-doc-row-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }
    .og-doc-row-meta {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 1px;
    }
    .og-points-box {
      margin-top: 14px;
      padding: 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
  `,
})
export class CriarTorneioComponent {
  protected readonly step = signal(1);
  protected readonly subView = signal<SubView>(null);
  protected readonly published = signal(false);

  protected readonly premios = PREMIOS;
  protected readonly premioPlaces = PREMIO_PLACES;
  protected readonly rankingPoints = RANKING_POINTS;

  protected readonly flow = computed(() => (this.subView() === 'categoria' ? 'Nova categoria' : this.subView() === 'premio' ? 'Editar premiação' : 'Criar torneio'));

  protected readonly title = computed(() => {
    if (this.subView() === 'categoria') return 'Builder de categoria';
    if (this.subView() === 'premio') return 'Premiação · Masculino Open';
    return [
      '',
      'Identidade do torneio',
      'Local e datas',
      'Categorias',
      'Formato de jogo',
      'Inscrições',
      'Premiação',
      'Regulamento & ranking',
      'Tudo pronto?',
    ][this.step()];
  });

  protected readonly subtitle = computed(() => {
    if (this.subView() === 'categoria') return 'Configuração avançada — gênero, faixa, vagas e formato próprio.';
    if (this.subView() === 'premio') return 'Distribuição por colocação para esta categoria.';
    return [
      '',
      'O básico que aparece para os atletas na busca.',
      'Onde e quando o torneio acontece.',
      'Cada categoria roda sua própria chave, com vagas e preço próprios.',
      'Vale como padrão. Categorias podem ter formato próprio.',
      'Janela de inscrição e como você recebe.',
      'Cada categoria tem sua própria premiação — ajuste uma a uma.',
      'Regras oficiais e quanto vale no ranking.',
      'Revise antes de publicar. Dá pra editar qualquer parte depois.',
    ][this.step()];
  });

  protected readonly ctaLabel = computed(() => {
    if (this.subView() === 'categoria') return 'Salvar categoria';
    if (this.subView() === 'premio') return 'Salvar premiação';
    if (this.step() === 3) return 'Continuar · 3 categorias';
    if (this.step() === TOTAL) return 'Publicar torneio';
    return 'Continuar';
  });

  protected openCategoriaBuilder(): void {
    this.subView.set('categoria');
  }

  protected openPremioEditor(): void {
    this.subView.set('premio');
  }

  protected onCta(): void {
    if (this.subView()) {
      this.subView.set(null);
      return;
    }
    if (this.step() < TOTAL) {
      this.step.update((s) => s + 1);
      return;
    }
    this.published.set(true);
  }

  protected onBack(): void {
    if (this.subView()) {
      this.subView.set(null);
      return;
    }
    if (this.step() > 1) {
      this.step.update((s) => s - 1);
    }
  }
}
