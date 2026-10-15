import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Rendered instead of `children` when the subtree throws. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

/**
 * Catches render errors in a subtree so the rest of the island keeps working.
 *
 * This app renders `client:only` islands with no root boundary, so an uncaught
 * throw unmounts the whole component tree — on the invoice builder that means
 * losing the customer, line items, totals and the save button together.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, info);
      return;
    }
    // No reporter supplied: at least log it, so a production render error that
    // the fallback swallowed is still diagnosable.
    console.error('[notain] render error caught by boundary:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) return this.props.fallback(error, this.reset);
    return this.props.children;
  }
}
