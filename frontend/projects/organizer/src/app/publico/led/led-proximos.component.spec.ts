import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LedProximos, LedProximosRow } from './led-proximos';
import type { LedTeam } from './led-round.component';
import { LedProximosComponent } from './led-proximos.component';

function row(teamId: string, posicao: number, papel: LedProximosRow['papel'], rotulo: string): LedProximosRow {
  return { teamId, posicao, papel, rotulo };
}

/** Início de rodada, 5 duplas. */
function inicio(overrides: Partial<LedProximos> = {}): LedProximos {
  return {
    inicio: true,
    trono: { ...row('t', 1, 'trono', 'Entra no trono'), numero: 1 },
    fila: [
      row('a', 2, 'desafia', 'Desafia o trono'),
      row('b', 3, 'sequencia', 'Na fila'),
      row('c', 4, 'aguardando', 'Na fila'),
      row('d', 5, 'aguardando', 'Na fila'),
    ],
    ...overrides,
  };
}

function durante(): LedProximos {
  return {
    inicio: false,
    trono: { ...row('t', 1, 'trono', 'No trono · 3 seguidas'), numero: 7 },
    fila: [
      row('a', 2, 'desafia', 'Desafiante · Em quadra'),
      row('b', 3, 'sequencia', 'Próxima a desafiar'),
      row('c', 4, 'aguardando', 'Aguardando'),
    ],
  };
}

function dupla(a: string, b: string): LedTeam {
  return { players: [a, b].map((name) => ({ name, initials: '', photoUrl: null })) };
}

const TEAMS = new Map<string, LedTeam>([
  ['t', dupla('Van', 'Aye')],
  ['a', dupla('Bro', 'Dau')],
  ['b', dupla('Sor', 'Ham')],
  ['c', dupla('Hölting Nilsson', 'Berger')],
  ['d', dupla('Batrane', 'Tiisaar')],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(LedProximosComponent);
  const all = {
    proximos: inicio(),
    teams: TEAMS,
    categoryName: 'Masculino B',
    courtName: 'Quadra 2',
    roundTitle: 'Rodada 3/7',
    rodada: 'Rodada 3',
    ...inputs,
  };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function texto(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ');
}

describe('LedProximosComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedProximosComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada sem próximos', async () => {
    const h = host(await render({ proximos: null }));

    expect(h.querySelector('.tela')).toBeNull();
    expect((h.textContent ?? '').trim()).toBe('');
  });

  it('início de rodada: "Entrada na quadra", contexto e "INÍCIO DA RODADA N"', async () => {
    const h = host(await render());

    expect(texto(h.querySelector('.titulo'))).toContain('Entrada na quadra');
    expect(texto(h.querySelector('.contexto'))).toBe('Masculino B · Quadra 2 · Rodada 3/7');
    expect(texto(h.querySelector('.inicio'))).toContain('Início da');
    expect(texto(h.querySelector('.inicio-rodada'))).toContain('Rodada 3');
  });

  it('durante a rodada: "Próximos em quadra", sem o bloco de início, e os pontos do rei', async () => {
    const h = host(await render({ proximos: durante() }));

    expect(texto(h.querySelector('.titulo'))).toContain('Próximos em quadra');
    expect(h.querySelector('.inicio')).toBeNull();
    expect(texto(h.querySelector('.pxh.tr .rotulo'))).toContain('No trono · 3 seguidas');
    expect(texto(h.querySelector('.numero--tr')).trim()).toBe('7');
  });

  it('faixa do trono: rótulo, os dois nomes e "1" no início, com iniciais sem foto', async () => {
    const tr = host(await render()).querySelector('.pxh.tr')!;

    expect(texto(tr)).toContain('Entra no trono');
    // Nome do atleta abreviado: 3 primeiras letras em maiúsculas; o nome inteiro fica no title.
    expect(texto(tr)).toContain('VAN');
    expect(texto(tr)).toContain('AYE');
    expect(texto(tr)).not.toContain('Van');
    expect(tr.querySelector('.nomes--tr span')?.getAttribute('title')).toBe('Van');
    expect(texto(tr.querySelector('.numero--tr')).trim()).toBe('1');
    expect([...tr.querySelectorAll('og-avatar')].map((e) => e.textContent?.trim())).toEqual(['VA', 'AY']);
  });

  it('cards da fila numerados de 2 em diante, sem repetir o trono', async () => {
    const cards = [...host(await render()).querySelectorAll('.pxc')];

    expect(cards.map((c) => texto(c.querySelector('.numero')).trim())).toEqual(['2', '3', '4', '5']);
    expect(cards.some((c) => texto(c).includes('VAN'))).toBeFalse();
    expect(texto(cards[2]!)).toContain('HÖL');
    expect(texto(cards[2]!)).toContain('BER');
    expect(texto(cards[0]!)).toContain('Desafia o trono');
    expect(texto(cards[1]!)).toContain('Na fila');
  });

  it('só o desafiante leva a moldura branca', async () => {
    const cards = [...host(await render()).querySelectorAll('.pxc')];

    expect(cards[0]!.classList).toContain('pxc--desafia');
    expect(cards.slice(1).every((c) => !c.classList.contains('pxc--desafia'))).toBeTrue();
  });

  it('colunas conforme a fila: 2 a 4', async () => {
    const quatro = host(await render()).querySelector<HTMLElement>('.fila')!;
    expect(quatro.style.getPropertyValue('--cols')).toBe('4');

    const duas = host(await render({ proximos: inicio({ fila: inicio().fila.slice(0, 2) }) }));
    expect(duas.querySelector<HTMLElement>('.fila')!.style.getPropertyValue('--cols')).toBe('2');
  });

  it('assina "NEXAGO · KOTC" no rodapé', async () => {
    expect(texto(host(await render()).querySelector('.assinatura'))).toBe('NEXAGO · KOTC');
  });

  it('troca de rei com a tela aberta liga a animação de troca', async () => {
    const fixture = await render({ proximos: durante() });
    expect(host(fixture).querySelector('.tela')!.classList).not.toContain('troca');

    const novoRei = durante();
    fixture.componentRef.setInput('proximos', { ...novoRei, trono: { ...novoRei.trono, teamId: 'a' } });
    await fixture.whenStable();

    expect(host(fixture).querySelector('.tela')!.classList).toContain('troca');
  });
});
