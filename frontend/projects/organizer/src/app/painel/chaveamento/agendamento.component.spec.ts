import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { AgendamentoComponent } from './agendamento.component';
import { ChaveamentoContextService } from './chaveamento-context.service';
import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament } from '../data/tournament.model';

const DAY = '2026-10-24';

function tournamentFixture(): OrganizerTournament {
  return {
    id: 't1',
    name: 'Copa Teste',
    managerId: 'u1',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    startAt: new Date(`${DAY}T09:00:00-03:00`),
    endAt: new Date(`${DAY}T22:00:00-03:00`),
    city: null,
    location: null,
    categories: [{ id: 'femB', name: 'Feminino B', maxTeams: null, bracketFormat: null, teamsPerGroup: 3, qualifiersPerGroup: 2, bestOf: null }],
    capacity: null,
    leagueId: null,
    courts: [
      { id: 'Q1', name: 'Quadra 1', order: 1 },
      { id: 'Q2', name: 'Quadra 2', order: 2 },
    ],
    courtsCount: 2,
    matchOps: { dayStart: '08:00', dayEnd: '10:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30 },
    bigScreen: null,
  };
}

function matchFixture(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'femB',
    round: 'Grupo A',
    team1Label: 'Ana/Bia',
    team2Label: 'Cah/Dud',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: 'a',
    teamBId: 'b',
    sets: [],
    courtId: '',
    scheduleEndAt: null,
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    teamADescription: null,
    teamBDescription: null,
    ...overrides,
  } as TournamentMatch;
}

/** Stub do contexto compartilhado — a tela só lê signals/computeds daqui. */
class CtxStub {
  readonly loadingTournaments = signal(false);
  readonly loadingMatches = signal(false);
  readonly tournaments = signal([tournamentFixture()]);
  readonly tournament = signal<OrganizerTournament | null>(tournamentFixture());
  readonly selectedCategoryId = signal<string | null>('femB');
  readonly categoryName = signal<string | null>('Feminino B');
  // A tela só monta a grade quando há chave gerada.
  readonly matches = signal<TournamentMatch[]>([matchFixture()]);
  readonly matchesFiltered = signal<TournamentMatch[]>([matchFixture()]);
  reloadMatches = jasmine.createSpy('reloadMatches').and.resolveTo(undefined);
}

describe('AgendamentoComponent — painel de auto-agendamento', () => {
  let fixture: ComponentFixture<AgendamentoComponent>;
  let ctx: CtxStub;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function texts(selector: string): string[] {
    return Array.from(host().querySelectorAll(selector)).map((el) => (el.textContent ?? '').trim());
  }

  beforeEach(async () => {
    ctx = new CtxStub();
    await TestBed.configureTestingModule({
      imports: [AgendamentoComponent],
      providers: [provideZonelessChangeDetection(), { provide: ChaveamentoContextService, useValue: ctx }],
    }).compileComponents();
    fixture = TestBed.createComponent(AgendamentoComponent);
    fixture.detectChanges();
  });

  function openPanel(): void {
    // A prévia dispara uma callable real (rejeita sem backend) — o painel abre
    // do mesmo jeito, que é o que este teste verifica.
    (fixture.componentInstance as unknown as { openAuto(): void }).openAuto();
    fixture.detectChanges();
  }

  it('mostra a fila até abrir o painel', () => {
    expect(host().textContent).toContain('Fila de partidas');
    expect(host().textContent).not.toContain('Gerar grade do dia');
  });

  it('abre o painel com os controles do app', () => {
    openPanel();
    const text = host().textContent ?? '';
    expect(text).toContain('Gerar grade do dia');
    expect(text).toContain('Começar a partir das');
    expect(text).toContain('Quadras');
    expect(text).toContain('Evitar conflito de atletas');
    expect(text).toContain('Respeitar dependências da chave');
  });

  it('oferece os horários de início de 30 em 30 dentro da jornada', () => {
    openPanel();
    const chips = texts('.og-auto-field .og-chip').filter((t) => /^\d{2}:\d{2}$/.test(t));
    expect(chips).toEqual(['08:00', '08:30', '09:00', '09:30']);
  });

  it('lista as quadras do torneio, todas marcadas por padrão', () => {
    openPanel();
    const boxes = Array.from(host().querySelectorAll<HTMLInputElement>('.og-auto-checks input'));
    expect(boxes.length).toBe(2);
    expect(boxes.every((b) => b.checked)).toBeTrue();
  });

  it('desmarcar quadra desliga a coluna na grade', () => {
    openPanel();
    const first = host().querySelector<HTMLInputElement>('.og-auto-checks input')!;
    first.click();
    fixture.detectChanges();

    expect(first.checked).toBeFalse();
    expect(host().querySelectorAll('.og-agenda-column.off').length).toBe(1);
    expect(host().querySelectorAll('.og-agenda-col-label.off').length).toBe(1);
    expect(host().textContent).not.toContain('Selecione ao menos uma quadra.');
  });

  it('avisa e trava o Aplicar quando nenhuma quadra sobra', () => {
    openPanel();
    for (const box of Array.from(host().querySelectorAll<HTMLInputElement>('.og-auto-checks input'))) box.click();
    fixture.detectChanges();

    expect(host().textContent).toContain('Selecione ao menos uma quadra.');
    const apply = Array.from(host().querySelectorAll<HTMLButtonElement>('.og-auto-actions button')).find(
      (b) => (b.textContent ?? '').trim() === 'Aplicar',
    )!;
    expect(apply.disabled).toBeTrue();
  });

  it('oferece alternar entre categoria e torneio inteiro', () => {
    openPanel();
    expect(texts('.og-auto-field .og-chip')).toContain('Só Feminino B');
    expect(texts('.og-auto-field .og-chip')).toContain('Torneio inteiro');
  });

  it('trava o agendamento manual enquanto o painel está aberto', () => {
    openPanel();
    const slots = Array.from(host().querySelectorAll<HTMLButtonElement>('.og-agenda-slot'));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.disabled)).toBeTrue();
  });

  it('Cancelar volta pra fila', () => {
    openPanel();
    const cancel = Array.from(host().querySelectorAll<HTMLButtonElement>('.og-auto-actions button')).find(
      (b) => (b.textContent ?? '').trim() === 'Cancelar',
    )!;
    cancel.click();
    fixture.detectChanges();

    expect(host().textContent).toContain('Fila de partidas');
    expect(host().textContent).not.toContain('Gerar grade do dia');
  });

  it('mostra na grade o que já está agendado em outra categoria, apagado', () => {
    const foreign = matchFixture({
      id: 'm9',
      categoryId: 'mascA',
      courtId: 'Q1',
      scheduledAt: new Date(`${DAY}T08:00:00-03:00`),
      scheduleEndAt: new Date(`${DAY}T08:30:00-03:00`),
    });
    ctx.matches.set([matchFixture(), foreign]);
    ctx.matchesFiltered.set([matchFixture()]);
    fixture.detectChanges();

    // Sem o painel a tela respeita o filtro de categoria.
    expect(host().querySelectorAll('.og-agenda-block').length).toBe(0);

    openPanel();
    const blocks = host().querySelectorAll('.og-agenda-block.foreign');
    expect(blocks.length).toBe(1);
  });
});
