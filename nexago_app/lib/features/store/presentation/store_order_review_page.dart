import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../application/store_checkout_providers.dart';
import '../application/store_providers.dart';
import '../application/store_review_providers.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_customize_service.dart';
import '../domain/store_models.dart';
import '../domain/store_product_rules.dart';
import '../domain/store_review_models.dart';
import '../domain/store_review_rules.dart';
import 'store_review_copy.dart';
import 'widgets/store_checkout_parts.dart';
import 'widgets/store_review_parts.dart';
import 'widgets/store_style.dart';

/// Loja · Avaliar compra (app 08b) e o agradecimento (08c),
/// `/loja/pedidos/:orderId/avaliar`.
///
/// Um produto por vez (`Pular` / `Próximo item`), depois a retirada (só
/// pedido de arena). Publicar manda o pedido inteiro pela callable
/// `submitStoreOrderReview`; na edição, tudo já vem preenchido do doc
/// privado. Regras em `docs/business-rules/loja-avaliacoes.md`.
class StoreOrderReviewPage extends ConsumerStatefulWidget {
  const StoreOrderReviewPage({super.key, required this.orderId, this.clock});

  final String orderId;

  /// Relógio injetável (prazo de edição e datas); padrão: agora.
  final DateTime Function()? clock;

  @override
  ConsumerState<StoreOrderReviewPage> createState() =>
      _StoreOrderReviewPageState();
}

/// O que o 08c mostra depois de publicar.
class _Published {
  const _Published({
    required this.created,
    required this.items,
    this.pickupRating,
    this.editableUntil,
  });

  final bool created;
  final List<(StoreOrderItem, int)> items;
  final int? pickupRating;
  final DateTime? editableUntil;
}

class _StoreOrderReviewPageState extends ConsumerState<StoreOrderReviewPage> {
  final ScrollController _scroll = ScrollController();
  final Map<String, TextEditingController> _comments = {};

  List<StoreReviewItemDraft>? _drafts;
  bool _editing = false;
  bool _anonymous = false;
  int? _pickupRating;
  int _step = 0;
  int _photoSeq = 0;
  bool _publishing = false;
  _Published? _published;

  DateTime get _now => widget.clock?.call() ?? DateTime.now();

  @override
  void dispose() {
    _scroll.dispose();
    for (final c in _comments.values) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Rascunho ──────────────────────────────────────────────────────────

  /// Monta o formulário uma vez, com pedido, avaliação e catálogo prontos
  /// (o catálogo diz quem tem eixo Tamanho; sem ele, ninguém tem).
  void _initDrafts(
    StoreOrderView order,
    StoreOrderReview? review,
    List<StoreProduct> products,
  ) {
    if (_drafts != null) return;
    _editing = review != null;
    _anonymous = review?.anonymous ?? false;
    _pickupRating = order.atArena ? review?.pickup?.rating : null;
    _drafts = storeReviewDraftsFor(
      order,
      review,
      isSized: (id) =>
          storeReviewSizeAxis(findStoreProduct(products, id)) != null,
    );
    for (final d in _drafts!) {
      _comments[d.productId] = TextEditingController(text: d.comment);
    }
  }

  void _update(
    String productId,
    StoreReviewItemDraft Function(StoreReviewItemDraft) change,
  ) {
    final drafts = _drafts;
    if (drafts == null || !mounted) return;
    setState(() {
      _drafts = [
        for (final d in drafts) d.productId == productId ? change(d) : d,
      ];
    });
  }

  void _updatePhoto(
    String productId,
    String photoId,
    StoreReviewPhotoDraft? Function(StoreReviewPhotoDraft) change,
  ) {
    _update(productId, (d) {
      final photos = <StoreReviewPhotoDraft>[];
      for (final p in d.photos) {
        if (p.id != photoId) {
          photos.add(p);
        } else if (change(p) case final next?) {
          photos.add(next);
        }
      }
      return d.copyWith(photos: photos);
    });
  }

  // ── Fotos ─────────────────────────────────────────────────────────────

  Future<void> _addPhoto(String productId) async {
    FocusScope.of(context).unfocus();
    final source = await _showPhotoSourceSheet(context);
    if (source == null || !mounted) return;
    StorePickedImage? picked;
    try {
      picked = await ref.read(storeReviewPhotoPickerProvider).pick(source);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, StoreReviewCopy.photoPickError, isError: true);
      }
      return;
    }
    if (picked == null || !mounted) return;
    final Uint8List bytes = picked.bytes;
    final problem = storeReviewPhotoProblem(bytes);
    if (problem != null) {
      showAppSnackBar(context, problem, isError: true);
      return;
    }
    final id = 'local-${_photoSeq++}';
    _update(
      productId,
      (d) => d.copyWith(
        photos: [
          ...d.photos,
          StoreReviewPhotoDraft(id: id, bytes: bytes, uploading: true),
        ],
      ),
    );
    try {
      final path = await ref
          .read(storeReviewActionsProvider)
          .uploadPhoto(
            bytes: bytes,
            contentType: storeReviewPhotoContentType(bytes)!,
            onProgress: (progress) => _updatePhoto(
              productId,
              id,
              (p) => p.uploading ? p.copyWith(progress: progress) : p,
            ),
          );
      _updatePhoto(
        productId,
        id,
        (p) => p.copyWith(path: path, uploading: false, progress: 1),
      );
    } catch (_) {
      if (!mounted) return;
      _updatePhoto(productId, id, (_) => null);
      showAppSnackBar(context, StoreReviewCopy.photoUploadError, isError: true);
    }
  }

  // ── Passos ────────────────────────────────────────────────────────────

  int _stepCount(StoreOrderView order) =>
      (_drafts?.length ?? 0) + (order.atArena ? 1 : 0);

  bool _isPickupStep(StoreOrderView order) =>
      order.atArena && _step == (_drafts?.length ?? 0);

  bool _isLastStep(StoreOrderView order) => _step >= _stepCount(order) - 1;

  void _goTo(int step) {
    FocusScope.of(context).unfocus();
    setState(() => _step = step);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _leave() => popOrGo(context, AppRoutes.storeOrders);

  void _back() {
    if (_published == null && _step > 0) {
      _goTo(_step - 1);
      return;
    }
    _leave();
  }

  void _skip(StoreOrderView order) {
    if (!_isLastStep(order)) {
      _goTo(_step + 1);
      return;
    }
    // Pular no último passo publica o que já tem nota; sem nota, só sai.
    if ((_drafts ?? const []).any((d) => d.rating != null)) {
      _publish(order);
    } else {
      _leave();
    }
  }

  Future<void> _publish(StoreOrderView order) async {
    final drafts = _drafts;
    if (_publishing || drafts == null || !storeReviewCanPublish(drafts)) {
      return;
    }
    FocusScope.of(context).unfocus();
    final submission = buildStoreReviewSubmission(
      orderId: order.id,
      anonymous: _anonymous,
      drafts: drafts,
      atArena: order.atArena,
      pickupRating: _pickupRating,
    );
    setState(() => _publishing = true);
    try {
      final result = await ref
          .read(storeReviewActionsProvider)
          .submit(submission);
      if (!mounted) return;
      final lines = {
        for (final l in storeReviewableLines(order)) l.productId.trim(): l,
      };
      setState(() {
        _publishing = false;
        _published = _Published(
          created: result.created,
          items: [
            for (final i in submission.items)
              if (lines[i.productId] case final line?) (line, i.rating),
          ],
          pickupRating: submission.pickupRating,
          editableUntil: result.editableUntil,
        );
      });
      if (_scroll.hasClients) _scroll.jumpTo(0);
    } on StoreReviewException catch (e) {
      if (!mounted) return;
      setState(() => _publishing = false);
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _publishing = false);
      showAppSnackBar(
        context,
        storeReviewErrorMessage('unknown', null),
        isError: true,
      );
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final orderAsync = ref.watch(storeOrderProvider(widget.orderId));
    final reviewAsync = ref.watch(storeOrderReviewProvider(widget.orderId));
    final catalogAsync = ref.watch(storeCatalogProvider);
    final order = orderAsync.valueOrNull;
    final published = _published;

    if (published != null && order != null) {
      return _thanks(order, published);
    }

    if (order == null) {
      if (orderAsync.hasValue || orderAsync.hasError) {
        return _message(
          icon: Icons.receipt_long_outlined,
          title: StoreReviewCopy.notFoundTitle,
          body: StoreReviewCopy.notFoundBody,
        );
      }
      return _loading();
    }

    final status = storeOrderReviewState(
      order.status,
      reviewAsync.valueOrNull,
      _now,
    );
    if (status == null) {
      return _message(
        icon: Icons.local_shipping_outlined,
        title: StoreReviewCopy.notReviewableTitle,
        body: StoreReviewCopy.notReviewableBody,
      );
    }

    final reviewReady = reviewAsync.hasValue || reviewAsync.hasError;
    final catalogReady = catalogAsync.hasValue || catalogAsync.hasError;
    if (_drafts == null && (!reviewReady || !catalogReady)) return _loading();
    // Sem leitura da avaliação (rule ainda não publicada) conta como nova:
    // quem decide é a callable.
    _initDrafts(
      order,
      reviewAsync.valueOrNull,
      catalogAsync.valueOrNull?.products ?? const [],
    );

    if (status == StoreOrderReviewState.locked) {
      return _message(
        icon: Icons.lock_outline_rounded,
        title: StoreReviewCopy.lockedTitle,
        body: StoreReviewCopy.lockedBody,
      );
    }
    final drafts = _drafts!;
    if (drafts.isEmpty) {
      return _message(
        icon: Icons.inventory_2_outlined,
        title: StoreReviewCopy.nothingToReview,
        body: '',
      );
    }
    if (_step >= _stepCount(order)) _step = _stepCount(order) - 1;
    return _form(order, drafts);
  }

  Widget _scaffold({
    required Widget header,
    required Widget body,
    Widget? bottom,
  }) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.md,
        ),
        header: header,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: body),
            ?bottom,
          ],
        ),
      ),
    );
  }

  Widget _plainHeader({String title = StoreReviewCopy.title}) =>
      StoreTitleHeader(title: title, onBack: _leave);

  Widget _loading() => _scaffold(
    header: _plainHeader(),
    body: const Center(child: CircularProgressIndicator()),
  );

  Widget _message({
    required IconData icon,
    required String title,
    required String body,
  }) {
    final colors = context.themeColors;
    return _scaffold(
      header: _plainHeader(),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 40, color: StoreStyle.tertiary(colors)),
              const SizedBox(height: AppSpacing.md),
              Text(
                title,
                key: const ValueKey('store-review-message'),
                textAlign: TextAlign.center,
                style: AppTypography.titleM.copyWith(color: colors.onSurface),
              ),
              if (body.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  body,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS.copyWith(
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              StoreSoftButton(
                label: StoreReviewCopy.myOrders,
                onPressed: _leave,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── 08b ───────────────────────────────────────────────────────────────

  Widget _form(StoreOrderView order, List<StoreReviewItemDraft> drafts) {
    final colors = context.themeColors;
    final total = _stepCount(order);
    final pickupStep = _isPickupStep(order);
    final last = _isLastStep(order);
    final subtitle = pickupStep
        ? StoreReviewCopy.pickupSubtitle(order.number)
        : StoreReviewCopy.stepSubtitle(order.number, _step + 1, drafts.length);
    final lines = {
      for (final l in storeReviewableLines(order)) l.productId.trim(): l,
    };
    final draft = pickupStep ? null : drafts[_step];
    final uploading = drafts.any((d) => d.uploading);
    final anyRated = drafts.any((d) => d.rating != null);

    final String primaryLabel;
    final VoidCallback? onPrimary;
    if (!last) {
      primaryLabel = StoreReviewCopy.next;
      onPrimary = draft?.rating != null ? () => _goTo(_step + 1) : null;
    } else {
      primaryLabel = uploading
          ? StoreReviewCopy.uploadingPhotos
          : StoreReviewCopy.publish;
      onPrimary = storeReviewCanPublish(drafts) ? () => _publish(order) : null;
    }
    final skipEnabled = !_publishing && !(last && anyRated && uploading);

    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step > 0) _goTo(_step - 1);
      },
      child: _scaffold(
        header: StoreTitleHeader(
          title: _editing ? StoreReviewCopy.editReview : StoreReviewCopy.title,
          subtitle: subtitle,
          onBack: _back,
        ),
        body: SingleChildScrollView(
          controller: _scroll,
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            6,
            AppSpacing.screenH,
            AppSpacing.xxl,
          ),
          child: KeyedSubtree(
            key: ValueKey('store-review-step-$_step'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    for (var i = 0; i < total; i++) ...[
                      if (i > 0) const SizedBox(width: 4),
                      Expanded(
                        child: Container(
                          height: 4,
                          decoration: BoxDecoration(
                            borderRadius: AppRadii.pillAll,
                            color: i <= _step
                                ? AppColors.brand
                                : StoreCheckoutStyle.line2(colors),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 20),
                if (draft != null)
                  ..._productStep(order, lines[draft.productId], draft)
                else
                  ..._pickupStep(order),
              ],
            ),
          ),
        ),
        bottom: _bar(
          skip: skipEnabled ? () => _skip(order) : null,
          primaryKey: last
              ? const ValueKey('store-review-publish')
              : const ValueKey('store-review-next'),
          primaryLabel: primaryLabel,
          onPrimary: onPrimary,
        ),
      ),
    );
  }

  List<Widget> _productStep(
    StoreOrderView order,
    StoreOrderItem? line,
    StoreReviewItemDraft draft,
  ) {
    final colors = context.themeColors;
    final meta = [
      if (line != null) storeReviewLineVariant(line),
      storeReviewReceivedLabel(order, _now) ?? '',
    ].where((s) => s.isNotEmpty).join(' · ');
    final comment = _comments[draft.productId]!;
    final productId = draft.productId;
    return [
      Row(
        children: [
          StoreThumb(url: line?.imageUrl, size: 64, radius: 14),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line?.name ?? '',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    meta,
                    style: AppTypography.soraRegular(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w400,
                      color: StoreStyle.tertiary(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 20),
      _starsCard(
        question: StoreReviewCopy.productQuestion,
        value: draft.rating,
        keyPrefix: 'store-review-star',
        onChanged: (v) => _update(productId, (d) => d.copyWith(rating: v)),
      ),
      const SizedBox(height: 20),
      const StoreSectionLabel(StoreReviewCopy.tagsTitle),
      const SizedBox(height: 10),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final tag in storeReviewFormTags(sized: draft.sized))
            StoreReviewChip(
              key: ValueKey('store-review-tag-${tag.id}'),
              label: tag.label,
              selected: draft.tags.contains(tag),
              onTap: () => _update(productId, (d) {
                final tags = {...d.tags};
                if (!tags.remove(tag)) tags.add(tag);
                return d.copyWith(tags: tags);
              }),
            ),
        ],
      ),
      if (draft.sized) ...[
        const SizedBox(height: 20),
        const StoreSectionLabel(StoreReviewCopy.fitTitle),
        const SizedBox(height: 10),
        Row(
          children: [
            for (final fit in StoreReviewFit.values) ...[
              if (fit != StoreReviewFit.values.first) const SizedBox(width: 8),
              Expanded(
                child: StoreReviewChip(
                  key: ValueKey('store-review-fit-${fit.id}'),
                  label: fit.formLabel,
                  selected: draft.fit == fit,
                  expand: true,
                  onTap: () => _update(
                    productId,
                    (d) => d.fit == fit
                        ? d.copyWith(clearFit: true)
                        : d.copyWith(fit: fit),
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
      const SizedBox(height: 20),
      const StoreSectionLabel(StoreReviewCopy.commentTitle),
      const SizedBox(height: 10),
      Container(
        constraints: const BoxConstraints(minHeight: 110),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
        decoration: BoxDecoration(
          color: StoreCheckoutStyle.card(colors),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: comment.text.isEmpty
                ? StoreCheckoutStyle.line(colors)
                : StoreCheckoutStyle.line2(colors),
            width: 1.5,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              key: const ValueKey('store-review-comment'),
              controller: comment,
              minLines: 3,
              maxLines: 8,
              keyboardType: TextInputType.multiline,
              textCapitalization: TextCapitalization.sentences,
              inputFormatters: [
                LengthLimitingTextInputFormatter(kStoreReviewMaxComment),
              ],
              onChanged: (v) =>
                  _update(productId, (d) => d.copyWith(comment: v)),
              style: AppTypography.soraRegular(
                fontSize: 13.5,
                fontWeight: FontWeight.w400,
                height: 1.5,
                color: colors.onSurface,
              ),
              decoration: InputDecoration.collapsed(
                hintText: StoreReviewCopy.commentHint,
                hintStyle: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                  height: 1.5,
                  color: StoreStyle.tertiary(colors),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                StoreReviewCopy.commentCount(
                  comment.text.length,
                  kStoreReviewMaxComment,
                ),
                style: AppTypography.mono(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w500,
                  color: StoreStyle.tertiary(colors),
                ),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 20),
      const StoreSectionLabel(StoreReviewCopy.photosTitle),
      const SizedBox(height: 10),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final photo in draft.photos)
            _PhotoTile(
              key: ValueKey('store-review-photo-${photo.id}'),
              photo: photo,
              onRemove: () => _updatePhoto(productId, photo.id, (_) => null),
            ),
          if (draft.photos.length < kStoreReviewMaxPhotos)
            _AddPhotoTile(onTap: () => _addPhoto(productId)),
        ],
      ),
      const SizedBox(height: 20),
      _CheckRow(
        key: const ValueKey('store-review-anonymous'),
        label: StoreReviewCopy.anonymous,
        value: _anonymous,
        onChanged: (v) => setState(() => _anonymous = v),
      ),
    ];
  }

  List<Widget> _pickupStep(StoreOrderView order) {
    final colors = context.themeColors;
    final d = order.delivery;
    final place = d is StoreOrderArenaDelivery ? d.placeName : null;
    return [
      Row(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: StoreCheckoutStyle.tint,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.place_outlined,
              size: 24,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  StoreReviewCopy.pickupTitle(place),
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  StoreReviewCopy.pickupQuestion,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w400,
                    color: StoreStyle.tertiary(colors),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 20),
      _starsCard(
        question: StoreReviewCopy.pickupStars,
        value: _pickupRating,
        keyPrefix: 'store-review-pickup-star',
        onChanged: (v) => setState(() => _pickupRating = v),
      ),
    ];
  }

  Widget _starsCard({
    required String question,
    required int? value,
    required String keyPrefix,
    required ValueChanged<int> onChanged,
  }) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 12),
      decoration: BoxDecoration(
        color: StoreCheckoutStyle.card(colors),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: StoreCheckoutStyle.line(colors)),
      ),
      child: Column(
        children: [
          Text(
            question,
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              color: StoreStyle.secondary(colors),
            ),
          ),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: StoreReviewStarInput(
              value: value,
              keyPrefix: keyPrefix,
              onChanged: onChanged,
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 20,
            child: Text(
              storeReviewRatingLabel(value),
              key: ValueKey('$keyPrefix-label'),
              style: AppTypography.soraRegular(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppColors.brandHover,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Barra fixa no rodapé (`LjAppBar`), no `body`: com o teclado aberto ela
  /// sobe junto.
  Widget _bar({
    required VoidCallback? skip,
    required Key primaryKey,
    required String primaryLabel,
    required VoidCallback? onPrimary,
    String skipLabel = StoreReviewCopy.skip,
  }) {
    final colors = context.themeColors;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
    return Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(top: BorderSide(color: StoreCheckoutStyle.line(colors))),
      ),
      padding: EdgeInsets.fromLTRB(20, 14, 20, 12 + (keyboard ? 0 : bottom)),
      child: Row(
        children: [
          _SoftBigButton(
            key: const ValueKey('store-review-skip'),
            label: skipLabel,
            onPressed: skip,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: StorePrimaryButton(
              key: primaryKey,
              label: primaryLabel,
              busy: _publishing,
              onPressed: onPrimary,
            ),
          ),
        ],
      ),
    );
  }

  // ── 08c ───────────────────────────────────────────────────────────────

  Widget _thanks(StoreOrderView order, _Published published) {
    final colors = context.themeColors;
    final d = order.delivery;
    final place = d is StoreOrderArenaDelivery ? d.placeName : null;
    final until = published.editableUntil;
    final rows = <Widget>[
      for (final (line, rating) in published.items)
        Row(
          children: [
            StoreThumb(url: line.imageUrl, size: 44, radius: 10),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                line.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
            ),
            const SizedBox(width: 8),
            StoreReviewStars(value: rating, size: 14, gap: 2),
          ],
        ),
      if (published.pickupRating case final rating?)
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: StoreCheckoutStyle.tint,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.place_outlined,
                size: 18,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                StoreReviewCopy.pickupRow(place),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
            ),
            const SizedBox(width: 8),
            StoreReviewStars(value: rating, size: 14, gap: 2),
          ],
        ),
    ];
    return PopScope(
      canPop: true,
      child: _scaffold(
        header: StoreTitleHeader(title: '', onBack: _leave),
        body: SingleChildScrollView(
          controller: _scroll,
          padding: const EdgeInsets.fromLTRB(24, 24, 24, AppSpacing.xxl),
          child: Column(
            key: const ValueKey('store-review-thanks'),
            children: [
              Container(
                width: 84,
                height: 84,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.win.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  size: 40,
                  color: AppColors.win,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                published.created
                    ? StoreReviewCopy.thanksTitle
                    : StoreReviewCopy.updatedTitle,
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.78,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 14),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 290),
                child: Text(
                  StoreReviewCopy.thanksBody,
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w400,
                    height: 1.5,
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ),
              const SizedBox(height: 28),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: StoreCheckoutStyle.card(colors),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: StoreCheckoutStyle.line(colors)),
                ),
                child: Column(
                  children: [
                    for (var i = 0; i < rows.length; i++)
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          border: i == 0
                              ? null
                              : Border(
                                  top: BorderSide(
                                    color: StoreCheckoutStyle.line(colors),
                                  ),
                                ),
                        ),
                        child: rows[i],
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                !published.created && until != null
                    ? StoreReviewCopy.editUntil(
                        formatStoreReviewDate(until, _now),
                      )
                    : StoreReviewCopy.editHint,
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w400,
                  color: StoreStyle.tertiary(colors),
                ),
              ),
            ],
          ),
        ),
        bottom: _thanksBar(),
      ),
    );
  }

  Widget _thanksBar() {
    final colors = context.themeColors;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(top: BorderSide(color: StoreCheckoutStyle.line(colors))),
      ),
      padding: EdgeInsets.fromLTRB(20, 14, 20, 12 + bottom),
      child: Row(
        children: [
          Expanded(
            child: _SoftBigButton(
              key: const ValueKey('store-review-my-orders'),
              label: StoreReviewCopy.myOrders,
              onPressed: _leave,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: StorePrimaryButton(
              key: const ValueKey('store-review-back-to-store'),
              label: StoreReviewCopy.backToStore,
              onPressed: () => context.goNamed(AppRouteNames.store),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Pular" / "Meus pedidos" (`LjBtn kind="soft"` de 58 px).
class _SoftBigButton extends StatelessWidget {
  const _SoftBigButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: StoreStyle.surface(colors),
        foregroundColor: colors.onSurface,
        disabledBackgroundColor: StoreStyle.surface(colors),
        minimumSize: const Size(0, 58),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: StoreCheckoutStyle.line(colors)),
        ),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppTypography.soraRegular(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.16,
        ),
      ),
    );
  }
}

/// Caixa de seleção do desenho (`LjCheck`).
class _CheckRow extends StatelessWidget {
  const _CheckRow({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      checked: value,
      label: label,
      child: InkWell(
        borderRadius: AppRadii.mdAll,
        onTap: () => onChanged(!value),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: value ? AppColors.brand : Colors.transparent,
                  borderRadius: BorderRadius.circular(7),
                  border: Border.all(
                    color: value
                        ? AppColors.brand
                        : StoreCheckoutStyle.line2(colors),
                    width: 1.5,
                  ),
                ),
                child: value
                    ? const Icon(
                        Icons.check_rounded,
                        size: 15,
                        color: StoreStyle.onBrand,
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ExcludeSemantics(
                  child: Text(
                    label,
                    style: AppTypography.soraRegular(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w500,
                      color: colors.onSurface,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const double _tileSize = 76;

/// Foto escolhida: a prévia local (subindo) ou a já publicada, com o "×".
class _PhotoTile extends StatelessWidget {
  const _PhotoTile({super.key, required this.photo, required this.onRemove});

  final StoreReviewPhotoDraft photo;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final bytes = photo.bytes;
    final url = photo.url;
    const striped = StoreStripedBox();
    final Widget image;
    if (bytes != null) {
      image = Image.memory(
        bytes,
        fit: BoxFit.cover,
        cacheWidth: (_tileSize * dpr).round(),
        errorBuilder: (_, _, _) => striped,
      );
    } else if (url != null) {
      image = CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.cover,
        memCacheHeight: (_tileSize * dpr).round(),
        placeholder: (_, _) => striped,
        errorWidget: (_, _, _) => striped,
      );
    } else {
      image = striped;
    }
    return SizedBox.square(
      dimension: _tileSize,
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: image,
            ),
          ),
          if (photo.uploading)
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: ColoredBox(
                  color: AppColors.black.withValues(alpha: 0.5),
                  child: Center(
                    child: SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        value: photo.progress > 0 && photo.progress < 1
                            ? photo.progress
                            : null,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          Positioned(
            top: 4,
            right: 4,
            child: Semantics(
              button: true,
              label: StoreReviewCopy.removePhoto,
              child: GestureDetector(
                onTap: onRemove,
                child: Container(
                  width: 24,
                  height: 24,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.black.withValues(alpha: 0.65),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.close_rounded,
                    size: 14,
                    color: AppColors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// O "+ Foto" tracejado (`LjRvPhotos`).
class _AddPhotoTile extends StatelessWidget {
  const _AddPhotoTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: StoreReviewCopy.addPhotoSheet,
      child: CustomPaint(
        painter: _DashedRRectPainter(StoreCheckoutStyle.line2(colors)),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            key: const ValueKey('store-review-add-photo'),
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: SizedBox.square(
              dimension: _tileSize,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.photo_camera_outlined,
                    size: 20,
                    color: AppColors.brand,
                  ),
                  const SizedBox(height: 4),
                  ExcludeSemantics(
                    child: Text(
                      StoreReviewCopy.addPhoto,
                      style: AppTypography.soraRegular(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedRRectPainter extends CustomPainter {
  const _DashedRRectPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final rrect = RRect.fromRectAndRadius(
      (Offset.zero & size).deflate(0.75),
      const Radius.circular(12),
    );
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + 5), paint);
        distance += 9;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedRRectPainter oldDelegate) =>
      oldDelegate.color != color;
}

/// Folha "Adicionar foto": Fotos · Câmera.
Future<StoreImageSource?> _showPhotoSourceSheet(BuildContext context) {
  return showModalBottomSheet<StoreImageSource>(
    context: context,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      Widget tile(IconData icon, String label, StoreImageSource source) =>
          ListTile(
            key: ValueKey('store-review-source-${source.name}'),
            leading: Icon(icon, color: AppColors.brand),
            title: Text(
              label,
              style: AppTypography.titleS.copyWith(
                fontSize: 15,
                color: colors.onSurface,
              ),
            ),
            onTap: () => Navigator.pop(sheetContext, source),
          );
      return Padding(
        padding: EdgeInsets.only(
          bottom: 16 + MediaQuery.paddingOf(sheetContext).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 10),
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
              child: Text(
                StoreReviewCopy.addPhotoSheet,
                style: AppTypography.titleL.copyWith(color: colors.onSurface),
              ),
            ),
            tile(
              Icons.photo_library_outlined,
              StoreReviewCopy.sourcePhotos,
              StoreImageSource.photos,
            ),
            tile(
              Icons.photo_camera_outlined,
              StoreReviewCopy.sourceCamera,
              StoreImageSource.camera,
            ),
          ],
        ),
      );
    },
  );
}
