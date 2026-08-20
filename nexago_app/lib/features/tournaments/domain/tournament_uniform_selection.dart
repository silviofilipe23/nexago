import 'tournament_discovery_models.dart';

/// Tamanhos padrão quando a categoria não define `uniformSizeOptionsTop`.
const kDefaultUniformSizeOptionsTop = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

const kDefaultUniformSizeOptionsShorts = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

/// Prazo exibido até existir campo dedicado no torneio.
const kUniformChangeDeadlineDays = 7;

/// Seleção de uniforme de um atleta na inscrição.
class TournamentUniformSelection {
  const TournamentUniformSelection({
    this.sizeTop,
    this.sizeShorts,
    this.jerseyNumber,
    this.jerseyName,
  });

  final String? sizeTop;
  final String? sizeShorts;
  final int? jerseyNumber;
  final String? jerseyName;

  TournamentUniformSelection copyWith({
    String? sizeTop,
    String? sizeShorts,
    int? jerseyNumber,
    String? jerseyName,
  }) {
    return TournamentUniformSelection(
      sizeTop: sizeTop ?? this.sizeTop,
      sizeShorts: sizeShorts ?? this.sizeShorts,
      jerseyNumber: jerseyNumber ?? this.jerseyNumber,
      jerseyName: jerseyName ?? this.jerseyName,
    );
  }

  Map<String, dynamic> toCallableMap() {
    final map = <String, dynamic>{};
    final top = sizeTop?.trim();
    if (top != null && top.isNotEmpty) map['sizeTop'] = top;
    final shorts = sizeShorts?.trim();
    if (shorts != null && shorts.isNotEmpty) map['sizeShorts'] = shorts;
    if (jerseyNumber != null) map['jerseyNumber'] = jerseyNumber;
    final name = jerseyName?.trim();
    if (name != null && name.isNotEmpty) map['jerseyName'] = name;
    return map;
  }
}

List<String> uniformSizeOptionsTopForCategory(TournamentCategoryOffer category) {
  final fromCategory = category.uniformSizeOptionsTop
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  if (fromCategory.isNotEmpty) return fromCategory;
  return kDefaultUniformSizeOptionsTop;
}

List<String> uniformSizeOptionsShortsForCategory(
  TournamentCategoryOffer category,
) {
  final fromCategory = category.uniformSizeOptionsShorts
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  if (fromCategory.isNotEmpty) return fromCategory;
  return kDefaultUniformSizeOptionsShorts;
}

/// Valida seleção para avançar no fluxo.
String? validateUniformSelection({
  required TournamentCategoryOffer category,
  required TournamentUniformSelection selection,
}) {
  final topOptions = uniformSizeOptionsTopForCategory(category);
  final top = selection.sizeTop?.trim() ?? '';
  if (top.isEmpty) return 'Selecione o tamanho da regata.';
  if (!topOptions.contains(top)) {
    return 'Tamanho da regata inválido para esta categoria.';
  }

  if (categoryRequiresShorts(category)) {
    final shortsOptions = uniformSizeOptionsShortsForCategory(category);
    final shorts = selection.sizeShorts?.trim() ?? '';
    if (shorts.isEmpty) return 'Selecione o tamanho do shorts.';
    if (!shortsOptions.contains(shorts)) {
      return 'Tamanho do shorts inválido para esta categoria.';
    }
  }

  if (category.uniformNumberOnShirt) {
    final n = selection.jerseyNumber;
    if (n == null || n < 1 || n > 99) {
      return 'Informe um número entre 1 e 99.';
    }
  }

  if (category.uniformNameOnShirt) {
    final name = selection.jerseyName?.trim() ?? '';
    if (name.isEmpty) return 'Informe o nome para a camisa.';
  }

  return null;
}

bool isUniformSelectionComplete({
  required TournamentCategoryOffer category,
  required TournamentUniformSelection selection,
}) {
  return validateUniformSelection(category: category, selection: selection) ==
      null;
}

bool categoryRequiresUniform(TournamentCategoryOffer category) {
  final t = category.uniformType?.trim() ?? 'none';
  return t == 'top_only' || t == 'top' || t == 'full';
}

bool categoryRequiresShorts(TournamentCategoryOffer category) =>
    category.uniformType == 'full';

/// Nome padrão na camisa: apelido, ou sobrenome quando há nome completo.
String? defaultJerseyNameForAthlete({
  String? fullName,
  String? nickname,
}) {
  final nick = nickname?.trim();
  if (nick != null && nick.isNotEmpty) return nick;
  final full = fullName?.trim();
  if (full == null || full.isEmpty) return null;
  final parts = full.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return null;
  return parts.length > 1 ? parts.last : parts.first;
}

TournamentUniformSelection defaultUniformSelectionForCategory(
  TournamentCategoryOffer category, {
  String? athleteName,
  String? athleteNickname,
}) {
  final tops = uniformSizeOptionsTopForCategory(category);
  final shorts = uniformSizeOptionsShortsForCategory(category);
  return TournamentUniformSelection(
    sizeTop: tops.contains('M') ? 'M' : tops.first,
    sizeShorts: categoryRequiresShorts(category)
        ? (shorts.contains('M') ? 'M' : shorts.first)
        : null,
    jerseyNumber: category.uniformNumberOnShirt ? 10 : null,
    jerseyName: category.uniformNameOnShirt
        ? defaultJerseyNameForAthlete(
            fullName: athleteName,
            nickname: athleteNickname,
          )
        : null,
  );
}

const _emptyUniformSelection = TournamentUniformSelection();

/// Slot de uniforme do atleta a partir dos campos crus da inscrição.
///
/// Três caminhos do backend criam a inscrição de jeitos diferentes:
/// `registerSoloTournament` grava `player1Id`; aceitar convite anexando ao solo
/// faz `arrayUnion` (convidado no índice 1); aceitar convite SEM solo prévio
/// grava `participantUids: [inviter, convidado]` e nenhum `player1Id` — daí o
/// fallback pelo índice. Categoria de EQUIPE (trio+) não tem slots fixos: o
/// uniforme mora em `uniformByUid.{uid}`.
///
/// A regra vive aqui, sobre primitivos, porque duas leituras precisam dela — a
/// lista de inscrições e a tela de inscrição — e duas cópias divergiriam.
TournamentUniformSelection uniformSlotFor({
  required String uid,
  int? teamSize,
  Map<String, TournamentUniformSelection> uniformByUid = const {},
  String? player1Id,
  List<String> participantUids = const [],
  TournamentUniformSelection? uniformPlayer1,
  TournamentUniformSelection? uniformPlayer2,
}) {
  if (teamSize != null) {
    return uniformByUid[uid] ?? _emptyUniformSelection;
  }
  if (player1Id == uid) {
    return uniformPlayer1 ?? _emptyUniformSelection;
  }
  if (participantUids.isNotEmpty && participantUids.first == uid) {
    return uniformPlayer1 ?? _emptyUniformSelection;
  }
  return uniformPlayer2 ?? _emptyUniformSelection;
}

/// Slot de uniforme no formato do doc (`{sizeTop, sizeShorts, jerseyNumber,
/// jerseyName}`); `null` quando o campo não existe ou não é um mapa.
TournamentUniformSelection? uniformSelectionFromDoc(dynamic raw) {
  if (raw is! Map) return null;
  final number = raw['jerseyNumber'];
  return TournamentUniformSelection(
    sizeTop: (raw['sizeTop'] as String?)?.trim(),
    sizeShorts: (raw['sizeShorts'] as String?)?.trim(),
    jerseyNumber: number is num ? number.toInt() : null,
    jerseyName: (raw['jerseyName'] as String?)?.trim(),
  );
}

Map<String, TournamentUniformSelection> uniformByUidFromDoc(dynamic raw) {
  if (raw is! Map) return const {};
  final result = <String, TournamentUniformSelection>{};
  for (final entry in raw.entries) {
    final uid = entry.key;
    if (uid is! String || uid.trim().isEmpty) continue;
    final slot = uniformSelectionFromDoc(entry.value);
    if (slot != null) result[uid.trim()] = slot;
  }
  return result;
}

/// Seleção que a tela deve abrir: o que JÁ está gravado na inscrição manda,
/// e só o que falta vem dos padrões.
///
/// Sem isso o cartão de uniforme abria em M/10/sobrenome mesmo para quem tinha
/// escolhido GG por outra superfície — e salvar de novo apagava a escolha real.
/// A união é campo a campo de propósito: a vaga nasce sem uniforme
/// (`uniform: null`) e pode ter sido preenchida pela metade depois.
TournamentUniformSelection hydrateUniformSelection({
  required TournamentUniformSelection? stored,
  required TournamentUniformSelection defaults,
}) {
  if (stored == null) return defaults;
  final storedName = stored.jerseyName?.trim();
  return TournamentUniformSelection(
    sizeTop: stored.sizeTop ?? defaults.sizeTop,
    sizeShorts: stored.sizeShorts ?? defaults.sizeShorts,
    jerseyNumber: stored.jerseyNumber ?? defaults.jerseyNumber,
    jerseyName: (storedName != null && storedName.isNotEmpty)
        ? storedName
        : defaults.jerseyName,
  );
}

TournamentUniformSelection fillJerseyNameDefaultIfNeeded({
  required TournamentCategoryOffer category,
  required TournamentUniformSelection selection,
  String? athleteName,
  String? athleteNickname,
}) {
  if (!category.uniformNameOnShirt) return selection;
  final existing = selection.jerseyName?.trim() ?? '';
  if (existing.isNotEmpty) return selection;
  final defaultName = defaultJerseyNameForAthlete(
    fullName: athleteName,
    nickname: athleteNickname,
  );
  if (defaultName == null) return selection;
  return selection.copyWith(jerseyName: defaultName);
}

/// Evita enviar uniforme parcial ao backend (ex.: tamanho sem nome na camisa).
TournamentUniformSelection? uniformPayloadForPartnerInvite({
  required TournamentCategoryOffer category,
  required TournamentUniformSelection selection,
}) {
  if (!categoryRequiresUniform(category)) return null;
  if (!isUniformSelectionComplete(category: category, selection: selection)) {
    return null;
  }
  return selection;
}
