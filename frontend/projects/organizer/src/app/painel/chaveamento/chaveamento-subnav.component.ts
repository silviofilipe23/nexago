import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

const TABS = [
  { key: 'grupos', label: 'Grupos', link: '/painel/chaveamento/grupos' },
  { key: 'chave', label: 'Chaveamento', link: '/painel/chaveamento/chave' },
  { key: 'jogos', label: 'Jogos', link: '/painel/chaveamento/jogos' },
  { key: 'agendamento', label: 'Agendamento', link: '/painel/chaveamento/agendamento' },
] as const;

/** Sub-navegação entre as telas de grupos/chaveamento/jogos/agendamento (um único item na sidebar cobre as quatro). */
@Component({
  selector: 'og-chaveamento-subnav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'og-filter-bar' },
  template: `
    @for (t of tabs; track t.key) {
      <a class="og-chip" [class.active]="t.key === active()" [routerLink]="t.link">{{ t.label }}</a>
    }
  `,
})
export class ChaveamentoSubnavComponent {
  readonly active = input.required<'grupos' | 'chave' | 'jogos' | 'agendamento'>();
  protected readonly tabs = TABS;
}
