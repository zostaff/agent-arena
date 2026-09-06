/**
 * The village persists now, which means a bad save can reach render — and a
 * white screen with a wiped-out console is the worst possible answer to that.
 *
 * This boundary shows what broke and offers the one action that fixes the only
 * class of breakage the player can cause: clearing the saved village.
 */

import React from "react";
import { clearVillageSave } from "./storage.js";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    /* The console is where a bug report starts; keep the component stack. */
    console.error("DEGEN VILLAGE crashed:", error, info.componentStack);
  }

  private wipe = (): void => {
    void (async () => {
      await clearVillageSave();
      window.location.reload();
    })();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="dv-crash">
        <div className="dv-crash-card">
          <div className="dv-crash-title">THE VILLAGE STOPPED</div>
          <pre className="dv-crash-msg">{error.message || String(error)}</pre>
          <p className="dv-crash-note">
            The full stack is in the browser console. If this started after a
            reload, the saved village is the likely cause — wiping it costs the
            progress in this browser and nothing else.
          </p>
          <div className="dv-crash-actions">
            <button className="dv-btn" onClick={() => window.location.reload()}>
              RELOAD
            </button>
            <button className="dv-btn dv-btn-danger" onClick={this.wipe}>
              WIPE SAVE AND RELOAD
            </button>
          </div>
        </div>
      </div>
    );
  }
}
