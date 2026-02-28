"use client";

import { useState } from "react";

export function PanelConfig(props: {
  onCreate: (input: { name: string; personaIds: string[]; mode: "scatter_gather" | "pipeline_parallel" }) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState("Founders vs. Sharks");
  const [mode, setMode] = useState<"scatter_gather" | "pipeline_parallel">("scatter_gather");
  const [personaIdsText, setPersonaIdsText] = useState("shark_1,founder_1,mediator_1");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Panel name" />
      <select value={mode} onChange={(e) => setMode(e.target.value as "scatter_gather" | "pipeline_parallel") }>
        <option value="scatter_gather">scatter_gather</option>
        <option value="pipeline_parallel">pipeline_parallel</option>
      </select>
      <input
        value={personaIdsText}
        onChange={(e) => setPersonaIdsText(e.target.value)}
        placeholder="comma-separated persona IDs"
      />
      <button
        disabled={props.loading}
        onClick={() =>
          props.onCreate({
            name,
            mode,
            personaIds: personaIdsText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      >
        {props.loading ? "Creating..." : "Create Panel"}
      </button>
    </div>
  );
}
