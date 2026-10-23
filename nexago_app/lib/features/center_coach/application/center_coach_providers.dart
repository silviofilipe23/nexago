import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/center_alerts.dart';
import '../domain/center_coach.dart';
import '../infrastructure/firebase_center_coach_repository.dart';

/// Vínculos da conta com centros de treinamento (todos os status — o revogado
/// mostra o aviso P9).
final myCenterMembershipsProvider =
    StreamProvider.autoDispose<List<CenterMembership>>((ref) {
      final uid = ref.watch(professorLinksUidProvider);
      if (uid.isEmpty) return Stream.value(const []);
      return ref.watch(centerCoachRepositoryProvider).watchMemberships(uid);
    });

/// Centros onde a conta está ativa (com nome, em ordem).
final activeCenterMembershipsProvider =
    Provider.autoDispose<List<CenterMembership>>((ref) {
      final list =
          ref.watch(myCenterMembershipsProvider).valueOrNull ?? const [];
      return [
        for (final m in list)
          if (m.isActive) m,
      ]..sort((a, b) => a.centerName.compareTo(b.centerName));
    });

/// Tem vínculo ativo com algum centro? Decide as entradas ("Centros onde dou
/// aula") nos ajustes do atleta e no Mais do Professor.
final hasCenterMembershipProvider = Provider.autoDispose<bool>(
  (ref) => ref.watch(activeCenterMembershipsProvider).isNotEmpty,
);

/// Vínculo da conta com [centerId] (`null` sem vínculo).
final centerMembershipProvider = Provider.autoDispose
    .family<CenterMembership?, String>((ref, centerId) {
      for (final m
          in ref.watch(myCenterMembershipsProvider).valueOrNull ?? const []) {
        if (m.centerId == centerId) return m;
      }
      return null;
    });

/// Centro escolhido na troca (P2); `null` = o primeiro ativo.
final selectedCoachCenterIdProvider = StateProvider<String?>((ref) => null);

final coachCenterProvider = StreamProvider.autoDispose
    .family<CenterCoachCenter?, String>(
      (ref, centerId) =>
          ref.watch(centerCoachRepositoryProvider).watchCenter(centerId),
    );

typedef CoachRange = ({String centerId, String fromKey, String toKey});

final coachSessionsProvider = StreamProvider.autoDispose
    .family<List<CenterCoachSession>, CoachRange>(
      (ref, r) => ref
          .watch(centerCoachRepositoryProvider)
          .watchSessions(r.centerId, fromKey: r.fromKey, toKey: r.toKey),
    );

final coachSessionProvider = StreamProvider.autoDispose
    .family<CenterCoachSession?, ({String centerId, String sessionId})>(
      (ref, k) => ref
          .watch(centerCoachRepositoryProvider)
          .watchSession(k.centerId, k.sessionId),
    );

typedef CoachClassRange = ({
  String centerId,
  String classId,
  String fromKey,
  String toKey,
});

final coachClassSessionsProvider = StreamProvider.autoDispose
    .family<List<CenterCoachSession>, CoachClassRange>(
      (ref, r) => ref
          .watch(centerCoachRepositoryProvider)
          .watchClassSessions(
            r.centerId,
            r.classId,
            fromKey: r.fromKey,
            toKey: r.toKey,
          ),
    );

final coachClassesProvider = StreamProvider.autoDispose
    .family<List<CenterCoachClass>, String>(
      (ref, centerId) =>
          ref.watch(centerCoachRepositoryProvider).watchClasses(centerId),
    );

final coachEnrollmentsProvider = StreamProvider.autoDispose
    .family<List<CenterCoachEnrollment>, String>((ref, centerId) {
      final m = ref.watch(centerMembershipProvider(centerId));
      if (m == null || !(m.isManager || m.has('enroll_students'))) {
        return Stream.value(const []);
      }
      return ref
          .watch(centerCoachRepositoryProvider)
          .watchEnrollments(centerId);
    });

/// Cobranças do centro — `null` sem permissão de financeiro.
final coachInvoicesProvider = StreamProvider.autoDispose
    .family<List<CenterCoachInvoice>?, String>((ref, centerId) {
      final m = ref.watch(centerMembershipProvider(centerId));
      if (m == null || !m.has('view_finance')) return Stream.value(null);
      return ref.watch(centerCoachRepositoryProvider).watchInvoices(centerId);
    });

/// Alunos que o professor vê no centro, por id.
final coachStudentsProvider = StreamProvider.autoDispose
    .family<Map<String, CenterCoachStudent>, String>((ref, centerId) {
      final uid = ref.watch(professorLinksUidProvider);
      final member = ref.watch(centerMembershipProvider(centerId));
      if (uid.isEmpty || member == null || !member.isActive) {
        return Stream.value(const {});
      }
      return ref
          .watch(centerCoachRepositoryProvider)
          .watchStudents(centerId, uid: uid, all: member.seesAllStudents)
          .map((list) => {for (final s in list) s.id: s});
    });

/// Atividade do centro (G3) — vazia para quem não é owner/admin.
final coachAuditLogsProvider = StreamProvider.autoDispose
    .family<List<CenterAuditEntry>, String>((ref, centerId) {
      final m = ref.watch(centerMembershipProvider(centerId));
      if (m == null || !m.isManager) return Stream.value(const []);
      return ref.watch(centerCoachRepositoryProvider).watchAuditLogs(centerId);
    });
