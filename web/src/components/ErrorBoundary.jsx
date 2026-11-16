import { Component } from 'react';

/**
 * Top-level React error boundary for Twist Store.
 *
 * Catches synchronous render errors that React Router's own errorElement would
 * miss (e.g. errors thrown outside a router context, or errors in context
 * providers above the router). Displays a minimal Arabic-first recovery UI
 * and offers a "reload" escape hatch so the user is never stuck on a blank
 * screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <RouterProvider router={router} />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console (the structured logger on the server won't see this;
    // wire up an error-reporting service here when needed).
    console.error('[ErrorBoundary] Uncaught React error:', error, info?.componentStack ?? '');
  }

  handleReload() {
    // Clear the error state so React tries to re-render.
    this.setState({ hasError: false, error: null });
    // If the page is broken after a deploy (stale chunk), a hard reload fixes it.
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = import.meta.env.DEV;
    const msg = this.state.error?.message || '';

    return (
      <div
        dir="rtl"
        className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 p-6 text-center font-sans"
      >
        {/* Logo placeholder — same colour as the primary brand colour */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white text-2xl font-bold shadow-sm">
          T
        </div>

        <div className="max-w-sm space-y-2">
          <h1 className="text-xl font-semibold text-neutral-900">حصل خطأ غير متوقع</h1>
          <p className="text-sm text-neutral-500">
            حاول تعيد تحميل الصفحة. لو المشكلة فضلت، تواصل مع الدعم.
          </p>
          {isDev && msg && (
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-700 text-right">
              {msg}
            </pre>
          )}
        </div>

        <button
          onClick={this.handleReload}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary/90 active:scale-95 transition-transform"
          type="button"
        >
          إعادة تحميل الصفحة
        </button>
      </div>
    );
  }
}
