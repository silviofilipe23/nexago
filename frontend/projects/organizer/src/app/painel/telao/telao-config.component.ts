import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { resolveCourtNames } from '../data/matches-repository';
import { formatCourtLabel, spTimeLabel } from '../data/schedule-format';
import { effectiveTelaoConfig, listMyTournaments, saveTelaoConfig } from '../data/tournaments-repository';
import type { OrganizerTournament, TelaoConfig } from '../data/tournament.model';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { TelaoDataService } from './telao-data.service';
import { TelaoScreenComponent } from './telao-screen.component';
import { TelaoStageComponent } from './telao-stage.component';
import { courtNowOf } from './telao-selectors';

type TelaoToggleKey = 'showUpcoming' | 'showCall' | 'showAvatars' | 'autoRotate' | 'showStreak' | 'showFinalMode';

const TOGGLES: { key: TelaoToggleKey; title: string; desc: string }[] = [
  { key: 'showUpcoming', title: 'Próximos jogos', desc: 'Fila lateral com horário e quadra' },
  { key: 'showCall', title: 'Chamada de atletas', desc: 'Barra inferior convocando a próxima partida' },
  { key: 'showAvatars', title: 'Avatares dos atletas', desc: 'Iniciais das duplas em cada quadra' },
  { key: 'autoRotate', title: 'Rotação automática', desc: 'Alterna as quadras exibidas a cada 20 s' },
  { key: 'showStreak', title: 'Em chamas', desc: 'Destaque na dupla com 3+ pontos seguidos — cresce com a sequência' },
  { key: 'showFinalMode', title: 'Modo Grande Final', desc: 'Final e 3º lugar assumem a tela inteira, com tela de campeões no fim' },
];

const STATUS_LABEL: Record<OrganizerTournament['status'], string> = {
  inscricoes: 'inscrições abertas',
  andamento: 'em andamento',
  concluido: 'concluído',
  cancelado: 'cancelado',
};

/** Ordem do seletor: em andamento primeiro (é o que se transmite), depois inscrições, depois
 *  o resto — dentro de cada grupo, mais recente primeiro (ordem que `listMyTournaments` dá). */
const STATUS_ORDER: Record<OrganizerTournament['status'], number> = { andamento: 0, inscricoes: 1, concluido: 2, cancelado: 3 };

/** `/painel/telao` — configuração do telão: evento exibido, quadras, o que aparece e a
 *  pré-visualização ao vivo (a MESMA arte da TV, escalada). Config gravada em
 *  `tournaments/{id}.bigScreen`; a TV reage sem recarregar. */
@Component({
  selector: 'og-telao-config',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TelaoDataService],
  imports: [NxPageLoadingComponent, OgCardComponent, OgIconComponent, OgPageHeaderComponent, TelaoScreenComponent, TelaoStageComponent],
  template: `
    <og-page-header title="Telão ao vivo" subtitle="Exiba os jogos das quadras num painel na arena — placar em tempo real e chamada dos próximos jogos">
      <button type="button" class="og-ghost-btn" [disabled]="!selectedId()" (click)="copyLink()">
        {{ copied() ? 'Link copiado ✓' : 'Copiar link' }}
      </button>
      <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="!selectedId()" (click)="openFullscreen()">
        Abrir telão em tela cheia
      </button>
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <app-nx-page-loading title="Carregando telão…" />
      } @else if (tournaments().length === 0) {
        <og-card kicker="Telão ao vivo" title="Nenhum evento pra exibir">
          <p class="og-telao-cfg-empty">Crie um torneio (ou uma etapa de liga) pra transmitir os jogos no telão da arena.</p>
        </og-card>
      } @else {
        <div class="og-telao-cfg">
          <aside class="og-telao-cfg-side">
            <og-card kicker="Fonte dos jogos" title="Evento exibido">
              <select class="og-select-el" [value]="selectedId() ?? ''" (change)="selectEvento($any($event.target).value)" aria-label="Evento exibido no telão">
                @for (t of tournamentOptions(); track t.id) {
                  <option [value]="t.id">{{ t.name }} · {{ t.statusLabel }}</option>
                }
              </select>

              @if (courtRows().length > 0) {
                <div class="og-telao-cfg-courts-label">Quadras no telão</div>
                <div class="og-telao-cfg-courts">
                  @for (row of courtRows(); track row.id) {
                    <label class="og-telao-cfg-court" [class.checked]="row.checked">
                      <input type="checkbox" [checked]="row.checked" (change)="toggleCourt(row.id)" />
                      <span class="og-telao-cfg-court-check"><og-icon name="check" [size]="12" [strokeWidth]="3" /></span>
                      <span class="og-telao-cfg-court-name">{{ row.name }}</span>
                      <span class="og-telao-cfg-court-status" [class.live]="row.live">{{ row.status }}</span>
                    </label>
                  }
                </div>
              }
            </og-card>

            <og-card kicker="Exibição" title="O que aparece">
              @for (t of toggles; track t.key) {
                <div class="og-toggle-row">
                  <div class="og-toggle-row-text">
                    <div class="og-toggle-row-title">{{ t.title }}</div>
                    <div class="og-toggle-row-desc">{{ t.desc }}</div>
                  </div>
                  <button
                    type="button"
                    class="og-toggle"
                    [class.on]="cfg()?.[t.key]"
                    role="switch"
                    [attr.aria-checked]="cfg()?.[t.key] ?? false"
                    [attr.aria-label]="t.title"
                    (click)="toggleFlag(t.key)"
                  ></button>
                </div>
              }
            </og-card>

            <og-card kicker="TV da arena" title="Exibir na TV">
              <p class="og-telao-cfg-tv">
                Na TV (ou no computador ligado ao painel), faça login neste portal e abra o link do telão — ele entra em tela cheia e
                atualiza sozinho a cada ponto lançado.
              </p>
              <button type="button" class="og-ghost-btn og-telao-cfg-tv-btn" [disabled]="!selectedId()" (click)="copyLink()">
                {{ copied() ? 'Link copiado ✓' : 'Copiar link do telão' }}
              </button>
            </og-card>
          </aside>

          <section class="og-telao-cfg-preview">
            <header class="og-telao-cfg-preview-head">
              <span class="og-telao-cfg-preview-kicker">Pré-visualização · 1920×1080</span>
              <span class="og-telao-cfg-preview-title">Telão ao vivo</span>
              <span class="og-telao-cfg-preview-spacer"></span>
              @if (transmitting()) {
                <span class="og-pill og-pill-green"><span class="og-dot og-dot-pulse"></span>Transmitindo</span>
              }
            </header>
            <og-telao-stage class="og-telao-cfg-stage">
              <og-telao-screen />
            </og-telao-stage>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .og-telao-cfg {
      display: grid;
      grid-template-columns: 380px minmax(0, 1fr);
      gap: 22px;
      align-items: start;
    }
    .og-telao-cfg-side {
      display: flex;
      flex-direction: column;
      gap: 22px;
    }
    .og-telao-cfg-empty,
    .og-telao-cfg-tv {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }
    .og-telao-cfg-tv-btn {
      margin-top: 12px;
    }
    .og-telao-cfg-courts-label {
      margin: 18px 0 10px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-cfg-courts {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .og-telao-cfg-court {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 12px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      cursor: pointer;
    }
    .og-telao-cfg-court.checked {
      border-color: rgba(255, 106, 26, 0.45);
    }
    .og-telao-cfg-court input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .og-telao-cfg-court-check {
      width: 20px;
      height: 20px;
      border-radius: 6px;
      border: 1px solid var(--nx-line-strong);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: transparent;
      flex: none;
    }
    .og-telao-cfg-court.checked .og-telao-cfg-court-check {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }
    .og-telao-cfg-court-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      flex: 1;
    }
    .og-telao-cfg-court-status {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-cfg-court-status.live {
      color: var(--nx-live);
    }
    .og-telao-cfg-preview {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    .og-telao-cfg-preview-head {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .og-telao-cfg-preview-kicker {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-cfg-preview-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
    }
    .og-telao-cfg-preview-spacer {
      flex: 1;
    }
    .og-telao-cfg-preview-head .og-dot {
      background: var(--nx-win);
    }
    .og-telao-cfg-stage {
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      background: var(--nx-bg);
    }
  `,
})
export class TelaoConfigComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly svc = inject(TelaoDataService);

  protected readonly toggles = TOGGLES;

  protected readonly loading = signal(true);
  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  /** Relógio de baixa frequência só pro status das quadras (AO VIVO / próximo horário). */
  private readonly now = signal(Date.now());

  private readonly eventoParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('evento'))), { initialValue: null });

  protected readonly tournamentOptions = computed(() =>
    [...this.tournaments()]
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      .map((t) => ({ id: t.id, name: t.name, statusLabel: STATUS_LABEL[t.status] })),
  );

  protected readonly selectedId = computed<string | null>(() => {
    const param = this.eventoParam();
    const options = this.tournamentOptions();
    if (param && options.some((t) => t.id === param)) return param;
    return options[0]?.id ?? null;
  });

  /** Config efetiva vinda do doc AO VIVO (o preview e a TV veem a mesma coisa). */
  protected readonly cfg = computed<TelaoConfig | null>(() => {
    const t = this.svc.tournament();
    return t ? effectiveTelaoConfig(t) : null;
  });

  protected readonly transmitting = computed(() => this.svc.connected() && !this.svc.error());

  protected readonly courtRows = computed(() => {
    const t = this.svc.tournament();
    const cfg = this.cfg();
    if (!t || !cfg) return [];
    const matches = resolveCourtNames(this.svc.matches(), t.courts);
    return t.courts.map((court) => {
      const { kind, match } = courtNowOf(matches, court.id, this.now());
      return {
        id: court.id,
        name: formatCourtLabel(court.name),
        checked: cfg.courtIds.includes(court.id),
        live: kind === 'live',
        status: kind === 'live' ? 'Ao vivo' : kind === 'next' && match?.scheduledAt ? spTimeLabel(match.scheduledAt) : '—',
      };
    });
  });

  constructor() {
    effect(() => this.svc.tournamentId.set(this.selectedId()));

    const statusTimer = setInterval(() => this.now.set(Date.now()), 30_000);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      clearInterval(statusTimer);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
    });

    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }
    void this.load(uid);
  }

  private async load(uid: string): Promise<void> {
    try {
      this.tournaments.set(await listMyTournaments(uid));
    } finally {
      this.loading.set(false);
    }
  }

  protected selectEvento(id: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { evento: id }, queryParamsHandling: 'merge' });
  }

  protected toggleCourt(courtId: string): void {
    const cfg = this.cfg();
    if (!cfg) return;
    const checked = cfg.courtIds.includes(courtId);
    // Nunca deixa a última quadra sair — telão sem quadra nenhuma não faz sentido.
    if (checked && cfg.courtIds.length === 1) return;
    const all = this.svc.tournament()?.courts.map((c) => c.id) ?? [];
    const next = checked ? cfg.courtIds.filter((id) => id !== courtId) : all.filter((id) => cfg.courtIds.includes(id) || id === courtId);
    this.save({ ...cfg, courtIds: next });
  }

  protected toggleFlag(key: TelaoToggleKey): void {
    const cfg = this.cfg();
    if (!cfg) return;
    this.save({ ...cfg, [key]: !cfg[key] });
  }

  private save(config: TelaoConfig): void {
    const id = this.selectedId();
    if (!id) return;
    // O listener do doc devolve a mudança na hora (latency compensation) — sem estado otimista.
    void saveTelaoConfig(id, config);
  }

  protected telaoUrl(): string | null {
    const id = this.selectedId();
    return id ? `${location.origin}/telao/${id}` : null;
  }

  protected copyLink(): void {
    const url = this.telaoUrl();
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      this.copied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected openFullscreen(): void {
    const url = this.telaoUrl();
    if (url) window.open(url, '_blank');
  }
}
