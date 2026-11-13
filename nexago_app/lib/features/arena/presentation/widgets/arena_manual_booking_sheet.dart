import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/arena_slot.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_shell_providers.dart';

/// Bottom sheet "Criar reserva" do detalhe do horário: reserva de balcão
/// (walk-in) com o nome do cliente, valor e nota. Grava pela callable
/// `createArenaManualBooking` — a mesma do portal da arena.
class ArenaManualBookingSheet extends ConsumerStatefulWidget {
  const ArenaManualBookingSheet({
    super.key,
    required this.slot,
    required this.courtName,
  });

  final ArenaSlot slot;
  final String courtName;

  /// `true` quando a reserva foi criada.
  static Future<bool> show(
    BuildContext context, {
    required ArenaSlot slot,
    required String courtName,
  }) async {
    final result = await showArenaShellModalBottomSheet<bool>(
      context: context,
      builder: (ctx) =>
          ArenaManualBookingSheet(slot: slot, courtName: courtName),
    );
    return result == true;
  }

  @override
  ConsumerState<ArenaManualBookingSheet> createState() =>
      _ArenaManualBookingSheetState();
}

class _ArenaManualBookingSheetState
    extends ConsumerState<ArenaManualBookingSheet> {
  final _nameController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  bool _amountEdited = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final price = widget.slot.priceReais;
    if (price != null && price > 0) {
      _amountController.text = price.toStringAsFixed(2);
    }
    _loadQuote();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  /// Preço do servidor (quadra + promoções) substitui o do slot enquanto o
  /// gestor não mexeu no campo. Falha aqui não bloqueia: ele digita.
  Future<void> _loadQuote() async {
    final slot = widget.slot;
    try {
      final amount = await ref.read(arenaManualBookingServiceProvider).quote(
            arenaId: slot.arenaId,
            courtId: slot.courtId,
            dateKey: slot.dateKey,
            startTime: slot.startTime,
            endTime: slot.endTime,
          );
      if (!mounted || _amountEdited || amount == null || amount <= 0) return;
      setState(() => _amountController.text = amount.toStringAsFixed(2));
    } catch (_) {
      // Cotação é sugestão; o valor do slot (ou o digitado) segue valendo.
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateLabel = DateFormat(
      'EEE, d \'de\' MMMM',
      'pt_BR',
    ).format(widget.slot.date).toUpperCase().replaceAll('.', '');
    final timeRange = '${widget.slot.startTime} — ${widget.slot.endTime}';

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
            const SizedBox(height: 16),
            Text(
              '$dateLabel · ${widget.courtName.toUpperCase()}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              timeRange,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Criar reserva',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Reserva de balcão: o horário sai da agenda pública e o '
              'pagamento é acertado direto com a arena.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            _label(context, 'CLIENTE'),
            const SizedBox(height: 8),
            TextField(
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              style: TextStyle(color: context.themeColors.onSurface),
              decoration: _decoration(context, hint: 'Nome de quem vai jogar'),
            ),
            const SizedBox(height: 20),
            _label(context, 'VALOR (R\$)'),
            const SizedBox(height: 8),
            TextField(
              controller: _amountController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => _amountEdited = true,
              style: TextStyle(color: context.themeColors.onSurface),
              decoration: _decoration(context, hint: 'Ex: 120,00'),
            ),
            const SizedBox(height: 20),
            _label(context, 'NOTA (OPCIONAL)'),
            const SizedBox(height: 8),
            TextField(
              controller: _noteController,
              maxLines: 2,
              style: TextStyle(color: context.themeColors.onSurface),
              decoration: _decoration(context, hint: 'Ex: paga no balcão'),
            ),
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
                  : const Text(
                      'Criar reserva',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(BuildContext context, String text) {
    return Text(
      text,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
    );
  }

  InputDecoration _decoration(BuildContext context, {required String hint}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.7),
      ),
      filled: true,
      fillColor: context.themeColors.surfaceRaised,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
    );
  }

  Future<void> _confirm() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      showAppSnackBar(context, 'Informe o nome do cliente.', isError: true);
      return;
    }
    final amount = parseManualBookingAmount(_amountController.text);
    if (amount == null) {
      showAppSnackBar(
        context,
        'Informe um valor válido (0 se for cortesia).',
        isError: true,
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final slot = widget.slot;
      await ref.read(arenaManualBookingServiceProvider).create(
            arenaId: slot.arenaId,
            courtId: slot.courtId,
            dateKey: slot.dateKey,
            startTime: slot.startTime,
            endTime: slot.endTime,
            customerName: name,
            amountReais: amount,
            note: _noteController.text,
          );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível criar a reserva',
          logReason: 'arena_manual_booking_create',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// "120", "120,50", "R$ 1.200,00" → valor; vazio, negativo ou lixo → `null`.
/// Zero vale (cortesia), como no servidor.
double? parseManualBookingAmount(String raw) {
  var t = raw.replaceAll(RegExp(r'[R$\s]'), '');
  if (t.isEmpty) return null;
  if (t.contains(',')) {
    // Formato BR: ponto é milhar, vírgula é decimal.
    t = t.replaceAll('.', '').replaceAll(',', '.');
  }
  final value = double.tryParse(t);
  if (value == null || value.isNaN || value < 0) return null;
  return value;
}
