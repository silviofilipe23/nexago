import type { BlogPost } from './blog-post';
import {
  buildSuggestions,
  calendarDaysUntil,
  isListedTournament,
  prefillFromParams,
  prefillParams,
  rankingStagesFromDoc,
  recentStages,
  type TournamentCandidate,
} from './blog-suggestions';

const NOW = new Date('2026-11-05T15:00:00Z'); // 12:00 em São Paulo
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function post(id: string, over: Partial<BlogPost> = {}): BlogPost {
  return {
    id,
    title: `Post ${id}`,
    subtitle: '',
    slug: id,
    seoDescription: '',
    coverUrl: null,
    category: 'torneios',
    sport: 'all',
    tags: [],
    author: { name: 'Ana', role: '' },
    body: [],
    cta: null,
    channels: { app: true, site: true },
    featured: false,
    push: { enabled: false, city: null, sport: 'all' },
    pushSentAt: null,
    pushResult: null,
    status: 'draft',
    publishAt: null,
    readMinutes: 1,
    readCount: 0,
    helpfulCount: 0,
    updatedAt: null,
    version: 1,
    commentCount: 0,
    ...over,
  };
}

function tournament(id: string, over: Partial<TournamentCandidate> = {}): TournamentCandidate {
  return { id, name: `Copa ${id}`, sport: 'beach_volleyball', status: 'inscricoes', startAt: day(9), ...over };
}

const EMPTY = { posts: [], tournaments: [], stages: [], products: [] };

describe('blog · pautas sugeridas', () => {
  it('torneio listado: só publicListing e fora de rascunho (regra do site)', () => {
    expect(isListedTournament({ visibility: 'publicListing', status: 'open' })).toBeTrue();
    expect(isListedTournament({ visibility: 'publicListing', status: 'draft' })).toBeFalse();
    expect(isListedTournament({ visibility: 'publicListing', listingStatus: 'Rascunho', status: 'open' })).toBeFalse();
    expect(isListedTournament({ visibility: 'linkOnly', status: 'open' })).toBeFalse();
    expect(isListedTournament({ status: 'open' })).toBeFalse();
  });

  it('dias de calendário de São Paulo', () => {
    expect(calendarDaysUntil(new Date('2026-11-06T02:59:00Z'), NOW)).toBe(0); // 23:59 de hoje em SP
    expect(calendarDaysUntil(new Date('2026-11-06T03:00:00Z'), NOW)).toBe(1);
    expect(calendarDaysUntil(day(-2), NOW)).toBe(-2);
  });

  it('torneio: inscrições abertas ou começando em 30 dias, sem post que o cite', () => {
    const out = buildSuggestions(
      {
        ...EMPTY,
        posts: [post('p', { body: [{ type: 'tournament', tournamentId: 'citado' }] })],
        tournaments: [
          tournament('a'),
          tournament('b', { status: 'encerradas', startAt: day(3) }),
          tournament('citado'),
          tournament('longe', { status: 'encerradas', startAt: day(40) }),
          tournament('passou', { startAt: day(-1) }),
          tournament('fim', { status: 'concluido' }),
        ],
      },
      NOW,
    );
    expect(out.map((s) => s.key)).toEqual(['tournament:b', 'tournament:a']);
    expect(out[0]).toEqual(
      jasmine.objectContaining({ kicker: 'TORNEIO · EM 3 DIAS', title: 'Copa b começa em 3 dias e ainda não tem post' }),
    );
    expect(out[1]).toEqual(jasmine.objectContaining({ kicker: 'TORNEIO · EM 9 DIAS', title: 'Copa a abre inscrições e ainda não tem post' }));
    expect(out[1]!.prefill).toEqual({
      category: 'torneios',
      sport: 'beachVolleyball',
      title: 'Inscrições abertas: Copa a',
      block: { type: 'tournament', id: 'a' },
    });
  });

  it('etapas do ranking: a mais recente por esporte nos últimos 14 dias', () => {
    const stages = rankingStagesFromDoc('VOLEI_PRAIA', {
      sport: 'VOLEI_PRAIA',
      stages: { t1: { year: 2026, at: { toDate: () => day(-1) } }, t0: { year: 2026, at: { toDate: () => day(-20) } }, bad: { year: 2026 } },
    });
    expect(stages.map((s) => s.tournamentId)).toEqual(['t1', 't0']);
    expect(recentStages(stages, NOW).map((s) => s.tournamentId)).toEqual(['t1']);
  });

  it('ranking: rótulo de quando, etapa no título e rascunho com bloco do esporte; some se já tem post depois', () => {
    const stage = { sport: 'VOLEI_PRAIA', tournamentId: 't1', tournamentName: 'Copa Goiás', at: day(-1) };
    const [s] = buildSuggestions({ ...EMPTY, stages: [stage] }, NOW);
    expect(s).toEqual(
      jasmine.objectContaining({
        kicker: 'RANKING · ATUALIZADO ONTEM',
        title: 'Quem subiu no ranking de Vôlei de praia com a etapa Copa Goiás',
      }),
    );
    expect(s!.prefill!.block).toEqual({ type: 'ranking', sport: 'beachVolleyball' });
    const covered = post('r', { updatedAt: NOW, body: [{ type: 'ranking', sport: 'beachVolleyball', mode: 'athletes', gender: 'all' }] });
    expect(buildSuggestions({ ...EMPTY, posts: [covered], stages: [stage] }, NOW)).toEqual([]);
    expect(buildSuggestions({ ...EMPTY, stages: [{ ...stage, sport: 'xadrez' }] }, NOW)).toEqual([]);
  });

  it('loja: só produto com selo "nova" ainda valendo e sem post', () => {
    const out = buildSuggestions(
      {
        ...EMPTY,
        posts: [post('p', { body: [{ type: 'product', productId: 'citado' }] })],
        products: [
          { id: 'toalha', name: 'Toalha nexaGO', newUntil: day(20) },
          { id: 'citado', name: 'Boné', newUntil: day(20) },
          { id: 'velho', name: 'Viseira', newUntil: day(-1) },
        ],
      },
      NOW,
    );
    expect(out.map((s) => [s.kicker, s.title])).toEqual([['LOJA · LANÇAMENTO', 'Toalha nexaGO chegou à loja e ainda não tem post']]);
    expect(out[0]!.prefill).toEqual({ category: 'loja', sport: 'all', title: 'Chegou: Toalha nexaGO', block: { type: 'product', id: 'toalha' } });
  });

  it('agendado no app sem push: abre o post, não cria rascunho', () => {
    const out = buildSuggestions(
      {
        ...EMPTY,
        posts: [
          post('ag', { title: 'Chegou a Toalha', status: 'scheduled', publishAt: new Date('2026-11-12T12:00:00Z') }),
          post('com-push', { status: 'scheduled', publishAt: day(2), push: { enabled: true, city: null, sport: 'all' } }),
          post('so-site', { status: 'scheduled', publishAt: day(2), channels: { app: false, site: true } }),
        ],
      },
      NOW,
    );
    expect(out).toEqual([
      jasmine.objectContaining({
        kicker: 'AGENDADO · 12 NOV · 09:00',
        title: 'Chegou a Toalha: post agendado, falta o push',
        postId: 'ag',
        prefill: null,
      }),
    ]);
  });

  it('no máximo 4, mais urgentes primeiro e até 2 de cada tipo', () => {
    const out = buildSuggestions(
      {
        ...EMPTY,
        posts: [post('ag', { status: 'scheduled', publishAt: day(5) })],
        tournaments: [tournament('t1', { startAt: day(1) }), tournament('t2', { startAt: day(2) }), tournament('t3', { startAt: day(3) })],
        products: [{ id: 'p', name: 'Toalha', newUntil: day(25) }],
        stages: [{ sport: 'VOLEI_PRAIA', tournamentId: 'x', tournamentName: null, at: day(-1) }],
      },
      NOW,
    );
    expect(out.map((s) => s.key)).toEqual(['tournament:t1', 'tournament:t2', 'push:ag', 'ranking:beachVolleyball']);
  });

  it('rascunho por query param: ida e volta; valor estranho é ignorado', () => {
    const prefill = { category: 'torneios' as const, sport: 'beachVolleyball', title: 'Quem subiu', block: { type: 'ranking' as const, sport: 'beachVolleyball' } };
    const params = prefillParams(prefill);
    expect(params).toEqual({ categoria: 'torneios', esporte: 'beachVolleyball', titulo: 'Quem subiu', ranking: 'beachVolleyball' });
    expect(prefillFromParams((k) => params[k] ?? null)).toEqual(prefill);
    expect(prefillFromParams(() => null)).toBeNull();
    const odd: Record<string, string> = { categoria: 'x', esporte: 'xadrez', titulo: '  Oi  ', torneio: 'id com espaço' };
    expect(prefillFromParams((k) => odd[k] ?? null)).toEqual({ category: 'torneios', sport: 'all', title: 'Oi', block: null });
  });
});
