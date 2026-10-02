import { deleteField, type FieldValue } from 'firebase/firestore';
import {
  DEFAULT_ORGANIZER_PUBLIC_PROFILE,
  ORGANIZER_BIO_MAX,
  ORGANIZER_COVER_MAX_BYTES,
  buildOrganizerPublicProfilePatch,
  hasUsableContactPhone,
  normalizeOrganizerBio,
  organizerPublicProfileUrl,
  parseOrganizerPublicProfile,
  validateCoverFile,
} from './organizer-public-profile';

const WITH_PHONE = { hasContactPhone: true };

describe('organizer-public-profile', () => {
  describe('parseOrganizerPublicProfile', () => {
    it('mapa vazio cai nos defaults', () => {
      expect(parseOrganizerPublicProfile({})).toEqual(DEFAULT_ORGANIZER_PUBLIC_PROFILE);
      expect(DEFAULT_ORGANIZER_PUBLIC_PROFILE).toEqual({ bio: '', coverUrl: null, publicWhatsapp: false });
    });

    it('lê os três campos do mapa organizerProfile', () => {
      const p = parseOrganizerPublicProfile({
        orgName: 'Liga',
        bio: '  Torneios de areia em Goiânia.  ',
        coverUrl: ' https://x/capa.jpg ',
        publicWhatsapp: true,
      });
      expect(p).toEqual({ bio: 'Torneios de areia em Goiânia.', coverUrl: 'https://x/capa.jpg', publicWhatsapp: true });
    });

    it('tipos errados viram default: capa vazia é null e só true liga o WhatsApp', () => {
      const p = parseOrganizerPublicProfile({ bio: 42, coverUrl: '   ', publicWhatsapp: 'true' });
      expect(p).toEqual(DEFAULT_ORGANIZER_PUBLIC_PROFILE);
    });
  });

  describe('normalizeOrganizerBio', () => {
    it('apara as pontas e preserva quebras de linha internas', () => {
      expect(normalizeOrganizerBio('  Linha 1\nLinha 2 \n')).toBe('Linha 1\nLinha 2');
    });

    it('corta em 280', () => {
      expect(normalizeOrganizerBio('a'.repeat(400)).length).toBe(ORGANIZER_BIO_MAX);
      expect(normalizeOrganizerBio('a'.repeat(280))).toBe('a'.repeat(280));
    });

    it('não parte um emoji no meio quando o corte cai nele', () => {
      const out = normalizeOrganizerBio('a'.repeat(279) + '🏐' + 'b');
      expect(out).toBe('a'.repeat(279));
    });
  });

  describe('hasUsableContactPhone', () => {
    it('exige DDD + número', () => {
      expect(hasUsableContactPhone('')).toBeFalse();
      expect(hasUsableContactPhone('99985')).toBeFalse();
      expect(hasUsableContactPhone('6232514477')).toBeTrue();
      expect(hasUsableContactPhone('(62) 99985-3983')).toBeTrue();
    });
  });

  describe('buildOrganizerPublicProfilePatch', () => {
    it('manda exatamente as três chaves pontilhadas, nada do resto do mapa', () => {
      const patch = buildOrganizerPublicProfilePatch(
        { bio: 'Bio', coverUrl: 'https://x/capa.jpg', publicWhatsapp: true },
        WITH_PHONE,
      );
      expect(Object.keys(patch).sort()).toEqual([
        'organizerProfile.bio',
        'organizerProfile.coverUrl',
        'organizerProfile.publicWhatsapp',
      ]);
      expect(patch['organizerProfile.bio']).toBe('Bio');
      expect(patch['organizerProfile.coverUrl']).toBe('https://x/capa.jpg');
      expect(patch['organizerProfile.publicWhatsapp']).toBeTrue();
    });

    it('nunca envia o mapa inteiro nem campos do card Perfil, mesmo se o rascunho trouxer', () => {
      const draft = {
        bio: 'Bio',
        coverUrl: null,
        publicWhatsapp: false,
        orgName: 'Velho',
        contactPhone: '62999999999',
      } as unknown as Parameters<typeof buildOrganizerPublicProfilePatch>[0];
      const patch = buildOrganizerPublicProfilePatch(draft, WITH_PHONE) as Record<string, unknown>;
      expect(Object.keys(patch).length).toBe(3);
      expect('organizerProfile' in patch).toBeFalse();
      expect(Object.keys(patch).every((k) => k.startsWith('organizerProfile.'))).toBeTrue();
    });

    it('apara e corta a bio em 280', () => {
      const patch = buildOrganizerPublicProfilePatch(
        { bio: `  ${'x'.repeat(300)}  `, coverUrl: null, publicWhatsapp: false },
        WITH_PHONE,
      );
      expect(patch['organizerProfile.bio']).toBe('x'.repeat(280));
    });

    it('capa removida vira deleteField()', () => {
      const patch = buildOrganizerPublicProfilePatch({ bio: '', coverUrl: null, publicWhatsapp: false }, WITH_PHONE);
      const cover = patch['organizerProfile.coverUrl'] as FieldValue;
      expect(typeof cover).not.toBe('string');
      expect(cover.isEqual(deleteField())).toBeTrue();
    });

    it('capa só com espaços também é remoção', () => {
      const patch = buildOrganizerPublicProfilePatch({ bio: '', coverUrl: '  ', publicWhatsapp: false }, WITH_PHONE);
      expect((patch['organizerProfile.coverUrl'] as FieldValue).isEqual(deleteField())).toBeTrue();
    });

    it('sem telefone de contato grava o WhatsApp desligado, como a tela mostra', () => {
      const patch = buildOrganizerPublicProfilePatch(
        { bio: '', coverUrl: null, publicWhatsapp: true },
        { hasContactPhone: false },
      );
      expect(patch['organizerProfile.publicWhatsapp']).toBeFalse();
    });
  });

  describe('validateCoverFile', () => {
    it('aceita imagem até 5 MB', () => {
      expect(validateCoverFile({ type: 'image/jpeg', size: ORGANIZER_COVER_MAX_BYTES })).toBeNull();
      expect(validateCoverFile({ type: 'image/png', size: 1024 })).toBeNull();
    });

    it('recusa o que não é imagem', () => {
      expect(validateCoverFile({ type: 'application/pdf', size: 1024 })).toBe('Escolha um arquivo de imagem.');
      expect(validateCoverFile({ type: '', size: 1024 })).toBe('Escolha um arquivo de imagem.');
    });

    it('recusa acima de 5 MB antes de redimensionar', () => {
      expect(validateCoverFile({ type: 'image/jpeg', size: ORGANIZER_COVER_MAX_BYTES + 1 })).toBe(
        'Imagem muito grande (máximo 5 MB).',
      );
    });
  });

  describe('organizerPublicProfileUrl', () => {
    it('monta a rota do portal do atleta sem barra dupla', () => {
      expect(organizerPublicProfileUrl('https://atleta.nexago.com.br', 'abc')).toBe(
        'https://atleta.nexago.com.br/organizadores/abc',
      );
      expect(organizerPublicProfileUrl('https://atleta.nexago.com.br/', 'abc')).toBe(
        'https://atleta.nexago.com.br/organizadores/abc',
      );
    });

    it('escapa o uid', () => {
      expect(organizerPublicProfileUrl('https://a', 'a/b')).toBe('https://a/organizadores/a%2Fb');
    });
  });
});
