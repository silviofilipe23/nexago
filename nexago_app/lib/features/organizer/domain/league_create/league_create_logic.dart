import 'package:intl/intl.dart';

import '../tournament_create/tournament_create_logic.dart';
import 'league_create_draft.dart';

const defaultLeagueRankingPoints = <String, int>{
  '1': 450,
  '2': 280,
  '3': 180,
  '4': 120,
  'quarters': 80,
  'groups': 40,
};

String leagueFormatStepLabel(LeagueCreateStep step) =>
    'PASSO ${step.number} DE ${LeagueCreateStepX.total}';

String leagueStepTitle(LeagueCreateStep step) => switch (step) {
      LeagueCreateStep.identity => 'Identidade da liga',
      LeagueCreateStep.season => 'Temporada',
      LeagueCreateStep.categories => 'Categorias da liga',
      LeagueCreateStep.ranking => 'Ranking & Grande Final',
      LeagueCreateStep.stages => 'Etapas da temporada',
      LeagueCreateStep.review => 'Revisar a liga',
    };

String leagueStepSubtitle(LeagueCreateStep step) => switch (step) {
      LeagueCreateStep.identity =>
        'O circuito completo — as etapas você adiciona depois.',
      LeagueCreateStep.season =>
        'O intervalo do circuito e quantas etapas você planeja.',
      LeagueCreateStep.categories =>
        'Valem para todas as etapas. Cada etapa pode abrir ou fechar uma delas.',
      LeagueCreateStep.ranking =>
        'Como os pontos somam e quem chega à decisão.',
      LeagueCreateStep.stages =>
        'Adicione as etapas agora ou ao longo do ano.',
      LeagueCreateStep.review =>
        'Publique para abrir o circuito. Etapas podem ser adicionadas depois.',
    };

String countingStagesModeLabel(LeagueCountingStagesMode mode) =>
    switch (mode) {
      LeagueCountingStagesMode.best4Of6 => '4 melhores de 6 etapas',
      LeagueCountingStagesMode.best3Of5 => '3 melhores de 5 etapas',
      LeagueCountingStagesMode.allStages => 'Todas as etapas contam',
    };

String countingStagesModeDescription(LeagueCountingStagesMode mode) =>
    switch (mode) {
      LeagueCountingStagesMode.best4Of6 =>
        'Descarta os 2 piores resultados de cada dupla.',
      LeagueCountingStagesMode.best3Of5 =>
        'Descarta os 2 piores resultados de cada dupla.',
      LeagueCountingStagesMode.allStages =>
        'Cada etapa soma integralmente no ranking.',
    };

String leagueRankingTableLabel(String id) => switch (id) {
      'state_circuit' => 'Padrão circuito estadual',
      'nexago_standalone' => 'Padrão nexaGO · Etapa avulsa',
      _ => id,
    };

String formatLeagueMonthYear(DateTime? date) {
  if (date == null) return '—';
  return DateFormat('MMM yyyy', 'pt_BR').format(date);
}

String formatLeagueSeasonRange(DateTime? start, DateTime? end) {
  if (start == null) return 'Temporada a definir';
  if (end == null) return formatLeagueMonthYear(start);
  final startFmt = DateFormat("MMMM 'de' yyyy", 'pt_BR').format(start);
  final endFmt = DateFormat("MMMM 'de' yyyy", 'pt_BR').format(end);
  if (start.year == end.year && start.month == end.month) return startFmt;
  return '$startFmt a $endFmt';
}

String formatLeagueShortSeasonRange(DateTime? start, DateTime? end) {
  if (start == null) return '';
  final startFmt = DateFormat('MMM', 'pt_BR').format(start).toUpperCase();
  if (end == null) return startFmt;
  final endFmt = DateFormat('MMM yyyy', 'pt_BR').format(end).toUpperCase();
  return '$startFmt — $endFmt';
}

bool hasMeaningfulLocalLeagueDraft(LeagueCreateDraft draft) =>
    draft.name.trim().isNotEmpty;

LeagueCreateStep inferLeagueResumeStep(LeagueCreateDraft draft) {
  for (final step in LeagueCreateStep.values) {
    if (step == LeagueCreateStep.review) continue;
    if (!canContinueFromLeagueStep(draft, step)) return step;
  }
  return LeagueCreateStep.review;
}

LeagueCreateStep? parseLeagueWizardStep(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  for (final step in LeagueCreateStep.values) {
    if (step.name == raw) return step;
  }
  return null;
}

bool canContinueFromLeagueStep(LeagueCreateDraft draft, LeagueCreateStep step) {
  return switch (step) {
    LeagueCreateStep.identity => draft.name.trim().isNotEmpty,
    LeagueCreateStep.season =>
      draft.seasonStartAt != null &&
          draft.seasonEndAt != null &&
          !draft.seasonEndAt!.isBefore(draft.seasonStartAt!) &&
          draft.plannedStagesCount >= 2,
    LeagueCreateStep.categories => draft.categories.isNotEmpty,
    LeagueCreateStep.ranking =>
      draft.grandFinalSpots > 0 &&
          (!draft.wildcardEnabled || draft.wildcardSpots > 0),
    LeagueCreateStep.stages => draft.stages.isNotEmpty,
    LeagueCreateStep.review => isValidLeagueForPublish(draft),
  };
}

bool isValidLeagueForPublish(LeagueCreateDraft draft) {
  for (final step in LeagueCreateStep.values) {
    if (step == LeagueCreateStep.review) continue;
    if (!canContinueFromLeagueStep(draft, step)) return false;
  }
  if (!draft.stages.any((stage) => stage.status == LeagueStageStatus.defined)) {
    return false;
  }
  for (final category in draft.categories) {
    if (!isBracketSystemSupported(category.bracketSystem)) {
      return false;
    }
  }
  return true;
}

List<LeagueStageDraft> buildDefaultLeagueStages(LeagueCreateDraft draft) {
  final count = draft.plannedStagesCount.clamp(2, 12);
  final stages = <LeagueStageDraft>[];
  for (var i = 1; i <= count; i++) {
    stages.add(
      LeagueStageDraft(
        id: 'stage-$i',
        name: 'Etapa $i',
        order: i,
        status: LeagueStageStatus.pending,
      ),
    );
  }
  if (draft.grandFinalEnabled) {
    stages.add(
      LeagueStageDraft(
        id: 'grand-final',
        name: 'Grande Final',
        order: count + 1,
        status: LeagueStageStatus.pending,
        isGrandFinal: true,
      ),
    );
  }
  return stages;
}

String reviewLeagueSeasonSummary(LeagueCreateDraft draft) {
  final range = formatLeagueSeasonRange(draft.seasonStartAt, draft.seasonEndAt);
  final stages = draft.plannedStagesCount;
  final gf = draft.grandFinalEnabled ? ' + Grande Final' : '';
  return '$range · $stages etapas$gf';
}

String reviewLeagueCategoriesSummary(LeagueCreateDraft draft) {
  final count = draft.categories.length;
  return '$count categorias herdadas por todas as etapas';
}

String reviewLeagueRankingSummary(LeagueCreateDraft draft) {
  final counting = countingStagesModeLabel(draft.countingStagesMode);
  final table = leagueRankingTableLabel(draft.rankingTableId);
  return 'Soma das $counting · tabela $table';
}

String reviewLeagueGrandFinalSummary(LeagueCreateDraft draft) {
  final spots = draft.grandFinalSpots;
  final wild = draft.wildcardEnabled
      ? ' + ${draft.wildcardSpots} wildcards'
      : '';
  return '$spots vagas por ranking$wild';
}

String reviewLeagueStagesSummary(LeagueCreateDraft draft) {
  final defined = draft.definedStagesCount;
  final total = draft.stages.length;
  return '$defined de $total etapas definidas';
}

String leagueStageSubtitle(LeagueStageDraft stage) {
  if (stage.status == LeagueStageStatus.pending) {
    if (stage.dateLabel.isNotEmpty) {
      return 'Local a definir · ${stage.dateLabel}';
    }
    return 'A definir';
  }
  final location = [
    if (stage.locationName.isNotEmpty) stage.locationName,
    if (stage.city.isNotEmpty) stage.city,
  ].join(' · ');
  if (stage.dateLabel.isNotEmpty) return '$location · ${stage.dateLabel}';
  return location.isEmpty ? 'Etapa definida' : location;
}

Map<String, int> effectiveRankingPoints(LeagueCreateDraft draft) {
  if (draft.rankingPointsByPlace.isNotEmpty) return draft.rankingPointsByPlace;
  return defaultLeagueRankingPoints;
}
