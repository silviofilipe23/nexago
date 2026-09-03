import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LEVEL_OPTIONS, tournamentSportToLevelSportCode } from '@nexago/levels';
import { initialsOf, truncateName } from '../data/mock-data';
import { MIN_TEAMS_FOR_BRACKET, countBracketEligible } from '../data/bracket-eligibility';
import { promotableLevelOptions } from '../data/athlete-level-promotion';
import { OgAthleteLevelDialogComponent, type AthleteLevelTarget } from './athlete-level-dialog.component';
import { buildCategoryAthletesExport } from '../data/category-athletes-export';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { listMatches, type TournamentMatch } from '../data/matches-repository';
import { fetchAthleteRatings } from '../data/athlete-ratings-repository';
import { promoteAthleteLevel } from '../data/organizer-ops.service';
import { levelCodeFor, shortLevelLabel, teamLevelScore, teamLevelsSummary, teamScoreLabel, type AthleteRatingLite, type TeamLevelScore } from '../data/team-level-score';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

/** Linha de atleta da gaveta: é o alvo do diálogo (`AthleteLevelTarget`) mais o rótulo curto do
 *  nível atual, que só a lista mostra — assim abrir o diálogo é passar o objeto adiante. */
interface PromotableAthlete extends AthleteLevelTarget {
  currentLabel: string;
}

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/** Duplas da categoria — porta de entrada do nível 3 da cascata: roster com status de
 *  pagamento e KPIs. Chave, grupos, jogos e agendamento (as antigas abas) viraram itens
 *  da sidebar contextual da categoria. */
@Component({
  selector: 'og-categoria-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgIconComponent, OgPillComponent, OgAvatarComponent, OgAthleteLevelDialogComponent],
  host: {
    /** Largura do slot = maior elenco da lista (1–5); nomes ficam alinhados sem reservar 5 à toa. */
    '[style.--cat-avatar-n]': 'maxAvatarStack()',
  },
  template: `
    <og-page-header title="Equipes" [subtitle]="headerSubtitle()">
      <!-- Edição da categoria = wizard do torneio em modo edição, já no passo "Categorias" e com
           o builder desta categoria aberto (ver applyDeepLink em criar-torneio.component.ts). -->
      <a class="og-ghost-btn" routerLink="/painel/novo-torneio" [queryParams]="{ editar: id(), passo: 'categories', categoria: catId() }">
        <og-icon name="edit" [size]="13" />Editar
      </a>
      <!-- Texto na área de transferência, e não arquivo: o destino dessa lista é sempre uma
           conversa (grupo do torneio, mesa da arena), onde .csv não cola. -->
      @if (!loading() && inscriptions().length > 0) {
        <button type="button" class="og-ghost-btn og-export-btn" (click)="copyAthletesList()">
          <og-icon name="copy" [size]="13" />Exportar lista
        </button>
      }
      <!-- Some quando a chave já foi gerada (categoria com jogos) — regerar apagaria resultados. -->
      @if (!loading() && matches().length === 0) {
        @if (canDrawBracket()) {
          <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'seeds']">
            <og-icon name="bracket" [size]="14" />Sortear chave
          </a>
        } @else {
          <span class="og-draw-hint">
            Chave a partir de {{ minTeams }} duplas confirmadas (pagas, fora da espera e com dupla completa) — há {{ eligibleCount() }}.
          </span>
        }
      }
    </og-page-header>

    <div class="og-content">
      <!-- Fora do gate de loading (mesmo precedente de equipe.component.ts): "Promover nível"
           recarrega a categoria no sucesso, e o banner tem que sobreviver ao piscar de
           "Carregando categoria…" durante esse reload, não desaparecer com ele. -->
      @if (feedback(); as fb) {
        <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
      }
      @if (loading()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando categoria…</div>
      } @else if (!tournament() || !category()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Categoria não encontrada.</div>
      } @else {
        <div class="og-kpi-row">
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">{{ unitLabel() }}</div>
            <div class="og-kpi-value sm">{{ inscriptions().length }}/{{ category()!.maxTeams ?? '—' }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Pagas</div>
            <div class="og-kpi-value sm" style="color:var(--nx-win)">{{ pagasCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Pendentes</div>
            <div class="og-kpi-value sm" style="color:var(--nx-pending)">{{ pendentesCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Formato</div>
            <div class="og-kpi-value sm" style="font-size:15px;margin-top:10px">{{ formatLabel() }}</div>
          </div>
        </div>

        <div class="og-card og-card-pad-0 og-categoria-card" style="flex:1;min-height:0">
          <div class="og-table-body" style="padding:4px 20px">
            @for (i of inscriptions(); track i.id; let idx = $index; let last = $last) {
              <div class="og-row og-categoria-row" [class.last]="last">
                <span class="og-categoria-seed">{{ pad(idx + 1) }}</span>
                <span class="og-categoria-who">
                  <span class="og-categoria-avatars">
                    @for (p of athletesOf(i); track $index; let ai = $index; let n = $count) {
                      <og-avatar
                        zoomable
                        [initials]="initialsOf(p.name)"
                        [personName]="p.name"
                        [meta]="athleteMeta(i)"
                        [photoUrl]="p.photoUrl"
                        [size]="52"
                        [style.z-index]="n - ai"
                      />
                    }
                  </span>
                  <span class="og-categoria-copy">
                    <div class="og-categoria-name" [title]="i.teamName">{{ truncate(i.teamName, 100) }}</div>
                    <div class="og-categoria-meta">{{ levelsLine(i) }}</div>
                  </span>
                </span>
                @if (rosterProgress(i); as roster) {
                  <og-pill tone="yellow" title="Elenco incompleto — a equipe só entra na chave completa">{{ roster }}</og-pill>
                }
                <og-pill tone="dim" [title]="scoreHint(i)">{{ scoreLabel(i) }}</og-pill>
                <og-pill [tone]="payTone(i)">{{ payLabel(i) }}</og-pill>
                <button
                  type="button"
                  class="og-categoria-toggle"
                  [attr.aria-expanded]="openTeamId() === i.id"
                  [attr.aria-controls]="'categoria-drawer-' + i.id"
                  [attr.aria-label]="(openTeamId() === i.id ? 'Fechar ações de ' : 'Ações de ') + i.teamName"
                  (click)="toggleTeam(i.id)"
                >
                  <og-icon name="chevron" [size]="15" />
                </button>
              </div>
              @if (openTeamId() === i.id) {
                <div class="og-categoria-drawer" [id]="'categoria-drawer-' + i.id">
                  <!-- Ver athlete-level-promotion.ts: aparece pra quem tem degrau pra subir — quem
                       já está no topo (Open) some da lista, e quem AINDA NÃO tem nível declarado
                       nesse esporte ganha os 7 degraus inteiros (semear é o mesmo caminho de
                       promover, pro backend — c034b9e0). O organizador que acabou de ver alguém
                       jogar é a melhor fonte disponível enquanto o rating não tem volume de
                       partidas (Task 8 do plano de calibração). O backend (setAthleteLevel) é o
                       gate real: dono do torneio, mesmo esporte e inscrição ativa — a UI só evita
                       oferecer o que já sabe que vai falhar (repetir/descer o degrau). -->
                  @if (promotableFor(i); as promotable) {
                    @if (promotable.length) {
                      <div class="og-categoria-promote">
                        @for (p of promotable; track p.uid) {
                          <span class="og-categoria-promote-item">
                            <span class="og-categoria-promote-name">{{ p.name }}</span>
                            <og-pill tone="dim">{{ p.currentLabel || 'Sem nível' }}</og-pill>
                            <button
                              type="button"
                              class="og-mini-btn"
                              [disabled]="busy()"
                              [attr.aria-label]="'Promover nível de ' + p.name"
                              (click)="openPromote(p)"
                            >
                              Promover nível
                            </button>
                          </span>
                        }
                      </div>
                    } @else {
                      <p class="og-categoria-empty-actions">Nenhuma ação disponível</p>
                    }
                  }
                </div>
              }
            } @empty {
              <p class="og-empty">Nenhuma inscrição ainda</p>
            }
          </div>
        </div>
      }
    </div>

    @if (promoteTarget(); as target) {
      <og-athlete-level-dialog
        [target]="target"
        [sportLabel]="sportLabel()"
        [busy]="busy()"
        [error]="promoteError()"
        (confirmed)="confirmPromote($event)"
        (cancelled)="closePromote()"
      />
    }
  `,
  styles: `
    :host {
      /* Slot dinâmico: 52px + (n−1)×36px, n = maior elenco visível (cap 5). */
      --cat-avatar: 52px;
      --cat-avatar-step: 36px;
      --cat-avatar-n: 1;
      --cat-avatars-col: calc(
        var(--cat-avatar) + (var(--cat-avatar-n) - 1) * var(--cat-avatar-step)
      );
    }
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
    .og-categoria-card {
      container-type: inline-size;
    }
    .og-categoria-row {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: none;
      width: auto;
    }
    .og-categoria-who {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }
    /* Nos avatares de trio/quarteto/quinteto a coluna de fotos já é larga; somada às três
       pills, o nome da equipe seria espremido a nada num tablet em retrato. Dando uma base
       mínima ao bloco do nome, quem cede e desce pra segunda linha são as pills — o nome,
       que é o que se procura na lista, fica inteiro. */
    @container (max-width: 620px) {
      .og-categoria-row {
        flex-wrap: wrap;
        row-gap: 8px;
      }
      .og-categoria-who {
        flex: 1 1 220px;
      }
    }
    .og-categoria-avatars {
      display: flex;
      align-items: center;
      width: var(--cat-avatars-col);
      min-width: var(--cat-avatars-col);
      flex: none;
      height: var(--cat-avatar);
    }
    .og-categoria-avatars .og-avatar {
      flex-shrink: 0;
      box-shadow: 0 0 0 2px var(--nx-surface-0);
    }
    .og-categoria-avatars .og-avatar + .og-avatar {
      margin-left: -16px;
    }
    .og-categoria-copy {
      flex: 1;
      min-width: 0;
    }
    .og-categoria-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-categoria-meta {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-draw-hint {
      max-width: 320px;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.35;
      color: var(--nx-text-mute);
      text-align: right;
    }
    .og-categoria-promote {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 0 0 12px 44px;
    }
    .og-categoria-promote-item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
    }
    /* O nome empurra a ação pra direita; num tablet estreito ele cede a linha inteira e o
       botão desce, em vez de espremer os dois. */
    .og-categoria-promote-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-categoria-toggle {
      width: 34px;
      height: 34px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid transparent;
      color: var(--nx-text-dim);
      display: grid;
      place-items: center;
      cursor: pointer;
      flex: none;
      transition:
        background var(--nx-d-fast) var(--nx-ease-out),
        color var(--nx-d-fast) var(--nx-ease-out),
        border-color var(--nx-d-fast) var(--nx-ease-out);
    }
    .og-categoria-toggle:hover {
      background: var(--nx-surface-1);
      border-color: var(--nx-line);
      color: var(--nx-text);
    }
    .og-categoria-toggle og-icon {
      display: grid;
      /* O chevron do design system aponta pra direita; 90° = fechado, -90° = aberto. */
      transform: rotate(90deg);
      transition: transform var(--nx-d-base) var(--nx-ease-out);
    }
    .og-categoria-toggle[aria-expanded='true'] {
      background: var(--nx-surface-1);
      border-color: var(--nx-line);
      color: var(--nx-text);
    }
    .og-categoria-toggle[aria-expanded='true'] og-icon {
      transform: rotate(-90deg);
    }
    .og-categoria-drawer {
      padding: 2px 0 18px 44px;
    }
    .og-categoria-empty-actions {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
      margin: 0;
    }
  `,
})
export class CategoriaDetalheComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly initialsOf = initialsOf;
  protected readonly truncate = truncateName;

  protected readonly loading = signal(true);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly inscriptions = signal<TournamentInscription[]>([]);
  protected readonly matches = signal<TournamentMatch[]>([]);
  /** Rating técnico por uid — vazio nos esportes sem engine de rating. */
  private readonly ratings = signal<Map<string, AthleteRatingLite>>(new Map());

  /** Estado da ação "Promover nível" — o progresso mora no diálogo, então uma flag basta. */
  protected readonly busy = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  /** Atleta com o diálogo de promoção aberto; `null` = fechado. */
  protected readonly promoteTarget = signal<AthleteLevelTarget | null>(null);
  /** Erro da promoção — fica DENTRO do diálogo, e não no banner da página: no banner o
   *  organizador perde de vista de quem era a promoção que falhou. */
  protected readonly promoteError = signal<string | null>(null);

  /** Gaveta de ações aberta (id da inscrição) — só uma por vez, mesmo padrão da tela de
   *  Inscrições (`actionsFor`/`toggleActions`). */
  protected readonly openTeamId = signal<string | null>(null);

  protected readonly category = computed<OrganizerTournamentCategory | null>(
    () => this.tournament()?.categories.find((c) => c.id === this.catId()) ?? null,
  );

  /** Esporte do torneio no vocabulário do perfil (`VOLEI_PRAIA`…) — `null` quando não há
   *  equivalente, aí a pontuação cai no nível global legado. */
  private readonly sportCode = computed(() => tournamentSportToLevelSportCode(this.tournament()?.sportId));

  /** Pontuação de nível por inscrição — a dupla mais forte no topo da leitura do organizador
   *  na hora de escolher os cabeças de chave. */
  private readonly scores = computed(() => {
    const sportCode = this.sportCode();
    const ratings = this.ratings();
    return new Map<string, TeamLevelScore>(
      this.inscriptions().map((i) => [
        i.id,
        teamLevelScore(i.participants, sportCode, i.participants.map((p) => ratings.get(p.uid))),
      ]),
    );
  });

  protected readonly sportLabel = computed(() => this.tournament()?.sportLabel ?? '');

  protected readonly pagasCount = computed(() => this.inscriptions().filter((i) => i.paid).length);
  protected readonly pendentesCount = computed(() => this.inscriptions().filter((i) => !i.paid).length);

  protected readonly minTeams = MIN_TEAMS_FOR_BRACKET;

  /** Duplas que realmente entram na chave — não é o mesmo que `pagasCount`, que conta também
   *  quem está na fila de espera ou ainda sem parceiro. */
  protected readonly eligibleCount = computed(() => countBracketEligible(this.inscriptions()));

  protected readonly canDrawBracket = computed(() => this.eligibleCount() >= MIN_TEAMS_FOR_BRACKET);

  /** Maior stack de avatares na lista — define a largura comum do slot (nomes alinhados). */
  protected readonly maxAvatarStack = computed(() => {
    let max = 1;
    for (const i of this.inscriptions()) {
      const n = i.participants.length > 0 ? Math.min(5, i.participants.length) : 1;
      if (n > max) max = n;
    }
    return max;
  });

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

  /** "Duplas" ou "Equipes" (trio+) — segue o `teamSize` da categoria. */
  protected readonly unitLabel = computed(() => (this.category()?.teamSize != null ? 'Equipes' : 'Duplas'));

  protected readonly headerSubtitle = computed(() => {
    const cat = this.category();
    if (!cat) return '';
    const taken = this.inscriptions().length;
    const unit = this.unitLabel().toLowerCase();
    if (cat.maxTeams == null) return `${cat.name} · ${taken} ${unit}`;
    const hint = taken >= cat.maxTeams ? 'lotado' : 'aguardando inscrições';
    return `${cat.name} · ${taken}/${cat.maxTeams} · ${hint}`;
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      const cid = this.catId();
      this.tournament.set(null);
      this.inscriptions.set([]);
      this.matches.set([]);
      this.openTeamId.set(null);
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
      const categoryInscriptions = allInscriptions.filter((i) => i.categoryId === cid);
      this.inscriptions.set(categoryInscriptions);
      this.matches.set(allMatches.filter((m) => m.categoryId === cid));
      this.ratings.set(
        await fetchAthleteRatings(
          categoryInscriptions.flatMap((i) => i.participants.map((p) => p.uid)),
          tournamentSportToLevelSportCode(tournament?.sportId),
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }

  /** Lista de atletas da categoria em texto, pronta pra colar. O rótulo de cada linha é o mesmo
   *  que a tela mostra (nome cadastrado da equipe, senão os atletas), e a vaga ainda em aberto
   *  vira "parceiro" — é ela que o organizador precisa enxergar ao mandar a lista pro grupo. */
  protected async copyAthletesList(): Promise<void> {
    const tournament = this.tournament();
    const category = this.category();
    if (!tournament || !category) return;
    const inscriptions = this.inscriptions();
    const text = buildCategoryAthletesExport({
      tournamentName: tournament.name,
      categoryName: category.name,
      inscriptions,
    });
    try {
      await navigator.clipboard.writeText(text);
      const unit = this.unitLabel().toLowerCase();
      const label = inscriptions.length === 1 ? unit.slice(0, -1) : unit;
      this.feedback.set({ ok: true, message: `Lista de ${inscriptions.length} ${label} copiada.` });
    } catch {
      // Mesmo cuidado do dialog de compartilhar: sem permissão de área de transferência (http,
      // Safari sem gesto) o banner não pode dizer que copiou — o organizador colaria a mensagem
      // anterior no grupo achando que mandou a lista.
      this.feedback.set({ ok: false, message: 'Não foi possível copiar a lista — o navegador bloqueou a área de transferência.' });
    }
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected toggleTeam(id: string): void {
    this.openTeamId.update((cur) => (cur === id ? null : id));
  }

  /** Contexto da foto ampliada: o que o organizador precisa ler pra confirmar quem é. */
  protected athleteMeta(i: TournamentInscription): string {
    return [this.category()?.name, i.teamName].filter(Boolean).join(' · ');
  }

  /** Stack de avatares — todos os atletas do elenco (dupla = 2, equipe = até 5). */
  protected athletesOf(i: TournamentInscription): { name: string; photoUrl: string | null }[] {
    if (i.participants.length > 0) {
      return i.participants.slice(0, 5).map((p) => ({ name: p.name, photoUrl: p.photoUrl }));
    }
    return [{ name: i.teamName, photoUrl: null }];
  }

  /** "Elenco 2/4" enquanto a equipe (trio+) não fecha; dupla mantém o comportamento antigo. */
  protected rosterProgress(i: TournamentInscription): string | null {
    if (i.teamSize == null || !i.partnerPending) return null;
    return `Elenco ${i.participants.length}/${i.teamSize}`;
  }

  /** Selo de força da dupla: soma dos níveis (2–14) e, quando o esporte tem engine de rating
   *  e os dois atletas já saíram do provisional, o rating composto. */
  protected scoreLabel(i: TournamentInscription): string {
    const score = this.scores().get(i.id);
    return score ? teamScoreLabel(score) : '—';
  }

  protected scoreHint(i: TournamentInscription): string {
    const score = this.scores().get(i.id);
    if (!score || score.points == null) return 'Pontuação indisponível — atleta sem nível informado';
    const base = `Pontuação de nível: ${score.points} de 10`;
    return score.rating == null ? base : `${base} · rating técnico ${Math.round(score.rating)}`;
  }

  /** Composição de níveis + data de inscrição na mesma linha de apoio. */
  protected levelsLine(i: TournamentInscription): string {
    const score = this.scores().get(i.id);
    const levels = score ? teamLevelsSummary(score) : 'Nível não informado';
    return i.createdAt ? `${levels} · Inscrito em ${this.shortDate(i.createdAt)}` : levels;
  }

  /** `needsVerification` vem antes de `paid` de propósito: a dupla que só DECLAROU o pagamento
   *  direto tem `isPaid` true, e chamar isso de "Pago" aqui contradiria a tela de Inscrições. */
  protected payTone(i: TournamentInscription): Tone {
    if (i.needsVerification) return 'orange';
    if (i.paid) return 'green';
    if (i.paymentStatus === 'waitlist') return 'dim';
    return 'yellow';
  }

  protected payLabel(i: TournamentInscription): string {
    if (i.needsVerification) return 'A conferir';
    if (i.paid) return 'Pago';
    if (i.paymentStatus === 'waitlist') return 'Espera';
    return 'Pendente';
  }

  protected shortDate(d: Date): string {
    return SHORT_DATE.format(d);
  }

  /** Atletas da dupla com degrau pra subir nesse esporte — só some da lista quem já está em
   *  Open; quem ainda não tem nível declarado ganha os 7 degraus inteiros (ver
   *  `promotableLevelOptions`: `currentRank == null` devolve TODOS os degraus, não `[]` —
   *  semear o 1º nível de um esporte é o mesmo caminho de promover, pro backend). Não gate na
   *  categoria estar concluída/chave fechada: o backend (dono do torneio + inscrição ativa + só
   *  sobe) já é o gate real, e travar aqui bloquearia a promoção de fim de dia sem ganhar
   *  segurança. */
  protected promotableFor(i: TournamentInscription): PromotableAthlete[] {
    const sportCode = this.sportCode();
    // Guarda simétrica à de `confirmPromote()`: sem sportCode mapeado, `setAthleteLevel` nunca
    // autoriza o organizador (o backend também exige tournamentSportCode não nulo, igual ao
    // requestSportCode) — mostrar o botão aqui seria oferecer um clique que nunca funciona.
    if (!sportCode) return [];
    return i.participants
      .map((p) => {
        const currentLevel = levelCodeFor(p, sportCode);
        return {
          uid: p.uid,
          name: p.name,
          photoUrl: p.photoUrl,
          currentLevel,
          currentLabel: shortLevelLabel(currentLevel),
          options: promotableLevelOptions(currentLevel),
        };
      })
      .filter((p) => p.options.length > 0);
  }

  protected openPromote(athlete: PromotableAthlete): void {
    if (this.busy()) return;
    this.promoteError.set(null);
    this.promoteTarget.set(athlete);
  }

  protected closePromote(): void {
    if (this.busy()) return;
    this.promoteTarget.set(null);
    this.promoteError.set(null);
  }

  protected confirmPromote(levelCode: string): void {
    const target = this.promoteTarget();
    const sportCode = this.sportCode();
    const t = this.tournament();
    if (!target || !levelCode || !sportCode || !t || this.busy()) return;
    void this.runPromote(target, sportCode, t.id, levelCode);
  }

  /** Sucesso fecha o diálogo e vai pro banner da página (que sobrevive ao reload); falha mantém
   *  o diálogo aberto com o erro, pra corrigir a escolha sem reabrir tudo. */
  private async runPromote(
    target: AthleteLevelTarget,
    sportCode: string,
    tournamentId: string,
    levelCode: string,
  ): Promise<void> {
    const label = LEVEL_OPTIONS.find((o) => o.code === levelCode)?.label ?? levelCode;
    this.busy.set(true);
    this.feedback.set(null);
    this.promoteError.set(null);
    try {
      await promoteAthleteLevel({ uid: target.uid, sportCode, level: levelCode, tournamentId });
      this.promoteTarget.set(null);
      this.feedback.set({ ok: true, message: `${target.name} promovido para ${label}.` });
      const tid = this.id();
      const cid = this.catId();
      if (tid && cid) {
        this.loading.set(true);
        await this.load(tid, cid);
      }
    } catch (e) {
      this.promoteError.set((e as Error).message || 'Não foi possível promover o nível.');
    } finally {
      this.busy.set(false);
    }
  }
}
