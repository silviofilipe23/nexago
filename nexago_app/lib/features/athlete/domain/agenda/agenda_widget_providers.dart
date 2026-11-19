import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/active_role_providers.dart';
import '../../../../core/auth/app_mobile_role.dart';
import '../../../../core/auth/auth_providers.dart';
import '../../../arenas/domain/my_bookings_providers.dart';
import 'agenda_widget_snapshot.dart';
import 'athlete_agenda_providers.dart';

/// Snapshot do widget "Próximo jogo", pronto para o canal nativo.
///
/// `null` = ainda não dá pra montar (sessão, papel ou reservas carregando): o
/// widget fica com o que já tinha. Gravar pela metade nessa janela deixaria
/// "Nada marcado" na tela inicial se o app fosse suspenso ali (a mesma regra
/// do menu do ícone, `athleteQuickActionsProvider`).
final agendaWidgetSnapshotProvider = Provider.autoDispose<String?>((ref) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading && !auth.hasValue) return null;
  final now = DateTime.now();

  if (auth.valueOrNull == null) {
    return encodeAgendaWidgetSnapshot(
      signedIn: false,
      entries: const [],
      now: now,
    );
  }
  final role = ref.watch(activeMobileRoleProvider);
  if (role == null) return null;
  if (role != AppMobileRole.athlete) {
    return encodeAgendaWidgetSnapshot(
      signedIn: true,
      entries: const [],
      now: now,
    );
  }

  final bookings = ref.watch(myBookingsStreamProvider);
  if (bookings.isLoading && !bookings.hasValue) return null;
  return encodeAgendaWidgetSnapshot(
    signedIn: true,
    entries: buildAgendaWidgetEntries(
      ref.watch(athleteAgendaItemsProvider).allItems,
      now: now,
    ),
    now: now,
  );
});
