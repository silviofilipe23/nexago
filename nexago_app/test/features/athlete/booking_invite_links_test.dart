import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/deep_link/app_deep_link_logic.dart';
import 'package:nexago_app/features/athlete/domain/booking_invite_links.dart';

void main() {
  test('link do convite cai no portal do atleta e o app resolve a rota', () {
    final url = bookingInviteUrl('link_b1');
    expect(url, 'https://atleta.nexago.com.br/convite/link_b1');
    expect(resolveAppDeepLinkPath(Uri.parse(url)), '/convite/link_b1');
  });

  test('rótulo do horário em português, horário de parede', () {
    expect(
      bookingInviteWhenLabel(DateTime(2026, 10, 24, 19, 0)),
      'sábado, 24/10 às 19:00',
    );
    expect(
      bookingInviteWhenLabel(DateTime(2026, 10, 19, 7, 30)),
      'segunda, 19/10 às 07:30',
    );
  });

  test('mensagem do link diz onde, quando, quantas vagas e leva o link', () {
    final text = bookingInviteShareMessage(
      arenaName: 'Arena Sol',
      startAt: DateTime(2026, 10, 24, 19),
      inviteId: 'link_b1',
      openSlots: 2,
    );
    expect(text, contains('na Arena Sol, sábado, 24/10 às 19:00'));
    expect(text, contains('Faltam 2 pra fechar o jogo.'));
    expect(text, endsWith('https://atleta.nexago.com.br/convite/link_b1'));

    final one = bookingInviteShareMessage(
      arenaName: '',
      startAt: DateTime(2026, 10, 24, 19),
      inviteId: 'link_b1',
      openSlots: 1,
    );
    expect(one, contains('quadra na arena'));
    expect(one, contains('Falta 1 pra fechar o jogo.'));
  });
}
