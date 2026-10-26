import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_app_payout.dart';

/// Inscrição de R$ 100 com a taxa padrão de 8%, nos três "Quem paga" do PR
/// #954. O bruto do extrato é sempre o preço; o que muda é de quem sai a taxa.
const _organizerPays = TournamentLedgerCredit(
  registrationId: 'r1',
  grossCents: 10000,
  netCents: 9200,
  organizerFeeCents: 800,
);

const _athletePays = TournamentLedgerCredit(
  registrationId: 'r1',
  grossCents: 10000,
  netCents: 10000,
  athleteFeeCents: 800,
);

const _split = TournamentLedgerCredit(
  registrationId: 'r1',
  grossCents: 10000,
  netCents: 9600,
  organizerFeeCents: 400,
  athleteFeeCents: 400,
);

TournamentLedgerCredit _credit(
  TournamentLedgerCredit base, {
  required String registrationId,
}) {
  return TournamentLedgerCredit(
    registrationId: registrationId,
    grossCents: base.grossCents,
    netCents: base.netCents,
    organizerFeeCents: base.organizerFeeCents,
    athleteFeeCents: base.athleteFeeCents,
    gatewayFeeCents: base.gatewayFeeCents,
  );
}

OrganizerCategoryTeamRow _team(
  String registrationId, {
  int paidAmountCents = 10000,
  String paymentMethod = 'pix',
  OrganizerTeamRegistrationStatus status =
      OrganizerTeamRegistrationStatus.confirmed,
}) {
  return OrganizerCategoryTeamRow(
    registrationId: registrationId,
    teamId: 'team-$registrationId',
    player1: OrganizerCategoryPlayerInfo(uid: 'a-$registrationId'),
    player2: OrganizerCategoryPlayerInfo(uid: 'b-$registrationId'),
    status: status,
    paidAmountCents: paidAmountCents,
    expectedAmountCents: 10000,
    paymentMethod: paymentMethod,
  );
}

void main() {
  group('TournamentLedgerCredit.fromMap', () {
    test('lê o crédito do webhook em centavos', () {
      final credit = TournamentLedgerCredit.fromMap({
        'type': 'credit',
        'registrationId': ' r1 ',
        'grossReais': 130,
        'platformFeeReais': 10.4,
        'gatewayFeeReais': 4.37,
        'netReais': 115.23,
      })!;

      expect(credit.registrationId, 'r1');
      expect(credit.grossCents, 13000);
      expect(credit.organizerFeeCents, 1040);
      expect(credit.gatewayFeeCents, 437);
      expect(credit.netCents, 11523);
      // Lançamento de antes do "Quem paga": sem a parte do atleta.
      expect(credit.athleteFeeCents, 0);
    });

    test('lê a parte do atleta (serviceFeeReais)', () {
      final credit = TournamentLedgerCredit.fromMap({
        'type': 'credit',
        'registrationId': 'r1',
        'grossReais': 100,
        'platformFeeReais': 0,
        'serviceFeeReais': 8,
        'netReais': 100,
      })!;

      expect(credit.athleteFeeCents, 800);
      expect(credit.organizerFeeCents, 0);
      expect(credit.netCents, 10000);
    });

    test('lançamento que não é crédito fica fora', () {
      expect(
        TournamentLedgerCredit.fromMap({'type': 'refund', 'netReais': 10}),
        isNull,
      );
    });

    test('arredonda por lançamento, não na soma', () {
      final credits = List.generate(
        3,
        (_) => TournamentLedgerCredit.fromMap({
          'type': 'credit',
          'registrationId': 'r',
          'grossReais': 0.1 + 0.2,
          'netReais': 0.1 + 0.2,
        })!,
      );
      final payout = buildTournamentAppPayout(
        viaAppCents: 90,
        credits: credits,
      );

      expect(payout.creditedNetCents, 90);
    });
  });

  group('buildTournamentAppPayout', () {
    test('organizador paga: o líquido é o do extrato, não 6% fixo', () {
      final payout = buildTournamentAppPayout(
        viaAppCents: 20000,
        credits: [
          _organizerPays,
          _credit(_organizerPays, registrationId: 'r2'),
        ],
      );

      expect(payout.netTransferCents, 18400);
      expect(payout.organizerFeeCents, 1600);
      expect(payout.feePayer, OrganizerFeePayer.organizer);
      expect(payout.outsideCashBoxCents, 0);
      expect(appFeeBadgeLabel(payout), '8% TAXA');
    });

    test('atleta paga: o organizador recebe o preço inteiro', () {
      final payout = buildTournamentAppPayout(
        viaAppCents: 10000,
        credits: const [_athletePays],
      );

      expect(payout.netTransferCents, 10000);
      expect(payout.organizerFeeCents, 0);
      expect(payout.athleteFeeCents, 800);
      expect(payout.feePayer, OrganizerFeePayer.athlete);
      expect(appFeeBadgeLabel(payout), 'TAXA PAGA PELO ATLETA');
      expect(
        tournamentAppPayoutDetails(payout),
        contains('A taxa nexaGO foi paga pelo atleta, por cima da inscrição'),
      );
    });

    test('dividido: o organizador paga só a metade dele', () {
      final payout = buildTournamentAppPayout(
        viaAppCents: 10000,
        credits: const [_split],
      );

      expect(payout.netTransferCents, 9600);
      expect(payout.organizerFeeCents, 400);
      expect(payout.athleteFeeCents, 400);
      expect(payout.feePayer, OrganizerFeePayer.split);
      expect(appFeeBadgeLabel(payout), 'TAXA DIVIDIDA');
      expect(
        tournamentAppPayoutDetails(payout),
        contains(r'Taxa nexaGO dividida: R$ 4 sua, R$ 4 do atleta'),
      );
    });

    test('a liberar entra no repasse e o não creditado aparece pelo pago', () {
      final payout = buildTournamentAppPayout(
        viaAppCents: 23000,
        credits: const [_organizerPays],
        awaitingSettlementReais: 115.23,
      );

      expect(payout.creditedNetCents, 9200);
      expect(payout.awaitingSettlementCents, 11523);
      expect(payout.netTransferCents, 20723);
      expect(payout.outsideCashBoxCents, 13000);
      expect(tournamentAppPayoutDetails(payout), [
        r'R$ 92 no caixa · R$ 115.23 a liberar',
        r'R$ 130 pagos pelo app ainda não caíram no caixa, cartões a liberar incluídos',
      ]);
    });

    test('taxa do cartão aparece, já descontada do líquido', () {
      final payout = buildTournamentAppPayout(
        viaAppCents: 10000,
        credits: const [
          TournamentLedgerCredit(
            registrationId: 'r1',
            grossCents: 10000,
            netCents: 8851,
            organizerFeeCents: 800,
            gatewayFeeCents: 349,
          ),
        ],
      );

      expect(payout.netTransferCents, 8851);
      expect(tournamentAppPayoutDetails(payout), [
        r'Taxa do cartão de R$ 3.49 já descontada',
      ]);
    });

    test('a taxa do selo é a efetiva, com o mínimo por inscrição', () {
      // R$ 15 com mínimo de R$ 1,50: 10%, não os 8% da regra.
      final cheap = buildTournamentAppPayout(
        viaAppCents: 1500,
        credits: const [
          TournamentLedgerCredit(
            registrationId: 'r1',
            grossCents: 1500,
            netCents: 1350,
            organizerFeeCents: 150,
          ),
        ],
      );
      expect(appFeeBadgeLabel(cheap), '10% TAXA');

      final mixed = buildTournamentAppPayout(
        viaAppCents: 11500,
        credits: const [
          _organizerPays,
          TournamentLedgerCredit(
            registrationId: 'r2',
            grossCents: 1500,
            netCents: 1350,
            organizerFeeCents: 150,
          ),
        ],
      );
      expect(appFeeBadgeLabel(mixed), '8,3% TAXA');
    });

    test('sem crédito no caixa o selo não arrisca número', () {
      final payout = buildTournamentAppPayout(
        viaAppCents: 10000,
        credits: const [],
      );

      expect(appFeeBadgeLabel(payout), 'TAXA NEXAGO');
      expect(appFeeBadgeLabel(null), 'TAXA NEXAGO');
      expect(payout.netTransferCents, 0);
      expect(payout.outsideCashBoxCents, 10000);
      expect(tournamentAppPayoutDetails(payout), [
        r'R$ 100 pagos pelo app ainda não caíram no caixa',
      ]);
    });
  });

  group('buildCategoryAppPayout', () {
    test('só conta os créditos das inscrições da categoria', () {
      final payout = buildCategoryAppPayout(
        teams: [_team('r1'), _team('r2')],
        credits: [
          _organizerPays,
          _credit(_organizerPays, registrationId: 'r2'),
          _credit(_organizerPays, registrationId: 'outra-categoria'),
        ],
      );

      expect(payout.creditCount, 2);
      expect(payout.creditedNetCents, 18400);
      expect(payout.outsideCashBoxCents, 0);
      expect(categoryAppPayoutDetails(payout), [
        'Já no caixa · 8% de taxa nexaGO',
      ]);
    });

    test('atleta paga e dividido descrevem quem pagou', () {
      final athlete = buildCategoryAppPayout(
        teams: [_team('r1')],
        credits: const [_athletePays],
      );
      expect(athlete.creditedNetCents, 10000);
      expect(categoryAppPayoutDetails(athlete), [
        'Já no caixa · taxa nexaGO paga pelo atleta',
      ]);

      final split = buildCategoryAppPayout(
        teams: [_team('r1')],
        credits: const [_split],
      );
      expect(split.creditedNetCents, 9600);
      expect(categoryAppPayoutDetails(split), [
        'Já no caixa · taxa nexaGO dividida com o atleta',
      ]);
    });

    test('o que falta cair no caixa é medido por inscrição', () {
      final payout = buildCategoryAppPayout(
        teams: [
          // Dupla que pagou em duas partes, só uma creditada.
          _team('r1', paidAmountCents: 20000),
          // Ainda sem crédito (cartão a liberar, por exemplo).
          _team('r2'),
          // Por fora e pendente não têm o que cair no caixa.
          _team('r3', paymentMethod: kOrganizerDirectPaymentMethod),
          _team(
            'r4',
            paidAmountCents: 0,
            status: OrganizerTeamRegistrationStatus.pending,
          ),
        ],
        credits: const [_organizerPays],
      );

      expect(payout.creditedNetCents, 9200);
      expect(payout.outsideCashBoxCents, 20000);
      expect(
        categoryAppPayoutDetails(payout).last,
        startsWith(r'R$ 200 pagos pelo app ainda não caíram no caixa'),
      );
    });

    test('nada creditado ainda', () {
      final payout = buildCategoryAppPayout(
        teams: [_team('r1')],
        credits: const [],
      );

      expect(
        categoryAppPayoutDetails(payout).first,
        'Nada desta categoria caiu no caixa ainda',
      );
    });
  });
}
