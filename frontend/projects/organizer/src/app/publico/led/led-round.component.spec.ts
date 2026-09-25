import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OverlayKocView } from '../overlay/overlay-selectors';
import { LedRoundComponent, type LedRoundInfo, type LedTeam } from './led-round.component';

function view(overrides: Partial<OverlayKocView> = {}): OverlayKocView {
  return {
    kind: 'koc',
    phase: 'live',
    roundTitle: 'Classificatória · Rodada 3/7',
    bar: {
      blocks: [
        { role: 'queue', teamId: 'q1', points: 8, nextUp: false },
        { role: 'queue', teamId: 'q2', points: 10, nextUp: false },
        { role: 'queue', teamId: 'q3', points: 1, nextUp: true },
        { role: 'challenger', teamId: 'd', points: 14, nextUp: false },
        { role: 'king', teamId: 'k', points: 4, nextUp: false },
      ],
      streak: null,
      clock: { label: '02:43', paused: false },
    },
    ...overrides,
  };
}

function info(overrides: Partial<LedRoundInfo> = {}): LedRoundInfo {
  return {
    matchType: 'koc_round',
    roundLabel: 3,
    batteryLabel: 1,
    poolId: 'C1',
    totalRounds: 7,
    bracketsInPhase: 3,
    ...overrides,
  };
}

function duo(a: string, b: string, photos: [string | null, string | null] = [null, null]): LedTeam {
  return {
    players: [
      { name: a, initials: a.slice(0, 2).toUpperCase(), photoUrl: photos[0] },
      { name: b, initials: b.slice(0, 2).toUpperCase(), photoUrl: photos[1] },
    ],
  };
}

const TEAMS = new Map<string, LedTeam>([
  ['k', duo('Van', 'Aye')],
  ['d', duo('Bro', 'Dau')],
  ['q1', duo('Hölting Nilsson', 'Berger')],
  ['q2', duo('Batrane', 'Tiisaar')],
  ['q3', duo('Sor', 'Ham')],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(LedRoundComponent);
  const all = {
    view: view(),
    info: info(),
    teams: TEAMS,
    categoryName: 'Masculino B',
    courtName: 'Quadra 2',
    ...inputs,
  };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('LedRoundComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedRoundComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada sem rodada', async () => {
    expect(host(await render({ view: null })).querySelector('.tela')).toBeNull();
  });

  it('leva a marca da nexaGO, sem flutuar por cima do conteúdo', async () => {
    const marca = host(await render()).querySelector('og-overlay-mark');

    expect(marca).not.toBeNull();
    // No LED os cantos direitos têm dono (relógio, fila), então ela entra no cabeçalho.
    expect(marca?.getAttribute('data-flow')).toBe('true');
  });

  it('mostra rodada, categoria, quadra e relógio', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Rodada');
    expect(text).toContain('3');
    expect(text).toContain('7');
    expect(text).toContain('Masculino B');
    expect(text).toContain('Quadra 2');
    expect(text).toContain('02:43');
  });

  it('com mais de uma bateria, o topo gigante conta a BATERIA e a chave migra pro contexto', async () => {
    const text = (
      host(await render({ info: info({ poolId: 'C4', batteryLabel: 3, bracketsInPhase: 4 }) }))
        .textContent ?? ''
    ).replace(/\s+/g, ' ');

    expect(text).toContain('Bateria');
    expect(text).toContain('3');
    expect(text).toContain('Chave 4');
    // "3/" seria a mesma barra pendurada do bug de antes — não existe mais rodada global aqui.
    expect(text).not.toMatch(/3\s*\//);
    expect(text).toContain('Masculino B');
    expect(text).toContain('Quadra 2');
  });

  it('numa fase de chave única, a bateria manda no topo e a chave não entra no contexto', async () => {
    // Semi de 6 duplas com 4 baterias (o caso de 10 duplas com teto 6): só
    // existe uma quadra, "Chave 1" não distingue nada.
    const text = (
      host(
        await render({
          info: info({ matchType: 'koc_semifinal', poolId: 'C1', batteryLabel: 2, bracketsInPhase: 1 }),
        }),
      ).textContent ?? ''
    ).replace(/\s+/g, ' ');

    expect(text).toContain('Bateria');
    expect(text).not.toContain('Chave');
  });

  it('a final não inventa "Rodada" nem um número — o nome da fase É o título', async () => {
    // O cabeçalho saía do título já renderizado ("Final") por regex: sem
    // dígito nenhum, o painel escrevia "Rodada" e um número vazio.
    const h = host(await render({ info: info({ matchType: 'koc_final', roundLabel: 0, poolId: 'C1', bracketsInPhase: 1 }) }));
    const topo = (h.querySelector('.rodada')?.textContent ?? '').replace(/\s+/g, ' ').trim();

    expect(topo).toBe('Final');
    expect(topo).not.toContain('Rodada');
  });

  it('a semifinal de bateria única mostra "Semifinal" no topo', async () => {
    const h = host(
      await render({ info: info({ matchType: 'koc_semifinal', roundLabel: 0, bracketsInPhase: 1 }) }),
    );
    const topo = (h.querySelector('.rodada')?.textContent ?? '').replace(/\s+/g, ' ').trim();

    expect(topo).toBe('Semifinal');
  });

  it('põe trono e desafiante em blocos próprios, com avatares e pontos', async () => {
    const h = host(await render());
    const trono = h.querySelector('.bloco--trono');
    const desafiante = h.querySelector('.bloco--desafiante');

    expect(trono?.textContent).toContain('Van');
    expect(trono?.textContent).toContain('Aye');
    expect(trono?.textContent).toContain('4');
    expect(trono!.querySelectorAll('og-avatar').length).toBe(2);
    expect([...trono!.querySelectorAll('og-avatar')].map((e) => e.textContent?.trim())).toEqual(['VA', 'AY']);
    expect(desafiante?.textContent).toContain('Bro');
    expect(desafiante?.textContent).toContain('14');
    expect(desafiante!.querySelectorAll('og-avatar').length).toBe(2);
  });

  it('mostra a foto do atleta no avatar quando o perfil tem URL', async () => {
    const teams = new Map(TEAMS);
    teams.set('k', duo('Van', 'Aye', ['https://cdn.example/van.jpg', null]));
    const trono = host(await render({ teams })).querySelector('.bloco--trono')!;

    expect(trono.querySelector('og-avatar img')?.getAttribute('src')).toBe('https://cdn.example/van.jpg');
    expect([...trono.querySelectorAll('og-avatar')].map((e) => e.textContent?.trim())).toContain('AY');
  });

  it('mostra a fila com o próximo a entrar destacado', async () => {
    const cards = [...host(await render()).querySelectorAll('.fila-card')];

    expect(cards.length).toBe(3);
    expect(cards.filter((c) => c.classList.contains('fila-card--proximo')).length).toBe(1);
    expect(cards[0].querySelectorAll('og-avatar').length).toBe(2);
  });

  it('acende a sequência a partir de duas, e o anel a partir de três', async () => {
    const duas = host(await render({ view: view({ bar: { ...view().bar, streak: 2 } }) }));
    expect(duas.textContent).toContain('2 seguidas');
    expect(duas.querySelector('.bloco--trono')?.classList.contains('bloco--pulsando')).toBeFalse();

    const tres = host(await render({ view: view({ bar: { ...view().bar, streak: 3 } }) }));
    expect(tres.querySelector('.bloco--trono')?.classList.contains('bloco--pulsando')).toBeTrue();
  });

  it('deixa o relógio vermelho no último minuto', async () => {
    const calmo = host(await render());
    expect(calmo.querySelector('.relogio')?.classList.contains('relogio--urgente')).toBeFalse();

    const urgente = host(
      await render({ view: view({ bar: { ...view().bar, clock: { label: '00:47', paused: false } } }) }),
    );
    expect(urgente.querySelector('.relogio')?.classList.contains('relogio--urgente')).toBeTrue();
  });

  it('anuncia tempo esgotado sem afirmar quem classificou', async () => {
    const h = host(await render({ esgotado: true }));

    expect(h.textContent).toContain('Tempo esgotado');
    expect(h.textContent).not.toContain('Classificada');
    // O placar continua na tela, congelado.
    expect(h.querySelector('.bloco--trono')?.textContent).toContain('Van');
  });
});
