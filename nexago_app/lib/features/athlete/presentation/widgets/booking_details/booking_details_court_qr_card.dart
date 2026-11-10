import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/errors/friendly_error_message.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/data/booking_service.dart';
import '../../../../arenas/domain/booking_court_qr.dart';
import '../../../../arenas/domain/booking_providers.dart';
import '../../../../athlete_training/domain/class_presence.dart' show isCourtCheckinQr;
import '../../../../athlete_training/presentation/widgets/court_qr_scanner.dart';

/// Faz o check-in da reserva com o texto lido do QR; devolve a quadra.
/// Provider para os testes de widget trocarem o servidor.
typedef BookingQrCheckIn = Future<String> Function(String bookingId, String qr);

final bookingQrCheckInProvider = Provider<BookingQrCheckIn>(
  (ref) => (bookingId, qr) => ref
      .read(bookingServiceProvider)
      .checkInByCourtQr(bookingId: bookingId, qr: qr),
);

/// Card "Chegou? Leia o QR da quadra" da reserva numa arena que define a quadra
/// (canvas "Reservas por capacidade · app do atleta" 05–08).
class BookingDetailsCourtQrCard extends ConsumerStatefulWidget {
  const BookingDetailsCourtQrCard({
    super.key,
    required this.bookingId,
    required this.state,
    required this.startAt,
  });

  final String bookingId;
  final BookingCourtQrState state;
  final DateTime startAt;

  @override
  ConsumerState<BookingDetailsCourtQrCard> createState() =>
      _BookingDetailsCourtQrCardState();
}

class _BookingDetailsCourtQrCardState
    extends ConsumerState<BookingDetailsCourtQrCard> {
  bool _busy = false;

  Future<void> _scan() async {
    if (_busy) return;
    final raw = await ref.read(courtQrScanLauncherProvider)(context);
    if (raw == null || !mounted) return;
    if (!isCourtCheckinQr(raw)) {
      return _showProblem(
        'Este QR não é da quadra',
        'Procure o QR do nexaGO na quadra indicada pela recepção.',
      );
    }
    setState(() => _busy = true);
    (String, String)? problem;
    try {
      final court = await ref.read(bookingQrCheckInProvider)(widget.bookingId, raw);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('Check-in feito · $court')));
    } on BookingException catch (e) {
      problem = (_problemTitle(e.code), e.message);
    } catch (e) {
      problem = (
        'Não deu para fazer o check-in',
        friendlyErrorMessage(
          e,
          action: 'Não foi possível fazer o check-in',
          logReason: 'reserva:check_in_qr',
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    // Só depois de liberar: "Ler outro QR" chama `_scan` de novo.
    if (problem != null && mounted) await _showProblem(problem.$1, problem.$2);
  }

  static String _problemTitle(String? code) => switch (code) {
        'court_taken' => 'Essa quadra está ocupada nesse horário',
        'wrong_court' => 'Esta não é a quadra da sua reserva',
        'qr_invalid' => 'Este QR não vale mais',
        'qr_other_arena' => 'Este QR é de outra arena',
        'qr_unknown' => 'Este QR não é da quadra',
        _ => 'Não deu para fazer o check-in',
      };

  Future<void> _showProblem(String title, String message) async {
    final again = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      backgroundColor: context.themeColors.surfaceCard,
      builder: (context) => _ProblemSheet(title: title, message: message),
    );
    if (again == true && mounted) await _scan();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final state = widget.state;
    final done = state.stage == BookingCourtQrStage.done;
    final accent = done ? colors.win : colors.pending;

    final header = Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: accent.withValues(alpha: 0.4)),
          ),
          child: Icon(
            done ? Icons.check_rounded : Icons.qr_code_2_rounded,
            color: accent,
            size: 24,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                done ? 'Check-in feito' : 'Chegou? Leia o QR da quadra',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                done
                    ? 'Pelo QR da quadra'
                    : 'A recepção indica a sua quadra. O QR dela registra a '
                        'quadra e o seu check-in.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ],
    );

    final List<Widget> body;
    if (done) {
      body = [
        Text(
          'SUA QUADRA',
          style: theme.textTheme.labelSmall?.copyWith(
            letterSpacing: 1.6,
            color: colors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          state.courtName ?? 'Quadra',
          key: const Key('booking-qr-court'),
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: colors.win,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Bom jogo! Se precisar trocar, fale com a recepção.',
          style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
        ),
      ];
    } else {
      final opensAt = widget.startAt.subtract(kBookingQrOpensBefore);
      final hh = opensAt.hour.toString().padLeft(2, '0');
      final mm = opensAt.minute.toString().padLeft(2, '0');
      body = [
        for (final (i, step) in const [
          'Fale com a recepção',
          'Vá até a quadra indicada',
          'Leia o QR que está nela',
        ].indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.surfaceRaised,
                  ),
                  child: Text('${i + 1}', style: theme.textTheme.labelSmall),
                ),
                const SizedBox(width: 10),
                Text(step, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
        const SizedBox(height: 4),
        if (state.stage == BookingCourtQrStage.open)
          FilledButton.icon(
            key: const Key('booking-qr-scan'),
            onPressed: _busy ? null : _scan,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.qr_code_scanner_rounded),
            label: const Text('Ler QR da quadra'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              minimumSize: const Size.fromHeight(50),
            ),
          ),
        const SizedBox(height: 8),
        Text(
          state.stage == BookingCourtQrStage.open
              ? 'Disponível até o fim do horário.'
              : 'O check-in pelo QR abre às $hh:$mm.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
        ),
      ];
    }

    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: accent.withValues(alpha: done ? 0.45 : 0.3)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [header, const SizedBox(height: 14), ...body],
        ),
      ),
    );
  }
}

/// Folha do QR recusado (canvas 08): ler outro QR ou fechar.
class _ProblemSheet extends StatelessWidget {
  const _ProblemSheet({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
                ),
                child: Icon(Icons.warning_amber_rounded, color: colors.brandText),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              key: const Key('booking-qr-retry'),
              onPressed: () => Navigator.of(context).pop(true),
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: const Text('Ler outro QR'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(50),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(false),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              child: const Text('Fechar'),
            ),
          ],
        ),
      ),
    );
  }
}
