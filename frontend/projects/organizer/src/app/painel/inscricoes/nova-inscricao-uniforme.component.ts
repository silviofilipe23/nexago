import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { InscriptionUniformSlot } from '../data/inscriptions-repository';
import type { UniformCategoryConfig } from '../data/uniforms';

/** Uniforme de UM atleta na inscrição criada pelo organizador. Pede exatamente o que a
 *  categoria exige (`UniformCategoryConfig`, com a herança das flags da raiz já resolvida) —
 *  os mesmos campos que o portal do atleta pede na inscrição normal. */
@Component({
  selector: 'og-nova-inscricao-uniforme',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="og-niu">
      <span class="og-niu-who">{{ athleteName() }}</span>

      <div class="og-niu-row">
        <span class="og-niu-label" [id]="'og-niu-top-' + slotId()">Regata</span>
        <div class="og-filter-bar" role="group" [attr.aria-labelledby]="'og-niu-top-' + slotId()">
          @for (size of config().sizeOptionsTop; track size) {
            <button
              type="button"
              class="og-chip"
              [class.active]="value().sizeTop === size"
              [attr.aria-pressed]="value().sizeTop === size"
              [disabled]="disabled()"
              (click)="patch({ sizeTop: size })"
            >
              {{ size }}
            </button>
          }
        </div>
      </div>

      @if (config().requiresShorts) {
        <div class="og-niu-row">
          <span class="og-niu-label" [id]="'og-niu-shorts-' + slotId()">Shorts</span>
          <div class="og-filter-bar" role="group" [attr.aria-labelledby]="'og-niu-shorts-' + slotId()">
            @for (size of config().sizeOptionsShorts; track size) {
              <button
                type="button"
                class="og-chip"
                [class.active]="value().sizeShorts === size"
                [attr.aria-pressed]="value().sizeShorts === size"
                [disabled]="disabled()"
                (click)="patch({ sizeShorts: size })"
              >
                {{ size }}
              </button>
            }
          </div>
        </div>
      }

      @if (config().numberOnShirt) {
        <label class="og-niu-row">
          <span class="og-niu-label">Número da camisa</span>
          <input
            class="og-niu-input num"
            type="number"
            min="1"
            max="99"
            inputmode="numeric"
            placeholder="1–99"
            [disabled]="disabled()"
            [value]="value().jerseyNumber ?? ''"
            (input)="onNumber($event)"
          />
        </label>
      }

      @if (config().nameOnShirt) {
        <label class="og-niu-row">
          <span class="og-niu-label">Nome na camisa</span>
          <input
            class="og-niu-input"
            type="text"
            maxlength="20"
            placeholder="Como sai na camisa"
            [disabled]="disabled()"
            [value]="value().jerseyName ?? ''"
            (input)="onName($event)"
          />
        </label>
      }
    </div>
  `,
  styles: `
    .og-niu {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-niu:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .og-niu-who {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-niu-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .og-niu-label {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-niu-input {
      width: 100%;
      max-width: 260px;
      height: 36px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-niu-input.num {
      max-width: 110px;
      font-family: var(--nx-font-mono);
    }
    .og-niu-input:focus {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 0;
    }
  `,
})
export class OgNovaInscricaoUniformeComponent {
  readonly athleteName = input.required<string>();
  readonly slotId = input.required<string>();
  readonly config = input.required<UniformCategoryConfig>();
  readonly value = input.required<InscriptionUniformSlot>();
  readonly disabled = input(false);

  /** Emite só o campo que mudou — quem guarda o estado é o pai.
   *
   *  Emitir o slot inteiro (`{...value(), ...partial}`) parecia mais simples e era um bug: como
   *  `value()` é input, dois cliques no mesmo atleta dentro do mesmo ciclo de detecção liam a
   *  versão velha, e o segundo apagava o primeiro (escolher regata e shorts em seguida perdia a
   *  regata). Com o patch, a ordem dos cliques deixa de importar. */
  readonly changed = output<Partial<InscriptionUniformSlot>>();

  protected patch(partial: Partial<InscriptionUniformSlot>): void {
    this.changed.emit(partial);
  }

  protected onNumber(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const parsed = Number.parseInt(raw, 10);
    // Fora de 1–99 vira "não informado": `uniformStatusOf` mantém a linha pendente e o botão
    // travado, em vez de mandar um número que o servidor recusaria.
    this.patch({ jerseyNumber: Number.isFinite(parsed) ? parsed : null });
  }

  protected onName(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.patch({ jerseyName: raw.trim() ? raw : null });
  }
}
