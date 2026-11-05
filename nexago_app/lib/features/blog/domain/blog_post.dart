/// Blog nexaGO — `blogPosts/{postId}`, escrito só pela callable
/// `saveBlogPost` (backoffice › Conteúdo › Blog). O app lê só os publicados
/// para o canal do app. Spec:
/// `docs/superpowers/specs/2026-11-05-blog-fase-1-design.md`.
///
/// O parser é tolerante: bloco de tipo desconhecido (versões futuras) é
/// ignorado; chamada com destino que este build não conhece some.
library;

import 'package:cloud_firestore/cloud_firestore.dart';

import '../../home_banners/domain/home_banner.dart';

/// Categorias do blog. Chaves iguais às do backend (`BLOG_CATEGORIES`).
enum BlogCategory {
  torneios('torneios', 'Torneios'),
  treino('treino', 'Treino'),
  regras('regras', 'Regras'),
  arenas('arenas', 'Arenas'),
  guia('guia', 'Guia do app'),
  loja('loja', 'Loja');

  const BlogCategory(this.key, this.label);

  final String key;
  final String label;

  static BlogCategory? fromKey(Object? key) =>
      BlogCategory.values.where((c) => c.key == key).firstOrNull;
}

/// Um bloco do corpo do post. Texto puro (sem HTML nem Markdown).
sealed class BlogBlock {
  const BlogBlock();

  /// `null` para tipo desconhecido ou bloco vazio: fica de fora.
  static BlogBlock? fromMap(Object? raw) {
    if (raw is! Map) return null;
    String text(String key) {
      final v = raw[key];
      return v is String ? v.trim() : '';
    }

    switch (raw['type']) {
      case 'paragraph':
        final t = text('text');
        return t.isEmpty ? null : BlogParagraph(t);
      case 'heading':
        final t = text('text');
        return t.isEmpty ? null : BlogHeading(t);
      case 'list':
        final rawItems = raw['items'];
        final items = [
          if (rawItems is List)
            for (final i in rawItems)
              if (i is String && i.trim().isNotEmpty) i.trim(),
        ];
        return items.isEmpty ? null : BlogList(items);
      case 'quote':
        final t = text('text');
        return t.isEmpty ? null : BlogQuote(t);
      case 'image':
        final url = text('url');
        if (!url.startsWith('https://')) return null;
        return BlogImage(url: url, caption: text('caption'));
      default:
        return null;
    }
  }
}

class BlogParagraph extends BlogBlock {
  const BlogParagraph(this.text);
  final String text;
}

class BlogHeading extends BlogBlock {
  const BlogHeading(this.text);
  final String text;
}

class BlogList extends BlogBlock {
  const BlogList(this.items);
  final List<String> items;
}

class BlogQuote extends BlogBlock {
  const BlogQuote(this.text);
  final String text;
}

class BlogImage extends BlogBlock {
  const BlogImage({required this.url, this.caption = ''});
  final String url;
  final String caption;
}

/// Botão no fim do post. Mesmas chaves do banner de novidades.
class BlogCta {
  const BlogCta({required this.label, required this.destination, this.url});

  final String label;
  final HomeBannerDestination destination;

  /// Só com [HomeBannerDestination.url]: endereço https aberto fora do app.
  final String? url;

  /// `null` sem rótulo, com destino desconhecido ou link que não é https.
  static BlogCta? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final label = raw['label'];
    if (label is! String || label.trim().isEmpty) return null;
    final destination = HomeBannerDestination.values
        .where((d) => d.key == raw['destination'])
        .firstOrNull;
    if (destination == null) return null;
    final url = raw['url'];
    if (destination == HomeBannerDestination.url &&
        (url is! String || !url.startsWith('https://'))) {
      return null;
    }
    return BlogCta(
      label: label.trim(),
      destination: destination,
      url: destination == HomeBannerDestination.url ? url as String : null,
    );
  }
}

class BlogPost {
  const BlogPost({
    required this.id,
    required this.title,
    this.subtitle = '',
    this.slug = '',
    this.coverUrl,
    this.category,
    this.sport = 'all',
    this.tags = const [],
    this.authorName = '',
    this.authorRole = '',
    this.body = const [],
    this.cta,
    this.featured = false,
    this.publishAt,
    this.readMinutes = 1,
    this.helpfulCount = 0,
    this.readCount = 0,
  });

  final String id;
  final String title;
  final String subtitle;

  /// Endereço no site (`/blog/<slug>`); vazio = sem compartilhar.
  final String slug;
  final String? coverUrl;

  /// `null` = categoria que este build não conhece (mostra como "Blog").
  final BlogCategory? category;

  /// `all` ou o `code` do catálogo de esportes.
  final String sport;
  final List<String> tags;
  final String authorName;
  final String authorRole;
  final List<BlogBlock> body;
  final BlogCta? cta;
  final bool featured;

  /// Quando saiu. Ordena o feed.
  final DateTime? publishAt;
  final int readMinutes;
  final int helpfulCount;
  final int readCount;

  String get categoryLabel => category?.label ?? 'Blog';

  /// `null` sem título: o post fica de fora em vez de aparecer quebrado.
  static BlogPost? fromMap(String id, Map<String, dynamic>? map) {
    if (map == null) return null;
    String text(String key) {
      final v = map[key];
      return v is String ? v.trim() : '';
    }

    int count(String key, {int min = 0}) {
      final v = map[key];
      final n = v is num ? v.round() : min;
      return n < min ? min : n;
    }

    final title = text('title');
    if (id.isEmpty || title.isEmpty) return null;

    final rawBody = map['body'];
    final body = <BlogBlock>[
      if (rawBody is List)
        for (final b in rawBody) ?BlogBlock.fromMap(b),
    ];
    final rawTags = map['tags'];
    final tags = [
      if (rawTags is List)
        for (final t in rawTags)
          if (t is String && t.trim().isNotEmpty) t.trim(),
    ];
    final author = map['author'];
    String authorField(String key) {
      if (author is! Map) return '';
      final v = author[key];
      return v is String ? v.trim() : '';
    }

    final cover = text('coverUrl');
    final sport = text('sport');
    return BlogPost(
      id: id,
      title: title,
      subtitle: text('subtitle'),
      slug: text('slug'),
      coverUrl: cover.startsWith('https://') ? cover : null,
      category: BlogCategory.fromKey(map['category']),
      sport: sport.isEmpty ? 'all' : sport,
      tags: tags,
      authorName: authorField('name'),
      authorRole: authorField('role'),
      body: body,
      cta: BlogCta.fromMap(map['cta']),
      featured: map['featured'] == true,
      publishAt: blogDate(map['publishAt']),
      readMinutes: count('readMinutes', min: 1),
      helpfulCount: count('helpfulCount'),
      readCount: count('readCount'),
    );
  }
}

/// `Timestamp`/`DateTime` → `DateTime` local; qualquer outra coisa → `null`.
DateTime? blogDate(Object? raw) => switch (raw) {
  Timestamp() => raw.toDate(),
  DateTime() => raw,
  _ => null,
};
