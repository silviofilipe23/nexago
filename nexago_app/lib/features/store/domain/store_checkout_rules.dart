/// Loja · Checkout (app 03/04/05): cotação, carrinho, endereços, CEP e erros
/// das callables — puras, testáveis sem Firebase.
///
/// A fonte de verdade é `docs/business-rules/loja-checkout.md`, compartilhada
/// com o portal web (`store-checkout-model.ts` / `store-checkout-api.ts`):
/// mudar uma regra aqui é mudar lá também.
library;

import 'store_checkout_models.dart';
import 'store_models.dart';

String _str(Object? v) => v is String ? v.trim() : '';

String? _orNull(Object? v) {
  final s = _str(v);
  return s.isEmpty ? null : s;
}

int _int(Object? v) => v is num && v.isFinite ? v.round() : 0;

final RegExp _nonDigits = RegExp(r'\D');

String _digits(String raw) => raw.replaceAll(_nonDigits, '');

String _cut(String s, int max) => s.length > max ? s.substring(0, max) : s;

Map<String, Object?>? _map(Object? v) =>
    v is Map ? Map<String, Object?>.from(v) : null;

// ── Carrinho ────────────────────────────────────────────────────────────

/// A chave da linha que o servidor devolve na cotação: `lineId` da
/// personalizada ou `produto/SKU`.
String storeCartLineKey(StoreCartItem item) =>
    item.lineId ?? '${item.productId}/${item.skuId}';

/// Muda a quantidade da linha [key] (0 remove), sem passar do teto da
/// compra. As outras linhas voltam inteiras — `lineId` e `customization`
/// inclusive (a rule só aceita `items` + `updatedAt`).
List<StoreCartItem> storeCartWithLineQty(
  List<StoreCartItem> items,
  String key,
  int qty,
) {
  final next = qty.clamp(0, kStoreMaxQtyPerItem);
  if (next == 0) {
    return [
      for (final i in items)
        if (storeCartLineKey(i) != key) i,
    ];
  }
  return [
    for (final i in items)
      if (storeCartLineKey(i) == key)
        StoreCartItem(
          productId: i.productId,
          skuId: i.skuId,
          qty: next,
          lineId: i.lineId,
          customization: i.customization,
        )
      else
        i,
  ];
}

// ── Cotação ─────────────────────────────────────────────────────────────

/// Resposta da callable (ou `details.quote` de um erro) → cotação; `null` se
/// não for uma. Problema que o app não conhece é descartado.
StoreCheckoutQuote? storeQuoteFromMap(Object? raw) {
  final d = _map(raw);
  if (d == null || d['lines'] is! List) return null;
  final coupon = _map(d['coupon']);
  return StoreCheckoutQuote(
    lines: [
      for (final item in d['lines'] as List)
        if (_map(item) case final l?)
          StoreQuoteLine(
            key: _str(l['key']),
            productId: _str(l['productId']),
            skuId: _str(l['skuId']),
            qty: _int(l['qty']),
            name: _str(l['name']),
            variantLabel: _str(l['variantLabel']),
            imageUrl: _orNull(l['imageUrl']),
            unitCents: _int(l['unitCents']),
            totalCents: _int(l['totalCents']),
            personalized: l['personalized'] == true,
            customizationLabel: _orNull(l['customizationLabel']),
            problem: StoreQuoteLineProblem.from(l['problem']),
          ),
    ],
    units: _int(d['units']),
    subtotalCents: _int(d['subtotalCents']),
    coupon: coupon == null
        ? null
        : StoreQuoteCoupon(
            code: _str(coupon['code']),
            discountCents: _int(coupon['discountCents']),
            problem: _orNull(coupon['problem']),
            message: _orNull(coupon['message']),
          ),
    pixDiscountPct: _int(d['pixDiscountPct']),
    pixDiscountCents: _int(d['pixDiscountCents']),
    shippingCents: _int(d['shippingCents']),
    freeShipping: d['freeShipping'] == true,
    totalCents: _int(d['totalCents']),
    problems: [
      if (d['problems'] is List)
        for (final p in d['problems'] as List)
          if (StoreQuoteProblem.from(p) case final problem?) problem,
    ],
  );
}

/// Por que o "Pagar" está travado (a primeira causa que o atleta resolve),
/// ou `null`.
String? storeQuoteBlocker(StoreCheckoutQuote q) {
  final p = q.problems;
  if (p.contains(StoreQuoteProblem.emptyCart)) {
    return 'Seu carrinho está vazio.';
  }
  if (p.contains(StoreQuoteProblem.lineProblem)) {
    return 'Revise os itens marcados no carrinho.';
  }
  if (p.contains(StoreQuoteProblem.deliveryMissing)) {
    return 'Escolha como receber.';
  }
  if (p.contains(StoreQuoteProblem.arenaUnavailable)) {
    return 'Essa arena não está fazendo retirada. Escolha outra.';
  }
  if (p.contains(StoreQuoteProblem.addressMissing)) {
    return 'Escolha um endereço de entrega.';
  }
  if (p.contains(StoreQuoteProblem.modeUnavailable)) {
    return 'Escolha um prazo de entrega.';
  }
  return null;
}

/// Cupom aplicado de verdade (sem problema) — o que entra no resumo.
StoreQuoteCoupon? storeAppliedCoupon(StoreCheckoutQuote? q) {
  final c = q?.coupon;
  return c != null && c.problem == null ? c : null;
}

// ── Erros das callables ─────────────────────────────────────────────────

/// `HttpsError` do checkout → o que a tela faz (a mensagem já vem pronta em
/// português). [code] é o `FirebaseFunctionsException.code`.
StoreCheckoutException storeCheckoutErrorOf({
  required String code,
  String? message,
  Object? details,
}) {
  final c = code.trim().replaceFirst(RegExp(r'^functions/'), '');
  final m = (message ?? '').trim();
  final d = _map(details);
  final quote = storeQuoteFromMap(d?['quote']);
  switch (c) {
    case 'unauthenticated':
      return const StoreCheckoutException(
        StoreCheckoutErrorKind.session,
        'Sua sessão expirou. Entre de novo para continuar.',
      );
    // Callable ainda não deployada: o SDK devolve "not-found" cru.
    case 'not-found':
      return const StoreCheckoutException(
        StoreCheckoutErrorKind.unavailable,
        'O checkout ainda não está disponível. Tente de novo em instantes.',
      );
    case 'aborted':
      return StoreCheckoutException(
        StoreCheckoutErrorKind.changed,
        m.isNotEmpty
            ? m
            : 'Os valores do carrinho mudaram. Confira o novo total.',
        quote: quote,
      );
    case 'failed-precondition':
      if (d?['reason'] == 'cpf_required') {
        return StoreCheckoutException(
          StoreCheckoutErrorKind.cpf,
          m.isNotEmpty ? m : 'Informe seu CPF para pagar com Pix.',
        );
      }
      return StoreCheckoutException(
        StoreCheckoutErrorKind.blocked,
        m.isNotEmpty ? m : 'Revise o carrinho antes de pagar.',
        quote: quote,
      );
    case 'invalid-argument':
    case 'permission-denied':
    case 'resource-exhausted':
      return StoreCheckoutException(
        StoreCheckoutErrorKind.other,
        m.isNotEmpty ? m : 'Não deu pra fechar o pedido. Tente de novo.',
        quote: quote,
      );
    default:
      return const StoreCheckoutException(
        StoreCheckoutErrorKind.other,
        'Não deu pra fechar o pedido. Tente de novo em instantes.',
      );
  }
}

/// A mesma mensagem, mas para a cotação ("calcular o total").
String storeQuoteErrorMessage(StoreCheckoutException e) =>
    e.message.replaceAll('fechar o pedido', 'calcular o total');

// ── CPF ─────────────────────────────────────────────────────────────────

/// "12345678909" → "123.456.789-09" (enquanto digita também).
String formatStoreCpf(String raw) {
  final d = _cut(_digits(raw), 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return '${d.substring(0, 3)}.${d.substring(3)}';
  if (d.length <= 9) {
    return '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6)}';
  }
  return '${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6, 9)}'
      '-${d.substring(9)}';
}

// ── Endereços (`storeAddresses/{uid}`) ──────────────────────────────────

const int kStoreMaxAddresses = 10;
const List<String> kStoreAddressLabels = ['Casa', 'Trabalho', 'Outro'];

final RegExp _uf = RegExp(r'^[A-Z]{2}$');
final RegExp _ufDraft = RegExp(r'^[A-Za-z]{2}$');

/// `storeAddresses/{uid}` → lista; endereço sem id, rua, cidade ou UF é
/// descartado (o servidor faz o mesmo).
List<StoreAddress> storeAddressesFromMap(Map<String, Object?>? data) {
  final items = data?['items'];
  if (items is! List) return const [];
  return [
    for (final item in items)
      if (_map(item) case final a?)
        if (_addressFromMap(a) case final address?) address,
  ];
}

StoreAddress? _addressFromMap(Map<String, Object?> a) {
  final address = StoreAddress(
    id: _str(a['id']),
    label: _orNull(a['label']) ?? 'Casa',
    recipient: _str(a['recipient']),
    phone: _digits(_str(a['phone'])),
    zip: _digits(_str(a['zip'])),
    street: _str(a['street']),
    number: _str(a['number']),
    complement: _str(a['complement']),
    district: _str(a['district']),
    city: _str(a['city']),
    uf: _str(a['uf']).toUpperCase(),
    main: a['main'] == true,
  );
  if (address.id.isEmpty ||
      address.street.isEmpty ||
      address.city.isEmpty ||
      !_uf.hasMatch(address.uf)) {
    return null;
  }
  return address;
}

/// O mapa que vai para a rule (chaves fixas; `main` só no principal).
Map<String, Object> storeAddressToMap(StoreAddress a) => {
      'id': a.id,
      'label': a.label,
      'recipient': a.recipient,
      'phone': a.phone,
      'zip': a.zip,
      'street': a.street,
      'number': a.number,
      'complement': a.complement,
      'district': a.district,
      'city': a.city,
      'uf': a.uf,
      if (a.main) 'main': true,
    };

/// Grava (novo ou editado) mantendo um único principal: o primeiro endereço
/// nasce principal, e marcar outro tira a marca do anterior. `null` quando a
/// lista já está no teto.
List<StoreAddress>? upsertStoreAddress(
  List<StoreAddress> list,
  StoreAddress next, {
  required bool makeMain,
}) {
  final exists = list.any((a) => a.id == next.id);
  if (!exists && list.length >= kStoreMaxAddresses) return null;
  final merged = exists
      ? [for (final a in list) a.id == next.id ? next : a]
      : [...list, next];
  final String mainId;
  if (makeMain || merged.length == 1) {
    mainId = next.id;
  } else {
    mainId = (merged.where((a) => a.main).firstOrNull ?? merged.first).id;
  }
  return [for (final a in merged) a.copyWith(main: a.id == mainId)];
}

/// Exclui; se era o principal, o primeiro que sobrou vira principal.
List<StoreAddress> removeStoreAddress(List<StoreAddress> list, String id) {
  final left = [
    for (final a in list)
      if (a.id != id) a,
  ];
  if (left.isNotEmpty && !left.any((a) => a.main)) {
    left[0] = left[0].copyWith(main: true);
  }
  return left;
}

/// Endereço que o checkout abre selecionado: o principal, senão o primeiro.
String? defaultStoreAddressId(List<StoreAddress> list) =>
    (list.where((a) => a.main).firstOrNull ?? list.firstOrNull)?.id;

/// "Rua T-37, 1240 · Ap 802".
String storeAddressLine(StoreAddress a) {
  final head = a.number.isNotEmpty ? '${a.street}, ${a.number}' : a.street;
  return a.complement.isNotEmpty ? '$head · ${a.complement}' : head;
}

/// "Setor Bueno · Goiânia, GO".
String storeAddressArea(StoreAddress a) {
  final city = '${a.city}, ${a.uf}';
  return a.district.isNotEmpty ? '${a.district} · $city' : city;
}

/// "74210130" → "74210-130" (enquanto digita também).
String formatStoreCep(String raw) {
  final d = _cut(_digits(raw), 8);
  return d.length > 5 ? '${d.substring(0, 5)}-${d.substring(5)}' : d;
}

/// "62998124471" → "(62) 99812-4471"; fixo com 10 dígitos → "(62) 3241-0000".
String formatStorePhone(String raw) {
  final d = _cut(_digits(raw), 11);
  if (d.length <= 2) return d.isEmpty ? '' : '($d';
  final ddd = d.substring(0, 2);
  final rest = d.substring(2);
  final cut = rest.length > 8 ? 5 : 4;
  return rest.length > cut
      ? '($ddd) ${rest.substring(0, cut)}-${rest.substring(cut)}'
      : '($ddd) $rest';
}

StoreAddressDraft storeDraftFromAddress(StoreAddress a) => StoreAddressDraft(
      label: a.label,
      recipient: a.recipient,
      phone: a.phone,
      zip: a.zip,
      street: a.street,
      number: a.number,
      complement: a.complement,
      district: a.district,
      city: a.city,
      uf: a.uf,
    );

/// Mensagem por campo; vazio = pode salvar. "S/N" vale como número.
Map<StoreAddressField, String> storeAddressDraftErrors(StoreAddressDraft d) {
  final phone = _digits(d.phone);
  return {
    if (_digits(d.zip).length != 8) StoreAddressField.zip: 'CEP com 8 números',
    if (d.street.trim().isEmpty) StoreAddressField.street: 'Informe a rua',
    if (d.number.trim().isEmpty)
      StoreAddressField.number: 'Informe o número (ou S/N)',
    if (d.district.trim().isEmpty)
      StoreAddressField.district: 'Informe o bairro',
    if (d.city.trim().isEmpty) StoreAddressField.city: 'Informe a cidade',
    if (!_ufDraft.hasMatch(d.uf.trim()))
      StoreAddressField.uf: 'UF com 2 letras',
    if (d.recipient.trim().length < 2)
      StoreAddressField.recipient: 'Quem vai receber',
    if (phone.length < 10 || phone.length > 11)
      StoreAddressField.phone: 'Celular com DDD',
  };
}

/// Rascunho → endereço normalizado (só dígitos, UF em caixa alta, tetos da
/// rule).
StoreAddress storeAddressFromDraft(
  StoreAddressDraft d, {
  required String id,
  required bool main,
}) {
  final label = _cut(d.label.trim(), 40);
  return StoreAddress(
    id: id,
    label: label.isEmpty ? 'Casa' : label,
    recipient: _cut(d.recipient.trim(), 120),
    phone: _cut(_digits(d.phone), 11),
    zip: _cut(_digits(d.zip), 8),
    street: _cut(d.street.trim(), 160),
    number: _cut(d.number.trim(), 20),
    complement: _cut(d.complement.trim(), 120),
    district: _cut(d.district.trim(), 120),
    city: _cut(d.city.trim(), 80),
    uf: _cut(d.uf.trim().toUpperCase(), 2),
    main: main,
  );
}

// ── ViaCEP ──────────────────────────────────────────────────────────────

/// Resposta do ViaCEP → endereço; CEP inexistente (`{erro: true}`) ou sem
/// cidade/UF vira `null`. CEP geral (cidade pequena) vem sem rua.
StoreViaCepAddress? storeViaCepFromMap(Object? raw) {
  final data = _map(raw);
  if (data == null) return null;
  if (data['erro'] == true || data['erro'] == 'true') return null;
  final city = _str(data['localidade']);
  final uf = _str(data['uf']);
  if (city.isEmpty || uf.isEmpty) return null;
  return StoreViaCepAddress(
    cep: _digits(_str(data['cep'])),
    street: _str(data['logradouro']),
    district: _str(data['bairro']),
    city: city,
    uf: uf.toUpperCase(),
  );
}
