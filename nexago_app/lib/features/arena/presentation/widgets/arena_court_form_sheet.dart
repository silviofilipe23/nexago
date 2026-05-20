import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/arena_court.dart';
import '../../domain/arena_providers.dart';

/// Bottom sheet para criar ou editar uma quadra (nome, tipo e preço base).
class ArenaCourtFormSheet extends ConsumerStatefulWidget {
  const ArenaCourtFormSheet({
    super.key,
    required this.arenaId,
    this.existing,
  });

  final String arenaId;
  final ArenaCourt? existing;

  static Future<bool> show(
    BuildContext context, {
    required String arenaId,
    ArenaCourt? existing,
  }) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => ArenaCourtFormSheet(
        arenaId: arenaId,
        existing: existing,
      ),
    );
    return result == true;
  }

  @override
  ConsumerState<ArenaCourtFormSheet> createState() => _ArenaCourtFormSheetState();
}

class _ArenaCourtFormSheetState extends ConsumerState<ArenaCourtFormSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _customPriceController;
  late final FocusNode _nameFocus;
  late String _type;
  late int? _presetPrice;
  late bool _customPrice;
  bool _busy = false;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _nameController = TextEditingController(text: existing?.name ?? '');
    _nameFocus = FocusNode();
    _type = _resolveInitialType(existing?.type);
    _initPrice(existing?.basePricePerHourReais);
    _customPriceController = TextEditingController(
      text: _customPrice && existing?.basePricePerHourReais != null
          ? existing!.basePricePerHourReais!.round().toString()
          : '',
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_isEdit) _nameFocus.requestFocus();
    });
  }

  String _resolveInitialType(String? raw) {
    if (raw != null && kCourtTypeOptions.contains(raw)) return raw;
    return kCourtTypeOptions.first;
  }

  void _initPrice(double? price) {
    if (price == null) {
      _presetPrice = kCourtBasePricePresets.first;
      _customPrice = false;
      return;
    }
    final rounded = price.round();
    if (kCourtBasePricePresets.contains(rounded)) {
      _presetPrice = rounded;
      _customPrice = false;
    } else {
      _presetPrice = null;
      _customPrice = true;
    }
  }

  double? get _resolvedPrice {
    if (_customPrice) {
      final raw = _customPriceController.text.trim().replaceAll(',', '.');
      final v = double.tryParse(raw);
      if (v == null || v <= 0) return null;
      return v;
    }
    return _presetPrice?.toDouble();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _customPriceController.dispose();
    _nameFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = _isEdit ? 'Editar quadra' : 'Nova quadra';
    final subtitle = _isEdit
        ? 'Atualize nome, tipo e preço exibidos na agenda.'
        : 'Aparece na agenda e no app dos atletas.';
    final actionLabel = _isEdit ? 'Salvar alterações' : 'Criar quadra';

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: 20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    _isEdit ? Icons.edit_rounded : Icons.add_rounded,
                    color: AppColors.black,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _SectionLabel('NOME', accent: true),
            const SizedBox(height: 8),
            TextField(
              controller: _nameController,
              focusNode: _nameFocus,
              textCapitalization: TextCapitalization.words,
              style: const TextStyle(
                color: AppColors.onSurface,
                fontWeight: FontWeight.w600,
              ),
              decoration: InputDecoration(
                hintText: 'Ex.: Quadra 4',
                hintStyle: TextStyle(
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w500,
                ),
                filled: true,
                fillColor: AppColors.surfaceRaised,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 14,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: AppColors.brand.withValues(alpha: 0.55),
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(
                    color: AppColors.brand,
                    width: 1.5,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 22),
            const _SectionLabel('TIPO DE QUADRA'),
            const SizedBox(height: 10),
            SizedBox(
              height: 108,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: kCourtTypeCards.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final option = kCourtTypeCards[index];
                  return SizedBox(
                    width: 100,
                    child: _CourtTypeCard(
                      option: option,
                      selected: _type == option.value,
                      onTap: () => setState(() => _type = option.value),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 22),
            const _SectionLabel('PREÇO BASE / HORA'),
            const SizedBox(height: 10),
            Row(
              children: [
                for (final p in kCourtBasePricePresets) ...[
                  Expanded(
                    child: _PricePill(
                      label: 'R\$ $p',
                      selected: !_customPrice && _presetPrice == p,
                      onTap: () => setState(() {
                        _customPrice = false;
                        _presetPrice = p;
                      }),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: _PricePill(
                    label: 'Custom',
                    selected: _customPrice,
                    onTap: () => setState(() {
                      _customPrice = true;
                      _presetPrice = null;
                    }),
                  ),
                ),
              ],
            ),
            if (_customPrice) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _customPriceController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(color: AppColors.onSurface),
                decoration: InputDecoration(
                  hintText: 'Valor em R\$',
                  hintStyle: TextStyle(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.7),
                  ),
                  filled: true,
                  fillColor: AppColors.surfaceRaised,
                  prefixText: 'R\$ ',
                  prefixStyle: const TextStyle(
                    color: AppColors.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _confirm,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(actionLabel),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirm() async {
    final price = _resolvedPrice;
    if (price == null) {
      showAppSnackBar(context, 'Informe um preço válido.', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      final service = ref.read(courtServiceProvider);
      final name = _nameController.text;
      if (_isEdit) {
        await service.updateCourt(
          arenaId: widget.arenaId,
          courtId: widget.existing!.id,
          name: name,
          type: _type,
          basePricePerHourReais: price,
        );
      } else {
        await service.addCourt(
          arenaId: widget.arenaId,
          name: name,
          type: _type,
          basePricePerHourReais: price,
        );
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } on CourtServiceException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível salvar: $e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {this.accent = false});

  final String text;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: accent ? AppColors.brand : AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
    );
  }
}

class _CourtTypeCard extends StatelessWidget {
  const _CourtTypeCard({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final FeaturedCourtType option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final iconColor = selected ? AppColors.brand : AppColors.onSurface;
    final textColor = selected ? AppColors.brand : AppColors.onSurface;
    final borderColor = selected
        ? AppColors.brand
        : AppColors.onSurfaceMuted.withValues(alpha: 0.2);

    return Material(
      color: AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: borderColor,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(option.icon, size: 28, color: iconColor),
              const SizedBox(height: 10),
              Text(
                option.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: textColor,
                  height: 1.15,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PricePill extends StatelessWidget {
  const _PricePill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(999),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 13,
              color: selected ? AppColors.black : AppColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}
