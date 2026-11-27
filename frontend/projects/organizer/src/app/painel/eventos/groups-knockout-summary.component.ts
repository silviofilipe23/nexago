import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  describeByeHolders,
  describeGroupSizes,
  estimateDurationMin,
  firstRoundPairings,
  formatDuration,
  nearestValidFormat,
  planGroupsKnockout,
  suggestGroupFormats,
  type GroupsKnockoutIssue,
  type GroupsKnockoutPlan,
} from '../data/groups-knockout-plan';

/** O formato que o organizador escolheu num clique (sugestão ou correção). */
export interface GroupFormatChoice {
  groupCount: number;
  qualifiersPerGroup: number;
}

interface FormatOption extends GroupFormatChoice {
  key: string;
  title: string;
  meta: string;
  active: boolean;
}

interface PhaseChip {
  label: string;
  detail: string;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function gamesLabel(count: number): string {
  return plural(count, 'jogo', 'jogos');
}

function roundRobinMatches(teams: number): number {
  return (teams * (teams - 1)) / 2;
}

function formatLabel(choice: GroupFormatChoice): string {
  return `${plural(choice.groupCount, 'grupo', 'grupos')} × ${plural(choice.qualifiersPerGroup, 'classificado', 'classificados')}`;
}

/**
 * As contas do "grupos + mata-mata" na tela de Gerar chave: formatos sugeridos,
 * jogos de cada fase, folgas, total do dia e os confrontos da 1ª fase.
 *
 * Só apresenta — o estado (quantos grupos, quantos classificam) é da tela, e
 * este componente pede a troca por `formatChosen`. As contas vêm todas de
 * `groups-knockout-plan.ts`.
 */
@Component({
  selector: 'og-groups-knockout-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (options().length > 0) {
      <div class="og-gk-block">
        <div class="og-gk-label">Formatos sugeridos para {{ teams() }} duplas</div>
        <div class="og-gk-options" role="group" aria-label="Formatos sugeridos">
          @for (opt of options(); track opt.key) {
            <button
              type="button"
              class="og-gk-option"
              [class.active]="opt.active"
              [attr.aria-pressed]="opt.active"
              (click)="choose(opt)"
            >
              <span class="og-gk-option-title">{{ opt.title }}</span>
              <span class="og-gk-option-meta">{{ opt.meta }}</span>
            </button>
          }
        </div>
      </div>
    }

    @if (issueMessage(); as message) {
      <p class="og-gk-error" role="alert">
        {{ message }}
        @if (fix(); as f) {
          <button type="button" class="og-gk-fix" (click)="choose(f)">Usar {{ fixLabel() }}</button>
        }
      </p>
    } @else {
      <div class="og-gk-summary">
        <section class="og-gk-card" data-block="groups">
          <div class="og-gk-label">Fase de grupos</div>
          <div class="og-gk-value">{{ groupMatchesLabel() }}</div>
          <p class="og-gk-line">{{ groupSizesLabel() }}</p>
          <p class="og-gk-line dim">{{ perGroupLabel() }}</p>
        </section>

        <section class="og-gk-card" data-block="knockout">
          <div class="og-gk-label">Mata-mata</div>
          <div class="og-gk-value">{{ knockoutMatchesLabel() }}</div>
          <p class="og-gk-line">{{ qualifiersLabel() }}</p>
          <ol class="og-gk-phases" aria-label="Fases do mata-mata">
            @for (phase of phases(); track phase.label) {
              <li class="og-gk-phase">
                <span class="og-gk-phase-name">{{ phase.label }}</span>
                <span class="og-gk-phase-detail">{{ phase.detail }}</span>
              </li>
            }
          </ol>
          <p class="og-gk-line dim">{{ seedingLabel() }}</p>
        </section>

        <section class="og-gk-card" data-block="total">
          <div class="og-gk-label">Total da categoria</div>
          <div class="og-gk-value">{{ totalMatchesLabel() }}</div>
          <p class="og-gk-line">{{ perTeamLabel() }}</p>
          <p class="og-gk-line dim">{{ eliminatedLabel() }}</p>
          @if (durationLabel(); as duration) {
            <p class="og-gk-line dim">{{ duration }}</p>
          }
        </section>
      </div>

      @if (pairings().length > 0) {
        <div class="og-gk-block">
          <div class="og-gk-label">Confrontos da 1ª fase · {{ firstPhaseName() }}</div>
          <ul class="og-gk-pairings">
            @for (pair of pairings(); track $index) {
              <li class="og-gk-pairing">
                <span class="og-gk-slot">{{ pair.a }}</span>
                @if (pair.b) {
                  <span class="og-gk-vs">×</span>
                  <span class="og-gk-slot">{{ pair.b }}</span>
                } @else {
                  <span class="og-gk-bye">folga</span>
                }
              </li>
            }
          </ul>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .og-gk-block {
      margin-top: 18px;
    }
    .og-gk-label {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }
    .og-gk-options {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 8px;
    }
    .og-gk-option {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-height: 44px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease;
    }
    .og-gk-option:hover {
      background: var(--nx-surface-1);
      border-color: var(--nx-line-strong);
    }
    .og-gk-option:focus-visible,
    .og-gk-fix:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .og-gk-option.active {
      border-color: var(--nx-orange-500);
      box-shadow: inset 0 0 0 1px var(--nx-orange-500);
    }
    .og-gk-option-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
    }
    .og-gk-option-meta {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-gk-error {
      margin: 14px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
    }
    .og-gk-fix {
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
    .og-gk-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 18px;
    }
    .og-gk-card {
      min-width: 0;
      padding: 12px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-gk-card .og-gk-label {
      margin-bottom: 4px;
    }
    .og-gk-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 20px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
      font-variant-numeric: tabular-nums;
    }
    .og-gk-line {
      margin: 6px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.4;
      color: var(--nx-text);
    }
    .og-gk-line.dim {
      color: var(--nx-text-dim);
    }
    .og-gk-phases {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .og-gk-phase {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }
    .og-gk-phase-name {
      color: var(--nx-text);
      font-weight: 600;
    }
    .og-gk-phase-detail {
      color: var(--nx-text-dim);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .og-gk-pairings {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 6px;
    }
    .og-gk-pairing {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 8px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display);
      font-weight: 500;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-gk-vs {
      color: var(--nx-text-mute);
    }
    .og-gk-bye {
      margin-left: auto;
      padding: 1px 8px;
      border-radius: 999px;
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    @media (max-width: 640px) {
      .og-gk-options {
        grid-template-columns: 1fr;
      }
      .og-gk-summary {
        grid-template-columns: 1fr;
      }
      .og-gk-pairings {
        grid-template-columns: 1fr;
      }
      .og-gk-fix {
        display: block;
        min-height: 44px;
        margin-left: 0;
      }
    }
  `,
})
export class GroupsKnockoutSummaryComponent {
  readonly teams = input.required<number>();
  readonly groupCount = input.required<number>();
  readonly qualifiersPerGroup = input.required<number>();
  /** Quadras do torneio — só para a estimativa de duração. */
  readonly courts = input(0);
  /** Duração padrão de uma partida, em minutos. `0` = sem estimativa. */
  readonly matchDurationMin = input(0);

  readonly formatChosen = output<GroupFormatChoice>();

  protected readonly plan = computed<GroupsKnockoutPlan>(() =>
    planGroupsKnockout(this.teams(), this.groupCount(), this.qualifiersPerGroup()),
  );

  protected readonly options = computed<FormatOption[]>(() => {
    const current = this.plan();
    return suggestGroupFormats(this.teams()).map((plan) => ({
      key: `${plan.groupCount}x${plan.qualifiersPerGroup}`,
      groupCount: plan.groupCount,
      qualifiersPerGroup: plan.qualifiersPerGroup,
      title: describeGroupSizes(plan.groupSizes),
      meta: [
        plan.qualifiersPerGroup === 1 ? '1 classifica' : `${plan.qualifiersPerGroup} classificam`,
        plan.phases[0]?.label ?? '',
        gamesLabel(plan.totalMatches),
        plan.byes > 0 ? plural(plan.byes, 'folga', 'folgas') : '',
      ]
        .filter(Boolean)
        .join(' · '),
      active: plan.groupCount === current.groupCount && plan.qualifiersPerGroup === current.qualifiersPerGroup,
    }));
  });

  /** O formato válido mais próximo — só interessa quando o atual não vale. */
  protected readonly fix = computed<GroupFormatChoice | null>(() => {
    if (this.plan().issue === null) return null;
    const nearest = nearestValidFormat(this.teams(), this.groupCount(), this.qualifiersPerGroup());
    return nearest ? { groupCount: nearest.groupCount, qualifiersPerGroup: nearest.qualifiersPerGroup } : null;
  });

  protected readonly fixLabel = computed(() => {
    const fix = this.fix();
    return fix ? formatLabel(fix) : '';
  });

  protected readonly issueMessage = computed(() => {
    const plan = this.plan();
    return plan.issue === null ? null : this.describeIssue(plan.issue, plan);
  });

  protected readonly groupMatchesLabel = computed(() => gamesLabel(this.plan().groupMatches));
  protected readonly groupSizesLabel = computed(() => describeGroupSizes(this.plan().groupSizes));

  protected readonly perGroupLabel = computed(() => {
    const sizes = [...new Set(this.plan().groupSizes)];
    if (sizes.length === 1) return `${gamesLabel(roundRobinMatches(sizes[0]!))} por grupo, todos contra todos.`;
    const [first, ...rest] = sizes;
    const head = `${gamesLabel(roundRobinMatches(first!))} no grupo de ${first}`;
    return `${[head, ...rest.map((size) => `${roundRobinMatches(size)} no de ${size}`)].join(' · ')}, todos contra todos.`;
  });

  protected readonly knockoutMatchesLabel = computed(() => gamesLabel(this.plan().knockoutMatches));

  protected readonly qualifiersLabel = computed(() => {
    const plan = this.plan();
    return `${plural(plan.qualifiers, 'classificado', 'classificados')} (${plan.groupCount} × ${plan.qualifiersPerGroup})`;
  });

  protected readonly phases = computed<PhaseChip[]>(() => {
    const plan = this.plan();
    const chips = plan.phases.map((phase) => ({
      label: phase.label,
      detail: phase.byes > 0 ? `${gamesLabel(phase.matches)} + ${plural(phase.byes, 'folga', 'folgas')}` : gamesLabel(phase.matches),
    }));
    return plan.thirdPlace ? [...chips, { label: '3º lugar', detail: gamesLabel(1) }] : chips;
  });

  protected readonly seedingLabel = computed(() => {
    const plan = this.plan();
    if (plan.seeding === 'crossover') return 'Cruzamento fixo entre os grupos.';
    const criteria = 'pela classificação entre grupos (aproveitamento, depois saldo médio por jogo)';
    if (plan.byes === 0) return `Chave montada ${criteria}.`;
    return `Folga para ${describeByeHolders(plan.byes, plan.groupCount)}, ${criteria}.`;
  });

  protected readonly totalMatchesLabel = computed(() => gamesLabel(this.plan().totalMatches));

  protected readonly perTeamLabel = computed(() => {
    const { minMatchesPerTeam: min, maxMatchesPerTeam: max } = this.plan();
    return min === max ? `Cada dupla joga ${plural(min, 'partida', 'partidas')}.` : `Cada dupla joga de ${min} a ${max} partidas.`;
  });

  protected readonly eliminatedLabel = computed(() => {
    const out = this.plan().eliminatedInGroups;
    return out === 1 ? '1 dupla sai na fase de grupos.' : `${out} duplas saem na fase de grupos.`;
  });

  protected readonly durationLabel = computed(() => {
    const perMatch = this.matchDurationMin();
    if (perMatch <= 0) return null;
    const courts = Math.max(1, Math.floor(this.courts()));
    const total = estimateDurationMin(this.plan().totalMatches, perMatch, courts);
    return `≈ ${formatDuration(total)} com ${plural(courts, 'quadra', 'quadras')} (${perMatch} min por jogo).`;
  });

  protected readonly pairings = computed(() => {
    const plan = this.plan();
    return plan.issue === null ? firstRoundPairings(plan.groupCount, plan.qualifiersPerGroup) : [];
  });

  protected readonly firstPhaseName = computed(() => this.plan().phases[0]?.label ?? '');

  protected choose(choice: GroupFormatChoice): void {
    this.formatChosen.emit({ groupCount: choice.groupCount, qualifiersPerGroup: choice.qualifiersPerGroup });
  }

  private describeIssue(issue: GroupsKnockoutIssue, plan: GroupsKnockoutPlan): string {
    switch (issue) {
      case 'too_few_teams':
        return 'É preciso ao menos 2 duplas para montar os grupos.';
      case 'group_too_small':
        return `O menor grupo tem ${plural(plan.groupSizes[plan.groupSizes.length - 1] ?? 0, 'dupla', 'duplas')} — não dá para classificar ${plan.qualifiersPerGroup} por grupo.`;
      case 'too_few_qualifiers':
        return `${plural(plan.qualifiers, 'classificado não forma', 'classificados não formam')} um mata-mata.`;
    }
  }
}
