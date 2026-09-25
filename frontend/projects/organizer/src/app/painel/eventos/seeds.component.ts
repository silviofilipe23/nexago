import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentSportToLevelSportCode } from '@nexago/levels';
import { initialsOf, truncateName } from '../data/mock-data';
import { MIN_TEAMS_FOR_BRACKET, isBracketEligible } from '../data/bracket-eligibility';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { fetchAthleteRatings } from '../data/athlete-ratings-repository';
import {
  compareTeamLevelDesc,
  teamLevelScore,
  teamLevelsSummary,
  teamScoreLabel,
  type AthleteRatingLite,
  type TeamLevelScore,
} from '../data/team-level-score';
import {
  KOC_DEFAULT_ROUND_DURATION_SEC,
  KOC_MAX_ROUND_DURATION_SEC,
  KOC_MIN_ROUND_DURATION_SEC,
} from '../data/tournament-create.model';
import {
  KOC_LEGACY_MAX_TEAMS_PER_ROUND,
  kocApplyPhaseEdit,
  kocBracketCountOptions,
  kocClampMaxPerRound,
  kocPhaseLabelAt,
  kocPlanTotals,
  kocProposePhasePlan,
  type KocPhasePatch,
  type KocPhaseSpec,
} from '../data/koc-phase-plan';
import { generateCategoryBracket } from '../data/organizer-ops.service';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { getTournament, saveKocPhasePlan } from '../data/tournaments-repository';
import { ChaveamentoContextService } from '../chaveamento/chaveamento-context.service';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

export type BracketFormat = 'groups_knockout' | 'single_elimination' | 'double_elimination' | 'king_of_court' | 'round_robin';

const FORMAT_LABEL: Record<BracketFormat, string> = {
  groups_knockout: 'Grupos + mata-mata',
  single_elimination: 'Eliminatória simples',
  double_elimination: 'Dupla eliminatória',
  king_of_court: 'King of the Court',
  round_robin: 'Todos contra todos',
};

/**
 * Formato salvo na categoria → formato da tela. Deriva de `FORMAT_LABEL` de
 * propósito: a lista literal que existia aqui precisava ser lembrada a cada
 * formato novo, e um formato ausente dela reabria a categoria como
 * "grupos + mata-mata" em silêncio — com os steppers de grupo por cima.
 */
export function bracketFormatFromSaved(raw: string | null | undefined): BracketFormat | null {
  const key = (raw ?? '').trim();
  return key in FORMAT_LABEL ? (key as BracketFormat) : null;
}

/** Piso do "todos contra todos": com 2 duplas a final repetiria o único jogo da tabela. */
const RR_MIN_TEAMS = 3;

/** Só há 3º lugar a disputar quando a tabela tem 4º colocado. */
const RR_MIN_TEAMS_FOR_THIRD_PLACE = 4;

/** Acima de 8 duplas (C(8,2) = 28) a tabela passa a não caber num dia de quadra. */
const RR_LONG_TABLE_MATCHES = 28;

/** Piso do King of the Court: com 2 duplas não há fila nem trono. */
const KOC_MIN_TEAMS = 3;

/**
 * Tamanhos suportados pelas plantas estáticas de dupla eliminação
 * (`functions/src/bracket-definitions`). É CÓPIA: a fonte da verdade é
 * `SUPPORTED_DE_TEAM_COUNTS` lá, e esta lista existe só para o painel não
 * chamar a CF sabendo que ela vai recusar (`de_unsupported_team_count`).
 * Contígua de 4 a 32 desde 15/09/2026, quando 28 a 31 entraram por derivação
 * da de 32 — antes disso havia buraco. Se um tamanho sair do conjunto de novo,
 * é aqui que o painel precisa acompanhar, senão ele libera na tela o que a CF
 * recusa na publicação.
 */
const DE_TEAM_COUNTS: readonly number[] = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30, 31, 32,
];

/** Faixas contíguas agrupadas, para a mensagem não mentir: hoje "4 a 32". */
function describeTeamCounts(counts: readonly number[]): string {
  const ranges: string[] = [];
  for (let i = 0; i < counts.length; ) {
    let end = i;
    while (end + 1 < counts.length && counts[end + 1] === counts[end] + 1) end++;
    ranges.push(end === i ? `${counts[i]}` : `${counts[i]} a ${counts[end]}`);
    i = end + 1;
  }
  if (ranges.length <= 1) return ranges[0] ?? '';
  return `${ranges.slice(0, -1).join(', ')} ou ${ranges[ranges.length - 1]}`;
}

interface GroupPreview {
  id: string;
  teamIds: string[];
}

/** Um rosto do stack de avatares da inscrição. As iniciais vêm prontas porque o separador
 *  muda: nome de atleta quebra por espaço ("Ana Paula" → AP), rótulo de dupla por " / "
 *  ("Ana Paula / Beatriz" → AB). */
interface SeedAthlete {
  name: string;
  initials: string;
  photoUrl: string | null;
}

/** Fisher–Yates — sorteio uniforme (o antigo `sort(() => Math.random() - 0.5)`
 *  é enviesado: depende da implementação do sort e não dá chance igual a todas
 *  as permutações). */
function shuffled<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Geração de chave real — espelha `organizer_category_generate_*` (Flutter): duplas elegíveis
 *  (pagas, fora da fila, dupla completa — o servidor re-filtra), ordem de seeds ajustável,
 *  formato (dos 3 suportados; default = `bracketFormat` salvo na categoria), prévia de grupos
 *  em snake draft (`distributeTeamsIntoGroups`) pra grupos+mata-mata, e publicação via
 *  `generateCategoryBracket`. Se a chave já tem resultados o servidor devolve
 *  `bracket_has_results` — regenerar exige confirmação explícita e reenvio com `force`. */
@Component({
  selector: 'og-seeds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgAvatarComponent, OgToggleRowComponent, NxProcessingOverlayComponent, NxSpinnerComponent, OgConfirmDialogComponent],
  template: `
    <og-page-header title="Gerar chave" [subtitle]="headerSubtitle()">
      <button type="button" class="og-ghost-btn" (click)="cancel()">Cancelar</button>
      <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="publishing() || !canPublish()" (click)="publish()">
        @if (publishing()) {
          <app-nx-spinner [size]="14" tone="dark" />
        } @else {
          <og-icon name="bracket" [size]="14" />
        }
        {{ publishing() ? 'Publicando…' : 'Publicar chave' }}
      </button>
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col">
        @if (loading()) {
          <og-card><p class="og-seeds-empty">Carregando inscrições…</p></og-card>
        } @else if (!category()) {
          <og-card><p class="og-seeds-empty">Categoria não encontrada.</p></og-card>
        } @else {
          <og-card kicker="Formato" title="Sistema de disputa">
            <div class="og-filter-bar">
              @for (f of formats; track f) {
                <button type="button" class="og-chip" [class.active]="format() === f" (click)="setFormat(f)">{{ formatLabel[f] }}</button>
              }
            </div>
            @if (format() === 'double_elimination' && !deCountOk()) {
              <p class="og-seeds-error">Dupla eliminação está disponível para {{ deCounts }} duplas (há {{ eligible().length }}).</p>
            }
            @if (format() === 'groups_knockout') {
              <div class="og-field-grid" style="margin-top:14px">
                <div class="og-seeds-stepper">
                  <span class="lbl">Duplas por grupo</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpTeamsPerGroup(-1)">−</button>
                    <span>{{ teamsPerGroup() }}</span>
                    <button type="button" (click)="bumpTeamsPerGroup(1)">+</button>
                  </div>
                </div>
                <div class="og-seeds-stepper">
                  <span class="lbl">Classificam por grupo</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpQualifiers(-1)">−</button>
                    <span>{{ qualifiersPerGroup() }}</span>
                    <button type="button" (click)="bumpQualifiers(1)">+</button>
                  </div>
                </div>
              </div>
              @if (!knockoutBalanced()) {
                <p class="og-seeds-error">
                  {{ groupCount() * qualifiersPerGroup() }} classificados ({{ groupCount() }} grupos × {{ qualifiersPerGroup() }}) não formam um
                  mata-mata equilibrado — ajuste pra totais como 4, 8 ou 16.
                </p>
              }
            }
            @if (format() === 'round_robin') {
              @if (eligible().length < rrMinTeams) {
                <p class="og-seeds-error">
                  Todos contra todos precisa de ao menos {{ rrMinTeams }} duplas — com 2 a tabela é um jogo só e a final
                  repetiria o mesmo confronto.
                </p>
              } @else {
                <p class="og-seeds-hint og-seeds-rr-summary">{{ rrSummary() }}</p>
              }
              @if (rrTableTooLong()) {
                <p class="og-seeds-error og-seeds-rr-warning">
                  São {{ rrMatchCount() }} jogos só nesta categoria — com poucas quadras a tabela não fecha no dia.
                  Grupos + mata-mata chega no mesmo campeão com bem menos jogos.
                </p>
              }
            }
            @if (format() === 'king_of_court') {
              <!-- O plano é a config: o que esta tabela mostra é o que vai em
                   bracketConfig e o que fica gravado na categoria (o sorteio ao
                   vivo lê de lá). Os três números soltos de antes viraram as
                   colunas, uma linha por fase. -->
              <div class="og-field-grid" style="margin-top:14px">
                <div class="og-seeds-stepper">
                  <span class="lbl">Máximo por bateria</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpKocMaxPerRound(-1)">−</button>
                    <span>{{ kocMaxTeamsPerRound() }}</span>
                    <button type="button" (click)="bumpKocMaxPerRound(1)">+</button>
                  </div>
                </div>
                <div class="og-seeds-stepper">
                  <span class="lbl">Duração padrão</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpKocDuration(-1)">−</button>
                    <span>{{ kocDurationLabel() }}</span>
                    <button type="button" (click)="bumpKocDuration(1)">+</button>
                  </div>
                </div>
              </div>

              @if (kocPlanChanged()) {
                <p class="og-seeds-hint">
                  As inscritas mudaram para {{ eligible().length }} — a proposta foi refeita.
                </p>
              }

              @if (kocPhases().length === 0) {
                <p class="og-seeds-error">
                  Com {{ eligible().length }} duplas não dá para montar uma rodada de
                  King of the Court.
                </p>
                <p class="og-seeds-hint">
                  <button type="button" class="og-koc-plan-redo" (click)="reproposeKocPlan()">
                    Refazer proposta
                  </button>
                </p>
              } @else {
                <div class="og-koc-plan" style="margin-top:14px">
                  @for (phase of kocPhases(); track $index) {
                    <div class="og-koc-plan-row">
                      <span class="og-koc-plan-phase">{{ kocPhaseTitle($index) }}</span>

                      <label class="og-koc-plan-field">
                        <span class="lbl">Chaves</span>
                        @if (kocPhasePasses($index) === null) {
                          <!-- A final é UMA quadra por definição — nada de seletor aqui.
                               kocBracketOptions não sabe que este índice é o último
                               (só olha tamanho de campo e teto), então ele ofereceria
                               "2 chaves" pra um campo de 6 com teto 6: dois pódios
                               desconectados. assertPlan no servidor recusa isso desde
                               o fix round 1 da Task 7, mas a tela nem deveria oferecer. -->
                          <span class="og-koc-plan-final-value">{{ phase.bracketSizes.length }}</span>
                        } @else {
                          <!-- Só [selected] no option — [value] no select junto de
                               opções geradas por @for não seleciona de forma
                               confiável (armadilha documentada dos portais Angular). -->
                          <select (change)="editKocPhase($index, { bracketCount: +$any($event.target).value })">
                            @for (n of kocBracketOptions($index); track n) {
                              <option [selected]="n === phase.bracketSizes.length">{{ n }}</option>
                            }
                          </select>
                        }
                        <small>{{ phase.bracketSizes.join(', ') }}</small>
                      </label>

                      <div class="og-seeds-stepper">
                        <span class="lbl">Baterias</span>
                        <div class="ctrl">
                          <button type="button"
                            (click)="editKocPhase($index, { roundsPerBracket: phase.roundsPerBracket - 1 })">−</button>
                          <span>{{ phase.roundsPerBracket }}</span>
                          <button type="button"
                            (click)="editKocPhase($index, { roundsPerBracket: phase.roundsPerBracket + 1 })">+</button>
                        </div>
                      </div>

                      <div class="og-seeds-stepper">
                        <span class="lbl">Classificam</span>
                        <div class="ctrl">
                          @if (kocPhasePasses($index) === null) {
                            <span>pódio</span>
                          } @else {
                            <button type="button"
                              (click)="editKocPhase($index, { qualifiersPerRound: phase.qualifiersPerRound - 1 })">−</button>
                            <span>{{ phase.qualifiersPerRound }}</span>
                            <button type="button"
                              (click)="editKocPhase($index, { qualifiersPerRound: phase.qualifiersPerRound + 1 })">+</button>
                          }
                        </div>
                      </div>

                      <div class="og-seeds-stepper">
                        <span class="lbl">Duração</span>
                        <div class="ctrl">
                          <button type="button" (click)="bumpKocPhaseDuration($index, -1)">−</button>
                          <span>{{ kocPhaseDurationLabel($index) }}</span>
                          <button type="button" (click)="bumpKocPhaseDuration($index, 1)">+</button>
                        </div>
                      </div>

                      <span class="og-koc-plan-passes">
                        @if (kocPhasePasses($index); as passes) { Passam {{ passes }} }
                        @else { Pódio }
                      </span>
                    </div>
                  }
                </div>

                <p class="og-seeds-hint">
                  {{ kocTotals().rounds }} rodadas · {{ kocTotals().label }} em 1 quadra
                  <button type="button" class="og-koc-plan-redo" (click)="reproposeKocPlan()">
                    Refazer proposta
                  </button>
                </p>
              }
            }
          </og-card>

          <og-card kicker="Semeadura" title="Critério">
            <og-toggle-row
              title="Respeitar ordem de seeds"
              [desc]="seedCriteriaDesc()"
              [on]="useSeeds()"
              (toggled)="useSeeds.set($event)"
            />
          </og-card>

          <og-card [kicker]="'Duplas elegíveis (' + eligible().length + ')'" title="Ordem de semeadura">
            <button
              card-action
              type="button"
              class="og-mini-btn"
              [disabled]="!canSortByLevel()"
              [title]="sortByLevelHint()"
              (click)="sortByLevel()"
            >
              <og-icon name="trophy" [size]="14" />Ordenar por nível
            </button>
            @if (eligible().length < minTeams) {
              <p class="og-seeds-empty">É necessário ao menos {{ minTeams }} duplas pagas (e completas) pra gerar a chave.</p>
            }
            <div
              class="og-seed-list"
              [class.reorderable]="useSeeds()"
              (dragover)="onListDragOver($event)"
            >
              @for (t of eligible(); track t.teamId; let i = $index; let last = $last) {
                <div
                  class="og-seed-row"
                  [class.top]="useSeeds() && i < headCount()"
                  [class.dragging]="dragFrom() === i"
                  [class.drag-over]="dragOver() === i && dragFrom() !== i"
                  (dragover)="onRowDragOver(i, $event)"
                  (dragleave)="onRowDragLeave(i, $event)"
                  (drop)="onDrop(i, $event)"
                >
                  @if (useSeeds()) {
                    <span
                      class="og-seed-handle"
                      draggable="true"
                      title="Arrastar para reordenar"
                      aria-label="Arrastar para reordenar"
                      (dragstart)="onDragStart(i, $event)"
                      (dragend)="onDragEnd()"
                    >
                      <og-icon name="grip" [size]="14" />
                    </span>
                  }
                  <span class="og-seed-pos" [class.top]="useSeeds() && i < headCount()">{{ i + 1 }}</span>
                  <span class="og-seed-avatars">
                    @for (p of athletesOf(t); track $index; let ai = $index; let n = $count) {
                      <og-avatar
                        zoomable
                        [initials]="p.initials"
                        [personName]="p.name"
                        [meta]="athleteMeta(t)"
                        [photoUrl]="p.photoUrl"
                        [size]="36"
                        [style.z-index]="n - ai"
                      />
                    }
                  </span>
                  <span style="flex:1;min-width:0">
                    <div class="og-seed-name" [title]="t.teamName">{{ truncate(t.teamName, 32) }}</div>
                    <div class="og-seed-levels">{{ levelsOf(t) }}</div>
                  </span>
                  <span class="og-seed-score" [title]="scoreHint(t)">{{ scoreLabel(t) }}</span>
                  @if (useSeeds()) {
                    <button type="button" class="og-ghost-btn" [disabled]="i === 0" (click)="move(i, -1)">↑</button>
                    <button type="button" class="og-ghost-btn" [disabled]="last" (click)="move(i, 1)">↓</button>
                  }
                </div>
              }
            </div>
          </og-card>

          @if (format() === 'groups_knockout' && groups().length > 0) {
            <og-card kicker="Prévia" title="Grupos">
              <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
                <button type="button" class="og-mini-btn" (click)="redraw()"><og-icon name="whistle" [size]="14" />Sortear de novo</button>
              </div>
              <div class="og-seeds-groups">
                @for (g of groups(); track g.id) {
                  <div class="og-seeds-group">
                    <div class="og-seeds-group-title">Grupo {{ g.id }}</div>
                    @for (teamId of g.teamIds; track teamId) {
                      <div class="og-seeds-group-team">
                        @if (teamOf(teamId); as t) {
                          <span class="og-seed-avatars sm">
                            @for (p of athletesOf(t); track $index; let ai = $index; let n = $count) {
                              <og-avatar
                                zoomable
                                [initials]="p.initials"
                                [personName]="p.name"
                                [meta]="athleteMeta(t)"
                                [photoUrl]="p.photoUrl"
                                [size]="24"
                                [style.z-index]="n - ai"
                              />
                            }
                          </span>
                        }
                        <span class="og-seeds-group-team-name" [title]="teamNameOf(teamId)">{{ teamNameOf(teamId) }}</span>
                      </div>
                    }
                  </div>
                }
              </div>
            </og-card>
          }

          @if (feedback(); as fb) {
            <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
          }
        }
      </div>
    </div>
    @if (publishing()) {
      <app-nx-processing-overlay title="Sorteando a chave…" description="Distribuindo as cabeças de chave e sorteando as demais duplas nos grupos." />
    }

    @if (regenPending()) {
      <og-confirm-dialog
        title="A chave já tem resultados"
        message="Esta categoria já tem partidas em andamento ou concluídas. Regerar a chave APAGA os placares e a classificação que saíram delas — não há como recuperar."
        confirmLabel="Regerar e apagar"
        [destructive]="true"
        (confirmed)="confirmRegen()"
        (cancelled)="regenPending.set(false)"
      />
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }

    .og-seed-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .og-seed-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      transition: border-color 120ms ease, opacity 120ms ease, box-shadow 120ms ease;
    }
    .og-seed-row.top {
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-seed-row.dragging {
      opacity: 0.45;
    }
    .og-seed-row.drag-over {
      border-color: var(--nx-orange-500);
      box-shadow: inset 0 0 0 1px rgba(255, 106, 26, 0.35);
    }
    .og-seed-handle {
      flex: none;
      display: grid;
      place-items: center;
      width: 22px;
      height: 28px;
      margin: 0 -4px 0 -2px;
      color: var(--nx-text-mute);
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .og-seed-handle:active {
      cursor: grabbing;
    }
    .og-seed-handle:hover {
      color: var(--nx-text);
    }
    .og-seed-pos {
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
    .og-seed-pos.top {
      background: var(--nx-orange-500);
      color: #0a0a0a;
    }
    /* Avatares da dupla/equipe sobrepostos, como na listagem de duplas da categoria. O anel é
       da cor do fundo da linha (surface-0) pra separar um rosto do outro na pilha. */
    .og-seed-avatars {
      display: flex;
      align-items: center;
      flex: none;
    }
    .og-seed-avatars .og-avatar {
      flex-shrink: 0;
      box-shadow: 0 0 0 2px var(--nx-surface-0);
    }
    .og-seed-avatars .og-avatar + .og-avatar {
      margin-left: -12px;
    }
    .og-seed-avatars.sm .og-avatar + .og-avatar {
      margin-left: -9px;
    }
    .og-seed-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-seed-levels {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-seed-score {
      flex: none;
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
    .og-seeds-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .og-seeds-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 10px 0 0;
    }
    .og-seeds-hint {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }
    .og-koc-plan-row {
      display: grid;
      grid-template-columns: 1.2fr repeat(4, 1fr) 0.8fr;
      gap: 10px;
      align-items: end;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    // Grid explícito, não flex: a tabela precisa das colunas ALINHADAS entre as
    // linhas, e flex alinha cada linha por conta própria.
    @media (max-width: 720px) {
      .og-koc-plan-row { grid-template-columns: 1fr 1fr; }
    }
    .og-koc-plan-phase { font-weight: 600; }
    .og-koc-plan-passes { font-variant-numeric: tabular-nums; opacity: .8; }
    .og-koc-plan-field {
      display: flex;
      flex-direction: column;
    }
    .og-koc-plan-field .lbl {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }
    .og-koc-plan-field select {
      height: 30px;
      border-radius: 8px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      padding: 0 8px;
    }
    .og-koc-plan-final-value {
      height: 30px;
      display: flex;
      align-items: center;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-koc-plan-field small {
      display: block;
      margin-top: 4px;
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      color: var(--nx-text-mute);
    }
    .og-koc-plan-redo {
      margin-left: 6px;
      padding: 0;
      border: none;
      background: none;
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-orange-500);
      cursor: pointer;
    }
    .og-seeds-stepper .lbl {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }
    .og-seeds-stepper .ctrl {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .og-seeds-stepper .ctrl button {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-size: 15px;
      cursor: pointer;
    }
    .og-seeds-stepper .ctrl span {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      min-width: 24px;
      text-align: center;
    }
    .og-seeds-groups {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .og-seeds-group {
      padding: 12px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-seeds-group-title {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      margin-bottom: 8px;
    }
    .og-seeds-group-team {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-display);
      font-weight: 500;
      font-size: 12.5px;
      color: var(--nx-text);
      padding: 5px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    /* min-width zerado porque o item flex tem min-width auto por padrão — sem isso um nome
       longo estoura o card do grupo em vez de truncar. */
    .og-seeds-group-team-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-seeds-group-team:last-child {
      border-bottom: none;
    }
  `,
})
export class SeedsComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  private readonly router = inject(Router);
  private readonly ctx = inject(ChaveamentoContextService);

  protected readonly truncate = truncateName;
  protected readonly formats: BracketFormat[] = ['groups_knockout', 'single_elimination', 'double_elimination', 'king_of_court', 'round_robin'];
  protected readonly formatLabel = FORMAT_LABEL;
  protected readonly deCounts = describeTeamCounts(DE_TEAM_COUNTS);
  protected readonly minTeams = MIN_TEAMS_FOR_BRACKET;
  protected readonly rrMinTeams = RR_MIN_TEAMS;

  protected readonly loading = signal(true);
  protected readonly publishing = signal(false);
  /** Confirmação extra de regerar chave por cima de resultados já lançados. */
  protected readonly regenPending = signal(false);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly eligible = signal<TournamentInscription[]>([]);
  protected readonly format = signal<BracketFormat>('groups_knockout');
  protected readonly useSeeds = signal(true);
  protected readonly teamsPerGroup = signal(4);
  protected readonly qualifiersPerGroup = signal(2);
  protected readonly kocMaxTeamsPerRound = signal(KOC_LEGACY_MAX_TEAMS_PER_ROUND);
  protected readonly kocRoundDurationSec = signal(KOC_DEFAULT_ROUND_DURATION_SEC);
  /** Plano em edição. Reproposto sempre que a contagem de inscritas muda. */
  protected readonly kocPhases = signal<KocPhaseSpec[]>([]);
  /** Contagem de inscritas para a qual o plano atual foi montado. Signal, não
   *  campo: é lido por um computed, e campo simples não dispara recálculo. */
  private readonly kocPlanFor = signal(0);
  protected readonly groups = signal<GroupPreview[]>([]);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  /** Índice da dupla sendo arrastada na lista de seeds — null fora do drag. */
  protected readonly dragFrom = signal<number | null>(null);
  /** Índice sob o cursor durante o drag — feedback visual de onde a linha cai. */
  protected readonly dragOver = signal<number | null>(null);
  /** Rating técnico por uid — vazio nos esportes sem engine de rating. */
  private readonly ratings = signal<Map<string, AthleteRatingLite>>(new Map());

  private readonly sportCode = computed(() => tournamentSportToLevelSportCode(this.tournament()?.sportId));

  /** Pontuação de nível por inscrição — base da ordenação sugerida de cabeças de chave. */
  private readonly scores = computed(() => {
    const sportCode = this.sportCode();
    const ratings = this.ratings();
    return new Map<string, TeamLevelScore>(
      this.eligible().map((t) => [
        t.id,
        teamLevelScore(t.participants, sportCode, t.participants.map((p) => ratings.get(p.uid))),
      ]),
    );
  });

  /** Só faz sentido reordenar quando a ordem importa (seeds ligados), há o que ordenar e
   *  ao menos uma dupla tem nível — senão o clique não mudaria nada. */
  protected readonly canSortByLevel = computed(
    () => this.useSeeds() && this.eligible().length > 1 && [...this.scores().values()].some((s) => s.points != null),
  );

  protected readonly sortByLevelHint = computed(() => {
    if (!this.useSeeds()) return 'Ligue "Respeitar ordem de seeds" para ordenar pela pontuação de nível.';
    if (!this.canSortByLevel()) return 'Nenhuma dupla tem nível informado.';
    return 'Ordena da maior para a menor pontuação de nível — você ainda pode ajustar arrastando ou com as setas.';
  });

  protected readonly category = computed<OrganizerTournamentCategory | null>(
    () => this.tournament()?.categories.find((c) => c.id === this.catId()) ?? null,
  );

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    const cat = this.category();
    if (!t || !cat) return '';
    return `${t.name} · ${cat.name} · ${this.eligible().length} duplas confirmadas`;
  });

  protected readonly groupCount = computed(() => {
    const n = this.eligible().length;
    if (n <= 0) return 1;
    const per = Math.max(this.teamsPerGroup(), 2);
    return Math.min(Math.max(Math.ceil(n / per), 1), n);
  });

  protected readonly headCount = computed(() => this.groupCount());

  /** Total de classificados precisa ser potência de 2 — mesma regra do servidor
   *  (`isBalancedQualifierTotal`). O teste antigo de `total >> 1` aceitava
   *  totais ímpares (3, 5…) por causa do arredondamento. */
  protected readonly knockoutBalanced = computed(() => {
    const total = this.groupCount() * this.qualifiersPerGroup();
    return total >= 2 && (total & (total - 1)) === 0;
  });

  /** Tamanho da tabela: C(n,2). É o número que decide se o formato cabe no dia. */
  protected readonly rrMatchCount = computed(() => {
    const n = this.eligible().length;
    return n < 2 ? 0 : (n * (n - 1)) / 2;
  });

  protected readonly rrSummary = computed(() => {
    const n = this.eligible().length;
    const base = `${n} duplas · ${this.rrMatchCount()} jogos na tabela, mais a final (1º × 2º)`;
    // Sem 4º colocado não há o que disputar — o builder também não cria a partida.
    return n >= RR_MIN_TEAMS_FOR_THIRD_PLACE ? `${base} e a disputa de 3º (3º × 4º).` : `${base}.`;
  });

  protected readonly rrTableTooLong = computed(() => this.rrMatchCount() > RR_LONG_TABLE_MATCHES);

  /** No "todos contra todos" não existe grupo pra distribuir cabeça: a ordem de
   *  seeds só alimenta o rodízio, que decide a SEQUÊNCIA dos jogos. */
  protected readonly seedCriteriaDesc = computed(() =>
    this.format() === 'round_robin'
      ? 'Todo mundo joga contra todo mundo — a ordem só define a sequência dos jogos. Desligue pra sorteio 100% aleatório.'
      : 'Cabeças distribuídas primeiro (1 por grupo, snake). Desligue pra sorteio 100% aleatório.',
  );

  protected readonly deCountOk = computed(() => DE_TEAM_COUNTS.includes(this.eligible().length));

  protected readonly canPublish = computed(() => {
    if (this.eligible().length < MIN_TEAMS_FOR_BRACKET) return false;
    // KOTC tem piso próprio e não usa grupos nem plantas de dupla eliminação:
    // sai antes das duas checagens abaixo. Plano vazio ("não dá para montar",
    // proposta ou edição) não pode publicar — geraria com um formato que a
    // tela nem mostra.
    if (this.format() === 'king_of_court') return this.eligible().length >= KOC_MIN_TEAMS && this.kocPhases().length > 0;
    if (this.format() === 'double_elimination') return this.deCountOk();
    if (this.format() === 'round_robin') return this.eligible().length >= RR_MIN_TEAMS;
    if (this.format() === 'groups_knockout') return this.knockoutBalanced() && this.groups().length > 0;
    return true;
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      const cid = this.catId();
      if (!tid || !cid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid, cid);
    });

    // As inscrições continuam mexendo enquanto a tela está aberta. Um plano
    // montado para 10 duplas não fecha com 12, e a geração recusaria com todo
    // mundo já na quadra — então a proposta acompanha a contagem sozinha.
    effect(() => {
      const teams = this.eligible().length;
      if (this.format() !== 'king_of_court') return;
      // `publish()` já tira o próprio retrato do plano antes de gravar (não
      // depende deste efeito ficar quieto pra ser consistente) — mas trocar o
      // plano debaixo do organizador NO MEIO do publish, mesmo que o valor
      // enviado já esteja congelado, é confuso por si só. Segura aqui; ao
      // voltar (`publishing` cai pra `false` no `finally`), o efeito roda de
      // novo e recupera qualquer contagem que tenha mudado enquanto esperava.
      if (this.publishing()) return;
      if (teams === this.kocPlanFor()) return;
      untracked(() => this.reproposeKocPlan());
    });
  }

  private async load(tid: string, cid: string): Promise<void> {
    try {
      const [tournament, allInscriptions] = await Promise.all([getTournament(tid), listInscriptions(tid)]);
      this.tournament.set(tournament);
      const eligible = allInscriptions.filter((i) => i.categoryId === cid && isBracketEligible(i));
      this.eligible.set(eligible);
      this.ratings.set(
        await fetchAthleteRatings(
          eligible.flatMap((i) => i.participants.map((p) => p.uid)),
          tournamentSportToLevelSportCode(tournament?.sportId),
        ),
      );
      const cat = tournament?.categories.find((c) => c.id === cid) ?? null;
      const savedFormat = bracketFormatFromSaved(cat?.bracketFormat);
      if (savedFormat) this.format.set(savedFormat);
      if (cat) {
        const per = Math.max(2, cat.teamsPerGroup);
        this.teamsPerGroup.set(per);
        this.qualifiersPerGroup.set(Math.min(Math.max(1, cat.qualifiersPerGroup), per - 1));
        this.kocMaxTeamsPerRound.set(kocClampMaxPerRound(cat.kocMaxTeamsPerRound));
        this.kocRoundDurationSec.set(cat.kocRoundDurationSec || KOC_DEFAULT_ROUND_DURATION_SEC);
        // Plano salvo só vale para a contagem com que foi montado; a tela
        // sempre repropõe e o organizador reconhece o que mudou.
        this.reproposeKocPlan();
      }
      this.redraw();
    } finally {
      this.loading.set(false);
    }
  }

  protected setFormat(f: BracketFormat): void {
    this.format.set(f);
    this.feedback.set(null);
    if (f === 'groups_knockout') this.redraw();
  }

  /** Repropõe do zero com a contagem atual. É o botão "Refazer proposta" e
   *  também o que roda sozinho quando as inscritas mudam. */
  protected reproposeKocPlan(): void {
    const teams = this.eligible().length;
    const previous = this.kocPlanFor();
    this.kocPlanFor.set(teams);
    this.kocPlanChanged.set(previous > 0 && previous !== teams);
    this.kocPhases.set(
      kocProposePhasePlan(teams, this.kocMaxTeamsPerRound(), this.kocRoundDurationSec()),
    );
  }

  /** Ligado quando a reproposta aconteceu porque a CONTAGEM mudou — não quando
   *  o organizador clicou em "Refazer proposta" nem na primeira montagem. */
  protected readonly kocPlanChanged = signal(false);

  protected bumpKocMaxPerRound(delta: number): void {
    this.kocMaxTeamsPerRound.update((v) => kocClampMaxPerRound(v + delta));
    this.reproposeKocPlan();
  }

  protected bumpKocDuration(delta: number): void {
    this.kocRoundDurationSec.update((v) => Math.min(
      KOC_MAX_ROUND_DURATION_SEC,
      Math.max(KOC_MIN_ROUND_DURATION_SEC, v + delta * 300),
    ));
    this.reproposeKocPlan();
  }

  protected kocBracketOptions(index: number): number[] {
    const phase = this.kocPhases()[index];
    if (!phase) return [];
    const field = phase.bracketSizes.reduce((a, b) => a + b, 0);
    return kocBracketCountOptions(field, this.kocMaxTeamsPerRound());
  }

  /** Aplica a edição de uma fase. `kocApplyPhaseEdit` pode devolver `[]` quando
   *  a cascata não fecha (ex.: 5 duplas com teto 4) — mesma convenção de "não
   *  dá para montar" da proposta, tratada pelo mesmo bloco do template. */
  protected editKocPhase(index: number, patch: KocPhasePatch): void {
    this.kocPhases.update((plan) =>
      kocApplyPhaseEdit(plan, index, patch, this.kocMaxTeamsPerRound()),
    );
  }

  /** `kocApplyPhaseEdit` não clampa `durationSec` (só quem chama sabe o
   *  intervalo aceitável — o mesmo motivo por que `bumpKocDuration` clampa o
   *  padrão global). Sem isso o botão "−" desceria a bateria a zero e depois
   *  ao negativo, e `parseKocPhases` derruba o plano INTEIRO quando salvo. */
  protected bumpKocPhaseDuration(index: number, delta: number): void {
    const phase = this.kocPhases()[index];
    if (!phase) return;
    const durationSec = Math.min(
      KOC_MAX_ROUND_DURATION_SEC,
      Math.max(KOC_MIN_ROUND_DURATION_SEC, phase.durationSec + delta * 300),
    );
    this.editKocPhase(index, { durationSec });
  }

  /** Quantas duplas a fase seguinte recebe. `null` na final. */
  protected kocPhasePasses(index: number): number | null {
    const plan = this.kocPhases();
    const phase = plan[index];
    if (!phase || index === plan.length - 1) return null;
    return phase.bracketSizes.length * phase.roundsPerBracket * phase.qualifiersPerRound;
  }

  /** A mesma regra que o aviso de divergência do chaveamento usa — os dois
   *  chamam `kocPhaseLabelAt` para um "Semifinal" renomeado aqui não ficar
   *  calado lá. */
  protected kocPhaseTitle(index: number): string {
    return kocPhaseLabelAt(index, this.kocPhases().length);
  }

  protected readonly kocTotals = computed(() =>
    kocPlanTotals(this.kocPhases(), 1),
  );

  protected kocDurationLabel(): string {
    return `${Math.round(this.kocRoundDurationSec() / 60)} min`;
  }

  protected kocPhaseDurationLabel(index: number): string {
    const phase = this.kocPhases()[index];
    return phase ? `${Math.round(phase.durationSec / 60)} min` : '—';
  }

  protected bumpTeamsPerGroup(delta: number): void {
    this.teamsPerGroup.update((v) => Math.min(Math.max(v + delta, 2), 8));
    // Reduzir o grupo pode deixar os classificados acima do teto (grupo de 2 não
    // classifica 3) — re-clampa, senão o servidor rejeita com "group_too_small".
    this.qualifiersPerGroup.update((q) => Math.min(q, Math.max(this.teamsPerGroup() - 1, 1)));
    this.redraw();
  }

  protected bumpQualifiers(delta: number): void {
    this.qualifiersPerGroup.update((v) => Math.min(Math.max(v + delta, 1), Math.max(this.teamsPerGroup() - 1, 1)));
  }

  /** Rostos da inscrição — todos os atletas do elenco (dupla = 2, equipe = até 5), igual à
   *  listagem de duplas da categoria. Inscrição cujo elenco ainda não resolveu perfil cai no
   *  rótulo da equipe com iniciais, sem foto: era exatamente o que a tela mostrava antes. */
  protected athletesOf(t: TournamentInscription): SeedAthlete[] {
    if (t.participants.length > 0) {
      return t.participants.slice(0, 5).map((p) => ({ name: p.name, initials: initialsOf(p.name), photoUrl: p.photoUrl }));
    }
    return [{ name: t.teamName, initials: initialsOf(t.teamName, ' / '), photoUrl: null }];
  }

  /** Contexto da foto ampliada: o que o organizador precisa ler pra confirmar quem é. */
  protected athleteMeta(t: TournamentInscription): string {
    return [this.category()?.name, t.teamName].filter(Boolean).join(' · ');
  }

  protected teamOf(teamId: string): TournamentInscription | null {
    return this.eligible().find((t) => t.teamId === teamId) ?? null;
  }

  protected scoreLabel(t: TournamentInscription): string {
    const score = this.scores().get(t.id);
    return score ? teamScoreLabel(score) : '—';
  }

  protected scoreHint(t: TournamentInscription): string {
    const score = this.scores().get(t.id);
    if (!score || score.points == null) return 'Pontuação indisponível — atleta sem nível informado';
    const base = `Pontuação de nível: ${score.points} de 10`;
    return score.rating == null ? base : `${base} · rating técnico ${Math.round(score.rating)}`;
  }

  protected levelsOf(t: TournamentInscription): string {
    const score = this.scores().get(t.id);
    return score ? teamLevelsSummary(score) : 'Nível não informado';
  }

  /** Sugestão de semeadura pela força declarada: maior pontuação primeiro, rating como
   *  desempate, duplas sem nível no fim. Só reordena a lista — o organizador ainda ajusta
   *  arrastando ou com as setas antes de publicar. */
  protected sortByLevel(): void {
    if (!this.canSortByLevel()) return;
    const scores = this.scores();
    const fallback: TeamLevelScore = { points: null, members: [], rating: null };
    this.eligible.update((list) =>
      // `sort` do JS é estável (ES2019+): duplas empatadas mantêm a ordem atual da tela.
      [...list].sort((a, b) => compareTeamLevelDesc(scores.get(a.id) ?? fallback, scores.get(b.id) ?? fallback)),
    );
    this.redraw();
  }

  protected move(index: number, delta: number): void {
    this.eligible.update((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
    this.redraw();
  }

  /** Reordena a lista de seeds pelo handle (HTML5 DnD). Só ativo com "Respeitar ordem
   *  de seeds" — sem seeds a ordem da tela não importa (o publish embaralha). */
  protected onDragStart(index: number, event: DragEvent): void {
    if (!this.useSeeds()) {
      event.preventDefault();
      return;
    }
    this.dragFrom.set(index);
    this.dragOver.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    const row = (event.currentTarget as HTMLElement | null)?.closest('.og-seed-row');
    if (row instanceof HTMLElement && event.dataTransfer) {
      event.dataTransfer.setDragImage(row, 24, row.offsetHeight / 2);
    }
  }

  protected onListDragOver(event: DragEvent): void {
    if (this.dragFrom() == null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected onRowDragOver(index: number, event: DragEvent): void {
    if (this.dragFrom() == null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.dragOver() !== index) this.dragOver.set(index);
  }

  protected onRowDragLeave(index: number, event: DragEvent): void {
    const related = event.relatedTarget;
    if (related instanceof Node && (event.currentTarget as Node).contains(related)) return;
    if (this.dragOver() === index) this.dragOver.set(null);
  }

  protected onDrop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const from = this.dragFrom();
    this.dragFrom.set(null);
    this.dragOver.set(null);
    if (from == null || from === targetIndex || !this.useSeeds()) return;
    this.eligible.update((list) => {
      if (from < 0 || from >= list.length || targetIndex < 0 || targetIndex >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(targetIndex, 0, item!);
      return next;
    });
    this.redraw();
  }

  protected onDragEnd(): void {
    this.dragFrom.set(null);
    this.dragOver.set(null);
  }

  /** Snake draft — espelha `distributeTeamsIntoGroups` (Flutter). */
  protected redraw(): void {
    const teams = this.eligible();
    const groupCount = this.groupCount();
    if (teams.length === 0) {
      this.groups.set([]);
      return;
    }
    const ordered = this.useSeeds()
      ? teams.map((t) => t.teamId!)
      : shuffled(teams.map((t) => t.teamId!));
    const withShuffledTail = this.useSeeds()
      ? [...ordered.slice(0, groupCount), ...shuffled(ordered.slice(groupCount))]
      : ordered;

    const buckets: string[][] = Array.from({ length: groupCount }, () => []);
    for (let i = 0; i < withShuffledTail.length; i++) {
      const round = Math.floor(i / groupCount);
      const posInRound = i % groupCount;
      const groupIndex = round % 2 === 0 ? posInRound : groupCount - 1 - posInRound;
      buckets[groupIndex]!.push(withShuffledTail[i]!);
    }
    this.groups.set(buckets.map((teamIds, i) => ({ id: String.fromCharCode(65 + i), teamIds })));
  }

  protected teamNameOf(teamId: string): string {
    return this.eligible().find((t) => t.teamId === teamId)?.teamName ?? teamId;
  }

  protected async publish(force = false): Promise<void> {
    const cat = this.category();
    const tid = this.id();
    if (!cat || !tid || this.publishing()) return;
    this.publishing.set(true);
    this.feedback.set(null);
    try {
      // Sempre envia a ordem: com seeds respeitados, a ordem da tela; sem, um
      // embaralhamento novo — senão SE/DE caíam na ordem de inscrição do
      // servidor e o "sorteio 100% aleatório" prometido no toggle não existia.
      const ordered = this.eligible().map((t) => t.teamId!);
      const seeds = this.useSeeds() ? ordered : shuffled(ordered);
      // Snapshot único: `kocPhases()`/`kocMaxTeamsPerRound()` são sinais ao
      // vivo, e o `await` do save abaixo dá tempo pro efeito de reproposta
      // (inscrições mudando em tempo real) trocá-los no meio do caminho. Ler
      // de novo pro payload da geração arriscaria gravar um plano na
      // categoria e gerar a chave com outro — a mesma falha que o contrato do
      // dispatch pede pra evitar, só que por uma porta diferente (dois reads
      // em vez de um save que falha).
      const kocPlan = this.format() === 'king_of_court'
        ? {
            phases: this.kocPhases(),
            maxTeamsPerRound: this.kocMaxTeamsPerRound(),
            roundDurationSec: this.kocRoundDurationSec(),
          }
        : null;
      if (kocPlan) {
        // Grava ANTES de gerar: o sorteio ao vivo lê o plano do doc da
        // categoria, e quem sorteia depois precisa achar o mesmo formato. Se
        // isto lançar (categoria desconhecida — Task 6), o catch abaixo pega,
        // mostra no feedback e a geração nem roda: publicar a chave sem o
        // plano gravado deixaria o sorteio ao vivo futuro sem formato.
        await saveKocPhasePlan(tid, cat.id, kocPlan.phases, kocPlan.maxTeamsPerRound);
      }
      const result = await generateCategoryBracket({
        tournamentId: tid,
        categoryId: cat.id,
        format: this.format(),
        seeds,
        ...(this.format() === 'groups_knockout' ? { groupsPreview: this.groups(), bracketConfig: { qualifiersPerGroup: this.qualifiersPerGroup() } } : {}),
        // `resolveKocConfig` prefere `bracketConfig` ao doc da categoria: é o
        // que faz a escolha desta tela valer numa categoria que não é KOTC.
        // Mesmo snapshot gravado acima — nunca um segundo read dos sinais.
        ...(kocPlan ? { bracketConfig: kocPlan } : {}),
        force,
      });
      this.feedback.set({ ok: true, message: `Chave publicada — ${result.matchCount} jogos gerados. Redirecionando…` });
      this.ctx.selectTournament(tid);
      this.ctx.selectCategory(cat.id);
      await this.ctx.reloadMatches();
      setTimeout(() => void this.router.navigate(['/painel/eventos', tid, 'categorias', cat.id, 'chave']), 900);
    } catch (e) {
      const err = e as { message?: string; details?: { reason?: string } };
      // O servidor recusa a regeração quando já há resultados; a confirmação extra passa pelo
      // diálogo do painel (o overlay de "Sorteando…" já saiu de cena aqui, então não se
      // sobrepõem) e o "sim" refaz a chamada com force.
      if (err.details?.reason === 'bracket_has_results' && !force) {
        this.publishing.set(false);
        this.regenPending.set(true);
        return;
      }
      this.feedback.set({ ok: false, message: err.message || 'Falha ao publicar a chave.' });
    } finally {
      this.publishing.set(false);
    }
  }

  protected confirmRegen(): void {
    this.regenPending.set(false);
    void this.publish(true);
  }

  protected cancel(): void {
    void this.router.navigate(['/painel/eventos', this.id(), 'categorias', this.catId()]);
  }
}
