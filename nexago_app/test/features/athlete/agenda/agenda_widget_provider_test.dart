import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/agenda_widget_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';

class _FixedRole extends ActiveMobileRoleNotifier {
  _FixedRole(this._role);

  final AppMobileRole? _role;

  @override
  AppMobileRole? build() => _role;
}

AthleteAgendaItem _rentalTomorrow() {
  final now = DateTime.now();
  final start = DateTime(now.year, now.month, now.day + 1, 19);
  return AthleteAgendaItem(
    id: 'amanha',
    kind: AthleteAgendaItemKind.rental,
    startsAt: start,
    endsAt: start.add(const Duration(hours: 1)),
    title: 'Arena Orla',
    subtitle: 'Quadra 2',
    statusLabel: 'CONFIRMADA',
    accentColor: AppColors.brand,
    rental: AthleteAgendaRentalPayload(
      bookingId: 'amanha',
      arenaName: 'Arena Orla',
      courtName: 'Quadra 2',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      rawStatus: 'confirmed',
      confirmedParticipants: 4,
      stage: AthleteAgendaBookingStage.future,
    ),
  );
}

Future<String?> _snapshot({
  required User? user,
  required AppMobileRole? role,
  Stream<List<MyBookingItem>>? bookings,
}) async {
  final container = ProviderContainer(
    overrides: [
      authProvider.overrideWith((ref) => Stream<User?>.value(user)),
      activeMobileRoleProvider.overrideWith(() => _FixedRole(role)),
      myBookingsStreamProvider.overrideWith(
        (ref) => bookings ?? Stream.value(const <MyBookingItem>[]),
      ),
      athleteAgendaItemsProvider.overrideWith(
        (ref) => AthleteAgendaPageState(
          allItems: [_rentalTomorrow()],
          summary: const AthleteAgendaDaySummary(
            totalToday: 0,
            rentalsToday: 0,
            tournamentsToday: 0,
            challengesToday: 0,
          ),
          filterCounts: const AthleteAgendaFilterCounts(
            all: 1,
            rentals: 1,
            trainings: 0,
            tournaments: 0,
            challenges: 0,
          ),
        ),
      ),
    ],
  );
  addTearDown(container.dispose);
  final sub = container.listen(agendaWidgetSnapshotProvider, (_, __) {});
  addTearDown(sub.close);
  await container.read(authProvider.future);
  for (var i = 0; i < 3; i++) {
    await Future<void>.delayed(Duration.zero);
  }
  return container.read(agendaWidgetSnapshotProvider);
}

Map<String, dynamic> _decode(String? json) =>
    jsonDecode(json!) as Map<String, dynamic>;

void main() {
  test('atleta: grava os próximos compromissos', () async {
    final json = _decode(
      await _snapshot(user: MockUser(uid: 'u1'), role: AppMobileRole.athlete),
    );

    expect(json['signedIn'], isTrue);
    expect((json['items'] as List).single['id'], 'amanha');
  });

  test('sem sessão: grava vazio, sem agenda de ninguém no widget', () async {
    final json = _decode(await _snapshot(user: null, role: null));

    expect(json['signedIn'], isFalse);
    expect(json['items'], isEmpty);
  });

  test('outro papel: widget sem compromissos de atleta', () async {
    final json = _decode(
      await _snapshot(user: MockUser(uid: 'u1'), role: AppMobileRole.organizer),
    );

    expect(json['signedIn'], isTrue);
    expect(json['items'], isEmpty);
  });

  test('reservas ainda carregando: não grava nada (null)', () async {
    final snapshot = await _snapshot(
      user: MockUser(uid: 'u1'),
      role: AppMobileRole.athlete,
      bookings: const Stream<List<MyBookingItem>>.empty(),
    );

    expect(snapshot, isNull);
  });
}
