import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/arena_promotion.dart';
import '../../../arenas/domain/slots_providers.dart';
import '../../domain/arena_providers.dart';
import '../../domain/arena_shell_providers.dart';

/// Bottom sheet para criar ou editar promoção de horário (gestor).
class ArenaPromotionFormSheet extends ConsumerStatefulWidget {
  const ArenaPromotionFormSheet({
    super.key,
    required this.arenaId,
    this.existing,
  });

  final String arenaId;
  final ArenaPromotion? existing;

  static Future<bool> show(
    BuildContext context, {
    required String arenaId,
    ArenaPromotion? existing,
  }) async {
    final result = await showArenaShellModalBottomSheet<bool>(
      context: context,
      builder: (ctx) => ArenaPromotionFormSheet(
        arenaId: arenaId,
        existing: existing,
      ),
    );
    return result == true;
  }

  @override
  ConsumerState<ArenaPromotionFormSheet> createState() =>
      _ArenaPromotionFormSheetState();
}

class _ArenaPromotionFormSheetState
    extends ConsumerState<ArenaPromotionFormSheet> {
  late final TextEditingController _labelController;
  late final TextEditingController _startController;
  late final TextEditingController _endController;
  late final TextEditingController _discountController;
  late final Set<int> _weekdays;
  late final Set<String> _courtIds;
  late bool _allCourts;
  bool _busy = false;

  bool get _isEdit => widget.existing != null;

  static const _weekdayLabels = <int, String>{
    1: 'Seg',
    2: 'Ter',
    3: 'Qua',
    4: 'Qui',
    5: 'Sex',
    6: 'Sáb',
    7: 'Dom',
  };

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _labelController = TextEditingController(
      text: existing?.label ?? 'Tarde ociosa',
    );
    _startController = TextEditingController(
      text: existing?.startTime ?? '14:00',
    );
    _endController = TextEditingController(
      text: existing?.endTime ?? '18:00',
    );
    _discountController = TextEditingController(
      text: existing?.discountPercent != null
          ? existing!.discountPercent!.toString()
          : '20',
    );
    _weekdays = existing != null
        ? Set<int>.from(existing.weekdays)
        : {1, 2, 3, 4, 5};
    _allCourts = existing == null || existing.courtIds.isEmpty;
    _courtIds = existing != null && existing.courtIds.isNotEmpty
        ? Set<String>.from(existing.courtIds)
        : {};
  }

  @override
  void dispose() {
    _labelController.dispose();
    _startController.dispose();
    _endController.dispose();
    _discountController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final label = _labelController.text.trim();
    if (label.isEmpty) {
      showAppSnackBar(
        context,
        'Informe um nome para a promoção.',
        isError: true,
      );
      return;
    }
    final discount = double.tryParse(
      _discountController.text.trim().replaceAll(',', '.'),
    );
    if (discount == null || discount <= 0 || discount > 100) {
      showAppSnackBar(context, 'Desconto entre 1% e 100%.', isError: true);
      return;
    }
    if (_weekdays.isEmpty) {
      showAppSnackBar(
        context,
        'Selecione ao menos um dia da semana.',
        isError: true,
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final promo = ArenaPromotion(
        id: widget.existing?.id ?? '',
        active: widget.existing?.active ?? true,
        label: label,
        courtIds: _allCourts ? const [] : _courtIds.toList(),
        weekdays: _weekdays.toList()..sort(),
        startTime: _normalizeHm(_startController.text),
        endTime: _normalizeHm(_endController.text),
        discountPercent: discount,
      );
      final repo = ref.read(promotionsRepositoryProvider);
      if (_isEdit) {
        await repo.updatePromotion(
          arenaId: widget.arenaId,
          promotionId: widget.existing!.id,
          promotion: promo,
        );
      } else {
        await repo.createPromotion(
          arenaId: widget.arenaId,
          promotion: promo,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível salvar: $e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _normalizeHm(String raw) {
    final t = raw.trim();
    if (t.length >= 5) return t.substring(0, 5);
    return t;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final courtsAsync = ref.watch(arenaManagedCourtsProvider);

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
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.35,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            SizedBox(height: 16),
            Text(
              _isEdit ? 'Editar promoção' : 'Nova promoção',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 4),
            Text(
              'Desconto em horários ociosos na agenda e nas reservas.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
            SizedBox(height: 20),
            TextField(
              controller: _labelController,
              decoration: InputDecoration(
                labelText: 'Nome',
                hintText: 'Ex.: Tarde ociosa',
              ),
              textCapitalization: TextCapitalization.sentences,
            ),
            SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _startController,
                    decoration: InputDecoration(labelText: 'Início'),
                    keyboardType: TextInputType.datetime,
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _endController,
                    decoration: InputDecoration(labelText: 'Fim'),
                    keyboardType: TextInputType.datetime,
                  ),
                ),
              ],
            ),
            SizedBox(height: 12),
            TextField(
              controller: _discountController,
              decoration: InputDecoration(
                labelText: 'Desconto (%)',
                suffixText: '%',
              ),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
              ],
            ),
            SizedBox(height: 16),
            Text(
              'Dias da semana',
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _weekdayLabels.entries.map((e) {
                final selected = _weekdays.contains(e.key);
                return FilterChip(
                  label: Text(e.value),
                  selected: selected,
                  onSelected: (v) {
                    setState(() {
                      if (v) {
                        _weekdays.add(e.key);
                      } else {
                        _weekdays.remove(e.key);
                      }
                    });
                  },
                );
              }).toList(),
            ),
            SizedBox(height: 16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Todas as quadras'),
              value: _allCourts,
              onChanged: (v) => setState(() {
                _allCourts = v;
                if (v) _courtIds.clear();
              }),
            ),
            if (!_allCourts)
              courtsAsync.when(
                loading: () => Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: LinearProgressIndicator(),
                ),
                error: (_, __) => Text('Não foi possível carregar quadras.'),
                data: (courts) {
                  if (courts.isEmpty) {
                    return Text(
                      'Cadastre quadras antes de limitar a promoção.',
                    );
                  }
                  return Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: courts.map((c) {
                      final selected = _courtIds.contains(c.id);
                      return FilterChip(
                        label: Text(c.name),
                        selected: selected,
                        onSelected: (v) {
                          setState(() {
                            if (v) {
                              _courtIds.add(c.id);
                            } else {
                              _courtIds.remove(c.id);
                            }
                          });
                        },
                      );
                    }).toList(),
                  );
                },
              ),
            SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _busy
                  ? SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(_isEdit ? 'Salvar alterações' : 'Ativar promoção'),
            ),
          ],
        ),
      ),
    );
  }
}
