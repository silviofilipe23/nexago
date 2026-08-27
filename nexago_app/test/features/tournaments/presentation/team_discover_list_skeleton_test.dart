import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/team_discover/team_discover_list_skeleton.dart';

void main() {
  testWidgets(
      'não lança RenderViewport intrinsic error dentro de SliverFillRemaining',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: CustomScrollView(
            slivers: const [
              SliverFillRemaining(
                child: TeamDiscoverListSkeleton(),
              ),
            ],
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.byType(TeamDiscoverListSkeleton), findsOneWidget);
  });
}
