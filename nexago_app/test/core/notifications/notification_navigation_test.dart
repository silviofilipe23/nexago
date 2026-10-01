import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';

void main() {
  group('resolveNotificationRoute', () {
    test('pedido de avaliação abre o formulário, mesmo com a url do app antigo', () {
      expect(
        resolveNotificationRoute({
          'type': 'tournament_review_request',
          'tournamentId': 't1',
          'url': '/torneios/t1',
        }),
        '/torneios/t1/avaliar',
      );
      expect(
        resolveNotificationRoute({
          'type': 'tournament_review_reminder',
          'tournamentId': 't1',
          'url': '/torneios/t1',
        }),
        '/torneios/t1/avaliar',
      );
    });

    test('avaliação sem tournamentId cai na url do payload', () {
      expect(
        resolveNotificationRoute(
            {'type': 'tournament_review_request', 'url': '/torneios/t1'}),
        '/torneios/t1',
      );
    });

    test('fechamento das avaliações (organizador) abre a tela de avaliações', () {
      expect(
        resolveNotificationRoute({
          'type': 'tournament_review_closed',
          'tournamentId': 't1',
          'url': '/organizer/tournaments/t1',
          'webUrl': '/painel/eventos/t1/avaliacoes',
        }),
        '/organizer/tournaments/t1/reviews',
      );
    });

    test('fechamento sem tournamentId cai na url do payload', () {
      expect(
        resolveNotificationRoute(
            {'type': 'tournament_review_closed', 'url': '/organizer/tournaments/t1'}),
        '/organizer/tournaments/t1',
      );
    });

    test('tournament_partner_invite_accepted prefers url field', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite_accepted',
        'url':
            '/torneios/t1/inscricao?registrationId=r1&categoryId=c1&inviteId=i1&step=payment',
      });
      expect(route, contains('/torneios/t1/inscricao'));
      expect(route, contains('step=payment'));
    });

    test('tournament_partner_invite_accepted builds route from ids', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite_accepted',
        'tournamentId': 't1',
        'registrationId': 'r1',
        'categoryId': 'catA',
        'inviteId': 'inv1',
      });
      expect(route, '/torneios/t1/inscricao?registrationId=r1&step=payment&categoryId=catA&inviteId=inv1');
    });

    test('tournament_bracket_published opens bracket url from payload', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_bracket_published',
        'tournamentId': 't1',
        'categoryId': 'Masc A',
        'url': '/torneios/t1/chave?categoryId=Masc%20A',
      });
      expect(route, '/torneios/t1/chave?categoryId=Masc%20A');
    });

    test('tournament_communication falls back to tournament detail', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_communication',
        'tournamentId': 't1',
        'categoryId': 'catA',
      });
      expect(route, '/torneios/t1');
    });

    test('tournament_cancelled falls back to tournament detail', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_cancelled',
        'tournamentId': 't1',
      });
      expect(route, '/torneios/t1');
    });

    // Achado do review v2: nem o push original nem o lembrete (mesmo tipo,
    // ver `resendSubstitutionInvite`) tinham mapeamento — o toque não ia a
    // lugar nenhum. O convite de substituição mora na mesma coleção/tela do
    // convite de parceiro (`/torneios-convite/:inviteId`).
    test('tournament_substitution_invite opens the invite page by id', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_substitution_invite',
        'inviteId': 'inv-1',
        'tournamentId': 't1',
        'categoryId': 'masc',
        'inviterUid': 'u1',
      });
      expect(route, '/torneios-convite/inv-1');
    });

    test('tournament_substitution_invite without inviteId resolves nothing',
        () {
      final route = resolveNotificationRoute({
        'type': 'tournament_substitution_invite',
        'tournamentId': 't1',
      });
      expect(route, isNull);
    });

    // O push de convite de dupla (`sendTournamentPartnerInvite` e
    // `sendTournamentTeamInvite`) manda `type` + `inviteId`, sem `url`.
    test('tournament_partner_invite opens the invite page by id', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite',
        'inviteId': 'inv-9',
        'tournamentId': 't1',
        'categoryId': 'masc-a',
        'categoryName': 'Masculina A',
        'inviterUid': 'u1',
      });
      expect(route, '/torneios-convite/inv-9');
    });

    test('tournament_partner_invite without inviteId resolves nothing', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_partner_invite',
        'tournamentId': 't1',
      });
      expect(route, isNull);
    });
  });

  group('resolveNotificationTapDestination', () {
    test('com sessão, o convite de dupla abre direto', () {
      final destination = resolveNotificationTapDestination(
        data: const {
          'type': 'tournament_partner_invite',
          'inviteId': 'inv-9',
        },
        hasSession: true,
      );

      expect(destination?.path, '/torneios-convite/inv-9');
      expect(destination?.requiresLogin, isFalse);
    });

    // Sem sessão restaurada o redirect do router engolia o destino: o atleta
    // caía na home depois do login e o convite nunca aparecia.
    test('sem sessão, o convite de dupla fica pendente para depois do login',
        () {
      final destination = resolveNotificationTapDestination(
        data: const {
          'type': 'tournament_partner_invite',
          'inviteId': 'inv-9',
        },
        hasSession: false,
      );

      expect(destination?.path, '/torneios-convite/inv-9');
      expect(destination?.requiresLogin, isTrue);
    });

    test('payload sem rota conhecida não gera destino', () {
      final destination = resolveNotificationTapDestination(
        data: const {'type': 'tipo_desconhecido'},
        hasSession: true,
      );

      expect(destination, isNull);
    });
  });

  group('vaga liberada (tournament_spot_pass_granted)', () {
    // O payload EXATO que `organizerGrantTournamentSpotPass` manda. Se o resolvedor não
    // devolver rota aqui, o toque no push só abre o app — que é o sintoma relatado.
    final payload = <String, dynamic>{
      'type': 'tournament_spot_pass_granted',
      'tournamentId': 'zy1qXsBgvUwZDm2do68V',
      'categoryId': '1788437846026',
      'url': '/torneios/zy1qXsBgvUwZDm2do68V/inscricao?categoryId=1788437846026',
      'requireInteraction': 'true',
    };

    test('resolve a rota da inscrição', () {
      expect(
        resolveNotificationRoute(payload),
        '/torneios/zy1qXsBgvUwZDm2do68V/inscricao?categoryId=1788437846026',
      );
    });

    test('com sessão, o destino abre direto', () {
      final destination = resolveNotificationTapDestination(
        data: payload,
        hasSession: true,
      );
      expect(destination?.path,
          '/torneios/zy1qXsBgvUwZDm2do68V/inscricao?categoryId=1788437846026');
      expect(destination?.requiresLogin, isFalse);
    });

    // Era aqui que o toque morria: sem `url` o tipo não tinha caso próprio, nada resolvia e o
    // push só abria o app — enquanto o item da LISTA, que remonta pelos ids, levava à inscrição.
    test('sem url, o tipo remonta o destino pelos ids', () {
      final semUrl = Map<String, dynamic>.from(payload)..remove('url');
      expect(
        resolveNotificationRoute(semUrl),
        '/torneios/zy1qXsBgvUwZDm2do68V/inscricao?categoryId=1788437846026',
      );
    });

    test('sem torneio não há destino a inventar', () {
      expect(
        resolveNotificationRoute({'type': 'tournament_spot_pass_granted'}),
        isNull,
      );
    });
  });

  // `deliverNotificationToUser` manda o MESMO payload ao app e ao portal do organizador. O
  // `url` dessas notificações era rota do PORTAL (`/painel/...`) e o app navegava pra ele como
  // estava: rota inexistente, tela de erro do GoRouter no celular do organizador.
  group('url de portal no payload', () {
    // O payload EXATO de `notifyOrganizersPaymentDeclared` antes da correção — é o que está
    // gravado no inbox e o que functions ainda não redeployadas mandam.
    test('tournament_payment_declared antigo abre o torneio no app', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_payment_declared',
        'tournamentId': 't1',
        'registrationId': 'r1',
        'categoryId': 'cat-1',
        'url': '/painel/eventos/t1/inscricoes',
        'requireInteraction': 'true',
      });
      expect(route, '/organizer/tournaments/t1');
    });

    test('payload novo: segue o `url` do app e nunca o `webUrl`', () {
      final route = resolveNotificationRoute({
        'type': 'tournament_payment_declared',
        'tournamentId': 't1',
        'url': '/organizer/tournaments/t1',
        'webUrl': '/painel/eventos/t1/inscricoes',
      });
      expect(route, '/organizer/tournaments/t1');
    });

    for (final type in [
      'tournament_registration_created',
      'tournament_payment_confirmed',
      'tournament_cancellation_requested',
      'tournament_substitution_completed',
    ]) {
      test('$type com inscrição em foco também abre o torneio', () {
        final route = resolveNotificationRoute({
          'type': type,
          'tournamentId': 't1',
          'registrationId': 'r1',
          'url': '/painel/eventos/t1/inscricoes?registrationId=r1',
        });
        expect(route, '/organizer/tournaments/t1');
      });
    }

    test('saque pedido pela equipe abre a carteira do organizador', () {
      final route = resolveNotificationRoute({
        'type': 'organizer_withdrawal_requested',
        'url': '/painel/financeiro',
      });
      expect(route, '/organizer/wallet');
    });

    test('rota de portal sem equivalente no app não vira destino', () {
      expect(
        resolveNotificationRoute({'type': 'x', 'url': '/painel/config'}),
        isNull,
      );
    });

    // `tournament_substitution_completed` chega TAMBÉM aos atletas da equipe, sem `url`. A
    // tradução é pelo caminho, não pelo tipo: o atleta não pode cair na rota do organizador.
    test('substituição concluída sem url (atleta) não vai pra rota do organizador',
        () {
      final route = resolveNotificationRoute({
        'type': 'tournament_substitution_completed',
        'tournamentId': 't1',
        'categoryId': 'cat-1',
        'registrationId': 'r1',
      });
      expect(route, isNot(startsWith('/organizer')));
    });

    // Lembrete de partida mandava `/admin/tournament/...` (admin web antigo, que não existe
    // mais). Sem o url, o tipo leva ao mesmo lugar do item no inbox.
    test('match_reminder com url do admin antigo abre a partida', () {
      final route = resolveNotificationRoute({
        'type': 'match_reminder',
        'matchId': 'm1',
        'tournamentId': 't1',
        'categoryId': 'cat-1',
        'url': '/admin/tournament/t1/match/m1/result/cat-1',
      });
      expect(route, '/athlete/history/match/m1');
    });
  });
}
