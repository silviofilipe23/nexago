import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { BroadcastEventos, EventosCard, EventosMode } from '../data/broadcast-eventos';
import { countInscriptions } from '../data/inscriptions-repository';
import { fetchUpcomingPublicEvents } from '../data/upcoming-events-repository';
import { OgCardComponent } from '../ui/card.component';
import { EVENTOS_MAX, eventosCardOf } from './eventos-card';
import { TransmissaoDataService } from './transmissao-data.service';

const MODES: { value: EventosMode; label: string }[] = [
  { value: 'full', label: 'Tela cheia' },
  { value: 'strip', label: 'Faixa' },
];

function defaultSeason(): string {
  return `Circuito NexaGO ${new Date().getFullYear()}`;
}

/** Card "Próximos eventos" da tela Transmissão. O overlay público não consegue contar inscrições,
 *  então o painel (logado) lê os torneios públicos futuros + a contagem e grava o card pronto em
 *  `broadcast/control.eventos`; as vagas valem do último "Atualizar eventos".
 *
 *  Grava sempre o objeto `eventos` COMPLETO, com `null` explícito: `setDoc` com merge funde
 *  mapas e campo omitido deixaria resto do card anterior no ar. */
@Component({
  selector: 'og-tx-eventos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    @let ev = svc.control().eventos;
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Próximos eventos'">
      <label class="og-ev-label" for="og-ev-season">Temporada</label>
      <input
        id="og-ev-season"
        class="og-input-el"
        type="text"
        aria-label="Temporada"
        maxlength="60"
        [value]="season()"
        (input)="onSeasonInput($event)"
        (blur)="saveSeason()"
        (keydown.enter)="saveSeason()"
      />
      <div class="og-ev-label og-ev-label-gap">Modo</div>
      <div class="og-ev-chips" role="radiogroup" aria-label="Modo dos eventos">
        @for (m of modes; track m.value) {
          <button type="button" class="og-chip" role="radio" [class.active]="ev.mode === m.value" [attr.aria-checked]="ev.mode === m.value" (click)="setMode(m.value)">
            {{ m.label }}
          </button>
        }
      </div>
      <div class="og-ev-acoes">
        <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="busy()" (click)="update()">
          {{ busy() ? 'Atualizando…' : 'Atualizar eventos' }}
        </button>
      </div>
      @if (error()) {
        <p class="og-ev-erro" role="alert">Não deu pra atualizar os eventos — confira a conexão e tente de novo.</p>
      }
      @if (empty()) {
        <p class="og-ev-dica">Nenhum evento público futuro encontrado.</p>
      }

      @if (ev.card; as card) {
        <div class="og-ev-card">
          <div class="og-ev-card-titulo">
            {{ card.items.length }} {{ card.items.length === 1 ? 'evento' : 'eventos' }}{{ updatedAt() ? ' · atualizado às ' + updatedAt() : '' }}
          </div>
          <ul class="og-ev-lista">
            @for (i of card.items; track i.id) {
              <li>
                <span class="og-ev-nome">{{ i.name }}</span>
                <span class="og-ev-data">{{ dateLabel(i.startMs) }}</span>
              </li>
            }
          </ul>
        </div>
      }
      @if (!bare()) {
        <div class="og-toggle-row">
          <div class="og-toggle-row-text">
            <div class="og-toggle-row-title">No ar</div>
            <div class="og-toggle-row-desc">{{ ev.card ? 'Mostra a agenda de eventos na live' : 'Atualize os eventos pra poder pôr no ar' }}</div>
          </div>
          <button
            type="button"
            class="og-toggle"
            role="switch"
            aria-label="Próximos eventos no ar"
            [class.on]="ev.on"
            [attr.aria-checked]="ev.on"
            [disabled]="!ev.card && !ev.on"
            (click)="toggleOnAir()"
          ></button>
        </div>
      }
    </og-card>
  `,
  styles: `
    .og-ev-label {
      margin: 0 0 8px;
      display: block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-ev-label-gap {
      margin-top: 12px;
    }
    .og-ev-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-ev-acoes {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin: 12px 0;
    }
    .og-ev-dica {
      margin: 6px 0;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-ev-erro {
      margin: 6px 0;
      font-size: 13px;
      color: var(--nx-live, #ff3b30);
    }
    .og-ev-card {
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-ev-card-titulo {
      font-size: 14px;
      font-weight: 600;
    }
    .og-ev-lista {
      margin: 6px 0 0;
      padding: 0;
      list-style: none;
      font-size: 12px;
    }
    .og-ev-lista li {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .og-ev-nome {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-ev-data {
      flex: none;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoEventosComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura, título nem chave "No ar" próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);
  protected readonly modes = MODES;

  /** Edição em curso; sem ela, a temporada do card gravado (senão `Circuito NexaGO <ano>`). */
  protected readonly typedSeason = signal<string | null>(null);
  protected readonly season = computed(() => this.typedSeason() ?? this.svc.control().eventos.card?.season ?? defaultSeason());
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly empty = signal(false);
  /** Hora do último "Atualizar" desta sessão da tela ("14:32"). */
  protected readonly updatedAt = signal<string | null>(null);

  private patch(on: boolean, mode: EventosMode, card: EventosCard | null): { eventos: BroadcastEventos } {
    return { eventos: { on, mode, card } };
  }

  protected dateLabel(ms: number): string {
    return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  protected setMode(mode: EventosMode): void {
    const { on, card } = this.svc.control().eventos;
    void this.svc.save(this.patch(on, mode, card));
  }

  protected onSeasonInput(e: Event): void {
    this.typedSeason.set((e.target as HTMLInputElement).value);
  }

  /** Só regrava o card existente (mesma key e vagas: não recontar nem reanimar a tela). */
  protected saveSeason(): void {
    const { on, mode, card } = this.svc.control().eventos;
    const season = this.season().trim() || defaultSeason();
    this.typedSeason.set(season);
    if (card && card.season !== season) void this.svc.save(this.patch(on, mode, { ...card, season }));
  }

  /** Lê os torneios públicos futuros, conta as inscrições dos escolhidos e grava o card. */
  protected async update(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(false);
    this.empty.set(false);
    try {
      const nowMs = Date.now();
      const picked = (await fetchUpcomingPublicEvents(new Date(nowMs))).slice(0, EVENTOS_MAX);
      const counts = await Promise.allSettled(picked.map((e) => countInscriptions(e.id)));
      const filled = new Map<string, number>();
      counts.forEach((r, i) => {
        if (r.status === 'fulfilled') filled.set(picked[i].id, r.value);
      });
      const season = this.season().trim() || defaultSeason();
      const card = eventosCardOf(picked, filled, nowMs, `ev:${nowMs}`, season);
      if (!card) {
        this.empty.set(true);
        return;
      }
      const { on, mode } = this.svc.control().eventos;
      await this.svc.save(this.patch(on, mode, card));
      this.updatedAt.set(new Date(nowMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected toggleOnAir(): void {
    const { on, mode, card } = this.svc.control().eventos;
    void this.svc.save(this.patch(!on, mode, card));
  }
}
