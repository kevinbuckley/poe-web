export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { createProvider } from '../../../../lib/providers';

type PersonaSuggestionPayload = {
  topic?: string;
  slot?: number;
  existingExperts?: { name?: string; persona?: string }[];
  salt?: number;
  experts?: { name?: string; persona?: string }[];
};

type LlmSuggestion = {
  id?: string;
  label?: string;
  name?: string;
  origin?: string;
  persona?: string;
};

const SINGLE_SYSTEM_PROMPT = `You help product teams cast fictional expert personas for a round-table discussion.
Always respond with a JSON array of exactly 8 objects.
Each object must have keys: "label" (short name), "origin" (short descriptor), and "persona" (<=240 characters describing their voice).
Avoid repeating existing experts. Keep tones diverse and specific.`;

const PANEL_SYSTEM_PROMPT = `You help product teams cast fictional expert personas for a three-seat round-table.
Given the roster, return a JSON object with keys "slot_0", "slot_1", and "slot_2" (omit extras if fewer seats).
Each key maps to an array of exactly 8 objects with keys "label", "origin", and "persona" (<=240 characters) describing tailored personas for that seat.
Ensure names do not duplicate provided experts or repeat across slots. Keep styles complementary and specific.`;

const buildSinglePrompt = (body: PersonaSuggestionPayload) => {
  const topic = (body.topic || '').trim();
  const slotIndex = typeof body.slot === 'number' ? body.slot : 0;
  const existingList = Array.isArray(body.existingExperts)
    ? body.existingExperts
        .map((expert, idx) => {
          const name = (expert?.name || '').trim() || `Expert ${idx + 1}`;
          const persona = (expert?.persona || '').trim() || 'No persona provided.';
          return `- ${name}: ${persona}`;
        })
        .join('\n')
    : 'None provided.';
  const salt = typeof body.salt === 'number' ? body.salt : Math.floor(Math.random() * 1e6);
  return `Panel topic: ${topic || 'General strategy'}
Requested seat index (zero-based): ${slotIndex}
Existing experts:\n${existingList}
Randomizer: ${salt}
Return 8 fresh persona candidates that complement this lineup.`;
};

const normaliseSingleResponse = (raw: string) => {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('[');
  const jsonEnd = trimmed.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error('Missing JSON array in response.');
  const jsonSlice = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(jsonSlice);
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array.');
  return parsed
    .map((item, idx) => ({
      id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `llm-expert-${idx}`,
      label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Persona ${idx + 1}`,
      origin: typeof item?.origin === 'string' && item.origin.trim() ? item.origin.trim() : 'LLM generated',
      persona: typeof item?.persona === 'string' && item.persona.trim() ? item.persona.trim() : 'Offers a distinctive viewpoint to round out the panel.',
    }))
    .slice(0, 8);
};

const buildPanelPrompt = (topic: string, experts: { name?: string; persona?: string }[]) => {
  const seatLines = experts
    .map((expert, idx) => {
      const name = (expert?.name || '').trim() || `Expert ${idx + 1}`;
      const persona = (expert?.persona || '').trim() || 'No persona provided.';
      return `Seat ${idx}: ${name} — ${persona}`;
    })
    .join('\n');
  return `Panel topic: ${topic || 'General strategy'}
Current roster:\n${seatLines}
For each seat index, craft 8 new persona candidates that round out the lineup.
Return a JSON object with keys slot_0, slot_1, slot_2 (omit if seat missing).`;
};

const normalisePanelResponse = (raw: string, seats: number) => {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error('Missing JSON object in response.');
  const jsonSlice = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
  const result: unknown[] = [];
  for (let idx = 0; idx < seats; idx++){
    const keysToTry = [`slot_${idx}`, `seat_${idx}`, String(idx)];
    let value: unknown;
    for (const key of keysToTry){
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, key)){
        value = (parsed as Record<string, unknown>)[key];
        break;
      }
    }
    if (!Array.isArray(value)){
      throw new Error(`Missing array for slot ${idx}`);
    }
    result[idx] = value.slice(0, 8);
  }
  return result as LlmSuggestion[][];
};

export async function POST(req: NextRequest){
  try{
    const body = (await req.json().catch(() => ({}))) as PersonaSuggestionPayload;
    const provider = createProvider();

    if (Array.isArray(body.experts) && body.experts.length){
      const topic = (body.topic || '').trim();
      const roster = body.experts;
      const seatCount = Math.max(Math.min(roster.length, 3), 1);
      const userPrompt = buildPanelPrompt(topic, roster);
      const response = await provider.chat([
        { role: 'system', content: PANEL_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ]);
      const llmSuggestions = normalisePanelResponse(response, seatCount);
      const suggestionsBySlot: Record<number, unknown> = {};
      llmSuggestions.forEach((list, idx) => {
        suggestionsBySlot[idx] = list.map((item, suggestionIdx) => ({
          id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `llm-expert-${idx}-${suggestionIdx}`,
          label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Persona ${suggestionIdx + 1}`,
          origin: typeof item?.origin === 'string' && item.origin.trim() ? item.origin.trim() : 'LLM generated',
          persona: typeof item?.persona === 'string' && item.persona.trim() ? item.persona.trim() : 'Offers a distinctive viewpoint to round out the panel.',
        }));
      });
      return Response.json({ suggestionsBySlot });
    }

    const userPrompt = buildSinglePrompt(body);
    const response = await provider.chat([
      { role: 'system', content: SINGLE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);
    const suggestions = normaliseSingleResponse(response);
    return Response.json({ suggestions });
  } catch (error){
    const message = error instanceof Error ? error.message : 'Failed to generate suggestions.';
    return Response.json({ error: message }, { status: 500 });
  }
}
