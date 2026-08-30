export function rewriteNoVncUrl(
  originalUrl: string,
  dashboardUrl?: string,
): string {
  try {
    const consoleUrl = new URL(originalUrl);
    if (
      !consoleUrl.pathname.endsWith('/vnc_lite.html') &&
      !consoleUrl.pathname.endsWith('/vnc.html')
    ) {
      return originalUrl;
    }

    consoleUrl.pathname = consoleUrl.pathname.replace(
      /(vnc_lite|vnc)\.html$/,
      'sunrise.html',
    );

    if (dashboardUrl) {
      try {
        const dashboard = new URL(dashboardUrl);
        if (dashboard.protocol === 'http:' || dashboard.protocol === 'https:') {
          consoleUrl.searchParams.set('parentOrigin', dashboard.origin);
        }
      } catch {
        // The custom page remains usable even when the optional bridge origin
        // is unavailable. Ctrl+Alt+Del stays disabled in that configuration.
      }
    }

    return consoleUrl.toString();
  } catch {
    return originalUrl;
  }
}
