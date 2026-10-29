import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_segmented_control.dart';
import '../../../../core/ui/nexa_share.dart';
import '../../../arenas/presentation/widgets/booking_story/booking_story_editor.dart'
    show BookingStoryChip, captureBookingStoryPng;
import '../../domain/ranking_list_mapper.dart';
import '../../domain/ranking_list_models.dart';
import '../../domain/ranking_logic.dart';
import '../../domain/ranking_providers.dart';
import '../../domain/ranking_share.dart';
import 'ranking_filters_sheet.dart';
import 'ranking_share_card.dart';

/// "Compartilhar ranking" (canvas "Ranking - Compartilhar", tela 2): herda a
/// aba e os filtros da tela, escolhe o formato (story, post ou só o link), o
/// Top e o destaque da própria linha. "Editar" abre a folha de filtros e muda
/// a tela junto — o que se compartilha é sempre o que está nela.
Future<void> showRankingShareSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.92,
    ),
    builder: (_) => const RankingShareSheet(),
  );
}

class RankingShareSheet extends ConsumerStatefulWidget {
  const RankingShareSheet({super.key});

  @override
  ConsumerState<RankingShareSheet> createState() => _RankingShareSheetState();
}

class _RankingShareSheetState extends ConsumerState<RankingShareSheet> {
  final _cardKey = GlobalKey();
  var _format = RankingShareFormat.story;
  var _top = 10;
  var _highlight = true;

  /// Qual imagem está sendo gerada — o giro fica só no botão tocado.
  _ImageTarget? _busy;
  var _copied = false;
  String? _error;
  Timer? _copiedTimer;

  @override
  void dispose() {
    _copiedTimer?.cancel();
    super.dispose();
  }

  /// O Top escolhido, se o formato oferece; senão o maior que ele oferece
  /// (Top 20 → Post vira Top 10).
  int get _effectiveTop {
    final options = _format.topOptions;
    return options.contains(_top) ? _top : options.last;
  }

  /// As fotos precisam estar decodificadas antes da captura: a arte sai com o
  /// que estiver pintado, e foto pela metade vira iniciais no PNG.
  Future<void> _precachePhotos(RankingShareData data) async {
    final urls = {
      for (final entry in [
        ...data.podium,
        ...data.rows,
        if (data.mine != null) data.mine!
      ])
        for (final member in entry.members)
          if (member.avatarUrl != null) member.avatarUrl!,
    };
    await Future.wait([
      for (final url in urls)
        precacheImage(
          CachedNetworkImageProvider(url),
          context,
          onError: (_, _) {},
        ),
    ]).timeout(const Duration(seconds: 8), onTimeout: () => const []);
  }

  /// Gera o PNG e abre a folha nativa. O "Salvar" vai sem legenda: a folha
  /// tem "Salvar imagem" e nenhum texto vai junto.
  Future<void> _shareImage(
    RankingShareData data, {
    required _ImageTarget target,
  }) async {
    if (_busy != null) return;
    setState(() {
      _busy = target;
      _error = null;
    });
    try {
      await _precachePhotos(data);
      if (!mounted) return;
      await WidgetsBinding.instance.endOfFrame;
      const fileName = 'nexago_ranking.png';
      final file = await captureBookingStoryPng(_cardKey, fileName);
      if (!mounted) return;
      if (file == null) {
        // Snackbar ficaria atrás da folha.
        setState(
            () => _error = 'Não foi possível gerar a imagem. Tente de novo.');
        return;
      }
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png', name: fileName)],
        text: target == _ImageTarget.post ? data.caption : null,
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _copyLink(String link) async {
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    setState(() => _copied = true);
    _copiedTimer?.cancel();
    _copiedTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final filter = ref.watch(rankingPageFilterProvider);
    final sportCode =
        ref.watch(rankingSportProvider).valueOrNull ?? kDefaultRankingSport;
    final entriesAsync = ref.watch(rankingListEntriesProvider);
    final entries = entriesAsync.valueOrNull ?? const <RankingListEntry>[];
    final uid = ref.watch(authProvider).valueOrNull?.uid;
    final sportLabel = rankingSportLabel(sportCode);
    final isTeam = filter.mode == RankingListMode.teams;

    final mine =
        sortedRankingEntries(entries).where((e) => e.isCurrentUser).firstOrNull;
    final link = rankingShareLink(
      filter: filter,
      sportCode: sportCode,
      sharedBy: uid,
    );
    final data = rankingShareDataFrom(
      entries: entries,
      filter: filter,
      sportLabel: sportLabel,
      top: _effectiveTop,
      highlightMine: _highlight,
      link: link,
      now: DateTime.now(),
    );
    final loading = entriesAsync.isLoading;
    final canShareImage = _format.hasImage && !loading && !data.isEmpty;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 10),
        Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: colors.onSurfaceMuted.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Compartilhar ranking',
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Fechar',
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.close_rounded, color: colors.onSurface),
              ),
            ],
          ),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                _Label(
                  'FILTROS INCLUÍDOS',
                  action: TextButton(
                    key: const Key('ranking-share-edit-filters'),
                    onPressed: () => openRankingFilters(context, ref),
                    child: Text(
                      'Editar',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: colors.brandText,
                      ),
                    ),
                  ),
                ),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final label in rankingShareFilterLabels(
                      filter,
                      sportLabel: sportLabel,
                    ))
                      _PlainChip(label),
                  ],
                ),
                const SizedBox(height: 18),
                const _Label('FORMATO'),
                NexaSegmentedControl<RankingShareFormat>(
                  segments: [
                    for (final f in RankingShareFormat.values)
                      NexaSegment(value: f, label: f.label),
                  ],
                  selected: _format,
                  onChanged: (f) => setState(() => _format = f),
                ),
                const SizedBox(height: 18),
                if (_format.hasImage) ...[
                  const _Label('PRÉVIA'),
                  _ImagePreview(
                    cardKey: _cardKey,
                    format: _format,
                    data: data,
                    loading: loading,
                    topOptions: _format.topOptions,
                    top: _effectiveTop,
                    onTop: (top) => setState(() => _top = top),
                    highlightLabel: mine == null
                        ? null
                        : rankingShareHighlightLabel(mine, isTeam: isTeam),
                    highlight: _highlight,
                    onHighlight: (on) => setState(() => _highlight = on),
                  ),
                ] else ...[
                  const _Label('LINK'),
                  _LinkPreview(link: link),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: colors.live,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(
            20,
            14,
            20,
            14 + MediaQuery.paddingOf(context).bottom,
          ),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.surfaceRaised)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_format.hasImage) ...[
                Expanded(
                  child: _Destination(
                    key: const Key('ranking-share-post'),
                    icon: _format == RankingShareFormat.story
                        ? Icons.photo_camera_outlined
                        : Icons.add_box_outlined,
                    label: _format == RankingShareFormat.story
                        ? 'Stories'
                        : 'Postar',
                    primary: true,
                    busy: _busy == _ImageTarget.post,
                    onTap: canShareImage
                        ? () => _shareImage(data, target: _ImageTarget.post)
                        : null,
                  ),
                ),
              ],
              Expanded(
                child: _Destination(
                  key: const Key('ranking-share-message'),
                  icon: Icons.chat_bubble_outline_rounded,
                  label: 'Mensagem',
                  primary: !_format.hasImage,
                  onTap: () => nexaShareText(context, data.message),
                ),
              ),
              Expanded(
                child: _Destination(
                  key: const Key('ranking-share-copy'),
                  icon: _copied ? Icons.check_rounded : Icons.link_rounded,
                  label: _copied ? 'Copiado' : 'Copiar link',
                  onTap: () => _copyLink(link),
                ),
              ),
              if (_format.hasImage)
                Expanded(
                  child: _Destination(
                    key: const Key('ranking-share-save'),
                    icon: Icons.download_rounded,
                    label: 'Salvar',
                    busy: _busy == _ImageTarget.save,
                    onTap: canShareImage
                        ? () => _shareImage(data, target: _ImageTarget.save)
                        : null,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Os dois botões que geram a imagem: postar (com legenda) e salvar.
enum _ImageTarget { post, save }

class _Label extends StatelessWidget {
  const _Label(this.text, {this.action});

  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final label = Text(
      text,
      style: AppTypography.mono(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: context.themeColors.onSurfaceMuted,
        letterSpacing: 0.8,
      ),
    );
    if (action == null) {
      return Padding(padding: const EdgeInsets.only(bottom: 10), child: label);
    }
    return Row(children: [Expanded(child: label), action!]);
  }
}

/// Chip só de leitura: os filtros vêm da tela, a edição é na folha.
class _PlainChip extends StatelessWidget {
  const _PlainChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 12.5,
          color: colors.onSurface,
        ),
      ),
    );
  }
}

/// A arte pequena (é ela que vira PNG) e, ao lado, o Top e o destaque.
class _ImagePreview extends StatelessWidget {
  const _ImagePreview({
    required this.cardKey,
    required this.format,
    required this.data,
    required this.loading,
    required this.topOptions,
    required this.top,
    required this.onTop,
    required this.highlightLabel,
    required this.highlight,
    required this.onHighlight,
  });

  final GlobalKey cardKey;
  final RankingShareFormat format;
  final RankingShareData data;
  final bool loading;
  final List<int> topOptions;
  final int top;
  final ValueChanged<int> onTop;

  /// `null`: quem compartilha não está no recorte — nada a destacar.
  final String? highlightLabel;
  final bool highlight;
  final ValueChanged<bool> onHighlight;

  static const double _width = 128;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final size = RankingShareCard.sizeOf(format);
    final height = _width * size.height / size.width;
    final empty = !loading && data.isEmpty;

    final preview = Container(
      width: _width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.12)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(9),
        child: loading || empty
            ? ColoredBox(
                color: const Color(0xFF050505),
                child: Center(
                  child: loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.brand,
                          ),
                        )
                      : const Icon(
                          Icons.leaderboard_outlined,
                          color: Color(0x66F4F4F5),
                        ),
                ),
              )
            : FittedBox(
                child: RepaintBoundary(
                  key: cardKey,
                  child: RankingShareCard(data: data, format: format),
                ),
              ),
      ),
    );

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          preview,
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Label('MOSTRAR'),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final n in topOptions)
                      BookingStoryChip(
                        key: Key('ranking-share-top-$n'),
                        label: 'Top $n',
                        selected: n == top,
                        onTap: () => onTop(n),
                      ),
                  ],
                ),
                if (highlightLabel != null) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          highlightLabel!,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      Switch.adaptive(
                        key: const Key('ranking-share-highlight'),
                        value: highlight,
                        onChanged: onHighlight,
                        activeTrackColor: AppColors.brand,
                      ),
                    ],
                  ),
                ],
                if (empty) ...[
                  const SizedBox(height: 14),
                  Text(
                    'Ninguém pontuou neste recorte ainda. Dá pra mandar só o '
                    'link.',
                    style:
                        TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
                  ),
                ] else ...[
                  const SizedBox(height: 14),
                  Text(
                    'A imagem leva a data de hoje; o link abre o ranking ao '
                    'vivo, já com esses filtros.',
                    style:
                        TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LinkPreview extends StatelessWidget {
  const _LinkPreview({required this.link});

  final String link;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(Icons.link_rounded, color: colors.brandText),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  link,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Abre o ranking ao vivo, já com esses filtros. Quem recebe '
                  'pode tirar os filtros lá.',
                  style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Um destino da barra de baixo: o quadrado com o ícone e o rótulo.
class _Destination extends StatelessWidget {
  const _Destination({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool primary;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final enabled = onTap != null && !busy;
    final fg = primary ? AppColors.black : colors.onSurface;
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: onTap == null ? 0.4 : 1,
          child: Column(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: primary ? AppColors.brand : colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Center(
                  child: busy
                      ? SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: fg,
                          ),
                        )
                      : Icon(icon, color: fg),
                ),
              ),
              const SizedBox(height: 7),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
