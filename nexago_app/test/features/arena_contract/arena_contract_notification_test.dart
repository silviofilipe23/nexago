import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Payload dos lembretes do contrato de mensalista
/// (`functions/src/arena-crm-reminders.ts`): o `url` é a página da arena para o
/// app antigo; este build decide pelo tipo + `contractId`.
Map<String, String> _payload(String type, {String? contractId = 'c1'}) => {
      'type': type,
      'url': '/arena/a1',
      'arenaId': 'a1',
      if (contractId != null) 'contractId': contractId,
      'invoiceUrl': 'https://www.asaas.com/i/crm1',
      'webUrl': 'https://www.asaas.com/i/crm1',
    };

AthleteInboxNotification _inbox(Map<String, String> data) =>
    AthleteInboxNotification(
      id: 'n1',
      title: 'Mensalidade em atraso',
      body: 'Sua mensalidade está em aberto há 7 dias.',
      type: data['type']!,
      data: data,
      read: false,
      dismissed: false,
      createdAt: DateTime(2026, 11, 11, 9),
    );

void main() {
  test('o tipo vence o url: atraso abre Meu contrato no contrato', () {
    expect(AppRoutes.myArenaContract, '/meu-contrato');
    expect(
      resolveNotificationRoute(_payload('arena_crm_overdue_7')),
      '/meu-contrato?id=c1',
    );
  });

  test('todos os lembretes do contrato abrem Meu contrato', () {
    // `REMINDER_KINDS` em functions/src/arena-crm-reminders-model.ts.
    for (final type in const [
      'arena_crm_due_soon',
      'arena_crm_due_today',
      'arena_crm_overdue_1',
      'arena_crm_overdue_7',
      'arena_crm_renewal_15',
      'arena_crm_renewal_3',
      'arena_crm_absence',
    ]) {
      expect(
        resolveNotificationRoute(_payload(type)),
        '/meu-contrato?id=c1',
        reason: type,
      );
    }
  });

  test('tipo em maiúsculas também', () {
    expect(
      resolveNotificationRoute(_payload('ARENA_CRM_OVERDUE_7')),
      '/meu-contrato?id=c1',
    );
  });

  test('sem contractId (ou em branco): Meu contrato sem id', () {
    expect(
      resolveNotificationRoute(
          _payload('arena_crm_overdue_7', contractId: null)),
      AppRoutes.myArenaContract,
    );
    expect(
      resolveNotificationRoute(
          _payload('arena_crm_overdue_7', contractId: '  ')),
      AppRoutes.myArenaContract,
    );
  });

  test('contractId com caractere especial vai codificado', () {
    expect(
      resolveNotificationRoute(
          _payload('arena_crm_overdue_7', contractId: 'a b&c')),
      '/meu-contrato?id=a+b%26c',
    );
  });

  test('o toque não abre a fatura direto (abre a tela)', () {
    expect(externalNotificationUrl(_payload('arena_crm_overdue_7')), isNull);
  });

  test('resumo do gestor (arena_crm_digest) não é lembrete do atleta', () {
    expect(isArenaContractNotificationType('arena_crm_digest'), isFalse);
    expect(isArenaContractNotificationType('arena_crm_overdue_7'), isTrue);
    expect(isArenaContractNotificationType('arena_schedule_charge'), isFalse);

    final digestWithUrl = resolveNotificationRoute({
      'type': 'arena_crm_digest',
      'url': '/arena/a1',
      'arenaId': 'a1',
      'contractId': 'c1',
    });
    expect(digestWithUrl, '/arena/a1');

    final digest = resolveNotificationRoute({
      'type': 'arena_crm_digest',
      'arenaId': 'a1',
      'webUrl': '/painel/clientes',
    });
    expect(digest, isNot(startsWith(AppRoutes.myArenaContract)));
  });

  // BUG: o `default` de `_basePresentation`
  // (lib/features/athlete/domain/athlete_notifications_logic.dart) já devolve
  // `routePath: appRouteForNotificationUrl(data['url'])` = `/arena/a1`, e
  // `notificationPresentation` só cai em `resolveNotificationRoute` quando o
  // `routePath` base é vazio. O item do inbox abre a página da arena, não o
  // Meu contrato. Tirar o `skip` quando corrigir.
  test('inbox: o item do lembrete leva ao Meu contrato', () {
    final p = notificationPresentation(_inbox(_payload('arena_crm_overdue_7')));
    expect(p.routePath, '/meu-contrato?id=c1');
    expect(p.externalUrl, isNull);
  });

  test('destino do toque com e sem sessão', () {
    final logged = resolveNotificationTapDestination(
      data: _payload('arena_crm_due_soon'),
      hasSession: true,
    );
    expect(logged!.path, '/meu-contrato?id=c1');
    expect(logged.requiresLogin, isFalse);

    final anon = resolveNotificationTapDestination(
      data: _payload('arena_crm_due_soon'),
      hasSession: false,
    );
    expect(anon!.path, '/meu-contrato?id=c1');
    expect(anon.requiresLogin, isTrue);
  });
}
