import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/realtime_client.dart';
import '../l10n.dart';

/// A thin strip that explains the realtime connection in plain words:
/// connecting, reconnecting, lost (with "Retry now"), and a short "Connected"
/// after recovering. Hidden while everything is fine.
class ConnectionBanner extends StatefulWidget {
  const ConnectionBanner({super.key});

  /// A first connection that succeeds this fast never shows a banner.
  static const connectingGrace = Duration(milliseconds: 800);
  static const connectedFor = Duration(seconds: 2);

  @override
  State<ConnectionBanner> createState() => _ConnectionBannerState();
}

class _ConnectionBannerState extends State<ConnectionBanner> {
  late final RealtimeClient _realtime;
  late ConnectionPhase _phase;
  bool _showRecovered = false;
  bool _graceOver = false;
  Timer? _recoveredTimer;
  Timer? _graceTimer;

  @override
  void initState() {
    super.initState();
    _realtime = context.read<RealtimeClient>()..addListener(_onChanged);
    _phase = _realtime.phase;
    _graceTimer = Timer(ConnectionBanner.connectingGrace, () => setState(() => _graceOver = true));
  }

  void _onChanged() {
    final next = _realtime.phase;
    if (next == _phase) return;
    final recovered =
        next == ConnectionPhase.connected && (_phase == ConnectionPhase.reconnecting || _phase == ConnectionPhase.lost);
    _recoveredTimer?.cancel();
    setState(() {
      _phase = next;
      _showRecovered = recovered;
    });
    if (recovered) {
      _recoveredTimer = Timer(ConnectionBanner.connectedFor, () => setState(() => _showRecovered = false));
    }
  }

  @override
  void dispose() {
    _recoveredTimer?.cancel();
    _graceTimer?.cancel();
    _realtime.removeListener(_onChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    final (String? text, IconData icon, Color background, Color foreground, bool retry) = switch (_phase) {
      ConnectionPhase.idle => (null, Icons.cloud_off, scheme.surface, scheme.onSurface, false),
      ConnectionPhase.connecting when !_graceOver => (null, Icons.sync, scheme.surface, scheme.onSurface, false),
      ConnectionPhase.connecting => (
        l.connecting,
        Icons.sync,
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
        false,
      ),
      ConnectionPhase.reconnecting => (
        l.reconnecting,
        Icons.sync,
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
        false,
      ),
      ConnectionPhase.lost => (l.connectionLost, Icons.cloud_off, scheme.errorContainer, scheme.onErrorContainer, true),
      ConnectionPhase.connected when _showRecovered => (
        l.connected,
        Icons.cloud_done_outlined,
        scheme.tertiaryContainer,
        scheme.onTertiaryContainer,
        false,
      ),
      ConnectionPhase.connected => (null, Icons.cloud_done_outlined, scheme.surface, scheme.onSurface, false),
    };

    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      alignment: AlignmentDirectional.topCenter,
      child: text == null
          ? const SizedBox(width: double.infinity)
          : Semantics(
              key: const Key('connection.banner'),
              liveRegion: true,
              container: true,
              child: Material(
                color: background,
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(16, 6, 8, 6),
                  child: Row(
                    children: [
                      Icon(icon, size: 18, color: foreground),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(text, style: TextStyle(color: foreground)),
                      ),
                      if (retry)
                        TextButton(
                          style: TextButton.styleFrom(foregroundColor: foreground),
                          onPressed: _realtime.reconnectNow,
                          child: Text(l.retryNow),
                        )
                      else
                        const SizedBox(height: 40),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}
