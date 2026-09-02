import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_ui_logic.dart';

TournamentCategoryOffer _offer({
  double entryFee = 360,
  String name = 'Masculino',
  String level = 'Intermediário',
  String genderType = 'male',
  List<TournamentCategoryPrize> prizes = const [],
}) {
  return TournamentCategoryOffer(
    id: 'cat1',
    name: name,
    entryFee: entryFee,
    level: level,
    genderType: genderType,
    prizes: prizes,
  );
}

TournamentDetail _detail({DateTime? startDate}) {
  return TournamentDetail(
    id: 't1',
    name: 'Torneio Rápido',
    location: 'Arena CFC',
    city: 'Goiânia',
    dateLabel: '',
    startDate: startDate ?? DateTime(2026, 6, 20),
    endDate: null,
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 180',
    priceValue: 180,
    spotsLeft: 8,
    spotsTotal: 16,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 4,
    liveMatchesNow: 0,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('partnerInviteCategoryBadge', () {
    test('combines gender label and level in Portuguese', () {
      final label = partnerInviteCategoryBadge(
        _offer(level: 'Intermediário', genderType: 'male'),
      );
      expect(label, 'Masculino Intermediário');
    });

    test('falls back to category name when level empty', () {
      final label = partnerInviteCategoryBadge(
        _offer(level: '', genderType: 'female', name: 'Sub 19 F'),
      );
      expect(label, 'Sub 19 F');
    });
  });

  group('partnerInvitePrizeLabel', () {
    test('sums category prizes', () {
      final label = partnerInvitePrizeLabel(
        _offer(
          prizes: const [
            TournamentCategoryPrize(position: '1', value: 4001),
            TournamentCategoryPrize(position: '2', value: 1000),
          ],
        ),
      );
      expect(label, contains('5.001'));
    });

    test('returns fallback when no prizes', () {
      expect(partnerInvitePrizeLabel(_offer()), 'Premiação a confirmar');
      expect(partnerInvitePrizeLabel(null), 'Premiação a confirmar');
    });
  });

  group('partnerInviteShareFeeLabel', () {
    test('returns half of entry fee for dupla', () {
      final label = partnerInviteShareFeeLabel(_offer(entryFee: 360));
      expect(label, contains('180'));
    });

    test('returns Grátis when entry fee is zero', () {
      expect(partnerInviteShareFeeLabel(_offer(entryFee: 0)), 'Grátis');
    });
  });

  group('partnerInviteHomeCategoryParts', () {
    test('uses short gender and level', () {
      final parts = partnerInviteHomeCategoryParts(
        _offer(level: 'Intermediário', genderType: 'male'),
      );
      expect(parts.genderShort, 'Masc.');
      expect(parts.level, 'Intermediário');
    });
  });

  group('partnerInviteCompactDate', () {
    test('uses middle dot separator', () {
      final label = partnerInviteCompactDate(_detail());
      expect(label, contains('·'));
      expect(label, isNot(contains('•')));
    });
  });
}
