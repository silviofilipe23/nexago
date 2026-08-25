import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../../core/brand/nexa_hashtag.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../athlete/presentation/widgets/match_detail/match_share_poster_capture.dart';
import '../../../domain/focus/campaign_share_data.dart';
import 'campaign_share_poster_painter.dart';

/// Compartilhar a campanha do torneio como imagem.
///
/// A arte é a mesma do portal (ver [drawCampaignSharePoster]); aqui ficam só o
/// preview e a folha nativa. Reusa `matchSharePosterOrigin` e
/// `loadMatchSharePosterLogo` do pôster de partida — o popover do iOS e a marca
/// são os mesmos nos dois.
Future<void> showFocusShareCampaignSheet(
  BuildContext context,
  CampaignShareData data,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CampaignSheet(data: data),
  );
}

class _CampaignSheet extends StatefulWidget {
  const _CampaignSheet({required this.data});

  final CampaignShareData data;

  @override
  State<_CampaignSheet> createState() => _CampaignSheetState();
}

class _CampaignSheetState extends State<_CampaignSheet> {
  CampaignPosterAssets _assets = CampaignPosterAssets.empty;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    _loadAssets();
  }

  Future<void> _loadAssets() async {
    final logo = await loadMatchSharePosterLogo();
    if (!mounted) return;
    setState(() => _assets = CampaignPosterAssets(logo: logo));
  }

  Future<void> _export() async {
    if (_exporting) return;
    setState(() => _exporting = true);
    final messenger = ScaffoldMessenger.maybeOf(context);
    final origin = matchSharePosterOrigin(context);

    try {
      final file = await _capture(widget.data, _assets);
      if (file == null) {
        messenger?.showSnackBar(
          const SnackBar(content: Text('Não foi possível gerar o card.')),
        );
        return;
      }
      await Share.shareXFiles(
        [
          XFile(
            file.path,
            mimeType: 'image/png',
            name: 'nexago_campanha.png',
          ),
        ],
        subject: widget.data.teamName,
        text: withNexaHashtag(
          '${widget.data.teamName} — ${widget.data.tournamentName}',
        ),
        sharePositionOrigin: origin,
      );
    } catch (error, stackTrace) {
      debugPrint('campaign share poster failed: $error\n$stackTrace');
      messenger?.showSnackBar(
        const SnackBar(content: Text('Não foi possível compartilhar o card.')),
      );
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: colors.surfaceSheet,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.md,
          AppSpacing.screenH,
          AppSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.outline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Text(
              'Compartilhar campanha',
              style: AppTypography.titleM.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: AppSpacing.lg),
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: AspectRatio(
                aspectRatio: campaignCardWidth / campaignCardHeight,
                child: CustomPaint(
                  painter: CampaignSharePosterPainter(
                    data: widget.data,
                    assets: _assets,
                  ),
                  size: Size.infinite,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _exporting ? null : _export,
                icon: _exporting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.white,
                        ),
                      )
                    : const Icon(Icons.ios_share_rounded, size: 18),
                label: Text(_exporting ? 'Gerando…' : 'Compartilhar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<File?> _capture(
  CampaignShareData data,
  CampaignPosterAssets assets,
) async {
  final recorder = ui.PictureRecorder();
  drawCampaignSharePoster(
    Canvas(
      recorder,
      const Rect.fromLTWH(0, 0, campaignCardWidth, campaignCardHeight),
    ),
    data,
    assets,
  );

  final picture = recorder.endRecording();
  try {
    final image = await picture.toImage(
      campaignCardWidth.toInt(),
      campaignCardHeight.toInt(),
    );
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) return null;
      final file = File(
        '${Directory.systemTemp.path}/nexago_campanha_'
        '${DateTime.now().millisecondsSinceEpoch}.png',
      );
      await file.writeAsBytes(bytes.buffer.asUint8List());
      return file;
    } finally {
      image.dispose();
    }
  } finally {
    picture.dispose();
  }
}
