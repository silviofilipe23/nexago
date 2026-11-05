import {
  draftFromPost,
  embedBlock,
  embedCount,
  emptyBlock,
  isBlankBlock,
  moveBlock,
  newBlogDraft,
  payloadFromDraft,
  payloadIssues,
  saveLabel,
  withSlug,
  withTag,
  withTitle,
  type BlogDraft,
} from './blog-form';
import type { BlogPost } from './blog-post';

const NOW = new Date('2026-11-05T15:00:00Z');

function filled(over: Partial<BlogDraft> = {}): BlogDraft {
  const d = withTitle(newBlogDraft('Ana Souza'), 'Chegou a Toalha nexaGO');
  return { ...d, body: [{ ...emptyBlock('paragraph'), text: 'Quem joga na areia sabe.' } as BlogDraft['body'][number]], ...over };
}

describe('blog · formulário', () => {
  it('post novo: padrões e autor de quem está logado', () => {
    const d = newBlogDraft('Ana Souza');
    expect(d.status).toBe('draft');
    expect(d.authorName).toBe('Ana Souza');
    expect(d.authorRole).toBe('Equipe nexaGO');
    expect(d.app && d.site).toBeTrue();
    expect(d.body.length).toBe(1);
  });

  it('endereço acompanha o título até o usuário editar; digitado vira slug válido', () => {
    let d = withTitle(newBlogDraft(''), 'Ação no Clube');
    expect(d.slug).toBe('acao-no-clube');
    d = withSlug(d, 'Meu Endereço Novo');
    expect(d.slug).toBe('meu-endereco-novo');
    expect(d.slugTouched).toBeTrue();
    d = withTitle(d, 'Outro título');
    expect(d.slug).toBe('meu-endereco-novo');
    // Apagar tudo devolve ao automático.
    d = withSlug(d, '');
    expect(d.slugTouched).toBeFalse();
    expect(d.slug).toBe('outro-titulo');
  });

  it('post publicado fica com o endereço preso; rascunho com endereço do título continua acompanhando', () => {
    const base = { title: 'Título A', slug: 'titulo-a', body: [], tags: [], cta: null } as unknown as BlogPost;
    const post = (over: Partial<BlogPost>): BlogPost => ({
      ...base,
      id: 'p',
      subtitle: '',
      seoDescription: '',
      coverUrl: null,
      category: 'treino',
      sport: 'all',
      author: { name: 'Ana', role: '' },
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
      version: 3,
      ...over,
    });
    expect(draftFromPost(post({ status: 'draft' })).slugTouched).toBeFalse();
    expect(draftFromPost(post({ status: 'published' })).slugTouched).toBeTrue();
    expect(draftFromPost(post({ status: 'draft', slug: 'outro' })).slugTouched).toBeTrue();
    const scheduled = draftFromPost(post({ status: 'scheduled', publishAt: new Date('2026-11-12T12:00:00Z') }));
    expect([scheduled.date, scheduled.time]).toEqual(['2026-11-12', '09:00']);
  });

  it('tags: minúsculas, sem repetir, até 8', () => {
    let d = newBlogDraft('');
    d = withTag(d, ' Lançamento ');
    d = withTag(d, 'lançamento');
    d = withTag(d, '#Toalha');
    expect(d.tags).toEqual(['lançamento', 'toalha']);
    for (let i = 0; i < 10; i += 1) {
      d = withTag(d, `t${i}`);
    }
    expect(d.tags.length).toBe(8);
  });

  it('mover bloco troca com o vizinho e não sai das pontas', () => {
    const blocks = [emptyBlock('paragraph'), emptyBlock('heading'), emptyBlock('list')];
    expect(moveBlock(blocks, 0, 1).map((b) => b.type)).toEqual(['heading', 'paragraph', 'list']);
    expect(moveBlock(blocks, 0, -1).map((b) => b.type)).toEqual(['paragraph', 'heading', 'list']);
    expect(moveBlock(blocks, 2, 1).map((b) => b.type)).toEqual(['paragraph', 'heading', 'list']);
  });

  it('monta o post da callable: sem chaves, sem blocos vazios, chamada e data conforme o status', () => {
    const d = filled({
      body: [
        { ...emptyBlock('heading'), text: '  Como personalizar ' } as BlogDraft['body'][number],
        emptyBlock('paragraph'),
        { ...emptyBlock('list'), items: ['um', '  ', 'dois'] } as BlogDraft['body'][number],
        emptyBlock('image'),
      ],
      tags: ['Loja', 'loja'],
      ctaEnabled: true,
      ctaLabel: ' Personalizar ',
      ctaDestination: 'loja',
      ctaUrl: 'https://ignorado',
      status: 'scheduled',
      date: '2026-11-12',
      time: '09:00',
    });
    const p = payloadFromDraft(d);
    expect(p.slug).toBe('chegou-a-toalha-nexago');
    expect(p.body).toEqual([
      { type: 'heading', text: 'Como personalizar' },
      { type: 'list', items: ['um', 'dois'] },
    ]);
    expect(p.tags).toEqual(['loja']);
    expect(p.cta).toEqual({ label: 'Personalizar', destination: 'loja', url: null });
    expect(p.publishAt).toBe('2026-11-12T12:00:00.000Z');
    expect(payloadFromDraft({ ...d, status: 'published' }).publishAt).toBeNull();
    expect(payloadFromDraft({ ...d, status: 'draft', date: '' }).publishAt).toBeNull();
    expect(payloadFromDraft({ ...d, ctaEnabled: false }).cta).toBeNull();
    expect(isBlankBlock({ type: 'image', url: '', caption: 'só legenda' })).toBeTrue();
  });

  it('valida como o servidor: rascunho completo passa; faltas viram mensagens', () => {
    expect(payloadIssues(payloadFromDraft(filled()), NOW)).toEqual([]);
    const empty = payloadFromDraft({ ...newBlogDraft(''), authorName: '' });
    expect(payloadIssues(empty, NOW)).toEqual([
      'Dê um título ao post.',
      'Endereço inválido: use letras minúsculas, números e hífen.',
      'Informe o autor.',
      'Escreva o corpo do post.',
    ]);
  });

  it('agendamento exige data futura e um canal; chamada para link exige https', () => {
    const past = payloadFromDraft(filled({ status: 'scheduled', date: '2026-11-01', time: '09:00' }));
    expect(payloadIssues(past, NOW)).toEqual(['A data do agendamento já passou.']);
    const noDate = payloadFromDraft(filled({ status: 'scheduled', date: '' }));
    expect(payloadIssues(noDate, NOW)).toEqual(['Escolha data e hora para agendar.']);
    const noChannel = payloadFromDraft(filled({ status: 'published', app: false, site: false }));
    expect(payloadIssues(noChannel, NOW)).toEqual(['Escolha onde o post aparece: app, site ou os dois.']);
    const link = payloadFromDraft(filled({ ctaEnabled: true, ctaLabel: 'Abrir', ctaDestination: 'url', ctaUrl: 'http://x.com' }));
    expect(payloadIssues(link, NOW)).toEqual(['Chamada para link precisa de endereço https.']);
    const noLabel = payloadFromDraft(filled({ ctaEnabled: true, ctaLabel: ' ', ctaDestination: 'loja' }));
    expect(payloadIssues(noLabel, NOW)).toEqual(['Chamada sem texto.']);
    const badSport = payloadFromDraft(filled({ sport: 'xadrez' }));
    expect(payloadIssues(badSport, NOW)).toEqual(['Esporte desconhecido.']);
    expect(payloadIssues(payloadFromDraft(filled({ sport: 'beachTennis' })), NOW)).toEqual([]);
  });

  it('rótulo do botão segue o destino e o que já está gravado', () => {
    expect(saveLabel('draft', null)).toBe('Salvar rascunho');
    expect(saveLabel('review', 'draft')).toBe('Enviar para revisão');
    expect(saveLabel('review', 'review')).toBe('Salvar');
    expect(saveLabel('scheduled', 'draft')).toBe('Agendar');
    expect(saveLabel('scheduled', 'scheduled')).toBe('Salvar agendamento');
    expect(saveLabel('published', 'scheduled')).toBe('Publicar agora');
    expect(saveLabel('published', 'published')).toBe('Salvar alterações');
  });

  it('push vai no post: cidade vazia = todas; já enviado com app desligado não trava o save', () => {
    const d = filled({ pushEnabled: true, pushCity: '  Goiânia ', pushSport: 'beachTennis' });
    expect(payloadFromDraft(d).push).toEqual({ enabled: true, city: 'Goiânia', sport: 'beachTennis' });
    expect(payloadFromDraft(filled({ pushEnabled: true })).push).toEqual({ enabled: true, city: null, sport: 'all' });
    expect(payloadFromDraft(filled()).push).toEqual({ enabled: false, city: null, sport: 'all' });
    expect(payloadFromDraft(filled({ pushEnabled: true, pushSent: true, app: false })).push.enabled).toBeFalse();
  });

  it('push ligado exige o blog no app; esporte do push precisa existir', () => {
    expect(payloadIssues(payloadFromDraft(filled({ pushEnabled: true, app: false })), NOW)).toEqual([
      'A notificação abre o post no app: ligue "Blog no app".',
    ]);
    expect(payloadIssues(payloadFromDraft(filled({ pushEnabled: true, pushSport: 'xadrez' })), NOW)).toEqual([
      'Esporte da notificação desconhecido.',
    ]);
  });

  it('blocos nexaGO: vídeo só YouTube/Instagram; torneio/produto sem escolha somem; até 10', () => {
    const video = (url: string) => ({ ...emptyBlock('video'), url } as BlogDraft['body'][number]);
    const p = payloadFromDraft(
      filled({ body: [embedBlock('tournament', 't1'), emptyBlock('product'), video('https://youtu.be/abcdefghijk'), emptyBlock('video')] }),
    );
    expect(p.body).toEqual([
      { type: 'tournament', tournamentId: 't1' },
      { type: 'video', url: 'https://youtu.be/abcdefghijk', caption: '' },
    ]);
    expect(payloadIssues(p, NOW)).toEqual([]);
    expect(payloadIssues(payloadFromDraft(filled({ body: [video('https://vimeo.com/1')] })), NOW)).toEqual([
      'Bloco 1: vídeo precisa ser um link do YouTube ou do Instagram.',
    ]);
    const eleven = Array.from({ length: 11 }, (_, i) => embedBlock(i % 2 ? 'product' : 'tournament', `id${i}`));
    expect(embedCount(payloadFromDraft(filled({ body: eleven })).body)).toBe(11);
    expect(payloadIssues(payloadFromDraft(filled({ body: eleven })), NOW)).toEqual(['Até 10 blocos de torneio e produto por post.']);
  });

  it('post com push enviado abre só de leitura', () => {
    const base = draftFromPost({
      id: 'p',
      title: 'T',
      subtitle: '',
      slug: 't',
      seoDescription: '',
      coverUrl: null,
      category: 'treino',
      sport: 'all',
      tags: [],
      author: { name: 'Ana', role: '' },
      body: [],
      cta: null,
      channels: { app: true, site: true },
      featured: false,
      push: { enabled: true, city: 'Goiânia', sport: 'all' },
      pushSentAt: new Date('2026-11-01T12:00:00Z'),
      pushResult: { state: 'sent', recipients: 10, sent: 9 },
      status: 'published',
      publishAt: null,
      readMinutes: 1,
      readCount: 0,
      helpfulCount: 0,
      updatedAt: null,
      version: 1,
    });
    expect([base.pushEnabled, base.pushCity, base.pushSent]).toEqual([true, 'Goiânia', true]);
  });
});
