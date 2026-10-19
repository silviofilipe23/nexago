/// Loja · Avaliações: quem pode avaliar, o formulário 08b (um produto por
/// vez), o resumo e os filtros da página do produto — puras, testáveis sem
/// Firebase.
///
/// Contrato em `docs/business-rules/loja-avaliacoes.md`; as contas TÊM de
/// bater com o servidor (`functions/src/store-reviews.ts`) e com o portal.
library;

import 'dart:typed_data';

import 'store_checkout_models.dart';
import 'store_models.dart';
import 'store_review_models.dart';
import 'store_rules.dart';

// ── Quem avalia ─────────────────────────────────────────────────────────

/// Momento da avaliação de um pedido entregue/retirado: sem avaliação,
/// avaliado e dentro do prazo de edição, ou avaliado e travado.
enum StoreOrderReviewState { none, editable, locked }

/// `null` = o pedido não pode ser avaliado (só `ent`/`rtd`). Sem
/// `editableUntil`, o prazo sai do `createdAt` (a conta do servidor); sem
/// nenhum dos dois, só leitura (como o portal).
StoreOrderReviewState? storeOrderReviewState(
  StoreOrderStatus status,
  StoreOrderReview? review,
  DateTime now,
) {
  if (status != StoreOrderStatus.ent && status != StoreOrderStatus.rtd) {
    return null;
  }
  if (review == null) return StoreOrderReviewState.none;
  final until =
      review.editableUntil ??
      review.createdAt?.add(const Duration(days: kStoreReviewEditDays));
  if (until == null) return StoreOrderReviewState.locked;
  return now.isAfter(until)
      ? StoreOrderReviewState.locked
      : StoreOrderReviewState.editable;
}

/// Uma avaliação por produto do pedido: vale a primeira linha dele (a mesma
/// conta do servidor). Linha sem produto fica de fora.
List<StoreOrderItem> storeReviewableLines(StoreOrderView order) {
  final seen = <String>{};
  return [
    for (final line in order.items)
      if (line.productId.trim().isNotEmpty && seen.add(line.productId.trim()))
        line,
  ];
}

// ── Eixo Tamanho ────────────────────────────────────────────────────────

/// Rótulo do eixo é "Tamanho" (sem acento e caixa) — o `isSizeAxis` do
/// servidor.
bool isStoreReviewSizeAxis(StoreAxis axis) =>
    normalizeStoreSearch(axis.label) == 'tamanho';

/// O eixo Tamanho do produto; `null` = produto sem tamanho.
StoreAxis? storeReviewSizeAxis(StoreProduct? product) {
  if (product == null) return null;
  for (final axis in product.axes) {
    if (isStoreReviewSizeAxis(axis)) return axis;
  }
  return null;
}

/// Etiquetas do formulário: com tamanho, "Tamanho certo" sai (a pergunta do
/// caimento entra no lugar).
List<StoreReviewTag> storeReviewFormTags({required bool sized}) => [
  for (final tag in StoreReviewTag.values)
    if (!sized || tag != StoreReviewTag.tamanho) tag,
];

// ── Formulário 08b ──────────────────────────────────────────────────────

/// Os produtos do pedido no formulário, já com o que estava publicado
/// ([review], na edição). [isSized] diz se o produto tem eixo Tamanho.
List<StoreReviewItemDraft> storeReviewDraftsFor(
  StoreOrderView order,
  StoreOrderReview? review, {
  required bool Function(String productId) isSized,
}) {
  return [
    for (final line in storeReviewableLines(order))
      _draftFor(line.productId.trim(), review, isSized(line.productId.trim())),
  ];
}

StoreReviewItemDraft _draftFor(
  String productId,
  StoreOrderReview? review,
  bool sized,
) {
  final before = review?.itemOf(productId);
  if (before == null) {
    return StoreReviewItemDraft(productId: productId, sized: sized);
  }
  return StoreReviewItemDraft(
    productId: productId,
    sized: sized,
    rating: before.rating >= 1 && before.rating <= 5 ? before.rating : null,
    tags: before.tags.toSet(),
    fit: sized ? before.fit : null,
    comment: before.comment,
    photos: [
      for (final p in before.photos)
        if (p.path.isNotEmpty)
          StoreReviewPhotoDraft(id: p.path, path: p.path, url: p.url),
    ],
  );
}

/// Pode publicar: pelo menos um produto com nota e nenhuma foto subindo.
bool storeReviewCanPublish(List<StoreReviewItemDraft> drafts) =>
    drafts.any((d) => d.rating != null) && !drafts.any((d) => d.uploading);

/// O pedido da callable: só os produtos com nota, na ordem do pedido. Com
/// tamanho, a etiqueta "Tamanho certo" não vai (o formulário não mostra); sem
/// tamanho, o caimento não vai. A retirada só no pedido de arena.
StoreReviewSubmission buildStoreReviewSubmission({
  required String orderId,
  required bool anonymous,
  required List<StoreReviewItemDraft> drafts,
  required bool atArena,
  int? pickupRating,
}) {
  final allowed = <bool, List<StoreReviewTag>>{
    true: storeReviewFormTags(sized: true),
    false: storeReviewFormTags(sized: false),
  };
  return StoreReviewSubmission(
    orderId: orderId,
    anonymous: anonymous,
    items: [
      for (final d in drafts)
        if (d.rating case final rating?)
          StoreReviewItemInput(
            productId: d.productId,
            rating: rating,
            tags: [
              for (final tag in allowed[d.sized]!)
                if (d.tags.contains(tag)) tag,
            ],
            fit: d.sized ? d.fit : null,
            comment: _clip(d.comment.trim(), kStoreReviewMaxComment),
            photos: [
              for (final p in d.photos)
                if (p.ready) p.path!,
            ].take(kStoreReviewMaxPhotos).toList(),
          ),
    ],
    pickupRating:
        atArena &&
            pickupRating != null &&
            pickupRating >= 1 &&
            pickupRating <= 5
        ? pickupRating
        : null,
  );
}

String _clip(String s, int max) => s.length > max ? s.substring(0, max) : s;

// ── Fotos ───────────────────────────────────────────────────────────────

bool _startsWith(Uint8List bytes, List<int> magic, [int offset = 0]) {
  if (bytes.length < offset + magic.length) return false;
  for (var i = 0; i < magic.length; i++) {
    if (bytes[offset + i] != magic[i]) return false;
  }
  return true;
}

/// `contentType` pelos primeiros bytes — só JPEG, PNG e WEBP (a rule do
/// Storage e a callable aceitam esses). `null` = formato recusado (HEIC…).
String? storeReviewPhotoContentType(Uint8List bytes) {
  if (_startsWith(bytes, const [0xFF, 0xD8, 0xFF])) return 'image/jpeg';
  if (_startsWith(bytes, const [0x89, 0x50, 0x4E, 0x47])) return 'image/png';
  if (_startsWith(bytes, const [0x52, 0x49, 0x46, 0x46]) &&
      _startsWith(bytes, const [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/// Extensão do arquivo no Storage para o `contentType`.
String storeReviewPhotoExtension(String contentType) => switch (contentType) {
  'image/png' => 'png',
  'image/webp' => 'webp',
  _ => 'jpg',
};

/// O que impede a foto de subir (mesma cópia do servidor); `null` = ok.
String? storeReviewPhotoProblem(Uint8List bytes) {
  if (storeReviewPhotoContentType(bytes) == null) {
    return 'Foto em formato não aceito (use JPG, PNG ou WEBP).';
  }
  if (bytes.length > kStoreReviewMaxPhotoBytes) return 'Foto maior que 10 MB.';
  return null;
}

// ── Erros da callable ───────────────────────────────────────────────────

/// Mensagem pronta do erro da `submitStoreOrderReview`. A do servidor vale
/// quando é nossa; a descrição crua do SDK ("NOT FOUND", "INTERNAL") não
/// serve — `not-found` cru é a callable que não está deployada.
String storeReviewErrorMessage(String code, String? message) {
  final c = code.trim().replaceFirst(RegExp(r'^functions/'), '');
  final text = (message ?? '').trim();
  final separators = RegExp(r'[ _-]');
  final raw =
      text.isEmpty ||
      text.toUpperCase().replaceAll(separators, '') ==
          c.toUpperCase().replaceAll(separators, '');
  if (!raw) return text;
  return switch (c) {
    'not-found' => 'A avaliação ainda não está disponível. Tente de novo em instantes.',
    'unauthenticated' => 'Sua sessão expirou. Entre de novo para continuar.',
    _ => 'Não deu pra publicar a avaliação. Tente de novo em instantes.',
  };
}

// ── Datas (relógio de parede de São Paulo, UTC−3 fixo) ──────────────────

const Duration _saoPauloOffset = Duration(hours: 3);

/// Sem ponto ("out", não "out."): `DateFormat('MMM', 'pt_BR')` põe ponto.
const List<String> _months = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

DateTime _wall(DateTime d) => d.toUtc().subtract(_saoPauloOffset);

/// "12 out" (· "12 out 2025" em outro ano); vazio sem data.
String formatStoreReviewDate(DateTime? at, DateTime now) {
  if (at == null) return '';
  final w = _wall(at);
  final base = '${w.day} ${_months[w.month - 1]}';
  return w.year == _wall(now).year ? base : '$base ${w.year}';
}

/// "retirado em 18 set" / "entregue em 18 set" (a linha do produto no 08b);
/// `null` sem data de conclusão.
String? storeReviewReceivedLabel(StoreOrderView order, DateTime now) {
  final at = order.completedAt;
  if (at == null) return null;
  final verb = order.status == StoreOrderStatus.rtd ? 'retirado' : 'entregue';
  return '$verb em ${formatStoreReviewDate(at, now)}';
}

// ── Resumo da página do produto ─────────────────────────────────────────

/// Porcentagem inteira; 0 sem total.
int storeReviewPercent(int part, int total) =>
    total <= 0 ? 0 : (part * 100 / total).round();

/// "4,8".
String formatStoreReviewAverage(double average) =>
    average.toStringAsFixed(1).replaceAll('.', ',');

/// "86 avaliações" / "1 avaliação".
String storeReviewCountLabel(int n) => n == 1 ? '1 avaliação' : '$n avaliações';

/// Média, "recomendam" e a distribuição (5 → 1 estrela, em %).
class StoreReviewSummary {
  const StoreReviewSummary({
    required this.average,
    required this.count,
    required this.recommendPct,
    required this.starsPct,
  });

  final double average;
  final int count;
  final int recommendPct;

  /// `(estrelas, %)` de 5 a 1.
  final List<({int stars, int pct})> starsPct;

  /// Estrelas cheias do resumo (a média arredondada, como o portal).
  int get stars => average.round().clamp(0, 5);

  /// "4,8".
  String get averageLabel => formatStoreReviewAverage(average);
}

/// Só a partir de [kStoreReviewMinForAverage] avaliações (o selo da vitrine
/// usa o mesmo corte); antes disso, `null` e a página mostra só os cards.
StoreReviewSummary? storeReviewSummary(StoreProduct product) {
  final avg = product.ratingAvg;
  final count = product.ratingCount;
  if (avg == null || count < kStoreReviewMinForAverage) return null;
  final dist = product.reviewStats.dist;
  return StoreReviewSummary(
    average: avg,
    count: count,
    recommendPct: storeReviewPercent(product.reviewStats.recommend, count),
    starsPct: [
      for (var stars = 5; stars >= 1; stars--)
        (
          stars: stars,
          pct: storeReviewPercent(
            stars - 1 < dist.length ? dist[stars - 1] : 0,
            count,
          ),
        ),
    ],
  );
}

/// Barra do caimento: [positionPct] de 0 (pequeno) a 100 (grande).
class StoreReviewFitBar {
  const StoreReviewFitBar({required this.positionPct, required this.label});

  final double positionPct;
  final String label;
}

/// Só produto com eixo Tamanho e ≥ [kStoreReviewMinFitAnswers] respostas.
/// Posição = 50 + 50 × (grande − pequeno) / total, arredondada antes do
/// rótulo (a conta do portal).
StoreReviewFitBar? storeReviewFitBar(
  StoreReviewStats stats, {
  required bool sized,
}) {
  final total = stats.fitAnswers;
  if (!sized || total < kStoreReviewMinFitAnswers) return null;
  final position = (50 + 50 * (stats.fitLarge - stats.fitSmall) / total)
      .roundToDouble();
  return StoreReviewFitBar(
    positionPct: position,
    label: position < 40
        ? 'Veste pequeno'
        : position > 60
        ? 'Veste grande'
        : 'Veste bem',
  );
}

// ── Filtros e ordem ─────────────────────────────────────────────────────

enum StoreReviewFilterKind { all, withPhotos, fiveStars, size }

class StoreReviewFilterOption {
  const StoreReviewFilterOption({
    required this.kind,
    required this.label,
    required this.count,
  });

  final StoreReviewFilterKind kind;
  final String label;
  final int count;
}

bool _matches(
  StorePublicReview r,
  StoreReviewFilterKind kind,
  String? sizeValueId,
) => switch (kind) {
  StoreReviewFilterKind.all => true,
  StoreReviewFilterKind.withPhotos => r.photos.isNotEmpty,
  StoreReviewFilterKind.fiveStars => r.rating == 5,
  StoreReviewFilterKind.size =>
    sizeValueId != null && r.sizeValueId == sizeValueId,
};

/// Todas · Com foto · 5 estrelas · "Tamanho M" — o último só com um tamanho
/// escolhido na página ([sizeValueId]/[sizeLabel]) e avaliação nele. As
/// contagens saem da lista carregada (o que o filtro vai mostrar), inclusive
/// "Todas" — o agregado (`ratingCount`) fica só no resumo.
List<StoreReviewFilterOption> storeReviewFilterOptions(
  List<StorePublicReview> reviews, {
  String? sizeValueId,
  String? sizeLabel,
}) {
  int count(StoreReviewFilterKind kind) =>
      reviews.where((r) => _matches(r, kind, sizeValueId)).length;
  final sizeCount = sizeValueId == null ? 0 : count(StoreReviewFilterKind.size);
  return [
    StoreReviewFilterOption(
      kind: StoreReviewFilterKind.all,
      label: 'Todas',
      count: reviews.length,
    ),
    StoreReviewFilterOption(
      kind: StoreReviewFilterKind.withPhotos,
      label: 'Com foto',
      count: count(StoreReviewFilterKind.withPhotos),
    ),
    StoreReviewFilterOption(
      kind: StoreReviewFilterKind.fiveStars,
      label: '5 estrelas',
      count: count(StoreReviewFilterKind.fiveStars),
    ),
    if (sizeCount > 0)
      StoreReviewFilterOption(
        kind: StoreReviewFilterKind.size,
        label: 'Tamanho ${(sizeLabel ?? '').trim()}'.trim(),
        count: sizeCount,
      ),
  ];
}

enum StoreReviewSort {
  recent('Mais recentes'),
  best('Melhor nota'),
  worst('Pior nota');

  const StoreReviewSort(this.label);

  final String label;
}

int _byRecent(StorePublicReview a, StorePublicReview b) {
  final at = a.createdAt;
  final bt = b.createdAt;
  if (at == null && bt == null) return 0;
  if (at == null) return 1;
  if (bt == null) return -1;
  return bt.compareTo(at);
}

/// A lista filtrada e ordenada (empate na nota: a mais recente primeiro).
List<StorePublicReview> storeReviewsView(
  List<StorePublicReview> reviews, {
  StoreReviewFilterKind filter = StoreReviewFilterKind.all,
  String? sizeValueId,
  StoreReviewSort sort = StoreReviewSort.recent,
}) {
  final shown = [
    for (final r in reviews)
      if (_matches(r, filter, sizeValueId)) r,
  ];
  shown.sort(switch (sort) {
    StoreReviewSort.recent => _byRecent,
    StoreReviewSort.best => (a, b) {
      final byRating = b.rating.compareTo(a.rating);
      return byRating != 0 ? byRating : _byRecent(a, b);
    },
    StoreReviewSort.worst => (a, b) {
      final byRating = a.rating.compareTo(b.rating);
      return byRating != 0 ? byRating : _byRecent(a, b);
    },
  });
  return shown;
}

/// "12 out · Branco areia · M" (o que tiver).
String storeReviewMetaLine(StorePublicReview r, DateTime now) => [
  formatStoreReviewDate(r.createdAt, now),
  r.variantLabel.trim(),
].where((s) => s.isNotEmpty).join(' · ');

/// Etiquetas do card + o caimento por último. Com caimento, a etiqueta
/// "Tamanho certo" sai (o portal faz igual).
List<String> storeReviewChips(StorePublicReview r) => [
  for (final tag in r.tags)
    if (!(r.fit != null && tag == StoreReviewTag.tamanho)) tag.label,
  if (r.fit case final fit?) fit.chipLabel,
];

/// Variação da linha do pedido no 08b ("Preta · único · ANTUNES").
String storeReviewLineVariant(StoreOrderItem line) => [
  line.variantLabel.trim(),
  (line.customizationLabel ?? '').trim(),
].where((s) => s.isNotEmpty).join(' · ');
