"use client";

import { useState } from "react";

export function ChatInput(props: {
  disabled?: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");

  async function submit() {
    const next = text.trim();
    if (!next || props.disabled) return;
    setText("");
    await props.onSend(next);
  }

  return (
    <div className="chat-input-row">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask the panel. Use @persona_id to target someone."
        className="chat-input-control"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <button
        disabled={props.disabled || !text.trim()}
        onClick={() => void submit()}
        className="chat-send-button"
      >
        Send
      </button>
    </div>
  );
}
