import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { listMatches } from '../data/matches-repository';
import { cancelTournament, closeTournamentRegistrations } from '../data/organizer-ops.service';
import type { OrganizerTournament, OrganizerTournamentStatus } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

const STATUS_LABEL: Record<OrganizerTournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

interface CategoriaRow {
  id: string;
  name: string;
  taken: number;
  total: number | null;
  pagas: number;
  pend: number;
  full: boolean;
  /** Chave já sorteada (categoria com jogos) — regerar apagaria resultados. */
  hasMatches: boolean;
}

/** Visão geral do torneio — hub do nível 2 da cascata: KPIs + grade de categorias,
 *  onde o organizador seleciona a categoria pra descer ao nível 3 (operação). As telas
 *  de inscritos e jogos que viviam em abas aqui viraram itens da sidebar contextual. */
@Component({
  selector: 'og-torneio-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgIconComponent, OgPillComponent, NxSpinnerComponent],
  template: `
    <og-page-header [title]="tournament()?.name ?? 'Torneio'" [subtitle]="headerSubtitle()">
      @if (tournament(); as t) {
        @if (t.status === 'inscricoes') {
          <button type="button" class="og-ghost-btn" [disabled]="acting()" (click)="closeRegistrations()">
            @if (actingKind() === 'close') {
              <app-nx-spinner [size]="12" />
            }
            {{ actingKind() === 'close' ? 'Encerrando…' : 'Encerrar inscrições' }}
          </button>
        }
        @if (t.status !== 'cancelado' && t.status !== 'concluido') {
          <button type="button" class="og-ghost-btn og-torneio-danger" [disabled]="acting()" (click)="cancel()">
            @if (actingKind() === 'cancel') {
              <app-nx-spinner [size]="12" />
            }
            {{ actingKind() === 'cancel' ? 'Cancelando…' : 'Cancelar torneio' }}
          </button>
        }
        <a class="og-mini-btn" routerLink="/painel/novo-torneio" [queryParams]="{ editar: t.id }"><og-icon name="edit" [size]="14" />Editar torneio</a>
      }
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando torneio…</div>
      } @else if (!tournament()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Torneio não encontrado.</div>
      } @else {
        @if (tournament()!.coverUrl && !coverFailed()) {
          <div class="og-torneio-hero" aria-hidden="true">
            <img [src]="tournament()!.coverUrl" alt="" (error)="coverFailed.set(true)" />
          </div>
        }
        @if (feedback(); as fb) {
          <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
        }
        <div class="og-kpi-row og-torneio-kpis" [class.over-hero]="tournament()!.coverUrl && !coverFailed()">
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Inscritos</div>
            <div class="og-kpi-value sm">{{ inscritosCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Pendentes</div>
            <div class="og-kpi-value sm" style="color:var(--nx-pending)">{{ pendentesCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Categorias</div>
            <div class="og-kpi-value sm">{{ categoriasCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Arrecadado</div>
            <!-- mock (fase 2): arrecadação por torneio fica no Financeiro (Task O7); sem dado real aqui ainda -->
            <div class="og-kpi-value sm" style="color:var(--nx-win)">—</div>
          </div>
        </div>

        <div class="og-torneio-cats-head">
          <div>
            <div class="og-torneio-cats-kicker">CATEGORIAS · passo 2</div>
            <div class="og-torneio-cats-title">Categorias — selecione para gerenciar</div>
          </div>
          <div class="og-page-header-spacer"></div>
          <!-- mock (fase 2): adicionar categoria depois do torneio criado ainda não existe no app -->
          <button type="button" class="og-ghost-btn"><og-icon name="plus" [size]="13" />Adicionar categoria</button>
        </div>

        <div class="og-torneio-cats-grid">
          @for (c of categoriaRows(); track c.id) {
            <div class="og-torneio-cat" [class.highlight]="c.full">
              <a class="og-torneio-cat-body" [routerLink]="['/painel/eventos', id(), 'categorias', c.id]">
                <div class="og-torneio-cat-top">
                  <div class="og-torneio-cat-name">{{ c.name }}</div>
                  <og-pill [tone]="c.total == null ? 'dim' : c.full ? 'green' : 'orange'">
                    {{ c.total == null ? 'Sem limite' : c.full ? 'Lotado' : 'Abertas' }}
                  </og-pill>
                </div>
                @if (c.total != null) {
                  <div class="og-torneio-cat-progress">
                    <div class="row">
                      <span class="frac">{{ c.taken }}<em>/{{ c.total }} duplas</em></span>
                      <span class="pct" [style.color]="c.full ? 'var(--nx-win)' : 'var(--nx-orange-500)'">{{ pct(c) }}%</span>
                    </div>
                    <div class="og-progress" [class.win]="c.full"><span [style.width.%]="pct(c)"></span></div>
                  </div>
                } @else {
                  <div class="og-torneio-cat-progress">
                    <div class="row"><span class="frac">{{ c.taken }}<em> duplas inscritas</em></span></div>
                  </div>
                }
                <div class="og-torneio-cat-footer">
                  <span class="paid">{{ c.pagas }} pagas</span>
                  @if (c.pend > 0) {
                    <span class="pend">{{ c.pend }} pend.</span>
                  }
                </div>
              </a>
              <div class="og-torneio-cat-cta">
                <a class="og-torneio-cat-cta-link" [routerLink]="['/painel/eventos', id(), 'categorias', c.id]">
                  Gerenciar categoria
                  <og-icon name="chevron" [size]="13" />
                </a>
                <div class="og-page-header-spacer"></div>
                <!-- Some quando a chave já foi gerada (categoria com jogos) — regerar apagaria resultados. -->
                @if (c.full && !c.hasMatches) {
                  <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', c.id, 'seeds']">
                    <og-icon name="bracket" [size]="13" />Gerar chave
                  </a>
                }
              </div>
            </div>
          } @empty {
            <p class="og-empty">Nenhuma categoria cadastrada ainda</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    /* ── Hero de capa — background full-bleed que desvanece no fundo da página ──
       Margens negativas cancelam o padding do .og-content (22px 32px) e puxam a
       linha de KPIs 60px pra cima (gap 18 − 78), fazendo os cards flutuarem sobre
       a foto. Altura fixa: nada de layout shift quando a imagem chega. */
    .og-torneio-hero {
      position: relative;
      z-index: 0;
      height: 236px;
      flex: none;
      margin: -22px -32px -78px;
      overflow: hidden;
      pointer-events: none;
    }
    .og-torneio-hero img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transform-origin: 50% 30%;
    }
    /* Scrim: vinheta no topo (profundidade sob o cabeçalho) + fade pro fundo da
       página embaixo, onde os KPIs pousam. */
    .og-torneio-hero::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      background:
        linear-gradient(180deg, rgba(10, 10, 10, 0.62), rgba(10, 10, 10, 0.14) 36%, transparent 58%),
        linear-gradient(180deg, transparent 42%, var(--nx-bg) 97%);
    }
    /* Brilho ambiente laranja — assinatura da marca emergindo do canto inferior. */
    .og-torneio-hero::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      background: radial-gradient(72% 88% at 10% 100%, rgba(255, 106, 26, 0.2), transparent 62%);
    }
    /* Animação premium: revelação com "settle" de zoom + deriva Ken Burns lenta
       contínua — só transform/opacity (GPU), e nada disso com reduced-motion. */
    @media (prefers-reduced-motion: no-preference) {
      .og-torneio-hero img {
        opacity: 0;
        animation:
          og-hero-reveal 1100ms var(--nx-ease-out) 60ms forwards,
          og-hero-drift 38s ease-in-out 1200ms infinite alternate;
      }
    }
    @keyframes og-hero-reveal {
      from {
        opacity: 0;
        transform: scale(1.06);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    @keyframes og-hero-drift {
      from {
        transform: scale(1);
      }
      to {
        transform: scale(1.07) translateY(-6px);
      }
    }
    /* KPIs e banner de feedback pousam SOBRE a área do hero. */
    .og-torneio-kpis {
      position: relative;
      z-index: 2;
    }
    .og-torneio-kpis.over-hero .og-card {
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);
    }
    .og-banner {
      position: relative;
      z-index: 2;
    }
    .og-torneio-cats-head {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
    }
    .og-torneio-cats-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-torneio-cats-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 3px;
    }
    .og-torneio-cats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-torneio-cat {
      border-radius: var(--nx-r-3);
      overflow: hidden;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      transition: border-color 140ms var(--nx-ease-out);
    }
    .og-torneio-cat:hover {
      border-color: var(--nx-line-strong);
    }
    .og-torneio-cat.highlight {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-torneio-cat-body {
      padding: 16px;
      flex: 1;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }
    .og-torneio-cat-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .og-torneio-cat-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-torneio-cat-progress {
      margin-top: 14px;
    }
    .og-torneio-cat-progress .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .og-torneio-cat-progress .frac {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-torneio-cat-progress .frac em {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-torneio-cat-progress .pct {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
    }
    .og-torneio-cat-footer {
      margin-top: 14px;
      padding-top: 13px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-weight: 700;
    }
    .og-torneio-cat-footer .paid {
      color: var(--nx-win);
    }
    .og-torneio-cat-footer .pend {
      color: var(--nx-pending);
    }
    .og-torneio-cat-cta {
      padding: 11px 16px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .og-torneio-cat.highlight .og-torneio-cat-cta {
      border-top-color: rgba(255, 106, 26, 0.2);
    }
    .og-torneio-cat-cta-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-orange-500);
      text-decoration: none;
    }
    .og-torneio-cat-cta-link:hover {
      text-decoration: underline;
    }
    .og-empty {
      grid-column: 1 / -1;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-torneio-danger {
      color: var(--nx-live);
    }
  `,
})
export class TorneioDetalheComponent {
  readonly id = input<string>('');

  protected readonly loading = signal(true);
  protected readonly acting = signal(false);
  /** Qual ação de header está em andamento — o botão certo mostra spinner/rótulo. */
  protected readonly actingKind = signal<'close' | 'cancel' | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly inscriptions = signal<TournamentInscription[]>([]);
  /** Ids das categorias que já têm jogos gerados — controlam a oferta de "Gerar chave". */
  protected readonly categoriesWithMatches = signal<ReadonlySet<string>>(new Set<string>());
  /** Capa falhou ao carregar — o banner some (a página funciona igual sem ele). */
  protected readonly coverFailed = signal(false);

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const local = t.location ?? t.city ?? 'Local a definir';
    return `Torneio · ${local} · ${this.dateRangeLabel(t.startAt, t.endAt)} · ${STATUS_LABEL[t.status]}`;
  });

  protected readonly inscritosCount = computed(() => this.inscriptions().length);
  protected readonly pendentesCount = computed(() => this.inscriptions().filter((i) => !i.paid).length);
  protected readonly categoriasCount = computed(() => this.tournament()?.categories.length ?? 0);

  protected readonly categoriaRows = computed<CategoriaRow[]>(() => {
    const t = this.tournament();
    if (!t) return [];
    const insc = this.inscriptions();
    const withMatches = this.categoriesWithMatches();
    return t.categories.map((c) => {
      const rows = insc.filter((i) => i.categoryId === c.id);
      const pagas = rows.filter((r) => r.paid).length;
      return {
        id: c.id,
        name: c.name,
        taken: rows.length,
        total: c.maxTeams,
        pagas,
        pend: rows.length - pagas,
        full: c.maxTeams != null && rows.length >= c.maxTeams,
        hasMatches: withMatches.has(c.id),
      };
    });
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.inscriptions.set([]);
      this.categoriesWithMatches.set(new Set<string>());
      this.coverFailed.set(false);
      if (!tid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid);
    });
  }

  private async load(tid: string): Promise<void> {
    try {
      const [tournament, inscriptions, matches] = await Promise.all([getTournament(tid), listInscriptions(tid), listMatches(tid)]);
      this.tournament.set(tournament);
      this.inscriptions.set(inscriptions);
      this.categoriesWithMatches.set(new Set(matches.map((m) => m.categoryId).filter((cid): cid is string => cid != null)));
    } finally {
      this.loading.set(false);
    }
  }

  protected async closeRegistrations(): Promise<void> {
    const t = this.tournament();
    if (!t || this.acting()) return;
    if (!confirm('Encerrar as inscrições de todas as categorias deste torneio?')) return;
    this.acting.set(true);
    this.actingKind.set('close');
    this.feedback.set(null);
    try {
      await closeTournamentRegistrations(t.id);
      this.feedback.set({ ok: true, message: 'Inscrições encerradas.' });
      await this.load(t.id);
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao encerrar inscrições.' });
    } finally {
      this.acting.set(false);
      this.actingKind.set(null);
    }
  }

  protected async cancel(): Promise<void> {
    const t = this.tournament();
    if (!t || this.acting()) return;
    if (!confirm(`Cancelar "${t.name}"? Os atletas inscritos serão notificados.`)) return;
    this.acting.set(true);
    this.actingKind.set('cancel');
    this.feedback.set(null);
    try {
      await cancelTournament(t.id);
      this.feedback.set({ ok: true, message: 'Torneio cancelado.' });
      await this.load(t.id);
    } catch (e) {
      const err = e as { message?: string; details?: { reason?: string } };
      // Espelha o app: com inscrições pagas o servidor pede confirmação extra (force).
      if (err.details?.reason === 'has_paid_registrations' || /pagas|paid/i.test(err.message ?? '')) {
        const proceed = confirm('Há inscrições pagas neste torneio. Cancelar mesmo assim? (estornos ficam por sua conta)');
        if (proceed) {
          try {
            await cancelTournament(t.id, { force: true });
            this.feedback.set({ ok: true, message: 'Torneio cancelado.' });
            await this.load(t.id);
          } catch (e2) {
            this.feedback.set({ ok: false, message: (e2 as Error).message || 'Falha ao cancelar.' });
          }
        }
      } else {
        this.feedback.set({ ok: false, message: err.message || 'Falha ao cancelar.' });
      }
    } finally {
      this.acting.set(false);
      this.actingKind.set(null);
    }
  }

  protected pct(c: CategoriaRow): number {
    if (!c.total) return 0;
    return Math.round((c.taken / c.total) * 100);
  }

  protected dateRangeLabel(start: Date | null, end: Date | null): string {
    if (!start) return 'data a definir';
    if (!end || end.getTime() === start.getTime()) return SHORT_DATE.format(start);
    return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
  }
}
