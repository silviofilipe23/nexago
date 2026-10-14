import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CoachContextService } from '../access/coach-context.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { AthletesService } from '../atletas/athletes.service';
import { TrainingsService } from '../treinos/trainings.service';
import { checkSquadDeletable } from './squad-rules';
import { SquadsService, type Squad } from './squads.service';

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
        @if (ctx.can('atletas', 'write')) {
          <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/equipes/nova">
            <co-icon name="plus" [size]="14" />
            Nova equipe
          </a>
        }
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (squads().length === 0) {
          <co-panel-card title="Nenhuma equipe ainda" kicker="Comece por aqui">
            <p class="desc">Crie sua primeira equipe pra começar a adicionar atletas, treinos e avaliações.</p>
          </co-panel-card>
        } @else {
          <div class="grid">
            @for (squad of squads(); track squad.id) {
              <co-panel-card [title]="squad.name" [kicker]="squad.category + ' · ' + squad.gender">
                <p class="desc">{{ squad.description || 'Sem descrição.' }}</p>
                <div class="actions">
                  <button type="button" class="co-ghost-btn" [class.active]="isActive(squad.id)" (click)="select(squad.id)">
                    @if (isActive(squad.id)) {
                      <co-icon name="check" [size]="13" />
                      Equipe ativa
                    } @else {
                      Tornar ativa
                    }
                  </button>
                  @if (!ctx.can('atletas', 'write')) {
                    <!-- leitura: só seleciona a equipe ativa -->
                  } @else if (confirmingDeleteId() === squad.id) {
                    <span class="confirm">Excluir esta equipe?</span>
                    <button type="button" class="co-ghost-btn danger" [disabled]="deleting()" (click)="remove(squad)">Excluir</button>
                    <button type="button" class="co-ghost-btn" (click)="confirmingDeleteId.set(null)">Voltar</button>
                  } @else {
                    <a class="co-ghost-btn" [routerLink]="['/painel/equipes', squad.id, 'editar']">Editar</a>
                    <button type="button" class="co-ghost-btn danger" (click)="askDelete(squad)">Excluir</button>
                  }
                </div>
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
    .actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
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
  protected readonly ctx = inject(CoachContextService);
  private readonly squadsService = inject(SquadsService);
  private readonly squadContext = inject(SquadContextService);

  private readonly athletesService = inject(AthletesService);
  private readonly trainingsService = inject(TrainingsService);

  protected readonly squads = this.squadsService.squads;
  protected readonly confirmingDeleteId = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);

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

  protected askDelete(squad: Squad): void {
    if (!this.ctx.can('atletas', 'write')) {
      return;
    }
    this.error.set(null);
    const check = checkSquadDeletable(
      squad.id,
      this.athletesService.roster().map((a) => a.squadId),
      this.trainingsService.trainings().map((t) => t.squadId),
    );
    if (!check.ok) {
      this.error.set(`${squad.name}: ${check.reason}`);
      return;
    }
    this.confirmingDeleteId.set(squad.id);
  }

  protected async remove(squad: Squad): Promise<void> {
    if (!this.ctx.can('atletas', 'write')) {
      return;
    }
    this.error.set(null);
    this.deleting.set(true);
    try {
      await this.squadsService.deleteSquad(squad.id);
      this.confirmingDeleteId.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível excluir a equipe.');
    } finally {
      this.deleting.set(false);
    }
  }
}
