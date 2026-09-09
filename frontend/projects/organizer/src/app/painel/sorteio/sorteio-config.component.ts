import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { getTournament } from '../data/tournaments-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { findDrawSessionForCategory } from '../data/draw-sessions-repository';
import type { DrawFormat, DrawSession, DrawSessionEntrant } from '../data/draw-session.model';
import { combinationsOf, formatSummaryOf, readinessChecksOf } from '../data/draw-summary';
import {
  createDrawSession,
  startDrawSession,
  updateDrawSessionConfig,
} from '../data/organizer-ops.service';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgRadioRowComponent } from '../ui/radio-row.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { drawTelaoUrl } from './draw-links';
import { SorteioDuplaRowComponent } from './sorteio-dupla-row.component';

/**
 * `eventos/:id/categorias/:catId/sorteio` — configurar a sessão de Sorteio ao Vivo.
 *
 * Três colunas, como no protótipo, e a divisão não é estética: à esquerda o que
 * é FATO (quando, formato detectado, pendências), no meio o que vai ser
 * sorteado (os potes), à direita o que o organizador DECIDE (ritmo, regras,
 * transmissão). Ler da esquerda para a direita é ler da realidade para a
 * escolha.
 */
@Component({
  selector: 'og-sorteio-config',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OgCardComponent,
    OgIconComponent,
    OgPageHeaderComponent,
    OgRadioRowComponent,
    OgToggleRowComponent,
    SorteioDuplaRowComponent,
  ],
  template: `
    <og-page-header title="Sorteio ao vivo" [subtitle]="headerSubtitle()">
      @if (session(); as s) {
        <button type="button" class="og-mini-btn" (click)="copyTelaoLink(s)">
          {{ copied() ? 'Link copiado ✓' : 'Copiar link do telão' }}
        </button>
        @if (s.status === 'live') {
          <button type="button" class="og-btn" (click)="openConsole(s)">Voltar ao console</button>
        } @else if (editable(s)) {
          <button type="button" class="og-btn" [disabled]="busy()" (click)="start(s)">
            {{ busy() ? 'Iniciando…' : 'Iniciar sorteio' }}
          </button>
        }
      }
    </og-page-header>

    <div class="og-sc">
      @if (feedback(); as f) {
        <div class="og-sc-feedback" [class.erro]="!f.ok" role="status">{{ f.message }}</div>
      }

      @if (loading()) {
        <og-card><p class="og-sc-texto">Carregando…</p></og-card>
      } @else if (!session()) {
        <og-card kicker="Ainda não existe sessão" title="Criar o sorteio desta categoria">
          <p class="og-sc-texto">
            Criar a sessão <strong>congela o elenco</strong>: nome, foto, cidade, nível e cartel de
            cada dupla entram no sorteio como estão agora. Se as inscrições confirmadas mudarem
            depois, o sorteio recusa começar e a sessão precisa ser criada de novo.
          </p>
          <div class="og-sc-formatos">
            <og-radio-row
              title="Fase de grupos"
              desc="Cada dupla é sorteada para um grupo, pote a pote"
              [selected]="format() === 'groups_knockout'"
              (click)="format.set('groups_knockout')"
            />
            <og-radio-row
              title="Dupla eliminatória"
              desc="As cabeças entram travadas; o sorteio distribui as posições"
              [selected]="format() === 'double_elimination'"
              (click)="format.set('double_elimination')"
            />
          </div>
          @if (format() === 'double_elimination') {
            <div class="og-sc-campo">
              <span class="og-sc-label">Cabeças travadas</span>
              <div class="og-sc-chips">
                @for (n of lockedOptions; track n) {
                  <button
                    type="button"
                    class="og-chip"
                    [class.active]="lockedSeedCount() === n"
                    (click)="lockedSeedCount.set(n)"
                  >
                    {{ n === 0 ? 'nenhuma' : n }}
                  </button>
                }
              </div>
            </div>
          }
          <button type="button" class="og-btn" [disabled]="busy()" (click)="create()">
            {{ busy() ? 'Criando…' : 'Criar sessão de sorteio' }}
          </button>
        </og-card>
      } @else if (session(); as s) {
        <div class="og-sc-grid">
          <!-- ── Coluna 1 · o que é fato ─────────────────────────── -->
          <div class="og-sc-col">
            <og-card kicker="Quando" title="Data e hora da transmissão">
              <div class="og-sc-quando">
                <label class="og-sc-box">
                  <span class="og-sc-label">Data</span>
                  <input
                    type="date"
                    [value]="dateValue(s)"
                    [disabled]="!editable(s)"
                    (change)="setDate(s, $event)"
                  />
                </label>
                <label class="og-sc-box">
                  <span class="og-sc-label">Hora</span>
                  <input
                    type="time"
                    [value]="timeValue(s)"
                    [disabled]="!editable(s)"
                    (change)="setTime(s, $event)"
                  />
                </label>
              </div>
              @if (scheduleLabel(s); as label) {
                <p class="og-sc-nota">{{ label }}</p>
              }
            </og-card>

            <og-card kicker="Formato detectado" [title]="formatTitle()">
              <div class="og-sc-stats">
                @for (stat of formatStats(); track stat.label) {
                  <div>
                    <span class="og-sc-label">{{ stat.label }}</span>
                    <strong>{{ stat.value }}</strong>
                  </div>
                }
              </div>
              <p class="og-sc-nota">{{ exactNote() }}</p>
            </og-card>

            <og-card kicker="Trava de segurança" title="Pendências antes de começar">
              <ul class="og-sc-checks">
                @for (check of checks(); track check.id) {
                  <li [class.ok]="check.ok" [class.opcional]="check.optional">
                    <span class="og-sc-check-box">
                      @if (check.ok) {
                        <og-icon name="check" [size]="11" />
                      }
                    </span>
                    <span>{{ check.label }}</span>
                    @if (!check.ok && check.optional) {
                      <em>· opcional</em>
                    }
                  </li>
                }
              </ul>
            </og-card>
          </div>

          <!-- ── Coluna 2 · o que vai ser sorteado ────────────────── -->
          <div class="og-sc-col">
            <og-card [kicker]="potsKicker(s)" [title]="potsTitle(s)" flex="1">
              <div class="og-sc-potes">
                @for (pot of s.pots; track pot.index) {
                  <section>
                    <div class="og-sc-pote-head">
                      <span class="og-sc-label" [class.destaque]="pot.index === 1">
                        Pote {{ pot.index }}{{ pot.index === 1 ? ' · cabeças' : '' }}
                      </span>
                      <span class="og-sc-rule"></span>
                      <span class="og-sc-label">{{ potRangeOf(s, pot.teamIds) }}</span>
                    </div>
                    <div class="og-sc-pote-lista">
                      @for (teamId of pot.teamIds; track teamId) {
                        <og-sorteio-dupla-row
                          [entrant]="entrantOf(s, teamId)"
                          [num]="seedNumOf(s, teamId)"
                          [seedStyle]="pot.index === 1"
                          [compact]="true"
                        />
                      }
                    </div>
                  </section>
                }
                @if (s.pots.length === 0) {
                  <p class="og-sc-texto">Nenhum pote montado.</p>
                }
              </div>
            </og-card>
          </div>

          <!-- ── Coluna 3 · o que o organizador decide ────────────── -->
          <div class="og-sc-col">
            <og-card kicker="Condução" title="Ritmo do sorteio">
              <og-radio-row
                title="Manual"
                desc="Um clique por revelação — para narrar ao vivo"
                [selected]="s.config.mode === 'manual'"
                (click)="setMode(s, 'manual')"
              />
              <og-radio-row
                title="Automático"
                [desc]="'Revela sozinho a cada ' + seconds(s.config.intervalMs) + ' s, com play/pause'"
                [selected]="s.config.mode === 'auto'"
                (click)="setMode(s, 'auto')"
              />
              <og-radio-row
                title="Híbrido · recomendado"
                desc="Automático dentro do pote, pausa entre potes"
                [selected]="s.config.mode === 'hybrid'"
                (click)="setMode(s, 'hybrid')"
              />
              <label class="og-sc-campo og-sc-slider-campo">
                <span class="og-sc-label">Intervalo entre revelações</span>
                <span class="og-sc-slider">
                  <input
                    type="range"
                    min="2000"
                    max="15000"
                    step="500"
                    [value]="s.config.intervalMs"
                    [disabled]="!editable(s)"
                    (change)="setInterval(s, $event)"
                  />
                  <b>{{ seconds(s.config.intervalMs) }}s</b>
                </span>
              </label>
            </og-card>

            <og-card kicker="Regras do sorteio" title="Restrições ativas">
              @if (s.format === 'groups_knockout') {
                <og-toggle-row
                  title="Cabeças em grupos diferentes"
                  desc="As do pote 1 nunca se cruzam na fase de grupos"
                  [on]="s.config.constraints.seedsApart"
                  (toggled)="setConstraint(s, 'seedsApart', $event)"
                />
                <og-toggle-row
                  title="Potes por ranking"
                  desc="Um slot de cada grupo por rodada de pote"
                  [on]="s.config.constraints.potsPerGroup"
                  (toggled)="setConstraint(s, 'potsPerGroup', $event)"
                />
                <og-toggle-row
                  title="Evitar mesma cidade no grupo"
                  desc="Relaxada automaticamente se travar a chave"
                  [on]="s.config.constraints.avoidSameCity"
                  (toggled)="setConstraint(s, 'avoidSameCity', $event)"
                />
              } @else {
                <p class="og-sc-texto">
                  Na dupla eliminatória as restrições vêm da planta: as cabeças entram travadas nos
                  primeiros seeds e os byes são consequência, não sorteio.
                </p>
              }
              <div class="og-sc-combo">
                <span class="og-sc-label">Combinações possíveis</span>
                <strong>{{ combinationsLabel() }}</strong>
                <p>Com as restrições ligadas. O sorteio roda no servidor a cada clique.</p>
              </div>
            </og-card>

            <og-card kicker="Transmissão" title="Telão e comprovante">
              <p class="og-sc-texto">
                Abra na TV da arena ou capture a janela no OBS.
                <strong>Não pede login</strong> — quem tiver o link assiste.
              </p>
              <code class="og-sc-link">{{ telaoUrl(s) }}</code>
              <div class="og-sc-acoes">
                <button type="button" class="og-mini-btn" (click)="copyTelaoLink(s)">
                  {{ copied() ? 'Copiado ✓' : 'Copiar link' }}
                </button>
                <a class="og-mini-btn" [href]="telaoUrl(s)" target="_blank" rel="noopener">
                  Abrir telão
                </a>
                <a class="og-mini-btn" [href]="telaoUrl(s) + '/comprovante'" target="_blank" rel="noopener">
                  Comprovante
                </a>
              </div>
              <og-toggle-row
                title="Frases no telão"
                desc="Provocação por contexto, sempre sobre a chave — nunca sobre a pessoa"
                [on]="s.config.phrasesEnabled"
                (toggled)="setPhrases(s, $event)"
              />
            </og-card>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .og-sc {
      padding: 20px 32px 32px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    /* Fato · sorteio · decisão. A coluna do meio é a mais larga porque é a
       lista mais longa; a da direita é fixa porque são controles. */
    .og-sc-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 360px;
      gap: 14px;
      align-items: start;
    }
    .og-sc-col {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .og-sc-texto,
    .og-sc-nota {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      text-wrap: pretty;
    }
    .og-sc-texto {
      font-size: 13.5px;
      margin-bottom: 14px;
    }
    .og-sc-texto strong {
      color: var(--nx-text);
    }
    .og-sc-nota {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-sc-label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-sc-label.destaque {
      color: var(--nx-orange-500);
    }
    .og-sc-quando {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .og-sc-box {
      display: block;
      padding: 9px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      cursor: pointer;
    }
    .og-sc-box input {
      display: block;
      width: 100%;
      margin-top: 3px;
      padding: 0;
      background: transparent;
      border: 0;
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      /* Altura de toque confortável no tablet do organizador. */
      min-height: 28px;
      color-scheme: dark;
    }
    .og-sc-box input:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .og-sc-box input[type='time'] {
      font-family: var(--nx-font-mono);
    }
    .og-sc-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .og-sc-stats div {
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-sc-stats strong {
      display: block;
      margin-top: 4px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 22px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text);
    }
    .og-sc-checks {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .og-sc-checks li {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .og-sc-checks li.ok {
      color: var(--nx-text);
    }
    .og-sc-checks li em {
      font-style: normal;
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-sc-check-box {
      flex: none;
      display: grid;
      place-items: center;
      width: 17px;
      height: 17px;
      border-radius: 5px;
      border: 1px solid var(--nx-line-strong);
      color: #07130d;
    }
    .og-sc-checks li.ok .og-sc-check-box {
      background: var(--nx-win);
      border-color: var(--nx-win);
    }
    .og-sc-potes {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .og-sc-pote-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .og-sc-rule {
      flex: 1;
      height: 1px;
      background: var(--nx-line);
    }
    .og-sc-pote-lista {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 5px;
    }
    .og-sc-campo {
      display: block;
      margin-top: 14px;
    }
    .og-sc-slider-campo {
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
    }
    .og-sc-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .og-sc-formatos {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .og-sc-slider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 6px;
    }
    .og-sc-slider input {
      flex: 1;
      min-width: 0;
      accent-color: var(--nx-orange-500);
      min-height: 44px;
    }
    .og-sc-slider b {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-orange-500);
      width: 38px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .og-sc-combo {
      margin-top: 12px;
      padding: 11px 13px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-sc-combo strong {
      display: block;
      margin-top: 4px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 17px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text);
    }
    .og-sc-combo p {
      margin: 4px 0 0;
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--nx-text-dim);
    }
    .og-sc-link {
      display: block;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-orange-500);
      overflow-wrap: anywhere;
    }
    .og-sc-acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 4px;
    }
    .og-sc-feedback {
      padding: 11px 14px;
      border-radius: var(--nx-r-2);
      background: rgb(43 209 126 / 12%);
      border: 1px solid rgb(43 209 126 / 40%);
      color: var(--nx-win);
      font-size: 13px;
    }
    .og-sc-feedback.erro {
      background: rgb(255 59 48 / 10%);
      border-color: rgb(255 59 48 / 40%);
      color: var(--nx-live);
    }

    /* Tablet: a coluna de decisão desce e as duas de cima dividem a linha. */
    @media (max-width: 1279px) {
      .og-sc-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
      .og-sc-grid > :last-child {
        grid-column: 1 / -1;
        flex-direction: row;
        flex-wrap: wrap;
      }
      .og-sc-grid > :last-child > * {
        flex: 1 1 300px;
      }
    }

    @media (max-width: 899px) {
      .og-sc {
        padding: 16px 20px 24px;
      }
      .og-sc-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .og-sc-grid > :last-child {
        flex-direction: column;
      }
    }
  `,
})
export class SorteioConfigComponent {
  private readonly router = inject(Router);

  /** Preenchidos pelo router (`withComponentInputBinding`) — que só alimenta
   *  `input()`. Como `signal()` comum, ficavam vazios pra sempre e a tela
   *  travava em "Carregando…". */
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly lockedOptions = [0, 2, 4, 8];

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  protected readonly session = signal<DrawSession | null>(null);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly format = signal<DrawFormat>('groups_knockout');
  protected readonly lockedSeedCount = signal(4);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  protected readonly headerSubtitle = computed(() => {
    const s = this.session();
    const t = this.tournament();
    const category = t?.categories.find((c) => c.id === this.catId());
    const base = 'a chave só vira oficial quando a sessão for publicada';
    if (!category) return base;
    const teams = s ? `${s.entrants.length} duplas · ` : '';
    return `${category.name} · ${teams}${base}`;
  });

  private readonly summary = computed(() => {
    const s = this.session();
    return s ? formatSummaryOf(s) : null;
  });

  protected readonly formatTitle = computed(() => {
    const s = this.session();
    if (!s) return '';
    return s.format === 'groups_knockout' ? 'Fase de grupos + mata-mata' : 'Dupla eliminatória';
  });

  protected readonly formatStats = computed(() => {
    const summary = this.summary();
    if (!summary) return [];
    if (summary.kind === 'groups') {
      return [
        { label: 'duplas', value: summary.teams },
        { label: 'grupos', value: summary.groups },
        { label: 'por grupo', value: summary.perGroup },
        { label: 'classificam', value: summary.qualifiers },
      ];
    }
    return [
      { label: 'duplas', value: summary.teams },
      { label: 'cabeças', value: summary.locked },
      { label: 'sorteadas', value: summary.drawn },
      { label: 'byes', value: summary.byes },
    ];
  });

  protected readonly exactNote = computed(() => {
    const summary = this.summary();
    if (!summary) return '';
    if (summary.kind === 'groups') {
      return summary.exact ?
        'A chave fecha exatamente. Nenhum grupo desigual.' :
        'A divisão não fecha: alguns grupos ficam com uma dupla a menos.';
    }
    return summary.exact ?
      'A planta fecha exatamente. Nenhum bye necessário.' :
      `A planta dá bye para ${summary.byes} cabeça(s) na primeira rodada.`;
  });

  protected readonly checks = computed(() => {
    const s = this.session();
    return s ? readinessChecksOf(s) : [];
  });

  protected readonly combinationsLabel = computed(() => {
    const s = this.session();
    if (!s) return '—';
    const total = combinationsOf(s);
    return total == null ? 'praticamente infinitas' : total.toLocaleString('pt-BR');
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      const cid = this.catId();
      if (!tid || !cid) {
        // Sem torneio/categoria não há o que carregar. Sair daqui deixando
        // `loading` ligado prendia a tela em "Carregando…" pra sempre — o
        // sintoma não dizia nada sobre a causa.
        this.loading.set(false);
        this.feedback.set({
          ok: false,
          message: 'Abra o sorteio pelo menu da categoria — falta o torneio ou a categoria na URL.',
        });
        return;
      }
      void this.load(tid, cid);
    });
  }

  private async load(tournamentId: string, categoryId: string): Promise<void> {
    this.loading.set(true);
    try {
      const [tournament, session] = await Promise.all([
        getTournament(tournamentId),
        findDrawSessionForCategory(tournamentId, categoryId),
      ]);
      this.tournament.set(tournament);
      this.session.set(session);
      const saved = tournament?.categories.find((c) => c.id === categoryId)?.bracketFormat;
      if (saved === 'double_elimination') this.format.set('double_elimination');
    } catch (e) {
      // Mostra o motivo real junto. Engolir a mensagem do servidor num "não foi
      // possível" genérico é o que transforma uma falha diagnosticável (índice
      // faltando, permissão, rede) em "a tela não faz nada".
      const detail = (e as { message?: string })?.message?.trim();
      this.feedback.set({
        ok: false,
        message: detail ?
          `Não foi possível carregar a categoria: ${detail}` :
          'Não foi possível carregar a categoria.',
      });
    } finally {
      this.loading.set(false);
    }
  }

  protected editable(session: DrawSession): boolean {
    return session.status === 'draft' || session.status === 'scheduled';
  }

  protected entrantOf(session: DrawSession, teamId: string): DrawSessionEntrant | null {
    return session.entrants.find((e) => e.teamId === teamId) ?? null;
  }

  /** Cabeça mostra o seed; as demais mostram a posição no ranking do pote. */
  protected seedNumOf(session: DrawSession, teamId: string): number {
    const entrant = this.entrantOf(session, teamId);
    if (entrant?.lockedSeed != null) return entrant.lockedSeed;
    return session.pots.flatMap((p) => p.teamIds).indexOf(teamId) + 1;
  }

  /** Faixa de pontuação do pote — é o que justifica a divisão para quem olha. */
  protected potRangeOf(session: DrawSession, teamIds: readonly string[]): string {
    const points = teamIds
      .map((id) => this.entrantOf(session, id)?.points)
      .filter((p): p is number => p != null);
    if (points.length === 0) return 'sem nível';
    const min = Math.min(...points);
    const max = Math.max(...points);
    return min === max ? `${min} pts` : `${min}–${max} pts`;
  }

  protected potsKicker(session: DrawSession): string {
    return session.format === 'groups_knockout' ? 'Potes' : 'Pote único';
  }

  protected potsTitle(session: DrawSession): string {
    return session.format === 'groups_knockout' ?
      `${session.pots.length} potes por ranking` :
      'Não-cabeças a sortear';
  }

  protected telaoUrl(session: DrawSession): string {
    return drawTelaoUrl(location.origin, session.id);
  }

  protected seconds(ms: number): string {
    return (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1);
  }

  /** `YYYY-MM-DD` na parede local — nunca `toISOString`, que desloca o dia. */
  protected dateValue(session: DrawSession): string {
    const at = session.scheduledAt;
    if (at == null) return '';
    const d = new Date(at);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  protected timeValue(session: DrawSession): string {
    const at = session.scheduledAt;
    if (at == null) return '';
    const d = new Date(at);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  protected scheduleLabel(session: DrawSession): string {
    if (session.scheduledAt == null) {
      return 'Sem horário definido: a contagem regressiva do telão só aparece depois de agendar.';
    }
    return `A contagem regressiva aparece no telão a partir de 24 h antes.`;
  }

  protected setDate(session: DrawSession, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    const [y, m, d] = value.split('-').map(Number);
    const current = session.scheduledAt != null ? new Date(session.scheduledAt) : new Date();
    const next = new Date(y!, (m ?? 1) - 1, d ?? 1, current.getHours(), current.getMinutes());
    void this.schedule(session, next.getTime());
  }

  protected setTime(session: DrawSession, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    const [h, min] = value.split(':').map(Number);
    const base = session.scheduledAt != null ? new Date(session.scheduledAt) : new Date();
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h ?? 0, min ?? 0);
    void this.schedule(session, next.getTime());
  }

  private async schedule(session: DrawSession, scheduledAt: number): Promise<void> {
    this.session.set({ ...session, scheduledAt, status: 'scheduled' });
    try {
      await updateDrawSessionConfig(session.id, {}, scheduledAt);
    } catch (e) {
      this.session.set(session);
      this.feedback.set({ ok: false, message: this.messageOf(e) });
    }
  }

  protected async copyTelaoLink(session: DrawSession): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.telaoUrl(session));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.feedback.set({
        ok: false,
        message: 'Não foi possível copiar. Selecione o link e copie à mão.',
      });
    }
  }

  protected async create(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.feedback.set(null);
    try {
      await createDrawSession({
        tournamentId: this.id(),
        categoryId: this.catId(),
        format: this.format(),
        ...(this.format() === 'double_elimination' ?
          { lockedSeedCount: this.lockedSeedCount() } :
          {}),
      });
      await this.load(this.id(), this.catId());
      this.feedback.set({
        ok: true,
        message: 'Sessão criada. Ajuste o ritmo e as regras antes de iniciar.',
      });
    } catch (e) {
      this.feedback.set({ ok: false, message: this.messageOf(e) });
    } finally {
      this.busy.set(false);
    }
  }

  protected async start(session: DrawSession): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.feedback.set(null);
    try {
      await startDrawSession(session.id);
      this.openConsole(session);
    } catch (e) {
      this.feedback.set({ ok: false, message: this.messageOf(e) });
    } finally {
      this.busy.set(false);
    }
  }

  protected openConsole(session: DrawSession): void {
    void this.router.navigate(
      ['/painel/eventos', this.id(), 'categorias', this.catId(), 'sorteio', 'console'],
      { queryParams: { s: session.id } },
    );
  }

  protected setMode(session: DrawSession, mode: DrawSession['config']['mode']): void {
    void this.patchConfig(session, { mode });
  }

  protected setInterval(session: DrawSession, event: Event): void {
    void this.patchConfig(session, {
      intervalMs: Number((event.target as HTMLInputElement).value),
    });
  }

  protected setPhrases(session: DrawSession, phrasesEnabled: boolean): void {
    void this.patchConfig(session, { phrasesEnabled });
  }

  protected setConstraint(
    session: DrawSession,
    key: keyof DrawSession['config']['constraints'],
    value: boolean,
  ): void {
    void this.patchConfig(session, {
      constraints: { ...session.config.constraints, [key]: value },
    });
  }

  private async patchConfig(
    session: DrawSession,
    patch: Partial<DrawSession['config']>,
  ): Promise<void> {
    // Otimista: a tela responde na hora e o servidor confirma. Se recusar, o
    // estado anterior volta em vez de a tela ficar mentindo.
    this.session.set({ ...session, config: { ...session.config, ...patch } });
    try {
      await updateDrawSessionConfig(session.id, patch);
    } catch (e) {
      this.session.set(session);
      this.feedback.set({ ok: false, message: this.messageOf(e) });
    }
  }

  private messageOf(error: unknown): string {
    const err = error as { message?: string };
    return err?.message || 'Não foi possível concluir a ação.';
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
