import { validateArenaContacts } from '../data/arena-profile.model';
import { buildArenaContactsUpdate } from './arena-profile-repository';

describe('buildArenaContactsUpdate', () => {
  it('grava só telefone e WhatsApp', () => {
    const update = buildArenaContactsUpdate({ phone: ' (48) 3251-4477 ', whatsapp: '(48) 99999-0000' });
    expect(Object.keys(update).sort()).toEqual(['phone', 'whatsapp']);
    expect(update['phone']).toBe('(48) 3251-4477');
  });

  it('não toca no endereço, que agora é da tela de dados cadastrais', () => {
    const update = buildArenaContactsUpdate({ phone: '(48) 3251-4477', whatsapp: '' });
    // Um `address: ''` aqui apagaria o endereço estruturado gravado na outra tela.
    expect('address' in update).toBe(false);
    expect('addressParts' in update).toBe(false);
    expect('city' in update).toBe(false);
    expect('state' in update).toBe(false);
  });

  it('WhatsApp vazio some do doc em vez de virar string vazia', () => {
    const update = buildArenaContactsUpdate({ phone: '(48) 3251-4477', whatsapp: '  ' });
    expect(typeof update['whatsapp']).not.toBe('string');
  });
});

describe('validateArenaContacts', () => {
  it('aceita telefone e WhatsApp válidos', () => {
    expect(validateArenaContacts({ phone: '(48) 3251-4477', whatsapp: '(48) 99999-0000' })).toBeNull();
  });

  it('não exige mais cidade e UF: quem cuida disso é Dados cadastrais', () => {
    expect(validateArenaContacts({ phone: '(48) 3251-4477', whatsapp: '' })).toBeNull();
  });

  it('cobra telefone com DDD', () => {
    expect(validateArenaContacts({ phone: '3251-4477', whatsapp: '' })).toBe(
      'Telefone inválido. Use DDD + número (10 a 13 dígitos).',
    );
  });

  it('cobra WhatsApp válido quando preenchido', () => {
    expect(validateArenaContacts({ phone: '(48) 3251-4477', whatsapp: '999' })).toBe('WhatsApp inválido.');
  });
});
