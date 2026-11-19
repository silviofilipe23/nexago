/// Modelo da Live Activity do Pix pendente (Dynamic Island + tela bloqueada).
///
/// Puro de propósito: o que vai para o Swift (`startPix`) e para o Firestore
/// (`pixLiveActivities/{uid}_{asaasPaymentId}`) fica fixado por teste. Os dois são
/// contratos silenciosos — renomear um campo de um lado faz o card parar sem
/// erro em lugar nenhum. Lado nativo: `ios/NexagoLiveActivities/`; servidor:
/// `functions/src/pix-live-activity.ts`; regra: `firestore.rules`.
library;

import '../formatting/app_currency_format.dart';

/// Coleção que o servidor lê para mandar os pushes da activity.
const pixLiveActivitiesCollection = 'pixLiveActivities';

/// Chave do doc: leva o uid para ninguém ocupar o doc da cobrança de outra
/// pessoa (o id da cobrança aparece em docs que todo atleta logado lê).
String pixLiveActivityDocId({required String uid, required String paymentId}) =>
    '${uid}_$paymentId';

/// Limite de cada linha de texto do card (o iOS corta, mas o atributo da
/// activity tem teto de tamanho e não vale a pena chegar perto).
const _maxTextLength = 80;

/// De onde veio o Pix. O `name` é gravado no Firestore (`kind`).
enum PixLiveActivityKind {
  booking('Pix da reserva'),
  registration('Pix da inscrição'),
  club('Pix do clubinho');

  const PixLiveActivityKind(this.title);

  /// Rótulo curto do topo do card ("NEXAGO · PIX DA RESERVA").
  final String title;
}

/// Como a tela encerra a activity quando ela mesma descobre o desfecho.
enum PixLiveActivityOutcome {
  /// Pago: o card fica verde e sai da tela em 30 minutos.
  paid,

  /// O prazo acabou: o card para em "Expirou" e sai em 15 minutos.
  expired,

  /// O atleta desistiu: o card some na hora.
  dismissed,
}

/// Duas linhas de contexto do card: o que está sendo pago e quando.
class PixLiveActivityContext {
  const PixLiveActivityContext({required this.summary, required this.detail});

  /// "Reserva · Arena Sol · Quadra 2"
  final String summary;

  /// "Sáb, 21/11 · 9h–10h"
  final String detail;
}

class PixLiveActivityRequest {
  const PixLiveActivityRequest({
    required this.paymentId,
    required this.kind,
    required this.amountReais,
    required this.summary,
    required this.detail,
    required this.createdAt,
    required this.expiresAt,
  });

  /// Id da cobrança no Asaas — chave do doc e da activity.
  final String paymentId;
  final PixLiveActivityKind kind;

  /// O que o QR cobra (`chargedReais`).
  final double amountReais;
  final String summary;
  final String detail;

  /// Início do anel; o fim é [expiresAt].
  final DateTime createdAt;
  final DateTime expiresAt;

  bool get isValid =>
      paymentId.trim().isNotEmpty &&
      amountReais > 0 &&
      expiresAt.isAfter(createdAt);

  /// CONTRATO com `PixLiveActivityController.start` no Swift.
  Map<String, Object> toChannelArgs() => {
        'paymentId': paymentId.trim(),
        'title': kind.title,
        'amountLabel': formatBRL(amountReais),
        'summary': summary,
        'detail': detail,
        'createdAtMs': createdAt.millisecondsSinceEpoch,
        'expiresAtMs': expiresAt.millisecondsSinceEpoch,
      };
}

/// Doc criado quando o iPhone entrega o token da activity. [serverTimestamp]
/// é o `FieldValue.serverTimestamp()` (injetado para o teste).
Map<String, Object> pixLiveActivityCreateData({
  required String uid,
  required String paymentId,
  required PixLiveActivityKind kind,
  required String fcmToken,
  required String liveActivityToken,
  required DateTime expiresAt,
  required Object serverTimestamp,
}) =>
    {
      'uid': uid,
      'paymentId': paymentId,
      'kind': kind.name,
      'fcmToken': fcmToken,
      'liveActivityToken': liveActivityToken,
      'expiresAt': expiresAt,
      'phase': 'waiting',
      'createdAt': serverTimestamp,
      'updatedAt': serverTimestamp,
    };

/// O iOS pode trocar o token da activity; a regra só libera estes campos.
Map<String, Object> pixLiveActivityTokenUpdate({
  required String fcmToken,
  required String liveActivityToken,
  required Object serverTimestamp,
}) =>
    {
      'fcmToken': fcmToken,
      'liveActivityToken': liveActivityToken,
      'updatedAt': serverTimestamp,
    };

PixLiveActivityContext pixLiveActivityBookingContext({
  required String arenaName,
  required String courtName,
  required DateTime date,
  required String startTime,
  required String endTime,
}) {
  return PixLiveActivityContext(
    summary: _join(['Reserva', arenaName, courtName]),
    detail: _join([_shortDay(date), _hourRange(startTime, endTime)]),
  );
}

PixLiveActivityContext pixLiveActivityRegistrationContext({
  required String tournamentName,
  required String categoryName,
}) {
  return PixLiveActivityContext(
    summary: _join(['Inscrição', tournamentName]),
    detail: _clip(categoryName.trim()),
  );
}

PixLiveActivityContext pixLiveActivityClubContext({
  required String arenaName,
  required DateTime date,
  required String startTime,
}) {
  return PixLiveActivityContext(
    summary: _join(['Clubinho', arenaName]),
    detail: _join([_shortDay(date), _hourRange(startTime, '')]),
  );
}

String _join(List<String> parts) => _clip(
      parts.map((p) => p.trim()).where((p) => p.isNotEmpty).join(' · '),
    );

String _clip(String text) => text.length <= _maxTextLength
    ? text
    : '${text.substring(0, _maxTextLength - 1)}…';

const _weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/// "Sáb, 21/11" — sem `intl` para não depender do locale carregado.
String _shortDay(DateTime date) {
  final day = date.day.toString().padLeft(2, '0');
  final month = date.month.toString().padLeft(2, '0');
  return '${_weekdays[date.weekday - 1]}, $day/$month';
}

/// "09:00" → "9h", "10:30" → "10h30"; vazio quando não dá para ler.
String _hourLabel(String hm) {
  final parts = hm.trim().split(':');
  final hour = int.tryParse(parts.first);
  if (hour == null) return '';
  final minute = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return minute == 0
      ? '${hour}h'
      : '${hour}h${minute.toString().padLeft(2, '0')}';
}

String _hourRange(String start, String end) {
  final from = _hourLabel(start);
  final to = _hourLabel(end);
  if (from.isEmpty) return '';
  return to.isEmpty ? from : '$from–$to';
}
