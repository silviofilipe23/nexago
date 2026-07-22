import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  CLUB_STATUS_LABEL,
  clubScheduleLabel,
  formatReais,
  type ArenaClub,
  type ArenaClubStatus,
} from './club.model';
import { fetchClubs } from './clubs-repository';

const STATUS_TONE: Record<ArenaClubStatus, PillTone> = {
  active: 'green',
  paused: 'yellow',
  archived: 'dim',
};

/** Lista de clubinhos (jogo aberto): série semanal + sessões avulsas, lista pública com
 *  PIX antecipado. Gate `clubinho` (Pro/Parceiro) no padrão de `panel-promotions`. */
@Component({
  selector: 'ar-panel-clubs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Clubinho" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="createClub()">
          <ar-icon name="plus" [size]="14" />
          Novo clubinho
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando clubinhos…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (showPaywall()) {
          <ar-panel-card pad="lg">
            <p class="paywall-title">Clubinho é um recurso dos planos Pro e Parceiro</p>
            <p class="state-text">
              Substitua a lista do WhatsApp: os atletas entram na lista do jogo aberto e pagam
              PIX antecipado pela plataforma. Fale com o suporte para fazer upgrade.
            </p>
          </ar-panel-card>
        } @else {
          @if (readOnly()) {
            <div class="readonly-banner">Seu plano atual não inclui o Clubinho — fale com o suporte para fazer upgrade.</div>
          }

          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Clubinhos ativos</div>
              <div class="summary-value">{{ activeCount() }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="clubs().length + ' no total'" title="Clubinhos" class="table-card">
            <div class="table-head">
              <span>Clubinho</span>
              <span>Recorrência</span>
              <span>Quadras</span>
              <span>Vagas</span>
              <span>Valor</span>
              <span>Status</span>
              <span></span>
            </div>
            <div class="table-list">
              @for (club of clubs(); track club.id) {
                <div class="table-row">
                  <div>
                    <div class="club-name">{{ club.name }}</div>
                    @if (club.description) {
                      <div class="club-desc">{{ club.description }}</div>
                    }
                  </div>
                  <div class="mono-cell">{{ scheduleLabel(club) }}</div>
                  <div class="mono-cell">{{ club.courtNames.length }} quadra{{ club.courtNames.length === 1 ? '' : 's' }}</div>
                  <div class="mono-cell">{{ club.capacity }}</div>
                  <div class="club-price">{{ formatReais(club.priceReais) }}</div>
                  <div><ar-pill [tone]="statusTone[club.status]">{{ statusLabel[club.status] }}</ar-pill></div>
                  <div class="row-actions">
                    <button type="button" class="ar-mini-btn" (click)="openClub(club.id)">
                      Abrir
                      <ar-icon name="chevron-right" [size]="13" />
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="state-text empty-text">
                  Nenhum clubinho ainda. Crie o primeiro e compartilhe a lista com seus atletas.
                </p>
              }
            </div>
          </ar-panel-card>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .empty-text {
      margin: 12px 0;
    }

    .paywall-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .readonly-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
      max-width: 240px;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.8fr 180px 110px 70px 90px 100px 90px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .club-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .club-desc {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mono-cell {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .club-price {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-orange-500);
    }

    .row-actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class PanelClubsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  protected readonly formatReais = formatReais;
  protected readonly scheduleLabel = clubScheduleLabel;
  protected readonly statusLabel = CLUB_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('clubinho'));

  protected readonly clubs = signal<ArenaClub[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly activeCount = computed(() => this.clubs().filter((c) => c.status === 'active').length);
  protected readonly showPaywall = computed(() => this.readOnly() && this.clubs().length === 0);

  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · jogo aberto com lista e PIX antecipado`,
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.clubs.set(await fetchClubs(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar os clubinhos.');
    } finally {
      this.loading.set(false);
    }
  }

  protected createClub(): void {
    if (this.readOnly()) return;
    this.router.navigate(['/painel/clubinho/novo']);
  }

  protected openClub(id: string): void {
    this.router.navigate(['/painel/clubinho', id]);
  }
}
