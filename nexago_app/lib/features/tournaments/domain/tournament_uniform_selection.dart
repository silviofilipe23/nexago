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
