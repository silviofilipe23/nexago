import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LEVEL_OPTIONS } from '@nexago/levels';
import { promotableLevelOptions } from '../data/athlete-level-promotion';
import { OgAthleteLevelDialogComponent, type AthleteLevelPromotion, type AthleteLevelTarget } from './athlete-level-dialog.component';

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

  function reasonField(el: HTMLElement): HTMLTextAreaElement | null {
    return el.querySelector('textarea.lvl-reason');
  }

  /** Escolhe um degrau e escreve um motivo válido — o caminho feliz inteiro. */
  async function pick(el: HTMLElement, index: number, reason = 'joga muito acima do nível declarado'): Promise<void> {
    (el.querySelectorAll('input.lvl-radio')[index] as HTMLInputElement).click();
    await fixture.whenStable();
    const field = reasonField(el)!;
    field.value = reason;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
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
    expect(reasonField(el)).toBeNull();
  });

  it('escolher um degrau nomeia o botão e emite o código canônico com o motivo', async () => {
    const el = await mount(target({ currentLevel: 'intermediario_1' }));
    const emitted: AthleteLevelPromotion[] = [];
    fixture.componentInstance.confirmed.subscribe((p) => emitted.push(p));

    // Avançado 1 — quarto degrau escolhível a partir de Intermediário 1.
    await pick(el, 4, '  ganhou a B com folga nas duas etapas  ');

    expect(confirmButton(el).disabled).toBe(false);
    expect(confirmButton(el).textContent).toContain('Promover para Avançado 1');

    confirmButton(el).click();
    await fixture.whenStable();
    expect(emitted).toEqual([{ level: 'avancado_1', reason: 'ganhou a B com folga nas duas etapas' }]);
  });

  /** Divulgação progressiva: sem degrau escolhido não há o que justificar. */
  it('o campo de motivo só aparece depois do degrau escolhido', async () => {
    const el = await mount(target({ currentLevel: 'intermediario_1' }));
    expect(reasonField(el)).toBeNull();

    (el.querySelectorAll('input.lvl-radio')[4] as HTMLInputElement).click();
    await fixture.whenStable();

    expect(reasonField(el)).not.toBeNull();
    const hint = el.querySelector('.lvl-reason-hint')!;
    expect(hint.textContent).toContain('Obrigatório');
    // Campo vazio ainda não é erro — o amarelo só entra depois que ele começa a escrever.
    expect(hint.classList.contains('short')).toBe(false);
  });

  /** O motivo é obrigatório por decisão do portal — a callable aceita vazio do organizador. */
  it('motivo curto trava o confirmar e diz quanto falta', async () => {
    const el = await mount(target({ currentLevel: 'intermediario_1' }));
    await pick(el, 4, 'jogou bem');

    expect(confirmButton(el).disabled).toBe(true);
    const hint = el.querySelector('.lvl-reason-hint')!;
    expect(hint.textContent?.trim()).toBe('Falta 1 caractere.');
    expect(hint.classList.contains('short')).toBe(true);
  });

  it('plural do que falta acompanha o número', async () => {
    const el = await mount(target({ currentLevel: 'intermediario_1' }));
    await pick(el, 4, 'jogou');

    expect(el.querySelector('.lvl-reason-hint')?.textContent?.trim()).toBe('Faltam 5 caracteres.');
  });

  it('espaço em branco não conta como motivo', async () => {
    const el = await mount(target({ currentLevel: 'intermediario_1' }));
    await pick(el, 4, '              ');

    expect(confirmButton(el).disabled).toBe(true);
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
