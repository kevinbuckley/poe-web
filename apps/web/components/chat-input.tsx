"use client";

import { useId, useState } from "react";

export function ChatInput(props: {
  disabled?: boolean;
  mentionOptions?: string[];
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const datalistId = useId();

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
        list={props.mentionOptions && props.mentionOptions.length > 0 ? datalistId : undefined}
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
      {props.mentionOptions && props.mentionOptions.length > 0 ? (
        <datalist id={datalistId}>
          {props.mentionOptions.map((personaId) => (
            <option key={personaId} value={`@${personaId}`} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
