import { createHashRouter, RouterProvider } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { CommandCenter } from '@/pages/CommandCenter';
import { DataManager } from '@/pages/DataManager';
import { Settings } from '@/pages/Settings';
import { Placeholder } from '@/pages/Placeholder';
import { SCREENS } from '@/screens';

const BUILT: Record<string, () => JSX.Element> = { '/': CommandCenter, '/data': DataManager, '/settings': Settings };

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
