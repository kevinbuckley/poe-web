export type ProviderType = 'openai';
export interface ExpertAgentConfig { id: string; name: string; provider: ProviderType; model: string; persona: string; color?: string; }
export interface ModeratorConfig { id: string; name: string; provider: ProviderType; model: string; systemPrompt: string; }
export interface ConversationSession { id: string; title: string; experts: ExpertAgentConfig[]; moderator: ModeratorConfig; autoDiscuss: boolean; history: {role:'user'|'assistant'|'system'|'expert'|'moderator'; content:string; name?:string}[]; }
