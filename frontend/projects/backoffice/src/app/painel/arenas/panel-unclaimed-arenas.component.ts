import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { UnclaimedArenasRepository, type UnclaimedArenaRow } from './data/unclaimed-arenas.repository';

type LoadState = 'loading' | 'ok' | 'error';

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Arenas pré-cadastradas e quantos atletas já as procuraram pela nexaGO.
 *
 * É a tela que o comercial abre antes de ligar para a arena: o número de
 * atletas distintos é o argumento ("X pessoas já quiseram jogar aí por nós").
 */
@Component({
  selector: 'bo-panel-unclaimed-arenas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    PillComponent,
    IconComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Arenas pré-cadastradas" [subtitle]="subtitle()">
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </bo-page-header>

      <div class="body">
        <div class="kpi-grid">
          <bo-kpi-mini label="Arenas na busca" [value]="arenasLabel()" />
          <bo-kpi-mini label="Atletas que procuraram" [value]="athletesLabel()" tone="green" />
          <bo-kpi-mini label="Cliques totais" [value]="clicksLabel()" />
          <bo-kpi-mini label="Já geraram contato" [value]="withContactLabel()" />
        </div>

        <bo-panel-card pad="sm" kicker="arenas com unclaimed: true" title="Ranking de procura">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            <div class="table-head">
              <span>Arena</span>
              <span>Cidade</span>
              <span class="right">Atletas</span>
              <span class="right">Cliques</span>
              <span>Último contato</span>
              <span>Últimos 30 dias</span>
              <span></span>
            </div>

            <div>
              @for (arena of rows(); track arena.id) {
                <div class="table-row">
                  <div class="cell-name">{{ arena.name }}</div>
                  <div class="cell-city">{{ arena.city || '—' }}</div>
                  <div class="right">
                    @if (arena.contactAthletesCount > 0) {
                      <bo-pill tone="green">{{ arena.contactAthletesCount }}</bo-pill>
                    } @else {
                      <span class="cell-dim">0</span>
                    }
                  </div>
                  <div class="right cell-num">{{ arena.contactClicksTotal || '—' }}</div>
                  <div class="cell-dim">{{ formatDate(arena.lastClickAt) }}</div>
                  <div>
                    @if (recent()[arena.id] !== undefined) {
                      <span class="cell-num">{{ recent()[arena.id] }} atleta(s)</span>
                    } @else if (arena.contactAthletesCount > 0) {
                      <button
                        type="button"
                        class="bo-mini-btn"
                        [disabled]="loadingRecentId() === arena.id"
                        (click)="loadRecent(arena.id)"
                      >
                        {{ loadingRecentId() === arena.id ? 'Contando…' : 'Calcular' }}
                      </button>
                    } @else {
                      <span class="cell-dim">—</span>
                    }
                  </div>
                  <div class="right">
                    <button
                      type="button"
                      class="bo-mini-btn danger"
                      [disabled]="removingId() === arena.id"
                      (click)="remove(arena)"
                    >
                      {{ removingId() === arena.id ? 'Removendo…' : 'Remover' }}
                    </button>
                  </div>
                </div>
              } @empty {
                @if (state() === 'loading') {
                  <p class="status">Carregando arenas pré-cadastradas…</p>
                } @else {
                  <p class="status">
                    Nenhuma arena pré-cadastrada neste projeto. Rode
                    <code>node scripts/seed-unclaimed-arenas.js --project &lt;projectId&gt; --yes</code>
                    na pasta <code>functions/</code>.
                  </p>
                }
              }
            </div>
          }
        </bo-panel-card>
      </div>
    </bo-panel-shell>
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

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .status {
      margin: 16px 0 4px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
      line-height: 1.6;
    }

    .status code {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .retry {
      align-self: flex-start;
      margin-top: 14px;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 2fr 1.4fr 84px 84px 120px 140px 110px;
      gap: 8px;
      align-items: center;
    }

    .table-head {
      padding: 0 4px 10px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-head span.right {
      text-align: right;
    }

    .table-row {
      padding: 11px 4px;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row .right {
      text-align: right;
    }

    .cell-name {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-city {
      min-width: 0;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-num {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .cell-dim {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .bo-mini-btn.danger {
      color: var(--nx-loss);
      border-color: rgba(233, 79, 79, 0.35);
    }

    @media (max-width: 720px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelUnclaimedArenasComponent {
  private readonly repository = inject(UnclaimedArenasRepository);

  protected readonly rows = signal<readonly UnclaimedArenaRow[]>([]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly recent = signal<Record<string, number>>({});
  protected readonly loadingRecentId = signal<string | null>(null);
  protected readonly removingId = signal<string | null>(null);

  constructor() {
    void this.reload();
  }

  protected readonly totalAthletes = computed(() =>
    this.rows().reduce((sum, a) => sum + a.contactAthletesCount, 0),
  );

  protected readonly totalClicks = computed(() =>
    this.rows().reduce((sum, a) => sum + a.contactClicksTotal, 0),
  );

  protected readonly withContactCount = computed(
    () => this.rows().filter((a) => a.contactAthletesCount > 0).length,
  );

  /** `bo-kpi-mini` recebe string — '—' quando a carga falhou, como nas outras telas. */
  private label(value: () => number): string {
    return this.state() === 'error' ? '—' : String(value());
  }

  protected readonly arenasLabel = computed(() => this.label(() => this.rows().length));
  protected readonly athletesLabel = computed(() => this.label(this.totalAthletes));
  protected readonly clicksLabel = computed(() => this.label(this.totalClicks));
  protected readonly withContactLabel = computed(() => this.label(this.withContactCount));

  protected readonly subtitle = computed(() => {
    if (this.state() === 'loading') {
      return 'Carregando…';
    }
    const athletes = this.totalAthletes();
    if (athletes === 0) {
      return 'Ainda sem contatos registrados';
    }
    return `${athletes} atleta(s) já procuraram uma dessas arenas pela nexaGO`;
  });

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      this.rows.set(await this.repository.listUnclaimedArenas());
      this.recent.set({});
      this.state.set('ok');
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Não foi possível carregar as arenas.',
      );
      this.state.set('error');
    }
  }

  protected async loadRecent(arenaId: string): Promise<void> {
    this.loadingRecentId.set(arenaId);
    try {
      const count = await this.repository.countRecentAthletes(arenaId);
      this.recent.update((map) => ({ ...map, [arenaId]: count }));
    } catch {
      // Silencioso: é um número de apoio. O total continua na linha.
    } finally {
      this.loadingRecentId.set(null);
    }
  }

  protected async remove(arena: UnclaimedArenaRow): Promise<void> {
    const ok = confirm(
      `Remover "${arena.name}" da busca dos atletas?\n\n` +
        'O histórico de contatos dessa arena é apagado junto e não dá para desfazer.',
    );
    if (!ok) {
      return;
    }
    this.removingId.set(arena.id);
    try {
      await this.repository.removeUnclaimedArena(arena.id);
      this.rows.update((rows) => rows.filter((r) => r.id !== arena.id));
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Não foi possível remover a arena.',
      );
      this.state.set('error');
    } finally {
      this.removingId.set(null);
    }
  }

  protected formatDate(value: Date | null): string {
    return value == null ? '—' : DATE_FORMAT.format(value);
  }
}
