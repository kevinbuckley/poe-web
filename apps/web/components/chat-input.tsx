"use client";

import { useState } from "react";

export function ChatInput(props: {
  disabled?: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask the panel. Use @persona_id to target someone."
      />
      <button
        disabled={props.disabled || !text.trim()}
        onClick={async () => {
          const next = text.trim();
          setText("");
          await props.onSend(next);
        }}
      >
        Send
      </button>
    </div>
  );
}
