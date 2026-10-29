export class AiFailure extends Error {
  constructor(readonly code: 'provider_unavailable' | 'invalid_output') {
    super(code);
  }
}
