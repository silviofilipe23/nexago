import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { tournamentSportToLevelSportCode } from '@nexago/levels';
import { interviewLineOf, interviewOnAirAt, type BroadcastInterview, type InterviewKind } from '../data/broadcast-control';
import {
  currentItem,
  currentQuestion,
  queueAdd,
  queueGoTo,
  queueMove,
  queueRemove,
  queueReplaceItem,
  queueSetQuestions,
  queueSetReporter,
  queueSetShow,
  queueStepQuestion,
  reporterOnAir,
  type InterviewQueue,
  type InterviewQueueItem,
  type InterviewShow,
} from '../data/interview-queue';
import { resolveCourtNames } from '../data/matches-repository';
import { initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import {
  interviewCardOf,
  interviewKeyOf,
  interviewKindsFor,
  queueItemFor,
  subjectOptionsFor,
  type InterviewCardSource,
  type SubjectOption,
} from './interview-card';
import { TransmissaoDataService } from './transmissao-data.service';
import {
  courtMatchOf,
  elapsedLabel,
  interviewCandidatesOf,
  quickPicksOf,
  searchCandidates,
  type InterviewCandidate,
} from './transmissao-selectors';

const DURATIONS: readonly { label: string; sec: number | null }[] = [
  { label: '20 s', sec: 20 },
  { label: '1 min', sec: 60 },
  { label: 'Até tirar', sec: null },
];

const SHOW_TOGGLES: readonly { key: keyof InterviewShow; label: string; desc: string }[] = [
  { key: 'question', label: 'Pauta', desc: 'A pergunta da vez acima do card' },
  { key: 'campaign', label: 'Campanha no torneio', desc: 'Resultados do entrevistado no canto direito' },
  { key: 'reporter', label: 'Repórter', desc: 'Quem conduz, abaixo do card' },
];

const KIND_NAMES: Record<InterviewKind, string> = { atleta: 'Atleta', dupla: 'Dupla', equipe: 'Equipe' };

/** Card "Entrevista" da tela Transmissão: escalar quem vai ser entrevistado, a pauta de cada um,
 *  o repórter, e o comando do ar (Anterior / Pôr no ar / Próximo, pergunta da vez, chaves).
 *
 *  A fila mora em `broadcast/interviewQueue` (dois operadores veem a mesma); o que vai ao ar é o
 *  card montado no clique, em `broadcast/control.interview`. Mudar pergunta, chave ou repórter com
 *  a tarja no ar regrava o card com o MESMO carimbo — a duração não reinicia e o overlay troca só
 *  o que mudou. Trocar de entrevistado no ar é carimbo novo: o overlay faz a troca animada. */
@Component({
  selector: 'og-tx-entrevista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgCardComponent, OgAvatarComponent],
  template: `
    @let q = svc.queue();
    <og-card kicker="Reporter" title="Entrevista">
      @if (onAir(); as live) {
        <div class="og-tx-noar">
          <span class="og-tx-noar-dot" aria-hidden="true"></span>
          <span class="og-tx-noar-txt">{{ onAirText() }}</span>
          <button type="button" class="og-mini-btn" (click)="takeOffAir()">Tirar do ar</button>
        </div>
      }

      <div class="og-tx-label">Repórter</div>
      <div class="og-tx-reporter">
        <input
          class="og-input-el"
          aria-label="Função do repórter"
          [value]="q.reporter.role"
          (change)="saveReporter($any($event.target).value, null)"
        />
        <input
          class="og-input-el"
          aria-label="Nome do repórter"
          placeholder="Nome de quem entrevista"
          [value]="q.reporter.name"
          (change)="saveReporter(null, $any($event.target).value)"
        />
      </div>

      @if (quickPicks().length > 0) {
        <div class="og-tx-label">Na quadra agora</div>
        <div class="og-tx-chips">
          @for (c of quickPicks(); track c.key) {
            <button type="button" class="og-chip" [class.active]="selected()?.key === c.key" (click)="pick(c)">{{ c.name }}</button>
          }
        </div>
      }
      <label class="og-tx-label" for="og-tx-busca">Buscar atleta do torneio</label>
      <input
        id="og-tx-busca"
        class="og-input-el og-tx-busca"
        type="search"
        placeholder="Nome do atleta"
        [value]="term()"
        (input)="onSearchInput($any($event.target).value)"
      />
      @if (searchOpen()) {
        @for (c of results(); track c.key) {
          <button type="button" class="og-tx-result" [class.active]="selected()?.key === c.key" (click)="pick(c)">
            <og-avatar [initials]="initials(c.name)" [photoUrl]="c.photoUrl" [size]="32" />
            <span class="og-tx-result-txt">
              <span class="og-tx-result-nome">{{ c.name }}</span>
              <span class="og-tx-result-sub">{{ line(c) }}</span>
            </span>
          </button>
        }
      }
      @if (selected(); as sel) {
        @if (kinds().length > 1) {
          <div class="og-tx-label">Entrevistar</div>
          <div class="og-tx-chips" role="radiogroup" aria-label="Quem vai pra tarja">
            @for (k of kinds(); track k) {
              <button type="button" class="og-chip" role="radio" [class.active]="kind() === k" [attr.aria-checked]="kind() === k" (click)="kind.set(k)">
                {{ k === 'atleta' ? sel.name : kindName(k) }}
              </button>
            }
          </div>
        }
        <div class="og-tx-acoes">
          <button type="button" class="og-ghost-btn" (click)="addToQueue()">Adicionar à fila</button>
          <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="airNow()">Pôr no ar agora</button>
        </div>
      }

      <div class="og-tx-label">Fila · {{ q.items.length }}</div>
      <ol class="og-tx-fila">
        @for (it of q.items; track it.id; let i = $index) {
          <li class="og-tx-fila-item" [class.atual]="i === q.current">
            <span class="og-tx-fila-n">{{ i + 1 }}</span>
            <og-avatar [initials]="initials(it.label)" [photoUrl]="it.photoUrl" [size]="28" />
            <button type="button" class="og-tx-fila-nome" [attr.aria-expanded]="openId() === it.id" (click)="toggleOpen(it.id)">
              <span>{{ it.label }}</span>
              <span class="og-tx-fila-sub">{{ itemSub(it) }}</span>
            </button>
            @if (onAirKey() === it.id) {
              <span class="og-tx-fila-ar">No ar</span>
            }
            <button type="button" class="og-mini-btn" [disabled]="i === q.current" (click)="goTo(i)">Chamar</button>
            <button type="button" class="og-tx-icone" aria-label="Subir" [disabled]="i === 0" (click)="move(it.id, -1)">↑</button>
            <button type="button" class="og-tx-icone" aria-label="Descer" [disabled]="i === q.items.length - 1" (click)="move(it.id, 1)">↓</button>
            <button type="button" class="og-tx-icone" aria-label="Tirar da fila" (click)="remove(it.id)">×</button>
          </li>
          @if (openId() === it.id) {
            <textarea
              class="og-input-el og-tx-pauta"
              rows="4"
              [attr.aria-label]="'Pauta de ' + it.label"
              placeholder="Uma pergunta por linha"
              [value]="it.questions.join('\\n')"
              (change)="saveQuestions(it.id, $any($event.target).value)"
            ></textarea>
          }
        } @empty {
          <p class="og-tx-dica">Escale quem vai ser entrevistado — a ordem da fila é a ordem do ar.</p>
        }
      </ol>

      @if (current(); as cur) {
        <div class="og-tx-label">No comando</div>
        @if (curOptions().length > 1) {
          <div class="og-tx-chips og-tx-formato" role="radiogroup" aria-label="Formato do entrevistado da vez">
            @for (o of curOptions(); track optionKey(o)) {
              <button
                type="button"
                class="og-chip"
                role="radio"
                [class.active]="optionKey(o) === cur.id"
                [attr.aria-checked]="optionKey(o) === cur.id"
                (click)="setSubject(cur, o)"
              >
                {{ o.label }}
              </button>
            }
          </div>
        }
        <div class="og-tx-comando">
          <button type="button" class="og-ghost-btn" [disabled]="q.current === 0" (click)="goTo(q.current - 1)">◀ Anterior</button>
          <button type="button" class="og-mini-btn og-mini-btn-primary og-tx-ar" [disabled]="!canAir()" (click)="putOnAir()">
            {{ 'Pôr no ar: ' + cur.label }}
          </button>
          <button type="button" class="og-ghost-btn" [disabled]="q.current >= q.items.length - 1" (click)="goTo(q.current + 1)">Próximo ▶</button>
        </div>
        @if (cur.questions.length > 0) {
          <div class="og-tx-pergunta">
            <button type="button" class="og-tx-icone" aria-label="Pergunta anterior" [disabled]="q.questionIndex === 0" (click)="stepQuestion(-1)">◀</button>
            <span class="og-tx-pergunta-txt">
              <b>{{ 'Pergunta ' + (q.questionIndex + 1) + '/' + cur.questions.length }}</b>
              <span>{{ cur.questions[q.questionIndex] }}</span>
            </span>
            <button
              type="button"
              class="og-tx-icone"
              aria-label="Próxima pergunta"
              [disabled]="q.questionIndex >= cur.questions.length - 1"
              (click)="stepQuestion(1)"
            >
              ▶
            </button>
          </div>
        }
      }

      @for (t of toggles; track t.key) {
        <div class="og-toggle-row">
          <div class="og-toggle-row-text">
            <div class="og-toggle-row-title">{{ t.label }}</div>
            <div class="og-toggle-row-desc">{{ t.desc }}</div>
          </div>
          <button
            type="button"
            class="og-toggle"
            role="switch"
            [class.on]="q.show[t.key]"
            [attr.aria-checked]="q.show[t.key]"
            [attr.aria-label]="t.label"
            (click)="setShow(t.key, !q.show[t.key])"
          ></button>
        </div>
      }
      <div class="og-tx-label">Duração</div>
      <div class="og-tx-chips">
        @for (d of durations; track d.label) {
          <button type="button" class="og-chip" [class.active]="duration() === d.sec" (click)="duration.set(d.sec)">{{ d.label }}</button>
        }
      </div>
    </og-card>
  `,
  styles: `
    .og-tx-label {
      display: block;
      margin: 16px 0 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-tx-dica {
      margin: 6px 0;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-tx-chips,
    .og-tx-acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-tx-acoes {
      justify-content: flex-end;
      margin-top: 12px;
    }
    .og-tx-reporter {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
      gap: 8px;
    }
    .og-tx-reporter input,
    .og-tx-busca {
      height: 44px;
      padding: 0 12px;
    }
    .og-tx-result {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      margin-top: 6px;
      padding: 8px 10px;
      border: 1px solid transparent;
      border-radius: var(--nx-r-3);
      background: transparent;
      color: var(--nx-text);
      text-align: left;
      cursor: pointer;
    }
    .og-tx-result.active {
      border-color: var(--nx-orange-500);
    }
    .og-tx-result-txt {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .og-tx-result-sub,
    .og-tx-fila-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-tx-fila {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .og-tx-fila-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-tx-fila-item.atual {
      border-color: var(--nx-orange-500);
      box-shadow: 0 0 0 1px var(--nx-orange-500) inset;
    }
    .og-tx-fila-n {
      width: 18px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
      text-align: right;
    }
    .og-tx-fila-nome {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--nx-text);
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }
    .og-tx-fila-ar {
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(255, 59, 48, 0.14);
      color: var(--nx-live, #ff3b30);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .og-tx-icone {
      width: 30px;
      height: 30px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2, 8px);
      background: transparent;
      color: var(--nx-text);
      cursor: pointer;
    }
    .og-tx-icone:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .og-tx-pauta {
      width: 100%;
      margin: 2px 0 6px;
      padding: 10px 12px;
      resize: vertical;
      font: inherit;
    }
    .og-tx-formato {
      margin-bottom: 10px;
    }
    .og-tx-comando {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 8px;
    }
    .og-tx-ar {
      min-height: 44px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-tx-pergunta {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
    }
    .og-tx-pergunta-txt {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      font-size: 14px;
    }
    .og-tx-pergunta-txt b {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-tx-noar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      background: rgba(255, 59, 48, 0.12);
    }
    .og-tx-noar-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--nx-live, #ff3b30);
    }
    .og-tx-noar-txt {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class TransmissaoEntrevistaComponent {
  protected readonly svc = inject(TransmissaoDataService);

  protected readonly durations = DURATIONS;
  protected readonly toggles = SHOW_TOGGLES;

  /** Relógio de 1 s: tempo da tarja no ar e quem está na quadra agora. */
  private readonly now = signal(Date.now());
  protected readonly term = signal('');
  /** Fecha a lista depois do pick; reabre ao digitar de novo. */
  protected readonly searchOpen = signal(false);
  protected readonly selected = signal<InterviewCandidate | null>(null);
  protected readonly kind = signal<InterviewKind>('atleta');
  protected readonly duration = signal<number | null>(null);
  protected readonly openId = signal<string | null>(null);

  /** Jogo do auto-agendamento antigo só gravou `courtId` — o nome sai das quadras do torneio. */
  private readonly matches = computed(() => resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []));

  private readonly candidates = computed(() =>
    interviewCandidatesOf(this.svc.matches(), this.svc.rosters(), this.svc.tournament()?.categories ?? []),
  );
  protected readonly quickPicks = computed(() =>
    quickPicksOf(this.candidates(), courtMatchOf(this.matches(), this.svc.control().courtId, this.now())),
  );
  protected readonly results = computed(() => searchCandidates(this.candidates(), this.term()));

  /** Tudo que o card lê — montado no clique, com os dados do momento. */
  private readonly cardSource = computed<InterviewCardSource>(() => {
    const t = this.svc.tournament();
    return {
      matches: this.matches(),
      rosters: this.svc.rosters(),
      details: this.svc.details(),
      categories: (t?.categories ?? []).map((c) => ({ id: c.id, name: c.name, teamSize: c.teamSize ?? null })),
      inLeague: !!t?.leagueId,
      levelSportCode: tournamentSportToLevelSportCode(t?.sportId),
      athleteRanking: this.svc.athleteRanking(),
      teamRanking: this.svc.teamRanking(),
    };
  });

  /** Atleta sempre; dupla/equipe quando o time está completo. */
  protected readonly kinds = computed(() => {
    const c = this.selected();
    return c ? interviewKindsFor(c.teamId, this.cardSource()) : [];
  });

  protected readonly onAir = computed(() => {
    const i = this.svc.control().interview;
    return interviewOnAirAt(i, this.now()) ? i : null;
  });
  protected readonly onAirKey = computed(() => this.onAir()?.key ?? null);
  protected readonly onAirText = computed(() => {
    const i = this.onAir();
    return i ? `No ar: ${i.name} · ${elapsedLabel(this.now() - i.shownAt)}` : '';
  });

  protected readonly current = computed(() => currentItem(this.svc.queue()));
  /** Formatos do entrevistado da vez — escalar não congela a escolha: dá pra virar a dupla, ou
   *  o outro atleta do time, direto no comando. */
  protected readonly curOptions = computed(() => {
    const cur = this.current();
    return cur ? subjectOptionsFor(cur.teamId, this.cardSource()) : [];
  });
  /** Elenco ainda não hidratado (tela recém-aberta) não monta card — o botão espera. */
  protected readonly canAir = computed(() => this.cardFor(this.svc.queue(), 0, null) != null);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // Fila já escalada (painel recarregado no meio do evento) vai ao ar sem ninguém escolher
    // atleta de novo — o ranking tem de estar carregando desde já, senão o card sai sem ele.
    const temFila = computed(() => this.svc.queue().items.length > 0);
    effect(() => {
      if (temFila()) this.svc.ensureRanking();
    });
  }

  protected onSearchInput(value: string): void {
    this.term.set(value);
    this.searchOpen.set(true);
  }

  /** Escolher alguém é o sinal de que vem entrevista: é aí que o ranking geral começa a carregar.
   *  O input mostra o nome escolhido e a lista some até digitar de novo. */
  protected pick(c: InterviewCandidate): void {
    this.selected.set(c);
    this.kind.set('atleta');
    this.term.set(c.name);
    this.searchOpen.set(false);
    this.svc.ensureRanking();
  }

  protected addToQueue(): void {
    const item = this.selectionItem();
    if (!item) return;
    void this.svc.saveQueue(queueAdd(this.svc.queue(), item));
    this.clearSelection();
  }

  /** Atalho do "escalar e pôr no ar": entra na fila (se ainda não está) e vira o da vez. */
  protected airNow(): void {
    const item = this.selectionItem();
    if (!item) return;
    const added = queueAdd(this.svc.queue(), item);
    const next = queueGoTo(added, added.items.findIndex((i) => i.id === item.id));
    const card = this.cardFor(next, Date.now(), this.duration());
    if (card) void this.svc.saveAir(card, next);
    this.clearSelection();
  }

  protected putOnAir(): void {
    const card = this.cardFor(this.svc.queue(), Date.now(), this.duration());
    if (card) void this.svc.saveAir(card, null);
  }

  /** Anterior/Próximo/Chamar. No ar, troca o entrevistado (carimbo novo → troca animada);
   *  fora do ar, só move o cursor. */
  protected goTo(at: number): void {
    const next = queueGoTo(this.svc.queue(), at);
    const card = this.onAir() ? this.cardFor(next, Date.now(), this.duration()) : null;
    if (card) void this.svc.saveAir(card, next);
    else void this.svc.saveQueue(next);
  }

  /** Troca o formato do item na fila (lugar e pauta ficam). Se é ele que está no ar, o ar troca
   *  junto — carimbo novo, o overlay faz a troca animada como num "Próximo". */
  protected setSubject(item: InterviewQueueItem, option: SubjectOption): void {
    const replacement = queueItemFor(option, this.cardSource());
    if (!replacement) return;
    const next = queueReplaceItem(this.svc.queue(), item.id, replacement);
    const live = this.onAir();
    const card =
      live && live.key === item.id && currentItem(next)?.id === replacement.id
        ? this.cardFor(next, Date.now(), live.durationSec)
        : null;
    if (card) void this.svc.saveAir(card, next);
    else void this.svc.saveQueue(next);
  }

  protected optionKey(o: SubjectOption): string {
    return interviewKeyOf(o);
  }

  protected stepQuestion(delta: -1 | 1): void {
    this.refresh(queueStepQuestion(this.svc.queue(), delta));
  }

  protected setShow(key: keyof InterviewShow, on: boolean): void {
    this.refresh(queueSetShow(this.svc.queue(), { [key]: on }));
  }

  protected saveReporter(role: string | null, name: string | null): void {
    const r = this.svc.queue().reporter;
    this.refresh(queueSetReporter(this.svc.queue(), { role: role ?? r.role, name: name ?? r.name }));
  }

  protected saveQuestions(id: string, raw: string): void {
    this.refresh(queueSetQuestions(this.svc.queue(), id, raw));
  }

  protected move(id: string, delta: -1 | 1): void {
    void this.svc.saveQueue(queueMove(this.svc.queue(), id, delta));
  }

  protected remove(id: string): void {
    if (this.openId() === id) this.openId.set(null);
    void this.svc.saveQueue(queueRemove(this.svc.queue(), id));
  }

  protected takeOffAir(): void {
    void this.svc.saveAir(null, null);
  }

  protected toggleOpen(id: string): void {
    this.openId.update((open) => (open === id ? null : id));
  }

  protected kindName(kind: InterviewKind): string {
    return KIND_NAMES[kind];
  }

  protected itemSub(it: InterviewQueueItem): string {
    const n = it.questions.length;
    return `${KIND_NAMES[it.kind]} · ${n === 0 ? 'sem pauta' : n === 1 ? '1 pergunta' : `${n} perguntas`}`;
  }

  protected initials(name: string): string {
    return initialsOf(name) || '?';
  }

  protected line(c: InterviewCandidate): string {
    return interviewLineOf(c) ?? '';
  }

  /** Grava a fila e, se o da vez é quem está no ar, regrava o card com o MESMO carimbo e a mesma
   *  duração — pergunta, chave e repórter mudam no ar sem reiniciar nada. */
  private refresh(next: InterviewQueue): void {
    const live = this.onAir();
    const card = live && live.key === currentItem(next)?.id ? this.cardFor(next, live.shownAt, live.durationSec) : null;
    if (card) void this.svc.saveAir(card, next);
    else void this.svc.saveQueue(next);
  }

  private cardFor(q: InterviewQueue, shownAt: number, durationSec: number | null): BroadcastInterview | null {
    const it = currentItem(q);
    if (!it) return null;
    return interviewCardOf({ kind: it.kind, teamId: it.teamId, uid: it.uid }, this.cardSource(), {
      durationSec,
      shownAt,
      showCampaign: q.show.campaign,
      question: currentQuestion(q),
      reporter: reporterOnAir(q),
    });
  }

  private selectionItem(): InterviewQueueItem | null {
    const c = this.selected();
    if (!c) return null;
    const kind = this.kinds().includes(this.kind()) ? this.kind() : 'atleta';
    return queueItemFor({ kind, teamId: c.teamId, uid: kind === 'atleta' ? c.uid : null }, this.cardSource());
  }

  private clearSelection(): void {
    this.selected.set(null);
    this.term.set('');
    this.searchOpen.set(false);
  }
}
