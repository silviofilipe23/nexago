import { validateArenaContacts } from '../data/arena-profile.model';
import { buildArenaContactsUpdate, validateArenaImageFile } from './arena-profile-repository';

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

describe('validateArenaImageFile', () => {
  const file = (type: string, size = 1024) => new File([new Uint8Array(size)], 'capa', { type });

  it('aceita JPG, PNG e WebP', () => {
    expect(validateArenaImageFile(file('image/jpeg'))).toBeNull();
    expect(validateArenaImageFile(file('image/png'))).toBeNull();
    expect(validateArenaImageFile(file('image/webp'))).toBeNull();
  });

  it('recusa outros formatos que o storage.rules não aceita do gestor', () => {
    expect(validateArenaImageFile(file('image/gif'))).toContain('JPG, PNG ou WebP');
    expect(validateArenaImageFile(file('image/heic'))).toContain('JPG, PNG ou WebP');
  });

  it('5MB já é demais: o storage.rules exige menos que isso', () => {
    expect(validateArenaImageFile(file('image/jpeg', 5 * 1024 * 1024))).toContain('5MB');
    expect(validateArenaImageFile(file('image/jpeg', 5 * 1024 * 1024 - 1))).toBeNull();
  });
});
