import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/athlete_firestore_codes.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete_training/application/athlete_training_providers.dart';
import '../../athlete_training/domain/public_professor.dart';
import '../../athlete_training/infrastructure/public_professor_repository.dart';
import '../domain/class_directory.dart';
import '../domain/class_directory_logic.dart';
import '../infrastructure/class_directory_repository.dart';

/// Nível do atleta no esporte principal: o código de turma (`intermediario`)
/// e o rótulo do perfil ("Intermediário 2"). `null` sem nível no perfil.
final athleteClassLevelProvider =
    Provider.autoDispose<({String code, String label})?>((ref) {
  final profile = ref.watch(athleteProfileProvider).valueOrNull;
  if (profile == null) return null;
  final levels = profile.levelsBySportFirestore;
  final raw = levels[profile.primarySportFirestoreId] ??
      (levels.isEmpty ? null : levels.values.first);
  final code = classLevelForAthlete(raw);
  if (code == null) return null;
  return (code: code, label: AthleteFirestoreCodes.levelFirestoreToLabel(raw));
});

/// H2 · arenas com turma + CTs (`searchClassDirectory`) + professores
/// independentes da vitrine (`searchProfessors`). Uma fonte que falha (ou a
/// callable ainda não publicada) não derruba a outra; as duas falhando, erro.
/// A tela só observa depois que a localização chegou (a ordem depende dela).
final classDirectoryProvider =
    FutureProvider.autoDispose<List<ClassProvider>>((ref) async {
  final origin = ref.watch(athleteSearchOriginProvider);
  final level = ref.watch(athleteClassLevelProvider)?.code;

  Object? placesError;
  Object? profsError;
  final results = await Future.wait([
    ref
        .read(classDirectoryRepositoryProvider)
        .search(lat: origin?.lat, lng: origin?.lng, level: level)
        .catchError((Object e) {
      placesError = e;
      return const <ClassProvider>[];
    }),
    ref
        .read(publicProfessorRepositoryProvider)
        .search((sport: '', text: '', lat: origin?.lat, lng: origin?.lng))
        .then(independentProfessors)
        .catchError((Object e) {
          profsError = e;
          return const <ClassProvider>[];
        }),
  ]);
  if (placesError != null && profsError != null) throw placesError!;
  return [...results[0], ...results[1]];
});

/// Professores da vitrine que atendem como independentes em alguma arena —
/// os da equipe da arena aparecem dentro dela (H4).
List<ClassProvider> independentProfessors(ProfessorSearchResult r) => [
      for (final p in r.items)
        if (p.arenas.any((a) => a.independent)) ClassProvider.fromProfessor(p),
    ];

/// Filtros da lista H2 (sobrevivem ao ir e voltar do detalhe).
final classDirectoryFiltersProvider =
    StateProvider.autoDispose<DirectoryFilters>(
  (ref) => const DirectoryFilters(),
);

/// H4/H5 · detalhe da arena ou do CT.
final classProviderDetailProvider = FutureProvider.autoDispose
    .family<ClassProviderDetail, ({ClassProviderKind kind, String id})>(
        (ref, key) {
  final origin = ref.watch(athleteSearchOriginProvider);
  return ref.read(classDirectoryRepositoryProvider).detail(
        key.kind,
        key.id,
        lat: origin?.lat,
        lng: origin?.lng,
      );
});
