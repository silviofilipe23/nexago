import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../../app_news/domain/app_news.dart';
import '../../app_news/presentation/widgets/app_news_parts.dart';
import '../application/app_guide_providers.dart';
import '../domain/app_guide.dart';

/// Central de ajuda: guias "como usar" de cada função do app, por categoria,
/// com busca. Entrada por Configurações › Sobre › Ajuda e suporte.
class AppGuidePage extends ConsumerStatefulWidget {
  const AppGuidePage({super.key});

  @override
  ConsumerState<AppGuidePage> createState() => _AppGuidePageState();
}

class _AppGuidePageState extends ConsumerState<AppGuidePage> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _open(AppNewsFeature topic) => context.pushNamed(
    AppRouteNames.appGuideTopic,
    pathParameters: {'topicId': topic.id},
  );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final guide = ref.watch(appGuideProvider);
    final categories = guide.valueOrNull ?? const <AppGuideCategory>[];
    final searching = _query.trim().isNotEmpty;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            MediaQuery.paddingOf(context).bottom + 40,
          ),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: NexaIconSquareButton(
                icon: Icons.arrow_back_rounded,
                size: 42,
                tooltip: 'Voltar',
                onTap: () => context.pop(),
              ),
            ),
            const SizedBox(height: 22),
            const AppNewsKicker('Central de ajuda'),
            const SizedBox(height: 8),
            Semantics(
              header: true,
              child: Text(
                'Como usar o NexaGO',
                style: AppTypography.soraRegular(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.9,
                  height: 1.05,
                  color: colors.onSurface,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Guias rápidos de cada função do app.',
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: colors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: 20),
            if (categories.isNotEmpty) ...[
              _SearchField(
                controller: _search,
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: 8),
            ],
            if (guide.isLoading && categories.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else if (categories.isEmpty)
              _Message('Os guias de cada função chegam em breve.')
            else if (searching)
              ..._results(searchAppGuide(categories, _query))
            else
              for (final category in categories) ...[
                const SizedBox(height: 24),
                AppNewsKicker(category.title),
                const SizedBox(height: 12),
                for (final topic in category.topics) ...[
                  AppNewsFeatureRow(feature: topic, onTap: () => _open(topic)),
                  if (topic != category.topics.last) const SizedBox(height: 10),
                ],
              ],
          ],
        ),
      ),
    );
  }

  List<Widget> _results(List<AppGuideEntry> results) {
    if (results.isEmpty) {
      return [_Message('Nada encontrado para “${_query.trim()}”.')];
    }
    return [
      const SizedBox(height: 16),
      AppNewsKicker(results.length == 1 ? '1 guia' : '${results.length} guias'),
      const SizedBox(height: 12),
      for (final r in results) ...[
        AppNewsFeatureRow(feature: r.topic, onTap: () => _open(r.topic)),
        const SizedBox(height: 10),
      ],
    ];
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return TextField(
      key: const Key('app-guide-search'),
      controller: controller,
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      style: AppTypography.soraRegular(
        fontSize: 14.5,
        fontWeight: FontWeight.w500,
        color: colors.onSurface,
      ),
      decoration: InputDecoration(
        hintText: 'Buscar: reserva, Pix, dupla…',
        hintStyle: AppTypography.soraRegular(
          fontSize: 14.5,
          fontWeight: FontWeight.w400,
          color: colors.onSurfaceMuted,
        ),
        prefixIcon: Icon(
          Icons.search_rounded,
          size: 20,
          color: colors.onSurfaceMuted,
        ),
        suffixIcon: ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (context, value, _) => value.text.isEmpty
              ? const SizedBox.shrink()
              : IconButton(
                  tooltip: 'Limpar busca',
                  icon: Icon(
                    Icons.close_rounded,
                    size: 18,
                    color: colors.onSurfaceMuted,
                  ),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
        ),
        filled: true,
        fillColor: colors.surfaceRaised,
        contentPadding: const EdgeInsets.symmetric(vertical: 14),
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          borderSide: BorderSide(color: AppColors.brand.withValues(alpha: 0.5)),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 48),
    child: Center(
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: AppTypography.soraRegular(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    ),
  );
}
