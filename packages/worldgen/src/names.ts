/**
 * Name pools (ADR-006): nationality-weighted, separate first-name pools per gender, shared
 * surname pools per nationality. Common given names and surnames only — nothing here identifies
 * a person; the combination is generated. Belgian names split into Dutch- and French-speaking
 * pools; the region flavour decides the mix.
 */
import type { Rng } from '@bullyoff/shared';

export type Lang = 'nl' | 'fr' | 'en' | 'de' | 'es' | 'it' | 'in';
export type Nationality = 'BEL' | 'NED' | 'FRA' | 'GER' | 'ESP' | 'ARG' | 'GBR' | 'IRL' | 'AUS' | 'NZL' | 'IND' | 'ITA';

export const FIRST_M: Record<Lang, readonly string[]> = {
  nl: ['Arthur', 'Wout', 'Tuur', 'Seppe', 'Milan', 'Lucas', 'Louis', 'Victor', 'Noah', 'Liam', 'Mathis', 'Jules', 'Finn', 'Stan', 'Lars', 'Jonas', 'Cyriel', 'Emiel', 'Senne', 'Vic', 'Kobe', 'Brent', 'Bram', 'Ruben', 'Wannes', 'Maarten', 'Jasper', 'Thibault', 'Niels', 'Pieter', 'Joris', 'Lennert', 'Simon', 'Tom', 'Dries', 'Sander', 'Matthias', 'Jorne', 'Warre', 'Mats', 'Lowie', 'Jef', 'Ferre', 'Wolf', 'Lenn', 'Tibe', 'Rune', 'Xander', 'Lander', 'Arne'],
  fr: ['Gabriel', 'Louis', 'Arthur', 'Jules', 'Adam', 'Maxime', 'Nathan', 'Thomas', 'Antoine', 'Loïc', 'Hugo', 'Émile', 'Victor', 'Raphaël', 'Martin', 'Théo', 'Nicolas', 'Alexandre', 'Baptiste', 'Clément', 'Guillaume', 'Quentin', 'Romain', 'Simon', 'Florian', 'Benjamin', 'Tanguy', 'Aurélien', 'Corentin', 'Gaspard', 'Augustin', 'Félix', 'Léon', 'Oscar', 'Sacha', 'Noé', 'Timéo', 'Matéo', 'Cédric', 'Sébastien', 'Amaury', 'Tristan', 'Arnaud', 'Grégoire', 'Gauthier', 'Cyril', 'Loris', 'Maxence', 'Evan', 'Elliot'],
  en: ['Oliver', 'Jack', 'Harry', 'George', 'Charlie', 'Oscar', 'Alfie', 'Thomas', 'James', 'William', 'Henry', 'Edward', 'Sam', 'Ben', 'Tom', 'Will', 'Jamie', 'Ollie', 'Freddie', 'Archie', 'Ethan', 'Callum', 'Rory', 'Conor', 'Liam', 'Sean', 'Patrick', 'Finn', 'Rhys', 'Lachlan', 'Hamish', 'Angus'],
  de: ['Maximilian', 'Paul', 'Leon', 'Felix', 'Lukas', 'Jonas', 'Elias', 'Moritz', 'Niklas', 'Tim', 'Jan', 'Florian', 'Philipp', 'Tobias', 'Christopher', 'Mats', 'Linus', 'Timo', 'Benedikt', 'Constantin', 'Teo', 'Julius', 'Malte', 'Hannes', 'Jannik'],
  es: ['Pablo', 'Álvaro', 'Marc', 'Pau', 'Pol', 'Jordi', 'Xavi', 'Sergi', 'Enrique', 'José', 'Diego', 'Ignacio', 'Quico', 'Roc', 'Borja', 'Álex', 'Gonzalo', 'Joaquín', 'Nicolás', 'Lucas', 'Tomás', 'Agustín', 'Santiago', 'Matías', 'Facundo', 'Juan', 'Martín', 'Lautaro', 'Thiago'],
  it: ['Luca', 'Matteo', 'Lorenzo', 'Tommaso', 'Alessandro', 'Francesco', 'Andrea', 'Marco', 'Davide', 'Riccardo', 'Giulio', 'Pietro', 'Edoardo', 'Filippo'],
  in: ['Arjun', 'Rohan', 'Aryan', 'Karan', 'Manpreet', 'Harman', 'Vivek', 'Rahul', 'Sunil', 'Akash', 'Nikhil', 'Varun', 'Jaspreet', 'Simran'],
};

export const FIRST_W: Record<Lang, readonly string[]> = {
  nl: ['Emma', 'Louise', 'Olivia', 'Lotte', 'Nora', 'Elise', 'Fien', 'Julie', 'Anna', 'Lena', 'Amber', 'Hanne', 'Lore', 'Sarah', 'Ella', 'Marie', 'Lize', 'Febe', 'Noor', 'Elena', 'Mila', 'Lina', 'Nina', 'Kato', 'Jade', 'Lisa', 'Axelle', 'Laura', 'Charlotte', 'Margot', 'Fleur', 'Jana', 'Britt', 'Tess', 'Kaat', 'Renée', 'Roos', 'Paulien', 'Helena', 'Liv', 'Janne', 'Babette', 'Fenna', 'Lotte-Marie', 'Ines', 'Aline', 'Emilie', 'Celine', 'Silke', 'Merel'],
  fr: ['Emma', 'Louise', 'Alice', 'Juliette', 'Marie', 'Charlotte', 'Camille', 'Ambre', 'Margaux', 'Justine', 'Léa', 'Chloé', 'Manon', 'Inès', 'Jade', 'Clara', 'Eva', 'Zoé', 'Lou', 'Elise', 'Victoria', 'Pauline', 'Mathilde', 'Océane', 'Anaïs', 'Lucie', 'Sophie', 'Céline', 'Aurélie', 'Delphine', 'Florence', 'Constance', 'Valentine', 'Apolline', 'Capucine', 'Ophélie', 'Alix', 'Romane', 'Agathe', 'Jeanne', 'Margot', 'Héloïse', 'Éloïse', 'Tiphaine', 'Noémie', 'Solène', 'Astrid', 'Diane', 'Caroline', 'Élodie'],
  en: ['Olivia', 'Amelia', 'Isla', 'Ava', 'Emily', 'Sophie', 'Grace', 'Lily', 'Freya', 'Poppy', 'Charlotte', 'Alice', 'Ellie', 'Hannah', 'Lucy', 'Maisie', 'Holly', 'Phoebe', 'Molly', 'Imogen', 'Georgia', 'Tess', 'Ciara', 'Aoife', 'Niamh', 'Erin', 'Sinéad', 'Megan', 'Ruby', 'Matilda'],
  de: ['Mia', 'Hannah', 'Emilia', 'Sophia', 'Lena', 'Marie', 'Leonie', 'Lea', 'Johanna', 'Clara', 'Amelie', 'Lina', 'Paula', 'Nele', 'Charlotte', 'Pia', 'Franziska', 'Katharina', 'Theresa', 'Viktoria', 'Selin', 'Lisa', 'Anna', 'Luisa', 'Carlotta'],
  es: ['Lucía', 'María', 'Paula', 'Carla', 'Laia', 'Marta', 'Júlia', 'Berta', 'Clara', 'Alba', 'Georgina', 'Xantal', 'Carmen', 'Beatriz', 'Lola', 'Candela', 'Rocío', 'Begoña', 'Agustina', 'Delfina', 'Sofía', 'Valentina', 'Victoria', 'Julieta', 'Florencia', 'Micaela', 'Eugenia', 'Agostina', 'Pilar'],
  it: ['Giulia', 'Chiara', 'Francesca', 'Sara', 'Martina', 'Alessia', 'Sofia', 'Giorgia', 'Elena', 'Valentina', 'Beatrice', 'Aurora', 'Ginevra', 'Vittoria'],
  in: ['Rani', 'Navneet', 'Neha', 'Priya', 'Anjali', 'Deepika', 'Sushila', 'Vandana', 'Monika', 'Nisha', 'Pooja', 'Sangita', 'Udita', 'Lalita'],
};

export const LAST: Record<Lang, readonly string[]> = {
  nl: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Vermeulen', 'Van den Berg', 'De Wilde', 'Hendrickx', 'Michiels', 'Vandenbroucke', 'Coppens', 'Vervoort', 'Segers', 'Aerts', 'De Clercq', 'Van Damme', 'Pauwels', 'Verhoeven', 'Smets', 'Van Dyck', 'Wils', 'Geerts', 'Lauwers', 'De Vos', 'Cools', 'Cuypers', 'Van Acker', 'Desmet', 'Vandewalle', 'Bogaert', 'De Backer', 'Verstraeten', 'Van Hove', 'Van Gompel', 'Verlinden', 'Heymans', 'Declercq', 'Naessens', 'Dhondt', 'Vanhaverbeke', 'Bossuyt', 'Stevens', 'Verbeke', 'Van Looy', 'Van Aert', 'Dewulf', 'Bauwens', 'Maenhout', 'Hermans', 'Wuyts', 'Rombouts', 'Van Steenkiste', 'Lambrechts', 'Moons'],
  fr: ['Dubois', 'Lambert', 'Dupont', 'Martin', 'Simon', 'Laurent', 'Lemaire', 'Leroy', 'Renard', 'Bertrand', 'Dumont', 'Fontaine', 'Gérard', 'Henry', 'Petit', 'Denis', 'Lejeune', 'Thomas', 'Masson', 'Rousseau', 'Mathieu', 'Charlier', 'Collin', 'Jadot', 'Delvaux', 'Dewez', 'Pirson', 'Dethier', 'Evrard', 'Hubert', 'Jacques', 'Leclercq', 'Legrand', 'Noël', 'Wauters', 'Mathot', 'Dehon', 'Verhaegen', 'Antoine', 'Gillet', 'Remy', 'Lenoir', 'Baudouin', 'Delforge', 'Pierret', 'Rolin', 'Toussaint', 'Piron', 'Vincent', 'Dardenne'],
  en: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Wood', 'Harris', 'Martin', 'Clarke', 'Jackson', 'Murphy', 'Kelly', 'Byrne', 'Ryan', 'Walsh', 'McCarthy', 'Campbell', 'Stewart', 'Mitchell', 'Hughes'],
  de: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Huber'],
  es: ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Serrano', 'Blanco', 'Molina', 'Puig', 'Roca', 'Ferrer', 'Vila', 'Soler', 'Fernández'],
  it: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa'],
  in: ['Singh', 'Kaur', 'Sharma', 'Kumar', 'Verma', 'Gupta', 'Patel', 'Reddy', 'Yadav', 'Mishra', 'Chaudhary', 'Joshi', 'Malik', 'Rawat', 'Tirkey'],
};

/** Weighted nationality table per region flavour (Belgian club hockey: overwhelmingly Belgian, a sprinkle of Dutch/French/others). */
export const NATIONALITY_WEIGHTS: { nat: Nationality; lang: Lang; w: number }[] = [
  { nat: 'BEL', lang: 'nl', w: 52 }, { nat: 'BEL', lang: 'fr', w: 32 },
  { nat: 'NED', lang: 'nl', w: 5 }, { nat: 'FRA', lang: 'fr', w: 3 }, { nat: 'GER', lang: 'de', w: 1.5 }, { nat: 'ESP', lang: 'es', w: 1.5 }, { nat: 'ARG', lang: 'es', w: 1.5 },
  { nat: 'GBR', lang: 'en', w: 1 }, { nat: 'IRL', lang: 'en', w: 0.7 }, { nat: 'AUS', lang: 'en', w: 0.5 }, { nat: 'NZL', lang: 'en', w: 0.3 }, { nat: 'IND', lang: 'in', w: 0.5 }, { nat: 'ITA', lang: 'it', w: 0.5 },
];

export type RegionFlavour = 'mixed' | 'vlaanderen' | 'wallonie' | 'bruxelles';

/** Region flavour shifts the nl/fr mix of Belgian names; foreigners unchanged. */
export function nationalityTable(flavour: RegionFlavour): { nat: Nationality; lang: Lang; w: number }[] {
  const nlShare = flavour === 'vlaanderen' ? 0.85 : flavour === 'wallonie' ? 0.15 : flavour === 'bruxelles' ? 0.35 : 0.62;
  return NATIONALITY_WEIGHTS.map((r) => (r.nat === 'BEL' ? { ...r, w: 84 * (r.lang === 'nl' ? nlShare : 1 - nlShare) } : r));
}

export function pickNationality(rng: Rng, table: readonly { nat: Nationality; lang: Lang; w: number }[]): { nat: Nationality; lang: Lang } {
  const total = table.reduce((s, r) => s + r.w, 0);
  let x = rng.next() * total;
  for (const r of table) { x -= r.w; if (x <= 0) return { nat: r.nat, lang: r.lang }; }
  const last = table[table.length - 1];
  return last ? { nat: last.nat, lang: last.lang } : { nat: 'BEL', lang: 'nl' };
}

export function pickFirstName(rng: Rng, lang: Lang, gender: 'm' | 'w'): string {
  const pool = (gender === 'w' ? FIRST_W : FIRST_M)[lang];
  return pool[rng.int(pool.length)] ?? (gender === 'w' ? 'Lotte' : 'Arthur');
}
export function pickLastName(rng: Rng, lang: Lang): string {
  // a minority of Belgians carry a surname from the other language community
  const pool = LAST[lang];
  return pool[rng.int(pool.length)] ?? 'Peeters';
}

export interface GeneratedName { first: string; last: string; nationality: Nationality; lang: Lang }

/** A complete person name for a profile (men's/women's pools) under a region flavour. */
export function generatePersonName(rng: Rng, gender: 'm' | 'w', flavour: RegionFlavour = 'mixed'): GeneratedName {
  const { nat, lang } = pickNationality(rng, nationalityTable(flavour));
  const lastLang: Lang = nat === 'BEL' && rng.chance(0.12) ? (lang === 'nl' ? 'fr' : 'nl') : lang;
  return { first: pickFirstName(rng, lang, gender), last: pickLastName(rng, lastLang), nationality: nat, lang };
}
