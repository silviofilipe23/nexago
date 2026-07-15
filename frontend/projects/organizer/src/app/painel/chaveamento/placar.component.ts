import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgDisplayInputComponent } from '../ui/display-input.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

interface SetRow {
  set: number;
  sa: number;
  sb: number;
}

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Placar de uma partida real — chegada via `/painel/chaveamento/placar/:matchId` a partir do
 *  link "Placar" da tela de jogos (Task O6). Lê a partida no cache de jogos já carregado pelo
 *  `ChaveamentoContextService` (mesmo torneio que a tela de jogos deixou selecionado); não há
 *  `getMatch(id)` na camada de dados (contrato da Task O1 só expõe `listMatches(tournamentId)`),
 *  então acesso direto por URL sem ter passado pela lista de jogos mostra "partida não
 *  encontrada". Lançamento/edição de placar continuam mock/fase 2 — sets, duração e
 *  observações aqui são só leitura. */
@Component({
  selector: 'og-placar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgAvatarComponent, OgPillComponent, OgFormFieldComponent, OgDisplayInputComponent],
  template: `
    <og-page-header title="Placar" [subtitle]="headerSubtitle()">
      <button type="button" class="og-ghost-btn" (click)="cancel()">Voltar</button>
      <!-- mock (fase 2): lançamento/edição de placar continua operação do app -->
      <button type="button" class="og-mini-btn og-mini-btn-primary" disabled title="Lançamento de placar é feito pelo app">
        <og-icon name="check" [size]="14" />Salvar placar
      </button>
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col">
        @if (!match()) {
          <og-card><p class="og-empty">Partida não encontrada.</p></og-card>
        } @else {
          <og-card kicker="Partida" [title]="match()!.team1Label + ' vs ' + match()!.team2Label">
            <div class="og-placar-header">
              <div class="og-placar-side">
                <og-avatar [initials]="initialsOf(match()!.team1Label)" [size]="40" />
                <span class="og-placar-name">{{ match()!.team1Label }}</span>
              </div>
              <div class="og-placar-score">
                <span class="a">{{ setsWonA() }}</span>
                <span class="lbl">sets</span>
                <span class="b">{{ setsWonB() }}</span>
              </div>
              <div class="og-placar-side reverse">
                <span class="og-placar-name">{{ match()!.team2Label }}</span>
                <og-avatar [initials]="initialsOf(match()!.team2Label)" [size]="40" />
              </div>
            </div>
          </og-card>

          <og-card kicker="Placar por set" title="Sets">
            @if (sets().length === 0) {
              <p class="og-empty">Partida ainda não tem placar registrado.</p>
            } @else {
              @for (s of sets(); track s.set) {
                <div class="og-placar-set-row">
                  <span class="og-placar-set-label">Set {{ s.set }}</span>
                  <div style="flex:1;display:flex;gap:20px">
                    <div class="og-placar-set-box-wrap">
                      <span class="lbl">{{ match()!.team1Label }}</span>
                      <div class="og-placar-set-box">{{ s.sa }}</div>
                    </div>
                    <div class="og-placar-set-box-wrap">
                      <span class="lbl">{{ match()!.team2Label }}</span>
                      <div class="og-placar-set-box">{{ s.sb }}</div>
                    </div>
                  </div>
                  <og-pill tone="dim">Registrado</og-pill>
                </div>
              }
            }
          </og-card>

          <og-card kicker="Detalhes" title="Registro da partida">
            <div class="og-field-grid">
              <og-form-field label="Quadra"><og-display-input [value]="match()!.court ?? 'A definir'" /></og-form-field>
              <og-form-field label="Horário"><og-display-input [value]="scheduledLabel()" /></og-form-field>
            </div>
            <div style="margin-top:16px">
              <og-form-field label="Observações">
                <!-- mock (fase 2): TournamentMatch não expõe campo de observações -->
                <div class="og-textarea" style="color:var(--nx-text-dim)">Nenhuma ocorrência registrada.</div>
              </og-form-field>
            </div>
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
      width: 60px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
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
    }
    .og-placar-set-box {
      width: 64px;
      height: 64px;
      border-radius: var(--nx-r-3);
      display: grid;
      place-items: center;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      color: var(--nx-text);
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

  readonly matchId = input<string>('');

  protected readonly match = computed(() => {
    const id = this.matchId();
    if (!id) return null;
    return this.ctx.matches().find((m) => m.id === id) ?? null;
  });

  protected readonly sets = computed<SetRow[]>(() => {
    const score = this.match()?.score;
    if (!score) return [];
    return score.split(',').map((pair, i) => {
      const [sa, sb] = pair.trim().split('-').map((n) => Number(n) || 0);
      return { set: i + 1, sa: sa ?? 0, sb: sb ?? 0 };
    });
  });

  protected readonly setsWonA = computed(() => this.sets().filter((s) => s.sa > s.sb).length);
  protected readonly setsWonB = computed(() => this.sets().filter((s) => s.sb > s.sa).length);

  protected readonly headerSubtitle = computed(() => {
    const m = this.match();
    if (!m) return '';
    const t = this.ctx.tournament();
    const parts = [t?.name, m.round, m.court].filter((p): p is string => Boolean(p));
    return parts.join(' · ');
  });

  protected scheduledLabel(): string {
    const d = this.match()?.scheduledAt;
    return d ? DATE_TIME.format(d) : 'A definir';
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/painel/chaveamento/jogos');
  }
}
