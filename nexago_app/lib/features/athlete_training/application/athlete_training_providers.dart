import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

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
import '../domain/homework_progress.dart';
import '../infrastructure/homework_progress_repository.dart';
import '../domain/training_plans.dart';
import '../infrastructure/training_plans_repository.dart';
import '../domain/class_presence.dart';
import '../infrastructure/class_presence_repository.dart';
import '../domain/training_center.dart';
import '../infrastructure/training_centers_repository.dart';
import '../domain/class_review.dart';
import '../infrastructure/class_review_repository.dart';

/// Resposta de `getMyTrainingCenters` (centros + convites). Falha (ou a
/// callable ainda não publicada) vira vazio: o resto dos treinos segue.
final athleteTrainingCentersDataProvider =
    FutureProvider.autoDispose<MyTrainingCentersData>((ref) async {
      if (ref.watch(professorLinksUidProvider).isEmpty) {
        return const MyTrainingCentersData();
      }
      try {
        return await ref.read(trainingCentersRepositoryProvider).fetch();
      } catch (_) {
        return const MyTrainingCentersData();
      }
    });

/// Centros de treinamento do aluno.
final athleteTrainingCentersProvider =
    FutureProvider.autoDispose<List<TrainingCenterLink>>(
      (ref) async =>
          (await ref.watch(athleteTrainingCentersDataProvider.future)).centers,
    );

/// Experimentais pedidas em CTs (aparecem na agenda de Treinos).
final athleteCenterTrialsProvider =
    FutureProvider.autoDispose<List<CenterTrial>>(
      (ref) async =>
          (await ref.watch(athleteTrainingCentersDataProvider.future)).trials,
    );

/// Recarrega centros e convites (depois de responder, aceitar ou pagar).
void refreshAthleteTrainingCenters(WidgetRef ref) =>
    ref.invalidate(athleteTrainingCentersDataProvider);

/// Pix da fatura do centro (O8/F2) — gera a fatura no provedor se ainda não
/// existir.
final centerInvoicePixProvider = FutureProvider.autoDispose
    .family<CenterInvoicePix, ({String centerId, String invoiceId})>(
      (ref, k) => ref
          .read(trainingCentersRepositoryProvider)
          .invoicePix(centerId: k.centerId, invoiceId: k.invoiceId),
    );

/// Evidência da assinatura do contrato (K8): plataforma e versão do app.
/// Versão vazia quando não dá para ler. Trocáveis nos testes.
final contractSignPlatformProvider = Provider<String>(
  (ref) => switch (defaultTargetPlatform) {
    TargetPlatform.iOS => 'ios',
    TargetPlatform.android => 'android',
    final p => p.name,
  },
);

final contractSignAppVersionProvider = FutureProvider<String>((ref) async {
  try {
    final info = await PackageInfo.fromPlatform();
    final build = info.buildNumber.trim();
    return build.isEmpty ? info.version : '${info.version}+$build';
  } catch (_) {
    return '';
  }
});

/// Um centro do aluno pelo id — `data(null)` quando o aluno não tem (mais)
/// vínculo com ele. Ao recarregar, segue com o valor anterior (a tela não
/// pisca nem desmonta o Pix da fatura).
final athleteTrainingCenterProvider = Provider.autoDispose
    .family<AsyncValue<TrainingCenterLink?>, String>((ref, centerId) {
  final async = ref.watch(athleteTrainingCentersProvider);
  final list = async.valueOrNull;
  if (list == null) {
    return async.hasError
        ? AsyncError(async.error!, async.stackTrace ?? StackTrace.current)
        : const AsyncLoading();
  }
  for (final c in list) {
    if (c.centerId == centerId) return AsyncData(c);
  }
  return const AsyncData(null);
});

/// Treinos da janela curta: aulas da agenda (30 dias para trás, 35 para a
/// frente — o mesmo `myClassAgendaProvider` da aba Agenda) + particulares +
/// aulas dos centros de treinamento.
/// `null` enquanto as duas fontes não chegaram. Falha numa fonte vira lista
/// vazia (a agenda já engole o erro da callable).
final athleteTrainingsProvider =
    Provider.autoDispose<List<TrainingSession>?>((ref) {
  final classes = ref.watch(myClassAgendaProvider);
  final privates = ref.watch(athletePrivateLessonsProvider);
  final centers = ref.watch(athleteTrainingCentersProvider);
  if (!classes.hasValue ||
      (!privates.hasValue && !privates.hasError) ||
      !centers.hasValue) {
    return null;
  }
  return buildTrainings(
    classes: classes.value ?? const [],
    privateLessons: privates.valueOrNull ?? const [],
    centers: centers.value ?? const [],
    centerTrials: ref.watch(athleteCenterTrialsProvider).valueOrNull ?? const [],
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
  final centers = ref.watch(athleteTrainingCentersProvider);
  if (!classes.hasValue ||
      (!privates.hasValue && !privates.hasError) ||
      !centers.hasValue) {
    return null;
  }
  return buildTrainings(
    classes: [...?history.valueOrNull, ...?classes.value],
    privateLessons: privates.valueOrNull ?? const [],
    centers: centers.value ?? const [],
    centerTrials: ref.watch(athleteCenterTrialsProvider).valueOrNull ?? const [],
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

/// T9 · progresso do treino em casa da visão [viewId].
final homeworkProgressProvider = StreamProvider.autoDispose
    .family<HomeworkProgress, String>((ref, viewId) {
  if (viewId.isEmpty || ref.watch(professorLinksUidProvider).isEmpty) {
    return Stream.value(const HomeworkProgress());
  }
  return ref.watch(homeworkProgressRepositoryProvider).watch(viewId);
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


/// Avaliações de aula do próprio aluno (`classReviews`), da mais recente.
final myClassReviewsProvider =
    StreamProvider.autoDispose<List<ClassReview>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(classReviewRepositoryProvider).watchMine(uid);
});

/// Treinos com presença ainda sem avaliação (A1/A7). `null` enquanto os
/// treinos ou as avaliações não chegaram.
final pendingClassReviewsProvider =
    Provider.autoDispose<List<PendingReview>?>((ref) {
  final trainings = ref.watch(athleteTrainingsProvider);
  final reviews = ref.watch(myClassReviewsProvider);
  if (trainings == null || !reviews.hasValue) return null;
  return pendingClassReviews(
    trainings,
    reviews.value ?? const [],
    ref.watch(professorLinksClockProvider)(),
  );
});
