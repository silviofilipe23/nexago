import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DEFAULT_ORGANIZER_EVENT_DEFAULTS, type OrganizerEventDefaults } from '../data/organizer-settings.model';
import { OgConfigRegrasCardComponent } from './regras-card.component';

/** O card "Regras padrão de evento" só mostra os `<select>` no modo de edição, e o modo de edição
 *  SEMPRE abre pré-preenchido: `startEdit()` copia as regras já gravadas do organizador pro
 *  rascunho antes de trocar a tela.
 *
 *  Quem renderiza um `<select>` já com valor tem que garantir que a `<option>` correspondente
 *  nasça marcada: a atribuição de `value` no elemento acontece antes de o `@for` criar as opções,
 *  e o browser descarta valor sem opção — o organizador clicava em "Editar" e via o primeiro item
 *  da lista, não o que estava valendo. Estes testes prendem o comportamento visível em vez do
 *  detalhe de como o binding foi escrito. */
describe('OgConfigRegrasCardComponent · edição pré-preenchida', () => {
  let fixture: ComponentFixture<OgConfigRegrasCardComponent>;

  beforeEach(async () => {
    // O portal roda zoneless: sem este provider o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgConfigRegrasCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OgConfigRegrasCardComponent);
  });

  function selects(): HTMLSelectElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>('select.og-select-el')];
  }

  /** Reproduz o clique em "Editar" com regras já gravadas — os três valores escolhidos ficam
   *  fora da primeira posição de cada lista, que é onde o defeito aparece. */
  async function startEditWith(over: Partial<OrganizerEventDefaults>): Promise<void> {
    fixture.componentRef.setInput('uid', 'organizador-1');
    fixture.componentRef.setInput('defaults', { ...DEFAULT_ORGANIZER_EVENT_DEFAULTS, ...over });
    fixture.detectChanges();
    fixture.componentInstance['startEdit']();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('abre com o esporte gravado já selecionado', async () => {
    await startEditWith({ sport: 'footvolley' });

    expect(selects()[0].value).toBe('footvolley');
  });

  it('abre com o formato de chaveamento gravado já selecionado', async () => {
    await startEditWith({ bracketSystem: 'doubleElimination' });

    expect(selects()[1].value).toBe('doubleElimination');
  });

  it('abre com o "melhor de" gravado já selecionado', async () => {
    await startEditWith({ bestOf: 'bestOf5' });

    expect(selects()[2].value).toBe('bestOf5');
  });
});
