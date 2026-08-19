import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_invite_links.dart';

void main() {
  group('tournamentPartnerInviteUrl', () {
    test('monta URL absoluta no host do portal do atleta', () {
      expect(
        tournamentPartnerInviteUrl('inv-1'),
        'https://atleta.nexago.com.br/torneios-convite/inv-1',
      );
    });

    test('id vazio não vira link', () {
      expect(tournamentPartnerInviteUrl('  '), isNull);
    });

    // Id de doc do Firestore é seguro em URL, mas lixo vindo de deep link não
    // pode montar um link quebrado nem escapar do path.
    test('id fora do formato de doc não vira link', () {
      expect(tournamentPartnerInviteUrl('../outro'), isNull);
      expect(tournamentPartnerInviteUrl('inv 1'), isNull);
    });
  });

  group('partnerInviteReminderMessage', () {
    test('cita o parceiro, o torneio e a categoria', () {
      final msg = partnerInviteReminderMessage(
        partnerName: 'Bia Souza',
        tournamentName: 'Copa VH',
        categoryName: 'Dupla Feminina B',
        url: 'https://atleta.nexago.com.br/torneios-convite/inv-1',
      );

      expect(msg, contains('Bia'));
      expect(msg, contains('Copa VH'));
      expect(msg, contains('Dupla Feminina B'));
      expect(msg, contains('https://atleta.nexago.com.br/torneios-convite/inv-1'));
    });

    test('sem nome do parceiro, a saudação continua natural', () {
      final msg = partnerInviteReminderMessage(
        partnerName: null,
        tournamentName: 'Copa VH',
        categoryName: 'Dupla Mista A',
        url: 'https://x/y',
      );

      expect(msg, isNot(contains('null')));
      expect(msg, startsWith('Fala!'));
    });

    // Categoria de EQUIPE fala de equipe, não de dupla — o backend grava
    // isTeamInvite/teamName e o texto tem de acompanhar.
    test('convite de equipe fala da equipe pelo nome', () {
      final msg = partnerInviteReminderMessage(
        partnerName: 'Léo',
        tournamentName: 'Copa VH',
        categoryName: 'Quarteto Misto',
        url: 'https://x/y',
        teamName: 'Areia Quente',
      );

      expect(msg, contains('Areia Quente'));
      expect(msg, contains('equipe'));
      expect(msg, isNot(contains('dupla')));
    });
  });
}
