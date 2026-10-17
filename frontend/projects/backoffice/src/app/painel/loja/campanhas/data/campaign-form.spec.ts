import type { CampaignBanner } from './campaign';
import { emptyCampaignForm, formFromBanner, isBannerLink, previewBanner, validateCampaignForm } from './campaign-form';

describe('campaign-form', () => {
  it('form vazio: botão "Ver coleção" na 1ª coleção, sem secundário, sem prazo, ativa', () => {
    const f = emptyCampaignForm();
    expect([f.primaryLabel, f.collectionId, f.secondaryKind, f.startDate, f.endDate, f.active]).toEqual([
      'Ver coleção',
      'verao-2026',
      'none',
      '',
      '',
      true,
    ]);
  });

  it('monta o banner do desenho (Verão 26)', () => {
    const r = validateCampaignForm(
      {
        ...emptyCampaignForm(),
        kicker: ' COLEÇÃO VERÃO 26 ',
        title: 'Equipamento de quem joga na areia ',
        subtitle: 'Bolas, vestuário UV e acessórios testados no circuito NexaGO.',
        imageUrl: 'https://firebasestorage.googleapis.com/x.jpg',
        secondaryKind: 'category',
        secondaryLabel: 'Kits pra arena',
        categoryId: 'kits',
        url: '/sobra-de-quando-era-link',
        endDate: '2026-12-31',
      },
      'verao-26',
    );
    expect(r).toEqual({
      ok: true,
      banner: {
        id: 'verao-26',
        kicker: 'COLEÇÃO VERÃO 26',
        title: 'Equipamento de quem joga na areia',
        subtitle: 'Bolas, vestuário UV e acessórios testados no circuito NexaGO.',
        imageUrl: 'https://firebasestorage.googleapis.com/x.jpg',
        primary: { label: 'Ver coleção', collectionId: 'verao-2026' },
        secondary: { label: 'Kits pra arena', categoryId: 'kits', url: null },
        startDate: null,
        endDate: '2026-12-31',
        active: true,
      },
    });
  });

  it('erros por campo', () => {
    const r = validateCampaignForm(
      {
        ...emptyCampaignForm(),
        title: '  ',
        subtitle: 'y'.repeat(91),
        primaryLabel: '',
        secondaryKind: 'url',
        secondaryLabel: 'Ver',
        url: 'http://inseguro.com',
        startDate: '2026-12-01',
        endDate: '2026-11-30',
      },
      '',
    );
    expect(r.ok).toBeFalse();
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['endDate', 'primaryLabel', 'subtitle', 'title', 'url']);
    }
    const noCategory = validateCampaignForm({ ...emptyCampaignForm(), title: 'x', secondaryKind: 'category', secondaryLabel: 'Ver' }, '');
    expect(!noCategory.ok && Object.keys(noCategory.errors)).toEqual(['categoryId']);
  });

  it('link: caminho do portal ou https, como no servidor', () => {
    expect(isBannerLink('/torneios?esporte=volei')).toBeTrue();
    expect(isBannerLink('https://nexago.com.br')).toBeTrue();
    expect(isBannerLink('//evil.com')).toBeFalse();
    expect(isBannerLink('javascript:alert(1)')).toBeFalse();
    expect(isBannerLink('/com espaço')).toBeFalse();
  });

  it('editar parte do banner salvo e volta igual', () => {
    const saved: CampaignBanner = {
      id: 'torneios',
      kicker: '',
      title: 'Bora pro circuito',
      subtitle: '',
      imageUrl: null,
      primary: { label: 'Ver Linha Pro', collectionId: 'linha-pro' },
      secondary: { label: 'Ver torneios', categoryId: null, url: '/torneios' },
      startDate: '2026-11-01',
      endDate: null,
      active: false,
    };
    const f = formFromBanner(saved);
    expect(f.secondaryKind).toBe('url');
    expect(validateCampaignForm(f, 'torneios')).toEqual({ ok: true, banner: saved });
  });

  it('prévia preenche o que falta com o texto de exemplo e esconde secundário sem texto', () => {
    const p = previewBanner({ ...emptyCampaignForm(), secondaryKind: 'category', categoryId: 'kits' });
    expect(p.title).toBe('Título da campanha');
    expect(p.secondary).toBeNull();
  });
});
