/// Avisos do blog por categoria: `blogNotifyPrefs/{uid}` =
/// `{muted: [chaves], updatedAt: serverTimestamp}`. Doc ausente = recebe
/// todas. A rule exige exatamente essas duas chaves. O push sai de
/// `functions/src/blog-push.ts`, que pula quem silenciou a categoria do post.
library;

import 'blog_post.dart';

class BlogNotifyPrefs {
  const BlogNotifyPrefs({this.muted = const {}, this.updatedAt});

  /// Categorias silenciadas.
  final Set<BlogCategory> muted;

  /// Hora do servidor; `null` sem doc ou com a gravação pendente.
  final DateTime? updatedAt;

  static const allOn = BlogNotifyPrefs();

  bool isOn(BlogCategory category) => !muted.contains(category);

  List<BlogCategory> get enabled => [
    for (final c in BlogCategory.values)
      if (isOn(c)) c,
  ];

  /// Liga ou desliga [category].
  BlogNotifyPrefs withCategory(BlogCategory category, {required bool on}) =>
      BlogNotifyPrefs(
        muted: on ? ({...muted}..remove(category)) : {...muted, category},
        updatedAt: updatedAt,
      );

  /// Só `muted` (na ordem fixa das categorias); `updatedAt` é do servidor.
  Map<String, Object?> toWriteMap() => {
    'muted': [
      for (final c in BlogCategory.values)
        if (muted.contains(c)) c.key,
    ],
  };

  /// Chave desconhecida (categoria de build mais novo) fica de fora.
  static BlogNotifyPrefs fromMap(Map<String, dynamic>? map) {
    if (map == null) return allOn;
    final raw = map['muted'];
    final updatedAt = blogDate(map['updatedAt']);
    return BlogNotifyPrefs(
      muted: {
        if (raw is List)
          for (final k in raw) ?BlogCategory.fromKey(k),
      },
      updatedAt: updatedAt,
    );
  }
}

/// "A", "A e B", "A, B e C".
String _joinPt(List<String> items) {
  if (items.length <= 1) return items.join();
  return '${items.sublist(0, items.length - 1).join(', ')} e ${items.last}';
}

/// Resumo do card "Avisos do blog": "Torneios e Treino ligados", "Todas as
/// categorias ligadas", "Todas, menos Loja", "Todos desligados".
String blogNotifySummary(BlogNotifyPrefs prefs) {
  final on = prefs.enabled;
  final total = BlogCategory.values.length;
  if (on.length == total) return 'Todas as categorias ligadas';
  if (on.isEmpty) return 'Todos desligados';
  if (on.length <= 3) {
    final labels = _joinPt([for (final c in on) c.label]);
    return on.length == 1 ? '$labels ligado' : '$labels ligados';
  }
  final off = [
    for (final c in BlogCategory.values)
      if (!prefs.isOn(c)) c.label,
  ];
  return 'Todas, menos ${_joinPt(off)}';
}
