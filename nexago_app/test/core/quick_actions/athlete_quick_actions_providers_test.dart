import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/quick_actions/athlete_quick_actions_logic.dart';
import 'package:nexago_app/core/quick_actions/athlete_quick_actions_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_providers.dart';

class _FixedRole extends ActiveMobileRoleNotifier {
  _FixedRole(this._role);

  final AppMobileRole? _role;

  @override
  AppMobileRole? build() => _role;
}

/// Monta o container e conta quantas vezes as fontes de dados do atleta
/// foram lidas — quem não é atleta não pode abrir listener de reserva.
({ProviderContainer container, List<String> reads}) _container({
  required User? user,
  required AppMobileRole? role,
  Stream<User?>? authStream,
  bool focusFails = false,
}) {
  final reads = <String>[];
  final container = ProviderContainer(
    overrides: [
      authProvider.overrideWith(
        (ref) => authStream ?? Stream<User?>.value(user),
      ),
      activeMobileRoleProvider.overrideWith(() => _FixedRole(role)),
      myBookingsStreamProvider.overrideWith((ref) {
        reads.add('bookings');
        return Stream.value(const <MyBookingItem>[]);
      }),
      athleteFocusHomeTargetProvider.overrideWith((ref) async {
        reads.add('focus');
        if (focusFails) throw StateError('firestore indisponível');
        return const AthleteFocusHomeTarget(
          tournamentId: 'cup-1',
          tournamentName: 'Copa Verão',
        );
      }),
      unreadMessagesCountProvider.overrideWith((ref) {
        reads.add('unread');
        return 2;
      }),
    ],
  );
  addTearDown(container.dispose);
  return (container: container, reads: reads);
}

Future<List<QuickActionItem>?> _settle(
  ProviderContainer container, {
  bool awaitAuth = true,
}) async {
  final sub = container.listen(athleteQuickActionsProvider, (_, __) {});
  addTearDown(sub.close);
  if (awaitAuth) await container.read(authProvider.future);
  // Deixa os providers assíncronos (sessão, Focus) resolverem.
  for (var i = 0; i < 3; i++) {
    await Future<void>.delayed(Duration.zero);
  }
  return container.read(athleteQuickActionsProvider);
}

void main() {
  test('sem login: só Reservar quadra, sem ler dados do atleta', () async {
    final (:container, :reads) = _container(user: null, role: null);

    final items = await _settle(container);

    expect(items?.map((i) => i.type), [AthleteQuickAction.reservar.type]);
    expect(reads, isEmpty);
  });

  test('sessão ainda restaurando: não grava nada (null)', () async {
    final (:container, :reads) = _container(
      user: null,
      role: null,
      authStream: const Stream<User?>.empty(),
    );

    expect(await _settle(container, awaitAuth: false), isNull);
    expect(reads, isEmpty);
  });

  test('logado com papel ainda resolvendo: não grava nada (null)', () async {
    final (:container, reads: _) = _container(
      user: MockUser(uid: 'atleta-1'),
      role: null,
    );

    expect(await _settle(container), isNull);
  });

  test('falha ao ler o Focus não trava o menu do atleta', () async {
    final (:container, reads: _) = _container(
      user: MockUser(uid: 'atleta-1'),
      role: AppMobileRole.athlete,
      focusFails: true,
    );

    final items = await _settle(container);

    expect(items?.first.type, AthleteQuickAction.reservar.type);
  });

  test('professor logado: menu vazio, sem ler dados do atleta', () async {
    final (:container, :reads) = _container(
      user: MockUser(uid: 'prof-1'),
      role: AppMobileRole.professor,
    );

    final items = await _settle(container);

    expect(items, isEmpty);
    expect(reads, isEmpty);
  });

  test('atleta: monta o menu com Focus e não lidas', () async {
    final (:container, :reads) = _container(
      user: MockUser(uid: 'atleta-1'),
      role: AppMobileRole.athlete,
    );

    final items = await _settle(container);

    expect(items?.map((i) => i.type), [
      AthleteQuickAction.focus.type,
      AthleteQuickAction.reservar.type,
      AthleteQuickAction.agenda.type,
      AthleteQuickAction.mensagens.type,
    ]);
    expect(items?.first.subtitle, 'Copa Verão · hoje');
    expect(items?.last.subtitle, '2 não lidas');
    expect(reads, containsAll(['bookings', 'focus', 'unread']));
  });
}
