import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/post_login_destination.dart';
import '../../../../core/ui/fade_slide_in.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../domain/post_login_bootstrap.dart';
import 'widgets/auth_loading/auth_loading_flame_background.dart';
import 'widgets/auth_loading/auth_loading_hero.dart';
import 'widgets/auth_loading/auth_loading_sparks.dart';
import 'widgets/auth_loading/auth_loading_progress_bar.dart';
import 'widgets/auth_loading/auth_loading_status_text.dart';
import 'widgets/auth_loading/auth_loading_wordmark.dart';

/// Loading pós-login / cold start — mínimo 3s ou até bootstrap concluir.
class AuthLoadingPage extends ConsumerStatefulWidget {
  const AuthLoadingPage({super.key});

  @override
  ConsumerState<AuthLoadingPage> createState() => _AuthLoadingPageState();
}

class _AuthLoadingPageState extends ConsumerState<AuthLoadingPage> {
  double _progress = 0;
  String _bottomLabel = 'CONECTANDO';
  bool _running = false;

  static const _completeFillDelay = Duration(milliseconds: 950);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _startBootstrap());
  }

  Future<void> _startBootstrap() async {
    if (_running) return;
    _running = true;

    final result = await ref.read(runPostLoginBootstrapProvider)(
      onProgress: (_, label) {
        if (!mounted) return;
        setState(() {
          if (label.trim().isNotEmpty) {
            _bottomLabel = label;
          }
        });
      },
    );

    if (!mounted) return;

    if (result.errorMessage != null) {
      showAppSnackBar(context, result.errorMessage!, isError: !result.success);
    }

    if (!result.success) {
      _running = false;
      return;
    }

    setState(() {
      _progress = 1;
      _bottomLabel = 'TUDO PRONTO · BORA JOGAR';
    });

    await Future<void>.delayed(_completeFillDelay);
    if (!mounted) return;

    ref.read(sessionBootstrapProvider.notifier).markComplete();
    final destination = await ref.read(resolvePostLoginDestinationProvider)();
    if (!mounted) return;

    HapticFeedback.lightImpact();
    context.go(destination);
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: Stack(
          children: [
            const Positioned.fill(child: AuthLoadingFlameBackground()),
            const Positioned.fill(child: AuthLoadingSparks()),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(40, 28, 40, 40),
                child: Column(
                  children: [
                    const Spacer(flex: 2),
                    staggeredFadeSlide(
                      index: 0,
                      staggerMs: 70,
                      offsetY: 20,
                      child: const AuthLoadingHero(),
                    ),
                    const SizedBox(height: 40),
                    staggeredFadeSlide(
                      index: 1,
                      staggerMs: 70,
                      offsetY: 16,
                      child: const AuthLoadingWordmark(),
                    ),
                    const SizedBox(height: 18),
                    staggeredFadeSlide(
                      index: 2,
                      staggerMs: 70,
                      offsetY: 12,
                      child: const AuthLoadingStatusText(),
                    ),
                    const Spacer(flex: 3),
                    staggeredFadeSlide(
                      index: 3,
                      staggerMs: 70,
                      offsetY: 10,
                      child: AuthLoadingProgressBar(
                        progress: _progress,
                        leftLabel: _bottomLabel,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
