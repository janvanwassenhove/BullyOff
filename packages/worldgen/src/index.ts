/**
 * @bullyoff/worldgen — fictional world generation (Phase 8).
 *
 * Name pools weighted by nationality with separate first-name pools per gender,
 * invented towns and club identities with colours/badges/founding years, and the
 * real-club blocklist (ADR-006). `@bullyoff/season` builds Worlds from these and
 * generates twenty seasons of history with its own season loop.
 *
 * Nothing generated here may be a real person or a real club. Ever.
 */
export const PACKAGE_NAME = '@bullyoff/worldgen' as const;
export { REAL_CLUBS, normaliseName, significantTokens, isBlocked, blockedBy } from './blocklist.js';
export { FIRST_M, FIRST_W, LAST, NATIONALITY_WEIGHTS, nationalityTable, pickNationality, pickFirstName, pickLastName, generatePersonName, type Lang, type Nationality, type RegionFlavour, type GeneratedName } from './names.js';
export { PALETTE, BADGE_SHAPES, BADGE_MOTIFS, generateTown, generateClubIdentities, shortCode, type ClubIdentity, type BadgeShape, type BadgeMotif } from './clubs.js';
