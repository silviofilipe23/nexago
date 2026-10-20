import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../../core/auth/app_mobile_role.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/auth/user_roles.dart';
import '../../athlete/data/class_agenda_repository.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../domain/professor_mode_logic.dart';

/// Lê os papéis do token. `forceRefresh` busca a claim nova no servidor.
/// Injetável para teste (o `User` do Firebase não tem dublê simples).
typedef ProfessorTokenRolesReader = Future<List<String>> Function({
  required bool forceRefresh,
});

final professorTokenRolesReaderProvider =
    Provider<ProfessorTokenRolesReader>((ref) {
  return ({required bool forceRefresh}) async {
    final user = ref.read(authProvider).valueOrNull;
    if (user == null) return const [];
    return appRolesFromIdToken(await user.getIdTokenResult(forceRefresh));
  };
});

/// Espera entre as tentativas de buscar a claim: o servidor concede o papel
/// logo DEPOIS de gravar o vínculo `ACTIVE`, então o stream pode chegar antes.
final professorRoleRetryDelaysProvider = Provider<List<Duration>>(
  (ref) => const [Duration.zero, Duration(seconds: 2), Duration(seconds: 6)],
);

/// Vínculo virou `ACTIVE` com o app aberto (aceite do convite ou aprovação da
/// arena): força o refresh do token para o papel Professor aparecer em
/// "Trocar papel" sem relogar. Quem mostra os vínculos assiste este provider
/// (Minhas arenas, detalhe do vínculo, ajustes do atleta).
final professorRoleSyncProvider = Provider.autoDispose<void>((ref) {
  var running = false;
  var disposed = false;
  Timer? retry;
  ref.onDispose(() {
    disposed = true;
    retry?.cancel();
  });

  // Timer cancelável (e não `Future.delayed`): a tela some, a espera some.
  Future<void> wait(Duration delay) {
    if (delay <= Duration.zero) return Future.value();
    final done = Completer<void>();
    retry = Timer(delay, done.complete);
    return done.future;
  }

  Future<void> sync(List<ArenaProfessorLink> links) async {
    if (running) return;
    final readRoles = ref.read(professorTokenRolesReaderProvider);
    final now = ref.read(professorLinksClockProvider)();
    final cached = await readRoles(forceRefresh: false);
    if (disposed ||
        !professorRoleNeedsRefresh(
            tokenRoles: cached, links: links, now: now)) {
      return;
    }
    running = true;
    for (final delay in ref.read(professorRoleRetryDelaysProvider)) {
      await wait(delay);
      if (disposed) return;
      final fresh = await readRoles(forceRefresh: true);
      if (disposed) return;
      if (fresh.contains(kProfessorAppRole)) {
        ref.invalidate(availableMobileRolesProvider);
        return;
      }
    }
    running = false;
  }

  ref.listen<AsyncValue<List<ArenaProfessorLink>>>(
    myProfessorLinksProvider,
    (_, next) {
      final links = next.valueOrNull;
      if (links != null) sync(links).ignore();
    },
    fireImmediately: true,
  );
});

/// O modo Professor já está liberado no token, mas a pessoa está em outro
/// papel — Minhas arenas oferece "Entrar no modo Professor".
final canEnterProfessorModeProvider = Provider.autoDispose<bool>((ref) {
  final roles = ref.watch(availableMobileRolesProvider).valueOrNull ?? const [];
  return roles.contains(AppMobileRole.professor) &&
      ref.watch(activeMobileRoleProvider) != AppMobileRole.professor;
});

/// Aulas da home do Professor (`getMyClassAgenda`). Diferente da agenda do
/// atleta, o erro chega à tela (com "tentar de novo"): aqui as aulas são o
/// conteúdo principal, e "nenhuma aula hoje" por falha de rede enganaria.
final professorClassesProvider =
    FutureProvider.autoDispose<List<ClassAgendaEntry>>((ref) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return const [];
  return ref.read(classAgendaRepositoryProvider).fetchMyClasses();
});
