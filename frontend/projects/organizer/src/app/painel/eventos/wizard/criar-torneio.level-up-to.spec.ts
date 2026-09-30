import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BR_STATES, BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../../../auth/auth.service';
import {
  emptyCategoryDraft,
  emptyTournamentDraft,
  type TournamentCategoryDraft,
} from '../../data/tournament-create.model';
import { CriarTorneioComponent } from './criar-torneio.component';

/** Faixa "até um nível" no editor de categoria (spec 2026-09-30). Os testes olham o que o
 *  organizador vê — chips marcados e a escada aberta — e a faixa que vai ser gravada. */
describe('CriarTorneioComponent · faixa "até um nível"', () => {
  let fixture: ComponentFixture<CriarTorneioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CriarTorneioComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => null } },
        { provide: BrLocationsService, useValue: { states: BR_STATES, loaded: () => true, citiesFor: () => [] } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CriarTorneioComponent);
  });

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function openBuilder(categories: TournamentCategoryDraft[], id: string | null): Promise<void> {
    const component = fixture.componentInstance;
    component['draft'].set({ ...emptyTournamentDraft(), categories });
    component['openCategoriaBuilder'](id);
    await render();
  }

  function chips(fieldLabel: string): HTMLElement[] {
    const field = (fixture.nativeElement as HTMLElement).querySelector(`og-form-field[label="${fieldLabel}"]`);
    return field ? [...field.querySelectorAll<HTMLElement>('.og-select-chip')] : [];
  }

  function activeChip(fieldLabel: string): string | undefined {
    return chips(fieldLabel).find((c) => c.classList.contains('active'))?.textContent?.trim();
  }

  async function tap(fieldLabel: string, text: string): Promise<void> {
    const chip = chips(fieldLabel).find((c) => c.textContent?.trim() === text);
    expect(chip).withContext(`chip "${text}" em "${fieldLabel}"`).toBeDefined();
    chip!.click();
    await render();
  }

  const cat = () => fixture.componentInstance['cat']();
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('categoria nova (Livre) não mostra a escada "Até o nível"', async () => {
    await openBuilder([], null);
    expect(activeChip('Faixa de nível')).toBe('Livre');
    expect(chips('Até o nível').length).toBe(0);
  });

  it('"Até um nível" abre a escada e o teto escolhido grava Iniciante 1 → X', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');
    expect(chips('Até o nível').length).toBe(7);

    await tap('Até o nível', 'Intermediário 2');
    expect(cat().minSkillLevel).toBe('iniciante1');
    expect(cat().skillLevel).toBe('intermediario2');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(text()).toContain('Libera de Iniciante 1 até Intermediário 2.');
  });

  it('Iniciante 2 ou Open na escada não fazem o chip pular para Iniciante/Livre', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');

    await tap('Até o nível', 'Iniciante 2');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(text()).toContain('Mesma regra do preset Iniciante');

    await tap('Até o nível', 'Open');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(text()).toContain('mesma regra do Livre');
  });

  it('voltar a um preset fecha a escada', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');
    await tap('Faixa de nível', 'Intermediário');
    expect(chips('Até o nível').length).toBe(0);
    expect(cat().minSkillLevel).toBe('intermediario1');
    expect(cat().skillLevel).toBe('intermediario2');
  });

  it('reabre categoria "até" já gravada com a escada aberta e o teto marcado', async () => {
    const saved = { ...emptyCategoryDraft('c1'), minSkillLevel: 'iniciante1' as const, skillLevel: 'avancado1' as const };
    await openBuilder([saved], 'c1');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(activeChip('Até o nível')).toBe('Avançado 1');
    expect(text()).not.toContain('Faixa personalizada');
  });

  it('reaberta, escolher Open na escada não faz o chip pular para Livre', async () => {
    const saved = { ...emptyCategoryDraft('c1'), minSkillLevel: 'iniciante1' as const, skillLevel: 'avancado1' as const };
    await openBuilder([saved], 'c1');

    await tap('Até o nível', 'Open');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(activeChip('Até o nível')).toBe('Open');
  });

  it('o modo "até" de uma categoria não vaza para a próxima', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');
    // 0–6: a faixa é a do Livre, o modo só existe no estado local do editor.
    await tap('Até o nível', 'Open');

    fixture.componentInstance['openCategoriaBuilder'](null);
    await render();
    expect(activeChip('Faixa de nível')).toBe('Livre');
    expect(chips('Até o nível').length).toBe(0);
  });

  it('teto legado vira Open ao ativar "Até um nível"', async () => {
    const legacy = { ...emptyCategoryDraft('c1'), minSkillLevel: null, skillLevel: 'beginner' as const };
    await openBuilder([legacy], 'c1');
    expect(text()).toContain('Faixa personalizada (legado)');

    await tap('Faixa de nível', 'Até um nível');
    expect(cat().skillLevel).toBe('open');
    expect(activeChip('Até o nível')).toBe('Open');
  });
});
