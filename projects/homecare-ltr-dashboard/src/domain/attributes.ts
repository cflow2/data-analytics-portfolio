import type { AttributeKey } from './types';

export interface AttributeDef {
  key: AttributeKey;
  label: string;
  group: 'Pre-visit' | 'In-home' | 'Program';
  /** Theme used in the attribute ↔ theme cross-check */
  relatedTheme: string;
}

export const ATTRIBUTES: AttributeDef[] = [
  { key: 'value', label: 'Value for money', group: 'Program', relatedTheme: 'value' },
  { key: 'scheduling', label: 'Ease of scheduling', group: 'Pre-visit', relatedTheme: 'appointment' },
  { key: 'quality', label: 'Quality of services', group: 'In-home', relatedTheme: 'completion' },
  // Medallia: “Amount of Time It Took to Complete Your Project” (key kept for stored data). Group per the original brief.
  { key: 'timeToAppt', label: 'Time to complete the project', group: 'Pre-visit', relatedTheme: 'completion' },
  { key: 'processPrior', label: 'Ease of process prior to the appointment', group: 'Pre-visit', relatedTheme: 'appointment' },
  { key: 'overall', label: 'Overall subscription', group: 'Program', relatedTheme: 'value' },
  { key: 'craftsmanship', label: 'Associate craftsmanship', group: 'In-home', relatedTheme: 'associate' },
  { key: 'professionalism', label: 'Associate professionalism', group: 'In-home', relatedTheme: 'associate' },
  { key: 'knowledge', label: 'Associate knowledge', group: 'In-home', relatedTheme: 'associate' },
];

export const ATTRIBUTE_BY_KEY = Object.fromEntries(ATTRIBUTES.map((a) => [a.key, a])) as Record<AttributeKey, AttributeDef>;
