import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { LigaStore } from './liga.store';

/** Etapas do circuito — o plano da temporada cruzado com os torneios já publicados. Cada
 *  etapa publicada abre o nível de torneio que já existe no painel; etapa só planejada leva
 *  ao wizard de nova etapa. */
@Component({
  selector: 'og-liga-etapas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgPillComponent, OgIconComponent],
  template: `
    <og-page-header title="Etapas" [subtitle]="subtitle()">
      @if (isOpen()) {
        <a class="og-mini-btn og-mini-btn-primary" [routerLink]="[base(), 'nova-etapa']">
          <og-icon name="plus" [size]="14" />Adicionar etapa
        </a>
      }
    </og-page-header>

    <div class="og-content">
      <og-card pad="0">
        <div class="og-table-head">
          <span style="width:44px">#</span>
          <span style="flex:1.3">Etapa</span>
          <span style="flex:1">Local</span>
          <span style="width:120px">Data</span>
          <span style="width:150px">Status</span>
          <span style="width:96px">Inscritos</span>
          <span style="width:120px"></span>
        </div>
        <div class="og-table-body">
          @if (store.loading()) {
            @for (i of [1, 2, 3]; track i) {
              <div class="og-row"><div class="og-skeleton-line" style="width:100%"></div></div>
            }
          } @else {
            @for (row of store.rows(); track row.stageId) {
              <div class="og-row" [class.og-row-muted]="row.status === 'planejada'">
                <span class="og-etapa-order">{{ row.order }}</span>
                <span style="flex:1.3" class="og-etapa-name">
                  {{ row.name }}
                  @if (row.isGrandFinal) {
                    <span class="og-etapa-gf">Grande Final</span>
                  }
                </span>
                <span style="flex:1" class="og-etapa-cell">{{ row.local }}</span>
                <span style="width:120px" class="og-etapa-cell">{{ row.dateLabel }}</span>
                <span style="width:150px"><og-pill [tone]="row.statusTone">{{ row.statusLabel }}</og-pill></span>
                <span style="width:96px" class="og-etapa-cell">
                  {{ row.inscritos ?? '—' }}{{ row.vagas ? '/' + row.vagas : '' }}
                </span>
                <span style="width:120px" class="og-etapa-action">
                  @if (row.tournamentId) {
                    <a class="og-ghost-btn" [routerLink]="['/painel/eventos', row.tournamentId]">Gerenciar</a>
                  } @else if (isOpen()) {
                    <a class="og-ghost-btn" [routerLink]="[base(), 'nova-etapa']">Definir</a>
                  } @else {
                    <span class="og-etapa-cell">—</span>
                  }
                </span>
              </div>
            } @empty {
              <p class="og-empty">Nenhuma etapa no plano da temporada.</p>
            }
          }
        </div>
      </og-card>

      @if (store.error(); as msg) {
        <p class="og-etapa-error">{{ msg }}</p>
      }
    </div>
  `,
  styles: `
    .og-row-muted {
      opacity: 0.62;
    }
    .og-etapa-order {
      width: 44px;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-etapa-name {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text);
    }
    .og-etapa-gf {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      border: 1px solid rgba(255, 106, 26, 0.35);
      border-radius: var(--nx-r-pill);
      padding: 2px 7px;
    }
    .og-etapa-cell {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-etapa-action {
      display: flex;
      justify-content: flex-end;
    }
    .og-etapa-error {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-live);
      margin: 12px 0 0;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 14px 0;
      margin: 0;
    }
    .og-skeleton-line {
      height: 12px;
      border-radius: 4px;
      background: var(--nx-surface-1);
    }
  `,
})
export class LigaEtapasComponent {
  protected readonly store = inject(LigaStore);

  protected readonly base = computed(() => this.store.leagueBase() ?? '/painel/eventos');
  protected readonly isOpen = computed(() => this.store.league()?.listingStatus === 'open');

  protected readonly subtitle = computed(() => {
    const l = this.store.league();
    if (!l) return '';
    const publicadas = this.store.etapasPublicadas();
    const planejadas = l.plannedStagesCount ?? l.stages.length;
    return `${publicadas} de ${planejadas} etapa${planejadas === 1 ? '' : 's'} publicada${publicadas === 1 ? '' : 's'}`;
  });
}
