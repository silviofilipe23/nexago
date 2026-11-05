/// Regras puras do blog: feed, busca, biblioteca e textos de tempo.
library;

import '../../../core/search/search_keywords.dart';
import 'blog_library.dart';
import 'blog_post.dart';

/// Mais novo primeiro; sem data vai para o fim.
int compareBlogPostsNewestFirst(BlogPost a, BlogPost b) {
  final da = a.publishAt;
  final db = b.publishAt;
  if (da == null && db == null) return a.id.compareTo(b.id);
  if (da == null) return 1;
  if (db == null) return -1;
  return db.compareTo(da);
}

/// O card grande do topo: o destaque mais recente; sem destaque, o mais
/// recente. [posts] já vem do mais novo para o mais antigo.
BlogPost? blogFeaturedPost(List<BlogPost> posts) {
  if (posts.isEmpty) return null;
  return posts.where((p) => p.featured).firstOrNull ?? posts.first;
}

/// Os chips do feed: as categorias ATIVAS que têm post, na ordem da lista
/// efetiva.
List<BlogCategory> blogCategoriesWithPosts(
  List<BlogPost> posts,
  BlogTaxonomy taxonomy,
) {
  final present = {for (final p in posts) p.categoryKey};
  return [
    for (final c in taxonomy.active)
      if (present.contains(c.key)) c,
  ];
}

/// Filtra por título, subtítulo e tags, sem acento nem caixa. Cada palavra
/// da busca precisa aparecer em algum desses campos.
List<BlogPost> searchBlogPosts(List<BlogPost> posts, String query) {
  final tokens = [
    for (final t in query.split(RegExp(r'\s+')))
      if (normalizeSearchTerm(t).isNotEmpty) normalizeSearchTerm(t),
  ];
  if (tokens.isEmpty) return posts;
  return [
    for (final p in posts)
      if (_matches(p, tokens)) p,
  ];
}

bool _matches(BlogPost post, List<String> tokens) {
  final haystack = [
    post.title,
    post.subtitle,
    ...post.tags,
  ].map(normalizeSearchTerm).join(' ');
  return tokens.every(haystack.contains);
}

/// Ordem da biblioteca: o mexido por último primeiro.
DateTime? _touchedAt(BlogLibraryEntry e) =>
    e.updatedAt ?? e.readStartedAt ?? e.savedAt;

int _newestFirst(DateTime? a, DateTime? b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.compareTo(a);
}

/// "Continue lendo" do feed: a leitura pela metade mexida por último cujo
/// post está em [posts].
({BlogPost post, BlogLibraryEntry entry})? blogContinueReading(
  List<BlogPost> posts,
  Map<String, BlogLibraryEntry> library,
) {
  final byId = {for (final p in posts) p.id: p};
  final candidates =
      library.values
          .where((e) => e.isInProgress && byId.containsKey(e.postId))
          .toList()
        ..sort((a, b) => _newestFirst(_touchedAt(a), _touchedAt(b)));
  if (candidates.isEmpty) return null;
  final entry = candidates.first;
  return (post: byId[entry.postId]!, entry: entry);
}

/// Uma linha da tela de Salvos e lendo.
typedef BlogLibraryItem = ({BlogPost post, BlogLibraryEntry entry});

/// As três listas da tela de Salvos e lendo.
class BlogLibraryView {
  const BlogLibraryView({
    this.inProgress = const [],
    this.saved = const [],
    this.finished = const [],
  });

  /// "Pela metade", mexido por último primeiro.
  final List<BlogLibraryItem> inProgress;

  /// "Salvos", salvo por último primeiro.
  final List<BlogLibraryItem> saved;

  /// "Lidos", terminado por último primeiro.
  final List<BlogLibraryItem> finished;

  bool get isEmpty => inProgress.isEmpty && saved.isEmpty && finished.isEmpty;
}

/// Cruza a biblioteca com os posts encontrados; entrada sem post (despublicado,
/// fora do app) fica de fora.
BlogLibraryView buildBlogLibraryView(
  Map<String, BlogLibraryEntry> library,
  List<BlogPost> posts,
) {
  final byId = {for (final p in posts) p.id: p};
  List<BlogLibraryItem> pick(
    bool Function(BlogLibraryEntry) test,
    DateTime? Function(BlogLibraryEntry) orderBy,
  ) {
    final entries =
        library.values
            .where((e) => test(e) && byId.containsKey(e.postId))
            .toList()
          ..sort((a, b) => _newestFirst(orderBy(a), orderBy(b)));
    return [for (final e in entries) (post: byId[e.postId]!, entry: e)];
  }

  return BlogLibraryView(
    inProgress: pick((e) => e.isInProgress, _touchedAt),
    saved: pick((e) => e.saved, (e) => e.savedAt),
    finished: pick((e) => e.isFinished, (e) => e.finishedAt),
  );
}

/// Ids que a tela de Salvos e lendo precisa buscar, ordenados e juntos por
/// vírgula — chave estável para o provider (lista como chave vira loop).
String blogLibraryIdsKey(Map<String, BlogLibraryEntry> library) {
  final ids = [
    for (final e in library.values)
      if (e.isRelevant) e.postId,
  ]..sort();
  return ids.join(',');
}

/// "Leia também": até [max] da mesma categoria; faltando, os mais recentes.
List<BlogPost> blogRelatedPosts(
  BlogPost post,
  List<BlogPost> posts, {
  int max = 2,
}) {
  final others = posts.where((p) => p.id != post.id).toList();
  final same = others.where((p) => p.categoryKey == post.categoryKey).take(max);
  final result = [...same];
  for (final p in others) {
    if (result.length >= max) break;
    if (!result.contains(p)) result.add(p);
  }
  return result;
}

/// "N min restantes": o que falta da leitura, mínimo 1.
int blogRemainingMinutes(int readMinutes, double progress) {
  final left = (readMinutes * (1 - progress.clamp(0.0, 1.0))).round();
  return left < 1 ? 1 : left;
}

/// Porcentagem lida (0..100), para o "60%".
int blogProgressPercent(double progress) =>
    (progress.clamp(0.0, 1.0) * 100).round();

int _calendarDaysBetween(DateTime from, DateTime to) {
  final a = DateTime(from.year, from.month, from.day);
  final b = DateTime(to.year, to.month, to.day);
  // Hora cheia evita o dia de 23 h do horário de verão.
  return (b.difference(a).inHours / 24).round();
}

/// "hoje" / "há 3 dias" / "há 1 semana" / "há 2 meses", pelo dia do calendário.
String blogRelativeDay(DateTime when, DateTime now) {
  final days = _calendarDaysBetween(when.toLocal(), now.toLocal());
  if (days <= 0) return 'hoje';
  if (days == 1) return 'ontem';
  if (days < 7) return 'há $days dias';
  if (days < 30) {
    final weeks = days ~/ 7;
    return weeks == 1 ? 'há 1 semana' : 'há $weeks semanas';
  }
  final months = days ~/ 30;
  if (months < 12) return months == 1 ? 'há 1 mês' : 'há $months meses';
  final years = days ~/ 365;
  return years <= 1 ? 'há 1 ano' : 'há $years anos';
}

/// "salvo hoje" / "salvo há 4 dias".
String blogSavedAgo(DateTime? savedAt, DateTime now) =>
    savedAt == null ? 'salvo' : 'salvo ${blogRelativeDay(savedAt, now)}';

/// "lido ontem" / "lido há 1 semana".
String blogFinishedAgo(DateTime? finishedAt, DateTime now) =>
    finishedAt == null ? 'lido' : 'lido ${blogRelativeDay(finishedAt, now)}';

const _months = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/// "28 out" no ano corrente; "28 out 2025" fora dele.
String blogShortDate(DateTime date, DateTime now) {
  final d = date.toLocal();
  final base = '${d.day} ${_months[d.month - 1]}';
  return d.year == now.toLocal().year ? base : '$base ${d.year}';
}

/// Iniciais do autor ("Marcelo R." → "MR"); vazio → "N" (nexaGO).
String blogAuthorInitials(String name) {
  final words = name
      .split(RegExp(r'\s+'))
      .map((w) => w.replaceAll(RegExp(r'[^\p{L}\p{N}]', unicode: true), ''))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return 'N';
  if (words.length == 1) return words.first[0].toUpperCase();
  return (words.first[0] + words.last[0]).toUpperCase();
}

/// "4 min de leitura · Marcelo R." (sem autor, só o tempo).
String blogReadLine(BlogPost post, {bool long = true}) {
  final time = long
      ? '${post.readMinutes} min de leitura'
      : '${post.readMinutes} min';
  return post.authorName.isEmpty ? time : '$time · ${post.authorName}';
}

/// Contagem do "Ajudou" com o toque do atleta aplicado antes do gatilho.
///
/// [serverCount] é o `helpfulCount` do post agora; [countAtToggle] o que ele
/// valia quando o atleta tocou; [pendingDelta] a soma dos toques desde então
/// (+1 marcou, −1 desmarcou). Quando o gatilho atualiza o post
/// ([serverCount] ≠ [countAtToggle]), o número do servidor volta a valer.
int blogOptimisticHelpfulCount({
  required int serverCount,
  required int? countAtToggle,
  required int pendingDelta,
}) {
  if (countAtToggle == null || serverCount != countAtToggle) {
    return serverCount < 0 ? 0 : serverCount;
  }
  final n = countAtToggle + pendingDelta;
  return n < 0 ? 0 : n;
}
