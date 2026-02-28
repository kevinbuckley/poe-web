"use client";

import type { ConversationMessage } from "@poe/contracts";
import { MessageBubble } from "@poe/ui";

type StreamingMessage = {
  id: string;
  author_id: string;
  content: string;
  argument_tag: string;
};

export function Thread(props: { messages: ConversationMessage[]; streamingMessage: StreamingMessage | null }) {
  return (
    <div data-testid="thread" className="thread-scroll">
      {props.messages.map((m) => (
        <MessageBubble
          key={m.id}
          author={m.author_id}
          content={m.content}
          tag={m.argument_tag}
          mine={m.role === "user"}
        />
      ))}
      {props.streamingMessage ? (
        <MessageBubble
          key={props.streamingMessage.id}
          author={props.streamingMessage.author_id}
          content={props.streamingMessage.content}
          tag={props.streamingMessage.argument_tag}
          streaming
        />
      ) : null}
    </div>
  );
}
