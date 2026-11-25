import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from blanking the whole app; resets when you navigate. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-[12px] border border-surveys bg-surveys-soft p-5">
        <h2 className="font-display text-lg font-semibold">This screen hit a problem</h2>
        <p className="mt-1 text-sm">{this.state.error.message}</p>
        <p className="mt-2 text-sm text-muted">Your data is safe in this browser. Try another screen or week, or reload the page. If it keeps happening, export a backup from the Data Manager.</p>
      </div>
    );
  }
}
