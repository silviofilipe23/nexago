import 'package:flutter/foundation.dart';

@immutable
class OrganizerUniformCategoryConfig {
  const OrganizerUniformCategoryConfig({
    required this.categoryId,
    required this.name,
    this.uniformType = 'none',
    this.uniformNumberOnShirt = false,
    this.uniformNameOnShirt = false,
    this.sizeOptionsTop = const [],
  });

  final String categoryId;
  final String name;
  final String uniformType;
  final bool uniformNumberOnShirt;
  final bool uniformNameOnShirt;
  final List<String> sizeOptionsTop;

  bool get requiresUniform {
    final t = uniformType.trim();
    return t == 'top_only' || t == 'top' || t == 'full';
  }
}

@immutable
class OrganizerUniformAthleteRow {
  const OrganizerUniformAthleteRow({
    required this.athleteUid,
    required this.athleteName,
    required this.initials,
    this.avatarUrl,
    required this.categoryId,
    required this.categoryLabel,
    required     this.partnerShortName,
    this.athleteFullName,
    this.sizeTop,
    this.jerseyNumber,
    this.jerseyName,
    required this.isComplete,
  });

  final String athleteUid;
  final String athleteName;
  final String initials;
  final String? avatarUrl;
  final String categoryId;
  final String categoryLabel;
  final String partnerShortName;
  final String? athleteFullName;
  final String? sizeTop;
  final int? jerseyNumber;
  final String? jerseyName;
  final bool isComplete;
}

@immutable
class OrganizerUniformsSummary {
  const OrganizerUniformsSummary({
    this.totalAthletes = 0,
    this.confirmedCount = 0,
    this.pendingCount = 0,
    this.countBySize = const {},
    this.pendingWithoutSize = 0,
    this.sizeOrder = const [],
  });

  final int totalAthletes;
  final int confirmedCount;
  final int pendingCount;
  final Map<String, int> countBySize;
  final int pendingWithoutSize;
  final List<String> sizeOrder;

  int get confirmedPercent =>
      totalAthletes <= 0 ? 0 : ((confirmedCount * 100) / totalAthletes).round();
}

@immutable
class OrganizerUniformsFilter {
  const OrganizerUniformsFilter({
    this.categoryId,
    this.sizeTop,
    this.pendingOnly = false,
  });

  final String? categoryId;
  final String? sizeTop;
  final bool pendingOnly;

  bool get hasActiveFilter =>
      pendingOnly ||
      (categoryId != null && categoryId!.isNotEmpty) ||
      (sizeTop != null && sizeTop!.isNotEmpty);

  OrganizerUniformsFilter copyWith({
    String? categoryId,
    String? sizeTop,
    bool? pendingOnly,
    bool clearCategoryId = false,
    bool clearSizeTop = false,
  }) {
    return OrganizerUniformsFilter(
      categoryId: clearCategoryId ? null : (categoryId ?? this.categoryId),
      sizeTop: clearSizeTop ? null : (sizeTop ?? this.sizeTop),
      pendingOnly: pendingOnly ?? this.pendingOnly,
    );
  }
}

@immutable
class OrganizerUniformCategoryChip {
  const OrganizerUniformCategoryChip({
    required this.categoryId,
    required this.label,
    required this.athleteCount,
  });

  final String categoryId;
  final String label;
  final int athleteCount;
}

@immutable
class OrganizerUniformsState {
  const OrganizerUniformsState({
    this.isLoading = true,
    this.isUniformEnabled = false,
    this.tournamentName = '',
    this.locationLine = '',
    this.rows = const [],
    this.summary = const OrganizerUniformsSummary(),
    this.categoryChips = const [],
    this.categoryConfigs = const [],
    this.error,
  });

  final bool isLoading;
  final bool isUniformEnabled;
  final String tournamentName;
  final String locationLine;
  final List<OrganizerUniformAthleteRow> rows;
  final OrganizerUniformsSummary summary;
  final List<OrganizerUniformCategoryChip> categoryChips;
  final List<OrganizerUniformCategoryConfig> categoryConfigs;
  final Object? error;

  static const empty = OrganizerUniformsState(isLoading: false);

  OrganizerUniformsState copyWith({
    bool? isLoading,
    bool? isUniformEnabled,
    String? tournamentName,
    String? locationLine,
    List<OrganizerUniformAthleteRow>? rows,
    OrganizerUniformsSummary? summary,
    List<OrganizerUniformCategoryChip>? categoryChips,
    List<OrganizerUniformCategoryConfig>? categoryConfigs,
    Object? error,
  }) {
    return OrganizerUniformsState(
      isLoading: isLoading ?? this.isLoading,
      isUniformEnabled: isUniformEnabled ?? this.isUniformEnabled,
      tournamentName: tournamentName ?? this.tournamentName,
      locationLine: locationLine ?? this.locationLine,
      rows: rows ?? this.rows,
      summary: summary ?? this.summary,
      categoryChips: categoryChips ?? this.categoryChips,
      categoryConfigs: categoryConfigs ?? this.categoryConfigs,
      error: error,
    );
  }
}
