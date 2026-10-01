import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  interviewLineOf,
  interviewOnAirAt,
  type BroadcastFinalMode,
  type BroadcastGraphicId,
  type BroadcastGraphics,
  type KocRoundEndScreen,
} from '../data/broadcast-control';
import { resolveCourtNames } from '../data/matches-repository';
import { initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { broadcastGroupsFor } from './broadcast-graphics';
import { TransmissaoDataService } from './transmissao-data.service';
import {
  courtChipsOf,
  courtMatchOf,
  elapsedLabel,
  interviewCandidatesOf,
  interviewFromCandidate,
  quickPicksOf,
  searchCandidates,
  transmissaoUrl,
  type InterviewCandidate,
} from './transmissao-selectors';

const DURATIONS: readonly { label: string; sec: number | null }[] = [
  { label: '20 s', sec: 20 },
  { label: '1 min', sec: 60 },
  { label: 'Até tirar', sec: null },
];

const ROUND_END_OPTIONS: readonly { value: KocRoundEndScreen; label: string }[] = [
  { value: 'rodizio', label: 'Rodízio' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'classificadas', label: 'Classificadas' },
];

const FINAL_OPTIONS: readonly { value: BroadcastFinalMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'Ligado' },
  { value: 'off', label: 'Desligado' },
];

/** Acima disto a prévia já abre: é onde cabe ao lado dos controles. */
const WIDE_QUERY = '(min-width: 1100px)';

/** `eventos/:id/transmissao` — controla o que o overlay do OBS mostra (`/transmissao/:id`).
 *  Cada clique grava na hora em `tournaments/{id}/broadcast/control`; a tela escuta o mesmo doc,
 *  então dois operadores veem o mesmo estado e uma escrita recusada volta sozinha. */
@Component({
  selector: 'og-transmissao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TransmissaoDataService],
  imports: [OgPageHeaderComponent, OgCardComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Transmissão" subtitle="Controle o que aparece na live do torneio — placar, telas do KOTC, tarja de entrevista e patrocínio">
      <button type="button" class="og-ghost-btn" (click)="copyUrl()">{{ copied() ? 'Link copiado ✓' : 'Copiar link do OBS' }}</button>
    </og-page-header>

    <div class="og-content">
      @if (svc.saveError()) {
        <p class="og-tx-erro" role="alert">Não deu pra salvar a última mudança — confira a conexão e tente de novo.</p>
      }
      <div class="og-tx">
        <div class="og-tx-col">
          <og-card kicker="Saída" title="Link e quadra">
            <code class="og-tx-url">{{ url() }}</code>
            <p class="og-tx-dica">No OBS: Fontes → Navegador, 1920×1080, cole o link. Ele acompanha a quadra escolhida aqui.</p>
            <div class="og-tx-courts" role="radiogroup" aria-label="Quadra transmitida">
              @for (c of courtChips(); track c.id) {
                <button
                  type="button"
                  class="og-tx-court"
                  role="radio"
                  [class.active]="c.id === svc.control().courtId"
                  [attr.aria-checked]="c.id === svc.control().courtId"
                  (click)="selectCourt(c.id)"
                >
                  <span class="og-tx-court-name">{{ c.name }}</span>
                  <span class="og-tx-court-status" [class.live]="c.live">{{ c.status }}</span>
                </button>
              } @empty {
                <p class="og-tx-dica">Este torneio ainda não tem quadras cadastradas.</p>
              }
            </div>
          </og-card>

          <og-card kicker="Reporter" title="Tarja de entrevista">
            @if (onAir()) {
              <div class="og-tx-noar">
                <span class="og-tx-noar-dot" aria-hidden="true"></span>
                <span class="og-tx-noar-txt">{{ onAirText() }}</span>
                <button type="button" class="og-mini-btn" (click)="takeOffAir()">Tirar do ar</button>
              </div>
            }
            @if (quickPicks().length > 0) {
              <div class="og-tx-label">Na quadra agora</div>
              <div class="og-tx-chips">
                @for (c of quickPicks(); track c.key) {
                  <button type="button" class="og-chip" [class.active]="selected()?.key === c.key" (click)="selected.set(c)">{{ c.name }}</button>
                }
              </div>
            }
            <label class="og-tx-label" for="og-tx-busca">Buscar atleta do torneio</label>
            <input
              id="og-tx-busca"
              class="og-input-el og-tx-busca"
              type="search"
              placeholder="Nome do atleta"
              [value]="term()"
              (input)="term.set($any($event.target).value)"
            />
            @for (c of results(); track c.key) {
              <button type="button" class="og-tx-result" [class.active]="selected()?.key === c.key" (click)="selected.set(c)">
                <og-avatar [initials]="initials(c.name)" [photoUrl]="c.photoUrl" [size]="32" />
                <span class="og-tx-result-txt">
                  <span class="og-tx-result-nome">{{ c.name }}</span>
                  <span class="og-tx-result-sub">{{ line(c) }}</span>
                </span>
              </button>
            }
            <div class="og-tx-label">Duração</div>
            <div class="og-tx-chips">
              @for (d of durations; track d.label) {
                <button type="button" class="og-chip" [class.active]="duration() === d.sec" (click)="duration.set(d.sec)">{{ d.label }}</button>
              }
            </div>
            <button type="button" class="og-mini-btn og-mini-btn-primary og-tx-ar" [disabled]="!selected()" (click)="putOnAir()">
              {{ putOnAirLabel() }}
            </button>
          </og-card>
        </div>

        <div class="og-tx-col">
          @for (g of groups(); track g.grupo) {
            <og-card kicker="Gráficos" [title]="g.label">
              @for (item of g.itens; track item.id) {
                <div class="og-toggle-row">
                  <div class="og-toggle-row-text">
                    <div class="og-toggle-row-title">{{ item.nome }}</div>
                    <div class="og-toggle-row-desc">{{ item.descricao }}</div>
                  </div>
                  @if (item.controle === 'chave+agora') {
                    <button type="button" class="og-mini-btn og-tx-agora" [disabled]="!svc.control().graphics[item.id]" (click)="showNow(item.id)">
                      Mostrar agora
                    </button>
                  }
                  <button
                    type="button"
                    class="og-toggle"
                    role="switch"
                    [class.on]="svc.control().graphics[item.id]"
                    [attr.aria-checked]="svc.control().graphics[item.id]"
                    [attr.aria-label]="item.nome"
                    (click)="toggle(item.id)"
                  ></button>
                </div>
              }
              @if (g.grupo === 'koc') {
                <div class="og-tx-label">Tela do fim de rodada</div>
                <div class="og-tx-chips">
                  @for (o of roundEndOptions; track o.value) {
                    <button type="button" class="og-chip" [class.active]="svc.control().kocRoundEndScreen === o.value" (click)="setRoundEndScreen(o.value)">
                      {{ o.label }}
                    </button>
                  }
                </div>
              }
              @if (g.grupo === 'encerramento') {
                <div class="og-tx-label">Visual Grande final</div>
                <div class="og-tx-chips">
                  @for (o of finalOptions; track o.value) {
                    <button type="button" class="og-chip" [class.active]="svc.control().finalMode === o.value" (click)="setFinalMode(o.value)">
                      {{ o.label }}
                    </button>
                  }
                </div>
              }
            </og-card>
          }

          <og-card kicker="Prévia" title="O que está no ar">
            @if (previewOpen()) {
              <div class="og-tx-preview">
                <iframe [src]="previewSrc()" title="Prévia da transmissão"></iframe>
              </div>
              <button type="button" class="og-ghost-btn" (click)="previewOpen.set(false)">Fechar prévia</button>
            } @else {
              <p class="og-tx-dica">A prévia abre a mesma tela do OBS — mostra exatamente o que está no ar.</p>
              <button type="button" class="og-ghost-btn" (click)="previewOpen.set(true)">Abrir prévia</button>
            }
          </og-card>
        </div>
      </div>
    </div>
  `,
  styles: `
    .og-tx {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }
    .og-tx-col {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 0;
    }
    @media (max-width: 1100px) {
      .og-tx {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .og-tx-erro {
      margin: 0 0 16px;
      padding: 10px 14px;
      border-radius: var(--nx-r-3);
      background: rgba(255, 59, 48, 0.12);
      color: var(--nx-live, #ff3b30);
      font-size: 14px;
    }
    .og-tx-url {
      display: block;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      font-size: 13px;
      word-break: break-all;
    }
    .og-tx-dica {
      margin: 10px 0 14px;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-tx-courts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }
    .og-tx-court {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 12px 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-tx-court.active {
      border-color: var(--nx-orange-500);
      box-shadow: 0 0 0 1px var(--nx-orange-500) inset;
    }
    .og-tx-court-name {
      font-weight: 700;
    }
    .og-tx-court-status {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-tx-court-status.live {
      color: var(--nx-live, #ff3b30);
    }
    .og-tx-label {
      display: block;
      margin: 16px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-tx-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-tx-busca {
      height: 44px;
      padding: 0 12px;
    }
    .og-tx-result {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      margin-top: 6px;
      padding: 8px 10px;
      border: 1px solid transparent;
      border-radius: var(--nx-r-3);
      background: transparent;
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-tx-result.active {
      border-color: var(--nx-orange-500);
    }
    .og-tx-result-txt {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .og-tx-result-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-tx-ar {
      width: 100%;
      min-height: 48px;
      margin-top: 18px;
      font-size: 15px;
    }
    .og-tx-noar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: rgba(255, 59, 48, 0.12);
    }
    .og-tx-noar-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--nx-live, #ff3b30);
    }
    .og-tx-noar-txt {
      flex: 1;
      min-width: 0;
    }
    .og-tx-agora {
      margin-right: 10px;
    }
    .og-tx-preview {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      margin-bottom: 12px;
      border-radius: var(--nx-r-3);
      overflow: hidden;
      background: #000;
    }
    .og-tx-preview iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `,
})
export class TransmissaoComponent {
  protected readonly svc = inject(TransmissaoDataService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Preenchido pelo router (`withComponentInputBinding`) a partir de `eventos/:id/transmissao`. */
  readonly id = input.required<string>();

  protected readonly durations = DURATIONS;
  protected readonly roundEndOptions = ROUND_END_OPTIONS;
  protected readonly finalOptions = FINAL_OPTIONS;

  /** Relógio de 1 s: status das quadras e tempo da tarja no ar. */
  private readonly now = signal(Date.now());
  protected readonly term = signal('');
  protected readonly selected = signal<InterviewCandidate | null>(null);
  protected readonly duration = signal<number | null>(20);
  protected readonly copied = signal(false);
  protected readonly previewOpen = signal(typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);

  protected readonly url = computed(() => transmissaoUrl(location.origin, this.id()));
  protected readonly previewSrc = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(`${this.url()}?preview`));

  protected readonly groups = computed(() => {
    const t = this.svc.tournament();
    return t ? broadcastGroupsFor(t) : [];
  });

  /** Jogo do auto-agendamento antigo só gravou `courtId` — o nome sai das quadras do torneio. */
  private readonly matches = computed(() => resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []));

  protected readonly courtChips = computed(() => courtChipsOf(this.svc.tournament()?.courts ?? [], this.matches(), this.now()));

  private readonly candidates = computed(() =>
    interviewCandidatesOf(this.svc.matches(), this.svc.rosters(), this.svc.tournament()?.categories ?? []),
  );
  protected readonly quickPicks = computed(() =>
    quickPicksOf(this.candidates(), courtMatchOf(this.matches(), this.svc.control().courtId, this.now())),
  );
  protected readonly results = computed(() => searchCandidates(this.candidates(), this.term()));

  protected readonly onAir = computed(() => {
    const i = this.svc.control().interview;
    return interviewOnAirAt(i, this.now()) ? i : null;
  });
  protected readonly onAirText = computed(() => {
    const i = this.onAir();
    return i ? `No ar: ${i.name} · ${elapsedLabel(this.now() - i.shownAt)}` : '';
  });
  protected readonly putOnAirLabel = computed(() => {
    const c = this.selected();
    return c ? `Pôr no ar: ${c.name}` : 'Escolha um atleta';
  });

  constructor() {
    effect(() => this.svc.tournamentId.set(this.id()));
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected selectCourt(courtId: string): void {
    void this.svc.save({ courtId });
  }

  protected toggle(id: BroadcastGraphicId): void {
    const graphics: Partial<BroadcastGraphics> = {};
    graphics[id] = !this.svc.control().graphics[id];
    void this.svc.save({ graphics });
  }

  protected showNow(id: BroadcastGraphicId): void {
    const at = Date.now();
    void this.svc.save({ commands: id === 'donation' ? { donationNowAt: at } : { sponsorsNowAt: at } });
  }

  protected setRoundEndScreen(kocRoundEndScreen: KocRoundEndScreen): void {
    void this.svc.save({ kocRoundEndScreen });
  }

  protected setFinalMode(finalMode: BroadcastFinalMode): void {
    void this.svc.save({ finalMode });
  }

  protected putOnAir(): void {
    const c = this.selected();
    if (!c) return;
    void this.svc.save({ interview: interviewFromCandidate(c, this.duration(), Date.now()) });
  }

  protected takeOffAir(): void {
    void this.svc.save({ interview: null });
  }

  protected copyUrl(): void {
    void navigator.clipboard.writeText(this.url()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected initials(name: string): string {
    return initialsOf(name) || '?';
  }

  protected line(c: InterviewCandidate): string {
    return interviewLineOf(c) ?? '';
  }
}
