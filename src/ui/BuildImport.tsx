import React, { useState } from "react";
import { MAX_BUILD_JSON_LENGTH, parseBuildJson, type ForgeDraft } from "../core/build.js";

export function BuildImport({ onImport }: { onImport(draft: ForgeDraft): void }): React.ReactElement {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function load(): void {
    const parsed = parseBuildJson(text);
    if (!parsed.ok) {
      setMessage(parsed.error);
      return;
    }
    onImport(parsed.draft);
    setText("");
    setMessage("Build loaded. Run a new backtest before publishing.");
  }

  return (
    <details className="dv-build-import">
      <summary className="dv-compiled-title">IMPORT JSON</summary>
      <textarea
        className="dv-input dv-textarea"
        aria-label="Build JSON"
        placeholder="Paste an exported build here"
        rows={5}
        maxLength={MAX_BUILD_JSON_LENGTH}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setMessage(null);
        }}
      />
      <button className="dv-btn" disabled={!text.trim()} onClick={load}>LOAD BUILD</button>
      {message && <div className="dv-house-note" role="status">{message}</div>}
    </details>
  );
}
