import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OG_EVENTOS, OG_STATUS_LABEL, OG_STATUS_TONE, type OgEvento } from '../data/mock-data';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tab = 'todos' | 'ativos' | 'encerrados';

/** Lista de ligas e torneios organizados, com progresso de inscrição e arrecadação. */
@Component({
  selector: 'og-eventos-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent],
  template: `
    <og-page-header title="Meus eventos" subtitle="Ligas e torneios que você organiza">
      <a class="og-mini-btn og-mini-btn-primary" routerLink="/painel/novo-torneio"><og-icon name="plus" [size]="14" />Criar evento</a>
    </og-page-header>

    <div class="og-content">
      <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />

      <div class="og-eventos-grid">
        @for (e of list(); track e.id) {
          <a class="og-evento-card" [routerLink]="['/painel/eventos', e.id]">
            <div class="og-evento-card-top">
              <span class="og-evento-card-icon"><og-icon name="trophy" [size]="19" /></span>
              <og-pill [tone]="statusTone[e.status]">{{ statusLabel[e.status] }}</og-pill>
            </div>
            <div>
              <div class="og-evento-card-name">{{ e.name }}</div>
              <div class="og-evento-card-meta">{{ e.kind }} · {{ e.sport }} · {{ e.inicio }} – {{ e.fim }}</div>
            </div>
            <div>
              <div class="og-evento-card-progress-row">
                <span>Inscritos</span>
                <span class="val">{{ e.inscritos }}/{{ e.vagas }}</span>
              </div>
              <div class="og-progress"><span [style.width.%]="(e.inscritos / e.vagas) * 100"></span></div>
            </div>
            <div class="og-evento-card-footer">
              <div>
                <div class="og-evento-card-footer-label">Arrecadado</div>
                <div class="og-evento-card-footer-value">R$ {{ e.receita.toLocaleString('pt-BR') }}</div>
              </div>
              <span class="og-ghost-btn">Gerenciar</span>
            </div>
          </a>
        }
      </div>
    </div>
  `,
  styles: `
    .og-eventos-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-evento-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }
    .og-evento-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .og-evento-card-icon {
      width: 42px;
      height: 42px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }
    .og-evento-card-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-evento-card-meta {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }
    .og-evento-card-progress-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 6px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-evento-card-progress-row .val {
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-evento-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 10px;
      border-top: 1px solid var(--nx-line);
    }
    .og-evento-card-footer-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .og-evento-card-footer-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 2px;
    }
  `,
})
export class EventosListComponent {
  protected readonly tabs = ['todos', 'ativos', 'encerrados'];
  protected readonly tab = signal<Tab>('todos');
  protected readonly statusTone = OG_STATUS_TONE;
  protected readonly statusLabel = OG_STATUS_LABEL;

  protected readonly list = computed<OgEvento[]>(() => {
    const t = this.tab();
    if (t === 'ativos') return OG_EVENTOS.filter((e) => e.status !== 'concluido');
    if (t === 'encerrados') return OG_EVENTOS.filter((e) => e.status === 'concluido');
    return OG_EVENTOS;
  });
}
