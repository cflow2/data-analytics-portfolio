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
    keywords: ['leak', 'leaking', 'no hot water', 'flooded', 'water damage', 'overheating', 'no airflow', 'left unplugged', 'unplugged', 'left behind', 'stuck in', 'broke', 'broken', 'damaged', 'scratched', 'burning smell'],
  },
  {
    id: 'appointment', name: 'Appointment management', precedence: 2, defaultStatus: 'ACT',
    definition: 'Booking, confirming, rescheduling, missed visits, arrival time, app/website/phone-line problems.',
    subTags: ['Online/app failure', 'No-show/missed', 'Auto-cancel', 'Cancelled by store/Lowe’s', 'Arrival-time request', 'Routine scheduling'],
    keywords: ['schedule', 'scheduling', 'reschedule', 'appointment', 'booking', 'book a visit', 'no show', 'no-show', "didn't show", 'never showed', 'missed', 'arrival time', 'time window', 'website', 'the app', 'app ', 'online', 'error message', 'auto-cancel', 'automatically cancelled', 'cancelled my appointment', 'confirm'],
  },
  {
    id: 'exclusions', name: 'Service exclusions', precedence: 2, defaultStatus: 'ACT',
    definition: 'Something the program does not cover: roof-vented or 2nd-story dryer vents, gas or tankless water heaters, heaters 10+ years old, anything above 12 ft, CO/smoke detector replacement (battery only), thermostats, repairs.',
    subTags: ['Exclusion drove cancel', 'Exclusion question'],
    keywords: ['roof', 'tankless', 'gas water heater', 'gas dryer', '12 ft', '12 feet', 'ceiling height', 'second story', '2nd level', '2nd story', 'not covered', 'excluded', "wouldn't service", "couldn't service", 'thermostat', 'boiler', '10 years', 'too old', 'not included'],
  },
  {
    id: 'completion', name: 'Service completion gaps', precedence: 2, defaultStatus: 'WATCH',
    definition: 'A covered service started or promised but not finished (filters, flushes, CO detectors, parts not brought, follow-up visit needed).',
    subTags: [],
    keywords: ['not finished', "didn't finish", 'did not finish', 'not completed', "didn't bring", 'did not bring', 'no filter', 'filter', 'flush', 'come back', 'follow-up visit', 'second visit', 'ran out of time', 'only did'],
  },
  {
    id: 'value', name: 'Value', precedence: 2, defaultStatus: 'WATCH',
    definition: 'Worth, price, cost, refunds.',
    subTags: ['Refund dispute'],
    keywords: ['worth', 'value', 'price', 'cost', '$99', 'refund', 'money', 'expensive', 'cheap', 'deal', 'pays for itself'],
  },
  {
    id: 'service-add', name: 'Service-add request', precedence: 3, defaultStatus: 'WATCH',
    definition: 'Asks for a service not offered (keypad batteries, dishwasher filter).',
    subTags: [],
    keywords: ['wish they', 'would be nice', 'should add', 'add more services', 'keypad', 'dishwasher filter', 'also do', 'more services'],
  },
  {
    id: 'aging', name: 'Aging in place / accessibility', precedence: 3, defaultStatus: 'GROW',
    definition: 'Older members or members with disabilities who rely on the service.',
    subTags: [],
    keywords: ['elderly', 'senior', 'retired', 'disability', 'disabled', 'wheelchair', "can't climb", 'cannot climb', 'my age', 'widow', 'live alone', 'years old and'],
  },
  {
    id: 'associate', name: 'Associate experience', precedence: 4, defaultStatus: 'GROW',
    definition: 'RedVest Associate conduct, skill, knowledge, friendliness.',
    subTags: ['Praise', 'Concern'],
    keywords: ['associate', 'redvest', 'technician', 'tech ', 'friendly', 'professional', 'knowledgeable', 'courteous', 'polite', 'rude', 'explained', 'thorough', 'respectful'],
  },
  {
    id: 'other', name: 'Other / not VOC', precedence: 9, defaultStatus: 'STABLE',
    definition: 'Routine requests, help-desk calls.',
    subTags: [],
    keywords: [],
  },
];

export const THEME_IDS = DEFAULT_TAXONOMY.map((t) => t.id);
export function themeName(id: string, tax: ThemeDef[] = DEFAULT_TAXONOMY): string {
  return tax.find((t) => t.id === id)?.name ?? id;
}
