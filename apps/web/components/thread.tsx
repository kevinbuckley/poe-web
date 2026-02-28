"use client";

import { useMemo } from "react";
import type { ConversationMessage } from "@poe/contracts";
import { MessageBubble } from "@poe/ui";

type StreamingMessage = {
  id: string;
  author_id: string;
  content: string;
  argument_tag: string;
  cycle_id?: string | null;
  turn_index?: number | null;
};

type CycleGroup = {
  cycleId: string;
  order: number;
  messages: ConversationMessage[];
};

function shortId(id: string | null | undefined): string {
  if (!id) return "";
  return id.slice(0, 8);
}

export function Thread(props: { messages: ConversationMessage[]; streamingMessage: StreamingMessage | null }) {
  const { looseMessages, cycleGroups, byId } = useMemo(() => {
    const loose: ConversationMessage[] = [];
    const groups = new Map<string, CycleGroup>();
    const idIndex = new Map<string, ConversationMessage>();
    let nextOrder = 0;

    for (const msg of props.messages) {
      idIndex.set(msg.id, msg);
      if (!msg.cycle_id) {
        loose.push(msg);
        continue;
      }

      const existing = groups.get(msg.cycle_id);
      if (existing) {
        existing.messages.push(msg);
      } else {
        groups.set(msg.cycle_id, {
          cycleId: msg.cycle_id,
          order: nextOrder,
          messages: [msg],
        });
        nextOrder += 1;
      }
    }

    const sortedGroups = [...groups.values()].sort((a, b) => a.order - b.order);
    for (const group of sortedGroups) {
      group.messages.sort((a, b) => {
        if ((a.turn_index ?? 0) !== (b.turn_index ?? 0)) {
          return (a.turn_index ?? 0) - (b.turn_index ?? 0);
        }
        return a.created_at.localeCompare(b.created_at);
      });
    }

    return { looseMessages: loose, cycleGroups: sortedGroups, byId: idIndex };
  }, [props.messages]);

  function messageSubtitle(message: ConversationMessage): string | undefined {
    const parts: string[] = [];

    if (message.reply_to_message_id) {
      const replyTarget = byId.get(message.reply_to_message_id);
      const replyLabel = replyTarget ? `@${replyTarget.author_id}` : `#${shortId(message.reply_to_message_id)}`;
      parts.push(`Replying to ${replyLabel}`);
    }
    if (message.directed_to_persona_id) {
      parts.push(`Directed to @${message.directed_to_persona_id}`);
    }
    if (message.mentioned_persona_ids && message.mentioned_persona_ids.length > 0) {
      parts.push(`Mentions ${message.mentioned_persona_ids.map((id) => `@${id}`).join(", ")}`);
    }

    return parts.length > 0 ? parts.join(" • ") : undefined;
  }

  let streamingRendered = false;

  return (
    <div data-testid="thread" className="thread-scroll">
      {looseMessages.map((m) => (
        <MessageBubble
          key={m.id}
          author={m.author_id}
          content={m.content}
          tag={m.argument_tag}
          subtitle={messageSubtitle(m)}
          mine={m.role === "user"}
        />
      ))}

      {cycleGroups.map((group, index) => {
        const userMessage = group.messages.find((m) => m.speaker_role === "user" || m.role === "user");
        const expertMessages = group.messages.filter((m) => m.speaker_role === "expert");
        const mediatorMessages = group.messages.filter((m) => m.speaker_role === "mediator");
        const showStreaming = Boolean(
          props.streamingMessage && props.streamingMessage.cycle_id === group.cycleId
        );
        if (showStreaming) {
          streamingRendered = true;
        }

        return (
          <section key={group.cycleId} className="cycle-group" data-cycle-id={group.cycleId}>
            <div className="cycle-header">
              <span className="cycle-title">Cycle {index + 1}</span>
              <span className="cycle-id">#{shortId(group.cycleId)}</span>
            </div>

            {userMessage ? (
              <MessageBubble
                key={userMessage.id}
                author={userMessage.author_id}
                content={userMessage.content}
                tag={userMessage.argument_tag}
                subtitle={messageSubtitle(userMessage)}
                mine
              />
            ) : null}

            {expertMessages.map((m) => (
              <MessageBubble
                key={m.id}
                author={m.author_id}
                content={m.content}
                tag={m.argument_tag}
                subtitle={messageSubtitle(m)}
              />
            ))}

            {showStreaming && props.streamingMessage ? (
              <MessageBubble
                key={props.streamingMessage.id}
                author={props.streamingMessage.author_id}
                content={props.streamingMessage.content}
                tag={props.streamingMessage.argument_tag}
                subtitle={
                  props.streamingMessage.turn_index
                    ? `Live turn ${props.streamingMessage.turn_index}`
                    : "Live turn"
                }
                streaming
              />
            ) : null}

            {mediatorMessages.map((m) => (
              <MessageBubble
                key={m.id}
                author={m.author_id}
                content={m.content}
                tag={m.argument_tag}
                subtitle={messageSubtitle(m)}
              />
            ))}
          </section>
        );
      })}

      {props.streamingMessage && (!props.streamingMessage.cycle_id || !streamingRendered) ? (
        <MessageBubble
          key={props.streamingMessage.id}
          author={props.streamingMessage.author_id}
          content={props.streamingMessage.content}
          tag={props.streamingMessage.argument_tag}
          subtitle={
            props.streamingMessage.turn_index
              ? `Live turn ${props.streamingMessage.turn_index}`
              : "Live turn"
          }
          streaming
        />
      ) : null}
    </div>
  );
}
