import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RadarChartComponent } from '../ui/radar-chart.component';
import { SquadContextService } from '../ui/squad-context.service';
import { FUNDAMENTALS, type EvaluationScores } from './evaluation-stats';
import { EvaluationsService } from './evaluations.service';

function defaultScores(): EvaluationScores {
  return {
    saque: 5, recepcao: 5, levantamento: 5, ataque: 5, defesa: 5,
    bloqueio: 5, condicionamento: 5, comunicacao: 5, mental: 5,
  };
}

@Component({
  selector: 'co-panel-nova-avaliacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelCardComponent, PanelShellComponent, RadarChartComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Avaliações dos atletas" [subtitle]="subtitle()">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving() || !athleteUid()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else {
            Salvar avaliação
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <co-panel-card title="Atleta" kicker="Selecionar da lista">
          <select class="picker" [value]="athleteUid() ?? ''" (change)="selectAthlete($any($event.target).value)">
            <option value="">Selecione…</option>
            @for (a of roster(); track a.athleteUid) {
              <option [value]="a.athleteUid">{{ a.displayName }}</option>
            }
          </select>
        </co-panel-card>

        <div class="grid">
          <co-panel-card title="Radar de fundamentos" class="radar-card">
            <co-radar-chart [axes]="axes()" [size]="290" />
          </co-panel-card>
          <co-panel-card title="Notas por fundamento" kicker="Escala de 0 a 10">
            @for (f of fundamentals; track f.key) {
              <div class="score-row">
                <span class="score-label">{{ f.label }}</span>
                <input type="range" min="0" max="10" step="0.5" [value]="scores()[f.key]" (input)="setScore(f.key, +$any($event.target).value)" />
                <span class="score-value">{{ scores()[f.key] }}</span>
              </div>
            }
          </co-panel-card>
        </div>

        <co-panel-card title="Observações">
          <textarea class="notes" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea>
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
      max-width: 900px;
      overflow: auto;
    }
    .picker {
      height: 38px;
      padding: 0 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      width: 100%;
    }
    .grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 16px;
    }
    .radar-card {
      display: flex;
      align-items: center;
    }
    .score-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
    }
    .score-label {
      width: 120px;
      flex: none;
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .score-row input[type='range'] {
      flex: 1;
    }
    .score-value {
      width: 28px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .notes {
      width: 100%;
      min-height: 70px;
      padding: 10px 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      box-sizing: border-box;
      resize: vertical;
    }
  `,
})
export class PanelNovaAvaliacaoComponent {
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly router = inject(Router);

  protected readonly fundamentals = FUNDAMENTALS;

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly athleteUid = signal<string | null>(null);
  protected readonly scores = signal<EvaluationScores>(defaultScores());
  protected readonly notes = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly axes = computed(() =>
    this.fundamentals.map((f) => ({ label: f.label, value: this.scores()[f.key] })),
  );

  protected readonly subtitle = computed(() => {
    const a = this.roster().find((r) => r.athleteUid === this.athleteUid());
    return a ? `${a.displayName} · Nova avaliação` : 'Selecione um atleta';
  });

  protected selectAthlete(uid: string): void {
    this.athleteUid.set(uid || null);
  }

  protected setScore(key: keyof EvaluationScores, value: number): void {
    this.scores.update((s) => ({ ...s, [key]: value }));
  }

  protected async submit(): Promise<void> {
    const uid = this.athleteUid();
    if (!uid) {
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.evaluationsService.createEvaluation({ athleteUid: uid, scores: this.scores(), notes: this.notes() });
      void this.router.navigateByUrl('/painel/avaliacoes');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar a avaliação.');
    } finally {
      this.saving.set(false);
    }
  }
}
