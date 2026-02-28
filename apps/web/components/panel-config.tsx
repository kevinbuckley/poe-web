"use client";

import { useState } from "react";

type PanelMode = "scatter_gather" | "pipeline_parallel";

const MODE_OPTIONS: Array<{ value: PanelMode; label: string }> = [
  { value: "scatter_gather", label: "Independent Roundtable" },
  { value: "pipeline_parallel", label: "Sequential Debate" },
];

export function PanelConfig(props: {
  onCreate: (input: { name: string; personaIds: string[]; mode: PanelMode }) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState("Founders vs. Sharks");
  const [mode, setMode] = useState<PanelMode>("scatter_gather");
  const [personaIdsText, setPersonaIdsText] = useState("shark_1,founder_1,mediator_1");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Panel name" />
      <select value={mode} onChange={(e) => setMode(e.target.value as PanelMode)}>
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
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
