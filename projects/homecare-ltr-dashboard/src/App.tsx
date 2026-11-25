import { createHashRouter, RouterProvider } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { CommandCenter } from '@/pages/CommandCenter';
import { DataManager } from '@/pages/DataManager';
import { Settings } from '@/pages/Settings';
import { Placeholder } from '@/pages/Placeholder';
import { LtrTrends } from '@/pages/LtrTrends';
import { RegionalDrilldown } from '@/pages/RegionalDrilldown';
import { Detractors } from '@/pages/Detractors';
import { Attributes } from '@/pages/Attributes';
import { VocThemes } from '@/pages/VocThemes';
import { ReviewQueue } from '@/pages/ReviewQueue';
import { Ask } from '@/pages/Ask';
import { DailyPulse } from '@/pages/DailyPulse';
import { LtrSlide } from '@/pages/LtrSlide';
import { Subscriptions } from '@/pages/Subscriptions';
import { SCREENS } from '@/screens';

const BUILT: Record<string, () => JSX.Element> = {
  '/': CommandCenter, '/trends': LtrTrends, '/regions': RegionalDrilldown, '/detractors': Detractors, '/attributes': Attributes,
  '/voc': VocThemes, '/review': ReviewQueue, '/ask': Ask, '/slide': LtrSlide, '/subscriptions': Subscriptions, '/pulse': DailyPulse,
  '/data': DataManager, '/settings': Settings,
};

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      ...SCREENS.map((s) => {
        const C = BUILT[s.path] ?? Placeholder;
        return s.path === '/' ? { index: true, element: <C /> } : { path: s.path.slice(1), element: <C /> };
      }),
      { path: '*', element: <Placeholder /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
