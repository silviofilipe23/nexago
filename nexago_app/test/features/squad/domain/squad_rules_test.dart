import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/squad/domain/squad_rules.dart';

import '../squad_test_support.dart';

SquadEarnings _earnings({
  int available = 4800,
  int? next,
  int minPayout = 2000,
  String nextPayoutDate = '2026-10-20',
}) => SquadEarnings(
  totalCents: 32400,
  availableCents: available,
  nextPayoutCents: next ?? available,
  pendingCents: 0,
  receivedCents: 0,
  revenueCents: 0,
  nextPayoutDate: nextPayoutDate,
  minPayoutCents: minPayout,
);

SquadCommission _commission(
  SquadCommissionStatus status, {
  String? cancelReason,
}) => SquadCommission(
  id: 'c',
  at: null,
  label: 'Lucas M.',
  tournamentName: 'Open Errejota',
  categoryName: 'Masc. C',
  origin: 'code',
  amountCents: 1200,
  status: status,
  cancelReason: cancelReason,
);

SquadProgress _progress({
  int conversions = 7,
  int min = 12,
  DateTime? reviewDate,
  SquadTier to = SquadTier.amb,
}) => SquadProgress(
  toTier: to,
  conversions: conversions,
  minConversions: min,
  reviewDate: reviewDate,
);

SquadRankingEntry _entry({int? delta}) => SquadRankingEntry(
  position: 3,
  name: 'João Victor',
  photoUrl: null,
  points: 1280,
  delta: delta,
  me: true,
);

void main() {
  group(
    'squadDiscountPreviewCents (espelho de squad-discount.ts do portal)',
    () {
      test('% sobre o preço, arredondado ao centavo', () {
        expect(squadDiscountPreviewCents(15000, 10, null), 1500);
        expect(squadDiscountPreviewCents(6667, 15, null), 1000);
      });

      test(
        'teto na taxa da plataforma: R\$ 100 com 10% e taxa de 5% = R\$ 5',
        () {
          expect(squadDiscountPreviewCents(10000, 10, 5), 500);
          // R$ 150 × 15% = R$ 22,50; taxa de 8% = R$ 12,00.
          expect(squadDiscountPreviewCents(15000, 15, 8), 1200);
        },
      );

      test('a taxa tem piso de R\$ 1,50: o teto nunca fica abaixo dele', () {
        // R$ 10 × 30% = R$ 3,00; 8% de R$ 10 = R$ 0,80 → piso R$ 1,50.
        expect(squadDiscountPreviewCents(1000, 30, 8), 150);
      });

      test('nunca deixa a cobrança abaixo do mínimo do Asaas (R\$ 5)', () {
        expect(squadDiscountPreviewCents(600, 30, null), 100);
        expect(squadDiscountPreviewCents(500, 30, null), 0);
        // Preço já abaixo do mínimo: nada de desconto negativo.
        expect(squadDiscountPreviewCents(400, 10, null), 0);
      });

      test('fee null (torneio sem organizador) não tem teto de taxa', () {
        expect(squadDiscountPreviewCents(15000, 15, null), 2250);
      });

      test('taxa 0% zera o desconto (a nexaGO banca com a taxa)', () {
        expect(squadDiscountPreviewCents(15000, 15, 0), 0);
      });

      test('pct 0, negativo ou preço zerado: sem desconto', () {
        expect(squadDiscountPreviewCents(15000, 0, 8), 0);
        expect(squadDiscountPreviewCents(15000, -10, null), 0);
        expect(squadDiscountPreviewCents(0, 10, null), 0);
      });
    },
  );

  group('squadPlatformFeeCents', () {
    test('% do preço ou o piso de R\$ 1,50, nunca o preço inteiro', () {
      expect(squadPlatformFeeCents(10000, 8), 800);
      expect(squadPlatformFeeCents(1000, 8), 150);
      expect(squadPlatformFeeCents(100, 8), 99);
    });

    test('null sem organizador; 0 sem preço ou sem taxa', () {
      expect(squadPlatformFeeCents(10000, null), isNull);
      expect(squadPlatformFeeCents(0, 8), 0);
      expect(squadPlatformFeeCents(10000, 0), 0);
    });
  });

  group('datas', () {
    test(
      'squadWeekLabels: dia/mês na primeira e na virada, só o dia nas outras',
      () {
        final weeks = [
          for (final key in [
            '2026-09-08',
            '2026-09-15',
            '2026-09-22',
            '2026-09-29',
            '2026-10-06',
            '2026-10-13',
          ])
            SquadWeek(weekStart: key, cents: 0),
        ];

        expect(squadWeekLabels(weeks), ['8/9', '15', '22', '29', '6/10', '13']);
        expect(squadWeekLabels(const []), isEmpty);
      },
    );

    test('squadDayKeyLabel: "20 out" a partir da data civil, sem fuso', () {
      expect(squadDayKeyLabel('2026-10-20'), '20 out');
      expect(squadDayKeyLabel('2026-01-05'), '05 jan');
      expect(squadDayKeyLabel('2026-12-31'), '31 dez');
    });

    test('squadDayKeyLabel: chave inválida volta como veio', () {
      expect(squadDayKeyLabel(''), '');
      expect(squadDayKeyLabel('20/10/2026'), '20/10/2026');
      expect(squadDayKeyLabel('2026-13-01'), '2026-13-01');
      expect(squadDayKeyLabel('2026-10-00'), '2026-10-00');
    });

    test('squadDayMonth formata o instante UTC no calendário de São Paulo', () {
      // 02:30 UTC de 21/10 ainda é 20/10 (23:30) em São Paulo.
      expect(squadDayMonth(DateTime.utc(2026, 10, 21, 2, 30)), '20 out');
      expect(squadDayMonth(DateTime.utc(2026, 10, 21, 3)), '21 out');
    });

    test('squadRelativeDay: Hoje, Ontem ou a data, no calendário de SP', () {
      final now = DateTime.utc(2026, 10, 17, 15);

      expect(squadRelativeDay(DateTime.utc(2026, 10, 17, 4), now), 'Hoje');
      // 02:00 UTC de 17/10 = 23:00 de 16/10 em SP.
      expect(squadRelativeDay(DateTime.utc(2026, 10, 17, 2), now), 'Ontem');
      expect(squadRelativeDay(DateTime.utc(2026, 10, 13, 15), now), '13 out');
    });

    test('squadPeriodLabel: "08 set → 06 dez"; sem uma das pontas, vazio', () {
      final start = DateTime.utc(2026, 9, 8, 3);
      final end = DateTime.utc(2026, 12, 7, 2, 59);

      expect(squadPeriodLabel(start, end), '08 set → 06 dez');
      expect(squadPeriodLabel(null, end), '');
      expect(squadPeriodLabel(start, null), '');
    });
  });

  group('números', () {
    test('squadPercent: inteiro sem casa, fração com vírgula', () {
      expect(squadPercent(10), '10%');
      expect(squadPercent(12.5), '12,5%');
      expect(squadPercent(15.0), '15%');
    });

    test('squadThousands: separador de milhar com ponto', () {
      expect(squadThousands(0), '0');
      expect(squadThousands(999), '999');
      expect(squadThousands(1280), '1.280');
      expect(squadThousands(1234567), '1.234.567');
      expect(squadThousands(-1280), '-1.280');
    });

    test('squadSplitBRL separa os centavos do número grande', () {
      final (whole, cents) = squadSplitBRL(32400);

      expect(cents, ',00');
      expect('$whole$cents', formatBRLFromCents(32400));
    });
  });

  group('extrato (tela 03)', () {
    test('comissões e repasses do mais recente para o mais antigo', () {
      final statement = squadStatement(squadMember());

      expect(statement.map((i) => i.title), [
        'Ana P. · Copa Sol',
        'Repasse para a carteira',
        'Pedro A. · Open Errejota',
        'Lucas M. · Open Errejota',
      ]);
      expect(statement.map((i) => i.kind), [
        SquadStatementKind.commission,
        SquadStatementKind.payout,
        SquadStatementKind.commission,
        SquadStatementKind.commission,
      ]);
    });

    test('repasse com "− R\$", cancelada sem "+", as demais com "+"', () {
      final statement = squadStatement(squadMember());
      final amounts = statement.map(squadStatementAmount).toList();

      expect(amounts[0], formatBRLFromCents(1000));
      expect(amounts[0], isNot(startsWith('+')));
      expect(amounts[1], '− ${formatBRLFromCents(18000)}');
      expect(amounts[2], '+ ${formatBRLFromCents(1500)}');
      expect(amounts[3], '+ ${formatBRLFromCents(1200)}');
    });

    test('item sem data vai para o fim; vazio sem comissões nem repasses', () {
      final member = squadMember(
        commissions: [
          squadCommissionPayload(id: 'sem-data', at: '', label: 'Sem Data'),
          squadCommissionPayload(
            id: 'c1',
            at: '2026-10-10T15:00:00.000Z',
            label: 'Lucas M.',
          ),
        ],
        payouts: const [],
      );

      expect(squadStatement(member).map((i) => i.commission?.id), [
        'c1',
        'sem-data',
      ]);
      expect(
        squadStatement(squadMember(commissions: const [], payouts: const [])),
        isEmpty,
      );
    });

    test('título sem o torneio quando ele não veio', () {
      final member = squadMember(
        commissions: [
          squadCommissionPayload(
            id: 'c1',
            at: '2026-10-10T15:00:00.000Z',
            label: 'Equipe CFC (4 atl.)',
            tournamentName: '  ',
          ),
        ],
        payouts: const [],
      );

      expect(squadStatement(member).single.title, 'Equipe CFC (4 atl.)');
    });
  });

  group('status da comissão', () {
    test('rótulo longo e curto', () {
      expect(
        squadCommissionStatusLabel(_commission(SquadCommissionStatus.pending)),
        'Aguardando pgto',
      );
      expect(
        squadCommissionStatusLabel(
          _commission(SquadCommissionStatus.pending),
          short: true,
        ),
        'Aguardando',
      );
      expect(
        squadCommissionStatusLabel(_commission(SquadCommissionStatus.released)),
        'Liberada',
      );
      expect(
        squadCommissionStatusLabel(_commission(SquadCommissionStatus.paid)),
        'Paga',
      );
    });

    test(
      'cancelada diz o motivo (reembolso, estorno) e "manual" fica neutro',
      () {
        String label(String reason) => squadCommissionStatusLabel(
          _commission(SquadCommissionStatus.canceled, cancelReason: reason),
        );

        expect(label('refund'), 'Cancelada · reembolso');
        expect(label('chargeback'), 'Cancelada · estorno');
        expect(label('manual'), 'Cancelada');
      },
    );

    test('tom por status', () {
      expect(
        squadCommissionTone(_commission(SquadCommissionStatus.pending)),
        SquadStatusTone.pending,
      );
      expect(
        squadCommissionTone(_commission(SquadCommissionStatus.released)),
        SquadStatusTone.win,
      );
      expect(
        squadCommissionTone(_commission(SquadCommissionStatus.paid)),
        SquadStatusTone.muted,
      );
      expect(
        squadCommissionTone(_commission(SquadCommissionStatus.canceled)),
        SquadStatusTone.danger,
      );
    });

    test('evento: torneio · categoria, sem separador sobrando', () {
      expect(
        squadCommissionEvent(_commission(SquadCommissionStatus.paid)),
        'Open Errejota · Masc. C',
      );
    });
  });

  group('benefícios por nível', () {
    test(
      'Pro: faixa "10% a 15%", inscrições grátis sem valor e o pacote todo',
      () {
        final pkg = squadPackage('pro');
        final benefits = squadBenefits(pkg, periodEnd: '06 dez');

        expect(pkg.registrationsValue, isNull);
        expect(benefits.map((b) => b.kind), [
          SquadBenefitKind.commission,
          SquadBenefitKind.registrations,
          SquadBenefitKind.kit,
          SquadBenefitKind.events,
          SquadBenefitKind.partner,
          SquadBenefitKind.campaign,
        ]);
        expect(benefits[0].title, '10% a 15% de comissão');
        expect(benefits[1].title, 'Inscrições grátis');
        expect(benefits[1].title, isNot(matches(RegExp(r'\d'))));
        expect(benefits[1].subtitle, 'Até 06 dez');
        expect(benefits[2].subtitle, 'Kit premium + uniforme');
        expect(
          benefits[3].subtitle,
          'Prioridade + exclusivos nos torneios NexaGO',
        );
      },
    );

    test('Captain: bônus por torneio e inscrições por mês que renovam', () {
      final benefits = squadBenefits(squadPackage('cap'));

      expect(benefits.first.title, '15% de comissão');
      expect(benefits[1].title, '2 inscrições grátis/mês');
      expect(benefits[1].subtitle, 'Renova todo dia 1º');
      expect(benefits.last.kind, SquadBenefitKind.bonus);
      expect(benefits.last.title, '${formatBRLFromCents(5000)} por torneio');
      // Sem kit nem eventos no pacote: as linhas somem.
      expect(
        benefits.map((b) => b.kind),
        isNot(contains(SquadBenefitKind.kit)),
      );
      expect(
        benefits.map((b) => b.kind),
        isNot(contains(SquadBenefitKind.events)),
      );
    });

    test('Athlete: desconto nas inscrições durante o ciclo', () {
      final benefits = squadBenefits(squadPackage('ath'));

      expect(benefits[0].title, '5% de comissão');
      expect(benefits[1].title, '20% OFF nas suas inscrições');
      expect(benefits[1].subtitle, 'Durante todo o ciclo');
    });

    test('Ambassador: 1 inscrição grátis/mês no singular', () {
      expect(
        squadBenefits(squadPackage('amb'))[1].title,
        '1 inscrição grátis/mês',
      );
    });

    test('squadNextTierChips: "Até X%" na faixa e só o que o pacote tem', () {
      expect(squadNextTierChips(squadPackage('pro')), [
        'Até 15% de comissão',
        'Inscrições grátis',
        'Kit premium + uniforme',
        '50% para sua dupla',
        'Cachê por campanha',
      ]);
      expect(squadNextTierChips(squadPackage('amb')), [
        '10% de comissão',
        '1 inscrição grátis/mês',
        'Kit completo',
      ]);
    });
  });

  group('progresso e ranking', () {
    test('squadProgressLine: faltam N conversões, com a data da avaliação', () {
      expect(
        squadProgressLine(
          _progress(reviewDate: DateTime.utc(2026, 12, 7, 2, 59)),
        ),
        'Mais 5 conversões pra concorrer a Ambassador na avaliação de 06 dez.',
      );
    });

    test('squadProgressLine: singular e sem data', () {
      expect(
        squadProgressLine(_progress(conversions: 11)),
        'Mais 1 conversão pra concorrer a Ambassador.',
      );
    });

    test('squadProgressLine: meta batida (e passada) não vira "Mais 0"', () {
      for (final conversions in [12, 15]) {
        expect(
          squadProgressLine(
            _progress(conversions: conversions, to: SquadTier.pro),
          ),
          'Meta de conversões batida: você concorre a Pro Ambassador.',
        );
      }
    });

    test('squadRankingMoveLine: só quando a posição mudou na semana', () {
      expect(squadRankingMoveLine(null), isNull);
      expect(squadRankingMoveLine(_entry()), isNull);
      expect(squadRankingMoveLine(_entry(delta: 0)), isNull);
      expect(
        squadRankingMoveLine(_entry(delta: 3)),
        'Você subiu 3 posições esta semana.',
      );
      expect(
        squadRankingMoveLine(_entry(delta: 1)),
        'Você subiu 1 posição esta semana.',
      );
      expect(
        squadRankingMoveLine(_entry(delta: -2)),
        'Você caiu 2 posições esta semana.',
      );
    });

    test('squadDeltaLabel: ▲, ▼, — e "novo"', () {
      expect(squadDeltaLabel(3), '▲3');
      expect(squadDeltaLabel(-2), '▼2');
      expect(squadDeltaLabel(0), '—');
      expect(squadDeltaLabel(null), 'novo');
    });

    test('squadFirstName e squadInitials', () {
      expect(squadFirstName('  João Victor Silva '), 'João');
      expect(squadInitials('João Victor Silva'), 'JV');
      expect(squadInitials('ana'), 'A');
      expect(squadInitials('   '), '');
    });
  });

  group('código e links', () {
    test(
      'squadShareLink: portal com ?squad=, torneio no caminho e &via=qr',
      () {
        expect(
          squadShareLink(code: 'JOAO10'),
          'https://atleta.nexago.com.br/?squad=JOAO10',
        );
        expect(
          squadShareLink(code: 'JOAO10', tournamentId: ''),
          'https://atleta.nexago.com.br/?squad=JOAO10',
        );
        expect(
          squadShareLink(code: 'JOAO10', tournamentId: 't1'),
          'https://atleta.nexago.com.br/torneios/t1?squad=JOAO10',
        );
        expect(
          squadShareLink(code: 'JOAO10', tournamentId: 't1', viaQr: true),
          'https://atleta.nexago.com.br/torneios/t1?squad=JOAO10&via=qr',
        );
      },
    );

    test('squadLinkDisplay tira o esquema', () {
      expect(
        squadLinkDisplay('https://atleta.nexago.com.br/?squad=JOAO10'),
        'atleta.nexago.com.br/?squad=JOAO10',
      );
    });

    test('normalizeSquadCode: maiúsculas, sem acento e sem espaço', () {
      expect(normalizeSquadCode('joão10 '), 'JOAO10');
      expect(normalizeSquadCode(' çé 1 '), 'CE1');
      expect(normalizeSquadCode('ÁÉÍÓÚÑ'), 'AEIOUN');
      expect(normalizeSquadCode(''), '');
    });

    test('isValidSquadPersonalCode: 4 a 12 letras A–Z ou números', () {
      expect(isValidSquadPersonalCode('JOAO10'), isTrue);
      expect(isValidSquadPersonalCode('ABCD'), isTrue);
      expect(isValidSquadPersonalCode('A' * 12), isTrue);
      expect(isValidSquadPersonalCode('ABC'), isFalse);
      expect(isValidSquadPersonalCode('A' * 13), isFalse);
      expect(isValidSquadPersonalCode('joao10'), isFalse);
      expect(isValidSquadPersonalCode('JOÃO10'), isFalse);
      expect(isValidSquadPersonalCode('JOAO-10'), isFalse);
      expect(isValidSquadPersonalCode(''), isFalse);
    });

    test('normalizar e validar juntos aceitam o que o atleta digita', () {
      expect(isValidSquadPersonalCode(normalizeSquadCode('joão 10')), isTrue);
    });
  });

  group('ganhos e contrato', () {
    test('squadPayoutLine: sem disponível, explica o repasse', () {
      expect(
        squadPayoutLine(_earnings(available: 0)),
        'O que for liberado cai na carteira NexaGO a cada repasse.',
      );
    });

    test('squadPayoutLine: abaixo do mínimo o saldo acumula', () {
      expect(
        squadPayoutLine(_earnings(available: 1500)),
        'Repasse a partir de ${formatBRLFromCents(2000)}: o saldo acumula '
        'para o próximo.',
      );
    });

    test('squadPayoutLine: passou do mínimo, mostra a data "20 out"', () {
      expect(squadPayoutLine(_earnings()), 'Cai na carteira NexaGO em 20 out');
      expect(
        squadPayoutLine(_earnings(available: 2000)),
        'Cai na carteira NexaGO em 20 out',
      );
    });

    test('squadNextPayoutShort: "—" até o mínimo, a data depois', () {
      expect(squadNextPayoutShort(_earnings(available: 0)), '—');
      expect(squadNextPayoutShort(_earnings(available: 1500)), '—');
      expect(squadNextPayoutShort(_earnings()), '20 out');
    });

    test('squadPayoutLine: parte retida vai só o que entra no repasse', () {
      expect(
        squadPayoutLine(_earnings(available: 4800, next: 3000)),
        '${formatBRLFromCents(3000)} cai na carteira NexaGO em 20 out; o resto '
        'entra no repasse seguinte.',
      );
    });

    test('squadPayoutLine: tudo retido (ou liberado após o fechamento) não '
        'promete a data', () {
      expect(
        squadPayoutLine(_earnings(available: 4800, next: 0)),
        'Entra no repasse seguinte ao de 20 out.',
      );
      expect(squadNextPayoutShort(_earnings(available: 4800, next: 0)), '—');
    });

    test('squadContractNotice: pausa com e sem data de retorno', () {
      expect(
        squadContractNotice(
          squadMember(status: 'paused', pausedUntil: '2026-11-03'),
        ),
        'Contrato pausado até 03 nov: seu código não dá desconto nem gera '
        'comissão enquanto isso.',
      );
      expect(
        squadContractNotice(squadMember(status: 'paused')),
        'Contrato pausado: seu código não dá desconto nem gera comissão '
        'enquanto isso.',
      );
    });

    test(
      'squadContractNotice: fim marcado; pausa tem prioridade; ativo é null',
      () {
        expect(
          squadContractNotice(squadMember(endsAt: '2026-11-30')),
          'Seu contrato termina em 30 nov.',
        );
        expect(
          squadContractNotice(
            squadMember(status: 'paused', endsAt: '2026-11-30'),
          ),
          startsWith('Contrato pausado'),
        );
        expect(squadContractNotice(squadMember()), isNull);
      },
    );

    test('manchete e oferta mudam com piloto e "só na 1ª inscrição"', () {
      final pilot = squadMember();
      final cycle = squadMember(cycleId: '2026-2');

      expect(squadEarnedHeadline(pilot), 'Você ganhou no piloto');
      expect(squadEarnedHeadline(cycle), 'Você ganhou neste ciclo');
      expect(squadFollowerOffer(pilot), '10% OFF na 1ª inscrição de quem usar');
      expect(squadOfferShort(pilot), '10% OFF na 1ª inscrição');

      final always = SquadMember.fromMap(
        squadMemberPayload(followerDiscountFirstOnly: false),
      );
      expect(squadFollowerOffer(always), '10% OFF nas inscrições de quem usar');
      expect(squadOfferShort(always), '10% OFF nas inscrições');
    });

    test('oferta segue onde as regras ligaram o desconto', () {
      SquadMember withScope(Map<String, Object?> scope, {bool first = true}) =>
          SquadMember.fromMap({
            ...squadMemberPayload(followerDiscountFirstOnly: first),
            'followerDiscountScope': scope,
          });

      final arena = withScope({'registration': false});
      expect(
        squadOfferShort(arena),
        '10% OFF na primeira reserva e no primeiro clubinho',
      );
      expect(
        squadOfferShort(withScope({'registration': false}, first: false)),
        '10% OFF em reservas e clubinhos',
      );

      final off = withScope({
        'registration': false,
        'booking': false,
        'club': false,
      });
      expect(squadOfferShort(off), '');
      expect(squadFollowerOffer(off), 'Sem desconto pra quem usar, no momento');
      expect(
        squadShareText(member: off, link: 'https://x.y/JOAO10'),
        'Bora jogar na NexaGO? Use meu código JOAO10: https://x.y/JOAO10 #publi',
      );
    });
  });

  group('card de compartilhar (tela 02)', () {
    test('squadEventEyebrow: dia em SP e local em caixa alta', () {
      final start = DateTime.utc(2026, 10, 26, 13);

      expect(
        squadEventEyebrow(start, 'Arena Errejota'),
        '26 OUT · ARENA ERREJOTA',
      );
      expect(squadEventEyebrow(start, '  '), '26 OUT');
    });

    test('squadShareText leva o código, a oferta, o link e o #publi', () {
      final member = squadMember();
      const link = 'https://atleta.nexago.com.br/?squad=JOAO10';

      expect(
        squadShareText(member: member, link: link),
        'Bora jogar na NexaGO? Use meu código JOAO10 e ganhe 10% OFF na 1ª '
        'inscrição: $link #publi',
      );
      expect(
        squadShareText(
          member: member,
          link: link,
          tournamentName: ' Open Errejota ',
        ),
        startsWith('Bora jogar o Open Errejota comigo?'),
      );
    });
  });
}
