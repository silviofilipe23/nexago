import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_share_capture.dart';
import 'match_detail_share_card.dart';
import 'match_detail_section_header.dart';

enum MatchDetailSharePresentation { page, sheet }

class MatchDetailShareSection extends StatefulWidget {
  const MatchDetailShareSection({
    super.key,
    required this.share,
    this.compact = false,
    this.presentation = MatchDetailSharePresentation.page,
  });

  final MatchDetailShareInfo share;
  final bool compact;
  final MatchDetailSharePresentation presentation;

  @override
  State<MatchDetailShareSection> createState() =>
      _MatchDetailShareSectionState();
}

class _MatchDetailShareSectionState extends State<MatchDetailShareSection> {
  final _captureKey = GlobalKey();
  bool _exporting = false;

  Future<void> _exportAndShare() async {
    if (_exporting) return;
    setState(() => _exporting = true);
    try {
      await _precacheShareAvatars(context);
      if (!mounted) return;
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;

      final file = await captureMatchDetailShareCardPng(_captureKey);
      if (!mounted) return;
      if (file == null) {
        showAppSnackBar(context, 'Não foi possível gerar a imagem.');
        return;
      }
      await shareMatchDetailShareCardPng(file);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível compartilhar.');
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _precacheShareAvatars(BuildContext context) async {
    final urls = <String>{
      for (final player in [
        ...widget.share.winnersPlayers,
        ...widget.share.opponentsPlayers,
      ])
        player.avatarUrl?.trim() ?? '',
    }..removeWhere((url) => url.isEmpty);

    await Future.wait(
      urls.map(
        (url) => precacheImage(CachedNetworkImageProvider(url), context),
      ),
    );
  }

  double _previewWidth(BuildContext context) {
    final screenW = MediaQuery.sizeOf(context).width;
    final horizontalPad = widget.presentation == MatchDetailSharePresentation.sheet
        ? 48.0
        : 40.0;
    final maxW = widget.presentation == MatchDetailSharePresentation.sheet
        ? 260.0
        : 300.0;
    return (screenW - horizontalPad).clamp(200.0, maxW);
  }

  @override
  Widget build(BuildContext context) {
    final preview = _ShareCardPreview(
      captureKey: _captureKey,
      share: widget.share,
      previewWidth: _previewWidth(context),
    );

    if (widget.compact) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: preview,
      );
    }

    final horizontalPad = widget.presentation == MatchDetailSharePresentation.sheet
        ? 20.0
        : 0.0;

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: horizontalPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const MatchDetailSectionHeader(
            eyebrow: 'COMPARTILHAR',
            title: 'Mostre a vitória',
          ),
          const SizedBox(height: 20),
          Center(child: preview),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: _ShareActionButton(
                  label: 'WhatsApp',
                  icon: Icons.chat_rounded,
                  filled: true,
                  loading: _exporting,
                  onTap: _exportAndShare,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ShareActionButton(
                  label: 'Stories',
                  icon: Icons.ios_share_rounded,
                  loading: _exporting,
                  onTap: _exportAndShare,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ShareActionButton(
                  label: 'Salvar',
                  icon: Icons.download_rounded,
                  loading: _exporting,
                  onTap: _exportAndShare,
                ),
              ),
            ],
          ),
          if (widget.presentation == MatchDetailSharePresentation.sheet)
            const SizedBox(height: 4),
        ],
      ),
    );
  }
}

/// Preview escalado; o [RepaintBoundary] mantém o artboard em [MatchDetailShareCard.designWidth].
class _ShareCardPreview extends StatelessWidget {
  const _ShareCardPreview({
    required this.captureKey,
    required this.share,
    required this.previewWidth,
  });

  final GlobalKey captureKey;
  final MatchDetailShareInfo share;
  final double previewWidth;

  @override
  Widget build(BuildContext context) {
    final previewHeight = previewWidth *
        (MatchDetailShareCard.designHeight / MatchDetailShareCard.designWidth);

    return SizedBox(
      width: previewWidth,
      height: previewHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: AppColors.brand.withValues(alpha: 0.2),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.4),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: FittedBox(
            fit: BoxFit.contain,
            alignment: Alignment.topCenter,
            child: RepaintBoundary(
              key: captureKey,
              child: MatchDetailShareCard(share: share),
            ),
          ),
        ),
      ),
    );
  }
}

class _ShareActionButton extends StatelessWidget {
  const _ShareActionButton({
    required this.label,
    required this.icon,
    required this.onTap,
    this.filled = false,
    this.loading = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? AppColors.brand : AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: filled
                ? null
                : Border.all(color: AppColors.surfaceRaised),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: filled ? AppColors.black : AppColors.onSurface,
                  ),
                )
              else
                Icon(
                  icon,
                  size: 22,
                  color: filled ? AppColors.black : AppColors.onSurface,
                ),
              const SizedBox(height: 6),
              Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: filled ? AppColors.black : AppColors.onSurface,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void showMatchDetailShareSheet(
  BuildContext context,
  MatchDetailShareInfo share,
) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surfaceSheet,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            MatchDetailShareSection(
              share: share,
              presentation: MatchDetailSharePresentation.sheet,
            ),
          ],
        ),
      );
    },
  );
}
