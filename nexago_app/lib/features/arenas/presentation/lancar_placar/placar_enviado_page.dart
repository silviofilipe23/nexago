import 'package:flutter/material.dart';

import '../../../../core/layout/nexa_app_bar.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/booking_result.dart';
import '../../domain/booking_result_record.dart';
import '../../domain/booking_story.dart';
import '../../domain/lancar_placar.dart';
import '../booking_result_page.dart';
import 'lancar_placar_widgets.dart';

/// Lançar placar · enviado (canvas "Proposta · 5"): confirma o que foi
/// enviado e para quem; o story vem como recompensa, não como porta de
/// entrada.
class PlacarEnviadoPage extends StatelessWidget {
  const PlacarEnviadoPage({
    super.key,
    required this.args,
    required this.result,
    required this.confirmers,
    this.sport,
    this.fromStoryEditor = false,
  });

  final BookingStoryArgs args;
  final BookingResult result;
  final List<ResultPlayer> confirmers;
  final String? sport;

  /// Veio do Pós-jogo: o editor do story já está embaixo.
  final bool fromStoryEditor;

  void _postStory(BuildContext context) {
    if (fromStoryEditor) {
      Navigator.of(context).pop();
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => BookingResultPage(args: args, presetSport: sport),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final headline = lancarResultHeadline(result) ?? 'Placar enviado';
    final notice = bookingResultSaveNotice([
      for (final p in confirmers) p.firstName,
    ]);
    final lines = result.isRotation
        ? '${result.games.length} jogos'
        : bookingResultSetsLine(result);

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        automaticallyImplyLeading: false,
        // Título de duas linhas desenhado pelo Flutter: a barra nativa do
        // iOS segue o claro/escuro do aparelho, não o tema do app.
        title: const LancarPlacarTitle(
          title: 'Placar enviado',
          subtitle: 'esperando confirmação',
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 54,
                child: FilledButton.icon(
                  key: const Key('placar-enviado-story'),
                  onPressed: () => _postStory(context),
                  icon: const Icon(Icons.amp_stories_outlined),
                  label: const Text('Postar no story'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: const Color(0xFF0A0A0A),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    textStyle: AppTypography.soraRegular(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              TextButton(
                key: const Key('placar-enviado-close'),
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(
                  foregroundColor: colors.onSurface.withValues(alpha: 0.8),
                  minimumSize: const Size.fromHeight(44),
                ),
                child: const Text('Agora não'),
              ),
            ],
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
        children: [
          Center(
            child: Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                color: colors.win,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: colors.win.withValues(alpha: 0.18),
                    spreadRadius: 14,
                  ),
                ],
              ),
              child: const Icon(
                Icons.check_rounded,
                size: 40,
                color: Color(0xFF0A0A0A),
              ),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            headline,
            key: const Key('placar-enviado-headline'),
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            lines,
            textAlign: TextAlign.center,
            style: AppTypography.mono(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: colors.onSurface.withValues(alpha: 0.8),
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: colors.onSurface.withValues(alpha: 0.08),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.schedule_rounded, size: 18, color: colors.pending),
                const SizedBox(width: 10),
                Expanded(
                  child: Text.rich(
                    key: const Key('placar-enviado-notice'),
                    TextSpan(
                      children: [
                        if (notice.names.isNotEmpty)
                          TextSpan(
                            text: notice.names,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                        TextSpan(text: notice.rest),
                      ],
                    ),
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.45,
                      color: colors.onSurface.withValues(alpha: 0.75),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Conta nas estatísticas de todo mundo depois de confirmado. Não '
            'entra no ranking.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              color: colors.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}
