import '../../../tournaments/data/tournament_inscriptions_repository.dart';
import '../../../tournaments/domain/app_user_profile.dart';
import '../../../tournaments/domain/tournament_uniform_selection.dart';
import 'tournament_uniforms_models.dart';

List<String> defaultUniformSizeOrder() => List<String>.from(
  kDefaultUniformSizeOptionsTop,
);

List<OrganizerUniformCategoryConfig> parseUniformCategoryConfigs(
  dynamic categoriesRaw,
) {
  if (categoriesRaw is! List) return const [];
  final configs = <OrganizerUniformCategoryConfig>[];
  for (final item in categoriesRaw) {
    if (item is! Map) continue;
    final map = Map<String, dynamic>.from(item);
    final categoryId =
        (map['id'] as String?)?.trim() ??
        (map['categoryId'] as String?)?.trim() ??
        (map['categoryName'] as String?)?.trim() ??
        '';
    if (categoryId.isEmpty) continue;
    final name =
        (map['categoryName'] as String?)?.trim() ??
        (map['name'] as String?)?.trim() ??
        categoryId;
    final uniformType = (map['uniformType'] as String?)?.trim() ?? 'none';
    final sizeRaw = map['uniformSizeOptionsTop'];
    final sizeOptions = sizeRaw is List
        ? sizeRaw
            .whereType<String>()
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toList()
        : <String>[];
    configs.add(
      OrganizerUniformCategoryConfig(
        categoryId: categoryId,
        name: name,
        uniformType: uniformType,
        uniformNumberOnShirt: map['uniformNumberOnShirt'] == true,
        uniformNameOnShirt: map['uniformNameOnShirt'] == true,
        sizeOptionsTop: sizeOptions,
      ),
    );
  }
  return configs;
}

bool tournamentUniformEnabled({
  required Map<String, dynamic>? tournament,
  required List<OrganizerUniformCategoryConfig> categoryConfigs,
}) {
  if (tournament?['uniformRequired'] == true) return true;
  return categoryConfigs.any((c) => c.requiresUniform);
}

OrganizerUniformCategoryConfig? uniformConfigForCategory(
  List<OrganizerUniformCategoryConfig> configs,
  String categoryId,
) {
  final id = categoryId.trim();
  for (final config in configs) {
    if (config.categoryId == id) return config;
  }
  return null;
}

List<String> uniformSizeOrderForConfigs(
  List<OrganizerUniformCategoryConfig> configs,
) {
  final merged = <String>{};
  for (final config in configs) {
    if (!config.requiresUniform) continue;
    final options = config.sizeOptionsTop;
    if (options.isNotEmpty) {
      merged.addAll(options);
    } else {
      merged.addAll(kDefaultUniformSizeOptionsTop);
    }
  }
  if (merged.isEmpty) return defaultUniformSizeOrder();
  final ordered = <String>[];
  for (final size in defaultUniformSizeOrder()) {
    if (merged.contains(size)) ordered.add(size);
  }
  for (final size in merged) {
    if (!ordered.contains(size)) ordered.add(size);
  }
  return ordered;
}

/// Ordem de tamanhos para o gráfico: uma categoria usa só as opções dela
/// (ex.: masculino vs feminino); sem filtro, mescla todas as categorias.
List<String> uniformSizeOrderForCategoryFilter(
  List<OrganizerUniformCategoryConfig> configs, {
  String? categoryId,
}) {
  final id = categoryId?.trim();
  if (id != null && id.isNotEmpty) {
    final config = uniformConfigForCategory(configs, id);
    if (config != null) {
      if (config.sizeOptionsTop.isNotEmpty) {
        return List<String>.from(config.sizeOptionsTop);
      }
      if (config.requiresUniform) return defaultUniformSizeOrder();
    }
  }
  return uniformSizeOrderForConfigs(configs);
}

bool isUniformRowComplete({
  required OrganizerUniformCategoryConfig config,
  required String? sizeTop,
  required int? jerseyNumber,
  String? jerseyName,
}) {
  final top = sizeTop?.trim() ?? '';
  if (top.isEmpty) return false;
  final options = config.sizeOptionsTop.isNotEmpty
      ? config.sizeOptionsTop
      : kDefaultUniformSizeOptionsTop;
  if (!options.contains(top)) return false;
  if (config.uniformNumberOnShirt) {
    final n = jerseyNumber;
    if (n == null || n < 1 || n > 99) return false;
  }
  if (config.uniformNameOnShirt) {
    final name = jerseyName?.trim() ?? '';
    if (name.isEmpty) return false;
  }
  return true;
}

String shortDisplayName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return '';
  if (parts.length == 1) return parts.first;
  final last = parts.last;
  if (last.isEmpty) return parts.first;
  return '${parts.first} ${last[0].toUpperCase()}.';
}

/// Rótulo principal na lista de uniformes: apelido quando existir.
String uniformAthleteDisplayLabel(AppUserProfile? profile) {
  if (profile == null) return 'Atleta';
  final nick = readableNicknameCandidate(profile.nickname);
  if (nick != null) return nick;
  return resolveAppUserDisplayName(profile, fallback: 'Atleta');
}

/// Nome completo na linha secundária quando diferente do apelido exibido.
String? uniformAthleteFullNameSubtitle(AppUserProfile? profile) {
  if (profile == null) return null;
  final primary = uniformAthleteDisplayLabel(profile);
  final full = readableNameCandidate(profile.fullName);
  if (full != null && full != primary) return full;
  return null;
}

String? _readSizeTop(Map<String, dynamic> inscription, int playerIndex) {
  final key = playerIndex == 1 ? 'sizeTopPlayer1' : 'sizeTopPlayer2';
  final raw = inscription[key] as String?;
  final trimmed = raw?.trim() ?? '';
  return trimmed.isEmpty ? null : trimmed;
}

int? _readJerseyNumber(Map<String, dynamic> inscription, int playerIndex) {
  final key = playerIndex == 1 ? 'jerseyNumberPlayer1' : 'jerseyNumberPlayer2';
  final raw = inscription[key];
  if (raw is num) return raw.toInt();
  return null;
}

String? _readJerseyName(Map<String, dynamic> inscription, int playerIndex) {
  final key = playerIndex == 1 ? 'jerseyNamePlayer1' : 'jerseyNamePlayer2';
  final raw = inscription[key] as String?;
  final trimmed = raw?.trim() ?? '';
  return trimmed.isEmpty ? null : trimmed;
}

OrganizerUniformAthleteRow? _athleteRow({
  required String uid,
  required AppUserProfile? profile,
  required OrganizerUniformCategoryConfig config,
  required Map<String, dynamic> inscription,
  required int playerIndex,
  required String partnerName,
}) {
  final id = uid.trim();
  if (id.isEmpty) return null;
  final name = uniformAthleteDisplayLabel(profile);
  final fullName = uniformAthleteFullNameSubtitle(profile);
  final initials = profile != null ? appUserInitials(profile) : '?';
  final sizeTop = _readSizeTop(inscription, playerIndex);
  final jerseyNumber = _readJerseyNumber(inscription, playerIndex);
  final jerseyName = _readJerseyName(inscription, playerIndex);
  return OrganizerUniformAthleteRow(
    athleteUid: id,
    athleteName: name,
    initials: initials,
    avatarUrl: profile?.profilePhotoUrl,
    categoryId: config.categoryId,
    categoryLabel: config.name,
    partnerShortName: partnerName.isEmpty ? '' : 'c/ ${shortDisplayName(partnerName)}',
    athleteFullName: fullName,
    sizeTop: sizeTop,
    jerseyNumber: jerseyNumber,
    jerseyName: jerseyName,
    isComplete: isUniformRowComplete(
      config: config,
      sizeTop: sizeTop,
      jerseyNumber: jerseyNumber,
      jerseyName: jerseyName,
    ),
  );
}

List<OrganizerUniformAthleteRow> flattenInscriptionsToUniformRows({
  required List<OrganizerInscriptionWithTeam> inscriptions,
  required List<OrganizerUniformCategoryConfig> categoryConfigs,
  required Map<String, AppUserProfile> profilesByUid,
}) {
  final rows = <OrganizerUniformAthleteRow>[];
  for (final entry in inscriptions) {
    final inscription = entry.inscription;
    if (inscription['waitlist'] == true) continue;
    final categoryId = (inscription['categoryId'] as String?)?.trim() ?? '';
    final config = uniformConfigForCategory(categoryConfigs, categoryId);
    if (config == null || !config.requiresUniform) continue;

    final team = entry.team;
    if (team == null) continue;
    final p1Id = (team['player1Id'] as String?)?.trim() ?? '';
    final p2Id = (team['player2Id'] as String?)?.trim() ?? '';
    final p1Name = p1Id.isNotEmpty
        ? uniformAthleteDisplayLabel(
            profilesByUid[p1Id] ?? AppUserProfile(uid: p1Id),
          )
        : '';
    final p2Name = p2Id.isNotEmpty
        ? uniformAthleteDisplayLabel(
            profilesByUid[p2Id] ?? AppUserProfile(uid: p2Id),
          )
        : '';

    final row1 = _athleteRow(
      uid: p1Id,
      profile: profilesByUid[p1Id],
      config: config,
      inscription: inscription,
      playerIndex: 1,
      partnerName: p2Name,
    );
    if (row1 != null) rows.add(row1);

    final row2 = _athleteRow(
      uid: p2Id,
      profile: profilesByUid[p2Id],
      config: config,
      inscription: inscription,
      playerIndex: 2,
      partnerName: p1Name,
    );
    if (row2 != null) rows.add(row2);
  }

  rows.sort((a, b) {
    final cat = a.categoryLabel.compareTo(b.categoryLabel);
    if (cat != 0) return cat;
    return a.athleteName.compareTo(b.athleteName);
  });
  return rows;
}

OrganizerUniformsSummary buildUniformsSummary(
  List<OrganizerUniformAthleteRow> rows, {
  List<String> sizeOrder = const [],
}) {
  final order = sizeOrder.isNotEmpty ? sizeOrder : defaultUniformSizeOrder();
  final countBySize = <String, int>{for (final s in order) s: 0};
  var confirmed = 0;
  var pending = 0;

  for (final row in rows) {
    if (row.isComplete) {
      confirmed++;
      final size = row.sizeTop?.trim();
      if (size != null && size.isNotEmpty) {
        countBySize[size] = (countBySize[size] ?? 0) + 1;
      }
    } else {
      pending++;
    }
  }

  return OrganizerUniformsSummary(
    totalAthletes: rows.length,
    confirmedCount: confirmed,
    pendingCount: pending,
    countBySize: countBySize,
    pendingWithoutSize: pending,
    sizeOrder: order,
  );
}

List<OrganizerUniformCategoryChip> buildUniformCategoryChips(
  List<OrganizerUniformAthleteRow> rows,
) {
  final counts = <String, int>{};
  final labels = <String, String>{};
  for (final row in rows) {
    counts[row.categoryId] = (counts[row.categoryId] ?? 0) + 1;
    labels[row.categoryId] = row.categoryLabel;
  }
  final chips = counts.entries
      .map(
        (e) => OrganizerUniformCategoryChip(
          categoryId: e.key,
          label: labels[e.key] ?? e.key,
          athleteCount: e.value,
        ),
      )
      .toList();
  chips.sort((a, b) => a.label.compareTo(b.label));
  return chips;
}

List<OrganizerUniformAthleteRow> filterUniformRows(
  List<OrganizerUniformAthleteRow> rows, {
  String? categoryId,
  String? sizeTop,
  bool pendingOnly = false,
}) {
  final catFilter = categoryId?.trim();
  final sizeFilter = sizeTop?.trim();
  return rows.where((row) {
    if (catFilter != null && catFilter.isNotEmpty && row.categoryId != catFilter) {
      return false;
    }
    if (pendingOnly && row.isComplete) return false;
    if (sizeFilter != null && sizeFilter.isNotEmpty) {
      if (!row.isComplete) return false;
      if (row.sizeTop?.trim() != sizeFilter) return false;
    }
    return true;
  }).toList();
}

String buildUniformsExportCsv({
  required OrganizerUniformsSummary summary,
  required List<OrganizerUniformAthleteRow> rows,
  required String tournamentName,
}) {
  final buffer = StringBuffer();
  buffer.writeln('Torneio,$tournamentName');
  buffer.writeln('Total atletas,${summary.totalAthletes}');
  buffer.writeln('Confirmados,${summary.confirmedCount}');
  buffer.writeln('Pendentes,${summary.pendingCount}');
  buffer.writeln();
  buffer.writeln('Resumo por tamanho');
  buffer.writeln('Tamanho,Quantidade');
  for (final size in summary.sizeOrder) {
    final count = summary.countBySize[size] ?? 0;
    if (count > 0) buffer.writeln('$size,$count');
  }
  if (summary.pendingWithoutSize > 0) {
    buffer.writeln('Pendente sem escolha,${summary.pendingWithoutSize}');
  }
  buffer.writeln();
  buffer.writeln('Atletas');
  buffer.writeln('Nome,Categoria,Parceiro,Tamanho,Numero,NomeCamisa,Status');
  for (final row in rows) {
    final status = row.isComplete ? 'Confirmado' : 'Pendente';
    final size = row.sizeTop ?? '';
    final number = row.jerseyNumber?.toString() ?? '';
    final shirtName = row.jerseyName ?? '';
    buffer.writeln(
      '"${row.athleteName}","${row.categoryLabel}","${row.partnerShortName}","$size","$number","$shirtName","$status"',
    );
  }
  return buffer.toString();
}
