import 'package:intl/intl.dart';

import '../../../../core/formatting/app_currency_format.dart';
import 'tournament_create_draft.dart';
import '../../../../core/sports/sport_catalog.dart';

String sportLabel(TournamentSport sport) =>
    SportCatalog.labelOf(sport.name) ?? sport.name;

String bracketSystemLabel(TournamentBracketSystem system) => switch (system) {
  TournamentBracketSystem.groupsThenKnockout => 'Fase de grupos + mata-mata',
  TournamentBracketSystem.singleElimination => 'Mata-mata (chave simples)',
  TournamentBracketSystem.roundRobin => 'Todos contra todos',
  TournamentBracketSystem.groupsWithRepechage => 'Grupos + repescagem',
  TournamentBracketSystem.doubleElimination => 'Dupla eliminatória',
  TournamentBracketSystem.kingOfCourt => 'King of the Court',
};

String bracketSystemShortLabel(TournamentBracketSystem system) =>
    switch (system) {
      TournamentBracketSystem.groupsThenKnockout => 'Grupos + SE',
      TournamentBracketSystem.singleElimination => 'Chave simples',
      TournamentBracketSystem.roundRobin => 'Pontos corridos',
      TournamentBracketSystem.groupsWithRepechage => 'Grupos + repescagem',
      TournamentBracketSystem.doubleElimination => 'Dupla eliminatória',
      TournamentBracketSystem.kingOfCourt => 'King of the Court',
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
  TournamentBracketSystem.kingOfCourt =>
    'Rodadas de 3 a 5 duplas na mesma quadra. Só quem está no trono pontua.',
};

/// Formatos com geração de chave e operação dia D implementados.
const supportedBracketSystems = <TournamentBracketSystem>[
  TournamentBracketSystem.groupsThenKnockout,
  TournamentBracketSystem.singleElimination,
  TournamentBracketSystem.doubleElimination,
  TournamentBracketSystem.kingOfCourt,
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
    final label = category.name.trim().isNotEmpty
        ? category.name.trim()
        : 'sem nome';
    if (!isBracketSystemSupported(category.bracketSystem)) {
      return 'A categoria "$label" usa '
          '${bracketSystemLabel(category.bracketSystem)}, '
          'ainda não suportado.';
    }
    if (category.bracketSystem == TournamentBracketSystem.kingOfCourt &&
        draft.sport != TournamentSport.beachVolleyball) {
      return 'A categoria "$label" usa King of the Court, que por enquanto é '
          'só para vôlei de praia.';
    }
  }
  return '';
}

/// Formatos com geração de chave que o wizard oferece para o esporte. O KOTC é
/// só de vôlei de praia por enquanto (o spec multiesporte deixa KOTC de outros
/// esportes fora de escopo).
List<TournamentBracketSystem> bracketSystemsForSport(TournamentSport sport) => [
  for (final system in supportedBracketSystems)
    if (system != TournamentBracketSystem.kingOfCourt ||
        sport == TournamentSport.beachVolleyball)
      system,
];

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

/// O wizard do app só CRIA categorias de dupla; trio/quarteto/quinteto nascem
/// no portal do organizador e aqui são apenas preservadas/exibidas.
const supportedCategoryDisputes = [TournamentCategoryDispute.dupla];

String categoryDisputeLabel(TournamentCategoryDispute dispute) =>
    switch (dispute) {
      TournamentCategoryDispute.individual => 'Individual',
      TournamentCategoryDispute.dupla => 'Dupla',
      TournamentCategoryDispute.trio => 'Trio',
      TournamentCategoryDispute.quarteto => 'Quarteto',
      TournamentCategoryDispute.quinteto => 'Quinteto',
      TournamentCategoryDispute.team => 'Equipe',
    };

String categoryDisputeShort(TournamentCategoryDispute dispute) =>
    categoryDisputeLabel(dispute);

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
  TournamentSkillLevel.avancado1 => 'Avançado 1',
  TournamentSkillLevel.avancado2 => 'Avançado 2',
};

/// Escada única de 7 níveis (ordem crescente) para categorias novas de TODOS
/// os esportes — também é a linha "ATÉ O NÍVEL" do editor (spec 2026-09-30).
/// Categorias antigas com `Iniciante`/`Intermediário` continuam válidas
/// (ranks unificados no backend); o editor apenas deixa de oferecê-las.
const categoryLevelLadder = <TournamentSkillLevel>[
  TournamentSkillLevel.iniciante1,
  TournamentSkillLevel.iniciante2,
  TournamentSkillLevel.intermediario1,
  TournamentSkillLevel.intermediario2,
  TournamentSkillLevel.avancado1,
  TournamentSkillLevel.avancado2,
  TournamentSkillLevel.open,
];

List<TournamentSkillLevel> skillLevelOptionsForSport(TournamentSport sport) =>
    categoryLevelLadder;

/// Presets de faixa de nível (paridade com CATEGORY_LEVEL_PRESETS do portal
/// e CATEGORY_PRESETS das functions — spec emendada 18/08). O teto usa o
/// enum do draft (`skillLevel`); o piso usa label porque
/// `categories[].minLevel` guarda o label cru.
class CategoryLevelPreset {
  const CategoryLevelPreset({
    required this.label,
    required this.minLevel,
    required this.maxSkillLevel,
  });
  final String label;
  final String minLevel;
  final TournamentSkillLevel maxSkillLevel;
}

const categoryLevelPresets = <CategoryLevelPreset>[
  CategoryLevelPreset(
    label: 'Iniciante',
    minLevel: 'Iniciante 1',
    maxSkillLevel: TournamentSkillLevel.iniciante2,
  ),
  CategoryLevelPreset(
    label: 'Intermediário',
    minLevel: 'Intermediário 1',
    maxSkillLevel: TournamentSkillLevel.intermediario2,
  ),
  CategoryLevelPreset(
    label: 'Avançado',
    minLevel: 'Avançado 1',
    maxSkillLevel: TournamentSkillLevel.avancado2,
  ),
  CategoryLevelPreset(
    label: 'Open',
    minLevel: 'Avançado 1',
    maxSkillLevel: TournamentSkillLevel.open,
  ),
  CategoryLevelPreset(
    label: 'Elite',
    minLevel: 'Open',
    maxSkillLevel: TournamentSkillLevel.open,
  ),
  CategoryLevelPreset(
    label: 'Livre',
    minLevel: 'Iniciante 1',
    maxSkillLevel: TournamentSkillLevel.open,
  ),
];

/// Preset ativo do draft (faixa exata) — null para faixa legada/sem piso.
/// Elite (Open/Open) e Livre (Iniciante 1/Open) têm pares distintos, então a
/// busca linear é inequívoca.
String? activeCategoryLevelPreset(TournamentCategoryDraft draft) {
  for (final preset in categoryLevelPresets) {
    if (draft.minLevel == preset.minLevel &&
        draft.skillLevel == preset.maxSkillLevel) {
      return preset.label;
    }
  }
  return null;
}

/// Chip que abre a escolha de teto "até um nível" (spec 2026-09-30).
const categoryLevelUpToChipLabel = 'Até um nível';

/// Teto X de uma faixa "até X": piso Iniciante 1 e teto na escada de 7, fora
/// dos presets. Iniciante 1–Iniciante 2 e Iniciante 1–Open devolvem null — são
/// os presets Iniciante e Livre, mesma regra. Paridade com `categoryUpToLevel`
/// do portal; o backend deriva o peso da mesma faixa (`presetFromRange`).
TournamentSkillLevel? categoryLevelUpToCeiling(TournamentCategoryDraft draft) {
  if (draft.minLevel != 'Iniciante 1') return null;
  if (!categoryLevelLadder.contains(draft.skillLevel)) return null;
  if (activeCategoryLevelPreset(draft) != null) return null;
  return draft.skillLevel;
}

/// Dica sob a linha "ATÉ O NÍVEL" — mesmo texto do portal (`upToLevelHint`).
String categoryLevelUpToHint(TournamentSkillLevel ceiling) => switch (ceiling) {
  TournamentSkillLevel.iniciante1 =>
    'Só atletas Iniciante 1. Quem está acima não se inscreve.',
  TournamentSkillLevel.open => 'Libera todos os níveis (mesma regra do Livre).',
  TournamentSkillLevel.iniciante2 =>
    'Libera de Iniciante 1 até Iniciante 2. Quem está acima não se inscreve. '
        'Mesma regra do preset Iniciante.',
  _ =>
    'Libera de Iniciante 1 até ${skillLevelLabel(ceiling)}. '
        'Quem está acima não se inscreve.',
};

/// Categoria nova (id novo, nenhum campo preenchido ainda) — nasce SEMPRE no
/// preset "Livre" (Iniciante 1–Open), nunca em faixa legada (`minLevel: ''`).
/// Mesmo fix do portal web (commit b230a30d): um chip precisa nascer ativo.
TournamentCategoryDraft emptyCategoryDraft(String id) =>
    TournamentCategoryDraft(id: id, minLevel: 'Iniciante 1');

String formatCents(int cents) => formatBRLFromCents(cents);

String formatReais(double value) => formatBRL(value);

String spotsUnitLabel(TournamentCategoryDispute dispute, int spots) {
  final unit = switch (dispute) {
    TournamentCategoryDispute.individual => spots == 1 ? 'atleta' : 'atletas',
    TournamentCategoryDispute.dupla => spots == 1 ? 'dupla' : 'duplas',
    TournamentCategoryDispute.trio ||
    TournamentCategoryDispute.quarteto ||
    TournamentCategoryDispute.quinteto ||
    TournamentCategoryDispute.team => spots == 1 ? 'equipe' : 'equipes',
  };
  return '$spots $unit';
}

/// Rótulo de nível para nome/tags (paridade com `criar-torneio`/`criar-liga`
/// no portal web). Quando a faixa bate um preset nomeado
/// (`activeCategoryLevelPreset`), usa o rótulo do preset — assim Elite
/// (Open–Open) deixa de ser sinônimo de Livre (Iniciante 1–Open): antes das
/// duas só sobrava "Masculino". Livre é o preset padrão (piso rank 0) e
/// fica deliberadamente sem ruído, igual hoje. Faixa legada (sem preset —
/// `minLevel` vazio ou combinação antiga) preserva o comportamento de
/// sempre: só o teto, quando não é Open. Faixa "até X" (spec 2026-09-30) vira
/// `até <nível>`: sem o "até" ficaria igual a uma categoria só daquele nível.
String? _categoryLevelNamePart(TournamentCategoryDraft category) {
  final upTo = categoryLevelUpToCeiling(category);
  if (upTo != null) return 'até ${skillLevelLabel(upTo)}';
  final preset = activeCategoryLevelPreset(category);
  if (preset != null) {
    return preset == 'Livre' ? null : preset;
  }
  return category.skillLevel != TournamentSkillLevel.open
      ? skillLevelLabel(category.skillLevel)
      : null;
}

String suggestCategoryName(TournamentCategoryDraft category) {
  final levelPart = _categoryLevelNamePart(category);
  final parts = <String>[
    // Equipe (trio+): o formato lidera o nome, e "Livre" substitui o gênero
    // (mesma sugestão do portal — "Trio Misto Sub-17").
    if (isTeamDispute(category.dispute)) categoryDisputeLabel(category.dispute),
    if (isTeamDispute(category.dispute) && category.genderFree)
      'Livre'
    else
      categoryGenderLabel(category.gender),
    if (category.ageBand != TournamentAgeBand.open)
      ageBandLabel(category.ageBand),
    if (levelPart != null) levelPart,
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
      TournamentBracketSystem.kingOfCourt => 'King of Court',
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
  final levelPart = _categoryLevelNamePart(category);
  return [
    categoryGenderShort(category.gender),
    categoryDisputeShort(category.dispute),
    if (category.ageBand != TournamentAgeBand.open)
      ageBandLabel(category.ageBand),
    if (levelPart != null) levelPart,
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

/// Data curta + hora (usado na janela de inscrição, que precisa do horário
/// exato de abertura/fechamento, não só do dia).
String formatShortDateTime(DateTime? date) {
  if (date == null) return '—';
  final datePart = formatShortDate(date);
  final timePart = DateFormat('HH:mm').format(date);
  return '$datePart · $timePart';
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
      emptyCategoryDraft(reference.microsecondsSinceEpoch.toString()).copyWith(
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
  if (start == null) return null;
  // `startAt` é só data (meia-noite): comparar com ele recusava fechar em
  // qualquer hora do próprio dia. O limite é o 1º jogo quando ele cai no dia
  // do início; senão, o fim desse dia.
  final first = draft.firstMatchAt;
  if (first != null &&
      first.year == start.year &&
      first.month == start.month &&
      first.day == start.day) {
    if (closes.isAfter(first)) {
      final hh = first.hour.toString().padLeft(2, '0');
      final mm = first.minute.toString().padLeft(2, '0');
      return 'As inscrições não podem fechar depois do 1º jogo ($hh:$mm).';
    }
    return null;
  }
  final endOfStartDay =
      DateTime(start.year, start.month, start.day, 23, 59, 59, 999);
  if (closes.isAfter(endOfStartDay)) {
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
      TournamentBracketSystem.kingOfCourt => 'king_of_court',
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
    'king_of_court' ||
    'king of court' ||
    'kotc' => TournamentBracketSystem.kingOfCourt,
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
    SportCatalog.labelOf(draft.sportRaw) ?? sportLabel(draft.sport);

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
      '${formatShortDateTime(draft.registrationOpensAt)}–${formatShortDateTime(draft.registrationClosesAt)}';
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

// --- Placar da categoria (spec multiesporte, fase 2d2b) ---------------------
// Espelho de `tournament-create.model.ts` do portal (2d2a).

/// `bestOf` do perfil — o mesmo mapeamento do servidor: set único = 1; MD3 e
/// MD5 = 3 (MD5 ainda não é operável na mesa).
int profileBestOf(TournamentBestOf bestOf) =>
    bestOf == TournamentBestOf.singleSet ? 1 : 3;

/// Perfil sugerido para uma categoria NOVA do esporte: o padrão do catálogo
/// (21/15 vôlei de praia, 25/15 quadra, 18/15 futevôlei, games de beach tennis)
/// com o `bestOf` da categoria.
Map<String, dynamic> suggestedScoringProfile(
  TournamentSport sport,
  TournamentBestOf bestOf,
) {
  final base =
      SportCatalog.resolve(sport.name)?.scoringProfile ??
      ScoringRules.legacyProfile(3);
  return ScoringRules.profileToMap(
    ScoringRules.withBestOf(base, profileBestOf(bestOf)),
  );
}

/// O placar que a categoria vai carimbar: o perfil explícito ou, sem ele, o
/// que o servidor usa — regra histórica em pontos, padrão do catálogo em games.
ScoringProfile categoryScoringView(
  TournamentCategoryDraft category,
  TournamentSport sport,
) {
  final bestOf = profileBestOf(category.bestOf);
  final explicit = ScoringRules.profileFromRaw(category.scoringProfileRaw);
  if (explicit != null) return ScoringRules.withBestOf(explicit, bestOf);
  final catalog = SportCatalog.resolve(sport.name)?.scoringProfile;
  final base = catalog is SetsGamesProfile
      ? catalog
      : ScoringRules.legacyProfile(3);
  return ScoringRules.withBestOf(base, bestOf);
}

/// Edição do placar: parte do que a categoria carimba hoje e grava o perfil
/// explícito. Campo de outro tipo é ignorado.
TournamentCategoryDraft patchCategoryScoring(
  TournamentCategoryDraft category,
  TournamentSport sport, {
  int? setTarget,
  int? decidingSetTarget,
  bool? noAd,
  DecidingSet? decidingSet,
}) {
  final current = categoryScoringView(category, sport);
  final next = switch (current) {
    SetsPointsProfile() => SetsPointsProfile(
      bestOf: current.bestOf,
      setTarget: setTarget ?? current.setTarget,
      decidingSetTarget: decidingSetTarget ?? current.decidingSetTarget,
      winBy: current.winBy,
      pointCap: current.pointCap,
    ),
    SetsGamesProfile() => SetsGamesProfile(
      bestOf: current.bestOf,
      gamesPerSet: current.gamesPerSet,
      winByGames: current.winByGames,
      tiebreakAtGames: current.tiebreakAtGames,
      tiebreakTo: current.tiebreakTo,
      noAd: noAd ?? current.noAd,
      decidingSet: decidingSet ?? current.decidingSet,
      superTiebreakTo: current.superTiebreakTo,
    ),
  };
  return category.copyWith(scoringProfileRaw: ScoringRules.profileToMap(next));
}

/// Troca de esporte: categoria cujo perfil explícito é de OUTRO tipo (pontos ×
/// games) ganha a sugestão do novo esporte; do mesmo tipo, o placar editado
/// fica; sem perfil continua sem.
List<TournamentCategoryDraft> withSportScoring(
  List<TournamentCategoryDraft> categories,
  TournamentSport sport,
) => [
  for (final c in categories)
    () {
      final raw = c.scoringProfileRaw;
      if (raw == null) return c;
      final suggested = suggestedScoringProfile(sport, c.bestOf);
      return raw['kind'] == suggested['kind']
          ? c
          : c.copyWith(scoringProfileRaw: suggested);
    }(),
];

