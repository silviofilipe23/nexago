import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { initialsOf, truncateName } from '../data/mock-data';
import { courtChangeBlockReason, courtChangePayload } from '../data/match-court-change';
import { type ScoreSet, matchWinnerSide, setsWon, targetPointsForSet, validateScoreSubmission } from '../data/match-scoring';
import { declareMatchWalkover, scheduleMatch, submitMatchResult, validateMatchResult } from '../data/organizer-ops.service';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Lançamento de placar real — mesmo fluxo do app (`organizer_match_quick_score_page.dart`):
 *  sets editáveis (MD1/MD3, igual ao servidor que só aceita bestOf 1|3), validação local
 *  espelhando `match_scoring_logic.dart` (mensagens idênticas) e gravação autoritativa via
 *  `submitMatchResult`. O avanço da chave é automático (trigger
 *  `onTournamentMatchCompletedAdvance` no servidor) — nada a chamar aqui depois do submit.
 *  W.O. via `declareMatchWalkover` (escolhe o vencedor) e validação da súmula via
 *  `validateMatchResult` quando a partida já está concluída. Chegada via
 *  `/painel/eventos/:id/categorias/:catId/placar/:matchId` (nível 3 da cascata); lê a partida
 *  do cache do `ChaveamentoContextService` (dirigido pela rota via `PanelContextService`) e
 *  recarrega os jogos após cada escrita. */
@Component({
  selector: 'og-placar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgAvatarComponent, OgPillComponent, OgFormFieldComponent, NxPageLoadingComponent, NxSpinnerComponent],
  template: `
    <og-page-header title="Placar" [subtitle]="headerSubtitle()">
      <button type="button" class="og-ghost-btn" (click)="cancel()">Voltar</button>
      <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="saving() || !canSubmit()" (click)="save()">
        @if (busyKey() === 'save') {
          <app-nx-spinner [size]="14" tone="dark" />
        } @else {
          <og-icon name="check" [size]="14" />
        }
        {{ busyKey() === 'save' ? 'Salvando…' : 'Salvar placar' }}
      </button>
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col">
        @if (!match() && (ctx.loadingMatches() || ctx.loadingTournaments())) {
          <og-card><app-nx-page-loading title="Carregando partida…" subtitle="Buscando a súmula" /></og-card>
        } @else if (!match()) {
          <og-card><p class="og-empty">Partida não encontrada — abra pela lista de jogos.</p></og-card>
        } @else if (!teamsReady()) {
          <og-card kicker="Partida" [title]="truncate(match()!.team1Label, 20) + ' vs ' + truncate(match()!.team2Label, 20)">
            <p class="og-empty">Aguardando as duas equipes nesta partida. O placar só pode ser lançado quando os dois lados estiverem definidos.</p>
            <button type="button" class="og-mini-btn" style="margin-top:12px" (click)="cancel()">Voltar</button>
          </og-card>
        } @else {
          <og-card kicker="Partida" [title]="truncate(match()!.team1Label, 20) + ' vs ' + truncate(match()!.team2Label, 20)">
            <div class="og-placar-header">
              <div class="og-placar-side">
                <og-avatar [initials]="initialsOf(match()!.team1Label)" [size]="40" />
                <span class="og-placar-name" [title]="match()!.team1Label">{{ truncate(match()!.team1Label) }}</span>
              </div>
              <div class="og-placar-score">
                <span class="a">{{ wins().a }}</span>
                <span class="lbl">sets</span>
                <span class="b">{{ wins().b }}</span>
              </div>
              <div class="og-placar-side reverse">
                <span class="og-placar-name" [title]="match()!.team2Label">{{ truncate(match()!.team2Label) }}</span>
                <og-avatar [initials]="initialsOf(match()!.team2Label)" [size]="40" />
              </div>
            </div>
          </og-card>

          <og-card kicker="Formato" title="Melhor de">
            <div class="og-filter-bar">
              @for (option of [1, 3]; track option) {
                <button type="button" class="og-chip" [class.active]="bestOf() === option" (click)="setBestOf(option)">
                  {{ option === 1 ? 'Set único' : 'MD3' }}
                </button>
              }
            </div>
          </og-card>

          <og-card kicker="Placar por set" title="Sets">
            @for (s of sets(); track $index; let i = $index) {
              <div class="og-placar-set-row">
                <span class="og-placar-set-label">Set {{ i + 1 }} <em>até {{ targetOf(i) }}</em></span>
                <div style="flex:1;display:flex;gap:20px">
                  <div class="og-placar-set-box-wrap">
                    <span class="lbl">{{ match()!.team1Label }}</span>
                    <input
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="99"
                      class="og-placar-set-input"
                      [value]="s.a"
                      (input)="updateSet(i, 'a', $event)"
                    />
                  </div>
                  <div class="og-placar-set-box-wrap">
                    <span class="lbl">{{ match()!.team2Label }}</span>
                    <input
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="99"
                      class="og-placar-set-input"
                      [value]="s.b"
                      (input)="updateSet(i, 'b', $event)"
                    />
                  </div>
                </div>
                <button type="button" class="og-ghost-btn" (click)="removeSet(i)">Remover</button>
              </div>
              @if (issueForSet(i); as msg) {
                <p class="og-placar-error">{{ msg }}</p>
              }
            } @empty {
              <p class="og-empty">Nenhum set lançado ainda.</p>
            }

            @if (sets().length < bestOf()) {
              <button type="button" class="og-mini-btn" style="margin-top:12px" (click)="addSet()">
                <og-icon name="plus" [size]="14" />Adicionar set {{ sets().length + 1 }}
              </button>
            }

            @if (globalIssue(); as msg) {
              <p class="og-placar-error" style="margin-top:12px">{{ msg }}</p>
            }
            @if (feedback(); as fb) {
              <div class="og-banner" [class.win]="fb.ok" style="margin-top:12px">{{ fb.message }}</div>
            }
          </og-card>

          @if (canWalkover()) {
            <og-card kicker="Ocorrência" title="W.O. (walkover)">
              <p class="og-placar-hint">Declara vitória sem jogo — a dupla ausente é eliminada e a chave avança.</p>
              <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
                <button type="button" class="og-mini-btn" [disabled]="saving()" [title]="match()!.team1Label" (click)="walkover(match()!.teamAId)">
                  @if (busyKey() === 'wo:' + match()!.teamAId) {
                    <app-nx-spinner [size]="12" />
                  }
                  Vitória de {{ truncate(match()!.team1Label, 20) }}
                </button>
                <button type="button" class="og-mini-btn" [disabled]="saving()" [title]="match()!.team2Label" (click)="walkover(match()!.teamBId)">
                  @if (busyKey() === 'wo:' + match()!.teamBId) {
                    <app-nx-spinner [size]="12" />
                  }
                  Vitória de {{ truncate(match()!.team2Label, 20) }}
                </button>
              </div>
            </og-card>
          }

          @if (match()!.status === 'completed') {
            <og-card kicker="Súmula" title="Validação">
              <div style="display:flex;align-items:center;gap:12px">
                <og-pill tone="green">Partida encerrada</og-pill>
                <button type="button" class="og-ghost-btn" [disabled]="saving()" (click)="validate()">
                  @if (busyKey() === 'validate') {
                    <app-nx-spinner [size]="12" />
                  }
                  {{ busyKey() === 'validate' ? 'Validando…' : 'Validar resultado' }}
                </button>
              </div>
            </og-card>
          }

          <og-card kicker="Detalhes" title="Registro da partida">
            <div class="og-field-grid">
              <og-form-field label="Quadra"><div class="og-placar-detail">{{ match()!.court ?? 'A definir' }}</div></og-form-field>
              <og-form-field label="Horário"><div class="og-placar-detail">{{ scheduledLabel() }}</div></og-form-field>
            </div>

            @if (courtBlock() === null && courts().length > 0) {
              <div class="og-placar-court-edit">
                <span class="og-placar-court-title">Alterar quadra</span>
                <div class="og-filter-bar">
                  @for (c of courts(); track c.id) {
                    <button
                      type="button"
                      class="og-chip og-placar-court-chip"
                      [class.active]="match()!.courtId === c.id"
                      [disabled]="saving()"
                      (click)="changeCourt(c.id)"
                    >
                      @if (busyKey() === 'court:' + c.id) {
                        <app-nx-spinner [size]="12" [tone]="match()!.courtId === c.id ? 'dark' : 'orange'" />
                      }
                      {{ c.name }}
                    </button>
                  }
                </div>
                <p class="og-placar-hint">O horário é mantido — só a quadra muda. Conflito com outra partida é recusado.</p>
              </div>
            } @else if (courtBlock() === 'unscheduled') {
              <p class="og-placar-hint">Defina o horário em <strong>Agendamento</strong> pra escolher a quadra desta partida.</p>
            } @else if (courtBlock() === null) {
              <p class="og-placar-hint">Nenhuma quadra configurada no torneio.</p>
            }

            @if (courtFeedback(); as fb) {
              <div class="og-banner" [class.win]="fb.ok" style="margin-top:12px">{{ fb.message }}</div>
            }
          </og-card>
        }
      </div>
    </div>
  `,
  styles: `
    .og-placar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .og-placar-side {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .og-placar-side.reverse {
      flex-direction: row-reverse;
    }
    .og-placar-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-placar-score {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .og-placar-score .a {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-orange-500);
    }
    .og-placar-score .b {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text-dim);
    }
    .og-placar-score .lbl {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-placar-set-row {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-placar-set-row:last-of-type {
      border-bottom: none;
    }
    .og-placar-set-label {
      width: 90px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-placar-set-label em {
      display: block;
      font-style: normal;
      font-size: 9px;
      color: var(--nx-text-mute);
      text-transform: none;
      letter-spacing: 0;
      margin-top: 2px;
    }
    .og-placar-set-box-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }
    .og-placar-set-box-wrap .lbl {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      max-width: 130px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-placar-set-input {
      width: 64px;
      height: 64px;
      border-radius: var(--nx-r-3);
      text-align: center;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      color: var(--nx-text);
    }
    .og-placar-set-input:focus {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 0;
    }
    .og-placar-error {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-live);
      margin: 6px 0 0;
    }
    .og-placar-hint {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .og-placar-detail {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
      padding: 10px 0;
    }
    .og-placar-court-edit {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
    }
    .og-placar-court-title {
      display: block;
      margin-bottom: 10px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-placar-court-chip {
      gap: 6px;
    }
    .og-placar-court-chip:disabled {
      cursor: default;
      opacity: 0.7;
    }
    .og-placar-court-edit .og-placar-hint {
      margin-top: 10px;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }
  `,
})
export class PlacarComponent {
  private readonly router = inject(Router);
  protected readonly ctx = inject(ChaveamentoContextService);
  protected readonly initialsOf = initialsOf;
  protected readonly truncate = truncateName;

  readonly id = input<string>('');
  readonly catId = input<string>('');
  readonly matchId = input<string>('');

  protected readonly match = computed(() => {
    const id = this.matchId();
    if (!id) return null;
    return this.ctx.matches().find((m) => m.id === id) ?? null;
  });

  protected readonly sets = signal<ScoreSet[]>([]);
  protected readonly bestOf = signal<number>(3);
  protected readonly saving = signal(false);
  /** Qual ação está em andamento (`'save' | 'validate' | 'wo:<teamId>'`) — o botão certo mostra o spinner. */
  protected readonly busyKey = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  /** Feedback da troca de quadra — sinal próprio pra aparecer no card "Registro da partida",
   *  junto dos chips, e não lá no card de sets onde `feedback` é renderizado. */
  protected readonly courtFeedback = signal<{ ok: boolean; message: string } | null>(null);
  private hydratedMatchId: string | null = null;

  constructor() {
    // Hidrata sets/bestOf do doc quando a partida chega (uma vez por matchId —
    // edições locais não são sobrescritas por recomputações do cache).
    effect(() => {
      const m = this.match();
      if (!m || this.hydratedMatchId === m.id) return;
      this.hydratedMatchId = m.id;
      this.sets.set(m.sets.map((s) => ({ a: s.a, b: s.b })));
      this.bestOf.set(m.bestOf);
      this.feedback.set(null);
      this.courtFeedback.set(null);
    });
  }

  /** Quadras reais do torneio (`courts` do doc) — mesma fonte das colunas do Agendamento. */
  protected readonly courts = computed(() => this.ctx.tournament()?.courts ?? []);

  protected readonly durationMin = computed(() => this.ctx.tournament()?.matchOps.defaultMatchDurationMin ?? 30);

  /** `null` = quadra editável; senão o motivo (`'finished'`/`'unscheduled'`). */
  protected readonly courtBlock = computed(() => {
    const m = this.match();
    return m ? courtChangeBlockReason(m) : 'unscheduled';
  });

  protected readonly wins = computed(() => setsWon(this.sets(), this.bestOf()));

  protected readonly issues = computed(() => validateScoreSubmission(this.sets(), this.bestOf()));

  protected readonly canSubmit = computed(() => this.teamsReady() && this.sets().length > 0 && this.issues().length === 0);

  protected readonly teamsReady = computed(() => {
    const m = this.match();
    return m != null && m.teamAId.length > 0 && m.teamBId.length > 0;
  });

  protected readonly canWalkover = computed(() => {
    const m = this.match();
    return this.teamsReady() && m != null && m.status !== 'completed';
  });

  protected issueForSet(index: number): string | null {
    return this.issues().find((i) => i.setIndex === index)?.message ?? null;
  }

  protected globalIssue(): string | null {
    if (this.sets().length === 0) return null;
    return this.issues().find((i) => i.setIndex == null)?.message ?? null;
  }

  protected targetOf(index: number): number {
    return targetPointsForSet(index, this.bestOf());
  }

  protected readonly headerSubtitle = computed(() => {
    const m = this.match();
    if (!m) return '';
    const t = this.ctx.tournament();
    const parts = [t?.name, m.round, m.court].filter((p): p is string => Boolean(p));
    return parts.join(' · ');
  });

  protected setBestOf(option: number): void {
    // Espelha `canReduceBestOf`: não deixa reduzir se descartaria sets lançados.
    const played = this.sets().filter((s) => s.a > 0 || s.b > 0).length;
    if (option < this.bestOf() && played > option) {
      this.feedback.set({ ok: false, message: `Já há ${played} sets lançados — remova antes de trocar pra ${option === 1 ? 'set único' : 'MD3'}.` });
      return;
    }
    this.bestOf.set(option);
    if (this.sets().length > option) this.sets.update((s) => s.slice(0, option));
    this.feedback.set(null);
  }

  protected addSet(): void {
    if (this.sets().length >= this.bestOf()) return;
    this.sets.update((s) => [...s, { a: 0, b: 0 }]);
  }

  protected removeSet(index: number): void {
    this.sets.update((s) => s.filter((_, i) => i !== index));
  }

  protected updateSet(index: number, side: 'a' | 'b', event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(99, Math.trunc(raw))) : 0;
    this.sets.update((sets) => sets.map((s, i) => (i === index ? { ...s, [side]: value } : s)));
  }

  protected async save(): Promise<void> {
    const m = this.match();
    if (!m || !this.canSubmit()) return;
    this.saving.set(true);
    this.busyKey.set('save');
    this.feedback.set(null);
    try {
      const result = await submitMatchResult({ matchId: m.id, sets: this.sets(), bestOf: this.bestOf() });
      const winner = matchWinnerSide(this.sets(), this.bestOf());
      const winnerLabel = winner === 'A' ? m.team1Label : m.team2Label;
      this.feedback.set({
        ok: true,
        message: result.completed ? `Placar salvo — vitória de ${winnerLabel}. A chave avança automaticamente.` : 'Placar parcial salvo.',
      });
      this.hydratedMatchId = null; // re-hidrata com o doc novo
      await this.ctx.reloadMatches();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao salvar o placar.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  /** Troca só a quadra: reusa `scheduleMatch` com o mesmo horário já agendado. O servidor
   *  recusa sobreposição de quadra e devolve avisos de descanso insuficiente. Não mexe nos
   *  sets em edição — a hidratação só roda quando o `matchId` muda. */
  protected async changeCourt(courtId: string): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || m.courtId === courtId) return;
    const payload = courtChangePayload(m, courtId, this.durationMin());
    if (!payload) return;
    const courtName = this.courts().find((c) => c.id === courtId)?.name ?? courtId;
    this.saving.set(true);
    this.busyKey.set(`court:${courtId}`);
    this.courtFeedback.set(null);
    try {
      const result = await scheduleMatch(payload);
      const warnings = result.warnings ?? [];
      this.courtFeedback.set({
        ok: true,
        message:
          warnings.length > 0
            ? `Quadra alterada para ${courtName} — aviso: ${warnings.map((w) => w.message).join(' ')}`
            : `Quadra alterada para ${courtName}.`,
      });
      await this.ctx.reloadMatches();
    } catch (e) {
      this.courtFeedback.set({ ok: false, message: (e as Error).message || 'Falha ao alterar a quadra.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  protected async walkover(winnerTeamId: string): Promise<void> {
    const m = this.match();
    if (!m || !winnerTeamId) return;
    if (!confirm('Declarar W.O.? A partida encerra sem jogo e a chave avança.')) return;
    this.saving.set(true);
    this.busyKey.set(`wo:${winnerTeamId}`);
    this.feedback.set(null);
    try {
      await declareMatchWalkover({ matchId: m.id, winnerTeamId });
      this.feedback.set({ ok: true, message: 'W.O. registrado — a chave avança automaticamente.' });
      this.hydratedMatchId = null;
      await this.ctx.reloadMatches();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao registrar W.O.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  protected async validate(): Promise<void> {
    const m = this.match();
    if (!m) return;
    this.saving.set(true);
    this.busyKey.set('validate');
    try {
      await validateMatchResult(m.id);
      this.feedback.set({ ok: true, message: 'Resultado validado na súmula.' });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao validar o resultado.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  protected scheduledLabel(): string {
    const d = this.match()?.scheduledAt;
    return d ? DATE_TIME.format(d) : 'A definir';
  }

  protected cancel(): void {
    void this.router.navigate(['/painel/eventos', this.id(), 'categorias', this.catId(), 'jogos']);
  }
}
