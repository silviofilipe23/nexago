import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/media/profile_image_crop_config.dart';
import 'package:nexago_app/core/media/profile_image_picker.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/arena_providers.dart';
import '../../domain/products/arena_product.dart';
import '../../domain/products/arena_product_category.dart';
import '../../domain/products/arena_product_providers.dart';
import 'arena_product_delete_sheet.dart';
import '../../domain/products/arena_product_delete_args.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';

class ArenaProductFormPage extends ConsumerStatefulWidget {
  const ArenaProductFormPage({super.key, this.productId});

  final String? productId;

  bool get isEditing => productId != null && productId!.trim().isNotEmpty;

  @override
  ConsumerState<ArenaProductFormPage> createState() =>
      _ArenaProductFormPageState();
}

class _ArenaProductFormPageState extends ConsumerState<ArenaProductFormPage> {
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _stockController = TextEditingController();
  final _minStockController = TextEditingController();

  ArenaProductCategory _category = ArenaProductCategory.bebidas;
  bool _active = true;
  String? _emoji;
  String? _imageUrl;
  Uint8List? _pendingImageBytes;
  String? _pendingImageContentType;
  bool _saving = false;
  bool _initialized = false;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    _stockController.dispose();
    _minStockController.dispose();
    super.dispose();
  }

  void _applyProduct(ArenaProduct? product) {
    if (product == null || _initialized) return;
    _initialized = true;
    _nameController.text = product.name;
    _descriptionController.text = product.description ?? '';
    _priceController.text = _formatPriceInput(product.priceCents);
    _stockController.text = '${product.stockQuantity}';
    _minStockController.text = '${product.minStockQuantity}';
    _category = product.category;
    _active = product.active;
    _emoji = product.emoji;
    _imageUrl = product.imageUrl;
  }

  String _formatPriceInput(int cents) {
    final reais = cents / 100;
    return reais.toStringAsFixed(2).replaceAll('.', ',');
  }

  int? _parsePriceCents() {
    final raw = _priceController.text.trim().replaceAll(',', '.');
    final value = double.tryParse(raw);
    if (value == null || value < 0) return null;
    return (value * 100).round();
  }

  int? _parseInt(TextEditingController controller) {
    return int.tryParse(controller.text.trim());
  }

  Future<void> _pickImage() async {
    final picked = await pickProfileImage(
      context: context,
      target: ProfileImageCropTarget.avatar,
    );
    if (picked == null || !mounted) return;
    setState(() {
      _pendingImageBytes = picked.bytes;
      _pendingImageContentType = picked.contentType;
    });
  }

  Future<void> _save(String arenaId) async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      showAppSnackBar(context, 'Informe o nome do produto.', isError: true);
      return;
    }

    final priceCents = _parsePriceCents();
    if (priceCents == null) {
      showAppSnackBar(context, 'Informe um preço válido.', isError: true);
      return;
    }

    final stock = _parseInt(_stockController);
    final minStock = _parseInt(_minStockController);
    if (stock == null || stock < 0 || minStock == null || minStock < 0) {
      showAppSnackBar(context, 'Informe estoque válido.', isError: true);
      return;
    }

    setState(() => _saving = true);
    try {
      final repo = ref.read(arenaProductsRepositoryProvider);
      final product = ArenaProduct(
        id: widget.productId ?? '',
        name: name,
        category: _category,
        active: _active,
        priceCents: priceCents,
        stockQuantity: stock,
        minStockQuantity: minStock,
        description: _descriptionController.text.trim(),
        emoji: _emoji,
        imageUrl: _imageUrl,
      );

      if (widget.isEditing) {
        var toSave = product;
        if (_pendingImageBytes != null) {
          final url = await repo.uploadProductImage(
            arenaId: arenaId,
            productId: product.id,
            bytes: _pendingImageBytes!,
            contentType: _pendingImageContentType ?? 'image/jpeg',
          );
          toSave = product.copyWith(imageUrl: url);
        }
        await repo.updateProduct(arenaId: arenaId, product: toSave);
      } else {
        final newId = await repo.createProduct(
          arenaId: arenaId,
          product: product,
        );
        if (_pendingImageBytes != null) {
          final url = await repo.uploadProductImage(
            arenaId: arenaId,
            productId: newId,
            bytes: _pendingImageBytes!,
            contentType: _pendingImageContentType ?? 'image/jpeg',
          );
          await repo.updateProduct(
            arenaId: arenaId,
            product: product.copyWith(id: newId, imageUrl: url),
          );
        }
      }

      if (!mounted) return;
      showAppSnackBar(
        context,
        widget.isEditing ? 'Produto atualizado.' : 'Produto cadastrado.',
      );
      context.pop();
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao salvar: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _confirmDeleteProduct(String arenaId, ArenaProduct product) async {
    final action = await ArenaProductDeleteSheet.show(
      context,
      arenaId: arenaId,
      product: product,
    );

    if (!mounted || action == null || action == ArenaProductDeleteSheetResult.cancel) {
      return;
    }

    if (action == ArenaProductDeleteSheetResult.deactivate) {
      showAppSnackBar(context, 'Produto desativado.');
      context.pop();
      return;
    }

    setState(() => _saving = true);
    try {
      await ref.read(arenaProductsRepositoryProvider).deleteProduct(
            arenaId: arenaId,
            productId: product.id,
          );
      if (!mounted) return;
      context.pop();
      context.pushNamed(
        AppRouteNames.arenaProductDeleted,
        extra: ArenaProductDeleteArgs(
          arenaId: arenaId,
          product: product,
        ),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao excluir: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final managed = ref.watch(managedArenaIdProvider);
    final arenaId = managed.valueOrNull;

    if (widget.isEditing && arenaId != null) {
      ref.listen(
        arenaProductProvider((arenaId: arenaId, productId: widget.productId!)),
        (previous, next) {
          next.whenData(_applyProduct);
        },
      );
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: FadeSlideIn(
          child: managed.when(
            data: (id) {
              if (id == null || id.isEmpty) {
                return const ArenaEmptyState(
                  title: 'Arena não encontrada',
                  message: 'Nenhuma arena vinculada.',
                  icon: Icons.inventory_2_outlined,
                );
              }
              if (widget.isEditing) {
                final productAsync = ref.watch(
                  arenaProductProvider((
                    arenaId: id,
                    productId: widget.productId!,
                  )),
                );
                return productAsync.when(
                  data: (product) {
                    if (product == null) {
                      return const ArenaEmptyState(
                        title: 'Produto não encontrado',
                        message: 'Este item pode ter sido removido.',
                        icon: Icons.inventory_2_outlined,
                      );
                    }
                    return _FormBody(
                      headerLabel: 'EDITAR PRODUTO',
                      title: product.name,
                      saving: _saving,
                      onSave: () => _save(id),
                      onBack: () => context.pop(),
                      onDelete: () => _confirmDeleteProduct(id, product),
                      child: _buildFields(context),
                    );
                  },
                  loading: () =>
                      const ArenaLoadingState(label: 'Carregando produto...'),
                  error: (e, _) => ArenaErrorState(message: '$e'),
                );
              }
              return _FormBody(
                title: 'Novo Produto',
                saving: _saving,
                onSave: () => _save(id),
                onBack: () => context.pop(),
                child: _buildFields(context),
              );
            },
            loading: () =>
                const ArenaLoadingState(label: 'Carregando arena...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }

  Widget _buildFields(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ProductImageActiveSection(
          emoji: _emoji,
          imageUrl: _imageUrl,
          pendingBytes: _pendingImageBytes,
          active: _active,
          onPickImage: _pickImage,
          onActiveChanged: (value) => setState(() => _active = value),
        ),
        const SizedBox(height: 24),
        _FieldLabel('NOME'),
        TextField(
          controller: _nameController,
          textCapitalization: TextCapitalization.words,
          cursorColor: AppColors.brand,
          cursorWidth: 2.5,
          style: _textFieldStyle(context),
          decoration: _inputDecoration(context, hint: 'Nome do produto'),
        ),
        const SizedBox(height: 16),
        _FieldLabel('CATEGORIA'),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final category in ArenaProductCategory.values) ...[
                _CategoryChip(
                  label: category.filterChipLabel,
                  selected: _category == category,
                  onTap: () => setState(() => _category = category),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        _FieldLabel('DESCRIÇÃO'),
        TextField(
          controller: _descriptionController,
          maxLines: 3,
          cursorColor: AppColors.brand,
          cursorWidth: 2.5,
          style: _textFieldStyle(context),
          decoration: _inputDecoration(context, hint: 'Descrição opcional'),
        ),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _FieldLabel('PREÇO'),
                  TextField(
                    controller: _priceController,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9,\.]')),
                    ],
                    cursorColor: AppColors.brand,
                    cursorWidth: 2.5,
                    style: _textFieldStyle(context),
                    decoration: _inputDecoration(
                      context,
                      hint: '0,00',
                      suffix: 'R\$',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _FieldLabel('ESTOQUE ATUAL'),
                  TextField(
                    controller: _stockController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    cursorColor: AppColors.brand,
                    cursorWidth: 2.5,
                    style: _textFieldStyle(context),
                    decoration: _inputDecoration(
                      context,
                      hint: '0',
                      suffix: 'un',
                    ),
                    readOnly: widget.isEditing,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _FieldLabel('ESTOQUE MÍNIMO (ALERTA)'),
        TextField(
          controller: _minStockController,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          cursorColor: AppColors.brand,
          cursorWidth: 2.5,
          style: _textFieldStyle(context),
          decoration: _inputDecoration(
            context,
            hint: '0',
            suffix: 'un',
          ),
        ),
        if (widget.isEditing) ...[
          const SizedBox(height: 8),
          Text(
            'Para alterar quantidade, use Repor estoque.',
            style: TextStyle(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 12,
            ),
          ),
        ],
      ],
    );
  }

  TextStyle _textFieldStyle(BuildContext context) => TextStyle(
    color: context.themeColors.onSurface,
    fontSize: 16,
    fontWeight: FontWeight.w500,
    height: 1.2,
  );

  InputDecoration _inputDecoration(
    BuildContext context, {
    required String hint,
    String? suffix,
  }) {
    final colors = context.themeColors;
    final enabledBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(
        color: colors.onSurfaceMuted.withValues(alpha: 0.22),
      ),
    );
    final focusedBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
    );
    return InputDecoration(
      hintText: hint,
      suffixText: suffix,
      suffixStyle: suffix == null
          ? null
          : TextStyle(
              color: colors.onSurfaceMuted.withValues(alpha: 0.85),
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
      hintStyle: TextStyle(
        color: colors.onSurfaceMuted.withValues(alpha: 0.55),
        fontSize: 16,
        fontWeight: FontWeight.w500,
      ),
      filled: true,
      fillColor: colors.surfaceRaised,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: enabledBorder,
      enabledBorder: enabledBorder,
      focusedBorder: focusedBorder,
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color: colors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
    );
  }
}

class _FormBody extends StatelessWidget {
  const _FormBody({
    this.headerLabel,
    required this.title,
    required this.saving,
    required this.onSave,
    required this.onBack,
    this.onDelete,
    required this.child,
  });

  final String? headerLabel;
  final String title;
  final bool saving;
  final VoidCallback onSave;
  final VoidCallback onBack;
  final VoidCallback? onDelete;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Material(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(12),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onBack,
                  child: SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(
                      Icons.arrow_back_rounded,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (headerLabel != null) ...[
                      Text(
                        headerLabel!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(height: 2),
                    ],
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                        color: context.themeColors.onSurface,
                        fontSize: 26,
                        height: 1.05,
                      ),
                    ),
                  ],
                ),
              ),
              if (onDelete != null) ...[
                const SizedBox(width: 12),
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: saving ? null : onDelete,
                    borderRadius: BorderRadius.circular(12),
                    child: Ink(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: context.themeColors.surfaceRaised,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.live.withValues(alpha: 0.65),
                        ),
                      ),
                      child: const Icon(
                        Icons.delete_outline_rounded,
                        color: AppColors.live,
                        size: 22,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              16,
              ArenaDashboardTokens.horizontalPadding,
              24,
            ),
            child: child,
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(
              onPressed: saving ? null : onSave,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor:
                    AppColors.brand.withValues(alpha: 0.55),
                disabledForegroundColor:
                    AppColors.black.withValues(alpha: 0.45),
                shape: const StadiumBorder(),
              ),
              child: saving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.black,
                      ),
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_rounded, size: 20),
                        SizedBox(width: 8),
                        Text(
                          'Salvar produto',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: AppTypography.mono(
          color: context.themeColors.onSurfaceMuted,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final borderColor = selected
        ? AppColors.brand
        : colors.onSurfaceMuted.withValues(alpha: 0.22);

    return Material(
      color: colors.surfaceRaised,
      shape: StadiumBorder(
        side: BorderSide(
          color: borderColor,
          width: selected ? 1.5 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              color: selected ? AppColors.brand : colors.onSurfaceMuted,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _ProductImageActiveSection extends StatelessWidget {
  const _ProductImageActiveSection({
    required this.emoji,
    required this.imageUrl,
    required this.pendingBytes,
    required this.active,
    required this.onPickImage,
    required this.onActiveChanged,
  });

  final String? emoji;
  final String? imageUrl;
  final Uint8List? pendingBytes;
  final bool active;
  final VoidCallback onPickImage;
  final ValueChanged<bool> onActiveChanged;

  static const _imageSize = 96.0;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        GestureDetector(
          onTap: onPickImage,
          behavior: HitTestBehavior.opaque,
          child: SizedBox(
            width: _imageSize,
            height: _imageSize,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppColors.brand,
                      width: 2,
                    ),
                  ),
                  child: ClipOval(
                    child: SizedBox(
                      width: _imageSize,
                      height: _imageSize,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (pendingBytes == null &&
                              (imageUrl == null || imageUrl!.isEmpty))
                            ColoredBox(
                              color: context.themeColors.surfaceRaised,
                              child: CustomPaint(
                                painter: _ProductImageStripesPainter(
                                  color: context.themeColors.onSurfaceMuted
                                      .withValues(alpha: 0.08),
                                ),
                              ),
                            ),
                          if (pendingBytes != null)
                            Image.memory(pendingBytes!, fit: BoxFit.cover)
                          else if (imageUrl != null && imageUrl!.isNotEmpty)
                            CachedNetworkImage(
                              imageUrl: imageUrl!,
                              fit: BoxFit.cover,
                            )
                          else
                            Center(
                              child: Text(
                                emoji == null || emoji!.isEmpty ? '📦' : emoji!,
                                style: const TextStyle(fontSize: 40),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Material(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(12),
                    elevation: 2,
                    shadowColor: Colors.black.withValues(alpha: 0.35),
                    clipBehavior: Clip.antiAlias,
                    child: const SizedBox(
                      width: 32,
                      height: 32,
                      child: Icon(
                        Icons.edit_rounded,
                        color: AppColors.black,
                        size: 16,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Toque para trocar a imagem do produto',
                style: AppTypography.soraRegular(
                  color: context.themeColors.onSurfaceMuted,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Produto ativo',
                    style: AppTypography.soraRegular(
                      color: context.themeColors.onSurface,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Switch(
                    value: active,
                    onChanged: onActiveChanged,
                    activeTrackColor: AppColors.brand,
                    activeThumbColor: AppColors.black,
                    inactiveTrackColor: context.themeColors.surfaceRaised,
                    inactiveThumbColor: context.themeColors.onSurfaceMuted,
                    trackOutlineColor: WidgetStateProperty.all(
                      Colors.transparent,
                    ),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProductImageStripesPainter extends CustomPainter {
  const _ProductImageStripesPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2;

    const spacing = 12.0;
    for (var x = -size.height; x < size.width + size.height; x += spacing) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ProductImageStripesPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}
