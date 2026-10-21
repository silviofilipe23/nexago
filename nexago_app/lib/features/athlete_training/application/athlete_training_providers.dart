import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatting/app_date_format.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../athlete/data/class_agenda_repository.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_mode/application/professor_availability_providers.dart';
import '../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../../core/location/user_location_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/public_professor.dart';
import '../infrastructure/public_professor_repository.dart';
import '../domain/training_plans.dart';
import '../infrastructure/training_plans_repository.dart';
import '../domain/class_presence.dart';
import '../infrastructure/class_presence_repository.dart';

/// Treinos da janela curta: aulas da agenda (30 dias para trás, 35 para a
/// frente — o mesmo `myClassAgendaProvider` da aba Agenda) + particulares.
/// `null` enquanto as duas fontes não chegaram. Falha numa fonte vira lista
/// vazia (a agenda já engole o erro da callable).
final athleteTrainingsProvider =
    Provider.autoDispose<List<TrainingSession>?>((ref) {
  final classes = ref.watch(myClassAgendaProvider);
  final privates = ref.watch(athletePrivateLessonsProvider);
  if (!classes.hasValue || (!privates.hasValue && !privates.hasError)) {
    return null;
  }
  return buildTrainings(
    classes: classes.value ?? const [],
    privateLessons: privates.valueOrNull ?? const [],
    now: ref.watch(professorLinksClockProvider)(),
  );
});

/// Aulas dos ~6 meses para trás — o servidor aceita até
/// [kMaxClassAgendaRangeDays] dias por chamada, então são duas. Falha vira
/// lista vazia: as telas seguem com a janela curta.
final athleteTrainingClassHistoryProvider =
    FutureProvider.autoDispose<List<ClassAgendaEntry>>((ref) async {
  if (ref.watch(professorLinksUidProvider).isEmpty) return const [];
  final today = toNexagoEventLocal(ref.watch(professorLinksClockProvider)());
  DateTime day(int offset) =>
      DateTime(today.year, today.month, today.day + offset);
  const span = kMaxClassAgendaRangeDays - 1;
  final repo = ref.read(classAgendaRepositoryProvider);
  try {
    final chunks = await Future.wait([
      repo.fetchMyClassesInRange(
        fromKey: calendarDateKey(day(-2 * span - 1)),
        toKey: calendarDateKey(day(-span - 1)),
      ),
      repo.fetchMyClassesInRange(
        fromKey: calendarDateKey(day(-span)),
        toKey: calendarDateKey(today),
      ),
    ]);
    return [for (final c in chunks) ...c];
  } catch (_) {
    return const [];
  }
});

/// Janela curta + histórico de 6 meses (Histórico e Evolução). Enquanto o
/// histórico carrega, entrega a janela curta.
final athleteTrainingsWithHistoryProvider =
    Provider.autoDispose<List<TrainingSession>?>((ref) {
  final classes = ref.watch(myClassAgendaProvider);
  final history = ref.watch(athleteTrainingClassHistoryProvider);
  final privates = ref.watch(athletePrivateLessonsProvider);
  if (!classes.hasValue || (!privates.hasValue && !privates.hasError)) {
    return null;
  }
  return buildTrainings(
    classes: [...?history.valueOrNull, ...?classes.value],
    privateLessons: privates.valueOrNull ?? const [],
    now: ref.watch(professorLinksClockProvider)(),
  );
});

/// Quantos feedbacks novos (badge do atalho de Treinos).
final athleteTrainingNewFeedbackCountProvider =
    Provider.autoDispose<int>((ref) {
  final views = ref.watch(athleteLessonPlanViewsProvider).valueOrNull;
  if (views == null) return 0;
  return trainingNewFeedbackCount(
    views,
    ref.watch(professorLinksClockProvider)(),
  );
});

/// O atleta tem alguma coisa de treino (aula, particular ou plano/feedback)?
/// Decide se a Home mostra a entrada de Treinos.
final athleteHasTrainingsProvider = Provider.autoDispose<bool>((ref) {
  final trainings = ref.watch(athleteTrainingsProvider) ?? const [];
  if (trainings.isNotEmpty) return true;
  final views = ref.watch(athleteLessonPlanViewsProvider).valueOrNull;
  return views != null && views.isNotEmpty;
});

/// Créditos de reposição disponíveis (`getMyClassCredits`). Falha = lista
/// vazia (a tela de reposição mostra o próprio erro ao abrir as opções).
final athleteClassCreditsProvider =
    FutureProvider.autoDispose<List<ClassMakeupCredit>>((ref) async {
  if (ref.watch(professorLinksUidProvider).isEmpty) return const [];
  try {
    return await ref.read(classPresenceRepositoryProvider).fetchCredits();
  } catch (_) {
    return const [];
  }
});

/// Aulas onde o crédito pode ser usado.
final athleteClassMakeupOptionsProvider = FutureProvider.autoDispose
    .family<List<ClassMakeupOption>, String>((ref, creditId) {
  return ref.read(classPresenceRepositoryProvider).fetchMakeupOptions(creditId);
});

/// Depois de uma ação na aula: agenda, histórico e créditos voltam do servidor.
void refreshAthleteClassPresence(WidgetRef ref) {
  ref.invalidate(myClassAgendaProvider);
  ref.invalidate(athleteClassCreditsProvider);
}

/// Onde o atleta está, para ordenar professores por distância: GPS só se a
/// permissão já existe (nunca pede) e a cidade do perfil para o subtítulo.
/// `null` enquanto carrega.
final athleteSearchOriginProvider =
    Provider.autoDispose<({double? lat, double? lng, String city})?>((ref) {
  final loc = ref.watch(userLocationProvider).valueOrNull;
  if (loc == null) return null;
  return loc.hasCoordinates
      ? (lat: loc.latitude, lng: loc.longitude, city: loc.city)
      : (lat: null, lng: null, city: loc.city);
});

/// T13 · resultado da busca de professores.
final professorSearchProvider = FutureProvider.autoDispose
    .family<ProfessorSearchResult, ProfessorSearchQuery>((ref, q) {
  return ref.read(publicProfessorRepositoryProvider).search(q);
});

/// T11 · perfil do professor (com a distância das arenas, quando houver GPS).
final publicProfessorProvider = FutureProvider.autoDispose
    .family<PublicProfessor, String>((ref, professorUid) {
  final origin = ref.watch(athleteSearchOriginProvider);
  return ref.read(publicProfessorRepositoryProvider).profile(
        professorUid,
        lat: origin?.lat,
        lng: origin?.lng,
      );
});

/// T14 · planos ativos (arena e professor) e últimos pagamentos. Erro chega
/// à tela (que mostra "tentar de novo"); o hub lê só `valueOrNull`.
final athleteTrainingPlansProvider =
    FutureProvider.autoDispose<MyTrainingPlans>((ref) {
  if (ref.watch(professorLinksUidProvider).isEmpty) {
    return Future.value(const MyTrainingPlans());
  }
  return ref.read(trainingPlansRepositoryProvider).fetch();
});
