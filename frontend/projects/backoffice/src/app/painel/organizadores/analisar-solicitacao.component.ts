import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { cityStateLabel, findAthlete, findRequest, type Athlete } from './organizadores.data';
import { OrganizerRoleForm } from './role-form.state';
import { subjectFromAthlete } from './role-subject';
import { RoleRailComponent } from './ui/role-rail.component';
import { RoleStepsComponent } from './ui/role-steps.component';

const DEMO_NOTE =
  'Fila de solicitações ainda é demonstrativa: não existe coleção de pedidos de acesso no backend. ' +
  'Para atribuir a role de verdade, use Promover atleta.';

/** Tela "Analisar solicitação" (protótipo BoAnalisarSolicitacao): mesma revisão da role + motivo do atleta. */
@Component({
  selector: 'bo-analisar-solicitacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    RoleStepsComponent,
    RoleRailComponent,
  ],
  template: `
    <bo-panel-shell>
      @let request = accessRequest();
      @let selected = athlete();

      <header class="bo-detail-header">
        <a class="bo-back-btn" routerLink="/painel/organizadores" aria-label="Voltar para Organizadores">
          <bo-icon name="chevron-left" [size]="18" />
        </a>
        <div class="titles">
          <h1>{{ selected ? 'Analisar solicitação de ' + selected.name : 'Solicitação não encontrada' }}</h1>
          <p>Organizadores · Solicitações de acesso</p>
        </div>
        @if (selected) {
          <bo-pill tone="dim">Demonstração</bo-pill>
        }
      </header>

      <div class="bo-detail-body">
        @if (request && selected) {
          <div class="bo-detail-grid">
            <div class="bo-detail-main">
              <bo-role-steps
                [form]="form"
                [subject]="subject()"
                [accountMeta]="accountMeta(selected)"
                [swappable]="false"
                [draft]="true"
              />
            </div>

            <aside class="bo-detail-rail">
              <bo-panel-card
                pad="sm"
                [kicker]="'Solicitação · ' + request.age"
                title="Motivo do atleta"
                class="motive-card"
              >
                <p class="motive">“{{ request.reason }}”</p>
              </bo-panel-card>

              <bo-role-rail [rows]="form.summaryRows()" [note]="note">
                <a class="bo-cta link" routerLink="/painel/organizadores/promover">
                  <bo-icon name="id-badge" [size]="17" />
                  Atribuir role pela busca real
                </a>
                <button type="button" class="bo-cta-ghost danger" disabled>Recusar solicitação</button>
              </bo-role-rail>
            </aside>
          </div>
        } @else {
          <bo-panel-card title="Solicitação não encontrada">
            <p class="not-found">
              A solicitação pode já ter sido analisada por outro admin ou o link está desatualizado.
            </p>
            <a class="bo-mini-btn" routerLink="/painel/organizadores">Voltar para Organizadores</a>
          </bo-panel-card>
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .motive-card {
      box-shadow: 0 0 0 1px rgba(244, 197, 67, 0.2);
      border-radius: var(--nx-r-4);
    }

    .motive {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.55;
      font-style: italic;
      color: var(--nx-text-mute);
    }

    .not-found {
      margin: 0 0 16px;
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }

    a.bo-mini-btn {
      text-decoration: none;
      align-self: flex-start;
    }

    a.bo-cta.link {
      text-decoration: none;
    }
  `,
})
export class AnalisarSolicitacaoComponent {
  /** Vem do parâmetro de rota :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly accessRequest = computed(() => findRequest(this.id()) ?? null);

  protected readonly athlete = computed<Athlete | null>(() => {
    const request = this.accessRequest();
    return request ? (findAthlete(request.athleteId) ?? null) : null;
  });

  protected readonly subject = computed(() => {
    const athlete = this.athlete();
    return athlete ? subjectFromAthlete(athlete) : null;
  });

  protected readonly form = new OrganizerRoleForm(this.subject);
  protected readonly note = DEMO_NOTE;

  protected accountMeta(athlete: Athlete): string {
    return `${cityStateLabel(athlete.city, athlete.state)} · ${athlete.matches} partidas`;
  }
}
