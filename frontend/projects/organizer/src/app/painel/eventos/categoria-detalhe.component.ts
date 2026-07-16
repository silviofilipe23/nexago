import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { initialsOf } from '../data/mock-data';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { listMatches, type TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tab = 'Duplas' | 'Pagamentos' | 'Chave' | 'Jogos';
type Tone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Detalhe da categoria — roster de duplas, status de pagamento e jogos reais. */
@Component({
  selector: 'og-categoria-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent, OgAvatarComponent],
  template: `
    <og-page-header [title]="category()?.name ?? 'Categoria'" [subtitle]="headerSubtitle()">
      <button type="button" class="og-ghost-btn"><og-icon name="edit" [size]="13" />Editar</button>
      <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'seeds']">
        <og-icon name="bracket" [size]="14" />Sortear chave
      </a>
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando categoria…</div>
      } @else if (!tournament() || !category()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Categoria não encontrada.</div>
      } @else {
        <div class="og-kpi-row">
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Duplas</div>
            <div class="og-kpi-value sm">{{ inscriptions().length }}/{{ category()!.maxTeams ?? '—' }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Pagas</div>
            <div class="og-kpi-value sm" style="color:var(--nx-win)">{{ pagasCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Formato</div>
            <div class="og-kpi-value sm" style="font-size:15px;margin-top:10px">{{ formatLabel() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Premiação</div>
            <!-- mock (fase 2): sem premiação/financeiro por categoria ainda (Task O7) -->
            <div class="og-kpi-value sm" style="color:var(--nx-win)">—</div>
          </div>
        </div>

        <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />

        <div class="og-card og-card-pad-0" style="flex:1;min-height:0">
          @if (tab() === 'Duplas') {
            <div class="og-table-body" style="padding:4px 20px">
              @for (i of inscriptions(); track i.id; let idx = $index; let last = $last) {
                <div class="og-row" [class.last]="last">
                  <span class="og-categoria-seed">{{ pad(idx + 1) }}</span>
                  <og-avatar [initials]="initialsOf(i.teamName, ' / ')" [size]="34" />
                  <span style="flex:1;min-width:0">
                    <div class="og-categoria-name">{{ i.teamName }}</div>
                    <div class="og-categoria-meta">{{ i.createdAt ? 'Inscrito em ' + shortDate(i.createdAt) : 'Sem data de inscrição' }}</div>
                  </span>
                  <og-pill [tone]="payTone(i)">{{ payLabel(i) }}</og-pill>
                  <button type="button" class="og-ghost-btn">Detalhes</button>
                </div>
              } @empty {
                <p class="og-empty">Nenhuma inscrição ainda</p>
              }
            </div>
          } @else if (tab() === 'Jogos') {
            <div class="og-table-body" style="padding:4px 20px">
              @for (m of matches(); track m.id) {
                <div class="og-row">
                  <span style="width:110px" class="og-categoria-meta">{{ m.round ?? '—' }}</span>
                  <span style="flex:1;display:flex;align-items:center;gap:8px;min-width:0">
                    <span class="og-categoria-name">{{ m.team1Label }}</span>
                    <span class="og-categoria-meta">×</span>
                    <span class="og-categoria-name">{{ m.team2Label }}</span>
                  </span>
                  <span style="width:90px;text-align:center" class="og-categoria-score">{{ m.score ?? 'Não jogado' }}</span>
                  <span style="width:90px" class="og-categoria-meta">{{ m.court ?? '—' }}</span>
                  <span style="width:70px" class="og-categoria-meta">{{ m.scheduledAt ? timeLabel(m.scheduledAt) : '—' }}</span>
                </div>
              } @empty {
                <p class="og-empty">Chaves ainda não geradas</p>
              }
            </div>
          } @else {
            <div style="padding:20px;color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">
              Sem dados nesta aba ainda — protótipo mockado.
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .og-categoria-seed {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-categoria-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-categoria-meta {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-categoria-score {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
  `,
})
export class CategoriaDetalheComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly tabs: Tab[] = ['Duplas', 'Pagamentos', 'Chave', 'Jogos'];
  protected readonly tab = signal<Tab>('Duplas');
  protected readonly initialsOf = initialsOf;

  protected readonly loading = signal(true);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly inscriptions = signal<TournamentInscription[]>([]);
  protected readonly matches = signal<TournamentMatch[]>([]);

  protected readonly category = computed<OrganizerTournamentCategory | null>(
    () => this.tournament()?.categories.find((c) => c.id === this.catId()) ?? null,
  );

  protected readonly pagasCount = computed(() => this.inscriptions().filter((i) => i.paid).length);

  /** Rótulo do formato salvo na categoria (`bracketFormat`) — mesmo vocabulário curto do app. */
  protected readonly formatLabel = computed(() => {
    const raw = this.category()?.bracketFormat;
    if (!raw) return 'Grupos + SE';
    const map: Record<string, string> = {
      groups_knockout: 'Grupos + SE',
      single_elimination: 'Chave simples',
      double_elimination: 'Dupla elim.',
      round_robin: 'Pontos corridos',
      groups_repechage: 'Grupos + rep.',
    };
    return map[raw] ?? raw;
  });

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    const cat = this.category();
    if (!t || !cat) return '';
    if (cat.maxTeams == null) return `${t.name} · categoria`;
    const hint = this.inscriptions().length >= cat.maxTeams ? 'pronta pra sortear a chave' : 'aguardando inscrições';
    return `${t.name} · categoria · ${hint}`;
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      const cid = this.catId();
      this.tournament.set(null);
      this.inscriptions.set([]);
      this.matches.set([]);
      if (!tid || !cid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid, cid);
    });
  }

  private async load(tid: string, cid: string): Promise<void> {
    try {
      const [tournament, allInscriptions, allMatches] = await Promise.all([getTournament(tid), listInscriptions(tid), listMatches(tid)]);
      this.tournament.set(tournament);
      this.inscriptions.set(allInscriptions.filter((i) => i.categoryId === cid));
      this.matches.set(allMatches.filter((m) => m.categoryId === cid));
    } finally {
      this.loading.set(false);
    }
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected payTone(i: TournamentInscription): Tone {
    if (i.paid) return 'green';
    if (i.paymentStatus === 'waitlist') return 'dim';
    return 'yellow';
  }

  protected payLabel(i: TournamentInscription): string {
    if (i.paid) return 'Pago';
    if (i.paymentStatus === 'waitlist') return 'Espera';
    return 'Pendente';
  }

  protected shortDate(d: Date): string {
    return SHORT_DATE.format(d);
  }

  protected timeLabel(d: Date): string {
    return TIME.format(d);
  }
}
