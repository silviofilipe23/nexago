/// Central de ajuda — `appConfig/appGuide.categories`: guias "como usar" de
/// cada função do app, por categoria. Cada guia tem o formato da
/// funcionalidade das Novidades ([AppNewsFeature]): explicação, passos, onde
/// encontrar e o botão que abre a função (mesmas chaves de destino do banner
/// da Home; chave desconhecida esconde o guia).
library;

import '../../../core/search/search_keywords.dart';
import '../../app_news/domain/app_news.dart';

class AppGuideCategory {
  const AppGuideCategory({
    required this.id,
    required this.title,
    required this.topics,
  });

  final String id;
  final String title;
  final List<AppNewsFeature> topics;

  /// Guias passam do teto das Novidades: um passo a passo pode ser maior.
  static const maxSteps = 6;

  /// `null` sem id/título ou sem nenhum guia que este build saiba mostrar.
  static AppGuideCategory? fromMap(Map<String, dynamic> map) {
    final id = map['id'] is String ? (map['id'] as String).trim() : '';
    final title = map['title'] is String ? (map['title'] as String).trim() : '';
    final raw = map['topics'];
    final topics = [
      if (raw is List)
        for (final t in raw)
          if (t is Map)
            ?AppNewsFeature.fromMap(
              Map<String, dynamic>.from(t),
              stepLimit: maxSteps,
            ),
    ];
    if (id.isEmpty || title.isEmpty || topics.isEmpty) return null;
    return AppGuideCategory(id: id, title: title, topics: topics);
  }

  /// As categorias do doc, na ordem gravada.
  static List<AppGuideCategory> listFromDoc(Map<String, dynamic>? data) {
    final raw = data?['categories'];
    if (raw is! List) return const [];
    return [
      for (final item in raw)
        if (item is Map)
          ?AppGuideCategory.fromMap(Map<String, dynamic>.from(item)),
    ];
  }
}

/// Um guia e a categoria dele (para o rótulo no detalhe e na busca).
typedef AppGuideEntry = ({AppGuideCategory category, AppNewsFeature topic});

/// O guia pelo id, em qualquer categoria.
AppGuideEntry? findAppGuideTopic(List<AppGuideCategory> categories, String id) {
  for (final category in categories) {
    for (final topic in category.topics) {
      if (topic.id == id) return (category: category, topic: topic);
    }
  }
  return null;
}

/// Busca sem acento e sem caixa: cada palavra digitada tem de aparecer no
/// título, no resumo, na explicação, nos passos ou no "onde encontrar".
List<AppGuideEntry> searchAppGuide(
  List<AppGuideCategory> categories,
  String query,
) {
  final terms = [
    for (final word in query.split(RegExp(r'\s+')))
      if (normalizeSearchTerm(word).isNotEmpty) normalizeSearchTerm(word),
  ];
  if (terms.isEmpty) return const [];
  return [
    for (final category in categories)
      for (final topic in category.topics)
        if (_matches(topic, category, terms))
          (category: category, topic: topic),
  ];
}

bool _matches(
  AppNewsFeature topic,
  AppGuideCategory category,
  List<String> terms,
) {
  final haystack = normalizeSearchTerm(
    [
      topic.title,
      topic.summary,
      topic.description,
      ...topic.steps,
      topic.where,
      category.title,
    ].join(' '),
  );
  return terms.every(haystack.contains);
}

/// Leitura de `appConfig/appGuide`.
abstract interface class AppGuideRepository {
  Stream<List<AppGuideCategory>> watchCategories();
}
