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
import 'blog_category.dart';

export 'blog_category.dart';

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
      case 'video':
        final url = text('url');
        if (!isBlogVideoUrl(url)) return null;
        return BlogVideo(url: url, caption: text('caption'));
      case 'tournament':
        final id = text('tournamentId');
        return id.isEmpty ? null : BlogTournamentEmbed(id);
      case 'product':
        final id = text('productId');
        return id.isEmpty ? null : BlogProductEmbed(id);
      case 'arena':
        final id = text('arenaId');
        return id.isEmpty ? null : BlogArenaEmbed(id);
      case 'ranking':
        final sport = text('sport');
        final mode = BlogRankingMode.fromKey(raw['mode']);
        final gender = BlogRankingGender.fromKey(raw['gender']);
        if (sport.isEmpty || mode == null || gender == null) return null;
        return BlogRankingEmbed(sport: sport, mode: mode, gender: gender);
      default:
        return null;
    }
  }
}

/// Hosts aceitos no bloco de vídeo (mesmos do `isVideoUrl` do backend).
const _videoHosts = {
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'instagram.com',
  'www.instagram.com',
};

/// Link https do YouTube ou do Instagram.
bool isBlogVideoUrl(String url) {
  if (!url.startsWith('https://')) return false;
  final uri = Uri.tryParse(url);
  return uri != null && _videoHosts.contains(uri.host.toLowerCase());
}

/// Id do vídeo do YouTube (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`,
/// `/live/`), ou `null` (Instagram, link sem id).
String? blogYoutubeId(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null) return null;
  final host = uri.host.toLowerCase();
  final valid = RegExp(r'^[A-Za-z0-9_-]{6,20}$');
  String? pick(String? v) => v != null && valid.hasMatch(v) ? v : null;
  if (host == 'youtu.be') {
    return pick(uri.pathSegments.firstOrNull);
  }
  if (!host.endsWith('youtube.com')) return null;
  final v = pick(uri.queryParameters['v']);
  if (v != null) return v;
  final segments = uri.pathSegments;
  if (segments.length >= 2 &&
      const {'shorts', 'embed', 'live'}.contains(segments.first)) {
    return pick(segments[1]);
  }
  return null;
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

/// Vídeo do YouTube ou do Instagram: card com miniatura que abre o link fora
/// (sem player embutido).
class BlogVideo extends BlogBlock {
  const BlogVideo({required this.url, this.caption = ''});
  final String url;
  final String caption;

  String? get youtubeId => blogYoutubeId(url);

  /// Miniatura do YouTube; `null` no Instagram (não há endereço público).
  String? get thumbnailUrl {
    final id = youtubeId;
    return id == null ? null : 'https://img.youtube.com/vi/$id/hqdefault.jpg';
  }

  bool get isInstagram =>
      Uri.tryParse(url)?.host.toLowerCase().contains('instagram.com') ?? false;
}

/// Torneio citado no post (`tournaments/{id}`), lido ao vivo na leitura.
class BlogTournamentEmbed extends BlogBlock {
  const BlogTournamentEmbed(this.tournamentId);
  final String tournamentId;
}

/// Produto da Loja citado no post (`storeShowcase/{id}`), lido ao vivo.
class BlogProductEmbed extends BlogBlock {
  const BlogProductEmbed(this.productId);
  final String productId;
}

/// Arena citada no post (`arenas/{id}`): capa, horários livres de hoje e o
/// botão para reservar, lidos ao vivo.
class BlogArenaEmbed extends BlogBlock {
  const BlogArenaEmbed(this.arenaId);
  final String arenaId;
}

/// Modo do bloco de ranking. Chaves iguais às do backend.
enum BlogRankingMode {
  athletes('athletes'),
  teams('teams');

  const BlogRankingMode(this.key);
  final String key;

  static BlogRankingMode? fromKey(Object? key) =>
      BlogRankingMode.values.where((m) => m.key == key).firstOrNull;
}

/// Gênero do bloco de ranking. Chaves iguais às do backend.
enum BlogRankingGender {
  all('all'),
  masculino('masculino'),
  feminino('feminino'),
  misto('misto');

  const BlogRankingGender(this.key);
  final String key;

  static BlogRankingGender? fromKey(Object? key) =>
      BlogRankingGender.values.where((g) => g.key == key).firstOrNull;
}

/// Top 5 do ranking da temporada: esporte (`code` do catálogo), modo e
/// gênero. Também é chave de provider (igualdade por valor).
class BlogRankingEmbed extends BlogBlock {
  const BlogRankingEmbed({
    required this.sport,
    required this.mode,
    required this.gender,
  });

  final String sport;
  final BlogRankingMode mode;
  final BlogRankingGender gender;

  @override
  bool operator ==(Object other) =>
      other is BlogRankingEmbed &&
      other.sport == sport &&
      other.mode == mode &&
      other.gender == gender;

  @override
  int get hashCode => Object.hash(sport, mode, gender);
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
    this.categoryKey = '',
    this.sport = 'all',
    this.tags = const [],
    this.authorName = '',
    this.authorRole = '',
    this.authorId,
    this.authorPhotoUrl,
    this.body = const [],
    this.cta,
    this.featured = false,
    this.publishAt,
    this.readMinutes = 1,
    this.helpfulCount = 0,
    this.readCount = 0,
    this.commentCount = 0,
  });

  final String id;
  final String title;
  final String subtitle;

  /// Endereço no site (`/blog/<slug>`); vazio = sem compartilhar.
  final String slug;
  final String? coverUrl;

  /// Id da categoria (`torneios`, `saude-corpo`). Rótulo e cor vêm da lista
  /// efetiva ([BlogTaxonomy]); id que ela não conhece aparece como "Blog".
  final String categoryKey;

  /// `all` ou o `code` do catálogo de esportes.
  final String sport;
  final List<String> tags;
  final String authorName;
  final String authorRole;

  /// Autor cadastrado (`blogAuthors/{id}`); `null` = texto livre ou post antigo.
  final String? authorId;

  /// Foto do retrato do autor (https); `null` = mostra as iniciais.
  final String? authorPhotoUrl;
  final List<BlogBlock> body;
  final BlogCta? cta;
  final bool featured;

  /// Quando saiu. Ordena o feed.
  final DateTime? publishAt;
  final int readMinutes;
  final int helpfulCount;
  final int readCount;

  /// Comentários aprovados (gatilho `onBlogCommentWritten`); sem o campo, 0.
  final int commentCount;

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
      categoryKey: text('category'),
      sport: sport.isEmpty ? 'all' : sport,
      tags: tags,
      authorName: authorField('name'),
      authorRole: authorField('role'),
      authorId: authorField('id').isEmpty ? null : authorField('id'),
      authorPhotoUrl: authorField('photoUrl').startsWith('https://')
          ? authorField('photoUrl')
          : null,
      body: body,
      cta: BlogCta.fromMap(map['cta']),
      featured: map['featured'] == true,
      publishAt: blogDate(map['publishAt']),
      readMinutes: count('readMinutes', min: 1),
      helpfulCount: count('helpfulCount'),
      readCount: count('readCount'),
      commentCount: count('commentCount'),
    );
  }
}

/// `Timestamp`/`DateTime` → `DateTime` local; qualquer outra coisa → `null`.
DateTime? blogDate(Object? raw) => switch (raw) {
  Timestamp() => raw.toDate(),
  DateTime() => raw,
  _ => null,
};
