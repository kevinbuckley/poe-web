import { redirect } from "next/navigation";

import { buildPanelPresets, type PanelPresetKey } from "../../../lib/orchestration/panelPresets";
import { createProvider } from "../../../lib/providers";
import { createSession, saveSession } from "../../../lib/store/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StartPanelParams = {
  params: {
    panel?: string;
  };
};

export default async function StartPanelPage({ params }: StartPanelParams) {
  const defaultModel = process.env.DEFAULT_MODEL || "gpt-4.1-nano";
  const panelKey = (params?.panel as PanelPresetKey | undefined) ?? "tech";

  const presets = buildPanelPresets(defaultModel);
  const chosen = presets[panelKey] ?? presets.tech;
  const moderator = {
    id: "moderator",
    name: "Moderator",
    provider: "openai" as const,
    model: defaultModel,
    systemPrompt:
      "Be friendly and human. Make sure the user’s question is clearly answered. If anything is missing, briefly ask a follow-up. Keep it concise and conversational.",
  };
  const session = await createSession({ experts: chosen.experts, moderator, autoDiscuss: false });
  session.title = `${chosen.title} – ${new Date().toLocaleString()}`;
  await saveSession(session);
  // Force provider warm-up so first call is fast; ignore result
  try {
    createProvider();
  } catch {
    // Ignore provider warm-up errors; real calls will surface them.
  }
  redirect(`/${session.id}`);
}
