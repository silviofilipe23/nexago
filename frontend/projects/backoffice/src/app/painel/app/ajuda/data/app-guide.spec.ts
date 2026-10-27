import {
  appGuideFromDoc,
  appGuideFromMirror,
  categoriesFromDrafts,
  draftsFromCategories,
  saveIssues,
  topicCountText,
  topicIssue,
  topicWarning,
  withIds,
  type AppGuideCategory,
  type AppGuideTopic,
} from './app-guide';

function topic(over: Partial<AppGuideTopic> = {}): AppGuideTopic {
  return {
    id: 'guia-reservar-quadra',
    title: 'Reservar uma quadra',
    summary: 'Ache a arena no mapa e garanta sua quadra.',
    description: '',
    steps: [],
    where: 'Aba Reservar',
    ctaLabel: 'Abrir mapa',
    destination: 'reservar',
    url: null,
    imageUrl: null,
    icon: 'map',
    published: true,
    ...over,
  };
}

function category(over: Partial<AppGuideCategory> = {}): AppGuideCategory {
  return { id: 'reservar', title: 'Reservar', topics: [topic()], ...over };
}

/** O que `seed-app-guide.js` grava em `appConfig/appGuide` (resumido). */
const SEED_MIRROR = {
  categories: [
    {
      id: 'reservar',
      title: 'Reservar',
      topics: [
        {
          id: 'guia-reservar-quadra',
          icon: 'map',
          title: 'Reservar uma quadra',
          summary: 'Ache a arena no mapa, escolha o horário e garanta sua quadra.',
          description: 'A aba Reservar mostra as arenas num mapa com lista.',
          steps: ['Na aba "Reservar", toque na data', 'Toque em "Continuar"'],
          where: 'Aba Reservar › arena › Reservar',
          ctaLabel: 'Abrir mapa',
          destination: 'reservar',
          imageUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/app%2Fnews%2Fa.webp?alt=media',
        },
        {
          id: 'guia-cancelar-reserva',
          icon: 'cancel',
          title: 'Cancelar uma reserva',
          summary: 'Não vai poder ir? Libere o horário pela Agenda.',
          description: 'Cancele pelo detalhe da reserva.',
          steps: ['Na aba "Agenda", toque no card', 'Em "Ações", toque em "Cancelar reserva"'],
          where: 'Agenda › sua reserva › Ações',
        },
      ],
    },
    { id: 'mais', title: 'Loja e indicação', topics: [{ id: 'guia-loja', title: 'Loja nexaGO', destination: 'loja', ctaLabel: 'Abrir a Loja' }] },
  ],
  updatedAt: { seconds: 1 },
};

describe('app-guide data', () => {
  it('importa o espelho do seed: tudo publicado, sem destino = sem botão, os 8 ícones', () => {
    const list = appGuideFromMirror(SEED_MIRROR);
    expect(list.map((c) => [c.id, c.title, c.topics.length])).toEqual([
      ['reservar', 'Reservar', 2],
      ['mais', 'Loja e indicação', 1],
    ]);
    const [reservar, cancelar] = list[0]!.topics;
    expect(reservar).toEqual(
      jasmine.objectContaining({ id: 'guia-reservar-quadra', icon: 'map', destination: 'reservar', ctaLabel: 'Abrir mapa', published: true }),
    );
    expect(reservar!.imageUrl).toContain('https://');
    expect(cancelar).toEqual(jasmine.objectContaining({ icon: 'cancel', destination: null, ctaLabel: '', url: null, published: true }));
    expect(list[1]!.topics[0]).toEqual(jasmine.objectContaining({ summary: '', steps: [], where: '' }));
  });

  it('lê a fonte com rascunho e versão; doc ausente = vazio e versão 0', () => {
    const doc = { version: 4, categories: [{ ...SEED_MIRROR.categories[0], topics: [{ ...SEED_MIRROR.categories[0]!.topics[0], published: false }] }] };
    const state = appGuideFromDoc(doc);
    expect(state.version).toBe(4);
    expect(state.categories[0]!.topics[0]!.published).toBeFalse();
    expect(appGuideFromDoc(undefined)).toEqual({ categories: [], version: 0 });
  });

  it('descarta categoria e guia sem id, destino e ícone desconhecidos, e corta em 6 passos', () => {
    const list = appGuideFromMirror({
      categories: [
        { title: 'Sem id', topics: [] },
        {
          id: 'x',
          title: 'X',
          topics: [{ title: 'sem id' }, { id: 'a', title: 'A', destination: 'radar', icon: 'rocket', steps: ['1', '2', '3', '4', '5', '6', '7'] }],
        },
      ],
    });
    expect(list.length).toBe(1);
    expect(list[0]!.topics).toEqual([jasmine.objectContaining({ id: 'a', destination: null, icon: null, steps: ['1', '2', '3', '4', '5', '6'] })]);
  });

  it('rascunho de tela vai e volta sem as chaves locais', () => {
    const list = [category(), category({ id: 'jogar', title: 'Jogar', topics: [] })];
    const drafts = draftsFromCategories(list);
    expect(drafts[0]!.key).not.toBe(drafts[1]!.key);
    expect(categoriesFromDrafts(drafts)).toEqual(list);
  });

  it('o que falta: título e botão ao publicar, tetos sempre; rascunho só os tetos', () => {
    expect(topicIssue(topic({ title: '' }), true)).toBe('Falta o título.');
    expect(topicIssue(topic({ title: '' }), false)).toBeNull();
    expect(topicIssue(topic({ ctaLabel: '' }), true)).toBe('Falta o texto do botão.');
    expect(topicIssue(topic({ destination: null, ctaLabel: '' }), true)).toBeNull();
    expect(topicIssue(topic({ title: 'x'.repeat(33) }), false)).toBe('Título passa de 32 caracteres.');
    expect(topicIssue(topic({ steps: ['p'.repeat(141)] }), false)).toBe('Passo passa de 140 caracteres.');
    expect(topicIssue(topic({ destination: 'url', url: null }), true)).toBe('O link externo precisa começar com https://.');
    expect(topicIssue(topic({ destination: 'url', url: null }), false)).toBeNull();
    expect(topicIssue(topic({ destination: 'url', url: 'https://nexago.app/ajuda' }), true)).toBeNull();
    expect(topicWarning(topic({ summary: '' }))).toContain('Sem resumo');
  });

  it('não salva com categoria sem nome nem guia publicado incompleto; rascunho incompleto passa', () => {
    expect(saveIssues([category()])).toEqual([]);
    expect(saveIssues([category({ title: ' ' })])).toEqual(['Categoria 1: Falta o nome da categoria.']);
    expect(saveIssues([category({ topics: [topic({ title: '' }), topic({ id: 'b', ctaLabel: '' })] })])).toEqual([
      'Reservar: 2 guias incompletos.',
    ]);
    expect(saveIssues([category({ topics: [topic({ title: '', published: false })] })])).toEqual([]);
  });

  it('id novo vem do nome sem repetir; guia ganha o prefixo guia-; o que já tem id fica', () => {
    const out = withIds([
      category(),
      category({ id: '', title: 'Reservar', topics: [topic({ id: '', title: 'Reservar uma quadra' })] }),
      category({ id: '', title: 'Ligas & Torneios', topics: [topic({ id: '', title: '' })] }),
    ]);
    expect(out.map((c) => c.id)).toEqual(['reservar', 'reservar-2', 'ligas-torneios']);
    expect(out[1]!.topics[0]!.id).toBe('guia-reservar-uma-quadra');
    expect(out[2]!.topics[0]!.id).toBe('guia');
    expect(out[0]!.topics[0]!.id).toBe('guia-reservar-quadra');
  });

  it('contagem da categoria na lista', () => {
    expect(topicCountText(category({ topics: [] }))).toBe('Sem guias');
    expect(topicCountText(category())).toBe('1 guia');
    expect(topicCountText(category({ topics: [topic(), topic({ published: false }), topic({ published: false })] }))).toBe(
      '3 guias · 2 rascunhos',
    );
  });
});
