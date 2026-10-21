import { provideZonelessChangeDetection, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { DEFAULT_RULES, rulesFromDoc, type ClassRules } from './billing.model';
import { PanelAulasRulesComponent, isValidNoticeHours } from './panel-aulas-rules.component';

/** Sinais protegidos que o teste alimenta na mão — o `effect` do construtor sai antes de
 *  tocar no Firestore porque `arenaId()` é `null` (mesmo truque do spec do estoque). */
interface RulesInternals {
  rules: WritableSignal<ClassRules>;
  loading: WritableSignal<boolean>;
}

function render(canWrite = true): ComponentFixture<PanelAulasRulesComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ArenaContextService,
        useValue: { arenaId: () => null, loading: () => false, notFound: () => false, arenaName: () => 'Arena X', hasCapability: () => true, managedArenas: () => [] },
      },
      { provide: ArenaAccessService, useValue: { isOwner: () => true, canRead: () => true, canWrite: () => canWrite } },
    ],
  });
  const fixture = TestBed.createComponent(PanelAulasRulesComponent);
  (fixture.componentInstance as unknown as RulesInternals).loading.set(false);
  fixture.detectChanges();
  return fixture;
}

function el(fixture: ComponentFixture<PanelAulasRulesComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function noticeInput(fixture: ComponentFixture<PanelAulasRulesComponent>): HTMLInputElement {
  return el(fixture).querySelector('input.notice-hours') as HTMLInputElement;
}

function saveButton(fixture: ComponentFixture<PanelAulasRulesComponent>): HTMLButtonElement {
  return el(fixture).querySelector('button.ar-mini-btn-primary') as HTMLButtonElement;
}

function type(fixture: ComponentFixture<PanelAulasRulesComponent>, value: string): void {
  const input = noticeInput(fixture);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('PanelAulasRulesComponent — antecedência do aviso de falta', () => {
  it('mostra o campo com o padrão de 4 h', () => {
    const fixture = render();

    expect(el(fixture).textContent).toContain('Antecedência mínima para o aviso de falta gerar crédito (horas)');
    expect(noticeInput(fixture).value).toBe('4');
    expect(saveButton(fixture).disabled).toBeTrue();
  });

  it('valor válido entra nas regras e libera o salvar', () => {
    const fixture = render();
    type(fixture, '12');

    expect((fixture.componentInstance as unknown as RulesInternals).rules().makeupNoticeHours).toBe(12);
    expect(el(fixture).querySelector('.field-error')).toBeNull();
    expect(saveButton(fixture).disabled).toBeFalse();
  });

  it('aceita 0 h (avisar até a hora da aula)', () => {
    const fixture = render();
    type(fixture, '0');

    expect(el(fixture).querySelector('.field-error')).toBeNull();
    expect(saveButton(fixture).disabled).toBeFalse();
  });

  for (const bad of ['73', '-1', '2.5', '']) {
    it(`"${bad}" mostra o erro e trava o salvar`, () => {
      const fixture = render();
      type(fixture, bad);

      expect(el(fixture).querySelector('.field-error')?.textContent).toContain('de 0 a 72 horas');
      expect(noticeInput(fixture).classList).toContain('invalid');
      expect(saveButton(fixture).disabled).toBeTrue();
    });
  }

  it('sem permissão de escrita o campo fica desabilitado', () => {
    expect(noticeInput(render(false)).disabled).toBeTrue();
  });
});

describe('isValidNoticeHours', () => {
  it('aceita inteiros de 0 a 72, como o saveArenaClassRules', () => {
    expect([0, 4, 72].every(isValidNoticeHours)).toBeTrue();
    expect([-1, 73, 1.5, Number.NaN].some(isValidNoticeHours)).toBeFalse();
  });
});

describe('rulesFromDoc — makeupNoticeHours', () => {
  it('documento sem o campo cai no padrão de 4 h', () => {
    expect(rulesFromDoc({}).makeupNoticeHours).toBe(4);
    expect(DEFAULT_RULES.makeupNoticeHours).toBe(4);
  });

  it('lê o valor salvo, inclusive 0', () => {
    expect(rulesFromDoc({ makeupNoticeHours: 0 }).makeupNoticeHours).toBe(0);
    expect(rulesFromDoc({ makeupNoticeHours: 24 }).makeupNoticeHours).toBe(24);
  });
});
