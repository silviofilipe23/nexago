import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';

/** Card "Bolão ao vivo" da tela Transmissão: liga a divisão dos palpites da partida. O overlay
 *  conta os palpites sozinho — não há o que configurar. */
@Component({
  selector: 'og-tx-bolao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let b = svc.control().bolao;
    <og-card [kicker]="bare() ? '' : 'Partida'" [title]="bare() ? '' : 'Bolão ao vivo'">
      @if (!bare()) {
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">Palpites da partida</div>
          <div class="og-toggle-row-desc">Divisão dos palpites entre as duas duplas, na quadra transmitida</div>
        </div>
        <button type="button" class="og-toggle" role="switch" [class.on]="b.on" [attr.aria-checked]="b.on" aria-label="Bolão ao vivo no ar" (click)="toggle()"></button>
      </div>
      }
      <p class="og-bl-dica">
        Mostra a divisão dos palpites da partida da quadra transmitida (quem leva?), com a contagem ao vivo, o encerramento quando a partida
        começa e o resultado no fim. Substitui o placar enquanto estiver no ar.
      </p>
    </og-card>
  `,
  styles: `
    .og-bl-dica {
      margin: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoBolaoComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected toggle(): void {
    const b = this.svc.control().bolao;
    void this.svc.save({ bolao: { ...b, on: !b.on } });
  }
}
