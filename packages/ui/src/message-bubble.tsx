import React from "react";

export function MessageBubble(props: {
  author: string;
  content: string;
  tag: string;
  subtitle?: string;
  mine?: boolean;
  streaming?: boolean;
}) {
  return (
    <div
      data-testid="message-bubble"
      data-author={props.author}
      data-tag={props.tag}
      data-streaming={props.streaming ? "true" : "false"}
      className={`message-bubble${props.mine ? " mine" : ""}`}
    >
      <div data-testid="message-header" className="message-header">
        <strong className="message-author">{props.author}</strong>
        <span className="message-tag">{props.tag}</span>
      </div>
      {props.subtitle ? <div className="message-subtitle">{props.subtitle}</div> : null}
      <div data-testid="message-content" className="message-content">
        {props.content}
        {props.streaming ? <span className="stream-cursor">▌</span> : null}
      </div>
    </div>
  );
}
