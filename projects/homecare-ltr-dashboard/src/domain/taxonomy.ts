import type { Status } from './types';

export interface ThemeDef {
  id: string;
  name: string;
  definition: string;
  subTags: string[];
  defaultStatus: Status;
  alwaysEscalate?: boolean;
  /** Keyword rules (case-insensitive substrings / phrases) for the rules engine */
  keywords: string[];
  /** Lower number = higher precedence when choosing a primary theme */
  precedence: number;
}

/**
 * Primary-theme precedence: safety/damage > failed experience > service demand > specific praise > general praise.
 */
export const DEFAULT_TAXONOMY: ThemeDef[] = [
  {
    id: 'damage', name: 'Post-service damage', precedence: 1, defaultStatus: 'ACT', alwaysEscalate: true,
    definition: 'Something worse after the visit: leaks, no hot water, dryer overheating or no airflow, appliance left unplugged, tool left behind or stuck.',
    subTags: [],
    keywords: ['leak*', 'no hot water', 'flood*', 'water damage', 'overheat*', 'no airflow', 'left unplugged', 'unplugged', 'left a tool', 'tool behind', 'tool left', 'stuck in the', 'broke my', 'broken since', 'damaged', 'scratched', 'burning smell', 'smell of gas', 'smells like gas', 'tripped the breaker', '/\\b(after|since) the (visit|service|flush|cleaning)\\b.{0,40}\\b(not working|stopped working|won\'t (start|turn on)|doesn\'t work)/', '/\\b(they|he|she|associate|tech) broke\\b/'],
  },
  {
    id: 'appointment', name: 'Appointment management', precedence: 2, defaultStatus: 'ACT',
    definition: 'Booking, confirming, rescheduling, missed visits, arrival time, app/website/phone-line problems.',
    subTags: ['Online/app failure', 'No-show/missed', 'Auto-cancel', 'Cancelled by store/Lowe’s', 'Arrival-time request', 'Routine scheduling'],
    keywords: ['schedul*', 'reschedul*', 'appointment*', 'book', 'booked', 'booking', 'no show', 'no-show', 'never showed', 'didn\'t show', 'did not show', 'nobody showed', 'no one showed', 'nobody came', 'no one came', 'missed appointment', 'missed the appointment', 'missed my appointment', 'arrival time', 'time window', 'what time', 'auto-cancel', 'automatically cancelled', 'automatically canceled', 'cancelled the appointment', 'canceled the appointment', 'cancelled the visit', 'canceled the visit', 'cancelled my appointment', 'canceled my appointment', 'confirm the appointment', 'confirmation call', 'hard to get', 'long wait for', 'took a while to get', 'weeks out', 'months out', 'hold time', 'on hold', 'phone line'],
  },
  {
    id: 'exclusions', name: 'Service exclusions', precedence: 2, defaultStatus: 'ACT',
    definition: 'Something the program does not cover: roof-vented or 2nd-story dryer vents, gas or tankless water heaters, heaters 10+ years old, anything above 12 ft, CO/smoke detector replacement (battery only), thermostats, repairs.',
    subTags: ['Exclusion drove cancel', 'Exclusion question'],
    keywords: ['roof', 'tankless', 'gas water heater', 'gas dryer', 'gas heater', '12 ft', '12 feet', '12 foot', 'ceiling height', 'too high', 'second story', 'second floor', '2nd level', '2nd story', '2nd floor', 'not covered', 'isn\'t covered', 'wasn\'t covered', 'excluded', 'exclusion*', 'not included', 'isn\'t included', 'thermostat', 'boiler', '10 years', '10+ years', 'too old', 'couldn\'t service', 'could not service', 'wouldn\'t service', 'would not service', 'can\'t service', 'cannot service', 'not able to service', 'not part of the', 'outside the scope', 'out of scope', 'only change batter*', 'only replace batter*', 'electrical work', 'repairs aren\'t', 'doesn\'t do repairs', 'does not do repairs'],
  },
  {
    id: 'completion', name: 'Service completion gaps', precedence: 2, defaultStatus: 'WATCH',
    definition: 'A covered service started or promised but not finished (filters, flushes, CO detectors, parts not brought, follow-up visit needed).',
    subTags: [],
    keywords: ['did not bring', 'didn\'t bring', 'didn\'t have the', 'did not have the', 'not replaced', 'never changed', 'never replaced', 'not finished', 'didn\'t finish', 'did not finish', 'not completed', 'didn\'t complete', 'did not complete', 'started but', 'come back to finish', 'someone come back', 'follow-up visit', 'follow up visit', 'return visit', 'waiting on a second visit', 'waiting for a second visit', 'ran out of time', 'only did', 'not done', 'wasn\'t done', 'wasn\'t completed', 'not as promised', 'never came back', 'still waiting'],
  },
  {
    id: 'value', name: 'Value', precedence: 2, defaultStatus: 'WATCH',
    definition: 'Worth, price, cost, refunds.',
    subTags: ['Refund dispute'],
    keywords: ['worth', 'value', 'price', 'cost*', '$99', '99 dollars', 'refund*', 'money', 'expensive', 'cheap', 'great deal', 'good deal', 'pays for itself', 'renewal charge', 'charged', 'fee', 'not sure it is worth'],
  },
  {
    id: 'service-add', name: 'Service-add request', precedence: 3, defaultStatus: 'WATCH',
    definition: 'Asks for a service not offered (keypad batteries, dishwasher filter).',
    subTags: [],
    keywords: ['wish they', 'would be nice if', 'should add', 'add more services', 'offer more services', 'more services like', 'more services such as', 'keypad', 'dishwasher filter', 'gutter*', 'can be added', 'added to the service', 'also do', 'should also', 'would love if'],
  },
  {
    id: 'aging', name: 'Aging in place / accessibility', precedence: 3, defaultStatus: 'GROW',
    definition: 'Older members or members with disabilities who rely on the service.',
    subTags: [],
    keywords: ['elderly', 'senior', 'retired', 'disab*', 'wheelchair', 'can\'t climb', 'cannot climb', 'can’t climb', 'my age', 'widow*', 'live alone', 'lives alone', 'years old and', 'cannot reach', 'can\'t reach', 'handicap*', 'mobility'],
  },
  {
    id: 'associate', name: 'Associate experience', precedence: 4, defaultStatus: 'GROW',
    definition: 'RedVest Associate conduct, skill, knowledge, friendliness.',
    subTags: ['Praise', 'Concern'],
    keywords: ['friendly', 'professional', 'professionalism', 'knowledgeable', 'courteous', 'polite', 'respectful', 'thorough', 'explained', 'took his time', 'took her time', 'took their time', 'knew his stuff', 'knew her stuff', 'pride', 'helpful', 'rude', 'rushed', 'unprofessional', 'did not explain', 'didn\'t explain', 'shoe covers', 'careless', 'attitude', 'personable', 'patient',
      '/(?:\\b(?:associate|redvest|tech|technician|he|she|they|guy|gentleman|lady|man|woman)|\\[name\\])\\s+(was|were|is|did)\\s+(so\\s+|very\\s+|extremely\\s+|really\\s+)?(great|excellent|awesome|amazing|wonderful|fantastic|good|nice|kind|terrific|outstanding|exceptional|a pleasure)\\b/',
      '/\\b(great|excellent|awesome|amazing|wonderful|friendly|professional|knowledgeable|nice|helpful|kind|courteous)\\s+(redvest\\s+)?(associate|tech|technician|guy|young man|gentleman)\\b/'],
  },
  {
    id: 'other', name: 'Other / not VOC', precedence: 9, defaultStatus: 'STABLE',
    definition: 'General comments with no specific theme.',
    subTags: [],
    keywords: [],
  },
];

export const THEME_IDS = DEFAULT_TAXONOMY.map((t) => t.id);
export function themeName(id: string, tax: ThemeDef[] = DEFAULT_TAXONOMY): string {
  return tax.find((t) => t.id === id)?.name ?? id;
}
