import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/nexa_page_header.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/store_custom_image.dart';
import '../application/store_providers.dart';
import '../domain/store_customize_rules.dart';
import '../domain/store_customize_service.dart';
import '../domain/store_models.dart';
import '../domain/store_product_rules.dart';
import '../domain/store_rules.dart';
import 'store_copy.dart';
import 'widgets/store_customize_panels.dart';
import 'widgets/store_customize_preview.dart';
import 'widgets/store_header.dart';
import 'widgets/store_product_options.dart';
import 'widgets/store_style.dart';

/// Loja · Personalizar (app 02b nome / 02c imagem / costas,
/// `/loja/produto/:productId/personalizar?sku=`).
///
/// Lê o produto do MESMO catálogo da vitrine; nome, imagem e costas vão para
/// o carrinho só pela callable `addStoreCustomItemToCart`, que revalida tudo.
/// Regras em `docs/business-rules/loja-personalizar.md` /
/// `store_customize_rules.dart`.
///
/// Sucesso: fecha devolvendo `true` — a página do produto mostra
/// "Adicionado ao carrinho · Ver" e pulsa a sacola.
class StoreCustomizePage extends ConsumerStatefulWidget {
  const StoreCustomizePage({
    super.key,
    required this.productId,
    this.skuId,
  });

  /// Id do produto (ou o slug do link do portal).
  final String productId;

  /// SKU escolhido na página do produto; sem ele (ou se sumiu), a aba
  /// "Cor e tam." pede a escolha antes de adicionar.
  final String? skuId;

  @override
  ConsumerState<StoreCustomizePage> createState() => _StoreCustomizePageState();
}

class _StoreCustomizePageState extends ConsumerState<StoreCustomizePage> {
  static const double _maxPreviewHeight = 300;
  static const double _minPreviewHeight = 160;

  final TextEditingController _nameController = TextEditingController();
  final FocusNode _nameFocus = FocusNode();
  final ScrollController _scroll = ScrollController();
  late StoreNameInputFormatter _nameFormatter;

  Map<String, String>? _selected;
  StoreCustomizeTab? _tab;
  StorePhotoView? _side;

  // Nome
  StoreCustomFont? _font;
  String? _nameColor;
  int _nameShake = 0;
  bool _nameInvalidChar = false;
  StoreNameProblem? _nameProblem;
  String? _checkedName;
  int _nameCheckSeq = 0;
  String? _loggedName;

  // Imagem
  StoreImageDraft? _image;
  int _imageSeq = 0;
  String? _areaId;
  StoreImageTransform? _transform;

  // Costas (abaixo do nome): número OU imagem
  final TextEditingController _backNumberController = TextEditingController();
  final FocusNode _backNumberFocus = FocusNode();
  StoreBackType? _backType;
  StoreImageDraft? _backImage;
  int _backImageSeq = 0;
  String? _loggedBack;

  // Cor e tamanho
  String? _missingAxisId;
  int _axisShake = 0;

  bool _adding = false;
  bool _leaving = false;
  bool _openLogged = false;

  AnalyticsService get _analytics => ref.read(analyticsServiceProvider);

  StoreCustomizeService get _service => ref.read(storeCustomizeServiceProvider);

  @override
  void initState() {
    super.initState();
    _nameFocus.addListener(_onNameFocus);
    _backNumberFocus.addListener(_onBackNumberFocus);
    // O formatter recebe a mudança antes do `onChanged`: guarda só o que
    // a tecla trouxe e treme o campo.
    _nameFormatter = StoreNameInputFormatter(
      maxChars: 12,
      onResult: _onNameFormatted,
    );
    ref.listenManual<StoreProductLookup>(
      storeProductProvider(widget.productId),
      (_, next) => _logOpen(next.product),
      fireImmediately: true,
    );
  }

  /// `loja_personalizar_open` uma vez, quando o produto personalizável abre.
  void _logOpen(StoreProduct? product) {
    if (_openLogged || product?.customization?.hasOptions != true) return;
    _openLogged = true;
    _analytics.logStoreCustomizeOpen(productId: product!.id);
  }

  @override
  void dispose() {
    _nameFocus
      ..removeListener(_onNameFocus)
      ..dispose();
    _nameController.dispose();
    _backNumberFocus
      ..removeListener(_onBackNumberFocus)
      ..dispose();
    _backNumberController.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // ── Derivados ─────────────────────────────────────────────────────────

  String get _nameText => normalizeStoreCustomName(_nameController.text);

  bool get _hasName => _nameText.isNotEmpty;

  bool get _nameBlocked =>
      _hasName &&
      _nameProblem != null &&
      _nameProblem != StoreNameProblem.empty;

  bool get _imageReady =>
      _image?.status == StoreImageDraftStatus.ready && _image?.path != null;

  String get _backNumber => _backNumberController.text.trim();

  bool get _backImageReady =>
      _backImage?.status == StoreImageDraftStatus.ready &&
      _backImage?.path != null;

  /// Costas preenchidas no tipo escolhido: número válido ou imagem enviada.
  bool _hasBack(StoreCustomBackOptions options) {
    if (!options.enabled) return false;
    return storeBackTypeOf(options, _backType) == StoreBackType.number
        ? storeBackNumberOk(_backNumber, options.numberMaxDigits)
        : _backImageReady;
  }

  /// Alteração que o "voltar" perguntaria antes de descartar.
  bool get _hasChanges =>
      _hasName ||
      _image != null ||
      _backNumber.isNotEmpty ||
      _backImage != null;

  List<StoreCustomizeTab> _tabs(StoreProduct product) {
    final c = product.customization!;
    return [
      if (c.name.enabled) StoreCustomizeTab.name,
      if (c.image.enabled) StoreCustomizeTab.image,
      if (c.back.enabled) StoreCustomizeTab.back,
      if (product.axes.isNotEmpty) StoreCustomizeTab.variant,
    ];
  }

  StoreCustomArea _area(StoreCustomImageOptions options) {
    for (final a in options.areas) {
      if (a.id == _areaId) return a;
    }
    return options.areas.first;
  }

  StoreCustomFont _fontOf(StoreCustomNameOptions options) {
    final font = _font;
    return font != null && options.fonts.contains(font)
        ? font
        : options.fonts.first;
  }

  String? _colorOf(StoreProduct product, Map<String, String> selected) {
    final options = product.customization!.name;
    final chosen = _nameColor;
    if (chosen != null && options.colors.contains(chosen)) return chosen;
    return storeDefaultNameColor(
      options.colors,
      storeSelectedColorHex(product, selected),
    );
  }

  /// Seleção inicial: os valores do SKU que veio na rota; senão a mesma
  /// pré-seleção da página do produto.
  Map<String, String> _initialSelection(StoreProduct product) {
    for (final v in product.variants) {
      if (v.id == widget.skuId) return Map.of(v.values);
    }
    return storeProductInitialSelection(product);
  }

  StorePhotoView _sideFor(StoreCustomizeTab tab, StoreProduct product) {
    if (tab == StoreCustomizeTab.name) {
      return storeNameSide(product.customization!.name.placement);
    }
    if (tab == StoreCustomizeTab.image) return StorePhotoView.front;
    if (tab == StoreCustomizeTab.back) return StorePhotoView.back;
    return _side ?? StorePhotoView.front;
  }

  // ── Navegação ─────────────────────────────────────────────────────────

  void _leave({bool added = false}) {
    _leaving = true;
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop(added);
      return;
    }
    GoRouter.maybeOf(context)?.goNamed(
      AppRouteNames.storeProduct,
      pathParameters: {'productId': widget.productId},
    );
  }

  Future<void> _back() async {
    if (_hasChanges && !_leaving) {
      final discard = await showStoreDiscardSheet(context);
      if (!discard || !mounted) return;
    }
    _leave();
  }

  /// Nome → lado do nome; Imagem → frente; Costas → costas; "Cor e tam."
  /// mantém o lado que está na prévia.
  void _selectTab(StoreProduct product, StoreCustomizeTab tab) {
    if (tab != StoreCustomizeTab.name) _nameFocus.unfocus();
    if (tab != StoreCustomizeTab.back) _backNumberFocus.unfocus();
    final current = _tab ?? _tabs(product).first;
    final shown = _side ?? _sideFor(current, product);
    setState(() {
      _tab = tab;
      _side = tab == StoreCustomizeTab.variant ? shown : _sideFor(tab, product);
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  /// "Pular": a próxima aba depois da atual.
  VoidCallback? _skipFrom(StoreProduct product, StoreCustomizeTab tab) {
    final tabs = _tabs(product);
    final index = tabs.indexOf(tab);
    if (index < 0 || index + 1 >= tabs.length) return null;
    return () => _selectTab(product, tabs[index + 1]);
  }

  // ── Nome ──────────────────────────────────────────────────────────────

  void _onNameFormatted(bool rejected) {
    if (!mounted) return;
    if (rejected) {
      setState(() {
        _nameInvalidChar = true;
        _nameShake++;
      });
    } else if (_nameInvalidChar) {
      setState(() => _nameInvalidChar = false);
    }
  }

  void _onNameChanged(String _) {
    setState(() {
      // Bloqueado só até mudar o nome.
      if (_nameText != _checkedName) _nameProblem = null;
    });
  }

  void _onNameFocus() {
    if (_nameFocus.hasFocus || !mounted) return;
    final text = _nameText;
    if (_nameController.text != text) {
      _nameController.value = TextEditingValue(
        text: text,
        selection: TextSelection.collapsed(offset: text.length),
      );
    }
    setState(() => _nameInvalidChar = false);
    final product = ref.read(storeProductProvider(widget.productId)).product;
    final options = product?.customization?.name;
    if (product == null || options == null || text.isEmpty) return;
    final font = _fontOf(options);
    if (_loggedName != '$text|${font.id}') {
      _loggedName = '$text|${font.id}';
      _analytics.logStoreCustomizeName(font: font.id);
    }
    _checkName(product.id, text);
  }

  /// Blur → `checkStoreCustomName`. Falha de rede não trava: o servidor
  /// revalida no "Adicionar".
  Future<void> _checkName(String productId, String text) async {
    if (text == _checkedName) return;
    final seq = ++_nameCheckSeq;
    try {
      final result = await _service.checkName(
        productId: productId,
        text: text,
      );
      if (!mounted || seq != _nameCheckSeq || _nameText != text) return;
      setState(() {
        _checkedName = text;
        _nameProblem = result.problem;
      });
    } catch (_) {
      // Ignorado de propósito (ver acima).
    }
  }

  // ── Imagem (frente e costas) ──────────────────────────────────────────

  double _areaAspect(StoreCustomArea area) => area.widthCm / area.heightCm;

  StoreImageDraft? _draftOf({required bool back}) => back ? _backImage : _image;

  /// Troca o rascunho da frente ou das costas (dentro do `setState`).
  void _putDraft(StoreImageDraft? draft, {required bool back}) {
    if (back) {
      _backImage = draft;
    } else {
      _image = draft;
    }
  }

  /// O envio [seq] ainda é o atual (trocar/remover a imagem invalida os
  /// anteriores).
  bool _isCurrent(int seq, {required bool back}) =>
      seq == (back ? _backImageSeq : _imageSeq);

  /// Frente ou costas ([back]): a mesma folha Fotos · Arquivos · Câmera, a
  /// mesma conferência (formatos, peso e resolução do bloco Imagem) e o
  /// mesmo envio.
  Future<void> _pickImage(StoreProduct product, {bool back = false}) async {
    _nameFocus.unfocus();
    _backNumberFocus.unfocus();
    final options = product.customization!.image;
    final choice = await showStoreImageSourceSheet(
      context: context,
      canRemove: _draftOf(back: back) != null,
    );
    if (choice == null || !mounted) return;
    if (choice.remove) {
      setState(() {
        if (back) {
          _backImageSeq++;
          _backImage = null;
        } else {
          _imageSeq++;
          _image = null;
          _transform = null;
        }
      });
      return;
    }
    StorePickedImage? picked;
    try {
      picked = await ref
          .read(storeCustomImagePickerProvider)
          .pick(choice.source!, formats: options.formats);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, StoreCopy.customizePickError, isError: true);
      }
      return;
    }
    if (picked == null || !mounted) return;
    final seq = back ? ++_backImageSeq : ++_imageSeq;
    final preparing = StoreImageDraft(
      fileName: picked.fileName,
      status: StoreImageDraftStatus.preparing,
    );
    setState(() {
      _putDraft(preparing, back: back);
      _side = back ? StorePhotoView.back : StorePhotoView.front;
    });
    final prepared = await prepareStoreCustomImage(
      picked.bytes,
      fileName: picked.fileName,
      options: options,
    );
    if (!mounted || !_isCurrent(seq, back: back)) return;
    final problem = prepared.problem;
    final draft = StoreImageDraft(
      fileName: picked.fileName,
      status: problem == null
          ? StoreImageDraftStatus.uploading
          : StoreImageDraftStatus.invalid,
      bytes: prepared.bytes,
      format: prepared.format,
      widthPx: prepared.widthPx,
      heightPx: prepared.heightPx,
      error:
          problem == null ? null : storeImageProblemMessage(problem, options),
    );
    setState(() {
      _putDraft(draft, back: back);
      // As costas não têm ajuste fino: sempre centralizada e inteira.
      if (!back) {
        _transform = problem == null
            ? storeDefaultImageTransform(
                imageAspect: draft.aspect,
                areaAspect: _areaAspect(_area(options)),
              )
            : null;
      }
    });
    if (problem == null) await _upload(product, seq, back: back);
  }

  Future<void> _upload(
    StoreProduct product,
    int seq, {
    bool back = false,
  }) async {
    final draft = _draftOf(back: back);
    final bytes = draft?.bytes;
    final format = draft?.format;
    if (draft == null || bytes == null || format == null) return;
    final uid = ref.read(storeUidProvider);
    try {
      if (uid.isEmpty) throw StateError('sem sessão');
      final path = await _service.uploadImage(
        uid: uid,
        bytes: bytes,
        format: format,
        onProgress: (progress) {
          if (!mounted || !_isCurrent(seq, back: back)) return;
          setState(() {
            _putDraft(
              _draftOf(back: back)?.copyWith(progress: progress),
              back: back,
            );
          });
        },
      );
      if (!mounted || !_isCurrent(seq, back: back)) return;
      setState(() {
        _putDraft(
          _draftOf(back: back)?.copyWith(
            status: StoreImageDraftStatus.ready,
            progress: 1,
            path: path,
          ),
          back: back,
        );
      });
      if (back) {
        _logBack(StoreBackType.image, path);
        return;
      }
      final area = _area(product.customization!.image);
      final dpi = storeEffectiveDpi(
        widthPx: draft.widthPx,
        heightPx: draft.heightPx,
        area: area,
      );
      _analytics.logStoreCustomizeImage(
        area: area.id,
        quality: storeImageQuality(dpi).name,
      );
    } catch (_) {
      if (!mounted || !_isCurrent(seq, back: back)) return;
      setState(() {
        _putDraft(
          _draftOf(back: back)?.copyWith(status: StoreImageDraftStatus.failed),
          back: back,
        );
      });
    }
  }

  void _retryUpload(StoreProduct product, {bool back = false}) {
    final seq = back ? ++_backImageSeq : ++_imageSeq;
    setState(() {
      _putDraft(
        _draftOf(back: back)?.copyWith(
          status: StoreImageDraftStatus.uploading,
          progress: 0,
        ),
        back: back,
      );
    });
    _upload(product, seq, back: back);
  }

  void _selectArea(StoreCustomArea area) {
    final image = _image;
    setState(() {
      _areaId = area.id;
      _side = StorePhotoView.front;
      if (image != null && _transform != null) {
        _transform = storeDefaultImageTransform(
          imageAspect: image.aspect,
          areaAspect: _areaAspect(area),
        );
      }
    });
  }

  // ── Costas ────────────────────────────────────────────────────────────

  void _selectBackType(StoreBackType type) {
    if (type != StoreBackType.number) _backNumberFocus.unfocus();
    setState(() {
      _backType = type;
      _side = StorePhotoView.back;
    });
  }

  void _onBackNumberChanged(String _) => setState(() {});

  /// Saiu do campo com um número válido: `loja_personalizar_costas`.
  void _onBackNumberFocus() {
    if (_backNumberFocus.hasFocus || !mounted) return;
    final product = ref.read(storeProductProvider(widget.productId)).product;
    final options = product?.customization?.back;
    final number = _backNumber;
    if (options == null ||
        !options.enabled ||
        !storeBackNumberOk(number, options.numberMaxDigits)) {
      return;
    }
    _logBack(StoreBackType.number, number);
  }

  /// Uma vez por número/imagem escolhidos.
  void _logBack(StoreBackType type, String value) {
    final key = '${type.id}|$value';
    if (_loggedBack == key) return;
    _loggedBack = key;
    _analytics.logStoreCustomizeBack(type: type.id);
  }

  /// O que vai nas costas: o número digitado ou a imagem enviada,
  /// centralizada e inteira na área das costas (sem ajuste fino).
  StoreCustomBackChoice _backChoice(StoreCustomBackOptions options) {
    if (storeBackTypeOf(options, _backType) == StoreBackType.number) {
      return StoreCustomBackChoice.number(_backNumber);
    }
    final image = _backImage!;
    return StoreCustomBackChoice.image(
      path: image.path!,
      transform: storeDefaultImageTransform(
        imageAspect: image.aspect,
        areaAspect: options.widthCm / options.heightCm,
      ),
    );
  }

  // ── Cor e tamanho ─────────────────────────────────────────────────────

  void _selectVariant(
    StoreProduct product,
    StoreAxis axis,
    StoreAxisValue value,
  ) {
    final current = _selected ?? _initialSelection(product);
    final next = selectStoreAxisValue(product, current, axis.id, value.id);
    setState(() {
      _selected = next;
      if (_missingAxisId != null && next.containsKey(_missingAxisId)) {
        _missingAxisId = null;
      }
    });
  }

  // ── Adicionar ─────────────────────────────────────────────────────────

  Future<void> _add(StoreProduct product, Map<String, String> selected) async {
    if (_adding) return;
    final missing = storeMissingAxis(product, selected);
    if (missing != null) {
      _nameFocus.unfocus();
      setState(() {
        _tab = StoreCustomizeTab.variant;
        _missingAxisId = missing.id;
        _axisShake++;
      });
      return;
    }
    final variant = storeVariantFor(product, selected);
    if (variant == null) {
      showAppSnackBar(context, StoreCopy.comboUnavailable);
      return;
    }
    if (!variant.inStock) {
      showAppSnackBar(context, storeSoldOutMessage(product, variant));
      return;
    }
    final customization = product.customization!;
    final hasName = _hasName && customization.name.enabled;
    final image = _imageReady ? _image : null;
    final hasBack = _hasBack(customization.back);
    if (!hasName && image == null && !hasBack) return;

    _nameFocus.unfocus();
    _backNumberFocus.unfocus();
    final nameText = _nameText;
    final nameColor = _colorOf(product, selected);
    // Só com imagem: produto sem imagem pode não ter área nenhuma.
    final area = image == null ? null : _area(customization.image);
    final back = hasBack ? _backChoice(customization.back) : null;
    final extra = storeCustomExtraCents(
      customization.price,
      hasName: hasName,
      hasImage: image != null,
      hasBack: hasBack,
    );
    final messenger = ScaffoldMessenger.maybeOf(context);
    final router = GoRouter.maybeOf(context);

    setState(() => _adding = true);
    try {
      final result = await _service.addToCart(
        StoreCustomCartRequest(
          productId: product.id,
          skuId: variant.id,
          name: hasName && nameColor != null
              ? StoreCustomNameChoice(
                  text: nameText,
                  fontId: _fontOf(customization.name).id,
                  color: nameColor,
                )
              : null,
          image: image == null
              ? null
              : StoreCustomImageChoice(
                  path: image.path!,
                  areaId: area!.id,
                  transform: _transform ??
                      storeDefaultImageTransform(
                        imageAspect: image.aspect,
                        areaAspect: _areaAspect(area),
                      ),
                ),
          back: back,
        ),
      );
      _analytics.logStoreAddToCart(
        sku: variant.id,
        qty: 1,
        priceCents: result.unitPriceCents > 0
            ? result.unitPriceCents
            : variant.priceCents + extra,
        customized: true,
      );
      if (!mounted) return;
      final navigator = Navigator.of(context);
      if (navigator.canPop()) {
        // A página do produto mostra o "Adicionado" e pulsa a sacola.
        _leave(added: true);
        return;
      }
      // Aberta por link, sem página do produto embaixo.
      _leave();
      messenger
        ?..clearSnackBars()
        ..showSnackBar(
          SnackBar(
            content: const Text(
              StoreCopy.addedToCart,
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            action: SnackBarAction(
              label: StoreCopy.see,
              textColor: AppColors.brand,
              onPressed: () => router?.pushNamed(AppRouteNames.storeCart),
            ),
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
            backgroundColor: AppColors.black.withValues(alpha: 0.88),
            duration: const Duration(seconds: 4),
            // Com ação o SnackBar fica até ser fechado (`persist` padrão) e
            // ignora o `duration` — seguia até por cima da tela seguinte.
            persist: false,
          ),
        );
    } on StoreCustomizeException catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        e.message.isNotEmpty ? e.message : StoreCopy.addError,
        isError: true,
      );
      // Sessão sem conta por trás: tentar de novo nunca vai funcionar.
      if (e.code == 'unauthenticated') {
        unawaited(ref.read(appSignOutProvider)());
      }
    } catch (_) {
      if (mounted) showAppSnackBar(context, StoreCopy.addError, isError: true);
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final lookup = ref.watch(storeProductProvider(widget.productId));
    final product = lookup.product;
    switch (lookup.status) {
      case StoreProductStatus.loading:
        return _shell(
          const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        );
      case StoreProductStatus.error:
        return _shell(
          AppErrorView(
            title: StoreCopy.errorTitle,
            message: StoreCopy.errorMessage,
            retryLabel: StoreCopy.retry,
            onRetry: () => ref.invalidate(storeCatalogProvider),
          ),
        );
      case StoreProductStatus.notFound:
        return _shell(_unavailable());
      case StoreProductStatus.found:
        final customization = product!.customization;
        if (customization == null || !customization.hasOptions) {
          return _shell(_unavailable());
        }
        return _buildCustomize(product);
    }
  }

  Widget _header({String subtitle = ''}) {
    final colors = context.themeColors;
    return Row(
      children: [
        StoreRoundButton(
          icon: Icons.chevron_left_rounded,
          iconSize: 26,
          tooltip: StoreCopy.back,
          onTap: _back,
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                StoreCopy.customizePageTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.78,
                  height: 1.1,
                  color: colors.onSurface,
                ),
              ),
              if (subtitle.isNotEmpty)
                Text(
                  subtitle,
                  key: const ValueKey('store-customize-subtitle'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: StoreStyle.secondary(colors),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  /// Carregando / erro / indisponível: o header com o "voltar" e o corpo.
  Widget _shell(Widget body) {
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
        header: _header(),
        child: body,
      ),
    );
  }

  Widget _unavailable() {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 40, 32, 0),
      child: Column(
        children: [
          Icon(
            Icons.brush_outlined,
            size: 40,
            color: StoreStyle.tertiary(colors),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            StoreCopy.customizeUnavailableTitle,
            textAlign: TextAlign.center,
            style: AppTypography.titleM.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            StoreCopy.customizeUnavailableHint,
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              color: StoreStyle.secondary(colors),
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          OutlinedButton(
            onPressed: _leave,
            style: OutlinedButton.styleFrom(
              foregroundColor: colors.onSurface,
              side: BorderSide(color: StoreStyle.tertiary(colors)),
              shape: const RoundedRectangleBorder(
                borderRadius: AppRadii.pillAll,
              ),
            ),
            child: const Text(StoreCopy.customizeBackToProduct),
          ),
        ],
      ),
    );
  }

  Widget _buildCustomize(StoreProduct product) {
    final colors = context.themeColors;
    final customization = product.customization!;
    final nameOptions = customization.name;
    final imageOptions = customization.image;
    final backOptions = customization.back;
    final selected = _selected ??= _initialSelection(product);
    final tabs = _tabs(product);
    final tab = _tab != null && tabs.contains(_tab) ? _tab! : tabs.first;
    final side = _side ?? _sideFor(tab, product);

    if (_nameFormatter.maxChars != nameOptions.maxChars) {
      _nameFormatter = StoreNameInputFormatter(
        maxChars: nameOptions.maxChars,
        onResult: _onNameFormatted,
      );
    }

    final hasName = _hasName && nameOptions.enabled;
    final image = _image;
    final imageReady = _imageReady;
    final backType = storeBackTypeOf(backOptions, _backType);
    final backImage = _backImage;
    final backNumber = _backNumber;
    final hasBack = _hasBack(backOptions);
    final extra = storeCustomExtraCents(
      customization.price,
      hasName: hasName,
      hasImage: imageReady,
      hasBack: hasBack,
    );
    final price = storeSelectionPrice(product, selected);
    final total = storeCustomTotalCents(
      skuPriceCents: price.cents,
      extraCents: extra,
    );
    final imageBusy = image != null && !imageReady;
    // Costas no tipo escolhido: imagem ainda subindo/reprovada ou número que
    // não passa travam o Adicionar.
    final backBusy = backOptions.enabled &&
        backType == StoreBackType.image &&
        backImage != null &&
        !_backImageReady;
    final backInvalid = backOptions.enabled &&
        backType == StoreBackType.number &&
        backNumber.isNotEmpty &&
        !storeBackNumberOk(backNumber, backOptions.numberMaxDigits);
    final backEmpty = backType == StoreBackType.number
        ? backNumber.isEmpty
        : backImage == null;
    final canAdd = (hasName || imageReady || hasBack) &&
        !_nameBlocked &&
        !imageBusy &&
        !backBusy &&
        !backInvalid &&
        !_adding;
    final font = nameOptions.enabled ? _fontOf(nameOptions) : null;
    final nameColor = nameOptions.enabled ? _colorOf(product, selected) : null;
    final area = imageOptions.enabled ? _area(imageOptions) : null;
    final config = ref.watch(storeShowcaseConfigProvider).valueOrNull ??
        StoreShowcaseConfig.empty;
    final media = MediaQuery.of(context);

    final Widget panel = switch (tab) {
      StoreCustomizeTab.name => StoreCustomizeNamePanel(
          options: nameOptions,
          aloneCents: customization.price.nameOnlyCents,
          controller: _nameController,
          focusNode: _nameFocus,
          formatter: _nameFormatter,
          shakeTick: _nameShake,
          invalidChar: _nameInvalidChar,
          problem: _hasName ? _nameProblem : null,
          font: font!,
          color: nameColor,
          onChanged: _onNameChanged,
          onFont: (f) => setState(() => _font = f),
          onColor: (hex) => setState(() => _nameColor = hex),
          onSkip: _hasName ? null : _skipFrom(product, tab),
        ),
      StoreCustomizeTab.image => StoreCustomizeImagePanel(
          options: imageOptions,
          aloneCents: customization.price.imageOnlyCents,
          draft: image,
          area: area!,
          onPick: () => _pickImage(product),
          onRetry: () => _retryUpload(product),
          onArea: _selectArea,
          onSkip: image == null ? _skipFrom(product, tab) : null,
        ),
      StoreCustomizeTab.back => StoreCustomizeBackPanel(
          options: backOptions,
          title: storeBackStepTitle(
            nameOptions.enabled ? nameOptions.placement : null,
          ),
          priceCents: customization.price.backCents,
          type: backType,
          numberController: _backNumberController,
          numberFocus: _backNumberFocus,
          draft: backImage,
          imageOptions: imageOptions,
          onType: _selectBackType,
          onNumberChanged: _onBackNumberChanged,
          onPick: () => _pickImage(product, back: true),
          onRetry: () => _retryUpload(product, back: true),
          onSkip: backEmpty ? _skipFrom(product, tab) : null,
        ),
      StoreCustomizeTab.variant => StoreProductOptions(
          product: product,
          selected: selected,
          missingAxisId: _missingAxisId,
          shakeTick: _axisShake,
          lowStockCaption: storeLowStockCaption(product, selected),
          onSelect: (axis, value) => _selectVariant(product, axis, value),
          onUnavailable: (_, _) =>
              showAppSnackBar(context, StoreCopy.waitlistSoon),
        ),
    };

    final previewImage = image != null &&
            image.status != StoreImageDraftStatus.invalid &&
            image.bytes != null
        ? StorePreviewImage(
            bytes: image.isVector ? null : image.bytes,
            aspect: image.aspect,
            transform: _transform ??
                storeDefaultImageTransform(
                  imageAspect: image.aspect,
                  areaAspect: _areaAspect(area!),
                ),
          )
        : null;

    return PopScope<Object?>(
      canPop: !_hasChanges || _leaving,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: colors.canvas,
        extendBody: true,
        bottomNavigationBar: StoreCustomizeBottomBar(
          totalCents: total,
          customized: extra > 0 || hasName || imageReady || hasBack,
          enabled: canAdd,
          busy: _adding,
          pixDiscountPct: config.benefits.pixDiscountPct,
          onAdd: () => _add(product, selected),
        ),
        body: NexaPageHeader(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            0,
            AppSpacing.screenH,
            AppSpacing.md,
          ),
          header: _header(subtitle: storeCustomizeSubtitle(product, selected)),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final previewHeight = (constraints.maxHeight * 0.42).clamp(
                _minPreviewHeight,
                _maxPreviewHeight,
              );
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenH,
                    ),
                    child: StoreCustomizePreview(
                      height: previewHeight,
                      side: side,
                      onSide: (s) => setState(() => _side = s),
                      photo: storeCustomPreviewPhoto(product, selected, side),
                      garmentHex: storeSelectedColorHex(product, selected),
                      namePlacement:
                          nameOptions.enabled ? nameOptions.placement : null,
                      nameText: _nameText,
                      nameFont: font ?? StoreCustomFont.bloco,
                      nameColor: storeHexColor(nameColor) ?? Colors.white,
                      nameActive: tab == StoreCustomizeTab.name,
                      area: area,
                      image: previewImage,
                      imageActive: tab == StoreCustomizeTab.image,
                      onTransform: (t) => setState(() => _transform = t),
                      back: backOptions.enabled
                          ? StorePreviewBack(
                              box: storeBackBox(
                                backOptions,
                                nameOptions.enabled
                                    ? nameOptions.placement
                                    : null,
                              ),
                              type: backType,
                              number: backNumber,
                              // Fonte e cor do nome; sem nome, Bloco e a cor
                              // de maior contraste com a peça.
                              font: font ?? StoreCustomFont.bloco,
                              color: storeHexColor(
                                    storeBackNumberColor(
                                      nameColor: nameColor,
                                      garmentHex: storeSelectedColorHex(
                                        product,
                                        selected,
                                      ),
                                    ),
                                  ) ??
                                  Colors.white,
                              hasImage: backImage != null &&
                                  backImage.status !=
                                      StoreImageDraftStatus.invalid &&
                                  backImage.bytes != null,
                              imageBytes: backImage == null ||
                                      backImage.isVector
                                  ? null
                                  : backImage.bytes,
                              active: tab == StoreCustomizeTab.back,
                            )
                          : null,
                    ),
                  ),
                  if (storeCustomPreviewPhotoNote(product, selected, side)
                      case final note?)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.screenH,
                        8,
                        AppSpacing.screenH,
                        0,
                      ),
                      child: Text(
                        note,
                        key: const ValueKey('store-customize-photo-note'),
                        textAlign: TextAlign.center,
                        style: AppTypography.bodyS.copyWith(
                          color: StoreStyle.secondary(colors),
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenH,
                    ),
                    child: StoreCustomizeTabs(
                      tabs: tabs,
                      current: tab,
                      done: {
                        if (hasName) StoreCustomizeTab.name,
                        if (imageReady) StoreCustomizeTab.image,
                        if (hasBack) StoreCustomizeTab.back,
                      },
                      onTap: (t) => _selectTab(product, t),
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      controller: _scroll,
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: EdgeInsets.fromLTRB(
                        AppSpacing.screenH,
                        22,
                        AppSpacing.screenH,
                        StoreCustomizeBottomBar.height +
                            media.padding.bottom +
                            AppSpacing.xl,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          panel,
                          const SizedBox(height: 24),
                          StoreCustomizeProductionNote(
                            leadDays: customization.leadDays,
                            defectOnlyReturns: customization.defectOnlyReturns,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
