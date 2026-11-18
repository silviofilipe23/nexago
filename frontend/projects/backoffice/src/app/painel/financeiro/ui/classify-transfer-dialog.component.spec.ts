import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StatementEntry } from '../data/company-finance';
import { ClassifyTransferDialogComponent, type ClassifyChoice } from './classify-transfer-dialog.component';

const ENTRY: StatementEntry = {
  id: 'e1',
  date: '2026-11-10',
  type: 'TRANSFER',
  description: 'Transação via Pix com chave para Fulano',
  valueCents: -9000,
  balanceCents: null,
  transferId: 'tr1',
  transfer: { state: 'unclassified' },
};

const TARGETS = [
  { tournamentId: 't-rico', name: 'Copa Rica', availableCents: 20000 },
  { tournamentId: 't-zero', name: 'Copa Zerada', availableCents: 0 },
];

describe('ClassifyTransferDialogComponent', () => {
  let fixture: ComponentFixture<ClassifyTransferDialogComponent>;
  let el: HTMLElement;
  let emitted: ClassifyChoice[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ClassifyTransferDialogComponent] });
    fixture = TestBed.createComponent(ClassifyTransferDialogComponent);
    fixture.componentRef.setInput('entry', ENTRY);
    fixture.componentRef.setInput('targets', TARGETS);
    fixture.componentRef.setInput('open', true);
    emitted = [];
    fixture.componentInstance.submitted.subscribe((c) => emitted.push(c));
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  const radio = (i: number) => el.querySelectorAll<HTMLInputElement>('input[type="radio"]')[i];
  const save = () => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Salvar'))!;
  const pick = (i: number) => {
    radio(i).checked = true;
    radio(i).dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const select = (id: string) => {
    const s = el.querySelector<HTMLSelectElement>('select')!;
    s.value = id;
    s.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('mostra data, valor e descrição; sem escolha, não salva', () => {
    expect(el.textContent).toContain('10/11/2026');
    expect(el.textContent).toContain('90,00');
    expect(save().disabled).toBeTrue();
  });

  it('retirada salva sem torneio', () => {
    pick(0);
    expect(save().disabled).toBeFalse();
    save().click();
    expect(emitted).toEqual([{ kind: 'withdrawal', tournamentId: null, alreadySettled: false, note: '' }]);
  });

  it('repasse exige caixa com saldo; caixa já baixado libera o zerado', () => {
    pick(2);
    expect(save().disabled).toBeTrue();
    select('t-zero');
    expect(save().disabled).toBeTrue();
    const check = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(save().disabled).toBeFalse();
    save().click();
    expect(emitted[0]).toEqual({ kind: 'organizerPayout', tournamentId: 't-zero', alreadySettled: true, note: '' });
  });

  it('repasse com saldo suficiente avisa quanto o caixa fica', () => {
    pick(2);
    select('t-rico');
    expect(save().disabled).toBeFalse();
    expect(el.textContent).toContain('fica');
    expect(el.textContent).toContain('110,00');
  });

  it('já classificada como retirada: repasse bloqueado e só salva se mudar algo', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('entry', { ...ENTRY, transfer: { state: 'classified', kind: 'withdrawal', tournamentName: null, note: '' } });
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(radio(0).checked).toBeTrue();
    expect(radio(2).disabled).toBeTrue();
    expect(save().disabled).toBeTrue();
    pick(1);
    expect(save().disabled).toBeFalse();
  });
});
