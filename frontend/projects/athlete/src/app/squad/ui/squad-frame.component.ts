import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { NxBannerComponent } from '../../shared/feedback';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { contractNotice } from '../data/squad-model';
import { SquadStore } from '../data/squad.store';
import { SquadTierComponent } from './squad-tier.component';

export type SquadTab = 'painel' | 'ganhos' | 'nivel';

/**
 * Moldura das telas do Squad: casca do portal, cabeçalho "NexaGO Squad" com o nível e as abas
 * (só para embaixador), aviso de contrato e os estados de carga/erro. O conteúdo de cada aba vem
 * projetado e se guarda sozinho com `@if (store.ambassador())`.
 *
 * Os estilos dos blocos do Squad (`.sq-box`, `.sq-stat`…) moram aqui sem encapsulamento: as três
 * abas e o "Entrar" usam os mesmos, e o prefixo `sq-` os mantém fora do resto do portal.
 */
@Component({
  selector: 'app-squad-frame',
  imports: [AtPanelShellComponent, RouterLink, NxBannerComponent, NxPageLoadingComponent, SquadTierComponent],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <header class="sq-header">
        <h1 class="sq-title">NexaGO Squad</h1>
        @if (store.ambassador(); as a) {
          <div class="sq-header-right">
            <app-squad-tier [tier]="a.contract.tier" />
            <nav class="sq-tabs" aria-label="Seções do Squad">
              <a routerLink="/squad" class="sq-tab" [class.sq-tab--on]="tab() === 'painel'" [attr.aria-current]="tab() === 'painel' ? 'page' : null">Painel</a>
              <a routerLink="/squad/ganhos" class="sq-tab" [class.sq-tab--on]="tab() === 'ganhos'" [attr.aria-current]="tab() === 'ganhos' ? 'page' : null">Ganhos</a>
              <a routerLink="/squad/nivel" class="sq-tab" [class.sq-tab--on]="tab() === 'nivel'" [attr.aria-current]="tab() === 'nivel' ? 'page' : null">Nível &amp; benefícios</a>
            </nav>
          </div>
        }
      </header>

      @if (notice(); as n) {
        <app-nx-banner class="sq-notice" [tone]="n.tone">{{ n.text }}</app-nx-banner>
      }

      <div class="sq-body">
        @if (store.loading() && !store.view()) {
          <app-nx-page-loading title="Carregando o Squad…" subtitle="Código, ganhos e nível" />
        } @else if (!store.view()) {
          <section class="sq-box sq-error" role="alert">
            <h2 class="sq-h">Não deu pra abrir o Squad</h2>
            <p class="sq-muted">{{ store.error() }}</p>
            <button type="button" class="sq-btn sq-btn--soft" (click)="retry()">Tentar de novo</button>
          </section>
        } @else {
          <ng-content />
        }
      </div>
    </app-at-panel-shell>
  `,
  styleUrl: './squad-frame.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadFrameComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly store = inject(SquadStore);

  readonly tab = input<SquadTab | null>(null);
  /** Ganhos e Nível: quem não é embaixador volta para "Entrar no Squad". */
  readonly ambassadorOnly = input(false);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly notice = computed(() => {
    const a = this.store.ambassador();
    return a ? contractNotice(a.contract) : null;
  });

  constructor() {
    this.store.ensureLoaded();
    effect(() => {
      if (this.ambassadorOnly() && this.store.candidate()) void this.router.navigateByUrl('/squad', { replaceUrl: true });
    });
  }

  protected retry(): void {
    void this.store.reload();
  }
}
