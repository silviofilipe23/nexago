import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { SquadContextService } from '../ui/squad-context.service';
import { CallUpsService, type CallUp, type CallUpResponseValue } from './call-ups.service';

@Component({
  selector: 'co-panel-convocacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Convocações" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/convocacoes/nova">
          <co-icon name="bell" [size]="14" />
          Nova convocação
        </a>
      </co-page-header>

      <div class="body">
        @for (c of callUps(); track c.id) {
          <co-panel-card [title]="c.title" [kicker]="c.recipients.length + ' convocados'">
            <p class="msg">{{ c.message }}</p>
            <div class="counts">
              <co-pill tone="green">Confirmados {{ countFor(c, 'confirmado') }}</co-pill>
              <co-pill tone="yellow">Talvez {{ countFor(c, 'talvez') }}</co-pill>
              <co-pill tone="red">Não vão {{ countFor(c, 'nao_vou') }}</co-pill>
              <co-pill tone="dim">Aguardando {{ countFor(c, 'aguardando') }}</co-pill>
            </div>
          </co-panel-card>
        } @empty {
          <p class="empty">Nenhuma convocação enviada ainda.</p>
        }
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
      overflow: auto;
    }
    .msg {
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 0 0 14px;
    }
    .counts {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelConvocacoesComponent {
  private readonly callUpsService = inject(CallUpsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly callUps = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.callUpsService.callUps().filter((c) => !activeId || c.squadId === activeId);
  });

  protected readonly subtitle = computed(() => {
    const n = this.callUps().length;
    return `${n} convocaç${n === 1 ? 'ão' : 'ões'} enviada${n === 1 ? '' : 's'}`;
  });

  protected countFor(c: CallUp, status: CallUpResponseValue): number {
    return Object.values(c.responses).filter((r) => r === status).length;
  }
}
