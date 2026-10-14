import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { canDeleteTraining, followingInSeries, localIsoDate, splitUpcoming } from './training-rules';
import { TrainingsService, type Training, type TrainingStatus } from './trainings.service';

const STATUS_LABEL: Record<TrainingStatus, string> = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};
const STATUS_TONE: Record<TrainingStatus, PillTone> = {
  agendado: 'orange',
  realizado: 'green',
  cancelado: 'red',
};

@Component({
  selector: 'co-panel-treinos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Treinos" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/treinos/novo">
          <co-icon name="plus" [size]="14" />
          Novo treino
        </a>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (trainings().length === 0) {
          <co-panel-card title="Treinos">
            <p class="empty">Nenhum treino agendado ainda.</p>
          </co-panel-card>
        } @else {
          <co-panel-card title="Próximos treinos" [kicker]="groups().upcoming.length + ''">
            <ng-container *ngTemplateOutlet="rows; context: { list: groups().upcoming, emptyText: 'Nenhum treino a partir de hoje.' }" />
          </co-panel-card>
          @if (groups().past.length > 0) {
            <co-panel-card title="Anteriores" [kicker]="groups().past.length + ''">
              <ng-container *ngTemplateOutlet="rows; context: { list: groups().past, emptyText: '' }" />
            </co-panel-card>
          }
        }

        <ng-template #rows let-list="list" let-emptyText="emptyText">
          @for (t of list; track t.id; let last = $last) {
            <co-row [title]="t.title" [sub]="t.date + ' · ' + t.startTime + ' · ' + (t.location || 'Local não definido')" [last]="last">
              <div row-trailing class="actions">
                @if (t.seriesId) {
                  <co-pill tone="dim">Série</co-pill>
                }
                <co-pill [tone]="tone(t)">{{ label(t) }}</co-pill>
                @if (confirmingDeleteId() === t.id) {
                  <span class="confirm">Excluir este treino?</span>
                  <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === t.id" (click)="remove(t)">Excluir</button>
                  <button type="button" class="co-ghost-btn" (click)="confirmingDeleteId.set(null)">Voltar</button>
                } @else if (confirmingCancelId() === t.id) {
                  <span class="confirm">Cancelar:</span>
                  <button type="button" class="co-ghost-btn" [disabled]="busyId() === t.id" (click)="cancel(t, 'single')">Só este</button>
                  <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === t.id" (click)="cancel(t, 'following')">Este e os seguintes ({{ followingCount(t) }})</button>
                  <button type="button" class="co-ghost-btn" (click)="confirmingCancelId.set(null)">Voltar</button>
                } @else {
                  @if (t.status !== 'cancelado') {
                    <a class="co-ghost-btn" [routerLink]="['/painel/presenca']" [queryParams]="{ treino: t.id }">Chamada</a>
                  }
                  <a class="co-ghost-btn" [routerLink]="['/painel/treinos/novo']" [queryParams]="{ de: t.id }">Duplicar</a>
                  <a class="co-ghost-btn" [routerLink]="['/painel/treinos', t.id, 'editar']">Editar</a>
                  @if (t.status === 'cancelado') {
                    <button type="button" class="co-ghost-btn" [disabled]="busyId() === t.id" (click)="reactivate(t)">Reativar</button>
                  } @else {
                    <button type="button" class="co-ghost-btn" [disabled]="busyId() === t.id" (click)="askCancel(t)">Cancelar</button>
                  }
                  @if (canDelete(t)) {
                    <button type="button" class="co-ghost-btn danger" (click)="confirmingDeleteId.set(t.id)">Excluir</button>
                  }
                }
              </div>
            </co-row>
          } @empty {
            <p class="empty">{{ emptyText }}</p>
          }
        </ng-template>
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
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .confirm {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .danger {
      color: var(--nx-red-500, #ff5b5b);
    }
    .co-alert {
      margin-bottom: 12px;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
      padding: 8px 4px;
    }
  `,
})
export class PanelTreinosComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_TONE = STATUS_TONE;

  protected readonly confirmingDeleteId = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected tone(t: Training): PillTone {
    return STATUS_TONE[t.status];
  }

  protected label(t: Training): string {
    return STATUS_LABEL[t.status];
  }

  protected canDelete(t: Training): boolean {
    return canDeleteTraining(t);
  }

  protected readonly confirmingCancelId = signal<string | null>(null);

  /** Quantos treinos "este e os seguintes" alcança (inclui o próprio). */
  protected followingCount(t: Training): number {
    return followingInSeries(this.trainingsService.trainings(), t).length;
  }

  /** Treino de série com seguintes pergunta o alcance; os demais cancelam direto. */
  protected askCancel(t: Training): void {
    if (this.followingCount(t) > 1) {
      this.confirmingCancelId.set(t.id);
    } else {
      void this.cancel(t, 'single');
    }
  }

  protected async cancel(t: Training, scope: 'single' | 'following'): Promise<void> {
    const ids =
      scope === 'following'
        ? [...new Set([t.id, ...followingInSeries(this.trainingsService.trainings(), t).map((x) => x.id)])]
        : [t.id];
    await this.run(t.id, () => this.trainingsService.setTrainingsStatus(ids, 'cancelado'), 'cancelar');
    this.confirmingCancelId.set(null);
  }

  protected reactivate(t: Training): Promise<void> {
    // Treino que já tem presença voltou a ser "realizado"; senão, volta a agendado.
    const status: TrainingStatus = Object.keys(t.attendance).length > 0 ? 'realizado' : 'agendado';
    return this.run(t.id, () => this.trainingsService.setTrainingStatus(t.id, status), 'reativar');
  }

  protected async remove(t: Training): Promise<void> {
    await this.run(t.id, () => this.trainingsService.deleteTraining(t.id), 'excluir');
    this.confirmingDeleteId.set(null);
  }

  private async run(id: string, action: () => Promise<void>, verb: string): Promise<void> {
    this.error.set(null);
    this.busyId.set(id);
    try {
      await action();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : `Não foi possível ${verb} o treino.`);
    } finally {
      this.busyId.set(null);
    }
  }

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
  });

  protected readonly groups = computed(() => splitUpcoming(this.trainings(), localIsoDate()));

  protected readonly subtitle = computed(() => {
    const n = this.trainings().length;
    return `${n} treino${n === 1 ? '' : 's'} · ${this.squadContext.activeSquad()?.name ?? 'Todas as equipes'}`;
  });
}
