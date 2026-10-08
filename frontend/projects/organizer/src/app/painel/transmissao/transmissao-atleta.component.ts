import { ChangeDetectionStrategy, Component, InjectionToken, computed, inject, input, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { nomeCurtoDe } from '../../publico/overlay/overlay-nome';
import { ATLETA_SEG_DEFAULT } from '../data/broadcast-atleta';
import { fetchMatchesOfTeam, resolveCourtNames, type TournamentMatch } from '../data/matches-repository';
import { OgCardComponent } from '../ui/card.component';
import { atletaCardOf } from './atleta-card';
import { TransmissaoDataService } from './transmissao-data.service';
import { courtMatchOf } from './transmissao-selectors';

/** Busca das partidas da dupla (temporada e confronto direto). Token só pra os testes trocarem. */
export const ATLETA_HISTORY_FETCHER = new InjectionToken<(teamId: string) => Promise<TournamentMatch[]>>('ATLETA_HISTORY_FETCHER', {
  providedIn: 'root',
  factory: () => fetchMatchesOfTeam,
});

interface AtletaOpcao {
  uid: string;
  teamId: string;
  label: string;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Card "Atleta" da tela Transmissão: o operador escolhe um dos quatro atletas da partida e o card
 *  (perfil, temporada, jogos) sobe no canto. É um DISPARO — cada ação grava o objeto `atleta`
 *  completo com `seq + 1`; "Sair" grava `card: null`. */
@Component({
  selector: 'og-tx-atleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Atleta'">
      <div class="og-at-label">Atleta</div>
      <div class="og-at-chips" role="radiogroup" aria-label="Atleta">
        @for (a of opcoes(); track a.uid; let i = $index) {
          <button type="button" class="og-chip" role="radio" [class.active]="atual() === i" [attr.aria-checked]="atual() === i" [disabled]="busy()" (click)="mostra(i)">
            {{ a.label }}
          </button>
        }
      </div>
      @if (opcoes().length === 0) {
        <p class="og-at-dica">A quadra transmitida não tem partida com as duas duplas definidas.</p>
      }

      <div class="og-at-campos">
        <label class="og-at-campo">
          <span>Tempo (s)</span>
          <input type="number" min="0" max="120" step="1" aria-label="Tempo (s)" [value]="seg()" (input)="setSeg($event)" />
        </label>
        <span class="og-at-conta">{{ contador() }}</span>
      </div>

      <div class="og-at-acoes">
        <button type="button" class="og-ghost-btn" aria-label="Atleta anterior" [disabled]="busy() || opcoes().length === 0" (click)="passa(-1)">◀</button>
        <button type="button" class="og-ghost-btn" aria-label="Próximo atleta" [disabled]="busy() || opcoes().length === 0" (click)="passa(1)">▶</button>
        <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="sair()">Sair</button>
        @if (busy()) {
          <span class="og-at-conta" role="status">Montando…</span>
        }
      </div>
      @if (erro()) {
        <p class="og-at-dica og-at-aviso">Não deu pra carregar o histórico. O card sobe sem temporada e confronto direto.</p>
      }
      @if (hint(); as h) {
        <p class="og-at-dica og-at-aviso">{{ h }}</p>
      }
      <p class="og-at-dica">Tempo 0 deixa o card no ar até "Sair". ◀ ▶ trocam de atleta e já mostram.</p>
    </og-card>
  `,
  styles: `
    .og-at-label {
      display: block;
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-at-chips,
    .og-at-campos,
    .og-at-acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .og-at-campos {
      margin-top: 14px;
      gap: 16px;
    }
    .og-at-campo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .og-at-campo input {
      width: 72px;
    }
    .og-at-conta {
      margin-left: auto;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
    .og-at-acoes {
      margin-top: 16px;
    }
    .og-at-dica {
      margin: 14px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
    .og-at-aviso {
      color: var(--nx-warn, var(--nx-text-dim));
    }
  `,
})
export class TransmissaoAtletaComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura nem título próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);
  private readonly fetchHistory = inject(ATLETA_HISTORY_FETCHER);

  protected readonly seg = signal(ATLETA_SEG_DEFAULT);
  protected readonly busy = signal(false);
  protected readonly erro = signal(false);
  protected readonly hint = signal<string | null>(null);
  /** Posição (entre os quatro) do último atleta mostrado; -1 = nenhum ainda. */
  protected readonly atual = signal(-1);

  private readonly partida = computed(() => {
    const matches = resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []);
    return courtMatchOf(matches, this.svc.control().courtId, Date.now());
  });

  /** Os quatro atletas da partida (dois por dupla), na ordem do elenco. */
  protected readonly opcoes = computed<AtletaOpcao[]>(() => {
    const m = this.partida();
    if (!m) return [];
    const rosters = this.svc.rosters();
    return [m.teamAId, m.teamBId].flatMap((teamId) =>
      (teamId ? (rosters.get(teamId)?.members ?? []) : [])
        .filter((p) => p.name.trim() !== '')
        .slice(0, 2)
        .map((p) => ({ uid: p.uid, teamId: teamId!, label: nomeCurtoDe(p.name) })),
    );
  });

  protected readonly contador = computed(() => (this.atual() >= 0 ? `${this.atual() + 1} / ${this.opcoes().length}` : `– / ${this.opcoes().length}`));

  protected setSeg(e: Event): void {
    this.seg.set(clampInt((e.target as HTMLInputElement).value, 0, 120, ATLETA_SEG_DEFAULT));
  }

  protected passa(delta: 1 | -1): void {
    const n = this.opcoes().length;
    if (n === 0) return;
    const base = this.atual() < 0 ? (delta === 1 ? -1 : 0) : this.atual();
    void this.mostra((base + delta + n) % n);
  }

  protected async mostra(i: number): Promise<void> {
    const a = this.opcoes()[i];
    const match = this.partida();
    if (!a || !match || this.busy()) return;
    this.busy.set(true);
    this.erro.set(false);
    this.hint.set(null);
    this.atual.set(i);
    try {
      this.svc.ensureRanking();
      let history: TournamentMatch[] = [];
      try {
        history = await this.fetchHistory(a.teamId);
      } catch {
        this.erro.set(true);
      }
      const t = this.svc.tournament();
      const card = atletaCardOf(
        {
          matches: this.svc.matches(),
          history,
          rosters: this.svc.rosters(),
          details: this.svc.details(),
          athleteRanking: this.svc.athleteRanking(),
          categoryName: t?.categories.find((c) => c.id === match.categoryId)?.name ?? null,
          courtName: match.court,
          year: new Date().getFullYear(),
        },
        a.teamId,
        a.uid,
        match,
        `${a.uid}:${Date.now()}`,
      );
      if (!card) {
        this.hint.set('Não deu pra montar o card desse atleta.');
        return;
      }
      await this.svc.save({ atleta: { seq: this.svc.control().atleta.seq + 1, seg: this.seg(), card, at: serverTimestamp() as never } });
    } finally {
      this.busy.set(false);
    }
  }

  protected sair(): void {
    void this.svc.save({ atleta: { seq: this.svc.control().atleta.seq + 1, seg: this.seg(), card: null, at: serverTimestamp() as never } });
  }
}
