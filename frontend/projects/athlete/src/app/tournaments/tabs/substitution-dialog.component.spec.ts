import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SubstitutionDialogComponent,
  type SubstitutionCandidate,
  type SubstitutionSendRequest,
  type SubstitutionSlot,
} from './substitution-dialog.component';

const SLOTS: SubstitutionSlot[] = [
  { uid: 'eu', name: 'Silvio Dionizio', photo: null, role: 'Sua vaga' },
  { uid: 'bia', name: 'Bia Lima', photo: null, role: 'Parceiro · confirmado' },
];

const FOUND: SubstitutionCandidate[] = [
  { uid: 'ana', name: 'Ana Clara Souza', photo: null, subtitle: 'Goiânia' },
  { uid: 'carla', name: 'Carla Mendes', photo: null, subtitle: 'Atleta' },
];

describe('SubstitutionDialogComponent', () => {
  let fixture: ComponentFixture<SubstitutionDialogComponent>;
  let searchFn: jasmine.Spy<(term: string) => Promise<SubstitutionCandidate[]>>;
  let sent: SubstitutionSendRequest[];
  let closedCount: number;

  const el = <T extends Element = HTMLElement>(selector: string): T | null =>
    (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  const all = (selector: string): HTMLElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector));
  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  async function mount(paymentRule: string | null = 'Os R$ 180,00 seguem valendo — o acerto da metade é entre vocês') {
    await TestBed.configureTestingModule({
      imports: [SubstitutionDialogComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(SubstitutionDialogComponent);
    fixture.componentRef.setInput('slots', SLOTS);
    fixture.componentRef.setInput('searchFn', searchFn);
    fixture.componentRef.setInput('categoryName', 'Feminino B');
    fixture.componentRef.setInput('paymentRule', paymentRule);
    fixture.componentInstance.send.subscribe((r) => sent.push(r));
    fixture.componentInstance.closed.subscribe(() => closedCount++);
    fixture.detectChanges();
  }

  function chooseSlot(uid: string): void {
    const radio = all('input[type="radio"]').find((r) => (r as HTMLInputElement).value === uid) as HTMLInputElement;
    radio.click();
    fixture.detectChanges();
  }

  function clickButton(label: string): void {
    const button = all('button').find((b) => b.textContent?.trim().startsWith(label));
    if (!button) throw new Error(`botão "${label}" não encontrado`);
    button.click();
    fixture.detectChanges();
  }

  async function goToStep2(): Promise<void> {
    chooseSlot('bia');
    clickButton('Escolher o substituto');
    await settle();
  }

  async function searchNow(term: string): Promise<void> {
    const input = el<HTMLInputElement>('input[type="search"]')!;
    input.value = term;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
  }

  beforeEach(() => {
    searchFn = jasmine.createSpy('searchFn').and.resolveTo(FOUND);
    sent = [];
    closedCount = 0;
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('abre no passo 1 com as vagas, e só libera o avanço depois de escolher quem sai', async () => {
    await mount();
    expect(text()).toContain('Quem não vai poder jogar?');
    expect(text()).toContain('passo 1 de 2');
    expect(all('.sd-option').map((o) => o.textContent?.trim())).toEqual([
      jasmine.stringContaining('Silvio Dionizio'),
      jasmine.stringContaining('Bia Lima'),
    ]);
    const cta = el<HTMLButtonElement>('.sd-cta')!;
    expect(cta.disabled).toBeTrue();

    chooseSlot('bia');
    expect(cta.disabled).toBeFalse();
    expect(el('.sd-option--on')?.textContent).toContain('Bia Lima');
  });

  it('mostra a regra do pagamento só quando há pagamento a preservar', async () => {
    await mount(null);
    expect(text()).not.toContain('Inscrição já paga é mantida');
    await goToStep2();
    expect(el('.sd-notice')).toBeNull();
    fixture.destroy();

    TestBed.resetTestingModule();
    await mount();
    expect(text()).toContain('Inscrição já paga é mantida');
    expect(text()).toContain('Os R$ 180,00 seguem valendo');
    await goToStep2();
    expect(el('.sd-notice')?.textContent).toContain('O acerto do valor com Bia Lima é entre vocês.');
  });

  it('leva motivo e detalhe pro passo 2 e pro payload enviado', async () => {
    await mount();
    chooseSlot('bia');
    clickButton('Lesão');
    const note = el<HTMLTextAreaElement>('textarea')!;
    note.value = '  Torceu o tornozelo no treino.  ';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // O contador conta o que está digitado (com os espaços); só o payload sai aparado.
    expect(el('.sd-counter')?.textContent?.trim()).toBe('33/300');

    clickButton('Escolher o substituto');
    await settle();
    expect(text()).toContain('Quem entra no lugar?');
    expect(el('.sd-out')?.textContent).toContain('Bia Lima');
    expect(el('.sd-out')?.textContent).toContain('Lesão');

    await searchNow('ana');
    expect(searchFn).toHaveBeenCalledWith('ana');
    expect(all('.sd-result').length).toBe(2);
    const cta = el<HTMLButtonElement>('.sd-cta')!;
    expect(cta.disabled).toBeTrue();

    all('.sd-result')[0]!.click();
    fixture.detectChanges();
    expect(cta.disabled).toBeFalse();
    expect(cta.textContent?.trim()).toBe('Pedir substituição por Ana');

    cta.click();
    expect(sent).toEqual([
      {
        replacedUid: 'bia',
        replacedName: 'Bia Lima',
        inviteeUid: 'ana',
        inviteeName: 'Ana Clara Souza',
        reason: 'lesao',
        reasonNote: 'Torceu o tornozelo no treino.',
      },
    ]);
  });

  it('sem motivo o payload vai com reason e reasonNote nulos', async () => {
    await mount();
    await goToStep2();
    await searchNow('carla');
    all('.sd-result')[1]!.click();
    fixture.detectChanges();
    el<HTMLButtonElement>('.sd-cta')!.click();
    expect(sent[0]?.reason).toBeNull();
    expect(sent[0]?.reasonNote).toBeNull();
    expect(sent[0]?.inviteeUid).toBe('carla');
  });

  it('termo curto mostra a dica sem buscar; busca vazia e erro têm mensagem própria', async () => {
    await mount();
    await goToStep2();
    expect(text()).toContain('Digite pelo menos 3 letras');

    const input = el<HTMLInputElement>('input[type="search"]')!;
    input.value = 'an';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(searchFn).not.toHaveBeenCalled();
    expect(text()).toContain('Digite pelo menos 3 letras');

    searchFn.and.resolveTo([]);
    await searchNow('zzz');
    expect(text()).toContain('Ninguém encontrado com esse nome');

    searchFn.and.rejectWith(new Error('offline'));
    await searchNow('ana');
    expect(el('.sd-empty--error')?.textContent).toContain('Não foi possível buscar atletas');
  });

  it('"Voltar" volta ao passo 1 preservando a escolha; Esc fecha, salvo enquanto envia', async () => {
    await mount();
    await goToStep2();
    clickButton('Voltar');
    await settle();
    expect(text()).toContain('Quem não vai poder jogar?');
    expect(el('.sd-option--on')?.textContent).toContain('Bia Lima');

    (fixture.nativeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closedCount).toBe(1);

    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closedCount).toBe(1);
  });

  it('enviando, o CTA vira "Enviando…" e fica travado', async () => {
    await mount();
    await goToStep2();
    await searchNow('ana');
    all('.sd-result')[0]!.click();
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const cta = el<HTMLButtonElement>('.sd-cta')!;
    expect(cta.disabled).toBeTrue();
    expect(cta.textContent).toContain('Enviando…');
  });
});
