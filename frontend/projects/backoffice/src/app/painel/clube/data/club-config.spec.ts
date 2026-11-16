import { addTester, clubConfigFromDoc, configPayload, removeTester, shortName, userDisplayName } from './club-config';
import { clubErrorMessage } from './club-errors';

describe('clube: mensagens de erro', () => {
  it('nunca mostra a mensagem crua do Firebase', () => {
    expect(clubErrorMessage({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toContain(
      'Sem permissão',
    );
    expect(clubErrorMessage({ code: 'storage/unauthorized' })).toContain('Sem permissão');
    expect(clubErrorMessage({ code: 'unavailable' })).toContain('conexão');
    expect(clubErrorMessage(new Error('boom'))).toBe('Não foi possível concluir. Tente de novo.');
    const exists = Object.assign(new Error('Já existe um parceiro com o id "x". Mude o nome.'), { name: 'PartnerExistsError' });
    expect(clubErrorMessage(exists)).toContain('Já existe');
  });
});

describe('clube: config (appConfig/benefitsClub)', () => {
  it('sem doc = desligado e ninguém testando; lista ruim é limpa', () => {
    expect(clubConfigFromDoc(undefined)).toEqual({ enabled: false, testerUids: [], updatedAt: null, updatedByName: '' });
    const c = clubConfigFromDoc({ enabled: true, testerUids: ['a', 'a', 3, 'b c', 'b'] });
    expect(c.enabled).toBeTrue();
    expect(c.testerUids).toEqual(['a', 'b']);
  });

  it('payload tem só enabled e testerUids (a autoria o repositório põe)', () => {
    expect(configPayload(true, ['u1', 'u2'])).toEqual({ enabled: true, testerUids: ['u1', 'u2'] });
    expect(configPayload(false, Array.from({ length: 60 }, (_, i) => `u${i}`)).testerUids.length).toBe(50);
  });

  it('adicionar: apara, recusa vazio, inválido, repetido e o 51º', () => {
    expect(addTester(['a'], '  b ')).toEqual({ list: ['a', 'b'] });
    expect(addTester([], ' ')).toEqual({ error: 'Cole o uid do atleta.' });
    expect('error' in addTester([], 'uid com espaço')).toBeTrue();
    expect(addTester(['a'], 'a')).toEqual({ error: 'Esse uid já está na lista.' });
    const full = Array.from({ length: 50 }, (_, i) => `u${i}`);
    expect(addTester(full, 'novo')).toEqual({ error: 'Limite de 50 pessoas testando.' });
    expect(removeTester(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('nome do usuário: nome completo, depois exibição, depois e-mail; pílula curta', () => {
    expect(userDisplayName({ fullName: ' Silvio Dionizio ', email: 's@x.com' })).toBe('Silvio Dionizio');
    expect(userDisplayName({ displayName: '', email: 's@x.com' })).toBe('s@x.com');
    expect(userDisplayName({})).toBeNull();
    expect(userDisplayName(undefined)).toBeNull();
    expect(shortName('Silvio Dionizio Filho')).toBe('Silvio D.');
    expect(shortName('Rhuan')).toBe('Rhuan');
    expect(shortName('ana souza@x.com')).toBe('ana souza@x.com');
  });
});
