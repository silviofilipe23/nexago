import {
  campaignIdFrom,
  campaignStatuses,
  campaignsFromDoc,
  ctaSummary,
  liveCampaigns,
  moveItem,
  periodLabel,
  type CampaignBanner,
} from './campaign';

const TODAY = '2026-10-17';

function banner(over: Partial<CampaignBanner> = {}): CampaignBanner {
  return {
    id: 'verao-26',
    kicker: 'COLEÇÃO VERÃO 26',
    title: 'Equipamento de quem joga na areia',
    subtitle: '',
    imageUrl: null,
    primary: { label: 'Ver coleção', collectionId: 'verao-2026' },
    secondary: null,
    startDate: null,
    endDate: null,
    active: true,
    ...over,
  };
}

describe('campaign', () => {
  it('doc ausente = nenhuma campanha, versão 0; doc do script antigo vale como ativo', () => {
    expect(campaignsFromDoc(undefined)).toEqual({ banners: [], version: 0 });
    const { banners, version } = campaignsFromDoc({
      banners: [{ id: 'verao-26', title: 'Verão', primary: { label: 'Ver', collectionId: 'verao-2026' } }, { title: 'sem id' }],
    });
    expect(version).toBe(0);
    expect(banners.map((b) => [b.id, b.active, b.secondary])).toEqual([['verao-26', true, null]]);
    expect(campaignsFromDoc({ banners: [], version: 7 }).version).toBe(7);
  });

  it('a vitrine mostra os 3 primeiros no ar, na ordem; o 4º espera na fila', () => {
    const list = [
      banner({ id: 'a' }),
      banner({ id: 'pausada', active: false }),
      banner({ id: 'b', startDate: TODAY, endDate: TODAY }),
      banner({ id: 'velha', endDate: '2026-10-16' }),
      banner({ id: 'futura', startDate: '2026-10-18' }),
      banner({ id: 'c' }),
      banner({ id: 'd' }),
    ];
    expect(campaignStatuses(list, TODAY)).toEqual(['no-ar', 'pausada', 'no-ar', 'encerrada', 'agendada', 'no-ar', 'fila']);
    expect(liveCampaigns(list, TODAY).map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('período em pt-BR', () => {
    expect(periodLabel(banner())).toBe('Sem prazo');
    expect(periodLabel(banner({ startDate: '2026-11-01', endDate: '2026-11-30' }))).toBe('1–30 nov');
    expect(periodLabel(banner({ startDate: '2026-10-20', endDate: '2026-11-30' }))).toBe('20 out – 30 nov');
    expect(periodLabel(banner({ endDate: '2026-12-24' }))).toBe('Até 24 dez');
    expect(periodLabel(banner({ startDate: '2026-12-01' }))).toBe('A partir de 1 dez');
    expect(periodLabel(banner({ startDate: '2026-11-27', endDate: '2026-11-27' }))).toBe('27 nov');
  });

  it('resumo dos botões com os rótulos da coleção e da categoria', () => {
    expect(ctaSummary(banner())).toBe('Ver coleção → Verão 2026');
    expect(ctaSummary(banner({ secondary: { label: 'Kits pra arena', categoryId: 'kits', url: null } }))).toBe(
      'Ver coleção → Verão 2026 · Kits pra arena → Kits',
    );
    expect(ctaSummary(banner({ secondary: { label: 'Torneios', categoryId: null, url: '/torneios' } }))).toBe(
      'Ver coleção → Verão 2026 · Torneios → /torneios',
    );
  });

  it('id legível a partir do título, sem acento e sem repetir', () => {
    expect(campaignIdFrom('Black Friday: até 40%!', new Set())).toBe('black-friday-ate-40');
    expect(campaignIdFrom('Verão 26', new Set(['verao-26', 'verao-26-2']))).toBe('verao-26-3');
    expect(campaignIdFrom('!!!', new Set())).toBe('campanha');
    expect(campaignIdFrom('x'.repeat(60), new Set()).length).toBe(40);
  });

  it('mover item na lista', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});
