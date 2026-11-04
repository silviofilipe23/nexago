import 'dart:async';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart' show IdTokenResult;
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/auth/auth_service.dart';
import 'package:nexago_app/core/auth/role_preferences_repository.dart';
import 'package:nexago_app/core/biometric/biometric_app_gate.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/router/app_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/data/athlete_profile_repository.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/onboarding/data/twin_account_check_service.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeAnalyticsService implements AnalyticsService {
  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _NoopFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoopFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// `users/{uid}` em memória: quem assina recebe o valor atual e as mudanças,
/// como o snapshot do Firestore.
class _ProfileDoc {
  _ProfileDoc(this.value);
  AthleteProfile? value;
  final _changes = StreamController<AthleteProfile?>.broadcast();

  Stream<AthleteProfile?> watch() async* {
    // Snapshot do Firestore nunca é síncrono: há um intervalo de "carregando".
    await Future<void>.delayed(const Duration(milliseconds: 80));
    yield value;
    yield* _changes.stream;
  }

  void set(AthleteProfile? next) {
    value = next;
    _changes.add(next);
  }
}

class _FakeProfileRepository extends AthleteProfileRepository {
  _FakeProfileRepository(this.doc)
      : super(_NoopFirestore(), functions: _NoopFunctions());

  final _ProfileDoc doc;
  int saves = 0;

  @override
  Future<void> grantAthleteRole({Duration? timeout}) async {}

  @override
  Future<String> uploadAvatar({
    required String uid,
    required Uint8List bytes,
    required String contentType,
    Duration? timeout,
  }) async =>
      'https://cdn.test/avatar.jpg';

  @override
  Future<void> saveProfile(AthleteProfile profile) async {
    saves++;
    doc.set(profile);
  }
}

class _NoTwin extends TwinAccountCheckService {
  @override
  Future<PhoneInOtherAccount?> findOtherAccount({
    required String phoneNumber,
    required String birthDate,
  }) async =>
      null;
}

Uint8List _pngBytes() => Uint8List.fromList(const [
      0x89,
      0x50,
      0x4E,
      0x47,
      0x0D,
      0x0A,
      0x1A,
      0x0A,
      0x00,
      0x00,
      0x00,
      0x0D,
      0x49,
      0x48,
      0x44,
      0x52,
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01,
      0x08,
      0x06,
      0x00,
      0x00,
      0x00,
      0x1F,
      0x15,
      0xC4,
      0x89,
      0x00,
      0x00,
      0x00,
      0x0A,
      0x49,
      0x44,
      0x41,
      0x54,
      0x78,
      0x9C,
      0x63,
      0x00,
      0x01,
      0x00,
      0x00,
      0x05,
      0x00,
      0x01,
      0x0D,
      0x0A,
      0x2D,
      0xB4,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4E,
      0x44,
      0xAE,
      0x42,
      0x60,
      0x82,
    ]);

/// No aparelho `getIdTokenResult` atravessa o canal de plataforma: o redirect
/// assíncrono do router leva alguns milissegundos, não um microtask.
// MockUser é @immutable só no papel (tem campos mutáveis internos).
// ignore: must_be_immutable
class _SlowTokenUser extends MockUser {
  _SlowTokenUser() : super(uid: 'u1', email: 'ana@nexago.test');

  @override
  Future<IdTokenResult> getIdTokenResult([bool forceRefresh = false]) async {
    await Future<void>.delayed(const Duration(milliseconds: 60));
    return super.getIdTokenResult(forceRefresh);
  }
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  testWidgets(
    'concluir o cadastro leva à home e não devolve o atleta ao formulário '
    '(router e gate reais, snapshot e token com latência de aparelho)',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final rolePrefs = await RolePreferencesRepository.create();
      final user = _SlowTokenUser();
      final mockAuth = MockFirebaseAuth(signedIn: true, mockUser: user);
      final doc = _ProfileDoc(
        const AthleteProfile(
            id: 'u1', name: '', sport: '', level: '', city: ''),
      );
      final repo = _FakeProfileRepository(doc);

      final container = ProviderContainer(
        overrides: [
          firebaseAuthProvider.overrideWithValue(mockAuth),
          authServiceProvider.overrideWith((ref) => AuthService(mockAuth)),
          athleteProfileProvider.overrideWith((ref) => doc.watch()),
          athleteProfileRepositoryProvider.overrideWithValue(repo),
          analyticsServiceProvider.overrideWithValue(_FakeAnalyticsService()),
          rolePreferencesRepositoryProvider.overrideWithValue(rolePrefs),
          twinAccountCheckServiceProvider.overrideWithValue(_NoTwin()),
        ],
      );
      await container.read(authProvider.future);

      container.read(athleteOnboardingDraftProvider.notifier)
        ..setPrimarySport('beach_volleyball')
        ..setLevel('Iniciante 1')
        ..setName('Ana')
        ..setPhoneNumber('(62) 99999-8888')
        ..setBirthDate('01/01/2000')
        ..setGender('Feminino')
        ..setUf('GO')
        ..setCity('Goiânia')
        ..setAvatar(bytes: _pngBytes(), contentType: 'image/png');

      // Mesma árvore de produção: o gate fica ACIMA do MaterialApp.router.
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: Consumer(
            builder: (context, ref, _) => BiometricAppGate(
              child: MaterialApp.router(
                theme: AppTheme.dark,
                routerConfig: ref.watch(goRouterProvider),
              ),
            ),
          ),
        ),
      );
      final router = container.read(goRouterProvider);
      String location() => router.routerDelegate.currentConfiguration.uri.path;

      await _settle(tester);
      router.go(AppRoutes.athleteOnboardingProfile);
      await _settle(tester);
      expect(location(), AppRoutes.athleteOnboardingProfile);

      await tester.ensureVisible(find.text('Concluir cadastro'));
      await tester.tap(find.text('Concluir cadastro'));
      await _settle(tester, frames: 60);

      expect(repo.saves, 1);
      expect(
        location(),
        AppRoutes.discover,
        reason: 'o perfil foi salvo: o atleta tem de sair do onboarding — '
            'em campo 40% voltavam ao formulário e tocavam "Concluir" de novo',
      );
      expect(find.text('Concluir cadastro'), findsNothing);

      // A home e os providers com cache deixam timers vivos: desmonta,
      // descarta o container e drena.
      await tester.pumpWidget(const SizedBox.shrink());
      container.dispose();
      await tester.pump(const Duration(minutes: 10));
    },
  );
}

/// Frames de 100 ms: dá tempo às latências simuladas sem `pumpAndSettle`
/// (a home tem animações contínuas).
Future<void> _settle(WidgetTester tester, {int frames = 10}) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}
