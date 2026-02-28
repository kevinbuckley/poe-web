import React from "react";

export function MessageBubble(props: {
  author: string;
  content: string;
  tag: string;
  mine?: boolean;
  streaming?: boolean;
}) {
  return (
    <div
      data-testid="message-bubble"
      data-author={props.author}
      data-tag={props.tag}
      data-streaming={props.streaming ? "true" : "false"}
      style={{
        background: props.mine ? "#e9f8ef" : "#f4f4f5",
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div data-testid="message-header" style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12 }}>
        <strong>{props.author}</strong>
        <span style={{ color: "#52525b" }}>{props.tag}</span>
      </div>
      <div data-testid="message-content" style={{ whiteSpace: "pre-wrap" }}>
        {props.content}
        {props.streaming ? "▌" : ""}
      </div>
    </div>
  );
}
