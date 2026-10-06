import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { BroadcastRanking, RankingCard, RankingKind, RankingMode } from '../data/broadcast-ranking';
import { organizerFirestore } from '../data/firestore';
import type { RankingGender } from '../data/ranking-positions';
import { fetchRankingEntries, fetchTeamRankingEntries, rankingSportOf } from '../data/rankings-repository';
import { fetchInterviewProfiles } from '../data/teams-repository';
import { OgCardComponent } from '../ui/card.component';
import { rankingCardOf, type RankingCardProfile } from './ranking-card';
import { TransmissaoDataService } from './transmissao-data.service';

type CardGender = Extract<RankingGender, 'male' | 'female'>;

const LABELS: Record<CardGender, string> = { male: 'MASCULINO', female: 'FEMININO' };

/** Card "Ranking Top 10" da tela Transmissão: lê o ranking do esporte do torneio, monta o card
 *  (antes → depois da etapa) e grava em `broadcast/control.ranking`. O overlay público só desenha.
 *
 *  Grava sempre o card COMPLETO, com `null` explícito: `setDoc` com merge funde mapas e campo
 *  omitido deixaria resto do card anterior no ar. */
@Component({
  selector: 'og-tx-ranking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgCardComponent],
  template: `
    @let rk = svc.control().ranking;
    <og-card kicker="Apresentação" [title]="kind() === 'dupla' ? 'Ranking Top 10 — Duplas' : 'Ranking Top 10 — Atletas'">
      <div class="og-rk-label">Ranking de</div>
      <div class="og-rk-chips" role="radiogroup" aria-label="Tipo do ranking">
        @for (k of kinds; track k.value) {
          <button
            type="button"
            class="og-chip"
            role="radio"
            [class.active]="kind() === k.value"
            [attr.aria-checked]="kind() === k.value"
            [disabled]="busy()"
            (click)="selectKind(k.value)"
          >
            {{ k.label }}
          </button>
        }
      </div>
      <div class="og-rk-label og-rk-label-gap">Categoria</div>
      <div class="og-rk-chips" role="radiogroup" aria-label="Categoria do ranking">
        @for (g of genders; track g.value) {
          <button
            type="button"
            class="og-chip"
            role="radio"
            [class.active]="gender() === g.value"
            [attr.aria-checked]="gender() === g.value"
            [disabled]="busy()"
            (click)="selectGender(g.value)"
          >
            {{ g.label }}
          </button>
        }
      </div>
      <div class="og-rk-acoes">
        <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="busy() || !svc.tournament()" (click)="build()">
          {{ busy() ? 'Montando…' : 'Montar card' }}
        </button>
      </div>
      @if (error()) {
        <p class="og-rk-erro" role="alert">Não deu pra montar o card — confira a conexão e tente de novo.</p>
      }
      @if (empty()) {
        <p class="og-rk-dica">Ninguém com pontos nesse ranking ainda.</p>
      }

      @if (rk.card; as card) {
        <div class="og-rk-card">
          <div class="og-rk-card-titulo">Ranking {{ card.categoryLabel }} · {{ card.after.length }} {{ card.kind === 'dupla' ? 'duplas' : 'atletas' }}</div>
          <div class="og-rk-card-sub">{{ card.updated ? 'Atualizado após' : 'Antes da' }} {{ card.stageName }}</div>
        </div>
        <div class="og-rk-acoes">
          <button type="button" class="og-mini-btn" [disabled]="busy()" (click)="refresh()">Atualizar</button>
          <button type="button" class="og-mini-btn" [class.og-mini-btn-primary]="rk.mode === 'before'" [disabled]="busy()" (click)="showBefore()">
            Antes da etapa
          </button>
        </div>
      }
      <div class="og-toggle-row">
        <div class="og-toggle-row-text">
          <div class="og-toggle-row-title">No ar</div>
          <div class="og-toggle-row-desc">{{ rk.card ? 'Mostra o Top 10 em tela cheia na live' : 'Monte um card pra poder pôr no ar' }}</div>
        </div>
        <button
          type="button"
          class="og-toggle"
          role="switch"
          aria-label="Ranking no ar"
          [class.on]="rk.on"
          [attr.aria-checked]="rk.on"
          [disabled]="!rk.card && !rk.on"
          (click)="toggleOnAir()"
        ></button>
      </div>
    </og-card>
  `,
  styles: `
    .og-rk-label {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-rk-label-gap {
      margin-top: 12px;
    }
    .og-rk-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-rk-acoes {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin: 12px 0;
    }
    .og-rk-dica {
      margin: 6px 0;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-rk-erro {
      margin: 6px 0;
      font-size: 13px;
      color: var(--nx-live, #ff3b30);
    }
    .og-rk-card {
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-rk-card-titulo {
      font-size: 14px;
      font-weight: 600;
    }
    .og-rk-card-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class TransmissaoRankingComponent {
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly kinds: { value: RankingKind; label: string }[] = [
    { value: 'atleta', label: 'Atletas' },
    { value: 'dupla', label: 'Duplas' },
  ];

  protected readonly genders: { value: CardGender; label: string }[] = [
    { value: 'male', label: 'Masculino' },
    { value: 'female', label: 'Feminino' },
  ];

  /** Escolha do operador; sem ela, o gênero da 1ª categoria do torneio (senão masculino). */
  private readonly picked = signal<CardGender | null>(null);
  /** Tipo do ranking; sem escolha, o do card já gravado (senão atletas). */
  private readonly pickedKind = signal<RankingKind | null>(null);
  protected readonly kind = computed<RankingKind>(() => this.pickedKind() ?? this.svc.control().ranking.card?.kind ?? 'atleta');
  protected readonly gender = computed<CardGender>(() => {
    const p = this.picked();
    if (p) return p;
    return this.svc.tournament()?.categories[0]?.gender === 'female' ? 'female' : 'male';
  });
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly empty = signal(false);

  private newKey(): string {
    return `${this.svc.tournamentId() ?? 'rk'}:${this.kind()}:${this.gender()}:${Date.now()}`;
  }

  private patch(on: boolean, mode: RankingMode, card: RankingCard | null): { ranking: BroadcastRanking } {
    return { ranking: { on, mode, card } };
  }

  protected selectGender(g: CardGender): void {
    if (g === this.gender()) return;
    this.picked.set(g);
    if (this.svc.control().ranking.card) void this.build();
  }

  protected selectKind(k: RankingKind): void {
    if (k === this.kind()) return;
    this.pickedKind.set(k);
    if (this.svc.control().ranking.card) void this.build();
  }

  /** Lê o ranking do esporte, recorta o gênero e monta/grava (mantendo "No ar" e modo). */
  protected async build(): Promise<void> {
    const t = this.svc.tournament();
    const projectId = environment.firebase.projectId;
    if (!t || !projectId || this.busy()) return;
    this.busy.set(true);
    this.error.set(false);
    this.empty.set(false);
    try {
      const db = organizerFirestore();
      const sport = rankingSportOf(t) ?? null;
      const gender = this.gender();
      const kind = this.kind();
      let entries: { id: string; totalPoints: number; results: { tournamentId: string; points: number }[] }[];
      let teams: Map<string, string[]> | undefined;
      if (kind === 'dupla') {
        const rows = (await fetchTeamRankingEntries(db, projectId, sport)).filter((e) => e.gender === gender);
        teams = new Map(rows.map((e) => [e.teamId, e.memberIds]));
        entries = rows.map((e) => ({ id: e.teamId, totalPoints: e.totalPoints, results: e.results }));
      } else {
        const rows = (await fetchRankingEntries(db, projectId, sport)).filter((e) => e.gender === gender);
        entries = rows.map((e) => ({ id: e.athleteId, totalPoints: e.totalPoints, results: e.results }));
      }
      const uids = entries.filter((e) => e.totalPoints > 0).flatMap((e) => teams?.get(e.id) ?? [e.id]);
      const profiles = await fetchInterviewProfiles(db, uids);
      const cardProfiles = new Map<string, RankingCardProfile>(
        [...profiles].map(([uid, p]) => [uid, { name: p.name, photoUrl: p.photoUrl, city: p.city, state: p.state }]),
      );
      const card = rankingCardOf(
        {
          kind,
          entries,
          teams,
          tournamentId: t.id,
          tournamentName: t.name,
          categoryLabel: LABELS[gender],
          profiles: cardProfiles,
          updated: t.status === 'concluido',
        },
        this.newKey(),
      );
      if (!card) {
        this.empty.set(true);
        return;
      }
      const { on, mode } = this.svc.control().ranking;
      await this.svc.save(this.patch(on, mode, card));
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected toggleOnAir(): void {
    const { on, mode, card } = this.svc.control().ranking;
    void this.svc.save(this.patch(!on, mode, card));
  }

  /** Nova key + modo automático: a tela reinicia a animação antes → depois. */
  protected refresh(): void {
    const { on, card } = this.svc.control().ranking;
    if (!card) return;
    void this.svc.save(this.patch(on, 'auto', { ...card, key: this.newKey() }));
  }

  /** Fica parado no estado anterior à etapa. */
  protected showBefore(): void {
    const { on, card } = this.svc.control().ranking;
    if (!card) return;
    void this.svc.save(this.patch(on, 'before', { ...card, key: this.newKey() }));
  }
}
