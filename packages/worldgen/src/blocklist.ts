/**
 * Real-club blocklist (ADR-006, BRIEF C3). A generated club name may not collide with any
 * real club here — compared token-wise after normalisation (lower-case, diacritics folded,
 * punctuation stripped, generic hockey words ignored). Kept deliberately broad: Belgian clubs of
 * every division we know of, the Dutch/German/Spanish/French/British/Irish top flights, and the
 * towns those clubs are named after, so a generated "Waterloo HC" is refused even though the
 * generator never emits real town names on purpose.
 *
 * Maintained by hand; add, never remove. No person names live here (ADR-006: no list of people).
 */
export const REAL_CLUBS: readonly string[] = [
  // Belgium — men's/women's top divisions and below (club identities and their towns)
  'Royal Antwerp', 'Antwerp', 'Beerschot', 'Braxgata', 'Boom', 'Dragons', 'Brasschaat', 'Gantoise', 'Gent', 'Ghent', 'Herakles', 'Lier',
  'Léopold', 'Leopold', 'Uccle', 'Ukkel', 'Orée', 'Oree', 'Racing', 'Watermael', 'Waterloo Ducks', 'Waterloo', 'Leuven', 'Louvain', 'Victory',
  'Edegem', 'Daring', 'Tervuren', 'Namur', 'Namen', 'Wellington', 'White Star', 'Evere', 'Mechelse', 'Mechelen', 'Malines', 'Pingouin', 'Nivelles',
  'Old Club', 'Lara', 'Stix', 'Zwijndrecht', 'Rasante', 'Sint-Niklaas', 'Amicale', 'Anderlecht', 'Louvain-la-Neuve', 'Ombrage', 'Embourg',
  'Baudouin', 'Parc', 'Polo Club', 'Zwarte Leeuw', 'Wavre', 'Wezembeek', 'Rapide', 'Merksem', 'Inter Mol', 'Mol', 'Hasselt', 'Genk', 'Liège', 'Liege', 'Luik',
  'Tournai', 'Doornik', 'La Louvière', 'Mons', 'Bergen', 'Charleroi', 'Kortrijk', 'Courtrai', 'Brugge', 'Bruges', 'Oostende', 'Ostende', 'Knokke', 'Roeselare',
  'Aalst', 'Dendermonde', 'Lokeren', 'Waregem', 'Ieper', 'Yper', 'Turnhout', 'Geel', 'Herentals', 'Hoboken', 'Kontich', 'Mortsel', 'Schoten', 'Kapellen',
  'Wilrijk', 'Berchem', 'Deurne', 'Ekeren', 'Lommel', 'Pelt', 'Tongeren', 'Sint-Truiden', 'Diest', 'Tienen', 'Aarschot', 'Heverlee', 'Overijse', 'Zaventem',
  'Vilvoorde', 'Grimbergen', 'Halle', 'Braine', 'Ottignies', 'Gembloux', 'Arlon', 'Bastogne', 'Libramont', 'Dinant', 'Huy', 'Verviers', 'Spa', 'Eupen',
  'Brussels', 'Bruxelles', 'Brussel', 'Ixelles', 'Elsene', 'Etterbeek', 'Schaerbeek', 'Woluwe', 'Auderghem', 'Oudergem', 'Forest', 'Vorst', 'Jette',
  'Laeken', 'Laken', 'Boitsfort', 'Bosvoorde', 'Kraainem', 'Linkebeek', 'Rhode', 'Rode', 'Lasne', 'Genval', 'Rixensart', 'Limal', 'Wezembeek-Oppem',
  'Hockey Club Leuven', 'KHC Leuven', 'KHC Dragons', 'Royal Daring', 'Royal Léopold Club', 'Royal Racing Club', 'Royal Uccle Sport', 'Royal Wellington',
  'Royal Orée', 'Royal Victory', 'Royal Pingouin', 'Royal Evere White Star', 'Royal Beerschot', 'Royal Antwerp Hockey Club', 'Royal Herakles',
  'La Gantoise', 'Gantoise HC', 'Waterloo Ducks HC', 'WatDucks', 'Namur HC', 'Lara HC', 'Stix HC', 'Rasante HC', 'Old Club de Liège',
  'Keerbergen', 'Zemst', 'Bonheiden', 'Hockey Club Hasselt', 'Phoenix', 'Uccle Sport', 'Ucclois', 'Leuven Hockey', 'Lara Hockey', 'Club Namurois', 'Namur Hockey',
  // Netherlands
  'Amsterdam', 'Amsterdamsche', 'Bloemendaal', 'Kampong', 'Den Bosch', "'s-Hertogenbosch", 'Rotterdam', 'Oranje-Rood', 'Oranje Rood', 'Pinoké', 'Pinoke',
  'Klein Zwitserland', 'HGC', 'Tilburg', 'Hurley', 'SCHC', 'Laren', 'Nijmegen', 'Almere', 'Voordaan', 'Schaerweijde', 'HDM', 'Push', 'Breda', 'Eindhoven',
  'Huizen', 'Leiden', 'Groningen', 'Hattem', 'Wageningen', 'Hilversum', 'Gooische', 'Were Di', 'Victoria', 'Leonidas', 'Zwolle', 'Utrecht', 'Haarlem',
  'Delft', 'Alkmaar', 'Amersfoort', 'Apeldoorn', 'Arnhem', 'Upward', 'Union', 'Qui Vive', 'Strawberries', 'Shinty', 'Cartouche', 'Rood-Wit', 'Roomburg',
  // Germany
  'Rot-Weiss Köln', 'Rot-Weiss', 'Köln', 'Koln', 'Uhlenhorst', 'Mülheim', 'Mulheim', 'Harvestehuder', 'Harvestehude', 'Alster', 'Mannheimer', 'Mannheim',
  'Crefelder', 'Krefeld', 'Berliner', 'Berlin', 'Düsseldorfer', 'Düsseldorf', 'Dusseldorf', 'Hamburger', 'Hamburg', 'Nürnberger', 'Nürnberg', 'Münchner', 'München',
  'Munich', 'Blau-Weiss', 'Limburger', 'Limburg', 'Hannover', 'Bremen', 'Bremer', 'Raffelberg', 'Gladbacher', 'Gladbach', 'Polo Club Hamburg', 'Großflottbeker',
  'Stuttgarter Kickers', 'Stuttgart', 'Frankfurter', 'Frankfurt', 'Wiesbadener', 'Wiesbaden', 'Dürkheimer', 'Leipzig', 'Zehlendorfer', 'Zehlendorf', 'Schwarz-Weiss',
  // Spain
  'Club de Campo', 'Real Club de Polo', 'Polo Barcelona', 'Atlètic Terrassa', 'Atletic Terrassa', 'Terrassa', 'Egara', 'Junior', 'Complutense', 'Sanse',
  'San Sebastián', 'Real Sociedad', 'Tenis', 'Valencia', 'Giner de los Ríos', 'Jolaseta', 'Madrid', 'Barcelona', 'Vallès', 'Line Up', 'Pozuelo',
  // France, UK, Ireland, Italy, elsewhere in Europe
  'Racing Club de France', 'Saint-Germain', 'Lille', 'Cambrai', 'Montrouge', 'Stade Français', 'Lyon', 'Douai', 'Wattignies', 'Lambersart', 'Marcq', 'Paris',
  'Surbiton', 'Wimbledon', 'Hampstead', 'Westminster', 'Holcombe', 'East Grinstead', 'Reading', 'Beeston', 'Old Georgians', 'Brooklands', 'Loughborough',
  'Canterbury', 'Clifton', 'Robinsons', 'Durham', 'Sevenoaks', 'Teddington', 'Oxted', 'Cannock', 'Bowdon', 'Hightown', 'Slough', 'Buckingham',
  'Grange', 'Edinburgh', 'Glasgow', 'Western Wildcats', 'Kelburne', 'Inverleith', 'Cardiff', 'Swansea', 'Whitchurch',
  'Lisnagarvey', 'Banbridge', 'Monkstown', 'Pembroke', 'Three Rock Rovers', 'Glenanne', 'Railway Union', 'Loreto', 'Cork', 'Annadale', 'Cookstown', 'Instonians',
  'Bra', 'Bonomi', 'Cernusco', 'Tevere', 'Amsicora', 'Cagliari', 'Roma', 'Butterfly',
  'Dinamo Kazan', 'Kazan', 'Dinamo Elektrostal', 'Minsk', 'Stroitel', 'Grunwald', 'Poznań', 'Poznan', 'Wrocław', 'Gdańsk', 'Pomorzanin', 'Slavia Praha', 'Praha', 'Bohemians',
  'Wien', 'Vienna', 'Post SV', 'AHTC', 'Arminen', 'Rotweiss Wettingen', 'Wettingen', 'Servette', 'Lausanne', 'Luzern', 'Zürich', 'Zurich', 'Grasshopper', 'Olten',
  'Lisboa', 'Lousada', 'Casa Pia', 'Benfica', 'Sporting', 'Porto', 'Oeiras',
];

const GENERIC = new Set(['hc', 'hockey', 'club', 'royal', 'koninklijke', 'khc', 'rhc', 'kon', 'de', 'la', 'le', 'les', 'het', 'van', 'der', 'den', 'du', 'des', 'sv', 'sc', 'hv', 'mhc', 'hcr', 'athletic', 'sport', 'sports', 'united', 'old', 'new', 'saint', 'sint', 'st', 'and', 'en', 'et', 'rc', 'fc', 'cc', 'hockeyclub']);

// Unicode combining diacritical marks block (U+0300–U+036F), built without a literal so no tool mangles it.
const COMBINING = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Lower-case, diacritics folded, punctuation → space, split into tokens. */
export function normaliseName(s: string): string[] {
  const folded = s.normalize('NFD').replace(COMBINING, '').toLowerCase();
  return folded.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 0);
}

/** Significant tokens of a name: length ≥ 3 and not a generic hockey/club word. */
export const significantTokens = (s: string): string[] => normaliseName(s).filter((t) => t.length >= 3 && !GENERIC.has(t));

let index: Set<string> | null = null;
function blockedTokens(): Set<string> {
  if (index) return index;
  index = new Set<string>();
  for (const c of REAL_CLUBS) for (const t of significantTokens(c)) index.add(t);
  // also the joined form of multi-token entries (e.g. "waterloo ducks") and each entry whole
  for (const c of REAL_CLUBS) { const j = normaliseName(c).join(''); if (j.length >= 4) index.add(j); }
  return index;
}

/**
 * Is this generated club name too close to a real club? True when any significant token of the
 * candidate is a blocked token, or the candidate's joined form contains a blocked multi-token entry
 * or a blocked token of ≥ 5 letters as a substring ("Kampongveld" is still Kampong).
 */
export function isBlocked(candidate: string): boolean {
  const toks = significantTokens(candidate);
  const idx = blockedTokens();
  for (const t of toks) if (idx.has(t)) return true;
  const joined = normaliseName(candidate).join('');
  for (const b of idx) if (b.length >= 5 && joined.includes(b)) return true;
  return false;
}

/** Why a candidate was blocked (for tests and the generator's log). */
export function blockedBy(candidate: string): string | null {
  const toks = significantTokens(candidate);
  const idx = blockedTokens();
  for (const t of toks) if (idx.has(t)) return t;
  const joined = normaliseName(candidate).join('');
  for (const b of idx) if (b.length >= 5 && joined.includes(b)) return b;
  return null;
}
