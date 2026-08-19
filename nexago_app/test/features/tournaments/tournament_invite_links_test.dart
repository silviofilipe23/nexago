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

  group('externalPartnerInviteUrl', () {
    test('leva o token, a indicação e quem convidou', () {
      final url = externalPartnerInviteUrl(
        externalInviteId: 'ext-1',
        referralCode: 'uid-1',
        inviterName: 'Silvio Dionizio',
      );

      expect(url, startsWith('https://atleta.nexago.com.br/convite-dupla/ext-1?'));
      expect(url, contains('ref=uid-1'));
      expect(url, contains('de=Silvio+Dionizio'));
    });

    test('sem indicação nem nome, sai só o token', () {
      expect(
        externalPartnerInviteUrl(externalInviteId: 'ext-1'),
        'https://atleta.nexago.com.br/convite-dupla/ext-1',
      );
    });

    // Código de indicação é o uid: lixo aí não pode virar query.
    test('código de indicação fora do formato é descartado', () {
      final url = externalPartnerInviteUrl(
        externalInviteId: 'ext-1',
        referralCode: 'nao/vale',
      );

      expect(url, isNot(contains('ref=')));
    });

    test('token inválido não vira link', () {
      expect(externalPartnerInviteUrl(externalInviteId: '../x'), isNull);
    });
  });

  group('externalPartnerInviteMessage', () {
    test('explica que o parceiro precisa criar a conta', () {
      final msg = externalPartnerInviteMessage(
        partnerName: 'Bia',
        tournamentName: 'Copa VH',
        categoryName: 'Dupla Mista B',
        url: 'https://x/y',
      );

      expect(msg, startsWith('Fala, Bia!'));
      expect(msg, contains('Copa VH'));
      expect(msg, contains('Dupla Mista B'));
      expect(msg, contains('https://x/y'));
    });

    test('equipe fala da equipe pelo nome', () {
      final msg = externalPartnerInviteMessage(
        partnerName: null,
        tournamentName: 'Copa VH',
        categoryName: 'Quarteto',
        url: 'https://x/y',
        teamName: 'Areia Quente',
      );

      expect(msg, contains('Areia Quente'));
      expect(msg, isNot(contains('dupla')));
    });
  });

  // O link do convite carrega o código de indicação; o cadastro precisa dele
  // para gravar `referredBy` — hoje esse campo é digitado à mão.
  group('referralCodeFromDeepLinkPath', () {
    test('extrai o ref do caminho pendente', () {
      expect(
        referralCodeFromDeepLinkPath('/convite-dupla/ext-1?ref=uid-1&de=Silvio'),
        'uid-1',
      );
    });

    test('caminho sem ref não devolve nada', () {
      expect(referralCodeFromDeepLinkPath('/convite-dupla/ext-1'), isNull);
      expect(referralCodeFromDeepLinkPath(null), isNull);
      expect(referralCodeFromDeepLinkPath(''), isNull);
    });

    test('ref fora do formato é descartado', () {
      expect(
        referralCodeFromDeepLinkPath('/convite-dupla/ext-1?ref=nao%2Fvale'),
        isNull,
      );
    });

    test('caminho malformado não explode', () {
      expect(referralCodeFromDeepLinkPath(':::'), isNull);
    });
  });
}
