import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { SquadsService } from './squads.service';

/** Lista de equipes (protótipo TrEquipesScreen) — sem os indicadores de atletas/próximo
 *  treino/win rate do protótipo ainda, porque dependem de AthletesService (Task 9) e
 *  TrainingsService (Task 11); a capacidade essencial do MVP é criar/listar/selecionar equipe. */
@Component({
  selector: 'co-panel-equipes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Equipes" [subtitle]="subtitleLabel()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/equipes/nova">
          <co-icon name="plus" [size]="14" />
          Nova equipe
        </a>
      </co-page-header>

      <div class="body">
        @if (squads().length === 0) {
          <co-panel-card title="Nenhuma equipe ainda" kicker="Comece por aqui">
            <p class="desc">Crie sua primeira equipe pra começar a adicionar atletas, treinos e avaliações.</p>
          </co-panel-card>
        } @else {
          <div class="grid">
            @for (squad of squads(); track squad.id) {
              <co-panel-card [title]="squad.name" [kicker]="squad.category + ' · ' + squad.gender">
                <p class="desc">{{ squad.description || 'Sem descrição.' }}</p>
                <button type="button" class="co-ghost-btn" [class.active]="isActive(squad.id)" (click)="select(squad.id)">
                  @if (isActive(squad.id)) {
                    <co-icon name="check" [size]="13" />
                    Equipe ativa
                  } @else {
                    Tornar ativa
                  }
                </button>
              </co-panel-card>
            }
          </div>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow: hidden;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .desc {
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.4;
      margin: 0 0 14px;
      min-height: 34px;
    }
    .co-ghost-btn.active {
      color: var(--nx-win);
    }
  `,
})
export class PanelEquipesComponent {
  private readonly squadsService = inject(SquadsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly squads = this.squadsService.squads;

  protected readonly subtitleLabel = computed(() => {
    const n = this.squads().length;
    if (n === 0) {
      return 'Nenhuma equipe ainda';
    }
    return n === 1 ? '1 equipe' : `${n} equipes`;
  });

  protected isActive(id: string): boolean {
    return this.squadContext.activeSquadId() === id;
  }

  protected select(id: string): void {
    this.squadContext.setActiveSquad(id);
  }
}
