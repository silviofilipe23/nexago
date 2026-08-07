import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { fetchOrganizerSettings } from '../../data/organizer-settings-repository';
import {
  DEFAULT_ORGANIZER_EVENT_DEFAULTS,
  applyOrganizerCategoryDefaults,
  type OrganizerEventDefaults,
} from '../../data/organizer-settings.model';
import {
  COUNTING_MODE_LABEL,
  DEFAULT_LEAGUE_RANKING_POINTS,
  type LeagueCountingStagesMode,
  type LeagueCreateDraft,
  type LeagueStageDraft,
  emptyLeagueDraft,
  emptyStageDraft,
  isValidLeagueForPublish,
  publishLeague,
} from '../../data/league-create.model';
import {
  AGE_BAND_LABEL,
  BRACKET_SYSTEM_SHORT_LABEL,
  DISPUTE_LABEL,
  DISPUTE_OPTIONS,
  GENDER_LABEL,
  SKILL_LEVEL_LABEL,
  SPORT_LABEL,
  type AgeBand,
  type CategoryDispute,
  type CategoryGender,
  type SkillLevel,
  type TournamentCategoryDraft,
  type TournamentSport,
  categoryTags,
  categoryTeamSize,
  categoryUnitLabel,
  emptyCategoryDraft,
  isTeamDispute,
  normalizeCategoryComposition,
  skillLevelOptionsForSport,
  suggestCategoryName,
} from '../../data/tournament-create.model';
import { OgAddTileComponent } from '../../ui/add-tile.component';
import { OgCardComponent } from '../../ui/card.component';
import { OgCategoryCardComponent } from '../../ui/category-card.component';
import { OgFormFieldComponent } from '../../ui/form-field.component';
import { OgIconComponent } from '../../ui/icon.component';
import { OgPointsTableComponent } from '../../ui/points-table.component';
import { OgReviewRowComponent } from '../../ui/review-row.component';
import { OgSelectChipsComponent } from '../../ui/select-chips.component';
import { OgStepperStaticComponent } from '../../ui/stepper-static.component';
import { OgToggleRowComponent } from '../../ui/toggle-row.component';
import { BrLocationsService } from '../../../shared/br-locations/br-locations.service';
import { OgWizardShellComponent } from '../../ui/wizard-shell.component';

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type SubView = 'categoria' | 'etapa' | null;

const TITLES = ['', 'Identidade da liga', 'Temporada', 'Categorias da liga', 'Ranking & Grande Final', 'Etapas da temporada', 'Revisar a liga'];
/** Rótulos curtos do stepper — mesma ordem dos passos, sem o índice 0 de `TITLES`. */
const STEP_LABELS = ['Identidade', 'Temporada', 'Categorias', 'Ranking', 'Etapas', 'Revisão'];
const SUBTITLES = [
  '',
  'O circuito completo — as etapas você adiciona depois.',
  'O intervalo do circuito e quantas etapas você planeja.',
  'Valem para todas as etapas. Cada etapa pode abrir ou fechar uma delas.',
  'Como os pontos somam e quem chega à decisão.',
  'Adicione as etapas agora ou ao longo do ano.',
  'Publique para abrir o circuito. Etapas podem ser adicionadas depois.',
];

const RANKING_POINTS_ROWS: [string, number][] = [
  ['1º lugar', DEFAULT_LEAGUE_RANKING_POINTS['1']!],
  ['2º lugar', DEFAULT_LEAGUE_RANKING_POINTS['2']!],
  ['3º lugar', DEFAULT_LEAGUE_RANKING_POINTS['3']!],
  ['4º lugar', DEFAULT_LEAGUE_RANKING_POINTS['4']!],
  ['Quartas', DEFAULT_LEAGUE_RANKING_POINTS['quarters']!],
  ['Fase de grupos', DEFAULT_LEAGUE_RANKING_POINTS['groups']!],
];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

function dateToInput(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inputToDate(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Wizard REAL de criação de liga — espelha os 6 passos do app (`league_create_draft.dart`)
 *  e publica igual ao `publishLeague` do Flutter: doc `leagues/{id}` + um torneio por etapa
 *  DEFINIDA (com local + data), tudo num batch (ver `league-create.model.ts`). Etapas só
 *  planejadas (sem local/data) ficam `pending` e viram torneio depois em "Nova etapa". */
@Component({
  selector: 'og-criar-liga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    OgWizardShellComponent,
    OgCardComponent,
    OgFormFieldComponent,
    OgSelectChipsComponent,
    OgStepperStaticComponent,
    OgToggleRowComponent,
    OgCategoryCardComponent,
    OgAddTileComponent,
    OgReviewRowComponent,
    OgPointsTableComponent,
    OgIconComponent,
  ],
  template: `
    @if (publishedId(); as pubId) {
      <div class="og-wizard-done" style="background:radial-gradient(60% 50% at 50% 30%, rgba(255,106,26,0.18) 0%, transparent 65%)">
        <div class="og-wizard-done-badge" style="background:var(--nx-orange-500);box-shadow:0 0 0 1px rgba(255,106,26,0.4),0 16px 48px rgba(255,106,26,0.30)">
          <og-icon name="flag" [size]="40" style="color:#0a0a0a" />
        </div>
        <div>
          <div class="og-wizard-done-kicker" style="color:var(--nx-orange-500)">Circuito no ar</div>
          <h1>{{ draft().name }} começou!</h1>
          <p>A liga está visível no Competir. As etapas definidas já nasceram como torneios abertos.</p>
        </div>
        <div class="og-wizard-done-actions">
          <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/ligas', pubId]">Gerenciar o circuito</a>
          <a class="og-ghost-btn" routerLink="/painel/eventos">Meus eventos</a>
        </div>
      </div>
    } @else {
      <og-wizard-shell
        [flow]="flow()"
        [steps]="stepLabels"
        [step]="step()"
        [unlockedUpTo]="unlockedUpTo()"
        [title]="title()"
        [subtitle]="subtitle()"
        [ctaLabel]="ctaLabel()"
        [ctaDisabled]="saving()"
        [ctaBusy]="saving()"
        busyTitle="Salvando circuito…"
        busyDescription="Enviando os dados da liga."
        [showDraft]="false"
        (cta)="onCta()"
        (back)="onBack()"
        (stepSelected)="goToStep($event)"
      >
        @if (feedback(); as fb) {
          <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
        }

        @switch (subView()) {
          @case ('categoria') {
            <og-card title="Identidade">
              <og-form-field label="Nome da categoria (vazio = sugere pelo gênero/faixa/nível)">
                <input class="og-input-el" [value]="cat().name" (input)="patchCat({ name: $any($event.target).value })" [placeholder]="suggestCategoryName(cat())" />
              </og-form-field>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Disputa">
                  <og-select-chips [options]="disputeOptions" [active]="disputeLabel[cat().dispute]" (changed)="setCatDispute($event)" />
                </og-form-field>
                <og-form-field label="Gênero">
                  <og-select-chips [options]="catGenderOptions()" [active]="catGenderActive()" (changed)="setCatGender($event)" />
                </og-form-field>
              </div>
              @if (catIsTeam() && cat().gender === 'mixed' && !cat().genderFree) {
                <div class="og-field-grid" style="margin-top:16px">
                  <og-stepper-static label="Homens por equipe" [value]="'' + cat().menCount" (bump)="bumpCatMen($event)" />
                  <og-stepper-static label="Mulheres por equipe" [value]="'' + cat().womenCount" (bump)="bumpCatMen(-$event)" />
                </div>
                <p class="og-wizard-hint">Cada equipe terá exatamente {{ cat().menCount }} homem{{ cat().menCount > 1 ? 's' : '' }} e {{ cat().womenCount }} mulher{{ cat().womenCount > 1 ? 'es' : '' }}.</p>
              } @else if (catIsTeam() && cat().genderFree) {
                <p class="og-wizard-hint">Sem restrição de gênero — qualquer composição de {{ catTeamSize() }} atletas.</p>
              }
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Faixa etária">
                  <og-select-chips [options]="ageBandOptions" [active]="ageBandLabel[cat().ageBand]" (changed)="setCatAgeBand($event)" />
                </og-form-field>
              </div>
              <div style="margin-top:16px">
                <og-form-field label="Nível">
                  <og-select-chips [options]="skillOptions()" [active]="skillLabel[cat().skillLevel]" (changed)="setCatSkill($event)" />
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-stepper-static label="Vagas por etapa" [value]="'' + cat().spots" [suffix]="catUnit()" (bump)="bumpCatSpots($event)" />
                <og-form-field label="Preço por etapa (R$)">
                  <input class="og-input-el" type="number" min="0" step="10" [value]="cat().priceCents / 100" (input)="patchCat({ priceCents: toCents($any($event.target).value) })" />
                </og-form-field>
              </div>
            </og-card>
          }
          @case ('etapa') {
            <og-card title="Etapa">
              <div class="og-field-grid">
                <og-form-field label="Nome (vazio = 'Liga · Etapa N')">
                  <input class="og-input-el" [value]="stage().name" (input)="patchStage({ name: $any($event.target).value })" />
                </og-form-field>
                <og-form-field label="Local / arena">
                  <input class="og-input-el" [value]="stage().locationName" (input)="patchStage({ locationName: $any($event.target).value })" />
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="UF da etapa (vazio = UF da liga)">
                  <select class="og-select-el" [value]="stage().state" (change)="onStageStateChange($any($event.target).value)">
                    <option value="">— usa UF da liga —</option>
                    @for (s of brLocations.states; track s.sigla) {
                      <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                    }
                  </select>
                </og-form-field>
                <og-form-field label="Cidade (vazio = cidade da liga)">
                  <select class="og-select-el" [value]="stage().city" [disabled]="!stageEffectiveState()" (change)="patchStage({ city: $any($event.target).value })">
                    <option value="">{{ !stageEffectiveState() ? 'Defina a UF da liga primeiro' : '— usa cidade da liga —' }}</option>
                    @for (c of citiesForStageState(); track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Início">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().startAt)" (input)="patchStage({ startAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
                <og-form-field label="Fim">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().endAt)" (input)="patchStage({ endAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
              </div>
              <div style="margin-top:14px">
                <og-toggle-row title="É a Grande Final" desc="Fecha a temporada — recebe os classificados do ranking." [on]="stage().isGrandFinal" (toggled)="patchStage({ isGrandFinal: $event })" />
              </div>
              <p class="og-wizard-hint">Com local e data preenchidos a etapa nasce como torneio publicado junto com a liga. Sem eles, fica planejada (pendente).</p>
            </og-card>
          }
          @default {
            @switch (step()) {
              @case (1) {
                <og-card title="Detalhes">
                  <div class="og-field-grid">
                    <og-form-field label="Esporte">
                      <og-select-chips [options]="sportOptions" [active]="sportLabel[draft().sport]" (changed)="setSport($event)" />
                    </og-form-field>
                    <og-form-field label="Nome da liga">
                      <input class="og-input-el" [value]="draft().name" (input)="patch({ name: $any($event.target).value })" placeholder="Ex.: Copa Goiás Beach 2026" />
                    </og-form-field>
                  </div>
                  <div class="og-field-grid" style="margin-top:16px">
                    <og-form-field label="Organização (opcional)">
                      <input class="og-input-el" [value]="draft().organizationName" (input)="patch({ organizationName: $any($event.target).value })" />
                    </og-form-field>
                    <og-form-field label="UF">
                      <select class="og-select-el" [value]="draft().state" (change)="onStateChange($any($event.target).value)">
                        <option value="">Selecione</option>
                        @for (s of brLocations.states; track s.sigla) {
                          <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                        }
                      </select>
                    </og-form-field>
                    <og-form-field label="Cidade-sede">
                      <select class="og-select-el" [value]="draft().city" [disabled]="!draft().state" (change)="patch({ city: $any($event.target).value })">
                        <option value="">{{ !draft().state ? 'Selecione a UF primeiro' : (brLocations.loaded() ? 'Selecione' : 'Carregando…') }}</option>
                        @for (c of citiesForState(); track c) {
                          <option [value]="c">{{ c }}</option>
                        }
                      </select>
                    </og-form-field>
                  </div>
                  <div style="margin-top:16px">
                    <og-form-field label="Descrição (opcional)">
                      <textarea class="og-textarea-el" rows="3" [value]="draft().description" (input)="patch({ description: $any($event.target).value })"></textarea>
                    </og-form-field>
                  </div>
                </og-card>
              }
              @case (2) {
                <og-card kicker="Temporada" title="Intervalo do circuito">
                  <div class="og-field-grid">
                    <og-form-field label="Começa em">
                      <input class="og-input-el" type="date" [value]="dateVal(draft().seasonStartAt)" (input)="patch({ seasonStartAt: toDateVal($any($event.target).value) })" />
                    </og-form-field>
                    <og-form-field label="Termina em">
                      <input class="og-input-el" type="date" [value]="dateVal(draft().seasonEndAt)" (input)="patch({ seasonEndAt: toDateVal($any($event.target).value) })" />
                    </og-form-field>
                  </div>
                  <div style="margin-top:16px">
                    <og-stepper-static label="Etapas planejadas" [value]="'' + draft().plannedStagesCount" suffix="etapas" (bump)="bumpPlanned($event)" />
                  </div>
                  <div style="margin-top:14px">
                    <og-toggle-row title="Grande Final" desc="Fecha a temporada com os melhores do ranking." [on]="draft().grandFinalEnabled" (toggled)="patch({ grandFinalEnabled: $event })" />
                  </div>
                </og-card>
              }
              @case (3) {
                <og-card title="Categorias da liga">
                  <div style="display:flex;flex-direction:column;gap:12px">
                    @for (c of draft().categories; track c.id) {
                      <og-category-card
                        [name]="c.name.trim() || suggestCategoryName(c)"
                        [tags]="tagsOf(c)"
                        [vagas]="c.spots + ' ' + unitOf(c)"
                        [price]="brl(c.priceCents)"
                        [format]="bracketShortLabel[c.bracketSystem]"
                        [removable]="true"
                        (edit)="openCategoria(c.id)"
                        (remove)="removeCategory(c.id)"
                      />
                    }
                    <og-add-tile label="Adicionar categoria" sub="Vale para todas as etapas do circuito" (click)="openCategoria(null)" />
                  </div>
                </og-card>
              }
              @case (4) {
                <og-card kicker="Contagem" title="Como os pontos somam">
                  <div style="display:grid;gap:10px">
                    @for (mode of countingModes; track mode) {
                      <div class="og-radio-row" [class.selected]="draft().countingStagesMode === mode" style="cursor:pointer" (click)="patch({ countingStagesMode: mode })">
                        <span class="og-radio-dot">
                          @if (draft().countingStagesMode === mode) {
                            <span></span>
                          }
                        </span>
                        <div class="og-radio-body">
                          <div class="og-radio-title">{{ countingLabel[mode] }}</div>
                        </div>
                      </div>
                    }
                  </div>
                </og-card>
                <og-card kicker="Pontuação" title="Tabela por colocação (padrão nexaGO)">
                  <og-points-table [pts]="rankingPointsRows" />
                </og-card>
                <og-card kicker="Grande Final" title="Classificação">
                  <og-stepper-static label="Vagas na Grande Final" [value]="'' + draft().grandFinalSpots" suffix="duplas" (bump)="bumpGrandFinalSpots($event)" />
                  <div style="margin-top:14px">
                    <og-toggle-row title="Convites (wildcard)" desc="Vagas extras por convite do organizador." [on]="draft().wildcardEnabled" (toggled)="patch({ wildcardEnabled: $event })" />
                  </div>
                  @if (draft().wildcardEnabled) {
                    <div style="margin-top:14px">
                      <og-stepper-static label="Vagas por convite" [value]="'' + draft().wildcardSpots" (bump)="bumpWildcardSpots($event)" />
                    </div>
                  }
                </og-card>
              }
              @case (5) {
                <og-card title="Calendário de etapas">
                  <div style="display:flex;flex-direction:column;gap:10px">
                    @for (s of draft().stages; track s.id) {
                      <div class="og-liga-stage" [class.defined]="stageIsDefined(s)">
                        <span class="n">{{ s.order }}</span>
                        <span style="flex:1;min-width:0">
                          <div class="name">{{ s.name.trim() || (s.isGrandFinal ? 'Grande Final' : 'Etapa ' + s.order) }}</div>
                          <div class="meta">{{ s.locationName.trim() || 'Local a definir' }} · {{ stageDateLabel(s) }}</div>
                        </span>
                        @if (s.isGrandFinal) {
                          <span class="og-tag">Final</span>
                        }
                        <button type="button" class="og-ghost-btn" (click)="openEtapa(s.id)">Editar</button>
                        <button type="button" class="og-ghost-btn" style="color:var(--nx-live)" (click)="removeStage(s.id)">Remover</button>
                      </div>
                    }
                    <og-add-tile label="Adicionar etapa" sub="Nome, local e data — dá pra definir depois também" (click)="addStage()" />
                  </div>
                </og-card>
                <div class="og-banner">Etapas com <strong>local e data</strong> nascem como torneios publicados junto com a liga. As demais ficam planejadas.</div>
              }
              @case (6) {
                <og-card [title]="draft().name || 'Liga'">
                  <og-review-row label="Esporte" [value]="sportLabel[draft().sport]" />
                  <og-review-row label="Temporada" [value]="reviewSeason()" />
                  <og-review-row label="Categorias" [value]="draft().categories.length + ' categorias'" />
                  <og-review-row label="Ranking" [value]="countingLabel[draft().countingStagesMode]" />
                  <og-review-row label="Grande Final" [value]="draft().grandFinalEnabled ? draft().grandFinalSpots + ' vagas' : 'Sem grande final'" />
                  <og-review-row label="Etapas" [value]="reviewStages()" />
                </og-card>
                @if (!hasDefinedStage()) {
                  <div class="og-banner">Defina ao menos uma etapa (com local e data) antes de publicar o circuito.</div>
                }
              }
            }
          }
        }
      </og-wizard-shell>
    }
  `,
  styles: `
    .og-liga-stage {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-liga-stage.defined {
      border-color: rgba(43, 209, 126, 0.3);
    }
    .og-liga-stage .n {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-liga-stage.defined .n {
      background: var(--nx-win);
      color: #0a0a0a;
    }
    .og-liga-stage .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-liga-stage .meta {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-wizard-hint {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }
  `,
})
export class CriarLigaComponent {
  private readonly auth = inject(AuthService);
  protected readonly brLocations = inject(BrLocationsService);

  /** Regras padrão do organizador (`/painel/config`) — aqui só as de categoria são usadas; o
   *  rascunho da liga tem modelo próprio (`league-create.model.ts`) e não recebe defaults. */
  private organizerDefaults: OrganizerEventDefaults = DEFAULT_ORGANIZER_EVENT_DEFAULTS;

  protected readonly draft = signal<LeagueCreateDraft>(emptyLeagueDraft());
  protected readonly step = signal<Step>(1);
  /** Passo mais avançado já alcançado (1-based) — limita o clique direto no stepper. */
  private readonly maxStepReached = signal(1);
  protected readonly subView = signal<SubView>(null);
  protected readonly saving = signal(false);
  protected readonly publishedId = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  protected readonly cat = signal<TournamentCategoryDraft>(emptyCategoryDraft('tmp'));
  protected readonly stage = signal<LeagueStageDraft>(emptyStageDraft(1));

  protected readonly sportLabel = SPORT_LABEL;
  protected readonly genderLabel = GENDER_LABEL;
  protected readonly ageBandLabel = AGE_BAND_LABEL;
  protected readonly skillLabel = SKILL_LEVEL_LABEL;
  protected readonly bracketShortLabel = BRACKET_SYSTEM_SHORT_LABEL;
  protected readonly countingLabel = COUNTING_MODE_LABEL;
  protected readonly countingModes: LeagueCountingStagesMode[] = ['best4Of6', 'best3Of5', 'allStages'];
  protected readonly sportOptions = Object.values(SPORT_LABEL);
  protected readonly genderOptions = Object.values(GENDER_LABEL);
  protected readonly ageBandOptions = Object.values(AGE_BAND_LABEL);
  protected readonly rankingPointsRows = RANKING_POINTS_ROWS;
  protected readonly stepLabels = STEP_LABELS;
  protected readonly suggestCategoryName = suggestCategoryName;
  protected readonly tagsOf = categoryTags;
  protected readonly unitOf = categoryUnitLabel;
  protected readonly disputeLabel = DISPUTE_LABEL;
  protected readonly disputeOptions = DISPUTE_OPTIONS.map((d) => DISPUTE_LABEL[d]);

  // ── Categoria de equipe (trio/quarteto/quinteto) ──
  protected readonly catIsTeam = computed(() => isTeamDispute(this.cat().dispute));
  protected readonly catTeamSize = computed(() => categoryTeamSize(this.cat()));
  protected readonly catUnit = computed(() => categoryUnitLabel(this.cat()));
  protected readonly catGenderOptions = computed(() =>
    this.catIsTeam() ? [...Object.values(GENDER_LABEL), 'Livre'] : Object.values(GENDER_LABEL),
  );
  protected readonly catGenderActive = computed(() =>
    this.catIsTeam() && this.cat().genderFree ? 'Livre' : GENDER_LABEL[this.cat().gender],
  );

  protected readonly skillOptions = computed(() => skillLevelOptionsForSport(this.draft().sport).map((s) => SKILL_LEVEL_LABEL[s]));

  protected readonly flow = computed(() => (this.subView() === 'categoria' ? 'Categoria da liga' : this.subView() === 'etapa' ? 'Etapa' : 'Criar liga'));
  protected readonly title = computed(() => (this.subView() === 'categoria' ? 'Builder de categoria' : this.subView() === 'etapa' ? 'Editar etapa' : TITLES[this.step()]!));
  protected readonly subtitle = computed(() => (this.subView() ? '' : SUBTITLES[this.step()]!));

  protected readonly ctaLabel = computed(() => {
    if (this.subView() === 'categoria') return 'Salvar categoria';
    if (this.subView() === 'etapa') return 'Salvar etapa';
    if (this.step() === 6) return 'Publicar circuito';
    return 'Continuar';
  });

  /** Só volta/avança pra onde já passou; nas subviews (categoria/etapa) o stepper trava,
   *  porque ali o cabeçalho descreve a subview, não o passo. */
  protected readonly unlockedUpTo = computed(() => (this.subView() !== null ? 0 : this.maxStepReached()));

  protected readonly hasDefinedStage = computed(() => this.draft().stages.some((s) => this.stageIsDefined(s)));

  constructor() {
    void this.loadOrganizerDefaults();
  }

  /** Sem gate de loading porque nada aqui é aplicado ao abrir a tela: os defaults só entram
   *  quando o organizador abre o builder de uma categoria nova, bem depois da leitura. */
  private async loadOrganizerDefaults(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) return;
    this.organizerDefaults = (await fetchOrganizerSettings(uid)).defaults;
  }

  // ── Helpers ──
  protected patch(partial: Partial<LeagueCreateDraft>): void {
    this.draft.update((d) => ({ ...d, ...partial }));
  }

  protected patchCat(partial: Partial<TournamentCategoryDraft>): void {
    this.cat.update((c) => ({ ...c, ...partial }));
  }

  protected patchStage(partial: Partial<LeagueStageDraft>): void {
    this.stage.update((s) => ({ ...s, ...partial }));
  }

  protected readonly citiesForState = computed(() => this.brLocations.citiesFor(this.draft().state));

  protected onStateChange(uf: string): void {
    this.patch({ state: uf, city: '' });
  }

  protected readonly stageEffectiveState = computed(() => this.stage().state || this.draft().state);
  protected readonly citiesForStageState = computed(() => this.brLocations.citiesFor(this.stageEffectiveState()));

  protected onStageStateChange(uf: string): void {
    this.patchStage({ state: uf, city: '' });
  }

  protected brl(cents: number): string {
    return BRL.format(cents / 100);
  }

  protected toCents(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
  }

  protected dateVal = dateToInput;
  protected toDateVal = inputToDate;

  protected setSport(label: string): void {
    const sport = (Object.keys(SPORT_LABEL) as TournamentSport[]).find((s) => SPORT_LABEL[s] === label);
    if (sport) this.patch({ sport });
  }

  protected setCatGender(label: string): void {
    if (label === 'Livre') {
      // Livre só existe em equipe: sem restrição, exibido como misto nos leitores legados.
      this.cat.update((c) => normalizeCategoryComposition({ ...c, gender: 'mixed', genderFree: true }));
      return;
    }
    const gender = (Object.keys(GENDER_LABEL) as CategoryGender[]).find((g) => GENDER_LABEL[g] === label);
    if (gender) this.cat.update((c) => normalizeCategoryComposition({ ...c, gender, genderFree: false }));
  }

  protected setCatDispute(label: string): void {
    const dispute = (Object.keys(DISPUTE_LABEL) as CategoryDispute[]).find((d) => DISPUTE_LABEL[d] === label);
    if (!dispute) return;
    this.cat.update((c) => {
      const genderFree = isTeamDispute(dispute) ? c.genderFree : false;
      return normalizeCategoryComposition({ ...c, dispute, genderFree });
    });
  }

  /** Homens/mulheres por equipe são vasos comunicantes: soma travada no tamanho. */
  protected bumpCatMen(delta: number): void {
    this.cat.update((c) => {
      const size = categoryTeamSize(c);
      const men = Math.min(Math.max(c.menCount + delta, 1), size - 1);
      return { ...c, menCount: men, womenCount: size - men };
    });
  }

  protected setCatAgeBand(label: string): void {
    const band = (Object.keys(AGE_BAND_LABEL) as AgeBand[]).find((b) => AGE_BAND_LABEL[b] === label);
    if (band) this.patchCat({ ageBand: band });
  }

  protected setCatSkill(label: string): void {
    const level = (Object.keys(SKILL_LEVEL_LABEL) as SkillLevel[]).find((s) => SKILL_LEVEL_LABEL[s] === label);
    if (level) this.patchCat({ skillLevel: level });
  }

  protected bumpCatSpots(delta: number): void {
    // Dupla anda de 2 em 2 (comportamento histórico); equipe de 1 em 1.
    const step = this.catIsTeam() ? 1 : 2;
    this.patchCat({ spots: Math.min(Math.max(this.cat().spots + delta * step, 2), 64) });
  }

  protected bumpPlanned(delta: number): void {
    this.patch({ plannedStagesCount: Math.min(Math.max(this.draft().plannedStagesCount + delta, 1), 12) });
  }

  protected bumpGrandFinalSpots(delta: number): void {
    this.patch({ grandFinalSpots: Math.min(Math.max(this.draft().grandFinalSpots + delta * 4, 4), 64) });
  }

  protected bumpWildcardSpots(delta: number): void {
    this.patch({ wildcardSpots: Math.min(Math.max(this.draft().wildcardSpots + delta, 1), 8) });
  }

  // ── Categorias ──
  protected openCategoria(id: string | null): void {
    const existing = id ? this.draft().categories.find((c) => c.id === id) : null;
    // Categoria existente abre como está; só a NOVA nasce com as regras padrão do organizador.
    this.cat.set(
      existing
        ? { ...existing }
        : applyOrganizerCategoryDefaults(
            { ...emptyCategoryDraft(`${Date.now()}`), priceCents: this.draft().defaultPriceCents },
            this.organizerDefaults,
          ),
    );
    this.subView.set('categoria');
  }

  protected removeCategory(id: string): void {
    if (!confirm('Remover esta categoria da liga?')) return;
    this.draft.update((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
  }

  // ── Etapas ──
  protected addStage(): void {
    const order = this.draft().stages.length + 1;
    this.stage.set(emptyStageDraft(order));
    this.subView.set('etapa');
  }

  protected openEtapa(id: string): void {
    const existing = this.draft().stages.find((s) => s.id === id);
    if (!existing) return;
    this.stage.set({ ...existing });
    this.subView.set('etapa');
  }

  protected removeStage(id: string): void {
    if (!confirm('Remover esta etapa?')) return;
    this.draft.update((d) => ({
      ...d,
      stages: d.stages.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })),
    }));
  }

  protected stageIsDefined(s: LeagueStageDraft): boolean {
    return s.locationName.trim().length > 0 && s.startAt != null;
  }

  protected stageDateLabel(s: LeagueStageDraft): string {
    if (!s.startAt) return 'Data a definir';
    const start = SHORT_DATE.format(s.startAt);
    if (!s.endAt || s.endAt.getTime() === s.startAt.getTime()) return start;
    return `${start} – ${SHORT_DATE.format(s.endAt)}`;
  }

  private saveStageFromEditor(): void {
    const stage = this.stage();
    const defined = this.stageIsDefined(stage);
    const next: LeagueStageDraft = { ...stage, status: defined ? 'defined' : 'pending' };
    this.draft.update((d) => {
      const exists = d.stages.some((s) => s.id === next.id);
      const stages = exists ? d.stages.map((s) => (s.id === next.id ? next : s)) : [...d.stages, next];
      return { ...d, stages: stages.map((s, i) => ({ ...s, order: i + 1 })) };
    });
  }

  // ── Navegação / publicação ──
  protected onCta(): void {
    this.feedback.set(null);
    if (this.subView() === 'categoria') {
      const cat = this.cat();
      this.draft.update((d) => {
        const exists = d.categories.some((c) => c.id === cat.id);
        return { ...d, categories: exists ? d.categories.map((c) => (c.id === cat.id ? cat : c)) : [...d.categories, cat] };
      });
      this.subView.set(null);
      return;
    }
    if (this.subView() === 'etapa') {
      this.saveStageFromEditor();
      this.subView.set(null);
      return;
    }
    const s = this.step();
    if (s === 6) {
      void this.publish();
      return;
    }
    const error = this.stepBlock(s);
    if (error) {
      this.feedback.set({ ok: false, message: error });
      return;
    }
    this.step.set((s + 1) as Step);
    this.maxStepReached.update((m) => Math.max(m, s + 1));
  }

  /** Pulo direto pelo stepper — só chega aqui pra passo já alcançado, que já passou por `stepBlock`. */
  protected goToStep(n: number): void {
    if (n === this.step()) return;
    this.feedback.set(null);
    this.step.set(n as Step);
  }

  protected onBack(): void {
    this.feedback.set(null);
    if (this.subView()) {
      this.subView.set(null);
      return;
    }
    if (this.step() > 1) this.step.set((this.step() - 1) as Step);
  }

  private stepBlock(s: Step): string | null {
    const d = this.draft();
    if (s === 1 && (!d.name.trim() || !d.city.trim())) return 'Preencha nome e cidade-sede da liga.';
    if (s === 2 && (!d.seasonStartAt || !d.seasonEndAt || d.seasonEndAt < d.seasonStartAt)) return 'Preencha o intervalo da temporada (fim depois do início).';
    if (s === 3 && d.categories.length === 0) return 'Adicione ao menos uma categoria.';
    return null;
  }

  private async publish(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.saving()) return;
    const draft = this.draft();
    if (!isValidLeagueForPublish(draft)) {
      this.feedback.set({ ok: false, message: 'Revise os passos anteriores — há campos obrigatórios faltando.' });
      return;
    }
    if (!this.hasDefinedStage()) {
      this.feedback.set({ ok: false, message: 'Defina ao menos uma etapa (com local e data) antes de publicar.' });
      return;
    }
    this.saving.set(true);
    try {
      const id = await publishLeague({ draft, managerId: uid });
      this.publishedId.set(id);
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao publicar a liga.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected reviewSeason(): string {
    const d = this.draft();
    if (!d.seasonStartAt) return 'Temporada a definir';
    return `${dateToInput(d.seasonStartAt)} a ${dateToInput(d.seasonEndAt)} · ${d.plannedStagesCount} etapas planejadas`;
  }

  protected reviewStages(): string {
    const total = this.draft().stages.length;
    const defined = this.draft().stages.filter((s) => this.stageIsDefined(s)).length;
    return `${total} etapas no calendário · ${defined} definidas (viram torneio na publicação)`;
  }
}
