import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/blog/domain/blog_library.dart';
import 'package:nexago_app/features/blog/domain/blog_logic.dart';
import 'package:nexago_app/features/blog/domain/blog_notify_prefs.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner.dart';

BlogPost _post(
  String id, {
  String categoryKey = 'treino',
  bool featured = false,
  DateTime? at,
  String title = 'Post',
  String subtitle = '',
  List<String> tags = const [],
  int minutes = 4,
}) => BlogPost(
  id: id,
  title: title,
  subtitle: subtitle,
  categoryKey: categoryKey,
  featured: featured,
  publishAt: at,
  tags: tags,
  readMinutes: minutes,
);

void main() {
  group('BlogPost.fromMap', () {
    test('lê os campos e ignora bloco de tipo desconhecido', () {
      final post = BlogPost.fromMap('p1', {
        'title': '  Liga nexaGO  ',
        'subtitle': 'Tudo sobre a etapa',
        'slug': 'liga-nexago',
        'coverUrl': 'https://img/capa.jpg',
        'category': 'torneios',
        'sport': 'beachVolleyball',
        'tags': ['liga', '', 3],
        'author': {'name': 'Marcelo R.', 'role': 'Organização'},
        'body': [
          {'type': 'paragraph', 'text': 'Olá'},
          {'type': 'poll', 'question': 'x'},
          {'type': 'heading', 'text': 'O que muda'},
          {
            'type': 'list',
            'items': ['um', ' ', 'dois'],
          },
          {'type': 'quote', 'text': 'Inscreva a dupla'},
          {'type': 'image', 'url': 'http://inseguro', 'caption': 'x'},
          {'type': 'image', 'url': 'https://img/1.jpg', 'caption': 'Quadra'},
          {'type': 'paragraph', 'text': '   '},
          'lixo',
        ],
        'cta': {'label': 'Inscrever', 'destination': 'torneios', 'url': null},
        'featured': true,
        'publishAt': Timestamp.fromDate(DateTime(2026, 10, 28, 9)),
        'readMinutes': 4,
        'helpfulCount': 214,
        'readCount': 900,
      })!;

      expect(post.title, 'Liga nexaGO');
      expect(post.categoryKey, 'torneios');
      expect(post.tags, ['liga']);
      expect(post.authorName, 'Marcelo R.');
      expect(post.body.map((b) => b.runtimeType), [
        BlogParagraph,
        BlogHeading,
        BlogList,
        BlogQuote,
        BlogImage,
      ]);
      expect((post.body[2] as BlogList).items, ['um', 'dois']);
      expect(post.cta!.destination, HomeBannerDestination.torneios);
      expect(post.cta!.url, isNull);
      expect(post.featured, isTrue);
      expect(post.publishAt, DateTime(2026, 10, 28, 9));
      expect(post.helpfulCount, 214);
    });

    test('sem título fica de fora', () {
      expect(BlogPost.fromMap('p1', {'title': ' '}), isNull);
      expect(BlogPost.fromMap('p1', null), isNull);
    });

    test('categoria desconhecida vira "Blog"; capa não https some', () {
      final post = BlogPost.fromMap('p1', {
        'title': 'Novo',
        'category': 'podcast',
        'coverUrl': 'http://x',
        'readMinutes': 0,
      })!;
      // O id fica no post; a lista efetiva não o conhece = "Blog".
      expect(post.categoryKey, 'podcast');
      expect(BlogTaxonomy.defaults.of(post.categoryKey), isNull);
      expect(BlogTaxonomy.defaults.labelOf(post.categoryKey), 'Blog');
      expect(post.coverUrl, isNull);
      expect(post.readMinutes, 1);
    });

    test('chamada com destino desconhecido ou link não https some', () {
      expect(
        BlogCta.fromMap({'label': 'Ir', 'destination': 'tela-nova'}),
        isNull,
      );
      expect(
        BlogCta.fromMap({
          'label': 'Ir',
          'destination': 'url',
          'url': 'http://x',
        }),
        isNull,
      );
      final cta = BlogCta.fromMap({
        'label': 'Ver',
        'destination': 'url',
        'url': 'https://nexago.com.br',
      })!;
      expect(cta.url, 'https://nexago.com.br');
    });
  });

  group('BlogLibraryEntry', () {
    final now = DateTime(2026, 11, 5, 10);

    test('pela metade e lidos', () {
      final reading = BlogLibraryEntry(
        postId: 'a',
        progress: 0.6,
        readStartedAt: now,
      );
      expect(reading.isInProgress, isTrue);
      expect(reading.isFinished, isFalse);

      const opened = BlogLibraryEntry(postId: 'b');
      expect(opened.withOpened(now).isInProgress, isFalse); // progresso 0

      final done = reading.withProgress(0.96, now);
      expect(done.isFinished, isTrue);
      expect(done.isInProgress, isFalse);
    });

    test('progresso só aumenta e o início não muda', () {
      final start = DateTime(2026, 11, 1);
      final entry = BlogLibraryEntry(
        postId: 'a',
        progress: 0.5,
        readStartedAt: start,
      );
      final back = entry.withProgress(0.2, now);
      expect(back.progress, 0.5);
      expect(back.readStartedAt, start);
      expect(entry.withProgress(0.7, now).progress, 0.7);
    });

    test('grava o doc inteiro, com null onde não há valor', () {
      final map = const BlogLibraryEntry(postId: 'a').toWriteMap();
      expect(map.keys.toSet(), {
        'saved',
        'savedAt',
        'progress',
        'readStartedAt',
        'finishedAt',
      });
      expect(map['savedAt'], isNull);

      final saved = const BlogLibraryEntry(postId: 'a').withSaved(true, now);
      expect(saved.toWriteMap()['savedAt'], now);
      expect(saved.withSaved(false, now).toWriteMap()['savedAt'], isNull);
    });

    test('fromMap tolera tipos errados', () {
      final e = BlogLibraryEntry.fromMap('a', {
        'saved': 'sim',
        'progress': 3,
        'readStartedAt': Timestamp.fromDate(now),
      });
      expect(e.saved, isFalse);
      expect(e.progress, 1);
      expect(e.readStartedAt, now);
    });
  });

  group('feed', () {
    test('destaque: o featured mais recente; sem featured, o mais recente', () {
      final posts = [
        _post('a', at: DateTime(2026, 11, 3)),
        _post('b', featured: true, at: DateTime(2026, 11, 2)),
        _post('c', featured: true, at: DateTime(2026, 11, 1)),
      ];
      expect(blogFeaturedPost(posts)!.id, 'b');
      expect(blogFeaturedPost([posts.first])!.id, 'a');
      expect(blogFeaturedPost(const []), isNull);
    });

    test('chips só das categorias ATIVAS com post, na ordem da lista', () {
      final posts = [
        _post('a', categoryKey: 'loja'),
        _post('b', categoryKey: 'torneios'),
        _post('c', categoryKey: 'podcast'), // desconhecida
        _post('d', categoryKey: 'regras'),
        _post('e', categoryKey: 'saude'),
      ];
      final taxonomy = BlogTaxonomy.merge({
        'regras': {'active': false},
        'saude': {
          'label': 'Saúde',
          'color': '#33CCAA',
          'colorLight': '#11664F',
          'order': 1,
          'active': true,
        },
      });
      expect(blogCategoriesWithPosts(posts, taxonomy).map((c) => c.key), [
        'torneios',
        'saude',
        'loja',
      ]);
    });

    test('busca sem acento em título, subtítulo e tags', () {
      final posts = [
        _post('a', title: 'Exercícios para o saque'),
        _post('b', title: 'Regras', subtitle: 'King of the Court explicado'),
        _post('c', title: 'Toalha', tags: ['loja', 'personalizados']),
      ];
      expect(searchBlogPosts(posts, 'exercicios').map((p) => p.id), ['a']);
      expect(searchBlogPosts(posts, 'king court').map((p) => p.id), ['b']);
      expect(searchBlogPosts(posts, 'PERSONALIZADOS').map((p) => p.id), ['c']);
      expect(searchBlogPosts(posts, '  ').length, 3);
      expect(searchBlogPosts(posts, 'nada disso'), isEmpty);
    });

    test('continue lendo: a leitura pela metade mexida por último', () {
      final posts = [_post('a'), _post('b'), _post('c')];
      final library = {
        'a': BlogLibraryEntry(
          postId: 'a',
          progress: 0.3,
          readStartedAt: DateTime(2026, 11, 1),
          updatedAt: DateTime(2026, 11, 1),
        ),
        'b': BlogLibraryEntry(
          postId: 'b',
          progress: 0.6,
          readStartedAt: DateTime(2026, 11, 2),
          updatedAt: DateTime(2026, 11, 4),
        ),
        'c': BlogLibraryEntry(
          postId: 'c',
          progress: 1,
          readStartedAt: DateTime(2026, 11, 2),
          finishedAt: DateTime(2026, 11, 5),
          updatedAt: DateTime(2026, 11, 5),
        ),
        // Post que não está no feed: não aparece.
        'z': BlogLibraryEntry(
          postId: 'z',
          progress: 0.5,
          readStartedAt: DateTime(2026, 11, 5),
          updatedAt: DateTime(2026, 11, 5),
        ),
      };
      expect(blogContinueReading(posts, library)!.post.id, 'b');
      expect(blogContinueReading(posts, const {}), isNull);
    });

    test('leia também: mesma categoria primeiro, completa com recentes', () {
      final post = _post('x', categoryKey: 'regras');
      final feed = [
        post,
        _post('t1', categoryKey: 'treino'),
        _post('r1', categoryKey: 'regras'),
        _post('t2', categoryKey: 'treino'),
      ];
      expect(blogRelatedPosts(post, feed).map((p) => p.id), ['r1', 't1']);
      expect(blogRelatedPosts(post, [post]), isEmpty);
    });
  });

  group('Salvos e lendo', () {
    test('separa pela metade, salvos e lidos; post sumido fica de fora', () {
      final posts = [_post('a'), _post('b'), _post('c')];
      final library = {
        'a': BlogLibraryEntry(
          postId: 'a',
          saved: true,
          savedAt: DateTime(2026, 11, 1),
          progress: 0.5,
          readStartedAt: DateTime(2026, 11, 1),
        ),
        'b': BlogLibraryEntry(
          postId: 'b',
          saved: true,
          savedAt: DateTime(2026, 11, 4),
        ),
        'c': BlogLibraryEntry(
          postId: 'c',
          progress: 1,
          readStartedAt: DateTime(2026, 11, 2),
          finishedAt: DateTime(2026, 11, 3),
        ),
        'gone': BlogLibraryEntry(
          postId: 'gone',
          saved: true,
          savedAt: DateTime(2026, 11, 5),
        ),
      };
      final view = buildBlogLibraryView(library, posts);
      expect(view.inProgress.map((i) => i.post.id), ['a']);
      expect(view.saved.map((i) => i.post.id), ['b', 'a']);
      expect(view.finished.map((i) => i.post.id), ['c']);
      expect(blogLibraryIdsKey(library), 'a,b,c,gone');
    });

    test('só abriu (progresso 0, sem salvar) não entra na busca', () {
      final library = {
        'a': BlogLibraryEntry(postId: 'a', readStartedAt: DateTime(2026)),
      };
      expect(blogLibraryIdsKey(library), '');
    });

    test('minutos restantes: arredonda, mínimo 1', () {
      expect(blogRemainingMinutes(5, 0.6), 2);
      expect(blogRemainingMinutes(4, 0.5), 2);
      expect(blogRemainingMinutes(3, 0.95), 1);
      expect(blogRemainingMinutes(1, 0), 1);
      expect(blogRemainingMinutes(10, 0), 10);
    });

    test('salvo há: pelo dia do calendário', () {
      final now = DateTime(2026, 11, 5, 8);
      expect(blogSavedAgo(DateTime(2026, 11, 5, 0, 5), now), 'salvo hoje');
      expect(blogSavedAgo(DateTime(2026, 11, 4, 23, 50), now), 'salvo ontem');
      expect(blogSavedAgo(DateTime(2026, 11, 1), now), 'salvo há 4 dias');
      expect(blogSavedAgo(DateTime(2026, 10, 29), now), 'salvo há 1 semana');
      expect(blogSavedAgo(DateTime(2026, 10, 20), now), 'salvo há 2 semanas');
      expect(blogSavedAgo(DateTime(2026, 9, 20), now), 'salvo há 1 mês');
      expect(blogSavedAgo(null, now), 'salvo');
      expect(blogFinishedAgo(DateTime(2026, 11, 5), now), 'lido hoje');
    });
  });

  group('textos', () {
    test('iniciais do autor', () {
      expect(blogAuthorInitials('Marcelo R.'), 'MR');
      expect(blogAuthorInitials('Equipe nexaGO'), 'EN');
      expect(blogAuthorInitials('João'), 'J');
      expect(blogAuthorInitials(''), 'N');
    });

    test('data curta', () {
      final now = DateTime(2026, 11, 5);
      expect(blogShortDate(DateTime(2026, 10, 28), now), '28 out');
      expect(blogShortDate(DateTime(2025, 3, 2), now), '2 mar 2025');
    });

    test('linha de leitura', () {
      final post = BlogPost(
        id: 'a',
        title: 't',
        readMinutes: 4,
        authorName: 'Marcelo R.',
      );
      expect(blogReadLine(post), '4 min de leitura · Marcelo R.');
      expect(blogReadLine(post, long: false), '4 min · Marcelo R.');
    });

    test('Ajudou otimista até o gatilho atualizar', () {
      // Sem toque: vale o servidor.
      expect(
        blogOptimisticHelpfulCount(
          serverCount: 10,
          countAtToggle: null,
          pendingDelta: 0,
        ),
        10,
      );
      // Tocou: +1 enquanto o post não muda.
      expect(
        blogOptimisticHelpfulCount(
          serverCount: 10,
          countAtToggle: 10,
          pendingDelta: 1,
        ),
        11,
      );
      // Gatilho rodou: o servidor volta a valer.
      expect(
        blogOptimisticHelpfulCount(
          serverCount: 11,
          countAtToggle: 10,
          pendingDelta: 1,
        ),
        11,
      );
      expect(
        blogOptimisticHelpfulCount(
          serverCount: 0,
          countAtToggle: 0,
          pendingDelta: -1,
        ),
        0,
      );
    });
  });

  group('blocos nexaGO', () {
    test('torneio, produto e vídeo; inválidos ficam de fora', () {
      final post = BlogPost.fromMap('p1', {
        'title': 'Post',
        'body': [
          {'type': 'tournament', 'tournamentId': 't1'},
          {'type': 'tournament', 'tournamentId': ' '},
          {'type': 'product', 'productId': 'toalha'},
          {'type': 'product'},
          {
            'type': 'video',
            'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'caption': 'Saque viagem',
          },
          {
            'type': 'video',
            'url': 'https://www.instagram.com/reel/Cabc123/',
            'caption': '',
          },
          {'type': 'video', 'url': 'https://vimeo.com/123', 'caption': ''},
          {'type': 'video', 'url': 'http://youtu.be/dQw4w9WgXcQ'},
        ],
      })!;
      expect(post.body.map((b) => b.runtimeType), [
        BlogTournamentEmbed,
        BlogProductEmbed,
        BlogVideo,
        BlogVideo,
      ]);
      expect((post.body[0] as BlogTournamentEmbed).tournamentId, 't1');
      expect((post.body[1] as BlogProductEmbed).productId, 'toalha');
      final yt = post.body[2] as BlogVideo;
      expect(yt.caption, 'Saque viagem');
      expect(
        yt.thumbnailUrl,
        'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      );
      expect(yt.isInstagram, isFalse);
      final ig = post.body[3] as BlogVideo;
      expect(ig.isInstagram, isTrue);
      expect(ig.thumbnailUrl, isNull);
    });

    test('id do YouTube nos formatos de link', () {
      expect(blogYoutubeId('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ');
      expect(
        blogYoutubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'),
        'dQw4w9WgXcQ',
      );
      expect(
        blogYoutubeId('https://youtube.com/shorts/dQw4w9WgXcQ'),
        'dQw4w9WgXcQ',
      );
      expect(
        blogYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'),
        'dQw4w9WgXcQ',
      );
      expect(blogYoutubeId('https://www.youtube.com/@nexago'), isNull);
      expect(blogYoutubeId('https://www.instagram.com/p/abc/'), isNull);
    });
  });

  group('avisos por categoria', () {
    final categories = BlogTaxonomy.defaults.active;

    test('doc ausente = todas ligadas', () {
      final prefs = BlogNotifyPrefs.fromMap(null);
      expect(prefs.enabledIn(categories), categories);
      expect(
        blogNotifySummary(prefs, categories),
        'Todas as categorias ligadas',
      );
    });

    test('lê muted (inclusive id de categoria criada), ignora o que não é id '
        'e grava ordenado', () {
      final prefs = BlogNotifyPrefs.fromMap({
        'muted': ['loja', 'saude-corpo', 'Fora Do Formato', 'regras', 3],
      });
      expect(prefs.muted, {'loja', 'saude-corpo', 'regras'});
      expect(prefs.toWriteMap(), {
        'muted': ['loja', 'regras', 'saude-corpo'],
      });
      expect(prefs.toWriteMap().keys, ['muted']);
    });

    test('alternar liga e desliga uma categoria', () {
      final off = BlogNotifyPrefs.allOn.withCategory('torneios', on: false);
      expect(off.isOn('torneios'), isFalse);
      expect(off.isOn('treino'), isTrue);
      final on = off.withCategory('torneios', on: true);
      expect(on.muted, isEmpty);
    });

    test('resumo do card', () {
      BlogNotifyPrefs only(List<String> on) => BlogNotifyPrefs(
        muted: {
          for (final c in categories)
            if (!on.contains(c.key)) c.key,
        },
      );
      expect(
        blogNotifySummary(only(['torneios', 'treino']), categories),
        'Torneios e Treino ligados',
      );
      expect(blogNotifySummary(only(['regras']), categories), 'Regras ligado');
      expect(
        blogNotifySummary(only(['torneios', 'treino', 'guia']), categories),
        'Torneios, Treino e Guia do app ligados',
      );
      expect(
        blogNotifySummary(
          const BlogNotifyPrefs(muted: {'loja', 'arenas'}),
          categories,
        ),
        'Todas, menos Arenas e Loja',
      );
      expect(blogNotifySummary(only(const []), categories), 'Todos desligados');
    });

    test('resumo com categoria criada e desativada fora', () {
      final active = BlogTaxonomy.merge({
        'loja': {'active': false},
        'saude': {
          'label': 'Saúde',
          'color': '#33CCAA',
          'colorLight': '#11664F',
          'order': 9,
        },
      }).active;
      expect(active.map((c) => c.key), contains('saude'));
      expect(active.map((c) => c.key), isNot(contains('loja')));
      // Loja desativada e silenciada não conta: o resto todo ligado.
      expect(
        blogNotifySummary(const BlogNotifyPrefs(muted: {'loja'}), active),
        'Todas as categorias ligadas',
      );
    });
  });
}
