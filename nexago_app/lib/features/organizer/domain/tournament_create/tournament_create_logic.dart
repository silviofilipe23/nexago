import 'package:intl/intl.dart';

import 'tournament_create_draft.dart';

final _currencyFmt = NumberFormat.currency(locale: 'pt_BR', symbol: r'R$');

String sportLabel(TournamentSport sport) => switch (sport) {
  TournamentSport.beachVolleyball => 'Vôlei de praia',
  TournamentSport.indoorVolleyball => 'Vôlei de quadra',
  TournamentSport.footvolley => 'Futevôlei',
};

String bracketSystemLabel(TournamentBracketSystem system) => switch (system) {
  TournamentBracketSystem.groupsThenKnockout => 'Fase de grupos + mata-mata',
  TournamentBracketSystem.singleElimination => 'Mata-mata (chave simples)',
  TournamentBracketSystem.roundRobin => 'Todos contra todos',
  TournamentBracketSystem.groupsWithRepechage => 'Grupos + repescagem',
  TournamentBracketSystem.doubleElimination => 'Dupla eliminatória',
};

String bracketSystemShortLabel(TournamentBracketSystem system) =>
    switch (system) {
      TournamentBracketSystem.groupsThenKnockout => 'Grupos + SE',
      TournamentBracketSystem.singleElimination => 'Chave simples',
      TournamentBracketSystem.roundRobin => 'Pontos corridos',
      TournamentBracketSystem.groupsWithRepechage => 'Grupos + repescagem',
      TournamentBracketSystem.doubleElimination => 'Dupla eliminatória',
    };

String bracketSystemDescription(
  TournamentBracketSystem system,
) => switch (system) {
  TournamentBracketSystem.groupsThenKnockout =>
    'Grupos classificatórios e depois eliminatória. O mais comum em torneios de praia.',
  TournamentBracketSystem.singleElimination =>
    'Eliminação direta do início ao fim.',
  TournamentBracketSystem.roundRobin => 'Pontos corridos — todos se enfrentam.',
  TournamentBracketSystem.groupsWithRepechage =>
    'Quem perde cedo ganha uma segunda chance.',
  TournamentBracketSystem.doubleElimination =>
    'Dupla eliminatória — sem fase de grupos.',
};

String bestOfLabel(TournamentBestOf bestOf) => switch (bestOf) {
  TournamentBestOf.singleSet => 'Set único',
  TournamentBestOf.bestOf3 => 'MD3',
  TournamentBestOf.bestOf5 => 'MD5',
};

String paymentModeLabel(TournamentPaymentMode mode) => switch (mode) {
  TournamentPaymentMode.appPixCard => 'Pelo app — Pix e cartão',
  TournamentPaymentMode.directWithOrganizer => 'Direto com o organizador',
};

String paymentModeDescription(TournamentPaymentMode mode) => switch (mode) {
  TournamentPaymentMode.appPixCard =>
    'O atleta paga na inscrição. Repasse em D+2.',
  TournamentPaymentMode.directWithOrganizer =>
    'Você combina e recebe por fora. O app só reserva a vaga.',
};

String visibilityLabel(TournamentVisibility visibility) => switch (visibility) {
  TournamentVisibility.publicListing => 'Público',
  TournamentVisibility.linkOnly => 'Por link',
};

String visibilityDescription(TournamentVisibility visibility) =>
    switch (visibility) {
      TournamentVisibility.publicListing =>
        'Aparece na busca e no Competir para todos.',
      TournamentVisibility.linkOnly =>
        'Só quem tem o link consegue ver e se inscrever.',
    };

String categoryGenderLabel(TournamentCategoryGender gender) => switch (gender) {
  TournamentCategoryGender.male => 'Masculino',
  TournamentCategoryGender.female => 'Feminino',
  TournamentCategoryGender.mixed => 'Misto',
};

String categoryGenderShort(TournamentCategoryGender gender) => switch (gender) {
  TournamentCategoryGender.male => 'Masc',
  TournamentCategoryGender.female => 'Fem',
  TournamentCategoryGender.mixed => 'Misto',
};

/// Por enquanto o wizard suporta apenas categorias de dupla.
const supportedCategoryDisputes = [TournamentCategoryDispute.dupla];

String categoryDisputeLabel(TournamentCategoryDispute dispute) => 'Dupla';

String categoryDisputeShort(TournamentCategoryDispute dispute) => 'Dupla';

String ageBandLabel(TournamentAgeBand band) => switch (band) {
  TournamentAgeBand.open => 'Livre',
  TournamentAgeBand.sub19 => 'Sub-19',
  TournamentAgeBand.sub23 => 'Sub-23',
  TournamentAgeBand.plus30 => '+30',
  TournamentAgeBand.plus35 => '+35',
  TournamentAgeBand.plus40 => '+40',
};

String skillLevelLabel(TournamentSkillLevel level) => switch (level) {
  TournamentSkillLevel.beginner => 'Iniciante',
  TournamentSkillLevel.intermediate => 'Intermediário',
  TournamentSkillLevel.advanced => 'Avançado',
  TournamentSkillLevel.open => 'Open',
};

String formatCents(int cents) => _currencyFmt.format(cents / 100);

String formatReais(double value) => _currencyFmt.format(value);

String spotsUnitLabel(TournamentCategoryDispute dispute, int spots) {
  final unit = switch (dispute) {
    TournamentCategoryDispute.individual => spots == 1 ? 'atleta' : 'atletas',
    TournamentCategoryDispute.dupla => spots == 1 ? 'dupla' : 'duplas',
    TournamentCategoryDispute.team => spots == 1 ? 'equipe' : 'equipes',
  };
  return '$spots $unit';
}

String suggestCategoryName(TournamentCategoryDraft category) {
  final parts = <String>[
    categoryGenderLabel(category.gender),
    if (category.ageBand != TournamentAgeBand.open)
      ageBandLabel(category.ageBand),
    if (category.skillLevel != TournamentSkillLevel.open)
      skillLevelLabel(category.skillLevel),
  ];
  return parts.join(' ').trim();
}

String bracketSystemCardLabel(TournamentBracketSystem system) =>
    switch (system) {
      TournamentBracketSystem.groupsThenKnockout => 'Grupos+SE',
      TournamentBracketSystem.singleElimination => 'Chave simples',
      TournamentBracketSystem.roundRobin => 'Pontos corridos',
      TournamentBracketSystem.groupsWithRepechage => 'Grupos+rep.',
      TournamentBracketSystem.doubleElimination => 'Dupla elim.',
    };

String categoryFormatLabel(TournamentCategoryDraft category) =>
    bracketSystemShortLabel(category.bracketSystem);

String categoryFormatSummary(TournamentCategoryDraft category) {
  final format = bracketSystemShortLabel(category.bracketSystem);
  final sets = bestOfLabel(category.bestOf);
  return '$format · $sets';
}

String categoryFormatCardLabel(TournamentCategoryDraft category) {
  final format = bracketSystemCardLabel(category.bracketSystem);
  final sets = bestOfLabel(category.bestOf);
  return '$format · $sets';
}

List<String> categoryTags(TournamentCategoryDraft category) {
  return [
    categoryGenderShort(category.gender),
    categoryDisputeShort(category.dispute),
    if (category.ageBand != TournamentAgeBand.open)
      ageBandLabel(category.ageBand),
    if (category.skillLevel != TournamentSkillLevel.open)
      skillLevelLabel(category.skillLevel),
  ];
}

int categoryPrizeTotalCents(TournamentCategoryDraft category) =>
    category.prizes.fold<int>(0, (sum, p) => sum + p.valueCents);

String formatStepLabel(TournamentCreateStep step) =>
    'PASSO ${step.number} DE ${TournamentCreateStepX.total}';

String stepTitle(TournamentCreateStep step) => switch (step) {
  TournamentCreateStep.identity => 'Identidade do torneio',
  TournamentCreateStep.location => 'Local e datas',
  TournamentCreateStep.categories => 'Categorias',
  TournamentCreateStep.registration => 'Inscrições',
  TournamentCreateStep.prizes => 'Premiação',
  TournamentCreateStep.rules => 'Regulamento & ranking',
  TournamentCreateStep.review => 'Tudo pronto?',
};

String stepSubtitle(TournamentCreateStep step) => switch (step) {
  TournamentCreateStep.identity =>
    'O básico que aparece para os atletas na busca.',
  TournamentCreateStep.location => 'Onde e quando o torneio acontece.',
  TournamentCreateStep.categories =>
    'Cada categoria roda sua própria chave, formato, vagas e preço.',
  TournamentCreateStep.registration =>
    'Janela de inscrição e como você recebe.',
  TournamentCreateStep.prizes =>
    'Cada categoria tem sua própria premiação — ajuste uma a uma.',
  TournamentCreateStep.rules => 'Regras oficiais e quanto vale no ranking.',
  TournamentCreateStep.review =>
    'Revise antes de publicar. Dá pra editar qualquer parte depois.',
};

String formatShortDate(DateTime? date) {
  if (date == null) return '—';
  return DateFormat('dd MMM', 'pt_BR').format(date);
}

String formatDateRange(DateTime? start, DateTime? end) {
  if (start == null) return 'Data a confirmar';
  if (end == null) return formatShortDate(start);
  final sameDay =
      start.year == end.year &&
      start.month == end.month &&
      start.day == end.day;
  if (sameDay) return formatShortDate(start);
  return '${formatShortDate(start)} – ${formatShortDate(end)}';
}

String formatLongDateRange(DateTime? start, DateTime? end) {
  if (start == null) return 'Data a confirmar';
  final startFmt = DateFormat("d 'de' MMMM", 'pt_BR').format(start);
  if (end == null) return startFmt;
  if (start.year == end.year &&
      start.month == end.month &&
      start.day == end.day) {
    return startFmt;
  }
  final endFmt = DateFormat("d 'de' MMMM", 'pt_BR').format(end);
  return '$startFmt a $endFmt';
}

String formatFirstMatchLabel(DateTime? dateTime) {
  if (dateTime == null) return 'Horário a definir';
  final day = DateFormat('EEEE', 'pt_BR').format(dateTime);
  final time = DateFormat('HH:mm').format(dateTime);
  final capitalized = day.isEmpty
      ? day
      : '${day[0].toUpperCase()}${day.substring(1)}';
  return '$capitalized · $time';
}

bool canContinueFromStep(
  TournamentCreateDraft draft,
  TournamentCreateStep step,
) {
  return switch (step) {
    TournamentCreateStep.identity => draft.name.trim().isNotEmpty,
    TournamentCreateStep.location =>
      draft.locationName.trim().isNotEmpty &&
          draft.city.trim().isNotEmpty &&
          draft.startAt != null &&
          draft.endAt != null &&
          !draft.endAt!.isBefore(draft.startAt!) &&
          draft.courtsCount > 0,
    TournamentCreateStep.categories => draft.categories.isNotEmpty,
    TournamentCreateStep.registration =>
      draft.registrationOpensAt != null &&
          draft.registrationClosesAt != null &&
          !draft.registrationClosesAt!.isBefore(draft.registrationOpensAt!),
    TournamentCreateStep.prizes =>
      !draft.cashPrizesEnabled ||
          draft.categories.every(
            (c) => !draft.cashPrizesEnabled || c.prizes.isNotEmpty,
          ),
    TournamentCreateStep.rules => true,
    TournamentCreateStep.review => isValidForPublish(draft),
  };
}

bool isValidForPublish(TournamentCreateDraft draft) {
  for (final step in TournamentCreateStep.values) {
    if (step == TournamentCreateStep.review) continue;
    if (!canContinueFromStep(draft, step)) return false;
  }
  return true;
}

bool hasMeaningfulLocalDraft(TournamentCreateDraft draft) =>
    draft.name.trim().isNotEmpty;

TournamentCreateStep inferResumeStep(TournamentCreateDraft draft) {
  for (final step in TournamentCreateStep.values) {
    if (step == TournamentCreateStep.review) continue;
    if (!canContinueFromStep(draft, step)) return step;
  }
  return TournamentCreateStep.review;
}

TournamentCreateStep? parseWizardStep(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  if (raw == 'format') return TournamentCreateStep.categories;
  for (final step in TournamentCreateStep.values) {
    if (step.name == raw) return step;
  }
  return null;
}

List<TournamentCategoryPrizeDraft> defaultCategoryPrizes(int totalCents) {
  if (totalCents <= 0) return const [];
  final first = (totalCents * 0.5).round();
  final second = (totalCents * 0.3125).round();
  final third = totalCents - first - second;
  return [
    TournamentCategoryPrizeDraft(
      position: '1',
      valueCents: first,
      label: 'Campeão',
    ),
    TournamentCategoryPrizeDraft(
      position: '2',
      valueCents: second,
      label: 'Vice-campeão',
    ),
    TournamentCategoryPrizeDraft(
      position: '3',
      valueCents: third,
      label: 'Terceiro lugar',
    ),
  ];
}

String bracketFormatFirestoreValue(TournamentBracketSystem system) =>
    switch (system) {
      TournamentBracketSystem.groupsThenKnockout => 'groups_knockout',
      TournamentBracketSystem.singleElimination => 'single_elimination',
      TournamentBracketSystem.roundRobin => 'round_robin',
      TournamentBracketSystem.groupsWithRepechage => 'groups_repechage',
      TournamentBracketSystem.doubleElimination => 'double_elimination',
    };

/// Resolve o sistema de chave a partir do valor salvo no Firestore ou legado.
TournamentBracketSystem? bracketSystemFromRaw(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;

  for (final value in TournamentBracketSystem.values) {
    if (value.name == trimmed) return value;
  }

  final n = trimmed.toLowerCase();
  return switch (n) {
    'groups_knockout' ||
    'groups_then_knockout' ||
    'pool play + se' ||
    'pool play+se' =>
      TournamentBracketSystem.groupsThenKnockout,
    'single_elimination' || 'single elimination' =>
      TournamentBracketSystem.singleElimination,
    'round_robin' || 'round robin' => TournamentBracketSystem.roundRobin,
    'groups_repechage' ||
    'groups_with_repechage' ||
    'groups with repechage' =>
      TournamentBracketSystem.groupsWithRepechage,
    'double_elimination' || 'double elimination' =>
      TournamentBracketSystem.doubleElimination,
    _ when n.contains('pool') &&
            (n.contains('se') || n.contains('mata') || n.contains('elim')) =>
      TournamentBracketSystem.groupsThenKnockout,
    _ when n.contains('grupos') && n.contains('mata') =>
      TournamentBracketSystem.groupsThenKnockout,
    _ when n.contains('group cross') || n.contains('play-in') =>
      TournamentBracketSystem.groupsThenKnockout,
    _ when n.contains('dupla') && n.contains('elim') =>
      TournamentBracketSystem.doubleElimination,
    _ => null,
  };
}

String bracketFormatLabelFromRaw(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  final system = bracketSystemFromRaw(trimmed);
  if (system != null) return bracketSystemLabel(system);
  return trimmed;
}

String bracketFormatShortLabelFromRaw(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  final system = bracketSystemFromRaw(trimmed);
  if (system != null) return bracketSystemShortLabel(system);
  return trimmed;
}

String genderTypeFirestoreValue(TournamentCategoryGender gender) =>
    switch (gender) {
      TournamentCategoryGender.male => 'male',
      TournamentCategoryGender.female => 'female',
      TournamentCategoryGender.mixed => 'mixed',
    };

String reviewSportSummary(TournamentCreateDraft draft) =>
    sportLabel(draft.sport);

String reviewCategoriesDetailSummary(TournamentCreateDraft draft) {
  if (draft.categories.isEmpty) return 'Nenhuma categoria';
  return draft.categories
      .map((c) {
        final name = c.name.trim().isEmpty ? suggestCategoryName(c) : c.name.trim();
        return '$name · ${categoryFormatSummary(c)}';
      })
      .join('\n');
}

String reviewLocationSummary(TournamentCreateDraft draft) {
  final location = draft.locationName.trim();
  final city = draft.city.trim();
  final dates = formatLongDateRange(draft.startAt, draft.endAt);
  final courts = draft.courtsCount == 1
      ? '1 quadra'
      : '${draft.courtsCount} quadras';
  return '$location, $city · $dates · $courts';
}

String reviewCategoriesSummary(TournamentCreateDraft draft) {
  final count = draft.categories.length;
  final spots = draft.totalSpots;
  return '$count categorias · $spots vagas no total';
}

String reviewRegistrationSummary(TournamentCreateDraft draft) {
  final period =
      '${formatShortDate(draft.registrationOpensAt)}–${formatShortDate(draft.registrationClosesAt)}';
  final payment = draft.paymentMode == TournamentPaymentMode.appPixCard
      ? 'Pix e cartão pelo app'
      : 'pagamento direto';
  final waitlist = draft.waitlistEnabled
      ? 'lista de espera ativa'
      : 'sem lista de espera';
  return '$period · $payment · $waitlist';
}

String reviewPrizesSummary(TournamentCreateDraft draft) {
  if (!draft.cashPrizesEnabled)
    return 'Troféus/brindes (sem premiação em dinheiro)';
  return 'Por categoria · ${formatCents(draft.totalPrizeCents)} no total · 1º ao 3º';
}

String reviewUniformSummary(TournamentCreateDraft draft) {
  if (!draft.uniformRequired) return 'Sem kit na inscrição';
  final parts = <String>['Kit na inscrição'];
  if (draft.uniformNumberOnShirt) parts.add('número');
  if (draft.uniformNameOnShirt) parts.add('nome na camisa');
  return parts.join(' · ');
}

String reviewRankingSummary(TournamentCreateDraft draft) {
  if (!draft.rankingEnabled) return 'Não vale pontos no ranking';
  return 'Vale pontos · tabela padrão nexaGO';
}

String rankingTableLabel(String id) => switch (id) {
  'nexago_standalone' => 'Padrão nexaGO · Etapa avulsa',
  _ => id,
};

const defaultRankingPointsPreview = <String, int>{
  '1º': 450,
  '2º': 280,
  '3º': 180,
  '4º': 120,
  'Quartas': 80,
  'Fase de grupos': 40,
};
