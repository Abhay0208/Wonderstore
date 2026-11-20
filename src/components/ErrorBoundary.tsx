import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070e1b] flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-md w-full bg-[#0d1d33] border-2 border-sky-500/40 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-3xl">
              ❄️
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight text-white font-display">
              WonderMC Store
            </h2>
            <p className="text-xs text-sky-200/80 leading-relaxed">
              An unexpected display glitch occurred. We have prevented the screen from going blank. Click below to refresh the view.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full py-3 rounded-xl bg-lime text-lime-foreground font-black text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-lime/20 cursor-pointer"
            >
              Refresh Store
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
