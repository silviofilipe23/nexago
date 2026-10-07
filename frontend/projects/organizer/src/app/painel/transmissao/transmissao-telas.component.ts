import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import type { BroadcastControlPatch } from '../data/broadcast-control-repository';
import { TELAS_MAX_SEC, type TelasTela } from '../data/broadcast-telas';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';

type TelasPatch = NonNullable<BroadcastControlPatch['telas']>;

const TELAS: readonly { id: TelasTela; label: string }[] = [
  { id: 'ini', label: 'Início' },
  { id: 'fim', label: 'Fim' },
];

const PRESETS: readonly { min: number; label: string }[] = [
  { min: 5, label: '5 min' },
  { min: 10, label: '10 min' },
  { min: 15, label: '15 min' },
];

/** Card "Início e fim" da tela Transmissão: escolhe a tela cheia (Início ou Fim) e controla a contagem
 *  do Início. Sempre grava o objeto `telas` completo; a contagem é o carimbo do servidor do início +
 *  a duração, e cada tela calcula o que falta. */
@Component({
  selector: 'og-tx-telas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let t = svc.control().telas;
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Início e fim'">
      @if (!bare()) {
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">Telas de início e fim</div>
          <div class="og-toggle-row-desc">Cobre a transmissão com a contagem do início ou o agradecimento do fim</div>
        </div>
        <button type="button" class="og-toggle" role="switch" [class.on]="t.on" [attr.aria-checked]="t.on" aria-label="Início e fim no ar" (click)="toggle()"></button>
      </div>
      }

      <div class="og-te-label">Tela</div>
      <div class="og-te-chips" role="radiogroup" aria-label="Tela">
        @for (o of telas; track o.id) {
          <button type="button" class="og-chip" role="radio" [class.active]="t.tela === o.id" [attr.aria-checked]="t.tela === o.id" (click)="setTela(o.id)">
            {{ o.label }}
          </button>
        }
      </div>

      <div class="og-te-label">Contagem do início</div>
      <div class="og-te-chips" role="radiogroup" aria-label="Duração da contagem">
        @for (p of presets; track p.min) {
          <button type="button" class="og-chip" role="radio" [class.active]="t.durationSec === p.min * 60" [attr.aria-checked]="t.durationSec === p.min * 60" (click)="preset(p.min)">
            {{ p.label }}
          </button>
        }
        <button type="button" class="og-ghost-btn" aria-label="Menos 1 minuto" [disabled]="t.durationSec <= 0" (click)="adjust(-60)">−1 min</button>
        <button type="button" class="og-ghost-btn" aria-label="Mais 1 minuto" [disabled]="t.durationSec >= max" (click)="adjust(60)">+1 min</button>
      </div>

      <div class="og-te-acoes">
        <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="start()">
          {{ t.startedAt ? 'Reiniciar' : 'Iniciar contagem' }}
        </button>
        <button type="button" class="og-ghost-btn" [disabled]="!t.startedAt" (click)="stop()">Parar contagem</button>
        <span class="og-te-resta">{{ restante() }}</span>
      </div>

      <p class="og-te-dica">Fim mostra o card da próxima etapa a partir do card de Próximos eventos (use Atualizar eventos lá).</p>
    </og-card>
  `,
  styles: `
    .og-te-label {
      display: block;
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-te-chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .og-te-acoes {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }
    .og-te-resta {
      margin-left: auto;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
    .og-te-dica {
      margin: 14px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoTelasComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly telas = TELAS;
  protected readonly presets = PRESETS;
  protected readonly max = TELAS_MAX_SEC;

  private readonly now = signal(Date.now());

  /** O que falta da contagem, em texto pequeno. */
  protected readonly restante = computed(() => {
    const { startedAt, durationSec } = this.svc.control().telas;
    if (!startedAt) return 'Contagem parada';
    const left = Math.ceil((startedAt.getTime() + durationSec * 1000 - this.now()) / 1000);
    if (left <= 0) return 'Contagem encerrada';
    return `Faltam ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private write(change: Partial<TelasPatch>): void {
    void this.svc.save({ telas: { ...this.svc.control().telas, ...change } });
  }

  protected toggle(): void {
    this.write({ on: !this.svc.control().telas.on });
  }

  protected setTela(tela: TelasTela): void {
    if (tela !== this.svc.control().telas.tela) this.write({ tela });
  }

  /** Define a duração e reinicia a contagem. */
  protected preset(min: number): void {
    this.write({ durationSec: min * 60, startedAt: serverTimestamp() });
  }

  /** Ajusta a duração sem reiniciar: o mesmo início segue valendo. */
  protected adjust(deltaSec: number): void {
    const durationSec = Math.min(TELAS_MAX_SEC, Math.max(0, this.svc.control().telas.durationSec + deltaSec));
    this.write({ durationSec });
  }

  protected start(): void {
    this.write({ startedAt: serverTimestamp() });
  }

  protected stop(): void {
    this.write({ startedAt: null });
  }
}
