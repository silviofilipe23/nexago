import {
  appNewsFromDoc,
  appNewsFromMirror,
  draftFromRelease,
  featureIssue,
  featureWarning,
  newReleaseDraft,
  releaseFromDraft,
  releaseIssues,
  releaseStatus,
  shortDate,
  withFeatureIds,
  type AppNewsFeature,
  type AppNewsRelease,
} from './app-news';
import { newsArtSizeCheck } from './app-news-image';

function feature(over: Partial<AppNewsFeature> = {}): AppNewsFeature {
  return {
    id: 'mapa-reservar',
    title: 'Arenas no mapa',
    summary: 'Ache quadra perto de você.',
    description: '',
    steps: [],
    where: 'Aba Reservar',
    ctaLabel: 'Abrir mapa',
    destination: 'reservar',
    url: null,
    imageUrl: null,
    icon: 'map',
    stories: true,
    ...over,
  };
}

function release(over: Partial<AppNewsRelease> = {}): AppNewsRelease {
  return {
    version: '1.0.15',
    build: 113,
    date: '2026-10-27',
    stories: true,
    features: [feature()],
    improvements: [],
    published: true,
    ...over,
  };
}

/** O que `seed-app-news.js` grava em `appConfig/appNews` (resumido). */
const SEED_MIRROR = {
  releases: [
    {
      version: '1.0.14',
      build: 112,
      date: '2026-10-05',
      stories: false,
      features: [{ id: 'convite-dupla', title: 'Convite de dupla' }],
      improvements: [],
    },
    {
      version: '1.0.15',
      build: 113,
      date: '2026-10-27',
      stories: true,
      features: [
        {
          id: 'mapa-reservar',
          icon: 'map',
          title: 'Arenas no mapa',
          summary: 'Ache quadra perto de você.',
          description: 'A aba Reservar abre num mapa.',
          steps: ['Abra a aba Reservar', 'Filtre', 'Reserve'],
          where: 'Aba Reservar',
          ctaLabel: 'Abrir mapa',
          destination: 'reservar',
        },
      ],
      improvements: ['Agenda mostra clima previsto do jogo'],
    },
  ],
};

describe('appNewsFromMirror / appNewsFromDoc', () => {
  it('importa o seed do espelho como publicado, da mais nova para a mais antiga', () => {
    const list = appNewsFromMirror(SEED_MIRROR);
    expect(list.map((r) => r.version)).toEqual(['1.0.15', '1.0.14']);
    expect(list.every((r) => r.published)).toBeTrue();
    expect(list[0]!.features[0]).toEqual(
      jasmine.objectContaining({ icon: 'map', destination: 'reservar', stories: true, url: null, imageUrl: null }),
    );
    // Só título, sem botão: destino ausente vira "só informativa".
    expect(list[1]!.features[0]).toEqual(jasmine.objectContaining({ destination: null, ctaLabel: '', steps: [] }));
  });

  it('a fonte guarda rascunho e versão; doc ausente = nada, versão 0', () => {
    const state = appNewsFromDoc({ ...SEED_MIRROR, releases: [{ ...SEED_MIRROR.releases[1], published: false, date: null }], version: 4 });
    expect(state.version).toBe(4);
    expect(state.releases[0]).toEqual(jasmine.objectContaining({ published: false, date: null }));
    expect(appNewsFromDoc(undefined)).toEqual({ releases: [], version: 0 });
  });

  it('descarta versão sem número ou build e funcionalidade sem id; chave desconhecida vira null', () => {
    const list = appNewsFromMirror({
      releases: [
        { version: '', build: 1 },
        { version: '1.0.1', build: 'x' },
        { version: '1.0.2', build: 2, date: '2026-01-01', features: [{ title: 'Sem id' }, { id: 'a', title: 'A', destination: 'radar', icon: 'star' }] },
      ],
    });
    expect(list.length).toBe(1);
    expect(list[0]!.features.length).toBe(1);
    expect(list[0]!.features[0]).toEqual(jasmine.objectContaining({ destination: null, icon: null }));
  });
});

describe('draft', () => {
  it('ida e volta preserva o conteúdo e tira as chaves locais', () => {
    const r = release({ improvements: ['Agenda'] });
    const draft = draftFromRelease(r);
    expect(draft.key).toBeTruthy();
    expect(draft.features[0]!.key).toBeTruthy();
    expect(releaseFromDraft(draft)).toEqual(r);
  });

  it('nova versão sugere a seguinte à de maior build, rascunho e sem data', () => {
    const d = newReleaseDraft([release({ version: '1.0.14', build: 112 }), release()]);
    expect([d.version, d.build, d.date, d.published, d.features.length]).toEqual(['1.0.16', 114, null, false, 0]);
    expect(newReleaseDraft([])).toEqual(jasmine.objectContaining({ version: '', build: 0 }));
  });
});

describe('releaseStatus', () => {
  it('rascunho, agendada (data futura) e publicada', () => {
    expect(releaseStatus({ published: false, date: '2026-10-01' }, '2026-10-27')).toBe('rascunho');
    expect(releaseStatus({ published: true, date: '2026-11-10' }, '2026-10-27')).toBe('agendada');
    expect(releaseStatus({ published: true, date: '2026-10-27' }, '2026-10-27')).toBe('publicada');
    expect(releaseStatus({ published: true, date: null }, '2026-10-27')).toBe('publicada');
  });
});

describe('featureIssue', () => {
  it('publicada exige título, botão quando há destino e link https; rascunho só os tetos', () => {
    expect(featureIssue(feature({ title: '' }), true)).toBe('Falta o título.');
    expect(featureIssue(feature({ ctaLabel: '' }), true)).toBe('Falta o texto do botão.');
    expect(featureIssue(feature({ destination: 'url', url: null }), true)).toContain('https://');
    expect(featureIssue(feature({ destination: 'url', url: 'http://x.com' }), false)).toContain('https://');
    expect(featureIssue(feature({ title: '', ctaLabel: '', destination: 'url', url: null }), false)).toBeNull();
    expect(featureIssue(feature({ title: 'x'.repeat(23) }), false)).toContain('22');
    expect(featureIssue(feature({ destination: null, ctaLabel: '' }), true)).toBeNull();
  });

  it('sem resumo avisa, não barra', () => {
    expect(featureWarning(feature({ summary: '' }))).toContain('só o título');
    expect(featureWarning(feature())).toBeNull();
  });
});

describe('releaseIssues', () => {
  it('número e build únicos e no formato; publicar exige funcionalidade completa', () => {
    const others = [release()];
    expect(releaseIssues(release({ version: '1.0.15', build: 114, features: [] }), others, false)).toEqual([
      'Já existe a versão 1.0.15.',
    ]);
    expect(releaseIssues(release({ version: '1.0.16', build: 113 }), others, true)).toEqual([
      'O build 113 já é de outra versão.',
    ]);
    expect(releaseIssues(release({ version: 'v2', build: 0, features: [] }), [], true)).toEqual([
      'Número da versão no formato 1.0.15.',
      'Informe o build da loja (o +N do pubspec).',
      'Adicione pelo menos uma funcionalidade.',
    ]);
    expect(releaseIssues(release({ features: [feature({ title: '' }), feature({ ctaLabel: '' })] }), [], true)).toEqual([
      '2 funcionalidades incompletas.',
    ]);
    expect(releaseIssues(release({ features: [feature({ title: '' })] }), [], false)).toEqual([]);
  });
});

describe('withFeatureIds', () => {
  it('dá id do título só a quem não tem, sem repetir entre versões', () => {
    const out = withFeatureIds([
      release({ features: [feature({ id: '', title: 'Bora Jogar' }), feature({ id: 'mapa-reservar' })] }),
      release({ version: '1.0.14', build: 112, features: [feature({ id: 'bora-jogar' }), feature({ id: '', title: '' })] }),
    ]);
    expect(out[0]!.features.map((f) => f.id)).toEqual(['bora-jogar-2', 'mapa-reservar']);
    expect(out[1]!.features.map((f) => f.id)).toEqual(['bora-jogar', 'novidade']);
  });
});

describe('formatos e imagem', () => {
  it('data curta como o app', () => {
    expect(shortDate('2026-10-27')).toBe('27 out 2026');
  });

  it('imagem pequena barra; proporção longe só avisa', () => {
    expect(newsArtSizeCheck({ width: 600, height: 600 }).error).toContain('mínimo');
    expect(newsArtSizeCheck({ width: 1170, height: 2000 }).warning).toContain('corta');
    expect(newsArtSizeCheck({ width: 1170, height: 1140 })).toEqual({ error: null, warning: null });
  });
});
