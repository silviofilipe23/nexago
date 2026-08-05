import { claimsAllowPanel, claimsFromToken } from './auth.service';

/** Quem entra no /painel. O super admin passa SEM o papel `organizer` porque entra
 *  pra dar suporte a torneio alheio; o papel `admin` sozinho continua de fora (é o
 *  acesso do backoffice). */
describe('acesso ao painel do organizador', () => {
  it('lê papéis e a claim de super admin do token', () => {
    const claims = claimsFromToken({ roles: ['organizer', 'athlete'], superAdmin: true });
    expect(claims.roles).toEqual(['organizer', 'athlete']);
    expect(claims.superAdmin).toBe(true);
  });

  it('trata token sem papéis como lista vazia, não como erro', () => {
    expect(claimsFromToken({}).roles).toEqual([]);
    expect(claimsFromToken({ roles: 'organizer' }).roles).toEqual([]);
  });

  it('só aceita superAdmin estritamente booleano — string "true" não vale', () => {
    expect(claimsFromToken({ superAdmin: 'true' }).superAdmin).toBe(false);
    expect(claimsFromToken({ superAdmin: 1 }).superAdmin).toBe(false);
  });

  it('libera o organizador', () => {
    expect(claimsAllowPanel({ roles: ['organizer'], superAdmin: false })).toBe(true);
  });

  it('libera o super admin mesmo sem o papel organizer', () => {
    expect(claimsAllowPanel({ roles: ['admin'], superAdmin: true })).toBe(true);
  });

  it('barra o papel admin sozinho — backoffice não é o painel do organizador', () => {
    expect(claimsAllowPanel({ roles: ['admin'], superAdmin: false })).toBe(false);
  });

  it('barra o atleta', () => {
    expect(claimsAllowPanel({ roles: ['athlete'], superAdmin: false })).toBe(false);
    expect(claimsAllowPanel({ roles: [], superAdmin: false })).toBe(false);
  });
});
