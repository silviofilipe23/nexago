import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { clubErrorMessage } from './data/club-errors';
import { ClubRepository } from './data/club.repository';
import { payloadWith, sortPartners, type Partner } from './data/partner';
import type { PartnerLead } from './data/partner-lead';
import { ClubConfigCardComponent } from './ui/club-config-card.component';
import { ClubLeadsComponent } from './ui/club-leads.component';
import { ClubMetricsComponent } from './ui/club-metrics.component';
import { PartnersTableComponent, type PartnerActiveChange } from './ui/partners-table.component';

export const CLUB_TABS = [
  { id: 'parceiros', label: 'Parceiros' },
  { id: 'metricas', label: 'Métricas' },
  { id: 'leads', label: 'Leads' },
] as const;
export type ClubTab = (typeof CLUB_TABS)[number]['id'];

/** `?aba=` da URL; ausente ou desconhecida = Parceiros. */
export function clubTabFrom(value: string | null): ClubTab {
  return CLUB_TABS.find((t) => t.id === value)?.id ?? 'parceiros';
}

type LoadState = 'loading' | 'ok' | 'error';

/**
 * App do atleta › Clube de Vantagens Nexa: parceiros (com a liberação do card no Hub), métricas
 * do funil e leads. Parceiro novo aparece no app na hora, sem atualizar o app.
 */
@Component({
  selector: 'bo-panel-clube',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    IconComponent,
    ClubConfigCardComponent,
    PartnersTableComponent,
    ClubMetricsComponent,
    ClubLeadsComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Clube de Vantagens Nexa" subtitle="App do atleta › Clube">
        <a class="bo-mini-btn bo-mini-btn-primary" routerLink="/painel/clube/parceiros/novo">
          <bo-icon name="plus" [size]="13" />
          Novo parceiro
        </a>
      </bo-page-header>

      <nav class="tabs" role="tablist" aria-label="Seções do clube">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" [class.active]="tab() === t.id" (click)="go(t.id)">
            {{ t.label }}
            @if (t.id === 'leads' && leadsState() === 'ok' && leads().length > 0) {
              <span class="count">{{ leads().length }}</span>
            }
          </button>
        }
      </nav>

      <div class="body">
        @if (notice(); as text) {
          <div class="bo-feedback" role="status" aria-live="polite">
            <bo-icon name="check" [size]="15" />
            <span>{{ text }}</span>
          </div>
        }

        @switch (tab()) {
          @case ('parceiros') {
            <bo-club-config-card />

            @if (actionError(); as text) {
              <div class="bo-alert" role="alert">
                <bo-icon name="alert" [size]="16" />
                <span>{{ text }}</span>
              </div>
            }

            <section class="card">
              @if (partnersState() === 'loading') {
                @for (slot of [0, 1, 2]; track slot) {
                  <div class="skeleton-row"></div>
                }
              } @else if (partnersState() === 'error') {
                <div class="bo-alert" role="alert">
                  <bo-icon name="alert" [size]="16" />
                  <span>{{ partnersError() }}</span>
                  <button type="button" class="bo-mini-btn push" (click)="loadPartners()">Tentar de novo</button>
                </div>
              } @else if (partners().length === 0) {
                <div class="empty">
                  <bo-icon name="gift" [size]="20" />
                  <p>Nenhum parceiro ainda</p>
                  <span>Cadastre o primeiro: ele aparece no clube do app na hora.</span>
                  <a class="bo-mini-btn bo-mini-btn-primary" routerLink="/painel/clube/parceiros/novo">
                    <bo-icon name="plus" [size]="13" /> Novo parceiro
                  </a>
                </div>
              } @else {
                <bo-partners-table [partners]="partners()" [busyId]="busyId()" (activeChange)="setActive($event)" />
              }
            </section>
            <p class="note">Parceiro novo aparece no app na hora, sem atualizar o app. Cidades vazias = todas as cidades.</p>
          }
          @case ('metricas') {
            <bo-club-metrics [partners]="partners()" />
          }
          @case ('leads') {
            <bo-club-leads
              [leads]="leads()"
              [loading]="leadsState() === 'loading'"
              [error]="leadsState() === 'error' ? leadsError() : null"
              (retry)="loadLeads()"
            />
          }
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .tabs { display: flex; gap: 22px; padding: 0 32px; border-bottom: 1px solid var(--nx-line); overflow-x: auto; }
    .tabs button { display: inline-flex; align-items: center; gap: 7px; height: 44px; padding: 0; background: none; border: none; border-bottom: 2px solid transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 14px; cursor: pointer; white-space: nowrap; }
    .tabs button.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); font-weight: 700; }
    .tabs button:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .count { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-orange-400); }
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } .tabs { padding: 0 16px; } }
    .bo-alert { margin: 0; align-items: center; }
    .push { margin-left: auto; flex: none; }
    .card { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); padding: 8px 8px; min-width: 0; }
    .note { margin: 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .skeleton-row { height: 64px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); opacity: 0.6; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 0; color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 13px; color: var(--nx-text); }
    .empty span { font-size: 12px; }
    .empty a { margin-top: 6px; }
  `,
})
export class PanelClubeComponent {
  private readonly repository = inject(ClubRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs = CLUB_TABS;
  protected readonly tab = toSignal(this.route.queryParamMap.pipe(map((p) => clubTabFrom(p.get('aba')))), {
    initialValue: clubTabFrom(this.route.snapshot.queryParamMap.get('aba')),
  });

  protected readonly partnersState = signal<LoadState>('loading');
  protected readonly partnersError = signal('');
  private readonly rawPartners = signal<Partner[]>([]);
  protected readonly partners = computed(() => sortPartners(this.rawPartners()));
  protected readonly busyId = signal<string | null>(null);
  protected readonly actionError = signal('');
  protected readonly notice = signal('');

  protected readonly leadsState = signal<LoadState>('loading');
  protected readonly leadsError = signal('');
  protected readonly leads = signal<PartnerLead[]>([]);

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    });
    void this.loadPartners();
    void this.loadLeads();
  }

  protected go(tab: ClubTab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba: tab === 'parceiros' ? null : tab },
      replaceUrl: true,
    });
  }

  async loadPartners(): Promise<void> {
    this.partnersState.set('loading');
    try {
      this.rawPartners.set(await this.repository.partners());
      this.partnersState.set('ok');
    } catch (error) {
      this.partnersError.set(clubErrorMessage(error));
      this.partnersState.set('error');
    }
  }

  async loadLeads(): Promise<void> {
    this.leadsState.set('loading');
    try {
      this.leads.set(await this.repository.leads());
      this.leadsState.set('ok');
    } catch (error) {
      this.leadsError.set(clubErrorMessage(error));
      this.leadsState.set('error');
    }
  }

  /** O toggle grava o doc inteiro, validado como no editor (a rule confere todos os campos). */
  protected async setActive({ partner, active }: PartnerActiveChange): Promise<void> {
    this.actionError.set('');
    const payload = payloadWith(partner, { active });
    if ('error' in payload) {
      this.actionError.set(`${partner.name}: ${payload.error} Abra Editar para completar o cadastro.`);
      return;
    }
    this.busyId.set(partner.id);
    try {
      await this.repository.updatePartner(partner.id, payload);
      this.rawPartners.update((list) => list.map((p) => (p.id === partner.id ? { ...p, active } : p)));
      this.showNotice(active ? `${partner.name} está no clube.` : `${partner.name} saiu do clube.`);
    } catch (error) {
      this.actionError.set(clubErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3000);
  }
}
