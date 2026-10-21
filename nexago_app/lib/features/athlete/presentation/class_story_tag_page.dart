import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/brand/nexa_hashtag.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arenas/presentation/widgets/booking_story/booking_story_card.dart';
import '../../arenas/presentation/widgets/booking_story/booking_story_editor.dart';
import '../data/class_story_tag_repository.dart';
import '../domain/agenda/class_story_tag.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_profile_providers.dart';
import 'widgets/agenda/class_story_card.dart';

/// G3 · O professor postou o story do treino e marcou o aluno: o card já sai
/// com o @ do aluno, e "Repostar no meu story" manda o PNG 1080×1920 pela
/// folha nativa (mesma captura do editor). Abre pelo push/inbox
/// (`/story-do-treino/{tagId}`).
class ClassStoryTagPage extends ConsumerStatefulWidget {
  const ClassStoryTagPage({super.key, required this.tagId});

  final String tagId;

  /// Prévia em 0,62× da base 360×640, como no protótipo.
  static const double previewScale = 0.62;

  @override
  ConsumerState<ClassStoryTagPage> createState() => _ClassStoryTagPageState();
}

class _ClassStoryTagPageState extends ConsumerState<ClassStoryTagPage>
    with BookingStoryEditorMixin {
  void _close() => popOrGo(context, AppRoutes.home);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(classStoryTagProvider(widget.tagId));
    final tag = async.valueOrNull;

    final Widget body;
    if (tag != null) {
      body = _body(context, tag);
    } else if (async.isLoading) {
      body = const Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      );
    } else {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            async.hasError
                ? 'Não foi possível abrir o story agora.'
                : 'Este story não está mais disponível.',
            key: const Key('class-story-tag-missing'),
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Column(
          children: [
            Text(
              'Você está no story',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
            ),
            if (tag != null && tag.teacherName.isNotEmpty)
              Text(
                'PROF. ${tag.teacherName.toUpperCase()}',
                style: AppTypography.mono(
                  fontSize: 10,
                  letterSpacing: 1.2,
                  color: colors.onSurfaceMuted,
                ),
              ),
          ],
        ),
      ),
      body: body,
    );
  }

  Widget _body(BuildContext context, ClassStoryTag tag) {
    final colors = context.themeColors;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final data = taggedClassStoryData(
      tag: tag,
      athleteName:
          profile == null ? '' : athleteDisplayName(profile, fallback: ''),
      athleteNickname: profile?.nickname,
    );
    final teacher =
        tag.teacherFirstName.isEmpty ? 'Seu professor' : tag.teacherFirstName;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            children: [
              Center(
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.5),
                        blurRadius: 40,
                        offset: const Offset(0, 18),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: SizedBox.fromSize(
                      size: BookingStoryCard.size *
                          ClassStoryTagPage.previewScale,
                      child: FittedBox(
                        child: RepaintBoundary(
                          key: storyCardKey,
                          child: ClassStoryCard(
                            data: data,
                            theme: storyTheme,
                            infos: tag.infos,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                '$teacher postou o treino e marcou você. Reposte no seu '
                'story — o card já sai com o seu nome.',
                key: const Key('class-story-tag-message'),
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  height: 1.5,
                  color: colors.onSurface.withValues(alpha: 0.72),
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 54,
                  child: FilledButton(
                    key: const Key('class-story-tag-repost'),
                    onPressed: storyBusy
                        ? null
                        : () => shareStory(
                              caption: withNexaHashtag(
                                'Treino pago${tag.arenaName.isEmpty ? '' : ' na ${tag.arenaName}'}!',
                              ),
                              fileName: 'nexago_treino.png',
                            ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: const Color(0xFF0A0A0A),
                      disabledBackgroundColor:
                          AppColors.brand.withValues(alpha: 0.5),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: storyBusy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Color(0xFF0A0A0A),
                            ),
                          )
                        : Text(
                            'Repostar no meu story',
                            style: AppTypography.soraRegular(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 6),
                TextButton(
                  key: const Key('class-story-tag-dismiss'),
                  onPressed: _close,
                  style: TextButton.styleFrom(
                    foregroundColor: colors.onSurface.withValues(alpha: 0.72),
                    minimumSize: const Size.fromHeight(46),
                  ),
                  child: Text(
                    'Agora não',
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
