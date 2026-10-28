import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../../core/layout/nexa_app_bar.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../../core/ui/nexa_share.dart';
import '../../../../arenas/presentation/widgets/booking_story/booking_story_editor.dart'
    show captureBookingStoryPng;
import '../../../domain/team_profile/team_share_card.dart';
import 'team_share_card.dart';

/// Abre a tela de compartilhar a equipe por cima do shell (a tela tem a barra
/// Salvar / Compartilhar própria).
Future<void> openTeamShareCard(
  BuildContext context, {
  required TeamShareCardData data,
  TeamShareCardStyle style = TeamShareCardStyle.profile,
}) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(
      builder: (_) => TeamShareCardPage(data: data, initialStyle: style),
    ),
  );
}

/// Compartilhar o perfil da equipe: prévia do card 1080×1920, os três estilos
/// (Perfil, Elenco/Ficha, Ranking) e a folha nativa com o PNG.
class TeamShareCardPage extends StatefulWidget {
  const TeamShareCardPage({
    super.key,
    required this.data,
    this.initialStyle = TeamShareCardStyle.profile,
  });

  final TeamShareCardData data;
  final TeamShareCardStyle initialStyle;

  @override
  State<TeamShareCardPage> createState() => _TeamShareCardPageState();
}

class _TeamShareCardPageState extends State<TeamShareCardPage> {
  final _cardKey = GlobalKey();
  late TeamShareCardStyle _style =
      widget.data.styles.contains(widget.initialStyle)
          ? widget.initialStyle
          : TeamShareCardStyle.profile;
  Future<void>? _photos;
  var _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _photos ??= _precachePhotos();
  }

  /// As fotos precisam estar decodificadas antes da captura: a arte sai com o
  /// que estiver pintado, e foto pela metade vira iniciais no PNG.
  Future<void> _precachePhotos() async {
    await Future.wait([
      for (final member in widget.data.members)
        if (member.avatarUrl != null)
          precacheImage(
            CachedNetworkImageProvider(member.avatarUrl!),
            context,
            onError: (_, _) {},
          ),
    ]).timeout(const Duration(seconds: 8), onTimeout: () => const []);
  }

  Future<void> _share({required bool withCaption}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _photos;
      await WidgetsBinding.instance.endOfFrame;
      final fileName = 'nexago_${widget.data.unit}.png';
      final file = await captureBookingStoryPng(_cardKey, fileName);
      if (!mounted) return;
      if (file == null) {
        showAppSnackBar(
          context,
          'Não foi possível gerar a imagem. Tente de novo.',
        );
        return;
      }
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png', name: fileName)],
        text: withCaption ? teamShareCardText(widget.data, _style) : null,
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final data = widget.data;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Compartilhar ${data.unit}',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      bottomNavigationBar: _ShareBar(
        busy: _busy,
        onSave: () => _share(withCaption: false),
        onShare: () => _share(withCaption: true),
      ),
      body: Column(
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final ratio =
                      TeamShareCard.size.width / TeamShareCard.size.height;
                  var height = constraints.maxHeight;
                  var width = height * ratio;
                  if (width > constraints.maxWidth) {
                    width = constraints.maxWidth;
                    height = width / ratio;
                  }
                  return Center(
                    child: _Preview(
                      width: width,
                      height: height,
                      child: RepaintBoundary(
                        key: _cardKey,
                        child: TeamShareCard(data: data, style: _style),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: _StyleTabs(
              data: data,
              value: _style,
              onChanged: (style) => setState(() => _style = style),
            ),
          ),
        ],
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({
    required this.width,
    required this.height,
    required this.child,
  });

  final double width;
  final double height;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(width * 0.05);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 40,
            offset: const Offset(0, 18),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.08),
            spreadRadius: 1,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: FittedBox(child: child),
      ),
    );
  }
}

class _StyleTabs extends StatelessWidget {
  const _StyleTabs({
    required this.data,
    required this.value,
    required this.onChanged,
  });

  final TeamShareCardData data;
  final TeamShareCardStyle value;
  final ValueChanged<TeamShareCardStyle> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.onSurface.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          for (final style in data.styles)
            Expanded(
              child: Semantics(
                button: true,
                selected: style == value,
                child: GestureDetector(
                  key: Key('team-share-style-${style.name}'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(style),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: style == value
                          ? colors.onSurface
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      data.styleLabel(style),
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: style == value
                            ? colors.canvas
                            : colors.onSurfaceMuted,
                      ),
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

/// Salvar (só a imagem) e Compartilhar (imagem + legenda com o link).
class _ShareBar extends StatelessWidget {
  const _ShareBar({
    required this.busy,
    required this.onSave,
    required this.onShare,
  });

  final bool busy;
  final VoidCallback onSave;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: Row(
          children: [
            SizedBox(
              width: 54,
              height: 54,
              child: Material(
                color: colors.onSurface.withValues(alpha: 0.05),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(
                    color: colors.onSurface.withValues(alpha: 0.10),
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  key: const Key('team-share-save'),
                  onTap: busy ? null : onSave,
                  child: Semantics(
                    button: true,
                    label: 'Salvar imagem',
                    child: Icon(
                      Icons.download_rounded,
                      size: 20,
                      color: colors.onSurface,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SizedBox(
                height: 54,
                child: FilledButton(
                  key: const Key('team-share-post'),
                  onPressed: busy ? null : onShare,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: const Color(0xFF0A0A0A),
                    disabledBackgroundColor: AppColors.brand.withValues(
                      alpha: 0.5,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Color(0xFF0A0A0A),
                          ),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Compartilhar',
                              style: AppTypography.soraRegular(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.ios_share_rounded, size: 18),
                          ],
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
