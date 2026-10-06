import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GradeCell, GradeView } from './overlay-grade';
import { OverlayGradeComponent } from './overlay-grade.component';

const cell = (over: Partial<GradeCell> = {}): GradeCell => ({
  matchId: 'm',
  categoryId: 'c1',
  phase: 'Oitavas',
  a: { teamId: 'ta', label: 'Lima / Rocha' },
  b: { teamId: 'tb', label: 'Nunes / Rios' },
  state: 'scheduled',
  score: null,
  winner: null,
  ...over,
});

const view: GradeView = {
  courts: [
    { id: 'q1', number: 1, name: 'Quadra 1' },
    { id: 'q2', number: 2, name: 'Quadra 2' },
  ],
  rows: [
    { label: '11:20', startMs: 0, cells: [[cell({ matchId: 'f', state: 'final', score: '2–1', winner: 'A' })], []] },
    { label: '12:00', startMs: 1, cells: [[cell({ matchId: 'l', state: 'live', categoryId: 'c2' })], [cell({ matchId: 'n', state: 'next' })]] },
  ],
  now: { row: 1, frac: 0.5, label: '12:20' },
  firstVisible: 0,
};

async function mount(categoryId: string | null = null) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(OverlayGradeComponent);
  f.componentRef.setInput('view', view);
  f.componentRef.setInput('categories', [{ id: 'c1', name: 'Masculino A' }, { id: 'c2', name: 'Feminino B' }]);
  f.componentRef.setInput('categoryId', categoryId);
  f.componentRef.setInput('eventName', 'Etapa Praia do Futuro');
  f.componentRef.setInput('sponsors', [{ nome: 'S1', logo: '' }]);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('OverlayGradeComponent', () => {
  it('cabeçalho, legenda das categorias, quadras, horários e "agora"', async () => {
    const el = await mount();
    expect(el.querySelector('h1')?.textContent).toContain('do dia');
    expect(el.querySelectorAll('.pil').length).toBe(2);
    expect(el.querySelectorAll('.qh').length).toBe(2);
    expect(Array.from(el.querySelectorAll('.hora')).map((e) => e.textContent?.trim())).toEqual(['11:20', '12:00']);
    expect(el.querySelector('.agora-tag')?.textContent).toContain('Agora · 12:20');
    expect(el.querySelector('.patro')).not.toBeNull();
  });

  it('estados: final com placar, ao vivo, próximo e horário vazio tracejado', async () => {
    const el = await mount();
    expect(el.querySelector('.jogo--final .placar')?.textContent).toContain('2–1');
    expect(el.querySelector('.jogo--live .et--live')).not.toBeNull();
    expect(el.querySelector('.jogo--next .et--next')).not.toBeNull();
    expect(el.querySelectorAll('.vazio').length).toBe(1);
  });

  it('filtro de categoria esmaece os outros jogos', async () => {
    const el = await mount('c1');
    // jogos: final(c1), live(c2), next(c1) → só o da c2 fica esmaecido
    expect(el.querySelectorAll('.jogo--dim').length).toBe(1);
    expect(el.querySelector('.jogo--live')?.classList.contains('jogo--dim')).toBeTrue();
  });
});
