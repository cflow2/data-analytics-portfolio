import { useLocation, Link } from 'react-router';
import { screenFor } from '@/screens';
import { PageHeader, EmptyState, Card } from '@/components/ui/primitives';
import { useSelectedWeek } from '@/hooks/useWeek';

export function Placeholder() {
  const { pathname, search } = useLocation();
  const s = screenFor(pathname);
  const week = useSelectedWeek();
  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      {!week.hasData ? (
        <EmptyState
          title={`No data loaded for FW${week.fw}`}
          body="Upload these files on the Data Manager, or load the demo data to explore."
          files={s.needs}
          action={<Link to={{ pathname: '/data', search }} className="text-sm font-medium text-calls underline">Go to Data Manager</Link>}
        />
      ) : (
        <Card>
          <p className="text-sm text-muted">This screen is built in phase {s.phase} of the build plan. The data for {week.label} is loaded and ready.</p>
        </Card>
      )}
    </>
  );
}
