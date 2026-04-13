import { environment } from '../../environments/environment';

export type AuthTelemetryEvent = 'login_attempt' | 'login_success' | 'login_error';

/** Hook simples para futuro analytics (GA4, etc.). Em dev, loga no console. */
export function trackAuthEvent(
  event: AuthTelemetryEvent,
  detail?: Record<string, unknown>,
): void {
  if (!environment.production && typeof console !== 'undefined' && console.debug) {
    console.debug('[nexago-auth]', event, detail ?? {});
  }
}
