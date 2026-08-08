import brandConfig from '../../brand.config.json';

// Candidate logo paths, in priority order. Only used as a blind-probe fallback for
// apps assembled by an older BFF that didn't record platform.logo_path in
// brand.config.json (see getLogoCandidates below).
export const LOGO_CANDIDATES = ['/logo.png', '/logo.jpg', '/logo.jpeg', '/logo.webp'];

/**
 * Resolves which logo paths are worth requesting. The BFF records the injected
 * logo's exact public path in brand.config.json (platform.logo_path) at deploy
 * time: a "/logo.<ext>" string when a logo ships, null when the partner set
 * none — so a logo-less app makes no logo requests at all instead of
 * 404-probing every extension. Apps assembled by an older BFF carry no
 * logo_path field (undefined): fall back to probing all LOGO_CANDIDATES, the
 * old behaviour.
 */
export function getLogoCandidates(): string[] {
    // Widened view of the JSON import: the committed brand.config.json has no
    // logo_path field (the BFF adds it at deploy time), so type it optionally.
    const platform: { name?: string; logo_path?: string | null } = brandConfig?.platform ?? {};
    if (platform.logo_path === undefined) return LOGO_CANDIDATES;
    return platform.logo_path ? [platform.logo_path] : [];
}

/**
 * Resolves the partner app name. The BFF injects NEXT_PUBLIC_DERIV_APP_NAME into
 * .env.production at deploy time (the same var the Next.js templates read); falls back
 * to brand.config.json platform.name, then a sensible default. The live App Builder
 * preview name (PREVIEW_BRANDING) is handled separately via the preview-app-name store.
 */
export function getAppName(): string {
    return process.env.NEXT_PUBLIC_DERIV_APP_NAME || brandConfig?.platform?.name || 'Deriv Bot';
}
