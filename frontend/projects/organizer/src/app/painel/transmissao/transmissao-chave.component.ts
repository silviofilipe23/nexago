import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { BroadcastChave } from '../data/broadcast-chave';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';
import { categoriasComChave } from './transmissao-chave';

/** Card "Chaves" da tela Transmissão: liga a chave eliminatória (simples ou dupla) de uma
 *  categoria e escolhe qual. Sempre grava o objeto `chave` completo; o overlay desenha a chave
 *  a partir das partidas do torneio. */
@Component({
  selector: 'og-tx-chave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let c = svc.control().chave;
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Chaves'">
      @if (!bare()) {
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">Chave eliminatória</div>
          <div class="og-toggle-row-desc">A chave de uma categoria, com os confrontos e o caminho até a final</div>
        </div>
        <button type="button" class="og-toggle" role="switch" [class.on]="c.on" [attr.aria-checked]="c.on" aria-label="Chaves no ar" (click)="toggle()"></button>
      </div>
      }

      @if (categorias().length === 0) {
        <p class="og-ch-texto">Nenhuma categoria deste torneio tem chave eliminatória</p>
      } @else {
        <div class="og-ch-label">Categoria</div>
        <div class="og-ch-chips" role="radiogroup" aria-label="Categoria da chave">
          <button type="button" class="og-chip" role="radio" [class.active]="c.categoryId === null" [attr.aria-checked]="c.categoryId === null" (click)="setCategory(null)">Automática</button>
          @for (k of categorias(); track k.id) {
            <button type="button" class="og-chip" role="radio" [class.active]="c.categoryId === k.id" [attr.aria-checked]="c.categoryId === k.id" (click)="setCategory(k.id)">
              {{ k.name }}
            </button>
          }
        </div>
        <p class="og-ch-texto">Chave simples ou dupla eliminatória: o overlay detecta pelas partidas da categoria.</p>
      }
    </og-card>
  `,
  styles: `
    .og-ch-label {
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-ch-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-ch-texto {
      margin: 8px 0 0;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoChaveComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly categorias = computed(() => categoriasComChave(this.svc.matches(), this.svc.tournament()?.categories ?? []));

  private write(change: Partial<BroadcastChave>): void {
    void this.svc.save({ chave: { ...this.svc.control().chave, ...change } });
  }

  protected toggle(): void {
    this.write({ on: !this.svc.control().chave.on });
  }

  protected setCategory(categoryId: string | null): void {
    this.write({ categoryId });
  }
}
