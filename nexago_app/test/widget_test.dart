import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/main.dart';

void main() {
  testWidgets('Sem sessão: exibe fluxo de login', (WidgetTester tester) async {
    final mockAuth = MockFirebaseAuth();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(mockAuth),
        ],
        child: const NexagoApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bem-vindo de volta'), findsOneWidget);
    expect(find.text('Entrar'), findsOneWidget);
    expect(find.text('Criar conta'), findsOneWidget);
  });

  testWidgets('Com sessão: exibe AthleteShellPage', (WidgetTester tester) async {
    final mockAuth = MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(
        uid: 'test-uid',
        email: 'test@example.com',
        isEmailVerified: true,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(mockAuth),
          arenasStreamProvider.overrideWith((ref) => Stream.value(const <ArenaListItem>[])),
        ],
        child: const NexagoApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(BottomNavigationBar), findsOneWidget);
    expect(find.text('Início'), findsWidgets);
    expect(find.text('Perfil'), findsOneWidget);
  });
}
