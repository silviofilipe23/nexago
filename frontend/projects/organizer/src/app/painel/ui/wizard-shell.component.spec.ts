import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OgWizardShellComponent } from './wizard-shell.component';

/** O stepper é a navegação direta entre passos: quem manda no que é clicável é `unlockedUpTo`,
 *  e o wizard dono é que decide esse número (edição libera tudo, criação só o já visitado). */
describe('OgWizardShellComponent (stepper)', () => {
  let fixture: ComponentFixture<OgWizardShellComponent>;

  function stepButtons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.og-wizard-step'));
  }

  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgWizardShellComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OgWizardShellComponent);
    fixture.componentRef.setInput('flow', 'Editar torneio');
    fixture.componentRef.setInput('title', 'Local e datas');
    fixture.componentRef.setInput('steps', ['Identidade', 'Local', 'Categorias', 'Inscrições', 'Premiação', 'Revisão']);
    fixture.componentRef.setInput('step', 2);
    fixture.componentRef.setInput('unlockedUpTo', 2);
    fixture.detectChanges();
  });

  it('renderiza um passo por rótulo, numerado', () => {
    const labels = stepButtons().map((b) => b.textContent!.trim());
    expect(labels[0]).toBe('1. Identidade');
    expect(labels[5]).toBe('6. Revisão');
  });

  it('marca o passo atual e os anteriores como percorridos', () => {
    const [primeiro, atual, seguinte] = stepButtons();
    expect(atual!.getAttribute('aria-current')).toBe('step');
    expect(primeiro!.getAttribute('aria-current')).toBeNull();
    expect(primeiro!.classList).toContain('done');
    expect(atual!.classList).toContain('done');
    expect(seguinte!.classList).not.toContain('done');
  });

  it('desabilita os passos acima de unlockedUpTo', () => {
    const disabled = stepButtons().map((b) => b.disabled);
    expect(disabled).toEqual([false, false, true, true, true, true]);
  });

  it('libera todos os passos quando unlockedUpTo cobre o total (modo edição)', () => {
    fixture.componentRef.setInput('unlockedUpTo', 6);
    fixture.detectChanges();
    expect(stepButtons().every((b) => !b.disabled)).toBe(true);
  });

  it('trava o stepper inteiro com unlockedUpTo = 0 (subview aberta)', () => {
    fixture.componentRef.setInput('unlockedUpTo', 0);
    fixture.detectChanges();
    expect(stepButtons().every((b) => b.disabled)).toBe(true);
  });

  it('trava o stepper enquanto o CTA está salvando', () => {
    fixture.componentRef.setInput('unlockedUpTo', 6);
    fixture.componentRef.setInput('ctaBusy', true);
    fixture.detectChanges();
    expect(stepButtons().every((b) => b.disabled)).toBe(true);
  });

  it('emite o passo escolhido em 1-based', () => {
    fixture.componentRef.setInput('unlockedUpTo', 6);
    fixture.detectChanges();
    const escolhidos: number[] = [];
    fixture.componentInstance.stepSelected.subscribe((n) => escolhidos.push(n));
    stepButtons()[4]!.click();
    expect(escolhidos).toEqual([5]);
  });
});
