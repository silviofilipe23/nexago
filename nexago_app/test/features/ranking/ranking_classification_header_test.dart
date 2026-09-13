import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_classification_header.dart';

void main() {
  testWidgets('mostra só o título Classificação', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(20),
            child: RankingClassificationHeader(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Classificação'), findsOneWidget);
    expect(find.textContaining('ATLETAS'), findsNothing);
    expect(find.textContaining('DUPLAS'), findsNothing);
  });
}
