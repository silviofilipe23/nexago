import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DrawGroupView } from '../data/draw-session.model';

/**
 * A grade de grupos entre uma revelação e outra — o estado da chave até aqui.
 *
 * As vagas ainda vazias aparecem como traços: é isso que faz a tela comunicar
 * "faltam três" sem precisar de um contador. O grupo que acabou de receber
 * dupla pulsa uma vez.
 */
@Component({
  selector: 'og-sorteio-grade-grupos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="og-grade" [style.grid-template-columns]="columns()">
      @for (group of groups(); track group.groupId) {
        <section class="og-grupo" [class.hot]="group.groupId === highlightGroupId()">
          <header class="og-grupo-head">
            <span class="og-grupo-letra">Grupo {{ group.groupId }}</span>
            <span class="og-grupo-conta">{{ group.entrants.length }}/{{ group.capacity }}</span>
          </header>
          <ol class="og-grupo-lista">
            @for (entrant of group.entrants; track entrant.teamId) {
              <li class="og-linha">
                <span class="og-linha-pos">{{ $index + 1 }}</span>
                <span class="og-linha-nome">{{ entrant.label }}</span>
                @if (entrant.potIndex === 1) {
                  <span class="og-linha-seed">C</span>
                }
              </li>
            }
            @for (slot of emptySlotsOf(group); track slot) {
              <li class="og-linha og-linha-vazia">
                <span class="og-linha-pos">{{ group.entrants.length + slot + 1 }}</span>
                <span class="og-linha-traco"></span>
              </li>
            }
          </ol>
        </section>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .og-grade {
      display: grid;
      gap: 20px;
      height: 100%;
      /* Os cards abraçam o conteúdo e a grade se centraliza. Esticar até o
         rodapé deixa dois grupos com metade do telão vazia; centralizar
         funciona igual bem com 2 e com 8 grupos. */
      grid-auto-rows: minmax(0, max-content);
      align-content: center;
    }
    .og-grupo {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 20px 22px;
      border-radius: 22px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      transition:
        border-color 240ms var(--nx-ease-out),
        background 240ms var(--nx-ease-out);
    }
    .og-grupo.hot {
      border-color: rgb(255 106 26 / 55%);
      background: var(--nx-orange-tint);
    }
    .og-grupo-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-grupo-letra {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .og-grupo-conta {
      font-family: var(--nx-font-mono);
      font-size: 18px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
    .og-grupo-lista {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 9px;
      flex: 1;
      min-height: 0;
    }
    .og-linha {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      animation: og-linha-entra 320ms var(--nx-ease-out) both;
    }
    .og-linha-vazia {
      background: transparent;
      border-style: dashed;
      border-color: var(--nx-line-strong);
      animation: none;
    }
    .og-linha-pos {
      flex: none;
      width: 26px;
      font-family: var(--nx-font-mono);
      font-size: 17px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
    .og-linha-nome {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 25px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-linha-seed {
      flex: none;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 15px;
    }
    .og-linha-traco {
      flex: 1;
      height: 10px;
      border-radius: 999px;
      background: var(--nx-surface-2);
    }

    @keyframes og-linha-entra {
      from {
        opacity: 0;
        transform: translate3d(0, 12px, 0);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .og-linha {
        animation: none;
      }
      .og-grupo {
        transition: none;
      }
    }
  `,
})
export class SorteioGradeGruposComponent {
  readonly groups = input.required<DrawGroupView[]>();
  /** Grupo que acabou de receber dupla — acende sem precisar de contador. */
  readonly highlightGroupId = input<string | null>(null);

  /** Duas colunas até 4 grupos; três a partir daí, pra não afinar a linha. */
  protected readonly columns = computed(() => {
    const count = this.groups().length;
    const perRow = count <= 4 ? 2 : count <= 9 ? 3 : 4;
    return `repeat(${Math.min(perRow, count || 1)}, minmax(0, 1fr))`;
  });

  protected emptySlotsOf(group: DrawGroupView): number[] {
    return Array.from({ length: Math.max(0, group.capacity - group.entrants.length) }, (_, i) => i);
  }
}
