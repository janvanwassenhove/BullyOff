/**
 * Club identities: an invented town (compound of Flemish/Walloon place-name parts that is not a
 * real place we know of), a club-name pattern (Koninklijke/Royal prefixes, HC/Hockey suffixes,
 * the occasional nickname), a colour pair from a hockey-ish palette, a badge seed and a founding
 * year. Every candidate name is checked against the real-club blocklist (ADR-006); collisions
 * are re-rolled and counted.
 */
import type { Rng } from '@bullyoff/shared';
import { isBlocked } from './blocklist.js';
import type { RegionFlavour } from './names.js';

// Place-name morphology — parts, not places. Combined at random; nothing below is a real club's town.
const NL_HEAD = ['Berken', 'Zavel', 'Molen', 'Kruis', 'Linde', 'Water', 'Hoog', 'Steen', 'Roos', 'Vaart', 'Ekker', 'Bos', 'Meer', 'Zilver', 'Kapel', 'Duin', 'Ravel', 'Wolven', 'Espen', 'Klaver', 'Heide', 'Zonne', 'Merel', 'Toren', 'Eiken', 'Beuken', 'Wilgen', 'Kerk', 'Brug', 'Hazen', 'Reiger', 'Valken', 'Sparren', 'Veld', 'Wolk', 'Vos', 'Kasteel', 'Nieuw', 'Oud', 'Groen', 'Wit', 'Zwart', 'Zand', 'Kiezel', 'Hof', 'Bloem', 'Schaap', 'Koe', 'Lam', 'Bever'];
const NL_TAIL = ['dael', 'berg', 'hoek', 'veld', 'hout', 'heide', 'land', 'akker', 'beke', 'zicht', 'daal', 'laan', 'stein', 'hof', 'dries', 'bos', 'broek', 'donk', 'gem', 'zele', 'beek', 'kerke', 'brugge', 'lo', 'wijk', 'dorp', 'muide', 'hove', 'voorde', 'zande'];
const FR_HEAD = ['Sart', 'Bois', 'Mont', 'Val', 'Fontaine', 'Pré', 'Champ', 'Roche', 'Haut', 'Long', 'Beau', 'Clair', 'Grand', 'Petit', 'Villers', 'Neuf', 'Vieux', 'Saint-Amand', 'Sainte-Anne', 'Chêne', 'Tilleul', 'Bruyère', 'Ruisseau', 'Étang', 'Plaine', 'Vallon', 'Colline', 'Croix', 'Mou', 'Fosse'];
const FR_TAIL = ['-le-Bois', '-Saint-Pierre', '-la-Neuve', '-les-Prés', 'court', 'ville', 'mont', 'sart', 'rieux', 'fontaine', 'champs', 'bourg', '-le-Château', 'lez-Chênes', 'val', '-sur-Vesdre', '-en-Fagne', 'aux-Roses', '-la-Forêt', 'ies', 'ies-le-Haut', 'zée', 'mal', 'lin', 'nay', 'gnies', 'sies'];

const NL_PREFIX = ['', '', '', '', 'Koninklijke ', 'K. ', 'KHC ', ''];
const NL_SUFFIX = [' HC', ' HC', ' Hockey', ' Hockey Club', ' HC', ' Hockeyclub', '', ' HC'];
const FR_PREFIX = ['', '', '', 'Royal ', 'R. ', 'Royal HC ', 'HC ', ''];
const FR_SUFFIX = [' HC', ' HC', ' Hockey Club', ' Hockey', '', ' HC', ' Club', ' HC'];
const NICKNAMES = ['Foxes', 'Herons', 'Wolves', 'Hawks', 'Otters', 'Ducks', 'Stags', 'Lynx', 'Falcons', 'Owls', 'Badgers', 'Cranes', 'Ravens', 'Bears', 'Pikes', 'Swifts', 'Martens', 'Kites', 'Boars', 'Hares'];

/** Kit colour pairs (primary, secondary) — hockey-ish, distinct enough at 20 m. */
export const PALETTE: readonly [number, number][] = [
  [0xe63946, 0xffffff], [0x1d3557, 0xf1faee], [0x2a9d8f, 0xffffff], [0xf4a261, 0x264653], [0x6a0dad, 0xffd166], [0x000000, 0xffd60a], [0x0077b6, 0xffffff], [0xd00000, 0x000000],
  [0x0b6623, 0xffffff], [0xffb703, 0x023047], [0x8338ec, 0xffffff], [0xff006e, 0x000000], [0x3a86ff, 0xffbe0b], [0x9b2226, 0xe9d8a6], [0x005f73, 0xee9b00], [0x111111, 0xffffff],
  [0x2b2d42, 0xef233c], [0x386641, 0xa7c957], [0xbc6c25, 0xfefae0], [0x7209b7, 0x4cc9f0], [0x4361ee, 0xffffff], [0xc1121f, 0xfdf0d5], [0x003049, 0xf77f00], [0x588157, 0xdad7cd],
];

export const BADGE_SHAPES = ['shield', 'roundel', 'crest', 'diamond', 'pennant'] as const;
export type BadgeShape = (typeof BADGE_SHAPES)[number];
export const BADGE_MOTIFS = ['stick', 'ball', 'tower', 'tree', 'wave', 'star', 'animal', 'crown', 'lion', 'mill'] as const;
export type BadgeMotif = (typeof BADGE_MOTIFS)[number];

export interface ClubIdentity {
  name: string;
  short: string;
  town: string;
  lang: 'nl' | 'fr';
  nickname: string | null;
  colours: [number, number];
  badge: { shape: BadgeShape; motif: BadgeMotif; split: 'halves' | 'quarters' | 'band' | 'plain' };
  founded: number;
}

export function generateTown(rng: Rng, lang: 'nl' | 'fr'): string {
  if (lang === 'nl') return `${NL_HEAD[rng.int(NL_HEAD.length)] ?? 'Berken'}${NL_TAIL[rng.int(NL_TAIL.length)] ?? 'dael'}`;
  const head = FR_HEAD[rng.int(FR_HEAD.length)] ?? 'Sart', tail = FR_TAIL[rng.int(FR_TAIL.length)] ?? 'court';
  return tail.startsWith('-') || tail.startsWith('lez') || tail.startsWith('aux') ? `${head}${tail.startsWith('-') ? '' : '-'}${tail}` : `${head}${tail}`;
}

function clubNameFor(rng: Rng, town: string, lang: 'nl' | 'fr'): { name: string; nickname: string | null } {
  const pre = (lang === 'nl' ? NL_PREFIX : FR_PREFIX)[rng.int(8)] ?? '';
  let suf = (lang === 'nl' ? NL_SUFFIX : FR_SUFFIX)[rng.int(8)] ?? ' HC';
  if (pre.endsWith('HC ') && suf.includes('HC')) suf = '';
  const nickname = rng.chance(0.22) ? NICKNAMES[rng.int(NICKNAMES.length)] ?? null : null;
  let name = `${pre}${town}${suf}`.trim();
  if (suf === '' && pre === '') name = rng.chance(0.5) ? `${town} ${nickname ?? 'HC'}` : `HC ${town}`;
  if (nickname && rng.chance(0.5) && !name.includes(nickname)) name = `${name} ${nickname}`;
  return { name: name.replace(/\s+/g, ' ').trim(), nickname };
}

/** The 2–4 letter short code (table/HUD). */
export function shortCode(town: string): string {
  const letters = town.replace(/[^A-Za-zÀ-ÿ]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'CLB';
}

/** Generate `n` distinct club identities; every name passes the blocklist; towns and short codes are unique. */
export function generateClubIdentities(rng: Rng, n: number, flavour: RegionFlavour = 'mixed', year = 2026): { clubs: ClubIdentity[]; rerolls: number } {
  const nlShare = flavour === 'vlaanderen' ? 0.85 : flavour === 'wallonie' ? 0.15 : flavour === 'bruxelles' ? 0.4 : 0.6;
  const clubs: ClubIdentity[] = [];
  const towns = new Set<string>(), shorts = new Set<string>();
  const palette = rng.shuffle([...PALETTE]);
  let rerolls = 0;
  for (let i = 0; i < n; i++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const lang: 'nl' | 'fr' = rng.chance(nlShare) ? 'nl' : 'fr';
      const town = generateTown(rng, lang);
      if (towns.has(town)) { rerolls++; continue; }
      const { name, nickname } = clubNameFor(rng, town, lang);
      if (isBlocked(name) || isBlocked(town)) { rerolls++; continue; }
      let short = shortCode(town);
      if (shorts.has(short)) { const alt = `${short.slice(0, 2)}${String.fromCharCode(65 + rng.int(26))}`; if (shorts.has(alt)) { rerolls++; continue; } short = alt; }
      towns.add(town); shorts.add(short);
      const colours = palette[i % palette.length] ?? [0xe63946, 0xffffff];
      clubs.push({
        name, short, town, lang, nickname, colours,
        badge: { shape: BADGE_SHAPES[rng.int(BADGE_SHAPES.length)] ?? 'shield', motif: BADGE_MOTIFS[rng.int(BADGE_MOTIFS.length)] ?? 'stick', split: (['halves', 'quarters', 'band', 'plain'] as const)[rng.int(4)] ?? 'plain' },
        founded: year - 20 - rng.int(100), // 1906..2006 for a 2026 world: Belgian club hockey's founding century
      });
      break;
    }
  }
  if (clubs.length < n) throw new Error(`could not generate ${n} distinct club identities (blocklist too tight?)`);
  return { clubs, rerolls };
}
