/**
 * The scouting report a coach gets before a match, and the penalty-corner read.
 *
 * Everything here comes from what actually happened on a pitch — the opponent's played fixtures and
 * their stats — or from what a coach can see from the sideline (their system, who scores). Nothing
 * is invented, and nothing is prose: every line is an i18n key with numbers, so the manager renders
 * it in the coach's language. The counter it suggests is standard coaching against that system, and
 * it says which observation it follows from.
 */
import type { ClubId, Person, World } from '@bullyoff/season';
import type { PcVariant } from '@bullyoff/engine';

export interface ScoutLine {
  kind: 'pcThreat' | 'scoring' | 'leaky' | 'discipline' | 'system' | 'form';
  i18nKey: string;
  params: Record<string, string | number>;
  /** Loud enough to change your plan for. */
  strong: boolean;
}

export interface ScoutReport {
  club: ClubId;
  played: number;
  /** Most recent first: 'W' | 'D' | 'L'. */
  form: ('W' | 'D' | 'L')[];
  goalsFor: number;
  goalsAgainst: number;
  lines: ScoutLine[];
  /** The counter this report argues for, and the line it follows from. */
  plan: { i18nKey: string; params: Record<string, string | number>; from: ScoutLine['kind'] } | null;
}

const per = (total: number, matches: number): number => (matches > 0 ? Math.round((10 * total) / matches) / 10 : 0);

/** What a coach can tell about the opposition from the season so far. */
export function scoutOpponent(w: World, them: ClubId): ScoutReport {
  const club = w.clubs[them];
  const played = w.season.fixtures.filter((f) => f.played && f.result && (f.home === them || f.away === them));
  const recent = [...played].sort((a, b) => b.day - a.day);
  const form = recent.slice(0, 5).map((f) => {
    const r = f.result;
    if (!r) return 'D' as const;
    const ours = f.home === them ? r.home : r.away, theirs = f.home === them ? r.away : r.home;
    return ours > theirs ? ('W' as const) : ours < theirs ? ('L' as const) : ('D' as const);
  });
  let goalsFor = 0, goalsAgainst = 0, pcAwarded = 0, pcGoals = 0, fouls = 0, cards = 0, withStats = 0;
  for (const f of played) {
    const r = f.result;
    if (r) { goalsFor += f.home === them ? r.home : r.away; goalsAgainst += f.home === them ? r.away : r.home; }
    const s = f.stats;
    if (!s) continue;
    withStats++;
    const side = f.home === them ? 0 : 1;
    pcAwarded += s.pcAwarded[side]; pcGoals += s.pcGoals[side];
    fouls += s.fouls; cards += s.cards.green + s.cards.yellow + s.cards.red;
  }

  const lines: ScoutLine[] = [];
  const n = played.length;
  if (n === 0) {
    return { club: them, played: 0, form: [], goalsFor: 0, goalsAgainst: 0, lines: [{ kind: 'form', i18nKey: 'scout.unseen', params: {}, strong: false }], plan: null };
  }

  // Their system: a coach sees the shape inside ten minutes.
  if (club) {
    lines.push({ kind: 'system', i18nKey: 'scout.system', params: { formation: club.tactics.formation, press: club.tactics.press, mentality: club.tactics.mentality }, strong: false });
  }
  lines.push({ kind: 'form', i18nKey: 'scout.form', params: { played: n, gf: per(goalsFor, n), ga: per(goalsAgainst, n) }, strong: false });

  // The penalty corner: the one set piece that decides amateur matches.
  if (withStats > 0) {
    const pcPer = per(pcAwarded, withStats);
    const share = pcAwarded > 0 ? Math.round((100 * pcGoals) / pcAwarded) : 0;
    lines.push({ kind: 'pcThreat', i18nKey: 'scout.pc', params: { pcs: pcPer, share }, strong: pcPer >= 5 || share >= 25 });
    const foulsPer = per(fouls, withStats);
    lines.push({ kind: 'discipline', i18nKey: 'scout.discipline', params: { fouls: foulsPer, cards }, strong: foulsPer >= 22 });
  }

  // Who hurts you: their top scorer this season.
  const squad = Object.values(w.persons).filter((p): p is Person => p.club === them && !p.youth);
  const top = [...squad].sort((a, b) => b.goals - a.goals)[0];
  if (top && top.goals > 0) {
    lines.push({ kind: 'scoring', i18nKey: 'scout.dangerMan', params: { name: `${top.first} ${top.last}`, role: top.role, goals: top.goals }, strong: top.goals >= Math.max(3, n) });
  }
  if (per(goalsAgainst, n) >= 3) lines.push({ kind: 'leaky', i18nKey: 'scout.leaky', params: { ga: per(goalsAgainst, n) }, strong: true });

  return { club: them, played: n, form, goalsFor, goalsAgainst, lines, plan: planAgainst(club?.tactics.press, lines) };
}

/**
 * The counter. Standard coaching, not invention: you go over a full-court press rather than through
 * it, you need patience and width against a deep block, and against a side that lives off corners
 * the first job is to stop giving them away.
 */
function planAgainst(press: string | undefined, lines: readonly ScoutLine[]): ScoutReport['plan'] {
  const pc = lines.find((l) => l.kind === 'pcThreat');
  if (pc?.strong) return { i18nKey: 'scout.plan.disciplineInD', params: {}, from: 'pcThreat' };
  const leaky = lines.find((l) => l.kind === 'leaky');
  if (leaky) return { i18nKey: 'scout.plan.attackEarly', params: {}, from: 'leaky' };
  if (press === 'full') return { i18nKey: 'scout.plan.overTheTop', params: {}, from: 'system' };
  if (press === 'zone') return { i18nKey: 'scout.plan.patientWide', params: {}, from: 'system' };
  if (press === 'split') return { i18nKey: 'scout.plan.switchSides', params: {}, from: 'system' };
  return null;
}

// ── the penalty-corner read ───────────────────────────────────────────────────

export interface PcCandidate {
  variant: PcVariant;
  /** The best man on the pitch for it, and how good he is at it (0–100). */
  playerId: number | null;
  name: string;
  rating: number;
}

interface PcPlayer { id: number; name: string; attrs: { technical: { dragFlick: number; hit: number; elimination: number; push: number; skills3d: number; firstTouch: number } } }

const pct = (v: number): number => Math.round((v / 20) * 100);

/**
 * Which corner routine the men on the pitch can actually play, best first. A drag flick needs a
 * flicker, a low hit needs someone who can strike it flat and hard, a slip needs a runner who can
 * beat the first man, a deflection needs hands. The engine plays the variant you pick; this is the
 * coach's read of who is out there to play it.
 */
export function pcCandidates(onPitch: readonly PcPlayer[]): PcCandidate[] {
  const best = (score: (p: PcPlayer) => number): { id: number | null; name: string; rating: number } => {
    let top: PcPlayer | null = null, val = -1;
    for (const p of onPitch) { const s = score(p); if (s > val) { val = s; top = p; } }
    // nobody on the pitch: name nobody rather than rate a ghost
    return top ? { id: top.id, name: top.name, rating: pct(val) } : { id: null, name: '', rating: 0 };
  };
  const t = (p: PcPlayer): PcPlayer['attrs']['technical'] => p.attrs.technical;
  const rows: { variant: PcVariant; pick: ReturnType<typeof best> }[] = [
    { variant: 'dragFlick', pick: best((p) => t(p).dragFlick) },
    { variant: 'lowHit', pick: best((p) => t(p).hit) },
    { variant: 'slipRight', pick: best((p) => 0.6 * t(p).elimination + 0.4 * t(p).push) },
    { variant: 'slipLeft', pick: best((p) => 0.6 * t(p).elimination + 0.4 * t(p).push) },
    { variant: 'deflection', pick: best((p) => 0.6 * t(p).skills3d + 0.4 * t(p).firstTouch) },
  ];
  return rows
    .map((r) => ({ variant: r.variant, playerId: r.pick.id, name: r.pick.name, rating: r.pick.rating }))
    .sort((a, b) => b.rating - a.rating || a.variant.localeCompare(b.variant));
}
