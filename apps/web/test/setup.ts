import "@testing-library/jest-dom/vitest";

// RTK Query builds Request objects with an AbortSignal. In jsdom tests, signal instances can
// come from a different implementation than Node's undici Request expects, so normalize it.
const NativeRequest = globalThis.Request;

if (NativeRequest) {
  class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const normalizedInput =
        typeof input === "string" && input.startsWith("/")
          ? new URL(input, window.location.origin).toString()
          : input;
      const normalizedInit = init ? { ...init, signal: undefined } : init;
      super(normalizedInput, normalizedInit);
    }
  }

  globalThis.Request = TestRequest;
}
