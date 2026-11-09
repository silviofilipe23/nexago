import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart'
    show PigeonUserInfo;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/auth/auth_service.dart';
import 'package:nexago_app/core/biometric/biometric_app_gate.dart';
import 'package:nexago_app/core/biometric/biometric_lock_screen.dart';
import 'package:nexago_app/core/biometric/biometric_providers.dart';
import 'package:nexago_app/core/biometric/biometric_service.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/theme_mode_provider.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

class _FakeBiometricService extends BiometricService {
  _FakeBiometricService({this.result = true});

  final bool result;
  int calls = 0;

  @override
  Future<String> primaryMethodLabel() async => 'Face ID';

  @override
  Future<bool> authenticate({
    required String localizedReason,
    bool biometricOnly = true,
  }) async {
    calls++;
    return result;
  }
}

class _FakeAuthService extends AuthService {
  _FakeAuthService(super.auth, {this.wrongPassword = false});

  final bool wrongPassword;
  String? lastPassword;

  @override
  Future<void> reauthenticateWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    lastPassword = password;
    if (wrongPassword) {
      throw FirebaseAuthException(code: 'wrong-password');
    }
  }
}

MockUser _user({required bool password}) => MockUser(
      uid: 'u1',
      email: 'ana@email.com',
      displayName: 'Ana Maria Lima',
      photoURL: '',
      providerData: [
        UserInfo.fromPigeon(
          PigeonUserInfo(
            uid: 'u1',
            email: 'ana@email.com',
            providerId: password ? 'password' : 'google.com',
            isAnonymous: false,
            isEmailVerified: true,
          ),
        ),
      ],
    );

Future<({_FakeBiometricService bio, _FakeAuthService auth, List<int> signOuts})>
    _pump(
  WidgetTester tester, {
  bool passwordAccount = true,
  bool wrongPassword = false,
  bool biometricOk = true,
  VoidCallback? onUnlocked,
}) async {
  final mockUser = _user(password: passwordAccount);
  final mockAuth = MockFirebaseAuth(signedIn: true, mockUser: mockUser);
  final bio = _FakeBiometricService(result: biometricOk);
  final auth = _FakeAuthService(mockAuth, wrongPassword: wrongPassword);
  final signOuts = <int>[];

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        firebaseAuthProvider.overrideWithValue(mockAuth),
        authServiceProvider.overrideWithValue(auth),
        authProvider.overrideWith((ref) => Stream.value(mockUser)),
        athleteProfileProvider.overrideWith(
          (ref) => Stream.value(AthleteProfile.draft(mockUser)),
        ),
        biometricServiceProvider.overrideWithValue(bio),
        appSignOutProvider.overrideWithValue(() async => signOuts.add(1)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: BiometricLockScreen(onUnlocked: onUnlocked ?? () {}),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (bio: bio, auth: auth, signOuts: signOuts);
}

void main() {
  testWidgets('mostra conta, título e o botão de Face ID', (tester) async {
    await _pump(tester);

    expect(find.text('Desbloqueie o nexaGO'), findsOneWidget);
    expect(find.text('Ana Lima'), findsOneWidget);
    expect(find.text('Usar Face ID'), findsOneWidget);
    expect(find.byKey(const Key('biometric-password')), findsOneWidget);
  });

  testWidgets('Face ID aprovado desbloqueia', (tester) async {
    var unlocked = 0;
    final h = await _pump(tester, onUnlocked: () => unlocked++);

    await tester.tap(find.byKey(const Key('biometric-unlock')));
    await tester.pumpAndSettle();

    expect(h.bio.calls, 1);
    expect(unlocked, 1);
  });

  testWidgets('Face ID recusado não desbloqueia', (tester) async {
    var unlocked = 0;
    await _pump(tester, biometricOk: false, onUnlocked: () => unlocked++);

    await tester.tap(find.byKey(const Key('biometric-unlock')));
    await tester.pumpAndSettle();

    expect(unlocked, 0);
  });

  testWidgets('conta sem senha (Google) não oferece "Entrar com senha"',
      (tester) async {
    await _pump(tester, passwordAccount: false);

    expect(find.byKey(const Key('biometric-password')), findsNothing);
    expect(find.byKey(const Key('biometric-sign-out')), findsOneWidget);
  });

  testWidgets('senha correta na folha desbloqueia', (tester) async {
    var unlocked = 0;
    final h = await _pump(tester, onUnlocked: () => unlocked++);

    await tester.tap(find.byKey(const Key('biometric-password')));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('ana@email.com', findRichText: true),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('biometric-password-field')),
      'segredo123',
    );
    await tester.tap(find.byKey(const Key('biometric-password-submit')));
    await tester.pumpAndSettle();

    expect(h.auth.lastPassword, 'segredo123');
    expect(unlocked, 1);
    expect(find.byKey(const Key('biometric-password-field')), findsNothing);
  });

  testWidgets('senha errada mostra o erro na folha, sem desbloquear',
      (tester) async {
    var unlocked = 0;
    await _pump(tester, wrongPassword: true, onUnlocked: () => unlocked++);

    await tester.tap(find.byKey(const Key('biometric-password')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('biometric-password-field')),
      'errada',
    );
    await tester.tap(find.byKey(const Key('biometric-password-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Senha incorreta. Tente de novo.'), findsOneWidget);
    expect(unlocked, 0);
  });

  testWidgets('"Sair da conta" encerra a sessão', (tester) async {
    final h = await _pump(tester);

    await tester.ensureVisible(find.byKey(const Key('biometric-sign-out')));
    await tester.tap(find.byKey(const Key('biometric-sign-out')));
    await tester.pumpAndSettle();

    expect(h.signOuts, [1]);
  });

  // Fiação real: o gate fica ACIMA do `MaterialApp` do app. Antes a camada
  // não tinha Theme nem Navigator — saía no Material padrão e "Entrar com
  // senha" quebrava ao abrir o diálogo.
  testWidgets(
      'gate acima do app: bloqueio no tema nexaGO e folha de senha abre',
      (tester) async {
    final mockUser = _user(password: true);
    final mockAuth = MockFirebaseAuth(signedIn: true, mockUser: mockUser);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(mockAuth),
          authServiceProvider.overrideWithValue(_FakeAuthService(mockAuth)),
          authProvider.overrideWith((ref) => Stream.value(mockUser)),
          athleteProfileProvider.overrideWith(
            (ref) => Stream.value(
              AthleteProfile.draft(mockUser).copyWith(useBiometric: true),
            ),
          ),
          biometricServiceProvider.overrideWithValue(_FakeBiometricService()),
          resolvedThemeModeProvider.overrideWithValue(ThemeMode.dark),
        ],
        child: const BiometricAppGate(
          child: MaterialApp(home: Scaffold(body: Text('app'))),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Desbloqueie o nexaGO'), findsOneWidget);
    final scaffold = tester.widget<Scaffold>(
      find.ancestor(
        of: find.text('Desbloqueie o nexaGO'),
        matching: find.byType(Scaffold),
      ),
    );
    final ctx = tester.element(find.text('Desbloqueie o nexaGO'));
    expect(scaffold.backgroundColor,
        Theme.of(ctx).colorScheme.surfaceContainerLowest);
    expect(Theme.of(ctx).textTheme.bodyMedium?.fontFamily, contains('Sora'));

    await tester.tap(find.byKey(const Key('biometric-password')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('biometric-password-field')), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('biometric-password-field')),
      'segredo123',
    );
    await tester.tap(find.byKey(const Key('biometric-password-submit')));
    await tester.pumpAndSettle();
    expect(find.text('Desbloqueie o nexaGO'), findsNothing);
    expect(find.text('app'), findsOneWidget);
  });
}
