import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  interviewOnAirAt,
  type BroadcastFinalMode,
  type BroadcastGraphicId,
  type BroadcastGraphics,
  type KocRoundEndScreen,
} from '../data/broadcast-control';
import { resolveCourtNames } from '../data/matches-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { broadcastGroupsFor } from './broadcast-graphics';
import { TransmissaoDataService } from './transmissao-data.service';
import { TransmissaoEntrevistaComponent } from './transmissao-entrevista.component';
import { courtChipsOf, transmissaoUrl } from './transmissao-selectors';

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
  imports: [OgPageHeaderComponent, OgCardComponent, TransmissaoEntrevistaComponent, RouterLink],
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

          <og-tx-entrevista />
        </div>

        <div class="og-tx-col">
          @for (g of groups(); track g.grupo) {
            <og-card kicker="Gráficos" [title]="g.label">
              @for (item of g.itens; track item.id) {
                <div class="og-toggle-row">
                  <div class="og-toggle-row-text">
                    <div class="og-toggle-row-title">{{ item.nome }}</div>
                    @if (item.id === 'sponsors' && semPatrocinador()) {
                      <div class="og-toggle-row-desc og-tx-aviso">
                        <span>Nenhum patrocinador cadastrado —</span>
                        <a [routerLink]="['/eventos', id()]">cadastrar na página do torneio</a>
                      </div>
                    } @else {
                      <div class="og-toggle-row-desc">{{ item.descricao }}</div>
                    }
                  </div>
                  @if (item.controle === 'chave+agora') {
                    <button
                      type="button"
                      class="og-mini-btn og-tx-agora"
                      [disabled]="!svc.control().graphics[item.id] || onAir() != null || (item.id === 'sponsors' && semPatrocinador())"
                      [attr.title]="agoraTitle(item.id)"
                      (click)="showNow(item.id)"
                    >
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
    .og-tx-aviso {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      color: var(--nx-orange-400, #ff8a4a);
    }
    .og-tx-aviso a {
      color: inherit;
      text-decoration: underline;
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

  protected readonly roundEndOptions = ROUND_END_OPTIONS;
  protected readonly finalOptions = FINAL_OPTIONS;

  /** Relógio de 1 s: status das quadras e tarja no ar. */
  private readonly now = signal(Date.now());
  protected readonly copied = signal(false);
  protected readonly previewOpen = signal(typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);

  protected readonly url = computed(() => transmissaoUrl(location.origin, this.id()));
  protected readonly previewSrc = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(`${this.url()}?preview`));

  protected readonly groups = computed(() => {
    const t = this.svc.tournament();
    return t ? broadcastGroupsFor(t, this.svc.matches()) : [];
  });

  /** Jogo do auto-agendamento antigo só gravou `courtId` — o nome sai das quadras do torneio. */
  private readonly matches = computed(() => resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []));

  protected readonly courtChips = computed(() => courtChipsOf(this.svc.tournament()?.courts ?? [], this.matches(), this.now()));

  /** O card "Oferecimento" só tem o que mostrar com patrocinador cadastrado no torneio — sem
   *  isso o "Mostrar agora" gravava o comando e o ar não mudava, sem explicar por quê. */
  protected readonly semPatrocinador = computed(() => (this.svc.tournament()?.sponsors ?? []).length === 0);

  protected readonly onAir = computed(() => {
    const i = this.svc.control().interview;
    return interviewOnAirAt(i, this.now()) ? i : null;
  });
  constructor() {
    effect(() => this.svc.tournamentId.set(this.id()));
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected agoraTitle(id: BroadcastGraphicId): string | null {
    if (this.onAir()) return 'A tarja está no ar — tire a tarja pra mostrar';
    if (id === 'sponsors' && this.semPatrocinador()) return 'Cadastre patrocinadores na página do torneio';
    return null;
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

  protected copyUrl(): void {
    void navigator.clipboard.writeText(this.url()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
