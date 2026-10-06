import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { MultiMode } from '../data/broadcast-multi';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';

/** Card "Multi-quadras" da tela Transmissão: liga a tela que mostra o placar de todas as quadras
 *  ao vivo, escolhe tela cheia ou faixa e destaca uma quadra. Não monta nada: o overlay lê as
 *  partidas do torneio sozinho. */
@Component({
  selector: 'og-tx-multi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let m = svc.control().multi;
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Multi-quadras'">
      @if (!bare()) {
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">Placar de todas as quadras</div>
          <div class="og-toggle-row-desc">Mostra as quadras do torneio ao vivo, atualizando a cada ponto</div>
        </div>
        <button
          type="button"
          class="og-toggle"
          role="switch"
          [class.on]="m.on"
          [attr.aria-checked]="m.on"
          aria-label="Multi-quadras no ar"
          (click)="toggle()"
        ></button>
      </div>
      }

      <div class="og-mq-label">Modo</div>
      <div class="og-mq-chips" role="radiogroup" aria-label="Modo da tela">
        @for (o of modes; track o.value) {
          <button type="button" class="og-chip" role="radio" [class.active]="m.mode === o.value" [attr.aria-checked]="m.mode === o.value" (click)="setMode(o.value)">
            {{ o.label }}
          </button>
        }
      </div>

      <div class="og-mq-label">Destacar quadra</div>
      <div class="og-mq-chips" role="radiogroup" aria-label="Quadra em destaque">
        <button type="button" class="og-chip" role="radio" [class.active]="m.focusCourtId === null" [attr.aria-checked]="m.focusCourtId === null" (click)="setFocus(null)">Nenhuma</button>
        @for (c of courts(); track c.id) {
          <button type="button" class="og-chip" role="radio" [class.active]="m.focusCourtId === c.id" [attr.aria-checked]="m.focusCourtId === c.id" (click)="setFocus(c.id)">
            {{ c.name }}
          </button>
        }
      </div>
      <p class="og-mq-dica">Tela cheia cobre o vídeo; faixa fica embaixo, sobre a imagem.</p>
    </og-card>
  `,
  styles: `
    .og-mq-label {
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-mq-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-mq-dica {
      margin: 12px 0 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoMultiComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly modes: { value: MultiMode; label: string }[] = [
    { value: 'full', label: 'Tela cheia' },
    { value: 'strip', label: 'Faixa' },
  ];

  protected readonly courts = computed(() => [...(this.svc.tournament()?.courts ?? [])].sort((a, b) => a.order - b.order));

  protected toggle(): void {
    const m = this.svc.control().multi;
    void this.svc.save({ multi: { ...m, on: !m.on } });
  }

  protected setMode(mode: MultiMode): void {
    void this.svc.save({ multi: { ...this.svc.control().multi, mode } });
  }

  protected setFocus(focusCourtId: string | null): void {
    void this.svc.save({ multi: { ...this.svc.control().multi, focusCourtId } });
  }
}
