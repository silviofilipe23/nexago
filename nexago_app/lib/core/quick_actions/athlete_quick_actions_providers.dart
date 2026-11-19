import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/quick_actions/athlete_quick_actions_logic.dart';
import 'package:nexago_app/core/quick_actions/quick_actions_channel.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_booking_helpers.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_providers.dart';

final quickActionsChannelProvider = Provider<QuickActionsChannel>(
  (ref) => QuickActionsChannel(),
);

/// Menu do toque longo no ícone, montado com a situação do atleta.
///
/// Os dados (reservas, dia de torneio, não lidas) são os mesmos que a Início
/// já observa; só são lidos com o papel de atleta ativo.
///
/// `null` = ainda não dá pra montar (sessão, papel, reservas ou Focus
/// carregando): o menu gravado fica como está. Gravar um menu pela metade
/// nessa janela deixaria "Nada marcado" no ícone se o app fosse suspenso ali.
final athleteQuickActionsProvider =
    Provider.autoDispose<List<QuickActionItem>?>((ref) {
  final auth = ref.watch(authProvider);
  if (auth.isLoading && !auth.hasValue) return null;

  final signedIn = auth.valueOrNull != null;
  final role = ref.watch(activeMobileRoleProvider);
  final now = DateTime.now();

  if (!signedIn) {
    return buildAthleteQuickActions(signedIn: false, role: null, now: now);
  }
  if (role == null) return null;
  if (role != AppMobileRole.athlete) {
    return buildAthleteQuickActions(signedIn: true, role: role, now: now);
  }

  final bookingsAsync = ref.watch(myBookingsStreamProvider);
  final focusAsync = ref.watch(athleteFocusHomeTargetProvider);
  if (_stillLoading(bookingsAsync) || _stillLoading(focusAsync)) return null;

  final bookings = bookingsAsync.valueOrNull ?? const [];
  return buildAthleteQuickActions(
    signedIn: true,
    role: role,
    now: now,
    // A mesma regra do card "Próxima reserva" da Início.
    nextBooking: findNextAthleteBooking(bookings, now: now),
    focus: focusAsync.valueOrNull,
    unreadMessages: ref.watch(unreadMessagesCountProvider),
  );
});

/// Carregando pela primeira vez. Erro não segura: conta como "sem dado"
/// (sem reserva, sem Focus), senão uma falha de leitura travaria o menu.
bool _stillLoading(AsyncValue<Object?> value) =>
    !value.hasValue && !value.hasError;
