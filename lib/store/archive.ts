import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";

import type { ConversationSession } from "../types";

const archiveDir = process.env.SESSION_ARCHIVE_DIR;
const archived = new Set<string>();
let dirPrepared = false;

async function ensureDir(): Promise<void> {
  if (dirPrepared || !archiveDir) return;
  await mkdir(archiveDir, { recursive: true }).catch(() => {});
  dirPrepared = true;
}

export async function archiveSessionSnapshot(session: ConversationSession): Promise<void> {
  if (!archiveDir) return;
  if (archived.has(session.id)) return;
  await ensureDir();
  const filePath = join(archiveDir, `${session.id}.json`);
  try {
    await access(filePath, fsConstants.F_OK);
    archived.add(session.id);
    return;
  } catch {}
  const payload = {
    id: session.id,
    title: session.title,
    panelPresetKey: session.panelPresetKey ?? null,
    moderator: session.moderator?.name ?? null,
    experts: Array.isArray(session.experts)
      ? session.experts.map(expert => ({ id: expert.id, name: expert.name }))
      : [],
    history: Array.isArray(session.history) ? session.history.map(item => ({
      role: item.role,
      name: item.name ?? null,
      content: item.content,
    })) : [],
    archivedAt: new Date().toISOString(),
  };
  try {
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    archived.add(session.id);
  } catch {}
}
