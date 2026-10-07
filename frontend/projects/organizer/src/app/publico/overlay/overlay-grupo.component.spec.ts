import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GrupoGame, GrupoRow, GrupoView } from './overlay-grupo';
import { OverlayGrupoComponent } from './overlay-grupo.component';

const row = (pos: number, zone: GrupoRow['zone'], over: Partial<GrupoRow> = {}): GrupoRow => ({
  pos, teamId: `t${pos}`, label: `Dupla${pos} A / Dupla${pos} B`, j: 2, v: 2, d: 0, sets: '4:1', saldo: 12, zone, status: zone === 'lider' ? 'Lidera · Oitavas' : zone === 'classifica' ? 'Zona de classificação' : 'Fora da zona', ...over,
});
const game = (id: string, state: GrupoGame['state']): GrupoGame => ({
  matchId: id, a: { teamId: 'a', label: 'Berger / Hölting Nilsson' }, b: { teamId: 'b', label: 'Farias / Braga' }, state,
  score: state === 'scheduled' ? null : '2–0', detail: state === 'live' ? 'Ao vivo · 1º set' : state === 'final' ? '21-14 21-17' : 'A jogar', winner: state === 'final' ? 'A' : null,
});
const grupo = (key = 'A'): GrupoView => ({
  key, title: `Grupo ${key}`, rows: [row(1, 'lider'), row(2, 'classifica', { saldo: -3 }), row(3, 'fora'), row(4, 'fora')],
  games: [game('1', 'final'), game('2', 'live'), game('3', 'scheduled')], progress: 'live', progressText: 'Jogo em andamento', vagas: '2 vagas · Oitavas', nextPhase: 'Oitavas', qualifiers: 2,
});

async function mount(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(OverlayGrupoComponent);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('OverlayGrupoComponent', () => {
  it('um grupo: cabeçalho, selos, tabela com destaque, corte de vagas e jogos', async () => {
    const el = await mount({ grupo: grupo(), mode: 'um', categoryName: 'Masculino A', eventName: 'Etapa Praia do Futuro' });
    expect(el.querySelector('h1')?.textContent).toContain('Grupo A');
    expect(el.querySelector('.ctx')?.textContent).toContain('Masculino A');
    expect(el.querySelector('.selo--live')?.textContent).toContain('Jogo em andamento');
    expect(el.querySelector('.selo--vagas')?.textContent).toContain('2 vagas · Oitavas');
    expect(el.querySelectorAll('.lin').length).toBe(4);
    expect(el.querySelectorAll('.lin--lider').length).toBe(1);
    expect(el.querySelectorAll('.lin--classifica').length).toBe(1);
    expect(el.querySelector('.corte')?.textContent).toContain('Classificam para Oitavas');
    expect(el.querySelectorAll('.jogo').length).toBe(3);
    expect(el.querySelector('.jogo--live')).not.toBeNull();
    expect(el.querySelector('.jc-vs')?.textContent).toContain('VS');
    expect(el.querySelector('.rodape')?.textContent).toContain('Etapa Praia do Futuro');
  });

  it('saldo: verde positivo, vermelho negativo, com sinal', async () => {
    const el = await mount({ grupo: grupo(), mode: 'um' });
    const saldos = Array.from(el.querySelectorAll('.n--saldo'));
    expect(saldos[0]?.textContent?.trim()).toBe('+12');
    expect(saldos[0]?.classList.contains('pos-n')).toBeTrue();
    expect(saldos[1]?.textContent?.trim()).toBe('-3');
    expect(saldos[1]?.classList.contains('neg-n')).toBeTrue();
  });

  it('sem foto mostra as iniciais; nome de jogo usa só o último termo', async () => {
    const el = await mount({ grupo: grupo(), mode: 'um' });
    expect(el.querySelector('.lin .foto--vazia')?.textContent?.trim()).toBeTruthy();
    expect(el.querySelector('.jogo .jn')?.textContent).toContain('Nilsson');
  });

  it('todos os grupos: grade com cada grupo e o destacado com borda laranja', async () => {
    const el = await mount({ grupo: grupo('A'), todos: [grupo('A'), grupo('B'), grupo('C'), grupo('D')], mode: 'todos', destaque: 'B', categoryName: 'Masculino A' });
    expect(el.querySelector('h1')?.textContent).toContain('Masculino A');
    expect(el.querySelectorAll('.gcard').length).toBe(4);
    expect(el.querySelectorAll('.gcard--on').length).toBe(1);
    expect(el.querySelector('.gcard--on .g-t')?.textContent).toContain('Grupo B');
    expect(el.querySelector('.jogos')).toBeNull();
  });
});
