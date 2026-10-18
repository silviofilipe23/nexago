/// Loja · Pedidos do atleta (app 06/07/08): leitura da visão
/// `storeOrderViews/{id}`, rótulos, etapas, recados, filtros e datas — puras,
/// testáveis sem Firebase.
///
/// Os textos TÊM de ser iguais aos do portal (`store-checkout-model.ts`:
/// `ORDER_STATUS_LABEL`, `orderProgress`, `orderInfo`, `orderWhere`).
library;

import 'store_checkout_models.dart';
import 'store_models.dart';
import 'store_rules.dart';

String _str(Object? v) => v is String ? v.trim() : '';

String? _orNull(Object? v) {
  final s = _str(v);
  return s.isEmpty ? null : s;
}

int _int(Object? v) => v is num && v.isFinite ? v.round() : 0;

Map<String, Object?>? _map(Object? v) =>
    v is Map ? Map<String, Object?>.from(v) : null;

/// A visão manda ISO UTC (`2026-10-17T19:02:00.000Z`).
DateTime? _date(Object? v) {
  if (v is DateTime) return v;
  if (v is String && v.trim().isNotEmpty) return DateTime.tryParse(v.trim());
  return null;
}

// ── Leitura ─────────────────────────────────────────────────────────────

/// Doc da visão → pedido; status desconhecido vira `null`. Pix só enquanto
/// aguarda pagamento; código de retirada só com o pedido na arena.
StoreOrderView? storeOrderViewFromMap(String id, Map<String, Object?>? data) {
  if (data == null) return null;
  final status = StoreOrderStatus.from(_str(data['status']));
  if (status == null) return null;
  final d = _map(data['delivery']) ?? const <String, Object?>{};
  final pix = _map(data['pix']);
  final copyPaste = _str(pix?['copyPaste']);
  return StoreOrderView(
    id: id,
    number: _orNull(data['number']) ?? id,
    status: status,
    items: [
      if (data['items'] is List)
        for (final raw in data['items'] as List)
          if (_map(raw) case final i?)
            StoreOrderItem(
              productId: _str(i['productId']),
              skuId: _str(i['skuId']),
              name: _str(i['name']),
              variantLabel: _str(i['variantLabel']),
              imageUrl: _orNull(i['imageUrl']),
              qty: _int(i['qty']),
              unitCents: _int(i['unitCents']),
              totalCents: _int(i['totalCents']),
              personalized: i['personalized'] == true,
              customizationLabel: _orNull(i['customizationLabel']),
            ),
    ],
    units: _int(data['units']),
    subtotalCents: _int(data['subtotalCents']),
    couponCode: _orNull(data['couponCode']),
    couponDiscountCents: _int(data['couponDiscountCents']),
    pixDiscountCents: _int(data['pixDiscountCents']),
    shippingCents: _int(data['shippingCents']),
    totalCents: _int(data['totalCents']),
    pix: status == StoreOrderStatus.pag && copyPaste.isNotEmpty
        ? StoreOrderPix(
            copyPaste: copyPaste, expiresAt: _date(pix?['expiresAt']))
        : null,
    delivery: d['type'] == 'arena'
        ? StoreOrderArenaDelivery(
            placeName: _orNull(d['placeName']),
            counter: _orNull(d['counter']),
            address: _orNull(d['address']),
            pickupCode: status == StoreOrderStatus.ret
                ? _orNull(d['pickupCode'])
                : null,
            pickupDeadline: _date(d['pickupDeadline']),
          )
        : StoreOrderHomeDelivery(
            modeName: _orNull(d['modeName']),
            address: _orNull(d['address']),
            city: _orNull(d['city']),
            uf: _orNull(d['uf']),
            zip: _orNull(d['zip']),
            carrier: _orNull(d['carrier']),
            tracking: _orNull(d['tracking']),
            trackingUrl: _orNull(d['trackingUrl']),
            eta: _orNull(d['eta']),
          ),
    createdAt: _date(data['createdAt']),
    paidAt: _date(data['paidAt']),
    separatedAt: _date(data['separatedAt']),
    arrivedAt: _date(data['arrivedAt']),
    shippedAt: _date(data['shippedAt']),
    completedAt: _date(data['completedAt']),
    canceledAt: _date(data['canceledAt']),
    cancelReason: _orNull(data['cancelReason']),
    refundedCents: _int(data['refundedCents']),
  );
}

/// Resposta de `createStoreOrder`; `null` se faltar o id ou o Pix.
StoreCreatedOrder? storeCreatedOrderFromMap(Object? raw) {
  final d = _map(raw);
  if (d == null) return null;
  final orderId = _str(d['orderId']);
  final pix = _map(d['pix']);
  final copyPaste = _str(pix?['copyPaste']);
  if (orderId.isEmpty || copyPaste.isEmpty) return null;
  return StoreCreatedOrder(
    orderId: orderId,
    number: _orNull(d['number']) ?? orderId,
    totalCents: _int(d['totalCents']),
    pix: StoreOrderPix(
        copyPaste: copyPaste, expiresAt: _date(pix?['expiresAt'])),
  );
}

// ── Status, etapas e filtros ────────────────────────────────────────────

StoreOrderTone storeOrderTone(StoreOrderStatus status) => switch (status) {
      StoreOrderStatus.pag => StoreOrderTone.wait,
      StoreOrderStatus.ret => StoreOrderTone.ready,
      StoreOrderStatus.tra => StoreOrderTone.transit,
      StoreOrderStatus.ent || StoreOrderStatus.rtd => StoreOrderTone.done,
      StoreOrderStatus.can => StoreOrderTone.canceled,
      StoreOrderStatus.sep || StoreOrderStatus.sepd => StoreOrderTone.progress,
    };

/// Pedido que ainda vai mudar (aparece em "Em andamento").
bool storeOrderActive(StoreOrderStatus status) =>
    status != StoreOrderStatus.ent &&
    status != StoreOrderStatus.rtd &&
    status != StoreOrderStatus.can;

/// Barra de etapas; pedido encerrado não tem barra.
StoreOrderProgress? storeOrderProgress(StoreOrderView o) {
  if (!storeOrderActive(o.status)) return null;
  final steps = o.atArena
      ? const ['Pago', 'Separado', 'Na arena', 'Retirado']
      : const ['Pago', 'Separado', 'Em trânsito', 'Entregue'];
  final step = switch (o.status) {
    StoreOrderStatus.sep => 1,
    StoreOrderStatus.sepd => 2,
    StoreOrderStatus.ret => 3,
    StoreOrderStatus.tra => 2,
    _ => 0,
  };
  return StoreOrderProgress(steps, step);
}

bool storeOrderMatchesFilter(StoreOrderView o, StoreOrderFilter filter) =>
    switch (filter) {
      StoreOrderFilter.active => storeOrderActive(o.status),
      StoreOrderFilter.done =>
        o.status == StoreOrderStatus.ent || o.status == StoreOrderStatus.rtd,
      StoreOrderFilter.canceled => o.status == StoreOrderStatus.can,
      StoreOrderFilter.all => true,
    };

/// Busca por número do pedido ou nome de produto (sem acento, sem caixa;
/// "#" opcional).
bool storeOrderMatchesSearch(StoreOrderView o, String term) {
  final t = normalizeStoreSearch(term.trim().replaceFirst(RegExp(r'^#'), ''));
  if (t.isEmpty) return true;
  return normalizeStoreSearch(o.number).contains(t) ||
      o.items.any((i) => normalizeStoreSearch(i.name).contains(t));
}

/// Nome do card: o produto (com o nome personalizado) quando é um só; senão
/// "4 itens".
String storeOrderTitle(StoreOrderView o) {
  if (o.items.length == 1) {
    final i = o.items.single;
    final label = i.customizationLabel;
    final base = label != null ? '${i.name} · $label' : i.name;
    return i.qty > 1 ? '$base · ${i.qty}×' : base;
  }
  final units =
      o.units > 0 ? o.units : o.items.fold<int>(0, (n, i) => n + i.qty);
  return '$units itens';
}

/// Algum item é personalizado (selo "Personalizado").
bool storeOrderPersonalized(StoreOrderView o) =>
    o.items.any((i) => i.personalized);

// ── Datas (relógio de parede de São Paulo, UTC−3 fixo) ──────────────────

/// São Paulo não tem horário de verão desde 2019: a mesma conta do portal.
const Duration _saoPauloOffset = Duration(hours: 3);

/// Sem ponto ("out", não "out."): `DateFormat('MMM', 'pt_BR')` põe ponto.
const List<String> _months = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/// Pelo `DateTime.weekday` (1 = segunda).
const List<String> _weekdaysShort = [
  'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom', //
];

/// Relógio de parede de SP lido pelos campos UTC.
DateTime _wall(DateTime d) => d.toUtc().subtract(_saoPauloOffset);

int _dayNumber(DateTime w) =>
    DateTime.utc(w.year, w.month, w.day).millisecondsSinceEpoch ~/ 86400000;

String _two(int n) => n.toString().padLeft(2, '0');

String _hhmm(DateTime w) => '${_two(w.hour)}:${_two(w.minute)}';

/// "Hoje, 16:02" · "Ontem, 14:08" · "8 out" (· "8 out 2025" em outro ano).
String formatStoreOrderDate(DateTime? at, DateTime now) {
  if (at == null) return '';
  final w = _wall(at);
  final n = _wall(now);
  final diff = _dayNumber(n) - _dayNumber(w);
  if (diff == 0) return 'Hoje, ${_hhmm(w)}';
  if (diff == 1) return 'Ontem, ${_hhmm(w)}';
  final base = '${w.day} ${_months[w.month - 1]}';
  return w.year == n.year ? base : '$base ${w.year}';
}

/// "sáb, 18 out · 22h" (minutos só quando não é hora cheia).
String formatStoreDeadline(DateTime at) {
  final w = _wall(at);
  final hour = w.minute == 0 ? '${w.hour}h' : _hhmm(w);
  return '${_weekdaysShort[w.weekday - 1]}, ${w.day} ${_months[w.month - 1]}'
      ' · $hour';
}

final RegExp _civilDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

/// Data civil do envio (`eta` = "2026-10-22") → "qui, 22 out"; `null` se não
/// for uma.
String? formatStoreCivilDate(String ymd) {
  final m = _civilDate.firstMatch(ymd);
  if (m == null) return null;
  final d = DateTime.utc(
    int.parse(m.group(1)!),
    int.parse(m.group(2)!),
    int.parse(m.group(3)!),
  );
  return '${_weekdaysShort[d.weekday - 1]}, ${d.day} ${_months[d.month - 1]}';
}

/// Hora de parede de SP ("17:30").
String formatStoreClock(DateTime at) => _hhmm(_wall(at));

// ── Recados ─────────────────────────────────────────────────────────────

/// Linha de apoio do card: o que o atleta precisa saber agora.
String storeOrderInfo(StoreOrderView o) {
  final d = o.delivery;
  switch (o.status) {
    case StoreOrderStatus.pag:
      final expiresAt = o.pix?.expiresAt;
      return expiresAt != null
          ? 'Pague o Pix até ${formatStoreClock(expiresAt)}'
          : 'Aguardando o Pix';
    case StoreOrderStatus.ret:
      if (d is StoreOrderArenaDelivery && d.pickupDeadline != null) {
        return 'Retire até ${formatStoreDeadline(d.pickupDeadline!)}';
      }
      return 'Já está na arena';
    case StoreOrderStatus.tra:
      final eta = d is StoreOrderHomeDelivery && d.eta != null
          ? formatStoreCivilDate(d.eta!)
          : null;
      return eta != null ? 'Chega até $eta' : 'A caminho do seu endereço';
    case StoreOrderStatus.sep:
    case StoreOrderStatus.sepd:
      return d is StoreOrderArenaDelivery
          ? 'Separando pra levar à arena'
          : 'Separando pra enviar';
    case StoreOrderStatus.can:
      // O reembolso pode estar pendente ou ir pro saldo: não prometer "no Pix".
      return o.refundedCents > 0
          ? 'Reembolso registrado'
          : (o.cancelReason ?? 'Pedido cancelado');
    case StoreOrderStatus.ent:
    case StoreOrderStatus.rtd:
      return '';
  }
}

/// Onde o pedido vai/foi: "Arena Errejota · recepção" ou o endereço.
String storeOrderWhere(StoreOrderView o) {
  final d = o.delivery;
  switch (d) {
    case StoreOrderArenaDelivery():
      final place = d.placeName ?? 'Retirada na arena';
      if (o.status == StoreOrderStatus.rtd) return 'Retirado na $place';
      return d.counter != null ? '$place · ${d.counter}' : place;
    case StoreOrderHomeDelivery():
      if (o.status == StoreOrderStatus.ent) return 'Entregue em casa';
      return d.address ?? 'Receber em casa';
  }
}

/// Rota do Google Maps até o endereço da arena (sem coordenada no espelho).
Uri storeMapsUri(String address) => Uri.parse(
      'https://www.google.com/maps/search/?api=1'
      '&query=${Uri.encodeComponent(address)}',
    );

/// Contagem do Pix: "29:58"; `null` quando venceu.
String? storePixCountdown(DateTime? expiresAt, DateTime now) {
  if (expiresAt == null) return null;
  final left = expiresAt.difference(now).inMilliseconds ~/ 1000;
  if (left <= 0) return null;
  return '${_two(left ~/ 60)}:${_two(left % 60)}';
}

// ── Comprar de novo ─────────────────────────────────────────────────────

/// Peças comuns que seguem à venda voltam pro carrinho (com o saldo do SKU
/// como teto); personalizada pede a arte de novo, então fica de fora.
StoreRebuyPlan storeRebuyPlan(
  List<StoreOrderItem> items,
  List<StoreProduct> products,
) {
  final byId = {for (final p in products) p.id: p};
  final lines = <StoreRebuyLine>[];
  var skipped = 0;
  for (final item in items) {
    final product = byId[item.productId];
    final variant =
        product?.variants.where((v) => v.id == item.skuId).firstOrNull;
    if (item.personalized ||
        product == null ||
        variant == null ||
        !variant.inStock ||
        item.qty <= 0) {
      skipped++;
      continue;
    }
    lines.add(
      StoreRebuyLine(
        productId: product.id,
        skuId: variant.id,
        qty: item.qty,
        maxQty: variant.maxQty.clamp(1, kStoreMaxQtyPerItem),
      ),
    );
  }
  return StoreRebuyPlan(lines: lines, skipped: skipped);
}
