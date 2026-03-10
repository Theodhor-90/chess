export type AnalysisErrorCode = "ANALYSIS_NOT_FOUND";

export class AnalysisError extends Error {
  public readonly code: AnalysisErrorCode;

  constructor(code: AnalysisErrorCode, message: string) {
    super(message);
    this.name = "AnalysisError";
    this.code = code;
  }
}

export const ANALYSIS_ERROR_STATUS_MAP: Record<AnalysisErrorCode, number> = {
  ANALYSIS_NOT_FOUND: 404,
};
