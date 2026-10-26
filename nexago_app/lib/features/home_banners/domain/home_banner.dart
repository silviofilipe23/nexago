/// Banner de novidades da Home — um item de `appConfig/homeBanners.banners`,
/// gravado pelo backoffice (App do atleta › Banner de novidades) via a
/// callable `saveHomeBanners` (`functions/src/home-banners.ts`). O espelho só
/// traz publicados e ativos; período e público o app confere na hora
/// ([eligibleHomeBanners]).
library;

enum HomeBannerFormat { carousel, compact }

/// Quem vê. Chaves iguais às do backoffice.
enum HomeBannerAudience {
  all('all'),
  newAthletes('new'),
  noBooking('no-booking'),
  booked('booked'),
  noTournament('no-tournament');

  const HomeBannerAudience(this.key);
  final String key;
}

/// Tela que o botão abre. Chave nova no backoffice exige build novo: este
/// aqui não a conhece e esconde o banner em vez de abrir o lugar errado.
enum HomeBannerDestination {
  reservar('reservar'),
  boraJogar('bora-jogar'),
  peladas('peladas'),
  torneios('torneios'),
  ranking('ranking'),
  duplas('duplas'),
  treinos('treinos'),
  aulas('aulas'),
  loja('loja'),
  indicar('indicar'),
  missoes('missoes'),
  url('url');

  const HomeBannerDestination(this.key);
  final String key;
}

class HomeBanner {
  const HomeBanner({
    required this.id,
    required this.format,
    required this.title,
    required this.description,
    required this.ctaLabel,
    required this.destination,
    required this.audience,
    this.imageUrl,
    this.url,
    this.startDate,
    this.endDate,
    this.hideAfterClick = false,
    this.dismissible = true,
  });

  final String id;
  final HomeBannerFormat format;
  final String title;
  final String description;

  /// Texto do botão; o compacto não tem botão (a linha inteira é o toque).
  final String ctaLabel;
  final String? imageUrl;
  final HomeBannerDestination destination;

  /// Só com [HomeBannerDestination.url]: endereço https aberto fora do app.
  final String? url;
  final HomeBannerAudience audience;

  /// Datas civis de São Paulo (`YYYY-MM-DD`), inclusivas; `null` = sem limite.
  final String? startDate;
  final String? endDate;

  /// Some para o atleta depois que ele toca no botão uma vez.
  final bool hideAfterClick;

  /// Mostra o X; dispensado não volta para aquele atleta.
  final bool dismissible;

  static final _datePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  /// `null` quando falta o essencial ou a chave é desconhecida para este
  /// build — o banner fica de fora em vez de aparecer quebrado.
  static HomeBanner? fromMap(Map<String, dynamic> map) {
    String text(String key) {
      final v = map[key];
      return v is String ? v.trim() : '';
    }

    String? date(String key) {
      final v = text(key);
      return _datePattern.hasMatch(v) ? v : null;
    }

    final id = text('id');
    final title = text('title');
    final description = text('description');
    final format = switch (map['format']) {
      'carousel' => HomeBannerFormat.carousel,
      'compact' => HomeBannerFormat.compact,
      _ => null,
    };
    final destination = HomeBannerDestination.values
        .where((d) => d.key == map['destination'])
        .firstOrNull;
    final audience = HomeBannerAudience.values
        .where((a) => a.key == map['audience'])
        .firstOrNull;
    if (id.isEmpty ||
        title.isEmpty ||
        description.isEmpty ||
        format == null ||
        destination == null ||
        audience == null) {
      return null;
    }
    final ctaLabel = text('ctaLabel');
    if (format == HomeBannerFormat.carousel && ctaLabel.isEmpty) return null;
    final url = text('url');
    if (destination == HomeBannerDestination.url &&
        !url.startsWith('https://')) {
      return null;
    }
    final imageUrl = text('imageUrl');
    return HomeBanner(
      id: id,
      format: format,
      title: title,
      description: description,
      ctaLabel: ctaLabel,
      imageUrl: imageUrl.startsWith('https://') ? imageUrl : null,
      destination: destination,
      url: destination == HomeBannerDestination.url ? url : null,
      audience: audience,
      startDate: date('startDate'),
      endDate: date('endDate'),
      hideAfterClick: map['hideAfterClick'] == true,
      dismissible: map['dismissible'] != false,
    );
  }

  /// A lista do doc, na ordem do carrossel, sem os itens que não servem.
  static List<HomeBanner> listFromDoc(Map<String, dynamic>? data) {
    final raw = data?['banners'];
    if (raw is! List) return const [];
    return [
      for (final item in raw)
        if (item is Map) ?HomeBanner.fromMap(Map<String, dynamic>.from(item)),
    ];
  }
}

/// O que o atleta já fez com um banner (`users/{uid}/homeBanners/{id}`).
/// Cada marca é gravada uma vez e nunca some (a rule garante).
class HomeBannerMarks {
  const HomeBannerMarks({
    this.seen = false,
    this.clicked = false,
    this.dismissed = false,
  });

  final bool seen;
  final bool clicked;
  final bool dismissed;

  /// Presença da chave basta: na escrita local o `serverTimestamp` ainda é
  /// `null`, e o banner dispensado tem de sumir na hora.
  factory HomeBannerMarks.fromMap(Map<String, dynamic> map) => HomeBannerMarks(
    seen: map.containsKey('seenAt'),
    clicked: map.containsKey('clickedAt'),
    dismissed: map.containsKey('dismissedAt'),
  );

  bool has(HomeBannerMark mark) => switch (mark) {
    HomeBannerMark.seen => seen,
    HomeBannerMark.clicked => clicked,
    HomeBannerMark.dismissed => dismissed,
  };
}

/// As três marcas e o campo de cada uma no doc do atleta.
enum HomeBannerMark {
  seen('seenAt'),
  clicked('clickedAt'),
  dismissed('dismissedAt');

  const HomeBannerMark(this.field);
  final String field;
}

/// Gravação e leitura de `appConfig/homeBanners` e das marcas do atleta.
abstract interface class HomeBannersRepository {
  Stream<List<HomeBanner>> watchBanners();

  Stream<Map<String, HomeBannerMarks>> watchMarks(String uid);

  /// Grava a marca com a hora do servidor. A rule recusa regravar uma marca
  /// que já existe — quem chama confere antes.
  Future<void> mark(String uid, String bannerId, HomeBannerMark mark);
}
