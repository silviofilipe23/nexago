/// Avisos do blog por categoria: `blogNotifyPrefs/{uid}` =
/// `{muted: [chaves], updatedAt: serverTimestamp}`. Doc ausente = recebe
/// todas. A rule exige exatamente essas duas chaves. O push sai de
/// `functions/src/blog-push.ts`, que pula quem silenciou a categoria do post.
library;

import 'blog_post.dart';

class BlogNotifyPrefs {
  const BlogNotifyPrefs({this.muted = const {}, this.updatedAt});

  /// Ids das categorias silenciadas (de origem ou criadas no backoffice).
  final Set<String> muted;

  /// Hora do servidor; `null` sem doc ou com a gravação pendente.
  final DateTime? updatedAt;

  static const allOn = BlogNotifyPrefs();

  bool isOn(String categoryKey) => !muted.contains(categoryKey);

  /// Das [categories] (as ativas, na ordem), as que estão ligadas.
  List<BlogCategory> enabledIn(List<BlogCategory> categories) => [
    for (final c in categories)
      if (isOn(c.key)) c,
  ];

  /// Liga ou desliga a categoria [categoryKey].
  BlogNotifyPrefs withCategory(String categoryKey, {required bool on}) =>
      BlogNotifyPrefs(
        muted: on ? ({...muted}..remove(categoryKey)) : {...muted, categoryKey},
        updatedAt: updatedAt,
      );

  /// Só `muted` (ordenado, para o doc não mudar à toa); `updatedAt` é do
  /// servidor. Id de categoria desativada continua silenciado.
  Map<String, Object?> toWriteMap() => {
    'muted': [...muted]..sort(),
  };

  /// Só ids no formato de categoria; o resto fica de fora.
  static BlogNotifyPrefs fromMap(Map<String, dynamic>? map) {
    if (map == null) return allOn;
    final raw = map['muted'];
    return BlogNotifyPrefs(
      muted: {
        if (raw is List)
          for (final k in raw)
            if (isBlogCategoryId(k)) k as String,
      },
      updatedAt: blogDate(map['updatedAt']),
    );
  }
}

/// "A", "A e B", "A, B e C".
String _joinPt(List<String> items) {
  if (items.length <= 1) return items.join();
  return '${items.sublist(0, items.length - 1).join(', ')} e ${items.last}';
}

/// Resumo do card "Avisos do blog" sobre as [categories] ativas: "Torneios e
/// Treino ligados", "Todas as categorias ligadas", "Todas, menos Loja",
/// "Todos desligados".
String blogNotifySummary(BlogNotifyPrefs prefs, List<BlogCategory> categories) {
  final on = prefs.enabledIn(categories);
  if (on.length == categories.length) return 'Todas as categorias ligadas';
  if (on.isEmpty) return 'Todos desligados';
  if (on.length <= 3) {
    final labels = _joinPt([for (final c in on) c.label]);
    return on.length == 1 ? '$labels ligado' : '$labels ligados';
  }
  final off = [
    for (final c in categories)
      if (!prefs.isOn(c.key)) c.label,
  ];
  return 'Todas, menos ${_joinPt(off)}';
}
