import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_BROADCAST_CONTROL, interviewWithDefaults, type BroadcastControl } from '../data/broadcast-control';
import type { BroadcastControlPatch } from '../data/broadcast-control-repository';
import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { TransmissaoDataService } from './transmissao-data.service';
import { TransmissaoComponent } from './transmissao.component';
import type { TeamRoster } from './transmissao-selectors';

function torneio(formats: string[]): OrganizerTournament {
  return {
    id: 't1',
    name: 'Copa VH',
    categories: formats.map((f, i) => ({ id: `cat${i + 1}`, name: i === 0 ? 'Feminina B' : `C${i}`, bracketFormat: f })),
    courts: [{ id: 'q1', name: 'Quadra 1', order: 1 }, { id: 'q2', name: 'Quadra 2', order: 2 }],
  } as unknown as OrganizerTournament;
}

const PARTIDA = {
  id: 'm1',
  tournamentId: 't1',
  categoryId: 'cat1',
  courtId: 'q1',
  status: 'in_progress',
  matchType: 'knockout',
  teamAId: 'ta',
  teamBId: 'tb',
  team1Label: 'Ana / Bia',
  team2Label: 'Carla / Dani',
  matchStartedAt: new Date(),
  scheduledAt: null,
} as unknown as TournamentMatch;

const ROSTERS = new Map<string, TeamRoster>([
  ['ta', { teamName: null, members: [{ uid: 'u1', name: 'Ana Souza', photoUrl: null }, { uid: 'u2', name: 'Bia Lima', photoUrl: null }] }],
  ['tb', { teamName: null, members: [{ uid: 'u3', name: 'Carla Dias', photoUrl: null }, { uid: 'u4', name: 'Dani Ávila', photoUrl: null }] }],
]);

class FakeData {
  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(torneio(['single_elimination']));
  readonly matches = signal<TournamentMatch[]>([PARTIDA]);
  readonly control = signal<BroadcastControl>({ ...DEFAULT_BROADCAST_CONTROL, courtId: 'q1' });
  readonly rosters = signal<ReadonlyMap<string, TeamRoster>>(ROSTERS);
  readonly saveError = signal(false);
  readonly saved: BroadcastControlPatch[] = [];

  save(patch: BroadcastControlPatch): Promise<void> {
    this.saved.push(patch);
    return Promise.resolve();
  }
}

async function mount(fake = new FakeData()) {
  TestBed.overrideComponent(TransmissaoComponent, {
    set: { providers: [{ provide: TransmissaoDataService, useValue: fake }] },
  });
  const fixture = TestBed.createComponent(TransmissaoComponent);
  fixture.componentRef.setInput('id', 't1');
  await fixture.whenStable();
  return { fixture, fake, el: fixture.nativeElement as HTMLElement };
}

function botao(el: HTMLElement, texto: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim().startsWith(texto));
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b as HTMLButtonElement;
}

describe('TransmissaoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransmissaoComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('passa o id da rota pro serviço', async () => {
    const { fake } = await mount();
    expect(fake.tournamentId()).toBe('t1');
  });

  it('sem categoria KOTC, o grupo King of the Court não aparece', async () => {
    const { el } = await mount();
    expect(el.textContent).not.toContain('King of the Court');
    expect(el.textContent).toContain('Placar');
  });

  it('com categoria KOTC, aparecem as linhas e a escolha do fim de rodada', async () => {
    const fake = new FakeData();
    fake.tournament.set(torneio(['king_of_court']));
    const { el } = await mount(fake);
    expect(el.textContent).toContain('Faixa da rodada');
    expect(el.textContent).toContain('Classificadas');
  });

  it('desligar o placar grava só a chave dele', async () => {
    const { el, fake } = await mount();
    (el.querySelector('button[role="switch"][aria-label="Placar"]') as HTMLButtonElement).click();
    expect(fake.saved).toEqual([{ graphics: { scoreboard: false } }]);
  });

  it('escolher a quadra grava courtId', async () => {
    const { el, fake } = await mount();
    botao(el, 'Quadra 2').click();
    expect(fake.saved).toEqual([{ courtId: 'q2' }]);
  });

  it('atalhos mostram os atletas da quadra; "Pôr no ar" grava a tarja de 20 s', async () => {
    const { el, fake, fixture } = await mount();
    botao(el, 'Ana Souza').click();
    await fixture.whenStable();
    botao(el, 'Pôr no ar').click();

    const tarja = fake.saved[0]?.interview;
    expect(tarja?.name).toBe('Ana Souza');
    expect(tarja?.partnerName).toBe('Bia Lima');
    expect(tarja?.categoryName).toBe('Feminina B');
    expect(tarja?.durationSec).toBe(20);
    expect(typeof tarja?.shownAt).toBe('number');
  });

  it('"Pôr no ar" fica desabilitado sem atleta escolhido', async () => {
    const { el } = await mount();
    expect(botao(el, 'Escolha um atleta').disabled).toBeTrue();
  });

  it('com tarja no ar mostra quem está no ar e "Tirar do ar" grava null', async () => {
    const fake = new FakeData();
    fake.control.set({
      ...DEFAULT_BROADCAST_CONTROL,
      interview: interviewWithDefaults({ name: 'Ana Souza', photoUrl: null, partnerName: null, categoryName: null, durationSec: null, shownAt: Date.now() }),
    });
    const { el } = await mount(fake);
    expect(el.textContent).toContain('No ar:');
    botao(el, 'Tirar do ar').click();
    expect(fake.saved).toEqual([{ interview: null }]);
  });

  it('"Mostrar agora" fica desabilitado com a chave desligada', async () => {
    const fake = new FakeData();
    fake.control.set({ ...DEFAULT_BROADCAST_CONTROL, graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, donation: false } });
    const { el } = await mount(fake);
    const linhas = [...el.querySelectorAll('.og-toggle-row')];
    const doacao = linhas.find((l) => l.textContent?.includes('Doação PIX'))!;
    const patro = linhas.find((l) => l.textContent?.includes('Patrocinadores'))!;
    expect((doacao.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeTrue();
    expect((patro.querySelector('.og-tx-agora') as HTMLButtonElement).disabled).toBeFalse();
  });

  it('"Mostrar agora" grava o carimbo do comando', async () => {
    const { el, fake } = await mount();
    const patro = [...el.querySelectorAll('.og-toggle-row')].find((l) => l.textContent?.includes('Patrocinadores'))!;
    (patro.querySelector('.og-tx-agora') as HTMLButtonElement).click();
    expect(typeof fake.saved[0]?.commands?.sponsorsNowAt).toBe('number');
  });

  it('"Mostrar agora" fica desabilitado com a tarja no ar — a tarja toma a tela', async () => {
    const fake = new FakeData();
    fake.control.set({
      ...DEFAULT_BROADCAST_CONTROL,
      interview: interviewWithDefaults({ name: 'Ana Souza', photoUrl: null, partnerName: null, categoryName: null, durationSec: null, shownAt: Date.now() }),
    });
    const { el } = await mount(fake);
    const agora = [...el.querySelectorAll('.og-tx-agora')] as HTMLButtonElement[];

    expect(agora.length).toBe(2);
    expect(agora.every((b) => b.disabled)).toBeTrue();
  });

  it('Grande final grava o modo escolhido', async () => {
    const { el, fake } = await mount();
    botao(el, 'Ligado').click();
    expect(fake.saved).toEqual([{ finalMode: 'on' }]);
  });

  it('erro de escrita aparece na tela', async () => {
    const fake = new FakeData();
    fake.saveError.set(true);
    const { el } = await mount(fake);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não deu pra salvar');
  });
});
