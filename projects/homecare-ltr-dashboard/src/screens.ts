import type { IconName } from '@/components/ui/Icon';

export interface ScreenDef {
  path: string;
  title: string;
  /** The one question this screen answers (its page subtitle). */
  subtitle: string;
  icon: IconName;
  /** Files needed for this screen (named in the empty state). */
  needs: string[];
  phase: number;
  group: 'Report' | 'Listen' | 'Deliver' | 'Manage';
}

export const SCREENS: ScreenDef[] = [
  { path: '/', title: 'Command Center', subtitle: 'How did HomeCare+ do this week, and what needs my attention?', icon: 'home', needs: ['LTR_Tracker*.xlsx', '*_HC_Loyalty_Cases.xlsx'], phase: 3, group: 'Report' },
  { path: '/trends', title: 'LTR Trends', subtitle: 'Is LTR moving, and is the movement real given n?', icon: 'trend', needs: ['LTR_Tracker*.xlsx'], phase: 3, group: 'Report' },
  { path: '/regions', title: 'Regional Drilldown', subtitle: 'Which regions, districts and stores are pulling LTR down?', icon: 'map', needs: ['LTR_Tracker*.xlsx', 'Store→District mapping CSV (optional)'], phase: 3, group: 'Report' },
  { path: '/detractors', title: 'Detractors (0–8)', subtitle: 'Who scored 0–8, why, and did the store follow up?', icon: 'alert', needs: ['LTR_Tracker*.xlsx', 'Detractor follow-up file (e.g. FW40.xlsx)'], phase: 3, group: 'Report' },
  { path: '/attributes', title: 'Attributes (Drivers)', subtitle: 'Which part of the journey is weakest: pre-visit, in-home or program?', icon: 'bars', needs: ['*Responses_Export*.xlsx or Analytics*.xlsx'], phase: 3, group: 'Report' },
  { path: '/voc', title: 'VOC Themes', subtitle: 'What are members saying in their survey comments?', icon: 'quote', needs: ['LTR_Tracker*.xlsx or Medallia Responses export'], phase: 4, group: 'Listen' },
  { path: '/calls', title: 'Contact Center', subtitle: 'Why are members calling, and which calls could we have prevented?', icon: 'phone', needs: ['*_HC_Loyalty_Cases.xlsx'], phase: 4, group: 'Listen' },
  { path: '/cross', title: 'Cross-Channel', subtitle: 'Which themes show up in both surveys and calls, and what changed?', icon: 'split', needs: ['LTR_Tracker*.xlsx', '*_HC_Loyalty_Cases.xlsx'], phase: 4, group: 'Listen' },
  { path: '/wbr', title: 'WBR Builder', subtitle: 'What goes on Wednesday’s slide, and is it ready to export?', icon: 'slide', needs: ['LTR_Tracker*.xlsx', '*_HC_Loyalty_Cases.xlsx'], phase: 6, group: 'Deliver' },
  { path: '/slide', title: 'LTR Slide', subtitle: 'What does this week’s LTR slide say, region by region?', icon: 'map', needs: ['LTR_Tracker*.xlsx', 'Analytics*.xlsx (Key Drivers, optional)'], phase: 8, group: 'Deliver' },
  { path: '/pulse', title: 'Daily Pulse', subtitle: 'What do I say in 60 seconds at this morning’s meeting?', icon: 'pulse', needs: ['*_HC_Loyalty_Cases.xlsx', 'LTR_Tracker*.xlsx'], phase: 6, group: 'Deliver' },
  { path: '/ask', title: 'Ask', subtitle: 'What does the loaded data say about…? (answered locally, never guessed)', icon: 'ask', needs: ['Any loaded week'], phase: 5, group: 'Deliver' },
  { path: '/review', title: 'Review Queue', subtitle: 'Which tags need a human decision?', icon: 'review', needs: ['Tagged survey or call records'], phase: 4, group: 'Manage' },
  { path: '/data', title: 'Data Manager', subtitle: 'What is loaded, is it clean, and which weeks does it cover?', icon: 'database', needs: [], phase: 2, group: 'Manage' },
  { path: '/settings', title: 'Settings', subtitle: 'Business rules, taxonomy, AI and appearance.', icon: 'settings', needs: [], phase: 1, group: 'Manage' },
];

export function screenFor(pathname: string): ScreenDef {
  return SCREENS.find((s) => s.path === pathname) ?? SCREENS[0];
}
