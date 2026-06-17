import { Component, type ReactNode } from "react";

// Contains a render crash so one broken section can't white-screen the whole window.
// Shows the error text so it can actually be reported/diagnosed.
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("Render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
          <div className="font-semibold text-red-700">Something broke{this.props.label ? ` in ${this.props.label}` : ""}.</div>
          <div className="mt-1 text-red-600">{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} className="mt-2 text-xs text-red-700 underline">Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
