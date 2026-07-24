import 'package:intl/intl.dart';

import '../../../../core/formatting/app_currency_format.dart';
import 'tournament_create_draft.dart';

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

/// Formatos com geração de chave e operação dia D implementados.
const supportedBracketSystems = <TournamentBracketSystem>[
  TournamentBracketSystem.groupsThenKnockout,
  TournamentBracketSystem.singleElimination,
  TournamentBracketSystem.doubleElimination,
];

/// Formatos visíveis no wizard mas ainda sem backend completo.
const comingSoonBracketSystems = <TournamentBracketSystem>[
  TournamentBracketSystem.roundRobin,
  TournamentBracketSystem.groupsWithRepechage,
];

bool isBracketSystemSupported(TournamentBracketSystem system) =>
    supportedBracketSystems.contains(system);

bool isBracketFormatSupportedRaw(String raw) {
  final system = bracketSystemFromRaw(raw);
  return system != null && isBracketSystemSupported(system);
}

String unsupportedBracketSystemHint(TournamentBracketSystem system) =>
    switch (system) {
      TournamentBracketSystem.roundRobin =>
        'Pontos corridos estará disponível em breve. '
            'Use grupos + mata-mata, chave simples ou dupla eliminatória.',
      TournamentBracketSystem.groupsWithRepechage =>
        'Grupos com repescagem estará disponível em breve. '
            'Use grupos + mata-mata ou chave simples.',
      _ => 'Este formato de chave ainda não é suportado para publicação.',
    };

String? unsupportedBracketFormatHint(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  if (isBracketFormatSupportedRaw(trimmed)) return null;
  final system = bracketSystemFromRaw(trimmed);
  if (system != null) return unsupportedBracketSystemHint(system);
  return 'Formato de chave não suportado para geração automática.';
}

String publishBlockReasonForUnsupportedBrackets(TournamentCreateDraft draft) {
  for (final category in draft.categories) {
    if (!isBracketSystemSupported(category.bracketSystem)) {
      final label = category.name.trim().isNotEmpty
          ? category.name.trim()
          : 'sem nome';
      return 'A categoria "$label" usa '
          '${bracketSystemLabel(category.bracketSystem)}, '
          'ainda não suportado.';
    }
  }
  return '';
}

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

/// Dados PIX obrigatórios apenas no modo "pagar direto com o organizador".
/// Exige chave e nome do recebedor; cidade é opcional (default no BR Code).
bool organizerPixComplete(TournamentCreateDraft draft) {
  if (draft.paymentMode != TournamentPaymentMode.directWithOrganizer) {
    return true;
  }
  return draft.organizerPixKey.trim().isNotEmpty &&
      draft.organizerPixRecipientName.trim().isNotEmpty;
}

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
  TournamentAgeBand.sub13 => 'Sub-13',
  TournamentAgeBand.sub15 => 'Sub-15',
  TournamentAgeBand.sub17 => 'Sub-17',
  TournamentAgeBand.sub19 => 'Sub-19',
  TournamentAgeBand.sub21 => 'Sub-21',
  TournamentAgeBand.sub23 => 'Sub-23',
  TournamentAgeBand.plus30 => '+30',
  TournamentAgeBand.plus35 => '+35',
  TournamentAgeBand.plus40 => '+40',
  TournamentAgeBand.plus45 => '+45',
  TournamentAgeBand.plus50 => '+50',
  TournamentAgeBand.plus55 => '+55',
  TournamentAgeBand.plus60 => '+60',
};

String ageReferenceLabel(TournamentAgeReference reference) => switch (reference) {
  TournamentAgeReference.tournamentStart => 'Idade no início do torneio',
  TournamentAgeReference.yearEnd => 'Idade completada no ano (31/dez)',
  TournamentAgeReference.registration => 'Idade na data da inscrição',
};

String skillLevelLabel(TournamentSkillLevel level) => switch (level) {
  TournamentSkillLevel.beginner => 'Iniciante',
  TournamentSkillLevel.intermediate => 'Intermediário',
  TournamentSkillLevel.open => 'Open',
  TournamentSkillLevel.iniciante1 => 'Iniciante 1',
  TournamentSkillLevel.iniciante2 => 'Iniciante 2',
  TournamentSkillLevel.intermediario1 => 'Intermediário 1',
  TournamentSkillLevel.intermediario2 => 'Intermediário 2',
};

/// Escada única de 5 níveis para categorias novas de TODOS os esportes.
/// Categorias antigas com `Iniciante`/`Intermediário` continuam válidas
/// (ranks unificados no backend); o editor apenas deixa de oferecê-las.
List<TournamentSkillLevel> skillLevelOptionsForSport(TournamentSport sport) =>
    const [
      TournamentSkillLevel.iniciante1,
      TournamentSkillLevel.iniciante2,
      TournamentSkillLevel.intermediario1,
      TournamentSkillLevel.intermediario2,
      TournamentSkillLevel.open,
    ];

String formatCents(int cents) => formatBRLFromCents(cents);

String formatReais(double value) => formatBRL(value);

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
    prizeListTotalCents(category.prizes);

String formatStepLabel(TournamentCreateStep step) =>
    'PASSO ${step.number} DE ${TournamentCreateStepX.total}';

String tournamentWizardExitCategoryHighlight(int categoryCount) {
  if (categoryCount <= 0) return '';
  return categoryCount == 1 ? '1 categoria' : '$categoryCount categorias';
}

String tournamentWizardDiscardSubtitle(int categoryCount) {
  if (categoryCount <= 0) return 'Apaga os dados preenchidos.';
  if (categoryCount == 1) {
    return 'Apaga a categoria e os dados preenchidos.';
  }
  return 'Apaga as $categoryCount categorias e os dados preenchidos.';
}

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
    'Quanto e como cada categoria premia.',
  TournamentCreateStep.rules =>
    'Regras oficiais e quanto vale no ranking.',
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
          registrationWindowError(draft) == null &&
          organizerPixComplete(draft),
    // Com premiação em dinheiro, toda categoria precisa ter valores definidos.
    TournamentCreateStep.prizes =>
      !draft.cashPrizesEnabled ||
          draft.categories.every((c) => c.prizes.isNotEmpty),
    TournamentCreateStep.rules => true,
    TournamentCreateStep.review => isValidForPublish(draft),
  };
}

/// Monta um rascunho de torneio "express" (1 tela) já válido para publicação:
/// inscrições abrem hoje e fecham no início, sem premiação em dinheiro, com
/// uma única categoria de duplas em grupos+mata-mata. O organizador ajusta o
/// resto depois no torneio.
TournamentCreateDraft buildExpressTournamentDraft({
  required String name,
  required String locationName,
  required String city,
  String state = '',
  required DateTime startAt,
  DateTime? endAt,
  TournamentCategoryGender gender = TournamentCategoryGender.male,
  int spots = 16,
  DateTime? now,
}) {
  final reference = now ?? DateTime.now();
  final end = (endAt == null || endAt.isBefore(startAt)) ? startAt : endAt;
  return TournamentCreateDraft(
    name: name.trim(),
    locationName: locationName.trim(),
    city: city.trim(),
    state: state.trim(),
    startAt: startAt,
    endAt: end,
    courtsCount: 4,
    cashPrizesEnabled: false,
    registrationOpensAt: DateTime(
      reference.year,
      reference.month,
      reference.day,
    ),
    registrationClosesAt: startAt,
    categories: [
      TournamentCategoryDraft(
        id: reference.microsecondsSinceEpoch.toString(),
        gender: gender,
        spots: spots,
        bracketSystem: TournamentBracketSystem.groupsThenKnockout,
      ),
    ],
  );
}

/// Valida a janela de inscrição contra ela mesma e contra a data do torneio.
/// Retorna a mensagem de erro (para exibir na UI) ou `null` se estiver ok.
String? registrationWindowError(TournamentCreateDraft draft) {
  final opens = draft.registrationOpensAt;
  final closes = draft.registrationClosesAt;
  if (opens == null || closes == null) return null;
  if (closes.isBefore(opens)) {
    return 'O fechamento das inscrições não pode ser antes da abertura.';
  }
  final start = draft.startAt;
  if (start != null && closes.isAfter(start)) {
    return 'As inscrições não podem fechar depois do início do torneio.';
  }
  return null;
}

bool isValidForPublish(TournamentCreateDraft draft) {
  for (final step in TournamentCreateStep.values) {
    if (step == TournamentCreateStep.review) continue;
    if (!canContinueFromStep(draft, step)) return false;
  }
  return publishBlockReasonForUnsupportedBrackets(draft).isEmpty;
}

bool hasMeaningfulLocalDraft(TournamentCreateDraft draft) =>
    draft.name.trim().isNotEmpty;

bool isFirestoreDraftData(Map<String, dynamic> data) {
  for (final field in ['listingStatus', 'status']) {
    final raw = (data[field] as String?)?.trim().toLowerCase();
    if (raw == 'draft' || raw == 'rascunho') return true;
  }
  return false;
}

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

String defaultPrizeLabelForPosition(int position) => switch (position) {
      1 => 'Campeão',
      2 => 'Vice-campeão',
      3 => 'Terceiro lugar',
      _ => '$positionº lugar',
    };

int prizePositionNumber(String position) {
  final digits = RegExp(r'\d+').firstMatch(position)?.group(0);
  return int.tryParse(digits ?? '') ?? 0;
}

/// Próxima colocação após as já configuradas (lista vazia → 1º/Campeão).
TournamentCategoryPrizeDraft nextPrizeDraft(
  List<TournamentCategoryPrizeDraft> prizes,
) {
  var highest = 0;
  for (final prize in prizes) {
    final number = prizePositionNumber(prize.position);
    if (number > highest) highest = number;
  }
  final next = highest + 1;
  return TournamentCategoryPrizeDraft(
    position: '$next',
    valueCents: 0,
    label: defaultPrizeLabelForPosition(next),
  );
}

int prizeListTotalCents(List<TournamentCategoryPrizeDraft> prizes) =>
    prizes.fold<int>(0, (sum, p) => sum + p.valueCents);

/// Divisão sugerida em reais inteiros (os campos do editor aceitam apenas
/// reais); o 3º lugar absorve a diferença para preservar a soma.
List<TournamentCategoryPrizeDraft> defaultCategoryPrizes(int totalCents) {
  if (totalCents <= 0) return const [];
  final first = ((totalCents * 0.5) / 100).round() * 100;
  final second = ((totalCents * 0.3125) / 100).round() * 100;
  final third = totalCents - first - second;
  return [
    TournamentCategoryPrizeDraft(
      position: '1',
      valueCents: first,
      label: defaultPrizeLabelForPosition(1),
    ),
    TournamentCategoryPrizeDraft(
      position: '2',
      valueCents: second,
      label: defaultPrizeLabelForPosition(2),
    ),
    TournamentCategoryPrizeDraft(
      position: '3',
      valueCents: third,
      label: defaultPrizeLabelForPosition(3),
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
    'pool play+se' => TournamentBracketSystem.groupsThenKnockout,
    'single_elimination' ||
    'single elimination' => TournamentBracketSystem.singleElimination,
    'round_robin' || 'round robin' => TournamentBracketSystem.roundRobin,
    'groups_repechage' ||
    'groups_with_repechage' ||
    'groups with repechage' => TournamentBracketSystem.groupsWithRepechage,
    'double_elimination' ||
    'double elimination' => TournamentBracketSystem.doubleElimination,
    _
        when n.contains('pool') &&
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
        final name = c.name.trim().isEmpty
            ? suggestCategoryName(c)
            : c.name.trim();
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
  var places = 0;
  for (final category in draft.categories) {
    if (category.prizes.length > places) places = category.prizes.length;
  }
  final base = 'Por categoria · ${formatCents(draft.totalPrizeCents)} no total';
  return places > 1 ? '$base · 1º ao ${places}º' : base;
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
