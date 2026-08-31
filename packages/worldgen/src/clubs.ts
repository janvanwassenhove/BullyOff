/**
 * Club identities: an invented town (compound of place-name parts in the country's own morphology,
 * not a real place we know of), a club-name pattern in the country's own club culture (Koninklijke/
 * Royal in Belgium, MHC in the Netherlands, HTC/TSV in Germany, Stade/AS in France, plain town + HC
 * in England), a colour pair from a hockey-ish palette, a badge seed and a founding year. Every
 * candidate name is checked against the real-club blocklist (ADR-006); collisions are re-rolled.
 */
import type { Rng } from '@bullyoff/shared';
import { isBlocked } from './blocklist.js';
import type { RegionFlavour } from './names.js';

export type Country = 'BE' | 'NL' | 'EN' | 'FR' | 'DE';
export type ClubLang = 'nl' | 'fr' | 'en' | 'de';

// Place-name morphology — parts, not places. Combined at random; nothing below is a real club's town.
const NL_HEAD = ['Berken', 'Zavel', 'Molen', 'Kruis', 'Linde', 'Water', 'Hoog', 'Steen', 'Roos', 'Vaart', 'Ekker', 'Bos', 'Meer', 'Zilver', 'Kapel', 'Duin', 'Ravel', 'Wolven', 'Espen', 'Klaver', 'Heide', 'Zonne', 'Merel', 'Toren', 'Eiken', 'Beuken', 'Wilgen', 'Kerk', 'Brug', 'Hazen', 'Reiger', 'Valken', 'Sparren', 'Veld', 'Wolk', 'Vos', 'Kasteel', 'Nieuw', 'Oud', 'Groen', 'Wit', 'Zwart', 'Zand', 'Kiezel', 'Hof', 'Bloem', 'Schaap', 'Koe', 'Lam', 'Bever'];
const NL_TAIL = ['dael', 'berg', 'hoek', 'veld', 'hout', 'heide', 'land', 'akker', 'beke', 'zicht', 'daal', 'laan', 'stein', 'hof', 'dries', 'bos', 'broek', 'donk', 'gem', 'zele', 'beek', 'kerke', 'brugge', 'lo', 'wijk', 'dorp', 'muide', 'hove', 'voorde', 'zande'];
const FR_HEAD = ['Sart', 'Bois', 'Mont', 'Val', 'Fontaine', 'Pré', 'Champ', 'Roche', 'Haut', 'Long', 'Beau', 'Clair', 'Grand', 'Petit', 'Villers', 'Neuf', 'Vieux', 'Saint-Amand', 'Sainte-Anne', 'Chêne', 'Tilleul', 'Bruyère', 'Ruisseau', 'Étang', 'Plaine', 'Vallon', 'Colline', 'Croix', 'Mou', 'Fosse'];
const FR_TAIL = ['-le-Bois', '-Saint-Pierre', '-la-Neuve', '-les-Prés', 'court', 'ville', 'mont', 'sart', 'rieux', 'fontaine', 'champs', 'bourg', '-le-Château', 'lez-Chênes', 'val', '-sur-Vesdre', '-en-Fagne', 'aux-Roses', '-la-Forêt', 'ies', 'ies-le-Haut', 'zée', 'mal', 'lin', 'nay', 'gnies', 'sies'];
// Dutch (NL) towns lean on polder/water morphology that Flanders barely uses.
const NED_HEAD = ['Zwanen', 'Bosch', 'Rietz', 'Wester', 'Ooster', 'Noorder', 'Zuider', 'Aalder', 'Gans', 'Vecht', 'Leidse', 'Slot', 'Duiven', 'Koolwijker', 'Maarssen', 'Grebbe', 'Hollandse', 'Vinke', 'Snip', 'Ganzen', 'Weide', 'Polder', 'Dijk', 'Terp', 'Vliet', 'Gouds', 'Zeister', 'Baren', 'Soester', 'Blaric'];
const NED_TAIL = ['drecht', 'sum', 'kum', 'wijk aan Zee', 'dam', 'sloot', 'geest', 'woude', 'schans', 'meer', 'veen', 'sluis', 'waard', 'huizen', 'burg', 'stede', 'wetering', 'oord', 'gouw', 'akker'];
const EN_HEAD = ['Ash', 'Oak', 'Church', 'Mill', 'Stone', 'Wester', 'Norton', 'Elms', 'Fern', 'Haver', 'Kings', 'Queens', 'Marsh', 'Birch', 'Thorn', 'Wool', 'Chal', 'Brack', 'Whit', 'Roth', 'Hazel', 'Lark', 'Otter', 'Heron', 'Bram', 'Ald', 'Wick', 'Dun', 'Farn', 'Crow'];
const EN_TAIL = ['ford', 'worth', 'bury', 'combe', 'ham', 'leigh', 'field', 'bridge', 'wick', 'ton Magna', 'don', 'mere', 'stead', 'thorpe', 'chester', 'minster', 'bourne', 'dale', 'hurst', 'sey'];
const DE_HEAD = ['Linden', 'Birken', 'Stein', 'Grün', 'Wald', 'Hoch', 'Neu', 'Alt', 'Königs', 'Falken', 'Adler', 'Buchen', 'Eichen', 'Wiesen', 'Silber', 'Rehe', 'Habichts', 'Tannen', 'Mühl', 'Kirch', 'Schwanen', 'Rosen', 'Winter', 'Sommer', 'Nebel', 'Storch', 'Weiden', 'Erlen', 'Fuchs', 'Biber'];
const DE_TAIL = ['hausen', 'heim', 'berg an der Au', 'feld', 'dorf', 'bach', 'burg', 'stadt am Wall', 'tal', 'brück', 'ingen', 'furt', 'rode', 'see', 'au', 'kirchen', 'hagen', 'stedt', 'itz', 'ow'];

const NL_PREFIX = ['', '', '', '', 'Koninklijke ', 'K. ', 'KHC ', ''];
const NL_SUFFIX = [' HC', ' HC', ' Hockey', ' Hockey Club', ' HC', ' Hockeyclub', '', ' HC'];
const FR_PREFIX = ['', '', '', 'Royal ', 'R. ', 'Royal HC ', 'HC ', ''];
const FR_SUFFIX = [' HC', ' HC', ' Hockey Club', ' Hockey', '', ' HC', ' Club', ' HC'];
// Country club-name cultures: the Netherlands' MHC/HC prefixes, England's plain town names,
// France's Stade/AS, Germany's HTC/TSV. All patterns, no real clubs.
const NED_PREFIX = ['HC ', 'MHC ', '', '', 'HV ', 'MHC ', 'HC ', ''];
const NED_SUFFIX = ['', '', ' MHC', ' HC', '', '', '', ' Hockeyclub'];
const EN_PREFIX = ['', '', '', '', '', '', '', ''];
const EN_SUFFIX = [' HC', ' Hockey Club', ' HC', ' Hockey', ' HC', ' Hockey Club', ' HC', ' HC'];
const FRA_PREFIX = ['Stade ', '', 'HC ', 'AS ', '', 'Racing ', '', 'CA '];
const FRA_SUFFIX = ['', ' HC', '', '', ' Hockey Club', '', ' Hockey', ''];
const DE_PREFIX = ['', 'HTC ', 'TSV ', '', 'HC ', '', 'THC ', ''];
const DE_SUFFIX = [' HTC', '', '', ' HC', '', ' Hockey-Club', '', ' HTC'];
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
  lang: ClubLang;
  nickname: string | null;
  colours: [number, number];
  badge: { shape: BadgeShape; motif: BadgeMotif; split: 'halves' | 'quarters' | 'band' | 'plain' };
  founded: number;
}

/** Which town morphology and club-name culture a (country, lang) pair draws from. */
const TOWN_PARTS: Record<string, { head: readonly string[]; tail: readonly string[] }> = {
  'BE:nl': { head: NL_HEAD, tail: NL_TAIL }, 'BE:fr': { head: FR_HEAD, tail: FR_TAIL },
  'NL:nl': { head: NED_HEAD, tail: NED_TAIL }, 'EN:en': { head: EN_HEAD, tail: EN_TAIL },
  'FR:fr': { head: FR_HEAD, tail: FR_TAIL }, 'DE:de': { head: DE_HEAD, tail: DE_TAIL },
};
const NAME_PARTS: Record<string, { pre: readonly string[]; suf: readonly string[] }> = {
  'BE:nl': { pre: NL_PREFIX, suf: NL_SUFFIX }, 'BE:fr': { pre: FR_PREFIX, suf: FR_SUFFIX },
  'NL:nl': { pre: NED_PREFIX, suf: NED_SUFFIX }, 'EN:en': { pre: EN_PREFIX, suf: EN_SUFFIX },
  'FR:fr': { pre: FRA_PREFIX, suf: FRA_SUFFIX }, 'DE:de': { pre: DE_PREFIX, suf: DE_SUFFIX },
};

export function generateTown(rng: Rng, lang: ClubLang, country: Country = 'BE'): string {
  const parts = TOWN_PARTS[`${country}:${lang}`] ?? TOWN_PARTS[lang === 'fr' ? 'BE:fr' : 'BE:nl'];
  const head = parts?.head[rng.int(parts.head.length)] ?? 'Berken', tail = parts?.tail[rng.int(parts.tail.length)] ?? 'dael';
  if (country === 'BE' && lang === 'fr') {
    return tail.startsWith('-') || tail.startsWith('lez') || tail.startsWith('aux') ? `${head}${tail.startsWith('-') ? '' : '-'}${tail}` : `${head}${tail}`;
  }
  if (country === 'FR') {
    return tail.startsWith('-') || tail.startsWith('lez') || tail.startsWith('aux') ? `${head}${tail.startsWith('-') ? '' : '-'}${tail}` : `${head}${tail}`;
  }
  return `${head}${tail}`;
}

function clubNameFor(rng: Rng, town: string, lang: ClubLang, country: Country): { name: string; nickname: string | null } {
  const parts = NAME_PARTS[`${country}:${lang}`] ?? NAME_PARTS['BE:nl'];
  const pre = parts?.pre[rng.int(8)] ?? '';
  let suf = parts?.suf[rng.int(8)] ?? ' HC';
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

/**
 * Generate `n` distinct club identities for one country; every name passes the blocklist; towns and
 * short codes are unique — also against `reserved` sets when a world spans several countries, so a
 * European bracket never shows two clubs with the same three letters.
 */
export function generateClubIdentities(
  rng: Rng, n: number, flavour: RegionFlavour = 'mixed', year = 2026, country: Country = 'BE',
  reserved?: { towns: Set<string>; shorts: Set<string> },
): { clubs: ClubIdentity[]; rerolls: number } {
  const nlShare = flavour === 'vlaanderen' ? 0.85 : flavour === 'wallonie' ? 0.15 : flavour === 'bruxelles' ? 0.4 : 0.6;
  const clubs: ClubIdentity[] = [];
  const towns = reserved?.towns ?? new Set<string>(), shorts = reserved?.shorts ?? new Set<string>();
  const palette = rng.shuffle([...PALETTE]);
  let rerolls = 0;
  const langFor = (): ClubLang => (country === 'BE' ? (rng.chance(nlShare) ? 'nl' : 'fr') : country === 'NL' ? 'nl' : country === 'EN' ? 'en' : country === 'FR' ? 'fr' : 'de');
  for (let i = 0; i < n; i++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const lang = langFor();
      const town = generateTown(rng, lang, country);
      if (towns.has(town)) { rerolls++; continue; }
      const { name, nickname } = clubNameFor(rng, town, lang, country);
      if (isBlocked(name) || isBlocked(town)) { rerolls++; continue; }
      let short = shortCode(town);
      if (shorts.has(short)) { const alt = `${short.slice(0, 2)}${String.fromCharCode(65 + rng.int(26))}`; if (shorts.has(alt)) { rerolls++; continue; } short = alt; }
      towns.add(town); shorts.add(short);
      const colours = palette[i % palette.length] ?? [0xe63946, 0xffffff];
      clubs.push({
        name, short, town, lang, nickname, colours,
        badge: { shape: BADGE_SHAPES[rng.int(BADGE_SHAPES.length)] ?? 'shield', motif: BADGE_MOTIFS[rng.int(BADGE_MOTIFS.length)] ?? 'stick', split: (['halves', 'quarters', 'band', 'plain'] as const)[rng.int(4)] ?? 'plain' },
        founded: year - 20 - rng.int(100), // 1906..2006 for a 2026 world: club hockey's founding century
      });
      break;
    }
  }
  if (clubs.length < n) throw new Error(`could not generate ${n} distinct club identities (blocklist too tight?)`);
  return { clubs, rerolls };
}
