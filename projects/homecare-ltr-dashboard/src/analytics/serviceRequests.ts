/**
 * Services members want added to HomeCare+, found in survey comments.
 * A service mention counts only when the comment asks for it (“wish it included…”, “please add…”) or says it wasn’t
 * covered (“tankless isn’t covered”, “they couldn’t do the roof vent”), or when the comment is tagged Service-add or
 * Exclusions. Mentions of services HomeCare+ already does (e.g. “they changed the HVAC filter”) don’t count.
 */
import type { SurveyRecord, ThemeTag } from '@/domain/types';

export interface ServiceDef { id: string; label: string; re: RegExp }

/** Services outside the standard HomeCare+ visit that members ask about. Edit here to add more. */
export const SERVICES: ServiceDef[] = [
  { id: 'tankless', label: 'Tankless water heater', re: /\btankless\b/i },
  { id: 'gas-wh', label: 'Gas water heater', re: /\bgas (hot )?water heater/i },
  { id: 'roof-vent', label: 'Roof-vented dryer vent', re: /\broof(top)?[- ]?(vent(ed)?|dryer)|\b(dryer )?vent\w*\b[^.]{0,30}\broof\b/i },
  { id: 'gas-dryer', label: 'Gas dryer', re: /\bgas dryer/i },
  { id: 'high-work', label: 'Second-story / high work', re: /\b(second|2nd|upper) (story|storey|floor|level)\b|\b(1[0-9]|[2-9][0-9]) ?(ft|feet|foot)\b|\btoo high\b|\bladder\b/i },
  { id: 'gutters', label: 'Gutter cleaning', re: /\bgutters?\b/i },
  { id: 'pressure-wash', label: 'Pressure / power washing', re: /\b(pressure|power)[- ]?wash/i },
  { id: 'windows', label: 'Window cleaning', re: /\bwindows?\b[^.]{0,20}\b(clean|wash)|\b(clean|wash)\w*\b[^.]{0,20}\bwindows?\b/i },
  { id: 'lighting', label: 'Light bulbs / fixtures', re: /\b(light ?bulbs?|can lights?|recessed light\w*|light fixtures?)\b/i },
  { id: 'ceiling-fans', label: 'Ceiling fans', re: /\bceiling fans?\b/i },
  { id: 'detectors', label: 'Smoke / CO detectors & batteries', re: /\b(smoke (detector|alarm)s?|carbon monoxide|co (detector|alarm)s?|(detector|alarm) batter(y|ies)|batter(y|ies)\b[^.]{0,30}\b(detector|alarm|smoke)s?)\b/i },
  { id: 'garage-door', label: 'Garage door', re: /\bgarage doors?\b/i },
  { id: 'water-treatment', label: 'Water softener / filtration', re: /\b(water softener|whole[- ]house (water )?filter|water filtration|reverse osmosis)\b/i },
  { id: 'sump-pump', label: 'Sump pump', re: /\bsump pumps?\b/i },
  { id: 'refrigerator', label: 'Refrigerator coils / water filter', re: /\b(refrigerator|fridge)\b/i },
  { id: 'dishwasher', label: 'Dishwasher', re: /\bdishwashers?\b/i },
  { id: 'washer', label: 'Washing machine', re: /\b(washing machine|washer (hoses?|filter))\b/i },
  { id: 'ducts', label: 'Air duct cleaning', re: /\b(duct cleaning|air ducts?|ductwork)\b/i },
  { id: 'plumbing', label: 'Faucets / toilets / caulking', re: /\b(faucets?|toilets?|caulk\w*|garbage disposal)\b/i },
  { id: 'irrigation', label: 'Sprinklers / irrigation', re: /\b(sprinklers?|irrigation)\b/i },
  { id: 'pool', label: 'Pool / hot tub', re: /\b(pool|hot tub)\b/i },
  { id: 'chimney', label: 'Chimney / fireplace', re: /\b(chimney|fireplace)\b/i },
  { id: 'thermostat', label: 'Thermostat', re: /\bthermostats?\b/i },
  { id: 'electrical', label: 'Outlets / electrical', re: /\b(outlets?|electrical|wiring|gfci)\b/i },
  { id: 'pest', label: 'Pest control', re: /\b(pest|termites?)\b/i },
  { id: 'septic', label: 'Septic', re: /\bseptic\b/i },
];

const ASK = /\b(wish|would (love|like)|would be (nice|great|helpful)|hope (you|they|it)|please (add|include|consider)|should (include|cover|add|offer)|add(ing|ed)? (more|a|the)?\s*(service|option)|more services|(could|can) you (add|include|offer)|need(ed)? (help|someone)|offer (more|other))/i;
const NOT_COVERED = /\b(not covered|isn'?t covered|wasn'?t covered|aren'?t covered|weren'?t covered|not included|isn'?t included|excluded|exclusions?|couldn'?t (do|service|clean)|could not (do|service|clean)|can'?t (do|service|clean)|cannot (do|service|clean)|wouldn'?t (do|service|clean)|would not (do|service|clean)|won'?t (do|service|clean)|didn'?t (do|service|clean)|not (able|allowed) to|skipped|not part of)\b/i;

export type MentionKind = 'asked' | 'not-covered';
export interface ServiceMention { survey: SurveyRecord; kind: MentionKind }
export interface ServiceRow {
  id: string;
  label: string;
  surveys: number;
  asked: number;
  notCovered: number;
  thisWeek: number;
  lastFw: number;
  /** share of these surveys that scored 9–10 */
  promoterPct: number | null;
  mentions: ServiceMention[];
}

/** One survey can mention several services; each service counts the survey once. */
export function serviceRequests(surveys: SurveyRecord[], tags: Map<string, ThemeTag>, fw: number): ServiceRow[] {
  const rows = new Map<string, ServiceRow>();
  for (const s of surveys) {
    const text = s.comment;
    if (!text.trim()) continue;
    const tag = tags.get(s.id);
    const themes = tag ? [tag.primary, ...tag.secondary] : [];
    const asked = ASK.test(text) || themes.includes('service-add');
    const notCovered = NOT_COVERED.test(text) || themes.includes('exclusions');
    if (!asked && !notCovered) continue;
    for (const def of SERVICES) {
      if (!def.re.test(text)) continue;
      const kind: MentionKind = notCovered ? 'not-covered' : 'asked';
      const r = rows.get(def.id) ?? { id: def.id, label: def.label, surveys: 0, asked: 0, notCovered: 0, thisWeek: 0, lastFw: 0, promoterPct: null, mentions: [] };
      r.surveys++;
      if (kind === 'asked') r.asked++; else r.notCovered++;
      if (s.fw === fw) r.thisWeek++;
      r.lastFw = Math.max(r.lastFw, s.fw);
      r.mentions.push({ survey: s, kind });
      rows.set(def.id, r);
    }
  }
  for (const r of rows.values()) {
    const scored = r.mentions.filter((m) => m.survey.ltr !== null);
    r.promoterPct = scored.length ? (100 * scored.filter((m) => m.survey.ltr! >= 9).length) / scored.length : null;
    r.mentions.sort((a, b) => b.survey.date.localeCompare(a.survey.date));
  }
  return [...rows.values()].sort((a, b) => b.surveys - a.surveys || b.thisWeek - a.thisWeek || a.label.localeCompare(b.label));
}
