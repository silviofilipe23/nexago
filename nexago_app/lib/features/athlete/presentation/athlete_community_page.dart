import 'package:flutter/material.dart';

class AthleteCommunityPage extends StatelessWidget {
  const AthleteCommunityPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Comunidade em breve',
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
