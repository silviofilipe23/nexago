import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, type ParamMap } from '@angular/router';
import { of } from 'rxjs';
import type { LiveMatch, LivePointEvent, ScoreSet } from '@nexago/live-scoring';
import { MesaLiveComponent } from './mesa-live.component';
import { EMPTY_HEADER, MesaLiveGateway } from './mesa-live.gateway';
import { EMPTY_TEAM_NAMES } from './mesa-team-names';

interface RecordedPoint {
  matchId: string;
  matchUpdate: Record<string, unknown>;
  pointEvent: Record<string, unknown>;
}

/** Dublê do gateway: guarda o que a mesa MANDARIA gravar — é esse payload que precisa ser
 *  idêntico ao da mesa do organizador e ao da mesa I1 do app. */
class FakeGateway {
  readonly available = true;
  readonly points: RecordedPoint[] = [];
  readonly fields: Array<{ matchId: string; fields: Record<string, unknown> }> = [];
  readonly started: string[] = [];
  readonly submitted: Array<{ matchId: string; sets: readonly ScoreSet[]; bestOf: number }> = [];
  readonly validated: string[] = [];

  private emitMatch: ((m: LiveMatch | null) => void) | null = null;
  private emitEvents: ((events: LivePointEvent[]) => void) | null = null;

  watchMatch(_matchId: string, onChange: (m: LiveMatch | null) => void): () => void {
    this.emitMatch = onChange;
    return () => undefined;
  }

  watchEvents(_matchId: string, onChange: (events: LivePointEvent[]) => void): () => void {
    this.emitEvents = onChange;
    return () => undefined;
  }

  push(match: LiveMatch | null): void {
    this.emitMatch?.(match);
  }

  pushEvents(events: LivePointEvent[]): void {
    this.emitEvents?.(events);
  }

  recordPoint(params: RecordedPoint): Promise<void> {
    this.points.push(params);
    return Promise.resolve();
  }

  updateFields(matchId: string, fields: Record<string, unknown>): Promise<void> {
    this.fields.push({ matchId, fields });
    return Promise.resolve();
  }

  start(matchId: string): Promise<unknown> {
    this.started.push(matchId);
    return Promise.resolve({});
  }

  submitSets(matchId: string, sets: readonly ScoreSet[], bestOf: number): Promise<{ completed?: boolean }> {
    this.submitted.push({ matchId, sets, bestOf });
    return Promise.resolve({ completed: true });
  }

  validate(matchId: string): Promise<unknown> {
    this.validated.push(matchId);
    return Promise.resolve({});
  }

  teamNames(): Promise<typeof EMPTY_TEAM_NAMES> {
    return Promise.resolve(EMPTY_TEAM_NAMES);
  }

  header(): Promise<typeof EMPTY_HEADER> {
    return Promise.resolve({ tournamentName: 'Etapa Rio', categoryName: 'Masculino A' });
  }

  role: 'manager' | 'scorer' | null = 'manager';

  myStaffRole(): Promise<'manager' | 'scorer' | null> {
    return Promise.resolve(this.role);
  }
}

function liveMatch(partial: Partial<LiveMatch> = {}): LiveMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    teamAId: 'time-a',
    teamBId: 'time-b',
    teamADescription: 'Ana / Bia',
    teamBDescription: 'Carla / Duda',
    status: 'in_progress',
    matchType: 'semifinal',
    round: 2,
    poolId: '',
    matchNumber: 7,
    sets: [{ a: 14, b: 12 }],
    currentSetIndex: 0,
    bestOf: 3,
    servingTeamId: 'time-a',
    matchStartedAt: new Date('2026-08-29T13:00:00Z'),
    winnerId: null,
    courtName: '2',
    scheduleTime: null,
    ...partial,
  };
}

function routeStub(): ActivatedRoute {
  const paramMap: ParamMap = convertToParamMap({ tournamentId: 't1', matchId: 'm1' });
  return { paramMap: of(paramMap), snapshot: { paramMap } } as unknown as ActivatedRoute;
}

describe('MesaLiveComponent', () => {
  let gateway: FakeGateway;
  let fixture: ComponentFixture<MesaLiveComponent>;

  beforeEach(() => {
    gateway = new FakeGateway();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeStub() },
        { provide: MesaLiveGateway, useValue: gateway },
      ],
    });
    fixture = TestBed.createComponent(MesaLiveComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function pointButtons(): HTMLButtonElement[] {
    return Array.from(el().querySelectorAll<HTMLButtonElement>('.mesa-side'));
  }

  function minusButtons(): HTMLButtonElement[] {
    return Array.from(el().querySelectorAll<HTMLButtonElement>('.mesa-minus'));
  }

  function byText(text: string): HTMLButtonElement | undefined {
    return Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(text));
  }

  it('mostra o placar do set corrente e os sets vencidos vindos do doc', () => {
    gateway.push(liveMatch({ sets: [{ a: 21, b: 15 }, { a: 14, b: 12 }], currentSetIndex: 1 }));
    fixture.detectChanges();

    // Dois dígitos, como no painel de quadra.
    expect(Array.from(el().querySelectorAll('.mesa-num')).map((n) => n.textContent?.trim())).toEqual(['14', '12']);
    expect(el().querySelector('.mesa-setsw')?.textContent?.replace(/\s/g, '')).toBe('1·0');
  });

  it('ponto grava a transação com sets, saque e o par resultA/resultB', async () => {
    gateway.push(liveMatch());
    fixture.detectChanges();

    pointButtons()[0]!.click();
    await fixture.whenStable();

    expect(gateway.points.length).toBe(1);
    const { matchId, matchUpdate, pointEvent } = gateway.points[0]!;
    expect(matchId).toBe('m1');
    expect(matchUpdate['sets']).toEqual([jasmine.objectContaining({ a: 15, b: 12 })]);
    expect(matchUpdate['currentSetIndex']).toBe(0);
    expect(matchUpdate['status']).toBe('In Progress');
    expect(matchUpdate['servingTeamId']).toBe('time-a');
    expect(matchUpdate['resultA']).toBe('0');
    expect(matchUpdate['resultB']).toBe('0');
    expect(matchUpdate['winnerId']).toBeUndefined();
    expect(pointEvent).toEqual(jasmine.objectContaining({ type: 'point', side: 'A', setIndex: 0, scoreA: 15, scoreB: 12 }));
  });

  it('o ponto que fecha a partida grava Completed + winnerId — é o que dispara o avanço da chave', async () => {
    gateway.push(liveMatch({ sets: [{ a: 21, b: 15 }, { a: 20, b: 10 }], currentSetIndex: 1 }));
    fixture.detectChanges();

    pointButtons()[0]!.click();
    await fixture.whenStable();

    const { matchUpdate } = gateway.points[0]!;
    expect(matchUpdate['status']).toBe('Completed');
    expect(matchUpdate['winnerId']).toBe('time-a');
    expect(matchUpdate['resultA']).toBe('2');
    expect(matchUpdate['resultB']).toBe('0');
  });

  it('partida agendada não pontua: os botões ficam travados e a ação é iniciar', async () => {
    gateway.push(liveMatch({ status: 'scheduled', sets: [], matchStartedAt: null }));
    fixture.detectChanges();

    expect(pointButtons().every((b) => b.disabled)).toBeTrue();

    byText('Iniciar partida')!.click();
    await fixture.whenStable();

    expect(gateway.started).toEqual(['m1']);
    expect(gateway.points.length).toBe(0);
  });

  it('desfazer só libera do lado que marcou o último ponto', async () => {
    gateway.push(liveMatch());
    gateway.pushEvents([{ id: 'e1', seq: 1, type: 'point', side: 'B', setIndex: 0, scoreA: 14, scoreB: 12, ts: null }]);
    fixture.detectChanges();

    const [minusA, minusB] = minusButtons();
    expect(minusA!.disabled).toBeTrue();
    expect(minusB!.disabled).toBeFalse();

    minusB!.click();
    await fixture.whenStable();

    const { matchUpdate, pointEvent } = gateway.points[0]!;
    expect(matchUpdate['sets']).toEqual([jasmine.objectContaining({ a: 14, b: 11 })]);
    expect(matchUpdate['status']).toBe('In Progress');
    expect(pointEvent).toEqual(jasmine.objectContaining({ type: 'undo-point', side: 'B' }));
  });

  it('modo exibição mantém voltar e sair FORA dos painéis — controle sobre o painel vira ponto marcado sem querer', () => {
    gateway.push(liveMatch());
    fixture.detectChanges();

    el().querySelector<HTMLButtonElement>('[aria-label="Modo exibição para os atletas"]')!.click();
    fixture.detectChanges();

    const back = el().querySelector<HTMLAnchorElement>('a.mesa-midctl');
    expect(back?.getAttribute('href')).toBe('/mesa/t1');
    expect(el().querySelector('button.mesa-midctl[aria-label="Sair do modo exibição"]')).not.toBeNull();
    // Os dois controles vivem na faixa central, que não marca ponto.
    expect(el().querySelectorAll('.mesa-side .mesa-midctl').length).toBe(0);
    expect(gateway.points.length).toBe(0);
  });

  it('mesário vê o formato só como rótulo — trocar MD3/set único é do organizador, e as rules negam', async () => {
    gateway.role = 'scorer';
    gateway.push(liveMatch());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byText('melhor de 3')).toBeUndefined();
    expect(el().querySelector('.mesa-sets .mesa-chip')?.textContent).toContain('melhor de 3');
  });

  it('gestor troca o formato pelo chip', async () => {
    gateway.role = 'manager';
    gateway.push(liveMatch());
    await fixture.whenStable();
    fixture.detectChanges();

    byText('melhor de 3')!.click();
    await fixture.whenStable();

    expect(gateway.fields[0]?.fields['bestOf']).toBe(1);
  });

  it('partida sem as duas duplas não abre a mesa', () => {
    gateway.push(liveMatch({ teamBId: '', status: 'scheduled' }));
    fixture.detectChanges();

    expect(pointButtons().length).toBe(0);
    expect(el().textContent).toContain('Aguardando as duas duplas');
  });

  it('placar por sets só envia quando o placar decide a partida', async () => {
    gateway.push(liveMatch({ status: 'completed', sets: [{ a: 21, b: 15 }], winnerId: 'time-a' }));
    fixture.detectChanges();

    byText('Placar')!.click();
    fixture.detectChanges();

    // Um set fechado não vence um MD3: o botão fica travado com a mensagem do app.
    const saveButton = () => byText('Salvar placar')!;
    expect(saveButton().disabled).toBeTrue();
    expect(el().textContent).toContain('Complete o placar: nenhuma dupla venceu ainda.');

    const inputs = Array.from(el().querySelectorAll<HTMLInputElement>('.mesa-input'));
    inputs[0]!.value = '21';
    inputs[0]!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    byText('Adicionar set')!.click();
    fixture.detectChanges();

    const second = Array.from(el().querySelectorAll<HTMLInputElement>('.mesa-input')).slice(2);
    second[0]!.value = '21';
    second[0]!.dispatchEvent(new Event('input'));
    second[1]!.value = '18';
    second[1]!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(saveButton().disabled).toBeFalse();
    saveButton().click();
    await fixture.whenStable();

    expect(gateway.submitted.length).toBe(1);
    expect(gateway.submitted[0]!.sets).toEqual([
      { a: 21, b: 15 },
      { a: 21, b: 18 },
    ]);
    expect(gateway.submitted[0]!.bestOf).toBe(3);
  });
});
