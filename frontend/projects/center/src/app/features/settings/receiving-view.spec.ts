import type { ReceivingAccount } from '../../domain/models';
import { parseReais, receivingFormError, receivingView } from './receiving-view';

const acc = (p: Partial<ReceivingAccount>): ReceivingAccount => ({
  status: 'pending', source: 'self', personType: 'company', name: 'CT', email: '', document: '', documents: [],
  createdAt: null, createdByName: '', statusCheckedAt: null, ...p,
});

describe('conta de recebimento (tela)', () => {
  it('sem conta: owner vê o formulário, admin só o aviso; script antigo conta como ativa', () => {
    expect(receivingView(null, 'none', false, true).kind).toBe('form');
    expect(receivingView(null, 'none', false, false).kind).toBe('readonly');
    expect(receivingView(null, 'failed', false, true).failed).toBeTrue();
    expect(receivingView(null, 'approved', true, false).title).toBe('Conta ativa');
    expect(receivingView(undefined, 'none', false, true).kind).toBe('loading');
  });

  it('em análise lista só os documentos que faltam', () => {
    const v = receivingView(acc({ documents: [
      { title: 'Contrato social', status: 'NOT_SENT', url: 'u' },
      { title: 'RG', status: 'APPROVED', url: '' },
    ] }), 'pending', false, true);
    expect(v.title).toBe('Em análise no Asaas');
    expect(v.pendingDocs).toEqual([{ title: 'Contrato social', label: 'Não enviado', url: 'u' }]);
  });

  it('lê valores e confere o básico do formulário', () => {
    expect(parseReais('R$ 25.000')).toBe(25000);
    expect(parseReais('25.000,50')).toBe(25000.5);
    expect(parseReais('1500.5')).toBe(1500.5);
    expect(parseReais('abc')).toBeNull();
    const f = {
      personType: 'company' as const, companyType: 'LIMITED', name: 'CT Maré LTDA', cpfCnpj: '11.222.333/0001-81', birthDate: '',
      email: 'a@b.com', mobilePhone: '(13) 99123-4567', incomeValue: 25000, postalCode: '11060-001', address: 'Av', addressNumber: '1', province: 'B',
    };
    expect(receivingFormError(f)).toBeNull();
    expect(receivingFormError({ ...f, companyType: '' })).toContain('tipo de empresa');
    expect(receivingFormError({ ...f, personType: 'person', name: 'Renata', cpfCnpj: '52998224725' })).toContain('nome completo');
  });
});
