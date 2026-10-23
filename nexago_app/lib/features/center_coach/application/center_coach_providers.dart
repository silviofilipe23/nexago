import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../../core/auth/user_roles.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_mode/application/professor_mode_providers.dart'
    show professorRoleRetryDelaysProvider, professorTokenRolesReaderProvider;
import '../domain/center_alerts.dart';
import '../domain/center_coach.dart';
import '../infrastructure/center_selection_store.dart';
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

final centerSelectionStoreProvider = Provider<CenterSelectionStore>(
  (ref) => const CenterSelectionStore(),
);

/// Centro escolhido na troca (P2), guardado por conta no aparelho; `null` = o
/// primeiro ativo. Um centro que deixou de ser ativo cai no primeiro sozinho
/// (a Agenda só aceita o escolhido se ele estiver entre os ativos).
final selectedCoachCenterIdProvider =
    NotifierProvider<SelectedCoachCenterNotifier, String?>(
  SelectedCoachCenterNotifier.new,
);

class SelectedCoachCenterNotifier extends Notifier<String?> {
  var _touched = false;

  @override
  String? build() {
    _touched = false;
    final uid = ref.watch(professorLinksUidProvider);
    if (uid.isNotEmpty) {
      ref.read(centerSelectionStoreProvider).load(uid).then((saved) {
        // Uma troca feita antes da leitura terminar vence o valor salvo.
        if (!_touched && saved != null) state = saved;
      });
    }
    return null;
  }

  void select(String centerId) {
    _touched = true;
    state = centerId;
    final uid = ref.read(professorLinksUidProvider);
    unawaited(ref.read(centerSelectionStoreProvider).save(uid, centerId));
  }
}

/// O token ainda não tem o papel `center`, mas a conta já é da equipe de um
/// centro (o servidor concede a claim logo DEPOIS do vínculo ficar ativo).
bool centerRoleNeedsRefresh({
  required List<String> tokenRoles,
  required List<CenterMembership> memberships,
}) =>
    !tokenRoles.contains(kCenterAppRole) && memberships.any((m) => m.isActive);

/// Vínculo com um centro ficou ativo com o app aberto (owner que acabou de
/// criar o centro no portal, convite aceito): força o refresh do token para o
/// modo Centro aparecer em "Trocar papel" sem relogar. Assistido por quem
/// mostra os centros (ajustes do atleta, Agenda).
final centerRoleSyncProvider = Provider.autoDispose<void>((ref) {
  var running = false;
  var disposed = false;
  Timer? retry;
  ref.onDispose(() {
    disposed = true;
    retry?.cancel();
  });

  Future<void> wait(Duration delay) {
    if (delay <= Duration.zero) return Future.value();
    final done = Completer<void>();
    retry = Timer(delay, done.complete);
    return done.future;
  }

  Future<void> sync(List<CenterMembership> memberships) async {
    if (running) return;
    final readRoles = ref.read(professorTokenRolesReaderProvider);
    final cached = await readRoles(forceRefresh: false);
    if (disposed ||
        !centerRoleNeedsRefresh(tokenRoles: cached, memberships: memberships)) {
      return;
    }
    running = true;
    for (final delay in ref.read(professorRoleRetryDelaysProvider)) {
      await wait(delay);
      if (disposed) return;
      final fresh = await readRoles(forceRefresh: true);
      if (disposed) return;
      if (fresh.contains(kCenterAppRole)) {
        ref.invalidate(availableMobileRolesProvider);
        return;
      }
    }
    running = false;
  }

  ref.listen<AsyncValue<List<CenterMembership>>>(
    myCenterMembershipsProvider,
    (_, next) {
      final list = next.valueOrNull;
      if (list != null) sync(list).ignore();
    },
    fireImmediately: true,
  );
});

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

/// Nome dos planos do centro por id (fila de espera mostra o que a pessoa quer).
final coachPlanNamesProvider = StreamProvider.autoDispose
    .family<Map<String, String>, String>(
      (ref, centerId) =>
          ref.watch(centerCoachRepositoryProvider).watchPlanNames(centerId),
    );
