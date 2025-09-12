import { ConversationSession } from '../types';
import { OpenAIProvider } from '../providers/OpenAIProvider';

export class ConversationOrchestrator {
  private session: ConversationSession;
  private provider: OpenAIProvider;
  constructor(session: ConversationSession, provider: OpenAIProvider){
    this.session = session;
    this.provider = provider;
  }
  getSession(){ return this.session; }
}
