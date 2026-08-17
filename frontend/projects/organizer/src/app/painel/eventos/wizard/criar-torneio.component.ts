import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../auth/auth.service';
import { fetchOrganizerSettings } from '../../data/organizer-settings-repository';
import {
  DEFAULT_ORGANIZER_EVENT_DEFAULTS,
  applyOrganizerCategoryDefaults,
  applyOrganizerDefaults,
  applyOrganizerPaymentDefaults,
  type OrganizerEventDefaults,
} from '../../data/organizer-settings.model';
import { loadTournamentDraft, publishTournamentDraft } from '../../data/tournament-create-mapper';
import {
  AGE_BAND_LABEL,
  BEST_OF_LABEL,
  BRACKET_SYSTEM_DESCRIPTION,
  BRACKET_SYSTEM_LABEL,
  BRACKET_SYSTEM_SHORT_LABEL,
  CATEGORY_LEVEL_PRESETS,
  DISPUTE_LABEL,
  DISPUTE_OPTIONS,
  GENDER_LABEL,
  SKILL_LEVEL_LABEL,
  SPORT_LABEL,
  SUPPORTED_BRACKET_SYSTEMS,
  TOURNAMENT_CREATE_STEPS,
  type AgeBand,
  type CategoryDispute,
  type CategoryGender,
  type SkillLevel,
  type TournamentBestOf,
  type TournamentBracketSystem,
  type TournamentCategoryDraft,
  type TournamentCreateDraft,
  type TournamentCreateStep,
  type TournamentSport,
  canContinueFromStep,
  categoryTags,
  categoryTeamSize,
  categoryUnitLabel,
  categoryUnitSingular,
  defaultCategoryPrizes,
  emptyCategoryDraft,
  emptyTournamentDraft,
  isTeamDispute,
  isValidForPublish,
  normalizeCategoryComposition,
  publishBlockReasonForUnsupportedBrackets,
  registrationWindowError,
  skillLevelOptionsForSport,
  suggestCategoryName,
  totalPrizeCents,
  totalSpots,
} from '../../data/tournament-create.model';
import { OgCardComponent } from '../../ui/card.component';
import { OgCategoryCardComponent } from '../../ui/category-card.component';
import { OgFormFieldComponent } from '../../ui/form-field.component';
import { OgIconComponent } from '../../ui/icon.component';
import { OgAddTileComponent } from '../../ui/add-tile.component';
import { OgRadioRowComponent } from '../../ui/radio-row.component';
import { OgReviewRowComponent } from '../../ui/review-row.component';
import { OgSelectChipsComponent } from '../../ui/select-chips.component';
import { OgStepperStaticComponent } from '../../ui/stepper-static.component';
import { OgToggleRowComponent } from '../../ui/toggle-row.component';
import { OgWizardShellComponent } from '../../ui/wizard-shell.component';
import { NxPageLoadingComponent } from '../../../shared/loading/nx-page-loading.component';
import { BrLocationsService } from '@nexago/br-locations';

type SubView = 'categoria' | 'premio' | null;

const STEP_TITLE: Record<TournamentCreateStep, string> = {
  identity: 'Identidade do torneio',
  location: 'Local e datas',
  categories: 'Categorias',
  registration: 'Inscrições',
  rules: 'Premiação, regulamento & ranking',
  review: 'Tudo pronto?',
};

/** Rótulos curtos do stepper — o array segue a ordem de `TOURNAMENT_CREATE_STEPS`. */
const STEP_LABEL: Record<TournamentCreateStep, string> = {
  identity: 'Identidade',
  location: 'Local',
  categories: 'Categorias',
  registration: 'Inscrições',
  rules: 'Premiação',
  review: 'Revisão',
};

const STEP_LABELS = TOURNAMENT_CREATE_STEPS.map((s) => STEP_LABEL[s]);

const STEP_SUBTITLE: Record<TournamentCreateStep, string> = {
  identity: 'O básico que aparece para os atletas na busca.',
  location: 'Onde e quando o torneio acontece.',
  categories: 'Cada categoria roda sua própria chave, formato, vagas e preço.',
  registration: 'Janela de inscrição e como você recebe.',
  rules: 'Premiação, regras oficiais e quanto vale no ranking.',
  review: 'Revise antes de publicar. Dá pra editar qualquer parte depois.',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Faixa de nível: opção "Personalizado" abre os seletores finos de min/max. */
const CUSTOM_PRESET = 'Personalizado';
/** Nível mínimo: opção que representa "sem piso" (`minSkillLevel: null`). */
const NO_MIN = 'Sem mínimo';

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

function datetimeToInput(d: Date | null): string {
  if (!d) return '';
  return `${dateToInput(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function inputToDatetime(v: string): Date | null {
  if (!v) return null;
  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Wizard REAL de criação/edição de torneio — mesmos 6 passos e regras do app
 *  (`tournament_create_draft.dart`/`tournament_create_logic.dart`); o doc gravado é idêntico
 *  ao do app (ver `tournament-create-mapper.ts`). Edição via `?editar=<id>` carrega o doc
 *  existente (rascunho OU publicado — publicado preserva o `listingStatus`), "Salvar rascunho"
 *  grava com status draft a qualquer momento. Upload de capa/regulamento (Storage) fica de
 *  fora por ora — o app também trata capa como opcional. */
@Component({
  selector: 'og-criar-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    OgWizardShellComponent,
    NxPageLoadingComponent,
    OgCardComponent,
    OgFormFieldComponent,
    OgSelectChipsComponent,
    OgStepperStaticComponent,
    OgToggleRowComponent,
    OgRadioRowComponent,
    OgCategoryCardComponent,
    OgAddTileComponent,
    OgReviewRowComponent,
    OgIconComponent,
  ],
  template: `
    @if (publishedId(); as pubId) {
      <div class="og-wizard-done" style="background:radial-gradient(60% 50% at 50% 30%, rgba(43,209,126,0.14) 0%, transparent 65%)">
        <div class="og-wizard-done-badge" style="background:var(--nx-win);box-shadow:0 0 0 1px rgba(43,209,126,0.4),0 16px 48px rgba(43,209,126,0.30)">
          <og-icon name="check" [size]="44" style="color:#0a0a0a" />
        </div>
        <div>
          <div class="og-wizard-done-kicker" style="color:var(--nx-win)">No ar · inscrições abertas</div>
          <h1>{{ draft().name }} está publicado!</h1>
          <p>Os atletas já podem encontrar e se inscrever. Compartilhe para lotar mais rápido.</p>
        </div>
        <div class="og-wizard-done-actions">
          <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', pubId]">Ver página do torneio</a>
          <a class="og-ghost-btn" routerLink="/painel/inicio">Voltar ao painel</a>
        </div>
      </div>
    } @else {
      <og-wizard-shell
        [flow]="flow()"
        [steps]="stepLabels"
        [step]="stepNumber()"
        [unlockedUpTo]="unlockedUpTo()"
        [title]="title()"
        [subtitle]="subtitle()"
        [ctaLabel]="ctaLabel()"
        [ctaDisabled]="saving()"
        [ctaBusy]="saving()"
        busyTitle="Salvando torneio…"
        busyDescription="Enviando os dados do torneio e a arte de capa."
        [showDraft]="subView() === null"
        (cta)="onCta()"
        (back)="onBack()"
        (saveDraft)="saveDraft()"
        (stepSelected)="goToStep($event)"
      >
        @if (feedback(); as fb) {
          <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
        }
        @if (editLoading()) {
          <app-nx-page-loading title="Carregando torneio…" subtitle="Preenchendo o rascunho para edição" />
        } @else if (defaultsLoading()) {
          <app-nx-page-loading title="Preparando o rascunho…" subtitle="Aplicando suas regras padrão de evento" />
        } @else {

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
              <div style="margin-top:16px">
                <og-form-field label="Faixa etária">
                  <og-select-chips [options]="ageBandOptions" [active]="ageBandLabel[cat().ageBand]" (changed)="setCatAgeBand($event)" />
                </og-form-field>
              </div>
              <div style="margin-top:16px">
                <og-form-field label="Faixa de nível">
                  <og-select-chips [options]="levelPresetOptions" [active]="activeLevelPresetChip()" (changed)="setCatLevelPreset($event)" />
                </og-form-field>
                @if (cat().minSkillLevel != null) {
                  <p class="og-wizard-hint">Piso de nível: atletas sem nível declarado não conseguem se inscrever nesta categoria.</p>
                }
              </div>
              @if (customLevelMode() || activeLevelPreset() === 'Personalizado') {
                <div style="margin-top:12px">
                  <og-form-field label="Nível mínimo">
                    <og-select-chips [options]="minSkillOptions()" [active]="minSkillActive()" (changed)="setCatMinSkill($event)" />
                  </og-form-field>
                </div>
                <div style="margin-top:12px">
                  <og-form-field label="Nível máximo">
                    <og-select-chips [options]="skillOptions()" [active]="skillLabel[cat().skillLevel]" (changed)="setCatSkill($event)" />
                  </og-form-field>
                </div>
              }
            </og-card>
            <og-card kicker="Vagas & preço" title="Configuração">
              <div class="og-field-grid">
                <og-stepper-static label="Vagas" [value]="'' + cat().spots" [suffix]="catUnit()" (bump)="bumpCatSpots($event)" />
                <og-form-field label="Preço desta categoria (R$)">
                  <input
                    class="og-input-el"
                    type="number"
                    min="0"
                    step="10"
                    [disabled]="cat().useDefaultPrice"
                    [value]="cat().priceCents / 100"
                    (input)="patchCat({ priceCents: toCents($any($event.target).value) })"
                  />
                </og-form-field>
              </div>
              <div style="margin-top:14px">
                <og-toggle-row
                  title="Usar preço padrão do torneio"
                  [desc]="brl(draft().defaultPriceCents) + ' por ' + catUnitSingular()"
                  [on]="cat().useDefaultPrice"
                  (toggled)="patchCat({ useDefaultPrice: $event, priceCents: $event ? draft().defaultPriceCents : cat().priceCents })"
                />
                @if (catIsTeam()) {
                  <p class="og-wizard-hint">Preço por equipe — cada atleta paga a própria cota (≈ {{ brl(catPricePerAthlete()) }}) ou um atleta paga o valor cheio.</p>
                }
              </div>
            </og-card>
            <og-card kicker="Formato" title="Sistema de disputa da categoria">
              <div style="display:grid;gap:10px">
                @for (bs of bracketOptions; track bs) {
                  <og-radio-row
                    style="cursor:pointer"
                    [selected]="cat().bracketSystem === bs"
                    [title]="bracketLabel[bs]"
                    [desc]="bracketDesc[bs]"
                    [right]="supported.includes(bs) ? '' : 'em breve'"
                    (click)="patchCat({ bracketSystem: bs })"
                  />
                }
              </div>
              @if (cat().bracketSystem === 'groupsThenKnockout') {
                <div class="og-field-grid" style="margin-top:14px">
                  <og-stepper-static [label]="catIsTeam() ? 'Equipes por grupo' : 'Duplas por grupo'" [value]="'' + cat().teamsPerGroup" (bump)="bumpCat('teamsPerGroup', $event, 2, 8)" />
                  <og-stepper-static label="Classificam" [value]="'' + cat().qualifiersPerGroup" (bump)="bumpCat('qualifiersPerGroup', $event, 1, 4)" />
                </div>
              }
              <div style="margin-top:14px">
                <og-form-field label="Melhor de">
                  <og-select-chips [options]="['Set único', 'MD3', 'MD5']" [active]="bestOfLabel[cat().bestOf]" (changed)="setCatBestOf($event)" />
                </og-form-field>
              </div>
              <div style="margin-top:14px">
                <og-toggle-row title="Final em MD5" desc="A decisão do título usa melhor de 5 sets." [on]="cat().finalBestOf5" (toggled)="patchCat({ finalBestOf5: $event })" />
              </div>
              <div style="margin-top:14px">
                <og-stepper-static label="Limite de inscrições por atleta" [value]="'' + cat().maxRegistrationsPerAthlete" suffix="categorias" (bump)="bumpCat('maxRegistrationsPerAthlete', $event, 1, 5)" />
              </div>
            </og-card>
          }
          @case ('premio') {
            <og-card title="Categoria">
              <og-select-chips [options]="categoryNames()" [active]="premioCategoryName()" (changed)="setPremioCategory($event)" />
            </og-card>
            <og-card kicker="Total" title="Premiação total da categoria (R$)">
              <input class="og-input-el" type="number" min="0" step="100" [value]="premioTotalReais()" (input)="setPremioTotal($any($event.target).value)" />
              <p class="og-wizard-hint">Distribui automaticamente 50% / 31% / 19% entre 1º, 2º e 3º — ajuste abaixo.</p>
            </og-card>
            <og-card title="Distribuição por colocação">
              @for (p of premioCat()?.prizes ?? []; track p.position; let i = $index) {
                <div class="og-premio-place-row">
                  <div class="og-premio-place-badge" [style.background]="premioColor(i)">{{ p.position }}º</div>
                  <span class="og-premio-place-label">{{ p.label ?? 'Colocação' }}</span>
                  <input class="og-input-el" style="max-width:160px" type="number" min="0" step="50" [value]="p.valueCents / 100" (input)="setPremioValue(i, $any($event.target).value)" />
                </div>
              }
            </og-card>
            <og-card title="Aplicar">
              <og-toggle-row title="Aplicar a todas as categorias" desc="Usa esta mesma distribuição nas outras categorias." [on]="false" (toggled)="applyPremioToAll()" />
            </og-card>
          }
          @default {
            @switch (step()) {
              @case ('identity') {
                <og-card title="Detalhes">
                  <div class="og-field-grid">
                    <og-form-field label="Esporte">
                      <og-select-chips [options]="sportOptions" [active]="sportLabel[draft().sport]" (changed)="setSport($event)" />
                    </og-form-field>
                    <og-form-field label="Nome do torneio">
                      <input class="og-input-el" [value]="draft().name" (input)="patch({ name: $any($event.target).value })" placeholder="Ex.: Open Goiânia Beach" />
                    </og-form-field>
                  </div>
                  <div style="margin-top:16px">
                    <og-form-field label="Imagem de capa (opcional)">
                      <input #coverInput type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="onCoverPicked($event)" />
                      @if (coverPreviewUrl(); as preview) {
                        <div class="og-cover-preview" [style.background-image]="'url(' + preview + ')'">
                          <div class="og-cover-preview-actions">
                            <button type="button" class="og-mini-btn" (click)="coverInput.click()">Trocar</button>
                            <button type="button" class="og-ghost-btn" style="color:var(--nx-live)" (click)="clearCover()">Remover</button>
                          </div>
                        </div>
                      } @else {
                        <button type="button" class="og-dropzone og-cover-dropzone" (click)="coverInput.click()">
                          JPG, PNG ou WebP · proporção 16:9 · máx. {{ maxCoverMb }} MB
                        </button>
                      }
                    </og-form-field>
                  </div>
                  <div style="margin-top:16px">
                    <og-form-field label="Descrição (opcional)">
                      <textarea class="og-textarea-el" rows="3" [value]="draft().description" (input)="patch({ description: $any($event.target).value })"></textarea>
                    </og-form-field>
                  </div>
                </og-card>
              }
              @case ('location') {
                <og-card kicker="Local" title="Onde acontece">
                  <div class="og-field-grid">
                    <og-form-field label="Arena / clube">
                      <input class="og-input-el" [value]="draft().locationName" (input)="patch({ locationName: $any($event.target).value })" placeholder="Ex.: Arena ErreJota" />
                    </og-form-field>
                    <og-form-field label="Endereço">
                      <input class="og-input-el" [value]="draft().locationAddress" (input)="patch({ locationAddress: $any($event.target).value })" />
                    </og-form-field>
                  </div>
                  <div class="og-field-grid" style="margin-top:16px">
                    <og-form-field label="UF">
                      <select class="og-select-el" [value]="draft().state" (change)="onStateChange($any($event.target).value)">
                        <option value="">Selecione</option>
                        @for (s of brLocations.states; track s.sigla) {
                          <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                        }
                      </select>
                    </og-form-field>
                    <og-form-field label="Cidade">
                      <select class="og-select-el" [value]="draft().city" [disabled]="!draft().state" (change)="patch({ city: $any($event.target).value })">
                        <option value="">{{ !draft().state ? 'Selecione a UF primeiro' : (brLocations.loaded() ? 'Selecione' : 'Carregando…') }}</option>
                        @for (c of citiesForState(); track c) {
                          <option [value]="c">{{ c }}</option>
                        }
                      </select>
                    </og-form-field>
                  </div>
                  <div style="margin-top:16px">
                    <og-stepper-static label="Quadras disponíveis" [value]="'' + draft().courtsCount" suffix="quadras" (bump)="bumpCourts($event)" />
                  </div>
                </og-card>
                <og-card kicker="Quando" title="Data e horário">
                  <div class="og-field-grid">
                    <og-form-field label="Início">
                      <input class="og-input-el" type="date" [value]="dateVal(draft().startAt)" (input)="patch({ startAt: toDateVal($any($event.target).value) })" />
                    </og-form-field>
                    <og-form-field label="Fim">
                      <input class="og-input-el" type="date" [value]="dateVal(draft().endAt)" (input)="patch({ endAt: toDateVal($any($event.target).value) })" />
                    </og-form-field>
                    <og-form-field label="1º jogo (opcional)">
                      <input class="og-input-el" type="datetime-local" [value]="datetimeVal(draft().firstMatchAt)" (input)="patch({ firstMatchAt: toDatetimeVal($any($event.target).value) })" />
                    </og-form-field>
                  </div>
                </og-card>
              }
              @case ('categories') {
                <og-card title="Categorias do torneio">
                  <div style="display:flex;flex-direction:column;gap:12px">
                    @for (c of draft().categories; track c.id) {
                      <og-category-card
                        [name]="c.name.trim() || suggestCategoryName(c)"
                        [tags]="tagsOf(c)"
                        [vagas]="c.spots + ' ' + unitOf(c)"
                        [price]="brl(c.useDefaultPrice ? draft().defaultPriceCents : c.priceCents)"
                        [format]="bracketShortLabel[c.bracketSystem]"
                        [removable]="true"
                        (edit)="openCategoriaBuilder(c.id)"
                        (remove)="removeCategory(c.id)"
                      />
                    }
                    <og-add-tile label="Adicionar categoria" sub="Gênero, idade, nível, vagas e preço" (click)="openCategoriaBuilder(null)" />
                  </div>
                </og-card>
                <og-card kicker="Padrão" title="Preço padrão do torneio (R$)">
                  <input class="og-input-el" type="number" min="0" step="10" [value]="draft().defaultPriceCents / 100" (input)="setDefaultPrice($any($event.target).value)" />
                </og-card>
              }
              @case ('registration') {
                <og-card kicker="Período" title="Janela de inscrição">
                  <div class="og-field-grid">
                    <og-form-field label="Abrem em">
                      <input class="og-input-el" type="date" [value]="dateVal(draft().registrationOpensAt)" (input)="patch({ registrationOpensAt: toDateVal($any($event.target).value) })" />
                    </og-form-field>
                    <og-form-field label="Fecham em">
                      <input class="og-input-el" type="date" [value]="dateVal(draft().registrationClosesAt)" (input)="patch({ registrationClosesAt: toDateVal($any($event.target).value) })" />
                    </og-form-field>
                  </div>
                  @if (windowError(); as msg) {
                    <p class="og-wizard-error">{{ msg }}</p>
                  }
                </og-card>
                <og-card kicker="Pagamento" title="Como o organizador recebe">
                  <div style="display:grid;gap:10px">
                    <og-radio-row
                      style="cursor:pointer"
                      [selected]="draft().paymentMode === 'appPixCard'"
                      title="Pelo app — Pix e cartão"
                      desc="O atleta paga na inscrição. Repasse em D+2."
                      (click)="patch({ paymentMode: 'appPixCard' })"
                    />
                    <og-radio-row
                      style="cursor:pointer"
                      [selected]="draft().paymentMode === 'directWithOrganizer'"
                      title="Direto com o organizador"
                      desc="Você combina e recebe por fora. O app só reserva a vaga."
                      (click)="patch({ paymentMode: 'directWithOrganizer' })"
                    />
                  </div>
                  @if (draft().paymentMode === 'directWithOrganizer') {
                    <div class="og-field-grid" style="margin-top:14px">
                      <og-form-field label="Chave PIX">
                        <input class="og-input-el" [value]="draft().organizerPixKey" (input)="patch({ organizerPixKey: $any($event.target).value })" />
                      </og-form-field>
                      <og-form-field label="Nome do recebedor">
                        <input class="og-input-el" [value]="draft().organizerPixRecipientName" (input)="patch({ organizerPixRecipientName: $any($event.target).value })" />
                      </og-form-field>
                    </div>
                  }
                </og-card>
                <og-card kicker="Vagas" title="Regras de vagas">
                  <og-toggle-row title="Lista de espera" desc="Quando lotar, novas duplas entram na fila automaticamente." [on]="draft().waitlistEnabled" (toggled)="patch({ waitlistEnabled: $event })" />
                  <og-toggle-row title="Confirmar dupla por convite" desc="A inscrição só conta quando o parceiro aceita." [on]="draft().inviteConfirmEnabled" (toggled)="patch({ inviteConfirmEnabled: $event })" />
                </og-card>
              }
              @case ('rules') {
                <og-card title="Premiação em dinheiro">
                  <og-toggle-row title="Premiação em dinheiro" desc="Desligue para premiar só com troféus/brindes." [on]="draft().cashPrizesEnabled" (toggled)="patch({ cashPrizesEnabled: $event })" />
                </og-card>
                @if (draft().cashPrizesEnabled) {
                  <og-card [kicker]="brl(totalPrize()) + ' no total'" title="Por categoria">
                    <div style="display:grid;gap:12px">
                      @for (c of draft().categories; track c.id) {
                        <div class="og-premio-mini">
                          <span class="name">{{ c.name.trim() || suggestCategoryName(c) }}</span>
                          <span class="total">{{ brl(prizeTotalOf(c)) }}</span>
                          <button type="button" class="og-ghost-btn" (click)="openPremioEditor(c.id)"><og-icon name="edit" [size]="13" />Editar premiação</button>
                        </div>
                      }
                    </div>
                  </og-card>
                }
                <og-card kicker="Documento" title="Regulamento">
                  <og-form-field label="Observações / regulamento (opcional)">
                    <textarea class="og-textarea-el" rows="4" [value]="draft().regulationNotes" (input)="patch({ regulationNotes: $any($event.target).value })" placeholder="Súmula digital obrigatória. Bola Mikasa VLS300…"></textarea>
                  </og-form-field>
                </og-card>
                <og-card kicker="Uniforme" title="Regras de uniforme">
                  <og-toggle-row title="Uniforme obrigatório" desc="As duplas precisam jogar com camisa padronizada." [on]="draft().uniformRequired" (toggled)="patch({ uniformRequired: $event })" />
                  @if (draft().uniformRequired) {
                    <og-toggle-row title="Número na camisa" desc="Cada atleta com um número de identificação." [on]="draft().uniformNumberOnShirt" (toggled)="patch({ uniformNumberOnShirt: $event })" />
                    <og-toggle-row title="Nome do atleta" desc="Sobrenome impresso na camisa." [on]="draft().uniformNameOnShirt" (toggled)="patch({ uniformNameOnShirt: $event })" />
                  }
                </og-card>
                <og-card kicker="Ranking NexaGO" title="Pontuação">
                  <og-toggle-row title="Vale pontos no ranking" desc="Resultados contam para o ranking oficial. Categorias com menos de 10 duplas pagas não pontuam (desafio)." [on]="draft().rankingEnabled" (toggled)="patch({ rankingEnabled: $event })" />
                </og-card>
              }
              @case ('review') {
                <og-card [title]="draft().name || 'Torneio'">
                  <og-review-row label="Esporte & formato" [value]="reviewSport()" />
                  <og-review-row label="Local & datas" [value]="reviewLocation()" />
                  <og-review-row label="Categorias" [value]="reviewCategories()" />
                  <og-review-row label="Inscrições" [value]="reviewRegistration()" />
                  <og-review-row label="Premiação" [value]="reviewPrizes()" />
                  <og-review-row label="Uniforme" [value]="reviewUniform()" />
                  <og-review-row label="Ranking" [value]="draft().rankingEnabled ? 'Vale pontos · tabela padrão nexaGO' : 'Não vale pontos no ranking'" />
                </og-card>
                <og-card title="Visibilidade">
                  <div style="display:grid;gap:10px">
                    <og-radio-row
                      style="cursor:pointer"
                      [selected]="draft().visibility === 'publicListing'"
                      title="Público"
                      desc="Aparece na busca e no Competir para todos."
                      (click)="patch({ visibility: 'publicListing' })"
                    />
                    <og-radio-row
                      style="cursor:pointer"
                      [selected]="draft().visibility === 'linkOnly'"
                      title="Por link"
                      desc="Só quem tem o link consegue ver e se inscrever."
                      (click)="patch({ visibility: 'linkOnly' })"
                    />
                  </div>
                </og-card>
                @if (publishBlock(); as msg) {
                  <div class="og-banner">{{ msg }}</div>
                }
              }
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
    .og-premio-mini {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-premio-mini .name {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-premio-mini .total {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-wizard-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 10px 0 0;
    }
    .og-cover-dropzone {
      width: 100%;
      cursor: pointer;
      background: transparent;
    }
    .og-cover-preview {
      width: 100%;
      aspect-ratio: 16 / 9;
      max-height: 220px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background-size: cover;
      background-position: center;
      position: relative;
      overflow: hidden;
    }
    .og-cover-preview-actions {
      position: absolute;
      right: 10px;
      bottom: 10px;
      display: flex;
      gap: 8px;
      padding: 6px;
      border-radius: var(--nx-r-2);
      background: rgba(5, 5, 5, 0.65);
    }
    .og-wizard-hint {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 8px 0 0;
    }
  `,
})
export class CriarTorneioComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly brLocations = inject(BrLocationsService);

  protected readonly draft = signal<TournamentCreateDraft>(emptyTournamentDraft());
  /** Regras padrão do organizador (`/painel/config`), carregadas uma vez na criação. Só as
   *  de categoria sobrevivem depois disso — as de torneio já foram aplicadas no rascunho. */
  private organizerDefaults: OrganizerEventDefaults = DEFAULT_ORGANIZER_EVENT_DEFAULTS;
  protected readonly step = signal<TournamentCreateStep>('identity');
  /** Passo mais avançado já alcançado (1-based) — limita o clique direto na criação. */
  private readonly maxStepReached = signal(1);
  /** A tela abriu por `?editar=` e o doc carregou — libera o stepper inteiro. */
  private readonly editEntry = signal(false);
  protected readonly subView = signal<SubView>(null);
  protected readonly saving = signal(false);
  /** Carga do doc no modo edição (`?editar=`) — sem isso o form pisca vazio até popular. */
  protected readonly editLoading = signal(false);
  /** Carga das regras padrão na criação — segura o primeiro passo pra o organizador não digitar
   *  em cima de um campo que está prestes a ser preenchido. */
  protected readonly defaultsLoading = signal(false);
  protected readonly publishedId = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  private existingListingStatus: string | null = null;

  /** Capa escolhida localmente (ainda não enviada) + URL de preview (object URL do arquivo,
   *  ou a `coverImageUrl` já salva no doc em modo edição). */
  protected readonly maxCoverMb = 5;
  protected readonly coverFile = signal<File | null>(null);
  private coverObjectUrl: string | null = null;
  protected readonly coverPreviewUrl = computed(() => {
    const file = this.coverFile();
    if (file) return this.coverObjectUrl;
    return this.draft().coverImageUrl;
  });

  /** Categoria em edição no builder (cópia de trabalho). */
  protected readonly cat = signal<TournamentCategoryDraft>(emptyCategoryDraft('tmp'));
  protected readonly premioCategoryId = signal<string | null>(null);
  /** "Personalizado" foi escolhido explicitamente nesta sessão do builder — sem isso, um
   *  min/max que não bate com nenhum preset (ex.: rascunho salvo assim) também deve abrir
   *  os seletores finos, mas escolher "Personalizado" sem MUDAR o draft precisa persistir
   *  mesmo quando ele volta a coincidir com um preset. */
  protected readonly customLevelMode = signal(false);

  private readonly queryParams = toSignal(this.route.queryParamMap);

  // Rótulos / opções
  protected readonly sportLabel = SPORT_LABEL;
  protected readonly genderLabel = GENDER_LABEL;
  protected readonly ageBandLabel = AGE_BAND_LABEL;
  protected readonly skillLabel = SKILL_LEVEL_LABEL;
  protected readonly bestOfLabel = BEST_OF_LABEL;
  protected readonly bracketLabel = BRACKET_SYSTEM_LABEL;
  protected readonly bracketShortLabel = BRACKET_SYSTEM_SHORT_LABEL;
  protected readonly bracketDesc = BRACKET_SYSTEM_DESCRIPTION;
  protected readonly supported = SUPPORTED_BRACKET_SYSTEMS;
  protected readonly bracketOptions: TournamentBracketSystem[] = ['groupsThenKnockout', 'singleElimination', 'doubleElimination', 'roundRobin', 'groupsWithRepechage'];
  protected readonly sportOptions = Object.values(SPORT_LABEL);
  protected readonly genderOptions = Object.values(GENDER_LABEL);
  protected readonly ageBandOptions = Object.values(AGE_BAND_LABEL);
  protected readonly disputeLabel = DISPUTE_LABEL;
  protected readonly disputeOptions = DISPUTE_OPTIONS.map((d) => DISPUTE_LABEL[d]);
  protected readonly suggestCategoryName = suggestCategoryName;
  protected readonly tagsOf = categoryTags;
  protected readonly unitOf = categoryUnitLabel;

  // ── Categoria de equipe (trio/quarteto/quinteto) ──
  protected readonly catIsTeam = computed(() => isTeamDispute(this.cat().dispute));
  protected readonly catTeamSize = computed(() => categoryTeamSize(this.cat()));
  protected readonly catUnit = computed(() => categoryUnitLabel(this.cat()));
  protected readonly catUnitSingular = computed(() => categoryUnitSingular(this.cat()));
  /** Gênero da categoria: equipe ganha a opção "Livre" (sem restrição). */
  protected readonly catGenderOptions = computed(() =>
    this.catIsTeam() ? [...Object.values(GENDER_LABEL), 'Livre'] : Object.values(GENDER_LABEL),
  );
  protected readonly catGenderActive = computed(() =>
    this.catIsTeam() && this.cat().genderFree ? 'Livre' : GENDER_LABEL[this.cat().gender],
  );
  protected readonly catPricePerAthlete = computed(() => {
    const c = this.cat();
    const cents = c.useDefaultPrice ? this.draft().defaultPriceCents : c.priceCents;
    return Math.round(cents / categoryTeamSize(c));
  });

  protected readonly skillOptions = computed(() => skillLevelOptionsForSport(this.draft().sport).map((s) => SKILL_LEVEL_LABEL[s]));

  protected readonly levelPresetOptions = [...CATEGORY_LEVEL_PRESETS.map((p) => p.label), CUSTOM_PRESET];

  /** Preset cujo (min,max) casa com o draft; senão "Personalizado". */
  protected readonly activeLevelPreset = computed(() => {
    const c = this.cat();
    const hit = CATEGORY_LEVEL_PRESETS.find((p) => p.min === c.minSkillLevel && p.max === c.skillLevel);
    return hit?.label ?? CUSTOM_PRESET;
  });

  /** Chip ativo da faixa de nível: "Personalizado" fica selecionado enquanto o organizador
   *  estiver nesse modo, mesmo que o min/max do draft ainda não tenha divergido de um preset. */
  protected readonly activeLevelPresetChip = computed(() =>
    this.customLevelMode() ? CUSTOM_PRESET : this.activeLevelPreset(),
  );

  protected readonly minSkillOptions = computed(() => [NO_MIN, ...this.skillOptions()]);

  protected readonly stepLabels = STEP_LABELS;

  protected readonly stepNumber = computed(() => TOURNAMENT_CREATE_STEPS.indexOf(this.step()) + 1);

  /** Editando um torneio existente todos os passos já têm conteúdo, então liberam de cara.
   *  Criando do zero, só até onde o organizador já chegou — e nas subviews (categoria/premiação)
   *  o stepper trava, porque ali o cabeçalho descreve a subview, não o passo. */
  protected readonly unlockedUpTo = computed(() => {
    if (this.subView() !== null) return 0;
    return this.editEntry() ? TOURNAMENT_CREATE_STEPS.length : this.maxStepReached();
  });

  protected readonly isEdit = computed(() => this.draft().tournamentId != null);

  protected readonly flow = computed(() => {
    if (this.subView() === 'categoria') return 'Categoria';
    if (this.subView() === 'premio') return 'Premiação';
    return this.isEdit() ? 'Editar torneio' : 'Criar torneio';
  });

  protected readonly title = computed(() => {
    if (this.subView() === 'categoria') return 'Builder de categoria';
    if (this.subView() === 'premio') return `Premiação · ${this.premioCategoryName()}`;
    return STEP_TITLE[this.step()];
  });

  protected readonly subtitle = computed(() => {
    if (this.subView() === 'categoria') return 'Configuração avançada — gênero, faixa, vagas e formato próprio.';
    if (this.subView() === 'premio') return 'Distribuição por colocação para esta categoria.';
    return STEP_SUBTITLE[this.step()];
  });

  protected readonly ctaLabel = computed(() => {
    if (this.subView() === 'categoria') return 'Salvar categoria';
    if (this.subView() === 'premio') return 'Salvar premiação';
    if (this.step() === 'categories') {
      const n = this.draft().categories.length;
      return n > 0 ? `Continuar · ${n} categoria${n > 1 ? 's' : ''}` : 'Continuar';
    }
    if (this.step() === 'review') {
      if (this.isEdit() && this.existingListingStatus && !['draft', 'rascunho'].includes(this.existingListingStatus.toLowerCase())) return 'Salvar alterações';
      return 'Publicar torneio';
    }
    return 'Continuar';
  });

  protected readonly windowError = computed(() => registrationWindowError(this.draft()));
  protected readonly publishBlock = computed(() => publishBlockReasonForUnsupportedBrackets(this.draft()) || null);
  protected readonly totalPrize = computed(() => totalPrizeCents(this.draft()));

  constructor() {
    void this.loadOrganizerDefaults();
    effect(() => {
      const editId = this.queryParams()?.get('editar');
      if (!editId || this.draft().tournamentId === editId) return;
      void this.loadForEdit(editId);
    });
    // DEBUG TEMPORÁRIO — remover depois de investigar o bug de estado/cidade na edição.
    effect(() => {
      const d = this.draft();
      // eslint-disable-next-line no-console
      console.log('[DEBUG torneio draft]', { tournamentId: d.tournamentId, city: d.city, state: d.state });
    });
  }

  /** Preenche o rascunho NOVO com as regras padrão do organizador (`/painel/config`).
   *
   *  Nunca roda no modo edição: aplicar defaults sobre um torneio já carregado sobrescreveria
   *  dados reais. Daí as duas guardas — `?editar=` na rota antes de começar, e de novo depois do
   *  await, porque a query param pode chegar durante a leitura. `fetchOrganizerSettings` não
   *  lança: sem configuração (ou sem rede) segue com os defaults de fábrica, que são exatamente
   *  os que o wizard usava antes desta tela existir. */
  private async loadOrganizerDefaults(): Promise<void> {
    if (this.route.snapshot.queryParamMap.get('editar')) return;
    const uid = this.auth.user()?.uid;
    if (!uid) return;

    this.defaultsLoading.set(true);
    try {
      const settings = await fetchOrganizerSettings(uid);
      this.organizerDefaults = settings.defaults;
      if (this.draft().tournamentId != null || this.route.snapshot.queryParamMap.get('editar')) return;
      this.draft.update((d) =>
        applyOrganizerPaymentDefaults(applyOrganizerDefaults(d, settings.defaults), settings.payments),
      );
    } finally {
      this.defaultsLoading.set(false);
    }
  }

  private async loadForEdit(id: string): Promise<void> {
    this.editLoading.set(true);
    try {
      const loaded = await loadTournamentDraft(id);
      if (!loaded) {
        this.feedback.set({ ok: false, message: 'Torneio não encontrado pra edição.' });
        return;
      }
      // eslint-disable-next-line no-console
      console.log('[DEBUG torneio loadForEdit] doc carregado:', { city: loaded.draft.city, state: loaded.draft.state, existingListingStatus: loaded.existingListingStatus });
      this.draft.set(loaded.draft);
      this.existingListingStatus = loaded.existingListingStatus;
      this.editEntry.set(true);
      this.applyDeepLink();
    } finally {
      this.editLoading.set(false);
    }
  }

  /** Entrada direta num passo (`?passo=`) e, opcionalmente, no builder de uma categoria
   *  (`?categoria=`). É por aqui que o "Editar" da tela de Equipes cai na categoria certa em
   *  vez de largar o organizador no primeiro passo do wizard. Só roda depois do doc carregado
   *  — `openCategoriaBuilder` precisa das categorias já no rascunho. */
  private applyDeepLink(): void {
    const params = this.route.snapshot.queryParamMap;
    const step = params.get('passo');
    if (step && (TOURNAMENT_CREATE_STEPS as readonly string[]).includes(step)) {
      this.step.set(step as TournamentCreateStep);
    }
    const catId = params.get('categoria');
    // Categoria removida (ou id inválido no link) abre o passo sem builder, em vez de um
    // formulário de categoria nova que o organizador não pediu.
    if (catId && this.draft().categories.some((c) => c.id === catId)) {
      this.openCategoriaBuilder(catId);
    }
  }

  // ── Helpers de template ──
  protected patch(partial: Partial<TournamentCreateDraft>): void {
    this.draft.update((d) => ({ ...d, ...partial }));
  }

  protected readonly citiesForState = computed(() => this.brLocations.citiesFor(this.draft().state));

  protected onStateChange(uf: string): void {
    this.patch({ state: uf, city: '' });
  }

  protected patchCat(partial: Partial<TournamentCategoryDraft>): void {
    this.cat.update((c) => ({ ...c, ...partial }));
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
  protected datetimeVal = datetimeToInput;
  protected toDatetimeVal = inputToDatetime;

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
      // Voltando para dupla, "Livre" deixa de existir — cai em misto explícito.
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

  protected setCatLevelPreset(label: string): void {
    if (label === CUSTOM_PRESET) {
      // "Personalizado" não regrava nada — só abre os seletores finos.
      this.customLevelMode.set(true);
      return;
    }
    const preset = CATEGORY_LEVEL_PRESETS.find((p) => p.label === label);
    if (preset) {
      this.customLevelMode.set(false);
      this.patchCat({ minSkillLevel: preset.min, skillLevel: preset.max });
    }
  }

  protected minSkillActive(): string {
    const min = this.cat().minSkillLevel;
    return min ? SKILL_LEVEL_LABEL[min] : NO_MIN;
  }

  protected setCatMinSkill(label: string): void {
    if (label === NO_MIN) {
      this.patchCat({ minSkillLevel: null });
      return;
    }
    const level = (Object.keys(SKILL_LEVEL_LABEL) as SkillLevel[]).find((s) => SKILL_LEVEL_LABEL[s] === label);
    if (level) this.patchCat({ minSkillLevel: level });
  }

  protected setCatBestOf(label: string): void {
    const bestOf = (Object.keys(BEST_OF_LABEL) as TournamentBestOf[]).find((b) => BEST_OF_LABEL[b] === label);
    if (bestOf) this.patchCat({ bestOf });
  }

  protected bumpCatSpots(delta: number): void {
    // Dupla anda de 2 em 2 (comportamento histórico); equipe de 1 em 1.
    const step = this.catIsTeam() ? 1 : 2;
    this.patchCat({ spots: Math.min(Math.max(this.cat().spots + delta * step, 2), 64) });
  }

  protected bumpCat(field: 'teamsPerGroup' | 'qualifiersPerGroup' | 'maxRegistrationsPerAthlete', delta: number, min: number, max: number): void {
    this.patchCat({ [field]: Math.min(Math.max(this.cat()[field] + delta, min), max) } as Partial<TournamentCategoryDraft>);
  }

  protected bumpCourts(delta: number): void {
    this.patch({ courtsCount: Math.min(Math.max(this.draft().courtsCount + delta, 1), 20) });
  }

  protected setDefaultPrice(value: string): void {
    const cents = this.toCents(value);
    this.draft.update((d) => ({
      ...d,
      defaultPriceCents: cents,
      categories: d.categories.map((c) => (c.useDefaultPrice ? { ...c, priceCents: cents } : c)),
    }));
  }

  // ── Capa ──
  protected onCoverPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      this.feedback.set({ ok: false, message: 'Formato inválido — use JPG, PNG ou WebP.' });
      return;
    }
    if (file.size > this.maxCoverMb * 1024 * 1024) {
      this.feedback.set({ ok: false, message: `Imagem muito grande — máximo ${this.maxCoverMb} MB.` });
      return;
    }
    if (this.coverObjectUrl) URL.revokeObjectURL(this.coverObjectUrl);
    this.coverObjectUrl = URL.createObjectURL(file);
    this.coverFile.set(file);
    this.feedback.set(null);
  }

  protected clearCover(): void {
    if (this.coverObjectUrl) {
      URL.revokeObjectURL(this.coverObjectUrl);
      this.coverObjectUrl = null;
    }
    this.coverFile.set(null);
    this.patch({ coverImageUrl: null });
  }

  // ── Categorias ──
  protected openCategoriaBuilder(id: string | null): void {
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
    // Cada categoria aberta começa sem o modo "Personalizado" travado — se o min/max dela bater
    // com um preset, o chip do preset é que deve aparecer ativo, não o da categoria anterior.
    this.customLevelMode.set(false);
    this.subView.set('categoria');
  }

  protected removeCategory(id: string): void {
    if (!confirm('Remover esta categoria?')) return;
    this.draft.update((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
  }

  private saveCategoryFromBuilder(): void {
    const cat = this.cat();
    this.draft.update((d) => {
      const exists = d.categories.some((c) => c.id === cat.id);
      return { ...d, categories: exists ? d.categories.map((c) => (c.id === cat.id ? cat : c)) : [...d.categories, cat] };
    });
  }

  // ── Premiação ──
  protected categoryNames(): string[] {
    return this.draft().categories.map((c) => c.name.trim() || suggestCategoryName(c));
  }

  protected premioCat(): TournamentCategoryDraft | null {
    return this.draft().categories.find((c) => c.id === this.premioCategoryId()) ?? null;
  }

  protected premioCategoryName(): string {
    const c = this.premioCat();
    return c ? c.name.trim() || suggestCategoryName(c) : '';
  }

  protected premioTotalReais(): number {
    const c = this.premioCat();
    return c ? c.prizes.reduce((sum, p) => sum + p.valueCents, 0) / 100 : 0;
  }

  protected prizeTotalOf(c: TournamentCategoryDraft): number {
    return c.prizes.reduce((sum, p) => sum + p.valueCents, 0);
  }

  protected premioColor(index: number): string {
    return ['#FF6A1A', '#D7D7D7', '#CD7F32'][index] ?? '#555';
  }

  protected openPremioEditor(categoryId: string): void {
    this.premioCategoryId.set(categoryId);
    const c = this.draft().categories.find((x) => x.id === categoryId);
    if (c && c.prizes.length === 0) this.updateCategory(categoryId, { prizes: defaultCategoryPrizes(100000) });
    this.subView.set('premio');
  }

  protected setPremioCategory(label: string): void {
    const c = this.draft().categories.find((x) => (x.name.trim() || suggestCategoryName(x)) === label);
    if (c) this.openPremioEditor(c.id);
  }

  protected setPremioTotal(value: string): void {
    const cents = this.toCents(value);
    const id = this.premioCategoryId();
    if (id) this.updateCategory(id, { prizes: defaultCategoryPrizes(cents) });
  }

  protected setPremioValue(index: number, value: string): void {
    const id = this.premioCategoryId();
    const c = this.premioCat();
    if (!id || !c) return;
    const cents = this.toCents(value);
    this.updateCategory(id, { prizes: c.prizes.map((p, i) => (i === index ? { ...p, valueCents: cents } : p)) });
  }

  protected applyPremioToAll(): void {
    const c = this.premioCat();
    if (!c) return;
    const prizes = c.prizes;
    this.draft.update((d) => ({ ...d, categories: d.categories.map((x) => ({ ...x, prizes: prizes.map((p) => ({ ...p })) })) }));
    this.feedback.set({ ok: true, message: 'Premiação aplicada a todas as categorias.' });
  }

  private updateCategory(id: string, partial: Partial<TournamentCategoryDraft>): void {
    this.draft.update((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...partial } : c)) }));
  }

  // ── Navegação / persistência ──
  protected onCta(): void {
    this.feedback.set(null);
    if (this.subView() === 'categoria') {
      this.saveCategoryFromBuilder();
      this.subView.set(null);
      return;
    }
    if (this.subView() === 'premio') {
      this.subView.set(null);
      return;
    }
    const current = this.step();
    if (current === 'review') {
      void this.publish();
      return;
    }
    if (!canContinueFromStep(this.draft(), current)) {
      this.feedback.set({ ok: false, message: this.stepBlockMessage(current) });
      return;
    }
    const idx = TOURNAMENT_CREATE_STEPS.indexOf(current);
    this.step.set(TOURNAMENT_CREATE_STEPS[idx + 1]!);
    this.maxStepReached.update((m) => Math.max(m, idx + 2));
  }

  /** Pulo direto pelo stepper. Não revalida: os passos liberados ou já passaram por
   *  `canContinueFromStep` (criação) ou vêm de um torneio existente (edição). */
  protected goToStep(n: number): void {
    const target = TOURNAMENT_CREATE_STEPS[n - 1];
    if (!target || target === this.step()) return;
    this.feedback.set(null);
    this.step.set(target);
  }

  protected onBack(): void {
    this.feedback.set(null);
    if (this.subView()) {
      this.subView.set(null);
      return;
    }
    const idx = TOURNAMENT_CREATE_STEPS.indexOf(this.step());
    if (idx > 0) this.step.set(TOURNAMENT_CREATE_STEPS[idx - 1]!);
  }

  private stepBlockMessage(step: TournamentCreateStep): string {
    switch (step) {
      case 'identity':
        return 'Dê um nome ao torneio pra continuar.';
      case 'location':
        return 'Preencha arena, cidade e as datas (fim não pode ser antes do início).';
      case 'categories':
        return 'Adicione ao menos uma categoria.';
      case 'registration':
        return this.windowError() ?? 'Preencha a janela de inscrição (e os dados PIX, no modo direto).';
      case 'rules':
        return 'Com premiação em dinheiro ligada, toda categoria precisa ter valores definidos.';
      default:
        return 'Revise os passos anteriores.';
    }
  }

  protected async saveDraft(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.saving()) return;
    if (!this.draft().name.trim()) {
      this.feedback.set({ ok: false, message: 'Dê um nome ao torneio antes de salvar o rascunho.' });
      return;
    }
    if (!this.draft().startAt || !this.draft().endAt) {
      this.feedback.set({ ok: false, message: 'Preencha as datas de início e fim antes de salvar o rascunho.' });
      return;
    }
    this.saving.set(true);
    try {
      const id = await publishTournamentDraft({
        draft: this.draft(),
        managerId: uid,
        publish: false,
        existingListingStatus: this.existingListingStatus,
        coverFile: this.coverFile(),
      });
      this.patch({ tournamentId: id });
      this.afterCoverUploaded();
      this.feedback.set({ ok: true, message: 'Rascunho salvo — você pode continuar depois.' });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao salvar o rascunho.' });
    } finally {
      this.saving.set(false);
    }
  }

  /** Depois que a capa subiu junto com uma gravação, o arquivo local deixa de ser "pendente" —
   *  recarrega o preview a partir do doc não é necessário; só troca o estado local. */
  private afterCoverUploaded(): void {
    if (!this.coverFile()) return;
    this.patch({ coverImageUrl: this.coverObjectUrl });
    this.coverObjectUrl = null;
    this.coverFile.set(null);
  }

  private async publish(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.saving()) return;
    const draft = this.draft();
    if (!isValidForPublish(draft)) {
      this.feedback.set({ ok: false, message: this.publishBlock() ?? 'Revise os passos anteriores — há campos obrigatórios faltando.' });
      return;
    }
    this.saving.set(true);
    try {
      const isPublishedEdit = this.isEdit() && this.existingListingStatus && !['draft', 'rascunho'].includes(this.existingListingStatus.toLowerCase());
      const id = await publishTournamentDraft({
        draft,
        managerId: uid,
        // Edição de torneio já publicado preserva o status atual (publish=false + isUpdate);
        // rascunho/criação publica com 'open'.
        publish: !isPublishedEdit,
        existingListingStatus: this.existingListingStatus,
        coverFile: this.coverFile(),
      });
      this.afterCoverUploaded();
      if (isPublishedEdit) {
        this.feedback.set({ ok: true, message: 'Alterações salvas.' });
        setTimeout(() => void this.router.navigate(['/painel/eventos', id]), 700);
      } else {
        this.publishedId.set(id);
      }
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao publicar o torneio.' });
    } finally {
      this.saving.set(false);
    }
  }

  // Resumos da revisão (espelham `review*Summary` do app)
  protected reviewSport(): string {
    return SPORT_LABEL[this.draft().sport];
  }

  protected reviewLocation(): string {
    const d = this.draft();
    const dates = d.startAt ? `${dateToInput(d.startAt)} a ${dateToInput(d.endAt)}` : 'Data a confirmar';
    return `${d.locationName.trim()}, ${d.city.trim()} · ${dates} · ${d.courtsCount} quadras`;
  }

  protected reviewCategories(): string {
    const d = this.draft();
    return `${d.categories.length} categorias · ${totalSpots(d)} vagas no total`;
  }

  protected reviewRegistration(): string {
    const d = this.draft();
    const period = `${dateToInput(d.registrationOpensAt)}–${dateToInput(d.registrationClosesAt)}`;
    const payment = d.paymentMode === 'appPixCard' ? 'Pix e cartão pelo app' : 'pagamento direto';
    const waitlist = d.waitlistEnabled ? 'lista de espera ativa' : 'sem lista de espera';
    return `${period} · ${payment} · ${waitlist}`;
  }

  protected reviewPrizes(): string {
    const d = this.draft();
    if (!d.cashPrizesEnabled) return 'Troféus/brindes (sem premiação em dinheiro)';
    return `Por categoria · ${this.brl(totalPrizeCents(d))} no total`;
  }

  protected reviewUniform(): string {
    const d = this.draft();
    if (!d.uniformRequired) return 'Sem kit na inscrição';
    const parts = ['Kit na inscrição'];
    if (d.uniformNumberOnShirt) parts.push('número');
    if (d.uniformNameOnShirt) parts.push('nome na camisa');
    return parts.join(' · ');
  }
}
