import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { TrainingsService, type TrainingStatus } from './trainings.service';

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
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Treinos" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/treinos/novo">
          <co-icon name="plus" [size]="14" />
          Novo treino
        </a>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Todos os treinos">
          @for (t of trainings(); track t.id; let last = $last) {
            <co-row [title]="t.title" [sub]="t.date + ' · ' + t.startTime + ' · ' + (t.location || 'Local não definido')" [last]="last">
              <co-pill row-trailing [tone]="STATUS_TONE[t.status]">{{ STATUS_LABEL[t.status] }}</co-pill>
            </co-row>
          } @empty {
            <p class="empty">Nenhum treino agendado ainda.</p>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow: hidden;
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

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
  });

  protected readonly subtitle = computed(() => {
    const n = this.trainings().length;
    return `${n} treino${n === 1 ? '' : 's'} · ${this.squadContext.activeSquad()?.name ?? 'Todas as equipes'}`;
  });
}
