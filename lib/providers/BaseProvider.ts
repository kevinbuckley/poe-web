export abstract class BaseProvider {
  protected apiKey: string;
  protected defaultModel: string;
  constructor(apiKey: string, defaultModel: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }
}
