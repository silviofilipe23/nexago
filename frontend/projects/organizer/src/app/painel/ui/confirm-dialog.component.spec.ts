import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OgConfirmDialogComponent } from './confirm-dialog.component';

/** O diálogo é a única barreira antes de uma ação que não dá pra desfazer. Quando ele pede um
 *  texto (motivo da remoção), confirmar sem esse texto tem que ser impossível — é o que
 *  garante que o atleta receba a explicação por perder a vaga. */
describe('OgConfirmDialogComponent', () => {
  let fixture: ComponentFixture<OgConfirmDialogComponent>;

  function confirmButton(): HTMLButtonElement {
    const buttons = fixture.nativeElement.querySelectorAll('.og-dialog-actions button');
    return buttons[buttons.length - 1] as HTMLButtonElement;
  }

  function type(value: string): void {
    const input = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgConfirmDialogComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(OgConfirmDialogComponent);
    fixture.componentRef.setInput('title', 'Remover da categoria');
    fixture.componentRef.setInput('message', 'A vaga é liberada.');
  });

  it('sem prompt, confirma direto e emite string vazia', () => {
    const emitted: string[] = [];
    fixture.componentInstance.confirmed.subscribe((v) => emitted.push(v));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(confirmButton().disabled).toBeFalse();

    confirmButton().click();
    expect(emitted).toEqual(['']);
  });

  describe('com prompt obrigatório', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('prompt', {
        label: 'Motivo para o atleta',
        placeholder: 'Explique o motivo',
        minLength: 10,
      });
      fixture.detectChanges();
    });

    it('nasce com o botão travado', () => {
      expect(confirmButton().disabled).toBeTrue();
    });

    it('segue travado com texto curto demais', () => {
      type('curto');
      expect(confirmButton().disabled).toBeTrue();
    });

    it('espaço em branco não conta como motivo', () => {
      type('          ');
      expect(confirmButton().disabled).toBeTrue();
    });

    it('libera ao atingir o mínimo e emite o texto sem as pontas', () => {
      const emitted: string[] = [];
      fixture.componentInstance.confirmed.subscribe((v) => emitted.push(v));

      type('  Nível incompatível com a categoria  ');
      expect(confirmButton().disabled).toBeFalse();

      confirmButton().click();
      expect(emitted).toEqual(['Nível incompatível com a categoria']);
    });

    it('ocupado trava o botão mesmo com motivo válido', () => {
      type('Nível incompatível com a categoria');
      fixture.componentRef.setInput('busy', true);
      fixture.detectChanges();

      expect(confirmButton().disabled).toBeTrue();
    });
  });
});
