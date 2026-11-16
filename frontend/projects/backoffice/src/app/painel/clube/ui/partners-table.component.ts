import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PillComponent } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import { AUDIENCE_LABELS, CATEGORY_LABELS, ctaSummary, type Partner } from '../data/partner';
import { PartnerLogoComponent } from './partner-logo.component';

export interface PartnerActiveChange {
  partner: Partner;
  active: boolean;
}

/** Tabela de parceiros do clube, na ordem do app (prioridade). Só apresenta: a página grava. */
@Component({
  selector: 'bo-partners-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PillComponent, ToggleComponent, PartnerLogoComponent],
  template: `
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Parceiro</th>
            <th scope="col">Categoria</th>
            <th scope="col">Benefício</th>
            <th scope="col">Botão</th>
            <th scope="col">Público</th>
            <th scope="col" class="n">Prioridade</th>
            <th scope="col">Ativo</th>
            <th scope="col"><span class="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          @for (p of partners(); track p.id) {
            <tr [class.off]="!p.active">
              <td>
                <div class="who">
                  <bo-partner-logo [name]="p.name" [color]="p.brandColor" [logoUrl]="p.logoUrl" />
                  <div class="names">
                    <span class="name">{{ p.name }}</span>
                    @if (p.isMasterSponsor) {
                      <bo-pill tone="orange">Patrocinador oficial</bo-pill>
                    }
                  </div>
                </div>
              </td>
              <td>{{ categories[p.category] }}</td>
              <td>
                <div class="benefit">
                  @if (p.benefitHighlight) {
                    <span class="hl">{{ p.benefitHighlight }}</span>
                  }
                  <span class="bt">{{ p.benefitTitle }}</span>
                </div>
              </td>
              <td><bo-pill tone="dim">{{ cta(p) }}</bo-pill></td>
              <td>
                <bo-pill [tone]="p.audience === 'all' ? 'green' : 'yellow'">{{ audiences[p.audience] }}</bo-pill>
              </td>
              <td class="n mono">{{ p.priority }}</td>
              <td>
                <bo-toggle
                  [ariaLabel]="(p.active ? 'Desligar ' : 'Ligar ') + p.name"
                  [checked]="p.active"
                  [disabled]="busyId() !== null"
                  (checkedChange)="activeChange.emit({ partner: p, active: $event })"
                />
              </td>
              <td class="end">
                <a class="bo-mini-btn" [routerLink]="['/painel/clube/parceiros', p.id]">Editar</a>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 860px; }
    th { text-align: left; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); padding: 10px 12px; border-bottom: 1px solid var(--nx-line); white-space: nowrap; }
    td { padding: 12px; border-bottom: 1px solid var(--nx-line); font-size: 13px; color: var(--nx-text-mute); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr.off td { opacity: 0.7; }
    .n { text-align: right; }
    .mono { font-family: var(--nx-font-mono); color: var(--nx-text); }
    .end { text-align: right; }
    .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .names { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .benefit { display: flex; flex-direction: column; gap: 2px; max-width: 260px; }
    .hl { font-family: var(--nx-font-display); font-weight: 700; color: var(--nx-text); }
    .bt { font-size: 12px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    a.bo-mini-btn { text-decoration: none; }
  `,
})
export class PartnersTableComponent {
  readonly partners = input.required<readonly Partner[]>();
  /** Parceiro sendo gravado: os toggles esperam. */
  readonly busyId = input<string | null>(null);
  readonly activeChange = output<PartnerActiveChange>();

  protected readonly categories = CATEGORY_LABELS;
  protected readonly audiences = AUDIENCE_LABELS;
  protected readonly cta = ctaSummary;
}
