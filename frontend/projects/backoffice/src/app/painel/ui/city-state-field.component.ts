import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BrLocationsService } from '@nexago/br-locations';
import { FieldComponent } from './field.component';

/**
 * Combo UF → Cidade do sistema (mesmo par do portal do organizador e do perfil
 * do atleta): a cidade só abre depois da UF e é limpa quando a UF muda.
 *
 * `display: contents` no host: os dois `bo-field` viram filhos diretos do grid
 * do formulário, então ocupam duas colunas e alinham com os campos vizinhos.
 *
 * A seleção vai por `[selected]` na opção, NÃO por `[value]` no select: o
 * `value` é aplicado antes de o `@for` criar as opções, e o browser descarta um
 * valor sem opção correspondente — a cidade gravada apareceria em branco.
 */
@Component({
  selector: 'bo-city-state-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent],
  template: `
    <bo-field [label]="stateLabel()">
      <select class="bo-select" (change)="onState($event)">
        <option value="" [selected]="!state()">Selecione</option>
        @for (option of brLocations.states; track option.sigla) {
          <option [value]="option.sigla" [selected]="option.sigla === state()">
            {{ option.name }} ({{ option.sigla }})
          </option>
        }
      </select>
    </bo-field>

    <bo-field [label]="cityLabel()" [hint]="hint()">
      <select class="bo-select" [disabled]="!state()" (change)="cityChange.emit(value($event))">
        <option value="" [selected]="!city()">{{ cityPlaceholder() }}</option>
        @for (option of cityOptions(); track option) {
          <option [value]="option" [selected]="option === city()">{{ option }}</option>
        }
      </select>
    </bo-field>
  `,
  styles: `
    /* Ocupa a linha inteira do grid do formulário e reparte em duas colunas:
       UF e Cidade precisam ficar lado a lado. Deixar os campos caírem soltos no
       grid do pai separava o par em linhas diferentes. */
    :host {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: 1fr 1fr;
      gap: 18px 16px;
      align-items: start;
      min-width: 0;
    }

    @media (max-width: 860px) {
      :host {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class CityStateFieldComponent {
  protected readonly brLocations = inject(BrLocationsService);

  /** Sigla da UF (`'GO'`); `''` = não escolhida. */
  readonly state = input.required<string>();
  readonly city = input.required<string>();
  readonly stateLabel = input('Estado');
  readonly cityLabel = input('Cidade');
  readonly hint = input('');

  readonly stateChange = output<string>();
  readonly cityChange = output<string>();

  protected readonly cityPlaceholder = computed(() => {
    if (!this.state()) return 'Selecione a UF primeiro';
    return this.brLocations.loaded() ? 'Selecione' : 'Carregando…';
  });

  /**
   * Cidade gravada que não bate com a grafia do IBGE (cadastro antigo, digitado
   * à mão) entra como primeira opção — sem isso ela sumiria do select e uma
   * edição de qualquer outro campo a apagaria em silêncio.
   */
  protected readonly cityOptions = computed(() => {
    const cities = this.brLocations.citiesFor(this.state());
    const current = this.city();
    return current && !cities.includes(current) ? [current, ...cities] : cities;
  });

  /** Trocar a UF invalida a cidade: as duas mudanças saem juntas. */
  protected onState(event: Event): void {
    const sigla = this.value(event);
    if (sigla === this.state()) return;
    this.stateChange.emit(sigla);
    if (this.city()) {
      this.cityChange.emit('');
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
