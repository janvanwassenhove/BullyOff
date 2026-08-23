/**
 * A video that explains the situation, for the rules where one exists. Every entry was checked
 * against YouTube's oEmbed endpoint on 2026-08-23: the id resolves, and the title and channel below
 * are the ones YouTube returned. They are other people's videos, so the titles are not translated
 * and nothing is embedded — the rulebook shows a link that opens YouTube in a new tab, and the app
 * makes no third-party request until someone clicks it.
 */
import type { RuleKey } from '@bullyoff/insight';

export interface RuleVideo { id: string; title: string; channel: string }

const CHANNEL = 'Field Hockey Umpiring | FHumpires';

const VIDEOS: Partial<Record<RuleKey, RuleVideo>> = {
  'rules.feet': { id: 'rmfxvn0D1Bg', title: 'Foot! | How to Apply the Rules of Hockey | #RuleyTuesday Ep. 22', channel: CHANNEL },
  'rules.dangerous': { id: 'rWchGXXbUh0', title: 'Raising the Ball | How to Apply the Rules of Hockey | #RuleyTuesday Ep. 26i', channel: CHANNEL },
  'rules.backStick': { id: 'G80pBs_6CW8', title: 'Using the Back Stick | How to Apply the Rules of Hockey | RuleyTuesday Ep. 20', channel: CHANNEL },
  'rules.obstruction': { id: 'WREJpm9gspA', title: 'Trapping Obstruction | How to Apply the Rules of Hockey | #RuleyTuesday Ep. 24i', channel: CHANNEL },
  'rules.stickTackle': { id: 'ITznAWDjxwc', title: 'Hockey Rules and Interpretations | Stick Tackle vs Stick Block | #FeatureFriday', channel: CHANNEL },
  'rules.pcFirstHit': { id: 'a6SCCAprh6s', title: 'Goal or No Goal? The Penalty Corner Height Call That Stumped Everyone', channel: CHANNEL },
  'rules.stroke': { id: 'K7msl2cabPM', title: 'CONTROVERSIAL Field Hockey Penalty Stroke: Umpire Analysis & Rule Breakdown', channel: CHANNEL },
  'rules.cards': { id: '_ZngIDZie_c', title: 'Hockey Umpiring Skills | Green Cards and Progressive Penalties', channel: CHANNEL },
  'rules.aerial': { id: '4sp7ns5L4E4', title: 'Master Aerial Ball Decision Making: No Clear Receiver Breakdown', channel: CHANNEL },
};

export const ruleVideo = (key: RuleKey): RuleVideo | null => VIDEOS[key] ?? null;
export const videoUrl = (v: RuleVideo): string => `https://www.youtube.com/watch?v=${v.id}`;
