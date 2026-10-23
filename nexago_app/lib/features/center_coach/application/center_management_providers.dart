import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/profiles/app_user_profile.dart';
import '../../../core/profiles/users_repository.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/center_management.dart';
import '../domain/center_management_repository.dart';
import '../infrastructure/firebase_center_management_repository.dart';
import 'center_coach_providers.dart';

/// Quem age no centro (vai na auditoria): o nome do vínculo, senão "Equipe".
final centerActorProvider = Provider.autoDispose.family<CenterActor, String>((
  ref,
  centerId,
) {
  final m = ref.watch(centerMembershipProvider(centerId));
  final name = m?.displayName ?? '';
  return (
    uid: ref.watch(professorLinksUidProvider),
    name: name.isEmpty ? 'Equipe' : name,
  );
});

/// Equipe do centro (qualquer membro lê; a tela é da gestão).
final centerTeamProvider = StreamProvider.autoDispose
    .family<List<CenterTeamMember>, String>(
      (ref, centerId) =>
          ref.watch(centerManagementRepositoryProvider).watchTeam(centerId),
    );

/// Convites do centro — vazio para quem não é owner/admin (rule).
final centerInvitesProvider = StreamProvider.autoDispose
    .family<List<CenterInvite>, String>((ref, centerId) {
      final m = ref.watch(centerMembershipProvider(centerId));
      if (m == null || !m.isManager) return Stream.value(const []);
      return ref.watch(centerManagementRepositoryProvider).watchInvites(centerId);
    });

final centerProgramsProvider = StreamProvider.autoDispose
    .family<List<CenterProgram>, String>(
      (ref, centerId) =>
          ref.watch(centerManagementRepositoryProvider).watchPrograms(centerId),
    );

final centerPlansProvider = StreamProvider.autoDispose
    .family<List<CenterPlan>, String>(
      (ref, centerId) =>
          ref.watch(centerManagementRepositoryProvider).watchPlans(centerId),
    );

final centerLocationsProvider = StreamProvider.autoDispose
    .family<List<CenterLocation>, String>(
      (ref, centerId) => ref
          .watch(centerManagementRepositoryProvider)
          .watchLocations(centerId),
    );

final centerCourtsProvider = StreamProvider.autoDispose
    .family<List<CenterCourt>, String>(
      (ref, centerId) =>
          ref.watch(centerManagementRepositoryProvider).watchCourts(centerId),
    );

/// Assinaturas do aluno — vazio sem financeiro nem matrícula (rule).
final centerStudentSubscriptionsProvider = StreamProvider.autoDispose
    .family<List<CenterSubscription>, ({String centerId, String studentId})>((
      ref,
      k,
    ) {
      final m = ref.watch(centerMembershipProvider(k.centerId));
      if (m == null || !(m.has('view_finance') || m.has('enroll_students'))) {
        return Stream.value(const []);
      }
      return ref
          .watch(centerManagementRepositoryProvider)
          .watchStudentSubscriptions(k.centerId, k.studentId);
    });

/// Busca de contas NexaGO (diretório público, mesmas `keywords` da busca de
/// atleta) para vincular um aluno novo. Função para o teste trocar.
final centerAccountSearchProvider =
    Provider<Future<List<AppUserProfile>> Function(String term)>((ref) {
      final users = ref.watch(usersRepositoryProvider);
      return (term) => users.searchAthletesByKeywords(term, max: 8);
    });
