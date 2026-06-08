import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/app_colors.dart';
import '../domain/auth_password_strength.dart';

const kNexagoLogoAsset = 'assets/images/nexago_logo.png';

/// Brilho radial laranja atrás do logo (telas de auth).
class AuthCanvasGlow extends StatelessWidget {
  const AuthCanvasGlow({super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Align(
        alignment: Alignment.topCenter,
        child: SizedBox(
          width: double.infinity,
          height: 320,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -0.35),
                radius: 0.85,
                colors: [
                  AppColors.brand.withValues(alpha: 0.28),
                  AppColors.brand.withValues(alpha: 0.06),
                  Colors.transparent,
                ],
                stops: const [0.0, 0.45, 1.0],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class AuthFieldLabel extends StatelessWidget {
  const AuthFieldLabel({
    super.key,
    required this.label,
    this.highlighted = false,
  });

  final String label;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 6),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: highlighted ? AppColors.brand : AppColors.onSurfaceMuted,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class AuthTextField extends StatelessWidget {
  const AuthTextField({
    super.key,
    required this.controller,
    required this.hintText,
    this.keyboardType,
    this.obscureText = false,
    this.textInputAction,
    this.autofillHints,
    this.errorText,
    this.onChanged,
    this.onSubmitted,
    this.suffixIcon,
    this.prefixIcon,
    this.inputFormatters,
    this.borderless = false,
    this.focusNode,
  });

  final TextEditingController controller;
  final String hintText;
  final TextInputType? keyboardType;
  final bool obscureText;
  final TextInputAction? textInputAction;
  final List<String>? autofillHints;
  final String? errorText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final Widget? suffixIcon;
  final Widget? prefixIcon;
  final List<TextInputFormatter>? inputFormatters;
  final bool borderless;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final borderSide = borderless
        ? BorderSide.none
        : BorderSide(color: AppColors.onSurfaceMuted.withValues(alpha: 0.22));
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: borderSide,
    );

    return TextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboardType,
      obscureText: obscureText,
      textInputAction: textInputAction,
      autofillHints: autofillHints,
      inputFormatters: inputFormatters,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      style: TextStyle(
        color: AppColors.onSurface,
        fontSize: 16,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.75),
          fontWeight: FontWeight.w400,
        ),
        filled: true,
        fillColor: borderless
            ? AppColors.surfaceRaised
            : AppColors.surfaceSheet,
        errorText: errorText,
        suffixIcon: suffixIcon,
        prefixIcon: prefixIcon,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: border,
        enabledBorder: border,
        focusedBorder: borderless
            ? border
            : border.copyWith(
                borderSide: BorderSide(color: AppColors.brand, width: 1.5),
              ),
        errorBorder: border.copyWith(
          borderSide: BorderSide(color: AppColors.live),
        ),
        focusedErrorBorder: border.copyWith(
          borderSide: BorderSide(color: AppColors.live, width: 1.5),
        ),
      ),
    );
  }
}

/// Indicador de passo do wizard (ex.: PASSO 1 / 5).
class AuthStepBadge extends StatelessWidget {
  const AuthStepBadge({super.key, required this.current, required this.total});

  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      child: Text(
        'PASSO $current / $total',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: AppColors.onSurfaceMuted,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

/// Botão voltar (quadrado escuro, cantos arredondados).
class AuthBackButton extends StatelessWidget {
  const AuthBackButton({super.key, this.onPressed});

  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Material(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(10),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(
              Icons.chevron_left_rounded,
              color: AppColors.onSurface,
              size: 26,
            ),
          ),
        ),
      ),
    );
  }
}

/// Linha de contexto laranja (ex.: RESET · ACESSO).
class AuthKicker extends StatelessWidget {
  const AuthKicker({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: AppColors.brand,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.4,
      ),
    );
  }
}

class AuthInfoBanner extends StatelessWidget {
  const AuthInfoBanner({
    super.key,
    required this.message,
    this.icon = Icons.info_outline_rounded,
    this.child,
  });

  final String message;
  final IconData icon;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: AppColors.brand),
            SizedBox(width: 10),
            Expanded(
              child:
                  child ??
                  Text(
                    message,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.onSurface,
                      fontWeight: FontWeight.w500,
                      height: 1.4,
                    ),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Banner de reset com destaque em laranja (ex.: 15 minutos).
class AuthResetInfoBanner extends StatelessWidget {
  const AuthResetInfoBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).textTheme.bodySmall?.copyWith(
      color: AppColors.onSurface,
      fontWeight: FontWeight.w500,
      height: 1.4,
    );
    final highlight = base?.copyWith(
      color: AppColors.brand,
      fontWeight: FontWeight.w800,
    );

    return AuthInfoBanner(
      message: '',
      child: Text.rich(
        TextSpan(
          style: base,
          children: [
            const TextSpan(text: 'Vamos mandar um link válido por '),
            TextSpan(text: '15 minutos', style: highlight),
            const TextSpan(text: '. Olha o spam se não aparecer.'),
          ],
        ),
      ),
    );
  }
}

class AuthPasswordHintBanner extends StatelessWidget {
  const AuthPasswordHintBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return const AuthInfoBanner(
      icon: Icons.lock_outline_rounded,
      message: 'Mínimo 8 caracteres com letras, números e símbolos',
    );
  }
}

/// Checkbox + termos e privacidade (cadastro).
class AuthTermsConsent extends StatelessWidget {
  const AuthTermsConsent({
    super.key,
    required this.value,
    required this.onChanged,
    required this.onTermsTap,
    required this.onPrivacyTap,
  });

  final bool value;
  final ValueChanged<bool?>? onChanged;
  final VoidCallback onTermsTap;
  final VoidCallback onPrivacyTap;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).textTheme.bodySmall?.copyWith(
      color: AppColors.onSurface,
      fontWeight: FontWeight.w500,
      height: 1.4,
    );
    final link = base?.copyWith(
      color: AppColors.brand,
      fontWeight: FontWeight.w800,
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.22),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 22,
              height: 22,
              child: Checkbox(
                value: value,
                onChanged: onChanged,
                tristate: false,
                activeColor: AppColors.brand,
                checkColor: AppColors.black,
                side: BorderSide(
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.45),
                ),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  style: base,
                  children: [
                    const TextSpan(text: 'Eu concordo com os '),
                    TextSpan(
                      text: 'Termos de uso',
                      style: link,
                      recognizer: TapGestureRecognizer()..onTap = onTermsTap,
                    ),
                    const TextSpan(text: ' e a '),
                    TextSpan(
                      text: 'Política de privacidade',
                      style: link,
                      recognizer: TapGestureRecognizer()..onTap = onPrivacyTap,
                    ),
                    const TextSpan(text: ' do NexaGO.'),
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

/// Barra de força + chips de requisitos da senha.
class AuthPasswordStrength extends StatelessWidget {
  const AuthPasswordStrength({
    super.key,
    required this.result,
    this.visible = true,
  });

  final PasswordStrengthResult result;
  final bool visible;

  Color _segmentColor(BuildContext context) {
    return switch (result.level) {
      PasswordStrengthLevel.weak => AppColors.live,
      PasswordStrengthLevel.medium => AppColors.pending,
      PasswordStrengthLevel.strong => AppColors.win,
    };
  }

  @override
  Widget build(BuildContext context) {
    if (!visible) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final activeColor = _segmentColor(context);
    final label = passwordStrengthLabel(result.level);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: List.generate(4, (i) {
            final filled = i < result.filledSegments;
            return Expanded(
              child: Padding(
                padding: EdgeInsets.only(left: i == 0 ? 0 : 4),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: SizedBox(
                    height: 4,
                    child: ColoredBox(
                      color: filled
                          ? activeColor
                          : AppColors.onSurfaceMuted.withValues(alpha: 0.25),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
        SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'FORÇA: $label',
              style: theme.textTheme.labelSmall?.copyWith(
                color: activeColor,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
              ),
            ),
            Spacer(),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _RequirementChip(label: '8+', met: result.hasMinLength),
                _RequirementChip(label: 'Aa', met: result.hasMixedCase),
                _RequirementChip(label: '0-9', met: result.hasDigit),
                _RequirementChip(label: '@#', met: result.hasSpecial),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _RequirementChip extends StatelessWidget {
  const _RequirementChip({required this.label, required this.met});

  final String label;
  final bool met;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: met
              ? AppColors.win.withValues(alpha: 0.65)
              : AppColors.onSurfaceMuted.withValues(alpha: 0.25),
        ),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: met ? AppColors.win : AppColors.onSurfaceMuted,
          fontWeight: FontWeight.w800,
          fontSize: 10,
        ),
      ),
    );
  }
}

/// Brilho verde atrás do ícone de sucesso (cadastro).
class AuthSuccessGlow extends StatelessWidget {
  const AuthSuccessGlow({super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: SizedBox(
          width: 200,
          height: 200,
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  AppColors.win.withValues(alpha: 0.42),
                  AppColors.win.withValues(alpha: 0.12),
                  Colors.transparent,
                ],
                stops: const [0.0, 0.45, 1.0],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Hero de sucesso pós-cadastro (ícone + textos).
class AuthRegisterSuccessHero extends StatelessWidget {
  const AuthRegisterSuccessHero({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 120,
          child: Stack(
            alignment: Alignment.center,
            children: [
              const AuthSuccessGlow(),
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: AppColors.win,
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.win.withValues(alpha: 0.55),
                      blurRadius: 28,
                      spreadRadius: 0,
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.check_rounded,
                  size: 52,
                  color: AppColors.black,
                  weight: 800,
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: 18),
        Text(
          'CONTA CRIADA',
          textAlign: TextAlign.center,
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.win,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.4,
          ),
        ),
        SizedBox(height: 14),
        Text(
          'Bora pra quadra.',
          textAlign: TextAlign.center,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
            letterSpacing: -0.5,
            height: 1.12,
          ),
        ),
        SizedBox(height: 10),
        Text(
          'Mas primeiro, complete seu perfil de atleta para que possamos te oferecer a melhor experiência.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppColors.onSurfaceMuted,
            height: 1.45,
          ),
        ),
      ],
    );
  }
}

/// Botão primário laranja (Continuar / Completar perfil).
class AuthContinueButton extends StatelessWidget {
  const AuthContinueButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: loading
            ? SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.black,
                ),
              )
            : Text(
                label,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.black,
                ),
              ),
      ),
    );
  }
}

class AuthSocialButton extends StatelessWidget {
  const AuthSocialButton({
    super.key,
    required this.onPressed,
    required this.icon,
    required this.label,
    this.loading = false,
    this.muted = false,
  });

  final VoidCallback? onPressed;
  final Widget icon;
  final String label;
  final bool loading;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      height: 50,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: loading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: muted
              ? AppColors.onSurfaceMuted
              : AppColors.onSurface,
          backgroundColor: AppColors.surfaceRaised,
          side: BorderSide(
            color: AppColors.onSurfaceMuted.withValues(
              alpha: muted ? 0.2 : 0.3,
            ),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: loading
            ? SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  icon,
                  SizedBox(width: 10),
                  Text(
                    label,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: muted
                          ? AppColors.onSurfaceMuted
                          : AppColors.onSurface,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class AuthGoogleGlyph extends StatelessWidget {
  const AuthGoogleGlyph({super.key, this.size = 20});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.25),
        ),
      ),
      child: Text(
        'G',
        style: TextStyle(
          color: const Color(0xFF4285F4),
          fontSize: size * 0.65,
          fontWeight: FontWeight.w800,
          height: 1,
        ),
      ),
    );
  }
}

class AuthLogo extends StatelessWidget {
  const AuthLogo({super.key, this.size = 88, this.showTagline = false});

  final double size;
  final bool showTagline;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Center(
          child: Image.asset(
            kNexagoLogoAsset,
            width: size,
            height: size,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            errorBuilder: (_, __, ___) => Container(
              width: size * 0.82,
              height: size * 0.82,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                color: AppColors.brand,
              ),
              alignment: Alignment.center,
              child: Text(
                'N',
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: AppColors.black,
                  letterSpacing: -1,
                ),
              ),
            ),
          ),
        ),
        if (showTagline) ...[
          SizedBox(height: 10),
          Text(
            'NEXAGO • BR',
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
        ],
      ],
    );
  }
}

class AuthOrDivider extends StatelessWidget {
  const AuthOrDivider({
    super.key,
    required this.color,
    this.label = 'ou',
    this.uppercaseLabel = false,
  });

  final Color color;
  final String label;
  final bool uppercaseLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Divider(color: color.withValues(alpha: 0.35), height: 1),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.onSurfaceMuted,
              fontWeight: uppercaseLabel ? FontWeight.w800 : FontWeight.w500,
              letterSpacing: uppercaseLabel ? 0.6 : 0,
            ),
          ),
        ),
        Expanded(
          child: Divider(color: color.withValues(alpha: 0.35), height: 1),
        ),
      ],
    );
  }
}

/// Link laranja (ex.: Esqueceu a senha?, Criar conta).
class AuthLinkButton extends StatelessWidget {
  const AuthLinkButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: AppColors.brand,
        padding: EdgeInsets.zero,
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: AppColors.brand,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

Widget authPasswordVisibilityIcon({
  required bool obscured,
  required VoidCallback onToggle,
}) {
  return IconButton(
    onPressed: onToggle,
    icon: Icon(
      obscured ? Icons.visibility_outlined : Icons.visibility_off_outlined,
      color: AppColors.onSurfaceMuted,
      size: 20,
    ),
  );
}
