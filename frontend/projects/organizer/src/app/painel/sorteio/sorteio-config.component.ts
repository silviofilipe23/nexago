import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { getTournament } from '../data/tournaments-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { findDrawSessionForCategory } from '../data/draw-sessions-repository';
import type { DrawFormat, DrawSession } from '../data/draw-session.model';
import {
  createDrawSession,
  startDrawSession,
  updateDrawSessionConfig,
} from '../data/organizer-ops.service';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgRadioRowComponent } from '../ui/radio-row.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { drawTelaoUrl } from './draw-links';

/**
 * `eventos/:id/categorias/:catId/sorteio` — configurar a sessão de Sorteio ao Vivo.
 *
 * A tela tem dois estados bem diferentes e é isso que organiza o layout: sem
 * sessão, ela é um único botão de criar com o resumo do que será congelado; com
 * sessão, ela vira o painel de ajustes + o link do telão + o botão de entrar no
 * console.
 *
 * O botão de criar é deliberadamente pesado (confirma o número de duplas antes):
 * criar a sessão CONGELA o elenco, e recriar depois é o único caminho quando as
 * inscrições mudam.
 */
@Component({
  selector: 'og-sorteio-config',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgCardComponent, OgPageHeaderComponent, OgRadioRowComponent, OgToggleRowComponent],
  template: `
    <og-page-header title="Sorteio ao vivo" [subtitle]="headerSubtitle()">
      @if (session(); as s) {
        <button type="button" class="og-mini-btn" (click)="copyTelaoLink(s)">
          {{ copied() ? 'Link copiado ✓' : 'Copiar link do telão' }}
        </button>
        @if (s.status === 'live') {
          <button type="button" class="og-btn" (click)="openConsole(s)">Voltar ao console</button>
        } @else if (s.status === 'draft' || s.status === 'scheduled') {
          <button type="button" class="og-btn" [disabled]="busy()" (click)="start(s)">
            {{ busy() ? 'Iniciando…' : 'Iniciar sorteio' }}
          </button>
        }
      }
    </og-page-header>

    <div class="og-sorteio-config">
      @if (loading()) {
        <og-card><p class="og-sorteio-msg">Carregando…</p></og-card>
      } @else if (feedback(); as f) {
        <div class="og-sorteio-feedback" [class.erro]="!f.ok" role="status">{{ f.message }}</div>
      }

      @if (!loading() && !session()) {
        <og-card kicker="Ainda não existe sessão" title="Criar o sorteio desta categoria">
          <p class="og-sorteio-texto">
            Criar a sessão congela o elenco: nome, foto, cidade, nível e cartel de cada dupla
            entram no sorteio como estão agora. Se as inscrições confirmadas mudarem depois, o
            sorteio recusa começar e a sessão precisa ser criada de novo.
          </p>

          <div class="og-sorteio-formatos">
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
            <div class="og-sorteio-campo">
              <span class="og-sorteio-label">Cabeças travadas</span>
              <div class="og-sorteio-opcoes">
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
              <p class="og-sorteio-ajuda">
                As primeiras da ordem de nível entram sem sorteio, e a planta da chave decide
                byes e confrontos a partir daí.
              </p>
            </div>
          }

          <button type="button" class="og-btn" [disabled]="busy()" (click)="create()">
            {{ busy() ? 'Criando…' : 'Criar sessão de sorteio' }}
          </button>
        </og-card>
      }

      @if (session(); as s) {
        <div class="og-sorteio-grid">
          <og-card kicker="Transmissão" title="Link do telão">
            <p class="og-sorteio-texto">
              Abra na TV da arena ou capture a janela no OBS. <strong>Não pede login</strong> —
              quem tiver o link assiste.
            </p>
            <code class="og-sorteio-link">{{ telaoUrl(s) }}</code>
            <div class="og-sorteio-acoes">
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
          </og-card>

          <og-card kicker="Sessão" title="O que foi congelado">
            <div class="og-sorteio-stats">
              <div><span>Duplas</span><strong>{{ s.entrants.length }}</strong></div>
              <div><span>Revelações</span><strong>{{ s.totalReveals }}</strong></div>
              <div><span>Potes</span><strong>{{ s.pots.length }}</strong></div>
              <div><span>Status</span><strong>{{ statusLabel(s) }}</strong></div>
            </div>
            @for (pot of s.pots; track pot.index) {
              <div class="og-sorteio-pote">
                <span class="og-sorteio-label">
                  Pote {{ pot.index }}{{ pot.index === 1 ? ' · cabeças' : '' }}
                </span>
                <div class="og-sorteio-pote-lista">
                  @for (teamId of pot.teamIds; track teamId) {
                    <span class="og-sorteio-dupla">{{ labelOf(s, teamId) }}</span>
                  }
                </div>
              </div>
            }
          </og-card>

          @if (editable(s)) {
            <og-card kicker="Condução" title="Ritmo do sorteio">
              <og-radio-row
                title="Manual"
                desc="Um clique por revelação — para narrar ao vivo"
                [selected]="s.config.mode === 'manual'"
                (click)="setMode(s, 'manual')"
              />
              <og-radio-row
                title="Automático"
                desc="Revela sozinho no intervalo escolhido, com pausa"
                [selected]="s.config.mode === 'auto'"
                (click)="setMode(s, 'auto')"
              />
              <og-radio-row
                title="Híbrido · recomendado"
                desc="Automático dentro do pote, pausa entre potes"
                [selected]="s.config.mode === 'hybrid'"
                (click)="setMode(s, 'hybrid')"
              />

              <label class="og-sorteio-campo">
                <span class="og-sorteio-label">Intervalo entre revelações</span>
                <div class="og-sorteio-slider">
                  <input
                    type="range"
                    min="2000"
                    max="15000"
                    step="500"
                    [value]="s.config.intervalMs"
                    (change)="setInterval(s, $event)"
                  />
                  <span class="og-sorteio-slider-valor">{{ seconds(s.config.intervalMs) }}s</span>
                </div>
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
                  desc="Relaxada automaticamente se travar a chave — e o comprovante registra"
                  [on]="s.config.constraints.avoidSameCity"
                  (toggled)="setConstraint(s, 'avoidSameCity', $event)"
                />
              } @else {
                <p class="og-sorteio-texto">
                  Na dupla eliminatória as restrições vêm da planta da chave: as cabeças entram
                  travadas nos primeiros seeds e os byes são consequência, não sorteio.
                </p>
              }
              <og-toggle-row
                title="Frases no telão"
                desc="Provocação por contexto, sempre sobre a chave — nunca sobre a pessoa"
                [on]="s.config.phrasesEnabled"
                (toggled)="setPhrases(s, $event)"
              />
            </og-card>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .og-sorteio-config {
      padding: 20px 32px 32px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .og-sorteio-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
      align-items: start;
    }
    .og-sorteio-msg,
    .og-sorteio-texto {
      margin: 0 0 14px;
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--nx-text-mute);
      text-wrap: pretty;
    }
    .og-sorteio-texto strong {
      color: var(--nx-text);
    }
    .og-sorteio-formatos {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .og-sorteio-campo {
      display: block;
      margin: 16px 0;
    }
    .og-sorteio-label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }
    .og-sorteio-opcoes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-sorteio-ajuda {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
    .og-sorteio-link {
      display: block;
      padding: 11px 13px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-orange-500);
      /* URL longa quebra dentro da caixa em vez de esticar o card. */
      overflow-wrap: anywhere;
    }
    .og-sorteio-acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .og-sorteio-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .og-sorteio-stats div {
      padding: 9px 11px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-sorteio-stats span {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-sorteio-stats strong {
      display: block;
      margin-top: 3px;
      font-family: var(--nx-font-mono);
      font-size: 16px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text);
    }
    .og-sorteio-pote {
      margin-top: 12px;
    }
    .og-sorteio-pote-lista {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .og-sorteio-dupla {
      padding: 5px 10px;
      border-radius: 999px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-sorteio-slider {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .og-sorteio-slider input {
      flex: 1;
      min-width: 0;
      accent-color: var(--nx-orange-500);
      /* Área de toque confortável no tablet do organizador. */
      height: 44px;
    }
    .og-sorteio-slider-valor {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-orange-500);
      width: 40px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .og-sorteio-feedback {
      padding: 11px 14px;
      border-radius: var(--nx-r-2);
      background: rgb(43 209 126 / 12%);
      border: 1px solid rgb(43 209 126 / 40%);
      color: var(--nx-win);
      font-size: 13px;
    }
    .og-sorteio-feedback.erro {
      background: rgb(255 59 48 / 10%);
      border-color: rgb(255 59 48 / 40%);
      color: var(--nx-live);
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
    const t = this.tournament();
    const category = t?.categories.find((c) => c.id === this.catId());
    if (!t || !category) return 'A chave só vira oficial quando a sessão for publicada';
    return `${t.name} · ${category.name} · a chave só vira oficial quando a sessão for publicada`;
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

  protected statusLabel(session: DrawSession): string {
    return {
      draft: 'Rascunho',
      scheduled: 'Agendada',
      live: 'No ar',
      published: 'Publicada',
      voided: 'Anulada',
    }[session.status];
  }

  protected labelOf(session: DrawSession, teamId: string): string {
    return session.entrants.find((e) => e.teamId === teamId)?.label ?? teamId;
  }

  protected telaoUrl(session: DrawSession): string {
    return drawTelaoUrl(location.origin, session.id);
  }

  protected seconds(ms: number): string {
    return (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1);
  }

  protected async copyTelaoLink(session: DrawSession): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.telaoUrl(session));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.feedback.set({ ok: false, message: 'Não foi possível copiar. Selecione o link e copie à mão.' });
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
      this.feedback.set({ ok: true, message: 'Sessão criada. Ajuste o ritmo e as regras antes de iniciar.' });
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
    void this.router.navigate([
      '/painel/eventos',
      this.id(),
      'categorias',
      this.catId(),
      'sorteio',
      'console',
    ], { queryParams: { s: session.id } });
  }

  protected setMode(session: DrawSession, mode: DrawSession['config']['mode']): void {
    void this.patchConfig(session, { mode });
  }

  protected setInterval(session: DrawSession, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    void this.patchConfig(session, { intervalMs: value });
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
    // reload devolve o estado real em vez de deixar a tela mentindo.
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
