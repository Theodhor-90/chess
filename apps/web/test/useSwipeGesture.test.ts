import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useSwipeGesture } from "../src/hooks/useSwipeGesture.js";

function createPointerEvent(type: string, props: Partial<PointerEvent> = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    clientX: 0,
    clientY: 0,
    ...props,
  });
}

describe("useSwipeGesture", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement("div");
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
  });

  function renderSwipeHook(callbacks: { onSwipeLeft?: () => void; onSwipeRight?: () => void }) {
    return renderHook(() => {
      const ref = useRef<HTMLElement>(element);
      useSwipeGesture(ref, callbacks);
    });
  }

  it("calls onSwipeLeft when swiping left past threshold", () => {
    const onSwipeLeft = vi.fn();
    renderSwipeHook({ onSwipeLeft });

    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 60, clientY: 100 }));

    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it("calls onSwipeRight when swiping right past threshold", () => {
    const onSwipeRight = vi.fn();
    renderSwipeHook({ onSwipeRight });

    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 140, clientY: 100 }));

    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it("does not fire when horizontal distance is below threshold", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    renderSwipeHook({ onSwipeLeft, onSwipeRight });

    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 80, clientY: 100 }));

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("does not fire when vertical deviation exceeds threshold", () => {
    const onSwipeLeft = vi.fn();
    renderSwipeHook({ onSwipeLeft });

    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 60, clientY: 140 }));

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("fires only once per gesture (swiped ref prevents duplicates)", () => {
    const onSwipeLeft = vi.fn();
    renderSwipeHook({ onSwipeLeft });

    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 60, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 30, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 0, clientY: 100 }));

    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it("allows new gesture after pointerup", () => {
    const onSwipeLeft = vi.fn();
    renderSwipeHook({ onSwipeLeft });

    // First gesture
    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 60, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointerup"));

    // Second gesture
    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 160, clientY: 100 }));

    expect(onSwipeLeft).toHaveBeenCalledTimes(2);
  });

  it("resets state on pointercancel", () => {
    const onSwipeLeft = vi.fn();
    renderSwipeHook({ onSwipeLeft });

    element.dispatchEvent(createPointerEvent("pointerdown", { clientX: 100, clientY: 100 }));
    element.dispatchEvent(createPointerEvent("pointercancel"));
    element.dispatchEvent(createPointerEvent("pointermove", { clientX: 60, clientY: 100 }));

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("ignores non-primary pointer events", () => {
    const onSwipeLeft = vi.fn();
    renderSwipeHook({ onSwipeLeft });

    element.dispatchEvent(
      createPointerEvent("pointerdown", { clientX: 100, clientY: 100, isPrimary: false }),
    );
    element.dispatchEvent(
      createPointerEvent("pointermove", { clientX: 60, clientY: 100, isPrimary: false }),
    );

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
