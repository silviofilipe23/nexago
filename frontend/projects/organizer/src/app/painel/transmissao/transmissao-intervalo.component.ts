import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import type { BroadcastControlPatch } from '../data/broadcast-control-repository';
import { INTERVALO_BADGE, INTERVALO_MODES, INTERVALO_PRESETS, type BroadcastIntervalo, type IntervaloMode } from '../data/broadcast-intervalo';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';

type IntervaloPatch = NonNullable<BroadcastControlPatch['intervalo']>;

const DURATION_OPTIONS: readonly { sec: number; label: string }[] = [
  { sec: 120, label: '2 min' },
  { sec: 300, label: '5 min' },
  { sec: 600, label: '10 min' },
  { sec: 900, label: '15 min' },
  { sec: 0, label: 'Sem contagem' },
];

/** Card "Intervalo" da tela Transmissão: texto da tela de intervalo (modo, duas linhas de título e
 *  subtítulo) e a contagem regressiva. Sempre grava o objeto `intervalo` completo; a contagem é o
 *  carimbo do servidor do início + a duração, e cada tela calcula o que falta. */
@Component({
  selector: 'og-tx-intervalo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let i = svc.control().intervalo;
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Intervalo'">
      @if (!bare()) {
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">Tela de intervalo</div>
          <div class="og-toggle-row-desc">Cobre a transmissão nos momentos sem jogo, com contagem regressiva</div>
        </div>
        <button type="button" class="og-toggle" role="switch" [class.on]="i.on" [attr.aria-checked]="i.on" aria-label="Intervalo no ar" (click)="toggle()"></button>
      </div>
      }

      <div class="og-iv-label">Modo</div>
      <div class="og-iv-chips" role="radiogroup" aria-label="Modo do intervalo">
        @for (m of modes; track m) {
          <button type="button" class="og-chip" role="radio" [class.active]="i.mode === m" [attr.aria-checked]="i.mode === m" (click)="setMode(m)">
            {{ badge[m] }}
          </button>
        }
      </div>

      <label class="og-iv-label" for="og-iv-line1">Título · linha 1</label>
      <input id="og-iv-line1" #l1 class="og-input-el" maxlength="40" [value]="i.line1" (blur)="setText('line1', l1.value)" (keydown.enter)="l1.blur()" />
      <label class="og-iv-label" for="og-iv-line2">Título · linha 2 (laranja)</label>
      <input id="og-iv-line2" #l2 class="og-input-el" maxlength="40" [value]="i.line2" (blur)="setText('line2', l2.value)" (keydown.enter)="l2.blur()" />
      <label class="og-iv-label" for="og-iv-sub">Subtítulo</label>
      <input id="og-iv-sub" #sub class="og-input-el" maxlength="140" [value]="i.subtitle" (blur)="setText('subtitle', sub.value)" (keydown.enter)="sub.blur()" />

      <div class="og-iv-label">Duração da contagem</div>
      <div class="og-iv-chips" role="radiogroup" aria-label="Duração da contagem">
        @for (o of durations; track o.sec) {
          <button type="button" class="og-chip" role="radio" [class.active]="i.durationSec === o.sec" [attr.aria-checked]="i.durationSec === o.sec" (click)="setDuration(o.sec)">
            {{ o.label }}
          </button>
        }
        <label class="og-iv-min">
          <input #min type="number" min="0" max="360" class="og-input-el" aria-label="Duração em minutos" [value]="i.durationSec / 60" (blur)="setDuration(+min.value * 60)" (keydown.enter)="min.blur()" />
          min
        </label>
      </div>

      <div class="og-iv-acoes">
        <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="i.durationSec === 0" (click)="start()">
          {{ i.startedAt ? 'Reiniciar' : 'Iniciar contagem' }}
        </button>
        <button type="button" class="og-ghost-btn" [disabled]="!i.startedAt" (click)="stop()">Parar contagem</button>
        <span class="og-iv-resta">{{ restante() }}</span>
      </div>
    </og-card>
  `,
  styles: `
    .og-iv-label {
      display: block;
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-iv-chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .og-iv-min {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-iv-min input {
      width: 76px;
    }
    .og-iv-acoes {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }
    .og-iv-resta {
      margin-left: auto;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoIntervaloComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly modes = INTERVALO_MODES;
  protected readonly badge = INTERVALO_BADGE;
  protected readonly durations = DURATION_OPTIONS;

  private readonly now = signal(Date.now());

  /** O que falta da contagem, em texto pequeno. */
  protected readonly restante = computed(() => {
    const { startedAt, durationSec } = this.svc.control().intervalo;
    if (durationSec === 0) return 'Sem contagem';
    if (!startedAt) return 'Contagem parada';
    const left = Math.ceil((startedAt.getTime() + durationSec * 1000 - this.now()) / 1000);
    if (left <= 0) return 'Contagem encerrada';
    return `Faltam ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private write(change: Partial<IntervaloPatch>): void {
    void this.svc.save({ intervalo: { ...this.svc.control().intervalo, ...change } });
  }

  protected toggle(): void {
    this.write({ on: !this.svc.control().intervalo.on });
  }

  protected setMode(mode: IntervaloMode): void {
    this.write({ mode, ...INTERVALO_PRESETS[mode] });
  }

  protected setText(field: keyof Pick<BroadcastIntervalo, 'line1' | 'line2' | 'subtitle'>, value: string): void {
    const v = value.trim();
    if (v && v !== this.svc.control().intervalo[field]) this.write({ [field]: v });
  }

  protected setDuration(sec: number): void {
    const durationSec = Number.isFinite(sec) && sec >= 0 ? Math.min(Math.round(sec), 6 * 3600) : 0;
    if (durationSec !== this.svc.control().intervalo.durationSec) this.write({ durationSec });
  }

  protected start(): void {
    this.write({ startedAt: serverTimestamp() });
  }

  protected stop(): void {
    this.write({ startedAt: null });
  }
}
