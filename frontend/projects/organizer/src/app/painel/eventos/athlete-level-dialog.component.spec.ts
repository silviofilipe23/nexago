import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LEVEL_OPTIONS } from '@nexago/levels';
import { promotableLevelOptions } from '../data/athlete-level-promotion';
import { OgAthleteLevelDialogComponent, type AthleteLevelTarget } from './athlete-level-dialog.component';

function target(over: Partial<AthleteLevelTarget> = {}): AthleteLevelTarget {
  const currentLevel = 'currentLevel' in over ? (over.currentLevel ?? null) : 'intermediario_1';
  return {
    uid: 'a1',
    name: 'Ana Paula',
    photoUrl: null,
    currentLevel,
    options: promotableLevelOptions(currentLevel),
    ...over,
  };
}

describe('OgAthleteLevelDialogComponent', () => {
  let fixture: ComponentFixture<OgAthleteLevelDialogComponent>;

  /** O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
   *  não carrega zone.js — sem isso o TestBed falha com NG0908. */
  async function mount(value: AthleteLevelTarget): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [OgAthleteLevelDialogComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OgAthleteLevelDialogComponent);
    fixture.componentRef.setInput('target', value);
    fixture.componentRef.setInput('sportLabel', 'Beach Tennis');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function tiles(el: HTMLElement): { label: string; disabled: boolean; current: boolean }[] {
    return Array.from(el.querySelectorAll('.lvl-tile')).map((tile) => ({
      label: (tile.querySelector('.lvl-label') as HTMLElement).textContent!.trim(),
      disabled: (tile.querySelector('input') as HTMLInputElement).disabled,
      current: tile.classList.contains('current'),
    }));
  }

  function confirmButton(el: HTMLElement): HTMLButtonElement {
    return el.querySelector('.og-mini-btn-primary') as HTMLButtonElement;
  }

  it('mostra a escada inteira com o degrau atual marcado e os de baixo travados', async () => {
    const el = await mount(target({ currentLevel: 'intermediario_1' }));

    const rows = tiles(el);
    expect(rows.length).toBe(LEVEL_OPTIONS.length);
    // Iniciante 1, Iniciante 2 e o próprio Intermediário 1 não são escolhas válidas.
    expect(rows.slice(0, 3).every((r) => r.disabled)).toBe(true);
    expect(rows.slice(3).some((r) => r.disabled)).toBe(false);
    expect(rows[2].current).toBe(true);
    expect(rows[2].label).toContain('Atual');
  });

  /** O `<select>` que este diálogo substituiu já nascia no primeiro degrau: um clique
   *  desatento promovia sem ninguém escolher nada. */
  it('não pré-seleciona degrau nenhum e mantém o confirmar travado', async () => {
    const el = await mount(target());

    expect(el.querySelectorAll('.lvl-radio:checked').length).toBe(0);
    expect(confirmButton(el).disabled).toBe(true);
    expect(confirmButton(el).textContent).toContain('Escolha o nível');
  });

  it('escolher um degrau nomeia o botão e emite o código canônico', async () => {
    const el = await mount(target({ currentLevel: 'intermediario_1' }));
    const emitted: string[] = [];
    fixture.componentInstance.confirmed.subscribe((code) => emitted.push(code));

    // Avançado 1 — quarto degrau escolhível a partir de Intermediário 1.
    const radio = el.querySelectorAll('input.lvl-radio')[4] as HTMLInputElement;
    radio.click();
    await fixture.whenStable();

    expect(confirmButton(el).disabled).toBe(false);
    expect(confirmButton(el).textContent).toContain('Promover para Avançado 1');

    confirmButton(el).click();
    await fixture.whenStable();
    expect(emitted).toEqual(['avancado_1']);
  });

  /** `promotableLevelOptions` devolve os 7 degraus quando não há nível declarado — semear o
   *  primeiro é o mesmo caminho do backend, e o diálogo tem de dizer isso. */
  it('atleta sem nível declarado libera os 7 degraus e avisa que é o primeiro', async () => {
    const el = await mount(target({ currentLevel: null }));

    expect(tiles(el).some((r) => r.disabled)).toBe(false);
    expect(tiles(el).some((r) => r.current)).toBe(false);
    expect(el.querySelector('.lvl-seed')?.textContent).toContain('primeiro nível');
    expect(el.querySelector('.lvl-who-meta')?.textContent).toContain('ainda sem nível declarado');
  });

  it('fechar não é oferecido enquanto a promoção está em curso', async () => {
    const el = await mount(target());
    const cancelled: number[] = [];
    fixture.componentInstance.cancelled.subscribe(() => cancelled.push(1));
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();

    (el.querySelectorAll('.og-dialog-actions .og-mini-btn')[0] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(cancelled.length).toBe(0);
    expect(confirmButton(el).textContent).toContain('Promovendo…');
  });

  it('erro da callable aparece dentro do diálogo', async () => {
    const el = await mount(target());
    fixture.componentRef.setInput('error', 'Organizador só pode promover.');
    await fixture.whenStable();

    expect(el.querySelector('.og-dialog-error')?.textContent).toContain('Organizador só pode promover.');
  });
});
