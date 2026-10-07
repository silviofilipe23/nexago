import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ChaveNode, ChaveSlot, ChaveView } from './overlay-chave';
import { OverlayChaveComponent } from './overlay-chave.component';

const slot = (over: Partial<ChaveSlot> = {}): ChaveSlot => ({ teamId: 't', label: 'Alison / Bruno', placeholder: false, score: null, winner: false, loser: false, ...over });
const node = (n: number, over: Partial<ChaveNode> = {}): ChaveNode => ({
  matchId: `m${n}`, matchNumber: n, left: n * 340, top: 0, col: n - 1, code: `QUARTAS ${n}`, court: 'Q1', tag: { kind: 'hora', text: '16:00' }, live: false,
  a: slot(), b: slot({ label: 'Kaio / Renan' }), eliminates: false, ...over,
});
const view = (over: Partial<ChaveView> = {}): ChaveView => ({
  kind: 'simples', formatLabel: 'Eliminatória simples', width: 1200, height: 600,
  nodes: [
    node(1, { tag: { kind: 'fim', text: 'Fim' }, a: slot({ winner: true, score: 21 }), b: slot({ label: 'Kaio / Renan', loser: true, score: 15 }) }),
    node(2, { code: 'SEMI 1', live: true, tag: { kind: 'live', text: 'Ao vivo' }, b: slot({ label: 'Vencedor Quartas 2', placeholder: true, teamId: '' }) }),
  ],
  edges: [{ d: 'M 280 77 H 310 V 100 H 340', done: true, col: 0 }, { d: 'M 620 77 H 650', done: false, col: 1 }],
  labels: [{ label: 'Quartas', left: 0, top: 0 }, { label: 'Semifinais', left: 340, top: 0 }],
  champion: { left: 900, top: 20, teamId: null, label: null, done: false }, ...over,
});

async function mount(v: ChaveView | null) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(OverlayChaveComponent);
  f.componentRef.setInput('view', v);
  f.componentRef.setInput('categoryName', 'Masculino B');
  f.componentRef.setInput('eventName', 'Etapa Goiânia');
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('OverlayChaveComponent', () => {
  it('cabeçalho: evento | formato e título "Categoria · Chave"', async () => {
    const { el } = await mount(view());
    expect(el.querySelector('.ctx')?.textContent).toContain('Etapa Goiânia');
    expect(el.querySelector('.ctx')?.textContent).toContain('Eliminatória simples');
    expect(el.querySelector('h1')?.textContent).toContain('Masculino B');
    expect(el.querySelector('h1 em')?.textContent).toContain('Chave');
  });

  it('cartões: código e quadra, tag, vencedora em destaque, perdedora apagada, ao vivo com borda', async () => {
    const { el } = await mount(view());
    expect(el.querySelectorAll('.jogo').length).toBe(2);
    expect(el.querySelector('.jh')?.textContent).toContain('QUARTAS 1 · Q1');
    expect(el.querySelector('.tag--fim')?.textContent).toContain('Fim');
    expect(el.querySelector('.tag--live')?.textContent).toContain('Ao vivo');
    expect(el.querySelectorAll('.lin--win').length).toBe(1);
    expect(el.querySelectorAll('.lin--lose').length).toBe(1);
    expect(el.querySelectorAll('.jogo--live').length).toBe(1);
    expect(el.querySelector('.lin--win .sc')?.textContent?.trim()).toBe('21');
    expect(el.querySelector('.nome--ph')?.textContent).toContain('Vencedor Quartas 2');
  });

  it('ligações: a do jogo encerrado acende, a outra fica cinza', async () => {
    const { el } = await mount(view());
    const paths = Array.from(el.querySelectorAll('.liga path'));
    expect(paths.length).toBe(2);
    expect(paths[0]!.classList.contains('feita')).toBeTrue();
    expect(paths[1]!.classList.contains('feita')).toBeFalse();
  });

  it('campeão: "A definir" com borda tracejada; encerrada mostra "Campeões" e os nomes', async () => {
    const { f, el } = await mount(view());
    expect(el.querySelector('.camp-n')?.textContent).toContain('A definir');
    expect(el.querySelector('.camp--done')).toBeNull();
    f.componentRef.setInput('view', view({ champion: { left: 900, top: 20, teamId: 'x', label: 'Pedro / Guto', done: true } }));
    await f.whenStable();
    expect(el.querySelector('.camp--done')).not.toBeNull();
    expect(el.querySelector('.camp-k')?.textContent).toContain('Campeões');
    expect(el.querySelector('.camp-n')?.textContent).toContain('Pedro · Guto');
  });

  it('chave dupla: perdedor eliminado na chave dos perdedores tem o nome riscado', async () => {
    const eliminado = node(3, { code: 'P1', eliminates: true, tag: { kind: 'fim', text: 'Fim' }, a: slot({ winner: true, score: 21 }), b: slot({ label: 'Kaio / Renan', loser: true, score: 12 }) });
    const { el } = await mount(view({ kind: 'dupla', formatLabel: 'Dupla eliminatória', nodes: [eliminado] }));
    expect(el.querySelectorAll('.lin--risca').length).toBe(1);
  });

  it('sem chave: nada na tela', async () => {
    const { el } = await mount(null);
    expect(el.querySelector('.tela')).toBeNull();
  });
});
