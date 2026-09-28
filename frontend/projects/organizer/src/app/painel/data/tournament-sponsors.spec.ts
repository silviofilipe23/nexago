import { sponsorFromRaw, sponsorsWithout, validateSponsorLogoFile } from './tournaments-repository';

describe('sponsorFromRaw', () => {
  it('lê um patrocinador válido', () => {
    expect(sponsorFromRaw({ id: 's1', name: 'Acme', logoUrl: 'https://x/acme.jpg' })).toEqual({
      id: 's1',
      name: 'Acme',
      logoUrl: 'https://x/acme.jpg',
    });
  });

  it('descarta item sem id, nome ou logo — sem quebrar a leitura do torneio inteiro', () => {
    expect(sponsorFromRaw({ name: 'Acme', logoUrl: 'https://x/acme.jpg' })).toBeNull();
    expect(sponsorFromRaw({ id: 's1', logoUrl: 'https://x/acme.jpg' })).toBeNull();
    expect(sponsorFromRaw({ id: 's1', name: 'Acme' })).toBeNull();
  });

  it('aguenta valor sem forma nenhuma', () => {
    expect(sponsorFromRaw(null)).toBeNull();
    expect(sponsorFromRaw(undefined)).toBeNull();
    expect(sponsorFromRaw('boom')).toBeNull();
  });
});

describe('sponsorsWithout', () => {
  const sponsors = [
    { id: 's1', name: 'Acme', logoUrl: 'https://x/acme.jpg' },
    { id: 's2', name: 'Beta', logoUrl: 'https://x/beta.jpg' },
  ];

  it('remove só o patrocinador do id indicado', () => {
    expect(sponsorsWithout(sponsors, 's1')).toEqual([sponsors[1]]);
  });

  it('devolve a lista inteira quando o id não existe', () => {
    expect(sponsorsWithout(sponsors, 'nao-existe')).toEqual(sponsors);
  });

  it('aguenta item mal formado no array sem quebrar', () => {
    expect(sponsorsWithout([null, 'boom', sponsors[0]], 's1')).toEqual([null, 'boom']);
  });
});

describe('validateSponsorLogoFile', () => {
  function fakeFile(type: string, sizeBytes: number): File {
    return { type, size: sizeBytes } as File;
  }

  it('aceita imagem dentro do limite', () => {
    expect(validateSponsorLogoFile(fakeFile('image/png', 1024))).toBeNull();
  });

  it('recusa arquivo que não é imagem', () => {
    expect(validateSponsorLogoFile(fakeFile('application/pdf', 1024))).toMatch(/imagem/i);
  });

  it('recusa imagem maior que 4 MB', () => {
    expect(validateSponsorLogoFile(fakeFile('image/png', 4 * 1024 * 1024 + 1))).toMatch(/grande/i);
  });
});
