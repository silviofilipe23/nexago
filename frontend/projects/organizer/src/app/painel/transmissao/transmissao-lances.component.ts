import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { serverTimestamp } from 'firebase/firestore';
import { nomeCurtoDe, nomesCurtosDe } from '../../publico/overlay/overlay-nome';
import {
  LANCE_LABEL,
  LANCE_SEG_DEFAULT,
  LANCE_TIPOS,
  lanceChave,
  lanceContagemOf,
  lanceDisparo,
  lanceEhDaDupla,
  type LanceTipo,
} from '../data/broadcast-lances';
import { resolveCourtNames } from '../data/matches-repository';
import { OgCardComponent } from '../ui/card.component';
import { TransmissaoDataService } from './transmissao-data.service';
import { courtMatchOf } from './transmissao-selectors';

const N_PADRAO: Record<'rally' | 'onfire', number> = { rally: 18, onfire: 4 };

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Card "Lances" da tela Transmissão: o operador dispara a vinheta (Monster Block, Ace…) e a tarja
 *  do atleta. É um DISPARO — cada clique grava o objeto `lances` completo com `seq + 1`; não há
 *  "No ar" nem nada a desligar. A contagem por atleta no jogo mora em `lances.contagem`. */
@Component({
  selector: 'og-tx-lances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.og-tx-bare]': 'bare()' },
  imports: [OgCardComponent],
  template: `
    <og-card [kicker]="bare() ? '' : 'Apresentação'" [title]="bare() ? '' : 'Lances'">
      @if (daDupla()) {
        <div class="og-lc-label">Dupla</div>
        <div class="og-lc-chips" role="radiogroup" aria-label="Dupla">
          @for (l of lados(); track l.lado) {
            <button type="button" class="og-chip" role="radio" [class.active]="lado() === l.lado" [attr.aria-checked]="lado() === l.lado" (click)="lado.set(l.lado)">
              {{ l.label }}
            </button>
          }
        </div>
      } @else {
        <div class="og-lc-label">Atleta</div>
        <div class="og-lc-chips" role="radiogroup" aria-label="Atleta">
          @for (a of todosAtletas(); track a.lado + '-' + a.atleta) {
            <button type="button" class="og-chip" role="radio" [class.active]="lado() === a.lado && atleta() === a.atleta" [attr.aria-checked]="lado() === a.lado && atleta() === a.atleta" (click)="escolhe(a.lado, a.atleta)">
              {{ a.label }}
            </button>
          }
        </div>
      }

      <div class="og-lc-label">Lance</div>
      <div class="og-lc-chips" role="radiogroup" aria-label="Lance">
        @for (t of tipos; track t) {
          <button type="button" class="og-chip" role="radio" [class.active]="tipo() === t" [attr.aria-checked]="tipo() === t" (click)="tipo.set(t)">
            {{ labels[t] }}
          </button>
        }
      </div>

      <div class="og-lc-campos">
        @if (daDupla()) {
          <label class="og-lc-campo">
            <span>{{ tipo() === 'rally' ? 'Trocas' : 'Pontos seguidos' }}</span>
            <input type="number" min="1" max="999" step="1" [value]="n()" (input)="setN($event)" />
          </label>
        }
        <label class="og-lc-campo">
          <span>Tarja (s)</span>
          <input type="number" min="0" max="60" step="1" aria-label="Tarja (s)" [value]="seg()" (input)="setSeg($event)" />
        </label>
        <span class="og-lc-conta">{{ resumo() }}</span>
      </div>

      <div class="og-lc-acoes">
        <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="disparar()">Disparar {{ labels[tipo()] }}</button>
        <button type="button" class="og-ghost-btn" (click)="zerar()">Zerar contagem</button>
      </div>
      <p class="og-lc-dica">Seg 0 deixa a tarja no ar até o próximo lance. A contagem é por atleta, no jogo todo.</p>
    </og-card>
  `,
  styles: `
    .og-lc-label {
      display: block;
      margin: 14px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-lc-chips,
    .og-lc-campos,
    .og-lc-acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .og-lc-campos {
      margin-top: 14px;
      gap: 16px;
    }
    .og-lc-campo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .og-lc-campo input {
      width: 72px;
    }
    .og-lc-conta {
      margin-left: auto;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
    }
    .og-lc-acoes {
      margin-top: 16px;
    }
    .og-lc-dica {
      margin: 14px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoLancesComponent {
  /** Dentro da coluna "Configurações" da tela: sem moldura nem título próprios. */
  readonly bare = input(false);
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly tipos = LANCE_TIPOS;
  protected readonly labels = LANCE_LABEL;

  protected readonly tipo = signal<LanceTipo>('block');
  protected readonly lado = signal<0 | 1>(0);
  protected readonly atleta = signal<0 | 1>(0);
  protected readonly seg = signal(LANCE_SEG_DEFAULT);
  private readonly nRally = signal(N_PADRAO.rally);
  private readonly nOnfire = signal(N_PADRAO.onfire);

  protected readonly daDupla = computed(() => lanceEhDaDupla(this.tipo()));
  protected readonly n = computed(() => (this.tipo() === 'onfire' ? this.nOnfire() : this.nRally()));

  /** Partida da quadra transmitida e o elenco de cada dupla, quando o painel já os tem. */
  private readonly elenco = computed(() => {
    const matches = resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []);
    const m = courtMatchOf(matches, this.svc.control().courtId, Date.now());
    const rosters = this.svc.rosters();
    const membros = (teamId: string | undefined): string[] =>
      ((teamId ? rosters.get(teamId)?.members : undefined) ?? []).map((p) => nomeCurtoDe(p.name)).filter((n) => n !== '');
    const side = (teamId: string | undefined, label: string): string[] => {
      const nomes = membros(teamId);
      return nomes.length > 0 ? nomes.slice(0, 2) : [`${label} · 1`, `${label} · 2`];
    };
    /** Elenco primeiro (o rótulo da partida vem "A definir" enquanto as equipes não carregam). */
    const dupla = (teamId: string | undefined, label: string | undefined): string => {
      const nomes = membros(teamId);
      if (nomes.length > 0) return nomes.slice(0, 2).join(' / ');
      const doJogo = label ? nomesCurtosDe(label) : '';
      return doJogo !== '' && doJogo !== 'A definir' ? doJogo : '';
    };
    return {
      nomes: [dupla(m?.teamAId, m?.team1Label), dupla(m?.teamBId, m?.team2Label)],
      atletas: [side(m?.teamAId, 'Dupla A'), side(m?.teamBId, 'Dupla B')] as const,
    };
  });

  protected readonly lados = computed(() => [
    { lado: 0 as const, label: this.elenco().nomes[0] || 'Dupla A' },
    { lado: 1 as const, label: this.elenco().nomes[1] || 'Dupla B' },
  ]);

  /** Os quatro atletas da partida, lado a lado — escolher um já define dupla e atleta. */
  protected readonly todosAtletas = computed(() =>
    ([0, 1] as const).flatMap((lado) =>
      ([0, 1] as const).map((atleta) => ({ lado, atleta, label: this.elenco().atletas[lado][atleta] ?? `Atleta ${atleta + 1}` })),
    ),
  );

  protected escolhe(lado: 0 | 1, atleta: 0 | 1): void {
    this.lado.set(lado);
    this.atleta.set(atleta);
  }

  /** Quantas vezes o atleta selecionado já fez o lance (ou o valor que sobe, no lance da dupla). */
  protected readonly feitos = computed(() => {
    const tally = lanceContagemOf(this.svc.control().lances.contagem);
    return tally[lanceChave(this.tipo(), this.lado(), this.atleta())] ?? 0;
  });

  protected readonly resumo = computed(() => (this.daDupla() ? `${this.labels[this.tipo()]} · ${this.n()}` : `Já fez: ${this.feitos()} · próximo: ${this.feitos() + 1}`));

  protected setN(e: Event): void {
    const t = this.tipo();
    if (t !== 'rally' && t !== 'onfire') return;
    const v = clampInt((e.target as HTMLInputElement).value, 1, 999, N_PADRAO[t]);
    (t === 'rally' ? this.nRally : this.nOnfire).set(v);
  }

  protected setSeg(e: Event): void {
    this.seg.set(clampInt((e.target as HTMLInputElement).value, 0, 60, LANCE_SEG_DEFAULT));
  }

  protected disparar(): void {
    const tipo = this.tipo();
    const next = lanceDisparo(this.svc.control().lances, {
      tipo,
      lado: this.lado(),
      atleta: this.atleta(),
      n: lanceEhDaDupla(tipo) ? this.n() : undefined,
      seg: this.seg(),
    });
    void this.svc.save({ lances: { ...next, at: serverTimestamp() } });
  }

  /** Zera a contagem por atleta sem disparar nada (`seq` e o resto ficam como estão). */
  protected zerar(): void {
    const l = this.svc.control().lances;
    void this.svc.save({ lances: { ...l, contagem: '{}' } });
  }
}
