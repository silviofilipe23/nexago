import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { BroadcastGrupo, GrupoMode } from '../data/broadcast-grupo';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';
import { categoriasComGrupos, gruposDaCategoria } from './transmissao-grupo';

/** Card "Tabela do grupo" da tela Transmissão: liga a classificação de uma categoria disputada em
 *  grupos, escolhe categoria, modo (um grupo ou todos) e o grupo exibido/destacado. Sempre grava o
 *  objeto `grupo` completo; o overlay calcula a tabela a partir das partidas do torneio. */
@Component({
  selector: 'og-tx-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let g = svc.control().grupo;
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Tabela do grupo'">
      @if (!bare()) {
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">Classificação do grupo</div>
          <div class="og-toggle-row-desc">Tabela e jogos de um grupo, ou todos os grupos da categoria de uma vez</div>
        </div>
        <button type="button" class="og-toggle" role="switch" [class.on]="g.on" [attr.aria-checked]="g.on" aria-label="Tabela do grupo no ar" (click)="toggle()"></button>
      </div>
      }

      @if (categorias().length === 0) {
        <p class="og-gp-vazio">Nenhuma categoria deste torneio tem fase de grupos</p>
      } @else {
        <div class="og-gp-label">Categoria</div>
        <div class="og-gp-chips" role="radiogroup" aria-label="Categoria da tabela">
          <button type="button" class="og-chip" role="radio" [class.active]="g.categoryId === null" [attr.aria-checked]="g.categoryId === null" (click)="setCategory(null)">Automática</button>
          @for (c of categorias(); track c.id) {
            <button type="button" class="og-chip" role="radio" [class.active]="g.categoryId === c.id" [attr.aria-checked]="g.categoryId === c.id" (click)="setCategory(c.id)">
              {{ c.name }}
            </button>
          }
        </div>

        <div class="og-gp-label">Modo</div>
        <div class="og-gp-chips" role="radiogroup" aria-label="Modo da tabela">
          @for (m of modes; track m.value) {
            <button type="button" class="og-chip" role="radio" [class.active]="g.mode === m.value" [attr.aria-checked]="g.mode === m.value" (click)="setMode(m.value)">
              {{ m.label }}
            </button>
          }
        </div>

        <div class="og-gp-label">{{ g.mode === 'todos' ? 'Destacar grupo' : 'Grupo' }}</div>
        <div class="og-gp-chips" role="radiogroup" aria-label="Grupo da tabela">
          <button type="button" class="og-chip" role="radio" [class.active]="g.group === null" [attr.aria-checked]="g.group === null" (click)="setGroup(null)">
            {{ g.mode === 'todos' ? 'Nenhum' : 'Primeiro' }}
          </button>
          @for (l of letras(); track l) {
            <button type="button" class="og-chip" role="radio" [class.active]="g.group === l" [attr.aria-checked]="g.group === l" (click)="setGroup(l)">
              {{ l }}
            </button>
          }
        </div>
      }
    </og-card>
  `,
  styles: `
    .og-gp-label {
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-gp-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-gp-vazio {
      margin: 8px 0 0;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoGrupoComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly modes: readonly { value: GrupoMode; label: string }[] = [
    { value: 'um', label: 'Um grupo' },
    { value: 'todos', label: 'Todos os grupos' },
  ];

  protected readonly categorias = computed(() => categoriasComGrupos(this.svc.matches(), this.svc.tournament()?.categories ?? []));

  /** Letras da categoria escolhida; em "Automática", as da primeira categoria com grupos. */
  protected readonly letras = computed(() => {
    const id = this.svc.control().grupo.categoryId ?? this.categorias()[0]?.id ?? null;
    return id ? gruposDaCategoria(this.svc.matches(), id) : [];
  });

  private write(change: Partial<BroadcastGrupo>): void {
    void this.svc.save({ grupo: { ...this.svc.control().grupo, ...change } });
  }

  protected toggle(): void {
    this.write({ on: !this.svc.control().grupo.on });
  }

  protected setCategory(categoryId: string | null): void {
    // A letra do grupo anterior pode não existir na categoria nova.
    this.write({ categoryId, group: null });
  }

  protected setMode(mode: GrupoMode): void {
    this.write({ mode });
  }

  protected setGroup(group: string | null): void {
    this.write({ group });
  }
}
