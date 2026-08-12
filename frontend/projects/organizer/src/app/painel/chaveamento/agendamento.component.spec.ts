import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
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
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    startAt: new Date(`${DAY}T09:00:00-03:00`),
    endAt: new Date(`${DAY}T22:00:00-03:00`),
    city: null,
    location: null,
    categories: [
      {
        id: 'femB',
        name: 'Feminino B',
        maxTeams: null,
        teamSize: null,
        bracketFormat: null,
        teamsPerGroup: 3,
        qualifiersPerGroup: 2,
        bestOf: null,
        uniformType: null,
        uniformNumberOnShirt: false,
        uniformNameOnShirt: false,
        uniformSizeOptionsTop: [],
        uniformSizeOptionsShorts: [],
      },
    ],
    capacity: null,
    leagueId: null,
    courts: [
      { id: 'Q1', name: 'Quadra 1', order: 1 },
      { id: 'Q2', name: 'Quadra 2', order: 2 },
    ],
    courtsCount: 2,
    matchOps: { dayStart: '08:00', dayEnd: '10:00', defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30 },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
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

  function clickButton(label: string): void {
    const btn = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').trim() === label);
    if (!btn) throw new Error(`Botão "${label}" não está na tela`);
    btn.click();
    fixture.detectChanges();
  }

  /** Largura que decide entre coluna lateral e sheet. O componente lê do
   *  `matchMedia`, mas a janela do Karma é estreita: sem fixar isto a suíte
   *  inteira cairia no modo sheet e mediria outra tela. */
  function setNarrow(value: boolean): void {
    (fixture.componentInstance as unknown as { narrow: WritableSignal<boolean> }).narrow.set(value);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    ctx = new CtxStub();
    await TestBed.configureTestingModule({
      imports: [AgendamentoComponent],
      // O `og-page-header` da tela carrega o sino, que é um `routerLink` — sem router o
      // TestBed não consegue nem instanciar a diretiva.
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ChaveamentoContextService, useValue: ctx },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AgendamentoComponent);
    setNarrow(false);
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

  /** Simula uma resposta COMPLETA do servidor sem passar pela callable: slots
   *  preenchidos e o loading desligado, senão o Aplicar fica travado pelo
   *  spinner e o teste não mede o que quer medir. */
  function setSlots(slots: Array<{ matchId: string; courtId: string; start: string; end: string }>): void {
    const cmp = fixture.componentInstance as unknown as {
      autoSlotsSignal: WritableSignal<unknown[]>;
      autoLoading: WritableSignal<boolean>;
    };
    cmp.autoSlotsSignal.set(slots);
    cmp.autoLoading.set(false);
    fixture.detectChanges();
  }

  const slotOn = (courtId: string) => ({
    matchId: 'm1',
    courtId,
    start: `${DAY}T08:00:00-03:00`,
    end: `${DAY}T08:30:00-03:00`,
  });

  it('denuncia e bloqueia Aplicar quando o servidor devolve quadra desmarcada', () => {
    openPanel();
    host().querySelector<HTMLInputElement>('.og-auto-checks input')!.click(); // desmarca Q1
    fixture.detectChanges();

    // Servidor antigo ignora courtIds e agenda na Q1 mesmo assim.
    setSlots([slotOn('Q1')]);

    expect(host().textContent).toContain('O servidor ignorou a seleção de quadras');
    const apply = Array.from(host().querySelectorAll<HTMLButtonElement>('.og-auto-actions button')).find(
      (b) => (b.textContent ?? '').trim() === 'Aplicar',
    )!;
    expect(apply.disabled).toBeTrue();
  });

  it('não denuncia nada quando o servidor respeita a seleção', () => {
    openPanel();
    host().querySelector<HTMLInputElement>('.og-auto-checks input')!.click(); // desmarca Q1
    fixture.detectChanges();

    setSlots([slotOn('Q2')]);

    expect(host().textContent).not.toContain('O servidor ignorou a seleção de quadras');
    const apply = Array.from(host().querySelectorAll<HTMLButtonElement>('.og-auto-actions button')).find(
      (b) => (b.textContent ?? '').trim() === 'Aplicar',
    )!;
    expect(apply.disabled).toBeFalse();
  });

  it('no desktop o painel é coluna: sem backdrop, sem fechar, e Esc não desfaz nada', () => {
    openPanel();
    expect(host().querySelector('.og-auto-backdrop')).toBeNull();
    expect(host().querySelector('.og-auto-close')).toBeNull();
    expect(host().querySelector('.og-auto-panel.sheet')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(host().textContent).toContain('Gerar grade do dia');
  });

  describe('no estreito (celular e tablet retrato)', () => {
    beforeEach(() => setNarrow(true));

    it('abre como sheet sobre a grade, com backdrop e botão de fechar', () => {
      openPanel();

      expect(host().querySelector('.og-auto-panel.sheet')).not.toBeNull();
      expect(host().querySelector('.og-auto-backdrop')).not.toBeNull();
      expect(host().querySelector('.og-auto-close')).not.toBeNull();
      // O Cancelar do rodapé dá lugar ao "Ver na grade" — quem cancela é o ×.
      expect(texts('.og-auto-actions button')).toEqual(['Ver na grade', 'Recalcular', 'Aplicar']);
    });

    it('"Ver na grade" recolhe pra barra fina sem perder a configuração', () => {
      openPanel();
      host().querySelector<HTMLInputElement>('.og-auto-checks input')!.click(); // desmarca Q1
      fixture.detectChanges();

      clickButton('Ver na grade');

      expect(host().querySelector('.og-auto-minibar')).not.toBeNull();
      expect(host().querySelector('.og-auto-panel')).toBeNull();
      expect(host().querySelector('.og-auto-backdrop')).toBeNull();
      // A grade continua sob o comando do painel: a quadra desmarcada segue apagada
      // e o agendamento manual, travado.
      expect(host().querySelectorAll('.og-agenda-column.off').length).toBe(1);
      expect(Array.from(host().querySelectorAll<HTMLButtonElement>('.og-agenda-slot')).every((s) => s.disabled)).toBeTrue();
      expect(host().textContent).not.toContain('Fila de partidas');
    });

    it('Ajustar traz o sheet de volta com a quadra ainda desmarcada', () => {
      openPanel();
      host().querySelector<HTMLInputElement>('.og-auto-checks input')!.click();
      fixture.detectChanges();
      clickButton('Ver na grade');

      clickButton('Ajustar');

      expect(host().querySelector('.og-auto-panel.sheet')).not.toBeNull();
      expect(host().querySelector('.og-auto-minibar')).toBeNull();
      expect(host().querySelector<HTMLInputElement>('.og-auto-checks input')!.checked).toBeFalse();
    });

    it('reabrir depois de ter recolhido volta expandido', () => {
      openPanel();
      clickButton('Ver na grade');
      (fixture.componentInstance as unknown as { closeAuto(): void }).closeAuto();
      fixture.detectChanges();

      openPanel();

      expect(host().querySelector('.og-auto-panel.sheet')).not.toBeNull();
      expect(host().querySelector('.og-auto-minibar')).toBeNull();
    });

    it('Esc fecha o sheet e devolve a fila', () => {
      openPanel();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();

      expect(host().textContent).toContain('Fila de partidas');
      expect(host().textContent).not.toContain('Gerar grade do dia');
    });

    it('voltar pro desktop com o sheet recolhido devolve a coluna lateral', () => {
      openPanel();
      clickButton('Ver na grade');

      // Girar o tablet pra paisagem no meio da configuração não pode deixar o
      // painel escondido atrás de uma barra que só existe no estreito.
      setNarrow(false);

      expect(host().querySelector('.og-auto-minibar')).toBeNull();
      expect(host().textContent).toContain('Gerar grade do dia');
    });
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

/** A media query de tablet/celular e a regra base de `.og-agenda` têm a MESMA
 *  especificidade — quem vier por último no arquivo vence. Com a base depois da
 *  media query o `height:70dvh` era descartado em toda largura, a grade esticava
 *  pro conteúdo inteiro e a rolagem interna das horas vazava pro documento. */
describe('AgendamentoComponent — altura da grade por largura', () => {
  const WRAPPER_H = 300;
  let ngContentAttr: string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgendamentoComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ChaveamentoContextService, useValue: new CtxStub() },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AgendamentoComponent);
    fixture.detectChanges();
    // O seletor compilado é `.og-agenda[_ngcontent-xxx]`; sem esse atributo o
    // elemento de teste não casa com nenhuma regra do componente.
    const agenda = (fixture.nativeElement as HTMLElement).querySelector('.og-agenda')!;
    ngContentAttr = Array.from(agenda.attributes)
      .map((a) => a.name)
      .find((name) => name.startsWith('_ngcontent'))!;
    expect(ngContentAttr).toBeDefined();
  });

  /** Mede `.og-agenda` numa viewport de tamanho controlado. O iframe é o único
   *  jeito de escolher a largura que a media query enxerga — a janela do Karma
   *  não é ajustável. O wrapper de altura fixa dá base pro `height:100%` da
   *  regra base, então os dois caminhos rendem números distintos. */
  function agendaHeightAt(width: number, height: number): number {
    const frame = document.createElement('iframe');
    frame.width = String(width);
    frame.height = String(height);
    // A borda padrão de 2px do iframe sai da viewport de dentro e desalinharia o dvh.
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    for (const style of Array.from(document.querySelectorAll('style'))) {
      doc.head.appendChild(doc.importNode(style, true));
    }
    doc.body.innerHTML =
      `<div style="margin:0;height:${WRAPPER_H}px"><div class="og-agenda" ${ngContentAttr}></div></div>`;
    const measured = doc.querySelector('.og-agenda')!.getBoundingClientRect().height;
    frame.remove();
    return Math.round(measured);
  }

  it('dá altura própria à grade no celular (70dvh)', () => {
    expect(agendaHeightAt(375, 812)).toBe(Math.round(812 * 0.7));
  });

  it('dá altura própria à grade no tablet em retrato (70dvh)', () => {
    expect(agendaHeightAt(768, 1024)).toBe(Math.round(1024 * 0.7));
  });

  it('no desktop mantém a grade dividindo a altura da coluna (100%)', () => {
    expect(agendaHeightAt(1280, 800)).toBe(WRAPPER_H);
  });
});
