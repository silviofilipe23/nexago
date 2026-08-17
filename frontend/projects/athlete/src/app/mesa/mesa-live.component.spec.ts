import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, type ParamMap } from '@angular/router';
import { of } from 'rxjs';
import { statusOf, type LiveMatch, type LivePointEvent, type PointWrite, type ScoreSet } from '@nexago/live-scoring';
import { MesaLiveComponent } from './mesa-live.component';
import { EMPTY_HEADER, MesaLiveGateway } from './mesa-live.gateway';
import { EMPTY_TEAM_NAMES } from './mesa-team-names';

interface RecordedPoint {
  matchId: string;
  matchUpdate: Record<string, unknown>;
  pointEvent: Record<string, unknown>;
}

interface RecordPointParams {
  matchId: string;
  build: (match: LiveMatch) => PointWrite | null;
}

/** Dublê do gateway: guarda o que a mesa MANDARIA gravar — é esse payload que precisa ser
 *  idêntico ao da mesa do organizador e ao da mesa I1 do app.
 *
 *  O dublê também faz o papel do SERVIDOR: mantém o doc autoritativo e aplica nele o que a
 *  transação grava, sem reemitir o snapshot pra tela. É assim que a corrida de produção
 *  acontece — a transação já commitou e a watch stream ainda não entregou a versão nova
 *  (transação do Firestore não tem latency compensation), então a mesa segue enxergando o doc
 *  velho por algumas dezenas de milissegundos. */
class FakeGateway {
  readonly available = true;
  readonly points: RecordedPoint[] = [];
  readonly fields: Array<{ matchId: string; fields: Record<string, unknown> }> = [];
  readonly started: string[] = [];
  readonly submitted: Array<{ matchId: string; sets: readonly ScoreSet[]; bestOf: number }> = [];
  readonly validated: string[] = [];

  private emitMatch: ((m: LiveMatch | null) => void) | null = null;
  private emitEvents: ((events: LivePointEvent[]) => void) | null = null;
  private server: LiveMatch | null = null;

  watchMatch(_matchId: string, onChange: (m: LiveMatch | null) => void): () => void {
    this.emitMatch = onChange;
    return () => undefined;
  }

  watchEvents(_matchId: string, onChange: (events: LivePointEvent[]) => void): () => void {
    this.emitEvents = onChange;
    return () => undefined;
  }

  push(match: LiveMatch | null): void {
    this.server = match;
    this.emitMatch?.(match);
  }

  pushEvents(events: LivePointEvent[]): void {
    this.emitEvents?.(events);
  }

  /** Sets do doc autoritativo — o placar que a partida REALMENTE tem depois das escritas. */
  serverSets(): ScoreSet[] {
    return (this.server?.sets ?? []).map((s) => ({ a: s.a, b: s.b }));
  }

  /** Papel da transação: monta a escrita sobre o doc AUTORITATIVO, não sobre o que a tela vê. */
  recordPoint(params: RecordPointParams): Promise<PointWrite | null> {
    if (!this.server) return Promise.reject(new Error('Partida não encontrada'));
    const written = params.build(this.server);
    if (!written) return Promise.resolve(null);
    this.points.push({ matchId: params.matchId, matchUpdate: written.matchUpdate, pointEvent: written.pointEvent });
    this.applyToServer(written.matchUpdate);
    return Promise.resolve(written);
  }

  /** Commit da transação no doc autoritativo — só o que a mesa escreve e a tela relê. */
  private applyToServer(matchUpdate: Record<string, unknown>): void {
    if (!this.server) return;
    const raw = matchUpdate['sets'];
    const sets = Array.isArray(raw)
      ? raw.map((s) => {
          const o = s as Record<string, unknown>;
          return { a: Number(o['a'] ?? 0), b: Number(o['b'] ?? 0) };
        })
      : this.server.sets;
    const idx = matchUpdate['currentSetIndex'];
    const winner = matchUpdate['winnerId'];
    this.server = {
      ...this.server,
      sets,
      currentSetIndex: typeof idx === 'number' ? idx : this.server.currentSetIndex,
      status: statusOf(matchUpdate['status']),
      winnerId: typeof winner === 'string' ? winner : null,
    };
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

  it('dois toques antes do snapshot voltar andam o placar duas vezes — não repetem o mesmo ponto', async () => {
    gateway.push(liveMatch()); // 14×12 no set 0
    fixture.detectChanges();

    pointButtons()[0]!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Nenhum `push` aqui de propósito: a mesa ainda enxerga 14×12 enquanto o servidor já
    // está em 15×12. É a janela onde o mesário toca de novo (medida em produção: ~95–160ms).
    pointButtons()[0]!.click();
    await fixture.whenStable();

    expect(gateway.points.length).toBe(2);
    expect(gateway.points[0]!.pointEvent).toEqual(jasmine.objectContaining({ scoreA: 15, scoreB: 12 }));
    expect(gateway.points[1]!.pointEvent).toEqual(jasmine.objectContaining({ scoreA: 16, scoreB: 12 }));
    expect(gateway.serverSets()).toEqual([{ a: 16, b: 12 }]);
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

  it('partida sem as duas duplas não abre a mesa', () => {
    gateway.push(liveMatch({ teamBId: '', status: 'scheduled' }));
    fixture.detectChanges();

    expect(pointButtons().length).toBe(0);
    expect(el().textContent).toContain('Aguardando as duas duplas');
  });

  function askButtons(): HTMLButtonElement[] {
    return Array.from(el().querySelectorAll<HTMLButtonElement>('.mesa-askbtn'));
  }

  function askButtonFor(team: string): HTMLButtonElement {
    const btn = askButtons().find((b) => (b.getAttribute('aria-label') ?? '').includes(team));
    if (!btn) throw new Error(`A mesa não oferece o saque inicial para "${team}"`);
    return btn;
  }

  describe('quem começa sacando', () => {
    it('pergunta enquanto ninguém está com o saque, com as duas duplas como resposta', () => {
      gateway.push(liveMatch({ servingTeamId: '', status: 'scheduled', sets: [], matchStartedAt: null }));
      fixture.detectChanges();

      expect(el().textContent).toContain('Quem começa sacando?');
      expect(askButtons().length).toBe(2);
    });

    it('escolher grava o saque da dupla escolhida — e não marca ponto nenhum', async () => {
      gateway.push(liveMatch({ servingTeamId: '', status: 'scheduled', sets: [], matchStartedAt: null }));
      fixture.detectChanges();

      askButtonFor('Carla / Duda').click();
      await fixture.whenStable();

      expect(gateway.fields).toEqual([{ matchId: 'm1', fields: { servingTeamId: 'time-b' } }]);
      expect(gateway.points.length).toBe(0);
      expect(gateway.started.length).toBe(0);
    });

    it('com o saque já definido a pergunta sai da tela', () => {
      gateway.push(liveMatch({ servingTeamId: 'time-a' }));
      fixture.detectChanges();

      expect(el().textContent).not.toContain('Quem começa sacando?');
      expect(askButtons().length).toBe(0);
    });

    it('modo exibição não pergunta — a tela está virada para os atletas', () => {
      gateway.push(liveMatch({ servingTeamId: '', status: 'scheduled', sets: [], matchStartedAt: null }));
      fixture.detectChanges();

      el().querySelector<HTMLButtonElement>('[aria-label="Modo exibição para os atletas"]')!.click();
      fixture.detectChanges();

      expect(askButtons().length).toBe(0);
    });

    /** A mesa é um grid de linhas fixas e a faixa entra como uma linha NOVA. Sem acertar
     *  `grid-template-rows` os dois painéis de dupla (as linhas `1fr`) saem de lugar e o placar
     *  quebra — dá pra ver medindo o grid de verdade no navegador. */
    it('a faixa abre uma linha própria no grid, sem deslocar os painéis das duplas', () => {
      gateway.push(liveMatch({ servingTeamId: 'time-a' }));
      fixture.detectChanges();
      const withoutAsk = getComputedStyle(el()).gridTemplateRows.split(' ');

      gateway.push(liveMatch({ servingTeamId: '', status: 'scheduled', sets: [], matchStartedAt: null }));
      fixture.detectChanges();
      const withAsk = getComputedStyle(el()).gridTemplateRows.split(' ');

      expect(withoutAsk.length).toBe(6);
      expect(withAsk.length).toBe(7);

      // O que quebraria de fato: as duas linhas `1fr` saírem dos painéis das duplas. Com a faixa
      // na tela os dois painéis continuam dividindo a sobra em partes iguais.
      const panels = Array.from(el().querySelectorAll('.mesa-sidewrap')).map((p) => p.getBoundingClientRect().height);
      expect(panels.length).toBe(2);
      expect(Math.abs(panels[0]! - panels[1]!)).toBeLessThan(1);
      expect(panels[0]!).toBeGreaterThan(60);
    });

    it('partida encerrada não pergunta mais, mesmo sem saque no doc', () => {
      gateway.push(liveMatch({ servingTeamId: '', status: 'completed', sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }], winnerId: 'time-a' }));
      fixture.detectChanges();

      expect(askButtons().length).toBe(0);
    });
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
