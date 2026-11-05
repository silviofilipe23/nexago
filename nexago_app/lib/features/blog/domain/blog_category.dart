/// Categorias do blog: as 6 de origem (valem sem doc) mescladas com
/// `blogCategories/{id}` = `{label, color, colorLight, order, active}`
/// (backoffice › Conteúdo › Categorias; `functions/src/blog-taxonomy.ts`).
/// Doc vence no mesmo id; ordem por `order` e depois rótulo. Id desconhecido
/// (doc apagado, build antigo) vira "Blog" neutro em quem mostra.
library;

/// Formato do id (mesmo `CATEGORY_ID_RE` do backend), até 32 caracteres.
final _categoryIdPattern = RegExp(r'^[a-z0-9]+(-[a-z0-9]+)*$');

bool isBlogCategoryId(Object? id) =>
    id is String && id.length <= 32 && _categoryIdPattern.hasMatch(id);

/// `#RRGGBB` → ARGB opaco; qualquer outra coisa → `null`.
int? parseBlogHexColor(Object? raw) {
  if (raw is! String) return null;
  final m = RegExp(r'^#([0-9A-Fa-f]{6})$').firstMatch(raw.trim());
  if (m == null) return null;
  return 0xFF000000 | int.parse(m.group(1)!, radix: 16);
}

class BlogCategory {
  const BlogCategory({
    required this.key,
    required this.label,
    required this.color,
    required this.colorLight,
    this.order = 0,
    this.active = true,
  });

  /// Id (`torneios`, `saude-corpo`).
  final String key;
  final String label;

  /// Tom no tema escuro e sobre fundo sempre escuro (capa, chip), ARGB.
  final int color;

  /// Tom de TEXTO/ícone no tema claro (≥ 4,5:1 no fundo claro), ARGB.
  final int colorLight;
  final int order;

  /// Desativada: some dos chips do feed e da folha de avisos; post que já
  /// tem a categoria continua com rótulo e cor dela.
  final bool active;

  static const torneios = BlogCategory(
    key: 'torneios',
    label: 'Torneios',
    color: 0xFFFF6A1A,
    colorLight: 0xFFAE3A0A,
  );
  static const treino = BlogCategory(
    key: 'treino',
    label: 'Treino',
    color: 0xFF2BD17E,
    colorLight: 0xFF187345,
    order: 1,
  );
  static const regras = BlogCategory(
    key: 'regras',
    label: 'Regras',
    color: 0xFFC9A7FF,
    colorLight: 0xFF6B3FB8,
    order: 2,
  );
  static const arenas = BlogCategory(
    key: 'arenas',
    label: 'Arenas',
    color: 0xFFE3B85C,
    colorLight: 0xFF7A5A0F,
    order: 3,
  );
  static const guia = BlogCategory(
    key: 'guia',
    label: 'Guia do app',
    color: 0xFF9AB4FF,
    colorLight: 0xFF2F55B8,
    order: 4,
  );
  static const loja = BlogCategory(
    key: 'loja',
    label: 'Loja',
    color: 0xFFFF8A4A,
    colorLight: 0xFF9A3D0C,
    order: 5,
  );

  /// As 6 de origem (`BLOG_DEFAULT_CATEGORIES` do backend).
  static const defaults = [torneios, treino, regras, arenas, guia, loja];

  /// Doc de `blogCategories/{id}` sobre [base] (a de origem com o mesmo id,
  /// se houver). Campo ausente ou inválido fica com o da base; categoria
  /// nova sem rótulo ou sem cor válida fica de fora (`null`).
  static BlogCategory? fromDoc(
    String id,
    Map<String, dynamic>? data, {
    BlogCategory? base,
  }) {
    if (!isBlogCategoryId(id) || data == null) return base;
    final rawLabel = data['label'];
    final label = rawLabel is String && rawLabel.trim().isNotEmpty
        ? rawLabel.trim()
        : base?.label;
    final color = parseBlogHexColor(data['color']) ?? base?.color;
    final colorLight =
        parseBlogHexColor(data['colorLight']) ?? base?.colorLight;
    if (label == null || color == null || colorLight == null) return base;
    final rawOrder = data['order'];
    final rawActive = data['active'];
    return BlogCategory(
      key: id,
      label: label,
      color: color,
      colorLight: colorLight,
      order: rawOrder is num ? rawOrder.round() : (base?.order ?? 999),
      active: rawActive is bool ? rawActive : (base?.active ?? true),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is BlogCategory &&
      other.key == key &&
      other.label == label &&
      other.color == color &&
      other.colorLight == colorLight &&
      other.order == order &&
      other.active == active;

  @override
  int get hashCode => Object.hash(key, label, color, colorLight, order, active);
}

/// A lista efetiva de categorias (padrões ⊕ docs), já ordenada.
class BlogTaxonomy {
  BlogTaxonomy(List<BlogCategory> categories)
    : all = List.unmodifiable(
        [...categories]..sort((a, b) {
          final byOrder = a.order.compareTo(b.order);
          return byOrder != 0
              ? byOrder
              : a.label.toLowerCase().compareTo(b.label.toLowerCase());
        }),
      );

  /// Só as 6 de origem: sem leitura, carregando ou com falha.
  static final defaults = BlogTaxonomy(BlogCategory.defaults);

  /// Padrões ⊕ docs (`id` → dados); doc vence no mesmo id.
  factory BlogTaxonomy.merge(Map<String, Map<String, dynamic>> docs) {
    final byKey = {for (final c in BlogCategory.defaults) c.key: c};
    docs.forEach((id, data) {
      final merged = BlogCategory.fromDoc(id, data, base: byKey[id]);
      if (merged != null) byKey[id] = merged;
    });
    return BlogTaxonomy(byKey.values.toList());
  }

  final List<BlogCategory> all;

  /// As ativas, na ordem (chips do feed, folha de avisos).
  List<BlogCategory> get active => [
    for (final c in all)
      if (c.active) c,
  ];

  /// A categoria do id (ativa ou não); `null` = desconhecida ("Blog").
  BlogCategory? of(String? key) {
    if (key == null || key.isEmpty) return null;
    for (final c in all) {
      if (c.key == key) return c;
    }
    return null;
  }

  /// Rótulo do id; desconhecido = "Blog".
  String labelOf(String? key) => of(key)?.label ?? 'Blog';

  @override
  bool operator ==(Object other) =>
      other is BlogTaxonomy &&
      other.all.length == all.length &&
      Iterable.generate(all.length).every((i) => other.all[i] == all[i]);

  @override
  int get hashCode => Object.hashAll(all);
}
