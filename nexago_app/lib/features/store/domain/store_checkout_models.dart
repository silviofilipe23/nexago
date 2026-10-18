/// Modelos do checkout da Loja (app 03–08): cotação do servidor, endereços do
/// atleta, pedido criado e a visão do pedido (`storeOrderViews`).
///
/// Espelham o contrato de `docs/business-rules/loja-checkout.md` e o portal
/// web (`store-checkout-model.ts`). O cliente nunca manda preço: manda o que
/// quer (canal, entrega, cupom) e o servidor cota tudo de novo.
library;

// ── Pedido que o cliente monta ──────────────────────────────────────────

/// Canal que vai no `quoteStoreCheckout`/`createStoreOrder`.
const String kStoreChannelIos = 'app_ios';
const String kStoreChannelAndroid = 'app_android';

/// Como receber: retirada na arena ou entrega em casa.
sealed class StoreCheckoutDelivery {
  const StoreCheckoutDelivery();

  Map<String, Object> toMap();

  /// Identidade estável (a cotação velha deixa de valer quando muda).
  String get key;
}

class StoreArenaDelivery extends StoreCheckoutDelivery {
  const StoreArenaDelivery(this.arenaId);

  final String arenaId;

  @override
  Map<String, Object> toMap() => {'type': 'arena', 'arenaId': arenaId};

  @override
  String get key => 'arena:$arenaId';
}

class StoreHomeDelivery extends StoreCheckoutDelivery {
  const StoreHomeDelivery({required this.addressId, required this.modeId});

  final String addressId;
  final String modeId;

  @override
  Map<String, Object> toMap() =>
      {'type': 'casa', 'addressId': addressId, 'modeId': modeId};

  @override
  String get key => 'casa:$addressId:$modeId';
}

/// Entrada da cotação (e, com o total e o CPF, da criação do pedido).
class StoreCheckoutRequest {
  const StoreCheckoutRequest({
    required this.channel,
    this.delivery,
    this.couponCode,
  });

  final String channel;

  /// `null` = ainda não escolheu (o servidor devolve `entrega_faltando`).
  final StoreCheckoutDelivery? delivery;
  final String? couponCode;

  Map<String, Object?> toMap() => {
        'channel': channel,
        'delivery': delivery?.toMap(),
        'couponCode': couponCode,
      };

  String get key => '$channel|${delivery?.key ?? '-'}|${couponCode ?? '-'}';

  @override
  bool operator ==(Object other) =>
      other is StoreCheckoutRequest && other.key == key;

  @override
  int get hashCode => key.hashCode;

  @override
  String toString() => 'StoreCheckoutRequest($key)';
}

// ── Cotação ─────────────────────────────────────────────────────────────

/// Problema de uma linha (os mesmos textos do portal, `LINE_PROBLEM_LABEL`).
enum StoreQuoteLineProblem {
  unavailable('indisponivel', 'Saiu da loja — remova pra seguir'),
  soldOut('esgotado', 'Sem estoque nessa quantidade'),
  noPickup('sem_retirada', 'Não sai pra retirada na arena'),
  noDelivery('sem_entrega', 'Não tem entrega em casa'),
  customizationOff(
    'personalizacao_off',
    'Essa personalização não vale mais — remova e refaça',
  );

  const StoreQuoteLineProblem(this.id, this.label);

  final String id;
  final String label;

  static StoreQuoteLineProblem? from(Object? raw) {
    for (final p in values) {
      if (p.id == raw) return p;
    }
    return null;
  }
}

/// Por que o pedido ainda não pode ser pago.
enum StoreQuoteProblem {
  emptyCart('carrinho_vazio'),
  deliveryMissing('entrega_faltando'),
  arenaUnavailable('arena_indisponivel'),
  addressMissing('endereco_faltando'),
  modeUnavailable('modalidade_indisponivel'),
  lineProblem('linha_com_problema');

  const StoreQuoteProblem(this.id);

  final String id;

  static StoreQuoteProblem? from(Object? raw) {
    for (final p in values) {
      if (p.id == raw) return p;
    }
    return null;
  }
}

class StoreQuoteLine {
  const StoreQuoteLine({
    required this.key,
    this.productId = '',
    this.skuId = '',
    this.qty = 0,
    this.name = '',
    this.variantLabel = '',
    this.imageUrl,
    this.unitCents = 0,
    this.totalCents = 0,
    this.personalized = false,
    this.customizationLabel,
    this.problem,
  });

  /// `lineId` da personalizada ou `produto/SKU` — a chave do carrinho.
  final String key;
  final String productId;
  final String skuId;
  final int qty;
  final String name;
  final String variantLabel;
  final String? imageUrl;
  final int unitCents;
  final int totalCents;
  final bool personalized;
  final String? customizationLabel;
  final StoreQuoteLineProblem? problem;
}

class StoreQuoteCoupon {
  const StoreQuoteCoupon({
    required this.code,
    this.discountCents = 0,
    this.problem,
    this.message,
  });

  final String code;
  final int discountCents;

  /// `null` = aplicado.
  final String? problem;

  /// Já em português, pronta para mostrar sob o campo.
  final String? message;
}

class StoreCheckoutQuote {
  const StoreCheckoutQuote({
    this.lines = const [],
    this.units = 0,
    this.subtotalCents = 0,
    this.coupon,
    this.pixDiscountPct = 0,
    this.pixDiscountCents = 0,
    this.shippingCents = 0,
    this.freeShipping = false,
    this.totalCents = 0,
    this.problems = const [],
  });

  final List<StoreQuoteLine> lines;
  final int units;
  final int subtotalCents;
  final StoreQuoteCoupon? coupon;
  final int pixDiscountPct;
  final int pixDiscountCents;
  final int shippingCents;
  final bool freeShipping;
  final int totalCents;

  /// Com qualquer problema não se paga.
  final List<StoreQuoteProblem> problems;

  StoreCheckoutQuote copyWith({
    List<StoreQuoteProblem>? problems,
    Object? coupon = _keep,
    int? totalCents,
  }) {
    return StoreCheckoutQuote(
      lines: lines,
      units: units,
      subtotalCents: subtotalCents,
      coupon:
          identical(coupon, _keep) ? this.coupon : coupon as StoreQuoteCoupon?,
      pixDiscountPct: pixDiscountPct,
      pixDiscountCents: pixDiscountCents,
      shippingCents: shippingCents,
      freeShipping: freeShipping,
      totalCents: totalCents ?? this.totalCents,
      problems: problems ?? this.problems,
    );
  }
}

const Object _keep = Object();

// ── Erros do checkout ───────────────────────────────────────────────────

/// O que a tela faz com o erro da callable.
enum StoreCheckoutErrorKind {
  /// Atleta sem CPF: pedir e reenviar com `cpf`.
  cpf,

  /// O total mudou: trocar pela cotação nova e pedir confirmação.
  changed,

  /// Carrinho/cupom com problema (com a cotação nova).
  blocked,

  /// Sessão expirada.
  session,

  /// Callable ainda não deployada (o SDK devolve `not-found` cru).
  unavailable,
  other,
}

/// `HttpsError` do checkout, já com a mensagem pronta em português e a
/// cotação nova que o servidor mandou junto (quando mandou).
class StoreCheckoutException implements Exception {
  const StoreCheckoutException(this.kind, this.message, {this.quote});

  final StoreCheckoutErrorKind kind;
  final String message;
  final StoreCheckoutQuote? quote;

  @override
  String toString() => message;
}

// ── Endereços (`storeAddresses/{uid}`) ──────────────────────────────────

class StoreAddress {
  const StoreAddress({
    required this.id,
    this.label = 'Casa',
    this.recipient = '',
    this.phone = '',
    this.zip = '',
    required this.street,
    this.number = '',
    this.complement = '',
    this.district = '',
    required this.city,
    required this.uf,
    this.main = false,
  });

  final String id;
  final String label;
  final String recipient;

  /// Só dígitos.
  final String phone;

  /// Só dígitos.
  final String zip;
  final String street;
  final String number;
  final String complement;
  final String district;
  final String city;
  final String uf;
  final bool main;

  StoreAddress copyWith({bool? main}) => StoreAddress(
        id: id,
        label: label,
        recipient: recipient,
        phone: phone,
        zip: zip,
        street: street,
        number: number,
        complement: complement,
        district: district,
        city: city,
        uf: uf,
        main: main ?? this.main,
      );

  @override
  bool operator ==(Object other) =>
      other is StoreAddress &&
      other.id == id &&
      other.label == label &&
      other.recipient == recipient &&
      other.phone == phone &&
      other.zip == zip &&
      other.street == street &&
      other.number == number &&
      other.complement == complement &&
      other.district == district &&
      other.city == city &&
      other.uf == uf &&
      other.main == main;

  @override
  int get hashCode => Object.hash(id, label, recipient, phone, zip, street,
      number, complement, district, city, uf, main);

  @override
  String toString() => 'StoreAddress($id, $street, $city/$uf'
      '${main ? ', principal' : ''})';
}

/// Campos do formulário de endereço (a ordem do desenho).
enum StoreAddressField {
  zip,
  street,
  number,
  complement,
  district,
  city,
  uf,
  recipient,
  phone,
  label,
}

/// O que o atleta está digitando (ainda sem normalizar).
class StoreAddressDraft {
  const StoreAddressDraft({
    this.label = 'Casa',
    this.recipient = '',
    this.phone = '',
    this.zip = '',
    this.street = '',
    this.number = '',
    this.complement = '',
    this.district = '',
    this.city = '',
    this.uf = '',
  });

  static const StoreAddressDraft empty = StoreAddressDraft();

  final String label;
  final String recipient;
  final String phone;
  final String zip;
  final String street;
  final String number;
  final String complement;
  final String district;
  final String city;
  final String uf;

  String valueOf(StoreAddressField field) => switch (field) {
        StoreAddressField.label => label,
        StoreAddressField.recipient => recipient,
        StoreAddressField.phone => phone,
        StoreAddressField.zip => zip,
        StoreAddressField.street => street,
        StoreAddressField.number => number,
        StoreAddressField.complement => complement,
        StoreAddressField.district => district,
        StoreAddressField.city => city,
        StoreAddressField.uf => uf,
      };

  StoreAddressDraft copyWith(StoreAddressField field, String value) =>
      StoreAddressDraft(
        label: field == StoreAddressField.label ? value : label,
        recipient: field == StoreAddressField.recipient ? value : recipient,
        phone: field == StoreAddressField.phone ? value : phone,
        zip: field == StoreAddressField.zip ? value : zip,
        street: field == StoreAddressField.street ? value : street,
        number: field == StoreAddressField.number ? value : number,
        complement: field == StoreAddressField.complement ? value : complement,
        district: field == StoreAddressField.district ? value : district,
        city: field == StoreAddressField.city ? value : city,
        uf: field == StoreAddressField.uf ? value : uf,
      );
}

/// O que o ViaCEP devolveu (CEP geral vem sem rua nem bairro).
class StoreViaCepAddress {
  const StoreViaCepAddress({
    required this.cep,
    this.street = '',
    this.district = '',
    required this.city,
    required this.uf,
  });

  final String cep;
  final String street;
  final String district;
  final String city;
  final String uf;

  @override
  bool operator ==(Object other) =>
      other is StoreViaCepAddress &&
      other.cep == cep &&
      other.street == street &&
      other.district == district &&
      other.city == city &&
      other.uf == uf;

  @override
  int get hashCode => Object.hash(cep, street, district, city, uf);
}

// ── Pedido do atleta (`storeOrderViews/{orderId}`) ──────────────────────

/// Status do pedido com o rótulo do portal (`ORDER_STATUS_LABEL`).
enum StoreOrderStatus {
  pag('pag', 'Aguardando pagamento'),
  sep('sep', 'Em separação'),
  sepd('sepd', 'Separado'),
  ret('ret', 'Pronto pra retirar'),
  tra('tra', 'Em trânsito'),
  ent('ent', 'Entregue'),
  rtd('rtd', 'Retirado'),
  can('can', 'Cancelado');

  const StoreOrderStatus(this.id, this.label);

  final String id;
  final String label;

  static StoreOrderStatus? from(Object? raw) {
    for (final s in values) {
      if (s.id == raw) return s;
    }
    return null;
  }
}

/// Cor da pílula por momento (esperando, andando, pronto, a caminho,
/// concluído, cancelado).
enum StoreOrderTone { wait, progress, ready, transit, done, canceled }

class StoreOrderItem {
  const StoreOrderItem({
    this.productId = '',
    this.skuId = '',
    this.name = '',
    this.variantLabel = '',
    this.imageUrl,
    this.qty = 0,
    this.unitCents = 0,
    this.totalCents = 0,
    this.personalized = false,
    this.customizationLabel,
  });

  final String productId;
  final String skuId;
  final String name;
  final String variantLabel;
  final String? imageUrl;
  final int qty;
  final int unitCents;
  final int totalCents;
  final bool personalized;
  final String? customizationLabel;
}

/// O Pix do pedido (só enquanto aguarda pagamento).
class StoreOrderPix {
  const StoreOrderPix({required this.copyPaste, this.expiresAt});

  final String copyPaste;
  final DateTime? expiresAt;
}

sealed class StoreOrderDelivery {
  const StoreOrderDelivery();
}

class StoreOrderArenaDelivery extends StoreOrderDelivery {
  const StoreOrderArenaDelivery({
    this.placeName,
    this.counter,
    this.address,
    this.pickupCode,
    this.pickupDeadline,
  });

  final String? placeName;

  /// "recepção", "balcão da loja".
  final String? counter;
  final String? address;

  /// Só com o pedido na arena (`ret`).
  final String? pickupCode;
  final DateTime? pickupDeadline;
}

class StoreOrderHomeDelivery extends StoreOrderDelivery {
  const StoreOrderHomeDelivery({
    this.modeName,
    this.address,
    this.city,
    this.uf,
    this.zip,
    this.carrier,
    this.tracking,
    this.trackingUrl,
    this.eta,
  });

  final String? modeName;
  final String? address;
  final String? city;
  final String? uf;
  final String? zip;
  final String? carrier;
  final String? tracking;
  final String? trackingUrl;

  /// Data civil do envio (`2026-10-22`).
  final String? eta;
}

class StoreOrderView {
  const StoreOrderView({
    required this.id,
    required this.number,
    required this.status,
    this.items = const [],
    this.units = 0,
    this.subtotalCents = 0,
    this.couponCode,
    this.couponDiscountCents = 0,
    this.pixDiscountCents = 0,
    this.shippingCents = 0,
    this.totalCents = 0,
    this.pix,
    this.delivery = const StoreOrderHomeDelivery(),
    this.createdAt,
    this.paidAt,
    this.separatedAt,
    this.arrivedAt,
    this.shippedAt,
    this.completedAt,
    this.canceledAt,
    this.cancelReason,
    this.refundedCents = 0,
  });

  final String id;

  /// "NX-0001".
  final String number;
  final StoreOrderStatus status;
  final List<StoreOrderItem> items;
  final int units;
  final int subtotalCents;
  final String? couponCode;
  final int couponDiscountCents;
  final int pixDiscountCents;
  final int shippingCents;
  final int totalCents;
  final StoreOrderPix? pix;
  final StoreOrderDelivery delivery;
  final DateTime? createdAt;
  final DateTime? paidAt;
  final DateTime? separatedAt;
  final DateTime? arrivedAt;
  final DateTime? shippedAt;
  final DateTime? completedAt;
  final DateTime? canceledAt;
  final String? cancelReason;
  final int refundedCents;

  bool get atArena => delivery is StoreOrderArenaDelivery;
}

/// Barra de etapas: [step] é a etapa em curso (as anteriores ficam verdes).
class StoreOrderProgress {
  const StoreOrderProgress(this.steps, this.step);

  final List<String> steps;
  final int step;

  @override
  bool operator ==(Object other) =>
      other is StoreOrderProgress &&
      other.step == step &&
      other.steps.join('|') == steps.join('|');

  @override
  int get hashCode => Object.hash(step, Object.hashAll(steps));

  @override
  String toString() => 'StoreOrderProgress($steps, $step)';
}

/// Filtros de "Meus pedidos" (os mesmos do portal, `ORDER_FILTERS`).
enum StoreOrderFilter {
  all('todos', 'Todos'),
  active('andamento', 'Em andamento'),
  done('concluidos', 'Concluídos'),
  canceled('cancelados', 'Cancelados');

  const StoreOrderFilter(this.id, this.label);

  final String id;
  final String label;
}

/// O que `createStoreOrder` devolve — vai pela navegação até a tela do Pix,
/// porque o espelho `storeOrderViews` nasce ~1 s depois.
class StoreCreatedOrder {
  const StoreCreatedOrder({
    required this.orderId,
    required this.number,
    required this.totalCents,
    required this.pix,
  });

  final String orderId;
  final String number;
  final int totalCents;
  final StoreOrderPix pix;
}

/// Uma linha do "Comprar de novo" (peça comum ainda à venda).
class StoreRebuyLine {
  const StoreRebuyLine({
    required this.productId,
    required this.skuId,
    required this.qty,
    required this.maxQty,
  });

  final String productId;
  final String skuId;
  final int qty;

  /// Saldo exposto do SKU: a linha do carrinho não passa dele.
  final int maxQty;
}

class StoreRebuyPlan {
  const StoreRebuyPlan({this.lines = const [], this.skipped = 0});

  final List<StoreRebuyLine> lines;

  /// Personalizadas (pedem a arte de novo) e peças fora da loja/sem saldo.
  final int skipped;
}
