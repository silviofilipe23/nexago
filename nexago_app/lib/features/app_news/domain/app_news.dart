/// Novidades do app — `appConfig/appNews.releases`, uma entrada por versão
/// da loja. A tela de Novidades mostra a versão instalada em destaque e as
/// anteriores embaixo; os stories mostram a instalada uma vez, na primeira
/// abertura depois de atualizar ([pendingAppNewsStories]).
///
/// Destinos usam as mesmas chaves do banner da Home ([HomeBannerDestination]):
/// chave desconhecida para este build esconde a funcionalidade em vez de
/// abrir o lugar errado.
library;

import '../../home_banners/domain/home_banner.dart';

/// Ícone da funcionalidade quando o destino sozinho não diz o bastante (ex.:
/// o mapa e o convite na reserva abrem os dois o Reservar) ou quando não há
/// destino (guias da Central de ajuda). Sem ícone, vale o do destino; chave
/// que o build não conhece cai nesse mesmo padrão.
enum AppNewsIcon {
  map('map'),
  invite('invite'),
  cancel('cancel'),
  story('story'),
  handshake('handshake'),
  focus('focus'),
  chat('chat'),
  star('star'),
  rain('rain');

  const AppNewsIcon(this.key);
  final String key;
}

class AppNewsFeature {
  const AppNewsFeature({
    required this.id,
    required this.title,
    this.summary = '',
    this.description = '',
    this.steps = const [],
    this.where = '',
    this.ctaLabel = '',
    this.destination,
    this.url,
    this.imageUrl,
    this.icon,
    this.inStories = true,
  });

  /// Único entre as versões: é a chave do "Já usou".
  final String id;
  final String title;

  /// Uma linha: lista e stories.
  final String summary;

  /// O parágrafo do detalhe; vazio cai no [summary].
  final String description;

  /// "Como funciona" (até [maxSteps] nas Novidades).
  final List<String> steps;

  /// "Onde encontrar" (ex.: "Início › Ações rápidas").
  final String where;
  final String ctaLabel;

  /// `null` = só informativa, sem botão.
  final HomeBannerDestination? destination;

  /// Só com [HomeBannerDestination.url]: endereço https aberto fora do app.
  final String? url;
  final String? imageUrl;
  final AppNewsIcon? icon;

  /// `false` = fica só na tela, fora dos stories.
  final bool inStories;

  bool get hasAction => destination != null && ctaLabel.isNotEmpty;

  String get detailText => description.isNotEmpty ? description : summary;

  static const maxSteps = 4;

  /// `null` sem id/título ou com destino que este build não conhece.
  /// [stepLimit]: as Novidades cortam em [maxSteps]; os guias da Central de
  /// ajuda deixam mais.
  static AppNewsFeature? fromMap(
    Map<String, dynamic> map, {
    int stepLimit = maxSteps,
  }) {
    String text(String key) {
      final v = map[key];
      return v is String ? v.trim() : '';
    }

    final id = text('id');
    final title = text('title');
    if (id.isEmpty || title.isEmpty) return null;

    final destinationKey = text('destination');
    final destination = HomeBannerDestination.values
        .where((d) => d.key == destinationKey)
        .firstOrNull;
    if (destinationKey.isNotEmpty && destination == null) return null;
    final url = text('url');
    if (destination == HomeBannerDestination.url &&
        !url.startsWith('https://')) {
      return null;
    }

    final rawSteps = map['steps'];
    final steps = [
      if (rawSteps is List)
        for (final s in rawSteps)
          if (s is String && s.trim().isNotEmpty) s.trim(),
    ];
    final imageUrl = text('imageUrl');
    final iconKey = text('icon');
    return AppNewsFeature(
      id: id,
      title: title,
      summary: text('summary'),
      description: text('description'),
      steps: steps.take(stepLimit).toList(growable: false),
      where: text('where'),
      ctaLabel: text('ctaLabel'),
      destination: destination,
      url: destination == HomeBannerDestination.url ? url : null,
      imageUrl: imageUrl.startsWith('https://') ? imageUrl : null,
      icon: AppNewsIcon.values.where((i) => i.key == iconKey).firstOrNull,
      inStories: map['stories'] != false,
    );
  }
}

class AppNewsRelease {
  const AppNewsRelease({
    required this.version,
    required this.build,
    required this.date,
    this.stories = true,
    this.features = const [],
    this.improvements = const [],
  });

  /// O que o atleta lê ("1.0.15").
  final String version;

  /// Build number da loja (o `+N` do pubspec): só quem tem esse build ou
  /// maior vê a versão — dá para publicar antes de a loja liberar.
  final int build;

  /// Data civil de São Paulo (`YYYY-MM-DD`).
  final String date;

  /// `false` = a versão não abre stories depois de atualizar.
  final bool stories;
  final List<AppNewsFeature> features;
  final List<String> improvements;

  static final _datePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  AppNewsRelease withFeatures(List<AppNewsFeature> features) => AppNewsRelease(
    version: version,
    build: build,
    date: date,
    stories: stories,
    features: features,
    improvements: improvements,
  );

  static AppNewsRelease? fromMap(Map<String, dynamic> map) {
    final version = map['version'] is String
        ? (map['version'] as String).trim()
        : '';
    final build = map['build'];
    final date = map['date'] is String ? (map['date'] as String).trim() : '';
    if (version.isEmpty || build is! num || !_datePattern.hasMatch(date)) {
      return null;
    }
    final rawFeatures = map['features'];
    final rawImprovements = map['improvements'];
    return AppNewsRelease(
      version: version,
      build: build.toInt(),
      date: date,
      stories: map['stories'] != false,
      features: [
        if (rawFeatures is List)
          for (final f in rawFeatures)
            if (f is Map) ?AppNewsFeature.fromMap(Map<String, dynamic>.from(f)),
      ],
      improvements: [
        if (rawImprovements is List)
          for (final i in rawImprovements)
            if (i is String && i.trim().isNotEmpty) i.trim(),
      ],
    );
  }

  /// As versões do doc, da mais nova para a mais antiga (por build).
  static List<AppNewsRelease> listFromDoc(Map<String, dynamic>? data) {
    final raw = data?['releases'];
    if (raw is! List) return const [];
    return [
      for (final item in raw)
        if (item is Map)
          ?AppNewsRelease.fromMap(Map<String, dynamic>.from(item)),
    ]..sort((a, b) => b.build.compareTo(a.build));
  }
}

/// Leitura de `appConfig/appNews`.
abstract interface class AppNewsRepository {
  Stream<List<AppNewsRelease>> watchReleases();
}

/// O que o atleta já fez com as novidades neste aparelho: funcionalidades que
/// abriu pelo botão ("Já usou") e a última versão cujos stories viu.
abstract interface class AppNewsLocalStore {
  Future<Set<String>> usedFeatures(String uid);

  Future<void> markUsed(String uid, String featureId);

  Future<String?> storiesSeenVersion(String uid);

  Future<void> markStoriesSeen(String uid, String version);
}
