import {
  homeBannerIdFrom,
  homeBannerStatus,
  homeBannersFromDoc,
  homeSlot,
  liveHomeBanners,
  pct,
  shortPeriod,
  statsFromDoc,
  type HomeBanner,
} from './home-banner';
import { emptyHomeBannerForm, publishLabel, validateHomeBannerForm, type HomeBannerForm } from './home-banner-form';
import { artSizeCheck } from './home-banner-image';

const TODAY = '2026-10-26';

function banner(id: string, over: Partial<HomeBanner> = {}): HomeBanner {
  return {
    id,
    format: 'carousel',
    title: `Banner ${id}`,
    description: 'Uma linha.',
    ctaLabel: 'Abrir',
    imageUrl: null,
    destination: 'reservar',
    url: null,
    audience: 'all',
    startDate: null,
    endDate: null,
    hideAfterClick: true,
    dismissible: true,
    published: true,
    active: true,
    ...over,
  };
}

function form(over: Partial<HomeBannerForm> = {}): HomeBannerForm {
  return { ...emptyHomeBannerForm(), title: 'Bora Jogar', description: 'Monte o jogo.', ctaLabel: 'Montar jogo', ...over };
}

describe('home-banner', () => {
  it('status: rascunho ganha de tudo; depois encerrado, pausado, agendado e no ar', () => {
    expect(homeBannerStatus(banner('a', { published: false, endDate: '2020-01-01' }), TODAY)).toBe('rascunho');
    expect(homeBannerStatus(banner('a', { endDate: '2026-10-25', active: false }), TODAY)).toBe('encerrado');
    expect(homeBannerStatus(banner('a', { active: false, startDate: '2026-11-01' }), TODAY)).toBe('pausado');
    expect(homeBannerStatus(banner('a', { startDate: '2026-11-01' }), TODAY)).toBe('agendado');
    expect(homeBannerStatus(banner('a', { startDate: TODAY, endDate: TODAY }), TODAY)).toBe('no-ar');
  });

  it('a Home mostra o carrossel; sem card de carrossel, o primeiro compacto', () => {
    const list = [
      banner('compacto-1', { format: 'compact' }),
      banner('a'),
      banner('pausado', { active: false }),
      banner('b'),
      banner('compacto-2', { format: 'compact' }),
    ];
    const live = liveHomeBanners(list, TODAY);
    expect(homeSlot(live)).toEqual({ format: 'carousel', banners: [list[1]!, list[3]!] });
    expect(homeSlot(live.filter((b) => b.format === 'compact'))).toEqual({ format: 'compact', banners: [list[0]!] });
    expect(homeSlot([])).toBeNull();
  });

  it('lê o doc tolerando campo ausente ou estranho', () => {
    const { banners, version } = homeBannersFromDoc({
      version: 3,
      banners: [{ id: 'x', title: ' Bora ', destination: 'radar', audience: 'inativos', format: 'story' }, { title: 'sem id' }],
    });
    expect(version).toBe(3);
    expect(banners.length).toBe(1);
    expect(banners[0]).toEqual(
      jasmine.objectContaining({ title: 'Bora', destination: 'reservar', audience: 'all', format: 'carousel', published: false, active: true }),
    );
    expect(homeBannersFromDoc(undefined)).toEqual({ banners: [], version: 0 });
    expect(statsFromDoc({ seen: 120, clicked: '3', dismissed: -1 })).toEqual({ seen: 120, clicked: 0, dismissed: 0 });
  });

  it('período curto da lista', () => {
    expect(shortPeriod({ startDate: '2026-10-20', endDate: '2026-11-20' })).toBe('20/10 → 20/11');
    expect(shortPeriod({ startDate: '2026-11-01', endDate: null })).toBe('01/11 → sem fim');
    expect(shortPeriod({ startDate: null, endDate: '2026-11-30' })).toBe('até 30/11');
    expect(shortPeriod({ startDate: null, endDate: null })).toBe('Sem prazo');
  });

  it('taxa com vírgula; sem quem viu, traço', () => {
    expect(pct(42, 1000)).toBe('4,2%');
    expect(pct(0, 0)).toBe('—');
  });

  it('id do título, sem acento e sem repetir', () => {
    expect(homeBannerIdFrom('Reserva com Pix', new Set())).toBe('reserva-com-pix');
    expect(homeBannerIdFrom('Ação!', new Set(['acao']))).toBe('acao-2');
    expect(homeBannerIdFrom('', new Set())).toBe('novidade');
  });
});

describe('home-banner-form', () => {
  it('publicar exige título, descrição e botão (no carrossel)', () => {
    const r = validateHomeBannerForm(form({ title: '', description: ' ', ctaLabel: '' }), 'publish');
    expect(r.ok).toBeFalse();
    expect(r.ok ? [] : Object.keys(r.errors).sort()).toEqual(['ctaLabel', 'description', 'title']);
    expect(validateHomeBannerForm(form({ format: 'compact', ctaLabel: '' }), 'publish').ok).toBeTrue();
  });

  it('rascunho aceita incompleto, mas não acima do teto', () => {
    expect(validateHomeBannerForm(form({ title: '', description: '', ctaLabel: '' }), 'draft').ok).toBeTrue();
    const r = validateHomeBannerForm(form({ title: 'x'.repeat(23) }), 'draft');
    expect(r.ok ? null : r.errors.title).toBe('Até 22 caracteres.');
  });

  it('link externo: https ao publicar; rascunho guarda sem link', () => {
    expect(validateHomeBannerForm(form({ destination: 'url', url: '' }), 'publish').ok).toBeFalse();
    expect(validateHomeBannerForm(form({ destination: 'url', url: 'http://x.com' }), 'draft').ok).toBeFalse();
    expect(validateHomeBannerForm(form({ destination: 'url', url: '' }), 'draft').ok).toBeTrue();
    const r = validateHomeBannerForm(form({ destination: 'url', url: ' https://nexago.app/x ' }), 'publish');
    expect(r.ok ? r.content.url : null).toBe('https://nexago.app/x');
  });

  it('link de outro destino não vai junto; fim antes do início é erro', () => {
    const r = validateHomeBannerForm(form({ destination: 'ranking', url: 'https://x.com' }), 'publish');
    expect(r.ok ? r.content.url : 'erro').toBeNull();
    const bad = validateHomeBannerForm(form({ startDate: '2026-11-02', endDate: '2026-11-01' }), 'publish');
    expect(bad.ok ? null : bad.errors.endDate).toBe('O fim vem depois do início.');
  });

  it('Agendar quando o início é depois de hoje', () => {
    expect(publishLabel({ startDate: '2026-11-01' }, TODAY)).toBe('Agendar');
    expect(publishLabel({ startDate: TODAY }, TODAY)).toBe('Publicar');
    expect(publishLabel({ startDate: '' }, TODAY)).toBe('Publicar');
  });
});

describe('home-banner-image', () => {
  it('abaixo de 224×264 barra; deitada demais só avisa', () => {
    expect(artSizeCheck({ width: 200, height: 300 }).error).toContain('o mínimo é 224×264');
    expect(artSizeCheck({ width: 600, height: 300 })).toEqual(jasmine.objectContaining({ error: null }));
    expect(artSizeCheck({ width: 600, height: 300 }).warning).toContain('em pé');
    expect(artSizeCheck({ width: 336, height: 396 })).toEqual({ error: null, warning: null });
  });
});
