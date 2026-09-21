import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  KOC_MIN_TEAMS_PER_ROUND,
  kocFinalTable,
  kocHasQualifyingTie,
  kocHasStarted,
  kocIsExpired,
  kocLiveOrder,
  kocPhaseLabel,
  kocPointsOf,
  kocRemainingLabel,
  type KocRoundState,
} from '../data/koc';
import { watchMatches, type TournamentMatch } from '../data/matches-repository';
import { organizerFirestore } from '../data/firestore';
import {
  finishKocRound,
  registerKocRally,
  setKocClock,
  startKocRound,
  undoKocRally,
} from '../data/organizer-ops.service';
import { fetchProfileDisplays, fetchTeamsByIds } from '../data/teams-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';

/** Mesa da rodada King of the Court, no portal.
 *
 *  A etapa é operada nos DOIS (app e portal), e é por isso que todo rally manda
 *  `expectedSeq`: se as duas mesas registrarem o mesmo rally, o servidor recusa
 *  a segunda com `koc_seq_mismatch` em vez de criar um ponto fantasma. Quando
 *  isso acontece a tela avisa e o doc em tempo real já traz o estado correto —
 *  não há nada a "sincronizar" na mão.
 *
 *  Componente PRÓPRIO, e não um ramo da mesa de duelo: aquela fala em sets,
 *  saque e dois lados. Mexer nela a semanas da etapa arriscaria os formatos que
 *  precisam funcionar em 24/10.
 *
 *  Nada é calculado aqui. O estado vem do doc, que só as callables escrevem, e o
 *  relógio vem de `endsAtMs` do servidor — é o que mantém as duas mesas e o
 *  telão contando o mesmo tempo. */
@Component({
  selector: 'og-mesa-koc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgCardComponent, OgIconComponent],
  template: `
    @if (!loaded()) {
      <div class="og-mk-msg">Carregando rodada…</div>
    } @else if (!round(); as _) {
      <div class="og-mk-msg">Rodada não encontrada.</div>
    } @else if (roster().length === 0) {
      <div class="og-mk-msg">Elenco definido quando a fase anterior terminar.</div>
    } @else {
      <og-card [kicker]="'King of the Court'" [title]="phaseLabel()">
        @if (finished()) {
          <!-- Rodada encerrada: a mesa fica aberta em LEITURA. O servidor ja recusa
               rally em rodada concluida, entao manter os botoes vivos so renderia
               erro; e a tabela final e justamente o que se volta a consultar. -->
          <p class="og-mk-lead og-mk-done">
            Rodada encerrada · {{ rallies() }} rallies
            @if (crownsKnown()) {
              <span> · coroas = vezes que assumiu o trono</span>
            }
          </p>
          <div class="og-mk-table">
            <div class="og-mk-table-head">
              <span>TABELA FINAL</span>
              <span class="og-mk-flex"></span>
              @if (crownsKnown()) {
                <span>COROAS</span>
              }
            </div>
            @for (row of finalRows(); track row.teamId) {
              <div class="og-mk-row" [class.qualifies]="row.qualifies">
                <span class="og-mk-place">{{ row.place }}º</span>
                <span class="og-mk-name">{{ row.name }}</span>
                @if (crownsKnown()) {
                  <span class="og-mk-crowns">{{ row.crowns }}</span>
                }
                <span class="og-mk-pts">{{ row.points }}</span>
              </div>
            }
          </div>
          <p class="og-mk-queue og-mk-done-note">
            Destacadas: as {{ qualifiers() }} que avançam.
          </p>
        } @else if (!started()) {
          <p class="og-mk-lead">
            O primeiro entra no trono, o segundo desafia, os outros formam a fila.
            Rodada de {{ durationMin() }} min.
          </p>
          <ol class="og-mk-roster">
            @for (teamId of roster(); track teamId) {
              <li>{{ nameOf(teamId) }}</li>
            }
          </ol>
          <button type="button" class="og-primary-btn og-mk-start" [disabled]="busy()" (click)="start()">
            Iniciar rodada
          </button>
        } @else {
          <div class="og-mk-clock" [class.expired]="expired()">
            <span class="og-mk-time">{{ clockLabel() }}</span>
            @if (expired()) {
              <!-- Regra do formato: o rally em andamento no apito é concluído. -->
              <span class="og-mk-clock-note">Conclua o rally em andamento e encerre.</span>
            } @else if (paused()) {
              <span class="og-mk-clock-note">Pausado</span>
            }
            <span class="og-mk-flex"></span>
            <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="nudge(-60)" title="-1 min">−1 min</button>
            <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="nudge(60)" title="+1 min">+1 min</button>
            <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="togglePause()">
              {{ paused() ? 'Retomar' : 'Pausar' }}
            </button>
          </div>

          <!-- Dois alvos grandes: o mesário toca olhando a quadra. -->
          <button type="button" class="og-mk-target king" [disabled]="busy()" (click)="rally(true)">
            <span class="og-mk-crown" role="img" aria-label="No trono">👑</span>
            <span class="og-mk-target-body">
              <span class="og-mk-target-name">{{ nameOf(kingId()) }}</span>
              <span class="og-mk-target-desc">Defendeu o trono · +1 ponto</span>
            </span>
            <span class="og-mk-target-pts">{{ pointsOf(kingId()) }}</span>
          </button>
          <button type="button" class="og-mk-target challenger" [disabled]="busy()" (click)="rally(false)">
            <span class="og-mk-crown" role="img" aria-label="Desafiante">⬆️</span>
            <span class="og-mk-target-body">
              <span class="og-mk-target-name">{{ nameOf(challengerId()) }}</span>
              <span class="og-mk-target-desc">Destronou · assume o trono, sem ponto</span>
            </span>
            <span class="og-mk-target-pts">{{ pointsOf(challengerId()) }}</span>
          </button>

          @if (queue().length > 0) {
            <p class="og-mk-queue"><span>FILA</span> {{ queueLabel() }}</p>
          }

          <div class="og-mk-table">
            <div class="og-mk-table-head">
              <span>TABELA</span>
              <span class="og-mk-flex"></span>
              <span>{{ rallies() }} rallies</span>
            </div>
            @for (row of rows(); track row.teamId) {
              <div class="og-mk-row" [class.qualifies]="row.qualifies">
                <span class="og-mk-place">{{ row.place }}º</span>
                <span class="og-mk-name">{{ row.name }}</span>
                @if (row.tied) {
                  <span class="og-mk-tied">empate</span>
                }
                <span class="og-mk-pts">{{ row.points }}</span>
              </div>
            }
            @if (tie()) {
              <p class="og-mk-tie-note">
                Empate na vaga de classificação — bola de ouro entre as empatadas.
              </p>
            }
          </div>

          <div class="og-mk-actions">
            <button type="button" class="og-ghost-btn" [disabled]="busy() || rallies() === 0" (click)="undo()">
              <og-icon name="back" [size]="14" />Desfazer
            </button>
            <button type="button" class="og-primary-btn" [disabled]="busy()" (click)="finish()">Encerrar rodada</button>
          </div>
        }

        @if (feedback(); as f) {
          <p class="og-mk-feedback" [class.err]="!f.ok">{{ f.message }}</p>
        }
      </og-card>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .og-mk-msg {
      padding: 28px 4px;
      opacity: 0.7;
    }
    .og-mk-lead {
      margin: 0 0 12px;
      font-size: 13px;
      opacity: 0.7;
    }
    .og-mk-roster {
      margin: 0 0 16px;
      padding-left: 22px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .og-mk-start {
      width: 100%;
    }
    .og-mk-clock {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .og-mk-time {
      font-size: 34px;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .og-mk-clock.expired .og-mk-time {
      color: #f4c543;
    }
    .og-mk-clock-note {
      font-size: 12px;
      opacity: 0.75;
    }
    .og-mk-flex {
      flex: 1;
    }
    .og-mk-target {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      margin-bottom: 10px;
      padding: 18px 16px;
      border: 1px solid rgb(255 255 255 / 10%);
      border-radius: 16px;
      background: rgb(255 255 255 / 5%);
      color: inherit;
      cursor: pointer;
      text-align: left;
      font: inherit;
    }
    .og-mk-target.king {
      background: rgb(255 106 26 / 18%);
      border-color: rgb(255 106 26 / 50%);
    }
    .og-mk-target:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .og-mk-crown {
      font-size: 22px;
    }
    .og-mk-target-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .og-mk-target-name {
      font-size: 18px;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-target-desc {
      font-size: 12px;
      opacity: 0.8;
    }
    .og-mk-target-pts {
      font-size: 26px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .og-mk-queue {
      margin: 4px 0 16px;
      font-size: 13px;
      opacity: 0.8;
    }
    .og-mk-queue span {
      font-size: 10px;
      letter-spacing: 0.7px;
      opacity: 0.6;
      margin-right: 8px;
    }
    .og-mk-table-head {
      display: flex;
      font-size: 10px;
      letter-spacing: 0.7px;
      opacity: 0.55;
      margin-bottom: 8px;
    }
    .og-mk-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
    }
    .og-mk-row.qualifies {
      background: rgb(255 106 26 / 12%);
    }
    .og-mk-place {
      min-width: 26px;
      font-size: 13px;
      opacity: 0.6;
    }
    .og-mk-row.qualifies .og-mk-place {
      color: #ff6a1a;
      font-weight: 800;
      opacity: 1;
    }
    .og-mk-name {
      flex: 1;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-tied {
      font-size: 11px;
      color: #f4c543;
    }
    .og-mk-pts {
      font-size: 17px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .og-mk-crowns {
      min-width: 26px;
      text-align: right;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      opacity: 0.65;
    }
    .og-mk-done {
      margin-bottom: 14px;
    }
    .og-mk-done-note {
      margin-top: 12px;
    }
    .og-mk-tie-note {
      margin: 10px 0 0;
      font-size: 12px;
      color: #f4c543;
    }
    .og-mk-actions {
      display: flex;
      gap: 12px;
      margin-top: 18px;
    }
    .og-mk-actions button {
      flex: 1;
    }
    .og-mk-feedback {
      margin: 12px 0 0;
      font-size: 13px;
    }
    .og-mk-feedback.err {
      color: #f4c543;
    }
  `,
})
export class MesaKocComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string>('');
  readonly matchId = input<string>('');

  private readonly match = signal<TournamentMatch | null>(null);
  private readonly names = signal<ReadonlyMap<string, string>>(new Map());
  private readonly hydrated = new Set<string>();
  private readonly nowMs = signal(Date.now());

  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  constructor() {
    effect((onCleanup) => {
      const tid = this.id();
      const mid = this.matchId();
      this.match.set(null);
      this.loaded.set(false);
      if (!tid || !mid) return;
      const stop = watchMatches(
        tid,
        (matches) => {
          this.match.set(matches.find((m) => m.id === mid) ?? null);
          this.loaded.set(true);
          void this.hydrateNames();
        },
        () => this.loaded.set(true),
      );
      onCleanup(() => stop());
    });

    // Só redesenha a contagem: o prazo vem de `endsAtMs` do servidor.
    const timer = setInterval(() => this.nowMs.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected readonly round = computed<KocRoundState | null>(() => this.match()?.koc ?? null);
  protected readonly roster = computed(() => this.round()?.teamIds ?? []);
  protected readonly started = computed(() => {
    const r = this.round();
    return r != null && kocHasStarted(r);
  });
  protected readonly kingId = computed(() => this.round()?.kingTeamId ?? '');
  protected readonly challengerId = computed(() => this.round()?.challengerTeamId ?? '');
  protected readonly queue = computed(() => this.round()?.queue ?? []);
  protected readonly rallies = computed(() => this.round()?.rallies ?? 0);

  /** Rodada concluida — o que troca a mesa para leitura. Vem do `status` do doc,
   *  a MESMA fonte que o servidor usa para recusar rally. */
  protected readonly finished = computed(() => this.match()?.status === 'completed');

  protected readonly qualifiers = computed(() => this.round()?.qualifiersPerRound ?? 0);

  /** `kocStandings` so e gravado ao encerrar. Sem ele (rodada encerrada por um
   *  caminho antigo), a tabela final cai na ordem por pontos e a coluna de coroas
   *  some, em vez de mostrar zero para todo mundo. */
  protected readonly crownsKnown = computed(() => (this.round()?.standings.length ?? 0) > 0);

  protected readonly finalRows = computed(() => {
    const r = this.round();
    if (!r) return [];
    return kocFinalTable(r).map((row) => ({
      teamId: row.teamId,
      place: row.place,
      name: this.nameOf(row.teamId),
      points: row.points,
      crowns: row.crowns,
      qualifies: row.place <= r.qualifiersPerRound,
    }));
  });

  protected phaseLabel(): string {
    const m = this.match();
    return m ? kocPhaseLabel(m.matchType, m.matchNumber) : 'Rodada';
  }

  protected durationMin(): number {
    return Math.round((this.round()?.configuredDurationSec ?? 900) / 60);
  }

  protected nameOf(teamId: string): string {
    return this.names().get(teamId) ?? 'Dupla';
  }

  protected pointsOf(teamId: string): number {
    const r = this.round();
    return r ? kocPointsOf(r, teamId) : 0;
  }

  protected clockLabel(): string {
    const clock = this.round()?.clock;
    if (!clock) return '—';
    return kocIsExpired(clock, this.nowMs()) ? 'TEMPO!' : kocRemainingLabel(clock, this.nowMs());
  }

  protected expired(): boolean {
    const clock = this.round()?.clock;
    return clock != null && kocIsExpired(clock, this.nowMs());
  }

  protected paused(): boolean {
    return this.round()?.clock?.pausedAtMs != null;
  }

  protected queueLabel(): string {
    return this.queue().map((id) => this.nameOf(id)).join('  →  ');
  }

  protected readonly rows = computed(() => {
    const r = this.round();
    if (!r) return [];
    return kocLiveOrder(r).map((teamId, i) => ({
      teamId,
      place: i + 1,
      name: this.nameOf(teamId),
      points: kocPointsOf(r, teamId),
      qualifies: i < r.qualifiersPerRound,
      tied: r.teamIds.some((id) => id !== teamId && kocPointsOf(r, id) === kocPointsOf(r, teamId)),
    }));
  });

  protected tie(): boolean {
    const r = this.round();
    return r != null && kocHasQualifyingTie(r);
  }

  // ── Ações ──────────────────────────────────────────────────────────────────

  protected start(): void {
    void this.run(() => startKocRound({ matchId: this.matchId() }), 'Rodada iniciada.');
  }

  /** `expectedSeq` é o que impede o mesmo rally de entrar duas vezes quando as
   *  duas mesas (app e portal) estão abertas na mesma rodada. */
  protected rally(kingWon: boolean): void {
    void this.run(
      () => registerKocRally({ matchId: this.matchId(), kingWon, expectedSeq: this.rallies() + 1 }),
      null,
    );
  }

  protected undo(): void {
    void this.run(() => undoKocRally(this.matchId()), 'Rally desfeito.');
  }

  protected togglePause(): void {
    const action = this.paused() ? 'resume' : 'pause';
    void this.run(() => setKocClock({ matchId: this.matchId(), action }), null);
  }

  protected nudge(deltaSec: number): void {
    void this.run(() => setKocClock({ matchId: this.matchId(), action: 'nudge', deltaSec }), null);
  }

  /** Empate que decide vaga: o servidor recusa encerrar, e a mesa confirma que
   *  aceita o desempate automático em vez de a vaga sair calada. */
  protected finish(): void {
    void this.run(async () => {
      try {
        await finishKocRound({ matchId: this.matchId() });
      } catch (error) {
        if (reasonOf(error) !== 'koc_unresolved_tie') throw error;
        const ok = confirm(
          'Há empate em pontos decidindo a classificação.\n\n' +
            'O regulamento resolve na areia: joguem a bola de ouro e registrem o rally. ' +
            'Encerrar agora faz a vaga sair pelo desempate automático (quem foi rei por último).\n\n' +
            'Encerrar assim?',
        );
        if (!ok) return;
        await finishKocRound({ matchId: this.matchId(), acceptTiebreak: true });
      }
    }, 'Rodada encerrada.');
  }

  private async run(action: () => Promise<unknown>, okMessage: string | null): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.feedback.set(null);
    try {
      await action();
      if (okMessage) this.feedback.set({ ok: true, message: okMessage });
    } catch (error) {
      this.feedback.set({ ok: false, message: messageOf(error) });
    } finally {
      this.busy.set(false);
    }
  }

  /** Nomes por `teamId` — a rodada tem elenco, não dois lados, então o mapa é
   *  montado a partir de `koc.teamIds`. */
  private async hydrateNames(): Promise<void> {
    const ids = this.roster().filter((id) => !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id);
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const playerIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]).filter((x) => x.length > 0);
      const profiles = await fetchProfileDisplays(db, playerIds);
      this.names.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) {
          const parts = [team.player1Id, team.player2Id]
            .map((uid) => profiles.get(uid)?.name?.trim().split(/\s+/)[0] ?? '')
            .filter((n) => n.length > 0);
          const label = team.teamName ?? (parts.length > 0 ? parts.join(' / ') : null);
          if (label) next.set(teamId, label);
        }
        return next;
      });
    } catch {
      // Sem nome a mesa ainda funciona: mostra "Dupla" e os pontos, que é o que
      // decide a rodada. Libera para tentar de novo no próximo snapshot.
      for (const id of ids) this.hydrated.delete(id);
    }
  }

  protected readonly minTeams = KOC_MIN_TEAMS_PER_ROUND;
}

function reasonOf(error: unknown): string {
  const details = (error as { details?: { reason?: unknown } } | null)?.details;
  return typeof details?.reason === 'string' ? details.reason : '';
}

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  const text = typeof message === 'string' ? message.trim() : '';
  return text.length > 0 ? text : 'Não foi possível registrar. Tente de novo.';
}
