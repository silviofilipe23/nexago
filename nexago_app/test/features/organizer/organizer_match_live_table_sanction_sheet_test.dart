import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_sanction_sheet.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_sanction.dart';

void main() {
  LiveTableTeamData team(String label, String p1, String p2) =>
      LiveTableTeamData(
        label: label,
        player1: OrganizerCategoryPlayerInfo(uid: 'u-$p1', name: p1),
        player2: OrganizerCategoryPlayerInfo(uid: 'u-$p2', name: p2),
      );

  Future<void> pump(
    WidgetTester tester, {
    required ValueChanged<SanctionChoice> onConfirm,
    required ValueChanged<String> onRemove,
    List<MatchSanction> sanctions = const [],
  }) {
    return tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MatchSanctionSheet(
            teamA: team('Dupla A', 'Ana', 'Bia'),
            teamB: team('Dupla B', 'Cris', 'Dani'),
            sanctions: sanctions,
            onConfirm: onConfirm,
            onRemove: onRemove,
          ),
        ),
      ),
    );
  }

  testWidgets('só habilita lançar depois de escolher o atleta', (tester) async {
    SanctionChoice? picked;
    await pump(tester, onConfirm: (c) => picked = c, onRemove: (_) {});

    final confirm = find.byKey(const ValueKey('sanction-confirm'));
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull);

    await tester.tap(find.byKey(const ValueKey('sanction-card-red')));
    await tester.tap(find.byKey(const ValueKey('sanction-player-B2')));
    await tester.pump();
    await tester.ensureVisible(confirm);
    await tester.tap(confirm);

    expect(picked?.card, MatchSanctionCard.red);
    expect(picked?.side, 'B');
    expect(picked?.slot, 2);
    expect(picked?.playerName, 'Dani');
  });

  testWidgets('lista os cartões lançados e remove pelo id', (tester) async {
    String? removed;
    await pump(
      tester,
      onConfirm: (_) {},
      onRemove: (id) => removed = id,
      sanctions: const [
        MatchSanction(
          id: 's1',
          card: MatchSanctionCard.yellow,
          side: 'A',
          playerSlot: 1,
          playerName: 'Ana',
          setIndex: 0,
          scoreA: 5,
          scoreB: 3,
        ),
      ],
    );

    await tester.ensureVisible(find.byTooltip('Remover cartão'));
    await tester.tap(find.byTooltip('Remover cartão'));
    expect(removed, 's1');
    expect(find.textContaining('Set 1 · 5x3'), findsOneWidget);
  });
}
