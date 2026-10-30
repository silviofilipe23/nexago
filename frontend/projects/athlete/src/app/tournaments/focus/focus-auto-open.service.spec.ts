import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FOCUS_AUTO_OPEN_KEY, FocusAutoOpenService } from './focus-auto-open.service';
import { FocusAutoOpenToggleComponent } from './focus-auto-open-toggle.component';

function reset(): void {
  localStorage.removeItem(FOCUS_AUTO_OPEN_KEY);
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
}

describe('FocusAutoOpenService', () => {
  beforeEach(reset);
  afterEach(() => localStorage.removeItem(FOCUS_AUTO_OPEN_KEY));

  it('vem desligado por padrão', () => {
    expect(TestBed.inject(FocusAutoOpenService).enabled()).toBeFalse();
  });

  it('lê a escolha guardada no navegador', () => {
    localStorage.setItem(FOCUS_AUTO_OPEN_KEY, '1');
    // O serviço lê na criação: este TestBed ainda não o criou.
    expect(TestBed.inject(FocusAutoOpenService).enabled()).toBeTrue();
  });

  it('ligar e desligar grava no navegador', () => {
    const pref = TestBed.inject(FocusAutoOpenService);
    pref.set(true);
    expect(pref.enabled()).toBeTrue();
    expect(localStorage.getItem(FOCUS_AUTO_OPEN_KEY)).toBe('1');

    pref.set(false);
    expect(pref.enabled()).toBeFalse();
    expect(localStorage.getItem(FOCUS_AUTO_OPEN_KEY)).toBeNull();
  });
});

describe('FocusAutoOpenToggleComponent', () => {
  beforeEach(reset);
  afterEach(() => localStorage.removeItem(FOCUS_AUTO_OPEN_KEY));

  it('é um switch acessível que liga a opção', () => {
    const fixture = TestBed.createComponent(FocusAutoOpenToggleComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const toggle = el.querySelector<HTMLButtonElement>('[data-testid="focus-auto-open-switch"]')!;

    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(el.querySelector('#' + toggle.getAttribute('aria-labelledby'))?.textContent).toContain(
      'Abrir o Modo Focus sozinho',
    );

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(TestBed.inject(FocusAutoOpenService).enabled()).toBeTrue();
  });
});
