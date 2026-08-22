/**
 * @bullyoff/insight — the learning layer's analyser. Pure and deterministic:
 * same log ⇒ same findings. Typed findings (keys + numbers), never rendered text.
 */
export const PACKAGE_NAME = '@bullyoff/insight' as const;
export { analyse, momentum, matchSheet, ruleFor, type Finding, type Severity, type Section, type AnalyseOptions } from './analyse.js';
export { adviseSeason, playerRead, attributeRows, RULE_KEYS, isFinding, type Advice, type RuleKey } from './season.js';
